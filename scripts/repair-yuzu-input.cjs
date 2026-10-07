'use strict';
// Run locally on Zeiron with Yuzu closed. No handheld-provided paths or commands.
const fs=require('node:fs'),path=require('node:path');
const {profile}=require('../runtime/resources/app/control/yuzu-input.cjs');
const {WindowsGameProcesses}=require('../runtime/resources/app/control/game-process.cjs');
const {GameLibrary}=require('../runtime/resources/app/control/game-library.cjs');
(async()=>{
 if(process.platform!=='win32')throw Error('Run this repair on Zeiron');
 const root=path.resolve(__dirname,'..'),library=new GameLibrary({profilesFile:path.join(root,'data/host/library-profiles.json')});
 const mode=process.argv.includes('--keyboard')?'keyboard':'controller';
 const running=await new WindowsGameProcesses().list();
 await library.refresh(true);
 for(const record of library.records.values()){
  if(!/^yuzu(?:_ea|_preview)?\.exe$/i.test(path.basename(record.launch.exe||'')))continue;
  if(running.some(p=>p.exe.toLowerCase()===record.launch.exe.toLowerCase()))throw Error('Close Yuzu before applying its input profile');
  const file=path.join(record.launch.cwd,'user/config/qt-config.ini');let text=fs.readFileSync(file,'utf8');
  fs.copyFileSync(file,file+'.orbit-input-backup-'+Date.now());
  text=profile(text,mode);
  fs.writeFileSync(file,text);console.log('Applied '+mode+' input to '+record.name);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
