// Render GLBs with a 3-band toon material + ink outline, in a grid with labels. node toon_sheet.js OUT.png a.glb b.glb ...
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
(async()=>{const out=process.argv[2],files=process.argv.slice(3);
const data=files.map(f=>({name:path.basename(f,'.glb'),b64:fs.readFileSync(f).toString('base64')}));
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});const p=await b.newPage({viewport:{width:1600,height:Math.ceil(data.length/4)*420},deviceScaleFactor:1});
p.on('console',m=>console.log('page:',m.text()));
await p.setContent(`<html><body style="margin:0;background:#f3ead8"><script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.181.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.181.0/examples/jsm/"}}</script></body></html>`);
await p.evaluate(async(data)=>{
 const THREE=await import('three');const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const W=400,H=420,cols=4,rows=Math.ceil(data.length/cols);
 const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(W*cols,H*rows);r.setScissorTest(true);r.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(r.domElement);
 const g=new Uint8Array([90,170,255]);const grad=new THREE.DataTexture(g,3,1,THREE.RedFormat);grad.minFilter=grad.magFilter=THREE.NearestFilter;grad.needsUpdate=true;
 const ld=new GLTFLoader();
 for(let i=0;i<data.length;i++){
  const buf=Uint8Array.from(atob(data[i].b64),c=>c.charCodeAt(0)).buffer;
  const gl=await new Promise((res,rej)=>ld.parse(buf,'',res,rej));
  const sc=new THREE.Scene();sc.background=new THREE.Color('#f3ead8');
  sc.add(new THREE.AmbientLight(0xffffff,1.1));const dl=new THREE.DirectionalLight(0xffffff,2.2);dl.position.set(3,5,4);sc.add(dl);
  const root=gl.scene;let tris=0;
  const ms=[];root.traverse(o=>{if(o.isMesh)ms.push(o)});ms.forEach(o=>{{const m=o.material;o.material=new THREE.MeshToonMaterial({map:m.map||null,color:m.map?0xffffff:m.color,gradientMap:grad});
    tris+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
    const ol=new THREE.Mesh(o.geometry,new THREE.MeshBasicMaterial({color:0x2a1d14,side:THREE.BackSide}));ol.userData.ol=1;o.add(ol);}});
  const box=new THREE.Box3().setFromObject(root),sz=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
  const rad=sz.length()/2;root.traverse(o=>{if(o.userData.ol)o.scale.setScalar(1+0.012);});
  sc.add(root);const cam=new THREE.PerspectiveCamera(30,W/H,0.01,100*rad);
  const dv=new THREE.Vector3(0.45,0.25,1).normalize().multiplyScalar(rad*3.6);cam.position.copy(c).add(dv);cam.lookAt(c);
  const x=(i%cols)*W,y=(rows-1-Math.floor(i/cols))*H;r.setScissor(x,y,W,H);r.setViewport(x,y,W,H);r.render(sc,cam);
  const d=document.createElement('div');d.textContent=data[i].name+'  '+Math.round(tris)+' tris  '+sz.x.toFixed(2)+'x'+sz.y.toFixed(2)+'x'+sz.z.toFixed(2);
  d.style.cssText=`position:absolute;left:${(i%cols)*W+8}px;top:${Math.floor(i/cols)*H+6}px;font:15px sans-serif;color:#333`;document.body.appendChild(d);}
},data);
await p.waitForTimeout(500);await p.screenshot({path:out,fullPage:true});await b.close();})();
