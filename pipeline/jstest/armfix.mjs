import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const tag=process.argv[2];
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8865);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8865/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('#who [data-r=male]').onclick());await p.waitForFunction(()=>window.__x.C===window.__x.cache.male&&document.getElementById('loading').hidden,{timeout:120000});await wait(1500);
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const clip={x:120,y:20,width:400,height:660};let i=0;
for(const t of [0.5,4]){await p.evaluate((t)=>{if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase('midle',t);},t);
  for(const c of [[0,1.0,4.0],[4,1.0,0.2],[-2.8,1.0,2.8]]){await cam([0,0.9,0],c);await wait(300);await p.screenshot({path:`/home/claude/out/af-${tag}-${i++}.png`,clip});}}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
