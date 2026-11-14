// The picnic area: layout.js PICNIC_BLOCK round the `north-lawn` slot, open on all sides. Everything here is in u (metres east
// of the slot) and v (metres south). areas.js PLACEHOLDERS.picnic calls buildPicnic(), picnic.js sits people at the tables
// (TABLE_TOP for the hands at rest, as at the store's tables), and pie.js runs the contest at the long table and paints its
// winners board.
//
// Five picnic tables under checked cloths with baskets, lemonade, a pie, a watermelon and sandwiches. The long contest table
// along the north side under a PIE EATING CONTEST banner, with a bell, the judge's sign and the winners board. Bunting and paper
// lanterns (they glow at night), a blanket under the big oak (YARD_TREES[16]) where Priya and Dale picnic, a bin, and the Picnic
// Lawn sign. Colliders on everything solid, and keep-out discs round each table for the NPCs (npcs.js nav.keepOuts).
import * as THREE from 'three';
import { propsReady, addProp as addModel } from './props-static.js';
import { GEO, Batcher } from './batch.js';
import { toon, redrawWhenFontsLoad } from './toon.js';
import { terrainHeight } from './terrain.js';
import { PICNIC_BLOCK, PICNIC_WALK, picnicBlock } from './layout.js';
import { LAMPS, addNightSpot } from './daynight-mats.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { limb } from './world-trees.js';
import { npcSpec } from './npc-looks.js';

// A picnic table (the old table's sizes, which the sitting poses are fitted to): top `TABLE.top` above the ground, benches
// `TABLE.bench` high, `TABLE.off` either side of the middle line, two sitters a side `TABLE.k` from the middle.
// seat-height (2026-11-07): the benches 0.3 up (were 0.37: the feet hung 8 cm), the top down as far (0.705, was 0.775), so the hands still
// rest on it as before
export const TABLE = { len: 2.2, top: 0.705, topW: 0.9, bench: 0.3, off: 0.95, benchW: 0.34, k: 0.55 };
// The contest table: longer, one bench (the north side), four contestants facing the lawn (south).
export const CONTEST = { u: 0, v: -3.0, len: 5.2, seats: [-1.8, -0.6, 0.6, 1.8] };

// u, v from the slot; yaw turns a table (its length along u at 0)
export const PLAN = {
  tables: [
    { id: 't0', u: -9.4, v: -0.9, yaw: 0.22, cloth: ['#e0463c', '#fff6ea'], props: ['basket', 'jug'] },
    { id: 't1', u: -4.4, v: 2.0, yaw: -0.12, cloth: ['#3f8fd9', '#fff6ea'], props: ['pie', 'cups'] },
    { id: 't2', u: 0.6, v: 2.7, yaw: 0.06, cloth: ['#f2b630', '#fff6ea'], props: ['melon', 'basket'] },
    { id: 't3', u: 5.6, v: 2.0, yaw: -0.16, cloth: ['#4fa45a', '#fff6ea'], props: ['sandwiches', 'jug'] },
    { id: 't4', u: 9.9, v: -0.9, yaw: 0.24, cloth: ['#e0463c', '#fff6ea'], props: ['cups', 'pie'] },
  ],
  banner: { v: -4.95, half: 3.1, h: 2.75 },      // two poles either side of the contest table, the banner between their tops
  board: { u: 4.75, v: -2.35, yaw: -0.3 },         // the winners board (pie.js), facing the lawn
  bell: { u: 2.32 },                               // on the contest table's east end
  judge: { u: -4.1, v: -2.45, yaw: 0.32 },         // the judge's sign at the west end
  blanket: { u: -11.0, v: 3.0, s: 2.6 },           // under the oak (YARD_TREES[16] at u -8, v 3.8)
  bin: { u: 12.1, v: 5.25 },
  sign: { u: 14.0, v: -0.3, yaw: 1.35 },             // the Picnic Lawn sign by the end of the path, facing the way you come
  // bunting and lanterns: poles (u, v, height); strings between them (a, b, 'flags' | 'lanterns')
  poles: [[-12.0, -5.4, 2.6], [-3.1, -4.95, 2.75], [3.1, -4.95, 2.75], [12.0, -5.4, 2.6], [-2.6, 5.7, 2.6], [7.4, 5.5, 2.6]],
  strings: [[0, 1, 'flags'], [2, 3, 'flags'], [4, 5, 'flags'], [1, 4, 'lanterns'], [2, 5, 'lanterns']],
};

const WOOD = '#b98a5a', WOOD_D = '#8a6240', POLE = '#7a5234', STRING = '#3a3236';
const FLAG_COLS = ['#e0463c', '#f2b630', '#3f8fd9', '#4fa45a', '#ff8fb8', '#ffffff'];
const LANTERN_COLS = ['#ffd9a0', '#ffb3a8', '#fff0b0', '#c8e6ff'];

// A flat triangle slab, point down (a bunting flag): 1 m wide at the top, 1 m tall, 2 cm thick.
const FLAG = (() => {
  const t = 0.01, P = [[-0.5, 0], [0.5, 0], [0, -1]];
  const v = [];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  const f = P.map(([x, y]) => [x, y, t]), k = P.map(([x, y]) => [x, y, -t]);
  tri(f[0], f[2], f[1]); tri(k[0], k[1], k[2]);
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(f[i], k[i], k[j]); tri(f[i], k[j], f[j]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();
const PRISM3 = new THREE.CylinderGeometry(1, 1, 1, 3);
const HALF = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI);
const SQUARE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const HANDLE = new THREE.TorusGeometry(1, 0.12, 4, 12, Math.PI);

// The lanterns are one unlit vertex-coloured material in daynight's lamp list (pale by day, glowing at night), one draw call.
const LANTERNS = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); LANTERNS.name = 'picnic-lanterns';
LAMPS.set('picnic-lanterns', { mat: LANTERNS, base: new THREE.Color('#ffffff') });

// A texture painted on a canvas (no filters or shadowBlur, see CONTRACTS.md), repainted once the fonts arrive.
export function paintTexture(w, h, draw, fonts = ['700 64px "Fredoka"']) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const paint = () => { draw(g, w, h); tex.needsUpdate = true; };
  paint(); redrawWhenFontsLoad(paint, fonts);
  return { tex, canvas: c, paint };
}
// a board face: a box with the picture on its front (+z of the board) only, plain colour elsewhere
export function boardMesh(w, h, d, tex, edge) {
  const e = toon(edge), front = new THREE.MeshBasicMaterial({ map: tex, fog: true });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [e, e, e, e, front, e]);
  m.castShadow = true;
  return m;
}

// world position of a point (lu along the table, lw across it) on a table at (x, z) turned yaw
const local = (x, z, yaw, lu, lw) => [x + Math.cos(yaw) * lu + Math.sin(yaw) * lw, z - Math.sin(yaw) * lu + Math.cos(yaw) * lw];

// One picnic table into the batch: the top, the benches (`sides`: -1 north / +1 south of its middle line, both by default),
// A-frame legs at each end (and the middle of a long one), the stretcher. Returns its TABLE_TOP for the sitters' hands.
// y: the ground it stands on (the terrain by default; summit-square.js stands its two on the square's pavers)
export function addTable(b, x, z, yaw, len, sides = [-1, 1], y = terrainHeight(x, z)) {
  // props-static: the Blender tables (the picnic table, and the contest's long one with its one bench on the north side)
  const shape = len === TABLE.len && sides.length === 2 ? 'picnic_table' : len === CONTEST.len && sides.length === 1 && sides[0] === -1 ? 'picnic_table_long' : null;
  if (shape && propsReady(shape)) { addModel(b, shape, { x, y, z, yaw }, { skin: 'lawn' }); return { x, z, yaw, hw: len / 2, hd: TABLE.topW / 2, y: y + TABLE.top }; }
  const at = (lu, lw, yy, sx, sy, sz, col, o = {}) => { const [px, pz] = local(x, z, yaw, lu, lw); b.add(GEO.box, col, { x: px, y: y + yy, z: pz, sx, sy, sz, ry: yaw, ...o }); };
  at(0, 0, TABLE.top - 0.035, len, 0.07, TABLE.topW, WOOD);
  for (const s of [-0.3, 0, 0.3]) at(0, s, TABLE.top + 0.002, len - 0.02, 0.004, 0.012, WOOD_D); // board seams
  for (const s of sides) at(0, s * TABLE.off, TABLE.bench - 0.03, len, 0.06, TABLE.benchW, WOOD);
  const ends = len > 3 ? [-(len / 2 - 0.3), 0, len / 2 - 0.3] : [-(len / 2 - 0.25), len / 2 - 0.25];
  for (const e of ends) {
    for (const sg of [1, -1]) { // an A-frame: each board from the ground under one bench up to the top's underside on the far side
      const z0 = sg * 0.66, y0 = -0.03, z1 = -sg * 0.3, y1 = TABLE.top - 0.065, L = Math.hypot(z1 - z0, y1 - y0);
      at(e, (z0 + z1) / 2, (y0 + y1) / 2, 0.08, L, 0.1, WOOD_D, { rx: Math.atan2(z1 - z0, y1 - y0) });
    }
    at(e, 0, TABLE.bench - 0.07, 0.08, 0.06, sides.length > 1 ? 2.15 : 1.15, WOOD_D, sides.length > 1 ? {} : { z: 0 });
  }
  at(0, 0, TABLE.bench - 0.15, len - 0.4, 0.06, 0.12, WOOD_D);
  return { x, z, yaw, hw: len / 2, hd: TABLE.topW / 2, y: y + TABLE.top };
}

// A checked cloth over a table's top, hanging a little over its long edges.
function addCloth(b, x, z, yaw, len, cols) {
  const y = terrainHeight(x, z) + TABLE.top + 0.008; // (clear of the board seams' tops, 4 mm up: level with them it flickered)
  const nu = Math.round(len / 0.29), nw = 4, su = (len + 0.1) / nu, sw = (TABLE.topW + 0.1) / nw;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) {
    const [px, pz] = local(x, z, yaw, -(len + 0.1) / 2 + (i + 0.5) * su, -(TABLE.topW + 0.1) / 2 + (j + 0.5) * sw);
    b.add(SQUARE, cols[(i + j) % 2], { x: px, y, z: pz, sx: su, sz: sw, ry: yaw });
  }
  for (const s of [-1, 1]) for (let i = 0; i < nu; i++) { // the drop over each long edge
    const [px, pz] = local(x, z, yaw, -(len + 0.1) / 2 + (i + 0.5) * su, s * ((TABLE.topW + 0.1) / 2 + 0.004));
    b.add(GEO.box, cols[(i + (s > 0 ? nw - 1 : 0)) % 2], { x: px, y: y - 0.07, z: pz, sx: su, sy: 0.14, sz: 0.006, ry: yaw });
  }
}

// What stands on a table, at (lu, lw) on its top (lw across: + south of a yaw 0 table).
function addProp(b, kind, x, z, yaw, lu, lw) {
  const y = terrainHeight(x, z) + TABLE.top + 0.006;
  const put = (geo, col, du, dw, yy, o = {}) => { const [px, pz] = local(x, z, yaw, lu + du, lw + dw); b.add(geo, col, { x: px, y: y + yy, z: pz, ry: yaw, ...o }); };
  if (kind === 'basket') {
    put(GEO.cyl12, '#b8874a', 0, 0, 0.09, { sx: 0.2, sy: 0.18, sz: 0.14 });
    put(GEO.cyl12, '#8a6232', 0, 0, 0.18, { sx: 0.205, sy: 0.02, sz: 0.145 });
    put(GEO.box, '#e0463c', 0.05, 0.02, 0.195, { sx: 0.16, sy: 0.03, sz: 0.12, rz: 0.2 });   // a napkin peeking out
    put(HANDLE, '#8a6232', 0, 0, 0.19, { sx: 0.17, sy: 0.17, sz: 0.17 });
  } else if (kind === 'jug') {
    put(GEO.cyl12, '#fff3a6', 0, 0, 0.12, { sx: 0.075, sy: 0.24, sz: 0.075 });
    put(GEO.cyl12, '#fffbe0', 0, 0, 0.245, { sx: 0.06, sy: 0.02, sz: 0.06 });
    put(HANDLE, '#fff3a6', 0.09, 0, 0.13, { sx: 0.06, sy: 0.07, sz: 0.06, rz: -Math.PI / 2 });
    put(GEO.cyl8, '#f7e04a', -0.01, 0.0, 0.2, { sx: 0.05, sy: 0.012, sz: 0.05, rx: 1.3 }); // a lemon slice inside
    for (const [du, dw] of [[-0.22, 0.12], [-0.12, -0.16]]) { put(GEO.cyl8, '#f4f2ea', du, dw, 0.055, { sx: 0.04, sy: 0.11, sz: 0.04 }); put(GEO.cyl8, '#fff3a6', du, dw, 0.105, { sx: 0.034, sy: 0.006, sz: 0.034 }); }
  } else if (kind === 'cups') {
    for (const [du, dw, c] of [[-0.16, 0.18, '#ff8fb8'], [0.0, -0.2, '#8ac8ff'], [0.2, 0.16, '#9ee07a']]) put(GEO.cyl8, c, du, dw, 0.055, { sx: 0.04, sy: 0.11, sz: 0.04 });
  } else if (kind === 'pie') {
    put(GEO.cyl12, '#e8eaee', 0, 0, 0.012, { sx: 0.18, sy: 0.02, sz: 0.18 });      // the tin
    put(GEO.cyl12, '#e0a050', 0, 0, 0.04, { sx: 0.16, sy: 0.05, sz: 0.16 });       // the crust
    put(GEO.cyl12, '#b8323a', 0, 0, 0.066, { sx: 0.13, sy: 0.01, sz: 0.13 });      // cherries
    for (const s of [-0.06, 0, 0.06]) { put(GEO.box, '#f0b866', s, 0, 0.074, { sx: 0.022, sy: 0.01, sz: 0.24 }); put(GEO.box, '#f0b866', 0, s, 0.075, { sx: 0.24, sy: 0.01, sz: 0.022 }); }
  } else if (kind === 'melon') {
    for (let i = 0; i < 3; i++) {
      const du = -0.15 + i * 0.15;
      put(HALF, '#4f9a3e', du, 0, 0.075, { sx: 0.13, sy: 0.04, sz: 0.13, rx: Math.PI / 2, ry: yaw + 0.2 * i });
      put(HALF, '#ff5a6a', du, 0, 0.083, { sx: 0.11, sy: 0.046, sz: 0.11, rx: Math.PI / 2, ry: yaw + 0.2 * i }); // (the flesh's cut face 3 mm proud of the rind's, not a millimetre)
    }
  } else if (kind === 'sandwiches') {
    put(GEO.cyl12, '#f4f2ea', 0, 0, 0.01, { sx: 0.2, sy: 0.015, sz: 0.2 });
    for (const [du, dw, r] of [[-0.06, -0.03, 0.3], [0.06, 0.04, 2.4], [0.0, 0.08, 4.1]]) {
      put(PRISM3, '#f3dfb0', du, dw, 0.04, { sx: 0.08, sy: 0.05, sz: 0.08, ry: yaw + r });
      put(PRISM3, '#6fbf4a', du, dw, 0.042, { sx: 0.09, sy: 0.012, sz: 0.09, ry: yaw + r }); // (the lettuce well out past the bread's sides)
    }
  }
}

// A sagging string between two pole tops with flags or lanterns on it; lantern geometry goes to `glow` (merged later).
function addString(b, glow, a, c, kind, k0) {
  const N = 12, pts = [];
  const sag = 0.22 + Math.hypot(c[0] - a[0], c[2] - a[2]) * 0.03;
  for (let j = 0; j <= N; j++) { const u = j / N; pts.push([a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (c[2] - a[2]) * u]); }
  for (let j = 0; j < N; j++) limb(b, STRING, pts[j], pts[j + 1], 0.008);
  const yaw = Math.atan2(c[0] - a[0], c[2] - a[2]) + Math.PI / 2;
  const col = new THREE.Color();
  for (let j = 1; j < N; j++) {
    const [x, y, z] = pts[j];
    if (kind === 'flags') b.add(FLAG, FLAG_COLS[(k0 + j) % FLAG_COLS.length], { x, y: y - 0.01, z, sx: 0.3, sy: 0.32, sz: 1, ry: yaw });
    else if (j % 2 === 0) {
      limb(b, STRING, [x, y, z], [x, y - 0.2, z], 0.005);
      b.add(GEO.cyl8, '#4a3a2e', { x, y: y - 0.2, z, sx: 0.07, sy: 0.03, sz: 0.07 });
      b.add(GEO.cyl8, '#4a3a2e', { x, y: y - 0.52, z, sx: 0.06, sy: 0.025, sz: 0.06 });
      const g = new THREE.SphereGeometry(0.17, 10, 7); g.scale(1, 0.92, 1); g.translate(x, y - 0.36, z); g.deleteAttribute('uv');
      col.set(LANTERN_COLS[(k0 + j) % LANTERN_COLS.length]);
      const n = g.attributes.position.count, cc = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) { const ribs = 0.86 + 0.14 * Math.abs(Math.sin(g.attributes.position.getY(v) * 40)); cc[v * 3] = col.r * ribs; cc[v * 3 + 1] = col.g * ribs; cc[v * 3 + 2] = col.b * ribs; }
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      glow.push(g); (glow.hang || (glow.hang = [])).push([x, y - 0.36, z]); // (where each lantern hangs: the lights sit in two of them)
    }
  }
  return pts;
}

// The banner's and the judge's sign's pictures
function paintBanner(g, w, h) {
  g.fillStyle = '#fff6ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e0463c';
  for (let x = 0; x < w; x += 64) { g.fillRect(x, 0, 32, 22); g.fillRect(x + 32, h - 22, 32, 22); }
  g.strokeStyle = '#7a3a2a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  const pie = (cx, cy, r) => {
    g.fillStyle = '#e0a050'; g.beginPath(); g.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b8323a'; g.beginPath(); g.ellipse(cx, cy - r * 0.08, r * 0.78, r * 0.44, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f0c27a'; g.lineWidth = r * 0.12;
    for (const s of [-0.4, 0, 0.4]) { g.beginPath(); g.moveTo(cx + s * r - r * 0.25, cy - r * 0.45); g.lineTo(cx + s * r + r * 0.25, cy + r * 0.3); g.stroke(); }
    g.strokeStyle = '#7a3a2a'; g.lineWidth = 4; g.beginPath(); g.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2); g.stroke();
  };
  pie(90, h / 2 + 4, 52); pie(w - 90, h / 2 + 4, 52);
  g.fillStyle = '#7a3a2a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let s = 92; g.font = `700 ${s}px "Fredoka", "Trebuchet MS", sans-serif`;
  while (g.measureText('PIE EATING CONTEST').width > w - 260 && s > 30) { s -= 4; g.font = `700 ${s}px "Fredoka", sans-serif`; }
  g.fillText('PIE EATING CONTEST', w / 2, h / 2 - 12);
  g.font = '600 34px "Fredoka", sans-serif'; g.fillStyle = '#b8323a';
  g.fillText('once a week - no hands!', w / 2, h / 2 + 52);
}
function paintJudge(g, w, h) {
  g.fillStyle = '#2f5b3a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f2c230'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#fff6ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 64px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText("JUDGE'S TABLE", w / 2, h * 0.36);
  g.font = '500 34px "Fredoka", sans-serif'; g.fillText('Most pies when the bell rings wins', w / 2, h * 0.7);
}

export function buildPicnic({ b, group, x: X, z: Z, colliders }) {
  const W = (u, v) => [X + u, Z + v];
  const disc = (u, v, r) => { const [x, z] = W(u, v); colliders.push({ type: 'circle', x, z, r }); };
  const keepOuts = [];

  // ---- the tables, under their cloths, with what is on them. What is on them is its own batch, built again without a table's
  // things while a board game is set out there (table-games: clearProps), so the pieces have the whole top
  const tables = [], propsOf = new Map(), cleared = new Set();
  // (one mesh for good, its geometry swapped: camera-fade.js keeps a ghost of every baked mesh drawing that mesh's geometry, so a
  // mesh taken away would leave its ghost drawing the old food)
  let propMesh = null;
  const buildProps = () => {
    const pb = new Batcher({ vertexColors: true });
    for (const [id, calls] of propsOf) if (!cleared.has(id)) for (const [geo, col, o] of calls) pb.add(geo, col, o);
    const made = pb.build(new THREE.Group(), 'picnic-props')[0];
    if (!propMesh) { if (made) { propMesh = made; group.add(made); } return; }
    propMesh.visible = !!made; if (!made) return; // (every table has a game on it)
    const old = propMesh.geometry;
    propMesh.geometry = made.geometry;
    if (propMesh.userData.fadeGhost) propMesh.userData.fadeGhost.geometry = made.geometry;
    old.dispose();
  };
  for (const t of PLAN.tables) {
    const [x, z] = W(t.u, t.v);
    const top = addTable(b, x, z, t.yaw, TABLE.len);
    addCloth(b, x, z, t.yaw, TABLE.len, t.cloth);
    const calls = []; propsOf.set(t.id, calls);
    t.props.forEach((p, i) => addProp({ add: (geo, col, o) => calls.push([geo, col, o]) }, p, x, z, t.yaw, i ? 0.55 : -0.5, i ? -0.12 : 0.1));
    for (const k of [-0.75, 0, 0.75]) { const [cx, cz] = local(x, z, t.yaw, k, 0); colliders.push({ type: 'circle', x: cx, z: cz, r: 0.5 }); }
    keepOuts.push({ x, z, r: 1.75 });
    const seats = [];
    for (const s of [-1, 1]) for (const k of [-TABLE.k, TABLE.k]) {
      const [sx, sz] = local(x, z, t.yaw, k, s * TABLE.off);
      seats.push({ id: `${t.id}-${s < 0 ? 'n' : 's'}${k < 0 ? 'w' : 'e'}`, kind: 'picnic table', x: sx, z: sz, y: terrainHeight(sx, sz) + TABLE.bench, yaw: Math.atan2(-s * Math.sin(t.yaw), -s * Math.cos(t.yaw)), table: top }); // (square to the table, as you sit on a bench)
    }
    tables.push({ id: t.id, x, z, yaw: t.yaw, top, seats, clearProps(on) { if (!!on === cleared.has(t.id)) return; if (on) cleared.add(t.id); else cleared.delete(t.id); buildProps(); }, get propsOn() { return !cleared.has(t.id); } });
  }
  buildProps();

  // ---- the contest table: one long bench on the north side, the contestants face the lawn
  const [cx, cz] = W(CONTEST.u, CONTEST.v);
  const ctop = addTable(b, cx, cz, 0, CONTEST.len, [-1]);
  addCloth(b, cx, cz, 0, CONTEST.len, ['#ffffff', '#e0463c']);
  for (let k = -CONTEST.len / 2 + 0.45; k < CONTEST.len / 2; k += 0.95) colliders.push({ type: 'circle', x: cx + k, z: cz + 0.05, r: 0.5 });
  for (const k of [-1.9, 0, 1.9]) keepOuts.push({ x: cx + k, z: cz - 0.3, r: 1.5 });
  const contestSeats = CONTEST.seats.map((k, i) => ({ id: 'pie-' + i, i, x: cx + k, z: cz - TABLE.off, y: terrainHeight(cx + k, cz - TABLE.off) + TABLE.bench, yaw: 0, table: ctop }));
  // (the pies at each place are pie.js's: it hides them while a round is on and stacks the tins beside the eater)
  // the bell on its little stand at the east end
  { const [bx, bz] = W(PLAN.bell.u, CONTEST.v + 0.1), by = terrainHeight(bx, bz) + TABLE.top;
    b.add(GEO.cyl8, '#7a5234', { x: bx, y: by + 0.02, z: bz, sx: 0.12, sy: 0.04, sz: 0.12 });
    b.add(GEO.cyl6, '#5e4128', { x: bx, y: by + 0.14, z: bz, sx: 0.012, sy: 0.22, sz: 0.012 });
    b.add(GEO.cone8, '#e6b84a', { x: bx, y: by + 0.33, z: bz, sx: 0.09, sy: 0.12, sz: 0.09 });
    b.add(GEO.sphere, '#e6b84a', { x: bx, y: by + 0.41, z: bz, sx: 0.035, sy: 0.035, sz: 0.035 });
    b.add(GEO.sphere, '#8a6a2a', { x: bx, y: by + 0.265, z: bz, sx: 0.022, sy: 0.022, sz: 0.022 }); }
  // the banner between two tall poles behind the bench
  const BN = PLAN.banner;
  for (const s of [-1, 1]) { const [px, pz] = W(s * BN.half, BN.v), py = terrainHeight(px, pz); b.add(GEO.cyl8, POLE, { x: px, y: py + BN.h / 2, z: pz, sx: 0.06, sy: BN.h, sz: 0.06 }); b.add(GEO.sphere, '#e6b84a', { x: px, y: py + BN.h + 0.04, z: pz, sx: 0.08, sy: 0.08, sz: 0.08 }); disc(s * BN.half, BN.v, 0.16); }
  const banner = paintTexture(1024, 256, paintBanner);
  { const [px, pz] = W(0, BN.v), m = boardMesh(BN.half * 2 - 0.16, 0.62 * 2 * 0.78, 0.03, banner.tex, '#fff6ea'); m.position.set(px, terrainHeight(px, pz) + BN.h - 0.6, pz); m.name = 'pie-banner'; group.add(m); }
  // the judge's sign on two stakes, at the west end
  const judgeTex = paintTexture(512, 256, paintJudge);
  { const J = PLAN.judge, [jx, jz] = W(J.u, J.v), jy = terrainHeight(jx, jz), fx = Math.sin(J.yaw), fz = Math.cos(J.yaw), rx = Math.cos(J.yaw), rz = -Math.sin(J.yaw);
    const m = boardMesh(0.9, 0.45, 0.03, judgeTex.tex, '#2f5b3a'); m.position.set(jx, jy + 1.0, jz); m.rotation.y = J.yaw; m.name = 'pie-judge-sign'; group.add(m);
    for (const s of [-0.36, 0.36]) b.add(GEO.box, POLE, { x: jx + rx * s - fx * 0.03, y: jy + 0.5, z: jz + rz * s - fz * 0.03, sx: 0.05, sy: 1.0, sz: 0.04, ry: J.yaw });
    colliders.push({ type: 'circle', x: jx, z: jz, r: 0.42 }); }
  // the winners board's frame and legs (its painted face is pie.js's: it changes)
  { const B = PLAN.board, [bx, bz] = W(B.u, B.v), by = terrainHeight(bx, bz), fx = Math.sin(B.yaw), fz = Math.cos(B.yaw), rx = Math.cos(B.yaw), rz = -Math.sin(B.yaw);
    b.add(GEO.box, '#6b4a2e', { x: bx - fx * 0.035, y: by + 1.38, z: bz - fz * 0.035, sx: 1.42, sy: 1.1, sz: 0.05, ry: B.yaw });
    b.add(PRISM3, '#5e4128', { x: bx - fx * 0.035, y: by + 2.0, z: bz - fz * 0.035, sx: 0.12, sy: 1.5, sz: 0.12, rz: Math.PI / 2, ry: B.yaw }); // a little roof
    for (const s of [-0.62, 0.62]) b.add(GEO.box, POLE, { x: bx + rx * s - fx * 0.08, y: by + 0.95, z: bz + rz * s - fz * 0.08, sx: 0.08, sy: 1.9, sz: 0.06, ry: B.yaw });
    colliders.push({ type: 'circle', x: bx - rx * 0.45, z: bz - rz * 0.45, r: 0.3 }, { type: 'circle', x: bx + rx * 0.45, z: bz + rz * 0.45, r: 0.3 }); }

  // ---- the blanket under the oak, where Priya and Dale picnic
  const BL = PLAN.blanket, [blx, blz] = W(BL.u, BL.v), bly = terrainHeight(blx, blz), n = 6, sq = BL.s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b.add(SQUARE, (i + j) % 2 ? '#ffffff' : '#e0463c', { x: blx - BL.s / 2 + (i + 0.5) * sq, y: bly + 0.025, z: blz - BL.s / 2 + (j + 0.5) * sq, sx: sq, sz: sq });
  b.add(GEO.cyl12, '#b8874a', { x: blx + 0.55, y: bly + 0.14, z: blz - 0.55, sx: 0.3, sy: 0.24, sz: 0.22 });
  b.add(GEO.cyl12, '#8a6232', { x: blx + 0.55, y: bly + 0.27, z: blz - 0.55, sx: 0.31, sy: 0.03, sz: 0.23 });
  b.add(HANDLE, '#8a6232', { x: blx + 0.55, y: bly + 0.28, z: blz - 0.55, sx: 0.26, sy: 0.26, sz: 0.26 });
  b.add(GEO.cyl12, '#fff3a6', { x: blx - 0.2, y: bly + 0.15, z: blz + 0.75, sx: 0.08, sy: 0.25, sz: 0.08 });
  b.add(GEO.cyl8, '#f4f2ea', { x: blx + 0.1, y: bly + 0.08, z: blz + 0.85, sx: 0.045, sy: 0.12, sz: 0.045 });
  b.add(GEO.sphere, '#e8483c', { x: blx - 0.6, y: bly + 0.09, z: blz + 0.2, sx: 0.08, sy: 0.08, sz: 0.08 });
  disc(BL.u + 0.55, BL.v - 0.55, 0.32);

  // ---- bunting and lanterns
  const tops = PLAN.poles.map(([u, v, h]) => { const [x, z] = W(u, v); const y = terrainHeight(x, z); return [x, y + h - 0.06, z, y, h]; });
  PLAN.poles.forEach(([u, v], i) => {
    if (i === 1 || i === 2) return; // (the banner's poles)
    const [x, , z, y, h] = tops[i];
    b.add(GEO.cyl8, POLE, { x, y: y + h / 2, z, sx: 0.05, sy: h, sz: 0.05 });
    b.add(GEO.sphere, FLAG_COLS[i % FLAG_COLS.length], { x, y: y + h + 0.03, z, sx: 0.07, sy: 0.07, sz: 0.07 });
    disc(u, v, 0.14);
  });
  const glow = [];
  PLAN.strings.forEach(([a, c, kind], i) => addString(b, glow, tops[a], tops[c], kind, i * 3));
  const lanterns = new THREE.Mesh(mergeGeometries(glow, false), LANTERNS);
  glow.forEach(g => g.dispose());
  lanterns.name = 'picnic-lanterns'; lanterns.matrixAutoUpdate = false; lanterns.updateMatrix();
  group.add(lanterns);
  // the light of the strings: in the lantern nearest each spot (fire-season: a light where you see it)
  for (const [u, v] of [[-1.4, 1.8], [4.6, 1.2]]) {
    const [x0, z0] = W(u, v), [x, y, z] = (glow.hang || [[x0, terrainHeight(x0, z0) + 2.0, z0]]).reduce((m, q) => (Math.hypot(q[0] - x0, q[2] - z0) < Math.hypot(m[0] - x0, m[2] - z0) ? q : m));
    addNightSpot({ x, y, z, color: '#ffd9a0', pool: 3.2, poolK: 0.32, gy: terrainHeight(x, z), halo: 0.3, k: 0.45 });
  }

  // ---- the bin by the way in
  { const [x, z] = W(PLAN.bin.u, PLAN.bin.v), y = terrainHeight(x, z);
    b.add(GEO.cyl12, '#3f7a4a', { x, y: y + 0.42, z, sx: 0.3, sy: 0.84, sz: 0.3 });
    b.add(GEO.cyl12, '#2f5b3a', { x, y: y + 0.87, z, sx: 0.33, sy: 0.07, sz: 0.33 });
    b.add(GEO.box, '#2f5b3a', { x, y: y + 0.93, z, sx: 0.18, sy: 0.04, sz: 0.05 });
    for (const yy of [0.2, 0.62]) b.add(GEO.cyl12, '#356a40', { x, y: y + yy, z, sx: 0.31, sy: 0.03, sz: 0.31 });
    colliders.push({ type: 'circle', x, z, r: 0.36 }); }

  const [sx, sz] = W(PLAN.sign.u, PLAN.sign.v);
  const npcAt = (du, dv) => [blx + du, blz + dv];
  const [px, pz] = npcAt(-0.6, -0.5), [dx, dz] = npcAt(0.6, 0.6);
  return {
    npcs: [
      { ...npcSpec('priya'), seat: { x: px, z: pz, anim: 'sit', faceX: blx + 0.6, faceZ: blz + 0.3 } },
      { ...npcSpec('dale'), seat: { x: dx, z: dz, anim: 'sit', faceX: blx - 0.6, faceZ: blz - 0.5 } },
    ],
    lines: ['Pass the lemonade?', 'Perfect picnic weather.', 'Ants! Ants!', 'Try the sandwiches.', 'Are you entering the pie contest?'],
    idle: ['sit'],
    pairs: [['talk', 'laugh'], ['talk', 'talk']],
    sign: { x: sx, z: sz, yaw: PLAN.sign.yaw },
    signLine: 'tables, lemonade and the pie contest',
    place: true, letter: 'a table in the shade, and the pie eating contest',
    rect: picnicBlock({ x: X, z: Z }),
    keepOuts,
    navWalk: [...PICNIC_WALK, PICNIC_WALK[0]].map(([u, v]) => [X + u, Z + v]),
    picnic: { tables, contestSeats, contest: { x: cx, z: cz, top: ctop }, banner, board: PLAN.board, block: PICNIC_BLOCK },
  };
}
