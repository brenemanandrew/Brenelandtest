import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8779);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8779/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__dbg.dots();const{camera,orbit}=window.__dbg;orbit.target.set(0,0.85,0);camera.position.set(3.3,1.0,0.3);orbit.update();});
let i=0;for(const[n,o]of [['stand',null],['idle-all',{}],['zero',{zero:1}],['offsets-only',{offonly:1}],['no-ik',{nofeet:1}]]){
  if(o===null)await p.evaluate(()=>window.__dbg.setBase('stand',0));else await p.evaluate(o=>{window.__dbg.rebuild(o);},o);
  await wait(300);await p.screenshot({path:`/home/claude/out/is2-${i++}-${n}.png`,clip:{x:160,y:30,width:330,height:640}});}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
