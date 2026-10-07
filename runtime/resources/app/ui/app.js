'use strict';
const icons = {
  gamepad: '<svg viewBox="0 0 24 24"><path d="M7 7h10c2 0 3 2 3.5 4l1 6c.4 2-1.5 3-3 1l-2-2h-9l-2 2c-1.5 2-3.4 1-3-1l1-6C4 9 5 7 7 7Z"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="16" cy="11" r=".5"/><circle cx="18" cy="14" r=".5"/></svg>',
  desktop: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8M12 16v5"/></svg>',
  tools: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17.5h7M17.5 14v7"/></svg>',
  controller: '<svg viewBox="0 0 24 24"><path d="M7 7h10c2 0 3 2 3.5 4l1 6c.4 2-1.5 3-3 1l-2-2h-9l-2 2c-1.5 2-3.4 1-3-1l1-6C4 9 5 7 7 7Z"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="17" cy="12" r="1"/></svg>'
};
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icons[node.dataset.icon] || ''; });
const dialog = document.getElementById('dialog');
const state = { view: 'home', host: null, profile: 'balanced', simulator: false, config: null };
let simPad = null;
let nativeReady;
let lastLauncherFocus = null;
document.addEventListener('focusin', event => { if (event.target.closest('.app-shell,dialog,#simulated-stream')) lastLauncherFocus = event.target; });
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
dialog.addEventListener('close', () => { if (!document.getElementById('simulated-stream').hidden) document.querySelector('[data-action="return-stream"]').focus(); else if (document.activeElement === document.body || dialog.contains(document.activeElement)) lastFocused?.focus(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
function connectDialog() {
  const host = escapeText(state.config?.host || 'Set up your PC');
  showDialog('Connect your gaming PC.', `<p>Use the PC name or its local IPv4 address. Pair once in the bundled Moonlight client.</p><label class="host-input-label" for="host-input">PC name or local IP</label><input id="host-input" value="${host}" autocomplete="off" spellcheck="false"><div class="notice">${state.simulator ? 'Simulator mode uses sample host states. Pairing and streaming never contact a PC.' : 'Both devices should be on the same home network. Open Orbit Host on your PC and select Start hosting.'}</div><div class="dialog-action-row"><button class="secondary-button" data-action="save-host">Save PC</button><button class="primary-button" data-action="moonlight">Open Moonlight to pair</button></div><button class="text-button" data-action="refresh">Refresh paired library</button>`, 'PC CONNECTION');
}
function settingsDialog() {
  showDialog('Make it feel like yours.', `<p>Choose a starting profile for the Legion Go. Orbit passes the selected resolution, frame rate and bitrate to Moonlight when you launch a stream.</p><div class="profile-options">${Object.entries(profiles).map(([id, profile]) => `<button class="profile-option ${state.profile === id ? 'selected' : ''}" data-profile="${id}" aria-pressed="${state.profile === id}"><span><strong>${profile.name}</strong><small>${profile.details}</small></span><span class="profile-check">${state.profile === id ? '✓' : ''}</span></button>`).join('')}</div><p class="small-note">Resolution choices assume the original Legion Go. We’ll match the final profile to your actual model.</p><div class="dialog-action-row"><button class="secondary-button" data-action="fullscreen">Toggle fullscreen</button><button class="primary-button" data-action="close">Done</button></div><button class="text-button" data-action="quit">Exit Orbit</button>`, 'PREFERENCES');
}
let toastTimer;
function toast(message) { const node = document.getElementById('toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 3300); }
async function refresh(silent = false) {
  try {
    await nativeReady;
    state.host = await window.orbit.getStatus();
    if (!state.host.reachable) throw new Error('Host unavailable');
    document.getElementById('host-label').textContent = state.simulator ? 'Simulated PC' : 'PC available';
    document.getElementById('host-badge').classList.add('available');
    document.getElementById('pc-name').textContent = state.host.name;
    document.getElementById('gpu-name').textContent = state.host.gpu || 'Hardware information unavailable';
    document.getElementById('orbit-link').textContent = 'Available';
    document.getElementById('stream-host').textContent = state.host.razerRunning ? (state.simulator ? 'Simulated host' : 'Responding') : 'Not running';
    document.getElementById('pair-status').textContent = state.host.paired ? 'Paired' : 'Pair in Moonlight';
    document.getElementById('pair-status').classList.toggle('amber', !state.host.paired);
    const library = Array.isArray(state.host.library) ? state.host.library : [];
    document.getElementById('library-count').textContent = `${library.length} ${state.simulator ? 'simulated' : 'streamable'} ${library.length === 1 ? 'title' : 'titles'} · ${state.host.name}`;
    document.getElementById('library-empty').hidden = library.length > 0;
    document.getElementById('library-grid').innerHTML = library.map((item, index) => `<button class="library-card focusable" data-title="${escapeText(item.id)}"><div class="library-cover cover-${index % 3}">${icons.gamepad}</div><div class="library-caption"><h2>${escapeText(item.name)}</h2><span>${state.simulator ? 'Simulation only' : 'Ready to stream'}</span></div></button>`).join('');
    if (!silent) toast('PC status and library refreshed');
  } catch {
    state.host = null;
    document.getElementById('host-label').textContent = 'PC unavailable';
    document.getElementById('host-badge').classList.remove('available');
    document.getElementById('orbit-link').textContent = 'Unavailable';
    document.getElementById('stream-host').textContent = 'Unavailable';
    document.getElementById('pair-status').textContent = 'Not connected';
    document.getElementById('gpu-name').textContent = state.config?.host || 'Configure your PC';
    document.getElementById('library-count').textContent = 'Host connection required';
    document.getElementById('library-grid').replaceChildren();
    document.getElementById('library-empty').hidden = false;
    if (!silent) toast('PC unavailable. Check its address and that Remote Play is hosting.');
  }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) { setView(button.dataset.view); return; }
  if (button.dataset.profile && profiles[button.dataset.profile]) {
    state.profile = button.dataset.profile;
    try { localStorage.setItem('orbit-profile', state.profile); } catch { toast('Preference selected for this session'); }
    await window.orbit.saveConfig({ profile: state.profile });
    updateProfile();
    document.querySelectorAll('.profile-option').forEach(option => {
      const active = option.dataset.profile === state.profile;
      option.classList.toggle('selected', active); option.setAttribute('aria-pressed', String(active)); option.querySelector('.profile-check').textContent = active ? '✓' : '';
    });
    return;
  }
  if (button.dataset.title) {
    const title = state.host?.library?.find(item => item.id === button.dataset.title);
    if (title) showDialog(title.name, `<p>${state.simulator ? 'A simulated session for testing launcher controls.' : 'Available from your paired PC.'}</p><div class="notice">${profiles[state.profile].details} · ${state.simulator ? 'No real video will be streamed' : 'Launches in Moonlight; closing its window returns you to Orbit'}</div><div class="dialog-action-row"><button class="secondary-button" data-action="close">Back to library</button><button class="primary-button" data-action="launch-title" data-id="${escapeText(title.id)}">${state.simulator ? 'Test launch' : 'Start stream'}</button></div>`, state.simulator ? 'SIMULATED LIBRARY' : 'YOUR LIBRARY');
    return;
  }
  switch (button.dataset.action) {
    case 'connect': connectDialog(); break;
    case 'save-host': await saveHost(); break;
    case 'moonlight': { const result = await window.orbit.openMoonlight(); toast(result.simulated ? 'Simulated pairing: use the Paired host state below.' : 'Moonlight opened. Pair your PC there, then refresh Orbit.'); break; }
    case 'desktop-stream': await streamDesktop(); break;
    case 'launch-title': await startStream(button.dataset.id); break;
    case 'return-stream': document.getElementById('simulated-stream').hidden = true; setView('home', true); break;
    case 'quit': await window.orbit.quit(); break;
    case 'close': closeDialog(); break;
    case 'settings': settingsDialog(); break;
    case 'refresh': await refresh(); break;
    case 'fullscreen': await window.orbit.fullscreen(); closeDialog(); break;
    case 'tools': showDialog('Room for what comes next.', '<p>This is where we’ll add the PC tools you choose for Orbit.</p><div class="tools-list"><span>Apps</span><span>Media</span><span>Custom controls</span></div><div class="notice">These are planned categories, not connected features yet.</div><button class="secondary-button" data-action="close">Back home</button>', 'YOUR TOOLS'); break;
  }
});
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); setView('home'); });
function visibleControls() {
  const container = !document.getElementById('simulated-stream').hidden ? document.getElementById('simulated-stream') : dialog.open ? dialog : document.querySelector('.app-shell');
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
function back() { if (!document.getElementById('simulated-stream').hidden) { document.getElementById('simulated-stream').hidden = true; setView('home', true); } else if (dialog.open) closeDialog(); else setView('home', true); }
function nextTab(delta) { if (dialog.open) return; const views = ['home', 'play', 'desktop']; setView(views[(views.indexOf(state.view) + delta + views.length) % views.length], true); }
function controllerButton(id) {
  if (id === 0) { if (!visibleControls().includes(document.activeElement)) moveFocus('down', true); else document.activeElement.click(); }
  if (id === 1) back();
  if (id === 4) nextTab(-1);
  if (id === 5) nextTab(1);
}
document.addEventListener('keydown', event => {
  const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (directions[event.key]) { event.preventDefault(); moveFocus(directions[event.key]); }
  if (event.key === 'Escape' && !dialog.open) back();
});
let oldButtons = [], lastMove = 0, controllerSeen = false;
function pollController(time) {
  const pad = simPad || navigator.getGamepads?.()?.find?.(pad => pad && pad.mapping === 'standard');
  if (pad) {
    if (!controllerSeen) { document.getElementById('controller-status').textContent = state.simulator ? 'Simulated standard controller' : 'Controller connected'; controllerSeen = true; }
    const pressed = pad.buttons.map(button => button.pressed);
    const edge = id => pressed[id] && !oldButtons[id];
    for (const id of [0,1,4,5]) if (edge(id)) controllerButton(id);
    const direction = pressed[12] || pad.axes[1] < -.6 ? 'up' : pressed[13] || pad.axes[1] > .6 ? 'down' : pressed[14] || pad.axes[0] < -.6 ? 'left' : pressed[15] || pad.axes[0] > .6 ? 'right' : null;
    if (direction && time - lastMove > 210) { moveFocus(direction, true); lastMove = time; }
    oldButtons = pressed;
  } else if (controllerSeen) { controllerSeen = false; oldButtons = []; document.getElementById('controller-status').textContent = 'Controller disconnected'; }
  requestAnimationFrame(pollController);
}
async function saveHost() {
  const input = document.getElementById('host-input');
  try { state.config = await window.orbit.saveConfig({ host: input.value.trim() }); closeDialog(); await refresh(); }
  catch (error) { toast('Enter a valid PC name or local IPv4 address.'); }
}
async function streamDesktop() {
  const desktop = state.host?.library?.find(title => /^desktop$/i.test(title.name));
  if (!desktop || !state.host?.paired) { connectDialog(); return; }
  await startStream(desktop.id);
}
async function startStream(id) {
  try {
    const result = await window.orbit.stream(id);
    closeDialog();
    if (result.simulated) {
      document.getElementById('sim-title').textContent = result.title;
      document.getElementById('sim-stream-profile').textContent = profiles[result.profile].details;
      document.getElementById('simulated-stream').hidden = false;
      document.querySelector('[data-action="return-stream"]').focus();
    } else toast('Opening your stream in Moonlight…');
  } catch (error) { toast('Unable to launch. Pair your PC and refresh its library in Moonlight.'); }
}
function simulateControl(control) {
  if (!state.simulator || !simPad) return;
  if (!visibleControls().includes(document.activeElement)) { (lastLauncherFocus?.isConnected ? lastLauncherFocus : document.querySelector('.desktop-hero')).focus(); }
  const map = { a: 0, b: 1, lb: 4, rb: 5, up: 12, down: 13, left: 14, right: 15 };
  const index = map[control];
  if (index === undefined) return;
  if (index >= 12) moveFocus(control, true);
  else controllerButton(index);
}
document.querySelectorAll('[data-control]').forEach(button => button.addEventListener('click', () => simulateControl(button.dataset.control)));
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', async () => {
  await window.orbit.scenario(button.dataset.scenario);
  document.querySelectorAll('[data-scenario]').forEach(other => other.classList.toggle('selected', other === button));
  await refresh(true);
}));
window.orbit.onReturn(() => { toast('Back in Orbit'); refresh(true); });
nativeReady = window.orbit.info().then(info => {
  state.simulator = info.simulator; state.config = info.config; state.profile = info.config.profile;
  document.title = info.simulator ? 'Orbit · Legion Go Simulator' : 'Orbit · Legion Go';
  document.body.classList.toggle('simulation', info.simulator);
  document.getElementById('simulator-panel').hidden = !info.simulator;
  document.getElementById('mode-note').textContent = info.simulator ? 'Simulator · Sample host state' : 'Legion Go launcher';
  if (info.simulator) simPad = { mapping: 'standard', axes: [0,0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  updateProfile();
});
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
