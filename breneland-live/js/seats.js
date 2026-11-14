// Every seat in Breneland that a player may sit on (benches, the picnic table, logs, Granny's chair): whoever builds a
// bench registers its seats here; picnic.js offers "E  Sit down" at the nearest one and runs the sitting.
//   addSeat(x, z, y, yaw, name, hint)   y = the seat's top; yaw = the way a sitter faces (atan2(dx, dz) convention);
//                                       hint (optional) = the whole E prompt, e.g. 'E  Sit on the log'
import * as THREE from 'three';
import { KNEE_PAST } from './house-rest-spots.js';
import { shinKick } from './bodies-poses.js';
export const SEATS = [];
// (seats-bodies) The sit fit, shared by every seat as house-rest fits the sofas (sitFit): a seat may say how far its front edge is in
// front of where the hips go (`front`, m, along the way a sitter faces); then each body's hips come forward or back so the knee joint
// stands KNEE_PAST past that edge whatever the thighs' length (+-FIT_MAX). Returns the shift along the facing (+ forward). A seat
// without `front` is sat on where it says. The seat's owner keeps `front` with the seat (seat data), so a rebuilt bench carries it.
export const SEAT_FIT_MAX = 0.06;
// (slice-seats) A seat with a back says how far behind the spot its back's face is (`back`, m) as well as its front edge: then each body
// sits with its own back against it (backReach: the torso's and the pelvis' back behind the hip joints, measured off the body as built,
// a backpack and the hair apart), unless its thighs are too short for that: the knees behind the front edge swing the shins out over it
// (shinKick, bodies-poses seatLegs reads params.seatEdge) up to SHIN_KICK_MAX, and past that the hips come forward until they clear.
export const SEAT_BACK_GAP = 0.005, SHIN_KICK_MAX = 1.25;
export function seatFit(ch, front, back, again = false) {
  if (!ch?.dims) return 0;
  if (back > 0 && front > 0) {
    const D = ch.dims, s = ch.root?.scale?.y || 1, lo = -back + backReach(ch, again) + SEAT_BACK_GAP, hi = Math.max(lo, front + KNEE_PAST - D.Lt * s);
    let f = lo;
    while (f < hi && shinKick((front - f) / s, D) > SHIN_KICK_MAX) f += 0.005;
    return Math.min(f, hi);
  }
  if (!(front > 0)) return 0;
  const s = ch.root?.scale?.y || 1, f = front - (ch.dims.Lt * s - KNEE_PAST);
  return Math.max(-SEAT_FIT_MAX, Math.min(SEAT_FIT_MAX, f));
}
// How far a body's back reaches behind its hip joints (m, world: the root's scale in), from the hips up and within 16 cm of its middle:
// the torso and its clothes, the pelvis; not the head and hair, the arms or a backpack (`h.bag`: it is sat in front of). Measured once a body
const REACH = new WeakMap(), _v = new THREE.Vector3();
// again: measure it now (the seated pose: picnic.js refits a sitter once the sit has settled; the hips and a jacket's hem sit
// further back than standing)
export function backReach(ch, again = false) {
  let r = REACH.get(ch);
  if (r !== undefined && !again) return r;
  const R = ch.root, skip = new Set([ch.head, ch.armL?.shoulder, ch.armR?.shoulder, ch.bag].filter(Boolean));
  R.updateMatrixWorld(true);
  const re = R.matrixWorld.elements, yaw = R.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), sc = R.scale.y || 1;
  const he = ch.legL.hip.matrixWorld.elements, hipF = (he[12] - re[12]) * fx + (he[14] - re[14]) * fz, hipY = he[13];
  let min = 0;
  const lo = 0; // (from the hip joints up: a jacket's or a coat's hem flares back over the seat below them, and is pressed flat there)
  const walk = g => {
    if (skip.has(g)) return;
    if (g.isMesh && !g.userData.rigid && g.geometry?.attributes?.position) {
      const P = g.geometry.attributes.position, e = g.matrixWorld.elements, step = Math.max(1, Math.floor(P.count / 600));
      for (let i = 0; i < P.count; i += step) {
        if (g.isSkinnedMesh) g.getVertexPosition(i, _v); else _v.fromBufferAttribute(P, i); // (a skirt's or a coat's cloth is skinned to the legs)
        const x = _v.x, y = _v.y, z = _v.z;
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const dy = wy - hipY, f = (wx - re[12]) * fx + (wz - re[14]) * fz - hipF, side = (wx - re[12]) * fz - (wz - re[14]) * fx;
        if (dy > -lo && dy < 0.55 * sc && Math.abs(side) < 0.16 * sc && f < min) min = f;
      }
    }
    for (const c of g.children) walk(c);
  };
  walk(ch.hips); // (the torso, the pelvis, a jacket's or a skirt's cloth and the thighs' tops: all of it under the hips)
  r = -min;
  REACH.set(ch, r);
  return r;
}
export function addSeat(x, z, y, yaw, name = 'bench', hint = null, extra = null) { const s = { x, z, y, yaw, name, hint, ...extra }; SEATS.push(s); return s; }
// extra (optional): { on() -> bool } a seat that isn't always there (the bus's: only while it waits at its stop, and its own
// feature seats you there), plus anything its owner wants to keep on it
// A bench with its back at the -facing side: two seats a little apart along it.
export function addBenchSeats(x, z, y, yaw, name = 'bench', spread = 0.42, extra = null) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const k of [-spread, spread]) addSeat(x + c * k, z - s * k, y, yaw, name, null, extra);
}
// A log lying along `axis` (the direction of its length, atan2 convention) that sitters straddle facing `face`:
// two seats on a short log, three on a long one, so more than one person fits.
export function addLogSeats(x, z, y, axis, face, len, name = 'log') {
  const n = len > 2.4 ? 3 : 2, ax = Math.sin(axis), az = Math.cos(axis);
  for (let i = 0; i < n; i++) {
    const k = (i - (n - 1) / 2) * (len / n);
    addSeat(x + ax * k, z + az * k, y, face, name, 'E  Sit on the ' + name);
  }
}
