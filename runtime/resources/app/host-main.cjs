'use strict';
const {app,BrowserWindow,ipcMain,session,safeStorage,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {HostBackend}=require('./host-backend.cjs');
const {Registry}=require('./control/model.cjs');
const {HostService}=require('./control/host-service.cjs');
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
    control=new HostService({backend,registry,journal:path.join(root,'data','host','session-journal.json')});
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
    handle('host:status',async()=>({...await backend.status(),linked:Boolean(registry.data.client),controlOnline:Boolean(control.server),devices:control.devices.list(),hostSession:control.sessions.snapshot()}));
    handle('host:start',start);
    handle('host:stop',async()=>{await control.sessions.shutdown();return backend.stop();});
    handle('host:link',()=>control.invitation());
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
