const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Registry}=require('../runtime/resources/app/control/model.cjs');
const {DeviceManager,enroll}=require('../runtime/resources/app/control/devices.cjs');
const {SessionManager}=require('../runtime/resources/app/control/host-sessions.cjs');
const {SrpClient,SRP}=require('../runtime/resources/app/vendor/fast-srp-hap');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-host-controller-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const registry=new Registry(path.join(root,'devices.bin'),'host',{
  isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()});
 return {root,registry};
}
function handshake(manager,code,clientId=crypto.randomUUID()){
 const first=manager.begin({clientId});
 const client=new SrpClient(SRP.params.hap,Buffer.from(first.salt,'hex'),Buffer.from(clientId),Buffer.from(code),crypto.randomBytes(32));
 client.setB(Buffer.from(first.B,'hex'));
 return {first,client,body:{challenge:first.challenge,A:client.computeA().toString('hex'),M1:client.computeM1().toString('hex')}};
}
test('eight-digit code is bootstrap only; credentials never appear in public device metadata',async t=>{
 const {registry}=fixture(t),manager=new DeviceManager({registry}),invitation=manager.generate();
 assert.match(invitation.code,/^\d{8}$/);
 const id=crypto.randomUUID(),fp='a'.repeat(64);let checks=0;
 const request=async args=>{
  if(args.endpoint==='/enrollment/begin')return manager.begin(args.body);
  if(args.endpoint==='/enrollment/finish'){
   const response=manager.finish(args.body,fp);
   assert.equal(JSON.stringify(response).includes(registry.data.client.token),false);return response;
  }
  assert.equal(args.fp,fp);assert.equal(args.token,registry.data.client.token);checks++;return {};
 };
 const value=await enroll({code:invitation.code,clientId:id,address:'192.168.1.26',request});
 assert.equal(checks,1);assert.equal(value.token.length,43);assert.notEqual(value.token,invitation.code);
 assert.equal(manager.invite,null);assert.equal(manager.pending.size,0);
 assert.equal(JSON.stringify(manager.list()).includes(value.token),false);
 assert.ok(manager.authenticate('Bearer '+value.token));manager.revoke(id);
 assert.equal(manager.authenticate('Bearer '+value.token),null);
});
test('wrong code, zero public value, replay, regenerated and expired challenges fail closed',t=>{
 const {registry}=fixture(t);let now=0;const manager=new DeviceManager({registry,clock:()=>now});
 const invitation=manager.generate(),wrong=handshake(manager,invitation.code==='00000000'?'00000001':'00000000');
 assert.throws(()=>manager.finish(wrong.body,'a'.repeat(64)));assert.equal(registry.data.client,null);
 assert.throws(()=>manager.finish(wrong.body,'a'.repeat(64)));
 const zero=handshake(manager,invitation.code);zero.body.A='0'.repeat(768);
 assert.throws(()=>manager.finish(zero.body,'a'.repeat(64)));assert.equal(registry.data.client,null);
 const regenerated=handshake(manager,invitation.code);manager.generate();
 assert.throws(()=>manager.finish(regenerated.body,'a'.repeat(64)));
 const expired=handshake(manager,manager.invite.code);now=300001;
 assert.throws(()=>manager.finish(expired.body,'a'.repeat(64)));
 assert.throws(()=>manager.begin({clientId:crypto.randomUUID()}));
});
test('rate limit is host-wide and regenerating a code does not reset it',t=>{
 const {registry}=fixture(t),manager=new DeviceManager({registry});
 for(let i=0;i<5;i++){manager.generate();manager.begin({clientId:crypto.randomUUID()});}
 manager.generate();assert.throws(()=>manager.begin({clientId:crypto.randomUUID()}),e=>e.status===429);
});
test('invalid server proof and changed TLS identity never complete enrollment',async t=>{
 const {registry}=fixture(t),manager=new DeviceManager({registry});let mode='proof';
 const request=async args=>{
  if(args.endpoint==='/enrollment/begin')return manager.begin(args.body);
  if(args.endpoint==='/enrollment/finish'){
   const reply=manager.finish(args.body,'a'.repeat(64));if(mode==='proof')reply.M2='0'.repeat(128);return reply;
  }
  throw Error('Zeiron identity changed');
 };
 let code=manager.generate().code;
 await assert.rejects(enroll({code,clientId:crypto.randomUUID(),address:'192.168.1.26',request}),/not authentic/);
 mode='pin';code=manager.generate().code;
 await assert.rejects(enroll({code,clientId:crypto.randomUUID(),address:'192.168.1.26',request}),/identity changed/);
});
function sessions(t,options={}){
 const {root}=fixture(t),log=path.join(root,'stream.log');fs.writeFileSync(log,'CLIENT CONNECTED\n');
 const backend={paths:()=>({log}),status:async()=>({running:true,healthy:true,apps:[{name:'Desktop'}]})};
 const journal=path.join(root,'session.json');
 return {manager:new SessionManager({backend,journal,...options}),journal,backend,log};
}
test('host serializes concurrent session starts and owns approved stream profiles',async t=>{
 const {manager}=sessions(t);
 const replies=await Promise.allSettled([manager.start({intent:'desktop',profile:'smooth'},'legion'),manager.start({intent:'desktop'},'legion')]);
 assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(manager.state,'READY');assert.equal(replies[0].value.stream.fps,120);
 await assert.rejects(manager.start({intent:'desktop',profile:'arbitrary'},'legion'));
 await assert.rejects(manager.end(manager.current.id,'other-client'));
 await manager.end(manager.current.id,'legion');assert.equal(manager.state,'IDLE');
});
test('expired heartbeat cannot revive a session; expiry restores without another client request',async t=>{
 let now=0,restored=0;
 const display={snapshot:async()=>({changed:false}),prepare:async()=>{},restore:async()=>{restored++;}};
 const {manager}=sessions(t,{clock:()=>now,display});
 const first=await manager.start({intent:'desktop'},'legion');now=45000;
 await assert.rejects(manager.heartbeat(first.id,'legion'),/expired/);
 assert.equal(manager.state,'IDLE');assert.equal(restored,1);
 await manager.start({intent:'desktop'},'legion');now=90000;
 await manager.status();assert.equal(manager.state,'IDLE');assert.equal(restored,2);
});
test('snapshot is persisted before display preparation; failure restores original state',async t=>{
 let journal,restored;
 const original={changed:true,monitor:'test',mode:'original'};
 const display={snapshot:async()=>original,prepare:async()=>{
  assert.deepEqual(JSON.parse(fs.readFileSync(journal)).session.previousSystemState,original);
  throw Error('preparation failed');
 },restore:async value=>{restored=value;}};
 const fixture=sessions(t,{display});journal=fixture.journal;
 await assert.rejects(fixture.manager.start({intent:'desktop'},'legion'),/preparation failed/);
 assert.deepEqual(restored,original);assert.equal(fixture.manager.state,'IDLE');
});
test('restoration failure blocks new sessions and recovery replays the durable journal',async t=>{
 let fail=true,restores=0;
 const original={changed:true,mode:'original'};
 const display={snapshot:async()=>original,prepare:async()=>{},restore:async state=>{
  assert.deepEqual(state,original);restores++;if(fail)throw Error('unavailable');
 }};
 const {manager,backend,journal}=sessions(t,{display});
 const lease=await manager.start({intent:'desktop'},'legion');
 await assert.rejects(manager.end(lease.id,'legion'),/Restoration failed/);
 assert.equal(manager.state,'ERROR');await assert.rejects(manager.start({intent:'desktop'},'legion'),/Restore/);
 fail=false;const recovered=new SessionManager({backend,journal,display});await recovered.recover();
 assert.equal(recovered.state,'IDLE');assert.equal(restores,2);
 assert.equal(JSON.parse(fs.readFileSync(journal)).session,null);
});
test('old streaming events cannot establish a new session and resume keeps the session identity',async t=>{
 const {manager,log}=sessions(t);const lease=await manager.start({intent:'desktop'},'legion');
 assert.equal((await manager.status()).session.state,'CONNECTING');
 fs.appendFileSync(log,'CLIENT CONNECTED\n');assert.equal((await manager.heartbeat(lease.id,'legion')).state,'STREAMING');
 fs.appendFileSync(log,'CLIENT DISCONNECTED\n');assert.equal((await manager.status()).hostSession.state,'RECONNECTING');
 const resumed=await manager.start({intent:'desktop',resumeId:lease.id},'legion');assert.equal(resumed.id,lease.id);
 await manager.shutdown();assert.equal(manager.state,'IDLE');
});

test('queued start rechecks device authorization before preparation',async t=>{
 const {manager}=sessions(t);let authorized=true,release;
 manager.tail=new Promise(r=>{release=r;});
 const pending=manager.start({intent:'desktop'},'legion',()=>authorized);
 authorized=false;release();await assert.rejects(pending,e=>e.status===401);
 assert.equal(manager.state,'IDLE');assert.equal(manager.current,null);
});
