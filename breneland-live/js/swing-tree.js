// The old swing tree, an apple tree on top of the swing hill. The trunk, the big limb the tire hangs from and
// the smaller limbs are smooth tapered tubes that grow out of each other (every limb starts inside the wood it grows from, so
// there is no step or gap where they meet), and the trunk and every limb run up into one broad leafy crown dotted with red
// apples (a few more lie in the grass). buildSwingTree() is called by world.js (through swing.js) and returns the per-frame
// updater; the live tire is driven by swing-rig.js. The rope's anchor (RIG.pivot) is fixed by the swing: 3.2 m from the trunk
// to the rider's right (swing-hill.js SWING_FRAME), high enough that the seat rests at SW.SEAT_REST_H over the grass. The limb
// is laid through exactly that point.
import * as THREE from 'three';
import { GEO, Batcher } from './batch.js';
import { toon } from './toon.js';
import { terrainHeight } from './terrain.js';
import { SWING_TREE } from './layout.js';
import { mulberry32 } from './util.js';
import { LUMP } from './world-trees.js';
import { SW } from './swing-physics.js';
import { SWING_FRAME } from './swing-hill.js';
import { buildSandPit } from './swing-pit.js';
import { RIG, rigUpdate, KNOT as KNOT_Y, TIRE_TUBE } from './swing-rig.js';

const LEAF = ['#62b04a', '#55a243', '#6fbd4e', '#5eab47']; // (an apple tree's brighter, rounder green)
const LEAF_LIGHT = ['#86cf5c', '#93d766'];
const APPLE = ['#e2372c', '#d92f2a', '#ef4a32'];
const BARK = ['#74502f', '#5f3f27']; // all the wood is one colour (a colour change reads as a joint); darker ridges
const ROPE = '#d9c7a0', ROPE_DARK = '#b59c6e';

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// A smooth tapered tube through control points (Catmull-Rom), radius interpolated between the points' radii, with a
// little lumpiness so the wood is not a perfect pipe, and a pointed cap at the far end.
export function tube(pts, radii, { radial = 10, segs = 20, lump = 0.035, seed = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const { normals, binormals } = curve.computeFrenetFrames(segs, false);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const radiusAt = u => {
    const d = u * total;
    let i = 0;
    while (i < cum.length - 2 && d > cum[i + 1]) i++;
    const t = Math.min(1, Math.max(0, (d - cum[i]) / (cum[i + 1] - cum[i] || 1)));
    return radii[i] + (radii[i + 1] - radii[i]) * t;
  };
  const pos = [], nrm = [], idx = [], P = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    const r = radiusAt(u), N = normals[i], B = binormals[i];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const k = 1 + lump * (Math.sin(th * 3 + i * 0.9 + seed) * 0.6 + Math.sin(th * 5 - i * 0.5 + seed * 2) * 0.4);
      D.set(0, 0, 0).addScaledVector(N, Math.cos(th)).addScaledVector(B, Math.sin(th));
      pos.push(P.x + D.x * r * k, P.y + D.y * r * k, P.z + D.z * r * k);
      nrm.push(D.x, D.y, D.z);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // cap: a short cone to a point just past the end
  curve.getPointAt(1, P);
  const T = curve.getTangentAt(1), rEnd = radii[radii.length - 1];
  const tip = pos.length / 3;
  pos.push(P.x + T.x * rEnd * 0.8, P.y + T.y * rEnd * 0.8, P.z + T.z * rEnd * 0.8);
  nrm.push(T.x, T.y, T.z);
  const last = segs * (radial + 1);
  for (let j = 0; j < radial; j++) idx.push(last + j, last + j + 1, tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

// Tree-local frame: +x along the swing limb (the rider's right), +z behind the rider, y up from the trunk's foot. With the swing
// facing north (yaw PI) that's plain east / south. On the hill it's turned with the swing.
const FR = SWING_FRAME, BASE_YAW = RIG.baseYaw;
const loc = (x0, y0, z0, lx, ly, lz) => v3(x0 + FR.rx * lx - FR.fx * lz, y0 + ly, z0 + FR.rz * lx - FR.fz * lz);

// The apple tree's crown: a broad, low, chunky dome wider than it is tall, kept off the swing's plane (local x 2.2..4.2) up to
// the height a rider's head reaches at the top of the arc. [x, y, z, rx, ry, rz] tree-local, exported for the tests (the
// rider's arc must stay clear of it).
export const APPLE_CROWN = [
  [0.2, 7.0, 0, 3.0, 2.0, 3.0],       // the dome
  [-2.6, 6.2, -0.6, 2.0, 1.55, 2.0],  // round it, low and wide (an apple tree spreads)
  [-1.6, 6.3, 2.2, 1.95, 1.5, 1.9],
  [-1.5, 6.4, -2.5, 1.9, 1.5, 1.85],
  [0.8, 6.5, 2.6, 1.9, 1.45, 1.75],
  [0.9, 6.5, -2.6, 1.9, 1.45, 1.75],
  [3.0, 7.55, 0.2, 1.75, 1.2, 1.6],   // over the swing limb, high: the rope runs down under it
  [4.75, 7.2, -0.1, 1.05, 0.85, 1.0], // the limb's tip
  [-0.4, 8.45, 0.1, 1.9, 1.3, 1.8],   // the top
  [-3.4, 5.7, 1.0, 1.25, 1.0, 1.2],
];
const APPLE_LIGHT = [[1.3, 8.1, 1.0, 1.15], [-1.4, 7.9, -1.2, 1.1], [3.2, 8.35, -0.5, 0.85], [-2.7, 7.2, 1.6, 0.9]];

export function buildSwingTree(b, parentGroup) {
  const x0 = SWING_TREE.x, z0 = SWING_TREE.z;
  const y0 = terrainHeight(x0, z0) - 0.12;
  const rnd = mulberry32(99);
  // the crown is its own batch: big leaf blobs that receive shadows show striped self-shadow acne, so they only cast
  const crown = new Batcher({ castShadow: true, receiveShadow: false, vertexColors: true }); // (one draw call: leaves and apples)
  const at = (x, y, z) => loc(x0, y0, z0, x, y, z); // tree-local metres (y from the trunk foot)

  // where the rope hangs: 3.2 m out along the branch, and high enough that the seat rests at SEAT_REST_H over the grass
  const ax = FR.x, az = FR.z;
  const gy = terrainHeight(ax, az);
  const pivotY = gy + SW.SEAT_REST_H + SW.L;
  RIG.pivot.set(ax, pivotY, az);
  RIG.restSeat.set(ax, pivotY - SW.L, az);
  RIG.groundY = gy;
  const yA = pivotY + 0.1 - y0; // the limb's axis right over the anchor, tree-local

  // ---- trunk: one tube, buried at the foot, leaning a little toward the limb, running up inside the crown
  const trunkPts = [at(0, -0.45, 0), at(0.02, 0.35, -0.02), at(0.08, 1.6, -0.03), at(0.22, 2.9, 0), at(0.4, 4.1, 0.04), at(0.5, 5.3, 0.02), at(0.45, 6.6, 0)];
  const trunkR = [0.82, 0.66, 0.52, 0.46, 0.38, 0.28, 0.16];
  b.add(tube(trunkPts, trunkR, { radial: 12, segs: 26, lump: 0.035, seed: 1 }), BARK[0]);
  const axisAt = y => { // trunk axis and radius at a height above the foot (for the knot hole and the ridges)
    let i = 0;
    while (i < trunkPts.length - 2 && y0 + y > trunkPts[i + 1].y) i++;
    const A = trunkPts[i], B = trunkPts[i + 1], t = (y0 + y - A.y) / (B.y - A.y);
    return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, r: trunkR[i] + (trunkR[i + 1] - trunkR[i]) * t };
  };
  // roots flare out from inside the trunk into the grass (the hill's top is flat round it)
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.4, c = Math.cos(a), s = Math.sin(a), len = i % 2 ? 1.2 : 1.45;
    b.add(tube([at(c * 0.2, 0.75, s * 0.2), at(c * 0.62, 0.22, s * 0.62), at(c * len, -0.06, s * len), at(c * (len + 0.3), -0.25, s * (len + 0.3))],
      [0.3, 0.2, 0.08, 0.04], { radial: 7, segs: 8, lump: 0.02, seed: i }), BARK[0]);
  }
  // knot hole, facing the way people walk up, and a scar of lighter wood above it
  const nA = Math.atan2(0.5, -0.86) + BASE_YAW;
  const k1 = axisAt(1.35), k2 = axisAt(1.72);
  b.add(GEO.sphere, '#2a1c12', { x: k1.x + Math.sin(nA) * (k1.r - 0.03), y: y0 + 1.35, z: k1.z + Math.cos(nA) * (k1.r - 0.03), sx: 0.13, sy: 0.2, sz: 0.06, ry: nA });
  b.add(GEO.sphere, '#8a6440', { x: k2.x + Math.sin(nA) * (k2.r - 0.02), y: y0 + 1.72, z: k2.z + Math.cos(nA) * (k2.r - 0.02), sx: 0.09, sy: 0.14, sz: 0.04, ry: nA });
  // bark ridges, laid on the surface
  for (let i = 0; i < 10; i++) {
    const a = i * 0.7 + 1.2, yy = 0.8 + rnd() * 2.6, k = axisAt(yy);
    b.add(GEO.box, BARK[1], { x: k.x + Math.cos(a) * k.r * 0.99, y: y0 + yy, z: k.z + Math.sin(a) * k.r * 0.99, sx: 0.07, sy: 0.55 + rnd() * 0.4, sz: 0.06, ry: -a });
  }

  // ---- the big limb: it grows out of the trunk, climbs, then levels off over the anchor and turns up at the tip
  const limbPts = [at(0.24, 2.8, 0), at(0.95, 3.6, 0.02), at(1.9, 4.34, 0), at(3.2, yA, 0), at(4.1, yA + 0.14, -0.05), at(4.75, yA + 0.62, -0.1)];
  const limbR = [0.36, 0.27, 0.19, 0.14, 0.1, 0.05];
  b.add(tube(limbPts, limbR, { radial: 10, segs: 26, lump: 0.025, seed: 7 }), BARK[0]);
  // a twig off the limb and a knobbly stub, so it looks grown, not stuck on
  b.add(tube([at(2.1, 4.38, 0), at(2.45, 4.95, 0.3), at(2.65, 5.55, 0.5)], [0.09, 0.06, 0.035], { radial: 6, segs: 8, lump: 0.01 }), BARK[0]);
  b.add(tube([at(1.3, 3.88, 0), at(1.55, 4.2, -0.35), at(1.62, 4.35, -0.55)], [0.1, 0.065, 0.04], { radial: 6, segs: 6, lump: 0.01 }), BARK[0]);

  // ---- an apple tree's limbs: low and spreading, out into the broad crown
  const limbs = [
    [[at(0.36, 3.6, 0), at(-0.9, 4.5, -0.5), at(-2.4, 5.3, -0.9)], [0.22, 0.14, 0.07]],
    [[at(0.4, 3.9, 0.04), at(-0.2, 4.8, 1.0), at(-1.2, 5.6, 2.0)], [0.2, 0.12, 0.06]],
    [[at(0.44, 4.4, 0), at(0.9, 5.3, -1.1), at(1.1, 6.0, -2.2)], [0.18, 0.11, 0.06]],
    [[at(0.46, 4.7, 0.02), at(0.95, 5.5, 1.1), at(1.1, 6.1, 2.2)], [0.17, 0.1, 0.06]],
    [[at(0.3, 4.2, 0), at(-1.3, 4.9, 0.3), at(-3.1, 5.4, 0.9)], [0.17, 0.1, 0.05]],
  ];
  limbs.forEach(([pts, rr], i) => b.add(tube(pts, rr, { radial: 7, segs: 10, lump: 0.015, seed: 3 + i }), BARK[0]));

  // ---- the crown: chunky lobes, a few sunny highlights
  RIG.crown = []; // (the lobes in the world, for the tests: the rider's arc must stay clear of them)
  APPLE_CROWN.forEach(([x, y, z, rx, ry, rz], i) => {
    const p = at(x, y, z);
    RIG.crown.push({ x: p.x, y: p.y, z: p.z, rx, ry, rz });
    crown.add(LUMP[i % 3], LEAF[i % 4], { x: p.x, y: p.y, z: p.z, sx: rx, sy: ry, sz: rz, ry: rnd() * 3 });
  });
  APPLE_LIGHT.forEach(([x, y, z, r], i) => {
    const p = at(x, y, z);
    crown.add(LUMP[(i + 1) % 3], LEAF_LIGHT[i % 2], { x: p.x, y: p.y, z: p.z, sx: r, sy: r * 0.8, sz: r, ry: rnd() * 3 });
  });
  // ---- red apples all over the crown (on the lobes' skins, mostly round the sides and underneath, where you see them) and a
  // few in the grass under it. One apple: a red ball with a darker blush, a stalk and a leaf. Baked into the crown's batch.
  const ar = mulberry32(1234);
  const apple = (p, s, onGround) => {
    const yaw = ar() * Math.PI * 2;
    crown.add(GEO.sphere, APPLE[(ar() * APPLE.length) | 0], { x: p.x, y: p.y, z: p.z, sx: s, sy: s * 0.92, sz: s, ry: yaw });
    crown.add(GEO.sphere, '#b8231f', { x: p.x + Math.sin(yaw) * s * 0.45, y: p.y - s * 0.2, z: p.z + Math.cos(yaw) * s * 0.45, sx: s * 0.6, sy: s * 0.55, sz: s * 0.6, ry: yaw });
    crown.add(GEO.cyl6, '#5a3a1e', { x: p.x, y: p.y + s * 0.95, z: p.z, sx: s * 0.12, sy: s * 0.5, sz: s * 0.12, rz: onGround ? 0.5 : 0.15 });
    crown.add(GEO.sphere, '#5aa83e', { x: p.x + Math.cos(yaw) * s * 0.3, y: p.y + s * 1.05, z: p.z - Math.sin(yaw) * s * 0.3, sx: s * 0.42, sy: s * 0.08, sz: s * 0.2, ry: yaw });
  };
  const apples = [];
  for (let tries = 0; apples.length < 46 && tries < 800; tries++) {
    const L = APPLE_CROWN[(ar() * APPLE_CROWN.length) | 0];
    const th = ar() * Math.PI * 2, cy = -0.75 + ar() * 1.35; // mostly the sides and the underside
    const sy = Math.sqrt(Math.max(0, 1 - cy * cy));
    const dx = Math.cos(th) * sy, dz = Math.sin(th) * sy;
    const lx = L[0] + dx * L[3] * 0.93, ly = L[1] + cy * L[4] * 0.93, lz = L[2] + dz * L[5] * 0.93;
    // not inside another lobe (it would be hidden) and not on top of another apple
    if (APPLE_CROWN.some(o => o !== L && ((lx - o[0]) / o[3]) ** 2 + ((ly - o[1]) / o[4]) ** 2 + ((lz - o[2]) / o[5]) ** 2 < 0.8)) continue;
    if (apples.some(a => (a[0] - lx) ** 2 + (a[1] - ly) ** 2 + (a[2] - lz) ** 2 < 0.55)) continue;
    apples.push([lx, ly, lz]);
    apple(at(lx, ly, lz), 0.15 + ar() * 0.04, false);
  }
  // fallen apples in the grass round the trunk, clear of the swing's arc and of where people walk up to it
  const fallen = [];
  for (const [d, a] of [[1.55, 2.1], [2.0, 2.6], [1.8, 3.6], [2.6, 3.05], [1.45, 4.3], [2.3, 4.9], [3.1, 2.4]]) {
    const w = at(Math.cos(a) * d, 0, Math.sin(a) * d), gyA = terrainHeight(w.x, w.z);
    apple(v3(w.x, gyA + 0.1, w.z), 0.12, true);
    fallen.push({ x: w.x, y: gyA + 0.1, z: w.z });
  }
  RIG.apples = { crown: apples.length, fallen };

  // little mushrooms among the roots (Breneland loves a mushroom)
  for (let i = 0; i < 3; i++) {
    const a = -1.9 + i * 0.5, d = 0.95 + i * 0.12;
    const w = at(Math.cos(a) * d, 0, Math.sin(a) * d), mx = w.x, mz = w.z, my = terrainHeight(mx, mz);
    b.add(GEO.cyl6, '#f2ead8', { x: mx, y: my + 0.08, z: mz, sx: 0.045, sy: 0.18, sz: 0.045 });
    b.add(GEO.sphere, '#e0574f', { x: mx, y: my + 0.19, z: mz, sx: 0.12, sy: 0.07, sz: 0.12 });
    b.add(GEO.sphere, '#ffffff', { x: mx + 0.04, y: my + 0.25, z: mz + 0.02, sx: 0.025, sy: 0.015, sz: 0.025 });
  }

  // the rope is tied round the branch
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.04, 6, 14), toon(ROPE_DARK));
  wrap.rotation.y = Math.PI / 2 + BASE_YAW; wrap.position.set(ax, pivotY + 0.1, az); // round the limb, which is level here
  wrap.scale.set(1, 1, 1.4);
  parentGroup.add(wrap);

  crown.build(parentGroup, 'swing-crown');
  RIG.pit = buildSandPit(b, parentGroup); // the sand at the hill's foot (swing-pit.js)
  buildTire(parentGroup);
  RIG.built = true;
  return t => rigUpdate(t);
}

// ------------------------------------------------------------------ the tire

function buildTire(parent) {
  const base = new THREE.Group(); // at the pivot, turned so the swing faces down the hill
  base.name = 'swing-base';
  base.position.copy(RIG.pivot); base.rotation.y = RIG.baseYaw;
  const g = new THREE.Group();
  g.rotation.order = 'XZY';
  const rope = toon(ROPE), dark = toon(ROPE_DARK);
  const KNOT = KNOT_Y, L = SW.L; // (the knot well over a seated rider's head)

  const cyl = (mat, a, c, r) => {
    const m = new THREE.Mesh(GEO.cyl6, mat);
    _dir.subVectors(c, a);
    const len = _dir.length();
    m.position.copy(a).addScaledVector(_dir, 0.5);
    m.quaternion.setFromUnitVectors(UP, _dir.multiplyScalar(1 / len));
    m.scale.set(r, len, r);
    return m;
  };
  g.add(cyl(rope, v3(0, 0, 0), v3(0, -KNOT, 0), 0.034));
  for (const y of [-0.3, -0.55].map(f => f * KNOT / 0.85)) { // twisted-rope bands
    const band = new THREE.Mesh(GEO.cyl6, dark);
    band.position.set(0, y, 0); band.scale.set(0.04, 0.05, 0.04);
    g.add(band);
  }
  const knot = new THREE.Mesh(GEO.sphere, dark);
  knot.position.set(0, -KNOT, 0); knot.scale.setScalar(0.085);
  g.add(knot);

  // three ropes from the knot to the tire (left, right, behind: nothing in front of the rider's legs)
  const top = -L + TIRE_TUBE;
  const attach = [v3(-0.5, top, 0), v3(0.5, top, 0), v3(0, top, 0.5)];
  const side = [];
  attach.forEach((at, i) => {
    const m = cyl(rope, v3(0, -KNOT, 0), at, 0.03);
    g.add(m);
    if (i < 2) side.push(m);
    const ring = new THREE.Mesh(GEO.sphere, dark); // a little knot where it meets the tire
    ring.position.copy(at); ring.scale.setScalar(0.06);
    g.add(ring);
  });

  // the tire: a torus lying flat, with lettering worn into the top and a lighter tread edge. It is its own little group
  // so it can spin round the rider's waist when the swing is going too fast.
  const tireG = new THREE.Group();
  tireG.position.y = -L;
  const geo = new THREE.TorusGeometry(0.5, 0.17, 10, 24);
  geo.rotateX(Math.PI / 2);
  tireG.add(new THREE.Mesh(geo, toon('#4b4b58')));
  const tgeo = new THREE.TorusGeometry(0.5, 0.176, 6, 24);
  tgeo.rotateX(Math.PI / 2);
  const tread = new THREE.Mesh(tgeo, toon('#62626f', { flat: true }));
  tread.scale.set(1, 0.16, 1); tread.position.y = 0.02;
  tireG.add(tread);
  for (let i = 0; i < 6; i++) { // faded white lettering blocks: also make the tire's spin readable
    const a = i * 1.047 + 0.3, big = i % 3 === 0;
    const m = new THREE.Mesh(GEO.box, toon(big ? '#e9e2cf' : '#c9c2b0'));
    m.position.set(Math.cos(a) * 0.5, 0.168, Math.sin(a) * 0.5);
    m.rotation.y = -a; m.scale.set(0.05, 0.014, big ? 0.17 : 0.1);
    tireG.add(m);
  }
  const moss = new THREE.Mesh(GEO.sphere, toon('#5f9a3f'));
  moss.position.set(0.36, 0.12, -0.3); moss.scale.set(0.11, 0.05, 0.09);
  tireG.add(moss);
  g.add(tireG);
  RIG.tireG = tireG;

  base.add(g);
  parent.add(base);
  for (const o of [g]) o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });

  // pieces of rope that run through a rider's hands (world space, shown only while somebody rides)
  const hand = { meshes: [], side, knot: new THREE.Vector3(), tmp: new THREE.Vector3(), shown: false };
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(GEO.cyl6, rope);
    m.visible = false; m.castShadow = true;
    parent.add(m);
    hand.meshes.push(m);
  }
  RIG.group = g; RIG.base = base;
  RIG.hand = hand;
}
