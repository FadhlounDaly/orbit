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
  return Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from(challenge), Buffer.from('Orbit enrollment v2'), 32));
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
    this.registry=registry;this.clock=clock;this.invite=null;this.pending=new Map();
    this.window={at:clock(),count:0};
  }
  generate() {
    this.pending.clear();
    this.invite={code:String(crypto.randomInt(100000000)).padStart(8,'0'),expires:this.clock()+300000,attempts:0};
    return {code:this.invite.code,expires:this.invite.expires};
  }
  cancel() {this.invite=null;this.pending.clear();}
  begin({clientId}) {
    const now=this.clock();
    if(now-this.window.at>=60000)this.window={at:now,count:0};
    if(++this.window.count>5)throw Object.assign(Error('Linking paused. Try again in a minute.'),{status:429});
    if(!UUID.test(clientId||'') || !this.invite || now>=this.invite.expires || ++this.invite.attempts>10)throw Error('Pairing code is invalid or expired');
    for(const [id,p] of this.pending)if(now>=p.expires)this.pending.delete(id);
    if(this.pending.size>=3)throw Object.assign(Error('A pairing operation is already pending'),{status:429});
    const salt=crypto.randomBytes(32),challenge=crypto.randomUUID();
    const server=new SrpServer(params,salt,Buffer.from(clientId),Buffer.from(this.invite.code),crypto.randomBytes(32));
    this.pending.set(challenge,{server,clientId,expires:Math.min(now+30000,this.invite.expires),invite:this.invite});
    return {version:2,challenge,salt:salt.toString('hex'),B:server.computeB().toString('hex')};
  }
  finish({challenge,A,M1}, fp) {
    const p=this.pending.get(challenge);this.pending.delete(challenge);
    if(!p || this.clock()>=p.expires || p.invite!==this.invite)throw Error('Pairing code is invalid or expired');
    try{p.server.setA(bytes(A,384));p.server.checkM1(bytes(M1,64));}
    catch{throw Object.assign(Error('Pairing code is invalid or expired'),{status:403});}
    const token=crypto.randomBytes(32).toString('base64url');
    // Identity and TLS pin are authenticated inside the SRP-derived envelope.
    const payload=seal(p.server.computeK(),challenge,{id:this.registry.data.device.id,clientId:p.clientId,fp,token});
    this.registry.trustClient({id:p.clientId,token,createdAt:new Date(this.clock()).toISOString(),lastSeenAt:null,
      type:'handheld',credential:{kind:'bearer-256',issuedAt:new Date(this.clock()).toISOString()}});
    this.cancel();
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
async function enroll({code,clientId,address,request}) {
  if(!/^\d{8}$/.test(code))throw Error('Enter the eight-digit code shown on Zeiron');
  const call=(endpoint,body)=>request({address,endpoint,method:'POST',body,discovery:true});
  const first=await call('/enrollment/begin',{clientId});
  if(first.version!==2||!UUID.test(first.challenge||''))throw Error('Invalid enrollment response');
  const client=new SrpClient(params,bytes(first.salt,32),Buffer.from(clientId),Buffer.from(code),crypto.randomBytes(32));
  client.setB(bytes(first.B,384));
  const reply=await call('/enrollment/finish',{challenge:first.challenge,A:client.computeA().toString('hex'),M1:client.computeM1().toString('hex')});
  client.checkM2(bytes(reply.M2,64));
  const value=open(client.computeK(),first.challenge,reply.payload);
  if(value.clientId!==clientId||!UUID.test(value.id||'')||!/^[a-f0-9]{64}$/.test(value.fp||'')||!/^[A-Za-z0-9_-]{43}$/.test(value.token||''))throw Error('Invalid trusted-device credential');
  // Do not persist trust until the authenticated identity matches the actual TLS peer.
  await request({address,fp:value.fp,token:value.token,endpoint:'/status'});
  return value;
}
module.exports={DeviceManager,enroll};
