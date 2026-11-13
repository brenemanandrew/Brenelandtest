import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8776);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8776/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__dbg.dots();const{camera,orbit}=window.__dbg;orbit.target.set(0,0.85,0);camera.position.set(0,1.0,3.3);orbit.update();});
let i=0;for(const[n,fn]of [['bind',()=>{window.__dbg.setBase('stand',0);window.__dbg.bind();}],['stand',()=>window.__dbg.setBase('stand',0)],['walk-a',()=>window.__dbg.setBase('walk',0.15)],['walk-b',()=>window.__dbg.setBase('walk',0.45)],['walk-c',()=>window.__dbg.setBase('walk',0.75)],['idle',()=>window.__dbg.setBase('idle',1)]]){
  await p.evaluate(fn);await wait(300);await p.screenshot({path:`/home/claude/out/fb-${i++}-${n}.png`,clip:{x:160,y:30,width:330,height:640}});}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
