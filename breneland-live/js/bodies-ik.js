// World-aware IK for human.js: the arm solver and the targets poses set for the hands (a table top, the other hand's book or pole),
// a ceiling that keeps hands above a table they're over, and the feet on the real ground (slopes, steps, porches). The rig has no
// forearm twist, so the hand's facing is the arm's plane. Everything is a function of shared state (root, pose, ground), so two
// clients agree. IK runs only for people near the camera, and allocates nothing per frame.
import * as THREE from 'three';
import { clamp } from './bodies-geo.js';
import { view } from './perf-flags.js';

export const IK_WORLD = {
  ground: null,  // (x, z) -> the ground's height there (main.js: terrain.js groundHeight). null: flat at the root (the editor, tests)
  near: 28,      // m from the camera within which the IK runs (the near LOD); no camera (tests): everyone
  on: true,      // off: the poses with no IK (tests)
  stiffIdle: false, // the old stiff A-pose standing idle (for before pictures)
  climb: null,   // (x, y, z, scale, outL, outR) -> which hands (bit 1 left, 2 right) have a grip for a climber standing there; the
                 // grip points go into outL / outR in world space (water-tower.js; bodies-poses.js climb puts the hands on them)
};
export const IK_DROP = 0.24, IK_RAISE = 0.34; // m below / above the root's plane a foot follows the ground (further off: not the ground this person stands on)
export const HIP_DROP = 0.2;                  // m at most the hips come down so a planted foot reaches a lower step
export const PALM_CLEAR = 0.004;              // m a resting palm (or a held thing) sits above a table top
export const GROUND_EASE = 11;                // 1/s: how fast a foot's ground sample follows a jump (a step edge mid-swing)

// Is this person near enough to the camera for IK this frame?
export function ikNear(root) {
  if (!IK_WORLD.on) return false;
  const c = view.camera;
  if (!c) return true;
  const dx = c.position.x - root.position.x, dz = c.position.z - root.position.z;
  return dx * dx + dz * dz < IK_WORLD.near * IK_WORLD.near;
}

// A point of the hand in the wrist's frame (metres at scale 1, before the hand's own size hw / hl): the palm's surface
// (where a hand rests flat on something), the grip hollow (bodies-hands gripAt: where a handle runs through the fist) or the wrist.
const HAND_SIZE = 1.45; // (bodies-hands.js)
export function handPoint(kind, side, hw, hl, out) {
  if (kind === 'anchor') return out.set(-side * 0.024 * HAND_SIZE, -0.078 * HAND_SIZE, 0.004 * HAND_SIZE); // (gripAt: the anchor is not scaled with the hand)
  if (kind === 'palm') return out.set(-side * 0.035 * HAND_SIZE * hw, -0.08 * HAND_SIZE * hl, 0.003 * HAND_SIZE * hw);
  if (kind === 'rest') return out.set(-side * REST_PT[0] * hw, REST_PT[1] * hl, REST_PT[2] * hw);     // (a relaxed hand's lowest point when it rests tilted REST_FACE)
  if (kind === 'restg') return out.set(-side * REST_PTG[0] * hw, REST_PTG[1] * hl, REST_PTG[2] * hw); // (a fist's: a hand holding something, resting)
  return out.set(0, 0, 0);
}
// A hand resting on a table tilts a little onto its outer edge. With no forearm twist, a palm flat down would put the elbow out
// sideways; tilted, the elbow drops toward the body. The palm's facing, and the hand's lowest point in the wrist's frame (metres
// at the standard hand size, measured in the studio for the relaxed hand and the fist).
export const REST_FACE = (side, out) => out.set(-side * 0.45, -1, 0).normalize();
export const REST_PT = [0.047 * HAND_SIZE, -0.117 * HAND_SIZE, -0.041 * HAND_SIZE]; // (the relaxed hand is cupped. On the high side: a hand that comes out a little low gets lifted onto the top by the ceiling)
export const REST_PTG = [0.031 * HAND_SIZE, -0.102 * HAND_SIZE, -0.054 * HAND_SIZE];

// The corners of a held thing's box in its own frame, kept on it at build (userData.corners; userData.upright for what hangs
// level whatever the hand does: the lantern, the candle, the balloon). human.js finds the thing's lowest point from them each
// frame it matters (a hand over a table top), whatever way the hand is turned.
export function keepCorners(obj, upright = false, hull = false) {
  obj.updateWorldMatrix(false, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), box = new THREE.Box3();
  // (a hull: the vertex furthest along each of HULL_DIRS, so a rounded thing's lowest point is read closely whatever way it is turned;
  // a box's corners would put a hand's lowest point centimetres under where it is)
  const best = hull ? HULL_DIRS.map(() => [-Infinity, 0, 0, 0]) : null;
  obj.traverse(mesh => {
    if (!mesh.isMesh) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (!hull) { box.expandByPoint(v); continue; }
      for (let d = 0; d < HULL_DIRS.length; d++) { const D = HULL_DIRS[d], e = v.x * D[0] + v.y * D[1] + v.z * D[2]; if (e > best[d][0]) { best[d][0] = e; best[d][1] = v.x; best[d][2] = v.y; best[d][3] = v.z; } }
    }
  });
  if (hull) {
    const c = new Float32Array(HULL_DIRS.length * 3);
    for (let d = 0; d < HULL_DIRS.length; d++) { c[d * 3] = best[d][1]; c[d * 3 + 1] = best[d][2]; c[d * 3 + 2] = best[d][3]; }
    obj.userData.corners = c; obj.userData.upright = false;
    return;
  }
  if (box.isEmpty()) return;
  const c = new Float32Array(24);
  for (let k = 0; k < 8; k++) { c[k * 3] = k & 1 ? box.max.x : box.min.x; c[k * 3 + 1] = k & 2 ? box.max.y : box.min.y; c[k * 3 + 2] = k & 4 ? box.max.z : box.min.z; }
  obj.userData.corners = c; obj.userData.upright = upright;
}
const HULL_DIRS = (() => { // 74 ways: the 26 of a cube's faces, edges and corners, and the 48 between them (a hand's lowest point read within 3 mm whichever way it is turned)
  const d = [], seen = new Set();
  const put = (x, y, z) => { const k = x + ',' + y + ',' + z; if (seen.has(k) || (!x && !y && !z)) return; seen.add(k); const l = Math.hypot(x, y, z); d.push([x / l, y / l, z / l]); };
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) put(x, y, z);
  for (const a of [-1, 1]) for (const b of [-2, 2]) { put(a, b, 0); put(a, 0, b); put(0, a, b); put(b, a, 0); put(b, 0, a); put(0, b, a); }
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-2, 2]) { put(a, b, c); put(a, c, b); put(c, a, b); }
  return d;
})();

// What a pose asks of one arm this frame (set by bodies-poses.js, read by human.js). The position is in the root's frame
// (unscaled units, x left, y up, z forward), or the head's when `frame` is 'head'; the weight is the blended pose channel
// (lik / rik), eased a little more here (w), so a target that appears mid-pose fades in too. Written fresh every frame the pose asks.
export class ArmTarget {
  constructor() {
    this.on = false;        // asked (stays until the weight has faded out)
    this.frame = 'root';    // 'root' | 'head'
    this.point = 'palm';    // which point of the hand lands on the target: 'palm' | 'anchor' | 'wrist'
    this.pos = new THREE.Vector3();
    this.facing = null;     // null | 'palm' | 'thumb': which hand axis `dir` fixes (the palm's facing, or the thumb's (the wrist's z: a handle through the fist runs along it))
    this.dir = new THREE.Vector3(0, -1, 0);
    this.pole = new THREE.Vector3(0, -1, 0); // which way the elbow goes when the facing does not decide it (chest frame; the pose gives it for its side)
    this.follow = null;     // 'rod' | 'book' | 'notepad': the point is found each frame from the other hand's thing (human.js)
    this.rest = false;      // a hand put down on a table top (bodies-poses tableRest): human.js's ceiling then knows its lowest point
    this.idle = false;      // a hand hanging beside the thigh at ease (bodies-poses relaxedHands): the arm fit re-tests it lazily
    this.lay = false;       // a forearm laid along a bar (a camp chair's armrest, bodies-poses chairArms): pos is the bar's line in the
                            // root frame (x, the forearm bone's height over it, z how much higher the wrist rides); human.js finds the elbow on that line from the real shoulder
    this.pick = 'facing';   // which side of the shoulder-to-hand line the elbow goes: the side that best gives the facing, or 'pole': the hinted side (the facing then as it comes: an elbow through the body is worse than a palm turned away)
    this.w = 0;             // the eased weight
  }
  set(frame, point, x = 0, y = 0, z = 0) { this.on = true; this.frame = frame; this.point = point; this.pos.set(x, y, z); this.dir.set(0, -1, 0); this.facing = null; this.pole.set(0.5, -1, -0.2); this.follow = null; this.pick = 'facing'; this.rest = false; this.idle = false; this.lay = false; return this; }
  // the pose's arms swapped (bodies-poses swapArms): the asks change sides, mirrored; the eased weights stay with their sides
  swapWith(o) {
    let t;
    t = this.on; this.on = o.on; o.on = t; t = this.frame; this.frame = o.frame; o.frame = t; t = this.point; this.point = o.point; o.point = t;
    t = this.facing; this.facing = o.facing; o.facing = t; t = this.follow; this.follow = o.follow; o.follow = t; t = this.pick; this.pick = o.pick; o.pick = t; t = this.rest; this.rest = o.rest; o.rest = t; t = this.idle; this.idle = o.idle; o.idle = t; t = this.lay; this.lay = o.lay; o.lay = t;
    _sw.copy(this.pos); this.pos.copy(o.pos); o.pos.copy(_sw); _sw.copy(this.dir); this.dir.copy(o.dir); o.dir.copy(_sw); _sw.copy(this.pole); this.pole.copy(o.pole); o.pole.copy(_sw);
    this.pos.x = -this.pos.x; this.dir.x = -this.dir.x; this.pole.x = -this.pole.x; o.pos.x = -o.pos.x; o.dir.x = -o.dir.x; o.pole.x = -o.pole.x;
  }
  face(kind, x, y, z) { this.facing = kind; this.dir.set(x, y, z).normalize(); return this; }
  elbow(x, y, z) { this.pole.set(x, y, z); return this; }
}

const _sw = new THREE.Vector3();
const _t = new THREE.Vector3(), _c = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _w = new THREE.Vector3();
const _q2 = new THREE.Quaternion(), _e2 = new THREE.Vector3();

// Two-bone solve in the chest's frame. S the shoulder joint, T where the wrist must go, Lu / Lf the upper arm and forearm,
// xw the wanted plane normal (the frame's x axis: the palm faces -side * x) or null, pole which way the elbow goes (unit, used
// when xw is null, or to pick the side when it does not decide). Writes out.q (the shoulder's rotation), out.el (the elbow's
// bend), out.E (the elbow), out.short (how far T was beyond reach, 0 when reached) and returns out.
export function solveArm(S, T, Lu, Lf, xw, pole, sigma, out) {
  _t.subVectors(T, S);
  let d = _t.length();
  const maxD = (Lu + Lf) * 0.995, minD = Math.abs(Lu - Lf) + 0.012;
  out.short = Math.max(0, d - maxD);
  if (d < 1e-6) _t.set(0, -1, 0); else _t.multiplyScalar(1 / d);
  d = clamp(d, minD, maxD);
  const cosA = clamp((Lu * Lu + d * d - Lf * Lf) / (2 * Lu * d), -1, 1), alpha = Math.acos(cosA), sinA = Math.sin(alpha);
  // the elbow's direction off the shoulder-wrist line: in the plane the facing asks for, else toward the pole hint
  if (xw) {
    _x.copy(xw).addScaledVector(_t, -xw.dot(_t));
    if (_x.lengthSq() < 1e-8) _x.copy(pole).addScaledVector(_t, -pole.dot(_t)); // (the target straight along the wanted facing: any plane)
    _x.normalize();
    _c.crossVectors(_x, _t).multiplyScalar(sigma);
  } else {
    _c.copy(pole).addScaledVector(_t, -pole.dot(_t));
    if (_c.lengthSq() < 1e-8) { _c.set(1, 0, 0).addScaledVector(_t, -_t.x); if (_c.lengthSq() < 1e-8) _c.set(0, 0, 1).addScaledVector(_t, -_t.z); }
    _c.normalize();
  }
  out.E.copy(S).addScaledVector(_t, Lu * cosA).addScaledVector(_c, Lu * sinA);
  _u.subVectors(out.E, S).multiplyScalar(1 / Lu);
  _f.copy(S).addScaledVector(_t, d).sub(out.E).normalize();
  const cosG = clamp((Lu * Lu + Lf * Lf - d * d) / (2 * Lu * Lf), -1, 1);
  out.el = Math.PI - Math.acos(cosG);
  _y.copy(_u).negate();
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_z.lengthSq() < 1e-8) _z.copy(_c).negate(); else _z.normalize();   // (a straight arm: the forearm bends toward the elbow's far side)
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  out.q.setFromRotationMatrix(_m);
  return out;
}

// The solve for an ArmTarget. The wanted facing sets the plane (palm: x = -side * dir; thumb: x = cross(dir, t)), and both elbow
// sides are tried with the better kept. The hand's point lands on the target, not the wrist: the forearm is solved that much
// longer, and the point's small offsets off the line are taken out over a few passes. Lu / Lf lengths, side +1 left / -1 right,
// hw / hl the hand size. S, T, dir and pole are all in the chest's frame.
export function solveTarget(S, T, Lu, Lf, side, A, dir, pole, hw, hl, out) {
  const pt = handPoint(A.point, side, hw, hl, _w), Lf2 = Lf - Math.min(0, pt.y), hasOff = pt.x !== 0 || pt.z !== 0;
  let xw = null;
  if (A.facing === 'palm') xw = _e2.copy(dir).multiplyScalar(-side);
  else if (A.facing === 'thumb') { _t.subVectors(T, S).normalize(); xw = _e2.crossVectors(dir, _t); if (xw.lengthSq() < 1e-8) xw = null; else xw.normalize(); }
  // the hand's line at the target (both elbow sides when the facing asks for one: the better match wins)
  const score = sigma => {
    solveArm(S, T, Lu, Lf2, xw, pole, sigma, out);
    if (!A.facing) return 0;
    _q2.copy(out.q);
    if (A.facing === 'palm') return _x.set(-side, 0, 0).applyQuaternion(_q2).dot(dir); // (the palm faces -side * x of the wrist, x unchanged by the elbow's bend)
    _z.set(0, Math.sin(out.el), Math.cos(out.el)).applyQuaternion(_q2); // the wrist's z after the bend
    return _z.dot(dir);
  };
  let sigma = 1;
  if (A.facing && A.pick === 'pole') { // the elbow on the hinted side, whichever facing that gives
    score(1); const e1 = _T2.copy(out.E).sub(S).dot(pole); score(-1); const e2 = _T2.copy(out.E).sub(S).dot(pole);
    sigma = e1 >= e2 ? 1 : -1; if (sigma === 1) score(1);
  } else if (A.facing) { const s1 = score(1), s2 = score(-1); sigma = s1 >= s2 ? 1 : -1; if (sigma === 1) score(1); }
  else score(1);
  if (!hasOff) return out;
  // the point's offsets off the line, in the hand's frame as just solved (a few passes: they turn with the hand a little)
  for (let k = 0; k < 3; k++) {
    _q2.copy(out.q).multiply(_e2q.setFromAxisAngle(_xax, -out.el));
    _T2.copy(T).sub(_t.set(pt.x, 0, pt.z).applyQuaternion(_q2));
    solveArm(S, _T2, Lu, Lf2, xw, pole, sigma, out);
  }
  return out;
}
const _e2q = new THREE.Quaternion(), _xax = new THREE.Vector3(1, 0, 0), _T2 = new THREE.Vector3();

// ------------------------------------------------------------------ tables
// `params.table` (world): a round top { x, z, r, y } or a box { x, z, yaw, hw, hd, y } (its middle, the way its local z faces,
// half its width along local x and half its depth along z; y the top's height). How far inside its footprint (x, z) is (+ inside).
export function tableInside(T, x, z) {
  if (T.r !== undefined) return T.r - Math.hypot(x - T.x, z - T.z);
  const dx = x - T.x, dz = z - T.z, cy = Math.cos(T.yaw || 0), sy = Math.sin(T.yaw || 0);
  const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy; // (into the box's frame: a rotation by yaw about y took local to world)
  return Math.min(T.hw - Math.abs(lx), T.hd - Math.abs(lz));
}
// How far ahead of (x, z), along (fx, fz), the footprint's edge is (negative: already over it; Infinity: never).
export function tableAhead(T, x, z, fx, fz) {
  if (T.r !== undefined) return (T.x - x) * fx + (T.z - z) * fz - T.r;
  const cy = Math.cos(T.yaw || 0), sy = Math.sin(T.yaw || 0), dx = x - T.x, dz = z - T.z;
  const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy, lfx = fx * cy - fz * sy, lfz = fx * sy + fz * cy;
  let t0 = -Infinity;
  for (const [h, o, d] of [[T.hw, lx, lfx], [T.hd, lz, lfz]]) {
    if (Math.abs(d) < 1e-6) { if (Math.abs(o) > h) return Infinity; continue; }
    t0 = Math.max(t0, Math.min((-h - o) / d, (h - o) / d));
  }
  return t0;
}

// ------------------------------------------------------------------ the feet on the real ground
// Per-foot state on the Human (h.ik): the last sampled spot and its ground, eased; the arms' asks; the ceiling's scratch ask.
export function ikState() {
  return { near: false, foot: [{ x: 1e9, z: 1e9, g: 0, want: 0, dy: 0, p: 0, wantPitch: 0, pitch: 0 }, { x: 1e9, z: 1e9, g: 0, want: 0, dy: 0, p: 0, wantPitch: 0, pitch: 0 }], arm: [new ArmTarget(), new ArmTarget()], ceil: new ArmTarget(), below: [0, 0] };
}

// Where the foot of leg i lands in the world for a root-frame target (fx forward, lat sideways): the root's yaw turned, scaled.
export function footWorld(root, s, fx, lat, out) {
  const yaw = root.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw);
  out.x = root.position.x + (lat * cy + fx * sy) * s;
  out.z = root.position.z + (fx * cy - lat * sy) * s;
  return out;
}

// The ground under leg i's planned foot (root units above the root's plane) and its slope, sampled at heel, ankle and toe only
// when the foot's spot moves. 0 with no ground function or when the ground is further off than IK_DROP / IK_RAISE (faded over the
// last 10 cm). On one slope the foot sits at the ankle's ground, pitched. On a step it sits level on the highest sample, so no toe
// or heel goes into a riser. A jump in the sample is eased in, the root's own climb isn't, so a planted foot holds its height while
// the body rises over it. Writes F.dy and F.pitch.
const _fw = { x: 0, z: 0 };
const FOOT_HEEL = 0.11, FOOT_TOE = 0.15; // m behind and ahead of the ankle the shoe reaches
export function footGround(h, i, fx, lat, dt) {
  const K = h.ik, F = K.foot[i], g = IK_WORLD.ground, s = h.opts.scale, root = h.root;
  if (!g) { F.dy = 0; F.pitch = 0; return 0; }
  footWorld(root, s, fx, lat, _fw);
  if (Math.abs(_fw.x - F.x) > 0.01 || Math.abs(_fw.z - F.z) > 0.01) {
    const far = F.x > 1e8, yaw = root.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw);
    F.x = _fw.x; F.z = _fw.z;
    const ga = g(_fw.x, _fw.z), gt = g(_fw.x + sy * FOOT_TOE * s, _fw.z + cy * FOOT_TOE * s), gh = g(_fw.x - sy * FOOT_HEEL * s, _fw.z - cy * FOOT_HEEL * s);
    const smooth = Math.abs((gt - ga) / FOOT_TOE - (ga - gh) / FOOT_HEEL) < 0.25; // (one slope under the whole foot)
    F.want = smooth ? ga : Math.max(ga, gt, gh); // (a step: the foot on the highest ground under any of it, level: nothing of it in a riser)
    F.wantPitch = smooth ? Math.atan((gt - gh) / ((FOOT_TOE + FOOT_HEEL) * s)) : 0;
    if (far) { F.g = F.want; F.p = F.wantPitch; }
  }
  const k = dt > 0 ? Math.min(1, dt * GROUND_EASE) : 1;
  F.g += (F.want - F.g) * k; F.p += (F.wantPitch - F.p) * k;
  const d = F.g - root.position.y, lim = (d < 0 ? IK_DROP : IK_RAISE) * s, a = Math.abs(d);
  const w = a <= lim ? 1 : a >= lim + 0.1 ? 0 : 1 - smoothK((a - lim) / 0.1);
  F.dy = (d / s) * w; F.pitch = F.p * w;
  return F.dy;
}
const smoothK = t => t * t * (3 - 2 * t);
