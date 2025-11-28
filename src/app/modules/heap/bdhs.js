
class BDHSExecutor {
  constructor(dbg, searchFn, events) {
    this.dbg = dbg;
    this.searchFn = searchFn;
    this.events = events;
    this.state = null;
    this.startTime = null;
    this.step = 0;
    this.idleCnt = 0;
    this.states = {
      idle: "IDLE",
      armed: "ARMED",
      running: "RUNNING",
      paused: "PAUSED",
      found: "FOUND",
      notfound: "NOTFOUND",
      aborted: "ABORTED",
      // aborting: "ABORTING",
      error: "ERROR",
    }
    this.lock = Promise.resolve();
    this.interval = null;
    this.maxSteps = 5000;
    this.stackHistory = [];
  }

  // Ensures all BDHS operations run sequentially.
  // CDP events may arrive while an async step is still running, which could
  // cause overlapping scans, duplicate stepping, or corrupted state.
  //
  // `withLock()` serializes all operations by chaining them onto a shared
  // promise (`this.lock`). Each task waits for the previous one to finish,
  // guaranteeing strict FIFO order and preventing race conditions.
  //
  // If an error occurs inside the task, it is caught so the chain is never
  // broken (the lock remains alive).
  withLock = (fn) => {
    this.lock = this.lock
      .then(() => Promise.resolve().then(fn))
      .catch((err) => {
        console.error("[BDHS LOCK ERROR]", err);
        this.state = this.states.error;

        // Reset the chain to avoid deadlock
        this.lock = Promise.resolve();
      });

    return this.lock;
  };

  emit = (evName, data) => {
    if (this.state === null) {
      return;
    }
    console.log(`${this.step}: ${evName}`);
    if (evName in this.events) {
      this.events[evName]({
        ...data,
        currentStep: this.step,
        currentStatus: this.state
      });
    }
  };

  onPaused = (event) => {
    this.withLock(async () => {
      if (this.state === this.states.aborted) {
        return;
      }
      let searchRes;
      this.step++;
      switch (this.state) {
        case this.states.armed:
          this.emit("started", {});
          this.state = this.states.idle;
          await this.dbg.setDOMClickBreakpoint(false);
        // intentional fall-through (no break here!)
        case this.states.idle:
          this.state = this.states.running;
          this.idleCnt = 0;
          if (this.step > this.maxSteps) {
            this.emit("maxReached", {});
            this.state = this.states.error;
            return;
          }
          searchRes = await this.searchFn();
          this.stackHistory.push(event.callFrames);
          if (searchRes.length > 0) {
            this.state = this.states.found;
            this.dbg.resume();
            const frame = this.getOriginFrame();
            const scriptId = frame?.functionLocation?.scriptId ?? frame?.location?.scriptId;
            const lineNumber = frame?.functionLocation?.lineNumber ?? frame?.location?.lineNumber;
            const columnNumber = frame?.functionLocation?.columnNumber ?? frame?.location?.columnNumber;
            const functionName = frame?.functionName || "";
            const scriptSource = scriptId && await this.dbg.getScriptSource(scriptId);
            this.emit("found", {
              matchResult: searchRes[0],
              location: { functionName, lineNumber, columnNumber },
              scriptSource,
              scriptId
            });
            this.onScanCompleted();
            return;
          } else {
            this.emit("progress", {})
          }
          if (this.state === this.states.running) {
            this.state = this.states.idle;
            await this.dbg.stepOut();
          }
          break;
      }
    });
  };

  getOriginFrame = () => {
    const hl = this.stackHistory.length;
    if(hl === 0){
      throw new Error("Stack history is empty");
    }
    const after = this.stackHistory[hl - 1];
    if (hl > 1) {
      const before = this.stackHistory[hl - 2];
      const afterIds = after.map(f => f.callFrameId);
      let deepestRemovedFrame = null;
      for (const f of before) {
        if (!afterIds.includes(f.callFrameId)) {
          deepestRemovedFrame = f;
        }
      }
      if (deepestRemovedFrame) {
        return deepestRemovedFrame;
      }
    }
    return after[0];
  }

  start = async () => {
    this.lock = Promise.resolve();
    this.startTime = Date.now();
    this.stackHistory = [];
    this.state = this.states.armed;
    this.step = 0;
    this.idleCnt = 0;
    this.dbg.on("paused", this.onPaused);
    await this.dbg.setDOMClickBreakpoint(true);
    clearInterval(this.interval);
    this.interval = setInterval(() => {
      if (this.state !== this.states.idle) {
        this.idleCnt = 0;
        return;
      }
      if (this.idleCnt === 4) {
        this.state = this.states.notfound;
        this.emit("notfound", { location: null });
        clearInterval(this.interval);
        this.onScanCompleted();
      }

      this.idleCnt++;
    }, 500);
    this.emit("armed", {})
  };

  onScanCompleted = () => {
    this.dbg.disable();
    this.emit("completed", {
      scanTime: Date.now() - this.startTime
    });
    this.state = null;
  };

  abort = async () => {
    clearInterval(this.interval);
    this.state = this.states.aborted;
    try {
      await this.dbg.resume();
    } catch { }
    this.emit("aborted", {});
    this.onScanCompleted();
  };
}

export default BDHSExecutor;