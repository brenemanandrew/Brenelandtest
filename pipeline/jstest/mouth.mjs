import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8796);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:1400,height:1000,deviceScaleFactor:2});
await p.goto('http://localhost:8796/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__dbg.dots();window.__dbg.setBase('stand',0);const f=document.getElementById('floor');if(f.checked)f.click();[...document.querySelectorAll('#bgs .chip')].find(x=>x.textContent==='Paper').click();});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
const box=await p.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
const clip={x:box.x+box.w/2-260,y:box.y+box.h/2-470,width:520,height:940};
for(const[n,t,c]of [['mouth',[0.0,1.34,0],[0,1.345,0.9]],['mouthq',[0.0,1.34,0],[0.45,1.36,0.8]]]){await cam(t,c);await wait(400);await p.screenshot({path:`/home/claude/out/${n}.png`,clip:{x:box.x+box.w/2-250,y:box.y+box.h/2-200,width:500,height:400}});}
await b.close();srv.close();
