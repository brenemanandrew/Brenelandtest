import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8830);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8830/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>window.__dbg.dots());
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
let i=0;const sh=async(n,clip)=>{await wait(250);await p.screenshot({path:`/home/claude/out/ck-${String(i++).padStart(2,'0')}-${n}.png`,clip});};
const body={x:150,y:30,width:350,height:640},face={x:200,y:190,width:250,height:250};
await cam([0,0.85,0],[1.3,1.05,3.0]);
await p.evaluate(()=>document.querySelector('#who [data-r=plus]').click());await wait(500);await p.waitForFunction(()=>document.getElementById('loading').hidden&&window.__x.C&&window.__x.RIGS.plus===window.__x.cache.plus&&false||window.__x.C===window.__x.cache.plus,{timeout:120000});
await p.evaluate(()=>window.__dbg.dots());
const L=[['midle',1],['midle',5],['midle',9],['midle',13]];
for(const[c,t]of L){await p.evaluate((c,t)=>window.__dbg.setBase(c,t),c,t);await cam([0,0.9,0],[0,1.0,4.0]);await sh(c+'-'+t+'-F',{x:100,y:20,width:450,height:660});await cam([0,0.9,0],[4.0,1.0,0.2]);await sh(c+'-'+t+'-T',{x:100,y:20,width:450,height:660});await cam([0,0.95,0],[3.2,1.05,0.3]);await sh(c+'-'+t+'-S',body);}
for(const[c,t]of L){await p.evaluate((c,t)=>window.__dbg.setBase(c,t),c,t);await cam([0,0.9,0],[0,1.0,4.0]);await sh(c+'-'+t+'-F',{x:100,y:20,width:450,height:660});await cam([0,0.9,0],[4.0,1.0,0.2]);await sh(c+'-'+t+'-T',{x:100,y:20,width:450,height:660});await cam([0,0.95,0],[3.2,1.05,0.3]);await sh(c+'-'+t+'-S',body);}

await p.evaluate(()=>window.__dbg.setBase('stand',0));await cam([0,1.55,0],[0,1.57,0.75]);await sh('face',{x:200,y:150,width:300,height:330});await cam([0,0.5,0],[0.4,0.6,2.0]);await sh('legs',body);
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
