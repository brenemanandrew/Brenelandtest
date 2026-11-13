import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const tops=process.argv[2].split(','),bases=JSON.parse(process.argv[3]||'[["stand",0],["midle",2],["fwalk",0.4],["clap",0.7]]'),build=+(process.argv[4]||0),mus=+(process.argv[5]||0);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8886);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:900,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8886/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1000);
await p.evaluate(()=>document.querySelector('#who [data-r=male]').onclick());await p.waitForFunction(()=>window.__x.C===window.__x.cache.male&&document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;document.getElementById('creator').style.display='none';document.getElementById('crfab').style.display='none';});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const set=(id,v)=>p.evaluate((id,v)=>{const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));},id,v);
if(build||mus){await set('build',build);await set('muscle',mus);await wait(1500);}
for(const t of tops){await p.evaluate(t=>window.__setFeat({top:t}),t);await p.waitForFunction(t=>t==='none'||(window.__x.C.hair['top:'+t]&&window.__x.C.hair['top:'+t].length),{timeout:60000},t);await wait(1500);let i=0;
  for(const[bs,tm]of bases){await p.evaluate((bs,tm)=>{if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase(bs,tm);},bs,tm);
    for(const c of [[0.4,1.25,2.6],[-2.0,1.3,-1.7]]){await cam([0,1.12,0],c);await wait(350);await p.screenshot({path:`/home/claude/out/ct-${t}-${i++}.png`,clip:{x:270,y:120,width:360,height:460}});}}}
console.log('errors',errs.filter(e=>!e.includes('setPointer')));await b.close();srv.close();
