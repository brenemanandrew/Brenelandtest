// The ghoul of Beneath Angell Street: its looks. No AI, no gait, no sound (the rig is ghoul-rig.js, the hunt maze-ghoul.js). Loaded
// below by maze-ghoul.js, and by the studio page /ghoul-studio.html and tools/ghoul-shots.mjs.
//
//   new Ghoul('A' | 'B' | 'C' | a V2 id).root        .pose('search' | 'prowl' | 'leap' | 'glimpse')        .stats() -> { tris, meshes }
//
// Built from the same kit as the dogs and the unicorns (skin.js: smooth-minimum skins sampled from a sphere, swept tubes, blobs,
// decals; toon.js: the game's cel ramp, vertex colours, one shared material). A plain joint tree of Groups (hips > spine > neck >
// head > jaw; spine > shoulder > elbow > wrist; hips > hip > knee > ankle). The poses here are hand-set tables of joint angles.
// The first three concepts:
//   A  the Pickman ghoul: dog-faced, grey-green, hoofed feet, a hunched back with a knobbed spine, a mane of lank hair, big pale eyes
//   B  the pale crawler: hairless, sickly white-grey, eyeless sockets with a faint green glow, a wide needle-toothed grin, ribs, very long fingers
//   C  the hooded brute: bigger and heavier, a tattered burial shroud over head and shoulders, huge hands, a stooped gorilla stance
import * as THREE from 'three';
import { toon, glow, soft } from './toon.js';
import { blob, sweep, limb, sdfMesh, decal, mount, merge, paint, surfTo, _sp, _sn, X, Z } from './skin.js';
import { createRigidMerge } from './rigid-merge.js';
import { V2, buildV2, poseV2 } from './ghoul-v2.js'; // the second round's looks (A1-A3, B1-B3), merged. A, B and C build here

const PI = Math.PI, TAU = PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const col = c => new THREE.Color(c);
const mix = (a, b, t) => '#' + col(a).lerp(col(b), t).getHexString();
const darker = (hex, f = 0.7) => '#' + col(hex).multiplyScalar(f).getHexString();

// ------------------------------------------------------------------ the three concepts
export const CONCEPTS = {
  A: {
    name: 'Pickman ghoul', skin: '#5f7460', belly: '#86977d', dark: '#36423a', claw: '#d8cfae', eye: '#e4ecc2', eyeGlow: 0.55, eyeR: 1.25,
    scale: 1, girth: 1, hand: 1, finger: 1, hair: true, hoof: true, knobs: true, ears: 1,
  },
  B: {
    name: 'Pale crawler', skin: '#cdc8bf', belly: '#dcd7ce', dark: '#8a847b', claw: '#b9b09a', eye: '#8cffc4', eyeGlow: 1.0, eyeR: 1,
    scale: 0.97, girth: 0.85, hand: 1.05, finger: 1.7, sockets: true, grin: true, ribs: true, knobs: true, ears: 1.3, allFours: true, unlitEyes: true,
  },
  C: {
    name: 'Hooded brute', skin: '#575349', belly: '#6a665c', dark: '#2e2c27', claw: '#c9bfa2', eye: '#ffcf6a', eyeGlow: 0.9, eyeR: 0.85,
    scale: 1.22, girth: 1.3, hand: 1.55, finger: 1.1, hood: true, shroud: '#a3987f', shroudIn: '#4a4337', ears: 0, knuckles: true,
  },
  ...V2,
};
export const CONCEPT_IDS = Object.keys(CONCEPTS);
export const POSES = ['search', 'prowl', 'leap', 'glimpse'];

// ------------------------------------------------------------------ dimensions (at scale 1, metres)
const HIP_Y = 0.78;            // (the root is grounded after posing: this only sets the rest)
const L_THIGH = 0.40, L_SHIN = 0.36, L_UPPER = 0.46, L_FORE = 0.47;
const SPINE_AT = [0, 0.05, 0.02], NECK_AT = [0, 0.62, 0.1], NECK_END = [0, 0.1, 0.2], JAW_AT = [0, -0.065, 0.035];

// ------------------------------------------------------------------ small builders
const VC = () => toon('#ffffff', { vertexColors: true });
const VC2 = () => toon('#ffffff', { vertexColors: true, side: 'double' });
function place(g, pos, rot = null, scale = 1) {
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  g.applyMatrix4(_m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale, scale, scale)));
  return g;
}
// a claw or a tooth: a cone with its base at `at`, pointing along `dir`
function spike(color, r, len, at, dir, seg = 6) {
  const g = new THREE.ConeGeometry(r, len, seg);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(_p.set(0, 1, 0), _s.set(dir[0], dir[1], dir[2]).normalize());
  g.applyQuaternion(_q);
  g.translate(at[0], at[1], at[2]);
  _s.set(1, 1, 1);
  return paint(g, color);
}
// a parametric sheet (cloth): fn(u, v) -> [x, y, z], u across (0..1), v down (0..1)
function sheet(nU, nV, fn, color) {
  const pos = [], idx = [];
  for (let j = 0; j <= nV; j++) for (let i = 0; i <= nU; i++) { const p = fn(i / nU, j / nV); pos.push(p[0], p[1], p[2]); }
  for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) {
    const a = j * (nU + 1) + i, b = a + nU + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return paint(g, color);
}
// a ragged hem: a bumpy 0..1 by angle (two sine waves, nothing random: the same ghoul for everyone)
const rag = (a, k = 1) => 0.5 + 0.3 * Math.sin(a * 7 * k + 0.4) + 0.2 * Math.sin(a * 13 * k + 2.1);

// ------------------------------------------------------------------ parts (built per concept, cached)
const cache = new Map();
function partsFor(C) {
  let c = cache.get(C.name);
  if (c) return c;
  c = {};
  const g = C.girth, skin = C.skin, belly = C.belly, dark = C.dark;

  // ---- pelvis: a lump with the hip bones showing on the thin one
  {
    const parts = [blob(skin, [0, 0.02, 0], [0.17 * g, 0.12, 0.13 * g])];
    if (C.ribs) for (const s of [-1, 1]) parts.push(blob(skin, [s * 0.15 * g, 0.08, 0.03], [0.045, 0.035, 0.04], null, 'lo'));
    c.pelvis = merge(parts);
  }

  // ---- torso: one smooth skin, hunched (the chest sits forward and low, a hump high at the back), the belly paler
  {
    const S = [
      [0, 0.12, 0.0, 0.17 * g, 0.15, 0.14 * g],
      [0, 0.3, 0.03, 0.165 * g, 0.16, 0.15 * g, 0.12],
      [0, 0.5, 0.02, 0.23 * g, 0.16, 0.17 * g, 0.14],
      [0, 0.6, -0.1, 0.16 * g, 0.13, 0.13, 0.12],       // the hump
      [0.22 * g, 0.55, 0.0, 0.1, 0.085, 0.1, 0.1], [-0.22 * g, 0.55, 0.0, 0.1, 0.085, 0.1, 0.1],
    ];
    if (C.ribs) for (let i = 0; i < 5; i++) { const y = 0.3 + i * 0.05; for (const s of [-1, 1]) S.push([s * 0.1 * g, y, 0.05, 0.09 * g, 0.013, 0.12 * g, 0.03]); }
    if (C.knobs) for (let i = 0; i < 7; i++) { const t = i / 6; S.push([0, 0.2 + t * 0.44, -0.11 - 0.06 * Math.sin(t * PI), 0.02, 0.018, 0.022, 0.012]); }
    const sh = { S, o: [0, 0.34, 0], ro: [0, 0.34, 0], radial: 0.18, stretch: [0.28, 0.42, 0.24], maxT: 1.0, axis: 'y' };
    // (paint: the belly and the front of the chest paler, the back darker; the ribs a touch darker in their hollows)
    const torso = sdfMesh(sh, skin, 32, 26);
    const P = torso.attributes.position, A = torso.attributes.color, cb = col(belly), cs = col(skin), cd = col(darker(skin, 0.82)), tmp = col('#000');
    for (let i = 0; i < P.count; i++) {
      const z = P.getZ(i), y = P.getY(i);
      const front = THREE.MathUtils.smoothstep(z, 0.02, 0.16) * (1 - THREE.MathUtils.smoothstep(y, 0.5, 0.66));
      tmp.copy(cs).lerp(cb, front).lerp(cd, THREE.MathUtils.smoothstep(-z, 0.06, 0.16) * 0.8);
      A.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    c.torso = torso;
  }

  // ---- neck: a short thick tube, forward and up, to the head
  {
    const rings = [], n = 6, r0 = 0.085 * g, r1 = 0.07;
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = NECK_END[1] * t - 0.03 * Math.sin(t * PI), z = NECK_END[2] * t;
      const T = new THREE.Vector3(0, NECK_END[1] - 0.03 * PI * Math.cos(t * PI), NECK_END[2]).normalize(), B = new THREE.Vector3(0, T.z, -T.y);
      rings.push({ c: [0, y, z], a: X, b: [B.x, B.y, B.z], ra: r0 + (r1 - r0) * t, rb: (r0 + (r1 - r0) * t) * 0.9, col: skin });
    }
    rings.unshift({ c: [0, -0.04, -0.02], a: X, b: Z, ra: 0, rb: 0, col: skin });
    c.neck = sweep(rings, 12);
  }

  // ---- head: a canine skull and muzzle, brow ridge, cheeks (one smooth skin), with ears, nose, upper teeth, hair, pupils
  {
    const S = [
      [0, 0.02, -0.02, 0.115, 0.1, 0.12],
      [0, 0.055, 0.075, 0.105, 0.04, 0.07, 0.06],      // the brow ridge
      [0.08, -0.02, 0.035, 0.045, 0.05, 0.07, 0.06], [-0.08, -0.02, 0.035, 0.045, 0.05, 0.07, 0.06],  // cheeks
      [0, -0.035, 0.16, 0.058, 0.052, 0.1, 0.08],       // the muzzle
      [0, -0.015, 0.245, 0.034, 0.03, 0.03, 0.04],      // the nose end
      [0, 0.0, -0.1, 0.08, 0.075, 0.07, 0.08],           // the back of the skull
    ];
    if (C.grin) { S[4] = [0, -0.035, 0.15, 0.075, 0.045, 0.1, 0.08]; S[5] = [0, -0.02, 0.235, 0.045, 0.026, 0.03, 0.05]; } // a wider, flatter muzzle for the grin
    const H = c.H = { S, o: [0, -0.005, 0.04], ro: [0, -0.005, 0.04], radial: 0.3, stretch: [0.14, 0.12, 0.2], maxT: 0.5, axis: 'z' };
    const parts = [sdfMesh(H, skin, 36, 26)];
    // the muzzle a little darker toward the nose, the brow darker (the eyes sit in a hollow)
    {
      const P = parts[0].attributes.position, A = parts[0].attributes.color, cs = col(skin), cd = col(darker(skin, 0.72)), tmp = col('#000');
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const hollow = Math.max(0, 1 - Math.hypot((Math.abs(x) - 0.06) / 0.045, (y - 0.025) / 0.035, (z - 0.1) / 0.06));
        const nose = THREE.MathUtils.smoothstep(z, 0.18, 0.26) * 0.5;
        tmp.copy(cs).lerp(cd, Math.min(1, hollow * 0.9 + nose));
        A.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
    }
    // the nose: a wet dark lump
    parts.push(blob(dark, [0, -0.012, 0.262], [0.024, 0.018, 0.016], null, 'lo'));
    for (const s of [-1, 1]) parts.push(blob(darker(dark, 0.6), [s * 0.011, -0.018, 0.274], [0.006, 0.005, 0.004], null, 'tiny'));
    // upper teeth: two long canines and a row of small ones along the lip (the grin: a wide arc of needles)
    const tooth = C.claw;
    if (C.grin) {
      for (let i = -7; i <= 7; i++) {
        const a = i / 7, x = a * 0.062, z = 0.215 - 0.09 * a * a, y = -0.062;
        parts.push(spike(tooth, 0.0045, 0.028 + 0.01 * (1 - Math.abs(a)), [x, y, z], [0, -1, 0.1], 5));
      }
    } else {
      for (const s of [-1, 1]) {
        parts.push(spike(tooth, 0.008, 0.05, [s * 0.04, -0.07, 0.19], [0, -1, 0.15], 6));
        for (let i = 0; i < 3; i++) parts.push(spike(tooth, 0.0045, 0.022, [s * (0.028 - i * 0.008), -0.072, 0.225 + i * 0.012], [0, -1, 0.2], 5));
        parts.push(spike(tooth, 0.005, 0.022, [s * 0.047, -0.07, 0.14], [0, -1, 0.1], 5));
      }
    }
    // the eyes' places on the skin
    const eyeAt = c.eyeAt = [-1, 1].map(s => mount(H, [s * 0.058, 0.028, 0.105], 0.022, [s * 0.3, 0.1, 1], 0.5));
    if (C.sockets) {
      for (const A of eyeAt) {
        // a sunken dark socket (a decal in the hollow), the glow is its own mesh
        const d = decal(H, [A.p.x, A.p.y, A.p.z], 0.032, 0.026, '#0f0d12', { lift: 0.0015, rings: 2 });
        parts.push(d);
      }
    } else {
      // pupils: a narrow dark slit on each ball, looking a little forward
      for (const A of eyeAt) {
        const r = 0.03 * C.eyeR, pupil = blob('#0d0c10', [0, 0, 0], [0.006, 0.016, 0.004], null, 'lo');
        pupil.applyMatrix4(new THREE.Matrix4().compose(A.p.clone().addScaledVector(A.n, r * 0.92), A.q, new THREE.Vector3(1, 1, 1)));
        parts.push(pupil);
      }
    }
    // ears: tall pointed leaves, cupped, a darker inside
    if (C.ears) {
      for (const s of [-1, 1]) {
        surfTo(H, s * 0.085, 0.085, -0.03);
        const at = [_sp[0], _sp[1], _sp[2]];
        const rings = [], L = 0.16 * C.ears;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6, r = 0.05 * (1 - Math.pow(t, 1.6)) * (1 + 0.1 * Math.sin(PI * t)) + 0.002;
          rings.push(i === 6 ? { c: [0, L + 0.01, 0], a: X, b: Z, ra: 0, rb: 0, col: skin } : { c: [0, t * L, -0.015 * t * t], a: X, b: Z, ra: r, rb: r * 0.45, col: skin, cup: 0.012 });
        }
        const ear = merge([sweep(rings, 9), blob(darker(skin, 0.6), [0, L * 0.42, 0.012], [0.026, L * 0.36, 0.008], null, 'lo')]);
        parts.push(place(ear, at, [-0.35, s * 0.4, -s * 0.55]));
      }
    }
    // the mane: lank strands from the crown down the back of the skull and the nape
    if (C.hair) {
      const hc = '#2b2823', hc2 = '#3a352d';
      let k = 0;
      for (const [x, y, z, len, rx, rz] of [
        [0, 0.11, -0.02, 0.26, 1.2, 0], [0.04, 0.1, -0.04, 0.24, 1.35, 0.25], [-0.04, 0.1, -0.04, 0.24, 1.35, -0.25],
        [0.07, 0.07, -0.07, 0.22, 1.5, 0.45], [-0.07, 0.07, -0.07, 0.22, 1.5, -0.45], [0.02, 0.06, -0.11, 0.3, 1.1, 0.15],
        [-0.03, 0.06, -0.11, 0.3, 1.0, -0.15], [0.05, 0.02, -0.12, 0.28, 0.8, 0.5], [-0.05, 0.02, -0.12, 0.28, 0.8, -0.5],
        [0, 0.0, -0.13, 0.32, 0.5, 0], [0.03, 0.12, 0.02, 0.2, 1.4, 0.2], [-0.03, 0.12, 0.02, 0.2, 1.4, -0.2],
        [0.0, -0.03, -0.13, 0.3, 0.3, 0.1], [0.07, 0.04, -0.1, 0.24, 1.0, 0.7], [-0.07, 0.04, -0.1, 0.24, 1.0, -0.7],
      ]) {
        const strand = limb(len * 1.1, 0.016, 0.004, k++ % 3 ? hc : hc2, undefined, null, { seg: 6, steps: 4 });
        parts.push(place(strand, [x, y, z], [rx, 0, rz]));
      }
    }
    c.head = merge(parts);

    // the eyes: pale balls that catch the lantern (a glow of their own), or the sockets' faint green points
    const eyes = [], glints = [];
    for (const A of eyeAt) {
      if (C.sockets) {
        const e = blob(C.eye, [0, 0, 0], [0.014, 0.012, 0.009], null, 'lo');
        e.applyMatrix4(new THREE.Matrix4().compose(A.p.clone().addScaledVector(A.n, 0.026), A.q, new THREE.Vector3(1, 1, 1))); // the mount is sunk 0.022 for a ball in a socket, so the point sits just out of the skin
        eyes.push(e);
      } else {
        const r = 0.03 * C.eyeR;
        const e = blob(C.eye, [0, 0, 0], [r, r * 0.95, r * 0.85]);
        e.applyMatrix4(new THREE.Matrix4().compose(A.p.clone(), A.q, new THREE.Vector3(1, 1, 1)));
        eyes.push(e);
        const gl = blob('#ffffff', [-0.009 * Math.sign(A.p.x), 0.01, r * 0.93], [0.0065, 0.0075, 0.003], null, 'tiny');
        gl.applyMatrix4(new THREE.Matrix4().compose(A.p.clone(), A.q, new THREE.Vector3(1, 1, 1)));
        glints.push(gl);
      }
    }
    c.eyes = merge(eyes);
    c.glints = glints.length ? merge(glints) : null;
  }

  // ---- lower jaw (pivots at JAW_AT): chin, a wet dark mouth, a tongue, lower teeth
  {
    const L = C.grin ? 0.2 : 0.21, w = C.grin ? 0.07 : 0.055;
    const parts = [
      blob(skin, [0, -0.015, L * 0.5], [w, 0.028, L * 0.52], null, 'mid'),
      blob('#1c0a10', [0, 0.008, L * 0.5 - 0.01], [w * 0.92, 0.014, L * 0.5], null, 'mid'),
      blob('#7a2434', [0, 0.012, L * 0.42], [w * 0.45, 0.011, L * 0.36], null, 'lo'),
    ];
    if (C.grin) for (let i = -6; i <= 6; i++) { const a = i / 6; parts.push(spike(C.claw, 0.004, 0.024, [a * 0.058, 0.005, L * 0.98 - 0.07 * a * a], [0, 1, 0.12], 5)); }
    else for (const s of [-1, 1]) {
      parts.push(spike(C.claw, 0.0075, 0.045, [s * 0.038, 0.004, L * 0.86], [0, 1, -0.1], 6));
      for (let i = 0; i < 3; i++) parts.push(spike(C.claw, 0.004, 0.018, [s * (0.024 - i * 0.008), 0.004, L * 0.98 - i * 0.004], [0, 1, 0.1], 5));
    }
    c.jaw = merge(parts);
  }

  // ---- limbs (hang -y from their joint)
  c.upperArm = limb(L_UPPER - 0.02, 0.06 * (0.8 + 0.2 * g), 0.045, skin, undefined, null, { seg: 10 });
  c.foreArm = limb(L_FORE - 0.02, 0.046, 0.034, skin, undefined, null, { seg: 10 });
  c.thigh = merge([limb(L_THIGH - 0.02, 0.08 * g, 0.05, skin, undefined, null, { seg: 10 }), blob(skin, [0, -0.07, -0.01], [0.07 * g, 0.1, 0.075 * g], null, 'mid')]);
  c.shin = limb(L_SHIN - 0.02, 0.05, 0.034, skin, undefined, null, { seg: 10 });

  // ---- hands: a palm and four long fingers with claws, a thumb; mirrored for the right hand
  c.hand = [-1, 1].map(side => {
    const hs = C.hand, fl = C.finger, parts = [blob(skin, [0, -0.045 * hs, 0], [0.042 * hs, 0.055 * hs, 0.017 * hs], null, 'mid')];
    const knuck = darker(skin, 0.8);
    for (let i = 0; i < 4; i++) {
      const x = (-0.03 + i * 0.02) * hs, len = (0.085 + 0.015 * Math.sin((i + 0.5) / 4 * PI)) * fl * hs;
      const f = limb(len, 0.0105 * hs, 0.007 * hs, i & 1 ? skin : knuck, undefined, null, { seg: 6, steps: 3 });
      place(f, [x, -0.085 * hs, 0.002], [-0.12 - 0.1 * fl, 0, (i - 1.5) * 0.08]);
      parts.push(f);
      // the claw: curls forward out of the fingertip
      const tip = [x + (i - 1.5) * 0.08 * len, -0.085 * hs - len * 0.98, 0.002 + len * (0.12 + 0.1 * fl)];
      parts.push(spike(C.claw, 0.006 * hs, 0.034 * hs * Math.sqrt(fl), tip, [0, -0.6, 1], 6));
    }
    const thumb = limb(0.06 * hs * Math.sqrt(fl), 0.011 * hs, 0.008 * hs, skin, undefined, null, { seg: 6, steps: 3 });
    place(thumb, [side * -0.045 * hs, -0.04 * hs, 0.005], [-0.5, 0, side * 0.9]);
    parts.push(thumb);
    parts.push(spike(C.claw, 0.006 * hs, 0.026 * hs, [side * -0.085 * hs, -0.082 * hs, 0.03], [side * -0.4, -0.5, 1], 6));
    return merge(parts);
  });

  // ---- feet: hooves (A) or long clawed toes; mirrored
  c.foot = [-1, 1].map(side => {
    if (C.hoof) {
      const rings = [], hc = '#2a2622';
      for (const [y, r, cl] of [[0.06, 0, skin], [0.05, 0.045, skin], [0.0, 0.05, skin], [-0.02, 0.046, skin], [-0.025, 0.056, hc], [-0.08, 0.07, hc], [-0.08, 0, hc]]) rings.push({ c: [0, y, 0.01 - y * 0.3], a: X, b: Z, ra: r, rb: r * 1.1, col: cl });
      const hoof = sweep(rings, 12);
      // a cloven line down the front
      return merge([hoof, blob(darker(hc, 0.5), [0, -0.055, 0.075], [0.006, 0.03, 0.012], null, 'tiny')]);
    }
    const hs = 0.9 + 0.1 * C.hand, parts = [blob(skin, [0, -0.045, 0.03], [0.045 * hs, 0.03, 0.07 * hs], null, 'mid'), blob(skin, [0, -0.02, -0.02], [0.04, 0.045, 0.04], null, 'lo')];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.03 * hs, len = (0.075 + 0.015 * (1 - Math.abs(i - 1))) * hs;
      const toe = limb(len, 0.012 * hs, 0.008 * hs, i === 1 ? skin : darker(skin, 0.85), undefined, null, { seg: 6, steps: 3 });
      place(toe, [x, -0.05, 0.08 * hs], [-PI / 2 + 0.15, 0, (i - 1) * 0.12]);
      parts.push(toe);
      parts.push(spike(C.claw, 0.006 * hs, 0.028 * hs, [x + (i - 1) * 0.1 * len, -0.068, 0.08 * hs + len], [0, -0.5, 1], 6));
    }
    void side;
    return merge(parts);
  });

  // ---- the shroud (C): a cowl over the skull (head space) and a cape from the neck over the shoulders (spine space), ragged hems
  if (C.hood) {
    const H = c.H;
    // cowl: polar sheet over the head, open at the face below the brow, peaked a little at the back, flaring out at the bottom
    c.cowl = sheet(40, 14, (u, v) => {
      const open = THREE.MathUtils.smoothstep(v, 0.3, 0.5) * 0.78;      // half the face opening (radians of azimuth), from the brow down
      const phi = open + u * (TAU - 2 * open);                          // 0 = the front; runs round the back
      const thMax = 2.05 + 0.3 * (rag(phi, 1) - 0.5);
      const th = v * thMax;
      const dx = Math.sin(th) * Math.sin(phi), dy = Math.cos(th), dz = Math.sin(th) * Math.cos(phi);
      surfTo(H, dx * 0.4, dy * 0.4 + 0.02, dz * 0.4 - 0.02, [0, 0.02, -0.02]);
      const skull = Math.hypot(_sp[0], _sp[1] - 0.02, _sp[2] + 0.02);
      const flare = THREE.MathUtils.smoothstep(th, 1.3, 2.3) * 0.05, peak = 0.07 * Math.max(0, -dz) * Math.exp(-(((th - 0.75) / 0.45) ** 2));
      const r = skull * 1.12 + 0.01 + flare + peak;
      return [dx * r, dy * r + 0.02, dz * r - 0.02];
    }, C.shroud);
    // cape: from a collar at the neck base down over the shoulders, long at the back, short at the chest, the hem in tatters
    c.cape = sheet(48, 12, (u, v) => {
      const phi = u * TAU;                                              // 0 = the front
      const back = 0.5 - 0.5 * Math.cos(phi);                           // 0 front .. 1 back
      const L = 0.28 + 0.4 * back + 0.1 * (rag(phi, 1.3) - 0.5) * (0.4 + back);
      const sv = THREE.MathUtils.smoothstep(v, 0, 0.3);
      const rx = 0.12 + (0.33 * g - 0.12) * sv - 0.02 * v, rz = 0.1 + (0.22 * g - 0.1) * sv + 0.03 * v * back;
      return [Math.sin(phi) * rx, 0.67 - v * L - 0.03 * sv, Math.cos(phi) * rz + 0.02];
    }, C.shroud);
    // the inside is darker: a second copy of the colours is not possible on one sheet, so the inside shows the toon's back-face shading only
  }

  cache.set(C.name, c);
  return c;
}

// ------------------------------------------------------------------ the poses (joint angles, radians; L/R given as one and mirrored where sensible)
// A pose is a table joint -> [x, y, z] (YXZ). `mirror` lists joints whose y and z flip for the right side.
function poseFor(name, C) {
  const arm = (sx, sy, sz, ex, wx = 0) => ({ shoulder: [sx, sy, sz], elbow: [ex, 0, 0], wrist: [wx, 0, 0] });
  const leg = (hx, kx, ax) => ({ hip: [hx, 0, 0], knee: [kx, 0, 0], ankle: [ax, 0, 0] });
  // the standing hunch: digitigrade legs, the torso leant well forward, the neck craned up
  const stand = {
    hips: [0, 0, 0], spine: [0.62, 0, 0], neck: [-0.35, 0, 0], head: [-0.5, 0, 0], jaw: [0.12, 0, 0],
    L: { ...arm(0.15, 0, 0.22, -0.25, 0.2), ...leg(-0.5, 1.05, -0.9) },
    R: { ...arm(0.15, 0, -0.22, -0.25, 0.2), ...leg(-0.5, 1.05, -0.9) },
    ground: 'feet',
  };
  const P = JSON.parse(JSON.stringify(stand));
  if (name === 'search' || name === 'glimpse') {
    // upright-ish, head turned, one hand raised to the muzzle, sniffing
    P.head = [-0.55, name === 'glimpse' ? 0 : 0.7, name === 'glimpse' ? 0 : 0.1];
    P.neck = [-0.4, name === 'glimpse' ? 0 : 0.3, 0];
    P.R = { ...arm(-1.45, 0.35, -0.55, -2.25, -0.35), ...leg(-0.5, 1.05, -0.9) };
    P.L = { ...arm(0.25, 0, 0.3, -0.2, 0.25), ...leg(-0.62, 1.15, -0.9) };
    P.hands = { R: { at: 'muzzle' } };
    if (C.knuckles) {                       // the brute stands on its knuckles, gorilla-wise, the free hand lifted
      P.spine = [0.95, 0, 0];
      P.L = { ...arm(-0.55, 0, 0.3, -0.05, -1.1), ...leg(-0.9, 1.5, -0.9) };
      P.R = { ...arm(-1.5, 0.35, -0.6, -2.2, -0.35), ...leg(-0.9, 1.5, -0.9) };
      P.neck = [-0.6, name === 'glimpse' ? 0 : 0.3, 0]; P.head = [-0.65, name === 'glimpse' ? 0 : 0.6, 0];
      P.hands = { L: { at: 'ground', reach: 0.2, side: 0.08, knuckles: true }, R: { at: 'muzzle' } };
    }
    if (C.allFours) {                       // the crawler is on all fours even when it searches: a hand lifted, the head up and round
      Object.assign(P, prowl(C));
      P.neck = [-0.95, name === 'glimpse' ? 0 : 0.35, 0]; P.head = [-0.55, name === 'glimpse' ? 0 : 0.8, 0.1];
      P.R = { ...arm(-2.5, -0.3, -0.4, -1.6, -0.6), ...P.R };
      P.hands = { L: { at: 'ground', reach: 0.3, side: 0.05 }, R: { at: 'muzzle' } };
      P.ground = 'feet';
    }
    if (name === 'glimpse') P.jaw = [0.3, 0, 0];
  } else if (name === 'prowl') {
    Object.assign(P, prowl(C));
  } else if (name === 'leap') {
    // airborne, arms out and forward, fingers wide, mouth open, legs trailing
    P.spine = [0.7, 0, 0]; P.neck = [-0.45, 0, 0]; P.head = [-0.55, 0, 0]; P.jaw = [0.75, 0, 0];
    P.L = { ...arm(-2.15, 0.15, 0.4, -0.3, -0.5), ...leg(0.55, 0.9, -0.3) };
    P.R = { ...arm(-2.15, -0.15, -0.4, -0.3, -0.5), ...leg(0.2, 1.25, -0.4) };
    P.hips = [0.45, 0, 0];
    P.ground = 0.6;
    if (C.allFours || C.knuckles) { P.L.shoulder = [-1.95, 0.15, 0.6]; P.R.shoulder = [-1.95, -0.15, -0.6]; }
  }
  return P;
}
// on all fours, mid-prowl: the torso low and level, elbows bent out, one hand reaching, the head low and forward
function prowl(C) {
  const arm = (sx, sy, sz, ex, wx = 0) => ({ shoulder: [sx, sy, sz], elbow: [ex, 0, 0], wrist: [wx, 0, 0] });
  const leg = (hx, kx, ax) => ({ hip: [hx, 0, 0], knee: [kx, 0, 0], ankle: [ax, 0, 0] });
  const long = C.allFours ? 1 : 0;
  return {
    hips: [0, 0, 0], spine: [1.22 + 0.08 * long, 0, 0], neck: [-0.85, 0, 0], head: [-0.75, 0, 0], jaw: [0.25, 0, 0],
    L: { ...arm(-1.35, 0.1, 0.35, -0.55, -0.55), ...leg(-1.25, 1.95, -0.95) },
    R: { ...arm(-0.75, -0.1, -0.3, -0.5, -0.6), ...leg(-1.0, 1.7, -0.95) },
    hands: { L: { at: 'ground', reach: 0.5, side: 0.02 }, R: { at: 'ground', reach: 0.12, side: 0.06 } },
    ground: 'feet',
  };
}

// ------------------------------------------------------------------ the creature
export class Ghoul {
  constructor(id = 'A', opts = {}) {
    const C = this.C = { ...CONCEPTS[id], ...opts };
    this.id = id;
    if (C.v2) {
      // the second round: built by ghoul-v2.js, then rigid-merged like the people (one skinned mesh for the skin, inked as one solid)
      buildV2(this);
      this.pose('search');
      if (C.merge !== false) {
        this.root.userData.inkSolid = true;
        createRigidMerge({ scene: null, roots: () => [] }).api.merge(this.root);
      }
      return;
    }
    const c = partsFor(C), g = C.girth, VCm = VC();
    const root = this.root = new THREE.Group();
    root.scale.setScalar(C.scale);
    const J = this.joints = {};
    const joint = (name, parent, pos) => { const o = new THREE.Group(); o.name = name; o.rotation.order = 'YXZ'; o.position.set(pos[0], pos[1], pos[2]); parent.add(o); J[name] = o; return o; };
    const mesh = (geo, mat = VCm, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

    const hips = joint('hips', root, [0, HIP_Y, 0]);
    hips.add(mesh(c.pelvis));
    const spine = joint('spine', hips, SPINE_AT);
    spine.add(mesh(c.torso));
    const neck = joint('neck', spine, NECK_AT);
    neck.add(mesh(c.neck));
    const head = joint('head', neck, NECK_END);
    head.add(mesh(c.head));
    const eyeMat = C.unlitEyes ? glow(C.eye) : toon(C.eye, { emissive: C.eye, emissiveIntensity: C.eyeGlow }); // the sockets' points glow on their own, lit by nothing
    const eyes = mesh(c.eyes, eyeMat, false); soft(eyes); head.add(eyes);
    if (c.glints) { const gl = mesh(c.glints, glow('#ffffff'), false); soft(gl); head.add(gl); }
    const jaw = joint('jaw', head, JAW_AT);
    jaw.add(mesh(c.jaw));
    if (C.hood) {
      const cowl = mesh(c.cowl, VC2()); head.add(cowl);
      const cape = mesh(c.cape, VC2()); spine.add(cape);
    }
    this.hands = []; this.feet = [];
    for (const [i, s] of [[0, -1], [1, 1]]) {
      const side = s < 0 ? 'L' : 'R';
      const sh = joint('shoulder' + side, spine, [s * 0.25 * g, 0.57, 0.03]);
      sh.add(mesh(c.upperArm));
      const el = joint('elbow' + side, sh, [0, -L_UPPER, 0]);
      el.add(mesh(c.foreArm));
      const wr = joint('wrist' + side, el, [0, -L_FORE, 0]);
      const hand = mesh(c.hand[i]); wr.add(hand); this.hands.push(hand);
      const hp = joint('hip' + side, hips, [s * 0.13 * g, -0.02, 0]);
      hp.add(mesh(c.thigh));
      const kn = joint('knee' + side, hp, [0, -L_THIGH, 0]);
      kn.add(mesh(c.shin));
      const an = joint('ankle' + side, kn, [0, -L_SHIN, 0]);
      const foot = mesh(c.foot[i]); an.add(foot); this.feet.push(foot);
    }
    this.pose('search');
  }

  // set a pose by name (static), then ground the root: on the feet, on everything that touches down, or a height off the ground (the leap)
  pose(name) {
    const v2 = this.C.v2, P = v2 ? poseV2(name, this.C) : poseFor(name, this.C), J = this.joints;
    this.poseName = name;
    this._pole = P.pole || null;
    const set = (j, r) => { if (J[j] && r) J[j].rotation.set(r[0], r[1], r[2]); };
    for (const k of ['hips', 'spine', 'neck', 'head', 'jaw']) set(k, P[k]);
    for (const side of ['L', 'R']) for (const k of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'toe']) set(k + side, P[side][k]);
    if (v2) {
      // the leap swaps in the spread hands; B3's jaw drops out of its hinge; standing feet are kept flat on the floor
      for (let i = 0; i < 2; i++) { this.hands[i].visible = !P.spread; this.spreads[i].visible = !!P.spread; }
      const d = P.jawDrop || [0, 0, 0];
      J.jaw.position.set(JAW_AT[0] + d[0], JAW_AT[1] + d[1], JAW_AT[2] + d[2]);
      if (typeof P.ground !== 'number') {
        this.root.updateMatrixWorld(true);
        const q = new THREE.Quaternion(), r = this.root.getWorldQuaternion(new THREE.Quaternion());
        for (const t of this.toes) { t.parent.getWorldQuaternion(q); t.quaternion.copy(q.invert().multiply(r)); }
      }
    }
    this.root.position.y = 0;
    this.root.updateMatrixWorld(true);
    if (typeof P.ground === 'number') { this.root.position.y = P.ground; this.root.updateMatrixWorld(true); return this; }
    const box = new THREE.Box3();
    const list = P.ground === 'all' ? [...this.feet, ...this.hands] : this.feet;
    for (const m of list) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
    this.root.position.y = -box.min.y;
    this.root.updateMatrixWorld(true);
    if (P.hands) for (const side of ['L', 'R']) if (P.hands[side]) this.placeHand(side, P.hands[side]);
    return this;
  }

  // Two-bone IK for one arm (static, in world space): the wrist to a target, the elbow bent toward a pole, the hand aimed.
  //   at: 'muzzle' (the sniff: fingers up by the nose, palm to the face) | 'ground' (planted flat, fingers forward; knuckles: curled under)
  placeHand(side, { at, reach = 0.3, side: dx = 0.05, knuckles = false }) {
    const J = this.joints, s = side === 'L' ? -1 : 1, S = this.C.scale;
    const sh = J['shoulder' + side], el = J['elbow' + side], wr = J['wrist' + side];
    const Sp = sh.getWorldPosition(new THREE.Vector3());
    let T, fingers, palm, pole;
    if (at === 'muzzle') {
      T = J.head.localToWorld(new THREE.Vector3(s * 0.11, -0.08, 0.17));
      const nose = J.head.localToWorld(new THREE.Vector3(0, -0.02, 0.26));
      fingers = nose.clone().sub(T).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
      palm = J.head.localToWorld(new THREE.Vector3(0, -0.08, 0.17)).sub(T).normalize();
      pole = new THREE.Vector3(s * 0.45, -1, 0.15);
    } else {
      T = new THREE.Vector3(Sp.x + s * dx * S, (knuckles ? 0.15 : 0.1) * S, Sp.z + reach * S);
      fingers = knuckles ? new THREE.Vector3(0, -1, 0.35) : new THREE.Vector3(0, -0.3, 1);
      palm = knuckles ? new THREE.Vector3(0, 0.3, -1) : new THREE.Vector3(0, -1, 0.3);
      pole = this._pole ? new THREE.Vector3(s * this._pole[0], this._pole[1], this._pole[2]) : new THREE.Vector3(s * 0.8, 0.5, -0.6);
    }
    const a = (this.D ? this.D.upper : L_UPPER) * S, b = (this.D ? this.D.fore : L_FORE) * S;
    const e = T.clone().sub(Sp), d = Math.min(Math.max(e.length(), 0.05), (a + b) * 0.995);
    e.normalize();
    const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))), sinA = Math.sqrt(1 - cosA * cosA);
    const pp = pole.clone().addScaledVector(e, -e.dot(pole)).normalize();
    const u = e.clone().multiplyScalar(cosA).addScaledVector(pp, sinA).normalize();
    const E = Sp.clone().addScaledVector(u, a);
    const f = T.clone().sub(E).normalize();
    const DOWN = new THREE.Vector3(0, -1, 0), q = new THREE.Quaternion();
    // the shoulder: its -y along u, in the spine's frame
    sh.parent.getWorldQuaternion(q);
    sh.quaternion.setFromUnitVectors(DOWN, u.clone().applyQuaternion(q.invert()));
    sh.updateMatrixWorld(true);
    sh.getWorldQuaternion(q);
    el.quaternion.setFromUnitVectors(DOWN, f.clone().applyQuaternion(q.invert()));
    el.updateMatrixWorld(true);
    // the hand: -y along the fingers, +z the palm
    const y = fingers.clone().normalize().negate(), z = palm.clone().addScaledVector(y, -y.dot(palm)).normalize(), x = new THREE.Vector3().crossVectors(y, z);
    const Qw = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    el.getWorldQuaternion(q);
    wr.quaternion.copy(q.invert().multiply(Qw));
    this.root.updateMatrixWorld(true);
    return this;
  }

  // triangles and meshes that draw (A, B, C: one draw call per part; the second round: the merged skin plus the eyes and glints).
  // A part merged away has layer mask 0, and a hidden one (the spare hands) draws nothing
  stats() {
    let tris = 0, meshes = 0;
    this.root.traverse(o => { if (o.isMesh && o.layers.mask !== 0 && o.visible) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    return { tris: Math.round(tris), meshes };
  }

  // the world-space bounds of the whole creature (the studio frames by it; the merged skin's own geometry is in rest space: skipped)
  bounds(box = new THREE.Box3()) {
    this.root.updateMatrixWorld(true);
    box.makeEmpty();
    this.root.traverse(o => { if (o.isMesh && !o.userData.rigid && o.visible) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    return box;
  }
}
