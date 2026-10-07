'use strict';
const icons = {
  gamepad: '<svg viewBox="0 0 24 24"><path d="M7 7h10c2 0 3 2 3.5 4l1 6c.4 2-1.5 3-3 1l-2-2h-9l-2 2c-1.5 2-3.4 1-3-1l1-6C4 9 5 7 7 7Z"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="16" cy="11" r=".5"/><circle cx="18" cy="14" r=".5"/></svg>',
  desktop: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8M12 16v5"/></svg>',
  tools: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17.5h7M17.5 14v7"/></svg>',
  controller: '<svg viewBox="0 0 24 24"><path d="M7 7h10c2 0 3 2 3.5 4l1 6c.4 2-1.5 3-3 1l-2-2h-9l-2 2c-1.5 2-3.4 1-3-1l1-6C4 9 5 7 7 7Z"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="17" cy="12" r="1"/></svg>'
};
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icons[node.dataset.icon] || ''; });
const dialog = document.getElementById('dialog');
const state = { view: 'home', host: null, profile: 'balanced' };
try { state.profile = localStorage.getItem('orbit-profile') || 'balanced'; } catch {}
const profiles = {
  balanced: { name: 'Balanced', details: '1920 × 1200 · 60 fps', note: 'A steady starting point for your handheld.' },
  smooth: { name: 'Smooth', details: '1920 × 1200 · 120 fps', note: 'For fast games, after a network stability check.' },
  sharp: { name: 'Sharp', details: '2560 × 1600 · 60 fps', note: 'More detail when the device and connection support it.' }
};
if (!profiles[state.profile]) state.profile = 'balanced';
function escapeText(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function updateProfile() {
  document.getElementById('profile-name').textContent = profiles[state.profile].name;
  document.getElementById('profile-description').textContent = profiles[state.profile].details;
}
function setView(view, focus = false) {
  if (!['home', 'play', 'desktop'].includes(view)) return;
  state.view = view;
  document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== 'view-' + view; });
  document.querySelectorAll('.nav-button').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  history.replaceState(null, '', '#' + view);
  if (focus) document.querySelector('#view-' + view + ' button')?.focus();
}
let lastFocused;
function showDialog(title, content, eyebrow = 'ORBIT') {
  lastFocused = document.activeElement;
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-eyebrow').textContent = eyebrow;
  document.getElementById('dialog-content').innerHTML = content;
  if (!dialog.open) dialog.showModal();
}
function closeDialog() { if (dialog.open) dialog.close(); }
dialog.addEventListener('close', () => lastFocused?.focus());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
function connectDialog() {
  const host = escapeText(state.host?.name || 'your gaming PC');
  showDialog('Bring your Legion Go aboard.', `<p>Orbit is running locally on ${host}. Your handheld streaming connection is the next step.</p><ol><li>Enable hosting in <strong>Razer Cortex → Remote Play</strong> on this PC.</li><li>Install <strong>Moonlight</strong> on your Legion Go and connect both devices to the same home network.</li><li>Add <strong>${host}</strong> in Moonlight, then approve its pairing PIN on this PC.</li><li>Test Desktop, audio and controls before we connect Orbit’s launch buttons to your streaming session.</li></ol><div class="notice">This first version of Orbit is accessible on this PC. The Legion Go launcher and LAN connection still need to be configured.</div><div class="dialog-action-row"><button class="secondary-button" data-action="close">Got it</button><button class="primary-button" data-action="refresh">Check PC status</button></div>`, 'CONNECTION SETUP');
}
function settingsDialog() {
  showDialog('Make it feel like yours.', `<p>Choose a starting profile for the Legion Go. These are saved preferences; streaming settings will be applied when we configure the connection.</p><div class="profile-options">${Object.entries(profiles).map(([id, profile]) => `<button class="profile-option ${state.profile === id ? 'selected' : ''}" data-profile="${id}" aria-pressed="${state.profile === id}"><span><strong>${profile.name}</strong><small>${profile.details}</small></span><span class="profile-check">${state.profile === id ? '✓' : ''}</span></button>`).join('')}</div><p class="small-note">Resolution choices assume the original Legion Go. We’ll match the final profile to your actual model.</p><div class="dialog-action-row"><button class="secondary-button" data-action="fullscreen">${document.fullscreenElement ? 'Leave fullscreen' : 'Enter fullscreen'}</button><button class="primary-button" data-action="close">Done</button></div>`, 'PREFERENCES');
}
let toastTimer;
function toast(message) { const node = document.getElementById('toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 3300); }
async function refresh(silent = false) {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Host unavailable');
    state.host = await response.json();
    document.getElementById('host-label').textContent = 'PC available';
    document.getElementById('host-badge').classList.add('available');
    document.getElementById('pc-name').textContent = state.host.name;
    document.getElementById('gpu-name').textContent = state.host.gpu || 'Hardware information unavailable';
    document.getElementById('orbit-link').textContent = 'Available';
    document.getElementById('stream-host').textContent = state.host.razerRunning ? 'Razer detected' : 'Not running';
    const library = Array.isArray(state.host.library) ? state.host.library : [];
    document.getElementById('library-count').textContent = `${library.length} installed ${library.length === 1 ? 'title' : 'titles'} · ${state.host.name}`;
    document.getElementById('library-empty').hidden = library.length > 0;
    document.getElementById('library-grid').innerHTML = library.map((item, index) => `<button class="library-card focusable" data-title="${escapeText(item.id)}"><div class="library-cover cover-${index % 3}">${icons.gamepad}</div><div class="library-caption"><h2>${escapeText(item.name)}</h2><span>Steam · Installed on your PC</span></div></button>`).join('');
    if (!silent) toast('PC status and library refreshed');
  } catch {
    state.host = null;
    document.getElementById('host-label').textContent = 'PC unavailable';
    document.getElementById('host-badge').classList.remove('available');
    document.getElementById('orbit-link').textContent = 'Unavailable';
    document.getElementById('stream-host').textContent = 'Not checked';
    document.getElementById('gpu-name').textContent = 'Start Orbit to check this PC';
    document.getElementById('library-count').textContent = 'Host connection required';
    document.getElementById('library-grid').replaceChildren();
    document.getElementById('library-empty').hidden = false;
    if (!silent) toast('The local Orbit service is unavailable. Reopen Orbit to reconnect.');
  }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) { setView(button.dataset.view); return; }
  if (button.dataset.profile && profiles[button.dataset.profile]) {
    state.profile = button.dataset.profile;
    try { localStorage.setItem('orbit-profile', state.profile); } catch { toast('Preference selected for this session'); }
    updateProfile();
    document.querySelectorAll('.profile-option').forEach(option => {
      const active = option.dataset.profile === state.profile;
      option.classList.toggle('selected', active); option.setAttribute('aria-pressed', String(active)); option.querySelector('.profile-check').textContent = active ? '✓' : '';
    });
    return;
  }
  if (button.dataset.title) {
    const title = state.host?.library?.find(item => item.id === button.dataset.title);
    if (title) showDialog(title.name, `<p>This title is installed in Steam on ${escapeText(state.host.name)}.</p><div class="notice">Pair your Legion Go before launching streamed titles. No game has been started.</div><div class="dialog-action-row"><button class="secondary-button" data-action="close">Back to library</button><button class="primary-button" data-action="connect">Set up streaming</button></div>`, 'YOUR LIBRARY');
    return;
  }
  switch (button.dataset.action) {
    case 'connect': connectDialog(); break;
    case 'close': closeDialog(); break;
    case 'settings': settingsDialog(); break;
    case 'refresh': await refresh(); break;
    case 'fullscreen': try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); closeDialog(); } catch { toast('Fullscreen is unavailable in this browser'); } break;
    case 'tools': showDialog('Room for what comes next.', '<p>This is where we’ll add the PC tools you choose for Orbit.</p><div class="tools-list"><span>Apps</span><span>Media</span><span>Custom controls</span></div><div class="notice">These are planned categories, not connected features yet.</div><button class="secondary-button" data-action="close">Back home</button>', 'YOUR TOOLS'); break;
  }
});
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); setView('home'); });
function visibleControls() {
  const container = dialog.open ? dialog : document;
  return [...container.querySelectorAll('button:not(:disabled),a[href]')].filter(node => node.getClientRects().length > 0);
}
function moveFocus(direction, gamepad = false) {
  const controls = visibleControls();
  if (!controls.length) return;
  const current = controls.includes(document.activeElement) ? document.activeElement : null;
  let target;
  if (!current) target = dialog.open ? controls[0] : document.querySelector('#view-' + state.view + ' button') || controls[0];
  else {
    const rect = current.getBoundingClientRect(), origin = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const horizontal = direction === 'left' || direction === 'right', sign = direction === 'left' || direction === 'up' ? -1 : 1;
    let best = Infinity;
    for (const candidate of controls) {
      if (candidate === current) continue;
      const r = candidate.getBoundingClientRect(), dx = r.x + r.width / 2 - origin.x, dy = r.y + r.height / 2 - origin.y;
      const primary = horizontal ? dx : dy, cross = horizontal ? dy : dx;
      if (primary * sign <= 4) continue;
      const score = Math.abs(primary) + Math.abs(cross) * 2.2;
      if (score < best) { best = score; target = candidate; }
    }
  }
  if (target) { document.querySelectorAll('.gamepad-focus').forEach(node => node.classList.remove('gamepad-focus')); target.focus(); target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (gamepad) target.classList.add('gamepad-focus'); }
}
function back() { if (dialog.open) closeDialog(); else setView('home', true); }
function nextTab(delta) { if (dialog.open) return; const views = ['home', 'play', 'desktop']; setView(views[(views.indexOf(state.view) + delta + views.length) % views.length], true); }
document.addEventListener('keydown', event => {
  const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (directions[event.key]) { event.preventDefault(); moveFocus(directions[event.key]); }
  if (event.key === 'Escape' && !dialog.open) back();
});
let oldButtons = [], lastMove = 0, controllerSeen = false;
function pollController(time) {
  const pad = navigator.getGamepads?.()?.find?.(pad => pad && pad.mapping === 'standard');
  if (pad) {
    if (!controllerSeen) { document.getElementById('controller-status').textContent = 'Controller connected'; controllerSeen = true; }
    const pressed = pad.buttons.map(button => button.pressed);
    const edge = id => pressed[id] && !oldButtons[id];
    if (edge(0)) { if (!visibleControls().includes(document.activeElement)) moveFocus('down', true); else document.activeElement.click(); }
    if (edge(1)) back();
    if (edge(4)) nextTab(-1);
    if (edge(5)) nextTab(1);
    const direction = pressed[12] || pad.axes[1] < -.6 ? 'up' : pressed[13] || pad.axes[1] > .6 ? 'down' : pressed[14] || pad.axes[0] < -.6 ? 'left' : pressed[15] || pad.axes[0] > .6 ? 'right' : null;
    if (direction && time - lastMove > 210) { moveFocus(direction, true); lastMove = time; }
    oldButtons = pressed;
  } else if (controllerSeen) { controllerSeen = false; oldButtons = []; document.getElementById('controller-status').textContent = 'Controller disconnected'; }
  requestAnimationFrame(pollController);
}
function updateClock() { document.getElementById('clock').textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
updateClock(); setInterval(updateClock, 1000); updateProfile(); setView(location.hash.slice(1) || 'home'); refresh(true); setInterval(() => refresh(true), 30000); requestAnimationFrame(pollController);
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  for (const tool of [
    { name: 'orbit_read_status', description: 'Read Orbit’s actual local PC and library state. Does not claim a streaming connection.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: async input => { if (!input || Object.keys(input).length) throw new Error('Expected an empty object'); await refresh(true); return { host: state.host, view: state.view, profile: state.profile }; } },
    { name: 'orbit_navigate', description: 'Navigate to Home, Play or Desktop in Orbit.', inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['home', 'play', 'desktop'] } }, required: ['view'], additionalProperties: false }, execute: input => { if (!input || Object.keys(input).length !== 1 || !['home','play','desktop'].includes(input.view)) throw new Error('Invalid view'); setView(input.view); return { view: state.view }; } }
  ]) { try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} }
  addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
