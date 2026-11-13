import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8839);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8839/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('#who [data-r=plus]').click());await wait(500);await p.waitForFunction(()=>window.__x.C===window.__x.cache.plus&&document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>{window.__dbg.dots();window.__dbg.setBase('stand',0);});
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;orbit.target.set(...t);camera.position.set(...c);orbit.update();},t,c);
console.log(await p.evaluate(()=>JSON.stringify({hid:document.getElementById('faceshape').hidden,names:Object.keys(window.__x.C.mesh.morphTargetDictionary)})));
let i=0;for(const f of ['oval','round','square','heart','diamond','oblong']){await p.evaluate(f=>document.querySelector(`#fshapes [data-f=${f}]`).click(),f);
  await cam([0,1.48,0],[0,1.5,1.9]);await wait(350);await p.screenshot({path:`/home/claude/out/fs-${i}-F.png`,clip:{x:100,y:0,width:450,height:560}});
  await cam([0,1.48,0],[1.3,1.5,1.35]);await wait(350);await p.screenshot({path:`/home/claude/out/fs-${i++}-Q.png`,clip:{x:100,y:0,width:450,height:560}});}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
