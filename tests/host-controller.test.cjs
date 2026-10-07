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
function handshake(manager,code,entered=code,clientId=crypto.randomUUID()){
 const first=manager.request({clientId},'192.168.1.186');
 manager.approve({challenge:first.challenge,code:entered});
 const approval=manager.poll({challenge:first.challenge},'192.168.1.186');
 const client=new SrpClient(SRP.params.hap,Buffer.from(approval.salt,'hex'),Buffer.from(clientId),Buffer.from(code),crypto.randomBytes(32));
 client.setB(Buffer.from(approval.B,'hex'));
 return {first,client,body:{challenge:first.challenge,A:client.computeA().toString('hex'),M1:client.computeM1().toString('hex')}};
}
test('handheld four-digit code requires local host entry and issues an independent credential',async t=>{
 const {registry}=fixture(t),manager=new DeviceManager({registry});const id=crypto.randomUUID(),fp='a'.repeat(64);let code,checks=0;
 const request=async args=>{
  assert.equal(Object.hasOwn(args.body||{},'code'),false);
  if(args.endpoint==='/enrollment/request')return manager.request(args.body,'192.168.1.186');
  if(args.endpoint==='/enrollment/poll')return manager.poll(args.body,'192.168.1.186');
  if(args.endpoint==='/enrollment/cancel')return manager.cancelRequest(args.body,'192.168.1.186');
  if(args.endpoint==='/enrollment/finish'){
   const response=manager.finish(args.body,fp,'192.168.1.186');
   assert.equal(JSON.stringify(response).includes(registry.data.client.token),false);return response;
  }
  assert.equal(args.fp,fp);assert.equal(args.token,registry.data.client.token);checks++;return {};
 };
 const value=await enroll({clientId:id,address:'192.168.1.26',request,onCode:p=>{
  code=p.code;assert.match(code,/^\d{4}$/);assert.equal(registry.data.client,null);
  assert.equal(manager.poll({challenge:manager.pending.challenge},'192.168.1.186').state,'WAITING');
  manager.approve({challenge:manager.pending.challenge,code});
 }});
 assert.equal(checks,1);assert.equal(value.token.length,43);assert.notEqual(value.token,code);
 assert.equal(manager.pending,null);assert.equal(JSON.stringify(manager.list()).includes(value.token),false);
 assert.ok(manager.authenticate('Bearer '+value.token));manager.revoke(id);
 assert.equal(manager.authenticate('Bearer '+value.token),null);
});
test('unapproved, wrong code, zero public value, replay and expired requests fail closed',t=>{
 const {registry}=fixture(t);let now=0;const manager=new DeviceManager({registry,clock:()=>now});
 registry.trustClient({id:crypto.randomUUID(),token:'original'});
 let first=manager.request({clientId:crypto.randomUUID()},'192.168.1.186');
 assert.throws(()=>manager.finish({challenge:first.challenge,A:'0'.repeat(768),M1:'0'.repeat(128)},'a'.repeat(64),'192.168.1.186'),/first/);
 manager.cancel();
 const wrong=handshake(manager,'1234','4321');
 assert.throws(()=>manager.finish(wrong.body,'a'.repeat(64),'192.168.1.186'),/codes did not match/);
 assert.equal(registry.data.client.token,'original');assert.throws(()=>manager.finish(wrong.body,'a'.repeat(64),'192.168.1.186'));
 const zero=handshake(manager,'1234');zero.body.A='0'.repeat(768);
 assert.throws(()=>manager.finish(zero.body,'a'.repeat(64),'192.168.1.186'));
 now=60000;first=manager.request({clientId:crypto.randomUUID()},'192.168.1.186');now=180001;
 assert.throws(()=>manager.approve({challenge:first.challenge,code:'1234'}));
 assert.equal(registry.data.client.token,'original');
});
test('rate limit is host-wide and cancelling a request does not reset it',t=>{
 const {registry}=fixture(t),manager=new DeviceManager({registry});
 for(let i=0;i<3;i++){manager.request({clientId:crypto.randomUUID()},'192.168.1.186');manager.cancel();}
 assert.throws(()=>manager.request({clientId:crypto.randomUUID()},'192.168.1.187'),e=>e.status===429);
});
test('only one request is pending; local entry cannot be overwritten; source and expiration are enforced',t=>{
 const {registry}=fixture(t);let now=0;const manager=new DeviceManager({registry,clock:()=>now});
 const first=manager.request({clientId:crypto.randomUUID()},'192.168.1.186');
 assert.throws(()=>manager.request({clientId:crypto.randomUUID()},'192.168.1.187'),e=>e.status===409);
 assert.throws(()=>manager.poll({challenge:first.challenge},'192.168.1.187'));
 assert.throws(()=>manager.approve({challenge:first.challenge,code:'12345678'}));
 manager.approve({challenge:first.challenge,code:'0123'});
 assert.throws(()=>manager.approve({challenge:first.challenge,code:'4567'}));
 now=30001;assert.throws(()=>manager.poll({challenge:first.challenge},'192.168.1.186'));
 assert.equal(manager.pending,null);
});
test('invalid server proof, selected identity mismatch and changed TLS identity never complete enrollment',async t=>{
 const {registry}=fixture(t),manager=new DeviceManager({registry});let mode='proof';
 const request=async args=>{
  if(args.endpoint==='/enrollment/request')return manager.request(args.body,'192.168.1.186');
  if(args.endpoint==='/enrollment/poll')return manager.poll(args.body,'192.168.1.186');
  if(args.endpoint==='/enrollment/cancel')return manager.cancelRequest(args.body,'192.168.1.186');
  if(args.endpoint==='/enrollment/finish'){
   const reply=manager.finish(args.body,'a'.repeat(64),'192.168.1.186');if(mode==='proof')reply.M2='0'.repeat(128);return reply;
  }
  throw Error('Zeiron identity changed');
 };
 const attempt=expectedId=>enroll({clientId:crypto.randomUUID(),address:'192.168.1.26',expectedId,request,
  onCode:p=>manager.approve({challenge:manager.pending.challenge,code:p.code})});
 await assert.rejects(attempt(),/not authentic/);
 mode='identity';await assert.rejects(attempt(crypto.randomUUID()),/selected host/);
 mode='pin';await assert.rejects(attempt(),/identity changed/);
});
test('client cancellation clears the request without replacing existing trust',async t=>{
 const {registry}=fixture(t),manager=new DeviceManager({registry});registry.trustClient({id:crypto.randomUUID(),token:'original'});
 const controller=new AbortController();
 const request=async args=>{
  if(args.endpoint==='/enrollment/request')return manager.request(args.body,'192.168.1.186');
  if(args.endpoint==='/enrollment/cancel')return manager.cancelRequest(args.body,'192.168.1.186');
  throw Error('No further enrollment request expected');
 };
 await assert.rejects(enroll({clientId:crypto.randomUUID(),address:'192.168.1.26',request,signal:controller.signal,onCode:()=>controller.abort()}),e=>e.name==='AbortError');
 assert.equal(manager.pending,null);assert.equal(registry.data.client.token,'original');
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
