import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])==='/'?'index.html':decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'});r.end(d);});}).listen(8765);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const errs=[];
for(const [w,h,name] of [[390,844,'phone']]){
  const p=await b.newPage(); await p.setViewport({width:w,height:h,deviceScaleFactor:1,isMobile:name==='phone',hasTouch:name==='phone'});
  p.on('pageerror',e=>errs.push(name+': '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(name+' console: '+m.text());});
  await p.goto('http://localhost:8765/',{waitUntil:'load'});
  await p.waitForFunction(()=>!document.getElementById('loading'),{timeout:60000}).catch(()=>errs.push(name+': still loading'));
  await new Promise(r=>setTimeout(r,2500));
  if(name==='desk'){ // a real slider change on the picked head, and the elbow chip
    await p.click('#joints .chip[data-b="lowerarm_r"]');
    await p.$eval('#rx',el=>{el.value=70;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});
    await new Promise(r=>setTimeout(r,800));
    console.log('edited chips:', await p.$$eval('#joints .chip.edited',a=>a.map(x=>x.dataset.b)), 'undo enabled:', await p.$eval('#undo',e=>!e.disabled));
  }
  await p.screenshot({path:`/home/claude/out/poser-${name}.png`});
  await p.close();
}
console.log('errors:',errs.length?errs:'none');
await b.close(); srv.close();
