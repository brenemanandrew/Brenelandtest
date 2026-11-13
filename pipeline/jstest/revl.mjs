import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const RIG=process.argv[2],sets=JSON.parse(process.argv[3]),build=+(process.argv[4]||0),mus=+(process.argv[5]||0),tag=process.argv[6]||'a',PORT=8800+Math.floor(Math.random()*90);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:900,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1000);
await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:120000},RIG);
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;document.getElementById('creator').style.display='none';document.getElementById('crfab').style.display='none';});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const set=(id,v)=>p.evaluate((id,v)=>{const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));},id,v);
if(build||mus){await set('build',build);await set('muscle',mus);await wait(1500);}
let n=0;for(const s of sets){await p.evaluate(s=>window.__setFeat(s),s);
  try{await p.waitForFunction(s=>Object.entries(s).every(([sl,t])=>t==='none'||(window.__x.C.hair[sl+':'+t]&&window.__x.C.hair[sl+':'+t].length)),{timeout:60000},s);}catch(e){console.log('LOADFAIL',JSON.stringify(s));}
  await wait(1500);let i=0;
  for(const[bs,tm]of [['stand',0],['fwalk',0.4]]){await p.evaluate((bs,tm)=>{if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase(bs,tm);},bs,tm);
    for(const cp of (bs==='stand'?[[0.5,0.3,1.3],[-0.7,0.25,-1.1],[1.4,0.25,0.1],[0.6,0.4,2.0]]:[[0.9,0.3,1.1],[-0.9,0.3,-1.1]])){await p.evaluate(()=>{window.__room.g.visible=false;});await cam(cp[2]>1.9?[0,0.85,0]:[0,0.14,0],cp);await wait(450);await p.screenshot({path:`/home/claude/out/rv-${tag}-${n}-${i++}.png`,clip:{x:300,y:60,width:300,height:600}});}}n++;}
console.log('errors',errs.filter(e=>!e.includes('setPointer')));await b.close();srv.close();
