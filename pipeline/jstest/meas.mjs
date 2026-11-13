import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8781);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8781/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
const bands=[['bust',1.0,1.08,'Spine2'],['waist',0.9,0.97,'Spine1'],['hips',0.78,0.86,'Hips']];
const clips=[['stand',[0]],['idle',[1,3,5]],['walk',[0.1,0.4,0.7]],['wave',[1,2]],['look',[1.5,2.6]],['talk',[1,2.5]],['laugh',[1,1.6]],['hair',[0.9,1.2]],['kiss',[0.8,1.8]],['point',[1.2]],['shrug',[0.9]],['think',[2]],['cheer',[1,1.2]],['jump',[0.25,0.5,0.9]],['dance',[0.3,0.6,1.1,1.6]],['sit',[2]],['sitx',[2]],['browse',[2]],['adjust',[1.5]]];
const res={};for(const[c,ts]of clips)for(const t of ts){await p.evaluate((c,t)=>window.__dbg.setBase(c,t),c,t);res[c+'@'+t]=await p.evaluate(b=>window.__dbg.measure(b),bands);}
const st=res['stand@0'];
for(const[k,v]of Object.entries(res)){let worst=1,big=1;const r=bands.map(([n])=>{const q=[0,1,2].map(i=>v[n][i]/st[n][i]);worst=Math.min(worst,...q);big=Math.max(big,...q);return n+' '+q.map(x=>(x*100).toFixed(0)).join('/');});console.log(k.padEnd(12),r.join('  '),worst<0.94||big>1.08?'  << '+(worst*100).toFixed(0)+'..'+(big*100).toFixed(0):'');}
console.log('stand abs',JSON.stringify(st),'errors',errs.length?errs:'none');await b.close();srv.close();
