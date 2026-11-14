// How a trail is laid down on the ground: pure, no imports, so the tests load it straight into Node.
//
// A trail in layout.js TRAILS is a few control points and a width. People do not walk rulers, so the drawn path:
//   - curves through the control points (Catmull-Rom) and wanders a little between them (a hashed bow per segment, zero
//     at every control point, so junctions, Kevin's lookouts and the NPCs' straight legs stay on it);
//   - varies its width along the way, and flares a little where it meets another trail (a worn Y, not a T);
//   - has a soft, ragged edge: an inner edge (solid dirt) and an outer fringe that fades to nothing, both jittered;
//   - fades out over its last metre where it simply ends (on the sand, at a place), but stops dead at the foot of a
//     step, a deck, a pier, a floor, a sidewalk or a dirt circle (`blocked`), with that thing on top.
// trailShape() returns the runs to draw (cut where blocked) and the whole centre line (for onTrail and the grass).

const SPACING = 0.42;     // m between cross-sections
const FADE_END = 1.1;     // m over which a free end fades out
const FLARE_R = 2.8;      // m round a junction where the mouth widens

// a small integer hash -> 0..1, and smooth 1D value noise -> -1..1
function h01(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(t, seed) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return (h01(i, seed) * (1 - u) + h01(i + 1, seed) * u) * 2 - 1;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function nameSeed(name) { let h = 7; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619); return h >>> 0; }

function catmull(pts, perSeg) {
  if (pts.length < 3) { // two points: a straight segment, sampled so the bow has somewhere to go
    const out = [];
    for (let s = 0; s < perSeg; s++) { const t = s / perSeg; out.push([pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t]); }
    out.push(pts[1].slice());
    return out;
  }
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// distance from (x, z) to a polyline
export function polyDist(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - dx * t, ez = z - az - dz * t, d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * pts: resolved control points [[x, z], ...]; width: m.
 * opts: { seed, ring (a closed arc round a plaza: no bow), bow (max sideways wander, m), joins: [[x, z]] (points where
 *   another trail meets this one, its mouth flares), joinedStart / joinedEnd (this end meets another trail: no fade),
 *   blocked(x, z) -> bool }
 * -> { centre: [[x, z]] (the whole drawn centre line), runs: [[{ x, z, tx, tz, hw, inner, outer, a }]] }
 */
export function trailShape(pts, width, opts = {}) {
  const { seed = 1, ring = false, joins = [], joinedStart = false, joinedEnd = false, blocked = null } = opts;
  const bowMax = opts.bow ?? Math.min(0.42, 0.24 * width);
  const PER = 10;
  const curve = catmull(pts, PER);
  // arc length along the curve and where each control point falls on it
  const cum = [0];
  for (let i = 1; i < curve.length; i++) cum.push(cum[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]));
  const L = cum[cum.length - 1];
  if (L < 0.3) return { centre: pts.map(p => p.slice()), runs: [] };
  const ctrlS = pts.map((_, k) => cum[Math.min(curve.length - 1, k * PER)]);
  const at = s => { // position and unit tangent on the curve at arc length s
    s = Math.min(L, Math.max(0, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / seg;
    const a = curve[lo], b = curve[hi], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
    return [a[0] + tx * t, a[1] + tz * t, tx / tl, tz / tl];
  };
  // the bow: per segment a hashed sideways amount, shaped sin^2 (zero, and flat, at both control points), with a lean
  const bows = pts.slice(0, -1).map((_, k) => {
    const segL = ctrlS[k + 1] - ctrlS[k];
    const amp = ring ? 0 : Math.min(bowMax, segL * 0.045) * (h01(seed, k * 2 + 1) * 2 - 1);
    return { amp, lean: (h01(seed, k * 2 + 2) - 0.5) * 0.8, two: segL > 16 ? 0.6 * (h01(seed, k + 50) * 2 - 1) : 0 };
  });
  const bowAt = s => {
    let k = 0; while (k < bows.length - 1 && s > ctrlS[k + 1]) k++;
    const segL = ctrlS[k + 1] - ctrlS[k] || 1, u = Math.min(1, Math.max(0, (s - ctrlS[k]) / segL)), b = bows[k];
    const base = Math.sin(Math.PI * u) ** 2;
    return b.amp * base * (1 + b.lean * (u - 0.5) * 2 + b.two * Math.sin(2 * Math.PI * u));
  };
  const free0 = !joinedStart && !ring, free1 = !joinedEnd && !ring;
  const sample = s => {
    const [cx, cz, tx, tz] = at(s), m = bowAt(s);
    const x = cx - tz * m, z = cz + tx * m; // (the normal is (-tz, tx))
    let hw = (width / 2) * (1 + 0.09 * vnoise(s / 4.6, seed) + 0.04 * vnoise(s / 1.7, seed + 3));
    for (const [jx, jz] of joins) { const d = Math.hypot(x - jx, z - jz); if (d < FLARE_R) hw *= 1 + 0.32 * (1 - smooth(0, FLARE_R, d)); }
    let a = 1;
    if (free0) a = Math.min(a, smooth(0, FADE_END, s));
    if (free1) a = Math.min(a, smooth(0, FADE_END, L - s));
    hw *= 0.75 + 0.25 * a;
    // the edge: solid to `inner`, fading out by `outer`, both jittered (slow swells, and a ragged bite every few steps)
    const rag = vnoise(s / 0.23, seed + 13);
    const inner = hw * (0.82 + 0.07 * vnoise(s / 0.9, seed + 7) + 0.06 * rag);
    const outer = hw * (1.1 + 0.12 * vnoise(s / 0.65, seed + 11) + 0.1 * rag);
    return { x, z, tx, tz, hw, inner, outer, a, s };
  };
  const n = Math.max(2, Math.ceil(L / SPACING));
  const all = [];
  for (let i = 0; i <= n; i++) all.push(sample((i / n) * L));
  const centre = all.map(p => [p.x, p.z]);
  if (!blocked) return { centre, runs: [all] };
  // cut wherever any of the cross-section (both fringes, both edges, the middle) is on something that is not lawn
  const bad = p => {
    for (const k of [-1, -0.5, 0, 0.5, 1]) { const w = k * p.outer; if (blocked(p.x - p.tz * w, p.z + p.tx * w)) return true; }
    return false;
  };
  const edge = (sGood, sBad) => { for (let it = 0; it < 7; it++) { const m = (sGood + sBad) / 2; if (bad(sample(m))) sBad = m; else sGood = m; } return sample(sGood); };
  const runs = [];
  let run = [];
  let prevBad = null;
  for (let i = 0; i < all.length; i++) {
    const p = all[i], b = bad(p);
    if (!b) {
      if (prevBad === true) run.push(edge(p.s, all[i - 1].s)); // (coming off the blocked stretch: start exactly at its edge)
      run.push(p);
    } else if (prevBad === false) { run.push(edge(all[i - 1].s, p.s)); runs.push(run); run = []; }
    prevBad = b;
  }
  if (run.length) runs.push(run);
  return { centre, runs: runs.filter(r => r.length >= 2) };
}
