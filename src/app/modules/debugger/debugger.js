import BaseModule from "#src/app/base-module.js";
import { getPageScriptContent, safeJsonStringify } from "#src/app/utils.js";
import LiveHooksManager from "#src/app/modules/debugger/live-hooks-manager.js";
import HooksManager from "#src/app/modules/debugger/hooks-manager.js";
class Debugger extends BaseModule {

  run = () => {
    this.activeLiveHooksManager = null;
    this.liveHooks = [];

    this.uiEvents.on("debugger.getParsedScripts", async (data, respond) => {
      const { pageId } = data;
      const page = this.pagesManager.get(pageId);
      if (page.debugger.isEnabled) {
        this.uiEvents.dispatch("Error", `Cannot get sources list while debugger is enabled`);
        return;
      }
      await page.debugger.enable();
      const scripts = page.debugger.getParsedScripts();
      await page.debugger.disable();
      respond("debugger.getParsedScriptsResult", { scripts });
    });

    this.uiEvents.on("debugger.getScriptSource", async (data, respond) => {
      const { pageId, scriptId } = data;
      const page = this.pagesManager.get(pageId);
      if (page.debugger.isEnabled) {
        this.uiEvents.dispatch("Error", `Cannot get source while debugger is enabled`);
        return;
      }
      let source;
      try {
        await page.debugger.enable();
        source = await page.debugger.getScriptSource(scriptId);
        await page.debugger.disable();
      } catch (e) {
        this.uiEvents.dispatch("Error", `Error fetching script: ${e}`);
        return;
      }
      respond("debugger.getScriptSourceResult", {
        scriptId,
        source
      })
    });

    this.uiEvents.on("debugger.disable", async (data, respond) => {
      await this.disableDebugger(data.pageId);
    });


  }

  stop = () => {
    for (const e of this.uiEvents.getRegisteredEvents()) {
      if (e.startsWith("debugger.")) {
        this.uiEvents.off(e);
      }
    }
  }

  destroyLiveHooksManager = async () => {
    if (this.activeLiveHooksManager === null) {
      return;
    }
    await this.activeLiveHooksManager.stop();
    this.activeLiveHooksManager = null;
    this.liveHooks = [];
  }

  addLiveHook = (hookDef) => {
    this.liveHooks.push(hookDef);
  }

  startLiveHooks = async (pageId, events) => {
    if (this.activeLiveHooksManager !== null) {
      throw new Error(`Multiple live hook sessions are not supported`);
    }
    const page = this.pagesManager.get(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }
    const dbg = page.debugger;
    if (dbg.isEnabled) {
      throw new Error(`Debugger is already in use`);
    }
    this.activeLiveHooksManager = new LiveHooksManager(dbg, events);

    for (const hook of this.liveHooks) {
      this.activeLiveHooksManager.addLiveHook(hook);
    }
    await this.activeLiveHooksManager.start();
  }

  disableDebugger = async (pageId) => {
    const page = this.pagesManager.get(pageId);
    if (this.activeLiveHooksManager) {
      await this.destroyLiveHooksManager();
      return;
    }
    const heapModule = this.modulesManager.getModule("heap");
    if (heapModule.activeBDHS) {
      await heapModule.activeBDHS.abort();
      return;
    }
    await page.debugger.disable();
  }

  addHook = (location, handlers, handleResult) => {
    this.liveHooks.push({ location, handlers, handleResult });
  }

  startHooks = async (pageId, events) => {
    // if (this.activeLiveHooksManager !== null) {
    //   throw new Error(`Multiple live hook sessions are not supported`);
    // }
    const page = this.pagesManager.get(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }
    const dbg = page.debugger;
    if (dbg.isEnabled) {
      throw new Error(`Debugger is already in use`);
    }
    this.activeLiveHooksManager = new HooksManager(dbg, events);

    for (const hook of this.liveHooks) {
      this.activeLiveHooksManager.addHook(hook);
    }
    await this.activeLiveHooksManager.start();
  }

  step = async (pageId, stepFnc) => {
    const page = this.pagesManager.get(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }
    const dbg = page.debugger;
    if (!dbg.isEnabled) {
      throw new Error(`Debugger is not enabled`);
    }
    await dbg[stepFnc]();
  }

}

export default Debugger;