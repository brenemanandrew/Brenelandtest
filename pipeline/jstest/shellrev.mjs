// render one outfit in the real builder: node shellrev.mjs ROOT RIG '{"top":..,"bottom":..,"shoes":..}' TAG OUTDIR [build]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const [ROOT,RIG,SET,tag,OUT]=process.argv.slice(2),build=+(process.argv[7]||(RIG==='plus'?100:0)),fit=JSON.parse(SET),PORT=8600+Math.floor(Math.random()*300);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:900,height:700});p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:180000});await wait(1000);
await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:180000},RIG);
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;document.getElementById('creator').style.display='none';const f=document.getElementById('crfab');if(f)f.style.display='none';});
const set=(id,v)=>p.evaluate((id,v)=>{const el=document.getElementById(id);if(!el)return;el.value=v;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));},id,v);
await set('build',build);if(process.env.MUS)await set('muscle',+process.env.MUS);await wait(1200);
await p.evaluate(f=>window.__setFeat(f),fit);
if(process.env.MAG)await p.evaluate(()=>{window.__magOn=1;});
await p.waitForFunction(s=>Object.entries(s).every(([sl,t])=>t==='none'||(window.__x.C.hair[sl+':'+t]&&window.__x.C.hair[sl+':'+t].length)),{timeout:120000},fit);await wait(2500);
if(process.env.MAG)await p.evaluate(()=>{for(const ms of Object.values(window.__x.C.hair))for(const m of ms){const u=m.userData.under;if(u){u.material.color.setHex(0xff00ff);u.material.gradientMap=null;u.material.needsUpdate=true;}}});
if(process.env.HIDEBODY)await p.evaluate(()=>{window.__x.C.mesh.visible=false;});
const cam=(t,c)=>p.evaluate((t,c,ro)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.minPolarAngle=0;orbit.maxPolarAngle=3.1;orbit.minAzimuthAngle=-Infinity;orbit.maxAzimuthAngle=Infinity;orbit.target.set(...t);camera.position.set(...c);orbit.update();window.__room.g.visible=ro;},t,c,!!process.env.ROOMON);
const male=RIG==='male',ty=male?1.25:1.12;let i=0;
// full body: front 3/4, side, back; then walking; then close-ups of the chest and the hips
const shots=[['stand',0,[0,0.95,0],[1.2,1.2,2.9],'full'],['stand',0,[0,0.95,0],[3.1,1.15,0.2],'full'],['stand',0,[0,0.95,0],[-0.8,1.2,-3.0],'full'],['fwalk',0.4,[0,0.95,0],[1.9,1.15,2.5],'full'],
  ['stand',0,[0,ty,0],[0.5,ty+0.05,1.25],'close'],['stand',0,[0,male?0.75:0.7,0],[-0.6,male?0.7:0.65,1.3],'close'],['stand',0,[0,0.16,0.03],[0.55,0.32,1.05],'close']];
for(const[bs,tm,t,c,kind]of shots){await p.evaluate((bs,tm)=>{const pl=document.getElementById('play');if(pl&&pl.textContent==='Stop')pl.click();window.__dbg.setBase(bs,tm);},bs,tm);
  await cam(t,c);await wait(600);await p.screenshot({path:`${OUT}/${tag}-${i++}.png`,clip:kind==='full'?{x:300,y:60,width:300,height:600}:{x:250,y:110,width:400,height:480}});}
console.log(tag,'errors',errs.filter(e=>!e.includes('setPointer')).slice(0,5));await b.close();srv.close();
