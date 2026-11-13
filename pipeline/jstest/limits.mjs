import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8824);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setViewport({width:1000,height:700});
await p.goto('http://localhost:8824/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
const L=await p.evaluate(()=>{const L=window.__x.C.limits,o={};for(const[k,v]of Object.entries(L))o[k]=v.lo.map((x,i)=>Math.round(x*57.3)+'..'+Math.round(v.hi[i]*57.3)).join(' | ');return o;});
console.log(JSON.stringify(L,null,1));
// try an impossible elbow: slider bend -170
await p.evaluate(()=>{document.querySelector('#joints [data-b=elbowL]').click();const el=document.getElementById('rx');el.value=-170;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});
await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>window.__dbg.dots());
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
await cam([0,1.0,0],[0,1.1,3.2]);await new Promise(r=>setTimeout(r,400));await p.screenshot({path:'/home/claude/out/limit-test.png',clip:{x:150,y:30,width:350,height:640}});
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
