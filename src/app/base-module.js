class BaseModule {
  constructor(uiEvents, pagesManager, settingsManager, idManager, browser, modulesManager) {
    this.uiEvents = uiEvents;
    this.pagesManager = pagesManager;
    this.settingsManager = settingsManager;
    this.idManager = idManager;
    this.browser = browser;
    this.modulesManager = modulesManager;
  }
}

export default BaseModule;