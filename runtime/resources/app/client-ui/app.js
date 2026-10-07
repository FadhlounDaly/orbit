'use strict';
const $=id=>document.getElementById(id);
let intent='desktop',current=null,busy=false,notice='';
const labels={UNKNOWN:'Finding Zeiron',DISCOVERING:'Finding Zeiron',HOST_FOUND:'Zeiron found',UNPAIRED:'Link required',
 PAIRING:'Linking',TRUSTED:'Trusted',READY:'Online',CONNECTING:'Connecting',STREAMING:'Connected',
 RECONNECTING:'Reconnecting',OFFLINE:'Offline',ERROR:'Needs attention'};
function render(s){
 current=s;$('status').textContent=labels[s.state]||'Checking';
 const active=['CONNECTING','STREAMING','RECONNECTING'].includes(s.state);
 $('connect').disabled=busy||s.state!=='READY';$('connect').textContent=active?labels[s.state]:'Connect';
 $('disconnect').hidden=!active;$('disconnect').disabled=busy;
 $('link').hidden=!['UNPAIRED','ERROR'].includes(s.state);$('link').disabled=busy||active;
 $('retry').hidden=active||s.state==='PAIRING';
 $('profile').disabled=active||busy;
 $('desktop').disabled=active||busy;$('steam').disabled=active||busy||!s.sessions.some(x=>x.id==='steam');
 if(intent==='steam'&&!s.sessions.some(x=>x.id==='steam'))intent='desktop';
 $('desktop').classList.toggle('selected',intent==='desktop');$('steam').classList.toggle('selected',intent==='steam');
 $('message').textContent=notice||s.reason||'';
 $('description').textContent=s.state==='READY'?'Online. Your '+(intent==='desktop'?'desktop':'Steam session')+' is ready.':
  s.state==='STREAMING'?'Your session is connected. Close it to return to Orbit.':
  s.state==='RECONNECTING'?'Orbit is restoring your connection.':
  s.state==='OFFLINE'?'Zeiron is offline. Orbit will check again.':
  s.state==='UNPAIRED'?'Link your Legion Go to Zeiron once, then connect whenever it is online.':
  s.state==='PAIRING'?'Orbit is establishing your trusted connection.':'Looking after your connection to Zeiron.';
}
async function refresh(){try{render(await window.orbit.getStatus());}catch(e){$('message').textContent=e.message;}}
async function action(fn){
 if(busy)return;busy=true;notice='';if(current)render(current);
 try{const result=await fn();if(result?.state)render(result);}
 catch(e){notice=e.message;$('message').textContent=notice;}
 finally{busy=false;if(current)render(current);}
}
$('connect').onclick=()=>action(()=>window.orbit.stream(intent));
$('disconnect').onclick=()=>action(()=>window.orbit.disconnect());
$('retry').onclick=refresh;
$('desktop').onclick=()=>{intent='desktop';if(current)render(current);};
$('steam').onclick=()=>{intent='steam';if(current)render(current);};
$('link').onclick=()=>{$('link-error').textContent='';$('link-dialog').showModal();$('code').focus();};
$('link-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else $('code').value='';});
$('cancel-link').onclick=()=>{$('code').value='';$('link-dialog').close();};
$('link-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;
 const code=$('code').value.trim();$('code').value='';$('confirm-link').disabled=true;$('cancel-link').disabled=true;
 await action(async()=>{try{const result=await window.orbit.link(code);$('link-dialog').close();return result;}catch(error){$('link-error').textContent=error.message;throw error;}});
 $('confirm-link').disabled=false;$('cancel-link').disabled=false;
};
$('profile').onchange=()=>action(()=>window.orbit.saveConfig({profile:$('profile').value}));
$('fullscreen').onclick=()=>window.orbit.fullscreen();
$('quit').onclick=()=>window.orbit.quit();
window.orbit.onState(s=>{notice='';render(s);});
window.orbit.info().then(i=>{$('profile').value=i.config.profile;refresh();}).catch(e=>{$('message').textContent=e.message;});
setInterval(refresh,8000);
const controls=()=>[...document.querySelectorAll(($('link-dialog').open?'dialog ':'')+'button:not(:disabled), '+($('link-dialog').open?'dialog ':'')+'select:not(:disabled)')].filter(n=>n.getClientRects().length);
function move(delta){
 const list=controls();if(!list.length)return;const i=list.indexOf(document.activeElement);
 list[(i+delta+list.length)%list.length].focus();
}
function back(){if($('link-dialog').open)$('cancel-link').click();}
document.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
 if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();move(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);}
 if(e.key==='Escape')back();
});
let old=[],lastMove=0;
function controller(time){
 const pad=navigator.getGamepads?.()?.find(p=>p?.mapping==='standard');
 $('controller').textContent=pad?'Controller connected':'No controller detected';
 if(pad){
  const b=pad.buttons.map(x=>x.pressed),edge=i=>b[i]&&!old[i];
  if(edge(0)){if(controls().includes(document.activeElement))document.activeElement.click();else if(!$('connect').disabled)$('connect').click();}
  if(edge(1))back();
  const d=b[12]||b[14]||pad.axes[0]<-.6||pad.axes[1]<-.6?-1:b[13]||b[15]||pad.axes[0]>.6||pad.axes[1]>.6?1:0;
  if(d&&time-lastMove>210){move(d);lastMove=time;}old=b;
 }else old=[];
 requestAnimationFrame(controller);
}requestAnimationFrame(controller);
