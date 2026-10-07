'use strict';
const os=require('node:os');
const transport=require('./transport.cjs');
function subnetAddresses(interfaces){
 const result=[];
 for(const [name,items] of Object.entries(interfaces)){
  if(/virtual|vEthernet|WSL|docker|loopback/i.test(name))continue;
  for(const i of items){
   if(i.internal||i.family!=='IPv4'||!transport.isPrivate(i.address)||i.address.startsWith('127.'))continue;
   const mask=i.netmask.split('.').reduce((v,n)=>(v*256+Number(n))>>>0,0);
   const inverse=(~mask)>>>0;
   // Only bounded, contiguous home-LAN subnets: at most 254 addresses each.
   if(inverse<3||inverse>255||(inverse&(inverse+1))!==0)continue;
   const ip=i.address.split('.').reduce((v,n)=>(v*256+Number(n))>>>0,0),base=(ip&mask)>>>0;
   for(let n=1;n<inverse;n++){
    const value=base+n;
    if(value===ip)continue;
    result.push([24,16,8,0].map(shift=>(value>>>shift)&255).join('.'));
   }
  }
 }
 return [...new Set(result)].slice(0,508);
}
class Discovery {
 constructor({resolve=transport.resolve,request=transport.request,interfaces=os.networkInterfaces}){
  this.resolve=resolve;this.request=request;this.interfaces=interfaces;
 }
 async find({registry,legacyHost='',signal}){
  const found=new Map(),seen=new Set();
  const probe=async address=>{
   if(signal?.aborted||seen.has(address))return;
   seen.add(address);
   try{
    const identity=await this.request({address,endpoint:'/identity',discovery:true,timeoutMs:650,signal});
    if(identity.version!==1||identity.role!=='host'||identity.name!=='Zeiron'||!/^[a-f0-9-]{36}$/i.test(identity.id||''))return;
    if(!found.has(identity.id))found.set(identity.id,{id:identity.id,name:'Zeiron',address,online:true,
      known:registry?.id===identity.id,linkSupported:identity.pairingFlow==='client-code-v3'});
   }catch{}
  };
  for(const candidate of [...new Set([registry?.lastAddress,registry?.hostname,'ZEIRON-CORE',legacyHost].filter(Boolean))]){
   if(signal?.aborted)break;
   try{await probe(await this.resolve(candidate));}catch{}
  }
  // The common hostname/registry path is immediate. Scan only when it cannot find Zeiron.
  if(!found.size&&!signal?.aborted){
   const addresses=subnetAddresses(this.interfaces());let index=0;
   await Promise.all(Array.from({length:16},async()=>{
    while(index<addresses.length&&!signal?.aborted&&!found.size)await probe(addresses[index++]);
   }));
  }
  if(signal?.aborted)throw Object.assign(Error('Discovery cancelled'),{name:'AbortError'});
  return [...found.values()];
 }
}
module.exports={Discovery,subnetAddresses};
