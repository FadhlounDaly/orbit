'use strict';
const path=require('node:path');
const {PROFILES}=require('./moonlight.cjs');
class SessionShell{
 constructor({BrowserWindow,screen,ipcMain,globalShortcut,onEnd,onResume=()=>{},onReturn=()=>{},audio,device,onProfile=()=>{},profile='balanced',root=path.resolve(__dirname,'..')}){
  Object.assign(this,{BrowserWindow,screen,ipcMain,globalShortcut,onEnd,onResume,onReturn,audio,device,onProfile,profile,root});this.window=null;this.active=false;this.quickOpen=false;this.expanded=false;this.busy=false;this.title='Quick settings';
  const actions={menu:()=>this.toggle(),resume:()=>this.resume(),end:()=>this.end(),volume:n=>this.volume(n),quality:p=>this.quality(p),device:()=>this.refreshDevice(),brightness:n=>this.setDevice('brightness',n),deviceVolume:n=>this.setDevice('volume',n)};
  for(const [name,fn] of Object.entries(actions))ipcMain.handle('orbit:session:'+name,async(event,value)=>{
   if((!this.active&&!this.quickOpen)||!this.window||event.sender!==this.window.webContents||event.senderFrame!==this.window.webContents.mainFrame)throw Error('Unsupported session control caller');return fn(value);
  });this.channels=Object.keys(actions);
 }
 ensure(){
  if(this.window&&!this.window.isDestroyed())return;
  this.window=new this.BrowserWindow({width:176,height:54,show:false,frame:false,transparent:true,resizable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,title:'Orbit quick settings',webPreferences:{preload:path.join(this.root,'session-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});
  this.window.setAlwaysOnTop(true,'screen-saver');this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.window.webContents.on('will-navigate',e=>e.preventDefault());this.window.webContents.on('did-finish-load',()=>this.render());
  this.window.loadFile(path.join(this.root,'session-ui/index.html'));
 }
 state(snapshot){
  const wasActive=this.active;this.game=Boolean(snapshot.session?.gameId||snapshot.session?.game);this.active=snapshot.state==='STREAMING';this.activeProfile=snapshot.session?.profile;this.hostResponse=snapshot.hostInfo?.controlRoundTripMs;this.launching=['CONNECTING','RECONNECTING'].includes(snapshot.state);this.title=this.active?(snapshot.session?.game?.name||(snapshot.session?.intent==='steam'?'Steam Big Picture':'Desktop')):'Quick settings';
  if(this.active){this.quickOpen=false;this.ensure();this.position();if(!this.expanded)this.window.showInactive();if(!wasActive)this.globalShortcut.register('CommandOrControl+Alt+O',()=>this.toggle());}
  else{if(wasActive||this.launching){this.quickOpen=false;this.expanded=false;this.stopDeviceTimer();}if(!this.quickOpen)this.window?.hide();this.busy=false;this.audioState=null;this.globalShortcut.unregister('CommandOrControl+Alt+O');}this.render();
 }
 position(){if(!this.window)return;const {x,y,width,height}=this.screen.getPrimaryDisplay().bounds;const w=Math.min(this.expanded?430:176,width-36),h=Math.min(this.expanded?650:54,height-32);this.window.setBounds({x:x+width-w-18,y:y+16,width:w,height:h});}
 render(){if(!this.window||this.window.isDestroyed())return;const [resolution,fps,bitrate]=PROFILES[this.activeProfile||this.profile]||PROFILES.balanced;this.window?.webContents.send('orbit:session-state',{title:this.title,game:this.game,streaming:this.active,expanded:this.expanded,busy:this.busy,audio:this.audioState,device:this.deviceState,deviceBusy:this.deviceBusy,deviceUpdating:this.deviceUpdating,deviceError:this.deviceError,profile:this.profile,activeProfile:this.activeProfile,stream:{resolution,fps:Number(fps),bitrateMbps:Number(bitrate)/1000,hostResponseMs:this.hostResponse}});}
 open(){if(this.busy||this.launching)throw Error('Wait for the session to start');if(!this.active)this.quickOpen=true;this.ensure();this.expanded=true;this.window.setFocusable(true);this.position();this.render();this.window.show();this.window.focus();if(this.active)this.volume().catch(()=>{});this.refreshDevice().catch(()=>{});this.startDeviceTimer();return {expanded:true};}
 toggle(){if(this.expanded){this.resume();return {expanded:false};}if(!this.active&&!this.quickOpen)return;return this.open();}
 resume(){if(!this.expanded)return;this.expanded=false;this.quickOpen=false;this.stopDeviceTimer();this.window.setFocusable(false);this.window.blur();this.position();this.render();if(this.active){this.window.showInactive();this.onResume();}else{this.window.hide();this.onReturn();}}
 stopDeviceTimer(){clearTimeout(this.deviceTimer);this.deviceTimer=null;}
 startDeviceTimer(){this.stopDeviceTimer();this.deviceTimer=setTimeout(async()=>{if(!this.expanded)return;try{await this.refreshDevice();}catch{}if(this.expanded)this.startDeviceTimer();},10000);this.deviceTimer.unref?.();}
 async refreshDevice(){if(!this.expanded)throw Error('Open Quick Settings first');if(this.deviceJob)return this.deviceJob;this.deviceUpdating=true;this.render();this.deviceJob=(async()=>{try{this.deviceState=await this.device?.read();this.deviceError=null;}catch(e){this.deviceState=null;this.deviceError=e.message;}finally{this.deviceUpdating=false;this.deviceJob=null;this.render();}return this.deviceState;})();return this.deviceJob;}
 async setDevice(kind,percent){if(!this.expanded||this.deviceBusy)throw Error('Wait for device settings to finish updating');if(!this.device)throw Error('Device settings unavailable');this.deviceBusy=true;this.render();try{this.deviceState=await this.device.set(kind,percent);return this.deviceState;}finally{this.deviceBusy=false;this.render();}}
 async volume(level){if(!this.expanded||!this.active)throw Error('Open the stream menu first');try{this.audioState=await(level===undefined?this.audio?.read():this.audio?.set(level));}catch(e){this.audioState={available:false,reason:e.message};}this.render();return this.audioState;}
 quality(profile){if(!PROFILES[profile])throw Error('Invalid stream quality');this.onProfile(profile);this.profile=profile;this.render();return {profile};}
 async end(){if(this.busy||!this.active)return;this.busy=true;this.render();try{return await this.onEnd();}finally{this.busy=false;this.render();}}
 close(){this.active=false;this.quickOpen=false;this.expanded=false;this.stopDeviceTimer();this.globalShortcut.unregister('CommandOrControl+Alt+O');this.window?.destroy();for(const name of this.channels)this.ipcMain.removeHandler('orbit:session:'+name);}
}
module.exports={SessionShell};
