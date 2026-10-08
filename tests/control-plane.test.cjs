const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Machine,Registry,publicSessions}=require('../runtime/resources/app/control/model.cjs');
const {ClientCoordinator}=require('../runtime/resources/app/control/client.cjs');
const {HostService}=require('../runtime/resources/app/control/host-service.cjs');
const {request}=require('../runtime/resources/app/control/transport.cjs');
const {enroll}=require('../runtime/resources/app/control/devices.cjs');
const {SessionManager}=require('../runtime/resources/app/control/host-sessions.cjs');
const hostId='12345678-1234-1234-1234-123456789abc';
const fp='a'.repeat(64),token='a'.repeat(43);
function fixture(t,role='client'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-control-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const vault={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
 return {root,registry:new Registry(path.join(root,role+'.bin'),role,vault)};
}
function client(t,{paired=true,...options}={}){
 const {registry}=fixture(t);registry.trustHost({id:hostId,fp,token,hostname:'ZEIRON-CORE'});
 let callback,starts=0;
 const adapter={list:async()=>{if(!paired)throw Object.assign(Error('unpaired'),{code:'UNPAIRED'});return ['Desktop'];},
 start:(address,target,profile,end)=>{starts++;callback=end;},stop:()=>{},close:()=>{}};
 const remote=async({endpoint})=>{
  if(endpoint==='/identity')return {version:1,id:hostId,role:'host'};
  if(endpoint==='/status')return {online:true,sessions:[{id:'desktop',name:'Desktop'}]};
  if(endpoint==='/sessions/start')return {id:'lease',target:'Desktop'};
  if(endpoint==='/sessions/heartbeat')return {session:{state:'STREAMING'}};
  return {ended:true};
 };
 const c=new ClientCoordinator({registry,adapter,resolve:async()=> '192.168.1.26',request:remote,...options});
 t.after(()=>c.close());
 return {c,adapter,exit:event=>callback(event),starts:()=>starts};
}
test('state machine refuses streaming without connection initiation',()=>{
 const m=new Machine();assert.throws(()=>m.move('STREAMING'),/Invalid/);
 m.move('DISCOVERING');m.move('HOST_FOUND');m.move('TRUSTED');m.move('READY');m.move('CONNECTING');m.move('STREAMING');
});
test('sessions expose Orbit intent IDs rather than backend IDs',()=>{
 assert.deepEqual(publicSessions(['Desktop','Arbitrary Game','Steam Big Picture']),[{id:'desktop',name:'Desktop'},{id:'steam',name:'Steam Big Picture'}]);
});
test('known host becomes READY; process startup alone stays CONNECTING',async t=>{
 const {c,starts}=client(t);assert.equal((await c.refresh()).state,'READY');
 await c.connect();assert.equal(starts(),1);assert.equal(c.machine.state,'CONNECTING');
 await c.disconnect();assert.equal(c.machine.state,'READY');
});
test('STREAMING requires a host connection observation',async t=>{
 const jobs=[];const {c}=client(t,{schedule:fn=>{jobs.push(fn);return jobs.length;},cancel:()=>{}});
 await c.connect();assert.equal(c.machine.state,'CONNECTING');
 await jobs.shift()();assert.equal(c.machine.state,'STREAMING');
});
test('duplicate Connect requests do not spawn duplicate runtimes',async t=>{
 const {c,starts}=client(t);await c.connect();await assert.rejects(c.connect(),/already active/);assert.equal(starts(),1);
});
test('missing streaming trust goes to UNPAIRED without launching',async t=>{
 const {c,starts}=client(t,{paired:false});assert.equal((await c.refresh()).state,'UNPAIRED');
 await assert.rejects(c.connect(),/restore streaming trust/);assert.equal(starts(),0);
});
test('host identity mismatch fails closed and keeps stored trust',async t=>{
 const {c}=client(t,{request:async()=>({version:1,id:'other',role:'host'})});
 assert.equal((await c.refresh()).state,'ERROR');assert.equal(c.registry.data.host.id,hostId);
});
test('unexpected exit schedules bounded recovery; user disconnect cancels it',async t=>{
 const jobs=[];const {c,exit,starts}=client(t,{schedule:fn=>{jobs.push(fn);return jobs.length;},cancel:()=>{}});
 await c.connect();await exit({code:1});assert.equal(c.machine.state,'RECONNECTING');
 await c.disconnect();assert.equal(c.machine.state,'READY');
 await jobs.at(-1)();assert.equal(starts(),1);
});
test('device registry survives restart without changing device identity',t=>{
 const {registry}=fixture(t);const reload=new Registry(registry.file,'client',registry.vault);
 assert.equal(reload.data.device.id,registry.data.device.id);
});
let openssl=false;try{execFileSync('openssl',['version'],{stdio:'ignore'});openssl=true;}catch{}
test('TLS pinning rejects a changed certificate before transmitting authorization; locally approved handheld linking is single-use', {skip:!openssl},async t=>{
 const {root,registry}=fixture(t,'host');const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-subj','/CN=Orbit Test','-days','1'],{stdio:'ignore'});
 const log=path.join(root,'backend.log');fs.writeFileSync(log,'');
 const backend={ready:true,paths:()=>({cert,key,log}),status:async()=>({running:true,apps:[{name:'Desktop'}]})};
 const service=new HostService({backend,registry,port:0});
 await service.start();t.after(()=>service.stop());
 const port=service.server.address().port;let receivedAuthorization=false;
 await assert.rejects(request({address:'127.0.0.1',port,fp:service.fp,endpoint:'/library'}),e=>e.status===401);
 service.server.prependListener('request',req=>{if(req.headers.authorization)receivedAuthorization=true;});
 await assert.rejects(request({address:'127.0.0.1',port,fp:'0'.repeat(64),token:'DO-NOT-SEND',endpoint:'/status'}),/identity changed/);
 assert.equal(receivedAuthorization,false);
  const clientId=crypto.randomUUID();
 const call=args=>request({...args,port});
 const linked=await enroll({address:'127.0.0.1',clientId,request:call,onCode:p=>service.approvePairing({challenge:service.devices.pending.challenge,code:p.code})});
 assert.equal(linked.id,registry.data.device.id);
 assert.throws(()=>service.devices.finish({challenge:'consumed'},linked.fp,'127.0.0.1'));
 const status=await request({address:'127.0.0.1',port,fp:linked.fp,token:linked.token,endpoint:'/status'});
 assert.deepEqual(status.sessions,[{id:'desktop',name:'Desktop'}]);
 const library=await request({address:'127.0.0.1',port,fp:linked.fp,token:linked.token,endpoint:'/library'});assert.equal(library.version,1);
 await assert.rejects(request({address:'127.0.0.1',port,fp:linked.fp,token:linked.token,endpoint:'/library/game?id=calc.exe'}),e=>e.status===400);
 await assert.rejects(request({address:'127.0.0.1',port,fp:linked.fp,token:linked.token,endpoint:'/sessions/start',method:'POST',body:{intent:'desktop',gameId:'calc.exe'}}),e=>e.status===400);
 await assert.rejects(request({address:'127.0.0.1',port,fp:linked.fp,token:linked.token,endpoint:'/sessions/start',method:'POST',body:{intent:'calc.exe'}}));
 const lease=await request({address:'127.0.0.1',port,fp:linked.fp,token:linked.token,endpoint:'/sessions/start',method:'POST',body:{intent:'desktop'}});
 fs.appendFileSync(log,'CLIENT CONNECTED\n');
 const heartbeat=await request({address:'127.0.0.1',port,fp:linked.fp,token:linked.token,endpoint:'/sessions/heartbeat',method:'POST',body:{id:lease.id}});
 assert.equal(heartbeat.session.state,'STREAMING');
 fs.appendFileSync(log,'CLIENT DISCONNECTED\n');
 assert.equal((await service.sessions.status()).session.state,'DISCONNECTED');
});
test('simultaneous Connect requests are serialized',async t=>{
 const {c,starts}=client(t);
 const results=await Promise.allSettled([c.connect(),c.connect()]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(starts(),1);
});
test('three failed recoveries stop retrying',async t=>{
 const jobs=[];const {c,exit,starts}=client(t,{schedule:fn=>{jobs.push(fn);return jobs.length;},cancel:()=>{}});
 await c.connect();
 for(let i=0;i<3;i++){
  await exit({code:1});
  assert.equal(c.machine.state,'RECONNECTING');
  const job=jobs.pop();jobs.length=0;await job();
  assert.equal(c.machine.state,'CONNECTING');
 }
 await exit({code:1});assert.equal(c.machine.state,'ERROR');assert.equal(starts(),4);
});
test('registry revocation becomes UNPAIRED rather than pretending the host is offline',async t=>{
 const {c}=client(t,{request:async({endpoint})=>{
  if(endpoint==='/identity')return {version:1,id:hostId,role:'host'};
  throw Object.assign(Error('Link this Legion Go in Orbit'),{code:'UNTRUSTED'});
 }});
 assert.equal((await c.refresh()).state,'UNPAIRED');
});
test('reassigned cached address is not trusted; discovery tries the persistent hostname',async t=>{
 let addressQueries=0;
 const {c}=client(t,{resolve:async host=>host==='old-address'?'192.168.1.8':'192.168.1.26',
  request:async({address,endpoint})=>{
   addressQueries++;
   if(endpoint==='/identity')return {version:1,id:hostId,role:'host'};
   if(address==='192.168.1.8')throw Error('Zeiron identity changed');
   return {online:true,sessions:[{id:'desktop',name:'Desktop'}]};
  }});
 c.registry.data.host.lastAddress='old-address';
 assert.equal((await c.refresh()).state,'READY');
 assert.equal(c.address,'192.168.1.26');assert.ok(addressQueries>=4);
});
test('disconnect during an in-flight reconnect cannot restart the stream',async t=>{
 const jobs=[];const {c,exit,starts}=client(t,{schedule:fn=>{jobs.push(fn);return jobs.length;},cancel:()=>{}});
 await c.connect();await exit({code:1});
 let release;const waiting=new Promise(r=>{release=r;});
 c.locate=async()=>{await waiting;};
 const retry=jobs.pop()();
 await c.disconnect();release();await retry;
 assert.equal(c.machine.state,'READY');assert.equal(starts(),1);
});

test('healthy polling stays READY, emits no discovery pulses, and does not repeatedly invoke streaming trust checks',async t=>{
 const seen=[];let lists=0;const {c,adapter}=client(t,{notify:s=>seen.push(s.state)});const list=adapter.list;
 adapter.list=async(...args)=>{lists++;return list(...args);};
 await c.refresh();seen.length=0;
 await c.refresh();await c.refresh();assert.equal(c.machine.state,'READY');assert.deepEqual(seen,[]);assert.equal(lists,1);
 c.request=async()=>{throw Object.assign(Error('Zeiron did not respond'),{code:'ETIMEDOUT'});};
 assert.equal((await c.refresh()).state,'OFFLINE');assert.equal(c.hostOnline,false);
});
test('handheld sends a known game ID through the existing host session API and streams the host-selected target',async t=>{
 const requests=[];const {c}=client(t);const original=c.request;
 c.request=async args=>{requests.push(args);return original(args);};
 await c.play('steam:123');const start=requests.find(r=>r.endpoint==='/sessions/start');
 assert.equal(start.body.gameId,'steam:123');assert.equal(start.body.intent,'desktop');assert.equal(Object.hasOwn(start.body,'executable'),false);
 await c.disconnect();await assert.rejects(c.play('C:\\Windows\\System32\\calc.exe'),/Choose a game/);
});
test('game library uses pinned authenticated transport, caches responses, and preserves client state',async t=>{
 let calls=0;const {c}=client(t);const original=c.request;
 c.request=async args=>{if(args.endpoint.startsWith('/library')){assert.equal(args.fp,fp);assert.equal(args.token,token);calls++;return {version:1,games:[]};}return original(args);};
 await c.refresh();await c.library();await c.library();assert.equal(calls,1);await c.library({force:true});assert.equal(calls,2);assert.equal(c.machine.state,'READY');
});

test('an online host warming its stream stays visually steady and then recovers to READY',async t=>{
 const seen=[];let ready=false;const {c}=client(t,{notify:s=>seen.push(s.state),request:async({endpoint})=>{
  if(endpoint==='/identity')return {version:1,id:hostId,role:'host'};
  return {online:true,ready,sessions:[{id:'desktop',name:'Desktop'}]};
 }});
 assert.equal((await c.refresh()).state,'ERROR');assert.equal(c.hostOnline,true);seen.length=0;
 await c.refresh();await c.refresh();assert.deepEqual(seen,[]);
 ready=true;assert.equal((await c.refresh()).state,'READY');assert.equal(seen.includes('DISCOVERING'),false);
});

test('a failed stream runtime ends the host lease before another Play attempt',async t=>{
 const calls=[];const {c,adapter}=client(t);const original=c.request;
 c.request=async args=>{calls.push(args);return original(args);};adapter.start=()=>{throw Error('runtime failed');};
 await assert.rejects(c.play('steam:123'),/runtime failed/);assert.equal(c.session,null);
 assert.equal(calls.find(r=>r.endpoint==='/sessions/end').body.id,'lease');assert.equal(c.machine.state,'ERROR');
});

test('quality preference changes keep the active session profile during recovery',async t=>{
 const {c,adapter}=client(t);const requests=[],profiles=[];const original=c.request;c.request=async args=>{if(args.endpoint==='/sessions/start')requests.push(args.body);return original(args);};adapter.start=(_address,_target,profile)=>profiles.push(profile);
 await c.connect();c.profile='sharp';await c.launch();assert.equal(c.session.profile,'balanced');assert.equal(c.snapshot().session.profile,'balanced');assert.deepEqual(profiles,['balanced','balanced']);assert.equal(requests.at(-1).profile,'balanced');await c.disconnect();await c.connect();assert.equal(c.session.profile,'sharp');
});
