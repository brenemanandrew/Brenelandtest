import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8768);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage(); await p.setViewport({width:1000,height:640});
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|404/.test(m.text()))errs.push(m.text());});
const t0=Date.now();await p.goto('http://localhost:8768/',{waitUntil:'load'}); await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
console.log('loaded in',(Date.now()-t0)/1000,'s');
const durs=await p.evaluate(()=>Object.fromEntries(Object.entries(window.__poser.clips()).map(([k,c])=>[k,+c.duration.toFixed(2)])));console.log(durs);
await p.evaluate(()=>{window.__dbg.dots();const{camera,orbit}=window.__dbg;orbit.target.set(0,0.85,0);camera.position.set(0.6,1.1,3.1);orbit.update();});
const shots=process.argv[2]?JSON.parse(process.argv[2]):[['sassy_walk','walk',[0,0.14,0.28,0.42,0.56,0.7]],['sassy_idle','idle',[0,1.5,3,4.5]],['flirty_wave','wave',[1.2,1.6,2.0]],['look_back','look',[2.2]],['sassy_run','run',[0.1,0.3]]];
let i=0;for(const[clip,base,ts]of shots)for(const t of ts){await p.evaluate((b,t)=>window.__dbg.setBase(b,t),base,t);await wait(250);
  await p.screenshot({path:`/home/claude/out/an-${String(i++).padStart(2,'0')}-${base}-${t}.png`,clip:{x:150,y:40,width:500,height:600}});}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
