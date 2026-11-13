import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8766);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const errs=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
for(const [w,h,name] of [[1280,800,'desk'],[390,844,'phone']]){
  const p=await b.newPage(); await p.setViewport({width:w,height:h,isMobile:name==='phone',hasTouch:name==='phone'});
  p.on('pageerror',e=>errs.push(name+': '+e.message)); p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|404/.test(m.text()))errs.push(name+' console: '+m.text());});
  await p.goto('http://localhost:8766/',{waitUntil:'load'});
  await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:90000}).catch(()=>errs.push(name+': still loading: '+document?.title));
  await wait(1500);
  if(name==='desk'){
    // load the Hello example (sneakers, a raised arm, finger curl), then screenshot
    await p.evaluate(()=>{document.querySelector('[data-p=save]').click();});
    await p.evaluate(()=>[...document.querySelectorAll('#saved .item')].find(i=>i.textContent.includes('Example: Hello')&&!i.textContent.includes('detailed')).querySelector('button').click());
    await wait(1500); await p.evaluate(()=>document.querySelector('[data-p=pose]').click()); await wait(300);
    await p.screenshot({path:'/home/claude/out/p2-hello.png'});
    await p.evaluate(()=>[...document.querySelectorAll('#saved .item')].find(i=>i.textContent.includes('Crouch')).querySelector('button').click()); await wait(1500);
    await p.evaluate(()=>document.querySelector('[data-p=look]').click()); await wait(300);
    await p.screenshot({path:'/home/claude/out/p2-crouch.png'});
    // switch to the detailed Belinda and back: no errors
    await p.evaluate(()=>{document.querySelector('[data-p=start]').click();[...document.querySelectorAll('#who .chip')][1].click();}); await wait(4000);
    await p.screenshot({path:'/home/claude/out/p2-meshy.png'});
    await p.evaluate(()=>[...document.querySelectorAll('#who .chip')][0].click()); await wait(1500);
    await p.evaluate(()=>[...document.querySelectorAll('#bases .chip')].find(c=>c.textContent==='Run').click()); await wait(800);
    await p.click('#undo'); await wait(500);
  } else await p.screenshot({path:'/home/claude/out/p2-phone.png'});
  await p.close();
}
console.log('errors:',errs.length?errs:'none');
await b.close(); srv.close();
