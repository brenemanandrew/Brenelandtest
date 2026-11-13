// Retarget clips from Belinda's rigs onto Leia by each mapped joint's world-space turn away from its standing pose.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT='/home/claude/ptest';
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d);});}).listen(8790);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8790/',{waitUntil:'load'});await p.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:120000});
const JOBS=[['meshy','idle','Idle'],['cel','Walking','Walk'],['cel','Running','Run'],['meshy','wave','Wave']];
const out=await p.evaluate(async(JOBS)=>{
  const {cache,RIGS,THREE,setWorldQuat,loadRig}=window.__x;
  for(const id of ['meshy','cel','leia'])if(!cache[id])await loadRig(id);
  const tgt=cache.leia,Rt=RIGS.leia.bones;
  const ORDER=['hips','spine1','spine2','chest','neck','head','collarL','shoulderL','elbowL','wristL','collarR','shoulderR','elbowR','wristR','hipL','kneeL','ankleL','toesL','hipR','kneeR','ankleR','toesR'];
  const toStand=c=>{for(const bn of c.bones){const[q,p]=c.stand.get(bn);bn.quaternion.copy(q);bn.position.copy(p);}c.root.updateMatrixWorld(true);};
  const rootQ=c=>c.root.getWorldQuaternion(new THREE.Quaternion());
  const rel=(c,bn)=>rootQ(c).invert().multiply(bn.getWorldQuaternion(new THREE.Quaternion()));
  const relP=(c,bn)=>c.root.worldToLocal(bn.getWorldPosition(new THREE.Vector3()));
  const res={};
  for(const[sid,clipName,outName]of JOBS){
    const src=cache[sid],Rs=RIGS[sid].bones,clip=src.clips[clipName];
    toStand(src);toStand(tgt);
    const sS={},sT={};for(const id of ORDER){sS[id]=rel(src,src.byName[Rs[id]]);sT[id]=rel(tgt,tgt.byName[Rt[id]]);}
    const hS=relP(src,src.byName[Rs.hips]),hT=relP(tgt,tgt.byName[Rt.hips]),k=hT.y/hS.y;
    const mx=new THREE.AnimationMixer(src.root),a=mx.clipAction(clip);a.play();
    const n=Math.max(2,Math.round(clip.duration*30)+1),times=[],Q=new Map(tgt.bones.map(bn=>[bn,[]])),HP=[];
    for(let f=0;f<n;f++){const t=f/(n-1)*clip.duration;times.push(t);
      toStand(src);mx.setTime(t);src.root.updateMatrixWorld(true);toStand(tgt);
      const rq=rootQ(tgt);
      for(const id of ORDER){const bs=src.byName[Rs[id]],bt=tgt.byName[Rt[id]];
        const D=rel(src,bs).multiply(sS[id].clone().invert());const w=rq.clone().multiply(D.multiply(sT[id]));setWorldQuat(bt,w);bt.updateMatrixWorld(true);}
      const hb=tgt.byName[Rt.hips],d=relP(src,src.byName[Rs.hips]).sub(hS).multiplyScalar(k),wp=tgt.root.localToWorld(hT.clone().add(d));
      hb.position.copy(hb.parent.worldToLocal(wp));
      for(const bn of tgt.bones)Q.get(bn).push(...bn.quaternion.toArray());HP.push(...hb.position.toArray());}
    a.stop();mx.uncacheRoot(src.root);
    const clean=s=>THREE.PropertyBinding.sanitizeNodeName(s);
    const tracks=tgt.bones.map(bn=>({name:clean(bn.name)+'.quaternion',times,values:Q.get(bn)}));
    tracks.push({name:clean(tgt.byName[Rt.hips].name)+'.position',times,values:HP});
    res[outName]=tracks;toStand(src);toStand(tgt);}
  return res;},JOBS);
fs.writeFileSync('/home/claude/out/leia-clips.json',JSON.stringify(out));
console.log(Object.entries(out).map(([k,v])=>k+':'+v.length+' tracks '+v[0].times.length+' frames'),'errors',errs.length?errs:'none');
await b.close();srv.close();
