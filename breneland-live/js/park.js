// Strickler Park's furniture, and the game-area borders where a game's mood bleeds into the ground around it.
//   Arkham Horror (in the woods): dead grass, leaf litter, mud, leafless trees, crooked fence posts, fog wisps and a pair of
//     crows that caw and flap off when you come near. (The grey ground tint is main.js / terrain.js.)
//   Unstable Unicorns (its lawn in the woods corner): bunting, bobbing balloons, and two neighbours playing catch. The throws
//     are a pure function of the shared clock, so every visitor sees the same ball in the air.
//   The park itself: benches along the trail, lamps that glow at night, bins and a fountain.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { PARK, FOUNTAIN, LOGS, SIDEWALK_W } from './layout.js';
import { terrainHeight, roadEdgeDist } from './terrain.js';
import { toon, soft, shadows } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { lampGlow, addNightSpot, LIGHT } from './daynight-mats.js';
import { balloonPop } from './areas.js';
import { addBalloon, balloonGeometry } from './balloons.js';
import { Human } from './human.js';
import { hash01, mulberry32, smoothstep } from './util.js';
import { addBenchSeats, addSeat } from './seats.js';
import { limb } from './world-trees.js';
import { registerTownSfx, fountainBed, rainbowHum } from './town-sfx.js';
import { buildFountain } from './fountain.js';

const TAU = Math.PI * 2;
const SEAT_H = 0.3; // seat-height (2026-11-07): a bench's or a log's top over the ground, where our people's feet reach it
// a sittable log: world-trees.js limb() but round (twelve sides: its top is where the seat says whichever way it lies)
const LOG_GEO = new THREE.CylinderGeometry(0.62, 1, 1, 12), _lq = new THREE.Quaternion(), _lu = new THREE.Vector3(0, 1, 0);
function logLimb(b, mat, p0, p1, r0) {
  const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), len = d.length();
  _lq.setFromUnitVectors(_lu, d.normalize());
  b.add(LOG_GEO, mat, { matrix: new THREE.Matrix4().compose(new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), _lq, new THREE.Vector3(r0, len, r0)) });
}

export function createPark(ctx) {
  const { scene, colliders, areas, player, audio, ui, net, world } = ctx;
  const g = new THREE.Group(); g.name = 'park'; scene.add(g);
  const b = new Batcher({ vertexColors: true }), sf = new Batcher({ castShadow: false, vertexColors: true });
  const rnd = mulberry32(31);
  const updaters = [];
  const NOWHERE = { add() {} };
  const clearOf = (x, z, pad) => !world.onTrail(x, z, pad) && !areas.some(a => Math.hypot(x - a.x, z - a.z) < 7 + pad) && !colliders.some(c => c.type === 'circle' && Math.hypot(x - c.x, z - c.z) < c.r + pad);

  // ---- the park: benches, lamps, bins, fountain
  // (PARK.sign in layout.js is only a spot now, the community board by the fountain does the welcoming. The sign's clearing and
  // the residents' walk still use it.)
  // nothing of the park's stands on a path: a prop that lands on one is nudged sideways until it's clear
  const offTrail = (x, z, r) => { if (!world.onTrail(x, z, r + 0.7)) return [x, z]; for (let d = 1.5; d < 9; d += 1.5) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, nx = x + Math.cos(a) * d, nz = z + Math.sin(a) * d; if (!world.onTrail(nx, nz, r + 0.7) && clearOf(nx, nz, r)) return [nx, nz]; } return [x, z]; }; // (r + 0.7: a prop stands at least 0.6 m off a path's edge)
  const bench = (x0, z0, yaw) => {
    const [x, z] = offTrail(x0, z0, 1.0);
    const y = terrainHeight(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
    addBenchSeats(x, z, y + 0.3, yaw, 'park bench'); // (seat-height: the seat 0.3 up, was 0.4)
    colliders.push({ type: 'box', minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.4, maxZ: z + 0.4 });
    if (propsReady('bench_plank')) { addProp(b, 'bench_plank', { x, y, z, yaw }, { skin: 'park' }); return; } // (props-static)
    b.add(GEO.box, '#8a6240', { x, y: y + 0.265, z, sx: 1.7, sy: 0.07, sz: 0.45, ry: yaw });
    b.add(GEO.box, '#8a6240', { x: x - s * 0.22, y: y + 0.56, z: z - c * 0.22, sx: 1.7, sy: 0.4, sz: 0.06, ry: yaw });
    for (const k of [-0.7, 0.7]) b.add(GEO.box, '#3a3f47', { x: x + c * k, y: y + 0.115, z: z - s * k, sx: 0.08, sy: 0.23, sz: 0.42, ry: yaw });
  };
  const lamp = (x0, z0) => { const [x, z] = offTrail(x0, z0, 0.2); const y = terrainHeight(x, z); if (propsReady('post_lantern')) addProp(b, 'post_lantern', { x, y, z }); else { b.add(GEO.cyl6, '#3a3f47', { x, y: y + 1.6, z, sx: 0.08, sy: 3.2, sz: 0.08 }); b.add(GEO.box, lampGlow('#fff3c4'), { x, y: y + 3.25, z, sx: 0.32, sy: 0.32, sz: 0.32 }); } addNightSpot({ x, y: y + 3.2, z, color: '#ffd98e', pool: 3.2, gy: y, halo: 1.1 }); colliders.push({ type: 'circle', x, z, r: 0.14 }); }; // (props-static: the post office's lantern post, its light 3.2 up as before)
  const bin = (x0, z0) => { const [x, z] = offTrail(x0, z0, 0.35); const y = terrainHeight(x, z); b.add(GEO.cyl8, '#4f6b3f', { x, y: y + 0.45, z, sx: 0.28, sy: 0.9, sz: 0.28 }); b.add(GEO.cyl8, '#3a4a2e', { x, y: y + 0.92, z, sx: 0.3, sy: 0.06, sz: 0.3 }); colliders.push({ type: 'circle', x, z, r: 0.3 }); };
  for (const [x, z, yaw] of [[-51.6, -15.7, 0], [-58, -9.5, 0.5], [-56, 6, Math.PI / 2], [-70, -22, 0.3], [-90, -30, 0.6], [-75.9, 28.5, 3.46]]) bench(x, z, yaw); // (the last one watches the sand pit, off the hill's slope)
  for (const [x, z] of [[-46, -10], [-55, -1], [-59, 13.5], [-76, -25], [-92, -36], [-88, -38]]) lamp(x, z);
  for (const [x, z] of [[-53.1, -15.8], [-57, 8.5], [-72, -20]]) bin(x, z); // (the first two sit in the corner between the park path and the garden's path, the bin at the bench's end)
  // ---- the fountain where the park trails meet (layout.js FOUNTAIN; its clearing keeps the grass out of the basin): fountain.js,
  // the PM's Blender fountain (fountain-v3). The splash bed and the plips when you're near are below.
  registerTownSfx(audio);
  const fx = FOUNTAIN.x, fz = FOUNTAIN.z, fy = terrainHeight(fx, fz);
  const fountain = buildFountain({ b, g, fx, fy, fz, FR: FOUNTAIN.r, colliders, updaters });
  const lands = fountain.lands;
  let fbed = null, nextPlip = 0;

  // ---- fallen logs you can sit on (layout.js LOGS; the scout camp's and the campfire ring's logs are their own files)
  for (const L of LOGS) {
    const y = terrainHeight(L.x, L.z), ax = Math.sin(L.axis), az = Math.cos(L.axis), h = L.len / 2, drift = L.id === 'driftwood';
    // seat-height: a slimmer log lying along the ground (each end on the ground under it), its top 0.3 m up all along: the feet on the
    // ground in front (it was 0.25 / 0.2 round, its top 0.43-0.63 up on the meadow's slope)
    const r = drift ? 0.14 : 0.15, bark = drift ? '#cdb89b' : '#6b4a2e', end = drift ? '#e4d6bc' : '#c9a26b';
    const topOff = t => r + 0.1 * r * t + r * 1.15 * (1 - 0.38 * t), sink = topOff(0.5) - SEAT_H; // (the round log's top over its foot line at t along it, root to tip)
    const fX = Math.sin(L.face) * 0.3, fZ = Math.cos(L.face) * 0.3, gAt = (x, z) => Math.min(terrainHeight(x, z), terrainHeight(x + fX, z + fZ)); // (the ground there or where the feet go, the lower: on the meadow's slope the log beds into the bank behind)
    const yA = gAt(L.x - ax * h, L.z - az * h) - sink, yB = gAt(L.x + ax * h, L.z + az * h) - sink;
    logLimb(b, bark, [L.x - ax * h, yA + r, L.z - az * h], [L.x + ax * h, yB + r * 1.1, L.z + az * h], r * 1.15); // the root end is fatter
    b.add(GEO.cyl8, end, { x: L.x - ax * (h + 0.02), y: yA + r, z: L.z - az * (h + 0.02), sx: r * 1.1, sy: 0.05, sz: r * 1.1, rx: Math.PI / 2, ry: L.axis });
    b.add(GEO.cyl8, end, { x: L.x + ax * (h + 0.01), y: yB + r * 1.1, z: L.z + az * (h + 0.01), sx: r * 0.7, sy: 0.05, sz: r * 0.7, rx: Math.PI / 2, ry: L.axis });
    const yAt = k => yA + (yB - yA) * (k + h) / (2 * h); // (the log's foot at k along it)
    const bx = L.x + ax * h * 0.35, bz = L.z + az * h * 0.35;                        // a branch stub
    limb(b, bark, [bx, yAt(h * 0.35) + r * 1.6, bz], [bx - az * 0.35, yAt(h * 0.35) + r + 0.55, bz + ax * 0.35], 0.07);
    if (drift) { for (let i = 0; i < 4; i++) b.add(GEO.dodec, i % 2 ? '#d8cdb8' : '#9a9b93', { x: L.x + ax * (i - 1.5) * 0.5 - az * 0.5, y: y + 0.05, z: L.z + az * (i - 1.5) * 0.5 + ax * 0.5, sx: 0.08, sy: 0.06, sz: 0.08, ry: i }); } // pebbles and shells
    else { for (let i = 0; i < 3; i++) { const mk = [-0.5, 0.5, h - 0.15][i]; b.add(GEO.ico1, '#6f9a3a', { x: L.x + ax * mk, y: yAt(mk) + topOff((mk + h) / (2 * h)) - 0.055, z: L.z + az * mk + (i % 2 ? 0.06 : -0.06), sx: 0.22, sy: 0.07, sz: 0.16, ry: i * 1.3 }); } // moss (between the seats: a ray down at a seat finds the log)
      for (let i = 0; i < 2; i++) { const mx = L.x - az * 0.5 + ax * (i ? 0.6 : -0.9), mz = L.z + ax * 0.5 + az * (i ? 0.6 : -0.9); b.add(GEO.cyl8, '#f3ead8', { x: mx, y: y + 0.08, z: mz, sx: 0.03, sy: 0.16, sz: 0.03 }); b.add(GEO.sphere, '#c97a4a', { x: mx, y: y + 0.17, z: mz, sx: 0.09, sy: 0.05, sz: 0.09 }); } } // little mushrooms
    for (const k of [-h * 0.62, 0, h * 0.62]) colliders.push({ type: 'circle', x: L.x + ax * k, z: L.z + az * k, r: 0.42 });
    { const n = L.len > 2.4 ? 3 : 2; // (seats.js addLogSeats, each seat on the log's top over its own ground)
      for (let i = 0; i < n; i++) { const k = (i - (n - 1) / 2) * (L.len / n); addSeat(L.x + ax * k, L.z + az * k, yAt(k) + topOff((k + h) / (2 * h)), L.face, L.name, 'E  Sit on the ' + L.name); } }
  }

  // ---- Arkham's border
  const ark = areas.find(a => a.game?.theme === 'arkham');
  const crows = [];
  if (ark) {
    const ax = ark.x, az = ark.z;
    for (let i = 0; i < 160; i++) { // dead grass and leaf litter, thinning outward
      const a = rnd() * 6.283, r = 7.5 + Math.pow(rnd(), 0.7) * 15, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
      if (!clearOf(x, z, 0.3)) continue;
      const y = terrainHeight(x, z), to = roadEdgeDist(x, z) > SIDEWALK_W + 0.3 ? sf : NOWHERE; // none on the road or its sidewalks (same draws, so the rest stays put)
      if (rnd() < 0.6) { to.add(GEO.cone6, rnd() < 0.5 ? '#8a7f4a' : '#6f6a3c', { x, y: y + 0.18, z, sx: 0.08, sy: 0.36, sz: 0.08, rz: (rnd() - 0.5) * 0.8, ry: rnd() * 6 }); }
      else to.add(GEO.box, rnd() < 0.5 ? '#6b4a2b' : '#8a5a3a', { x, y: y + 0.02, z, sx: 0.18, sy: 0.01, sz: 0.12, ry: rnd() * 6 });
    }
    for (let i = 0; i < 5; i++) { // mud puddles
      const a = i * 1.3 + 0.4, r = 9 + i * 1.8, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
      if (!clearOf(x, z, 1)) continue;
      sf.add(GEO.cyl12, '#3f3428', { x, y: terrainHeight(x, z) + 0.015, z, sx: 1.1 + i * 0.2, sy: 0.02, sz: 0.8 + i * 0.15, ry: a });
    }
    for (let i = 0; i < 4; i++) { // leafless trees
      const a = i * 1.6 + 0.9, r = 11 + i * 1.5, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
      if (!clearOf(x, z, 1.2)) continue;
      const y = terrainHeight(x, z);
      b.add(GEO.cyl6, '#3b3129', { x, y: y + 2.2, z, sx: 0.22, sy: 4.6, sz: 0.22, rz: (rnd() - 0.5) * 0.15 });
      for (let k = 0; k < 4; k++) { const la = k * 1.7 + i; b.add(GEO.cyl6, '#3b3129', { x: x + Math.cos(la) * 0.7, y: y + 3.4 + k * 0.4, z: z + Math.sin(la) * 0.7, sx: 0.07, sy: 1.8, sz: 0.07, rz: 0.9, ry: -la }); }
      colliders.push({ type: 'circle', x, z, r: 0.3 });
    }
    for (let i = 0; i < 7; i++) { // crooked old fence posts with a sagging wire
      const a = 2.2 + i * 0.22, r = 13, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
      if (!clearOf(x, z, 0.5)) continue;
      b.add(GEO.box, '#5a4a3c', { x, y: terrainHeight(x, z) + 0.55, z, sx: 0.12, sy: 1.2, sz: 0.12, rz: (rnd() - 0.5) * 0.35, rx: (rnd() - 0.5) * 0.3 });
      colliders.push({ type: 'circle', x, z, r: 0.15 });
    }
    // fog wisps: soft planes that drift round the plaza
    const wispMat = new THREE.MeshBasicMaterial({ color: '#b9b8c2', transparent: true, opacity: 0.22, depthWrite: false, fog: true });
    const wisps = [];
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(5 + i, 1.4), wispMat); m.rotation.x = -Math.PI / 2; g.add(soft(m)); wisps.push(m); }
    updaters.push((dt, t) => { wisps.forEach((m, i) => { const a = t * 0.05 + i * 0.8, r = 8 + (i % 3) * 3; m.position.set(ax + Math.cos(a) * r, terrainHeight(ax + Math.cos(a) * r, az + Math.sin(a) * r) + 0.35 + Math.sin(t * 0.7 + i) * 0.1, az + Math.sin(a) * r); m.rotation.z = a; m.material.opacity = 0.16 + 0.1 * Math.sin(t * 0.4 + i); }); });
    // two crows on the posts
    audio.registerSfx?.('crow', (a, x, y, z) => { const o = a.at(x, y, z, 6); const t = a.ctx.currentTime; a.tone(o, { f: 540, glide: 380, t, d: 0.2, peak: 0.08, type: 'sawtooth' }); a.tone(o, { f: 520, glide: 360, t: t + 0.26, d: 0.2, peak: 0.07, type: 'sawtooth' }); a.burst(o, { t: t + 0.5, dur: 0.3, f: 1200, Q: 0.7, peak: 0.08 }); });
    for (let i = 0; i < 2; i++) {
      const a = 2.3 + i * 0.66, x = ax + Math.cos(a) * 13, z = az + Math.sin(a) * 13, y = terrainHeight(x, z) + 1.15;
      const c = new THREE.Group();
      const mk = (geo, col, sx, sy, sz, px2, py2, pz2) => { const m = new THREE.Mesh(geo, toon(col)); m.scale.set(sx, sy, sz); m.position.set(px2, py2, pz2); c.add(m); return m; };
      mk(GEO.sphere, '#1e1a1e', 0.15, 0.12, 0.22, 0, 0.12, 0); mk(GEO.sphere, '#1e1a1e', 0.09, 0.09, 0.09, 0, 0.25, 0.16); const bk = mk(GEO.cone6, '#3a3a3a', 0.03, 0.09, 0.03, 0, 0.24, 0.26); bk.rotation.x = Math.PI / 2;
      const wl = mk(GEO.box, '#1e1a1e', 0.3, 0.02, 0.16, -0.17, 0.16, 0), wr = mk(GEO.box, '#1e1a1e', 0.3, 0.02, 0.16, 0.17, 0.16, 0);
      c.position.set(x, y, z); c.rotation.y = a + Math.PI; g.add(c);
      crows.push({ c, x, y, z, wl, wr, fly: 0, back: 0, cawAt: 0 });
    }
  }

  // ---- the unicorn lawn's border: bunting, balloons and a game of catch
  const bobbers = [], sparkFx = [], cloudFx = [], uniFx = { arch: null, table: null, balloons: [], popped: [], hum: null, next: { horn: 0, kazoo: 0, confetti: 0 }, lastTwinkle: 0 };
  const uni = areas.find(a => a.game?.theme === 'unicorns');
  const players = [];
  let ball = null, ballA = null, ballB = null;
  if (uni) {
    const ux = uni.x, uz = uni.z;
    // Nothing of the lawn's stands on a path (0.6 m off its edge) or in a tree: a spot that lands on one is turned a little further
    // round the lawn. ring(a, R): the spot at angle a, R m out. turn(a0, ok): the angle nearest a0 that's ok.
    const ring = (a, R) => [ux + Math.cos(a) * R, uz + Math.sin(a) * R];
    const solidNear = (x, z, pad) => colliders.some(c => (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) < c.r + pad : x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad));
    const lawnOK = ([x, z], r) => !world.onTrail(x, z, r + 0.7) && !solidNear(x, z, r + 0.3) && roadEdgeDist(x, z) > SIDEWALK_W + 1;
    const turn = (a0, ok) => { for (let k = 0; k < 60; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05; if (ok(a)) return a; } return a0; };
    for (let i = 0; i < 2; i++) { // bunting between two poles on the lawn's edge
      const R = 9.8, a = turn(0.9 + i * 2.2, a => lawnOK(ring(a, R), 0.1) && lawnOK(ring(a + 0.9, R), 0.1)), x0 = ux + Math.cos(a) * R, z0 = uz + Math.sin(a) * R, x1 = ux + Math.cos(a + 0.9) * R, z1 = uz + Math.sin(a + 0.9) * R; // (R: the poles stand clear of the ring path round the lawn)
      for (const [x, z] of [[x0, z0], [x1, z1]]) { b.add(GEO.cyl6, '#f4f2ea', { x, y: terrainHeight(x, z) + 1.3, z, sx: 0.05, sy: 2.6, sz: 0.05 }); colliders.push({ type: 'circle', x, z, r: 0.1 }); }
      const n = 12;
      for (let k = 0; k <= n; k++) { const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, sag = Math.sin(t * Math.PI) * 0.5; sf.add(GEO.cone6, ['#ff8fb8', '#6fd3ff', '#fff27a', '#9dff7a'][k % 4], { x, y: terrainHeight(x, z) + 2.55 - sag, z, sx: 0.16, sy: 0.3, sz: 0.02, rx: Math.PI, ry: -Math.atan2(z1 - z0, x1 - x0) }); }
    }
    const balloons = [];
    // the lawn's balloons, each on a string pegged into the grass and ending at the knot under the balloon. The sway follows the
    // shared clock and a passer-by sends one bouncing (balloons.js)
    for (let i = 0; i < 6; i++) { const a = turn(i * 1.05 + 0.3, a => lawnOK(ring(a, 10.5), 0.3)), x = ux + Math.cos(a) * 10.5, z = uz + Math.sin(a) * 10.5, y = terrainHeight(x, z); const m = new THREE.Mesh(balloonGeometry(), toon(['#ff6fa8', '#6fd3ff', '#fff27a', '#c9a6ff', '#9dff7a', '#ff9f43'][i])); m.scale.set(0.3, 0.36, 0.3); g.add(m); const s = new THREE.Mesh(GEO.cyl6, toon('#f4f2ea')); s.scale.set(0.01, 2.0, 0.01); g.add(s); addBalloon({ ball: m, string: s, anchor: { x, y: y + 0.02, z }, len: 2.0, ph: i }); balloons.push({ m, x, y: y + 2.4, z, ph: i }); }
    // catch: Tess and Rudy, 9 m apart on the lawn north of the plaza (or the nearest stretch round it where both stand off the
    // paths, the road and every prop, and the ball's flight passes 2.5 m clear of every trunk and pole). The ball flies
    // A -> B -> A every 3 s
    const catchAt = th => { const mx = ux + Math.cos(th) * 11, mz = uz + Math.sin(th) * 11, px = -Math.sin(th) * 4.5, pz = Math.cos(th) * 4.5; return [[mx - px, mz - pz], [mx + px, mz + pz]]; };
    const th = turn(-Math.PI / 2, th => { const [A, B] = catchAt(th); if (!lawnOK(A, 0.6) || !lawnOK(B, 0.6)) return false; for (let k = 0; k <= 8; k++) if (solidNear(A[0] + (B[0] - A[0]) * k / 8, A[1] + (B[1] - A[1]) * k / 8, 2.5)) return false; return true; });
    [ballA, ballB] = catchAt(th);
    for (const [i, [x, z]] of [ballA, ballB].entries()) {
      const h = new Human(i ? { shirt: '#fff27a', pants: '#3f5f8f', hair: '#c9873a', hairStyle: 'pony', skin: '#f6d3b3', height: 0.72, shape: 0.9, eyeStyle: 'hooded' } : { shirt: '#6fd3ff', pants: '#2e2e36', hair: '#1e1a18', hairStyle: 'spiky', skin: '#a86b45', height: 0.76, eyeStyle: 'hooded' });
      h.root.position.set(x, terrainHeight(x, z), z); h.root.rotation.y = Math.atan2((i ? ballA : ballB)[0] - x, (i ? ballA : ballB)[1] - z); scene.add(h.root);
      const tag = ui.nameTag(h.root, i ? 'Tess' : 'Rudy', '#ffffff'); tag.max = 14; tag.fade = 9;
      players.push(h);
    }
    ball = new THREE.Mesh(GEO.sphere, toon('#ff6b6b')); ball.scale.setScalar(0.12); ball.castShadow = true; scene.add(ball);
    // the lawn's sounds (town-sfx.js), timed to the visuals: the plaza's balloons and sparkles come from areas.js (fx)
    const fx2 = uni.npcSpec?.fx;
    if (fx2) {
      for (const bl of fx2.balloons) bobbers.push({ x: bl.x, y: bl.y, z: bl.z, w: 1.1, ph: bl.ph, sign: 0 });
      for (const s of fx2.sparks) sparkFx.push({ u: s, cyc: -1 });
      for (const c of fx2.clouds) cloudFx.push({ x: c.x, z: c.z, inside: false });
      uniFx.arch = fx2.arch; uniFx.table = fx2.table; uniFx.balloons = fx2.balloons;
    }
    for (const bl of balloons) bobbers.push({ x: bl.x, y: bl.y, z: bl.z, w: 1.3, ph: bl.ph, sign: 0 });
  }
  b.build(g, 'park'); sf.build(g, 'park-soft').forEach(m => soft(m));
  shadows(g);
  for (const o of fountain.meshes) o.castShadow = false; // see-through water, foam and drops cast no shadow (shadows(g) turns them on, and unculled they'd be drawn into every shadow map)

  return {
    name: 'park',
    update(dt, now) {
      for (const u of updaters) u(dt, now);
      const px = player.pos.x, pz = player.pos.z;
      // the fountain's splash bed and plips, by distance
      if (audio.ctx && audio.amb) {
        const fd = Math.hypot(px - fx, pz - fz);
        if (fd < 42 && !fbed) fbed = fountainBed(audio, fx, fy + 1.2, fz);
        if (fbed) { if (fd > 52) { fbed.stop(); fbed = null; } else fbed.set(Math.pow(Math.max(0, 1 - fd / 44), 1.4) * 0.9); }
        if (fd < 16 && now > nextPlip) { nextPlip = now + 0.5 + Math.random() * 1.4; const L = lands[Math.floor(Math.random() * lands.length)]; audio.play?.(Math.random() < 0.6 ? 'fountain-plip' : 'fountain-splash', L[0], fy + 0.5, L[1]); }
      }
      // the unicorn lawn: balloons squeak and creak as they bob and now and then pop, sparkles twinkle, the clouds
      // whoosh as you walk through, the rainbow hums as you walk under it, and the party at the table never stops
      if (uni) {
        const ud = Math.hypot(px - uni.x, pz - uni.z);
        if (ud < 34) {
          for (const bb of bobbers) {
            const c = Math.sign(Math.cos(now * bb.w + bb.ph)) || 1;
            if (c !== bb.sign) {
              if (bb.sign !== 0 && Math.hypot(px - bb.x, pz - bb.z) < 14) { const r = Math.random(); if (r < 0.22) audio.play?.('uni-squeak', bb.x, bb.y, bb.z); else if (r < 0.34) audio.play?.('uni-creak', bb.x, bb.y - 0.8, bb.z); }
              bb.sign = c;
            }
          }
          uniFx.balloons.forEach((bl, i) => {
            const p = balloonPop(i, now);
            if (p.popped && !uniFx.popped[i]) { audio.play?.('uni-pop', bl.x, bl.y, bl.z); if (uniFx.table) setTimeout(() => audio.play?.('uni-giggle', uniFx.table.x + 1.2, 1.3, uniFx.table.z + 0.8), 420); }
            uniFx.popped[i] = p.popped;
          });
          for (const s of sparkFx) {
            const cyc = Math.floor((now * 3 + s.u.ph) / TAU);
            if (cyc !== s.cyc) {
              const first = s.cyc === -1; s.cyc = cyc;
              const a = s.u.a + now * s.u.sp, sx = uni.x + Math.cos(a) * s.u.r, sz = uni.z + Math.sin(a) * s.u.r;
              if (!first && Math.hypot(px - sx, pz - sz) < 12 && now - uniFx.lastTwinkle > 0.45 && Math.random() < 0.35) { uniFx.lastTwinkle = now; audio.play?.('uni-twinkle', sx, terrainHeight(uni.x, uni.z) + s.u.h, sz); }
            }
          }
          for (const c of cloudFx) { const inside = Math.hypot(px - c.x, pz - c.z) < 2.4; if (inside && !c.inside) audio.play?.('uni-whoosh', c.x, 1.4, c.z); c.inside = inside; }
          if (uniFx.table && ud < 30 && audio.ctx) {
            const nx = uniFx.next;
            for (const [k, a, bq, name] of [['horn', 14, 28, 'uni-horn'], ['kazoo', 20, 45, 'uni-kazoo'], ['confetti', 30, 70, 'uni-confetti']]) {
              if (!nx[k]) nx[k] = now + Math.random() * bq;
              if (now >= nx[k]) { nx[k] = now + a + Math.random() * (bq - a); const ang = Math.random() * TAU; audio.play?.(name, uniFx.table.x + Math.cos(ang) * 1.6, 1.2, uniFx.table.z + Math.sin(ang) * 1.6); }
            }
          }
        }
        if (uniFx.arch && audio.ctx && audio.amb) {
          const ad = Math.hypot(px - uniFx.arch.x, pz - uniFx.arch.z);
          if (!uniFx.hum && ad < 20) uniFx.hum = rainbowHum(audio, uniFx.arch.x, uniFx.arch.y, uniFx.arch.z);
          if (uniFx.hum) { if (ad > 26) { uniFx.hum.stop(); uniFx.hum = null; } else uniFx.hum.set(smoothstep(16, 4, ad) * 0.9, 1 + 0.35 * smoothstep(7, 0.6, ad)); }
        }
      }
      // crows: flap off when you get close, come back a while later
      for (const cr of crows) {
        const d = Math.hypot(player.pos.x - cr.x, player.pos.z - cr.z);
        if (cr.fly <= 0 && cr.back <= 0 && d < 7) { cr.fly = 3; audio.play?.('crow', cr.x, cr.y, cr.z); }
        if (cr.fly > 0) { cr.fly -= dt; cr.c.position.y += dt * 2.5; cr.c.position.x += Math.cos(cr.c.rotation.y) * dt * 3; cr.c.position.z -= Math.sin(cr.c.rotation.y) * dt * 3; const f = Math.sin(now * 18) * 0.6; cr.wl.rotation.z = f; cr.wr.rotation.z = -f; if (cr.fly <= 0) { cr.c.visible = false; cr.back = 25; } }
        else if (cr.back > 0) { cr.back -= dt; if (cr.back <= 0) { cr.c.visible = true; cr.c.position.set(cr.x, cr.y, cr.z); cr.wl.rotation.z = cr.wr.rotation.z = 0; } }
        else if (now > cr.cawAt && d < 30) { cr.cawAt = now + 9 + hash01('caw', Math.floor(now)) * 12; audio.play?.('crow', cr.x, cr.y, cr.z); }
      }
      // catch
      if (ball) {
        const t = net.serverNow() / 1000, T = 3.0, k = (t % (2 * T)) / T, toB = k < 1, u = toB ? k : k - 1;
        const A = toB ? ballA : ballB, B = toB ? ballB : ballA;
        const h = 1.4 + Math.sin(u * Math.PI) * 2.4;
        ball.position.set(A[0] + (B[0] - A[0]) * u, terrainHeight(A[0], A[1]) + h, A[1] + (B[1] - A[1]) * u);
        players.forEach((p, i) => { const throwing = (toB && i === 0) || (!toB && i === 1); p.update(dt, now, 0, u < 0.25 && throwing ? 'throw' : u > 0.8 && !throwing ? 'catch' : 'idle'); });
      }
    },
    bodies() { return players.map(p => ({ x: p.root.position.x, z: p.root.position.z, r: 0.3 })); },
    api: { fountain: fountain.api },
  };
}
