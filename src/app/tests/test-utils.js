import path from "path";
import fs, { readFileSync } from "fs";
import puppeteer from "puppeteer";
import PagesManager from "#src/app/pages-manager.js";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const green = (s) => `\x1b[32m${s}\x1b[0m`;
export const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
export const red = (s) => `\x1b[31m${s}\x1b[0m`;
export const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

export const patchModule = async (module, uiEventListeners) => {
  const extpath = path.join(`${__dirname}`, "..", "..", "chrome-extension");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    ignoreHTTPSErrors: true,
    args: [
      '--disable-features=OutOfBlinkCors,IsolateOrigins,SitePerProcess',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--mute-audio',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--ssl-version-max=tls1.3',
      '--ssl-version-min=tls1',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--proxy-bypass-list=<-loopback>',
      `--disable-extensions-except=${extpath}`,
      `--load-extension=${extpath}`,
      "--silent-debugger-extension-api",
      '--auto-open-devtools-for-tabs',
    ]
  });

  class TestUIEvents {
    listeners = {}

    constructor(uiEventListeners) {
      this.uiEventListeners = uiEventListeners;
    }

    on = (event, callback) => {
      this.listeners[event] = callback;
    }

    off = (event) => {
      delete this.listeners[event];
    }

    dispatch = (event, data) => {
      this.uiEventListeners[event](data)
    }
  }
  module.uiEvents = new TestUIEvents(uiEventListeners);
  module.browser = browser;
  module.pagesManager = new PagesManager();

  const page = await browser.newPage();
  module.pagesManager.add('1', '1', page);
}


export const runHttpServer = (port, htmlPath) => {
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain"
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let fileName = "." + req.url;
      if (fileName === "./") fileName = "./index.html";

      const extname = path.extname(fileName).toLowerCase();
      if(!extname){
        fileName = "./index.html";
      }
      const contentType = mimeTypes[extname] || "text/html";
      const filePath = path.join(__dirname, ...(htmlPath || ["html"]), fileName);
      try {
        const data = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      } catch (e) {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      server.listen(port, resolve);
    } catch (e) {
      reject(e);
    }
  })
}

export function compareObjectsReal(a, b) {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false;
      if (!compareObjects(a[aKeys[i]], b[bKeys[i]])) return false;
    }
    return true;
  }

  // Handle special numbers
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }

  return false;
}

export const compareObjects = (obj1, obj2, debug) => {
  const sortKeys = (value) => {
    if (Array.isArray(value)) {
      return value.map(sortKeys);
    } else if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((res, key) => {
          res[key] = sortKeys(value[key]);
          return res;
        }, {});
    }
    return value;
  }
  const j1 = JSON.stringify(sortKeys(obj1));
  const j2 = JSON.stringify(sortKeys(obj2));
  if (debug) {
    console.log(j1);
    console.log("-----------------------");
    console.log(j2);
  }
  return  j1 == j2;
}

