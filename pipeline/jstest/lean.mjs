import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8845);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.goto('http://localhost:8845/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('#who [data-r=plus]').click());await wait(500);await p.waitForFunction(()=>window.__x.C===window.__x.cache.plus&&document.getElementById('loading').hidden,{timeout:120000});
for(const [c,t] of [['stand',0],['midle',1],['midle',3],['midle',6],['fwalk',0.3]]){
 await p.evaluate((c,t)=>window.__dbg.setBase(c,t),c,t);await wait(300);
 const r=await p.evaluate(()=>{const C=window.__x.C,R=window.__x.RIGS.plus.bones,T=window.__x.THREE,W=n=>C.byName[R[n]].getWorldPosition(new T.Vector3());
  const seg=(a,b)=>{const v=W(b).sub(W(a));return (Math.atan2(v.z,v.y)*57.3).toFixed(1);};
  return {hips_sp1:seg('hips','spine1'),sp1_sp2:seg('spine1','spine2'),sp2_chest:seg('spine2','chest'),chest_neck:seg('chest','neck'),neck_head:seg('neck','head'),hipsZ:W('hips').z.toFixed(3),headZ:W('head').z.toFixed(3)};});
 console.log(c,t,JSON.stringify(r));}
await b.close();srv.close();
