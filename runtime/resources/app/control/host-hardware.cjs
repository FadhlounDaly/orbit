'use strict';
const path=require('node:path'),{execFile}=require('node:child_process');
class HostHardware{
 constructor({execute=execFile,platform=process.platform,clock=Date.now}={}){Object.assign(this,{execute,platform,clock});this.value={graphics:[],error:null};this.at=null;this.pending=null;}
 async snapshot(){
  if(this.platform!=='win32')return this.value;
  if(this.pending)return this.pending;
  if(this.at!==null&&this.clock()-this.at<300000)return this.value;
  // Fixed read-only query. Hardware details are exposed only behind host authentication.
  const script="$ErrorActionPreference='Stop'; @{graphics=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)} | ConvertTo-Json -Depth 3 -Compress";
  this.pending=new Promise(resolve=>this.execute(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:5000,maxBuffer:65536},(error,out)=>{
   this.at=this.clock();try{const raw=JSON.parse(out);this.value={graphics:(Array.isArray(raw.graphics)?raw.graphics:[]).slice(0,8).map(g=>({name:String(g.Name||'Unknown graphics').slice(0,160),driverVersion:String(g.DriverVersion||'').slice(0,80)})),error:error?'Graphics details unavailable':null};}catch{this.value={graphics:[],error:'Graphics details unavailable'};}resolve(this.value);
  })).finally(()=>{this.pending=null;});return this.pending;
 }
}
module.exports={HostHardware};
