if (process.argv.includes('--host')) { require('./host-main.cjs'); } else {
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const simulator = process.argv.includes('--simulate-legion-go');
const packageRoot = path.resolve(__dirname, '../../..');
const dataRoot = path.join(packageRoot, 'data', simulator ? 'simulator' : 'launcher');
fs.mkdirSync(dataRoot, { recursive: true });
app.setPath('userData', dataRoot);
app.setPath('sessionData', path.join(dataRoot, 'browser'));
app.setName(simulator ? 'Orbit Legion Go Simulator' : 'Orbit Legion Go');
app.enableSandbox();
const configFile = path.join(dataRoot, 'config.json');
let config = { host: '', profile: 'balanced' };
try { const saved = JSON.parse(fs.readFileSync(configFile)); if (typeof saved.host === 'string' && /^[a-zA-Z0-9.-]{1,253}$/.test(saved.host)) config.host = saved.host; if (['balanced', 'smooth', 'sharp'].includes(saved.profile)) config.profile = saved.profile; } catch {}
let win, scenario = 'paired', cachedStatus = null, lastCheck = 0, checking = null, moonlight = null;
const moonlightPath = path.join(packageRoot, 'moonlight', 'Moonlight.exe');
const profiles = { balanced: ['1920x1200', '60', '20000'], smooth: ['1920x1200', '120', '35000'], sharp: ['2560x1600', '60', '35000'] };
const simulatedApps = [{ id: '1', name: 'Desktop', source: 'Simulator' }, { id: '2', name: 'Controller test', source: 'Simulator' }, { id: '3', name: 'Media demo', source: 'Simulator' }];
function privateAddress(address) { return /^127\./.test(address) || /^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address); }
async function validateHost(host) {
  if (typeof host !== 'string' || !/^[a-zA-Z0-9.-]{1,253}$/.test(host) || host.startsWith('-')) throw new Error('Enter a PC name or a local IPv4 address.');
  const results = await dns.lookup(host, { all: true, family: 4 });
  if (!results.length || results.some(result => !privateAddress(result.address))) throw new Error('Choose a PC on your local network.');
  return results[0].address;
}
function probe(address) { return new Promise(resolve => { const socket = net.createConnection({ host: address, port: 47989 }); const finish = value => { socket.destroy(); resolve(value); }; socket.setTimeout(1800); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.once('timeout', () => finish(false)); }); }
function listApps(host) {
  return new Promise(resolve => {
    execFile(moonlightPath, ['list', host], { cwd: path.dirname(moonlightPath), windowsHide: true, timeout: 35000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const apps = stdout.split(/\r?\n/).map(name => name.trim()).filter(name => name && !/^Qt |^Q[A-Za-z]|^Moonlight|^Using |^Detected /.test(name)).map((name, index) => ({ id: String(index), name, source: 'Streaming host' }));
      resolve({ paired: !error && apps.length > 0, library: !error ? apps : [], note: error ? /not been paired|not paired/i.test(stderr) ? 'Pair this PC in Moonlight.' : 'Open Moonlight to pair or check the host.' : '' });
    });
  });
}
async function status() {
  if (simulator) return { name: 'Simulated gaming PC', gpu: 'Simulated host · RTX 5060 Ti', reachable: scenario !== 'offline', razerRunning: scenario !== 'offline', streamingConnected: false, paired: scenario === 'paired', localOnly: true, simulation: true, library: scenario === 'paired' ? simulatedApps : [], note: scenario === 'offline' ? 'Simulated PC offline' : scenario === 'unpaired' ? 'Simulated pairing required' : 'Simulated paired host' };
  if (cachedStatus && Date.now() - lastCheck < 10000) return cachedStatus;
  if (checking) return checking;
  checking = (async () => {
    let reachable = false, remote = { paired: false, library: [], note: '' };
    try { const address = await validateHost(config.host); reachable = await probe(address); if (reachable) remote = await listApps(config.host); } catch (error) { remote.note = 'PC unavailable. Check the PC name or local address.'; }
    cachedStatus = { name: config.host, gpu: 'Remote streaming host', reachable, razerRunning: reachable, streamingConnected: Boolean(moonlight?.streaming), localOnly: true, simulation: false, ...remote };
    lastCheck = Date.now(); checking = null; return cachedStatus;
  })();
  return checking;
}
function launchMoonlight(args = [], streaming = false) {
  if (moonlight) { win?.minimize(); return { started: true }; }
  const child = spawn(moonlightPath, args, { cwd: path.dirname(moonlightPath), shell: false, windowsHide: false, stdio: 'ignore' });
  moonlight = { process: child, streaming };
  child.once('spawn', () => { if (streaming) win?.minimize(); });
  child.once('error', error => { moonlight = null; win?.webContents.send('orbit:return', { error: 'Moonlight could not start.' }); });
  child.once('exit', code => { moonlight = null; cachedStatus = null; if (win && !win.isDestroyed()) { win.restore(); win.show(); win.focus(); win.webContents.send('orbit:return', { code }); } });
  return { started: true };
}
function trusted(event) { if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unsupported caller'); }
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { trusted(event); return fn(...args); }); }
handle('orbit:info', () => ({ simulator, config, platform: process.platform, version: '0.3.0', screen: { width: 2560, height: 1600, logicalWidth: 1280, logicalHeight: 800 } }));
handle('orbit:status', status);
handle('orbit:config', input => {
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['host','profile'].includes(key))) throw new Error('Invalid configuration');
  if (input.host !== undefined && (typeof input.host !== 'string' || !/^[a-zA-Z0-9.-]{1,253}$/.test(input.host) || input.host.startsWith('-'))) throw new Error('Enter a valid PC name or IPv4 address.');
  if (input.profile !== undefined && !profiles[input.profile]) throw new Error('Invalid profile');
  config = { ...config, ...input }; fs.writeFileSync(configFile, JSON.stringify(config, null, 2)); cachedStatus = null; return config;
});
handle('orbit:moonlight', () => { if (simulator) return { simulated: true }; return launchMoonlight(); });
handle('orbit:stream', async appId => {
  const current = await status();
  if (!current.reachable || !current.paired) throw new Error('Pair and connect this PC first.');
  const title = current.library.find(item => item.id === String(appId));
  if (!title) throw new Error('This title is not in the streaming host library.');
  if (simulator) return { simulated: true, title: title.name, profile: config.profile };
  await validateHost(config.host);
  const [resolution, fps, bitrate] = profiles[config.profile];
  return launchMoonlight(['stream', config.host, title.name, '--resolution', resolution, '--fps', fps, '--bitrate', bitrate, '--display-mode', 'borderless', '--audio-config', 'stereo', '--no-quit-after'], true);
});
handle('orbit:scenario', name => { if (!simulator || !['paired','unpaired','offline'].includes(name)) throw new Error('Simulation only'); scenario = name; return status(); });
handle('orbit:fullscreen', () => { win.setFullScreen(!win.isFullScreen()); return win.isFullScreen(); });
handle('orbit:quit', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
    win = new BrowserWindow({ width: 1280, height: simulator ? 960 : 800, useContentSize: true, minWidth: 850, minHeight: 620, title: simulator ? 'Orbit · Legion Go Simulator' : 'Orbit · Legion Go', backgroundColor: '#080e18', autoHideMenuBar: true, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.loadFile(path.join(__dirname, 'ui/index.html'));
    win.once('ready-to-show', () => { win.show(); if (!simulator && !process.argv.includes('--windowed')) win.setFullScreen(true); });
    win.on('closed', () => { win = null; });
  });
  app.on('window-all-closed', () => app.quit());
}

}
