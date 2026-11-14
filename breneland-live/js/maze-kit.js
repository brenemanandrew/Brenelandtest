// Beneath Angell Street: the kit, built from a generated maze (maze-gen.js) into merged meshes per chunk of 6 x 6 cells
// (one draw call per material per chunk, the Batcher's way), with the colliders the first-person controller needs and the two
// stairs: the narrow helix down from the Lovecraft house's hall into the start room, and the straight flight up to daylight in
// the exit room. Our cel-shaded style, chunky and readable, the colour drained (maze-art.js): cyclopean stone, brick vaults, wet
// flagstones, skulls in niches, roots through the ceiling, iron gates on a few dead ends, candles, glyphs that glow, Elder Signs
// scratched into the walls, a leaning door frame. Loaded only on the way down (maze.js imports it dynamically).
//
//   buildMazeKit(maze, parent, { soft }) -> { chunks, cellBoxes, torches, flames, lights, stair, exitStair, setVisible(px, pz), dispose() }
// Everything is in the maze's own frame: cell (cx, cy) spans x [cx * 4, cx * 4 + 4], z [cy * 4, cy * 4 + 4]; the floor at y 0
// (flooded cells -0.35), the ceiling at 3.2. The parent group puts the whole thing where it lives in the world (maze-scene.js).
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { GRADIENT_3, soft as softLayer } from './toon.js';
import { CELL, DIRS, N, E, S, W as WB } from './maze-gen.js'; // (WB: the west wall bit; W below is the maze's width)
import { stoneBlocks, brickVault, flagstones, glyph, elderSign, sigil, arrow, cobweb, bakeRelief, LEGACY } from './maze-art.js';
import { GFX } from './gfx.js';
import { buildProp, Prop, blob, bookcase, lectern, rng as propRng, SHAPES, C as PC, gateRng, gateLeaf, gatePosts, gateStone } from './maze-props.js';

export const WALL_H = 3.2, WALL_T = 0.6, WATER_Y = -0.35, CHUNK = 6;
export const STAIR = { r: 1.35, rIn: 0.62, rOut: 2.3, steps: 24, rise: 0.3, turns: 1.5, top: 7.2 }; // the helix down: 24 steep narrow treads, a turn and a half
export const EXIT = { steps: 14, rise: 0.3, run: 0.32, w: 1.7, landing: 1.2, hall: 7.4, doorW: 1.2, doorH: 2.35 }; // the flight up to daylight: the landing, the chamber's height, the arched door
const SKULL = '#d8d0b8', BONE = '#cfc6ad', IRON = '#26262d', ROOT = '#4a3a2c', WOOD = '#3b2418';
const VERT = 'xyz';
const TORCH_HEAD = new THREE.CylinderGeometry(1, 0.78, 1, 9); // the wound head, fuller at the top
// the parts on a torch's handle, for a spot p on a wall ({ x, y, z, nx, nz }: nx, nz out of the wall): each { part, u (metres
// along the handle from its middle), x, y, z, rx, ry, sx, sy, sz }. Every part turns by the wall's normal itself: tilt out from the
// wall, then the yaw (YXZ). Not by the wall's yaw: on the north and south walls that faces INTO the wall (maze-kit's sideYaw is the
// reverse of the normal there), and the handle leaned into the stone, away from its head.
export const TORCH = { tilt: 0.35, out: 0.2, up: 0.3 };
export function torchParts(p) {
  const tilt = TORCH.tilt, ax = Math.sin(tilt), ay = Math.cos(tilt), ry = Math.atan2(p.nx, p.nz);
  const at = u => ({ x: p.x + p.nx * (TORCH.out + u * ax), y: p.y + TORCH.up + u * ay, z: p.z + p.nz * (TORCH.out + u * ax) });
  const on = (part, u, o) => ({ part, u, ...at(u), rx: tilt, ry, ...o });
  return [
    on('ring', -0.13, { sx: 0.042, sy: 0.045, sz: 0.042 }),
    on('cup', -0.27, { sx: 0.04, sy: 0.07, sz: 0.04, rx: tilt + Math.PI }),
    on('handle', 0, { sx: 0.03, sy: 0.52, sz: 0.03 }),
    on('head', 0.32, { sx: 0.06, sy: 0.15, sz: 0.06 }),
    on('band', 0.275, { sx: 0.06, sy: 0.026, sz: 0.06 }),
    on('band', 0.35, { sx: 0.059, sy: 0.022, sz: 0.059 }),
    on('top', 0.4, { sx: 0.046, sy: 0.02, sz: 0.046 }),
  ];
}
export const torchAlong = (p, u) => ({ x: p.x + p.nx * (TORCH.out + u * Math.sin(TORCH.tilt)), y: p.y + TORCH.up + u * Math.cos(TORCH.tilt), z: p.z + p.nz * (TORCH.out + u * Math.sin(TORCH.tilt)) });

// a BoxGeometry's UVs scaled so a texture repeats every `tile` metres on every face (BoxGeometry: 4 verts a face, px nx py ny pz nz)
function boxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv, spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * spans[f][0] / tile, uv.getY(k) * spans[f][1] / tile); }
  return geo;
}
function planeUV(geo, w, h, tile) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile); return geo; }
const sideDir = side => [[0, -1], [1, 0], [0, 1], [-1, 0]][side]; // N E S W: out of the cell
const sideYaw = side => [Math.PI, -Math.PI / 2, 0, Math.PI / 2][side]; // the yaw a thing on that wall faces (into the cell): sin/cos = -dir

// The painted relief (maze-art.js's HEIGHT canvases, the broad features only) is a bump map on High and Max on a computer, faded
// out with the distance from the camera: full near the lantern, fading from BUMP.near and gone by BUMP.far metres (the far
// shimmer goes with it). Fast and every phone draw no bump at all (no texture, no derivatives): their colour map is
// bakeRelief()'s copy with the mortar and crack darkness painted in. setBump(M, mode) switches live ('near' | 'off' | 'legacy' |
// 'none'; the last two for the tests' shimmer measure only: 'legacy' the old surfaces and full-grain bump without the fade, 'none'
// today's colour with no bump). buildMazeKit follows GFX.level.
export const BUMP = { near: 2, far: 6 };
const BUMP_U = { uMzBumpNear: { value: BUMP.near }, uMzBumpFar: { value: BUMP.far } };
const BUMP_FRAG = THREE.ShaderChunk.normal_fragment_maps.replace('dHdxy_fwd()', 'dHdxy_fwd() * (1.0 - smoothstep(uMzBumpNear, uMzBumpFar, length(vViewPosition)))');
function bumpFade(m) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, BUMP_U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + String.fromCharCode(10) + 'uniform float uMzBumpNear, uMzBumpFar;').replace('#include <normal_fragment_maps>', BUMP_FRAG);
  };
}
export function setBump(M, mode) {
  for (const k of ['stone', 'brick', 'floor']) {
    const m = M[k], R = m.userData.relief;
    let bump = null, map = R.map;
    if (mode === 'off') map = bakeRelief(R.map);
    else if (mode === 'legacy') { if (!R.legacy) { LEGACY.fine = true; R.legacyMap = R.make(); LEGACY.fine = false; R.legacy = R.legacyMap.userData.bump; R.legacyScale = R.legacyMap.userData.bumpScale; R.legacyMap.repeat.copy(R.map.repeat); } bump = R.legacy; map = R.legacyMap; }
    else if (mode !== 'none') bump = R.map.userData.bump; // ('none': the colour as on High with no bump, the tests' zero)
    if (!!m.bumpMap !== !!bump) m.needsUpdate = true;
    m.map = map; m.bumpMap = bump; m.bumpScale = mode === 'legacy' ? R.legacyScale : R.map.userData.bumpScale ?? 1;
  }
  const nofade = mode === 'legacy' || mode === 'nofade'; // ('nofade': today's bump without the fade, the tests' measure of it)
  BUMP_U.uMzBumpNear.value = nofade ? 1e5 : BUMP.near; BUMP_U.uMzBumpFar.value = nofade ? 2e5 : BUMP.far;
  M.bumpMode = mode;
}
export function makeMaterials() {
  const toonMap = make => { const map = make(), m = new THREE.MeshToonMaterial({ map, gradientMap: GRADIENT_3 }); m.bumpScale = map.userData.bumpScale ?? 1; m.userData.relief = { map, make, legacy: null }; bumpFade(m); return m; }; // the painted relief (maze-art.js); setBump puts the bump on
  const M = {
    stone: toonMap(stoneBlocks), brick: toonMap(brickVault), floor: toonMap(flagstones),
    glyphs: [0, 1, 2].map(k => new THREE.MeshBasicMaterial({ map: glyph(k), transparent: true, fog: true, depthWrite: false, side: THREE.DoubleSide })),
    sign: new THREE.MeshToonMaterial({ map: elderSign(), gradientMap: GRADIENT_3, transparent: true, depthWrite: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }), // lit by the lantern, cut into the stone
    sigil: new THREE.MeshBasicMaterial({ map: sigil(), transparent: true, fog: true, depthWrite: false }),
    arrow: new THREE.MeshBasicMaterial({ map: arrow(), transparent: true, fog: true, depthWrite: false, opacity: 0.7 }),
    flame: new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: true }),
    ember: new THREE.MeshBasicMaterial({ color: '#ff9a3a', fog: true }),
    water: new THREE.MeshBasicMaterial({ color: '#0d2029', transparent: true, opacity: 0.82, fog: true }), // (unlit: maze-fx.js gives it ripples and the lights' reflections)
    daylight: new THREE.MeshBasicMaterial({ color: '#fff1cf', fog: false }),
    web: new THREE.MeshBasicMaterial({ map: cobweb(), transparent: true, fog: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8, color: '#b4bac2' }), // (the scenery pass: lit by nothing, a pale grey in the dark)
  };
  for (const [k, m] of Object.entries(M)) if (m.isMaterial) m.name = 'maze-' + k;
  M.glyphs.forEach((m, i) => { m.name = 'maze-glyph-' + i; m.forceSinglePass = true; }); // a transparent double side is two passes and a program check each frame in three
  M.stone.map.repeat.set(1, 1); // (the UVs carry the tiling)
  M.bumpMode = null;
  return M;
}

// a skull: the cranium long from front to back, a brow ridge,
// the cheekbones and the upper jaw, deep round sockets, the nose's pear-shaped hole, a row of teeth and a separate jaw with a chin.
// The bone is aged a little differently skull to skull (a tint picked from where it lies). Vertex-coloured pieces.
const BONE_TINTS = ['#c9c0a6', '#bfb496', '#b8ac8c', '#c4b99e', '#ad9f80']; // (aged: a white skull blows out in the lantern at arm's length)
const HOLE = '#0d0b0c';
function skull(b, x, y, z, yaw, s = 1) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const tint = BONE_TINTS[Math.abs(Math.floor(x * 7.3 + z * 3.1)) % BONE_TINTS.length], dark = '#a89a7c';
  const at = (f, r, h) => ({ x: x + fx * f * s + rx * r * s, y: y + h * s, z: z + fz * f * s + rz * r * s });
  const put = (geo, col, f, r, h, sx, sy, sz, o = {}) => b.add(geo, col, { ...at(f, r, h), sx: sx * s, sy: sy * s, sz: sz * s, ry: yaw, ...o });
  put(GEO.sphere, tint, -0.015, 0, 0.13, 0.115, 0.112, 0.14);            // the cranium
  put(GEO.sphere, tint, 0.055, 0, 0.145, 0.1, 0.075, 0.08);              // the forehead
  put(GEO.box, tint, 0.105, 0, 0.122, 0.15, 0.022, 0.035);               // the brow ridge
  put(GEO.sphere, tint, 0.075, 0, 0.07, 0.085, 0.055, 0.065);            // the upper jaw and the cheeks
  for (const k of [-1, 1]) put(GEO.sphere, tint, 0.085, k * 0.068, 0.085, 0.03, 0.026, 0.03); // the cheekbones
  for (const k of [-1, 1]) put(GEO.sphere, HOLE, 0.112, k * 0.04, 0.1, 0.03, 0.032, 0.022); // the sockets, deep and round
  put(GEO.cone6, HOLE, 0.135, 0, 0.066, 0.014, 0.034, 0.012);            // the nose's hole
  put(GEO.box, HOLE, 0.108, 0, 0.037, 0.078, 0.011, 0.02);               // the shadow behind the teeth, well behind them (its faces level with theirs flickered)
  for (let k = -2.5; k <= 2.5; k += 1) put(GEO.box, '#e4dcc4', 0.128 - Math.abs(k) * 0.004, k * 0.012, 0.037, 0.009, 0.017, 0.012); // the teeth
  put(GEO.box, dark, 0.05, 0, 0.012, 0.1, 0.022, 0.09);                  // the jaw
  put(GEO.sphere, tint, 0.105, 0, 0.014, 0.032, 0.02, 0.024);            // the chin
  for (const k of [-1, 1]) put(GEO.box, tint, 0.01, k * 0.05, 0.04, 0.016, 0.06, 0.03); // the jaw's hinges
}
// a long bone: a shaft and its two knuckled ends, lying along `yaw` (tilt: one end up)
function bone(b, x, y, z, yaw, len = 0.42, tilt = 0, col = BONE) {
  const rx = Math.cos(yaw), rz = -Math.sin(yaw), hx = rx * len / 2, hz = rz * len / 2, hy = Math.sin(tilt) * len / 2;
  b.add(GEO.cyl8, col, { x, y, z, sx: 0.022, sy: len, sz: 0.022, rz: Math.PI / 2 - tilt, ry: yaw });
  for (const e of [-1, 1]) for (const o of [-1, 1]) b.add(GEO.sphere, col, { x: x + e * hx + rz * o * 0.016, y: y + e * hy, z: z + e * hz - rx * o * 0.016, sx: 0.028, sy: 0.026, sz: 0.026 });
}
// a candle: a wax stick, a wick, and its flame. `flames` gets its halo's spot and the flame's foot and size (the flame itself is
// maze-flame.js's, one draw for every flame in the maze). Wax runs down its side in a few drips and pools round its foot, the top
// burned hollow round the wick
function candle(b, M, x, y, z, h = 0.2, r = 0.035, flames = null) {
  const q = propRng(((x * 12.9898 + z * 78.233) % 1 + 1) % 1);
  b.add(SHAPES.disc, '#d9cdb0', { x: x + (q() - 0.5) * 0.01, y: y + 0.003, z, sx: r * (1.6 + q() * 0.6), sy: 0.006, sz: r * (1.5 + q() * 0.6) }); // the pool
  b.add(GEO.cyl8, '#efe6cf', { x, y: y + h / 2, z, sx: r, sy: h, sz: r });
  b.add(GEO.cyl8, '#e3d6b6', { x, y: y + h, z, sx: r * 0.8, sy: 0.01, sz: r * 0.8 });
  for (let i = 0; i < 3; i++) { const a = q() * 6.28, l = 0.03 + q() * h * 0.45; b.add(GEO.sphere, '#e8dcbf', { x: x + Math.cos(a) * r * 0.92, y: y + h - 0.01 - l / 2, z: z + Math.sin(a) * r * 0.92, sx: r * 0.3, sy: l / 2, sz: r * 0.3 }); } // the drips
  for (const a of [0, 2.1, 4.2]) b.add(GEO.sphere, '#efe6cf', { x: x + Math.cos(a + q()) * r * 0.82, y: y + h + 0.004, z: z + Math.sin(a + q()) * r * 0.82, sx: r * 0.28, sy: r * 0.3, sz: r * 0.28 }); // the rim, burned uneven
  b.add(GEO.cyl6, '#1c1612', { x, y: y + h + 0.012, z, sx: 0.004, sy: 0.024, sz: 0.004 }); // the wick
  flames?.push({ x, y: y + h + 0.06, z, size: 0.22, kind: 'candle', by: y + h + 0.006, fw: r * 0.68, fh: 0.06 + r * 0.9 });
}

export function buildMazeKit(maze, parent, { M = makeMaterials(), shadows = true, gates = true, phone = GFX.cls !== 'desktop', props = true } = {}) { // gates false: maze-gates.js draws them, they shake and fall
  const propsBuilt = [], propsSkipped = []; // every prop's record, its world bounds (the tests read them)
  // the bump by the graphics level and the device, followed live (setVisible runs every 0.2 s). Tests can force a mode
  let bumpForced = null;
  const bumpWant = () => bumpForced || (phone || GFX.level === 'low' ? 'off' : 'near');
  const syncBump = () => { const w = bumpWant(); if (M.bumpMode !== w) setBump(M, w); };
  syncBump();
  const { W, H, cells, water, dist } = maze;
  const idx = (x, y) => y * W + x;
  const roomAt = (x, y) => maze.rooms.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) || null;
  const cX = cx => cx * CELL + CELL / 2, cZ = cy => cy * CELL + CELL / 2;
  const torches = [];   // { x, y, z, color, k } fixed lights for the pool (maze-scene.js places the nearest)
  const flames = [];    // { x, y, z, size, kind } every torch and candle flame: maze-fx.js draws a flickering halo on each
  const cellBoxes = new Array(W * H);
  for (let i = 0; i < W * H; i++) cellBoxes[i] = [];
  const box = (cx, cy, minX, minZ, maxX, maxZ, extra) => cellBoxes[idx(cx, cy)].push({ minX, maxX, minZ, maxZ, ...(extra || {}) });
  // ---- colliders: every wall bit as a box on its edge (both cells keep it: a push is a push), the gates across their openings
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const c = cells[idx(cx, cy)], x0 = cx * CELL, z0 = cy * CELL, t = WALL_T / 2;
    if (c & N) box(cx, cy, x0 - t, z0 - t, x0 + CELL + t, z0 + t);
    if (c & S) box(cx, cy, x0 - t, z0 + CELL - t, x0 + CELL + t, z0 + CELL + t);
    if (c & WB) box(cx, cy, x0 - t, z0 - t, x0 + t, z0 + CELL + t);
    if (c & E) box(cx, cy, x0 + CELL - t, z0 - t, x0 + CELL + t, z0 + CELL + t);
  }
  for (const g of maze.gates) {
    const x0 = g.cx * CELL, z0 = g.cy * CELL, t = 0.12;
    const b = g.dir === 0 ? [x0, z0 - t, x0 + CELL, z0 + t] : g.dir === 2 ? [x0, z0 + CELL - t, x0 + CELL, z0 + CELL + t] : g.dir === 3 ? [x0 - t, z0, x0 + t, z0 + CELL] : [x0 + CELL - t, z0, x0 + CELL + t, z0 + CELL];
    box(g.cx, g.cy, b[0], b[1], b[2], b[3], { gate: true });
    const [dx, dy] = DIRS[g.dir]; const nx = g.cx + dx, ny = g.cy + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) box(nx, ny, b[0], b[1], b[2], b[3], { gate: true });
  }

  // ---- the chunks
  const chunks = [];
  const cw = Math.ceil(W / CHUNK), ch = Math.ceil(H / CHUNK);
  const noCeiling = new Set(); // the start room (the helix rises through it) and the exit room (the flight does)
  for (const r of [maze.startRoom, maze.exitRoom]) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) noCeiling.add(idx(x, y));
  const wallSpot = (s, b, y, out) => { const [dx, dz] = sideDir(s.side); return { x: cX(s.cx) + dx * (CELL / 2 - WALL_T / 2 - out), y, z: cZ(s.cy) + dz * (CELL / 2 - WALL_T / 2 - out), yaw: sideYaw(s.side), nx: -dx, nz: -dz }; };
  const slab = (b, x, y, z, len, h, thick, yaw) => b.add(boxUV(new THREE.BoxGeometry(len, h, thick), len, h, thick, 2), M.stone, { x, y, z, ry: yaw });
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const b = new Batcher({ vertexColors: true, castShadow: shadows, receiveShadow: true });
    const sb = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: true }); // the soft layer: water, glow planes (never inked)
    const colls = [];
    for (let cy = j * CHUNK; cy < Math.min(H, (j + 1) * CHUNK); cy++) for (let cx = i * CHUNK; cx < Math.min(W, (i + 1) * CHUNK); cx++) {
      const c = cells[idx(cx, cy)], x0 = cx * CELL, z0 = cy * CELL, wet = !!water[idx(cx, cy)], fy = wet ? WATER_Y : 0;
      // the floor and the ceiling
      b.add(planeUV(new THREE.PlaneGeometry(CELL, CELL), CELL, CELL, 2), M.floor, { x: x0 + CELL / 2, y: fy, z: z0 + CELL / 2, rx: -Math.PI / 2 });
      if (!noCeiling.has(idx(cx, cy))) b.add(planeUV(new THREE.PlaneGeometry(CELL, CELL), CELL, CELL, 1), M.brick, { x: x0 + CELL / 2, y: WALL_H, z: z0 + CELL / 2, rx: Math.PI / 2 });
      if (wet) sb.add(new THREE.PlaneGeometry(CELL + 0.6, CELL + 0.6), M.water, { x: x0 + CELL / 2, y: -0.08, z: z0 + CELL / 2, rx: -Math.PI / 2 });
      // the walls: each edge once (a cell draws its S and E, and its N or W only on the maze's border)
      const h = WALL_H + 0.55, yMid = WALL_H / 2 - 0.2, len = CELL + WALL_T;
      if ((c & S)) slab(b, x0 + CELL / 2, yMid, z0 + CELL, len, h, WALL_T, 0);
      if ((c & E)) slab(b, x0 + CELL, yMid, z0 + CELL / 2, len, h, WALL_T, Math.PI / 2);
      if ((c & N) && cy === 0) slab(b, x0 + CELL / 2, yMid, z0, len, h, WALL_T, 0);
      if ((c & WB) && cx === 0) slab(b, x0, yMid, z0 + CELL / 2, len, h, WALL_T, Math.PI / 2);
      // a rib across the vault where a corridor runs straight on (a brick arch, chunky)
      if (!(c & N) && !(c & S) && (c & E) && (c & WB) && (cx + cy) % 2 === 0) b.add(boxUV(new THREE.BoxGeometry(CELL - 0.2, 0.3, 0.4), CELL, 0.3, 0.4, 1), M.brick, { x: x0 + CELL / 2, y: WALL_H - 0.12, z: z0 + CELL / 2 });
      if (!(c & E) && !(c & WB) && (c & N) && (c & S) && (cx + cy) % 2 === 0) b.add(boxUV(new THREE.BoxGeometry(0.4, 0.3, CELL - 0.2), 0.4, 0.3, CELL, 1), M.brick, { x: x0 + CELL / 2, y: WALL_H - 0.12, z: z0 + CELL / 2 });
    }
    const inChunk = (cx, cy) => cx >= i * CHUNK && cx < (i + 1) * CHUNK && cy >= j * CHUNK && cy < (j + 1) * CHUNK;
    // ---- the dressing in this chunk
    // a torch: a wooden handle leaning out from the wall in an iron bracket (a plate on the wall, an arm, a ring
    // round the handle and a cup under its foot), a head of pitch-soaked cloth wound round its top (charred, two bands of the
    // cloth showing), the flame on it maze-flame.js's
    for (const s of maze.torches.filter(q => inChunk(q.cx, q.cy))) {
      const p = wallSpot(s, b, 1.55, 0), along = u => torchAlong(p, u); // (u: metres along the handle from its middle)
      const parts = torchParts(p), pt = (name, k = 0) => parts.filter(q => q.part === name)[k]; // every part turned by the wall's normal
      b.add(GEO.box, IRON, { x: p.x + p.nx * 0.03, y: p.y + 0.12, z: p.z + p.nz * 0.03, sx: 0.12, sy: 0.3, sz: 0.04, ry: p.yaw });           // the plate
      for (const k of [-1, 1]) b.add(GEO.cyl6, '#4a4a52', { x: p.x + p.nx * 0.05 + p.nz * k * 0.035, y: p.y + 0.12 + 0.1 * k, z: p.z + p.nz * 0.05 - p.nx * k * 0.035, sx: 0.012, sy: 0.02, sz: 0.012, rx: Math.PI / 2, ry: p.yaw }); // its rivets
      const ring = along(-0.13), cup = along(-0.24);
      b.add(GEO.box, IRON, { x: (p.x + p.nx * 0.05 + ring.x) / 2, y: ring.y, z: (p.z + p.nz * 0.05 + ring.z) / 2, sx: 0.035, sy: 0.035, sz: Math.hypot(ring.x - p.x - p.nx * 0.05, ring.z - p.z - p.nz * 0.05) + 0.02, ry: p.yaw }); // the arm
      b.add(GEO.cyl8, IRON, pt('ring'));                                                                         // the ring
      b.add(GEO.box, IRON, { x: (p.x + p.nx * 0.05 + cup.x) / 2, y: cup.y - 0.03, z: (p.z + p.nz * 0.05 + cup.z) / 2, sx: 0.03, sy: 0.03, sz: Math.hypot(cup.x - p.x - p.nx * 0.05, cup.z - p.z - p.nz * 0.05) + 0.02, ry: p.yaw }); // the lower arm
      b.add(GEO.cone8, IRON, pt('cup'));                                                                         // the cup
      b.add(GEO.cyl8, '#2e1c10', pt('handle'));                                                                  // the handle
      b.add(TORCH_HEAD, '#150f0b', pt('head'));                                                                  // the head, charred
      b.add(GEO.cyl8, '#4a3424', pt('band', 0));                                                                 // the cloth's bands
      b.add(GEO.cyl8, '#3e2c1e', pt('band', 1));
      b.add(GEO.cyl8, '#15100c', pt('top'));                                                                     // the burnt top
      const top = along(0.4);
      torches.push({ x: p.x + p.nx * 0.6, y: p.y + 1.0, z: p.z + p.nz * 0.6, color: '#ffb060', k: 1 }); // the light a little out from the flame, so the head doesn't blow out white
      flames.push({ x: top.x, y: top.y + 0.2, z: top.z, size: 0.75, kind: 'torch', by: top.y - 0.04, fw: 0.14, fh: 0.52 });
    }
    for (const s of maze.candles.filter(q => inChunk(q.cx, q.cy))) {
      const p = wallSpot(s, b, 1.25, 0), ch = propRng(((s.cx * 7.1 + s.cy * 3.7) % 1 + 1) % 1);
      // a stone corbel out of the wall, stepped, an iron dish on it, the candle burned to its own height
      b.add(GEO.box, '#4a5366', { x: p.x + p.nx * 0.1, y: p.y - 0.02, z: p.z + p.nz * 0.1, sx: 0.24, sy: 0.06, sz: 0.2, ry: p.yaw });
      b.add(GEO.box, '#434b5d', { x: p.x + p.nx * 0.06, y: p.y - 0.1, z: p.z + p.nz * 0.06, sx: 0.18, sy: 0.1, sz: 0.12, ry: p.yaw });
      b.add(SHAPES.disc, IRON, { x: p.x + p.nx * 0.1, y: p.y + 0.016, z: p.z + p.nz * 0.1, sx: 0.07, sy: 0.012, sz: 0.07 });
      candle(b, M, p.x + p.nx * 0.1, p.y + 0.022, p.z + p.nz * 0.1, 0.1 + ch() * 0.14, 0.032 + ch() * 0.008, flames);
    }
    maze.glyphs.forEach((s, k) => { if (!inChunk(s.cx, s.cy)) return; const p = wallSpot(s, b, 1.6, 0); sb.add(new THREE.PlaneGeometry(0.9, 0.9), M.glyphs[k % 3], { x: p.x + p.nx * 0.025, y: p.y, z: p.z + p.nz * 0.025, ry: p.yaw }); });
    for (const s of maze.signs.filter(q => inChunk(q.cx, q.cy))) { const p = wallSpot(s, b, 1.45, 0); sb.add(new THREE.PlaneGeometry(0.6, 0.6), M.sign, { x: p.x + p.nx * 0.02, y: p.y, z: p.z + p.nz * 0.02, ry: p.yaw }); }
    for (const s of maze.niches.filter(q => inChunk(q.cx, q.cy))) {
      const p = wallSpot(s, b, 1.1, 0), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      // cut into the stone: the dark recess framed by jambs and a lintel standing proud of the wall, a sill under it, a corbel under
      // the sill, dust and a stray bone on it
      const W2 = (o, col, x, y, sx, sy, sz) => b.add(GEO.box, col, { x: p.x + p.nx * o + rx * x, y: p.y + y, z: p.z + p.nz * o + rz * x, sx, sy, sz, ry: p.yaw });
      W2(0.012, '#07080c', 0, 0.42, 1.05, 0.8, 0.024);                            // the recess, black at the back
      for (const k of [-1, 1]) { W2(0.07, '#3f4454', k * 0.6, 0.445, 0.16, 0.95, 0.14); W2(0.072, '#353a49', k * 0.52, 0.44, 0.012, 0.86, 0.144); } // (the jambs' feet a centimetre up inside the sill: level with its underside, past the corbel, they flickered)
      W2(0.08, '#454c5e', 0, 0.9, 1.38, 0.16, 0.16);                              // the lintel
      W2(0.07, '#2c303c', 0, 0.81, 1.06, 0.02, 0.12);                             // its shadow on the recess, hanging just under it (inside it, the two bottoms flickered)
      b.add(GEO.box, '#4a5366', { x: p.x + p.nx * 0.17, y: p.y, z: p.z + p.nz * 0.17, sx: 1.25, sy: 0.08, sz: 0.34, ry: p.yaw });
      W2(0.09, '#3f4454', 0, -0.1, 0.8, 0.12, 0.18);                              // the corbel under the sill
      b.add(GEO.ico1, '#3c3a34', { x: p.x + p.nx * 0.18 + rx * 0.45, y: p.y + 0.045, z: p.z + p.nz * 0.18 + rz * 0.45, sx: 0.12, sy: 0.008, sz: 0.1 }); // dust in a corner
      bone(b, p.x + p.nx * 0.27 - rx * 0.48, p.y + 0.066, p.z + p.nz * 0.27 - rz * 0.48, p.yaw + 0.4, 0.26, 0, '#bfb08e');
      for (const k of [-1, 0, 1]) skull(b, p.x + p.nx * 0.18 + rx * k * 0.32, p.y + 0.04, p.z + p.nz * 0.18 + rz * k * 0.32, p.yaw + Math.PI + k * 0.25); // (the scenery pass: they had been looking into the wall)
    }
    for (const s of maze.roots.filter(q => inChunk(q.cx, q.cy))) {
      const x = cX(s.cx) + (s.r - 0.5) * 2.2, z = cZ(s.cy) + ((s.r * 7) % 1 - 0.5) * 2.2;
      b.add(GEO.ico1, ROOT, { x, y: WALL_H - 0.05, z, sx: 0.4, sy: 0.18, sz: 0.4 });
      // mould spreading on the vault round where they broke through, and the floor under them dark with the drip
      for (let k = 0; k < 4; k++) { const a = s.r * 9 + k * 1.7, d = 0.35 + ((s.r * 17 + k * 0.37) % 1) * 0.4; b.add(GEO.ico1, k % 2 ? '#2f3a2c' : '#3a4634', { x: x + Math.cos(a) * d, y: WALL_H - 0.01, z: z + Math.sin(a) * d, sx: 0.18 + k * 0.04, sy: 0.02, sz: 0.14 + k * 0.03 }); }
      blob(b, x + 0.05, 0, z - 0.04, 0.55, 0.42, s.r * 6);
      for (let k = 0; k < 3; k++) { const a = s.r * 6 + k * 2.1, l = 0.8 + ((s.r * 13 + k) % 1) * 0.9; b.add(GEO.cone6, ROOT, { x: x + Math.cos(a) * 0.15, y: WALL_H - l / 2, z: z + Math.sin(a) * 0.15, sx: 0.07 + k * 0.03, sy: l, sz: 0.07 + k * 0.03, rx: Math.PI + Math.cos(a) * 0.25, rz: Math.sin(a) * 0.25 }); }
    }
    // the gates (maze-props.js): the stone they're set in always, the posts and the leaf only with `gates` (otherwise maze-gates.js
    // draws those, with the same gateLeaf / gatePosts, so they can shake and fall)
    for (const g of maze.gates.filter(q => inChunk(q.cx, q.cy))) {
      const [dx, dz] = sideDir(g.dir), h = gateRng(g), P = new Prop('gate');
      gateStone(P, h); if (gates) { gateLeaf(P, h); gatePosts(P); }
      P.at(cX(g.cx) + dx * CELL / 2, 0, cZ(g.cy) + dz * CELL / 2, sideYaw(g.dir)); P.commit(b);
    }
    if (maze.lean && inChunk(maze.lean.cx, maze.lean.cy)) {
      const s = maze.lean, [dx, dz] = sideDir(s.side), yaw = sideYaw(s.side), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const x = cX(s.cx) + dx * CELL / 2, z = cZ(s.cy) + dz * CELL / 2, tilt = 0.14;
      // one Prop, settled: its feet on the floor (a tilted box's corner went through it). Hinges and a split
      const F = new Prop('lean');
      for (const k of [-1, 1]) F.add(GEO.box, k < 0 ? WOOD : '#45301f', { x: k * 1.45 + tilt * 1.4, y: 1.45, sx: 0.24, sy: 2.9, sz: 0.3, rz: -tilt });
      F.add(GEO.box, WOOD, { x: tilt * 2.8, y: 2.95, sx: 3.3, sy: 0.3, sz: 0.34, rz: -tilt });
      for (const y of [0.6, 2.2]) { F.add(GEO.box, '#2a2a30', { x: -1.45 + tilt * (y - 1.45) + 0.13, y, sx: 0.06, sy: 0.12, sz: 0.32, rz: -tilt }); F.add(GEO.box, '#3a2a24', { x: -1.45 + tilt * (y - 1.45) + 0.3, y: y - 0.02, sx: 0.32, sy: 0.05, sz: 0.04, rz: -tilt }); }
      F.add(GEO.box, '#1a120c', { x: 1.45 + tilt * 0.4, y: 1.8, sx: 0.02, sy: 0.9, sz: 0.31, rz: -tilt }); // a split down one post
      F.at(x, 0, z, yaw); propsBuilt.push({ ...F.commit(b, { settle: 0 }), x, z, floor: 0, onFloor: true });
    }
    // (the scenery pass) cobwebs strung across the tops of corners: about one corridor corner in six, never in a room
    for (let cy = j * CHUNK; cy < Math.min(H, (j + 1) * CHUNK); cy++) for (let cx = i * CHUNK; cx < Math.min(W, (i + 1) * CHUNK); cx++) {
      if (roomAt(cx, cy) || (cx * 31 + cy * 17) % 6 !== 0) continue;
      const c = cells[idx(cx, cy)];
      for (const [a, bb, sx, sz] of [[N, E, 1, -1], [E, S, 1, 1], [S, WB, -1, 1], [WB, N, -1, -1]]) {
        if (!(c & a) || !(c & bb)) continue;
        const kx = cX(cx) + sx * (CELL / 2 - WALL_T / 2 - 0.3), kz = cZ(cy) + sz * (CELL / 2 - WALL_T / 2 - 0.3);
        sb.add(new THREE.PlaneGeometry(1.8, 1.8), M.web, { x: kx, y: WALL_H - 0.62, z: kz, ry: Math.atan2(-sx, -sz), rx: -0.35 });
        break;
      }
    }
    // scratched arrows: somebody marked the way before you (every so often, pointing the way the path shortens)
    for (let cy = j * CHUNK; cy < Math.min(H, (j + 1) * CHUNK); cy++) for (let cx = i * CHUNK; cx < Math.min(W, (i + 1) * CHUNK); cx++) {
      if ((cx * 7 + cy * 13) % 23 !== 0 || roomAt(cx, cy) || dist[idx(cx, cy)] < 6) continue;
      const c = cells[idx(cx, cy)];
      let best = -1, bd = dist[idx(cx, cy)];
      for (let d = 0; d < 4; d++) { if (c & DIRS[d][2]) continue; const v = dist[idx(cx + DIRS[d][0], cy + DIRS[d][1])]; if (v < bd) { bd = v; best = d; } }
      if (best < 0) continue;
      const side = [0, 1, 2, 3].find(s => (c & DIRS[s][2]) && s !== best && (s + 2) % 4 !== best);
      if (side === undefined) continue;
      const p = wallSpot({ cx, cy, side }, b, 1.5, 0);
      // the arrow's +x points along the wall; turn it to point the way (left or right along the face)
      const [bx, bz] = sideDir(best), rxw = Math.cos(p.yaw), rzw = -Math.sin(p.yaw), along = bx * rxw + bz * rzw;
      sb.add(new THREE.PlaneGeometry(0.6, 0.6), M.arrow, { x: p.x + p.nx * 0.02, y: p.y, z: p.z + p.nz * 0.02, ry: p.yaw + (along > 0 ? Math.PI : 0) });
    }
    // the floor dark and damp where it meets the water: a few dark flat pools along each open edge onto a flooded cell
    for (let cy = j * CHUNK; cy < Math.min(H, (j + 1) * CHUNK); cy++) for (let cx = i * CHUNK; cx < Math.min(W, (i + 1) * CHUNK); cx++) {
      if (water[idx(cx, cy)]) continue;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !water[idx(nx, ny)] || (cells[idx(cx, cy)] & DIRS[d][2])) continue;
        const [ox, oz] = sideDir(d), ax = -oz, az = ox;
        for (let k = -1; k <= 1; k++) b.add(SHAPES.disc, k ? '#0f1218' : '#0b0e13', { x: cX(cx) + ox * (CELL / 2 - 0.35) + ax * k * 1.1, y: 0.004 + Math.abs(k) * 0.01, z: cZ(cy) + oz * (CELL / 2 - 0.35) + az * k * 1.1, sx: Math.abs(ox) * 0.6 + Math.abs(ax) * 0.95, sy: 0.002, sz: Math.abs(oz) * 0.6 + Math.abs(az) * 0.95 }); // (the outer pools a centimetre over the middle one where they overlap: a millimetre apart they flickered)
      }
    }
    // ---- the rooms whose middle is in this chunk
    for (const r of maze.rooms) {
      const mx = (r.x0 + r.x1 + 1) * CELL / 2, mz = (r.y0 + r.y1 + 1) * CELL / 2, mcx = Math.floor(mx / CELL), mcy = Math.floor(mz / CELL);
      if (!inChunk(Math.min(mcx, W - 1), Math.min(mcy, H - 1))) continue;
      const rw = (r.x1 - r.x0 + 1) * CELL, rd = (r.y1 - r.y0 + 1) * CELL, x0 = r.x0 * CELL, z0 = r.y0 * CELL;
      const coll = (minX, minZ, maxX, maxZ) => { for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) box(x, y, minX, minZ, maxX, maxZ, { furniture: true }); };
      for (const f of maze.furniture || []) if (f.room === r.kind) coll(f.minX, f.minZ, f.maxX, f.maxZ); // maze-gen.js furniture(): the ghoul goes round the same boxes
      if (r.kind === 'crypt') {
        for (let k = 0; k < 3; k++) {
          const x = x0 + rw / 2 + (k - 1) * 2.6, z = z0 + rd / 2;
          b.add(GEO.box, '#5e6577', { x, y: 0.5, z, sx: 1.0, sy: 0.8, sz: 2.2 });                            // the box, one block of stone
          for (const e of [-1, 1]) for (const q of [-0.45, 0.45]) b.add(GEO.box, '#4e5466', { x: x + e * 0.505, y: 0.5, z: z + q, sx: 0.02, sy: 0.46, sz: 0.62 }); // (the scenery pass) carved panels down each side
          b.add(GEO.box, '#454b5c', { x, y: 0.06, z, sx: 1.12, sy: 0.12, sz: 2.32 });                       // the plinth
          for (const e of [-1, 1]) b.add(GEO.box, '#6a7183', { x, y: 0.5, z: z + e * 0.7, sx: 1.04, sy: 0.08, sz: 0.08 }); // carved bands
          const ly = k === 1 ? 0.12 : 0;
          b.add(GEO.box, '#747b8c', { x, y: 0.97, z: z + 0.1, sx: 1.1, sy: 0.14, sz: 2.3, ry: ly });                 // the lid (one pushed askew)
          b.add(GEO.box, '#808799', { x, y: 1.07, z: z + 0.1, sx: 0.5, sy: 0.07, sz: 1.7, ry: ly });                  // its raised band
          b.add(GEO.box, '#3f4454', { x, y: 0.5, z: z - 1.11, sx: 0.5, sy: 0.4, sz: 0.04 });
          if (k === 1) { b.add(GEO.box, '#050608', { x: x - 0.32, y: 0.91, z: z + 0.15, sx: 0.28, sy: 0.02, sz: 1.9 }); skull(b, x - 0.3, 0.9, z - 0.7, 2.6, 0.9); } // the gap the askew lid leaves, and who looks out
          // age: a crack across the lid, a corner knocked off the plinth, grit and chips at its foot, its shadow
          b.add(GEO.box, '#2a2e3a', { x: x + 0.1, y: 1.042, z: z + 0.5 + k * 0.1, sx: 0.9, sy: 0.006, sz: 0.018, ry: 0.5 - k * 0.3 });
          b.add(GEO.box, '#2e3240', { x: x + 0.5, y: 0.1, z: z - 1.1, sx: 0.14, sy: 0.08, sz: 0.14 });
          for (let q = 0; q < 4; q++) b.add(GEO.ico0, '#4e5466', { x: x + 0.62 + q * 0.05, y: 0.02, z: z - 1.0 + q * 0.13 + k * 0.1, sx: 0.04, sy: 0.025, sz: 0.035, ry: q });
          blob(b, x, 0, z + 0.05, 0.75, 1.32);
        }
        skull(b, x0 + 1.2, 0, z0 + 1.0, 0.8, 1.1);
      } else if (r.kind === 'ossuary') {
        for (const [side, n] of [[0, rw], [2, rw], [1, rd], [3, rd]]) {
          const [dx, dz] = sideDir(side), yaw = sideYaw(side), rx = Math.cos(yaw), rz = -Math.sin(yaw);
          const fx = x0 + rw / 2 + dx * (rw / 2 - WALL_T / 2 - 0.2), fz = z0 + rd / 2 + dz * (rd / 2 - WALL_T / 2 - 0.2);
          for (let u = -(n / 2 - 0.9); u <= n / 2 - 0.9 + 1e-6; u += (n - 1.8) / Math.max(1, Math.round((n - 1.8) / 1.6))) for (const y of [0.5, 1.0, 1.5]) b.add(GEO.box, '#3f4454', { x: fx + rx * u - dx * 0.06, y: y - 0.14, z: fz + rz * u - dz * 0.06, sx: 0.12, sy: 0.12, sz: 0.22, ry: yaw }); // corbels under the shelves
          for (const y of [0.5, 1.0, 1.5]) { b.add(GEO.box, '#4a5366', { x: fx, y: y - 0.05, z: fz, sx: n - 1.2, sy: 0.07, sz: 0.36, ry: yaw }); for (let k = -(n / 2 - 0.9); k <= n / 2 - 0.9; k += 0.36) skull(b, fx + rx * k, y, fz + rz * k, yaw + ((k * 7) % 1) * 0.5 - 0.25); }
        }
        for (let k = 0; k < 2; k++) { // (the scenery pass) two heaps of long bones and skulls
          const hx = x0 + rw / 2 + (k ? 1 : -1), hz = z0 + rd / 2;
          b.add(GEO.ico1, '#3a3428', { x: hx, y: 0.04, z: hz, sx: 0.7, sy: 0.08, sz: 0.6 }); // (the dust and fragments under it)
          for (let q = 0; q < 14; q++) { const a = q * 2.399 + k, rr = 0.12 + (q % 5) * 0.09, lay = Math.floor(q / 5); bone(b, hx + Math.cos(a) * rr, 0.05 + lay * 0.05, hz + Math.sin(a) * rr * 0.8, a * 1.7, 0.36 + (q % 3) * 0.08, (q % 4 - 1.5) * 0.12, q % 3 ? BONE : '#c2b593'); }
          for (let q = 0; q < 3; q++) skull(b, hx + (q - 1) * 0.22, 0.12 + (q === 1 ? 0.07 : 0), hz + (q % 2 ? 0.12 : -0.1), 0.6 + q * 1.9);
        }
      } else if (r.kind === 'cistern') {
        for (const [kx, kz] of [[0.33, 0.5], [0.67, 0.5]]) { const x = x0 + rw * kx, z = z0 + rd * kz; b.add(boxUV(new THREE.BoxGeometry(1.0, WALL_H + 0.8, 1.0), 1, WALL_H, 1, 2), M.stone, { x, y: WALL_H / 2 - 0.4, z }); b.add(GEO.box, '#3f4454', { x, y: WALL_H - 0.3, z, sx: 1.4, sy: 0.3, sz: 1.4 }); }
        torches.push({ x: x0 + rw / 2, y: 2.2, z: z0 + rd / 2, color: '#5f93b0', k: 1.3 }); // a cold glow off the water
      } else if (r.kind === 'ritual') {
        const x = x0 + rw / 2, z = z0 + rd / 2;
        sb.add(new THREE.PlaneGeometry(5.2, 5.2), M.sigil, { x, y: 0.015, z, rx: -Math.PI / 2 });
        b.add(GEO.box, '#3a3f50', { x, y: 0.45, z, sx: 1.4, sy: 0.9, sz: 0.8 }); b.add(GEO.box, '#2b2f3c', { x, y: 0.95, z, sx: 1.6, sy: 0.1, sz: 1.0 });
        skull(b, x - 0.3, 1.0, z, 0.3); b.add(GEO.cyl8, '#8a1e2a', { x: x + 0.35, y: 1.08, z: z + 0.1, sx: 0.14, sy: 0.16, sz: 0.14 });
        // a plinth under it, panels cut in its long faces, dark stains run down them from the top, old candle stubs
        // in pools of their own wax along the back, a cup
        b.add(GEO.box, '#30343f', { x, y: 0.05, z, sx: 1.6, sy: 0.1, sz: 1.0 });
        for (const f of [-1, 1]) { b.add(GEO.box, '#323745', { x, y: 0.5, z: z + f * 0.402, sx: 1.1, sy: 0.6, sz: 0.01 }); b.add(GEO.box, '#2a1216', { x: x + 0.2 * f, y: 0.72, z: z + f * 0.406, sx: 0.06, sy: 0.36, sz: 0.006 }); b.add(GEO.box, '#2a1216', { x: x - 0.1 * f, y: 0.8, z: z + f * 0.406, sx: 0.035, sy: 0.22, sz: 0.006 }); }
        for (const u of [-0.6, -0.42, 0.55]) { b.add(SHAPES.disc, '#d4c7a4', { x: x + u, y: 1.003, z: z - 0.38, sx: 0.06, sy: 0.004, sz: 0.05 }); b.add(GEO.cyl8, '#e6dcc2', { x: x + u, y: 1.02, z: z - 0.38, sx: 0.025, sy: 0.04 + (u + 1) * 0.03, sz: 0.025 }); b.add(GEO.sphere, '#e6dcc2', { x: x + u, y: 0.97, z: z - 0.5, sx: 0.012, sy: 0.04, sz: 0.008 }); }
        b.add(GEO.cyl8, '#6a5a3a', { x: x + 0.05, y: 1.01, z: z + 0.25, sx: 0.035, sy: 0.02, sz: 0.035 }); b.add(GEO.cyl8, '#6a5a3a', { x: x + 0.05, y: 1.05, z: z + 0.25, sx: 0.012, sy: 0.07, sz: 0.012 }); b.add(GEO.cone8, '#6a5a3a', { x: x + 0.05, y: 1.11, z: z + 0.25, sx: 0.045, sy: 0.07, sz: 0.045, rx: Math.PI });
        blob(b, x, 0, z, 0.95, 0.65);
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, cx2 = x + Math.cos(a) * 2.9, cz2 = z + Math.sin(a) * 2.9; b.add(GEO.cyl8, '#3a3f50', { x: cx2, y: 0.03, z: cz2, sx: 0.1, sy: 0.06, sz: 0.1 }); candle(b, M, cx2, 0.06, cz2, 0.14 + ((k * 0.37) % 1) * 0.2, 0.05, flames); } // on stone bases, burned down unevenly
        torches.push({ x, y: 1.4, z, color: '#7fd6a6', k: 0.9 }); // the sigil's glow
      } else if (r.kind === 'library') {
        // the same places and boxes (maze-gen.js furniture()): bookcases of boards with their books in, each shelf
        // uneven (widths, heights, gaps where some were taken, one leaning into a gap, a few lying in a stack); the two fallen ones
        // on their backs, one end up on the books they spilled; the lectern on its side; the books about the floor, some open
        const lh = propRng(((r.x0 * 0.1234 + r.y0 * 0.4321) % 1 + 1) % 1);
        for (let k = 0; k < 4; k++) {
          const standing = k % 2 === 0, x = x0 + 0.9 + (k % 2) * (rw - 1.8), z = z0 + rd * (0.3 + 0.4 * (k >> 1)), west = x < x0 + rw / 2;
          const P = new Prop(standing ? 'bookcase' : 'fallen-case');
          if (standing) { bookcase(P, lh, 2.4, 0.45, 2.2, 0.86); P.at(x, 0, z, west ? Math.PI / 2 : -Math.PI / 2); }
          else {
            bookcase(P, lh, 2.4, 0.45, 2.15, 0.3);
            // the case lying on its back, its head toward the room's middle and propped a little: its height along x, its length along z
            P.at(x, 0, z, 0, 0, west ? -0.18 : 0.18); // on its furniture box, x +- 1.2
            P.frame.multiply(new THREE.Matrix4().set(0, west ? 1 : -1, 0, 0, 0, 0, 1, 0, west ? 1 : -1, 0, 0, 0, 0, 0, 0, 1).multiply(new THREE.Matrix4().makeTranslation(0, -1.075, 0)));
          }
          propsBuilt.push({ ...P.commit(b, { settle: 0 }), x, z, floor: 0, onFloor: true });
          blob(b, x, 0, z, standing ? 0.32 : 1.15, 1.3);
        }
        for (let k = 0; k < 9; k++) { const P = new Prop('book'), col = PC.books[k % PC.books.length]; if (k % 3 === 0) { for (const sd of [-1, 1]) P.rest(GEO.box, col, { x: sd * 0.085, sx: 0.16, sy: 0.016, sz: 0.23, rz: sd * 0.14 }); } else P.rest(GEO.box, col, { sx: 0.17 + (k % 2) * 0.05, sy: 0.04 + (k % 3) * 0.015, sz: 0.24 }); P.at(x0 + 1.5 + (k * 2.3) % (rw - 3), 0, z0 + 1.2 + (k * 1.7) % (rd - 2.4), k * 0.8); propsBuilt.push({ ...P.commit(b, { settle: 0 }), floor: 0, onFloor: true }); }
        { const P = new Prop('lectern'); lectern(P, lh); P.at(x0 + rw / 2 - 0.45, 0.28, z0 + rd / 2, 0.15, 0, -Math.PI / 2); propsBuilt.push({ ...P.commit(b, { settle: 0 }), floor: 0, onFloor: true }); } // a reading stand, toppled over
      }
    }
    if (props) {
      const hasVC = [...b.groups.keys()].some(m => m.vertexColors);
      for (const p of maze.props || []) {
        if (!inChunk(p.cx, p.cy)) continue;
        if (!hasVC) { propsSkipped.push(p); continue; } // (no new draw call for a chunk without the vertex-coloured mesh)
        const rec = buildProp(b, p, water[idx(p.cx, p.cy)] ? WATER_Y : 0, { skull, bone, BONE });
        if (rec) propsBuilt.push(rec);
        if (p.box && !p.room) box(p.cx, p.cy, p.box.minX, p.box.minZ, p.box.maxX, p.box.maxZ, { prop: true }); // (in a room the furniture list did it)
      }
    }
    const meshes = [...b.build(parent, `maze-chunk-${i}-${j}`), ...sb.build(parent, `maze-soft-${i}-${j}`).map(m => softLayer(m))];
    for (const m of meshes) { m.visible = false; m.frustumCulled = true; }
    chunks.push({ i, j, meshes, colls });
  }

  // ---- the stair down: a helix of narrow treads round a stone column inside a round shaft, from the hall's door down to the start room
  const sr = maze.startRoom, scx = (sr.x0 + sr.x1 + 1) * CELL / 2, scz = (sr.y0 + sr.y1 + 1) * CELL / 2;
  const stair = buildHelix(parent, M, scx, scz, shadows);
  for (let y = sr.y0; y <= sr.y1; y++) for (let x = sr.x0; x <= sr.x1; x++) cellBoxes[idx(x, y)].push({ circle: true, x: scx, z: scz, r: STAIR.rIn + 0.05 });
  // ---- the stair up: a straight flight up the middle of the exit room, its foot toward the doorway the path comes in by,
  // rising through the room (a tall chamber) to an open arched door in the far wall, the garden beyond it
  const er = maze.exitRoom;
  const exitStair = buildFlight(parent, M, maze, shadows);
  for (const bx of exitStair.boxes) for (let y = er.y0; y <= er.y1; y++) for (let x = er.x0; x <= er.x1; x++) cellBoxes[idx(x, y)].push(bx);
  // the brick vault over the two stair rooms too, so nowhere has no ceiling, with a hole only
  // where the stair goes up: round the helix's shaft (its shell rises past the vault) and over the exit flight (its walls do)
  {
    const cb = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: true });
    const roof = (r, hole, y = WALL_H) => {
      const sh = new THREE.Shape();
      sh.moveTo(r.x0 * CELL, r.y0 * CELL); sh.lineTo((r.x1 + 1) * CELL, r.y0 * CELL); sh.lineTo((r.x1 + 1) * CELL, (r.y1 + 1) * CELL); sh.lineTo(r.x0 * CELL, (r.y1 + 1) * CELL); sh.closePath();
      if (hole) sh.holes.push(hole);
      cb.add(new THREE.ShapeGeometry(sh, 24), M.brick, { y, rx: Math.PI / 2 }); // (ShapeGeometry's UVs are its metres: one brick tile a metre, as the cells' vault)
    };
    const ring = new THREE.Path(); ring.absarc(scx, scz, STAIR.rOut + 0.55, 0, Math.PI * 2, true); roof(sr, ring);
    roof(er, null, EXIT.hall); // the exit room is a tall chamber the flight climbs inside, its vault high over the door
    stair.meshes.push(...cb.build(parent, 'maze-room-vaults'));
  }
  // daylight down the flight (the pale shaft is maze-fx.js): the stone lit pale at the top by the door, a warmer grey glow half way
  // down
  for (const t of exitStair.lights) torches.push(t);

  // ---- which chunks draw: those holding a cell within a few cells' walk of you (walls hide the rest; the fog hides what is far)
  const shown = new Set();
  const seen = new Int32Array(W * H).fill(-1); let stamp = 0; const q = new Int32Array(W * H);
  function setVisible(px, pz) {
    syncBump();
    const pcx = Math.max(0, Math.min(W - 1, Math.floor(px / CELL))), pcy = Math.max(0, Math.min(H - 1, Math.floor(pz / CELL)));
    stamp++;
    let head = 0, tail = 0; q[tail++] = idx(pcx, pcy); seen[q[0]] = stamp;
    const depth = new Map(); depth.set(q[0], 0);
    const want = new Set();
    while (head < tail) {
      const c = q[head++], x = c % W, y = (c - x) / W, d = depth.get(c);
      want.add(Math.floor(x / CHUNK) + Math.floor(y / CHUNK) * cw);
      if (d >= 4) continue;
      for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const n = idx(x + DIRS[k][0], y + DIRS[k][1]); if (seen[n] !== stamp) { seen[n] = stamp; depth.set(n, d + 1); q[tail++] = n; } }
    }
    // (a neighbouring chunk's walls are what you see through an opening on the chunk's edge: keep the 3 x 3 round you too)
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ci = Math.floor(pcx / CHUNK) + di, cj = Math.floor(pcy / CHUNK) + dj; if (ci >= 0 && cj >= 0 && ci < cw && cj < ch && (Math.abs(di) + Math.abs(dj) < 2)) want.add(ci + cj * cw); }
    for (const k of shown) if (!want.has(k)) { for (const m of chunks[k].meshes) m.visible = false; shown.delete(k); }
    for (const k of want) if (!shown.has(k)) { for (const m of chunks[k].meshes) m.visible = true; shown.add(k); }
    exitStair.setNear(Math.hypot(px - exitStair.room.x, pz - exitStair.room.z) < 16); // the garden past the door only near the exit room
    return shown.size;
  }
  function dispose() {
    for (const c of chunks) for (const m of c.meshes) { m.geometry.dispose(); m.parent?.remove(m); }
    for (const m of [...stair.meshes, ...exitStair.meshes]) { m.geometry.dispose(); m.parent?.remove(m); }
    exitStair.group.parent?.remove(exitStair.group); for (const m of exitStair.outside) m.material.dispose();
    for (const m of Object.values(M)) {
      if (m?.isMaterial) { const R = m.userData.relief; if (R) for (const t of [R.map, R.map.userData.bump, R.map.userData.flat, R.legacy, R.legacyMap]) t?.dispose(); m.map?.dispose(); m.dispose(); }
      else if (Array.isArray(m)) for (const q2 of m) { q2.map?.dispose(); q2.dispose(); }
    }
  }
  return {
    chunks, cellBoxes, torches, flames, stair, exitStair, M, setVisible, dispose, get shown() { return shown.size; },
    // for the tests: the bump in use and a forced mode ('near' | 'off' | 'legacy'; null follows the level again)
    props: propsBuilt, propsSkipped, // each prop's world bounds in the maze's frame, for the tests
    get bump() { return { mode: M.bumpMode, forced: bumpForced, phone, near: BUMP_U.uMzBumpNear.value, far: BUMP_U.uMzBumpFar.value, maps: ['stone', 'brick', 'floor'].map(k => !!M[k].bumpMap) }; },
    setBump(mode) { bumpForced = mode || null; syncBump(); },
  };
}

// the helix down (STAIR): treads round a column in a shaft, the landing at the top with the door you came through behind you, a
// candle on the column by the landing; the shaft opens at the bottom into the start room. floorAt(turn) gives the tread's top for
// an unwound angle (0 at the landing's end, growing as you go down); the scene tracks the angle.
function buildHelix(parent, M, cx, cz, shadows) {
  const b = new Batcher({ vertexColors: true, castShadow: shadows, receiveShadow: true });
  const { r, rIn, rOut, steps, rise, turns, top } = STAIR;
  const da = turns * Math.PI * 2 / steps, a0 = 0;                 // the angle grows clockwise (seen from above) as you descend
  const at = (u, rad) => [cx + Math.sin(a0 + u) * rad, cz + Math.cos(a0 + u) * rad];
  // the column (the whole height) and the treads
  b.add(boxUV(new THREE.BoxGeometry(rIn * 1.6, top + 3.2, rIn * 1.6), rIn * 1.6, top + 3.2, rIn * 1.6, 2), M.stone, { x: cx, y: top / 2 + 0.6, z: cz, ry: 0.4 });
  b.add(new THREE.CylinderGeometry(rIn, rIn, top + 3.23, 10), '#4a5366', { x: cx, y: top / 2 + 0.615, z: cz }); // (3 cm taller than the square column: their tops were level and flickered)
  for (let i = 0; i < steps; i++) {
    const u = (i + 0.5) * da, y = top - (i + 1) * rise, [x, z] = at(u, r);
    const tread = new THREE.BoxGeometry(rOut - rIn + 0.1, rise, 0.62);
    if (i < steps - 1) b.add(boxUV(tread, rOut - rIn, rise, 0.62, 1), M.stone, { x, y: y - rise / 2, z, ry: a0 + u + Math.PI / 2 }); // (the last tread's top is the room's floor: drawn too, it flickered against it)
    if (i % 3 === 1) b.add(GEO.box, '#4a5366', { x: cx + Math.sin(a0 + u) * (rOut - 0.1), y: y + 0.9, z: cz + Math.cos(a0 + u) * (rOut - 0.1), sx: 0.1, sy: 0.08, sz: 0.5, ry: a0 + u }); // an iron handrail stub
  }
  // the landing at the top (a flat platform before the first tread), the shut door behind it, and the candle on its bracket
  const landU = -0.55, [lx, lz] = at(landU, r);
  b.add(boxUV(new THREE.BoxGeometry(rOut - rIn + 0.1, rise, 1.9), rOut - rIn, rise, 1.9, 1), M.stone, { x: lx, y: top - rise / 2, z: lz, ry: a0 + landU + Math.PI / 2 });
  const [dx, dz] = at(landU - 0.42, rOut - 0.3), doorYaw = a0 + landU - 0.42; // the door stands in the shell wall behind the landing, facing in
  b.add(GEO.box, '#5a3424', { x: dx, y: top + 1.25, z: dz, sx: 1.3, sy: 2.5, sz: 0.1, ry: doorYaw });
  for (const [px, py] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, 1.8], [0.3, 1.8]]) b.add(GEO.box, '#6e4430', { x: dx + Math.cos(doorYaw) * px - Math.sin(doorYaw) * 0.06, y: top + py, z: dz - Math.sin(doorYaw) * px - Math.cos(doorYaw) * 0.06, sx: 0.42, sy: 0.75, sz: 0.03, ry: doorYaw });
  b.add(GEO.sphere, '#c9a24a', { x: dx + Math.cos(doorYaw) * 0.5 - Math.sin(doorYaw) * 0.08, y: top + 1.05, z: dz - Math.sin(doorYaw) * 0.5 - Math.cos(doorYaw) * 0.08, sx: 0.045, sy: 0.045, sz: 0.045 });
  const [kx, kz] = at(landU + 0.1, rIn + 0.12);
  b.add(GEO.box, '#3a3226', { x: kx, y: top + 1.3, z: kz, sx: 0.2, sy: 0.04, sz: 0.2 });
  candle(b, M, kx, top + 1.32, kz, 0.22, 0.04);
  const candleAt = { x: kx, y: top + 1.65, z: kz, by: top + 1.32 + 0.226, fw: 0.028, fh: 0.095 }; // the flame's foot and size
  // the shaft: slabs round the outside (a gap of three at the bottom, where you step out into the room), a cap over the top
  const nSeg = 18, segW = Math.PI * 2 * rOut / nSeg + 0.12, bottomU = steps * da, gapMid = bottomU + 0.35;
  for (let k = 0; k < nSeg; k++) {
    const a = (k + 0.5) * Math.PI * 2 / nSeg, d = Math.atan2(Math.sin(a - (a0 + gapMid)), Math.cos(a - (a0 + gapMid)));
    const x = cx + Math.sin(a) * (rOut + 0.3), z = cz + Math.cos(a) * (rOut + 0.3);
    if (Math.abs(d) < 0.62) { b.add(boxUV(new THREE.BoxGeometry(segW, top - 2.2, 0.6), segW, top - 2.2, 0.6, 2), M.stone, { x, y: 3.2 + (top - 2.2) / 2 - 0.2, z, ry: a }); continue; } // over the opening the shell goes on up
    b.add(boxUV(new THREE.BoxGeometry(segW, top + 3.4, 0.6), segW, top + 3.4, 0.6, 2), M.stone, { x, y: top / 2 + 0.9, z, ry: a });
  }
  b.add(new THREE.CylinderGeometry(rOut + 0.7, rOut + 0.7, 0.4, 18), '#2b3140', { x: cx, y: top + 2.8, z: cz });
  const meshes = b.build(parent, 'maze-stair');
  // where you arrive: stepped in off the landing's end (the door in the shaft wall had been at your back, 0.7 m off)
  // into the middle of the tread's width, looking along the curve and down the first treads
  const su = landU + 0.25, [sx, sz] = at(su, (rIn + rOut) / 2);
  return {
    meshes, cx, cz, a0, da, top, rise, steps, rOut, rIn, candle: candleAt, landU, gapMid, bottomU,
    spawn: { x: sx, z: sz, yaw: a0 + su + Math.PI / 2 + 0.45, pitch: 0.25, u: su }, // on the landing, looking down the first treads
    doorSpot: { x: dx, z: dz },
    // the tread's top under an unwound angle u (the landing before 0, the room floor past the last tread)
    floorAt(u) { if (u < 0) return top; const i = Math.floor(u / da); return i >= steps ? 0 : top - (i + 1) * rise; },
  };
}

// ---- the flight up (EXIT): the goal is a real stairway you have to get to, never a vanish-and-reappear. The exit room is a tall
// chamber (its vault at EXIT.hall): a stone stair climbs up its middle, the foot toward the doorway the path from the start comes
// in by, a low stepped parapet each side, to a landing against the far wall and an old arched door in that wall thrown open on the
// garden: the frame, the open leaf, the threshold, and past it a painted set (grass, a hedge, trees, clouds, the sky), unlit and
// outside the fog, so the doorway glows from across the room. Built in the flight's own frame (u up the flight from the foot, v
// across it, y up) in a group turned to face the way up. The colliders, the treads' heights and the threshold are answered in the
// maze's frame.
// the doorway into the exit room the path from the start comes in by: { dx, dy } out of the room (the flight rises away from it)
function mainEntrance(maze) {
  const { W, H, cells, exitRoom: r } = maze;
  const d0 = new Int32Array(W * H).fill(-1), q = [maze.start.cy * W + maze.start.cx]; d0[q[0]] = 0;
  for (let i = 0; i < q.length; i++) { const c = q[i], x = c % W, y = (c - x) / W; for (const [dx, dy, bit] of DIRS) { if (cells[c] & bit) continue; const n = (y + dy) * W + x + dx; if (d0[n] < 0) { d0[n] = d0[c] + 1; q.push(n); } } }
  let best = null;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) for (const [dx, dy, bit] of DIRS) {
    const ox = x + dx, oy = y + dy;
    if ((ox >= r.x0 && ox <= r.x1 && oy >= r.y0 && oy <= r.y1) || (cells[y * W + x] & bit) || ox < 0 || oy < 0 || ox >= W || oy >= H) continue;
    const d = d0[oy * W + ox]; if (d >= 0 && (!best || d < best.d)) best = { d, dx, dy };
  }
  return best || { dx: -1, dy: 0 };
}
const GRASS = '#7cc05a', HEDGE = '#3f7d3c', HEDGE2 = '#4c8c44', LEAF = '#5aa04a', BARK = '#6b4a32', PATH = '#d8cdb6';
function buildFlight(parent, M, maze, shadows) {
  const { steps, rise, run, w, landing, hall, doorW, doorH } = EXIT, len = steps * run, topY = steps * rise;
  const r = maze.exitRoom, cx = (r.x0 + r.x1 + 1) * CELL / 2, cz = (r.y0 + r.y1 + 1) * CELL / 2, half = (r.x1 - r.x0 + 1) * CELL / 2;
  const ent = mainEntrance(maze), dir = { x: -ent.dx, z: -ent.dy }, side = { x: -dir.z, z: dir.x };
  const uFoot = half - WALL_T / 2 - landing - len;                    // the foot, from the room's middle along the way up
  const fx = cx + dir.x * uFoot, fz = cz + dir.z * uFoot;
  const g = new THREE.Group(); g.name = 'maze-exit'; g.position.set(fx, 0, fz); g.rotation.y = Math.atan2(-dir.z, dir.x); parent.add(g); // (local +x up the flight, +z across)
  const at = (u, v = 0) => ({ x: fx + dir.x * u + side.x * v, z: fz + dir.z * u + side.z * v });
  const local = (x, z) => { const dx = x - fx, dz = z - fz; _uv[0] = dx * dir.x + dz * dir.z; _uv[1] = dx * side.x + dz * side.z; return _uv; };
  const uIn = len + landing, uMid = uIn + WALL_T / 2, uOut = uIn + WALL_T; // the far wall: its inner face, its middle (the room's edge: the threshold), its outer face
  const near = -half - uFoot, mid = -uFoot;                            // the room's near wall and its middle, in the flight's u
  const b = new Batcher({ vertexColors: true, castShadow: shadows, receiveShadow: true });
  const STONE_DK = '#3c4352', CAP = '#5d6578', OAK = '#5a4434', OAK2 = '#3e2e22';
  // the treads, each a solid block down to the floor (the flight's sides a stepped mass of stone), the landing a block to the wall
  for (let i = 0; i < steps; i++) { const h = (i + 1) * rise; b.add(boxUV(new THREE.BoxGeometry(run + 0.02, h, w), run, h, w, 1), M.stone, { x: (i + 0.5) * run, y: h / 2 }); }
  b.add(boxUV(new THREE.BoxGeometry(landing + 0.04, topY, w), landing, topY, w, 2), M.stone, { x: len + landing / 2, y: topY / 2 });
  // the parapets: a low wall each side, stepping up with every two treads, a darker cap stone on each step; along the landing
  const PH = 0.8, PT = 0.32;
  for (const s of [-1, 1]) {
    const vz = s * (w / 2 + PT / 2);
    for (let i = 0; i < steps; i += 2) { const h = Math.min(topY, (i + 2) * rise) + PH, u0 = i * run, u1 = Math.min(len, (i + 2) * run); b.add(boxUV(new THREE.BoxGeometry(u1 - u0 + 0.01, h, PT), u1 - u0, h, PT, 2), M.stone, { x: (u0 + u1) / 2, y: h / 2, z: vz }); b.add(GEO.box, CAP, { x: (u0 + u1) / 2, y: h + 0.04, z: vz, sx: u1 - u0 + 0.04, sy: 0.08, sz: PT + 0.08 }); }
    const h = topY + PH; b.add(boxUV(new THREE.BoxGeometry(landing, h, PT), landing, h, PT, 2), M.stone, { x: len + landing / 2, y: h / 2, z: vz }); b.add(GEO.box, CAP, { x: len + landing / 2, y: h + 0.04, z: vz, sx: landing + 0.04, sy: 0.08, sz: PT + 0.08 });
  }
  // the chamber's walls above the maze's own (up to the high vault; over a doorway they are its lintel): three plain, the far one
  // with the arched door in it
  const y0 = WALL_H - 0.2, hgt = hall + 0.3 - y0, span = 2 * half + WALL_T;
  b.add(boxUV(new THREE.BoxGeometry(WALL_T, hgt, span), WALL_T, hgt, span, 2), M.stone, { x: near, y: y0 + hgt / 2 });
  for (const s of [-1, 1]) b.add(boxUV(new THREE.BoxGeometry(span, hgt, WALL_T), span, hgt, WALL_T, 2), M.stone, { x: mid, y: y0 + hgt / 2, z: s * half });
  const arch = (path, hw, y, h) => { path.moveTo(-hw, y); path.lineTo(hw, y); path.lineTo(hw, y + h - hw); path.absarc(0, y + h - hw, hw, 0, Math.PI, false); path.lineTo(-hw, y); return path; };
  const wall = new THREE.Shape(); wall.moveTo(-span / 2, y0); wall.lineTo(span / 2, y0); wall.lineTo(span / 2, hall + 0.3); wall.lineTo(-span / 2, hall + 0.3); wall.closePath();
  wall.holes.push(arch(new THREE.Path(), doorW / 2, topY, doorH));
  const extr = (shape, depth) => { const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 }); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2); return geo; };
  b.add(extr(wall, WALL_T), M.stone, { x: uIn, ry: Math.PI / 2 }); // (the shape's x across the flight, its depth along the way up)
  // the door's frame: dressed stone round the arch, proud of both faces; the threshold a worn sill
  const ring = arch(new THREE.Shape(), doorW / 2 + 0.16, topY, doorH + 0.16); ring.holes.push(arch(new THREE.Path(), doorW / 2 - 0.012, topY, doorH - 0.012)); // (its opening a hair smaller than the wall's: the two arches' insides were level and flickered)
  b.add(extr(ring, WALL_T + 0.12), STONE_DK, { x: uIn - 0.06, ry: Math.PI / 2 });
  b.add(GEO.box, CAP, { x: uMid, y: topY - 0.02, sx: WALL_T + 0.3, sy: 0.07, sz: doorW + 0.3 });
  b.add(GEO.box, STONE_DK, { x: uIn - 0.02, y: topY + doorH + 0.1, sx: 0.16, sy: 0.3, sz: 0.24 }); // the keystone
  // the door: an old oak leaf, arched to fit, iron-strapped, thrown open outward on its hinges (the hinge on the -v jamb)
  {
    const leaf = arch(new THREE.Shape(), doorW / 2 - 0.02, 0, doorH - 0.02), lg = new THREE.ExtrudeGeometry(leaf, { depth: 0.07, bevelEnabled: false, curveSegments: 10 });
    lg.translate(doorW / 2 - 0.02, 0, 0); // (the hinge edge at the leaf's x 0)
    const open = 1.2, hinge = { u: uOut + 0.02, v: -doorW / 2 + 0.02 };
    const m = new THREE.Matrix4().compose(new THREE.Vector3(hinge.u, topY + 0.01, hinge.v), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2 + open, 0)), new THREE.Vector3(1, 1, 1));
    // (closed, the leaf lies across the doorway along +v; `open` swings its free edge out past the wall)
    b.add(lg, OAK, { matrix: m });
    const onLeaf = (a, y, o = 0.04) => new THREE.Vector3(a, y, o).applyMatrix4(m);
    for (let k = 1; k < 5; k++) { const p = onLeaf(k * (doorW - 0.04) / 5, (doorH - 0.3) / 2, -0.005); b.add(GEO.box, OAK2, { x: p.x, y: p.y, z: p.z, sx: 0.02, sy: doorH - 0.45, sz: 0.085, ry: open - Math.PI / 2 }); } // the planks' seams
    for (const y of [0.45, doorH - 0.75]) { const p = onLeaf(doorW / 2 - 0.02, y, 0.09); b.add(GEO.box, IRON, { x: p.x, y: p.y, z: p.z, sx: doorW - 0.1, sy: 0.07, sz: 0.025, ry: open - Math.PI / 2 }); } // the straps (a good centimetre off the leaf: their backs flickered against it)
    const ring2 = onLeaf(doorW - 0.25, 1.0, 0.1); b.add(new THREE.TorusGeometry(0.06, 0.012, 6, 12), IRON, { x: ring2.x, y: ring2.y, z: ring2.z, ry: open - Math.PI / 2 }); // the ring
  }
  const meshes = b.build(g, 'maze-exit-stair');
  // ---- past the door: the garden in daylight (one unlit mesh, shaded once from the sun's side; the sky its own). Only drawn while
  // you are near the room (setNear)
  const o = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: false });
  const U = uOut, gy = topY;
  o.add(new THREE.CircleGeometry(15, 28, -Math.PI / 2, Math.PI), GRASS, { x: U - 0.1, y: gy - 0.005, rx: -Math.PI / 2 });
  for (let k = 0; k < 7; k++) o.add(GEO.cyl8, PATH, { x: U + 0.55 + k * 0.82, y: gy + 0.01, z: (k % 2 ? 0.12 : -0.1), sx: 0.36, sy: 0.03, sz: 0.3, ry: k * 0.7 }); // the stepping stones
  for (const s of [-1, 1]) { // the hedge, a gap for the path; flowers by the stones
    o.add(GEO.box, HEDGE, { x: U + 6.2, y: gy + 0.65, z: s * 5.5, sx: 0.9, sy: 1.3, sz: 8.2 });
    for (let k = 0; k < 8; k++) o.add(GEO.ico1, k % 2 ? HEDGE2 : HEDGE, { x: U + 6.2, y: gy + 1.32, z: s * (1.9 + k * 1.02), sx: 0.62, sy: 0.32, sz: 0.62 });
    for (let k = 0; k < 4; k++) o.add(GEO.ico0, (k + (s > 0 ? 1 : 0)) % 2 ? '#e7a2c8' : '#a9b6f0', { x: U + 1.0 + k * 1.1, y: gy + 0.12, z: s * (1.0 + (k % 2) * 0.25), sx: 0.12, sy: 0.1, sz: 0.12 });
    for (let k = 0; k < 3; k++) o.add(GEO.ico1, HEDGE2, { x: U + 0.9 + k * 1.5, y: gy + 0.14, z: s * (1.45 + (k % 2) * 0.3), sx: 0.3, sy: 0.24, sz: 0.3 });
  }
  for (const [tu, tv, h, sc] of [[9, -4.2, 5.2, 1.0], [11, 5.2, 6, 1.2], [11.5, -8.5, 5.5, 1.1]]) { // the trees
    o.add(GEO.cyl8, BARK, { x: U + tu, y: gy + h * 0.3, z: tv, sx: 0.28 * sc, sy: h * 0.6, sz: 0.28 * sc });
    for (const [bx, by, bz, rr] of [[0, 0.95, 0, 2.2], [1.2, 0.8, 0.6, 1.6], [-1.1, 0.82, -0.7, 1.7], [0.2, 1.18, -0.4, 1.5]]) o.add(GEO.ico1, bx > 0 ? LEAF : HEDGE2, { x: U + tu + bx * sc, y: gy + h * by, z: tv + bz * sc, sx: rr * sc, sy: rr * 0.82 * sc, sz: rr * sc });
  }
  for (const [cu, cv, cy, cs] of [[11, -5, 9, 1.4], [12, 5.5, 10.5, 1.7], [11, 0.5, 12.5, 1.2]]) for (const [bx, bz, rr] of [[0, 0, 1], [1.1, 0.3, 0.75], [-1.0, -0.2, 0.8]]) o.add(GEO.ico1, '#ffffff', { x: U + cu, y: gy + cy, z: cv + (bx + bz) * cs, sx: rr * cs * 1.3, sy: rr * cs * 0.55, sz: rr * cs }); // clouds
  const outMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }); outMat.name = 'maze-exit-garden';
  const outside = o.build(g, 'maze-exit-garden');
  for (const m of outside) {
    m.material = outMat;
    const n = m.geometry.attributes.normal, c = m.geometry.attributes.color, L = [0.45, 0.8, -0.4]; // (the sun from up and to one side: a lit side and a shade side, cel style)
    for (let i = 0; i < c.count; i++) { const d = n.getX(i) * L[0] + n.getY(i) * L[1] + n.getZ(i) * L[2], k = d > 0.35 ? 1.05 : d > -0.2 ? 0.86 : 0.7; c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
  }
  // the sky: a half cylinder round the doorway's outside, pale at the horizon, blue overhead
  const sky = (() => {
    const R = 14.5, n = 20, a0 = -Math.PI / 2, a1 = Math.PI / 2, yb = gy - 0.25, yt = gy + 22, pos = [], col = [], idx = [];
    const lo = new THREE.Color('#eaf5ff'), hi = new THREE.Color('#6fb4e6');
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, x = U + Math.cos(a) * R, z = Math.sin(a) * R; for (const [y, cc] of [[yb, lo], [gy + 3, lo], [yt, hi]]) { pos.push(x, y, z); col.push(cc.r, cc.g, cc.b); } }
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, bq = (i + 1) * 3 + j; idx.push(a, bq, a + 1, bq, bq + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }); mat.name = 'maze-exit-sky';
    const mesh = softLayer(new THREE.Mesh(geo, mat)); mesh.name = 'maze-exit-sky'; mesh.renderOrder = -1; g.add(mesh); return mesh;
  })();
  outside.push(sky);
  for (const m of outside) m.visible = false;
  // ---- colliders (maze frame, axis-aligned: the flight turns by quarter turns), all `high`: they hold on the flight too
  const box = (u0, u1, v0, v1) => { const p = at(u0, v0), q = at(u1, v1); return { minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z), high: true }; };
  const boxes = [];
  for (const s of [-1, 1]) {
    boxes.push(box(0, uIn, s * w / 2, s * (w / 2 + PT)));                      // the parapets (no stepping off the side)
    boxes.push(box(uIn, uOut + 0.05, s * doorW / 2, s * (w / 2 + PT)));        // the jambs
  }
  const lights = [
    { ...at(uIn - 1.7), y: topY + 2.3, color: '#efeee8', k: 0.42 }, // the daylight at the door (pale, a touch cool)
    { ...at(len * 0.38), y: 2.5, color: '#d6c2a2', k: 0.42 },        // and further down, warm grey
  ];
  const door = { ...at(uMid), y: topY + 1.1 };
  return {
    meshes: [...meshes, ...outside], outside, group: g, boxes, lights, dir, side, at, local, len, landing, topY, w, door, rise, run, steps,
    uIn, uMid, uOut, doorW, doorH, hall, room: { x: cx, z: cz, half },
    foot: { ...at(-0.6), yaw: Math.atan2(dir.x, dir.z) },                  // a step in front of the first tread, facing up the flight
    get yaw() { return Math.atan2(dir.x, dir.z); },
    x0: fx, zc: fz,                                                        // the older names: the foot
    mid: at(len / 2),
    // the tread under (x, z), or null off the flight; past the threshold the garden's ground, only for someone already up there (y)
    floorAt(x, z, y) {
      const [u, v] = local(x, z);
      if (u > uMid + 0.05) return y !== undefined && y > 3 && u < uOut + 9 && Math.abs(v) < 6 ? topY : null;
      if (Math.abs(v) > w / 2 + 0.05 || u < -0.3) return null;
      if (u < 0) return 0;
      if (u < len) return (Math.floor(u / run) + 1) * rise;
      return topY;
    },
    // over the threshold: through the doorway, past the middle of the wall (the room's edge), and only in the doorway itself up on
    // the landing (w16-phase4: the pool's mazes have corridors behind the far wall; a cell on the flight's line out there is not out)
    out(x, z, y = topY) { const [u, v] = local(x, z); return Math.abs(v) < doorW / 2 && u > uMid && u < uOut + 0.6 && y > topY - 0.6; },
    // metres left to the threshold for someone on the flight (null off it)
    toDoor(x, z) { const [u, v] = local(x, z); return Math.abs(v) <= w / 2 + 0.05 && u >= -0.3 && u <= uMid + 0.05 ? Math.max(0, uMid - u) : null; },
    setNear(on) { if (outside[0].visible !== on) for (const m of outside) m.visible = on; },
    // the garden's light with the yard's hour (LIGHT.night 0..1): the night a deep blue, the sky darker still
    setNight(k) { const c = 1 - 0.68 * k; outMat.color.setRGB(c, c + 0.04 * k, c + 0.22 * k); sky.material.color.setRGB(1 - 0.85 * k, 1 - 0.8 * k, 1 - 0.62 * k); },
  };
}
const _uv = [0, 0];
