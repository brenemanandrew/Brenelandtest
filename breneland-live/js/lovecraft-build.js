// H. P. Lovecraft's house: 454 Angell Street, Providence, his birthplace and boyhood home (built by his grandfather Whipple Van
// Buren Phillips, torn down in 1961), on the corner lot inside Breneland Rd's bend (layout.js LOVECRAFT_HOUSE). From Andrew's photo
// docs/refs/andrew-lovecraft-454-angell.png (a big Second Empire house: two full storeys of tall shuttered windows in clapboard, a
// steep mansard roof with a gabled dormer and a tall chimney, a bay on the side, a porch with steps at the entrance, an iron fence
// with stone posts along the street, shade trees) and Lovecraft's own words (hplovecraft.com, cromwell-intl.com): "raised on a
// high green terrace", grounds "almost a park" with walks, arbours, trees and a fountain, on a corner lot. Cel-shaded and chunky
// in the house style.
//
// Two floors in a height field, the game store's way (game-store-build.js): every (x, z) has one floor. Downstairs the front
// half is walkable (the hall with the staircase on the east, the parlour with the Arkham table on the west); the back half
// (the dining room and the kitchen) is shut. Upstairs the back half is walkable (the landing at the top of the stairs and the
// study), over those shut rooms. So: no walkable ground-floor spot under the upper floor, and colliders (2D) on one floor
// never fall on walkable ground of the other.
//
// buildLovecraftHouse(scene, colliders) -> { ext, inside, door, doorCol, plan, lamps, ... } for lovecraft-house.js.
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { GRADIENT_3, shadows, soft } from './toon.js';
import { addSurface } from './terrain.js';
import { cutRect } from './house.js';
import { realGlass, glassUniforms } from './real-glass.js';
import { LOVECRAFT_HOUSE as L } from './layout.js';
import { lampGlow, addNightSpot as addSpot, NIGHT_SPOTS } from './daynight-mats.js';
import { wallpaper, planks, rug, portrait, starChart, printed } from './lovecraft-art.js';
import { mulberry32, hash01 } from './util.js';
import { buildHearth, buildEmbers, firebox } from './hearth-build.js';
import { addTree, LEAF } from './world-trees.js';
import { lovecraftModel, lovecraftGeometry, lovecraftMaterial, lovecraftAnchor, lovecraftAnchors, lovecraftSkin } from './lovecraft-model.js';

import { HX, HZ, TY, FY, H1, UY, EAVE, HW, HD, WT, IU, IV, BV, PU, ST, DOOR, PORCH, BAY, TABLE, CHAIR_SEAT, CHAIR_SIT, CHAIR_DIST, WING, WING_AT, C } from './lovecraft-plan.js';
export { HX, HZ, TY, FY, H1, UY, EAVE, CHAIR_SEAT, CHAIR_SIT, CHAIR_DIST, WING }; // (lovecraft-setpiece: the plan's numbers live in lovecraft-plan.js, dumped for the Blender build)
const X = u => HX + u, Z = v => HZ + v;                  // house-local (u east, v south of the middle) to world

// ---------------------------------------------------------------- geometry helpers
// a rectangular frustum (the mansard): bottom half sizes (bw, bd) at y 0, top (tw, td) at y h, flat top; non-indexed (flat faces)
function frustum(bw, bd, tw, td, h, top = true) {
  const B = [[-bw, -bd], [bw, -bd], [bw, bd], [-bw, bd]], T = [[-tw, -td], [tw, -td], [tw, td], [-tw, td]];
  const p = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, b0 = B[i], b1 = B[j], t0 = T[i], t1 = T[j];
    p.push(b0[0], 0, b0[1], t1[0], h, t1[1], b1[0], 0, b1[1], b0[0], 0, b0[1], t0[0], h, t0[1], t1[0], h, t1[1]);
  }
  if (top) p.push(T[0][0], h, T[0][1], T[2][0], h, T[2][1], T[1][0], h, T[1][1], T[0][0], h, T[0][1], T[3][0], h, T[3][1], T[2][0], h, T[2][1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
  return g;
}
// a gable prism: base width w on y 0, peak h, depth d along z, centred
function prism(w, h, d) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}
// a plane of w x h whose texture repeats every `tile` metres (wallpaper, floorboards); (u0, v0): where it starts in a bigger piece of
// the same paper, metres (a wall papered round a window carries its pattern on)
function tiled(w, h, tile, u0 = 0, v0 = 0) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * w) / tile, (v0 + uv.getY(i) * h) / tile);
  return g;
}
// the stretches of lo..hi left between gaps ([a, b] each, any order, may overlap)
function spans(lo, hi, gaps) {
  const out = [];
  let a = lo;
  for (const [p, q] of gaps.slice().sort((x, y) => x[0] - y[0])) { if (p > a) out.push([a, Math.min(p, hi)]); a = Math.max(a, q); if (a >= hi) break; }
  if (a < hi) out.push([a, hi]);
  return out.filter(([p, q]) => q - p > 0.005);
}
const tmat = (map, extra = {}) => new THREE.MeshToonMaterial({ map, gradientMap: GRADIENT_3, ...extra });

// A face frame: origin (x, z) on a wall plane, `yaw` = its outward normal (sin yaw, cos yaw); `a` runs along it (cos yaw, -sin yaw),
// `out` along the normal. fbox() adds a box laid on that frame.
const F = (x, z, yaw) => ({ x, z, yaw, tx: Math.cos(yaw), tz: -Math.sin(yaw), nx: Math.sin(yaw), nz: Math.cos(yaw) });
function fbox(b, f, a, y, out, sa, sy, so, mat) {
  b.add(GEO.box, mat, { x: f.x + f.tx * a + f.nx * out, y, z: f.z + f.tz * a + f.nz * out, sx: sa, sy, sz: so, ry: f.yaw });
}
function fadd(b, f, geo, mat, a, y, out, o = {}) { b.add(geo, mat, { ...o, x: f.x + f.tx * a + f.nx * out, y, z: f.z + f.tz * a + f.nz * out, ry: f.yaw + (o.ry || 0) }); }

// the house's four outer faces (a = metres along, from the middle): S front (a = u), N back (a = -u), W (a = v), E (a = -v)
const FACE = { S: F(HX, Z(HD), 0), N: F(HX, Z(-HD), Math.PI), W: F(X(-HW), HZ, -Math.PI / 2), E: F(X(HW), HZ, Math.PI / 2) };
// and the inner faces of the rooms you can walk in, looking into the room
const IN = { S: F(HX, Z(IV), Math.PI), N: F(HX, Z(-IV), 0), W: F(X(-IU), HZ, Math.PI / 2), E: F(X(IU), HZ, -Math.PI / 2) };

export function buildLovecraftHouse(scene, colliders) {
  const root = new THREE.Group(); root.name = 'lovecraft-house'; scene.add(root);
  const ext = new THREE.Group(); ext.name = 'lovecraft-ext'; root.add(ext);
  const inside = new THREE.Group(); inside.name = 'lovecraft-inside'; root.add(inside);
  // (lovecraft-setpiece) the Blender set piece, when it loaded (lovecraft-model.js): the shell and the furnished rooms come from the
  // model (its parts go into these same batches with its baked sheet as their material: the pieces the code still builds share the
  // draw call), and the code's own versions of what the model has are built into NOPE, a batcher that only counts what it was handed
  // (the fallback is the whole old house, so nothing is deleted). What the code keeps building: the door, the glass (real, lit and
  // the sidelights), the number plate, the lamps' glowing glass (at the model's `glow-*` anchors), the portrait and the star chart
  // (at `portrait` and `chart`), the fires and their fireboxes, the candles' wicks, the maze door's leaf, the game on the table
  const M = lovecraftModel(), nowMs = Date.now();
  const NOPE = { tris: 0, add(geo) { NOPE.tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; return NOPE; }, boxMinMax() { NOPE.tris += 12; return NOPE; }, build() { return []; } };
  const KEEP = new Set(); // the material pieces the model does not have (the code keeps them): filled below
  const route = real => M ? { add(geo, mat, o) { return (typeof mat !== 'string' && KEEP.has(mat) ? real : NOPE).add(geo, mat, o); }, boxMinMax(...a) { return (typeof a[6] !== 'string' && KEEP.has(a[6]) ? real : NOPE).boxMinMax(...a); }, build(p, nm) { return real.build(p, nm); } } : real;
  const bReal = new Batcher({ vertexColors: true });                     // the outside (casts shadows)
  const nReal = new Batcher({ vertexColors: true, castShadow: false });  // the inside
  const b = route(bReal), n = route(nReal);
  const cl = M ? NOPE : new Batcher({ vertexColors: true, castShadow: false });     // the clapboard's lap lines: drawn, never inked (soft layer); in the paint when the model is
  const seasonMeshes = {};
  if (M) {
    // (lovecraft-hires) each part is its own mesh with the model's material (the atlas live under its light sheet: lovecraft-model.js),
    // one draw a part as the batch was; the code-built pieces round it keep the plain vertex-colour batches. Never merged: the material
    // carries its own attributes and the seasonal parts show and hide
    const partMesh = (part, into, name) => { const m = new THREE.Mesh(lovecraftGeometry(part), lovecraftMaterial(M.parts[part].sheet)); m.name = name; m.userData.noMerge = true; m.matrixAutoUpdate = false; into.add(m); return m; };
    partMesh('shell', ext, 'lovecraft-shell-model'); partMesh('inside', inside, 'lovecraft-inside-model');
    for (const [part, P] of Object.entries(M.parts)) if (P.season) { const m = partMesh(part, root, 'lovecraft-' + part); m.castShadow = false; m.visible = P.season === lovecraftSkin(nowMs); seasonMeshes[part] = { mesh: m, season: P.season }; } // (drawn in their season only: lovecraft-house.js; on the root, not ext: nothing of the outside is ever hidden)
  }
  const gb = new Batcher({ castShadow: false });                         // the see-through panes
  const glassU = glassUniforms(), REALW = []; // the panes' shared uniforms; every real window's hole, world (for the paper)
  const INDOOR = [], hearths = [], candles = []; // the indoor lamps; the fireplaces (hearth-build.js specs: the fires are fires.js's)
  const spot = (s, indoor = true) => { addSpot(s); if (indoor) INDOOR.push(NIGHT_SPOTS[NIGHT_SPOTS.length - 1]); };
  const lot = L.lot, gx = L.gate.x, [c0, c1] = lot.corner;
  const zLine = x => c0[1] + (x - c0[0]) * (c1[1] - c0[1]) / (c1[0] - c0[0]); // the chamfer round the bend's corner
  const glassIn = new THREE.MeshBasicMaterial({ color: '#cfe4f2', fog: false }); glassIn.name = 'lovecraft-glass-in'; // daylight through the glass, from inside (the feature dims it at night)
  // the glass from outside: old dark panes by day (Andrew's photo), lamplight in the rooms you can walk in at night, the rest dark (the feature sets them)
  const glassLit = new THREE.MeshBasicMaterial({ color: '#5a7491', fog: true }), glassDark = new THREE.MeshBasicMaterial({ color: '#5a7491', fog: true }); glassLit.name = 'lovecraft-glass-lit'; glassDark.name = 'lovecraft-glass-dark';
  KEEP.add(glassLit);
  // the panes of the rooms you can walk in: glassLit's look far off, see-through near (the feature sets its colour too)
  const glassReal = realGlass(glassLit, glassU, 'lovecraft-glass-real');

  // ================================================================ the lot: a raised green terrace with a stone wall
  const notchD = 0.75; // the steps up from the sidewalk are cut into its front
  const shape = new THREE.Shape([[lot.maxX, lot.maxZ], [gx + 0.85, lot.maxZ], [gx + 0.85, lot.maxZ - notchD], [gx - 0.85, lot.maxZ - notchD], [gx - 0.85, lot.maxZ],
    [c0[0], c0[1]], [c1[0], c1[1]], [lot.minX, lot.minZ], [lot.maxX, lot.minZ]].map(([x, z]) => new THREE.Vector2(x, z)));
  const slab = new THREE.ExtrudeGeometry(shape, { depth: TY - 0.2, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, TY, 0);
  b.add(slab, C.grass);
  // walkable: rectangles inside the outline (the chamfer as 0.4 m strips under its line)
  addSurface({ minX: gx + 0.85, maxX: lot.maxX, minZ: lot.minZ, maxZ: lot.maxZ, y: TY });
  addSurface({ minX: c0[0], maxX: gx - 0.85, minZ: lot.minZ, maxZ: lot.maxZ, y: TY });
  addSurface({ minX: gx - 0.85, maxX: gx + 0.85, minZ: lot.minZ, maxZ: lot.maxZ - notchD, y: TY });
  for (let x0 = lot.minX; x0 < c0[0] - 1e-6; x0 += 0.4) addSurface({ minX: x0, maxX: Math.min(c0[0], x0 + 0.4), minZ: lot.minZ, maxZ: zLine(x0) - 0.05, y: TY });
  // the steps: three risers from the ground behind the sidewalk, and a flagstone apron to them
  for (let i = 0; i < 3; i++) {
    const z1 = lot.maxZ - i * 0.25, z0 = z1 - 0.25, y = 0.54 + i * 0.2;
    b.boxMinMax(gx - 0.85, 0.3, z0, gx + 0.85, y, z1, i % 2 ? C.stone : C.cap);
    if (i < 2) addSurface({ minX: gx - 0.85, maxX: gx + 0.85, minZ: z0, maxZ: z1, y });
  }
  b.boxMinMax(gx - 0.95, 0.3, lot.maxZ, gx + 0.95, 0.4, -56.05, C.path);
  addSurface({ minX: gx - 0.95, maxX: gx + 0.95, minZ: lot.maxZ, maxZ: -56.05, y: 0.4 });
  // the retaining wall and its cap stones round the lot (a gap for the steps)
  const edges = [[[lot.maxX, lot.maxZ], [gx + 0.85, lot.maxZ]], [[gx - 0.85, lot.maxZ], c0], [c0, c1], [c1, [lot.minX, lot.minZ]], [[lot.minX, lot.minZ], [lot.maxX, lot.minZ]], [[lot.maxX, lot.minZ], [lot.maxX, lot.maxZ]]];
  for (const [p, q] of edges) {
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    b.add(GEO.box, C.stone, { x: mx, y: (0.25 + TY + 0.1) / 2, z: mz, sx: len + 0.3, sy: TY + 0.1 - 0.25, sz: 0.36, ry });
    b.add(GEO.box, C.cap, { x: mx, y: TY + 0.14, z: mz, sx: len + 0.36, sy: 0.08, sz: 0.46, ry });
    for (let s = 0.9; s < len - 0.3; s += 1.3) b.add(GEO.box, C.stone2, { x: p[0] + dx * s / len, y: (0.3 + TY) / 2, z: p[1] + dz * s / len, sx: 0.04, sy: TY - 0.35, sz: 0.38, ry }); // mortar joints
  }
  // colliders: boxes along the straight sides, a chain of posts along the chamfer (low and thin: you can vault the fence)
  const fence = (o) => colliders.push({ type: 'box', fence: true, top: 1.5, ...o });
  fence({ minX: gx + 0.85, maxX: lot.maxX + 0.2, minZ: lot.maxZ - 0.18, maxZ: lot.maxZ + 0.18 });
  fence({ minX: c0[0] - 0.1, maxX: gx - 0.85, minZ: lot.maxZ - 0.18, maxZ: lot.maxZ + 0.18 });
  fence({ minX: lot.minX - 0.18, maxX: lot.minX + 0.18, minZ: lot.minZ - 0.2, maxZ: c1[1] + 0.1 });
  fence({ minX: lot.minX - 0.2, maxX: lot.maxX + 0.2, minZ: lot.minZ - 0.18, maxZ: lot.minZ + 0.18 });
  fence({ minX: lot.maxX - 0.18, maxX: lot.maxX + 0.18, minZ: lot.minZ - 0.2, maxZ: lot.maxZ + 0.2 });
  { const len = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), k = Math.ceil(len / 0.4); for (let i = 0; i <= k; i++) colliders.push({ type: 'circle', fence: true, top: 1.5, x: c0[0] + (c1[0] - c0[0]) * i / k, z: c0[1] + (c1[1] - c0[1]) * i / k, r: 0.22 }); }

  // the iron fence on the street sides (spear-topped pickets between two rails) and the stone posts
  const ironRun = (p, q) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), y0 = TY + 0.18;
    for (const yy of [y0 + 0.12, y0 + 1.0]) b.add(GEO.box, C.iron, { x: (p[0] + q[0]) / 2, y: yy, z: (p[1] + q[1]) / 2, sx: len, sy: 0.05, sz: 0.05, ry });
    for (let s = 0.12; s < len - 0.05; s += 0.17) {
      const x = p[0] + dx * s / len, z = p[1] + dz * s / len;
      b.add(GEO.box, C.iron, { x, y: y0 + 0.58, z, sx: 0.035, sy: 1.16, sz: 0.035 });
      b.add(GEO.cone6, C.iron, { x, y: y0 + 1.24, z, sx: 0.05, sy: 0.16, sz: 0.05 });
    }
  };
  ironRun([lot.maxX - 0.4, lot.maxZ], [gx + 1.15, lot.maxZ]);
  ironRun([gx - 1.15, lot.maxZ], [c0[0] + 0.3, c0[1]]);
  ironRun([c0[0] - 0.2, c0[1] - 0.3], [c1[0] + 0.2, c1[1] + 0.3]);
  ironRun([c1[0], c1[1] - 0.4], [lot.minX, -77.9]); ironRun([lot.minX, -78.5], [lot.minX, lot.minZ + 0.4]);
  const post = (x, z, h = 1.7) => {
    b.add(GEO.box, C.cap, { x, y: TY + 0.1 + h / 2, z, sx: 0.56, sy: h, sz: 0.56 });
    b.add(GEO.box, C.stone2, { x, y: TY + 0.1 + h * 0.3, z, sx: 0.6, sy: 0.08, sz: 0.6 });
    b.add(GEO.box, C.stone, { x, y: TY + 0.16 + h, z, sx: 0.7, sy: 0.12, sz: 0.7 });
    b.add(GEO.sphere, C.cap, { x, y: TY + 0.42 + h, z, sx: 0.2, sy: 0.2, sz: 0.2 });
    colliders.push({ type: 'circle', x, z, r: 0.36, top: 2 });
  };
  for (const [x, z] of [[gx - 1.15, lot.maxZ], [gx + 1.15, lot.maxZ], [lot.maxX - 0.2, lot.maxZ], [c0[0], c0[1]], [c1[0], c1[1]], [lot.minX, -78.2], [lot.minX, lot.minZ]]) post(x, z);
  // the gate: two iron leaves standing open against the inside of the wall
  for (const k of [-1, 1]) {
    const hx = gx + k * 0.86, z0 = lot.maxZ - 0.1;
    b.add(GEO.box, C.iron, { x: hx, y: TY + 0.15, z: z0 - 0.4, sx: 0.04, sy: 0.05, sz: 0.8 });
    b.add(GEO.box, C.iron, { x: hx, y: TY + 1.05, z: z0 - 0.4, sx: 0.04, sy: 0.05, sz: 0.8 });
    for (let s = 0.05; s < 0.8; s += 0.16) b.add(GEO.box, C.iron, { x: hx, y: TY + 0.62, z: z0 - s, sx: 0.035, sy: 1.0, sz: 0.035 });
  }
  // hedges along the neighbour's side and the back
  const hedge = (x0, z0, x1, z1) => {
    b.boxMinMax(x0, TY, z0, x1, TY + 1.25, z1, C.hedge);
    const lx = x1 - x0, lz = z1 - z0, k = Math.max(1, Math.round(Math.max(lx, lz) / 1.1));
    for (let i = 0; i < k; i++) { const t = (i + 0.5) / k; b.add(GEO.ico1, i % 2 ? C.hedge2 : C.hedge, { x: x0 + lx * t, y: TY + 1.22, z: z0 + lz * t, sx: Math.max(0.55, lx > lz ? 0.7 : (x1 - x0) * 0.6), sy: 0.32, sz: Math.max(0.55, lz > lx ? 0.7 : (z1 - z0) * 0.6) }); }
  };
  hedge(lot.maxX - 0.95, lot.minZ + 0.35, lot.maxX - 0.25, lot.maxZ - 1.0);
  hedge(lot.minX + 0.6, lot.minZ + 0.25, lot.maxX - 0.95, lot.minZ + 0.95);
  colliders.push({ type: 'box', minX: lot.maxX - 1.0, maxX: lot.maxX, minZ: lot.minZ, maxZ: lot.maxZ - 1.0 }, { type: 'box', minX: lot.minX, maxX: lot.maxX, minZ: lot.minZ, maxZ: lot.minZ + 1.0 });

  // walks: the front walk to the porch steps, stepping stones round the east side, a winding walk in the back garden
  const flag = (x, z, sx, sz, ry = 0) => b.add(GEO.box, C.path, { x, y: TY + 0.012, z, sx, sy: 0.03, sz, ry });
  { const ax = gx, az = lot.maxZ - notchD - 0.25, bx = X(DOOR.u), bz = Z(PORCH.v1 + 1.0), len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    for (let t = 0; t <= len + 0.01; t += 0.6) flag(ax + (bx - ax) * t / len, az + (bz - az) * t / len, 1.5, 0.55, ry); }
  for (let i = 0; i < 9; i++) flag(X(HW) + 1.25 + Math.sin(i * 0.9) * 0.2, Z(HD + 1.4) - i * 1.25, 0.7, 0.62, i * 0.4);
  const garden = [[X(HW) + 1.3, Z(-HD) - 0.6], [X(2), Z(-HD) - 2.2], [X(-0.5), Z(-HD) - 4.6], [X(-4), Z(-HD) - 5.2], [X(-HW) - 0.2, Z(-HD) - 7.3]];
  for (let s = 0; s < garden.length - 1; s++) { const [p, q] = [garden[s], garden[s + 1]], dl = Math.hypot(q[0] - p[0], q[1] - p[1]); for (let t = 0; t < dl; t += 0.75) flag(p[0] + (q[0] - p[0]) * t / dl, p[1] + (q[1] - p[1]) * t / dl, 0.66, 0.6, s + t); }

  // ================================================================ the house
  const hb = b; // (the shell, roof and porch are outside: always drawn)
  // the windows of the rooms you can walk in are real: a hole through the wall, see-through glass (real-glass.js),
  // the room behind. On a face's own `a` (S: u, N: -u, W: v, E: -v), sill y0 to head y1. The bay's three are cut with the bay.
  const G = FY + 0.62, U = UY + 0.6, gh = 2.15, uh = 1.95;
  const REAL = [
    ...[-4.0, -1.6, 0.9].map(a => ({ f: 'S', a, w: 1.0, y0: G, y1: G + gh })), // the parlour's three to the street
    { f: 'N', a: 2.2, w: 1.1, y0: U, y1: U + uh }, { f: 'N', a: -3.4, w: 1.0, y0: U, y1: U + uh }, // the study's and the landing's
    { f: 'W', a: -3.4, w: 1.0, y0: U, y1: U + uh },                                                // the study's west one (the telescope)
    { f: 'E', a: -5.4, w: 0.9, y0: G, y1: G + gh }, { f: 'E', a: 3.4, w: 1.0, y0: U, y1: U + uh }, // the hall's by the door, the landing's
  ];
  const holesOn = k => REAL.filter(r => r.f === k).map(r => ({ a0: r.a - r.w / 2, a1: r.a + r.w / 2, y0: r.y0, y1: r.y1 }));
  // a wall box from (x0, z0) to (x1, z1) on face k (its `a` runs with x for S, against x for N, with z for W, against z for E), cut
  // round that face's real windows
  const wallCut = (k, x0, y0, z0, x1, y1, z1) => {
    const alongX = k === 'S' || k === 'N', sg = k === 'S' || k === 'W' ? 1 : -1, base = alongX ? HX : HZ;
    const toA = w => sg * (w - base), fromA = a => base + sg * a;
    const lo = alongX ? x0 : z0, hi = alongX ? x1 : z1, a0 = Math.min(toA(lo), toA(hi)), a1 = Math.max(toA(lo), toA(hi));
    for (const [p, q, ya, yb] of cutRect(a0, a1, y0, y1, holesOn(k))) {
      const w0 = Math.min(fromA(p), fromA(q)), w1 = Math.max(fromA(p), fromA(q));
      if (alongX) hb.boxMinMax(w0, ya, z0, w1, yb, z1, C.wall); else hb.boxMinMax(x0, ya, w0, x1, yb, w1, C.wall);
    }
  };
  // the foundation (stone) under the walls and the bay
  hb.boxMinMax(X(-HW) - 0.08, TY - 0.05, Z(-HD) - 0.08, X(HW) + 0.08, FY - 0.08, Z(HD) + 0.08, C.stone); // up to the cap, not through it: their tops fought
  hb.boxMinMax(X(-HW) - 0.12, FY - 0.08, Z(-HD) - 0.12, X(HW) + 0.12, FY, Z(HD) + 0.12, C.cap);
  // the walls: clapboard, the door's gap in the front
  wallCut('W', X(-HW), FY, Z(-HD), X(-IU), EAVE, Z(BAY.v0)); hb.boxMinMax(X(-HW), FY, Z(BAY.v1), X(-IU), EAVE, Z(HD), C.wall); // (the bay opens off the parlour)
  hb.boxMinMax(X(-HW), UY - 0.12, Z(BAY.v0), X(-IU), EAVE, Z(BAY.v1), C.wall);
  wallCut('E', X(IU), FY, Z(-HD), X(HW), EAVE, Z(HD));
  wallCut('N', X(-IU), FY, Z(-HD), X(IU), EAVE, Z(-IV));
  const dl = DOOR.u - DOOR.w / 2, dr = DOOR.u + DOOR.w / 2;
  wallCut('S', X(-IU), FY, Z(IV), X(dl), EAVE, Z(HD));
  hb.boxMinMax(X(dr), FY, Z(IV), X(IU), EAVE, Z(HD), C.wall);
  hb.boxMinMax(X(dl), FY + DOOR.h, Z(IV), X(dr), EAVE, Z(HD), C.wall);
  colliders.push({ type: 'box', minX: X(-HW), maxX: X(-IU), minZ: Z(-HD), maxZ: Z(HD) }, { type: 'box', minX: X(IU), maxX: X(HW), minZ: Z(-HD), maxZ: Z(HD) },
    { type: 'box', minX: X(-IU), maxX: X(IU), minZ: Z(-HD), maxZ: Z(-IV) }, { type: 'box', minX: X(-IU), maxX: X(dl), minZ: Z(IV), maxZ: Z(HD) }, { type: 'box', minX: X(dr), maxX: X(IU), minZ: Z(IV), maxZ: Z(HD) });
  // clapboard lines, corner boards, the belt course at the upper floor, the frieze and the cornice with its brackets
  for (const [k, f] of Object.entries(FACE)) {
    const half = k === 'S' || k === 'N' ? HW : HD;
    for (let y = FY + 0.3; y < EAVE - 0.4; y += 0.28) {
      if (Math.abs(y - UY) < 0.2) continue;
      const gaps = [];
      if (k === 'S' && y < FY + DOOR.h + 0.1) gaps.push([dl - 0.01, dr + 0.01]); // (a centimetre short of the door's jambs: ending level with them, the lines' ends flickered)
      if (k === 'W' && y < UY) gaps.push([BAY.v0, BAY.v1]); // (not across the bay's opening)
      for (const r of REAL) if (r.f === k && y + 0.02 > r.y0 && y - 0.02 < r.y1) gaps.push([r.a - r.w / 2 - 0.01, r.a + r.w / 2 + 0.01]); // nor its holes
      for (const [p, q] of spans(-half, half, gaps)) fbox(cl, f, (p + q) / 2, y, 0.008, q - p, 0.035, 0.02, C.line);
    }
    for (const s of [-1, 1]) fbox(hb, f, s * (half - 0.08), (FY + EAVE) / 2, 0.03, 0.26, EAVE - FY, 0.08, C.trim);
    fbox(hb, f, 0, UY, 0.045, half * 2 + 0.1, 0.24, 0.09, C.trim); // (the belt course on the wall's face, not 1 cm into it: its underside lay in the bay's wall's)
    fbox(hb, f, 0, EAVE - 0.22, 0.04, half * 2 + 0.1, 0.44, 0.1, C.trim);
    for (let a = -half + 0.5; a <= half - 0.4; a += 1.15) fbox(hb, f, a, EAVE - 0.2, 0.2, 0.16, 0.36, 0.32, C.cream);
  }
  hb.boxMinMax(X(-HW) - 0.36, EAVE, Z(-HD) - 0.36, X(HW) + 0.36, EAVE + 0.32, Z(HD) + 0.36, C.trim);
  // the mansard: a flared curb, the steep lower slope in two bands of slate, a low hipped top, iron cresting along its edge
  hb.add(frustum(HW + 0.46, HD + 0.46, HW + 0.36, HD + 0.36, 0.14), C.roof2, { x: HX, y: EAVE + 0.32, z: HZ });
  const s0 = EAVE + 0.46, sH = 2.55, inset = 0.9;
  const band = (t0, t1, col) => hb.add(frustum(HW + 0.36 - inset * t0, HD + 0.36 - inset * t0, HW + 0.36 - inset * t1, HD + 0.36 - inset * t1, sH * (t1 - t0), false), col, { x: HX, y: s0 + sH * t0, z: HZ });
  band(0, 0.34, C.roof); band(0.34, 0.42, C.roof2); band(0.42, 0.76, C.roof); band(0.76, 0.84, C.roof2); band(0.84, 1, C.roof);
  const tw = HW + 0.36 - inset, td = HD + 0.36 - inset, topY = s0 + sH;
  hb.add(frustum(tw + 0.08, td + 0.08, tw + 0.08, td + 0.08, 0.12), C.trim, { x: HX, y: topY - 0.02, z: HZ });
  hb.add(frustum(tw, td, tw - 2.6, td - 2.6, 0.55), C.roofTop, { x: HX, y: topY + 0.1, z: HZ });
  for (const [ax, az, len, alongX] of [[0, -td, tw * 2, true], [0, td, tw * 2, true], [-tw, 0, td * 2, false], [tw, 0, td * 2, false]]) {
    hb.add(GEO.box, C.iron, { x: HX + ax, y: topY + 0.32, z: HZ + az, sx: alongX ? len : 0.04, sy: 0.04, sz: alongX ? 0.04 : len });
    for (let s = -len / 2 + 0.2; s < len / 2; s += 0.42) hb.add(GEO.cone6, C.iron, { x: HX + ax + (alongX ? s : 0), y: topY + 0.36, z: HZ + az + (alongX ? 0 : s), sx: 0.035, sy: 0.32, sz: 0.035 });
  }
  // dormers: a gabled one with an arched window on each face (the front one over the third window, as in the photo)
  const dormer = (f, a, w = 1.5) => {
    const out0 = 0.12, depth = 1.5, y0 = s0 + 0.05, y1 = s0 + 1.9;
    fbox(hb, f, a, (y0 + y1) / 2, out0 - depth / 2, w, y1 - y0, depth, C.wall);
    for (const s of [-1, 1]) fbox(hb, f, a + s * (w / 2 - 0.06), (y0 + 0.01 + y1) / 2, out0 + 0.02, 0.14, y1 - y0 - 0.01, 0.06, C.trim); // (a centimetre short of the body's bottom: level with it, their undersides flickered)
    fadd(hb, f, prism(w + 0.36, 0.78, depth + 0.3), C.roof2, a, y1, out0 - depth / 2 + 0.1);
    fadd(hb, f, prism(w + 0.1, 0.62, 0.08), C.trim, a, y1 + 0.02, out0 + 0.06);
    fbox(hb, f, a, y1 + 0.03, out0 + 0.08, w + 0.3, 0.1, 0.16, C.trim);
    const gw = w * 0.52, gy0 = y0 + 0.35, gh = 0.95;
    fbox(hb, f, a, gy0 + gh / 2, out0 + 0.04, gw + 0.18, gh + 0.1, 0.06, C.trim);
    fbox(hb, f, a, gy0 + gh / 2, out0 + 0.06, gw, gh, 0.06, glassDark);
    fadd(hb, f, GEO.cyl12, C.trim, a, gy0 + gh, out0 + 0.04, { sx: gw / 2 + 0.09, sy: 0.06, sz: gw / 2 + 0.09, rx: Math.PI / 2 });
    fadd(hb, f, GEO.cyl12, glassDark, a, gy0 + gh, out0 + 0.06, { sx: gw / 2, sy: 0.06, sz: gw / 2, rx: Math.PI / 2 });
    fbox(hb, f, a, gy0 + gh * 0.5, out0 + 0.1, gw - 0.01, 0.05, 0.04, C.trim);
  };
  dormer(FACE.S, 0.9, 1.6); dormer(FACE.S, -3.6, 1.2); dormer(FACE.N, 1.6); dormer(FACE.W, -2.6); dormer(FACE.E, 2.2);
  // chimneys: the tall one from the parlour and study fireplaces, a smaller one at the back
  const chimney = (u, v, top, w = 1.1, d = 0.7) => {
    hb.boxMinMax(X(u - w / 2), topY - 0.6, Z(v - d / 2), X(u + w / 2), top, Z(v + d / 2), C.brick);
    hb.boxMinMax(X(u - w / 2 - 0.1), top - 0.5, Z(v - d / 2 - 0.1), X(u + w / 2 + 0.1), top - 0.3, Z(v + d / 2 + 0.1), C.brickCap);
    hb.boxMinMax(X(u - w / 2 - 0.12), top, Z(v - d / 2 - 0.12), X(u + w / 2 + 0.12), top + 0.18, Z(v + d / 2 + 0.12), C.brickCap);
    for (const k of [-1, 1]) hb.add(GEO.cyl8, '#b0583f', { x: X(u + k * w * 0.22), y: top + 0.4, z: Z(v), sx: 0.12, sy: 0.45, sz: 0.12 });
  };
  chimney(-2.0, 3.4, topY + 2.4); chimney(3.4, -4.4, topY + 1.6, 0.8, 0.6); // (the tall one up front over the parlour, where the photo has it; the flues run in the walls)

  // windows: a cream frame, the glass (lit at night like the town's: windowGlass), a cross of muntins, a sill, a hood, shutters.
  // a `lit` one is a real window into a room you can walk in: the frame a ring round the hole through the wall, the
  // hole lined in dark wood (`t` = the wall's thickness), the glass see-through near (glassReal, its own batch: no shadow)
  const win = (f, a, sill, w, h, { shut = true, lit = false, t = WT } = {}) => {
    if (lit) {
      for (const s of [-1, 1]) fbox(hb, f, a + s * (w / 2 + 0.055), sill + h / 2, 0.03, 0.11, h + 0.22, 0.06, C.trim);
      for (const y of [sill - 0.055, sill + h + 0.055]) fbox(hb, f, a, y, 0.03, w, 0.11, 0.06, C.trim);
      fbox(gb, f, a, sill + h / 2, 0.05, w + 0.02, h + 0.02, 0.06, glassReal);
      REALW.push({ x: f.x + f.tx * a, z: f.z + f.tz * a, nx: f.nx, nz: f.nz, w, y0: sill, y1: sill + h });
      for (const s of [-1, 1]) fbox(n, f, a + s * (w / 2 - 0.005), sill + h / 2, -t / 2, 0.01, h, t, C.woodDk);
      for (const y of [sill + 0.005, sill + h - 0.005]) fbox(n, f, a, y, -t / 2, w - 0.02, 0.01, t, C.woodDk);
    } else {
      fbox(hb, f, a, sill + h / 2, 0.03, w + 0.22, h + 0.22, 0.06, C.trim);
      fbox(hb, f, a, sill + h / 2, 0.05, w, h, 0.06, glassDark);
    }
    fbox(hb, f, a, sill + h / 2, 0.08, 0.06, h - 0.01, 0.04, C.trim);   // (the muntins 5 mm short of the glass's edges: their ends
    fbox(hb, f, a, sill + h * 0.56, 0.08, w - 0.01, 0.06, 0.04, C.trim); // lay in its sides and flickered)
    fbox(hb, f, a, sill - 0.05, 0.1, w + 0.4, 0.08, 0.2, C.trim);
    fbox(hb, f, a, sill + h + 0.2, 0.1, w + 0.44, 0.14, 0.18, C.trim);
    fbox(hb, f, a, sill + h + 0.32, 0.08, w + 0.2, 0.1, 0.12, C.trim);
    if (shut) for (const s of [-1, 1]) {
      const sa = a + s * (w / 2 + 0.11 + w * 0.24);
      fbox(hb, f, sa, sill + h / 2, 0.05, w * 0.48, h, 0.05, C.shutter);
      for (let y = sill + 0.15; y < sill + h - 0.1; y += 0.16) fbox(hb, f, sa, y, 0.08, w * 0.4, 0.03, 0.02, '#3c5c49');
    }
  };
  // ...and the same window from inside a room you can walk in: a dark wood frame round the hole (you look out through the outside's
  // own glass and bars, no pane or cross of its own), red drapes and a pelmet
  const winIn = (f, a, sill, w, h) => {
    for (const s of [-1, 1]) fbox(n, f, a + s * (w / 2 + 0.05), sill + h / 2, 0.02, 0.1, h + 0.2, 0.04, C.woodDk);
    for (const y of [sill - 0.05, sill + h + 0.05]) fbox(n, f, a, y, 0.02, w, 0.1, 0.04, C.woodDk);
    fbox(n, f, a, sill - 0.04, 0.08, w + 0.3, 0.06, 0.16, C.woodDk);
    for (const s of [-1, 1]) fbox(n, f, a + s * (w / 2 + 0.16), sill + h / 2 - 0.05, 0.1, 0.32, h + 0.4, 0.08, C.red);
    fbox(n, f, a, sill + h + 0.3, 0.12, w + 0.8, 0.26, 0.1, C.red);
    fbox(n, f, a, sill + h + 0.46, 0.13, w + 0.86, 0.06, 0.12, C.brass);
  };
  for (const u of [-4.0, -1.6, 0.9]) { win(FACE.S, u, G, 1.0, gh, { lit: true }); winIn(IN.S, -u, G, 1.0, gh); }
  for (const u of [-4.0, -1.6, 0.9, 3.5]) win(FACE.S, u, U, 1.0, uh);
  for (const u of [-3.6, 0.2, 3.4]) win(FACE.N, -u, G, 1.0, gh);
  win(FACE.N, 2.2, U, 1.1, uh, { lit: true }); winIn(IN.N, -2.2, U, 1.1, uh);       // the study's window, over the desk
  win(FACE.N, -3.4, U, 1.0, uh, { lit: true }); winIn(IN.N, 3.4, U, 1.0, uh);       // the landing's
  win(FACE.W, -3.4, G, 1.0, gh); win(FACE.W, -3.4, U, 1.0, uh, { lit: true }); winIn(IN.W, 3.4, U, 1.0, uh); // (the study's west window)
  win(FACE.W, 5.4, U, 0.8, uh);
  win(FACE.E, -5.4, G, 0.9, gh, { lit: true }); winIn(IN.E, 5.4, G, 0.9, gh);     // the hall's, by the door
  win(FACE.E, 3.4, G, 1.0, gh); win(FACE.E, 3.4, U, 1.0, uh, { lit: true }); winIn(IN.E, -3.4, U, 1.0, uh);
  win(FACE.E, -2.6, U, 1.0, uh); win(FACE.E, -0.2, G + 1.3, 0.7, 1.2, { shut: false }); // (a small one over the stairs)

  // the bay on the west side: three faces, two storeys of windows, its own cornice and a little roof with cresting
  const bayFaces = [];
  {
    const u0 = -HW, o = BAY.out, v0 = BAY.v0, v1 = BAY.v1, top = EAVE - 0.55;
    const pts = [[u0, v0], [u0 - o, v0 + o], [u0 - o, v1 - o], [u0, v1]];
    hb.boxMinMax(X(u0 - o) - 0.08, TY - 0.05, Z(v0 + o) - 0.08, X(u0) - 0.12, FY, Z(v1 - o) + 0.08, C.stone); // (up to the house's cap, not under it)
    for (let i = 0; i < 3; i++) {
      const [p, q] = [pts[i], pts[i + 1]], du = q[0] - p[0], dv = q[1] - p[1], len = Math.hypot(du, dv);
      const yaw = Math.atan2(-dv, du); // outward normal of the face (pointing away from the wall line)
      const f = F(X((p[0] + q[0]) / 2), Z((p[1] + q[1]) / 2), yaw);
      const ww = i === 1 ? 0.95 : 0.6;
      for (const [p, q, ya, yb] of cutRect(-(len + 0.12) / 2, (len + 0.12) / 2, FY, top, [{ a0: -ww / 2, a1: ww / 2, y0: G, y1: G + gh }])) fbox(hb, f, (p + q) / 2, (ya + yb) / 2, -0.12, q - p, yb - ya, 0.24, C.wall); // the hole
      if (i !== 1) fbox(hb, f, 0, (TY + FY - 0.003) / 2, -0.12, len, FY - TY - 0.003, 0.3, C.stone); // (3 mm under the cap where it runs into it)
      for (let y = FY + 0.3; y < top - 0.3; y += 0.28) if (Math.abs(y - UY) > 0.2) for (const [p, q] of spans(-len / 2, len / 2, y + 0.02 > G && y - 0.02 < G + gh ? [[-ww / 2 - 0.01, ww / 2 + 0.01]] : [])) fbox(cl, f, (p + q) / 2, y, 0.008, q - p, 0.035, 0.02, C.line);
      win(f, 0, G, ww, gh, { shut: false, lit: true, t: 0.24 }); win(f, 0, U, ww, uh, { shut: false });
      fbox(hb, f, 0, UY, 0.045, len + 0.1, 0.24, 0.09, C.trim);
      fbox(hb, f, 0, top - 0.2, 0.06, len + 0.2, 0.4, 0.14, C.trim);
      fbox(hb, f, 0, top + 0.05, 0.2, len + 0.5, 0.12, 0.42, C.trim);
      const n0 = F(0, 0, yaw), fi = F(X((p[0] + q[0]) / 2) - n0.nx * 0.245, Z((p[1] + q[1]) / 2) - n0.nz * 0.245, yaw + Math.PI); // (the wall's inner face)
      winIn(fi, 0, G, ww, gh); // (from the parlour's bay seat)
      bayFaces.push({ fi, len });
    }
    hb.add(frustum(o / 2 + 0.25, (v1 - v0) / 2 + 0.2, o / 2 - 0.1, (v1 - v0) / 2 - 0.5, 0.5), C.roof, { x: X(u0 - o / 2), y: top + 0.1, z: Z((v0 + v1) / 2) });
    colliders.push({ type: 'box', minX: X(u0 - o) - 0.1, maxX: X(u0), minZ: Z(v0 + 0.2), maxZ: Z(v1 - 0.2) });
  }

  // the front porch: a deck on stone, turned columns, a flat roof with a frieze and brackets, railings, three steps
  {
    const u0 = PORCH.u0, u1 = PORCH.u1, v0 = HD, v1 = PORCH.v1, sl = DOOR.u - 0.9, sr = DOOR.u + 0.9;
    hb.boxMinMax(X(u0), TY - 0.05, Z(v0), X(u1), FY - 0.05, Z(v1), C.stone);
    hb.boxMinMax(X(u0) - 0.05, FY - 0.06, Z(v0), X(u1) + 0.05, FY + 0.004, Z(v1) + 0.05, C.woodLt); // (4 mm over the foundation's cap it runs onto)
    addSurface({ minX: X(u0), maxX: X(u1), minZ: Z(v0 - 0.3), maxZ: Z(v1), y: FY, sound: 'wood' });
    for (let i = 0; i < 3; i++) {
      const z0 = Z(v1 + i * 0.3), y = FY - 0.18 * (i + 1);
      hb.boxMinMax(X(sl), TY - 0.05, z0, X(sr), y, z0 + 0.3, i % 2 ? C.stone : C.cap);
      addSurface({ minX: X(sl), maxX: X(sr), minZ: z0, maxZ: z0 + 0.3, y });
    }
    for (const u of [sl - 0.15, sr + 0.15]) { hb.boxMinMax(X(u) - 0.15, TY - 0.05, Z(v1), X(u) + 0.15, FY - 0.1, Z(v1 + 0.9), C.stone); colliders.push({ type: 'box', minX: X(u) - 0.15, maxX: X(u) + 0.15, minZ: Z(v1), maxZ: Z(v1 + 0.9) }); }
    const roofY = FY + 2.95;
    for (const [u, v] of [[u0 + 0.18, v1 - 0.18], [u1 - 0.18, v1 - 0.18], [u0 + 0.18, v0 + 0.2], [u1 - 0.18, v0 + 0.2]]) {
      hb.add(GEO.box, C.trim, { x: X(u), y: FY + 0.15, z: Z(v), sx: 0.3, sy: 0.3, sz: 0.3 });
      hb.add(GEO.cyl8, C.trim, { x: X(u), y: FY + 1.5, z: Z(v), sx: 0.11, sy: 2.5, sz: 0.11 });
      for (const y of [FY + 0.5, FY + 2.55]) hb.add(GEO.cyl8, C.trim, { x: X(u), y, z: Z(v), sx: 0.15, sy: 0.12, sz: 0.15 });
      hb.add(GEO.box, C.trim, { x: X(u), y: roofY - 0.15, z: Z(v), sx: 0.32, sy: 0.25, sz: 0.32 });
      if (v > v0 + 1) colliders.push({ type: 'circle', x: X(u), z: Z(v), r: 0.2 });
    }
    hb.boxMinMax(X(u0) - 0.2, roofY, Z(v0), X(u1) + 0.2, roofY + 0.3, Z(v1) + 0.25, C.trim);
    hb.boxMinMax(X(u0) - 0.25, roofY + 0.3, Z(v0), X(u1) + 0.25, roofY + 0.4, Z(v1) + 0.3, C.roof2);
    for (let u = u0; u <= u1 + 0.01; u += 0.3) hb.add(GEO.box, C.cream, { x: X(u), y: roofY - 0.05, z: Z(v1) + 0.22, sx: 0.1, sy: 0.1, sz: 0.06 });
    for (let u = u0 + 0.6; u < u1 - 0.4; u += 0.8) hb.add(GEO.box, C.cream, { x: X(u), y: roofY - 0.18, z: Z(v1) + 0.12, sx: 0.08, sy: 0.3, sz: 0.2 });
    // railings either side of the steps and down both sides
    const rail = (p, q) => {
      const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
      for (const y of [FY + 0.12, FY + 0.92]) hb.add(GEO.box, C.trim, { x: (p[0] + q[0]) / 2, y, z: (p[1] + q[1]) / 2, sx: len, sy: 0.07, sz: 0.09, ry });
      for (let s = 0.1; s < len; s += 0.15) hb.add(GEO.cyl6, C.trim, { x: p[0] + dx * s / len, y: FY + 0.52, z: p[1] + dz * s / len, sx: 0.025, sy: 0.8, sz: 0.025 });
      colliders.push({ type: 'box', minX: Math.min(p[0], q[0]) - 0.07, maxX: Math.max(p[0], q[0]) + 0.07, minZ: Math.min(p[1], q[1]) - 0.07, maxZ: Math.max(p[1], q[1]) + 0.07 });
    };
    rail([X(u0 + 0.18), Z(v1 - 0.18)], [X(sl), Z(v1 - 0.18)]); rail([X(sr), Z(v1 - 0.18)], [X(u1 - 0.18), Z(v1 - 0.18)]);
    rail([X(u0 + 0.18), Z(v0 + 0.3)], [X(u0 + 0.18), Z(v1 - 0.18)]); rail([X(u1 - 0.18), Z(v0 + 0.3)], [X(u1 - 0.18), Z(v1 - 0.18)]);
    // the door's surround: pilasters, a cornice, a fanlight with the number, sidelights; a lantern by it
    for (const s of [-1, 1]) fbox(hb, FACE.S, DOOR.u + s * (DOOR.w / 2 + 0.38), FY + 1.45, 0.05, 0.18, 2.9, 0.1, C.trim);
    for (const s of [-1, 1]) fbox(hb, FACE.S, DOOR.u + s * (DOOR.w / 2 + 0.16), FY + 1.25, 0.04, 0.24, 2.3, 0.06, glassLit);
    fbox(hb, FACE.S, DOOR.u, FY + DOOR.h + 0.25, 0.05, DOOR.w + 0.2, 0.4, 0.06, glassLit);
    fbox(hb, FACE.S, DOOR.u, FY + DOOR.h + 0.55, 0.08, DOOR.w + 1.0, 0.16, 0.14, C.trim);
    fbox(hb, FACE.S, DOOR.u, FY + DOOR.h + 0.04, 0.06, DOOR.w + 0.9, 0.08, 0.1, C.trim);
    const numMat = new THREE.MeshBasicMaterial({ map: printed(['454'], { w: 128, h: 64, bg: '#f1ead6', fg: '#3a2a20', font: 'Special Elite' }), fog: true }); KEEP.add(numMat);
    fadd(hb, FACE.S, new THREE.PlaneGeometry(0.42, 0.21), numMat, DOOR.u, FY + DOOR.h + 0.27, 0.085);
    fbox(hb, FACE.S, DOOR.u - DOOR.w / 2 - 0.6, FY + 2.2, 0.16, 0.06, 0.28, 0.2, C.iron);
    fadd(hb, FACE.S, GEO.box, lampGlow('#ffc766'), DOOR.u - DOOR.w / 2 - 0.6, FY + 2.0, 0.3, { sx: 0.2, sy: 0.3, sz: 0.2 });
    fadd(hb, FACE.S, GEO.cone6, C.iron, DOOR.u - DOOR.w / 2 - 0.6, FY + 2.24, 0.3, { sx: 0.18, sy: 0.18, sz: 0.18 });
    if (!M) spot({ x: X(DOOR.u - DOOR.w / 2 - 0.6), y: FY + 2.0, z: Z(HD) + 0.3, color: '#ffc466', pool: 2.6, gy: FY, halo: 0.6, flicker: 0.4 }, false);
  }
  // the gate lantern on a lamp post just inside the front fence
  {
    const x = gx - 1.6, z = lot.maxZ - 0.9;
    hb.add(GEO.cyl6, C.iron, { x, y: TY + 1.4, z, sx: 0.07, sy: 2.8, sz: 0.07 });
    hb.add(GEO.box, lampGlow('#ffc766'), { x, y: TY + 2.95, z, sx: 0.28, sy: 0.4, sz: 0.28 });
    hb.add(GEO.cone6, C.iron, { x, y: TY + 3.27, z, sx: 0.26, sy: 0.24, sz: 0.26 });
    hb.add(GEO.box, C.iron, { x, y: TY + 2.73, z, sx: 0.34, sy: 0.06, sz: 0.34 });
    colliders.push({ type: 'circle', x, z, r: 0.2 });
    if (!M) spot({ x, y: TY + 2.95, z, color: '#ffb654', pool: 3.2, gy: TY, halo: 1.0, flicker: 0.35 }, false);
  }
  // (lovecraft-setpiece) the lamps' glowing glass at the model's fixtures (every light from a fixture you can see: the gaslight globes
  // on brass, the carriage lanterns, the gate lamp, the oil lamp's globe and chimney, the desk lamp's shade), and the outdoor spots
  if (M) for (const a of lovecraftAnchors('glow-')) {
    const out = a.name.startsWith('glow-porch') || a.name === 'glow-gate', tb = out ? bReal : nReal, mat = lampGlow('#' + (a.color || 'ffc766')), [x, y, z] = a.pos;
    if (a.shape === 'box') tb.add(GEO.box, mat, { x, y, z, sx: a.sx, sy: a.sy, sz: a.sz });
    else tb.add(GEO.sphere, mat, { x, y, z, sx: a.r, sy: a.r, sz: a.r });
    if (a.chimney) tb.add(GEO.cyl8, mat, { x, y: y + a.r + 0.06, z, sx: 0.03, sy: 0.14, sz: 0.03 });
    if (a.spot) spot({ x, y, z, color: '#' + a.spot.color, pool: a.spot.pool, gy: a.spot.gy, halo: a.spot.halo, flicker: a.spot.flicker }, false);
  }

  // shade trees and the back garden: a fountain, an arbour with a bench under it, flower beds and urns.
  // (lovecraft-trees, Andrew 2026-11-09: the model's own elms were "a little too different") the lot's three shade trees are the
  // town's own oaks (world-trees.js addTree: the same lumpy lobes, leaf greens and limbs as every yard and street tree), at the old
  // elms' spots and about their size (crowns 10-12 m up, 5 m across), standing on the terrace. Into the outside's real batch (the
  // model's lot has no trees any more; they are the same in the code-built house). The leaves follow the house's skin when it is built
  // (halloween: the town's autumn colours; the seasons are parked: the summer greens all year). The colliders are the elms' as before.
  const LEAVES = { halloween: LEAF.autumn };
  // (qol-fixes, Andrew 2026-11-10: "The tree in the front of the Lovecraft house is too big/close to the house") the front one stood
  // 1.4 m off the east wall beside the porch, its crown through the cornice, the porch roof and the front windows, and the back
  // west one's crown was in the back corner. The lot has no room for a crown that size beside the house, so the front one is out
  // past the east fence on the neighbour's front lawn (on the town's ground, not the terrace), a size smaller, clear of the porch and
  // the door; the back one is at the garden's far corner behind the arbour. tools/tree-overlap-test.mjs keeps every crown out of
  // the house.
  const elm = (x, z, crown, s, seed, lot = true) => {
    const sz = mulberry32(seed)(), scale = crown / 6.7 / (0.9 + sz * 0.3); // (addTree draws its size first: the oak's crown tops out at 6.7 m a unit)
    addTree(bReal, x, z, 'oak', mulberry32(seed), scale, { y: lot ? TY : undefined, leaves: LEAVES[lovecraftSkin(nowMs)] });
    colliders.push({ type: 'circle', x, z, r: 0.4 * s, tree: true });
  };
  elm(X(HW) + 5.6, Z(HD) + 2.5, 9.0, 1.0, 4541, false); elm(X(-HW) - 3.1, Z(-HD) - 10.2, 10.6, 1.15, 4542); elm(X(HW) + 1.0, Z(-HD) - 7.0, 11.0, 1.1, 4543);
  {
    const fx = X(-0.6), fz = Z(-HD) - 7.6; // the fountain
    hb.add(GEO.cyl12, C.cap, { x: fx, y: TY + 0.22, z: fz, sx: 1.25, sy: 0.44, sz: 1.25 });
    hb.add(GEO.cyl12, '#5f9fc2', { x: fx, y: TY + 0.37, z: fz, sx: 1.08, sy: 0.12, sz: 1.08 }); // (the water 1 cm under the rim, not level with it)
    hb.add(GEO.cyl8, C.cap, { x: fx, y: TY + 0.85, z: fz, sx: 0.16, sy: 1.0, sz: 0.16 });
    hb.add(GEO.cyl12, C.cap, { x: fx, y: TY + 1.38, z: fz, sx: 0.55, sy: 0.12, sz: 0.55 });
    hb.add(GEO.cyl12, '#7fb8d6', { x: fx, y: TY + 1.43, z: fz, sx: 0.46, sy: 0.04, sz: 0.46 });
    hb.add(GEO.sphere, C.cap, { x: fx, y: TY + 1.62, z: fz, sx: 0.13, sy: 0.18, sz: 0.13 });
    colliders.push({ type: 'circle', x: fx, z: fz, r: 1.3 });
    const ax = X(-HW) - 1.2, az = Z(-HD) - 7.4; // the arbour (a white trellis arch with roses) and its bench
    for (const s of [-1, 1]) for (const t of [-1, 1]) hb.add(GEO.box, C.trim, { x: ax + s * 0.75, y: TY + 1.15, z: az + t * 0.6, sx: 0.1, sy: 2.3, sz: 0.1 });
    for (const t of [-1, 1]) hb.add(new THREE.TorusGeometry(0.75, 0.05, 6, 14, Math.PI), C.trim, { x: ax, y: TY + 2.3, z: az + t * 0.6 });
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; hb.add(GEO.box, C.trim, { x: ax + Math.cos(a) * 0.75, y: TY + 2.3 + Math.sin(a) * 0.75, z: az, sx: 0.06, sy: 0.06, sz: 1.3 }); }
    for (let i = 0; i < 14; i++) { const a = (i / 13) * Math.PI; hb.add(GEO.ico1, i % 3 ? C.leaf2 : '#e8607a', { x: ax + Math.cos(a) * 0.78, y: TY + 2.3 + Math.sin(a) * 0.78, z: az + (i % 2 ? 0.35 : -0.35), sx: 0.24, sy: 0.22, sz: 0.3 }); }
    hb.add(GEO.box, C.woodLt, { x: ax, y: TY + 0.45, z: az, sx: 0.5, sy: 0.07, sz: 1.1 });
    hb.add(GEO.box, C.woodLt, { x: ax - 0.22, y: TY + 0.72, z: az, sx: 0.06, sy: 0.5, sz: 1.1 });
    for (const t of [-1, 1]) hb.add(GEO.box, C.iron, { x: ax, y: TY + 0.22, z: az + t * 0.5, sx: 0.45, sy: 0.44, sz: 0.05 });
    colliders.push({ type: 'box', minX: ax - 0.85, maxX: ax + 0.85, minZ: az - 0.7, maxZ: az + 0.7 });
    // flower beds against the front and the urns on the porch cheeks' corners
    for (const [u0, u1] of [[-HW + 0.2, -0.2], [PORCH.u1 + 0.1, HW]]) {
      hb.boxMinMax(X(u0), TY, Z(HD) + 0.15, X(u1), TY + 0.16, Z(HD) + 0.95, '#5a4030');
      for (let u = u0 + 0.35; u < u1 - 0.2; u += 0.6) {
        hb.add(GEO.ico1, hash01('fs', u) < 0.5 ? C.hedge : C.hedge2, { x: X(u), y: TY + 0.4, z: Z(HD) + 0.55, sx: 0.34, sy: 0.3, sz: 0.32 });
        for (let k = 0; k < 3; k++) hb.add(GEO.ico0, hash01('fl', u) < 0.5 ? '#e7a2c8' : '#a9b6f0', { x: X(u + (k - 1) * 0.16), y: TY + 0.6 + (k % 2) * 0.06, z: Z(HD) + 0.62 + (k % 2) * 0.1, sx: 0.09, sy: 0.08, sz: 0.09 });
      }
      colliders.push({ type: 'box', minX: X(u0), maxX: X(u1), minZ: Z(HD), maxZ: Z(HD) + 0.95 });
    }
  }

  // the brass plaque on the gate post facing the sidewalk (its faces: the feature swaps them on open days)
  const plaque = new THREE.Group(); plaque.position.set(gx + 1.15, TY + 1.15, lot.maxZ + 0.3); ext.add(plaque);
  hb.add(GEO.box, C.brass, { x: gx + 1.15, y: TY + 1.15, z: lot.maxZ + 0.29, sx: 0.5, sy: 0.4, sz: 0.03 });

  // ================================================================ inside
  const wpParlour = tmat(wallpaper('#41644f', '#557a63', '#4a6e58')), wpHall = tmat(wallpaper('#86363c', '#9c4549')), wpStudy = tmat(wallpaper('#3d4a70', '#4f5d86', '#45527a'));
  const floorMat = tmat(planks()), rugMat = tmat(rug()), portraitMat = new THREE.MeshBasicMaterial({ map: portrait(), fog: false }), chartMat = new THREE.MeshBasicMaterial({ map: starChart(), fog: false });
  KEEP.add(portraitMat); KEEP.add(chartMat);
  const PA = M && lovecraftAnchor('portrait'), CA = M && lovecraftAnchor('chart'); // (the canvases hang in the model's gilt frames)
  for (const [m, nm] of [[wpParlour, 'wp-parlour'], [wpHall, 'wp-hall'], [wpStudy, 'wp-study'], [floorMat, 'floor'], [rugMat, 'rug']]) m.name = 'lovecraft-' + nm;
  // a papered wall face from (x0, z0) to (x1, z1), its paper toward the room (`yaw` = the way it faces), wainscot below
  // cut round the real windows behind it (REALW: a hole whose outside faces the other way, a wall's thickness behind the
  // face): the paper in pieces (its pattern carried on across them), the wainscot's boards stopped 2.5-3.5 cm inside the window's casing
  const paper = (mat, x0, z0, x1, z1, yaw, y0, y1, wains = true) => {
    const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, nx = Math.sin(yaw), nz = Math.cos(yaw);
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len, holes = [];
    for (const r of REALW) {
      const t = (r.x - x0) * dx + (r.z - z0) * dz, back = (r.x - x0) * nx + (r.z - z0) * nz;
      if (r.nx * nx + r.nz * nz < -0.9 && back < 0 && back > -0.4 && t > 0 && t < len) holes.push({ a0: t - r.w / 2, a1: t + r.w / 2, y0: r.y0, y1: r.y1 });
    }
    const at = t => ({ x: x0 + dx * t, z: z0 + dz * t });
    // the plane's own +x runs (cos yaw, -sin yaw): with the face (sg 1) or against it
    const sg = Math.cos(yaw) * dx - Math.sin(yaw) * dz > 0 ? 1 : -1;
    for (const [p, q, ya, yb] of cutRect(0, len, y0, y1, holes)) {
      const c = at((p + q) / 2), u0 = sg > 0 ? p : len - q, g = tiled(q - p, yb - ya, 0.8, u0, ya - y0);
      n.add(g, mat, { x: c.x + nx * 0.006, y: (ya + yb) / 2, z: c.z + nz * 0.006, ry: yaw });
    }
    if (!wains) return;
    // (a board the windows' sills cross runs whole below them, its top tucked into the casing's bottom bar, and is cut above)
    const board = (c, y, h, o, d, m = 0.025) => { // (2.5 cm: at 2 cm the hall's wainscot ended in the plane of the first stair's nose)
      let b0 = y - h / 2;
      const b1 = y + h / 2, over = holes.filter(hl => hl.y0 < b1 && hl.y1 > b0), low = Math.min(...over.map(hl => hl.y0 - 0.095));
      const put = (p, q, ya, yb) => { const mm = at((p + q) / 2); n.add(GEO.box, c, { x: mm.x + nx * o, y: (ya + yb) / 2, z: mm.z + nz * o, sx: q - p, sy: yb - ya, sz: d, ry: yaw }); };
      if (over.length && low > b0 + 0.02) { put(0, len, b0, low); b0 = low; }
      for (const [p, q] of spans(0, len, over.map(hl => [hl.a0 - m, hl.a1 + m]))) put(p, q, b0, b1);
    };
    board(C.woodDk, y0 + 0.48, 0.96, 0.02, 0.03);
    board(C.woodLt, y0 + 0.97, 0.06, 0.035, 0.05, 0.035); // (its ends not in the plane of the wainscot's: they overlap)
    board(C.woodDk, y0 + 0.08, 0.16, 0.03, 0.05);
    board(C.woodLt, y1 - 0.42, 0.04, 0.02, 0.03);
    board(C.cream, y1 - 0.06, 0.12, 0.04, 0.08);
  };
  const E_ = -Math.PI / 2, W_ = Math.PI / 2, S_ = 0, N_ = Math.PI; // which way a face looks: E_ = toward -x? (sin yaw, cos yaw): W_ = +x
  const pu0 = PU - 0.08, pu1 = PU + 0.08, bv0 = BV - 0.1, bv1 = BV + 0.1, uC = UY - 0.12, uTop = EAVE - 0.15;
  // the inner walls (partitions both floors, the wall between the halves, the stairwell's side) as solid boxes
  const dv0 = 2.0, dv1 = 4.0;                   // the parlour's wide doorway into the hall
  const sdv0 = -2.6, sdv1 = -1.5;               // the study's door from the landing
  n.boxMinMax(X(pu0), FY, Z(bv1), X(pu1), UY, Z(dv0), C.plaster); n.boxMinMax(X(pu0), FY, Z(dv1), X(pu1), UY, Z(IV), C.plaster); n.boxMinMax(X(pu0), FY + 2.6, Z(dv0), X(pu1), UY, Z(dv1), C.plaster);
  n.boxMinMax(X(-IU), FY, Z(bv0), X(IU), UY, Z(bv1), C.plaster);
  n.boxMinMax(X(-IU), UY, Z(bv0), X(ST.u0), EAVE, Z(bv1), C.plaster); n.boxMinMax(X(ST.u0), UY + 2.3, Z(bv0), X(IU), EAVE, Z(bv1), C.plaster);
  n.boxMinMax(X(pu0), UY, Z(-IV), X(pu1), EAVE, Z(sdv0), C.plaster); n.boxMinMax(X(pu0), UY, Z(sdv1), X(pu1), EAVE, Z(bv0), C.plaster); n.boxMinMax(X(pu0), UY + 2.3, Z(sdv0), X(pu1), EAVE, Z(sdv1), C.plaster);
  n.boxMinMax(X(ST.u0) - 0.12, uC, Z(bv1), X(ST.u0), uTop, Z(ST.v0), C.plaster);   // the stairwell's west side, over the hall's ceiling
  n.boxMinMax(X(ST.u0), uC, Z(ST.v0), X(IU), uTop, Z(ST.v0) + 0.12, C.plaster);
  colliders.push({ type: 'box', minX: X(pu0), maxX: X(pu1), minZ: Z(bv1), maxZ: Z(dv0) }, { type: 'box', minX: X(pu0), maxX: X(pu1), minZ: Z(dv1), maxZ: Z(IV) },
    { type: 'box', minX: X(-IU), maxX: X(ST.u0), minZ: Z(bv0), maxZ: Z(bv1) },
    { type: 'box', minX: X(pu0), maxX: X(pu1), minZ: Z(-IV), maxZ: Z(sdv0) }, { type: 'box', minX: X(pu0), maxX: X(pu1), minZ: Z(sdv1), maxZ: Z(bv0) },
    { type: 'box', minX: X(ST.u0) - 0.1, maxX: X(ST.u0) + 0.02, minZ: Z(bv0), maxZ: Z(ST.v0 - 1.1) }); // (the stair's banister side)
  // papered faces: the parlour, the hall, the stairwell, the landing, the study
  paper(wpParlour, X(-IU), Z(bv1), X(-IU), Z(BAY.v0), W_, FY, uC); paper(wpParlour, X(-IU), Z(BAY.v1), X(-IU), Z(IV), W_, FY, uC);
  paper(wpParlour, X(-IU), Z(IV), X(pu0), Z(IV), N_, FY, uC); paper(wpParlour, X(-IU), Z(bv1), X(pu0), Z(bv1), S_, FY, uC);
  paper(wpParlour, X(pu0), Z(bv1), X(pu0), Z(dv0), E_, FY, uC); paper(wpParlour, X(pu0), Z(dv1), X(pu0), Z(IV), E_, FY, uC); paper(wpParlour, X(pu0), Z(dv0), X(pu0), Z(dv1), E_, FY + 2.6, uC, false);
  paper(wpHall, X(pu1), Z(bv1), X(pu1), Z(dv0), W_, FY, uC); paper(wpHall, X(pu1), Z(dv1), X(pu1), Z(IV), W_, FY, uC); paper(wpHall, X(pu1), Z(dv0), X(pu1), Z(dv1), W_, FY + 2.6, uC, false);
  paper(wpHall, X(pu1), Z(IV), X(dl), Z(IV), N_, FY, uC); paper(wpHall, X(dr), Z(IV), X(IU), Z(IV), N_, FY, uC); paper(wpHall, X(dl), Z(IV), X(dr), Z(IV), N_, FY + DOOR.h, uC, false);
  paper(wpHall, X(IU), Z(bv1), X(IU), Z(IV), E_, FY, uC); paper(wpHall, X(pu1), Z(bv1), X(ST.u0), Z(bv1), S_, FY, uC);
  paper(wpHall, X(IU), Z(bv1), X(IU), Z(ST.v0), E_, uC, uTop, false); paper(wpHall, X(ST.u0), Z(bv1), X(ST.u0), Z(ST.v0), W_, uC, uTop, false);
  paper(wpHall, X(ST.u0), Z(ST.v0), X(IU), Z(ST.v0), N_, uC, uTop, false); paper(wpHall, X(ST.u0), Z(bv1), X(IU), Z(bv1), S_, UY + 2.3, uTop, false);
  paper(wpHall, X(pu1), Z(-IV), X(IU), Z(-IV), S_, UY, uTop); paper(wpHall, X(IU), Z(-IV), X(IU), Z(bv0), E_, UY, uTop);
  paper(wpHall, X(pu1), Z(bv0), X(ST.u0), Z(bv0), N_, UY, uTop); paper(wpHall, X(ST.u0), Z(bv0), X(IU), Z(bv0), N_, UY + 2.3, uTop, false);
  paper(wpHall, X(pu1), Z(-IV), X(pu1), Z(sdv0), W_, UY, uTop); paper(wpHall, X(pu1), Z(sdv1), X(pu1), Z(bv0), W_, UY, uTop); paper(wpHall, X(pu1), Z(sdv0), X(pu1), Z(sdv1), W_, UY + 2.3, uTop, false);
  paper(wpStudy, X(-IU), Z(-IV), X(pu0), Z(-IV), S_, UY, uTop); paper(wpStudy, X(-IU), Z(-IV), X(-IU), Z(bv0), W_, UY, uTop);
  paper(wpStudy, X(-IU), Z(bv0), X(pu0), Z(bv0), N_, UY, uTop);
  paper(wpStudy, X(pu0), Z(-IV), X(pu0), Z(sdv0), E_, UY, uTop); paper(wpStudy, X(pu0), Z(sdv1), X(pu0), Z(bv0), E_, UY, uTop); paper(wpStudy, X(pu0), Z(sdv0), X(pu0), Z(sdv1), E_, UY + 2.3, uTop, false);
  // door frames on the openings, and the shut doors to the back rooms
  const frame = (x0, z0, x1, z1, y0, h, alongX) => {
    for (const [x, z] of [[x0, z0], [x1, z1]]) n.add(GEO.box, C.woodDk, { x, y: y0 + h / 2, z, sx: alongX ? 0.12 : 0.24, sy: h, sz: alongX ? 0.24 : 0.12 });
    n.add(GEO.box, C.woodDk, { x: (x0 + x1) / 2, y: y0 + h + 0.07, z: (z0 + z1) / 2, sx: alongX ? Math.abs(x1 - x0) + 0.24 : 0.26, sy: 0.16, sz: alongX ? 0.26 : Math.abs(z1 - z0) + 0.24 });
  };
  frame(X(PU), Z(dv0), X(PU), Z(dv1), FY, 2.6, false); frame(X(PU), Z(sdv0), X(PU), Z(sdv1), UY, 2.3, false); frame(X(dl), Z(IV), X(dr), Z(IV), FY, DOOR.h, true);
  // the door down to the maze (u 2.9) is its own small mesh (mazeDoor below): maze-door.js hides it on the days its own leaf hangs
  // in front of it (or it shows 1 cm behind the leaf: a double edge, the knob through it as the leaf rattles)
  const mzd = new Batcher({ vertexColors: true, castShadow: false });
  const shutDoor = (f, a, y0, nb = n) => { fbox(nb, f, a, y0 + 1.2, 0.03, 1.0, 2.4, 0.05, C.door); for (const yy of [0.6, 1.7]) fbox(nb, f, a, y0 + yy, 0.06, 0.7, 0.8, 0.03, C.woodLt); fbox(nb, f, a + 0.38, y0 + 1.1, 0.08, 0.07, 0.07, 0.05, C.brass); frame(f.x + f.tx * (a - 0.56), f.z + f.tz * (a - 0.56), f.x + f.tx * (a + 0.56), f.z + f.tz * (a + 0.56), y0, 2.4, true); };
  shutDoor(F(HX, Z(bv1), 0), -4.45, FY); shutDoor(F(HX, Z(bv1), 0), 2.9, FY, mzd);
  // floors, ceilings
  const floorPlane = (x0, z0, x1, z1, y) => n.add(tiled(x1 - x0, z1 - z0, 2.0), floorMat, { x: (x0 + x1) / 2, y: y + 0.004, z: (z0 + z1) / 2, rx: -Math.PI / 2 });
  floorPlane(X(-IU), Z(bv1), X(IU), Z(HD), FY); floorPlane(X(-IU), Z(-IV), X(IU), Z(bv0), UY); floorPlane(X(ST.u0), Z(bv0), X(IU), Z(ST.vTop), UY);
  floorPlane(X(-HW - BAY.out), Z(BAY.v0 + 0.5), X(-IU), Z(BAY.v1 - 0.5), FY);
  addSurface({ minX: X(-IU), maxX: X(IU), minZ: Z(bv1 - 0.05), maxZ: Z(HD), y: FY, sound: 'wood' });
  addSurface({ minX: X(-IU), maxX: X(IU), minZ: Z(-IV), maxZ: Z(bv0), y: UY, sound: 'wood' });
  addSurface({ minX: X(ST.u0), maxX: X(IU), minZ: Z(bv0), maxZ: Z(ST.vTop), y: UY, sound: 'wood' });
  const ceil = (x0, z0, x1, z1, y) => n.boxMinMax(x0, y, z0, x1, y + 0.12, z1, C.plaster);
  ceil(X(-IU), Z(bv1), X(pu0), Z(IV), uC); ceil(X(pu1), Z(bv1), X(ST.u0), Z(IV), uC); ceil(X(ST.u0), Z(ST.v0), X(IU), Z(IV), uC);
  ceil(X(-IU), Z(-IV), X(IU), Z(bv0), uTop); ceil(X(ST.u0), Z(bv0), X(IU), Z(ST.v0), uTop);
  ceil(X(-HW - BAY.out), Z(BAY.v0), X(-IU), Z(BAY.v1), uC);
  n.add(GEO.cyl12, C.cream, { x: X(TABLE.u), y: uC - 0.02, z: Z(TABLE.v), sx: 0.55, sy: 0.04, sz: 0.55 }); // the ceiling rose over the table
  // the bay's inside: papered between its windows, a window seat with cushions
  for (const { fi, len } of bayFaces) paper(wpParlour, fi.x - fi.tx * len / 2, fi.z - fi.tz * len / 2, fi.x + fi.tx * len / 2, fi.z + fi.tz * len / 2, fi.yaw, FY, uC, false);
  n.boxMinMax(X(-HW - BAY.out) + 0.1, FY, Z(BAY.v0 + 0.3), X(-IU), FY + 0.42, Z(BAY.v1 - 0.3), C.woodDk);
  n.boxMinMax(X(-HW - BAY.out) + 0.12, FY + 0.42, Z(BAY.v0 + 0.32), X(-IU), FY + 0.54, Z(BAY.v1 - 0.32), C.red);
  for (const v of [1.6, 2.4, 3.2]) n.add(GEO.box, ['#d9b25a', '#2f4a3f', '#d9b25a'][Math.round(v * 2) % 3], { x: X(-HW - BAY.out) + 0.32, y: FY + 0.72, z: Z(v), sx: 0.14, sy: 0.32, sz: 0.4, rz: -0.25 });
  colliders.push({ type: 'box', minX: X(-HW - BAY.out), maxX: X(-IU) + 0.05, minZ: Z(BAY.v0), maxZ: Z(BAY.v1) });

  // ---- the parlour: the fireplace and the portrait, the Arkham table and its chairs under the gasolier, a settee, a bookcase
  const fu = TABLE.u;
  // the chimney breast and the marble mantelpiece with the firebox let into them (a fire always burns in it: hearth-build.js, fires.js)
  const PH = { id: 'parlour', x: X(fu), y: FY + 0.06, z: Z(bv1) + 0.55, nx: 0, nz: 1, w: 0.32, h: 0.79, d: 0.37 }, pw = PH.w, py1 = PH.y + PH.h, pb = PH.z - PH.d;
  hearths.push(PH);
  n.boxMinMax(X(fu - 0.85), FY, Z(bv1), X(fu + 0.85), uC, pb, '#355446');
  for (const [z0, z1, x1, y1, c] of [[pb, Z(bv1) + 0.42, 0.85, uC, '#355446'], [Z(bv1) + 0.42, PH.z, 0.72, FY + 1.3, '#e9e3d8']]) {
    n.boxMinMax(X(fu - x1), FY, z0, X(fu - pw), y1, z1, c); n.boxMinMax(X(fu + pw), FY, z0, X(fu + x1), y1, z1, c);
    n.boxMinMax(X(fu - pw), py1, z0, X(fu + pw), y1, z1, c);
  }
  firebox(nReal, PH, '#1c1a1f', '#2a2226'); let embers = buildHearth(nReal, PH); // (the fires are fires.js's: built whatever draws the house)
  for (const s of [-1, 1]) n.boxMinMax(X(fu + s * pw), PH.y, PH.z, X(fu + s * (pw + 0.05)), py1 + 0.05, PH.z + 0.015, '#1c1a1f'); // the cast-iron frame round it
  n.boxMinMax(X(fu - pw - 0.05), py1, PH.z, X(fu + pw + 0.05), py1 + 0.05, PH.z + 0.015, '#1c1a1f');
  n.boxMinMax(X(fu - 0.95), FY + 1.3, Z(bv1) + 0.3, X(fu + 0.95), FY + 1.38, Z(bv1) + 0.7, '#d8d0c2');
  n.boxMinMax(X(fu - 0.9), FY, Z(bv1) + 0.55, X(fu + 0.9), FY + 0.06, Z(bv1) + 1.05, '#7d786f'); // the hearth
  n.add(GEO.box, C.woodDk, { x: X(fu), y: FY + 1.58, z: Z(bv1) + 0.5, sx: 0.32, sy: 0.4, sz: 0.16 }); // the mantel clock
  n.add(GEO.cyl12, C.cream, { x: X(fu), y: FY + 1.62, z: Z(bv1) + 0.59, sx: 0.11, sy: 0.02, sz: 0.11, rx: Math.PI / 2 });
  for (const s of [-1, 1]) { // the brass candlesticks, lit (their flames are fires.js's, on the wicks)
    const cx = X(fu + s * 0.65), cz = Z(bv1) + 0.5;
    n.add(GEO.cyl8, C.brass, { x: cx, y: FY + 1.52, z: cz, sx: 0.04, sy: 0.28, sz: 0.04 }); n.add(GEO.cyl8, C.cream, { x: cx, y: FY + 1.74, z: cz, sx: 0.025, sy: 0.16, sz: 0.025 });
    nReal.add(GEO.cyl6, '#2a2228', { x: cx, y: FY + 1.83, z: cz, sx: 0.003, sy: 0.02, sz: 0.003 }); // (the wick: fires.js's flame sits on it whatever draws the house)
    candles.push({ id: s < 0 ? 'mantel-w' : 'mantel-e', x: cx, y: FY + 1.836, z: cz, fw: 0.013, fh: 0.058 });
  }
  n.boxMinMax(X(fu - 0.6), FY + 1.75, Z(bv1) + 0.42, X(fu + 0.6), FY + 3.05, Z(bv1) + 0.48, C.brass);
  if (PA) n.add(new THREE.PlaneGeometry(PA.w, PA.h), portraitMat, { x: PA.pos[0], y: PA.pos[1], z: PA.pos[2] });
  else n.add(new THREE.PlaneGeometry(1.0, 1.1), portraitMat, { x: X(fu), y: FY + 2.4, z: Z(bv1) + 0.485 });
  colliders.push({ type: 'box', minX: X(fu - 0.95), maxX: X(fu + 0.95), minZ: Z(bv1), maxZ: Z(bv1) + 0.75 });
  // the table: round, dark, on a pedestal with claw feet; a rug under it
  n.add(new THREE.PlaneGeometry(3.6, 2.8), rugMat, { x: X(TABLE.u), y: FY + 0.012, z: Z(TABLE.v), rx: -Math.PI / 2 });
  const TT = FY + 0.64; // (a low table for the low chairs)
  n.add(GEO.cyl12, C.woodDk, { x: X(TABLE.u), y: TT - 0.04, z: Z(TABLE.v), sx: TABLE.r, sy: 0.08, sz: TABLE.r });
  n.add(GEO.cyl8, C.woodDk, { x: X(TABLE.u), y: FY + 0.32, z: Z(TABLE.v), sx: 0.12, sy: 0.58, sz: 0.12 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; n.add(GEO.box, C.woodDk, { x: X(TABLE.u + Math.cos(a) * 0.3), y: FY + 0.07, z: Z(TABLE.v + Math.sin(a) * 0.3), sx: 0.55, sy: 0.1, sz: 0.1, ry: -a }); }
  colliders.push({ type: 'circle', x: X(TABLE.u), z: Z(TABLE.v), r: TABLE.r + 0.05 });
  const chairs = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, cx = X(TABLE.u + Math.cos(a) * CHAIR_DIST), cz = Z(TABLE.v + Math.sin(a) * CHAIR_DIST);
    const yaw = Math.atan2(X(TABLE.u) - cx, Z(TABLE.v) - cz), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const SEAT = CHAIR_SEAT, box = (q, c) => n.add(GEO.box, c, { x: cx + Math.cos(yaw) * q.x + fx * q.z, y: FY + q.y, z: cz - Math.sin(yaw) * q.x + fz * q.z, sx: q.sx, sy: q.sy, sz: q.sz, ry: yaw });
    // (low, like Buddy's camp chair: the folk's legs are short; their parts in the chair's own frame for the no-clipping test)
    const top = CHAIR_SEAT; // the cushion's top, numbers from a search for no clipping (tools/w3-lovecraft-seatdbg.mjs)
    const parts = [{ x: 0, y: top - 0.055, z: -0.05, sx: 0.5, sy: 0.05, sz: 0.38, c: C.woodDk }, { x: 0, y: top - 0.015, z: -0.04, sx: 0.44, sy: 0.03, sz: 0.34, c: C.red },
      { x: 0, y: 0.72, z: -0.33, sx: 0.48, sy: 1.0, sz: 0.06, c: C.woodDk }];
    for (const q of parts) box(q, q.c);
    box({ x: 0, y: 0.76, z: -0.295, sx: 0.34, sy: 0.6, sz: 0.012 }, C.red);
    n.add(GEO.sphere, C.woodDk, { x: cx - fx * 0.33, y: FY + 1.25, z: cz - fz * 0.33, sx: 0.1, sy: 0.07, sz: 0.05, ry: yaw });
    for (const [lx, lz] of [[-0.2, -0.22], [0.2, -0.22], [-0.2, 0.12], [0.2, 0.12]]) box({ x: lx, y: (top - 0.08) / 2, z: lz, sx: 0.05, sy: top - 0.08, sz: 0.05 }, C.woodDk);
    colliders.push({ type: 'circle', x: cx, z: cz, r: 0.24, seat: true });
    chairs.push({ x: cx + fx * CHAIR_SIT, z: cz + fz * CHAIR_SIT, y: FY, yaw, seatY: SEAT, fold: top, frame: { x: cx, z: cz }, boxes: parts });
  }
  // the gasolier: a brass stem, three arms with glass shades (gas flames: they gutter in the storm, daynight.js FLICKER_LAMPS)
  n.add(GEO.cyl6, C.brass, { x: X(TABLE.u), y: (uC + FY + 2.45) / 2, z: Z(TABLE.v), sx: 0.025, sy: uC - FY - 2.45, sz: 0.025 });
  n.add(GEO.sphere, C.brass, { x: X(TABLE.u), y: FY + 2.42, z: Z(TABLE.v), sx: 0.12, sy: 0.16, sz: 0.12 });
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const ax = X(TABLE.u + Math.cos(a) * 0.38), az = Z(TABLE.v + Math.sin(a) * 0.38); n.add(GEO.box, C.brass, { x: (ax + X(TABLE.u)) / 2, y: FY + 2.38, z: (az + Z(TABLE.v)) / 2, sx: 0.4, sy: 0.03, sz: 0.03, ry: -a }); n.add(GEO.cone8, lampGlow('#ffc766'), { x: ax, y: FY + 2.42, z: az, sx: 0.11, sy: 0.18, sz: 0.11, rx: Math.PI }); }
  spot({ x: X(TABLE.u), y: FY + 2.3, z: Z(TABLE.v), color: '#ffc466', pool: 2.8, gy: FY, halo: 0, flicker: 0.35 });
  // a settee against the hall wall, a side table with an oil lamp, a glass-fronted bookcase, a fern on a stand, sconces
  {
    const u = pu0 - 0.42, v0 = 4.25, v1 = 6.05;
    n.boxMinMax(X(u - 0.38), FY + 0.12, Z(v0), X(u + 0.38), FY + 0.48, Z(v1), C.red);
    n.boxMinMax(X(u + 0.22), FY + 0.48, Z(v0), X(u + 0.38), FY + 1.05, Z(v1), C.red);
    for (const v of [v0, v1]) n.boxMinMax(X(u - 0.38), FY + 0.12, Z(v) - 0.08, X(u + 0.38), FY + 0.72, Z(v) + 0.08, '#5e1a28');
    n.boxMinMax(X(u - 0.38), FY, Z(v0), X(u + 0.38), FY + 0.12, Z(v1), C.woodDk);
    colliders.push({ type: 'box', minX: X(u - 0.4), maxX: X(pu0), minZ: Z(v0) - 0.1, maxZ: Z(v1) + 0.1 });
    const tx = X(pu0 - 0.4), tz = Z(3.95 - 0.25);
    n.add(GEO.cyl8, C.woodDk, { x: tx, y: FY + 0.35, z: tz, sx: 0.04, sy: 0.7, sz: 0.04 }); n.add(GEO.cyl12, C.woodDk, { x: tx, y: FY + 0.7, z: tz, sx: 0.26, sy: 0.04, sz: 0.26 });
    n.add(GEO.cyl8, C.brass, { x: tx, y: FY + 0.82, z: tz, sx: 0.07, sy: 0.2, sz: 0.07 }); n.add(GEO.sphere, lampGlow('#ffcf6a'), { x: tx, y: FY + 1.0, z: tz, sx: 0.11, sy: 0.14, sz: 0.11 });
    colliders.push({ type: 'circle', x: tx, z: tz, r: 0.28 });
    // the bookcase on the west wall, between the bay and the front corner
    const bz0 = Z(BAY.v1 + 0.15), bz1 = Z(IV - 0.1), bx = X(-IU);
    n.boxMinMax(bx, FY, bz0, bx + 0.4, FY + 2.3, bz1, C.woodDk);
    books(n, bx + 0.42, bz0 + 0.06, bz1 - 0.06, FY + 0.15, 4, 0.48, 'x+', 11);
    n.boxMinMax(bx + 0.4, FY + 2.3, bz0 - 0.04, bx + 0.48, FY + 2.42, bz1 + 0.04, C.woodDk);
    colliders.push({ type: 'box', minX: bx, maxX: bx + 0.5, minZ: bz0, maxZ: bz1 });
    const fx = X(-2.8), fz = Z(IV - 0.45); // the fern on its stand by the front window
    n.add(GEO.cyl8, C.woodDk, { x: fx, y: FY + 0.4, z: fz, sx: 0.16, sy: 0.8, sz: 0.16 }); n.add(GEO.cyl8, '#8a5a3a', { x: fx, y: FY + 0.92, z: fz, sx: 0.2, sy: 0.24, sz: 0.2 });
    for (let i = 0; i < 7; i++) { const a = i * 0.9; n.add(GEO.box, '#3f8a3c', { x: fx + Math.cos(a) * 0.22, y: FY + 1.15, z: fz + Math.sin(a) * 0.22, sx: 0.08, sy: 0.04, sz: 0.55, ry: -a + Math.PI / 2, rx: 0.5 }); }
    colliders.push({ type: 'circle', x: fx, z: fz, r: 0.28 });
    for (const u2 of [fu - 1.4, fu + 1.4]) sconce(n, F(X(u2), Z(bv1), 0), 0, FY + 2.05);
  }

  // ---- the hall: the staircase up the east wall (dark treads, a red runner, the banister on its open side), a grandfather
  // clock, a hall table with a mirror, an umbrella stand, a pendant lamp
  for (let i = 1; i <= ST.n; i++) {
    const v1 = ST.v0 - (i - 1) * ST.tread, v0 = v1 - ST.tread, y = FY + i * ST.rise;
    n.boxMinMax(X(ST.u0), y - ST.rise, Z(v0), X(ST.u1), y - 0.05, Z(v0) + 0.04, C.cream);        // the riser (up to the tread, not through it)
    n.boxMinMax(X(ST.u0) - 0.02, y - 0.05, Z(v0), X(ST.u1), y, Z(v1) + 0.03, C.woodLt);          // the tread (and its nosing)
    n.boxMinMax(X(ST.u0) + 0.2, y, Z(v0) + 0.02, X(ST.u1) - 0.12, y + 0.015, Z(v1), C.red);     // the runner
    n.boxMinMax(X(ST.u0) - 0.06, FY, Z(v0), X(ST.u0) + 0.02, y - 0.05, Z(v1), C.woodDk);       // the panelled side under it
    addSurface({ minX: X(ST.u0), maxX: X(ST.u1), minZ: Z(v0), maxZ: Z(v1), y, sound: 'wood' });
    n.add(GEO.cyl6, C.woodDk, { x: X(ST.u0) + 0.06, y: y + 0.45, z: Z((v0 + v1) / 2), sx: 0.022, sy: 0.9, sz: 0.022 });
  }
  {
    const y0 = FY + 0.2 + 0.92, y1 = UY + 0.92, z0 = Z(ST.v0), z1 = Z(ST.vTop), len = Math.hypot(z1 - z0, y1 - y0);
    n.add(GEO.box, C.woodDk, { x: X(ST.u0) + 0.06, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: 0.08, sy: 0.08, sz: len, rx: Math.atan2(-(y1 - y0), z1 - z0) });
    n.add(GEO.cyl8, C.woodDk, { x: X(ST.u0) + 0.06, y: FY + 0.6, z: Z(ST.v0) + 0.05, sx: 0.09, sy: 1.2, sz: 0.09 });
    n.add(GEO.sphere, C.woodLt, { x: X(ST.u0) + 0.06, y: FY + 1.26, z: Z(ST.v0) + 0.05, sx: 0.11, sy: 0.11, sz: 0.11 });
    n.add(GEO.cyl8, C.woodDk, { x: X(ST.u0) + 0.06, y: UY + 0.5, z: Z(ST.vTop), sx: 0.08, sy: 1.0, sz: 0.08 });
  }
  {
    const cx = X(pu1 + 0.3), cz = Z(0.75); // the grandfather clock
    n.boxMinMax(cx - 0.25, FY, cz - 0.22, cx + 0.25, FY + 2.15, cz + 0.22, C.woodDk);
    n.add(GEO.cyl12, C.cream, { x: cx + 0.26, y: FY + 1.85, z: cz, sx: 0.17, sy: 0.02, sz: 0.17, rz: Math.PI / 2 });
    n.add(GEO.box, C.brass, { x: cx + 0.26, y: FY + 1.1, z: cz, sx: 0.02, sy: 0.5, sz: 0.12 });
    n.add(prism(0.6, 0.2, 0.5), C.woodDk, { x: cx, y: FY + 2.15, z: cz, ry: Math.PI / 2 });
    colliders.push({ type: 'box', minX: cx - 0.28, maxX: cx + 0.28, minZ: cz - 0.25, maxZ: cz + 0.25 });
    const hx = X(pu1 + 0.2), hz = Z(5.3); // the hall table and its mirror
    n.boxMinMax(hx, FY + 0.82, hz - 0.5, hx + 0.38, FY + 0.88, hz + 0.5, C.woodDk);
    for (const s of [-1, 1]) n.boxMinMax(hx + 0.28, FY, hz + s * 0.44 - 0.03, hx + 0.34, FY + 0.82, hz + s * 0.44 + 0.03, C.woodDk);
    n.boxMinMax(X(pu1) + 0.01, FY + 1.2, hz - 0.42, X(pu1) + 0.06, FY + 2.3, hz + 0.42, C.brass);
    n.boxMinMax(X(pu1) + 0.06, FY + 1.27, hz - 0.35, X(pu1) + 0.07, FY + 2.23, hz + 0.35, '#b9c8cf');
    n.add(GEO.cyl8, '#5f9fc2', { x: hx + 0.2, y: FY + 1.0, z: hz, sx: 0.08, sy: 0.22, sz: 0.08 });
    colliders.push({ type: 'box', minX: hx - 0.2, maxX: hx + 0.4, minZ: hz - 0.52, maxZ: hz + 0.52 });
    n.add(GEO.cyl8, C.brass, { x: X(dl - 0.3), y: FY + 0.32, z: Z(IV - 0.3), sx: 0.13, sy: 0.6, sz: 0.13 });
    for (const k of [-1, 1]) n.add(GEO.cyl6, k < 0 ? '#2b2b33' : C.red, { x: X(dl - 0.3) + k * 0.04, y: FY + 0.7, z: Z(IV - 0.3), sx: 0.03, sy: 0.9, sz: 0.03, rz: k * 0.12 });
    colliders.push({ type: 'circle', x: X(dl - 0.3), z: Z(IV - 0.3), r: 0.2 });
    n.boxMinMax(X(2.3), FY + 0.01, Z(0.4), X(3.6), FY + 0.02, Z(6.0), '#8e2430'); // the hall runner
    n.boxMinMax(X(2.4), FY + 0.012, Z(0.5), X(3.5), FY + 0.022, Z(5.9), '#c9a24a');
    n.boxMinMax(X(2.5), FY + 0.014, Z(0.6), X(3.4), FY + 0.024, Z(5.8), '#8e2430');
    n.add(GEO.cyl6, C.brass, { x: X(2.4), y: (uC + FY + 2.5) / 2, z: Z(4.4), sx: 0.02, sy: uC - FY - 2.5, sz: 0.02 });
    n.add(GEO.sphere, lampGlow('#ffc766'), { x: X(2.4), y: FY + 2.45, z: Z(4.4), sx: 0.16, sy: 0.2, sz: 0.16 });
    spot({ x: X(2.4), y: FY + 2.3, z: Z(4.4), color: '#ffc466', pool: 2.4, gy: FY, halo: 0, flicker: 0.3 });
    sconce(n, F(X(pu1), Z(1.5), Math.PI / 2), 0, FY + 2.05);
  }

  // ---- upstairs: the landing (a rug, a chest, a bench under the window, a sconce) and Lovecraft's study
  {
    n.boxMinMax(X(2.0), UY + 0.01, Z(-5.6), X(4.6), UY + 0.02, Z(-1.4), '#3a4566');
    n.boxMinMax(X(2.2), UY + 0.012, Z(-5.4), X(4.4), UY + 0.022, Z(-1.6), '#c9a24a');
    n.boxMinMax(X(2.35), UY + 0.014, Z(-5.25), X(4.25), UY + 0.024, Z(-1.75), '#3a4566');
    const bx0 = X(2.7), bx1 = X(4.1), bz = Z(-IV + 0.25);
    n.boxMinMax(bx0, UY, bz - 0.25, bx1, UY + 0.45, bz + 0.25, C.woodDk); n.boxMinMax(bx0 + 0.04, UY + 0.45, bz - 0.22, bx1 - 0.04, UY + 0.55, bz + 0.22, C.red);
    colliders.push({ type: 'box', minX: bx0, maxX: bx1, minZ: bz - 0.28, maxZ: bz + 0.28 });
    { const kx = bx0 + 0.45, ky = UY + 0.6; // a black cat asleep on the bench's cushion (he adored cats)
      n.add(GEO.sphere, '#1b1b1f', { x: kx, y: ky + 0.06, z: bz, sx: 0.2, sy: 0.1, sz: 0.15 });
      n.add(GEO.sphere, '#1b1b1f', { x: kx + 0.15, y: ky + 0.1, z: bz + 0.06, sx: 0.08, sy: 0.07, sz: 0.08 });
      for (const s of [-1, 1]) n.add(GEO.cone6, '#1b1b1f', { x: kx + 0.17, y: ky + 0.17, z: bz + 0.06 + s * 0.04, sx: 0.025, sy: 0.05, sz: 0.025 });
      n.add(GEO.box, '#1b1b1f', { x: kx - 0.12, y: ky + 0.03, z: bz + 0.12, sx: 0.3, sy: 0.04, sz: 0.05, ry: 0.4 }); }
    const cz0 = Z(-2.2), cx = X(IU - 0.3);
    n.boxMinMax(cx - 0.3, UY, cz0 - 0.55, cx + 0.3, UY + 0.6, cz0 + 0.55, C.woodLt); n.boxMinMax(cx - 0.32, UY + 0.6, cz0 - 0.57, cx + 0.32, UY + 0.66, cz0 + 0.57, C.woodDk);
    for (const s of [-1, 1]) n.add(GEO.box, C.brass, { x: cx - 0.31, y: UY + 0.4, z: cz0 + s * 0.3, sx: 0.02, sy: 0.08, sz: 0.12 });
    colliders.push({ type: 'box', minX: cx - 0.33, maxX: X(IU), minZ: cz0 - 0.58, maxZ: cz0 + 0.58 });
    sconce(n, F(X(IU), Z(-4.2), -Math.PI / 2), 0, UY + 2.0);
    spot({ x: X(IU) - 0.35, y: UY + 2.1, z: Z(-4.2), color: '#ffc466', pool: 2.2, gy: UY, halo: 0, flicker: 0.3 }); // (at the sconce: fire-season)
  }
  {
    // the study: the desk under the back window (papers, letters, an inkwell, the green lamp), his chair, bookshelves floor to
    // picture rail, a small fireplace with the star chart over it, a wing chair with a black cat asleep on it, a globe, a telescope
    const dx = X(-2.2), dz = Z(-IV + 0.6), top = UY + 0.76;
    n.boxMinMax(dx - 0.95, top - 0.06, dz - 0.4, dx + 0.95, top, dz + 0.4, C.woodDk);
    for (const s of [-1, 1]) n.boxMinMax(dx + s * 0.7 - 0.22, UY, dz - 0.36, dx + s * 0.7 + 0.22, top - 0.06, dz + 0.36, C.wood);
    n.boxMinMax(dx - 0.9, top, dz - 0.36, dx + 0.9, top + 0.01, dz + 0.3, '#2f5a3f'); // the leather top
    for (const [ox, oz, r] of [[-0.3, 0.1, 0.2], [0.05, 0.0, -0.15], [0.25, 0.15, 0.4], [-0.55, -0.05, 0.1]]) n.add(GEO.box, '#f6f1e2', { x: dx + ox, y: top + 0.016 + Math.abs(r) * 0.01, z: dz + oz, sx: 0.21, sy: 0.004, sz: 0.29, ry: r });
    for (let k = 0; k < 4; k++) n.add(GEO.box, k % 2 ? '#e8dcc0' : '#f3ead4', { x: dx + 0.66, y: top + 0.03 + k * 0.035, z: dz - 0.12, sx: 0.24, sy: 0.03, sz: 0.16, ry: k * 0.1 }); // letters, tied in bundles
    n.add(GEO.box, C.red, { x: dx + 0.66, y: top + 0.1, z: dz - 0.12, sx: 0.25, sy: 0.15, sz: 0.012 });
    n.add(GEO.cyl8, '#1c1a1f', { x: dx - 0.62, y: top + 0.04, z: dz + 0.12, sx: 0.05, sy: 0.07, sz: 0.05 });
    n.add(GEO.box, '#f6f1e2', { x: dx - 0.58, y: top + 0.14, z: dz + 0.12, sx: 0.01, sy: 0.2, sz: 0.01, rz: -0.35 });
    n.add(GEO.cyl8, C.brass, { x: dx - 0.62, y: top + 0.02, z: dz - 0.2, sx: 0.09, sy: 0.04, sz: 0.09 });
    n.add(GEO.cyl6, C.brass, { x: dx - 0.62, y: top + 0.2, z: dz - 0.2, sx: 0.015, sy: 0.34, sz: 0.015 });
    n.add(GEO.box, '#2f7a4a', { x: dx - 0.62, y: top + 0.38, z: dz - 0.16, sx: 0.36, sy: 0.1, sz: 0.16, rx: 0.2 });
    n.add(GEO.box, lampGlow('#ffe7a8'), { x: dx - 0.62, y: top + 0.32, z: dz - 0.15, sx: 0.3, sy: 0.02, sz: 0.12 });
    spot({ x: dx - 0.62, y: top + 0.3, z: dz - 0.1, color: '#ffe0a0', pool: 1.6, gy: UY, halo: 0 });
    colliders.push({ type: 'box', minX: dx - 0.97, maxX: dx + 0.97, minZ: dz - 0.42, maxZ: dz + 0.42 });
    const chz = dz + 0.75; // his chair, pulled up to the desk
    n.boxMinMax(dx - 0.26, UY + 0.42, chz - 0.24, dx + 0.26, UY + 0.5, chz + 0.24, C.wood);
    n.boxMinMax(dx - 0.26, UY + 0.5, chz + 0.18, dx + 0.26, UY + 1.15, chz + 0.25, C.wood);
    for (const [lx, lz] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) n.add(GEO.box, C.wood, { x: dx + lx, y: UY + 0.21, z: chz + lz, sx: 0.05, sy: 0.42, sz: 0.05 });
    colliders.push({ type: 'circle', x: dx, z: chz, r: 0.3 });
    // shelves: the west wall and the study's side of the partition
    const sx0 = X(-IU);
    n.boxMinMax(sx0, UY, Z(-IV + 0.15), sx0 + 0.36, UY + 2.5, Z(-4.0), C.woodDk); books(n, sx0 + 0.37, Z(-IV + 0.2), Z(-4.05), UY + 0.15, 5, 0.47, 'x+', 21);
    n.boxMinMax(sx0, UY, Z(-2.8), sx0 + 0.36, UY + 2.5, Z(bv0 - 0.1), C.woodDk); books(n, sx0 + 0.37, Z(-2.75), Z(bv0 - 0.15), UY + 0.15, 5, 0.47, 'x+', 33);
    n.boxMinMax(X(pu0) - 0.36, UY, Z(-IV + 0.15), X(pu0), UY + 2.5, Z(sdv0 - 0.15), C.woodDk); books(n, X(pu0) - 0.37, Z(-IV + 0.2), Z(sdv0 - 0.2), UY + 0.15, 5, 0.47, 'x-', 45);
    colliders.push({ type: 'box', minX: sx0, maxX: sx0 + 0.4, minZ: Z(-IV), maxZ: Z(-4.0) }, { type: 'box', minX: sx0, maxX: sx0 + 0.4, minZ: Z(-2.8), maxZ: Z(bv0) }, { type: 'box', minX: X(pu0) - 0.4, maxX: X(pu0), minZ: Z(-IV), maxZ: Z(sdv0 - 0.1) });
    // the study's fireplace (back to back with the parlour's), the star chart over it
    const SH = { id: 'study', x: X(fu), y: UY + 0.04, z: Z(bv0) - 0.5, nx: 0, nz: -1, w: 0.26, h: 0.68, d: 0.36 }, sw = SH.w, sy1 = SH.y + SH.h, sb = SH.z + SH.d;
    hearths.push(SH);
    n.boxMinMax(X(fu - 0.75), UY, sb, X(fu + 0.75), uTop, Z(bv0), '#2a3350');
    for (const [z0, z1, x1, y1, c] of [[Z(bv0) - 0.38, sb, 0.75, uTop, '#2a3350'], [SH.z, Z(bv0) - 0.38, 0.6, UY + 1.15, '#3b2a22']]) {
      n.boxMinMax(X(fu - x1), UY, z0, X(fu - sw), y1, z1, c); n.boxMinMax(X(fu + sw), UY, z0, X(fu + x1), y1, z1, c);
      n.boxMinMax(X(fu - sw), sy1, z0, X(fu + sw), y1, z1, c);
    }
    firebox(nReal, SH, '#1c1a1f', '#2a2226'); embers = buildHearth(nReal, SH, embers);
    for (const s of [-1, 1]) n.boxMinMax(X(fu + s * sw), SH.y, SH.z - 0.015, X(fu + s * (sw + 0.04)), sy1 + 0.04, SH.z, '#1c1a1f'); // the iron frame
    n.boxMinMax(X(fu - sw - 0.04), sy1, SH.z - 0.015, X(fu + sw + 0.04), sy1 + 0.04, SH.z, '#1c1a1f');
    n.boxMinMax(X(fu - 0.75), UY, Z(bv0) - 1.0, X(fu + 0.75), UY + 0.04, SH.z, '#6e6960'); // a stone hearth in front of it
    n.boxMinMax(X(fu - 0.8), UY + 1.15, Z(bv0) - 0.62, X(fu + 0.8), UY + 1.22, Z(bv0) - 0.3, C.woodDk);
    n.boxMinMax(X(fu - 0.5), UY + 1.6, Z(bv0) - 0.42, X(fu + 0.5), UY + 2.6, Z(bv0) - 0.38, C.brass);
    if (CA) n.add(new THREE.PlaneGeometry(CA.w, CA.h), chartMat, { x: CA.pos[0], y: CA.pos[1], z: CA.pos[2], ry: Math.PI });
    else n.add(new THREE.PlaneGeometry(0.9, 0.9), chartMat, { x: X(fu), y: UY + 2.1, z: Z(bv0) - 0.425, ry: Math.PI });
    n.add(GEO.box, C.woodDk, { x: X(fu + 0.5), y: UY + 1.32, z: Z(bv0) - 0.45, sx: 0.14, sy: 0.2, sz: 0.1 }); // a little skull? no: a carved owl
    n.add(GEO.sphere, '#7a6a4a', { x: X(fu + 0.5), y: UY + 1.48, z: Z(bv0) - 0.45, sx: 0.08, sy: 0.08, sz: 0.07 });
    colliders.push({ type: 'box', minX: X(fu - 0.8), maxX: X(fu + 0.8), minZ: Z(bv0) - 0.65, maxZ: Z(bv0) });
    // the wing chair by the fire with the cat
    const ax = X(WING_AT.u), az = Z(WING_AT.v), ay = WING_AT.yaw; // (lovecraft-plan.js: it faces the fire)
    const afx = Math.sin(ay), afz = Math.cos(ay), arx = Math.cos(ay), arz = -Math.sin(ay);
    // (its parts in the chair's own frame: x to its right, z forward, y up from the floor; the Professor sits in it: WING)
    for (const q of WING.boxes) n.add(GEO.box, q.c, { x: ax + arx * q.x + afx * q.z, y: UY + q.y, z: az + arz * q.x + afz * q.z, sx: q.sx, sy: q.sy, sz: q.sz, ry: ay });
    for (const s of [-1, 1]) n.add(GEO.cyl8, '#3b2418', { x: ax + arx * s * 0.42 + afx * 0.14, y: UY + 0.02, z: az + arz * s * 0.42 + afz * 0.14, sx: 0.04, sy: 0.1, sz: 0.04 });
    colliders.push({ type: 'circle', x: ax, z: az, r: 0.5 });
    // the globe and the telescope by the west window (he loved the stars)
    const gx2 = X(-4.5), gz2 = Z(-1.4);
    n.add(GEO.cyl8, C.woodDk, { x: gx2, y: UY + 0.35, z: gz2, sx: 0.05, sy: 0.7, sz: 0.05 }); n.add(GEO.sphere, '#4f7fa8', { x: gx2, y: UY + 0.95, z: gz2, sx: 0.26, sy: 0.26, sz: 0.26 });
    n.add(new THREE.TorusGeometry(0.29, 0.015, 6, 20), C.brass, { x: gx2, y: UY + 0.95, z: gz2, ry: 0.5 });
    colliders.push({ type: 'circle', x: gx2, z: gz2, r: 0.3 });
    const tx = X(-4.4), tz = Z(-3.4);
    for (let i = 0; i < 3; i++) { const a = i * 2.1; n.add(GEO.cyl6, C.woodDk, { x: tx + Math.cos(a) * 0.2, y: UY + 0.55, z: tz + Math.sin(a) * 0.2, sx: 0.02, sy: 1.15, sz: 0.02, rz: Math.cos(a) * 0.18, rx: -Math.sin(a) * 0.18 }); }
    n.add(GEO.cyl8, C.brass, { x: tx - 0.2, y: UY + 1.2, z: tz, sx: 0.06, sy: 1.0, sz: 0.06, rz: Math.PI / 2 + 0.45 });
    colliders.push({ type: 'circle', x: tx, z: tz, r: 0.32 });
    n.add(new THREE.PlaneGeometry(2.6, 2.0), rugMat, { x: X(-2.0), y: UY + 0.012, z: Z(-3.3), rx: -Math.PI / 2 });
    sconce(n, F(X(-IU), Z(-3.4), Math.PI / 2), 0.9, UY + 2.0);
  }

  b.build(ext, 'lovecraft-ext');
  const laps = M ? [] : cl.build(ext, 'lovecraft-clapboard');
  const glassMeshes = gb.build(ext, 'lovecraft-glass-real');
  for (const m of glassMeshes) { m.userData.noMerge = true; m.castShadow = false; }
  n.build(inside, 'lovecraft-inside');
  const hearthEmbers = buildEmbers(embers, inside, 'hearth-embers'); // both fires' coals: one batch (they always burn)
  const mazeDoor = mzd.build(inside, 'lovecraft-maze-door');
  shadows(ext);
  for (const m of laps) { soft(m); m.castShadow = false; }
  for (const m of glassMeshes) { m.castShadow = false; m.receiveShadow = false; }
  for (const m of inside.children) { m.castShadow = false; m.receiveShadow = true; }

  // ---- the front door: one heavy panelled leaf, hinged on the west jamb, swinging in
  const door = new THREE.Group(); door.name = 'lovecraft-door'; door.position.set(X(dl), FY, Z(IV) + 0.12);
  {
    const db = new Batcher({ vertexColors: true }), w = DOOR.w - 0.04;
    db.add(GEO.box, C.door, { x: w / 2, y: DOOR.h / 2, z: 0, sx: w, sy: DOOR.h, sz: 0.08 });
    for (const [px, py] of [[0.3, 0.6], [0.92, 0.6], [0.3, 1.8], [0.92, 1.8]]) for (const zz of [-0.05, 0.05]) db.add(GEO.box, '#6e4430', { x: px, y: py, z: zz, sx: 0.42, sy: 0.75, sz: 0.03 });
    for (const zz of [-0.07, 0.07]) { db.add(GEO.sphere, C.brass, { x: w - 0.12, y: 1.05, z: zz, sx: 0.045, sy: 0.045, sz: 0.045 }); }
    db.add(new THREE.TorusGeometry(0.07, 0.015, 6, 12), C.brass, { x: w / 2, y: 1.55, z: 0.07 }); // the knocker
    db.build(door, 'lovecraft-door');
    for (const m of door.children) m.matrixAutoUpdate = true;
  }
  root.add(door);
  const doorCol = { type: 'box', minX: X(dl), maxX: X(dr), minZ: Z(IV) - 0.02, maxZ: Z(HD) + 0.02, door: true };
  colliders.push(doorCol);

  // ---- the Arkham table's two looks: the game laid out (open days) and the box shut with a card (closed days)
  const TX = X(TABLE.u), TZ = Z(TABLE.v);
  const gameOn = new THREE.Group(), gameOff = new THREE.Group(); gameOn.name = 'lovecraft-arkham-open'; gameOff.name = 'lovecraft-arkham-closed'; inside.add(gameOn, gameOff);
  {
    const d = new Batcher({ vertexColors: true, castShadow: false });
    d.add(GEO.box, '#d8c49a', { x: TX, y: TT + 0.01, z: TZ, sx: 1.0, sy: 0.02, sz: 0.7, ry: 0.2 });       // the map of Arkham
    for (let i = 0; i < 5; i++) d.add(GEO.box, '#b8433c', { x: TX - 0.32 + i * 0.16, y: TT + 0.025, z: TZ - 0.15 + (i % 2) * 0.25, sx: 0.32, sy: 0.004, sz: 0.01, ry: i });
    for (let i = 0; i < 6; i++) d.add(GEO.cyl8, ['#2f6b4f', '#7a2232', '#3f6fa8', '#d9b25a'][i % 4], { x: TX - 0.3 + (i % 3) * 0.3, y: TT + 0.05, z: TZ - 0.12 + Math.floor(i / 3) * 0.26, sx: 0.025, sy: 0.06, sz: 0.025 }); // investigators' pawns
    for (let k = 0; k < 4; k++) d.add(GEO.box, k % 2 ? '#e8dcc0' : '#3a3346', { x: TX + 0.52, y: TT + 0.02 + k * 0.012, z: TZ + 0.3, sx: 0.11, sy: 0.01, sz: 0.16, ry: 0.2 + k * 0.05 }); // the decks
    d.add(GEO.box, '#5a2f3a', { x: TX - 0.55, y: TT + 0.06, z: TZ + 0.38, sx: 0.26, sy: 0.12, sz: 0.2 });
    d.add(GEO.box, '#2f3a5a', { x: TX - 0.53, y: TT + 0.18, z: TZ + 0.36, sx: 0.24, sy: 0.1, sz: 0.18, ry: 0.3 });
    for (const [cx, cz, ry] of chairs.map(c => [c.x + (TX - c.x) * 0.45, c.z + (TZ - c.z) * 0.45, c.yaw])) for (let k = 0; k < 3; k++) d.add(GEO.box, '#f3ead4', { x: cx + Math.cos(ry) * (k - 1) * 0.05, y: TT + 0.008 + k * 0.003, z: cz - Math.sin(ry) * (k - 1) * 0.05, sx: 0.07, sy: 0.003, sz: 0.1, ry: ry + (k - 1) * 0.25 });
    d.add(GEO.cyl8, '#efe6d0', { x: TX + 0.1, y: TT + 0.12, z: TZ - 0.32, sx: 0.04, sy: 0.22, sz: 0.04 });
    d.add(GEO.cyl6, '#2a2228', { x: TX + 0.1, y: TT + 0.24, z: TZ - 0.32, sx: 0.004, sy: 0.022, sz: 0.004 }); // the wick (its flame is fires.js's)
    candles.push({ id: 'arkham-table', x: TX + 0.1, y: TT + 0.246, z: TZ - 0.32, fw: 0.016, fh: 0.062, group: gameOn });
    d.build(gameOn, 'lovecraft-arkham-open');
  }
  const cardOpen = new THREE.MeshBasicMaterial({ map: printed(['Arkham Horror', 'open tonight', 'pull up a chair'], { w: 256, h: 160, bg: '#2a2530', fg: '#e8d9b0', sub: '#8fb08a' }), fog: false });
  {
    const d = new Batcher({ vertexColors: true, castShadow: false });
    d.add(GEO.box, '#1f2a22', { x: TX + 0.1, y: TT + 0.05, z: TZ + 0.05, sx: 0.6, sy: 0.1, sz: 0.42, ry: 0.15 }); // the box, shut
    d.add(GEO.box, '#8fb08a', { x: TX + 0.1, y: TT + 0.101, z: TZ + 0.05, sx: 0.5, sy: 0.004, sz: 0.06, ry: 0.15 });
    d.add(GEO.box, '#d8c49a', { x: TX - 0.38, y: TT + 0.03, z: TZ - 0.15, sx: 0.32, sy: 0.04, sz: 0.24, ry: -0.3 }); // the folded map
    d.build(gameOff, 'lovecraft-arkham-closed');
  }
  // the little standing card on the table (both looks): its faces are the feature's (open / closed words)
  const card = new THREE.Group(); card.position.set(TX - 0.15, TT + 0.09, TZ + 0.42); card.rotation.y = 0.35; inside.add(card);
  { const cb = new Batcher({ vertexColors: true, castShadow: false }); for (const k of [-1, 1]) cb.add(GEO.box, '#e8dcc0', { x: 0, y: 0, z: k * 0.03, sx: 0.3, sy: 0.2, sz: 0.01, rx: k * 0.3 }); cb.build(card, 'lovecraft-card'); }

  // where the four Arkham folk stand or sit when they are not at the table (closed days), world { x, z, yaw, y, seatY?, anim }
  const spots = {
    detective: { x: X(fu + 1.1), z: Z(bv1) + 1.5, yaw: Math.atan2(X(fu) - X(fu + 1.1), (Z(bv1) + 0.5) - (Z(bv1) + 1.5)), y: FY, anim: 'look' },
    professor: { x: X(WING_AT.u) + Math.sin(WING_AT.yaw) * WING.sitZ, z: Z(WING_AT.v) + Math.cos(WING_AT.yaw) * WING.sitZ, yaw: WING_AT.yaw, y: UY, seatY: WING.seatY, fold: WING.seatY, chair: WING.chair, anim: 'sit' },
    reporter: { x: X(2.6), z: Z(4.6), yaw: Math.PI, y: FY, anim: 'talk' },
    cultist: { x: X(3.3), z: Z(-4.9), yaw: -Math.PI / 2, y: UY, anim: 'whisper' },
  };

  // the rooms (world boxes) for the feature's room view and the "inside" tests: each with the spots its camera may hang at (up
  // in a corner, inset 0.4 m; the hall's never over the stairs; the stairs' at either end of the stairwell, high up), and the
  // walls a camera must see past (2D boxes with the heights they stand between)
  const cy0 = uC - 0.3, cy1 = uTop - 0.3, cs = (x0, z0, x1, z1, y) => [[x0 + 0.4, z0 + 0.4, y], [x1 - 0.4, z0 + 0.4, y], [x0 + 0.4, z1 - 0.4, y], [x1 - 0.4, z1 - 0.4, y]];
  const rooms = [
    { id: 'parlour', minX: X(-IU), maxX: X(pu0), minZ: Z(bv1), maxZ: Z(IV), y: FY, top: uC, cams: cs(X(-IU), Z(bv1), X(pu0), Z(IV), cy0) },
    { id: 'stair', minX: X(ST.u0), maxX: X(IU), minZ: Z(bv0), maxZ: Z(ST.v0), y: FY, top: uTop, stair: true, cams: [[X((ST.u0 + IU) / 2), Z(ST.v0) - 0.3, uTop - 0.45], [X((ST.u0 + IU) / 2), Z(bv0) + 0.35, uTop - 0.45]] },
    { id: 'hall', minX: X(pu1), maxX: X(IU), minZ: Z(bv1), maxZ: Z(IV), y: FY, top: uC, cams: [[X(pu1) + 0.45, Z(1.6), cy0], [X(ST.u0) - 0.35, Z(bv1) + 0.4, cy0], [X(pu1) + 0.4, Z(IV) - 0.4, cy0], [X(IU) - 0.4, Z(IV) - 0.4, cy0], [X(pu1) + 0.4, Z(IV) - 1.4, cy0]] }, // the last, on the west wall by the front, sees the foot of the stairs past the open door
    { id: 'study', minX: X(-IU), maxX: X(pu0), minZ: Z(-IV), maxZ: Z(bv0), y: UY, top: uTop, cams: cs(X(-IU), Z(-IV), X(pu0), Z(bv0), cy1) },
    { id: 'landing', minX: X(pu1), maxX: X(IU), minZ: Z(-IV), maxZ: Z(bv0), y: UY, top: uTop, cams: cs(X(pu1), Z(-IV), X(IU), Z(bv0), cy1) },
  ];
  const walls = [
    { minX: X(pu0), maxX: X(pu1), minZ: Z(bv1), maxZ: Z(dv0), y0: FY, y1: UY }, { minX: X(pu0), maxX: X(pu1), minZ: Z(dv1), maxZ: Z(IV), y0: FY, y1: UY },
    { minX: X(-IU), maxX: X(IU), minZ: Z(bv0), maxZ: Z(bv1), y0: FY, y1: UY }, { minX: X(ST.u0) - 0.12, maxX: X(ST.u0), minZ: Z(bv1), maxZ: Z(ST.v0), y0: FY, y1: UY },
    { minX: X(pu0), maxX: X(pu1), minZ: Z(-IV), maxZ: Z(sdv0), y0: UY, y1: EAVE }, { minX: X(pu0), maxX: X(pu1), minZ: Z(sdv1), maxZ: Z(bv0), y0: UY, y1: EAVE },
    { minX: X(-IU), maxX: X(ST.u0), minZ: Z(bv0), maxZ: Z(bv1), y0: UY, y1: EAVE },
  ];
  return {
    wing: { x: X(WING_AT.u), z: Z(WING_AT.v), yaw: WING_AT.yaw, y: UY, boxes: WING.boxes },
    // the telescope by the study's west window: where you stand to look, and where its view starts (just outside that window's glass)
    scope: { x: X(-4.4), z: Z(-3.4), y: UY, stand: { x: X(-3.75), z: Z(-3.4), yaw: -Math.PI / 2 }, eye: { x: X(-HW) - 0.3, y: UY + 0.6 + 1.0, z: Z(-3.4) }, base: -Math.PI / 2 },
    glassU, glassReal, glassMeshes, realWindows: REALW, // realWindows: each real window's hole, world, for the tests
    root, ext, inside, door, doorCol, glassIn, glassLit, glassDark, plaque, card, cardOpen, gameOn, gameOff, chairs, spots, rooms, walls, lamps: INDOOR.splice(0), mazeDoor, hearths, hearthEmbers, candles,
    model: !!M, replacedTris: NOPE.tris, seasonMeshes, // (lovecraft-setpiece: the set piece loaded; what the code would have built; the wreath and the pumpkins, shown in their season)
    plan: { HX, HZ, TY, FY, UY, EAVE, HW, HD, IU, IV, BV, PU, ST, DOOR, PORCH, TABLE: { x: TX, z: TZ, y: TT, r: TABLE.r }, topY, lot,
      box: { minX: X(-HW), maxX: X(HW), minZ: Z(-HD), maxZ: Z(HD) }, boxBay: { minX: X(-HW - BAY.out), maxX: X(HW), minZ: Z(-HD), maxZ: Z(HD) }, inner: { minX: X(-IU), maxX: X(IU), minZ: Z(-IV), maxZ: Z(IV) },
      door: { x: X(DOOR.u), z: Z(HD), w: DOOR.w }, stairTop: { x: X((ST.u0 + ST.u1) / 2), z: Z((ST.vTop + BV) / 2) }, gate: { x: gx, z: lot.maxZ } },
  };
}

// a wall sconce on a face frame: a brass back plate, an arm and a frosted glass shade (a gas flame)
function sconce(n, f, a, y) {
  fbox(n, f, a, y, 0.03, 0.12, 0.22, 0.04, '#c9a24a');
  fbox(n, f, a, y + 0.02, 0.12, 0.04, 0.04, 0.18, '#c9a24a');
  fadd(n, f, GEO.cone8, lampGlow('#ffc766'), a, y + 0.12, 0.2, { sx: 0.09, sy: 0.16, sz: 0.09, rx: Math.PI });
}
// rows of book spines on shelves along x = x0 (facing +x or -x), from z0 to z1, `rows` shelves `step` apart from y0
function books(n, x0, z0, z1, y0, rows, step, facing, seed) {
  const rnd = mulberry32(seed), SPINE = ['#7a2140', '#2f5a3f', '#3a4566', '#8a5a2a', '#5e1a28', '#2b3a4e', '#6b4a2b', '#d9b25a', '#4a2c1c', '#355446'];
  const s = facing === 'x+' ? 1 : -1, zMin = Math.min(z0, z1), zMax = Math.max(z0, z1);
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * step;
    n.add(GEO.box, '#3b2418', { x: x0 - s * 0.18, y: y - 0.02, z: (zMin + zMax) / 2, sx: 0.36, sy: 0.04, sz: zMax - zMin });
    let z = zMin + 0.02;
    while (z < zMax - 0.1) {
      const w = 0.1 + rnd() * 0.18, h = step * (0.62 + rnd() * 0.28), lean = rnd() < 0.08 ? 0.18 : 0;
      if (z + w > zMax) break;
      n.add(GEO.box, SPINE[Math.floor(rnd() * SPINE.length)], { x: x0 - s * 0.15, y: y + h / 2, z: z + w / 2, sx: 0.26, sy: h, sz: w, rx: lean });
      for (let k = 0.04; k < w - 0.02; k += 0.045) n.add(GEO.box, '#1c140f', { x: x0 - s * 0.017, y: y + h / 2, z: z + k, sx: 0.006, sy: h * 0.96, sz: 0.004 }); // the cracks between the books in a cluster
      z += w + 0.01;
    }
  }
}
