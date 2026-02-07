import BaseModule from "#src/app/base-module.js";
import {
  parseSnapshot, captureSnapshot,
  searchObjects, buildReverseEdges,
  buildJsPath, inspectObject
} from "#src/app/modules/heap/search-snapshot.js"

import { searchByRootToEvaluate } from "#src/app/modules/heap/search-byroot.js"
import { searchGlobalToEvaluate } from "#src/app/modules/heap/search-global.js"
import { textMatches } from "#src/common/utils.js";
import { safeJsonStringify, iterate } from "#src/app/utils.js";
import { ObjectSimilarity } from "#src/app/object-similarity.js";
import BDHSExecutor from "#src/app/modules/heap/bdhs.js";

class Heap extends BaseModule {
  run = () => {

    this.activeBDHS = null;

    this.uiEvents.on("heap.startBDHS", async (data, respond) => {
      if (this.activeBDHS !== null) {
        this.uiEvents.dispatch("Error", `Multiple scan sessions are not supported`);
        respond("heap.BDHSError");
        return;
      }
      const { pageId, toleranceWinBefore, toleranceWinAfter } = data;
      this.activeBDHS = new BDHSExecutor(
        this.pagesManager.get(pageId).debugger,
        [toleranceWinBefore, toleranceWinAfter],
        async () => {
          return await this.searchSnapshot(data, 10);
        },
        {
          "started": (data) => {
            respond("heap.BDHSStatus", { ...data, pageId, message: "Started" });
          },
          "progress": (data) => {
            const message = data.matchFound ?
              "Found, finalising results" : (
                data.finalising ? "Finalising" : "Searching"
              );
            respond("heap.BDHSStatus", { ...data, pageId, message });
          },
          "maxReached": (data) => {
            respond("heap.BDHSError", { ...data, pageId, reason: "Max reached" });
          },
          "found": (data) => {
            respond("heap.BDHSResult", { ...data, pageId });
          },
          "notfound": (data) => {
            respond("heap.BDHSResult", { ...data, pageId });
          },
          "aborted": (data) => {
            respond("heap.BDHSStatus", { ...data, pageId, message: "Aborted" });
          },
          "armed": (data) => {
            respond("heap.BDHSArmed", { ...data, pageId });
          },
          "completed": (data) => {
            respond("heap.BDHSFinished", { ...data, pageId });
            this.activeBDHS = null;
          },
        }
      )
      this.activeBDHS.start();
    });

    this.uiEvents.on("heap.stopBDHS", async (data, respond) => {
      if (this.activeBDHS === null) {
        this.uiEvents.dispatch("Error", `Scan is not running`);
      }
      this.activeBDHS.abort();
    });

    this.uiEvents.on("heap.getDebuggerParsedScripts", async (data, respond) => {
      respond(
        "heap.getDebuggerParsedScriptsResult",
        { scripts: this.pagesManager.get(data.pageId).debugger.getParsedScripts() }
      );
    });

    this.uiEvents.on("heap.searchSnapshot", async (data, respond) => {
      respond("heap.searchSnapshotResult", await this.searchSnapshot(data));
    });

    this.uiEvents.on("heap.searchLiveObjects", async (data, respond) => {
      let searchResults;
      try {
        searchResults = await searchLiveObjects(data);
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
          functionDeclaration: `function() { window['${varName}'] = this; return this; }`,
        });
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
        resp = "err";
      }
      respond("heap.exposeObjectResult", resp);
    });

    this.uiEvents.on("heap.debuggerEnable", async (data, respond) => {
      const { pageId } = data;
      let resp = "ok";
      try {
        await this.enableDebugger(pageId, respond);
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
        resp = "err";
      }
      respond("heap.debuggerEnableResult", resp);
    });


    this.uiEvents.on("heap.debuggerPause", async (data, respond) => {
      const { pageId } = data;
      let resp = "ok";
      try {
        const dbg = await this.enableDebugger(pageId, respond);
        await dbg.pause()
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
        resp = "err";
      }
      respond("heap.debuggerPauseResult", resp);
    });

    this.uiEvents.on("heap.debuggerResume", async (data, respond) => {
      const { pageId } = data;
      let resp = "ok";
      try {
        const dbg = await this.enableDebugger(pageId, respond);
        await dbg.disable();
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
        resp = "err";
      }
      respond("heap.debuggerResumeResult", resp);
    });

    this.uiEvents.on("heap.debuggerStepOut", async (data, respond) => {
      const { pageId } = data;
      let resp = "ok";
      try {
        const dbg = await this.enableDebugger(pageId, respond);
        await dbg.stepOut();
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
        resp = "err";
      }
      respond("heap.debuggerStepOutResult", resp);
    });

  }

  stop = () => {
    for (const e of this.uiEvents.getRegisteredEvents()) {
      if (e.startsWith("heap.")) {
        this.uiEvents.off(e);
      }
    }
  }

  enableDebugger = async (pageId, respond) => {
    const dbg = this.pagesManager.get(pageId).debugger;
    if (dbg.isEnabled) {
      return dbg;
    }

    dbg.on("paused", async (data) => {
      if (respond) {
        respond("heap.onDebuggerPaused", { pageId, event: data });
      }
    });
    await dbg.enable();
    return dbg;
  }

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