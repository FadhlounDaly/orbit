'use strict';
// Yuzu EA portable profiles. The emulator must be closed before applying these.
const BASE='engine:sdl,guid:030000005e0400008e02000000007200,port:0,pad:0';
const BUTTONS={a:1,b:0,x:3,y:2,lstick:8,rstick:9,l:4,r:5,plus:7,minus:6};
const KEYS={a:67,b:88,x:86,y:90,lstick:70,rstick:71,l:81,r:69,zl:82,zr:84,plus:77,minus:78,dleft:37,dup:38,dright:39,ddown:40};
function profile(text,mode='controller'){
 if(!['controller','keyboard'].includes(mode))throw Error('Choose controller or keyboard input');
 const newline=text.includes('\r\n')?'\r\n':'\n';let rows=text.replace(/\r\n/g,'\n').split('\n');
 function set(key,value){const at=rows.indexOf('[Controls]');if(at<0)throw Error('Yuzu Controls section is missing');let end=rows.findIndex((r,i)=>i>at&&/^\[/.test(r));if(end<0)end=rows.length;let i=rows.findIndex((r,i)=>i>at&&i<end&&r.startsWith(key+'='));if(i<0)rows.splice(end,0,key+'='+value);else rows[i]=key+'='+value;}
 function setting(key,value){set(key+'\\default','false');set(key,value);}
 setting('player_0_type','0');setting('player_0_connected','true');
 for(const [key,button] of Object.entries(BUTTONS))setting('player_0_button_'+key,'"'+(mode==='controller'?BASE+',button:'+button:'engine:keyboard,code:'+KEYS[key])+'"');
 for(const [key,direction] of Object.entries({dup:'up',ddown:'down',dleft:'left',dright:'right'}))setting('player_0_button_'+key,'"'+(mode==='controller'?BASE+',hat:0,direction:'+direction:'engine:keyboard,code:'+KEYS[key])+'"');
 for(const [key,axis] of Object.entries({zl:4,zr:5}))setting('player_0_button_'+key,'"'+(mode==='controller'?BASE+',axis:'+axis+',threshold:0.5,invert:+':'engine:keyboard,code:'+KEYS[key])+'"');
 const analog=(up,down,left,right)=>'engine:analog_from_button,modifier:engine$0keyboard$1code$016,left:engine$0keyboard$1code$0'+left+',up:engine$0keyboard$1code$0'+up+',right:engine$0keyboard$1code$0'+right+',down:engine$0keyboard$1code$0'+down+',modifier_scale:0.5';
 setting('player_0_lstick','"'+(mode==='controller'?BASE+',axis_x:0,axis_y:1,deadzone:0.1,range:1':analog(87,83,65,68))+'"');
 setting('player_0_rstick','"'+(mode==='controller'?BASE+',axis_x:2,axis_y:3,deadzone:0.1,range:1':analog(73,75,74,76))+'"');
 return rows.join(newline);
}
module.exports={profile};
