import { patchModule, runHttpServer, compareObjects } from "#src/app/tests/test-utils.js";
import Debugger from "#src/app/modules/debugger/debugger.js";
import { red, yellow, green, cyan, assert } from "./test-utils.js";
import { log } from "console";


(async () => {
  runHttpServer(3000, null);
  const dbgModule = new Debugger(null, null, null);
  await patchModule(dbgModule, {}, false); // DO NOT open devtools
  dbgModule.run();
  const page = dbgModule.pagesManager.get('1').page;
  await page.goto("http://localhost:3000/debuggable.html", { waitUntil: 'networkidle0' });

  const TARGET_FILE = "http://localhost:3000/debuggable.js";

  function addHook(line, handlers, handleResult) {
    dbgModule.addHook(
      {
        file: TARGET_FILE,
        line: line,
        col: 1,
      },
      handlers,
      handleResult
    );
  }

  function sleep(i) {
    return new Promise(resolve => setTimeout(resolve, i));
  }

  function purgeLogs(logs) {
    const ret = [];
    for (const l of logs) {
      if (
        l.startsWith("[enter] ")
        || l.startsWith("[leave] ")
        || l.startsWith("[returnFollowed] ")
        || l.startsWith("[stepFollowed] ")
      ) {
        ret.push(l);
      }
      if (l.startsWith("[handleResult] ")) {
        console.log(l);
        ret.push(l);
      }
    }
    // console.log(logs)
    return ret;
  }

  async function runTest(label, handle) {
    const logs = [];
    await dbgModule.startHooks(1, {
      log: e => { logs.push(e.message); },
      error: console.log,
      warn: console.log
    });
    
    page.evaluate('document.querySelector("#btn").onclick()')
    await sleep(1000);
    try {
      handle(purgeLogs(logs));
    } catch (e) {
      console.log(red(`[${label}] FAILED:`));
      throw e;
    }

    await dbgModule.disableDebugger(1);
    console.log(green(`[${label}] PASSED`));
  }


  async function testFollowReturn() {
    const handlers = {
      onEnter(ctx) {
        ctx.log(`${JSON.stringify(ctx.variables)}`)
      },
      onLeave(ctx) {
        ctx.log(`${JSON.stringify(ctx.variables)}`)
        ctx.followReturn();
      },
      onReturnFollowed(ctx, previousStep) {
        ctx.log(`${JSON.stringify(ctx.variables)}`)
      },
    };
    addHook(46, handlers);

    await runTest("testFollowReturn1", logs => {
      assert(logs[0], '==', `[enter] {"x":1}`);
      assert(logs[1], '==', `[leave] {"x":1}`);
      assert(logs[2], '==', `[returnFollowed] {"x1":1}`);
      assert(logs[3], '==', `[enter] {"x":2}`);
      assert(logs[4], '==', `[leave] {"x":2}`);
      assert(logs[5], '==', `[returnFollowed] {"x1":2}`);
      assert(logs[6], '==', `[enter] {"x":3}`);
      assert(logs[7], '==', `[leave] {"x":3}`);
      assert(logs[8], '==', `[returnFollowed] {"x2":3}`);
    });
    addHook(52, handlers);
    await runTest("testFollowReturn2", logs => {
      assert(logs[0], '==', `[enter] {"x":4}`);
      assert(logs[1], '==', `[leave] {"x":4}`);
      assert(logs[2], '==', `[returnFollowed] {"x1":4}`);
    });
  }

  async function testSetReturnValue() {
    addHook(56, {
      onEnter() { },
      onLeave(ctx) {
        ctx.return("overridden")
      }
    });

    addHook(60, {
      onEnter() { },
      onLeave(ctx) {
        ctx.log(`${JSON.stringify(ctx.variables)}`)
      }
    });

    await runTest("testSetReturnValue", logs => {
      assert(logs[0], '==', `[leave] {"x":"overridden"}`);
    });
  }

  async function testSetReturnExpr() {
    addHook(56, {
      onEnter() { },
      onLeave(ctx) {
        ctx.returnExpr(`y`)
      }
    });

    addHook(60, {
      onEnter() { },
      onLeave(ctx) {
        ctx.log(`${JSON.stringify(ctx.variables)}`)
      }
    });

    await runTest("testSetReturnExpr", logs => {
      assert(logs[0], '==', `[leave] {"x":"overridden"}`);
    });
  }

  async function testSetVariableAndRetVal() {
    addHook(56, {
      onEnter() {
        ctx.setVariable("x", 33);
      },
      onLeave(ctx) {
        ctx.log(`${ctx.variables.x}`);
        ctx.log(JSON.stringify(ctx.returnValue));
        ctx.send(ctx.returnValue.value);
        ctx.followReturn();
      },
      onReturnFollowed(ctx, previousStep) {
        ctx.log(previousStep.messages[0]);
      }
    });

    await runTest("testSetVariableAndRetVal", logs => {
      assert(logs[0], '==', '[leave] 33');
      assert(logs[1], '==', '[leave] {"type":"number","value":33}');
      assert(logs[2], '==', `[returnFollowed] 33`);
    });
  }

  async function testHandlerError() {
    let error = null;
    addHook(56,
      {
        onEnter() {
          throw new Error("handler error")
        }
      },
      (result, logger) => {
        error = result.error
      }
    );

    await runTest("testHandlerError", logs => {
      assert(error, 'startsWith', "Error: handler error");
    });
  }


  async function testFunctionSource() {

    addHook(56, {
      onEnter(ctx) {
        ctx.log(ctx.functionSource);
      },
      onLeave(ctx) {
        ctx.log(ctx.functionSource);
        ctx.followReturn();
      },
      onReturnFollowed(ctx, previousStep) {
        ctx.log(previousStep.functionSource);
        ctx.log(ctx.functionSource);
      }
    });


    await runTest("testFunctionSource", logs => {
      assert(logs[0], '==', '[enter] function retVal0(x) {\n  const y = "overridden";\n  return x;\n}',);
      assert(logs[1], '==', '[leave] function retVal0(x) {\n  const y = "overridden";\n  return x;\n}',);
      assert(logs[2], '==', '[returnFollowed] function retVal0(x) {\n  const y = "overridden";\n  return x;\n}',);
      assert(logs[3], '==', '[returnFollowed] function retVal() {\n  const x = retVal0(1);\n  return x;\n}');
    });
  }

  async function testPreviousStep() {

    addHook(56, {
      onLeave(ctx) {
        ctx.send({ x: 123 });
        ctx.send(ctx.stackTrace);
        ctx.eval(`"test"`)
        ctx.followReturn();
      },
      onReturnFollowed(ctx, previousStep) {
        ctx.log(JSON.stringify(previousStep));
      }
    });

    await runTest("testPreviousStep", logs => {
      assert(logs.length, '==', 1)
      const j = JSON.parse(logs[0].replace(`[returnFollowed]`, ""));
      assert(j.stackTrace[0].functionName, '==', 'retVal0');
      assert(j.stackTrace[1].functionName, '==', 'retVal');
      assert(j.stackTrace[2].functionName, '==', 'main');
      assert(j.evalResult.value, '==', "test");
      assert(j.variables.x, '==', 1);
      assert(j.variables.y, '==', "overridden");
      assert(j.messages[0].x, '==', 123);
      assert(j.messages[1][0].functionName, '==', 'retVal0');
    });
  }

  async function testHandleResult() {

    addHook(56,
      {
        onEnter(ctx) {
          ctx.send("1");
        },
        onLeave(ctx) {
          ctx.send("2");
          ctx.followReturn();
        },
        onReturnFollowed(ctx, previousStep) {
          ctx.send("3");
        }
      },
      (result, logger) => {
        logger.log(`[handleResult] ${JSON.stringify({ phase: result.phase, messages: result.messages })}`);
        logger.log(`[handleResult] ${result.stackTrace.length > 0} ${result.functionSource.length > 0}`);
      });

    await runTest("testHandleResult", logs => {
      assert(logs[0], '==', '[handleResult] {"phase":"enter","messages":["1"]}');
      assert(logs[1], '==', '[handleResult] true true');
      assert(logs[2], '==', '[handleResult] {"phase":"leave","messages":["2"]}');
      assert(logs[3], '==', '[handleResult] true true');
      assert(logs[4], '==', '[handleResult] {"phase":"returnFollowed","messages":["3"]}');
      assert(logs[5], '==', '[handleResult] true true');
    });
  }


  async function testStepOut() {

    addHook(56, {
      onEnter(ctx) {
        ctx.stepOut();
      },
      onStep(ctx, previousStep) {
        ctx.log(previousStep.step);
        ctx.log(ctx.functionSource.slice(0, 30))
        ctx.stepOut();
      },
    });

    await runTest("testStepOut", logs => {
      assert(logs[0], '==', '[stepFollowed] 1');
      assert(logs[1], '==', '[stepFollowed] function retVal() {\n  const x ');
      assert(logs[2], '==', '[stepFollowed] 2');
      assert(logs[3], '==', '[stepFollowed] async function main() {\n  cons');
      assert(logs[4], '==', '[stepFollowed] 3');
      assert(logs[5], '==', '[stepFollowed] async function realAsync(x) {\n');
      assert(logs[6], '==', '[stepFollowed] 4');
      assert(logs[7], '==', '[stepFollowed] x2 => { }');
    });
  }

  async function testStepIntoAsync() {

    addHook(66, {
      onLeave(ctx) {
        ctx.stepIntoAsync();
      },
      onStep(ctx, previousStep) {
        ctx.log(previousStep.step);
        ctx.log(ctx.functionSource.slice(0, 30));
        if (previousStep.step < 4) {
          ctx.stepIntoAsync();
        }
      },
      onReturnFollowed(ctx, previousStep) {
        ctx.log(previousStep.step);
        ctx.log(ctx.functionSource.slice(0, 30))
      }
    });

    await runTest("testStepIntoAsync1", logs => {
      assert(logs[0], '==', '[stepFollowed] 1');
      assert(logs[1], '==', '[stepFollowed] async function retValA() {\n  c');
      assert(logs[2], '==', '[stepFollowed] 2');
      assert(logs[3], '==', '[stepFollowed] async function retValA() {\n  c');
      assert(logs[4], '==', '[stepFollowed] 3');
      assert(logs[5], '==', '[stepFollowed] async function main() {\n  cons');
    });

    addHook(66, {
      onLeave(ctx) {
        // ctx.log(ctx.step)
        // ctx.followReturn();
        ctx.stepIntoAsync();
      },
      onStep(ctx, previousStep) {
        ctx.log(previousStep.step);
        ctx.log(ctx.functionSource.slice(0, 30))
      },
      onReturnFollowed(ctx, previousStep) {
        ctx.log(previousStep.step);
        ctx.log(ctx.functionSource.slice(0, 30))
      }
    });

    await runTest("testStepIntoAsync2", logs => {
      assert(logs[0], '==', '[stepFollowed] 1');
      assert(logs[1], '==', '[stepFollowed] async function retValA() {\n  c');
    });
  }

  await testStepIntoAsync();
  await testStepOut();
  await testFollowReturn();
  await testHandleResult();
  await testSetVariableAndRetVal();
  await testHandlerError();
  await testPreviousStep();
  await testFunctionSource();
  await testSetReturnValue();
  await testSetReturnExpr();

  setTimeout(() => process.exit(0), 1000);

})();