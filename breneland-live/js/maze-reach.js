// The Angell Street door's reach (lovecraft-setpiece, Andrew 2026-11-08: "If a player is within range of it a tentacle or a ghoulish
// arm will reach out from the door and slowly slide back in"). The creatures are assets/blender/scripts/build_reach.py's: one mesh of
// rigid parts on a bone chain each, rigged and keyframed in Blender, exported to public/models/reach.json with a dense pose per bone
// per frame (24 fps, the creature's own frame: x right, y up, z forward). Here each becomes a SkinnedMesh (one draw) whose bones are
// set from the clip, blended between frames. maze-door.js owns when and which (a hash of the shared clock's slot, so everyone sees
// the same creature at the same moment); this only builds and plays.
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';

let DATA = null, loading = null;
/** Fetch the creatures once (the first open day the door is built). Resolves to the data or null. */
export function loadReach() {
  if (!loading) loading = fetch('/models/reach.json').then(r => (r.ok ? r.json() : null)).then(j => (DATA = j && j.creatures ? j : null)).catch(() => (DATA = null));
  return loading;
}
export const reachModel = () => DATA;

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
/** A creature as a SkinnedMesh with its bones, and `play(t)` (seconds into the clip; past its end it holds the last frame). */
export function buildCreature(name) {
  const C = DATA?.creatures?.[name];
  if (!C) return null;
  const n = C.pos.length / 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = C.pos[i * 3] / 1000; pos[i * 3 + 1] = C.pos[i * 3 + 1] / 1000; pos[i * 3 + 2] = C.pos[i * 3 + 2] / 1000;
    nor[i * 3] = C.nor[i * 3] / 100; nor[i * 3 + 1] = C.nor[i * 3 + 1] / 100; nor[i * 3 + 2] = C.nor[i * 3 + 2] / 100;
    col[i * 3] = C.col[i * 3] / 255; col[i * 3 + 1] = C.col[i * 3 + 1] / 255; col[i * 3 + 2] = C.col[i * 3 + 2] / 255;
    si[i * 4] = C.bone[i]; sw[i * 4] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.Uint16BufferAttribute(C.idx, 1));
  g.computeBoundingSphere(); g.boundingSphere.radius += 2; // (the clip swings parts well off the rest pose)
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRADIENT_3 }); mat.name = 'reach-' + name;
  const mesh = new THREE.SkinnedMesh(g, mat); mesh.name = 'reach-' + name; mesh.castShadow = false; mesh.frustumCulled = false;
  const bones = [], inv = [];
  for (const r of C.rest) {
    const b = new THREE.Bone(); b.position.set(r[0], r[1], r[2]); b.quaternion.set(r[3], r[4], r[5], r[6]); mesh.add(b); bones.push(b);
    inv.push(_m.compose(b.position, b.quaternion, _p.set(1, 1, 1)).clone().invert());
  }
  mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
  const clip = C.clips.reach, F = clip.frames, D = clip.data;
  const play = t => {
    const f = Math.max(0, Math.min(F - 1, t * clip.fps)), i = Math.min(F - 2, Math.floor(f)), k = Math.min(1, f - i);
    for (let b = 0; b < bones.length; b++) {
      const a = D[i][b], c = D[i + 1][b];
      _p.set(a[0], a[1], a[2]); _p2.set(c[0], c[1], c[2]); _q.set(a[3], a[4], a[5], a[6]); _q2.set(c[3], c[4], c[5], c[6]);
      bones[b].position.lerpVectors(_p, _p2, k); bones[b].quaternion.slerpQuaternions(_q, _q2, k);
    }
  };
  play(0);
  return { mesh, bones, play, length: (F - 1) / clip.fps, tris: C.tris };
}
