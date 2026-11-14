// Trees. Every tree is built from one plan so the pieces cannot drift apart:
//   - the trunk is tapered, flares at the foot, is sunk below the ground (slopes never show a gap) and always runs
//     up into the canopy (its top is well above the lowest canopy surface at the trunk axis);
//   - every canopy lobe has its centre inside the main lobe, so nothing can float off to the side.
// world.js uses addTree() for the yard and the street and buildForest() for the woods. audit*() proves the numbers.
import * as THREE from 'three';
import { GEO } from './batch.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { toon, soft } from './toon.js';
import { canopyMaterial, canopyDepthMaterial } from './weather-cover.js';
import { terrainHeight, coastSigned } from './terrain.js';
import { MAP, WOODS_X, WALK, WOODS_WEST, WOODS_SOUTH, WOODS_WALL, GLADE, BUS_TUNNEL } from './layout.js';
import { mulberry32, pointInPoly } from './util.js';
import { view } from './perf-flags.js';

export const LEAF = {
  summer: ['#5daa45', '#4f9a3e', '#6cb84c', '#58a348'],
  autumn: ['#e8893a', '#d9602f', '#f0b33f', '#c9472d'],
  woodAutumn: ['#e8893a', '#e39a3a', '#f0b33f', '#d9602f'], // no deep red out in the pines: a lone red lobe reads as a balloon
  birch: ['#b8d45a', '#c9dc62', '#a8cc50'],
  pine: ['#2f7a4a', '#2a6d43', '#377f4d', '#256240'],
  fir: ['#245e43', '#1f563f', '#2a6649', '#1c4f3a'],                        // the spruces, bluer and darker than the pines
  woodFall: ['#e8893a', '#e39a3a', '#f0b33f', '#d9602f', '#c9472d', '#e0a43c'], // the woods' oaks and maples in October
  birchAutumn: ['#ecc94a', '#f2d65c', '#dcb53a', '#e6cf58', '#c8cf5a'],      // golden birches, one or two still turning
};
const BARK = '#7a5234', BARK_DARK = '#6f4a2f';

// ------------------------------------------------------------------ shared geometry (built once, reused)

// Trunk: lathe profile [radius, y] from the buried foot to the top. The foot flares out, then tapers.
function trunkGeo(top, r, sink = 0.9, segs = 8, taper = 0.62, open = false) {
  // few rings on purpose: 1500 wood trees share this. Buried foot, flare at the ground, taper to the top.
  const prof = [[r * 1.3, -sink], [r * 1.42, 0], [r * 1.02, top * 0.16], [r * taper, top], [0, top]]; // no cap at the buried foot
  if (open) prof.pop(); // (the woods' trunks end open inside the canopy, nobody sees the top)
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  g.computeBoundingSphere();
  return g;
}
const TRUNK = {
  forest: trunkGeo(4.4, 0.3, 1.0, 6, 0.74, true), // shared by every brown wood trunk (instanced), scaled by the tree's size
  oak: trunkGeo(3.9, 0.36),
  maple: trunkGeo(3.6, 0.3),
  birch: trunkGeo(5.1, 0.19, 0.7, 6),
  pine: trunkGeo(3.9, 0.26, 0.9, 7),
};

// A lumpy leaf ball: an icosphere with a little radial noise, so silhouettes are not perfect circles. The normals stay
// radial (smooth cel bands); only the outline gets character. Three variants.
export const LUMP = [1, 2, 3].map(seed => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, rnd = mulberry32(seed * 77);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) { // the same corner gets the same push wherever it is used
    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!seen.has(key)) seen.set(key, 0.9 + rnd() * 0.2);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * (p.getY(i) < 0 ? 0.92 : 1), p.getZ(i) * k);
  }
  g.computeBoundingSphere();
  return g;
});

// A pine tier: a cone (base at y = 0, apex at y = 1, radius 1) with an irregular skirt, flat-shaded.
function pineTierGeo(seed, segs = 7, capped = true) {
  let g = new THREE.ConeGeometry(1, 1, segs, 1, !capped);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position, rnd = mulberry32(seed);
  const rad = [], lift = [];
  for (let i = 0; i < segs; i++) { rad.push(0.86 + rnd() * 0.24); lift.push((rnd() - 0.3) * 0.09); }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    if (y > 0.01 || Math.hypot(x, z) < 0.5) continue; // apex and cap centre stay put
    const idx = Math.round((((Math.atan2(x, z) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * segs) % segs;
    p.setXYZ(i, x * rad[idx], y + lift[idx], z * rad[idx]);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
const TIER = [11, 23, 37].map(s => pineTierGeo(s));
const TIER_OPEN = [11, 23, 37].map(s => pineTierGeo(s, 7, false)); // upper tiers: their underside sits inside the tier below

// A palm frond: a folded, drooping leaf blade lying along +x from the crown. Double sided.
const FROND = (() => {
  const rows = [0, 0.22, 0.5, 0.78, 1], pos = [], idx = [];
  rows.forEach((t, i) => {
    const w = 0.5 * Math.pow(Math.sin(Math.PI * Math.min(0.999, t * 0.96 + 0.02)), 0.75) * 0.55;
    const droop = -t * t * 0.55;
    pos.push(t, droop, -w, t, droop + 0.05, 0, t, droop, w); // left edge, midrib (a bit higher), right edge
    if (i > 0) { const a = (i - 1) * 3, b = i * 3; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
})();

// ------------------------------------------------------------------ plans (pure data, local units, ground at y = 0)

// Broadleaf canopies: [x, y, z, rx, ry, rz]; lobe 0 is the main lobe; every other centre must lie inside it.
const BROAD = {
  oak: { trunk: 'oak', top: 3.9, main: [0, 4.35, 0, 2.1, 1.75, 2.1], ring: 4, dist: [1.25, 1.55], r: [1.25, 1.55], up: 1.25, lift: [-0.5, 0.2] },
  maple: { trunk: 'maple', top: 3.6, main: [0, 3.95, 0, 1.75, 1.6, 1.75], ring: 4, dist: [1.05, 1.35], r: [1.1, 1.4], up: 1.15, lift: [-0.45, 0.25] },
  birch: { trunk: 'birch', top: 5.1, main: [0, 5.2, 0, 1.15, 1.55, 1.15], ring: 3, dist: [0.7, 0.95], r: [0.8, 1.0], up: 1.35, lift: [-0.8, 0.5] },
};

function broadPlan(kind, s, rnd) {
  const P = BROAD[kind] || BROAD.oak, lobes = []; // an unknown kind falls back to an oak
  const [mx, my, mz, rx, ry, rz] = P.main;
  lobes.push({ x: mx, y: my, z: mz, rx, ry, rz });
  const a0 = rnd() * 6.28;
  for (let i = 0; i < P.ring; i++) {
    const a = a0 + (i / P.ring) * 6.28 + (rnd() - 0.5) * 0.6;
    const d = P.dist[0] + rnd() * (P.dist[1] - P.dist[0]), r = P.r[0] + rnd() * (P.r[1] - P.r[0]);
    lobes.push({ x: Math.cos(a) * d, y: my + P.lift[0] + rnd() * (P.lift[1] - P.lift[0]), z: Math.sin(a) * d, rx: r, ry: r * 0.86, rz: r });
  }
  lobes.push({ x: (rnd() - 0.5) * 0.6, y: my + P.up, z: (rnd() - 0.5) * 0.6, rx: rx * 0.62, ry: ry * 0.58, rz: rz * 0.62 }); // crown
  return { kind, trunk: P.trunk, top: P.top, lobes };
}

// Wood canopies as fixed lobe sets (instanced, so they are geometry, not plans).
const WOOD_BLOB = [
  [[0, 3.9, 0, 2.0, 1.65, 2.0], [1.35, 3.5, 0.5, 1.35, 1.15, 1.35], [-1.2, 3.65, -0.7, 1.45, 1.2, 1.45], [0.2, 3.4, -1.5, 1.2, 1.0, 1.2], [-0.4, 4.9, 0.5, 1.25, 1.0, 1.25]],
  [[0, 4.0, 0, 1.8, 1.9, 1.8], [1.1, 3.4, 0.3, 1.25, 1.1, 1.25], [-1.0, 3.5, -0.5, 1.3, 1.1, 1.3], [0.1, 5.4, 0, 1.2, 1.0, 1.2], [0.3, 3.2, -1.1, 1.1, 0.9, 1.1]],
];
// Pine tiers: [base y, radius, height, tier variant]
const WOOD_PINE = [
  [[1.8, 2.35, 2.5, 0], [3.05, 1.95, 2.3, 1], [4.3, 1.5, 2.1, 2], [5.5, 1.0, 1.9, 0]],
  [[1.6, 2.7, 2.6, 1], [2.9, 2.1, 2.3, 2], [4.1, 1.4, 2.2, 0]],
];

// ------------------------------------------------------------------ placing (records what it places so it can be audited)

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export const TREE_LOG = []; // { kind, x, z, parts: [{ role, geo, matrix }] } for every hand-placed tree

function put(b, parts, role, geo, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
  const matrix = new THREE.Matrix4().compose(_p, _q, _s);
  b.add(geo, mat, { matrix });
  parts.push({ role, geo, matrix });
}

// A limb from p0 to p1 with a taper (geometry radius 1 at the base, r1/r0 at the top).
const LIMB = new THREE.CylinderGeometry(0.62, 1, 1, 6);
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
export function limb(b, mat, p0, p1, r0, parts = null) {
  _d.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = _d.length();
  _q.setFromUnitVectors(_up, _d.normalize());
  _p.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  _s.set(r0, len, r0);
  const matrix = new THREE.Matrix4().compose(_p, _q, _s);
  b.add(LIMB, mat, { matrix });
  parts?.push({ role: 'limb', geo: LIMB, matrix });
}

function addBroadleaf(b, x, y, z, kind, s, rnd, parts, leaves = null) {
  const birch = kind === 'birch';
  const plan = broadPlan(kind, s, rnd);
  const trunkCol = birch ? '#efece4' : BARK;
  put(b, parts, 'trunk', TRUNK[plan.trunk], trunkCol, x, y, z, s, s, s, rnd() * 6);
  if (birch) {
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4, yy = y + (0.7 + i * 0.55) * s, r = (0.19 * (1 - 0.3 * i / 6)) * s;
      b.add(GEO.box, '#3b3b3b', { x: x + Math.cos(a) * r * 0.95, y: yy, z: z + Math.sin(a) * r * 0.95, sx: 0.13 * s, sy: 0.05 * s, sz: 0.1 * s, ry: -a });
    }
  }
  const pal = leaves || (kind === 'maple' ? LEAF.autumn : birch ? LEAF.birch : LEAF.summer);
  const c0 = Math.floor(rnd() * pal.length);
  plan.lobes.forEach((l, i) => {
    const col = pal[(c0 + i) % pal.length];
    put(b, parts, 'canopy', LUMP[i % 3], col, x + l.x * s, y + l.y * s, z + l.z * s, l.rx * s, l.ry * s, l.rz * s, rnd() * 6);
  });
  if (!birch) { // two limbs reach from the trunk top into the low side lobes, so the underside reads as a real tree
    const low = plan.lobes.slice(1, -1).sort((a, c) => a.y - c.y).slice(0, 2);
    for (const l of low) limb(b, trunkCol, [x, y + plan.top * 0.78 * s, z], [x + l.x * s * 0.85, y + (l.y - 0.2) * s, z + l.z * s * 0.85], 0.16 * s, parts);
  }
  return plan;
}

function addPine(b, x, y, z, s, rnd, parts) {
  put(b, parts, 'trunk', TRUNK.pine, BARK_DARK, x, y, z, s, s, s, rnd() * 6);
  const col = LEAF.pine[Math.floor(rnd() * LEAF.pine.length)];
  const tiers = 4, base = 1.75 + rnd() * 0.2;
  let yy = base;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.22, r = (2.35 * k) * (0.92 + rnd() * 0.16), h = (2.5 - i * 0.18) * (0.94 + rnd() * 0.12);
    put(b, parts, 'canopy', (i ? TIER_OPEN : TIER)[Math.floor(rnd() * 3)], col, x + (rnd() - 0.5) * 0.16 * s, y + yy * s, z + (rnd() - 0.5) * 0.16 * s, r * s, h * s, r * s, rnd() * 6);
    yy += h * 0.52;
  }
}

function addPalm(b, x, y, z, s, rnd, parts) {
  const lean0 = (rnd() > 0.5 ? 1 : -1) * (0.05 + rnd() * 0.05), rot = rnd() * 6;
  let px = x, py = y - 0.4 * s, pz = z, lean = 0;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    lean += lean0;
    const len = 1.05 * s, r = (0.27 - i * 0.02) * s;
    const nx = px + Math.sin(lean) * len * Math.cos(rot), ny = py + Math.cos(lean) * len, nz = pz + Math.sin(lean) * len * Math.sin(rot);
    limb(b, i % 2 ? '#a57a4a' : '#8f683f', [px, py, pz], [nx, ny + 0.06 * s, nz], r, parts);
    px = nx; py = ny; pz = nz;
  }
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rot;
    const len = (2.5 + (i % 2) * 0.4) * s;
    put(b, parts, 'canopy', FROND, toon(i % 2 ? '#4fae4a' : '#5cbb52', { side: 'double' }), px, py - 0.05 * s, pz, len, len * 0.9, len * 1.0, -a, 0, 0.42 - (i % 2) * 0.22);
  }
  parts.crown = { trunkEnd: [px, py + 0.06 * s, pz], hub: [px, py - 0.05 * s, pz], r: 0.17 * s };
  put(b, parts, 'canopy', GEO.sphere, '#6b4a2b', px, py - 0.22 * s, pz, 0.34 * s, 0.3 * s, 0.34 * s, 0);
  for (let i = 0; i < 3; i++) put(b, parts, 'canopy', GEO.sphere, '#5a3d22', px + Math.cos(i * 2.1) * 0.24 * s, py - 0.42 * s, pz + Math.sin(i * 2.1) * 0.24 * s, 0.14 * s, 0.14 * s, 0.14 * s);
}

// A single, hand-placed tree into a batcher. Returns its trunk radius for collision. opts.y: the ground it stands on when that is not the
// terrain (a raised lot: the Lovecraft house's terrace); opts.leaves: a broadleaf's leaf palette (a LEAF entry) instead of its kind's.
export function addTree(b, x, z, kind, rnd, scale = 1, opts = {}) {
  const y = (opts.y ?? terrainHeight(x, z)) - 0.05;
  const s = scale * (0.9 + rnd() * 0.3);
  const parts = [];
  let r;
  if (kind === 'pine') { addPine(b, x, y, z, s, rnd, parts); r = 0.35 * s; }
  else if (kind === 'palm') { addPalm(b, x, y, z, s, rnd, parts); r = 0.35; }
  else { addBroadleaf(b, x, y, z, kind, s, rnd, parts, opts.leaves); r = (kind === 'birch' ? 0.2 : 0.34) * s + 0.1; }
  TREE_LOG.push({ kind, x, z, y, s, parts, crown: parts.crown });
  return r;
}

// The old swing tree is built by swing-tree.js as one piece (trunk, limb and crown), with LUMP leaf balls from here.

// ------------------------------------------------------------------ the woods

// Merge canopy pieces into one geometry, each piece carrying a brightness (vertex colour) so a tree has light and dark
// lobes / tiers instead of one flat colour. The instance colour (leaf hue) multiplies on top.
function mergeParts(parts) {
  const geos = parts.map(({ geo, matrix, shade }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    g.applyMatrix4(matrix);
    const c = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = shade; c[i + 1] = shade; c[i + 2] = shade * 0.97; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}
const LOBE_SHADE = [1.0, 0.9, 1.06, 0.86, 1.14, 0.95];
function mergeLobes(lobes) {
  return mergeParts(lobes.map((l, i) => ({
    geo: LUMP[i % 3], shade: LOBE_SHADE[i % 6] * (i > 0 && l[1] < lobes[0][1] - 0.3 ? 0.92 : 1), // low side lobes sit in shade
    matrix: new THREE.Matrix4().compose(new THREE.Vector3(l[0], l[1], l[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3), new THREE.Vector3(l[3], l[4], l[5])),
  })));
}
const TIER_SHADE = [0.84, 0.93, 1.0, 1.09];
function mergeTiers(tiers) {
  return mergeParts(tiers.map(([y0, r, h, v], i) => ({
    geo: (i ? TIER_OPEN : TIER)[v], shade: tiers.length <= 4 ? TIER_SHADE[i] : 0.82 + (0.3 * i) / (tiers.length - 1), // (a fir's six tiers: the same dark-to-light run)
    matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, y0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.9), new THREE.Vector3(r, h, r)),
  })));
}

// The woods: four kinds of tree and a little undergrowth. Every wood tree is instanced:
//   canopies  forest-pine, forest-fir (tall narrow spruces), forest-blob (oaks and maples, mostly in their October colours),
//             forest-birch (golden crowns): the trees within LOD_NEAR m of the camera; every other tree is in forest-far-pine or
//             forest-far-blob (a few dozen triangles each, a stub of trunk inside the same mesh), the view past the map for good.
//             forest-cast-<kind> (hidden) hold every tree of a kind at full detail for the shadow passes only;
//   trunks    forest-trunk (every brown trunk) and forest-trunk-birch (white with dark marks), every tree in or by the map.
// Three kinds of tree spot:
//   1. walkable woods inside the map (Strickler woods west of WOODS_X, out to WOODS_WEST and down to WOODS_SOUTH): sparse near the
//      park, denser and denser to the west, a wall-thick band along the woods' edges. Solid (a circle collider each) but always
//      room to walk between them.
//   2. the tree wall just outside the woods' edges (WOODS_WALL in layout.js: west, south-west, the corner by the shops, the town's
//      west edge and the foot of the north range): so thick you cannot see a way through. The map edge stops you there anyway.
//   3. scattered woods further out (the mountainsides, the far shores of the lakes) for the view; past 28 m from the map they are
//      the cheap far kinds.
// Undergrowth (ferns, fallen logs, rocks, mushrooms) in the walkable woods is merged per 48 m cell and drawn only near the camera.
// `isClear(x, z, pad)` keeps trees off trails, plazas, roads, lots and clearings (main.js builds it). Returns
// { spots, colliders, kinds, lod, under, update(camera) }.
const FOREST_CAP = 3500;   // walkable trees
const LOD_NEAR = 80, LOD_STEP = 8; // full-detail crowns within 80 m of the camera (90 once near), sorted again every 8 m it moves
// store-perf (2026-11-08): the woods in cells. Every crown kind is also cut into FOREST_CELL m squares (one InstancedMesh per
// kind per cell, the same names), each with bounds round the trees it can hold, so frustum culling and the game store's window
// cull (game-store-cull.js) drop the cells out of view. Each frame a kind draws either its whole mesh (one call) or its cells,
// whichever is cheaper: the cells only when those in view leave out over CELL_TRIS triangles per extra draw call (while an
// indoor cull is on, perf-flags view.indoorCull, a cell is in view only if one of its openings shows it too). The trunks stay one mesh a kind.
export const FOREST_CELL = 64, CELL_TRIS = 20000;
export function buildForest(parent, isClear = () => true) {
  const rnd = mulberry32(3);
  const spots = [], colliders = [];
  const grid = new Map(); // 8 m buckets so the spacing test stays cheap with thousands of trees
  const key = (x, z) => Math.floor(x / 8) + ',' + Math.floor(z / 8);
  const tooClose = (x, z, gap) => {
    const gx = Math.floor(x / 8), gz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const s of grid.get((gx + i) + ',' + (gz + j)) || []) if ((s.x - x) ** 2 + (s.z - z) ** 2 < gap * gap) return true;
    }
    return false;
  };
  const tryAdd = (x, z, gap, solid) => {
    const h = terrainHeight(x, z);
    if (h < 0.3 || coastSigned(x, z) > -2.5) return false;
    if (tooClose(x, z, gap)) return false;
    const s = { x, z, h, solid };
    spots.push(s);
    const k = key(x, z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(s);
    return s;
  };
  const inWalk = (x, z) => pointInPoly(x, z, WALK);
  const edgeD = (x, z) => { let d = Infinity; for (const [ax, az, bx, bz] of WOODS_WALL) d = Math.min(d, segDist(x, z, ax, az, bx, bz)); return d; };

  // 1. walkable woods: the gap between trunks shrinks from ~9 m at the park to ~2.7 m from x -192 west (still wider than a
  //    person with room to spare), the last 6 m inside an edge thicker still, and a few park trees stand further east.
  const X0 = WOODS_WEST + 1, X1 = WOODS_X + 30, Z0 = -96, Z1 = WOODS_SOUTH - 1;
  let walkable = 0;
  for (let i = 0; i < 167000 && walkable < FOREST_CAP; i++) { // (enough tries for the density over the whole woods)
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    const t = Math.min(1, Math.max(0, (X1 - x) / (X1 + 192))); // 0 at the park, 1 from x -192 on
    if (x > WOODS_X && rnd() > 0.12) continue; // the open park: only the odd tree
    if (!inWalk(x, z)) continue;
    const gap = edgeD(x, z) < 6 ? 2.1 : 9 - t * 6.3; // (the band along an edge: tight at 2.1, and no tighter, since every tree there is a collider every frame walks)
    if (!isClear(x, z, 1.6)) continue;
    if (tryAdd(x, z, gap, true)) walkable++;
  }
  // 2. the wall: rows of trees just outside the woods' edges and along the foot of the north range
  for (const [ax, az, bx, bz, nx, nz] of WOODS_WALL) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let d = -4; d < len + 4; d += 1.7) {
      for (let row = 0; row < 4; row++) {
        const off = 1.2 + row * 2.1 + rnd() * 1.1;
        const x = ax + ux * d + nx * off + (rnd() - 0.5), z = az + uz * d + nz * off + (rnd() - 0.5);
        if (!inWalk(x, z)) { const s = tryAdd(x, z, 1.45, false); if (s) s.row = row; }
      }
    }
  }
  // 3. the view: mountainsides west and north, and the far shores east and south
  for (let i = 0; i < 16000 && spots.length < walkable + 2600; i++) {
    const x = -390 + rnd() * 660, z = -330 + rnd() * 560;
    if (inWalk(x, z)) continue;
    const far = x < WOODS_WEST || z < MAP.minZ || x > 200 || z > 175 || (x < -146 && z > WOODS_SOUTH) || (x < -192 && z < -96);
    if (!far) continue;
    if (terrainHeight(x, z) > 24 && rnd() < 0.7) continue; // the high slopes thin out to bare rock
    tryAdd(x, z, 3.2, false);
  }

  // which kind each spot is: the deep woods mix pines and firs with oaks, maples and birches; the wall is mostly evergreen, its
  // outer two rows (behind the first two) and the view past 28 m from the map the cheap far kinds for good
  const pick = s => {
    const r = rnd();
    if (s.farOnly) return (s.x < -140 || s.z < MAP.minZ || s.row !== undefined) && r < 0.86 ? 'far-pine' : r < 0.3 ? 'far-pine' : 'far-blob';
    const park = s.x > WOODS_X, wall = !s.solid;
    const W = park ? [0.32, 0.08, 0.4, 0.2] : wall ? [0.55, 0.37, 0.06, 0.02] : s.x < -150 ? [0.38, 0.26, 0.2, 0.16] : [0.34, 0.16, 0.32, 0.18]; // [pine, fir, oak / maple, birch]
    return r < W[0] ? 'pine' : r < W[0] + W[1] ? 'fir' : r < W[0] + W[1] + W[2] ? 'blob' : 'birch';
  };
  for (const s of spots) { s.farOnly = !s.solid && (s.row >= 2 || distToPoly(s.x, s.z, WALK) > 28); s.kind = pick(s); }
  // none on the hill the bus tunnel bores through, nor in front of its portal: those spots stay in the list (the same random
  // draws, so every other tree keeps its place and look) but are drawn at zero size
  const H = BUS_TUNNEL && BUS_TUNNEL.hill;
  if (H) for (const s of spots) if (!s.solid && (((s.x - H.x) / (H.rx + 2)) ** 2 + ((s.z - H.z) / (H.rz + 2)) ** 2 < 1 || (s.x > BUS_TUNNEL.x - 12 && Math.abs(s.z - H.z) < 16))) s.gone = true;
  const NEAR = { pine: { geo: mergeTiers(WOOD_PINE[0]), far: 'far-pine', fs: [1, 1], trunk: 'brown', girth: 0.9 },
    fir: { geo: mergeTiers(WOOD_FIR), far: 'far-pine', fs: [0.72, 1.18], trunk: 'brown', girth: 0.72 },
    blob: { geo: mergeLobes(WOOD_BLOB[0]), far: 'far-blob', fs: [1, 1], trunk: 'brown', girth: 1.2 },
    birch: { geo: mergeLobes(WOOD_BIRCH), far: 'far-blob', fs: [0.6, 1.28], trunk: 'birch', girth: 1 } };
  const FAR = { 'far-pine': farPineGeo(), 'far-blob': farBlobGeo() };
  const N = spots.length, nearM = new Float32Array(N * 16), farM = new Float32Array(N * 16), cols = new Float32Array(N * 3);
  const m = new THREE.Matrix4(), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color(), bark = new THREE.Color();
  const trunks = [], birchTrunks = [];
  spots.forEach((s, i) => {
    const kind = s.kind, k = NEAR[kind];
    // the deep woods vary a lot: saplings next to giants, so the eye cannot read the spacing (and the scouts hide better)
    const deep = s.solid ? Math.min(1, Math.max(0, (WOODS_X - s.x) / (WOODS_X + 192))) : (s.x < -192 ? 1 : 0);
    let sc = 0.6 + rnd() * 1.05 + (s.x < -150 ? 0.3 : 0) + deep * (rnd() * 0.9 - 0.3); // wide spread everywhere, wider still deep in
    // taller trees, rising gradually and randomly the further into the woods you go: the crowns stretch taller with `deep` (0 at
    // the park, 1 from x -192 west), and in the walkable woods each crown is lifted on a bare trunk that grows with the depth too
    // (under a metre or so by the park, 1.5-5 m deep in; a sapling less, a giant more), so deep in the woods you see between the
    // trunks under the canopy instead of into a wall of leaves at eye level. The wall and the view keep their crowns to the ground.
    let sy = sc * (1.0 + rnd() * 0.3 + deep * (0.35 + rnd() * 0.5));
    if (kind === 'fir') sy *= 1.12 + rnd() * 0.3;                         // spruces stand tall and narrow
    if (kind === 'birch') { sc *= 0.78; sy = sc * (1.1 + rnd() * 0.3 + deep * (0.3 + rnd() * 0.4)); } // birches are slender
    const lift = s.solid ? (0.4 + rnd() * 1.0 + deep * (1.2 + rnd() * 2.4)) * (0.55 + 0.45 * sc) : 0;
    q.setFromAxisAngle(yAxis, rnd() * Math.PI * 2);
    pv.set(s.x, s.h - 0.15 + lift, s.z);
    s.sc = sc; s.sy = sy; s.lift = lift;
    const k0 = s.gone ? 0 : 1;
    m.compose(pv, q, sv.set(sc * k0, sy * k0, sc * k0)); m.toArray(nearM, i * 16);
    const fs = k ? k.fs : [1, 1];
    m.compose(pv, q, sv.set(sc * fs[0] * k0, sy * fs[1] * k0, sc * fs[0] * k0)); m.toArray(farM, i * 16);
    if (k) {
      // the trunk gets the same position and spin; its height scale stretches by the lift so its open top still ends inside the
      // crown (TRUNK.forest's top is at 4.4, the birch's at 5.9); only its girth differs (broadleaf trunks are stouter)
      const girth = sc * k.girth, syT = sy + lift / (k.trunk === 'birch' ? 5.9 : 4.4);
      pv.y -= lift;
      mt.compose(pv, q, sv.set(girth * k0, syT * k0, girth * k0));
      if (k.trunk === 'birch') birchTrunks.push([mt.clone(), bark.set('#ffffff').offsetHSL(0, 0, -rnd() * 0.06).clone()]);
      else trunks.push([mt.clone(), bark.set('#8a5a3a').offsetHSL(0, 0, (rnd() - 0.5) * 0.08).clone()]);
      if (s.solid) colliders.push({ type: 'circle', x: s.x, z: s.z, r: (k.trunk === 'birch' ? 0.22 : 0.34) * girth + 0.12, tree: true });
    }
    const pal = kind === 'pine' || kind === 'far-pine' ? LEAF.pine : kind === 'fir' ? LEAF.fir : kind === 'birch' ? LEAF.birchAutumn : rnd() < 0.68 ? LEAF.woodFall : LEAF.summer;
    col.set(pal[Math.floor(rnd() * pal.length)]).offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.06);
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  });
  const instanced = (geo, mat, list, name) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach(([mm, c], j) => { im.setMatrixAt(j, mm); im.setColorAt(j, c); });
    im.count = list.length; im.name = name;
    return im;
  };
  // the cells: spot i lies in cellOf(i)
  const cellOf = i => Math.floor(spots[i].x / FOREST_CELL) + ',' + Math.floor(spots[i].z / FOREST_CELL);
  const groupBy = (list, keyOf) => { const g = new Map(); for (const e of list) { const k = keyOf(e); let a = g.get(k); if (!a) g.set(k, a = []); a.push(e); } return g; };
  const fixBounds = im => { im.boundingBox = null; im.boundingSphere = null; im.computeBoundingBox(); im.computeBoundingSphere(); }; // (over im.count instances)
  const all = [];
  // trunks: one mesh each kind, as before (they cast, and shadows.js keeps a caster's cut: never shown and hidden by turns; in
  // cells they cost more draw calls outdoors than they saved, and next to nothing at the store)
  const trunk = instanced(TRUNK.forest, toon('#ffffff'), trunks, 'forest-trunk');
  const birchTrunk = instanced(BIRCH_TRUNK, toon('#ffffff', { vertexColors: true }), birchTrunks, 'forest-trunk-birch');
  for (const im of [trunk, birchTrunk]) { im.castShadow = true; im.receiveShadow = true; all.push(im); }
  // Shadow casters: each near kind with every one of its trees, full detail, never drawn by the camera (shadow layer). shadows.js
  // cuts them into 48 m cells for the shadow passes, so a tree's shadow is its whole crown however far away it's drawn in its
  // far kind.
  const byKind = {};
  spots.forEach((s, i) => { (byKind[s.kind] ||= []).push(i); });
  const pm = new THREE.Matrix4();
  for (const [kind, k] of Object.entries(NEAR)) {
    const idx = byKind[kind] || [];
    const im = new THREE.InstancedMesh(k.geo, canopyMaterial(), Math.max(1, idx.length));
    idx.forEach((i, j) => im.setMatrixAt(j, pm.fromArray(nearM, i * 16)));
    im.count = idx.length; im.name = 'forest-cast-' + kind;
    im.customDepthMaterial = canopyDepthMaterial(); // sways in the wind (weather-cover.js)
    im.castShadow = true; im.receiveShadow = false;
    im.layers.set(7); // (shadows.js LAYER_SHADOW: only the shadow passes see it, never the camera; shadows.js imports world.js, so the number)
    all.push(im);
  }
  // What you see: per kind, the trees within LOD_NEAR m of the camera at full detail, the rest in the far kinds (a third of the
  // triangles or less), sorted again whenever the camera has moved LOD_STEP m. The view past the map is far for good (first in
  // the far meshes' lists). Each kind is held twice: one whole mesh (bounds round the whole woods, one draw) and the same trees
  // in FOREST_CELL squares (bounds round what each cell can hold). chooseDraw() shows one or the other each frame (see the top).
  const NEAR_NAMES = Object.keys(NEAR), FAR_NAMES = Object.keys(FAR);
  const lod = {}; // kind -> { whole, cells: [{ key, im, list (spot indices), fixed, far }], fixed, tris, cellsOn }
  const crown = (geo, cap, name) => {
    const im = new THREE.InstancedMesh(geo, canopyMaterial(), Math.max(1, cap));
    im.name = name; im.castShadow = false; im.receiveShadow = true;
    im.setColorAt(0, col.set('#ffffff')); // (makes instanceColor)
    return im;
  };
  const put16 = (im, j, M, i) => im.instanceMatrix.array.set(M.subarray(i * 16, i * 16 + 16), j * 16);
  const put3 = (im, j, i) => im.instanceColor.array.set(cols.subarray(i * 3, i * 3 + 3), j * 3);
  const trisOf = geo => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  const bounds = new THREE.Box3(), _bp = new THREE.Vector3();
  for (const s of spots) bounds.expandByPoint(_bp.set(s.x, s.h, s.z));
  bounds.max.y += 30;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  for (const [kind, k] of Object.entries(NEAR)) {
    const list = byKind[kind] || [], whole = crown(k.geo, list.length, 'forest-' + kind), cells = [];
    for (const [key, part] of groupBy(list, cellOf)) {
      const im = crown(k.geo, part.length, 'forest-' + kind);
      part.forEach((i, j) => put16(im, j, nearM, i));
      im.count = part.length; fixBounds(im); im.count = 0;
      im.userData.forestCell = true; im.visible = false;
      cells.push({ key, im, list: part });
    }
    lod[kind] = { whole, cells, fixed: 0, tris: trisOf(k.geo), cellsOn: null };
  }
  for (const [kind, geo] of Object.entries(FAR)) {
    const fixedAll = byKind[kind] || [], feeders = NEAR_NAMES.filter(n => NEAR[n].far === kind);
    const fixedBy = groupBy(fixedAll, cellOf);
    const keys = new Set(fixedBy.keys());
    for (const n of feeders) for (const c of lod[n].cells) keys.add(c.key);
    const whole = crown(geo, fixedAll.length + feeders.reduce((a, n) => a + (byKind[n] || []).length, 0), 'forest-' + kind), cells = [];
    fixedAll.forEach((i, j) => { put16(whole, j, farM, i); put3(whole, j, i); });
    for (const key of keys) {
      const fixed = fixedBy.get(key) || [], more = [];
      for (const n of feeders) for (const c of lod[n].cells) if (c.key === key) more.push(...c.list);
      const im = crown(geo, fixed.length + more.length, 'forest-' + kind);
      fixed.forEach((i, j) => { put16(im, j, farM, i); put3(im, j, i); });
      more.forEach((i, j) => put16(im, fixed.length + j, farM, i));
      im.count = fixed.length + more.length; fixBounds(im); im.count = fixed.length;
      im.userData.forestCell = true; im.visible = false;
      const cell = { key, im, list: fixed, fixed: fixed.length };
      cells.push(cell);
      for (const n of feeders) for (const c of lod[n].cells) if (c.key === key) c.far = cell;
    }
    lod[kind] = { whole, cells, fixed: fixedAll.length, tris: trisOf(geo), cellsOn: null };
  }
  for (const name of [...NEAR_NAMES, ...FAR_NAMES]) {
    const L = lod[name];
    L.whole.boundingSphere = sphere.clone(); L.whole.boundingBox = bounds.clone();
    L.whole.userData.noFadeGhost = true; // (camera-fade ghosts the cells, which know where their trees are)
    all.push(L.whole);
    for (const c of L.cells) all.push(c.im);
  }
  const near = new Uint8Array(N), LOD_NAMES = Object.keys(lod);
  const copy = (im, j, M, i) => {
    const D = im.instanceMatrix.array, DC = im.instanceColor.array;
    for (let e = 0; e < 16; e++) D[j * 16 + e] = M[i * 16 + e];
    DC[j * 3] = cols[i * 3]; DC[j * 3 + 1] = cols[i * 3 + 1]; DC[j * 3 + 2] = cols[i * 3 + 2];
  };
  let lx = Infinity, lz = Infinity;
  function sortLod(cam) {
    const cx = cam.position.x, cz = cam.position.z;
    if ((cx - lx) ** 2 + (cz - lz) ** 2 < LOD_STEP * LOD_STEP) return false;
    lx = cx; lz = cz;
    for (const f of FAR_NAMES) { const L = lod[f]; L.whole.count = L.fixed; for (const c of L.cells) c.im.count = c.fixed; }
    for (const kind of NEAR_NAMES) {
      const W = lod[kind].whole, WF = lod[NEAR[kind].far].whole;
      let wn = 0;
      for (const L of lod[kind].cells) {
        const F = L.far.im;
        let n = 0;
        for (let t = 0; t < L.list.length; t++) { // (plain copies: no garbage)
          const i = L.list[t], s = spots[i], d2 = (s.x - cx) ** 2 + (s.z - cz) ** 2, r = near[i] ? LOD_NEAR + 10 : LOD_NEAR;
          near[i] = d2 < r * r ? 1 : 0;
          if (near[i] === 1) { copy(L.im, n++, nearM, i); copy(W, wn++, nearM, i); } // (the cell's copy and the whole mesh's)
          else { copy(F, F.count++, farM, i); copy(WF, WF.count++, farM, i); }
        }
        L.im.count = n;
      }
      W.count = wn;
    }
    for (const name of LOD_NAMES) {
      const L = lod[name];
      for (const im of [L.whole, ...L.cells.map(c => c.im)]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
      L.cellsOn = null; // (chooseDraw() decides again)
    }
    return true;
  }
  // Each frame, per kind: the whole mesh (one draw) or the cells in view, whichever is cheaper. A cell costs a draw call in the
  // colour pass and one in the ink's, so the cells are drawn only when those in view leave out more than CELL_TRIS triangles
  // for each extra call. While an indoor cull is on (game-store-cull.js) a cell is in view only if an opening shows it too.
  const frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _cs = new THREE.Sphere();
  function chooseDraw(cam) {
    const sees = view.indoorCull > 0 ? view.indoorSees : null;
    if (view.indoorCull > 0) view.indoorCull--;
    if (!cam.projectionMatrix) return;
    frustum.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const name of LOD_NAMES) {
      const L = lod[name];
      let k = 0, inView = 0;
      for (const c of L.cells) {
        if (c.im.count === 0) continue;
        _cs.copy(c.im.boundingSphere).applyMatrix4(c.im.matrixWorld);
        if (frustum.intersectsSphere(_cs) && (!sees || sees(_cs))) { k++; inView += c.im.count; }
      }
      const on = (L.whole.count - inView) * L.tris > Math.max(0, k - 1) * CELL_TRIS;
      if (on === L.cellsOn) continue;
      L.cellsOn = on;
      L.whole.visible = !on && L.whole.count > 0;
      for (const c of L.cells) c.im.visible = on && c.im.count > 0;
    }
  }
  sortLod({ position: { x: 0, z: -12 } });
  for (const im of all) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    if (!im.boundingSphere) im.computeBoundingSphere();
    parent.add(im);
  }
  const kinds = {};
  for (const s of spots) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  const under = buildUndergrowth(parent, spots, isClear, colliders);
  return { spots, colliders, kinds, lod, under: under.cells, update(cam) { if (!cam) return; sortLod(cam); chooseDraw(cam); under.update(cam); } };
}

// Fir (spruce) tiers: tall and narrow, six of them. [base y, radius, height, tier variant]
const WOOD_FIR = [[1.3, 1.75, 2.4, 0], [2.45, 1.5, 2.2, 1], [3.5, 1.27, 2.1, 2], [4.5, 1.02, 2.0, 0], [5.45, 0.78, 1.9, 1], [6.35, 0.52, 1.8, 2]];
// Birch crown: a narrow oval high on the trunk, four lumps (every centre inside the main lobe)
const WOOD_BIRCH = [[0, 5.5, 0, 1.2, 1.65, 1.2], [0.72, 5.0, 0.25, 0.85, 0.9, 0.85], [-0.68, 5.15, -0.35, 0.82, 0.95, 0.82], [0.08, 6.75, 0.1, 0.78, 0.82, 0.78]];

// The birch's trunk: white bark with dark marks (vertex colours; the instance colour multiplies on top, a touch of grey each)
const BIRCH_TRUNK = (() => {
  const g = trunkGeo(5.9, 0.21, 0.8, 6, 0.6, true).toNonIndexed();
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) { // per triangle: a dark band here and there up the stem, the foot greyer
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, a = Math.atan2(p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2), p.getX(i) + p.getX(i + 1) + p.getX(i + 2));
    const band = Math.sin(y * 5.3 + a * 1.7) > 0.72 || Math.sin(y * 3.1 - a * 2.3 + 1.4) > 0.86;
    const v = y < 0.25 ? 0.62 : band ? 0.24 : 0.97;
    for (let k = 0; k < 3; k++) c.set([v, v, v * 0.97], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
})();

// Far kinds for the view (outside the map, 28 m+ from it): two tiers or two lumps and a stub of trunk in one geometry (the stub is
// dark: the instance colour is the leaves'), a few dozen triangles where the near kinds have hundreds.
function farPineGeo() {
  const tier = s => pineTierGeo(s, 5);
  const stub = new THREE.CylinderGeometry(0.2, 0.3, 2.4, 4, 1, true).translate(0, 1.0, 0);
  return mergeParts([
    { geo: stub, shade: 0.42, matrix: new THREE.Matrix4() },
    { geo: tier(51), shade: 0.88, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, 1.6, 0), new THREE.Quaternion(), new THREE.Vector3(2.5, 3.4, 2.5)) },
    { geo: tier(67), shade: 1.04, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, 3.7, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6), new THREE.Vector3(1.65, 3.0, 1.65)) },
  ]);
}
function farBlobGeo() {
  const ico = new THREE.IcosahedronGeometry(1, 0), p = ico.attributes.position, r = mulberry32(91), seen = new Map();
  for (let i = 0; i < p.count; i++) { // a little lumpy, like the near crowns' LUMP, so it reads as leaves and not a gem
    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!seen.has(key)) seen.set(key, 0.86 + r() * 0.26);
    const k = seen.get(key); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  ico.computeVertexNormals();
  const stub = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 4, 1, true).translate(0, 1.5, 0);
  return mergeParts([
    { geo: stub, shade: 0.4, matrix: new THREE.Matrix4() },
    { geo: ico, shade: 0.95, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, 3.9, 0), new THREE.Quaternion(), new THREE.Vector3(2.0, 1.7, 2.0)) },
    { geo: ico, shade: 0.88, matrix: new THREE.Matrix4().compose(new THREE.Vector3(1.2, 3.5, 0.4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.9), new THREE.Vector3(1.35, 1.15, 1.35)) },
    { geo: ico, shade: 1.1, matrix: new THREE.Matrix4().compose(new THREE.Vector3(-0.4, 4.9, 0.3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7), new THREE.Vector3(1.3, 1.05, 1.3)) },
  ]);
}

function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
function distToPoly(x, z, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); }
  return d;
}

// ------------------------------------------------------------------ the undergrowth
// Ferns, fallen logs, mossy rocks and mushrooms on the walkable woods' floor. Merged per 48 m cell into one inked mesh, vertex
// coloured, no shadows cast, and a cell is drawn only while the camera is within UNDER_NEAR of it. Logs and the bigger rocks are
// solid (they join the colliders); nothing grows on a trail, a plaza, a clearing or within reach of a trunk. Its own random
// stream (mulberry32(31)), so the trees aren't moved by it.
const UNDER_CELL = 48, UNDER_NEAR = 46, UNDER_FAR = 52; // (m from the camera to what a cell holds)
const FERN = (() => { // six arching fronds, each a narrow folded blade with a dark root and a bright tip
  const pos = [], col = [], idx = [];
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * Math.PI * 2 + (f % 2) * 0.3, len = 0.62 + (f % 3) * 0.12, ca = Math.cos(a), sa = Math.sin(a);
    const base = pos.length / 3;
    const rows = [0, 0.3, 0.62, 1];
    rows.forEach((t, i) => {
      const r = t * len, y = 0.05 + Math.sin(t * Math.PI * 0.85) * 0.34 * len - t * t * 0.12, w = 0.11 * Math.sin(Math.PI * Math.min(0.97, t * 0.9 + 0.08));
      const c = 0.55 + t * 0.5;
      pos.push(ca * r - sa * w, y, sa * r + ca * w, ca * r, y + 0.03, sa * r, ca * r + sa * w, y, sa * r - ca * w);
      for (let k = 0; k < 3; k++) col.push(c * 0.82, c, c * 0.62);
      if (i > 0) { const p = base + (i - 1) * 3, q = base + i * 3; idx.push(p, q, p + 1, p + 1, q, q + 1, p + 1, q + 1, p + 2, p + 2, q + 1, q + 2); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
})();
function tinted(geo, color) { // a copy of geo, non-indexed, coloured `color` (times its own colours if it has any), only position / normal / color kept
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const own = g.attributes.color;
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) c.set(own ? [color.r * own.array[i], color.g * own.array[i + 1], color.b * own.array[i + 2]] : [color.r, color.g, color.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const LOG_GEO = new THREE.CylinderGeometry(1, 1, 1, 7, 1, false).rotateZ(Math.PI / 2); // along x
const LOG_END = new THREE.CircleGeometry(0.82, 7).rotateY(Math.PI / 2);                 // the cut end's paler wood
const ROCK_GEO = (() => { const g = new THREE.IcosahedronGeometry(1, 0); const p = g.attributes.position, r = mulberry32(17), seen = new Map(); for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(2) + p.getY(i).toFixed(2) + p.getZ(i).toFixed(2); if (!seen.has(k)) seen.set(k, 0.8 + r() * 0.35); const s = seen.get(k); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s); } g.computeVertexNormals(); return g; })();
const STEM = new THREE.CylinderGeometry(0.035, 0.05, 1, 5, 1, true).translate(0, 0.5, 0);
const CAP = new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);         // a dome
const UC = {
  bark: new THREE.Color('#6e4b31'), barkDark: new THREE.Color('#5b3d28'), wood: new THREE.Color('#d6b787'), moss: new THREE.Color('#6f8f3e'),
  rock: new THREE.Color('#8d918a'), rockDark: new THREE.Color('#787c76'), stem: new THREE.Color('#f1ead8'),
  caps: ['#c8432e', '#b5652e', '#d9a441', '#8a5a3a'].map(c => new THREE.Color(c)), fern: new THREE.Color('#5f9a3c'), fernFall: new THREE.Color('#b29a44'),
};
function buildUndergrowth(parent, spots, isClear, colliders) {
  const rnd = mulberry32(31);
  const cells = new Map(); // key -> { cx, cz, ferns: [], solid: [], meshes: [] }
  const cellOf = (x, z) => {
    const k = Math.floor(x / UNDER_CELL) + ',' + Math.floor(z / UNDER_CELL);
    let c = cells.get(k);
    if (!c) cells.set(k, c = { key: k, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, ferns: [], solid: [], meshes: [], near: false });
    c.minX = Math.min(c.minX, x - 3); c.maxX = Math.max(c.maxX, x + 3); c.minZ = Math.min(c.minZ, z - 3); c.maxZ = Math.max(c.maxZ, z + 3);
    return c;
  };
  // trunks to stay clear of (the walkable woods' and the wall's), bucketed
  const tb = new Map();
  for (const s of spots) { if (s.x > WOODS_X + 34) continue; const k = Math.floor(s.x / 6) + ',' + Math.floor(s.z / 6); (tb.get(k) || tb.set(k, []).get(k)).push(s); }
  const nearTrunk = (x, z, r) => { const gx = Math.floor(x / 6), gz = Math.floor(z / 6); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of tb.get((gx + i) + ',' + (gz + j)) || []) if ((s.x - x) ** 2 + (s.z - z) ** 2 < r * r) return true; return false; };
  const solid = [];
  const free = (x, z, r) => { for (const c of solid) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r) ** 2) return false; return true; };
  const ok = (x, z, pad) => pointInPoly(x, z, WALK) && x < WOODS_X - 2 && z > -95 && coastSigned(x, z) < -4 && isClear(x, z, pad); // (the woods only, not the park)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const place = (list, geo, color, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => {
    e.set(rx, ry, rz, 'YXZ'); q.setFromEuler(e); m.compose(pv.set(x, y, z), q, sv.set(sx, sy, sz));
    const g = tinted(geo, color); g.applyMatrix4(m); list.push(g);
  };
  const X0 = WOODS_WEST + 2, X1 = WOODS_X - 2, Z0 = -95, Z1 = WOODS_SOUTH - 2;
  const rand = () => [X0 + rnd() * (X1 - X0), Z0 + rnd() * (Z1 - Z0)];
  // fallen logs: solid, 2.6-5 m long, lying on the ground along their length
  for (let i = 0, n = 0; i < 3000 && n < 64; i++) {
    const [x, z] = rand(), len = 2.6 + rnd() * 2.4, r = 0.2 + rnd() * 0.14, a = rnd() * Math.PI;
    const ux = Math.cos(a), uz = -Math.sin(a), ends = [[x - ux * len / 2, z - uz * len / 2], [x + ux * len / 2, z + uz * len / 2]];
    if (!ok(x, z, len / 2 + 1.2) || !ends.every(([ex, ez]) => ok(ex, ez, 1.2) && !nearTrunk(ex, ez, 1.3)) || nearTrunk(x, z, 1.3) || !free(x, z, len / 2 + 1)) continue;
    const y = Math.min(terrainHeight(ends[0][0], ends[0][1]), terrainHeight(x, z), terrainHeight(ends[1][0], ends[1][1])) + r * 0.72;
    const tilt = Math.atan2(terrainHeight(ends[1][0], ends[1][1]) - terrainHeight(ends[0][0], ends[0][1]), len);
    const c = cellOf(x, z);
    place(c.solid, LOG_GEO, rnd() < 0.5 ? UC.bark : UC.barkDark, x, y, z, len, r, r, a, 0, tilt);
    for (const s of [-1, 1]) place(c.solid, LOG_END, UC.wood, x + s * ux * (len / 2 + 0.005), y + s * Math.sin(tilt) * len / 2, z + s * uz * (len / 2 + 0.005), 1, r, r, a + (s < 0 ? Math.PI : 0));
    if (rnd() < 0.6) place(c.solid, ROCK_GEO, UC.moss, x + ux * (rnd() - 0.5) * len * 0.6, y + r * 0.62, z + uz * (rnd() - 0.5) * len * 0.6, len * 0.16, r * 0.38, r * 0.9, a); // a moss patch on top
    for (let k = 0; k < 3; k++) { const t = (k - 1) * 0.36 * len; const cc = { type: 'circle', x: x + ux * t, z: z + uz * t, r: r + 0.24, log: true }; colliders.push(cc); solid.push(cc); }
    n++;
  }
  // rocks: mossy boulders, the bigger ones solid
  for (let i = 0, n = 0; i < 4000 && n < 150; i++) {
    const [x, z] = rand(), s = 0.25 + rnd() * rnd() * 1.0;
    if (!ok(x, z, s + 0.8) || nearTrunk(x, z, s + 0.6) || !free(x, z, s + 0.5)) continue;
    const c = cellOf(x, z), h = terrainHeight(x, z), a = rnd() * 6.28;
    place(c.solid, ROCK_GEO, rnd() < 0.5 ? UC.rock : UC.rockDark, x, h + s * 0.25, z, s * (1 + rnd() * 0.5), s * (0.55 + rnd() * 0.3), s * (0.9 + rnd() * 0.4), a);
    if (rnd() < 0.55) place(c.solid, ROCK_GEO, UC.moss, x, h + s * 0.52, z, s * 0.82, s * 0.24, s * 0.74, a + 0.3);
    if (s > 0.62) { const cc = { type: 'circle', x, z, r: s * 1.05, rock: true }; colliders.push(cc); solid.push(cc); }
    n++;
  }
  // mushrooms: little clusters at trunk feet and by logs, and a fairy ring in the glade
  const shroom = (c, x, z, s) => {
    const h = terrainHeight(x, z), col = UC.caps[Math.floor(rnd() * UC.caps.length)];
    place(c.ferns, STEM, UC.stem, x, h - 0.02, z, s, s * 0.16, s);
    place(c.ferns, CAP, col, x, h + s * 0.13, z, s * 0.11, s * 0.07, s * 0.11, rnd() * 6);
  };
  for (let i = 0, n = 0; i < 3000 && n < 140; i++) {
    const s = spots[Math.floor(rnd() * spots.length)];
    if (!s.solid || s.x > WOODS_X) continue;
    const a = rnd() * 6.28, d = 0.7 + rnd() * 0.5, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    if (!ok(x, z, 0.3)) continue;
    const c = cellOf(x, z);
    for (let k = 0, kn = 2 + Math.floor(rnd() * 4); k < kn; k++) shroom(c, x + (rnd() - 0.5) * 0.5, z + (rnd() - 0.5) * 0.5, 0.7 + rnd() * 0.8);
    n++;
  }
  for (let k = 0; k < 15; k++) { const a = (k / 15) * Math.PI * 2, x = GLADE.x + Math.cos(a) * 2.6, z = GLADE.z + Math.sin(a) * 2.6; shroom(cellOf(x, z), x, z, 1.1 + rnd() * 0.6); }
  // ferns: in drifts (a fern makes the next one likelier nearby), never on a trail or against a trunk
  let fx = 0, fz = 0;
  for (let i = 0, n = 0; i < 30000 && n < 1800; i++) {
    let x, z;
    if (n && rnd() < 0.7) { x = fx + (rnd() - 0.5) * 5; z = fz + (rnd() - 0.5) * 5; } else [x, z] = rand();
    if (!ok(x, z, 0.6) || nearTrunk(x, z, 0.75) || !free(x, z, 0.4)) continue;
    fx = x; fz = z;
    const c = cellOf(x, z), s = 0.75 + rnd() * 0.75;
    place(c.ferns, FERN, rnd() < 0.3 ? UC.fernFall : UC.fern, x, terrainHeight(x, z) - 0.03, z, s, s * (0.8 + rnd() * 0.4), s, rnd() * 6.28);
    n++;
  }
  // merge each cell into its meshes
  // one mesh a cell (inked, double sided for the fern blades): two draw calls a near cell, the colour pass and the ink's
  const mat = toon('#ffffff', { vertexColors: true, side: 'double' });
  for (const c of cells.values()) {
    for (const [list, isSoft, name] of [[[...c.ferns, ...c.solid], false, 'undergrowth']]) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      list.forEach(x => x.dispose());
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name + ' ' + c.key; mesh.castShadow = false; mesh.receiveShadow = true; mesh.visible = false;
      mesh.userData.noMerge = true;
      if (isSoft) soft(mesh);
      parent.add(mesh);
      c.meshes.push(mesh);
    }
    c.ferns = c.solid = null;
  }
  const list = [...cells.values()].filter(c => c.meshes.length);
  // shown while the camera is near (two radii: no flicker on the line); a few distance tests a frame, no allocation
  function update(cam) {
    if (!cam) return;
    const x = cam.position.x, z = cam.position.z;
    for (const c of list) {
      const dx = Math.max(0, c.minX - x, x - c.maxX), dz = Math.max(0, c.minZ - z, z - c.maxZ), d = Math.sqrt(dx * dx + dz * dz);
      const near = c.near ? d < UNDER_FAR : d < UNDER_NEAR;
      if (near !== c.near) { c.near = near; for (const mm of c.meshes) mm.visible = near; }
    }
  }
  return { cells: list, update };
}

// ------------------------------------------------------------------ the proof

// Vertical line (px, pz) against a geometry under a matrix: [lowest y, highest y] of the surface it hits, or null.
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
export function axisHits(geo, m, px, pz) {
  const pos = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count : pos.count;
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < n; t += 3) {
    const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
    A.fromBufferAttribute(pos, i0).applyMatrix4(m); B.fromBufferAttribute(pos, i1).applyMatrix4(m); C.fromBufferAttribute(pos, i2).applyMatrix4(m);
    const d = (B.z - C.z) * (A.x - C.x) + (C.x - B.x) * (A.z - C.z);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((B.z - C.z) * (px - C.x) + (C.x - B.x) * (pz - C.z)) / d;
    const l2 = ((C.z - A.z) * (px - C.x) + (A.x - C.x) * (pz - C.z)) / d;
    const l3 = 1 - l1 - l2, e = -1e-6;
    if (l1 < e || l2 < e || l3 < e) continue;
    const y = l1 * A.y + l2 * B.y + l3 * C.y;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return lo === Infinity ? null : [lo, hi];
}

// For every hand-placed tree: trunk top and lowest canopy surface at the trunk axis, plus whether each lobe is attached.
export function auditYardTrees() {
  const rows = [];
  for (const t of TREE_LOG) {
    if (t.kind === 'palm') { // no canopy over the axis: the fronds must spring from the trunk end (hub inside the top segment)
      const c = t.crown, d = Math.hypot(c.hub[0] - c.trunkEnd[0], c.hub[1] - c.trunkEnd[1], c.hub[2] - c.trunkEnd[2]);
      rows.push({ kind: 'palm', x: t.x, z: t.z, hubToTrunkEnd: +d.toFixed(3), trunkRadius: +c.r.toFixed(3), gap: d > c.r ? +(d - c.r).toFixed(3) : -1 });
      continue;
    }
    let trunkTop = -Infinity, canLo = Infinity, canHi = -Infinity;
    // the axis of a tree that leans (palms) is the trunk itself; broadleaf and pine trees stand straight at (x, z)
    for (const p of t.parts) {
      const h = axisHits(p.geo, p.matrix, t.x, t.z);
      if (!h) continue;
      if (p.role === 'trunk') trunkTop = Math.max(trunkTop, h[1]);
      else if (p.role === 'canopy') { canLo = Math.min(canLo, h[0]); canHi = Math.max(canHi, h[1]); }
    }
    rows.push({ kind: t.kind, x: t.x, z: t.z, trunkTop: +trunkTop.toFixed(2), canopyBottom: +canLo.toFixed(2), canopyTop: +canHi.toFixed(2), gap: +(canLo - trunkTop).toFixed(2) });
  }
  return rows;
}

// Attachment proof for the canopy pieces themselves: every side lobe's centre must lie inside the main lobe (normalised
// distance <= 1), every pine tier must start below the apex of the tier under it, and no lobe may sit apart from the rest.
export function auditAttachment() {
  const inv = new THREE.Matrix4(), c = new THREE.Vector3();
  let yardWorst = 0, yardCount = 0, isolated = 0;
  for (const t of TREE_LOG) {
    if (t.kind === 'palm' || t.kind === 'pine') continue;
    const canopy = t.parts.filter(p => p.role === 'canopy');
    inv.copy(canopy[0].matrix).invert();
    for (const p of canopy.slice(1)) {
      c.setFromMatrixPosition(p.matrix).applyMatrix4(inv);
      yardWorst = Math.max(yardWorst, c.length());
      yardCount++;
    }
  }
  let woodWorst = 0;
  for (const set of WOOD_BLOB) {
    const [mx, my, mz, rx, ry, rz] = set[0];
    for (const [x, y, z] of set.slice(1)) woodWorst = Math.max(woodWorst, Math.hypot((x - mx) / rx, (y - my) / ry, (z - mz) / rz));
  }
  let tierGap = -Infinity;
  for (const set of WOOD_PINE) for (let i = 1; i < set.length; i++) tierGap = Math.max(tierGap, set[i][0] - (set[i - 1][0] + set[i - 1][2])); // <= 0: tiers overlap in height
  for (const t of TREE_LOG) { // pines placed by hand: same test on the placed tiers (base y vs the apex under it)
    if (t.kind !== 'pine') continue;
    const tiers = t.parts.filter(p => p.role === 'canopy');
    for (let i = 1; i < tiers.length; i++) {
      const baseY = tiers[i].matrix.elements[13], prevTop = tiers[i - 1].matrix.elements[13] + tiers[i - 1].matrix.elements[5];
      tierGap = Math.max(tierGap, baseY - prevTop);
    }
  }
  return { yardLobes: yardCount, yardLobeMaxNormDist: +yardWorst.toFixed(3), woodLobeMaxNormDist: +woodWorst.toFixed(3), pineTierMaxGap: +tierGap.toFixed(3), isolated };
}
