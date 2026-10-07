'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const STORES=new Set(['displaycatalog.mp.microsoft.com','store-images.s-microsoft.com']);
function download(address,limit){
 return new Promise((resolve,reject)=>{
  let url;try{url=new URL(address.startsWith('//')?'https:'+address:address);}catch{return reject(Error('Invalid artwork URL'));}
  if(url.protocol!=='https:'||!STORES.has(url.hostname)||url.username||url.password||url.port)return reject(Error('Artwork source is unavailable'));
  const req=https.get(url,{headers:{Accept:'application/json,image/jpeg,image/png'}},res=>{
   if(res.statusCode!==200){res.resume();return reject(Error('Artwork is unavailable'));}
   const buffers=[];let bytes=0;
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){req.destroy(Error('Artwork is too large'));return;}buffers.push(chunk);});
   res.on('end',()=>resolve(Buffer.concat(buffers)));
  });
  const timer=setTimeout(()=>req.destroy(Error('Artwork request timed out')),4000);
  req.once('close',()=>clearTimeout(timer));req.once('error',reject);
 });
}
function imageURL(image,width,height){
 if(!image?.Uri)return null;
 try{const url=new URL(image.Uri.startsWith('//')?'https:'+image.Uri:image.Uri);if(url.hostname!=='store-images.s-microsoft.com'||url.protocol!=='https:')return null;url.searchParams.set('w',width);url.searchParams.set('h',height);url.searchParams.set('q','75');return url.href;}catch{return null;}
}
class StoreArtworkCache{
 constructor({dir,fetch=download,clock=Date.now}){this.dir=dir;this.fetch=fetch;this.clock=clock;this.attempts=new Map();}
 async prepare(records){
  const candidates=[...records.values()].filter(r=>/^[a-z0-9]{12}$/i.test(r.storeId||''));
  for(const r of candidates)this.cached(r);
  const missing=candidates.filter(r=>!r.heroFile&&(!this.attempts.has(r.storeId)||this.clock()-this.attempts.get(r.storeId)>3600000)).slice(0,8);
  let index=0;await Promise.all(Array.from({length:Math.min(missing.length,4)},async()=>{while(index<missing.length)await this.ensure(missing[index++]);}));
 }
 cached(record){
  const cover=path.join(this.dir,record.storeId+'-cover.jpg'),hero=path.join(this.dir,record.storeId+'-hero.jpg');
  if(fs.existsSync(cover))record.artFile=cover;if(fs.existsSync(hero))record.heroFile=hero;
 }
 async ensure(record){
  this.attempts.set(record.storeId,this.clock());
  try{
   // Public catalog endpoint also used by Microsoft's winget Store implementation:
   // https://github.com/microsoft/winget-cli/blob/master/src/AppInstallerCommonCore/MSStoreDownload.cpp
   const bytes=await this.fetch('https://displaycatalog.mp.microsoft.com/v7.0/products/'+record.storeId+'?market=US&languages=en-us',2*1024*1024);
   const value=JSON.parse(bytes.toString()),product=value.Product;
   if(product?.ProductId?.toUpperCase()!==record.storeId.toUpperCase())return;
   const images=product.LocalizedProperties?.[0]?.Images||[];
   const poster=['Poster','BrandedKeyArt','BoxArt'].map(p=>images.find(i=>i.ImagePurpose===p)).find(Boolean);
   const hero=['SuperHeroArt','TitledHeroArt','Screenshot'].map(p=>images.find(i=>i.ImagePurpose===p)).find(Boolean);
   const choices=[{kind:'cover',url:imageURL(poster,400,600)},{kind:'hero',url:imageURL(hero,960,540)}];
   fs.mkdirSync(this.dir,{recursive:true});
   await Promise.all(choices.filter(c=>c.url).map(async choice=>{
    try{const image=await this.fetch(choice.url,4*1024*1024);if(!(image[0]===0xff&&image[1]===0xd8)&&!(image[0]===0x89&&image.subarray(1,4).toString()==='PNG'))return;const file=path.join(this.dir,record.storeId+'-'+choice.kind+'.jpg');fs.writeFileSync(file+'.tmp',image);fs.renameSync(file+'.tmp',file);}catch{}
   }));this.cached(record);
  }catch{/* Installed artwork remains available when the public catalog is offline. */}
 }
}
module.exports={StoreArtworkCache,imageURL};
