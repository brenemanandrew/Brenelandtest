// Eye styles: real eyes with lids that blink, follow the gaze, squint, widen and droop. 'button' is the printed eye
// (bodies-face.js, any of its EYES shapes). The others are built here into the face's eye groups (F.eyeL / F.eyeR, local +z the
// face's normal at the eye):
//
//   natural  a ball sunk in the face, a lid shell over its top and a lash band on the lid
//   almond   a flatter ball behind an almond opening, upper and lower lid shells meeting in pointed corners. The lids turn about
//            the ball's axis to blink (a rigid turn, so a bone for rigid-merge).
//   painted  flat on the skin like the printed face: a white almond, the iris, lids that slide over it, and a skin "frame" round
//            the almond that hides anything of the iris or lids outside the eye
//   big      almond, bigger and rounder, a bigger iris
//   hooded   modelled on Andrew's own eye: wide and narrow, a heavy upper lid over the top of the iris, the lower lid at its bottom,
//            a dark lash line thickest at the outer corner, the outer corner a little lower than the inner (`tilt`)
//
// Every piece is a plain Mesh on the soft layer (colour, never inked) with the face's vertex-coloured toon material, so rigid-merge
// draws it inside the face's soft mesh with no draw call of its own. The moving groups are its bones. Geometry is made once per
// (style, head shape, side, size, lash) and only recoloured per person. Parts that can never show in front of the skin are left out.
import * as THREE from 'three';
import { faceZ, faceNormal } from './bodies-geo.js';
import { LAYER_SOFT, toon } from './toon.js';

export const EYE_STYLES = ['button', 'natural', 'almond', 'painted', 'big', 'hooded'];   // (append only; 'button' = bodies-face.js's printed eyes)
export const EYE_STYLE_LABELS = { button: 'Button', natural: 'Natural', almond: 'Almond', painted: 'Painted', big: 'Big almond', hooded: 'Hooded' };
// An iris colour when the look leaves it unset (or at the printed eyes' near-black): picked from the look's colours
export const IRIS_COLORS = ['#5a3a22', '#6b4a2a', '#3f6f9e', '#4a7bb5', '#3f7a4a', '#6f7a3a', '#5f6870', '#7a5aa8'];
const INK = '#231a2a';

const D = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// the style's numbers (head units at a 0.368 wide head; angles in degrees). Ball styles: the ball's radius R (sx: wider than tall),
// its centre d behind the skin; the opening's corners at LC across, the upper lid's edge at PU - AU s^2 up, the lower's at -PL + AL s^2
// (s = across / LC). lidN: the lid turn whose face normal the upper lid takes (near shut, so a shut lid shades like the skin round
// it). meet: how much of the opening the lower lid rises to meet a blink (natural's comes up half way, so the upper lid turns half as
// far and never shades off the skin). tilt: degrees the whole eye turns about the face's normal, the outer corner down.
export const STYLE = {
  natural: { kind: 'ball', size: 1.4, R: 0.05, sx: 1.12, d: 0.027, LC: 62, PU: 30, AU: 4, PL: 57, AL: 4, lower: true, meet: 0.45, lidN: 41,
    tU: 0.004, tL: 0.003, band: 4.5, outerBoost: 0.5, lowLine: 1.4, irisR: 0.025, pupilR: 0.011 },
  almond: { kind: 'ball', size: 1.42, R: 0.1, sx: 1.08, d: 0.086, LC: 27, PU: 17, AU: 13, PL: 13, AL: 17, lower: true, lidN: 25,
    tU: 0.0042, tL: 0.003, band: 3.0, outerBoost: 0.6, lowLine: 0.9, irisR: 0.027, pupilR: 0.0115 },
  big: { kind: 'ball', size: 1.62, R: 0.1, sx: 1.0, d: 0.082, LC: 30, PU: 27, AU: 24, PL: 22, AL: 25, lower: true, meet: 0.3, lidN: 28,
    tU: 0.0042, tL: 0.003, band: 3.2, outerBoost: 0.7, lowLine: 0.9, irisR: 0.034, pupilR: 0.015 },   // (the button eye's footprint: about as tall)
  hooded: { kind: 'ball', size: 1.42, R: 0.1, sx: 1.14, d: 0.086, LC: 31, PU: 15, AU: 13, PL: 12, AL: 11, lower: true, meet: 0.3, lidN: 24, tilt: 3,
    tU: 0.0048, tL: 0.003, band: 3.4, outerBoost: 0.9, lowLine: 0.9, irisR: 0.026, pupilR: 0.0115 },  painted: { kind: 'paint', size: 1.48, W: 0.054, Ht: 0.038, Hb: 0.024, pt: 0.78, pb: 0.95, tilt: 0.05, sag: 0.0025, closeAt: 0.2,
    lowSag: 0.003, irisR: 0.025, pupilR: 0.012, irisY: -0.002, lidLine: 0.0042, liner: 0.0032, outerBoost: 0.5, frameOut: 0.014 },
};
// the printed EYES shapes still mean something on a real eye: how open it sits (sleepy: heavier, wide: brighter, happy: a smiling squint)
const SHAPE_REST = { sleepy: [0.3, 0], wide: [-0.15, 0], happy: [0.1, 0.5] };
// Glasses: the eye's half width inside the lens (its rim's inner edge is at 0.0555)
const LENS_HALF = 0.047;
export function eyeHalfWidth(style, size = 1) {
  const P = STYLE[style];
  return P.kind === 'ball' ? P.R * P.sx * Math.sin(P.LC * D) * size : P.W * size;
}

// ------------------------------------------------------------------ colour roles (geometry is shared, colours are per person)
// roles: 0 white, 1 skin, 2 lash, 3 pupil, 4 iris, 5 iris rim, 6 highlight, 7 lower lid's edge, 8 the painted lower lid's line
const R_WHITE = 0, R_SKIN = 1, R_LASH = 2, R_PUPIL = 3, R_IRIS = 4, R_RIM = 5, R_HL = 6, R_EDGE = 7, R_LOWP = 8;
function palette(o, iris) {
  const c = s => new THREE.Color(s), sk = c(o.skin);
  return [c('#fbf6ee'), sk, c('#2a1a1c'), c('#15101a'), c(iris), c(iris).multiplyScalar(0.62), c('#ffffff'), sk.clone().multiplyScalar(0.62), sk.clone().multiplyScalar(0.8)];
}

// a mesh being made: positions, shading normals, the way each face really faces (winding), colour roles (a, b, mix)
class Mesh {
  constructor() { this.p = []; this.n = []; this.o = []; this.r = []; this.i = []; }
  v(p, n, role, o = n) { this.p.push(p.x, p.y, p.z); const l = Math.hypot(n.x, n.y, n.z) || 1; this.n.push(n.x / l, n.y / l, n.z / l); this.o.push(o.x, o.y, o.z); this.r.push(...(Array.isArray(role) ? role : [role, role, 0])); return this.p.length / 3 - 1; }
  grid(rows, cols, fn) {
    const b = this.p.length / 3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const [p, n, role, o] = fn(r, c); this.v(p, n, role, o); }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = b + r * cols + c, e = a + 1, d = a + cols, f = d + 1; this.i.push(a, d, e, e, d, f); }
    return this;
  }
  fan(center, ring) {
    const c0 = this.v(...center), r0 = this.p.length / 3;
    for (const q of ring) this.v(...q);
    for (let k = 0; k < ring.length; k++) this.i.push(c0, r0 + k, r0 + ((k + 1) % ring.length));
    return this;
  }
  // wind each triangle to agree with its vertices' facing; keep(i) -> false drops a vertex's triangles (never seen)
  finish(keep) {
    const P = this.p, N = this.o, I = this.i, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    const out = [];
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
      if (keep && !keep[i0] && !keep[i1] && !keep[i2]) continue;
      a.fromArray(P, i0 * 3); b.fromArray(P, i1 * 3).sub(a); c.fromArray(P, i2 * 3).sub(a);
      n.crossVectors(b, c);
      const s = n.x * (N[i0 * 3] + N[i1 * 3] + N[i2 * 3]) + n.y * (N[i0 * 3 + 1] + N[i1 * 3 + 1] + N[i2 * 3 + 1]) + n.z * (N[i0 * 3 + 2] + N[i1 * 3 + 2] + N[i2 * 3 + 2]);
      if (s < 0) out.push(i0, i2, i1); else out.push(i0, i1, i2);
    }
    // only the vertices still used
    const map = new Int32Array(P.length / 3).fill(-1), pos = [], nrm = [], role = [], idx = [];
    for (const v of out) {
      if (map[v] < 0) { map[v] = pos.length / 3; pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nrm.push(this.n[v * 3], this.n[v * 3 + 1], this.n[v * 3 + 2]); role.push(this.r[v * 3], this.r[v * 3 + 1], this.r[v * 3 + 2]); }
      idx.push(map[v]);
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), role: new Float32Array(role), idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
  }
}

// ------------------------------------------------------------------ the face under an eye (the stick frame: +z the face's normal)
function faceFrame(sh, stick) {
  stick.updateMatrix();
  const M = stick.matrix.clone(), qi = stick.quaternion.clone().invert(), P = new THREE.Vector3();
  const nz = V3(0, 0, 1).applyQuaternion(stick.quaternion).z;
  const zAt = (x, y) => {
    let s = 0;
    for (let k = 0; k < 6; k++) { P.set(x, y, s).applyMatrix4(M); const zf = faceZ(sh, P.x, P.y); if (zf === 0) return null; s += (zf - P.z) / nz; }
    return s;
  };
  const normalAt = (x, y) => { const s = zAt(x, y) ?? 0; P.set(x, y, s).applyMatrix4(M); return faceNormal(sh, P.x, P.y, faceZ(sh, P.x, P.y), new THREE.Vector3()).applyQuaternion(qi); };
  const above = (x, y, z) => { const s = zAt(x, y); return s === null ? -1 : z - s; };
  const z0 = zAt(0, 0), h = 0.03;
  const Ry = (h * h) / Math.max(1e-4, -(((zAt(0, h) + zAt(0, -h)) / 2) - z0) * 2);
  const Rx = (h * h) / Math.max(1e-4, -(((zAt(h, 0) + zAt(-h, 0)) / 2) - z0) * 2);
  // a coarse grid of the face's height (1 cm, +-0.18 round the eye) for the "ever seen" test: thousands of points, a few lookups each
  const GN = 37, GH = 0.18, GS = (2 * GH) / (GN - 1);
  let grid = null;
  const aboveFast = (x, y, z) => {
    if (!grid) { grid = new Float32Array(GN * GN); for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const v = zAt(-GH + i * GS, -GH + j * GS); grid[j * GN + i] = v === null ? 9 : v; } }
    const fx = clamp((x + GH) / GS, 0, GN - 1.001), fy = clamp((y + GH) / GS, 0, GN - 1.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, w = fy - j;
    const a = grid[j * GN + i], b = grid[j * GN + i + 1], c = grid[(j + 1) * GN + i], d = grid[(j + 1) * GN + i + 1];
    if (a > 8 || b > 8 || c > 8 || d > 8) return -1;
    return z - ((a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w);
  };
  const zFast = (x, y) => { const h = aboveFast(x, y, 0); return h === -1 ? null : -h; };
  return { zAt, normalAt, above, aboveFast, zFast, Ry: clamp(Ry, 0.2, 3), Rx: clamp(Rx, 0.2, 3) };
}
// one face frame per head shape and side (the eye group's place on the face depends on nothing else)
const FRAMES = new Map();
const frameOf = (sh, stick, key) => { let f = FRAMES.get(key); if (!f) FRAMES.set(key, f = faceFrame(sh, stick)); return f; };

// lid columns (angles across): 14 steps over the opening (corner to corner, one exactly on each corner), 4 more each side to +-LM
const lidCols = (LC, LM) => { const c = []; for (let k = 4; k >= 1; k--) c.push(-LC - (LM - LC) * Math.pow(k / 4, 1.3)); for (let k = 0; k <= 14; k++) c.push(-LC + 2 * LC * k / 14); for (let k = 1; k <= 4; k++) c.push(LC + (LM - LC) * Math.pow(k / 4, 1.3)); return c; };
const rotX = (v, a) => V3(v.x, v.y * Math.cos(a) - v.z * Math.sin(a), v.y * Math.sin(a) + v.z * Math.cos(a));

// how far the lids and the gaze can turn (degrees; the same numbers poseEye uses), for the template's "ever seen" test
function ballRanges(P, S) {
  const kd = 0.01 / (P.R * S) / D, open = P.PU + P.PL;
  return { kd, open, uMin: -(0.3 * open + 0.9 * kd) - 2, uMax: P.PU + P.PL + 1.5 + 0.1 * open + 0.9 * kd + 2, lMin: -((0.45 + (P.meet ?? 0.07)) * open + 0.5 * kd) - 2, lMax: 0.5 * kd + 2 };
}

// ================================================================== templates
function ballTemplate(sh, stick, side, P, size, flick, fkey) {
  const k = sh.rx / 0.368, S = k * size;
  const R = P.R * S, sx = P.sx, d = P.d * S;
  const ff = frameOf(sh, stick, fkey);
  const LC = P.LC * D, PU = P.PU * D, AU = P.AU * D, PL = P.PL * D, AL = P.AL * D;
  const phiU = l => PU - AU * (l / LC) ** 2, phiL = l => -PL + AL * (l / LC) ** 2;
  const sp = (l, f, r) => V3(r * Math.sin(l), r * Math.cos(l) * Math.sin(f), r * Math.cos(l) * Math.cos(f));
  const un = (l, f) => V3(Math.sin(l), Math.cos(l) * Math.sin(f), Math.cos(l) * Math.cos(f));
  const toStick = p => V3(p.x * sx, p.y, p.z - d);
  const shutR = (P.PU + P.PL) * D, visTop = Math.acos(clamp(d / R, 0, 1));
  const faceN = q => { const n = ff.zAt(q.x, q.y) === null ? V3(0, 0, 1) : ff.normalAt(q.x, q.y); n.x *= sx; return n.normalize(); };
  const nTurn = P.lidN * D;
  const nLidU = p => rotX(faceN(toStick(rotX(p, nTurn))), -nTurn);
  const nLidL = p => faceN(toStick(p));
  const RG = ballRanges(P, S);
  // "ever in front of the skin": a vertex at local p under the turns `turns` (radians about x), 6 mm of slack (the drawn skin lies
  // a few mm inside the true surface)
  const seen = (m, turns) => {
    const n = m.p.length / 3, keep = new Uint8Array(n), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) for (const a of turns) {
      v.set(m.p[i * 3], m.p[i * 3 + 1], m.p[i * 3 + 2]);
      const q = toStick(rotX(v, a));
      if (ff.aboveFast(q.x, q.y, q.z) > -0.006) { keep[i] = 1; break; }
    }
    return keep;
  };
  const range = (a0, a1) => { const t = []; for (let a = a0; a <= a1 + 1e-6; a += 4) t.push(a * D); t.push(a1 * D); return t; };
  const parts = [];
  // the ball (only its front: the rest is inside the head)
  { const m = new Mesh(), NR = 7, NC = 20;
    m.grid(NR + 1, NC + 1, (r, c) => { const th = Math.max(0.02, (r / NR) * 105 * D), ph = (c / NC) * Math.PI * 2; const n = V3(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)); return [n.clone().multiplyScalar(R * 0.995), n, R_WHITE]; });
    parts.push({ g: 'E', name: 'eye-white', ...m.finish(seen(m, [0])) }); }
  // the iris (pupil, iris, a darker rim: caps of the ball round +z) turning with the gaze, the highlight turning a little
  { const ai = Math.asin(clamp(P.irisR * S / R, 0, 0.95)), ap = Math.asin(clamp(P.pupilR * S / R, 0, 0.9));
    const m = new Mesh(), NS = 20;
    const cap = (a0, a1, r, role, rings) => m.grid(rings + 1, NS + 1, (ri, si) => { const a = a0 + (a1 - a0) * (ri / rings), ph = (si / NS) * Math.PI * 2; const n = V3(Math.sin(a) * Math.cos(ph), Math.sin(a) * Math.sin(ph), Math.cos(a)); return [n.clone().multiplyScalar(r), n, role]; });
    cap(0.0001, ap, R * 1.0012, R_PUPIL, 2); cap(ap, ai * 0.78, R * 1.0008, R_IRIS, 2); cap(ai * 0.78, ai, R * 1.0008, R_RIM, 1);
    parts.push({ g: 'iris', name: 'eye-iris', ...m.finish() });
    const hm = new Mesh(), hr = P.irisR * S * 0.26, cen = [0.36 * ai, 0.42 * ai], ring = [];
    for (let q = 0; q < 14; q++) { const t = q / 14 * Math.PI * 2, l = cen[0] + Math.cos(t) * hr / R, f = cen[1] + Math.sin(t) * hr / R * 1.1; ring.push([sp(l, f, R * 1.0018), un(l, f), R_HL]); }
    hm.fan([un(cen[0], cen[1]).multiplyScalar(R * 1.0018), un(cen[0], cen[1]), R_HL], ring);
    parts.push({ g: 'hl', name: 'eye-iris', ...hm.finish() }); }
  // the upper lid: the lip (the edge's thickness), the lash band on the shell, then skin over the top of the ball
  { const tU = P.tU * S, Rl = R + tU, COLS = lidCols(LC, 89 * D), NC = COLS.length, lam = c => COLS[c];
    const band = l => { const s = l / LC; if (Math.abs(s) >= 1) return 0; const outer = Math.max(0, side * s); return P.band * D * Math.pow(1 - s * s, 0.55) * (1 + P.outerBoost * outer); };
    const top = 178 * D, m = new Mesh();
    m.grid(2, NC, (r, c) => { const l = lam(c), f = phiU(l), rr = r === 0 ? R * 1.002 : Rl;
      const n = un(l, f).multiplyScalar(0.6).add(V3(0, -Math.cos(f), Math.sin(f)).multiplyScalar(0.8));
      return [sp(l, f, rr), n, [R_SKIN, R_LASH, clamp(band(l) / (P.band * D * 0.25), 0, 1)]]; });
    m.grid(2, NC, (r, c) => { const l = lam(c), f = phiU(l) + (r ? band(l) : 0); const p = sp(l, Math.min(f, top), Rl); return [p, nLidU(p), R_LASH, un(l, f)]; });
    // rows 8 degrees apart over all a turning lid can show (a chord never dips under the ball), then on round inside the head
    const RW = []; for (let q = 0; q * 8 * D < Math.max(100 * D, shutR + visTop - PU + 40 * D); q++) RW.push(q * 8 * D); RW.push(200 * D);
    m.grid(RW.length, NC, (r, c) => { const l = lam(c), f0 = phiU(l) + band(l), f = Math.min(top, f0 + RW[r]); const p = sp(l, f, Rl); return [p, nLidU(p), R_SKIN, un(l, f)]; });
    if (flick) { // the 'lash' look: a short tapering wing off the outer corner, lying on the shell
      const l0 = side * LC * 0.82, NF = 6;
      m.grid(2, NF, (r, c) => { const t = c / (NF - 1), l = l0 + side * t * 13 * D, f = phiU(l0) + t * 9 * D + (r ? (1 - t) * band(l0) * 0.9 : 0); const p = sp(l, f, Rl * 1.0008); return [p, nLidU(p), R_LASH, un(l, f)]; });
    }
    parts.push({ g: 'lidU', name: 'eye-lid', ...m.finish(seen(m, range(RG.uMin, RG.uMax))) }); }
  // the lower lid: a thinner shell, its edge a soft darker line, skin down under the ball
  if (P.lower) {
    const tL = P.tL * S, Rl = R + tL, COLS = lidCols(LC, 89 * D), NC = COLS.length, lam = c => COLS[c];
    const bot = -160 * D, line = l => { const s = l / LC; return Math.abs(s) >= 1 ? 0 : P.lowLine * D * Math.pow(1 - s * s, 0.7); };
    const m = new Mesh();
    m.grid(2, NC, (r, c) => { const l = lam(c), f = phiL(l), rr = r === 0 ? R * 1.002 : Rl; const n = un(l, f).multiplyScalar(0.6).add(V3(0, Math.cos(f), -Math.sin(f)).multiplyScalar(0.8)); return [sp(l, f, rr), n, [R_SKIN, R_EDGE, 0.65 * clamp(line(l) / (P.lowLine * D * 0.3), 0, 1)]]; });
    m.grid(2, NC, (r, c) => { const l = lam(c), f = phiL(l) - (r ? line(l) : 0); const p = sp(l, f, Rl); return [p, nLidL(p), R_EDGE, un(l, f)]; });
    const RW = []; for (let q = 0; q * 8 * D < Math.max(100 * D, -RG.lMin * D + 70 * D); q++) RW.push(q * 8 * D); RW.push(200 * D); // (8 degree rows over all a rising lower lid can show)
    m.grid(RW.length, NC, (r, c) => { const l = lam(c), f0 = phiL(l) - line(l), f = Math.max(bot, f0 - RW[r]); const p = sp(l, f, Rl); return [p, nLidL(p), R_SKIN, un(l, f)]; });
    parts.push({ g: 'lidL', name: 'eye-lid', ...m.finish(seen(m, range(RG.lMin, RG.lMax))) });
  }
  return { kind: 'ball', S, d, sx, parts, P, kd: RG.kd, open: RG.open };
}

function paintTemplate(sh, stick, side, P, size, flick, fkey) {
  const k = sh.rx / 0.368, S = k * size, ff = frameOf(sh, stick, fkey);
  const W = P.W * S, Ht = P.Ht * S, Hb = P.Hb * S, tilt = P.tilt * side;
  const top = x => { const u = clamp(Math.abs(x) / W, 0, 1); return Ht * Math.pow(1 - u * u, P.pt) + tilt * x; };
  const bot = x => { const u = clamp(Math.abs(x) / W, 0, 1); return -Hb * Math.pow(1 - u * u, P.pb) + tilt * x * 0.6; };
  const L = { white: 0.0004, iris: 0.0008, pupil: 0.0012, hl: 0.0016, lidL: 0.0020, lidU: 0.0024, frame: 0.0042, liner: 0.0047 }; // (the frame well clear of the lids: its big flat triangles sag between their corners)
  // painted on a sphere fitted to the face at the eye (centre Cz, radius Rs), lifted just clear of the skin over the eye area, so the
  // moving pieces turn about its centre and stay on it; the frame's rim slopes onto the skin
  const z0 = ff.zAt(0, 0) ?? 0, Rs = clamp((ff.Rx + ff.Ry) / 2, 0.25, 1.2);
  const sph = (x, y) => Math.sqrt(Math.max(0, Rs * Rs - x * x - y * y)) - Rs;
  let off = 0.0006; // (the grid's bilinear height can sit a hair under the true surface)
  for (let x = -W - 0.02 * S; x <= W + 0.02 * S; x += 0.004) for (let y = -Hb - 0.03 * S; y <= Ht + 0.08 * S; y += 0.004) { const z = ff.zFast(x, y); if (z !== null) off = Math.max(off, z - (z0 + sph(x, y))); }
  const Cz = z0 + off + 0.0002 - Rs;
  const at = (x, y, lift) => V3(x, y, Cz + Rs + sph(x, y) + lift);
  const onSkin = (x, y, lift) => V3(x, y, (ff.zAt(x, y) ?? 0) + lift);
  const nAt = (x, y) => ff.normalAt(x, y);
  const rel = p => p.sub(V3(0, 0, Cz));     // (pieces on the pivot at the sphere's centre)
  const NX = 17, parts = [];
  { const m = new Mesh(), NY = 4;
    m.grid(NY + 1, NX, (r, c) => { const x = -W + 2 * W * c / (NX - 1), y = bot(x) + (top(x) - bot(x)) * r / NY; return [at(x, y, L.white), nAt(x, y), R_WHITE]; });
    parts.push({ g: 'stick', name: 'eye-white', ...m.finish() }); }
  const iy = P.irisY * S;
  { const m = new Mesh(), NS = 20, ri = P.irisR * S, rp = P.pupilR * S;
    const ring = (r0, r1, lift, role) => m.grid(2, NS + 1, (r, c) => { const t = c / NS * Math.PI * 2, rr = r ? r1 : r0; const x = Math.cos(t) * rr, y = iy + Math.sin(t) * rr * 1.06; return [rel(at(x, y, lift)), nAt(x, y), role]; });
    ring(0.0001, rp, L.pupil, R_PUPIL); ring(rp, ri * 0.8, L.iris, R_IRIS); ring(ri * 0.8, ri, L.iris, R_RIM);
    parts.push({ g: 'iris', name: 'eye-iris', ...m.finish() });
    const hm = new Mesh(), hr = ri * 0.27, hx = 0.36 * ri, hy = iy + 0.42 * ri, rg = [];
    for (let q = 0; q < 14; q++) { const t = q / 14 * Math.PI * 2, x = hx + Math.cos(t) * hr, y = hy + Math.sin(t) * hr * 1.1; rg.push([rel(at(x, y, L.hl)), nAt(x, y), R_HL]); }
    hm.fan([rel(at(hx, hy, L.hl)), nAt(hx, hy), R_HL], rg);
    parts.push({ g: 'hl', name: 'eye-iris', ...hm.finish() }); }
  const yU0 = Ht + 0.0025 * S + Math.abs(tilt) * W, yClose = -P.closeAt * Hb, travel = yU0 - yClose + 0.002 * S;
  { const m = new Mesh(), XW = W + 0.006 * S, bw = P.lidLine * S, edge = x => yU0 - P.sag * S * (1 - (x / XW) ** 2) + tilt * x;
    m.grid(2, NX, (r, c) => { const x = -XW + 2 * XW * c / (NX - 1), y = edge(x) + (r ? bw : 0); return [rel(at(x, y, L.lidU)), nAt(x, y), R_LASH]; });
    const NY = 4, hgt = travel + 0.004 * S;
    m.grid(NY + 1, NX, (r, c) => { const x = -XW + 2 * XW * c / (NX - 1), y = edge(x) + bw + hgt * (r / NY); return [rel(at(x, y, L.lidU)), nAt(x, y), R_SKIN]; });
    parts.push({ g: 'lidU', name: 'eye-lid', ...m.finish() }); }
  const yL0 = -Hb - 0.0025 * S - Math.abs(tilt) * W * 0.6;
  { const m = new Mesh(), XW = W + 0.006 * S, NY = 3, hgt = (yClose - yL0) + 0.012 * S, low = x => yL0 + P.lowSag * S * (1 - (x / XW) ** 2) + tilt * x * 0.6;
    m.grid(2, NX, (r, c) => { const x = -XW + 2 * XW * c / (NX - 1), y = low(x) - (r ? 0.0016 * S : 0); return [rel(at(x, y, L.lidL)), nAt(x, y), R_LOWP]; });
    m.grid(NY + 1, NX, (r, c) => { const x = -XW + 2 * XW * c / (NX - 1), y = low(x) - 0.0016 * S - hgt * r / NY; return [rel(at(x, y, L.lidL)), nAt(x, y), R_SKIN]; });
    parts.push({ g: 'lidL', name: 'eye-lid', ...m.finish() }); }
  // the frame: skin with an almond hole, flat over the moving parts, its rim sloping into the skin (no ledge); the lash line on top
  { const m = new Mesh(), NA = 40, rings = [0, 0.12, 0.3, 0.55, 1.0, 1.25], ow = W + P.frameOut * S, oh = Math.max(yU0 + P.lidLine * S + travel + 0.004 * S + Math.abs(tilt) * ow, Hb + 0.03 * S) + 0.006 * S; // (over the open lid's top edge too)
    m.grid(rings.length, NA + 1, (r, c) => {
      const t = c / NA * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const xa = W * ct, ya = st >= 0 ? top(xa) : bot(xa);
      const se = v => Math.sign(v) * Math.sqrt(Math.abs(v)); // (a squarish outline: the lids' corners never poke out past the flat part)
      const xo = ow * se(ct), yo = st >= 0 ? oh * se(st) + tilt * xo : (Hb + 0.03 * S) * se(st) + tilt * xo * 0.6;
      const u = rings[r], f = Math.min(1, u);
      let x = xa + (xo - xa) * f, y = ya + (yo - ya) * f;
      if (u > 1) { x = xo * (1 + (u - 1) * 0.35); y = yo * (1 + (u - 1) * 0.35); }
      return [u > 1 ? onSkin(x, y, -0.003) : at(x, y, L.frame), nAt(x, y), R_SKIN];
    });
    const lw = P.liner * S;
    m.grid(2, NX, (r, c) => { const x = -W + 2 * W * c / (NX - 1), u = Math.abs(x) / W, outer = side * x > 0 ? 1 : 0; const w = lw * Math.pow(Math.max(0, 1 - u * u), 0.45) * (0.55 + 0.45 * (outer ? 1 : 1 - u)) * (1 + P.outerBoost * outer * u); const y = top(x) - 0.0004 * S + (r ? w : 0); return [at(x, y, L.liner), nAt(x, y), R_LASH]; });
    if (flick) { const x0 = side * W * 0.86, NF = 6; m.grid(2, NF, (r, c) => { const t = c / (NF - 1), x = x0 + side * t * 0.014 * S, y = top(x0) + t * 0.008 * S + (r ? (1 - t) * lw * 0.9 : 0); return [at(x, y, L.liner), nAt(x, y), R_LASH]; }); }
    parts.push({ g: 'stick', name: 'eye-frame', ...m.finish() }); }
  return { kind: 'paint', S, Cz, Rs, travel, yU0, yL0, yClose, Ht, Hb, parts, P };
}

const TEMPLATES = new Map();
export const eyeTemplateStats = () => ({ templates: TEMPLATES.size });

// ================================================================== build into a face (bodies-face.js buildFace calls this)
// F: the face (sh, eyeL, eyeR), o: the resolved look. Returns the rig stepFace poses, or null for button eyes.
export function buildStyledEyes(F, o, shapeId) {
  const style = o.eyeStyle;
  if (!style || style === 'button' || !STYLE[style]) return null;
  const P = STYLE[style];
  let size = P.size;
  if (o.glasses && o.glasses !== 'none') size *= Math.min(1, LENS_HALF / eyeHalfWidth(style, P.size));
  const flick = o.eyes === 'lash';
  const iris = o.eyeColor && o.eyeColor.toLowerCase() !== INK ? o.eyeColor : IRIS_COLORS[irisPick(o)];
  const pal = palette(o, iris);
  const mat = toon('#ffffff', { vertexColors: true });   // (bodies-geo.js Part's own: the face's soft mesh merges with it)
  const rig = { style, kind: P.kind, eyes: [] };
  for (const side of [1, -1]) {
    const stick = side > 0 ? F.eyeL : F.eyeR;
    stick.clear(); stick.scale.set(1, 1, 1);
    const key = [style, shapeId, side, size.toFixed(4), flick ? 1 : 0].join('|');
    let T = TEMPLATES.get(key);
    if (!T) { const fk = shapeId + '|' + side; T = P.kind === 'ball' ? ballTemplate(F.sh, stick, side, P, size, flick, fk) : paintTemplate(F.sh, stick, side, P, size, flick, fk); TEMPLATES.set(key, T); }
    const e = { side, T, stick };
    if (T.kind === 'ball') {
      const E = new THREE.Group(); E.position.set(0, 0, -T.d); E.scale.set(T.sx, 1, 1); stick.add(E);
      if (P.tilt) E.rotation.z = -side * P.tilt * D;   // (the outer corner down: +x is the person's left, the left eye's outer side)
      e.groups = { E, iris: new THREE.Group(), hl: new THREE.Group(), lidU: new THREE.Group(), lidL: new THREE.Group() };
      for (const k of ['iris', 'hl', 'lidU', 'lidL']) { e.groups[k].rotation.order = 'YXZ'; E.add(e.groups[k]); }
    } else {
      const pv = () => { const g = new THREE.Group(); g.position.set(0, 0, T.Cz); g.rotation.order = 'YXZ'; stick.add(g); return g; };
      e.groups = { stick, iris: pv(), hl: pv(), lidU: pv(), lidL: pv() };
    }
    for (const part of T.parts) e.groups[part.g].add(meshOf(part, pal, mat));
    rig.eyes.push(e);
  }
  // the printed shapes' rest: sleepy sits heavier, wide brighter, happy smiles with the lower lid
  const [u0, l0] = SHAPE_REST[o.eyes] || [0, 0];
  rig.restU = u0; rig.restL = l0;
  return rig;
}
function irisPick(o) {
  let h = 2166136261; const s = (o.skin || '') + '|' + (o.hair || '') + '|' + (o.shirt || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % IRIS_COLORS.length;
}
function meshOf(part, pal, mat) {
  const g = new THREE.BufferGeometry(), n = part.pos.length / 3, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = pal[part.role[i * 3]], b = pal[part.role[i * 3 + 1]], t = part.role[i * 3 + 2];
    col[i * 3] = a.r + (b.r - a.r) * t; col[i * 3 + 1] = a.g + (b.g - a.g) * t; col[i * 3 + 2] = a.b + (b.b - a.b) * t;
  }
  g.setAttribute('position', new THREE.BufferAttribute(part.pos.slice(), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.nrm.slice(), 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(part.idx.slice(), 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = part.name; m.layers.set(LAYER_SOFT); m.castShadow = false; m.receiveShadow = false;
  return m;
}

// ================================================================== X eyes (taken by the ghoul, cartoon style)
// Two little crossed bars over each eye in the face's ink colour, for every style. The eye's own pieces are hidden and the X sits on
// the skin in front, in a group of its own beside the eye's so a blink or a lid's turn never bends it.
// setXEyes(human, true | false), xEyesOn(human).
let _xGeo = null, _xMat = null;
export function setXEyes(human, on) {
  const F = human?.face;
  if (!F || !F.eyeL || !F.eyeR) return false;
  if (!F.xeyes) {
    if (!on) return false;
    if (!_xGeo) {
      // one bar, a rounded-ish box, crossed with its twin at +-45 degrees (built once, shared)
      const a = new THREE.BoxGeometry(0.085, 0.017, 0.012), b = a.clone();
      a.rotateZ(Math.PI / 4); b.rotateZ(-Math.PI / 4);
      const pos = [...a.attributes.position.array, ...b.attributes.position.array], nrm = [...a.attributes.normal.array, ...b.attributes.normal.array];
      const n0 = a.attributes.position.count, idx = [...a.index.array, ...[...b.index.array].map(i => i + n0)];
      _xGeo = new THREE.BufferGeometry();
      _xGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); _xGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); _xGeo.setIndex(idx);
      _xGeo.computeBoundingSphere();
      _xMat = new THREE.MeshBasicMaterial({ color: INK, name: 'x-eyes' });
    }
    F.xeyes = [F.eyeL, F.eyeR].map(stick => {
      const g = new THREE.Group(); g.name = 'x-eye';
      const m = new THREE.Mesh(_xGeo, _xMat); m.layers.set(LAYER_SOFT); m.castShadow = false; m.userData.shared = true; m.position.z = 0.016;
      g.add(m); stick.parent.add(g);
      return g;
    });
  }
  for (let i = 0; i < 2; i++) {
    const stick = i ? F.eyeR : F.eyeL, g = F.xeyes[i];
    g.position.copy(stick.position); g.quaternion.copy(stick.quaternion);
    g.visible = !!on;
    for (const c of stick.children) c.visible = !on;
  }
  F.xOn = !!on;
  return true;
}
export const xEyesOn = human => !!human?.face?.xOn;

// ================================================================== pose (every frame; no allocation)
// st: lidU (0 open .. 1 shut, < 0 wider), lidL (0 .. 1 the lower lid up: a happy squint), gx, gy (-1..1 the gaze: +x the person's left, +y up)
export function poseStyledEyes(rig, st) {
  const lidU = st.lidU + rig.restU * (1 - Math.max(0, st.lidU)) * (st.lidU < 0 ? 0 : 1), lidL = Math.min(1, st.lidL + rig.restL);
  for (let i = 0; i < rig.eyes.length; i++) {
    const e = rig.eyes[i], T = e.T, G = e.groups, gx = st.gx, gy = st.gy;
    if (T.kind === 'ball') {
      const P = T.P, kd = T.kd, open = T.open;
      G.iris.rotation.set(-gy * 1.25 * kd * D, gx * 1.9 * kd * D, 0);
      G.hl.rotation.set(-gy * 0.5 * kd * D, gx * 0.7 * kd * D, 0);
      const lowUp = lidL * 0.45 * open + Math.max(0, lidU) * (P.meet ?? 0.07) * open + gy * 0.5 * kd * (1 - Math.max(0, lidU)); // (the lower lid rides the gaze too, not when shut)
      const shut = (P.PU + (P.lower ? P.PL - lowUp : P.PL)) + 1.5;
      let du = lidU >= 0 ? lidU * shut : lidU * 0.3 * open;
      du += -gy * 0.9 * kd * (1 - Math.max(0, lidU)) + lidL * 0.1 * open;
      G.lidU.rotation.x = du * D;
      G.lidL.rotation.x = -lowUp * D;
    } else {
      const R = T.Rs;
      G.iris.rotation.set(-gy * 0.0095 * T.S / R, gx * 0.02 * T.S / R, 0);
      G.hl.rotation.set(-gy * 0.004 * T.S / R, gx * 0.006 * T.S / R, 0);
      const down = Math.min(T.travel, Math.max(0, lidU) * T.travel - Math.min(0, gy) * 0.007 * T.S * (1 - Math.max(0, lidU)));
      G.lidU.rotation.x = down / R;
      const meet = clamp((lidU - 0.55) / 0.4, 0, 1) * (T.yClose - T.yL0);
      G.lidL.rotation.x = -Math.max(lidL * 0.85 * T.Hb, meet) / R;
      const wide = Math.max(0, -lidU);
      e.stick.scale.set(1 + wide * 0.1, 1 + wide * 0.16, 1);
    }
  }
}
