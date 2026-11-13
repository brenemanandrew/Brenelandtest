import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const RIG=process.argv[3]||'male';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8876);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8876/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate((r)=>document.querySelector('#who [data-r='+r+']').click(),RIG);await wait(500);await p.waitForFunction((r)=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:120000},RIG);
await p.evaluate(()=>{window.__dbg.dots();window.__dbg.setBase('stand',0);});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const set=o=>p.evaluate(o=>{for(const[k,v]of Object.entries(o)){if(typeof v==='number'){const el=document.getElementById(k);el.value=v*100;el.dispatchEvent(new Event('input'));continue;}const sel=v===true?`#featrows [data-fk=${k}][data-fv=""]`:`#featrows [data-fk=${k}][data-fv=${v}]`;const el=document.querySelector(sel);if(!el)throw new Error('no chip '+k+v);el.click();}},o);
const combos=JSON.parse(process.argv[2]);let i=0;
for(const o of combos){await set(o.f||{});if(o.base)await p.evaluate(b=>window.__dbg.setBase(b[0],b[1]),o.base);if(o.face)await p.evaluate(f=>window.__dbg.face(f),o.face);
  await cam([0.0175,1.47,0],[0.0175,1.48,1.15]);await wait(400);await p.screenshot({path:`/home/claude/out/ft-${i}-F.png`,clip:{x:150,y:60,width:350,height:420}});
  await cam([0.0175,1.47,0],[0.75,1.49,0.85]);await wait(400);await p.screenshot({path:`/home/claude/out/ft-${i++}-Q.png`,clip:{x:150,y:60,width:350,height:420}});}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
