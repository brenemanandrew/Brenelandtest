// the real walk-in, then Body > Body frame > a whole-outfit model, then a hairstyle: node sdflow.mjs ROOT OUTDIR
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import puppeteer from 'puppeteer-core';
const [ROOT,OUT]=process.argv.slice(2),PORT=8990;
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:420,height:860});p.on('pageerror',e=>console.log('ERR',(e.stack||e.message).slice(0,400)));
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load',timeout:120000});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:180000});await wait(1500);
await p.evaluate(()=>[...document.querySelectorAll('.who-btn')].find(b=>b.textContent.includes('Female')).click());
const chip=()=>p.evaluate(()=>{const c=[...document.querySelectorAll('.chip')].find(b=>b.textContent.includes('untucked')&&b.offsetParent);if(c){c.click();return true;}return false;});
let ok=false;for(let i=0;i<40&&!ok;i++){await wait(8000);ok=await chip();if(!ok)await p.evaluate(()=>{const n=document.getElementById('crnext');if(n&&n.offsetParent)n.click();});}
console.log('chip clicked',ok);await wait(45000);await p.screenshot({path:OUT+'/sdflow-1.png'});
await p.evaluate(()=>{const n=document.getElementById('crprev')||[...document.querySelectorAll('button')].find(b=>/back/i.test(b.textContent));if(n)n.click();});await wait(20000);
const t=await p.evaluate(()=>{const ts=[...document.querySelectorAll('.ed-panel:not([hidden]) .tile')].map(b=>b.title);const b=[...document.querySelectorAll('.ed-panel:not([hidden]) .tile')].find(b=>/ponytail/i.test(b.title));if(b)b.click();return ts.join('|');});console.log('tiles',t);
await wait(25000);await p.screenshot({path:OUT+'/sdflow-2.png'});await b.close();srv.close();
