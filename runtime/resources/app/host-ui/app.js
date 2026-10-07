'use strict';
const $=id=>document.getElementById(id);
let busy=false,steamDirty=false,timer,linkedBefore=false;
function notify(s){$('message').textContent=s;}
async function refresh(){
 try{
  const s=await window.orbitHost.status();
  $('pc').textContent='Zeiron';
  $('address').textContent=s.running?'Your Legion Go can find this PC on your home network.':'Start hosting to bring Zeiron online.';
  $('badge').textContent=s.running&&s.controlOnline?'Online':s.starting?'Starting':s.installed?'Ready to host':'Setup required';
  $('start').disabled=busy||s.running||s.starting||!s.installed;
  $('stop').disabled=busy||!s.running;
  $('steam').disabled=busy||s.running;$('save').disabled=busy||s.running;
  $('apps').replaceChildren(...(s.apps.length?s.apps:[{name:'Desktop'}]).map(a=>{const li=document.createElement('li');li.textContent=a.name;return li;}));
  if(!steamDirty||s.running)$('steam').checked=s.apps.some(a=>a.name==='Steam Big Picture');
  $('invite').disabled=busy||!s.controlOnline;
  $('linked').textContent=s.linked?'Legion Go is linked. Connect from Orbit on your handheld.':'Link your Legion Go once. Future sessions start directly from Orbit.';
  if(s.linked&&!linkedBefore&&!$('invitation').hidden){$('link-code').value='';$('invitation').hidden=true;}
  linkedBefore=s.linked;
  if(s.message)notify(s.message);
 }catch{notify('Orbit could not read host status.');}
}
async function run(fn,success){
 if(busy)return;busy=true;await refresh();
 try{await fn();notify(success);}catch(e){notify(e.message);}
 finally{busy=false;await refresh();}
}
$('start').onclick=()=>run(()=>window.orbitHost.start(),'Zeiron is online.');
$('stop').onclick=()=>run(()=>window.orbitHost.stop(),'Hosting stopped.');
$('steam').onchange=()=>{steamDirty=true;};
$('save').onclick=()=>run(async()=>{await window.orbitHost.steam($('steam').checked);steamDirty=false;},'Session choices saved.');
$('invite').onclick=()=>run(async()=>{
 const value=await window.orbitHost.link();
 $('link-code').value=value.code;$('invitation').hidden=false;
 clearTimeout(timer);timer=setTimeout(()=>{$('link-code').value='';$('invitation').hidden=true;},Math.max(0,value.expires-Date.now()));
},'Paste the Orbit code on your Legion Go.');
$('diagnostics').onclick=()=>window.orbitHost.diagnostics();
refresh();setInterval(refresh,3000);
