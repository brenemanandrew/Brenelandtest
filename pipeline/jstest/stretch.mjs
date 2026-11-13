import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8801);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.goto('http://localhost:8801/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
await p.evaluate(()=>document.querySelector('#who [data-r=plus]').click());await p.waitForFunction(()=>window.__x.C===window.__x.cache.plus&&document.getElementById('loading').hidden,{timeout:120000});
const res=await p.evaluate(()=>{const {THREE}=window.__x,C=window.__x.C,m=C.mesh,g=m.geometry,P=g.attributes.position,I=g.index.array,SI=g.attributes.skinIndex,SW=g.attributes.skinWeight;const out={};
 for(const[c,t]of [['cheer',1.1],['walk',0.3],['shrug',0.9]]){window.__dbg.setBase(c,t);C.root.updateMatrixWorld(true);const Q=[];const v=new THREE.Vector3();
  for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i);m.applyBoneTransform(i,v);Q.push(v.clone());}
  const bad=new Map();for(let k=0;k<I.length;k+=3)for(const[a,bb]of [[I[k],I[k+1]],[I[k+1],I[k+2]],[I[k+2],I[k]]]){const d0=new THREE.Vector3().fromBufferAttribute(P,a).distanceTo(new THREE.Vector3().fromBufferAttribute(P,bb)),d1=Q[a].distanceTo(Q[bb]);if(d1>0.04&&d1>d0*3){bad.set(a,1);bad.set(bb,1);}}
  out[c]=[...bad.keys()].slice(0,12).map(i=>({p:[P.getX(i),P.getY(i),P.getZ(i)].map(x=>+x.toFixed(3)),w:[0,1,2,3].filter(j=>SW.getComponent(i,j)>0.01).map(j=>C.bones[SI.getComponent(i,j)].name.replace('mixamorig','')+':'+SW.getComponent(i,j).toFixed(2))}));out[c+'_n']=bad.size;}
 return out;});
console.log(JSON.stringify(res,null,0).replace(/\},\{/g,'},\n{'));await b.close();srv.close();
