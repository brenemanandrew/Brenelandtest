// Cartoon cars in five kinds (hatchback, sedan, pickup, little van, beetle-ish coupe), shared by the traffic (cars.js) and the
// cars parked in driveways (world.js addCar). Each kind is built once from a side profile extruded with a bevel, so the cel
// bands follow the curves, plus a cabin on top and bolt-on parts.
// A model faces +z (the nose), +x is its left side (seen from behind), the tyres stand on y = 0.
import * as THREE from 'three';
import { mergeVertices } from '../vendor/three/addons/BufferGeometryUtils.js';
import { GEO } from './batch.js';
import { glow } from './toon.js';
import { carFormatParts } from './vehicle-models.js';   // (props-vehicles) the Blender cars, in this file's part format, when loaded

export const CAR_KINDS = ['hatch', 'sedan', 'pickup', 'van', 'beetle'];
export const CAR_COLORS = ['#d9534f', '#4f7fd9', '#f0c24f', '#5cb85c', '#e8e8e8', '#8e5bd0', '#ff8a3a', '#2f4f6f'];
const TRIM = '#3a3f47', DARK = '#2b2b2f', CHROME = '#d4d7dc', CREAM = '#f6f0de';
const W = 1.78;                       // body width (effective, after the bevel)
const BS = 0.08, BT = 0.1;            // lower body bevel: size (rounds the profile) and thickness (rounds the sides)
const CS = 0.07, CT = 0.07;           // cabin bevel

// Effective dimensions (what you see, bevel included). z = 0 is the car's middle; heights from the ground.
//   L length; axle z; wr wheel radius; yb bottom; yf / yr top of the body at the nose / tail; rn / rr their corner radii;
//   cab: [rear base z, rear top z, front top z, front base z, top y, top corner radius, width]; head/tail: lamp height.
const SPECS = {
  hatch: { L: 3.7, axle: 1.2, wr: 0.34, yb: 0.24, yf: 0.95, yr: 0.98, rn: 0.4, rr: 0.3, cab: [-1.76, -1.58, -0.15, 0.62, 1.62, 0.22, 1.56], head: 0.68, tail: 0.74, pillars: [-0.55] },
  sedan: { L: 4.0, axle: 1.3, wr: 0.34, yb: 0.24, yf: 0.92, yr: 0.96, rn: 0.36, rr: 0.32, cab: [-1.12, -0.74, 0.12, 0.86, 1.58, 0.2, 1.56], head: 0.66, tail: 0.72, pillars: [-0.22], aerial: true },
  pickup: { L: 4.2, axle: 1.36, wr: 0.36, yb: 0.26, yf: 0.98, yr: 0.98, rn: 0.32, rr: 0.16, cab: [-0.42, -0.36, 0.42, 1.06, 1.7, 0.18, 1.6], head: 0.7, tail: 0.74, pillars: [], bed: true },
  van: { L: 4.1, axle: 1.42, wr: 0.34, yb: 0.24, yf: 1.0, yr: 1.0, rn: 0.34, rr: 0.24, cab: [-2.03, -1.98, 0.72, 1.46, 2.06, 0.32, 1.72], head: 0.7, tail: 0.76, pillars: [-1.05, -0.05], top: CREAM },
  beetle: { L: 3.6, axle: 1.15, wr: 0.33, yb: 0.26, yf: 0.84, yr: 0.9, rn: 0.5, rr: 0.62, cab: [-1.26, -0.74, 0.0, 0.66, 1.6, 0.42, 1.5], head: 0.84, tail: 0.72, pillars: [], fenders: true, chrome: true },
};

// ------------------------------------------------------------------ profiles

// A closed outline from nodes: corners { p: [u, v], r } (rounded with a quadratic) and arcs { arc: [cu, cv, ra, a0, a1] }
// (clockwise), into a THREE.Shape. u is the car's z (forward), v its height.
function outline(nodes) {
  const pt = n => n.p;
  const ends = n => n.arc ? [[n.arc[0] + n.arc[2] * Math.cos(n.arc[3]), n.arc[1] + n.arc[2] * Math.sin(n.arc[3])], [n.arc[0] + n.arc[2] * Math.cos(n.arc[4]), n.arc[1] + n.arc[2] * Math.sin(n.arc[4])]] : [pt(n), pt(n)];
  const s = new THREE.Shape();
  const N = nodes.length;
  nodes.forEach((n, i) => {
    if (n.arc) {
      const [a] = ends(n);
      if (i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
      s.absarc(n.arc[0], n.arc[1], n.arc[2], n.arc[3], n.arc[4], true);
      return;
    }
    const prev = ends(nodes[(i - 1 + N) % N])[1], next = ends(nodes[(i + 1) % N])[0], c = n.p;
    const d0 = Math.hypot(c[0] - prev[0], c[1] - prev[1]) || 1, d1 = Math.hypot(next[0] - c[0], next[1] - c[1]) || 1;
    const r = Math.min(n.r || 0, d0 * 0.48, d1 * 0.48);
    const a = [c[0] + (prev[0] - c[0]) * r / d0, c[1] + (prev[1] - c[1]) * r / d0], b = [c[0] + (next[0] - c[0]) * r / d1, c[1] + (next[1] - c[1]) * r / d1];
    if (i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
    if (r > 0) s.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  });
  s.closePath();
  return s;
}

// Extrude a profile across the car (x), centred, with rounded edges and smooth normals.
function extrudeAcross(shape, width, bs, bt, curveSegments = 6) {
  const depth = Math.max(0.02, width - 2 * bt);
  let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bs, bevelThickness: bt, bevelSegments: 3, curveSegments, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // shape u -> car z, extrusion -> car x
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

// the lower body: bottom edge with two arches, a rounded nose and tail (all inset by the bevel, which grows them back)
function bodyShape(S) {
  const h = S.L / 2 - BS, yb = S.yb + BS, yf = S.yf - BS, yr = S.yr - BS, ra = S.wr + 0.11 - BS, cy = S.wr;
  const d = Math.asin(Math.max(-0.95, Math.min(0.95, (cy - yb) / ra)));
  return outline([
    { p: [-h, yb], r: 0.1 },
    { arc: [-S.axle, cy, ra, Math.PI + d, -d] },
    { arc: [S.axle, cy, ra, Math.PI + d, -d] },
    { p: [h, yb], r: 0.1 },
    { p: [h, yf], r: S.rn },
    { p: [-h, yr], r: S.rr },
  ]);
}
// the cabin (a rounded trapezoid sitting a little into the body)
function cabinPts(S) {
  const [zr0, zr1, zf1, zf0, yt] = S.cab, yb = Math.min(S.yf, S.yr) - 0.06;
  return { yb, yt, pts: [[zr0, yb], [zf0, yb], [zf1, yt], [zr1, yt]] }; // CCW in (z, y)
}
function cabinShape(S) {
  const { yb, yt } = cabinPts(S), [zr0, zr1, zf1, zf0, , r] = S.cab, k = CS;
  // inset by the bevel: the base stays put (it is buried), the slopes and roof move in
  return outline([{ p: [zr0 + k, yb], r: 0 }, { p: [zf0 - k, yb], r: 0 }, { p: [zf1 - k * 0.6, yt - k], r }, { p: [zr1 + k * 0.6, yt - k], r }]);
}
// height of the nose (or tail) face at height y: z of the rounded profile
function faceZ(S, y, front) {
  const h = S.L / 2, top = front ? S.yf : S.yr, r = front ? S.rn : S.rr, c = top - r;
  const dy = Math.max(0, y - c);
  return h - r + Math.sqrt(Math.max(0, r * r - dy * dy));
}

// ------------------------------------------------------------------ parts

const cache = new Map();
const unit = {
  disc: new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2),    // a round lamp facing +z
  tyre: new THREE.TorusGeometry(0.68, 0.32, 7, 16).rotateY(Math.PI / 2), // a fat round tyre around x, outer radius 1
  hub: new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2),
  half: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), // a dome (the beetle's fenders)
};

// A part: { geo, color (a colour, or 'body' / 'top' for the car's own), lamp (name) | glass | wheel (axle index), o (x y z rx ry rz sx sy sz) }
export function carParts(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const model = carFormatParts(SPECS[kind] ? kind : 'sedan');   // (props-vehicles) the Blender car if the models loaded; the code-built one below is the fallback
  if (model) { cache.set(kind, model); return model; }
  const S = SPECS[kind] || SPECS.sedan, parts = [], h = S.L / 2;
  const add = (geo, color, o, extra) => parts.push({ geo, color, o, ...extra });
  const top = S.top ? 'top' : 'body';
  add(extrudeAcross(bodyShape(S), W, BS, BT), 'body', {});
  const cab = cabinPts(S), Wc = S.cab[6];
  add(extrudeAcross(cabinShape(S), Wc, CS, CT), top, {});
  // ---- glass: the side windows (the cabin outline inset by a frame, above a belt line), the windscreen and rear window
  const [zr0, zr1, zf1, zf0, yt] = S.cab, fr = 0.1, belt = cab.yb + 0.16;
  const along = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const zOnEdge = (a, b, y) => a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  const wy0 = belt, wy1 = yt - fr - 0.02;
  const side = new THREE.Shape();
  const rz0 = zOnEdge([zr0, cab.yb], [zr1, yt], wy0) + fr, rz1 = zOnEdge([zr0, cab.yb], [zr1, yt], wy1) + fr;
  const fz0 = zOnEdge([zf0, cab.yb], [zf1, yt], wy0) - fr, fz1 = zOnEdge([zf0, cab.yb], [zf1, yt], wy1) - fr;
  side.moveTo(rz0, wy0); side.lineTo(fz0, wy0); side.lineTo(fz1, wy1); side.lineTo(rz1, wy1); side.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.02, bevelEnabled: false }).rotateY(-Math.PI / 2);
  for (const s of [-1, 1]) add(sideGeo, '#ffffff', { x: s > 0 ? Wc / 2 + 0.024 : -Wc / 2 - 0.004 }, { glass: true });
  for (const [a, b, sgn] of [[[zf0, cab.yb], [zf1, yt], 1], [[zr0, cab.yb], [zr1, yt], -1]]) {
    const p0 = along(a, b, (belt - cab.yb) / (yt - cab.yb)), p1 = along(a, b, 1 - (0.12 + S.cab[5] * 0.5) / (yt - cab.yb));
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ang = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]); // lean from vertical
    const nz = Math.cos(ang) * sgn, ny = -Math.sin(ang) * sgn; // the outward normal of the slope
    void ny;
    add(GEO.box, '#ffffff', { x: 0, y: (p0[1] + p1[1]) / 2 + Math.abs(Math.sin(ang)) * 0.03, z: (p0[0] + p1[0]) / 2 + nz * 0.03, rx: ang, sx: Wc - 0.3, sy: len, sz: 0.03 }, { glass: true });
  }
  // pillars over the side glass (a B pillar; the van has more), and a shine on the windscreen
  for (const pz of S.pillars) for (const s of [-1, 1]) add(GEO.box, top, { x: s * (Wc / 2 + 0.03), y: (wy0 + wy1) / 2, z: pz, sx: 0.035, sy: wy1 - wy0 + 0.02, sz: 0.14 });
  // ---- bumpers, grille, plate
  const bump = S.chrome || kind === 'van' ? CHROME : TRIM;
  for (const s of [-1, 1]) add(null, bump, { y: 0.36, z: s * (h - 0.04) }, { cap: W - 0.3 });
  if (kind !== 'beetle') add(GEO.box, DARK, { y: S.head - 0.02, z: faceZ(S, S.head - 0.02, true) - 0.01, sx: 0.62, sy: 0.15, sz: 0.06 }); // (the grille a centimetre proud of the nose's flat: its bottom was level with it and flickered)
  else for (const k of [-1, 0, 1]) add(GEO.box, CHROME, { x: k * 0.12, y: 0.55, z: faceZ(S, 0.55, true) - 0.01, sx: 0.05, sy: 0.16, sz: 0.04 }); // the bonnet's little chrome strakes
  add(GEO.box, '#f4f2ea', { y: 0.6, z: -faceZ(S, 0.6, false) - 0.01, sx: 0.44, sy: 0.14, sz: 0.04 });
  // ---- mirrors and door handles
  for (const s of [-1, 1]) {
    add(GEO.box, TRIM, { x: s * (Wc / 2 + 0.06), y: cab.yb + 0.16, z: zf0 - 0.16, sx: 0.12, sy: 0.03, sz: 0.04 });   // mirror arm
    add(GEO.sphere, top, { x: s * (Wc / 2 + 0.14), y: cab.yb + 0.2, z: zf0 - 0.18, sx: 0.06, sy: 0.08, sz: 0.06 }); // mirror
    add(GEO.box, DARK, { x: s * (W / 2 + 0.005), y: Math.min(S.yf, S.yr) - 0.16, z: (zr1 + zf1) / 2 + 0.1, sx: 0.03, sy: 0.04, sz: 0.16 });
  }
  if (S.aerial) add(GEO.cyl6, TRIM, { x: -0.62, y: Math.max(S.yr, S.yf) + 0.3, z: -h + 0.5, sx: 0.012, sy: 0.6, sz: 0.012 });
  // ---- the beetle's round fenders and running boards; the pickup's bed
  if (S.fenders) for (const az of [-S.axle, S.axle]) for (const s of [-1, 1]) add(unit.half, 'body', { x: s * (W / 2 - 0.12), y: S.wr - 0.02, z: az, sx: 0.3, sy: 0.56, sz: 0.62 });
  if (S.fenders) for (const s of [-1, 1]) add(GEO.box, DARK, { x: s * (W / 2 + 0.02), y: 0.3, z: 0, sx: 0.14, sy: 0.05, sz: S.axle * 2 - 1.0 });
  if (S.bed) {
    const z0 = -h + 0.1, z1 = zr0 - 0.02, yt2 = S.yr + 0.3;
    add(GEO.box, DARK, { y: S.yr + 0.01, z: (z0 + z1) / 2, sx: W - 0.3, sy: 0.02, sz: z1 - z0 });
    for (const s of [-1, 1]) add(GEO.box, 'body', { x: s * (W / 2 - 0.08), y: (S.yr + yt2) / 2 - 0.04, z: (z0 + z1) / 2, sx: 0.14, sy: yt2 - S.yr + 0.08, sz: z1 - z0 + 0.02 });
    add(GEO.box, 'body', { y: (S.yr + yt2) / 2 - 0.04, z: z0 - 0.02, sx: W - 0.06, sy: yt2 - S.yr + 0.08, sz: 0.12 }); // tailgate
    add(GEO.box, TRIM, { y: yt2 + 0.02, z: z0 - 0.02, sx: W - 0.04, sy: 0.04, sz: 0.14 });
  }
  // ---- lamps (cars.js colours them by name): round headlights, tail lights, indicators that wrap round the corners,
  // side repeaters on the front wings, reversing lamps
  const lamp = (name, geo, o) => add(geo, '#ffffff', o, { lamp: name });
  // the beetle's lamps sit in little buckets on its front wings, the tails on the rear wings
  if (S.fenders) for (const s of [-1, 1]) { add(GEO.cyl12, 'body', { x: s * (W / 2 - 0.12), y: S.head, z: S.axle + 0.36, rx: Math.PI / 2, sx: 0.15, sy: 0.24, sz: 0.15 }); lamp(s > 0 ? 'headL' : 'headR', unit.disc, { x: s * (W / 2 - 0.12), y: S.head, z: S.axle + 0.49, sx: 0.125, sy: 0.125, sz: 0.04 }); }
  else for (const s of [-1, 1]) lamp(s > 0 ? 'headL' : 'headR', unit.disc, { x: s * 0.56, y: S.head, z: faceZ(S, S.head, true), sx: 0.15, sy: 0.15, sz: 0.06 }); // (a centimetre further out than the nose's flat, the same as the grille)
  if (S.fenders) for (const s of [-1, 1]) lamp(s > 0 ? 'tailL' : 'tailR', unit.disc, { x: s * (W / 2 - 0.12), y: S.tail, z: -S.axle - 0.52, sx: 0.08, sy: 0.12, sz: 0.06 });
  else for (const s of [-1, 1]) lamp(s > 0 ? 'tailL' : 'tailR', GEO.box, { x: s * 0.6, y: S.tail, z: -faceZ(S, S.tail, false) + 0.01, sx: 0.3, sy: 0.17, sz: 0.06 });
  // the indicators: amber pods on the corners, half out of the front (or back) and half out of the side
  const fy = S.fenders ? 0.47 : S.head, ry2 = S.fenders ? 0.45 : S.tail;
  const fz = S.fenders ? S.axle + 0.58 : faceZ(S, fy, true) - 0.09, rz2 = S.fenders ? S.axle + 0.58 : faceZ(S, ry2, false) - 0.09;
  const fx = S.fenders ? W / 2 - 0.12 : W / 2 - 0.08;
  for (const s of [-1, 1]) lamp(s > 0 ? 'indFL' : 'indFR', GEO.sphere, { x: s * fx, y: fy, z: fz, sx: 0.12, sy: 0.09, sz: 0.12 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'indRL' : 'indRR', GEO.sphere, { x: s * fx, y: ry2, z: -rz2, sx: 0.12, sy: 0.09, sz: 0.12 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'indSL' : 'indSR', GEO.box, { x: s * (S.fenders ? W / 2 + 0.17 : W / 2 + 0.01), y: S.fenders ? 0.45 : Math.min(S.yf, S.yr) - 0.2, z: S.fenders ? S.axle : S.axle + 0.6, sx: 0.04, sy: 0.08, sz: 0.2 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'revL' : 'revR', GEO.box, { x: s * 0.3, y: S.tail, z: -faceZ(S, S.tail, false) + 0.005, sx: 0.12, sy: 0.1, sz: 0.05 });
  // ---- wheels (relative to their axle: index 0 front, 1 rear)
  for (const [ai, az] of [[0, S.axle], [1, -S.axle]]) for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.16);
    add(unit.tyre, DARK, { x, sx: 0.2, sy: S.wr, sz: S.wr }, { wheel: ai, az });
    add(unit.hub, '#c9c9cf', { x: x + s * 0.06, sx: 0.14, sy: S.wr * 0.5, sz: S.wr * 0.5 }, { wheel: ai, az });
    add(unit.hub, '#8d9098', { x: x + s * 0.105, sx: 0.06, sy: S.wr * 0.18, sz: S.wr * 0.18 }, { wheel: ai, az }); // (its face 5 mm proud of the hub's, not level with it: the two flickered)
  }
  // capsules: scale the straight part to the bumper's width (the unit capsule is 1 long and radius 1; build its own geometry)
  for (const p of parts) if (p.cap) p.geo = new THREE.CapsuleGeometry(0.11, p.cap, 3, 10).rotateZ(Math.PI / 2);
  const out = { kind, spec: S, parts, wheelR: S.wr, axles: [S.axle, -S.axle] };
  cache.set(kind, out);
  return out;
}

// the part's matrix in the car's frame (the Batcher's rotation order: YXZ)
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function partMatrix(o, m = new THREE.Matrix4()) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
  _p.set(o.x || 0, o.y || 0, o.z || 0); _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  return m.compose(_p, _q, _s);
}

// A parked car baked into a static batch: (x, y, z) where its tyres touch the ground, nose toward yaw (radians, +z at 0).
const STATIC_LAMP = { head: '#f4efd8', tail: '#c0392b', ind: '#f0a030', rev: '#eeeeee' };
const GLASS_MAT = () => glow('#cfe8f5');
export function addCarModel(b, x, y, z, yaw, kind, color) {
  const car = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const m = new THREE.Matrix4(), M = new THREE.Matrix4();
  for (const p of carParts(kind).parts) {
    const col = p.color === 'body' ? color : p.color === 'top' ? CREAM : p.color;
    const mat = p.glass ? GLASS_MAT() : p.lamp ? STATIC_LAMP[p.lamp.replace(/(L|R|FL|FR|RL|RR|SL|SR)$/, '')] || '#ffffff' : col;
    partMatrix(p.o, m);
    if (p.wheel !== undefined) m.premultiply(M.makeTranslation(0, SPECS[kind].wr, p.az));
    b.add(p.geo, mat, { matrix: M.multiplyMatrices(car, m) });
  }
}
export const carSpec = kind => SPECS[kind] || SPECS.sedan;
