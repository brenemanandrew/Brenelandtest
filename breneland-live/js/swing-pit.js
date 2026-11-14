// The sand pit at the foot of the swing hill: where a launch from the tire swing usually lands. The sand itself
// is the ground's colour (terrain.js, swing-hill.js sandSigned); here are its things: a ring of half-buried logs round the edge
// (each laid along the slope between its own two ends, so nothing floats or digs in), three distance pegs with numbered flags
// along the side the swing's camera sees, a rake, and a bucket and spade. Everything static goes into the world's batch (no
// draw call of its own); the flags' numbers are one small canvas atlas on one mesh.
import * as THREE from 'three';
import { GEO } from './batch.js';
import { terrainHeight } from './terrain.js';
import { SWING_FRAME, SAND, hillXZ, pitOutline } from './swing-hill.js';

const UP = new THREE.Vector3(0, 1, 0);
const LOG = ['#9a6b3f', '#86592f'];
// the pegs: flight distance from the tire (m) -> where along the slope they stand (a launch lets go about 2.2 m ahead of the pivot)
export const PEGS = [[5, '#5fbf5a'], [10, '#f2c73a'], [15, '#ef6a4c']];
export const PEG_U0 = 2.2;

export function buildSandPit(b, parent) {
  const F = SWING_FRAME;
  const W = { x: 0, z: 0 }, m = new THREE.Matrix4(), q = new THREE.Quaternion(), d = new THREE.Vector3();
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), mid = new THREE.Vector3(), sc = new THREE.Vector3();
  const at = (u, v, lift, out) => { hillXZ(u, v, W); return out.set(W.x, terrainHeight(W.x, W.z) + lift, W.z); };
  const rod = (a, c, r, col) => { // a cylinder from a to c (GEO.cyl6 runs along y)
    d.subVectors(c, a); const len = d.length() || 0.01;
    q.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
    mid.addVectors(a, c).multiplyScalar(0.5);
    b.add(GEO.cyl8, col, { matrix: m.compose(mid, q, sc.set(r, len, r)) });
  };

  // ---- the edge: logs end to end round the outline, a little overlapped, sunk to just over half their thickness
  const ring = pitOutline(0.95), R = 0.12;
  ring.forEach((p, i) => {
    const n = ring[(i + 1) % ring.length];
    const ou = p.u + (n.u - p.u) * -0.08, ov = p.v + (n.v - p.v) * -0.08, eu = n.u + (n.u - p.u) * 0.08, ev = n.v + (n.v - p.v) * 0.08;
    at(ou, ov, R * 0.45, pa); at(eu, ev, R * 0.45, pb);
    rod(pa, pb, R * (i % 3 === 1 ? 0.92 : 1), LOG[i % 2]);
    if (i % 4 === 0) { at(p.u, p.v, R * 0.45, pa); b.add(GEO.cyl8, '#c9a16c', { x: pa.x, y: pa.y, z: pa.z, sx: R * 0.7, sy: 0.02, sz: R * 0.7 }); } // a cut end showing
  });

  // ---- the pegs: a white post on the right of the pit (the side the swing's camera looks from), a coloured flag on top
  const flagGeo = [];
  for (const [dist, col] of PEGS) {
    const u = PEG_U0 + dist, v = SAND.w + 0.55;
    at(u, v, 0, pa);
    b.add(GEO.cyl6, '#f4efe2', { x: pa.x, y: pa.y + 0.55, z: pa.z, sx: 0.045, sy: 1.1, sz: 0.045 });
    b.add(GEO.sphere, '#f4efe2', { x: pa.x, y: pa.y + 1.11, z: pa.z, sx: 0.06, sy: 0.06, sz: 0.06 });
    // the flag: a pennant facing across the pit (toward the swing's side), its number printed on it
    const yaw = Math.atan2(-F.fz, F.fx); // the flag's plane runs along the slope (its x along F), its face toward the swing's side (R)
    b.add(GEO.box, col, { x: pa.x + F.fx * 0.25, y: pa.y + 0.92, z: pa.z + F.fz * 0.25, sx: 0.5, sy: 0.3, sz: 0.03, ry: yaw });
    flagGeo.push({ x: pa.x + F.fx * 0.25, y: pa.y + 0.92, z: pa.z + F.fz * 0.25, yaw, dist });
  }
  // the numbers: one 256 x 64 canvas (three cells), on planes just off both faces of each flag
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  c.font = '700 40px "Fredoka", "Trebuchet MS", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  PEGS.forEach(([dist], i) => {
    const x = i * 85 + 42;
    c.lineWidth = 7; c.strokeStyle = '#2b2340'; c.strokeText(dist + 'm', x, 34);
    c.fillStyle = '#ffffff'; c.fillText(dist + 'm', x, 34);
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geos = [];
  flagGeo.forEach((f, i) => {
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.46, 0.115);
      const uv = g.attributes.uv, u0 = (i * 85 + 2) / 256, u1 = (i * 85 + 83) / 256;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) < 0.5 ? u0 : u1); // (each face is turned to its own side, so both read the right way round)
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(f.x + Math.sin(f.yaw) * 0.0175 * side, f.y, f.z + Math.cos(f.yaw) * 0.0175 * side),
        new THREE.Quaternion().setFromAxisAngle(UP, f.yaw + (side > 0 ? 0 : Math.PI)), new THREE.Vector3(1, 1, 1)));
      geos.push(g);
    }
  });
  const merged = new THREE.BufferGeometry();
  { // (a hand merge: six little planes)
    const pos = [], uvs = [], idx = []; let base = 0;
    for (const g of geos) {
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < p.count; k++) { pos.push(p.getX(k), p.getY(k), p.getZ(k)); uvs.push(uv.getX(k), uv.getY(k)); }
      for (const k of g.index.array) idx.push(base + k);
      base += p.count; g.dispose();
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    merged.setIndex(idx); merged.computeBoundingSphere();
  }
  const nums = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false }));
  nums.name = 'swing-pit-numbers'; nums.userData.noMerge = true; nums.userData.notSign = true;
  nums.matrixAutoUpdate = false; nums.updateMatrix();
  parent.add(nums);

  // ---- a rake lying by the far end and a bucket and spade at the near end, off the landing line
  at(SAND.u1 - 1.2, -SAND.w - 0.9, 0.05, pa); at(SAND.u1 - 3.0, -SAND.w - 1.5, 0.05, pb);
  rod(pa, pb, 0.025, '#b88a55');
  { const yaw = Math.atan2(pb.x - pa.x, pb.z - pa.z); b.add(GEO.box, '#d64a3a', { x: pa.x, y: pa.y + 0.02, z: pa.z, sx: 0.5, sy: 0.05, sz: 0.08, ry: yaw + Math.PI / 2 }); }
  at(SAND.u0 + 2.2, -SAND.w + 1.4, 0, pa);
  b.add(GEO.cyl8, '#3f8fd9', { x: pa.x, y: pa.y + 0.14, z: pa.z, sx: 0.17, sy: 0.28, sz: 0.17 });
  b.add(GEO.cyl8, '#ffd34d', { x: pa.x, y: pa.y + 0.29, z: pa.z, sx: 0.185, sy: 0.03, sz: 0.185 });
  b.add(GEO.box, '#ffd34d', { x: pa.x + 0.32, y: pa.y + 0.06, z: pa.z + 0.1, sx: 0.12, sy: 0.02, sz: 0.16, ry: 0.6 });
  b.add(GEO.cyl6, '#ff6fa8', { x: pa.x + 0.47, y: pa.y + 0.06, z: pa.z + 0.32, sx: 0.022, sy: 0.32, sz: 0.022, rz: Math.PI / 2, ry: 0.6 + Math.PI / 2 });
  return { nums, ring: ring.length };
}
