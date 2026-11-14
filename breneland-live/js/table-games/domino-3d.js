// A real modelled domino (tg-look): a bevelled ivory top on a teal base (two-tone, so a face-down tile reads as a back), the
// centre bar with a brass spinner, and inset domed pips coloured by number. One unit tile: 1 long (z), 0.5 wide (x), 0.16
// thick (y), resting on y = 0, the a half at -z. The overlay draws every tile in a handful of instanced draws (createDominoLayer);
// the world's tables bake the same shapes into their batches (mt-3d.js, through dominoParts).
import * as THREE from 'three';
import { mergeVertices } from '../../vendor/three/addons/BufferGeometryUtils.js';
import { pipsAt, PIP, IVORY, INK } from './dominoes.js';

export const TILE = { W: 0.5, L: 1, H: 0.18, SEAM: 0.055 };
export const BASE = '#1f5560', BAR = '#6b5a48', BRASS = '#d8b45a', RIM = '#d4c6a8';

function roundRect(w, l, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -l / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + l - r);
  s.quadraticCurveTo(x + w, y + l, x + w - r, y + l); s.lineTo(x + r, y + l); s.quadraticCurveTo(x, y + l, x, y + l - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// an extruded rounded slab from y0 to y1 (bevelled at both ends when bev > 0), turned so its thickness is y and its length z
function slab(y0, y1, bev, inset = 0, lo = false) {
  const b = bev, w = TILE.W - 2 * (b + inset), l = TILE.L - 2 * (b + inset);
  const g = new THREE.ExtrudeGeometry(roundRect(w, l, Math.max(0.02, 0.07 - b)), { depth: Math.max(0.001, y1 - y0 - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: lo ? 1 : 3, curveSegments: lo ? 2 : 5, steps: 1 });
  g.rotateX(-Math.PI / 2); // extruded along z -> y; the shape's y (the length) -> -z
  g.translate(0, y0 + b, 0);
  return g;
}
const cache = {};
// the shared unit geometries (lo: fewer bevel steps, for the little tiles on the world's tables)
export function dominoGeos(lo = false) {
  const k = lo ? 'lo' : 'hi';
  if (cache[k]) return cache[k];
  const top = slab(TILE.SEAM, TILE.H, lo ? 0.02 : 0.024, 0, lo);
  const base = slab(0, TILE.SEAM + 0.004, 0, 0.006, lo);
  const bar = new THREE.BoxGeometry(TILE.W * 0.78, 0.012, 0.02); bar.translate(0, TILE.H, 0);
  const spin = new THREE.SphereGeometry(0.036, lo ? 6 : 10, lo ? 4 : 6, 0, Math.PI * 2, 0, Math.PI / 2); spin.scale(1, 0.55, 1); spin.translate(0, TILE.H + 0.002, 0);
  const rim = new THREE.CircleGeometry(1, lo ? 8 : 14); rim.rotateX(-Math.PI / 2); // (at the origin: each pip's matrix puts it on the face)
  const dome = new THREE.SphereGeometry(1, lo ? 6 : 12, lo ? 3 : 5, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.42, 1);
  return (cache[k] = { top, base, bar, spin, rim, dome });
}
// the pips of a tile as [x, z, r, n] in unit tile space (a at -z, b at +z)
const SPOTS = new Map();
export function pipSpots(a, b) {
  const key = a * 16 + b; let out = SPOTS.get(key); if (out) return out; // (the same few hundred lists every frame: kept)
  out = []; SPOTS.set(key, out);
  for (const [n, z0] of [[a, -0.5], [b, 0]]) {
    if (n == null || n <= 0) continue;
    const r = n >= 10 ? 0.04 : n >= 7 ? 0.045 : 0.053;
    for (const [px, py] of pipsAt(n)) out.push([-TILE.W / 2 + TILE.W * (0.15 + px * 0.7), z0 + 0.5 * (0.15 + py * 0.7), r, n]);
  }
  return out;
}

// ---- the overlay's layer: every domino in seven instanced draws (bodies, base, ink, bar, spinner, pip rims, pip domes)
const _m = new THREE.Matrix4(), _p = new THREE.Matrix4(), _c = new THREE.Color();
// an ink hull: the back faces pushed out along smooth normals by uOut (object units, so the layer sets it per scale)
export function inkMaterial(color = INK) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const u = { value: 0.03 }; m.userData.uOut = u;
  m.onBeforeCompile = sh => { sh.uniforms.uOut = u; sh.vertexShader = 'uniform float uOut;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normal * uOut;'); };
  return m;
}
export function hullOf(geo) { const g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position.clone()); if (geo.index) g.setIndex(geo.index.clone()); const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); return m; }
const phong = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 55, specular: 0x2a2620, ...o });

export function createDominoLayer(scene) {
  const G = dominoGeos(false);
  const hull = (() => { const top = hullOf(G.top); return top; })();
  const ink = inkMaterial();
  const parts = {
    top: { geo: G.top, mat: phong(IVORY, { shininess: 36, specular: 0x1c1a16 }) },
    base: { geo: G.base, mat: phong(BASE, { shininess: 30 }) },
    ink: { geo: hull, mat: ink },
    bar: { geo: G.bar, mat: new THREE.MeshBasicMaterial({ color: BAR }) },
    spin: { geo: G.spin, mat: phong(BRASS, { shininess: 90, specular: 0x8a7a50 }) },
    rim: { geo: G.rim, mat: new THREE.MeshBasicMaterial({ color: RIM }) },
    dome: { geo: G.dome, mat: phong(0xffffff, { shininess: 80, specular: 0x555555 }) },
  };
  for (const [k, p] of Object.entries(parts)) { p.cap = 0; p.mesh = null; p.k = k; }
  function ensure(p, need) {
    if (p.mesh && p.cap >= need) return;
    const cap = Math.max(16, Math.ceil(need * 1.5));
    if (p.mesh) { scene.remove(p.mesh); p.mesh.dispose(); }
    p.mesh = new THREE.InstancedMesh(p.geo, p.mat, cap); p.mesh.frustumCulled = false; p.mesh.count = 0; p.cap = cap;
    p.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (p.k === 'dome') { p.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); p.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    p.mesh.renderOrder = p.k === 'ink' ? 0 : 1;
    scene.add(p.mesh);
  }
  // written straight into the instance buffers as each tile comes (no garbage a frame): begin(the most tiles this frame)
  let nt = 0, ip = 0;
  const PIPS = 24;
  return {
    begin(need = 64) { for (const k of ['top', 'base', 'ink', 'bar', 'spin']) ensure(parts[k], need); ensure(parts.rim, need * PIPS); ensure(parts.dome, need * PIPS); nt = 0; ip = 0; },
    // M: the tile's unit -> world matrix; d: { a, b }; face: false skips the pips (a face-down tile at rest)
    add(M, d, face = true) {
      for (const k of ['top', 'base', 'ink', 'bar', 'spin']) parts[k].mesh.setMatrixAt(nt, M);
      nt++;
      if (!face) return;
      for (const [x, z, r, n] of pipSpots(d.a, d.b)) {
        _p.makeScale(r * 1.22, 1, r * 1.22).setPosition(x, TILE.H + 0.0015, z); _m.multiplyMatrices(M, _p); parts.rim.mesh.setMatrixAt(ip, _m);
        _p.makeScale(r, r, r).setPosition(x, TILE.H - 0.004, z); _m.multiplyMatrices(M, _p);
        parts.dome.mesh.setMatrixAt(ip, _m); _c.set(PIP[n]); parts.dome.mesh.instanceColor.setXYZ(ip, _c.r, _c.g, _c.b);
        ip++;
      }
    },
    end(outPx) {
      for (const k of ['top', 'base', 'ink', 'bar', 'spin']) { parts[k].mesh.count = nt; parts[k].mesh.instanceMatrix.needsUpdate = true; }
      for (const k of ['rim', 'dome']) { parts[k].mesh.count = ip; parts[k].mesh.instanceMatrix.needsUpdate = true; }
      parts.dome.mesh.instanceColor.needsUpdate = true;
      ink.userData.uOut.value = outPx;
      return nt;
    },
    get count() { return nt; },
    dispose() { for (const p of Object.values(parts)) if (p.mesh) { scene.remove(p.mesh); p.mesh.dispose(); } },
  };
}

// ---- the world's tables: the same shapes as parts for a Batcher (mt-3d.js): add(geo, colour, { x, y, z, ry, sx, sy, sz })
export function dominoParts(add, x, y, z, yaw, L, a, b, down) {
  const G = dominoGeos(true), s = L;
  if (down) { add(G.top, IVORY, { x, y: y + TILE.H * s, z, rz: Math.PI, ry: yaw, sx: s, sy: s, sz: s }); add(G.base, BASE, { x, y: y + TILE.H * s, z, rz: Math.PI, ry: yaw, sx: s, sy: s, sz: s }); return; } // (turned over: the teal base on top)
  add(G.top, IVORY, { x, y, z, ry: yaw, sx: s, sy: s, sz: s });
  add(G.base, BASE, { x, y, z, ry: yaw, sx: s, sy: s, sz: s });
  add(G.bar, BAR, { x, y, z, ry: yaw, sx: s, sy: s, sz: s }); // (no spinner: too small to see from a few metres)
}
