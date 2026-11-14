// Body type for human.js: one number, shape (0 masculine, 0.5 neutral, 1 feminine), turned into a smooth warp of the torso and
// everything laid on it (collars, ties, jackets, straps), plus a few proportions (hips, hands, neck). The warp is the identity at
// 0.5, so neutral profiles and NPCs are untouched. A figure preset (look.figure) and a bust slider (look.bust, 0..1) shape it
// further. Kids get no chest and little waist whatever the look says.
import { profileAt, clamp, smooth, smoothProfile } from './bodies-geo.js';
import { TORSO_PROFILE } from './bodies-outfit.js';

export const BODY_TYPES = ['m', 'f', 'nb'];
// the figure presets (append only: looks name them). Each is a set of deltas on the body type's own shape (see FIG below).
export const FIGURES = ['average', 'slim', 'curvy', 'pear', 'athletic', 'plus'];
// the pelvis lathe (hips frame: y from -0.2 to 0.14, radius (hipX + 0.112) * hipK)
export const PELVIS_PROFILE = smoothProfile([[0.001, 0], [0.55, 0.04], [0.88, 0.14], [1.0, 0.32], [0.99, 0.6], [0.96, 0.85], [0.93, 1.0]], 16);

// look.body / look.shape -> the shape number. 'm' and 'f' decide it; 'nb' (and anything missing) uses look.shape.
export function shapeFor(body, shape) {
  if (body === 'm') return 0;
  if (body === 'f') return 1;
  return Number.isFinite(shape) ? clamp(shape, 0, 1) : 0.5;
}

const bump = (v, c, w) => { const u = (v - c) / w; return u * u >= 1 ? 0 : (1 - u * u) * (1 - u * u); };
// a ramp up from a to b and back down from c to d (0 outside, 1 between b and c), smooth at every corner
const plateau = (v, a, b, c, d) => smooth((v - a) / (b - a)) * (1 - smooth((v - c) / (d - c)));

// The feminine end's own shape (f = 1) and each figure's deltas on it. Widths are side to side, depths front to back, as factors.
//   sh shoulders, wa waist width, wd the belly's depth at the waist (- flatter), hp the hips (the shirt's flare at the hem and the
//   pelvis), seat the back below the waist, belly a soft round belly (front, lower), arm arm thickness, bust the chest (0..1, the
//   bust slider's scale; the drape under it is part of it)
const FEM = { sh: -0.095, wa: -0.15, wd: -0.11, hp: 0.07, seat: 0.03, belly: 0, arm: -0.06, bust: 0.5 };
const FIG = {
  average: {},
  slim: { sh: -0.03, wa: 0.07, wd: 0.03, hp: -0.06, seat: -0.035, arm: -0.06, bust: 0.25, build: -0.12 },
  curvy: { sh: 0.02, wa: -0.07, wd: -0.02, hp: 0.11, seat: 0.06, bust: 0.9 },
  pear: { sh: -0.05, wa: -0.02, hp: 0.17, seat: 0.08, bust: 0.35 },
  athletic: { sh: 0.1, wa: 0.05, wd: 0.03, hp: -0.03, seat: 0.02, arm: 0.06, bust: 0.35, chest: 0.06, build: 0.04 },
  plus: { sh: 0.04, wa: 0.16, wd: 0.13, hp: 0.07, seat: 0.08, belly: 0.03, arm: 0.06, bust: 0.9, build: 0.16 },
};
const figOf = name => (typeof name === 'string' && FIG[name]) || FIG.average;
// a figure's widening of the whole body, added to the build (plus is rounder, slim slimmer): human.js bodyDims reads it
export const figureBuild = name => figOf(name).build || 0;
// the bust a figure has when the look has no bust of its own (0..1: the bust slider's value)
export const figureBust = name => figOf(name).bust ?? FEM.bust;

// The torso's shaping at chest-frame height y (yb, H: the torso lathe's hem and height). Returns widths as factors.
// prop (the NPC Editor, optional): { shoulders, hips } multipliers, 1 = unchanged.
// opts (optional): { figure, bust (0..1), kid (0..1: how much of a child the body is), loose (a robe) }
export function makeShape(s, D, yb, H, prop = null, opts = null) {
  const g = (clamp(s, 0, 1) - 0.5) * 2, m = Math.max(0, -g), f = Math.max(0, g);
  const shK = prop && Number.isFinite(prop.shoulders) ? prop.shoulders - 1 : 0, hpK = prop && Number.isFinite(prop.hips) ? prop.hips : 1;
  const fig = figOf(opts?.figure), kid = clamp(opts?.kid || 0, 0, 1), grown = clamp(1 - 1.4 * kid, 0, 1);
  const hasFig = fig !== FIG.average, hasBust = Number.isFinite(opts?.bust);
  // the figure's deltas count fully at the feminine end and partly towards the masculine end (a broad or a round man, not a curvy one)
  const fk = (k, mw) => (fig[k] || 0) * (mw + (1 - mw) * f);
  const P = {
    sh: FEM.sh * f + fk('sh', 0.25), wa: (FEM.wa * f + fk('wa', 0.5)) * (1 - 0.6 * kid), wd: (FEM.wd * f + fk('wd', 0.6)) * (1 - 0.5 * kid),
    hp: (FEM.hp * f + fk('hp', 0.35)) * (1 - 0.6 * kid), seat: (FEM.seat * f + fk('seat', 0.4)) * (1 - 0.5 * kid), belly: fk('belly', 1),
    arm: FEM.arm * f + fk('arm', 0.8), chest: fk('chest', 1),
  };
  // the bust: the slider when the look has one, else the figure's; nothing on the masculine half, nothing on a child
  if (opts?.loose) { P.hp = 0; P.belly = 0; } // (a robe hangs loose from the shoulders: the hips do not show through it, and its wide sleeves swing past them)
  const bust = (hasBust ? clamp(opts.bust, 0, 1) : (fig.bust ?? FEM.bust)) * f * grown;
  const S = {
    s, g, m, f, figure: hasFig ? opts.figure : 'average', bust,
    hipK: (1 + 0.45 * P.hp - 0.06 * m) * hpK,                          // pelvis width (the shirt's hem flares over it: see hem below)
    hipXK: (1 + 0.3 * P.hp - 0.03 * m) * (1 + (hpK - 1) * 0.7),       // leg spacing
    handK: [1 + 0.1 * m - 0.07 * f, 1 + 0.03 * m - 0.04 * f], // hand width, length
    armK: 1 + 0.06 * m + P.arm,             // arm thickness
    neckK: 1 + 0.08 * m - 0.08 * f,         // neck thickness
    seatK: 1 + 0.6 * P.seat,                // the pelvis' depth (a fuller seat)
    warp: null, fx: () => 1,
  };
  // side-to-side width at height v (0 = hem, 1 = top of the dome): shoulders, waist, hips. Nothing changes over the
  // top of the dome, so the collar still hugs the neck.
  const top = v => 1 - smooth((v - 0.9) / 0.09);
  const fx = v => 1
    + bump(v, 0.8, 0.24) * top(v) * (0.19 * m + P.sh)
    - bump(v, 0.885, 0.07) * top(v) * 0.05 * f                                  // the shoulders' corner rounded off (a softer line from the neck)
    + bump(v, 0.6, 0.22) * (0.08 * m + 0.02 * f * grown + P.chest)
    + bump(v, 0.36, 0.27) * P.wa
    + (1 - smooth((v - 0.04) / 0.36)) * P.hp - (1 - smooth((v - 0.06) / 0.34)) * 0.08 * m // the hips: the hem flares out to them
    + P.belly * 0.6 * bump(v, 0.24, 0.3)
    + (shK ? bump(v, 0.8, 0.24) * top(v) * 0.85 * shK : 0);   // broader or narrower shoulders (the NPC Editor)
  // front-to-back depth: a soft chest the cloth drapes from (one gentle mound, two lobes melted in; the cloth falls straight from
  // it to the waist, so there is no ledge under it), a flatter belly at the waist, the small of the back, a fuller seat
  const lobe = xn => { const a = Math.abs(xn); return (0.78 + 0.22 * Math.exp(-(((a - 0.38) / 0.3) ** 2))) * (1 - smooth((a - 0.62) / 0.42)); };
  const bustV = v => plateau(v, 0.3, 0.62, 0.68, 0.9) * (0.55 + 0.45 * smooth((v - 0.44) / 0.18)); // (a long ramp up from the waist: the drape)
  const fz = (v, xn, zn) => 1
    + (zn > 0 ? 0.3 * bust * bustV(v) * lobe(xn) * zn ** 1.3 : 0)
    + (zn > 0 ? m * 0.07 * bump(v, 0.62, 0.22) * zn * zn : 0)
    + (zn > 0 ? (P.wd * bump(v, 0.26, 0.32) + P.belly * bump(v, 0.24, 0.3)) * zn ** 1.2 : P.wd * 0.3 * bump(v, 0.36, 0.22) * zn * zn) // (the front; behind, the small of the back)
    + (zn < 0 ? (1 - smooth((v - 0.05) / 0.3)) * (P.seat - 0.03 * m) * zn * zn : 0);
  // the shirt must cover the pelvis wherever the two overlap (slim builds, wide hips, a pinched waist): flare the
  // bottom of the torso just enough
  const hipX = D.hipX * S.hipXK, pelR = (hipX + 0.112) * S.hipK;
  const fall = v => 1 - smooth(v / 0.5);
  let hem = 0;
  for (let y = yb; y <= 0.14 - D.waist + 1e-6; y += 0.01) {
    const v = (y - yb) / H, pel = pelR * profileAt(PELVIS_PROFILE, (y + D.waist + 0.2) / 0.34);
    hem = Math.max(hem, ((pel * 1.035 + 0.004) / (D.wT * profileAt(TORSO_PROFILE, v)) - fx(v)) / fall(v));
  }
  if (Math.abs(g) < 1e-3 && hem < 1e-3 && !shK && !hasFig) return S;
  const fxh = v => fx(v) + hem * fall(v);
  S.fx = y => fxh((y - yb) / H);
  S.warp = (x, y, z, out) => {
    const v = (y - yb) / H, P = profileAt(TORSO_PROFILE, clamp(v, 0, 1));
    const xn = clamp(x / (D.wT * P), -1.3, 1.3), zn = clamp(z / (D.dT * P), -1.3, 1.3);
    out[0] = x * fxh(v); out[1] = y; out[2] = z * fz(v, xn, zn);
    return out;
  };
  return S;
}
