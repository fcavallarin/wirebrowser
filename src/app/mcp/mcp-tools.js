import { z } from "zod";
import HookEventBuffer from "#src/app/modules/debugger/hook-event-buffer.js";
import { generateHookScript } from "#src/app/modules/debugger/hook-script.js";
import { validateAndAdjustSearchQuery } from "#src/app/modules/automation/node-api.js";
import { escapeRegex } from "#src/common/utils.js";
import {
  truncate, boundValue, jsonResult, textResult, errorResult, toTextMatch, sleep
} from "#src/app/mcp/mcp-utils.js";

const MAX_STACK_FRAMES = 8;
const MAX_FUNCTION_SOURCE = 4000;

const pageIdSchema = z.string().describe("Page id, as returned by list_pages");

const textQuerySchema = z.object({
  pattern: z.string().min(1),
  regex: z.boolean().optional().describe("Treat pattern as a regular expression"),
  matchCase: z.boolean().optional(),
  exact: z.boolean().optional().describe("Match the whole text instead of a substring"),
});

const triggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    selector: z.string().describe("CSS selector of the element to click"),
  }),
  z.object({
    type: z.literal("evaluate"),
    expression: z.string().describe("JavaScript expression evaluated in the page"),
  }),
]);

const hooksSchema = z.array(z.object({
  file: z.string().describe("Script url, as returned by search_sources"),
  line: z.number().int().min(1),
  col: z.number().int().min(1).optional(),
  onEnter: z.string().optional(),
  onLeave: z.string().optional(),
  at: z.array(z.object({
    location: z.string().describe("'line:col', 1-based, document-relative"),
    onHit: z.string(),
  })).optional(),
})).min(1);

const runTrigger = (page, trigger) => {
  if (trigger.type === "click") {
    return page.click(trigger.selector);
  }
  return page.evaluate(trigger.expression);
};

const formatStack = (stackTrace) => (stackTrace || []).slice(0, MAX_STACK_FRAMES).map(f =>
  `${f.functionName || "(anonymous)"} ${f.file || "?"}:${f.line}:${f.col}${f.type === "async" ? " (async)" : ""}`
);

// Registers the Wirebrowser tools on an McpServer.
// ctx: { pagesManager, modulesManager, lock }
export const registerTools = (server, ctx) => {
  const { pagesManager, modulesManager, lock } = ctx;

  const getModule = (name) => {
    const m = modulesManager.getModule(name);
    if (!m) {
      throw new Error("The Wirebrowser browser is not running");
    }
    return m;
  };

  const getPage = (pageId) => {
    getModule("debugger");
    const p = pagesManager.get(pageId);
    if (!p) {
      throw new Error(`Page ${pageId} not found (use list_pages)`);
    }
    return p;
  };

  // Every tool runs under the lock and turns exceptions into tool errors
  const tool = (name, config, handler) => {
    server.registerTool(name, config, async (args) => {
      try {
        return await lock.run(() => handler(args));
      } catch (e) {
        return errorResult(e?.message || String(e));
      }
    });
  };

  // ------------------------------------------------------------------ pages

  tool("list_pages", {
    title: "List pages",
    description: "Lists the pages (tabs) open in the Wirebrowser browser, with their ids.",
    inputSchema: {},
  }, async () => {
    getModule("debugger");
    const pages = [];
    for (const [pageId, p] of pagesManager.pages) {
      let title = "";
      try {
        title = await p.page.title();
      } catch { /* page navigating */ }
      pages.push({ pageId, url: p.page.url(), title });
    }
    return jsonResult({ pages });
  });

  tool("navigate", {
    title: "Navigate",
    description: "Loads a URL in a page and waits for the load event.",
    inputSchema: {
      pageId: pageIdSchema,
      url: z.string(),
      timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    },
  }, async ({ pageId, url, timeoutMs }) => {
    const { page } = getPage(pageId);
    const response = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    return jsonResult({ url: page.url(), status: response?.status() ?? null });
  });

  tool("evaluate", {
    title: "Evaluate JavaScript",
    description: [
      "Evaluates a JavaScript expression in the page and returns its JSON-serializable result.",
      "Use an async IIFE for statements: (async () => { ... })().",
    ].join(" "),
    inputSchema: {
      pageId: pageIdSchema,
      expression: z.string(),
    },
  }, async ({ pageId, expression }) => {
    const { page } = getPage(pageId);
    const value = await page.evaluate(expression);
    return jsonResult({ value: boundValue(value, 20000) });
  });

  // ---------------------------------------------------------------- sources

  tool("search_sources", {
    title: "Search sources",
    description: [
      "Searches the JavaScript sources loaded by the page (external files, inline <script>s,",
      "eval'd code listed as scriptId://<id>). Returns url, line and col of each match (1-based,",
      "document-relative: use them as-is with get_source_window, run_with_hooks).",
      "Vendor/framework scripts are skipped unless includeVendor is true.",
    ].join(" "),
    inputSchema: {
      pageId: pageIdSchema,
      query: z.string().min(1),
      regex: z.boolean().default(false),
      matchCase: z.boolean().default(false),
      urlFilter: z.string().optional().describe("Only search scripts whose url contains this text"),
      includeVendor: z.boolean().default(false),
      maxResults: z.number().int().min(1).max(200).default(30),
    },
  }, async ({ pageId, query, regex, matchCase, urlFilter, includeVendor, maxResults }) => {
    const pattern = new RegExp(regex ? query : escapeRegex(query), matchCase ? "g" : "gi");
    const matches = [];
    let truncated = false;
    let scanned = 0;

    getPage(pageId);
    await getModule("debugger").withScripts(pageId, async (dbg) => {
      for (const script of dbg.getParsedScripts()) {
        if ((!includeVendor && script.blacklisted) || (urlFilter && !script.url.includes(urlFilter))) {
          continue;
        }
        let source;
        try {
          source = await dbg.getScriptSource(script.scriptId);
        } catch {
          continue;
        }
        scanned++;
        const lines = source.split("\n");
        for (let i = 0; i < lines.length && !truncated; i++) {
          pattern.lastIndex = 0;
          let m;
          while ((m = pattern.exec(lines[i])) !== null) {
            if (matches.length >= maxResults) {
              truncated = true;
              break;
            }
            const loc = dbg.toDocumentLocation(script.scriptId, i + 1, m.index + 1);
            const from = Math.max(0, m.index - 80);
            const to = Math.min(lines[i].length, m.index + m[0].length + 80);
            matches.push({
              url: script.url,
              line: loc.line,
              col: loc.col,
              snippet: `${from > 0 ? "…" : ""}${lines[i].slice(from, to).trim()}${to < lines[i].length ? "…" : ""}`,
            });
            if (m[0].length === 0) {
              pattern.lastIndex++;
            }
          }
        }
        if (truncated) {
          break;
        }
      }
    });
    return jsonResult({ matches, truncated, scriptsSearched: scanned });
  });

  tool("get_source_window", {
    title: "Get source window",
    description: [
      "Returns the source lines around a location of a script, prefixed with their",
      "document-relative line numbers. With col, long (minified) lines are cut around that column.",
    ].join(" "),
    inputSchema: {
      pageId: pageIdSchema,
      url: z.string().describe("Script url, as returned by search_sources"),
      line: z.number().int().min(1),
      col: z.number().int().min(1).optional(),
      before: z.number().int().min(0).max(200).default(10),
      after: z.number().int().min(0).max(400).default(30),
      maxLineChars: z.number().int().min(40).max(2000).default(300),
    },
  }, async ({ pageId, url, line, col, before, after, maxLineChars }) => {
    getPage(pageId);
    const text = await getModule("debugger").withScripts(pageId, async (dbg) => {
      const sid = dbg.getScriptId(url);
      if (!sid) {
        throw new Error(`Script '${url}' not found (use search_sources to get script urls)`);
      }
      const source = await dbg.getScriptSource(sid);
      const lines = source.split("\n");
      const center = dbg.toSourceLocation(sid, line, 1).line - 1;
      if (center < 0 || center >= lines.length) {
        const first = dbg.toDocumentLocation(sid, 1, 1).line;
        throw new Error(`Line ${line} is outside the script (lines ${first}-${first + lines.length - 1})`);
      }
      const out = [];
      for (let i = Math.max(0, center - before); i <= Math.min(lines.length - 1, center + after); i++) {
        let content = lines[i];
        if (content.length > maxLineChars) {
          let start = 0;
          if (col !== undefined && i === center) {
            const c = dbg.toSourceLocation(sid, line, col).col - 1;
            start = Math.max(0, Math.min(c - Math.floor(maxLineChars / 2), content.length - maxLineChars));
          }
          const startCol = dbg.toDocumentLocation(sid, i + 1, start + 1).col;
          content = `${start > 0 ? `[from col ${startCol}] …` : ""}${content.slice(start, start + maxLineChars)}…`;
        }
        const n = dbg.toDocumentLocation(sid, i + 1, 1).line;
        out.push(`${String(n).padStart(6)}${i === center ? " >" : "  "} | ${content}`);
      }
      return out.join("\n");
    });
    return textResult(text);
  });

  // ---------------------------------------------------------- instrumentation

  tool("run_with_hooks", {
    title: "Run with hooks",
    description: [
      "Hooks functions with the debugger (no source changes, works inside closures), runs an optional",
      "trigger, collects what the hooks report, then removes the hooks.",
      "Handlers are JavaScript function BODIES (strings) executed in the page, in the paused frame:",
      "local variables, arguments and closure variables are in scope by name.",
      "ctx.send(value) reports a value; ctx.log(text) logs; ctx.arguments / ctx.variables are the names",
      "in scope; ctx.setVariable(name, value) changes a variable; ctx.eval(expr) evaluates an expression",
      "and reports it (evalResult). In onLeave: ctx.returnValue.value is the return value,",
      "ctx.return(value) overrides it. `at` handlers (onHit) run at a 'line:col' inside the function.",
      "Without col, a hook targets the function declared on that line.",
      "The call returns when minResults hook results arrived or after timeoutMs.",
    ].join(" "),
    inputSchema: {
      pageId: pageIdSchema,
      hooks: hooksSchema,
      trigger: triggerSchema.optional().describe("Action that makes the page run the hooked code"),
      timeoutMs: z.number().int().min(100).max(120000).default(10000),
      minResults: z.number().int().min(1).default(1),
      maxEvents: z.number().int().min(1).max(1000).default(100),
    },
  }, async ({ pageId, hooks, trigger, timeoutMs, minResults, maxEvents }) => {
    const { page } = getPage(pageId);
    const dbgModule = getModule("debugger");
    const buffer = new HookEventBuffer({ maxEvents });

    for (const h of hooks) {
      const handlers = {};
      for (const k of ["onEnter", "onLeave"]) {
        if (h[k]) {
          handlers[k] = h[k];
        }
      }
      if (h.at) {
        handlers.at = h.at;
      }
      dbgModule.addHook({ file: h.file, line: h.line, col: h.col }, handlers, buffer.handleResult);
    }

    // startHooks validates the hooks and cleans up after itself on failure
    await dbgModule.startHooks(pageId, buffer.events);

    let timedOut = true;
    let triggerError;
    try {
      if (trigger) {
        // Not awaited: the trigger may block while the debugger is paused
        runTrigger(page, trigger).catch((e) => {
          triggerError = e?.message || String(e);
        });
      }
      ({ timedOut } = await buffer.waitForEvents({ minResults, timeoutMs }));
      if (!timedOut) {
        await sleep(300);  // let pending results of the same call arrive
      }
    } finally {
      await dbgModule.disableDebugger(pageId);
    }

    const { events, dropped, functionSources } = buffer.drain();
    const results = [];
    const logs = [];
    for (const e of events) {
      if (e.type === "result" || e.type === "hookError") {
        const r = e.result;
        results.push({
          phase: r.phase,
          location: r.location,
          messages: r.messages?.map(m => boundValue(m)),
          error: r.error,
          evalResult: r.evalResult ? boundValue(r.evalResult.value ?? r.evalResult.description) : undefined,
          functionSourceId: r.functionSourceId,
          stack: formatStack(r.stackTrace),
        });
      } else {
        logs.push(`${e.type}: ${truncate(e.message, 500)}`);
      }
    }
    for (const id in functionSources) {
      functionSources[id] = truncate(functionSources[id], MAX_FUNCTION_SOURCE);
    }
    return jsonResult({
      results,
      functionSources,
      logs,
      timedOut,
      droppedEvents: dropped,
      triggerError,
    });
  });

  tool("save_hooks_script", {
    title: "Save hooks as a Node Script",
    description: [
      "Saves hooks as a Node Script in the open Wirebrowser project (Automation → Node Scripts),",
      "so the user can re-run, edit and keep them. Pass the hooks you verified with run_with_hooks",
      "(same format). The script registers the hooks and starts them on pageId when executed;",
      "it runs no trigger. Handlers are validated, not executed. Note: hooks are tied to the",
      "script url and line, a new deploy of the site may move them.",
    ].join(" "),
    inputSchema: {
      name: z.string().min(1).describe("File name of the script; .js is added if missing"),
      pageId: pageIdSchema,
      hooks: hooksSchema,
      description: z.string().optional().describe("What the hooks do; written as a comment at the top"),
      overwrite: z.boolean().default(false),
    },
  }, async ({ name, pageId, hooks, description, overwrite }) => {
    const content = generateHookScript({ hooks, pageId, description });
    const file = await getModule("automation").saveNodeScript(name, content, { overwrite });
    return jsonResult({
      saved: file.name,
      location: "Automation → Node Scripts",
      content,
    });
  });

  // ----------------------------------------------------------------- memory

  tool("search_live_objects", {
    title: "Search live objects",
    description: [
      "Searches the live JavaScript objects of the page (including objects not reachable from window)",
      "by property name, primitive value and/or class name. At least one criterion is required.",
    ].join(" "),
    inputSchema: {
      pageId: pageIdSchema,
      propertySearch: textQuerySchema.optional(),
      valueSearch: textQuerySchema.optional(),
      classSearch: textQuerySchema.optional(),
      maxResults: z.number().int().min(1).max(100).default(20),
    },
  }, async ({ pageId, propertySearch, valueSearch, classSearch, maxResults }) => {
    getPage(pageId);
    const res = await getModule("heap").searchLiveObjects({
      ...validateAndAdjustSearchQuery(pageId, {
        propertySearch: toTextMatch(propertySearch),
        valueSearch: toTextMatch(valueSearch),
        classSearch: toTextMatch(classSearch),
      }),
      searchMode: "global",
    });
    return jsonResult({
      results: res.results.slice(0, maxResults).map(r => ({
        className: r.className,
        object: boundValue(r.obj, 1500),
      })),
      totalResults: res.totResults,
      objectsAnalyzed: res.totObjectAnalyzed,
      limitReached: res.resultsLimitReached || res.results.length > maxResults,
    });
  });

  tool("origin_trace", {
    title: "Origin Trace",
    description: [
      "Finds the function that creates a value: arms a scan on the next DOM click, runs the trigger",
      "(which must cause that click), then takes heap snapshots while stepping out of the user-land",
      "handler until the value appears. Returns the frames around the first snapshot containing the",
      "value (isFirstMatch). Slow: use it when hooks and source search are not enough.",
    ].join(" "),
    inputSchema: {
      pageId: pageIdSchema,
      propertySearch: textQuerySchema.optional(),
      valueSearch: textQuerySchema.optional(),
      classSearch: textQuerySchema.optional(),
      trigger: triggerSchema,
      timeoutMs: z.number().int().min(1000).max(300000).default(60000),
      stepsBefore: z.number().int().min(0).max(50).default(6),
      stepsAfter: z.number().int().min(0).max(50).default(15),
    },
  }, async ({ pageId, propertySearch, valueSearch, classSearch, trigger, timeoutMs, stepsBefore, stepsAfter }) => {
    const { page } = getPage(pageId);
    const res = await getModule("heap").runBDHS({
      ...validateAndAdjustSearchQuery(pageId, {
        propertySearch: toTextMatch(propertySearch),
        valueSearch: toTextMatch(valueSearch),
        classSearch: toTextMatch(classSearch),
      }),
      toleranceWinBefore: stepsBefore,
      toleranceWinAfter: stepsAfter,
    }, {
      trigger: () => runTrigger(page, trigger),
      timeoutMs,
    });
    return jsonResult({
      status: res.status,
      error: res.error,
      scanTimeMs: res.scanTime,
      frames: (res.results || []).map(r => ({
        functionName: r.functionName || "(anonymous)",
        file: r.file,
        line: r.lineNumber,
        col: r.columnNumber,
        isFirstMatch: r.isFirstMatch,
      })),
    });
  });
};
