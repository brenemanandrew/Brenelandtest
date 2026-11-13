import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8850);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8850/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('#who [data-r=plus]').click());await wait(500);await p.waitForFunction(()=>window.__x.C===window.__x.cache.plus&&document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>window.__dbg.dots());
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const info=await p.evaluate(()=>({dict:window.__x.C.mesh.morphTargetDictionary,hidden:document.getElementById('buildrow').hidden}));console.log(JSON.stringify(info));
let i=0;
for(const v of [-100])for(const[base,t]of [['stand',0],['midle',3]]){await p.evaluate((base,t,v)=>{window.__dbg.setBase(base,t);const el=document.getElementById('build');if(+el.value!==v){el.value=v;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));}},base,t,v);
  await wait(2500);await p.evaluate((base,t)=>window.__dbg.setBase(base,t),base,t);await cam([0,1.25,0],[0,1.3,1.6]);await wait(300);await p.screenshot({path:`/home/claude/out/sh-${String(i).padStart(2,'0')}-F.png`,clip:{x:100,y:20,width:450,height:660}});
  await cam([0,1.25,0],[1.1,1.35,1.1]);await wait(300);await p.screenshot({path:`/home/claude/out/sh-${String(i++).padStart(2,'0')}-S.png`,clip:{x:100,y:20,width:450,height:660}});}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
