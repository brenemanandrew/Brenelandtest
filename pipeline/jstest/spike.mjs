import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8871);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:390,height:800});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8871/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
const off=()=>p.evaluate(()=>{const C=window.__x.C;let m=0;for(const[b,[p0]]of C.face.rest)m=Math.max(m,b.position.distanceTo(p0));return +m.toFixed(4);});
await p.evaluate(()=>document.querySelector('.who-btn[data-id=f]').click());await wait(1500);
await p.evaluate(()=>document.getElementById('crnext').click());await wait(1500);
for(let k=0;k<6;k++){await p.evaluate(k=>document.querySelectorAll('.ed-panel:not([hidden]) .tile')[k].click(),k);await wait(1200);console.log('max face bone offset after pick',k,await off());}
await wait(2500);console.log('settled',await off(),'base',await p.evaluate(()=>document.querySelector('#bases .chip.on')?.textContent));await p.screenshot({path:'/home/claude/out/spike.png'});
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
