// The lakeside firepit, as built: a stone ring on a worn dirt circle, four camp chairs and two logs to sit on, a woodpile,
// a cooler, a lantern, string lights and marshmallows. areas.js PLACEHOLDERS.firepit calls buildFirepit at the campfire
// slot (games.json "Lakeside Firepit", by Lake Rufallia), and firepit.js lights it and sits people in it. The static parts
// go into the area batch, the fire is campfire.js with `fuel`. It returns `seats` and `centre` for the scenic view.
// Everything is built from the slot centre, so it moves with the slot.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { GEO } from './batch.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { toon } from './toon.js';
import { terrainHeight } from './terrain.js';
import { limb } from './world-trees.js';
import { buildCampfire } from './campfire.js';
import { LAMPS, lampGlow, addNightSpot } from './daynight-mats.js';

const DEG = Math.PI / 180;

// A folding camp chair (the same build and size as Buddy's at the booth: low and roomy for cartoon legs), in its own frame:
// x across, y up from the ground, z forward (the way a sitter faces). seatY = the fabric's top (where the sit pose puts
// the hips), W = half width to the side tubes, zf / zb = the front and back rails, armY = the armrests' top.
// sit: the sitter's spot is this far forward of the chair's middle (a player's thighs are shorter than Buddy's: the knees
// then bend past the front rail, not on it). Narrower than his (W) so a player's forearms reach the armrests.
export const CAMP_CHAIR = { seatY: 0.3, W: 0.42, zf: 0.18, zb: -0.2, armY: 0.705, armZ: [-0.25, 0.32], sit: 0.08 };
export const LOG_SEAT = { seatY: 0.3, r: 0.14, len: 1.75, front: 0.19 }; // (seat-height: the plank 0.3 up on a slimmer log, was 0.4 on 0.19) // front: the sitter's spot ahead of the log's axis (the shins hang clear of it)
// The chair's solid parts as boxes in its own frame (as buddy-day.js chairBoxes): the test checks no bone of a sitter
// passes through them.
export function campChairBoxes() {
  const { W, zf: F, zb: B, seatY: S, armY: A, armZ: Z } = CAMP_CHAIR, t = 0.03, out = [];
  out.push({ name: 'front X', x0: -W - t, x1: W + t, y0: 0, y1: S - 0.04, z0: F - t, z1: F + t }, { name: 'back X', x0: -W - t, x1: W + t, y0: 0, y1: S - 0.04, z0: B - t, z1: B + t });
  out.push({ name: 'seat', x0: -W, x1: W, y0: S - 0.07, y1: S - 0.005, z0: B, z1: F }, { name: 'back', x0: -W, x1: W, y0: S + 0.08, y1: S + 0.64, z0: B - 0.24, z1: B - 0.07 });
  for (const s of [-1, 1]) {
    const x0 = s * W - t, x1 = s * W + t;
    out.push({ name: 'side X', x0, x1, y0: 0, y1: S - 0.04, z0: B, z1: F }, { name: 'front post', x0, x1, y0: 0, y1: A - 0.05, z0: F - t, z1: F + t },
      { name: 'armrest', x0: s * W - 0.045, x1: s * W + 0.045, y0: A - 0.065, y1: A - 0.005, z0: Z[0], z1: Z[1] });
  }
  return out;
}

// The plan, from the slot centre: angles in the atan2-free convention x = cos(a), z = sin(a) (0 = east, 90 = south).
export const PLAN = {
  dirtR: 4.1,                         // the worn circle round the pit
  // (far enough out to walk round easily, and turned so the path from the park gate, layout.js TRAILS 'firepit', comes in
  //  between the orange chair and the north log, under the string lights)
  chairR: 2.9, chairs: [[-14, 'red'], [50, 'green'], [166, 'blue'], [230, 'orange']],
  logR: 3.1, logs: [108, 288],        // south (the lake behind it) and north (toward the house)
  cooler: [18, 3.25], stump: [198, 3.25], wood: [58, 5.0], sticks: [110, 1.95],
  poles: [[223, 5.7], [283, 5.9], [343, 5.7]], // the string lights on the house side (north), the lake open to the south
};
const COLOURS = {
  red: ['#d9453a', '#9c2a24'], green: ['#3f9a5a', '#2a6b3d'], blue: ['#2f6fb8', '#1f477a'], orange: ['#ef8a2a', '#b5611a'],
};
const TUBE = '#4a4f57';

// world position of a point in a frame at (ox, oz) facing yaw (z forward): x across, z forward
const frame = (ox, oz, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c]; };

function campChair(b, x, y, z, yaw, colour, drink) {
  const { seatY, W, zf: ZF, zb: ZB, armY, armZ } = CAMP_CHAIR, [FAB, EDGE] = COLOURS[colour];
  const at = frame(x, z, yaw);
  const P = (lx, ly, lz) => { const [wx, wz] = at(lx, lz); return [wx, y + ly, wz]; };
  const bar = (a, c, r = 0.017, col = TUBE) => limb(b, col, P(...a), P(...c), r);
  const box = (col, lx, ly, lz, sx, sy, sz, rx = 0) => { const [wx, wz] = at(lx, lz); b.add(GEO.box, col, { x: wx, y: y + ly, z: wz, sx, sy, sz, ry: yaw, rx }); };
  const AY = armY - 0.045;
  for (const s of [-1, 1]) {
    bar([s * W, 0.01, ZF], [s * W, AY, ZF]);                          // front post up to the armrest
    bar([s * W, 0.01, ZB], [s * W * 0.98, 1.06, ZB - 0.15]);          // back post up the back
    bar([s * W, 0.02, ZB], [s * W, seatY - 0.02, ZF]); bar([s * W, 0.02, ZF], [s * W, seatY - 0.02, ZB]); // the side X
    for (const lz of [ZF, ZB]) box('#2b2b2f', s * W, 0.012, lz, 0.05, 0.024, 0.05);
    bar([s * W, AY, armZ[0] + 0.01], [s * W, AY, ZF + 0.02], 0.016);    // armrest tube (its back end inside the pad, not level with the pad's end)
    box(EDGE, s * W, armY - 0.0225, (armZ[0] + armZ[1]) / 2, 0.085, 0.045, armZ[1] - armZ[0]); // padded armrest
  }
  for (const lz of [ZF, ZB]) { bar([-W, 0.02, lz], [W, seatY - 0.03, lz]); bar([W, 0.02, lz], [-W, seatY - 0.03, lz]); } // front and back X
  bar([-W, seatY - 0.03, ZF], [W, seatY - 0.03, ZF], 0.015); bar([-W, seatY - 0.03, ZB], [W, seatY - 0.03, ZB], 0.015);
  // the fabric seat and back, with a darker hem
  box(FAB, 0, seatY - 0.035, (ZF + ZB) / 2, 2 * W + 0.02, 0.07, ZF - ZB + 0.02);
  box(EDGE, 0, seatY - 0.02, ZF + 0.012, 2 * W + 0.03, 0.05, 0.03);
  for (const s of [-1, 1]) box(EDGE, s * (W + 0.005), seatY - 0.02, (ZF + ZB) / 2, 0.03, 0.06, ZF - ZB + 0.04); // (a centimetre past the seat's ends: level with them, they flickered)
  box(FAB, 0, seatY + 0.35, ZB - 0.08, 2 * W - 0.01, 0.6, 0.04, -0.24);
  box(EDGE, 0, seatY + 0.66, ZB - 0.155, 2 * W + 0.02, 0.05, 0.05, -0.24);
  // a mesh cup holder off the right armrest (the sitter's right: -x) with a drink in it
  const cx = -W - 0.1, cz = armZ[1] - 0.12;
  box(FAB, cx, armY - 0.065, cz, 0.12, 0.12, 0.12);
  { const [wx, wz] = at(cx, cz); b.add(GEO.cyl8, drink, { x: wx, y: y + armY + 0.03, z: wz, sx: 0.036, sy: 0.12, sz: 0.036 }); }
}

// The firewood: split logs stacked between two pairs of stakes, a chopping stump beside it.
function woodpile(b, x, y, z, yaw, colliders) {
  const at = frame(x, z, yaw);
  const rows = [[0.0, 5], [0.17, 4], [0.33, 4], [0.48, 3]];
  let k = 0;
  for (const [ly, n] of rows) for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.2 + (ly > 0.3 ? 0.04 : 0), [wx, wz] = at(lx, 0);
    // each log end shows its pale cut face: the bark log, then a disc at each end
    b.add(GEO.cyl8, k % 3 ? '#7a5234' : '#8b5e3a', { x: wx, y: y + 0.1 + ly, z: wz, sx: 0.09, sy: 0.9, sz: 0.09, rx: Math.PI / 2, ry: yaw + (k % 2 ? 0.05 : -0.04) });
    for (const e of [-1, 1]) { const [ex, ez] = at(lx, e * 0.452); b.add(GEO.cyl8, '#d9b47e', { x: ex, y: y + 0.1 + ly, z: ez, sx: 0.075, sy: 0.012, sz: 0.075, rx: Math.PI / 2, ry: yaw }); }
    k++;
  }
  for (const s of [-1, 1]) for (const e of [-0.3, 0.3]) { const [wx, wz] = at(s * 0.58, e); b.add(GEO.box, '#5e4128', { x: wx, y: y + 0.38, z: wz, sx: 0.06, sy: 0.76, sz: 0.06, ry: yaw }); }
  // the stump, a split log waiting on it
  const [sx, sz] = at(1.15, 0.2);
  b.add(GEO.cyl8, '#7a5234', { x: sx, y: y + 0.22, z: sz, sx: 0.28, sy: 0.44, sz: 0.28 });
  b.add(GEO.cyl8, '#d9b47e', { x: sx, y: y + 0.445, z: sz, sx: 0.25, sy: 0.01, sz: 0.25 });
  b.add(GEO.cyl8, '#8b5e3a', { x: sx, y: y + 0.53, z: sz, sx: 0.08, sy: 0.38, sz: 0.08, rz: Math.PI / 2, ry: yaw + 0.75 }); // (turned a touch more: an end was in the plane of a stump side)
  const [cx, cz] = at(0, 0);
  colliders.push({ type: 'circle', x: cx, z: cz, r: 0.75 }, { type: 'circle', x: sx, z: sz, r: 0.32 });
}

// A cooler: red with a white lid and handle, a can on top.
function cooler(b, x, y, z, yaw, colliders) {
  const at = frame(x, z, yaw);
  const box = (col, lx, ly, lz, sx, sy, sz) => { const [wx, wz] = at(lx, lz); b.add(GEO.box, col, { x: wx, y: y + ly, z: wz, sx, sy, sz, ry: yaw }); };
  box('#d8433a', 0, 0.2, 0, 0.62, 0.36, 0.4);
  box('#f4f2ea', 0, 0.41, 0, 0.66, 0.07, 0.44);
  box('#f4f2ea', 0, 0.12, 0.205, 0.5, 0.05, 0.02);
  for (const s of [-1, 1]) box('#f4f2ea', s * 0.33, 0.3, 0, 0.03, 0.05, 0.16);
  { const [wx, wz] = at(0.14, 0.05); b.add(GEO.cyl8, '#3f8fd9', { x: wx, y: y + 0.5, z: wz, sx: 0.035, sy: 0.11, sz: 0.035 }); }
  colliders.push({ type: 'circle', x, z, r: 0.38, seat: true });
}

// A lantern on a stump: a little camp lantern with a warm bulb (pale by day, burning at night).
function lanternStump(b, x, y, z, colliders) {
  b.add(GEO.cyl8, '#7a5234', { x, y: y + 0.2, z, sx: 0.26, sy: 0.4, sz: 0.26 });
  b.add(GEO.cyl8, '#d9b47e', { x, y: y + 0.405, z, sx: 0.23, sy: 0.01, sz: 0.23 });
  if (propsReady('camp_lantern')) addProp(b, 'camp_lantern', { x, y: y + 0.41, z }, { skin: 'camp_green' }); // (props-static: the Blender lantern on the stump's top)
  else {
  b.add(GEO.cyl8, '#2f5b3a', { x, y: y + 0.44, z, sx: 0.09, sy: 0.05, sz: 0.09 });
  b.add(GEO.cyl8, lampGlow('#ffd27a'), { x, y: y + 0.54, z, sx: 0.065, sy: 0.15, sz: 0.065 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; b.add(GEO.box, '#2f5b3a', { x: x + Math.cos(a) * 0.07, y: y + 0.54, z: z + Math.sin(a) * 0.07, sx: 0.016, sy: 0.16, sz: 0.016 }); }
  b.add(GEO.cone8, '#2f5b3a', { x, y: y + 0.66, z, sx: 0.1, sy: 0.08, sz: 0.1 });
  b.add(new THREE.TorusGeometry(0.06, 0.008, 4, 10, Math.PI), '#4a4f57', { x, y: y + 0.7, z });
  }
  colliders.push({ type: 'circle', x, z, r: 0.3, seat: true });
  addNightSpot({ x, y: y + 0.56, z, color: '#ffc98a', pool: 1.1, poolK: 0.16, gy: y, halo: 0.5, flicker: 0.5, k: 0.3 }); // (k: main.js's lamp light at 30%, a camp lantern, not a street lamp. Any brighter lights the grass lime)
}

// String lights: poles round the far side, a sagging line of coloured bulbs between them. The bulbs are one unlit
// vertex-coloured material joined to daynight's lamp list (pale by day, burning at night): one draw call for all of them.
const BULBS = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); BULBS.name = 'firepit-bulbs';
LAMPS.set('firepit-bulbs', { mat: BULBS, base: new THREE.Color('#ffffff') });
const BULB_COLS = ['#ffd27a', '#ff8a7a', '#9ee07a', '#8ac8ff', '#ffb35a'];
function stringLights(b, group, cx, cz, poles, colliders) {
  const tops = poles.map(([a, r]) => { const x = cx + Math.cos(a * DEG) * r, z = cz + Math.sin(a * DEG) * r, y = terrainHeight(x, z); return [x, y, z]; });
  const H = 2.45, bulbs = [], c = new THREE.Color(), bulbGeo = new THREE.SphereGeometry(0.047, 6, 4);
  for (const [x, y, z] of tops) {
    b.add(GEO.cyl8, '#7a5234', { x, y: y + H / 2, z, sx: 0.055, sy: H, sz: 0.055 });
    b.add(GEO.cyl8, '#5e4128', { x, y: y + H + 0.03, z, sx: 0.07, sy: 0.06, sz: 0.07 });
    colliders.push({ type: 'circle', x, z, r: 0.14 });
  }
  // a wind chime on a little arm off the middle pole (you hear it now and then: audio.js, the 'firepit' bed)
  { const [x, y, z] = tops[Math.floor(tops.length / 2)], dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
    const hx = x + ux * 0.32, hz = z + uz * 0.32, hy = y + 1.95;
    limb(b, '#5e4128', [x, hy + 0.05, z], [hx, hy + 0.05, hz], 0.018);
    limb(b, '#2b2b2f', [hx, hy + 0.05, hz], [hx, hy - 0.05, hz], 0.005);
    b.add(GEO.cyl8, '#c9a06a', { x: hx, y: hy - 0.07, z: hz, sx: 0.07, sy: 0.025, sz: 0.07 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, l = 0.16 + (i % 3) * 0.05; b.add(GEO.cyl6, ['#8ac8ff', '#9ee07a', '#ffd27a', '#ff8a7a', '#c9a6ff'][i], { x: hx + Math.cos(a) * 0.05, y: hy - 0.1 - l / 2, z: hz + Math.sin(a) * 0.05, sx: 0.011, sy: l, sz: 0.011 }); }
    limb(b, '#2b2b2f', [hx, hy - 0.07, hz], [hx, hy - 0.33, hz], 0.004); b.add(GEO.box, '#7a5234', { x: hx, y: hy - 0.37, z: hz, sx: 0.07, sy: 0.09, sz: 0.012, ry: Math.atan2(ux, uz) }); } // the sail the wind catches
  let k = 0;
  for (let i = 0; i + 1 < tops.length; i++) {
    const [ax, ay, az] = tops[i], [bx, by, bz] = tops[i + 1], N = 9, pts = [];
    for (let j = 0; j <= N; j++) { const u = j / N; pts.push([ax + (bx - ax) * u, ay + (by - ay) * u + H - 0.08 - 0.55 * 4 * u * (1 - u), az + (bz - az) * u]); }
    for (let j = 0; j < N; j++) limb(b, '#2b2b2f', pts[j], pts[j + 1], 0.008);
    for (let j = 1; j < N; j++) {
      const g = bulbGeo.clone(); g.translate(pts[j][0], pts[j][1] - 0.07, pts[j][2]);
      c.set(BULB_COLS[k++ % BULB_COLS.length]);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) col.set([c.r, c.g, c.b], v * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv');
      bulbs.push(g);
      b.add(GEO.cyl6, '#2b2b2f', { x: pts[j][0], y: pts[j][1] - 0.025, z: pts[j][2], sx: 0.022, sy: 0.04, sz: 0.022 });
    }
  }
  const m = new THREE.Mesh(mergeGeometries(bulbs, false), BULBS);
  bulbs.forEach(g => g.dispose());
  m.name = 'firepit-bulbs'; m.matrixAutoUpdate = false; m.updateMatrix();
  group.add(m);
}

// The marshmallow sticks: two long green sticks pushed into the ground by the south log, leaning out over the ring with a
// marshmallow on each (one toasted golden, one a little too toasted), and the bag on the end of the log.
function marshmallows(b, cx, cz, a, r, logEnd) {
  for (const [da, len, tilt, col] of [[-10, 1.42, 0.82, '#f2c27a'], [9, 1.36, 0.86, '#5a3a26']]) {
    const x = cx + Math.cos((a + da) * DEG) * r, z = cz + Math.sin((a + da) * DEG) * r, y = terrainHeight(x, z);
    const dx = (cx - x), dz = (cz - z), d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
    const tip = [x + ux * Math.sin(tilt) * len, y + Math.cos(tilt) * len, z + uz * Math.sin(tilt) * len];
    limb(b, '#6b8f3a', [x, y - 0.05, z], tip, 0.02);
    b.add(GEO.cyl8, '#fbf7ee', { x: tip[0] + ux * 0.04, y: tip[1] - 0.02, z: tip[2] + uz * 0.04, sx: 0.045, sy: 0.07, sz: 0.045 });
    b.add(GEO.cyl8, col, { x: tip[0] + ux * 0.04, y: tip[1] - 0.045, z: tip[2] + uz * 0.04, sx: 0.052, sy: 0.03, sz: 0.052 }); // (the toast a good bit fatter than the marshmallow: 2 mm, their sides flickered)
  }
  if (logEnd) {
    const [x, y, z, yaw] = logEnd;
    b.add(GEO.box, '#f4f2ea', { x, y: y + 0.08, z, sx: 0.2, sy: 0.16, sz: 0.1, ry: yaw });
    b.add(GEO.box, '#ff8fb1', { x, y: y + 0.09, z, sx: 0.22, sy: 0.05, sz: 0.12, ry: yaw }); // (the band a centimetre proud of the bag, not a hair: they flickered)
    b.add(GEO.box, '#f4f2ea', { x, y: y + 0.18, z, sx: 0.12, sy: 0.04, sz: 0.06, ry: yaw + 0.2 });
  }
}

// The worn dirt circle round the pit, draped over the ground (each vertex at the terrain's height).
function dirtCircle(group, cx, cz, R) {
  const g = new THREE.RingGeometry(0.001, R, 40, 5).rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color('#b48a58'), e = new THREE.Color('#9cbf5a'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z) / R;
    // a ragged rim: the grass reaches in further in some places than others
    const rag = 0.86 + 0.07 * Math.sin(Math.atan2(z, x) * 5 + 1.3) + 0.04 * Math.sin(Math.atan2(z, x) * 11);
    p.setXYZ(i, cx + x * (d >= 0.999 ? rag : 1), terrainHeight(cx + x, cz + z) + 0.025, cz + z * (d >= 0.999 ? rag : 1));
    c.copy(a).lerp(e, d >= 0.999 ? 0.65 : 0);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon('#ffffff', { vertexColors: true, polygonOffset: true }));
  m.name = 'firepit-dirt'; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
  group.add(m);
}

export function buildFirepit({ b, group, x: cx, z: cz, colliders, updaters }) {
  const cy = terrainHeight(cx, cz);
  const fuel = { flame: 0, ember: 0, smoke: 0, steam: 0 };
  dirtCircle(group, cx, cz, PLAN.dirtR);
  const fire = buildCampfire({ b, group, x: cx, z: cz, colliders, updaters, fuel });
  // a few big flat stones round the outside of the ring (sit-on-able looking, not seats) to make it a proper pit
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + 0.11, r = 1.22 + (i % 2) * 0.05, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; b.add(GEO.dodec, i % 3 ? '#9a9a90' : '#86867e', { x, y: terrainHeight(x, z) + 0.05, z, sx: 0.2, sy: 0.1, sz: 0.17, ry: a + i }); }

  const seats = [];
  const face = (x, z) => Math.atan2(cx - x, cz - z);
  const drinks = ['#3f8fd9', '#e8483c', '#f2c230', '#9a5ad9'];
  PLAN.chairs.forEach(([a, colour], i) => {
    const x = cx + Math.cos(a * DEG) * PLAN.chairR, z = cz + Math.sin(a * DEG) * PLAN.chairR, y = terrainHeight(x, z), yaw = face(x, z);
    campChair(b, x, y, z, yaw, colour, drinks[i]);
    const [bx, bz] = frame(x, z, yaw)(0, -0.12), [sx, sz] = frame(x, z, yaw)(0, CAMP_CHAIR.sit);
    colliders.push({ type: 'circle', x: bx, z: bz, r: 0.42, seat: true });
    seats.push({ id: 'chair-' + i, kind: 'chair', colour, x: sx, z: sz, y, yaw, seatY: CAMP_CHAIR.seatY, chair: { armX: CAMP_CHAIR.W, elbowDrop: 0.19, armY: CAMP_CHAIR.armY }, hint: `E  Sit in the ${colour} camp chair`, frame: { x, z, yaw } });
  });
  let southLogEnd = null;
  PLAN.logs.forEach((a, i) => {
    const x = cx + Math.cos(a * DEG) * PLAN.logR, z = cz + Math.sin(a * DEG) * PLAN.logR, y = terrainHeight(x, z), yaw = face(x, z);
    const at = frame(x, z, yaw), L = LOG_SEAT.len, R = LOG_SEAT.r;
    // the log lies across the sitter's view (along local x): bark, pale cut ends, a stub of a branch
    const [ax, az] = at(-L / 2, 0), [bx2, bz2] = at(L / 2, 0);
    limb(b, '#7a5234', [ax, y + R, az], [bx2, y + R, bz2], R);
    for (const s of [-1, 1]) { const [ex, ez] = at(s * L / 2, 0); b.add(GEO.cyl12, '#d9b47e', { x: ex, y: y + R, z: ez, sx: R * 0.92, sy: 0.02, sz: R * 0.92, rz: Math.PI / 2, ry: yaw }); }
    { const [kx, kz] = at(0.35, -0.12); limb(b, '#6b4a2e', [kx, y + R * 1.5, kz], [kx + Math.sin(yaw + 2.6) * 0.18, y + R * 2.1, kz + Math.cos(yaw + 2.6) * 0.18], 0.045); }
    // a plank seat on top (a log bench: nobody perches on a round log), set a little forward where the sitters sit
    { const [tx, tz] = at(0, 0.07); b.add(GEO.box, '#c9a06a', { x: tx, y: y + LOG_SEAT.seatY - 0.03, z: tz, sx: L * 0.97, sy: 0.05, sz: 0.34, ry: yaw }); }
    for (const k of [-0.6, 0, 0.6]) { const [px, pz] = at(k, 0); colliders.push({ type: 'circle', x: px, z: pz, r: 0.3, seat: true }); }
    for (const k of [-0.42, 0.42]) { const [sx, sz] = at(k, LOG_SEAT.front); seats.push({ id: `log-${i}-${k < 0 ? 'l' : 'r'}`, kind: 'log', x: sx, z: sz, y, yaw: face(sx, sz), seatY: LOG_SEAT.seatY, chair: null, hint: 'E  Sit on the log', frame: { x, z, yaw } }); }
    if (i === 0) {   // (the south log: the marshmallow bag on its end)
      const [ex, ez] = at(-L / 2 + 0.16, 0.02); southLogEnd = [ex, y + LOG_SEAT.seatY - 0.005, ez, yaw + 0.3]; }
  });
  // the props
  { const [a, r] = PLAN.cooler, x = cx + Math.cos(a * DEG) * r, z = cz + Math.sin(a * DEG) * r; cooler(b, x, terrainHeight(x, z), z, face(x, z) + Math.PI / 2, colliders); }
  { const [a, r] = PLAN.stump, x = cx + Math.cos(a * DEG) * r, z = cz + Math.sin(a * DEG) * r; lanternStump(b, x, terrainHeight(x, z), z, colliders); }
  { const [a, r] = PLAN.wood, x = cx + Math.cos(a * DEG) * r, z = cz + Math.sin(a * DEG) * r; woodpile(b, x, terrainHeight(x, z), z, face(x, z) + Math.PI / 2, colliders); }
  { const [a, r] = PLAN.sticks; marshmallows(b, cx, cz, a, r, southLogEnd); }
  stringLights(b, group, cx, cz, PLAN.poles, colliders);

  // keepOut: the dogs and walkers of npcs.js keep this far from the middle (the seats, the chair backs, the cooler and the stump)
  return { centre: { x: cx, y: cy + 0.7, z: cz }, ground: cy, seats, fuel, fire, keepOut: PLAN.chairR + 0.9 };
}
