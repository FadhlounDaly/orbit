'use strict';
const path=require('node:path');
const {execFile,spawn}=require('node:child_process');
const PROFILES={balanced:['1920x1200','60','20000'],smooth:['1920x1200','120','35000'],sharp:['2560x1600','60','35000']};
class MoonlightAdapter{
 constructor({root,execute=execFile,spawnProcess=spawn}){
  this.exe=path.join(root,'moonlight','Moonlight.exe');this.cwd=path.dirname(this.exe);this.execute=execute;this.spawnProcess=spawnProcess;
  this.child=null;this.pairChild=null;
 }
 list(address){
  return new Promise((resolve,reject)=>{
   this.execute(this.exe,['list',address],{cwd:this.cwd,windowsHide:true,timeout:8000,maxBuffer:256*1024},(e,out)=>{
    if(e){const error=Error('Streaming trust is unavailable');error.code=e.code==='ENOENT'?'RUNTIME_MISSING':'UNPAIRED';return reject(error);}
    resolve(out.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^Qt |^Q[A-Za-z]|^Moonlight|^Using |^Detected /.test(s)));
   });
  });
 }
 beginPair(address,pin){
  if(this.pairChild)throw Error('A trust operation is already running');
  const child=this.spawnProcess(this.exe,['pair',address,'--pin',pin],{cwd:this.cwd,shell:false,windowsHide:true,stdio:'ignore'});
  this.pairChild=child;
  child.once('error',()=>{if(this.pairChild===child)this.pairChild=null;});
  child.once('exit',()=>{if(this.pairChild===child)this.pairChild=null;});
  return ()=>{if(this.pairChild===child){child.kill();this.pairChild=null;}};
 }
 start(address,target,profile,onExit){
  if(this.child)throw Error('A session is already running');
  if(!['Desktop','Steam Big Picture'].includes(target)||!PROFILES[profile])throw Error('Unsupported session');
  const [resolution,fps,bitrate]=PROFILES[profile];
  const child=this.spawnProcess(this.exe,['stream',address,target,'--resolution',resolution,'--fps',fps,'--bitrate',bitrate,
   '--display-mode','borderless','--audio-config','stereo','--no-quit-after'],
   {cwd:this.cwd,shell:false,windowsHide:false,stdio:'ignore'});
  this.child=child;
  let finished=false;
  const end=(code,error)=>{if(finished)return;finished=true;if(this.child===child)this.child=null;onExit({code,error});};
  child.once('error',()=>end(null,'Streaming runtime could not start'));child.once('exit',code=>end(code));
  return child;
 }
 stop(){this.child?.kill();}
 close(){this.child?.kill();this.pairChild?.kill();}
}
module.exports={MoonlightAdapter,PROFILES};
