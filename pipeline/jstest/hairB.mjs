import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8870);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:900,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8870/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('.who-btn[data-id=m]').click());await p.waitForFunction(()=>document.getElementById('loading').hidden&&window.__x.C===window.__x.cache.male,{timeout:120000});await wait(3500);
await p.evaluate(()=>{document.getElementById('creator').style.display='none';document.getElementById('crfab').style.display='none';if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase('stand',0);});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const hs=process.argv[2].split(',');
for(const h of hs){await p.evaluate(h=>document.querySelector('#featrows [data-fk=hair][data-fv='+h+']').click(),h);await wait(2600);let k=0;
  for(const c of [[0,1.62,-1.2],[0.2,2.6,-0.25],[1.2,1.62,0]]){await cam([0,1.58,0],c);await wait(350);await p.screenshot({path:`/home/claude/out/hb-${h}-${k++}.png`,clip:{x:250,y:150,width:400,height:400}});}}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
