'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GameProcessTracker}=require('../runtime/resources/app/control/game-process.cjs');
const record={id:'test',launch:{type:'local',exe:'D:\\Games\\Zelda\\yuzu_ea.exe',cwd:'D:\\Games\\Zelda'}};
const process=(pid,started='1',exe=record.launch.exe)=>({pid,started,exe,window:true});
test('owned game exit is observed; preexisting processes are never closed',async()=>{
 let rows=[process(10)],closed=[];const tracker=new GameProcessTracker({processes:{list:async()=>rows,close:async p=>{closed.push(p.pid);rows=rows.filter(r=>r.pid!==p.pid);}}});
 await tracker.begin(record);assert.equal((await tracker.inspect(record.id)).finished,false);
 rows.push(process(11));assert.equal((await tracker.inspect(record.id)).finished,false);
 await tracker.close(record.id);assert.deepEqual(closed,[11]);assert.deepEqual(rows.map(p=>p.pid),[10]);
});
test('process reuse does not prevent game exit detection',async()=>{
 let rows=[];const tracker=new GameProcessTracker({processes:{list:async()=>rows}});await tracker.begin(record);rows=[process(11)];await tracker.inspect(record.id);rows=[process(11,'2','C:\\Windows\\notepad.exe')];assert.equal((await tracker.inspect(record.id)).finished,true);
});
test('launcher dialogs do not count as game completion before game appears',async()=>{
 const tracker=new GameProcessTracker({processes:{list:async()=>[]}});await tracker.begin(record);assert.equal((await tracker.inspect(record.id)).finished,false);await assert.rejects(tracker.close(record.id),/Finish the launcher dialog/);
});
test('Xbox process matching stays inside host configured installation root',async()=>{
 let rows=[],closed=[];const tracker=new GameProcessTracker({processes:{list:async()=>rows,close:async p=>closed.push(p.pid)}});await tracker.begin({id:'xbox',launch:{type:'xbox',installRoot:'D:\\XboxGames\\Game\\Content'}});rows=[process(12,'1','D:\\XboxGames\\Game\\Content\\Game.exe'),process(13,'1','D:\\XboxGames\\Game\\ContentOther\\Other.exe')];await tracker.close('xbox');assert.deepEqual(closed,[12]);
});
const {SessionManager}=require('../runtime/resources/app/control/host-sessions.cjs');
function sessionFixture(){let finished=false,closed=[];const manager=new SessionManager({backend:{status:async()=>({running:true,apps:[{name:'Desktop'}]})},observer:{reset(){},read(){return null;}},library:{resolve:async id=>({id})},launcher:{launch:async()=>({state:'PROCESS_STARTED'}),finished:async()=>finished,closeGame:async id=>closed.push(id)}});return {manager,closed,finish:()=>{finished=true;}};}
test('game completion returns an empty session to the correct client heartbeat',async()=>{const f=sessionFixture();const lease=await f.manager.start({intent:'desktop',gameId:'game'},'client');f.finish();await f.manager.status();assert.equal(await f.manager.heartbeat(lease.id,'client'),null);await assert.rejects(f.manager.heartbeat(lease.id,'other'),/expired/);});
test('close game authenticates the lease and Desktop never closes a game',async()=>{const f=sessionFixture();const lease=await f.manager.start({intent:'desktop',gameId:'game'},'client');await assert.rejects(f.manager.end(lease.id,'other',true),/identity/);assert.deepEqual(f.closed,[]);await f.manager.end(lease.id,'client',true);assert.deepEqual(f.closed,['game']);const desktop=await f.manager.start({intent:'desktop'},'client');await f.manager.end(desktop.id,'client',true);assert.deepEqual(f.closed,['game']);});
const {GameLaunchManager}=require('../runtime/resources/app/control/game-library.cjs');
test('Xbox shell handoff nonzero exit does not reject a displayed save dialog',async()=>{const launcher=new GameLaunchManager({platform:'linux',execute:(exe,args,options,done)=>done(Object.assign(Error('shell delegated'),{code:1}))});const result=await launcher.launch({id:'xbox:'+'a'.repeat(64),launchable:true,name:'Game',provider:'Xbox',launch:{type:'xbox',aumid:'Package!Game'}});assert.equal(result.state,'REQUESTED');});
test('Xbox missing activation executable remains a real launch error',async()=>{const launcher=new GameLaunchManager({platform:'linux',execute:(exe,args,options,done)=>done(Object.assign(Error('missing'),{code:'ENOENT'}))});await assert.rejects(launcher.launch({id:'xbox:'+'a'.repeat(64),launchable:true,name:'Game',provider:'Xbox',launch:{type:'xbox',aumid:'Package!Game'}}),/could not request/);});
test('failed graceful game exit keeps its session available for confirmation',async()=>{const f=sessionFixture();f.manager.launcher.closeGame=async()=>{throw Error('Resolve the save dialog');};const lease=await f.manager.start({intent:'desktop',gameId:'game'},'client');await assert.rejects(f.manager.end(lease.id,'client',true),e=>e.status===409&&e.message.includes('save dialog'));assert.equal(f.manager.current.id,lease.id);});
