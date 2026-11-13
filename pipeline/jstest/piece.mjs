// one row per piece: four close views at the height the phone camera uses, plus how much of the picture is "underlayer" (cloth missing or skin pushed through) in two of them
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';const RIG=process.argv[2],items=process.argv[3].split(',').map(s=>s.split(':')),tag=process.argv[4],build=+(process.argv[5]||(RIG==='plus'?100:0)),PORT=8600+Math.floor(Math.random()*90);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];
const p=await b.newPage();await p.setViewport({width:900,height:700});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+PORT+'/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});await wait(1000);
await p.evaluate(r=>document.querySelector('#who [data-r='+r+']').onclick(),RIG);await p.waitForFunction(r=>window.__x.C===window.__x.cache[r]&&document.getElementById('loading').hidden,{timeout:120000},RIG);
await p.evaluate(()=>{window.__x.holder.visible=true;window.__x.holder.position.z=0;document.getElementById('creator').style.display='none';document.getElementById('crfab').style.display='none';});
const set=(id,v)=>p.evaluate((id,v)=>{const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));},id,v);
await set('build',build);await wait(1200);
const cam=(t,c)=>p.evaluate((t,c)=>{const{camera,orbit}=window.__dbg;document.querySelector('#stage canvas').dispatchEvent(new Event('pointerdown'));camera.clearViewOffset();camera.updateProjectionMatrix();orbit.autoRotate=false;orbit.minPolarAngle=0;orbit.maxPolarAngle=3.1;orbit.minAzimuthAngle=-Infinity;orbit.maxAzimuthAngle=Infinity;orbit.target.set(...t);camera.position.set(...c);orbit.update();window.__room.g.visible=false;},t,c);
const male=RIG==='male';let n=0;const res=[];
for(const[sl,k]of items){const f={top:'none',bottom:'none',shoes:'none'};f[sl]=k;if(sl==='shoes')f.bottom='none';await p.evaluate(f=>window.__setFeat(f),f);
  try{await p.waitForFunction((sl,k)=>window.__x.C.hair[sl+':'+k]&&window.__x.C.hair[sl+':'+k].length,{timeout:60000},sl,k);}catch(e){console.log('LOADFAIL',k);continue;}
  const y=sl==='top'?(male?1.25:1.12):sl==='bottom'?(male?0.6:0.5):0.1,d=sl==='top'?2.3:sl==='bottom'?2.7:1.25,lowy=sl==='shoes'?0.05:y-0.55;
  const views=[[0.45,y+0.05],[1.57,y],[2.75,y+0.05],[-0.5,lowy]];const pose=sl==='top'?['clap',0.7]:['fwalk',0.4];let i=0;const mag=[];
  for(const[bs,tm,vs]of [['stand',0,views],[pose[0],pose[1],[views[0],views[2]]]]){await p.evaluate((bs,tm)=>{if(document.getElementById('play').textContent==='Stop')document.getElementById('play').click();window.__dbg.setBase(bs,tm);},bs,tm);
    for(const[a,cy]of vs){await cam([0,y,0],[Math.sin(a)*d,cy,Math.cos(a)*d]);await wait(450);await p.screenshot({path:`/home/claude/out/pc-${tag}-${n}-${i}.png`,clip:{x:290,y:130,width:320,height:440}});
      // the same view with the underlayer painted pure magenta, to measure how much of it shows
      await p.evaluate((sl,k)=>{const m=window.__x.C.hair[sl+':'+k][0].userData.under;if(m){m.userData.c0=m.material.color.getHex();m.material.color.setHex(0xff00ff);m.material.gradientMap=null;m.material.emissive&&m.material.emissive.setHex(0xff00ff);m.material.needsUpdate=true;}},sl,k);await wait(350);
      const buf=await p.screenshot({clip:{x:290,y:130,width:320,height:440},encoding:'binary'});fs.writeFileSync(`/home/claude/out/pm-${tag}-${n}-${i}.png`,buf);
      await p.evaluate((sl,k)=>{const m=window.__x.C.hair[sl+':'+k][0].userData.under;if(m){m.material.color.setHex(m.userData.c0);m.material.emissive&&m.material.emissive.setHex(0);m.material.needsUpdate=true;}},sl,k);i++;}}
  res.push(k);n++;}
fs.writeFileSync(`/home/claude/out/pc-${tag}.json`,JSON.stringify(res));console.log('errors',errs.filter(e=>!e.includes('setPointer')));await b.close();srv.close();
