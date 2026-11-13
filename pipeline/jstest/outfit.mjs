import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8888);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:390,height:800});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8888/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1200);
await p.evaluate(()=>document.querySelector('.who-btn[data-id=m]').click());try{await p.waitForFunction(()=>!document.body.classList.contains('intro'),{timeout:160000});}catch(e){console.log('STUCK',errs.slice(0,3),await p.evaluate(()=>[document.body.className,window.__x.holder.position.z,document.getElementById('loading').hidden].join('|')));}await wait(1500);
await p.evaluate(()=>{for(let i=0;i<3;i++)document.getElementById('crnext').click();});
const t0=Date.now();while(Date.now()-t0<70000){await wait(1000);if(!(await p.evaluate(()=>document.querySelectorAll('.ed-panel:not([hidden]) .pic:not(.ready)').length)))break;}
await p.screenshot({path:'/home/claude/out/of-0.png'});
await p.evaluate(()=>[...document.querySelectorAll('.ed-panel:not([hidden]) .tile')].find(b=>b.title==='Hoodie').click());await wait(4000);await p.screenshot({path:'/home/claude/out/of-1.png'});
console.log('errors',errs.filter(e=>!e.includes('setPointer')));await b.close();srv.close();
