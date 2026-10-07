'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {session}=require('./model.cjs');
const STREAM_PROFILES=Object.freeze({
  balanced:Object.freeze({resolution:'1920x1200',fps:60,bitrate:20000}),
  smooth:Object.freeze({resolution:'1920x1200',fps:120,bitrate:35000}),
  sharp:Object.freeze({resolution:'2560x1600',fps:60,bitrate:35000})
});
const EDGES={IDLE:['PREPARING','RESTORING'],PREPARING:['CONFIGURING_DISPLAY','ENDING'],
  CONFIGURING_DISPLAY:['PREPARING_STREAM','ENDING'],PREPARING_STREAM:['READY','ENDING'],
  READY:['STREAMING','RECONNECTING','ENDING'],STREAMING:['RECONNECTING','ENDING'],
  RECONNECTING:['READY','STREAMING','ENDING'],ENDING:['RESTORING'],RESTORING:['IDLE','ERROR'],ERROR:['RESTORING']};
function conflict(message){return Object.assign(Error(message),{status:409});}
// Phase one preserves Windows displays. A future adapter must snapshot before mutating.
class PreserveDisplay {
  async snapshot(){return {policy:'preserve-physical',changed:false};}
  async prepare(){return {applied:false,policy:'preserve-physical'};}
  async restore(previous){if(previous?.changed)throw Error('Display restoration adapter is unavailable');}
}
class StreamObserver {
  constructor(backend){this.backend=backend;this.offset=0;this.remainder='';}
  reset(){const file=this.backend.paths().log;this.offset=fs.existsSync(file)?fs.statSync(file).size:0;this.remainder='';}
  read(){
    let result=null;
    try{
      const file=this.backend.paths().log,size=fs.statSync(file).size;
      if(size<this.offset){this.offset=0;this.remainder='';}
      const length=Math.min(size-this.offset,1024*1024);
      if(length){
        const fd=fs.openSync(file,'r'),buf=Buffer.alloc(length);
        try{fs.readSync(fd,buf,0,length,this.offset);}finally{fs.closeSync(fd);}
        this.offset+=length;
        const rows=(this.remainder+buf.toString()).split(/\r?\n/);this.remainder=rows.pop();
        for(const line of rows){
          if(line.includes('CLIENT CONNECTED'))result='STREAMING';
          if(line.includes('CLIENT DISCONNECTED'))result='RECONNECTING';
        }
      }
    }catch{}
    return result;
  }
}
class SessionManager {
  constructor({backend,clock=Date.now,journal=null,display=new PreserveDisplay(),observer=new StreamObserver(backend),library=null,launcher=null}){
    this.backend=backend;this.clock=clock;this.journal=journal;this.display=display;this.observer=observer;
    this.library=library;this.launcher=launcher;
    this.state='IDLE';this.current=null;this.error=null;this.tail=Promise.resolve();
  }
  serial(fn){const job=this.tail.then(fn);this.tail=job.catch(()=>{});return job;}
  move(state){if(state!==this.state&&!EDGES[this.state]?.includes(state))throw Error('Invalid host session transition '+this.state+' → '+state);this.state=state;this.save();}
  save(){
    if(!this.journal)return;
    fs.mkdirSync(path.dirname(this.journal),{recursive:true});
    const tmp=this.journal+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify({version:1,state:this.state,session:this.current,error:this.error}),{mode:0o600});
    fs.renameSync(tmp,this.journal);
  }
  async recover(){return this.serial(async()=>{
    if(!this.journal||!fs.existsSync(this.journal))return;
    const record=JSON.parse(fs.readFileSync(this.journal,'utf8'));
    if(record.version!==1)throw Error('Unsupported session restoration journal');
    if(record.state==='IDLE'&&!record.session)return;
    this.current=record.session;this.error=null;this.move('RESTORING');
    await this.restore();
  });}
  snapshot(){return {state:this.state,error:this.error,session:this.current?{
    id:this.current.id,intent:this.current.intent,clientDeviceId:this.current.clientDeviceId,
    targetType:this.current.gameId?'game':'intent',targetId:this.current.gameId||this.current.intent,game:this.current.game||null,streamProfile:this.current.profile,
    displayPolicy:'preserve-physical',startedAt:this.current.startedAt,currentState:this.state}:null};}
  active(){return Boolean(this.current)||this.state!=='IDLE';}
  expired(){return this.current&&this.clock()-this.current.heartbeat>=45000;}
  async start({intent,profile='balanced',resumeId,gameId},clientDeviceId,authorized=()=>true){return this.serial(async()=>{
    if(!authorized())throw Object.assign(Error('Device trust was removed'),{status:401});
    const target=session(intent);
    if(gameId!==undefined&&intent!=='desktop')throw conflict('Games use the Desktop stream');
    if(gameId!==undefined&&(!this.library||!this.launcher))throw conflict('Game launching is unavailable on Zeiron');
    if(!STREAM_PROFILES[profile])throw conflict('Unsupported session profile');
    if(this.expired())await this.endInternal('heartbeat-expired');
    if(this.state==='ERROR')throw conflict('Restore Zeiron before starting another session');
    if(this.current){
      if(resumeId!==this.current.id||intent!==this.current.intent||clientDeviceId!==this.current.clientDeviceId||profile!==this.current.profile||gameId!==this.current.gameId)throw conflict('A session is already active');
      this.current.heartbeat=this.clock();this.observer.reset();this.move('RECONNECTING');this.move('READY');
      return this.launchResponse(target);
    }
    const game=gameId!==undefined?await this.library.resolve(gameId):null;
    if(!authorized())throw Object.assign(Error('Device trust was removed'),{status:401});
    this.current={...(game?{gameId:game.id}:{}),id:crypto.randomUUID(),clientDeviceId,intent,profile,heartbeat:this.clock(),startedAt:new Date(this.clock()).toISOString(),previousSystemState:null};
    this.error=null;this.move('PREPARING');
    try{
      this.current.previousSystemState=await this.display.snapshot();this.save();
      this.move('CONFIGURING_DISPLAY');await this.display.prepare(STREAM_PROFILES[profile]);
      this.move('PREPARING_STREAM');
      const status=await this.backend.status();
      if(!status.running||status.healthy===false||!status.apps.some(a=>a.name===target.target))throw Error('This session is not ready on Zeiron');
      if(!authorized())throw Object.assign(Error('Device trust was removed'),{status:401});
      if(game)this.current.game={id:game.id,...await this.launcher.launch(game)};
      this.observer.reset();this.move('READY');return this.launchResponse(target);
    }catch(error){await this.endInternal(error.message);throw conflict(error.message);}
  });}
  launchResponse(target){return {id:this.current.id,intent:this.current.intent,target:target.target,
    profile:this.current.profile,game:this.current.game||null,stream:STREAM_PROFILES[this.current.profile],hostSession:this.snapshot()};}
  async heartbeat(id,clientDeviceId){return this.serial(async()=>{
    if(this.expired()){await this.endInternal('heartbeat-expired');throw conflict('Session expired');}
    if(!this.current||this.current.id!==id||this.current.clientDeviceId!==clientDeviceId)throw conflict('Session expired');
    this.current.heartbeat=this.clock();this.observe();this.save();return this.compatible();
  });}
  observe(){
    if(!this.current)return;
    const observed=this.observer.read();
    if(observed&&['READY','STREAMING','RECONNECTING'].includes(this.state))this.move(observed);
  }
  compatible(){return this.current?{id:this.current.id,intent:this.current.intent,
    state:this.state==='READY'?'CONNECTING':this.state==='RECONNECTING'?'DISCONNECTED':this.state}:null;}
  async status(){return this.serial(async()=>{
    if(this.expired())await this.endInternal('heartbeat-expired');
    this.observe();return {session:this.compatible(),hostSession:this.snapshot()};
  });}
  async end(id,clientDeviceId){return this.serial(async()=>{
    if(this.current&&(id!==this.current.id||clientDeviceId!==this.current.clientDeviceId))throw conflict('Session identity mismatch');
    await this.endInternal(null);return {ended:true,hostSession:this.snapshot()};
  });}
  async endInternal(reason){
    if(!this.current&&this.state==='IDLE')return;
    if(this.state==='ERROR'){this.move('RESTORING');return this.restore();}
    this.error=reason;this.move('ENDING');this.move('RESTORING');await this.restore();
  }
  async restore(){
    try{await this.display.restore(this.current?.previousSystemState);this.current=null;this.move('IDLE');}
    catch(error){this.error='Restoration failed: '+error.message;this.move('ERROR');throw conflict(this.error);}
  }
  async shutdown(){return this.serial(()=>this.endInternal('host-stopped'));}
}
module.exports={SessionManager,StreamObserver,PreserveDisplay,STREAM_PROFILES};
