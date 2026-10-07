'use strict';
const fs=require('node:fs'),https=require('node:https'),crypto=require('node:crypto');
const {CONTROL_PORT,fingerprint,isPrivate}=require('./transport.cjs');
const {session,publicSessions}=require('./model.cjs');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
class HostService{
 constructor({backend,registry,port=CONTROL_PORT,clock=Date.now}){
  this.backend=backend;this.registry=registry;this.port=port;this.clock=clock;
  this.server=null;this.invite=null;this.lease=null;this.fp=null;this.linkAttempts=new Map();
 }
 async start(){
  if(this.server)return;
  const paths=this.backend.paths(),cert=fs.readFileSync(paths.cert);
  this.fp=fingerprint(new crypto.X509Certificate(cert).raw);
  this.server=https.createServer({cert,key:fs.readFileSync(paths.key)},(req,res)=>this.handle(req,res));
  this.server.headersTimeout=5000;this.server.requestTimeout=10000;this.server.maxConnections=16;
  await new Promise((resolve,reject)=>{
   const server=this.server;server.once('error',e=>{this.server=null;reject(e);});
   server.listen(this.port,'0.0.0.0',resolve);
  });
 }
 async stop(){if(!this.server)return;const s=this.server;this.server=null;this.invite=null;this.lease=null;s.closeAllConnections();await new Promise(r=>s.close(r));}
 invitation(){
  if(!this.server||!this.backend.ready)throw Error('Start Orbit hosting first');
  this.invite={token:crypto.randomBytes(32).toString('base64url'),expires:this.clock()+300000};
  return {code:'orbit1.'+Buffer.from(JSON.stringify({id:this.registry.data.device.id,fp:this.fp,token:this.invite.token})).toString('base64url'),expires:this.invite.expires};
 }
 async body(req){
  if(req.headers['content-type']!=='application/json')throw Error('JSON required');
  let data='';for await(const chunk of req){data+=chunk;if(data.length>8192)throw Error('Request too large');}
  return JSON.parse(data);
 }
 observed(){
  if(!this.lease)return null;
  if(this.clock()-this.lease.heartbeat>45000){this.lease=null;return null;}
  try{
   const file=this.backend.paths().log,stat=fs.statSync(file);
   if(stat.size<this.lease.offset){this.lease.offset=0;this.lease.remainder='';}
   const length=Math.min(stat.size-this.lease.offset,1024*1024);
   if(length>0){
    const fd=fs.openSync(file,'r'),buf=Buffer.alloc(length);
    try{fs.readSync(fd,buf,0,length,this.lease.offset);}finally{fs.closeSync(fd);}
    this.lease.offset+=length;
    const rows=(this.lease.remainder+buf.toString()).split(/\r?\n/);this.lease.remainder=rows.pop();
    for(const line of rows){
     if(line.includes('CLIENT CONNECTED'))this.lease.state='STREAMING';
     if(line.includes('CLIENT DISCONNECTED'))this.lease.state='DISCONNECTED';
    }
   }
  }catch{}
  return {id:this.lease.id,intent:this.lease.intent,state:this.lease.state};
 }
 async status(){
  const s=await this.backend.status();
  return {version:1,id:this.registry.data.device.id,name:'Zeiron',online:s.running,
   sessions:publicSessions(s.apps.map(a=>a.name)),session:this.observed()};
 }
 async handle(req,res){
  const address=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  try{
   if(!isPrivate(address))return send(403,{error:'Local network only'});
   if(req.headers.origin)return send(403,{error:'Native Orbit clients only'});
   const endpoint=new URL(req.url,'https://localhost').pathname;
   if(endpoint==='/identity'&&req.method==='GET')return send(200,{version:1,id:this.registry.data.device.id,name:'Zeiron',role:'host'});
   if(endpoint==='/link'&&req.method==='POST'){
    const attempts=this.linkAttempts.get(address)||{count:0,start:this.clock()};
    if(this.clock()-attempts.start>60000){attempts.count=0;attempts.start=this.clock();}
    attempts.count++;this.linkAttempts.set(address,attempts);
    if(attempts.count>5)return send(429,{error:'Linking paused. Try again in a minute.'});
    const b=await this.body(req);
    if(!/^[a-f0-9-]{36}$/i.test(b.clientId||'')||!this.invite||this.clock()>this.invite.expires||!same(b.code,this.invite.token))return send(403,{error:'Linking code is invalid or expired'});
    if(this.lease)return send(409,{error:'End the current session before linking again'});
    const token=crypto.randomBytes(32).toString('base64url');
    this.registry.trustClient({id:b.clientId,token});this.invite=null;
    return send(200,{id:this.registry.data.device.id,token});
   }
   const client=this.registry.data.client;
   if(!client||!same(req.headers.authorization,'Bearer '+client.token))return send(401,{error:'Link this Legion Go in Orbit',code:'UNTRUSTED'});
   if(endpoint==='/status'&&req.method==='GET')return send(200,await this.status());
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
    await this.backend.pair({id:pending.id,pin:b.pin,name:'Legion Go'});
    return send(200,{paired:true});
   }
   if(endpoint==='/sessions/start'&&req.method==='POST'){
    const b=await this.body(req),intent=session(b.intent);
    const s=await this.backend.status();
    if(!s.running||!s.apps.some(a=>a.name===intent.target))return send(409,{error:'This session is not ready on Zeiron'});
    if(this.lease&&this.clock()-this.lease.heartbeat<45000){
     if(b.resumeId!==this.lease.id || intent.id!==this.lease.intent)return send(409,{error:'A session is already active'});
    }
    this.lease={id:crypto.randomUUID(),intent:intent.id,state:'CONNECTING',heartbeat:this.clock(),
     offset:fs.existsSync(this.backend.paths().log)?fs.statSync(this.backend.paths().log).size:0,remainder:''};
    return send(200,{id:this.lease.id,intent:intent.id,target:intent.target});
   }
   if(endpoint==='/sessions/heartbeat'&&req.method==='POST'){
    const b=await this.body(req);
    if(!this.lease||b.id!==this.lease.id)return send(409,{error:'Session expired'});
    this.lease.heartbeat=this.clock();return send(200,{session:this.observed()});
   }
   if(endpoint==='/sessions/end'&&req.method==='POST'){
    const b=await this.body(req);
    if(this.lease&&b.id!==this.lease.id)return send(409,{error:'Session identity mismatch'});
    this.lease=null;return send(200,{ended:true});
   }
   send(404,{error:'Unknown Orbit operation'});
  }catch{if(!res.headersSent)send(400,{error:'Orbit could not complete this operation'});}
 }
}
module.exports={HostService};
