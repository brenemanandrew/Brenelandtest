// world-refresh test: Nala's Meshy model, driven by the game's own dog rig (dogs.js). Meshy's own rig for her was unusable
// (leg bones above her back, an ear bone under the ground), so her mesh is bound to the code dog's parts instead: each vertex
// follows the nearest part (body, the three neck bones, head, the four tail bones, each leg's upper, lower, pastern and paw),
// blended across a joint, so every pose the code dog makes (walk, trot, gallop, sit, nap, play, wag) moves her. The code dog's
// own meshes are hidden, never removed. ?olddog or ?oldworld (or a failed load) keeps the code dog.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/jsm/loaders/GLTFLoader.js';
import { GRADIENT_3 } from './toon.js';
let GEO = null, MAP = null;
const q = new URLSearchParams(location.search);
if (!q.has('oldworld') && !q.has('olddog')) {
  try {
    const gl = await new GLTFLoader().loadAsync('/models/refresh/nala_mesh.glb');
    gl.scene.traverse(o => { if (o.isMesh && !GEO) { GEO = o.geometry; MAP = o.material.map; } });
  } catch (e) { console.warn('Nala model failed, keeping the code dog', e); }
}
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function segDist(p, a, b) { _a.subVectors(b, a); const L2 = _a.lengthSq(); let t = L2 > 0 ? _b.subVectors(p, a).dot(_a) / L2 : 0; t = Math.max(0, Math.min(1, t)); return _v.copy(a).addScaledVector(_a, t).distanceTo(p); }

export function dressNala(dog) {
  if (!GEO) return false;
  const root = dog.root; root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const P = (o, local = null) => (local ? o.localToWorld(local.clone()) : new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)).applyMatrix4(inv);
  const old = []; root.traverse(o => { if (o.isMesh) old.push(o); });
  // the code dog's size (root space), legs and body only: the tail's carriage would stretch the fit
  // the segments every vertex can follow: [bone, start, end]
  const S = [];
  const hips = dog.legs.map(l => P(l.hip)), hind = hips.slice(2).reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(0.5), front = hips.slice(0, 2).reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(0.5);
  S.push([dog.body, hind, front]);
  const nb = dog.bones; S.push([nb[0], P(nb[0]), P(nb[1])], [nb[1], P(nb[1]), P(nb[2])], [nb[2], P(nb[2]), P(dog.head)]);
  S.push([dog.head, P(dog.head), P(dog.head, new THREE.Vector3(0, -0.02, 0.26))]);
  const tb = dog.tailBones; for (let i = 0; i < 4; i++) S.push([tb[i], P(tb[i]), i < 3 ? P(tb[i + 1]) : P(tb[i], new THREE.Vector3(0, 0.12, 0))]);
  for (const l of dog.legs) { S.push([l.upper, P(l.upper), P(l.lower)], [l.lower, P(l.lower), P(l.foot)], [l.foot, P(l.foot), P(l.paw)], [l.paw, P(l.paw), P(l.paw, new THREE.Vector3(0, 0, 0.06))]); }
  // fit: one scale from her height (the code dog's head top), feet centred on the code dog's four paws
  const g = GEO.clone(), pos = g.attributes.position; g.computeBoundingBox();
  const mb = g.boundingBox, paws = dog.legs.map(l => P(l.paw)), pc = paws.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(0.25);
  const headTop = P(dog.head).y + 0.1 * dog.sc, k = (headTop - pc.y) / (mb.max.y - mb.min.y);
  let fx = 0, fz = 0, nf = 0;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < mb.min.y + 0.08 * (mb.max.y - mb.min.y)) { fx += pos.getX(i); fz += pos.getZ(i); nf++; }
  fx /= nf; fz /= nf;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pc.x + (pos.getX(i) - fx) * k, pc.y - 0.02 + (pos.getY(i) - mb.min.y) * k, pc.z + (pos.getZ(i) - fz) * k);
  g.computeVertexNormals();
  // weights: the nearest part, blended with the next one across a 5 cm band
  const HEADSEG = new Set([2, 3, 4]), neckZ = P(nb[1]).z, neckY = P(nb[0]).y - 0.06 * dog.sc;   // (S: 0 body, 1-3 neck, 4 head)
  const n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3(), BAND = 0.05 * dog.sc;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    let d1 = 1e9, i1 = 0, d2 = 1e9, i2 = 0;
    const headSide = p.z > neckZ && p.y > neckY;   // past the neck's middle and above the shoulder: only the neck and head bones
    for (let s = 0; s < S.length; s++) {
      if (headSide && !HEADSEG.has(s)) continue; const d = segDist(p, S[s][1], S[s][2]); if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = s; } else if (d < d2) { d2 = d; i2 = s; } }
    const w2 = Math.max(0, 0.5 * (1 - (d2 - d1) / BAND));
    si[i * 4] = i1; si[i * 4 + 1] = i2; sw[i * 4] = 1 - w2; sw[i * 4 + 1] = w2;
  }
  // her tail hangs down from low on the rump, the code dog's is carried high and wagged from a root well above it: following
  // those bones flings her tail up into a slab. For now her tail rides the body (steady, no wag): any weight on a tail bone
  // goes to the body instead.
  const T0 = S.findIndex(s => s[0] === tb[0]);
  for (let i = 0; i < n * 4; i++) if (si[i] >= T0 && si[i] < T0 + 4) si[i] = 0;
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mat = new THREE.MeshToonMaterial({ map: MAP, gradientMap: GRADIENT_3 });
  const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  root.add(mesh); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(S.map(s => s[0])), mesh.matrixWorld);
  const both = q.has('nalaboth');   // (debug: show the code dog too)
  if (!both) for (const m of old) m.visible = false;
  const up = dog.update.bind(dog);
  dog.update = (...a) => { const r = up(...a); if (!both) for (const m of old) m.visible = false; return r; };   // (some poses show their parts again)
  dog.meshyNala = mesh; globalThis.__nala = dog; (globalThis.__nalas ||= []).push(dog);   // (test hook: the screenshot script finds her)
  return true;
}
function isUnder(o, anc) { for (let x = o; x; x = x.parent) if (x === anc) return true; return false; }
