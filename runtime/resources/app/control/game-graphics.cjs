'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const KEYS=['iSize W','iSize H','bFull Screen','bBorderless','iLocation X','iLocation Y'];
function displaySection(text){const start=/^\[Display\][ \t]*(?:\r?\n|$)/im.exec(text);if(!start)throw Error('Skyrim display settings are missing');const offset=start.index+start[0].length;const next=/^\[/m.exec(text.slice(offset));return {start:offset,end:next?offset+next.index:text.length};}
function values(text){const section=displaySection(text),rows=text.slice(section.start,section.end).split(/\r?\n/),result={};for(const key of KEYS){const row=rows.find(r=>r.split('=')[0].trim().toLowerCase()===key.toLowerCase());result[key]=row===undefined?null:row.slice(row.indexOf('=')+1).trim();}return result;}
function patch(text,changes){const section=displaySection(text),newline=text.includes('\r\n')?'\r\n':'\n';let rows=text.slice(section.start,section.end).split(/\r?\n/);for(const [key,value] of Object.entries(changes)){const index=rows.findIndex(r=>r.split('=')[0].trim().toLowerCase()===key.toLowerCase());if(value===null){if(index>=0)rows.splice(index,1);}else if(index>=0)rows[index]=key+'='+value;else rows.splice(Math.max(1,rows.length-1),0,key+'='+value);}return text.slice(0,section.start)+rows.join(newline)+text.slice(section.end);}
class GameGraphics{
 constructor({skyrimPrefs=path.join(os.homedir(),'Documents/My Games/Skyrim Special Edition/SkyrimPrefs.ini')}={}){this.skyrimPrefs=path.resolve(skyrimPrefs);}
 snapshot(record,mode){
  if(record?.launch?.type!=='local'||!/^SkyrimSE\.exe$/i.test(path.basename(record.launch.exe)))return null;
  if(!fs.existsSync(this.skyrimPrefs))throw Error('Open Skyrim once on Zeiron to create its display settings');
  if(!Number.isInteger(mode?.width)||!Number.isInteger(mode?.height)||mode.width<640||mode.width>7680||mode.height<480||mode.height>4320)throw Error('Skyrim needs a valid session display mode');
  if(fs.statSync(this.skyrimPrefs).size>1024*1024)throw Error('Skyrim settings are too large');
  return {version:1,type:'skyrim',file:this.skyrimPrefs,previous:values(fs.readFileSync(this.skyrimPrefs,'utf8')),applied:{'iSize W':String(mode.width),'iSize H':String(mode.height),'bFull Screen':'0',bBorderless:'1','iLocation X':'0','iLocation Y':'0'}};
 }
 validate(record){if(record?.version!==1||record.type!=='skyrim'||record.file!==this.skyrimPrefs||!record.previous||!record.applied||Object.keys(record.previous).some(k=>!KEYS.includes(k))||Object.keys(record.applied).some(k=>!KEYS.includes(k)))throw Error('Unsupported game settings restoration record');}
 write(text){const temp=this.skyrimPrefs+'.orbit.tmp';fs.writeFileSync(temp,text);fs.renameSync(temp,this.skyrimPrefs);}
 prepare(record){if(!record)return;this.validate(record);this.write(patch(fs.readFileSync(this.skyrimPrefs,'utf8'),record.applied));}
 restore(record){if(!record)return;this.validate(record);const text=fs.readFileSync(this.skyrimPrefs,'utf8'),current=values(text),changes={};for(const key of KEYS){if(current[key]===record.applied[key])changes[key]=record.previous[key];}if(Object.keys(changes).length)this.write(patch(text,changes));}
}
module.exports={GameGraphics,values,patch};
