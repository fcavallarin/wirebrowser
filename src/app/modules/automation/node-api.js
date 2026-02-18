import got from 'got';
import { safeJsonStringify, iterate } from "#src/app/utils.js";

const validateAndAdjustSearchQuery = (pageId, query) => {
  if (!query.valueSearch &&
    !query.classSearch &&
    !query.propertySearch &&
    !query.osEnabled) {
    throw new Error("At least on of 'valueSearch', 'classSearch', 'propertySearch' must be set is object similarity is disabled");
  }
  const q = { pageId, ...query };

  if (q.osObject && typeof q.osObject !== 'string') {
    q.osObject = JSON.stringify(q.osObject);
  }
  if (q.valueSearch && !Array.isArray(q.valueSearch)) {
    q.valueSearch = [q.valueSearch, {}];
  }
  if (q.propertySearch && !Array.isArray(q.propertySearch)) {
    q.propertySearch = [q.propertySearch, {}];
  }
  if (q.classSearch && !Array.isArray(q.classSearch)) {
    q.classSearch = [q.classSearch, {}];
  }
  return q;
}


export class NodeUtilsAPI {
  constructor(pagesManager, settingsManager) {
    this._pagesManager = pagesManager;
    this._settingsManager = settingsManager;
    this.safeJsonStringify = safeJsonStringify;
    this.iterate = iterate;
    this.httpClient = { got };
  }

  getVar(name) {
    const vars = this._settingsManager.settings?.global?.variables || {};
    return vars[name];
  }

  getPage(id) {
    for (const [pageId, page] of this._pagesManager.pages) {
      if (String(pageId) === String(id)) {
        return page.page;
      }
    }
  }
}


export class NodeMemoryAPI {
  constructor(settingsManager, modulesManager, logger) {
    this._settingsManager = settingsManager;
    this._modulesManager = modulesManager;
    this._logger = logger;
  }

  async searchLiveObjects(pageId, query) {
    const q = validateAndAdjustSearchQuery(pageId, query);
    if (!q.searchMode) {
      q.searchMode = "global";
    }
    return await this._modulesManager.getModule("heap").searchLiveObjects(q);
  }

  async searchHeapSnapshot(pageId, query) {
    const q = validateAndAdjustSearchQuery(pageId, query);
    return {
      results: await this._modulesManager.getModule("heap").searchSnapshot(q)
    };
  }

  addLiveHook(hookDef) {
    this._modulesManager.getModule("heap").addLiveHook(hookDef);
  }

  startLiveHooks = async (pageId) => {
    await this._modulesManager.getModule("heap").startLiveHooks(pageId, {
      warn: (event) => this._logger("warn", event.message),
      error: (event) => this._logger("error", event.message)
    });
  }

  stopLiveHooks = async () => {
    await this._modulesManager.getModule("heap").destroyLiveHooksManager();
  }

}
