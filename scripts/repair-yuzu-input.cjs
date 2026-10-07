'use strict';
// Run locally on Zeiron with Yuzu closed. No handheld-provided paths or commands.
const fs=require('node:fs'),path=require('node:path');
const {GameLibrary}=require('../runtime/resources/app/control/game-library.cjs');
(async()=>{
 if(process.platform!=='win32')throw Error('Run this repair on Zeiron');
 const root=path.resolve(__dirname,'..'),library=new GameLibrary({profilesFile:path.join(root,'data/host/library-profiles.json')});
 await library.refresh(true);
 for(const record of library.records.values()){
  if(!/^yuzu(?:_ea|_preview)?\.exe$/i.test(path.basename(record.launch.exe||'')))continue;
  const file=path.join(record.launch.cwd,'user/config/qt-config.ini');let text=fs.readFileSync(file,'utf8');
  fs.copyFileSync(file,file+'.orbit-input-backup-'+Date.now());
  // SDL2's Windows XInput raw joystick layout, not SDL game-controller enum values.
  const base='engine:sdl,guid:030000005e0400008e02000000007200,port:0,pad:0';
  const mappings={a:'button:1',b:'button:0',x:'button:3',y:'button:2',lstick:'button:8',rstick:'button:9',l:'button:4',r:'button:5',plus:'button:7',minus:'button:6',dup:'hat:0,direction:up',ddown:'hat:0,direction:down',dleft:'hat:0,direction:left',dright:'hat:0,direction:right'};
  for(const [name,value] of Object.entries(mappings)){
   text=text.replace(new RegExp('^player_0_button_'+name+'=.*$','m'),'player_0_button_'+name+'="'+base+','+value+'"');
   text=text.replace(new RegExp('^player_0_button_'+name+'\\\\default=.*$','m'),'player_0_button_'+name+'\\default=false');
  }
  fs.writeFileSync(file,text);console.log('Repaired controller bindings for '+record.name);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
