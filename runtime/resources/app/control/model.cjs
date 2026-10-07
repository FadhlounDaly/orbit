'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const STATES=Object.freeze(['UNKNOWN','DISCOVERING','HOST_FOUND','UNPAIRED','PAIRING','TRUSTED','READY','CONNECTING','STREAMING','RECONNECTING','OFFLINE','ERROR']);
const EDGES={
 UNKNOWN:['DISCOVERING'], DISCOVERING:['HOST_FOUND','OFFLINE','ERROR'],
 HOST_FOUND:['UNPAIRED','TRUSTED','OFFLINE','ERROR'], UNPAIRED:['PAIRING','DISCOVERING','OFFLINE','ERROR'],
 PAIRING:['TRUSTED','UNPAIRED','ERROR','OFFLINE'],TRUSTED:['READY','UNPAIRED','OFFLINE','ERROR','DISCOVERING'],
 READY:['CONNECTING','DISCOVERING','UNPAIRED','OFFLINE','ERROR'],
 CONNECTING:['STREAMING','RECONNECTING','READY','ERROR','OFFLINE'],
 STREAMING:['READY','RECONNECTING','OFFLINE','ERROR'],
 RECONNECTING:['CONNECTING','READY','OFFLINE','ERROR'],
 OFFLINE:['DISCOVERING','RECONNECTING','ERROR'],ERROR:['DISCOVERING','PAIRING','READY','OFFLINE','RECONNECTING']
};
class Machine {
 constructor(notify=()=>{}){this.state='UNKNOWN';this.reason='';this.notify=notify;}
 move(state,reason=''){
  if(state===this.state&&reason===this.reason)return this.snapshot();
  if(state!==this.state && !EDGES[this.state]?.includes(state))throw Error('Invalid connection transition '+this.state+' → '+state);
  this.state=state;this.reason=reason;this.notify(this.snapshot());return this.snapshot();
 }
 snapshot(){return {state:this.state,reason:this.reason};}
}
const SESSIONS=Object.freeze([
 Object.freeze({id:'desktop',name:'Desktop',target:'Desktop'}),
 Object.freeze({id:'steam',name:'Steam Big Picture',target:'Steam Big Picture'})
]);
function session(id){const s=SESSIONS.find(s=>s.id===id);if(!s)throw Error('Unknown Orbit session');return s;}
function publicSessions(names){return SESSIONS.filter(s=>names.includes(s.target)).map(({id,name})=>({id,name}));}
class Registry {
 constructor(file,role,vault){
  this.file=file;this.role=role;this.vault=vault;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  this.data={version:1,device:{id:crypto.randomUUID(),name:role==='host'?'Zeiron':'Legion Go',role},host:null,client:null};
  if(fs.existsSync(file)){
   if(!vault.isEncryptionAvailable())throw Error('Protected device storage unavailable');
   this.data=JSON.parse(vault.decryptString(fs.readFileSync(file)));
   if(this.data.version!==1 || this.data.device.role!==role)throw Error('Unsupported device registry');
  }else this.save();
 }
 save(){
  if(!this.vault.isEncryptionAvailable())throw Error('Protected device storage unavailable');
  const temp=this.file+'.tmp';
  fs.writeFileSync(temp,this.vault.encryptString(JSON.stringify(this.data)),{mode:0o600});
  fs.renameSync(temp,this.file);
 }
 trustHost(record){this.data.host={...record,name:'Zeiron',role:'host',backend:'sunshine',preferred:true,trusted:true};this.save();}
 trustClient(record){this.data.client={...record,name:'Legion Go',role:'client',trusted:true};this.save();}
 view(){return {device:{...this.data.device},host:this.data.host?{id:this.data.host.id,name:'Zeiron',trusted:true,preferred:true}:null};}
}
module.exports={Machine,Registry,STATES,SESSIONS,session,publicSessions};
