'use strict';
const path=require('node:path');
const {StreamObserver}=require('./host-sessions.cjs');
// Covers the host desktop beneath the owned game; never takes keyboard/controller focus.
class GameCover{
 constructor({BrowserWindow,screen,backend}){Object.assign(this,{BrowserWindow,screen});this.observer=new StreamObserver(backend);this.window=null;this.connected=false;this.ending=false;this.timer=null;}
 async prepare(game){
  this.clear();if(!game)return;
  this.observer.reset();this.connected=false;this.ending=false;
  this.window=new this.BrowserWindow({show:false,frame:false,focusable:false,skipTaskbar:true,resizable:false,backgroundColor:'#080b10',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.window.webContents.on('will-navigate',e=>e.preventDefault());
  await this.window.loadFile(path.resolve(__dirname,'../game-cover/index.html'));
  this.window.setBounds(this.screen.getPrimaryDisplay().bounds);this.window.showInactive();
  this.onDisplay=()=>{if(this.window&&!this.window.isDestroyed())this.window.setBounds(this.screen.getPrimaryDisplay().bounds);};this.screen.on('display-metrics-changed',this.onDisplay);
  this.timer=setInterval(()=>this.tick(),250);this.timer.unref();
 }
 tick(){const state=this.observer.read();if(state==='STREAMING')this.connected=true;if(state==='RECONNECTING'){this.connected=false;if(this.ending)this.clear();}}
 end(){this.tick();this.ending=true;if(!this.connected)this.clear();}
 clear(){if(this.onDisplay)this.screen.removeListener('display-metrics-changed',this.onDisplay);this.onDisplay=null;clearInterval(this.timer);this.timer=null;this.window?.destroy();this.window=null;this.ending=false;this.connected=false;}
}
module.exports={GameCover};
