import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8849);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.goto('http://localhost:8849/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('#who [data-r=plus]').click());await wait(500);await p.waitForFunction(()=>window.__x.C===window.__x.cache.plus&&document.getElementById('loading').hidden,{timeout:120000});
for(const t of [0.5,3,6,9]){await p.evaluate(t=>window.__dbg.setBase('sit',t),t);await wait(300);
 console.log(t,await p.evaluate(()=>{const C=window.__x.C,T=window.__x.THREE,hb=C.byName[window.__x.RIGS.plus.bones.hips],v=hb.getWorldPosition(new T.Vector3());
   const m=C.mesh;let minY=9;const P=m.geometry.attributes.position,q=new T.Vector3();for(let i=0;i<P.count;i+=7){q.fromBufferAttribute(P,i);m.applyBoneTransform(i,q);q.applyMatrix4(m.matrixWorld);if(q.y<minY&&Math.abs(q.z-v.z)<0.15&&q.y>0.2)minY=q.y;}
   return 'hips '+v.toArray().map(x=>x.toFixed(3)).join(',')+' seat underside '+minY.toFixed(3);}));}
await b.close();srv.close();
