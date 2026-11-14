// The Pose Editor's bodies (pose-editor, 2026-11-10). Every body you can pose is a Posable, so the editor never needs to know how a
// body is built: today the game's own people (human.js) and the dogs (dogs.js); the MPFB characters (feat/mpfb-in-game: a skinned glb
// on the MPFB "game engine" rig) plug in through SkinnedPosable once their models land on main.
//
// The Posable interface:
//   kind                      'human' | 'dog' | 'skinned'
//   root                      the Object3D that stands on the ground (its position and yaw are the editor's)
//   joints                    [{ id, label, side, group }] the joints the gizmo may turn (none for a dog)
//   chains                    ['handL', 'handR', 'footL', 'footR'] the IK chains (two bones and an end each)
//   state                     the pose as plain data (pose-mode.js saves it, undo copies it): see blankState()
//   jointObject(id)           the Object3D the joint's turn is applied to (the gizmo sits on it and reads its axes)
//   effector(chain, out)      where a chain's end is now (world)
//   frame(dt, ctx)            ctx = { t, eye: Object3D | { x, y, z } | null }: pose the body for this frame (after its own update)
//   capsule(out)              [x0, y0, z0, x1, y1, z1, r]: a picking volume (feet to head)
//   setHeld(kind), dispose()
// A joint's turn is an offset laid over what the body's own pose gives (stand, sit, walk...), in the joint's own frame (Euler YXZ,
// radians). IK targets and poles are in the root's frame (x left, y up, z forward, metres), so moving or turning the person keeps the
// pose. Pinned feet stay on the floor (their targets stay at ankle height) whatever the hips do.
import * as THREE from 'three';
import { Human, ATTN } from '../../human.js';
import { poseArmBones } from '../../bodies-arm.js';
import { setHandShape, handGeoFor, handSpec } from '../../bodies-hands.js';
import { poseStyledEyes } from '../../bodies-eyes.js';
import { Part } from '../../bodies-geo.js';
import { Dog } from '../../dogs.js';
import { buildHeld } from './props.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- the joints
// side: +1 the person's left, -1 the right, 0 the middle (mirror swaps the sides and turns y and z the other way)
export const HUMAN_JOINTS = [
  { id: 'body', label: 'Whole body', side: 0, group: 'body' },
  { id: 'hips', label: 'Hips', side: 0, group: 'body' },
  { id: 'chest', label: 'Chest', side: 0, group: 'body' },
  { id: 'neck', label: 'Neck', side: 0, group: 'head' },
  { id: 'head', label: 'Head', side: 0, group: 'head' },
  { id: 'shoulderL', label: 'Left shoulder', side: 1, group: 'armL' },
  { id: 'elbowL', label: 'Left elbow', side: 1, group: 'armL' },
  { id: 'wristL', label: 'Left wrist', side: 1, group: 'armL' },
  { id: 'shoulderR', label: 'Right shoulder', side: -1, group: 'armR' },
  { id: 'elbowR', label: 'Right elbow', side: -1, group: 'armR' },
  { id: 'wristR', label: 'Right wrist', side: -1, group: 'armR' },
  { id: 'hipL', label: 'Left hip', side: 1, group: 'legL' },
  { id: 'kneeL', label: 'Left knee', side: 1, group: 'legL' },
  { id: 'ankleL', label: 'Left ankle', side: 1, group: 'legL' },
  { id: 'hipR', label: 'Right hip', side: -1, group: 'legR' },
  { id: 'kneeR', label: 'Right knee', side: -1, group: 'legR' },
  { id: 'ankleR', label: 'Right ankle', side: -1, group: 'legR' },
];
export const CHAINS = ['handL', 'handR', 'footL', 'footR'];
// which joints a chain drives (upper, middle, end) and its mirror
const CHAIN_JOINTS = { handL: ['shoulderL', 'elbowL', 'wristL'], handR: ['shoulderR', 'elbowR', 'wristR'], footL: ['hipL', 'kneeL', 'ankleL'], footR: ['hipR', 'kneeR', 'ankleR'] };
export const chainJoints = c => CHAIN_JOINTS[c];
export const mirrorId = id => (id.endsWith('L') ? id.slice(0, -1) + 'R' : id.endsWith('R') ? id.slice(0, -1) + 'L' : id);

// the body's own poses the editor starts from. anim: human.js's pose; speed: walking; t: the moment of it (s); ik: hands placed
// in the root's frame by the preset itself (arms crossed, hands on hips): f(dims) -> { handL: { t, p }, handR }
export const PRESETS = [
  { id: 'stand', label: 'Stand', anim: 'idle' },
  { id: 'sit', label: 'Sit', anim: 'sit' },
  { id: 'walk', label: 'Walk, mid-step', anim: 'walk', speed: 1.3, cyc: 0.3 },
  { id: 'run', label: 'Run', anim: 'run', speed: 4.6, cyc: 0.3 },
  { id: 'point', label: 'Point', anim: 'point', t: 1.1 },
  { id: 'wave', label: 'Wave', anim: 'wave', t: 0.9 },
  // (the cartoon arms are short for the body: an upper arm forward and down, the elbow folded, the forearm across the chest; sh = each
  // shoulder in the root's frame, measured on the body)
  { id: 'cross', label: 'Arms crossed', anim: 'idle', ik: (D, sh) => {
    const z = D.dT * 0.5 + 0.1, L = sh.L, R = sh.R;
    return { handL: { t: [L[0] - 0.2, L[1] - 0.16, z], p: [L[0] + 0.35, L[1] - 0.3, z + 0.25] }, handR: { t: [R[0] + 0.2, R[1] - 0.12, z + 0.03], p: [R[0] - 0.35, R[1] - 0.3, z + 0.25] } };
  } },
  { id: 'hips', label: 'Hands on hips', anim: 'idle', ik: (D, sh) => { // the hands on the waist's sides, the elbows out and a little back
    const y = D.legLen + D.waist + 0.04, L = sh.L, R = sh.R;
    return { handL: { t: [L[0] - 0.01, y, -0.02], p: [L[0] + 0.45, L[1] - 0.12, -0.2] }, handR: { t: [R[0] + 0.01, y, -0.02], p: [R[0] - 0.45, R[1] - 0.12, -0.2] } };
  } },
  { id: 'cheer', label: 'Cheer', anim: 'cheer', t: 0.7 },
  { id: 'think', label: 'Think', anim: 'think', t: 1.2 },
  { id: 'shrug', label: 'Shrug', anim: 'shrug', t: 0.6 },
  { id: 'talk', label: 'Talk', anim: 'talk', t: 0.8 },
  { id: 'crouch', label: 'Crouch', anim: 'crouch', t: 1 },
];
export const presetById = id => PRESETS.find(p => p.id === id) || PRESETS[0];

// the faces the body supports (human.js expr: eye open, smile, mouth open, brows up, brows angry, mouth width)
export const FACES = [
  { id: 'auto', label: 'As posed', v: null },
  { id: 'happy', label: 'Happy', v: { eye: 1, smile: 0.9, open: 0.05, brow: 0.15, tilt: 0, mw: 1.05 } },
  { id: 'laugh', label: 'Laugh', v: { eye: 0.75, smile: 1.3, open: 0.7, brow: 0.3, tilt: -0.1, mw: 1.15 } },
  { id: 'surprised', label: 'Surprised', v: { eye: 1.35, smile: 0.2, open: 0.8, brow: 0.9, tilt: -0.2, mw: 0.7 } },
  { id: 'sad', label: 'Sad', v: { eye: 0.8, smile: -0.4, open: 0, brow: 0.35, tilt: -0.45, mw: 0.9 } },
  { id: 'angry', label: 'Cross', v: { eye: 0.9, smile: -0.3, open: 0.1, brow: -0.2, tilt: 0.7, mw: 0.9 } },
  { id: 'sleepy', label: 'Sleepy', v: { eye: 0.3, smile: 0.25, open: 0, brow: -0.1, tilt: 0, mw: 0.95 } },
  { id: 'calm', label: 'Calm', v: { eye: 1, smile: 0.4, open: 0, brow: 0, tilt: 0, mw: 1 } },
  { id: 'talking', label: 'Talking', v: { eye: 1, smile: 0.5, open: 0.45, brow: 0.2, tilt: 0, mw: 0.95 } },
];
export const FACE_KEYS = [['eye', 'Eyes open', 0.04, 1.5], ['smile', 'Smile', -0.6, 1.5], ['open', 'Mouth open', 0, 1], ['brow', 'Brows up', -0.5, 1], ['tilt', 'Brows cross', -0.6, 1], ['mw', 'Mouth wide', 0.5, 1.4]];
// the hands: the body's shapes, and a curl per finger (the cartoon hand has three fingers and a thumb) for anything in between
export const HAND_SHAPES = ['relaxed', 'open', 'grip', 'point'];

export function blankState() {
  return {
    preset: 'stand', moment: null, seat: 0.45,
    rot: {}, hipsDy: 0,
    ik: { handL: null, handR: null, footL: null, footR: null },
    pin: { footL: false, footR: false },
    face: null, hands: { L: { shape: 'relaxed', curl: null }, R: { shape: 'relaxed', curl: null } },
    held: null, headW: 0.7,
  };
}

// ---------------------------------------------------------------- the solver (any skeleton)
const _pU = new THREE.Vector3(), _pM = new THREE.Vector3(), _pE = new THREE.Vector3(), _d = new THREE.Vector3(), _pp = new THREE.Vector3();
const _n0 = new THREE.Vector3(), _n1 = new THREE.Vector3(), _u0 = new THREE.Vector3(), _u1 = new THREE.Vector3(), _w0 = new THREE.Vector3(), _w1 = new THREE.Vector3();
const _m = new THREE.Vector3(), _e = new THREE.Vector3(), _B0 = new THREE.Matrix4(), _B1 = new THREE.Matrix4(), _qR = new THREE.Quaternion(), _qW = new THREE.Quaternion(), _qP = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// turn an object so its world rotation is q (its parent's world rotation taken out)
export function setWorldQuat(o, q) {
  o.parent.getWorldQuaternion(_qP);
  o.quaternion.copy(_qP.invert().multiply(q));
}
// Two-bone IK in the world: U (shoulder or hip), M (elbow or knee), E (wrist or ankle). T the target for E, P a point the middle
// bends toward. The upper bone turns so the bend's plane is the one through P, the middle only about the plane's normal (so a hinge
// stays a hinge). Returns how far T was out of reach (m).
export function twoBone(U, M, E, T, P) {
  U.updateWorldMatrix(true, true);
  U.getWorldPosition(_pU); M.getWorldPosition(_pM); E.getWorldPosition(_pE);
  const a = _pM.distanceTo(_pU), b = _pE.distanceTo(_pM);
  _a.subVectors(_pM, _pU); _b.subVectors(_pE, _pM);
  _n0.crossVectors(_a, _b);
  if (_n0.lengthSq() < 1e-10) { _n0.setFromMatrixColumn(M.matrixWorld, 0); }
  _n0.normalize();
  _d.subVectors(T, _pU);
  const want = _d.length(), d = clamp(want, Math.abs(a - b) + 1e-4, a + b - 1e-4);
  if (want < 1e-6) _d.set(0, -1, 0); else _d.multiplyScalar(1 / want);
  _pp.subVectors(P, _pU).addScaledVector(_d, -_pp.subVectors(P, _pU).dot(_d));
  if (_pp.lengthSq() < 1e-10) _pp.crossVectors(_n0, _d);
  _pp.normalize();
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _m.copy(_pU).addScaledVector(_d, a * cosA).addScaledVector(_pp, a * sinA);
  _e.copy(_pU).addScaledVector(_d, d);
  _u1.subVectors(_m, _pU).normalize();
  _n1.crossVectors(_u1, _w1.subVectors(_e, _m));
  if (_n1.lengthSq() < 1e-10) _n1.crossVectors(_d, _pp);
  _n1.normalize();
  _u0.copy(_a).normalize();
  // the current frame (bone, bend normal) to the wanted one
  _w0.crossVectors(_u0, _n0); _w1.crossVectors(_u1, _n1);
  _B0.makeBasis(_u0, _n0, _w0); _B1.makeBasis(_u1, _n1, _w1);
  _qR.setFromRotationMatrix(_B1.multiply(_B0.transpose()));
  U.getWorldQuaternion(_qW); setWorldQuat(U, _qR.multiply(_qW));
  U.updateWorldMatrix(false, true);
  M.getWorldPosition(_pM); E.getWorldPosition(_pE);
  _a.subVectors(_pE, _pM).normalize(); _b.subVectors(_e, _pM).normalize();
  _qR.setFromUnitVectors(_a, _b);
  M.getWorldQuaternion(_qW); setWorldQuat(M, _qR.multiply(_qW));
  M.updateWorldMatrix(false, true);
  return Math.max(0, want - (a + b));
}

const _eu = new THREE.Euler(0, 0, 0, 'YXZ'), _qo = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
// lay a stored joint offset [x, y, z] over an object's own turn
function applyOffset(o, r) { if (!r || (!r[0] && !r[1] && !r[2])) return; _eu.set(r[0], r[1], r[2], 'YXZ'); o.quaternion.multiply(_qo.setFromEuler(_eu)); }
const toWorldPt = (root, p, out) => out.set(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld);

// ---------------------------------------------------------------- the game's people (human.js)
export class HumanPosable {
  constructor(look, opts = {}) {
    this.kind = 'human';
    this.h = new Human({ ...look });
    this.root = this.h.root;
    this.look = look;
    this.joints = HUMAN_JOINTS;
    this.chains = CHAINS;
    this.state = blankState();
    this.dims = this.h.dims;
    this.scale = look.scale || 1;
    this.custom = { L: null, R: null }; // the custom hand meshes (a curl per finger), and the curls they were built for
    this.eyeErr = null;                 // (test hook) the eyes' miss after the last frame, degrees
    this.reach = {};                    // (test hook) how far each IK target was out of reach (m)
    this.heldObj = null; this.heldKind = this.h.held || null; // (Kevin's rod comes with his look: it shows as held, and Nothing takes it away)
    this.state.held = this.heldKind;
    const h = this.h, objs = { body: h.body, hips: h.hips, chest: h.chest, neck: h.neck, head: h.headJ,
      shoulderL: h.armL.shoulder, elbowL: h.armL.elbow, wristL: h.armL.wrist, shoulderR: h.armR.shoulder, elbowR: h.armR.elbow, wristR: h.armR.wrist,
      hipL: h.legL.hip, kneeL: h.legL.knee, ankleL: h.legL.ankle, hipR: h.legR.hip, kneeR: h.legR.knee, ankleR: h.legR.ankle };
    this.objs = objs;
    void opts;
  }
  jointObject(id) { return this.objs[id] || null; }
  // where a chain's end is (world)
  effector(chain, out) { return this.objs[CHAIN_JOINTS[chain][2]].getWorldPosition(out); }
  // the person's feet-to-head line for picking
  capsule(out) {
    const p = this.root.position, s = this.scale, top = (this.dims.legLen + this.dims.waist + this.dims.torsoTop + 0.5) * s;
    out[0] = p.x; out[1] = p.y + 0.15 * s; out[2] = p.z; out[3] = p.x; out[4] = p.y + top; out[5] = p.z; out[6] = 0.32 * s;
    return out;
  }
  // a chain's target and pole as the body has them now (root frame): where an IK handle starts when first dragged
  restIK(chain) {
    const [u, m, e] = CHAIN_JOINTS[chain].map(id => this.objs[id]);
    this.root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const t = e.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const pu = u.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), pm = m.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    // the pole: out past the middle joint, away from the line between the ends
    const mid = pu.clone().lerp(t, 0.5), out = pm.clone().sub(mid);
    if (out.lengthSq() < 1e-6) out.set(0, 0, chain.startsWith('foot') ? 1 : -1);
    const p = pm.clone().addScaledVector(out.normalize(), 0.5);
    return { t: t.toArray(), p: p.toArray() };
  }
  setHeld(kind) {
    if (kind === this.heldKind) return;
    const h = this.h;
    if (this.heldObj) { this.heldObj.removeFromParent(); this.heldObj = null; }
    h.setHeld(null);
    this.heldKind = kind || null;
    if (!kind) return;
    if (kind === 'rod' || kind === 'fish' || kind === 'treat' || kind === 'gamebox') { h.setHeld(kind); return; }
    const g = buildHeld(kind);
    if (!g) return;
    (g.userData.left ? h.handL : h.handR).add(g);
    this.heldObj = g;
  }
  frame(dt, ctx) {
    const h = this.h, S = this.state, P = presetById(S.preset);
    // ---- before the body's own update: no blinking (a picture with the eyes shut), the wrists back to the body's own turn
    h.blinkT = 1e9; h.blinkP = 0;
    h.armL.wrist.rotation.set(0, h._pron[0], 0); h.armR.wrist.rotation.set(0, h._pron[1], 0);
    const A = h.attn, eye = ctx.eye;
    if (eye) { A.force = eye; A.forceUntil = Infinity; A.on = true; if (A.tgt !== eye) { A.tgt = eye; A.fresh = true; } A.why = 'force'; }
    else { A.force = null; A.on = false; A.tgt = null; }
    h.params.seatY = P.anim === 'sit' ? S.seat : 0;
    let speed = 0;
    if (P.speed) { speed = P.speed; h.cyc = S.moment ?? P.cyc; }
    else if (h.key === (P.anim === 'idle' ? 'idle' : P.anim)) h.animT = Math.max(0, (S.moment ?? P.t ?? 0) - dt);
    // the head follows the look by its weight (the eyes do the rest, within their reach)
    const w = clamp(S.headW, 0, 1), y0 = ATTN.headYaw, u0 = ATTN.headUp, d0 = ATTN.headDown;
    ATTN.headYaw = y0 * w; ATTN.headUp = u0 * w; ATTN.headDown = d0 * w;
    try { h.update(dt, ctx.t, speed, P.anim); } finally { ATTN.headYaw = y0; ATTN.headUp = u0; ATTN.headDown = d0; }

    // ---- after it: the joints' offsets, then the IK over them, the pinned feet, the hands, the face, the eyes
    const ik = this.activeIK(P);
    const O = this.objs;
    for (const j of HUMAN_JOINTS) {
      const id = j.id;
      if ((ik.handL && (id === 'shoulderL' || id === 'elbowL')) || (ik.handR && (id === 'shoulderR' || id === 'elbowR'))) continue;
      if ((ik.footL && (id === 'hipL' || id === 'kneeL')) || (ik.footR && (id === 'hipR' || id === 'kneeR'))) continue;
      applyOffset(O[id], S.rot[id]);
    }
    if (S.hipsDy) h.hips.position.y += S.hipsDy / 1;
    this.root.updateWorldMatrix(true, true);
    for (const c of CHAINS) {
      const k = ik[c];
      if (!k) { this.reach[c] = null; continue; }
      const [u, m, e] = CHAIN_JOINTS[c].map(id => O[id]);
      toWorldPt(this.root, k.t, _v); toWorldPt(this.root, k.p, _v2);
      this.reach[c] = twoBone(u, m, e, _v, _v2);
      if (c.startsWith('foot') && S.pin[c]) { this.root.getWorldQuaternion(_q); setWorldQuat(e, _q); applyOffset(e, S.rot[CHAIN_JOINTS[c][2]]); } // a pinned foot flat on the floor (then its own turn)
    }
    poseArmBones(h.armL, this.dims.Lu); poseArmBones(h.armR, this.dims.Lu);
    this.hands();
    if (S.face) { const F = FACES.find(f => f.id === S.face.preset)?.v, ex = h.expr; for (const [k] of FACE_KEYS) { const v = S.face[k] ?? F?.[k]; if (v !== undefined && v !== null) ex[k] = v; } h.stepFace(0, ctx.t, h.out); }
    this.aimEyes(eye);
  }
  // the IK in force this frame: the person's own, else the preset's
  activeIK(P) {
    const S = this.state, out = this._ik || (this._ik = {});
    const pre = P.ik ? (this._preIK && this._preIKFor === P.id ? this._preIK : (this._preIKFor = P.id, this._preIK = P.ik(this.dims, this.shoulders()))) : null;
    for (const c of CHAINS) out[c] = S.ik[c] || (pre && pre[c]) || null;
    return out;
  }
  // each shoulder in the root's frame (the presets that place the hands measure from them)
  shoulders() {
    if (this._sh) return this._sh;
    this.root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert(), at = o => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).toArray();
    return (this._sh = { L: at(this.objs.shoulderL), R: at(this.objs.shoulderR) });
  }
  hands() {
    const h = this.h, S = this.state;
    for (const [k, A] of [['L', h.armL], ['R', h.armR]]) {
      const H = S.hands[k], side = k === 'L' ? 1 : -1;
      if (A.anchor.children.length || (k === 'R' && h.heldObj) || (k === 'L' && h.book)) continue; // a hand round something keeps the body's grip
      if (H.curl) {
        const key = H.curl.map(v => v.toFixed(2)).join(',') + '|' + H.shape;
        let c = this.custom[k];
        if (!c || c.key !== key) {
          if (c) { c.mesh.removeFromParent(); c.mesh.traverse(m => m.geometry?.dispose()); delete A.hand.shapes.posed; }
          const spec = handSpec(H.shape); spec.curl = H.curl.slice(0, 3); spec.tcurl = H.curl[3];
          const p = new Part(), [hw, hl] = this.dims.shape.handK;
          p.add(handGeoFor(spec, side), this.h.opts.skin, { sx: hw, sy: hl, sz: hw });
          const mesh = p.build(); mesh.visible = false; mesh.userData.handShape = 'posed';
          A.wrist.add(mesh); A.hand.shapes.posed = mesh;
          c = this.custom[k] = { key, mesh };
        }
        setHandShape(A.hand, 'posed');
      } else setHandShape(A.hand, H.shape);
    }
  }
  // the eyes on the target exactly (the attention's eyes allow for the head as the body turned it; the offsets may have turned it more)
  aimEyes(eye) {
    const h = this.h, F = h.face;
    if (!eye || !F.styled) { this.eyeErr = null; return; }
    const st = h._eyeSt;
    h.headC.updateWorldMatrix(true, false);
    const e = eye.isObject3D ? eye.getWorldPosition(_v) : _v.set(eye.x, eye.y, eye.z);
    const loc = _v2.copy(e).applyMatrix4(new THREE.Matrix4().copy(h.headC.matrixWorld).invert());
    const yaw = Math.atan2(loc.x, loc.z), pitch = -Math.atan2(loc.y, Math.hypot(loc.x, loc.z));
    const gx = clamp(yaw / ATTN.eyeYaw, -1, 1), gy = clamp(pitch / ATTN.eyePitch, -1, 1);
    st.gx = gx; st.gy = gy; h.gaze.x = gx; h.gaze.y = gy;
    poseStyledEyes(F.styled, st);
    this.eyeErr = Math.hypot(yaw - gx * ATTN.eyeYaw, pitch - gy * ATTN.eyePitch) * 180 / Math.PI;
  }
  dispose() { this.root.removeFromParent(); this.h.dispose(); }
}

// ---------------------------------------------------------------- the dogs (placed, turned and given a pose; no joints)
export const DOG_POSES = [['idle', 'Stand'], ['sit', 'Sit'], ['lie', 'Lie down'], ['loaf', 'Chin on paws'], ['sleep', 'Curled up'], ['sleepside', 'On its side'], ['playbow', 'Play bow'], ['wag', 'Wag'], ['perk', 'Ears up']];
export class DogPosable {
  constructor(look) {
    this.kind = 'dog';
    this.d = new Dog(look);
    this.root = this.d.root;
    this.joints = []; this.chains = [];
    this.state = blankState(); this.state.preset = 'idle';
    this.scale = look.scale || 1;
  }
  jointObject() { return null; }
  effector() { return null; }
  capsule(out) { const p = this.root.position, s = this.scale; out[0] = p.x; out[1] = p.y + 0.15; out[2] = p.z; out[3] = p.x; out[4] = p.y + 0.8 * s; out[5] = p.z; out[6] = 0.45 * s; return out; }
  setHeld() {}
  frame(dt, ctx) { this.d.update(dt, ctx.t, 0, this.state.preset || 'idle'); }
  dispose() { this.root.removeFromParent(); }
}

// ---------------------------------------------------------------- the MPFB characters (a skinned model on the MPFB game-engine rig)
// Bone names on the MPFB "game engine" skeleton for each of the editor's joints (the rig the MPFB exports use: pelvis, spine_01-03,
// neck_01, head, clavicle, upperarm/lowerarm/hand, thigh/calf/foot, the fingers). 'body' turns the pelvis' parent (the model's root).
export const MPFB_BONES = {
  body: null, hips: 'pelvis', chest: 'spine_03', neck: 'neck_01', head: 'head',
  shoulderL: 'upperarm_l', elbowL: 'lowerarm_l', wristL: 'hand_l', shoulderR: 'upperarm_r', elbowR: 'lowerarm_r', wristR: 'hand_r',
  hipL: 'thigh_l', kneeL: 'calf_l', ankleL: 'foot_l', hipR: 'thigh_r', kneeR: 'calf_r', ankleR: 'foot_r',
};
const MPFB_FINGERS = [['thumb', 3], ['index', 3], ['middle', 3], ['ring', 3], ['pinky', 3]];
// A Posable over any SkinnedMesh whose skeleton has the MPFB names. `model` = { root (Object3D, stands on the ground), skeleton
// (THREE.Skeleton), face?(expr) (morph targets, if the export has them), update?(dt, t) (the model's own idle, BakedCharacter) }.
// The pose is the bones' rest turns with the editor's offsets over them; fingers curl about their bones' own x.
export class SkinnedPosable {
  constructor(model, opts = {}) {
    this.kind = 'skinned';
    this.model = model;
    this.root = model.root;
    this.scale = opts.scale || 1;
    this.height = opts.height || 1.7;
    const byName = new Map();
    for (const b of model.skeleton.bones) byName.set(b.name.toLowerCase(), b);
    this.bone = id => (MPFB_BONES[id] ? byName.get(MPFB_BONES[id]) || null : id === 'body' ? (byName.get('pelvis')?.parent || null) : null);
    this.joints = HUMAN_JOINTS.filter(j => this.bone(j.id));
    this.chains = CHAINS.filter(c => CHAIN_JOINTS[c].every(id => this.bone(id)));
    this.rest = new Map();
    for (const b of model.skeleton.bones) this.rest.set(b, b.quaternion.clone());
    { const p = byName.get('pelvis')?.parent; if (p && !this.rest.has(p)) this.rest.set(p, p.quaternion.clone()); }
    this.fingers = { L: [], R: [] };
    for (const [k, s] of [['L', 'l'], ['R', 'r']]) for (const [f, n] of MPFB_FINGERS) for (let i = 1; i <= n; i++) { const b = byName.get(`${f}_0${i}_${s}`); if (b) this.fingers[k].push({ b, f }); }
    this.state = blankState();
    this.reach = {};
  }
  jointObject(id) { return this.bone(id); }
  effector(chain, out) { return this.bone(CHAIN_JOINTS[chain][2]).getWorldPosition(out); }
  capsule(out) { const p = this.root.position; out[0] = p.x; out[1] = p.y + 0.15; out[2] = p.z; out[3] = p.x; out[4] = p.y + this.height * this.scale; out[5] = p.z; out[6] = 0.3 * this.scale; return out; }
  restIK(chain) {
    const [u, m, e] = CHAIN_JOINTS[chain].map(id => this.bone(id));
    this.root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const t = e.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), pu = u.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), pm = m.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const out = pm.clone().sub(pu.clone().lerp(t, 0.5)); if (out.lengthSq() < 1e-6) out.set(0, 0, chain.startsWith('foot') ? 1 : -1);
    return { t: t.toArray(), p: pm.clone().addScaledVector(out.normalize(), 0.5).toArray() };
  }
  setHeld() {}
  frame(dt, ctx) {
    const S = this.state;
    if (this.model.sample) {
      // (pose-draw) the body's own pose for the preset, sampled once from its clips (a fresh mixer: three's mixer skips a bone whose
      // value did not change, so offsets laid over a playing clip would pile up), then restored every frame under the offsets
      const key = S.preset + '|' + S.moment;
      if (key !== this.sampled || !this.base) {
        this.model.sample(S.preset, S.moment);
        this.base = new Map();
        for (const b of this.rest.keys()) this.base.set(b, [b.quaternion.clone(), b.position.clone()]);
        this.sampled = key;
      }
      for (const [b, [q, p]] of this.base) { b.quaternion.copy(q); b.position.copy(p); }
    } else {
      this.model.update?.(dt, ctx.t);
      for (const [b, q] of this.rest) b.quaternion.copy(q);
    }
    const chainOf = { armL: 'handL', armR: 'handR', legL: 'footL', legR: 'footR' };
    for (const j of this.joints) if (!(S.ik[chainOf[j.group]] && /shoulder|elbow|hip[LR]|knee/.test(j.id))) applyOffset(this.bone(j.id), S.rot[j.id]);
    const pel = this.bone('hips');
    if (pel) { if (this.pelY === undefined || this.base) this.pelY = this.base ? this.base.get(pel)[1].y : pel.position.y; pel.position.y = this.pelY + S.hipsDy / (pel.parent?.getWorldScale(_v).y || 1); }
    this.root.updateWorldMatrix(true, true);
    for (const c of this.chains) {
      const k = S.ik[c]; if (!k) { this.reach[c] = null; continue; }
      const [u, m, e] = CHAIN_JOINTS[c].map(id => this.bone(id));
      toWorldPt(this.root, k.t, _v); toWorldPt(this.root, k.p, _v2);
      this.reach[c] = twoBone(u, m, e, _v, _v2);
      if (c.startsWith('foot') && S.pin[c]) { this.root.getWorldQuaternion(_q); setWorldQuat(e, _q.multiply(this.rest.get(e))); }
    }
    for (const k of ['L', 'R']) { const H = S.hands[k], curl = H.curl || CURL_OF[H.shape] || CURL_OF.relaxed; for (const { b, f } of this.fingers[k]) { const c = f === 'thumb' ? curl[3] : f === 'index' ? curl[0] : f === 'middle' ? curl[1] : curl[2]; b.quaternion.multiply(_q.setFromAxisAngle(_X, c / 3)); } }
    if (S.face) { const F = FACES.find(f => f.id === S.face.preset)?.v || {}; this.model.face?.({ ...F, ...S.face }); } else this.model.face?.(null);
    const head = this.bone('head');
    if (ctx.eye && head) { // no eye bones on the game-engine rig: the head takes the look by its weight
      head.updateWorldMatrix(true, false);
      const e = ctx.eye.isObject3D ? ctx.eye.getWorldPosition(_v) : _v.set(ctx.eye.x, ctx.eye.y, ctx.eye.z);
      head.getWorldPosition(_v2); const want = _v2.subVectors(e, _v2).normalize();
      head.getWorldQuaternion(_qW); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
      _qR.setFromUnitVectors(fwd, want); const id = new THREE.Quaternion(); _qR.slerp(id, 1 - clamp(S.headW, 0, 1)); setWorldQuat(head, _qR.multiply(_qW));
    }
  }
  dispose() { this.root.removeFromParent(); }
}
const _X = new THREE.Vector3(1, 0, 0);
const CURL_OF = { open: [0.05, 0.05, 0.05, 0], relaxed: [1.35, 1.45, 1.55, 0.5], grip: [2.5, 2.6, 2.6, 0.5], point: [0, 2.7, 2.7, 0.6] };
void TAU;
