import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8774);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:1000,height:700});
await p.goto('http://localhost:8774/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__dbg.dots();document.getElementById('toon').click();});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
let i=0;const shot=async(n,clip)=>{await wait(300);await p.screenshot({path:`/home/claude/out/dg-${String(i++).padStart(2,'0')}-${n}.png`,clip});};
// shoulders: bind, stand, Mixamo walk, sassy walk, idle
await cam([0,1.15,0],[0,1.2,1.9]);
const body={x:150,y:60,width:350,height:520};
await p.evaluate(()=>{window.__dbg.setBase('stand',0);window.__dbg.bind();});await shot('bind',body);
await p.evaluate(()=>window.__dbg.setBase('stand',0));await shot('stand',body);
await p.evaluate(()=>window.__dbg.setBase('owalk',0.3));await shot('mixamo-walk',body);
await p.evaluate(()=>window.__dbg.setBase('walk',0.3));await shot('sassy-walk',body);
await p.evaluate(()=>window.__dbg.setBase('idle',1));await shot('idle',body);
// face: painted vs drawn
await cam([0.01,1.41,0.1],[0,1.42,1.45]);const fc={x:175,y:150,width:300,height:330};
await p.evaluate(()=>{window.__dbg.setBase('stand',0);window.__dbg.bind();window.__dbg.decals(false);});await shot('face-painted',fc);
await p.evaluate(()=>{window.__dbg.decals(true);});await shot('face-drawn',fc);
await b.close();srv.close();
