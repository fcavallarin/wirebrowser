import path from "path";
import { fileURLToPath } from "url";
import got from 'got';
import { Response } from "#src/common/models.js";


export const getTargetId = async (target) => {
  try {
    const cdpSession = await target.createCDPSession();
    const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
    return targetInfo.targetId;
  } catch (e) {
    return null;
  }
};

export const getAllPagesTarget = async (browser) => {
  const targets = {};
  for (let t of browser.targets()) {
    if (t.type() !== 'page') {
      continue;
    }
    const page = await t.page();
    if (page.url().startsWith("devtools://")) {
      continue;
    }
    const tid = await getTargetId(t);
    if (tid) {
      targets[tid] = t;
    }
  }
  return targets;
};


export const getExtWorker = async (browser) => {
  let serviceWorker;
  try {
    serviceWorker = await browser.waitForTarget(
      target => target.type() === 'service_worker' && target.url().endsWith("/wirebrowser_background.js")
      , { timeout: 3000 });
  } catch (e) {
    console.log("Warning: cannot send message to UI, service worker not running");
    return;
  }
  return await serviceWorker.worker();
};


export const extSendTabId = async (browser, targetId, tabId) => {
  const w = await getExtWorker(browser)
  w.evaluate((targetId, tabId) => {
    setNodeTabId(targetId, tabId);
  }, targetId, tabId);

};


export const getCurrentDir = (f) => {
  const fn = fileURLToPath(f);
  return path.dirname(fn);
};


export const gotSend = ({ method, url, data, headers }) => {
  return got(url, {
    retry: { limit: 0 },
    throwHttpErrors: false,
    allowGetBody: true,
    https: { rejectUnauthorized: false },
    method,
    headers: headers || {},
    ...(data !== undefined
      ? {
        body: typeof data == 'object' ? JSON.stringify(data)
          : String(data)
      } : {}
    ),
  });
};


export const gotToResponse = (res) => {
  return new Response({
    data: res.rawBody.toString(),
    headers: res.headers,
    statusCode: res.statusCode
  });
};


export const httpSend = async ({ method, url, data, headers }) => {
  const res = await gotSend({ method, url, data, headers });
  return gotToResponse(res);
};


export const safeJsonStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  });
};


export function* iterate(obj) {
  if (obj == null) return;

  if (
    Array.isArray(obj)
    || ArrayBuffer.isView(obj)
    || obj instanceof NodeList
    || obj instanceof HTMLCollection
    || obj instanceof Set
  ) {
    let i = 0;
    for (const v of obj) {
      yield [i++, v];
    }
    return;
  }

  if (obj instanceof Map) {
    for (const [k, v] of obj) {
      yield [k, v];
    }
    return;
  }

  try {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        yield [key, obj[key]];
      }
    }
  } catch { }
};


export const getPageScriptContent = (script, browserUtils, vars) => {
  const utils = [`getVar: function(name){return ${JSON.stringify(vars)}[name];},`];
  for (const u in browserUtils) {
    utils.push(`${u}: ${browserUtils[u].toString()},`);
  }
  const utilsContent = `const Utils = {${utils.join("\n")}};`;
  return `(async () => {${utilsContent};\n${script};\n})();`;
};
