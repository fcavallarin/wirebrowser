import BaseModule from "#src/app/base-module.js"
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

class Heap extends BaseModule {
  run = () => {
    this.uiEvents.on("heap.searchSnapshot", async (data, respond) => {
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
      const snapshot = await captureSnapshot(page);
      const nodes = parseSnapshot(snapshot);

      const matches = searchObjects(nodes, {
        propertySearch,
        valueSearch
      });

      const rev = buildReverseEdges(nodes);
      const results = []

      for (const m of matches) {
        const obj = inspectObject(m, nodes);
        const similarity = osEnabled
          ? objectSimilarity.hybridSimilarity(r.obj, JSON.parse(osObject), Number(osAlpha))
          : null;
        let classMatches = !classSearch || !classSearch[0];
        if (classSearch && textMatches(String(obj.meta?.class), ...classSearch)) {
          classMatches = true;
        }
        if (classMatches && (similarity === null || similarity >= Number(osThreshold))) {
          obj.meta.similarity = similarity;

          const path = buildJsPath(nodes, rev, m.idx);
          results.push({
            ...obj,
            path
          });
        }
      }

      respond("heap.searchSnapshotResult", results);
    });

    this.uiEvents.on("heap.searchLiveObjects", async (data, respond) => {
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
      const objectSimilarity = new ObjectSimilarity({ includeValues: osIncludeValues });
      // const searchObjectSimhash = objectSimilarity.simhashObject(JSON.parse(osObject));
      let searchResults = null;
      // console.log("-----> Start " + Date.now())
      const now = Date.now();
      try {
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
        const { results, totObjects } = await page.evaluate(
          searchFn, searchFnPar1,
          propertySearch, valueSearch, classSearch,
          textMatches.toString(), iterate.toString(), safeJsonStringify.toString()
        );

        // console.log("-----> Objects fetched and serialized! " + results.length + " " + Date.now())
        for (const r of results) {
          if (!r.obj || r.obj === "{}") {
            continue;
          }
          r.obj = JSON.parse(r.obj);
          // r.simhash = objectSimilarity.simhashObject(r.obj);
          // const similarity = objectSimilarity.similarity(r.simhash, searchObjectSimhash);
          const similarity = osEnabled
            ? objectSimilarity.hybridSimilarity(r.obj, JSON.parse(osObject), Number(osAlpha))
            : null;
          if (similarity === null || similarity >= Number(osThreshold)) {
            r.pageId = data.pageId;
            r.similarity = similarity;
            resultsMap.set(r.index, r);
            delete r.index;
          }
        }
        // console.log("-----> Objects filtered! " + Date.now())
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
          // console.log("-----> ObjectIDs resolved " + Date.now())
          await classInstances.dispose();
        }

        searchResults = {
          results: Array.from(resultsMap.values()),
          totResults: resultsMap.size,
          totObjectAnalyzed: totObjects,
          timing: Date.now() - now
        };
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
      }

      respond("heap.searchLiveObjectsResult", searchResults);
    });

    this.uiEvents.on("heap.exposeObject", async (data, respond) => {
      const { pageId, objectId, varName } = data;
      const page = this.pagesManager.get(pageId).page;
      await page._client().send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function() { window['${varName}'] = this; return this; }`,
      });
      respond("heap.exposeObjectResult", "ok");
    });
  }
  stop = () => {
    for (const e of this.uiEvents.getRegisteredEvents()) {
      if (e.startsWith("heap.")) {
        this.uiEvents.off(e);
      }
    }
  }

}

export default Heap;