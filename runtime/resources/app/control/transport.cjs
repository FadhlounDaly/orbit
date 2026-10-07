'use strict';
const https=require('node:https'),tls=require('node:tls'),crypto=require('node:crypto');
const dns=require('node:dns').promises;
const CONTROL_PORT=38742;
function fingerprint(cert){return crypto.createHash('sha256').update(cert).digest('hex');}
function isPrivate(ip){return /^10\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip)||/^127\./.test(ip);}
async function resolve(host){
 if(typeof host!=='string'||!host||host.startsWith('-')||!/^[a-zA-Z0-9.-]{1,253}$/.test(host))throw Error('Zeiron address is invalid');
 const ips=await dns.lookup(host,{all:true,family:4});
 if(!ips.length || ips.some(p=>!isPrivate(p.address)))throw Error('Zeiron must be on the local network');
 return ips[0].address;
}
// TLS pinning happens before handing the socket to HTTPS, so no token is sent to an unverified peer.
class PinnedAgent extends https.Agent {
 constructor(expected){super({keepAlive:false});this.expected=expected;}
 createConnection(options,callback){
  const socket=tls.connect({...options,rejectUnauthorized:false});
  const failed=error=>callback(error);
  socket.once('error',failed);
  socket.once('secureConnect',()=>{
   socket.removeListener('error',failed);
   const actual=fingerprint(socket.getPeerCertificate(true).raw);
   if(actual!==this.expected){socket.destroy();callback(Error('Zeiron identity changed. Confirm linking on Zeiron again.'));return;}
   callback(null,socket);
  });
 }
}
function request({address,fp,token,endpoint,method='GET',body,port=CONTROL_PORT,discovery=false}){
 return new Promise((resolve,reject)=>{
  if(!isPrivate(address))return reject(Error('Local network address required'));
  const agent=discovery?new https.Agent({rejectUnauthorized:false}):new PinnedAgent(fp);
  const bytes=body===undefined?null:JSON.stringify(body);
  const headers={Accept:'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(bytes){headers['Content-Type']='application/json';headers['Content-Length']=Buffer.byteLength(bytes);}
  const req=https.request({hostname:address,port,path:endpoint,method,agent,headers},res=>{
   let text='';
   res.on('data',b=>{text+=b;if(text.length>65536)req.destroy(Error('Host response too large'));});
   res.on('end',()=>{agent.destroy();try{
    const data=JSON.parse(text);
    if(res.statusCode>=400){const e=Error(data.error||'Zeiron rejected the request');e.code=data.code;e.status=res.statusCode;return reject(e);}
    resolve(data);
   }catch(e){reject(e);}});
  });
  req.setTimeout(discovery?1600:method==='POST'?45000:5000,()=>req.destroy(Error('Zeiron did not respond')));
  req.on('error',e=>{agent.destroy();reject(e);});req.end(bytes);
 });
}
function decodeInvitation(code){
 if(typeof code!=='string'||code.length>2048||!code.startsWith('orbit1.'))throw Error('Paste the linking code shown in Orbit on Zeiron');
 let value;try{value=JSON.parse(Buffer.from(code.slice(7),'base64url').toString());}catch{throw Error('Invalid Orbit linking code');}
 if(!/^[a-f0-9]{64}$/.test(value.fp||'') || !/^[a-f0-9-]{36}$/.test(value.id||'') || !/^[A-Za-z0-9_-]{43}$/.test(value.token||''))throw Error('Invalid Orbit linking code');
 return value;
}
module.exports={CONTROL_PORT,fingerprint,isPrivate,resolve,PinnedAgent,request,decodeInvitation};
