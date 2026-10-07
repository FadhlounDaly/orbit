const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {HostBackend}=require('../runtime/resources/app/host-backend.cjs');
function fixture(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-host-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const backend=new HostBackend({root,vault:{isEncryptionAvailable:()=>false},...options});
 return backend;
}
test('occupied port refuses startup without creating configuration or launching a process',async t=>{
 const b=fixture(t,{busy:async()=>true,spawnProcess:()=>{throw Error('Must not spawn')}});
 fs.mkdirSync(path.dirname(b.exe),{recursive:true});fs.writeFileSync(b.exe,'');
 await assert.rejects(b.start(),/Another host/);
 assert.equal(fs.existsSync(b.dir),false);
});
test('unavailable credential protection refuses startup before configuration or launch',async t=>{
 const b=fixture(t,{busy:async()=>false,spawnProcess:()=>{throw Error('Must not spawn')}});
 fs.mkdirSync(path.dirname(b.exe),{recursive:true});fs.writeFileSync(b.exe,'');
 await assert.rejects(b.start(),/credential protection/);
 assert.equal(fs.existsSync(b.paths().conf),false);
});
test('pairing rejects expired requests and does not submit a PIN',async t=>{
 const b=fixture(t);const calls=[];
 b.api=async(...args)=>{calls.push(args);return {pairings:[]};};
 await assert.rejects(b.pair({id:'a'.repeat(32),pin:'1234',name:'Legion Go'}),/expired/);
 assert.deepEqual(calls.map(x=>x[0]),['/api/pin']);
});
test('successful pairing requires backend confirmation, not merely accepting a PIN',async t=>{
 const b=fixture(t);let posted;
 b.api=async(endpoint,method,body)=>{if(!method)return {pairings:[{id:'a'.repeat(32)}]};posted=body;return {status:false};};
 await assert.rejects(b.pair({id:'a'.repeat(32),pin:'1234',name:'Legion Go'}),/failed/);
 assert.equal(posted.pairing_id,'a'.repeat(32));
 b.api=async(endpoint,method)=>method?{status:true}:{pairings:[{id:'a'.repeat(32)}]};
 assert.deepEqual(await b.pair({id:'a'.repeat(32),pin:'1234',name:'Legion Go'}),{paired:true});
});
test('shared app changes cannot modify an active host',async t=>{
 const b=fixture(t);b.child={};
 await assert.rejects(b.setSteam(true),/Stop hosting/);
 assert.equal(fs.existsSync(b.paths().apps),false);
});
test('shared app selections contain only fixed Desktop and Steam entries',async t=>{
 const b=fixture(t);await b.setSteam(true);
 const apps=JSON.parse(fs.readFileSync(b.paths().apps)).apps;
 assert.deepEqual(apps.map(x=>x.name),['Desktop','Steam Big Picture']);
 assert.equal(apps[1].detached[0],'steam://open/bigpicture');
 await b.setSteam(false);
 assert.deepEqual(JSON.parse(fs.readFileSync(b.paths().apps)).apps.map(x=>x.name),['Desktop']);
});
