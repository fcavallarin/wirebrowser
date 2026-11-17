import { tagInternalSource } from "#src/common/utils.js";
import DebuggerStateMachine from "#src/app/debugger-state-machine.js";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { parse as looseParse } from "acorn-loose";

const parseJsRobust = (code) => {
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
  } catch { /* try as script */ }

  try {
    return acorn.parse(code, {
      ...baseOptions,
      sourceType: "script",
    });
  } catch { /* fall back to the loose parser */ }

  // Last resort: error-tolerant parser
  return looseParse(code, baseOptions);
};

const isFunctionNode = (node) => {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
};

// line and col are 1-based; acorn columns are 0-based
const nodeContains = (node, line, col) => {
  const column = col - 1;
  const start = node.loc.start;
  const end = node.loc.end;
  if (line < start.line || line > end.line) {
    return false;
  }
  if (line === start.line && column < start.column) {
    return false;
  }
  if (line === end.line && column > end.column) {
    return false;
  }
  return true;
};

// Innermost function containing the (source-relative) location
const findFunctionNodeAt = (code, line, col) => {
  let best = null;
  walk.full(parseJsRobust(code), (node) => {
    if (!isFunctionNode(node) || !nodeContains(node, line, col)) {
      return;
    }
    if (!best || (node.start >= best.start && node.end <= best.end)) {
      best = node;
    }
  });
  return best;
};

// 1-based column of the first function starting on `line`, or null
const findFunctionStartColumn = (code, line) => {
  let best = null;
  walk.full(parseJsRobust(code), (node) => {
    if (!isFunctionNode(node) || node.loc.start.line !== line) {
      return;
    }
    if (best === null || node.loc.start.column < best) {
      best = node.loc.start.column;
    }
  });
  return best === null ? null : best + 1;
};

// Normalizes a handler into method source ("name(ctx, previousStep) { ... }").
// Accepts either:
//  - a function declared as an object method (e.g. `onEnter(ctx) { ... }`)
//  - a string containing the handler BODY; `ctx` and `previousStep` are in scope.
// Strings are only parsed (never executed) here: handlers run in the page,
// via Debugger.evaluateOnCallFrame.
export const normalizeHandlerSource = (name, handler) => {
  if (handler === undefined || handler === null) {
    return undefined;
  }
  let src;
  if (typeof handler === "function") {
    src = handler.toString();
    if (!src.startsWith(name)) {
      throw new Error(`${name} must be declared as an object method, not an arrow function`);
    }
  } else if (typeof handler === "string") {
    src = `${name}(ctx, previousStep) {\n${handler}\n}`;
  } else {
    throw new Error(`${name} must be a function or a string`);
  }

  let ast;
  try {
    ast = acorn.parse(`function ${src}`, { ecmaVersion: "latest" });
  } catch (e) {
    throw new Error(`${name}: syntax error: ${e.message}`);
  }
  // Reject bodies that close the wrapper function and append other code
  if (ast.body.length !== 1 || ast.body[0].type !== "FunctionDeclaration") {
    throw new Error(`${name}: handler must be a single function body`);
  }
  return src;
};

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

  findFunctionAt(code, line, col) {
    const node = findFunctionNodeAt(code, line, col);
    return node ? code.slice(node.start, node.end) : null;
  }

  // Without an explicit column, a hook location means "the function that
  // starts on this line".
  resolveHookLocation = (scriptId, source, hook) => {
    if (hook.col !== undefined) {
      return { line: hook.line, col: hook.col };
    }
    const srcLine = this.dbg.toSourceLocation(scriptId, hook.line, 1).line;
    const srcCol = findFunctionStartColumn(source, srcLine);
    if (srcCol === null) {
      throw new Error(
        `File '${hook.file}':${hook.line}: no function starts at this line (pass location.col to target a specific position)`
      );
    }
    return this.dbg.toDocumentLocation(scriptId, srcLine, srcCol);
  };

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
      `(function ${callback})(ctx ${previousStep ? ",previousStep" : ""});`,
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
              functionDeclaration: tagInternalSource(`function(){return this;}`),
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
    let hookLocation;

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
      hookLocation = cp.location;
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
        const { scriptId, lineNumber, columnNumber } = curFrame.location;
        const srcLoc = this.dbg.toSourceLocation(scriptId, lineNumber + 1, columnNumber + 1);
        functionSource = this.findFunctionAt(
          await this.dbg.getScriptSource(scriptId),
          srcLoc.line,
          srcLoc.col
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
      hookLocation = hookPoint.location;
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
      location: hookLocation,
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
        location: hookLocation,
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
    return `${hook.file}:${hook.line}${hook.col !== undefined ? `:${hook.col}` : ""}`;
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
      const source = await this.dbg.getScriptSource(sid);
      const { line, col } = this.resolveHookLocation(sid, source, h);
      const srcLoc = this.dbg.toSourceLocation(sid, line, col);
      const fnNode = findFunctionNodeAt(source, srcLoc.line, srcLoc.col);
      if (!fnNode) {
        throw new Error(`File '${h.file}':${line}:${col}: no function at this location`);
      }
      const functionSource = source.slice(fnNode.start, fnNode.end);
      const bpLocations = await this.dbg.getPossibleBreakpointsOnFunction(sid, line - 1, col - 1);
      if (bpLocations.length === 0) {
        throw new Error(`File '${h.file}':${line}:${col} function not found`);
      }
      // CDP restricts breakpoints to the function enclosing the position:
      // make sure it is the function we expect, never hook a different one.
      const firstBp = this.dbg.toSourceLocation(sid, bpLocations[0].lineNumber + 1, bpLocations[0].columnNumber + 1);
      if (!nodeContains(fnNode, firstBp.line, firstBp.col)) {
        throw new Error(
          `File '${h.file}':${line}:${col}: the location does not resolve to the expected function`
        );
      }
      h.col = col;
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
          location: `${h.file}:${atLocation.location}`,
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
    const { location, handlers = {}, handleResult } = hookDef;
    if (!location?.file || typeof location.file !== "string") {
      throw new Error("Hook location.file is required");
    }
    if (!Number.isInteger(location.line) || location.line < 1) {
      throw new Error("Hook location.line must be a positive integer (1-based)");
    }
    // Without col, the hook targets the function that starts on `line`
    const col = location.col;
    if (col !== undefined && (!Number.isInteger(col) || col < 1)) {
      throw new Error("Hook location.col must be a positive integer (1-based)");
    }

    const atLocations = (handlers.at || []).map((a, i) => {
      if (typeof a?.location !== "string" || !/^\d+:\d+$/.test(a.location)) {
        throw new Error(`at[${i}].location must be "line:col" (1-based)`);
      }
      const onHit = normalizeHandlerSource("onHit", a.onHit);
      if (!onHit) {
        throw new Error(`at[${i}].onHit is required`);
      }
      return { location: a.location, onHit };
    });

    const hook = {
      id: crypto.randomUUID(),
      file: location.file,
      col,
      line: location.line,
      onEnter: normalizeHandlerSource("onEnter", handlers.onEnter),
      onLeave: normalizeHandlerSource("onLeave", handlers.onLeave),
      onReturnFollowed: normalizeHandlerSource("onReturnFollowed", handlers.onReturnFollowed),
      onStep: normalizeHandlerSource("onStep", handlers.onStep),
      atLocations,
      handleResult,
    };

    this.registeredHooks.set(hook.id, hook);
    this.emit("log", { message: `Hook registered at ${this.getHookLocation(hook)}` });
    return hook.id;
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
