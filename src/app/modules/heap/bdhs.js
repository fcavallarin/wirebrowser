
class BDHSExecutor {
  constructor(dbg, searchFn, events) {
    this.dbg = dbg;
    this.searchFn = searchFn;
    this.events = events;
    this.state = null;
    this.startTime = null;
    this.maxSteps = 5000;
    this.states = {
      idle: "IDLE",
      armed: "ARMED",
      running: "RUNNING",
      paused: "PAUSED",
      found: "FOUND",
      notfound: "NOTFOUND",
      aborted: "ABORTED",
      error: "ERROR",
      finlising: "FINALISING"
    }
    this.init();
  }

  init() {
    this.lock = Promise.resolve();
    this.interval = null;
    this.stackHistory = [];  // Just for debugging
    this.breakpointId = null;
    this.step = 0;
    this.idleCnt = 0;
    this.lastFrame = null;
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

  // setBreakpointOnAllScripts = async () => {
  //   for (const s of this.dbg.getParsedScripts()) {
  //     console.log(`Set brakpoint at ${s.scriptId}`)
  //     this.dbg.setBreakpointOnFirstInstruction(s.scriptId);
  //   }
  // }

  getUserlandEventHandler = async (frameId) => {

    // No arrow function!
    function fnToEval() {
      const element = this;

      function findUserlandHandler(el) {
        const props = Object.getOwnPropertyNames(el);

        // 1. React
        const reactPropsKey = props.find(k => k.startsWith("__reactProps$"));
        if (reactPropsKey && el[reactPropsKey]?.onClick) {
          return el[reactPropsKey].onClick;
        }

        // 2. Vue 3
        if (el.__vnode?.props?.onClick) {
          return el.__vnode.props.onClick;
        }

        // 3. Vue 2
        if (el.__vue__?.$listeners?.click) {
          return el.__vue__.$listeners.click;
        }

        // 4. Alpine.js
        if (el.__x && el.__x.$data) {
          const on = el.__x._x_on;
          if (Array.isArray(on)) {
            for (const h of on) {
              if (h.type === "click") {
                return h.value;
              }
            }
          }
        }

        return null;
      }
      return findUserlandHandler(element);
    }

    const evTarget = await this.dbg.evaluateOnCallFrame(frameId, "event.target")
    if (!evTarget?.objectId) {
      return null;
    }
    console.log(`---> Found real handler: ${evTarget.objectId}`)
    const handler = await this.dbg.client.send("Runtime.callFunctionOn", {
      objectId: evTarget.objectId,
      functionDeclaration: fnToEval.toString(),
      returnByValue: false
    });
    return handler?.result?.objectId;
  }


  getFrameData = async (frame) => {
    const scriptId = frame?.functionLocation?.scriptId ?? frame.location.scriptId;
    const lineNumber = (frame?.functionLocation?.lineNumber ?? frame.location.lineNumber) + 1;
    const columnNumber = (frame?.functionLocation?.columnNumber ?? frame.location.columnNumber) + 1;
    const functionName = frame?.functionName || "";
    const scriptSource = scriptId && await this.dbg.getScriptSource(scriptId);
    const file = scriptId && this.dbg.getScriptUrl(scriptId);
    return {
      functionName, lineNumber, columnNumber,
      scriptSource, scriptId, file
    };
  }

  getResult = async (matchResult) => {
    const result = { matchResult, results: [] };
    let stopAt = Math.max(this.stackHistory.length - 6, 0);
    for (let i = this.stackHistory.length - 1; i >= stopAt; i--) {
      const res = await this.getFrameData(this.stackHistory[i][0]);
      if (!result.results.find(r =>
        r.lineNumber == res.lineNumber && r.columnNumber == res.columnNumber && r.file == res.file
      )) {
        result.results.push(res);
      }
    }
    return result;
  }

  onPaused = (event) => {
    this.withLock(async () => {
      if (this.state === this.states.aborted) {
        return;
      }
      let searchRes;
      const curFrame = event.callFrames[0];
      this.lastFrame = curFrame;
      this.step++;
      switch (this.state) {
        case this.states.armed:
          this.emit("started", {});
          this.state = this.states.idle;
          await this.dbg.setDOMClickBreakpoint(false);

          const handlerObjectId = await this.getUserlandEventHandler(curFrame.callFrameId);
          if (handlerObjectId) {
            this.breakpointId = await this.dbg.setBreakpointOnFunctionCall(handlerObjectId);
            await this.dbg.resume();
            this.state = this.states.idle;
            return;
          }
        // intentional fall-through (no break here!)
        case this.states.idle:
          this.state = this.states.running;
          this.idleCnt = 0;
          if (this.step > this.maxSteps) {
            this.emit("maxReached", {});
            this.state = this.states.error;
            this.onScanCompleted();
            return;
          }
          searchRes = await this.searchFn();
          this.stackHistory.push(event.callFrames);
          if (searchRes.length > 0) {
            this.state = this.states.found;
            // const frmData = await this.getFrameData(curFrame);
            // this.emit("found", { ...frmData, matchResult: searchRes[0] });
            this.emit("found", await this.getResult());
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

  start = async () => {
    this.startTime = Date.now();
    this.state = this.states.armed;
    this.step = 0;
    this.idleCnt = 0;
    this.init();
    this.dbg.on("paused", this.onPaused);
    await this.dbg.setDOMClickBreakpoint(true);
    clearInterval(this.interval);
    this.interval = setInterval(async () => {
      if (this.state !== this.states.idle) {
        this.idleCnt = 0;
        return;
      }
      if (this.idleCnt === 4) {
        // Try to perform another search
        const searchRes = await this.searchFn();
        if (searchRes.length > 0) {
          this.state = this.states.found;
          this.emit("found", await this.getResult());
        } else {
          this.state = this.states.notfound;
          this.emit("notfound", {});
        }
        clearInterval(this.interval);
        this.onScanCompleted();
      }

      this.idleCnt++;
    }, 500);
    this.emit("armed", {})
  };

  onScanCompleted = () => {
    if (this.breakpointId !== null) {
      this.dbg.removeBreakpoint(this.breakpointId);
    }
    this.dbg.disable();
    this.emit("completed", {
      scanTime: Date.now() - this.startTime
    });
    this.state = null;
    clearInterval(this.interval);
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