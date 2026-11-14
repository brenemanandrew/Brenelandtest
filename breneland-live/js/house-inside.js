// The ranch house's inside: one floor at HOUSE.floorY, 3 bed / 2 bath, about 1,500 sq ft (layout.js HOUSE_PLAN rooms). West to
// east: the laundry (the door from the garage) and the kitchen with the TARDIS-blue dining room behind it, then the living room in
// the middle (the front door opens into it, a vaulted ceiling, the fireplace on the back wall with the TV over it, the tall window
// onto the deck on its left and the deck's door on its right), then the bedroom wing off a short hall: the hall bath and a bedroom
// at the front, a bedroom and the main bedroom (with its own bath) at the back. Plus the garage's things.
//
// Walls are a core with a painted lining on each side (each room its own colour), cut round the doorways. Everything inside is one
// batch per kind (castShadow off), hidden while nobody's near (main-house.js). buildInside(group, colliders) ->
// { group, rooms (with the room view's camera spots), walls (2D boxes with heights, for the room view's line of sight), lamps, hearth
// (the living room's fireplace: its spec and coals, for fires.js) }.
import * as THREE from 'three';
import { HOUSE, HOUSE_PLAN, GARAGE } from './layout.js';
import { Batcher, GEO } from './batch.js';
import { soft } from './toon.js';
import { addNightSpot, NIGHT_SPOTS, lampGlow } from './daynight-mats.js';
import { artMat, carpet, tile, worldUV, TILE } from './house-art.js';
import { WINDOWS, DOORS, COL } from './house.js';
import { furnish, LIVING_HEARTH } from './house-rooms.js';
import { buildEmbers } from './hearth-build.js';
import { areaRug } from './house-art.js';

const F = HOUSE.floorY, CY = HOUSE.ceilY, WT = 0.12; // the floor, the flat ceilings, the partitions' thickness
const VAULT = { z: (HOUSE.minZ + HOUSE.maxZ) / 2, top: F + 4.5 };  // the living room's vault: its ridge along x over the house's middle
const PAINT = {
  living: '#f1ece0', hall: '#f1ece0', kitchen: '#efe8d8', laundry: '#ece6d6', dining: '#1f4f8a',
  bath: '#d5e6ea', mainbath: '#d5e6ea', bed2: '#dce7d3', bed3: '#e7dcef', main: '#eadfcd', garage: '#e6e1d6',
};
const R = Object.fromEntries(HOUSE_PLAN.rooms.map(r => [r.id, r]));

// the partitions: a line (axis 'z' = constant x, running along z; 'x' = constant z), its span, its doorways, the room on each side
// (lo = the smaller-coordinate side). `head` = a doorway's top above the floor.
const DOOR_H = 2.12;
export const PARTITIONS = [
  { axis: 'z', at: -3.9, a0: -3.8, a1: 1.6, holes: [[-2.9, -0.7, 2.18]], lo: 'kitchen', hi: 'living', cased: true },
  { axis: 'z', at: -3.9, a0: 1.6, a1: 5.4, holes: [], lo: 'dining', hi: 'living' },
  { axis: 'z', at: -7.2, a0: -3.8, a1: -1.4, holes: [[-3.15, -2.25, DOOR_H]], lo: 'laundry', hi: 'kitchen' },
  { axis: 'x', at: -1.4, a0: -9.2, a1: -7.2, holes: [], lo: 'laundry', hi: 'kitchen' },
  { axis: 'x', at: 1.6, a0: -9.2, a1: -3.96, holes: [[-8.5, -4.7, 2.3]], lo: 'kitchen', hi: 'dining', cased: true },
  { axis: 'z', at: 2.1, a0: -3.8, a1: -0.6, holes: [], lo: 'living', hi: 'bath' },
  { axis: 'z', at: 2.1, a0: -0.6, a1: 0.6, holes: [[-0.55, 0.55, DOOR_H]], lo: 'living', hi: 'hall', cased: true },
  { axis: 'z', at: 2.1, a0: 0.6, a1: 5.4, holes: [], lo: 'living', hi: 'bed3' },
  { axis: 'x', at: -0.6, a0: 2.1, a1: 4.3, holes: [[2.8, 3.65, DOOR_H]], lo: 'bath', hi: 'hall' },
  { axis: 'x', at: -0.6, a0: 4.3, a1: 8.4, holes: [[4.9, 5.8, DOOR_H]], lo: 'bed2', hi: 'hall' },
  { axis: 'x', at: 0.6, a0: 2.1, a1: 4.9, holes: [[3.0, 3.85, DOOR_H]], lo: 'hall', hi: 'bed3' },
  { axis: 'x', at: 0.6, a0: 4.9, a1: 6.9, holes: [[5.3, 6.2, DOOR_H]], lo: 'hall', hi: 'main' },
  { axis: 'x', at: 0.6, a0: 6.9, a1: 8.4, holes: [], lo: 'hall', hi: 'mainbath' },
  { axis: 'z', at: 4.3, a0: -3.8, a1: -0.6, holes: [], lo: 'bath', hi: 'bed2' },
  { axis: 'z', at: 4.9, a0: 0.6, a1: 5.4, holes: [], lo: 'bed3', hi: 'main' },
  { axis: 'z', at: 6.9, a0: 0.6, a1: 2.6, holes: [[1.3, 2.1, DOOR_H]], lo: 'main', hi: 'mainbath' },
  { axis: 'x', at: 2.6, a0: 6.9, a1: 8.4, holes: [], lo: 'mainbath', hi: 'main' },
];
// the outer walls' inner faces, by room (face: N z = minZ + T looking south, S, W, E)
const IN = { N: { axis: 'x', at: HOUSE.minZ + 0.2, s: 1 }, S: { axis: 'x', at: HOUSE.maxZ - 0.2, s: -1 }, W: { axis: 'z', at: HOUSE.minX + 0.2, s: 1 }, E: { axis: 'z', at: HOUSE.maxX - 0.2, s: -1 } };
const SKIN = [
  ['N', 'laundry', -9.2, -7.26], ['N', 'kitchen', -7.14, -3.96], ['N', 'living', -3.84, 2.04], ['N', 'bath', 2.16, 4.24], ['N', 'bed2', 4.36, 8.4],
  ['S', 'dining', -9.2, -3.96], ['S', 'living', -3.84, 2.04], ['S', 'bed3', 2.16, 4.84], ['S', 'main', 4.96, 8.4],
  ['W', 'laundry', -3.8, -1.46], ['W', 'kitchen', -1.34, 1.54], ['W', 'dining', 1.66, 5.4],
  ['E', 'bed2', -3.8, -0.66], ['E', 'hall', -0.54, 0.54], ['E', 'mainbath', 0.66, 2.54], ['E', 'main', 2.66, 5.4],
];

export function buildInside(houseGroup, colliders) {
  const group = new THREE.Group(); group.name = 'house-inside'; houseGroup.add(group);
  const n = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: false });   // walls, trim, furniture (no sun on them: thin linings by the outer walls would stripe)
  const fine = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: false }); // thin things (never inked)
  const cp = new Batcher({ castShadow: false }), tl = new Batcher({ castShadow: false }); // carpet, tile
  const carpetM = artMat('carpet', carpet), tileM = artMat('tile', tile);
  const glassIn = new THREE.MeshBasicMaterial({ color: '#cfe4f2', fog: false }); glassIn.name = 'house-glass-in'; // no pane uses it now, but main-house.js still sets its colour and the deck door's pane copies it
  const walls = [], lamps = [];
  const lamp = s => { addNightSpot(s); lamps.push(NIGHT_SPOTS[NIGHT_SPOTS.length - 1]); };
  const box = (b, x0, y0, z0, x1, y1, z1, c) => b.boxMinMax(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c);
  // a slab along a line: axis 'z' (constant x = at, from a0 to a1 along z) or 'x'; from c0 to c1 across it
  const slab = (b, axis, at0, at1, a0, a1, y0, y1, c) => (axis === 'z' ? box(b, at0, y0, a0, at1, y1, a1, c) : box(b, a0, y0, at0, a1, y1, at1, c));

  // ---------------------------------------------------------------- the partitions, painted each side, cased round their openings
  for (const w of PARTITIONS) {
    const holes = w.holes.map(([a0, a1, h]) => ({ a0, a1, y0: F, y1: F + h }));
    const top = w.lo === 'living' || w.hi === 'living' ? CY : CY; // the living room's gable ends are added with the vault below
    for (const [a0, a1, y0, y1] of cutPieces(w.a0, w.a1, F, top, holes)) {
      slab(n, w.axis, w.at - WT / 2 + 0.012, w.at + WT / 2 - 0.012, a0, a1, y0, y1, '#e9e4d8');
      slab(n, w.axis, w.at - WT / 2, w.at - WT / 2 + 0.012, a0, a1, y0, y1, PAINT[w.lo]);
      slab(n, w.axis, w.at + WT / 2 - 0.012, w.at + WT / 2, a0, a1, y0, y1, PAINT[w.hi]);
      // baseboards
      if (y0 <= F + 0.01) for (const s of [-1, 1]) slab(fine, w.axis, w.at + s * (WT / 2), w.at + s * (WT / 2 + 0.02), a0, a1, F, F + 0.1, COL.trim);
    }
    for (const h of holes) { // the casing round each doorway (both faces) and the jambs
      for (const s of [-1, 1]) {
        const o0 = w.at + s * WT / 2, o1 = o0 + s * 0.025;
        slab(fine, w.axis, o0, o1, h.a0 - 0.08, h.a0, F, h.y1 + 0.08, COL.trim);
        slab(fine, w.axis, o0, o1, h.a1, h.a1 + 0.08, F, h.y1 + 0.08, COL.trim);
        slab(fine, w.axis, o0, o1, h.a0 - 0.08, h.a1 + 0.08, h.y1, h.y1 + 0.08, COL.trim);
      }
      slab(n, w.axis, w.at - WT / 2, w.at + WT / 2, h.a0, h.a0 + 0.02, F, h.y1, COL.trim);
      slab(n, w.axis, w.at - WT / 2, w.at + WT / 2, h.a1 - 0.02, h.a1, F, h.y1, COL.trim);
      slab(n, w.axis, w.at - WT / 2, w.at + WT / 2, h.a0, h.a1, h.y1 - 0.02, h.y1, COL.trim);
    }
    // colliders and the room view's walls (2D boxes)
    let a = w.a0;
    const cut = [...holes].sort((p, q) => p.a0 - q.a0);
    const put = (p, q) => {
      if (q - p < 0.02) return;
      const bx = w.axis === 'z' ? { minX: w.at - WT / 2, maxX: w.at + WT / 2, minZ: p, maxZ: q } : { minX: p, maxX: q, minZ: w.at - WT / 2, maxZ: w.at + WT / 2 };
      colliders.push({ type: 'box', ...bx, house: true, inner: true });
      walls.push({ ...bx, y0: F, y1: CY });
    };
    for (const h of cut) { put(a, h.a0); a = h.a1; }
    put(a, w.a1);
  }
  // the outer walls' inner faces: painted, cut round the windows and doors, with the panes, casings and sills seen from inside
  const winsOn = f => [...WINDOWS.filter(w => w.f === f).map(w => ({ a0: w.a - w.w / 2, a1: w.a + w.w / 2, y0: w.y0, y1: w.y1 })), ...DOORS.filter(d => d.f === f)];
  for (const [f, room, a0, a1] of SKIN) {
    const I = IN[f], y1 = CY + (room === 'living' ? 0.12 : 0.02); // up into the ceiling, so no outer wall shows at the joint
    for (const [p, q, y0, yy] of cutPieces(a0, a1, F, y1, winsOn(f))) slab(n, I.axis, I.at, I.at + I.s * 0.012, p, q, y0, yy, PAINT[room]);
    slab(fine, I.axis, I.at + I.s * 0.012, I.at + I.s * 0.03, a0, a1, F, F + 0.1, COL.trim);
  }
  // the reveals round every opening in the outer walls (the walls are 0.2 thick: painted white, not the outside's brick or siding).
  // They stand 1 cm inside the opening, from the wall's outer face through the painted lining, so they cover those ends and the
  // lining's. Lying in the plane of the opening's own brick or siding, the two fought for the pixels and the entryway flashed brick.
  for (const o of [...WINDOWS.map(w => ({ f: w.f, a0: w.a - w.w / 2, a1: w.a + w.w / 2, y0: w.y0, y1: w.y1 })), ...DOORS]) {
    const I = IN[o.f]; if (!I) continue;
    const t0 = I.at + I.s * 0.012, t1 = I.at - I.s * 0.2, lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    slab(n, I.axis, lo, hi, o.a0, o.a0 + 0.01, o.y0, o.y1, COL.trim);
    slab(n, I.axis, lo, hi, o.a1 - 0.01, o.a1, o.y0, o.y1, COL.trim);
    slab(n, I.axis, lo, hi, o.a0, o.a1, o.y1 - 0.01, o.y1, COL.trim);
    if (o.y0 > F + 0.05) slab(n, I.axis, lo, hi, o.a0, o.a1, o.y0, o.y0 + 0.01, COL.trim);
  }
  for (const w of WINDOWS) {
    const I = IN[w.f]; if (!I) continue;
    const h = w.y1 - w.y0, ym = (w.y0 + w.y1) / 2;
    // no pane of its own from inside, nor muntins: you look out through the outside's own glass and bars
    for (const s of [-1, 1]) slab(fine, I.axis, I.at, I.at + I.s * 0.025, w.a + s * w.w / 2, w.a + s * (w.w / 2 + 0.08), w.y0 - 0.06, w.y1 + 0.08, COL.trim);
    slab(fine, I.axis, I.at, I.at + I.s * 0.025, w.a - w.w / 2 - 0.08, w.a + w.w / 2 + 0.08, w.y1, w.y1 + 0.08, COL.trim);
    slab(n, I.axis, I.at - I.s * 0.05, I.at + I.s * 0.08, w.a - w.w / 2 - 0.12, w.a + w.w / 2 + 0.12, w.y0 - 0.06, w.y0, COL.trim); // the stool
    void h;
  }
  // the outer walls as the room view's walls too
  const { minX, maxX, minZ, maxZ } = HOUSE;
  walls.push({ minX, maxX, minZ, maxZ: minZ + 0.2, y0: F, y1: CY }, { minX, maxX, minZ: maxZ - 0.2, maxZ, y0: F, y1: CY },
    { minX, maxX: minX + 0.2, minZ, maxZ, y0: F, y1: CY }, { minX: maxX - 0.2, maxX, minZ, maxZ, y0: F, y1: CY });

  // ---------------------------------------------------------------- floors and ceilings
  // a floor stops at the outer walls' inner faces, its margin under the partitions only (in a doorway the margin lay in the plane of
  // the wall's own top, and the front door threshold's brick flashed through the carpet). The tile lies 2 mm over the carpet, so
  // where they meet under a doorway, or the main bath's tile inside the main bedroom's carpet, one wins
  const H = HOUSE.hall;
  for (const r of HOUSE_PLAN.rooms) {
    if (r.id === 'garage') continue;
    const tiled = r.id === 'kitchen' || r.id === 'laundry' || r.id === 'dining' || r.id === 'bath' || r.id === 'mainbath', up = tiled ? 0.002 : 0;
    box(tiled ? tl : cp, Math.max(H.minX, r.minX - 0.07), F - 0.1 + up, Math.max(H.minZ, r.minZ - 0.07), Math.min(H.maxX, r.maxX + 0.07), F + up, Math.min(H.maxZ, r.maxZ + 0.07), tiled ? tileM : carpetM);
    if (r.id !== 'living') box(n, r.minX - 0.07, CY, r.minZ - 0.07, r.maxX + 0.07, CY + 0.05, r.maxZ + 0.07, '#f6f3ec');
  }
  // the living room's vault (vaulted, smooth): up from both long walls to a ridge along x over the house's middle, and the gable
  // ends above the side walls
  {
    const L = R.living, x0 = L.minX - 0.06, x1 = L.maxX + 0.06;
    for (const [za, zb] of [[L.minZ - 0.1, VAULT.z], [L.maxZ + 0.1, VAULT.z]]) {
      const run = Math.abs(zb - za), rise = VAULT.top - CY, len = Math.hypot(run, rise), ang = Math.atan2(rise, run) * Math.sign(zb - za);
      n.add(GEO.box, '#f6f3ec', { x: (x0 + x1) / 2, y: (CY + VAULT.top) / 2 + 0.03, z: (za + zb) / 2, sx: x1 - x0, sy: 0.05, sz: len, rx: -ang });
    }
    for (const [x, c] of [[-3.9, PAINT.living], [2.1, PAINT.living]]) {
      const s = new THREE.Shape([new THREE.Vector2(L.minZ - 0.1, 0), new THREE.Vector2(L.maxZ + 0.1, 0), new THREE.Vector2(VAULT.z, VAULT.top - CY)]);
      const g = new THREE.ExtrudeGeometry(s, { depth: WT, bevelEnabled: false }).translate(0, 0, -WT / 2).rotateY(-Math.PI / 2);
      n.add(g, c, { x, y: CY, z: 0 });
    }
  }

  // ---------------------------------------------------------------- the garage's inside walls (drywall) and ceiling
  {
    const G = GARAGE, GT = 0.15;
    box(n, G.minX + GT, G.floorY, G.minZ + GT, G.minX + GT + 0.01, CY, G.maxZ - GT, COL.drywall);
    box(n, G.minX + GT, G.floorY, G.maxZ - GT - 0.01, G.maxX, CY, G.maxZ - GT, COL.drywall);
    for (const [a0, a1] of [[G.minX + GT, G.door.minX], [G.door.maxX, G.maxX - 0.2]]) box(n, a0, G.floorY, G.minZ + GT, a1, CY, G.minZ + GT + 0.01, COL.drywall);
    box(n, G.door.minX, G.floorY + G.door.height, G.minZ + GT, G.door.maxX, CY, G.minZ + GT + 0.01, COL.drywall);
    box(n, G.minX + GT, CY, G.minZ + GT, G.maxX - 0.2, CY + 0.05, HOUSE.minZ, '#f2efe8'); // in two: its end lay in the brick return's face
    box(n, G.minX + GT, CY, HOUSE.minZ, G.maxX, CY + 0.05, G.maxZ - GT, '#f2efe8');
    walls.push({ minX: G.minX, maxX: G.minX + GT, minZ: G.minZ, maxZ: G.maxZ, y0: G.floorY, y1: CY }, { minX: G.minX, maxX: G.maxX, minZ: G.maxZ - GT, maxZ: G.maxZ, y0: G.floorY, y1: CY });
  }

  garageThings(n, fine, colliders);
  const { embers } = furnish(n, fine, colliders, { rug: areaRug() });

  // the indoor lights (main-house.js turns them up by day while you are inside, as in the game store), each at the fixture it
  // comes from (fire-season: every light has a source you can see): the living room's ceiling fan light, between the kitchen's
  // pendants, under the dining room's light, and a flush ceiling light in the hall and each bedroom (a bronze rim, a glowing dome),
  // a bulb batten in the garage. The fixtures are in the inside's batch (the dome's glow is the fan light's material).
  const DOME = lampGlow('#f6e3bd');
  lamp({ x: -0.9, y: F + 3.45, z: 1.4, color: '#ffd9a0', pool: 4.2, gy: F, halo: 0 });   // the fan's light (house-rooms.js)
  lamp({ x: -6.2, y: F + 1.62, z: -0.9, color: '#ffd9a0', pool: 3.2, gy: F, halo: 0 });  // the island's two pendants
  lamp({ x: -6.6, y: F + 1.86, z: 3.5, color: '#ffd9a0', pool: 3.0, gy: F, halo: 0 });   // the dining room's light
  for (const [x, z, pool] of [[5.2, 0, 2.2], [6.4, 3.6, 3.0], [6.4, -2.2, 2.8], [3.5, 3.0, 2.6]]) {
    n.add(GEO.cyl12, '#3b2a20', { x, y: CY - 0.015, z, sx: 0.36, sy: 0.03, sz: 0.36 });
    n.add(GEO.sphere, DOME, { x, y: CY - 0.03, z, sx: 0.3, sy: 0.14, sz: 0.3 });
    lamp({ x, y: CY - 0.2, z, color: '#ffd9a0', pool, gy: F, halo: 0 });
  }
  { const x = -12.8, z = -1.6; // the garage's: a white batten with a bare tube
    n.add(GEO.box, '#f2efe8', { x, y: CY - 0.03, z, sx: 1.3, sy: 0.06, sz: 0.14 });
    n.add(GEO.cyl8, DOME, { x, y: CY - 0.09, z, sx: 0.06, sy: 1.16, sz: 0.06, rz: Math.PI / 2 });
    lamp({ x, y: CY - 0.25, z, color: '#ffd9a0', pool: 4.0, gy: GARAGE.floorY, halo: 0 }); }

  n.build(group, 'house-in');
  fine.build(group, 'house-in-fine').forEach(m => soft(m));
  for (const m of cp.build(group, 'house-carpet')) { worldUV(m.geometry, TILE.carpet); m.userData.notSign = true; }
  for (const m of tl.build(group, 'house-tile')) { worldUV(m.geometry, TILE.tile); m.userData.notSign = true; }
  const hearth = { spec: LIVING_HEARTH, ...buildEmbers(embers, group, 'hearth-embers') }; // the living room's fire (fires.js)

  // the rooms with their camera spots for the room view (corners under the ceiling, inset; the living room's higher)
  const cams = (r, y) => [[r.minX + 0.35, r.minZ + 0.35, y], [r.maxX - 0.35, r.minZ + 0.35, y], [r.minX + 0.35, r.maxZ - 0.35, y], [r.maxX - 0.35, r.maxZ - 0.35, y]];
  // (camera-view) ceilAt: the ceiling over a spot, for a camera kept under it (the living room's vault slopes from the walls to its ridge)
  const vaultAt = (L, z) => CY + (VAULT.top - CY) * Math.max(0, z < VAULT.z ? (z - (L.minZ - 0.1)) / (VAULT.z - (L.minZ - 0.1)) : ((L.maxZ + 0.1) - z) / ((L.maxZ + 0.1) - VAULT.z));
  const rooms = HOUSE_PLAN.rooms.map(r => ({ ...r, top: r.id === 'living' ? VAULT.top : CY, ceilAt: r.id === 'living' ? (x, z) => vaultAt(r, z) : () => CY, cams: cams(r, (r.id === 'living' ? CY + 0.3 : CY) - 0.3) }));
  return { group, rooms, walls, lamps, glassIn, hearth };
}

// a wall's rectangle a0..a1 x y0..y1 cut round holes ({ a0, a1, y0, y1 }): the pieces left
function cutPieces(a0, a1, y0, y1, holes) {
  const hs = holes.filter(h => h.a1 > a0 && h.a0 < a1).sort((p, q) => p.a0 - q.a0), out = [];
  let a = a0;
  for (const h of hs) {
    if (h.a0 > a) out.push([a, h.a0, y0, y1]);
    const p = Math.max(a0, h.a0), q = Math.min(a1, h.a1);
    if (h.y0 > y0) out.push([p, q, y0, Math.min(y1, h.y0)]);
    if (h.y1 < y1) out.push([p, q, Math.max(y0, h.y1), y1]);
    a = Math.max(a, h.a1);
  }
  if (a < a1) out.push([a, a1, y0, y1]);
  return out;
}

// The garage's things, as you stand in the garage facing its back wall (right = west, left = east, the house's side): exercise
// mats on the floor right of the middle with the TV on the right wall above them, the work area in the back-left corner (base
// cabinets, a counter, pegboard and an upper cabinet, a metal shelf of bins beside it on the left wall), the fridge left of the
// work area along the left wall, and the door into the house near the front of the left wall, two steps up (house.js).
function garageThings(n, fine, colliders) {
  const G = GARAGE, y = G.floorY, x0 = G.minX + 0.16, x1 = G.maxX - 0.02, zb = G.maxZ - 0.16;
  const B = (a, b, c, d, e, f, col) => n.boxMinMax(a, b, c, d, e, f, col);
  // the mats: black interlocking foam squares, 3 x 3 m, and the TV over them on the right (west) wall
  const mz0 = -3.25, mz1 = -0.25, mx0 = x0 + 0.1, mx1 = mx0 + 3.0;
  B(mx0, y, mz0, mx1, y + 0.025, mz1, '#2b2d2f');
  for (let i = 1; i < 3; i++) { fine.boxMinMax(mx0 + i, y + 0.025, mz0, mx0 + i + 0.02, y + 0.028, mz1, '#1a1b1c'); fine.boxMinMax(mx0, y + 0.025, mz0 + i, mx1, y + 0.028, mz0 + i + 0.02, '#1a1b1c'); }
  B(x0, y + 1.32, -2.38, x0 + 0.06, y + 2.04, -1.12, '#151617');                  // the TV
  B(x0 + 0.06, y + 1.36, -2.34, x0 + 0.065, y + 2.0, -1.16, '#22313d');
  // a dumbbell rack by the mats, two kettlebells, a rolled yoga mat
  B(x0 + 0.1, y, mz1 + 0.35, x0 + 0.45, y + 0.5, mz1 + 1.25, '#3a3c3e');
  for (let i = 0; i < 5; i++) n.add(GEO.cyl8, '#151617', { x: x0 + 0.28, y: y + 0.56, z: mz1 + 0.45 + i * 0.18, sx: 0.06, sy: 0.3, sz: 0.06, rz: Math.PI / 2 });
  colliders.push({ type: 'box', minX: x0, maxX: x0 + 0.5, minZ: mz1 + 0.3, maxZ: mz1 + 1.3 });
  for (const z of [mz0 - 0.3, mz0 - 0.62]) n.add(GEO.sphere, '#151617', { x: x0 + 0.3, y: y + 0.13, z, sx: 0.13, sy: 0.13, sz: 0.13 });
  n.add(GEO.cyl8, '#3b7d6e', { x: mx1 - 0.25, y: y + 0.09, z: mz0 + 0.4, sx: 0.08, sy: 0.65, sz: 0.08, rx: Math.PI / 2 });
  // the work area in the back-left corner: base cabinets, a counter, pegboard with tools, an upper cabinet
  const wx0 = x1 - 2.45, wx1 = x1 - 0.02;
  B(wx0, y, zb - 0.62, wx1, y + 0.84, zb, '#8a6a48');
  for (let i = 0; i < 4; i++) { const cx = wx0 + 0.31 + i * 0.6; fine.boxMinMax(cx - 0.27, y + 0.08, zb - 0.635, cx + 0.27, y + 0.78, zb - 0.62, '#7b5d3e'); fine.boxMinMax(cx - 0.07, y + 0.66, zb - 0.65, cx + 0.07, y + 0.68, zb - 0.63, '#c9ccce'); }
  B(wx0 - 0.03, y + 0.84, zb - 0.68, wx1, y + 0.89, zb, '#6b6e70');
  B(wx0, y + 1.1, zb - 0.02, wx1, y + 2.0, zb, '#b48a5e');
  const tools = ['#2a2c2d', '#c0392b', '#2a2c2d', '#e0b040', '#2a2c2d', '#c0392b', '#3a6aa8', '#2a2c2d'];
  tools.forEach((c, i) => B(wx0 + 0.18 + i * 0.28, y + 1.3 + (i % 3) * 0.08, zb - 0.05, wx0 + 0.22 + i * 0.28, y + 1.62 + (i % 2) * 0.1, zb - 0.02, c));
  B(wx0 + 0.6, y + 2.15, zb - 0.36, wx1, y + 2.75, zb, '#8a6a48');
  fine.boxMinMax(wx0 + 0.6 + (wx1 - wx0 - 0.6) / 2 - 0.01, y + 2.2, zb - 0.37, wx0 + 0.6 + (wx1 - wx0 - 0.6) / 2 + 0.01, y + 2.7, zb - 0.36, '#6b4f33');
  colliders.push({ type: 'box', minX: wx0 - 0.05, maxX: x1, minZ: zb - 0.7, maxZ: zb });
  // a metal shelf of bins on the left (east) wall beside the bench
  const sz0 = zb - 1.85, sz1 = zb - 0.8, sx0 = x1 - 0.45;
  for (const yy of [0.12, 0.6, 1.08, 1.56, 2.0]) B(sx0, y + yy, sz0, x1, y + yy + 0.03, sz1, '#9da3a6');
  for (const [px, pz] of [[sx0 - 0.002, sz0], [sx0 - 0.002, sz1], [x1 - 0.028, sz0], [x1 - 0.028, sz1]]) B(px, y, pz - 0.015, px + 0.03, y + 2.05, pz + 0.015, '#80868a'); // 2 mm proud of the shelves' ends
  ['#2e6da4', '#d8d3c4', '#3b7d4f', '#b03a2e', '#d8d3c4', '#e0b040'].forEach((c, i) => B(sx0 + 0.04, y + [0.15, 0.63, 1.11, 1.59, 0.15, 1.11][i], (i < 4 ? sz0 + 0.06 : sz0 + 0.55), x1 - 0.04, y + [0.15, 0.63, 1.11, 1.59, 0.15, 1.11][i] + 0.32, (i < 4 ? sz0 + 0.5 : sz1 - 0.06), c));
  colliders.push({ type: 'box', minX: sx0, maxX: x1, minZ: sz0, maxZ: sz1 });
  // the fridge, to the left of the work area along the left wall
  const fz0 = sz0 - 0.95, fz1 = sz0 - 0.2;
  B(x1 - 0.74, y, fz0, x1, y + 1.75, fz1, '#f2f2ef');
  fine.boxMinMax(x1 - 0.755, y + 1.18, fz0 + 0.02, x1 - 0.74, y + 1.2, fz1 - 0.02, '#9da3a6');
  B(x1 - 0.78, y + 1.32, fz0 + 0.06, x1 - 0.75, y + 1.62, fz0 + 0.09, '#9da3a6'); B(x1 - 0.78, y + 0.6, fz0 + 0.06, x1 - 0.75, y + 1.0, fz0 + 0.09, '#9da3a6');
  colliders.push({ type: 'box', minX: x1 - 0.76, maxX: x1, minZ: fz0, maxZ: fz1 });
  // two bins by the front, the ceiling lights
  for (const [x, z, c] of [[x0 + 0.4, G.minZ + 0.55, '#2f5f3a'], [x0 + 1.1, G.minZ + 0.5, '#2a4b7c']]) { B(x - 0.3, y, z - 0.3, x + 0.3, y + 0.95, z + 0.3, c); colliders.push({ type: 'box', minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 }); }
  for (const x of [-14.2, -11.4]) B(x - 0.6, CY - 0.06, -1.7, x + 0.6, CY, -1.5, '#fbfbf8');
}
