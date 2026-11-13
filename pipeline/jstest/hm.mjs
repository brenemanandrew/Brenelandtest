import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const RIG=process.argv[2]||'plus';const combos=JSON.parse(process.argv[3]);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8889);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:900,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8889/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1200);
if(RIG!=='plus'){await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:120000},RIG);}
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;document.getElementById('creator').style.display='none';document.getElementById('crfab').style.display='none';if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase('stand',0);});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const set=o=>p.evaluate(o=>{for(const[k,v]of Object.entries(o)){const sel=v===true?`#featrows [data-fk=${k}][data-fv=""]`:`#featrows [data-fk=${k}][data-fv=${v}]`;const el=document.querySelector(sel);if(!el)throw new Error('no chip '+k+v);el.click();}},o);
const y=RIG==='plus'?1.47:1.52,x=RIG==='plus'?0.0175:0;let i=0;
for(const o of combos){await set(o.f||{});if(o.face)await p.evaluate(f=>window.__dbg.face(f),o.face);await wait(700);
  for(const[k,c]of [['F',[x,y-0.06,0.5]],['Q',[0.3,y+0.2,-1.1]],['S',[-0.5,y+0.5,-1.0]]]){await cam([x,k==='F'?y-0.07:y+0.08,0],c);await wait(350);await p.screenshot({path:`/home/claude/out/fh-${RIG}-${i}-${k}.png`,clip:{x:270,y:170,width:360,height:360}});}i++;}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
