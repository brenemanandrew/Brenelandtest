// The strip mall's people as Blender models (mall-staff, 2026-11-10): Belinda and Mina of Peak Threads, Zoe and Asha of Summit Slice,
// modelled whole and rigged by assets/blender/scripts/build_mall_staff.py (public/models/mall-staff.json + public/models/mall-staff/*.webp).
//
// How the rig drives the game's motions. Each character is a SkinnedMesh on a skeleton whose bones are named after human.js's joints
// (body, hips, chest, neck, headJ, headC, hipL/kneeL/ankleL, shoulderL/elbowL/wristL and the right side) with the same rest offsets
// (body-ref.json's dims). Under the mesh stands a hidden code-built Human, the DRIVER: every frame it is updated like any townsperson
// (walk, idle, sit, wave, talk, laugh, the dances), and each bone copies its human.js group's turn (and its position's change from
// rest: the hips' sway, the shoulders' drop, the body's squash). So the town's whole repertoire plays on the model without a clip of its
// own. The driver's face (the eyes, brows, nose and mouth that blink, look and talk) stays visible: the model's head is the game's own
// head shape, so the face sits on it. Over that, the game layers the character's own Blender clips (sashay, sass, sketch, fold, dress,
// tray, carry, work, rave, greet) as per-bone deltas; the skirt bones follow the thighs and knees (no clipping through the legs walking or
// sitting), the hair falls and pigtails ride the driver's hair springs, and the held things sit on item bones under the wrists, shown
// or hidden by the state. The modelled arms hang AB0 out (a clean armpit); `corr` turns them back to hang as human.js hangs them.
//
// THE HOOK (the PM, 2026-11-10): Andrew is refining these four (and the DM) on MPFB bodies in feat/mpfb-preview, so the final models
// will most likely come from there. The hand-made bodies built here are NOT wired in: the game builds the four as code-built human.js
// looks (mall-staff.js PEOPLE[id].fallback) unless the page asks for the models with `?mallstaff=model` (then public/models/mall-staff.json
// is fetched, each person gets a MallStaffBody, and the human.js look stays the fallback if the fetch fails). A later model per person
// (an MPFB export) goes in the same slot: loadMallStaffModel fetches it, MallStaffBody binds it to the driver, mall-staff.js's `dress`
// shows its held things and plays its clips; nothing in the schedules (mall-staff-day.js) knows which body is drawn.
//   loadMallStaffModel()  fetch once (main.js boot) when asked for. mallStaffReady() -> whether a model is there (else the code-built fallback).
//   new MallStaffBody(who, opts) -> { root, h (the driver), update(dt, now, speed, anim), say(), dispose(), setOutfit('day'|'night'),
//     play(clip, t | null), items(set), params (the driver's), model (true when skinned) }
import * as THREE from 'three';
import { Human } from './human.js';
import { GFX } from './gfx.js';
import { view } from './perf-flags.js';

let DATA = null, HD = 'full';
const SHEETS = new Map(), GEOS = new Map();
export async function loadMallStaffModel() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q?.get('mallstaff') !== 'model') { DATA = null; return false; }   // (opt in: the code-built looks are the game's for now)
  HD = q?.get('mshd') === 'half' ? 'half' : q?.get('mshd') === 'full' ? 'full' : GFX.cls === 'phone' ? 'half' : 'full';
  try { const r = await fetch('/models/mall-staff.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.bones || !DATA.models || !DATA.clips) DATA = null;
  return !!DATA;
}
export const mallStaffReady = () => !!DATA;
export const mallStaffModel = () => DATA;

// the soft toon ramp of the Blender set pieces (the light is painted into the sheet)
let STEPS = null;
function steps() {
  if (STEPS) return STEPS;
  const d = new Uint8Array([168, 214, 255]);
  STEPS = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); STEPS.minFilter = STEPS.magFilter = THREE.NearestFilter; STEPS.needsUpdate = true;
  return STEPS;
}
function sheet(name) {
  let m = SHEETS.get(name);
  if (m) return m;
  const tex = new THREE.TextureLoader().load(`/models/mall-staff/${name}${HD === 'half' ? '-half' : ''}.webp`);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = new THREE.MeshToonMaterial({ map: tex, gradientMap: steps() }); m.name = 'mall-staff-' + name;
  SHEETS.set(name, m);
  return m;
}
function geometry(name) {
  let g = GEOS.get(name);
  if (g) return g;
  const M = DATA.models[name], n = M.pos.length / 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n * 3; i++) { pos[i] = M.pos[i] / 1000; nor[i] = M.nor[i] / 100; }
  for (let i = 0; i < n * 2; i++) uv[i] = M.uv[i] / 4096;
  for (let i = 0; i < n * 4; i++) { si[i] = M.si[i]; sw[i] = M.sw[i] / 255; }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(M.idx, 1) : new THREE.Uint16BufferAttribute(M.idx, 1));
  g.computeBoundingSphere(); g.boundingSphere.radius += 0.6; // (the clips and the walk swing the limbs off the rest pose)
  GEOS.set(name, g);
  return g;
}

// which human.js group a bone's `attach` names
function groupOf(h, attach) {
  if (!attach) return null;
  if (attach === 'body') return h.body;
  if (attach === 'hips' || attach === 'chest' || attach === 'neck' || attach === 'headJ' || attach === 'headC') return h[attach];
  const [limb, joint] = attach.split('.');
  return h[limb]?.[joint] || null;
}
const FACE_KEEP = ['eyeL', 'eyeR', 'browL', 'browR', 'mouth'];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const ITEM_BONES = { L: 'itemL', R: 'itemR' };
const FAR_ANIM = 90, FAR_HIDE = 150;   // (the town's people: not animated past 90 m of the camera; not drawn past 150)

export class MallStaffBody {
  /** who: 'belinda' | 'mina' | 'zoe' | 'asha'; opts: { look (the driver's), outfit: 'day' | 'night' } */
  constructor(who, opts = {}) {
    this.who = who; this.kind = 'human';
    const h = this.h = new Human({ build: 0.5, height: 0.5, body: 'nb', shape: 0.5, figure: 'average', outfit: 'tee', hairStyle: 'short', hat: 'none', bottoms: 'pants', shoeKind: 'sneakers', eyeStyle: 'hooded', ...(opts.look || {}) });
    this.root = h.root; this.params = h.params;
    this.root.userData.mallStaff = this;
    this.model = false; this.outfit = opts.outfit || 'day'; this.clip = null; this.clipT = 0; this.clipLoop = true; this.cyc = null;
    this.shown = { L: false, R: false }; this.far = false;
    if (!DATA) return;
    const names = this.names = who === 'zoe' || who === 'asha' ? { day: who + '_day', night: who + '_night' } : { day: who, night: who };
    if (!DATA.models[names.day]) return;
    this.model = true;
    // the driver's own skin, hair and clothes go unseen; its face stays (the model's head is the game's head shape, so it fits)
    const keep = new Set();
    for (const k of FACE_KEEP) { const g = h.face?.[k]; if (g) g.traverse(o => keep.add(o)); }
    h.root.traverse(o => { if (o.isMesh && !keep.has(o)) o.visible = false; });
    // the skeleton: a bone per rig bone, parented as the rig is, at the modelled rest offsets
    this.bones = []; this.byName = new Map(); this.rest = [];
    const rig = this.rig = new THREE.Group(); rig.name = 'ms-rig';
    for (const b of DATA.bones) {
      const bone = new THREE.Bone(); bone.name = b.name;
      bone.position.set(b.local[0], b.local[1], b.local[2]);
      const parent = b.parent ? this.byName.get(b.parent) : null;
      (parent || rig).add(bone);
      const g = groupOf(h, b.attach);
      const corr = b.corr ? _q.setFromAxisAngle(_v.set(b.corr[0] === 'x' ? 1 : 0, b.corr[0] === 'y' ? 1 : 0, b.corr[0] === 'z' ? 1 : 0), b.corr[1]).clone() : null;
      this.bones.push(bone); this.byName.set(b.name, bone);
      this.rest.push({ bone, group: g, gx: g ? g.position.x : 0, gy: g ? g.position.y : 0, gz: g ? g.position.z : 0, lx: b.local[0], ly: b.local[1], lz: b.local[2], corr, head: b.head, name: b.name, extra: !g, limb: /^(elbow|wrist)/.test(b.name) });
    }
    h.root.add(rig);
    const inv = DATA.bones.map(b => new THREE.Matrix4().makeTranslation(b.head[0], b.head[1], b.head[2]).invert());
    this.skeleton = new THREE.Skeleton(this.bones, inv);
    this.meshes = {};
    for (const k of ['day', 'night']) {
      const name = names[k];
      if (!DATA.models[name] || this.meshes[name]) continue;
      const m = new THREE.SkinnedMesh(geometry(name), sheet(DATA.models[name].sheet || name));
      m.name = 'mall-staff-' + name; m.castShadow = true; m.receiveShadow = false; m.userData.noMerge = true;
      m.bind(this.skeleton, new THREE.Matrix4());
      h.root.add(m); this.meshes[name] = m;
    }
    this.setOutfit(this.outfit);
    // the hair falls and pigtails hang on the driver's hair springs (the same bounce as everyone's hair)
    for (const n of ['tailL', 'tailR', 'hairB', 'hairL', 'hairR']) {
      const bone = this.byName.get(n);
      if (bone) h.springs.push({ node: bone, kind: 'hair', ax: 0, vx: 0, az: 0, vz: 0, gain: n === 'hairB' ? 0.7 : 1, side: n.endsWith('L') ? 1 : n.endsWith('R') ? -1 : 1 });
    }
    // the held things: hidden until the state shows them (a scale of 0 collapses the bone)
    for (const k of ['L', 'R']) { const b = this.byName.get(ITEM_BONES[k]); if (b) b.scale.setScalar(0.0001); }
    // the name tag's height: the model's head top, not the hidden hair's
    if (h.tagAnchor) h.tagAnchor.position.y = 0.52;
  }
  setOutfit(k) {
    this.outfit = k;
    if (!this.model) return;
    for (const [name, m] of Object.entries(this.meshes)) m.visible = name === this.names[k];
  }
  /** show a held thing (the bag, the tray, the notebook...) on a hand: side 'L' | 'R' */
  items(set) {
    if (!this.model) return;
    for (const k of ['L', 'R']) {
      const on = !!set?.[k], b = this.byName.get(ITEM_BONES[k]);
      if (b && on !== this.shown[k]) { this.shown[k] = on; b.scale.setScalar(on ? 1 : 0.0001); }
    }
  }
  /** play one of the character's clips over the game's pose: t in seconds (null stops it); cyc: lock the loop to the walk cycle (0..1) */
  play(name, t = 0, cyc = null) {
    this.clip = name && DATA?.clips[name] ? name : null; this.clipT = t || 0; this.cyc = cyc;
  }
  say(secs, to) { return this.h.say(secs, to); }
  update(dt, now, speed = 0, anim = null) {
    const c = view.camera, p = this.root.position;
    const d = c ? Math.abs(c.position.x - p.x) + Math.abs(c.position.z - p.z) : 0;
    if (this.model) { const hide = d > FAR_HIDE; if (hide !== this.far) { this.far = hide; for (const m of Object.values(this.meshes)) m.visible = !hide && m.name === 'mall-staff-' + this.names[this.outfit]; } }
    if (d > FAR_ANIM) return;   // (the town's people's distance: nothing animated so far off)
    this.h.update(dt, now, speed, anim);
    if (this.model) this.sync(dt);
  }
  // the bones follow the driver's groups, then the clip's deltas, the skirt the legs
  sync(dt) {
    const h = this.h, out = h.out;
    const clip = this.clip ? DATA.clips[this.clip] : null;
    let f0 = 0, f1 = 0, k = 0, idx = null;
    if (clip) {
      if (this.cyc !== null) this.clipT = this.cyc * (clip.frames - 1) / clip.fps;
      else this.clipT += dt;
      const F = clip.frames, fr = this.clipT * clip.fps;
      const f = clip.loop ? ((fr % (F - 1)) + (F - 1)) % (F - 1) : Math.min(F - 1, fr);
      f0 = Math.floor(f); f1 = Math.min(F - 1, f0 + 1); k = f - f0;
      idx = clip._idx || (clip._idx = clip.bones.map(n => this.byName.get(n)));
    }
    for (let i = 0; i < this.rest.length; i++) {
      const r = this.rest[i], b = r.bone, g = r.group;
      if (g) {
        // the joint sits where human.js puts it (a face shape's own head height, the hips' sway, the shoulders' drop); the elbows and
        // wrists keep the modelled A-pose offsets (corr at the shoulder turns them to hang) plus any change the group makes
        if (r.limb) b.position.set(r.lx + g.position.x - r.gx, r.ly + g.position.y - r.gy, r.lz + g.position.z - r.gz);
        else b.position.copy(g.position);
        b.quaternion.copy(g.quaternion);
        if (r.corr) b.quaternion.multiply(r.corr);
        if (r.name === 'body') b.scale.copy(g.scale);
      }
    }
    if (clip) {
      const A = clip.data[f0], B = clip.data[f1];
      for (let j = 0; j < idx.length; j++) {
        const b = idx[j]; if (!b) continue;
        const a = A[j], c = B[j];
        b.position.x += a[0] + (c[0] - a[0]) * k; b.position.y += a[1] + (c[1] - a[1]) * k; b.position.z += a[2] + (c[2] - a[2]) * k;
        _q.set(a[3], a[4], a[5], a[6]); _q2.set(c[3], c[4], c[5], c[6]); _q.slerp(_q2, k);
        b.quaternion.multiply(_q);
      }
    }
    // the skirt: the front panel swings with the forward thigh, the back with the one behind, the sides with their own leg a little;
    // the lower panels (a long skirt) hang from the knees' bend, so a seated skirt folds over the thighs and falls from the knees
    const fwd = Math.max(out.lhp, out.rhp, 0), back = Math.min(out.lhp, out.rhp, 0), kn = Math.max(out.lkn, out.rkn, 0);
    const sk = (name, rx, rz = 0) => { const b = this.byName.get(name); if (b) b.quaternion.setFromEuler(_e.set(rx, 0, rz)); };
    sk('skirtF', -fwd * 0.92); sk('skirtB', -back * 0.5); sk('skirtL', -out.lhp * 0.4 - fwd * 0.12, out.lhab * 0.6); sk('skirtR', -out.rhp * 0.4 - fwd * 0.12, -out.rhab * 0.6);
    sk('skirtF2', kn * 0.9); sk('skirtB2', -back * 0.2); sk('skirtL2', out.lkn * 0.6); sk('skirtR2', out.rkn * 0.6);
  }
  dispose() {
    for (const m of Object.values(this.meshes || {})) this.root.remove(m);
    this.h.dispose();
  }
}
