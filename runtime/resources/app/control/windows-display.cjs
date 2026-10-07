'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
function runDisplay(input,execute=execFile){
 const payload=Buffer.from(JSON.stringify(input)).toString('base64');
 const source=fs.readFileSync(path.join(__dirname,'windows-display.ps1'),'utf8');
 const script="$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+payload+"'))|ConvertFrom-Json;$orbitAction=$p.action;$orbitWidth=$p.width;$orbitHeight=$p.height;$orbitHz=$p.hz;$orbitSnapshot=$p.native;\n"+source;
 return new Promise((resolve,reject)=>execute(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,shell:false,timeout:20000,maxBuffer:1024*1024},(error,out,stderr)=>{
  if(error)return reject(Error((stderr||'Windows display configuration failed').split(/\r?\n/)[0]));
  try{resolve(JSON.parse(out));}catch{reject(Error('Windows returned an invalid display configuration'));}
 }));
}
function chooseMode(profile,modes){
 const [width,height]=profile.resolution.split('x').map(Number),hz=profile.fps;
 const supported=modes.filter(m=>m.width>=1280&&m.height>=720&&m.hz>=50&&Math.abs(m.width/m.height-width/height)<0.19);
 const score=m=>Math.abs(m.width/m.height-width/height)*10000+Math.abs(m.width-width)+Math.abs(m.height-height)+Math.abs(m.hz-hz)*2;
 supported.sort((a,b)=>score(a)-score(b));
 if(!supported.length)throw Error('Zeiron has no supported display mode that fits the handheld');return supported[0];
}
class WindowsDisplay{
 constructor({run=runDisplay}={}){this.run=run;this.previous=null;}
 async snapshot(){const previous=await this.run({action:'snapshot'});if(!previous.native||!Array.isArray(previous.modes))throw Error('Display snapshot is unavailable');this.previous=previous;return {...previous,policy:'handheld-fit',changed:true};}
 async prepare(profile){if(!this.previous)throw Error('Snapshot the display before changing it');const mode=chooseMode(profile,this.previous.modes);return this.run({action:'apply',...mode});}
 async restore(previous){if(!previous?.changed)return;if(previous.policy!=='handheld-fit'||typeof previous.native!=='string')throw Error('Unsupported display restoration record');await this.run({action:'restore',native:previous.native});this.previous=null;}
}
module.exports={WindowsDisplay,runDisplay,chooseMode};
