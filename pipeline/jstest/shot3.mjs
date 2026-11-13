import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8767);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage(); await p.setViewport({width:900,height:500});
await p.goto('http://localhost:8767/',{waitUntil:'load'}); await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:90000}); await wait(800);
await p.evaluate(()=>{document.getElementById('dots').click();const {camera,orbit}=window.__dbg;orbit.target.set(0,0.08,0.03);camera.position.set(0.45,0.3,0.55);orbit.update();});
for(const s of ['none','sneakers','flats','boots']){await p.evaluate(s=>window.__dbg.setS({shoes:s,shoeCol:{none:'#fff',sneakers:'#f4f1ea',flats:'#2b2340',boots:'#7a4a2b'}[s]}),s);await wait(500);
  await p.screenshot({path:`/home/claude/out/shoe-${s}.png`,clip:{x:0,y:60,width:550,height:400}});}
await b.close(); srv.close();
