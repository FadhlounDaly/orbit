const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('orbit', {
  info: () => ipcRenderer.invoke('orbit:info'),
  getStatus: () => ipcRenderer.invoke('orbit:status'),
  saveConfig: config => ipcRenderer.invoke('orbit:config', config),
  openMoonlight: () => ipcRenderer.invoke('orbit:moonlight'),
  stream: appId => ipcRenderer.invoke('orbit:stream', appId),
  scenario: name => ipcRenderer.invoke('orbit:scenario', name),
  fullscreen: () => ipcRenderer.invoke('orbit:fullscreen'),
  quit: () => ipcRenderer.invoke('orbit:quit'),
  onReturn: listener => { const wrapped = (_, data) => listener(data); ipcRenderer.on('orbit:return', wrapped); return () => ipcRenderer.removeListener('orbit:return', wrapped); }
});
