'use strict';
const crypto = require('node:crypto');
const {SRP, SrpServer, SrpClient} = require('../vendor/fast-srp-hap');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const params = SRP.params.hap;
function bytes(value, length) {
  if (typeof value !== 'string' || !new RegExp('^[a-f0-9]{'+length*2+'}$','i').test(value)) throw Error('Invalid enrollment message');
  return Buffer.from(value, 'hex');
}
function key(shared, challenge) {
  return Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from(challenge), Buffer.from('Orbit enrollment v3'), 32));
}
function seal(shared, challenge, value) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key(shared,challenge),iv);
  cipher.setAAD(Buffer.from(challenge));
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv:iv.toString('hex'),data:data.toString('hex'),tag:cipher.getAuthTag().toString('hex')};
}
function open(shared, challenge, value) {
  if (!value || typeof value.data!=='string' || value.data.length>4096 || !/^[a-f0-9]+$/i.test(value.data)) throw Error('Invalid enrollment response');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(shared,challenge),bytes(value.iv,12));
  decipher.setAAD(Buffer.from(challenge));decipher.setAuthTag(bytes(value.tag,16));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'hex')),decipher.final()]).toString());
}
class DeviceManager {
  constructor({registry,clock=Date.now}) {
    this.registry=registry;this.clock=clock;this.pending=null;
    this.window={at:clock(),count:0};
  }
  prune(){if(this.pending&&this.clock()>=this.pending.expires)this.pending=null;}
  cancel(){this.pending=null;}
  request({clientId},address){
    const now=this.clock();this.prune();
    if(now-this.window.at>=60000)this.window={at:now,count:0};
    if(++this.window.count>3)throw Object.assign(Error('Linking paused. Try again in a minute.'),{status:429});
    if(!UUID.test(clientId||''))throw Error('Invalid client identity');
    if(this.pending)throw Object.assign(Error('A linking request is already pending on Zeiron'),{status:409});
    this.pending={challenge:crypto.randomUUID(),clientId,address,expires:now+120000,state:'WAITING'};
    return {version:3,challenge:this.pending.challenge,expires:this.pending.expires};
  }
  requests(){
    this.prune();const p=this.pending;
    return p?[{challenge:p.challenge,name:'Legion Go',address:p.address,expires:p.expires,state:p.state}]:[];
  }
  approve({challenge,code}){
    this.prune();const p=this.pending;
    if(!p||p.challenge!==challenge||p.state!=='WAITING')throw Error('This linking request is no longer waiting');
    if(typeof code!=='string'||!/^\d{4}$/.test(code))throw Error('Enter the four-digit code shown on the Legion Go');
    const salt=crypto.randomBytes(32);
    p.server=new SrpServer(params,salt,Buffer.from(p.clientId),Buffer.from(code),crypto.randomBytes(32));
    p.salt=salt.toString('hex');p.state='APPROVED';p.expires=Math.min(p.expires,this.clock()+30000);
    return {approved:true};
  }
  get(challenge,address){
    this.prune();const p=this.pending;
    if(!p||p.challenge!==challenge||p.address!==address)throw Object.assign(Error('Linking request expired or was cancelled'),{status:410});
    return p;
  }
  poll({challenge},address){
    const p=this.get(challenge,address);
    return {version:3,challenge:p.challenge,expires:p.expires,state:p.state,
      ...(p.state==='APPROVED'?{salt:p.salt,B:p.server.computeB().toString('hex')}:{})};
  }
  cancelRequest({challenge},address){this.get(challenge,address);this.cancel();return {cancelled:true};}
  finish({challenge,A,M1},fp,address){
    const p=this.get(challenge,address);
    if(p.state!=='APPROVED')throw Object.assign(Error('Enter the code in Orbit Host first'),{status:409});
    // A local code entry permits exactly one proof attempt. Failure consumes the request.
    this.cancel();
    try{p.server.setA(bytes(A,384));p.server.checkM1(bytes(M1,64));}
    catch{throw Object.assign(Error('The codes did not match. Start linking again on the Legion Go.'),{status:403});}
    const token=crypto.randomBytes(32).toString('base64url');
    const payload=seal(p.server.computeK(),challenge,{id:this.registry.data.device.id,clientId:p.clientId,fp,token});
    this.registry.trustClient({id:p.clientId,token,createdAt:new Date(this.clock()).toISOString(),lastSeenAt:null,
      type:'handheld',credential:{kind:'bearer-256',issuedAt:new Date(this.clock()).toISOString()}});
    return {M2:p.server.computeM2().toString('hex'),payload};
  }
  authenticate(header) {
    const c=this.registry.data.client;
    if(!c || typeof header!=='string')return null;
    const expected=Buffer.from('Bearer '+c.token),actual=Buffer.from(header);
    return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected)?c:null;
  }
  list() {
    const c=this.registry.data.client;
    return c?[{id:c.id,name:c.name,type:c.type||'handheld',trusted:true,createdAt:c.createdAt||null,
      lastSeenAt:c.lastSeenAt||null,credential:c.credential||{kind:'bearer-256'}}]:[];
  }
  seen() {
    const c=this.registry.data.client;if(!c)return;
    if(!c.lastSeenAt || this.clock()-Date.parse(c.lastSeenAt)>=60000){c.lastSeenAt=new Date(this.clock()).toISOString();this.registry.save();}
  }
  revoke(id) {
    if(this.registry.data.client?.id!==id)throw Error('Unknown trusted device');
    this.registry.data.client=null;this.registry.save();this.cancel();
  }
}
function delay(ms,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);reject(Object.assign(Error('Linking cancelled'),{name:'AbortError'}));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 });
}
async function enroll({clientId,address,expectedId,request,onCode=()=>{},signal,wait=delay,clock=Date.now}) {
  const code=String(crypto.randomInt(10000)).padStart(4,'0');
  const call=(endpoint,body)=>request({address,endpoint,method:'POST',body,discovery:true,timeoutMs:5000,signal});
  const first=await call('/enrollment/request',{clientId});
  if(first.version!==3||!UUID.test(first.challenge||'')||!Number.isFinite(first.expires))throw Error('Update Orbit Host on Zeiron before linking');
  const deadline=Math.min(clock()+120000,first.expires);
  onCode({code,expires:deadline});
  try{
    let approval;
    while(clock()<deadline){
      if(signal?.aborted)throw Object.assign(Error('Linking cancelled'),{name:'AbortError'});
      const reply=await call('/enrollment/poll',{challenge:first.challenge});
      if(reply.version!==3||reply.challenge!==first.challenge)throw Error('Invalid enrollment response');
      if(reply.state==='APPROVED'){approval=reply;break;}
      if(reply.state!=='WAITING')throw Error('Invalid enrollment response');
      await wait(750,signal);
    }
    if(!approval)throw Error('Linking code expired. Start linking again.');
    const client=new SrpClient(params,bytes(approval.salt,32),Buffer.from(clientId),Buffer.from(code),crypto.randomBytes(32));
    client.setB(bytes(approval.B,384));
    const reply=await call('/enrollment/finish',{challenge:first.challenge,A:client.computeA().toString('hex'),M1:client.computeM1().toString('hex')});
    client.checkM2(bytes(reply.M2,64));
    const value=open(client.computeK(),first.challenge,reply.payload);
    if(value.clientId!==clientId||!UUID.test(value.id||'')||(expectedId&&value.id!==expectedId)||!/^[a-f0-9]{64}$/.test(value.fp||'')||!/^[A-Za-z0-9_-]{43}$/.test(value.token||''))throw Error('Zeiron identity does not match the selected host');
    await request({address,fp:value.fp,token:value.token,endpoint:'/status',signal});
    return value;
  }finally{
    // Cancelling an unauthenticated pending request cannot revoke established device trust.
    try{await request({address,endpoint:'/enrollment/cancel',method:'POST',body:{challenge:first.challenge},discovery:true,timeoutMs:1200});}catch{}
  }
}
module.exports={DeviceManager,enroll};
