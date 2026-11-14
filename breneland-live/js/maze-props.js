// Beneath Angell Street, the props: the things in the maze that tell a story, built for the kit (maze-kit.js) into its chunks' one
// vertex-coloured mesh (no new draw calls). Old crates and barrels, rubble and fallen bricks at a wall's foot, rotted planks,
// rusted chains and rings, an iron grate, a rope coil, broken pots and jars, a toppled chair, loose bones, a desk with a guttered
// candle, scattered paper, and the parts the kit's own pieces are made of (bookcases with uneven, leaning books and gaps, a toppled
// lectern). The house's toon style: shapes, proportions, wear and placement, no photo textures. Where they stand comes from
// maze-gen.js props() (the seed's own rng).
//
//   new Prop(kind)       pieces in the prop's own frame (+z away from the wall it stands against, x along it, y up), then
//   .at(x, y, z, yaw)    where the frame stands, and
//   .commit(b, { settle: floorY })   onto a Batcher: settle lowers or lifts the whole thing so its lowest point rests on the floor
//                        (nothing floating, nothing sunk); returns { kind, box } (its world bounds, for the tests)
//   buildProp(b, p, floorY, kit)     one of maze-gen.js's props -> its record ({ kind, box, x, z })
import * as THREE from 'three';
import { GEO } from './batch.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const _b = new THREE.Box3();
function mat(o, out = new THREE.Matrix4()) {
  if (o.matrix) return out.copy(o.matrix);
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
  return out.compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
}
// the lowest point of a geometry under a matrix (exact: every vertex)
function lowest(geo, m) { const P = geo.attributes.position; let lo = Infinity; for (let i = 0; i < P.count; i++) { const y = _v.fromBufferAttribute(P, i).applyMatrix4(m).y; if (y < lo) lo = y; } return lo; }

export class Prop {
  constructor(kind) { this.kind = kind; this.parts = []; this.frame = new THREE.Matrix4(); this.sub = null; }
  at(x, y, z, yaw = 0, rx = 0, rz = 0) { mat({ x, y, z, ry: yaw, rx, rz }, this.frame); return this; }
  // a piece (the Batcher's add() signature, so the kit's skull() and bone() can draw into a Prop)
  add(geo, col, o = {}) { const m = mat(o); if (this.sub) m.premultiply(this.sub); this.parts.push([geo, col, m]); return this; }
  // a piece resting on a surface at height y (in the prop's frame): its own lowest point put there, `sink` below it
  rest(geo, col, o, y = 0, sink = 0.004) { const m = mat(o); if (this.sub) m.premultiply(this.sub); m.elements[13] += y - sink - lowest(geo, m); this.parts.push([geo, col, m]); return this; }
  // a group of pieces with their own frame inside the prop's (null ends it)
  group(o) { this.sub = o ? mat(o) : null; return this; }
  bounds(box = new THREE.Box3()) {
    box.makeEmpty();
    for (const [geo, , lm] of this.parts) { _m.multiplyMatrices(this.frame, lm); const P = geo.attributes.position; for (let i = 0; i < P.count; i++) box.expandByPoint(_v.fromBufferAttribute(P, i).applyMatrix4(_m)); }
    return box;
  }
  commit(b, { settle = null } = {}) {
    const box = this.bounds();
    if (settle !== null && isFinite(box.min.y)) { const dy = settle - box.min.y; this.frame.premultiply(_m.makeTranslation(0, dy, 0)); box.min.y += dy; box.max.y += dy; }
    for (const [geo, col, lm] of this.parts) b.add(geo, col, { matrix: _m.multiplyMatrices(this.frame, lm) });
    return { kind: this.kind, box };
  }
}

// ---- shapes made once
function faceted(geo) { const g = geo.toNonIndexed(); g.computeVertexNormals(); return g; } // flat facets: a barrel's staves, a jar's turned sides
const lathe = (pts, n) => faceted(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n));
export const SHAPES = {
  barrel: lathe([[0, 0], [0.255, 0], [0.272, 0.05], [0.296, 0.22], [0.306, 0.45], [0.296, 0.68], [0.272, 0.85], [0.255, 0.9], [0, 0.9]], 12), // 0.9 m tall
  jar: lathe([[0, 0], [0.08, 0], [0.12, 0.05], [0.14, 0.14], [0.12, 0.24], [0.06, 0.29], [0.055, 0.33], [0.07, 0.345], [0.065, 0.36], [0, 0.36]], 9),
  torus: new THREE.TorusGeometry(1, 0.22, 6, 14),
  coil: new THREE.TorusGeometry(1, 0.12, 5, 16),
  link: new THREE.TorusGeometry(1, 0.3, 4, 8),
  shackle: new THREE.TorusGeometry(1, 0.2, 5, 8, Math.PI),
  disc: new THREE.CylinderGeometry(1, 1, 1, 14),
};
export const barrelR = y => { const p = [[0, 0.255], [0.05, 0.272], [0.22, 0.296], [0.45, 0.306], [0.68, 0.296], [0.85, 0.272], [0.9, 0.255]]; for (let i = 1; i < p.length; i++) if (y <= p[i][0]) { const t = (y - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t; } return 0.255; };

// colours: old wood, iron and its rust, clay, rope, paper; muted (the lantern's amber does the warming)
export const C = {
  wood: ['#4a3322', '#3f2b1c', '#523a27', '#45301f'], woodDark: '#2a1c12', rotten: ['#4b4236', '#3f372c', '#55493a'],
  iron: '#26262d', rust: ['#3e2a20', '#4a2c1e', '#36261f', '#55321f'], clay: ['#6e4430', '#7a4f36', '#5e3a29'], clayIn: '#20140e',
  rope: ['#5e4e38', '#54452f', '#665540'], paper: ['#cfc4a4', '#bfb391', '#d8cfb3'], ink: '#0b0c12', wax: '#e6dcc2', waxOld: '#d4c7a4',
  stone: ['#4a5366', '#434b5d', '#515a6e', '#3f4454'], brick: ['#5a3a36', '#4e3230', '#63403a'], dust: '#2b2d33',
  books: ['#5a2a32', '#2f4a3a', '#3a4058', '#6a4a2a', '#4a2028', '#5c5040', '#2c3a4c', '#6b5a3a', '#3e2a3a', '#4f5a3a'],
  shadow: '#07080b', shadow2: '#101218',
};
// a little rng from a prop's k (its own, deterministic)
export function rng(k) { let a = (Math.floor(k * 4294967296) ^ 0x9e3779b9) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (h, a) => a[Math.floor(h() * a.length) % a.length];

// a soft dark blob under something heavy (the contact shadow): two flat discs, straight onto the batcher (not part of the prop's
// bounds: the prop itself must sit on the floor)
export function blob(b, x, y, z, rx, rz, yaw = 0) {
  b.add(SHAPES.disc, C.shadow2, { x, y: y + 0.003, z, sx: rx * 1.28, sy: 0.002, sz: rz * 1.28, ry: yaw });
  b.add(SHAPES.disc, C.shadow, { x, y: y + 0.005, z, sx: rx, sy: 0.002, sz: rz, ry: yaw });
}

// ---- the pieces
// a crate of planks on a frame of battens (s the size); a broken one has a plank off its top
export function crate(P, s, h, broken = false) {
  const w = pick(h, C.wood), w2 = pick(h, C.wood), e = s / 2, t = 0.06;
  P.add(GEO.box, C.woodDark, { y: e, sx: s * 0.95, sy: s * 0.95, sz: s * 0.95 });
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { // the battens on the twelve edges
    P.add(GEO.box, w2, { x: a * (e - t / 2), y: e, z: b * (e - t / 2), sx: t, sy: s, sz: t });
    P.add(GEO.box, w2, { x: 0, y: e + a * (e - t / 2), z: b * (e - t / 2), sx: s, sy: t, sz: t });
    P.add(GEO.box, w2, { x: a * (e - t / 2), y: e + b * (e - t / 2), z: 0, sx: t, sy: t, sz: s });
  }
  const ph = (s - 2 * t) / 3; // three planks a face, a dark gap between
  for (let i = 0; i < 3; i++) {
    const y = t + ph * (i + 0.5), c = i % 2 ? w : w2;
    for (const a of [-1, 1]) { P.add(GEO.box, c, { y, z: a * (e - 0.012), sx: s - 2 * t, sy: ph - 0.014, sz: 0.022 }); P.add(GEO.box, c, { x: a * (e - 0.012), y, sx: 0.022, sy: ph - 0.014, sz: s - 2 * t }); }
    if (!(broken && i === 1)) P.add(GEO.box, i % 2 ? w2 : w, { y: s - 0.008, x: (i - 1) * ph, sx: ph - 0.014, sy: 0.022, sz: s - 2 * t }); // (the lid's planks 3 mm proud of the battens' tops: level, they flickered)
  }
  for (const a of [-1, 1]) P.add(GEO.box, w2, { z: a * (e + 0.004), y: e, sx: 0.05, sy: s * 1.2, sz: 0.018, rz: a * 0.78 }); // a brace across two faces
}
// a barrel: faceted staves, iron hoops (rusting), a lid; tipped: lying on its side, the lid off and the dark inside showing
export function barrel(P, h, { tipped = false } = {}) {
  const wood = pick(h, C.wood);
  P.add(SHAPES.barrel, wood, {});
  for (const y of [0.07, 0.26, 0.64, 0.83]) P.add(GEO.cyl12, pick(h, C.rust), { y, sx: barrelR(y) + 0.008, sy: 0.035, sz: barrelR(y) + 0.008 });
  if (tipped) P.add(SHAPES.disc, C.woodDark, { y: 0.902, sx: 0.24, sy: 0.004, sz: 0.24 });
  else { P.add(SHAPES.disc, C.woodDark, { y: 0.895, sx: 0.25, sy: 0.02, sz: 0.25 }); for (const x of [-0.08, 0.08]) P.add(GEO.box, '#3a281a', { x, y: 0.9, sx: 0.006, sy: 0.006, sz: 0.48 }); } // (the lid 5 mm proud of the staves' top: level with it, the two flickered)
}
// rubble at a wall's foot: a few fallen blocks and bricks, small stones, a dusty spread, the hole they came out of in the wall
export function rubble(P, h, out0) {
  P.rest(GEO.ico1, C.dust, { z: 0.05, sx: 0.55, sy: 0.02, sz: 0.38 });
  for (let i = 0; i < 3; i++) P.rest(GEO.dodec, pick(h, C.stone), { x: (i - 1) * 0.28 + (h() - 0.5) * 0.1, z: -out0 + 0.2 + h() * 0.12, sx: 0.16 + h() * 0.08, sy: 0.11 + h() * 0.06, sz: 0.14 + h() * 0.06, ry: h() * 6, rx: (h() - 0.5) * 0.5 });
  for (let i = 0; i < 6; i++) P.rest(GEO.box, pick(h, C.brick), { x: (h() - 0.5) * 0.8, z: -out0 + 0.25 + h() * 0.4, sx: 0.22, sy: 0.07, sz: 0.1, ry: h() * 6, rz: (h() - 0.5) * 0.5 });
  for (let i = 0; i < 7; i++) P.rest(GEO.ico0, pick(h, C.stone), { x: (h() - 0.5) * 0.9, z: -out0 + 0.15 + h() * 0.55, sx: 0.035 + h() * 0.05, sy: 0.03 + h() * 0.03, sz: 0.04 + h() * 0.04, ry: h() * 6 });
}
// two or three rotted planks leaning on the wall, one broken short
export function planks(P, h, out0) {
  const n = 2 + (h() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const L = i === n - 1 ? 0.9 + h() * 0.4 : 1.55 + h() * 0.35, foot = 0.2 + h() * 0.12, a = Math.asin(Math.min(0.9, (foot + out0 - 0.02) / L));
    const x = (i - (n - 1) / 2) * 0.24 + (h() - 0.5) * 0.06, ry = (h() - 0.5) * 0.12;
    P.rest(GEO.box, pick(h, C.rotten), { x, y: Math.cos(a) * L / 2, z: foot - Math.sin(a) * L / 2, sx: 0.2, sy: L, sz: 0.032, rx: -a, ry });
  }
}
// pots and jars: one whole, one tipped over, one broken to its base, shards about
export function pots(P, h) {
  P.rest(SHAPES.jar, pick(h, C.clay), { x: -0.18, sx: 0.9, sy: 0.9, sz: 0.9 });
  P.rest(SHAPES.jar, pick(h, C.clay), { x: 0.22, z: 0.05, rz: Math.PI / 2 - 0.08, ry: 0.5 + h(), sx: 0.75, sy: 0.75, sz: 0.75 });
  P.rest(GEO.cyl8, pick(h, C.clay), { x: 0.05, z: 0.2, sx: 0.1, sy: 0.07, sz: 0.1 });
  P.add(SHAPES.disc, C.clayIn, { x: 0.05, y: 0.068, z: 0.2, sx: 0.085, sy: 0.004, sz: 0.085 });
  for (let i = 0; i < 6; i++) P.rest(GEO.box, pick(h, C.clay), { x: (h() - 0.4) * 0.6, z: 0.05 + h() * 0.35, sx: 0.06 + h() * 0.04, sy: 0.012, sz: 0.04 + h() * 0.03, ry: h() * 6, rx: (h() - 0.5) * 0.4 });
}
// a ring on an iron plate, its chain hanging down the wall (onto the floor now and then), a rust streak under the plate
export function chains(P, h) {
  const n = h() < 0.5 ? 1 : 2;
  for (let c = 0; c < n; c++) {
    const x = (c - (n - 1) / 2) * 0.7, top = 1.7 + h() * 0.4;
    P.add(GEO.box, C.iron, { x, y: top + 0.08, z: 0.012, sx: 0.12, sy: 0.16, sz: 0.024 });
    for (const k of [-1, 1]) P.add(GEO.sphere, '#3a3a42', { x: x + k * 0.04, y: top + 0.08 + k * 0.05, z: 0.026, sx: 0.012, sy: 0.012, sz: 0.01 });
    P.add(GEO.box, '#2e1d14', { x: x + 0.01, y: top - 0.3, z: 0.003, sx: 0.05, sy: 0.6, sz: 0.004 }); // the rust's streak
    P.add(SHAPES.torus, pick(h, C.rust), { x, y: top - 0.04, z: 0.05, sx: 0.07, sy: 0.07, sz: 0.07 });
    const floor = h() < 0.55, links = floor ? Math.ceil((top - 0.15) / 0.055) : 10 + Math.floor(h() * 12);
    let y = top - 0.13;
    for (let i = 0; i < links && y > 0.05; i++, y -= 0.055) P.add(SHAPES.link, pick(h, C.rust), { x, y, z: 0.05, sx: 0.024, sy: 0.036, sz: 0.024, ry: i % 2 ? Math.PI / 2 : 0 });
    if (floor) for (let i = 0; i < 7; i++) P.add(SHAPES.link, pick(h, C.rust), { x: x + Math.sin(i * 0.5) * 0.04, y: 0.008, z: 0.1 + i * 0.055, sx: 0.024, sy: 0.036, sz: 0.024, rx: Math.PI / 2, rz: i % 2 ? Math.PI / 2 : 0 });
    else P.add(SHAPES.shackle, C.iron, { x, y: y - 0.02, z: 0.05, sx: 0.05, sy: 0.05, sz: 0.05, rz: Math.PI });
  }
}
// an iron grate over a drain in the floor: the black under it, a frame, bars, the wet round it
export function grate(P, h) {
  P.add(SHAPES.disc, '#0c0f14', { y: 0.002, sx: 0.62, sy: 0.002, sz: 0.5 });
  P.add(GEO.box, '#020203', { y: 0.004, sx: 0.6, sy: 0.004, sz: 0.6 });
  for (const a of [-1, 1]) { P.add(GEO.box, C.iron, { x: a * 0.31, y: 0.012, sx: 0.05, sy: 0.024, sz: 0.68 }); P.add(GEO.box, C.iron, { z: a * 0.31, y: 0.012, sx: 0.68, sy: 0.024, sz: 0.05 }); }
  for (let i = -2; i <= 2; i++) P.add(GEO.box, pick(h, [C.iron, ...C.rust]), { x: i * 0.11, y: 0.014, sx: 0.025, sy: 0.024, sz: 0.6 }); // (the bars 2 mm proud of the frame: a millimetre under it, they flickered)
}
// a coil of rope, its end trailing off
export function rope(P, h) {
  for (let i = 0; i < 7; i++) { const r = 0.2 - i * 0.01 - (i > 3 ? 0.03 : 0), y = 0.012 + i * 0.02 - (i > 3 ? 0.05 : 0); P.add(SHAPES.coil, C.rope[i % 3], { x: (h() - 0.5) * 0.03, y, z: (h() - 0.5) * 0.03, sx: r, sy: r, sz: r, rx: Math.PI / 2 + (h() - 0.5) * 0.12, rz: (h() - 0.5) * 0.12 }); }
  // its end trailing off the coil across the floor, in three lengths that bend
  let x = 0.2, z = 0, a = h() * 1.2 - 0.6;
  for (let i = 0; i < 3; i++) { const L = 0.2 + h() * 0.12; P.add(GEO.cyl6, C.rope[0], { x: x + Math.cos(a) * L / 2, y: 0.013, z: z + Math.sin(a) * L / 2, sx: 0.013, sy: L, sz: 0.013, rz: Math.PI / 2, ry: -a }); x += Math.cos(a) * L; z += Math.sin(a) * L; a += (h() - 0.5) * 1.2; }
}
// a wooden chair (built standing; toppled by the caller's frame)
export function chair(P, h, { brokenLeg = false } = {}) {
  const w = pick(h, C.wood), w2 = pick(h, C.wood);
  P.add(GEO.box, w, { y: 0.45, sx: 0.42, sy: 0.045, sz: 0.42 });
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const short = brokenLeg && a === 1 && b === 1; P.add(GEO.box, w2, { x: a * 0.18, y: short ? 0.32 : 0.225, z: b * 0.18, sx: 0.036, sy: short ? 0.2 : 0.45, sz: 0.036 }); }
  for (const a of [-1, 1]) P.add(GEO.box, w2, { x: a * 0.18, y: 0.74, z: -0.18, sx: 0.036, sy: 0.56, sz: 0.036 });
  for (const y of [0.66, 0.92]) P.add(GEO.box, w, { y, z: -0.18, sx: 0.36, sy: 0.06, sz: 0.024 });
  for (const z of [-0.18, 0.18]) P.add(GEO.box, w2, { y: 0.13, z, sx: 0.34, sy: 0.022, sz: 0.022 });
}
// a desk against the wall: drawers, a guttered candle in its dish (no flame: it burned down long ago), papers, ink, a book;
// and its chair pushed back
export function desk(P, h) {
  const w = pick(h, C.wood), w2 = pick(h, C.wood);
  P.add(GEO.box, w, { y: 0.76, sx: 1.2, sy: 0.05, sz: 0.62 });
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) P.add(GEO.box, w2, { x: a * 0.56, y: 0.37, z: b * 0.26, sx: 0.05, sy: 0.74, sz: 0.05 });
  P.add(GEO.box, w2, { x: 0.36, y: 0.62, sx: 0.42, sy: 0.22, sz: 0.56 });
  for (const y of [0.57, 0.67]) { P.add(GEO.box, w, { x: 0.36, y, z: 0.283, sx: 0.38, sy: 0.085, sz: 0.012 }); P.add(GEO.sphere, '#8a6a32', { x: 0.36, y, z: 0.293, sx: 0.012, sy: 0.012, sz: 0.01 }); }
  P.add(GEO.box, w2, { y: 0.6, z: -0.28, sx: 1.1, sy: 0.25, sz: 0.02 }); // the modesty panel at the back
  for (let i = 0; i < 4; i++) P.add(GEO.box, pick(h, C.paper), { x: -0.25 + h() * 0.2, y: 0.787 + i * 0.002, z: (h() - 0.5) * 0.2, sx: 0.21, sy: 0.002, sz: 0.29, ry: (h() - 0.5) * 0.8 });
  P.add(GEO.box, pick(h, C.books), { x: 0.36, y: 0.805, z: -0.12, sx: 0.17, sy: 0.04, sz: 0.24, ry: 0.2 });
  P.add(GEO.cyl8, '#141a22', { x: 0.1, y: 0.808, z: -0.16, sx: 0.028, sy: 0.045, sz: 0.028 });
  P.add(GEO.cone6, C.paper[2], { x: 0.13, y: 0.86, z: -0.16, sx: 0.008, sy: 0.16, sz: 0.008, rz: -0.5 }); // a quill
  // the guttered candle: an iron dish with a ring, a pool of wax, a stub, the drips down the dish's edge
  const cx = -0.42, cz = -0.12;
  P.add(SHAPES.disc, C.iron, { x: cx, y: 0.79, z: cz, sx: 0.07, sy: 0.012, sz: 0.07 });
  P.add(SHAPES.torus, C.iron, { x: cx + 0.085, y: 0.795, z: cz, sx: 0.025, sy: 0.025, sz: 0.025 });
  P.add(SHAPES.disc, C.waxOld, { x: cx, y: 0.798, z: cz, sx: 0.058, sy: 0.006, sz: 0.058 });
  P.add(GEO.cyl8, C.wax, { x: cx, y: 0.815, z: cz, sx: 0.024, sy: 0.034, sz: 0.024 });
  P.add(GEO.cyl6, '#1c1612', { x: cx, y: 0.836, z: cz, sx: 0.003, sy: 0.012, sz: 0.003 });
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + h(); P.add(GEO.sphere, C.waxOld, { x: cx + Math.cos(a) * 0.068, y: 0.775 - i * 0.004, z: cz + Math.sin(a) * 0.068, sx: 0.008, sy: 0.022, sz: 0.008 }); }
  P.group({ x: -0.15 + h() * 0.1, z: 0.62, ry: Math.PI + (h() - 0.5) * 0.6 }); chair(P, h); P.group(null);
}
// loose sheets of paper drifted over the floor (some curled), an open book face down
export function papers(P, h) {
  for (let i = 0; i < 9; i++) { const a = h() * 6.28, r = 0.1 + h() * 0.55; P.rest(GEO.box, pick(h, C.paper), { x: Math.cos(a) * r, z: Math.sin(a) * r, sx: 0.21, sy: 0.002, sz: 0.29, ry: h() * 6.28, rx: (h() - 0.5) * 0.08 }, i * 0.0015, 0); }
  const bx = (h() - 0.5) * 0.4, bz = (h() - 0.5) * 0.4, by = h() * 6.28, col = pick(h, C.books);
  for (const s of [-1, 1]) P.rest(GEO.box, col, { x: bx + Math.cos(by) * s * 0.09, z: bz - Math.sin(by) * s * 0.09, sx: 0.17, sy: 0.016, sz: 0.24, ry: by, rz: s * 0.16 });
}
// one shelf's worth of books along x (from x0 to x1) standing on a board at y: uneven widths and heights, gaps, one leaning into
// a gap, a short stack lying flat now and then; spines toward +z, set back from the board's front edge `front`
export function books(P, h, x0, x1, y, front, maxH = 0.36, fill = 0.88) {
  let x = x0, lean = 0;
  while (x < x1 - 0.03) {
    const r = h();
    if (r > fill) { x += 0.07 + h() * 0.18; lean = h() < 0.6 ? 1 : 0; continue; } // a gap (somebody took them)
    if (r > fill - 0.05 && x < x1 - 0.3) { // a short stack lying flat
      const n = 2 + Math.floor(h() * 3); let yy = y;
      for (let i = 0; i < n; i++) { const t = 0.03 + h() * 0.025; P.add(GEO.box, pick(h, C.books), { x: x + 0.13, y: yy + t / 2, z: front - 0.13 + (h() - 0.5) * 0.02, sx: 0.24 + h() * 0.04, sy: t, sz: 0.18 + h() * 0.05, ry: (h() - 0.5) * 0.15 }); yy += t; }
      x += 0.3; continue;
    }
    const w = 0.03 + h() * 0.05, bh = Math.min(maxH, 0.19 + h() * 0.17), d = 0.17 + h() * 0.08;
    if (lean) { // leaning into the gap before it, its foot against the next
      const a = 0.32 + h() * 0.25; P.rest(GEO.box, pick(h, C.books), { x: x + Math.sin(a) * bh / 2 - 0.02, y: Math.cos(a) * bh / 2, z: front - d / 2, sx: w, sy: bh, sz: d, rz: a }, y); x += Math.sin(a) * bh + w * 0.6; lean = 0; continue;
    }
    const back = h() * 0.03; // (how far the spine sits back from the shelf's front)
    P.add(GEO.box, pick(h, C.books), { x: x + w / 2, y: y + bh / 2, z: front - d / 2 - back, sx: w, sy: bh, sz: d });
    if (h() < 0.25) P.add(GEO.box, '#c9b98a', { x: x + w / 2, y: y + bh * (0.25 + h() * 0.5), z: front - back + 0.002, sx: w * 1.02, sy: 0.012, sz: 0.004 }); // a gilt band on the spine, 4 mm proud of it (on the shelf's front it sat level with some spines and flickered)
    x += w + 0.003;
  }
}
// a bookcase (along x, len wide, open toward +z, `depth` deep, `tall` high): sides, back, top, a plinth, shelf boards, books
export function bookcase(P, h, len = 2.4, depth = 0.45, tall = 2.2, fill = 0.88) {
  const w = pick(h, C.wood), w2 = pick(h, C.wood), e = len / 2, t = 0.045;
  for (const a of [-1, 1]) P.add(GEO.box, w, { x: a * (e - t / 2), y: (tall - 0.02) / 2, sx: t, sy: tall - 0.02, sz: depth }); // (the sides and the back stop inside the top board: level with it, their tops flickered)
  P.add(GEO.box, C.woodDark, { y: (tall - 0.02) / 2, z: -depth / 2 + 0.016, sx: len - 2 * t, sy: tall - 0.02, sz: 0.024 }); // (the back 4 mm in from the sides' backs)
  P.add(GEO.box, w, { y: tall - 0.03, sx: len + 0.06, sy: 0.06, sz: depth + 0.04 });
  P.add(GEO.box, w2, { y: 0.05, z: 0.0135, sx: len - 2 * t, sy: 0.1, sz: depth - 0.031 }); // (the plinth 4 mm in from the sides' fronts and a hair clear of the back: into it, the two bottoms showed level on the fallen case)
  const levels = [0.1, 0.62, 1.14, 1.66];
  for (const y of levels.slice(1)) P.add(GEO.box, w2, { y: y - 0.015, sx: len - 2 * t, sy: 0.03, sz: depth - 0.03 });
  for (const y of levels) books(P, h, -e + t + 0.01, e - t - 0.01, y, depth / 2 - 0.02, 0.4, fill);
}
// a lectern (the reading stand), standing; the kit lays it on its side
export function lectern(P, h) {
  const w = pick(h, C.wood);
  P.add(GEO.box, w, { y: 0.03, sx: 0.55, sy: 0.06, sz: 0.42 });
  P.add(GEO.box, w, { y: 0.5, sx: 0.09, sy: 0.92, sz: 0.09 });
  P.add(GEO.box, w, { y: 1.0, z: 0.02, sx: 0.56, sy: 0.04, sz: 0.4, rx: 0.5 });
  P.add(GEO.box, C.woodDark, { y: 1.07, z: -0.12, sx: 0.54, sy: 0.04, sz: 0.04, rx: 0.5 }); // (the lip a centimetre short of the slope's ends: level with them, the ends flickered on the toppled one)
}

// ---- one of maze-gen.js's props on the batcher: its record (kind, its world bounds, where it stands)
export function buildProp(b, p, floorY, { skull, bone, BONE }) {
  const h = rng(p.k), P = new Prop(p.kind);
  let settle = floorY, shadow = null;
  const yaw = p.side >= 0 ? p.yaw : p.yaw || 0, out0 = { rubble: 0.36, crate: 0.4, barrel: 0.36, planks: 0.3, pots: 0.3, rope: 0.36, chair: 0.6, desk: 0.42, bones: 0.75 }[p.kind] ?? 0;
  switch (p.kind) {
    case 'crate': {
      const s = 0.55 + h() * 0.2; crate(P, s, h, p.k < 0.3); shadow = [s * 0.62, s * 0.62];
      if (p.k > 0.55) { P.group({ x: (h() - 0.5) * 0.12, y: s, z: -0.05, ry: (h() - 0.5) * 0.5 }); crate(P, s * 0.7, h); P.group(null); }
      P.at(p.x, 0, p.z, yaw + (h() - 0.5) * 0.3); break;
    }
    case 'barrel': {
      const tipped = p.k < 0.3; barrel(P, h, { tipped }); shadow = tipped ? [0.48, 0.3] : [0.34, 0.34];
      if (tipped) P.at(p.x, 0, p.z, yaw + Math.PI / 2 + (h() - 0.5) * 0.3, 0, Math.PI / 2); else P.at(p.x, 0, p.z, yaw); break;
    }
    case 'rubble': rubble(P, h, out0); shadow = [0.4, 0.22]; P.at(p.x, 0, p.z, yaw); break;
    case 'planks': planks(P, h, out0); P.at(p.x, 0, p.z, yaw); break;
    case 'pots': pots(P, h); P.at(p.x, 0, p.z, yaw); break;
    case 'chains': chains(P, h); settle = null; P.at(p.x, floorY, p.z, yaw); break; // on the wall, the face at the frame's z 0
    case 'grate': grate(P, h); P.at(p.x, 0, p.z, yaw); break;
    case 'rope': rope(P, h); P.at(p.x, 0, p.z, yaw + h() * 6); break;
    case 'chair': chair(P, h, { brokenLeg: p.k < 0.4 }); shadow = [0.4, 0.35];
      if (p.k < 0.5) P.at(p.x, 0, p.z, yaw + (h() - 0.5) * 0.8, -Math.PI / 2 + 0.05); else P.at(p.x, 0, p.z, yaw + (h() - 0.5) * 0.8, 0, Math.PI / 2 - 0.02); break;
    case 'desk': desk(P, h); shadow = [0.66, 0.36]; P.at(p.x, 0, p.z, yaw); break;
    case 'papers': papers(P, h); P.at(p.x, 0, p.z, yaw); break;
    case 'bones': {
      for (let i = 0; i < 6; i++) { P.group({ x: (h() - 0.5) * 1.4, z: (h() - 0.5) * 0.5 }); bone(P, 0, 0.026, 0, h() * 6, 0.3 + h() * 0.14, 0, h() < 0.5 ? BONE : '#bfb08e'); P.group(null); }
      if (h() < 0.7) { P.group({ x: (h() - 0.5) * 1.0, z: (h() - 0.5) * 0.3 }); skull(P, 0, 0, 0, h() * 6, 0.95); P.group(null); }
      P.at(p.x, 0, p.z, yaw); break;
    }
    default: return null;
  }
  const rec = P.commit(b, { settle });
  if (shadow && settle !== null) blob(b, p.x, floorY, p.z, shadow[0], shadow[1], yaw);
  return { ...rec, x: p.x, z: p.z, floor: floorY, onFloor: settle !== null };
}

// ---- a locked gate (rust, rivets, a padlock, set into a stone sill and a lintel), in the gate's own frame: x along it, z across
// it (+z into the dead end), y up, the middle of its opening at the origin. The leaf moves (maze-gates.js shakes it and lets it
// fall, so draw it on its own batcher there), the posts and the stone stay. gateRng(g) is its own rng (the same everywhere).
export const gateRng = g => rng(((g.cx * 0.137 + g.cy * 0.311) % 1 + 1) % 1);
const GATE_RUST = ['#2e2624', '#3a2a24', '#26262d', '#3d2a22', '#26262d', '#33231c'];
export function gateLeaf(b, h) {
  for (let k = -4; k <= 4; k++) b.add(GEO.cyl6, GATE_RUST[Math.floor(h() * GATE_RUST.length)], { x: k * 0.38, y: 1.53, sx: 0.035, sy: 2.94, sz: 0.035 });
  for (const y of [0.32, 1.5, 2.7]) {
    b.add(GEO.box, GATE_RUST[Math.floor(h() * 3)], { y, sx: 3.4, sy: 0.07, sz: 0.06 });
    for (let k = -4; k <= 4; k++) for (const f of [-1, 1]) b.add(GEO.sphere, '#3a3438', { x: k * 0.38, y, z: f * 0.033, sx: 0.018, sy: 0.018, sz: 0.018 }); // the rivets
  }
  for (const f of [-1, 1]) { // the padlock through a hasp on both faces: its body, the shackle over the rail, a keyhole
    b.add(GEO.box, '#2a2a30', { x: 1.45, y: 1.1, z: f * 0.06, sx: 0.16, sy: 0.05, sz: 0.012 });
    b.add(GEO.box, '#4a2c1e', { x: 1.36, y: 0.98, z: f * 0.13, sx: 0.13, sy: 0.15, sz: 0.06 });
    b.add(SHAPES.shackle, '#3a3a40', { x: 1.36, y: 1.06, z: f * 0.13, sx: 0.045, sy: 0.07, sz: 0.045 });
    b.add(GEO.box, '#0b0b0e', { x: 1.36, y: 0.95, z: f * 0.163, sx: 0.016, sy: 0.04, sz: 0.004 });
  }
}
export function gatePosts(b) {
  for (const s of [-1, 1]) b.add(GEO.box, C.iron, { x: s * 1.72, y: 1.53, sx: 0.12, sy: 2.94, sz: 0.12 });
  for (const y of [0.5, 2.5]) { b.add(GEO.cyl8, '#2a2a30', { x: -1.72, y, sx: 0.05, sy: 0.16, sz: 0.05 }); b.add(GEO.box, '#3a2a24', { x: -1.5, y, sx: 0.4, sy: 0.05, sz: 0.04 }); } // the hinges and their straps
}
export function gateStone(b, h) {
  b.add(GEO.box, '#3f4454', { y: 0.03, sx: 3.5, sy: 0.06, sz: 0.3 }); b.add(GEO.box, '#3a3f50', { y: 3.08, sx: 3.5, sy: 0.24, sz: 0.3 }); // the sill, the lintel
  for (const f of [-1, 1]) b.add(SHAPES.disc, '#1e140f', { x: (h() - 0.5) * 2, y: 0.004, z: f * 0.32, sx: 0.5 + h() * 0.4, sy: 0.002, sz: 0.24 }); // rust run onto the floor
}
