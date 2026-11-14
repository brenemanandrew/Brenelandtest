// The hanging tire as every player sees it. One free pendulum (idle sway, and the tire swinging on after a launch)
// that hands over to the rider whenever somebody is sitting in it: the tire is *derived from the rider's displayed
// position* (the seat position that is networked anyway), so remote screens need no swing-specific stream and the
// tire and the person can never drift apart. Everything here runs at render time (Scene.onBeforeRender) so it sees the
// final positions of the frame, including interpolated remote players.
import * as THREE from 'three';
import { SW } from './swing-physics.js';
import { SWING_FRAME } from './swing-hill.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI); // riders face the swing's local -z (its forward)
// The swing faces down the hill: its whole frame is turned about the pivot from a north-facing one by BASE_YAW (0 for a
// rider facing north). F = forward, Rt = the rider's right, both on the ground plane.
const BASE_YAW = SWING_FRAME.yaw - Math.PI;
const _qBase = new THREE.Quaternion().setFromAxisAngle(UP, BASE_YAW);
const F = { x: SWING_FRAME.fx, z: SWING_FRAME.fz }, Rt = { x: SWING_FRAME.rx, z: SWING_FRAME.rz };
const _e = new THREE.Euler(0, 0, 0, 'XZY');

export const RIG = {
  built: false,
  group: null,                       // the assembly, origin at the pivot (where the rope is tied round the branch)
  base: null,                        // its parent at the pivot, turned so the swing faces down the hill (BASE_YAW)
  yaw: SWING_FRAME.yaw,              // the way a rider faces (forward = (sin yaw, cos yaw)); PI was north
  fwd: F, right: Rt,                 // forward and the rider's right on the ground
  baseYaw: BASE_YAW,
  tireG: null, spin: 0,              // the tire itself (it can spin round the rider when things get hairy)
  pivot: new THREE.Vector3(),        // world position of the pivot
  restSeat: new THREE.Vector3(),     // where the seat hangs at rest
  ropeRadius: SW.L - SW.SEAT_DROP,   // pivot -> the rider's feet origin (the rope line)
  hand: null,                        // { meshes: [4], side: [2] } rope pieces that run through the rider's hands
  // free pendulum (idle sway, ghost swing after a launch)
  th: 0, w: 0, phi: 0, phiV: 0, twist: 0, twistV: 0,
  kick: null,                        // { w, twist, until } a shove for the tire the moment it is free (set at a launch)
  t: 0, dt: 1 / 60,                  // clock of the last world update
  // what everyone sees
  vis: { driven: false, sid: null, local: false, th: 0, w: 0, phi: 0, d: 0, h: 0, root: null },
  wobble: 0,                         // extra tilt when the swing is being pushed too hard
  syncedT: -1,
};

// world updater (called every frame in every mode by world.js with the shared clock)
export function rigUpdate(t) {
  const R = RIG;
  if (!R.built) return;
  const dt = Math.max(0, Math.min(0.05, t - R.t || 0));
  R.t = t; R.dt = dt || 1 / 60;
  if (R.vis.driven) return; // the rider decides (see rigSync)
  if (R.kick) {
    if (t > R.kick.until) R.kick = null; // nobody came free to receive it
    else { R.w += R.kick.w; R.twistV += R.kick.twist; R.kick = null; }
  }
  const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
  for (let i = 0; i < n; i++) {
    const wind = 0.26 * Math.sin(t * 0.9) + 0.11 * Math.sin(t * 1.9 + 1);
    R.w += (-(SW.G / SW.L) * Math.sin(R.th) - 0.16 * R.w + wind) * h;
    R.th += R.w * h;
    R.phiV += (-(SW.G / SW.L) * 0.8 * R.phi - 0.5 * R.phiV + 0.05 * Math.sin(t * 0.63)) * h;
    R.phi += R.phiV * h;
  }
  R.twist += R.twistV * dt;
  R.twistV *= Math.exp(-1.1 * dt);
  R.wobble = 0;
  if (R.tireG && R.tireG.rotation.y) R.tireG.rotation.y *= Math.exp(-4 * dt);
  R.vis.th = R.th; R.vis.w = R.w; R.vis.phi = R.phi;
  applyGroup(R.th, R.phi, R.twist);
}

function applyGroup(th, phi, twist) {
  const g = RIG.group;
  g.rotation.set(th, twist, phi, 'XZY');
}

// The rider's rope angles from where their feet are.
export function ropeAngles(p, out) {
  const R = RIG;
  const dx = p.x - R.pivot.x, dy = R.pivot.y - p.y, dz = p.z - R.pivot.z;
  const r = Math.hypot(dx, dy, dz) || 1;
  const side = dx * Rt.x + dz * Rt.z, fwd = dx * F.x + dz * F.z;
  out.phi = Math.asin(Math.max(-1, Math.min(1, side / r)));
  out.th = Math.atan2(fwd, dy);
  out.r = r; out.side = side;
  return out;
}
// The feet position for given rope angles (used by whoever drives the rider).
export function seatFeet(th, phi, out, r = RIG.ropeRadius) {
  const side = r * Math.sin(phi), fwd = r * Math.cos(phi) * Math.sin(th);
  out.set(RIG.pivot.x + Rt.x * side + F.x * fwd, RIG.pivot.y - r * Math.cos(phi) * Math.cos(th), RIG.pivot.z + Rt.z * side + F.z * fwd);
  return out;
}

const _ang = { th: 0, phi: 0, r: 0 };

// Called from Scene.onBeforeRender, once per frame. (Three r186 updates world matrices before that hook runs, so
// everything moved here calls updateMatrixWorld itself.) Finds who is sitting in the tire, hangs the tire from them,
// tilts them with the rope and threads the rope through their hands.
export function rigSync(ctx, local) {
  const R = RIG;
  if (!R.built || R.syncedT === R.t) return;
  R.syncedT = R.t;
  const V = R.vis;
  let root = null, sid = null, isLocal = false, human = null;

  if (local.riding) { root = ctx.player.character.root; human = ctx.player.character; sid = 'me'; isLocal = true; }
  else {
    for (const r of ctx.remotes.map.values()) {
      if (r.ch.anim !== 'swing') continue;
      const p = r.ch.root.position;
      if (Math.abs((p.x - R.pivot.x) * Rt.x + (p.z - R.pivot.z) * Rt.z) > 1.2) continue; // (off the swing's plane)
      const d = Math.hypot(p.x - R.pivot.x, p.y - R.pivot.y, p.z - R.pivot.z);
      if (Math.abs(d - R.ropeRadius) > 0.5) continue;
      root = r.ch.root; human = r.ch; sid = r.sid; break;
    }
  }

  const was = V.driven;
  if (!root) {
    if (was) { // the rider is gone: the tire swings on by itself with what it had
      R.th = V.th; R.w = V.w; R.phi = V.phi; R.phiV = 0;
      if (V.root) V.root.rotation.set(0, RIG.yaw, 0);
      V.driven = false; V.root = null;
      applyGroup(R.th, R.phi, R.twist);
    }
    R.group.updateMatrixWorld(true);
    hideHandRopes();
    return;
  }

  ropeAngles(root.position, _ang);
  const dt = R.dt;
  const w = was && V.sid === sid ? (_ang.th - V.th) / dt : 0;
  V.w = V.w * 0.6 + w * 0.4;
  V.th = _ang.th; V.phi = _ang.phi; V.driven = true; V.sid = sid; V.local = isLocal; V.root = root;
  const vb = Math.sqrt((V.w * SW.L) ** 2 + 2 * SW.G * SW.L * (1 - Math.cos(V.th)));
  V.h = (vb * vb) / (2 * SW.G); V.d = vb / SW.V_SAFE;

  // wobble (danger) and twist come from the energy everyone can see
  const wob = Math.max(0, Math.min(1, (V.d - SW.WARN) / 0.3));
  R.wobble = wob;
  applyGroup(V.th, V.phi, 0);
  R.spin += dt * wob * (V.d > 1.15 ? 10 : 6.5);
  if (R.tireG) R.tireG.rotation.y = wob > 0.02 ? R.spin : R.spin * Math.exp(-3 * dt);

  // tilt the rider to hang along the rope (the yaw stays the swing's)
  R.group.updateMatrixWorld(true);
  root.quaternion.copy(_qBase).multiply(_q.setFromEuler(_e.set(V.th, 0, V.phi, 'XZY'))).multiply(_qy);
  // where the tire's top and the ropes' knot are in the rider's own frame (world metres along the rope from the root): the
  // swing pose sits the rider on the tire and puts the hands on the ropes from these
  if (human) { human.params.tireY = -(SW.L - R.ropeRadius) + TIRE_TUBE; human.params.knotY = R.ropeRadius - KNOT; }

  threadRopes(human, root);
}

// --------------------------------------------------------------- rope through the hands

// where the three ropes meet, below the pivot: well over every seated rider's head, so the side ropes run up past the
// shoulders
export const KNOT = 0.85, TIRE_TUBE = 0.17;
export function knotWorld(out) { return out.set(0, -KNOT, 0).applyMatrix4(RIG.group.matrixWorld); }
export function attachWorld(x, z, out) { return out.set(x, -SW.L + 0.17, z).applyMatrix4(RIG.group.matrixWorld); }

function place(mesh, a, b, r) {
  _d.subVectors(b, a);
  const len = _d.length() || 0.001;
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
  mesh.scale.set(r, len, r);
  mesh.visible = true;
  mesh.updateMatrixWorld(); // WebGLRenderer refreshes matrices *before* Scene.onBeforeRender, so anything moved there refreshes itself
}

function hideHandRopes() {
  const H = RIG.hand;
  if (!H || !H.shown) return;
  H.shown = false;
  for (const m of H.meshes) m.visible = false;
  for (const m of H.side) m.visible = true;
}

function threadRopes(human, root) {
  const H = RIG.hand;
  if (!H) return;
  root.updateMatrixWorld(true);
  const hands = [human.handL, human.handR];
  const knot = knotWorld(_a);
  H.knot.copy(knot);
  let ok = true;
  for (let i = 0; i < 2; i++) {
    const hd = hands[i];
    if (!hd) { ok = false; break; }
    hd.getWorldPosition(_b);
    const at = attachWorld(i === 0 ? -0.5 : 0.5, 0, H.tmp); // the character faces north, so its left hand is on the -x side
    // the rope runs attach -> hand -> knot; it keeps to the hand's height so it never doubles back
    place(H.meshes[i * 2], at, _b, 0.03);
    place(H.meshes[i * 2 + 1], _b, knot, 0.03);
  }
  if (!ok) { hideHandRopes(); return; }
  H.shown = true;
  for (const m of H.side) m.visible = false;
}
