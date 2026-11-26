// Tests for the programmatic (non-GUI) API used by agent-facing callers:
// string hook handlers, HookEventBuffer, startHooks error recovery,
// Heap.runBDHS / stopBDHS and the heap.startBDHS UI wiring.
//
// Run from the repo root:  node src/app/tests/programmatic-api.js

import { setupHeapAndDebugger, runHttpServer } from "#src/app/tests/test-utils.js";
import { red, green, assert } from "./test-utils.js";
import HookEventBuffer from "#src/app/modules/debugger/hook-event-buffer.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";
const DEBUGGABLE_JS = `${BASE}/debuggable.js`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1-based, document-relative location of the first line containing `text`
const ORIGIN_TRACE_HTML = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "html", "origin-trace.html"), "utf8"
).split("\n");
const locationOf = (text) => {
  const idx = ORIGIN_TRACE_HTML.findIndex(l => l.includes(text));
  return { line: idx + 1, col: ORIGIN_TRACE_HTML[idx].indexOf(text) + 1 };
};

const tokenSearch = (id) => ({
  valueSearch: [["wb", "origin", "trace", String(id * 2)].join("-"), {}],
});

(async () => {
  runHttpServer(3000, null);

  const uiErrors = [];
  const { heapModule, dbgModule } = await setupHeapAndDebugger({
    "Error": (data) => uiErrors.push(data),
  });

  const pageEntry = heapModule.pagesManager.get("1");
  const page = pageEntry.page;

  let failed = 0;
  async function test(label, fn) {
    try {
      await fn();
      console.log(green(`[${label}] PASSED`));
    } catch (e) {
      failed++;
      console.log(red(`[${label}] FAILED: ${e.message}`));
    } finally {
      // Always leave the debugger free for the next test
      try {
        await dbgModule.disableDebugger("1");
      } catch { /* not enabled */ }
    }
  }

  // ---------------------------------------------------------------- hooks
  await page.goto(`${BASE}/debuggable.html`, { waitUntil: "networkidle0" });
  const runMain = () => page.evaluate('document.querySelector("#btn").onclick()');

  await test("testStringHandlersWithBuffer", async () => {
    const buffer = new HookEventBuffer();
    dbgModule.addHook({ file: DEBUGGABLE_JS, line: 51 }, {  // function sync(x)
      onEnter: "ctx.send('enter:' + x)",
      onLeave: "ctx.send('leave'); ctx.return(99);",
    }, buffer.handleResult);
    await dbgModule.startHooks("1", buffer.events);

    runMain();
    const { timedOut } = await buffer.waitForEvents({ minResults: 2, timeoutMs: 5000 });
    assert(timedOut, "==", false);
    await sleep(300);
    const { events, functionSources } = buffer.drain();
    const results = events.filter(e => e.type === "result").map(e => e.result);

    assert(results[0].phase, "==", "enter");
    assert(results[0].messages[0], "==", "enter:4");
    assert(results[0].location, "==", `${DEBUGGABLE_JS}:51:1`);
    assert(results[1].phase, "==", "leave");
    assert(results[1].messages[0], "==", "leave");
    assert(results[0].functionSourceId, "==", results[1].functionSourceId);
    assert(functionSources[results[0].functionSourceId], "startsWith", "function sync(x)");
    assert("functionSource" in results[0], "==", false);
    // ctx.return(99) overrides sync(4) -> main stores it in x1
    // (checked indirectly: no hook error reported)
    assert(events.some(e => e.type === "hookError" || e.type === "error"), "==", false);
  });

  await test("testStringHandlerAtLocation", async () => {
    const buffer = new HookEventBuffer();
    dbgModule.addHook({ file: DEBUGGABLE_JS, line: 76 }, {  // longFunction
      at: [{ location: "81:2", onHit: "ctx.send(x)" }],
    }, buffer.handleResult);
    await dbgModule.startHooks("1", buffer.events);

    runMain();
    const { timedOut } = await buffer.waitForEvents({ minResults: 1, timeoutMs: 5000 });
    assert(timedOut, "==", false);
    const [first] = buffer.drain().events.filter(e => e.type === "result");
    assert(first.result.phase, "==", "hit");
    assert(first.result.messages[0], "==", 22);
    assert(first.result.location, "==", `${DEBUGGABLE_JS}:81:2`);
  });

  await test("testSyntaxErrorRejected", async () => {
    dbgModule.addHook({ file: DEBUGGABLE_JS, line: 51 }, { onEnter: "ctx.send(" });
    let error = null;
    try {
      await dbgModule.startHooks("1", {});
    } catch (e) {
      error = e;
    }
    assert(error?.message ?? "", "startsWith", "onEnter: syntax error");
    assert(dbgModule.activeLiveHooksManager, "==", null);
    assert(dbgModule.liveHooks.length, "==", 0);
  });

  await test("testRetryAfterFailedStart", async () => {
    dbgModule.addHook({ file: `${BASE}/missing.js`, line: 1 }, { onEnter: "ctx.send(1)" });
    let error = null;
    try {
      await dbgModule.startHooks("1", {});
    } catch (e) {
      error = e;
    }
    assert(error?.message ?? "", "startsWith", `File '${BASE}/missing.js'`);
    assert(dbgModule.activeLiveHooksManager, "==", null);
    assert(dbgModule.liveHooks.length, "==", 0);
    assert(pageEntry.debugger.isEnabled, "==", false);

    // A corrected hook must work, and must be the only one registered
    const buffer = new HookEventBuffer();
    dbgModule.addHook({ file: DEBUGGABLE_JS, line: 51 }, { onEnter: "ctx.send(x)" }, buffer.handleResult);
    await dbgModule.startHooks("1", buffer.events);
    runMain();
    await buffer.waitForEvents({ minResults: 1, timeoutMs: 5000 });
    await sleep(300);
    const { events } = buffer.drain();
    assert(events.filter(e => e.type === "log" && e.message.startsWith("Hook registered")).length, "==", 1);
    assert(events.filter(e => e.type === "result").length, "==", 1);
  });

  // ------------------------------------------- inline scripts / locations
  // origin-trace.html has an inline <script> starting at document line 11:
  // hook locations are document-relative, the script source is not.
  const INLINE_URL = `${BASE}/origin-trace.html?id=41`;

  await test("testInlineScriptHookByLine", async () => {
    await page.goto(INLINE_URL, { waitUntil: "networkidle0" });
    await page.waitForSelector("#buy", { timeout: 5000 });
    const buffer = new HookEventBuffer();
    dbgModule.addHook({ file: INLINE_URL, line: 23 }, {  // function handleBuy(e), indented
      onEnter: "ctx.send('enter:' + orderId)",
      onLeave: "ctx.send(window.lastOrder.token)",
    }, buffer.handleResult);
    await dbgModule.startHooks("1", buffer.events);

    page.click("#buy").catch(() => { });
    const { timedOut } = await buffer.waitForEvents({ minResults: 2, timeoutMs: 5000 });
    assert(timedOut, "==", false);
    const { events, functionSources } = buffer.drain();
    const results = events.filter(e => e.type === "result").map(e => e.result);
    assert(results[0].phase, "==", "enter");
    assert(results[0].messages[0], "==", "enter:41");
    assert(results[0].location, "==", `${INLINE_URL}:23:5`);
    assert(functionSources[results[0].functionSourceId], "startsWith", "function handleBuy(e)");
    assert(results[1].phase, "==", "leave");
    assert(results[1].messages[0], "==", "wb-origin-trace-82");
  });

  await test("testNoFunctionAtLine", async () => {
    dbgModule.addHook({ file: INLINE_URL, line: 16 }, { onEnter: "ctx.send(1)" });  // const orderId = ...
    let error = null;
    try {
      await dbgModule.startHooks("1", {});
    } catch (e) {
      error = e;
    }
    assert(error?.message ?? "", "==",
      `File '${INLINE_URL}':16: no function starts at this line (pass location.col to target a specific position)`);
    assert(dbgModule.activeLiveHooksManager, "==", null);
    assert(pageEntry.debugger.isEnabled, "==", false);
  });

  await test("testExplicitColOutsideFunction", async () => {
    // Column 1 is the indentation before `function handleBuy`: it used to
    // silently hook the top-level script instead
    dbgModule.addHook({ file: INLINE_URL, line: 23, col: 1 }, { onEnter: "ctx.send(1)" });
    let error = null;
    try {
      await dbgModule.startHooks("1", {});
    } catch (e) {
      error = e;
    }
    assert(error?.message ?? "", "==", `File '${INLINE_URL}':23:1: no function at this location`);
    assert(dbgModule.activeLiveHooksManager, "==", null);
  });

  // --------------------------------------------------------- origin trace
  await test("testStopBDHSWithoutScan", async () => {
    let error = null;
    try {
      await heapModule.stopBDHS();
    } catch (e) {
      error = e;
    }
    assert(error?.message ?? "", "==", "Scan is not running");
    // UI path: must report an error, not crash
    uiErrors.length = 0;
    await heapModule.uiEvents.listeners["heap.stopBDHS"]({}, () => { });
    assert(uiErrors[0], "==", "Scan is not running");
  });

  await test("testRunBDHSWithPuppeteerClick", async () => {
    await page.goto(`${BASE}/origin-trace.html?id=21`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#buy", { timeout: 5000 });
    const res = await heapModule.runBDHS(
      { pageId: "1", ...tokenSearch(21) },
      { trigger: () => page.click("#buy"), timeoutMs: 30000 }
    );
    if (res.status !== "found") {
      console.log(JSON.stringify(res, null, 2));
    }
    assert(res.status, "==", "found");
    const fnNames = res.results.map(r => r.functionName);
    assert(fnNames.includes("handleBuy"), "==", true);
    assert(heapModule.activeBDHS, "==", null);
  });

  await test("testRunBDHSTimeoutWhileArmed", async () => {
    await page.goto(`${BASE}/origin-trace.html?id=27`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#buy", { timeout: 5000 });
    const res = await heapModule.runBDHS(
      { pageId: "1", ...tokenSearch(27) },
      { timeoutMs: 1500 }  // no trigger: nobody clicks
    );
    assert(res.status, "==", "timeout");
    assert(heapModule.activeBDHS, "==", null);
    assert(pageEntry.debugger.isEnabled, "==", false);

    // The DOM click breakpoint must be gone: a click must not pause anymore
    const pauses = [];
    pageEntry.debugger.on("paused", async (event) => {
      pauses.push(event.reason);
      await pageEntry.debugger.resume();
    });
    await pageEntry.debugger.enable();
    await page.click("#buy");
    await sleep(500);
    await pageEntry.debugger.disable();
    pageEntry.debugger.on("paused", null);
    assert(pauses.length, "==", 0);
  });

  await test("testRunBDHSTriggerError", async () => {
    await page.goto(`${BASE}/origin-trace.html?id=29`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#buy", { timeout: 5000 });
    const res = await heapModule.runBDHS(
      { pageId: "1", ...tokenSearch(29) },
      { trigger: () => page.click("#does-not-exist"), timeoutMs: 10000 }
    );
    assert(res.status, "==", "error");
    assert(res.error, "startsWith", "Trigger failed");
    assert(heapModule.activeBDHS, "==", null);
  });

  await test("testStartBDHSUIWiring", async () => {
    await page.goto(`${BASE}/origin-trace.html?id=33`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#buy", { timeout: 5000 });
    const received = [];
    const finished = new Promise((resolve) => {
      heapModule.uiEvents.listeners["heap.startBDHS"](
        { pageId: "1", toleranceWinBefore: 6, toleranceWinAfter: 15, ...tokenSearch(33) },
        (event, data) => {
          received.push({ event, data });
          if (event === "heap.BDHSArmed") {
            page.click("#buy").catch((e) => console.log(red(`click failed: ${e.message}`)));
          }
          if (event === "heap.BDHSFinished" || event === "heap.BDHSError") {
            resolve();
          }
        }
      );
    });
    await Promise.race([finished, sleep(30000)]);
    const names = received.map(r => r.event);
    assert(names[0], "==", "heap.BDHSArmed");
    assert(names.includes("heap.BDHSStatus"), "==", true);
    const result = received.find(r => r.event === "heap.BDHSResult");
    assert(!!result, "==", true);
    assert(result.data.pageId, "==", "1");
    assert(result.data.results.some(r => r.functionName === "handleBuy"), "==", true);
    assert(names[names.length - 1], "==", "heap.BDHSFinished");
    assert(heapModule.activeBDHS, "==", null);
  });

  // Runs after click traces on purpose: a trace that ends on its idle timeout
  // used to leave a stepOut pending in V8, which swallowed later breakpoints.
  await test("testRunBDHSArmedOnBreakpoint", async () => {
    const url = `${BASE}/origin-trace.html?id=61`;
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("#preview", { timeout: 5000 });
    const loc = locationOf("const preview = { id");
    const res = await heapModule.runBDHS(
      { pageId: "1", ...tokenSearch(561), arm: { type: "breakpoint", file: url, ...loc } },
      { trigger: () => page.hover("#preview"), timeoutMs: 30000 }
    );
    if (res.status !== "found") {
      console.log(JSON.stringify(res, null, 2));
    }
    assert(res.status, "==", "found");
    assert(res.started, "==", true);
    assert(res.matchAtStart, "==", false);
    assert(res.arm.resolvedLocations[0].line, "==", loc.line);
    assert(res.results.some(r => r.functionName === "loadPreview"), "==", true);
    assert(heapModule.activeBDHS, "==", null);
    assert(pageEntry.debugger.isEnabled, "==", false);
  });

  await test("testRunBDHSBreakpointConditionAndMatchAtStart", async () => {
    const url = `${BASE}/origin-trace.html?id=63`;
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("#preview", { timeout: 5000 });
    // Armed after the value is created: the trace must say so
    const loc = locationOf("window.lastPreview = preview");
    const res = await heapModule.runBDHS(
      {
        pageId: "1", ...tokenSearch(563),
        // Several statements and a comment: valid for CDP
        arm: { type: "breakpoint", file: url, ...loc, condition: "const id = preview.id; id === 563 // this order" }
      },
      { trigger: () => page.hover("#preview"), timeoutMs: 30000 }
    );
    assert(res.status, "==", "found");
    assert(res.matchAtStart, "==", true);
  });

  await test("testRunBDHSBreakpointFalseCondition", async () => {
    const url = `${BASE}/origin-trace.html?id=65`;
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("#preview", { timeout: 5000 });
    const res = await heapModule.runBDHS(
      {
        pageId: "1", ...tokenSearch(565),
        arm: { type: "breakpoint", file: url, ...locationOf("const preview = { id"), condition: "false" }
      },
      { trigger: () => page.hover("#preview"), timeoutMs: 2000 }
    );
    assert(res.status, "==", "timeout");
    assert(res.started, "==", false);
    assert(heapModule.activeBDHS, "==", null);
    assert(pageEntry.debugger.isEnabled, "==", false);
  });

  await test("testRunBDHSBreakpointUnresolved", async () => {
    await page.goto(`${BASE}/origin-trace.html?id=67`, { waitUntil: "networkidle0" });
    const res = await heapModule.runBDHS(
      { pageId: "1", ...tokenSearch(67), arm: { type: "breakpoint", file: `${BASE}/nope.js`, line: 3 } },
      { timeoutMs: 1500 }
    );
    assert(res.status, "==", "timeout");
    assert(res.arm.resolvedLocations.length, "==", 0);
    assert(res.arm.col, "==", 1);
    assert(heapModule.activeBDHS, "==", null);
  });

  await test("testStartBDHSInvalidArm", async () => {
    for (const [arm, msg] of [
      [{ type: "hover" }, "Unknown trigger type 'hover'"],
      [{ type: "breakpoint", line: 3 }, "Breakpoint file is not set"],
      [{ type: "breakpoint", file: "x.js", line: 0 }, "Breakpoint line and column must be integers >= 1"],
      [{ type: "breakpoint", file: "x.js", line: 3, condition: "a ===" }, "Invalid breakpoint condition"],
      [{ type: "breakpoint", file: "x.js", line: 3, condition: "1); foo(" }, "Invalid breakpoint condition"],
    ]) {
      let error = null;
      try {
        await heapModule.startBDHS({ pageId: "1", ...tokenSearch(1), arm });
      } catch (e) {
        error = e;
      }
      assert(error?.message ?? "", "startsWith", msg);
      assert(heapModule.activeBDHS, "==", null);
    }
  });

  console.log(failed === 0 ? green("ALL PASSED") : red(`${failed} FAILED`));
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 1000);
})();
