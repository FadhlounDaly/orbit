'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {GameLibrary,GameLaunchManager,inside}=require('../runtime/resources/app/control/game-library.cjs');
const {SessionManager}=require('../runtime/resources/app/control/host-sessions.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-games-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function write(file,text=''){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
test('discovers installed Steam, registered Xbox, and an unambiguous PC game without exposing launch paths',async t=>{
 const root=fixture(t),steam=path.join(root,'Steam'),games=path.join(root,'Games');
 write(path.join(steam,'steam.exe'));
 write(path.join(steam,'steamapps/common/Example/game.exe'));
 write(path.join(steam,'steamapps/appmanifest_123.acf'),'"appid" "123" "name" "Steam Example" "installdir" "Example"');
 write(path.join(steam,'steamapps/appmanifest_234.acf'),'"appid" "234" "name" "Not installed" "installdir" "Missing"');
 write(path.join(games,'Xbox Example/Content/game.exe'));
 write(path.join(games,'Xbox Example/Content/art.png'),'art');
 write(path.join(games,'Xbox Example/Content/MicrosoftGame.config'),'<Game><Identity Name="Game.Example"/><ShellVisuals DefaultDisplayName="Xbox &amp; Example" Square480x480Logo="art.png"/><Executable Name="game.exe" Id="Game"/></Game>');
 write(path.join(games,'Local Example/game.exe'));write(path.join(games,'Local Example/unins000.exe'));
 write(path.join(games,'Ambiguous/first.exe'));write(path.join(games,'Ambiguous/second.exe'));
 write(path.join(games,'Emulated/yuzu.exe'));write(path.join(games,'Emulated/Launcher.exe'));
 const library=new GameLibrary({steamRoot:steam,roots:()=>[games],catalog:async()=>({packages:[{Name:'Game.Example',PackageFamilyName:'Game.Example_abc',InstallLocation:path.join(games,'Xbox Example/Content')}]}),artwork:()=> 'data:image/png;base64,YXJ0'});
 const value=await library.list();assert.equal(value.games.length,3);
 assert.equal(value.games.find(g=>g.provider==='Xbox').name,'Xbox & Example');
 assert.equal(value.games.every(g=>g.launchable),true);
 const payload=JSON.stringify(value);assert.equal(payload.includes(root),false);assert.equal(payload.includes('game.exe'),false);assert.equal(payload.includes('AppsFolder'),false);
 const xbox=await library.resolve(value.games.find(g=>g.provider==='Xbox').id);assert.equal(xbox.launch.aumid,'Game.Example_abc!Game');
});
test('rejects paths, forged IDs, removed installations, manifest traversal, and artwork outside a game directory',async t=>{
 const root=fixture(t),games=path.join(root,'Games');write(path.join(games,'Local/game.exe'));
 write(path.join(root,'outside.exe'));assert.equal(inside(games,'../outside.exe'),null);assert.equal(inside(games,path.join(root,'outside.exe')),null);
 const library=new GameLibrary({roots:()=>[games],catalog:async()=>({packages:[]})});
 const first=await library.list();const id=first.games[0].id;
 await assert.rejects(library.resolve('calc.exe'),e=>e.status===400);
 await assert.rejects(library.resolve('local:'+'0'.repeat(64)),e=>e.status===409);
 fs.rmSync(path.join(games,'Local/game.exe'));await assert.rejects(library.resolve(id),e=>e.status===409);
});
test('a local symlink cannot make a discovered manifest escape its install directory',t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'inside'));write(path.join(root,'outside.exe'));
 fs.symlinkSync(path.join(root,'outside.exe'),path.join(root,'inside/escape.exe'));
 assert.equal(inside(path.join(root,'inside'),'escape.exe'),null);
});
test('Steam and Xbox launch only host-discovered targets with shell disabled',async()=>{
 const calls=[];const launcher=new GameLaunchManager({systemRoot:'Windows',execute:(exe,args,options,done)=>{calls.push({exe,args,options});done(null);}});
 await launcher.launch({id:'steam:123',name:'Steam Game',provider:'Steam',launchable:true,launch:{type:'steam',exe:'Steam/steam.exe',appId:'123'}});
 await launcher.launch({id:'xbox:'+'a'.repeat(64),name:'Xbox Game',provider:'Xbox',launchable:true,launch:{type:'xbox',aumid:'Game.Example_abc!Game'}});
 assert.deepEqual(calls[0].args,['-applaunch','123']);assert.deepEqual(calls[1].args,['shell:AppsFolder\\Game.Example_abc!Game']);
 assert.equal(calls.every(c=>c.options.shell===false),true);
 await assert.rejects(launcher.launch({id:'steam:123',launchable:true,launch:{type:'steam',appId:'123 & calc.exe'}}),/Invalid Steam/);
 await assert.rejects(launcher.launch({id:'xbox:'+'a'.repeat(64),launchable:true,launch:{type:'xbox',aumid:'Game!App & calc.exe'}}),/Invalid Xbox/);
 assert.equal(calls.length,2);
});
test('standalone launch reports process start only after spawn and preserves host-owned working directory',async t=>{
 const root=fixture(t),exe=path.join(root,'game.exe');write(exe);let options,args;
 const launcher=new GameLaunchManager({spawnProcess:(file,a,o)=>{assert.equal(file,exe);options=o;args=a;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
 const result=await launcher.launch({id:'local:'+'b'.repeat(64),launchable:true,name:'Example',launch:{type:'local',exe,cwd:root}});
 assert.equal(result.state,'PROCESS_STARTED');assert.deepEqual(args,[]);assert.equal(options.cwd,root);assert.equal(options.shell,false);
});
test('host serializes game launch with stream preparation; resume does not launch the game twice',async t=>{
 const root=fixture(t),log=path.join(root,'stream.log');write(log);
 const id='steam:123',steps=[];
 const backend={paths:()=>({log}),status:async()=>{steps.push('backend');return {running:true,healthy:true,apps:[{name:'Desktop'}]};}};
 const library={resolve:async gameId=>{assert.equal(gameId,id);steps.push('resolve');return {id,name:'Example'};}};
 const launcher={launch:async()=>{steps.push('launch');return {name:'Example',state:'REQUESTED'};}};
 const manager=new SessionManager({backend,library,launcher});
 const lease=await manager.start({intent:'desktop',gameId:id},'legion');
 assert.deepEqual(steps,['resolve','backend','launch']);assert.equal(lease.target,'Desktop');assert.equal(lease.game.id,id);assert.equal(manager.snapshot().session.targetType,'game');
 await manager.start({intent:'desktop',gameId:id,resumeId:lease.id},'legion');assert.equal(steps.filter(x=>x==='launch').length,1);
 await assert.rejects(manager.start({intent:'desktop',gameId:'steam:456',resumeId:lease.id},'legion'),/already active/);
 await manager.end(lease.id,'legion');assert.equal(manager.state,'IDLE');
});
test('a stopped stream backend or removed device trust never starts a game',async t=>{
 const root=fixture(t),log=path.join(root,'stream.log');write(log);let launched=0,authorized=true;
 const backend={paths:()=>({log}),status:async()=>({running:false,apps:[{name:'Desktop'}]})};
 const library={resolve:async()=>({id:'steam:123',name:'Example'})},launcher={launch:async()=>{launched++;}};
 const manager=new SessionManager({backend,library,launcher});
 await assert.rejects(manager.start({intent:'desktop',gameId:'steam:123'},'legion'),/not ready/);assert.equal(launched,0);assert.equal(manager.state,'IDLE');
 library.resolve=async()=>{authorized=false;return {id:'steam:123'};};
 await assert.rejects(manager.start({intent:'desktop',gameId:'steam:123'},'legion',()=>authorized),e=>e.status===401);assert.equal(launched,0);assert.equal(manager.state,'IDLE');
});

test('Xbox manifest application ID overrides a missing game-config ID',async t=>{
 const root=fixture(t),game=path.join(root,'Game');
 write(path.join(game,'packages/bin/game.exe'));
 write(path.join(game,'MicrosoftGame.config'),'<Game><Identity Name="Publisher.Game"/><ShellVisuals DefaultDisplayName="Packaged Game"/><Executable Name="packages/bin/game.exe"/></Game>');
 write(path.join(game,'AppxManifest.xml'),'<Package><Application Id="packages.bin.game" Executable="GameLaunchHelper.exe"/></Package>');
 const library=new GameLibrary({roots:()=>[],catalog:async()=>({packages:[{Name:'Publisher.Game',PackageFamilyName:'Publisher.Game_xyz',InstallLocation:game}]})});
 const value=await library.list();assert.equal(value.games.length,1);assert.equal(value.games[0].launchable,true);assert.equal((await library.resolve(value.games[0].id)).launch.aumid,'Publisher.Game_xyz!packages.bin.game');
});

test('store artwork uses known Microsoft origins, is cached, and cannot supply arbitrary URLs or client launch paths',async t=>{
 const {StoreArtworkCache,imageURL}=require('../runtime/resources/app/control/game-artwork.cjs');
 const root=fixture(t),calls=[],storeId='9NDF1F263RZ4',record={storeId,artFile:'installed-art.png'};
 const cache=new StoreArtworkCache({dir:root,fetch:async url=>{calls.push(url);if(url.startsWith('https://displaycatalog.mp.microsoft.com/'))return Buffer.from(JSON.stringify({Product:{ProductId:storeId,LocalizedProperties:[{Images:[{ImagePurpose:'Poster',Uri:'//store-images.s-microsoft.com/cover'},{ImagePurpose:'SuperHeroArt',Uri:'https://store-images.s-microsoft.com/hero'}]}]}}));return Buffer.from([255,216,255,217]);}});
 const records=new Map([['game',record]]);await cache.prepare(records);assert.equal(calls.length,3);assert.ok(fs.existsSync(record.artFile));assert.ok(fs.existsSync(record.heroFile));
 await cache.prepare(records);assert.equal(calls.length,3);assert.equal(imageURL({Uri:'http://127.0.0.1/secret'},200,300),null);assert.equal(imageURL({Uri:'https://example.com/picture'},200,300),null);
});

test('offline store artwork keeps installed covers and limits retries',async t=>{
 const {StoreArtworkCache}=require('../runtime/resources/app/control/game-artwork.cjs');
 const root=fixture(t);let calls=0;const record={storeId:'9NDF1F263RZ4',artFile:'installed.png'};
 const cache=new StoreArtworkCache({dir:root,fetch:async()=>{calls++;throw Error('offline');}});const records=new Map([['game',record]]);
 await cache.prepare(records);await cache.prepare(records);assert.equal(record.artFile,'installed.png');assert.equal(calls,1);
});
test('host emulation profiles expose only opaque IDs and preserve the configured ROM and save directory',async t=>{
 const root=fixture(t),profile=path.join(root,'profiles.json');write(path.join(root,'emu/Ryujinx.exe'));write(path.join(root,'data/games/Zelda.nsp'));
 write(profile,JSON.stringify({games:[{name:'Zelda',provider:'Emulation',root,executable:'emu/Ryujinx.exe',rom:'data/games/Zelda.nsp',dataDirectory:'data'},{name:'Bad',provider:'Emulation',root,executable:'../bad.exe',rom:'data/games/Zelda.nsp',dataDirectory:'data'}]}));
 const library=new GameLibrary({catalog:async()=>({packages:[]}),roots:()=>[],profilesFile:profile});const list=await library.list();assert.equal(list.games.length,1);assert.equal(list.games[0].provider,'Emulation');assert.equal(JSON.stringify(list).includes(root),false);
 const record=await library.resolve(list.games[0].id);let args;
 const launcher=new GameLaunchManager({spawnProcess:(file,a)=>{args=a;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
 await launcher.launch(record);assert.deepEqual(args,['-r',path.join(root,'data'),'--fullscreen',path.join(root,'data/games/Zelda.nsp')]);
});
test('blocked Windows launches explain the compatibility setting instead of silently failing',async t=>{
 const root=fixture(t),exe=path.join(root,'game.exe');write(exe);
 const launcher=new GameLaunchManager({spawnProcess:()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('error',{code:'EACCES'}));return child;}});
 await assert.rejects(launcher.launch({id:'local:'+'c'.repeat(64),name:'Example',launchable:true,launch:{type:'local',exe,cwd:root}}),/administrator approval/);
});
test('local game launch uses normal user permissions and never invokes an elevation fallback',async t=>{
 const root=fixture(t),exe=path.join(root,'game.exe');write(exe);let options;let fallback=false;
 const launcher=new GameLaunchManager({platform:'win32',spawnProcess:(file,args,o)=>{options=o;const child=new EventEmitter();queueMicrotask(()=>child.emit('error',{code:'EACCES'}));return child;},execute:()=>{fallback=true;}});
 await assert.rejects(launcher.launch({id:'local:'+'d'.repeat(64),name:'Example',launchable:true,launch:{type:'local',exe,cwd:root}}),/administrator approval/);
 assert.equal(options.env.__COMPAT_LAYER,'RunAsInvoker');assert.equal(fallback,false);
});
test('Yuzu Early Access profiles retain their portable data and stable opaque game ID',async t=>{
 const root=fixture(t),profilesFile=path.join(root,'profiles.json');write(path.join(root,'yuzu_ea.exe'));write(path.join(root,'games/Zelda.nsp'));fs.mkdirSync(path.join(root,'user'));
 const id='local:'+'e'.repeat(64);write(profilesFile,JSON.stringify({games:[{id,name:'Zelda',provider:'Emulation',root,executable:'yuzu_ea.exe',rom:'games/Zelda.nsp',dataDirectory:'user'}]}));
 const library=new GameLibrary({profilesFile,catalog:async()=>({packages:[]}),roots:()=>[]});const list=await library.list();assert.equal(list.games[0].id,id);assert.equal(JSON.stringify(list).includes(root),false);assert.deepEqual((await library.resolve(id)).launch.args,['-f','-g',path.join(root,'games/Zelda.nsp')]);
 write(profilesFile,JSON.stringify({games:[{id,name:'Zelda',provider:'Emulation',root,executable:'yuzu_ea.exe',rom:'games/Zelda.nsp',dataDirectory:'games'}]}));await assert.rejects(library.resolve(id),/unavailable/);
});
