import { tagInternalSource } from "#src/common/utils.js";
import DebuggerStateMachine from "#src/app/debugger-state-machine.js";

// `arm` decides which pause starts the scan:
//   { type: "click" }  the next DOM click (default). The scan starts from the
//                      user-land handler when a framework one is found.
//   { type: "breakpoint", file, line, col?, condition? }
//                      the first hit of a breakpoint at that location
//                      (1-based, document-relative, like hooks). The scan
//                      starts from the paused frame.
class BDHSExecutor extends DebuggerStateMachine{
  constructor(dbg, toleranceWin, searchFn, events, arm = { type: "click" }) {
    super(dbg);
    this.searchFn = searchFn;
    this.events = events;
    this.arm = arm;
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
    this.toleranceWin = toleranceWin || [6, 15];
    this.debugLog = false;
    this.init();
  }

  init() {
    this.resetLock();
    this.interval = null;
    this.stackHistory = [];
    this.breakpointId = null;
    this.armBreakpointId = null;
    this.stepPending = false;
    this.clearingStep = null;
    this.step = 0;
    this.idleCnt = 0;
    this.lastFrame = null;
    this.firstMatchIdx = null;
  }

  log = (msg) => {
    if (this.debugLog) {
      console.log(msg);
    }
  }

  onError = (err) => {
    console.error("[BDHS LOCK ERROR]", err);
    this.state = this.states.error;
  }

  emit = (evName, data) => {
    if (this.state === null) {
      return;
    }
    this.log(`${this.step}: ${evName}`);
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

    const evTarget = await this.dbg.evaluateOnCallFrame(frameId, "event.target");
    if (!evTarget?.objectId) {
      return null;
    }
    this.log(`Found real handler: ${evTarget.objectId}`)
    const handler = await this.dbg.client.send("Runtime.callFunctionOn", {  // @TODO move to debugegr.js
      objectId: evTarget.objectId,
      functionDeclaration: tagInternalSource(fnToEval.toString()),
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
    // The value was already in the heap at the first pause: the trace cannot
    // see where it was created (arm earlier, or reload the page first).
    const result = { matchResult, matchAtStart: this.firstMatchIdx === 0, results: [] };
    let stopAt = Math.max(
      this.stackHistory.length - (this.toleranceWin[0] + this.toleranceWin[1] + 1),
      0
    );

    for (let i = this.stackHistory.length - 1; i >= stopAt; i--) {
      const res = await this.getFrameData(this.stackHistory[i].callFrames[0]);
      const isFirstMatch = this.firstMatchIdx === i;
      const existing = result.results.find(r =>
        r.lineNumber == res.lineNumber && r.columnNumber == res.columnNumber && r.file == res.file
      );
      if (!existing) {
        result.results.push({
          isFirstMatch,
          heapSnapshot: this.stackHistory[i].searchResult,
          ...res
        });
      } else if (isFirstMatch) {
        // A later step in the same function was already listed (the loop walks
        // backwards): mark it as the first match instead of dropping the flag.
        existing.isFirstMatch = true;
        existing.heapSnapshot = this.stackHistory[i].searchResult;
      }
    }
    return result;
  }

  onPaused = async (event) => {
    // this.withLock(async () => {
      this.stepPending = false;
      if (this.clearingStep) {
        await this.dbg.resume();
        this.clearingStep();
        return;
      }
      if (this.state === this.states.aborted) {
        return;
      }
      let searchResult;
      const curFrame = event.callFrames[0];
      this.lastFrame = curFrame;
      this.step++;
      switch (this.state) {
        case this.states.armed:
          if (!await this.onTriggered(event)) {
            return;
          }
        // intentional fall-through (no break here!)
        case this.states.idle:
          this.state = this.states.running;
          this.idleCnt = 0;
          if (this.step > this.maxSteps) {
            this.emit("maxReached", {});
            this.state = this.states.error;
            await this.onScanCompleted();
            return;
          }
          searchResult = await this.searchFn();
          this.stackHistory.push({
            callFrames: event.callFrames,
            searchResult
          });

          if (this.firstMatchIdx !== null && searchResult.length == 0) {
            this.emit("found", await this.getResult());
            await this.onScanCompleted();
            return;
          }
          if (searchResult.length > 0) {
            if (this.firstMatchIdx === null) {
              this.firstMatchIdx = this.stackHistory.length - 1;
              this.emit("progress", { matchFound: true, matchAtStart: this.firstMatchIdx === 0 });
            } else {
              if (this.stackHistory.length - this.firstMatchIdx <= this.toleranceWin[1] + 1) {
                this.log(`Finalising step ${this.stackHistory.length - this.firstMatchIdx}`);
                this.emit("progress", { finalising: true });
              } else {
                this.state = this.states.found;
                this.emit("found", await this.getResult());
                await this.onScanCompleted();
                return;
              }
            }
          } else {
            this.emit("progress", {});
          }
          if (this.state === this.states.running) {
            this.state = this.states.idle;
            await this.dbg.stepOut();
            this.stepPending = true;
          }
          break;
      }
    // });
  };

  // Called on the first pause while armed. Returns true when the scan must
  // start from this pause, false when the debugger has already been resumed
  // (pause ignored, or the scan restarts from the user-land handler).
  onTriggered = async (event) => {
    if (this.arm.type === "breakpoint") {
      if (!(event.hitBreakpoints || []).includes(this.armBreakpointId)) {
        // Not our breakpoint (e.g. a `debugger` statement): stay armed
        this.step--;
        await this.dbg.resume();
        return false;
      }
      this.emit("started", {});
      this.state = this.states.idle;
      await this.disarm();
      return true;
    }

    this.emit("started", {});
    this.state = this.states.idle;
    await this.disarm();
    const handlerObjectId = await this.getUserlandEventHandler(event.callFrames[0].callFrameId);
    if (handlerObjectId) {
      this.breakpointId = await this.dbg.setBreakpointOnFunctionCall(handlerObjectId);
      await this.dbg.resume();
      return false;
    }
    return true;
  };

  // Installs what makes the first pause happen. Returns the data sent with
  // the "armed" event.
  installArm = async () => {
    if (this.arm.type === "breakpoint") {
      const { file, line, col = 1, condition } = this.arm;
      const { breakpointId, locations } = await this.dbg.setBreakpointByUrlWithLocations(
        file, line - 1, col - 1, condition
      );
      this.armBreakpointId = breakpointId;
      return {
        arm: {
          type: "breakpoint", file, line, col, condition,
          // Where CDP actually placed it (empty until the script is parsed)
          resolvedLocations: locations.map(l => ({ line: l.lineNumber + 1, col: l.columnNumber + 1 })),
        }
      };
    }
    await this.dbg.setDOMClickBreakpoint(true);
    return { arm: { type: "click" } };
  };

  disarm = async () => {
    if (this.arm.type === "breakpoint") {
      if (this.armBreakpointId !== null) {
        const id = this.armBreakpointId;
        this.armBreakpointId = null;
        await this.dbg.removeBreakpoint(id);
      }
      return;
    }
    await this.dbg.setDOMClickBreakpoint(false);
  };

  start = async () => {
    this.startTime = Date.now();
    this.state = this.states.armed;
    this.step = 0;
    this.idleCnt = 0;
    this.init();
    let armedData;
    try {
      armedData = await this.installArm();
    } catch (e) {
      this.state = null;
      try {
        await this.dbg.disable();
      } catch { /* already disabled */ }
      throw e;
    }
    clearInterval(this.interval);
    this.interval = setInterval(async () => {
      if (this.state !== this.states.idle) {
        this.idleCnt = 0;
        return;
      }
      if (this.idleCnt === 4) {
        this.log("Terminated by timeout")
        // Try to perform another search
        const searchResult = await this.searchFn();
        if (searchResult.length > 0) {
          this.state = this.states.found;
          this.emit("found", await this.getResult());
        } else {
          this.state = this.states.notfound;
          this.emit("notfound", {});
        }
        clearInterval(this.interval);
        await this.onScanCompleted();
      }

      this.idleCnt++;
    }, 500);
    this.emit("armed", armedData);
  };

  // "completed" is emitted only once the debugger is actually disabled, so
  // that callers can immediately start another debugger session.
  // A stepOut from the outermost frame stays pending in V8 until some JS runs,
  // and it outlives Debugger.disable: it would silently swallow the
  // breakpoints of the next debugger session on the page (hooks, another
  // trace). Pausing and resuming once clears it.
  clearPendingStep = async () => {
    const cleared = new Promise((resolve) => {
      this.clearingStep = resolve;
    });
    try {
      await this.dbg.client.send("Debugger.pause");
      // Run some JS so that the pause request is served
      const evaluation = this.dbg.client.send("Runtime.evaluate", {
        expression: tagInternalSource("0")
      }).catch(() => { });
      await Promise.race([cleared, new Promise(r => setTimeout(r, 1000))]);
      await Promise.race([evaluation, new Promise(r => setTimeout(r, 1000))]);
    } catch { /* debugger may already be gone */ } finally {
      this.clearingStep = null;
    }
  };

  onScanCompleted = async () => {
    clearInterval(this.interval);
    if (this.stepPending) {
      await this.clearPendingStep();
    }
    if (this.breakpointId !== null) {
      try {
        await this.dbg.removeBreakpoint(this.breakpointId);
      } catch { /* already gone */ }
    }
    try {
      await this.dbg.disable();
    } catch { /* already disabled */ }
    this.emit("completed", {
      scanTime: Date.now() - this.startTime
    });
    this.state = null;
  };

  abort = async () => {
    clearInterval(this.interval);
    const wasArmed = this.state === this.states.armed;
    this.state = this.states.aborted;
    if (wasArmed) {
      // Aborted before the trigger: the arm breakpoint is still set
      try {
        await this.disarm();
      } catch { /* debugger may already be gone */ }
    }
    try {
      await this.dbg.resume();
    } catch { }
    this.emit("aborted", {});
    await this.onScanCompleted();
  };
}

export default BDHSExecutor;