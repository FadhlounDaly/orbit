const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('orbitHost',{
 status:()=>ipcRenderer.invoke('host:status'), start:()=>ipcRenderer.invoke('host:start'),
 stop:()=>ipcRenderer.invoke('host:stop'), pair:value=>ipcRenderer.invoke('host:pair',value),
 steam:enabled=>ipcRenderer.invoke('host:steam',enabled),
 diagnostics:()=>ipcRenderer.invoke('host:diagnostics')
});
