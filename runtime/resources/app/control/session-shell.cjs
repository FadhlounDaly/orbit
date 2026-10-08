'use strict';
const path=require('node:path');
class SessionShell{
 constructor({BrowserWindow,screen,ipcMain,globalShortcut,onEnd,onResume=()=>{},audio,onProfile=()=>{},profile='balanced',root=path.resolve(__dirname,'..')}){
  Object.assign(this,{BrowserWindow,screen,ipcMain,globalShortcut,onEnd,onResume,audio,onProfile,profile,root});this.window=null;this.active=false;this.expanded=false;this.busy=false;this.title='Your PC';
  for(const [name,fn] of Object.entries({menu:()=>this.toggle(),resume:()=>this.resume(),end:()=>this.end(),volume:level=>this.volume(level),quality:profile=>this.quality(profile)}))ipcMain.handle('orbit:session:'+name,async (event,value)=>{
   if(!this.active||!this.window||event.sender!==this.window.webContents||event.senderFrame!==this.window.webContents.mainFrame)throw Error('Unsupported session control caller');return fn(value);
  });
 }
 ensure(){
  if(this.window&&!this.window.isDestroyed())return;
  this.window=new this.BrowserWindow({width:176,height:54,show:false,frame:false,transparent:true,resizable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,title:'Orbit session',webPreferences:{preload:path.join(this.root,'session-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});
  this.window.setAlwaysOnTop(true,'screen-saver');this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.window.webContents.on('will-navigate',event=>event.preventDefault());
  this.window.webContents.on('did-finish-load',()=>this.render());this.window.on('blur',()=>{if(this.active&&this.expanded&&!this.busy)this.resume();});
  this.window.loadFile(path.join(this.root,'session-ui/index.html'));
 }
 state(snapshot){
  const wasActive=this.active;this.game=Boolean(snapshot.session?.gameId||snapshot.session?.game);this.active=snapshot.state==='STREAMING';this.activeProfile=snapshot.session?.profile;this.title=snapshot.session?.game?.name||(snapshot.session?.intent==='steam'?'Steam Big Picture':'Your PC');
  if(this.active){this.ensure();this.position();if(!this.expanded)this.window.showInactive();if(!wasActive)this.globalShortcut.register('CommandOrControl+Alt+O',()=>this.toggle());}
  else{this.window?.hide();this.expanded=false;this.busy=false;this.audioState=null;this.globalShortcut.unregister('CommandOrControl+Alt+O');}
  this.render();
 }
 position(){if(!this.window)return;const {x,y,width}=this.screen.getPrimaryDisplay().bounds;const w=this.expanded?410:176,h=this.expanded?530:54;this.window.setBounds({x:x+width-w-18,y:y+16,width:w,height:h});}
 render(){this.window?.webContents.send('orbit:session-state',{title:this.title,game:this.game,expanded:this.expanded,busy:this.busy,audio:this.audioState,profile:this.profile,activeProfile:this.activeProfile});}
 toggle(){if(!this.active||this.busy)return;this.expanded=!this.expanded;this.window.setFocusable(this.expanded);this.position();this.render();if(this.expanded){this.window.show();this.window.focus();this.volume().catch(()=>{});}else this.window.showInactive();return {expanded:this.expanded};}
 resume(){if(!this.expanded)return;this.expanded=false;this.window.setFocusable(false);this.window.blur();this.position();this.render();this.window.showInactive();this.onResume();}
 async volume(level){if(!this.expanded)throw Error('Open the session menu first');try{this.audioState=await (level===undefined?this.audio?.read():this.audio?.set(level));}catch(e){this.audioState={available:false,reason:e.message};}this.render();return this.audioState;}
 quality(profile){if(!['balanced','smooth','sharp'].includes(profile))throw Error('Invalid stream quality');this.onProfile(profile);this.profile=profile;this.render();return {profile};}
 async end(){if(this.busy||!this.active)return;this.busy=true;this.render();try{return await this.onEnd();}finally{this.busy=false;this.render();}}
 close(){this.active=false;this.globalShortcut.unregister('CommandOrControl+Alt+O');this.window?.destroy();for(const name of ['menu','resume','end','volume','quality'])this.ipcMain.removeHandler('orbit:session:'+name);}
}
module.exports={SessionShell};
