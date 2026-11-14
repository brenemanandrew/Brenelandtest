// The ranch house's rooms, furnished (docs/refs/w3c-living-room-reference.html lays out the living room). The living room: the
// fireplace on the back wall with a black surround and mantle and the 65" TV over it, the tall window to its left with curtains,
// the deck's door to its right, the big sofa facing the fireplace and the loveseat against the wall beside it, Kevin's coffee table
// (two metal stands, a slab of shale), the area rug, three homemade hanging shelves of books, knick-knacks and wedding photos, the
// angled dresser in the corner by the hall with the mirror and the keys, the console with its lamp, a bookcase by the front door,
// and the oil-rubbed bronze ceiling fan. The kitchen (cherry cabinets, white counters, an island, a stainless fridge), the
// TARDIS-blue dining room, and the bedrooms and baths kept simple, a few pieces each.
// furnish(n, fine, colliders, mats) adds to the inside's batches (house-inside.js). The big dog bed is dog-beds.js's.
import { GEO } from './batch.js';
import { HOUSE, INDOOR_DOG_BED } from './layout.js';
import { lampGlow } from './daynight-mats.js';
import { FAN_BULB } from './living-light.js';
import { mulberry32 } from './util.js';
import { buildHearth } from './hearth-build.js';
import { SEAT_TOP, SEAT_FRONT, BACK_V, COUCH, BED_TOP, BED_MATTRESS } from './house-rest-spots.js';

const F = HOUSE.floorY, CY = HOUSE.ceilY;
const C = {
  cherry: '#8e3f22', cherry2: '#7a3419', counter: '#f3f0e8', steel: '#c3c8cb', steel2: '#9aa0a4', black: '#1d1d1f', bronze: '#3b2a20',
  sofa: '#d9cdb6', sofa2: '#cbbd9f', pillowA: '#9a5a2c', pillowB: '#3a8fa3', iron: '#2b2d2f', shale: '#55595c', shale2: '#6b7072',
  stone: '#c9c2b6', curtain: '#9a8f7c', pine: '#c09060', pine2: '#a87a4c', frame: '#2b2b2b', photo: '#e6d6b8', lampshade: '#f2e8d0',
  rug: '#5b6a73', bedding: '#f4f1ea', quilt: '#7f9fb8', quilt2: '#c27a7a', quilt3: '#8fa874', wood: '#9a7350', wood2: '#7a5a3c',
  white: '#f7f7f5', tub: '#fbfbf9', towel: '#d98c6a', towel2: '#6f9fb8', ember: '#ff8a3a', blue: '#173d6b',
};
// the living room's fireplace (hearth-build.js spec): the opening in the surround, facing into the room (north)
export const LIVING_HEARTH = { id: 'living', x: -0.9, y: F + 0.1, z: 5.39 - 0.32, nx: 0, nz: -1, w: 0.42, h: 0.7, d: 0.28 };
const BOOKS = ['#7a2b2b', '#2d4a6e', '#c9a24a', '#3f6b46', '#6a4c8a', '#b2502c', '#2b5f6b', '#8a6a2b'];

export function furnish(n, fine, colliders, mats) {
  const B = (x0, y0, z0, x1, y1, z1, c, b = n) => b.boxMinMax(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c);
  const add = (geo, c, o, b = n) => b.add(geo, c, o);
  const solid = (minX, maxX, minZ, maxZ) => colliders.push({ type: 'box', minX, maxX, minZ, maxZ, inner: true });
  const rnd = mulberry32(2026);
  // a bronze plate (an outlet low, a switch by a door) on a wall: axis 'x' = on a wall along x at z (s: which way it faces)
  const plate = (axis, at, s, a, y) => (axis === 'x' ? B(a - 0.04, y - 0.06, at, a + 0.04, y + 0.06, at + s * 0.012, C.bronze, fine) : B(at, y - 0.06, a - 0.04, at + s * 0.012, y + 0.06, a + 0.04, C.bronze, fine));

  // ================================================================ the living room (x -3.84..2.04, z -3.8..5.4)
  const LX = -0.9, BZ = 5.39; // the fireplace's middle, the back wall's face
  // the fireplace: a black surround standing out from the wall with the firebox in it (a grate and logs: hearth-build.js, the fire
  // fires.js's, lit and put out by whoever is there), a black mantle shelf, a stone hearth; the 65" TV over it
  const H = LIVING_HEARTH, fz = H.z, fb = BZ - 0.04, ow = H.w, oy = H.y, oh = H.y + H.h;
  B(LX - 0.8, F, fz, LX - ow, F + 1.15, BZ, C.black); B(LX + ow, F, fz, LX + 0.8, F + 1.15, BZ, C.black);
  B(LX - ow, oh, fz, LX + ow, F + 1.15, BZ, C.black);
  B(LX - ow, F, fz, LX + ow, oy, BZ, '#1a1718');                                     // the firebox's floor
  B(LX - ow, oy, fb, LX + ow, oh, BZ, '#1f1a1a');                                    // its back, sooty
  for (const s of [-1, 1]) B(LX + s * ow, oy, fz, LX + s * (ow - 0.012), oh, fb, '#241e1e'); // its sides (its top is the surround's)
  const embers = buildHearth(n, H);
  B(LX - 0.95, F + 1.15, fz - 0.1, LX + 0.95, F + 1.23, BZ, C.black);
  B(LX - 1.0, F, BZ - 0.85, LX + 1.0, F + 0.04, BZ, C.stone);
  solid(LX - 1.0, LX + 1.0, BZ - 0.85, BZ);
  B(LX - 0.73, F + 1.5, BZ - 0.06, LX + 0.73, F + 2.32, BZ, C.black);
  B(LX - 0.69, F + 1.54, BZ - 0.065, LX + 0.69, F + 2.28, BZ - 0.06, '#22313d');
  for (const [k, c] of [[-0.75, '#c9a24a'], [0.7, '#3f6b46']]) add(GEO.cyl8, c, { x: LX + k, y: F + 1.33, z: BZ - 0.15, sx: 0.06, sy: 0.2, sz: 0.06 }); // two things on the mantle
  // the tall window's curtains and rod (the window is house.js's, x 0..1.1)
  for (const [x0, x1] of [[-0.33, -0.05], [1.15, 1.43]]) for (let i = 0; i < 3; i++) B(x0 + i * (x1 - x0) / 3, F + 0.05, BZ - 0.12 - (i % 2) * 0.03, x0 + (i + 1) * (x1 - x0) / 3, F + 2.62, BZ - 0.05, i % 2 ? C.curtain : '#8a806e');
  add(GEO.cyl8, C.bronze, { x: 0.55, y: F + 2.66, z: BZ - 0.1, sx: 0.018, sy: 1.9, sz: 0.018, rz: Math.PI / 2 }, fine);
  // the sofa facing the fireplace, the loveseat against the east wall beside it. Sized to our people (house-scale, house-rest-spots.js):
  // the seat at SEAT_TOP (the feet reach the floor), the cushions' front edge SEAT_FRONT where the knees bend, the arms and back low
  // enough that a sitter's shoulders clear them
  const sofa = (cx, cz, len, ry) => { // ry 0: faces +z (its back toward -z); 'w': faces -x
    const R = (u0, y0, v0, u1, y1, v1, c) => { // u along the sofa, v front (+) to back (-), in its frame
      if (ry === 0) B(cx + u0, y0, cz + v0, cx + u1, y1, cz + v1, c); else B(cx - v0, y0, cz + u0, cx - v1, y1, cz + u1, c);
    };
    const K = COUCH, sb = F + K.base, st = F + SEAT_TOP;
    R(-len / 2, F, K.back, len / 2, sb, SEAT_FRONT - 0.07, C.sofa);                           // the base (its front 7 cm in under the cushions': the calves)
    const nc = Math.round(len / 0.8);
    for (let i = 0; i < nc; i++) {
      const u0 = -len / 2 + 0.03 + (i * (len - 0.06)) / nc, u1 = u0 + (len - 0.06) / nc - 0.03;
      R(u0, sb, BACK_V, u1, st, SEAT_FRONT, C.sofa2);                                 // a seat cushion
      R(u0, st, K.back + 0.1, u1, F + K.backTop, BACK_V, C.sofa2);                          // its back cushion
    }
    R(-len / 2, sb, K.back, len / 2, F + K.frameTop, K.back + 0.12, C.sofa);                  // the frame behind the back cushions
    for (const s of [-1, 1]) R(s > 0 ? len / 2 : -len / 2 - K.armW, F, K.back, s > 0 ? len / 2 + K.armW : -len / 2, F + K.armTop, K.armFront, C.sofa);
    if (ry === 0) solid(cx - len / 2 - K.armW, cx + len / 2 + K.armW, cz + K.back, cz + K.armFront); else solid(cx - K.armFront, cx - K.back, cz - len / 2 - K.armW, cz + len / 2 + K.armW);
    // a throw pillow in each corner, against the arm and the back cushion (out of the sitters' way)
    const py = F + SEAT_TOP + 0.15, pv = BACK_V + 0.06;
    for (const s of [-1, 1]) {
      if (ry === 0) add(GEO.box, s < 0 ? C.pillowA : C.pillowB, { x: cx + s * (len / 2 - 0.11), y: py, z: cz + pv, sx: 0.18, sy: 0.26, sz: 0.1, rx: -0.22, rz: s * 0.1 });
      else add(GEO.box, s < 0 ? C.pillowB : C.pillowA, { x: cx - pv, y: py, z: cz + s * (len / 2 - 0.11), sx: 0.1, sy: 0.26, sz: 0.18, rz: -0.22, rx: -s * 0.1 });
    }
  };
  sofa(LX, 1.05, 2.5, 0);
  sofa(1.57, 2.55, 1.6, 'w'); // its far end clear of the big dog bed in the corner
  // the area rug and Kevin's coffee table: two black metal stands, a big slab of shale on top
  B(LX - 1.5, F + 0.004, 1.75, LX + 1.5, F + 0.014, 4.15, mats.rug);
  for (const dx of [-0.42, 0.42]) {
    const sx = LX + dx;
    for (const dz of [-0.22, 0.22]) B(sx - 0.025, F, 2.75 + dz - 0.025, sx + 0.025, F + 0.33, 2.75 + dz + 0.025, C.iron);
    B(sx - 0.03, F + 0.02, 2.48, sx + 0.03, F + 0.06, 3.02, C.iron); B(sx - 0.03, F + 0.29, 2.48, sx + 0.03, F + 0.33, 3.02, C.iron);
  }
  add(GEO.cyl8, C.shale, { x: LX, y: F + 0.365, z: 2.75, sx: 0.66, sy: 0.07, sz: 0.38, ry: 0.2 });
  add(GEO.cyl8, C.shale2, { x: LX + 0.05, y: F + 0.405, z: 2.73, sx: 0.5, sy: 0.012, sz: 0.27, ry: 0.5 }, fine);
  solid(LX - 0.62, LX + 0.62, 2.42, 3.08);
  // the three homemade hanging shelves: pine boards on rods from bronze hooks, books, a knick-knack, wedding photos
  const shelf = (axis, at, s, a0, a1, y0, seed) => { // axis 'z': on a wall at x = at, facing s (+1 = +x); 'x': on a wall at z = at
    const r = mulberry32(seed);
    const P = (u0, y0, d0, u1, y1, d1, c, b = n) => (axis === 'z' ? B(at + s * d0, y0, u0, at + s * d1, y1, u1, c, b) : B(u0, y0, at + s * d0, u1, y1, at + s * d1, c, b));
    for (let t = 0; t < 3; t++) {
      const y = y0 + t * 0.4;
      P(a0, y, 0.02, a1, y + 0.035, 0.26, t % 2 ? C.pine2 : C.pine);
      let u = a0 + 0.06, k = 0;
      while (u < a1 - 0.28) {
        if (k === 4 || k === 9) { // a wedding photo, or a little vase
          if ((t + k) % 2) { P(u, y + 0.035, 0.05, u + 0.17, y + 0.26, 0.07, C.frame); P(u + 0.02, y + 0.06, 0.07, u + 0.15, y + 0.24, 0.075, C.photo, fine); u += 0.24; }
          else { const z = axis === 'z' ? { x: at + s * 0.15, z: u + 0.06 } : { x: u + 0.06, z: at + s * 0.15 }; add(GEO.cyl8, '#7fa3a8', { x: z.x, y: y + 0.11, z: z.z, sx: 0.05, sy: 0.15, sz: 0.05 }); u += 0.18; }
        } else { const w = 0.045 + r() * 0.035, h = 0.19 + r() * 0.09; P(u, y + 0.035, 0.06, u + w, y + 0.035 + h, 0.22, BOOKS[Math.floor(r() * BOOKS.length)]); u += w + 0.006; }
        k++;
      }
      P(a1 - 0.2, y + 0.035, 0.05, a1 - 0.04, y + 0.25, 0.07, C.frame); P(a1 - 0.18, y + 0.06, 0.07, a1 - 0.06, y + 0.23, 0.075, C.photo, fine);
    }
    // the rods sit a little proud of the books' spines and below the bottom board (in line with them, the two flickered)
    for (const u of [a0 + 0.05, a1 - 0.07]) { P(u, y0 - 0.02, 0.223, u + 0.02, y0 + 1.1, 0.243, '#6b5a3e', fine); P(u - 0.02, y0 + 1.1, 0.0, u + 0.04, y0 + 1.16, 0.243, C.bronze); }
  };
  shelf('z', -3.84, 1, 2.1, 3.5, F + 1.0, 11);
  shelf('z', -3.84, 1, 3.75, 5.1, F + 1.0, 12);
  shelf('x', -3.8, 1, -2.25, -1.05, F + 1.45, 13);
  // the console with its lamp under the front shelf, the bookcase by the front corner
  B(-2.2, F, -3.8, -1.1, F + 0.76, -3.42, C.cherry);
  B(-2.15, F + 0.1, -3.43, -1.15, F + 0.12, -3.41, C.cherry2, fine);
  add(GEO.cyl8, C.bronze, { x: -1.95, y: F + 0.95, z: -3.6, sx: 0.07, sy: 0.38, sz: 0.07 });
  add(GEO.cone8, FAN_BULB, { x: -1.95, y: F + 1.23, z: -3.6, sx: 0.18, sy: 0.24, sz: 0.18 });
  solid(-2.2, -1.1, -3.8, -3.42);
  B(-3.84, F, -3.75, -3.46, F + 1.9, -2.98, C.cherry);
  for (let t = 0; t < 4; t++) {
    const y = F + 0.12 + t * 0.44;
    B(-3.48, y, -3.71, -3.45, y + 0.02, -3.02, C.cherry2, fine);
    let z = -3.7; while (z < -3.12) { const w = 0.05 + rnd() * 0.035; B(-3.82, y + 0.02, z, -3.52, y + 0.02 + 0.22 + rnd() * 0.12, z + w, BOOKS[Math.floor(rnd() * BOOKS.length)]); z += w + 0.006; }
  }
  solid(-3.84, -3.44, -3.76, -2.97);
  // the small dresser at an angle in the corner by the hall, the mirror over it and the keys on hooks under the mirror
  {
    const cx = 1.55, cz = -3.31, ry = -Math.PI / 4, xa = [Math.cos(ry), -Math.sin(ry)], fa = [Math.sin(ry), Math.cos(ry)]; // its front faces into the room
    const put = (u, y, f, sx, sy, sz, c, b = n) => add(GEO.box, c, { x: cx + xa[0] * u + fa[0] * f, y, z: cz + xa[1] * u + fa[1] * f, sx, sy, sz, ry }, b);
    put(0, F + 0.4, 0, 0.95, 0.8, 0.42, C.cherry);
    for (let r = 0; r < 3; r++) { put(0, F + 0.15 + r * 0.24, 0.215, 0.86, 0.2, 0.02, C.cherry2, fine); put(0, F + 0.15 + r * 0.24, 0.23, 0.14, 0.02, 0.02, C.bronze, fine); }
    put(0, F + 1.62, -0.19, 0.62, 0.78, 0.04, '#3a2a1e');
    put(0, F + 1.62, -0.165, 0.52, 0.66, 0.012, '#c8d6e0');
    put(0, F + 1.16, -0.18, 0.62, 0.05, 0.04, '#3a2a1e');
    for (let i = 0; i < 4; i++) { put(-0.21 + i * 0.14, F + 1.12, -0.15, 0.02, 0.05, 0.03, C.bronze, fine); put(-0.21 + i * 0.14, F + 1.05, -0.14, 0.035, 0.07, 0.01, i % 2 ? '#c9ccce' : '#d9b04a', fine); }
    add(GEO.cyl8, '#d9c7a4', { x: cx + xa[0] * 0.28, y: F + 0.9, z: cz + xa[1] * 0.28, sx: 0.11, sy: 0.2, sz: 0.11 });
    solid(cx - 0.5, cx + 0.5, cz - 0.5, cz + 0.5);
  }
  // the ceiling fan over the seating (oil-rubbed bronze, the blades too) and its light (off 10 pm-7 am with the console lamp: FAN_BULB, living-light.js)
  {
    const fx = LX, fz = 1.4, top = F + 4.42, y = top - 0.7;
    add(GEO.cyl8, C.bronze, { x: fx, y: (top + y) / 2, z: fz, sx: 0.02, sy: top - y, sz: 0.02 });
    add(GEO.cyl12, C.bronze, { x: fx, y, z: fz, sx: 0.15, sy: 0.16, sz: 0.15 });
    add(GEO.sphere, FAN_BULB, { x: fx, y: y - 0.12, z: fz, sx: 0.13, sy: 0.09, sz: 0.13 });
    for (let i = 0; i < 5; i++) { const ang = (i * Math.PI * 2) / 5; add(GEO.box, '#4a3526', { x: fx + Math.cos(ang) * 0.48, y: y + 0.03, z: fz + Math.sin(ang) * 0.48, sx: 0.66, sy: 0.015, sz: 0.14, ry: -ang }); }
  }
  // outlets and switch plates in rubbed bronze
  plate('x', -3.8 + 0.015, 1, 0.9, F + 1.2); plate('x', -3.8 + 0.015, 1, -2.6, F + 0.3); plate('x', 5.39 - 0.015, -1, -2.25, F + 1.2);
  plate('x', 5.39 - 0.015, -1, 1.5, F + 0.3); plate('z', 2.04 - 0.015, -1, 1.2, F + 0.3); plate('z', -3.84 + 0.015, 1, 1.2, F + 0.3);

  // ================================================================ the kitchen (cherry, white counters, stainless, tile)
  {
    const wx = -9.18, base = (x0, z0, x1, z1) => { B(x0, F, z0, x1, F + 0.86, z1, C.cherry); };
    // the run along the west wall, a range in it, uppers above
    base(wx, -1.32, wx + 0.62, 1.5); B(wx, F + 0.86, -1.32, wx + 0.66, F + 0.91, 1.5, C.counter);
    B(wx + 0.003, F, -0.05, wx + 0.64, F + 0.9, 0.7, C.black); // (its back 3 mm off the cabinets')
    B(wx + 0.05, F + 0.913, 0.0, wx + 0.6, F + 0.933, 0.65, '#2a2a2c'); // the cooktop, 3 mm off the counter
    B(wx, F + 1.62, -0.02, wx + 0.5, F + 1.85, 0.72, C.steel2);
    for (const [z0, z1] of [[-1.32, -0.05], [0.72, 1.5]]) B(wx, F + 1.45, z0, wx + 0.36, F + 2.2, z1, C.cherry);
    for (let z = -1.0; z < 1.5; z += 0.62) fine.boxMinMax(wx + 0.62, F + 0.1, z, wx + 0.63, F + 0.78, z + 0.01, C.cherry2);
    solid(wx, wx + 0.66, -1.32, 1.5);
    // the run along the front wall with the sink under the window, uppers either side
    base(-7.12, -3.78, -4.72, -3.18); B(-7.12, F + 0.86, -3.78, -4.72, F + 0.91, -3.14, C.counter);
    B(-6.25, F + 0.86, -3.68, -5.55, F + 0.915, -3.32, C.steel);
    add(GEO.cyl8, C.steel, { x: -5.9, y: F + 1.05, z: -3.66, sx: 0.02, sy: 0.3, sz: 0.02 });
    for (const [x0, x1] of [[-7.12, -6.55], [-5.25, -4.72]]) B(x0, F + 1.45, -3.78, x1, F + 2.2, -3.42, C.cherry);
    solid(-7.12, -4.72, -3.8, -3.14);
    // the stainless fridge at the front, by the opening to the living room
    B(-4.68, F, -3.78, -3.98, F + 1.85, -3.02, C.steel);
    fine.boxMinMax(-4.34, F + 0.05, -3.025, -4.32, F + 1.8, -3.015, C.steel2);
    for (const x of [-4.4, -4.26]) B(x - 0.015, F + 0.8, -3.02, x + 0.015, F + 1.3, -2.99, C.steel2);
    solid(-4.7, -3.96, -3.8, -3.0);
    // the island with two stools, and the pendant lights over it
    B(-7.0, F, -1.35, -5.4, F + 0.86, -0.45, C.cherry); B(-7.08, F + 0.86, -1.43, -5.32, F + 0.91, -0.37, C.counter);
    solid(-7.08, -5.32, -1.43, -0.37);
    for (const x of [-6.6, -5.8]) {
      add(GEO.cyl8, C.cherry2, { x, y: F + 0.66, z: -0.08, sx: 0.18, sy: 0.04, sz: 0.18 });
      add(GEO.cyl6, C.bronze, { x, y: F + 0.33, z: -0.08, sx: 0.03, sy: 0.66, sz: 0.03 });
      add(GEO.cyl6, C.bronze, { x, y: (CY + F + 1.85) / 2, z: -0.9, sx: 0.012, sy: CY - F - 1.85, sz: 0.012 }, fine);
      add(GEO.cone8, lampGlow('#f6dca0'), { x, y: F + 1.78, z: -0.9, sx: 0.14, sy: 0.18, sz: 0.14 });
    }
  }
  // the laundry: washer and dryer on the inside wall, a shelf over them
  B(-9.12, F, -2.05, -8.52, F + 0.9, -1.46, C.white); B(-8.48, F, -2.05, -7.88, F + 0.9, -1.46, C.white);
  for (const x of [-8.82, -8.18]) add(GEO.cyl12, '#b9c3c8', { x, y: F + 0.5, z: -2.06, sx: 0.2, sy: 0.02, sz: 0.2, rx: Math.PI / 2 }, fine);
  B(-9.18, F + 1.55, -1.75, -7.86, F + 1.58, -1.46, C.wood);
  B(-8.9, F + 1.58, -1.7, -8.6, F + 1.8, -1.52, '#e0b040'); B(-8.4, F + 1.58, -1.7, -8.15, F + 1.75, -1.52, '#4f8fbf');
  solid(-9.2, -7.86, -2.08, -1.4);

  // ================================================================ the dining room (TARDIS blue): a cherry table, six chairs, a light
  {
    const tx = -6.6, tz = 3.5;
    // (seat-height: the chairs' seats 0.3 up, were 0.45; the table's top down as far, 0.63, was 0.78: table-games/tables.js)
    B(tx - 0.95, F + 0.58, tz - 0.5, tx + 0.95, F + 0.63, tz + 0.5, C.cherry);
    for (const [dx, dz] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) B(tx + dx - 0.035, F, tz + dz - 0.035, tx + dx + 0.035, F + 0.58, tz + dz + 0.035, C.cherry2);
    solid(tx - 0.95, tx + 0.95, tz - 0.5, tz + 0.5);
    const chair = (x, z, fx, fz) => { // facing (fx, fz): the back on the far side
      B(x - 0.22, F + 0.26, z - 0.22, x + 0.22, F + 0.3, z + 0.22, C.cherry);
      const bx = x - fx * 0.2, bz = z - fz * 0.2, hx = fx ? 0.02 : 0.22, hz = fz ? 0.02 : 0.22;
      B(bx - hx, F + 0.3, bz - hz, bx + hx, F + 0.8, bz + hz, C.cherry2);
      for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) B(x + a - 0.02, F, z + b - 0.02, x + a + 0.02, F + 0.26, z + b + 0.02, C.cherry2);
    };
    for (const dx of [-0.5, 0.5]) { chair(tx + dx, tz - 0.78, 0, 1); chair(tx + dx, tz + 0.78, 0, -1); }
    chair(tx - 1.25, tz, 1, 0); chair(tx + 1.25, tz, -1, 0);
    add(GEO.cyl8, C.bronze, { x: tx, y: (CY + F + 2.05) / 2, z: tz, sx: 0.012, sy: CY - F - 2.05, sz: 0.012 }, fine);
    add(GEO.cyl12, C.bronze, { x: tx, y: F + 2.0, z: tz, sx: 0.32, sy: 0.1, sz: 0.32 });
    add(GEO.cyl12, lampGlow('#f6dca0'), { x: tx, y: F + 1.94, z: tz, sx: 0.26, sy: 0.03, sz: 0.26 });
    B(-9.18, F, 2.0, -8.75, F + 0.82, 3.4, C.cherry); B(-9.18, F + 0.82, 2.0, -8.72, F + 0.86, 3.4, C.counter); solid(-9.2, -8.72, 2.0, 3.4); // a sideboard
    for (const [z, c] of [[2.3, '#e8c870'], [2.9, '#f3f0e8']]) add(GEO.cyl8, c, { x: -8.95, y: F + 0.98, z, sx: 0.07, sy: 0.22, sz: 0.07 });
  }

  // ================================================================ the hall, the bedrooms and the baths (simple, a few pieces each)
  B(2.4, F + 0.004, -0.32, 8.1, F + 0.012, 0.32, '#8a3a32');                          // the hall's runner
  B(7.6, F + 1.2, 0.53, 8.2, F + 1.75, 0.54, C.frame); B(7.65, F + 1.25, 0.525, 8.15, F + 1.7, 0.53, '#7fb3d9', fine); // a picture
  const bed = (x0, z0, x1, z1, head, quilt) => { // (house-scale: the quilt's top BED_TOP, the mattress BED_MATTRESS; house-rest-spots.js)
    const fr = BED_MATTRESS - 0.24, qt = BED_TOP, pl = BED_MATTRESS + 0.07;
    B(x0, F, z0, x1, F + fr, z1, C.wood2);
    B(x0 + 0.03, F + fr, z0 + 0.03, x1 - 0.03, F + BED_MATTRESS, z1 - 0.03, C.bedding);
    const qz0 = head === 'z+' ? z0 : z0, qz1 = head === 'z+' ? z1 - 0.55 : z1, qx0 = head === 'x-' ? x0 + 0.55 : x0, qx1 = head === 'x+' ? x1 - 0.55 : x1;
    B(qx0 - 0.01, F + qt - 0.16, qz0 - 0.01, qx1 + 0.01, F + qt, qz1 + 0.01, quilt);
    if (head === 'z+') { B(x0 - 0.05, F, z1 - 0.06, x1 + 0.05, F + 1.0, z1, C.wood2); for (const k of [0.3, 0.7]) add(GEO.box, C.white, { x: x0 + (x1 - x0) * k, y: F + pl, z: z1 - 0.33, sx: (x1 - x0) * 0.36, sy: 0.14, sz: 0.36 }); }
    else { const hx = head === 'x-' ? x0 : x1, s = head === 'x-' ? 1 : -1; B(hx, F, z0 - 0.05, hx + s * 0.06, F + 0.95, z1 + 0.05, C.wood2); for (const k of z1 - z0 > 1.2 ? [0.3, 0.7] : [0.5]) add(GEO.box, C.white, { x: hx + s * 0.33, y: F + pl, z: z0 + (z1 - z0) * k, sx: 0.36, sy: 0.14, sz: (z1 - z0) * 0.36 }); }
    solid(x0 - 0.05, x1 + 0.05, z0 - 0.05, z1 + 0.05);
  };
  const night = (x, z) => { B(x - 0.24, F, z - 0.2, x + 0.24, F + 0.5, z + 0.2, C.wood); add(GEO.cyl8, C.bronze, { x, y: F + 0.63, z, sx: 0.05, sy: 0.26, sz: 0.05 }); add(GEO.cone8, lampGlow('#f6e3bd'), { x, y: F + 0.83, z, sx: 0.14, sy: 0.18, sz: 0.14 }); solid(x - 0.25, x + 0.25, z - 0.21, z + 0.21); };
  const dresser = (x0, z0, x1, z1) => { B(x0, F, z0, x1, F + 0.85, z1, C.wood); solid(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)); };
  // the main bedroom: a queen bed against the back wall (the log-off bed: layout HOUSE_PLAN.bed), nightstands with lamps, a dresser
  bed(5.9, 3.3, 7.5, 5.39, 'z+', C.quilt);
  night(5.6, 5.1); night(7.8, 5.1);
  dresser(4.97, 1.15, 5.42, 2.2);
  B(5.6, F + 0.004, 2.7, 7.8, F + 0.012, 3.4, '#b9a98c');
  // bedroom 2 (front): a full bed against the inside wall, a nightstand, a dresser under the side window
  bed(4.37, -3.1, 6.3, -1.6, 'x-', C.quilt2);
  night(4.62, -1.25); dresser(7.95, -3.6, 8.38, -2.88); // clear of the window's stool
  // bedroom 3 (back): a twin bed against the living room's wall, a desk with a chair by the window
  bed(2.17, 3.0, 4.15, 4.1, 'x-', C.quilt3);
  B(3.0, F + 0.72, 4.98, 4.2, F + 0.76, 5.38, C.wood); for (const x of [3.04, 4.12]) B(x, F, 5.0, x + 0.05, F + 0.72, 5.36, C.wood2); solid(3.0, 4.2, 4.95, 5.4);
  // the hall bath: a tub under the window, a toilet, a vanity
  const tub = (x0, z0, x1, z1) => { B(x0, F, z0, x1, F + 0.55, z1, C.tub); B(x0 + 0.08, F + 0.5, z0 + 0.08, x1 - 0.08, F + 0.56, z1 - 0.08, '#cfe0e6'); solid(x0, x1, z0, z1); };
  const toilet = (x, z, fx, fz) => { // facing (fx, fz): the tank behind
    add(GEO.cyl12, C.white, { x, y: F + 0.2, z, sx: 0.2, sy: 0.4, sz: 0.24 });
    const tx = x - fx * 0.24, tz = z - fz * 0.24, hx = fx ? 0.1 : 0.22, hz = fz ? 0.1 : 0.22;
    B(tx - hx, F + 0.35, tz - hz, tx + hx, F + 0.8, tz + hz, C.white); solid(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
  };
  const vanity = (x0, z0, x1, z1) => { B(x0, F, z0, x1, F + 0.82, z1, C.wood); B(x0, F + 0.82, z0, x1, F + 0.86, z1, C.counter); solid(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)); };
  tub(2.17, -3.79, 3.87, -3.05);
  toilet(3.95, -2.4, -1, 0);
  vanity(2.17, -2.55, 2.72, -1.3); B(2.165, F + 1.05, -2.45, 2.18, F + 1.85, -1.4, '#c8d6e0', fine);
  B(4.22, F + 1.3, -1.6, 4.23, F + 1.32, -1.0, C.bronze, fine); B(4.15, F + 0.9, -1.55, 4.22, F + 1.3, -1.05, C.towel, fine);
  // the main bath: a shower, a toilet, a vanity
  B(7.4, F, 1.82, 8.38, F + 2.1, 2.53, '#e8eef0'); B(7.42, F + 0.02, 1.84, 8.36, F + 2.08, 1.86, '#bcd6de'); solid(7.4, 8.4, 1.8, 2.55);
  toilet(8.1, 1.15, -1, 0);
  vanity(7.0, 0.67, 7.5, 1.6); B(6.98, F + 1.05, 0.75, 6.985, F + 1.8, 1.2, '#c8d6e0', fine); // the mirror short of the door's casing
  // the big dog bed's spot is kept clear (dog-beds.js builds it)
  void INDOOR_DOG_BED;
  return { embers };
}
