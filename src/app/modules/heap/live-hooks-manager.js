import DebuggerStateMachine from "#src/app/debugger-state-machine.js";


class LiveHooksManager extends DebuggerStateMachine {
  constructor(dbg, events) {
    super(dbg);
    this.events = events;
    this.state = null;
    this.states = {
      idle: "IDLE",
      running: "RUNNING",
      error: "ERROR",
    };
    this.debugLog = false;
    this.init();
  }

  init() {
    this.resetLock();
    this.registeredHooks = [];
    this.activeHooks = new Map();
    this.state = this.states.idle;
  }

  log = (msg) => {
    if (this.debugLog) {
      console.log(msg);
    }
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

  getFunctionId = (frame) => {
    const scLoc = frame.scopeChain.find(s => s.type === "local" && s.startLocation);
    let r = "";
    let locObj = null;
    if (scLoc) {
      r = scLoc.name || "";
      if (scLoc.endLocation) {
        r += `|${scLoc.endLocation.lineNumber}|${scLoc.endLocation.columnNumber}`;
      }
      locObj = scLoc.startLocation;
    } else {
      if (frame.functionLocation) {
        locObj = frame.functionLocation;
      }
    }
    if (locObj === null) {
      throw new Error("Unable to get function ID");
    }
    return `${r}|${locObj.scriptId}|${locObj.lineNumber}|${locObj.columnNumber}`;
  }

  getBreakPointIdFromEvent = (event) => {
    for (const bid of event.hitBreakpoints) {
      if (this.activeHooks.has(bid)) {
        return bid;
      }
    }
  }

  onPaused = async (event) => {
    const curFrame = event.callFrames[0];
    const bid = this.getBreakPointIdFromEvent(event);
    if (!bid) {
      return;
    }
    const hook = this.activeHooks.get(bid);
    const hookName = `${hook.file}:${hook.line}:${hook.col}`;
    if (hook.condition) {
      const w = await this.dbg.evaluateOnCallFrame(curFrame.callFrameId, `(${hook.condition})`, true);
      if (!w.value) {
        return;
      }
    }

    if (hook.hookType === "return") {
      if (!curFrame.returnValue) {
        this.emit("error", {
          message: `${hookName} is not a return point`
        });
        return;
      }

      if (curFrame.returnValue.subtype === 'promise') {
        this.emit("warn", {
          message: `${hookName} returns a Promise and cannot override return value`
        });
        return;
      }

      await this.dbg.setReturnValue(curFrame, hook.returnExpr);

    } else if (hook.hookType === "inject") {
      await this.dbg.evaluateOnCallFrame(curFrame.callFrameId, hook.code);
    }
    await this.dbg.resume();
  };

  getHookLocation = (hook) => {
    return `${hook.file}:${hook.line}:${hook.col}`;
  };

  start = async () => {
    if(this.state !== this.states.idle){
      throw new Error("Live Hooks already running");
    }
    this.startTime = Date.now();
    this.state = this.states.running;
    await this.dbg.enable();
    for (const h of this.registeredHooks) {
      let line = h.line;
      let col = h.col;
      if (h.hookType === "return") {
        const sid = this.dbg.getScriptId(h.file);
        if (!sid) {
          throw new Error(`File '${h.file}': script not parsed`);  // @TODO: really?
        }
        const bps = await this.dbg.getPossibleBreakpointsOnFunction(sid, h.line, h.col);
        const closestReturn = bps.find(b => b.type === 'return');
        if (!closestReturn) {
          throw new Error(`Cannot find return point at ${this.getHookLocation(h)}`)
        }
        line = closestReturn.lineNumber;
        col = closestReturn.columnNumber;
      }
      const breakpointId = await this.dbg.setBreakpointByUrl(h.file, line, col);
      this.activeHooks.set(breakpointId, h);
      this.emit("log", {message: `Hook ${this.getHookLocation(h)} activated at line ${line}, col ${col}`});
    }
    this.emit("log", {message: `Hooks armed`});
  };

  addLiveHook = (hookDef) => {
    if (hookDef.hookType && !["return", "inject"].includes(hookDef.hookType)) {
      throw new Error(`Invalid hookType '${hookDef.hookType}'`);
    }
    const hookType = hookDef.hookType || "inject";

    if (hookType === "inject" && !hookDef.code) {
      throw new Error("'code' is required");
    }
    if (hookType === "return" && !hookDef.returnExpr) {
      throw new Error("'returnExpr' is required");
    }
    const hook = {
      ...hookDef,
      hookType,
      col: hookDef.col - 1,
      line: hookDef.line - 1,
    };
    this.registeredHooks.push(hook);
    this.emit("log", {message: `Hook registered at ${this.getHookLocation(hook)}`});
  }

  stop = async () => {
    for (const [k, v] of this.activeHooks) {
      await this.dbg.removeBreakpoint(k);
    }
    this.init();
    await this.dbg.disable();
    this.emit("log", {message: `Hooks disarmed`});
  }
}

export default LiveHooksManager;
