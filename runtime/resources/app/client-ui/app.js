'use strict';
const $=id=>document.getElementById(id);
const ACTIVE=new Set(['CONNECTING','STREAMING','RECONNECTING']);
const labels={UNKNOWN:'Finding PC',DISCOVERING:'Finding PC',HOST_FOUND:'PC found',UNPAIRED:'Link required',PAIRING:'Linking',TRUSTED:'Linked',READY:'Online',CONNECTING:'Starting',STREAMING:'Playing',RECONNECTING:'Reconnecting',OFFLINE:'Offline',ERROR:'Needs attention'};
const profileLabels={balanced:'Balanced · 60 fps',smooth:'Smooth · 120 fps',sharp:'Sharp · 60 fps'};
let current=null,busy=false,refreshing=false,loadingLibrary=false,library=[],libraryError='',loaded=false,filter='games',selectedId=null,view='library',cardsSignature='',hostSignature='',lastToast='',toastTimer,oldButtons=[],lastMove=0,lastController='';
let selectedProfile='balanced';
const heroCache=new Map(),heroPending=new Set();
async function loadHero(game){
 if(heroCache.has(game.id)||heroPending.has(game.id)||!current?.trusted)return;
 heroPending.add(game.id);
 try{const value=await window.orbit.gameDetails(game.id);const art=typeof value.hero==='string'&&value.hero.length<=180000&&/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value.hero)?value.hero:null;heroCache.set(game.id,art);if(selectedId===game.id)renderFeature();}
 catch{heroCache.set(game.id,null);}
 finally{heroPending.delete(game.id);}
}
const setText=(id,value)=>{const text=String(value??'');if($(id).textContent!==text)$(id).textContent=text;};
const active=()=>ACTIVE.has(current?.state);
const selected=()=>library.find(g=>g.id===selectedId);
function toast(text){
 if(!text){$('message').hidden=true;lastToast='';return;}
 if(text===lastToast&&!$('message').hidden)return;
 lastToast=text;setText('message',text);$('message').hidden=false;clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>{$('message').hidden=true;lastToast='';},9000);
}
function filtered(){
 const query=$('search').value.trim().toLocaleLowerCase();
 return library.filter(g=>(filter==='apps'?g.kind==='app':g.kind!=='app')&&(filter==='xbox'?g.provider==='Xbox':filter==='steam'?g.provider==='Steam':true)&&(!query||g.name.toLocaleLowerCase().includes(query)));
}
function renderFeature(){
 const game=selected();
 setText('game-title',game?.name||'Pick your next adventure.');
 setText('hero-eyebrow',game?(game.provider.toUpperCase()+' · INSTALLED ON ZEIRON'):'FROM YOUR PC. TO YOUR HANDS.');
 setText('game-meta',game?.detail||(game?'Ready to play from Zeiron.':'Your games on Zeiron, ready for your Legion Go.'));
 const art=(game?heroCache.get(game.id):null)||game?.artwork||'';
 if(game)loadHero(game);
 if($('hero-art').dataset.art!==art){$('hero-art').dataset.art=art;if(art)$('hero-art').src=art;else $('hero-art').removeAttribute('src');$('hero-art').hidden=!art;}
 setText('play-label',active()?(current.state==='STREAMING'?'Playing on Legion Go':current.state==='RECONNECTING'?'Reconnecting…':'Starting your session…'):busy?'Starting…':game?.launchable===false?'Needs setup on Zeiron':'Play on Legion Go');
 $('play').disabled=busy||active()||current?.state!=='READY'||!game?.launchable;
 $('desktop').hidden=active();$('desktop').disabled=busy||current?.state!=='READY';
 $('disconnect').hidden=!active();$('disconnect').disabled=busy;
 for(const card of $('games').children){const yes=card.dataset.id===selectedId;card.classList.toggle('selected',yes);card.setAttribute('aria-pressed',String(yes));}
}
function renderCards(){
 const games=filtered(),signature=JSON.stringify(games);
 setText('game-count',games.length);
 if(!games.some(g=>g.id===selectedId))selectedId=games[0]?.id||null;
 if(signature!==cardsSignature){
  cardsSignature=signature;
  const focused=document.activeElement?.closest('.game-card')?.dataset.id,scroll=$('library-scroll').scrollLeft;
  const fragment=document.createDocumentFragment();
  for(const game of games){
   const card=document.createElement('button');card.className='game-card';card.dataset.id=game.id;card.setAttribute('aria-label',game.name+' · '+game.provider);card.setAttribute('aria-pressed','false');
   const cover=document.createElement('div');cover.className='cover';
   if(game.artwork){const img=document.createElement('img');img.src=game.artwork;img.alt='';img.draggable=false;img.loading='lazy';cover.append(img);}
   else{const mark=document.createElement('span');mark.className='cover-fallback';mark.textContent=game.name.split(/\s+/).filter(s=>/[a-z0-9]/i.test(s)).slice(0,2).map(s=>s[0]).join('').toUpperCase();cover.append(mark);const hue=[...game.id].reduce((n,c)=>n+c.charCodeAt(0),0)%360;cover.style.background='linear-gradient(145deg,hsl('+hue+' 22% 29%),hsl('+hue+' 18% 10%))';}
   const provider=document.createElement('span');provider.className='provider-mark';provider.textContent=game.provider.toUpperCase();cover.append(provider);
   const bottom=document.createElement('div');bottom.className='cover-bottom';
   const installed=document.createElement('span'),dot=document.createElement('i');dot.className='installed-dot';installed.append(dot,document.createTextNode(game.launchable?'Ready to play':'Needs host setup'));bottom.append(installed);cover.append(bottom);
   const name=document.createElement('strong');name.textContent=game.name;
   const detail=document.createElement('span');detail.className='card-detail';detail.textContent=game.kind==='app'?'PC app · Zeiron':'PC game · Zeiron';
   card.append(cover,name,detail);
   const choose=()=>{selectedId=game.id;renderFeature();};
   card.onclick=choose;card.onfocus=choose;card.ondblclick=()=>playSelected();
   fragment.append(card);
  }
  $('games').replaceChildren(fragment);
  if(focused){const card=[...$('games').children].find(c=>c.dataset.id===focused);card?.focus({preventScroll:true});}
  $('library-scroll').scrollLeft=scroll;
 }
 $('games').hidden=!games.length;$('empty').hidden=Boolean(games.length);
 if(!games.length){
  setText('empty-title',loadingLibrary?'Bringing your games over…':libraryError?'Your library is unavailable':loaded?'No games here yet.':'Your library is on its way.');
  setText('empty-description',libraryError||(loaded?$('search').value?'Try another title or clear your search.':filter==='apps'?'No PC apps found in this library.':'Install a game on Zeiron, then refresh your library.':'Link Zeiron to bring your installed PC games here.'));
 }
 $('link').hidden=Boolean(current?.trusted)||current?.state==='PAIRING';
 $('link').disabled=busy||active();$('retry').hidden=!libraryError;$('retry').disabled=loadingLibrary;
 renderFeature();
}
function renderHost(s){
 const info=s.trusted?s.hostInfo:null,system=info?.system,online=s.hostOnline&&s.state!=='OFFLINE',fresh=online&&info&&Date.now()-Date.parse(info.receivedAt)<30000;
 const gib=n=>Number.isFinite(n)?(n/1073741824).toFixed(1)+' GB':'—';
 const cpu=system?.cpu,memory=system?.memory,graphics=system?.hardware?.graphics||[];
 setText('pc-health',online?(s.state==='STREAMING'?'Playing on Zeiron':s.state==='READY'?'Ready to play':'Host needs attention'):'Zeiron offline');$('pc-health').classList.toggle('healthy',online&&s.state==='READY');
 setText('pc-updated',info?(fresh?'Live host information':'Last known host information'):'Link Zeiron to see your PC');
 setText('pc-cpu',cpu?.model||'Unavailable');setText('pc-cpu-detail',cpu?(cpu.logicalProcessors+' logical processors · '+(fresh&&Number.isFinite(cpu.utilizationPercent)?Math.round(cpu.utilizationPercent)+'% in use':'Usage unavailable')):'Waiting for Zeiron');
 setText('pc-memory',gib(memory?.totalBytes));setText('pc-memory-detail',memory?(fresh?gib(memory.usedBytes)+' in use':'Usage unavailable'):'Waiting for Zeiron');
 $('cpu-usage-bar').style.width=(fresh&&Number.isFinite(cpu?.utilizationPercent)?cpu.utilizationPercent:0)+'%';$('memory-usage-bar').style.width=(fresh&&memory?.totalBytes?Math.min(100,memory.usedBytes/memory.totalBytes*100):0)+'%';
 const primaryGpu=graphics.find(g=>/NVIDIA|Radeon|Arc\(/i.test(g.name))||graphics.find(g=>!/virtual|remote|basic display/i.test(g.name))||graphics[0];
 setText('pc-gpu',primaryGpu?.name||'Unavailable');setText('pc-gpu-detail',primaryGpu?'Driver '+(primaryGpu.driverVersion||'unavailable')+' · GPU usage unavailable':'Graphics details unavailable');
 setText('pc-latency',fresh?info.controlRoundTripMs+' ms · host response':'Unavailable');setText('pc-streaming',online?(info?.streaming?.healthy?'Ready':info?.streaming?.running?'Needs attention':'Stopped'):'Offline');
 const uptime=system?.uptimeSeconds;setText('pc-uptime',fresh&&Number.isFinite(uptime)?Math.floor(uptime/3600)+'h '+Math.floor(uptime%3600/60)+'m':'—');setText('pc-stream-profile',profileLabels[s.profile]||profileLabels.balanced);
}
function render(s){
 const old=current;current=s;renderHost(s);
 const gameSession=Boolean(s.session?.gameId||s.session?.game),sessionName=gameSession?(s.session?.game?.name||library.find(g=>g.id===s.session?.gameId)?.name||'Game'):(s.session?.intent==='steam'?'Steam Big Picture':'Desktop');
 $('stream-transition').hidden=!ACTIVE.has(s.state);$('stream-transition').dataset.mode=gameSession?'game':'desktop';setText('transition-title',sessionName);setText('transition-mode',gameSession?'GAME SESSION · FROM ZEIRON':'DESKTOP MODE · FROM ZEIRON');setText('transition-description',s.state==='RECONNECTING'?'Reconnecting to '+sessionName+'…':s.state==='STREAMING'?(gameSession?'Your game is ready. Enjoy.':sessionName+' is ready. You’re in control.'):(gameSession?'Opening '+sessionName+' on Zeiron…':'Opening '+sessionName+' and fitting it to your screen…'));
 setText('status',s.state==='STREAMING'&&!gameSession?sessionName+' active':labels[s.state]||'Checking');$('status-dot').className='status-dot '+(s.state==='READY'||s.state==='STREAMING'?'online':s.hostOnline?'attention':'');
 setText('connection-detail',s.trusted?(s.state==='READY'?'Linked to Zeiron. Ready to play.':s.reason||'Your device is linked to Zeiron.'):s.reason||'Link Zeiron once to play your PC games.');
 setText('pc-description',s.state==='READY'?'Linked, online, and ready when you are.':s.reason||'Your connected PC, within reach.');
 $('pc-desktop').disabled=busy||active()||s.state!=='READY';$('steam').disabled=busy||active()||s.state!=='READY'||!s.sessions?.some(x=>x.id==='steam');
 $('profile').disabled=busy||active();$('settings-link').disabled=busy||active();
 $('settings-discover').disabled=busy||active()||s.state==='PAIRING';$('discover').disabled=$('settings-discover').disabled;
 $('refresh-library').disabled=loadingLibrary||busy||s.state==='PAIRING';
 if(s.state==='PAIRING'&&s.pairing){setText('pair-code',s.pairing.code);setText('pair-wait','Waiting for approval in Orbit Host on Zeiron.');if(!$('link-dialog').open){$('settings-dialog').close();$('link-dialog').showModal();}}
 else if(s.state!=='PAIRING'){setText('pair-code','');if($('link-dialog').open)$('link-dialog').close();}
 const hosts=s.hosts||[],signature=JSON.stringify(hosts);
 if(signature!==hostSignature){hostSignature=signature;$('hosts').replaceChildren(...hosts.map(host=>{
  const row=document.createElement('div');row.className='host-row';const name=document.createElement('p');name.textContent='Zeiron · Online';
  const select=document.createElement('button');select.className='quiet-button';select.textContent='Select Zeiron';select.onclick=()=>action(async()=>{const next=await window.orbit.selectHost(host.id);render(next);if(next.state==='UNPAIRED')return startLink();return next;});row.append(name,select);return row;
 }));}
 for(const button of $('hosts').querySelectorAll('button'))button.disabled=busy||active()||s.state==='PAIRING';
 renderFeature();renderCards();
 if(s.reason&&s.state==='ERROR'&&(old?.state!==s.state||old?.reason!==s.reason))toast(s.reason);
 if(s.trusted&&(s.hostOnline||s.state==='READY')&&!loaded&&!loadingLibrary&&!libraryError)loadLibrary();
}
async function refresh(){
 if(refreshing||busy||current?.state==='PAIRING')return;refreshing=true;
 try{render(await window.orbit.getStatus());}catch(e){toast(e.message);}finally{refreshing=false;}
}
async function loadLibrary(force=false){
 if(loadingLibrary)return;loadingLibrary=true;libraryError='';renderCards();$('refresh-library').disabled=true;
 try{
  const value=await window.orbit.library(force);
  const valid=/^(?:steam:\d{1,12}|(?:xbox|local):[a-f0-9]{64})$/;
  library=(value.games||[]).filter(g=>typeof g.id==='string'&&valid.test(g.id)&&typeof g.name==='string').map(g=>({...g,name:g.name.slice(0,200),kind:g.kind==='app'?'app':'game',artwork:typeof g.artwork==='string'&&g.artwork.length<=24000&&/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(g.artwork)?g.artwork:null}));
  if(force)heroCache.clear();loaded=true;
  if(!selectedId){try{const recent=JSON.parse(localStorage.getItem('orbit-recent')||'[]');selectedId=recent.find(id=>library.some(g=>g.id===id&&g.kind==='game'))||null;}catch{}}
  renderCards();if(force)toast('Library updated from Zeiron.');
 }catch(e){libraryError=e.message;if(library.length)toast('Could not update your library. Showing the last loaded games.');}
 finally{loadingLibrary=false;renderCards();$('refresh-library').disabled=busy;}
}
async function action(fn){
 if(busy)return;busy=true;toast('');if(current)render(current);
 try{const result=await fn();if(result?.state)render(result);return result;}
 catch(e){toast(e.message);}finally{busy=false;if(current)render(current);}
}
async function playSelected(){
 const game=selected();if(!game||$('play').disabled)return;
 await action(async()=>{
  const result=await window.orbit.play(game.id);
  if(ACTIVE.has(result?.state)){try{const previous=JSON.parse(localStorage.getItem('orbit-recent')||'[]');localStorage.setItem('orbit-recent',JSON.stringify([game.id,...previous.filter(id=>id!==game.id)].slice(0,12)));}catch{}}
  return result;
 });
}
function startLink(){setText('pair-code','…');setText('pair-wait','Preparing your linking request…');$('settings-dialog').close();if(!$('link-dialog').open)$('link-dialog').showModal();return window.orbit.link();}
function cancelLink(){setText('pair-code','');$('link-dialog').close();window.orbit.cancelLink().catch(e=>toast(e.message));}
function switchView(next){view=next;$('library-view').hidden=next!=='library';$('pc-view').hidden=next!=='pc';for(const name of ['library','pc']){$('tab-'+name).classList.toggle('active',name===next);$('tab-'+name).setAttribute('aria-pressed',String(name===next));}}
function setFilter(next){filter=next;for(const name of ['games','xbox','steam','apps']){$('filter-'+name).classList.toggle('active',name===next);$('filter-'+name).setAttribute('aria-pressed',String(name===next));}renderCards();}
$('play').onclick=playSelected;$('desktop').onclick=()=>action(()=>window.orbit.stream('desktop'));$('pc-desktop').onclick=$('desktop').onclick;$('steam').onclick=()=>action(()=>window.orbit.stream('steam'));$('disconnect').onclick=()=>action(()=>window.orbit.disconnect());$('transition-cancel').onclick=$('disconnect').onclick;
$('tab-library').onclick=()=>switchView('library');$('tab-pc').onclick=()=>switchView('pc');
for(const name of ['games','xbox','steam','apps'])$('filter-'+name).onclick=()=>setFilter(name);
$('search').oninput=renderCards;$('refresh-library').onclick=()=>loadLibrary(true);$('retry').onclick=()=>loadLibrary(true);
$('link').onclick=()=>action(startLink);$('settings-link').onclick=$('link').onclick;$('cancel-link').onclick=cancelLink;
$('link-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelLink();});
$('quick-settings').onclick=()=>window.orbit.quickSettings().catch(e=>toast(e.message));
$('settings').onclick=()=>$('settings-dialog').showModal();$('host-settings').onclick=$('settings').onclick;$('close-settings').onclick=()=>$('settings-dialog').close();
$('discover').onclick=()=>action(()=>window.orbit.discoverHosts());$('settings-discover').onclick=()=>{$('settings-dialog').close();switchView('pc');$('discover').onclick();};
$('profile').onchange=()=>action(async()=>{const value=await window.orbit.saveConfig({profile:$('profile').value});selectedProfile=value.profile;setText('profile-summary',profileLabels[selectedProfile]);return value;});
$('fullscreen').onclick=()=>window.orbit.fullscreen();$('quit').onclick=()=>window.orbit.quit();
function visibleControls(){const scope=$('link-dialog').open?$('link-dialog'):$('settings-dialog').open?$('settings-dialog'):document;return [...scope.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(n=>n.getClientRects().length);}
function navigate(direction){
 const controls=visibleControls();if(!controls.length)return;
 const focused=document.activeElement,origin=focused.getBoundingClientRect();
 if(!controls.includes(focused)){const first=view==='library'?$('games').querySelector('button')||$('play'): $('pc-desktop');(first.disabled?controls[0]:first).focus();return;}
 const ox=origin.left+origin.width/2,oy=origin.top+origin.height/2,dx=direction==='left'?-1:direction==='right'?1:0,dy=direction==='up'?-1:direction==='down'?1:0;
 const candidates=controls.filter(n=>n!==focused).map(n=>{const r=n.getBoundingClientRect(),x=r.left+r.width/2-ox,y=r.top+r.height/2-oy;return {n,x,y,score:(dx?Math.abs(x)+Math.abs(y)*3:Math.abs(y)+Math.abs(x)*2)};}).filter(c=>dx?c.x*dx>8:c.y*dy>8).sort((a,b)=>a.score-b.score);
 const target=candidates[0]?.n;if(target){target.focus({preventScroll:true});if(target.classList.contains('game-card'))target.scrollIntoView({block:'nearest',inline:'nearest'});}
}
function back(){if($('link-dialog').open)return cancelLink();if($('settings-dialog').open)return $('settings-dialog').close();if($('search').value){$('search').value='';renderCards();return;}if(view==='pc')switchView('library');else $('games').querySelector('.selected')?.focus();}
function accept(){if(document.activeElement?.classList.contains('game-card'))return playSelected();if(visibleControls().includes(document.activeElement))document.activeElement.click();else if(!$('play').disabled)playSelected();}
document.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){if(e.key==='Escape'){e.target.blur();back();}return;}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();navigate(e.key.slice(5).toLowerCase());}
 if(e.key==='Enter'&&e.target.classList.contains('game-card')){e.preventDefault();playSelected();}
 if(e.key==='Escape'){e.preventDefault();back();}
});
function controller(time){
 const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.mapping==='standard'),label=pad?'Controller connected':'Touch & keyboard';if(label!==lastController){lastController=label;setText('controller',label);}
 if(pad){
  const b=pad.buttons.map(x=>x.pressed),edge=i=>b[i]&&!oldButtons[i];
  if(edge(0))accept();if(edge(1))back();
  if(edge(2)&&!$('settings-dialog').open&&!$('link-dialog').open){switchView('library');$('search').focus();}
  if(edge(3)&&!$('settings-dialog').open&&!$('link-dialog').open)loadLibrary(true);
  if(edge(9)&&!$('link-dialog').open){if($('settings-dialog').open)$('settings-dialog').close();window.orbit.quickSettings().catch(e=>toast(e.message));}
  if((edge(4)||edge(5))&&!$('settings-dialog').open&&!$('link-dialog').open)switchView(view==='library'?'pc':'library');
  const direction=b[12]||pad.axes[1]<-.6?'up':b[13]||pad.axes[1]>.6?'down':b[14]||pad.axes[0]<-.6?'left':b[15]||pad.axes[0]>.6?'right':null;
  if(direction&&time-lastMove>190){navigate(direction);lastMove=time;}oldButtons=b;
 }else oldButtons=[];
 requestAnimationFrame(controller);
}
function clock(){setText('clock',new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));}
window.orbit.onState(render);
window.orbit.info().then(async info=>{selectedProfile=info.config.profile;$('profile').value=selectedProfile;setText('profile-summary',profileLabels[selectedProfile]);await refresh();}).catch(e=>toast(e.message));
clock();setInterval(clock,30000);setInterval(refresh,15000);requestAnimationFrame(controller);
