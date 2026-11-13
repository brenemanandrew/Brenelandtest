import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8778);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:1000,height:700});
await p.goto('http://localhost:8778/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__dbg.dots();const{camera,orbit}=window.__dbg;orbit.target.set(0,0.95,0);camera.position.set(3.0,1.0,0.3);orbit.update();window.__dbg.setBase('stand',0);});
let i=0;for(const[n,o]of [['stand',{}],['hips-yaw',{hips:[0,-0.12,0]}],['hips-roll',{hips:[0,0,-0.08]}],['chest-back',{chest:[-0.06,0,0]}],['L-arm-bent',{shoulderL:[0.6,0,0.3],elbowL:[-1.6,0,0]}],['spine-twist',{hips:[0,-0.12,0],chest:[0,0.1,0]}]]){
  await p.evaluate(o=>window.__dbg.off(o),o);await wait(300);await p.screenshot({path:`/home/claude/out/iso-${i++}-${n}.png`,clip:{x:200,y:150,width:260,height:330}});}
await b.close();srv.close();
