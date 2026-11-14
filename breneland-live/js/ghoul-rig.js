// The ghoul, moving: a procedural rig for the B3 long crawler (ghoul.js / ghoul-v2.js build it), driven like our dogs' gait from
// the distance travelled, so the hands and feet don't slide. Loaded only below (maze-ghoul.js), never by the yard.
//
//   const rig = new GhoulRig(ghoul)     calibrates from the studio's static poses (prowl, search, leap: ghoul-v2.js poseV2)
//   rig.update(dt, { state, st, vx, vz, floor, look, victim })   every frame, after the caller set root.position.x/z and rotation.y
//
// Each hand and foot is planted in the WORLD while it carries weight and swings along an arc to its next plant (where the body will
// be over it). A two-bone IK puts the shoulder and elbow (the elbow bent up over the back, spider-wise: B3's pole) or the hip and
// knee (the knee forward and out) to it. The metatarsal stands down to the toe, the foot is kept level. Gaits by speed: a slow
// four-beat prowl (the elbows rising and falling as each hand lifts) and a bounding gallop (the long arms reaching together, the
// back flexing, the body heaving). The spine, neck, head and jaw are eased angles per state: search (the front raised, the head
// low and turning, sniffing), the leap (the studio's leap pose, hands spread, B3's jaw unhinged), the grab (on its quarry, the jaw
// working), back off (backing away, low), lose interest (straightening, a twitch, then off), and crouch (landed on its quarry: low
// over them, the head down at them, the jaw working: maze-ghoul.js's death frames). No allocation per frame.
import * as THREE from 'three';
import { poseV2 } from './ghoul-v2.js';

const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
const _S = new THREE.Vector3(), _e = new THREE.Vector3(), _pp = new THREE.Vector3(), _u = new THREE.Vector3(), _E = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _pole = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _m = new THREE.Matrix4(), _eul = new THREE.Euler(0, 0, 0, 'YXZ');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const frac = x => x - Math.floor(x);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// two bones from `up` (its parent's world matrix current): the end at T, the middle joint bent toward `pole` (world)
function ik2(up, low, a, b, T, pole) {
  up.getWorldPosition(_S);
  _e.subVectors(T, _S);
  const d = clamp(_e.length(), 0.05, (a + b) * 0.995);
  _e.normalize();
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _pp.copy(pole).addScaledVector(_e, -_e.dot(pole));
  if (_pp.lengthSq() < 1e-8) _pp.set(0, 1, 0);
  _pp.normalize();
  _u.copy(_e).multiplyScalar(cosA).addScaledVector(_pp, sinA).normalize();
  _E.copy(_S).addScaledVector(_u, a);
  _f.subVectors(T, _E).normalize();
  up.parent.getWorldQuaternion(_q).invert();
  up.quaternion.setFromUnitVectors(DOWN, _t.copy(_u).applyQuaternion(_q));
  up.updateMatrixWorld(true);
  up.getWorldQuaternion(_q).invert();
  low.quaternion.setFromUnitVectors(DOWN, _t.copy(_f).applyQuaternion(_q));
  low.updateMatrixWorld(true);
}
// point a joint's -y along a world direction
function aim(j, dir) { j.parent.getWorldQuaternion(_q).invert(); j.quaternion.setFromUnitVectors(DOWN, _t.copy(dir).normalize().applyQuaternion(_q)); j.updateMatrixWorld(true); }

// gaits: phase offsets (left hind, left fore, right hind, right fore), the share of the cycle on the ground, metres a cycle
const GAITS = {
  prowl: { off: [0, 0.27, 0.5, 0.77], duty: 0.72, stride: 1.25, lift: 0.16, heave: 0.025, pitch: 0.04 },
  gallop: { off: [0, 0.55, 0.1, 0.65], duty: 0.36, stride: 2.9, lift: 0.3, heave: 0.11, pitch: 0.16 },
};
const LIMB_KEYS = [['hipL', 'kneeL', 'ankleL', 'toeL'], ['shoulderL', 'elbowL', 'wristL'], ['hipR', 'kneeR', 'ankleR', 'toeR'], ['shoulderR', 'elbowR', 'wristR']];

export class GhoulRig {
  constructor(gh) {
    this.gh = gh;
    const J = this.J = gh.joints, root = gh.root, C = gh.C, S = C.scale, D = gh.D;
    this.len = { upper: D.upper * S, fore: D.fore * S, thigh: D.thigh * S, shin: D.shin * S };
    // ---- calibrate from the static poses, standing at the origin facing +z
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
    const tables = {};
    for (const name of ['prowl', 'search', 'leap']) {
      gh.pose(name);
      const P = poseV2(name, C), t = { ground: root.position.y, rot: {} };
      for (const k of ['hips', 'spine', 'neck', 'head', 'jaw']) t.rot[k] = J[k].rotation.toArray().slice(0, 3);
      for (const s of ['L', 'R']) for (const k of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'toe']) t.rot[k + s] = J[k + s].rotation.toArray().slice(0, 3);
      // where the hands and feet rest (x, z about the root; y above the ground) and the ankle over the toe
      t.limbs = LIMB_KEYS.map(keys => { const end = J[keys[keys.length - 1]].getWorldPosition(new THREE.Vector3()); return end; });
      t.ankleUp = [0, 2].map(i => J[LIMB_KEYS[i][2]].getWorldPosition(new THREE.Vector3()).sub(t.limbs[i]));
      t.jawDrop = P.jawDrop || null;
      tables[name] = t;
    }
    this.T = tables;
    this.pole = P_POLE(C);
    // ---- the limbs: planted in the world, or swinging between plants
    this.limbs = [0, 1, 2, 3].map(i => ({ i, fore: i % 2 === 1, side: i < 2 ? -1 : 1, keys: LIMB_KEYS[i], planted: false, at: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), sw: 1, swDur: 0.3, phase: 0, wasStance: true }));
    this.phase = 0; this.gait = GAITS.prowl; this.gk = 0;
    this.rot = {}; for (const k in tables.prowl.rot) this.rot[k] = tables.prowl.rot[k].slice();
    this.heave = 0; this.free = 0; this.spread = false; this.started = false;
    this.twitch = 0; this.sniffT = 0; this.turn = 0; this.lastYaw = 0;
    this.out = { heave: 0, pitch: 0 };
    gh.pose('prowl');
    this.jawRest = J.jaw.position.clone();   // taken after the prowl pose: from the leap pose it held the leap's drop and the jaw always hung low
  }

  // where a limb would rest now (world): the table's place, turned with the root, ahead along the velocity by `lead` metres
  rest(L, tab, lead, vxL, vzL, out) {
    const p = tab.limbs[L.i], root = this.gh.root, yaw = root.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
    // the hands a little nearer the body than the static pose's reach, so the elbows stand up over the back (nearer still at a gallop)
    const back = L.fore ? (tab === this.T.prowl ? 0.3 + 0.12 * this.gk : 0) : 0;
    const lx = p.x + vxL * lead, lz = p.z - back + vzL * lead;
    out.set(root.position.x + lx * c + lz * s, this.floor + p.y, root.position.z - lx * s + lz * c);
    return root.parent ? out.applyMatrix4(root.parent.matrixWorld) : out; // the IK works in the world: the maze's group sits far below
  }

  // st: { state, st (seconds in it), vx, vz (world m/s), floor, look (world Vector3 or null), victim (world Vector3 or null) }
  update(dt, st) {
    const gh = this.gh, J = this.J, root = gh.root, R = this.rot;
    dt = Math.min(dt, 0.05);
    const state = st.state, t = st.st;
    this.floor = st.floor || 0;
    const yaw = root.rotation.y, cy = Math.cos(yaw), sy = Math.sin(yaw);
    // velocity in the root's frame (+z ahead)
    const vxL = st.vx * cy - st.vz * sy, vzL = st.vx * sy + st.vz * cy, speed = Math.hypot(st.vx, st.vz);
    this.turn += (clamp(wrap(yaw - this.lastYaw) / Math.max(dt, 1e-3), -6, 6) - this.turn) * Math.min(1, dt * 8); this.lastYaw = yaw;
    // ---- which body: free limbs in the leap and the grab, the gait otherwise
    const free = state === 'leap' || state === 'grab';
    this.free += ((free ? 1 : 0) - this.free) * Math.min(1, dt * (free ? 14 : 6));
    // the prowl and the gallop are blended, not switched (a switch moved every limb's place in the cycle at once, so a hand mid-stance
    // jumped half a stride in one frame). The gallop is taken up over a moment (gk) with a little hysteresis (up past 3.9, back under
    // 3.3), and the gait in use is the mix of the two: each limb's offset slides round the cycle to its new place, and the stride, the
    // share on the ground and the lift ease across, so nothing jumps.
    if (free) this.galloping = false;
    else if (!this.galloping && speed > 3.9) this.galloping = true;
    else if (this.galloping && speed < 3.3) this.galloping = false;
    const gallop = this.galloping;
    this.gk += ((gallop ? 1 : 0) - this.gk) * Math.min(1, dt * 2.5);
    const G = this.mix || (this.mix = { off: [0, 0, 0, 0], duty: 0, stride: 0, lift: 0, heave: 0, pitch: 0 }), A = GAITS.prowl, B2 = GAITS.gallop, gk = this.gk;
    for (let i = 0; i < 4; i++) { let d = B2.off[i] - A.off[i]; d -= Math.round(d); G.off[i] = A.off[i] + d * gk; }
    for (const k of ['duty', 'stride', 'lift', 'heave', 'pitch']) G[k] = A[k] + (B2[k] - A[k]) * gk;
    this.gait = G;
    // the cycle from the distance travelled (backwards when backing off)
    const dir = vzL < -0.2 ? -1 : 1;
    this.phase = frac(this.phase + dir * speed * dt / G.stride);
    // ---- the angles for this state (the spine, neck, head, jaw; the legs' and arms' only when they are free)
    const base = state === 'sniff' || state === 'lost' ? this.T.search : free ? this.T.leap : this.T.prowl;
    const k = Math.min(1, dt * (free ? 16 : 5));
    for (const key of ['hips', 'spine', 'neck', 'head', 'jaw']) { const a = R[key], b = base.rot[key]; for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k; }
    // per-state life on top
    let spine = 0, neckY = 0, headY = 0, headX = 0, jaw = 0, heave = 0, rise = 0, low = 0;
    const cyc = this.phase * Math.PI * 2;
    if (!free) {
      const gk2 = this.gk, mv = Math.min(1, speed / 1.5);
      heave = (Math.sin(cyc * 2) * A.heave * (1 - gk2) + Math.sin(cyc) * B2.heave * gk2) * mv;
      spine = Math.sin(cyc + 0.6) * G.pitch * Math.min(1, speed / 3) * (0.4 + 0.6 * gk2);
      // the head up to look ahead, panting, at a gallop; turning about at a prowl (blended with the gait)
      headX = (-0.25 - 0.1 * Math.sin(cyc + 1.2)) * gk2; jaw = (0.18 + 0.12 * Math.sin(cyc * 2)) * gk2 + (0.05 + 0.04 * Math.sin(t * 2.1)) * (1 - gk2);
      headY = (Math.sin(t * 0.9) * 0.25 + this.turn * 0.12) * (1 - gk2);
    }
    if (state === 'sniff' || state === 'search' && speed < 0.3) {
      // stand and search: the head sweeping slowly, quick sniffs (little dips), the jaw working
      headY = Math.sin(t * 0.75) * 0.95; neckY = Math.sin(t * 0.75 - 0.4) * 0.35;
      headX = 0.12 * Math.max(0, Math.sin(t * 9)) * (Math.sin(t * 1.3) > 0.2 ? 1 : 0);
      jaw = 0.08 + 0.06 * Math.max(0, Math.sin(t * 9));
    } else if (state === 'lost') {
      // losing interest: up and straight, a twitch of the head (a fast snap aside and back), then down to go
      rise = smooth(clamp(t / 0.6, 0, 1)) * (1 - smooth(clamp((t - 1.9) / 0.6, 0, 1)));
      spine = -0.35 * rise;
      const tw = clamp((t - 0.9) / 0.35, 0, 1), snap = tw > 0 && tw < 1 ? Math.sin(tw * Math.PI) * (tw < 0.25 ? 1 : 1 - (tw - 0.25) / 0.75) : 0;
      headY = 0.7 * snap; headX = -0.25 * rise + 0.3 * snap; neckY = -0.3 * snap;
    } else if (state === 'leap') {
      jaw = 0.2; rise = 0;
    } else if (state === 'grab') {
      // on its quarry: the head working at you, the jaw snapping
      headY = Math.sin(t * 7.3) * 0.18; headX = 0.1 * Math.sin(t * 11); jaw = 0.55 + 0.35 * Math.sin(t * 13);
      // in your face (the third grab): the unhinged jaw held open toward you, trembling, not swung back under the chin
      if (st.face) jaw = (st.faceJaw ?? -1.45) + 0.05 * Math.sin(t * 21);
    } else if (state === 'backoff') { headX = 0.15; jaw = 0.1; }
    else if (state === 'crouch') {
      // landed over its quarry: the body sinks, the back bends down to them, the head dips and worries at them
      const k = smooth(clamp(t / 0.5, 0, 1));
      low = 0.14 * k; spine = 0.22 * k; headX = (0.35 + 0.1 * Math.max(0, Math.sin(t * 7.5))) * k; neckY = Math.sin(t * 1.7) * 0.12 * k;
      jaw = (0.25 + 0.25 * Math.max(0, Math.sin(t * 6.1))) * k;
    }
    // where to look: the head turns toward a point (a heard noise, the quarry), the yaw within reach of the neck
    if (st.look && state !== 'sniff' && state !== 'lost') {
      const lx = st.look.x - root.position.x, lz = st.look.z - root.position.z;
      const want = clamp(wrap(Math.atan2(lx, lz) - yaw), -1.1, 1.1);
      headY += want * 0.6; neckY += want * 0.35;
    }
    J.hips.rotation.set(R.hips[0], R.hips[1], R.hips[2]);
    J.spine.rotation.set(R.spine[0] + spine + 0.14 * this.gk, R.spine[1], R.spine[2]);
    J.neck.rotation.set(R.neck[0], R.neck[1] + neckY, R.neck[2]);
    J.head.rotation.set(R.head[0] + headX, R.head[1] + headY, R.head[2]);
    J.jaw.rotation.set(R.jaw[0] + jaw * (1 - this.free * 0.3), 0, 0);
    // B3's jaw drops out of its hinge in the leap (and while it holds you)
    const drop = this.T.leap.jawDrop, dk = this.free;
    J.jaw.position.set(this.jawRest.x + (drop ? drop[0] * dk : 0), this.jawRest.y + (drop ? drop[1] * dk : 0), this.jawRest.z + (drop ? drop[2] * dk : 0));
    // the spread hands for the leap and the grab
    const spread = this.free > 0.5;
    if (spread !== this.spread) { this.spread = spread; for (let i = 0; i < 2; i++) { gh.hands[i].visible = !spread; gh.spreads[i].visible = spread; } }
    // the height: the prowl's grounding, the heave, the leap's arc
    this.heave += (heave - this.heave) * Math.min(1, dt * 12);
    const leapY = state === 'leap' ? Math.sin(clamp(t / 0.45, 0, 1) * Math.PI) * 0.45 + 0.25 : state === 'grab' ? 0.25 : 0;
    const baseY = this.T.prowl.ground - 0.17 * this.gk + rise * 0.25 - low;     // fast and low at a gallop
    this.out.leapY = (this.out.leapY || 0) + (leapY - (this.out.leapY || 0)) * Math.min(1, dt * 10);
    root.position.y = this.floor + baseY + this.heave + this.out.leapY;
    root.updateMatrixWorld(true);

    // ---- the limbs (touched: a bit per limb that set down this frame, for the claws' ticks: maze-ghoul.js)
    this.touched = 0;
    const tab = base === this.T.leap ? this.T.prowl : base;
    const pole = this.pole;
    for (const L of this.limbs) {
      const keys = L.keys;
      if (this.free > 0.02) {
        // free (the leap, the grab): the table's angles for this limb, eased; the planting starts over after
        const key = L.fore ? ['shoulder', 'elbow', 'wrist'] : ['hip', 'knee', 'ankle', 'toe'], s = L.side < 0 ? 'L' : 'R';
        const kf = Math.min(1, dt * 14);
        for (const nm of key) { const j = J[nm + s], r = this.T.leap.rot[nm + s]; _eul.set(r[0], r[1], r[2], 'YXZ'); _q2.setFromEuler(_eul); j.quaternion.slerp(_q2, Math.max(kf, this.free > 0.95 ? 1 : 0)); }
        L.planted = false; L.sw = 0; L.swDur = 0.22; // sw 0, so each hand and foot comes down to its plant over swDur when the leap or the grab ends, not in one frame
        J[keys[keys.length - 1]].getWorldPosition(L.at); L.from.copy(L.at);
        continue;
      }
      const moving = speed > 0.25;
      const p = frac(this.phase + G.off[L.i]);
      const stance = !moving || p < G.duty;
      // where this limb wants to land: under where the body will be half a stance from now
      const lead = moving ? G.stride * G.duty * 0.5 / Math.max(speed, 0.5) : 0;
      this.rest(L, tab, lead, vxL, vzL, _a);
      if (!this.started) { L.at.copy(_a); L.planted = true; }
      if (stance) {
        if (!L.planted) {
          // touch down (from a swing or the free pose)
          if (L.sw < 1) { L.sw = Math.min(1, L.sw + dt / Math.max(0.08, L.swDur)); L.at.lerpVectors(L.from, _a, smooth(L.sw)); L.at.y += Math.sin(L.sw * Math.PI) * G.lift * 0.6; if (L.sw >= 1) { L.planted = true; L.at.copy(_a); this.touched |= 1 << L.i; } }
          else { L.planted = true; L.at.copy(_a); if (this.started) this.touched |= 1 << L.i; }
        } else if (!moving) {
          // standing: a planted limb dragged too far from its rest takes a little step back under the body
          if (L.at.distanceTo(_a) > 0.42) { L.planted = false; L.from.copy(L.at); L.sw = 0; L.swDur = 0.28; }
        }
      } else {
        // the swing: from where it lifted to the next plant, over an arc (the hands higher: the spider's reach)
        // the swing runs from where the limb was when it lifted (u0: a change of gait can lift it partway through the cycle's swing share),
        // and a limb the gait sets down mid-swing finishes its arc over a moment (sw, swDur) instead of jumping
        const u = clamp((p - G.duty) / (1 - G.duty), 0, 1);
        if (L.planted || L.wasStance) { L.planted = false; L.from.copy(L.at); L.u0 = u; }
        const uu = L.u0 < 0.97 ? clamp((u - L.u0) / (1 - L.u0), 0, 1) : 1;
        L.at.lerpVectors(L.from, _a, smooth(uu));
        L.at.y = this.floor + _a.y - this.floor + Math.sin(uu * Math.PI) * G.lift * (L.fore ? 1.3 : 0.8);
        L.sw = uu; L.swDur = 0.12;
      }
      L.wasStance = stance;
      // never stretched past reach: a planted limb too far behind lifts (and comes along)
      if (L.fore) {
        const sh = J[keys[0]]; sh.getWorldPosition(_b);
        const reach = (this.len.upper + this.len.fore) * 0.98;
        if (_b.distanceTo(L.at) > reach && L.planted) { L.planted = false; L.from.copy(L.at); L.sw = 0; L.swDur = 0.18; }
        _pole.set(L.side * pole[0], pole[1], pole[2]).applyAxisAngle(UP, yaw);
        ik2(sh, J[keys[1]], this.len.upper, this.len.fore, L.at, _pole);
        // the hand flat on the floor, the fingers ahead (out a little, spider-wise); in the air it trails
        const wr = J[keys[2]];
        _a.set(L.side * 0.25, -0.3, 1).applyAxisAngle(UP, yaw).normalize();          // fingers
        _b.set(0, -1, 0.3).applyAxisAngle(UP, yaw);                                  // palm
        _c.copy(_a).negate();                                                         // the hand's -y along the fingers
        _b.addScaledVector(_c, -_c.dot(_b)).normalize();
        _t.crossVectors(_c, _b);
        _m.makeBasis(_t, _c, _b); _q2.setFromRotationMatrix(_m);
        J[keys[1]].getWorldQuaternion(_q).invert();
        wr.quaternion.copy(_q.multiply(_q2));
      } else {
        // the leg: the hip and knee put the ankle over the foot, the metatarsal stands down to it, the foot kept level
        const ankUp = tab.ankleUp[L.i === 0 ? 0 : 1];
        _b.set(ankUp.x, ankUp.y, ankUp.z).applyAxisAngle(UP, yaw).add(L.at);
        _pole.set(L.side * 0.45, 0.05, 1).applyAxisAngle(UP, yaw);
        J[keys[0]].updateMatrixWorld(true);
        ik2(J[keys[0]], J[keys[1]], this.len.thigh, this.len.shin, _b, _pole);
        const an = J[keys[2]]; an.getWorldPosition(_c);
        aim(an, _t.subVectors(L.at, _c));
        const toe = J[keys[3]]; toe.parent.getWorldQuaternion(_q).invert(); root.getWorldQuaternion(_qr); toe.quaternion.copy(_q.multiply(_qr));
      }
    }
    this.started = true;
    root.updateMatrixWorld(true);
  }
}
// the snout pointed straight at a world point (the third grab: its face at yours), upright with a slight crook (and `roll`); the hanging head's
// frame is turned right over in the leap pose, so its world turn is set outright. Call after the root is where it will be drawn.
GhoulRig.prototype.aimHead = function (at, t, roll = 0) {
  const J = this.J;
  this.gh.root.updateMatrixWorld(true);
  J.head.getWorldPosition(_a);
  _c.set(Math.sin(t * 9) * 0.12 + roll, 1, 0).normalize();   // roll: the head cocked off square
  _m.lookAt(at, _a, _c); _q2.setFromRotationMatrix(_m);   // three: +z from the target to the eye, here the snout, at you
  J.head.parent.getWorldQuaternion(_q).invert();
  J.head.quaternion.copy(_q.multiply(_q2));
  this.gh.root.updateMatrixWorld(true);
};
// the elbows' pole (ghoul-v2.js poseV2: B3's up over the back)
function P_POLE(C) { return C.wrongElbows ? [0.75, 1.2, 0.35] : [0.8, 0.5, -0.6]; }
