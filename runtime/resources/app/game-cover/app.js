'use strict';
const params=new URLSearchParams(location.search),desktop=params.get('mode')==='desktop';document.body.dataset.mode=desktop?'desktop':'game';document.getElementById('mode').textContent=desktop?'DESKTOP MODE':'GAME SESSION';document.getElementById('name').textContent=params.get('name')||'Desktop';document.getElementById('hint').textContent=desktop?'Opening your desktop. Fitting it to your handheld screen.':'Return to your library with the Orbit menu on your handheld.';
document.title="Orbit · "+(params.get("name")||"Desktop");
