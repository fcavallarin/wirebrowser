import Network from "#src/app/modules/network/network.js";
import Automation from "#src/app/modules/automation/automation.js";
import Heap from "#src/app/modules/heap/heap.js";


class ModulesManager {
  constructor() {
    this.availableModules = new Map([
      ["network", Network],
      ["heap", Heap],
      ["automation", Automation]
    ]);
    this.loadedModules = new Map();
  }

  unloadAll() {
    for (const m of this.loadedModules.values()) {
      m.stop();
    }
  }

  loadAll(uiEvents, pagesManager, settingsManager, idManager, browser) {
    this.unloadAll();
    this.loadedModules = new Map();
    for (const [name, module] of this.availableModules) {
      const m = new module(
        uiEvents,
        pagesManager,
        settingsManager,
        idManager,
        browser,
        this
      );
      m.run();
      this.loadedModules.set(name, m);
    }
  }

  getModule(name) {
    return this.loadedModules.get(name);
  }
}

export default ModulesManager;