'use strict';
const $=id=>document.getElementById(id);
let busy=false,steamDirty=false,deviceId=null,pendingId=null;
function notify(s){$('message').textContent=s;}
async function refresh(){
 try{
  const s=await window.orbitHost.status();
  $('pc').textContent='Zeiron';
  $('address').textContent=s.running?'Your Legion Go can find this PC on your home network.':'Start hosting to bring Zeiron online.';
  $('badge').textContent=s.running&&s.controlOnline?'Online':s.controlOnline?'Online · stream stopped':s.starting?'Starting':s.installed?'Ready to host':'Setup required';
  $('start').disabled=busy||s.running||s.starting||!s.installed;
  $('stop').disabled=busy||!s.running;
  $('steam').disabled=busy||s.running;$('save').disabled=busy||s.running;
  $('apps').replaceChildren(...(s.apps.length?s.apps:[{name:'Desktop'}]).map(a=>{const li=document.createElement('li');li.textContent=a.name;return li;}));
  if(!steamDirty||s.running)$('steam').checked=s.apps.some(a=>a.name==='Steam Big Picture');
  $('linked').textContent=s.linked?'Legion Go is linked. Connect from Orbit on your handheld.':'Link your Legion Go once. Future sessions start directly from Orbit.';
  const pending=s.pairingRequests?.[0];
  if(pendingId!==pending?.challenge){$('pair-input').value='';pendingId=pending?.challenge||null;}
  $('pair-form').hidden=!pending||pending.state!=='WAITING';
  $('pair-input').disabled=busy;$('approve-pair').disabled=busy||Boolean(s.hostSession?.session);$('dismiss-pair').disabled=busy;
  $('pair-device').textContent=pending?'Legion Go · '+pending.address:'';
  $('pair-status').textContent=pending?.state==='WAITING'?'Enter the four-digit code displayed on your Legion Go.':
   pending?.state==='APPROVED'?'Confirming your connection…':'On your Legion Go, discover Zeiron and select it to link.';
  const device=s.devices?.[0];deviceId=device?.id||null;
  $('revoke').hidden=!deviceId;$('revoke').disabled=busy||Boolean(s.hostSession?.session);
  $('device-details').textContent=device?.lastSeenAt?'Last seen: '+new Date(device.lastSeenAt).toLocaleString():'';
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
$('pair-form').onsubmit=e=>{
 e.preventDefault();if(busy||!pendingId)return;
 const code=$('pair-input').value;const challenge=pendingId;$('pair-input').value='';
 run(()=>window.orbitHost.pair({challenge,code}),'Confirming the Legion Go’s connection…');
};
$('dismiss-pair').onclick=()=>{if(pendingId)run(()=>window.orbitHost.dismissPairing(pendingId),'Linking request dismissed.');};
$('revoke').onclick=()=>{
 if(deviceId&&window.confirm('Remove the Legion Go’s Orbit trust? It will need to link again. Streaming-engine pairing is preserved.'))
  run(()=>window.orbitHost.revoke(deviceId),'Legion Go trust removed.');
};
$('diagnostics').onclick=()=>window.orbitHost.diagnostics();
refresh();setInterval(refresh,1000);
