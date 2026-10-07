'use strict';
const os=require('node:os');
class SystemObserver {
  constructor(){this.previous=null;}
  snapshot(){
    const cpus=os.cpus(),sum=cpus.reduce((s,c)=>{
      s.idle+=c.times.idle;s.total+=Object.values(c.times).reduce((a,b)=>a+b,0);return s;
    },{idle:0,total:0});
    const delta=this.previous?sum.total-this.previous.total:0;
    const utilization=delta>0?Math.max(0,Math.min(100,100*(1-(sum.idle-this.previous.idle)/delta))):null;
    this.previous=sum;
    return {name:'Zeiron',hostname:os.hostname(),uptimeSeconds:os.uptime(),sampledAt:new Date().toISOString(),
      cpu:{model:cpus[0]?.model||null,logicalProcessors:cpus.length,utilizationPercent:utilization},memory:{totalBytes:os.totalmem(),usedBytes:os.totalmem()-os.freemem()},
      network:Object.entries(os.networkInterfaces()).flatMap(([name,items])=>items.filter(i=>!i.internal&&i.family==='IPv4').map(i=>({name,address:i.address}))),
      gpu:{utilizationPercent:null,memoryUsedBytes:null,temperatureCelsius:null},cpuTemperatureCelsius:null,
      activeUser:null,foregroundApplication:null,runningGame:null,
      unavailable:['gpu','temperatures','activeUser','foregroundApplication','runningGame']};
  }
}
module.exports={SystemObserver};
