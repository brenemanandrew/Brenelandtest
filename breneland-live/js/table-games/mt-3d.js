// Mexican Train in 3D on a real table (table-games, tg-look): what passers-by see, from the public view only. The station hub with its
// eight slots and the engine double in the middle, every train running out from the hub toward its owner's chair (the Mexican
// Train into the widest gap), a little engine as each open train's marker in its seat's colour (the Mexican Train's gold), the
// tiles in each hand stood face down in front of their chair, the boneyard a jumble beside the hub, and the box. The tiles are
// the overlay's modelled ones (domino-3d.js: bevelled, two-tone) and the markers its toy engines (engine-3d.js). A placed tile
// slides from its player's side of the table to its spot. Rebuilt only when the view changes: three batches (the tiles' bodies
// and the markers, one draw; their faces, one textured draw), and one flying tile.
import * as THREE from 'three';
import { Batcher, GEO } from '../batch.js';
import { GRADIENT_3 } from '../toon.js';
import { faceAtlas, atlasU, SEAT_COLORS, MEX_COLOR } from './dominoes.js';
import { dominoParts, TILE, BASE } from './domino-3d.js';
import { engineInto } from './engine-3d.js';
export { SEAT_COLORS, MEX_COLOR };

let faceMat = null;
const quads = new Map();
function faceMaterial() {
  if (faceMat) return faceMat;
  const tex = new THREE.CanvasTexture(faceAtlas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  faceMat = new THREE.MeshToonMaterial({ map: tex, gradientMap: GRADIENT_3 });
  return faceMat;
}
// a unit square in the xy plane whose uvs are the half-face n's cell of the atlas
function quad(n) {
  let g = quads.get(n);
  if (!g) { g = new THREE.PlaneGeometry(1, 1); const [u0, u1] = atlasU(n), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) < 0.5 ? u0 : u1); quads.set(n, g); }
  return g;
}
const h01 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// table: { x, z, top, R (the play area's radius), edge (the table's own reach toward a chair), seats: [{ x, z }] }, parent: a group
export function createMt3D(parent, table) {
  const root = new THREE.Group(); root.name = 'tg-mt-' + table.id; root.position.set(table.x, table.top, table.z); parent.add(root);
  const L = Math.max(0.03, Math.min(0.065, table.R / 6)), W = L / 2, H = L * TILE.H; // (a little bigger than life: read from a few metres off)
  const hubR = L * 1.25;
  let built = [], key = '', fly = null;
  const dirOf = chair => { const s = table.seats[chair]; return Math.atan2(s.x - table.x, s.z - table.z); };
  const edgeOf = chair => (table.edge ? table.edge(dirOf(chair)) : table.R + 0.1);
  // where a tile lies: along the ray at angle a, the k-th from the hub (its middle), lying lengthwise
  const along = (a, k) => { const r = hubR + L * 0.35 + (k + 0.5) * L * 1.05; return [Math.sin(a) * r, Math.cos(a) * r]; };
  function tileInto(bb, bf, x, z, yaw, a, b, { y = 0, down = false } = {}) {
    dominoParts((g, c, o) => bb.add(g, c, o), x, y, z, yaw, L, a, b, down);
    if (down) return;
    for (const [n, k] of [[a, -1], [b, 1]]) {
      if (n == null) continue;
      bf.add(quad(n), faceMat, { x: x + Math.sin(yaw) * k * L / 4, y: y + H + 0.0006, z: z + Math.cos(yaw) * k * L / 4, sx: W * 0.9, sy: W * 0.9, rx: -Math.PI / 2, ry: yaw });
    }
  }
  const engine = (bb, x, z, yaw, col) => engineInto(bb, x, 0, z, yaw, L * 1.05, col); // a little toy train engine
  // the trains' directions: each seat's toward its chair, the Mexican Train into the widest gap between them
  function directions(order) {
    const as = order.map(dirOf);
    const sorted = as.map((a, i) => [((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), i]).sort((p, q) => p[0] - q[0]);
    let best = 0, gap = -1;
    for (let i = 0; i < sorted.length; i++) { const a0 = sorted[i][0], a1 = i + 1 < sorted.length ? sorted[i + 1][0] : sorted[0][0] + 2 * Math.PI; if (a1 - a0 > gap) { gap = a1 - a0; best = a0 + (a1 - a0) / 2; } }
    if (order.length === 1) best = as[0] + Math.PI;
    // two trains toward the same side: fan them apart a little
    return { seat: as, mex: best };
  }
  function clear() { for (const m of built) { m.removeFromParent(); m.geometry.dispose(); } built = []; }
  // view: the public view (or null before the start); order: engine seat -> chair; phase: the table's
  let lastTrains = null;
  function update(view, order, phase, skipNewest = null) {
    lastTrains = view && view.trains ? view.trains.map(t => t.tiles.length) : null;
    const k = JSON.stringify([view && view.trains, view && view.counts, view && view.boneyard, view && view.engine, phase, order, skipNewest]);
    if (k === key) return; key = k;
    clear();
    faceMaterial();
    const bb = new Batcher({ vertexColors: true, castShadow: false }), bf = new Batcher({ castShadow: false });
    // the box, open, by the edge of the play area
    const bxA = view && order ? directions(order).mex + Math.PI * 0.75 : 0.6, bR = table.R * 0.78;
    const bx = Math.sin(bxA) * bR, bz = Math.cos(bxA) * bR;
    bb.add(GEO.box, '#1f5560', { x: bx, y: L * 0.12, z: bz, sx: L * 3.2, sy: L * 0.24, sz: L * 2.2, ry: bxA });
    bb.add(GEO.box, '#e3aa45', { x: bx, y: L * 0.245, z: bz, sx: L * 3.22, sy: L * 0.03, sz: L * 0.4, ry: bxA });
    if (!view || !order) {
      // set up, not started: the tiles still in the box (a few rows of backs) and the hub out beside it
      // (the box open: a dark tray, the tiles standing in it in two rows, their ivory faces up and their teal backs toward the edge)
      bb.add(GEO.box, '#2a1a12', { x: bx, y: L * 0.245, z: bz, sx: L * 3.0, sy: 0.002, sz: L * 2.0, ry: bxA });
      for (let i = 0; i < 12; i++) { const u = (i % 6 - 2.5) * W * 1.08, v = (Math.floor(i / 6) - 0.5) * L * 1.02; tileInto(bb, bf, bx + Math.cos(bxA) * u + Math.sin(bxA) * v, bz - Math.sin(bxA) * u + Math.cos(bxA) * v, bxA, null, null, { y: L * 0.245 }); }
      hub(bb, bf, null);
    } else {
      const D = directions(order), n = order.length;
      hub(bb, bf, view.engine);
      const cap = Math.max(3, Math.floor((table.R - hubR - L * 0.6) / (L * 1.05)));
      view.trains.forEach((t, i) => {
        const a = i < n ? D.seat[i] : D.mex, tiles = t.tiles || [];
        // two seats facing the same way share a direction: a little apart
        const twin = i < n ? D.seat.findIndex((b, j) => j < i && Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) < 0.2) : -1;
        const aa = twin >= 0 ? a + 0.32 : a;
        const shown = tiles.slice(-cap), first = tiles.length - shown.length;
        shown.forEach((tile, j) => {
          if (skipNewest && skipNewest.train === i && first + j === tiles.length - 1) return;
          const [x, z] = along(aa, j), dbl = tile[0] === tile[1];
          tileInto(bb, bf, x, z, dbl ? aa + Math.PI / 2 : aa, tile[0], tile[1]);
        });
        if (t.open || t.mexican) { const [x, z] = along(aa, -0.15); const px = Math.cos(aa) * L * 0.75, pz = -Math.sin(aa) * L * 0.75; engine(bb, x + px, z + pz, aa, i < n ? SEAT_COLORS[order[i] % 8] : MEX_COLOR); }
      });
      // the hands: face down, stood up in front of each chair
      (view.counts || []).forEach((c, i) => {
        const a = D.seat[i], r = Math.min(edgeOf(order[i]) - L * 0.5, table.R + L * 0.9), m = Math.min(c, 15);
        const cx = Math.sin(a) * r, cz = Math.cos(a) * r, tx = Math.cos(a), tz = -Math.sin(a);
        for (let j = 0; j < m; j++) { const u = (j - (m - 1) / 2) * W * 1.3; bb.add(GEO.box, BASE, { x: cx + tx * u, y: L / 2, z: cz + tz * u, sx: W, sy: L, sz: H, ry: a }); }
      });
      // the boneyard: face down, a little jumble by the hub, opposite the Mexican Train
      const by = Math.min(view.boneyard || 0, 24), ba = D.mex + Math.PI, br = hubR + L * 2.2;
      for (let j = 0; j < by; j++) { const r = br + (h01(j, 1) - 0.5) * L * 2, a2 = ba + (h01(j, 2) - 0.5) * 0.9; tileInto(bb, bf, Math.sin(a2) * r, Math.cos(a2) * r, h01(j, 3) * Math.PI * 2, 0, 0, { y: (j % 3) * H * 0.9, down: true }); }
    }
    built = [...bb.build(root, 'tg-mt-bodies'), ...bf.build(root, 'tg-mt-faces')];
    for (const m of built) { m.castShadow = false; m.receiveShadow = true; }
  }
  function hub(bb, bf, eng) {
    bb.add(GEO.cyl12, '#8a6240', { x: 0, y: H * 0.5, z: 0, sx: hubR, sy: H, sz: hubR });
    bb.add(GEO.cyl12, '#c9a66a', { x: 0, y: H + 0.0005, z: 0, sx: hubR * 0.82, sy: 0.001, sz: hubR * 0.82 });
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; bb.add(GEO.box, '#5a3c26', { x: Math.sin(a) * hubR * 0.9, y: H + 0.001, z: Math.cos(a) * hubR * 0.9, sx: W * 0.5, sy: 0.002, sz: L * 0.25, ry: a }); }
    if (eng != null) tileInto(bb, bf, 0, 0, Math.PI / 4, eng, eng, { y: H });
  }
  // a tile flying from its player's side to its spot on a train (the 3D half of the overlay's slide)
  function slide(view, order, beat) {
    if (!view || !order || !beat || !beat.tile) return;
    faceMaterial();
    const n = order.length, D = directions(order), i = beat.train, t = view.trains[i]; if (!t) return;
    const a = i < n ? D.seat[i] : D.mex, cap = Math.max(3, Math.floor((table.R - hubR - L * 0.6) / (L * 1.05)));
    const j = Math.min(t.tiles.length, cap) - 1;
    const [x1, z1] = along(a, j), dbl = beat.tile[0] === beat.tile[1];
    const from = Number.isInteger(beat.seat) && beat.seat < n ? D.seat[beat.seat] : a, r0 = Number.isInteger(beat.seat) && beat.seat < n ? Math.min(edgeOf(order[beat.seat]) - L, table.R) : table.R;
    if (fly) { fly.g.removeFromParent(); for (const m of fly.g.children) m.geometry.dispose(); }
    const g = new THREE.Group(); root.add(g);
    const bb = new Batcher({ vertexColors: true, castShadow: false }), bf = new Batcher({ castShadow: false });
    tileInto(bb, bf, 0, 0, dbl ? a + Math.PI / 2 : a, beat.tile[0], beat.tile[1]); bb.build(g, 'tg-mt-fly'); bf.build(g, 'tg-mt-fly');
    for (const m of g.children) m.matrixAutoUpdate = false;
    fly = { g, x0: Math.sin(from) * r0, z0: Math.cos(from) * r0, x1, z1, t: 0, dur: 0.45, done: false };
    update(view, order, 'play', { train: i });
    g.position.set(fly.x0, 0, fly.z0);
  }
  function tick(dt, view, order) {
    if (!fly || fly.done) return;
    fly.t += dt; const k = Math.min(1, fly.t / fly.dur), e = k * k * (3 - 2 * k);
    fly.g.position.set(fly.x0 + (fly.x1 - fly.x0) * e, Math.sin(k * Math.PI) * L * 1.4, fly.z0 + (fly.z1 - fly.z0) * e);
    if (k >= 1) { fly.done = true; fly.g.removeFromParent(); for (const m of fly.g.children) m.geometry.dispose(); fly = null; key = ''; update(view, order, 'play'); }
  }
  return {
    root, update, slide, tick, L,
    get flying() { return !!fly; },
    // tests: the tiles drawn (by train) the way the 3D lays them out, from the same view
    drawn: () => ({ meshes: built.length, trains: lastTrains, visible: root.visible }),
    dispose() { clear(); if (fly) { fly.g.removeFromParent(); fly = null; } root.removeFromParent(); },
  };
}
