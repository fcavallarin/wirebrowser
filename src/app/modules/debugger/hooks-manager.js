import DebuggerStateMachine from "#src/app/debugger-state-machine.js";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { parse as looseParse } from "acorn-loose";

class HooksManager extends DebuggerStateMachine {
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
    this.registeredHooks = new Map();
    this.activeHookPoints = new Map();
    this.state = this.states.idle;
    this.step = 0;
    this.continuationPoints = [];
  }

  onError = (e) => {
    throw new Error(e);
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

  // @TODO: move outside
  findFunctionAt(code, line, col) {

    function parseJsRobust(code) {
      const baseOptions = {
        ecmaVersion: "latest",
        locations: true,
        allowHashBang: true,
      };

      try {
        return acorn.parse(code, {
          ...baseOptions,
          sourceType: "module",
        });
      } catch { }

      try {
        return acorn.parse(code, {
          ...baseOptions,
          sourceType: "script",
        });
      } catch { }

      // Last resort: error-tolerant parser
      return looseParse(code, baseOptions);
    }

    const ast = parseJsRobust(code);

    // Convert the incoming 1-based column to Acorn's 0-based column format.
    const target = {
      line: line,
      column: col - 1,
    };

    let best = null;

    function isFunctionNode(node) {
      return (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression"
      );
    }

    function containsPosition(node) {
      const start = node.loc.start;
      const end = node.loc.end;

      // Reject if the target line is outside the node range.
      if (target.line < start.line || target.line > end.line) {
        return false;
      }

      // Reject if the target is before the start position on the same line.
      if (target.line === start.line && target.column < start.column) {
        return false;
      }

      // Reject if the target is after the end position on the same line.
      if (target.line === end.line && target.column > end.column) {
        return false;
      }

      return true;
    }

    walk.full(ast, (node) => {
      if (!isFunctionNode(node)) {
        return;
      }

      if (!containsPosition(node)) {
        return;
      }

      // Keep the innermost matching function.
      if (!best || (node.start >= best.start && node.end <= best.end)) {
        best = node;
      }
    });

    if (!best) {
      return null;
    }
    return code.slice(best.start, best.end);
  }

  getHookPointFromEvent = (event) => {
    for (const bid of event.hitBreakpoints) {
      if (this.activeHookPoints.has(bid)) {
        return this.activeHookPoints.get(bid);
      }
    }
  }

  // Trails is an array of "scriptId:line:col"
  getContinuationPoint(trails) {

    // Returns the length of the longest common consecutive sequence of frames
    // shared by the two trails, even if it appears at different positions.
    const getBaseScore = (a, b) => {
      let best = 0;
      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
          let k = 0;
          while (
            i + k < a.length &&
            j + k < b.length &&
            a[i + k] === b[j + k]
          ) {
            k++;
          }
          if (k > best) {
            best = k;
          }
        }
      }
      return best;
    };

    let candidate = null;
    const points = [];

    for (let idx = 0; idx < this.continuationPoints.length; idx++) {
      const cp = this.continuationPoints[idx];

      const baseScore = getBaseScore(cp.trails, trails);
      if (baseScore === 0) {
        continue;
      }

      const p = {
        point: cp,
        baseScore,
        score: baseScore,
        temporalDistance: this.step - cp.step,
        index: idx
      };

      if (p.temporalDistance === 1) {
        p.score *= 1.5;
      } else if (p.temporalDistance === 2) {
        p.score *= 1.4;
      } else if (p.temporalDistance === 3) {
        p.score *= 1.3;
      } else if (p.temporalDistance === 4) {
        p.score *= 1.2;
      } else if (p.temporalDistance === 5) {
        p.score *= 1.1;
      }

      points.push(p);
    }

    if (points.length === 0) {
      return null;
    }

    points.sort((a, b) => b.score - a.score);

    candidate = points[0];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (Math.abs(p.score - candidate.score) > 0.0001) {
        break;
      }
      if (p.temporalDistance < candidate.temporalDistance) {
        candidate = p;
      }
    }

    this.continuationPoints.splice(candidate.index, 1);
    return candidate.point;
  }


  getFlatStackTrace(event) {
    const frames = [];
    const getAsyncFrames = (stackTrace, layer) => {
      for (const frm of stackTrace.callFrames) {
        const file = this.dbg.getScriptUrl(frm?.scriptId);
        frames.push({
          type: "async",
          asyncLevel: layer,
          functionName: frm.functionName,
          file,
          line: frm?.lineNumber + 1,
          col: frm?.columnNumber + 1,
          scriptId: frm?.scriptId
        });
      }
      if (stackTrace.parent) {
        getAsyncFrames(stackTrace.parent, layer + 1);
      }
    }
    for (const frm of event.callFrames) {
      const file = this.dbg.getScriptUrl(frm?.location?.scriptId || frm?.functionLocation?.scriptId);
      frames.push({
        type: "sync",
        asyncLevel: null,
        functionName: frm.functionName,
        file,
        line: frm?.location?.lineNumber + 1,
        col: frm?.location?.columnNumber + 1,
        scriptId: frm?.location?.scriptId
      });
    }
    if (event.asyncStackTrace) {
      getAsyncFrames(event.asyncStackTrace, 1);
    }

    return frames;
  }

  getNewCtx(event, phase, functionSource) {
    const ctx = {
      phase,
      step: this.step,
      _messages: [],
      _logs: [],
      _overrideRetVal: { override: false, value: undefined },
      _nextStep: null,  // "followReturn" | "stepInto" | "stepIntoAsync" | "stepOver" | "stepOut"
      _enablePromiseAwait: false,
      _isAsync: false,
      _evalExpr: null,
      _overrideVariables: {},
      stackTrace: this.getFlatStackTrace(event),
      arguments: [],
      variables: [],
      returnValue: undefined,
      functionSource: functionSource || undefined,
      setVariable: null,
      send: null,
      log: null,
      return: null,
      returnExpr: null,
      eval: null,
      followReturn: null,
      stepInto: null,
      stepIntoAsync: null,
      setpOver: null,
      stepOut: null,
      // enablePromiseAwait: null,
    };
    return ctx;
  }

  getEvalCode(ctx, callback, previousStep) {
    const code = [
      `(function wb_${crypto.randomUUID().replaceAll("-", "")}(ctx, previousStep){`,
      `ctx.send = msg => ctx._messages.push(msg);`,
      `ctx.log = msg => ctx._logs.push(msg);`,
      `ctx.eval = expr => ctx._evalExpr = expr;`,
      `ctx.setVariable = (name, val) => ctx._overrideVariables[name] = val;`,
      `ctx.stepInto = () => ctx._nextStep = "stepInto";`,
      `ctx.stepIntoAsync = () => ctx._nextStep = "stepIntoAsync";`,
      `ctx.stepOver = () => ctx._nextStep = "stepOver";`,
      `ctx.stepOut = () => ctx._nextStep = "stepOut";`,
      // `ctx.enablePromiseAwait = () => ctx._enablePromiseAwait = true;`,
    ];

    if (ctx.phase === "leave") {
      code.push(
        `ctx.return = retVal => ctx._overrideRetVal = `,
        `{override: true, value: JSON.stringify(retVal)};`,  // JSON.stringify because dbg.setReturnValue takes an espression
        `ctx.returnExpr = retVal => ctx._overrideRetVal = {override: true, value: retVal};`,
        `ctx.followReturn = () => ctx._nextStep = "followReturn";`
      );
    }

    code.push(
      `(function ${callback.toString()})(ctx ${previousStep ? ",previousStep" : ""});`,
      `ctx.send = null;`,
      `ctx.log = null;`,
      `ctx.return = null;`,
      `ctx.returnExpr = null;`,
      `ctx.followReturn = null;`,
      `ctx.stepInto = null;`,
      `ctx.stepIntoAsync = null;`,
      `ctx.stepOver = null;`,
      `ctx.stepOut = null;`,
      // `ctx.enablePromiseAwait = null;`,
      `ctx.eval = null;`,
      `ctx.setVariable = null;`,
      `return ctx;`,
      `})(${JSON.stringify(ctx)},${previousStep ? JSON.stringify(previousStep) : "null"})`
    );
    // console.log(code.join(""));
    return code.join("");
  }

  // value is CDP value (interface {type: string, value: any, description:string})
  async fetchValue(value) {
    if (!value) {
      return;
    }
    switch (value.type) {
      case 'object':
        if (value.value === null) {
          return null;
        } else {
          try {
            const remoteVal = await this.dbg.client.send("Runtime.callFunctionOn", {
              objectId: value.objectId,
              functionDeclaration: `function(){return this;}`,
              returnByValue: true
            });
            return remoteVal.result.value;
          } catch {
            return `[Unserializable object]`
          }
        }
      case 'function':
        return {};
      case 'undefined':
        return;
      default:
        return value.value;
    }
  }

  onPaused = async (event) => {
    this.step++;
    const curFrame = event.callFrames[0];
    let hookPoint;
    let ctx;
    let callback;
    let handleResult;
    let previousStep;
    let phase;

    const resultLogger = {
      log: e => this.emit("log", { message: e }),
      warn: e => this.emit("warn", { message: e }),
      error: e => this.emit("error", { message: e }),
    };
    if (event.reason === "step") {
      const cp = this.getContinuationPoint(this.getFlatStackTrace(event).map(x => `${x.scriptId}:${x.line}:${x.col}`));
      if (cp === null) {
        await this.dbg.resume();
        return;
      }
      phase = cp.nextPhase;
      if (!cp.callback) {
        console.log("Missing onReturnFollowed/onStep handler");
        await this.dbg.resume();
        return;
      }
      callback = cp.callback;
      handleResult = cp.handleResult;
      previousStep = {
        phase: cp.ctx.phase,
        stackTrace: cp.ctx.stackTrace,
        messages: cp.ctx._messages,
        evalResult: cp.evalResult || undefined,
        functionSource: cp.ctx.functionSource || undefined,
        variables: cp.ctx.variables,
        step: cp.ctx.step
      };
      let functionSource;
      if (curFrame.location) {
        // @TODO: cache functionSource
        functionSource = this.findFunctionAt(
          await this.dbg.getScriptSource(curFrame.location.scriptId),
          curFrame.location.lineNumber + 1,
          curFrame.location.columnNumber + 1
        );
      }
      ctx = this.getNewCtx(event, phase, functionSource);
    } else {
      hookPoint = this.getHookPointFromEvent(event);
      if (!hookPoint) {
        console.log("Cannot find hookpoint");
        await this.dbg.resume();
        return;
      }
      phase = hookPoint.phase;
      ctx = this.getNewCtx(event, phase, hookPoint.functionSource);
      callback = hookPoint.callback;
      handleResult = hookPoint.handleResult;
    }

    for (const s of curFrame.scopeChain) {
      if (s.type === 'local' || s.type === 'closure' || s.type === 'catch') {
        const vars = await this.dbg.client.send("Runtime.getProperties", {
          objectId: s.object.objectId
        });
        for (const v of vars.result) {
          ctx.variables.push(v.name);
          if (phase === "enter" && s.type === 'local') {
            // Assume that at the beginning of the function, the 'local' scope
            // contains only the arguments
            ctx.arguments.push(v.name);
          }
        }
      }
    }

    if (phase === "leave") {
      ctx.returnValue = { objectId: curFrame.returnValue.objectId, type: curFrame.returnValue.type };
      if (curFrame.returnValue.subtype === 'promise') {
        ctx.returnValue.isPromise = true;
      } else {
        ctx.returnValue.value = await this.fetchValue(curFrame.returnValue);
      }
    }

    const result = {
      phase: ctx.phase,
      stackTrace: ctx.stackTrace,
      functionSource: ctx.functionSource
    };
    const newContext = await this.dbg.evaluateOnCallFrame(
      curFrame.callFrameId,
      this.getEvalCode(ctx, callback, previousStep),
      true
    );

    if (newContext.subtype === 'error') {
      result.error = newContext.description;
      this.emit("error", { message: `[${phase}] ${newContext.description}` });
      if (handleResult) {
        await handleResult(result, resultLogger);
      }
      await this.dbg.resume();
      return;
    }

    const ctxVal = newContext.value;
    let evalResult;
    if (ctxVal._evalExpr) {
      evalResult = await this.dbg.evaluateOnCallFrame(curFrame.callFrameId,
        ctxVal._evalExpr,
        true
      );
      result.evalResult = evalResult;
    }

    for (const log of ctxVal._logs) {
      this.emit("log", { message: `[${phase}] ${log}` });
    }

    if (Object.keys(ctxVal._overrideVariables).length > 0) {
      const scopes = [];
      for (let i = 0; i < curFrame.scopeChain.length; i++) {
        const s = curFrame.scopeChain[i];
        if (s.type === 'local' || s.type === 'closure' || s.type === 'catch') {
          scopes.push(i);
        }
      }

      for (const n in ctxVal._overrideVariables) {
        let isFound = false;
        for (const scopeNumber of scopes) {
          try {
            await this.dbg.setVariableValue(
              curFrame.callFrameId,
              scopeNumber,
              n,
              JSON.stringify(ctxVal._overrideVariables[n])
            );
            isFound = true;
            break;
          } catch { }
        }
        if (!isFound) {
          this.emit("error", { message: `setVeriable: variable '${n}' not found` });
        }
      }
    }

    if (handleResult) {
      result.messages = ctxVal._messages;
      await handleResult(result, resultLogger);
    }

    if (phase === "leave") {
      if (ctxVal._overrideRetVal.override === true) {
        try {
          await this.dbg.setReturnValue(curFrame, ctxVal._overrideRetVal.value);
        } catch (e) {
          this.emit("error", {
            message: e.toString()
          });
        }
      }
    }
    if (ctxVal._nextStep) {
      const isFollowReturn = ctxVal._nextStep === "followReturn";
      const cp = {
        ctx: ctxVal,
        step: this.step,
        isFollowReturn,
        nextPhase: isFollowReturn ? "returnFollowed" : "stepFollowed",
        stackTrace: ctx.stackTrace,
        trails: ctx.stackTrace.map(x => `${x.scriptId}:${x.line}:${x.col}`)
      };
      if (evalResult) {
        cp.evalResult = evalResult;
      }
      let stepFnc;
      // Note: if ctx.step*() are chained, hookPoint does not exist
      cp.handleResult = hookPoint?.handleResult || handleResult;
      if (isFollowReturn) {
        cp.callback = hookPoint?.onReturnFollowed || callback;

        stepFnc = "stepInto";
        if (curFrame.returnValue.subtype === 'promise') {
          cp.promiseObjectId = curFrame.returnValue.objectId;
          stepFnc = "stepIntoAsync";
        }
      } else {
        cp.callback = hookPoint?.onStep || callback;
        stepFnc = ctxVal._nextStep;  // @TODO: too weak
      }

      this.continuationPoints.push(cp);
      await this.dbg[stepFnc]();
      return;
    }


    await this.dbg.resume();
  };

  getHookLocation = (hook) => {
    return `${hook.file}:${hook.line}:${hook.col}`;
  };

  start = async () => {
    if (this.state !== this.states.idle) {
      throw new Error("Hooks already running");
    }

    this.startTime = Date.now();
    this.state = this.states.running;
    await this.dbg.enable();
    await this.dbg.setAsyncCallStackDepth(32);
    for (const h of this.registeredHooks.values()) {
      const sid = this.dbg.getScriptId(h.file);
      if (!sid) {
        throw new Error(`File '${h.file}': script not parsed`);
      }
      // @TODO: cache functionSource
      const functionSource = this.findFunctionAt(
        await this.dbg.getScriptSource(sid),
        h.line,
        h.col
      );
      const bpLocations = await this.dbg.getPossibleBreakpointsOnFunction(sid, h.line - 1, h.col - 1);
      if (bpLocations.length === 0) {
        throw new Error(`File '${h.file}':${h.line}:${h.col} function not found`);
      }
      let isEntryPoint = true;
      for (const bpl of bpLocations) {
        let callback;
        let phase;
        if (isEntryPoint) {
          callback = h.onEnter;
          phase = "enter";
          isEntryPoint = false;
          if (!callback) {
            continue;
          }
        } else {
          if (bpl.type !== 'return') {
            continue;
          }
          callback = h.onLeave;
          phase = "leave";
          if (!callback) {
            continue;
          }
        }

        const breakpointId = await this.dbg.setBreakpoint(sid, bpl.lineNumber, bpl.columnNumber);
        this.activeHookPoints.set(breakpointId, {
          callback,
          location: this.getHookLocation(h),
          hookId: h.id,
          phase,
          breakpointId,
          handleResult: h.handleResult,
          onReturnFollowed: h.onReturnFollowed,
          onStep: h.onStep,
          functionSource
        });

        this.emit("log", {
          message: `Hook ${this.getHookLocation(h)} activated at line ${bpl.lineNumber + 1}, col ${bpl.columnNumber + 1}`
        });
      }

      for (const atLocation of h.atLocations) {
        const [line, col] = atLocation.location.split(":");
        const breakpointId = await this.dbg.setBreakpoint(sid, Number(line) - 1, Number(col) - 1);
        this.activeHookPoints.set(breakpointId, {
          callback: atLocation.onHit,
          location: this.getHookLocation(h),
          hookId: h.id,
          phase: "hit",
          breakpointId,
          handleResult: h.handleResult,
          onReturnFollowed: h.onReturnFollowed,
          onStep: h.onStep,
          functionSource
        });
        this.emit("log", {
          message: `Hook ${this.getHookLocation(h)} activated at line ${line}, col ${col}`
        });
      }
    }

    this.emit("log", { message: `Hooks armed` });
  };

  addHook = (hookDef) => {
    const { location, handlers, handleResult } = hookDef;
    for (const en of ["onEnter", "onLeave", "onReturnFollowed", "onStep"]) {
      if (en in handlers) {
        if (typeof handlers[en] !== 'function' || !handlers[en].toString().startsWith(en)) {
          throw new Error(`${en} must be declared as an object method, not an arrow function`);
        }
      }
    }
    // @TODO: validate onHit

    const hook = {
      id: crypto.randomUUID(),
      file: location.file,
      col: location.col,
      line: location.line,
      onEnter: handlers.onEnter,
      onLeave: handlers.onLeave,
      onReturnFollowed: handlers.onReturnFollowed,
      onStep: handlers.onStep,
      atLocations: handlers.at || [],
      handleResult,
    };

    this.registeredHooks.set(hook.id, hook);
    this.emit("log", { message: `Hook registered at ${this.getHookLocation(hook)}` });
  }

  stop = async () => {
    for (const [k, v] of this.activeHookPoints) {
      await this.dbg.removeBreakpoint(k);
    }
    await this.dbg.disable();
    this.init();
    this.emit("log", { message: `Hooks disarmed` });
  }
}

export default HooksManager;
