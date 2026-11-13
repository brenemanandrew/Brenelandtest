import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const RIG=process.argv[2],hs=process.argv[3].split(','),tag=process.argv[4]||RIG,PORT=8700+Math.floor(Math.random()*90);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:900,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1000);
await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:120000},RIG);
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;document.getElementById('creator').style.display='none';document.getElementById('crfab').style.display='none';if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase('stand',0);});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const y=RIG==='plus'?1.45:1.64;let n=0;
for(const h of hs){await p.evaluate(h=>window.__setFeat({hair:h,hairColor:'ginger'}),h);try{await p.waitForFunction(h=>window.__x.C.hair[h]&&window.__x.C.hair[h].length,{timeout:40000},h);}catch(e){console.log('LOADFAIL',h);}await wait(1200);let i=0;
  for(const c of [[0.02,y+0.05,1.5],[1.5,y+0.05,0.0],[-1.5,y+0.05,0.0],[0.0,y+0.1,-1.5],[-1.0,y+0.25,0.9]]){await p.evaluate(()=>{window.__room.g.visible=false;});await cam([0.01,y,0],c);await wait(400);await p.screenshot({path:`/home/claude/out/hr-${tag}-${n}-${i++}.png`,clip:{x:270,y:170,width:360,height:360}});}n++;}
console.log('errors',errs.filter(e=>!e.includes('setPointer')));await b.close();srv.close();
