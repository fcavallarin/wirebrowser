import { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { main, quit } from "#src/app/main.js";
import { createInterface } from "readline";
import antdTokens from "#src/gui/themes/dark/antd-tokens.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAppVersion() {
  const appPath = app.isPackaged
    ? path.join(app.getAppPath(), "package.json")
    : path.join(__dirname, "..", "..", "package.json")

  return fs.existsSync(appPath)
    ? JSON.parse(fs.readFileSync(appPath, "utf8")).version
    : "unknown"
}

let win;
let isQuitting = false;
function createWindow() {
  if (app.dock) {
    app.dock.setIcon(
      nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
    );
  }

  win = new BrowserWindow({
    width: 1500,
    height: 900,
    backgroundColor: antdTokens.colorBgBase,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // backgroundThrottling: false
    },
  });

  if (process.env.ELECTRON_DEV) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
    Menu.setApplicationMenu(null);
  }
  main(win)
}

app.whenReady().then(createWindow);
// app.disableHardwareAcceleration();

ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Select file',
    properties: ['openFile', 'createDirectory'],
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('select-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Select folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('create-file', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'New file',
    defaultPath: '',
  });
  if (canceled) return null;
  return filePath;
});

ipcMain.handle("get-version", () => getAppVersion());

app.on('window-all-closed', () => {
  //if (process.platform !== 'darwin')
  app.quit();
});

app.on("before-quit", async (event) => {
  if (!isQuitting) {
    event.preventDefault();
    try {
      await quit();
    } finally {
      isQuitting = true;
      app.quit();
    }
  }
});

app.on("will-quit", () => {

});

process.on("SIGINT", () => {
  app.quit();
});

process.on("SIGTERM", () => {
  app.quit();
});

if (process.platform === "win32") {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    app.quit();
  });
}
