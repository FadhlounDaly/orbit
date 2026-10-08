'use strict';
const {app,BrowserWindow,ipcMain,session,safeStorage,shell,nativeImage,screen}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {HostBackend}=require('./host-backend.cjs');
const {Registry}=require('./control/model.cjs');
const {GameCover}=require('./control/game-cover.cjs');
const {HostService}=require('./control/host-service.cjs');
const {GameLibrary}=require('./control/game-library.cjs');
const {GameGraphics}=require('./control/game-graphics.cjs');
const {WindowsDisplay}=require('./control/windows-display.cjs');
const {StoreArtworkCache}=require('./control/game-artwork.cjs');
const root=path.resolve(__dirname,'../../..');
app.setName('Orbit Host');
const interfaceData=path.join(root,'data','host','interface');
fs.mkdirSync(interfaceData,{recursive:true});
app.setPath('userData',interfaceData);
app.enableSandbox();
let win,backend,control;
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{win?.show();win?.focus();});
  app.whenReady().then(()=>{
    backend=new HostBackend({root,vault:safeStorage});
    const registry=new Registry(path.join(root,'data','host','devices.bin'),'host',safeStorage);
    const artworkCache=new Map();
    const library=new GameLibrary({profilesFile:path.join(root,'data/host/library-profiles.json'),artworkCache:new StoreArtworkCache({dir:path.join(root,'data/host/library-artwork')}),artwork:(file,{hero=false}={})=>{
      const stat=fs.statSync(file);if(stat.size>12*1024*1024)return null;
      const stamp=stat.mtimeMs,key=file+':'+stamp+':'+hero;
      if(artworkCache.has(key))return artworkCache.get(key);
      const image=nativeImage.createFromPath(file);if(image.isEmpty())return null;
      const data='data:image/jpeg;base64,'+image.resize({width:hero?960:200,quality:'good'}).toJPEG(hero?60:58).toString('base64');
      if(artworkCache.size>500)artworkCache.clear();artworkCache.set(key,data);return data;
    }});
    control=new HostService({backend,registry,library,cover:new GameCover({BrowserWindow,screen,backend}),display:new WindowsDisplay(),graphics:new GameGraphics({skyrimPrefs:path.join(app.getPath('documents'),'My Games/Skyrim Special Edition/SkyrimPrefs.ini')}),journal:path.join(root,'data','host','session-journal.json')});
    const start=async()=>{
      // Existing certificates let the command center stay available if the engine is offline.
      if(fs.existsSync(backend.paths().cert))await control.start();
      await backend.start();try{await control.start();}catch(e){backend.message='Orbit device control could not start: '+e.message;throw e;}return backend.status();};
    session.defaultSession.setPermissionRequestHandler((_,__,cb)=>cb(false));
    win=new BrowserWindow({width:1180,height:820,minWidth:800,minHeight:650,backgroundColor:'#080e18',
      autoHideMenuBar:true,title:'Orbit · Host',webPreferences:{preload:path.join(__dirname,'host-preload.cjs'),
      sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
    win.on('close',event=>{if(!finished){event.preventDefault();app.quit();}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{
      if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame) throw new Error('Unsupported caller');
      return fn(...args);
    });
    handle('host:status',async()=>({...await backend.status(),linked:Boolean(registry.data.client),controlOnline:Boolean(control.server),devices:control.devices.list(),pairingRequests:control.devices.requests(),hostSession:control.sessions.snapshot()}));
    handle('host:start',start);
    handle('host:stop',async()=>{await control.sessions.shutdown();return backend.stop();});
    handle('host:pair',input=>control.approvePairing(input));
    handle('host:dismiss-pairing',challenge=>{const p=control.devices.pending;return control.devices.cancelRequest({challenge},p?.address);});
    handle('host:revoke',id=>{control.revoke(id);return {removed:true};});
    handle('host:steam',value=>backend.setSteam(value));
    handle('host:diagnostics',()=>shell.openPath(backend.dir));
    win.loadFile(path.join(__dirname,'host-ui/index.html'));
    if(process.argv.includes('--start-host')) start().catch(error=>{backend.message=error.message;});
  });
  app.on('window-all-closed',()=>app.quit());
  let shuttingDown=false,finished=false;
  app.on('before-quit',event=>{
    if(finished||!control)return;event.preventDefault();if(shuttingDown)return;shuttingDown=true;
    control.stop().then(()=>backend.stop()).then(()=>{finished=true;app.quit();}).catch(error=>{
      shuttingDown=false;backend.message=error.message;if(win&&!win.isDestroyed())win.show();
    });
  });
}
