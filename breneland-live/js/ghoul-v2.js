// The ghoul's second round: three variations each of the first round's A (the Pickman ghoul) and B (the pale crawler), with the
// first round's fixes folded in. Built through ghoul.js (maze-ghoul.js builds B3 below), and shown on the studio page.
//
//   A1 Pickman, refined   the first A: a real lank mane of ribbon locks, slit-pupil pale eyes, mottled grey-green skin
//   A2 Starved hound      taller and gaunter, a long narrow snout, ribs and hip bones, mangy tufts, sunken yellow eyes, ears back
//   A3 Grave-digger       short, broad and heavy-jawed, a bulldog of a ghoul: long digging claws caked dark, a stubby crest
//   B1 Crawler, refined   the first B: bone-white grey, stronger ribs, brighter green points in the sockets
//   B2 Crawler, A's eyes  B's body and grin with A's big pale slit-pupil eyes (eyes that look back), no sockets
//   B3 Long crawler       limbs a third longer, spidery, the head below the shoulders, a jaw that unhinges in the leap
//
// The fixes, for all six: the parts are rigid-merged like the people (rigid-merge.js, inkSolid: inked only round the
// silhouette, no lines where the limb tubes meet) to 2-3 draw calls; a "spread" hand (fingers fanned, claws out) swapped
// in for the leap; digitigrade legs with a real metatarsal and a toe joint that keeps the feet flat; A's thighs and calves
// thick, its hooves cloven; skins picked under the cold frame and the lantern both.
//
// buildV2(ghoul) builds the joint tree and the meshes on a Ghoul (ghoul.js calls it), poseV2(name, C) is the pose table.
import * as THREE from 'three';
import { toon, glow, soft } from './toon.js';
import { blob, sweep, limb, sdfMesh, decal, band, mount, merge, paint, surfTo, _sp, _sn, X, Z } from './skin.js';

const PI = Math.PI;
const col = c => new THREE.Color(c);
const darker = (hex, f = 0.7) => '#' + col(hex).multiplyScalar(f).getHexString();
const sstep = THREE.MathUtils.smoothstep;
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

// ------------------------------------------------------------------ the six
const A = {
  v2: true, family: 'A', scale: 1, girth: 1, waist: 1, shoulders: 1, legGirth: 1.25, armGirth: 1, hand: 1, finger: 1, clawLen: 1,
  headScale: 1, cranium: 1, muzzle: [1, 1, 1], jaw: [1, 1], jowls: 0, brow: 1, ears: { len: 1, back: 0, out: 0 },
  eyeStyle: 'slit', eyeR: 1.25, eyeGlow: 0.55, mottle: 0.6, ribs: 0, hipBones: 0, knobs: 1, mane: 'locks', hoof: true,
  hunch: 0, leapJaw: 0.75, splay: 0, armK: 1, neckK: 1,
  dims: { thigh: 0.38, shin: 0.36, meta: 0.17, upper: 0.46, fore: 0.47 },
  claw: '#d8cfae', clawTip: null,
};
const B = {
  ...A, family: 'B', girth: 0.85, waist: 0.82, legGirth: 0.9, armGirth: 0.85, hand: 1.05, finger: 1.7, scale: 0.97,
  ears: { len: 1.3, back: 0, out: 0 }, grin: true, ribs: 2.2, hipBones: 1, knobs: 1, mane: null, hoof: false, mottle: 0.35,
  eyeStyle: 'sockets', eyeR: 1, eye: '#86ffc0', eyeGlow: 1, allFours: true,
  dims: { thigh: 0.4, shin: 0.36, meta: 0.13, upper: 0.46, fore: 0.47 },
  skin: '#c7d1d8', belly: '#d9e0e3', patch: '#a6b0b8', dark: '#7a8389', claw: '#c6bfac',
};
export const V2 = {
  A1: { ...A, name: 'Pickman, refined', skin: '#58706b', belly: '#82938a', patch: '#3b4a45', dark: '#2a3430', eye: '#e7efcb' },
  A2: {
    ...A, name: 'Starved hound', scale: 1.1, girth: 0.8, waist: 0.72, shoulders: 0.95, legGirth: 1.0, armGirth: 0.85, finger: 1.2,
    cranium: 0.88, muzzle: [1.45, 0.78, 0.9], jaw: [0.85, 0.9], brow: 1.25, ears: { len: 1.15, back: 0.75, out: 0.25 },
    eyeStyle: 'sunken', eyeR: 0.85, eye: '#f2d24a', eyeGlow: 1.1, mottle: 0.5, ribs: 1.4, hipBones: 1.3, knobs: 1.4, mane: 'tufts',
    hunch: 0.12, dims: { thigh: 0.42, shin: 0.4, meta: 0.2, upper: 0.5, fore: 0.52 },
    skin: '#646e6d', belly: '#878e8b', patch: '#454e4c', dark: '#2c312e',
  },
  A3: {
    ...A, name: 'Grave-digger', scale: 0.86, girth: 1.4, waist: 1.08, shoulders: 1.35, legGirth: 1.45, armGirth: 1.45, hand: 1.25, finger: 0.85,
    clawLen: 2.1, headScale: 1.12, cranium: 1.08, muzzle: [0.72, 1.3, 1.25], jaw: [1.35, 1.6], jowls: 1, brow: 1.6,
    ears: { len: 0.55, back: 0.2, out: 1 }, eyeStyle: 'small', eyeR: 0.62, eye: '#f2b552', eyeGlow: 0.9, mottle: 0.75, knobs: 0, mane: 'crest',
    hunch: 0.2, dims: { thigh: 0.32, shin: 0.3, meta: 0.14, upper: 0.44, fore: 0.44 },
    skin: '#58675f', belly: '#727f70', patch: '#3e3b32', dark: '#2a2c26', claw: '#3a2f25', clawTip: '#8c7c62',
  },
  B1: { ...B, name: 'Crawler, refined' },
  B2: { ...B, name: "Crawler, A's eyes", eyeStyle: 'slit', eyeR: 1.35, eye: '#eef2d6', eyeGlow: 0.6 },
  B3: {
    ...B, name: 'Long crawler', girth: 0.8, waist: 0.75, armGirth: 0.8, legGirth: 0.85, finger: 2.0, ribs: 2.4, hipBones: 1.3, knobs: 1.3,
    armK: 1.33, leapJaw: 1.45, unhinge: 1, splay: 0.42, wrongElbows: true, neckK: 1.35, ears: { len: 1.1, back: 0.9, out: 0.1 },
    dims: { thigh: 0.53, shin: 0.48, meta: 0.17, upper: 0.61, fore: 0.63 },
    // the gaunt face: gauntHead() / gauntJaw() below
    gaunt: true, face: '#bcc2c2', hollow: '#2e3846', eye: '#7dffb4',
  },
};

// ------------------------------------------------------------------ small builders
const VC = () => toon('#ffffff', { vertexColors: true });
let _glowVC = null; // (the sockets' points and halos, the glints: unlit, vertex coloured, one material)
const glowVC = () => _glowVC || (_glowVC = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, name: 'ghoul-glow' }));
function place(g, pos, rot = null, scale = 1) {
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  g.applyMatrix4(_m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _w.set(scale, scale, scale)));
  return g;
}
// a claw or a tooth: a cone with its base at `at`, pointing along `dir`; a second colour fades in toward the tip
function spike(color, r, len, at, dir, seg = 6, tip = null) {
  const g = new THREE.ConeGeometry(r, len, seg);
  g.translate(0, len / 2, 0);
  if (tip) { const a = col(color), b = col(tip), c = new THREE.Color(); paint(g, (x, y) => '#' + c.copy(a).lerp(b, sstep(y / len, 0.45, 0.95)).getHexString()); }
  _q.setFromUnitVectors(_v.set(0, 1, 0), _w.set(dir[0], dir[1], dir[2]).normalize());
  g.applyQuaternion(_q);
  g.translate(at[0], at[1], at[2]);
  return tip ? g : paint(g, color);
}
// blotchy patches: a fixed sum of sines (the same ghoul for everyone), darker where it peaks
function mottle(g, C, amt = C.mottle, sc = 1, off = 0) {
  if (!amt) return g;
  const P = g.attributes.position, A = g.attributes.color, pc = col(C.patch), t = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i) * sc + off, y = P.getY(i) * sc, z = P.getZ(i) * sc - off;
    const n = Math.sin(x * 27 + 1.3) * Math.sin(y * 21 + 0.7) * Math.sin(z * 25 + 2.1) + 0.45 * Math.sin(x * 53 + y * 41 + 0.9) * Math.sin(z * 47 - y * 13 + 0.3);
    const f = sstep(n, 0.12, 0.42) * amt;
    t.setRGB(A.getX(i), A.getY(i), A.getZ(i)).lerp(pc, f);
    A.setXYZ(i, t.r, t.g, t.b);
  }
  return g;
}
// a lock of hair: a flat ribbon through points that lie on a skin (or hang free where the skin falls away), tapering to a tip
//   sh: the skin's shape; from: a start near the surface; dir: the way it flows (length included); droop: pulled down (-y) toward the tip
function lock(sh, from, dir, w, th, color, tipCol, { droop = 0, lift = 0.006, n = 7, curl = 0 } = {}) {
  const pts = [], nrm = [];
  const o = new THREE.Vector3(...sh.o);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const q = new THREE.Vector3(from[0] + dir[0] * t, from[1] + dir[1] * t - droop * t * t, from[2] + dir[2] * t);
    surfTo(sh, q.x, q.y, q.z);
    const sp = new THREE.Vector3(..._sp), sn = new THREE.Vector3(..._sn);
    const L = lift + 0.012 * t * t + curl * t * t * t;
    if (q.distanceTo(o) > sp.distanceTo(o) + L) { pts.push(q); nrm.push(sn); } // (the skin has fallen away: it hangs)
    else { pts.push(sp.addScaledVector(sn, L)); nrm.push(sn); }
  }
  return ribbon(pts, nrm, w, th, color, tipCol);
}
function ribbon(pts, nrm, w, th, color, tipCol) {
  const rings = [], T = new THREE.Vector3(), side = new THREE.Vector3(), b = new THREE.Vector3(), c0 = col(color), c1 = col(tipCol || color), c = new THREE.Color();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    side.crossVectors(T, nrm[i]).normalize(); b.crossVectors(side, T).normalize();
    const k = 1 - 0.85 * t * t, cl = '#' + c.copy(c0).lerp(c1, t).getHexString();
    const ring = { c: pts[i].toArray(), a: side.toArray(), b: b.toArray(), ra: w * k * (i === 0 ? 0.7 : 1), rb: th * (1 - 0.5 * t), col: cl };
    rings.push(ring);
  }
  const end = pts[n - 1].clone().addScaledVector(T, w * 0.4);
  rings.push({ c: end.toArray(), a: X, b: Z, ra: 0, rb: 0, col: tipCol || color });
  T.subVectors(pts[1], pts[0]).normalize();
  rings.unshift({ c: pts[0].clone().addScaledVector(T, -th).toArray(), a: X, b: Z, ra: 0, rb: 0, col: color });
  return sweep(rings, 6);
}
// a mangy tuft: a few short spikes out of the skin, leaning along `flow`
function tuft(sh, at, flow, len, color, k = 4, spread = 0.025) {
  const parts = [];
  for (let i = 0; i < k; i++) {
    const a = i * 2.4 + at[0] * 40, r = spread * Math.sqrt((i + 0.5) / k);
    surfTo(sh, at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r, at[2] + Math.sin(a * 1.7) * r * 0.5);
    const p = [..._sp], d = [_sn[0] + flow[0], _sn[1] + flow[1], _sn[2] + flow[2]];
    parts.push(spike(color, 0.009, len * (0.7 + 0.3 * Math.sin(a * 3) ** 2), [p[0] - _sn[0] * 0.004, p[1] - _sn[1] * 0.004, p[2] - _sn[2] * 0.004], d, 5));
  }
  return parts;
}

// ------------------------------------------------------------------ parts (built per variation, cached)
const NECK_AT = [0, 0.62, 0.1], JAW_AT = [0, -0.065, 0.035];
const cache = new Map();
function partsV2(C) {
  let c = cache.get(C.name);
  if (c) return c;
  c = {};
  const g = C.girth, sw = C.shoulders, skin = C.skin, belly = C.belly, D = C.dims;
  const hairDark = C.family === 'A' ? '#24221e' : C.dark, hairTip = '#3d3830';

  // ---- pelvis, the hip bones showing on the thin ones
  {
    const parts = [blob(skin, [0, 0.02, 0], [0.17 * g, 0.12, 0.13 * g])];
    if (C.hipBones) for (const s of [-1, 1]) parts.push(blob(skin, [s * 0.15 * g, 0.075 + 0.01 * C.hipBones, 0.035], [0.04 + 0.012 * C.hipBones, 0.03 + 0.008 * C.hipBones, 0.04], [0, 0, s * 0.3], 'lo'));
    c.pelvis = mottle(merge(parts), C);
  }

  // ---- torso: hunched (the chest forward and low, a hump high at the back), the waist pinched on the thin ones, ribs
  const T = c.T = (() => {
    const S = [
      [0, 0.12, 0.0, 0.17 * g, 0.15, 0.14 * g],
      [0, 0.3, 0.03, 0.165 * g * C.waist, 0.16, 0.15 * g * C.waist, 0.12],
      [0, 0.5, 0.02, 0.23 * g * sw, 0.16, 0.17 * g, 0.14],
      [0, 0.6, -0.1, 0.16 * g * sw, 0.13, 0.13, 0.12],       // the hump
      [0.22 * g * sw, 0.55, 0.0, 0.1 * sw, 0.085, 0.1, 0.1], [-0.22 * g * sw, 0.55, 0.0, 0.1 * sw, 0.085, 0.1, 0.1],
    ];
    if (C.family === 'A' && sw > 1.1) for (const s of [-1, 1]) S.push([s * 0.2 * g * sw, 0.48, 0.07, 0.11, 0.1, 0.09, 0.08]); // (a digger's chest)
    if (C.ribs) for (let i = 0; i < 6; i++) {
      const y = 0.27 + i * 0.045, w = 1 - 0.1 * Math.abs(i - 2.5);
      for (const s of [-1, 1]) S.push([s * 0.095 * g, y, 0.045, (0.1 + 0.012 * C.ribs) * g * w, 0.011 + 0.003 * C.ribs, (0.125 + 0.01 * C.ribs) * g * w, 0.022]);
    }
    if (C.knobs) for (let i = 0; i < 8; i++) { const t = i / 7; S.push([0, 0.18 + t * 0.46, -0.11 - 0.06 * Math.sin(t * PI), 0.02 * C.knobs, 0.018, 0.022 * C.knobs, 0.012]); }
    return { S, o: [0, 0.34, 0], ro: [0, 0.34, 0], radial: 0.18, stretch: [0.28, 0.42, 0.24], maxT: 1.0, axis: 'y' };
  })();
  {
    const torso = sdfMesh(T, skin, 34, 30);
    const P = torso.attributes.position, A = torso.attributes.color, cb = col(belly), cs = col(skin), cd = col(darker(skin, 0.78)), cr = col(darker(skin, 0.6)), tmp = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const front = sstep(z, 0.02, 0.16) * (1 - sstep(y, 0.5, 0.66));
      tmp.copy(cs).lerp(cb, front).lerp(cd, sstep(-z, 0.06, 0.16) * 0.8);
      if (C.ribs) { // the hollows between the ribs
        const ph = Math.cos(((y - 0.27) / 0.045) * 2 * PI), on = sstep(Math.abs(x), 0.05, 0.12) * sstep(y, 0.24, 0.28) * (1 - sstep(y, 0.5, 0.54));
        tmp.lerp(cr, sstep(-ph, 0.1, 0.8) * on * 0.3 * Math.min(2, C.ribs));
      }
      A.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    const parts = [mottle(torso, C)];
    // the mane down the back: A1's lank locks from the nape over the hump and shoulders; A2's mangy tufts; A3's stubby crest
    if (C.mane === 'locks') {
      // shingled rows from the nape down over the hump: each row lies over the one below, the ends hang free over the back and shoulders
      for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
        const u = (i - 3) / 3, x = u * (0.15 - 0.02 * row) * sw, y = 0.73 - 0.065 * row - 0.03 * u * u, z = 0.05 - 0.075 * row - 0.02 * u * u;
        const len = 0.24 + 0.05 * Math.cos(i * 2.1 + row), w = 0.04 - 0.004 * row;
        parts.push(lock(T, [x, y, z], [u * 0.12, -0.2 - 0.04 * row, -0.2 + 0.08 * Math.abs(u)], w, 0.013, hairDark, hairTip,
          { droop: 0.05 + 0.04 * Math.abs(u), lift: 0.022 - 0.006 * row, n: 8, curl: 0 }));
      }
    } else if (C.mane === 'tufts') {
      for (const [x, y, z, fy, len] of [[0.05, 0.64, -0.12, -0.6, 0.05], [-0.07, 0.58, -0.15, -0.6, 0.045], [0.15, 0.56, -0.08, -0.5, 0.04], [-0.2, 0.52, 0.0, -0.4, 0.035],
        [0.02, 0.42, -0.16, -0.7, 0.04], [0.09, 0.24, -0.13, -0.7, 0.03], [-0.17, 0.3, 0.1, -0.5, 0.03]])
        parts.push(...tuft(T, [x, y, z], [0, fy, -0.3], len, hairDark, 4));
    } else if (C.mane === 'crest') {
      for (let i = 0; i < 16; i++) {
        const t = i / 15, y = 0.68 - t * 0.52, s = i & 1 ? 1 : -1;
        surfTo(T, s * 0.012, y, -0.3);
        const p = [..._sp];
        parts.push(spike(i & 1 ? hairDark : '#33302a', 0.021, 0.1 - 0.04 * t, [p[0] - _sn[0] * 0.006, p[1] - _sn[1] * 0.006, p[2] - _sn[2] * 0.006], [_sn[0] + s * 0.15, _sn[1] - 0.7, _sn[2]], 5));
      }
    }
    c.torso = merge(parts);
  }

  // ---- neck: a thick tube forward and up to the head (longer on B3), the mane carried on along its top
  const NE = c.NECK_END = [0, 0.1 * C.neckK, 0.2 * C.neckK];
  {
    const rings = [], n = 7, r0 = 0.085 * Math.max(g, 0.85) * (C.family === 'A' && sw > 1.1 ? 1.25 : 1), r1 = 0.07 * (C.family === 'A' && sw > 1.1 ? 1.2 : 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = NE[1] * t - 0.03 * Math.sin(t * PI), z = NE[2] * t;
      const Tn = new THREE.Vector3(0, NE[1] - 0.03 * PI * Math.cos(t * PI), NE[2]).normalize(), Bn = new THREE.Vector3(0, Tn.z, -Tn.y);
      rings.push({ c: [0, y, z], a: X, b: Bn.toArray(), ra: r0 + (r1 - r0) * t, rb: (r0 + (r1 - r0) * t) * 0.9, col: skin });
    }
    rings.unshift({ c: [0, -0.04, -0.02], a: X, b: Z, ra: 0, rb: 0, col: skin });
    const parts = [mottle(sweep(rings, 14), C)];
    // (a stand-in skin for the neck so locks and tufts can find its surface)
    const NS = { S: [0.0, 0.35, 0.7, 1.0].map((t, i) => [0, NE[1] * t - 0.03 * Math.sin(t * PI), NE[2] * t, r0 + (r1 - r0) * t, (r0 + (r1 - r0) * t) * 0.95, (r0 + (r1 - r0) * t) * 1.2, i ? 0.05 : 0]).map(e => (e[6] === 0 ? e.slice(0, 6) : e)),
      o: [0, NE[1] * 0.5, NE[2] * 0.5], ro: [0, NE[1] * 0.5, NE[2] * 0.5], radial: 0, stretch: [1, 1, 1], maxT: 0.4, axis: 'y' };
    const up = new THREE.Vector3(0, NE[2], -NE[1]).normalize(); // (the top of the neck)
    if (C.mane === 'locks') {
      for (const [t, sx] of [[1.0, 0], [0.95, 0.45], [0.95, -0.45], [0.8, 0.85], [0.8, -0.85], [0.7, 0.2], [0.7, -0.2], [0.5, 0.6], [0.5, -0.6], [0.45, 0], [0.25, 0.9], [0.25, -0.9], [0.2, 0.3], [0.2, -0.3]]) {
        const cx = sx * 0.07, cy = NE[1] * t + up.y * 0.09, cz = NE[2] * t + up.z * 0.09;
        parts.push(lock(NS, [cx, cy, cz], [sx * 0.1, -0.12 - 0.06 * Math.abs(sx), -0.14], 0.042, 0.013, hairDark, hairTip, { droop: 0.09, lift: 0.014, n: 7, curl: 0.03 }));
      }
    } else if (C.mane === 'tufts') {
      for (const [t, sx] of [[0.8, 0.3], [0.45, -0.5], [0.2, 0.6]]) parts.push(...tuft(NS, [sx * 0.09, NE[1] * t + up.y * 0.09, NE[2] * t + up.z * 0.09], [0, -0.3, -0.6], 0.045, hairDark, 4));
    } else if (C.mane === 'crest') {
      for (let i = 0; i < 6; i++) {
        const t = 0.1 + i * 0.16, s = i & 1 ? 1 : -1;
        surfTo(NS, s * 0.01, NE[1] * t + up.y * 0.2, NE[2] * t + up.z * 0.2);
        parts.push(spike(hairDark, 0.02, 0.085, [_sp[0] - _sn[0] * 0.006, _sp[1] - _sn[1] * 0.006, _sp[2] - _sn[2] * 0.006], [_sn[0], _sn[1] - 0.4, _sn[2] - 0.6], 5));
      }
    }
    c.neck = merge(parts);
  }

  // ---- head: a canine skull, the muzzle long and narrow (A2), short and broad with jowls (A3), or wide for the grin (B);
  // B3's gaunt face is its own (gauntHead, below)
  if (C.gaunt) gauntHead(C, c);
  else {
    const [mL, mW, mH] = C.muzzle, cw = C.cranium, br = C.brow;
    const Zm = z => 0.1 + (z - 0.1) * mL;                   // round 1's muzzle z, stretched
    const S = [
      [0, 0.02, -0.02, 0.115 * cw, 0.1, 0.12],
      [0, 0.05 + 0.005 * br, 0.075, 0.105 * cw, 0.04 * br, 0.07, 0.06],                          // the brow ridge
      [0.08 * cw, -0.02, 0.035, 0.045 * Math.max(1, mW * 0.9), 0.05, 0.07, 0.06], [-0.08 * cw, -0.02, 0.035, 0.045 * Math.max(1, mW * 0.9), 0.05, 0.07, 0.06],  // cheeks
      [0, -0.035, Zm(0.16), 0.058 * mW, 0.052 * mH, 0.1 * mL, 0.08],                              // the muzzle
      [0, -0.015, Zm(0.245), 0.034 * mW, 0.03 * mH, 0.03, 0.04],                                  // the nose end
      [0, 0.0, -0.1, 0.08 * cw, 0.075, 0.07, 0.08],                                               // the back of the skull
    ];
    if (C.grin) { S[4] = [0, -0.035, 0.15, 0.075, 0.045, 0.1, 0.08]; S[5] = [0, -0.02, 0.235, 0.045, 0.026, 0.03, 0.05]; }
    if (C.jowls) for (const s of [-1, 1]) S.push([s * 0.06 * mW, -0.06, Zm(0.15), 0.042, 0.05 * C.jowls, 0.07, 0.04]);
    const H = c.H = { S, o: [0, -0.005, 0.04], ro: [0, -0.005, 0.04], radial: 0.3, stretch: [0.14, 0.12, 0.2 * Math.max(1, mL * 0.9)], maxT: 0.5 * Math.max(1, mL), axis: 'z' };
    const nz = C.grin ? 0.235 : Zm(0.245);
    const parts = [sdfMesh(H, skin, 38, 28)];
    {
      const eyeY = C.eyeStyle === 'small' ? 0.018 : 0.028;
      const P = parts[0].attributes.position, A = parts[0].attributes.color, cs = col(skin), cd = col(darker(skin, 0.68)), tmp = new THREE.Color();
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const hollow = Math.max(0, 1 - Math.hypot((Math.abs(x) - 0.06) / 0.05, (y - eyeY) / 0.04, (z - 0.1) / 0.065));
        const nose = sstep(z, nz - 0.07, nz + 0.02) * 0.5;
        tmp.copy(cs).lerp(cd, Math.min(1, hollow * (C.eyeStyle === 'sunken' ? 1.3 : 0.9) + nose));
        A.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      mottle(parts[0], C, C.mottle * 0.8, 1.4, 0.3);
    }
    // the nose: a wet dark lump
    parts.push(blob(C.dark, [0, -0.012, nz + 0.017], [0.024 * mW, 0.018 * mH, 0.016], null, 'lo'));
    for (const s of [-1, 1]) parts.push(blob(darker(C.dark, 0.6), [s * 0.011 * mW, -0.018, nz + 0.029], [0.006, 0.005, 0.004], null, 'tiny'));
    // upper teeth: the grin's wide arc of needles, or two long canines and a row along the lip
    const tooth = C.family === 'A' && C.clawTip ? '#c9bd98' : C.claw;
    if (C.grin) {
      for (let i = -8; i <= 8; i++) { const a = i / 8; parts.push(spike(tooth, 0.0045, 0.03 + 0.012 * (1 - Math.abs(a)), [a * 0.064, -0.062, 0.215 - 0.09 * a * a], [0, -1, 0.1], 5)); }
    } else {
      const ty = -0.07 * mH;
      for (const s of [-1, 1]) {
        parts.push(spike(tooth, 0.008 * Math.max(1, mW * 0.9), 0.05, [s * 0.04 * mW, ty, Zm(0.19)], [0, -1, 0.15], 6));
        for (let i = 0; i < 3; i++) parts.push(spike(tooth, 0.0045, 0.022, [s * (0.028 - i * 0.008) * mW, ty - 0.002, Zm(0.225 + i * 0.012)], [0, -1, 0.2], 5));
        for (let i = 0; i < (mL > 1.2 ? 3 : 1); i++) parts.push(spike(tooth, 0.005, 0.022, [s * 0.047 * mW, ty, Zm(0.14) - i * 0.03 + (i ? 0.06 : 0)], [0, -1, 0.1], 5));
      }
    }
    // the eyes' places
    const eyeX = C.eyeStyle === 'small' ? 0.06 : C.eyeStyle === 'sunken' ? 0.054 : 0.058, eyeY = C.eyeStyle === 'small' ? 0.018 : 0.028;
    const sink = C.eyeStyle === 'sunken' ? 0.014 : C.eyeStyle === 'small' ? 0.016 : 0.022;
    const eyeAt = c.eyeAt = [-1, 1].map(s => mount(H, [s * eyeX, eyeY, 0.105], sink, [s * 0.3, 0.1, 1], 0.5));
    if (C.eyeStyle === 'sockets') {
      for (const E of eyeAt) parts.push(decal(H, [E.p.x, E.p.y, E.p.z], 0.036, 0.029, '#0b0a0e', { lift: 0.0015, rings: 2 }));
    } else {
      if (C.eyeStyle === 'sunken') for (const E of eyeAt) parts.push(decal(H, [E.p.x, E.p.y, E.p.z], 0.036, 0.03, '#15130f', { lift: 0.0012, rings: 2 }));
      for (const E of eyeAt) {
        const r = 0.03 * C.eyeR;
        const pupil = C.eyeStyle === 'small' ? blob('#0d0c10', [0, 0, 0], [0.008, 0.009, 0.004], null, 'lo') : blob('#0d0c10', [0, 0, 0], [0.006 * C.eyeR, 0.016 * C.eyeR, 0.004], null, 'lo');
        pupil.applyMatrix4(_m.compose(E.p.clone().addScaledVector(E.n, r * 0.92), E.q, _one));
        parts.push(pupil);
      }
    }
    // ears: tall cupped leaves; laid back flat along the skull (A2, B3), small and folded out (A3)
    {
      const ear = C.ears;
      for (const s of [-1, 1]) {
        surfTo(H, s * 0.085 * cw, 0.085, -0.03);
        const at = [_sp[0], _sp[1], _sp[2]];
        const rings = [], L = 0.16 * ear.len;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6, r = 0.05 * (0.75 + 0.25 * ear.len) * (1 - Math.pow(t, 1.6)) * (1 + 0.1 * Math.sin(PI * t)) + 0.002;
          rings.push(i === 6 ? { c: [0, L + 0.01, 0], a: X, b: Z, ra: 0, rb: 0, col: skin } : { c: [0, t * L, -0.015 * t * t - 0.03 * ear.out * t * t], a: X, b: Z, ra: r, rb: r * 0.45, col: skin, cup: 0.012 });
        }
        const e = merge([sweep(rings, 9), blob(darker(skin, 0.55), [0, L * 0.42, 0.012], [0.026 * (0.75 + 0.25 * ear.len), L * 0.36, 0.008], null, 'lo')]);
        parts.push(place(e, at, [-0.35 - 1.05 * ear.back, s * (0.4 - 0.25 * ear.back), -s * (0.55 + 0.7 * ear.out - 0.25 * ear.back)]));
      }
    }
    // the mane's crown: lank locks from the crown back over the skull (A1), tufts behind the ears (A2), the crest's start (A3)
    if (C.mane === 'locks') {
      for (const [x, y, z, dx, dy, dz, w] of [[0, 0.1, 0.04, 0, -0.06, -0.28, 0.04], [0.04, 0.1, 0.02, 0.05, -0.1, -0.24, 0.036], [-0.04, 0.1, 0.02, -0.05, -0.1, -0.24, 0.036],
        [0.075, 0.07, -0.02, 0.07, -0.16, -0.16, 0.034], [-0.075, 0.07, -0.02, -0.07, -0.16, -0.16, 0.034], [0.02, 0.105, 0.07, 0.03, -0.04, -0.3, 0.032], [-0.02, 0.105, 0.07, -0.03, -0.04, -0.3, 0.032],
        [0.095, 0.03, -0.05, 0.05, -0.2, -0.1, 0.03], [-0.095, 0.03, -0.05, -0.05, -0.2, -0.1, 0.03]])
        parts.push(lock(H, [x, y, z], [dx, dy, dz], w, 0.012, hairDark, hairTip, { droop: 0.07, lift: 0.012, n: 7, curl: 0.03 }));
    } else if (C.mane === 'tufts') {
      for (const s of [-1, 1]) parts.push(...tuft(H, [s * 0.09, 0.03, -0.08], [s * 0.3, -0.3, -0.6], 0.04, hairDark, 3, 0.02));
      parts.push(...tuft(H, [0, 0.09, -0.06], [0, -0.2, -0.7], 0.035, hairDark, 3, 0.015));
    } else if (C.mane === 'crest') {
      for (let i = 0; i < 4; i++) {
        surfTo(H, (i & 1 ? 1 : -1) * 0.01, 0.2, 0.0 - i * 0.05);
        parts.push(spike(hairDark, 0.015, 0.05, [_sp[0] - _sn[0] * 0.005, _sp[1] - _sn[1] * 0.005, _sp[2] - _sn[2] * 0.005], [_sn[0], _sn[1], _sn[2] - 0.9], 5));
      }
    }
    c.head = merge(parts);

    // the eyes: pale balls that catch the lantern (their own faint glow), or the sockets' green points with a dimmer halo
    const eyes = [], glints = [];
    for (const E of eyeAt) {
      if (C.eyeStyle === 'sockets') {
        const halo = blob(darker(C.eye, 0.4), [0, 0, 0], [0.024, 0.02, 0.004], null, 'lo');
        halo.applyMatrix4(_m.compose(E.p.clone().addScaledVector(E.n, 0.02), E.q, _one));
        const e = blob(C.eye, [0, 0, 0], [0.016, 0.014, 0.01], null, 'lo');
        e.applyMatrix4(_m.compose(E.p.clone().addScaledVector(E.n, 0.026), E.q, _one));
        glints.push(halo, e);
      } else {
        const r = 0.03 * C.eyeR;
        const e = blob(C.eye, [0, 0, 0], [r, r * 0.95, r * 0.85]);
        e.applyMatrix4(_m.compose(E.p.clone(), E.q, _one));
        eyes.push(e);
        const gr = C.eyeStyle === 'small' ? 1.25 : 1;
        const gl = blob('#ffffff', [-0.3 * r * Math.sign(E.p.x), 0.33 * r, r * 0.93], [0.0065 * gr, 0.0075 * gr, 0.003], null, 'tiny');
        gl.applyMatrix4(_m.compose(E.p.clone(), E.q, _one));
        glints.push(gl);
      }
    }
    c.eyes = eyes.length ? merge(eyes) : null;
    c.glints = merge(glints);
  }

  // ---- lower jaw (pivots at JAW_AT): chin, a wet dark mouth, a tongue, lower teeth; A3's heavy and underslung
  if (C.gaunt) gauntJaw(C, c);
  else {
    const [mL, mW] = C.muzzle, [jW, jD] = C.jaw;
    const L = C.grin ? 0.2 * (C.unhinge ? 1.12 : 1) : 0.21 * mL, w = (C.grin ? 0.07 : 0.055) * (C.grin ? 1 : mW) * jW, d = 0.028 * jD;
    const parts = [
      blob(skin, [0, -0.015 - (d - 0.028) * 0.6, L * 0.5], [w, d, L * 0.52], null, 'mid'),
      blob('#1c0a10', [0, 0.008, L * 0.5 - 0.01], [w * 0.92, 0.014, L * 0.5], null, 'mid'),
      blob('#7a2434', [0, 0.012, L * 0.42], [w * 0.45, 0.011, L * 0.36], null, 'lo'),
    ];
    if (C.grin) for (let i = -7; i <= 7; i++) { const a = i / 7; parts.push(spike(C.claw, 0.004, 0.026, [a * 0.06, 0.005, L * 0.98 - 0.075 * a * a], [0, 1, 0.12], 5)); }
    else for (const s of [-1, 1]) {
      const big = jD > 1.2; // (A3: the lower canines stand up outside the lip, an underbite)
      parts.push(spike(C.family === 'A' && C.clawTip ? '#c9bd98' : C.claw, big ? 0.011 : 0.0075, big ? 0.06 : 0.045, [s * (big ? 0.05 : 0.038) * (big ? 1 : mW), 0.004, L * (big ? 0.9 : 0.86)], [s * (big ? 0.1 : 0), 1, big ? 0.05 : -0.1], 6));
      for (let i = 0; i < 3; i++) parts.push(spike(C.claw, 0.004, 0.018, [s * (0.024 - i * 0.008) * mW, 0.004, L * 0.98 - i * 0.004], [0, 1, 0.1], 5));
    }
    c.jaw = mottle(merge(parts), C, C.mottle * 0.6);
  }

  // ---- limbs (hang -y from their joint): thick digitigrade thighs and calves on A, a ball at each joint so the tubes meet in one shape
  {
    const ag = C.armGirth, lg = C.legGirth;
    c.upperArm = mottle(merge([limb(D.upper - 0.02, 0.06 * ag, 0.045 * ag, skin, undefined, null, { seg: 12 }), blob(skin, [0, -0.06, 0.0], [0.075 * ag, 0.1, 0.07 * ag], null, 'mid')]), C, C.mottle, 1, 1.1);
    c.foreArm = mottle(merge([limb(D.fore - 0.02, 0.048 * ag, 0.034 * ag, skin, undefined, null, { seg: 12 }), blob(skin, [0, -0.01, -0.012], [0.05 * ag, 0.055, 0.052 * ag], null, 'mid'),
      blob(skin, [0, -0.12, 0.012], [0.052 * ag, 0.1, 0.048 * ag], null, 'mid')]), C, C.mottle, 1, 2.2);
    // the thigh: a heavy haunch (a quadriceps in front, a hamstring behind), tapering to the knee
    c.thigh = mottle(merge([limb(D.thigh - 0.02, 0.085 * lg, 0.05 * lg, skin, undefined, null, { seg: 12 }),
      blob(skin, [0, -0.08, 0.02], [0.08 * lg, 0.14, 0.085 * lg], null, 'mid'), blob(skin, [0, -0.11, -0.03], [0.068 * lg, 0.13, 0.07 * lg], null, 'mid')]), C, C.mottle, 1, 3.3);
    // the shin (tibia) with the calf muscle bulging at its top back, the knee a knob
    c.shin = mottle(merge([limb(D.shin - 0.02, 0.055 * lg, 0.03 * lg, skin, undefined, null, { seg: 12 }),
      blob(skin, [0, -0.09, -0.03], [0.058 * lg, 0.12, 0.062 * lg], null, 'mid'), blob(skin, [0, 0.0, 0.012], [0.055 * lg, 0.05, 0.05 * lg], null, 'lo')]), C, C.mottle, 1, 4.4);
    // the metatarsal: a long thin bone to the foot, the hock a knob at its top back
    c.meta = mottle(merge([limb(D.meta, 0.032 * lg, 0.026 * lg, skin, undefined, null, { seg: 10 }), blob(skin, [0, 0.0, -0.018], [0.034 * lg, 0.042, 0.038 * lg], null, 'lo')]), C, C.mottle, 1, 5.5);
  }

  // ---- hands: a palm and four long fingers with claws, a thumb; closed (curled) or spread (fanned, claws out); mirrored
  const handGeo = (side, spread) => {
    const hs = C.hand, fl = C.finger, cl = C.clawLen, parts = [blob(skin, [0, -0.045 * hs, 0], [0.044 * hs, 0.056 * hs, 0.018 * hs], null, 'mid')];
    const knuck = darker(skin, 0.82), clawR = (cl > 1.5 ? 0.0085 : 0.006) * hs;
    for (let i = 0; i < 4; i++) {
      const x = (-0.03 + i * 0.02) * hs, len = (0.085 + 0.015 * Math.sin((i + 0.5) / 4 * PI)) * fl * hs;
      const fan = spread ? (i - 1.5) * 0.3 : (i - 1.5) * 0.08, curl = spread ? 0.08 : -0.12 - 0.1 * fl;
      const f = limb(len, 0.011 * hs, 0.0075 * hs, i & 1 ? skin : knuck, undefined, null, { seg: 6, steps: 3 });
      const base = [x, -0.085 * hs, 0.002];
      place(f, base, [curl, 0, fan]);
      parts.push(f);
      // the claw at the fingertip: curled toward the palm, or out along the finger (spread)
      _e.set(curl, 0, fan, 'YXZ');
      const dirF = new THREE.Vector3(0, -1, 0).applyEuler(_e), tip = dirF.clone().multiplyScalar(len * 0.98).add(new THREE.Vector3(...base));
      const dir = spread ? dirF.clone().add(new THREE.Vector3(0, 0, 0.35)) : dirF.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0, 1));
      parts.push(spike(C.claw, clawR, 0.034 * hs * Math.sqrt(fl) * cl * (spread ? 1.2 : 1), tip.toArray(), dir.toArray(), 6, C.clawTip));
    }
    const thumb = limb(0.06 * hs * Math.sqrt(fl), 0.0115 * hs, 0.008 * hs, skin, undefined, null, { seg: 6, steps: 3 });
    place(thumb, [side * -0.045 * hs, -0.04 * hs, 0.005], spread ? [-0.2, 0, side * 1.3] : [-0.5, 0, side * 0.9]);
    parts.push(thumb);
    parts.push(spike(C.claw, clawR, 0.026 * hs * cl, spread ? [side * -0.098 * hs, -0.062 * hs, 0.012] : [side * -0.085 * hs, -0.082 * hs, 0.03], spread ? [side * -1, -0.4, 0.4] : [side * -0.4, -0.5, 1], 6, C.clawTip));
    return mottle(merge(parts), C, C.mottle * 0.6, 2);
  };
  c.hand = [-1, 1].map(s => handGeo(s, false));
  c.spread = [-1, 1].map(s => handGeo(s, true));

  // ---- feet, hung from the toe joint (kept level when standing): cloven hooves (A) or long clawed toes (B)
  c.foot = [-1, 1].map(() => {
    const lg = C.legGirth;
    if (C.hoof) {
      const kc = '#1d1a17', kc2 = '#3a332b', hairC = darker(C.dark, 0.8);
      const parts = [limb(0.025, 0.03 * lg, 0.03 * lg, skin, undefined, null, { seg: 10, steps: 2 })];
      // the coronet: a thin fringe of dark hair where the skin meets the horn
      parts.push(blob(hairC, [0, -0.032, 0.004], [0.036 * lg, 0.012, 0.038 * lg], null, 'mid'));
      // the two toes of a cloven hoof: tall horn wedges, pointed at the front, flat on the inside, a gap between them
      for (const s of [-1, 1]) {
        const rings = [], point = a => 1 + 0.35 * Math.max(0, Math.sin(a)) ** 3, flat = a => (Math.cos(a) * s < 0 ? 0.55 : 1);
        for (const [y, z, ra, rb, cl] of [[-0.03, 0.0, 0.017, 0.026, kc2], [-0.06, 0.016, 0.021, 0.036, kc], [-0.095, 0.034, 0.024, 0.047, kc], [-0.11, 0.04, 0.022, 0.044, kc], [-0.11, 0.04, 0, 0, kc]])
          rings.push({ c: [0, y, z], a: X, b: Z, ra: ra * lg, rb: rb * lg, col: cl, mod: a => point(a) * flat(a) });
        const toe = sweep(rings, 14);
        parts.push(place(toe, [s * 0.021 * lg, 0, 0], [0, -s * 0.16, 0]));
      }
      // the cleft, a black wedge between the toes at the front, and two dewclaws at the back
      parts.push(blob('#050404', [0, -0.08, 0.055 * lg], [0.004, 0.03, 0.03], null, 'tiny'));
      for (const s of [-1, 1]) parts.push(spike(kc, 0.01, 0.022, [s * 0.018, -0.04, -0.03 * lg], [s * 0.3, -0.6, -1], 6));
      return merge(parts);
    }
    const hs = 0.9 + 0.1 * C.hand, parts = [blob(skin, [0, -0.045, 0.03], [0.045 * hs, 0.03, 0.07 * hs], null, 'mid'), blob(skin, [0, -0.02, -0.01], [0.034, 0.04, 0.036], null, 'lo')];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.03 * hs, len = (0.075 + 0.015 * (1 - Math.abs(i - 1))) * hs * (C.finger > 1.8 ? 1.25 : 1);
      const toe = limb(len, 0.012 * hs, 0.008 * hs, i === 1 ? skin : darker(skin, 0.85), undefined, null, { seg: 6, steps: 3 });
      place(toe, [x, -0.05, 0.08 * hs], [-PI / 2 + 0.15, 0, (i - 1) * 0.12]);
      parts.push(toe);
      parts.push(spike(C.claw, 0.006 * hs, 0.028 * hs, [x + (i - 1) * 0.1 * len, -0.068, 0.08 * hs + len], [0, -0.5, 1], 6));
    }
    return mottle(merge(parts), C, C.mottle * 0.5, 2);
  });

  cache.set(C.name, c);
  return c;
}

// ------------------------------------------------------------------ B3's face
// A gaunt canine skull under thin skin (square on at arm's length a round dome with big ringed eyes read as a friendly seal): long
// and narrow, the brow ridge and the cheekbones standing out, deep narrow sockets pressed into the skin with a small hard green
// point far back in each (a little uneven), the muzzle wrinkled back off a full row of needles, two slits for a nose, bone
// grey-white with cold shadow in every hollow. The same parts as the other faces (the head and its glints, the jaw), so the merge,
// the rig and the cost are the same in kind.
const hash01 = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function gauntHead(C, c) {
  const skin = C.skin, bone = C.face, cold = col(C.hollow);
  const S = [
    [0, 0.012, -0.035, 0.088, 0.078, 0.115],                                                       // the cranium: narrow, low
    [0, 0.004, -0.115, 0.066, 0.06, 0.062, 0.06],                                                  // the back of the skull
    [0, 0.07, -0.035, 0.013, 0.02, 0.095, 0.035],                                                  // a crest along the top
    [-0.046, 0.05, 0.088, 0.04, 0.02, 0.034, 0.03], [0.046, 0.054, 0.086, 0.042, 0.021, 0.034, 0.03], // the brow ridges (uneven)
    [0, 0.04, 0.1, 0.026, 0.022, 0.03, 0.03],                                                      // between the brows
    [-0.072, -0.014, 0.068, 0.024, 0.019, 0.058, 0.026], [0.072, -0.012, 0.068, 0.024, 0.019, 0.058, 0.026], // the cheekbones
    [-0.078, -0.006, 0.0, 0.018, 0.018, 0.06, 0.03], [0.078, -0.006, 0.0, 0.018, 0.018, 0.06, 0.03],          // the arches to the ears
    [0, -0.034, 0.105, 0.052, 0.046, 0.06, 0.045],                                                 // the face under the eyes
    [0, -0.034, 0.185, 0.042, 0.038, 0.1, 0.05],                                                   // the muzzle: long and narrow
    [0, 0.0, 0.175, 0.02, 0.026, 0.085, 0.03],                                                     // the bridge of the nose
    [0, -0.024, 0.276, 0.028, 0.024, 0.028, 0.035],                                                // the nose end
  ];
  for (let i = 0; i < 3; i++) S.push([0, 0.008 - 0.004 * i, 0.15 + 0.032 * i, 0.034 - 0.003 * i, 0.009, 0.006, 0.012]); // the snarl's wrinkles
  const H = c.H = { S, o: [0, -0.008, 0.05], ro: [0, -0.008, 0.05], radial: 0.22, stretch: [0.12, 0.11, 0.25], maxT: 0.5, axis: 'z' };
  const head = mottle(sdfMesh(H, skin, 40, 30), C, C.mottle * 0.6, 1.4, 0.3);

  // the sockets: where they sit on the skull (narrow, the inner corner down, the right one higher and bigger), pressed in
  const socks = [[-1, 0.026, 0.031, 0.017, 0.36, 0.022], [1, 0.033, 0.033, 0.019, 0.3, 0.025]].map(([s, y, rx, ry, slant, depth]) => {
    surfTo(H, s * 0.054, y, 0.11);
    const p = new THREE.Vector3(..._sp), n = new THREE.Vector3(..._sn).lerp(new THREE.Vector3(s * 0.35, 0.05, 1).normalize(), 0.5).normalize();
    const U = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(), R = new THREE.Vector3().crossVectors(U, n);
    return { s, p, n, U, R, rx, ry, rz: 0.03, th: s * slant, depth };
  });
  {
    const P = head.attributes.position, N = head.attributes.normal, A = head.attributes.color;
    const cb = col(bone), deep = col('#06070a'), tip = col('#33313a'), t = new THREE.Color(), nn = new THREE.Vector3();
    const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => Math.max(0, 1 - Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz));
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      t.setRGB(A.getX(i), A.getY(i), A.getZ(i)).lerp(cb, sstep(z, -0.06, 0.06));              // (the face greyer than the body)
      // cold in the hollows: under the cheekbones, the temples, along the lip and under the muzzle, the snarl's furrows
      let h = 0;
      for (const s of [-1, 1]) h = Math.max(h, ell(x, y, z, s * 0.058, -0.05, 0.075, 0.03, 0.024, 0.06) * 1.2, ell(x, y, z, s * 0.07, 0.04, 0.015, 0.028, 0.03, 0.045));
      h = Math.max(h, sstep(-y, 0.05, 0.07) * sstep(z, 0.06, 0.12) * 0.8);
      const fur = sstep(z, 0.13, 0.15) * (1 - sstep(z, 0.235, 0.255)) * sstep(y, -0.045, -0.015);
      h = Math.max(h, sstep(Math.cos((z + 2.2 * x * x - 0.142) / 0.032 * 2 * PI), 0.3, 0.95) * fur * 0.85);
      t.lerp(cold, Math.min(1, h) * 0.75).lerp(tip, sstep(z, 0.27, 0.3));
      for (const K of socks) {
        _v.set(x, y, z).sub(K.p);
        const a = _v.dot(K.R), b = _v.dot(K.U), cd = _v.dot(K.n), ca = Math.cos(K.th), sa = Math.sin(K.th);
        const u = (a * ca + b * sa) / K.rx, w = (-a * sa + b * ca) / K.ry, q = u * u + w * w + (cd / K.rz) ** 2;
        if (q >= 3) continue;
        t.lerp(cold, 0.8 * (1 - sstep(q, 0.7, 3)));                                               // the cold under the brow, round the socket
        if (q >= 1) continue;
        const f = (1 - q) * (1 - q), r = Math.sqrt(q);
        t.lerp(deep, sstep(f, 0.0, 0.4));                                                         // black at the back (no ring: a gradient)
        // pressed in, the normal tilted toward the socket's axis so it shades as a hole
        nn.set(N.getX(i), N.getY(i), N.getZ(i));
        x -= nn.x * K.depth * f; y -= nn.y * K.depth * f; z -= nn.z * K.depth * f;
        _w.copy(_v).addScaledVector(K.n, -cd).normalize();
        nn.addScaledVector(_w, -K.depth * 4 * (1 - q) * r / ((K.rx + K.ry) * 0.5)).normalize();
        P.setXYZ(i, x, y, z); N.setXYZ(i, nn.x, nn.y, nn.z);
      }
      A.setXYZ(i, t.r, t.g, t.b);
    }
  }
  const parts = [head];
  // the nose: two slits in a dark end, not a button
  for (const s of [-1, 1]) parts.push(decal(H, [s * 0.011, -0.019, 0.33], 0.0032, 0.0105, '#09080b', { rot: s * 0.55, lift: 0.0012 }));
  // the roof of the mouth, dark (it shows when the jaw drops)
  parts.push(blob('#140910', [0, -0.07, 0.19], [0.03, 0.007, 0.09], null, 'lo'));
  // the upper needles all round the lip, crooked and uneven, the gum bared above them (the snarl)
  const lip = [];
  for (let i = -9; i <= 9; i++) {
    const a = i / 9, z = 0.29 - 0.2 * a * a, x = Math.sin(a * PI / 2) * 0.04;
    surfTo(H, x * 1.5, -0.085, z, [0, -0.03, z - 0.01]);
    lip.push({ a, i, p: new THREE.Vector3(..._sp), n: new THREE.Vector3(..._sn) });
  }
  parts.push(band(H, lip.map(l => l.p.clone().addScaledVector(l.n, 0.002).toArray()), 0.012, '#21151c', { taper: false, lift: 0.0016, fromO: [0, -0.03, 0.18] }));
  for (const l of lip) {
    const h = hash01(l.i), front = 1 - Math.abs(l.a), len = 0.026 + 0.012 * h + 0.016 * front * front;
    const at = l.p.clone().addScaledVector(l.n, -0.003);
    parts.push(spike('#8a8274', 0.0044 + 0.001 * front, len, at.toArray(), [l.a * 0.45 + (h - 0.5) * 0.35, -1, 0.1 + 0.25 * front], 5, '#e6e3d9'));
  }
  // the ears: laid back flat along the skull
  {
    const ear = C.ears;
    for (const s of [-1, 1]) {
      surfTo(H, s * 0.062, 0.06, -0.06);
      const at = [_sp[0], _sp[1], _sp[2]], rings = [], L = 0.16 * ear.len;
      for (let i = 0; i <= 6; i++) {
        const tt = i / 6, r = 0.05 * (0.75 + 0.25 * ear.len) * (1 - Math.pow(tt, 1.6)) * (1 + 0.1 * Math.sin(PI * tt)) + 0.002;
        rings.push(i === 6 ? { c: [0, L + 0.01, 0], a: X, b: Z, ra: 0, rb: 0, col: skin } : { c: [0, tt * L, -0.015 * tt * tt - 0.03 * ear.out * tt * tt], a: X, b: Z, ra: r, rb: r * 0.45, col: skin, cup: 0.012 });
      }
      const e = merge([sweep(rings, 9), blob(darker(skin, 0.8), [0, L * 0.42, 0.012], [0.026 * (0.75 + 0.25 * ear.len), L * 0.36, 0.008], null, 'lo')]);
      parts.push(place(e, at, [-0.35 - 1.05 * ear.back, s * (0.4 - 0.25 * ear.back), -s * (0.55 + 0.7 * ear.out - 0.25 * ear.back)]));
    }
  }
  c.head = merge(parts);
  // the eyes: a small hard green point far back in each socket (the right one bigger), a pinprick of the lantern on its wet rim
  const glints = [];
  c.eyeAt = socks.map(K => ({ p: K.p.clone().addScaledVector(K.n, -K.depth * 0.6), n: K.n, q: new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(K.R, K.U, K.n)) }));
  for (const [k, K] of socks.entries()) {
    const E = c.eyeAt[k], r = 0.0062 * (K.s > 0 ? 1.3 : 1);
    const e = blob(C.eye, [0, 0, 0], [r, r * 0.8, r * 0.6], null, 'lo');
    e.applyMatrix4(_m.compose(E.p.clone().addScaledVector(K.n, 0.002), E.q, _one));
    const gl = blob('#f2fff8', [0, 0, 0], [0.0018, 0.0016, 0.001], null, 'tiny');
    gl.applyMatrix4(_m.compose(K.p.clone().addScaledVector(K.U, -K.ry * 0.55).addScaledVector(K.R, -K.s * K.rx * 0.25).addScaledVector(K.n, -K.depth * 0.25), E.q, _one));
    glints.push(e, gl);
  }
  c.eyes = null;
  c.glints = merge(glints);
}
// B3's jaw: long and narrow like the muzzle, a dark wet mouth, a dark tongue (no red), crooked needles all round
function gauntJaw(C, c) {
  const L = 0.245, w = 0.043, d = 0.024, bone = C.face;
  const jb = mottle(blob(bone, [0, -0.014, L * 0.5], [w, d, L * 0.52], null, 'mid'), C, C.mottle * 0.5);
  {
    const P = jb.attributes.position, A = jb.attributes.color, cc = col(C.hollow), t = new THREE.Color();
    for (let i = 0; i < P.count; i++) { t.setRGB(A.getX(i), A.getY(i), A.getZ(i)).lerp(cc, sstep(-P.getY(i), 0.0, 0.034) * 0.65); A.setXYZ(i, t.r, t.g, t.b); }
  }
  const parts = [jb,
    blob('#0b080d', [0, 0.008, L * 0.5 - 0.008], [w * 0.88, 0.013, L * 0.5], null, 'mid'),
    blob('#2a272d', [0, 0.013, L * 0.42], [w * 0.42, 0.009, L * 0.34], null, 'lo'),
  ];
  // wet: a few pale flecks on the tongue and the gums that catch the lantern
  for (const [x, z, r] of [[0.006, 0.4, 0.0035], [-0.01, 0.58, 0.003]]) parts.push(blob('#56606e', [x, 0.0222, L * z], [r * 0.8, 0.0012, r * 1.4], null, 'tiny'));
  for (let i = -8; i <= 8; i++) {
    const a = i / 8, h = hash01(i + 40), x = Math.sin(a * PI / 2) * w * 0.86, z = L * 0.97 - L * 0.72 * a * a;
    parts.push(spike('#7f786c', 0.0048, 0.03 + 0.016 * h + 0.01 * (1 - Math.abs(a)), [x, 0.008, z], [a * 0.35 + (h - 0.5) * 0.3, 1, 0.12 + 0.2 * (1 - Math.abs(a))], 5, '#e4e1d6'));
  }
  c.jaw = merge(parts);
}

// ------------------------------------------------------------------ the joint tree and meshes, on a Ghoul (ghoul.js)
export function buildV2(gh) {
  const C = gh.C, c = partsV2(C), g = C.girth, sw = C.shoulders, D = gh.D = C.dims, VCm = VC();
  gh.eyeAt = c.eyeAt || null;   // (head space: where the eyes are, for the maze's fog-free eye points)
  const root = gh.root = new THREE.Group();
  root.scale.setScalar(C.scale);
  const J = gh.joints = {};
  const joint = (name, parent, pos) => { const o = new THREE.Group(); o.name = name; o.rotation.order = 'YXZ'; o.position.set(pos[0], pos[1], pos[2]); parent.add(o); J[name] = o; return o; };
  const mesh = (geo, mat = VCm, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

  const hips = joint('hips', root, [0, 0.78, 0]);
  hips.add(mesh(c.pelvis));
  const spine = joint('spine', hips, [0, 0.05, 0.02]);
  spine.add(mesh(c.torso));
  const neck = joint('neck', spine, NECK_AT);
  neck.add(mesh(c.neck));
  const head = joint('head', neck, c.NECK_END);
  head.scale.setScalar(C.headScale);
  head.add(mesh(c.head));
  if (c.eyes) { const e = mesh(c.eyes, toon(C.eye, { emissive: C.eye, emissiveIntensity: C.eyeGlow }), false); soft(e); head.add(e); }
  { const gl = mesh(c.glints, glowVC(), false); soft(gl); head.add(gl); }
  const jaw = joint('jaw', head, JAW_AT);
  jaw.add(mesh(c.jaw));
  gh.hands = []; gh.spreads = []; gh.feet = []; gh.toes = [];
  for (const [i, s] of [[0, -1], [1, 1]]) {
    const side = s < 0 ? 'L' : 'R';
    const sh = joint('shoulder' + side, spine, [s * 0.25 * g * sw, 0.57, 0.03]);
    sh.add(mesh(c.upperArm));
    const el = joint('elbow' + side, sh, [0, -D.upper, 0]);
    el.add(mesh(c.foreArm));
    const wr = joint('wrist' + side, el, [0, -D.fore, 0]);
    const hand = mesh(c.hand[i]); wr.add(hand); gh.hands.push(hand);
    const spread = mesh(c.spread[i]); spread.visible = false; wr.add(spread); gh.spreads.push(spread);
    const hp = joint('hip' + side, hips, [s * 0.13 * g, -0.02, 0]);
    hp.add(mesh(c.thigh));
    const kn = joint('knee' + side, hp, [0, -D.thigh, 0]);
    kn.add(mesh(c.shin));
    const an = joint('ankle' + side, kn, [0, -D.shin, 0]);
    an.add(mesh(c.meta));
    const toe = joint('toe' + side, an, [0, -D.meta, 0]);
    const foot = mesh(c.foot[i]); toe.add(foot); gh.feet.push(foot); gh.toes.push(toe);
  }
}

// ------------------------------------------------------------------ the poses (joint angles, radians; YXZ)
export function poseV2(name, C) {
  const arm = (sx, sy, sz, ex, wx = 0) => ({ shoulder: [sx, sy, sz], elbow: [ex, 0, 0], wrist: [wx, 0, 0] });
  const leg = (hx, kx, ax, hz = 0) => ({ hip: [hx, 0, hz], knee: [kx, 0, 0], ankle: [ax, 0, 0], toe: [0, 0, 0] });
  const sp = C.splay, armK = C.armK, h = C.hunch;
  let P;
  const prowl = () => ({
    hips: [0, 0, 0], spine: [1.22 + (C.allFours ? 0.08 : 0), 0, 0], neck: [C.wrongElbows ? 0.15 : -0.85, 0, 0], head: [C.wrongElbows ? -1.05 : -0.75, 0, 0], jaw: [0.25, 0, 0],
    L: { ...arm(-1.35, 0.1, 0.35, -0.55, -0.55), ...leg(-1.25, 1.95, -0.95, -sp) },
    R: { ...arm(-0.75, -0.1, -0.3, -0.5, -0.6), ...leg(-1.0, 1.7, -0.95, sp) },
    hands: { L: { at: 'ground', reach: 0.5 * armK, side: 0.02 + 0.12 * sp }, R: { at: 'ground', reach: 0.12 * armK, side: 0.06 + 0.12 * sp } },
    ground: 'feet',
  });
  if (name === 'search' || name === 'glimpse') {
    const g = name === 'glimpse';
    if (C.allFours) {
      // the crawler searches on all fours: one hand lifted to the muzzle, the head up and round (B3: low, under the shoulders)
      P = prowl();
      P.neck = C.wrongElbows ? [0.05, g ? 0 : 0.3, 0] : [-0.95, g ? 0 : 0.35, 0];
      P.head = C.wrongElbows ? [-0.95, g ? 0 : 0.75, g ? 0 : 0.15] : [-0.55, g ? 0 : 0.8, g ? 0 : 0.1];
      if (C.wrongElbows) P.hands = { L: { at: 'ground', reach: 0.45 * armK, side: 0.15 }, R: { at: 'ground', reach: 0.3 * armK, side: 0.2 } }; // (B3 searches with both hands down, the head low and round)
      else {
        P.R = { ...P.R, ...arm(-2.5, -0.3, -0.4, -1.6, -0.6) };
        P.hands = { L: { at: 'ground', reach: 0.3 * armK, side: 0.05 + 0.12 * sp }, R: { at: 'muzzle' } };
      }
    } else {
      // upright-ish and hunched, head turned, one hand raised to the muzzle, sniffing
      P = {
        hips: [0, 0, 0], spine: [0.62 + h, 0, 0], neck: [-0.4 - h * 0.6, g ? 0 : 0.3, 0], head: [-0.55 - h * 0.5, g ? 0 : 0.7, g ? 0 : 0.1], jaw: [0.12, 0, 0],
        L: { ...arm(0.25 - h, 0, 0.3, -0.2, 0.25), ...leg(-0.62, 1.15, -0.9) },
        R: { ...arm(-1.45, 0.35, -0.55, -2.25, -0.35), ...leg(-0.5, 1.05, -0.9) },
        hands: { R: { at: 'muzzle' } },
        ground: 'feet',
      };
    }
    if (g) P.jaw = [0.3, 0, 0];
  } else if (name === 'prowl') {
    P = prowl();
  } else {
    // the leap: airborne, arms out and forward, the hands spread, the mouth open (B3's jaw unhinged), the legs trailing
    P = {
      hips: [0.45, 0, 0], spine: [0.7, 0, 0], neck: [-0.45, 0, 0], head: [-0.55, 0, 0], jaw: [C.leapJaw, 0, 0],
      L: { ...arm(-2.15, 0.15, 0.4, -0.3, -0.5), ...leg(0.55, 0.9, -0.3, -sp * 0.5) },
      R: { ...arm(-2.15, -0.15, -0.4, -0.3, -0.5), ...leg(0.2, 1.25, -0.4, sp * 0.5) },
      ground: 0.6, spread: true,
    };
    P.L.toe = [0.9, 0, 0]; P.R.toe = [0.9, 0, 0];
    P.L.shoulder = [-1.95, 0.15, 0.6]; P.R.shoulder = [-1.95, -0.15, -0.6]; // (arms wide: the face shows between them)
    if (C.wrongElbows) { P.L.elbow = [0.35, 0, 0]; P.R.elbow = [0.35, 0, 0]; P.neck = [-0.25, 0, 0]; P.head = [-0.45, 0, 0]; } // (the elbows bent the wrong way)
    if (C.unhinge) P.jawDrop = [0, -0.03, -0.015];
  }
  // the poles the elbows bend toward when a hand is planted: out and back, or (B3) up above the back like a spider's
  P.pole = C.wrongElbows ? [0.75, 1.2, 0.35] : [0.8, 0.5, -0.6];
  return P;
}
