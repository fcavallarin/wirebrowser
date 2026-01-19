import puppeteer from "puppeteer-core";
import { computeExecutablePath, install } from "@puppeteer/browsers";
import fs from "fs";
import os from "os";
import Network from "#src/app/modules/network/network.js";
import Automation from "#src/app/modules/automation/automation.js";
import Heap from "#src/app/modules/heap/heap.js";
import PagesManager from "#src/app/pages-manager.js";
import IdManager from "#src/app/id-manager.js";
import UIEvents from "#src/app/ui-events.js";
import {
  getTargetId,
  extSendTabId,
  getExtWorker,
  getCurrentDir
} from "#src/app/utils.js";
import SettingsManager from "#src/app/settings/settings-manager.js";
import AppSettingsManager from "#src/app/appsettings-manager.js";
import path from "path";
import BrowserUtils from "#src/app/modules/automation/browser-utils.js";
import { getPageScriptContent } from "#src/app/utils.js";
import { app } from "electron";
import { CHROME_VERSION } from "#src/common/constants.js";


let browser;
let relaunchBrowser = true;
const pagesManager = new PagesManager();
const idManager = new IdManager();
let uiEvents;
let cdpWsEndpoint;
let loadedModules = [];


const getChromePath = () => {
  return app.isPackaged
    ? path.join(app.getPath("userData"), "wirebrowser")
    : path.join(getCurrentDir(import.meta.url), "..", "..");
}


const getChromeExePath = () => {
  return computeExecutablePath({
    browser: "chrome",
    buildId: CHROME_VERSION,
    cacheDir: getChromePath()
  });
};


const installChrome = async () => {
  const chromePath = getChromePath();
  const extpath = getExtensionPath();
  console.log(`Downloading chrome into ${chromePath}`);
  uiEvents.dispatch("installingChrome", {
    path: chromePath,
    extensionPath: extpath,
    isPackaged: app.isPackaged,
    isLinux: process.platform === "linux"
  });
  await install({
    browser: "chrome",
    buildId: CHROME_VERSION,
    cacheDir: chromePath
  });

  if (process.platform === "linux" && app.isPackaged) {
    const resolved = path.resolve(path.join(process.resourcesPath, "chrome-extension"));
    fs.mkdirSync(extpath, { recursive: true });
    fs.cpSync(resolved, extpath, { recursive: true });
  }

  uiEvents.dispatch("installingChromeDone");
};


const getExtensionPath = () => {
  if (process.platform === "linux" && app.isPackaged) {
    return path.join(
      os.homedir(),
      "wirebrowser",
      "chrome-extension"
    );
  }

  return path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(getCurrentDir(import.meta.url), ".."),
    "chrome-extension"
  );

};

const newBrowser = async (settingsManager) => {
  const chromeExePath = getChromeExePath();
  if (!fs.existsSync(chromeExePath)) {
    await installChrome();
  }
  const extpath = getExtensionPath();
  const chromeArgs = [
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
    '--silent-debugger-extension-api',
    '--disable-background-timer-throttling',
    '--disable-background-networking',
    '--disable-backgrounding',
    '--disable-hang-monitor',
    '--disable-http2',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-renderer-backgrounding',
  ];

  if (settingsManager.settings?.global?.browser?.openDevTools) {
    chromeArgs.push(`--auto-open-devtools-for-tabs`);
  }

  if (settingsManager.settings?.global?.browser?.proxyServer) {
    chromeArgs.push(`--proxy-server=${settingsManager.settings.global.browser.proxyServer}`);
  }

  if (settingsManager.settings?.global?.browser?.disableCache) {
    chromeArgs.push('--disable-http-cache');
  }
  try {
    browser = await puppeteer.launch({
      executablePath: chromeExePath,
      headless: false,
      defaultViewport: null,
      ignoreHTTPSErrors: true,
      userDataDir: settingsManager.settings?.global?.browser?.dataDir || undefined,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: chromeArgs
    });
  } catch (e) {
    console.log("\n\nPuppeteer failed to launch.");
    console.log("If you are on ARM Linux, Puppeteer doesn’t provide a bundled Chromium.");
    console.log("Install a compatible version of Chromium manually (e.g. `sudo apt install chromium-browser`), then set:");
    console.log("  export PUPPETEER_EXECUTABLE_PATH=$(which chromium-browser)");
    uiEvents.dispatch("Error", `Puppeteer failed to launch, see the console for detailed error messages`);
    return null;
  }
  await initBrowser(browser, settingsManager, false);
  return browser;
}

const initBrowser = async (browser, settingsManager, isReconnect) => {
  cdpWsEndpoint = browser.wsEndpoint();
  const handleNewTarget = async (target) => {
    if (target.type() != 'page') {
      return;
    }
    const page = await target.page();
    const targetId = await getTargetId(target);

    // Return if targetId already exists, this is due to reconnecting
    if (pagesManager.getByTargetId(targetId)) {
      return;
    }
    const tabId = idManager.nextPageId();
    extSendTabId(browser, targetId, tabId);
    pagesManager.add(tabId, targetId, page);

    pagesManager.attach(page, "console", async (msg) => {
      const evtData = {
        type: msg.type(),
        text: []
      };

      for (const arg of msg.args()) {
        try {
          evtData.text.push(await arg.jsonValue());
        } catch {
          // fallback per DOM nodes
          try {
            evtData.text.push(await arg.evaluate(el => el.outerHTML));
          } catch {
            evtData.text.push(msg.text());
          }
        }
      }

      uiEvents.dispatch('consoleAddData', {
        pageId: tabId,
        data: evtData
      });
    });
    uiEvents.dispatch('newPage', `${tabId}`);

    const vars = settingsManager.settings?.global?.variables || {};
    const autoexecCreated = settingsManager?.settings?.automation?.scripts?.files.map(
      f => f.meta?.autoexec === "created" ? f.content : null
    ).filter(c => c) || [];
    const autoexecBefore = settingsManager?.settings?.automation?.scripts?.files.map(
      f => f.meta?.autoexec === "before-load" ? f.content : null
    ).filter(c => c) || [];
    const autoexecAfter = settingsManager?.settings?.automation?.scripts?.files.map(
      f => f.meta?.autoexec === "after-load" ? f.content : null
    ).filter(c => c) || [];


    for (const ax of autoexecCreated) {
      page.evaluate(getPageScriptContent(ax, BrowserUtils, vars));
    }

    for (const ax of autoexecBefore) {
      await page.evaluateOnNewDocument(getPageScriptContent(ax, BrowserUtils, vars));
    }

    if (autoexecAfter.length > 0) {
      pagesManager.attach(page, "load", () => {
        for (const ax of autoexecAfter) {
          page.evaluate(getPageScriptContent(ax, BrowserUtils, vars));
        }
      });
    }
  }

  browser.on("targetcreated", handleNewTarget);

  for (const m of loadedModules) {
    m.stop();
  }
  loadedModules = [];
  for (const module of [Network, Heap, Automation]) {
    const m = new module(uiEvents, pagesManager, settingsManager, idManager, browser);
    m.run();
    loadedModules.push(m);
  }

  if (!isReconnect) {
    // Wait for the extension to be ready
    await getExtWorker(browser);
    // Close inital page before browser.on("targetdestroyed"
    for (let t of browser.targets()) {
      if (t.type() === 'page') {
        const initialPage = await t.page();
        await browser.newPage();
        await initialPage.close();
        break;
      }
    }
  }

  browser.on("targetdestroyed", async (target) => {
    if (target.type() != 'page') {
      return;
    }

    const p = await target.page();
    const page = pagesManager.getByPage(p);
    if (page) {
      pagesManager.delete(page.pageId);
      uiEvents.dispatch('pageClosed', `${page.pageId}`);
    }
    if ((await browser.pages()).length == 0) {
      try {
        await browser.close();
      } catch { }
    }
  })

  browser.on("disconnected", async () => {
    if (relaunchBrowser) {
      try {
        console.log("Reconnecting to browser");
        browser = await puppeteer.connect({ browserWSEndpoint: cdpWsEndpoint, defaultViewport: null });
        await pagesManager.resetPages(browser);
        await initBrowser(browser, settingsManager, true);
      } catch (e) {
        console.log("Reloading browser");
        pagesManager.flush();
        browser = await newBrowser(settingsManager);
      }
    }
  });
};


export const main = async (window) => {
  uiEvents = new UIEvents(window);
  const settingsManager = new SettingsManager(uiEvents);
  const appSettingsManager = new AppSettingsManager(uiEvents);

  uiEvents.on("runBrowser", async (data) => {
    browser = await newBrowser(settingsManager);
    if (!browser) {
      return;
    }
    uiEvents.dispatch("browserRunning");
  });
  uiEvents.on("restartBrowser", async (data) => {
    await browser.close();
  });
};


export const quit = async () => {
  relaunchBrowser = false;
  try {
    await browser.close();
  } catch { }
};
