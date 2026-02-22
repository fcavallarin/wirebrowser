import BaseModule from "#src/app/base-module.js";
import BrowserUtils from "./browser-utils.js";
import { NodeUtilsAPI, NodeMemoryAPI } from "./node-api.js";
import { getPageScriptContent, safeJsonStringify } from "#src/app/utils.js";


class Automation extends BaseModule {
  run = () => {
    this.uiEvents.on("automation.runScript", async (data, respond) => {
      const { pageIds, fileId, content } = data;
      const results = [];
      const files = this.settingsManager.settings?.automation?.scripts?.files;
      const vars = this.settingsManager.settings?.global?.variables || {};
      if (!files && fileId) {
        this.uiEvents.dispatch("Error", "Reading files");
        return;
      }
      for (const [pageId, page] of this.pagesManager.pages) {
        if (pageIds && pageIds.length > 0 && !pageIds.includes(pageId)) {
          continue;
        }
        let s;
        if (fileId) {
          const script = files.find(f => f.id === fileId);
          if (!script.content) {
            this.uiEvents.dispatch("Error", "File not found");
            return;
          }
          s = script.content || "";
        } else {
          s = content || "";
        }

        const scriptContent = getPageScriptContent(s, BrowserUtils, vars);
        try {
          results.push([pageId, await page.page.evaluate(scriptContent)]);
        } catch (e) {
          results.push([pageId, e.toString()]);
          this.uiEvents.dispatch('consoleAddData', {
            pageId,
            data: {
              type: "execerror",
              text: e.toString()
            }
          });
        }
      }

      respond("automation.runScriptResult", results);
    });

    this.uiEvents.on("automation.runPptrScript", async (data, respond) => {
      const files = this.settingsManager.settings?.automation?.pptrscripts?.files;

      if (!files) {
        this.uiEvents.dispatch("Error", "Reading files");
        return;
      }

      const script = files.find(f => f.id === data.fileId);
      if (!script.content) {
        this.uiEvents.dispatch("Error", "File not found");
        return;
      }
      const logger = (type, data) => {
        let text = data;
        try {
          text = safeJsonStringify(data);
        } catch { }
        respond("automation.runPptrScriptLog", { type, text });
      };

      const unhandledPromiseHandler = (r, p) => {
        logger("error", 'Unhandled Promise Rejection');
      }

      process.on('unhandledRejection', unhandledPromiseHandler);
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        const fn = new AsyncFunction(
          "_API_", "console",
          `const WB = {Node: _API_}; const Utils = _API_.Utils; try{(await (async ()=>{${script.content}})())}catch(e){console.error(e.toString())};`
        );
        await fn(
          {
            Utils: new NodeUtilsAPI(this.pagesManager, this.settingsManager),
            Memory: new NodeMemoryAPI(this.settingsManager, this.modulesManager, logger),
          },
          {
            log: d => logger("log", d),
            error: d => logger("error", d),
            warn: d => logger("warn", d),
          }
        );
      } catch (e) {
        this.uiEvents.dispatch("Error", `${e}`);
        respond("automation.runPptrScriptDone", { error: `${e}` });
      } finally {
        setTimeout(() => process.off('unhandledRejection', unhandledPromiseHandler), 1000);
      }
      respond("automation.runPptrScriptDone", {});
    });
  }

  stop = () => {
    for (const e of this.uiEvents.getRegisteredEvents()) {
      if (e.startsWith("automation.")) {
        this.uiEvents.off(e);
      }
    }
  }

}

export default Automation;