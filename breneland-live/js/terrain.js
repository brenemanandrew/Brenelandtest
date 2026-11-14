// Ground height and the terrain mesh. groundHeight() is the single source of truth:
// the mesh is built from it and characters stand on it, so feet always meet grass.
import * as THREE from 'three';
import {
  LAKES, HOUSE, GARAGE, PORCH, STEPS, DOCK, FENCE_Z, YARD_TREES, SWING_TREE, ROADS, SIDEWALK_W, NEIGHBORHOODS, SHOPS,
  WATER_TOWER, OLD_TOWER_SITE, MAIL_OFFICE, TOOL_CRIB_LOT, BUS_STOP, WOODS_X, MAP, CARNIVAL, CAR_LOT, PARK_LOT, STORE_LOT, westEdgeAt,
} from './layout.js';
import { paveField, pavedY } from './road-net.js';
import { fbm, smoothstep, lerp } from './util.js';
import { toon } from './toon.js';
import { hillHeight, sandSigned } from './swing-hill.js';

export const WATER_Y = 0;

// Every lake shore as one list of segments (with each lake's bounding box, so far-away lakes are skipped quickly).
// Flat typed arrays (ax, az, dx, dz, len2 per segment; x, z per vertex): terrainHeight runs a few hundred times a frame,
// and destructuring nested arrays in these loops would allocate ~0.8 MB a frame.
function lakeSegsOf(l) {
  const segs = new Float64Array(l.poly.length * 5), poly = new Float64Array(l.poly.length * 2);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < l.poly.length; i++) {
    const [ax, az] = l.poly[i], [bx, bz] = l.poly[(i + 1) % l.poly.length];
    segs.set([ax, az, bx - ax, bz - az, (bx - ax) ** 2 + (bz - az) ** 2], i * 5);
    poly[i * 2] = ax; poly[i * 2 + 1] = az;
    minX = Math.min(minX, ax); maxX = Math.max(maxX, ax); minZ = Math.min(minZ, az); maxZ = Math.max(maxZ, az);
  }
  return { segs, poly, minX, maxX, minZ, maxZ };
}
const LAKE_SEGS = [];
/** (Re)index LAKES in place; world-edits.js calls this after adding the editor's ponds, before anything is built. */
export function rebuildLakes() { LAKE_SEGS.length = 0; for (const l of LAKES) LAKE_SEGS.push(lakeSegsOf(l)); }
rebuildLakes();
/* The editor's terrain brushes (world-edits.js): round bumps and dips, { x, z, r, dh }, blended in over the inner 60% of r. */
export const TERRAIN_BRUSHES = [];

function inPoly(x, z, poly) { // poly: flat x, z
  let inside = false;
  const n = poly.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], zi = poly[i * 2 + 1], xj = poly[j * 2], zj = poly[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Signed distance to the nearest lake shore: negative on land, positive over water. (The name is historical: the
// first yard had one coastline.) Anything more than 60 m from every lake reports -60.
export function coastSigned(x, z) {
  let best = 3600, water = false;
  for (const L of LAKE_SEGS) {
    const out = Math.max(L.minX - x, x - L.maxX, L.minZ - z, z - L.maxZ, 0);
    if (out * out >= best) continue;
    const S = L.segs;
    for (let k = 0; k < S.length; k += 5) {
      const ax = S[k], az = S[k + 1], dx = S[k + 2], dz = S[k + 3];
      let t = ((x - ax) * dx + (z - az) * dz) / S[k + 4];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t, d2 = ex * ex + ez * ez;
      if (d2 < best) best = d2;
    }
    if (!water && out === 0 && inPoly(x, z, L.poly)) water = true;
  }
  const d = Math.sqrt(best);
  return water ? d : -d;
}

let flatZones = []; // { x, z, r, y } circles the world builder flattens (game plazas), or { minX, maxX, minZ, maxZ, y, fall? } boxes
export function setFlatZones(z) { flatZones = z; }
export function addFlatZone(z) { flatZones.push(z); } // (world-edits.js: a pad under each placed house)

// Raised surfaces the player can stand on (porch, steps, dock, hall floor). Features add their own (the fish shack
// floor, the game store) with addSurface().
const SURFACES = [
  { ...PORCH }, { ...STEPS }, { ...DOCK },
  { minX: HOUSE.hall.minX, maxX: HOUSE.hall.maxX, minZ: HOUSE.hall.minZ, maxZ: HOUSE.hall.maxZ, y: HOUSE.floorY },
];
export function addSurface(s) { SURFACES.push(s); }

// The paved field (road-net.js): < 0 on the tar, 0..SIDEWALK_W on kerb and sidewalk. The same field the town's road,
// kerb and sidewalk meshes are cut from, so the flat ground below and the people on top always agree with them.
export const roadEdgeDist = paveField;
const TOWN_Y = 0.34;
const TOWN_RECTS = [...NEIGHBORHOODS, SHOPS, STORE_LOT, CAR_LOT, { minX: PARK_LOT.minX, maxX: PARK_LOT.maxX, minZ: PARK_LOT.drive.cutZ, maxZ: PARK_LOT.maxZ }, { minX: WATER_TOWER.x - 10, maxX: WATER_TOWER.x + 10, minZ: WATER_TOWER.z - 10, maxZ: WATER_TOWER.z + 10 },
  { minX: OLD_TOWER_SITE.x - 10, maxX: OLD_TOWER_SITE.x + 10, minZ: OLD_TOWER_SITE.z - 10, maxZ: OLD_TOWER_SITE.z + 10 }, // (the old tower site stays flat for the bus stop)
  { minX: BUS_STOP.link.minX, maxX: BUS_STOP.path.minX, minZ: BUS_STOP.link.minZ, maxZ: BUS_STOP.link.maxZ }, // (the lawn behind the lot is flat, no knoll through its kerb)
  MAIL_OFFICE.lot, TOOL_CRIB_LOT]; // (the post office and, beside it, Kevin's Tool Crib stand on flat town ground; crib-move)
function townWeight(x, z) {
  let w = 1 - smoothstep(SIDEWALK_W + 2, SIDEWALK_W + 9, roadEdgeDist(x, z));
  if (z < FENCE_Z - 1 && x > -44 && z > -160) return Math.max(w, smoothstep(FENCE_Z - 1, FENCE_Z - 4, z)); // the old street strip (and flat under every sidewalk)
  for (let i = 0; i < TOWN_RECTS.length; i++) {
    const r = TOWN_RECTS[i], d = Math.max(r.minX - x, x - r.maxX, r.minZ - z, z - r.maxZ);
    if (d < 6) w = Math.max(w, 1 - smoothstep(0, 6, d));
  }
  return w;
}

// Height of the natural ground (no porch/dock).
export function terrainHeight(x, z) {
  const s = coastSigned(x, z);
  let land = 0.42 + fbm(x * 0.035, z * 0.035) * 0.32;

  // Strickler woods: soft rolling ground, getting lumpier to the west
  if (x < WOODS_X + 20) land += smoothstep(WOODS_X + 20, -192, x) * (fbm(x * 0.05 + 3, z * 0.05 - 7) * 1.1 + 1.25); // never below the lawn (full from x -192 on west into the woods)
  // past the tree line (west) and past the town (north) the ground climbs into the mountains (the foothills climb about
  // 20 m, so the Blue Ridge's near ridges show over them: world-ridges.js)
  const wx = westEdgeAt(z); // (where the woods end to the west, at this z)
  const riseW = smoothstep(wx - 4, wx - 90, x) * 20 + smoothstep(wx, wx - 30, x) * fbm(x * 0.08, z * 0.08) * 3;
  // the north range, with a low saddle to the north-west where the carnival lights show through
  const saddle = 1 - 0.8 * (1 - smoothstep(0, 70, Math.abs(x - CARNIVAL.x)));
  // (lower, 22 m, west of x 0. East of x 40, by Lake Tamakiya's north shore, the full height: the lakes are never touched)
  const riseN = smoothstep(MAP.minZ + 4, MAP.minZ - 80, z) * (22 + 14 * smoothstep(0, 40, x)) * saddle + smoothstep(MAP.minZ, MAP.minZ - 25, z) * fbm(x * 0.07, z * 0.07) * 3;
  // far shores of the lakes: wooded hills
  const riseE = smoothstep(200, 300, x) * 26;
  const riseS = smoothstep(175, 260, z) * 20;
  land += Math.max(riseW, riseN, riseE, riseS);

  // the town sits flat around its roads, sidewalks and lots
  const tw = townWeight(x, z);
  if (tw > 0) land = lerp(land, TOWN_Y, tw);

  // house pad
  const hx = Math.max(GARAGE.minX - 3 - x, 0, x - HOUSE.maxX - 3); // (the pad runs under the garage too)
  const hz = Math.max(HOUSE.minZ - 5 - z, 0, z - HOUSE.maxZ - 3);
  land = lerp(0.4, land, smoothstep(0, 4, Math.sqrt(hx * hx + hz * hz))); // (sqrt: Math.hypot allocates)

  for (let i = 0; i < flatZones.length; i++) {
    const f = flatZones[i];
    if (f.minX !== undefined) { // a box (the garden's block): flat inside, easing back to the lawn over `fall` metres
      const ex = Math.max(f.minX - x, 0, x - f.maxX), ez = Math.max(f.minZ - z, 0, z - f.maxZ), fall = f.fall || 3;
      if (ex < fall && ez < fall) land = lerp(f.y, land, smoothstep(0, fall, Math.sqrt(ex * ex + ez * ez)));
      continue;
    }
    const fx = x - f.x, fz = z - f.z, d = Math.sqrt(fx * fx + fz * fz);
    if (d < f.r + 4) land = lerp(f.y, land, smoothstep(f.r, f.r + 4, d));
  }
  for (let i = 0; i < TERRAIN_BRUSHES.length; i++) {
    const b = TERRAIN_BRUSHES[i], bx = x - b.x, bz = z - b.z, d = Math.sqrt(bx * bx + bz * bz);
    if (d < b.r) land += b.dh * (1 - smoothstep(b.r * 0.6, b.r, d));
  }
  land += hillHeight(x, z, s); // the swing hill (swing-hill.js; nothing within 9 m of the water)

  // beach down into the water
  if (s > -5) {
    const beachTop = 0.16;
    if (s < 0) land = lerp(beachTop, land, smoothstep(0, 5, -s));
    else land = beachTop - s * 0.55 - s * s * 0.02;
  }
  return Math.max(land, -4);
}

// y (optional): the height of whoever asks. A surface marked `deck` (a floor with a room under it: the game store's loft over
// the back room) counts only for someone up near it (y above its height less DECK_REACH). Without y every surface counts
// (the highest wins).
export const DECK_REACH = 1;
export function groundHeight(x, z, y) {
  let h = terrainHeight(x, z);
  const p = pavedY(x, z); // standing on the tar or a sidewalk (they sit a little above the flat town ground)
  if (p !== null && p > h) h = p;
  for (let i = 0; i < SURFACES.length; i++) {
    const r = SURFACES[i];
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ && !(r.deck && y !== undefined && y < r.y - DECK_REACH)) h = Math.max(h, r.y);
  }
  return h;
}

// Is (x, z) on a raised surface (porch, dock, a floor)? Those are dry even over water.
export function onSurface(x, z, pad = 0) { // (pad: within that far of one; the trails stop that short of a step)
  for (const r of SURFACES) if (x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad) return true;
  return false;
}
export const surfaceCount = () => SURFACES.length; // (world.js lays the trails again when one more turns up)

// Which sound/footstep surface is under a point.
export function surfaceAt(x, z, onTrail) {
  if (x >= DOCK.minX && x <= DOCK.maxX && z >= DOCK.minZ && z <= DOCK.maxZ) return 'wood';
  if (x >= PORCH.minX && x <= PORCH.maxX && z >= STEPS.minZ && z <= PORCH.maxZ) return 'wood';
  if (x >= HOUSE.hall.minX && x <= HOUSE.hall.maxX && z >= HOUSE.hall.minZ && z <= HOUSE.hall.maxZ) return 'wood';
  for (const r of SURFACES) if (r.sound && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.sound;
  if (coastSigned(x, z) > -3.5) return 'sand';
  if (sandSigned(x, z) < 0) return 'sand'; // the swing hill's sand pit
  if (onTrail) return 'dirt';
  if (roadEdgeDist(x, z) < SIDEWALK_W) return 'dirt'; // tar and sidewalk: the firm step
  return 'grass';
}

const C = {
  lawn: new THREE.Color('#79c150'), lawnDark: new THREE.Color('#5fa844'), lawnLight: new THREE.Color('#98d45f'),
  sand: new THREE.Color('#ecd9a0'), wetSand: new THREE.Color('#cdb98a'), seabed: new THREE.Color('#6fae9f'),
  forest: new THREE.Color('#4d8a3c'), forestDark: new THREE.Color('#3b6f33'), rock: new THREE.Color('#8b8f86'),
  verge: new THREE.Color('#86c25a'), dry: new THREE.Color('#a9c95c'), clover: new THREE.Color('#4e9a40'),
  needles: new THREE.Color('#6f7a3c'),
};
const TREE_SPOTS = [...YARD_TREES.filter(t => !t.gone), SWING_TREE];

// Area tints (gloomy ground round Arkham, a brighter lawn round the unicorns). world.js hands them in from games.json.
let tints = []; // { x, z, r, color: THREE.Color, k }
export function setGroundTints(t) { tints = t.map(o => ({ ...o, color: new THREE.Color(o.color) })); }

// Where the lawn ends and the sand begins, as a coastSigned value (the beach is where coastSigned > lawnEdge): about 3 m
// up from the waterline, wandering a metre either way along the shore, and closer to the water behind the house so the
// back lawn reaches round it (the house's back wall stood on the sand). Never nearer the water than 1.2 m.
const HOUSE_CX = (HOUSE.minX + HOUSE.maxX) / 2, HOUSE_CZ = (HOUSE.minZ + HOUSE.maxZ) / 2;
const HOUSE_HX = (HOUSE.maxX - HOUSE.minX) / 2, HOUSE_HZ = (HOUSE.maxZ - HOUSE.minZ) / 2;
export function lawnEdge(x, z) {
  const hx = Math.max(Math.abs(x - HOUSE_CX) - HOUSE_HX, 0), hz = Math.max(Math.abs(z - HOUSE_CZ) - HOUSE_HZ, 0);
  const near = 1 - smoothstep(1, 9, Math.sqrt(hx * hx + hz * hz)); // (1 round the house, 0 from 9 m off)
  const e = -3.2 + (1.9 * fbm(x * 0.1 + 5.3, z * 0.1 - 2.1) + 0.6 * fbm(x * 0.29 - 4, z * 0.29 + 8)) * (1 - 0.5 * near) + 1.55 * near;
  return e < -4.6 ? -4.6 : e > -1.2 ? -1.2 : e;
}

// Vertex colour of the ground at (x, z, height h): lawn patches, beach, forest floor.
function shade(x, z, h, col) {
  const s = coastSigned(x, z);
  const n = fbm(x * 0.09 + 40, z * 0.09 - 12);
  col.copy(C.lawn).lerp(n > 0 ? C.lawnLight : C.lawnDark, Math.min(1, Math.abs(n) * 1.4));
  // finer patchiness: sun-bleached patches and darker clover, plus faint mowing bands near the house
  const n2 = fbm(x * 0.23 + 11, z * 0.23 - 5);
  if (n2 > 0.18) col.lerp(C.dry, Math.min(1, (n2 - 0.18) * 2.4) * 0.5);
  else if (n2 < -0.2) col.lerp(C.clover, Math.min(1, (-0.2 - n2) * 2.4) * 0.45);
  const nearHouse = 1 - smoothstep(6, 30, Math.hypot(x - 0, (z + 8) * 1.2));
  if (nearHouse > 0 && Math.floor((x + 200) / 2.2) % 2 === 0) col.multiplyScalar(1 - 0.05 * nearHouse);
  // a little contact shade under each hand-placed tree so trunks sit in the ground
  for (const t of TREE_SPOTS) { const d = Math.hypot(x - t.x, z - t.z); if (d < 3.2) col.multiplyScalar(1 - 0.16 * (1 - d / 3.2) ** 1.5); }
  // the woods floor: needles and shade, deeper to the west
  const forestT = Math.max(smoothstep(WOODS_X + 10, WOODS_X - 25, x), smoothstep(54, 66, z) * smoothstep(-20, -40, x)); // (z 60: the old south edge)
  if (forestT > 0) col.lerp(n > 0.1 ? C.forest : n < -0.2 ? C.needles : C.forestDark, forestT);
  for (const t of tints) { const d = Math.hypot(x - t.x, z - t.z); if (d < t.r) col.lerp(t.color, (1 - smoothstep(t.r * 0.45, t.r, d)) * t.k * (0.75 + 0.25 * n2)); }
  if (h > 6) col.lerp(C.rock, smoothstep(6, 14, h) * 0.6);
  if (townWeight(x, z) > 0.5) col.lerp(C.verge, 0.6);
  // the swing hill's sand pit: sand inside its timber edge, a little kicked out over the grass round it
  const sp = sandSigned(x, z);
  if (sp < 1.4) col.lerp(C.sand, (1 - smoothstep(-0.2, 1.4, sp)) * (sp < -0.2 ? 1 : 0.92 + 0.08 * fbm(x * 0.5, z * 0.5)));
  if (s > -6.5) {
    // the lawn gives way to the sand along an edge that wanders with the shore (lawnEdge), soft over a metre or so, with
    // a few sandy patches in the grass just inland of it
    const sb = lawnEdge(x, z);
    if (s > sb - 2.6) {
      const p = fbm(x * 0.42 + 11, z * 0.42 + 1.5);
      if (p > 0.18) col.lerp(C.sand, Math.min(0.55, (p - 0.18) * 2.6) * smoothstep(sb - 2.6, sb - 0.9, s));
    }
    const t = smoothstep(sb - 0.75, sb + 0.65, s);
    col.lerp(C.sand, t);
    if (s > -0.4) col.lerp(C.wetSand, smoothstep(-0.4, 0.4, s));
    if (s > 1.5) col.lerp(C.seabed, smoothstep(1.5, 5, s));
  }
}

// One patch of terrain. `drop` sinks the whole patch a little (the coarser field lies just under the finer one) and
// `bevel` pulls the outermost ring of vertices down so two patches never show a crack where they meet.
function terrainPatch(x0, x1, z0, z1, step, { drop = 0, bevel = 0 } = {}) {
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    const ix = i % (nx + 1), iz = Math.floor(i / (nx + 1));
    const ring = ix === 0 || iz === 0 || ix === nx || iz === nz;
    pos.setY(i, h - drop - (ring ? bevel : 0));
    shade(x, z, h, col);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toon('#ffffff', { vertexColors: true, steps: 4 }));
  mesh.receiveShadow = true;
  return mesh;
}

// The ground in three layers: a fine 1.25 m patch round the yard, a 2 m field over the rest of the walkable map (the
// park, the woods, the town), and a coarse 5 m field out to the mountains and the far shores. Each finer layer lies a
// few centimetres over the coarser one, which only shows where the finer one ends.
const PATCHES = () => [
  [-400, 290, -360, 250, 5, { drop: 0.1 }], // (on west to x -400, under the foothills past the woods)
  [MAP.minX - 8, MAP.maxX + 8, MAP.minZ - 8, MAP.maxZ + 8, 2, { drop: 0.05, bevel: 0.6 }],
  [-75, 72.5, -60, 47.5, 1.25, { bevel: 0.6 }],
];
export function buildTerrain() {
  const group = new THREE.Group();
  group.name = 'terrain';
  for (const p of PATCHES()) group.add(terrainPatch(...p));
  return group;
}
// The drawn ground's top at (x, z) (fountain-apron): each patch's triangles interpolate terrainHeight between its vertices, so
// over a dip the drawn ground can stand several cm above the true height. A decal draped on the ground lifts off the highest.
export function groundTop(x, z) {
  let top = terrainHeight(x, z);
  for (const [x0, x1, z0, z1, step, { drop = 0 }] of PATCHES()) {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
    const fx = (x - x0) / sx, fz = (z - z0) / sz, ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 1 || iz < 1 || ix >= nx - 1 || iz >= nz - 1) continue; // (outside it, or on its bevelled ring)
    const u = fx - ix, v = fz - iz, X = x0 + ix * sx, Z = z0 + iz * sz;
    const ha = terrainHeight(X, Z), hb = terrainHeight(X, Z + sz), hc = terrainHeight(X + sx, Z + sz), hd = terrainHeight(X + sx, Z);
    const h = u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v); // (PlaneGeometry's two triangles a cell, split b-d)
    top = Math.max(top, h - drop);
  }
  return top;
}
