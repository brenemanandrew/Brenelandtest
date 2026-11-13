import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createRequire } from 'node:module';
const ROOT='/home/claude/ptest';const RIG=process.argv[2]||'plus';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8878);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=await b.newPage();await p.setViewport({width:900,height:700});
await p.goto('http://localhost:8878/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1200);
if(RIG!=='plus'){await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:120000},RIG);}
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;document.getElementById('creator').style.display='none';document.getElementById('crfab').style.display='none';if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase('stand',0);document.querySelector('#featrows [data-fk=hair][data-fv=none]').click();});
const y=RIG==='plus'?1.6:1.62,x=RIG==='plus'?0.0175:0;
await p.evaluate((x,y)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.target.set(x,y,0);camera.position.set(x,y,0.6);orbit.update();},x,y);
// the lit skin colour on screen: the most common bright colour in a patch of forehead, read from the canvas
const read=()=>p.evaluate(()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const cv=document.querySelector('#stage canvas'),t=document.createElement('canvas');t.width=60;t.height=40;const g=t.getContext('2d');g.drawImage(cv,cv.width/2-30,cv.height/2-20,60,40,0,0,60,40);const d=g.getImageData(0,0,60,40).data,px=[];for(let i=0;i<d.length;i+=4)px.push([d[i],d[i+1],d[i+2]]);px.sort((a,b)=>(b[0]+b[1]+b[2])-(a[0]+a[1]+a[2]));const m=px.slice(100,700),k=c=>m.map(v=>v[c]).sort((a,b)=>a-b)[300];res([k(0),k(1),k(2)]);}))));
const tones=await p.evaluate(()=>[...document.querySelectorAll('#featrows [data-fk=skin]')].map(b=>b.dataset.fv));
const hexOf=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#featrows [data-fk=skin]')].map(b=>{const c=getComputedStyle(b.querySelector('span')).backgroundColor.match(/\d+/g).map(Number);return [b.dataset.fv,c];})));
const hx=c=>'#'+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');const out={};
for(const t of tones){const want=hexOf[t];let alb=want.slice();let got;
  for(let it=0;it<5;it++){await p.evaluate((t,h)=>{window.__skinOv={[t]:h};document.querySelector('#featrows [data-fk=skin][data-fv='+t+']').click();},t,hx(alb));await wait(700);got=await read();
    if(it===0)console.log(t,'swatch',hx(want),'plain render',hx(got));alb=alb.map((v,k)=>Math.max(4,Math.min(255,v*Math.pow(want[k]/Math.max(1,got[k]),0.9))));}
  await p.evaluate((t,h)=>{window.__skinOv={[t]:h};document.querySelector('#featrows [data-fk=skin][data-fv='+t+']').click();},t,hx(alb));await wait(700);got=await read();out[t]=hx(alb);console.log(t,'  paint',hx(alb),'-> render',hx(got));}
console.log('RESULT',JSON.stringify(out));await b.close();srv.close();
