'use strict';
const crypto=require('node:crypto');
const {Machine,session}=require('./model.cjs');
const transport=require('./transport.cjs');
const {enroll}=require('./devices.cjs');
const {Discovery}=require('./discovery.cjs');
class ClientCoordinator{
 constructor({registry,adapter,legacyHost='',profile='balanced',resolve=transport.resolve,request=transport.request,notify=()=>{},schedule=setTimeout,cancel=clearTimeout,discovery}){
  this.registry=registry;this.adapter=adapter;this.legacyHost=legacyHost;this.profile=profile;
  this.resolve=resolve;this.request=request;this.notify=notify;this.schedule=schedule;this.cancel=cancel;
  this.discovery=discovery||new Discovery({resolve,request});this.discovering=null;this.discoveryAbort=null;this.discovered=[];this.identity=null;this.selectedHost=null;this.pairing=null;this.pairAbort=null;
  this.hostInfo=null;this.hostOnline=false;this.libraryCache=null;this.libraryRequest=null;this.libraryAt=0;
  this.machine=new Machine(()=>this.emit());this.address=null;this.sessions=[];this.session=null;
  this.refreshing=null;this.pollTimer=null;this.retryTimer=null;this.retries=0;this.failures=0;
  this.userStopped=false;this.closed=false;this.generation=0;this.connectOperation=null;
 }
 emit(){this.notify(this.snapshot());}
 snapshot(){
  return {...this.machine.snapshot(),name:'Zeiron',reachable:!['UNKNOWN','DISCOVERING','OFFLINE'].includes(this.machine.state),
   trusted:Boolean(this.registry.data.host),paired:['READY','CONNECTING','STREAMING','RECONNECTING'].includes(this.machine.state),
   sessions:this.sessions.map(s=>({...s})),session:this.session?{id:this.session.id,intent:this.session.intent,game:this.session.game||null}:null,hostOnline:this.hostOnline,
   hostInfo:this.hostInfo,profile:this.profile,device:this.registry.view().device,hosts:this.discovered.map(h=>({...h})),pairing:this.pairing?{...this.pairing}:null};
 }
 async locate(){
  const record=this.registry.data.host;
  const candidates=[this.selectedHost?.address,record?.lastAddress,record?.hostname,'ZEIRON-CORE',this.legacyHost].filter(Boolean);
  let securityError=null;
  for(const candidate of [...new Set(candidates)]){
   try{
    const address=await this.resolve(candidate);
    const identity=await this.request({address,endpoint:'/identity',discovery:true});
    if(identity.version!==1||identity.role!=='host')continue;
    if(record&&identity.id!==record.id){securityError=Error('Zeiron identity changed. Link again on the PC.');continue;}
    if(record)await this.request({address,fp:record.fp,token:record.token,endpoint:'/status'});
    this.address=address;this.identity=identity;return identity;
   }catch(e){if(e.message.includes('identity changed')||e.code==='UNTRUSTED')securityError=e;}
  }
  if(securityError)throw securityError;
  throw Error('Zeiron is offline. Orbit will check again.');
 }
 async remote(endpoint,method='GET',body){
  const host=this.registry.data.host;
  if(!host)throw Error('Link Zeiron first');
  return this.request({address:this.address,fp:host.fp,token:host.token,endpoint,method,body,maxResponseBytes:endpoint.startsWith('/library')?16*1024*1024:65536,timeoutMs:endpoint.startsWith('/library')?30000:undefined,signal:this.pairAbort?.signal});
 }
 async refresh(){
  if(this.closed||this.session||this.discovering||this.machine.state==='PAIRING')return this.snapshot();
  if(this.refreshing)return this.refreshing;
  this.refreshing=this._refresh().finally(()=>{this.refreshing=null;});
  return this.refreshing;
 }
 async _refresh(){
  const wasReady=this.machine.state==='READY';
  const quiet=Boolean(this.address&&this.registry.data.host)&&(wasReady||(this.hostOnline&&['ERROR','UNPAIRED','TRUSTED'].includes(this.machine.state)));
  if(!quiet)this.machine.move('DISCOVERING');
  try{
   if(!quiet){await this.locate();this.machine.move('HOST_FOUND');}
   this.hostOnline=true;
   const host=this.registry.data.host;
   if(!host){this.machine.move('UNPAIRED','Discover Zeiron, select it, then enter the handheld’s code in Orbit Host.');return this.snapshot();}
   if(!quiet)this.machine.move('TRUSTED');
   const started=Date.now();const status=await this.remote('/status');
   this.hostInfo={system:status.system||null,streaming:status.streaming||null,controlRoundTripMs:Date.now()-started,receivedAt:new Date().toISOString()};
   if(!status.online){this.hostOnline=false;this.machine.move('OFFLINE','Open Orbit on Zeiron to bring it online.');return this.snapshot();}
   if(status.ready===false){this.machine.move('ERROR','Zeiron is online, but streaming is not ready. Check Orbit Host.');return this.snapshot();}
   try{
    if(!wasReady)await this.adapter.list(this.address);
   }catch(e){
    if(e.code==='RUNTIME_MISSING')throw Error('Orbit streaming component is missing. Run the reviewed setup.');
    this.machine.move('UNPAIRED','Orbit needs to restore streaming trust. Select Link Zeiron.');return this.snapshot();
   }
   this.sessions=status.sessions||[];
   if(!this.sessions.some(s=>s.id==='desktop'))throw Error('Desktop is not enabled on Zeiron');
   if(host.lastAddress!==this.address){host.lastAddress=this.address;this.registry.save();}
   if(this.machine.state==='UNPAIRED')this.machine.move('TRUSTED');
   this.machine.move('READY');return this.snapshot();
  }catch(e){
   const untrusted=e.code==='UNTRUSTED';
   const offline=/offline|did not respond|ECONN|ENET|EHOST|ETIMEDOUT/.test(e.message)||['ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH'].includes(e.code);
   if(untrusted||offline||e.message.includes('identity changed'))this.hostOnline=false;
   if(untrusted&&this.machine.state==='DISCOVERING')this.machine.move('HOST_FOUND');
   this.machine.move(untrusted?'UNPAIRED':offline?'OFFLINE':'ERROR',e.message);return this.snapshot();
  }
 }
 async discover(){
  if(this.closed||this.session||this.pairAbort||this.connectOperation)throw Error('End the current operation before discovering hosts');
  if(this.discovering)return this.discovering;
  if(this.refreshing)await this.refreshing;
  this.discoveryAbort=new AbortController();
  this.discovering=this._discover().finally(()=>{this.discovering=null;});return this.discovering;
 }
 async _discover(){
  this.discovered=[];this.machine.move('DISCOVERING');
  try{
   this.discovered=await this.discovery.find({registry:this.registry.data.host,legacyHost:this.legacyHost,signal:this.discoveryAbort.signal});
   if(this.closed)return this.snapshot();
   if(this.discovered.length){this.machine.move('HOST_FOUND');this.machine.move('UNPAIRED','Select Zeiron below to connect or link.');}
   else this.machine.move('OFFLINE','No Orbit host found. Open Orbit Host on Zeiron and check the home network.');
   return this.snapshot();
  }catch(e){if(!this.closed)this.machine.move('ERROR',e.message);throw e;}
 }
 async selectHost(id){
  if(this.session||this.pairAbort||this.connectOperation)throw Error('End the current operation before selecting a host');
  if(this.discovering)await this.discovering;if(this.refreshing)await this.refreshing;
  const host=this.discovered.find(h=>h.id===id);if(!host)throw Error('Select a discovered Zeiron host');
  this.machine.move('DISCOVERING');
  try{
   const identity=await this.request({address:host.address,endpoint:'/identity',discovery:true});
   if(identity.id!==id||identity.name!=='Zeiron'||identity.role!=='host')throw Error('The discovered host changed. Discover again.');
   this.selectedHost={id,address:host.address};this.address=host.address;this.identity=identity;
   this.machine.move('HOST_FOUND');
   if(this.registry.data.host?.id===id){this.machine.move('TRUSTED');return this.refresh();}
   this.machine.move('UNPAIRED');return this.snapshot();
  }catch(e){this.machine.move('ERROR',e.message);throw e;}
 }
 cancelLink(){this.pairAbort?.abort();return {cancelled:true};}
 async link(){
  if(this.session||this.refreshing||this.pairAbort||this.machine.state==='PAIRING'||this.connectOperation)throw Error('Wait for the current operation to finish');
  if(!this.address)await this.refresh();
  if(!this.address||!this.identity)throw Error('Discover and select Zeiron first');
  if(this.identity.pairingFlow!=='client-code-v3')throw Error('Update Orbit Host on Zeiron for handheld-code pairing');
  this.pairAbort=new AbortController();
  this.machine.move('PAIRING');
  let stopPair=()=>{};
  try{
   const value=await enroll({clientId:this.registry.data.device.id,address:this.address,expectedId:this.identity.id,
    request:this.request,signal:this.pairAbort.signal,onCode:pairing=>{if(!this.closed&&!this.pairAbort.signal.aborted){this.pairing=pairing;this.emit();}}});
   if(this.closed||this.pairAbort.signal.aborted)throw Object.assign(Error('Linking cancelled'),{name:'AbortError'});
   this.registry.trustHost({id:value.id,fp:value.fp,token:value.token,hostname:'ZEIRON-CORE',lastAddress:this.address});
   try{await this.adapter.list(this.address);}
   catch{
    let pin;do{pin=String(crypto.randomInt(0,10000)).padStart(4,'0');}while(pin===this.pairing?.code);
    stopPair=this.adapter.beginPair(this.address,pin);
    await this.remote('/pair-stream','POST',{pin});
    let paired=false;
    for(let attempt=0;attempt<10;attempt++){
     try{await this.adapter.list(this.address);paired=true;break;}catch{}
     await new Promise(r=>this.schedule(r,500));
    }
    if(!paired)throw Error('Streaming trust was not confirmed. Retry linking.');
   }
   if(this.closed||this.pairAbort.signal.aborted)throw Object.assign(Error('Linking cancelled'),{name:'AbortError'});
   this.machine.move('TRUSTED');
  }catch(e){if(!this.closed)this.machine.move(e.name==='AbortError'?'UNPAIRED':'ERROR',e.message);throw e;}
  finally{stopPair();this.pairing=null;this.pairAbort=null;if(!this.closed)this.emit();}
  return this.refresh();
 }
 async library({force=false}={}){
  if(this.libraryRequest)return this.libraryRequest;
  if(!force&&this.libraryCache&&Date.now()-this.libraryAt<30000)return this.libraryCache;
  if(!this.address)await this.refresh();
  this.libraryRequest=this.remote(force?'/library?refresh=1':'/library').then(value=>{
   if(value.version!==1||!Array.isArray(value.games)||value.games.length>500)throw Error('Unsupported Zeiron game library');
   this.libraryCache=value;this.libraryAt=Date.now();return value;
  }).catch(e=>{if(e.status===404)throw Error('Update Orbit Host on Zeiron to browse games');throw e;}).finally(()=>{this.libraryRequest=null;});
  return this.libraryRequest;
 }
 async gameDetails(gameId){
  if(typeof gameId!=='string'||!/^(?:steam:\d{1,12}|(?:xbox|local):[a-f0-9]{64})$/.test(gameId))throw Error('Choose a game from Zeiron’s library');
  return this.remote('/library/game?id='+encodeURIComponent(gameId));
 }
 async play(gameId){
  if(typeof gameId!=='string'||!/^(?:steam:\d{1,12}|(?:xbox|local):[a-f0-9]{64})$/.test(gameId))throw Error('Choose a game from Zeiron’s library');
  return this.connect('desktop',gameId);
 }
 async connect(intent='desktop',gameId){
  if(this.connectOperation)throw Error('A connection request is already active');
  this.connectOperation=this._connect(intent,gameId).finally(()=>{this.connectOperation=null;});
  return this.connectOperation;
 }
 async _connect(intent,gameId){
  const generation=this.generation;
  session(intent);
  if(this.refreshing)await this.refreshing;
  if(this.session)throw Error('A session is already active');
  await this.refresh();
  if(this.closed||generation!==this.generation)throw Error('Connection cancelled');
  if(this.machine.state!=='READY')throw Error(this.machine.reason||'Zeiron is not ready');
  this.userStopped=false;this.retries=0;this.failures=0;
  this.session={id:null,intent,...(gameId?{gameId}: {})};this.machine.move('CONNECTING');
  try{await this.launch();}
  catch(e){
   const current=this.session;this.session=null;++this.generation;
   this.cancel(this.pollTimer);this.adapter.stop();
   if(current?.id){try{await this.remote('/sessions/end','POST',{id:current.id});}catch{}}
   this.machine.move('ERROR',e.message);throw e;
  }
  return this.snapshot();
 }
 async launch(){
  const active=this.session,generation=++this.generation;
  const lease=await this.remote('/sessions/start','POST',{intent:active.intent,resumeId:active.id,profile:this.profile,...(active.gameId?{gameId:active.gameId}: {})});
  if(this.closed||this.session!==active){try{await this.remote('/sessions/end','POST',{id:lease.id});}catch{}return;}
  active.id=lease.id;active.game=lease.game||null;active.started=Date.now();
  this.adapter.start(this.address,lease.target,lease.profile||this.profile,event=>this.exited(event,generation));
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
    if(!reply.session&&this.session.gameId){await this.disconnect(false);return;}
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
    const status=await this.remote('/status');if(!status.online||status.ready===false)throw Error('Zeiron streaming is not ready');
    if(this.closed||this.userStopped||this.session!==expectedSession||this.generation!==expectedGeneration)return;
    this.machine.move('CONNECTING');await this.launch();
   }catch(e){
    this.exited({code:1},this.generation);
   }
  },delay);
 }
 async disconnect(closeGame=true){
  const owned=this.session;
  if(closeGame&&owned?.gameId&&owned.id)await this.remote('/sessions/end','POST',{id:owned.id,closeGame:true});
  this.userStopped=true;this.cancel(this.retryTimer);this.cancel(this.pollTimer);
  const current=this.session;
  this.session=null;++this.generation;
  this.adapter.stop();
  if(current?.id){try{await this.remote('/sessions/end','POST',{id:current.id});}catch{}}
  if(['CONNECTING','STREAMING','RECONNECTING'].includes(this.machine.state))this.machine.move('READY');
  return this.snapshot();
 }
 close(){this.discoveryAbort?.abort();this.pairAbort?.abort();this.closed=true;this.userStopped=true;++this.generation;this.cancel(this.pollTimer);this.cancel(this.retryTimer);this.adapter.close();}
}
module.exports={ClientCoordinator};
