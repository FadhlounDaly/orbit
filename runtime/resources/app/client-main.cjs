'use strict';
const {app,BrowserWindow,ipcMain,session,safeStorage}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {Registry}=require('./control/model.cjs');
const {MoonlightAdapter,PROFILES}=require('./control/moonlight.cjs');
const {ClientCoordinator}=require('./control/client.cjs');
const root=path.resolve(__dirname,'../../..'),data=path.join(root,'data','launcher');
fs.mkdirSync(data,{recursive:true});
app.setPath('userData',data);app.setPath('sessionData',path.join(data,'browser'));
app.setName('Orbit');app.enableSandbox();
let win,coordinator;
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{win?.restore();win?.show();win?.focus();});
 app.whenReady().then(()=>{
  let old={host:'',profile:'balanced'};
  try{old={...old,...JSON.parse(fs.readFileSync(path.join(data,'config.json'),'utf8'))};}catch{}
  let config={profile:PROFILES[old.profile]?old.profile:'balanced'};
  const registry=new Registry(path.join(data,'devices.bin'),'client',safeStorage);
  const adapter=new MoonlightAdapter({root});
  let previous='UNKNOWN';
  coordinator=new ClientCoordinator({registry,adapter,legacyHost:old.host,profile:config.profile,notify:s=>{
   if(!win||win.isDestroyed())return;
   win.webContents.send('orbit:state',s);
   if(s.state==='STREAMING')win.minimize();
   if(['READY','ERROR','OFFLINE','RECONNECTING'].includes(s.state)&&['CONNECTING','STREAMING','RECONNECTING'].includes(previous)){
    win.restore();win.show();win.focus();
   }
   previous=s.state;
  }});
  session.defaultSession.setPermissionRequestHandler((_,__,cb)=>cb(false));
  win=new BrowserWindow({width:1280,height:800,minWidth:850,minHeight:620,backgroundColor:'#080e18',
   title:'Orbit',autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),
   sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{
   if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Unsupported caller');
   return fn(...args);
  });
  handle('orbit:info',()=>({simulator:false,config,platform:process.platform,version:'0.7.0'}));
  handle('orbit:status',()=>coordinator.refresh());
  handle('orbit:discover',()=>coordinator.discover());
  handle('orbit:select-host',id=>coordinator.selectHost(id));
  handle('orbit:link',()=>coordinator.link());
  handle('orbit:cancel-link',()=>coordinator.cancelLink());
  handle('orbit:stream',id=>coordinator.connect(id));
  handle('orbit:library',input=>{if(input!==undefined&&(!input||typeof input.force!=='boolean'||Object.keys(input).length!==1))throw Error('Invalid library request');return coordinator.library(input);});
  handle('orbit:play',id=>coordinator.play(id));
  handle('orbit:game-details',id=>coordinator.gameDetails(id));
  handle('orbit:disconnect',()=>coordinator.disconnect());
  handle('orbit:config',input=>{
   if(!input||Object.keys(input).length!==1||!PROFILES[input.profile])throw Error('Invalid Orbit preference');
   config={profile:input.profile};coordinator.profile=config.profile;
   // Preserve legacy address for existing installations; keep credentials in the encrypted registry.
   fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({...old,profile:config.profile},null,2));
   return config;
  });
  handle('orbit:fullscreen',()=>{win.setFullScreen(!win.isFullScreen());return win.isFullScreen();});
  handle('orbit:quit',()=>app.quit());
  win.loadFile(path.join(__dirname,'client-ui/index.html'));
  win.once('ready-to-show',()=>{win.show();if(!process.argv.includes('--windowed'))win.setFullScreen(true);});
 });
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>coordinator?.close());
}
