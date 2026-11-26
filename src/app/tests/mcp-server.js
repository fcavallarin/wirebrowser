// End-to-end tests of the MCP server: a real MCP client talks to the server,
// which drives a real browser page.
//
// Run from the repo root:  node src/app/tests/mcp-server.js

import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setupHeapAndDebugger, runHttpServer } from "#src/app/tests/test-utils.js";
import { red, green, assert } from "./test-utils.js";
import WirebrowserMcpServer from "#src/app/mcp/mcp-server.js";
import HOOK_SPEC from "#src/app/modules/debugger/hook-spec.generated.js";

const BASE = "http://localhost:3000";
const MCP_PORT = 17655;
const TOKEN = "test-token-0123456789abcdef";

const rawRequest = (headers, method = "POST") => new Promise((resolve) => {
  const req = http.request({
    host: "127.0.0.1",
    port: MCP_PORT,
    path: "/mcp",
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers
    }
  }, (res) => {
    res.resume();
    res.on("end", () => resolve(res.statusCode));
  });
  req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
});

(async () => {
  runHttpServer(3000, null);

  const { heapModule, networkModule, settingsManager, modulesManager } = await setupHeapAndDebugger(undefined, { network: true });

  const mcpServer = new WirebrowserMcpServer({
    pagesManager: heapModule.pagesManager,
    modulesManager,
    version: "test",
  });
  await mcpServer.start({ port: MCP_PORT, token: TOKEN });

  const client = new Client({ name: "wirebrowser-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${MCP_PORT}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }
  ));

  const call = async (name, args) => {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content[0].text;
    if (res.isError) {
      return { isError: true, text };
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  let failed = 0;
  async function test(label, fn) {
    try {
      await fn();
      console.log(green(`[${label}] PASSED`));
    } catch (e) {
      failed++;
      console.log(red(`[${label}] FAILED: ${e.message}`));
    }
  }

  const URL41 = `${BASE}/origin-trace.html?id=41`;

  await test("testSecurityChecks", async () => {
    assert(await rawRequest({}), "==", 401);
    assert(await rawRequest({ authorization: "Bearer wrong-token" }), "==", 401);
    assert(await rawRequest({ authorization: `Bearer ${TOKEN}`, host: `evil.example:${MCP_PORT}` }), "==", 403);
    assert(await rawRequest({ authorization: `Bearer ${TOKEN}`, origin: "https://evil.example" }), "==", 403);
    assert(await rawRequest({ authorization: `Bearer ${TOKEN}` }, "GET"), "==", 405);
  });

  await test("testListTools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort().join(",");
    assert(names, "==", "evaluate,get_request,get_source_window,list_pages,list_requests,navigate,origin_trace,run_with_hooks,save_hooks_script,search_live_objects,search_sources");
  });

  await test("testNavigateAndListPages", async () => {
    const nav = await call("navigate", { pageId: "1", url: URL41 });
    assert(nav.status, "==", 200);
    const { pages } = await call("list_pages", {});
    assert(pages[0].pageId, "==", "1");
    assert(pages[0].url, "==", URL41);
    assert(pages[0].title, "==", "Origin Trace Testbed");
  });

  await test("testSearchSources", async () => {
    const res = await call("search_sources", { pageId: "1", query: "function handleBuy" });
    assert(res.matches.length, "==", 1);
    assert(res.matches[0].url, "==", URL41);
    assert(res.matches[0].line, "==", 23);  // document-relative (inline script)
    assert(res.matches[0].col, "==", 5);
    assert(res.matches[0].snippet, "startsWith", "function handleBuy(e)");
  });

  await test("testGetSourceWindow", async () => {
    const text = await call("get_source_window", { pageId: "1", url: URL41, line: 23, before: 1, after: 1 });
    const lines = text.split("\n");
    assert(lines.length, "==", 3);
    assert(lines[1], "startsWith", "    23 > | ");
    assert(lines[1].includes("function handleBuy(e)"), "==", true);
  });

  await test("testRunWithHooks", async () => {
    const res = await call("run_with_hooks", {
      pageId: "1",
      hooks: [{
        file: URL41,
        line: 23,
        onEnter: "ctx.send(orderId)",
        onLeave: "ctx.send(window.lastOrder.token)",
      }],
      trigger: { type: "click", selector: "#buy" },
      minResults: 2,
      timeoutMs: 5000,
    });
    assert(res.timedOut, "==", false);
    assert(res.results[0].phase, "==", "enter");
    assert(res.results[0].messages[0], "==", 41);
    assert(res.results[0].location, "==", `${URL41}:23:5`);
    assert(res.results[0].stack[0], "startsWith", "handleBuy ");
    assert(res.functionSources[res.results[0].functionSourceId], "startsWith", "function handleBuy(e)");
    assert(res.results[1].phase, "==", "leave");
    assert(res.results[1].messages[0], "==", "wb-origin-trace-82");
    // The debugger must be released for the next tool
    assert(heapModule.pagesManager.get("1").debugger.isEnabled, "==", false);
  });

  await test("testRunWithHooksError", async () => {
    const res = await call("run_with_hooks", {
      pageId: "1",
      hooks: [{ file: URL41, line: 16, onEnter: "ctx.send(1)" }],
    });
    assert(res.isError, "==", true);
    assert(res.text, "startsWith", `File '${URL41}':16: no function starts at this line`);
  });

  await test("testRunWithHooksFollowReturn", async () => {
    const res = await call("run_with_hooks", {
      pageId: "1",
      hooks: [{
        file: URL41,
        line: 18,  // createToken
        onLeave: "ctx.send('leave'); ctx.followReturn();",
        onReturnFollowed: "ctx.send(previousStep.phase); ctx.send(previousStep.messages[0]); ctx.send(Object.keys(previousStep));",
      }],
      trigger: { type: "click", selector: "#buy" },
      minResults: 2,
      timeoutMs: 5000,
    });
    assert(res.timedOut, "==", false);
    const followed = res.results.find(r => r.phase === "returnFollowed");
    assert(followed?.messages?.slice(0, 2).join(","), "==", "leave,leave");
    // previousStep has the fields of the spec (optional ones may be missing)
    const keys = followed.messages[2];
    for (const f of HOOK_SPEC.previousStep) {
      assert(`${f.name}: ${keys.includes(f.name) || f.optional}`, "==", `${f.name}: true`);
    }
    assert(keys.filter(k => !HOOK_SPEC.previousStep.some(f => f.name === k)).join(","), "==", "");
    assert(followed.stack[0], "startsWith", "handleBuy ");
    assert(res.functionSources[followed.functionSourceId], "startsWith", "function handleBuy(e)");
    assert(heapModule.pagesManager.get("1").debugger.isEnabled, "==", false);
  });

  await test("testRunWithHooksStep", async () => {
    const res = await call("run_with_hooks", {
      pageId: "1",
      hooks: [{
        file: URL41,
        line: 23,  // handleBuy
        onEnter: "ctx.stepOver()",
        onStep: "ctx.send(previousStep.phase); ctx.send(typeof order);",
      }],
      trigger: { type: "click", selector: "#buy" },
      minResults: 2,
      timeoutMs: 5000,
    });
    assert(res.timedOut, "==", false);
    const stepped = res.results.find(r => r.phase === "stepFollowed");
    assert(stepped?.messages?.join(","), "==", "enter,object");
    assert(stepped.stack[0], "startsWith", "handleBuy ");
    assert(heapModule.pagesManager.get("1").debugger.isEnabled, "==", false);
  });

  await test("testSaveHooksScript", async () => {
    const hooks = [{
      file: URL41,
      line: 23,
      onEnter: "ctx.log('saved hook, orderId=' + orderId)",
    }];
    const res = await call("save_hooks_script", {
      name: "order-hooks",
      pageId: "1",
      hooks,
      description: "Logs the order id on every buy",
    });
    assert(res.saved, "==", "order-hooks.js");
    assert(res.content, "startsWith", "// Logs the order id on every buy");

    const files = settingsManager.settings.automation.pptrscripts.files;
    const file = files.find(f => f.name === "order-hooks.js");
    assert(file.content, "==", res.content);
    assert(file.content.includes("onEnter(ctx) {"), "==", true);

    // Same name without overwrite: refused
    const again = await call("save_hooks_script", { name: "order-hooks.js", pageId: "1", hooks });
    assert(again.isError, "==", true);
    assert(again.text, "startsWith", "A Node Script named 'order-hooks.js' already exists");

    // The saved script works when run as a Node Script (like from the GUI)
    const logs = [];
    await new Promise((resolve) => {
      heapModule.uiEvents.listeners["automation.runPptrScript"]({ fileId: file.id }, (event, data) => {
        if (event === "automation.runPptrScriptLog") {
          logs.push(data.text);
        }
        if (event === "automation.runPptrScriptDone") {
          resolve();
        }
      });
    });
    await heapModule.pagesManager.get("1").page.click("#buy");
    await new Promise(r => setTimeout(r, 1000));
    await modulesManager.getModule("debugger").disableDebugger("1");
    assert(logs.some(l => l.includes("saved hook, orderId=41")), "==", true);
  });

  await test("testEvaluate", async () => {
    const res = await call("evaluate", { pageId: "1", expression: "window.lastOrder.token" });
    assert(res.value, "==", "wb-origin-trace-82");
  });

  await test("testSearchLiveObjects", async () => {
    const res = await call("search_live_objects", {
      pageId: "1",
      valueSearch: { pattern: "wb-origin-trace-82", exact: true },
    });
    assert(res.totalResults >= 1, "==", true);
    assert(res.results.some(r => r.object.token === "wb-origin-trace-82"), "==", true);
  });

  const URL_NET = `${BASE}/network.html`;

  // Polls list_requests until a request matching urlFilter reaches one of the states
  const waitForRequest = async (args, states) => {
    for (let i = 0; i < 50; i++) {
      const res = await call("list_requests", args);
      const r = res.requests.find(x => states.includes(x.state));
      if (r) {
        return r;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

  await test("testListAndGetRequests", async () => {
    await call("navigate", { pageId: "1", url: URL_NET });
    const before = await call("list_requests", { pageId: "1" });
    assert(before.requests.some(r => r.url === URL_NET && r.type === "document" && r.state === "done"), "==", true);

    await call("evaluate", { pageId: "1", expression: "document.getElementById('send').click()" });
    const req = await waitForRequest({ pageId: "1", sinceId: before.lastId, urlFilter: "order.json" }, ["done"]);
    assert(req?.method, "==", "POST");
    assert(req.type, "==", "fetch");
    assert(req.status, "==", 200);

    const full = await call("get_request", { id: req.id });
    assert(full.request.headers["x-order"], "==", "41");
    assert(full.request.body, "==", '{"id":41}');
    assert(JSON.parse(full.response.body).token, "==", "wb-net-82");
    assert(full.initiator.type, "==", "script");
    assert(full.initiator.stack[0], "startsWith", `sendOrder ${URL_NET}:12:`);

    const missing = await call("get_request", { id: 999999 });
    assert(missing.isError, "==", true);
    assert(missing.text, "startsWith", "Request 999999 not found");
  });

  await test("testRequestBlockedByInterceptor", async () => {
    await settingsManager.update((s) => {
      s.network.interceptor.blockFilters.enabled = true;
    });
    try {
      const { lastId } = await call("list_requests", { pageId: "1" });
      await call("evaluate", { pageId: "1", expression: "document.getElementById('send').click()" });
      const blocked = await waitForRequest({ sinceId: lastId, urlFilter: "order.json" }, ["blocked"]);
      assert(blocked?.state, "==", "blocked");

      // What the UI does when the user continues it
      await networkModule.getRequestById(blocked.id).req.continue();
      const done = await waitForRequest({ sinceId: lastId, urlFilter: "order.json" }, ["done"]);
      assert(done?.id, "==", blocked.id);
    } finally {
      await settingsManager.update((s) => {
        s.network.interceptor.blockFilters.enabled = false;
      });
    }
  });

  await test("testOriginTrace", async () => {
    await call("navigate", { pageId: "1", url: `${BASE}/origin-trace.html?id=53` });
    const res = await call("origin_trace", {
      pageId: "1",
      valueSearch: { pattern: "wb-origin-trace-106", exact: true },
      trigger: { type: "click", selector: "#buy" },
      timeoutMs: 30000,
    });
    if (res.status !== "found") {
      console.log(JSON.stringify(res, null, 2));
    }
    assert(res.status, "==", "found");
    assert(res.frames.some(f => f.functionName === "handleBuy"), "==", true);
  });

  await test("testOriginTraceStartAt", async () => {
    const url = `${BASE}/origin-trace.html?id=71`;
    await call("navigate", { pageId: "1", url });
    const { matches } = await call("search_sources", { pageId: "1", query: "const preview = { id" });
    assert(matches.length, "==", 1);
    const res = await call("origin_trace", {
      pageId: "1",
      valueSearch: { pattern: "wb-origin-trace-1142", exact: true },
      startAt: { file: matches[0].url, line: matches[0].line, col: matches[0].col },
      trigger: {
        type: "evaluate",
        expression: "document.getElementById('preview').dispatchEvent(new MouseEvent('mouseover'))"
      },
      timeoutMs: 30000,
    });
    if (res.status !== "found") {
      console.log(JSON.stringify(res, null, 2));
    }
    assert(res.status, "==", "found");
    assert(res.warnings, "==", undefined);
    assert(res.startedAt.line, "==", matches[0].line);
    assert(res.frames.some(f => f.functionName === "loadPreview"), "==", true);
  });

  await test("testOriginTraceNeedsTriggerOrStartAt", async () => {
    const res = await call("origin_trace", { pageId: "1", valueSearch: { pattern: "x" } });
    assert(res.isError, "==", true);
    assert(res.text.includes("Pass a trigger"), "==", true);
  });

  await client.close();
  await mcpServer.stop();
  console.log(failed === 0 ? green("ALL PASSED") : red(`${failed} FAILED`));
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 1000);
})();
