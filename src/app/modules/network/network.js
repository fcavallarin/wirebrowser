import BaseModule from "#src/app/base-module.js";
import { Request, Response } from "#src/common/models.js";
import { httpSend, gotSend, gotToResponse } from "#src/app/utils.js";

const REQUEST_LOG_SIZE = 1000;

const TEXT_CONTENT_TYPE = /^text\/|json|javascript|ecmascript|xml|x-www-form-urlencoded|graphql/i;

class Network extends BaseModule {

  run = () => {
    this.pendingRequests = new Map();
    this.requestsList = new Map();
    this.pendingUserRequests = new Map();
    this.requestLog = new Map();         // id -> entry, in arrival order
    this.requestLogByReq = new WeakMap(); // puppeteer HTTPRequest -> entry

    this.pagesManager.on("newPage", this.handleNewPage);
    for(const [pageId, pageObject] of this.pagesManager.pages){
        this.handleNewPage(pageObject)
    }
    this.uiEvents.on("network.bulkContinueRequest", async (data, respond) => {
      for (const [k, v] of this.requestsList) {
        if (data.includes(v.id)) {
          await v.req.continue();
        }
      }
      respond("network.bulkContinueRequestDone", data);
    });

    this.uiEvents.on("network.sendUserRequest", async (request, respond) => {
      const vars = this.settingsManager.settings?.global?.variables || {};
      const req = new Request(request);
      const rdata = {
        method: req.method,
        url: req.vurl(vars),
        headers: req.vheaders(vars),
        data: req.vdata(vars)
      }
      const reqId = this.idManager.nextUserRequestId();
      try {
        const req = gotSend(rdata);
        this.pendingUserRequests.set(reqId, req);
        respond("network.sendUserRequestExecuted", reqId);
        const resp = await req;
        respond("network.sendUserRequestDone", gotToResponse(resp));
      } catch (e) {
        if (e.name !== 'CancelError') {
          this.uiEvents.dispatch("Error", `Failed to send request to ${rdata.url}`);
          respond("network.sendUserRequestDone", null);
        }
      } finally {
        this.pendingUserRequests.delete(reqId);
      }
    });

    this.uiEvents.on("network.cancelUserRequest", async (requestId) => {
      const req = this.pendingUserRequests.get(requestId);
      if (!req) {
        return;
      }
      try {
        req.cancel();
      } catch (e) {
        this.uiEvents.dispatch("Error", `Failed to cancel request`);
      } finally {
        this.pendingUserRequests.delete(requestId);
      }
    });

    this.uiEvents.on("network.continueRequest", async (data) => {
      const settings = this.settingsManager.settings.network.interceptor.blockFilters;
      const vars = this.settingsManager.settings?.global?.variables || {};
      const req = new Request(data);
      const rdata = {
        method: req.method,
        url: req.vurl(vars),
        headers: req.vheaders(vars),
        data: req.vdata(vars)
      }
      const r = this.getRequestById(data.id);
      if (settings.actions.includes("block-responses")) {
        const resp = await httpSend(rdata);
        resp.reqId = r.id;
        resp.pageId = r.pageId;
        this.uiEvents.dispatch("network.newResponse", resp);
        return;
      }
      try {
        await r.req.continue({
          headers: rdata.headers,
          method: rdata.method,
          postData: rdata.data,
          url: rdata.url
        });
      } catch (e) {
        // continue() may fail for different reasons, like setting unsafe headers
        const resp = await httpSend(rdata);
        r.req.respond({
          status: Number(resp.statusCode),  // be sure it's a numer otherwise puppetter will fail SILENTLY keeping the request pending
          headers: resp.headers,
          body: resp.data,
          contentType: resp.headers['content-type'] || 'application/octet-stream',
        });
      }
    });


    this.uiEvents.on("network.dropRequest", async (data) => {
      const r = this.getRequestById(data.req.id);
      await r.req.abort(data.action);
    });

    this.uiEvents.on("network.respondToRequest", async (response) => {
      const r = this.getRequestById(response.reqId);
      await r.req.respond({
        status: Number(response.statusCode),  // be sure it's a numer otherwise puppetter will fail SILENTLY keeping the request pending
        headers: response.headers,
        body: response.data,
        contentType: response.headers['content-type'] || 'application/octet-stream',
      });
    });
  }


  stop = () => {
    for (const e of this.uiEvents.getRegisteredEvents()) {
      if (e.startsWith("network.")) {
        this.uiEvents.off(e);
      }
    }
    try {
      this.pagesManager.off("newPage");
    } catch { }
  }


  getRequestByPptrId = (id) => {
    return this.requestsList.get(id);
  }

  getRequestById = (id) => {
    for (const [k, v] of this.requestsList) {
      if (v.id == id) {
        return v;
      }
    }
  }

  isRequestInScope = (req) => {
    const url = req.url();
    const type = req.resourceType();
    const scopeSettings = this.settingsManager.settings.network.interceptor.scope;
    const urlsInScope = scopeSettings?.prefixes;
    let inScope = false;
    if (urlsInScope && urlsInScope.trim()) {
      for (const prefix of urlsInScope.toLowerCase().split("\n")) {
        if (url.startsWith(prefix.trim())) {
          inScope = true;
          break;
        }
      }
    } else {
      inScope = true;
    }
    const typesInScope = scopeSettings?.reqType;
    if (inScope && typesInScope && !typesInScope.includes(type)) {
      inScope = false;
    }
    return inScope;
  }

  handleNewPage = async (pageObject) => {
    const page = pageObject.page;
    await page.setRequestInterception(true);
    this.pagesManager.attach(page, 'response', this.onResponse);
    this.pagesManager.attach(page, 'request', this.onRequest);
    this.pagesManager.attach(page, 'requestfailed', this.onRequestFailed);
  }

  logRequest = (req) => {
    let pageId;
    try {
      pageId = this.pagesManager.getByPage(req.frame()?.page())?.pageId;
    } catch { /* detached frame */ }
    const entry = {
      id: this.idManager.nextRequestId(),
      pageId: pageId !== undefined ? `${pageId}` : undefined,
      time: Date.now(),
      method: req.method(),
      url: req.url(),
      type: req.resourceType(),
      headers: req.headers(),
      postData: req.postData(),
      initiator: req.initiator(),
      blocked: false,
      response: null,
      failure: null,
    };
    this.requestLog.set(entry.id, entry);
    this.requestLogByReq.set(req, entry);
    if (this.requestLog.size > REQUEST_LOG_SIZE) {
      this.requestLog.delete(this.requestLog.keys().next().value);
    }
    return entry;
  };

  // "pending" | "blocked" (held by the interceptor, waiting for the UI) | "done" | "failed"
  getRequestState = (entry) => {
    if (entry.failure) {
      return "failed";
    }
    if (entry.response) {
      return "done";
    }
    return entry.blocked ? "blocked" : "pending";
  };

  getLoggedRequests = () => [...this.requestLog.values()];

  getLoggedRequest = (id) => this.requestLog.get(id);

  getLoggedResponseBody = async (entry) => {
    const res = entry._res;
    if (!res) {
      return { note: "no response" };
    }
    let buf;
    try {
      buf = await res.buffer();
    } catch (e) {
      return { note: `body not available (${e?.message || e}): redirects have no body, and the browser drops bodies after navigations` };
    }
    const contentType = res.headers()["content-type"] || "";
    if (buf.length > 0 && contentType && !TEXT_CONTENT_TYPE.test(contentType)) {
      return { note: `binary body (${contentType}, ${buf.length} bytes)` };
    }
    return { body: buf.toString("utf8") };
  };

  onRequestFailed = (req) => {
    const entry = this.requestLogByReq.get(req);
    if (entry) {
      entry.failure = req.failure()?.errorText || "failed";
    }
  };

  onRequest = (req) => {
    const logEntry = this.logRequest(req);
    if (!this.isRequestInScope(req)) {
      req.continue();
      return;
    }

    const frame = req.frame();
    if (frame === null) {  // Frame is null when navigating to error pages
      return;
    }
    const page = this.pagesManager.getByPage(
      req.frame().page()
    );
    const url = req.url();
    const type = req.resourceType();
    let blocked = true;
    let urlRegexp;
    const blockSettings = this.settingsManager.settings.network.interceptor.blockFilters;
    if (blockSettings.urlFilter) {
      try {
        urlRegexp = new RegExp(blockSettings.urlFilter);
      } catch (e) {
        this.uiEvents.dispatch("Error", "URL Regexp failed to compile");
      }
    }

    if (
      !blockSettings.enabled
      || !blockSettings.reqType.includes(type)
      || (urlRegexp && urlRegexp.test(url))
      || (blockSettings.pageId && blockSettings.pageId.length > 0 && !blockSettings.pageId.includes(page.pageId))
    ) {
      blocked = false;
      req.continue();
    }
    logEntry.blocked = blocked;
    const reqId = logEntry.id;
    this.requestsList.set(req.id, { req: req, id: reqId });

    const eventData = new Request({
      id: reqId,
      pageId: `${page.pageId || 'unknown'}`,
      method: req.method(),
      url,
      headers: req.headers(),
      data: req.postData(),
      response: null,
      type,
      blocked
    });

    this.uiEvents.dispatch("network.newRequest", eventData);
  };

  onResponse = async (res) => {
    const logEntry = this.requestLogByReq.get(res.request());
    if (logEntry) {
      logEntry.response = {
        status: res.status(),
        statusText: res.statusText(),
        headers: res.headers(),
      };
      // Not enumerable: kept out of anything serialized
      Object.defineProperty(logEntry, "_res", { value: res, configurable: true });
    }

    const requestId = res.request().id;
    const r = this.requestsList.get(requestId);
    if (!r) {
      return;
    }

    let data = "";
    try {
      data = await res.text();
    } catch (e) { }
    const eventData = new Response({
      reqId: r.id,
      statusCode: res.status(),
      headers: res.headers(),
      data
    });

    this.uiEvents.dispatch("network.newResponse", eventData);
  }
}

export default Network;