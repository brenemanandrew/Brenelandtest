import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const who=process.argv[2]||'m',VW=+(process.argv[3]||390),VH=+(process.argv[4]||800);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8873);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:VW,height:VH});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8873/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
let i=0;const sh=async n=>{await p.screenshot({path:`/home/claude/out/rm-${VW}-${i++}-${n}.png`});};
await wait(2500);await sh('door');
await p.evaluate(w=>document.querySelector('.who-btn[data-id='+w+']').click(),who);
for(let k=0;k<7;k++){await wait(1800);await sh('seq'+k);if(await p.evaluate(()=>!document.body.classList.contains('entering')&&!document.body.classList.contains('intro')))break;}
await wait(6000);await sh('face');
await p.evaluate(()=>document.querySelectorAll('.ed-step')[3].click());await wait(6000);await sh('body');
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
