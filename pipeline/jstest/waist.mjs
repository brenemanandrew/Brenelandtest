import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8777);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8777/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>window.__dbg.dots());
const cam=c=>p.evaluate(c=>{const{camera,orbit}=window.__dbg;orbit.target.set(0,0.85,0);camera.position.set(...c);orbit.update();},c);
let i=0;for(const[n,base,t,c]of [['stand-side','stand',0,[3.3,1.0,0.3]],['idle-side','idle',1,[3.3,1.0,0.3]],['idle-front','idle',3,[0.4,1.0,3.3]],['wave-side','wave',2,[3.3,1.0,0.3]],['look-front','look',2.6,[0.4,1.0,3.3]],['walk-side','walk',0.3,[3.3,1.0,0.3]]]){
  await cam(c);await p.evaluate((b,t)=>window.__dbg.setBase(b,t),base,t);await wait(300);await p.screenshot({path:`/home/claude/out/ws-${i++}-${n}.png`,clip:{x:160,y:30,width:330,height:640}});}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
