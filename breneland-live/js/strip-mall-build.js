// The strip mall's building (strip-mall.js owns the feature, strip-mall-plan.js has every number): one low building west of the game
// store on Summit Rd with two storefronts under a shared timber canopy, Summit Slice (pizza) and Peak Threads (clothes), a concrete
// walkway in front of the glass and a small tar lot with head-in bays in front of that. Mountain-town: a stone footing and bulkheads,
// board-and-batten walls (each store its own colour), timber posts with knee braces under a standing-seam tin canopy, a dark fascia
// band carrying the lit signs.
//
// The Blender set piece (strip-mall-model.js, assets/blender/scripts/build_strip_mall.py) is the look: when it loaded, its `shell` and
// `inside` parts are two meshes with the HD material and everything the code would have built of the architecture and the fixed
// furniture is routed to NOPE (a batcher that only counts: `built.replacedTris`). When it did not, the code-built mall below is what
// you see (the same plan, plain boxes). Either way the code builds what moves, glows or prints: the glass (real-glass.js, see-through
// near), the two doors (they swing in for you while the store is open), the signs' faces and the menu board (canvas text), every bulb
// and glow panel (one lamp material per store, so each keeps its own hours, and one for the outside), the night spots at them, the
// parked cars, the bench (a prop), the colliders, the surfaces and the seats.
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { addSurface } from './terrain.js';
import { toon } from './toon.js';
import { windowGlass, addNightSpot as addSpot, LAMPS, NIGHT_SPOTS } from './daynight-mats.js';
import { realGlass, glassUniforms } from './real-glass.js';
import { propsReady, addProp } from './props-static.js';
import { addBenchSeats, addSeat } from './seats.js';
import { addCarModel, carSpec } from './car-models.js';
import { signTexture } from './areas.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { STRIP_MALL as L } from './layout.js';
import { GY, FY, T, TOP, CEIL, CANOPY, GLASS1, TRANSOM, DOOR_H, BAND, PARTY, WALK, LOT, POSTS, POST_Z, CARS, C, GARMENTS, PIZZA, CLOTHES, colliderList } from './strip-mall-plan.js';
import { stripMallModel, stripMallGeometry, stripMallMaterial, stripMallAnchors } from './strip-mall-model.js';

// the lamps: one bulb material per store (the owner turns each store's lights off at its closing time: strip-mall.js dims its `base`)
// and one for the outside (the canopy's downlights and the signs burn dusk to dawn like the street lamps), all in daynight's lamp list
const BULBS = {};
for (const k of ['pizza', 'clothes', 'out']) { const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); m.name = 'mall-bulbs-' + k; LAMPS.set(m.name, { mat: m, base: new THREE.Color('#ffffff') }); BULBS[k] = m; }
class Bulbs {
  constructor(mat) { this.geos = []; this.c = new THREE.Color(); this.mat = mat; }
  add(geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.scale(sx, sy, sz); if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z);
    this.c.set(color); const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); this.geos.push(g); return this;
  }
  build(parent, name) {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.geos, false), this.mat); this.geos.forEach(g => g.dispose()); this.geos = [];
    m.name = name; m.castShadow = m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.geometry.computeBoundingSphere(); parent.add(m); return m;
  }
}
const SPH = new THREE.SphereGeometry(1, 9, 6);

// the menu board's face: Summit Slice's menu, chalk on a dark board (the frame is the model's or the code's)
function menuTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 224;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  g.fillStyle = '#2b2340'; g.fillRect(0, 0, 1024, 224);
  g.fillStyle = '#f3e3c3'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = '700 46px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText('SUMMIT SLICE', 36, 42);
  g.font = '500 30px "Fredoka", "Trebuchet MS", sans-serif'; g.fillStyle = '#ffd27a'; g.fillText('hot and fresh, delivered till 1', 420, 44);
  const items = [['Cheese', '12'], ['Pepperoni', '14'], ['Veggie Supreme', '15'], ['The Summit (everything)', '17'], ['Garlic knots', '6'], ['Slice', '3']];
  g.font = '600 30px "Fredoka", "Trebuchet MS", sans-serif';
  items.forEach(([n, p], i) => { const col = i < 3 ? 0 : 1, row = i % 3; const x = 36 + col * 500, y = 96 + row * 42; g.fillStyle = '#fff4dc'; g.fillText(n, x, y); g.textAlign = 'right'; g.fillText(p, x + 440, y); g.textAlign = 'left'; });
  return tex;
}
// a lit sign's face: the name in big round letters, a small line under it, on a transparent ground (the model's dark panel is behind)
function signFace(name, sub, color) {
  const w = 1024, h = 128, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(20,14,30,0.9)';
  let size = 76; g.font = `700 ${size}px "Fredoka", "Trebuchet MS", sans-serif`;
  while (g.measureText(name).width > w - 220 && size > 30) { size -= 4; g.font = `700 ${size}px "Fredoka", "Trebuchet MS", sans-serif`; }
  g.strokeText(name, w / 2, 50); g.fillStyle = color; g.fillText(name, w / 2, 50);
  g.font = '600 26px "Fredoka", "Trebuchet MS", sans-serif'; g.lineWidth = 6; g.strokeText(sub, w / 2, 104); g.fillStyle = '#fff4dc'; g.fillText(sub, w / 2, 104);
  return tex;
}

export function buildStripMall(g, colliders) {
  const M = stripMallModel();
  const NOPE = { tris: 0, add(geo) { NOPE.tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; return NOPE; }, boxMinMax() { NOPE.tris += 12; return NOPE; }, build() { return []; } };
  const shell = new THREE.Group(); shell.name = 'strip-mall-shell'; g.add(shell);
  const inside = new THREE.Group(); inside.name = 'strip-mall-inside'; g.add(inside);
  const near = new THREE.Group(); near.name = 'strip-mall-near'; g.add(near);   // the small pieces (the door leaves, the hours cards): strip-mall.js hides them far off
  const bShell = new Batcher({ vertexColors: true }), bIn = new Batcher({ vertexColors: true, castShadow: false });
  const sb = M ? NOPE : bShell, ib = M ? NOPE : bIn;   // the architecture and the fixed furniture: the model has them
  if (M) for (const [part, into] of [['shell', shell], ['inside', inside]]) { const m = new THREE.Mesh(stripMallGeometry(part), stripMallMaterial(M.parts[part].sheet)); m.name = 'strip-mall-' + part + '-model'; m.userData.noMerge = true; m.matrixAutoUpdate = false; m.castShadow = part === 'shell'; m.receiveShadow = true; into.add(m); }
  const minX = L.minX, maxX = L.maxX, minZ = L.minZ, maxZ = L.maxZ;

  // ---------------------------------------------------------------- surfaces: the lot, the walkway (flush with the floors), the floors
  addSurface({ minX: LOT.minX - 0.2, maxX: LOT.maxX + 0.2, minZ: LOT.minZ, maxZ: LOT.maxZ, y: LOT.y, sound: 'stone' });
  addSurface({ minX: minX - 0.5, maxX: maxX + 0.5, minZ: WALK.minZ, maxZ: minZ, y: WALK.y, sound: 'stone' });
  addSurface({ minX, maxX: PARTY.x0, minZ, maxZ, y: FY + 0.004, sound: 'stone' });
  addSurface({ minX: PARTY.x1, maxX, minZ, maxZ, y: FY + 0.004, sound: 'wood' });

  // ---------------------------------------------------------------- the code-built shell (what the model has)
  sb.boxMinMax(LOT.minX - 0.2, GY - 0.05, LOT.minZ, LOT.maxX + 0.2, LOT.y, LOT.maxZ + 0.02, C.tar);
  sb.boxMinMax(minX - 0.5, GY - 0.05, WALK.minZ, maxX + 0.5, WALK.y, minZ + 0.05, C.walk);
  sb.boxMinMax(minX - 0.5, LOT.y - 0.02, WALK.minZ - 0.02, maxX + 0.5, WALK.y + 0.006, WALK.minZ + 0.24, C.kerb);
  const front = U => { const f = U.front, d = f.door; return [f.west, f.east, { a0: d.a0, a1: d.a1, y0: d.y0, y1: GLASS1 }]; };
  const holey = (b, axis, a0, a1, t0, t1, y0, y1, holes, col) => { // a wall slab with rectangular holes (game-store-build's)
    const xs = [...new Set([a0, a1, ...holes.flatMap(h => [h.a0, h.a1])])].filter(v => v >= a0 && v <= a1).sort((p, q) => p - q);
    for (let i = 0; i < xs.length - 1; i++) {
      const p = xs[i], q = xs[i + 1], cut = holes.filter(h => h.a0 <= p + 1e-6 && h.a1 >= q - 1e-6).sort((m, n) => m.y0 - n.y0);
      let y = y0;
      for (const h of cut) { if (h.y0 > y) piece(p, q, y, h.y0); y = Math.max(y, h.y1); }
      if (y < y1) piece(p, q, y, y1);
    }
    function piece(p, q, ya, yb) { if (axis === 'x') b.boxMinMax(p, ya, t0, q, yb, t1, col); else b.boxMinMax(t0, ya, p, t1, yb, q, col); }
  };
  holey(sb, 'x', minX, PARTY.x1, minZ, minZ + T, GY, TOP, front(PIZZA), C.pizzaWall);
  holey(sb, 'x', PARTY.x1, maxX, minZ, minZ + T, GY, TOP, front(CLOTHES), C.clothesWall);
  holey(sb, 'x', minX, maxX, maxZ - T, maxZ, GY, TOP, [], C.board);
  holey(sb, 'z', minZ + T, maxZ - T, minX, minX + T, GY, TOP, [PIZZA.west], C.board);
  holey(sb, 'z', minZ + T, maxZ - T, maxX - T, maxX, GY, TOP, [CLOTHES.east], C.board);
  for (const [x0, z0, x1, z1] of [[minX - 0.08, minZ + 0.3, minX + 0.02, maxZ + 0.08], [maxX - 0.02, minZ + 0.3, maxX + 0.08, maxZ + 0.08], [minX - 0.08, maxZ - 0.02, maxX + 0.08, maxZ + 0.08]]) sb.boxMinMax(x0, GY - 0.05, z0, x1, GY + 0.62, z1, C.stone);
  sb.boxMinMax(minX - 0.02, BAND.y0, minZ - 0.05, maxX + 0.02, BAND.y1, minZ + 0.001, C.fascia);
  sb.boxMinMax(minX - 0.12, TOP - 0.02, minZ - 0.12, maxX + 0.12, TOP + 0.1, maxZ + 0.12, C.cap);
  sb.boxMinMax(minX + T - 0.05, TOP - 0.42, minZ + T - 0.05, maxX - T + 0.05, TOP - 0.34, maxZ - T + 0.05, C.roof);
  { const out = CANOPY.out, drop = CANOPY.drop, y0 = CANOPY.y, y1 = y0 - drop, slope = Math.atan2(drop, out);
    sb.boxMinMax(minX - 0.3, y0 - 0.02, minZ - 0.06, maxX + 0.3, y0 + 0.2, minZ + 0.001, C.timber);
    sb.add(GEO.box, C.tin, { x: (minX + maxX) / 2, y: (y0 + y1) / 2 + 0.23, z: minZ - out / 2, sx: maxX - minX + 0.7, sy: 0.04, sz: out + 0.24, rx: slope });
    sb.boxMinMax(minX - 0.35, y1 - CANOPY.fascia + 0.2, minZ - out - 0.08, maxX + 0.35, y1 + 0.25, minZ - out - 0.02, C.timber);
    sb.boxMinMax(minX - 0.3, y1 - 0.12, POST_Z - 0.12, maxX + 0.3, y1 + 0.1, POST_Z + 0.12, C.timber);
    for (const x of POSTS) { sb.add(GEO.box, C.stone, { x, y: WALK.y + 0.15, z: POST_Z, sx: 0.4, sy: 0.3, sz: 0.4 }); sb.add(GEO.box, C.timber, { x, y: (WALK.y + 0.32 + y1 - 0.12) / 2, z: POST_Z, sx: 0.22, sy: y1 - 0.12 - WALK.y - 0.32, sz: 0.22 }); } }
  for (const U of [PIZZA, CLOTHES]) {
    const u = U.unit, f = U.front, d = f.door;
    for (const [a0, a1] of [[u.minX, d.a0 - 0.06], [d.a1 + 0.06, u.maxX]]) sb.boxMinMax(a0, FY - 0.04, minZ - 0.08, a1, f.bulkhead.y1 - 0.06, minZ + 0.02, C.stone);
    for (const w of [f.west, f.east]) { for (const x of [w.a0, w.a1]) sb.add(GEO.box, C.iron, { x, y: (w.y0 + w.y1) / 2, z: minZ + 0.1, sx: 0.07, sy: w.y1 - w.y0, sz: 0.1 }); sb.boxMinMax(w.a0, TRANSOM - 0.04, minZ + 0.05, w.a1, TRANSOM + 0.04, minZ + 0.15, C.iron); }
    sb.add(GEO.box, C.fascia, { x: f.sign.x, y: f.sign.y, z: minZ - 0.1, sx: f.sign.w + 0.36, sy: f.sign.h + 0.3, sz: 0.06 });
  }

  // ---------------------------------------------------------------- the code-built inside (what the model has)
  for (const U of [PIZZA, CLOTHES]) {
    const pz = U === PIZZA, fl = pz ? C.floorPz : C.floorCl, wl = pz ? C.wallIn : C.wallInCl;
    ib.boxMinMax(U.x0, GY, U.z0, U.x1, FY + 0.004, U.z1, fl);
    ib.boxMinMax(U.x0, CEIL, U.z0, U.x1, CEIL + 0.12, U.z1, pz ? C.ceil : C.ceilCl);
    holey(ib, 'x', U.x0, U.x1, U.z0, U.z0 + 0.012, FY, CEIL, front(U), wl);
    holey(ib, 'x', U.x0, U.x1, U.z1 - 0.012, U.z1, FY, CEIL, [], wl);
    if (pz) holey(ib, 'z', U.z0, U.z1, U.x0, U.x0 + 0.012, FY, CEIL, [U.west], wl); else holey(ib, 'z', U.z0, U.z1, U.x1 - 0.012, U.x1, FY, CEIL, [U.east], wl);
    const cnt = U.counter; ib.boxMinMax(cnt.minX, FY, cnt.minZ, cnt.maxX, cnt.top, cnt.maxZ, C.counter); ib.boxMinMax(cnt.minX - 0.02, cnt.top - 0.05, cnt.minZ - 0.02, cnt.maxX + 0.02, cnt.top, cnt.maxZ + 0.02, C.counterTop);
  }
  { const mid = (PARTY.x0 + PARTY.x1) / 2; ib.boxMinMax(PARTY.x0, GY, minZ + T, mid, CEIL + 0.1, maxZ - T, C.wallIn); ib.boxMinMax(mid, GY, minZ + T, PARTY.x1, CEIL + 0.1, maxZ - T, C.wallInCl); }
  { const P = PIZZA, bc = P.backCounter; ib.boxMinMax(bc.minX, FY, bc.minZ, bc.maxX, bc.top, bc.maxZ, C.steel);
    for (const o of P.ovens) { ib.boxMinMax(o.minX, FY, o.minZ, o.maxX, FY + o.h, o.maxZ, C.oven); ib.boxMinMax(o.minX + 0.12, FY + 0.55, o.minZ - 0.02, o.maxX - 0.12, FY + 0.91, o.minZ + 0.01, C.ovenDoor); }
    ib.boxMinMax(P.prep.minX, P.prep.top - 0.04, P.prep.minZ, P.prep.maxX, P.prep.top, P.prep.maxZ, C.steel);
    ib.boxMinMax(P.partition.minX, FY, P.partition.minZ, P.partition.maxX, P.partition.h, P.partition.maxZ, C.counter);
    for (const b of P.booths) { for (const bz of b.benches) { ib.boxMinMax(b.x0, FY, bz - 0.25, b.x1, b.seat, bz + 0.25, C.booth); ib.boxMinMax(b.x0, b.seat, bz + (bz < b.z ? -0.3 : 0.18), b.x1, b.back, bz + (bz < b.z ? -0.18 : 0.3), C.booth); } ib.add(GEO.box, C.table, { x: b.table.x, y: b.table.top - 0.025, z: b.table.z, sx: b.table.w, sy: 0.05, sz: b.table.d }); }
    ib.add(GEO.cyl12, C.brick, { x: P.dome.x, y: FY + 0.95 + (P.dome.h - 0.95) / 2, z: P.dome.z, sx: P.dome.r, sy: P.dome.h - 0.95, sz: P.dome.r }); ib.boxMinMax(P.dome.x - P.dome.r - 0.1, FY, P.dome.z - P.dome.r - 0.1, P.dome.x + P.dome.r + 0.1, FY + 0.95, P.dome.z + P.dome.r + 0.1, C.stone);
    for (const t of P.tables) { ib.add(GEO.cyl12, C.cloth, { x: t.x, y: t.top - 0.03, z: t.z, sx: t.r + 0.03, sy: 0.06, sz: t.r + 0.03 }); ib.add(GEO.cyl8, C.rack, { x: t.x, y: (FY + t.top - 0.06) / 2, z: t.z, sx: 0.06, sy: t.top - 0.06 - FY, sz: 0.06 }); }
    for (const s of P.seats) if (s.kind === 'chair') { const c = s.chair; ib.add(GEO.box, C.chair, { x: c.x, y: FY + 0.44, z: c.z, sx: 0.42, sy: 0.04, sz: 0.42, ry: s.yaw }); ib.add(GEO.box, C.chair, { x: c.x - Math.sin(s.yaw) * 0.19, y: FY + 0.76, z: c.z - Math.cos(s.yaw) * 0.19, sx: 0.42, sy: 0.6, sz: 0.04, ry: s.yaw }); } // (the chair's middle: the seat's spot is the sitter's, slice-seats)
    ib.boxMinMax(P.fridge.minX, FY, P.fridge.minZ, P.fridge.maxX, FY + P.fridge.h, P.fridge.maxZ, C.fridgeDk);
    ib.add(GEO.box, C.timber, { x: P.menu.x, y: P.menu.y, z: P.menu.z + 0.03, sx: P.menu.w + 0.12, sy: P.menu.h + 0.12, sz: 0.06 }); }
  { const Q = CLOTHES;
    { const cb = Q.cubbies, cw = (cb.maxX - cb.minX) / cb.cols, chh = (cb.h - FY - 0.08) / cb.rows; ib.boxMinMax(cb.minX, FY, cb.minZ, cb.maxX, cb.h, cb.maxZ, C.shelf); for (let i = 0; i < cb.cols; i++) for (let r = 0; r < cb.rows; r++) ib.add(GEO.box, C[GARMENTS[(i * 3 + r * 7) % 10]], { x: cb.minX + (i + 0.5) * cw, y: FY + r * chh + 0.2, z: (cb.minZ + cb.maxZ) / 2 + 0.03, sx: cw - 0.24, sy: 0.3, sz: 0.34 }); }
    { const tb = Q.table; ib.add(GEO.box, C.timber, { x: tb.x, y: tb.top - 0.04, z: tb.z, sx: tb.w, sy: 0.08, sz: tb.d }); for (let i = 0; i < 5; i++) ib.add(GEO.box, C[GARMENTS[(i * 3) % 10]], { x: tb.x - tb.w / 2 + 0.35 + i * (tb.w - 0.7) / 4, y: tb.top + 0.15, z: tb.z + (i % 2 ? 0.3 : -0.28), sx: 0.36, sy: 0.3, sz: 0.32 }); }
    { const rs = Q.risers; rs.steps.forEach((h, k) => ib.boxMinMax(rs.minX + k * (rs.maxX - rs.minX) / 3, FY, rs.minZ, rs.maxX, FY + h, rs.maxZ, C.shelf)); }
    { const sf = Q.nook.sofa; ib.add(GEO.box, C.sofa, { x: sf.x, y: FY + 0.3, z: sf.z, sx: sf.d, sy: 0.6, sz: sf.w }); ib.add(GEO.cyl8, C.timber, { x: Q.nook.side.x, y: FY + 0.25, z: Q.nook.side.z, sx: 0.3, sy: 0.5, sz: 0.3 }); ib.add(GEO.cyl8, C.cloth2, { x: Q.nook.lamp.x, y: Q.nook.lamp.h - 0.15, z: Q.nook.lamp.z, sx: 0.22, sy: 0.3, sz: 0.22 }); }
    { const cn = Q.canoe; ib.add(GEO.box, C.canoe, { x: cn.x, y: cn.y + cn.h / 2, z: cn.z, sx: cn.len, sy: cn.h, sz: cn.w, ry: cn.yaw }); ib.add(GEO.cyl12, C.stone, { x: Q.campfire.x, y: FY + 0.08, z: Q.campfire.z, sx: Q.campfire.r + 0.1, sy: 0.16, sz: Q.campfire.r + 0.1 }); ib.add(GEO.box, C.crate, { x: Q.crate.x, y: FY + Q.crate.s / 2, z: Q.crate.z, sx: Q.crate.s, sy: Q.crate.s, sz: Q.crate.s }); }
    for (const p of Q.plants) { ib.add(GEO.cyl8, C.pot, { x: p.x, y: FY + 0.22 * p.s, z: p.z, sx: 0.2 * p.s, sy: 0.45 * p.s, sz: 0.2 * p.s }); ib.add(GEO.ico1, C.leaf, { x: p.x, y: FY + 0.8 * p.s, z: p.z, sx: 0.3 * p.s, sy: 0.35 * p.s, sz: 0.3 * p.s }); }
    const ft = Q.fitting; for (const [x0, z0, x1, z1] of [[ft.minX, ft.minZ, ft.maxX, ft.minZ + 0.08], [ft.minX, ft.maxZ - 0.08, ft.maxX, ft.maxZ], [ft.maxX - 0.08, ft.minZ, ft.maxX, ft.maxZ]]) ib.boxMinMax(x0, FY, z0, x1, ft.h, z1, C.wallInCl);
    ib.add(GEO.box, C.curtain, { x: ft.minX + 0.02, y: (FY + ft.h) / 2, z: ft.maxZ - 0.1 - (ft.maxZ - ft.minZ - 0.2) * 0.275, sx: 0.08, sy: ft.h - FY - 0.2, sz: (ft.maxZ - ft.minZ - 0.2) * 0.55 });
    ib.add(GEO.box, C.mirror, { x: Q.mirror.x, y: Q.mirror.y, z: Q.mirror.z - 0.03, sx: Q.mirror.w, sy: Q.mirror.h, sz: 0.02 });
    for (const r of Q.racks) {
      if (r.kind === 'round') { ib.add(GEO.cyl8, C.rack, { x: r.x, y: (FY + r.h) / 2, z: r.z, sx: 0.03, sy: r.h - FY, sz: 0.03 }); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ib.add(GEO.box, C[GARMENTS[(i * 7) % 10]], { x: r.x + Math.sin(a) * (r.w / 2 - 0.05), y: r.h - 0.4, z: r.z + Math.cos(a) * (r.w / 2 - 0.05), sx: 0.38, sy: 0.58, sz: 0.035, ry: a }); } }
      else { for (const s of [-1, 1]) ib.add(GEO.box, C.rack, { x: r.x + s * (r.w / 2 - 0.03), y: (FY + r.h) / 2, z: r.z, sx: 0.04, sy: r.h - FY, sz: 0.04 }); ib.add(GEO.box, C.rack, { x: r.x, y: r.h, z: r.z, sx: r.w, sy: 0.03, sz: 0.03 }); for (let i = 0; i < 7; i++) ib.add(GEO.box, C[GARMENTS[(i * 3) % 10]], { x: r.x - r.w / 2 + 0.16 + i * (r.w - 0.32) / 6, y: r.h - 0.38, z: r.z, sx: 0.035, sy: 0.6, sz: 0.42 }); }
    }
    Q.mannequins.forEach((m, i) => { ib.add(GEO.box, C.plinth, { x: m.x, y: FY + m.plinth / 2, z: m.z, sx: 0.62, sy: m.plinth, sz: 0.62 }); ib.add(GEO.cyl8, C[GARMENTS[(i * 4 + 1) % 10]], { x: m.x, y: FY + m.plinth + 1.25, z: m.z, sx: 0.2, sy: 0.66, sz: 0.2 }); ib.add(GEO.cyl6, C.rack, { x: m.x, y: FY + m.plinth + 0.46, z: m.z, sx: 0.02, sy: 0.9, sz: 0.02 }); ib.add(SPH, C.mann, { x: m.x, y: FY + m.plinth + 1.77, z: m.z, sx: 0.11, sy: 0.13, sz: 0.11 }); });
    ib.boxMinMax(Q.rug.minX, FY + 0.004, Q.rug.minZ, Q.rug.maxX, FY + 0.016, Q.rug.maxZ, C.rug); }

  // ---------------------------------------------------------------- the glass: real-glass panes in every opening (one batch per store, in the shell: seen from outside)
  const glassLit = windowGlass(0.95).clone(); glassLit.name = 'mall-glass';
  const glassU = glassUniforms(), glassReal = realGlass(glassLit, glassU, 'mall-glass+real');
  const PANE = 0.02, IN = 0.08, BURY = 0.02, glassMeshes = [];
  const pb = new Batcher({ castShadow: false });
  for (const U of [PIZZA, CLOTHES]) {
    const f = U.front;
    for (const w of [f.west, f.east]) pb.add(GEO.box, glassReal, { x: (w.a0 + w.a1) / 2, y: (w.y0 + w.y1) / 2, z: minZ + IN, sx: w.a1 - w.a0 + 2 * BURY, sy: w.y1 - w.y0 + 2 * BURY, sz: PANE });
    pb.add(GEO.box, glassReal, { x: (f.transom.a0 + f.transom.a1) / 2, y: (f.transom.y0 + f.transom.y1) / 2, z: minZ + IN, sx: f.transom.a1 - f.transom.a0 + 2 * BURY, sy: f.transom.y1 - f.transom.y0 + 2 * BURY, sz: PANE });
  }
  pb.add(GEO.box, glassReal, { x: minX + IN, y: (PIZZA.west.y0 + PIZZA.west.y1) / 2, z: (PIZZA.west.a0 + PIZZA.west.a1) / 2, sx: PANE, sy: PIZZA.west.y1 - PIZZA.west.y0 + 2 * BURY, sz: PIZZA.west.a1 - PIZZA.west.a0 + 2 * BURY });
  pb.add(GEO.box, glassReal, { x: maxX - IN, y: (CLOTHES.east.y0 + CLOTHES.east.y1) / 2, z: (CLOTHES.east.a0 + CLOTHES.east.a1) / 2, sx: PANE, sy: CLOTHES.east.y1 - CLOTHES.east.y0 + 2 * BURY, sz: CLOTHES.east.a1 - CLOTHES.east.a0 + 2 * BURY });
  for (const m of pb.build(shell, 'strip-mall-glass')) { m.userData.noMerge = true; glassMeshes.push(m); }

  // ---------------------------------------------------------------- the doors: a glass leaf in a slim dark frame, hinged at the west jamb, swinging in
  const doors = {};
  for (const U of [PIZZA, CLOTHES]) {
    const d = U.front.door, W = d.a1 - d.a0 - 0.02, H = DOOR_H - 0.02, R0 = 0.16, R1 = 0.1, S = 0.07;
    const leaf = new THREE.Group(); leaf.name = 'strip-mall-door-' + U.unit.id; leaf.position.set(d.a0 + 0.01, FY + 0.012, minZ + 0.15);
    const db = new Batcher({ vertexColors: true });
    db.add(GEO.box, C.iron, { x: W / 2, y: R0 / 2, z: 0, sx: W, sy: R0, sz: 0.05 }); db.add(GEO.box, C.iron, { x: W / 2, y: H - R1 / 2, z: 0, sx: W, sy: R1, sz: 0.05 });
    for (const x of [S / 2, W - S / 2]) db.add(GEO.box, C.iron, { x, y: (R0 + H - R1) / 2, z: 0, sx: S, sy: H - R0 - R1, sz: 0.05 });
    for (const zz of [-0.045, 0.045]) db.add(GEO.box, C.brass, { x: W - 0.16, y: 1.05, z: zz, sx: 0.04, sy: 0.34, sz: 0.03 });
    db.add(GEO.box, glassReal, { x: W / 2, y: (R0 + H - R1) / 2, z: 0, sx: W - 2 * S + 0.02, sy: H - R0 - R1 + 0.02, sz: PANE });
    for (const m of db.build(leaf, 'strip-mall-door')) { m.matrixAutoUpdate = true; if (m.material === glassReal) { m.castShadow = false; m.userData.noMerge = true; glassMeshes.push(m); } }
    near.add(leaf);
    const col = { type: 'box', minX: d.a0, maxX: d.a1, minZ: minZ - 0.05, maxZ: minZ + T, door: true };
    colliders.push(col);
    doors[U.unit.id] = { leaf, col, x: U.unit.door.x };
  }

  // ---------------------------------------------------------------- the signs (lit faces on the fascia band) and the menu board
  const signs = {};
  for (const [U, color] of [[PIZZA, '#ffb347'], [CLOTHES, '#9ad8ff']]) {
    const s = U.front.sign, mat = new THREE.MeshBasicMaterial({ map: signFace(U.unit.name, U === PIZZA ? 'PIZZA  -  SLICES  -  DELIVERY' : 'CLOTHIERS  -  OUTFITTERS', color), transparent: true, fog: true });
    mat.name = 'mall-sign-' + U.unit.id; LAMPS.set(mat.name, { mat, base: new THREE.Color('#ffffff') });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat); m.position.set(s.x, s.y, minZ - 0.15); m.rotation.y = Math.PI; m.name = 'strip-mall-sign-' + U.unit.id; m.matrixAutoUpdate = false; m.updateMatrix(); shell.add(m);
    signs[U.unit.id] = m;
  }
  { const mn = PIZZA.menu, m = new THREE.Mesh(new THREE.PlaneGeometry(mn.w, mn.h), new THREE.MeshBasicMaterial({ map: menuTexture(), fog: true })); m.position.set(mn.x, mn.y, mn.z - 0.035); m.rotation.y = Math.PI; m.name = 'strip-mall-menu'; m.matrixAutoUpdate = false; m.updateMatrix(); inside.add(m); }
  for (const U of [PIZZA, CLOTHES]) { // the hours by each door, a small card on the glass
    const u = U.unit, h = u.hours, fmt = hh => { const x = hh % 24, am = x < 12 ? 'am' : 'pm', n = Math.floor(x) % 12 === 0 ? 12 : Math.floor(x) % 12, mi = Math.round((x % 1) * 60); return n + (mi ? ':' + String(mi).padStart(2, '0') : '') + ' ' + am; };
    const lines = ['OPEN ' + fmt(h[0]) + ' to ' + fmt(h[1])]; if (u.id === 'pizza') lines.push('Party Wed Fri Sat to 5 am');   // (mall-staff: the late party)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: signTexture(lines, { bg: '#2b2340', fg: '#fff4dc', w: 512, h: 128 }), fog: true }));
    m.position.set(U.front.east.a0 + 0.45, FY + 1.6, minZ + IN - 0.012); m.rotation.y = Math.PI; m.name = 'strip-mall-hours-' + u.id; m.matrixAutoUpdate = false; m.updateMatrix(); near.add(m);
  }

  // ---------------------------------------------------------------- the lights: bulbs and glow panels at the model's fixtures, a night spot at each
  const lamps = { pizza: [], clothes: [], out: [] };
  const spotAt = (list, s) => { addSpot(s); const sp = NIGHT_SPOTS[NIGHT_SPOTS.length - 1]; list.push(sp); return sp; };
  const bOut = new Bulbs(BULBS.out), bPz = new Bulbs(BULBS.pizza), bCl = new Bulbs(BULBS.clothes);
  for (const U of [PIZZA, CLOTHES]) for (const lp of U.front.lamps) { // the canopy's downlights: their glass under the can, a pool on the walkway
    const yc = CANOPY.y - CANOPY.drop * (minZ - lp.z) / CANOPY.out;
    if (!M) sb.add(GEO.cyl8, C.iron, { x: lp.x, y: yc - 0.04, z: lp.z, sx: 0.09, sy: 0.2, sz: 0.09 });
    bOut.add(GEO.cyl8, '#ffe0a0', { x: lp.x, y: yc - 0.15, z: lp.z, sx: 0.075, sy: 0.02, sz: 0.075 });
    spotAt(lamps.out, { x: lp.x, y: yc - 0.2, z: lp.z, color: '#ffe0a0', pool: 2.6, gy: WALK.y, halo: 0.5 });
  }
  for (const a of stripMallAnchors('glow-out-back')) { const [x, y, z] = a.pos; bOut.add(GEO.box, '#ffe0a0', { x, y, z: z + 0.02, sx: 0.16, sy: 0.08, sz: 0.2 }); spotAt(lamps.out, { x, y: y - 0.1, z: z + 0.5, color: '#ffe0a0', pool: 2.2, gy: GY, halo: 0 }); }
  for (const lp of PIZZA.lamps) { if (!M) ib.add(GEO.cone8, C.iron, { x: lp.x, y: lp.y + 0.1, z: lp.z, sx: 0.2, sy: 0.24, sz: 0.2 }); bPz.add(SPH, '#ffd9a0', { x: lp.x, y: lp.y, z: lp.z, sx: 0.06, sy: 0.07, sz: 0.06 }); spotAt(lamps.pizza, { x: lp.x, y: lp.y - 0.05, z: lp.z, color: '#ffd9a0', pool: 2.4, gy: FY, halo: 0.4 }); }
  { const k = PIZZA.kitchenLight; bPz.add(GEO.box, '#fff6e0', { x: k.x, y: k.y - 0.012, z: k.z, sx: k.w - 0.02, sy: 0.02, sz: k.d - 0.02 }); /* (inside the model's frame, its underside 8 mm up from the frame's) */ spotAt(lamps.pizza, { x: k.x, y: k.y - 0.1, z: k.z, color: '#fff6e0', pool: 3.0, gy: FY, halo: 0 }); }
  { const f = PIZZA.fridge; bPz.add(GEO.box, '#bfe6ff', { x: f.minX - 0.03, y: FY + 0.35 + (f.h - 0.7) / 2, z: (f.minZ + f.maxZ) / 2, sx: 0.01, sy: f.h - 0.7, sz: f.maxZ - f.minZ - 0.3 }); /* (5 cm inside the model's glass panel's edges and 5 mm in front of it: no face in its faces) */ spotAt(lamps.pizza, { x: f.minX - 0.3, y: FY + 1.2, z: (f.minZ + f.maxZ) / 2, color: '#bfe6ff', pool: 1.2, gy: FY, halo: 0 }); }
  for (const s of CLOTHES.spots) { bCl.add(GEO.cyl8, '#fff0d0', { x: s.x, y: s.y - 0.13, z: s.z, sx: 0.05, sy: 0.015, sz: 0.05 }); spotAt(lamps.clothes, { x: s.x, y: s.y - 0.2, z: s.z, color: '#fff0d0', pool: 1.8, gy: FY, halo: 0.2 }); } // (the track cans: their glass under the can)
  for (const lp of CLOTHES.pendants) { if (!M) ib.add(GEO.cone8, C.brass, { x: lp.x, y: lp.y + 0.1, z: lp.z, sx: 0.22, sy: 0.24, sz: 0.22 }); bCl.add(SPH, '#ffd9a0', { x: lp.x, y: lp.y, z: lp.z, sx: 0.06, sy: 0.07, sz: 0.06 }); spotAt(lamps.clothes, { x: lp.x, y: lp.y - 0.05, z: lp.z, color: '#ffd9a0', pool: 2.2, gy: FY, halo: 0.4 }); }
  { const lp = CLOTHES.nook.lamp; bCl.add(GEO.cyl8, '#ffe0a0', { x: lp.x, y: lp.h - 0.15, z: lp.z, sx: 0.15, sy: 0.22, sz: 0.15 }); spotAt(lamps.clothes, { x: lp.x, y: lp.h - 0.1, z: lp.z, color: '#ffe0a0', pool: 2.0, gy: FY, halo: 0.5 }); } // the nook's floor lamp: its shade glows
  { const cf = CLOTHES.campfire, fy = FY + 0.1; // the window's campfire (a shop prop): a flame over the model's logs, a tall orange tongue with a yellow heart before it and two licks, its glow flickering on the floor (threads-placement: it was a squashed orange ball, a flat disc from above)
    bCl.add(GEO.cone8, '#ff8a2a', { x: cf.x, y: fy + 0.2, z: cf.z - 0.03, sx: 0.14, sy: 0.4, sz: 0.14 });
    bCl.add(GEO.cone8, '#ffd24a', { x: cf.x, y: fy + 0.13, z: cf.z + 0.06, sx: 0.1, sy: 0.26, sz: 0.1 });
    bCl.add(GEO.cone8, '#ff8a2a', { x: cf.x - 0.13, y: fy + 0.1, z: cf.z + 0.05, sx: 0.07, sy: 0.2, sz: 0.07, rz: 0.35 });
    bCl.add(GEO.cone8, '#ff8a2a', { x: cf.x + 0.12, y: fy + 0.09, z: cf.z - 0.07, sx: 0.06, sy: 0.18, sz: 0.06, rz: -0.3, rx: 0.25 });
    spotAt(lamps.clothes, { x: cf.x, y: FY + 0.35, z: cf.z, color: '#ff9a3a', pool: 1.6, gy: FY, halo: 0.4, flicker: 0.4 }); }
  { const cr = CLOTHES.crate; bCl.add(GEO.box, '#ffd27a', { x: cr.x, y: FY + cr.s + 0.17, z: cr.z, sx: 0.118, sy: 0.24, sz: 0.118 }); spotAt(lamps.clothes, { x: cr.x, y: FY + cr.s + 0.3, z: cr.z, color: '#ffd27a', pool: 1.2, gy: FY, halo: 0.3 }); } // the lantern on the crate: its glass fills the model's open iron frame (between the corner posts, over the base plate, under the cap)
  { const d = PIZZA.dome, m0 = d.mouth; bPz.add(GEO.box, '#ff8a30', { x: d.x, y: m0.y + m0.h / 2, z: d.z - d.r - 0.035, sx: m0.w, sy: m0.h, sz: 0.02 }); spotAt(lamps.pizza, { x: d.x, y: m0.y + 0.3, z: d.z - d.r - 0.4, color: '#ff8a30', pool: 2.2, gy: FY, halo: 0.5, flicker: 0.5 }); } // the dome oven's fire in its mouth
  { const sg = CLOTHES.sign, m = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), new THREE.MeshBasicMaterial({ map: signFace('PEAK THREADS', 'OUTFITTERS  -  EST. THIS WEEK', '#9ad8ff'), transparent: true, fog: true })); m.position.set(sg.x, sg.y, sg.z - 0.06); m.rotation.y = Math.PI; m.name = 'strip-mall-name-board'; m.matrixAutoUpdate = false; m.updateMatrix(); inside.add(m); } // the name board over the cubbies
  for (const s of [...lamps.pizza, ...lamps.clothes]) { s.k = 0; s.day = 0; } // (the feature sets them by the hours)

  // ---------------------------------------------------------------- the parked cars, the bench, the bay lines
  for (const c of CARS) {
    const bx = LOT.bays[c.bay], Lc = carSpec(c.kind).L, z = LOT.maxZ - 0.55 - Lc / 2;
    addCarModel(bShell, bx, LOT.y, z, 0, c.kind, c.color);
    colliders.push({ type: 'box', minX: bx - 0.95, maxX: bx + 0.95, minZ: z - Lc / 2, maxZ: z + Lc / 2 });
  }
  for (let i = 0; i <= LOT.bays.length; i++) { const x = i < LOT.bays.length ? LOT.bays[i] - LOT.bayW / 2 : LOT.bays[i - 1] + LOT.bayW / 2; bShell.add(GEO.box, C.line, { x, y: LOT.y + 0.006, z: LOT.maxZ - LOT.bayD / 2 - 0.05, sx: 0.1, sy: 0.01, sz: LOT.bayD }); }
  { const B = L.bench;
    if (propsReady('bench_plank')) addProp(bShell, 'bench_plank', { x: B.x, y: WALK.y, z: B.z, yaw: B.yaw }, { skin: 'shop' });
    else { bShell.boxMinMax(B.x - 1.0, WALK.y + 0.22, B.z - 0.25, B.x + 1.0, WALK.y + 0.3, B.z + 0.25, '#8a6240'); for (const k of [-0.85, 0.85]) bShell.boxMinMax(B.x + k - 0.05, WALK.y, B.z - 0.2, B.x + k + 0.05, WALK.y + 0.22, B.z + 0.2, '#5a3c26'); }
    addBenchSeats(B.x, B.z, WALK.y + 0.3, B.yaw, 'shop bench'); }

  // ---------------------------------------------------------------- colliders and seats
  for (const c of colliderList()) colliders.push(c);
  const seats = PIZZA.seats.map(s => addSeat(s.x, s.z, s.y, s.yaw, 'pizza ' + s.kind, 'E  Sit', { front: s.front, back: s.back, table: s.table })); // (slice-seats: each body's back against the seat's back, the hands on the top)

  bShell.build(shell, 'strip-mall-shell'); bIn.build(inside, 'strip-mall-inside').forEach(m => { m.castShadow = false; });
  bOut.build(shell, 'strip-mall-bulbs-out'); bPz.build(inside, 'strip-mall-bulbs-pizza'); bCl.build(inside, 'strip-mall-bulbs-clothes');
  return { shell, inside, near, doors, glassU, glassReal, glassMeshes, glass: glassLit, signs, lamps, seats, model: !!M, replacedTris: NOPE.tris };
}
