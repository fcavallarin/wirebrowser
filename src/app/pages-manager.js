import { getAllPagesTarget } from "#src/app/utils.js";
import Debugger from "#src/app/debugger.js";
class PagesManager {
  constructor() {
    this.pages = new Map();
  }

  add = (pageId, targetId, page) => {
    this.pages.set(`${pageId}`, {
      targetId,
      page,
      pageId: `${pageId}`,
      debugger: new Debugger(page, page._client(), pageId)
    });
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
    }
  }
}

export default PagesManager;