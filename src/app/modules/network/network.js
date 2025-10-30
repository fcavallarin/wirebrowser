import BaseModule from "#src/app/base-module.js"
import { Request, Response } from "#src/common/models.js";
import { httpSend, gotSend, gotToResponse } from "#src/app/utils.js";

class Network extends BaseModule {

  run = () => {
    this.pendingRequests = new Map();
    this.requestsList = new Map();
    this.pendingUserRequests = new Map();

    this.browser.on("targetcreated", this.handleNewTarget);
    for (let t of this.browser.targets()) {
      if (t.type() === 'page') {
        this.handleNewTarget(t)
      }
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
      this.browser.off("targetcreated");
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

  handleNewTarget = async (target) => {
    if (target.type() != 'page') {
      return;
    }
    const page = await target.page();
    await page.setRequestInterception(true);

    page.on('response', this.onResponse);
    page.on('request', this.onRequest);
  }

  onRequest = (req) => {
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
    const reqId = this.idManager.nextRequestId();
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