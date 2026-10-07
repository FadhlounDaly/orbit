const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const root = path.join(__dirname, 'dist');
const port = 38741;
function steamLibrary() {
  const base = process.platform === 'win32' ? 'C:/Program Files (x86)/Steam' : '/mnt/c/Program Files (x86)/Steam';
  const libraries = new Set([base]);
  try {
    for (const match of fs.readFileSync(path.join(base, 'steamapps/libraryfolders.vdf'), 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) {
      const winPath = match[1].replace(/\\\\/g, '/');
      libraries.add(process.platform === 'win32' ? winPath : winPath.replace(/^([A-Za-z]):/, (_, drive) => '/mnt/' + drive.toLowerCase()));
    }
  } catch {}
  const games = [];
  for (const folder of libraries) {
    try {
      for (const file of fs.readdirSync(path.join(folder, 'steamapps')).filter(name => /^appmanifest_\d+\.acf$/.test(name))) {
        const text = fs.readFileSync(path.join(folder, 'steamapps', file), 'utf8');
        const get = key => text.match(new RegExp('"' + key + '"\\s+"([^"\\r\\n]+)"'))?.[1];
        const id = get('appid'), name = get('name');
        if (!id || !name || id === '228980') continue;
        games.push({ id, name, source: 'Steam', installed: true });
      }
    } catch {}
  }
  return games.sort((a, b) => a.name.localeCompare(b.name));
}
let hostInfo = { name: os.hostname(), gpu: '', razerRunning: false };
function inspectHost() {
  if (process.platform !== 'win32') return;
  const command = '$r=[ordered]@{name=$env:COMPUTERNAME;gpu=(Get-CimInstance Win32_VideoController | Where-Object Name -like "NVIDIA*" | Select-Object -First 1 -ExpandProperty Name);razerRunning=[bool](Get-Process RazerRemotePlayHost -ErrorAction SilentlyContinue)};$r | ConvertTo-Json -Compress';
  execFile('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 10000 }, (err, out) => {
    if (!err) { try { hostInfo = JSON.parse(out); } catch {} }
  });
}
inspectHost();
setInterval(inspectHost, 15000).unref();
const server = http.createServer((req, res) => {
  const allowedHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
  if (!allowedHosts.has(req.headers.host)) { res.writeHead(403); return res.end('Local host access only'); }
  const url = new URL(req.url, 'http://127.0.0.1:' + port);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url.pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ ...hostInfo, reachable: true, streamingConnected: false, localOnly: true, library: steamLibrary() }));
  }
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  fs.readFile(file, (err, contents) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : contents);
  });
});
server.listen(port, '127.0.0.1', () => console.log('Orbit ready at http://127.0.0.1:' + port));
server.on('error', err => { console.error(err.message); process.exitCode = 1; });
