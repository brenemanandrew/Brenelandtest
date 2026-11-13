import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';
const buf=fs.readFileSync(process.argv[2]);const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
const L=new GLTFLoader();L.register(()=>({name:'stub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
L.parse(ab,'',g=>{let sm;g.scene.traverse(o=>{if(o.isSkinnedMesh)sm=o;});const mx=new THREE.AnimationMixer(g.scene);
 const lid=sm.skeleton.getBoneByName('face_lid_L'),pos=sm.geometry.attributes.position;
 const v=new THREE.Vector3(); let chin=-1,cy=9;for(let i=0;i<pos.count;i++){if(pos.getZ(i)>0.12&&pos.getY(i)<cy&&pos.getY(i)>1.27&&Math.abs(pos.getX(i)-0.015)<0.02){cy=pos.getY(i);chin=i;}}
 for(const c of g.animations.filter(a=>/Wave|Look/.test(a.name))){const a=mx.clipAction(c);a.play();for(const t of [0.15,2.15,2.7]){mx.setTime(t);g.scene.updateMatrixWorld(true);
   const p=new THREE.Vector3().fromBufferAttribute(pos,chin);sm.applyBoneTransform(chin,p);console.log(c.name,t,'lid_L world y',lid.getWorldPosition(new THREE.Vector3()).y.toFixed(4),'chin y',p.y.toFixed(4));}a.stop();}
 console.log('bones',sm.skeleton.bones.length,'face',sm.skeleton.bones.filter(b=>b.name.startsWith('face_')).length,'extras',Object.keys(g.scene.userData));},e=>console.log('ERR',e));
