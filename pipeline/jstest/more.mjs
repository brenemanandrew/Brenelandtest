import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8780);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|404/.test(m.text()))errs.push(m.text());});
const t0=Date.now();await p.goto('http://localhost:8780/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000}).catch(()=>errs.push('no load'));
console.log('load s',(Date.now()-t0)/1000);
if(!errs.length){await p.evaluate(()=>{window.__dbg.dots();const{camera,orbit}=window.__dbg;orbit.target.set(0,0.85,0);camera.position.set(1.3,1.05,3.0);orbit.update();});
const shots=[['talk',1.3],['laugh',1.2],['hair',1.0],['kiss',0.8],['kiss',1.8],['point',1.2],['shrug',0.9],['think',2],['cheer',1],['jump',0.5],['dance',0.6],['sit',2],['sitx',2],['browse',2],['adjust',1.5]];
let i=0;for(const[base,t]of shots){await p.evaluate((b,t)=>window.__dbg.setBase(b,t),base,t);await wait(250);await p.screenshot({path:`/home/claude/out/mo-${String(i++).padStart(2,'0')}-${base}-${t}.png`,clip:{x:150,y:30,width:350,height:640}});}}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
