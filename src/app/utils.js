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


// export const safeJsonStringify = (obj) => {
//   const seen = new WeakSet();
//   return JSON.stringify(obj, (key, value) => {
//     if (typeof value === "bigint") {
//       return value.toString() + "n";
//     }
//     if (typeof value === "object" && value !== null) {
//       if (seen.has(value)) {
//         return "[Circular]";
//       }
//       seen.add(value);
//     }
//     return value;
//   });
// };

export const safeJsonStringify = (obj, maxDepth = 50) => {
  const seen = new WeakSet();

  // Stack for iterative DFS
  const stack = [{
    parent: null,
    key: '',
    value: obj,
    depth: 0
  }];

  // Root container that will hold the sanitized clone
  const rootClone = {};
  const ptrStack = [{ clone: rootClone, key: '' }];

  while (stack.length > 0) {
    const { value, depth } = stack.pop();
    const { clone, key: cloneKey } = ptrStack.pop();

    if (depth > maxDepth) {
      clone[cloneKey] = '[MaxDepth]';
      continue;
    }

    if (typeof value === 'bigint') {
      clone[cloneKey] = value.toString() + 'n';
      continue;
    }

    if (typeof value === 'function') {
      clone[cloneKey] = undefined;
      continue;
    }

    if (value instanceof Date) {
      clone[cloneKey] = value.toISOString();
      continue;
    }

    if (value === null || typeof value !== 'object') {
      clone[cloneKey] = value;
      continue;
    }

    if (seen.has(value)) {
      clone[cloneKey] = '[Circular]';
      continue;
    }
    seen.add(value);

    if (value instanceof Map) {
      const arr = [];
      clone[cloneKey] = arr;

      const entries = [...value.entries()];
      for (let i = entries.length - 1; i >= 0; i--) {
        const entryValue = entries[i];
        stack.push({
          value: entryValue,
          depth: depth + 1
        });
        ptrStack.push({
          clone: arr,
          key: arr.length
        });
        arr.length++;
      }
      continue;
    }

    if (value instanceof Set) {
      const arr = [];
      clone[cloneKey] = arr;

      const entries = [...value];
      for (let i = entries.length - 1; i >= 0; i--) {
        const entryValue = entries[i];
        stack.push({
          value: entryValue,
          depth: depth + 1
        });
        ptrStack.push({
          clone: arr,
          key: arr.length
        });
        arr.length++;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const arr = [];
      clone[cloneKey] = arr;

      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({
          value: value[i],
          depth: depth + 1
        });
        ptrStack.push({
          clone: arr,
          key: i
        });
      }
      continue;
    }

    const newObj = {};
    clone[cloneKey] = newObj;

    const keys = Object.keys(value);

    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i];
      stack.push({
        value: value[k],
        depth: depth + 1
      });
      ptrStack.push({
        clone: newObj,
        key: k
      });
    }
  }

  return JSON.stringify(rootClone['']);
};


export function* iterate(obj) {
  if (obj == null) return;

  if (
    Array.isArray(obj)
    || ArrayBuffer.isView(obj)
    || obj instanceof Set
  ) {
    try {
      let i = 0;
      for (const v of obj) {
        yield [i++, v];
      }
      return;
    } catch { };
  }

  if (obj instanceof Map) {
    try {
      for (const [k, v] of obj) {
        yield [k, v];
      }
      return;
    } catch { };
  }

  // NodeList and HTMLCollection do not exist in the node.js context
  try {
    if (obj instanceof NodeList || obj instanceof HTMLCollection) {
      let i = 0;
      for (const v of obj) {
        yield [i++, v];
      }
      return;
    }
  } catch { };

  try {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        yield [key, obj[key]];
      }
    }
  } catch { };
};


export const getPageScriptContent = (script, browserUtils, vars) => {
  const utils = [`getVar: function(name){return ${JSON.stringify(vars)}[name];},`];
  for (const u in browserUtils) {
    utils.push(`${u}: ${browserUtils[u].toString()},`);
  }
  const utilsContent = `const Utils = {${utils.join("\n")}};`;
  return `(async () => {${utilsContent};\n${script};\n})();`;
};
