// The cloth rig for skirts, dresses and gowns (human.js): the skirt lathe and its hem band are bent every frame, vertex by vertex.
// The skirt is 24 strips (the lathe's columns) hinged at the waist, each swinging out or in by its own angle so it keeps its length:
// pushed out at the front, the hem rises over the knee instead of stretching. The angles come from a pendulum hanging from the
// waist, a flare that opens with speed, and the legs, which are a hard limit with a kick of their own so the cloth billows off a
// knee. A twist lag turns the hem a beat behind the hips. Every input is smooth in space and time. No allocations per frame.
import * as THREE from 'three';
import { clamp, lerp, smooth, TAU } from './bodies-geo.js';
import { SKIRT_TOP, SKIRT_SEG } from './bodies-outfit.js';

const K = SKIRT_SEG;            // strips round the skirt, one per lathe column
const KER = 0.95;               // a leg's push spreads this far round the skirt (radians either side), cosine shaped
const MARGIN = 0.03;            // metres of cloth kept clear of a leg (the facets between strips cut in a little)
const D_MAX = 1.75, D_MIN = -0.3; // how far a strip may swing out / in (radians): past level, over a knee raised high
const LEG_N = 12, FOOT = 9;     // points per leg (3 thigh, 6 shin, 3 shoe); the shoe's start at FOOT
const V_MIN = 0.06;             // the thigh's root never pushes the fitted top (it is inside the pelvis); knees always count

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4();
const HAND_R = 0.075, HAND_KER = 0.6; // a hand's radius, and how far round the skirt it holds the cloth in
const wrapA = a => a - TAU * Math.round(a / TAU);
const THIGH_T = [0.4, 0.6, 0.8], SHIN_T = [0, 0.2, 0.4, 0.6, 0.8, 1]; // where along each bone the leg points sit

export class SkirtRig {
  constructor(sk, D) {
    this.sk = sk; this.D = D;
    const len = this.len = sk.len; this.rx = sk.rx; this.rz = sk.rz;
    // ---- the cloth: a lathe grid, K + 1 columns (the last repeats the first) of P points from the waist (row 0) down
    // to the hem (row P - 1): the skirt profiles are listed top first
    const cg = sk.cloth.geometry, pos = cg.attributes.position, c0 = pos.array;
    const P = this.P = pos.count / (K + 1);
    if (!Number.isInteger(P)) throw new Error('skirt lathe is not a ' + (K + 1) + '-column grid');
    this.cg = cg;
    // the profiles run top to bottom, so the lathe's faces point inward. The ink pass draws single-sided and would see the legs'
    // outlines through the cloth, so wind the faces outward (the normals below are built to match)
    const ix = cg.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    cg.index.needsUpdate = true;
    this.rowV = new Float32Array(P); this.rowC = new Float32Array(P); this.rowS = new Float32Array(P);
    for (let j = 0; j < P; j++) this.rowV[j] = clamp(-c0[j * 3 + 1] / len, 0, 1);
    // each column: its direction out from the middle, and every point as (out from the waist, down from the waist);
    // ell / th0: how far each point is from the waist hinge and its rest angle off straight down (for the legs)
    const NV = (K + 1) * P;
    this.ux = new Float32Array(K + 1); this.uz = new Float32Array(K + 1); this.top = new Float32Array(K + 1);
    this.ca = new Float32Array(NV); this.cb = new Float32Array(NV); this.ell = new Float32Array(NV); this.th0 = new Float32Array(NV);
    for (let i = 0; i <= K; i++) {
      const phi = (i / K) * TAU, ex = this.rx * Math.sin(phi), ez = this.rz * Math.cos(phi), el = Math.hypot(ex, ez);
      this.ux[i] = ex / el; this.uz[i] = ez / el;
      const t = i * P * 3, rTop = c0[t] * this.ux[i] + c0[t + 2] * this.uz[i];
      this.top[i] = rTop;
      for (let j = 0; j < P; j++) {
        const q = i * P + j, o = q * 3;
        const a = c0[o] * this.ux[i] + c0[o + 2] * this.uz[i] - rTop, b = -c0[o + 1];
        this.ca[q] = a; this.cb[q] = b;
        this.ell[q] = Math.hypot(a, b); this.th0[q] = Math.atan2(a, b);
      }
    }
    // ---- the hem band: each vertex as (column, fraction), out/down from the waist along its own direction, and its normal
    const hg = sk.hem.geometry, hp = hg.attributes.position, h0 = hp.array, hn0 = hg.attributes.normal.array, N = hp.count;
    this.hg = hg;
    this.hk = new Uint8Array(N); this.hf = new Float32Array(N);
    this.hux = new Float32Array(N); this.huz = new Float32Array(N); this.ha = new Float32Array(N); this.hb = new Float32Array(N);
    this.hna = new Float32Array(N); this.hnt = new Float32Array(N); this.hny = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 3, x = h0[o], z = h0[o + 2], r = Math.hypot(x, z) || 1;
      let f = (Math.atan2(x / this.rx, z / this.rz) / TAU) * K; f = ((f % K) + K) % K;
      const k = Math.floor(f) % K; this.hk[i] = k; this.hf[i] = f - Math.floor(f);
      const ux = x / r, uz = z / r, rTop = lerp(this.top[k], this.top[k + 1], this.hf[i]);
      this.hux[i] = ux; this.huz[i] = uz; this.ha[i] = r - rTop; this.hb[i] = -h0[o + 1];
      this.hna[i] = hn0[o] * ux + hn0[o + 2] * uz; this.hnt[i] = hn0[o] * uz - hn0[o + 2] * ux; this.hny[i] = hn0[o + 1];
    }
    for (const g of [cg, hg]) {
      g.attributes.position.setUsage(THREE.DynamicDrawUsage); g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
      g.computeBoundingSphere(); g.boundingSphere.radius *= 2; // room for the swing (frustum culling)
    }
    // ---- state
    this.A = new Float32Array(K); this.Av = new Float32Array(K); this.hard = new Float32Array(K); this.hardPrev = new Float32Array(K); this.ceil = new Float32Array(K);
    this.colC = new Float32Array(K + 1); this.colS = new Float32Array(K + 1);
    this.W = new THREE.Vector3(); this.Hp = new THREE.Vector3(); this.Hv = new THREE.Vector3(); this.Vw = new THREE.Vector3();
    this.yawH = 0; this.yawHv = 0; this.yawG = 0;
    this.tx = 0; this.tz = 0; this.ty = 0; this.tyv = 0; this.psi = 0;
    this.fresh = true; this.time = Math.random() * 10;
    this.samples = new Float32Array(2 * LEG_N * 4); // x, y, z, radius of points along both legs (skirt frame)
  }

  // h: the Human; out: this frame's pose; dt seconds; sitK: 0..1 how seated
  step(h, out, dt, sitK) {
    const g = this.sk.group, len = this.len;
    this.time += dt;
    // ---- where the waist is in the world, and how it moves
    g.updateWorldMatrix(true, false);
    const m = g.matrixWorld.elements;
    const sc = Math.hypot(m[0], m[1], m[2]) || 1;                      // the root's scale (kids are scaled down)
    const W = this.W;
    _b.set(m[12], m[13], m[14]);
    const upright = m[5] / sc;                                          // the skirt's up, against the world's up
    const yawG = Math.atan2(m[8], m[10]);
    if (this.fresh || _b.distanceToSquared(W) > 2.25 || upright < 0.2) {
      // first frame, a teleport, or upside down (a flip, the swing): hang still
      W.copy(_b); this.Vw.set(0, 0, 0);
      this.Hp.set(W.x - m[4] * len * sitK, 0, W.z - m[6] * len * sitK); this.Hv.set(0, 0, 0);
      this.yawG = this.yawH = yawG; this.yawHv = 0; this.fresh = upright < 0.2;
    }
    const Vw = this.Vw;
    _c.copy(_b).sub(W).multiplyScalar(1 / dt);
    Vw.lerp(_c, Math.min(1, dt * 30)); // a touch of smoothing: remote players move in interpolated steps
    W.copy(_b);
    const hs = Math.hypot(Vw.x, Vw.z) / sc;                             // ground speed in the rig's own units
    const fadeUp = smooth((upright - 0.2) / 0.4);
    // ---- the pendulum (sideways only: the cloth does not stretch). It hangs by gravity, not along the pelvis, which
    // pitches with every stride; seated, it follows the lap. Air drag trails it behind at speed.
    const air = 0.022 * len * sc;
    const hx = m[4] * len * sitK, hz = m[6] * len * sitK;
    const Hp = this.Hp, Hv = this.Hv;
    Hv.x += (70 * (W.x - hx - Vw.x * air - Hp.x) + 6.5 * (Vw.x - Hv.x)) * dt;
    Hv.z += (70 * (W.z - hz - Vw.z * air - Hp.z) + 6.5 * (Vw.z - Hv.z)) * dt;
    // its offset from the skirt's own rest hem, in the skirt's frame (read before Hp steps on to the next frame)
    const vx = Hp.x - (W.x - m[4] * len), vz = Hp.z - (W.z - m[6] * len);
    Hp.x += Hv.x * dt; Hp.z += Hv.z * dt;
    this.tx = clamp((vx * m[0] + vz * m[2]) / (sc * sc * len), -0.4, 0.4) * fadeUp;
    this.tz = clamp((vx * m[8] + vz * m[10]) / (sc * sc * len), -0.4, 0.4) * fadeUp;
    // the bell: a soft spring on the waist's vertical speed (a fall opens the skirt, a spring up closes it a little)
    const liftT = clamp((-Vw.y / sc) * 0.05, -0.05, 0.35) * fadeUp;
    this.tyv += (60 * (liftT - this.ty) - 7 * this.tyv) * dt; this.ty += this.tyv * dt;
    // ---- the twist lag: the hem's yaw chases the hips' yaw
    const yawRate = wrapA(yawG - this.yawG) / dt; this.yawG = yawG;
    this.yawHv += (110 * wrapA(yawG - this.yawH) + 9 * (yawRate - this.yawHv)) * dt;
    this.yawH += this.yawHv * dt;
    this.psi = clamp(wrapA(this.yawH - yawG), -0.4, 0.4) * fadeUp;
    if (Math.abs(wrapA(this.yawH - yawG)) > 0.4) this.yawH = yawG + this.psi; // never wind up past the limit

    // ---- the legs: how far out each strip must swing to keep outside them
    this.legSamples(h, g);
    const hard = this.hard, hardPrev = this.hardPrev, A = this.A, Av = this.Av, S = this.samples;
    hardPrev.set(hard); hard.fill(-9);
    const push = (1 - sitK) * fadeUp, P = this.P, ell = this.ell, th0 = this.th0;
    let exited = false;
    // each leg pushes from the hip down until it leaves through the hem: below that it is outside the cloth (a dress
    // stops at the knee; only a gown covers the feet)
    if (push > 0.01) for (let s = 0; s < S.length; s += 4) {
      const idx = (s / 4) % LEG_N;
      if (idx === 0) exited = false;
      const y = S[s + 1], r = S[s + 3], v = -y / len;
      if (exited || v > 1 + r / len) { exited = true; continue; }
      if ((v < V_MIN && idx < 3) || (idx >= FOOT && !this.sk.gown)) continue;
      // undo the twist at this height, so the push lands where the cloth will be
      const tw = -this.psi * v * v, ct = Math.cos(tw), st = Math.sin(tw);
      const x = S[s] * ct + S[s + 2] * st, z = -S[s] * st + S[s + 2] * ct;
      const phi = Math.atan2(x / this.rx, z / this.rz);
      let kc = Math.round((phi / TAU) * K); kc = ((kc % K) + K) % K;
      // the leg's surface, seen from the waist hinge of the nearest strip: out a, down b
      const a = Math.hypot(x, z) + r + MARGIN - this.top[kc], b = -y;
      const lP = Math.hypot(a, b), thP = Math.atan2(a, b);
      // the strip's rest angle at that distance from the waist (rows run down from the waist). A point further out
      // than the cloth reaches (a toe kicking forward under a gown) gets the hem laid over it: it peeks out below.
      const base = kc * P;
      let j = 0;
      while (j < P - 2 && ell[base + j + 1] < lP) j++;
      const l0 = ell[base + j], l1 = ell[base + j + 1];
      const th = lerp(th0[base + j], th0[base + j + 1], clamp((lP - l0) / Math.max(1e-5, l1 - l0), 0, 1));
      const dem = Math.min(D_MAX, (thP - th) * 1.06 * push);
      if (dem <= D_MIN) continue;
      for (let k = 0; k < K; k++) {
        const da = Math.abs(wrapA((k / K) * TAU - phi));
        if (da >= KER) continue;
        const e = 0.5 + 0.5 * Math.cos((Math.PI * da) / KER);
        const w = dem * e + D_MIN * (1 - e);
        if (w > hard[k]) hard[k] = w;
      }
    }
    // ---- the hands: a hand swinging by the hip stays outside the cloth (a strip near it swings out no further than the
    // hand's inner side). The legs win if the two disagree.
    const ceil = this.ceil;
    ceil.fill(9);
    _inv.copy(g.matrixWorld).invert();
    for (let ai = 0; ai < 2; ai++) {
      const arm = ai === 0 ? h.armL : h.armR;
      arm.anchor.updateWorldMatrix(true, false);
      _a.setFromMatrixPosition(arm.anchor.matrixWorld).applyMatrix4(_inv);
      const y = _a.y, v = -y / len;
      if (v < V_MIN || v > 1.1) continue;
      const tw = -this.psi * v * v, ct = Math.cos(tw), st = Math.sin(tw);
      const x = _a.x * ct + _a.z * st, z = -_a.x * st + _a.z * ct;
      const phi = Math.atan2(x / this.rx, z / this.rz);
      let kc = Math.round((phi / TAU) * K); kc = ((kc % K) + K) % K;
      const a = Math.hypot(x, z) - HAND_R - MARGIN - this.top[kc], b = -y;
      if (a <= 0) continue; // a hand in close to the waist: the arm clearance keeps it out of the way there
      const lP = Math.hypot(a, b), thP = Math.atan2(a, b), base = kc * P;
      let j = 0;
      while (j < P - 2 && ell[base + j + 1] < lP) j++;
      if (lP > ell[base + P - 1] * 1.15) continue; // well below the hem
      const l0 = ell[base + j], l1 = ell[base + j + 1];
      const cap = thP - lerp(th0[base + j], th0[base + j + 1], clamp((lP - l0) / Math.max(1e-5, l1 - l0), 0, 1));
      for (let k = 0; k < K; k++) {
        const da = Math.abs(wrapA((k / K) * TAU - phi));
        if (da >= HAND_KER) continue;
        const e = 0.5 + 0.5 * Math.cos((Math.PI * da) / HAND_KER);
        const w = cap * e + D_MAX * (1 - e);
        if (w < ceil[k]) ceil[k] = w;
      }
    }
    // ---- the strips' springs
    const run = smooth((hs - 2.5) / 4), walk = smooth(hs / 2);
    const gown = this.sk.gown;
    const flare = ((gown ? 0.05 : 0.07) * walk + (gown ? 0.1 : 0.14) * run + this.ty) * (1 - sitK);
    const flut = 0.03 * run, ph = this.time * 11, tx = this.tx, tz = this.tz;
    for (let k = 0; k < K; k++) {
      const a = (k / K) * TAU;
      // the pendulum swings the strips on its side out and the far side in; the flare opens them all; a little flutter
      const target = tx * this.ux[k] + tz * this.uz[k] + flare + flut * Math.sin(3 * a + ph) + 0.015 * walk * Math.sin(2 * a - ph * 0.6);
      Av[k] += (150 * (target - A[k]) - 13 * Av[k]) * dt;
      A[k] += Av[k] * dt;
      if (A[k] > ceil[k]) { A[k] = ceil[k]; Av[k] = Math.min(Av[k], 0); }
      if (A[k] < hard[k]) {
        // the leg shoves the cloth: it moves at least as fast as the push grows, then flies on a little (follow-through)
        const kick = Math.max(0, hard[k] - Math.max(hardPrev[k], A[k] - Av[k] * dt)) / dt;
        Av[k] = Math.max(Av[k], Math.min(kick * 0.6, 6));
        A[k] = hard[k];
      }
      A[k] = clamp(A[k], D_MIN, D_MAX);
    }
    this.deform();
  }

  // Points along the thighs, shins and shoes (x, y, z, radius) in the skirt group's frame.
  legSamples(h, g) {
    const D = this.D, sr = g.rotation.x;
    this._n = 0; this._cs = Math.cos(sr); this._sn = Math.sin(sr);
    this._isx = 1 / (g.scale.x || 1); this._isy = 1 / (g.scale.y || 1); this._isz = 1 / (g.scale.z || 1);
    for (let li = 0; li < 2; li++) {
      const leg = li === 0 ? h.legL : h.legR;
      _q1.copy(leg.hip.quaternion); _q2.copy(_q1).multiply(leg.knee.quaternion); _q3.copy(_q2).multiply(leg.ankle.quaternion);
      const hip = leg.hip.position;
      _b.set(0, -D.Lt, 0).applyQuaternion(_q1).add(hip);               // the knee
      _c.set(0, -D.Ls, 0).applyQuaternion(_q2).add(_b);                // the ankle
      for (let k = 0; k < THIGH_T.length; k++) this.put(_a.copy(hip).lerp(_b, THIGH_T[k]), D.legR);
      for (let k = 0; k < SHIN_T.length; k++) this.put(_a.copy(_b).lerp(_c, SHIN_T[k]), D.legR * (1 - 0.1 * SHIN_T[k]) * 0.97);
      this.put(_d.set(0, -0.04, -0.07).applyQuaternion(_q3).add(_c), 0.075); // the heel
      this.put(_d.set(0, -0.03, 0.08).applyQuaternion(_q3).add(_c), 0.09);   // the ball of the foot
      this.put(_d.set(0, -0.03, 0.2).applyQuaternion(_q3).add(_c), 0.075);   // the toe
    }
  }
  // one point, hips frame -> skirt frame (the skirt sits SKIRT_TOP up and tips forward when seated)
  put(p, r) {
    const S = this.samples, y = p.y - SKIRT_TOP, z = p.z, cs = this._cs, sn = this._sn;
    S[this._n++] = p.x * this._isx; S[this._n++] = (y * cs + z * sn) * this._isy; S[this._n++] = (-y * sn + z * cs) * this._isz; S[this._n++] = r;
  }

  // Swing each strip about the waist, twist, and rebuild the normals; the hem band follows the bottom row.
  deform() {
    const P = this.P, A = this.A, rowV = this.rowV, rowC = this.rowC, rowS = this.rowS, colC = this.colC, colS = this.colS;
    const psi = this.psi, ca = this.ca, cb = this.cb, ux = this.ux, uz = this.uz, top = this.top;
    for (let j = 0; j < P; j++) { const v = rowV[j], a = psi * v * v; rowC[j] = Math.cos(a); rowS[j] = Math.sin(a); }
    for (let i = 0; i <= K; i++) { const d = A[i % K]; colC[i] = Math.cos(d); colS[i] = Math.sin(d); }
    const pos = this.cg.attributes.position, p = pos.array;
    for (let i = 0; i <= K; i++) {
      const c = colC[i], s = colS[i], Ux = ux[i], Uz = uz[i], T = top[i];
      for (let j = 0; j < P; j++) {
        const q = i * P + j, o = q * 3, a = ca[q], b = cb[q];
        const r = T + a * c + b * s, down = b * c - a * s;
        const x = Ux * r, z = Uz * r, tc = rowC[j], ts = rowS[j];
        p[o] = x * tc + z * ts; p[o + 1] = -down; p[o + 2] = -x * ts + z * tc;
      }
    }
    pos.needsUpdate = true;
    // normals from the grid: round the skirt x down the skirt, wrapping at the seam
    const n = this.cg.attributes.normal.array;
    for (let i = 0; i <= K; i++) {
      const il = i === 0 ? K - 1 : i - 1, ir = i === K ? 1 : i + 1;
      for (let j = 0; j < P; j++) {
        const jd = j === 0 ? 0 : j - 1, ju = j === P - 1 ? P - 1 : j + 1;
        const L = (il * P + j) * 3, R = (ir * P + j) * 3, Dn = (i * P + jd) * 3, U = (i * P + ju) * 3;
        const ax = p[R] - p[L], ay = p[R + 1] - p[L + 1], az = p[R + 2] - p[L + 2];
        const bx = p[U] - p[Dn], by = p[U + 1] - p[Dn + 1], bz = p[U + 2] - p[Dn + 2];
        const nx = az * by - ay * bz, ny = ax * bz - az * bx, nz = ay * bx - ax * by; // outward (rows run downward)
        const l = Math.hypot(nx, ny, nz) || 1, o = (i * P + j) * 3;
        n[o] = nx / l; n[o + 1] = ny / l; n[o + 2] = nz / l;
      }
    }
    this.cg.attributes.normal.needsUpdate = true;
    // the hem band: each vertex swings with its strip (blended between two), then the hem's twist
    const hpA = this.hg.attributes.position, h = hpA.array, hnA = this.hg.attributes.normal, hn = hnA.array;
    const tc = Math.cos(psi), ts = Math.sin(psi);
    for (let i = 0, N = hpA.count; i < N; i++) {
      const o = i * 3, k = this.hk[i], f = this.hf[i];
      const d = lerp(A[k], A[(k + 1) % K], f), c = Math.cos(d), s = Math.sin(d);
      const a = this.ha[i], b = this.hb[i], T = lerp(top[k], top[k + 1], f);
      const r = T + a * c + b * s, down = b * c - a * s;
      const Ux = this.hux[i], Uz = this.huz[i], x = Ux * r, z = Uz * r;
      h[o] = x * tc + z * ts; h[o + 1] = -down; h[o + 2] = -x * ts + z * tc;
      // the normal turns with the strip (out and down), then with the twist
      const na = this.hna[i] * c - this.hny[i] * s, ny = this.hny[i] * c + this.hna[i] * s, nt = this.hnt[i];
      const nx = Ux * na + Uz * nt, nz = Uz * na - Ux * nt;
      hn[o] = nx * tc + nz * ts; hn[o + 1] = ny; hn[o + 2] = -nx * ts + nz * tc;
    }
    hpA.needsUpdate = true; hnA.needsUpdate = true;
  }
}
