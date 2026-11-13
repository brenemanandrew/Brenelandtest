import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8783);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8783/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>window.__dbg.dots());
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
let i=0;const sh=async(n,clip)=>{await wait(250);await p.screenshot({path:`/home/claude/out/ck-${String(i++).padStart(2,'0')}-${n}.png`,clip});};
const body={x:150,y:30,width:350,height:640},face={x:200,y:190,width:250,height:250};
await cam([0,0.85,0],[1.3,1.05,3.0]);
const L=[['stand',0],['idle',0],['shrug',0.9],['wave',1.5],['dance',0.6]];
for(const[c,t]of L){await p.evaluate((c,t)=>window.__dbg.setBase(c,t),c,t);await cam([0,1.05,0],[0,1.1,1.6]);await sh(c+'-'+t+'-F',body);await cam([0,1.05,0],[1.1,1.1,1.2]);await sh(c+'-'+t+'-S',body);}

console.log('errors',errs.length?errs:'none');await b.close();srv.close();
