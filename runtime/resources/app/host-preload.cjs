const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('orbitHost',{
 status:()=>ipcRenderer.invoke('host:status'), start:()=>ipcRenderer.invoke('host:start'),
 stop:()=>ipcRenderer.invoke('host:stop'), link:()=>ipcRenderer.invoke('host:link'),
  revoke:id=>ipcRenderer.invoke('host:revoke',id),
 steam:enabled=>ipcRenderer.invoke('host:steam',enabled),
 diagnostics:()=>ipcRenderer.invoke('host:diagnostics')
});
