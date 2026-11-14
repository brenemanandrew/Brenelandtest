// Summit Square (crib-move, Andrew 2026-11-08: "Put a small paved park area with a shelter and several park benches that rented
// games can be taken to"): the small paved park where Kevin's Tool Crib stood, on Summit Rd's south side between the game store's
// lot and the shops' car lot, next door to the store the board games are borrowed from (layout.js SUMMIT_SQUARE has every
// position). Pavers flush with the sidewalk, a low planter wall along the front with the way in through a gap in it, an open-sided
// shelter (a gabled roof on six posts, the name on its fascia) with two picnic tables under it (picnic-build.js's table, the same
// one the Picnic Lawn has, so the sitting and the board games fit it), five park benches round the edge, two lamps by the way in,
// planters, a maple and an oak either side of the back bench, a bin and the name on a post by the gate.
//
// Sitting: the tables' bench places and the park benches are seats.js seats (picnic.js seats you, hands on the table at a table).
// Games: the two tables are table-games tables `square:t0` and `square:t1` (table-games/tables.js reads `api.tables`, the same
// shape as the picnic's). Everything static is one batch (plus the lamps' glow material and the two sign faces); the ground under
// it is a surface at the pavers' height. The shelter is an OPEN weather room (town-fixes): dry under its roof, outdoors for a camera.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { SUMMIT_SQUARE as S } from './layout.js';
import { Batcher, GEO } from './batch.js';
import { addSurface, terrainHeight } from './terrain.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { addSeat, addBenchSeats } from './seats.js';
import { addTable, TABLE } from './picnic-build.js';
import { addTree } from './world-trees.js';
import { signTexture } from './areas.js';
import { addRoom } from './indoor-rooms.js';
import { mulberry32 } from './util.js';

const C = {
  joint: '#9a8f7c', paverA: '#d2c3a4', paverB: '#c4b08b', border: '#b3996f', kerb: '#bdb7ab', kerbDk: '#a8a296',
  post: '#7a5a3c', postDk: '#5e4128', beam: '#8a6a48', roof: '#3f7a4f', roofDk: '#2f5d3c', fascia: '#efe6d0', gable: '#e6dcc2',
  iron: '#2f3b36', slat: '#a8743f', slatDk: '#8a5c2e', soil: '#4a3526', leaf: '#3f8a3f', leaf2: '#4a9a45', planter: '#8a6a48', planterDk: '#6b4f33',
  bin: '#3f7a4a', binDk: '#2f5b3a', concrete: '#b9b2a6',
};
const FLOWERS = ['#e0463c', '#f0c24f', '#ff8fb8', '#f6efdc', '#b48cff'];
const SQ = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
// a part at local (lx along, lz forward) of a thing at (x, z) facing yaw (forward = (sin yaw, cos yaw))
const turn = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

export function createSummitSquare(ctx) {
  const { scene, colliders } = ctx;
  const g = new THREE.Group(); g.name = 'summit-square'; scene.add(g);
  const b = new Batcher({ vertexColors: true });
  const rnd = mulberry32(1108);
  const Y = S.y, W = S.maxX - S.minX, D = S.maxZ - S.minZ, cx = (S.minX + S.maxX) / 2;

  // ---- the ground: a slab in the joints' colour, pavers laid on it in two tones with a border band, a low kerb round three sides
  // (the front is the sidewalk's back edge: the pavers meet it flush), the whole square a surface you stand on
  addSurface({ minX: S.minX, maxX: S.maxX, minZ: S.minZ, maxZ: S.maxZ, y: Y, sound: 'stone' });
  // (texture-sweep: the slab's front 1 cm under the sidewalk's edge: its face at S.minZ was level with the town's kerb drop there)
  b.boxMinMax(S.minX, 0.3, S.minZ - 0.01, S.maxX, Y - 0.004, S.maxZ, C.joint);
  const BW = 0.5, P = 0.9, GAP = 0.04;
  for (const [x0, z0, x1, z1] of [[S.minX, S.minZ, S.maxX, S.minZ + BW], [S.minX, S.maxZ - BW, S.maxX, S.maxZ], [S.minX, S.minZ + BW, S.minX + BW, S.maxZ - BW], [S.maxX - BW, S.minZ + BW, S.maxX, S.maxZ - BW]]) {
    b.add(SQ, C.border, { x: (x0 + x1) / 2, y: Y, z: (z0 + z1) / 2, sx: x1 - x0 - GAP, sz: z1 - z0 - GAP });
  }
  const nx = Math.floor((W - 2 * BW) / P), nz = Math.floor((D - 2 * BW) / P), px0 = S.minX + BW + ((W - 2 * BW) - nx * P) / 2, pz0 = S.minZ + BW + ((D - 2 * BW) - nz * P) / 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) b.add(SQ, (i + j) % 2 ? C.paverA : C.paverB, { x: px0 + (i + 0.5) * P, y: Y, z: pz0 + (j + 0.5) * P, sx: P - GAP, sz: P - GAP });
  b.boxMinMax(S.minX - 0.12, 0.3, S.minZ, S.minX, Y + 0.06, S.maxZ + 0.12, C.kerb);
  b.boxMinMax(S.maxX, 0.3, S.minZ, S.maxX + 0.12, Y + 0.06, S.maxZ + 0.12, C.kerb);
  b.boxMinMax(S.minX, 0.3, S.maxZ, S.maxX, Y + 0.06, S.maxZ + 0.12, C.kerb);

  // ---- the front: a low planter wall either side of the way in, flowers along it
  const flowers = (x0, x1, z, n, seed) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * (x1 - x0) / n + (rnd() - 0.5) * 0.12, zz = z + (rnd() - 0.5) * 0.14;
      b.add(GEO.ico1, i % 2 ? C.leaf : C.leaf2, { x, y: Y + 0.54, z: zz, sx: 0.15, sy: 0.11, sz: 0.13, ry: rnd() * 3 });
      b.add(GEO.ico0, FLOWERS[(i + seed) % FLOWERS.length], { x: x + 0.02, y: Y + 0.64 + (i % 3) * 0.015, z: zz, sx: 0.07, sy: 0.06, sz: 0.07 });
    }
  };
  for (const [x0, x1] of [[S.minX, S.gate.x0], [S.gate.x1, S.maxX]]) {
    b.boxMinMax(x0, Y - 0.02, S.minZ, x1, Y + 0.46, S.minZ + 0.55, C.kerb);
    b.boxMinMax(x0 - 0.02, Y + 0.46, S.minZ - 0.02, x1 + 0.02, Y + 0.52, S.minZ + 0.57, C.kerbDk);
    b.boxMinMax(x0 + 0.08, Y + 0.44, S.minZ + 0.08, x1 - 0.08, Y + 0.465, S.minZ + 0.47, C.soil);
    flowers(x0 + 0.2, x1 - 0.2, S.minZ + 0.28, Math.round((x1 - x0) / 0.45), x0 < cx ? 0 : 2);
    colliders.push({ type: 'box', minX: x0 - 0.02, maxX: x1 + 0.02, minZ: S.minZ - 0.02, maxZ: S.minZ + 0.57 });
  }

  // ---- the shelter: six posts on footings, beams, a gabled roof (the ridge along x) with rafters under it, the gable ends boarded,
  // the name on the front fascia
  const sh = S.shelter, hw = sh.w / 2, hd = sh.d / 2, EV = Y + sh.eave, OV = 0.45, rise = sh.ridge - sh.eave, run = hd + OV, slope = Math.atan2(rise, run), len = Math.hypot(rise, run);
  const posts = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]].map(([kx, kz]) => [sh.x + kx * (hw - 0.14), sh.z + kz * (hd - 0.14)]);
  // (town-fixes) dry under its roof: an open room (indoor-rooms.js), the roof's footprint (the gable ends' overhang, the slopes'
  // eaves) climbing from under the eaves to the ridge, so no drop, splash, snow or wet gets under it; the camera there is still outdoors
  addRoom({ id: 'summit-shelter', open: true, minX: sh.x - hw - 0.45, maxX: sh.x + hw + 0.45, minZ: sh.z - run, maxZ: sh.z + run, y0: Y, y1: EV - 0.12, gable: 'x', pitch: rise / run, pad: 0 });
  const shelterModel = propsReady('shelter');
  if (shelterModel) { // props-static: the Blender shelter (its front, +z in the model, toward the road); the posts stay solid as before
    addProp(b, 'shelter', { x: sh.x, y: Y, z: sh.z, yaw: Math.PI }, { skin: 'summit' });
    for (const [x, z] of posts) colliders.push({ type: 'box', minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });
  } else {
  for (const [x, z] of posts) {
    b.boxMinMax(x - 0.19, Y - 0.01, z - 0.19, x + 0.19, Y + 0.1, z + 0.19, C.concrete);
    b.boxMinMax(x - 0.11, Y + 0.1, z - 0.11, x + 0.11, EV + 0.02, z + 0.11, C.post);
    colliders.push({ type: 'box', minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });
  }
  for (const kz of [-1, 1]) b.boxMinMax(sh.x - hw - 0.1, EV, sh.z + kz * (hd - 0.14) - 0.09, sh.x + hw + 0.1, EV + 0.18, sh.z + kz * (hd - 0.14) + 0.09, C.beam);   // the plates along the long sides
  for (const kx of [-1, 1]) b.boxMinMax(sh.x + kx * (hw - 0.14) - 0.09, EV + 0.18, sh.z - hd + 0.05, sh.x + kx * (hw - 0.14) + 0.09, EV + 0.34, sh.z + hd - 0.05, C.beam);  // the tie beams across the ends
  b.boxMinMax(sh.x - hw - 0.1, Y + sh.ridge - 0.26, sh.z - 0.07, sh.x + hw + 0.1, Y + sh.ridge - 0.1, sh.z + 0.07, C.beam);   // the ridge beam
  // (a slab along z turned rx about x drops its +z end for a positive rx: the south slope (kz +1) is +slope, the north -slope)
  for (const kz of [-1, 1]) {
    for (let i = 0; i <= 8; i++) { // the rafters, from the ridge down past the eave
      const x = sh.x - hw + i * (sh.w / 8);
      b.add(GEO.box, C.beam, { x, y: Y + sh.ridge - 0.14 - rise / 2 * ((hd + OV - 0.1) / run), z: sh.z + kz * (hd + OV - 0.1) / 2, sx: 0.07, sy: 0.14, sz: len - 0.2, rx: kz * slope });
    }
    b.add(GEO.box, C.roof, { x: sh.x, y: Y + sh.ridge - rise / 2 + 0.02, z: sh.z + kz * run / 2, sx: sh.w + 0.9, sy: 0.08, sz: len + 0.04, rx: kz * slope });   // the roof's two slopes
    for (let k = 0.35; k < len - 0.1; k += 0.6) { const d = k / len; b.add(GEO.box, C.roofDk, { x: sh.x, y: Y + sh.ridge - rise * d + 0.07, z: sh.z + kz * run * d, sx: sh.w + 0.88, sy: 0.03, sz: 0.05, rx: kz * slope }); } // the standing seams across
    b.add(GEO.box, C.fascia, { x: sh.x, y: EV + 0.04, z: sh.z + kz * (run + 0.03), sx: sh.w + 0.9, sy: 0.22, sz: 0.04 });   // the fascia boards
  }
  b.add(GEO.box, C.roofDk, { x: sh.x, y: Y + sh.ridge + 0.05, z: sh.z, sx: sh.w + 0.92, sy: 0.07, sz: 0.3 });   // the ridge cap
  { // the gable ends: a boarded triangle each, under the roof's peak
    const tri = new THREE.Shape([new THREE.Vector2(-hd - OV + 0.05, EV + 0.02), new THREE.Vector2(hd + OV - 0.05, EV + 0.02), new THREE.Vector2(0, Y + sh.ridge - 0.08)]);
    for (const kx of [-1, 1]) { const geo = new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false }); b.add(geo, C.gable, { x: sh.x + kx * (hw - 0.03) - 0.03, y: 0, z: sh.z, ry: Math.PI / 2 }); geo.dispose(); }
  }
  }
  // the name on the front fascia (toward the road)
  const nameTex = signTexture(['SUMMIT SQUARE'], { bg: C.roofDk, fg: '#fff4dc', w: 768, h: 96 });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.4), new THREE.MeshBasicMaterial({ map: nameTex, fog: true })); m.position.set(sh.x, EV + 0.02, sh.z - run - 0.06 - (shelterModel ? 0.02 : 0)); m.rotation.y = Math.PI; m.name = 'summit-square-name'; m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m); }

  // ---- the two picnic tables under it (picnic-build.js: the same table as the Picnic Lawn's), their bench places seats
  const tables = [], seats = [];
  for (const t of S.tables) {
    const top = addTable(b, t.x, t.z, t.yaw, TABLE.len, [-1, 1], Y);
    for (const k of [-0.75, 0, 0.75]) { const [qx, qz] = turn(t.x, t.z, t.yaw, k, 0); colliders.push({ type: 'circle', x: qx, z: qz, r: 0.5 }); }
    const ts = [];
    for (const s of [-1, 1]) for (const k of [-TABLE.k, TABLE.k]) {
      const [sx, sz] = turn(t.x, t.z, t.yaw, k, s * TABLE.off), yaw = Math.atan2(-s * Math.sin(t.yaw), -s * Math.cos(t.yaw));
      const seat = addSeat(sx, sz, Y + TABLE.bench, yaw, 'Summit Square table', 'E  Sit at the table', { table: top, square: t.id, floor: Y });
      seat.id = `${t.id}-${s < 0 ? 'a' : 'b'}${k < 0 ? '0' : '1'}`;
      ts.push(seat); seats.push(seat);
    }
    tables.push({ id: t.id, x: t.x, z: t.z, yaw: t.yaw, top, seats: ts, floor: Y });
  }

  // ---- the park benches: iron ends, wooden slats, the seat 0.3 over the pavers (seat-height), two places each
  const benchSeats = [];
  for (const bn of S.benches) {
    if (propsReady('bench_park')) addProp(b, 'bench_park', { x: bn.x, y: Y, z: bn.z, yaw: bn.yaw }, { skin: 'summit' }); // (props-static: the Blender cast-iron bench)
    else {
    const part = (lx, ly, lz, sx, sy, sz, col) => { const [x, z] = turn(bn.x, bn.z, bn.yaw, lx, lz); b.add(GEO.box, col, { x, y: Y + ly, z, sx, sy, sz, ry: bn.yaw }); };
    for (const lz of [-0.17, -0.03, 0.11]) part(0, 0.275, lz, 1.8, 0.05, 0.12, lz < 0 ? C.slat : C.slatDk);        // the seat's slats
    for (const [ly, lz] of [[0.52, -0.3], [0.7, -0.345]]) part(0, ly, lz, 1.8, 0.11, 0.045, C.slat);              // the back's
    for (const k of [-0.82, 0.82]) {
      part(k, 0.14, -0.03, 0.06, 0.28, 0.42, C.iron);                                                               // the ends: a leg block
      part(k, 0.3, -0.03, 0.08, 0.05, 0.5, C.iron);                                                                 // the seat's rail
      part(k, 0.55, -0.32, 0.06, 0.5, 0.06, C.iron);                                                                // the back's upright
      part(k, 0.36, 0.28, 0.06, 0.05, 0.2, C.iron);                                                                 // the arm rest's front
    }
    part(0, 0.03, -0.03, 1.5, 0.04, 0.08, C.iron);                                                                  // the stretcher
    }
    addBenchSeats(bn.x, bn.z, Y + 0.3, bn.yaw, 'Summit Square bench', 0.5);
    benchSeats.push({ x: bn.x, z: bn.z, yaw: bn.yaw, y: Y + 0.3 });
    const along = Math.abs(Math.sin(bn.yaw)) > 0.5 ? [0.32, 0.98] : [0.98, 0.32];   // (facing east or west: it runs along z)
    colliders.push({ type: 'box', minX: bn.x - along[0], maxX: bn.x + along[0], minZ: bn.z - along[1], maxZ: bn.z + along[1] });
  }

  // ---- two lamps by the way in: a green post, a lantern head with its glass alight at night
  const lampSpots = [];
  for (const L of S.lamps) {
    if (propsReady('post_lantern')) { // props-static: the Blender lantern post in Summit Green, its light at the old spot
      addProp(b, 'post_lantern', { x: L.x, y: Y, z: L.z }, { skin: 'summit_green' });
      addNightSpot({ x: L.x, y: Y + 3.3, z: L.z, color: '#ffd98e', pool: 3.4, gy: Y, halo: 1.3 });
      lampSpots.push({ x: L.x, y: Y + 3.42, z: L.z });
      colliders.push({ type: 'circle', x: L.x, z: L.z, r: 0.17 });
      continue;
    }
    b.add(GEO.cyl8, C.iron, { x: L.x, y: Y + 0.08, z: L.z, sx: 0.16, sy: 0.16, sz: 0.16 });
    b.add(GEO.cyl8, C.roofDk, { x: L.x, y: Y + 1.65, z: L.z, sx: 0.055, sy: 3.1, sz: 0.055 });
    b.add(GEO.box, C.iron, { x: L.x, y: Y + 3.2, z: L.z, sx: 0.3, sy: 0.04, sz: 0.3 });
    b.add(GEO.box, lampGlow('#fff3c4'), { x: L.x, y: Y + 3.42, z: L.z, sx: 0.26, sy: 0.4, sz: 0.26 });
    for (const k of [-1, 1]) { b.add(GEO.box, C.iron, { x: L.x + k * 0.135, y: Y + 3.42, z: L.z, sx: 0.025, sy: 0.42, sz: 0.28 }); b.add(GEO.box, C.iron, { x: L.x, y: Y + 3.42, z: L.z + k * 0.135, sx: 0.28, sy: 0.42, sz: 0.025 }); }
    b.add(GEO.cone8, C.iron, { x: L.x, y: Y + 3.72, z: L.z, sx: 0.26, sy: 0.2, sz: 0.26 });
    b.add(GEO.sphere, C.iron, { x: L.x, y: Y + 3.86, z: L.z, sx: 0.04, sy: 0.04, sz: 0.04 });
    addNightSpot({ x: L.x, y: Y + 3.3, z: L.z, color: '#ffd98e', pool: 3.4, gy: Y, halo: 1.3 });
    lampSpots.push({ x: L.x, y: Y + 3.42, z: L.z });
    colliders.push({ type: 'circle', x: L.x, z: L.z, r: 0.17 });
  }

  // ---- the planters flanking the way in, a maple and an oak either side of the back bench (in paver cut-outs), the bin
  for (const [i, pl] of S.planters.entries()) {
    b.boxMinMax(pl.x - 0.45, Y, pl.z - 0.45, pl.x + 0.45, Y + 0.49, pl.z + 0.45, C.planter);   // (texture-sweep: the body's top inside the rim, not level with it)
    b.boxMinMax(pl.x - 0.48, Y + 0.46, pl.z - 0.48, pl.x + 0.48, Y + 0.52, pl.z + 0.48, C.planterDk);
    b.boxMinMax(pl.x - 0.38, Y + 0.5, pl.z - 0.38, pl.x + 0.38, Y + 0.525, pl.z + 0.38, C.soil);
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + i, r = 0.08 + (k % 3) * 0.08; b.add(GEO.ico1, k % 2 ? C.leaf : C.leaf2, { x: pl.x + Math.cos(a) * r, y: Y + 0.62 + (k % 2) * 0.04, z: pl.z + Math.sin(a) * r, sx: 0.16, sy: 0.12, sz: 0.14 }); if (k % 2) b.add(GEO.ico0, FLOWERS[(k + i) % FLOWERS.length], { x: pl.x + Math.cos(a) * r, y: Y + 0.74, z: pl.z + Math.sin(a) * r, sx: 0.07, sy: 0.06, sz: 0.07 }); }
    colliders.push({ type: 'box', minX: pl.x - 0.48, maxX: pl.x + 0.48, minZ: pl.z - 0.48, maxZ: pl.z + 0.48 });
  }
  for (const [i, t] of S.trees.entries()) {
    b.add(SQ, C.soil, { x: t.x, y: Y + 0.003, z: t.z, sx: 1.3, sz: 1.3 });
    b.boxMinMax(t.x - 0.72, Y, t.z - 0.72, t.x + 0.72, Y + 0.08, t.z - 0.62, C.kerbDk); b.boxMinMax(t.x - 0.72, Y, t.z + 0.62, t.x + 0.72, Y + 0.08, t.z + 0.72, C.kerbDk);
    b.boxMinMax(t.x - 0.72, Y, t.z - 0.62, t.x - 0.62, Y + 0.08, t.z + 0.62, C.kerbDk); b.boxMinMax(t.x + 0.62, Y, t.z - 0.62, t.x + 0.72, Y + 0.08, t.z + 0.62, C.kerbDk);
    const r = addTree(b, t.x, t.z, i ? 'oak' : 'maple', rnd, 0.85);
    colliders.push({ type: 'circle', x: t.x, z: t.z, r: r + 0.1 });
  }
  { const { x, z } = S.bin;
    b.add(GEO.cyl12, C.bin, { x, y: Y + 0.42, z, sx: 0.3, sy: 0.84, sz: 0.3 });
    b.add(GEO.cyl12, C.binDk, { x, y: Y + 0.87, z, sx: 0.33, sy: 0.07, sz: 0.33 });
    b.add(GEO.box, C.binDk, { x, y: Y + 0.93, z, sx: 0.18, sy: 0.04, sz: 0.05 });
    for (const yy of [0.2, 0.62]) b.add(GEO.cyl12, '#356a40', { x, y: Y + yy, z, sx: 0.31, sy: 0.03, sz: 0.31 });
    colliders.push({ type: 'circle', x, z, r: 0.36 }); }
  // the name on a post by the gate, facing the road
  { const sg = S.sign, fx = Math.sin(sg.yaw), fz = Math.cos(sg.yaw);
    // (the post 6 cm back: at 4 its front face stood 3 mm in front of the words, a stripe down the middle: the signs audit)
    b.add(GEO.box, C.post, { x: sg.x - fx * 0.06, y: Y + 0.75, z: sg.z - fz * 0.06, sx: 0.09, sy: 1.5, sz: 0.09, ry: sg.yaw });
    b.add(GEO.box, C.postDk, { x: sg.x - fx * 0.03, y: Y + 1.38, z: sg.z - fz * 0.03, sx: 1.06, sy: 0.46, sz: 0.04, ry: sg.yaw });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), new THREE.MeshBasicMaterial({ map: signTexture(['Summit Square', 'games welcome'], { bg: '#2f6b4f', fg: '#ffffff', w: 512, h: 208 }), fog: true }));
    m.position.set(sg.x + fx * 0.002, Y + 1.38, sg.z + fz * 0.002); m.rotation.y = sg.yaw; m.name = 'summit-square-sign'; m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m);
    colliders.push({ type: 'circle', x: sg.x, z: sg.z, r: 0.12 }); }

  b.build(g, 'summit-square');
  void terrainHeight;
  return {
    name: 'square',
    api: { tables, seats, benches: benchSeats, lamps: lampSpots, y: Y, group: g },
    help: [[['E'], 'sit on a bench in Summit Square, or set a borrowed game up on a table under its shelter']],
  };
}
