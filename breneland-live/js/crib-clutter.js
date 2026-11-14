// Kevin's Tool Crib, packed (crib-clutter): Kevin is 78, a handyman who never throws anything away. Boxes of springs on the floor,
// the bench and the shelves; chrome wire shelving up the stair's side, every shelf full of totes of wrenches, bolts, nuts and
// sockets; a pyramid of used paint cans with a blue tarp half pulled off it; a roll-up garage door in the east wall with Kevin's
// old cruiser parked in the corner inside it; bikes hung upside down from the beams; an extension ladder and a step ladder on the
// walls; more tools than the pegboard has outlines for, coffee cans of screws, extension cords coiled on nails, a shop vac, a rolling
// tool chest with a drawer open and a box fan on it, two lawn mowers waiting to be fixed, a radio on a shelf, salvaged signs high on
// the walls, old doors leaning on the window display's back, and a FREE box on the porch.
//
// Draw calls: everything is merged into tool-crib-build.js's own batches (the inside batch, drawn only near or inside; the shell
// batch for the roll-up door, its light and the porch's box), so the clutter adds triangles and no draw call, except the salvaged
// signs' one textured mesh (one atlas canvas). Clean geometry as the rest of the crib: pieces sit on or are buried in each other,
// faces in another's plane are a few millimetres apart (tool-crib-test's coplanar check), floor things carry colliders.
// `items` lists every piece by name with its world box (x0, y0, z0, x1, y1, z1); `floor: true` stands on the shop floor
// (crib-clutter-test keeps Kevin's routes and the stair clear of those).
import * as THREE from 'three';
import { GEO, Batcher } from './batch.js';
import { toon } from './toon.js';
import { CRIB } from './tool-crib-plan.js';
import { vehicleShape, partsMesh, wheelGroups } from './vehicle-models.js';   // (props-vehicles) Kevin's Blender cruiser when loaded
import { cribAnchor, cribItems, cribColliders } from './crib-model.js';   // (crib-setpiece) the set piece's anchors: the piles it has
const cribAnchorProp = (model, name, key) => { const a = cribAnchor(name); return a && a[key] != null ? a[key] : 0; };

export const COL = {
  card: '#c8a26e', cardDk: '#a9824f', chrome: '#c8ccd2', chromeDk: '#9aa3ad', steel: '#9aa3ad', iron: '#3a3f47', ink: '#2b2340', black: '#2b2b30',
  tin: '#dfe3e6', wood: '#a8804f', woodDk: '#5a3c26', woodMid: '#7a5232', label: '#fbf7ee', tarp: '#3a6fb0', tarpDk: '#2f5d96',
};
export const PAINTS = ['#e0463c', '#f08a3c', '#f0c24f', '#f6e9a8', '#7ddc7a', '#3f8a5a', '#6fd3ff', '#3f6fa8', '#2f3b6c', '#b48cff', '#ff8fb8', '#ffffff', '#c9b8a0', '#8a5a3a', '#4a4a50', '#a3282c', '#9ad8c4', '#e8c27a'];
const SPRING = ['#9aa3ad', '#c9a23a', '#b8733a', '#3a3f47', '#e0463c', '#3f8fd9', '#7ddc7a', '#e0b54a', '#c8ccd2', '#ff8fb8'];
const TOTES = ['#3f6fa8', '#c0392b', '#e0b54a', '#3f8a5a', '#8a8f98', '#2b2b30', '#e07a2c', '#6fa8d8'];

// a small deterministic random (the shop is the same on every screen)
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A local frame (x, y, z, yaw, then a tilt about its own x and z): put(geo, col, { x, y, z, rx, ry, rz, sx, sy, sz }) adds a piece
// placed in that frame to the batcher; put.box(x0, y0, z0, x1, y1, z1, col) a box by its corners; put.rod(a, b, r, col, geo) a rod
// between two local points
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _u = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
export function framer(b, x, y, z, yaw = 0, tiltX = 0, tiltZ = 0) {
  const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const put = (geo, col, o = {}) => {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1); _p.set(o.x || 0, o.y || 0, o.z || 0);
    b.add(geo, col, { matrix: new THREE.Matrix4().compose(_p, _q, _s).premultiply(M) });
  };
  put.box = (x0, y0, z0, x1, y1, z1, col) => put(GEO.box, col, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0 });
  put.rod = (a, c, r, col, geo = GEO.cyl6) => {
    _u.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const L = _u.length(); _u.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_y, _u);
    _s.set(r, L, r); _p.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
    b.add(geo, col, { matrix: new THREE.Matrix4().compose(_p, q, _s).premultiply(M) });
  };
  put.M = M;
  return put;
}
export const world = b => framer(b, 0, 0, 0);

// a small helix (the springs in the boxes): one geometry per kind, scaled and placed per spring
let COILS = null;
function coils() {
  if (COILS) return COILS;
  const mk = (turns, r, h, w) => {
    const pts = [], n = Math.round(turns * 6);
    for (let i = 0; i <= n; i++) { const a = i / n * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, i / n * h, Math.sin(a) * r)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, w, 3, false);
  };
  COILS = [mk(6, 0.5, 2.2, 0.08), mk(9, 0.5, 2.6, 0.07), mk(4, 0.5, 1.0, 0.1)];
  return COILS;
}

// ---------------------------------------------------------------- the pieces (each in its own frame; sizes in metres)

// A cardboard box of springs: open flaps, a label with "SPRINGS" scrawled on it, full to the brim with coils poking out.
// (x, y, z) the middle of its bottom, w along its local x, d along z, h tall
function springBox(b, items, x, y, z, w, d, h, yaw, seed, name = 'spring-box') {
  const f = framer(b, x, y, z, yaw), R = rng(seed), t = 0.008;
  f.box(-w / 2, 0, -d / 2, w / 2, t, d / 2, COL.cardDk);
  f.box(-w / 2, t, -d / 2, w / 2, h, -d / 2 + t, COL.card); f.box(-w / 2, t, d / 2 - t, w / 2, h, d / 2, COL.card);
  f.box(-w / 2, t, -d / 2 + t, -w / 2 + t, h, d / 2 - t, COL.card); f.box(w / 2 - t, t, -d / 2 + t, w / 2, h, d / 2 - t, COL.card);
  // the heap inside, a few millimetres under the rim, then the coils on it
  f.box(-w / 2 + t + 0.003, t, -d / 2 + t + 0.003, w / 2 - t - 0.003, h - 0.03, d / 2 - t - 0.003, '#7d848c');
  // the flaps: hinged at the rim, fallen open outward and drooping (the long sides' flaps more)
  for (const s of [-1, 1]) {
    const a = 0.55, Lf = d * 0.46, a2 = 0.95, Ls = w * 0.32;
    f(GEO.box, COL.cardDk, { y: h - Math.sin(a) * Lf / 2, z: s * (d / 2 + Math.cos(a) * Lf / 2 - 0.003), sx: w - 0.012, sy: 0.006, sz: Lf, rx: s * a });
    f(GEO.box, COL.cardDk, { x: s * (w / 2 + Math.cos(a2) * Ls / 2 - 0.003), y: h - Math.sin(a2) * Ls / 2, sx: Ls, sy: 0.006, sz: d - 0.03, rz: -s * a2 });
  }
  // the label on the front, "SPRINGS" in marker
  f.box(-w * 0.32, h * 0.38, -d / 2 - 0.004, w * 0.32, h * 0.72, -d / 2 + 0.001, COL.label);
  for (let k = 0; k < 7; k++) f.box(-w * 0.27 + k * w * 0.08, h * 0.47, -d / 2 - 0.007, -w * 0.27 + k * w * 0.08 + w * 0.05, h * 0.63, -d / 2 - 0.004, COL.ink);
  const C = coils(), n = Math.max(5, Math.round(w * d * 90));
  for (let i = 0; i < n; i++) {
    const kind = i % C.length, sc = 0.022 + R() * 0.018;
    f(C[kind], SPRING[Math.floor(R() * SPRING.length)], { x: (R() - 0.5) * (w - 0.08), y: h - 0.05 + R() * 0.03, z: (R() - 0.5) * (d - 0.08), sx: sc, sy: sc * (0.9 + R() * 0.6), sz: sc, rx: 0.4 + R() * 1.1, ry: R() * 6.28, rz: (R() - 0.5) * 0.8 });
  }
  items.push({ name, box: boxOf(f.M, w + 0.12, d + 0.12, h + 0.12), floor: Math.abs(y - CRIB.fy) < 0.02 });
}
// the world box of a w x d footprint h tall in a frame (yaw only)
function boxOf(M, w, d, h) {
  const e = M.elements, x = e[12], y = e[13], z = e[14], c = Math.abs(e[0]), s = Math.abs(e[8]);
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
  return [x - hx, y, z - hz, x + hx, y + h, z + hz];
}

// A coffee can of screws (the label worn, screws heaped over the rim)
export function coffeeCan(b, x, y, z, seed) {
  const R = rng(seed), f = framer(b, x, y, z, R() * 6);
  f(GEO.cyl12, ['#c0392b', '#3f6fa8', '#2f5442', '#e0b54a'][seed % 4], { y: 0.07, sx: 0.065, sy: 0.14, sz: 0.065 });
  f(GEO.cyl12, '#b4b9be', { y: 0.141, sx: 0.06, sy: 0.006, sz: 0.06 });
  for (let i = 0; i < 9; i++) f(GEO.cyl6, i % 3 ? '#8f969e' : '#c9a23a', { x: (R() - 0.5) * 0.08, y: 0.15 + R() * 0.02, z: (R() - 0.5) * 0.08, sx: 0.005, sy: 0.05, sz: 0.005, rx: R() * 1.4, ry: R() * 6, rz: R() - 0.5 });
}

// A plastic tote (open, lidded or with its lid askew) of wrenches, bolts, nuts and sockets spilling over the top.
// (x, y, z) the middle of its bottom; w along x, d along z
function tote(b, x, y, z, w, d, h, col, kind, seed) {
  const f = framer(b, x, y, z), R = rng(seed), t = 0.012;
  f.box(-w / 2 + 0.01, 0, -d / 2 + 0.01, w / 2 - 0.01, t, d / 2 - 0.01, col);
  f.box(-w / 2, t, -d / 2, w / 2, h, -d / 2 + t, col); f.box(-w / 2, t, d / 2 - t, w / 2, h, d / 2, col);
  f.box(-w / 2, t, -d / 2 + t, -w / 2 + t, h, d / 2 - t, col); f.box(w / 2 - t, t, -d / 2 + t, w / 2, h, d / 2 - t, col);
  f.box(-w / 2 - 0.008, h - 0.02, -d / 2 - 0.008, w / 2 + 0.008, h - 0.004, d / 2 + 0.008, col);   // the lip
  if (kind === 'lid') { f.box(-w / 2 - 0.012, h - 0.004, -d / 2 - 0.012, w / 2 + 0.012, h + 0.018, d / 2 + 0.012, col); return; }
  f.box(-w / 2 + t + 0.003, t, -d / 2 + t + 0.003, w / 2 - t - 0.003, h - 0.045 - R() * 0.03, d / 2 - t - 0.003, '#6b7078');   // the heap of steel
  if (kind === 'askew') f(GEO.box, col, { x: w * 0.18, y: h + 0.03, z: -d * 0.12, sx: w + 0.02, sy: 0.02, sz: d + 0.02, ry: 0.28, rz: 0.12 });
  const n = kind === 'askew' ? 3 : 7;
  for (let i = 0; i < n; i++) {
    const px = (R() - 0.5) * (w - 0.1), pz = (R() - 0.5) * (d - 0.1), py = h - 0.06, what = Math.floor(R() * 4), ry = R() * 6.28;
    if (what === 0) { // a wrench sticking up out of the heap (its foot buried in it)
      const tl = 0.18 + R() * 0.06, lean = 0.5 + R() * 0.6;
      const g = framer(b, x + px, y + py, z + pz, ry, lean, 0);
      g.box(-0.013, 0, -0.006, 0.013, tl, 0.006, COL.chrome);
      g.box(-0.03, tl, -0.007, 0.03, tl + 0.05, 0.007, COL.chrome);
      g.box(-0.009, tl + 0.02, -0.0095, 0.009, tl + 0.054, 0.0095, '#4a4f57');   // (the open jaw)
    } else if (what === 1) { // a bolt
      const g = framer(b, x + px, y + py, z + pz, ry, 0.2 + R() * 1.1, 0);
      g(GEO.cyl6, COL.steel, { y: 0.05, sx: 0.009, sy: 0.1, sz: 0.009 }); g(GEO.cyl6, '#8f969e', { y: 0.106, sx: 0.02, sy: 0.013, sz: 0.02 });
    } else if (what === 2) { // a socket
      f(GEO.cyl8, COL.chrome, { x: px, y: py + 0.02, z: pz, sx: 0.022, sy: 0.045, sz: 0.022, rx: R() * 1.5, ry });
    } else { // a nut or two
      f(GEO.cyl6, '#8f969e', { x: px, y: py + 0.012, z: pz, sx: 0.018, sy: 0.012, sz: 0.018, rx: R() * 0.6, ry });
      f(GEO.cyl6, '#b4b9be', { x: px + 0.04, y: py + 0.016, z: pz - 0.02, sx: 0.015, sy: 0.011, sz: 0.015, rx: R() * 0.6 + 0.2, ry });
    }
  }
  // one hanging over the front lip (toward the aisle: +x)
  const g = framer(b, x + w / 2 + 0.004, y + h - 0.004, z + (R() - 0.5) * d * 0.5, Math.PI / 2, 0, -0.35);
  g.box(-0.013, -0.2, -0.006, 0.013, 0.08, 0.006, COL.chrome); g.box(-0.03, -0.25, -0.007, 0.03, -0.2, 0.007, COL.chrome);
}

// A chrome wire shelving unit, its back on local -x, front on +x (x0..x1 depth, z0..z1 length), shelves at `levels` (heights above y)
function wireUnit(b, x0, x1, z0, z1, y, levels, H) {
  const f = world(b), r = 0.013;
  for (const px of [x0 + r, x1 - r]) for (const pz of [z0 + r, z1 - r]) { f(GEO.cyl8, COL.chrome, { x: px, y: y + H / 2, z: pz, sx: r, sy: H, sz: r }); f(GEO.cyl8, COL.black, { x: px, y: y + 0.01, z: pz, sx: r + 0.006, sy: 0.02, sz: r + 0.006 }); }
  for (const lv of levels) {
    const yy = y + lv;
    // the frame (front and back rails along z, side rails along x), the wires across, the truss under the front
    for (const px of [x0 + 0.004, x1 - 0.004]) f.box(px - 0.009, yy - 0.02, z0 + 0.004, px + 0.009, yy, z1 - 0.004, COL.chrome);
    for (const pz of [z0 + 0.012, z1 - 0.012]) f.box(x0 + 0.013, yy - 0.016, pz - 0.006, x1 - 0.013, yy - 0.002, pz + 0.006, COL.chrome);
    for (let z = z0 + 0.06; z < z1 - 0.04; z += 0.065) f.box(x0 + 0.013, yy - 0.011, z - 0.003, x1 - 0.013, yy - 0.005, z + 0.003, COL.chromeDk);
    for (let z = z0 + 0.06; z < z1 - 0.1; z += 0.12) f.box(x1 - 0.011, yy - 0.06, z, x1 - 0.005, yy - 0.02, z + 0.08, COL.chromeDk);
  }
}

// A bicycle in its own frame: x forward, y up from the wheels' middles, z across; colour, scale
function bicycle(f, col, k = 1) {
  const Rw = 0.33 * k, wb = 0.52 * k, BB = [-0.02 * k, -0.06 * k, 0], ST = [-0.17 * k, 0.5 * k, 0], HT = [0.4 * k, 0.5 * k, 0], HB = [0.43 * k, 0.38 * k, 0];
  for (const wx of [-wb, wb]) {
    f(new THREE.TorusGeometry(Rw - 0.022, 0.022, 4, 16), COL.black, { x: wx });
    f(new THREE.TorusGeometry(Rw - 0.05, 0.008, 3, 16), COL.chrome, { x: wx });
    for (let s = 0; s < 3; s++) f(GEO.box, COL.chromeDk, { x: wx, sx: 2 * (Rw - 0.05), sy: 0.005, sz: 0.005, rz: s * Math.PI / 3 });
    f(GEO.cyl8, COL.chrome, { x: wx, sx: 0.025, sy: 0.08, sz: 0.025, rx: Math.PI / 2 });
  }
  const rear = [-wb, 0, 0], front = [wb, 0, 0];
  for (const [a, c] of [[BB, ST], [ST, HT], [BB, HB], [BB, rear], [ST, rear], [HB, HT]]) f.rod(a, c, 0.017 * k, col);
  for (const s of [-1, 1]) f.rod([HB[0], HB[1], s * 0.04], [front[0], 0, s * 0.045], 0.012 * k, col);
  f.rod(ST, [ST[0] - 0.03, ST[1] + 0.12 * k, 0], 0.012, COL.chrome);
  f(GEO.box, COL.black, { x: ST[0] - 0.04, y: ST[1] + 0.15 * k, sx: 0.24 * k, sy: 0.05, sz: 0.11 });
  f.rod(HT, [HT[0] - 0.02, HT[1] + 0.1 * k, 0], 0.012, COL.chrome);
  f(GEO.cyl6, COL.chrome, { x: HT[0] - 0.02, y: HT[1] + 0.1 * k, sx: 0.011, sy: 0.5 * k, sz: 0.011, rx: Math.PI / 2 });
  for (const s of [-1, 1]) f(GEO.cyl6, COL.black, { x: HT[0] - 0.02, y: HT[1] + 0.1 * k, z: s * 0.22 * k, sx: 0.016, sy: 0.09, sz: 0.016, rx: Math.PI / 2 });
  f(GEO.cyl12, COL.chromeDk, { x: BB[0], y: BB[1], z: 0.05, sx: 0.07 * k, sy: 0.012, sz: 0.07 * k, rx: Math.PI / 2 });
  f(GEO.box, COL.iron, { x: BB[0] + 0.07, y: BB[1] - 0.08, z: 0.08, sx: 0.03, sy: 0.17, sz: 0.012, rz: 0.9 });
  f(GEO.box, COL.black, { x: BB[0] + 0.14, y: BB[1] - 0.14, z: 0.11, sx: 0.09, sy: 0.02, sz: 0.06 });
}
// a J hook screwed up into a beam's underside, its curl at (x, y, z)
// (its curl across the tyre: in the y-z plane for a wheel along x, in the x-y plane for one along z)
function hook(f, x, y, z, up, alongZ = false) {
  f(GEO.cyl6, COL.iron, { x, y: (y + up) / 2, z, sx: 0.008, sy: up - y, sz: 0.008 });
  f(new THREE.TorusGeometry(0.035, 0.007, 3, 8, Math.PI), COL.iron, { x, y, z, rz: Math.PI, ry: alongZ ? 0 : Math.PI / 2 });
}

// Kevin's motorcycle: an old cruiser, maroon and a bit dusty, in its frame (x forward, y up from the floor, z to its right).
// fh: where the helmet's parts go (its own mesh since crib-move: hidden while Kevin wears it); the bike's by default
function motorcycle(f, fh = f) {
  const MA = '#7a2a2a', MAd = '#5e2020', CH = '#c3c7cc', BL = '#2b2b30', LE = '#4a3020', TAN = '#6b4a2b', ENG = '#8f969e';
  const wheel = (x) => {
    f(new THREE.TorusGeometry(0.27, 0.075, 6, 18), BL, { x, y: 0.345 });
    f(GEO.cyl12, CH, { x, y: 0.345, sx: 0.2, sy: 0.08, sz: 0.2, rx: Math.PI / 2 });
    f(GEO.cyl8, '#6b7078', { x, y: 0.345, sx: 0.07, sy: 0.17, sz: 0.07, rx: Math.PI / 2 });
  };
  wheel(-0.72); wheel(0.74);
  // the fenders (deep valanced cruiser ones), the frame
  f(new THREE.TorusGeometry(0.36, 0.05, 4, 12, 1.9), MA, { x: 0.74, y: 0.345, rz: 0.55, sz: 2.4 });
  f(new THREE.TorusGeometry(0.36, 0.05, 4, 14, 2.7), MA, { x: -0.72, y: 0.345, rz: 0.75, sz: 2.6 });
  for (const [a, c] of [[[0.5, 0.98, 0], [0.18, 0.32, 0]], [[0.18, 0.32, 0], [-0.38, 0.28, 0]], [[-0.38, 0.28, 0], [-0.3, 0.78, 0]], [[0.5, 0.98, 0], [-0.3, 0.84, 0]], [[-0.3, 0.8, 0], [-0.72, 0.345, 0]], [[-0.38, 0.28, 0], [-0.72, 0.345, 0]]]) f.rod(a, c, 0.028, BL, GEO.cyl8);
  // the fork, the triple clamps, the headlight, the bars, the mirrors
  for (const s of [-1, 1]) f.rod([0.74, 0.345, s * 0.1], [0.5, 1.02, s * 0.1], 0.026, CH, GEO.cyl8);
  for (const y of [0.9, 1.0]) f(GEO.box, CH, { x: 0.53 - (y - 0.9) * 0.3, y, sx: 0.09, sy: 0.04, sz: 0.26, rz: 0.34 });
  f(GEO.cyl12, CH, { x: 0.63, y: 0.9, sx: 0.1, sy: 0.13, sz: 0.1, rz: Math.PI / 2 });
  f(GEO.cyl12, '#f6efdc', { x: 0.697, y: 0.9, sx: 0.085, sy: 0.01, sz: 0.085, rz: Math.PI / 2 });
  f.rod([0.49, 1.02, 0], [0.43, 1.12, 0], 0.02, CH);
  f(GEO.cyl8, CH, { x: 0.41, y: 1.13, sx: 0.015, sy: 0.7, sz: 0.015, rx: Math.PI / 2 });
  for (const s of [-1, 1]) {
    f.rod([0.41, 1.13, s * 0.35], [0.3, 1.16, s * 0.4], 0.015, CH);
    f(GEO.cyl8, BL, { x: 0.27, y: 1.17, z: s * 0.41, sx: 0.022, sy: 0.11, sz: 0.022, rx: Math.PI / 2, rz: 0.3 });
    f.rod([0.41, 1.13, s * 0.31], [0.39, 1.34, s * 0.35], 0.007, CH);
    f(GEO.cyl12, CH, { x: 0.39, y: 1.37, z: s * 0.355, sx: 0.06, sy: 0.014, sz: 0.06, rz: Math.PI / 2 });
    f(GEO.cyl12, '#dfeef4', { x: 0.381, y: 1.37, z: s * 0.355, sx: 0.05, sy: 0.006, sz: 0.05, rz: Math.PI / 2 });
  }
  // the tank, its badge; the seat and the pillion; the saddlebags
  f(GEO.sphere, MA, { x: 0.17, y: 0.99, sx: 0.31, sy: 0.12, sz: 0.15, rz: -0.12 });
  f(GEO.sphere, CH, { x: 0.18, y: 1.0, z: 0.135, sx: 0.06, sy: 0.025, sz: 0.02 });
  f(GEO.sphere, CH, { x: 0.18, y: 1.0, z: -0.135, sx: 0.06, sy: 0.025, sz: 0.02 });
  f(GEO.box, TAN, { x: -0.22, y: 0.88, sx: 0.48, sy: 0.08, sz: 0.3, rz: -0.06 });
  f(GEO.box, TAN, { x: -0.55, y: 0.93, sx: 0.22, sy: 0.06, sz: 0.24, rz: -0.12 });
  for (const s of [-1, 1]) {
    f(GEO.box, LE, { x: -0.6, y: 0.66, z: s * 0.25, sx: 0.36, sy: 0.26, sz: 0.12 });
    f(GEO.box, '#3a2618', { x: -0.6, y: 0.8, z: s * 0.255, sx: 0.37, sy: 0.04, sz: 0.124 });
    for (const dx of [-0.08, 0.08]) f(GEO.box, '#2a1a10', { x: -0.6 + dx, y: 0.7, z: s * 0.316, sx: 0.025, sy: 0.18, sz: 0.012 });
    f.rod([-0.66, 0.4, s * 0.15], [-0.44, 0.84, s * 0.15], 0.022, CH);   // the shocks
    f(GEO.box, BL, { x: 0.27, y: 0.3, z: s * 0.25, sx: 0.24, sy: 0.02, sz: 0.11 });   // the floorboards
  }
  // the engine: a V-twin over the crankcase, the air cleaner, the pipes down the right side
  f(GEO.box, ENG, { x: 0.0, y: 0.45, sx: 0.4, sy: 0.26, sz: 0.24 });
  for (const s of [-1, 1]) {
    f(GEO.cyl8, '#b4b9be', { x: s * 0.1, y: 0.72, sx: 0.075, sy: 0.3, sz: 0.075, rz: -s * 0.5 });
    for (let k = 0; k < 4; k++) f(GEO.cyl8, '#a3a9ad', { x: s * (0.065 + k * 0.025), y: 0.64 + k * 0.045, sx: 0.09, sy: 0.012, sz: 0.09, rz: -s * 0.5 });
    f(GEO.box, '#8f969e', { x: s * 0.18, y: 0.86, sx: 0.12, sy: 0.07, sz: 0.16, rz: -s * 0.5 });
  }
  f(GEO.cyl12, CH, { x: 0.0, y: 0.68, z: 0.18, sx: 0.1, sy: 0.05, sz: 0.1, rx: Math.PI / 2 });
  for (const [y, x0] of [[0.33, 0.12], [0.44, -0.08]]) {
    f.rod([x0, 0.66, 0.16], [x0 - 0.05, y, 0.2], 0.022, CH);
    f(GEO.cyl8, CH, { x: (x0 - 0.05 - 0.92) / 2, y, z: 0.2, sx: 0.024, sy: x0 - 0.05 + 0.92, sz: 0.024, rz: Math.PI / 2 });
    f(GEO.cyl8, CH, { x: -0.95, y, z: 0.2, sx: 0.04, sy: 0.12, sz: 0.04, rz: Math.PI / 2 });
  }
  // the tail light, the plate, the kickstand down on the left
  f(GEO.box, '#c0392b', { x: -1.0, y: 0.74, sx: 0.04, sy: 0.05, sz: 0.1 });
  f(GEO.box, '#e8e2d6', { x: -0.99, y: 0.6, sx: 0.012, sy: 0.1, sz: 0.18 });
  f(GEO.box, '#2f5442', { x: -0.997, y: 0.6, sx: 0.006, sy: 0.04, sz: 0.12 });
  f.rod([-0.02, 0.3, -0.13], [-0.14, 0.04, -0.36], 0.014, BL);
  f(GEO.box, BL, { x: -0.14, y: 0.035, z: -0.36, sx: 0.07, sy: 0.016, sz: 0.05 });
  // his helmet hung by its strap on the left mirror: an old open-face one, cream with a red stripe, goggles on it
  const hx = 0.4, hy = 1.17, hz = -0.42;
  fh.rod([0.39, 1.36, -0.37], [hx, hy + 0.14, hz], 0.005, '#3a2618');
  fh(GEO.sphere, '#ece4cf', { x: hx, y: hy, z: hz, sx: 0.15, sy: 0.14, sz: 0.15 });
  fh(GEO.sphere, '#b8382c', { x: hx, y: hy + 0.002, z: hz, sx: 0.04, sy: 0.143, sz: 0.152 });
  fh(GEO.box, '#2b2b30', { x: hx + 0.12, y: hy - 0.02, z: hz, sx: 0.06, sy: 0.12, sz: 0.16 });
  fh(new THREE.TorusGeometry(0.15, 0.012, 4, 14), '#4a3020', { x: hx, y: hy + 0.03, z: hz, rx: Math.PI / 2, sx: 1.01, sy: 1.01 });
  for (const s of [-1, 1]) fh(GEO.cyl8, '#8fb8c8', { x: hx + 0.157, y: hy + 0.06, z: hz + s * 0.05, sx: 0.03, sy: 0.02, sz: 0.03, rz: Math.PI / 2 });
}

// A push mower: deck, engine, wheels, handle (folded = laid back over the deck). Frame: x the way it faces, the handle behind
function mower(f, col, folded) {
  f(GEO.cyl12, col, { y: 0.16, sx: 0.27, sy: 0.12, sz: 0.25 });
  f(GEO.cyl12, '#4a4f57', { y: 0.095, sx: 0.275, sy: 0.02, sz: 0.255 });
  for (const [x, z] of [[0.2, 0.22], [0.2, -0.22], [-0.2, 0.22], [-0.2, -0.22]]) { f(GEO.cyl12, COL.black, { x, y: 0.09, z: z + Math.sign(z) * 0.03, sx: 0.09, sy: 0.045, sz: 0.09, rx: Math.PI / 2 }); f(GEO.cyl8, '#b4b9be', { x, y: 0.09, z: z + Math.sign(z) * 0.055, sx: 0.035, sy: 0.012, sz: 0.035, rx: Math.PI / 2 }); }
  f(GEO.box, '#4a4f57', { x: 0.03, y: 0.3, sx: 0.22, sy: 0.16, sz: 0.2 });
  f(GEO.cyl12, COL.black, { x: 0.03, y: 0.42, sx: 0.1, sy: 0.07, sz: 0.1 });
  f(GEO.cyl8, '#e0b54a', { x: -0.06, y: 0.36, z: 0.11, sx: 0.04, sy: 0.05, sz: 0.04 });
  if (folded) {
    for (const s of [-1, 1]) f.rod([-0.25, 0.2, s * 0.2], [0.25, 0.55, s * 0.22], 0.012, COL.chromeDk);
    f(GEO.cyl6, COL.black, { x: 0.25, y: 0.55, sx: 0.016, sy: 0.46, sz: 0.016, rx: Math.PI / 2 });
  } else {
    for (const s of [-1, 1]) f.rod([-0.25, 0.2, s * 0.2], [-0.82, 0.98, s * 0.22], 0.012, COL.chromeDk);
    f(GEO.cyl6, COL.black, { x: -0.82, y: 0.98, sx: 0.016, sy: 0.46, sz: 0.016, rx: Math.PI / 2 });
    f(GEO.box, '#5a7a3a', { x: -0.5, y: 0.42, sx: 0.36, sy: 0.3, sz: 0.34, rz: -0.6 });   // the grass bag
  }
}

// ---------------------------------------------------------------- the salvaged signs: one atlas canvas, one mesh
const SIGN_CELLS = ['stop', 'gas', 'slow', 'eat', 'oil', 'noparking', 'bait', 'route'];
function signCanvas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d'), cell = i => [(i % 4) * 256, Math.floor(i / 4) * 256];
  const font = (n, w = 800) => `${w} ${n}px "Fredoka", "Trebuchet MS", sans-serif`;
  const txt = (s, x, y, n, col, w) => { g.font = font(n, w); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); };
  const poly = (pts, col) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = col; g.fill(); };
  const rust = (x0, y0, w, h, n, seed) => { const R = rng(seed); g.globalAlpha = 0.28; for (let i = 0; i < n; i++) { g.fillStyle = R() < 0.6 ? '#7a4a2a' : '#5a3a26'; g.beginPath(); g.arc(x0 + R() * w, y0 + R() * h, 2 + R() * 7, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; };
  // stop: an octagon, a white rim
  { const [x, y] = cell(0), oct = r => Array.from({ length: 8 }, (_, k) => { const a = Math.PI / 8 + k * Math.PI / 4; return [x + 128 + Math.cos(a) * r, y + 128 + Math.sin(a) * r]; }); poly(oct(124), '#f4ecd6'); poly(oct(112), '#b8302a'); txt('STOP', x + 128, y + 132, 66, '#f4ecd6'); rust(x + 20, y + 20, 216, 216, 40, 1); }
  // gas: a round porcelain sign
  { const [x, y] = cell(1); g.fillStyle = '#b8302a'; g.beginPath(); g.arc(x + 128, y + 128, 124, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f4ecd6'; g.beginPath(); g.arc(x + 128, y + 128, 100, 0, Math.PI * 2); g.fill(); txt('GAS', x + 128, y + 120, 78, '#2f3b6c'); txt('REGULAR', x + 128, y + 176, 26, '#b8302a'); rust(x + 30, y + 30, 196, 196, 30, 2); }
  // slow: a yellow diamond
  { const [x, y] = cell(2); poly([[x + 128, y + 4], [x + 252, y + 128], [x + 128, y + 252], [x + 4, y + 128]], '#2b2b30'); poly([[x + 128, y + 16], [x + 240, y + 128], [x + 128, y + 240], [x + 16, y + 128]], '#e8c23a'); txt('SLOW', x + 128, y + 132, 60, '#2b2b30'); rust(x + 40, y + 40, 176, 176, 26, 3); }
  // eat: a diner's arrow
  { const [x, y] = cell(3); poly([[x + 10, y + 70], [x + 190, y + 70], [x + 246, y + 128], [x + 190, y + 186], [x + 10, y + 186]], '#e05a3a'); poly([[x + 22, y + 82], [x + 186, y + 82], [x + 232, y + 128], [x + 186, y + 174], [x + 22, y + 174]], '#f6e9a8'); txt('EAT', x + 112, y + 132, 80, '#c0392b'); rust(x + 20, y + 70, 220, 116, 20, 4); }
  // motor oil: a tin sign, two to one
  { const [x, y] = cell(4); g.fillStyle = '#2f5442'; g.fillRect(x + 4, y + 64, 248, 128); g.strokeStyle = '#e8c27a'; g.lineWidth = 6; g.strokeRect(x + 14, y + 74, 228, 108); txt('MOTOR OIL', x + 128, y + 116, 40, '#e8c27a'); txt('SINCE 1952', x + 128, y + 158, 22, '#f4ecd6', 600); rust(x + 4, y + 64, 248, 128, 36, 5); }
  // no parking
  { const [x, y] = cell(5); g.fillStyle = '#f4ecd6'; g.fillRect(x + 54, y + 8, 148, 240); g.strokeStyle = '#b8302a'; g.lineWidth = 7; g.strokeRect(x + 64, y + 18, 128, 220); txt('NO', x + 128, y + 70, 54, '#b8302a'); txt('PARKING', x + 128, y + 128, 30, '#b8302a'); txt('ANY TIME', x + 128, y + 184, 24, '#2b2b30', 600); rust(x + 54, y + 8, 148, 240, 24, 6); }
  // bait: a hand-painted board
  { const [x, y] = cell(6); g.fillStyle = '#c9a26b'; g.fillRect(x + 4, y + 80, 248, 96); g.fillStyle = '#a8804f'; for (let k = 0; k < 4; k++) g.fillRect(x + 4, y + 102 + k * 22, 248, 3); txt('LIVE BAIT', x + 128, y + 128, 50, '#2f5442'); }
  // route: a shield
  { const [x, y] = cell(7); poly([[x + 40, y + 24], [x + 216, y + 24], [x + 226, y + 120], [x + 128, y + 236], [x + 30, y + 120]], '#f4ecd6'); poly([[x + 50, y + 34], [x + 206, y + 34], [x + 214, y + 118], [x + 128, y + 222], [x + 42, y + 118]], '#2b2b30'); txt('ROUTE', x + 128, y + 70, 30, '#f4ecd6'); txt('9', x + 128, y + 138, 100, '#f4ecd6'); }
  return c;
}

// ---------------------------------------------------------------- outside: the roll-up door, its light, its ramp; the FREE box
// cb (crib-move): a Batcher of its own for the door's curtain, so tool-crib.js can roll it up into the drum for the Sunday ride
// sb (crib-setpiece): the batcher for the door's casing, the drum's hood, the apron, the ramp and the side light's bracket; the
// Blender set piece has them, so tool-crib-build.js passes its counting batcher then (the FREE box and the curtain stay the code's)
export function clutterOutside(b, out, colliders, addSpot, cb = b, sb = b) {
  const P = CRIB, R = P.rollup, { fy, gy, maxX, iMaxX, minZ } = P, items = [], f = world(sb), fc = world(cb);
  const zm = (R.z0 + R.z1) / 2, W = R.z1 - R.z0;
  // the door's casing outside: two jambs, the header and its drip cap
  f.box(maxX - 0.012, gy - 0.02, R.z0 - 0.13, maxX + 0.06, R.y1 + 0.003, R.z0 + 0.003, '#f2ebd8');
  f.box(maxX - 0.012, gy - 0.02, R.z1 - 0.003, maxX + 0.06, R.y1 + 0.003, R.z1 + 0.13, '#f2ebd8');
  f.box(maxX - 0.012, R.y1 - 0.003, R.z0 - 0.15, maxX + 0.075, R.y1 + 0.17, R.z1 + 0.15, '#f2ebd8');
  f.box(maxX - 0.012, R.y1 + 0.17, R.z0 - 0.18, maxX + 0.11, R.y1 + 0.21, R.z1 + 0.18, '#d8ccae');
  // the curtain inside the opening (in the room, behind the wall: from outside it sits in a deep reveal): slats with ribs between,
  // a heavy bottom bar with a handle and a lock; it runs in two tracks up into the drum's hood over the opening
  const cx0 = iMaxX - 0.03 - 0.07, cx1 = cx0 + 0.04, top = R.y1 + 0.12;
  fc.box(cx0 - 0.008, fy, R.z0 - 0.03, cx1 + 0.008, fy + 0.07, R.z1 + 0.03, '#5d636b');
  for (let y = fy + 0.07, i = 0; y < top - 0.01; i++) {
    const y1 = Math.min(top, y + 0.085);
    fc.box(cx0 + 0.005, y, R.z0 - 0.03, cx1 - 0.005, y1, R.z1 + 0.03, i % 2 ? '#a3a9ad' : '#9aa0a5');
    if (y1 < top - 0.01) fc.box(cx0, y1, R.z0 - 0.03, cx1, Math.min(top, y1 + 0.016), R.z1 + 0.03, '#7d8489');
    y = y1 + 0.016;
  }
  for (const s of [-1, 1]) { // the handles on the bottom bar, in and out
    fc.box(s < 0 ? cx0 - 0.06 : cx1 + 0.003, fy + 0.1, zm - 0.12, s < 0 ? cx0 - 0.003 : cx1 + 0.06, fy + 0.13, zm + 0.12, '#3a3f47');
    for (const dz of [-0.11, 0.09]) fc.box(s < 0 ? cx0 - 0.06 : cx1 + 0.003, fy + 0.06, zm + dz, s < 0 ? cx0 - 0.003 : cx1 + 0.06, fy + 0.1, zm + dz + 0.02, '#3a3f47');
  }
  fc(GEO.cyl8, '#c9a23a', { x: cx1 + 0.01, y: fy + 0.2, z: zm + 0.5, sx: 0.025, sy: 0.02, sz: 0.025, rz: Math.PI / 2 });   // the lock
  items.curtainTop = top;
  for (const z of [R.z0, R.z1]) f.box(cx0 - 0.06, fy, z - 0.07, iMaxX - 0.028, R.y1 + 0.2, z + 0.07, '#7d8489');      // the tracks
  f(GEO.cyl12, '#8a9096', { x: iMaxX - 0.03 - 0.22, y: R.y1 + 0.22, z: zm, sx: 0.22, sy: W + 0.3, sz: 0.22, rx: Math.PI / 2 });   // the drum's hood
  for (const z of [R.z0 - 0.17, R.z1 + 0.13]) f.box(iMaxX - 0.03 - 0.46, R.y1 - 0.01, z, iMaxX - 0.028, R.y1 + 0.46, z + 0.04, '#6b7078');
  // the chain hoist down the north end, a loop at the bottom
  for (const dx of [-0.03, 0.03]) f(GEO.cyl6, '#3a3f47', { x: iMaxX - 0.03 - 0.22 + dx, y: (R.y1 + 0.2 + fy + 0.75) / 2, z: R.z0 - 0.24, sx: 0.006, sy: R.y1 + 0.2 - fy - 0.75, sz: 0.006 });
  f(new THREE.TorusGeometry(0.03, 0.006, 3, 8), '#3a3f47', { x: iMaxX - 0.03 - 0.22, y: fy + 0.75, z: R.z0 - 0.24 });
  items.push({ name: 'rollup-door', box: [iMaxX - 0.5, fy, R.z0 - 0.18, maxX + 0.11, R.y1 + 0.46, R.z1 + 0.18], wall: 'east' });
  // the concrete apron and the ramp up to the floor (the motorcycle rolls out over it)
  f.box(maxX, gy - 0.03, R.z0 - 0.1, maxX + 1.7, gy + 0.025, R.z1 + 0.1, '#bdb6a8');
  {
    const L = 1.25, rise = fy - gy - 0.025, sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0), new THREE.Vector2(0, rise)]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: W + 0.1, bevelEnabled: false });
    f(geo, '#c9c2b4', { x: maxX - 0.004, y: gy + 0.024, z: R.z0 - 0.05 });
    geo.dispose();
    colliders.push({ type: 'box', minX: maxX, maxX: maxX + L, minZ: R.z0 - 0.05, maxZ: R.z1 + 0.05, maxY: gy + 0.3 });
  }
  // the side light over it: a gooseneck barn lamp like the porch's, its light on the apron
  {
    const ly = R.y1 + 0.62, lz = zm;
    f.box(maxX - 0.01, ly - 0.06, lz - 0.06, maxX + 0.035, ly + 0.2, lz + 0.06, '#3a3f47');
    f(GEO.cyl6, '#3a3f47', { x: maxX + 0.17, y: ly + 0.1, z: lz, sx: 0.025, sy: 0.28, sz: 0.025, rz: Math.PI / 2 });
    f(GEO.cone8, '#3f6b52', { x: maxX + 0.33, y: ly + 0.05, z: lz, sx: 0.24, sy: 0.14, sz: 0.24 });
    out.add(GEO.sphere, '#fff3c4', { x: maxX + 0.33, y: ly - 0.03, z: lz, sx: 0.09, sy: 0.06, sz: 0.09 });
    addSpot({ x: maxX + 0.75, y: ly - 0.2, z: lz, color: '#ffe0a0', pool: 2.8, gy, halo: 0 });
    items.push({ name: 'side-light', box: [maxX, ly - 0.1, lz - 0.12, maxX + 0.45, ly + 0.2, lz + 0.12] });
  }
  // the FREE box on the porch, east of the steps: a cardboard box of odds and ends, a sign lettered in marker
  {
    const bx = P.win[1].a1 - 0.9, bz = minZ - 0.62, w = 0.52, d = 0.4, h = 0.34, t = 0.008, g = framer(b, bx, fy, bz, 0.12);
    g.box(-w / 2, 0, -d / 2, w / 2, t, d / 2, COL.cardDk);
    g.box(-w / 2, t, -d / 2, w / 2, h, -d / 2 + t, COL.card); g.box(-w / 2, t, d / 2 - t, w / 2, h, d / 2, COL.card);
    g.box(-w / 2, t, -d / 2 + t, -w / 2 + t, h, d / 2 - t, COL.card); g.box(w / 2 - t, t, -d / 2 + t, w / 2, h, d / 2 - t, COL.card);
    // what is in it: a lamp shade, a toaster, some books, a teddy, a roller skate
    g(GEO.cone8, '#e8d8b0', { x: -0.13, y: h - 0.01, z: 0.04, sx: 0.11, sy: 0.15, sz: 0.11, rz: 0.4 });
    g.box(0.03, h - 0.14, -0.1, 0.21, h + 0.02, 0.04, '#c8ccd2');
    for (let k = 0; k < 3; k++) g(GEO.box, ['#7a2a2a', '#2f5442', '#c9a23a'][k], { x: 0.1, y: h - 0.1 + k * 0.035, z: 0.1, sx: 0.2, sy: 0.03, sz: 0.12, ry: (k - 1) * 0.2 });
    g(GEO.sphere, '#b8834a', { x: -0.1, y: h - 0.06, z: -0.1, sx: 0.08, sy: 0.08, sz: 0.07 });
    g(GEO.sphere, '#b8834a', { x: -0.1, y: h + 0.03, z: -0.11, sx: 0.06, sy: 0.055, sz: 0.055 });
    for (const s of [-1, 1]) g(GEO.sphere, '#8a5a32', { x: -0.1 + s * 0.045, y: h + 0.075, z: -0.11, sx: 0.022, sy: 0.022, sz: 0.018 });
    g.box(0.12, h - 0.02, -0.17, 0.24, h + 0.06, -0.11, '#e05a6a'); for (const dx of [0.14, 0.22]) g(GEO.cyl8, '#f6efdc', { x: dx, y: h - 0.025, z: -0.14, sx: 0.025, sy: 0.02, sz: 0.025, rx: Math.PI / 2 });
    // the sign: a flap of cardboard stood up in the back, FREE in big marker strokes facing the street (north: local -z, so the
    // letters run toward -x to read left to right from there)
    const sy0 = h - 0.12, sw = 0.46, sh2 = 0.42, sz0 = d / 2 - 0.02;
    g.box(-sw / 2, sy0, sz0 - 0.004, sw / 2, sy0 + sh2, sz0 + 0.004, '#efe1c0');
    const st = (x0, y0, x1, y1) => g.box(-x1, sy0 + 0.18 + y0, sz0 - 0.009, -x0, sy0 + 0.18 + y1, sz0 - 0.004, '#c0392b');
    const L0 = -0.19, lw = 0.085, sw2 = 0.018;   // four letters: F R E E
    st(L0, 0.04, L0 + sw2, 0.2); st(L0, 0.182, L0 + lw, 0.2); st(L0, 0.11, L0 + lw * 0.8, 0.128);
    const r0 = L0 + 0.1; st(r0, 0.04, r0 + sw2, 0.2); st(r0, 0.182, r0 + lw * 0.85, 0.2); st(r0 + lw * 0.85 - sw2, 0.12, r0 + lw * 0.85, 0.2); st(r0, 0.12, r0 + lw * 0.85, 0.138);
    g(GEO.box, '#c0392b', { x: -(r0 + lw * 0.55), y: sy0 + 0.18 + 0.08, z: sz0 - 0.0065, sx: sw2, sy: 0.09, sz: 0.005, rz: -0.5 });
    for (const e0 of [L0 + 0.2, L0 + 0.3]) { st(e0, 0.04, e0 + sw2, 0.2); st(e0, 0.182, e0 + lw * 0.85, 0.2); st(e0, 0.11, e0 + lw * 0.7, 0.128); st(e0, 0.04, e0 + lw * 0.85, 0.058); }
    colliders.push({ type: 'box', minX: bx - 0.3, maxX: bx + 0.3, minZ: bz - 0.26, maxZ: bz + 0.26 });
    items.push({ name: 'free-box', box: [bx - 0.3, fy, bz - 0.26, bx + 0.3, fy + h + 0.32, bz + 0.26], porch: true });
  }
  return items;
}

// ---------------------------------------------------------------- the tarp over the paint can pyramid (crib-more)
// A blue poly tarp half pulled off: one sheet (cloth coordinates a along its free edge, b across it), draped over the top cans'
// shapes (a little dome on each lid, sagging into the gaps between them, falling steeply off each tier's edge), hanging down the
// back in vertical folds, lying on the floor round the foot in wrinkles bunched where it lands, and its north-east corner dragged
// out onto the floor on the side you see coming in. The free edge across the top is rolled; a hem runs round the rest with
// grommets in it. One mesh in the inside batch (plus the roll, the hem, the grommets), so no draw call.
function tarpSheet(ib, f, PY, tops, r, fy) {
  const K = Math.SQRT1_2, at = (a, b) => [PY.x + (a + b) * K, PY.z + (b - a) * K];   // a along (1, -1) / sqrt 2, b along (1, 1) / sqrt 2
  const floorY = fy + 0.006, foot = 0.46;
  const drop = d => (d < 0.04 ? 20 * d * d : 0.032 + 1.6 * (d - 0.04) + 30 * (d - 0.04) * (d - 0.04));   // (steep enough to show each tier)
  // the cloth's height over the cans alone, and how much it hangs there (0 on a lid, 1 falling off a tier)
  const support = (x, z) => {
    let y = -1, hang = 0;
    for (const [cx, cz, ct] of tops) {
      const d = Math.hypot(x - cx, z - cz) - r, v = d < 0 ? ct + 0.014 + 0.006 * (-d / r) : ct + 0.014 - drop(d);
      if (v > y) { y = v; hang = d > 0.04 ? Math.min(1, (d - 0.04) / 0.05) : 0; }
    }
    return [y, hang];
  };
  const ss = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const A0 = -1.05, A1 = 1.3, NU = 60, NV = 40, aEdge = 0.45;
  const e0 = a => -0.04 + 0.05 * Math.sin(a * 3.1 + 0.4);
  const bLo = a => e0(a) - 0.62 * ss((a - aEdge) / (A1 - aEdge));                    // the free edge, then the dragged corner
  const bHi = a => 0.95 + 0.04 * Math.sin(a * 5 + 1) - (a > 1.0 ? (a - 1.0) * 1.6 : 0);
  const height = (a, b, x, z) => {
    const [s, hang] = support(x, z), base = Math.max(s, floorY), th = Math.atan2(z - PY.z, x - PY.x);
    const out = Math.max(Math.abs(x - PY.x), Math.abs(z - PY.z)) - foot;
    let y = base + 0.003 * Math.sin(x * 31 + z * 13);
    if (s <= floorY) {   // lying on the floor: bunched at the foot, wrinkled, the dragged corner's folds along the pull
      y = floorY + 0.034 * Math.exp(-Math.max(0, out) / 0.22) * Math.max(0, Math.sin(th * 9 + out * 7 + 0.8))
        + 0.012 * Math.max(0, Math.sin(a * 11 + b * 3)) * (0.5 + 0.5 * Math.sin(b * 17 - a * 4))
        + (a > aEdge ? 0.03 * ss((a - aEdge) / 0.3) * Math.max(0, Math.sin(b * 15 + a * 1.5 + 0.6)) * ss((0.2 - b) / 0.3) : 0);
      return [Math.max(floorY, y), 0, th];
    }
    return [Math.max(floorY, y), hang * ss((s - floorY) / 0.1), th];
  };
  const pos = [], idx = [], grid = [], lo = [1e9, 1e9], hi = [-1e9, -1e9];
  let floorCorner = 0, maxY = 0, onCans = 0;
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const a = A0 + (A1 - A0) * i / NU, b = bLo(a) + (bHi(a) - bLo(a)) * j / NV, [x0, z0] = at(a, b), [y, hang, th] = height(a, b, x0, z0);
    // the folds down the sides: hanging cloth pushed in and out round the pyramid (not up and down: it is near vertical there)
    const fold = hang * 0.045 * Math.sin(th * 14 + 2.2 * Math.sin(th * 3 + 0.5)), x = x0 + Math.cos(th) * fold, z = z0 + Math.sin(th) * fold;
    pos.push(x, y, z); grid.push([x, y, z]);
    if (a > 1.0 && j < NV / 3 && y < floorY + 0.04) floorCorner++;
    if (y > floorY + 0.15) onCans++;
    maxY = Math.max(maxY, y);
    lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], z); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], z);
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const q = j * (NU + 1) + i, w = q + NU + 1; idx.push(q, w, q + 1, q + 1, w, w + 1); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals();
  const nor = tg.attributes.normal;
  ib.add(tg, COL.tarp); tg.dispose();
  const G = (i, j) => grid[j * (NU + 1) + i], N = (i, j) => { const k = j * (NU + 1) + i; return new THREE.Vector3(nor.getX(k), nor.getY(k), nor.getZ(k)); };
  // the rolled free edge across the top, then the hem round the rest (the dragged corner's edge, the far side, the ends)
  const iE = Math.round((aEdge - A0) / (A1 - A0) * NU);
  const rollPts = [], hemPts = [], hemIJ = [];
  for (let i = 0; i <= iE; i++) { const [x, y, z] = G(i, 0); rollPts.push(new THREE.Vector3(x, y + 0.022, z)); }
  const hemAt = (i, j) => { const [x, y, z] = G(i, j), n = N(i, j); hemPts.push(new THREE.Vector3(x + n.x * 0.008, y + n.y * 0.008, z + n.z * 0.008)); hemIJ.push([i, j]); };
  for (let i = iE; i <= NU; i++) hemAt(i, 0);
  for (let j = 1; j <= NV; j++) hemAt(NU, j);
  for (let i = NU - 1; i >= 0; i--) hemAt(i, NV);
  for (let j = NV - 1; j >= 0; j--) hemAt(0, j);
  const roll = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rollPts), rollPts.length * 2, 0.03, 5, false);
  ib.add(roll, COL.tarpDk); roll.dispose();
  const hem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemPts), hemPts.length, 0.011, 4, false);
  ib.add(hem, COL.tarpDk); hem.dispose();
  // the grommets: a ring every 0.33 m along the hem, lying in the cloth (turned to its normal)
  const ring = new THREE.TorusGeometry(0.015, 0.005, 3, 8), m = new THREE.Matrix4(), q = new THREE.Quaternion(), zAx = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
  let run = 0.2, grommets = 0;
  for (let k = 1; k < hemPts.length; k++) {
    run += hemPts[k].distanceTo(hemPts[k - 1]);
    if (run < 0.33) continue;
    run = 0;
    const [i, j] = hemIJ[k], n = N(i, j), p = hemPts[k].clone().addScaledVector(n, 0.004);
    q.setFromUnitVectors(zAx, n); m.compose(p, q, one);
    ib.add(ring, '#d8dde2', { matrix: m }); grommets++;
  }
  ring.dispose();
  void f;
  // which cans it covers (cloth over the middle of the can's lid): the tarp is half off, so about half the cans show
  const covered = tops.filter(([cx, cz, ct]) => grid.some(([x, y, z]) => Math.hypot(x - cx, z - cz) < r * 0.6 && y > ct)).length;
  const minY = grid.reduce((m, p) => Math.min(m, p[1]), 1e9);
  return { lo, hi, info: { verts: grid.length, maxY, minY, floorCorner, onCans, grommets, covered, cans: tops.length, roll: rollPts.length, hem: hemPts.length } };
}

// ---------------------------------------------------------------- inside
// model (crib-setpiece): crib-model.js's cribItem when the Blender set piece loaded. The piles it has (the wire shelving and its
// totes, the paint can pyramid and its tarp, the tyre stack) are listed from its anchors instead of built here; everything else
// (the things that move, the bike, the small pieces) is built as before, round them.
// nb (crib-clutter-2): the batcher for the pieces the model remodelled (the hanging bikes, the ladders, the mowers, the tool chest):
// tool-crib-build.js's counting batcher when the model loaded, `ib` itself otherwise (the fallback is the whole code-built shop).
// The model's own new piles (beer cases, recycling, the sawhorses, the hand truck, the high shelves...) are listed from its anchors
// (`cribItems`) and made solid (`cribColliders`).
export function clutterInside(ib, inside, colliders, model = null, nb = ib) {
  const P = CRIB, { fy, top, iMinX, iMaxX, iMinZ, zP, stair: ST, peg: Pg, sx } = P, sk = 0.03, items = [], f = world(ib), movers = inside.userData.movers = {};
  const fm = world(nb);   // (the model has these: counted, not drawn, when it loaded)
  if (model) { items.push(...cribItems()); colliders.push(...cribColliders()); }
  const wallW = iMinX + sk, wallE = iMaxX - sk;
  const beams = []; for (let z = iMinZ + 1.4; z < P.iMaxZ - 0.5; z += 2.2) if (Math.abs(z - P.zL) > 0.4) beams.push(z);
  const beamY = top - 0.26;
  const nearBeam = z => beams.reduce((a, q) => (Math.abs(q - z) < Math.abs(a - z) ? q : a), beams[0]);

  // ---- the wire shelving up the stair's open side: three chrome units, every shelf full of totes
  {
    const x0 = ST.maxX + 0.15, x1 = x0 + 0.46, zA = ST.z0 + 0.7, zB = zP - 0.42, n = 3, L = (zB - zA) / n, levels = [0.12, 0.58, 1.04, 1.5, 1.98], H = 2.01;
    let totes = 0;
    if (model) { for (let u = 0; u < n; u++) items.push(model('wire-shelf' + u)); totes = cribAnchorProp(model, 'wire-shelf0', 'totes'); }
    else for (let u = 0; u < n; u++) {
      const z0 = zA + u * L + 0.01, z1 = zA + (u + 1) * L - 0.01;
      wireUnit(ib, x0, x1, z0, z1, fy, levels, H);
      for (let lv = 0; lv < 4; lv++) for (let k = 0; k < 2; k++) {
        const i = u * 8 + lv * 2 + k, za = z0 + 0.035 + k * (L - 0.06) / 2, zb = za + (L - 0.06) / 2 - 0.02;
        const kind = i % 5 === 1 ? 'lid' : i % 7 === 3 ? 'askew' : 'open';
        tote(ib, (x0 + x1) / 2 - 0.01, fy + levels[lv], (za + zb) / 2, x1 - x0 - 0.08, zb - za, lv === 0 ? 0.3 : 0.27, TOTES[(i * 5 + u) % TOTES.length], kind, 100 + i);
        totes++;
      }
      items.push({ name: 'wire-shelf', box: [x0, fy, z0, x1 + 0.03, fy + H + 0.35, z1], floor: true });
    }
    inside.userData.totes = totes;
    // on top: the radio, coffee cans, a box of springs
    const ty = fy + levels[4];
    { const rx = (x0 + x1) / 2, rz = zA + L * 1.5, ry = -Math.PI / 2 + 0.15, g = framer(ib, rx, ty, rz, ry);   // (crib-sound: turned to face the shop)
      g.box(-0.17, 0, -0.07, 0.17, 0.2, 0.07, '#7a2a2a'); g.box(-0.15, 0.03, -0.074, 0.02, 0.17, -0.07, '#c8b48a');
      for (let k = 0; k < 5; k++) g.box(-0.14, 0.05 + k * 0.025, -0.077, 0.01, 0.06 + k * 0.025, -0.074, '#8a6a4a');
      for (const dx of [0.07, 0.13]) g(GEO.cyl12, '#e8e2d6', { x: dx, y: 0.1, z: -0.075, sx: 0.025, sy: 0.02, sz: 0.025, rx: Math.PI / 2 });
      g(GEO.cyl6, COL.chrome, { x: 0.12, y: 0.42, z: 0.03, sx: 0.005, sy: 0.45, sz: 0.005, rz: -0.35 });
      g.box(-0.12, 0.2, -0.03, 0.12, 0.215, 0.03, '#3a2618');
      items.push({ name: 'radio', box: [rx - 0.17, ty, rz - 0.17, rx + 0.17, ty + 0.62, rz + 0.17] });
      movers.radio = { x: rx, y: ty, z: rz, yaw: ry }; }   // (its dial's needle moves: clutterMovers)
    for (let k = 0; k < 3; k++) coffeeCan(ib, (x0 + x1) / 2 + (k % 2 ? 0.08 : -0.08), ty, zA + 0.2 + k * 0.16, 11 + k);
    items.push({ name: 'coffee-can', box: [x0, ty, zA + 0.1, x1, ty + 0.2, zA + 0.6] });
    springBox(ib, items, (x0 + x1) / 2, ty, zA + L * 2.5, 0.4, 0.36, 0.24, Math.PI / 2, 21);
    springBox(ib, items, (x0 + x1) / 2, ty, zA + L * 0.5 + 0.28, 0.32, 0.3, 0.2, Math.PI / 2 + 0.1, 22);
    colliders.push({ type: 'box', minX: x0 - 0.02, maxX: x1 + 0.03, minZ: zA, maxZ: zB });
  }

  // ---- the paint can pyramid: thirty used gallons, drips down their sides, lids that don't match (a few open), and a blue tarp
  // pulled half off the back of it
  const PY = { x: sx - 1.25, z: zP - 3.45 };
  if (model) {   // (crib-setpiece) the model's pyramid and its draped tarp: one pile; its numbers from the anchors for the test
    const py = model('paint-pyramid'), tp = model('tarp'); items.push(py, tp);
    inside.userData.pyramidCans = cribAnchorProp(model, 'paint-pyramid', 'cans');
    inside.userData.tarp = { model: true, cans: cribAnchorProp(model, 'tarp', 'cans'), covered: cribAnchorProp(model, 'tarp', 'covered'), maxY: cribAnchorProp(model, 'tarp', 'maxY'), minY: cribAnchorProp(model, 'tarp', 'minY'), points: cribAnchorProp(model, 'tarp', 'points'), grommets: cribAnchorProp(model, 'tarp', 'grommets') };
    // (crib-tarp) the tarp is a cloth simulation now: its hem on the floor, how high its pool stands, its triangles before and after
    for (const k of ['cloth', 'hem', 'hemFloor', 'pool', 'tris', 'simTris']) inside.userData.tarp[k] = cribAnchorProp(model, 'tarp', k);
    inside.userData.pyramidDrips = cribAnchorProp(model, 'paint-pyramid', 'drips');
    colliders.push({ type: 'box', minX: py.box[0], maxX: py.box[3], minZ: py.box[2], maxZ: py.box[5] });
  } else {
    const s = 0.186, r = 0.085, h = 0.19, R = rng(5);
    let cans = 0;
    const tops = [];   // [x, z, top] of each can (the tarp drapes over them)
    for (let k = 0; k < 4; k++) {
      const n = 4 - k;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = PY.x + (i - (n - 1) / 2) * s, z = PY.z + (j - (n - 1) / 2) * s, y = fy + k * (h + 0.013), body = PAINTS[Math.floor(R() * PAINTS.length)];
        f(GEO.cyl12, COL.tin, { x, y: y + h / 2, z, sx: r, sy: h, sz: r });
        f(GEO.cyl12, body, { x, y: y + h * 0.45, z, sx: r + 0.003, sy: h * 0.52, sz: r + 0.003, ry: R() });
        if (R() < 0.22) { // an open one: the dried skin of paint, the rim
          f(GEO.cyl12, body, { x, y: y + h + 0.002, z, sx: r * 0.86, sy: 0.004, sz: r * 0.86 });
          f(new THREE.TorusGeometry(r - 0.006, 0.006, 3, 12), '#b4b9be', { x, y: y + h + 0.004, z, rx: Math.PI / 2 });
        } else f(GEO.cyl12, PAINTS[Math.floor(R() * PAINTS.length)], { x, y: y + h + 0.006, z, sx: r * 0.97, sy: 0.012, sz: r * 0.97 });
        for (let q = 0, nd = 1 + Math.floor(R() * 3); q < nd; q++) { // drips down the side
          const a = R() * 6.28, dl = 0.04 + R() * 0.1;
          f(GEO.box, body, { x: x + Math.sin(a) * (r + 0.006), y: y + h - dl / 2, z: z + Math.cos(a) * (r + 0.006), sx: 0.016 + R() * 0.01, sy: dl, sz: 0.006, ry: a });
        }
        cans++; tops.push([x, z, y + h + 0.012]);
      }
    }
    for (let q = 0; q < 4; q++) { const a = q * 1.7 + 0.3; f(GEO.cyl12, PAINTS[(q * 5) % PAINTS.length], { x: PY.x + Math.cos(a) * 0.5, y: fy + 0.0025 + q * 0.0004, z: PY.z - 0.2 + Math.sin(a) * 0.3, sx: 0.05 + q * 0.01, sy: 0.003, sz: 0.04 + q * 0.008, ry: a }); } // spots on the floor
    inside.userData.pyramidCans = cans;
    const topK = k => fy + (k + 1) * (h + 0.013) + 0.04;
    const tarp = tarpSheet(ib, f, PY, tops, r, fy);
    inside.userData.tarp = tarp.info;
    items.push({ name: 'paint-pyramid', box: [PY.x - 0.55, fy, PY.z - 0.55, PY.x + 0.6, fy + 4 * (h + 0.013) + 0.02, PY.z + 0.6], floor: true });   // (with the tarp's drape; flat on the floor past it you can walk on it)
    items.push({ name: 'tarp', box: [tarp.lo[0], fy, tarp.lo[1], tarp.hi[0], topK(3) + 0.07, tarp.hi[1]] });
    colliders.push({ type: 'box', minX: PY.x - 0.55, maxX: PY.x + 0.6, minZ: PY.z - 0.55, maxZ: PY.z + 0.6 });
  }

  // ---- two lawn mowers waiting to be fixed (one with its handle up, one folded, a wheel off it)
  {
    const m1 = { x: PY.x + 0.95, z: PY.z + 1.6 }, m2 = { x: PY.x - 0.95, z: PY.z + 1.55 };
    mower(framer(nb, m1.x, fy, m1.z, 0), '#c0392b', false);   // (crib-clutter-2: the model's when it loaded)
    mower(framer(nb, m2.x, fy, m2.z, Math.PI / 2), '#4f8a4a', true);
    fm(GEO.cyl12, COL.black, { x: m2.x + 0.38, y: fy + 0.0235, z: m2.z + 0.05, sx: 0.09, sy: 0.045, sz: 0.09 });   // the wheel off it
    items.push({ name: 'lawn-mower', box: [m1.x - 0.86, fy, m1.z - 0.3, m1.x + 0.3, fy + 1.0, m1.z + 0.3], floor: true });
    items.push({ name: 'lawn-mower', box: [m2.x - 0.32, fy, m2.z - 0.32, m2.x + 0.48, fy + 0.6, m2.z + 0.32], floor: true });
    colliders.push({ type: 'box', minX: m1.x - 0.86, maxX: m1.x + 0.3, minZ: m1.z - 0.3, maxZ: m1.z + 0.3 }, { type: 'box', minX: m2.x - 0.32, maxX: m2.x + 0.48, minZ: m2.z - 0.32, maxZ: m2.z + 0.32 });
  }

  // ---- Kevin's motorcycle in the corner inside the roll-up door, kickstand down, leaning a little on it; a drip pan under it
  // (crib-move: the bike and its helmet are their own meshes (`inside.userData.bike`: built at the origin, x forward), so tool-crib.js
  // can wheel it out and ride it on Sundays; the drip pan stays baked; its collider is kept to switch off while it is out)
  {
    const M = P.moto, mx = M.x, mz = M.z, lean = M.lean;
    const bike = new THREE.Group(); bike.name = 'crib-motorcycle';
    let bikeMesh, helmet, bikeWheels = null;
    if (vehicleShape('moto')) {
      // (props-vehicles) the Blender cruiser: built nose +z like the cars, turned here to this frame's x forward; the helmet its own
      // mesh (hidden while Kevin wears it), the two wheels their own so they can roll on the Sunday ride (tool-crib.js)
      const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; bike.add(inner);
      bikeMesh = partsMesh('moto', (n, p) => n !== 'helmet' && p.kind !== 'wheel'); bikeMesh.name = 'crib-motorcycle'; bikeMesh.castShadow = false; inner.add(bikeMesh);
      helmet = partsMesh('moto', n => n === 'helmet'); helmet.name = 'crib-motorcycle-helmet'; helmet.castShadow = false; inner.add(helmet);
      bikeWheels = wheelGroups('moto', inner).map(w => { w.roll.castShadow = false; return w.roll; });
    } else {
      const bb = new Batcher({ vertexColors: true, castShadow: false }), hb = new Batcher({ vertexColors: true, castShadow: false });
      motorcycle(framer(bb, 0, 0, 0, 0, 0, 0), framer(hb, 0, 0, 0, 0, 0, 0));
      bikeMesh = bb.build(bike, 'crib-motorcycle')[0]; helmet = hb.build(bike, 'crib-motorcycle-helmet')[0];
    }
    bike.position.set(mx, fy, mz); bike.rotation.set(lean, 0, 0, 'YXZ');   // (its own frame: x forward, so a heading h in the plan's yaw convention is rotation.y = h - PI / 2; at home x is +x here)
    inside.add(bike);
    inside.userData.bike = { group: bike, mesh: bikeMesh, helmet, wheels: bikeWheels, x: mx, z: mz, y: fy, lean, heading: M.heading };
    f.box(mx - 0.25, fy, mz - 0.18, mx + 0.25, fy + 0.025, mz + 0.18, '#3a3f47');
    f.box(mx - 0.22, fy + 0.025, mz - 0.15, mx + 0.22, fy + 0.03, mz + 0.15, '#2b2b30');
    items.push({ name: 'motorcycle', box: [mx - 1.07, fy, mz - 0.76, mx + 1.09, fy + 1.45, mz + 0.26], floor: true });
    items.push({ name: 'helmet', box: [mx + 0.2, fy + 0.95, mz - 0.76, mx + 0.6, fy + 1.4, mz - 0.4] });
    const bikeCol = { type: 'box', minX: mx - 1.08, maxX: mx + 1.1, minZ: mz - 0.62, maxZ: mz + 0.26 };
    colliders.push(bikeCol); inside.userData.bike.collider = bikeCol;
    // a stack of old tyres behind it, a spare for the bike on top
    const tx = mx - 1.72, tz = mz - 0.42;
    if (model) items.push(model('tire-stack'));   // (crib-setpiece: the model's stack)
    else {
      for (let k = 0; k < 3; k++) f(new THREE.TorusGeometry(0.24, 0.085, 6, 16), '#2b2b30', { x: tx + (k % 2) * 0.03, y: fy + 0.085 + k * 0.165, z: tz - (k === 1 ? 0.02 : 0), rx: Math.PI / 2 });
      f(new THREE.TorusGeometry(0.26, 0.07, 6, 18), '#3a3a40', { x: tx + 0.02, y: fy + 0.495 + 0.07 + 0.05, z: tz, rx: Math.PI / 2 - 0.28, ry: 0.5 });
      items.push({ name: 'tire-stack', box: [tx - 0.34, fy, tz - 0.36, tx + 0.36, fy + 0.8, tz + 0.34], floor: true });
    }
    colliders.push({ type: 'circle', x: tx, z: tz, r: 0.34 });
  }

  // ---- the rolling tool chest (a drawer pulled out, sockets in it) with the box fan on top, north of the bargain table
  {
    const cx = sx + 2.2, cz = zP - 3.9, w = 0.72, d = 0.46, g = framer(ib, cx, fy, cz, 0), gc = framer(nb, cx, fy, cz, 0);   // (gc: the chest, the model's when it loaded; the fan stays the code's: its blades turn)
    for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) { gc(GEO.cyl8, COL.black, { x, y: 0.045, z, sx: 0.045, sy: 0.03, sz: 0.045, rx: Math.PI / 2 }); gc.box(x - 0.025, 0.07, z - 0.025, x + 0.025, 0.1, z + 0.025, COL.iron); }
    gc.box(-w / 2, 0.1, -d / 2, w / 2, 1.0, d / 2, '#b8302a');
    gc.box(-w / 2 - 0.01, 1.0, -d / 2 - 0.01, w / 2 + 0.01, 1.03, d / 2 + 0.01, '#2b2b30');
    const dr = [0.14, 0.1, 0.1, 0.12, 0.16, 0.18];
    let y = 0.14;
    dr.forEach((hh, i) => {
      const out2 = i === 2 ? 0.26 : 0;
      gc.box(-w / 2 + 0.03, y, -d / 2 - 0.012 - out2, w / 2 - 0.03, y + hh - 0.012, -d / 2 + (out2 ? -out2 + 0.02 : 0.003), '#c8382c');
      gc.box(-0.15, y + hh - 0.05, -d / 2 - 0.03 - out2, 0.15, y + hh - 0.035, -d / 2 - 0.012 - out2, COL.chrome);
      if (out2) { // the drawer's sides and floor out of the chest, sockets and a wrench in it
        gc.box(-w / 2 + 0.035, y + 0.005, -d / 2 - out2, -w / 2 + 0.045, y + hh - 0.02, -d / 2 + 0.003, '#a02a22'); gc.box(w / 2 - 0.045, y + 0.005, -d / 2 - out2, w / 2 - 0.035, y + hh - 0.02, -d / 2 + 0.003, '#a02a22');
        gc.box(-w / 2 + 0.045, y + 0.008, -d / 2 - out2 + 0.012, w / 2 - 0.045, y + 0.02, -d / 2 + 0.003, '#2b2b30');
        for (let q = 0; q < 10; q++) gc(GEO.cyl8, COL.chrome, { x: -0.26 + q * 0.055, y: y + 0.02 + 0.02 + (q % 3) * 0.004, z: -d / 2 - out2 + 0.08, sx: 0.015 + (q % 4) * 0.004, sy: 0.04 + (q % 3) * 0.008, sz: 0.015 + (q % 4) * 0.004 });
        gc.box(-0.25, y + 0.02, -d / 2 - out2 + 0.14, 0.05, y + 0.03, -d / 2 - out2 + 0.165, COL.chrome);
      }
      y += hh;
    });
    for (const s of [-1, 1]) gc.box(s * (w / 2) - (s > 0 ? 0 : 0.03), 0.75, -0.06, s * (w / 2) + (s > 0 ? 0.03 : 0), 0.78, 0.06, COL.chrome);
    // the box fan on top
    const fy0 = 1.03;
    g.box(-0.26, fy0, -0.07, 0.26, fy0 + 0.52, 0.07, '#e8e2d6');
    g.box(-0.22, fy0 + 0.04, -0.075, 0.22, fy0 + 0.48, -0.07, '#4a4f57');   // (the dark of the fan's well, seen through the grille)
    movers.fan = { x: cx, y: fy + fy0 + 0.26, z: cz - 0.09 };   // (its blades turn when it runs: clutterMovers)
    g(GEO.cyl12, '#e8e2d6', { y: fy0 + 0.26, z: -0.095, sx: 0.04, sy: 0.02, sz: 0.04, rx: Math.PI / 2 });
    for (const rr of [0.08, 0.15, 0.205]) g(new THREE.TorusGeometry(rr, 0.004, 3, 16), COL.chrome, { y: fy0 + 0.26, z: -0.11 });
    for (const s of [-1, 1]) g.box(s < 0 ? -0.26 : 0.22, fy0 + 0.02, -0.12, s < 0 ? -0.22 : 0.26, fy0 + 0.5, -0.07, '#e8e2d6');
    g(GEO.cyl8, '#2b2b30', { x: 0.2, y: fy0 + 0.47, z: 0.0, sx: 0.025, sy: 0.02, sz: 0.025, rx: Math.PI / 2 });
    g.box(-0.08, fy0 + 0.52, -0.015, 0.08, fy0 + 0.55, 0.015, '#4a4f57');
    items.push({ name: 'tool-chest', box: [cx - w / 2 - 0.03, fy, cz - d / 2 - 0.3, cx + w / 2 + 0.03, fy + 1.03, cz + d / 2], floor: true });
    items.push({ name: 'box-fan', box: [cx - 0.26, fy + fy0, cz - 0.08, cx + 0.26, fy + fy0 + 0.55, cz + 0.07] });
    colliders.push({ type: 'box', minX: cx - w / 2 - 0.03, maxX: cx + w / 2 + 0.03, minZ: cz - d / 2 - 0.3, maxZ: cz + d / 2 });
  }

  // ---- boxes of springs: on the floor by the spring table and the tool chest, on the bench
  springBox(ib, items, P.table.x + P.table.w / 2 + 0.22, fy, P.table.z - 0.12, 0.42, 0.36, 0.3, 0.1, 31);
  springBox(ib, items, sx + 1.45, fy, zP - 3.85, 0.36, 0.32, 0.26, -0.25, 32);
  springBox(ib, items, iMinX + 0.31, fy + 0.88, Pg.z0 + 0.78, 0.3, 0.32, 0.17, Math.PI / 2, 33);
  colliders.push({ type: 'box', minX: P.table.x + P.table.w / 2 + 0.0, maxX: P.table.x + P.table.w / 2 + 0.44, minZ: P.table.z - 0.33, maxZ: P.table.z + 0.09 });
  colliders.push({ type: 'box', minX: sx + 1.25, maxX: sx + 1.65, minZ: zP - 4.04, maxZ: zP - 3.66 });
  // a parts organiser on the bench (little drawers, springs and screws in the open compartments), coffee cans of screws
  {
    const bt = fy + 0.88, ox = iMinX + 0.33, oz = Pg.z0 + 1.75, g = framer(ib, ox, bt, oz, Math.PI / 2), C = coils(), R = rng(9);
    g.box(-0.26, 0, -0.1, 0.26, 0.08, 0.1, '#3f6fa8');
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) g.box(-0.24 + i * 0.081, 0.02, -0.08 + j * 0.085, -0.17 + i * 0.081, 0.095 + ((i + j) % 2) * 0.006, -0.005 + j * 0.085, (i + j) % 2 ? '#6fa8d8' : '#8fb8e0');
    for (let i = 0; i < 9; i++) { const sc = 0.016 + R() * 0.01; g(C[i % 3], SPRING[(i * 3) % SPRING.length], { x: -0.205 + (i % 6) * 0.081, y: 0.1, z: -0.045 + (i % 2) * 0.085, sx: sc, sy: sc, sz: sc, rx: 1.2, ry: R() * 6 }); }
    items.push({ name: 'parts-box', box: [ox - 0.1, bt, oz - 0.26, ox + 0.1, bt + 0.12, oz + 0.26] });
    for (let k = 0; k < 3; k++) coffeeCan(ib, iMinX + 0.2 + (k % 2) * 0.17, bt, Pg.z0 + 2.3 + k * 0.17, 41 + k);
    items.push({ name: 'coffee-can', box: [iMinX + 0.12, bt, Pg.z0 + 2.2, iMinX + 0.45, bt + 0.2, Pg.z0 + 2.75] });
  }

  // ---- more tools than outlines: a second layer hung over the pegboard's, and some off its frame
  {
    const px = wallW + 0.085, R = rng(13);
    let n = 0;
    for (let i = 0; i < 16; i++) { // (two rows of eight slots: none of them over another of these)
      const z = Pg.z0 + 0.22 + (i % 8) * (Pg.z1 - Pg.z0 - 0.44) / 7 + (R() - 0.5) * 0.08, y = Pg.y0 + (i < 8 ? 0.42 : 1.22) + (R() - 0.5) * 0.12, kind = (i * 3 + (i >> 3)) % 4, rz = (R() - 0.5) * 0.3;
      const g = framer(ib, px, y, z, 0, rz, 0);   // (the tilt on the frame: every part of a tool turns together)
      f(GEO.cyl6, COL.iron, { x: wallW + 0.05, y: y + 0.1, z, sx: 0.004, sy: 0.07, sz: 0.004, rz: Math.PI / 2 });   // its hook
      if (kind === 0) { g(GEO.box, '#e07a2c', { y: -0.06, sx: 0.022, sy: 0.12, sz: 0.035 }); g(GEO.box, COL.steel, { y: 0.06, sx: 0.012, sy: 0.14, sz: 0.012 }); }
      else if (kind === 1) { g(GEO.box, COL.chrome, { sx: 0.012, sy: 0.24, sz: 0.03 }); g(GEO.box, COL.chrome, { y: 0.12, sx: 0.016, sy: 0.04, sz: 0.06 }); }
      else if (kind === 2) { for (const s of [-1, 1]) g(GEO.box, s < 0 ? '#e0b54a' : '#2b2b30', { x: s * 0.004, z: s * 0.014, y: -0.04, sx: 0.015, sy: 0.16, sz: 0.016, rx: s * 0.15 }); g(GEO.box, COL.steel, { y: 0.07, sx: 0.02, sy: 0.07, sz: 0.03 }); }
      else { g(new THREE.TorusGeometry(0.07, 0.008, 3, 12), ['#b8733a', '#3f8a5a', '#c0392b'][i % 3], { ry: Math.PI / 2, sx: 1, sy: 1.15 }); g(new THREE.TorusGeometry(0.06, 0.008, 3, 12), ['#b8733a', '#3f8a5a', '#c0392b'][i % 3], { x: 0.012, ry: Math.PI / 2, sx: 1, sy: 1.15 }); }
      n++;
    }
    inside.userData.extraTools = n;
    items.push({ name: 'pegboard-extra', box: [wallW, Pg.y0, Pg.z0, wallW + 0.12, Pg.y1, Pg.z1] });
  }

  // ---- extension cords coiled on nails between the bench and the stair, and the shop vac under them
  {
    const cz = [Pg.z1 + 0.24, Pg.z1 + 0.62], R = rng(17);
    cz.forEach((z, i) => {
      const y = fy + 1.62, col = i ? '#f0c24f' : '#f08a3c';
      f(GEO.cyl6, COL.iron, { x: wallW + 0.04, y: y + 0.16, z, sx: 0.005, sy: 0.08, sz: 0.005, rz: Math.PI / 2 });
      for (let k = 0; k < 4; k++) f(new THREE.TorusGeometry(0.15 - k * 0.006, 0.011, 4, 16), col, { x: wallW + 0.025 + k * 0.012, y: y - 0.02 * k, z: z + (R() - 0.5) * 0.03, ry: Math.PI / 2, sx: 1, sy: 1.18 });
      f(GEO.box, i ? '#2b2b30' : '#f08a3c', { x: wallW + 0.07, y: y - 0.32, z: z + 0.07, sx: 0.04, sy: 0.07, sz: 0.04 });
      f.rod([wallW + 0.06, y - 0.17, z + 0.06], [wallW + 0.07, y - 0.29, z + 0.07], 0.01, col);
      items.push({ name: 'extension-cord', box: [wallW, y - 0.36, z - 0.16, wallW + 0.1, y + 0.18, z + 0.16] });
    });
    const vx = wallW + 0.26, vz = Pg.z1 + 0.22, g = framer(ib, vx, fy, vz, 0.4);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; g(GEO.sphere, COL.black, { x: Math.cos(a) * 0.17, y: 0.03, z: Math.sin(a) * 0.17, sx: 0.03, sy: 0.03, sz: 0.03 }); }
    g(GEO.cyl12, '#e0b54a', { y: 0.29, sx: 0.2, sy: 0.46, sz: 0.2 });
    g(GEO.cyl12, '#2b2b30', { y: 0.57, sx: 0.205, sy: 0.12, sz: 0.205 });
    g.box(-0.08, 0.63, -0.02, 0.08, 0.68, 0.02, '#2b2b30');
    g(new THREE.TorusGeometry(0.2, 0.025, 5, 16, Math.PI * 1.5), '#4a4f57', { y: 0.36, rx: Math.PI / 2, sx: 1.18, sy: 1.18 });
    g.rod([0.2, 0.3, 0.0], [0.24, 0.05, 0.12], 0.02, '#4a4f57');
    items.push({ name: 'shop-vac', box: [vx - 0.22, fy, vz - 0.22, vx + 0.22, fy + 0.7, vz + 0.22], floor: true });
    colliders.push({ type: 'circle', x: vx, z: vz, r: 0.22 });
  }

  // ---- the old doors leaning on the west window display's back: a cream four-panel one and a green one with a little window
  {
    const back = P.display.z1 + 0.05;
    [[sx - 4.35, 0.29, 2.0, 0.8, '#e9dfc4', '#d6c9a8', false], [sx - 4.2, 0.36, 1.95, 0.78, '#4f7a5a', '#3f6a4a', true]].forEach(([x, foot, H, w, col, pan, win], i) => {
      const lean = Math.asin((foot - (i ? 0.11 : 0.06)) / H), z = back + foot, g = framer(ib, x, fy, z, 0, -lean, 0);
      g.box(-w / 2, 0, -0.04, w / 2, H, 0, col);
      if (win) { g.box(-w / 2 + 0.12, H - 0.62, 0.0, w / 2 - 0.12, H - 0.15, 0.006, '#2b3a40'); g.box(-0.01, H - 0.62, 0.006, 0.01, H - 0.15, 0.012, col); }
      for (const [y0, y1] of win ? [[0.15, 0.85], [0.95, H - 0.75]] : [[0.15, 0.85], [1.0, H - 0.15]]) for (const s of [-1, 1]) g.box(s < 0 ? -w / 2 + 0.1 : 0.05, y0, 0.0, s < 0 ? -0.05 : w / 2 - 0.1, y1, 0.008, pan);
      g(GEO.sphere, '#c9a23a', { x: w / 2 - 0.09, y: 0.95, z: 0.02, sx: 0.03, sy: 0.03, sz: 0.03 });
      items.push({ name: 'old-door', box: [x - w / 2, fy, back, x + w / 2, fy + H, z + 0.02], floor: true });
    });
    colliders.push({ type: 'box', minX: sx - 4.77, maxX: sx - 3.79, minZ: back, maxZ: back + 0.4 });
  }

  // ---- ladders on the walls: the extension ladder on brackets over the pegboard, the step ladder hung over the counter
  {
    // (crib-clutter-2: both ladders are the model's when it loaded: `fm`)
    const y0 = Pg.y1 + 0.32, za = Pg.z0 + 0.05, zb = Pg.z1 - 0.05;
    for (const [dx, dy, a, c2] of [[0.06, 0, za, zb - 0.9], [0.115, 0.04, za + 0.9, zb]]) {
      const x = wallW + dx;
      for (const y of [y0 + dy, y0 + dy + 0.42]) fm.box(x - 0.012, y - 0.04, a, x + 0.012, y + 0.04, c2, '#c8ccd2');
      for (let z = a + 0.15; z < c2 - 0.05; z += 0.3) fm(GEO.cyl8, '#b4b9be', { x, y: y0 + dy + 0.21, z, sx: 0.015, sy: 0.42, sz: 0.015 });
    }
    for (const z of [za + 0.4, (za + zb) / 2, zb - 0.4]) { fm.box(wallW - 0.003, y0 - 0.07, z - 0.025, wallW + 0.14, y0 - 0.04, z + 0.025, COL.iron); fm.box(wallW + 0.13, y0 - 0.07, z - 0.025, wallW + 0.145, y0 + 0.02, z + 0.025, COL.iron); }
    items.push({ name: 'extension-ladder', box: [wallW, y0 - 0.07, za, wallW + 0.15, y0 + 0.5, zb] });
    // the step ladder, folded, on two hooks (wood, paint spattered)
    const sz = P.counter.minZ + 0.25, sy0 = fy + 2.6, sh = 1.6, x = wallE - 0.06;
    for (const s of [-1, 1]) fm.box(x - 0.02, sy0, sz + s * 0.23 - 0.025, x + 0.02, sy0 + sh, sz + s * 0.23 + 0.025, '#b98a5a');
    for (let k = 0; k < 4; k++) fm.box(x - 0.045, sy0 + 0.3 + k * 0.33, sz - 0.205, x + 0.045, sy0 + 0.33 + k * 0.33, sz + 0.205, '#a8804f');
    fm.box(x - 0.06, sy0 + sh, sz - 0.25, x + 0.03, sy0 + sh + 0.05, sz + 0.25, '#8a6240');
    for (const s of [-1, 1]) fm.box(x + 0.02, sy0 + sh - 0.32, sz + s * 0.23 - 0.025, x + 0.05, sy0 + sh - 0.002, sz + s * 0.23 + 0.025, '#a8804f');
    for (let k = 0; k < 6; k++) fm(GEO.cyl8, PAINTS[(k * 5) % PAINTS.length], { x: x - 0.021, y: sy0 + 0.2 + k * 0.23, z: sz + (k % 2 ? 0.23 : -0.23), sx: 0.012 + (k % 2) * 0.004, sy: 0.003, sz: 0.012, rz: Math.PI / 2 });
    for (const s of [-1, 1]) { fm.box(wallE - 0.003, sy0 + 0.9, sz + s * 0.23 - 0.015, x + 0.03, sy0 + 0.93, sz + s * 0.23 + 0.015, COL.iron); }
    items.push({ name: 'step-ladder', box: [x - 0.06, sy0, sz - 0.25, wallE, sy0 + sh + 0.05, sz + 0.25] });
  }

  // ---- (crib-sound) the wall clock behind the counter, between the step ladder and the ROUTE 9 sign, where Kevin can see it
  // from his stool: a schoolhouse clock, a dark wood rim, a cream face with the hours marked. Its hands turn (clutterMovers, the
  // shared clock's Eastern time) and it ticks (crib-sound.js)
  {
    const cz = iMinZ + 2.66, cy = fy + 2.62, r = 0.18, x = wallE;
    f(GEO.cyl12, '#5a3a24', { x: x - 0.03, y: cy, z: cz, sx: r + 0.025, sy: 0.06, sz: r + 0.025, rz: Math.PI / 2 });
    f(GEO.cyl12, '#3e2716', { x: x - 0.061, y: cy, z: cz, sx: r + 0.012, sy: 0.004, sz: r + 0.012, rz: Math.PI / 2 });
    f(GEO.cyl12, '#f4ecd6', { x: x - 0.064, y: cy, z: cz, sx: r - 0.008, sy: 0.004, sz: r - 0.008, rz: Math.PI / 2 });
    for (let h = 0; h < 12; h++) { const a = h * Math.PI / 6, big = h % 3 === 0, rr = r - (big ? 0.035 : 0.03); f(GEO.box, '#2b2b30', { x: x - 0.067, y: cy + Math.cos(a) * rr, z: cz + Math.sin(a) * rr, sx: 0.003, sy: big ? 0.036 : 0.02, sz: big ? 0.012 : 0.007, rx: a }); }
    f(GEO.cyl8, '#2b2b30', { x: x - 0.084, y: cy, z: cz, sx: 0.012, sy: 0.006, sz: 0.012, rz: Math.PI / 2 });   // (the cap over the hands)
    f.box(x - 0.012, cy + r + 0.02, cz - 0.012, x, cy + r + 0.05, cz + 0.012, COL.iron);   // (the nail it hangs on, peeking over)
    movers.clock = { x: x - 0.07, y: cy, z: cz, r };
    items.push({ name: 'wall-clock', box: [x - 0.09, cy - r - 0.03, cz - r - 0.03, x, cy + r + 0.05, cz + r + 0.03], wall: true });
  }

  // ---- three bikes from the ceiling: two upside down on hooks along the beams, a kid's bike hung by its front wheel
  {
    const bikes = [[sx - 3.3, nearBeam(iMinZ + 3.6), '#c0392b', 1], [sx + 1.1, nearBeam(zP - 2.3), '#3f6fa8', 1]];
    for (const [bx, bz, col] of bikes) {   // (crib-clutter-2: the model's bikes and hooks when it loaded: `nb`, `fm`)
      const wy = beamY - 0.1 - 0.33, g = framer(nb, bx, wy, bz, 0, Math.PI, 0);
      bicycle(g, col);
      for (const dx of [-0.52, 0.52]) hook(fm, bx + dx, beamY - 0.1 + 0.035, bz, beamY + 0.02);
      items.push({ name: 'bike', box: [bx - 0.86, wy - 0.85, bz - 0.3, bx + 0.86, beamY, bz + 0.3], overhead: true });
    }
    const kx = sx + 3.6, kz = nearBeam(iMinZ + 5.8), k = 0.78, wy = beamY - 0.1 - 0.33 * k;
    const g = framer(nb, kx, wy - 0.52 * k, kz, Math.PI / 2, 0, Math.PI / 2);
    bicycle(g, '#3fa09a', k);
    hook(fm, kx, beamY - 0.1 + 0.035, kz, beamY + 0.02, true);
    items.push({ name: 'bike', box: [kx - 0.3, wy - 1.04 * k - 0.33 * k - 0.15, kz - 0.75, kx + 0.3, beamY, kz + 0.75], overhead: true });
  }

  return items;
}

// the salvaged signs: one textured mesh (an atlas canvas), high on the walls: the partition over the paint wall, the front wall
// over the door, the east wall by the fish
export function clutterSigns(inside) {
  const P = CRIB, { fy, iMaxX, zP, minZ, T, sx } = P, sk = 0.03, frontFace = minZ + T + sk;
  // [cell, x, y, z, w, h, facing: 'n' (on the partition, facing north), 's' (on the front wall), 'w' (on the east wall)]
  const S = [
    ['stop', sx - 3.0, fy + 3.5, zP, 0.78, 0.78, 'n'], ['oil', sx - 1.25, fy + 3.05, zP, 1.3, 0.65, 'n'], ['slow', sx + 0.55, fy + 3.75, zP, 0.85, 0.85, 'n'],
    ['noparking', sx + 2.25, fy + 3.1, zP, 0.62, 0.62, 'n'], ['eat', sx + 3.55, fy + 3.95, zP, 0.9, 0.9, 'n'],
    ['gas', sx, fy + 3.75, frontFace, 0.95, 0.95, 's'], ['bait', sx, fy + 2.75, frontFace, 1.25, 1.25, 's'], ['route', iMaxX, fy + 3.4, P.iMinZ + 3.2, 0.7, 0.7, 'w'],
  ];
  const geos = [], items = [];
  S.forEach(([cell, x, y, z, w, h, face], i) => {
    const q = new THREE.PlaneGeometry(w, h), uv = q.attributes.uv, c = SIGN_CELLS.indexOf(cell), cu = (c % 4) / 4, cv = 1 - (Math.floor(c / 4) + 1) / 2;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, cu + uv.getX(k) / 4, cv + uv.getY(k) / 2);
    const off = 0.006 + (i % 3) * 0.004;
    if (face === 'n') { q.rotateY(Math.PI); q.translate(x, y, z - off); }
    else if (face === 's') q.translate(x, y, z + off);
    else { q.rotateY(-Math.PI / 2); q.translate(x - sk - off, y, z); }
    geos.push(q);
    items.push({ name: 'salvaged-sign', box: face === 'w' ? [x - sk - off, y - h / 2, z - w / 2, x - sk, y + h / 2, z + w / 2] : [x - w / 2, y - h / 2, Math.min(z, z + (face === 'n' ? -off : off)), x + w / 2, y + h / 2, Math.max(z, z + (face === 'n' ? -off : off))], cell });
  });
  const tex = new THREE.CanvasTexture(signCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: true }); mat.name = 'crib-signs';
  const m = new THREE.Mesh(mergeAll(geos), mat); m.name = 'crib-signs'; m.matrixAutoUpdate = false; m.updateMatrix(); inside.add(m);
  return items;
}
function mergeAll(geos) { // (plane geometries: one index, one position / normal / uv)
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    base += p.count; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}


// ---------------------------------------------------------------- (crib-sound) the parts that move: one small mesh
// The wall clock's hands (hour, minute, a red second hand that ticks), the box fan's blades (turning while it runs, spinning up and
// running down) and the radio's dial needle (it drifts while the station does): one vertex-coloured mesh in the inside group (drawn
// only near or inside, like the rest), its few vertices rewritten only when something moved. update(hour, secs, fanOn, dt, dial).
export const FAN_SPIN = 15;   // rad/s at full speed (blurred enough at 30-60 fps, still a fan)
export function clutterMovers(inside) {
  const M = inside.userData.movers || {}, parts = [], pos = [], nor = [], col = [], c = new THREE.Color(), m4 = new THREE.Matrix4();
  // a box in a part's own frame (around its pivot, before it turns), turned by `rot` about the part's z (the axis it turns on)
  const box = (part, x, y, z, sx, sy, sz, color, rot = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.applyMatrix4(m4.makeTranslation(x, y, z)); if (rot) g.applyMatrix4(m4.makeRotationZ(rot));
    const p = g.attributes.position, n = g.attributes.normal; c.set(color);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
    part.count += p.count; g.dispose();
  };
  const part = (name, base, kind) => { const p = { name, base, kind, start: pos.length / 3, count: 0, v: null }; parts.push(p); return p; };
  // the clock faces west: its frame is turned so the frame's z points west, out of the face, and the hands turn about it
  if (M.clock) {
    const B = new THREE.Matrix4().makeTranslation(M.clock.x, M.clock.y, M.clock.z).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    const r = M.clock.r;
    const hr = part('hour', B, 'spin'); box(hr, 0, r * 0.27, 0, 0.018, r * 0.62, 0.004, '#2b2b30');
    const mn = part('minute', B, 'spin'); box(mn, 0, r * 0.38, 0.004, 0.012, r * 0.9, 0.004, '#2b2b30');
    const sc = part('second', B, 'spin'); box(sc, 0, r * 0.33, 0.008, 0.005, r * 1.0, 0.003, '#c0392b');
  }
  if (M.fan) {   // the fan faces north (-z): its blades turn about z
    const B = new THREE.Matrix4().makeTranslation(M.fan.x, M.fan.y, M.fan.z);
    const fb = part('fan', B, 'spin');
    for (let k = 0; k < 3; k++) box(fb, 0.1, 0, 0, 0.19, 0.075, 0.008, '#9ad8c4', k * Math.PI * 2 / 3 + 0.2);
  }
  if (M.radio) {   // the needle slides across the dial (from the dial's left end, in the set's frame)
    const R = M.radio, B = new THREE.Matrix4().makeTranslation(R.x, R.y, R.z).multiply(new THREE.Matrix4().makeRotationY(R.yaw)).multiply(new THREE.Matrix4().makeTranslation(-0.135, 0.1, -0.083));
    const nd = part('needle', B, 'slide'); box(nd, 0, 0, 0, 0.01, 0.135, 0.006, '#ff3b2f');
  }
  if (!parts.length) return { mesh: null, parts: [], update() { return false; }, state: () => ({}) };
  const geo = new THREE.BufferGeometry();
  const P = new THREE.Float32BufferAttribute(pos, 3), N = new THREE.Float32BufferAttribute(nor, 3);
  P.setUsage(THREE.DynamicDrawUsage); N.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', P); geo.setAttribute('normal', N); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  for (const p of parts) p.v = { pos: new Float32Array(pos.slice(p.start * 3, (p.start + p.count) * 3)), nor: new Float32Array(nor.slice(p.start * 3, (p.start + p.count) * 3)) };
  const mesh = new THREE.Mesh(geo, toon('#ffffff', { vertexColors: true })); mesh.name = 'crib-movers'; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;   // (its vertices move: tiny, and hidden with the inside)
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  inside.add(mesh);
  const W = new THREE.Matrix4(), D = new THREE.Matrix4(), v = new THREE.Vector3(), e = W.elements;
  const st = { hour: 0, minute: 0, second: 0, fan: 0, spin: 0, needle: 0 }, last = { hour: -1, minute: -1, second: -1, fan: -1, needle: -1 };
  function place(p, val) {
    W.copy(p.base).multiply(p.kind === 'spin' ? D.makeRotationZ(-val) : D.makeTranslation(val, 0, 0));
    const a = P.array, b = N.array, s0 = p.start * 3, vp = p.v.pos, vn = p.v.nor;
    for (let i = 0; i < vp.length; i += 3) {
      v.set(vp[i], vp[i + 1], vp[i + 2]).applyMatrix4(W); a[s0 + i] = v.x; a[s0 + i + 1] = v.y; a[s0 + i + 2] = v.z;
      const nx = vn[i], ny = vn[i + 1], nz = vn[i + 2];
      b[s0 + i] = e[0] * nx + e[4] * ny + e[8] * nz; b[s0 + i + 1] = e[1] * nx + e[5] * ny + e[9] * nz; b[s0 + i + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
    }
  }
  const TAU = Math.PI * 2;
  return {
    mesh, parts: parts.map(p => p.name),
    /** hour: 0..24 (Eastern, fractional), secs: 0..60, fanOn, dt (s), dial: 0..1. True when something moved. */
    update(hour, secs, fanOn, dt, dial = 0.62) {
      st.hour = ((hour % 12) / 12) * TAU; st.minute = ((hour * 60) % 60) / 60 * TAU; st.second = Math.floor(secs % 60) / 60 * TAU;
      st.fan += ((fanOn ? FAN_SPIN : 0) - st.fan) * Math.min(1, dt * (fanOn ? 0.6 : 0.35)); if (st.fan < 0.02) st.fan = 0;
      st.spin = (st.spin + st.fan * dt) % TAU; st.needle = Math.max(0, Math.min(1, dial)) * 0.14;
      let moved = false;
      for (const p of parts) {
        const val = p.name === 'fan' ? st.spin : st[p.name];
        if (Math.abs(val - last[p.name]) < 1e-4) continue;
        last[p.name] = val; moved = true;
        place(p, val);
      }
      if (moved) { P.needsUpdate = true; N.needsUpdate = true; }
      return moved;
    },
    state: () => ({ ...st }),
  };
}
