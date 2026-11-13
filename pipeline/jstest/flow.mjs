import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest',PORT=8792,RIG=process.argv[2]||'plus';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){console.log('404',u);r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:420,height:860});p.on('pageerror',e=>console.log('ERR',(e.stack||e.message).slice(0,700)));p.on('console',m=>{if(!m.text().includes('GL Driver'))console.log('CON',m.text().slice(0,200));});
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1500);
await p.evaluate(r=>(console.log([...document.querySelectorAll('.who-btn')].map(b=>b.dataset.id).join()),[...document.querySelectorAll('.who-btn')].find(b=>b.textContent.includes(r)).click()),RIG);
for(let i=0;i<22;i++){await wait(10000);const s=await p.evaluate(()=>({phase:window.__room.phase,ent:window.__cr.entered,step:window.__cr.step,vis:window.__x.holder.visible,z:+window.__x.holder.position.z.toFixed(2),C:!!window.__x.C,load:document.getElementById('loading').hidden}));console.log(i,JSON.stringify(s));if(s.ent&&s.phase==='done')break;}
await wait(3000);
for(let k=0;k<3;k++){await p.evaluate(()=>document.getElementById('crnext').click());await wait(5000);}console.log('step',await p.evaluate(()=>window.__cr.step));await wait(25000);await p.screenshot({path:'/home/claude/out/flow-face.png'});
const tap=async(t,f)=>{await p.evaluate(t=>{const b=[...document.querySelectorAll('.ed-panel:not([hidden]) .tile')].find(b=>b.title.toLowerCase().includes(t));if(b)b.click();else console.log('NOTILE',t);},t);await wait(14000);await p.screenshot({path:'/home/claude/out/flow-'+f+'.png'});};
await tap('sneaker','shoes');await tap('jeans','legs');await tap('sweater','top');await b.close();srv.close();
