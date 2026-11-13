import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const RIG=process.argv[2],PORT=8700+Math.floor(Math.random()*90);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:1000,height:1400});
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1000);
await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:120000},RIG);
await p.evaluate(()=>{const x=window.__x;x.holder.visible=true;x.holder.position.z=0;if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase('stand',0);
  window.__setFeat({hair:'none',top:'none',bottom:'none',shoes:'none',beard:'none'});let s=x.holder;while(s.parent)s=s.parent;s.background=new x.THREE.Color(0xffffff);window.__room.g.visible=false;
  for(const el of document.body.querySelectorAll('*'))if(!el.closest('#stage')&&!el.querySelector('#stage')&&el.tagName!=='SCRIPT')el.style.visibility='hidden';});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.target.set(...t);camera.position.set(...c);orbit.update();window.__room.g.visible=false;},t,c);
const h=RIG==='plus'?0.78:0.9,d=RIG==='plus'?4.4:5.0;await wait(1500);
for(const[k,c]of [['front',[0.01,h,d]],['back',[0.01,h,-d]]]){await cam([0.01,h,0],c);await wait(1500);await cam([0.01,h,0],c);await wait(800);await p.screenshot({path:`/home/claude/out/turn-${RIG}-${k}.png`});}
await b.close();srv.close();
