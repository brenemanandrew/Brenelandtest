import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const tag=process.argv[2];
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8866);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8866/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('#who [data-r=male]').onclick());await p.waitForFunction(()=>window.__x.C===window.__x.cache.male&&document.getElementById('loading').hidden,{timeout:120000});await wait(1500);
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const clip={x:120,y:20,width:400,height:660};
const L=JSON.parse(process.argv[3]||'[["stand",0],["midle",0.5],["midle",4],["fwalk",0.3],["mrun",0.2],["wave",1.5],["cheer",1.1],["sit",3],["dance",4]]');let i=0;
for(const[bs,t]of L){await p.evaluate((bs,t)=>{if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase(bs,t);},bs,t);
  for(const c of [[0,1.0,4.0],[-2.8,1.0,2.8]]){await cam([0,0.9,0],c);await wait(300);await p.screenshot({path:`/home/claude/out/hd-${tag}-${i++}.png`,clip});}}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
