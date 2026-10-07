'use strict';
const path=require('node:path');
const {execFile}=require('node:child_process');
class WindowsGameProcesses{
 constructor({execute=execFile,platform=process.platform}={}){this.execute=execute;this.platform=platform;}
 run(script){return new Promise((resolve,reject)=>this.execute(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,maxBuffer:2*1024*1024},(e,out)=>{if(e)return reject(Error('Could not inspect or close the game on Zeiron'));try{resolve(JSON.parse(out||'null'));}catch{reject(Error('Invalid game process response'));}}));}
 async list(){if(this.platform!=='win32')return [];return (await this.run("$ErrorActionPreference='Stop'; @(@(Get-Process | Where-Object {$_.Path} | ForEach-Object { @{pid=$_.Id;exe=$_.Path;started=$_.StartTime.ToUniversalTime().Ticks.ToString();window=($_.MainWindowHandle -ne 0)} })) | ConvertTo-Json -Compress"))||[];}
 async close(item){
  if(!Number.isSafeInteger(item.pid)||!/^\d+$/.test(item.started))throw Error('Invalid game process identity');
  const result=await this.run(`$ErrorActionPreference='Stop'; $p=Get-Process -Id ${item.pid} -ErrorAction SilentlyContinue; if(!$p){'true'; exit}; if($p.StartTime.ToUniversalTime().Ticks.ToString() -ne '${item.started}'){throw 'Game process identity changed'}; if(!$p.CloseMainWindow()){throw 'Game has no window to close'}; $p.WaitForExit(3000) | ConvertTo-Json -Compress`);
  if(!result)throw Error('The game is still open. Resolve its exit or save dialog and try Close game again.');
 }
}
function same(a,b){return a.pid===b.pid&&a.started===b.started;}
class GameProcessTracker{
 constructor({processes=new WindowsGameProcesses()}={}){this.processes=processes;this.sessions=new Map();}
 async begin(record){const before=await this.processes.list();this.sessions.set(record.id,{before:before.map(p=>({...p})),root:record.launch.installRoot||record.launch.cwd||null,exe:record.launch.type==='local'?record.launch.exe:null,owned:[],seen:false});}
 async inspect(id){const tracked=this.sessions.get(id);if(!tracked)return {finished:false};const now=await this.processes.list();const normalize=p=>p?.replaceAll('\\','/').toLowerCase();const root=normalize(tracked.root),exe=normalize(tracked.exe);
  const matches=now.filter(p=>!tracked.before.some(b=>same(b,p))&&(exe?normalize(p.exe)===exe:root&&normalize(p.exe).startsWith(root.replace(/\/$/,'')+'/')));
  for(const p of matches.filter(p=>p.window))if(!tracked.owned.some(b=>same(b,p)))tracked.owned.push(p);
  if(matches.some(p=>p.window))tracked.seen=true;
  return {finished:tracked.seen&&!tracked.owned.some(p=>now.some(n=>same(p,n))),tracked};
 }
 async close(id){const {tracked}=await this.inspect(id);if(!tracked)return;if(!tracked.owned.length)throw Error('Orbit has not detected this game yet. Finish the launcher dialog before closing it.');const now=await this.processes.list();for(const p of tracked.owned)if(now.some(n=>same(p,n)))await this.processes.close(p);this.sessions.delete(id);}
}
module.exports={WindowsGameProcesses,GameProcessTracker};
