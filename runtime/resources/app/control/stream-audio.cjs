'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
class StreamAudio{
 constructor({adapter,execute=execFile,platform=process.platform}){Object.assign(this,{adapter,execute,platform});this.tail=Promise.resolve();}
 read(){return this.run(-1);}
 set(percent){if(!Number.isInteger(percent)||percent<0||percent>100)return Promise.reject(Error('Choose a volume from 0 to 100'));return this.run(percent);}
 run(level){const child=this.adapter.child;const job=this.tail.then(()=>{
  if(this.platform!=='win32'||!child?.pid||child.killed||this.adapter.child!==child)return {available:false,reason:'Stream audio is unavailable'};
  if(!Number.isSafeInteger(child.pid)||child.pid<=0)throw Error('Invalid stream process');
  const script=`$OrbitAudioPid=${child.pid};$OrbitAudioLevel=${level};$OrbitAudioExe='${this.adapter.exe.replaceAll("'","''")}';\n`+fs.readFileSync(path.join(__dirname,'stream-audio.ps1'),'utf8');
  return new Promise((resolve,reject)=>this.execute(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,maxBuffer:65536},(e,out)=>{if(e)return reject(Error('Stream volume is unavailable on this audio device'));try{const value=JSON.parse(out);if(value.available&&(!Number.isFinite(value.percent)||value.percent<0||value.percent>100))throw Error();resolve(value);}catch{reject(Error('Invalid stream volume response'));}}));
 });this.tail=job.catch(()=>{});return job;}
}
module.exports={StreamAudio};
