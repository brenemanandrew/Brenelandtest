// The Tool Crib's loose springs roll and get pushed (Andrew, 2026-11-06). tool-crib-build.js leaves the loose ones out of its
// batch (the top of the heap, the spill on the table, the few on the floor: `inside.userData.looseSprings`); here they are one
// instanced mesh and light rigid bodies: a coil is a capsule (a segment along its axis, the coil's radius round it) with a
// hollow coil's inertia, so on a flat top it rolls round its axis, slides, tips, falls off the table's edge with a little
// springy bounce and settles. They bump each other, the furniture (ctx.colliders inside the shop, as columns; the table's top is
// its column's top), the shop's walls, the spring box's sides and the packed heap (a height field).
//
// Pushed: your legs (a short upright cylinder round you) nudge any spring you walk into; E at the table rummages the heap so a
// few tumble out; a toy in the air (dog-toys.js) knocks them. Only your own body pushes on your screen.
// Shared (lib/crib-springs.js): whoever moves a spring simulates it and sends its pose a few times a second while it moves and
// once more when it settles; the server keeps the last pose and echoes every message to everyone (the sender too), so all
// screens apply them in the server's order. Others' springs glide to the poses they hear. Walking near, you ask for the
// moved ones; when nobody has been within 100 ft for ~10 s the server sends everyone `reset` and the heap is tidy again.
// Cheap: one instanced draw (+ its normal pass), the physics only while a spring of yours moves and you are at the shop,
// nothing allocated a frame.
import * as THREE from 'three';
import { toon } from './toon.js';
import { CRIB, toWorld, toLocal, worldYaw } from './tool-crib-plan.js';

export const SPR = {
  dt: 1 / 120, maxSteps: 6, g: 9.8, iters: 4,
  mu: 0.5, muSpring: 0.3, muLeg: 0.15,
  bounce: 0.38, bounceV: 0.8,           // a springy boing off the floor and the table: restitution over this impact speed
  sleepV: 0.06, sleepW: 0.6, sleepT: 0.35, maxAwake: 12,
  legR: 0.3, legH: 0.55,                // your legs: an upright cylinder from your feet
  send: 0.2,                            // seconds between pose messages while yours move
  reach: 40,                            // ask for the shared poses within this of the store
  wake: 0.3,                            // a bump faster than this wakes a sleeping spring
};
const TURNS = 7, WIRE = 0.065, GH = 2.2;  // the drawn coil: radius 0.5, GH tall (as the baked 6-turn kind), stretched per spring

function coilGeometry() {
  const pts = [], n = TURNS * 8;
  for (let i = 0; i <= n; i++) { const a = i / n * TURNS * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 0.5, (i / n - 0.5) * GH, Math.sin(a) * 0.5)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, WIRE, 3, false);
  g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// ---- small vector helpers on plain numbers (no allocation)
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const CM = 900, CS = 16;               // contact pool: a, b, then CS numbers each
const CA = new Int16Array(CM), CB = new Int16Array(CM), CF = new Float64Array(CM * CS);
// CF layout: 0-2 n, 3-5 point, 6 pen, 7 bias (bounce speed), 8 mu, 9-11 kinematic velocity of b, 12 accN, 13 accT
const SEG = new Float64Array(4);       // closest points between segments: s, t

export function createCribSprings(ctx, built, plan) {
  const { player, net, audio } = ctx;
  // (crib-move) the physics runs in the plan's own frame (the mesh is in the inside group, which is turned to the world with the
  // building): the furniture from the building's plan-frame collider copies, your legs and a flying toy turned into the frame,
  // the sounds turned out of it (tool-crib-plan.js toWorld / toLocal; the same frame on every screen, so the shared poses agree)
  const colliders = built.localColliders || ctx.colliders, FLIP = CRIB.flip ? -1 : 1;
  const P = plan, inside = built.inside, L = inside.userData.looseSprings || [], SB = inside.userData.springBox;
  const N = L.length;
  // ---------------------------------------------------------------- the bodies
  const B = L.map((s, i) => {
    const sx = s.sc * 0.1, len = s.sc * 0.085 * s.h;   // (as long as the baked one; the coil stretched or squashed to it)
    _e.set(s.rx, 0, s.rz, 'YXZ'); _q.setFromEuler(_e);
    const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const half = s.sc * 0.085 * s.h / 2;                  // the baked spring's base is its one end: its middle is half up its axis
    const r = (0.5 + WIRE) * sx, hl = Math.max(0.004, len / 2 - r * 0.5);
    const b = {
      i, where: s.where, col: s.col, sx, sy: len / GH, r, hl, touch: false,
      px: s.x + ax.x * half, py: s.y + ax.y * half, pz: s.z + ax.z * half, qx: _q.x, qy: _q.y, qz: _q.z, qw: _q.w,
      vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, ax: 0, ay: 1, az: 0,
      awake: false, still: 0, age: 0, mine: false, sent: true,
      lerp: false, tx: 0, ty: 0, tz: 0, tq: new THREE.Quaternion(), home: null, sndAt: -9, dirty: true,
    };
    const m = len * r * r * 4000;                      // (any unit: only ratios matter)
    b.invM = 1 / m; b.ia = 1 / (m * r * r); b.ip = 1 / (m * (r * r / 2 + (len * len) / 12)); // a hollow coil about its axis, and across
    return b;
  });
  // where each one rests at home: on the floor, on the table top, nestled into the heap
  for (const b of B) {
    axisOf(b);
    if (b.where === 'heap') { const low = b.py - Math.abs(b.ay) * b.hl - b.r; b.py += heapY(b.px, b.pz) - 0.012 - low; }
    else b.py = (b.where === 'floor' ? P.fy : P.table.top) + b.r;
    b.home = [b.px, b.py, b.pz, b.qx, b.qy, b.qz, b.qw];
  }
  function axisOf(b) { // the coil's axis: q * (0, 1, 0)
    const { qx: x, qy: y, qz: z, qw: w } = b;
    b.ax = 2 * (x * y - w * z); b.ay = 1 - 2 * (x * x + z * z); b.az = 2 * (y * z + w * x);
  }
  // the packed heap's top: the mound tool-crib-build.js piles (its second-highest layer) plus a coil's thickness
  function heapY(x, z) {
    const u = (x - SB.x) / (SB.w / 2 - 0.07), v = (z - SB.z) / (SB.d / 2 - 0.07), m = Math.max(0, 1 - (u * u + v * v) * 0.6);
    return SB.y + 0.03 + m * (SB.h + 0.12) * 0.95 + 0.035;
  }
  const inBox = (x, z) => Math.abs(x - SB.x) < SB.w / 2 - 0.02 && Math.abs(z - SB.z) < SB.d / 2 - 0.02;

  // ---------------------------------------------------------------- the mesh
  const mesh = new THREE.InstancedMesh(coilGeometry(), toon('#ffffff'), Math.max(1, N));
  mesh.name = 'crib-springs'; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  B.forEach(b => mesh.setColorAt(b.i, _c.set(b.col)));
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(P.sx, P.fy + 1, (P.iMinZ + P.zP) / 2), Math.hypot(P.iMaxX - P.iMinX, P.zP - P.iMinZ) / 2 + 0.5);
  inside.add(mesh);
  function draw(b) {
    _p.set(b.px, b.py, b.pz); _q.set(b.qx, b.qy, b.qz, b.qw); _s.set(b.sx, b.sy, b.sx);
    mesh.setMatrixAt(b.i, _m.compose(_p, _q, _s)); b.dirty = false; mesh.instanceMatrix.needsUpdate = true;
  }
  B.forEach(draw);

  // ---------------------------------------------------------------- the world they bump into
  // boxes { minX, minY, minZ, maxX, maxY, maxZ } and upright cylinders { x, z, r, y0, y1 }
  const boxes = [], cyls = [];
  const T = P.table, ST = P.stair, W = 2;
  boxes.push({ minX: P.iMinX - W, maxX: P.iMaxX + W, minY: P.fy - 1, maxY: P.fy, minZ: P.iMinZ - W, maxZ: P.zP + W });        // the floor
  boxes.push({ minX: P.iMinX - W, maxX: P.iMinX, minY: P.fy - 1, maxY: P.fy + 3, minZ: P.iMinZ - W, maxZ: P.zP + W });        // the walls
  boxes.push({ minX: P.iMaxX, maxX: P.iMaxX + W, minY: P.fy - 1, maxY: P.fy + 3, minZ: P.iMinZ - W, maxZ: P.zP + W });
  boxes.push({ minX: P.iMinX - W, maxX: P.iMaxX + W, minY: P.fy - 1, maxY: P.fy + 3, minZ: P.iMinZ - W, maxZ: P.iMinZ });   // (the door too: a coil stays in)
  boxes.push({ minX: P.iMinX - W, maxX: P.iMaxX + W, minY: P.fy - 1, maxY: P.fy + 3, minZ: P.zP, maxZ: P.zP + W });
  boxes.push({ minX: ST.minX, maxX: ST.maxX, minY: P.fy - 1, maxY: P.fy + 3, minZ: ST.z0, maxZ: P.zP });                   // the stair
  for (const c of colliders) { // the furniture you see (the table's top is its column's top)
    if (c.house) continue;
    if (c.minY != null && c.minY > P.fy + 1) continue;
    if (c.type === 'box') {
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      if (cx < P.iMinX || cx > P.iMaxX || cz < P.iMinZ || cz > P.zP || c.maxX - c.minX > 4 || c.maxZ - c.minZ > 4) continue;
      const table = Math.abs(cx - T.x) < 0.05 && Math.abs(cz - T.z) < 0.05;
      boxes.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, minY: P.fy - 0.5, maxY: table ? T.top : P.fy + 1.0 });
    } else if (c.type === 'circle') {
      if (c.x < P.iMinX || c.x > P.iMaxX || c.z < P.iMinZ || c.z > P.zP) continue;
      cyls.push({ x: c.x, z: c.z, r: c.r, y0: P.fy - 0.5, y1: P.fy + 0.65 });
    }
  }
  // the spring box's sides (its floor is under the heap)
  {
    const x0 = SB.x - SB.w / 2, x1 = SB.x + SB.w / 2, z0 = SB.z - SB.d / 2, z1 = SB.z + SB.d / 2, y0 = SB.y, y1 = SB.y + SB.h;
    boxes.push({ minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z0 + 0.02 }, { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z1 - 0.02, maxZ: z1 });
    boxes.push({ minX: x0, maxX: x0 + 0.02, minY: y0, maxY: y1, minZ: z0, maxZ: z1 }, { minX: x1 - 0.02, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
  }

  // ---------------------------------------------------------------- the simulation
  let nc = 0, awake = 0, acc = 0, legX = 0, legY = 0, legZ = 0, legVX = 0, legVZ = 0, legOn = false, toyOn = false;
  const toy = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.09 };
  const stats = { steps: 0, contacts: 0, ms: 0, frames: 0, sent: 0, heard: 0, sounds: 0 };
  let sndBudget = 0;

  function wakeUp(b, mine = true) {
    if (!b.awake) { b.awake = true; b.still = 0; b.age = 0; awake++; }
    b.mine = mine; b.lerp = false; b.sent = false;
  }
  function sleep(b) {
    if (!b.awake) return;
    b.awake = false; awake--; b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0; b.still = 0; b.sent = false; // (its resting pose goes out)
  }
  // world inverse inertia times x: ip x + (ia - ip)(a . x) a
  function iInv(b, x, y, z, out, o) {
    const d = (b.ia - b.ip) * (b.ax * x + b.ay * y + b.az * z);
    out[o] = b.ip * x + d * b.ax; out[o + 1] = b.ip * y + d * b.ay; out[o + 2] = b.ip * z + d * b.az;
  }
  const T3 = new Float64Array(6);
  function contact(a, bi, nx, ny, nz, px, py, pz, pen, mu, kvx = 0, kvy = 0, kvz = 0, bounce = true) {
    if (nc >= CM) return;
    const A = B[a];
    // the approach speed decides the bounce (a springy boing off the floor and the table, a clink between coils)
    const rx = px - A.px, ry = py - A.py, rz = pz - A.pz;
    let vx = A.vx + A.wy * rz - A.wz * ry - kvx, vy = A.vy + A.wz * rx - A.wx * rz - kvy, vz = A.vz + A.wx * ry - A.wy * rx - kvz;
    if (bi >= 0) { const O = B[bi], ox = px - O.px, oy = py - O.py, oz = pz - O.pz; vx -= O.vx + O.wy * oz - O.wz * oy; vy -= O.vy + O.wz * ox - O.wx * oz; vz -= O.vz + O.wx * oy - O.wy * ox; }
    const vn = vx * nx + vy * ny + vz * nz;
    const k = nc * CS;
    CA[nc] = a; CB[nc] = bi;
    CF[k] = nx; CF[k + 1] = ny; CF[k + 2] = nz; CF[k + 3] = px; CF[k + 4] = py; CF[k + 5] = pz; CF[k + 6] = pen;
    CF[k + 7] = bounce && vn < -SPR.bounceV ? -vn * SPR.bounce : 0; CF[k + 8] = mu; CF[k + 9] = kvx; CF[k + 10] = kvy; CF[k + 11] = kvz; CF[k + 12] = 0; CF[k + 13] = 0;
    nc++; A.touch = true;
    if (vn < -0.9 && bi === -1) sound(A, 'crib-boing', Math.min(1, -vn / 3));
    else if (vn < -0.5 && bi >= 0) sound(A, 'crib-clink', Math.min(1, -vn / 2));
  }
  function sound(b, name, k) {
    if (sndBudget <= 0 || ctx.__now - b.sndAt < 0.15) return;
    sndBudget--; b.sndAt = ctx.__now; stats.sounds++;
    const [wx, wz] = toWorld(b.px, b.pz);
    audio.play?.(name, wx, b.py, wz, { k });
  }
  // a sphere (centre, radius) of body a against the static world, the player's legs and a flying toy
  function sphereWorld(a, cx, cy, cz, r) {
    const b = B[a];
    for (let j = 0; j < boxes.length; j++) {
      const o = boxes[j];
      if (cx < o.minX - r || cx > o.maxX + r || cy < o.minY - r || cy > o.maxY + r || cz < o.minZ - r || cz > o.maxZ + r) continue;
      const qx = Math.min(o.maxX, Math.max(o.minX, cx)), qy = Math.min(o.maxY, Math.max(o.minY, cy)), qz = Math.min(o.maxZ, Math.max(o.minZ, cz));
      let dx = cx - qx, dy = cy - qy, dz = cz - qz, d = Math.hypot(dx, dy, dz);
      if (d >= r) continue;
      if (d > 1e-6) { dx /= d; dy /= d; dz /= d; contact(a, -1, dx, dy, dz, qx, qy, qz, r - d, SPR.mu); continue; }
      // the centre inside: out by the nearest face
      const f = [cx - o.minX, o.maxX - cx, cy - o.minY, o.maxY - cy, cz - o.minZ, o.maxZ - cz];
      let m = 0; for (let q = 1; q < 6; q++) if (f[q] < f[m]) m = q;
      const n = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]][m];
      contact(a, -1, n[0], n[1], n[2], cx - n[0] * r, cy - n[1] * r, cz - n[2] * r, f[m] + r, SPR.mu);
    }
    for (let j = 0; j < cyls.length; j++) {
      const o = cyls[j];
      if (cy > o.y1 + r || cy < o.y0) continue;
      const dx = cx - o.x, dz = cz - o.z, d = Math.hypot(dx, dz);
      if (d >= o.r + r) continue;
      if (cy > o.y1 && d < o.r) { contact(a, -1, 0, 1, 0, cx, o.y1, cz, o.y1 + r - cy, SPR.mu); continue; }
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      contact(a, -1, nx, 0, nz, cx - nx * r, cy, cz - nz * r, o.r + r - d, SPR.mu);
    }
    if (inBox(cx, cz)) { // the packed heap
      const h = heapY(cx, cz);
      if (cy - r < h) {
        const e = 0.02, gx = (heapY(cx + e, cz) - heapY(cx - e, cz)) / (2 * e), gz = (heapY(cx, cz + e) - heapY(cx, cz - e)) / (2 * e), l = Math.hypot(gx, 1, gz);
        contact(a, -1, -gx / l, 1 / l, -gz / l, cx, cy - r, cz, (h - (cy - r)) / l, SPR.mu);
      }
    }
    if (legOn && cy - r < legY + SPR.legH && cy + r > legY) { // your legs
      const dx = cx - legX, dz = cz - legZ, d = Math.hypot(dx, dz);
      if (d < SPR.legR + r) { const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0; contact(a, -2, nx, 0, nz, cx - nx * r, cy, cz - nz * r, SPR.legR + r - d, SPR.muLeg, legVX, 0, legVZ, false); }
    }
    if (toyOn) {
      const dx = cx - toy.x, dy = cy - toy.y, dz = cz - toy.z, d = Math.hypot(dx, dy, dz);
      if (d < toy.r + r && d > 1e-6) contact(a, -3, dx / d, dy / d, dz / d, toy.x + dx / d * toy.r, toy.y + dy / d * toy.r, toy.z + dz / d * toy.r, toy.r + r - d, SPR.muLeg, toy.vx, toy.vy, toy.vz, false);
    }
    void b;
  }
  // closest points between segments p1 + s d1 and p2 + t d2 (s, t in 0..1): Ericson 5.1.9
  function segSeg(p1x, p1y, p1z, d1x, d1y, d1z, p2x, p2y, p2z, d2x, d2y, d2z) {
    const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    const c = d1x * rx + d1y * ry + d1z * rz, bb = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - bb * bb;
    s = den > 1e-12 ? Math.min(1, Math.max(0, (bb * f - c * e) / den)) : 0;
    t = (bb * s + f) / e;
    if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (bb - c) / a)); }
    SEG[0] = s; SEG[1] = t;
  }
  function collide() {
    nc = 0;
    for (let a = 0; a < N; a++) {
      const b = B[a];
      if (!b.awake) continue;
      // the coil as spheres along its axis (its ends and between) against the world
      const ns = Math.min(5, 2 + Math.ceil((2 * b.hl) / (2 * b.r)));
      for (let k = 0; k < ns; k++) { const u = (k / (ns - 1) * 2 - 1) * b.hl; sphereWorld(a, b.px + b.ax * u, b.py + b.ay * u, b.pz + b.az * u, b.r); }
      // against the other coils (each awake pair once)
      const ra = b.hl + b.r;
      for (let o = 0; o < N; o++) {
        if (o === a) continue;
        const c = B[o];
        if (c.awake && o < a) continue;
        const rr = ra + c.hl + c.r, dx = b.px - c.px, dy = b.py - c.py, dz = b.pz - c.pz;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        segSeg(b.px - b.ax * b.hl, b.py - b.ay * b.hl, b.pz - b.az * b.hl, 2 * b.ax * b.hl, 2 * b.ay * b.hl, 2 * b.az * b.hl,
          c.px - c.ax * c.hl, c.py - c.ay * c.hl, c.pz - c.az * c.hl, 2 * c.ax * c.hl, 2 * c.ay * c.hl, 2 * c.az * c.hl);
        const s = SEG[0] * 2 - 1, t = SEG[1] * 2 - 1;
        const x1 = b.px + b.ax * b.hl * s, y1 = b.py + b.ay * b.hl * s, z1 = b.pz + b.az * b.hl * s;
        const x2 = c.px + c.ax * c.hl * t, y2 = c.py + c.ay * c.hl * t, z2 = c.pz + c.az * c.hl * t;
        let nx = x1 - x2, ny = y1 - y2, nz = z1 - z2;
        const d = Math.hypot(nx, ny, nz), R = b.r + c.r;
        if (d >= R) continue;
        if (d > 1e-6) { nx /= d; ny /= d; nz /= d; } else { nx = 0; ny = 1; nz = 0; }
        if (!c.awake) { // a sleeping coil is the floor to this one, unless the bump is hard enough to wake it
          const rel = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny + (b.vz - c.vz) * nz;
          if (rel < -SPR.wake && !c.lerp) wakeUp(c);
          else { contact(a, -1, nx, ny, nz, x2 + nx * c.r, y2 + ny * c.r, z2 + nz * c.r, R - d, SPR.muSpring, 0, 0, 0, false); continue; }
        }
        contact(a, o, nx, ny, nz, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, R - d, SPR.muSpring);
      }
    }
    stats.contacts = nc;
  }
  // apply impulse j at offset r from body b's centre (sign +1 / -1)
  function push(b, jx, jy, jz, rx, ry, rz, sg) {
    b.vx += sg * jx * b.invM; b.vy += sg * jy * b.invM; b.vz += sg * jz * b.invM;
    iInv(b, sg * (ry * jz - rz * jy), sg * (rz * jx - rx * jz), sg * (rx * jy - ry * jx), T3, 0);
    b.wx += T3[0]; b.wy += T3[1]; b.wz += T3[2];
  }
  // 1/m + n . (I^-1 (r x n)) x r
  function kOf(b, rx, ry, rz, nx, ny, nz) {
    iInv(b, ry * nz - rz * ny, rz * nx - rx * nz, rx * ny - ry * nx, T3, 0);
    const cx = T3[1] * rz - T3[2] * ry, cy = T3[2] * rx - T3[0] * rz, cz = T3[0] * ry - T3[1] * rx;
    return b.invM + nx * cx + ny * cy + nz * cz;
  }
  function solve() {
    for (let it = 0; it < SPR.iters; it++) {
      for (let c = 0; c < nc; c++) {
        const k = c * CS, A = B[CA[c]], bi = CB[c], O = bi >= 0 ? B[bi] : null;
        const nx = CF[k], ny = CF[k + 1], nz = CF[k + 2], px = CF[k + 3], py = CF[k + 4], pz = CF[k + 5];
        const rax = px - A.px, ray = py - A.py, raz = pz - A.pz;
        let vx = A.vx + A.wy * raz - A.wz * ray, vy = A.vy + A.wz * rax - A.wx * raz, vz = A.vz + A.wx * ray - A.wy * rax;
        let rbx = 0, rby = 0, rbz = 0;
        if (O) { rbx = px - O.px; rby = py - O.py; rbz = pz - O.pz; vx -= O.vx + O.wy * rbz - O.wz * rby; vy -= O.vy + O.wz * rbx - O.wx * rbz; vz -= O.vz + O.wx * rby - O.wy * rbx; }
        else { vx -= CF[k + 9]; vy -= CF[k + 10]; vz -= CF[k + 11]; }
        const vn = vx * nx + vy * ny + vz * nz;
        let kn = kOf(A, rax, ray, raz, nx, ny, nz); if (O) kn += kOf(O, rbx, rby, rbz, nx, ny, nz);
        const old = CF[k + 12], jn0 = Math.max(0, old + (CF[k + 7] - vn) / kn), jn = jn0 - old;
        CF[k + 12] = jn0;
        if (jn !== 0) { push(A, nx * jn, ny * jn, nz * jn, rax, ray, raz, 1); if (O) push(O, nx * jn, ny * jn, nz * jn, rbx, rby, rbz, -1); }
        // friction against the sliding left over
        const vn2 = vn + jn * kn;
        let tx = vx + nx * jn * kn - nx * vn2, ty = vy + ny * jn * kn - ny * vn2, tz = vz + nz * jn * kn - nz * vn2;
        // (recomputed exactly is costlier; this is close: the normal impulse changed only the normal part at the point)
        const vt = Math.hypot(tx, ty, tz);
        if (vt < 1e-5) continue;
        tx /= vt; ty /= vt; tz /= vt;
        let kt = kOf(A, rax, ray, raz, tx, ty, tz); if (O) kt += kOf(O, rbx, rby, rbz, tx, ty, tz);
        const room = CF[k + 8] * CF[k + 12] - CF[k + 13];
        if (room <= 0) continue;
        const jt = Math.min(vt / kt, room);
        CF[k + 13] += jt;
        push(A, -tx * jt, -ty * jt, -tz * jt, rax, ray, raz, 1); if (O) push(O, -tx * jt, -ty * jt, -tz * jt, rbx, rby, rbz, -1);
      }
    }
  }
  function correct() { // out of what it sank into (a share each between two coils)
    for (let c = 0; c < nc; c++) {
      const k = c * CS, A = B[CA[c]], bi = CB[c], pen = CF[k + 6] - 0.001;
      if (pen <= 0) continue;
      const O = bi >= 0 ? B[bi] : null, s = Math.min(pen, 0.02) * (O ? 0.4 : 0.8);
      A.px += CF[k] * s; A.py += CF[k + 1] * s; A.pz += CF[k + 2] * s;
      if (O) { O.px -= CF[k] * s; O.py -= CF[k + 1] * s; O.pz -= CF[k + 2] * s; }
    }
  }
  function integrate(dt) {
    const lin = 1 / (1 + 0.15 * dt), ang = 1 / (1 + 0.8 * dt);
    for (let a = 0; a < N; a++) {
      const b = B[a];
      if (!b.awake) continue;
      const ln = b.touch ? lin / (1 + 0.6 * dt) : lin, an = b.touch ? ang / (1 + 2.5 * dt) : ang;   // (a coil on something soon stops rolling)
      b.touch = false;
      b.vx *= ln; b.vy *= ln; b.vz *= ln; b.wx *= an; b.wy *= an; b.wz *= an;
      b.px += b.vx * dt; b.py += b.vy * dt; b.pz += b.vz * dt;
      // q += 0.5 (w, 0) q dt
      const { qx, qy, qz, qw, wx, wy, wz } = b, h = 0.5 * dt;
      b.qx += h * (wx * qw + wy * qz - wz * qy); b.qy += h * (wy * qw + wz * qx - wx * qz); b.qz += h * (wz * qw + wx * qy - wy * qx); b.qw += h * (-wx * qx - wy * qy - wz * qz);
      const l = Math.hypot(b.qx, b.qy, b.qz, b.qw); b.qx /= l; b.qy /= l; b.qz /= l; b.qw /= l;
      axisOf(b); b.dirty = true;
      // rest
      b.age += dt;
      const v2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz, w2 = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
      if (v2 < SPR.sleepV * SPR.sleepV && w2 < SPR.sleepW * SPR.sleepW) b.still += dt; else b.still = 0;
      if (b.still > SPR.sleepT || b.age > SPR.maxAwake) sleep(b);
      // (lost: out of the room or under the floor: home)
      if (b.py < P.fy - 0.3 || b.px < P.iMinX - 0.5 || b.px > P.iMaxX + 0.5 || b.pz < P.iMinZ - 0.5 || b.pz > P.zP + 0.5) { sleep(b); toPose(b, b.home); }
    }
  }
  function step(dt) {
    for (let a = 0; a < N; a++) { const b = B[a]; if (b.awake) b.vy -= SPR.g * dt; }
    collide(); solve(); integrate(dt); correct();
    stats.steps++;
  }
  function toPose(b, p) { b.px = p[0]; b.py = p[1]; b.pz = p[2]; b.qx = p[3]; b.qy = p[4]; b.qz = p[5]; b.qw = p[6]; axisOf(b); b.dirty = true; }

  // ---------------------------------------------------------------- the network
  const OUT = [];
  function sendMine(all) {
    OUT.length = 0;
    for (const b of B) {
      if (!b.mine || (b.sent && !all)) continue;
      if (!b.awake) { b.sent = true; b.mine = false; }
      OUT.push([b.i, Math.round(b.px * 1000), Math.round(b.py * 1000), Math.round(b.pz * 1000), Math.round(b.qx * 1000), Math.round(b.qy * 1000), Math.round(b.qz * 1000), Math.round(b.qw * 1000), b.awake ? 0 : 1]);
      if (OUT.length === 40) { net.send({ t: 'springs', m: OUT.slice() }); stats.sent++; OUT.length = 0; }
    }
    if (OUT.length) { net.send({ t: 'springs', m: OUT.slice() }); stats.sent++; }
  }
  let synced = false, askedAt = -9, near = false, sendAt = 0;
  const heard = m => {
    stats.heard++;
    if (m.reset) { for (const b of B) { if (b.awake) sleep(b); b.mine = false; b.sent = true; b.lerp = false; toPose(b, b.home); } return; }
    if (m.all) { synced = true; const got = new Set(); for (const e of m.m || []) { got.add(e[0]); apply(e, true); } for (const b of B) if (!got.has(b.i) && !b.awake) { b.lerp = false; toPose(b, b.home); } return; }
    const own = m.sid != null && m.sid === net.sid;
    for (const e of m.m || []) if (!own || e[8]) apply(e, false);   // (your own echo: only the settled poses, in the server's order)
  };
  function apply(e, snap) {
    const b = B[e[0]];
    if (!b || (b.awake && b.mine)) return;    // (yours while it moves: your simulation wins until it settles and you send)
    if (b.awake) sleep(b);
    b.tx = e[1] / 1000; b.ty = e[2] / 1000; b.tz = e[3] / 1000; b.tq.set(e[4] / 1000, e[5] / 1000, e[6] / 1000, e[7] / 1000).normalize();
    b.mine = false; b.sent = true;
    if (snap || !near) { b.lerp = false; toPose(b, [b.tx, b.ty, b.tz, b.tq.x, b.tq.y, b.tq.z, b.tq.w]); }
    else b.lerp = true;
  }
  const off = net.on?.('springs', heard);
  function glide(dt) { // others' springs move toward what we heard
    const k = 1 - Math.exp(-dt * 14);
    for (const b of B) {
      if (!b.lerp) continue;
      b.px += (b.tx - b.px) * k; b.py += (b.ty - b.py) * k; b.pz += (b.tz - b.pz) * k;
      _q.set(b.qx, b.qy, b.qz, b.qw).slerp(b.tq, k); b.qx = _q.x; b.qy = _q.y; b.qz = _q.z; b.qw = _q.w; axisOf(b); b.dirty = true;
      if (Math.abs(b.tx - b.px) + Math.abs(b.ty - b.py) + Math.abs(b.tz - b.pz) < 0.002) { b.lerp = false; toPose(b, [b.tx, b.ty, b.tz, b.tq.x, b.tq.y, b.tq.z, b.tq.w]); }
    }
  }

  // ---------------------------------------------------------------- pushing
  let lpx = NaN, lpz = NaN;
  function legs(dt, atShop) {
    const p = player.pos, [px, pz] = toLocal(p.x, p.z);   // (your legs in the plan's frame)
    legOn = false;
    if (!atShop || !(dt > 0)) { lpx = NaN; return; }
    const vx = (px - lpx) / dt, vz = (pz - lpz) / dt;
    lpx = px; lpz = pz;
    if (!Number.isFinite(vx) || Math.hypot(vx, vz) > 8) return;   // (placed: no kick)
    legX = px; legY = p.y; legZ = pz; legVX = vx; legVZ = vz; legOn = true;
    // wake what you walk into
    for (const b of B) {
      if (b.awake && b.mine) continue;
      if (b.py - b.r - Math.abs(b.ay) * b.hl > p.y + SPR.legH || b.py + b.r < p.y) continue;
      const dx = b.px - px, dz = b.pz - pz, d2 = dx * dx + dz * dz, rr = SPR.legR + b.r + b.hl * Math.hypot(b.ax, b.az) + 0.03;
      // (walking into it, or standing in it: standing still beside one leaves it be)
      if (d2 < rr * rr && ((Math.hypot(vx, vz) > 0.2 && vx * dx + vz * dz > 0) || d2 < (SPR.legR + b.r - 0.03) ** 2)) wakeUp(b);
    }
  }
  function toys() { // a toy in the air in the shop knocks what it hits
    toyOn = false;
    const t = ctx.features?.find?.(f => f.name === 'dogtoys'), ball = t?.ball;
    if (!ball || ball.state !== 'loose' || !ball.moving) return;
    const [bx, bz] = toLocal(ball.x, ball.z);   // (the toy in the plan's frame; a half turn negates its speed across the floor)
    if (bx < P.iMinX || bx > P.iMaxX || bz < P.iMinZ || bz > P.zP) return;
    toy.x = bx; toy.y = ball.y; toy.z = bz; toy.vx = ball.vx * FLIP; toy.vy = ball.vy; toy.vz = ball.vz * FLIP; toyOn = true;
    for (const b of B) if (!(b.awake && b.mine) && Math.hypot(b.px - toy.x, b.py - toy.y, b.pz - toy.z) < toy.r + b.r + b.hl + 0.1) { if (b.awake) sleep(b); wakeUp(b); }
  }
  // E at the table: a hand in the heap, a few tumble out (toward you, some to the floor), the rest stir
  let rumAt = -9;
  function rummage(px, pz, now = performance.now() / 1000) {
    if (now - rumAt < 1.0) return 0;
    rumAt = now;
    const inHeap = B.filter(b => inBox(b.px, b.pz) && b.py > SB.y);
    const dx = px - SB.x, dz = pz - SB.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
    const rnd = Math.random;
    let flung = 0;
    // the ones on top go flying: the highest few
    inHeap.sort((a, b) => b.py - a.py);
    inHeap.forEach((b, n) => {
      if (b.awake) sleep(b);
      wakeUp(b);
      if (n < 4) { // out over the rim, mostly your way
        const sp = 1.2 + rnd() * 0.8, side = (rnd() - 0.5) * 1.2;
        b.vx = ux * sp + -uz * side; b.vz = uz * sp + ux * side; b.vy = 1.4 + rnd() * 0.7; flung++;
      } else { b.vx = (rnd() - 0.5) * 0.5; b.vz = (rnd() - 0.5) * 0.5; b.vy = 0.5 + rnd() * 0.6; }
      b.wx = (rnd() - 0.5) * 18; b.wy = (rnd() - 0.5) * 10; b.wz = (rnd() - 0.5) * 18;
    });
    // the spill on the table near the box jiggles
    for (const b of B) if (!b.awake && b.where !== 'heap' && Math.abs(b.py - (P.table.top + b.r)) < 0.05 && Math.hypot(b.px - SB.x, b.pz - SB.z) < 0.5) { wakeUp(b); b.vy = 0.4 + rnd() * 0.4; b.vx = (rnd() - 0.5) * 0.4; b.vz = (rnd() - 0.5) * 0.4; }
    { const [wx, wz] = toWorld(SB.x, SB.z); audio.play?.('crib-rummage', wx, SB.y + 0.2, wz); }
    return flung;
  }

  // ---------------------------------------------------------------- sounds: quiet, positional
  audio.registerSfx?.('crib-boing', (a, x, y, z, o = {}) => { // a coil landing: a little springy boing
    const out = a.at(x, y, z, 3), t = a.ctx.currentTime, k = o.k ?? 0.5, f = 260 + Math.random() * 160;
    a.tone(out, { f: f * 1.6, glide: f, t, a: 0.004, d: 0.22, peak: 0.02 + 0.03 * k, type: 'triangle' });
    a.tone(out, { f: f * 2.4, glide: f * 1.1, t: t + 0.07, a: 0.004, d: 0.16, peak: 0.012 + 0.015 * k, type: 'sine' });
  });
  audio.registerSfx?.('crib-clink', (a, x, y, z, o = {}) => { // two coils knocking
    const out = a.at(x, y, z, 2.5), t = a.ctx.currentTime, k = o.k ?? 0.5;
    a.tone(out, { f: 2200 + Math.random() * 900, t, a: 0.002, d: 0.08, peak: 0.01 + 0.02 * k });
  });
  audio.registerSfx?.('crib-rummage', (a, x, y, z) => { // a hand in a box of springs
    const out = a.at(x, y, z, 3), t = a.ctx.currentTime;
    for (let i = 0; i < 5; i++) a.tone(out, { f: 1800 + Math.random() * 1600, t: t + i * 0.05 + Math.random() * 0.03, a: 0.002, d: 0.07, peak: 0.018 });
    a.burst(out, { t, dur: 0.25, f: 3200, Q: 2, peak: 0.02 });
  });

  // ---------------------------------------------------------------- each frame
  const storeDist = (x, z) => Math.hypot(Math.max(P.minX - x, 0, x - P.maxX), Math.max(P.minZ - z, 0, z - P.maxZ));
  function update(dt, now) {
    ctx.__now = now;
    const p = player.pos, d = storeDist(p.x, p.z);
    // the shared poses: ask once you come near (and again if no answer)
    const wasNear = near;
    near = d < SPR.reach;
    if (!near) { synced = false; if (wasNear) for (const b of B) if (b.awake) sleep(b); }
    else if (!synced && now - askedAt > 3) { askedAt = now; net.send({ t: 'springsync' }); }
    const atShop = d < 1.5 && Math.abs(p.y - P.fy) < 1.2;
    if (atShop) { legs(dt, true); toys(); } else legs(dt, false);
    if (awake > 0 && atShop) {
      const t0 = performance.now();
      sndBudget = 3;
      acc = Math.min(acc + dt, SPR.dt * SPR.maxSteps);
      while (acc >= SPR.dt) { step(SPR.dt); acc -= SPR.dt; }
      stats.ms = performance.now() - t0; stats.frames++;
    } else {
      if (awake > 0) for (const b of B) if (b.awake) sleep(b);   // (walked off mid-roll: they stop where they are)
      acc = 0;
    }
    glide(dt);
    // tell the others: while yours move, a few times a second; once more as each settles
    sendAt -= dt;
    if (sendAt <= 0) {
      let any = false; for (const b of B) if (b.mine && !b.sent) { any = true; break; }
      if (any) { sendMine(false); sendAt = SPR.send; for (const b of B) if (b.mine && b.awake) b.sent = false; }
    }
    for (const b of B) if (b.dirty) draw(b);
  }
  // the hint at the table: within an arm's reach of its edge, facing it (you, turned into the plan's frame)
  function target(wx, wz, wyaw) {
    if (Math.abs(player.pos.y - P.fy) > 0.5) return null;
    const [px, pz] = toLocal(wx, wz), yaw = worldYaw(wyaw);
    const ex = Math.max(Math.abs(px - T.x) - T.w / 2, 0), ez = Math.max(Math.abs(pz - T.z) - T.d / 2, 0);
    if (Math.hypot(ex, ez) > 0.75) return null;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), dx = SB.x - px, dz = SB.z - pz, dl = Math.hypot(dx, dz) || 1;
    if ((fx * dx + fz * dz) / dl < 0.45) return null;
    return { hint: 'E  Rummage the springs', prio: 7, face: (fx * dx + fz * dz) / dl, run: () => rummage(px, pz) };
  }

  return {
    mesh, bodies: B, SPR, stats, boxes, cyls, heapY,
    update, target, rummage,
    get awake() { return awake; },
    get synced() { return synced; },
    // (tests) each spring: [x, y, z, awake, where it started, its lowest point, mine]
    poses: () => B.map(b => [+b.px.toFixed(4), +b.py.toFixed(4), +b.pz.toFixed(4), b.awake ? 1 : 0, b.where, +(b.py - Math.abs(b.ay) * b.hl - b.r).toFixed(4), b.mine ? 1 : 0]),
    moved: () => B.filter(b => Math.abs(b.px - b.home[0]) + Math.abs(b.py - b.home[1]) + Math.abs(b.pz - b.home[2]) > 0.01).length,
    dispose() { off?.(); },
  };
}
