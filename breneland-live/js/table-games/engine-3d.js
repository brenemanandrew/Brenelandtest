// The little toy train engine (tg-look): each train's marker in its seat's colour (the Mexican Train's gold). A wooden-toy
// shape: a dark chassis on six wheels with brass hubs, the boiler in the seat's colour with brass bands, a chimney, a dome, the
// cab with a cream window and a dark roof, a brass cow-catcher and a headlamp. Unit size: 1 long (forward +z), resting on y = 0.
// The overlay merges it into one mesh per colour (engineGeometry); the world's tables add the parts to their batches.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/addons/BufferGeometryUtils.js';

const DARK = '#2b2340', GOLD = '#ffd34d', BRASSY = '#d8a93a', CREAM = '#fff4dc';
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
const cyl = (r, h, n = 12) => new THREE.CylinderGeometry(r, r, h, n);
// the parts: [geometry, colour, { x, y, z, rx, ry, rz, sx, sy, sz }] in unit space (lo: fewer sides, for the world's tables)
export function engineParts(color, lo = false) {
  const n = lo ? 6 : 14, body = color, deep = shade(color, 0.72);
  const P = [];
  const add = (g, c, o = {}) => P.push([g, c, o]);
  add(new THREE.BoxGeometry(0.42, 0.09, 0.98), deep, { y: 0.15 });                                   // the chassis
  add(cyl(0.165, 0.56, n), body, { y: 0.34, z: 0.14, rx: Math.PI / 2 });                             // the boiler
  for (const z of [-0.04, 0.3]) add(cyl(0.172, 0.035, n), GOLD, { y: 0.34, z, rx: Math.PI / 2 });     // its brass bands
  add(cyl(0.17, 0.07, n), DARK, { y: 0.34, z: 0.44, rx: Math.PI / 2 });                              // the smokebox door
  add(cyl(0.045, 0.03, 8), CREAM, { y: 0.4, z: 0.485, rx: Math.PI / 2 });                            // the headlamp
  add(new THREE.CylinderGeometry(0.075, 0.05, 0.2, n), DARK, { y: 0.58, z: 0.32 });                  // the chimney, flared
  add(cyl(0.085, 0.035, n), GOLD, { y: 0.69, z: 0.32 });
  add(new THREE.SphereGeometry(0.075, n, lo ? 4 : 8, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, { y: 0.48, z: 0.08 }); // the dome
  add(new THREE.BoxGeometry(0.44, 0.34, 0.32), body, { y: 0.37, z: -0.3 });                          // the cab
  add(new THREE.BoxGeometry(0.452, 0.09, 0.12), '#bfe3f2', { y: 0.45, z: -0.3 });                      // its window, through
  add(new THREE.BoxGeometry(0.52, 0.05, 0.42), body, { y: 0.565, z: -0.3 });                         // the roof
  add(new THREE.ConeGeometry(0.16, 0.16, 4, 1, false, Math.PI / 4), BRASSY, { y: 0.12, z: 0.52, rx: Math.PI / 2, sx: 1.3, sy: 1, sz: 0.6 }); // the cow-catcher
  for (const s of [-1, 1]) for (const z of [-0.3, 0, 0.3]) {                                          // six wheels and their hubs
    add(cyl(0.105, 0.06, n), DARK, { x: s * 0.235, y: 0.105, z, rz: Math.PI / 2 });
    add(cyl(0.045, 0.02, 8), GOLD, { x: s * 0.27, y: 0.105, z, rz: Math.PI / 2 });
  }
  return P;
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color();
const cache = new Map();
// one merged geometry with vertex colours for an engine of this colour (cached)
export function engineGeometry(color) {
  if (cache.has(color)) return cache.get(color);
  const gs = engineParts(color).map(([g, c, o]) => {
    let geo = g.index ? g.toNonIndexed() : g;
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); _s.set(o.sx || 1, o.sy || 1, o.sz || 1); _v.set(o.x || 0, o.y || 0, o.z || 0);
    geo.applyMatrix4(_m.compose(_v, _q, _s));
    _c.set(c); const k = geo.attributes.position.count, col = new Float32Array(k * 3);
    for (let i = 0; i < k; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(a)) geo.deleteAttribute(a);
    return geo;
  });
  const merged = mergeGeometries(gs, false);
  cache.set(color, merged);
  return merged;
}
// the world's tables: every part into a Batcher at (x, y, z) facing yaw, `s` long
export function engineInto(batch, x, y, z, yaw, s, color) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (const [g, c, o] of engineParts(color, true)) {
    const lx = (o.x || 0) * s, lz = (o.z || 0) * s;
    batch.add(g, c, { x: x + lx * cy + lz * sy, y: y + (o.y || 0) * s, z: z - lx * sy + lz * cy, rx: o.rx || 0, ry: yaw + (o.ry || 0), rz: o.rz || 0, sx: s * (o.sx || 1), sy: s * (o.sy || 1), sz: s * (o.sz || 1) });
  }
}
