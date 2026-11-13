import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest',PORT=8790;const tops=process.argv[2].split(',');
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:900,height:700});
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1000);
await p.evaluate(()=>document.querySelector('#who [data-r=plus]').onclick());await p.waitForFunction(()=>window.__x.C===window.__x.cache.plus&&document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__x.holder.visible=true;if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase('stand',0);});
for(const t of tops){await p.evaluate(t=>window.__setFeat({top:t,bottom:'none',shoes:'none'}),t);await p.waitForFunction(t=>window.__x.C.hair['top:'+t]&&window.__x.C.hair['top:'+t].length,{timeout:60000},t);await wait(2500);
 const r=await p.evaluate(t=>{const T=window.__x.THREE,C=window.__x.C,bm=C.mesh,cm=C.hair['top:'+t][0],v=new T.Vector3();
  const bp=[];const n=bm.geometry.attributes.position.count;for(let i=0;i<n;i+=2){bm.getVertexPosition(i,v);v.applyMatrix4(bm.matrixWorld);bp.push([v.x,v.y,v.z]);}
  const out={};const cn=cm.geometry.attributes.position.count;const bins={};
  for(let i=0;i<cn;i+=17){cm.getVertexPosition(i,v);v.applyMatrix4(cm.matrixWorld);let best=1e9,by=0;for(const q of bp){const d=(q[0]-v.x)**2+(q[1]-v.y)**2+(q[2]-v.z)**2;if(d<best){best=d;by=q[1];}}
   const k=(Math.floor(v.y*10)/10).toFixed(1);(bins[k]=bins[k]||[]).push([Math.sqrt(best),v.y-by,Math.abs(v.x)]);}
  for(const k of Object.keys(bins).sort()){const a=bins[k],m=f=>a.map(f).sort((x,y)=>x-y);const d=m(x=>x[0]),dy=m(x=>x[1]),ax=m(x=>x[2]);out[k]=[a.length,+d[a.length>>1].toFixed(3),+d[Math.floor(a.length*0.9)].toFixed(3),+dy[a.length>>1].toFixed(3),+ax[a.length-1].toFixed(2)];}
  let bx=0,byy=0;for(const q of bp){if(q[1]>1.15&&q[1]<1.4&&Math.abs(q[0])>bx){bx=Math.abs(q[0]);}}
  return {bodyMaxX:bx.toFixed(2),bins:out};},t);console.log(t,JSON.stringify(r));}
await b.close();srv.close();
