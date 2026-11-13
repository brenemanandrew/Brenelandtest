import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8882);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:500,height:500});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8882/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:100000});await wait(800);
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;});
for(const base of ['midle','fwalk','orun','dance']){await p.evaluate(b=>{window.__dbg.setBase(b,0);if(document.getElementById('play').textContent!=='Stop')document.getElementById('play').click();},base);let mx=0;await wait(2000);
  for(let k=0;k<12;k++){await wait(250);mx=Math.max(mx,await p.evaluate(()=>Math.max(...window.__x.C.bust.slice(__K__).map(s=>{const par=s.b.parent;par.updateWorldMatrix(true,false);const a=s.rest.clone().applyMatrix4(par.matrixWorld),w=s.b.position.clone().applyMatrix4(par.matrixWorld);return a.distanceTo(w);}))));}console.log(base,'max bust offset m',mx.toFixed(4));}
console.log('scale',await p.evaluate(()=>{const v=new (window.__x.C.bust[0].rest.constructor)();window.__x.C.bust[0].b.parent.getWorldScale(v);return v.x;}));console.log('errors',errs.filter(e=>!e.includes('setPointer')).length?errs:'none');await b.close();srv.close();
