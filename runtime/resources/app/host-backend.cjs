'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function portBusy(port) {
  return new Promise(resolve => {
    const s = net.connect({host:'127.0.0.1', port});
    let done = false;
    const finish = value => { if (done) return; done = true; s.destroy(); resolve(value); };
    s.once('connect', () => finish(true));
    s.once('error', () => finish(false));
    s.setTimeout(1000, () => finish(true));
  });
}
function localRequest({port, ca, credentials, method='GET', endpoint, body}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {'Accept':'application/json'};
    if (credentials) headers.Authorization = 'Basic ' + Buffer.from(credentials.username+':'+credentials.password).toString('base64');
    if (payload) { headers['Content-Type']='application/json'; headers['Content-Length']=Buffer.byteLength(payload); }
    const req = https.request({hostname:'127.0.0.1', port, path:endpoint, method, ca,
      rejectUnauthorized:true, checkServerIdentity:()=>undefined, headers}, res => {
      let data=''; res.on('data', chunk => { data+=chunk; if(data.length>2*1024*1024) req.destroy(new Error('Backend response too large')); });
      res.on('end', () => {
        if(res.statusCode === 401) return reject(new Error('Orbit could not unlock its streaming backend. Local credentials may have changed.'));
        if(res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('Streaming backend rejected the request ('+res.statusCode+').'));
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid streaming backend response')); }
      });
    });
    req.setTimeout(45000,()=>req.destroy(new Error('Streaming backend timed out')));
    req.on('error',reject);
    req.end(payload);
  });
}
class HostBackend {
  constructor({root, vault, basePort=47989, executable, request=localRequest, spawnProcess=spawn, busy=portBusy}) {
    if(!Number.isInteger(basePort) || basePort < 1029 || basePort > 65514) throw new Error('Invalid streaming port');
    this.root=root; this.vault=vault; this.basePort=basePort; this.request=request; this.spawnProcess=spawnProcess; this.busy=busy;
    this.dir=path.join(root,'data','host','streaming');
    this.exe=executable || path.join(root,'backend','Sunshine','sunshine.exe');
    this.child=null; this.ready=false; this.starting=null; this.stopping=false; this.message='';
  }
  get addresses() {
    return Object.values(os.networkInterfaces()).flat().filter(a=>a && a.family==='IPv4' && !a.internal).map(a=>a.address);
  }
  paths() {
    return {conf:path.join(this.dir,'sunshine.conf'),apps:path.join(this.dir,'apps.json'),
      cert:path.join(this.dir,'cert.pem'),key:path.join(this.dir,'key.pem'),state:path.join(this.dir,'state.json'),
      auth:path.join(this.dir,'management.bin'),log:path.join(this.dir,'sunshine.log')};
  }
  credentials() {
    if(!this.vault.isEncryptionAvailable()) throw new Error('Windows credential protection is unavailable. Hosting was not started.');
    const file=this.paths().auth;
    if(fs.existsSync(file)) return JSON.parse(this.vault.decryptString(fs.readFileSync(file)));
    const value={username:'orbit',password:crypto.randomBytes(32).toString('base64url')};
    fs.writeFileSync(file,this.vault.encryptString(JSON.stringify(value)),{mode:0o600,flag:'wx'});
    return value;
  }
  async api(endpoint,method='GET',body,authenticated=true) {
    if(!this.child) throw new Error('Start hosting first');
    const ca=fs.readFileSync(this.paths().cert);
    return this.request({port:this.basePort+1,ca,credentials:authenticated?this.credentials():null,endpoint,method,body});
  }
  async initialize() {
    const c=this.credentials();
    try { await this.api('/api/config'); }
    catch(error) {
      if(fs.existsSync(this.paths().state)) {
        // A state file is normal on first startup. Only initialize if no password hash exists.
        const state=JSON.parse(fs.readFileSync(this.paths().state,'utf8'));
        if(state.username || state.password) throw error;
      }
      const result=await this.api('/api/password','POST',{newUsername:c.username,newPassword:c.password,confirmNewPassword:c.password},false);
      if(result.status !== true) throw new Error('Backend credential setup failed');
      await this.api('/api/config');
    }
  }
  async start() {
    if(this.stopping) throw new Error('Hosting is still stopping');
    if(this.starting) return this.starting;
    if(this.ready) return this.status();
    if(this.child) throw new Error('The previous backend is still exiting. Try again in a moment.');
    this.starting=this._start().finally(()=>{this.starting=null;});
    return this.starting;
  }
  async _start() {
    if(!fs.existsSync(this.exe)) throw new Error('Run Setup Orbit Host.ps1 to install the streaming component.');
    for(const port of [this.basePort-5,this.basePort,this.basePort+1,this.basePort+21]) {
      if(await this.busy(port)) throw new Error('Another host is using port '+port+'. Stop its hosting session before starting Orbit. Orbit has not changed it.');
    }
    fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
    this.credentials();
    const paths=this.paths();
    if(!fs.existsSync(paths.apps)) fs.writeFileSync(paths.apps,JSON.stringify({env:{},apps:[{name:'Desktop','image-path':'desktop.png'}]},null,2));
    const q=value=>value.replaceAll('\\','/');
    const config=[
      'sunshine_name = Orbit — '+os.hostname(), 'port = '+this.basePort,
      'upnp = disabled', 'origin_web_ui_allowed = pc', 'min_log_level = 2',
      'file_apps = '+q(paths.apps), 'credentials_file = '+q(paths.state),
      'file_state = '+q(paths.state), 'cert = '+q(paths.cert), 'pkey = '+q(paths.key),
      'log_path = '+q(paths.log)
    ].join('\n')+'\n';
    fs.writeFileSync(paths.conf,config);
    const child=this.spawnProcess(this.exe,[paths.conf],{cwd:path.dirname(this.exe),shell:false,windowsHide:true,stdio:'ignore'});
    this.child=child;
    let processError=null;
    child.once('error',()=>{processError=new Error('Streaming backend could not start'); if(this.child===child){this.child=null;this.ready=false;}});
    child.once('exit',code=>{if(this.child===child){this.child=null;this.ready=false;this.message=code?'Streaming backend stopped unexpectedly. Check local diagnostics.':'';}});
    try {
      for(let attempt=0;attempt<180;attempt++) {
        if(processError) throw processError;
        if(this.child!==child) throw new Error('Streaming backend exited during startup. Check local diagnostics.');
        if(fs.existsSync(paths.cert) && await this.busy(this.basePort+1)) {
          await this.initialize();
          this.ready=true; this.message=''; return this.status();
        }
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      throw new Error('Streaming backend startup timed out. Check local diagnostics.');
    } catch(error) { if(this.child===child) child.kill(); this.ready=false; throw error; }
  }
  async stop() {
    if(this.starting) throw new Error('Wait for hosting startup to finish');
    if(!this.child) return this.status();
    const child=this.child;
    this.stopping=true;
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Backend has not stopped yet')),10000);
        child.once('exit',()=>{clearTimeout(timer);resolve();});
        child.kill();
      });
    } finally {this.stopping=false;}
    return this.status();
  }
  async status() {
    const basic={installed:fs.existsSync(this.exe),running:this.ready,starting:Boolean(this.starting)&&!this.ready,
      name:os.hostname(),addresses:this.addresses,port:this.basePort,message:this.message,
      apps:[],pairings:[],healthy:false};
    if(!this.ready) {
      try { basic.apps=JSON.parse(fs.readFileSync(this.paths().apps,'utf8')).apps.map(a=>({name:String(a.name)})); } catch {}
      return basic;
    }
    try {
      const [apps,pins]=await Promise.all([this.api('/api/apps'),this.api('/api/pin')]);
      basic.healthy=true;
      basic.apps=(apps.apps||[]).map(a=>({name:String(a.name)}));
      basic.pairings=(pins.pairings||[]).map(a=>({id:a.id,name:a.name,address:a.address}));
    } catch(error) {basic.message=error.message;}
    return basic;
  }
  async pair(input) {
    if(!input || Object.keys(input).some(k=>!['id','pin','name'].includes(k)) ||
      !/^[0-9a-f]{32}$/i.test(input.id||'') || !/^\d{4}$/.test(input.pin||'') ||
      typeof input.name!=='string' || !input.name.trim() || input.name.length>64) throw new Error('Choose a pending request and enter its four-digit PIN.');
    const pending=await this.api('/api/pin');
    if(!(pending.pairings||[]).some(p=>p.id===input.id)) throw new Error('This pairing request has expired. Retry on the handheld.');
    const result=await this.api('/api/pin','POST',{pairing_id:input.id,pin:input.pin,name:input.name});
    if(result.status!==true) throw new Error('Pairing failed or timed out. Retry with the PIN displayed by Moonlight.');
    return {paired:true};
  }
  async setSteam(enabled) {
    if(typeof enabled!=='boolean') throw new Error('Invalid app selection');
    if(this.child) throw new Error('Stop hosting before changing shared apps');
    fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
    const apps=[{name:'Desktop','image-path':'desktop.png'}];
    if(enabled) apps.push({name:'Steam Big Picture',detached:['steam://open/bigpicture'],'image-path':'steam.png'});
    fs.writeFileSync(this.paths().apps,JSON.stringify({env:{},apps},null,2));
    return {saved:true};
  }
}
module.exports={HostBackend,localRequest,portBusy};
