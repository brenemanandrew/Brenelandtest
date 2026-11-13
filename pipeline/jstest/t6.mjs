import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';
const buf=fs.readFileSync(process.argv[2]);const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
const L=new GLTFLoader();L.register(()=>({name:'stub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
L.parse(ab,'',g=>{const mx=new THREE.AnimationMixer(g.scene);let sm;g.scene.traverse(o=>{if(o.isSkinnedMesh)sm=o;});const hand=sm.skeleton.getBoneByName('mixamorigLeftHand');
 for(const c of g.animations){const a=mx.clipAction(c);a.play();mx.setTime(c.duration*0.5);g.scene.updateMatrixWorld(true);console.log(c.name,c.duration.toFixed(2),'tracks',c.tracks.length,'L hand',hand.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)));a.stop();}
 console.log('profile',JSON.stringify(g.scene.userData.character||g.userData));},e=>console.log('ERR',e));
