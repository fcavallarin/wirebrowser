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

  const { heapModule, modulesManager } = await setupHeapAndDebugger();

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
    assert(names, "==", "evaluate,get_source_window,list_pages,navigate,origin_trace,run_with_hooks,search_live_objects,search_sources");
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

  await client.close();
  await mcpServer.stop();
  console.log(failed === 0 ? green("ALL PASSED") : red(`${failed} FAILED`));
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 1000);
})();
