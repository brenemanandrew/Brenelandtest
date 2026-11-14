// Clothes for human.js: the torso of every outfit (tees to tuxedos), skirts and gowns (a group on the hips that follows
// the legs, so sitting or striding never pushes a knee through the hem), sleeves and shoes.
// Colours: the top picker (o.shirt) is the jacket / waistcoat / gown; o.inner is the shirt under a jacket; o.tieColor
// the tie, bow tie and pocket square. Everything is merged into the rigid pieces human.js already builds.
import * as THREE from 'three';
import { Part, sphere, cylGeo, coneGeo, boxGeo, torusGeo, lathe, smoothProfile, openLathe, profileAt, darker, lighter, mixHex, clamp, lerp, smooth, TAU } from './bodies-geo.js';

export const OUTFITS = ['tee', 'hoodie', 'overalls', 'dress', 'skirt', 'coat', 'tank', 'suit', 'blazer', 'vest', 'tux', 'gown', 'jacket'];
export const TIES = ['none', 'tie', 'bow', 'skinny'];
export const SHOE_KINDS = ['sneakers', 'dress', 'boots'];
export const POCKETS = ['none', 'square', 'flower'];

// what each outfit wears by default when the look does not say
const DEFAULTS = {
  suit: { tie: 'tie', inner: '#ffffff', shoes: 'dress', tieColor: '#c4423a' },
  tux: { tie: 'bow', inner: '#ffffff', shoes: 'dress', tieColor: '#1e1e24' },
  vest: { tie: 'tie', inner: '#ffffff', shoes: 'dress', tieColor: '#3f5f8f' },
  blazer: { tie: 'none', inner: '#ffffff', shoes: 'sneakers', tieColor: '#c4423a' },
  jacket: { tie: 'none', inner: '#d9c7a3', shoes: 'boots', tieColor: '#6b4428' },
  gown: { tie: 'none', inner: '#ffffff', shoes: 'dress', tieColor: '#f2c14e' },
};
export const outfitDefaults = outfit => DEFAULTS[outfit] || { tie: 'none', inner: '#ffffff', shoes: 'sneakers', tieColor: '#c4423a' };
const JACKETS = new Set(['suit', 'blazer', 'tux', 'jacket']);

export const TORSO_PROFILE = smoothProfile([[0.985, 0], [0.99, 0.06], [1.0, 0.2], [0.97, 0.45], [0.9, 0.66], [0.82, 0.82], [0.68, 0.92], [0.42, 0.975], [0.14, 0.995], [0.001, 1]], 26);
// (a little off the shirt and cut in the torso's own 20 steps, or the shirt shows through the bib's sides in patches)
const OVERALL_PROFILE = smoothProfile([[1.012, 0], [1.026, 0.1], [1.034, 0.3], [1.018, 0.5], [0.95, 0.505]], 10);
export const COAT_PROFILE = smoothProfile([[0.86, 1], [0.95, 0.7], [1.12, 0.3], [1.28, 0]], 12);
export const SKIRT_PROFILE = smoothProfile([[0.8, 1], [0.95, 0.75], [1.2, 0.35], [1.42, 0]], 14);
export const GOWN_PROFILE = smoothProfile([[0.97, 1], [1.03, 0.9], [1.08, 0.72], [1.28, 0.45], [1.5, 0.18], [1.6, 0]], 16);
export const SKIRT_TOP = 0.05; // hips-frame height where skirts start

// How the arms and legs are dressed.
export function outfitSpec(o) {
  const f = o.outfit, jacket = JACKETS.has(f), robe = f === 'gown' && o.robe;
  let long = f === 'hoodie' || f === 'coat' || jacket || f === 'vest' || robe;
  let col = f === 'coat' ? o.coat || o.shirt : f === 'vest' ? o.inner : o.shirt;
  const top = o.wear && o.wear.top; // (clothing-store) a bought top: its sleeves are the code's, long or short, in its colour (a vest's in the shirt's under it)
  if (top) { long = top.sleeves === 'long'; col = top.sleeveCol === 'inner' ? top.inner || o.shirt : top.cols[0]; }
  return {
    bareLegs: f === 'dress' || f === 'skirt' || f === 'gown',
    sleeves: { long, col, cuff: jacket ? o.inner : f === 'vest' ? darker(o.inner, 0.9) : robe ? darker(col, 0.7) : darker(col, 0.78), jacket, cap: f === 'tank' || (f === 'gown' && !robe), robe },
    skirt: f === 'dress' || f === 'skirt' || f === 'gown',
    pelvisCol: f === 'dress' || f === 'gown' ? o.shirt : o.pants,
    base: f === 'coat' ? o.coat || o.shirt : jacket || f === 'vest' ? o.inner : o.shirt,
  };
}

// ---- the torso. p: the chest Part; T: top of the torso (chest frame); yb, H: the torso lathe's hem and height.
export function buildTorso(p, o, D, T, yb, H) {
  const spec = outfitSpec(o), f = o.outfit;
  p.add(lathe('torso', TORSO_PROFILE, 20), spec.base, { sx: D.wT, sy: H, sz: D.dT, y: yb, ...(JACKETS.has(f) ? { tag: 'inner', name: 'shirt body' } : {}) }); // (under a jacket: the shirt)
  if (o.wear && o.wear.top) return; // (clothing-store) a bought top goes over the plain base: none of the tee's own trim
  // the neck itself is human.js's (it moves with the head); collars and neck bands are sized to it
  const nk = D.neckR / 0.0875;
  const S = sphere(12, 8);
  // a point on the front of the torso at chest-frame height y and sideways offset x, lifted `out` off the cloth
  const front = (x, y, out = 0.004, k = 1) => {
    const r = profileAt(TORSO_PROFILE, clamp((y - yb) / H, 0, 1)) * k, rx = D.wT * r, rz = D.dT * r;
    return [x, y, rz * Math.sqrt(Math.max(0, 1 - (x / Math.max(1e-3, rx)) ** 2)) + out];
  };
  const back = (x, y, out = 0.004, k = 1) => { const q = front(x, y, out, k); q[2] = -q[2]; return q; };
  const onTop = (x, out = 0.004) => [x, topAt(D, yb, H, x) + out, 0];
  switch (f) {
    case 'hoodie': {
      const dk = darker(o.shirt, 0.86);
      // the hood lies folded on the upper back, low enough to stay out of the back of the head
      p.add(sphere(14, 9), dk, { sx: 0.18 * (D.wT / 0.24), sy: 0.095, sz: 0.1, y: T - 0.085, z: -D.dT * 0.84, rx: 0.35 });
      p.add(sphere(12, 8), dk, { sx: 0.15 * (D.wT / 0.24), sy: 0.075, sz: 0.055, y: 0.0, z: D.dT * 0.9 });
      p.add(torusGeo(0.1, 0.02, TAU, 5, 16), dk, { y: T - 0.02, rx: Math.PI / 2, z: 0.0, sx: nk, sy: nk });
      break;
    }
    case 'overalls': {
      p.add(lathe('overall20', OVERALL_PROFILE, 20), o.pants, { sx: D.wT, sy: H * 0.5, sz: D.dT, y: yb });
      p.add(sphere(12, 8), o.pants, { sx: 0.11 * (D.wT / 0.24), sy: 0.095, sz: 0.04, y: 0.2, z: D.dT * 0.93 });
      p.add(sphere(8, 6), darker(o.pants, 0.8), { sx: 0.04, sy: 0.03, sz: 0.02, y: 0.2, z: D.dT * 1.0 });
      for (const s of [-1, 1]) { // the straps run up the chest, over the top of the shoulder (inside the arm's ball) and down the back
        const x = s * D.wT * 0.42, a = front(s * D.wT * 0.4, T - 0.12, 0.012), b = onTop(x, 0.014), c = back(s * D.wT * 0.42, T - 0.12, 0.012);
        p.rod([s * 0.1 * (D.wT / 0.24), 0.3, D.dT * 0.88], a, 0.017, o.pants);
        p.rod(a, b, 0.017, o.pants); p.rod(b, c, 0.017, o.pants);
        p.add(sphere(8, 6), '#f2c14e', { sx: 0.022, sy: 0.022, sz: 0.018, x: s * 0.1 * (D.wT / 0.24), y: 0.3, z: D.dT * 0.93 });
      }
      break;
    }
    case 'coat': {
      const c = o.coat || o.shirt;
      p.add(lathe('coat', COAT_PROFILE, 22), c, { sx: D.wT * 1.12, sy: 0.5, sz: D.dT * 1.15, y: yb - 0.28, opts: { side: 'double' }, tag: 'outer', name: 'coat' });
      if (!o.trench) {
        p.add(sphere(10, 8), o.shirt, { sx: 0.075, sy: 0.1, sz: 0.03, y: T - 0.215, z: D.dT * 0.9, tag: 'inner', name: 'coat shirt' }); // (its top stays under the collar)
        p.add(torusGeo(0.115, 0.035, TAU, 5, 18), darker(c, 0.8), { y: T - 0.06, rx: Math.PI / 2, sx: nk, sy: nk, tag: 'outer', name: 'coat collar' });
      }
      p.add(cylGeo(0.012, 0.012, 0.52, 5), darker(c, 0.7), { y: 0.03, z: D.dT * 0.99 });
      for (let i = 0; i < 3; i++) p.add(sphere(6, 5), darker(c, 0.5), { sx: 0.018, sy: 0.018, sz: 0.012, x: 0.04, y: 0.14 - i * 0.12, z: D.dT * 1.0 });
      if (o.trench) trenchBits(p, o, D, T, yb, H, front, nk, c);
      break;
    }
    case 'suit': case 'blazer': case 'tux': case 'jacket': jacketTorso(p, o, D, T, yb, H, front, nk); break;
    case 'vest': {
      const c = o.shirt;
      shirtFront(p, o, D, T, front, 'collar', nk);
      // a V-necked waistcoat a little over the shirt, down over the waistband
      const gap = y => (y < 0.42 ? 0.03 : lerp(0.03, 0.72, smooth((y - 0.42) / 0.5)));
      const prof = [[1.05, -0.2], [1.035, -0.08], ...TORSO_PROFILE.filter(q => q[1] > 0 && q[1] < 0.9).map(q => [q[0] * 1.035, q[1]])];
      p.add(openLathe('vest', prof, gap, () => Math.PI, 12), c, { sx: D.wT, sy: H, sz: D.dT, y: yb, tag: 'outer', name: 'vest' });
      for (let i = 0; i < 4; i++) p.add(S, darker(c, 0.6), { sx: 0.014, sy: 0.014, sz: 0.01, ...xyz(front(0, yb + H * (0.05 + i * 0.1), 0.012, 1.035)) });
      for (const s of [-1, 1]) p.add(S, darker(c, 0.78), { sx: 0.045, sy: 0.008, sz: 0.006, ...xyz(front(s * D.wT * 0.45, yb + H * 0.12, 0.01, 1.035)) });
      neckTie(p, o, D, T, yb, H, front, { gap, k: 1.035 });
      break;
    }
    case 'gown': {
      if (o.robe) { robeBits(p, o, D, T, yb, H, front, nk); break; }
      // a fitted bodice with a soft neckline band and a sash at the waist (the skirt hangs from the hips)
      p.add(torusGeo(0.105, 0.017, TAU, 5, 16), lighter(o.shirt, 0.25), { y: T - 0.035, rx: Math.PI / 2, sx: nk, sy: nk });
      const sash = o.tieColor;
      p.add(lathe('sash', smoothProfile([[1.0, 0], [1.02, 0.5], [1.0, 1]], 6), 20), sash, { sx: D.wT * 1.015, sy: 0.07, sz: D.dT * 1.02, y: yb + 0.005 });
      p.add(S, darker(sash, 0.85), { sx: 0.05, sy: 0.04, sz: 0.03, ...xyz(front(D.wT * 0.35, yb + 0.04, 0.01)) });
      break;
    }
    default: // tee, dress, skirt, tank
      p.add(torusGeo(0.105, 0.017, TAU, 5, 16), darker(o.shirt, 0.82), { y: T - 0.035, rx: Math.PI / 2, sx: nk, sy: nk });
  }
  if (o.pocket && o.pocket !== 'none' && (JACKETS.has(f) || f === 'vest')) pocketBit(p, o, D, yb, H, front);
}
const xyz = a => ({ x: a[0], y: a[1], z: a[2] });
// the top of the shoulders above sideways offset x (the height where the torso's dome is that wide), chest frame (avatar-fit)
function topAt(D, yb, H, x) {
  let v = 0.995;
  while (v > 0.6 && D.wT * profileAt(TORSO_PROFILE, v) < Math.abs(x)) v -= 0.0025;
  return yb + v * H;
}

// The trench coat (o.trench on the coat outfit, the Detective): belt and buckle, turned-up collar and open lapels, shirt and tie
// in the neck, two rows of buttons. All of it goes into the chest's one Part (no new mesh).
function trenchBits(p, o, D, T, yb, H, front, nk, c) {
  const S = sphere(10, 7), dk = darker(c, 0.6), bw = darker(c, 0.55), lap = darker(c, 0.84);
  // the belt: a dark band round the waist and a brass buckle a little off the middle
  const yB = yb + 0.06;
  p.add(lathe('trench-belt', smoothProfile([[1.0, 0], [1.02, 0.5], [1.0, 1]], 6), 20), bw, { sx: D.wT * 1.07, sy: 0.07, sz: D.dT * 1.1, y: yB - 0.035 });
  const bq = front(D.wT * 0.14, yB, 0.03, 1.07);
  p.add(boxGeo(), '#c9a24a', { sx: 0.075, sy: 0.075, sz: 0.014, ...xyz(bq) });
  p.add(boxGeo(), bw, { sx: 0.042, sy: 0.042, sz: 0.016, x: bq[0], y: bq[1], z: bq[2] + 0.002 });
  // the open neck: a V of shirt with the collar points and the top of the tie in it (the rest of the tie is under the coat)
  const v = front(0, T - 0.13, 0.008);
  p.add(coneGeo(3), o.shirt, { x: v[0], y: v[1], z: v[2], sx: 0.1, sy: 0.17, sz: 0.012, rz: Math.PI, rx: -0.3, tag: 'inner', name: 'trench shirt V' });
  for (const s of [-1, 1]) { const a = front(s * 0.05, T - 0.07, 0.018); p.add(coneGeo(4), o.shirt, { x: a[0], y: a[1], z: a[2], sx: 0.045, sy: 0.07, sz: 0.012, rz: s * 2.55, rx: -0.35, tag: 'inner', name: 'trench collar point' }); }
  if (o.tie !== 'none') {
    const k = front(0, T - 0.085, 0.024), m = front(0, T - 0.16, 0.02);
    p.add(S, darker(o.tieColor, 0.85), { sx: 0.024, sy: 0.022, sz: 0.016, ...xyz(k), tag: 'inner', name: 'trench tie' });
    p.add(S, o.tieColor, { sx: 0.03, sy: 0.07, sz: 0.008, x: m[0], y: m[1], z: m[2], rx: -0.3, tag: 'inner', name: 'trench tie' });
  }
  // the lapels lie on the coat either side of the V, and the collar turns up round the back of the neck, low enough that a head
  // tipped back clears it
  const v0 = Math.round(((T - 0.26 - yb) / H) * 200) / 200, top = 0.93;
  const lprof = TORSO_PROFILE.filter(q => q[1] >= v0 - 0.02 && q[1] <= top).map(q => [q[0] * 1.022, q[1]]);
  const g0 = v => lerp(0.05, 0.5, smooth((v - v0) / (top - v0)));
  p.add(openLathe('trench-lap|' + v0, lprof, g0, v => g0(v) + 0.02 + 0.3 * smooth((v - v0) / 0.22), 5), lap, { sx: D.wT, sy: H, sz: D.dT, y: yb, tag: 'outer', name: 'trench lapels' });
  p.add(torusGeo(0.12, 0.04, Math.PI * 1.3, 5, 18), lap, { y: T - 0.045, rx: Math.PI / 2, rz: Math.PI / 2 + Math.PI * 0.35, sx: nk * 1.12, sy: nk * 1.12, sz: 1.05, tag: 'outer', name: 'trench collar' });
  // a second row of buttons (double-breasted), and the epaulettes lying along the top of the shoulders
  for (let i = 0; i < 3; i++) p.add(S, dk, { sx: 0.017, sy: 0.017, sz: 0.012, x: -0.06, y: 0.14 - i * 0.12, z: D.dT * 1.0 });
  for (const s of [-1, 1]) {
    const x = s * D.wT * 0.5, y = topAt(D, yb, H, x), slope = (topAt(D, yb, H, x + s * 0.02) - topAt(D, yb, H, x - s * 0.02)) / 0.04;
    p.add(boxGeo(), lap, { sx: 0.085, sy: 0.014, sz: 0.05, x, y: y + 0.004, z: 0, rz: s * Math.atan(slope) });
  }
}

// The robe (o.robe on the gown outfit, the Cultist): round neck, a knotted cord belt and an amulet. The long wide sleeves are
// human.js's (outfitSpec robe).
function robeBits(p, o, D, T, yb, H, front, nk) {
  const S = sphere(10, 7), cord = o.tieColor, gold = '#d9b54a';
  p.add(torusGeo(0.11, 0.024, TAU, 5, 16), darker(o.shirt, 0.75), { y: T - 0.03, rx: Math.PI / 2, sx: nk, sy: nk });
  // a high soft collar of the hood's cloth round the neck (the hood comes down over it), and the cloth falls onto the shoulders
  const nr = D.neckR || 0.0875;
  p.add(cylGeo(nr * 1.45, nr * 1.9, 0.15, 14), o.shirt, { y: T + 0.03 });
  // the capelet: its edge stays inside the shoulders' balls so the arms don't swing through it
  p.add(lathe('robe-cape', smoothProfile([[0.42, 1], [0.7, 0.8], [0.98, 0.42], [1.06, 0]], 10), 22), o.shirt, { sx: D.wT * 1.0, sy: 0.13, sz: D.dT * 1.1, y: T - 0.1 });
  p.add(lathe('robe-cord', smoothProfile([[1.0, 0], [1.03, 0.5], [1.0, 1]], 6), 20), cord, { sx: D.wT * 1.02, sy: 0.035, sz: D.dT * 1.04, y: yb + 0.01 });
  const k = front(D.wT * 0.3, yb + 0.03, 0.02);
  p.add(S, darker(cord, 0.85), { sx: 0.035, sy: 0.03, sz: 0.03, ...xyz(k) });
  for (const [dx, len] of [[-0.012, 0.2], [0.018, 0.16]]) {
    p.rod([k[0] + dx, k[1] - 0.01, k[2]], [k[0] + dx * 2.2, k[1] - len, k[2] + 0.025], 0.009, cord);
    p.add(S, darker(cord, 0.75), { sx: 0.018, sy: 0.026, sz: 0.018, x: k[0] + dx * 2.2, y: k[1] - len - 0.012, z: k[2] + 0.025 });
  }
  // the amulet: its cord round the neck down to a disc on the breastbone
  const am = front(0, T - 0.22, 0.016);
  for (const s of [-1, 1]) p.rod(front(s * 0.075, T - 0.05, 0.01), [am[0] + s * 0.012, am[1] + 0.04, am[2]], 0.006, '#2a2228');
  p.add(cylGeo(0.042, 0.042, 0.014, 14), gold, { ...xyz(am), rx: Math.PI / 2 });
  p.add(S, '#1e3a2e', { sx: 0.022, sy: 0.014, sz: 0.008, x: am[0], y: am[1], z: am[2] + 0.008 });
  p.add(S, '#c9f27a', { sx: 0.007, sy: 0.009, sz: 0.004, x: am[0], y: am[1], z: am[2] + 0.014 });
}

// the shirt under a jacket: collar points, a placket with buttons, and for the work jacket a white tee at the neck.
// band: [ring radius, tube, depth under T] of the band round the neck. Under a jacket the band lies inside the collar's tube (its
// five-sided cross-section's inner circle, 0.03 x cos 36 deg, less a margin), so it shows only in the open V.
const BAND = [0.098, 0.02, 0.03], BAND_WORK = [0.104, 0.017, 0.03], BAND_SUIT = [0.102, 0.016, 0.034];
function shirtFront(p, o, D, T, front, kind, nk = 1, band = BAND) {
  const c = o.inner, S = sphere(10, 7);
  if (kind === 'tee') { p.add(torusGeo(0.105, 0.017, TAU, 5, 16), darker(c, 0.85), { y: T - 0.035, rx: Math.PI / 2, sx: nk, sy: nk, tag: 'inner', name: 'tee band' }); return; }
  const [px, pw, pl] = band === BAND_SUIT ? [0.038, 0.037, 0.068] : [0.045, 0.045, 0.075]; // (under a suit's lapels: a touch smaller and in, all in the V)
  for (const s of [-1, 1]) { // collar points, folded down either side of the throat
    const a = front(s * px, T - 0.075, 0.012);
    p.add(coneGeo(4), c, { x: a[0], y: a[1], z: a[2], sx: pw, sy: pl, sz: 0.012, rz: s * 2.55, rx: -0.35, tag: 'inner', name: 'collar point' });
  }
  p.add(torusGeo(band[0], band[1], TAU, 5, 16), c, { y: T - band[2], rx: Math.PI / 2, sx: nk, sy: nk, tag: 'inner', name: 'shirt band' }); // the band round the neck
  if (kind === 'work') {
    const t = front(0, T - 0.09, 0.006);
    p.add(coneGeo(4), '#f4f1ea', { sx: 0.042, sy: 0.05, sz: 0.01, x: t[0], y: t[1] + 0.01, z: t[2], rz: Math.PI, ry: Math.PI / 4, tag: 'inner', name: 'work tee' }); // the white tee in the open neck
  }
}

// the tie, bow tie or skinny tie down the shirt front. over: { gap(v), k } the opening of a jacket or vest (half-angle at profile
// height v, cloth radius over the torso's). The tie stops where the opening gets narrower than it, else it hangs to its tip.
function neckTie(p, o, D, T, yb, H, front, over = null) {
  const kind = o.tie, c = o.tieColor, S = sphere(10, 7);
  if (!kind || kind === 'none') return;
  const k = front(0, T - 0.085, 0.022);
  if (kind === 'bow') {
    p.add(coneGeo(8), c, { sx: 0.06, sy: 0.085, sz: 0.035, x: -0.052, y: k[1], z: k[2], rz: Math.PI / 2, tag: 'inner', name: 'tie' });
    p.add(coneGeo(8), c, { sx: 0.06, sy: 0.085, sz: 0.035, x: 0.052, y: k[1], z: k[2], rz: -Math.PI / 2, tag: 'inner', name: 'tie' });
    p.add(S, darker(c, 0.75), { sx: 0.024, sy: 0.024, sz: 0.022, x: 0, y: k[1], z: k[2] + 0.005, tag: 'inner', name: 'tie' });
    return;
  }
  const w = kind === 'skinny' ? 0.028 : 0.043;
  p.add(S, darker(c, 0.85), { sx: 0.026, sy: 0.024, sz: 0.018, x: 0, y: k[1], z: k[2], tag: 'inner', name: 'tie' }); // the knot
  // the blade, laid down the chest in two leaves so it follows the curve of the shirt
  let ys = [T - 0.095, T - 0.2, yb + H * 0.3, yb + H * 0.1], cut = false;
  if (over) for (let v = (T - 0.2 - yb) / H; v >= 0.1; v -= 0.005) {
    if (D.wT * over.k * profileAt(TORSO_PROFILE, v) * Math.sin(over.gap(v)) >= w * 0.6 + 0.02) continue; // (2 cm to spare: seen from the side the tie, a centimetre off the shirt, is not over the opening's edge)
    const yEnd = yb + (v + 0.01) * H; ys = ys.filter(y => y > yEnd + 0.02).concat([yEnd]); cut = true; break;
  }
  const pts = ys.map(y => front(0, y, 0.01));
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[1] - a[1], b[2] - a[2]), ang = Math.atan2(a[2] - b[2], a[1] - b[1]);
    p.add(S, c, { x: 0, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, sx: w * [0.72, 0.92, 1.08][i], sy: len * 0.62, sz: 0.008, rx: -ang, tag: 'inner', name: 'tie' });
  }
  if (cut) return;
  const tip = front(0, yb + H * 0.1, 0.01);
  p.add(coneGeo(4), c, { x: 0, y: tip[1] - 0.012, z: tip[2] + 0.004, sx: w * 0.95, sy: 0.04, sz: 0.01, rz: Math.PI, ry: Math.PI / 4, tag: 'inner', name: 'tie' });
}

// a jacket's collar round the back of the neck and forward to the V's edge (half-angle a at the top). Its ends are rounded so the
// shirt's band inside the tube (BAND_WORK / BAND_SUIT) doesn't show.
function wrapCollar(p, col, R, r, y, a, nk, name) {
  const e = a + (r / R) * 0.9, arc = TAU - 2 * e;
  p.add(torusGeo(R, r, arc, 5, 20), col, { y, rx: Math.PI / 2, rz: Math.PI * 1.5 - arc / 2, sx: nk, sy: nk, tag: 'outer', name });
  for (const s of [-1, 1]) p.add(sphere(10, 7), col, { x: s * R * nk * Math.sin(e), y, z: R * nk * Math.cos(e), sx: r * nk, sy: r, sz: r * nk, tag: 'outer', name: 'collar tip' });
}
const JACKET_TOP = 1.01, LAPEL_TOP = 0.97; // (the torso's profile height the jacket reaches: all the way up, under the collar and the neck; its lapels to inside the collar's tube)
// Suit, blazer, tuxedo and the work jacket: the shirt (and tie) underneath, an open-fronted jacket over it
// that reaches down over the hips, lapels (satin on a tux), buttons and pockets.
function jacketTorso(p, o, D, T, yb, H, front, nk) {
  const f = o.outfit, c = o.shirt, S = sphere(10, 7);
  const work = f === 'jacket';
  shirtFront(p, o, D, T, front, work ? 'work' : f === 'blazer' && o.tie === 'none' ? 'tee' : 'collar', nk, work ? BAND_WORK : BAND_SUIT);
  if (f === 'tux') for (let i = 0; i < 3; i++) p.add(S, '#1e1e24', { sx: 0.011, sy: 0.011, sz: 0.008, ...xyz(front(0, T - 0.16 - i * 0.07, 0.006)) });
  if (work) { // a placket and buttons down the work shirt
    p.rod(front(0, T - 0.12, 0.004), front(0, yb + 0.02, 0.004), 0.008, darker(o.inner, 0.85));
    for (let i = 0; i < 3; i++) p.add(S, darker(o.inner, 0.7), { sx: 0.012, sy: 0.012, sz: 0.008, ...xyz(front(0.012, T - 0.16 - i * 0.1, 0.009)) });
  }
  // the jacket's hem sits out over the pelvis (as wide as the wider of torso and hips)
  const k = Math.round(Math.max(1.05, (1.08 * (D.hipX + 0.112)) / D.wT) * 50) / 50;
  const low = [[k * 1.01, -0.36], [k, -0.22], [lerp(k, 1.03, 0.6), -0.08]];
  // up over the shoulders to the neck (JACKET_TOP), so no ring of shirt shows round the collar (docs/refs/andrew-collar-overlap.jpg)
  const prof = [...low, ...TORSO_PROFILE.filter(q => q[1] > 0.02 && q[1] < JACKET_TOP).map(q => [q[0] * 1.035, q[1]])];
  // how far open the front is at each height (half-angle): buttoned at the waist, a V up to the collar
  const gap = work ? (y => lerp(0.36, 0.62, smooth((y + 0.36) / 1.3)))
    : f === 'blazer' ? (y => (y < 0.25 ? lerp(0.3, 0.1, smooth((y + 0.36) / 0.6)) : lerp(0.1, 0.6, smooth((y - 0.25) / 0.62))))
      : (y => (y < 0.28 ? lerp(0.24, 0.05, smooth((y + 0.36) / 0.62)) : lerp(0.05, 0.6, smooth((y - 0.28) / 0.6))));
  if (!work) neckTie(p, o, D, T, yb, H, front, { gap, k: 1.035 });
  const key = `${f}|${k}`;
  p.add(openLathe('jk|' + key, prof, gap, () => Math.PI, 18), c, { sx: D.wT, sy: H, sz: D.dT, y: yb, tag: 'outer', name: 'jacket' });
  if (work) {
    // a turned-down collar round the back of the neck, and two chest pockets with flaps
    wrapCollar(p, darker(c, 0.82), 0.11, 0.032, T - 0.03, gap(1), nk, 'work collar'); // (round to the V's edge: the shirt's band inside it)
    for (const s of [-1, 1]) {
      const q = front(s * D.wT * 0.7, T - 0.21, 0.004, 1.035), ry = Math.atan2(q[0] / (D.wT * D.wT), q[2] / (D.dT * D.dT)); // (turned to the cloth's normal)
      p.add(S, darker(c, 0.9), { sx: 0.05, sy: 0.05, sz: 0.008, ry, ...xyz(q) });
      p.add(S, darker(c, 0.8), { sx: 0.054, sy: 0.013, sz: 0.007, ry, x: q[0], y: q[1] + 0.042, z: q[2] + 0.002 });
    }
    for (const s of [-1, 1]) p.add(S, darker(c, 0.6), { sx: 0.012, sy: 0.012, sz: 0.008, ...xyz(front(s * D.wT * 0.62, yb + H * 0.3, 0.012, 1.035)) });
  } else {
    // lapels: a strip along the opening from the top button up to the collar, turned back over the chest
    const lap = f === 'tux' ? (luminance(c) < 0.18 ? '#3b3a48' : mixHex(c, '#15151c', 0.55)) : darker(c, 0.86);
    const top = LAPEL_TOP, from = f === 'blazer' ? 0.25 : 0.28;
    const lprof = prof.filter(q => q[1] >= from - 0.02 && q[1] <= top).map(q => [q[0] * 1.012, q[1]]);
    p.add(openLathe('lap|' + key, lprof, y => gap(y), y => gap(y) + 0.34 * smooth((y - from) / 0.28), 5), lap, { sx: D.wT, sy: H, sz: D.dT, y: yb, tag: 'outer', name: 'lapels' });
    wrapCollar(p, lap, 0.105, 0.03, T - 0.035, gap(1), nk, 'jacket collar'); // the collar round the back to the V's edge, where the lapels roll into it
    const nb = f === 'suit' ? 2 : 1;
    for (let i = 0; i < nb; i++) p.add(S, darker(c, 0.55), { sx: 0.015, sy: 0.015, sz: 0.01, ...xyz(front(D.wT * 0.12, yb + H * (0.2 - i * 0.12), 0.012, 1.035)) });
    for (const s of [-1, 1]) p.add(S, darker(c, 0.8), { sx: 0.06, sy: 0.01, sz: 0.008, ...xyz(front(s * D.wT * 0.55, yb - 0.06, 0.02, k * 0.985)) });
  }
}
const luminance = hex => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

// a pocket square or a flower on the left side of the chest
function pocketBit(p, o, D, yb, H, front) {
  const c = o.tieColor, q = front(D.wT * 0.5, yb + H * 0.72, 0.016, 1.035);
  if (o.pocket === 'square') {
    p.add(coneGeo(4), c, { x: q[0], y: q[1] + 0.012, z: q[2], sx: 0.03, sy: 0.04, sz: 0.008, ry: Math.PI / 4 });
    p.add(coneGeo(4), lighter(c, 0.2), { x: q[0] + 0.022, y: q[1] + 0.006, z: q[2], sx: 0.022, sy: 0.03, sz: 0.008, ry: Math.PI / 4 });
  } else {
    const S = sphere(8, 6), r = [q[0] - 0.035, q[1] + 0.04, q[2] + 0.004];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; p.add(S, c, { sx: 0.018, sy: 0.018, sz: 0.01, x: r[0] + Math.cos(a) * 0.017, y: r[1] + Math.sin(a) * 0.017, z: r[2] }); }
    p.add(S, '#f2c14e', { sx: 0.011, sy: 0.011, sz: 0.01, x: r[0], y: r[1], z: r[2] + 0.006 });
  }
}

// ---- skirts, dresses and gowns: a group on the hips (pivot at SKIRT_TOP) that human.js tilts and flares with the legs.
export function buildSkirt(o, D) {
  const f = o.outfit;
  if (f !== 'dress' && f !== 'skirt' && f !== 'gown') return null;
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.position.y = SKIRT_TOP;
  const sk = f === 'skirt' ? o.pants : o.shirt;
  const rx = D.hipX + 0.16, rz = D.dT + 0.06;
  const gown = f === 'gown';
  const len = gown ? D.legLen - 0.14 + SKIRT_TOP : 0.3, hem = gown ? 1.6 : 1.42;
  const prof = gown ? GOWN_PROFILE : SKIRT_PROFILE;
  // the cloth and the hem band are separate meshes with their own geometry: bodies-skirt.js bends them every frame
  const p = new Part(), q = new Part();
  p.add(lathe(gown ? 'gown' : 'skirt', prof, SKIRT_SEG), sk, { sx: rx, sy: len, sz: rz, y: -len, opts: { side: 'double' } });
  q.add(torusGeo(1, 0.03, TAU, 5, 28), darker(sk, 0.85), { sx: rx * hem, sy: rz * hem, sz: 1, y: -len, rx: Math.PI / 2 });
  const cg = p.build(), hg = q.build();
  g.add(cg, hg);
  return { group: g, len, hemRz: rz * hem, gown, prof, rx, rz, cloth: cg.children[0], hem: hg.children[0] };
}
export const SKIRT_SEG = 24; // columns round the skirt lathe (the cloth rig puts one control on each)

// ---- shoes: sneakers (the default), polished dress shoes, or work boots
export function buildShoe(fp, o, r) {
  if (o.wear && o.wear.shoe) return; // (clothing-store) bought shoes are clothing-wear.js's
  const S = sphere(14, 9), w = r / 0.085;
  switch (o.shoeKind) {
    case 'dress':
      fp.add(S, o.shoes, { sx: 0.092 * w, sy: 0.07, sz: 0.2, y: -0.03, z: 0.07 });
      fp.add(S, lighter(o.shoes, 0.55), { sx: 0.03 * w, sy: 0.018, sz: 0.05, y: 0.02, z: 0.13 }); // the shine on the toe
      fp.add(S, darker(o.shoes, 0.6), { sx: 0.095 * w, sy: 0.018, sz: 0.2, y: -0.09, z: 0.07 });
      fp.add(cylGeo(0.05 * w, 0.05 * w, 0.03, 10), darker(o.shoes, 0.6), { y: -0.085, z: -0.06 }); // the heel
      break;
    case 'boots':
      fp.add(cylGeo(r * 1.08, r * 1.12, 0.16, 12), o.shoes, { y: 0.04, z: 0.0 });            // the shaft round the ankle
      fp.add(S, o.shoes, { sx: 0.115 * w, sy: 0.095, sz: 0.19, y: -0.02, z: 0.065 });
      fp.add(torusGeo(r * 1.1, 0.012, TAU, 4, 12), darker(o.shoes, 0.7), { y: 0.1, rx: Math.PI / 2 });
      fp.add(S, '#3a2a1e', { sx: 0.12 * w, sy: 0.035, sz: 0.2, y: -0.09, z: 0.065 });          // a chunky sole
      break;
    default:
      fp.add(S, o.shoes, { sx: 0.108 * w, sy: 0.09, sz: 0.185, y: -0.012, z: 0.06 });
      fp.add(S, lighter(o.shoes, 0.72), { sx: 0.112 * w, sy: 0.03, sz: 0.19, y: -0.088, z: 0.062 });
  }
}
