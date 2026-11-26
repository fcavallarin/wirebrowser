import BaseModule from "#src/app/base-module.js";
import * as acorn from "acorn";
import {
  parseSnapshot, captureSnapshot,
  searchObjects, buildReverseEdges,
  buildJsPath, inspectObject
} from "#src/app/modules/heap/search-snapshot.js"

import { searchByRootToEvaluate } from "#src/app/modules/heap/search-byroot.js"
import { searchGlobalToEvaluate } from "#src/app/modules/heap/search-global.js"
import { textMatches, tagInternalSource } from "#src/common/utils.js";
import { safeJsonStringify, iterate } from "#src/app/utils.js";
import { ObjectSimilarity } from "#src/app/object-similarity.js";
import BDHSExecutor from "#src/app/modules/heap/bdhs.js";


class Heap extends BaseModule {
  run = () => {

    this.activeBDHS = null;

    this.uiEvents.on("heap.startBDHS", async (data, respond) => {
      const { pageId } = data;
      try {
        await this.startBDHS(data, {
          "started": (d) => {
            respond("heap.BDHSStatus", { ...d, pageId, message: "Started" });
          },
          "progress": (d) => {
            const message = d.matchFound ?
              "Found, finalising results" : (
                d.finalising ? "Finalising" : "Searching"
              );
            respond("heap.BDHSStatus", { ...d, pageId, message });
          },
          "maxReached": (d) => {
            respond("heap.BDHSError", { ...d, pageId, reason: "Max reached" });
          },
          "found": (d) => {
            respond("heap.BDHSResult", { ...d, pageId });
          },
          "notfound": (d) => {
            respond("heap.BDHSResult", { ...d, pageId });
          },
          "aborted": (d) => {
            respond("heap.BDHSStatus", { ...d, pageId, message: "Aborted" });
          },
          "armed": (d) => {
            respond("heap.BDHSArmed", { ...d, pageId });
          },
          "completed": (d) => {
            respond("heap.BDHSFinished", { ...d, pageId });
          },
        });
      } catch (e) {
        this.uiEvents.dispatch("Error", e.message);
        respond("heap.BDHSError");
      }
    });

    this.uiEvents.on("heap.stopBDHS", async (data, respond) => {
      try {
        await this.stopBDHS();
      } catch (e) {
        this.uiEvents.dispatch("Error", e.message);
      }
    });

    this.uiEvents.on("heap.searchSnapshot", async (data, respond) => {
      respond("heap.searchSnapshotResult", await this.searchSnapshot(data));
    });

    this.uiEvents.on("heap.searchLiveObjects", async (data, respond) => {
      let searchResults;
      try {
        searchResults = await this.searchLiveObjects(data);
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
      }
      respond("heap.searchLiveObjectsResult", searchResults);
    });

    this.uiEvents.on("heap.exposeObject", async (data, respond) => {
      const { pageId, objectId, varName } = data;
      let resp = "ok";
      try {
        const page = this.pagesManager.get(pageId).page;
        await page._client().send('Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: tagInternalSource(`function() { window['${varName}'] = this; return this; }`),
        });
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
        resp = "err";
      }
      respond("heap.exposeObjectResult", resp);
    });

    // @TODO: move under debugger module
    this.uiEvents.on("heap.getDebuggerParsedScripts", async (data, respond) => {
      respond(
        "heap.getDebuggerParsedScriptsResult",
        { scripts: this.pagesManager.get(data.pageId).debugger.getParsedScripts() }
      );
    });
  }

  stop = () => {
    for (const e of this.uiEvents.getRegisteredEvents()) {
      if (e.startsWith("heap.")) {
        this.uiEvents.off(e);
      }
    }
  }

  // enableDebugger = async (pageId, respond) => {
  //   const dbg = this.pagesManager.get(pageId).debugger;
  //   if (dbg.isEnabled) {
  //     return dbg;
  //   }

  //   dbg.on("paused", async (data) => {
  //     if (respond) {
  //       respond("heap.onDebuggerPaused", { pageId, event: data });
  //     }
  //   });
  //   await dbg.enable();
  //   return dbg;
  // }

  // Starts an Origin Trace (BDHS) scan. `params` contains pageId, the
  // snapshot search query (same fields as searchSnapshot) and optionally
  // toleranceWinBefore / toleranceWinAfter. `events` receives the executor
  // events: armed, started, progress, found, notfound, maxReached, aborted,
  // completed. `params.arm` decides what starts the scan (see BDHSExecutor):
  // { type: "click" } (default) or { type: "breakpoint", file, line, col?,
  // condition? }.
  startBDHS = async (params, events = {}) => {
    if (this.activeBDHS !== null) {
      throw new Error("Multiple scan sessions are not supported");
    }
    const page = this.pagesManager.get(params.pageId);
    if (!page) {
      throw new Error(`Page ${params.pageId} not found`);
    }
    const dbg = page.debugger;
    if (dbg.isEnabled) {
      throw new Error("Debugger is already in use");
    }
    const { toleranceWinBefore = 6, toleranceWinAfter = 15 } = params;
    const arm = this.validateBDHSArm(params.arm);
    this.activeBDHS = new BDHSExecutor(
      dbg,
      [toleranceWinBefore, toleranceWinAfter],
      async () => {
        return await this.searchSnapshot(params, 10);
      },
      {
        ...events,
        "completed": (d) => {
          this.activeBDHS = null;
          if (events.completed) {
            events.completed(d);
          }
        },
      },
      arm
    );
    try {
      await this.activeBDHS.start();
    } catch (e) {
      this.activeBDHS = null;
      throw e;
    }
  };

  validateBDHSArm = (arm) => {
    if (!arm || arm.type === undefined || arm.type === "click") {
      return { type: "click" };
    }
    if (arm.type !== "breakpoint") {
      throw new Error(`Unknown trigger type '${arm.type}'`);
    }
    const { file, condition } = arm;
    const line = Number(arm.line);
    const col = arm.col === undefined || arm.col === null || arm.col === "" ? 1 : Number(arm.col);
    if (!file) {
      throw new Error("Breakpoint file is not set");
    }
    if (!Number.isInteger(line) || line < 1 || !Number.isInteger(col) || col < 1) {
      throw new Error("Breakpoint line and column must be integers >= 1");
    }
    if (condition) {
      try {
        // Syntax check
        acorn.parse(condition, { ecmaVersion: "latest" });
      } catch (e) {
        throw new Error(`Invalid breakpoint condition: ${e.message}`);
      }
    }
    return { type: "breakpoint", file, line, col, ...(condition ? { condition } : {}) };
  };

  stopBDHS = async () => {
    if (this.activeBDHS === null) {
      throw new Error("Scan is not running");
    }
    await this.activeBDHS.abort();
  };

  // Promise-based Origin Trace for programmatic callers.
  // `trigger` is invoked once the scan is armed and must cause the pause that
  // starts it: the DOM click (e.g. `() => page.click("#btn")`) or, with a
  // breakpoint arm, whatever makes the page run that code. It is optional and
  // is not awaited by the scan itself: it may block until the debugger resumes.
  // Resolves with { status, results?, matchResult?, matchAtStart?, arm,
  // started, error?, scanTime } where `arm` is what was armed (null if arming
  // failed), `started` tells whether the arm was ever triggered, and
  // status is one of: found, notfound, maxReached, aborted, timeout, error.
  runBDHS = (params, { trigger, timeoutMs = 60000, onProgress } = {}) => {
    return new Promise((resolve, reject) => {
      let outcome = null;
      let timer = null;
      let arm = null;
      let started = false;
      const setOutcome = (o) => {
        if (outcome === null) {
          outcome = o;
        }
      };
      const abortWith = async (o) => {
        setOutcome(o);
        try {
          await this.stopBDHS();
        } catch { /* already completed */ }
      };

      this.startBDHS(params, {
        "armed": (d) => {
          arm = d.arm;
          timer = setTimeout(() => abortWith({ status: "timeout" }), timeoutMs);
          if (trigger) {
            Promise.resolve()
              .then(() => trigger())
              .catch((e) => abortWith({ status: "error", error: `Trigger failed: ${e?.message || e}` }));
          }
        },
        "started": () => {
          started = true;
        },
        "progress": (d) => {
          if (onProgress) {
            onProgress(d);
          }
        },
        "found": (d) => setOutcome({
          status: "found", matchResult: d.matchResult, matchAtStart: d.matchAtStart, results: d.results
        }),
        "notfound": () => setOutcome({ status: "notfound" }),
        "maxReached": () => setOutcome({ status: "maxReached" }),
        "aborted": () => setOutcome({ status: "aborted" }),
        "completed": (d) => {
          clearTimeout(timer);
          resolve({
            ...(outcome || { status: "error", error: "Scan completed without a result" }),
            arm,
            started,
            scanTime: d.scanTime
          });
        },
      }).catch(reject);
    });
  };

  searchSnapshot = async (data, maxResults = 200) => {
    const page = this.pagesManager.get(data.pageId).page;
    const {
      osEnabled,
      osObject,
      osThreshold,
      osAlpha,
      osIncludeValues,
      propertySearch,
      valueSearch,
      classSearch
    } = data;
    const objectSimilarity = new ObjectSimilarity({ includeValues: osIncludeValues });
    let snapshot = await captureSnapshot(page);
    let nodes = parseSnapshot(snapshot);

    let matches = searchObjects(nodes, {
      propertySearch,
      valueSearch,
      classSearch,
      osEnabled,
      osObject,
      osThreshold,
      osAlpha,
      similarityFn: objectSimilarity.hybridSimilarity
    }, maxResults);

    let rev = buildReverseEdges(nodes);
    const results = []

    for (const m of matches) {

      const obj = m.inspected || inspectObject(m.node, nodes);

      obj.meta.push({ similarity: m.similarity });
      const path = buildJsPath(nodes, rev, m.node.idx);
      results.push({
        ...obj,
        path
      });
      // }
    }

    // respond("heap.searchSnapshotResult", results);
    // snapshot = null;
    // nodes = null;
    // matches = null;
    // rev = null;
    return results;
  };

  searchLiveObjects = async (data) => {
    const page = this.pagesManager.get(data.pageId).page;

    const {
      searchMode,  // "global" or "byroot"
      root,
      osEnabled,
      osObject,
      osThreshold,
      osAlpha,
      osIncludeValues,
      propertySearch,
      valueSearch,
      classSearch
    } = data;
    // const searchObjectSimhash = objectSimilarity.simhashObject(JSON.parse(osObject));
    let searchResults = null;
    const now = Date.now();

    const resultsMap = new Map();
    let classInstances, searchFn, searchFnPar1;

    if (searchMode === "global") {
      classInstances = await page.queryObjects(
        await page.evaluateHandle(() => Object.prototype)
      );
      searchFn = searchGlobalToEvaluate;
      searchFnPar1 = classInstances;
    } else if (searchMode === "byroot") {
      searchFn = searchByRootToEvaluate;
      searchFnPar1 = root;
    }
    const { results, totObjects, resultsLimitReached } = await page.evaluate(
      searchFn, searchFnPar1,
      propertySearch, valueSearch, classSearch,
      textMatches.toString(), iterate.toString(), safeJsonStringify.toString(),
      { os: ObjectSimilarity.toString(), osEnabled, osObject, osThreshold, osAlpha, osIncludeValues }
    );

    for (const r of results) {
      if (!r.obj || r.obj === "{}" || r.obj === "[]") {
        continue;
      }
      r.obj = JSON.parse(r.obj);
      r.pageId = data.pageId;
      resultsMap.set(r.index, r);
      delete r.index;
    }

    if (searchMode === "global") {
      const props = await classInstances.getProperties();
      for (const [indexStr, handle] of props.entries()) {
        const index = Number(indexStr);
        const match = resultsMap.get(index);
        if (match && handle) {
          match.objectId = String(handle.remoteObject().objectId);
          if (!match.objectId) {
            handle.dispose();  // no await here, fire and forget
          }
        } else {
          handle.dispose();  // no await here, fire and forget
        }
      }
      await classInstances.dispose();
    }

    searchResults = {
      results: Array.from(resultsMap.values()),
      totResults: resultsMap.size,
      totObjectAnalyzed: totObjects,
      resultsLimitReached,
      timing: Date.now() - now
    };

    return searchResults;
  };


}

export default Heap;