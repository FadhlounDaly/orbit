'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('orbitSession',{
 menu:()=>ipcRenderer.invoke('orbit:session:menu'),resume:()=>ipcRenderer.invoke('orbit:session:resume'),end:()=>ipcRenderer.invoke('orbit:session:end'),
 volume:level=>ipcRenderer.invoke('orbit:session:volume',level),quality:profile=>ipcRenderer.invoke('orbit:session:quality',profile),
 onState:fn=>ipcRenderer.on('orbit:session-state',(_,state)=>fn(state))
});
