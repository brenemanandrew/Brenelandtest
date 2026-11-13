import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';
globalThis.self = globalThis;
const buf = fs.readFileSync(process.argv[2]);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const L = new GLTFLoader();
// textures can't decode in node: swap the texture loader for a stub
L.register(p => ({ name: 'stub', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
L.parse(ab, '', g => {
  const root = g.scene; let sm; root.traverse(o => { if (o.isSkinnedMesh) sm = o; });
  const byName = new Map(sm.skeleton.bones.map(b => [b.name.toLowerCase(), b]));
  const mixer = new THREE.AnimationMixer(root);
  const out = {};
  for (const c of g.animations) {
    const a = mixer.clipAction(c); a.play(); mixer.setTime(c.duration * 0.37); root.updateMatrixWorld(true);
    const h = byName.get('hand_l').getWorldPosition(new THREE.Vector3()), f = byName.get('foot_l').getWorldPosition(new THREE.Vector3());
    out[c.name] = { dur: c.duration, handL: h.toArray().map(v => +v.toFixed(3)), footL: f.toArray().map(v => +v.toFixed(3)) };
    a.stop();
  }
  const box = new THREE.Box3().setFromObject(sm); 
  const head = byName.get('head').getWorldPosition(new THREE.Vector3());
  console.log(JSON.stringify({ bones: sm.skeleton.bones.length, pelvisParent: byName.get('pelvis').parent.name, head: head.toArray().map(v=>+v.toFixed(3)), clips: out }, null, 1));
}, e => console.log('ERR', e.message));
