const {contextBridge,ipcRenderer}=require('electron');
function listener(name,fn){const wrapped=(_,data)=>fn(data);ipcRenderer.on(name,wrapped);return()=>ipcRenderer.removeListener(name,wrapped);}
contextBridge.exposeInMainWorld('orbit',{
 quickSettings:()=>ipcRenderer.invoke('orbit:quick-settings'),
 info:()=>ipcRenderer.invoke('orbit:info'),
 getStatus:()=>ipcRenderer.invoke('orbit:status'),
 saveConfig:value=>ipcRenderer.invoke('orbit:config',value),
 discoverHosts:()=>ipcRenderer.invoke('orbit:discover'),
 selectHost:id=>ipcRenderer.invoke('orbit:select-host',id),
 link:()=>ipcRenderer.invoke('orbit:link'),
 cancelLink:()=>ipcRenderer.invoke('orbit:cancel-link'),
 stream:id=>ipcRenderer.invoke('orbit:stream',id),
 library:force=>ipcRenderer.invoke('orbit:library',{force:Boolean(force)}),
 play:id=>ipcRenderer.invoke('orbit:play',id),
 gameDetails:id=>ipcRenderer.invoke('orbit:game-details',id),
 disconnect:()=>ipcRenderer.invoke('orbit:disconnect'),
 fullscreen:()=>ipcRenderer.invoke('orbit:fullscreen'),
 quit:()=>ipcRenderer.invoke('orbit:quit'),
 onState:fn=>listener('orbit:state',fn),
 // These channels exist only in the isolated simulator.
 openMoonlight:()=>ipcRenderer.invoke('orbit:moonlight'),
 scenario:name=>ipcRenderer.invoke('orbit:scenario',name),
 onReturn:fn=>listener('orbit:return',fn)
});
