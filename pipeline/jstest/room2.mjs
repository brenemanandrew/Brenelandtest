import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8875);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:390,height:800});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8875/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1500);
let i=0;const sh=async n=>{await p.screenshot({path:`/home/claude/out/r2-${i++}-${n}.png`});};
await sh('door');await p.evaluate(()=>document.querySelector('.who-btn[data-id=f]').click());
let got=0;for(let k=0;k<120;k++){await wait(250);const z=await p.evaluate(()=>window.__x.holder.position.z);if(z>-0.5&&got<1){got=1;await sh('approach');}if(z>=0.25&&got<2){got=2;await wait(500);await sh('look');}if(await p.evaluate(()=>!document.body.classList.contains('intro')))break;}
await wait(1500);await sh('face');
await p.evaluate(()=>{document.getElementById('crnext').click();document.getElementById('crnext').click();});await wait(5000);await sh('body');
await p.evaluate(()=>[0,1,2,3].forEach(()=>document.getElementById('crnext').click()));await wait(6000);await sh('finish');
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
