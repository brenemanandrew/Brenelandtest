import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8773);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.goto('http://localhost:8773/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
const data=await p.evaluate(()=>{const C=window.__poser.clips(),out={clips:{}};for(const n of ['sassy_idle','sassy_walk','sassy_run','flirty_wave','look_back','talk','laugh','hair_toss','blow_kiss','point','shrug','think','cheer','jump','dance','sit','sit_cross','browse','adjust'])
  out.clips[n]=C[n].tracks.map(t=>({name:t.name,times:Array.from(t.times),values:Array.from(t.values)}));out.face=window.__poser.face();return out;});
fs.writeFileSync('/home/claude/out/face-export.json',JSON.stringify(data));console.log(data.face.bones.length,'face bones',data.face.boneNames.length,'bones',Object.keys(data.clips).map(k=>k+':'+data.clips[k].length));
await b.close();srv.close();
