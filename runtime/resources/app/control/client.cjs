'use strict';
const crypto=require('node:crypto');
const {Machine,session}=require('./model.cjs');
const transport=require('./transport.cjs');
class ClientCoordinator{
 constructor({registry,adapter,legacyHost='',profile='balanced',resolve=transport.resolve,request=transport.request,notify=()=>{},schedule=setTimeout,cancel=clearTimeout}){
  this.registry=registry;this.adapter=adapter;this.legacyHost=legacyHost;this.profile=profile;
  this.resolve=resolve;this.request=request;this.notify=notify;this.schedule=schedule;this.cancel=cancel;
  this.machine=new Machine(()=>this.emit());this.address=null;this.sessions=[];this.session=null;
  this.refreshing=null;this.pollTimer=null;this.retryTimer=null;this.retries=0;this.failures=0;
  this.userStopped=false;this.closed=false;this.generation=0;this.connectOperation=null;
 }
 emit(){this.notify(this.snapshot());}
 snapshot(){
  return {...this.machine.snapshot(),name:'Zeiron',reachable:!['UNKNOWN','DISCOVERING','OFFLINE'].includes(this.machine.state),
   trusted:Boolean(this.registry.data.host),paired:['READY','CONNECTING','STREAMING','RECONNECTING'].includes(this.machine.state),
   sessions:this.sessions.map(s=>({...s})),session:this.session?{id:this.session.id,intent:this.session.intent}:null,
   profile:this.profile,device:this.registry.view().device};
 }
 async locate(){
  const record=this.registry.data.host;
  const candidates=[record?.lastAddress,record?.hostname,'ZEIRON-CORE',this.legacyHost].filter(Boolean);
  let securityError=null;
  for(const candidate of [...new Set(candidates)]){
   try{
    const address=await this.resolve(candidate);
    const identity=await this.request({address,endpoint:'/identity',discovery:true});
    if(identity.version!==1||identity.role!=='host')continue;
    if(record&&identity.id!==record.id){securityError=Error('Zeiron identity changed. Link again on the PC.');continue;}
    if(record)await this.request({address,fp:record.fp,token:record.token,endpoint:'/status'});
    this.address=address;return identity;
   }catch(e){if(e.message.includes('identity changed')||e.code==='UNTRUSTED')securityError=e;}
  }
  if(securityError)throw securityError;
  throw Error('Zeiron is offline. Orbit will check again.');
 }
 async remote(endpoint,method='GET',body){
  const host=this.registry.data.host;
  if(!host)throw Error('Link Zeiron first');
  return this.request({address:this.address,fp:host.fp,token:host.token,endpoint,method,body});
 }
 async refresh(){
  if(this.closed||this.session||this.machine.state==='PAIRING')return this.snapshot();
  if(this.refreshing)return this.refreshing;
  this.refreshing=this._refresh().finally(()=>{this.refreshing=null;});
  return this.refreshing;
 }
 async _refresh(){
  this.machine.move('DISCOVERING');
  try{
   await this.locate();this.machine.move('HOST_FOUND');
   const host=this.registry.data.host;
   if(!host){this.machine.move('UNPAIRED','Link Legion Go using the code shown in Orbit on Zeiron.');return this.snapshot();}
   this.machine.move('TRUSTED');
   const status=await this.remote('/status');
   if(!status.online){this.machine.move('OFFLINE','Open Orbit on Zeiron to bring it online.');return this.snapshot();}
   try{
    await this.adapter.list(this.address);
   }catch(e){
    if(e.code==='RUNTIME_MISSING')throw Error('Orbit streaming component is missing. Run the reviewed setup.');
    this.machine.move('UNPAIRED','Orbit needs to restore streaming trust. Select Link Zeiron.');return this.snapshot();
   }
   this.sessions=status.sessions;
   if(!this.sessions.some(s=>s.id==='desktop'))throw Error('Desktop is not enabled on Zeiron');
   if(host.lastAddress!==this.address){host.lastAddress=this.address;this.registry.save();}
   this.machine.move('READY');return this.snapshot();
  }catch(e){
   const untrusted=e.code==='UNTRUSTED';
   const offline=/offline|did not respond|ECONN|ENET|EHOST|ETIMEDOUT/.test(e.message)||['ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH'].includes(e.code);
   if(untrusted&&this.machine.state==='DISCOVERING')this.machine.move('HOST_FOUND');
   this.machine.move(untrusted?'UNPAIRED':offline?'OFFLINE':'ERROR',e.message);return this.snapshot();
  }
 }
 async link(code){
  if(this.session||this.refreshing||this.machine.state==='PAIRING'||this.connectOperation)throw Error('Wait for the current operation to finish');
  const invitation=transport.decodeInvitation(code);
  if(!this.address)await this.refresh();
  if(!this.address)throw Error('Zeiron is offline');
  this.machine.move('PAIRING');
  let stopPair=()=>{};
  try{
   const value=await this.request({address:this.address,fp:invitation.fp,token:null,endpoint:'/link',method:'POST',
    body:{clientId:this.registry.data.device.id,code:invitation.token}});
   if(value.id!==invitation.id)throw Error('Zeiron identity does not match its linking code');
   this.registry.trustHost({id:value.id,fp:invitation.fp,token:value.token,hostname:'ZEIRON-CORE',lastAddress:this.address});
   try{await this.adapter.list(this.address);}
   catch{
    const pin=String(crypto.randomInt(0,10000)).padStart(4,'0');
    stopPair=this.adapter.beginPair(this.address,pin);
    await this.remote('/pair-stream','POST',{pin});
    let paired=false;
    for(let attempt=0;attempt<10;attempt++){
     try{await this.adapter.list(this.address);paired=true;break;}catch{}
     await new Promise(r=>this.schedule(r,500));
    }
    if(!paired)throw Error('Streaming trust was not confirmed. Retry linking.');
   }
   this.machine.move('TRUSTED');
  }catch(e){this.machine.move('ERROR',e.message);throw e;}
  finally{stopPair();}
  return this.refresh();
 }
 async connect(intent='desktop'){
  if(this.connectOperation)throw Error('A connection request is already active');
  this.connectOperation=this._connect(intent).finally(()=>{this.connectOperation=null;});
  return this.connectOperation;
 }
 async _connect(intent){
  const generation=this.generation;
  session(intent);
  if(this.refreshing)await this.refreshing;
  if(this.session)throw Error('A session is already active');
  await this.refresh();
  if(this.closed||generation!==this.generation)throw Error('Connection cancelled');
  if(this.machine.state!=='READY')throw Error(this.machine.reason||'Zeiron is not ready');
  this.userStopped=false;this.retries=0;this.failures=0;
  this.session={id:null,intent};this.machine.move('CONNECTING');
  try{await this.launch();}
  catch(e){this.session=null;this.machine.move('ERROR',e.message);throw e;}
  return this.snapshot();
 }
 async launch(){
  const active=this.session,generation=++this.generation;
  const lease=await this.remote('/sessions/start','POST',{intent:active.intent,resumeId:active.id});
  if(this.closed||this.session!==active){try{await this.remote('/sessions/end','POST',{id:lease.id});}catch{}return;}
  active.id=lease.id;active.started=Date.now();
  this.adapter.start(this.address,lease.target,this.profile,event=>this.exited(event,generation));
  this.monitor(generation);
 }
 monitor(generation){
  this.cancel(this.pollTimer);
  this.pollTimer=this.schedule(async()=>{
   if(this.closed||generation!==this.generation||!this.session)return;
   try{
    const reply=await this.remote('/sessions/heartbeat','POST',{id:this.session.id});
    if(generation!==this.generation||!this.session)return;
    this.failures=0;
    if(reply.session?.state==='STREAMING'&&this.machine.state==='CONNECTING')this.machine.move('STREAMING');
    if(reply.session?.state==='DISCONNECTED'){
     this.adapter.stop();return;
    }
    if(this.machine.state==='CONNECTING'&&Date.now()-this.session.started>30000){this.adapter.stop();return;}
   }catch(e){
    if(generation!==this.generation||!this.session)return;
    if(e.message.includes('identity changed')||e.code==='UNTRUSTED'){
     this.userStopped=true;this.adapter.stop();this.machine.move('ERROR',e.message);return;
    }
    if(++this.failures>=3){this.adapter.stop();return;}
   }
   this.monitor(generation);
  },1500);
 }
 async exited(event,generation){
  if(generation!==this.generation||!this.session||this.closed)return;
  this.cancel(this.pollTimer);
  if(this.userStopped||event.code===0){
   const current=this.session;this.session=null;++this.generation;
   try{await this.remote('/sessions/end','POST',{id:current.id});}catch{}
   if(this.machine.state!=='ERROR')this.machine.move('READY');
   this.emit();return;
  }
  if(this.retries>=3){
   const current=this.session;this.session=null;++this.generation;
   try{await this.remote('/sessions/end','POST',{id:current.id});}catch{}
   this.machine.move('ERROR','Connection ended. Select Connect to try again.');return;
  }
  this.machine.move('RECONNECTING','Reconnecting to Zeiron…');
  const delay=[1000,3000,8000][this.retries++];
  const expectedGeneration=this.generation,expectedSession=this.session;
  this.retryTimer=this.schedule(async()=>{
   if(this.closed||this.userStopped||this.session!==expectedSession||this.generation!==expectedGeneration)return;
   try{
    await this.locate();
    if(this.closed||this.userStopped||this.session!==expectedSession||this.generation!==expectedGeneration)return;
    const status=await this.remote('/status');if(!status.online)throw Error('Zeiron is offline');
    if(this.closed||this.userStopped||this.session!==expectedSession||this.generation!==expectedGeneration)return;
    this.machine.move('CONNECTING');await this.launch();
   }catch(e){
    this.exited({code:1},this.generation);
   }
  },delay);
 }
 async disconnect(){
  this.userStopped=true;this.cancel(this.retryTimer);this.cancel(this.pollTimer);
  const current=this.session;
  this.session=null;++this.generation;
  this.adapter.stop();
  if(current?.id){try{await this.remote('/sessions/end','POST',{id:current.id});}catch{}}
  if(['CONNECTING','STREAMING','RECONNECTING'].includes(this.machine.state))this.machine.move('READY');
  return this.snapshot();
 }
 close(){this.closed=true;this.userStopped=true;++this.generation;this.cancel(this.pollTimer);this.cancel(this.retryTimer);this.adapter.close();}
}
module.exports={ClientCoordinator};
