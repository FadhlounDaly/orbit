'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GameGraphics,values}=require('../runtime/resources/app/control/game-graphics.cjs');
const {SessionManager}=require('../runtime/resources/app/control/host-sessions.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-graphics-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'SkyrimPrefs.ini');fs.writeFileSync(file,'[General]\r\nsVolume=1\r\n[Display]\r\niSize W=5120\r\niSize H=1440\r\nbBorderless=0\r\nbFull Screen=1\r\nfGamma=1.1\r\n[Other]\r\niSize W=17\r\n');return {dir,file,graphics:new GameGraphics({skyrimPrefs:file}),game:{id:'local:'+'a'.repeat(64),name:'Skyrim',launch:{type:'local',exe:path.join(dir,'SkyrimSE.exe')}}};}
test('Skyrim fits the actual session mode and restores only its own display keys',t=>{
 const {graphics,game,file}=setup(t),original=fs.readFileSync(file,'utf8'),snapshot=graphics.snapshot(game,{width:1920,height:1200});graphics.prepare(snapshot);
 assert.equal(values(fs.readFileSync(file,'utf8'))['iSize W'],'1920');assert.equal(values(fs.readFileSync(file,'utf8'))['iSize H'],'1200');assert.equal(fs.readFileSync(file,'utf8').includes('[Other]\r\niSize W=17'),true);
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('fGamma=1.1','fGamma=1.3'));graphics.restore(snapshot);
 assert.equal(fs.readFileSync(file,'utf8'),original.replace('fGamma=1.1','fGamma=1.3'));
});
test('restoration preserves display choices changed explicitly during play and rejects foreign paths',t=>{
 const {graphics,game,file}=setup(t),snapshot=graphics.snapshot(game,{width:1920,height:1200});graphics.prepare(snapshot);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('iSize W=1920','iSize W=1600'));graphics.restore(snapshot);assert.equal(values(fs.readFileSync(file,'utf8'))['iSize W'],'1600');assert.throws(()=>graphics.restore({...snapshot,file:'someone-else.ini'}),/Unsupported/);
});
test('host journals graphics settings before writing and restores them on launch failure',async t=>{
 const {graphics,game,file,dir}=setup(t),original=fs.readFileSync(file,'utf8'),journal=path.join(dir,'session.json');let restored=false;
 const originalPrepare=graphics.prepare.bind(graphics);graphics.prepare=snapshot=>{assert.deepEqual(JSON.parse(fs.readFileSync(journal)).session.previousGameSettings,snapshot);originalPrepare(snapshot);};
 const manager=new SessionManager({journal,graphics,library:{resolve:async()=>game},launcher:{launch:async()=>{throw Error('game start failed');}},backend:{paths:()=>({log:path.join(dir,'none.log')}),status:async()=>({running:true,healthy:true,apps:[{name:'Desktop'}]})},display:{snapshot:async()=>({changed:true}),prepare:async()=>({mode:{width:1920,height:1200}}),restore:async()=>{restored=true;}}});
 await assert.rejects(manager.start({intent:'desktop',gameId:game.id},'legion'),/game start failed/);assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(restored,true);assert.equal(manager.state,'IDLE');
});
test('host crash recovery restores the journaled Skyrim values with a fresh adapter',async t=>{
 const {graphics,game,file,dir}=setup(t),original=fs.readFileSync(file,'utf8'),snapshot=graphics.snapshot(game,{width:1920,height:1200});graphics.prepare(snapshot);
 const journal=path.join(dir,'session.json');fs.writeFileSync(journal,JSON.stringify({version:1,state:'STREAMING',session:{previousGameSettings:snapshot,previousSystemState:{changed:false}}}));
 const manager=new SessionManager({journal,graphics:new GameGraphics({skyrimPrefs:file}),backend:{paths:()=>({log:path.join(dir,'none.log')})}});await manager.recover();assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(manager.state,'IDLE');
});
