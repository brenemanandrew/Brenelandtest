import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseGlb } from './glbc.mjs';
import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const L = new GLTFLoader(); L.register(() => ({ name: 'stub', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
const g = await new Promise((res, rej) => L.parse(ab.slice(0), '', res, rej));
const d = await parseGlb(ab.slice(0)); const m = d.make();
const pos = (root, name) => { let o; root.traverse(x => { if (x.name === name) o = x; }); return o.getWorldPosition(new THREE.Vector3()); };
// skinned vertex position check (a hand vertex) through three's skinning math
const skinnedV = (mesh, i) => { const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.applyBoneTransform(i, v); return v.applyMatrix4(mesh.matrixWorld); };
let gm; g.scene.traverse(o => { if (o.isSkinnedMesh) gm = o; });
let worst = 0;
for (const c of g.animations) {
  const ma = new THREE.AnimationMixer(g.scene), mb = new THREE.AnimationMixer(m.root);
  ma.clipAction(c).play(); mb.clipAction(m.clips[c.name]).play();
  for (const t of [0, 0.31, 0.77, c.duration * 0.6]) {
    ma.setTime(t); mb.setTime(t); g.scene.updateMatrixWorld(true); m.root.updateMatrixWorld(true);
    for (const b of ['hand_l', 'foot_r', 'head']) worst = Math.max(worst, pos(g.scene, b).distanceTo(pos(m.root, b)));
    for (const i of [0, 5000, 12000, 20000]) worst = Math.max(worst, skinnedV(gm, i).distanceTo(skinnedV(m.mesh, i)));
  }
}
console.log('clips', d.clips, 'max difference vs GLTFLoader (m):', worst.toExponential(2));
// two copies are independent
const m2 = d.make(); m2.root.getObjectByName('head').rotation.y = 1; m2.root.updateMatrixWorld(true); m.root.updateMatrixWorld(true);
console.log('copies independent:', pos(m.root, 'head').distanceTo(pos(m2.root, 'head')) < 1e-9 && m.root.getObjectByName('head').rotation.y === 0);
console.log('rest height (head bone y):', pos(m.root,'head').y.toFixed(3), 'pelvis parent:', m.root.getObjectByName('pelvis').parent.name);
