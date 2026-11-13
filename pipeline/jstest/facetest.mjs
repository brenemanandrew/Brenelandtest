import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8771);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:1000,height:700});
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|404/.test(m.text()))errs.push(m.text());});
await p.goto('http://localhost:8771/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000}).catch(()=>errs.push('never loaded'));
await wait(500);
if(!errs.length){
await p.evaluate(()=>{window.__dbg.setBase('stand',0);window.__dbg.dots();const{camera,orbit}=window.__dbg;orbit.target.set(0.01,1.41,0.1);camera.position.set(0,1.42,1.45);orbit.update();});
const F=[['neutral',{}],['smile',{smile:0.7}],['big',{smile:1,open:0.45,wide:0.3,brow:0.3}],['smirk',{smile:0.4,smirk:0.45,oneBrow:0.5}],['wink',{blinkL:1,smile:0.6,smirk:0.15}],
 ['sly',{blinkL:0.38,blinkR:0.38,smile:0.35,smirk:0.25,oneBrow:0.5,lookX:-0.4}],['kiss',{pucker:1,blinkL:0.55,blinkR:0.55,brow:0.3}],['surprised',{open:0.6,brow:1,tilt:0.2,pucker:0.3}],['lookR',{lookX:1,lookY:0.3}],['annoyed',{brow:-0.5,tilt:-0.6,smile:-0.3,blinkL:0.25,blinkR:0.25}]];
let i=0;for(const[n,o]of F){await p.evaluate(o=>window.__dbg.face(o),o);await wait(300);await p.screenshot({path:`/home/claude/out/fx-${String(i++).padStart(2,'0')}-${n}.png`,clip:{x:175,y:150,width:300,height:330}});}
}
console.log('errors',errs.length?errs:'none');await b.close();srv.close();
