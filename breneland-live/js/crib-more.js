// Kevin's Tool Crib, round 2 (crib-more): more of a klepto handyman's shop wherever it fits, and the motorcycle corner lit.
// Andrew (2026-11-07): "Kevin's shop, including additional clutter." Everything here is merged into tool-crib-build.js's inside
// batch (drawn only near or inside, as crib-clutter's): no new draw call. The one new light is the shop light over Kevin's
// motorcycle: its tubes are in the shop's bulbs (`crib-bulbs`) and its night spot is one of the shop's lamps, so it is on with
// the shop's lights and off with them (tool-crib.js setLights).
//
// Where things go (the shop floor is walked by Kevin, his customers and the players; they keep 0.3 m clear, crib-clutter-test):
//   the corner by the roll-up door   the shop light over the motorcycle, an air hose on the wall over the door's hood
//   behind the counter (north-east)  a dented filing cabinet, a drawer open, an old calendar over it, a toolbox spilling open
//   the bench (west wall)            a machinist's vise, sawdust and shavings under it, coffee cans of nails and a bucket of
//                                    screws on its shelf, a shop rag over its edge
//   under the spring table           a crate of mismatched hinges, a box of door knobs, a bucket of mixed screws, a can of nails
//   under the bargain table          two jerry cans, a cooler, a car battery
//   west of the paint cans           a wheelbarrow of scrap wood offcuts
//   on top of the shelves            the paint wall: an old desk fan, jars of washers, coffee cans, boxes; the east shelves: a
//                                    busted TV, a cooler, shoe boxes
//   the walls                        fishing rods on pegs (east), saw blades on nails (front, high), old license plates, a bike
//                                    wheel and a rail of bar clamps (west, over the stair)
//   the rafters                      two racks under the beams (window screens and lumber; chicken wire, planks, pipe), a garden
//                                    hose, an extension cord and a broken lawn chair on hooks
// Each piece is listed with its world box like crib-clutter's (`floor: true` stands on the shop floor; `overhead`, `wall`).
import * as THREE from 'three';
import { GEO } from './batch.js';
import { CRIB } from './tool-crib-plan.js';
import { COL, rng, framer, world, coffeeCan } from './crib-clutter.js';

const STEEL = '#b4b9be', IRON = '#3a3f47', GALV = '#a3a9ad', WOODS = ['#c9a26b', '#b98a5a', '#a8804f', '#d8b47a', '#8a6240', '#e0c48a'];
const RAGS = ['#c0392b', '#3f6fa8', '#b8574a', '#8a8f98', '#e0b54a', '#5d7a9a'];

// ---------------------------------------------------------------- small pieces (each in a framer frame `g`; sizes in metres)

// a shop rag folded over an edge: the edge along local x at the origin, the top toward +z, hanging down on -z
function rag(g, col, w = 0.16, d = 0.12, h = 0.16) {
  g.box(-w / 2, 0.001, 0, w / 2, 0.006, d, col);
  g(GEO.cyl6, col, { y: -0.004, z: -0.004, sx: 0.009, sy: w * 0.96, sz: 0.009, rz: Math.PI / 2 });
  g(GEO.box, col, { x: 0.01, y: -h / 2, z: -0.009, sx: w * 0.86, sy: h, sz: 0.004, rx: 0.12, rz: 0.06 });
  g(GEO.box, '#2b2b30', { x: -w * 0.18 + 0.01, y: -h / 2, z: -0.009, sx: w * 0.22, sy: h * 0.18, sz: 0.008, rx: 0.12, rz: 0.06 });   // (an oil stain, soaked through)
}
// a rag hung over a rod running along local z through the origin: two flaps either side
function ragOver(g, col, w = 0.14, h = 0.13) {
  for (const s of [-1, 1]) g(GEO.box, col, { x: s * 0.016, y: -h / 2 + 0.012, sx: 0.004, sy: h, sz: w, rz: -s * 0.28 });
  g(GEO.cyl6, col, { y: 0.012, sx: 0.016, sy: w * 0.98, sz: 0.016, rx: Math.PI / 2 });
}
// a jerry can, standing: x 0.17 wide, z 0.34 deep, 0.44 tall, the handles on top, the spout's cap at the front (-z)
function jerryCan(g, col) {
  g.box(-0.085, 0, -0.17, 0.085, 0.38, 0.17, col);
  g(GEO.box, col, { y: 0.38, sx: 0.15, sy: 0.04, sz: 0.3 });
  for (const s of [-1, 1]) { g(GEO.box, col, { x: s * 0.0875, y: 0.19, sx: 0.006, sy: 0.3, sz: 0.012, rx: 0.78 }); g(GEO.box, col, { x: s * 0.0875, y: 0.19, sx: 0.006, sy: 0.3, sz: 0.012, rx: -0.78 }); }   // the embossed X
  for (const dz of [-0.09, 0, 0.09]) g(GEO.box, col, { y: 0.43, z: dz, sx: 0.03, sy: 0.07, sz: 0.025 });
  g(GEO.box, col, { y: 0.465, z: 0, sx: 0.03, sy: 0.02, sz: 0.22 });
  g(GEO.cyl8, '#2b2b30', { y: 0.42, z: -0.135, sx: 0.025, sy: 0.05, sz: 0.025, rx: -0.5 });
}
// a coil of hose or cord hung on a hook: loops of radius R in the local x-y plane, hanging from the origin (the hook's bend)
function coilHung(g, col, R, tube, loops, seed) {
  const r2 = rng(seed);
  for (let k = 0; k < loops; k++) g(new THREE.TorusGeometry(R * (0.92 + r2() * 0.12), tube, 4, 14), col, { x: (r2() - 0.5) * 0.05, y: -R * 0.95 - r2() * 0.04, z: (k - loops / 2) * tube * 1.6, sy: 1.12 });
}
// a J hook screwed up into a beam at height `up`, its bend at (x, y, z)
function jHook(f, x, y, z, up) {
  f(GEO.cyl6, IRON, { x, y: (y + up) / 2, z, sx: 0.007, sy: up - y, sz: 0.007 });
  f(new THREE.TorusGeometry(0.03, 0.006, 3, 8, Math.PI), IRON, { x: x, y, z, rz: Math.PI });
}
// a jar of washers (opaque: the washers stacked to its shoulder, the glass's shoulder and the lid over them)
function washerJar(g, i) {
  const r = 0.048, h = 0.15;
  for (let k = 0; k < 6; k++) g(GEO.cyl12, k % 2 ? '#9aa3ad' : '#c8ccd2', { y: 0.012 + k * 0.02, sx: r - 0.004, sy: 0.02, sz: r - 0.004 });
  g(GEO.cyl12, '#d6e6e8', { y: h - 0.015, sx: r, sy: 0.03, sz: r });
  g(GEO.cyl12, ['#c0392b', '#3f6fa8', '#e0b54a', '#3f8a5a', '#c8ccd2'][i % 5], { y: h + 0.008, sx: r + 0.003, sy: 0.018, sz: r + 0.003 });
}

// ---------------------------------------------------------------- the round-2 clutter
// ib the inside batch, inside the inside group, colliders the shared list, lights { bulbs (the shop's Bulbs), spot(s) (adds a
// shop lamp) }. Returns the item list.
// nb (crib-clutter-2): the batcher for the pieces the Blender set piece remodelled (every piece here but the shop light, whose
// tubes and spot are the shop's): tool-crib-build.js's counting batcher when the model loaded, `ib` itself otherwise.
export function clutterMore(ib, inside, colliders, lights, nb = ib) {
  const P = CRIB, { fy, top, iMinX, iMaxX, iMinZ, iMaxZ, zP, zL, stair: ST, peg: Pg, table: Tt, counter: Ct, rollup: RU, paint: Pn, shelf: Sh } = P;
  const sk = 0.03, wallW = iMinX + sk, wallE = iMaxX - sk, wallN = iMinZ + sk, f = world(nb), fl = world(ib), items = [];
  const beams = []; for (let z = iMinZ + 1.4; z < iMaxZ - 0.5; z += 2.2) if (Math.abs(z - zL) > 0.4) beams.push(z);
  const beamB = top - 0.26;                                     // the beams' undersides
  const nearBeam = z => beams.reduce((a, q) => (Math.abs(q - z) < Math.abs(a - z) ? q : a), beams[0]);
  const box = (name, b, o = {}) => items.push({ name, box: b, ...o });

  // ---- the shop light over the motorcycle: a white enamel shop light on two chains from the ceiling, two warm tubes, a pull
  // chain, its orange cord up to an outlet box on the ceiling. Its tubes are the shop's bulbs; its spot one of the shop's lamps
  {
    const cx = iMaxX - 1.65, cz = RU.z1 - 0.4, y = fy + 2.55, L = 1.22, ceil = top - 0.06;
    fl.box(cx - L / 2, y + 0.1, cz - 0.1, cx + L / 2, y + 0.125, cz + 0.1, '#e9ece4');
    for (const s of [-1, 1]) fl(GEO.box, '#e9ece4', { x: cx, y: y + 0.048, z: cz + s * 0.124, sx: L, sy: 0.12, sz: 0.012, rx: -s * 0.45 });
    for (const s of [-1, 1]) fl.box(s < 0 ? cx - L / 2 - 0.012 : cx + L / 2, y + 0.005, cz - 0.11, s < 0 ? cx - L / 2 : cx + L / 2 + 0.012, y + 0.118, cz + 0.11, '#d8dbd2');
    fl.box(cx - L / 2 + 0.02, y + 0.086, cz - 0.09, cx + L / 2 - 0.02, y + 0.096, cz + 0.09, '#ffffff');   // (the white inside the shade)
    const tube = new THREE.CylinderGeometry(0.019, 0.019, L - 0.08, 8).rotateZ(Math.PI / 2);
    for (const dz of [-0.045, 0.045]) lights.bulbs.add(tube, '#fff6e2', { x: cx, y: y + 0.045, z: cz + dz });
    tube.dispose();
    for (const s of [-1, 1]) for (const dz of [-0.045, 0.045]) fl.box(cx + s * (L / 2 - 0.045) - 0.012, y + 0.03, cz + dz - 0.022, cx + s * (L / 2 - 0.045) + 0.012, y + 0.086, cz + dz + 0.022, '#5d636b');   // the sockets
    for (const s of [-1, 1]) {   // the chains: links down from a ceiling hook to an S hook on the shade
      const x = cx + s * 0.42, y0 = y + 0.125, n = Math.floor((ceil - y0) / 0.05);
      for (let k = 0; k < n; k++) fl(new THREE.TorusGeometry(0.014, 0.003, 3, 6), IRON, { x, y: y0 + 0.025 + k * (ceil - y0 - 0.02) / n, z: cz, sx: 0.7, ry: k % 2 ? Math.PI / 2 : 0 });
      fl(GEO.cyl8, IRON, { x, y: ceil - 0.01, z: cz, sx: 0.03, sy: 0.02, sz: 0.03 });
    }
    fl(GEO.cyl6, '#c9a23a', { x: cx + 0.3, y: y - 0.16, z: cz + 0.05, sx: 0.0025, sy: 0.32, sz: 0.0025 });   // the pull chain
    fl(GEO.sphere, '#c9a23a', { x: cx + 0.3, y: y - 0.325, z: cz + 0.05, sx: 0.012, sy: 0.016, sz: 0.012 });
    fl.rod([cx + L / 2 + 0.006, y + 0.06, cz], [cx + L / 2 + 0.2, y + 0.5, cz + 0.02], 0.008, '#f08a3c');   // the cord, up to an outlet box
    fl.rod([cx + L / 2 + 0.2, y + 0.5, cz + 0.02], [cx + L / 2 + 0.3, ceil - 0.06, cz + 0.02], 0.008, '#f08a3c');
    fl.box(cx + L / 2 + 0.24, ceil - 0.07, cz - 0.04, cx + L / 2 + 0.36, ceil - 0.002, cz + 0.08, '#8f969e');
    const S = { x: cx, y: y - 0.05, z: cz };
    lights.spot({ ...S, color: '#fff0d0', pool: 2.4, gy: fy, halo: 0 });
    box('shop-light', [cx - L / 2 - 0.02, y, cz - 0.14, cx + L / 2 + 0.36, ceil, cz + 0.14], { overhead: true, light: S });
  }

  // ---- an air hose coiled on a hook on the east wall, over the roll-up door's hood
  {
    const z = RU.z0 + 1.2, y = fy + 3.55, g = framer(nb, wallE - 0.05, y, z, Math.PI / 2);
    f(GEO.cyl6, IRON, { x: wallE - 0.04, y: y + 0.02, z, sx: 0.008, sy: 0.08, sz: 0.008, rz: Math.PI / 2 });
    coilHung(g, '#d8463a', 0.2, 0.011, 5, 3);
    f(GEO.cyl8, '#c9a23a', { x: wallE - 0.05, y: y - 0.62, z: z + 0.18, sx: 0.012, sy: 0.07, sz: 0.012 });
    f.rod([wallE - 0.05, y - 0.38, z + 0.17], [wallE - 0.05, y - 0.58, z + 0.18], 0.011, '#d8463a');
    box('air-hose', [wallE - 0.1, y - 0.66, z - 0.25, wallE, y + 0.05, z + 0.25], { wall: true });
  }

  // ---- behind the counter, the north-east corner: a dented olive filing cabinet with a drawer pulled out, files sticking up,
  // an old phone and papers on it; an old calendar over it; a red toolbox spilling open on the floor beside it
  {
    const x1 = wallE - 0.004, x0 = x1 - 0.58, z0 = iMinZ + 0.77, z1 = Ct.minZ - 0.01, H = 1.32, OL = '#7d8a74', OLd = '#66735f';
    f.box(x0 + 0.02, fy, z0 + 0.02, x1 - 0.02, fy + 0.025, z1 - 0.02, IRON);
    f.box(x0, fy + 0.025, z0, x1, fy + H, z1, OL);
    for (let i = 0; i < 4; i++) {
      const ya = fy + 0.04 + i * 0.32, yb = ya + 0.3, out = i === 2 ? 0.34 : 0, xf = x0 - out;
      f.box(xf - 0.014, ya, z0 + 0.022, xf, yb, z1 - 0.022, i === 3 ? OLd : OL);
      f.box(xf - 0.034, yb - 0.1, (z0 + z1) / 2 - 0.07, xf - 0.014, yb - 0.08, (z0 + z1) / 2 + 0.07, '#c8ccd2');
      f.box(xf - 0.02, yb - 0.065, (z0 + z1) / 2 - 0.05, xf - 0.014, yb - 0.025, (z0 + z1) / 2 + 0.05, '#f2ead6');
      if (out) {   // the open drawer: its sides, its floor, the hanging files
        for (const zz of [z0 + 0.035, z1 - 0.045]) f.box(xf, ya + 0.01, zz, x0 + 0.002, yb - 0.04, zz + 0.01, OLd);
        f.box(xf, ya + 0.01, z0 + 0.045, x0 + 0.002, ya + 0.02, z1 - 0.045, OLd);
        const R = rng(71);
        for (let k = 0; k < 8; k++) { const xx = xf + 0.03 + k * 0.038, hh = 0.2 + R() * 0.06; f(GEO.box, R() < 0.7 ? '#e8d2a0' : ['#c0392b', '#3f6fa8', '#7ddc7a'][k % 3], { x: xx, y: ya + 0.02 + hh / 2, z: (z0 + z1) / 2, sx: 0.006, sy: hh, sz: z1 - z0 - 0.12, rz: (R() - 0.5) * 0.25 }); }
      }
    }
    f.box(x0 + 0.12, fy + 0.62, z1 + 0.0005, x0 + 0.34, fy + 0.86, z1 + 0.004, OLd);   // a dent on its side (and a scrape)
    f(GEO.box, '#a8b0a0', { x: x0 + 0.26, y: fy + 0.98, z: z1 + 0.004, sx: 0.2, sy: 0.008, sz: 0.003, rz: 0.25 });
    // on top: a stack of papers, an old black phone, a mug
    f.box(x0 + 0.06, fy + H, z0 + 0.05, x0 + 0.3, fy + H + 0.07, z0 + 0.26, '#f2ead6');
    f.box(x0 + 0.07, fy + H + 0.07, z0 + 0.07, x0 + 0.29, fy + H + 0.075, z0 + 0.25, '#e8d2a0');
    { const px = x0 + 0.4, pz = (z0 + z1) / 2 + 0.05;
      f(GEO.box, '#2b2b30', { x: px, y: fy + H + 0.04, z: pz, sx: 0.18, sy: 0.08, sz: 0.2 });
      f(GEO.cyl12, '#e8e2d6', { x: px - 0.02, y: fy + H + 0.083, z: pz, sx: 0.06, sy: 0.008, sz: 0.06, rz: -0.35 });
      f(GEO.box, '#2b2b30', { x: px, y: fy + H + 0.115, z: pz, sx: 0.05, sy: 0.04, sz: 0.24 });
      for (const s of [-1, 1]) f(GEO.box, '#2b2b30', { x: px, y: fy + H + 0.1, z: pz + s * 0.11, sx: 0.07, sy: 0.04, sz: 0.06 }); }
    f(GEO.cyl8, '#f6efdc', { x: x0 + 0.2, y: fy + H + 0.122, z: z0 + 0.17, sx: 0.04, sy: 0.09, sz: 0.04 });
    rag(framer(nb, x0, fy + H, z1 - 0.07, Math.PI / 2), RAGS[3], 0.12, 0.1, 0.14);
    colliders.push({ type: 'box', minX: x0 - 0.36, maxX: iMaxX, minZ: z0, maxZ: z1 });
    box('filing-cabinet', [x0 - 0.36, fy, z0, x1, fy + H + 0.17, z1], { floor: true });
    // the calendar on the east wall over it: a picture (sky, a hill, a red barn), a grid of days, a nail; years out of date
    {
      const cz = z0 + 0.2, cy = fy + 1.62, w = 0.34, h = 0.52, x = wallE;
      f.box(x - 0.004, cy, cz - w / 2, x, cy + h, cz + w / 2, '#f6efdc');
      f.box(x - 0.007, cy + h * 0.52, cz - w / 2 + 0.02, x - 0.004, cy + h - 0.025, cz + w / 2 - 0.02, '#8fc4e0');
      f.box(x - 0.009, cy + h * 0.52, cz - w / 2 + 0.02, x - 0.007, cy + h * 0.68, cz + w / 2 - 0.02, '#5f9a4a');
      f.box(x - 0.012, cy + h * 0.62, cz - 0.02, x - 0.009, cy + h * 0.78, cz + 0.08, '#b8302a');
      f.box(x - 0.012, cy + h * 0.78, cz - 0.03, x - 0.009, cy + h * 0.83, cz + 0.09, '#5a2a22');
      f.box(x - 0.007, cy + h * 0.43, cz - 0.1, x - 0.004, cy + h * 0.48, cz + 0.1, '#c0392b');   // (the month in red)
      for (let rr = 0; rr < 5; rr++) for (let cc = 0; cc < 7; cc++) if (rr || cc > 2) f.box(x - 0.006, cy + 0.03 + rr * 0.042, cz - w / 2 + 0.03 + cc * 0.042, x - 0.004, cy + 0.055 + rr * 0.042, cz - w / 2 + 0.055 + cc * 0.042, '#3a3f47');
      f.box(x - 0.02, cy + h + 0.005, cz - 0.006, x, cy + h + 0.017, cz + 0.006, IRON);
      box('calendar', [x - 0.02, cy, cz - w / 2, x, cy + h + 0.02, cz + w / 2], { wall: true });
    }
    // the toolbox, open, on the floor beside the cabinet: the lid back, the tray lifted out, tools spilled
    {
      const tx = x0 - 0.5, tz = z0 + 0.27, g = framer(nb, tx, fy, tz, 0.08), R = rng(77);
      g.box(-0.11, 0, -0.25, 0.11, 0.2, 0.25, '#c0392b');
      g.box(-0.095, 0.2, -0.235, 0.095, 0.205, 0.235, '#2b2b30');   // (the dark inside, at the rim)
      g(GEO.box, '#a8302a', { x: 0.17, y: 0.24, sx: 0.012, sy: 0.12, sz: 0.49, rz: -0.3 });   // the lid, swung back
      g(GEO.box, '#a8302a', { x: 0.12, y: 0.21, sx: 0.1, sy: 0.012, sz: 0.48, rz: 0.25 });
      g.box(-0.36, 0, -0.2, -0.16, 0.06, 0.12, '#8a8f98');   // the tray, on the floor
      for (let k = 0; k < 6; k++) g(GEO.cyl8, COL.chrome, { x: -0.32 + (k % 3) * 0.06, y: 0.07, z: -0.13 + Math.floor(k / 3) * 0.12, sx: 0.016, sy: 0.04, sz: 0.016 });
      g(GEO.box, COL.chrome, { x: -0.03, y: 0.25, z: 0.05, sx: 0.025, sy: 0.18, sz: 0.012, rx: 0.4 });   // a wrench up out of it
      g(GEO.box, '#e0b54a', { x: 0.03, y: 0.24, z: -0.1, sx: 0.022, sy: 0.12, sz: 0.022, rz: 0.3 });
      for (let k = 0; k < 4; k++) g(GEO.box, k % 2 ? COL.chrome : ['#e0463c', '#3f8fd9'][k >> 1], { x: -0.22 - R() * 0.12, y: 0.008 + k * 0.006, z: 0.17 + k * 0.035, sx: 0.18, sy: 0.014, sz: 0.022, ry: (R() - 0.5) * 1.2 });   // spilled
      colliders.push({ type: 'box', minX: tx - 0.4, maxX: tx + 0.26, minZ: tz - 0.27, maxZ: tz + 0.3 });
      box('toolbox', [tx - 0.4, fy, tz - 0.27, tx + 0.26, fy + 0.34, tz + 0.3], { floor: true });
    }
  }

  // ---- the bench: a machinist's vise on its north end, sawdust and shavings under and in front of it, coffee cans of nails and
  // a bucket of screws in the gaps on its shelf, a rag over its edge
  {
    const bx1 = iMinX + 0.6, bt = fy + 0.88, vz = Pg.z0 + 0.17;
    f.box(bx1 - 0.28, bt, vz - 0.1, bx1 - 0.02, bt + 0.03, vz + 0.1, '#3a4a5a');
    f.box(bx1 - 0.25, bt + 0.03, vz - 0.075, bx1 - 0.03, bt + 0.13, vz + 0.075, '#4a5a6a');
    f.box(bx1 - 0.03, bt + 0.035, vz - 0.08, bx1 + 0.09, bt + 0.14, vz + 0.08, '#4a5a6a');
    for (const [xa, xb] of [[bx1 - 0.045, bx1 - 0.03], [bx1 + 0.09, bx1 + 0.105]]) f.box(xa, bt + 0.09, vz - 0.082, xb, bt + 0.15, vz + 0.082, '#2b2b30');
    f(GEO.cyl8, STEEL, { x: bx1 + 0.17, y: bt + 0.08, z: vz, sx: 0.014, sy: 0.16, sz: 0.014, rz: Math.PI / 2 });
    f(GEO.cyl6, STEEL, { x: bx1 + 0.25, y: bt + 0.08, z: vz + 0.02, sx: 0.008, sy: 0.24, sz: 0.008, rx: Math.PI / 2 + 0.25 });
    for (const s of [-1, 1]) f(GEO.sphere, STEEL, { x: bx1 + 0.25, y: bt + 0.08 + s * 0.03, z: vz + 0.02 + s * 0.116, sx: 0.016, sy: 0.016, sz: 0.016 });
    box('vise', [bx1 - 0.28, bt, vz - 0.14, bx1 + 0.27, bt + 0.15, vz + 0.14]);
    // the sawdust: a few pale drifts on the floor (each at its own height: none in another's plane), shavings curled on them
    const drifts = [[bx1 + 0.04, Pg.z0 + 1.2, 0.42, 0.3, '#e8d2a0'], [bx1 + 0.22, Pg.z0 + 1.75, 0.3, 0.4, '#dcc28c'], [bx1 - 0.18, Pg.z0 + 2.25, 0.33, 0.24, '#e8d2a0'], [bx1 + 0.1, Pg.z0 + 0.6, 0.24, 0.18, '#d9bf88'], [bx1 + 0.3, Pg.z0 + 2.4, 0.2, 0.15, '#e2cb98']];
    drifts.forEach(([x, z, rx, rz, c], i) => f(GEO.cyl12, c, { x, y: fy + 0.003 + i * 0.002, z, sx: rx, sy: 0.002, sz: rz, ry: i * 0.7 }));
    const R = rng(91);
    for (let k = 0; k < 18; k++) { const d = drifts[k % drifts.length], a = R() * 6.28, rr = R() * 0.8; f(new THREE.TorusGeometry(0.018, 0.004, 3, 6, Math.PI * 1.5), k % 3 ? '#f0dcae' : '#d8b47a', { x: d[0] + Math.cos(a) * d[2] * rr, y: fy + 0.018, z: d[1] + Math.sin(a) * d[3] * rr, rx: Math.PI / 2 + (R() - 0.5) * 0.6, ry: R() * 6, rz: (R() - 0.5) * 0.4 }); }
    box('sawdust', [bx1 - 0.6, fy, Pg.z0 + 0.4, bx1 + 0.55, fy + 0.03, Pg.z0 + 2.65]);
    // on the shelf under the bench, in the gaps between its boxes
    const sy = fy + 0.22, xs = iMinX + 0.3;
    coffeeCan(nb, xs, sy, Pg.z0 + 0.875, 51); coffeeCan(nb, xs, sy, Pg.z0 + 2.975, 52);
    box('coffee-can', [xs - 0.1, sy, Pg.z0 + 0.78, xs + 0.1, sy + 0.2, Pg.z0 + 0.97]);
    { const z = Pg.z0 + 2.275, g = framer(nb, xs, sy, z, 0.3), R2 = rng(53);
      g(GEO.cyl12, GALV, { y: 0.11, sx: 0.095, sy: 0.22, sz: 0.095 });
      g(new THREE.TorusGeometry(0.095, 0.006, 3, 12), '#c8ccd2', { y: 0.218, rx: Math.PI / 2 });
      g(GEO.cyl12, '#6b7078', { y: 0.2, sx: 0.088, sy: 0.02, sz: 0.088 });
      for (let k = 0; k < 8; k++) g(GEO.cyl6, k % 3 ? '#8f969e' : '#c9a23a', { x: (R2() - 0.5) * 0.12, y: 0.215, z: (R2() - 0.5) * 0.12, sx: 0.005, sy: 0.045, sz: 0.005, rx: R2() * 1.4, ry: R2() * 6 });
      g(new THREE.TorusGeometry(0.1, 0.004, 3, 10, Math.PI), STEEL, { y: 0.22, rz: 0.4 });
      box('screw-bucket', [xs - 0.1, sy, z - 0.1, xs + 0.1, sy + 0.3, z + 0.1]); }
    rag(framer(nb, bx1, bt, Pg.z0 + 2.43, -Math.PI / 2), RAGS[0]);
    box('shop-rag', [bx1 - 0.12, bt - 0.18, Pg.z0 + 2.35, bx1 + 0.02, bt + 0.01, Pg.z0 + 2.51]);
  }

  // ---- under the spring table: a crate of mismatched hinges, a box of door knobs, a bucket of mixed screws, a can of nails
  {
    const tx = Tt.x, tz = Tt.z, R = rng(61);
    { const x0 = tx - 0.6, x1 = tx - 0.12, z0 = tz - 0.26, z1 = tz + 0.2, h = 0.2;
      f.box(x0, fy, z0, x1, fy + 0.02, z1, COL.woodMid);
      for (const [za, zb] of [[z0, z0 + 0.018], [z1 - 0.018, z1]]) for (const y of [0.02, 0.11]) f.box(x0, fy + y, za, x1, fy + y + 0.08, zb, '#c9a26b');
      for (const [xa, xb] of [[x0, x0 + 0.018], [x1 - 0.018, x1]]) for (const y of [0.02, 0.11]) f.box(xa, fy + y, z0 + 0.018, xb, fy + y + 0.08, z1 - 0.018, '#b98a5a');
      f.box(x0 + 0.02, fy + 0.02, z0 + 0.02, x1 - 0.02, fy + h - 0.03, z1 - 0.02, '#6b7078');
      for (let k = 0; k < 14; k++) { const brass = k % 4 === 1; f(GEO.box, brass ? '#c9a23a' : k % 3 ? '#8f969e' : '#4a4f57', { x: x0 + 0.08 + R() * (x1 - x0 - 0.16), y: fy + h - 0.025 + R() * 0.03, z: z0 + 0.08 + R() * (z1 - z0 - 0.16), sx: 0.05 + R() * 0.06, sy: 0.006, sz: 0.06 + R() * 0.05, rx: (R() - 0.5) * 0.7, ry: R() * 3, rz: (R() - 0.5) * 0.7 }); }
      box('hinge-crate', [x0, fy, z0, x1, fy + h + 0.04, z1], { floor: true }); }
    { const g = framer(nb, tx + 0.15, fy, tz - 0.08, 0.15), w = 0.34, d = 0.3, h = 0.17, t = 0.008;
      g.box(-w / 2, 0, -d / 2, w / 2, t, d / 2, COL.cardDk);
      g.box(-w / 2, t, -d / 2, w / 2, h, -d / 2 + t, COL.card); g.box(-w / 2, t, d / 2 - t, w / 2, h, d / 2, COL.card);
      g.box(-w / 2, t, -d / 2 + t, -w / 2 + t, h, d / 2 - t, COL.card); g.box(w / 2 - t, t, -d / 2 + t, w / 2, h, d / 2 - t, COL.card);
      g.box(-w / 2 + t + 0.003, t, -d / 2 + t + 0.003, w / 2 - t - 0.003, h - 0.04, d / 2 - t - 0.003, '#7a5a3a');
      for (let k = 0; k < 11; k++) g(GEO.sphere, ['#c9a23a', '#e8e2d6', '#c9a23a', '#9ad8e8', '#8a5a3a'][k % 5], { x: -0.12 + (k % 4) * 0.08 + (R() - 0.5) * 0.02, y: h - 0.025 + (k % 3) * 0.01, z: -0.09 + Math.floor(k / 4) * 0.09, sx: 0.034, sy: 0.03, sz: 0.034 });
      g.box(-0.1, h * 0.35, -d / 2 - 0.004, 0.1, h * 0.75, -d / 2 + 0.001, COL.label);
      box('doorknob-box', [tx + 0.15 - 0.2, fy, tz - 0.08 - 0.19, tx + 0.15 + 0.2, fy + h + 0.03, tz - 0.08 + 0.19], { floor: true }); }
    { const bx = tx + 0.52, bz = tz + 0.05, g = framer(nb, bx, fy, bz, 1.1);
      g(GEO.cyl12, '#3f6fa8', { y: 0.12, sx: 0.11, sy: 0.24, sz: 0.11 });
      g(new THREE.TorusGeometry(0.11, 0.007, 3, 12), '#2f5d96', { y: 0.238, rx: Math.PI / 2 });
      g(GEO.cyl12, '#7d848c', { y: 0.22, sx: 0.102, sy: 0.02, sz: 0.102 });
      for (let k = 0; k < 9; k++) g(GEO.cyl6, k % 3 ? '#8f969e' : '#c9a23a', { x: (R() - 0.5) * 0.14, y: 0.235, z: (R() - 0.5) * 0.14, sx: 0.005, sy: 0.045, sz: 0.005, rx: R() * 1.4, ry: R() * 6 });
      box('screw-bucket', [bx - 0.12, fy, bz - 0.12, bx + 0.12, fy + 0.27, bz + 0.12], { floor: true }); }
    coffeeCan(nb, tx + 0.08, fy, tz + 0.22, 62);
    box('coffee-can', [tx - 0.01, fy, tz + 0.13, tx + 0.17, fy + 0.2, tz + 0.31], { floor: true });
  }

  // ---- under the bargain table: two jerry cans, a cooler, a car battery
  {
    const x0 = sxOf(P) + 1.4, z0 = zP - 3.4;   // (tool-crib-build.js's bargain table: x0..x0 + 1.6, z0..z0 + 1.4, top fy + 0.74)
    jerryCan(framer(nb, x0 + 0.2, fy, z0 + 0.36, 0.05), '#c0392b');
    jerryCan(framer(nb, x0 + 0.42, fy, z0 + 0.34, -0.08), '#5f6b3a');
    box('jerry-can', [x0 + 0.1, fy, z0 + 0.17, x0 + 0.3, fy + 0.48, z0 + 0.54], { floor: true });
    box('jerry-can', [x0 + 0.32, fy, z0 + 0.15, x0 + 0.52, fy + 0.48, z0 + 0.52], { floor: true });
    { const g = framer(nb, x0 + 1.05, fy, z0 + 0.36, 0.06);
      g.box(-0.25, 0, -0.16, 0.25, 0.27, 0.16, '#3f8fd9');
      g.box(-0.255, 0.27, -0.165, 0.255, 0.34, 0.165, '#f4f1ea');
      for (const s of [-1, 1]) { g.box(s < 0 ? -0.275 : 0.25, 0.2, -0.06, s < 0 ? -0.25 : 0.275, 0.24, 0.06, '#f4f1ea'); }
      g.box(-0.18, 0.06, -0.166, 0.18, 0.08, -0.16, '#2f5d96');
      box('cooler', [x0 + 0.78, fy, z0 + 0.18, x0 + 1.32, fy + 0.34, z0 + 0.54], { floor: true }); }
    { const g = framer(nb, x0 + 1.2, fy, z0 + 1.05, -0.2);
      g.box(-0.13, 0, -0.085, 0.13, 0.19, 0.085, '#2b2b30');
      g.box(-0.13, 0.19, -0.085, 0.13, 0.2, 0.085, '#3a3f47');
      for (const [s, c] of [[-1, '#c0392b'], [1, '#2b2b30']]) { g(GEO.cyl8, '#8f969e', { x: s * 0.085, y: 0.215, sx: 0.016, sy: 0.03, sz: 0.016 }); g(GEO.cyl8, c, { x: s * 0.085, y: 0.235, sx: 0.022, sy: 0.012, sz: 0.022 }); }
      g(GEO.sphere, '#d8ead8', { x: -0.085, y: 0.208, z: 0.02, sx: 0.03, sy: 0.012, sz: 0.025 });   // (the crust on its terminal)
      g.box(-0.1, 0.07, -0.088, 0.06, 0.12, -0.085, '#e0b54a');
      box('car-battery', [x0 + 1.05, fy, z0 + 0.92, x0 + 1.35, fy + 0.25, z0 + 1.18], { floor: true }); }
  }

  // ---- a wheelbarrow of scrap wood offcuts west of the paint cans (its wheel to the north), a rag over a handle
  {
    const wx = ST.maxX + 1.08, wz = zP - 3.29, g = framer(nb, wx, fy, wz, Math.PI / 2), TR = '#3f8a5a', R = rng(81);
    g(new THREE.TorusGeometry(0.17, 0.05, 6, 14), '#2b2b30', { x: 0.55, y: 0.22 });
    g(GEO.cyl12, '#c0392b', { x: 0.55, y: 0.22, sx: 0.09, sy: 0.1, sz: 0.09, rx: Math.PI / 2 });
    for (const s of [-1, 1]) g.rod([0.55, 0.22, s * 0.055], [0.22, 0.44, s * 0.2], 0.014, '#5d636b');
    // the tray: a floor and four sides flaring out, a rolled rim
    g.box(-0.24, 0.4, -0.2, 0.3, 0.418, 0.2, TR);
    g(GEO.box, TR, { x: 0.41, y: 0.55, sx: 0.012, sy: 0.32, sz: 0.5, rz: -0.65 });
    g(GEO.box, TR, { x: -0.3, y: 0.55, sx: 0.012, sy: 0.3, sz: 0.48, rz: 0.35 });
    for (const s of [-1, 1]) g(GEO.box, TR, { x: 0.04, y: 0.55, z: s * 0.255, sx: 0.78, sy: 0.3, sz: 0.012, rx: s * 0.35 });
    // the offcuts heaped in it (and one fallen out beside it)
    for (let k = 0; k < 13; k++) { const L = 0.14 + R() * 0.32; g(GEO.box, WOODS[k % WOODS.length], { x: -0.12 + R() * 0.36, y: 0.46 + Math.floor(k / 4) * 0.045 + R() * 0.02, z: (R() - 0.5) * 0.3, sx: L, sy: 0.04 + R() * 0.02, sz: 0.06 + R() * 0.05, ry: (R() - 0.5) * 2.4, rz: (R() - 0.5) * 0.3 }); }
    g(GEO.box, '#d8b47a', { x: 0.15, y: 0.022, z: -0.42, sx: 0.3, sy: 0.044, sz: 0.09, ry: 0.5 });
    // the handles, the legs
    for (const s of [-1, 1]) {
      g.rod([0.42, 0.42, s * 0.19], [-0.72, 0.62, s * 0.26], 0.02, '#a8804f');
      g(GEO.cyl8, '#2b2b30', { x: -0.69, y: 0.615, z: s * 0.258, sx: 0.025, sy: 0.12, sz: 0.025, rz: Math.PI / 2 - 0.17 });
      g.rod([-0.28, 0.43, s * 0.2], [-0.33, 0.015, s * 0.22], 0.014, '#5d636b');
      g.box(-0.37, 0, s * 0.22 - 0.02, -0.29, 0.015, s * 0.22 + 0.02, '#3a3f47');
    }
    ragOver(framer(nb, wx + 0.24, fy + 0.6, wz + 0.55, 0.06, -0.17, 0), RAGS[1]);
    colliders.push({ type: 'box', minX: wx - 0.3, maxX: wx + 0.3, minZ: wz - 0.64, maxZ: wz + 0.76 });
    box('wheelbarrow', [wx - 0.3, fy, wz - 0.64, wx + 0.3, fy + 0.7, wz + 0.76], { floor: true });
    box('scrap-wood', [wx - 0.2, fy + 0.4, wz - 0.3, wx + 0.2, fy + 0.68, wz + 0.25]);
  }

  // ---- rags over the tool chest's edge, the counter's front edge and the red mower's handle
  {
    rag(framer(nb, sxOf(P) + 2.2 + 0.29, fy + 1.03, zP - 3.9 - 0.24, 0), RAGS[4], 0.14, 0.1, 0.17);
    rag(framer(nb, Ct.minX - 0.06, Ct.top, Ct.maxZ - 0.3, Math.PI / 2), RAGS[5], 0.18, 0.12, 0.15);
    ragOver(framer(nb, sxOf(P) - 1.25 + 0.95 - 0.82, fy + 1.0, zP - 3.45 + 1.6 + 0.1, 0), RAGS[2], 0.13, 0.12);
    box('shop-rag', [Ct.minX - 0.08, Ct.top - 0.16, Ct.maxZ - 0.4, Ct.minX + 0.07, Ct.top + 0.01, Ct.maxZ - 0.2]);
  }

  // ---- on top of the paint wall: an old desk fan, jars of washers, coffee cans, a couple of boxes (under the signs)
  {
    const y = fy + Pn.h + 0.04, zc = (Pn.z0 - 0.02 + Pn.z1) / 2, x = Pn.x0;
    { const g = framer(nb, x + 1.2, y, zc + 0.04, Math.PI + 0.25);   // (it faces north, into the shop)
      g(GEO.cyl12, '#3a5a4a', { y: 0.015, sx: 0.09, sy: 0.03, sz: 0.09 });
      g(GEO.cyl6, '#3a5a4a', { y: 0.09, sx: 0.015, sy: 0.13, sz: 0.015 });
      g(GEO.sphere, '#3a5a4a', { y: 0.19, z: -0.06, sx: 0.06, sy: 0.06, sz: 0.08 });
      for (const zz of [0.02, 0.06]) g(new THREE.TorusGeometry(0.12, 0.005, 3, 14), '#c8ccd2', { y: 0.19, z: zz });
      for (let k = 0; k < 4; k++) g(GEO.box, '#c8ccd2', { y: 0.19, z: 0.064, sx: 0.24, sy: 0.004, sz: 0.004, rz: k * Math.PI / 4 });
      for (let k = 0; k < 3; k++) g(GEO.box, '#9ad8c4', { y: 0.19 + Math.sin(k * 2.09) * 0.055, x: Math.cos(k * 2.09) * 0.055, z: 0.036, sx: 0.1, sy: 0.05, sz: 0.004, rz: k * 2.09 });
      box('old-fan', [x + 1.05, y, zc - 0.14, x + 1.35, y + 0.33, zc + 0.14]); }
    for (let k = 0; k < 5; k++) washerJar(framer(nb, x + 1.95 + k * 0.12, y, zc + (k % 2 ? 0.05 : -0.04)), k);
    box('washer-jar', [x + 1.88, y, zc - 0.1, x + 2.5, y + 0.17, zc + 0.11]);
    coffeeCan(nb, x + 3.15, y, zc, 54); coffeeCan(nb, x + 3.33, y, zc + 0.03, 55);
    box('coffee-can', [x + 3.05, y, zc - 0.1, x + 3.43, y + 0.2, zc + 0.13]);
    f(GEO.box, '#b98a5a', { x: x + 4.55, y: y + 0.075, z: zc, sx: 0.5, sy: 0.15, sz: 0.3, ry: 0.06 });
    f(GEO.box, '#c8b08a', { x: x + 4.58, y: y + 0.215, z: zc, sx: 0.38, sy: 0.13, sz: 0.26, ry: -0.08 });
    box('box-stack', [x + 4.27, y, zc - 0.18, x + 4.83, y + 0.29, zc + 0.18]);
  }

  // ---- on top of the east shelves: a busted TV, shoe boxes, a cooler; a coffee can and a jar in the gaps
  {
    const x0 = Sh.x0 + 0.05, x1 = Sh.x1 - 0.06, base = fy + Sh.h + 0.05;
    { const z0 = Sh.z0 + 0.25, yb = base + 0.22, xm = (x0 + x1) / 2;   // the TV on the first box: an old wood-cabinet set, the screen cracked
      f.box(xm - 0.19, yb, z0, xm + 0.19, yb + 0.36, z0 + 0.46, '#7a5232');
      f.box(xm - 0.2, yb + 0.05, z0 + 0.04, xm - 0.19, yb + 0.31, z0 + 0.32, '#3d4d4a');
      for (const [a, b2, c] of [[0.1, 0.12, 0.6], [0.18, 0.2, -0.4], [0.22, 0.08, 1.2]]) f(GEO.box, '#c8d4d0', { x: xm - 0.202, y: yb + a + 0.05, z: z0 + 0.04 + b2, sx: 0.002, sy: 0.12, sz: 0.004, rx: c });
      for (const y of [0.24, 0.17]) f(GEO.cyl12, '#2b2b30', { x: xm - 0.2, y: yb + y, z: z0 + 0.39, sx: 0.022, sy: 0.02, sz: 0.022, rz: Math.PI / 2 });
      for (let k = 0; k < 4; k++) f.box(xm - 0.2, yb + 0.04 + k * 0.022, z0 + 0.35, xm - 0.19, yb + 0.05 + k * 0.022, z0 + 0.43, '#2b2b30');
      f(GEO.cyl8, '#2b2b30', { x: xm, y: yb + 0.375, z: z0 + 0.23, sx: 0.04, sy: 0.03, sz: 0.04 });
      f.rod([xm, yb + 0.38, z0 + 0.23], [xm - 0.05, yb + 0.72, z0 + 0.06], 0.004, COL.chrome);
      f.rod([xm, yb + 0.38, z0 + 0.23], [xm + 0.02, yb + 0.6, z0 + 0.36], 0.004, COL.chrome);
      f.rod([xm + 0.02, yb + 0.6, z0 + 0.36], [xm + 0.06, yb + 0.66, z0 + 0.5], 0.004, COL.chrome);   // (one ear bent)
      box('busted-tv', [xm - 0.2, yb, z0, xm + 0.19, yb + 0.72, z0 + 0.5]); }
    { const z0 = Sh.z0 + 1.2, yb = base + 0.3;
      f(GEO.box, '#e8e2d6', { x: x0 + 0.13, y: yb + 0.05, z: z0 + 0.25, sx: 0.2, sy: 0.1, sz: 0.34, ry: 0.05 });
      f(GEO.box, '#c0392b', { x: x0 + 0.13, y: yb + 0.15, z: z0 + 0.24, sx: 0.19, sy: 0.1, sz: 0.32, ry: -0.06 });
      f(GEO.box, '#2f5d96', { x: x0 + 0.12, y: yb + 0.235, z: z0 + 0.26, sx: 0.17, sy: 0.07, sz: 0.3, ry: 0.1 });
      box('shoe-box', [x0, yb, z0 + 0.06, x0 + 0.25, yb + 0.27, z0 + 0.44]); }
    { const z0 = Sh.z0 + 2.12, yb = base + 0.22, g = framer(nb, (x0 + x1) / 2, yb, z0 + 0.25, 0);
      g.box(-0.17, 0, -0.24, 0.17, 0.26, 0.24, '#c0392b');
      g.box(-0.175, 0.26, -0.245, 0.175, 0.33, 0.245, '#f4f1ea');
      for (const s of [-1, 1]) g.box(-0.06, 0.19, s < 0 ? -0.265 : 0.24, 0.06, 0.23, s < 0 ? -0.24 : 0.265, '#f4f1ea');
      box('cooler', [x0, yb, z0, x1, yb + 0.33, z0 + 0.5]); }
    coffeeCan(nb, x1 - 0.12, base, Sh.z0 + 0.95, 56);
    washerJar(framer(nb, x1 - 0.12, base, Sh.z0 + 1.9), 3);
    box('washer-jar', [x1 - 0.18, base, Sh.z0 + 1.84, x1 - 0.06, base + 0.17, Sh.z0 + 1.96]);
  }

  // ---- fishing rods on pegs on the east wall, over the shelves and the mounted fish
  {
    const za = Sh.z0 + 0.05, zb = Sh.z1 - 0.15, x = wallE - 0.06;
    for (const z of [za + 0.25, (za + zb) / 2, zb - 0.2]) for (const y of [fy + 3.6, fy + 3.85]) f(GEO.cyl6, COL.woodDk, { x: wallE - 0.05, y: y - 0.02, z, sx: 0.009, sy: 0.1, sz: 0.009, rz: Math.PI / 2 });
    [[fy + 3.6, '#2b4a6b', 0], [fy + 3.85, '#7a2a2a', 1]].forEach(([y, c, i]) => {
      f(GEO.cyl8, '#c9a26b', { x, y, z: za + 0.15, sx: 0.014, sy: 0.3, sz: 0.014, rx: Math.PI / 2 });
      f(GEO.cyl6, c, { x, y, z: (za + 0.3 + zb) / 2, sx: 0.0075, sy: zb - za - 0.3, sz: 0.0075, rx: Math.PI / 2 });
      f(GEO.cyl6, c, { x, y, z: zb + 0.2, sx: 0.004, sy: 0.4, sz: 0.004, rx: Math.PI / 2 });
      f(GEO.cyl12, i ? '#2b2b30' : '#c8ccd2', { x: x - 0.02, y: y - 0.045, z: za + 0.28, sx: 0.035, sy: 0.03, sz: 0.035, rz: Math.PI / 2 });
      f.rod([x, y, za + 0.28], [x - 0.008, y - 0.03, za + 0.28], 0.004, COL.chrome);
      box('fishing-rod', [x - 0.06, y - 0.08, za, wallE, y + 0.02, zb + 0.4], { wall: true });
    });
  }

  // ---- saw blades on nails on the front wall, high in the north-east corner over the window
  {
    const z = wallN, BLADE = new THREE.CylinderGeometry(1, 1, 1, 16), TEETH = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 16);
    [[-1.0, 3.25, 0.2], [-0.35, 3.52, 0.16], [-0.92, 3.97, 0.17], [-0.3, 4.24, 0.2], [-0.62, 4.62, 0.14]].forEach(([dx, dy, r], i) => {
      const x = iMaxX + dx - 0.35, y = fy + dy;
      f(TEETH, i % 2 ? '#7a6a5a' : '#6b7078', { x, y, z: z + 0.004, sx: r * 1.08, sy: 0.003, sz: r * 1.08, rx: Math.PI / 2 });   // (the teeth: a darker 16-gon behind, turned half a step)
      f(BLADE, i === 2 ? '#a88a6a' : STEEL, { x, y, z: z + 0.008, sx: r, sy: 0.003, sz: r, rx: Math.PI / 2 });
      f(GEO.cyl8, '#2b2b30', { x, y, z: z + 0.0105, sx: 0.02, sy: 0.002, sz: 0.02, rx: Math.PI / 2 });
      f(GEO.cyl6, IRON, { x, y: y + 0.008, z: z + 0.02, sx: 0.003, sy: 0.04, sz: 0.003, rx: Math.PI / 2 });
      box('saw-blade', [x - r * 1.07, y - r * 1.07, z, x + r * 1.07, y + r * 1.07, z + 0.04], { wall: true });
    });
    BLADE.dispose(); TEETH.dispose();
  }

  // ---- the west wall over the stair: a rail of bar clamps, old license plates up the wall with the stair, a bike wheel
  {
    const railY = z => fy + 0.92 + (P.LY - fy) / 2 + (z - (ST.z0 + ST.z1) / 2) * (P.LY - fy) / (ST.z1 - ST.z0);   // (the wall rail by the stair)
    { const za = ST.z0 + 0.15, zb = ST.z0 + 1.25, y = fy + 2.6;
      f.box(wallW, y - 0.03, za, wallW + 0.035, y + 0.02, zb, COL.woodDk);
      for (let k = 0; k < 6; k++) {
        const z = za + 0.1 + k * 0.17, L = 0.42 + (k % 3) * 0.08, x = wallW + 0.05;
        f.box(x - 0.006, y - L, z - 0.012, x + 0.006, y + 0.04, z + 0.012, STEEL);
        f.box(x - 0.02, y + 0.02, z - 0.045, x + 0.02, y + 0.07, z + 0.035, k % 2 ? '#c0392b' : '#e07a2c');
        f.box(x - 0.02, y - L * 0.55, z - 0.045, x + 0.02, y - L * 0.55 + 0.05, z + 0.035, k % 2 ? '#c0392b' : '#e07a2c');
        f(GEO.cyl8, '#2b2b30', { x, y: y - L * 0.55 - 0.06, z: z - 0.03, sx: 0.014, sy: 0.1, sz: 0.014 });
      }
      box('clamp-rail', [wallW, y - 0.6, za, wallW + 0.07, y + 0.07, zb], { wall: true }); }
    const plates = [['#f4ecd6', '#2f5d96'], ['#f0c24f', '#2b2b30'], ['#2f5d96', '#f4ecd6'], ['#ffffff', '#c0392b'], ['#e07a2c', '#2b2b30'], ['#f4ecd6', '#3f8a5a']];
    plates.forEach(([bg, ink], k) => {
      const z = ST.z0 + 1.65 + k * 0.36, y = railY(z) + 0.72 + (k % 2) * 0.24, tilt = (k % 3 - 1) * 0.06, g = framer(nb, wallW, y, z, Math.PI / 2, 0, tilt);
      // (in this frame local x runs along the wall (+z), local z out of it (+x))
      g.box(-0.15, -0.075, 0.0, 0.15, 0.075, 0.006, bg);
      g.box(-0.145, -0.07, 0.006, 0.145, -0.062, 0.008, ink); g.box(-0.145, 0.062, 0.006, 0.145, 0.07, 0.008, ink);
      for (let c = 0; c < 6; c++) g.box(-0.11 + c * 0.04, -0.035, 0.006, -0.085 + c * 0.04, 0.035, 0.009, ink);
      for (const s of [-1, 1]) g(GEO.cyl6, '#8f969e', { x: s * 0.1, y: 0.05, z: 0.009, sx: 0.006, sy: 0.004, sz: 0.006, rx: Math.PI / 2 });
      box('license-plate', [wallW, y - 0.09, z - 0.16, wallW + 0.012, y + 0.09, z + 0.16], { wall: true });
    });
    { const z = zP - 0.75, y = fy + 4.75, g = framer(nb, wallW + 0.04, y, z, Math.PI / 2);   // the bike wheel on a nail (its plane along the wall)
      g(new THREE.TorusGeometry(0.31, 0.022, 4, 18), COL.black, {});
      g(new THREE.TorusGeometry(0.285, 0.008, 3, 18), COL.chrome, {});
      for (let s = 0; s < 4; s++) g(GEO.box, COL.chromeDk, { sx: 0.57, sy: 0.004, sz: 0.004, rz: s * Math.PI / 4 });
      g(GEO.cyl8, COL.chrome, { sx: 0.025, sy: 0.07, sz: 0.025, rx: Math.PI / 2 });
      box('bike-wheel', [wallW, y - 0.34, z - 0.34, wallW + 0.07, y + 0.34, z + 0.34], { wall: true }); }
  }

  // ---- the rafters: two racks hung under the beams (angle-iron bars on threaded rods), hooks with a hose, a cord and a chair
  const rack = (xa, xb, za, zb, y) => {
    for (const z of [za, zb]) {
      f.box(xa, y - 0.04, z - 0.025, xb, y, z + 0.025, '#5d636b');
      for (const x of [xa + 0.04, xb - 0.04]) f(GEO.cyl6, STEEL, { x, y: (y + beamB) / 2, z, sx: 0.006, sy: beamB - y + 0.01, sz: 0.006 });
    }
  };
  {   // rack one, over the bench: stacked window screens, two boards on them
    const za = beams[0], zb = beams[1], xa = wallW + 0.05, xb = wallW + 0.95, y = beamB - 0.9;
    rack(xa, xb, za, zb, y);
    for (let k = 0; k < 4; k++) {
      const x0 = xa + 0.06 + k * 0.025, x1 = x0 + 0.74, z0 = za - 0.12 + k * 0.03, z1 = zb + 0.1 - k * 0.02, yy = y + k * 0.03, fr = k % 2 ? '#c8ccd2' : '#e9e2cf';
      for (const [p, q] of [[z0, z0 + 0.03], [z1 - 0.03, z1]]) f.box(x0, yy, p, x1, yy + 0.026, q, fr);
      for (const [p, q] of [[x0, x0 + 0.03], [x1 - 0.03, x1]]) f.box(p, yy, z0 + 0.03, q, yy + 0.026, z1 - 0.03, fr);
      f.box(x0 + 0.03, yy + 0.01, z0 + 0.03, x1 - 0.03, yy + 0.014, z1 - 0.03, '#4a5058');
    }
    for (const dx of [0.2, 0.55]) f.box(xa + dx, y + 0.125, za - 0.25, xa + dx + 0.09, y + 0.165, zb + 0.15, '#d8b47a');
    box('rafter-rack', [xa, y - 0.04, za - 0.25, xb, beamB, zb + 0.15], { overhead: true });
    box('window-screens', [xa + 0.06, y, za - 0.12, xb, y + 0.13, zb + 0.1], { overhead: true });
  }
  {   // rack two, over the bargain table: planks, rolls of chicken wire, plastic pipe
    const za = nearBeam(zP - 4.4), zb = nearBeam(zP - 2.2), xa = iMaxX - 3.15, xb = iMaxX - 2.25, y = beamB - 0.95;
    rack(xa, xb, za, zb, y);
    for (const dx of [0.05, 0.36, 0.67]) f.box(xa + dx, y, za - 0.12, xa + dx + 0.18, y + 0.025, zb + 0.12, ['#c9a26b', '#b98a5a', '#d8b47a'][Math.round(dx * 3) % 3]);
    for (let k = 0; k < 3; k++) {
      const z = za + 0.4 + k * 0.5, r = 0.15 - k * 0.012, xm = (xa + xb) / 2;
      f(GEO.cyl12, '#b8bec4', { x: xm, y: y + 0.025 + r, z, sx: r, sy: 0.86, sz: r, rz: Math.PI / 2 });
      for (const s of [-1, 1]) f(GEO.cyl12, '#5d636b', { x: xm + s * 0.432, y: y + 0.025 + r, z, sx: r * 0.8, sy: 0.006, sz: r * 0.8, rz: Math.PI / 2 });
      for (const dx of [-0.25, 0.05, 0.3]) f(new THREE.TorusGeometry(r + 0.002, 0.004, 3, 12), '#8f969e', { x: xm + dx, y: y + 0.025 + r, z, ry: Math.PI / 2 });
    }
    for (const dx of [0.1, 0.16, 0.8]) f(GEO.cyl8, '#f4f4ee', { x: xa + dx, y: y + 0.05, z: (za + zb) / 2 + 0.1, sx: 0.025, sy: zb - za + 0.4, sz: 0.025, rx: Math.PI / 2 });
    box('rafter-rack', [xa, y - 0.04, za - 0.2, xb, beamB, zb + 0.3], { overhead: true });
    box('chicken-wire', [xa, y + 0.025, za + 0.25, xb, y + 0.33, za + 1.55], { overhead: true });
  }
  {   // on hooks: a green garden hose over the counter's front, an orange extension cord, a broken lawn chair
    const hook = (x, z, len) => { const y = beamB - len; jHook(f, x, y, z, beamB + 0.02); return y; };
    { const x = Ct.minX - 0.55, z = beams[0], y = hook(x, z, 0.14);
      coilHung(framer(nb, x, y, z, 0), '#3f8a5a', 0.24, 0.017, 6, 5);
      f(GEO.cyl8, '#c9a23a', { x: x + 0.2, y: y - 0.66, z, sx: 0.016, sy: 0.08, sz: 0.016 });
      f.rod([x + 0.21, y - 0.32, z], [x + 0.2, y - 0.62, z], 0.017, '#3f8a5a');
      box('garden-hose', [x - 0.3, y - 0.72, z - 0.1, x + 0.3, beamB, z + 0.1], { overhead: true }); }
    { const x = sxOf(P) - 1.6, z = beams[1], y = hook(x, z, 0.12);
      coilHung(framer(nb, x, y, z, 0.2), '#f08a3c', 0.2, 0.011, 5, 7);
      f.box(x - 0.03, y - 0.68, z - 0.02, x + 0.03, y - 0.6, z + 0.02, '#f08a3c');
      f.rod([x - 0.01, y - 0.36, z], [x, y - 0.6, z], 0.011, '#f08a3c');
      box('extension-cord', [x - 0.25, y - 0.7, z - 0.1, x + 0.25, beamB, z + 0.1], { overhead: true }); }
    { const x = sxOf(P) - 1.25, z = beams[3], y = hook(x, z, 0.12), g = framer(nb, x, y - 0.03, z, 0, 0, 0.06);   // the chair: folded flat, hung by its back
      for (const s of [-1, 1]) { g(GEO.cyl8, '#c8ccd2', { x: s * 0.27, y: -0.45, sx: 0.011, sy: 0.9, sz: 0.011 }); g(GEO.cyl8, '#c8ccd2', { x: s * 0.25, y: -0.52, z: 0.03, sx: 0.011, sy: 0.82, sz: 0.011 }); }
      g(GEO.cyl8, '#c8ccd2', { y: -0.005, sx: 0.011, sy: 0.55, sz: 0.011, rz: Math.PI / 2 });
      g(GEO.cyl8, '#c8ccd2', { y: -0.9, sx: 0.011, sy: 0.55, sz: 0.011, rz: Math.PI / 2 });
      for (let k = 0; k < 9; k++) if (k !== 5) g(GEO.box, k % 2 ? '#f4f1ea' : '#3f8a5a', { y: -0.06 - k * 0.095, z: 0.004, sx: 0.54, sy: 0.07, sz: 0.004 });
      g(GEO.box, '#f4f1ea', { x: 0.2, y: -0.62, z: 0.008, sx: 0.07, sy: 0.24, sz: 0.004, rz: 0.15 });   // the strap that snapped, hanging
      g(GEO.box, '#f4f1ea', { x: -0.22, y: -0.6, z: 0.008, sx: 0.07, sy: 0.12, sz: 0.004, rz: -0.25 });
      box('lawn-chair', [x - 0.3, y - 0.98, z - 0.05, x + 0.3, beamB, z + 0.06], { overhead: true }); }
  }

  // ---- by the east window display's back: two apple crates stacked (old bottles, a lantern), a roll of chicken wire on end
  {
    const cx = Ct.minX - 1.1, cz = iMinZ + 0.9, R = rng(103);
    const crate = (g, h) => {
      g.box(-0.3, 0, -0.17, 0.3, 0.015, 0.17, '#a8804f');
      for (const s of [-1, 1]) for (const y of [0.02, 0.15]) g.box(-0.3, y, s < 0 ? -0.18 : 0.16, 0.3, y + 0.1, s < 0 ? -0.16 : 0.18, '#c9a26b');
      for (const s of [-1, 1]) g.box(s < 0 ? -0.32 : 0.3, 0, -0.18, s < 0 ? -0.3 : 0.32, h, 0.18, '#b98a5a');
    };
    const g1 = framer(nb, cx, fy, cz, 0.04); crate(g1, 0.28);
    g1.box(-0.27, 0.015, -0.15, 0.27, 0.2, 0.15, '#6b5a4a');   // (what is in the bottom one: dark, under the top one)
    const g2 = framer(nb, cx + 0.02, fy + 0.28, cz - 0.01, -0.09); crate(g2, 0.28);
    for (let k = 0; k < 7; k++) g2(GEO.cyl8, ['#3f8a5a', '#8a5a3a', '#6fa8b8'][k % 3], { x: -0.22 + k * 0.07, y: 0.13 + R() * 0.04, z: (k % 2 - 0.5) * 0.12, sx: 0.03, sy: 0.24, sz: 0.03, rz: (R() - 0.5) * 0.3 });
    g2(GEO.cyl8, '#c0392b', { x: 0.18, y: 0.36, z: 0.05, sx: 0.06, sy: 0.04, sz: 0.06 });   // the lantern on its rim
    g2(GEO.cyl8, '#e8e2d6', { x: 0.18, y: 0.44, z: 0.05, sx: 0.045, sy: 0.12, sz: 0.045 });
    g2(GEO.cyl8, '#c0392b', { x: 0.18, y: 0.515, z: 0.05, sx: 0.05, sy: 0.03, sz: 0.05 });
    g2(new THREE.TorusGeometry(0.05, 0.004, 3, 8, Math.PI), '#3a3f47', { x: 0.18, y: 0.53, z: 0.05 });
    const wx = cx + 0.62, wz = cz - 0.02;
    f(GEO.cyl12, '#b8bec4', { x: wx, y: fy + 0.45, z: wz, sx: 0.16, sy: 0.9, sz: 0.16 });
    f(GEO.cyl12, '#5d636b', { x: wx, y: fy + 0.902, z: wz, sx: 0.13, sy: 0.006, sz: 0.13 });
    for (const y of [0.2, 0.5, 0.75]) f(new THREE.TorusGeometry(0.162, 0.004, 3, 12), '#8f969e', { x: wx, y: fy + y, z: wz, rx: Math.PI / 2 });
    colliders.push({ type: 'box', minX: cx - 0.34, maxX: wx + 0.18, minZ: cz - 0.2, maxZ: cz + 0.2 });
    box('apple-crate', [cx - 0.34, fy, cz - 0.2, cx + 0.36, fy + 0.84, cz + 0.2], { floor: true });
    box('chicken-wire', [wx - 0.17, fy, wz - 0.17, wx + 0.17, fy + 0.91, wz + 0.17], { floor: true });
  }

  // ---- high on the front wall west of the upper window: a wooden toboggan hung on end, a pair of old snowshoes
  {
    const z = wallN, x = iMinX + 0.65, y0 = fy + 2.95, H = 1.35;
    for (let k = 0; k < 4; k++) f.box(x - 0.2 + k * 0.1, y0, z + 0.004, x - 0.105 + k * 0.1, y0 + H, z + 0.022, k % 2 ? '#c9a26b' : '#b98a5a');
    f(new THREE.TorusGeometry(0.11, 0.009, 3, 8, Math.PI), '#b98a5a', { x, y: y0 + H, z: z + 0.11, ry: Math.PI / 2, sz: 22 });   // (the curl: the tube stretched the sled's width)
    for (const y of [0.2, 0.7, 1.2]) f.box(x - 0.22, y0 + y, z + 0.022, x + 0.22, y0 + y + 0.04, z + 0.04, '#7a5232');
    f(GEO.cyl6, '#c9b07a', { x, y: y0 + H - 0.05, z: z + 0.06, sx: 0.008, sy: 0.4, sz: 0.008, rz: Math.PI / 2 });
    box('toboggan', [x - 0.22, y0, z, x + 0.22, y0 + H + 0.12, z + 0.22], { wall: true });
    for (const [dx, dy] of [[0.48, 0.25], [0.74, 0.32]]) {
      const sxx = x + dx, sy = y0 + dy + 0.35;
      f(new THREE.TorusGeometry(0.12, 0.012, 3, 14), '#8a6240', { x: sxx, y: sy, z: z + 0.016, sy: 2.6 });
      for (let k = -2; k <= 2; k++) f.box(sxx - 0.1, sy + k * 0.08, z + 0.012, sxx + 0.1, sy + k * 0.08 + 0.006, z + 0.016, '#e8d8b0');
      f.box(sxx - 0.004, sy - 0.24, z + 0.012, sxx + 0.004, sy + 0.24, z + 0.016, '#e8d8b0');
      box('snowshoe', [sxx - 0.13, sy - 0.33, z, sxx + 0.13, sy + 0.33, z + 0.03], { wall: true });
    }
  }

  // ---- a two-man crosscut saw high on the east wall over the fishing rods
  {
    const za = Sh.z0 + 0.05, zb = za + 1.7, y = fy + 4.4, x = wallE - 0.008;
    f.box(x - 0.004, y - 0.06, za + 0.12, x, y + 0.06, zb - 0.12, STEEL);
    for (let z = za + 0.16; z < zb - 0.16; z += 0.06) f(GEO.box, '#8f969e', { x: x - 0.002, y: y - 0.082, z, sx: 0.003, sy: 0.03, sz: 0.03, rx: Math.PI / 4 });
    for (const z of [za + 0.06, zb - 0.06]) f.box(x - 0.03, y - 0.14, z - 0.025, x - 0.004, y + 0.14, z + 0.025, '#8a5a3a');
    for (const z of [za + 0.5, zb - 0.5]) f(GEO.cyl6, IRON, { x: wallE - 0.02, y: y + 0.07, z, sx: 0.004, sy: 0.04, sz: 0.004, rz: Math.PI / 2 });
    box('crosscut-saw', [x - 0.03, y - 0.14, za, wallE, y + 0.14, zb], { wall: true });
  }

  return items;
}
const sxOf = P => P.sx;
