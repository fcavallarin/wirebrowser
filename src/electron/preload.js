const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (msg) => ipcRenderer.send('send-message', msg),
  onMessage: (callback) => ipcRenderer.on('on-message', (_, data) => callback(data)),
  ready: () => ipcRenderer.send('renderer-ready'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectDir: () => ipcRenderer.invoke('select-dir'),
  createFile: () => ipcRenderer.invoke('create-file'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', { url }),
});
