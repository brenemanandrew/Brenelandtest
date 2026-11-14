// Kevin's Tool Crib, the building (tool-crib.js owns the feature, tool-crib-plan.js has every number). Outside: a general store
// kept by a 78-year-old, a bit worn and well loved: a weathered clapboard front with faded trim and a false front, a hand-painted
// sign a little crooked in faded gold, a covered boardwalk porch up two steps with a faded striped awning, a screen door with a
// bell, a display window of a few good products under its own little light (the other front window, the register's, looks straight
// into the shop: crib-window), window boxes of red geraniums, an old bench, a barrel of brooms and rakes, a coil of
// hose on a crate, a gumball machine, a gooseneck lamp over the door and two drop lights under the awning, his own little mailbox, a rack of boards on the east wall,
// a tin gable roof behind the false front. Inside: bits and bobs piled on the east wall's shelves, the pegboard of tools over a
// workbench, the paint wall, the spring table, the little counter with the brass register, the stair up to his loft.
//
// Clean geometry (the brief's addendum): every piece either sits on another or is buried a few millimetres into it, never a face
// in another's plane facing the same way (the coplanar check in tool-crib-test is clean), walls meet without gaps, the colliders
// are the shapes you see. One batch for the shell (always drawn) and one for the inside (drawn only near, or inside).
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { Batcher, GEO } from './batch.js';
import { addSurface as addSurfaceW } from './terrain.js';
import { toon, soft } from './toon.js';
import { LAMPS, GLASS, lampGlow, addNightSpot as addSpot, NIGHT_SPOTS } from './daynight-mats.js';
import { addBenchSeats } from './seats.js';
import { CRIB, toWorld, worldYaw, worldBox, worldCollider } from './tool-crib-plan.js';
import { CRIB_PAD } from './layout.js';
import { LUMBER_RACK } from './kevin-day.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { clutterOutside, clutterInside, clutterSigns } from './crib-clutter.js';
import { clutterMore } from './crib-more.js';
import { cribModel, cribMaterial, cribGeometry, cribGeometrySplit, cribAnchor, cribItem } from './crib-model.js';   // (crib-setpiece) the Blender set piece, when it loaded
import { realGlass, glassUniforms, createGlassView } from './real-glass.js';   // (crib-window) the display windows are real glass

// ---- colours (faded, warm, well loved)
const C = {
  board: '#dcc89c', boardDk: '#c9b386', lap: '#b9a276', trim: '#f2ebd8', trimDk: '#d8ccae', door: '#7a3b2e', porch: '#a08262', porchDk: '#6f5640', skirt: '#7a6048',
  roof: '#8b5a46', roofDk: '#6e4637', tin: '#9aa0a3', wood: '#a8804f', woodDk: '#5a3c26', woodMid: '#7a5232', pine: '#d9b47c', pineDk: '#c49a5e',
  plaster: '#efe1c0', wain: '#6e4a2f', floor: '#9a7350', plank: '#6b4a2b', ceil: '#d8b884', beam: '#7a5232', sign: '#24382f', gold: '#d8b25a',
  red: '#c0392b', green: '#3f7a4f', steel: '#9aa3ad', iron: '#3a3f47', brass: '#c9a23a', cream: '#f4ecd6', ink: '#2b2340',
};
const PAINTS = ['#e0463c', '#f08a3c', '#f0c24f', '#f6e9a8', '#7ddc7a', '#3f8a5a', '#6fd3ff', '#3f6fa8', '#2f3b6c', '#b48cff', '#ff8fb8', '#ffffff', '#c9b8a0', '#8a5a3a', '#4a4a50', '#a3282c', '#9ad8c4', '#e8c27a'];
const SPRING = ['#9aa3ad', '#c9a23a', '#b8733a', '#3a3f47', '#e0463c', '#3f8fd9', '#7ddc7a', '#e0b54a', '#c8ccd2', '#ff8fb8'];

// ---- the lamps: the shop's bulbs and the loft's are two materials (the loft can be lit with the shop shut), joined to daynight's
// lamp list so they are pale by day and burn at night; tool-crib.js dims each one's `base` when its lights are off
const BULBS = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); BULBS.name = 'crib-bulbs';
LAMPS.set('crib-bulbs', { mat: BULBS, base: new THREE.Color('#ffffff') });
const LOFT_BULBS = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); LOFT_BULBS.name = 'crib-bulbs-loft';
LAMPS.set('crib-bulbs-loft', { mat: LOFT_BULBS, base: new THREE.Color('#ffffff') });
class Bulbs {
  constructor(mat) { this.geos = []; this.c = new THREE.Color(); this.mat = mat; }
  add(geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.scale(sx, sy, sz); g.translate(x, y, z);
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
const SHOP_SPOTS = [], LOFT_SPOTS = [];
// (crib-move) everything here is drawn in the plan's own frame inside a group that is turned to the world (buildCrib); a lamp's
// night spot is a world position, so it goes through toWorld on its way to daynight's list
const addSpotW = s => { const [x, z] = toWorld(s.x, s.z); addSpot({ ...s, x, z }); };
const spot = (list, s) => { addSpotW(s); const o = NIGHT_SPOTS[NIGHT_SPOTS.length - 1]; list.push(o); return o; };

// A slab with rectangular holes along x (axis 'x': spans a0..a1 in x, thickness t0..t1 in z) or along z (spans a0..a1 in z,
// thickness t0..t1 in x). holes: [{ a0, a1, y0, y1 }] in the run's own coordinate
function holey(b, axis, a0, a1, t0, t1, y0, y1, holes, col) {
  const xs = [...new Set([a0, a1, ...holes.flatMap(h => [h.a0, h.a1])])].filter(v => v >= a0 && v <= a1).sort((p, q) => p - q);
  for (let i = 0; i < xs.length - 1; i++) {
    const p = xs[i], q = xs[i + 1], cut = holes.filter(h => h.a0 <= p + 1e-6 && h.a1 >= q - 1e-6).sort((m, n) => m.y0 - n.y0);
    let y = y0;
    for (const h of cut) { if (h.y0 > y && y < y1) piece(p, q, y, Math.min(h.y0, y1)); y = Math.max(y, h.y1); }
    if (y < y1) piece(p, q, y, y1);
  }
  function piece(p, q, ya, yb) { if (axis === 'x') b.boxMinMax(p, ya, t0, q, yb, t1, col); else b.boxMinMax(t0, ya, p, t1, yb, q, col); }
}
// Lap siding on a wall's outside face: rows of boards, each tilted so its lower edge stands proud (a shadow line under every
// board), cut round the openings. face: the wall's outer plane, out: +1 / -1 the way out
function siding(b, axis, a0, a1, face, out, y0, y1, holes, col) {
  // (the wall's own face is the boards; under each lap a thin darker shadow line, a flat strip 3 mm proud, cut round the
  // openings: flat, so the ink draws no edge along every board, which from the street was a field of dots)
  const RH = 0.21, LH = 0.024, LD = 0.003;
  for (let y = y0 + RH; y < y1 - 0.02; y += RH) {
    const cut = holes.filter(h => h.y0 < y + LH && h.y1 > y);
    const xs = [a0, a1, ...cut.flatMap(h => [h.a0, h.a1])].filter(v => v >= a0 && v <= a1).sort((p, q) => p - q);
    for (let i = 0; i < xs.length - 1; i++) {
      const p = xs[i], q = xs[i + 1];
      if (q - p < 0.02 || cut.some(h => h.a0 <= p + 1e-6 && h.a1 >= q - 1e-6)) continue;
      const pl = new THREE.PlaneGeometry(q - p, LH);
      if (axis === 'x') b.add(pl, C.lap, { x: (p + q) / 2, y: y + LH / 2, z: face + out * LD, ry: out < 0 ? Math.PI : 0 });
      else b.add(pl, C.lap, { x: face + out * LD, y: y + LH / 2, z: (p + q) / 2, ry: out * Math.PI / 2 });
      pl.dispose();
    }
  }
  void col;
}

// Floorboards along z: 0.19 m boards in three worn tones, each its own box (side by side, never a line drawn over them)
const FLOOR = ['#9a7350', '#a27b56', '#8f6a48'];
function planks(b, x0, x1, z0, z1, y) {
  for (let x = x0, i = 0; x < x1 - 1e-3; x += 0.19, i++) b.boxMinMax(x, y - 0.03, z0, Math.min(x1, x + 0.19), y, z1, FLOOR[(i * 7 + (i >> 2)) % 3]);
}
// A part at local (lx, lz) of something at (x, z) turned by yaw (lz toward where it faces)
const turn = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

// A helix spring along +y from y = 0, radius r, `turns` turns, wire w; one geometry per kind, scaled and placed per spring
function springGeo(turns, r, h, w, hooks) {
  const pts = [];
  const n = Math.round(turns * 7);
  if (hooks) pts.push(new THREE.Vector3(0, -0.4 * r, 0), new THREE.Vector3(r * 0.6, -0.15 * r, 0));
  for (let i = 0; i <= n; i++) { const a = i / n * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, i / n * h, Math.sin(a) * r)); }
  if (hooks) pts.push(new THREE.Vector3(r * 0.6, h + 0.15 * r, 0), new THREE.Vector3(0, h + 0.4 * r, 0));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, w, 3, false);
}
const SPRINGS = [springGeo(6, 0.5, 2.2, 0.07, false), springGeo(10, 0.5, 2.6, 0.06, true), springGeo(4, 0.5, 1.0, 0.09, false), springGeo(14, 0.5, 5, 0.05, true)];
const SPRING_H = [2.2, 2.6, 1.0, 5];   // (each kind's height, for the loose ones crib-springs.js draws)

// A schoolhouse pendant: a rod from the ceiling, a brass cap, a milk-glass globe (the bulb's glow)
function pendant(b, bulbs, x, z, y, top, glowCol = '#fff6dc') {
  b.add(GEO.cyl6, C.iron, { x, y: (y + 0.22 + top - 0.04) / 2, z, sx: 0.012, sy: top - 0.04 - y - 0.22, sz: 0.012 });
  b.add(GEO.cyl8, C.brass, { x, y: y + 0.24, z, sx: 0.06, sy: 0.08, sz: 0.06 });
  b.add(GEO.cyl12, C.brass, { x, y: y + 0.19, z, sx: 0.11, sy: 0.03, sz: 0.11 });
  bulbs.add(GEO.sphere, glowCol, { x, y, z, sx: 0.21, sy: 0.19, sz: 0.21 });
}

export function buildCrib(root, worldColliders) {
  const P = CRIB, { sx, gy, fy, T, PT, top, minX, maxX, minZ, maxZ, iMinX, iMaxX, iMinZ, iMaxZ, zL, zP, LY, stair: ST } = P;
  const g = new THREE.Group(); g.name = 'tool-crib'; root.add(g);
  // the plan's frame turned to face the way TOOL_CRIB.door says (tool-crib-plan.js, THE FRAME): a half turn about the middle
  if (P.flip) { g.rotation.y = Math.PI; g.position.set(2 * sx, 0, 2 * P.sz); g.updateMatrixWorld(true); }
  // the colliders are made in the plan's frame too (every piece pushes its own) and turned to the world at the end; the untouched
  // copies stay with the building for crib-springs.js, whose physics runs in the plan's frame
  const colliders = [];
  const addSurface = s => addSurfaceW(worldBox(s));
  // (crib-setpiece) the Blender set piece, when it loaded: the building's architecture and its piles come from the model (its parts
  // go into these same batches with its baked sheet as their material: the pieces the code still builds share the draw call), and
  // the code's own versions of those pieces are built into NOPE, a batcher that only counts what it was handed (the fallback is
  // the whole old building, so nothing is deleted: a line routed to `sb` / `ab` is a piece the model has)
  const M = cribModel();
  const NOPE = { tris: 0, add(geo) { NOPE.tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; return NOPE; }, boxMinMax() { NOPE.tris += 12; return NOPE; }, build() { return []; } };
  const b = new Batcher({ vertexColors: true, material: M ? cribMaterial('shell') : null });   // the shell and everything outside
  const sb = M ? NOPE : b;                                      // the shell's architecture (the model has it)
  let awningMesh = null;
  if (M) {
    // (crib-window) the awning is cut out of the shell and drawn as its own mesh casting no shadow (Andrew: the front under it was too
    // dark, by day and at night): the porch boards and the wall under it are sunlit, the awning itself is shaded as before
    const aw = cribAnchor('awning');
    if (aw && aw.box) {
      const sp = cribGeometrySplit('shell', [aw.box]);
      b.add(sp.main, '#ffffff', {});
      awningMesh = new THREE.Mesh(sp.split, cribMaterial('shell')); awningMesh.name = 'tool-crib-awning'; awningMesh.castShadow = false; awningMesh.receiveShadow = true;
      awningMesh.matrixAutoUpdate = false; awningMesh.updateMatrix(); awningMesh.geometry.computeBoundingSphere(); g.add(awningMesh);
    } else b.add(cribGeometry('shell'), '#ffffff', {});
    for (let i = 0; i < 4; i++) { const a = cribAnchor('post' + i); if (a) colliders.push({ type: 'circle', x: a.pos[0], z: a.pos[2], r: a.r || 0.12 }); }   // porch posts, if the model has any (crib-front: the awning hangs on wall brackets, so none; kept for a model that has them)
    const lt = cribAnchor('leanto'); if (lt) colliders.push({ type: 'box', minX: lt.box[0], maxX: lt.box[3], minZ: lt.box[2], maxZ: lt.box[5] });   // the lean-to shed
  }
  const glassShop = GLASS[3].clone(); glassShop.name = 'crib-glass-shop';     // the high front windows (lit while the shop is)
  const glassLoft = GLASS[3].clone(); glassLoft.name = 'crib-glass-loft';     // the loft's (lit while his lamp is)
  // (crib-window) the display windows are real glass (real-glass.js, the houses' and the game store's program): see-through near the
  // crib (tool-crib.js's glass view; from the street you look through the register's window at Kevin and the register, from inside you
  // look out), the shop's lit pane far off (tool-crib.js copies the hour's colours into it with the high windows')
  const glassU = glassUniforms(), glassReal = realGlass(GLASS[3].clone(), glassU, 'crib-glass-display+real'), glassMeshes = [];
  const out = new Bulbs(lampGlow('#fff3c4'));                     // (the porch lamp: a town lamp's own glow)

  // ------------------------------------------------------------ surfaces: the floor, the porch, the steps, the stair, the loft
  addSurface({ minX, maxX, minZ, maxZ, y: fy, sound: 'wood' });
  addSurface({ ...P.porch, sound: 'wood' });
  for (const s of P.steps) addSurface({ ...s, sound: 'wood' });
  for (let i = 0; i < ST.n; i++) addSurface({ minX: ST.minX, maxX: ST.maxX, minZ: ST.z0 + i * ST.tread, maxZ: ST.z0 + (i + 1) * ST.tread, y: fy + (i + 1) * ST.rise, sound: 'wood' });
  addSurface({ minX: iMinX, maxX: iMaxX, minZ: zP, maxZ: iMaxZ, y: LY, sound: 'wood', deck: true }); // a deck: the stockroom is under it

  // ------------------------------------------------------------ the shell
  const z0 = minZ, z1 = minZ + T, H0 = gy - 0.04;
  const DOOR = { a0: P.door.x0, a1: P.door.x1, y0: H0, y1: P.door.y1 };
  const WIN = P.win, UP = P.upper;
  // the walls' cores (the colour you see at the openings' reveals), the siding over them outside
  holey(sb, 'x', minX, maxX, z0, z1, H0, top, [DOOR, ...WIN, ...UP], C.board);
  holey(sb, 'z', minZ + T, maxZ - T, minX, minX + T, H0, top, [], C.board);
  const RU = P.rollup, RUH = { a0: RU.z0, a1: RU.z1, y0: fy, y1: RU.y1 };   // (crib-clutter: the roll-up door's opening)
  holey(sb, 'z', minZ + T, maxZ - T, maxX - T, maxX, H0, top, [P.eastWin, RUH], C.board);
  const BD = { a0: sx - 4.3, a1: sx - 3.3, y0: H0, y1: fy + 2.1 };   // the stockroom's back door (shut, outside only)
  holey(sb, 'x', minX, maxX, maxZ - T, maxZ, H0, top, [P.backWin, BD], C.board);
  const sideY0 = gy + 0.42; // (a stone footing under the siding)
  siding(sb, 'x', minX, maxX, z0, -1, fy + 0.02, top + 1.2, [{ ...DOOR, a0: DOOR.a0 - 0.12, a1: DOOR.a1 + 0.12 }, ...WIN.map(w => ({ ...w, a0: w.a0 - 0.12, a1: w.a1 + 0.12, y0: w.y0 - 0.16 })), ...UP.map(w => ({ ...w, a0: w.a0 - 0.1, a1: w.a1 + 0.1, y0: w.y0 - 0.1, y1: w.y1 + 0.12 }))], C.board);
  siding(sb, 'z', minZ + 0.11, maxZ - 0.11, minX, -1, sideY0, top, [], C.board);
  siding(sb, 'z', minZ + 0.11, maxZ - 0.11, maxX, 1, sideY0, top, [{ ...P.eastWin, a0: P.eastWin.a0 - 0.1, a1: P.eastWin.a1 + 0.1, y0: P.eastWin.y0 - 0.12, y1: P.eastWin.y1 + 0.14 }, { a0: RU.z0 - 0.12, a1: RU.z1 + 0.12, y0: H0, y1: RU.y1 + 0.16 }], C.board);
  siding(sb, 'x', minX + 0.11, maxX - 0.11, maxZ, 1, sideY0, top, [{ ...P.backWin, a0: P.backWin.a0 - 0.1, a1: P.backWin.a1 + 0.1, y0: P.backWin.y0 - 0.12, y1: P.backWin.y1 + 0.14 }, { ...BD, a0: BD.a0 - 0.1, a1: BD.a1 + 0.1, y1: BD.y1 + 0.14 }], C.board);
  // the stone footing round the sides and back (the porch covers the front's)
  sb.boxMinMax(minX - 0.05, H0, minZ + 0.06, minX + 0.02, sideY0 + 0.02, maxZ + 0.05, '#a8a297');
  sb.boxMinMax(maxX - 0.02, H0, minZ + 0.06, maxX + 0.05, sideY0 + 0.02, RU.z0 - 0.13, '#a8a297');   // (either side of the roll-up door)
  sb.boxMinMax(maxX - 0.02, H0, RU.z1 + 0.13, maxX + 0.05, sideY0 + 0.02, maxZ + 0.05, '#a8a297');
  sb.boxMinMax(minX + 0.02, H0, maxZ - 0.02, maxX - 0.02, sideY0 + 0.02, maxZ + 0.05, '#a8a297');
  // corner boards (over the siding's ends), the frieze under the eaves
  for (const [x, zz] of [[minX, z0], [maxX, z0], [minX, maxZ], [maxX, maxZ]]) {
    const ox = x < sx ? -1 : 1, oz = zz < P.sz ? -1 : 1, ya = zz === z0 ? fy - 0.02 : sideY0 - 0.04, yb = zz === z0 ? top + 1.2 : top, CB = 0.17, CT = 0.06;
    // one board on each face, the front-back one lapping over the side one's edge
    sb.boxMinMax(Math.min(x + ox * CT, x - ox * CB), ya, Math.min(zz, zz + oz * CT), Math.max(x + ox * CT, x - ox * CB), yb, Math.max(zz, zz + oz * CT), C.trim);
    sb.boxMinMax(Math.min(x, x + ox * (CT - 0.004)), ya, Math.min(zz - oz * 0.0, zz - oz * CB), Math.max(x, x + ox * (CT - 0.004)), yb - 0.004, Math.max(zz, zz - oz * CB), C.trim);
  }
  sb.boxMinMax(minX - 0.045, top - 0.28, minZ + 0.2, minX, top - 0.004, maxZ - 0.2, C.trim);   // (against the walls, a hair under their tops)
  sb.boxMinMax(maxX, top - 0.28, minZ + 0.2, maxX + 0.045, top - 0.004, maxZ - 0.2, C.trim);
  sb.boxMinMax(minX + 0.2, top - 0.28, maxZ, maxX - 0.2, top - 0.004, maxZ + 0.045, C.trim);

  // -- the false front over the roof: the front wall carried up, a raised middle for the sign, a cornice on top
  const FF = top + 1.2, FM = top + 1.95;
  holey(sb, 'x', minX, maxX, z0, z1, top, FF, [], C.board);
  sb.boxMinMax(sx - 3.7, FF, z0, sx + 3.7, FM, z1, C.board);
  siding(sb, 'x', sx - 3.7, sx + 3.7, z0, -1, FF - 0.01, FM, [], C.board);
  sb.boxMinMax(minX - 0.16, FF, z0 - 0.16, sx - 3.7, FF + 0.12, z1 + 0.05, C.trim);      // the caps
  sb.boxMinMax(sx + 3.7, FF, z0 - 0.16, maxX + 0.16, FF + 0.12, z1 + 0.05, C.trim);
  sb.boxMinMax(sx - 3.9, FM, z0 - 0.2, sx + 3.9, FM + 0.14, z1 + 0.06, C.trim);
  sb.boxMinMax(sx - 3.85, FM - 0.12, z0 - 0.13, sx + 3.85, FM + 0.003, z0 - 0.02, C.trimDk);  // (under the cap, proud of the siding)
  for (const k of [-1, 1]) sb.boxMinMax(sx + k * 3.7 - 0.11, FF + 0.12, z0 - 0.1, sx + k * 3.7 + 0.11, FM, z0 + 0.03, C.trim);
  // the sign's board (the hand-painted face is its own plane, tool-crib.js): dark green, a cream rim
  const SGN = { x0: sx - 3.25, x1: sx + 3.25, y0: top + 0.12, y1: top + 1.62 };
  sb.boxMinMax(SGN.x0 - 0.08, SGN.y0 - 0.08, z0 - 0.07, SGN.x1 + 0.08, SGN.y1 + 0.08, z0 - 0.02, C.trimDk);
  sb.boxMinMax(SGN.x0, SGN.y0, z0 - 0.09, SGN.x1, SGN.y1, z0 - 0.06, C.sign);
  // -- the openings' trim: casings, sills, heads (each reaching 3 mm into its opening, never level with the wall's cut)
  const casing = (w, sill) => {
    sb.boxMinMax(w.a0 - 0.12, w.y1 - 0.003, z0 - 0.07, w.a1 + 0.12, w.y1 + 0.15, z0 + 0.012, C.trim);
    sb.boxMinMax(w.a0 - 0.15, w.y1 + 0.15, z0 - 0.1, w.a1 + 0.15, w.y1 + 0.19, z0 + 0.012, C.trimDk);
    sb.boxMinMax(w.a0 - 0.1, w.y0, z0 - 0.06, w.a0 + 0.003, w.y1, z0 + 0.012, C.trim);
    sb.boxMinMax(w.a1 - 0.003, w.y0, z0 - 0.06, w.a1 + 0.1, w.y1, z0 + 0.012, C.trim);
    if (sill) sb.boxMinMax(w.a0 - 0.15, w.y0 - 0.08, z0 - 0.12, w.a1 + 0.15, w.y0 + 0.003, z0 + 0.012, C.trim);
  };
  for (const w of WIN) casing(w, true);
  for (const w of UP) casing(w, true);
  casing({ ...DOOR, y0: fy }, false);
  // the display windows' glass (a thin real-glass pane each, its edges 3 mm into the casing) and their sashes: a transom row
  for (const w of WIN) {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(w.a1 - w.a0 + 0.006, w.y1 - w.y0 + 0.006, 0.02), glassReal);
    gl.position.set((w.a0 + w.a1) / 2, (w.y0 + w.y1) / 2, z0 + 0.06); gl.name = 'crib-display-glass'; gl.renderOrder = 2; gl.castShadow = false; gl.userData.noMerge = true;
    gl.matrixAutoUpdate = false; gl.updateMatrix(); g.add(gl); glassMeshes.push(gl);
    const ty = w.y1 - 0.42;
    sb.boxMinMax(w.a0 + 0.003, ty - 0.03, z0 + 0.04, w.a1 - 0.003, ty + 0.03, z0 + 0.09, C.trim);
    for (let k = 1; k < 4; k++) { const x = w.a0 + (w.a1 - w.a0) * k / 4; sb.boxMinMax(x - 0.025, ty + 0.03, z0 + 0.04, x + 0.025, w.y1 - 0.003, z0 + 0.09, C.trim); }
  }
  for (const w of UP) { // the high windows: lit glass, a cross of bars
    b.add(GEO.box, glassShop, { x: (w.a0 + w.a1) / 2, y: (w.y0 + w.y1) / 2, z: z0 + 0.1, sx: w.a1 - w.a0, sy: w.y1 - w.y0, sz: 0.06 });
    sb.boxMinMax((w.a0 + w.a1) / 2 - 0.025, w.y0 + 0.003, z0 + 0.04, (w.a0 + w.a1) / 2 + 0.025, w.y1 - 0.003, z0 + 0.07, C.trim);
    sb.boxMinMax(w.a0 + 0.003, (w.y0 + w.y1) / 2 - 0.025, z0 + 0.04, w.a1 - 0.003, (w.y0 + w.y1) / 2 + 0.025, z0 + 0.07, C.trim);
  }
  // the loft's windows (east wall, back wall): lit glass while his lamp is on, sashes, trim, flower box under the back one
  {
    const E = P.eastWin, Bw = P.backWin;
    b.add(GEO.box, glassLoft, { x: maxX - 0.1, y: (E.y0 + E.y1) / 2, z: (E.a0 + E.a1) / 2, sx: 0.06, sy: E.y1 - E.y0, sz: E.a1 - E.a0 });
    sb.boxMinMax(maxX - 0.11, (E.y0 + E.y1) / 2 - 0.025, E.a0 + 0.003, maxX - 0.04, (E.y0 + E.y1) / 2 + 0.025, E.a1 - 0.003, C.trim);
    sb.boxMinMax(maxX - 0.012, E.y1 - 0.003, E.a0 - 0.12, maxX + 0.07, E.y1 + 0.15, E.a1 + 0.12, C.trim);
    sb.boxMinMax(maxX - 0.012, E.y0 - 0.08, E.a0 - 0.14, maxX + 0.12, E.y0 + 0.003, E.a1 + 0.14, C.trim);
    for (const z of [E.a0, E.a1]) sb.boxMinMax(maxX - 0.012, E.y0, z - (z === E.a0 ? 0.1 : 0.003), maxX + 0.06, E.y1, z + (z === E.a0 ? 0.003 : 0.1), C.trim);
    b.add(GEO.box, glassLoft, { x: (Bw.a0 + Bw.a1) / 2, y: (Bw.y0 + Bw.y1) / 2, z: maxZ - 0.1, sx: Bw.a1 - Bw.a0, sy: Bw.y1 - Bw.y0, sz: 0.06 });
    sb.boxMinMax((Bw.a0 + Bw.a1) / 2 - 0.025, Bw.y0 + 0.003, maxZ - 0.11, (Bw.a0 + Bw.a1) / 2 + 0.025, Bw.y1 - 0.003, maxZ - 0.04, C.trim);
    sb.boxMinMax(Bw.a0 - 0.12, Bw.y1 - 0.003, maxZ - 0.012, Bw.a1 + 0.12, Bw.y1 + 0.15, maxZ + 0.07, C.trim);
    sb.boxMinMax(Bw.a0 - 0.14, Bw.y0 - 0.08, maxZ - 0.012, Bw.a1 + 0.14, Bw.y0 + 0.003, maxZ + 0.12, C.trim);
    for (const x of [Bw.a0, Bw.a1]) sb.boxMinMax(x - (x === Bw.a0 ? 0.1 : 0.003), Bw.y0, maxZ - 0.012, x + (x === Bw.a0 ? 0.003 : 0.1), Bw.y1, maxZ + 0.06, C.trim);
    // the stockroom's back door, shut: a plain panelled door, a step, a lamp-less hood
    sb.boxMinMax(BD.a0 + 0.003, BD.y0 + 0.02, maxZ - 0.12, BD.a1 - 0.003, BD.y1 - 0.003, maxZ - 0.05, '#6b4a2b');
    sb.boxMinMax(BD.a0 + 0.12, BD.y0 + 0.35, maxZ - 0.055, BD.a1 - 0.12, BD.y0 + 0.95, maxZ - 0.035, '#5a3c26');
    sb.boxMinMax(BD.a0 + 0.12, BD.y0 + 1.15, maxZ - 0.055, BD.a1 - 0.12, BD.y1 - 0.2, maxZ - 0.035, '#5a3c26');
    sb.add(GEO.sphere, C.brass, { x: BD.a1 - 0.12, y: BD.y0 + 1.0, z: maxZ - 0.02, sx: 0.035, sy: 0.035, sz: 0.035 });
    for (const x of [BD.a0, BD.a1]) sb.boxMinMax(x - (x === BD.a0 ? 0.1 : 0.003), H0, maxZ - 0.012, x + (x === BD.a0 ? 0.003 : 0.1), BD.y1, maxZ + 0.06, C.trim);
    sb.boxMinMax(BD.a0 - 0.12, BD.y1 - 0.003, maxZ - 0.012, BD.a1 + 0.12, BD.y1 + 0.15, maxZ + 0.07, C.trim);
    sb.boxMinMax(BD.a0 - 0.3, gy - 0.02, maxZ + 0.07, BD.a1 + 0.3, gy + 0.16, maxZ + 0.55, '#bdb3a0');
    colliders.push({ type: 'box', minX: BD.a0 - 0.3, maxX: BD.a1 + 0.3, minZ: maxZ, maxZ: maxZ + 0.55, maxY: gy + 0.3 });
  }

  // -- the roof: a tin gable behind the false front (the ridge front to back), a little overhang, a ridge cap
  {
    const ex = 0.35, w2 = (maxX - minX) / 2 + ex, rise = 1.55, run = (maxX - minX) / 2 + ex, slope = Math.atan2(rise, run), len = Math.hypot(rise, run);
    const zA = z1 + 0.003, zB = maxZ + 0.35, zm = (zA + zB) / 2, zl = zB - zA;
    for (const s of [-1, 1]) {
      sb.add(GEO.box, C.roof, { x: sx + s * w2 / 2, y: top + rise / 2 - 0.12 * Math.cos(slope) + 0.04, z: zm, sx: len + 0.02, sy: 0.12, sz: zl, rz: -s * slope });
      // the standing seams of the tin, every 0.55 m
      for (let k = 0.3; k < len - 0.1; k += 0.55) { const d = (len - k) / len; sb.add(GEO.box, C.roofDk, { x: sx + s * w2 * d - s * 0.0, y: top - 0.08 + rise * (1 - d) + 0.1, z: zm, sx: 0.035, sy: 0.04, sz: zl - 0.01, rz: -s * slope }); }
    }
    sb.add(GEO.box, C.tin, { x: sx, y: top + rise + 0.03, z: zm, sx: 0.32, sy: 0.08, sz: zl + 0.02 });
    // the back gable's triangle (the front one is behind the false front)
    const tri = new THREE.Shape([new THREE.Vector2(-(maxX - minX) / 2 + 0.01, 0), new THREE.Vector2((maxX - minX) / 2 - 0.01, 0), new THREE.Vector2(0, rise * ((maxX - minX) / 2) / run)]);
    for (const [z, d] of [[maxZ - T + 0.01, T - 0.02], [z1 + 0.01, 0.3]]) sb.add(new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false }), C.board, { x: sx, y: top - 0.003, z });
    // a stovepipe for the loft's little stove, with its rain cap
    const px = iMaxX - 0.6, pz = zL + 0.35;
    sb.add(GEO.cyl8, C.iron, { x: px, y: top + 1.1, z: pz, sx: 0.09, sy: 1.6, sz: 0.09 });
    sb.add(GEO.cone8, C.iron, { x: px, y: top + 2.0, z: pz, sx: 0.2, sy: 0.16, sz: 0.2 });
  }

  // -- the porch: boards across the front on a skirt, two steps, the awning, the lamp
  {
    const Pp = P.porch;
    sb.boxMinMax(Pp.minX + 0.02, gy - 0.02, Pp.minZ + 0.02, Pp.maxX - 0.02, fy - 0.07, Pp.maxZ - 0.006, C.porchDk);  // (the dark under the boards)
    for (let zz = Pp.minZ, i = 0; zz < Pp.maxZ - 0.01; zz += 0.21, i++) sb.boxMinMax(Pp.minX, fy - 0.07, zz, Pp.maxX, fy, Math.min(Pp.maxZ - 0.003, zz + 0.21), ['#a08262', '#9a7c5c', '#a68867'][i % 3]);
    sb.boxMinMax(Pp.minX - 0.03, gy - 0.03, Pp.minZ - 0.04, Pp.maxX + 0.03, fy - 0.075, Pp.minZ + 0.02, C.skirt);               // the skirt board
    for (const x of [Pp.minX, Pp.maxX]) sb.boxMinMax(x - 0.03, gy - 0.03, Pp.minZ - 0.04, x + 0.03, fy - 0.075, Pp.maxZ, C.skirt);
    P.steps.forEach((s, i) => {
      sb.boxMinMax(s.minX, gy - 0.04, s.minZ, s.maxX, s.y - 0.03, s.maxZ + (i ? -0.004 : 0.003), C.porchDk);
      sb.boxMinMax(s.minX - 0.02, s.y - 0.03, s.minZ - 0.03, s.maxX + 0.02, s.y, s.maxZ - (i ? 0.006 : 0.004), C.porch);
    });
    // (crib-move) a paved walk from the foot of the steps to the sidewalk, like the post office's beside it (the sidewalk's back
    // edge in the plan's frame: the world's -134 since the crib faces south, -119 facing north), a stone a metre, a surface
    { const wz = toWorld(0, P.flip ? -134 : -119)[1], z0 = Math.min(wz, P.steps[0].minZ), z1 = Math.max(wz, P.steps[0].minZ) + 0.02, WY = 0.44;
      b.boxMinMax(sx - 1.25, gy - 0.05, z0, sx + 1.25, WY, z1, '#cdbfa6');
      for (let z = z0 + 0.9; z < z1 - 0.3; z += 0.9) b.boxMinMax(sx - 1.2, WY + 0.001, z - 0.02, sx + 1.2, WY + 0.005, z + 0.02, '#b3a58c');
      addSurface({ minX: sx - 1.25, maxX: sx + 1.25, minZ: z0, maxZ: z1, y: WY, sound: 'stone' }); }
    // the awning: faded stripes on two iron arms, a scalloped valance
    const ay0 = fy + 3.05, ay1 = fy + 2.55, az1 = Pp.minZ + 0.2, aw = maxX - minX - 0.3, nS = 16, dz = z0 - az1, al = Math.hypot(dz, ay0 - ay1), ang = Math.atan2(ay0 - ay1, dz);
    for (let i = 0; i < nS; i++) {
      const ax = minX + 0.15 + (i + 0.5) * aw / nS, col = i % 2 ? '#efe6d0' : '#8fae95';
      sb.add(GEO.box, col, { x: ax, y: (ay0 + ay1) / 2, z: (z0 + az1) / 2, sx: aw / nS, sy: 0.04, sz: al, rx: -ang });
      sb.add(GEO.box, col, { x: ax, y: ay1 - 0.13, z: az1 - 0.02, sx: aw / nS, sy: 0.26, sz: 0.025 });
      sb.add(GEO.cyl8, col, { x: ax, y: ay1 - 0.26, z: az1 - 0.02, sx: aw / nS / 2.2, sy: 0.024, sz: aw / nS / 2.2, rx: Math.PI / 2 });
    }
    for (const x of [minX + 0.5, maxX - 0.5, sx - 1.5, sx + 1.5]) sb.add(GEO.cyl6, C.iron, { x, y: (ay0 - 0.55 + ay1 + 0.02) / 2, z: (z0 + az1) / 2 + 0.05, sx: 0.016, sy: Math.hypot(z0 - az1, ay0 - 0.55 - ay1) , sz: 0.016, rx: Math.atan2(z0 - az1, ay0 - 0.55 - ay1 - 0.02) });
    // the gooseneck lamp over the door, under the awning: its light on the porch
    const lx = sx, ly = P.door.y1 + 0.42;
    sb.boxMinMax(lx - 0.06, ly - 0.05, z0 - 0.035, lx + 0.06, ly + 0.2, z0 + 0.01, C.iron);
    sb.add(GEO.cyl6, C.iron, { x: lx, y: ly + 0.1, z: z0 - 0.17, sx: 0.025, sy: 0.28, sz: 0.025, rx: Math.PI / 2 });
    sb.add(GEO.cone8, '#3f6b52', { x: lx, y: ly + 0.05, z: z0 - 0.33, sx: 0.24, sy: 0.14, sz: 0.24 });
    out.add(GEO.sphere, '#fff3c4', { x: lx, y: ly - 0.03, z: z0 - 0.33, sx: 0.09, sy: 0.06, sz: 0.09 });
    addSpotW({ x: lx, y: ly - 0.2, z: z0 - 0.75, color: '#ffe0a0', pool: 2.6, gy: fy, halo: 0 });
    // (crib-window) two drop lights clamped to the awning's arms over the display windows (the model has their clamps, cords and green
    // shades: anchors awning-lamp0..1 at the bulbs): a bulb each and a pool on the boards like the gooseneck's, so the whole porch glows at night
    for (let i = 0; i < 2; i++) {
      const a = cribAnchor('awning-lamp' + i); if (!a) continue;
      out.add(GEO.sphere, '#fff3c4', { x: a.pos[0], y: a.pos[1], z: a.pos[2], sx: 0.09, sy: 0.06, sz: 0.09 });
      addSpotW({ x: a.pos[0], y: a.pos[1] - 0.2, z: a.pos[2], color: '#ffe0a0', pool: 2.4, gy: fy, halo: 0 });
    }
    // the bell over the screen door (it rings: tool-crib.js), on a curled bracket inside the head
    sb.add(GEO.cone8, C.brass, { x: P.door.x1 - 0.18, y: P.door.y1 - 0.12, z: z1 + 0.09, sx: 0.06, sy: 0.07, sz: 0.06 });
    sb.add(GEO.box, C.iron, { x: P.door.x1 - 0.18, y: P.door.y1 - 0.04, z: z1 + 0.05, sx: 0.02, sy: 0.08, sz: 0.1 });
  }
  // -- out front: the bench, the barrel of brooms and rakes, the hose on a crate, the gumball machine, geraniums, the mailbox
  {
    const bx = sx - 3.1, bz = z0 - 0.62, by = fy + 0.3; // (house-scale: out from under the window box, which it stood in; seat-height: 0.3 high, was 0.45)
    if (propsReady('bench_plank')) addProp(b, 'bench_plank', { x: bx, y: fy, z: bz, yaw: Math.PI, sx: 1.1 }, { skin: 'crib' }); // (props-static: in the plan's frame like the rest; 2 m long as before)
    else {
    b.boxMinMax(bx - 1.0, by - 0.05, bz - 0.2, bx + 1.0, by, bz + 0.2, '#7d6a52');
    b.boxMinMax(bx - 1.0, by + 0.18, bz + 0.18, bx + 1.0, by + 0.5, bz + 0.24, '#7d6a52');
    for (const k of [-0.88, 0.88]) { b.boxMinMax(bx + k - 0.04, fy, bz - 0.17, bx + k + 0.04, by - 0.05, bz - 0.09, C.woodDk); b.boxMinMax(bx + k - 0.04, fy, bz + 0.12, bx + k + 0.04, by + 0.18, bz + 0.21, C.woodDk); } // (the back legs 1 cm proud of the seat's back edge: no coplanar faces now the bench is out in view)
    }
    { const [wx, wz] = toWorld(bx, bz - 0.09); addBenchSeats(wx, wz, by, worldYaw(Math.PI), 'Tool Crib bench', 0.42, { front: 0.11 }); } // (front: the seat's front edge 0.11 in front of the spot, seats.js seatFit fits each body to it) // (the knees just past the front edge: house-scale; a seat is a world spot)
    colliders.push({ type: 'box', minX: bx - 1.05, maxX: bx + 1.05, minZ: bz - 0.25, maxZ: z0 });
    // the barrel: staves, two hoops, brooms (bristles up) and a couple of rakes
    const rx = sx + 1.45, rz = z0 - 0.42;
    b.add(GEO.cyl12, '#8a6240', { x: rx, y: fy + 0.38, z: rz, sx: 0.3, sy: 0.76, sz: 0.3 });
    for (const y of [0.12, 0.64]) b.add(GEO.cyl12, C.iron, { x: rx, y: fy + y, z: rz, sx: 0.31, sy: 0.05, sz: 0.31 });
    b.add(GEO.cyl12, '#4a3526', { x: rx, y: fy + 0.762, z: rz, sx: 0.27, sy: 0.006, sz: 0.27 });
    [[0.08, 0.06, -0.14, 0.12, 'broom'], [-0.1, 0.05, 0.12, -0.1, 'broom'], [0.12, -0.1, 0.08, 0.15, 'rake'], [-0.06, -0.11, -0.1, -0.12, 'rake'], [0.0, 0.12, 0.03, 0.02, 'broom']].forEach(([ox, oz, lx, lz, k], i) => {
      const hx = rx + ox, hz = rz + oz, L = 1.42 + i * 0.045, tx = lx * 0.3, tz = lz * 0.3, ang2 = Math.atan2(Math.hypot(tx, tz), L), ry = Math.atan2(tx, tz);
      const cx = hx + tx / 2, cz = hz + tz / 2, cy = fy + 0.15 + L / 2;
      b.add(GEO.cyl6, '#c9a26b', { x: cx, y: cy, z: cz, sx: 0.018, sy: L, sz: 0.018, rx: ang2, ry });
      const ex = hx + tx, ez = hz + tz, ey = fy + 0.15 + L;
      if (k === 'broom') b.add(GEO.cone6, i % 2 ? '#d8b45a' : '#c99a4a', { x: ex, y: ey + 0.14, z: ez, sx: 0.12, sy: 0.32, sz: 0.06, ry, rz: Math.PI });
      else { b.add(GEO.box, C.steel, { x: ex, y: ey + 0.02, z: ez, sx: 0.34, sy: 0.03, sz: 0.03, ry }); for (let t = -3; t <= 3; t++) { const [tx2, tz2] = turn(ex, ez, ry, t * 0.05, 0); b.add(GEO.box, C.steel, { x: tx2, y: ey + 0.08, z: tz2, sx: 0.012, sy: 0.1, sz: 0.012 }); } }
    });
    colliders.push({ type: 'circle', x: rx, z: rz, r: 0.36 });
    // the hose: a green coil on an upturned crate
    const hx = sx + 2.2, hz = z0 - 0.38;
    b.boxMinMax(hx - 0.27, fy, hz - 0.22, hx + 0.27, fy + 0.4, hz + 0.22, '#b98a5a');
    for (let k = 0; k < 3; k++) b.boxMinMax(hx - 0.275, fy + 0.06 + k * 0.12, hz - 0.225, hx + 0.275, fy + 0.1 + k * 0.12, hz + 0.225, '#a07850');
    for (let k = 0; k < 4; k++) b.add(new THREE.TorusGeometry(0.2 - k * 0.012, 0.025, 5, 16), '#3f8a3f', { x: hx, y: fy + 0.43 + k * 0.045, z: hz, rx: Math.PI / 2 });
    colliders.push({ type: 'box', minX: hx - 0.3, maxX: hx + 0.3, minZ: hz - 0.25, maxZ: z0 });
    // the gumball machine: a red stand, a globe of gumballs, a chrome cap and coin slot
    const gx = sx - 1.55, gz = z0 - 0.4;
    b.add(GEO.cyl8, '#c0392b', { x: gx, y: fy + 0.45, z: gz, sx: 0.06, sy: 0.9, sz: 0.06 });
    b.add(GEO.cyl8, '#c0392b', { x: gx, y: fy + 0.02, z: gz, sx: 0.2, sy: 0.04, sz: 0.2 });
    b.add(GEO.box, '#c0392b', { x: gx, y: fy + 0.98, z: gz, sx: 0.24, sy: 0.18, sz: 0.24 });
    b.add(GEO.box, C.steel, { x: gx, y: fy + 0.98, z: gz - 0.122, sx: 0.08, sy: 0.08, sz: 0.012 });
    for (let i = 0; i < 26; i++) { const a = i * 2.39996, r = 0.13 * Math.sqrt((i + 0.5) / 26), y = fy + 1.1 + (i % 5) * 0.045 + 0.02; b.add(GEO.ico0, ['#e0463c', '#f0c24f', '#3f8fd9', '#7ddc7a', '#ff8fb8', '#ffffff'][i % 6], { x: gx + Math.cos(a) * r, y, z: gz + Math.sin(a) * r, sx: 0.04, sy: 0.04, sz: 0.04 }); }
    b.add(GEO.cyl12, '#c0392b', { x: gx, y: fy + 1.37, z: gz, sx: 0.12, sy: 0.05, sz: 0.12 });
    b.add(new THREE.TorusGeometry(0.17, 0.01, 4, 20), C.steel, { x: gx, y: fy + 1.2, z: gz, rx: Math.PI / 2 });
    colliders.push({ type: 'circle', x: gx, z: gz, r: 0.24 });
    // window boxes of geraniums under the display windows, and two pots by the steps
    for (const w of WIN) {
      b.boxMinMax(w.a0 + 0.05, fy + 0.38, z0 - 0.32, w.a1 - 0.05, fy + 0.62, z0 - 0.06, '#8a5a3a');
      b.boxMinMax(w.a0 + 0.08, fy + 0.6, z0 - 0.29, w.a1 - 0.08, fy + 0.625, z0 - 0.09, '#4a3526');
      for (const k of [0.25, 0.75]) b.add(GEO.box, C.iron, { x: w.a0 + (w.a1 - w.a0) * k, y: fy + 0.3, z: z0 - 0.15, sx: 0.04, sy: 0.18, sz: 0.2 });
      for (let i = 0; i < 9; i++) { const x = w.a0 + 0.25 + i * (w.a1 - w.a0 - 0.5) / 8; b.add(GEO.ico1, i % 2 ? '#3f8a3f' : '#4a9a45', { x, y: fy + 0.7, z: z0 - 0.19, sx: 0.16, sy: 0.12, sz: 0.13, ry: i }); if (i % 2 === 0) b.add(GEO.ico0, i % 4 ? '#e0463c' : '#f05a6a', { x: x + 0.03, y: fy + 0.82, z: z0 - 0.2, sx: 0.07, sy: 0.06, sz: 0.07 }); }
    }
    for (const k of [-1, 1]) {
      const px = sx + k * 2.25, pz = P.porch.minZ + 0.3;
      b.add(GEO.cyl8, '#c9653e', { x: px, y: fy + 0.18, z: pz, sx: 0.2, sy: 0.36, sz: 0.2 });
      b.add(GEO.cyl8, '#4a3526', { x: px, y: fy + 0.366, z: pz, sx: 0.17, sy: 0.014, sz: 0.17 }); // (the earth a little over the rim)
      for (let i = 0; i < 6; i++) { const a = i * 1.1 + k; b.add(GEO.ico1, i % 2 ? '#3f8a3f' : '#4a9a45', { x: px + Math.cos(a) * 0.1, y: fy + 0.46 + (i % 3) * 0.05, z: pz + Math.sin(a) * 0.1, sx: 0.12, sy: 0.1, sz: 0.12 }); if (i % 2) b.add(GEO.ico0, '#e0463c', { x: px + Math.cos(a) * 0.13, y: fy + 0.6, z: pz + Math.sin(a) * 0.13, sx: 0.06, sy: 0.05, sz: 0.06 }); }
      colliders.push({ type: 'circle', x: px, z: pz, r: 0.24 });
    }
    // his own little mailbox on the wall by the door (its name plate is the town's: mailbox-names.js), a curved lid, a brass flag
    const M = P.mailbox;
    b.boxMinMax(M.x - M.w / 2, M.y - M.h / 2, M.z, M.x + M.w / 2, M.y + M.h / 2 - 0.05, z0 - 0.006, '#2f5442');
    b.add(GEO.cyl12, '#2f5442', { x: M.x, y: M.y + M.h / 2 - 0.05, z: (M.z + z0 - 0.006) / 2, sx: M.w / 2 + 0.01, sy: z0 - 0.006 - M.z, sz: 0.06, rx: Math.PI / 2 });
    b.add(GEO.box, C.brass, { x: M.x + M.w / 2 + 0.012, y: M.y + 0.05, z: M.z + 0.05, sx: 0.02, sy: 0.14, sz: 0.04 });
    // the rack of boards on the east wall (Kevin takes some for a job), under a little roof
    const L = LUMBER_RACK;
    for (const dz of [-1.0, 1.0]) sb.boxMinMax(maxX + 0.04, gy - 0.02, L.z + dz - 0.04, maxX + 0.5, gy + 1.0, L.z + dz + 0.04, C.woodDk);
    for (let i = 0; i < 6; i++) sb.boxMinMax(maxX + 0.08 + (i % 3) * 0.13, gy + 0.32 + Math.floor(i / 3) * 0.05 + (i % 3) * 0.003, L.z - 1.4 + (i % 2) * 0.05, maxX + 0.2 + (i % 3) * 0.13, gy + 0.345 + Math.floor(i / 3) * 0.05 + (i % 3) * 0.003, L.z + 1.4 - (i % 2) * 0.05, i % 2 ? '#d9b47c' : '#c9a26b');
    for (const y of [0.3, 0.62]) sb.boxMinMax(maxX + 0.045, gy + y - 0.03, L.z - 1.08, maxX + 0.52, gy + y, L.z + 1.08, C.woodDk);
    sb.add(GEO.box, C.roofDk, { x: maxX + 0.3, y: gy + 1.06, z: L.z, sx: 0.66, sy: 0.05, sz: 2.4, rz: 0.25 });
    colliders.push({ type: 'box', minX: maxX, maxX: maxX + 0.55, minZ: L.z - 1.45, maxZ: L.z + 1.45 });
  }

  // -- the display window (inside the glass, drawn with the shell): a platform, a back panel with a lace valance, odds and ends.
  // (crib-window) Only the west window (WIN[0]) is a display now. Andrew: "get rid of the cabinets on the window in front of the cash
  // register, I want the window to look into the shop directly": the register's window (WIN[1], the counter's side) has no platform,
  // back or curtain, in the model or here; its glass looks straight into the shop. The west display's products are the model's (a
  // pyramid of paint cans, a SALE card on its block (tool-crib.js), a red toolbox, a hand saw on a stand, a barn lantern) under a strip
  // light hung from a pipe across the window (its bulbs and spot below); the code's odds and ends are the fallback's
  {
    const D = P.display;
    for (const [i, w] of WIN.entries()) {
      if (i !== 0) continue;
      const xa = w.a0 - 0.1, xb = w.a1 + 0.1, zb = D.z1;
      sb.boxMinMax(xa, fy, z1, xb, D.y, zb, '#8a6240');                                                        // the platform
      sb.boxMinMax(xa, fy, zb, xb, w.y1 + 0.3, zb + 0.05, '#7a5232');                                          // its back, toward the shop
      sb.boxMinMax(xa + 0.003, D.y, zb - 0.012, xb - 0.003, w.y1 + 0.3, zb, '#6e2a26');                          // the back's face in the window: an old red curtain
      for (const x of [xa, xb - 0.04]) sb.boxMinMax(x, D.y, z1, x + 0.04, w.y1 + 0.3, zb - 0.012, '#7a5232');      // the ends
      for (let k = 0; k < 12; k++) { const x = w.a0 + (k + 0.5) * (w.a1 - w.a0) / 12; sb.add(GEO.cyl8, '#fbf7ee', { x, y: w.y1 - 0.06, z: z1 + 0.18, sx: (w.a1 - w.a0) / 24, sy: 0.02, sz: 0.04, rx: Math.PI / 2 }); }
      sb.boxMinMax(w.a0, w.y1 - 0.05, z1 + 0.15, w.a1, w.y1 + 0.003, z1 + 0.2, '#fbf7ee');                       // the lace valance
      colliders.push({ type: 'box', minX: xa, maxX: xb, minZ: z0, maxZ: zb + 0.06 });
      const y = D.y, mz = (z1 + zb) / 2;
      // the fallback's odds and ends (the model's products stand here when it loaded: sb only counts them): a lantern on a hook, a red
      // toolbox, a fishing net over an oar, a coil of rope, a watering can, a decoy
      const L0 = w.a0 + 0.55;
      sb.add(GEO.cyl6, C.iron, { x: L0, y: w.y1 - 0.3, z: mz, sx: 0.008, sy: 0.4, sz: 0.008 });
      sb.add(GEO.box, '#2f5442', { x: L0, y: w.y1 - 0.57, z: mz, sx: 0.18, sy: 0.04, sz: 0.18 });
      sb.add(GEO.cyl8, '#f3e3c3', { x: L0, y: w.y1 - 0.7, z: mz, sx: 0.07, sy: 0.2, sz: 0.07 });
      sb.add(GEO.box, '#2f5442', { x: L0, y: w.y1 - 0.82, z: mz, sx: 0.2, sy: 0.05, sz: 0.2 });
      sb.boxMinMax(w.a0 + 1.0, y, mz - 0.14, w.a0 + 1.55, y + 0.24, mz + 0.14, C.red);
      sb.boxMinMax(w.a0 + 0.98, y + 0.24, mz - 0.15, w.a0 + 1.57, y + 0.28, mz + 0.15, '#8e2a20');
      sb.add(GEO.box, C.ink, { x: w.a0 + 1.275, y: y + 0.33, z: mz, sx: 0.22, sy: 0.04, sz: 0.03 });
      sb.add(GEO.box, '#b98a5a', { x: w.a0 + 2.3, y: y + 0.6, z: zb - 0.1, sx: 0.07, sy: 1.25, sz: 0.04, rz: 0.35 });
      sb.add(GEO.box, '#b98a5a', { x: w.a0 + 2.55, y: y + 1.12, z: zb - 0.1, sx: 0.18, sy: 0.4, sz: 0.03, rz: 0.35 });
      for (let k = 0; k < 7; k++) sb.add(GEO.box, '#d8c9a8', { x: w.a0 + 1.9 + k * 0.12, y: y + 0.55 + Math.sin(k) * 0.08, z: zb - 0.06, sx: 0.012, sy: 0.9, sz: 0.012, rz: 0.2 - k * 0.05 });
      for (let k = 0; k < 6; k++) sb.add(GEO.box, '#d8c9a8', { x: w.a0 + 2.2, y: y + 0.25 + k * 0.13, z: zb - 0.055, sx: 0.8, sy: 0.012, sz: 0.012, rz: 0.15 });
      for (let k = 0; k < 4; k++) sb.add(new THREE.TorusGeometry(0.17 - k * 0.025, 0.028, 5, 16), '#c9b07a', { x: w.a0 + 3.0, y: y + 0.03 + k * 0.05, z: mz, rx: Math.PI / 2 });
      sb.add(GEO.cyl12, '#5a8a6a', { x: w.a0 + 3.4, y: y + 0.13, z: mz + 0.1, sx: 0.11, sy: 0.26, sz: 0.11 });
      sb.add(GEO.cyl6, '#5a8a6a', { x: w.a0 + 3.25, y: y + 0.2, z: mz + 0.1, sx: 0.02, sy: 0.3, sz: 0.02, rz: 0.8 });
      sb.add(GEO.sphere, '#6b4a2b', { x: w.a0 + 1.7, y: y + 0.08, z: mz - 0.12, sx: 0.16, sy: 0.08, sz: 0.08 });
      sb.add(GEO.sphere, '#2f5442', { x: w.a0 + 1.82, y: y + 0.16, z: mz - 0.12, sx: 0.055, sy: 0.05, sz: 0.05 });
      // the display's strip light (the model's hood on its pipe: anchor display-light): two small bulbs under the hood and a spot
      // that lights the products, by day too (`day`: it is a shop window), its halo the glow you see from the street at night
      const dl = cribAnchor('display-light');
      if (dl) {
        for (const k of [-1, 1]) out.add(GEO.sphere, '#fff6dc', { x: dl.pos[0] + k * 0.25, y: dl.pos[1], z: dl.pos[2], sx: 0.035, sy: 0.03, sz: 0.035 });
        addSpotW({ x: dl.pos[0], y: dl.pos[1] - 0.12, z: dl.pos[2] + 0.02, color: '#ffe7a8', pool: 0, halo: 0.45, day: 0.6, k: 0.12, lightK: 0.45 });   // (k, lightK: a small light half a metre over the products, not a street lamp's: at a lamp's strength the toon shading washed them out)
      }
    }
  }

  // -- the colliders of the shell: the walls (the door's gap in front; the back is whole: its door is shut)
  colliders.push({ type: 'box', minX, maxX: P.door.x0, minZ, maxZ: minZ + T + 0.05 }, { type: 'box', minX: P.door.x1, maxX, minZ, maxZ: minZ + T + 0.05 },
    { type: 'box', minX, maxX: minX + T, minZ, maxZ }, { type: 'box', minX: maxX - T, maxX, minZ, maxZ }, { type: 'box', minX, maxX, minZ: maxZ - T, maxZ });
  // the porch's edges: down the steps or off the ends (no collider), the awning's arms are overhead

  const cb = new Batcher({ vertexColors: true });   // (crib-move) the roll-up door's curtain by itself: rolled up into its drum for the Sunday ride
  const clutterOut = clutterOutside(b, out, colliders, addSpotW, cb, sb);   // the roll-up door, its light and ramp, the FREE box (crib-clutter.js)
  // (crib-move) Kevin's motorcycle pad on the roll-up door's side (layout.js CRIB_PAD, world; here in the plan's frame), tar like the
  // post office's bay, with its driveway up to the sidewalk's back edge (road-net.js cuts the apron across the sidewalk) and a white
  // box round where the bike stands wheeled out
  {
    const PD = worldBox({ minX: CRIB_PAD.minX, maxX: CRIB_PAD.maxX, minZ: CRIB_PAD.minZ, maxZ: CRIB_PAD.maxZ }), D = CRIB_PAD.drive;
    const DR = worldBox({ minX: D.minX, maxX: D.maxX, minZ: Math.min(CRIB_PAD.maxZ, D.cutZ) - 0.02, maxZ: Math.max(CRIB_PAD.maxZ, D.cutZ) }), PY = CRIB_PAD.y;
    b.boxMinMax(PD.minX, gy - 0.05, PD.minZ, PD.maxX, PY, PD.maxZ, '#5f636a');
    b.boxMinMax(DR.minX, gy - 0.05, DR.minZ, DR.maxX, PY - 0.003, DR.maxZ, '#5f636a');
    addSurface({ ...PD, y: PY }); addSurface({ ...DR, y: PY - 0.003 });
    const [bx, bz] = toWorld(CRIB_PAD.stop.x, CRIB_PAD.stop.z);
    for (const [x0, z0, x1, z1] of [[bx - 1.45, bz - 0.75, bx + 1.45, bz - 0.65], [bx - 1.45, bz + 0.65, bx + 1.45, bz + 0.75], [bx - 1.45, bz - 0.75, bx - 1.35, bz + 0.75], [bx + 1.35, bz - 0.75, bx + 1.45, bz + 0.75]]) b.boxMinMax(x0, PY, z0, x1, PY + 0.006, z1, '#f4f2ea');
  }
  b.build(g, 'tool-crib-shell');
  out.build(g, 'tool-crib-lamp');
  const curtain = cb.build(g, 'crib-rollup-curtain')[0];
  if (curtain) { const ct = clutterOut.curtainTop; curtain.geometry.translate(0, -ct, 0); curtain.position.y = ct; curtain.updateMatrix(); } // (its pivot at the drum: scale.y rolls it up)

  // ------------------------------------------------------------ the doors: a screen door (out) and the shop's own door (in)
  const DR = P.door, dw = DR.x1 - DR.x0;
  const screen = new THREE.Group(); screen.name = 'crib-screen-door'; screen.position.set(DR.x0 + 0.02, fy, z0 - 0.088); // (in front of the casing, never in its plane)
  {
    const db = new Batcher({ vertexColors: true }), W2 = dw - 0.04, Hh = DR.y1 - fy - 0.03;
    for (const x of [0.03, W2 - 0.03]) db.add(GEO.box, '#ece2c8', { x, y: Hh / 2, z: 0, sx: 0.06, sy: Hh, sz: 0.04 });
    for (const y of [0.05, 0.95, Hh - 0.04]) db.add(GEO.box, '#ece2c8', { x: W2 / 2, y, z: 0, sx: W2 - 0.12, sy: y === 0.05 ? 0.1 : 0.07, sz: 0.04 });
    db.add(GEO.box, '#ece2c8', { x: W2 / 2, y: 0.95, z: -0.005, sx: W2 - 0.12, sy: 0.07, sz: 0.04 }); // (the push bar: ‘Colonial’ style curl)
    db.add(GEO.box, C.brass, { x: W2 - 0.12, y: 1.05, z: -0.04, sx: 0.03, sy: 0.14, sz: 0.03 });
    db.build(screen, 'crib-screen-frame');
    const mesh = new THREE.MeshBasicMaterial({ color: '#2b2f33', transparent: true, opacity: 0.42, depthWrite: false, fog: true, side: THREE.DoubleSide });
    for (const [y0, y1] of [[0.1, 0.915], [0.985, Hh - 0.075]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(W2 - 0.12, y1 - y0), mesh); m.position.set(W2 / 2, (y0 + y1) / 2, 0); m.name = 'crib-screen-mesh'; m.renderOrder = 2; soft(m); screen.add(m); }
  }
  g.add(screen);
  const inner = new THREE.Group(); inner.name = 'crib-door'; inner.position.set(DR.x1 - 0.015, fy, z1 - 0.025);
  {
    const db = new Batcher({ vertexColors: true }), W2 = dw - 0.03, Hh = DR.y1 - fy - 0.02;
    db.add(GEO.box, C.door, { x: -W2 / 2, y: Hh / 2, z: 0, sx: W2, sy: Hh, sz: 0.045 });
    db.add(GEO.box, '#6a3226', { x: -W2 / 2, y: 0.5, z: -0.026, sx: W2 - 0.2, sy: 0.6, sz: 0.012 });
    db.add(GEO.box, glassShop, { x: -W2 / 2, y: 1.45, z: 0, sx: W2 - 0.24, sy: 0.8, sz: 0.055 });
    db.add(GEO.sphere, C.brass, { x: -W2 + 0.09, y: 1.0, z: -0.04, sx: 0.035, sy: 0.035, sz: 0.035 });
    db.add(GEO.sphere, C.brass, { x: -W2 + 0.09, y: 1.0, z: 0.04, sx: 0.035, sy: 0.035, sz: 0.035 });
    db.build(inner, 'crib-door-leaf');
  }
  g.add(inner);
  const doorCol = { type: 'box', minX: DR.x0, maxX: DR.x1, minZ: z0 - 0.06, maxZ: z1, door: true };
  colliders.push(doorCol);

  // ------------------------------------------------------------ inside (one batch; no shadows under the roof)
  const inside = new THREE.Group(); inside.name = 'tool-crib-inside'; g.add(inside);
  const ib = new Batcher({ vertexColors: true, castShadow: false, material: M ? cribMaterial('inside') : null });
  const ab = M ? NOPE : ib;                                     // the inside's architecture and fixed furniture (the model has it)
  if (M) ib.add(cribGeometry('inside'), '#ffffff', {});
  const shopBulbs = new Bulbs(BULBS), loftBulbs = new Bulbs(LOFT_BULBS);
  const glassy = new THREE.MeshBasicMaterial({ color: '#dff3ea', transparent: true, opacity: 0.25, depthWrite: false, fog: true }); glassy.name = 'crib-glassware';
  const gb = new Batcher({ castShadow: false });
  // the floor: boards (the slab under, plank lines on top), a rag rug by the counter
  ab.boxMinMax(iMinX, gy - 0.02, iMinZ, iMaxX, fy - 0.03, iMaxZ, C.plank);
  planks(ab, iMinX, iMaxX, iMinZ, zP + 0.004, fy);
  for (const [r, c] of [[0.62, '#b8574a'], [0.5, '#e8c27a'], [0.38, '#3f6fa8'], [0.24, '#e8c27a']]) ib.add(GEO.cyl12, c, { x: P.counter.minX - 0.7, y: fy + 0.004 + (0.62 - r) * 0.03, z: (P.counter.minZ + P.counter.maxZ) / 2, sx: r * 1.5, sy: 0.006, sz: r });
  // the ceiling: boards with beams across (the attic is never seen)
  ab.boxMinMax(iMinX, top - 0.06, iMinZ, iMaxX, top - 0.02, iMaxZ, C.ceil);
  for (let z = iMinZ + 1.4; z < iMaxZ - 0.5; z += 2.2) if (Math.abs(z - zL) > 0.4) ab.boxMinMax(iMinX, top - 0.26, z - 0.08, iMaxX, top - 0.06, z + 0.08, C.beam);
  // the walls inside: a dark wainscot under warm plaster on the shop floor, knotty pine in the loft
  const sk = 0.03, wy = fy + 1.0;
  const FRONTH = [{ a0: DR.x0, a1: DR.x1, y0: fy, y1: DR.y1 }, ...WIN.map(w => ({ ...w, a0: w.a0 - 0.1, a1: w.a1 + 0.1, y0: fy, y1: w.y1 + 0.3 })), ...UP];
  holey(ab, 'x', iMinX, iMaxX, z1, z1 + sk, fy, wy, FRONTH, C.wain);
  holey(ab, 'x', iMinX, iMaxX, z1, z1 + sk, wy, top - 0.06, FRONTH, C.plaster);
  holey(ab, 'z', iMinZ + sk, zP, iMinX, iMinX + sk, fy, wy, [], C.wain);
  holey(ab, 'z', iMinZ + sk, zP, iMinX, iMinX + sk, wy, top - 0.06, [], C.plaster);
  holey(ab, 'z', iMinZ + sk, zP, iMaxX - sk, iMaxX, fy, wy, [RUH], C.wain);
  holey(ab, 'z', iMinZ + sk, zP, iMaxX - sk, iMaxX, wy, top - 0.06, [RUH], C.plaster);
  for (const [za, zb] of [[iMinZ + sk, P.peg.z0 - 0.08], [P.peg.z1 + 0.08, ST.z0]]) ab.boxMinMax(iMinX + sk, wy - 0.005, za, iMinX + sk + 0.025, wy + 0.06, zb, C.woodMid); // the chair rails (not behind the pegboard or the stair)
  for (const [za, zb] of [[iMinZ + sk, RU.z0 - 0.1], [RU.z1 + 0.1, zP - 0.003]]) ab.boxMinMax(iMaxX - sk - 0.025, wy - 0.005, za, iMaxX - sk, wy + 0.06, zb, C.woodMid);   // (not across the roll-up door)
  // the partition between the shop and the loft (the stockroom under the loft): the stair's doorway, the stockroom's door
  const SD = { a0: P.stock.x0, a1: P.stock.x1, y0: fy - 0.004, y1: P.stock.y1 }, STD = { a0: ST.minX - 0.01, a1: ST.maxX, y0: LY - 0.004, y1: LY + 2.12 };
  holey(ab, 'x', iMinX, iMaxX, zP, zL, fy, top - 0.06, [SD, STD], C.plaster);
  ab.boxMinMax(ST.maxX + 0.003, fy, zP - 0.03, iMaxX - 0.003, wy, zP, C.wain);
  // the stockroom door, shut, with a STOCK plate
  ab.boxMinMax(SD.a0 + 0.004, fy + 0.006, zP + 0.02, SD.a1 - 0.004, SD.y1 - 0.004, zL - 0.02, '#6b4a2b');
  for (const [y0, y1] of [[0.25, 0.95], [1.15, 1.9]]) ab.boxMinMax(SD.a0 + 0.12, fy + y0, zP + 0.012, SD.a1 - 0.12, fy + y1, zP + 0.02, '#5a3c26');
  ib.add(GEO.sphere, C.brass, { x: SD.a1 - 0.12, y: fy + 1.02, z: zP + 0.0, sx: 0.035, sy: 0.035, sz: 0.035 });
  ab.boxMinMax(SD.a0 - 0.09, fy - 0.004, zP - 0.04, SD.a0 + 0.003, SD.y1, zP + 0.01, C.trim); ab.boxMinMax(SD.a1 - 0.003, fy - 0.004, zP - 0.04, SD.a1 + 0.09, SD.y1, zP + 0.01, C.trim);
  ab.boxMinMax(SD.a0 - 0.1, SD.y1 - 0.003, zP - 0.04, SD.a1 + 0.1, SD.y1 + 0.12, zP + 0.01, C.trim);
  ib.boxMinMax((SD.a0 + SD.a1) / 2 - 0.2, fy + 1.55, zP - 0.008, (SD.a0 + SD.a1) / 2 + 0.2, fy + 1.68, zP, '#e9dfc4');
  for (let k = 0; k < 5; k++) ib.boxMinMax((SD.a0 + SD.a1) / 2 - 0.16 + k * 0.07, fy + 1.585, zP - 0.012, (SD.a0 + SD.a1) / 2 - 0.12 + k * 0.07, fy + 1.645, zP - 0.008, C.ink);
  colliders.push({ type: 'box', minX: ST.maxX, maxX: iMaxX, minZ: zP - 0.05, maxZ: zL + 0.05 });

  // ---- the stair up the west wall: solid steps, a lighter nosing on each, a skirt board and a handrail on posts on the open side,
  // a rail on the wall
  for (let i = 0; i < ST.n; i++) {
    const za = ST.z0 + i * ST.tread, zb = za + ST.tread, y = fy + (i + 1) * ST.rise;
    ab.boxMinMax(ST.minX + sk + 0.003, fy, za, ST.maxX, y - 0.03, zb, i % 2 ? '#9a6b43' : '#a37349');
    ab.boxMinMax(ST.minX + sk + 0.003, y - 0.03, za - 0.025, ST.maxX + 0.015, y, zb - 0.002, C.pine);
  }
  const run = ST.z1 - ST.z0, rise = LY - fy, ang = Math.atan2(rise, run), slope = Math.hypot(run, rise);
  ab.add(GEO.box, C.woodDk, { x: ST.maxX + 0.045, y: fy + rise / 2 + 0.02, z: (ST.z0 + ST.z1) / 2, sx: 0.05, sy: 0.3, sz: slope + 0.12, rx: -ang });
  ab.add(GEO.box, C.woodDk, { x: ST.maxX + 0.045, y: fy + rise / 2 + 0.95, z: (ST.z0 + ST.z1) / 2 + 0.12, sx: 0.07, sy: 0.06, sz: slope - 0.3, rx: -ang });
  for (let i = 2; i < ST.n; i += 2) { const z = ST.z0 + (i + 0.5) * ST.tread, y = fy + (i + 1) * ST.rise; ab.boxMinMax(ST.maxX + 0.025, y, z - 0.022, ST.maxX + 0.065, y + 0.9, z + 0.022, C.woodMid); }
  ab.boxMinMax(ST.maxX + 0.0, fy, ST.z0 + 0.5, ST.maxX + 0.1, fy + 1.12, ST.z0 + 0.6, C.woodDk);  // the newel post
  ab.add(GEO.sphere, C.pine, { x: ST.maxX + 0.05, y: fy + 1.17, z: ST.z0 + 0.55, sx: 0.07, sy: 0.07, sz: 0.07 });
  ab.add(GEO.box, C.woodMid, { x: ST.minX + sk + 0.035, y: fy + rise / 2 + 0.92, z: (ST.z0 + ST.z1) / 2, sx: 0.045, sy: 0.045, sz: slope, rx: -ang });
  colliders.push({ type: 'box', minX: ST.maxX - 0.02, maxX: ST.maxX + 0.12, minZ: ST.z0 + 0.5, maxZ: zP });

  // ---- the counter (front east corner): a panelled front, the top, the brass register, a bell, a candy jar, the ledger, the cat
  {
    const K = P.counter, ty = K.top;
    ab.boxMinMax(K.minX, fy, K.minZ, K.maxX, ty - 0.06, K.maxZ, C.woodMid);
    ab.boxMinMax(K.minX - 0.06, ty - 0.06, K.minZ - 0.06, K.maxX + 0.04, ty, K.maxZ + 0.06, C.wood);
    for (let k = 0; k < 3; k++) { const za = K.minZ + 0.12 + k * (K.maxZ - K.minZ - 0.24) / 3; ab.boxMinMax(K.minX - 0.02, fy + 0.15, za + 0.05, K.minX + 0.003, ty - 0.2, za + (K.maxZ - K.minZ - 0.24) / 3 - 0.05, C.woodDk); }
    ab.boxMinMax(K.minX - 0.03, fy, K.minZ - 0.02, K.maxX + 0.02, fy + 0.1, K.maxZ + 0.02, C.woodDk);   // the kick
    // (crib-register, Andrew 2026-11-10: "It's facing the wrong way. Could look better and is on top of something.") The register at the
    // south end, nearer Kevin's edge (P.register): the model's brass National (crib_register.py, in the inside part) when it has one;
    // else a plain one here, turned the same way: the sloped keys and the drawer to Kevin (+x), the amount tabs to the customer (-x)
    const R = P.register, rx = R.x, rz = R.z;
    if (!cribAnchor('register')) {
      ib.boxMinMax(rx - 0.2, ty, rz - 0.21, rx + 0.2, ty + 0.15, rz + 0.21, C.brass);
      ib.add(GEO.box, '#5a4a3a', { x: rx + 0.1, y: ty + 0.24, z: rz, sx: 0.22, sy: 0.1, sz: 0.4, rz: -0.75 });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) ib.add(GEO.cyl8, '#fbf7ee', { x: rx + 0.16 - r * 0.055, y: ty + 0.235 + r * 0.05, z: rz - 0.15 + c * 0.075, sx: 0.02, sy: 0.02, sz: 0.02, rz: -0.75 });
      ib.boxMinMax(rx - 0.19, ty + 0.15, rz - 0.19, rx + 0.0, ty + 0.38, rz + 0.19, C.brass);
      ib.boxMinMax(rx - 0.11, ty + 0.38, rz - 0.12, rx - 0.09, ty + 0.48, rz + 0.12, '#fbf7ee');
      ib.boxMinMax(rx + 0.2, ty + 0.04, rz - 0.18, rx + 0.215, ty + 0.13, rz + 0.18, '#b08a2a');
      ib.add(GEO.cyl6, C.brass, { x: rx + 0.06, y: ty + 0.24, z: rz - 0.27, sx: 0.015, sy: 0.12, sz: 0.015, rx: Math.PI / 2 });
      ib.add(GEO.sphere, C.ink, { x: rx + 0.06, y: ty + 0.24, z: rz - 0.33, sx: 0.025, sy: 0.025, sz: 0.025 });
    }
    // the bell and the candy jar on the customer's side, the open ledger and its pencil on Kevin's side between them and the register
    // (crib-register: it lay under the register), a spike of receipts; nothing under or through another
    ib.add(GEO.cyl12, C.ink, { x: K.minX + 0.14, y: ty + 0.012, z: K.minZ + 0.98, sx: 0.06, sy: 0.024, sz: 0.06 });
    ib.add(GEO.sphere, C.brass, { x: K.minX + 0.14, y: ty + 0.04, z: K.minZ + 0.98, sx: 0.05, sy: 0.04, sz: 0.05 });
    ib.add(GEO.sphere, C.brass, { x: K.minX + 0.14, y: ty + 0.09, z: K.minZ + 0.98, sx: 0.01, sy: 0.012, sz: 0.01 });
    const jx = K.minX + 0.2, jz = K.minZ + 0.66;
    for (let i = 0; i < 24; i++) { const a = i * 2.4, r = 0.075 * Math.sqrt((i + 0.5) / 24); ib.add(GEO.ico0, ['#e0463c', '#f0c24f', '#ff8fb8', '#7ddc7a', '#ffffff', '#b48cff'][i % 6], { x: jx + Math.cos(a) * r, y: ty + 0.03 + Math.floor(i / 8) * 0.045, z: jz + Math.sin(a) * r, sx: 0.025, sy: 0.025, sz: 0.025 }); }
    gb.add(GEO.cyl12, glassy, { x: jx, y: ty + 0.12, z: jz, sx: 0.11, sy: 0.24, sz: 0.11 });
    ib.add(GEO.cyl12, C.red, { x: jx, y: ty + 0.255, z: jz, sx: 0.115, sy: 0.03, sz: 0.115 });
    const lgx = K.maxX - 0.22, lgz = K.minZ + 1.08;
    ib.add(GEO.box, '#5a2a22', { x: lgx, y: ty + 0.012, z: lgz, sx: 0.32, sy: 0.022, sz: 0.46, ry: 0.15 });
    for (const k of [-1, 1]) ib.add(GEO.box, '#f6efdc', { x: lgx + Math.sin(0.15) * k * 0.11, y: ty + 0.028 + 0.004, z: lgz + Math.cos(0.15) * k * 0.11, sx: 0.28, sy: 0.012, sz: 0.2, ry: 0.15, rx: k * 0.05 });
    ib.add(GEO.box, '#e0b54a', { x: lgx + 0.08, y: ty + 0.046, z: lgz + 0.06, sx: 0.012, sy: 0.012, sz: 0.16, ry: 0.6 });
    ib.add(GEO.cyl6, C.iron, { x: K.maxX - 0.14, y: ty + 0.08, z: K.minZ + 0.2, sx: 0.004, sy: 0.16, sz: 0.004 });
    for (let k = 0; k < 6; k++) ib.add(GEO.box, '#fbf7ee', { x: K.maxX - 0.14, y: ty + 0.02 + k * 0.012, z: K.minZ + 0.2, sx: 0.07, sy: 0.003, sz: 0.1, ry: k * 0.5 });
    // the cat: an orange tabby asleep in a curl at the counter's north end, tail round her nose
    const cx = (K.minX + K.maxX) / 2 - 0.02, cz = K.minZ + 0.32, cy = ty;
    ib.add(GEO.sphere, '#e8954a', { x: cx, y: cy + 0.075, z: cz, sx: 0.17, sy: 0.08, sz: 0.13 });
    ib.add(GEO.sphere, '#e8954a', { x: cx - 0.1, y: cy + 0.1, z: cz - 0.07, sx: 0.07, sy: 0.06, sz: 0.065 });
    for (const k of [-1, 1]) ib.add(GEO.cone6, '#e8954a', { x: cx - 0.1 + k * 0.035, y: cy + 0.16, z: cz - 0.075, sx: 0.02, sy: 0.04, sz: 0.02, rz: -k * 0.3 });
    for (let k = 0; k < 3; k++) ib.add(GEO.box, '#c87430', { x: cx + 0.02 + k * 0.05, y: cy + 0.152, z: cz, sx: 0.022, sy: 0.006, sz: 0.16, ry: 0.1 });
    ib.add(new THREE.TorusGeometry(0.13, 0.025, 5, 14, Math.PI * 1.2), '#e8954a', { x: cx, y: cy + 0.03, z: cz, rx: Math.PI / 2, rz: 1.6 });
    colliders.push({ type: 'box', minX: K.minX - 0.08, maxX: K.maxX + 0.06, minZ: K.minZ - 0.08, maxZ: K.maxZ + 0.08 });
    // Kevin's stool behind it, a little shelf of jars and the first dollar on the wall behind him
    const S = P.stool, sy2 = fy + S.seatY;
    ib.add(GEO.cyl12, C.woodMid, { x: S.x, y: sy2 - 0.025, z: S.z, sx: 0.19, sy: 0.05, sz: 0.19 });
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.3; ib.add(GEO.cyl6, C.woodDk, { x: S.x + Math.cos(a) * 0.12, y: fy + (S.seatY - 0.05) / 2, z: S.z + Math.sin(a) * 0.12, sx: 0.02, sy: S.seatY - 0.05, sz: 0.02, rx: Math.sin(a) * 0.12, rz: -Math.cos(a) * 0.12 }); }
    // (seat-height: his feet on a foot rest at `rung`, 0.3 under the seat: a ring round the legs and a board out in front where his feet go;
    // kevin-day.js stands his root on it. It was a 0.15 ring at 0.25 and his feet hung 41 cm.)
    { const R = S.rungR, ry = fy + S.rung, fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), cx = S.x + fx * 0.3, cz = S.z + fz * 0.3;
      ib.add(new THREE.TorusGeometry(R, 0.014, 4, 16), C.iron, { x: S.x, y: ry - 0.03, z: S.z, rx: Math.PI / 2 });
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.3, lr = 0.1; ib.add(GEO.box, C.iron, { x: S.x + Math.cos(a) * (lr + R) / 2, y: ry - 0.03, z: S.z + Math.sin(a) * (lr + R) / 2, sx: R - lr + 0.02, sy: 0.02, sz: 0.02, ry: -a }); }
      ib.add(GEO.box, C.woodMid, { x: cx, y: ry - 0.015, z: cz, sx: 0.44, sy: 0.03, sz: 0.24, ry: S.yaw }); // the board
      for (const s of [-1, 1]) { const lx = cx + Math.cos(S.yaw) * s * 0.19 + fx * 0.08, lz = cz - Math.sin(S.yaw) * s * 0.19 + fz * 0.08; ib.add(GEO.box, C.woodDk, { x: lx, y: fy + (S.rung - 0.03) / 2, z: lz, sx: 0.03, sy: S.rung - 0.03, sz: 0.03, ry: S.yaw }); } // its two front legs
      for (const s of [-1, 1]) { const lx = cx + Math.cos(S.yaw) * s * 0.19 - fx * 0.12, lz = cz - Math.sin(S.yaw) * s * 0.19 - fz * 0.12; ib.add(GEO.box, C.iron, { x: (lx + S.x) / 2, y: ry - 0.03, z: (lz + S.z) / 2, sx: 0.02, sy: 0.02, sz: Math.hypot(lx - S.x, lz - S.z), ry: Math.atan2(lx - S.x, lz - S.z) }); } } // and its arms back to the ring
    colliders.push({ type: 'circle', x: S.x, z: S.z, r: 0.18, seat: true });
    for (const y of [1.25, 1.7]) ab.boxMinMax(iMaxX - sk - 0.22, fy + y, K.minZ, iMaxX - sk, fy + y + 0.03, K.maxZ, C.wood);
    for (let i = 0; i < 10; i++) { const y = fy + (i < 5 ? 1.28 : 1.73), z = K.minZ + 0.25 + (i % 5) * 0.38, x = iMaxX - sk - 0.11; gb.add(GEO.cyl8, glassy, { x, y: y + 0.08, z, sx: 0.06, sy: 0.16, sz: 0.06 }); ib.add(GEO.ico0, PAINTS[(i * 7) % PAINTS.length], { x, y: y + 0.05, z, sx: 0.045, sy: 0.04, sz: 0.045 }); ib.add(GEO.cyl8, C.brass, { x, y: y + 0.165, z, sx: 0.062, sy: 0.015, sz: 0.062 }); }
    ab.boxMinMax(iMaxX - sk - 0.02, fy + 2.0, S.z - 0.2, iMaxX - sk, fy + 2.24, S.z + 0.2, C.woodDk);
    ib.boxMinMax(iMaxX - sk - 0.025, fy + 2.04, S.z - 0.16, iMaxX - sk - 0.02, fy + 2.2, S.z + 0.16, '#9ad8a4');
    // the lamp over the counter: a green banker's shade on a chain
    const lx2 = (K.minX + K.maxX) / 2, lz2 = (K.minZ + K.maxZ) / 2 + 0.2;
    ib.add(GEO.cyl6, C.iron, { x: lx2, y: (top - 0.04 + fy + 2.35) / 2, z: lz2, sx: 0.008, sy: top - 0.04 - fy - 2.35, sz: 0.008 });
    ib.add(GEO.cone8, '#2f6b4f', { x: lx2, y: fy + 2.27, z: lz2, sx: 0.26, sy: 0.16, sz: 0.26 });
    shopBulbs.add(GEO.sphere, '#fff3c4', { x: lx2, y: fy + 2.19, z: lz2, sx: 0.07, sy: 0.06, sz: 0.07 });
    spot(SHOP_SPOTS, { x: lx2, y: fy + 2.1, z: lz2, color: '#ffe7a8', pool: 1.4, gy: fy, halo: 0 });
  }

  // ---- the east wall's shelves: bits and bobs piled up (bins of nails and screws, coils of rope and wire, hinges, a crate of door
  // knobs) and things he couldn't bear to part with (an old reel, a ship in a bottle, a lantern, a broken clock, tackle catalogues);
  // a mounted fish over the top
  {
    const S = P.shelf, x0 = S.x0, x1 = S.x1 - sk, D = x1 - x0, ys = [0.06, 0.52, 0.96, 1.4, 1.84], Hs = S.h;
    ab.boxMinMax(x1 - 0.03, fy, S.z0, x1, fy + Hs, S.z1, C.woodDk);                                       // the back
    for (const z of [S.z0, S.z1 - 0.04, (S.z0 + S.z1) / 2 - 0.02]) ab.boxMinMax(x0, fy, z, x1 - 0.03, fy + Hs, z + 0.04, C.wood);  // the uprights
    ab.boxMinMax(x0 - 0.03, fy + Hs, S.z0 - 0.03, x1, fy + Hs + 0.05, S.z1 + 0.03, C.wood);                  // the top
    const segs = [[S.z0 + 0.04, (S.z0 + S.z1) / 2 - 0.02], [(S.z0 + S.z1) / 2 + 0.02, S.z1 - 0.04]];
    ys.forEach((y, r) => {
      for (const [za, zb] of segs) ab.boxMinMax(x0 + 0.003, fy + y - 0.03, za + 0.002, x1 - 0.033, fy + y, zb - 0.002, C.pine);
      const by = fy + y;
      // fill each row: a run of things, deterministic
      if (M) return;   // (crib-setpiece: the model's shelves are full)
      for (const [za, zb] of segs) {
        let z = za + 0.06, k = r * 7 + (za > S.z0 + 1 ? 3 : 0);
        while (z < zb - 0.3) {
          const kind = (k * 5 + r * 3) % 9, mx = x0 + D * 0.48;
          if (kind === 0 || kind === 1 || kind === 5) { // a row of bins of nails, screws and washers, each with a label
            for (let q = 0; q < 3 && z < zb - 0.2; q++) {
              const col = ['#3f6fa8', '#c0392b', '#e0b54a', '#3f8a5a'][(k + q) % 4];
              ib.boxMinMax(mx - 0.18, by, z, mx + 0.18, by + 0.14, z + 0.17, col);
              ib.boxMinMax(mx - 0.16, by + 0.02, z + 0.015, mx + 0.16, by + 0.11 + (q % 2) * 0.02, z + 0.155, q % 2 ? '#8f969e' : '#b4b9be');
              ib.boxMinMax(mx - 0.185, by + 0.05, z + 0.03, mx - 0.18, by + 0.1, z + 0.14, '#fbf7ee');
              z += 0.2;
            }
          } else if (kind === 2) { // coils of rope
            for (let q = 0; q < 3; q++) ib.add(new THREE.TorusGeometry(0.16 - q * 0.02, 0.03, 5, 16), q % 2 ? '#c9b07a' : '#b89a62', { x: mx, y: by + 0.03 + q * 0.055, z: z + 0.2, rx: Math.PI / 2 });
            z += 0.44;
          } else if (kind === 3) { // spools of wire
            for (const [q, c] of [[0, '#b8733a'], [1, '#3f8a5a']]) { ib.add(GEO.cyl12, c, { x: mx, y: by + 0.12, z: z + 0.1 + q * 0.22, sx: 0.08, sy: 0.18, sz: 0.08, rx: Math.PI / 2, ry: Math.PI / 2 }); for (const e of [-1, 1]) ib.add(GEO.cyl12, C.woodMid, { x: mx + e * 0.095, y: by + 0.12, z: z + 0.1 + q * 0.22, sx: 0.11, sy: 0.015, sz: 0.11, rz: Math.PI / 2 }); }
            z += 0.48;
          } else if (kind === 4) { // the crate of door knobs
            ib.boxMinMax(mx - 0.2, by, z, mx + 0.2, by + 0.16, z + 0.32, '#b98a5a');
            for (let q = 0; q < 8; q++) ib.add(GEO.sphere, q % 3 ? C.brass : '#e8e2d6', { x: mx - 0.12 + (q % 4) * 0.08, y: by + 0.17, z: z + 0.09 + Math.floor(q / 4) * 0.14, sx: 0.045, sy: 0.045, sz: 0.045 });
            z += 0.38;
          } else if (kind === 6) { // a box of hinges
            ib.boxMinMax(mx - 0.17, by, z, mx + 0.17, by + 0.1, z + 0.26, '#8a6240');
            for (let q = 0; q < 6; q++) ib.add(GEO.box, '#8f969e', { x: mx - 0.08 + (q % 3) * 0.08, y: by + 0.11 + Math.floor(q / 3) * 0.012, z: z + 0.08 + Math.floor(q / 3) * 0.1, sx: 0.07, sy: 0.006, sz: 0.09, ry: q * 0.4 });
            z += 0.32;
          } else if (kind === 7) { // keepsakes: one of them
            const what = (k + r) % 5;
            if (what === 0) { ib.add(GEO.cyl12, '#5a5f66', { x: mx, y: by + 0.08, z: z + 0.12, sx: 0.08, sy: 0.07, sz: 0.08, rz: Math.PI / 2 }); ib.add(GEO.box, '#2b2b2f', { x: mx, y: by + 0.03, z: z + 0.12, sx: 0.04, sy: 0.06, sz: 0.2 }); ib.add(GEO.box, C.brass, { x: mx - 0.06, y: by + 0.1, z: z + 0.2, sx: 0.02, sy: 0.02, sz: 0.06 }); } // the old reel
            else if (what === 1) { gb.add(GEO.cyl12, glassy, { x: mx, y: by + 0.085, z: z + 0.2, sx: 0.08, sy: 0.32, sz: 0.08, rx: Math.PI / 2 }); gb.add(GEO.cyl8, glassy, { x: mx, y: by + 0.085, z: z + 0.42, sx: 0.03, sy: 0.12, sz: 0.03, rx: Math.PI / 2 }); ib.add(GEO.box, '#8a5a3a', { x: mx, y: by + 0.055, z: z + 0.2, sx: 0.05, sy: 0.025, sz: 0.16 }); ib.add(GEO.cone6, '#fbf7ee', { x: mx, y: by + 0.1, z: z + 0.2, sx: 0.04, sy: 0.07, sz: 0.004 }); ib.add(GEO.cyl6, C.woodDk, { x: mx, y: by + 0.085, z: z + 0.5, sx: 0.025, sy: 0.03, sz: 0.025, rx: Math.PI / 2 }); for (const e of [-1, 1]) ib.add(GEO.box, C.woodDk, { x: mx, y: by + 0.006, z: z + 0.2 + e * 0.1, sx: 0.12, sy: 0.012, sz: 0.03 }); } // a ship in a bottle on its stand
            else if (what === 2) { ib.add(GEO.box, '#2f5442', { x: mx, y: by + 0.02, z: z + 0.15, sx: 0.16, sy: 0.04, sz: 0.16 }); gb.add(GEO.cyl8, glassy, { x: mx, y: by + 0.15, z: z + 0.15, sx: 0.06, sy: 0.2, sz: 0.06 }); ib.add(GEO.box, '#2f5442', { x: mx, y: by + 0.27, z: z + 0.15, sx: 0.17, sy: 0.04, sz: 0.17 }); ib.add(new THREE.TorusGeometry(0.06, 0.008, 4, 10), C.iron, { x: mx, y: by + 0.34, z: z + 0.15 }); } // an old lantern
            else if (what === 3) { ib.add(GEO.cyl12, '#8a5a3a', { x: mx + 0.05, y: by + 0.17, z: z + 0.15, sx: 0.15, sy: 0.04, sz: 0.15, rz: Math.PI / 2 }); ib.add(GEO.cyl12, '#f6efdc', { x: mx + 0.025, y: by + 0.17, z: z + 0.15, sx: 0.12, sy: 0.012, sz: 0.12, rz: Math.PI / 2 }); ib.add(GEO.box, C.ink, { x: mx + 0.016, y: by + 0.2, z: z + 0.15, sx: 0.006, sy: 0.07, sz: 0.012, rx: 0.3 }); ib.add(GEO.box, C.ink, { x: mx + 0.016, y: by + 0.16, z: z + 0.18, sx: 0.006, sy: 0.05, sz: 0.012, rx: 2.3 }); ib.add(GEO.box, '#5a4a3c', { x: mx + 0.014, y: by + 0.19, z: z + 0.11, sx: 0.004, sy: 0.12, sz: 0.004, rx: 0.6 }); } // the broken clock: stopped, its glass cracked
            else { for (let q = 0; q < 6; q++) ib.add(GEO.box, ['#e0463c', '#3f8fd9', '#f0c24f', '#7ddc7a', '#fbf7ee', '#ff8fb8'][(q + k) % 6], { x: mx, y: by + 0.012 + q * 0.022, z: z + 0.16, sx: 0.24, sy: 0.02, sz: 0.3, ry: (q % 3 - 1) * 0.08 }); } // a stack of tackle catalogues
            z += 0.36;
          } else { // jars of screws
            for (let q = 0; q < 3; q++) { gb.add(GEO.cyl8, glassy, { x: mx, y: by + 0.09, z: z + 0.07 + q * 0.13, sx: 0.055, sy: 0.18, sz: 0.055 }); ib.add(GEO.cyl8, '#8f969e', { x: mx, y: by + 0.05, z: z + 0.07 + q * 0.13, sx: 0.048, sy: 0.09, sz: 0.048 }); ib.add(GEO.cyl8, C.red, { x: mx, y: by + 0.185, z: z + 0.07 + q * 0.13, sx: 0.057, sy: 0.02, sz: 0.057 }); }
            z += 0.42;
          }
          k++;
        }
      }
    });
    // on top: more bins and a box or two; over it on the wall, the mounted fish on a plaque
    if (!M) for (let q = 0; S.z0 + 0.75 + q * 0.95 < S.z1 - 0.04; q++) ib.boxMinMax(x0 + 0.05, fy + Hs + 0.05, S.z0 + 0.2 + q * 0.95, x1 - 0.06, fy + Hs + 0.27 + (q % 2) * 0.08, S.z0 + 0.75 + q * 0.95, q % 3 ? '#b98a5a' : '#c8b08a');
    const fz = (S.z0 + S.z1) / 2, fyy = fy + Hs + 0.85;
    ib.add(GEO.box, '#5a3c26', { x: iMaxX - sk - 0.015, y: fyy, z: fz, sx: 0.03, sy: 0.42, sz: 0.9 });
    ib.add(GEO.sphere, '#5f8a4a', { x: iMaxX - sk - 0.1, y: fyy, z: fz, sx: 0.08, sy: 0.13, sz: 0.3 });
    ib.add(GEO.sphere, '#e8e0a8', { x: iMaxX - sk - 0.12, y: fyy - 0.05, z: fz, sx: 0.06, sy: 0.07, sz: 0.26 });
    ib.add(GEO.cone6, '#5f8a4a', { x: iMaxX - sk - 0.1, y: fyy + 0.02, z: fz - 0.38, sx: 0.04, sy: 0.18, sz: 0.14, rx: -Math.PI / 2 });
    ib.add(GEO.sphere, C.ink, { x: iMaxX - sk - 0.16, y: fyy + 0.04, z: fz + 0.24, sx: 0.018, sy: 0.018, sz: 0.018 });
    ib.add(GEO.cone6, '#4a7038', { x: iMaxX - sk - 0.1, y: fyy + 0.15, z: fz - 0.02, sx: 0.03, sy: 0.12, sz: 0.12 });
    colliders.push({ type: 'box', minX: x0 - 0.03, maxX: iMaxX, minZ: S.z0 - 0.03, maxZ: S.z1 + 0.03 });
  }

  // ---- the pegboard of tools over the workbench (west wall), each tool's outline painted where it hangs (a few hang elsewhere)
  {
    const Pg = P.peg, px = iMinX + sk, pf = px + 0.025;
    ab.boxMinMax(px, Pg.y0, Pg.z0, px + 0.022, Pg.y1, Pg.z1, '#c9a26b');
    ab.boxMinMax(px, Pg.y0 - 0.05, Pg.z0 - 0.05, px + 0.035, Pg.y0, Pg.z1 + 0.05, C.woodDk);
    ab.boxMinMax(px, Pg.y1, Pg.z0 - 0.05, px + 0.035, Pg.y1 + 0.05, Pg.z1 + 0.05, C.woodDk);
    // the holes: a grid of small dark squares on its face
    const dots = [];
    if (!M) {   // (crib-setpiece: the model's pegboard has its holes in the paint)
    for (let y = Pg.y0 + 0.06; y < Pg.y1 - 0.03; y += 0.1) for (let z = Pg.z0 + 0.06; z < Pg.z1 - 0.03; z += 0.1) { const q = new THREE.PlaneGeometry(0.014, 0.014); q.rotateY(Math.PI / 2); q.translate(px + 0.028, y, z); dots.push(q); }
    ib.add(mergeGeometries(dots, false), '#6b4a2b'); dots.forEach(q => q.dispose());
    }
    const outline = (y, z, h, w) => ib.boxMinMax(px + 0.02, y - h / 2, z - w / 2, px + 0.034, y + h / 2, z + w / 2, '#3a3f47');
    const T = [];
    const tool = (kind, y, z, there = true) => { outline(y, z, kind.h + 0.04, kind.w + 0.04); if (there) T.push([kind, y, z]); };
    const HAM = { h: 0.36, w: 0.14 }, SAW = { h: 0.2, w: 0.62 }, WR = { h: 0.3, w: 0.06 }, PL = { h: 0.24, w: 0.07 }, SD = { h: 0.26, w: 0.03 }, CL = { h: 0.22, w: 0.16 }, LV = { h: 0.07, w: 0.62 }, SQ = { h: 0.32, w: 0.18 };
    const z0p = Pg.z0, L = Pg.z1 - Pg.z0, row1 = Pg.y1 - 0.28, row2 = Pg.y1 - 0.75, row3 = Pg.y0 + 0.32;
    tool(HAM, row1, z0p + 0.25); tool(HAM, row1, z0p + 0.5); tool(SAW, row1, z0p + 1.15); tool(SQ, row1, z0p + 1.75, false); tool(LV, row1 + 0.1, z0p + 2.5);
    for (let i = 0; i < 4; i++) tool(WR, row2, z0p + 0.2 + i * 0.12);
    tool(PL, row2, z0p + 0.85); tool(PL, row2, z0p + 1.0, false); for (let i = 0; i < 5; i++) tool(SD, row2, z0p + 1.3 + i * 0.07);
    tool(CL, row2, z0p + 2.0); tool(CL, row2, z0p + 2.25); tool(SAW, row3, z0p + 2.5); tool(HAM, row3, z0p + 3.3, false); tool(WR, row3, z0p + 3.0);
    if (L > 3.6) { tool(SQ, row2, z0p + 3.2); tool(LV, row3 - 0.12, z0p + 1.3); }
    // (covered: more along the bottom row and in the gaps)
    for (let i = 0; i < 5; i++) tool(SD, row3, z0p + 0.2 + i * 0.07);
    tool(PL, row3, z0p + 0.7); tool(CL, row3, z0p + 1.05); for (let i = 0; i < 3; i++) tool(WR, row3, z0p + 1.45 + i * 0.12);
    tool(HAM, row2, z0p + 2.6); tool(HAM, row2, z0p + 2.85); tool(WR, row1, z0p + 3.05); tool(WR, row1, z0p + 3.18); tool(PL, row1, z0p + 3.34);
    inside.userData.pegTools = T.length; inside.userData.outlines = T.length + 3;
    for (const [k, y, z] of T) {
      const x = pf + 0.02;
      if (k === HAM) { ib.add(GEO.box, '#b98a5a', { x, y: y - 0.04, z, sx: 0.025, sy: 0.3, sz: 0.03 }); ib.add(GEO.box, '#5d636b', { x, y: y + 0.13, z, sx: 0.04, sy: 0.05, sz: 0.14 }); }
      else if (k === SAW) { ib.add(GEO.box, C.steel, { x, y, z: z + 0.07, sx: 0.006, sy: 0.15, sz: 0.48 }); ib.add(GEO.box, '#8a5a3a', { x: x + 0.005, y, z: z - 0.24, sx: 0.025, sy: 0.18, sz: 0.12 }); }
      else if (k === WR) { ib.add(GEO.box, C.steel, { x, y, z, sx: 0.012, sy: 0.27, sz: 0.03 }); ib.add(GEO.box, C.steel, { x, y: y + 0.13, z, sx: 0.012, sy: 0.04, sz: 0.06 }); }
      else if (k === PL) { for (const e of [-1, 1]) ib.add(GEO.box, e < 0 ? C.red : '#3f6fa8', { x: x + e * 0.003, y: y - 0.04, z: z + e * 0.015, sx: 0.015, sy: 0.16, sz: 0.018, rx: e * 0.12 }); ib.add(GEO.box, C.steel, { x, y: y + 0.08, z, sx: 0.015, sy: 0.08, sz: 0.03 }); }
      else if (k === SD) { ib.add(GEO.box, ['#e0463c', '#f0c24f', '#3f8fd9', '#7ddc7a', '#e0463c'][Math.round(z * 100) % 5], { x, y: y - 0.07, z, sx: 0.025, sy: 0.1, sz: 0.025 }); ib.add(GEO.box, C.steel, { x, y: y + 0.06, z, sx: 0.008, sy: 0.15, sz: 0.008 }); }
      else if (k === CL) { ib.add(GEO.box, C.red, { x, y: y + 0.08, z, sx: 0.02, sy: 0.03, sz: 0.14 }); ib.add(GEO.box, C.red, { x, y, z: z - 0.06, sx: 0.02, sy: 0.18, sz: 0.03 }); ib.add(GEO.box, C.red, { x, y: y - 0.08, z, sx: 0.02, sy: 0.03, sz: 0.14 }); ib.add(GEO.box, C.steel, { x, y: y - 0.02, z: z + 0.05, sx: 0.01, sy: 0.16, sz: 0.01 }); }
      else if (k === LV) { ib.add(GEO.box, '#f0c24f', { x, y, z, sx: 0.025, sy: 0.05, sz: 0.6 }); ib.add(GEO.box, '#7ddc7a', { x: x + 0.014, y, z, sx: 0.004, sy: 0.02, sz: 0.06 }); }
      else if (k === SQ) { ib.add(GEO.box, C.steel, { x, y, z: z - 0.07, sx: 0.006, sy: 0.3, sz: 0.035 }); ib.add(GEO.box, C.steel, { x, y: y - 0.135, z, sx: 0.006, sy: 0.035, sz: 0.17 }); }
    }
    // the bench: a thick top, legs, a shelf under, a vise at the end, a coffee can of pencils, a tape measure
    const bx0 = iMinX + sk, bx1 = iMinX + 0.6, bt = fy + 0.88;
    ab.boxMinMax(bx0 + 0.003, bt - 0.06, Pg.z0, bx1, bt, Pg.z1, C.wood);
    for (const z of [Pg.z0 + 0.06, Pg.z1 - 0.06]) for (const x of [bx0 + 0.06, bx1 - 0.06]) ab.boxMinMax(x - 0.04, fy, z - 0.04, x + 0.04, bt - 0.06, z + 0.04, C.woodDk);
    ab.boxMinMax(bx0 + 0.003, fy + 0.18, Pg.z0 + 0.1, bx1 - 0.02, fy + 0.22, Pg.z1 - 0.1, C.woodMid);
    for (let q = 0; q < 5; q++) ib.boxMinMax(bx0 + 0.06, fy + 0.22, Pg.z0 + 0.3 + q * 0.7, bx1 - 0.08, fy + 0.4 + (q % 2) * 0.08, Pg.z0 + 0.75 + q * 0.7, q % 2 ? '#b98a5a' : '#8a6240');
    ib.boxMinMax(bx1 - 0.18, bt, Pg.z1 - 0.34, bx1 + 0.02, bt + 0.12, Pg.z1 - 0.12, '#3f6fa8');
    ib.add(GEO.cyl6, C.steel, { x: bx1 + 0.06, y: bt + 0.05, z: Pg.z1 - 0.23, sx: 0.012, sy: 0.18, sz: 0.012, rz: Math.PI / 2 });
    ib.add(GEO.cyl8, '#8f969e', { x: bx0 + 0.2, y: bt + 0.08, z: Pg.z0 + 0.35, sx: 0.06, sy: 0.16, sz: 0.06 });
    for (let q = 0; q < 4; q++) ib.add(GEO.box, ['#e0b54a', '#e0463c', '#3f8a5a', '#e0b54a'][q], { x: bx0 + 0.2 + (q % 2 - 0.5) * 0.03, y: bt + 0.2, z: Pg.z0 + 0.35 + (q - 1.5) * 0.02, sx: 0.01, sy: 0.14, sz: 0.01, rz: (q - 1.5) * 0.12 });
    ib.add(GEO.cyl12, '#f0c24f', { x: bx0 + 0.3, y: bt + 0.035, z: Pg.z0 + 1.2, sx: 0.05, sy: 0.07, sz: 0.05, rz: Math.PI / 2 });
    colliders.push({ type: 'box', minX: iMinX, maxX: bx1 + 0.04, minZ: Pg.z0 - 0.05, maxZ: Pg.z1 + 0.05 });
  }

  // ---- the paint wall: five boards of cans in many colours (a label band, a lid, a few drips), the stirrer cup, the colour-chip rack
  {
    const Pn = P.paint, za = Pn.z0, zb = Pn.z1, ys = [0.05, 0.5, 0.95, 1.4, 1.85];
    let cans = 0;
    ab.boxMinMax(Pn.x0, fy, za, Pn.x0 + 0.04, fy + Pn.h, zb, C.wood);
    ab.boxMinMax(Pn.x1 - 0.04, fy, za, Pn.x1, fy + Pn.h, zb, C.wood);
    ab.boxMinMax(Pn.x0, fy + Pn.h, za - 0.02, Pn.x1, fy + Pn.h + 0.04, zb, C.wood);
    ys.forEach((y, r) => {
      ab.boxMinMax(Pn.x0 + 0.04, fy + y - 0.03, za + 0.004, Pn.x1 - 0.04, fy + y, zb - 0.003, C.pine);
      if (M) return;   // (crib-setpiece: the model's cans)
      const by = fy + y;
      let i = 0;
      for (let x = Pn.x0 + 0.16; x < Pn.x1 - (r ? 0.13 : 0.3); x += 0.21, i++) {
        const big = r < 2, rr = big ? 0.095 : 0.075, hh = big ? 0.22 : 0.16, col = PAINTS[(i * 7 + r * 11) % PAINTS.length], zc = za + 0.16 + ((i + r) % 2) * 0.015;
        ib.add(GEO.cyl8, '#dfe3e6', { x, y: by + hh / 2, z: zc, sx: rr, sy: hh, sz: rr }); cans++;
        ib.add(GEO.cyl8, col, { x, y: by + hh * 0.45, z: zc, sx: rr + 0.003, sy: hh * 0.5, sz: rr + 0.003 });
        ib.add(GEO.cyl8, '#9aa3ad', { x, y: by + hh + 0.006, z: zc, sx: rr * 0.92, sy: 0.012, sz: rr * 0.92 });
        if ((i * 3 + r) % 7 === 2) { ib.add(GEO.box, col, { x, y: by + hh * 0.82, z: zc - rr - 0.002, sx: 0.025, sy: hh * 0.3, sz: 0.006 }); ib.add(GEO.cyl8, col, { x: x + 0.04, y: by + 0.003, z: zc - rr - 0.02, sx: 0.035, sy: 0.006, sz: 0.025 }); } // a drip down its side, a spot on the board
      }
    });
    const PW = M && cribAnchor('paint-wall');
    inside.userData.paintCans = PW ? PW.cans : cans; inside.userData.paintColours = PW ? PW.colours : new Set(PAINTS).size;
    // the stirrer cup on the bottom board's end
    const cx = Pn.x1 - 0.12, cz = za + 0.12, cy = fy + ys[0];
    ib.add(GEO.cyl8, '#c0392b', { x: cx, y: cy + 0.09, z: cz, sx: 0.06, sy: 0.18, sz: 0.06 });
    for (let k = 0; k < 6; k++) ib.add(GEO.box, '#e8d2a6', { x: cx + (k % 3 - 1) * 0.02, y: cy + 0.25, z: cz + (Math.floor(k / 3) - 0.5) * 0.02, sx: 0.022, sy: 0.3, sz: 0.004, rz: (k - 2.5) * 0.05 });
    // the colour-chip rack between the stair and the shelves: rows of little chips, each its colour
    const rx0 = ST.maxX + 0.08, rx1 = Pn.x0 - 0.04;
    ab.boxMinMax(rx0, fy + 0.95, zP - 0.045, rx1, fy + 1.85, zP - 0.006, '#e9dfc4');
    for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) ib.add(GEO.box, PAINTS[(r * 2 + c + 3) % PAINTS.length], { x: rx0 + 0.08 + c * 0.14, y: fy + 1.03 + r * 0.105, z: zP - 0.05, sx: 0.1, sy: 0.08, sz: 0.008, rx: -0.12 });
    colliders.push({ type: 'box', minX: Pn.x0, maxX: Pn.x1, minZ: za - 0.03, maxZ: zP });
  }

  // ---- the spring table: an old table, a wooden box overflowing with springs (a LOT of springs), springs spilled on the table
  // and a couple on the floor
  {
    const Tt = P.table, tx = Tt.x, tz = Tt.z, tt = Tt.top;
    ab.boxMinMax(tx - Tt.w / 2, tt - 0.05, tz - Tt.d / 2, tx + Tt.w / 2, tt, tz + Tt.d / 2, C.wood);
    for (const kx of [-1, 1]) for (const kz of [-1, 1]) ab.boxMinMax(tx + kx * (Tt.w / 2 - 0.08) - 0.04, fy, tz + kz * (Tt.d / 2 - 0.08) - 0.04, tx + kx * (Tt.w / 2 - 0.08) + 0.04, tt - 0.05, tz + kz * (Tt.d / 2 - 0.08) + 0.04, C.woodDk);
    ab.boxMinMax(tx - Tt.w / 2 + 0.06, tt - 0.16, tz - Tt.d / 2 + 0.06, tx + Tt.w / 2 - 0.06, tt - 0.05, tz + Tt.d / 2 - 0.06, C.woodMid);
    const bw = 0.62, bd = 0.42, bh = 0.22, by = tt;
    ib.boxMinMax(tx - bw / 2, by, tz - bd / 2, tx + bw / 2, by + 0.02, tz + bd / 2, '#a07850');
    for (const k of [-1, 1]) { ib.boxMinMax(tx - bw / 2, by + 0.02, tz + k * bd / 2 - (k > 0 ? 0.02 : 0), tx + bw / 2, by + bh, tz + k * bd / 2 + (k < 0 ? 0.02 : 0), '#b98a5a'); ib.boxMinMax(tx + k * bw / 2 - (k > 0 ? 0.02 : 0), by + 0.02, tz - bd / 2 + 0.02, tx + k * bw / 2 + (k < 0 ? 0.02 : 0), by + bh, tz + bd / 2 - 0.02, '#b98a5a'); }
    ib.boxMinMax(tx - 0.12, by + 0.08, tz - bd / 2 - 0.025, tx + 0.12, by + 0.15, tz - bd / 2 - 0.02, '#fbf7ee'); // its label: SPRINGS
    for (let k = 0; k < 7; k++) ib.boxMinMax(tx - 0.1 + k * 0.03, by + 0.1, tz - bd / 2 - 0.029, tx - 0.085 + k * 0.03, by + 0.13, tz - bd / 2 - 0.025, C.ink);
    // the heap: a mound of springs filling the box and rising over its rim, then the spill. The loose ones (the top of the heap,
    // the spill on the table, the few on the floor) are not baked: crib-springs.js draws them (one instanced mesh) and lets
    // them roll; `loose` lists where each starts. The packed ones deep in the box stay in the batch.
    let n = 0;
    const loose = [];
    const put = (x, y, z, s, rx, rz, i, where) => {
      const kind = i % SPRINGS.length, sc = s * (0.6 + (i % 5) * 0.12), col = SPRING[(i * 7) % SPRING.length];
      if (where) loose.push({ where, x, y, z, sc, h: SPRING_H[kind], col, rx, rz }); else ib.add(SPRINGS[kind], col, { x, y, z, sx: sc * 0.1, sy: sc * 0.085, sz: sc * 0.1, rx, rz });
      n++;
    };
    for (let i = 0; i < 70; i++) {
      const u = ((i * 0.618) % 1) * 2 - 1, v = ((i * 0.382 + 0.17) % 1) * 2 - 1, mound = Math.max(0, 1 - (u * u + v * v) * 0.6);
      put(tx + u * (bw / 2 - 0.07), by + 0.03 + mound * (bh + 0.12) * ((i % 4) / 4 + 0.45), tz + v * (bd / 2 - 0.07), 1, (i * 1.3) % 3, (i * 0.7) % 3, i, i % 4 === 3 ? 'heap' : null);
    }
    for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 0.35 + (i % 6) * 0.08; put(tx + Math.cos(a) * r * 1.4, tt + 0.03, tz + Math.sin(a) * r * 0.55, 0.9, Math.PI / 2, a, i + 3, 'table'); }
    for (let i = 0; i < 3; i++) put(tx - 0.6 + i * 0.5, fy + 0.03, tz + Tt.d / 2 + 0.15 + (i % 2) * 0.1, 1, Math.PI / 2, i, i + 1, 'floor');
    inside.userData.springs = n;
    inside.userData.looseSprings = loose;
    inside.userData.springBox = { x: tx, z: tz, w: bw, d: bd, h: bh, y: by };
    colliders.push({ type: 'box', minX: tx - Tt.w / 2 - 0.03, maxX: tx + Tt.w / 2 + 0.03, minZ: tz - Tt.d / 2 - 0.03, maxZ: tz + Tt.d / 2 + 0.03 });
    // a nail keg by it
    const kx = tx - Tt.w / 2 - 0.42, kz = tz + 0.15;
    ib.add(GEO.cyl12, '#8a6240', { x: kx, y: fy + 0.3, z: kz, sx: 0.22, sy: 0.6, sz: 0.22 });
    ib.add(GEO.cyl12, '#8f969e', { x: kx, y: fy + 0.595, z: kz, sx: 0.19, sy: 0.03, sz: 0.19 });
    for (const y of [0.1, 0.5]) ib.add(GEO.cyl12, C.iron, { x: kx, y: fy + y, z: kz, sx: 0.225, sy: 0.04, sz: 0.225 });
    colliders.push({ type: 'circle', x: kx, z: kz, r: 0.25 });
  }
  // ---- the bargain table in the middle at the back: gloves, seed packets, clothespins, flashlights, light bulbs in their boxes
  {
    const x0 = P.sx + 1.4, x1 = P.sx + 3.0, z0b = P.zP - 3.4, z1b = P.zP - 2.0, tt = fy + 0.74;
    ab.boxMinMax(x0, tt - 0.05, z0b, x1, tt, z1b, C.wood);
    for (const x of [x0 + 0.06, x1 - 0.06]) for (const z of [z0b + 0.06, z1b - 0.06]) ab.boxMinMax(x - 0.035, fy, z - 0.035, x + 0.035, tt - 0.05, z + 0.035, C.woodDk);
    ab.boxMinMax(x0 + 0.05, tt - 0.12, z0b + 0.05, x1 - 0.05, tt - 0.05, z0b + 0.08, C.woodMid);
    ib.boxMinMax(x0 + 0.08, tt, z0b + 0.1, x0 + 0.62, tt + 0.12, z0b + 0.6, '#b98a5a');
    for (let k = 0; k < 6; k++) ib.add(GEO.box, ['#e0b54a', '#7ddc7a', '#3f6fa8'][k % 3], { x: x0 + 0.18 + (k % 3) * 0.15, y: tt + 0.12, z: z0b + 0.22 + Math.floor(k / 3) * 0.2, sx: 0.12, sy: 0.02, sz: 0.16, ry: (k - 2.5) * 0.1, rx: -0.2 });
    ib.boxMinMax(x0 + 0.72, tt, z0b + 0.1, x1 - 0.1, tt + 0.1, z0b + 0.6, '#c8b08a');
    for (let k = 0; k < 8; k++) ib.add(GEO.box, '#d8b45a', { x: x0 + 0.82 + (k % 4) * 0.17, y: tt + 0.11, z: z0b + 0.2 + Math.floor(k / 4) * 0.22, sx: 0.14, sy: 0.025, sz: 0.06, ry: k * 0.4 });
    for (let k = 0; k < 4; k++) { ib.add(GEO.cyl8, ['#c0392b', '#3a3f47'][k % 2], { x: x0 + 0.3 + k * 0.32, y: tt + 0.04, z: z1b - 0.3, sx: 0.035, sy: 0.22, sz: 0.035, rz: Math.PI / 2, ry: 0.2 }); ib.add(GEO.cyl8, '#fbf7ee', { x: x0 + 0.42 + k * 0.32, y: tt + 0.04, z: z1b - 0.3 + 0.025, sx: 0.03, sy: 0.006, sz: 0.03, rz: Math.PI / 2, ry: 0.2 }); }
    for (let k = 0; k < 5; k++) ib.boxMinMax(x0 + 0.1 + k * 0.28, tt, z1b - 0.16, x0 + 0.3 + k * 0.28, tt + 0.16, z1b - 0.06, k % 2 ? '#f0c24f' : '#fbf7ee');
    colliders.push({ type: 'box', minX: x0 - 0.02, maxX: x1 + 0.02, minZ: z0b - 0.02, maxZ: z1b + 0.02 });
  }
  // ---- the cracker barrel by the west window: two old chairs, and on its lid the week's crossword (crib-crossword.js draws the
  // sheet; a checkerboard with a game half played sat here before) with a pencil by it
  {
    const cx = P.barrel.x, cz = P.barrel.z, cy = fy + 0.72;
    ib.add(GEO.cyl12, '#8a6240', { x: cx, y: fy + 0.36, z: cz, sx: 0.3, sy: 0.72, sz: 0.3 });
    for (const y of [0.12, 0.6]) ib.add(GEO.cyl12, C.iron, { x: cx, y: fy + y, z: cz, sx: 0.305, sy: 0.04, sz: 0.305 });
    ib.add(GEO.cyl12, C.woodMid, { x: cx, y: cy + 0.015, z: cz, sx: 0.36, sy: 0.03, sz: 0.36 });
    { // a yellow pencil lying by the sheet, its point toward the window
      const px = cx + 0.25, pz = cz - 0.02, ry = 0.35, a = (x, z) => [px + Math.sin(ry) * z, pz + Math.cos(ry) * z];
      const [bx, bz] = a(0, 0.02), [tx, tz] = a(0, -0.065), [ex, ez] = a(0, 0.105);
      ib.add(GEO.cyl6, '#f2c230', { x: bx, y: cy + 0.04, z: bz, sx: 0.0075, sy: 0.15, sz: 0.0075, rx: Math.PI / 2, ry });
      ib.add(GEO.cyl6, '#e8c9a0', { x: tx, y: cy + 0.04, z: tz, sx: 0.006, sy: 0.02, sz: 0.006, rx: Math.PI / 2, ry });
      ib.add(GEO.cyl6, '#f08a9a', { x: ex, y: cy + 0.04, z: ez, sx: 0.0075, sy: 0.02, sz: 0.0075, rx: Math.PI / 2, ry });
    }
    colliders.push({ type: 'circle', x: cx, z: cz, r: 0.36 });
    for (const k of [-1, 1]) { // two chairs, one either side, a little turned
      const x = cx + k * 0.72, z = cz + 0.05, yaw = k < 0 ? Math.PI / 2 - 0.2 : -Math.PI / 2 + 0.25;
      const part = (lx, ly, lz, sx2, sy2, sz2, c) => { const [px2, pz2] = turn(x, z, yaw, lx, lz); ib.add(GEO.box, c, { x: px2, y: fy + ly, z: pz2, sx: sx2, sy: sy2, sz: sz2, ry: yaw }); };
      part(0, 0.44, 0, 0.44, 0.05, 0.42, C.wood);
      for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) part(lx, 0.21, lz, 0.045, 0.42, 0.045, C.woodDk);
      for (const lx of [-0.18, 0.18]) part(lx, 0.7, -0.19, 0.045, 0.5, 0.045, C.woodDk);
      part(0, 0.86, -0.19, 0.44, 0.14, 0.04, C.wood);
      colliders.push({ type: 'circle', x, z, r: 0.27 });
    }
  }
  // ---- hanging from the beams: a canoe paddle, a galvanised bucket, a coil of rope; and the shop's pendants
  {
    const hang = (x, z, len) => ib.add(GEO.cyl6, C.iron, { x, y: top - 0.26 - len / 2, z, sx: 0.006, sy: len, sz: 0.006 });
    hang(sx + 1.6, iMinZ + 5.5, 0.6); ib.add(GEO.box, '#b98a5a', { x: sx + 1.6, y: top - 0.86 - 0.01, z: iMinZ + 5.5, sx: 1.2, sy: 0.04, sz: 0.12, rz: 0.05 }); ib.add(GEO.sphere, '#b98a5a', { x: sx + 2.2, y: top - 0.84, z: iMinZ + 5.5, sx: 0.18, sy: 0.02, sz: 0.09 });
    hang(sx - 0.9, iMinZ + 7.3, 0.5); ib.add(GEO.cyl12, '#b4b9be', { x: sx - 0.9, y: top - 0.9, z: iMinZ + 7.3, sx: 0.15, sy: 0.26, sz: 0.15 });
    hang(sx + 3.0, iMinZ + 3.0, 0.45); for (let q = 0; q < 3; q++) ib.add(new THREE.TorusGeometry(0.16, 0.03, 5, 14), '#c9b07a', { x: sx + 3.0, y: top - 0.82 - q * 0.05, z: iMinZ + 3.0, rx: Math.PI / 2 + q * 0.1 });
    for (const z of [iMinZ + 2.4, iMinZ + 6.1]) { pendant(ib, shopBulbs, sx - 0.4, z, fy + 3.0, top - 0.02); spot(SHOP_SPOTS, { x: sx - 0.4, y: fy + 2.9, z, color: '#ffe7a8', pool: 2.6, gy: fy, halo: 0 }); }
    pendant(ib, shopBulbs, sx - 2.6, iMinZ + 8.6, fy + 3.0, top - 0.02);
    spot(SHOP_SPOTS, { x: sx - 2.6, y: fy + 2.9, z: iMinZ + 8.6, color: '#ffe7a8', pool: 2.2, gy: fy, halo: 0 });
  }

  // ------------------------------------------------------------ the loft: Kevin's room over the back
  {
    const L = P.loft;
    ab.boxMinMax(iMinX, LY - 0.25, zP + 0.006, iMaxX, LY - 0.03, iMaxZ, C.plank);
    planks(ab, iMinX, iMaxX, zP + 0.006, iMaxZ, LY);
    // knotty pine walls
    holey(ab, 'z', zL, iMaxZ, iMinX, iMinX + sk, LY, top - 0.06, [], C.pine);
    holey(ab, 'z', zL, iMaxZ, iMaxX - sk, iMaxX, LY, top - 0.06, [P.eastWin], C.pine);
    holey(ab, 'x', iMinX + sk, iMaxX - sk, iMaxZ - sk, iMaxZ, LY, top - 0.06, [P.backWin], C.pine);
    holey(ab, 'x', ST.maxX, iMaxX - sk, zL, zL + sk, LY, top - 0.06, [], C.pine);
    // (no painted knots: little bumps on a wall ink as specks)
    // the stair's doorway: a casing on the loft's side
    ab.boxMinMax(ST.maxX - 0.003, LY, zL - 0.003, ST.maxX + 0.08, LY + 2.12, zL + sk + 0.02, C.woodMid);
    ab.boxMinMax(iMinX + sk, LY + 2.12 - 0.003, zL - 0.003, ST.maxX + 0.08, LY + 2.22, zL + sk + 0.02, C.woodMid);
    // a braided rug, oval
    for (const [r, c] of [[1.0, '#7a2140'], [0.84, '#e8c27a'], [0.66, '#3f6fa8'], [0.46, '#b8574a'], [0.26, '#e8c27a']]) ib.add(GEO.cyl12, c, { x: sx - 0.4, y: LY + 0.004 + (1 - r) * 0.02, z: zL + 2.5, sx: r * 1.8, sy: 0.006, sz: r });
    // the bed: a wooden frame, a headboard against the back wall, the mattress, a patchwork quilt, a pillow
    const B = P.bed, bt = LY + 0.5;
    ab.boxMinMax(B.minX, LY, B.minZ, B.maxX, LY + 0.32, B.maxZ - sk, C.woodMid);
    ab.boxMinMax(B.minX - 0.04, LY, B.maxZ - sk - 0.08, B.maxX + 0.04, LY + 1.05, B.maxZ - sk - 0.003, C.woodDk);
    ab.boxMinMax(B.minX - 0.04, LY, B.minZ - 0.003, B.maxX + 0.04, LY + 0.6, B.minZ + 0.06, C.woodDk);
    ab.boxMinMax(B.minX + 0.03, LY + 0.32, B.minZ + 0.06, B.maxX - 0.03, bt, B.maxZ - sk - 0.08, '#f4ecd6');
    const qx0 = B.minX + 0.01, qx1 = B.maxX - 0.01, qz0 = B.minZ + 0.07, qz1 = B.maxZ - 0.55, nx = 4, nz = 6;
    if (!M) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) ib.boxMinMax(qx0 + (qx1 - qx0) * i / nx, bt, qz0 + (qz1 - qz0) * j / nz, qx0 + (qx1 - qx0) * (i + 1) / nx, bt + 0.04 + ((i + j) % 2) * 0.004, qz0 + (qz1 - qz0) * (j + 1) / nz, ['#c0392b', '#e8c27a', '#3f6fa8', '#7ddc7a', '#f4ecd6', '#b48cff'][(i * 2 + j * 3) % 6]);
    ab.boxMinMax(qx0 - 0.02, bt - 0.15, qz0, qx0 + 0.003, bt + 0.03, qz1, '#c0392b');
    ab.boxMinMax(qx1 - 0.003, bt - 0.15, qz0, qx1 + 0.02, bt + 0.03, qz1, '#3f6fa8');
    ab.add(GEO.sphere, '#fbf7ee', { x: (B.minX + B.maxX) / 2, y: bt + 0.07, z: B.maxZ - 0.35, sx: 0.38, sy: 0.09, sz: 0.18 });
    colliders.push({ type: 'box', minX: B.minX - 0.05, maxX: B.maxX + 0.05, minZ: B.minZ - 0.03, maxZ: iMaxZ, minY: LY - 1 });
    // the nightstand: a lamp (lit with the loft's bulbs), his reading glasses on a book
    const nx0 = B.maxX + 0.08, nz0 = B.maxZ - 0.55;
    ab.boxMinMax(nx0, LY, nz0, nx0 + 0.45, LY + 0.55, iMaxZ - sk - 0.003, C.woodMid);
    ib.boxMinMax(nx0 + 0.1, LY + 0.55, nz0 + 0.15, nx0 + 0.3, LY + 0.58, nz0 + 0.38, '#3f6fa8');
    ib.add(new THREE.TorusGeometry(0.025, 0.004, 4, 10), C.ink, { x: nx0 + 0.17, y: LY + 0.585, z: nz0 + 0.26, rx: Math.PI / 2 }); ib.add(new THREE.TorusGeometry(0.025, 0.004, 4, 10), C.ink, { x: nx0 + 0.23, y: LY + 0.585, z: nz0 + 0.26, rx: Math.PI / 2 });
    ib.add(GEO.cyl8, C.brass, { x: nx0 + 0.32, y: LY + 0.7, z: nz0 + 0.38, sx: 0.015, sy: 0.3, sz: 0.015 });
    ib.add(GEO.cyl8, C.brass, { x: nx0 + 0.32, y: LY + 0.56, z: nz0 + 0.38, sx: 0.07, sy: 0.02, sz: 0.07 });
    ib.add(GEO.cone8, '#f3e3c3', { x: nx0 + 0.32, y: LY + 0.9, z: nz0 + 0.38, sx: 0.13, sy: 0.16, sz: 0.13 });
    loftBulbs.add(GEO.sphere, '#ffe7a8', { x: nx0 + 0.32, y: LY + 0.84, z: nz0 + 0.38, sx: 0.05, sy: 0.05, sz: 0.05 });
    spot(LOFT_SPOTS, { x: nx0 + 0.32, y: LY + 0.8, z: nz0 + 0.38, color: '#ffe0a0', pool: 1.3, gy: LY, halo: 0 });
    colliders.push({ type: 'box', minX: nx0, maxX: nx0 + 0.45, minZ: nz0, maxZ: iMaxZ, minY: LY - 1 });
    // the wardrobe on the west wall
    const Wd = P.wardrobe;
    ab.boxMinMax(Wd.minX + sk, LY, Wd.minZ, Wd.maxX, LY + 2.0, Wd.maxZ, C.woodMid);
    ab.boxMinMax(Wd.minX + sk - 0.003, LY + 2.0, Wd.minZ - 0.04, Wd.maxX + 0.04, LY + 2.08, Wd.maxZ + 0.04, C.woodDk);
    for (const k of [0, 1]) { const za = Wd.minZ + 0.05 + k * (Wd.maxZ - Wd.minZ - 0.1) / 2; ab.boxMinMax(Wd.maxX - 0.003, LY + 0.15, za + 0.02, Wd.maxX + 0.015, LY + 1.88, za + (Wd.maxZ - Wd.minZ - 0.1) / 2 - 0.02, C.wood); ib.add(GEO.sphere, C.brass, { x: Wd.maxX + 0.03, y: LY + 1.0, z: za + (k ? 0.06 : (Wd.maxZ - Wd.minZ - 0.1) / 2 - 0.06), sx: 0.025, sy: 0.025, sz: 0.025 }); }
    colliders.push({ type: 'box', minX: Wd.minX, maxX: Wd.maxX + 0.04, minZ: Wd.minZ - 0.04, maxZ: Wd.maxZ + 0.04, minY: LY - 1 });
    // the armchair by the east window, a side table with his mug
    const Ch = P.chair, cyw = Ch.yaw, cpart = (lx, ly, lz, sx2, sy2, sz2, c) => { const [px, pz] = turn(Ch.x, Ch.z, cyw, lx, lz); ab.add(GEO.box, c, { x: px, y: LY + ly, z: pz, sx: sx2, sy: sy2, sz: sz2, ry: cyw }); };
    cpart(0, 0.22, 0, 0.72, 0.3, 0.7, '#8a3b34'); cpart(0, 0.42, 0.02, 0.56, 0.1, 0.6, '#a84a40'); cpart(0, 0.72, -0.3, 0.72, 0.62, 0.14, '#8a3b34');
    for (const k of [-1, 1]) cpart(k * 0.31, 0.5, 0.02, 0.12, 0.26, 0.66, '#8a3b34');
    for (const kx of [-1, 1]) for (const kz of [-1, 1]) cpart(kx * 0.28, 0.04, kz * 0.28, 0.06, 0.08, 0.06, C.woodDk);
    colliders.push({ type: 'circle', x: Ch.x, z: Ch.z, r: 0.42, minY: LY - 1 });
    const [tx2, tz2] = turn(Ch.x, Ch.z, cyw, 0.62, 0.15);
    ib.add(GEO.cyl8, C.woodMid, { x: tx2, y: LY + 0.28, z: tz2, sx: 0.04, sy: 0.56, sz: 0.04 }); ib.add(GEO.cyl12, C.wood, { x: tx2, y: LY + 0.57, z: tz2, sx: 0.22, sy: 0.03, sz: 0.22 });
    ib.add(GEO.cyl8, '#fbf7ee', { x: tx2, y: LY + 0.635, z: tz2, sx: 0.045, sy: 0.1, sz: 0.045 });
    colliders.push({ type: 'circle', x: tx2, z: tz2, r: 0.22, minY: LY - 1 });
    // the little kitchen along the partition: a counter with cupboard doors, a sink, a hot plate and the kettle, a shelf of mugs;
    // the little stove in the corner, its pipe up through the roof
    const Kt = P.kitchen, kt = LY + 0.9;
    ab.boxMinMax(Kt.minX, LY, zL + sk, Kt.maxX - sk - 0.75, kt - 0.04, Kt.maxZ, C.wood);
    ab.boxMinMax(Kt.minX - 0.02, kt - 0.04, zL + sk, Kt.maxX - sk - 0.73, kt, Kt.maxZ + 0.03, '#e9dfc4');
    for (let k = 0; k < 3; k++) ab.boxMinMax(Kt.minX + 0.06 + k * 0.7, LY + 0.1, Kt.maxZ - 0.003, Kt.minX + 0.66 + k * 0.7, kt - 0.12, Kt.maxZ + 0.015, '#9fb3a6');
    ib.boxMinMax(Kt.minX + 0.25, kt - 0.003, zL + 0.15, Kt.minX + 0.75, kt + 0.006, Kt.maxZ - 0.08, '#b4b9be');
    ib.boxMinMax(Kt.minX + 0.3, kt + 0.006 - 0.003, zL + 0.2, Kt.minX + 0.7, kt + 0.008, Kt.maxZ - 0.13, '#8f969e');
    ib.add(GEO.cyl6, C.steel, { x: Kt.minX + 0.5, y: kt + 0.15, z: zL + 0.1, sx: 0.02, sy: 0.3, sz: 0.02 }); ib.add(GEO.cyl6, C.steel, { x: Kt.minX + 0.5, y: kt + 0.29, z: zL + 0.17, sx: 0.015, sy: 0.14, sz: 0.015, rx: Math.PI / 2 });
    ib.boxMinMax(Kt.minX + 1.15, kt, zL + 0.12, Kt.minX + 1.6, kt + 0.05, Kt.maxZ - 0.1, C.ink);
    for (const k of [0, 1]) ib.add(GEO.cyl12, '#5a2a22', { x: Kt.minX + 1.27 + k * 0.21, y: kt + 0.055, z: zL + 0.35, sx: 0.07, sy: 0.006, sz: 0.07 });
    ib.add(GEO.sphere, '#c0392b', { x: Kt.minX + 1.27, y: kt + 0.13, z: zL + 0.35, sx: 0.09, sy: 0.08, sz: 0.09 }); ib.add(GEO.cyl6, '#c0392b', { x: Kt.minX + 1.18, y: kt + 0.16, z: zL + 0.35, sx: 0.012, sy: 0.12, sz: 0.012, rz: 0.9 }); ib.add(new THREE.TorusGeometry(0.05, 0.008, 4, 10, Math.PI), C.ink, { x: Kt.minX + 1.27, y: kt + 0.2, z: zL + 0.35 });
    ab.boxMinMax(Kt.minX, LY + 1.55, zL + sk, Kt.maxX - sk - 0.75, LY + 1.58, zL + 0.28, C.wood);
    for (let k = 0; k < 4; k++) ib.add(GEO.cyl8, ['#fbf7ee', '#3f6fa8', '#c0392b', '#f0c24f'][k], { x: Kt.minX + 0.2 + k * 0.4, y: LY + 1.635, z: zL + 0.17, sx: 0.045, sy: 0.1, sz: 0.045 });
    const stx = Kt.maxX - sk - 0.36, stz = zL + 0.35;
    ab.boxMinMax(stx - 0.26, LY + 0.12, stz - 0.22, stx + 0.26, LY + 0.62, stz + 0.22, C.ink);
    for (const kx of [-1, 1]) for (const kz of [-1, 1]) ab.add(GEO.box, C.ink, { x: stx + kx * 0.22, y: LY + 0.06, z: stz + kz * 0.18, sx: 0.04, sy: 0.12, sz: 0.04 });
    ab.add(GEO.cyl8, C.ink, { x: stx, y: (LY + 0.62 + top) / 2, z: stz, sx: 0.07, sy: top - LY - 0.62, sz: 0.07 });
    ib.boxMinMax(stx - 0.12, LY + 0.25, stz - 0.223, stx + 0.12, LY + 0.45, stz - 0.218, '#5a2a22');
    colliders.push({ type: 'box', minX: Kt.minX, maxX: iMaxX, minZ: zL, maxZ: Kt.maxZ + 0.05, minY: LY - 1 });
    // the table for one with a chair, a plate
    const Lu = P.lunch;
    ab.boxMinMax(Lu.x - 0.35, LY + 0.72, Lu.z - 0.3, Lu.x + 0.35, LY + 0.76, Lu.z + 0.3, C.wood);
    for (const kx of [-1, 1]) for (const kz of [-1, 1]) ab.boxMinMax(Lu.x + kx * 0.3 - 0.025, LY, Lu.z + kz * 0.25 - 0.025, Lu.x + kx * 0.3 + 0.025, LY + 0.72, Lu.z + kz * 0.25 + 0.025, C.woodDk);
    ib.add(GEO.cyl12, '#fbf7ee', { x: Lu.x, y: LY + 0.765, z: Lu.z, sx: 0.12, sy: 0.006, sz: 0.12 });
    ab.boxMinMax(Lu.x - 0.2, LY + 0.44, Lu.z + 0.42, Lu.x + 0.2, LY + 0.48, Lu.z + 0.8, C.woodMid);
    ab.boxMinMax(Lu.x - 0.2, LY + 0.48, Lu.z + 0.76, Lu.x + 0.2, LY + 0.95, Lu.z + 0.8, C.woodMid);
    for (const kx of [-1, 1]) for (const kz of [0.45, 0.77]) ab.boxMinMax(Lu.x + kx * 0.17 - 0.02, LY, Lu.z + kz - 0.02, Lu.x + kx * 0.17 + 0.02, LY + 0.44, Lu.z + kz + 0.02, C.woodDk);
    colliders.push({ type: 'box', minX: Lu.x - 0.37, maxX: Lu.x + 0.37, minZ: Lu.z - 0.32, maxZ: Lu.z + 0.82, minY: LY - 1 });
    // the rod rack on the partition: four rods standing in it, a landing net, his waders and hat on pegs, boots, his tackle box
    const R = P.rack, rz = zL + sk;
    ab.boxMinMax(R.x0, LY + 0.25, rz, R.x1, LY + 0.32, rz + 0.12, C.woodDk);
    ab.boxMinMax(R.x0, LY + 1.55, rz, R.x1, LY + 1.62, rz + 0.12, C.woodDk);
    for (let k = 0; k < 4; k++) { const x = R.x0 + 0.2 + k * (R.x1 - R.x0 - 0.4) / 3; ib.add(GEO.cyl6, ['#3a3f47', '#8a5a3a', '#2f5442', '#c0392b'][k], { x, y: LY + 1.2, z: rz + 0.07, sx: 0.012, sy: 2.3, sz: 0.012 }); ib.add(GEO.cyl8, C.steel, { x: x + 0.03, y: LY + 0.55, z: rz + 0.09, sx: 0.04, sy: 0.03, sz: 0.04, rz: Math.PI / 2 }); }
    ib.add(GEO.cyl6, '#b98a5a', { x: R.x1 + 0.25, y: LY + 0.6, z: rz + 0.06, sx: 0.015, sy: 1.2, sz: 0.015, rz: 0.1 });
    ib.add(new THREE.TorusGeometry(0.2, 0.012, 4, 14), '#b98a5a', { x: R.x1 + 0.3, y: LY + 1.38, z: rz + 0.06 });
    for (const y of [0.08, 0.25]) ib.add(GEO.sphere, '#d8c9a8', { x: R.x1 + 0.3, y: LY + 1.38 - 0.1 - y * 0.6, z: rz + 0.06, sx: 0.16 - y * 0.2, sy: 0.08, sz: 0.04 });
    for (const x of [R.x0 - 0.5, R.x0 - 0.9]) ib.boxMinMax(x - 0.02, LY + 1.68, rz, x + 0.02, LY + 1.72, rz + 0.1, C.woodDk);
    ib.boxMinMax(R.x0 - 0.65, LY + 0.55, rz + 0.03, R.x0 - 0.35, LY + 1.68, rz + 0.12, '#3f5a3a');
    ib.add(GEO.cyl12, '#6b6452', { x: R.x0 - 0.9, y: LY + 1.6, z: rz + 0.12, sx: 0.13, sy: 0.1, sz: 0.13 }); ib.add(GEO.cyl12, '#6b6452', { x: R.x0 - 0.9, y: LY + 1.55, z: rz + 0.12, sx: 0.19, sy: 0.015, sz: 0.19 });
    for (const k of [0, 1]) { ib.boxMinMax(R.x0 - 0.75 + k * 0.17, LY, rz + 0.18, R.x0 - 0.63 + k * 0.17, LY + 0.36, rz + 0.3, '#2b2b2f'); ib.boxMinMax(R.x0 - 0.75 + k * 0.17, LY, rz + 0.3, R.x0 - 0.63 + k * 0.17, LY + 0.1, rz + 0.45, '#2b2b2f'); }
    ib.boxMinMax(R.x1 - 0.5, LY, rz + 0.25, R.x1 - 0.05, LY + 0.2, rz + 0.5, '#3f7a4f'); ib.boxMinMax(R.x1 - 0.51, LY + 0.2, rz + 0.24, R.x1 - 0.04, LY + 0.24, rz + 0.51, '#2f5d3c');
    colliders.push({ type: 'box', minX: R.x0 - 0.95, maxX: R.x1 + 0.35, minZ: zL, maxZ: rz + 0.5, minY: LY - 1 });
    // the ceiling lamp in the middle of the loft
    const cx = sx - 0.4, cz = zL + 2.5;
    ib.add(GEO.cyl8, C.brass, { x: cx, y: top - 0.08, z: cz, sx: 0.12, sy: 0.04, sz: 0.12 });
    ib.add(GEO.cone8, '#e9dfc4', { x: cx, y: top - 0.2, z: cz, sx: 0.28, sy: 0.16, sz: 0.28 });
    loftBulbs.add(GEO.sphere, '#fff3c4', { x: cx, y: top - 0.27, z: cz, sx: 0.1, sy: 0.07, sz: 0.1 });
    spot(LOFT_SPOTS, { x: cx, y: top - 0.4, z: cz, color: '#ffe7a8', pool: 3.2, gy: LY, halo: 0 });
  }
  const clutterIn = clutterInside(ib, inside, colliders, M ? cribItem : null, ab);   // the klepto handyman's clutter (crib-clutter.js; crib-clutter-2: the model remodelled its bikes, ladders, mowers and tool chest: counted in `ab` when it loaded)
  clutterIn.push(...clutterMore(ib, inside, colliders, { bulbs: shopBulbs, spot: s => spot(SHOP_SPOTS, s) }, ab));   // and round 2, the motorcycle corner's shop light (crib-more.js; its other pieces are the model's too)
  ib.build(inside, 'tool-crib-inside');
  gb.build(inside, 'tool-crib-glassware').forEach(m => { m.renderOrder = 2; soft(m); });
  shopBulbs.build(inside, 'crib-bulbs');
  loftBulbs.build(inside, 'crib-bulbs-loft');

  // the photos of his boat over the bed: three frames (the pictures are one canvas, tool-crib.js paints it)
  const photoMat = new THREE.MeshBasicMaterial({ fog: true });
  const photos = [];
  {
    const pb = new Batcher({ vertexColors: true, castShadow: false }), z = iMaxZ - sk;
    [[P.bed.minX - 0.55, LY + 1.55, 0.42, 0.32], [(P.bed.minX + P.bed.maxX) / 2, LY + 1.75, 0.55, 0.4], [P.bed.maxX + 0.55, LY + 1.5, 0.36, 0.44]].forEach(([x, y, w, h], i) => {
      pb.boxMinMax(x - w / 2 - 0.04, y - h / 2 - 0.04, z - 0.03, x + w / 2 + 0.04, y + h / 2 + 0.04, z - 0.003, i === 1 ? C.woodDk : '#c9a23a');
      const q = new THREE.PlaneGeometry(w, h), uv = q.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
      q.rotateY(Math.PI); q.translate(x, y, z - 0.032); photos.push(q);
    });
    pb.build(inside, 'crib-photo-frames');
    const pm = new THREE.Mesh(mergeGeometries(photos, false), photoMat); pm.name = 'crib-photos'; pm.matrixAutoUpdate = false; pm.updateMatrix(); inside.add(pm);
  }

  // (crib-window) the glass view: from the camera's distance to the crib the display windows go see-through and the inside is drawn
  // (tool-crib.js ORs it into its own rule and updates it every frame)
  const glassView = createGlassView({ boxes: [worldBox({ minX, maxX, minZ, maxZ })], meshes: () => glassMeshes, mats: [glassReal], U: glassU });
  inside.userData.clutter = [...clutterOut, ...clutterIn, ...clutterSigns(inside)];
  // the colliders out to the world (the same objects: tool-crib.js switches doorCol off and on), their plan-frame copies kept
  const localColliders = colliders.map(c => ({ ...c }));
  for (const c of colliders) worldColliders.push(worldCollider(c));
  return { group: g, inside, screen, inner, doorCol, glassShop, glassLoft, glassReal, glassMeshes, glassView, awning: awningMesh, photoMat, shopLamps: SHOP_SPOTS.splice(0), loftLamps: LOFT_SPOTS.splice(0), sign: SGN, bulbs: BULBS, loftBulbs: LOFT_BULBS, localColliders, curtain, bike: inside.userData.bike, model: !!M, replacedTris: NOPE.tris, signAt: cribAnchor('sign'), saleAt: cribAnchor('display-sale') };
}
