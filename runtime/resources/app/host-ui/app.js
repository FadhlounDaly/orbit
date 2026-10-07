'use strict';
const $=id=>document.getElementById(id);
let busy=false, pairing=false, steamDirty=false;
function notify(text){$('message').textContent=text;}
async function refresh(){
 try {
  const s=await window.orbitHost.status();
  $('pc').textContent=s.name;
  $('address').textContent=s.addresses.length?'Add '+s.addresses.join(' or ')+' on your handheld.':'Connect this PC to your local network.';
  $('badge').textContent=s.running?'Hosting active':s.installed?'Ready to host':'Setup required';
  $('start').disabled=busy||!s.installed||s.running;
  $('stop').disabled=busy||!s.running;
  $('steam').disabled=busy||s.running;$('save').disabled=busy||s.running;
  $('apps').replaceChildren(...(s.apps.length?s.apps:[{name:'Desktop'}]).map(a=>{const li=document.createElement('li');li.textContent=a.name;return li;}));
  if(!steamDirty || s.running)$('steam').checked=s.apps.some(a=>a.name==='Steam Big Picture');
  if(!pairing){
   const selected=$('request').value;
   $('request').replaceChildren(...(s.pairings.length?s.pairings:[{id:'',name:'No requests yet'}]).map(a=>{
    const option=document.createElement('option');option.value=a.id;option.textContent=a.name+(a.address?' · '+a.address:'');return option;
   }));
   if(s.pairings.some(p=>p.id===selected))$('request').value=selected;
   else if(selected){$('pin').value='';}
  }
  $('approve').disabled=busy||!s.running||!s.pairings.length;
  if(s.message)notify(s.message);
 } catch {notify('Orbit could not read host status.');}
}
async function run(fn,success){
 if(busy)return;busy=true;await refresh();
 try {await fn();notify(success);}
 catch(e){notify(e.message||'The action failed.');}
 finally{busy=false;await refresh();}
}
$('start').onclick=()=>run(()=>window.orbitHost.start(),'Hosting is ready. Select this PC on your Legion Go to pair.');
$('stop').onclick=()=>run(()=>window.orbitHost.stop(),'Hosting stopped.');
$('steam').onchange=()=>{steamDirty=true;};
$('request').onchange=()=>{$('pin').value='';};
$('save').onclick=()=>run(async()=>{await window.orbitHost.steam($('steam').checked);steamDirty=false;},'Shared apps saved. Start hosting to make them available.');
$('pair').onsubmit=event=>{
 event.preventDefault();if(busy)return;pairing=true;
 const input={id:$('request').value,pin:$('pin').value,name:$('name').value.trim()};
 run(()=>window.orbitHost.pair(input),'Paired. Return to Orbit on your handheld and try Desktop.').finally(()=>{pairing=false;$('pin').value='';refresh();});
};
$('diagnostics').onclick=()=>window.orbitHost.diagnostics();
refresh();setInterval(refresh,3000);
