// The game store's building (game-store.js owns the feature) on Summit Rd: 14 x 16 m, walls 6.2 m, a loft over the back 6 m
// reached by stairs up the west wall, four gaming tables on the shop floor, Clem's counter on the left (east, as you walk in),
// shelves, posters, hanging dice, string lights, a dragon over the tables and a giant meeple on the roof. Everything static is
// baked into a few batches (one per wall, so the wall between you and the camera can hide, and one for the inside, which isn't
// drawn at all while you're out on the street).
//
// Two floors in a world whose ground is a height field: the loft stands over the back room, and its floor is a `deck` surface
// that terrain.js only counts for someone up near it (game-store-backroom.js). Thin colliders only where the floors meet (the
// loft's railing is the back room's front wall below it).
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { GAME_STORE } from './layout.js';
import { addSurface } from './terrain.js';
import { Batcher, GEO } from './batch.js';
import { windowGlass, addNightSpot as addSpot, LAMPS, NIGHT_SPOTS } from './daynight-mats.js';
// the lamps inside: game-store.js turns them on by day while you are in the shop (main.js lights the nearest four), and off
// after hours. The shop's in INDOOR, the back room's in ROOM (it keeps its own hours).
const INDOOR = [], ROOM = [];
const addNightSpot = (spot, indoor = true) => { addSpot(spot); const s = NIGHT_SPOTS[NIGHT_SPOTS.length - 1]; if (indoor) INDOOR.push(s); return s; };
const addRoomSpot = spot => { addSpot(spot); const s = NIGHT_SPOTS[NIGHT_SPOTS.length - 1]; ROOM.push(s); return s; };
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { cellPlane } from './game-store-art.js';
import { backroomPlan, buildBackRoom } from './game-store-backroom.js';
import { hangPrints } from './game-store-wall-art.js';
import { toon } from './toon.js';
import { doorLettering } from './dnd-art.js';
import { realGlass, glassUniforms } from './real-glass.js';

// ---- the plan: every number the feature and its tests need, from layout.js GAME_STORE
export const PLAN = (() => {
  const { x: sx, z: sz, w, d, loftD, loftY: LY } = GAME_STORE;
  const gy = 0.34, floorY = gy + 0.08, H = 6.2, T = 0.25;
  const minX = sx - w / 2, maxX = sx + w / 2, minZ = sz - d / 2, maxZ = sz + d / 2; // the door is on minZ (north)
  const iMinX = minX + T, iMaxX = maxX - T, iMinZ = minZ + T, iMaxZ = maxZ - T;
  const zL = maxZ - loftD;                                    // the loft's edge (its railing; the stockroom's front wall below)
  const N = 15, tread = 0.36;
  const stair = { minX: iMinX, maxX: iMinX + 1.3, z0: zL - N * tread, z1: zL, n: N, tread, rise: (LY - floorY) / N };
  // four tables: 2 x 2, the demo table (Bookwyrm's playtests) at the front on the left as you come in, by Clem's counter
  const TR = 0.95, CHAIR = 1.25;                               // table top radius; chairs this far from the middle
  const tables = [
    { id: 'demo', x: sx + 1.8, z: minZ + 3.55, felt: '#2f6b4f' },
    { id: 'west-front', x: sx - 2.6, z: minZ + 3.55, felt: '#3f6fa8' },
    { id: 'west-back', x: sx - 2.6, z: minZ + 7.3, felt: '#7a2140' },
    { id: 'east-back', x: sx + 1.8, z: minZ + 7.3, felt: '#5b4a8a' },
  ];
  for (const t of tables) t.seats = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([kx, kz]) => ({ x: t.x + kx * CHAIR, z: t.z + kz * CHAIR, yaw: Math.atan2(-kx, -kz), table: t.id }));
  const counter = { minX: iMaxX - 2.25, maxX: iMaxX - 1.45, minZ: minZ + 3.9, maxZ: minZ + 8.5 };
  const clem = { x: iMaxX - 0.75, z: (counter.minZ + counter.maxZ) / 2, yaw: -Math.PI / 2 };
  const shelves = [ // the games: along each side wall at the front
    { side: 0, x: iMinX + 0.45, z0: iMinZ + 0.3, z1: iMinZ + 3.2 },
    { side: 1, x: iMaxX - 0.45, z0: iMinZ + 0.3, z1: iMinZ + 3.2 },
  ];
  const loft = { minX: iMinX, maxX: iMaxX, minZ: zL, maxZ: iMaxZ, y: LY, spot: { x: sx - 1.2, z: zL + 1.6 } };
  // the back room's own door to the outside: a glass door in the back wall (east of the middle), a step, and a paved path from
  // the step east along the back of the store, then up the east side (between the store and Kevin's Tool Crib) to the sidewalk
  const outDoor = { x0: sx + 3, x1: sx + 4.1, z: maxZ, y0: gy, y1: gy + 2.2 };
  const step = { minX: sx + 2.8, maxX: sx + 4.3, minZ: maxZ, maxZ: maxZ + 0.5, y: floorY };
  const path = {
    y: 0.37, w: 1.6,
    back: { minX: sx + 2.8, maxX: maxX + 0.45, minZ: maxZ + 0.5, maxZ: maxZ + 2.1 },    // along the back wall
    side: { minX: maxX + 0.45, maxX: maxX + 2.05, minZ: -119.0, maxZ: maxZ + 2.1 },    // up the east side to the sidewalk
    sign: { x: maxX + 0.1, z: -119.6 },                                                // the little sign at the sidewalk end
  };
  // seat-height (2026-11-07): the chairs' seats 0.3 over the floor (were 0.445: the feet hung 14 cm), the tables' tops down as far
  // (0.61, were 0.755) so the hands rest on them as before; the puzzle table and the painting desk the same (DROP)
  const SEAT = 0.3, TOP = 0.61, DROP = 0.145;
  return { sx, sz, w, d, gy, floorY, H, T, minX, maxX, minZ, maxZ, iMinX, iMaxX, iMinZ, iMaxZ, zL, LY, stair, tables, TR, CHAIR, counter, clem, shelves, loft, outDoor, step, path, SEAT, TOP, DROP };
})();
PLAN.back = backroomPlan(PLAN); // the back room under the loft, D&D night: game-store-backroom.js

// A lighter sphere than SPH (90 triangles, not 192): the store has dozens of small round things.
const SPH = new THREE.SphereGeometry(1, 9, 6);
// Every bulb in the store (string lights, the pendants, the lamps) in ONE unlit vertex-coloured material, joined to
// daynight's lamp list so it is pale by day and burns at night like lampGlow() (one draw call instead of one per colour).
const BULBS = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); BULBS.name = 'store-bulbs';
LAMPS.set('store-bulbs', { mat: BULBS, base: new THREE.Color('#ffffff') });
// The back room's bulbs (and the lamp over its back door) are a second material: the owner turns the shop off at 9, the room
// burns on till midnight (game-store.js dims each one's `base`).
const ROOM_BULBS = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); ROOM_BULBS.name = 'store-bulbs-room';
LAMPS.set('store-bulbs-room', { mat: ROOM_BULBS, base: new THREE.Color('#ffffff') });
class Bulbs {
  constructor(mat = BULBS) { this.geos = []; this.c = new THREE.Color(); this.mat = mat; }
  add(geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.scale(sx, sy, sz); g.translate(x, y, z);
    this.c.set(color); const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g); return this;
  }
  build(parent, name) {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.geos, false), this.mat); this.geos.forEach(g => g.dispose()); this.geos = [];
    m.name = name; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.geometry.computeBoundingSphere(); parent.add(m); return m;
  }
}

// The colours (house palette: warm wood, cream trim, the shop's green)
const C = {
  brick: '#c4573c', brickDark: '#9a4230', trim: '#f3e6c8', side: '#d9a86c', sideDark: '#c28f55', roof: '#5b6168', roofLip: '#e8e2d6',
  floor: '#8a6240', plank: '#6b4a2b', wood: '#a8804f', woodDark: '#5a3c26', woodMid: '#7a5232', board: '#c9a26b',
  wallIn: '#f3dfb0', wainscot: '#7a4b2a', loftWall: '#4f8a86', green: '#2f6b4f', cream: '#fbfaf5', ink: '#2b2340',
};
const SPINES = ['#7a2140', '#e3aa45', '#3f8fd9', '#7fb36a', '#e0564a', '#f3e3c3', '#2b3a4e', '#c27a3a', '#b48cff', '#ff8fb8', '#3fae5a', '#f0c24f'];

// A wall slab with rectangular holes. Along x (axis 'x': spans x0..x1, thickness z0..z1) or along z (axis 'z': spans
// z0..z1 as "x", thickness x0..x1 as "z"). holes: [{ a0, a1, y0, y1 }] in the wall's own run coordinate.
function holeyWall(b, axis, a0, a1, t0, t1, y0, y1, holes, col) {
  const xs = [...new Set([a0, a1, ...holes.flatMap(h => [h.a0, h.a1])])].filter(v => v >= a0 && v <= a1).sort((p, q) => p - q);
  for (let i = 0; i < xs.length - 1; i++) {
    const p = xs[i], q = xs[i + 1];
    const cut = holes.filter(h => h.a0 <= p + 1e-6 && h.a1 >= q - 1e-6).sort((m, n) => m.y0 - n.y0);
    let y = y0;
    for (const h of cut) { if (h.y0 > y) piece(p, q, y, h.y0); y = Math.max(y, h.y1); }
    if (y < y1) piece(p, q, y, y1);
  }
  function piece(p, q, ya, yb) { if (axis === 'x') b.boxMinMax(p, ya, t0, q, yb, t1, col); else b.boxMinMax(t0, ya, p, t1, yb, q, col); }
}
// A part at local (lx, ly, lz) of something standing at (x, z) and turned by yaw (lz = toward where it faces).
const turn = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

// A wooden chair facing yaw (its back away from where it faces), seat top at y + PLAN.SEAT (seat-height: the back as high over the seat as before).
const CHAIR_FRONT = 0.12; // (seats-bodies) the chair seat's front edge in front of the sitter's spot: game-store.js fits each body to it (seats.js seatFit)
function chair(b, x, y, z, yaw, col = C.woodMid) {
  const at = (lx, ly, lz, sx, sy, sz, c = col) => { const [px, pz] = turn(x, z, yaw, lx, lz); b.add(GEO.box, c, { x: px, y: y + ly, z: pz, sx, sy, sz, ry: yaw }); };
  const S = PLAN.SEAT, legH = S - 0.045;
  at(0, S - 0.025, -0.045, 0.44, 0.05, 0.33, C.board); // (the seat's front edge 0.12 in front of the sitter's hips: the knees bend just past it, the calves clear; house-scale)
  for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.09], [0.18, 0.09]]) at(lx, legH / 2, lz, 0.05, legH, 0.05);
  for (const lx of [-0.18, 0.18]) at(lx, S + 0.235, -0.19, 0.05, 0.5, 0.05);
  at(0, S + 0.395, -0.19, 0.44, 0.16, 0.04); at(0, S + 0.195, -0.19, 0.36, 0.05, 0.03);
}
// A round game table: a wooden top with a felt inset, a pedestal and a cross foot. Top surface (the felt) at y + PLAN.TOP.
function table(b, x, y, z, felt) {
  const T = PLAN.TOP;
  b.add(GEO.cyl12, C.wood, { x, y: y + T - 0.035, z, sx: PLAN.TR, sy: 0.06, sz: PLAN.TR });
  b.add(GEO.cyl12, felt, { x, y: y + T - 0.003, z, sx: PLAN.TR - 0.12, sy: 0.006, sz: PLAN.TR - 0.12 });
  b.add(GEO.cyl8, C.woodDark, { x, y: y + (T - 0.05) / 2, z, sx: 0.11, sy: T - 0.05, sz: 0.11 });
  for (const ry of [0, Math.PI / 2]) b.add(GEO.box, C.woodDark, { x, y: y + 0.04, z, sx: 1.0, sy: 0.08, sz: 0.12, ry });
}
// A leafy plant in a pot (pot top at y + h).
function plant(b, x, y, z, s = 1, pot = '#c9653e') {
  b.add(GEO.cyl8, pot, { x, y: y + 0.22 * s, z, sx: 0.24 * s, sy: 0.44 * s, sz: 0.24 * s });
  b.add(GEO.cyl8, '#5a3c26', { x, y: y + 0.45 * s, z, sx: 0.2 * s, sy: 0.03, sz: 0.2 * s });
  const L = ['#3fae5a', '#2f8a4a', '#57c46e'];
  for (let i = 0; i < 6; i++) { const a = i * 1.1, r = (i % 2 ? 0.16 : 0.08) * s; b.add(GEO.ico0, L[i % 3], { x: x + Math.cos(a) * r, y: y + (0.7 + (i % 3) * 0.16) * s, z: z + Math.sin(a) * r, sx: 0.22 * s, sy: 0.26 * s, sz: 0.22 * s, ry: a }); }
}
// A stack of game boxes, each a little turned (deterministic).
function boxTower(b, x, y, z, n, seed, ry0 = 0) {
  let h = y;
  for (let i = 0; i < n; i++) {
    const k = (seed * 7 + i * 5) % SPINES.length, sx = 0.42 + ((seed + i) % 3) * 0.08, sz = 0.3 + ((seed + i * 2) % 3) * 0.06, sy = 0.08 + ((seed + i) % 4) * 0.025;
    b.add(GEO.box, SPINES[k], { x: x + (((i * 13 + seed) % 5) - 2) * 0.012, y: h + sy / 2, z, sx, sy, sz, ry: ry0 + ((i * 7 + seed) % 5 - 2) * 0.09 });
    b.add(GEO.box, C.cream, { x: x + (((i * 13 + seed) % 5) - 2) * 0.012, y: h + sy / 2, z, sx: sx * 0.6, sy: sy + 0.008, sz: sz + 0.008, ry: ry0 + ((i * 7 + seed) % 5 - 2) * 0.09 }); // the lid's band
    h += sy;
  }
}

// A hollow case against a wall: a back panel, two ends, a top and boards at heights `ys` (from y0), `D` deep. ax 'x': it runs
// along x on the wall z = w and opens toward k (+1 / -1 in z); ax 'z': along z on the wall x = w. fill(r, yBottom, rowH, put)
// fills row r, where put(a, u, y, sa, su, sy, col, lean) places a box at run a, depth u from the wall (lean tilts along the run).
function bookcase(b, ax, w, k, a0, a1, y0, top, ys, D, col, fill) {
  const put = (a, u, y, sa, su, sy, c, lean = 0) => (ax === 'x'
    ? b.add(GEO.box, c, { x: a, y, z: w + k * u, sx: sa, sy, sz: su, rz: lean })
    : b.add(GEO.box, c, { x: w + k * u, y, z: a, sx: su, sy, sz: sa, rx: lean }));
  const mid = (a0 + a1) / 2, len = a1 - a0;
  put(mid, 0.02, y0 + top / 2, len, 0.04, top, col);
  for (const a of [a0 + 0.025, a1 - 0.025]) put(a, D / 2, y0 + top / 2, 0.05, D, top, col);
  put(mid, D / 2, y0 + top - 0.025, len, D, 0.05, col);
  ys.forEach((y, r) => {
    put(mid, D / 2 - 0.003, y0 + y - 0.02, len - 0.1, D - 0.006, 0.04, C.board); // (between the ends, a hair back from their fronts: no shared faces)
    fill?.(r, y0 + y, (r + 1 < ys.length ? ys[r + 1] : top) - y - 0.06, put);
  });
}
// Rows of book (or game box) spines along a case's row from a0 to a1 (deterministic widths, heights, colours, a lean now and then).
function spines(put, a0, a1, y, rowH, depth, seed) {
  let u = a0 + 0.04;
  for (let k = 0; u < a1 - 0.1; k++) {
    const wd = 0.05 + ((seed * 7 + k * 3) % 4) * 0.014, ht = rowH * (0.7 + ((seed * 5 + k * 2) % 4) * 0.08), lean = (seed * 3 + k) % 11 === 0 ? 0.22 : 0;
    if ((seed + k) % 13 === 6) { u += 0.12; continue; } // a gap
    put(u + wd / 2, 0.06 + depth / 2, y + ht / 2, wd, depth - (lean ? 0.012 : 0), ht, SPINES[(seed * 5 + k * 7) % SPINES.length], lean); // (a leaning one is shallower: its faces never in its neighbours' planes)
    u += wd + 0.008 + (lean ? 0.05 : 0);
  }
}

// The meeple outline (1 unit tall, standing on y = 0), for the giant one on the roof.
function meepleGeometry() {
  const R = [[0.08, 0], [0.3, 0], [0.22, 0.34], [0.46, 0.46], [0.46, 0.58], [0.16, 0.66], [0.13, 0.72]]; // the right side, crotch to neck
  const s = new THREE.Shape();
  s.moveTo(0, 0.22);
  for (const [x, y] of R) s.lineTo(x, y);
  s.absarc(0, 0.86, 0.17, -0.82, Math.PI + 0.82, false); // the head, over the top
  for (const [x, y] of [...R].reverse()) s.lineTo(-x, y);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.11);
  return g;
}

// A cartoon dragon model (for hanging over the tables): body, neck, head with horns and eyes, a curled tail, two wings.
function dragon(b) {
  const G = '#3fae5a', Gd = '#2f8a4a', belly = '#f0d27a', wing = '#e0564a', horn = '#fff4dc';
  b.add(SPH, G, { x: 0, y: 0, z: 0, sx: 0.32, sy: 0.3, sz: 0.55 });
  b.add(SPH, belly, { x: 0, y: -0.08, z: 0.06, sx: 0.24, sy: 0.22, sz: 0.44 });
  // neck and head (toward +z)
  b.add(GEO.cyl8, G, { x: 0, y: 0.18, z: 0.5, sx: 0.12, sy: 0.42, sz: 0.12, rx: 0.9 });
  b.add(SPH, G, { x: 0, y: 0.36, z: 0.78, sx: 0.2, sy: 0.18, sz: 0.24 });
  b.add(SPH, G, { x: 0, y: 0.3, z: 0.98, sx: 0.13, sy: 0.1, sz: 0.14 });   // the snout
  for (const k of [-1, 1]) {
    b.add(SPH, '#ffffff', { x: k * 0.11, y: 0.44, z: 0.88, sx: 0.06, sy: 0.07, sz: 0.05 });
    b.add(SPH, C.ink, { x: k * 0.12, y: 0.44, z: 0.925, sx: 0.03, sy: 0.04, sz: 0.02 });
    b.add(GEO.cone6, horn, { x: k * 0.1, y: 0.56, z: 0.7, sx: 0.04, sy: 0.18, sz: 0.04, rx: -0.6, rz: -k * 0.3 });
    b.add(SPH, Gd, { x: k * 0.05, y: 0.34, z: 1.1, sx: 0.025, sy: 0.02, sz: 0.02 });  // nostrils
    // legs tucked under
    b.add(SPH, G, { x: k * 0.2, y: -0.22, z: 0.22, sx: 0.09, sy: 0.12, sz: 0.1 });
    b.add(SPH, G, { x: k * 0.22, y: -0.22, z: -0.26, sx: 0.1, sy: 0.13, sz: 0.12 });
  }
  // the back's spikes and the tail curling up
  for (let i = 0; i < 5; i++) b.add(GEO.cone6, Gd, { x: 0, y: 0.28 - Math.abs(i - 1) * 0.02, z: 0.3 - i * 0.18, sx: 0.05, sy: 0.12, sz: 0.06 });
  for (let i = 0; i < 6; i++) { const t = i / 5; b.add(SPH, G, { x: Math.sin(t * 2.2) * 0.14, y: -0.02 + t * t * 0.3, z: -0.6 - t * 0.55, sx: 0.12 - t * 0.07, sy: 0.12 - t * 0.07, sz: 0.14 - t * 0.07 }); }
  b.add(GEO.cone6, wing, { x: Math.sin(2.2) * 0.14, y: 0.32, z: -1.18, sx: 0.08, sy: 0.14, sz: 0.03, rx: -1.0 });
  // wings: a flat fan of three fingers each, spread wide
  for (const k of [-1, 1]) {
    b.add(GEO.cyl6, Gd, { x: k * 0.55, y: 0.32, z: 0.05, sx: 0.04, sy: 0.9, sz: 0.04, rz: k * 1.25 });
    for (let f = 0; f < 3; f++) b.add(GEO.box, wing, { x: k * (0.42 + f * 0.18), y: 0.18 + f * 0.02, z: -0.08 - f * 0.12, sx: 0.32 + f * 0.1, sy: 0.02, sz: 0.4 - f * 0.08, ry: k * (0.25 + f * 0.25), rz: k * 0.2 });
  }
}

// ---- build it. art = { posters, boxArt, boxes: [{ name, art: index }], board, renderer? } (game-store-art.js). Returns the parts the
// feature drives: the five shell groups, the inside group, the dragon, the door, the open sign, the boxes, the seats.
export function buildStore(g, colliders, art) {
  const P = PLAN, { sx, gy, floorY: fy, H, T, minX, maxX, minZ, maxZ, iMinX, iMaxX, iMinZ, iMaxZ, zL, LY, stair: ST } = P;
  const top = gy + H;
  const posterMat = new THREE.MeshBasicMaterial({ map: art.posters.tex, fog: true });
  const boxMat = new THREE.MeshBasicMaterial({ map: art.boxArt.tex, fog: true });
  // a printed face cut from an atlas, standing at (x, y, z) facing yaw (0 = +z)
  const face = (b, mat, uv, x, y, z, w, h, yaw) => { const geo = cellPlane(w, h, uv); b.add(geo, mat, { x, y, z, ry: yaw }); };

  // ---------------------------------------------------------------- the floors and the stairs (surfaces you stand on)
  addSurface({ minX, maxX, minZ, maxZ, y: fy, sound: 'wood' });
  for (let i = 0; i < ST.n; i++) addSurface({ minX: ST.minX, maxX: ST.maxX, minZ: ST.z0 + i * ST.tread, maxZ: ST.z0 + (i + 1) * ST.tread, y: fy + (i + 1) * ST.rise, sound: 'wood' });
  addSurface({ minX: iMinX, maxX: iMaxX, minZ: zL, maxZ: iMaxZ, y: LY, sound: 'wood', deck: true }); // a deck: the back room is under it
  // the front walk from the sidewalk to the door
  addSurface({ minX: sx - 1.3, maxX: sx + 1.3, minZ: -119.2, maxZ: minZ, y: 0.37, sound: 'stone' });
  // the back door's step and the path round to the sidewalk
  addSurface({ ...P.step, sound: 'stone' });
  addSurface({ ...P.path.back, y: P.path.y, sound: 'stone' });
  addSurface({ ...P.path.side, y: P.path.y, sound: 'stone' });

  // ---------------------------------------------------------------- the shell: one group per side
  const sides = {};
  const side = name => { const grp = new THREE.Group(); grp.name = 'store-' + name; g.add(grp); sides[name] = grp; return new Batcher({ vertexColors: true }); };
  // the shop's windows: a copy of the town's lit glass that game-store.js drives by the shop's hours (dark after 9)
  const glassLit = windowGlass(0.95).clone(); glassLit.name = 'store-glass';
  // store-windows: every window is real glass (real-glass.js), a thin pane a little in from the wall's outer face, its edges buried in
  // the wall, the sill and the head; near the store the panes are see-through (game-store.js's glass view) and far off they are the
  // lit pane above. One batch of panes per wall (each in its side's group), castShadow off.
  const glassU = glassUniforms(), glassReal = realGlass(glassLit, glassU, 'store-glass+real');
  const panes = {}, PANE = 0.02, BURY = 0.02, IN = 0.08; // the pane's thickness, how far its edges run into the wall, its middle from the outer face
  const pane = (name, x, y, z, sx, sy, sz) => (panes[name] || (panes[name] = new Batcher({ castShadow: false }))).add(GEO.box, glassReal, { x, y, z, sx, sy, sz });
  const glassMeshes = [], windows = []; // windows: the openings ({ z | x, a0, a1, y0, y1, out }: game-store-cull.js's portals)
  const buildPanes = name => { for (const m of panes[name]?.build(sides[name], 'store-glass-' + name) || []) { m.userData.noMerge = true; glassMeshes.push(m); } };

  // -- front (north): brick, cream trim, two shop windows and the door below, three windows above, the false front with the sign
  const fb = side('front');
  const z0 = minZ, z1 = minZ + T;
  const DOOR = { a0: sx - 1, a1: sx + 1, y0: gy, y1: gy + 2.6 };
  const WIN = [{ a0: minX + 1, a1: sx - 2, y0: gy + 0.75, y1: gy + 3.0 }, { a0: sx + 2, a1: maxX - 1, y0: gy + 0.75, y1: gy + 3.0 }];
  const UP = [-4, 0, 4].map(dx => ({ a0: sx + dx - 0.75, a1: sx + dx + 0.75, y0: gy + 4.0, y1: gy + 5.5 }));
  holeyWall(fb, 'x', minX, maxX, z0, z1, gy, top, [DOOR, ...WIN, ...UP], C.brick);
  for (const w of [...WIN, ...UP]) windows.push({ z: minZ, ...w, out: -1 });
  // the false front over the roof line: a band all along, a raised middle for the name, a cream cap on both
  fb.boxMinMax(minX - 0.1, top, z0 - 0.05, maxX + 0.1, top + 0.75, z1, C.brick);
  fb.boxMinMax(sx - 4.4, top + 0.75, z0 - 0.05, sx + 4.4, top + 1.95, z1, C.brick);
  fb.boxMinMax(minX - 0.25, top + 0.75, z0 - 0.2, sx - 4.4, top + 0.9, z1 + 0.05, C.trim);
  fb.boxMinMax(sx + 4.4, top + 0.75, z0 - 0.2, maxX + 0.25, top + 0.9, z1 + 0.05, C.trim);
  fb.boxMinMax(sx - 4.6, top + 1.95, z0 - 0.2, sx + 4.6, top + 2.12, z1 + 0.05, C.trim);
  for (const k of [-1, 1]) fb.boxMinMax(sx + k * 4.4 - 0.18, top + 0.75, z0 - 0.15, sx + k * 4.4 + 0.18, top + 1.95, z1 - 0.003, C.trim); // the raised part's posts (their backs a hair inside the brick)
  // trim: corner pilasters, the band between the floors, window frames and sills, a dark kick plate under the windows
  for (const x of [minX, maxX]) fb.boxMinMax(x - 0.12, gy, z0 - 0.12, x + 0.12, top + 0.75, z0 + 0.1, C.trim);
  fb.boxMinMax(minX - 0.1, gy + 3.55, z0 - 0.12, maxX + 0.1, gy + 3.75, z0 + 0.02, C.trim);
  for (const w of [...WIN, ...UP]) {
    fb.boxMinMax(w.a0 - 0.1, w.y1 - 0.003, z0 - 0.08, w.a1 + 0.1, w.y1 + 0.14, z0 + 0.02, C.trim); // (head and sill reach 3 mm into the opening: their faces never in the wall's)
    fb.boxMinMax(w.a0 - 0.14, w.y0 - 0.1, z0 - 0.14, w.a1 + 0.14, w.y0 + 0.003, z0 + 0.02, C.trim);
    for (const x of [w.a0, w.a1]) fb.boxMinMax(x - 0.07, w.y0, z0 - 0.07, x + 0.07, w.y1, z0 + 0.02, C.trim);
    if (w.y0 > gy + 3) fb.boxMinMax((w.a0 + w.a1) / 2 - 0.04, w.y0, z0 - 0.04, (w.a0 + w.a1) / 2 + 0.04, w.y1, z0 + 0.02, C.trim); // the upper windows' mullion
  }
  for (const w of WIN) fb.boxMinMax(w.a0, gy, z0 - 0.06, w.a1, w.y0 - 0.1, z0 + 0.02, C.brickDark);
  fb.boxMinMax(DOOR.a0 - 0.12, DOOR.y1 - 0.003, z0 - 0.1, DOOR.a1 + 0.12, DOOR.y1 + 0.16, z0 + 0.02, C.trim);
  for (const x of [DOOR.a0, DOOR.a1]) fb.boxMinMax(x - 0.08, gy, z0 - 0.08, x + 0.04, DOOR.y1, z0 + 0.02, C.trim);
  // glass (lit at night, see-through near): the shop windows and the upper ones
  for (const w of [...WIN, ...UP]) pane('front', (w.a0 + w.a1) / 2, (w.y0 + w.y1) / 2, minZ + IN, w.a1 - w.a0 + 2 * BURY, w.y1 - w.y0 + 2 * BURY, PANE);
  // the awning: green and cream stripes over the windows and the door, a scalloped edge
  const aw = maxX - minX - 0.6, n = 14;
  for (let i = 0; i < n; i++) {
    const ax = minX + 0.3 + (i + 0.5) * (aw / n);
    fb.add(GEO.box, i % 2 ? C.cream : C.green, { x: ax, y: gy + 3.38, z: minZ - 0.72, sx: aw / n, sy: 0.07, sz: 1.55, rx: -0.33 });
    fb.add(GEO.box, i % 2 ? C.cream : C.green, { x: ax, y: gy + 3.0, z: minZ - 1.47, sx: aw / n, sy: 0.24, sz: 0.04 });
    for (const k of [-0.25, 0.25]) fb.add(GEO.cyl8, i % 2 ? C.cream : C.green, { x: ax + k * aw / n, y: gy + 2.88, z: minZ - 1.46, sx: aw / n / 4, sy: 0.03, sz: aw / n / 4, rx: Math.PI / 2 }); // scallops under it
  }
  // inside face of the front wall: cream above a wood wainscot
  holeyWall(fb, 'x', iMinX, iMaxX, z1, z1 + 0.03, fy, fy + 1.0, [DOOR, ...WIN], C.wainscot);
  holeyWall(fb, 'x', iMinX, iMaxX, z1, z1 + 0.03, fy + 1.0, top - 0.25, [DOOR, ...WIN, ...UP], C.wallIn);
  // planters either side of the door, outside
  for (const k of [-1, 1]) { if (propsReady('planter_brick')) addProp(fb, 'planter_brick', { x: sx + k * 1.55, y: gy, z: minZ - 0.435, yaw: Math.PI }, { skin: 'fern' }); else { fb.boxMinMax(sx + k * 1.55 - 0.32, gy, minZ - 0.75, sx + k * 1.55 + 0.32, gy + 0.5, minZ - 0.12, C.brickDark); plant(fb, sx + k * 1.55, gy + 0.05, minZ - 0.44, 1.05, C.brickDark); } colliders.push({ type: 'box', minX: sx + k * 1.55 - 0.35, maxX: sx + k * 1.55 + 0.35, minZ: minZ - 0.78, maxZ: minZ }); }
  // the front walk: pavers from the sidewalk to the door
  for (let zz = -119.0; zz < minZ - 0.05; zz += 0.62) for (const k of [-1, 0, 1]) fb.add(GEO.box, (Math.round(zz * 3) + k) % 3 ? '#cfc6b4' : '#bdb3a0', { x: sx + k * 0.82, y: 0.352, z: zz + 0.29, sx: 0.78, sy: 0.04, sz: 0.58 });
  // the giant meeple on the raised front (orange, a little turned to the street's east end)
  fb.add(meepleGeometry(), '#ff9a1f', { x: sx, y: top + 2.12, z: minZ + 0.1, sx: 2.2, sy: 2.2, sz: 2.2, ry: -0.18 });
  // lantern over the door
  const fBulbs = new Bulbs();
  if (propsReady('wall_lantern')) addProp(fb, 'wall_lantern', { x: sx, y: gy + 3.0, z: minZ, yaw: Math.PI }, { skin: 'ink', glow: true, glowB: { add: (geo, m, o) => fBulbs.add(geo.clone().applyMatrix4(o.matrix), '#ffe0a0') } }); // (props-static: on the wall, its glass in the store's bulbs)
  else {
    fb.add(GEO.box, C.ink, { x: sx, y: gy + 3.0, z: minZ - 0.22, sx: 0.26, sy: 0.32, sz: 0.26 });
    fBulbs.add(GEO.box, '#ffe0a0', { x: sx, y: gy + 3.0, z: minZ - 0.22, sx: 0.18, sy: 0.24, sz: 0.28 });
  }
  addNightSpot({ x: sx, y: gy + 3.0, z: minZ - 0.8, color: '#ffe0a0', pool: 3.4, gy, halo: 0 }, false); // (outside, at the lantern over the door: fire-season)
  // string lights along the awning's edge (glow at night)
  for (let i = 0; i <= 22; i++) { const t = i / 22, x = minX + 0.4 + t * (maxX - minX - 0.8); fBulbs.add(GEO.ico0, ['#ffd27a', '#ff9a8a', '#9ad8ff', '#b8f09a'][i % 4], { x, y: gy + 2.98 - Math.sin(t * Math.PI * 7) ** 2 * 0.12, z: minZ - 1.55, sx: 0.065, sy: 0.08, sz: 0.065 }); }
  // printed: the hours by the door
  face(fb, posterMat, art.posters.uv('hours'), sx + 1.52, gy + 2.0, minZ - 0.03, 0.62, 0.62, Math.PI); // (above the planter's leaves)
  // the window display (west window, inside): a low plinth with game boxes standing on it (clear of the west shelf)
  const WD = WIN[0];
  // (its top 5 cm over the window's sill, gy + 0.75: at gy + 0.72 the boxes' bottom edges stood behind the wall from the street,
  // the signs audit)
  fb.boxMinMax(WD.a0 + 0.42, fy, z1 + 0.03, WD.a1, gy + 0.8, z1 + 0.5, C.woodMid); // (in front of the wainscot)
  colliders.push({ type: 'box', minX: WD.a0 + 0.42, maxX: WD.a1, minZ: z1, maxZ: z1 + 0.55 });
  (art.display || []).forEach((bx, i) => {
    const x = WD.a0 + 0.9 + i * 0.85, y = gy + 0.8 + 0.32, z = z1 + 0.28, yaw = (i % 2 ? -0.18 : 0.15);
    fb.add(GEO.box, '#f4f2ea', { x, y, z, sx: 0.5, sy: 0.64, sz: 0.14, ry: yaw });
    const [fx, fz] = turn(x, z, yaw, 0, 0.072); face(fb, boxMat, art.boxArt.uv(bx.art), fx, y, fz, 0.5, 0.64, yaw); // its art to the shop
    const [bx2, bz2] = turn(x, z, yaw, 0, -0.072); face(fb, boxMat, art.boxArt.uv(bx.art), bx2, y, bz2, 0.5, 0.64, yaw + Math.PI); // and to the street, through the glass
  });
  // the leaderboard in the east window (by the demo table): a card hung on the glass, its face to the street and to the shop (redrawn
  // as the stats change). store-windows: in the window's upper east corner, so the rest of the glass shows the demo table
  const W0 = WIN[1], bw = 2.3, bh = bw * 576 / 1024, bx0 = W0.a1 - 0.12 - bw / 2, by0 = W0.y1 - 0.1 - bh / 2;
  const boardMat = new THREE.MeshBasicMaterial({ map: art.board.tex, fog: true });
  const boardOut = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), boardMat); boardOut.position.set(bx0, by0, minZ + IN - 0.025); boardOut.rotation.y = Math.PI;
  const boardIn = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), boardMat); boardIn.position.set(bx0, by0, minZ + IN + 0.025);
  boardOut.name = 'store-board'; boardIn.name = 'store-board-in';
  sides.front.add(boardOut, boardIn);
  fb.build(sides.front, 'store-front');
  buildPanes('front');
  fBulbs.build(sides.front, 'store-front-bulbs');

  // -- the side walls (west, east): painted boards, a window at loft height each, the inside cream over a wainscot, the loft teal
  const sideWall = (name, x0, x1, inX, dir) => {
    const b = side(name);
    // a high window over the west shelf (the bakery side), one at loft height in the east wall by the painting corner
    const shopWin = name === 'west' ? [{ a0: iMinZ + 0.9, a1: iMinZ + 2.5, y0: gy + 3.3, y1: gy + 4.6 }] : [];
    const loftWin = name === 'east' ? [{ a0: maxZ - 1.9, a1: maxZ - 0.7, y0: LY + 0.9, y1: LY + 2.2 }] : [];
    const win = [...shopWin, ...loftWin];
    for (const w of win) windows.push({ x: dir > 0 ? minX : maxX, ...w, out: -dir, ...(w.y0 > LY ? { edge: { z: zL, y: LY } } : {}) }); // (the loft's: over its edge)
    // between the front and back walls, which cover the corners, so no end of it is in their outer faces. The plinth and the band
    // start inside the front's corner pilaster and end flush with the back's own, the same colour
    holeyWall(b, 'z', minZ + T, maxZ - T, x0, x1, gy, top, win, C.side);
    b.boxMinMax(x0 - 0.06, gy, minZ + 0.05, x1 + 0.06, gy + 0.5, maxZ + 0.06, C.sideDark); // a plinth along the bottom
    b.boxMinMax(x0 - 0.05, top - 0.25, minZ + 0.05, x1 + 0.05, top, maxZ + 0.05, C.trim);  // the top band
    for (const w of win) {
      pane(name, dir > 0 ? x0 + IN : x1 - IN, (w.y0 + w.y1) / 2, (w.a0 + w.a1) / 2, PANE, w.y1 - w.y0 + 2 * BURY, w.a1 - w.a0 + 2 * BURY);
      b.boxMinMax(x0 - 0.1, w.y0 - 0.1, w.a0 - 0.1, x1 + 0.1, w.y0 + 0.003, w.a1 + 0.1, C.trim);
      b.boxMinMax(x0 - 0.06, w.y1 - 0.003, w.a0 - 0.08, x1 + 0.06, w.y1 + 0.12, w.a1 + 0.08, C.trim);
      for (const z of [w.a0, w.a1]) b.boxMinMax(x0 - 0.05, w.y0, z - 0.06, x1 + 0.05, w.y1, z + 0.06, C.trim);
    }
    // inside: the wainscot and the cream wall on the shop floor, the loft's teal above its floor at the back
    const t0 = dir > 0 ? inX : inX - 0.03, t1 = dir > 0 ? inX + 0.03 : inX;
    b.boxMinMax(t0, fy, iMinZ, t1, fy + 1.0, zL, C.wainscot);
    b.boxMinMax(dir > 0 ? t0 : t0 - 0.02, fy + 1.0, iMinZ, dir > 0 ? t1 + 0.02 : t1, fy + 1.06, zL - 0.003, C.board); // (its end in the top step, not in its face)
    holeyWall(b, 'z', iMinZ, zL, t0, t1, fy + 1.06, top - 0.25, shopWin, C.wallIn);
    holeyWall(b, 'z', zL, iMaxZ, t0, t1, LY, top - 0.25, loftWin, C.loftWall);
    b.build(sides[name], 'store-' + name);
    buildPanes(name);
  };
  sideWall('west', minX, minX + T, iMinX, 1);
  { const mb = new Batcher({ castShadow: false }); face(mb, posterMat, art.posters.uv('dragon'), minX - 0.03, gy + 3.2, minZ + 9.2, 2.6, 2.6, -Math.PI / 2); face(mb, posterMat, art.posters.uv('roll'), minX - 0.03, gy + 2.9, minZ + 5.6, 2.2, 2.2, -Math.PI / 2); mb.build(sides.west, 'store-mural'); }
  sideWall('east', maxX - T, maxX, iMaxX, -1);

  // -- back (south): the window-seat window at loft height, a back door, the loft's teal inside
  const bb = side('back');
  const BW = { a0: sx - 1.3, a1: sx + 1.3, y0: LY + 0.55, y1: LY + 2.25 };
  const OD = P.outDoor, ODH = { a0: OD.x0, a1: OD.x1, y0: gy, y1: OD.y1 };
  holeyWall(bb, 'x', minX, maxX, maxZ - T, maxZ, gy, top, [BW, ODH], C.side);
  windows.push({ z: maxZ, ...BW, out: 1, edge: { z: zL, y: LY } }); // (the loft's window: seen from the shop floor only over the loft's edge)
  bb.boxMinMax(minX, gy, maxZ - 0.06, OD.x0 + 0.04, gy + 0.5, maxZ + 0.06, C.sideDark); // the plinth, either side of the door (its ends buried in the jambs: never in the wall's cut faces)
  bb.boxMinMax(OD.x1 - 0.04, gy, maxZ - 0.06, maxX, gy + 0.5, maxZ + 0.06, C.sideDark);
  bb.boxMinMax(minX, top - 0.25, maxZ - 0.05, maxX, top, maxZ + 0.05, C.trim);
  pane('back', sx, (BW.y0 + BW.y1) / 2, maxZ - IN, BW.a1 - BW.a0 + 2 * BURY, BW.y1 - BW.y0 + 2 * BURY, PANE);
  bb.boxMinMax(BW.a0 - 0.12, BW.y0 - 0.12, maxZ - 0.02, BW.a1 + 0.12, BW.y0 + 0.003, maxZ + 0.12, C.trim);
  bb.boxMinMax(BW.a0 - 0.1, BW.y1 - 0.003, maxZ - 0.02, BW.a1 + 0.1, BW.y1 + 0.14, maxZ + 0.1, C.trim);
  bb.boxMinMax(sx - 0.03, BW.y0, maxZ - 0.02, sx + 0.03, BW.y1, maxZ + 0.04, C.trim);
  // the back room's own door: a full-glass door in a slim dark frame. The frame lines the opening (the jambs, the head, a
  // threshold): no wall face is left bare in it. The leaf is its own group below, hinged at the west jamb, swinging into the room.
  const JW = 0.06, zIn = iMaxZ - 0.03, zOut = maxZ + 0.05, thr = fy + 0.004;
  bb.boxMinMax(OD.x0, gy + 0.001, zIn, OD.x1, thr, maxZ + 0.02, C.woodDark);                       // the threshold
  for (const x of [OD.x0, OD.x1 - JW]) bb.boxMinMax(x, thr, zIn, x + JW, OD.y1 - JW, zOut, C.ink);  // the jambs
  bb.boxMinMax(OD.x0 + JW, OD.y1 - JW, zIn, OD.x1 - JW, OD.y1, zOut, C.ink);                       // the head, between them
  bb.boxMinMax(OD.x0 - 0.1, OD.y1, maxZ + 0.01, OD.x1 + 0.1, OD.y1 + 0.1, maxZ + 0.09, C.trim);     // a cream cap outside
  // the step, the light over the door (a room lamp: on till midnight), two crates west of it and the recycling bin
  bb.boxMinMax(P.step.minX, gy, P.step.minZ, P.step.maxX, P.step.y, P.step.maxZ, '#bdb3a0');
  const bdx = (OD.x0 + OD.x1) / 2;
  bb.add(GEO.box, C.ink, { x: bdx, y: OD.y1 + 0.45, z: maxZ + 0.2, sx: 0.24, sy: 0.3, sz: 0.24 });
  const bBulbs = new Bulbs(ROOM_BULBS);
  bBulbs.add(GEO.box, '#ffe0a0', { x: bdx, y: OD.y1 + 0.45, z: maxZ + 0.2, sx: 0.16, sy: 0.22, sz: 0.26 });
  const backLamp = addRoomSpot({ x: bdx, y: OD.y1 + 0.45, z: maxZ + 0.75, color: '#ffe0a0', pool: 3.0, gy, halo: 0 }); // (at the lamp: fire-season)
  for (const [x, z, s, r] of [[sx + 1.7, maxZ + 0.7, 0.6, 0.1], [sx + 1.8, maxZ + 0.75, 0.45, -0.2]]) bb.add(GEO.box, '#b98a5a', { x, y: gy + s / 2 + (s < 0.5 ? 0.6 : 0), z, sx: s, sy: s, sz: s, ry: r });
  bb.boxMinMax(sx - 5.6, gy, maxZ + 0.2, sx - 4.2, gy + 1.15, maxZ + 1.1, '#3f6fa8'); // the bin
  bb.boxMinMax(sx - 5.65, gy + 1.15, maxZ + 0.15, sx - 4.15, gy + 1.25, maxZ + 1.15, '#2b3a4e');
  colliders.push({ type: 'box', minX: sx - 5.7, maxX: sx - 4.1, minZ: maxZ, maxZ: maxZ + 1.2 }, { type: 'box', minX: sx + 1.35, maxX: sx + 2.1, minZ: maxZ, maxZ: maxZ + 1.1 });
  // the path: pavers like the front walk's, along the back then up the east side to the sidewalk (laid once: the two legs meet
  // at the corner without a paver over another)
  const paver = (x, z, w, d, i) => bb.add(GEO.box, i % 3 ? '#cfc6b4' : '#bdb3a0', { x, y: P.path.y - 0.018, z, sx: w, sy: 0.04, sz: d });
  { const A = P.path.back, B = P.path.side; let i = 0;
    for (let x = A.minX; x + 0.58 <= A.maxX + 0.01; x += 0.62) for (const k of [0, 1]) paver(x + 0.29, A.minZ + 0.39 + k * 0.82, 0.58, 0.78, i++);
    for (let z = B.minZ; z + 0.58 <= B.maxZ + 0.01; z += 0.62) for (const k of [0, 1]) paver(B.minX + 0.39 + k * 0.82, z + 0.29, 0.78, 0.58, i++); }
  // inside: the loft's teal (the stockroom below is never seen)
  holeyWall(bb, 'x', iMinX, iMaxX, iMaxZ - 0.03, iMaxZ, LY, top - 0.25, [BW], C.loftWall);
  bb.build(sides.back, 'store-back');
  buildPanes('back');
  bBulbs.build(sides.back, 'store-back-bulbs');
  // the leaf: a slim dark frame round one big clear pane, a gold push bar, small gold lettering readable from outside
  const outDoor = new THREE.Group(); outDoor.name = 'store-back-door';
  const outLeaf = new THREE.Group(); outLeaf.position.set(OD.x0 + JW + 0.012, thr + 0.012, maxZ - 0.12); outLeaf.name = 'store-back-door-leaf';
  {
    const W = OD.x1 - OD.x0 - 2 * JW - 0.024, H = OD.y1 - JW - thr - 0.024, R0 = 0.14, R1 = 0.08, S = 0.06;
    const add = (x, y, z, sx, sy, sz, c) => { const m = new THREE.Mesh(GEO.box, toon(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); outLeaf.add(m); };
    add(W / 2, R0 / 2, 0, W, R0, 0.05, C.ink);                                   // the bottom rail
    add(W / 2, H - R1 / 2, 0, W, R1, 0.05, C.ink);                               // the top rail
    for (const x of [S / 2, W - S / 2]) add(x, (R0 + H - R1) / 2, 0, S, H - R0 - R1, 0.05, C.ink); // the stiles, between the rails
    for (const zz of [-0.045, 0.045]) add(W - 0.14, 1.0, zz, 0.04, 0.32, 0.03, '#e0b54a');        // the push bar, both faces
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * S, H - R0 - R1), new THREE.MeshBasicMaterial({ color: '#d8ecf4', transparent: true, opacity: 0.18, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    glass.position.set(W / 2, (R0 + H - R1) / 2, 0); glass.name = 'store-back-door-glass'; glass.renderOrder = 2; outLeaf.add(glass);
    const letters = doorLettering('BACK ROOM');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: letters.tex, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    sign.position.set(W / 2, 1.55, 0.004); sign.name = 'store-back-door-lettering'; sign.renderOrder = 3; outLeaf.add(sign);
    outLeaf.userData = { glass, sign, letters };
  }
  outDoor.add(outLeaf); sides.back.add(outDoor);
  const outCol = { type: 'box', minX: OD.x0, maxX: OD.x1, minZ: maxZ - 0.3, maxZ: maxZ + 0.02, maxY: LY - 1, door: true };

  // -- the roof (hidden while you are inside): a slab, a low lip round three sides, a rooftop unit and a vent
  const rb = side('roof');
  rb.boxMinMax(minX - 0.3, top, minZ + T, maxX + 0.3, top + 0.3, maxZ + 0.3, C.roof);
  for (const [a, b2, c2, d2] of [[minX - 0.3, maxZ, maxX + 0.3, maxZ + 0.3], [minX - 0.3, minZ + T, minX, maxZ + 0.3], [maxX, minZ + T, maxX + 0.3, maxZ + 0.3]]) rb.boxMinMax(a, top + 0.3, b2, c2, top + 0.6, d2, C.roofLip);
  rb.boxMinMax(sx + 2, top + 0.3, maxZ - 4, sx + 3.6, top + 1.1, maxZ - 2.6, '#9aa3ad');
  rb.add(GEO.cyl12, '#6b7078', { x: sx + 2.8, y: top + 1.15, z: maxZ - 3.3, sx: 0.5, sy: 0.08, sz: 0.5 });
  rb.add(GEO.cyl8, '#9aa3ad', { x: sx - 3, y: top + 0.7, z: maxZ - 3, sx: 0.12, sy: 0.8, sz: 0.12 });
  rb.build(sides.roof, 'store-roof');

  // colliders: the walls (the door gaps in front and at the back; over the back door the loft's wall stays whole)
  colliders.push({ type: 'box', minX, maxX: OD.x0, minZ: maxZ - 0.3, maxZ }, { type: 'box', minX: OD.x1, maxX, minZ: maxZ - 0.3, maxZ }, { type: 'box', minX: OD.x0, maxX: OD.x1, minZ: maxZ - 0.3, maxZ, minY: LY - 1 }, outCol,
    { type: 'box', minX, maxX: minX + 0.3, minZ, maxZ }, { type: 'box', minX: maxX - 0.3, maxX, minZ, maxZ },
    { type: 'box', minX, maxX: sx - 0.9, minZ, maxZ: minZ + 0.3 }, { type: 'box', minX: sx + 0.9, maxX, minZ, maxZ: minZ + 0.3 });

  // ---------------------------------------------------------------- inside (one batch, castShadow off: it is under a roof)
  const inside = new THREE.Group(); inside.name = 'store-inside'; g.add(inside);
  const b = new Batcher({ vertexColors: true, castShadow: false });
  const bulbs = new Bulbs();
  // the shop floor: boards, a rug under the tables
  b.boxMinMax(minX + 0.003, gy, minZ + 0.003, maxX - 0.003, fy, maxZ - 0.003, C.floor); // (a hair inside the walls' outer faces)
  for (let x = minX + 0.5; x < maxX; x += 0.9) b.boxMinMax(x, fy, iMinZ, x + 0.04, fy + 0.004, zL - 0.003, C.plank);
  b.boxMinMax(sx - 5.0, fy, minZ + 1.4, sx + 4.2, fy + 0.012, zL - 0.6, '#b8574a');
  b.boxMinMax(sx - 4.8, fy + 0.002, minZ + 1.6, sx + 4.0, fy + 0.014, zL - 0.8, '#e8c27a');
  b.boxMinMax(sx - 4.5, fy + 0.004, minZ + 1.9, sx + 3.7, fy + 0.016, zL - 1.1, '#b8574a');

  // the ceiling: warm boards under the roof with beams across (the roof stays on, and from inside it read as a dark slab)
  b.boxMinMax(iMinX, top - 0.05, iMinZ, iMaxX, top - 0.01, iMaxZ, '#d9b47c');
  for (let x = iMinX + 1.2; x < iMaxX - 0.5; x += 2.3) b.boxMinMax(x - 0.09, top - 0.28, iMinZ, x + 0.09, top - 0.05, iMaxZ, C.woodMid);
  b.boxMinMax(iMinX, top - 0.24, zL - 0.1, iMaxX, top - 0.05, zL + 0.1, C.woodMid);
  // tables and chairs (the demo table's things are built by game-store.js on top of its felt)
  const seats = [];
  for (const t of P.tables) {
    table(b, t.x, fy, t.z, t.felt);
    colliders.push({ type: 'circle', x: t.x, z: t.z, r: P.TR + 0.08 });
    for (const s of t.seats) { chair(b, s.x, fy, s.z, s.yaw); colliders.push({ type: 'circle', x: s.x, z: s.z, r: 0.2, seat: true }); seats.push({ ...s, y: fy, seatY: PLAN.SEAT, front: CHAIR_FRONT, name: 'chair', hint: t.id === 'demo' ? 'E  Sit at the demo table' : 'E  Sit at the table', floor: 'shop' }); }
  }
  // pendant lamps over the four tables
  for (const t of P.tables) {
    b.add(GEO.cyl6, C.ink, { x: t.x, y: (top + gy + 3.3) / 2, z: t.z, sx: 0.012, sy: top - gy - 3.3, sz: 0.012 });
    b.add(GEO.cone8, t.felt, { x: t.x, y: gy + 3.25, z: t.z, sx: 0.36, sy: 0.3, sz: 0.36 });
    bulbs.add(SPH, '#fff3c4', { x: t.x, y: gy + 3.06, z: t.z, sx: 0.1, sy: 0.1, sz: 0.1 });
    addNightSpot({ x: t.x, y: gy + 3.0, z: t.z, color: '#ffe7a8', pool: 2.2, gy: fy, halo: 0 }); // (no halo: a halo shows through the walls from the street)
  }

  // the shelves at the front: hollow cases along the side walls; the games' boxes stand on the middle boards (placed below),
  // stacks of games lie on the bottom ones, towers of them stand on top
  for (const sh of P.shelves) {
    const k = sh.side ? -1 : 1, wall = sh.side ? iMaxX : iMinX;
    bookcase(b, 'z', wall, k, sh.z0, sh.z1, fy, 2.4, [0.05, 0.8, 1.55], 0.62, C.wood, (r, y, rowH, put) => {
      if (r === 0) for (let i = 0; i < 4; i++) { const a = sh.z0 + 0.4 + i * 0.7; for (let j = 0; j < 3 + (i % 2); j++) put(a + ((i + j) % 3 - 1) * 0.02, 0.33, y + 0.06 + j * 0.13, 0.5, 0.42, 0.12, SPINES[(i * 4 + j * 3 + sh.side * 5) % SPINES.length]); }
      if (r === 2) for (let i = 0; i < 4; i++) boxTower(b, wall + k * 0.32, y, sh.z0 + 0.4 + i * 0.7, 3 + (i % 2), i + sh.side * 5, Math.PI / 2);
    });
    colliders.push({ type: 'box', minX: sh.side ? wall - 0.66 : wall, maxX: sh.side ? wall : wall + 0.66, minZ: sh.z0, maxZ: sh.z1 });
  }

  // Clem's counter (left as you walk in): a body with a printed front, the top, the register, a bell, a jar of dice; a
  // flap closing the end by the door; Clem's wall shelves of dice and minis behind
  const K = P.counter;
  b.boxMinMax(K.minX, fy, K.minZ, K.maxX, fy + 1.0, K.maxZ, C.woodDark);
  b.boxMinMax(K.minX - 0.08, fy + 1.0, K.minZ - 0.06, K.maxX + 0.04, fy + 1.07, K.maxZ + 0.06, C.board);
  b.boxMinMax(K.maxX, fy, K.minZ, iMaxX, fy + 1.0, K.minZ + 0.25, C.woodDark);
  b.boxMinMax(K.maxX, fy + 1.0, K.minZ - 0.04, iMaxX, fy + 1.07, K.minZ + 0.29, C.board);
  b.add(GEO.box, '#2b2b2f', { x: (K.minX + K.maxX) / 2, y: fy + 1.25, z: K.maxZ - 0.7, sx: 0.4, sy: 0.32, sz: 0.5, ry: 0.2 });
  b.add(GEO.box, '#e0463c', { x: (K.minX + K.maxX) / 2 - 0.12, y: fy + 1.43, z: K.maxZ - 0.7, sx: 0.08, sy: 0.04, sz: 0.3, ry: 0.2 });
  b.add(GEO.cyl12, '#e0b54a', { x: K.minX + 0.2, y: fy + 1.11, z: K.minZ + 0.6, sx: 0.07, sy: 0.04, sz: 0.07 });
  b.add(SPH, '#e0b54a', { x: K.minX + 0.2, y: fy + 1.15, z: K.minZ + 0.6, sx: 0.06, sy: 0.05, sz: 0.06 });
  b.add(GEO.cyl12, '#cfe6ee', { x: K.minX + 0.3, y: fy + 1.2, z: K.minZ + 1.5, sx: 0.13, sy: 0.24, sz: 0.13 });
  for (let i = 0; i < 9; i++) b.add(i % 3 ? GEO.ico0 : GEO.box, SPINES[i], { x: K.minX + 0.3 + ((i % 3) - 1) * 0.06, y: fy + 1.33 + Math.floor(i / 3) * 0.03, z: K.minZ + 1.5 + ((i * 2 % 3) - 1) * 0.05, sx: 0.04, sy: 0.04, sz: 0.04, ry: i });
  face(b, posterMat, art.posters.uv('dice'), K.minX - 0.005, fy + 0.55, (K.minZ + K.maxZ) / 2, 0.75, 0.75, -Math.PI / 2);
  for (const y of [1.45, 2.05]) b.boxMinMax(iMaxX - 0.28, fy + y, K.minZ, iMaxX, fy + y + 0.04, K.maxZ, C.board);
  for (let i = 0; i < 12; i++) { const y = fy + (i < 6 ? 1.49 : 2.09), z = K.minZ + 0.35 + (i % 6) * 0.72; b.add(GEO.cyl12, '#cfe6ee', { x: iMaxX - 0.14, y: y + 0.1, z, sx: 0.08, sy: 0.2, sz: 0.08 }); b.add(GEO.ico0, SPINES[(i * 5) % SPINES.length], { x: iMaxX - 0.14, y: y + 0.24, z, sx: 0.07, sy: 0.07, sz: 0.07 }); }
  colliders.push({ type: 'box', minX: K.minX - 0.1, maxX: iMaxX, minZ: K.minZ - 0.1, maxZ: K.maxZ + 0.1 });

  // the stairs up the west wall: solid steps with a lighter nose, a skirt board, a handrail on posts, a rail on the wall
  for (let i = 0; i < ST.n; i++) {
    const za = ST.z0 + i * ST.tread, zb = za + ST.tread, y = fy + (i + 1) * ST.rise;
    b.boxMinMax(ST.minX + 0.03, fy, za, ST.maxX, y, zb, i % 2 ? '#9a6b43' : '#a37349'); // (in front of the wall's wainscot, not through it)
    b.boxMinMax(ST.minX + 0.03, y - 0.035, za - 0.03, ST.maxX + 0.02, y + 0.005, za + 0.06, C.board);
  }
  const run = ST.z1 - ST.z0, rise = LY - fy, ang = Math.atan2(rise, run), slope = Math.hypot(run, rise);
  b.add(GEO.box, C.woodDark, { x: ST.maxX + 0.03, y: fy + rise / 2 + 0.05, z: (ST.z0 + ST.z1) / 2, sx: 0.06, sy: 0.32, sz: slope + 0.15, rx: -ang });
  b.add(GEO.box, C.woodDark, { x: ST.maxX + 0.03, y: fy + rise / 2 + 1.0, z: (ST.z0 + ST.z1) / 2 + 0.15, sx: 0.08, sy: 0.07, sz: slope - 0.2, rx: -ang });
  for (let i = 2; i < ST.n; i += 2) { const z = ST.z0 + (i + 0.5) * ST.tread, y = fy + (i + 1) * ST.rise; b.boxMinMax(ST.maxX + 0.005, y, z - 0.025, ST.maxX + 0.045, y + 0.95, z + 0.025, C.woodMid); } // (inside the skirt's faces)
  b.boxMinMax(ST.maxX - 0.02, fy, ST.z0 + 0.9, ST.maxX + 0.1, fy + 1.15, ST.z0 + 1.0, C.woodDark); // the newel post at the foot
  b.add(SPH, C.board, { x: ST.maxX + 0.04, y: fy + 1.2, z: ST.z0 + 0.95, sx: 0.08, sy: 0.08, sz: 0.08 });
  b.add(GEO.box, C.woodMid, { x: ST.minX + 0.05, y: fy + rise / 2 + 0.95, z: (ST.z0 + ST.z1) / 2, sx: 0.05, sy: 0.05, sz: slope, rx: -ang });
  colliders.push({ type: 'box', minX: ST.maxX - 0.05, maxX: ST.maxX + 0.1, minZ: ST.z0 + 0.9, maxZ: zL + 0.12 });

  // the back room's front wall under the loft's edge: cubbies of games, the half-glass door, the events chalkboard, towers
  const BDH = [{ a0: P.back.door.x0, a1: P.back.door.x1, y0: fy, y1: P.back.door.y1 }];
  holeyWall(b, 'x', ST.maxX, iMaxX, zL - 0.12, zL + 0.05, fy, LY - 0.3, BDH, C.wallIn);
  holeyWall(b, 'x', ST.maxX, iMaxX, zL - 0.15, zL - 0.12, fy, fy + 1.0, BDH, C.wainscot);
  const cub = { a0: ST.maxX + 0.95, a1: sx - 1.0 };
  bookcase(b, 'x', zL - 0.12, -1, cub.a0, cub.a1, fy, 2.1, [0.05, 0.55, 1.05, 1.55], 0.36, C.wood, (r, y, rowH, put) => {
    for (let c = 1; c < 5; c++) put(cub.a0 + c * (cub.a1 - cub.a0) / 5, 0.18, y + rowH / 2 + 0.03, 0.04, 0.34, rowH + 0.06, C.wood); // dividers
    for (let c = 0; c < 5; c++) { const ca = cub.a0 + c * (cub.a1 - cub.a0) / 5, cb = ca + (cub.a1 - cub.a0) / 5; if ((r * 5 + c) % 4 === 1) put((ca + cb) / 2, 0.2, y + 0.16, cb - ca - 0.14, 0.3, 0.3, SPINES[(r + c * 3) % SPINES.length]); else spines(put, ca, cb, y, rowH, 0.26, r * 5 + c); }
  });
  face(b, posterMat, art.posters.uv2('events', 'events2'), sx + 1.95, fy + 1.55, zL - 0.13, 2.2, 1.1, Math.PI);
  boxTower(b, ST.maxX + 0.45, fy, zL - 0.5, 9, 2);
  boxTower(b, sx + 3.5, fy, zL - 0.45, 7, 5);
  colliders.push({ type: 'circle', x: ST.maxX + 0.45, z: zL - 0.5, r: 0.35 }, { type: 'circle', x: sx + 3.5, z: zL - 0.45, r: 0.33 }, { type: 'box', minX: cub.a0, maxX: cub.a1, minZ: zL - 0.5, maxZ: zL });

  // the loft: its floor (with beams under the edge), a fascia, the railing, the sign on it. Every collider from here to the
  // loft's plant is the loft's: minY, so it doesn't stop anyone in the back room under it
  const loftC0 = colliders.length;
  b.boxMinMax(iMinX, LY - 0.3, zL, iMaxX, LY, iMaxZ, C.floor);
  for (let x = iMinX + 0.64; x < iMaxX; x += 0.9) b.boxMinMax(x, LY, zL, x + 0.04, LY + 0.004, iMaxZ, C.plank); // (clear of the cases' ends)
  b.boxMinMax(ST.maxX + 0.004, LY - 0.42, zL - 0.08, iMaxX, LY + 0.02, zL + 0.06, C.trim); // (its end a hair in from the wall's and the skirt's)
  b.boxMinMax(ST.maxX, LY + 0.95, zL - 0.06, iMaxX, LY + 1.03, zL + 0.06, C.woodDark);
  b.boxMinMax(ST.maxX, LY + 0.06, zL - 0.04, iMaxX, LY + 0.12, zL + 0.04, C.woodDark);
  for (let x = ST.maxX; x <= iMaxX + 1e-6; x += 0.28) b.boxMinMax(x - 0.025, LY + 0.12, zL - 0.025, x + 0.025, LY + 0.95, zL + 0.025, C.woodMid);
  face(b, posterMat, art.posters.uv('loft'), sx + 0.2, LY + 0.62, zL - 0.075, 0.82, 0.82, Math.PI);
  colliders.push({ type: 'box', minX: ST.maxX, maxX: iMaxX, minZ: zL - 0.12, maxZ: zL + 0.1 });

  // the loft's rooms: a rug, the games library (west wall and the back wall's west end), beanbags, the window seat, a puzzle
  // table, the miniatures painting corner on the east wall, a floor lamp, a plant
  b.boxMinMax(sx - 5.2, LY + 0.004, zL + 0.7, sx + 2.6, LY + 0.012, iMaxZ - 0.5, '#5b4a8a'); // (on the planks: never in their bottoms' plane)
  b.boxMinMax(sx - 5.0, LY + 0.007, zL + 0.9, sx + 2.4, LY + 0.014, iMaxZ - 0.7, '#7d6bb0');
  // (the west wall's case runs along z, the back wall's along x; both are hollow with books and games on five boards)
  const LYS = [0.05, 0.5, 0.95, 1.4, 1.85];
  bookcase(b, 'z', iMinX, 1, zL + 1.9, iMaxZ - 0.45, LY, 2.3, LYS, 0.45, C.woodDark, (r, y, rowH, put) => spines(put, zL + 1.9, iMaxZ - 0.45, y, rowH, 0.3, r + 1));
  bookcase(b, 'x', iMaxZ, -1, iMinX, sx - 1.6, LY, 2.3, LYS, 0.45, C.woodDark, (r, y, rowH, put) => spines(put, iMinX + 0.45, sx - 1.6, y, rowH, 0.3, r + 7));
  colliders.push({ type: 'box', minX: iMinX, maxX: iMinX + 0.48, minZ: zL + 1.9, maxZ: iMaxZ }, { type: 'box', minX: iMinX, maxX: sx - 1.6, minZ: iMaxZ - 0.48, maxZ: iMaxZ });
  // beanbags (seats low on the floor)
  for (const [x, z, col] of [[iMinX + 1.35, zL + 2.4, '#e0463c'], [iMinX + 2.6, iMaxZ - 1.1, '#f0c24f']]) {
    b.add(SPH, col, { x, y: LY + 0.2, z, sx: 0.48, sy: 0.24, sz: 0.48 });
    b.add(SPH, col, { x, y: LY + 0.36, z, sx: 0.36, sy: 0.18, sz: 0.36 });
    const yaw = Math.atan2(sx - x, (zL + 2) - z);
    const [bx, bz] = turn(x, z, yaw, 0, -0.24); b.add(SPH, col, { x: bx, y: LY + 0.48, z: bz, sx: 0.4, sy: 0.3, sz: 0.2, ry: yaw });
    seats.push({ x, z, y: LY, yaw, seatY: 0.44, name: 'beanbag', hint: 'E  Flop on the beanbag', floor: 'loft', reach: 0.95 });
    colliders.push({ type: 'circle', x, z, r: 0.38, seat: true });
  }
  // the window seat (back wall, under the window): a bench, a cushion, two pillows; two seats looking out over the shop
  b.boxMinMax(BW.a0 - 0.1, LY - 0.01, iMaxZ - 0.62, BW.a1 + 0.1, LY + 0.22, iMaxZ, C.wood); // (seat-height: the cushion's top 0.32, was 0.5) // (its foot sunk into the floor: not in the planks' plane)
  b.boxMinMax(BW.a0, LY + 0.22, iMaxZ - 0.58, BW.a1, LY + 0.32, iMaxZ - 0.02, '#3f8fd9');
  for (const k of [-1, 1]) b.add(GEO.box, k < 0 ? '#f0c24f' : '#ff8fb8', { x: sx + k * 1.0, y: LY + 0.5, z: iMaxZ - 0.2, sx: 0.4, sy: 0.32, sz: 0.14, rz: k * 0.15 });
  for (const k of [-1, 1]) seats.push({ x: sx + k * 0.55, z: iMaxZ - 0.33, y: LY, yaw: Math.PI, seatY: 0.3, name: 'window seat', hint: 'E  Sit in the window seat', floor: 'loft', reach: 0.95 });
  colliders.push({ type: 'box', minX: BW.a0 - 0.1, maxX: BW.a1 + 0.1, minZ: iMaxZ - 0.62, maxZ: iMaxZ });
  // the puzzle table: a square top with a jigsaw half done, the box lid, two chairs
  const PZ = { x: sx + 2.4, z: zL + 2.2 };
  b.boxMinMax(PZ.x - 0.55, LY - PLAN.DROP + 0.7, PZ.z - 0.45, PZ.x + 0.55, LY - PLAN.DROP + 0.76, PZ.z + 0.45, C.wood);
  for (const [kx, kz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.boxMinMax(PZ.x + kx * 0.48 - 0.03, LY, PZ.z + kz * 0.38 - 0.03, PZ.x + kx * 0.48 + 0.03, LY - PLAN.DROP + 0.7, PZ.z + kz * 0.38 + 0.03, C.woodDark);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if ((i + j * 2) % 7 !== 3 && !(i > 3 && j > 1)) b.add(GEO.box, ['#6fd3ff', '#7ddc7a', '#3f8fd9', '#f0c24f'][(i * 3 + j) % 4], { x: PZ.x - 0.32 + i * 0.12, y: LY - PLAN.DROP + 0.765, z: PZ.z - 0.2 + j * 0.12, sx: 0.11, sy: 0.008, sz: 0.11 });
  b.add(GEO.box, '#b48cff', { x: PZ.x + 0.32, y: LY - PLAN.DROP + 0.78, z: PZ.z + 0.26, sx: 0.3, sy: 0.04, sz: 0.22, ry: 0.4 });
  for (const k of [-1, 1]) { const x = PZ.x + k * 0.85, yaw = k < 0 ? Math.PI / 2 : -Math.PI / 2; chair(b, x, LY, PZ.z, yaw); seats.push({ x, z: PZ.z, y: LY, yaw, seatY: PLAN.SEAT, front: CHAIR_FRONT, name: 'puzzle chair', hint: 'E  Sit at the puzzle table', floor: 'loft' }); colliders.push({ type: 'circle', x, z: PZ.z, r: 0.2, seat: true }); }
  colliders.push({ type: 'box', minX: PZ.x - 0.58, maxX: PZ.x + 0.58, minZ: PZ.z - 0.48, maxZ: PZ.z + 0.48 });
  // the painting corner: a desk on the east wall, a cutting mat, paint pots, little painted minis, a lamp, a shelf of finished
  // ones above, a chair
  const PD = { x0: iMaxX - 0.7, x1: iMaxX, z0: zL + 0.9, z1: zL + 2.9 };
  b.boxMinMax(PD.x0, LY - PLAN.DROP + 0.72, PD.z0, PD.x1, LY - PLAN.DROP + 0.78, PD.z1, C.board);
  b.boxMinMax(PD.x0 + 0.05, LY, PD.z0 + 0.05, PD.x1, LY - PLAN.DROP + 0.72, PD.z0 + 0.12, C.woodDark);
  b.boxMinMax(PD.x0 + 0.05, LY, PD.z1 - 0.12, PD.x1, LY - PLAN.DROP + 0.72, PD.z1 - 0.05, C.woodDark);
  b.boxMinMax(PD.x0 + 0.1, LY - PLAN.DROP + 0.78, PD.z0 + 0.5, PD.x0 + 0.55, LY - PLAN.DROP + 0.79, PD.z0 + 1.2, '#3a8a5a');
  for (let i = 0; i < 8; i++) b.add(GEO.cyl8, ['#e0463c', '#f0c24f', '#7ddc7a', '#3f8fd9', '#ffffff', '#b48cff', '#2b2340', '#ff8fb8'][i], { x: PD.x0 + 0.5 + (i % 2) * 0.08, y: LY - PLAN.DROP + 0.82, z: PD.z0 + 1.35 + Math.floor(i / 2) * 0.09, sx: 0.03, sy: 0.06, sz: 0.03 });
  const mini = (x, y, z, col) => { b.add(GEO.cyl8, '#2b2340', { x, y: y + 0.005, z, sx: 0.025, sy: 0.01, sz: 0.025 }); b.add(GEO.cone6, col, { x, y: y + 0.04, z, sx: 0.018, sy: 0.06, sz: 0.018 }); b.add(SPH, '#f2c79e', { x, y: y + 0.08, z, sx: 0.013, sy: 0.013, sz: 0.013 }); };
  for (let i = 0; i < 4; i++) mini(PD.x0 + 0.25 + (i % 2) * 0.12, LY - PLAN.DROP + 0.79, PD.z0 + 0.65 + Math.floor(i / 2) * 0.2, SPINES[i * 2]);
  b.boxMinMax(iMaxX - 0.25, LY + 1.45, PD.z0 + 0.1, iMaxX, LY + 1.49, PD.z1 - 0.1, C.board);
  for (let i = 0; i < 9; i++) mini(iMaxX - 0.12, LY + 1.49, PD.z0 + 0.25 + i * 0.18, SPINES[(i * 3) % SPINES.length]);
  b.add(GEO.cyl8, C.ink, { x: PD.x0 + 0.5, y: LY - PLAN.DROP + 0.98, z: PD.z0 + 0.35, sx: 0.015, sy: 0.4, sz: 0.015 });
  b.add(GEO.cone8, '#e0463c', { x: PD.x0 + 0.42, y: LY - PLAN.DROP + 1.18, z: PD.z0 + 0.4, sx: 0.12, sy: 0.12, sz: 0.12, rz: 0.6 });
  bulbs.add(SPH, '#fff3c4', { x: PD.x0 + 0.37, y: LY - PLAN.DROP + 1.12, z: PD.z0 + 0.42, sx: 0.04, sy: 0.04, sz: 0.04 });
  chair(b, PD.x0 - 0.38, LY, (PD.z0 + PD.z1) / 2, Math.PI / 2, '#3f6fa8');
  seats.push({ x: PD.x0 - 0.38, z: (PD.z0 + PD.z1) / 2, y: LY, yaw: Math.PI / 2, seatY: PLAN.SEAT, name: 'painting chair', hint: 'E  Sit at the painting desk', floor: 'loft' });
  colliders.push({ type: 'box', minX: PD.x0, maxX: PD.x1, minZ: PD.z0, maxZ: PD.z1 }, { type: 'circle', x: PD.x0 - 0.38, z: (PD.z0 + PD.z1) / 2, r: 0.2, seat: true });
  // a floor lamp by the library, a plant in the back corner
  const FL = { x: iMinX + 0.75, z: iMaxZ - 0.75 };
  b.add(GEO.cyl8, C.ink, { x: FL.x, y: LY + 0.8, z: FL.z, sx: 0.025, sy: 1.6, sz: 0.025 });
  b.add(GEO.cyl8, C.ink, { x: FL.x, y: LY + 0.02, z: FL.z, sx: 0.18, sy: 0.04, sz: 0.18 });
  b.add(GEO.cyl12, '#f3e3c3', { x: FL.x, y: LY + 1.62, z: FL.z, sx: 0.22, sy: 0.26, sz: 0.22 });
  bulbs.add(SPH, '#ffe7a8', { x: FL.x, y: LY + 1.5, z: FL.z, sx: 0.07, sy: 0.07, sz: 0.07 });
  colliders.push({ type: 'circle', x: FL.x, z: FL.z, r: 0.25 });
  plant(b, iMaxX - 0.4, LY, iMaxZ - 0.4, 1.3);
  colliders.push({ type: 'circle', x: iMaxX - 0.4, z: iMaxZ - 0.4, r: 0.35 });
  for (let i = loftC0; i < colliders.length; i++) colliders[i].minY = LY - 1;
  // the back room (D&D night): in the inside batch. Its colliders carry maxY
  const roomBulbs = new Bulbs(ROOM_BULBS); // the room's own bulbs: lit till midnight, after the shop's go off
  const back = buildBackRoom(b, P, { bulbs: roomBulbs, colliders, SPH, addNightSpot: addRoomSpot, bookcase, spines, posterMat, posterUv: art.posters.uv });
  inside.add(back.door);
  seats.push(...back.seats);
  addNightSpot({ x: sx - 1, y: LY + 2.4, z: zL + 2.2, color: '#ffe7a8', pool: 3.2, gy: LY, halo: 0 });
  // Clem's corner and the loft's ends (fire-season: each at a lamp you see): a pendant over Clem's counter, the library's floor
  // lamp, the painting desk's lamp
  b.add(GEO.cyl6, C.ink, { x: P.clem.x - 0.9, y: (top + gy + 3.38) / 2, z: P.clem.z, sx: 0.012, sy: top - gy - 3.38, sz: 0.012 });
  b.add(GEO.cone8, '#2f6b4f', { x: P.clem.x - 0.9, y: gy + 3.3, z: P.clem.z, sx: 0.3, sy: 0.22, sz: 0.3 });
  bulbs.add(SPH, '#fff3c4', { x: P.clem.x - 0.9, y: gy + 3.16, z: P.clem.z, sx: 0.08, sy: 0.08, sz: 0.08 });
  addNightSpot({ x: P.clem.x - 0.9, y: gy + 3.0, z: P.clem.z, color: '#ffe7a8', pool: 1.2, gy: fy, halo: 0 });
  addNightSpot({ x: FL.x + 0.1, y: LY + 1.4, z: FL.z - 0.1, color: '#ffe7a8', pool: 1.2, gy: LY, halo: 0 });
  addNightSpot({ x: PD.x0 + 0.3, y: LY + 1.0, z: PD.z0 + 0.45, color: '#ffe7a8', pool: 1.2, gy: LY, halo: 0 });
  b.add(GEO.cyl6, C.ink, { x: sx - 1, y: (top + LY + 2.5) / 2, z: zL + 2.2, sx: 0.012, sy: top - LY - 2.5, sz: 0.012 });
  b.add(GEO.cone8, '#2f6b4f', { x: sx - 1, y: LY + 2.45, z: zL + 2.2, sx: 0.4, sy: 0.3, sz: 0.4 });
  bulbs.add(SPH, '#fff3c4', { x: sx - 1, y: LY + 2.26, z: zL + 2.2, sx: 0.1, sy: 0.1, sz: 0.1 });

  // plants by the door inside, game-box towers
  plant(b, sx - 1.55, fy, iMinZ + 0.45, 1.25, '#3f6fa8');
  colliders.push({ type: 'circle', x: sx - 1.55, z: iMinZ + 0.45, r: 0.32 });

  // hanging dice over the shop floor (big d20s and d6s on strings) and string lights across the high ceiling
  const DICE = [[sx - 4.3, minZ + 5.2, 4.5, 'd20', '#e0463c'], [sx - 1.0, minZ + 2.2, 4.9, 'd6', '#ffffff'], [sx + 3.8, minZ + 5.0, 4.6, 'd20', '#3f8fd9'],
    [sx - 0.2, minZ + 8.6, 4.7, 'd6', '#f0c24f'], [sx + 4.4, minZ + 1.6, 5.1, 'd20', '#b48cff'], [sx - 4.6, minZ + 1.6, 5.0, 'd6', '#7ddc7a'], [sx + 0.9, minZ + 5.6, 5.4, 'd20', '#ff8fb8']];
  for (const [x, z, y, kind, col] of DICE) {
    b.add(GEO.cyl6, C.ink, { x, y: (y + top) / 2, z, sx: 0.01, sy: top - y, sz: 0.01 });
    if (kind === 'd20') b.add(GEO.ico0, col, { x, y: y - 0.3, z, sx: 0.32, sy: 0.32, sz: 0.32, ry: x });
    else {
      b.add(GEO.box, col, { x, y: y - 0.26, z, sx: 0.44, sy: 0.44, sz: 0.44, ry: 0.5, rx: 0.3 });
      const pip = col === '#ffffff' ? '#e0463c' : C.ink;
      for (const [px, py] of [[-0.1, -0.1], [0, 0], [0.1, 0.1]]) { const [qx, qz] = turn(x, z, 0.5, px, 0.225); b.add(SPH, pip, { x: qx, y: y - 0.26 + py + 0.06 * 0.3, z: qz, sx: 0.04, sy: 0.04, sz: 0.02, ry: 0.5 }); }
    }
  }
  const BULB = ['#ffd27a', '#ff9a8a', '#9ad8ff', '#b8f09a', '#ffe14f'];
  for (const [zA, zB] of [[minZ + 0.8, zL - 0.4], [zL - 0.4, minZ + 0.8]]) {
    // two strands zigzag between the side walls, sagging between hooks
    const hooks = 5;
    for (let h = 0; h < hooks; h++) {
      const xa = iMinX + 0.1, xb = iMaxX - 0.1, za = zA + (zB - zA) * (h / hooks), zb = zA + (zB - zA) * ((h + 1) / hooks);
      const pa = h % 2 ? [xb, za] : [xa, za], pb = h % 2 ? [xa, zb] : [xb, zb];
      const segs = 12;
      let prev = null;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs, x = pa[0] + (pb[0] - pa[0]) * t, z = pa[1] + (pb[1] - pa[1]) * t, y = top - 0.3 - Math.sin(t * Math.PI) * 0.7 - (zA > zB ? 0.25 : 0);
        if (prev) { const dx = x - prev[0], dy = y - prev[1], dz = z - prev[2], L2 = Math.hypot(dx, dy, dz); b.add(GEO.box, C.ink, { x: (x + prev[0]) / 2, y: (y + prev[1]) / 2, z: (z + prev[2]) / 2, sx: 0.015, sy: 0.015, sz: L2, ry: Math.atan2(dx, dz), rx: -Math.asin(dy / L2) }); }
        if (s > 0 && s < segs) bulbs.add(GEO.ico0, BULB[(s + h) % BULB.length], { x, y: y - 0.06, z, sx: 0.05, sy: 0.07, sz: 0.05 });
        prev = [x, y, z];
      }
    }
  }
  // posters (one atlas): inside the front wall, the side walls, the loft's walls
  face(b, posterMat, art.posters.uv('thanks'), sx, gy + 3.25, iMinZ + 0.035, 0.75, 0.75, 0);
  face(b, posterMat, art.posters.uv('meeple'), sx - 4, gy + 3.5, iMinZ + 0.035, 0.8, 0.8, 0);
  face(b, posterMat, art.posters.uv('bookwyrm'), sx + 4, gy + 3.5, iMinZ + 0.035, 0.8, 0.8, 0);
  face(b, posterMat, art.posters.uv('arkham'), iMinX + 0.035, fy + 2.0, iMinZ + 3.75, 0.8, 0.8, Math.PI / 2);
  face(b, posterMat, art.posters.uv('dragon'), iMinX + 0.035, fy + 2.9, ST.z0 + 1.2, 0.9, 0.9, Math.PI / 2);
  face(b, posterMat, art.posters.uv('unicorn'), iMaxX - 0.035, fy + 3.1, iMinZ + 1.75, 0.9, 0.9, -Math.PI / 2);
  face(b, posterMat, art.posters.uv('roll'), iMaxX - 0.035, fy + 2.75, P.clem.z, 0.8, 0.8, -Math.PI / 2);
  face(b, posterMat, art.posters.uv('quiet'), sx - 4.2, LY + 2.75, iMaxZ - 0.04, 0.8, 0.8, Math.PI);
  face(b, posterMat, art.posters.uv('puzzle'), sx + 3.4, LY + 1.4, iMaxZ - 0.04, 0.8, 0.8, Math.PI);
  face(b, posterMat, art.posters.uv('paint'), iMaxX - 0.04, LY + 2.2, (PD.z0 + PD.z1) / 2, 0.8, 0.8, -Math.PI / 2);
  face(b, posterMat, art.posters.uv('roll'), iMinX + 0.04, LY + 2.75, zL + 0.65, 0.7, 0.7, Math.PI / 2);
  // the framed prints (real public-domain illustrations): the frames in this batch, the pictures their own planes
  const prints = hangPrints(b, inside, P);

  // the game boxes on the lower boards (their positions come back to the feature for the E prompts)
  const boxes = art.boxes.map((it, i) => {
    const sh = P.shelves[i % 2], row = Math.floor(i / 2), k = sh.side ? -1 : 1;
    const x = (sh.side ? iMaxX : iMinX) + k * 0.36, z = sh.z0 + 0.5 + (row % 3) * 0.95, y = fy + (row >= 3 ? 1.55 : 0.8) + 0.33;
    const yaw = sh.side ? -Math.PI / 2 : Math.PI / 2;
    b.add(GEO.box, '#f4f2ea', { x, y, z, sx: 0.5, sy: 0.64, sz: 0.14, ry: yaw });
    const [fx, fz] = turn(x, z, yaw, 0, 0.072); face(b, boxMat, art.boxArt.uv(it.art), fx, y, fz, 0.5, 0.64, yaw);
    return { ...it, x, z, y };
  });
  b.build(inside, 'store-inside');
  bulbs.build(inside, 'store-bulbs');
  roomBulbs.build(inside, 'store-bulbs-room');
  prints.load(art.renderer); // the prints' jpgs, now the store stands (parchment until each arrives; each sent to the GPU as it lands)

  // ---------------------------------------------------------------- the dragon (its own little group: it sways)
  const dragonG = new THREE.Group(); dragonG.name = 'store-dragon'; dragonG.position.set(sx - 0.4, gy + 5.0, minZ + 5.4); dragonG.rotation.y = 0.6;
  { const db = new Batcher({ vertexColors: true, castShadow: false }); dragon(db); db.build(dragonG, 'store-dragon'); dragonG.scale.setScalar(1.25); }
  inside.add(dragonG);
  { const sb = new Batcher({ vertexColors: true, castShadow: false }); for (const k of [-1, 1]) sb.add(GEO.cyl6, C.ink, { x: sx - 0.4 + k * 0.5, y: (top + gy + 5.4) / 2, z: minZ + 5.4 + k * 0.3, sx: 0.01, sy: top - gy - 5.4, sz: 0.01 }); sb.build(inside, 'store-dragon-strings'); }

  // ---------------------------------------------------------------- the door (swings open while you are near and the shop is open)
  // two leaves, hinged at the jambs, each with a window and a brass push plate
  const door = new THREE.Group(); door.name = 'store-doors';
  const leaves = [-1, 1].map(k => {
    const leaf = new THREE.Group(); leaf.position.set(sx + k * 0.9, gy, minZ + 0.12);
    const db = new Batcher({ vertexColors: true });
    const lx = -k * 0.445; // the leaf's middle, from its hinge
    // the leaf round its window (store-windows: a real hole with real glass in it): the stiles full height, the rails between them
    // (a hair thinner, their ends 3 mm into the stiles)
    for (const e of [-1, 1]) db.add(GEO.box, C.green, { x: lx + e * 0.3625, y: 1.25, z: 0, sx: 0.145, sy: 2.5, sz: 0.08 });
    db.add(GEO.box, C.green, { x: lx, y: 1.225 / 2, z: 0, sx: 0.586, sy: 1.225, sz: 0.074 });
    db.add(GEO.box, C.green, { x: lx, y: (2.175 + 2.5) / 2, z: 0, sx: 0.586, sy: 0.325, sz: 0.074 });
    db.add(GEO.box, glassReal, { x: lx, y: 1.7, z: 0, sx: 0.6, sy: 0.97, sz: PANE });
    db.add(GEO.box, C.trim, { x: lx, y: 0.55, z: 0, sx: 0.6, sy: 0.5, sz: 0.1 });
    for (const zz of [-0.06, 0.06]) db.add(GEO.box, '#e0b54a', { x: -k * 0.78, y: 1.1, z: zz, sx: 0.06, sy: 0.3, sz: 0.03 });
    for (const m of db.build(leaf, 'store-door')) if (m.material === glassReal) { m.castShadow = false; m.userData.noMerge = true; glassMeshes.push(m); }
    for (const m of leaf.children) m.matrixAutoUpdate = true;
    door.add(leaf);
    return leaf;
  });
  door.userData.leaves = leaves;
  g.add(door);
  const doorCol = { type: 'box', minX: sx - 0.9, maxX: sx + 0.9, minZ: minZ - 0.05, maxZ: minZ + 0.28, door: true };
  colliders.push(doorCol);

  return { sides, inside, dragon: dragonG, door, doorCol, seats, boxes, board: { out: boardOut, in: boardIn }, frontGlassZ: minZ, lamps: INDOOR.splice(0), roomLamps: ROOM.splice(0), backLamp, glass: glassLit, glassReal, glassU, glassMeshes, windows, back, outDoor: { group: outDoor, leaf: outLeaf, col: outCol }, prints };
}
