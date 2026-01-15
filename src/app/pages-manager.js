import { getAllPagesTarget } from "#src/app/utils.js";
import Debugger from "#src/app/debugger.js";
class PagesManager {
  constructor() {
    this.pages = new Map();
    this.events = {
      "newPage": []
    }
    this.volatileEvents = new Set([
      "console",
      "pageerror",
      "load",
      "domcontentloaded",
      "framenavigated",
      "frameattached",
      "framedetached",
    ]);
  }

  add = (pageId, targetId, page) => {
    const pageObject = {
      targetId,
      page,
      pageId: `${pageId}`,
      debugger: new Debugger(page, page._client(), pageId),
      events: {}
    };
    this.pages.set(`${pageId}`, pageObject);
    for(const handler of this.events.newPage){
      handler(pageObject);
    }
  }

  get = (pageId) => {
    return this.pages.get(`${pageId}`);
  }

  delete = (pageId) => {
    this.pages.delete(`${pageId}`);
  }

  getByPage = (page) => {
    for (let [k, v] of this.pages) {
      if (v.page === page) {
        return v;
      }
    }
  }

  getByTargetId = (targetId) => {
    for (let [k, v] of this.pages) {
      if (v.targetId === targetId) {
        return v;
      }
    }
  }

  flush = () => {
    for (let [k, v] of this.pages) {
      this.pages.delete(k);
    }
  }

  resetPages = async (browser) => {
    const targets = await getAllPagesTarget(browser);
    for (const targetId in targets) {
      const p = this.getByTargetId(targetId);
      p.page = await targets[targetId].page();
      p.debugger = new Debugger(p.page, p.page._client(), p.pageId);
    }
  }

  on = (eventName, handler) => {
    this.events[eventName].push(handler);
  }

  off = (eventName) => {
    this.events[eventName] = [];
  }

  attach = (page, eventName, handler) => {
    const p = this.getByPage(page);
    if(!p){
      throw new Error(`Page not found`);
    }
    if(eventName in p.events){
      p.events[eventName].push(handler);
    } else {
      p.events[eventName] = [handler];
    }
    p.page.on(eventName, handler);
  }
}

export default PagesManager;