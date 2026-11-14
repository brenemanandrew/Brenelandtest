// clicks the four Body buttons in the creator and screenshots each: node bodybtn.mjs ROOT RIG OUTDIR
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import puppeteer from 'puppeteer-core';
const [ROOT,RIG,OUT]=process.argv.slice(2),PORT=8900+Math.floor(Math.random()*90);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];const p=await b.newPage();await p.setViewport({width:430,height:900});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:180000});await wait(1000);
await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:180000},RIG);
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;});
const clickText=t=>p.evaluate(t=>{const fl=[...document.querySelectorAll('.field')].find(f=>f.querySelector('.ed-label')?.textContent==='Build');const pool=t==='Body'?[...document.querySelectorAll('button')]:[...fl.querySelectorAll('button')];const el=pool.find(x=>x.textContent.trim()===t);if(el){el.click();return true;}return false;},t);
console.log('body tab',await clickText('Body'));await wait(1500);
for(const l of ['Thin','Average','Athletic','Plus']){console.log(l,await clickText(l));await wait(2500);
  const st=await p.evaluate(()=>{const m=window.__x.C.mesh,d=m.morphTargetDictionary;return Object.fromEntries(Object.entries(d).filter(([k])=>['slim','average','athletic','heavy'].includes(k)).map(([k,i])=>[k,+m.morphTargetInfluences[i].toFixed(2)]));});
  const on=await p.evaluate(()=>[...document.querySelectorAll('button.on')].map(x=>x.textContent.trim()).join('|'));console.log('  morphs',JSON.stringify(st),'lit:',on);
  await p.screenshot({path:`${OUT}/body-${RIG}-${l}.png`});}
console.log('errors',errs.filter(e=>!e.includes('setPointer')));await b.close();srv.close();
