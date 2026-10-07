'use strict';
const fs=require('node:fs'),https=require('node:https'),crypto=require('node:crypto');
const {CONTROL_PORT,fingerprint,isPrivate}=require('./transport.cjs');
const {publicSessions}=require('./model.cjs');
const {DeviceManager}=require('./devices.cjs');
const {SessionManager}=require('./host-sessions.cjs');
const {SystemObserver}=require('./system-observer.cjs');
const {GameLibrary,GameLaunchManager}=require('./game-library.cjs');
class HostService{
 constructor({backend,registry,port=CONTROL_PORT,clock=Date.now,journal=null,display,graphics,library=new GameLibrary(),launcher=new GameLaunchManager()}){
  this.backend=backend;this.registry=registry;this.port=port;this.clock=clock;
  this.server=null;this.fp=null;this.timer=null;this.expiring=false;
  this.devices=new DeviceManager({registry,clock});
  this.library=library;this.sessions=new SessionManager({backend,clock,journal,display,graphics,library,launcher});this.system=new SystemObserver();
 }
 async start(){
  if(this.server)return;
  await this.sessions.recover();
  const paths=this.backend.paths(),cert=fs.readFileSync(paths.cert);
  this.fp=fingerprint(new crypto.X509Certificate(cert).raw);
  this.server=https.createServer({cert,key:fs.readFileSync(paths.key)},(req,res)=>this.handle(req,res));
  this.server.headersTimeout=5000;this.server.requestTimeout=10000;this.server.maxConnections=16;
  await new Promise((resolve,reject)=>{
   const server=this.server;server.once('error',e=>{this.server=null;reject(e);});
   server.listen(this.port,'0.0.0.0',resolve);
  });
  this.timer=setInterval(async()=>{
   if(this.expiring)return;this.expiring=true;
   try{this.devices.prune();await this.sessions.status();}catch{}finally{this.expiring=false;}
  },5000);this.timer.unref();
 }
 async stop(){
  clearInterval(this.timer);this.timer=null;this.devices.cancel();
  if(this.server){const s=this.server;this.server=null;s.closeAllConnections();await new Promise(r=>s.close(r));}
  await this.sessions.shutdown();
 }
 approvePairing(input){
  if(!this.server)throw Error('Open Orbit Host first');
  if(this.sessions.active())throw Error('End the current session before linking again');
  return this.devices.approve(input);
 }
 revoke(id){
  if(this.sessions.active())throw Error('End the current session before removing trust');
  this.devices.revoke(id);
 }
 async body(req){
  if(req.headers['content-type']!=='application/json')throw Error('JSON required');
  let data='';for await(const chunk of req){data+=chunk;if(data.length>8192)throw Error('Request too large');}
  return JSON.parse(data);
 }
 async status(){
  const s=await this.backend.status();
  return {version:1,id:this.registry.data.device.id,name:'Zeiron',online:true,ready:s.running&&s.healthy!==false,
   sessions:publicSessions(s.apps.map(a=>a.name)),...await this.sessions.status(),
   system:this.system.snapshot(),streaming:{installed:s.installed,running:s.running,healthy:s.healthy===true}};
 }
 async handle(req,res){
  const address=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  try{
   if(!isPrivate(address))return send(403,{error:'Local network only'});
   if(req.headers.origin)return send(403,{error:'Native Orbit clients only'});
   const url=new URL(req.url,'https://localhost'),endpoint=url.pathname;
   if(endpoint==='/identity'&&req.method==='GET')return send(200,{version:1,id:this.registry.data.device.id,name:'Zeiron',role:'host',pairingFlow:'client-code-v3'});
   if(endpoint.startsWith('/enrollment/')&&req.method==='POST'){
    if(this.sessions.active())return send(409,{error:'End the current session before linking again'});
    const b=await this.body(req);
    if(this.sessions.active())return send(409,{error:'End the current session before linking again'});
    if(endpoint==='/enrollment/request')return send(200,this.devices.request(b,address));
    if(endpoint==='/enrollment/poll')return send(200,this.devices.poll(b,address));
    if(endpoint==='/enrollment/cancel')return send(200,this.devices.cancelRequest(b,address));
    if(endpoint==='/enrollment/finish')return send(200,this.devices.finish(b,this.fp,address));
    return send(404,{error:'Unknown Orbit operation'});
   }
   const client=this.devices.authenticate(req.headers.authorization);
   if(!client)return send(401,{error:'Link this Legion Go in Orbit',code:'UNTRUSTED'});
   this.devices.seen();
   if(endpoint==='/status'&&req.method==='GET')return send(200,await this.status());
   if(endpoint==='/library/game'&&req.method==='GET')return send(200,await this.library.details(url.searchParams.get('id')));
   if(endpoint==='/library'&&req.method==='GET')return send(200,await this.library.list({force:url.searchParams.get('refresh')==='1'}));
   if(endpoint==='/pair-stream'&&req.method==='POST'){
    const b=await this.body(req);
    if(!/^\d{4}$/.test(b.pin||''))return send(400,{error:'Invalid pairing request'});
    let pending;
    for(let i=0;i<25;i++){
     pending=(await this.backend.api('/api/pin')).pairings?.find(p=>p.address.replace(/^::ffff:/,'')===address);
     if(pending)break;
     await new Promise(r=>setTimeout(r,400));
    }
    if(!pending)return send(409,{error:'Streaming trust request did not arrive. Try linking again.'});
    if(this.devices.authenticate(req.headers.authorization)!==client)return send(401,{error:'Device trust was removed',code:'UNTRUSTED'});
    await this.backend.pair({id:pending.id,pin:b.pin,name:'Legion Go'});
    return send(200,{paired:true});
   }
   if(endpoint==='/sessions/start'&&req.method==='POST')return send(200,await this.sessions.start(await this.body(req),client.id,()=>this.devices.authenticate(req.headers.authorization)===client));
   if(endpoint==='/sessions/heartbeat'&&req.method==='POST'){
    const b=await this.body(req);return send(200,{session:await this.sessions.heartbeat(b.id,client.id),hostSession:this.sessions.snapshot()});
   }
   if(endpoint==='/sessions/end'&&req.method==='POST'){
    const b=await this.body(req);return send(200,await this.sessions.end(b.id,client.id));
   }
   if(endpoint==='/sessions/state'&&req.method==='GET')return send(200,await this.sessions.status());
   send(404,{error:'Unknown Orbit operation'});
  }catch(error){if(!res.headersSent)send(error.status||400,{error:error.status?error.message:'Orbit could not complete this operation',...(error.status===401?{code:'UNTRUSTED'}:{})});}
 }
}
module.exports={HostService};
