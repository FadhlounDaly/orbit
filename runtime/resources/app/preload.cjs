const {contextBridge,ipcRenderer}=require('electron');
function listener(name,fn){const wrapped=(_,data)=>fn(data);ipcRenderer.on(name,wrapped);return()=>ipcRenderer.removeListener(name,wrapped);}
contextBridge.exposeInMainWorld('orbit',{
 info:()=>ipcRenderer.invoke('orbit:info'),
 getStatus:()=>ipcRenderer.invoke('orbit:status'),
 saveConfig:value=>ipcRenderer.invoke('orbit:config',value),
 link:code=>ipcRenderer.invoke('orbit:link',code),
 stream:id=>ipcRenderer.invoke('orbit:stream',id),
 disconnect:()=>ipcRenderer.invoke('orbit:disconnect'),
 fullscreen:()=>ipcRenderer.invoke('orbit:fullscreen'),
 quit:()=>ipcRenderer.invoke('orbit:quit'),
 onState:fn=>listener('orbit:state',fn),
 // These channels exist only in the isolated simulator.
 openMoonlight:()=>ipcRenderer.invoke('orbit:moonlight'),
 scenario:name=>ipcRenderer.invoke('orbit:scenario',name),
 onReturn:fn=>listener('orbit:return',fn)
});
