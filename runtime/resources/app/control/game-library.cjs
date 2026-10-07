'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,spawn}=require('node:child_process');
const GAME_ID=/^(?:steam:\d{1,12}|(?:xbox|local):[a-f0-9]{64})$/;
const TOOL_IDS=new Set(['250820','431960','837380']);
const hash=value=>crypto.createHash('sha256').update(value.toLowerCase()).digest('hex');
function read(file,max=1024*1024){try{if(fs.statSync(file).size>max)return '';return fs.readFileSync(file,'utf8');}catch{return '';}}
function entries(dir){try{return fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}}
function inside(base,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||/^[a-z]:/i.test(relative))return null;
 const file=path.resolve(base,relative.replaceAll('\\',path.sep));
 if(!file.startsWith(path.resolve(base)+path.sep))return null;
 try{if(!fs.realpathSync(file).startsWith(fs.realpathSync(base)+path.sep))return null;return file;}catch{return null;}
}
function vdf(text,key){return text.match(new RegExp('"'+key+'"\\s+"([^"\\r\\n]*)"'))?.[1]?.replaceAll('\\\\','\\');}
function attributes(text,tag){
 const line=text.match(new RegExp('<'+tag+'\\b([^>]*)>','i'))?.[1]||'';
 return Object.fromEntries([...line.matchAll(/([\w]+)\s*=\s*"([^"]*)"/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>')]));
}
function windowsCatalog(){
 if(process.platform!=='win32')return Promise.resolve({packages:[],steamPath:null});
 // Fixed local read: never assembled from a handheld request.
 const command="$ErrorActionPreference='Stop'; $steam=(Get-ItemProperty HKCU:\\Software\\Valve\\Steam -ErrorAction SilentlyContinue).SteamPath; @{steamPath=$steam;packages=@(Get-AppxPackage | Where-Object {-not $_.IsFramework} | Select-Object Name,PackageFamilyName,InstallLocation)} | ConvertTo-Json -Depth 4 -Compress";
 return new Promise(resolve=>execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-Command',command],{windowsHide:true,timeout:15000,maxBuffer:2*1024*1024},(e,out)=>{
  try{resolve(e?{packages:[],steamPath:null}:JSON.parse(out));}catch{resolve({packages:[],steamPath:null});}
 }));
}
function defaultRoots(){
 if(process.platform!=='win32')return [];
 const roots=[];for(const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ')for(const dir of ['XboxGames','Games']){const p=drive+':\\'+dir;if(fs.existsSync(p))roots.push(p);}return roots;
}
class GameLibrary{
 constructor({catalog=windowsCatalog,roots=defaultRoots,steamRoot,profilesFile=null,artwork=()=>null,artworkCache=null,clock=Date.now}={}){
  this.profilesFile=profilesFile;this.catalog=catalog;this.roots=roots;this.steamRoot=steamRoot;this.artwork=artwork;this.artworkCache=artworkCache;this.clock=clock;
  this.records=new Map();this.scannedAt=null;this.pending=null;this.warnings=[];
 }
 async refresh(force=false){
  if(this.pending)return this.pending;
  if(!force&&this.scannedAt!==null&&this.clock()-this.scannedAt<30000)return;
  this.pending=this.scan().finally(()=>{this.pending=null;});return this.pending;
 }
 async scan(){
  const catalog=await this.catalog(),records=new Map();this.warnings=[];
  const steam=catalog.steamPath||this.steamRoot||(process.platform==='win32'?'C:\\Program Files (x86)\\Steam':null);
  if(steam){
   const libraries=new Set([steam]);
   for(const m of read(path.join(steam,'steamapps/libraryfolders.vdf')).matchAll(/"path"\s+"([^"]+)"/g))libraries.add(m[1].replaceAll('\\\\','\\'));
   for(const folder of [...libraries].slice(0,32))for(const file of entries(path.join(folder,'steamapps')).slice(0,3000)){
    if(!/^appmanifest_\d+\.acf$/.test(file.name))continue;
    const text=read(path.join(folder,'steamapps',file.name)),id=vdf(text,'appid'),name=vdf(text,'name'),install=vdf(text,'installdir');
    if(!/^\d{1,12}$/.test(id||'')||id==='228980'||!name||name.length>200||!inside(path.join(folder,'steamapps/common'),install))continue;
    const artworkFiles=[path.join(steam,'appcache/librarycache',id,'library_600x900.jpg'),path.join(steam,'appcache/librarycache',id+'_library_600x900.jpg'),path.join(steam,'appcache/librarycache',id,'header.jpg')];
    const record={id:'steam:'+id,name,provider:'Steam',kind:TOOL_IDS.has(id)?'app':'game',installed:true,launchable:fs.existsSync(path.join(steam,'steam.exe')),artFile:artworkFiles.find(p=>fs.existsSync(p)),launch:{type:'steam',exe:path.join(steam,'steam.exe'),appId:id}};
    records.set(record.id,record);
   }
  }
  const packages=Array.isArray(catalog.packages)?catalog.packages:[];
  const locations=new Set(packages.map(p=>p.InstallLocation).filter(Boolean));
  for(const root of this.roots().slice(0,48))for(const dir of entries(root).slice(0,1000))if(dir.isDirectory()){
   locations.add(path.join(root,dir.name));locations.add(path.join(root,dir.name,'Content'));
  }
  for(const dir of locations){
   const xml=read(path.join(dir,'MicrosoftGame.config'));
   if(!xml)continue;
   const identity=attributes(xml,'Identity'),visual=attributes(xml,'ShellVisuals'),exe=attributes(xml,'Executable');
   const pkg=packages.find(p=>p.Name===identity.Name);
   const application=attributes(read(path.join(pkg?.InstallLocation||dir,'AppxManifest.xml'))||read(path.join(dir,'AppxManifest.xml')),'Application');
   const appId=application.Id||exe.Id;
   if(!identity.Name||!appId||!exe.Name)continue;
   const family=pkg?.PackageFamilyName,aumid=family?family+'!'+appId:null;
   if(aumid&&!/^[a-zA-Z0-9_.-]+![a-zA-Z0-9_.-]+$/.test(aumid))continue;
   const file=inside(dir,exe.Name),name=visual.DefaultDisplayName&&!visual.DefaultDisplayName.startsWith('ms-resource:')?visual.DefaultDisplayName:path.basename(dir)==='Content'?path.basename(path.dirname(dir)):identity.Name;
   const id='xbox:'+hash(identity.Name+'!'+appId);
   const artFile=[visual.Square480x480Logo,visual.Square150x150Logo,visual.StoreLogo].map(p=>inside(dir,p)).find(Boolean);
   const storeId=xml.match(/<StoreId>\s*([a-z0-9]{12})\s*<\/StoreId>/i)?.[1];
   const record={id,storeId,name:name.slice(0,200),provider:'Xbox',kind:'game',installed:Boolean(file||pkg),launchable:Boolean(aumid&&pkg),artFile,launch:{type:'xbox',aumid},detail:aumid?'':'Open this game once on Zeiron to finish its Xbox registration.'};
   // A content copy can supply richer artwork than the registered WindowsApps wrapper.
   const old=records.get(id);if(!old||(!old.artFile&&artFile))records.set(id,record);
  }
  // Only an unambiguous standalone executable directly in a known local Games folder.
  // Never traverse installers, emulator folders, or infer arguments from a renderer.
  for(const root of this.roots().slice(0,48))for(const dir of entries(root).slice(0,1000))if(dir.isDirectory()){
   const base=path.join(root,dir.name);
   if(fs.existsSync(path.join(base,'MicrosoftGame.config'))||fs.existsSync(path.join(base,'Content/MicrosoftGame.config')))continue;
   const candidates=entries(base).filter(f=>f.isFile()&&/\.exe$/i.test(f.name)&&!/(?:unins|setup|install|launcher|crash|helper|qtweb|yuzu|ryujinx|redist|update|repair)/i.test(f.name));
   if(candidates.length!==1)continue;
   const exe=inside(base,candidates[0].name);if(!exe)continue;
   const id='local:'+hash(exe),artFile=['game.jpg','cover.jpg','Cover.jpg','cover.png'].map(p=>inside(base,p)).find(Boolean);
   records.set(id,{id,name:dir.name,provider:'PC',kind:'game',installed:true,launchable:true,artFile,launch:{type:'local',exe,cwd:base}});
  }
  // Profiles are a local host file. Clients send only the resulting opaque ID.
  let profiles=[];try{profiles=JSON.parse(read(this.profilesFile)).games||[];}catch{}
  for(const profile of (Array.isArray(profiles)?profiles:[]).slice(0,100)){
   if(!profile||typeof profile!=='object')continue;
   if(profile.provider!=='Emulation'||typeof profile.name!=='string'||profile.name.length>200||typeof profile.root!=='string'||!path.isAbsolute(profile.root))continue;
   const exe=inside(profile.root,profile.executable),rom=inside(profile.root,profile.rom),data=inside(profile.root,profile.dataDirectory);
   if(!exe||!rom||!data||! /\.(?:nsp|xci)$/i.test(rom)||!fs.statSync(data).isDirectory())continue;
   const ryujinx=/^Ryujinx\.exe$/i.test(path.basename(exe)),yuzu=/^yuzu(?:_ea|_preview)?\.exe$/i.test(path.basename(exe));
   if(!ryujinx&&!yuzu)continue;
   if(yuzu&&path.resolve(data)!==path.join(path.dirname(exe),'user'))continue;
   const id=typeof profile.id==='string'&&/^local:[a-f0-9]{64}$/.test(profile.id)?profile.id:'local:'+hash(profile.root+'|'+rom);
   records.set(id,{id,name:profile.name,provider:'Emulation',kind:'game',installed:true,launchable:true,artFile:inside(profile.root,profile.artwork),launch:{type:'local',exe,cwd:path.dirname(exe),args:ryujinx?['-r',data,'--fullscreen',rom]:['-f','-g',rom]}});
  }
  this.records=new Map([...records].slice(0,500));
  if(this.artworkCache)await this.artworkCache.prepare(this.records);
  this.scannedAt=this.clock();
 }
 async list({force=false}={}){
  await this.refresh(force);
  return {version:1,updatedAt:new Date(this.scannedAt).toISOString(),games:[...this.records.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)).map(r=>{
   let art=null;try{art=r.artFile?this.artwork(r.artFile):null;}catch{}
   if(typeof art!=='string'||art.length>24000||!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(art))art=null;
   return {id:r.id,name:r.name,provider:r.provider,kind:r.kind,installed:r.installed,launchable:r.launchable,artwork:art,detail:r.detail||''};
  })};
 }
 async details(id){
  if(typeof id!=='string'||!GAME_ID.test(id))throw Object.assign(Error('Choose a game from Zeiron’s library'),{status:400});
  await this.refresh();const record=this.records.get(id);if(!record)throw Object.assign(Error('Game is no longer in Zeiron’s library'),{status:404});
  let hero=null;try{if(record.heroFile)hero=this.artwork(record.heroFile,{hero:true});}catch{}
  if(typeof hero!=='string'||hero.length>180000||!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(hero))hero=null;
  return {id:record.id,hero};
 }
 async resolve(id){
  if(typeof id!=='string'||!GAME_ID.test(id))throw Object.assign(Error('Choose a game from Zeiron’s library'),{status:400});
  await this.refresh(true);const record=this.records.get(id);
  if(!record?.installed||!record.launchable)throw Object.assign(Error('This game is unavailable on Zeiron. Refresh your library.'),{status:409});
  return record;
 }
}
class GameLaunchManager{
 constructor({execute=execFile,spawnProcess=spawn,platform=process.platform,systemRoot=process.env.SystemRoot||'C:\\Windows'}={}){this.platform=platform;this.execute=execute;this.spawnProcess=spawnProcess;this.systemRoot=systemRoot;this.active=new Map();}
 async launch(record){
  if(!record||!GAME_ID.test(record.id)||!record.launchable)throw Error('Unknown game launch target');
  const target=record.launch;
  if(target.type==='local'){
   if(!fs.existsSync(target.exe))throw Error('Game is no longer installed on Zeiron');
   const existing=this.active.get(target.exe);
   if(existing&&existing.exitCode==null&&!existing.killed)return {state:'PROCESS_STARTED',name:record.name};
   return new Promise((resolve,reject)=>{
    const child=this.spawnProcess(target.exe,target.args||[],{cwd:target.cwd,shell:false,detached:false,windowsHide:false,stdio:'ignore',env:{...process.env,__COMPAT_LAYER:'RunAsInvoker'}});
    child.once('error',error=>reject(Error(error.code==='EACCES'?'Windows blocked this game. Open its setup once on Zeiron; Orbit will not request administrator approval during Play.':'Zeiron could not start this game ('+(error.code||'unknown error')+')')));
    child.once('exit',()=>{if(this.active.get(target.exe)===child)this.active.delete(target.exe);});
    child.once('spawn',()=>{this.active.set(target.exe,child);child.unref();resolve({state:'PROCESS_STARTED',name:record.name});});
   });
  }
  const exe=target.type==='steam'?target.exe:path.join(this.systemRoot,'explorer.exe');
  const args=target.type==='steam'?['-applaunch',target.appId]:['shell:AppsFolder\\'+target.aumid];
  if(target.type==='steam'&&!/^\d{1,12}$/.test(target.appId))throw Error('Invalid Steam target');
  if(target.type==='xbox'&&!/^[a-zA-Z0-9_.-]+![a-zA-Z0-9_.-]+$/.test(target.aumid))throw Error('Invalid Xbox target');
  if(!['steam','xbox'].includes(target.type))throw Error('Unsupported game provider');
  return new Promise((resolve,reject)=>this.execute(exe,args,{windowsHide:true,shell:false,timeout:15000},error=>{
   if(error)return reject(Error('Zeiron could not request this game from '+record.provider));
   resolve({state:'REQUESTED',name:record.name});
  }));
 }
}
module.exports={GameLibrary,GameLaunchManager,GAME_ID,windowsCatalog,inside,attributes};
