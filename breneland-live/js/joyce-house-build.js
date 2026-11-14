// Joyce's house, built from Andrew's photo (docs/refs/joyce-house/andrew-photo.png) and joyce-house-plan.js: a single-storey house,
// tan lap siding, a front gable over a wide two-car garage with a cream door, a darker brick front with a recessed porch, the front
// door and a window between dark shutters, a dark shingle roof with white trim and gutters, coach lamps, shrubs; behind, a glass sun
// room, a cement patio with a round gas firepit and four chairs, a black picket fence and bushes along the back.
//   buildJoyceHouse(parent, colliders) -> { group, inside, glassMeshes, glassReal, glassBase, glassU, garageDoor, doors, lamps, ... }
// Batches: the outside and the garage's inside (one vertex-coloured batch, always drawn), the coach lamps' bulbs, the bedroom
// windows, the house's inside (one batch and its lamps, drawn only while you can look in: joyce-house.js), the real glass (one mesh),
// the garage door and the four door leaves (one instanced mesh). Every face clear of its neighbours' planes (no flicker).
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { lampGlow, addNightSpot, GLASS_DAY } from './daynight-mats.js';
import { realGlass, glassUniforms } from './real-glass.js';
import { soft } from './toon.js';
import { JH } from './joyce-house-plan.js';

const SIDING = '#d4bd8a', SIDING_L = '#c4ab76', TRIM = '#f6f3ea', ROOF = '#4a4a52', ROOF_D = '#3a3a41', BRICK = '#5a3b33', MORTAR = '#77584c';
const SHUTTER = '#2e3838', CREAM = '#efe5c8', CREAM_D = '#d9cca8', CONCRETE = '#cfc9bd', CONCRETE_D = '#bdb6a8', PATIO = '#c8c1b3';
const IRON = '#232328', DRYWALL = '#ebe6da', PAINT = '#f3ead6', WOOD = '#b98a5a', WOOD_D = '#8f6a45', TILE = '#e7e1d2';
export const LAMP_OUT = '#fff0c4', LAMP_IN = '#ffe2a0', LAMP_GARAGE = '#fff8e6';   // the coach lamps' bulbs; the house's lamps inside and the garage's batten (switched by joyce-house.js)

// a box from two corners in any order
function bx(b, x0, y0, z0, x1, y1, z1, c) { b.boxMinMax(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), c); }
// lap siding on a wall face: strips proud of the face, `holes` [[a0, a1, y0, y1]] skipped. axis 'x': the face is at z = at, facing
// dir (+1 / -1); axis 'z': at x = at
function lap(b, axis, at, dir, a0, a1, y0, y1, holes = [], col = SIDING_L, step = 0.21) {
  for (let y = y0 + 0.16; y < y1 - 0.05; y += step) {
    let cuts = [[a0 + 0.02, a1 - 0.02]];
    for (const [h0, h1, hy0, hy1] of holes) {
      if (y + 0.02 < hy0 - 0.03 || y > hy1 + 0.03) continue;
      cuts = cuts.flatMap(([c0, c1]) => (h1 + 0.06 <= c0 || h0 - 0.06 >= c1 ? [[c0, c1]] : [[c0, h0 - 0.06], [h1 + 0.06, c1]]).filter(([p, q]) => q - p > 0.05));
    }
    for (const [c0, c1] of cuts) {
      if (axis === 'x') bx(b, c0, y, at, c1, y + 0.022, at + dir * 0.014, col);
      else bx(b, at, y, c0, at + dir * 0.014, y + 0.022, c1, col);
    }
  }
}
// a triangle (a gable end) in a vertical plane, extruded `depth` toward `dir`: base from a0 to a1 at y0, apex at (am, y1)
function gable(b, axis, at, dir, a0, a1, am, y0, y1, col, depth = 0.1, sb = b) {
  const sh = new THREE.Shape([new THREE.Vector2(a0, y0), new THREE.Vector2(a1, y0), new THREE.Vector2(am, y1)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  // the shape is in (u, y) with the extrusion along +z; turn it into the wall's plane
  if (axis === 'x') { g.translate(0, 0, dir > 0 ? -depth : 0); g.translate(0, 0, at); }
  else { g.rotateY(-Math.PI / 2); g.translate(dir > 0 ? at : at + depth, 0, 0); }   // (u -> z, the extrusion -> -x)
  b.add(g, col);
  // its siding: strips across it, shortened to its slopes
  for (let y = y0 + 0.16; y < y1 - 0.25; y += 0.21) {
    const f = (y + 0.011 - y0) / (y1 - y0), l0 = a0 + (am - a0) * f + 0.06, l1 = a1 + (am - a1) * f - 0.06;
    if (l1 - l0 < 0.1) continue;
    if (axis === 'x') bx(sb, l0, y, at, l1, y + 0.022, at + dir * 0.014, SIDING_L);
    else bx(sb, at, y, l0, at + dir * 0.014, y + 0.022, l1, SIDING_L);
  }
}

// ---------------------------------------------------------------- a coach lamp on a wall (x, y, z: its middle; n: the way it faces)
function coachLamp(b, lb, x, y, z, nx, nz) {
  const px = x - nx * 0.11, pz = z - nz * 0.11;   // the backplate on the wall
  bx(b, px - (nz ? 0.08 : 0.012), y - 0.2, pz - (nx ? 0.08 : 0.012), px + (nz ? 0.08 : 0.012), y + 0.22, pz + (nx ? 0.08 : 0.012), IRON);
  bx(b, px + nx * 0.012 - 0.02 * Math.abs(nz), y + 0.02, pz + nz * 0.012 - 0.02 * Math.abs(nx), x - nx * 0.05 + 0.02 * Math.abs(nz), y + 0.06, z - nz * 0.05 + 0.02 * Math.abs(nx), IRON);
  // the lantern: a cage of four posts, a cap and a base, the bulb (glowing) inside
  for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(GEO.box, IRON, { x: x + a * 0.075, y, z: z + c * 0.075, sx: 0.022, sy: 0.32, sz: 0.022 });
  b.add(GEO.box, IRON, { x, y: y - 0.17, z, sx: 0.19, sy: 0.04, sz: 0.19 });
  b.add(GEO.cone6, IRON, { x, y: y + 0.24, z, sx: 0.15, sy: 0.12, sz: 0.15, ry: Math.PI / 6 });
  lb.add(GEO.box, lampGlow(LAMP_OUT), { x, y: y + 0.01, z, sx: 0.12, sy: 0.26, sz: 0.12 });
  addNightSpot({ x: x + nx * 0.02, y: y + 0.01, z: z + nz * 0.02, color: '#ffd38a', pool: 1.9, gy: JH.gy + 0.05, halo: 0.55 });
}

// ---------------------------------------------------------------- the four door leaves (one instanced mesh): local frame = the hinge
// at the origin, the leaf along +x (width w), up y, its faces toward +-z
function leafGeometry() {
  const b = new Batcher({ vertexColors: true }), g = new THREE.Group();
  bx(b, 0.01, 0, -0.022, 0.89, 2.03, 0.022, '#ffffff');
  for (const [y0, y1] of [[0.18, 0.95], [1.12, 1.88]]) for (const s of [-1, 1]) {
    bx(b, 0.1, y0, s * 0.022, 0.8, y0 + 0.04, s * 0.032, '#d8d8d8'); bx(b, 0.1, y1 - 0.04, s * 0.022, 0.8, y1, s * 0.032, '#d8d8d8');
    bx(b, 0.1, y0 + 0.04, s * 0.022, 0.14, y1 - 0.04, s * 0.032, '#d8d8d8'); bx(b, 0.76, y0 + 0.04, s * 0.022, 0.8, y1 - 0.04, s * 0.032, '#d8d8d8');
  }
  for (const s of [-1, 1]) b.add(GEO.sphere, '#c9a24a', { x: 0.8, y: 1.0, z: s * 0.06, sx: 0.035, sy: 0.035, sz: 0.035 });
  const m = b.build(g, 'leaf')[0];
  return m;
}

export function buildJoyceHouse(parent, colliders) {
  const P = JH, { minX, maxX, FZ, BZ, GX, T, GY, FY, EY, gy } = P;
  const group = new THREE.Group(); group.name = 'joyce-house'; parent.add(group);
  const b = new Batcher({ vertexColors: true });                       // the outside and the garage's inside
  const sb = new Batcher({ vertexColors: true, castShadow: false });  // the siding's laps, the mortar, the joints: drawn but not inked (their outlines speckled)
  const lb = new Batcher({ castShadow: false });                       // the coach lamps' bulbs
  const gb = new Batcher({ castShadow: false });                       // the real glass
  const ib = new Batcher({ vertexColors: true });                      // the house's inside
  const il = new Batcher({ castShadow: false });                       // its lamps' shades and bulbs
  const glassBase = new THREE.MeshBasicMaterial({ color: GLASS_DAY, fog: true }); glassBase.name = 'joyce-glass-lit';
  const glassU = glassUniforms(), glassReal = realGlass(glassBase, glassU, 'joyce-glass-real');
  const darkGlass = '#4f6478';   // the bedroom wing's windows: dark panes in the outside's own batch (nobody's room to see)
  const G = P.garage, gd = G.door;
  const pane = (x0, y0, z0, x1, y1, z1) => bx(gb, x0, y0, z0, x1, y1, z1, glassReal);

  // ================================================================ footings, floors
  bx(b, minX - 0.02, gy - 0.06, BZ - 0.02, maxX + 0.02, gy + 0.125, FZ + 0.02, '#a7a297');   // the footing band (just proud of the walls)
  bx(b, G.in.minX - 0.02, gy, G.in.minZ - 0.02, G.in.maxX + 0.02, GY, G.in.maxZ + 0.02, CONCRETE);   // the garage's slab (its edges inside the walls)
  // the driveway, its joints, the front walk, the porch
  const D = P.drive;
  bx(b, D.minX, gy - 0.05, FZ + 0.03, D.maxX, D.y, D.maxZ, CONCRETE);
  for (let z = FZ + 2.4; z < D.maxZ - 1; z += 2.6) bx(sb, D.minX + 0.04, D.y, z - 0.02, D.maxX - 0.04, D.y + 0.005, z + 0.02, CONCRETE_D);
  bx(sb, (D.minX + D.maxX) / 2 - 0.02, D.y, FZ + 0.3, (D.minX + D.maxX) / 2 + 0.02, D.y + 0.005, D.maxZ - 0.3, CONCRETE_D);
  const W = P.walk;
  bx(b, W.minX, gy - 0.05, W.minZ, W.maxX, W.y, W.maxZ, CONCRETE);
  const po = P.porch, porchY = 0.47;
  bx(b, po.minX + 0.012, gy - 0.04, po.minZ - 0.05, po.maxX + 0.25, porchY, FZ + 0.55, CONCRETE);
  // the patio and its joints
  const pa = P.patio;
  bx(b, pa.minX, gy - 0.05, pa.minZ, pa.maxX, pa.y, pa.maxZ - 0.02, PATIO);
  for (const f of [1 / 3, 2 / 3]) {
    bx(sb, pa.minX + (pa.maxX - pa.minX) * f - 0.015, pa.y, pa.minZ + 0.05, pa.minX + (pa.maxX - pa.minX) * f + 0.015, pa.y + 0.004, pa.maxZ - 0.07, '#b3ac9e');
    bx(sb, pa.minX + 0.05, pa.y, pa.minZ + (pa.maxZ - pa.minZ) * f - 0.015, pa.maxX - 0.05, pa.y + 0.004, pa.minZ + (pa.maxZ - pa.minZ) * f + 0.015, '#b3ac9e');
  }

  // ================================================================ the garage: its walls (siding outside, drywall inside)
  const hTop = GY + gd.h;
  // the front: either side of the big door and over it
  bx(b, minX, gy + 0.1, FZ - T, gd.x0, EY, FZ, SIDING);
  bx(b, gd.x1, gy + 0.1, FZ - T, GX, EY, FZ, SIDING);
  bx(b, gd.x0, hTop, FZ - T, gd.x1, EY, FZ, SIDING);
  lap(sb, 'x', FZ, 1, minX, GX, gy + 0.1, EY, [[gd.x0, gd.x1, gy, hTop]]);
  // the door's white casing
  bx(b, gd.x0 - 0.13, gy + 0.1, FZ, gd.x0 - 0.01, hTop + 0.13, FZ + 0.04, TRIM);
  bx(b, gd.x1 + 0.01, gy + 0.1, FZ, gd.x1 + 0.13, hTop + 0.13, FZ + 0.04, TRIM);
  bx(b, gd.x0 - 0.01, hTop + 0.01, FZ, gd.x1 + 0.01, hTop + 0.13, FZ + 0.04, TRIM);
  // the west wall (the garage and the bedroom wing) with the side door
  const sd = G.side;
  bx(b, minX, gy + 0.1, BZ + T, minX + T, EY, sd.z0, SIDING);
  bx(b, minX, gy + 0.1, sd.z1, minX + T, EY, FZ - T, SIDING);
  bx(b, minX, GY + sd.h, sd.z0, minX + T, EY, sd.z1, SIDING);
  lap(sb, 'z', minX, -1, BZ, FZ, gy + 0.1, EY, [[sd.z0, sd.z1, gy, GY + sd.h], [-74.9, -73.9, FY + 0.9, FY + 2.0]]);
  for (const [z0, z1] of [[sd.z0 - 0.1, sd.z0 - 0.01], [sd.z1 + 0.01, sd.z1 + 0.1]]) bx(b, minX - 0.03, gy + 0.1, z0, minX, GY + sd.h + 0.1, z1, TRIM);
  bx(b, minX - 0.03, GY + sd.h + 0.01, sd.z0 - 0.01, minX, GY + sd.h + 0.1, sd.z1 + 0.01, TRIM);
  bx(b, minX - 0.5, gy - 0.02, sd.z0 - 0.15, minX - 0.02, GY - 0.02, sd.z1 + 0.15, CONCRETE);   // the step outside the side door
  // a small window in the west wall of the bedroom wing
  bx(b, minX - 0.02, FY + 0.9, -74.9, minX + 0.03, FY + 2.0, -73.9, darkGlass);
  for (const [z0, z1, y0, y1] of [[-75.0, -74.9, FY + 0.8, FY + 2.1], [-73.9, -73.8, FY + 0.8, FY + 2.1], [-74.9, -73.9, FY + 2.0, FY + 2.1], [-74.9, -73.9, FY + 0.8, FY + 0.9]]) bx(b, minX - 0.04, y0, z0, minX + 0.0, y1, z1, TRIM);
  // the garage's back wall (the bedroom wing behind it) and its wall to the house (the inner door)
  bx(b, minX + T, gy + 0.1, G.minZ - 0.075, GX - T / 2, EY, G.minZ + 0.075, DRYWALL);
  const ind = G.inner;
  bx(b, GX - T / 2, gy + 0.1, BZ + T, GX + T / 2, EY, ind.z0, DRYWALL);
  bx(b, GX - T / 2, gy + 0.1, ind.z1, GX + T / 2, EY, FZ - T, DRYWALL);
  bx(b, GX - T / 2, GY + ind.h, ind.z0, GX + T / 2, EY, ind.z1, DRYWALL);
  bx(b, GX - 0.6, gy, ind.z0 - 0.1, GX - T / 2, GY + 0.06, ind.z1 + 0.1, CONCRETE_D);   // a step up to the inner door
  // the garage's inside: drywall on the outer walls' inner faces, a ceiling
  bx(b, minX + T, gy + 0.1, FZ - T - 0.012, gd.x0, EY - 0.3, FZ - T, DRYWALL);
  bx(b, gd.x1, gy + 0.1, FZ - T - 0.012, GX - T / 2, EY - 0.3, FZ - T, DRYWALL);
  bx(b, minX + T, gy + 0.1, G.minZ + 0.075, minX + T + 0.012, EY - 0.3, sd.z0, DRYWALL);
  bx(b, minX + T, gy + 0.1, sd.z1, minX + T + 0.012, EY - 0.3, FZ - T - 0.012, DRYWALL);
  bx(b, minX + T, GY + 2.75, G.minZ + 0.075, GX - T / 2, GY + 2.8, FZ - T, '#f2efe8');
  // the door's tracks and the opener
  for (const x of [gd.x0 + 0.05, gd.x1 - 0.05]) bx(b, x - 0.03, hTop + 0.05, FZ - T - 2.6, x + 0.03, hTop + 0.12, FZ - T - 0.02, '#7a7d84');
  bx(b, (gd.x0 + gd.x1) / 2 - 0.02, GY + 2.62, FZ - T - 3.2, (gd.x0 + gd.x1) / 2 + 0.02, GY + 2.66, FZ - T - 0.3, '#7a7d84');
  bx(b, (gd.x0 + gd.x1) / 2 - 0.22, GY + 2.5, FZ - T - 3.6, (gd.x0 + gd.x1) / 2 + 0.22, GY + 2.72, FZ - T - 3.1, '#d9d9d9');
  // the batten light on the ceiling (a fixture: joyce-house.js switches its night spot)
  const glx = (minX + GX) / 2 - 1.0, glz = -69.0;
  bx(b, glx - 0.6, GY + 2.72, glz - 0.06, glx + 0.6, GY + 2.75, glz + 0.06, '#d9d9d9');
  lb.add(GEO.box, lampGlow(LAMP_GARAGE), { x: glx, y: GY + 2.69, z: glz, sx: 1.1, sy: 0.05, sz: 0.08 });
  addNightSpot({ x: glx, y: GY + 2.6, z: glz, color: '#fff2d0', pool: 2.6, gy: GY + 0.01, halo: 0 });
  // shelves along the west wall with boxes and paint, a workbench on the back wall with a pegboard, garden tools, a bike, a bag
  {
    const sx0 = minX + T + 0.02, sx1 = sx0 + 0.55;
    for (const z0 of [-71.9, -70.2]) {
      for (const [a, c] of [[0, 0], [0, 1], [1, 0], [1, 1]]) bx(b, sx0 + a * 0.5, GY, z0 + c * 1.35, sx0 + a * 0.5 + 0.04, GY + 1.9, z0 + c * 1.35 + 0.04, '#6b7078');
      for (const y of [0.35, 0.9, 1.45, 1.88]) bx(b, sx0 + 0.005, GY + y, z0 + 0.006, sx1, GY + y + 0.03, z0 + 1.384, '#8a8f98');
      for (let i = 0; i < 6; i++) {
        const lv = [0.38, 0.93, 1.48][i % 3], zz = z0 + 0.12 + Math.floor(i / 3) * 0.66;
        const col = ['#c69a5e', '#b98a5a', '#d4ae74', '#3f6fa8', '#c0392b', '#7ddc7a'][(i + (z0 > -71 ? 2 : 0)) % 6];
        if (i % 2) for (let k = 0; k < 3; k++) b.add(GEO.cyl12, col, { x: sx0 + 0.15 + k * 0.14, y: GY + lv + 0.1, z: zz + 0.2, sx: 0.06, sy: 0.18, sz: 0.06 });
        else bx(b, sx0 + 0.05, GY + lv + 0.005, zz, sx0 + 0.48, GY + lv + 0.3, zz + 0.5, col);
      }
    }
    // the workbench on the back wall, west bay
    const wz = G.minZ + 0.075;
    bx(b, minX + T + 0.75, GY + 0.86, wz, minX + T + 2.65, GY + 0.92, wz + 0.62, WOOD);
    for (const x of [minX + T + 0.8, minX + T + 2.55]) for (const z of [wz + 0.05, wz + 0.52]) bx(b, x, GY, z, x + 0.06, GY + 0.86, z + 0.06, WOOD_D);
    bx(b, minX + T + 0.8, GY + 0.25, wz + 0.05, minX + T + 2.6, GY + 0.28, wz + 0.58, WOOD_D);
    bx(b, minX + T + 0.75, GY + 1.1, wz + 0.012, minX + T + 2.65, GY + 1.95, wz + 0.03, '#c9a876');   // the pegboard
    for (let i = 0; i < 7; i++) b.add(GEO.box, ['#c0392b', '#2b2340', '#e0b54a', '#5d636b'][i % 4], { x: minX + T + 0.95 + i * 0.25, y: GY + 1.45 + (i % 2) * 0.2, z: wz + 0.06, sx: 0.05, sy: 0.24 + (i % 3) * 0.06, sz: 0.04, rz: (i % 3 - 1) * 0.3 });
    b.add(GEO.box, '#c0392b', { x: minX + T + 1.25, y: GY + 1.03, z: wz + 0.3, sx: 0.4, sy: 0.2, sz: 0.2 });   // a toolbox
    b.add(GEO.cyl12, '#3fa06a', { x: minX + T + 2.2, y: GY + 1.05, z: wz + 0.32, sx: 0.12, sy: 0.24, sz: 0.12 });   // a watering can
    // garden tools on the back wall's east half (a rake, a spade, a hoe), a bag of potting soil, the recycling bins
    for (let i = 0; i < 3; i++) {
      const x = minX + T + 3.0 + i * 0.32;
      b.add(GEO.cyl6, '#c9a26b', { x, y: GY + 0.85, z: wz + 0.08, sx: 0.022, sy: 1.5, sz: 0.022, rz: 0.08 });
      b.add(GEO.box, '#6b6f78', { x: x + 0.06, y: GY + 0.12, z: wz + 0.08, sx: i === 1 ? 0.2 : 0.3, sy: i === 1 ? 0.26 : 0.05, sz: 0.04 });
    }
    b.add(GEO.box, '#5a7a3a', { x: minX + T + 4.3, y: GY + 0.22, z: wz + 0.3, sx: 0.55, sy: 0.42, sz: 0.32, ry: 0.2 });
    for (const [i, col] of [[0, '#2f5da8'], [1, '#3f8a3f']]) { bx(b, minX + T + 0.72 + i * 0.68 - 0.3, GY, FZ - T - 0.9, minX + T + 0.72 + i * 0.68 + 0.3, GY + 0.95, FZ - T - 0.3, col); bx(b, minX + T + 0.72 + i * 0.68 - 0.32, GY + 0.95, FZ - T - 0.92, minX + T + 0.72 + i * 0.68 + 0.32, GY + 1.0, FZ - T - 0.28, '#2b2b30'); }
    // a bike leaning on the west wall by the side door
    const bz = -68.6, bxx = minX + T + 0.35;
    for (const dz of [-0.5, 0.5]) b.add(new THREE.TorusGeometry(0.3, 0.025, 6, 16), '#2b2b30', { x: bxx, y: GY + 0.32, z: bz + dz, ry: Math.PI / 2 });
    b.add(GEO.cyl6, '#e0463c', { x: bxx + 0.004, y: GY + 0.55, z: bz, sx: 0.025, sy: 0.95, sz: 0.025, rx: Math.PI / 2 - 0.25 });
    b.add(GEO.cyl6, '#e0463c', { x: bxx - 0.004, y: GY + 0.45, z: bz - 0.2, sx: 0.025, sy: 0.55, sz: 0.025, rx: 0.5 });
    b.add(GEO.box, '#2b2b30', { x: bxx, y: GY + 0.8, z: bz - 0.32, sx: 0.08, sy: 0.04, sz: 0.2 });
    b.add(GEO.box, '#e8e4dc', { x: bxx, y: GY + 0.86, z: bz + 0.42, sx: 0.45, sy: 0.03, sz: 0.03 });
  }

  // ================================================================ the house's east half
  const po0 = po.minZ, B = '#5a3b33';
  // the brick front east of the porch, with the living room's window
  const win = P.window;
  bx(b, po.maxX, gy + 0.1, FZ - T, win.x0, EY, FZ, BRICK);
  bx(b, win.x1, gy + 0.1, FZ - T, maxX, EY, FZ, BRICK);
  bx(b, win.x0, gy + 0.1, FZ - T, win.x1, win.y0, FZ, BRICK);
  bx(b, win.x0, win.y1, FZ - T, win.x1, EY, FZ, BRICK);
  lap(sb, 'x', FZ, 1, po.maxX, maxX, gy + 0.1, EY - 0.05, [[win.x0 - 0.42, win.x1 + 0.42, win.y0 - 0.12, win.y1 + 0.1]], MORTAR, 0.17);
  // the porch: its back wall with the front door, the porch ceiling, a brick pilaster at the garage's corner, brick on the
  // garage wall's porch side
  const fd = P.frontDoor;
  bx(b, GX + T / 2, gy + 0.1, po0 - T, fd.x0, EY, po0, BRICK);
  bx(b, fd.x1, gy + 0.1, po0 - T, po.maxX, EY, po0, BRICK);
  bx(b, fd.x0, FY + fd.h, po0 - T, fd.x1, EY, po0, BRICK);
  bx(b, po.maxX - 0.012, gy + 0.1, po0 - T, po.maxX + T, EY, FZ - T + 0.01, BRICK);   // the porch's east side (the living room's wall) (texture-sweep: its end 1 cm into the front wall: level with it, the floor slab's edge fought it under the floor)
  bx(b, GX + T / 2, gy + 0.1, po0, GX + T / 2 + 0.03, EY - 0.12, FZ - 0.25, BRICK);
  bx(b, GX + 0.01, gy - 0.02, FZ - 0.28, GX + 0.34, EY - 0.002, FZ + 0.06, BRICK);
  bx(b, GX + T / 2 + 0.03, EY - 0.14, po0, po.maxX - 0.013, EY - 0.02, FZ - 0.02, '#f2efe8');
  lap(sb, 'z', GX + T / 2 + 0.03, 1, po0, FZ - 0.28, gy + 0.1, EY - 0.16, [], MORTAR, 0.17);
  lap(sb, 'z', po.maxX - 0.012, -1, po0, FZ - T, gy + 0.1, EY - 0.16, [], MORTAR, 0.17);
  // the front door's casing (the door itself is a leaf), a doormat, the third coach lamp beside it
  for (const [x0, x1] of [[fd.x0 - 0.1, fd.x0 - 0.005], [fd.x1 + 0.005, fd.x1 + 0.1]]) bx(b, x0, porchY, po0, x1, FY + fd.h + 0.1, po0 + 0.03, TRIM);
  bx(b, fd.x0 - 0.1, FY + fd.h + 0.005, po0, fd.x1 + 0.1, FY + fd.h + 0.1, po0 + 0.03, TRIM);
  bx(b, fd.x0 + 0.05, porchY, po0 + 0.15, fd.x1 - 0.05, porchY + 0.015, po0 + 0.75, '#7a5a3a');
  // the window: white frame, sill, muntins (the pane is real glass), dark shutters
  bx(b, win.x0 - 0.1, win.y0 - 0.1, FZ, win.x0 - 0.005, win.y1 + 0.1, FZ + 0.035, TRIM);
  bx(b, win.x1 + 0.005, win.y0 - 0.1, FZ, win.x1 + 0.1, win.y1 + 0.1, FZ + 0.035, TRIM);
  bx(b, win.x0 - 0.005, win.y1 + 0.005, FZ, win.x1 + 0.005, win.y1 + 0.1, FZ + 0.035, TRIM);
  bx(b, win.x0 - 0.18, win.y0 - 0.14, FZ - 0.02, win.x1 + 0.18, win.y0 - 0.005, FZ + 0.09, TRIM);
  for (const k of [1 / 3, 2 / 3]) bx(b, win.x0 + (win.x1 - win.x0) * k - 0.02, win.y0 + 0.005, FZ - T / 2 + 0.012, win.x0 + (win.x1 - win.x0) * k + 0.02, win.y1 - 0.005, FZ - T / 2 + 0.04, TRIM);
  bx(b, win.x0 + 0.005, (win.y0 + win.y1) / 2 - 0.02, FZ - T / 2 + 0.012, win.x1 - 0.005, (win.y0 + win.y1) / 2 + 0.02, FZ - T / 2 + 0.04, TRIM);
  pane(win.x0, win.y0, FZ - T / 2 - 0.005, win.x1, win.y1, FZ - T / 2 + 0.005);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? win.x0 - 0.52 : win.x1 + 0.12, x1 = s < 0 ? win.x0 - 0.12 : win.x1 + 0.52;
    bx(b, x0, win.y0 - 0.05, FZ + 0.012, x1, win.y1 + 0.05, FZ + 0.05, SHUTTER);
    for (let y = win.y0 + 0.08; y < win.y1 - 0.02; y += 0.11) bx(b, x0 + 0.04, y, FZ + 0.05, x1 - 0.04, y + 0.03, FZ + 0.065, '#3c4848');
  }
  // the east wall (siding), the back wall with the wide opening into the sun room and the bedroom wing's windows
  bx(b, maxX - T, gy + 0.1, BZ + T, maxX, EY, FZ - T, SIDING);
  lap(sb, 'z', maxX, 1, BZ, FZ, gy + 0.1, EY);
  const bo = P.backOpen;
  bx(b, minX, gy + 0.1, BZ, bo.x0, EY, BZ + T, SIDING);
  bx(b, bo.x1, gy + 0.1, BZ, maxX, EY, BZ + T, SIDING);
  bx(b, bo.x0, FY + bo.h, BZ, bo.x1, EY, BZ + T, SIDING);
  bx(b, bo.x0, gy + 0.1, BZ, bo.x1, FY - 0.01, BZ + T, SIDING);
  const bw = [[-51.6, -50.5], [-49.4, -48.3]];
  lap(sb, 'x', BZ, -1, minX, P.sun.minX, gy + 0.1, EY, bw.map(([a, c]) => [a, c, FY + 0.9, FY + 2.0]));
  for (const [a, c] of bw) {
    bx(b, a, FY + 0.9, BZ - 0.02, c, FY + 2.0, BZ + 0.03, darkGlass);
    for (const [x0, x1, y0, y1] of [[a - 0.1, a, FY + 0.8, FY + 2.1], [c, c + 0.1, FY + 0.8, FY + 2.1], [a, c, FY + 2.0, FY + 2.1], [a - 0.15, c + 0.15, FY + 0.76, FY + 0.9]]) bx(b, x0, y0, BZ - 0.045, x1, y1, BZ, TRIM);
    bx(b, (a + c) / 2 - 0.018, FY + 0.9, BZ - 0.04, (a + c) / 2 + 0.018, FY + 2.0, BZ - 0.02, TRIM);
  }
  // white corner boards (the sun room has its own corner)
  bx(b, minX - 0.03, gy + 0.13, FZ - 0.09, minX + 0.09, EY - 0.004, FZ + 0.03, TRIM);
  bx(b, maxX - 0.09, gy + 0.13, FZ - 0.09, maxX + 0.03, EY - 0.004, FZ + 0.03, TRIM);
  bx(b, minX - 0.03, gy + 0.13, BZ - 0.03, minX + 0.09, EY - 0.004, BZ + 0.09, TRIM);

  // ================================================================ the roof: the main gable (ridge along x), the front gable over the garage
  const R = P.roof, rz = R.ridgeZ, half = (FZ - BZ) / 2, slope = Math.atan2(R.rise, half);
  const ov = R.over, run = half + ov, len = Math.hypot(run, run * Math.tan(slope)), th = 0.16;
  for (const side of [1, -1]) {
    const zc = rz + side * run / 2, yc = EY + R.rise - run / 2 * Math.tan(slope) + th / 2 / Math.cos(slope);
    b.add(GEO.box, ROOF, { x: (minX + maxX) / 2, y: yc, z: zc, sx: maxX - minX + 2 * ov, sy: th, sz: len, rx: side * slope });
    // the fascia and the gutter along the eave (white)
    const ez = rz + side * run, ey = EY - ov * Math.tan(slope);
    bx(b, minX - ov + 0.01, ey - 0.16, ez - (side > 0 ? 0.06 : -0.06) - 0.03, maxX + ov - 0.01, ey + 0.02, ez + (side > 0 ? 0.03 : -0.03), TRIM);
    bx(b, minX - ov + 0.02, ey - 0.15, ez + side * 0.04, maxX + ov - 0.02, ey - 0.02, ez + side * 0.15, TRIM);
  }
  b.add(GEO.box, ROOF_D, { x: (minX + maxX) / 2, y: EY + R.rise + th * 0.9, z: rz, sx: maxX - minX + 2 * ov + 0.02, sy: 0.12, sz: 0.36 });
  // the gable ends (siding), the rake trim along their slopes
  for (const [x, dir] of [[minX, -1], [maxX, 1]]) {
    gable(b, 'z', x, dir, BZ, FZ, rz, EY, EY + R.rise - 0.02, SIDING, 0.1, sb);
    for (const s of [-1, 1]) {
      const z0 = rz, z1 = rz + s * run, y0 = EY + R.rise + 0.02, y1 = EY - ov * Math.tan(slope) + 0.02;
      b.add(GEO.box, TRIM, { x: x + dir * (ov - 0.02), y: (y0 + y1) / 2 + 0.02, z: (z0 + z1) / 2, sx: 0.05, sy: 0.16, sz: Math.hypot(z1 - z0, y1 - y0) - 0.02, rx: s * slope });
    }
  }
  // the front gable over the garage: two slopes down to the west and east, its triangle of siding over the garage door, a vent
  const gxm = R.gx, gHalf = (GX - minX) / 2, gs = Math.atan2(R.grise, gHalf), gov = R.gover, grun = gHalf + gov;
  const glen = Math.hypot(grun, grun * Math.tan(gs)), gz0 = FZ + 0.45, gz1 = rz + 0.2;
  for (const side of [-1, 1]) {
    const xc = gxm + side * grun / 2, yc = EY + R.grise - grun / 2 * Math.tan(gs) + th / 2 / Math.cos(gs);
    b.add(GEO.box, ROOF, { x: xc, y: yc, z: (gz0 + gz1) / 2, sx: glen, sy: th, sz: gz0 - gz1, rz: -side * gs });
    const ex = gxm + side * grun, ey = EY - gov * Math.tan(gs);
    bx(b, ex - side * 0.02, ey - 0.15, FZ + 0.1, ex + side * 0.12, ey - 0.02, gz0 - 0.02, TRIM);   // the gutter down its side
  }
  b.add(GEO.box, ROOF_D, { x: gxm, y: EY + R.grise + th * 0.9, z: (gz0 + gz1) / 2, sx: 0.36, sy: 0.12, sz: gz0 - gz1 + 0.02 });
  gable(b, 'x', FZ + 0.12, 1, minX, GX, gxm, EY, EY + R.grise - 0.02, SIDING, 0.12, sb);
  for (const s of [-1, 1]) {   // the rake boards along its front
    const x0 = gxm, x1 = gxm + s * grun, y0 = EY + R.grise + 0.02, y1 = EY - gov * Math.tan(gs) + 0.02;
    b.add(GEO.box, TRIM, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 0.02, z: gz0 - 0.03, sx: Math.hypot(x1 - x0, y1 - y0) - 0.02, sy: 0.16, sz: 0.05, rz: -s * gs });
  }
  bx(b, gxm - 0.32, EY + R.grise * 0.42, FZ + 0.12, gxm + 0.32, EY + R.grise * 0.42 + 0.42, FZ + 0.16, TRIM);   // the gable vent
  for (let k = 0; k < 4; k++) bx(b, gxm - 0.26, EY + R.grise * 0.42 + 0.06 + k * 0.09, FZ + 0.16, gxm + 0.26, EY + R.grise * 0.42 + 0.1 + k * 0.09, FZ + 0.18, '#d8d4c8');
  // downspouts at the front corners
  for (const x of [minX - 0.08, maxX + 0.08]) bx(b, x - 0.05, gy + 0.05, FZ + 0.02, x + 0.05, EY - 0.18, FZ + 0.12, TRIM);

  // ================================================================ the sun room (glass on three sides over a knee wall)
  const S = P.sun, kn = FY + S.knee, top = FY + S.top, dr = S.door;
  const knee = (x0, z0, x1, z1) => bx(b, x0, gy - 0.02, z0, x1, kn, z1, TRIM);
  knee(S.minX, S.minZ, S.maxX, S.minZ + 0.12);                    // the north side
  knee(S.maxX - 0.12, S.minZ + 0.12, S.maxX, S.maxZ);            // the east
  knee(S.minX, S.minZ + 0.12, S.minX + 0.12, dr.z0);             // the west, either side of the door
  knee(S.minX, dr.z1, S.minX + 0.12, S.maxZ);
  bx(b, S.minX - 0.6, gy - 0.02, dr.z0 - 0.2, S.minX - 0.012, pa.y + 0.02, dr.z1 + 0.2, CONCRETE);   // the step down to the patio (on its corner)
  // posts and the header round the top
  const postsN = xs => xs.forEach(([x, z]) => bx(b, x - 0.05, kn - 0.02, z - 0.05, x + 0.05, top + 0.02, z + 0.05, TRIM));
  const nx = 6, ez = 3;
  const north = [], east = [], west = [];
  for (let i = 0; i <= nx; i++) north.push([S.minX + 0.06 + (S.maxX - S.minX - 0.12) * i / nx, S.minZ + 0.06]);
  for (let i = 1; i <= ez; i++) east.push([S.maxX - 0.06, S.minZ + 0.06 + (S.maxZ - S.minZ - 0.06) * i / ez]);
  west.push([S.minX + 0.06, dr.z0 - 0.06], [S.minX + 0.06, dr.z1 + 0.06], [S.minX + 0.06, S.maxZ - 0.06]);
  postsN([...north, ...east, ...west]);
  bx(b, S.minX, top, S.minZ, S.maxX, top + 0.14, S.minZ + 0.12, TRIM);
  bx(b, S.maxX - 0.12, top, S.minZ + 0.12, S.maxX, top + 0.14, S.maxZ, TRIM);
  bx(b, S.minX, top, S.minZ + 0.12, S.minX + 0.12, top + 0.14, S.maxZ, TRIM);
  bx(b, S.minX + 0.01, kn, dr.z0, S.minX + 0.11, top, dr.z0 + 0.04, TRIM);   // the door's jambs
  bx(b, S.minX + 0.01, kn, dr.z1 - 0.04, S.minX + 0.11, top, dr.z1, TRIM);
  // the glass between the posts (real glass) and the door's glass over its leaf
  for (let i = 0; i < nx; i++) pane(north[i][0] + 0.05, kn + 0.005, S.minZ + 0.05, north[i + 1][0] - 0.05, top - 0.005, S.minZ + 0.07);
  const eastAll = [[S.maxX - 0.06, S.minZ + 0.06], ...east];
  for (let i = 0; i < eastAll.length - 1; i++) pane(S.maxX - 0.07, kn + 0.005, eastAll[i][1] + 0.05, S.maxX - 0.05, top - 0.005, eastAll[i + 1][1] - 0.05);
  pane(S.minX + 0.05, kn + 0.005, S.minZ + 0.11, S.minX + 0.07, top - 0.005, dr.z0 - 0.11);
  pane(S.minX + 0.05, kn + 0.005, dr.z1 + 0.11, S.minX + 0.07, top - 0.005, S.maxZ - 0.11);
  // the roof: a low slope of pale panels from under the house's eave out over the glass, a white fascia and gutter
  const sr0 = top + 0.15, sr1 = top + 0.04, srz = S.minZ - 0.25, srl = Math.hypot(S.maxZ - srz, sr0 - sr1), sra = Math.atan2(sr0 - sr1, S.maxZ - srz);
  b.add(GEO.box, '#e4e0d6', { x: (S.minX + S.maxX) / 2, y: (sr0 + sr1) / 2 + 0.05, z: (S.maxZ + srz) / 2, sx: S.maxX - S.minX + 0.4, sy: 0.08, sz: srl, rx: -sra });
  for (let i = 1; i < 6; i++) b.add(GEO.box, '#cfcac0', { x: S.minX - 0.2 + (S.maxX - S.minX + 0.4) * i / 6, y: (sr0 + sr1) / 2 + 0.1, z: (S.maxZ + srz) / 2, sx: 0.05, sy: 0.03, sz: srl - 0.04, rx: -sra });
  bx(b, S.minX - 0.2, sr1 - 0.1, srz - 0.12, S.maxX + 0.2, sr1 + 0.05, srz, TRIM);

  // ================================================================ the coach lamps
  coachLamp(b, lb, gd.x0 - 0.42, GY + 1.95, FZ + 0.14, 0, 1);
  coachLamp(b, lb, gd.x1 + 0.42, GY + 1.95, FZ + 0.14, 0, 1);
  coachLamp(b, lb, fd.x1 + 0.32, FY + 1.85, po0 + 0.14, 0, 1);

  // ================================================================ the firepit and its four chairs
  const pit = P.pit;
  b.add(GEO.cyl12, '#8d8680', { x: pit.x, y: pa.y + pit.h / 2, z: pit.z, sx: pit.r, sy: pit.h, sz: pit.r });
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.add(GEO.box, '#7a746e', { x: pit.x + Math.cos(a) * (pit.r + 0.004), y: pa.y + 0.14 + (k % 2) * 0.13, z: pit.z + Math.sin(a) * (pit.r + 0.004), sx: 0.02, sy: 0.03, sz: 0.26, ry: -a }); }
  b.add(new THREE.TorusGeometry(pit.r - 0.03, 0.06, 6, 20), '#c4beb4', { x: pit.x, y: pa.y + pit.h + 0.01, z: pit.z, rx: Math.PI / 2 });
  b.add(GEO.cyl12, '#2a2a30', { x: pit.x, y: pa.y + pit.h - 0.03, z: pit.z, sx: pit.r - 0.08, sy: 0.04, sz: pit.r - 0.08 });
  for (let k = 0; k < 26; k++) {   // fire glass and lava rocks in the bowl
    const a = k * 2.399, r = 0.05 + (k % 7) * 0.055;
    b.add(GEO.ico0, k % 3 ? '#2f6f8a' : '#3a3438', { x: pit.x + Math.cos(a) * r, y: pa.y + pit.h - 0.005, z: pit.z + Math.sin(a) * r, sx: 0.04, sy: 0.025, sz: 0.04, ry: a });
  }
  b.add(new THREE.TorusGeometry(0.3, 0.012, 4, 20), '#6b6f78', { x: pit.x, y: pa.y + pit.h + 0.003, z: pit.z, rx: Math.PI / 2 });   // the burner ring
  const chairCols = ['#ff8fca', '#4fb8c9', '#f2c94c', '#7ddc7a'];
  for (const c of P.chairs) adirondack(b, c.x, c.y, c.z, c.yaw, chairCols[c.i]);
  // a small side table between two chairs with mugs (the cocoa)
  b.add(GEO.cyl12, WOOD, { x: pit.x - 1.55, y: pa.y + 0.25, z: pit.z, sx: 0.22, sy: 0.04, sz: 0.22 });
  b.add(GEO.cyl8, WOOD_D, { x: pit.x - 1.55, y: pa.y + 0.12, z: pit.z, sx: 0.03, sy: 0.24, sz: 0.03 });
  for (const [dx, col] of [[-0.07, '#e0463c'], [0.08, '#f3efe6']]) b.add(GEO.cyl8, col, { x: pit.x - 1.55 + dx, y: pa.y + 0.32, z: pit.z + 0.02, sx: 0.04, sy: 0.09, sz: 0.04 });

  // ================================================================ the fence, its gate (standing open), the bushes along the back
  const F = P.fence, fh = F.h, gate = F.gate;
  for (let i = 1; i < F.pts.length; i++) {
    const [ax, az] = F.pts[i - 1], [cx, cz] = F.pts[i], L = Math.hypot(cx - ax, cz - az), ux = (cx - ax) / L, uz = (cz - az) / L;
    const inGate = (x, z) => Math.abs(z - gate.z) < 0.05 && x > gate.x0 - 0.04 && x < gate.x1 + 0.04;
    for (let d = 0.06; d < L - 0.04; d += 0.13) { const x = ax + ux * d, z = az + uz * d; if (inGate(x, z)) continue; b.add(GEO.box, IRON, { x, y: gy + fh / 2, z, sx: ux ? 0.022 : 0.022, sy: fh, sz: 0.022 }); b.add(GEO.cone6, IRON, { x, y: gy + fh + 0.04, z, sx: 0.022, sy: 0.08, sz: 0.022 }); }
    for (const y of [0.12, fh - 0.12]) {
      const segs = [];
      if (Math.abs(az - gate.z) < 0.05 && Math.abs(cz - gate.z) < 0.05) { const lo = Math.min(ax, cx), hi = Math.max(ax, cx); segs.push([lo, gate.x0], [gate.x1, hi]); }
      else segs.push(null);
      for (const sg of segs) {
        if (!sg) { b.add(GEO.box, IRON, { x: (ax + cx) / 2, y: gy + y, z: (az + cz) / 2, sx: ux ? L : 0.03, sy: 0.035, sz: uz ? L : 0.03 }); continue; }
        if (sg[1] - sg[0] < 0.05) continue;
        b.add(GEO.box, IRON, { x: (sg[0] + sg[1]) / 2, y: gy + y, z: az, sx: sg[1] - sg[0], sy: 0.035, sz: 0.03 });
      }
    }
    for (let d = 0; d <= L + 0.01; d += Math.max(1.2, L / Math.max(1, Math.round(L / 2.4)))) { const x = ax + ux * d, z = az + uz * d; b.add(GEO.box, IRON, { x, y: gy + fh / 2 + 0.05, z, sx: 0.06, sy: fh + 0.1, sz: 0.06 }); b.add(GEO.sphere, IRON, { x, y: gy + fh + 0.14, z, sx: 0.05, sy: 0.05, sz: 0.05 }); }
    // colliders (the gate's opening left out)
    if (Math.abs(az - gate.z) < 0.05 && Math.abs(cz - gate.z) < 0.05) {
      const lo = Math.min(ax, cx), hi = Math.max(ax, cx);
      for (const [p, q] of [[lo, gate.x0], [gate.x1, hi]]) if (q - p > 0.05) colliders.push({ type: 'box', minX: p, maxX: q, minZ: az - 0.06, maxZ: az + 0.06, joyceFence: true, fence: 'joyce' });
    } else colliders.push({ type: 'box', minX: Math.min(ax, cx) - 0.06, maxX: Math.max(ax, cx) + 0.06, minZ: Math.min(az, cz) - 0.06, maxZ: Math.max(az, cz) + 0.06, joyceFence: true, fence: 'joyce' });
  }
  // the gate's posts and its leaf, standing open into the yard
  for (const x of [gate.x0 - 0.03, gate.x1 + 0.03]) b.add(GEO.box, IRON, { x, y: gy + fh / 2 + 0.08, z: gate.z, sx: 0.08, sy: fh + 0.16, sz: 0.08 });
  {
    const hx = gate.x1 - 0.02, a = -1.25, gl = gate.x1 - gate.x0 - 0.06, ux = -Math.cos(a), uz = Math.sin(a);
    for (let d = 0.08; d < gl; d += 0.13) b.add(GEO.box, IRON, { x: hx + ux * d, y: gy + fh / 2 + 0.03, z: gate.z + uz * d, sx: 0.022, sy: fh - 0.08, sz: 0.022 });
    for (const y of [0.16, fh - 0.08]) b.add(GEO.box, IRON, { x: hx + ux * gl / 2, y: gy + y, z: gate.z + uz * gl / 2, sx: gl, sy: 0.035, sz: 0.03, ry: a });
  }
  const bushCols = ['#3f8a3f', '#4a9a45', '#367a3a'];
  for (let x = F.pts[1][0] + 0.9, i = 0; x < F.pts[3][0] - 0.6; x += 1.25, i++) b.add(GEO.ico1, bushCols[i % 3], { x, y: gy + 0.5 + (i % 2) * 0.08, z: -89.2 + (i % 2) * 0.12, sx: 0.72 + (i % 3) * 0.1, sy: 0.62 + (i % 2) * 0.12, sz: 0.55, ry: i });
  for (let z = -87.5, i = 0; z < -75.5; z += 1.6, i++) b.add(GEO.ico1, bushCols[(i + 1) % 3], { x: F.pts[1][0] + 0.55, y: gy + 0.45, z, sx: 0.5, sy: 0.55, sz: 0.6, ry: i });
  // out front: a tall arborvitae by the garage's corner (the photo), round shrubs, two along the brick under the window
  b.add(GEO.cone8, '#2f6b35', { x: minX - 0.7, y: gy + 1.25, z: FZ + 0.85, sx: 0.55, sy: 2.5, sz: 0.55 });
  b.add(GEO.cyl6, '#5a4030', { x: minX - 0.7, y: gy + 0.1, z: FZ + 0.85, sx: 0.08, sy: 0.2, sz: 0.08 });
  for (const [x, z, s] of [[minX - 0.55, FZ + 2.3, 0.55], [minX - 0.6, FZ + 3.4, 0.45], [maxX - 0.45, FZ + 0.75, 0.5], [GX + 1.95, FZ + 0.5, 0.36]]) b.add(GEO.ico1, '#3f8a3f', { x, y: gy + s * 0.75, z, sx: s, sy: s * 0.85, sz: s });
  // a hose reel on the east wall, an AC unit by the bedroom wing
  b.add(GEO.cyl12, '#3f8a3f', { x: maxX + 0.25, y: gy + 0.45, z: -72.0, sx: 0.28, sy: 0.12, sz: 0.28, rz: Math.PI / 2 });
  bx(b, minX - 0.9, gy - 0.02, -74.2, minX - 0.15, gy + 0.65, -73.4, '#9aa0a8');
  colliders.push({ type: 'box', minX: minX - 0.92, maxX: minX - 0.13, minZ: -74.22, maxZ: -73.38 });

  // ================================================================ colliders: the garage's walls (the side door open), the house and sun room solid
  const po1 = po.minZ, cols = { door: null };
  // (house: true, like our house's walls: the crowd and Molly's resting spots don't push anyone out of them (people are inside),
  // a voice through them is muffled, the camera cuts no holes)
  const box = (x0, x1, z0, z1, o = {}) => { const c = { type: 'box', minX: x0, maxX: x1, minZ: z0, maxZ: z1, joyceHouse: true, house: true, ...o }; colliders.push(c); return c; };
  box(minX - 0.04, minX + T, G.minZ - 0.1, sd.z0);                    // the west wall, either side of the side door
  box(minX - 0.04, minX + T, sd.z1, FZ + 0.04);
  box(minX - 0.04, gd.x0, FZ - T, FZ + 0.06);                         // the front, either side of the big door
  box(gd.x1, GX + 0.34, FZ - T, FZ + 0.06);
  cols.door = box(gd.x0, gd.x1, FZ - T - 0.04, FZ + 0.02, { garageDoor: true });
  box(minX - 0.04, GX + T / 2, BZ - 0.04, G.minZ + 0.075);           // the bedroom wing (the garage's back wall)
  box(GX - T / 2, maxX + 0.04, BZ - 0.04, po1);                       // the house behind the porch (the inner door shut for players)
  box(GX - T / 2, GX + T / 2 + 0.03, po1, FZ - T);                    // the garage's wall along the porch
  box(po.maxX - 0.012, maxX + 0.04, po1, FZ + 0.06);                  // the living room's front
  box(S.minX - 0.04, maxX + 0.04, S.minZ - 0.04, BZ);                // the sun room
  colliders.push({ type: 'circle', x: pit.x, z: pit.z, r: pit.r + 0.08, joyceHouse: true, noCrowd: true });   // (noCrowd: her girlfriends sit in these)
  for (const c of P.chairs) colliders.push({ type: 'circle', x: c.x, z: c.z, r: 0.36, joyceHouse: true, noCrowd: true });
  colliders.push({ type: 'circle', x: minX - 0.7, z: FZ + 0.85, r: 0.45, joyceHouse: true });   // the arborvitae

  // ================================================================ the house's inside (seen through the window and the sun room)
  buildInside(ib, il, P);

  // ================================================================ the meshes
  const outs = b.build(group, 'joyce-house');
  outs.forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  lb.build(group, 'joyce-house-lamps');
  sb.build(group, 'joyce-house-laps').forEach(m => { m.receiveShadow = true; soft(m); });
  const glassGroup = new THREE.Group(); glassGroup.name = 'joyce-house-glass'; group.add(glassGroup);
  const glassMeshes = gb.build(glassGroup, 'joyce-house-glass');
  glassMeshes.forEach(m => { m.castShadow = false; m.receiveShadow = false; });
  const inside = new THREE.Group(); inside.name = 'joyce-house-inside'; group.add(inside);
  ib.build(inside, 'joyce-house-inside').forEach(m => { m.castShadow = false; m.receiveShadow = true; });
  il.build(inside, 'joyce-house-inside-lamps');
  // the garage door: one rigid panel, its top edge at the pivot (joyce-house.js moves it up and over)
  const gdb = new Batcher({ vertexColors: true }), garageDoor = new THREE.Group(); garageDoor.name = 'joyce-garage-door';
  {
    const w = gd.x1 - gd.x0 - 0.02, h = gd.h - 0.01;
    bx(gdb, -w / 2, -h, -0.05, w / 2, 0, 0, CREAM);
    for (let k = 1; k < 4; k++) for (const z of [0.0, -0.05]) bx(gdb, -w / 2 + 0.01, -h * k / 4 - 0.015, z === 0 ? -0.004 : -0.054, w / 2 - 0.01, -h * k / 4 + 0.015, z === 0 ? 0.006 : -0.046, CREAM_D);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {   // the raised panels on the outside
      const x0 = -w / 2 + 0.12 + c * (w - 0.24) / 8, x1 = x0 + (w - 0.24) / 8 - 0.08, y0 = -h * (r + 1) / 4 + 0.1, y1 = -h * r / 4 - 0.1;
      bx(gdb, x0, y0, -0.002, x1, y1, 0.012, '#f4ecd2');
    }
    bx(gdb, -0.12, -h + 0.25, 0.0, 0.12, -h + 0.29, 0.03, '#9a9a9a');   // the handle
  }
  gdb.build(garageDoor, 'joyce-garage-door').forEach(m => { m.castShadow = false; m.receiveShadow = true; });   // (flush in its wall: no shadow pass)
  garageDoor.position.set((gd.x0 + gd.x1) / 2, hTop, FZ - T + 0.07);
  group.add(garageDoor);
  // the door leaves (instanced): the front door (dark), the garage's side door, the inner door, the sun room's door
  const leafMesh = leafGeometry();
  const doors = new THREE.InstancedMesh(leafMesh.geometry, leafMesh.material, 4);
  doors.name = 'joyce-house-doors'; doors.castShadow = false; doors.receiveShadow = true; doors.userData.noMerge = true;
  const doorSpecs = [
    { id: 'front', x: fd.x0 + 0.005, y: FY, z: po0 - T / 2, yaw: 0, open: 1.35, col: '#2f3a3c', w: fd.x1 - fd.x0 - 0.01 },
    { id: 'side', x: minX + T / 2, y: GY, z: sd.z1 - 0.005, yaw: Math.PI / 2, open: -1.4, col: '#f4f1e8', w: sd.z1 - sd.z0 - 0.01 },
    { id: 'inner', x: GX, y: GY + 0.06, z: ind.z0 + 0.005, yaw: -Math.PI / 2, open: 1.35, col: '#f4f1e8', w: ind.z1 - ind.z0 - 0.01 },
    { id: 'sun', x: S.minX + 0.06, y: FY, z: dr.z0 + 0.045, yaw: -Math.PI / 2, open: 1.35, col: '#f6f3ea', w: dr.z1 - dr.z0 - 0.09 },
  ];
  const col = new THREE.Color();
  doorSpecs.forEach((d, i) => doors.setColorAt(i, col.set(d.col)));
  group.add(doors);
  return {
    group, inside, glassGroup, glassMeshes, glassReal, glassBase, glassU, garageDoor, doors, doorSpecs, leafMesh, doorCollider: cols.door,
    garageLight: { x: glx, y: GY + 2.6, z: glz },
  };
}

// an Adirondack chair, its seat's front middle at (x, z) facing yaw (Three.js: forward = (sin yaw, cos yaw))
function adirondack(b, x, y, z, yaw, col) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * (lz + 0.18), z - s * lx + c * (lz + 0.18)];   // (the origin: the seat's middle, where a sitter sits)
  const add = (geo, lx, ly, lz, o) => { const [wx, wz] = at(lx, lz); b.add(geo, col, { x: wx, y: y + ly, z: wz, ...o, ry: yaw + (o.ry || 0) }); };
  // the seat slats tilted back, the back fanning up, the wide arms, the legs
  for (let k = 0; k < 5; k++) add(GEO.box, -0.22 + k * 0.11, 0.28, -0.18, { sx: 0.09, sy: 0.03, sz: 0.5, rx: 0.12 }); // (seat-height: everything from the seat up 0.12 lower, the legs shorter)
  for (let k = 0; k < 5; k++) add(GEO.box, -0.2 + k * 0.1, 0.66, -0.5, { sx: 0.085, sy: 0.75, sz: 0.03, rx: 0.32, rz: (k - 2) * 0.05 });
  add(GEO.box, 0, 0.43, -0.46, { sx: 0.6, sy: 0.05, sz: 0.04, rx: 0.32 });
  for (const sd of [-1, 1]) {
    add(GEO.box, sd * 0.34, 0.5, -0.2, { sx: 0.14, sy: 0.03, sz: 0.68 });
    add(GEO.box, sd * 0.3, 0.245, 0.06, { sx: 0.05, sy: 0.49, sz: 0.06 });
    add(GEO.box, sd * 0.3, 0.145, -0.48, { sx: 0.05, sy: 0.29, sz: 0.06 });
    add(GEO.box, sd * 0.29, 0.24, -0.2, { sx: 0.04, sy: 0.06, sz: 0.62, rx: 0.12 });
  }
}

// ---------------------------------------------------------------- the inside: floors, walls, the furniture, its lamps
function buildInside(b, il, P) {
  const { GX, T, FY, FZ, BZ, maxX, EY } = P, x0 = GX + T / 2, x1 = maxX - T, cy = FY + 2.6;
  const LAMP = lampGlow(LAMP_IN);
  // floors: wood in the living and dining rooms, tile in the kitchen and the sun room; the ceiling
  bx(b, x0, FY - 0.05, -70.2, x1, FY, FZ - T, '#c99a68');
  bx(b, x0, FY - 0.05, -72.9, x1, FY, -70.2, TILE);
  bx(b, x0, FY - 0.05, BZ + T, x1, FY, -72.9, '#c99a68');
  bx(b, P.sun.minX + 0.12, FY - 0.05, P.sun.minZ + 0.12, P.sun.maxX - 0.12, FY, BZ, '#d8cdb8');
  bx(b, P.backOpen.x0, FY - 0.05, BZ, P.backOpen.x1, FY - 0.002, BZ + T, '#c99a68');
  bx(b, x0, cy, BZ + T, x1, cy + 0.04, FZ - T, '#f7f3ea');
  bx(b, P.sun.minX + 0.12, FY + P.sun.top + 0.141, P.sun.minZ + 0.12, P.sun.maxX - 0.12, FY + P.sun.top + 0.16, BZ, '#f7f3ea');
  // the walls' insides (warm cream), clear of the floor and the ceiling
  const wall = (ax0, az0, ax1, az1) => bx(b, ax0, FY + 0.002, az0, ax1, cy - 0.002, az1, PAINT);
  wall(x0, BZ + T, x0 + 0.012, P.hall.z0); wall(x0, P.hall.z1, x0 + 0.012, P.garage.inner.z0); wall(x0, P.garage.inner.z1, x0 + 0.012, P.porch.minZ - T);
  wall(x1 - 0.012, BZ + T, x1, FZ - T);
  wall(P.porch.maxX + T, FZ - T - 0.012, P.window.x0, FZ - T); wall(P.window.x1, FZ - T - 0.012, x1, FZ - T);
  bx(b, P.window.x0, FY + 0.002, FZ - T - 0.012, P.window.x1, P.window.y0, FZ - T, PAINT); bx(b, P.window.x0, P.window.y1, FZ - T - 0.012, P.window.x1, cy - 0.002, FZ - T, PAINT);
  wall(x0, P.porch.minZ - T - 0.012, P.frontDoor.x0, P.porch.minZ - T); wall(P.frontDoor.x1, P.porch.minZ - T - 0.012, P.porch.maxX + T, P.porch.minZ - T);
  wall(P.porch.maxX + T, P.porch.minZ - T, P.porch.maxX + T + 0.012, FZ - T - 0.012);
  wall(x0, BZ + T, P.backOpen.x0, BZ + T + 0.012); wall(P.backOpen.x1, BZ + T, x1, BZ + T + 0.012);
  // the hall door (shut) and a picture or two
  bx(b, x0 + 0.012, FY, P.hall.z0 + 0.02, x0 + 0.05, FY + 2.03, P.hall.z1 - 0.02, '#f4f1e8');
  b.add(GEO.sphere, '#c9a24a', { x: x0 + 0.07, y: FY + 1.0, z: P.hall.z0 + 0.12, sx: 0.035, sy: 0.035, sz: 0.035 });
  for (const [z, c] of [[-74.6, '#7fb8d8'], [-68.9, '#f0a58a']]) { bx(b, x1 - 0.04, FY + 1.35, z - 0.35, x1 - 0.012, FY + 1.9, z + 0.35, '#8f6a45'); bx(b, x1 - 0.05, FY + 1.4, z - 0.3, x1 - 0.04, FY + 1.85, z + 0.3, c); }
  // ---- the living room: the couch along the east wall, the armchair, a coffee table on a rug, the TV, the floor lamp
  couch(b, P.couch.x, FY, P.couch.z, P.couch.yaw, P.couch.len);
  const A = P.armchair, ac = Math.cos(A.yaw), as = Math.sin(A.yaw), aat = (lx, lz) => [A.x + ac * lx + as * lz, A.z - as * lx + ac * lz];
  { const [x, z] = aat(0, -0.05); b.add(GEO.box, '#c86f4a', { x, y: FY + 0.15, z, sx: 0.78, sy: 0.3, sz: 0.74, ry: A.yaw }); } // (seat-height: the seat 0.3 up, was 0.44)
  { const [x, z] = aat(0, -0.34); b.add(GEO.box, '#c86f4a', { x, y: FY + 0.48, z, sx: 0.78, sy: 0.5, sz: 0.18, ry: A.yaw }); }
  for (const s of [-1, 1]) { const [x, z] = aat(s * 0.35, -0.05); b.add(GEO.box, '#b35f3c', { x, y: FY + 0.42, z, sx: 0.12, sy: 0.24, sz: 0.74, ry: A.yaw }); }
  bx(b, GX + 2.0, FY + 0.001, -69.0, GX + 4.9, FY + 0.012, -66.9, '#c0504d');                // the rug
  bx(b, GX + 2.9, FY + 0.28, -68.45, GX + 4.1, FY + 0.33, -67.75, WOOD);                     // the coffee table (seat-height: 0.33, was 0.43)
  for (const [a, c] of [[2.95, -68.4], [4.0, -68.4], [2.95, -67.85], [4.0, -67.85]]) bx(b, GX + a, FY + 0.012, c, GX + a + 0.05, FY + 0.28, c + 0.05, WOOD_D);
  b.add(GEO.cyl12, '#f3efe6', { x: GX + 3.3, y: FY + 0.37, z: -68.1, sx: 0.06, sy: 0.08, sz: 0.06 });
  const tv = P.tv;   // the TV on its console against the east wall
  bx(b, x1 - 0.45, FY, tv.z - 0.7, x1 - 0.012, FY + 0.6, tv.z + 0.7, WOOD_D);
  bx(b, x1 - 0.16, FY + 0.62, tv.z - 0.55, x1 - 0.1, FY + 1.3, tv.z + 0.55, '#202024');
  bx(b, x1 - 0.165, FY + 0.66, tv.z - 0.5, x1 - 0.16, FY + 1.26, tv.z + 0.5, '#3a4a5c');
  bx(b, x1 - 0.3, FY + 0.6, tv.z - 0.12, x1 - 0.15, FY + 0.63, tv.z + 0.12, '#202024');
  const L = P.lamp;
  b.add(GEO.cyl8, '#3a3a40', { x: L.x, y: FY + 0.02, z: L.z, sx: 0.16, sy: 0.04, sz: 0.16 });
  b.add(GEO.cyl6, '#3a3a40', { x: L.x, y: FY + 0.8, z: L.z, sx: 0.02, sy: 1.56, sz: 0.02 });
  il.add(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 12), LAMP, { x: L.x, y: FY + 1.65, z: L.z });
  addNightSpot({ x: L.x, y: FY + 1.62, z: L.z, color: '#ffd59a', pool: 2.2, gy: FY + 0.01, halo: 0, joyceIn: true });
  // a plant in the corner by the front door
  b.add(GEO.cyl8, '#c86f4a', { x: P.porch.maxX + T + 0.3, y: FY + 0.18, z: -67.75, sx: 0.18, sy: 0.36, sz: 0.18 });
  b.add(GEO.ico1, '#3f8a3f', { x: P.porch.maxX + T + 0.3, y: FY + 0.65, z: -67.75, sx: 0.3, sy: 0.4, sz: 0.3 });
  // ---- the kitchen: the counters (the sink on the west wall, the stove on the north side), the fridge, the island with stools
  const cab = (r, top = '#e9e3d6') => { bx(b, r.minX, FY, r.minZ, r.maxX, FY + 0.86, r.maxZ, '#7a9a7a'); bx(b, r.minX - 0.005, FY + 0.86, r.minZ - 0.02, r.maxX + 0.02, FY + 0.92, r.maxZ + 0.02, top); };
  cab({ ...P.counter, minX: P.counter.minX + 0.012 }); cab(P.counter2); cab(P.island, '#d8c9a8');
  bx(b, P.counter.minX + 0.15, FY + 0.9, -72.5, P.counter.maxX - 0.12, FY + 0.925, -71.95, '#b8c0c8');            // the sink
  b.add(GEO.cyl6, '#b8c0c8', { x: P.counter.minX + 0.1, y: FY + 1.05, z: -72.22, sx: 0.02, sy: 0.3, sz: 0.02 });
  for (const [a, c] of [[0.25, 0.15], [0.6, 0.15], [0.25, 0.42], [0.6, 0.42]]) b.add(GEO.cyl12, '#2a2a30', { x: P.counter2.minX + 0.35 + a, y: FY + 0.925, z: P.counter2.minZ + c, sx: 0.09, sy: 0.01, sz: 0.09 });
  b.add(GEO.cyl12, '#c0392b', { x: P.counter2.minX + 0.6, y: FY + 1.0, z: P.counter2.minZ + 0.15, sx: 0.12, sy: 0.14, sz: 0.12 });   // a red pot on the stove
  bx(b, x0 + 0.012, FY + 1.45, -72.9, x0 + 0.38, FY + 2.2, -71.6, '#7a9a7a');                      // the cupboards over the sink
  bx(b, P.counter2.minX, FY + 1.45, -72.9 + 0.012, P.counter2.maxX, FY + 2.2, -72.55, '#7a9a7a');
  bx(b, P.fridge.minX + 0.012, FY, P.fridge.minZ, P.fridge.maxX, FY + 1.85, P.fridge.maxZ, '#e8e8ec');
  bx(b, P.fridge.maxX, FY + 0.95, P.fridge.minZ + 0.08, P.fridge.maxX + 0.02, FY + 1.7, P.fridge.minZ + 0.11, '#9a9a9a');
  for (const x of [P.island.minX + 0.4, P.island.maxX - 0.4]) { b.add(GEO.cyl8, '#8f6a45', { x, y: FY + 0.65, z: P.island.maxZ + 0.35, sx: 0.17, sy: 0.05, sz: 0.17 }); b.add(GEO.cyl6, '#3a3a40', { x, y: FY + 0.32, z: P.island.maxZ + 0.35, sx: 0.03, sy: 0.64, sz: 0.03 }); }
  b.add(GEO.sphere, '#e8483c', { x: (P.island.minX + P.island.maxX) / 2, y: FY + 0.98, z: -71.4, sx: 0.07, sy: 0.07, sz: 0.07 });   // a bowl of apples
  for (let k = 0; k < 3; k++) b.add(GEO.sphere, k % 2 ? '#7ddc7a' : '#e8483c', { x: (P.island.minX + P.island.maxX) / 2 + (k - 1) * 0.09, y: FY + 1.0, z: -71.32, sx: 0.05, sy: 0.05, sz: 0.05 });
  for (const x of [P.island.minX + 0.45, P.island.maxX - 0.45]) {   // the pendants over the island (one light: the middle)
    b.add(GEO.cyl6, '#3a3a40', { x, y: cy - 0.25, z: -71.42, sx: 0.008, sy: 0.5, sz: 0.008 });
    il.add(new THREE.CylinderGeometry(0.06, 0.15, 0.16, 12), LAMP, { x, y: cy - 0.56, z: -71.42 });
  }
  addNightSpot({ x: (P.island.minX + P.island.maxX) / 2 - 0.45 + 0.45, y: cy - 0.6, z: -71.42, color: '#ffe0a8', pool: 2.0, gy: FY + 0.01, halo: 0, joyceIn: true, spread: 0.5 });
  // ---- the dining room: the round table, four chairs, a pendant, a hutch
  const TB = P.table;
  b.add(GEO.cyl12, WOOD, { x: TB.x, y: FY + 0.57, z: TB.z, sx: TB.r, sy: 0.05, sz: TB.r }); // (seat-height: the top 0.595 with the chairs at 0.3, was 0.765)
  b.add(GEO.cyl8, WOOD_D, { x: TB.x, y: FY + 0.285, z: TB.z, sx: 0.08, sy: 0.55, sz: 0.08 });
  b.add(GEO.cyl8, WOOD_D, { x: TB.x, y: FY + 0.03, z: TB.z, sx: 0.32, sy: 0.05, sz: 0.32 });
  b.add(GEO.cyl8, '#ffd34d', { x: TB.x + 0.15, y: FY + 0.65, z: TB.z - 0.1, sx: 0.08, sy: 0.12, sz: 0.08 });   // a vase of flowers
  for (let k = 0; k < 4; k++) b.add(GEO.sphere, ['#ff6fae', '#b46fd8', '#f2f2f8', '#ff9fcb'][k], { x: TB.x + 0.15 + Math.cos(k * 1.6) * 0.06, y: FY + 0.77, z: TB.z - 0.1 + Math.sin(k * 1.6) * 0.06, sx: 0.05, sy: 0.04, sz: 0.05 });
  for (const s of P.dineSeats) diningChair(b, s.x, FY, s.z, s.yaw);
  b.add(GEO.cyl6, '#3a3a40', { x: TB.x, y: cy - 0.3, z: TB.z, sx: 0.008, sy: 0.6, sz: 0.008 });
  il.add(new THREE.CylinderGeometry(0.1, 0.26, 0.2, 14), LAMP, { x: TB.x, y: cy - 0.68, z: TB.z });
  addNightSpot({ x: TB.x, y: cy - 0.72, z: TB.z, color: '#ffdca0', pool: 2.2, gy: FY + 0.01, halo: 0, joyceIn: true });
  bx(b, x1 - 0.45, FY, -75.2, x1 - 0.012, FY + 1.8, -73.8, WOOD_D);                                 // the hutch
  for (let k = 0; k < 4; k++) b.add(GEO.cyl12, ['#7fb8d8', '#f3efe6', '#ff8fca', '#f3efe6'][k], { x: x1 - 0.3, y: FY + 1.35, z: -75.0 + k * 0.33, sx: 0.12, sy: 0.02, sz: 0.12, rz: Math.PI / 2 });
  // ---- the sun room: wicker chairs, the loveseat, the rocker, a coffee table with the tea things, plants, Molly's bed, a lamp
  const ST = P.sunTable, sY = FY;
  b.add(GEO.cyl12, '#e9e0c9', { x: ST.x, y: sY + 0.42, z: ST.z, sx: ST.r, sy: 0.04, sz: ST.r });
  for (let k = 0; k < 3; k++) { const a = k * 2.094; b.add(GEO.cyl6, '#c9a26b', { x: ST.x + Math.cos(a) * ST.r * 0.7, y: sY + 0.2, z: ST.z + Math.sin(a) * ST.r * 0.7, sx: 0.025, sy: 0.4, sz: 0.025 }); }
  b.add(GEO.sphere, '#f3efe6', { x: ST.x, y: sY + 0.52, z: ST.z, sx: 0.1, sy: 0.08, sz: 0.1 });    // the teapot
  b.add(GEO.cyl6, '#f3efe6', { x: ST.x + 0.12, y: sY + 0.54, z: ST.z, sx: 0.015, sy: 0.08, sz: 0.015, rz: -0.8 });
  for (let k = 0; k < 4; k++) b.add(GEO.cyl8, ['#ff8fca', '#7fb8d8', '#f2c94c', '#7ddc7a'][k], { x: ST.x + Math.cos(k * 1.57 + 0.6) * 0.27, y: sY + 0.48, z: ST.z + Math.sin(k * 1.57 + 0.6) * 0.27, sx: 0.035, sy: 0.07, sz: 0.035 });
  b.add(GEO.cyl12, '#f4d9a8', { x: ST.x - 0.15, y: sY + 0.46, z: ST.z + 0.18, sx: 0.09, sy: 0.04, sz: 0.09 });   // the lemon cake
  for (const s of P.sunSeats) {
    if (s.kind === 'love') continue;
    if (s.kind === 'rocker') rocker(b, s.x, sY, s.z, s.yaw); else wicker(b, s.x, sY, s.z, s.yaw);
  }
  { const a = P.sunSeats[1], c = P.sunSeats[2], mx = (a.x + c.x) / 2, mz = a.z;   // the loveseat (seats 1 and 2), facing south
    bx(b, mx - 1.1, sY, mz - 0.42, mx + 1.1, sY + 0.22, mz + 0.38, '#c9a26b'); // (seat-height: the cushions' top 0.3, was 0.5)
    bx(b, mx - 1.1, sY + 0.22, mz - 0.42, mx + 1.1, sY + 0.62, mz - 0.26, '#c9a26b');
    for (const s of [-1, 1]) bx(b, mx + s * 1.11 - (s > 0 ? 0.15 : 0), sY + 0.22, mz - 0.43, mx + s * 1.11 + (s < 0 ? 0.15 : 0), sY + 0.44, mz + 0.38, '#b48a55');   // (texture-sweep: the arms 1 cm proud of the back and the sides)
    for (const s of [-1, 1]) bx(b, mx + s * 0.48 - 0.46, sY + 0.22, mz - 0.24, mx + s * 0.48 + 0.46, sY + 0.3, mz + 0.34, '#7fb8a8');
  }
  const DB = P.dogBed;
  b.add(GEO.cyl12, '#b46fd8', { x: DB.x, y: sY + 0.06, z: DB.z, sx: DB.r, sy: 0.12, sz: DB.r });
  b.add(new THREE.TorusGeometry(DB.r - 0.06, 0.08, 6, 16), '#9a5ac0', { x: DB.x, y: sY + 0.13, z: DB.z, rx: Math.PI / 2 });
  for (const [x, z, s] of [[P.sun.minX + 0.4, P.sun.minZ + 0.4, 0.42], [P.sun.maxX - 0.42, P.sun.maxZ - 0.5, 0.36], [P.sun.minX + 0.38, P.sun.maxZ - 0.4, 0.3]]) {
    b.add(GEO.cyl8, '#c86f4a', { x, y: sY + 0.17, z, sx: 0.2, sy: 0.34, sz: 0.2 });
    b.add(GEO.ico1, '#3f8a3f', { x, y: sY + 0.42 + s * 0.6, z, sx: s, sy: s * 1.3, sz: s });
  }
  // the lamp on a side table by Joyce's chair
  const J0 = P.sunSeats[0], lx = J0.x + 0.75, lz = J0.z - 0.55;
  b.add(GEO.cyl8, WOOD, { x: lx, y: sY + 0.55, z: lz, sx: 0.2, sy: 0.04, sz: 0.2 });
  b.add(GEO.cyl6, WOOD_D, { x: lx, y: sY + 0.27, z: lz, sx: 0.03, sy: 0.54, sz: 0.03 });
  b.add(GEO.cyl8, '#d8c9a8', { x: lx, y: sY + 0.7, z: lz, sx: 0.06, sy: 0.26, sz: 0.06 });
  il.add(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 12), LAMP, { x: lx, y: sY + 0.92, z: lz });
  addNightSpot({ x: lx, y: sY + 0.92, z: lz, color: '#ffd59a', pool: 2.0, gy: FY + 0.01, halo: 0, joyceIn: true });
  void EY;
}
// the couch: its seat's middle at (x, z), facing yaw
function couch(b, x, y, z, yaw, len) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz], hl = len / 2;
  const add = (col, lx, ly, lz, sx, sy, sz) => { const [wx, wz] = at(lx, lz); b.add(GEO.box, col, { x: wx, y: y + ly, z: wz, sx, sy, sz, ry: yaw }); };
  // (seat-height: the cushions' top 0.32, a sitter 0.3; was 0.52 / 0.5)
  add('#6f8fb5', 0, 0.11, -0.1, len, 0.22, 0.84);
  add('#6f8fb5', 0, 0.46, -0.42, len, 0.48, 0.2);
  for (const sd of [-1, 1]) add('#5f7fa5', sd * (hl - 0.08), 0.33, -0.11, 0.2, 0.22, 0.86);   // (texture-sweep: the arms wrap the back and the base by 1 cm; level with them, their faces fought)
  for (const sd of [-1, 1]) add('#86a4c6', sd * 0.45, 0.27, -0.02, 0.84, 0.1, 0.58);
  add('#ff8fca', -0.62, 0.48, -0.27, 0.32, 0.32, 0.12);   // a pink cushion
  add('#2a6cb1', hl - 0.2, 0.27, -0.05, 0.4, 0.04, 0.5);  // the afghan over the arm
}
function diningChair(b, x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const add = (geo, col, lx, ly, lz, o) => { const [wx, wz] = at(lx, lz); b.add(geo, col, { x: wx, y: y + ly, z: wz, ...o, ry: yaw }); };
  add(GEO.box, '#a87a4a', 0, 0.28, -0.05, { sx: 0.42, sy: 0.04, sz: 0.4 }); // (seat-height: the seat's top 0.3, was 0.47)
  add(GEO.box, '#a87a4a', 0, 0.58, -0.24, { sx: 0.42, sy: 0.6, sz: 0.04 });
  for (const [a, d] of [[-0.18, 0.12], [0.18, 0.12], [-0.18, -0.22], [0.18, -0.22]]) add(GEO.box, '#8f6a45', a, 0.13, d, { sx: 0.04, sy: 0.26, sz: 0.04 });
}
function wicker(b, x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const add = (geo, col, lx, ly, lz, o) => { const [wx, wz] = at(lx, lz); b.add(geo, col, { x: wx, y: y + ly, z: wz, ...o, ry: yaw + (o.ry || 0) }); };
  add(GEO.cyl12, '#c9a26b', 0, 0.11, -0.05, { sx: 0.36, sy: 0.22, sz: 0.34 }); // (seat-height: the cushion's top 0.3, was 0.48)
  add(GEO.box, '#e8a0b8', 0, 0.26, -0.04, { sx: 0.58, sy: 0.08, sz: 0.5 });
  add(GEO.box, '#c9a26b', 0, 0.6, -0.36, { sx: 0.7, sy: 0.75, sz: 0.08, rx: 0.15 });
  for (const sd of [-1, 1]) add(GEO.box, '#b48a55', sd * 0.34, 0.4, -0.08, { sx: 0.08, sy: 0.22, sz: 0.56 });
}
function rocker(b, x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const add = (geo, col, lx, ly, lz, o) => { const [wx, wz] = at(lx, lz); b.add(geo, col, { x: wx, y: y + ly, z: wz, ...o, ry: yaw + (o.ry || 0) }); };
  add(GEO.box, WOOD, 0, 0.24, -0.05, { sx: 0.5, sy: 0.05, sz: 0.46 }); // (seat-height: the cushion's top 0.3, was 0.5)
  add(GEO.box, WOOD, 0, 0.65, -0.3, { sx: 0.5, sy: 0.8, sz: 0.05, rx: 0.15 });
  for (const sd of [-1, 1]) {
    add(GEO.box, WOOD_D, sd * 0.24, 0.05, -0.05, { sx: 0.04, sy: 0.05, sz: 0.85, rx: 0.0 });
    add(GEO.box, WOOD_D, sd * 0.22, 0.15, 0.12, { sx: 0.04, sy: 0.2, sz: 0.04 });   // (texture-sweep: the uprights 1 cm inside the seat's edge: level with it, their faces fought)
    add(GEO.box, WOOD_D, sd * 0.22, 0.15, -0.22, { sx: 0.04, sy: 0.2, sz: 0.04 });
    add(GEO.box, WOOD, sd * 0.26, 0.44, -0.06, { sx: 0.06, sy: 0.04, sz: 0.5 });
  }
  add(GEO.box, '#f2c94c', 0, 0.28, -0.05, { sx: 0.44, sy: 0.05, sz: 0.4 });
}
