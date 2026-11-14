// Poses for human.js. Every pose fills a Pose (a flat set of joint channels); the Human blends from the pose it was in
// to the new one, so nothing ever snaps. Angles are in radians and are "forward-positive":
//   pelvis/chest/head: pitch (rx, + leans forward / nods down), twist (ry, + turns left), roll (rz, + tips left)
//   arm: sw (swing forward from hanging), ab (out to the side), az (which way the swing plane faces), el (elbow bend), tw (twist)
//   leg: hp (thigh forward), kn (knee bend), an (toes up), hab (out to the side) - legs come from two-bone IK
//   face: eyeO (1 open, 0 shut), smile, mopen, brow (raise), btilt (+ angry), mw (mouth width)
import { clamp, lerp, smooth } from './bodies-geo.js';
import { footGround, tableAhead, REST_FACE, HIP_DROP, PALM_CLEAR, IK_WORLD } from './bodies-ik.js';

const TAU = Math.PI * 2;

export const POSE_KEYS = [
  'pdy', 'ppx', 'ppz', 'prx', 'pry', 'prz', 'crx', 'cry', 'crz', 'hrx', 'hry', 'hrz',
  'lsw', 'lab', 'laz', 'lel', 'ltw', 'rsw', 'rab', 'raz', 'rel', 'rtw', 'cross',
  'lhp', 'lhab', 'lkn', 'lan', 'rhp', 'rhab', 'rkn', 'ran', 'lld', 'rld',
  'hold', 'flick', 'eyeO', 'smile', 'mopen', 'brow', 'btilt', 'mw',
  'sqz', 'bry', 'brx', 'brz', 'bdy', 'bpy',
  'carry', 'cpit', 'cyaw', // carrying the rod: 1 = its angle is held in the chest's frame (not the hand's), plus a pitch/yaw wobble
  'lgrip', 'rgrip', 'lpoint', 'rpoint', // the hands: 0 open .. 1 a fist (relaxed HAND_REST), and the index finger out
  'lik', 'rik', // each arm's IK weight (the ask itself is h.ik.arm[i], bodies-ik.js ArmTarget: not blended, the weight fades)
  'shd', // how far (m) the shoulders sit lower than built: a touch down at ease
  'lca', 'rca', // each forearm's carrying angle: out from the upper arm's line about the elbow's forward axis (human.js keeps it only while the arm hangs)
  'psq', // the pelvis squashed onto what it sits on: 0 standing .. 1 its bottom level with the thighs' undersides (human.js)
];
export const HAND_REST = 0.24; // a hand at rest, a little curled
export const HAND_HOLD = 0.68; // a hand round something held (human.js: whatever hangs from its anchor)
// The standing idle's arm: nearly straight down, the elbow softly bent (16 degrees), out only as far as the clothes need. human.js
// tucks the cloth under it (armTuck) and finds each person's own abduction at build (h.idleAb). ab here is what the cloth is cut for.
export const IDLE_ARM = { sw: 0.06, el: 0.32, ab: 0.06 };
export const IDLE_SWAY = 0.01; // (the arm's swing forward and back as it breathes: the cloth's tuck and each person's arm allow for it)
export const IDLE_CA = 0.3; // the most the idle's forearm angles out past the hips (h.idleCa: each person's own, found at build; a real arm's is 10-15 degrees)

export class Pose {
  constructor() { for (const k of POSE_KEYS) this[k] = 0; this.legsSet = false; this.ikIn = [[0, 0, 0, 0], [0, 0, 0, 0]]; this.ikSet = [false, false]; this.reset(); }
  reset() {
    for (const k of POSE_KEYS) this[k] = 0;
    this.lab = this.rab = 0.14; this.lel = this.rel = 0.14;
    this.eyeO = 1; this.smile = 0.42; this.mw = 1;
    this.lgrip = this.rgrip = HAND_REST;
    this.legsSet = false;
    this.ikSet[0] = this.ikSet[1] = false; // (which legs went through ik() this pose, and with what: groundFeet re-solves them on the real ground)
  }
  copyFrom(o) { for (const k of POSE_KEYS) this[k] = o[k]; }
}

const KNOWN = new Set(['idle', 'loco', 'jump', 'wave', 'dance', 'cheer', 'sit', 'highfive', 'laugh', 'point', 'talk', 'pet', 'look', 'garden',
  'read', 'stretch', 'warm', 'shrug', 'startle', 'whisper', 'ballet', 'ballroom', 'hiphop', 'fish', 'cast', 'reel', 'hook', 'catch', 'throw', 'swing', 'swingfly', 'push', 'swim', 'climb', 'vault', 'sweep', 'drink', 'tiller', 'drive', 'ride', 'gaze', 'crouch', 'think', 'hammer', 'paint', 'reach', 'tinker', 'carry', 'lie']);
export const isKnownPose = n => KNOWN.has(n);

// ------------------------------------------------------------------ helpers

// Two-bone IK: put leg `i` (0 left, 1 right)'s ankle at (fx forward of the root, fy above the ground) with the hip
// hipH above the ground. fx is a ROOT-frame target: the pelvis' own offset and twist (ppz, pry) are taken out here so
// a planted foot stays planted while the pelvis rocks over it.
function ik(h, p, i, fx, fy, hipH, an = 0) {
  const D = h.dims, side = i === 0 ? 1 : -1;
  { const q = p.ikIn[i]; q[0] = fx; q[1] = fy; q[2] = hipH; q[3] = an; p.ikSet[i] = true; } // (remembered for groundFeet)
  // the whole body tips about the root (the pose's brx and the acceleration lean): aim the foot where it lands
  // once that tilt is applied, and keep the sole level with the ground
  const bx = p.brx + (h.leanX || 0);
  if (bx) { const cb = Math.cos(bx), sb = Math.sin(bx), fx0 = fx; fx = fx0 * cb - fy * sb; fy = fy * cb + fx0 * sb; an += bx; }
  fx = fx - p.ppz + side * D.hipX * Math.sin(p.pry);
  let dx = fx, dy = -(hipH - fy);
  let d = Math.hypot(dx, dy);
  const maxD = (D.Lt + D.Ls) * 0.9995, minD = Math.abs(D.Lt - D.Ls) + 0.03;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; } else if (d < minD) { d = minD; }
  const beta = Math.atan2(dx, -dy);
  const alpha = Math.acos(clamp((D.Lt * D.Lt + d * d - D.Ls * D.Ls) / (2 * D.Lt * d), -1, 1));
  const gamma = Math.acos(clamp((D.Lt * D.Lt + D.Ls * D.Ls - d * d) / (2 * D.Lt * D.Ls), -1, 1));
  if (i === 0) { p.lhp = beta + alpha; p.lkn = Math.PI - gamma; p.lan = an; p.lld = d; } else { p.rhp = beta + alpha; p.rkn = Math.PI - gamma; p.ran = an; p.rld = d; }
  p.legsSet = true;
}
const hipHeight = (h, p) => h.dims.legLen + p.pdy;

// Under a skirt or gown the swing thigh never comes up past `cap` (a high knee would come through the waist of the
// skirt): the thigh stops there and the knee folds more instead, so the foot keeps its height (no scuffing) and flicks
// up behind under the hem. w (0..1) eases it in as the foot leaves the ground and out as it lands.
function skirtKnee(h, p, i, cap0, w) {
  const D = h.dims, L = i === 0, hp = L ? p.lhp : p.rhp;
  const cap = lerp(hp, cap0, w); // eased off as the foot comes down, so it lands where the stride planned
  if (!(hp > cap0) || w <= 0) return;
  const kn = L ? p.lkn : p.rkn;
  const ay = -D.Lt * Math.cos(hp) - D.Ls * Math.cos(hp - kn); // the ankle's height under the hip (the IK's frame)
  const kn2 = Math.min(2.6, cap + Math.acos(clamp((-ay - D.Lt * Math.cos(cap)) / D.Ls, -1, 1)));
  const ld = Math.hypot(D.Lt * Math.sin(cap) + D.Ls * Math.sin(cap - kn2), -D.Lt * Math.cos(cap) - D.Ls * Math.cos(cap - kn2));
  if (L) { p.lhp = cap; p.lkn = kn2; p.lld = ld; } else { p.rhp = cap; p.rkn = kn2; p.rld = ld; }
}

// Stand with both feet flat under the hips (knees give a little).
function stand(h, p, sep = 0) {
  const hh = hipHeight(h, p), a0 = h.dims.a0;
  ik(h, p, 0, 0, a0, hh); ik(h, p, 1, 0, a0, hh);
  p.lhab = p.rhab = sep;
}

const armL = (p, sw, ab, el, az = 0, tw = 0) => { p.lsw = sw; p.lab = ab; p.lel = el; p.laz = az; p.ltw = tw; };
const armR = (p, sw, ab, el, az = 0, tw = 0) => { p.rsw = sw; p.rab = ab; p.rel = el; p.raz = az; p.rtw = tw; };
const bothArms = (p, sw, ab, el, az = 0, tw = 0) => { armL(p, sw, ab, el, az, tw); armR(p, sw, ab, el, az, tw); };

const wig = (t, f, ph = 0) => Math.sin(t * f + ph);
const hands = (p, l, r = l) => { p.lgrip = l; p.rgrip = r; }; // how closed each hand is, 0 open .. 1 a fist
const tri = x => 1 - Math.abs(((x % 1) + 1) % 1 * 2 - 1); // 0..1..0 over one unit
// a deterministic 0..1 from an integer (util.js's hash01, kept local: this module imports nothing of the game's)
const hash01 = n => { let x = (n * 374761393 + 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// ------------------------------------------------------------------ the run styles and the talking mouth
// Four run styles blended on the look's `gait` 0..1 (human.js gaitFor): 0 Scamper (kids, bouncy), 1/3 Light, 2/3 Lope, 1 Heavy.
// Human.update sets c.gi (which pair of neighbours) and c.gf (how far between them). gait4 blends one number for the four
// piecewise between neighbours, with no allocation.
export const GAIT_STYLES = ['scamper', 'light', 'lope', 'heavy'];
export const GAIT_LABELS = { scamper: 'Scamper', light: 'Light', lope: 'Lope', heavy: 'Heavy' };
export const gait4 = (c, a, b, d, e) => { const i = c.gi; const lo = i === 0 ? a : i === 1 ? b : d, hi = i === 0 ? b : i === 1 ? d : e; return lo + (hi - lo) * c.gf; };

// The talking mouth: words of 2-5 syllables (one a SLOT) with a pause after each, and a stress now and then (the brows come in on
// it). All from the person's own phase, so remote copies agree and no two people flap alike. Fills one scratch with no allocation:
// open 0..1, w (the mouth's width factor), stress 0..1, rest 1 between words.
const SLOT = 0.13, UNIT = 6; // s per syllable; slots per word-and-pause (a word of L syllables, then UNIT - L slots of rest)
const TALK = { open: 0, w: 1, stress: 0, rest: 1 };
export function talkAt(t, ph) {
  const seed = Math.floor(ph * 1000) | 0, s = t / SLOT, n = Math.floor(s), f = s - n;
  const u = Math.floor(n / UNIT), j = n - u * UNIT;
  const L = 2 + Math.floor(hash01(u * 13 + 1 + seed) * 4); // 2..5 syllables in this word
  if (j >= L) { TALK.open = 0; TALK.w = 1; TALK.stress = 0; TALK.rest = 1; return TALK; }
  const word = 0.7 + 0.3 * hash01(u * 13 + 2 + seed), amp = word * (0.55 + 0.45 * hash01(n * 7 + 3 + seed));
  const stress = hash01(n * 7 + 5 + seed) < 0.18 ? 1 : 0, bump = Math.sin(Math.PI * f);
  const floor = j > 0 && j < L - 1 ? 0.12 : 0; // (within a word the lips never quite close between syllables)
  TALK.open = floor + (Math.min(1, amp * (0.85 + 0.3 * stress)) - floor) * bump;
  TALK.w = 1 + 0.16 * (0.45 - TALK.open);
  TALK.stress = stress * bump; TALK.rest = 0;
  return TALK;
}

// ------------------------------------------------------------------ timing for cartoon motion
// back: 0..1 with an overshoot past 1 before it settles. A spring's step response, so it starts from rest (an ease-out-back starts
// at full speed and a hand jumps in its first frame). Peaks at x = 0.75, settles by about 1.4. `z` the damping (0.5: 16% over, 0.7: 5%)
const back = (x, z = 0.55) => {
  if (x <= 0) return 0; if (x >= 2.2) return 1;
  const wd = Math.PI / 0.75, w = wd / Math.sqrt(1 - z * z), e = Math.exp(-z * w * x);
  return 1 - e * (Math.cos(wd * x) + (z * w / wd) * Math.sin(wd * x));
};
// the way in: an overshoot over `dur` seconds starting `lag` seconds in (follow-through: what hangs off a joint arrives a moment later)
const inK = (c, dur, lag = 0) => back((c.a - lag) / dur);
// the way out: the emote's window (c.left, human.js emoteEnd) closes over its last `dur` seconds, lagging parts a little after the
// rest. No window (NPCs, a gesture held as long as asked): 1
const outK = (c, lag = 0, dur = 0.42) => (c.left === Infinity ? 1 : smooth((c.left + lag - 0.03) / dur));
// a looped emote's time: one cycle of `period` (the player's window holds exactly one; an NPC holding it longer repeats it)
const cyc = (c, period) => (c.left === Infinity ? c.a % period : c.a);
// anim-redo (2026-11-07): the cartoon toolkit the emotes share. bump: 0..1..0 over a unit (an anticipation's wind-up, a hop);
// antic: a wind-up `dur` long starting at t0; settle: a decaying wobble after a hit or a landing (f rad/s, z the decay);
// pulse: an on-the-beat bounce (|sin| with soft peaks); beatE: a beat's ease-out. Follow-through is a part sampled a beat late
// (inK's lag, a phase behind on a cycle): the poses are stateless, so nothing here keeps a velocity.
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI));
const antic = (a, t0, dur) => bump((a - t0) / dur);
const settle = (x, f = 14, z = 5) => (x <= 0 ? 0 : Math.exp(-z * x) * Math.sin(f * x));
const pulse = (x, sharp = 0.6) => Math.pow(Math.abs(Math.sin(x)), sharp);
const beatE = (x) => { const f = x - Math.floor(x); return 1 - (1 - f) * (1 - f) * (1 - f); }; // a beat's ease-out (quick off the beat, slowing to the next)
// the emotes with their own settle in and out (human.js blends into and out of these more gently)
export const EMOTES = new Set(['wave', 'cheer', 'dance', 'laugh', 'highfive', 'sit', 'point', 'shrug', 'talk', 'whisper', 'stretch', 'pet', 'startle', 'ballet', 'ballroom', 'hiphop', 'swim', 'gaze']); // (gaze, the morning's look up, stands at ease like an emote)
// the shoulders' height and the chest's base in the root's frame (unbent), and the partner's root in this one's (params.mate:
// world { x, z } of the person a high five or a dance is with; null: none)
const shoulderY = (h, p) => h.dims.legLen + p.pdy + h.dims.waist + h.dims.torsoTop - 0.105;
const _mate = { x: 0, z: 0, d: 0 };
function mateLocal(h) {
  const M = h.params.mate; if (!M) return null;
  const R = h.root.position, yaw = h.root.rotation.y, s = h.opts.scale, dx = M.x - R.x, dz = M.z - R.z;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  _mate.x = (dx * c - dz * sn) / s; _mate.z = (dx * sn + dz * c) / s; _mate.d = Math.hypot(_mate.x, _mate.z);
  return _mate;
}

// ------------------------------------------------------------------ the poses

// Standing at ease, the pose every gesture starts from and comes back to (not an A-pose: docs/refs/andrew-stiff-idle.jpg). Arms
// hang close by the sides, elbows soft, hands relaxed beside the thighs, weight on one leg. No IK, so nothing changes at the near
// LOD's line. Every 6-14 s the weight goes over to the other leg, with a glance and a look-down now and then. All of it from the
// person's own seed and the clock, so a remote copy agrees with itself.
const SHIFT_P = 10, TURN_P = 7.5, DOWN_P = 13; // s between weight shifts (+-2: 6-14), head turns (+-1.5), look-downs (+-2)
const shiftAt = (n, seed) => (n + 0.6) * SHIFT_P + 4 * (hash01(n * 7 + seed) - 0.5);
const turnAt = (m, seed) => (m + 0.4) * TURN_P + 3 * (hash01(m * 11 + 3 + seed) - 0.5);
const downAt = (m, seed) => (m + 0.8) * DOWN_P + 4 * (hash01(m * 17 + 5 + seed) - 0.5);
// the latest event of a schedule at or before t (the schedule's jitter is under half its period: the neighbour is enough)
function eventBefore(at, t, P, off, seed) { let n = Math.floor(t / P - off); if (at(n + 1, seed) <= t) n++; else if (at(n, seed) > t) n--; return n; }
// the free foot's own spot, drawn afresh each time it becomes the free one (a little forward, turned out a little)
const spotFx = (n, seed) => 0.0 + 0.045 * hash01(n * 5 + 1 + seed), spotHab = (n, seed) => 0.06 + 0.05 * hash01(n * 5 + 2 + seed);
function idle(h, c, p) {
  const t = c.t, ph = c.ph, seed = Math.floor(ph * 1000) | 0; // (the person's phase: the studio and the tiles set it after the build)
  const br = Math.sin(t * 2.2 + ph);
  p.pdy = br * 0.004 - 0.002;
  p.crx = 0.015 + br * 0.012; // (the chest rises with the breath in)
  const A = IDLE_ARM, ab = h.idleAb || [A.ab, A.ab], ca = h.idleCa || [0, 0], seated = (h.params.seatY || 0) > 0.15;
  p.lab = ab[0] + br * 0.008; p.rab = ab[1] + br * 0.008;
  p.lca = ca[0]; p.rca = ca[1]; // (the forearms angle out past the hips only as far as they must)
  p.shd = 0.012 - br * 0.002; // (the shoulders a touch down, rising a hair with each breath. 1.5 mm more puts the professor's read over avatar-fit's limit)
  const ws = Math.sin(t * 0.38 + ph * 1.7), wsm = Math.sign(ws) * Math.pow(Math.abs(ws), 0.6); // lingers on each side
  // the weight shift: n is the latest shift; even n put the weight on the right leg, odd on the left (before any: the left, as drawn)
  const n = eventBefore(shiftAt, t, SHIFT_P, 0.6, seed), since = t - shiftAt(n, seed), toRight = (n & 1) === 0;
  const k = smooth(since / 0.75), wL = toRight ? 1 - k : k, sd = 2 * wL - 1; // sd: 1 the weight on the left leg .. -1 on the right
  const dk = since > 0 && since < 0.75 ? 8 * (since / 0.75) * (1 - since / 0.75) * (toRight ? -1 : 1) : 0; // (anim-redo: how fast the weight is going over, signed toward +x: the head and chest trail it a hair)
  // (the hips a little over the standing leg, tipped a touch to the free one, and the chest takes the tilt back out so the shoulders
  // stay level. Kept small: more reads as a lean, docs/refs/andrew-idle-lean.jpg)
  p.ppx = 0.011 * sd + wsm * 0.006; p.prz = -0.015 * sd + wsm * 0.01; p.crz = -p.prz - 0.006 * dk;
  p.smile = 0.42 + br * 0.025; p.mw = 1 + br * 0.012; // (a closed mouth that is not frozen: the smile relaxes a hair and recovers with the breath)
  p.lsw = A.sw + wig(t, 0.9, ph) * IDLE_SWAY; p.rsw = A.sw + wig(t, 0.9, ph + 2) * IDLE_SWAY;
  p.lel = A.el + wig(t, 1.1, ph) * 0.03; p.rel = A.el + wig(t, 1.1, ph + 1) * 0.03;
  if (seated) { // the arms close and a little forward, the hands in the lap (docs/refs/andrew-stiff-sit.jpg for what not to do). Near
    // the camera seatRest puts each hand on the thigh, knee or seat by IK. These angles are what far folk show.
    const st = h.style || DEF_STYLE;
    p.lab = Math.max(ab[0], 0.08) + br * 0.006; p.rab = Math.max(ab[1], 0.08) + br * 0.006; p.lca = p.rca = 0; p.shd = 0.016 - br * 0.002;
    p.lsw = 0.42 + 0.1 * st[2] + wig(t, 0.9, ph) * 0.015; p.rsw = 0.42 + 0.1 * st[2] + wig(t, 0.9, ph + 2) * 0.015;
    p.lel = 0.62 + wig(t, 1.1, ph) * 0.02; p.rel = 0.62 + wig(t, 1.1, ph + 1) * 0.02;
    p.ppx = 0; p.prz = 0; p.crz = 0;
  } else if (h.params.table) for (let i = 0; i < 2; i++) { // (at a table, an arm holding something carries it out over the hips so it
    // clears the table's edge. Anywhere else a held thing hangs from an arm at ease like a free one)
    if (!(i ? h.handR : h.handL)?.children.length) continue;
    const abH = Math.max(0.15, h.abMinPose ?? h.fit?.abMin0 ?? 0.5) + br * 0.008, sw = 0.1 + wig(t, 0.9, ph + 2 * i) * 0.03, el = 0.4 + wig(t, 1.1, ph + i) * 0.03;
    if (i) { p.rab = abH; p.rca = 0; p.rsw = sw; p.rel = el; } else { p.lab = abH; p.lca = 0; p.lsw = sw; p.lel = el; }
  }
  const g = Math.sin(t * 0.31 + ph), g2 = Math.sin(t * 0.17 + ph * 2.3);
  p.hry = Math.sign(g) * Math.max(0, Math.abs(g) - 0.35) * 0.9 * (g2 > -0.2 ? 1 : 0.4);
  p.hrx = wig(t, 0.47, ph * 3) * 0.05; p.hrz = wig(t, 0.29, ph) * 0.03 - 0.012 * dk;
  p.hry -= p.cry * 0.5;
  { // a glance: the head turns to look at something (up to 40 degrees, either way), holds a moment and comes back
    const m = eventBefore(turnAt, t, TURN_P, 0.4, seed), u = t - turnAt(m, seed);
    const tk = smooth(u / 0.45) * (1 - smooth((u - 1.3) / 0.6)), yaw = (hash01(m * 11 + 4 + seed) < 0.5 ? -1 : 1) * (0.35 + 0.35 * hash01(m * 11 + 6 + seed));
    const wing = seated && h.params.chair ? 0.3 : 1; // (in a wing chair the wings stand by the head: only a small glance)
    p.hry += tk * yaw * wing; p.hrx -= 0.03 * tk; p.hrz += 0.04 * tk * yaw * wing;
    // ...and now and then a look down with the lids low (a blink lands in it as the blinks fall)
    const m2 = eventBefore(downAt, t, DOWN_P, 0.8, seed), u2 = t - downAt(m2, seed), dn = smooth(u2 / 0.35) * (1 - smooth((u2 - 1.1) / 0.5));
    p.hrx += 0.14 * dn; p.eyeO -= 0.45 * dn;
  }
  const hh = hipHeight(h, p), a0 = h.dims.a0;
  // the feet: each keeps its own spot, redrawn when it becomes the free foot (the left at the even shifts, the right at the odd ones);
  // the newly free foot lifts its toe a hair and settles on its new spot while the weight is going over (never while it bears weight)
  for (let i = 0; i < 2; i++) {
    const mine = i === 0 ? (n & 1) === 0 ? n : n - 1 : (n & 1) === 1 ? n : n - 1; // the latest shift that freed this foot
    const u = mine === n ? clamp((since - 0.2) / 0.45, 0, 1) : 1, mv = smooth(u), lift = Math.sin(Math.PI * u) * 0.018;
    const fx = lerp(spotFx(mine - 2, seed), spotFx(mine, seed), mv), hab = lerp(spotHab(mine - 2, seed), spotHab(mine, seed), mv);
    ik(h, p, i, fx, a0 + lift, hh, 0.12 * lift / 0.018); // (the toes up on the heel: the heel stays within the ankle's lift, so nothing goes under the ground)
    if (i) p.rhab = hab; else p.lhab = hab;
  }
  if (IK_WORLD.stiffIdle) { // (the old stiff stance, for before pictures: straight arms out, feet square)
    p.lab = p.rab = Math.max(0.15, h.fit?.abMin0 ?? 0) + br * 0.012; p.ppx = wsm * 0.02; p.prz = wsm * 0.03; p.crz = -p.prz * 0.9; p.crx = 0.01 + br * 0.012; p.shd = 0; p.lca = p.rca = 0;
    p.lsw = wig(t, 0.9, ph) * 0.05; p.rsw = wig(t, 0.9, ph + 2) * 0.05; p.lel = 0.16 + wig(t, 1.1, ph) * 0.03; p.rel = 0.16 + wig(t, 1.1, ph + 1) * 0.03;
    stand(h, p, 0.05);
  }
  // in an armchair the arms at rest lie on the armrests (every gesture starts from there and comes back to it)
  if (h.params.chair && (h.params.seatY || 0) > 0.15) chairArms(h, p);
}

// Walking and running. The gait numbers (stride, stance fraction, the reach S, the shortened leg Lre, the run style's
// neighbours gi / gf, kid, bound, brake) come from Human.update, where the cycle is advanced by distance travelled.
// The run blends the four styles (gait4 above). Joyce's power walk lies over the walk (params.power).
function loco(h, c, p) {
  const D = h.dims, run = c.runK, a0 = D.a0, fem = c.fem, kid = c.kid;
  const cyc = c.cyc, two = cyc * TAU;
  const wk = clamp(c.speed / 2, 0, 1), wl = wk * (1 - run); // (how much of a walk this is: the walk's own touches fade out into the run)
  const scK = run * (c.gi === 0 ? 1 - c.gf : 0); // (how much Scamper: the flap, the grin, the head up)
  const d = c.duty, S = c.S, Lre = c.Lre; // fraction of the cycle a foot is planted; half the distance it travels back
  const cc = cyc % 0.5;
  // hip height: walking, the pelvis rolls over the planted leg (a circle about the foot). Running, the leg takes the
  // landing and compresses at mid-stance, then the push-off throws the body into the air: real airtime, highest between
  // steps (a bound or a half-skip on a turn goes higher; Lope the longest flight, Scamper the bounciest for its stride)
  const flight = run * gait4(c, 0.17, 0.11, 0.18, 0.12) * (1 + 0.7 * c.bound);
  const u = cc < d ? cc / d : 0, tt = cc < d ? 0 : (cc - d) / (0.5 - d), air = flight * 4 * tt * (1 - tt);
  const Hw = cc < d ? Math.sqrt(Math.max(0.01, Lre * Lre - S * S * (1 - 2 * u) * (1 - 2 * u))) : Math.sqrt(Lre * Lre - S * S) + air;
  // the hip at touchdown and push-off: as high as the leg reaches to a foot S away, allowing for the body's lean
  // (the IK undoes the lean for the foot, so a leaning body with the foot behind it needs a longer leg)
  const brxRun = lerp(0.03, gait4(c, 0.05, 0.06, 0.1, 0.16), run) * wk, bx = brxRun + (h.leanX || 0), cb = Math.cos(bx), sb = Math.sin(bx), LL = D.Lr * 0.985;
  const H0 = Math.max(0.05, a0 * (cb - 1) - S * Math.abs(sb) + Math.sqrt(Math.max(0.01, LL * LL - (S * cb + a0 * Math.abs(sb)) ** 2)));
  const comp = gait4(c, 0.05, 0.03, 0.035, 0.055); // (the landing leg's compression: heavy feet land hard)
  p.brx = brxRun; // set before the IK (which undoes it for the feet); the rest of the lean is in the chest (crx)
  const Hr = cc < d ? H0 - comp * Math.sin(Math.PI * u) : H0 + air;
  const Hh = lerp(Hw, Hr, run);
  const brake = c.brake;
  p.pdy = Hh - D.Lr - 0.06 * brake;
  const hipH = hipHeight(h, p);
  const cs = Math.cos(two), sn = Math.sin(two);
  const sway = lerp(lerp(0.04, 0.065, fem), gait4(c, 0.075, 0.065, 0.06, 0.1), run);
  p.pry = -lerp(0.1, gait4(c, 0.13, 0.1, 0.13, 0.15), run) * cs * wk; p.prz = sway * sn * wk; p.ppx = 0.028 * sn * wk; // set before the IK, which needs them
  // the swing foot: the light style drives the knee forward (the foot peaks late and high), the heavy one flicks the
  // heel up behind (it peaks early); every foot lifts clear of the ground at once so nothing scuffs
  const gown = h.skirt ? 0.4 : 0; // a skirt or gown keeps the knees low (and inside it)
  const lift = lerp(0.085, gait4(c, 0.3, 0.27, 0.25, 0.21) * (1 - gown), run) * (0.5 + 0.5 * wk);
  const peak = lerp(0.85, gait4(c, 1.0, 1.3, 1.1, 0.6), run);
  const flick = gait4(c, 0, 0, 0.12, 0.25) * run, kick = gait4(c, 0.05, 0.05, 0.03, 0) * run; // (the heel flicked up behind; the foot kicked forward of its line)
  for (let i = 0; i < 2; i++) {
    const x = (cyc + i * 0.5) % 1;
    let fx, fy, an;
    if (x < d) {
      // the stance: the heel strikes toes-up and rolls flat, the heel comes up through the toe-off (the ankle rises with it, so
      // the toe stays on the ground as the foot pitches)
      const u = x / d, off = smooth((u - 0.64) / 0.36);
      fx = S * (1 - 2 * u); fy = a0 + lerp(0.03, 0.036, wl) * Math.pow(u, 4);
      an = lerp(0.32, 0.36, wl) * (1 - smooth(u / 0.26)) - lerp(0.55, 0.58, wl) * off;
    } else {
      // the swing: a Hermite curve whose end slopes match the stance, so the foot leaves the ground still travelling
      // back (and trails up behind) and paws back to the ground's speed before it lands: no velocity jump, no scuff
      const v = (x - d) / (1 - d), v2 = v * v, v3 = v2 * v, k = Math.min((1 - d) / d, 3);
      const e = (-2 * v3 + 3 * v2) - k * ((v3 - 2 * v2 + v) + (v3 - v2));
      fx = -S + 2 * S * e + kick * Math.sin(Math.PI * v);
      fy = a0 + lift * Math.sin(Math.PI * Math.pow(v, peak)) + 0.05 * run * Math.sin(Math.PI * v);
      an = lerp(-0.55 - flick, lerp(0.32, 0.36, wl), smooth(v * 1.15));
    }
    // a swinging foot stays within the leg's reach sideways-on (pulled in, not dragged down to a straight leg)
    const reach = D.Lr * 0.995, dyf = hipH - fy, mx = Math.sqrt(Math.max(0, reach * reach - dyf * dyf));
    if (Math.abs(fx) > mx) fx = Math.sign(fx) * mx;
    if (brake > 0.001) { // the skid: lead foot out front and dug in, the other behind, both flat on the ground
      const lead = i === 0;
      fx = lerp(fx, lead ? 0.3 : -0.16, brake); fy = lerp(fy, a0 + (lead ? 0 : 0.01), brake); an = lerp(an, lead ? 0.35 : -0.1, brake);
    }
    ik(h, p, i, fx, fy, hipH, an);
    if (gown) skirtKnee(h, p, i, h.skirt.gown ? 0.85 : 1.0, smooth((fy - a0 - 0.02) / 0.1)); // full only while the foot is up
  }
  p.lhab = p.rhab = 0.03 + 0.06 * brake;
  // arms swing against the legs: the shoulder leads a hair and swings forward a little quicker than back (a skewed sine), the
  // forearm lags it. Elbows pump wider in the heavy style, Scamper flaps its arms out
  const Aa = lerp(0.3 + 0.13 * clamp(c.speed, 0, 4.5), gait4(c, 0.75, 0.85, 0.95, 1.2), run) * wk + (1 - wk) * 0.05;
  const e0 = lerp(0.2, gait4(c, 0.95, 1.7, 1.3, 1.15), run), eK = lerp(0.3, gait4(c, 0.4, 0.22, 0.4, 0.55), run);
  const lead = 0.12 * (1 - run), csL = Math.cos(two + lead), skew = 0.07 * (1 - run) * Math.sin(2 * two), eLag = 0.75; // (more lag keeps the elbow bent at the back of the swing and puts a vest's forearm over the cloth limit)
  p.lsw = -Aa * (csL - skew); p.rsw = Aa * (csL + skew);
  p.lel = e0 + eK * 0.5 * (1 - Math.cos(two - eLag)) * wk; p.rel = e0 + eK * 0.5 * (1 - Math.cos(two - eLag + Math.PI)) * wk;
  // (no wrist by `tw`: in the elbow's YXZ order it swings a bent forearm round the upper arm, and the rig has no wrist joint to turn)
  p.lab = p.rab = lerp(0.14, gait4(c, 0.5, 0.1, 0.18, 0.34), run) + 0.06 * scK * Math.sin(2 * two + 1);
  p.laz = p.raz = gait4(c, 0, 0.12, 0.06, 0) * run; // elbows in: the light run's forearms cross a little in front
  // a power walk (params.power 0..1, Joyce's 6 am walk): elbows bent square, fists pumping well forward and back, a purposeful lean
  const pw = h.params.power || 0;
  if (pw > 0) {
    const A = (0.55 + 0.12 * clamp(c.speed, 0, 2.5)) * wk;
    p.lsw = lerp(p.lsw, 0.12 - A * cs, pw); p.rsw = lerp(p.rsw, 0.12 + A * cs, pw);
    p.lel = lerp(p.lel, 1.55 + 0.2 * Math.max(0, -cs) * wk, pw); p.rel = lerp(p.rel, 1.55 + 0.2 * Math.max(0, cs) * wk, pw);
    p.lab = lerp(p.lab, 0.24, pw); p.rab = lerp(p.rab, 0.24, pw); p.laz = p.raz = 0.1 * pw;
  }
  // pelvis twists with the stride, the chest against it, hips drop on the swinging side. The chest's pitch bobs a beat behind the
  // hips' rise (no shoulder bob: even 4 mm puts a plus hoodie's forearm over the cloth limit)
  const cryA = lerp(0.19, gait4(c, 0.15, 0.11, 0.18, 0.26), run) * wk; // (anim-redo: a touch more counter-rotation at a walk)
  p.cry = cryA * cs; p.crz = -p.prz * 0.8 + gait4(c, 0.02, 0, 0.02, 0.05) * run * sn + 0.012 * wl * Math.sin(two - 0.6); // (the shoulders dip a hair toward the planted side, a beat behind the hips)
  p.sqz = 0.18 * air * run; // (anim-redo: a little stretch through the body in a run's flight; the landing's compression is in the hips)
  p.crx = 0.03 + gait4(c, 0.08, 0.1, 0.14, 0.22) * run + 0.02 * wk * Math.cos(two * 2 - 0.4);
  // the head: it answers the chest's twist a beat late and not quite all of it (a steady head on Light and Lope, bobbing
  // with each step on Heavy and Scamper; Scamper's up and looking ahead), and wanders a little on a walk
  const bob = lerp(0.02, gait4(c, 0.05, 0.02, 0.02, 0.06), run);
  p.hry = -cryA * Math.cos(two - 0.55) * 0.5 - p.pry * 0.2 + 0.05 * wl * Math.sin(c.t * 0.6 + c.ph); // (anim-redo: the head a little further behind the chest)
  p.hrx = -p.crx * 0.6 + bob * Math.cos(two * 2) - 0.08 * scK; p.hrz = -p.crz;
  // the face: a grin on Scamper, the mouth open with the effort (more on Heavy), shut for a breath now and then
  const breath = smooth((Math.sin(c.t * 0.7 + c.ph) - 0.55) / 0.3);
  p.smile = 0.46 + 0.5 * run + 0.3 * scK;
  p.mopen = gait4(c, 0.15, 0.2, 0.2, 0.36) * run * (0.75 + 0.25 * Math.sin(c.t * 2.1 + c.ph)) * (1 - 0.85 * breath);
  p.eyeO = 1 + 0.08 * run * gait4(c, 1, 1, 0.3, 0);
  if (pw > 0) { p.crx += 0.06 * pw; p.prz *= 1 + 0.6 * pw; p.smile = Math.max(p.smile, 0.7); }
  if (brake > 0.001) { // skid: lean back, arms out, eyes wide
    p.brx = lerp(p.brx, -0.22, brake); p.crx = lerp(p.crx, -0.08, brake); p.hrx = lerp(p.hrx, 0.12, brake);
    p.lab = lerp(p.lab, 0.95, brake); p.rab = lerp(p.rab, 0.95, brake); p.lsw = lerp(p.lsw, 0.35, brake); p.rsw = lerp(p.rsw, 0.35, brake);
    p.lel = lerp(p.lel, 0.35, brake); p.rel = lerp(p.rel, 0.35, brake); p.cry *= 1 - brake; p.pry *= 1 - brake;
    p.eyeO = lerp(p.eyeO, 1.3, brake); p.mopen = lerp(p.mopen, 0.5, brake); p.mw = lerp(p.mw, 0.7, brake); p.brow = 0.5 * brake;
  }
}

function jump(h, c, p) {
  const jv = clamp(c.vy / 5.6, -1, 1); // + rising, - falling
  const a0 = h.dims.a0, hh = hipHeight(h, p);
  const rise = smooth((jv + 0.15) / 1.0);
  bothArms(p, lerp(0.15, 0.55, rise), lerp(0.75, 1.55, rise), lerp(0.55, 0.3, rise));
  // a tucked, kicking spring while going up, feet reaching for the ground coming down
  ik(h, p, 0, lerp(0.02, 0.16, rise), a0 + lerp(0.01, 0.22, rise), hh, lerp(0.1, -0.5, rise));
  ik(h, p, 1, lerp(0.03, -0.07, rise), a0 + lerp(0.01, 0.1, rise), hh, lerp(0.1, -0.4, rise));
  p.lhab = p.rhab = 0.1;
  p.sqz = 0.05 * Math.max(0, jv) - 0.02;
  p.crx = -0.05 * jv; p.hrx = -0.12 * jv; p.brx = 0.05 * (1 - rise);
  p.eyeO = 1.12; p.smile = 1.0; p.mopen = 0.3;
  hands(p, 0.1);
}

// Wave (2.4 s; anim-redo): a wind-up first (the shoulder dips and the hand draws back a touch), then the arm swings up in an arc
// (forward on the way, overshooting and settling) with the forearm a beat behind, to stand upright beside the head (a carrying angle
// in the arm's own plane, so the hand stays clear of the face). It rocks from the elbow with the open hand trailing, and the whole
// body takes part: the weight goes over onto the far leg, the chest rolls away and bobs with each rock, the head tilts and nods
// along, the other arm swings back a hair for balance. The forearm drops first on the way down, the body settles after it.
function wave(h, c, p) {
  idle(h, c, p);
  const a = c.a, o = outK(c), oL = outK(c, 0.08), k = inK(c, 0.45, 0.08) * oL, kL = inK(c, 0.45, 0.17) * o; // (on the way out the forearm drops first)
  const ant = antic(a, 0, 0.24) * o; // the wind-up: a dip, the hand drawn back
  const dip = ant * 0.7 + (1 - o) * Math.sin(clamp(1 - c.left / 0.42, 0, 1) * Math.PI) * 0.4;
  const rock = smooth((a - 0.32) / 0.25) * o;
  const w = Math.sin((a - 0.35) * 10.5) * rock;          // the rock, once the arm is up
  const wl = Math.sin((a - 0.35) * 10.5 - 1.0) * rock;   // the hand a beat behind it
  const arc = bump(k) * (1 - smooth((a - 0.6) / 0.2));   // the hand swings forward on its way up (an arc, not a straight lift)
  p.pdy -= 0.014 * dip + 0.006 * Math.max(0, w) * k;     // (the knees give a little with each rock)
  p.ppx += 0.02 * k; p.prz -= 0.02 * k; p.crz += -0.05 * dip + 0.09 * k; p.crx += 0.03 * dip - 0.02 * k;
  p.shd -= 0.004 * k;
  p.rab = lerp(p.rab, 2.05 + 0.05 * w, k); p.rsw = lerp(p.rsw - 0.22 * ant, 0.3 + 0.3 * arc + 0.03 * w, k); p.raz = 0;
  p.rel = lerp(p.rel + 0.25 * ant, 0.12, k); p.rca = lerp(p.rca, 0.98 + 0.36 * w, kL); p.rtw = lerp(0, -1.35 + 0.3 * wl, kL); // (rocking out from beside the head, never into it)
  p.lsw = lerp(p.lsw, -0.1, k); p.lel = lerp(p.lel, 0.42, k); // (the other arm swings back a hair for balance)
  p.cry = lerp(p.cry, -0.08, k); p.crz += 0.03 * w * k;
  p.hrz = 0.12 * k + 0.06 * wl * k; p.hry = lerp(p.hry, 0.18, k); p.hrx = lerp(p.hrx + 0.06 * ant, -0.06 + 0.02 * w, k);
  p.smile = lerp(p.smile, 1.0, k); p.mopen = 0.22 * k * (0.6 + 0.4 * Math.abs(w)); p.brow = 0.3 * k + 0.2 * ant; p.eyeO = 1 + 0.1 * ant;
  p.rgrip = lerp(HAND_REST, 0.02, kL); // (the waving hand open)
}

// Cheer (2.2 s, an NPC cheering longer repeats it; anim-redo): a crouch with the arms drawn back and the head down (the wind-up,
// the body squashed), a spring up with both hands flying up (the body stretched in the air), a bouncy landing the knees take, then
// arm pumps from the shoulder, out of phase, with the chest rocking, the head bobbing and the knees bouncing along.
function cheer(h, c, p) {
  idle(h, c, p);
  const a = cyc(c, 2.2), again = c.left === Infinity && c.a > a + 0.01, loop = c.left === Infinity ? (1 - smooth((a - 1.8) / 0.3)) * (again ? smooth(a / 0.3) : 1) : 1; // (an NPC's loop: the arms come down before the next crouch and rise again out of it)
  const o = outK(c) * loop, oL = outK(c, 0.06) * (c.left === Infinity ? (1 - smooth((a - 1.86) / 0.3)) * (again ? smooth((a - 0.04) / 0.3) : 1) : 1), D = h.dims, a0 = D.a0;
  const crouch = smooth(a / 0.26) * (1 - smooth((a - 0.26) / 0.12)); // down, then away as the spring starts
  const air = a > 0.32 && a < 0.72 ? Math.sin((a - 0.32) / 0.4 * Math.PI) : 0;                    // the hop
  const lnd = settle(a - 0.72, 16, 7);                                                              // the landing's wobble (the knees take it)
  const up = back((a - 0.3) / 0.36, 0.45) * o, upL = back((a - 0.36) / 0.36, 0.45) * oL;
  const pump = smooth((a - 0.8) / 0.2) * o, beat = Math.sin((a - 0.8) * 13), beatL = Math.sin((a - 0.8) * 13 - 0.7), bounce = Math.max(0, beat) * pump;
  p.pdy -= 0.11 * crouch * o + 0.05 * Math.max(0, lnd) + 0.025 * bounce;
  p.bdy = 0.2 * air * o;
  p.sqz = -0.06 * crouch * o + 0.05 * air * o - 0.04 * Math.max(0, lnd); // (squash in the crouch and on landing, stretch in the air)
  p.crx += 0.16 * crouch * o - 0.1 * up + 0.02 * lnd; p.brx = -0.04 * air;
  p.ppz = -0.03 * crouch * o + 0.02 * up;
  const hh = hipHeight(h, p);
  ik(h, p, 0, 0.0 + 0.05 * air, a0 + 0.13 * air * air, hh, -0.45 * air); ik(h, p, 1, 0.04 - 0.02 * air, a0 + 0.08 * air * air, hh, -0.35 * air);
  p.lhab = 0.06 + 0.06 * crouch; p.rhab = 0.14 + 0.04 * crouch;
  for (const L of [true, false]) {
    const ph = L ? 0 : Math.PI, pa = 0.16 * Math.sin((a - 0.8) * 13 + ph) * pump, paL = 0.08 * Math.sin((a - 0.8) * 13 + ph - 0.7) * pump; // (the pump is in the shoulder: a bending elbow brought the fist down into the head; the forearm trails it)
    const ab = lerp(lerp(L ? p.lab : p.rab, 0.2, crouch * o), 2.42 + pa, up), sw = lerp(lerp(L ? p.lsw : p.rsw, -0.4, crouch * o), 0.38 + paL, up), el = lerp(lerp(L ? p.lel : p.rel, 0.5, crouch * o), 0.28 - paL, upL);
    if (L) { p.lab = ab; p.lsw = sw; p.lel = el; p.lca = lerp(p.lca, 0, up); } else { p.rab = ab; p.rsw = sw; p.rel = el; p.rca = lerp(p.rca, 0, up); }
  }
  p.crz += 0.035 * beat * pump; p.cry = -0.04 * beatL * pump; // (the chest rocks with the alternate pumps)
  p.hrx = lerp(p.hrx, -0.24, up) + 0.08 * crouch - 0.05 * beatL * pump; p.hrz = 0.05 * Math.sin(a * 6.5) * pump; p.hry = lerp(p.hry, 0.03 * beatL * pump, up);
  p.eyeO = lerp(1 - 0.2 * crouch, 0.55, up); p.smile = lerp(0.6, 1.35, up); p.mopen = lerp(0.1, 0.7 + 0.15 * bounce, up); p.brow = 0.6 * up - 0.3 * crouch;
  hands(p, lerp(HAND_REST, 0.05, upL)); // (open, the fingers spread)
}

// The dance (a 4.5 s window; anim-redo, at 120 bpm): two phrases so it is not one loop. The first (four beats) is a side-to-side
// groove: the weight goes over from foot to foot every beat with a hip bump, the free foot's heel tapping, the knees dipping on the
// beat, the elbows bent and the arms swinging across the body alternately with the forearms a beat behind, the chest twisting against
// the hips, the head bobbing and swaying. The second (four beats) raises the roof: both arms up with the forearms upright and the palms
// forward, pushing up on the beat, a hop on the off beats, the body turning a little. The arms come down over the last half second so
// an NPC's loop runs on into the next groove. Eases in from the idle and settles back by the window's end.
function dance(h, c, p) {
  idle(h, c, p);
  const a = cyc(c, 4.0), k = smooth(c.a / 0.35) * outK(c, 0, 0.5), kL = smooth((c.a - 0.07) / 0.35) * outK(c, 0.07, 0.5); // (an NPC loops it every eight beats: the ease-in is on the unwrapped time, every term below is periodic over 4 s)
  const B = 0.5, b = a / B, bl = b - 0.14; // (beats; the lagged beat the forearms, the hands and the head follow)
  const dip = 1 - pulse(Math.PI * b, 0.5), dipL = 1 - pulse(Math.PI * bl, 0.5); // (1 on the beat, 0 between)
  const s = Math.sin(Math.PI * b * 0.5), sL = Math.sin(Math.PI * bl * 0.5);      // (the weight: +1 left, -1 right, over every two beats)
  const cb = Math.cos(Math.PI * b), cbL = Math.cos(Math.PI * bl);                // (the arms' swing across, every two beats)
  const pb = smooth((a - 1.95) / 0.35) * (1 - smooth((a - 3.5) / 0.35));         // the second phrase: the arms up (down again by 3.9)
  const a0 = h.dims.a0;
  p.pdy = lerp(p.pdy, -0.03 - 0.04 * dip, k);
  p.bry = Math.sin(a * Math.PI * 0.5) * 0.5 * smooth(c.a / 0.8) * outK(c, 0, 0.9);
  p.ppx = lerp(p.ppx, 0.06 * s, k); p.prz = lerp(p.prz, 0.14 * s, k); p.pry = lerp(p.pry, -0.16 * sL, k);
  p.crz = lerp(p.crz, -0.15 * sL, k); p.cry = lerp(p.cry, 0.2 * cbL * (1 - 0.6 * pb), k); p.crx = lerp(p.crx, 0.04 + 0.04 * dip - 0.1 * pb, k);
  const hh = hipHeight(h, p);
  // the feet: planted wide, the free foot's heel tapping (the weight is on the other); in the second phrase a hop on the off beats
  const hop = pb * bump(((b + 0.5) % 2) / 0.6) * 0.8;
  const tapL = Math.max(0, -s) * (1 - pb), tapR = Math.max(0, s) * (1 - pb);
  ik(h, p, 0, 0.02 + 0.03 * tapL, a0 + 0.03 * tapL * dip + 0.11 * hop, hh, 0.25 * tapL * dip - 0.3 * hop);
  ik(h, p, 1, 0.02 + 0.03 * tapR, a0 + 0.03 * tapR * dip + 0.11 * hop, hh, 0.25 * tapR * dip - 0.3 * hop);
  p.bdy = 0.08 * hop; p.sqz = 0.03 * hop - 0.025 * dip * pb;
  p.lhab = lerp(p.lhab, 0.14, k); p.rhab = lerp(p.rhab, 0.14, k);
  // the arms: the groove's swing across (bent elbows, the forearms a beat behind), then up with the forearms upright, pushing up on the beat
  const gL = { sw: 0.6 + 0.5 * cb, ab: 0.42 + 0.1 * Math.max(0, -cb), el: 1.35 + 0.35 * cbL, tw: 0.45 - 0.25 * cbL };
  const gR = { sw: 0.6 - 0.5 * cb, ab: 0.42 + 0.1 * Math.max(0, cb), el: 1.35 - 0.35 * cbL, tw: 0.45 + 0.25 * cbL };
  const push = 1 - dipL, uA = { sw: 0.35 - 0.05 * push, ab: 1.3 + 0.28 * push, el: 1.35 - 0.1 * push, tw: 1.25 };
  p.lsw = lerp(p.lsw, lerp(gL.sw, uA.sw, pb), k); p.rsw = lerp(p.rsw, lerp(gR.sw, uA.sw, pb), k);
  p.lab = lerp(p.lab, lerp(gL.ab, uA.ab, pb), k); p.rab = lerp(p.rab, lerp(gR.ab, uA.ab, pb), k);
  p.lel = lerp(p.lel, lerp(gL.el, uA.el, pb), kL); p.rel = lerp(p.rel, lerp(gR.el, uA.el, pb), kL);
  p.ltw = lerp(gL.tw, uA.tw, pb) * kL; p.rtw = lerp(gR.tw, uA.tw, pb) * kL;
  p.lca = lerp(p.lca, 0, k); p.rca = lerp(p.rca, 0, k); p.laz = p.raz = 0.1 * k * (1 - pb);
  p.shd = lerp(p.shd, -0.008 * dip * pb, k);
  // the head: a bob on the beat, swaying with the weight, nodding harder with the arms up
  p.hrz = lerp(p.hrz, 0.1 * sL, k); p.hrx = lerp(p.hrx, 0.08 * dipL - 0.04 - 0.06 * pb, k); p.hry = lerp(p.hry, -p.cry * 0.5, k);
  p.eyeO = lerp(1, 0.75, k); p.smile = lerp(p.smile, 1.2, k); p.mopen = (0.25 + 0.15 * dipL) * k;
  hands(p, lerp(HAND_REST, lerp(0.35, 0.04, pb), kL)); // (loose fists in the groove, the hands open overhead)
}

// Sitting: `seatY` is the height of the seat's top (root units, 0 = the ground). The hip joint rides the thighs' radius (legR) above
// it so the thighs' undersides lie on it, and the pelvis is squashed to the same level (psq) so it doesn't sink in. On a seat the
// thighs lie level and the shins hang from the knees (seatLegs). On the ground the feet go where the pose puts them.
export const sitDrop = D => D.legR; // the hip joint over the seat's top
function seated(h, c, p, seatY, feetFx, feetLift) {
  const D = h.dims;
  p.pdy = seatY + sitDrop(D) - D.legLen; p.psq = 1;
  const hh = hipHeight(h, p);
  if (seatY >= 0.15) seatLegs(h, c, p, 0);
  else { ik(h, p, 0, feetFx + 0.04, feetLift, hh, -0.15); ik(h, p, 1, feetFx - 0.03, feetLift, hh, -0.15); p.lhab = p.rhab = 0.16; }
  p.crx = -0.04;
}
// The legs on a seat: each thigh level along the seat, the shin hanging a little forward (each person's own lean, from h.style).
// Where the ground is nearer than a hanging shin the foot stands on it and the knee comes up. `kick` swings dangling feet a little.
const DEF_STYLE = [0.5, 0.5, 0.5, 0.5];
// seat-height (2026-11-07): where the ground is a little further down than a hanging shin reaches, the foot still goes down flat on it:
// the shin nearly straight down and the thigh tipping from the hip at the seat's front edge, at most SEAT_TIP (the sine of its slope),
// as chairLegs does in a chair; a planted foot does not kick. Higher seats (a stool, the pier) let the feet hang as before.
export const SEAT_TIP = 0.6;
// The least the shin must swing forward from straight down (rad) for its calf to clear a seat's front edge `edge` ahead of the hip joint
// (root units; the edge's corner at the seat's top, legR under the hip joint; the calf pressing 1 cm into a cushion's rounded edge)
// (slice-seats; seats.js seatFit picks the hips with it)
export function shinKick(edge, D) {
  const ex = edge - D.Lt, c = D.legR * 0.9 - 0.01, R = Math.hypot(ex, D.legR);
  if (R <= c) return Math.PI / 2;
  return Math.max(0, Math.acos(Math.max(-1, Math.min(1, -c / R))) - Math.atan2(D.legR, ex));
}
function seatLegs(h, c, p, kick = 0) {
  const D = h.dims, hh = hipHeight(h, p), st = h.style || DEF_STYLE, floor = D.a0 + 0.017; // (the flat sole on the ground: at a0 + 0.004 it sank 1.3 cm; seat-height)
  const kE = h.params.seatEdge > 0 ? shinKick(h.params.seatEdge, D) : 0; // (slice-seats: a seat's front edge ahead of the hip joints, root units: seats.js seatFit)
  for (let i = 0; i < 2; i++) {
    const a0 = 0.12 + 0.2 * st[1] + (i ? 0.07 : -0.05) * (st[2] - 0.5) * 2; // the shin's lean forward from straight down
    const lean = 0.06 + 0.04 * st[1], need = hh - floor - D.Ls * Math.cos(lean), planted = need < D.Lt * SEAT_TIP; // (need: how far the knee must come down)
    let a = planted ? a0 : a0 + kick * Math.sin(c.t * 2.3 + c.ph + i * 2.6);
    if (!planted && kE > a) a = kE; // (slice-seats: the knees short of a deep seat's front edge, the shins out over it)
    let fx = D.Lt + D.Ls * Math.sin(a), fy = hh - D.Ls * Math.cos(a), an = -0.32 - 0.1 * st[3];
    if (fy < floor) { fx += (floor - fy) * 0.7; fy = floor; an = 0; } // (the foot on the ground, flat, the knee up)
    else if (planted) { const s = Math.max(0, need) / D.Lt; fx = D.Lt * Math.sqrt(1 - s * s) + D.Ls * Math.sin(lean); fy = floor; an = 0; } // (the thigh tips, the foot down flat)
    ik(h, p, i, fx + (i ? -0.015 : 0.015), fy, hh, an);
  }
  p.lhab = p.rhab = 0.1 + 0.05 * st[2];
}
// A chair with a front edge and armrests (params.chair = { armX, elbowDrop } in body units, seatY as usual): the knees bend at
// the front edge and the shins come straight down, so the frame under the seat stays clear of the legs.
function chairLegs(h, p) {
  const D = h.dims, hh = hipHeight(h, p);
  const fl = D.a0 + 0.013; // (the sole on the floor, not 1.3 cm into it: seat-height)
  const drop = clamp((hh - fl - D.Ls * 0.985) / D.Lt, 0, 0.6), fx = D.Lt * Math.sqrt(1 - drop * drop) + 0.02;
  ik(h, p, 0, fx, fl, hh, 0); ik(h, p, 1, fx, fl, hh, 0);
  p.lhab = p.rhab = 0.08;
}
// ...and the forearms lying along the armrests, the hands near their front ends: the upper arm hangs out to the rest's line
// (armX) and a little forward, dropping the elbow `elbowDrop` below the shoulder; the elbow bends the forearm level.
// which: 1 the left arm, 2 the right, 3 both.
// A chair that gives its armrest's top (`armY`, root units: the firepit's camp chairs) gets the forearms laid on it whatever the
// build: the forearm's outside (`h.foreOut`, sleeve included) a hair over the top, the elbow as far out as the upper arm reaches.
// Near the camera that's IK from the real shoulder (bodies-ik ArmTarget.lay), so the breath never presses it in. Without `armY`
// (Buddy's chair, the professor's armchair) the elbow sits `elbowDrop` under the shoulder.
const CHAIR_ARM_CLEAR = 0.012, CHAIR_WRIST_UP = 0.015; // m: the bone over the forearm's outside; the wrist that much higher than the elbow (a relaxed hand's curled fingertips clear the pad's front)
function chairArms(h, p, which = 3) {
  const D = h.dims, C = h.params.chair, sX = h.armL ? Math.abs(h.armL.shoulder.position.x) : 0.2;
  let ab, sw;
  if (C.armY === undefined) {
    ab = Math.asin(clamp((C.armX - sX) / D.Lu, -0.2, 0.7));
    sw = Math.acos(clamp(C.elbowDrop / (D.Lu * Math.cos(ab)), 0.2, 1));
  } else {
    const yBar = C.armY + (h.foreOut || D.armR) + CHAIR_ARM_CLEAR, drop = Math.max(0.02, shoulderY(h, p) - p.shd - yBar);
    const rx = Math.sqrt(Math.max(0, D.Lu * D.Lu - drop * drop)), xE = Math.min(C.armX, sX + rx * 0.98);
    ab = Math.asin(clamp((xE - sX) / D.Lu, -0.2, 0.95));
    sw = Math.acos(clamp(drop / (D.Lu * Math.cos(ab)), 0.2, 1));
    if (h.ik && h.ik.near) for (let i = 0; i < 2; i++) {
      if (!(which & (i + 1))) continue;
      const A = h.ik.arm[i]; A.set('root', 'wrist', (i ? -1 : 1) * C.armX, yBar, CHAIR_WRIST_UP); A.lay = true; A.pick = 'pole';
      if (i) p.rik = 1; else p.lik = 1;
    }
  }
  const el = Math.PI / 2 - sw + 0.04;
  if (which & 1) armL(p, sw, ab, el, 0, 0);
  if (which & 2) armR(p, sw, ab, el, 0, 0);
}
// Getting onto a seat (anim-redo): over the first SIT_T seconds of `sit` on a seat the person lowers themselves onto it: the hips
// start high in a half crouch over the seat with the feet planted forward on the ground, the chest leaning forward over the knees,
// the hands reaching down and back for the seat; the hips come down in an arc (a little past, then up: a soft landing), the knees
// bend as they go, the chest straightens with a touch of overshoot, the head follows a beat behind. The final seated pose is the
// seat's own (fix/seat-height owns its fit): everything here is a blend that is exactly 0 by SIT_T.
const SIT_T = 0.72;
const SIT_END = SIT_T * 2.2 + 0.12; // (back() has settled by 2.2 of its unit: nothing of the way down is left after this)
const sitReach = c => (c.a >= SIT_END || !c.sitFresh ? 0 : clamp(Math.max(1 - back(c.a / SIT_T, 0.62), 1 - back((c.a - 0.06) / SIT_T, 0.62)), 0, 1)); // (how far the hands are still reaching for the seat: seatRest and tableRest hold off by it)
// (anim-seat: only for someone who stood here and sits now, c.sitFresh from human.js: a town folk first drawn already seated, a late
// joiner's view of a sitter or a person set down onto a seat from afar are simply seated. The hips never go under the seat's own height:
// the overshoot and settle is in the chest and the head, so the bottom is on the seat from the moment it lands)
function sitDown(h, c, p, seat) {
  const a = c.a;
  if (a >= SIT_END || !c.sitFresh) return;
  const D = h.dims, k = back(a / SIT_T, 0.62), r = Math.max(0, 1 - k), kc = 1 - back((a - 0.06) / SIT_T, 0.62), kh = 1 - back((a - 0.12) / SIT_T, 0.62); // (the hips lead, the chest a beat behind, the head after; the chest and head overshoot a little and settle)
  const hh0 = hipHeight(h, p), hhUp = Math.max(D.legLen * 0.86, hh0 + 0.08); // (a half crouch, standing over the seat)
  const hh = lerp(hh0, hhUp, r);
  p.pdy += hh - hh0; p.ppz += 0.04 * r;
  // the feet: forward on the ground through the drop (the planted stance a sitter lowers from), easing to the seat's own legs
  for (let i = 0; i < 2; i++) {
    const q = p.ikIn[i], fx = lerp(q[0], D.Lt * 0.72 + (i ? -0.02 : 0.03), r), fy = lerp(q[1], D.a0, r), an = lerp(q[3], 0, r);
    ik(h, p, i, fx, fy, hipHeight(h, p), an);
  }
  p.crx += 0.42 * kc * (1 - 0.3 * smooth(a / 0.2)); p.hrx += -0.2 * kh + 0.12 * kc; p.prx += 0.08 * kc;
  // the hands reach down and back for the seat, then come forward into the lap
  const reach = clamp(Math.max(r, kc), 0, 1);
  p.lsw = lerp(p.lsw, -0.3, reach); p.rsw = lerp(p.rsw, -0.3, reach); p.lel = lerp(p.lel, 0.25, reach); p.rel = lerp(p.rel, 0.25, reach);
  p.lab = lerp(p.lab, 0.3, reach); p.rab = lerp(p.rab, 0.3, reach); p.lca = lerp(p.lca, 0, reach); p.rca = lerp(p.rca, 0, reach);
  p.lik *= 1 - reach; p.rik *= 1 - reach;
  p.psq = Math.min(p.psq, clamp(k, 0, 1)); p.mopen = Math.max(p.mopen, 0.15 * bump(a / SIT_T)); p.brow += 0.15 * bump(a / SIT_T);
}
function sit(h, c, p) {
  const a = c.a, t = c.t, ph = c.ph;
  idle(h, c, p);
  const seat = h.params.seatY || 0;
  if (seat >= 0.15) { // a seat someone put this person on (benches, chairs, the boat)
    p.pdy = 0; p.ppx = 0; p.prz = 0; p.crz = 0;
    if (h.params.chair && seat > 0.15) { seated(h, c, p, seat, 0, h.dims.a0); chairLegs(h, p); chairArms(h, p); p.crx = -0.06; p.hrx = 0.02; sitDown(h, c, p, seat); return; }
    // at ease on the seat: the legs hanging and kicking a little, the arms as idle's seated branch rests them, a slight slouch
    seated(h, c, p, seat); seatLegs(h, c, p, 0.05);
    p.crx = 0.05; p.hrx = -0.03;
    sitDown(h, c, p, seat);
    if (h.params.snug) snuggle(h, c, p);
    return;
  }
  // down onto the ground: the hands reach back, the seat lands with a little bump, the legs slide out and the body leans back on its
  // hands, then at ease, swinging a foot now and then
  const D = h.dims, drop = smooth(a / 0.62), land = a > 0.55 && a < 0.85 ? Math.sin((a - 0.55) / 0.3 * Math.PI) : 0, out = smooth((a - 0.35) / 0.55);
  const pdyS = sitDrop(D) - D.legLen; // (seated()'s height with the ground as the seat)
  p.psq = drop;
  p.pdy = lerp(p.pdy, pdyS, drop) + 0.012 * land; p.ppx *= 1 - drop; p.prz *= 1 - drop; p.crz *= 1 - drop; p.ppz = -0.04 * Math.sin(drop * Math.PI);
  const hh = hipHeight(h, p), swing = Math.max(0, Math.sin(t * 0.9 + ph)) ** 6; // (now and then one foot swings)
  const fx = lerp(0.04, 0.44, out), fy = D.a0 + 0.04 * Math.sin(out * Math.PI);
  ik(h, p, 0, fx + 0.04, fy, hh, lerp(0, -0.15, out)); ik(h, p, 1, fx - 0.03 - 0.06 * swing * out, fy + 0.05 * swing * out, hh, lerp(0, -0.15, out) - 0.3 * swing * out);
  p.lhab = p.rhab = lerp(0.05, 0.16, out);
  p.crx = lerp(p.crx + 0.25 * Math.sin(drop * Math.PI), -0.1, out); // (the chest over the knees on the way down, leaning back once down)
  const reach = smooth(a / 0.4);
  p.lsw = lerp(p.lsw, -0.25, reach); p.rsw = lerp(p.rsw, -0.25, reach); p.lab = lerp(p.lab, 0.35, reach); p.rab = lerp(p.rab, 0.35, reach);
  p.lel = lerp(p.lel, 0.15, reach); p.rel = lerp(p.rel, 0.15, reach); p.lca = lerp(p.lca, 0, reach); p.rca = lerp(p.rca, 0, reach);
  p.hrx = lerp(p.hrx, 0.02, drop) - 0.06 * land; p.brow = 0.25 * land; p.mopen = 0.2 * land;
  hands(p, lerp(HAND_REST, 0.1, reach)); // (flat on the ground behind)
}
// The snuggle on our sofa (house-rest.js; the server says who): params.snug = { side, role, k }. side +1 when the partner is on this
// person's left (+x), -1 on the right; role 'head' leans in and rests her head on his shoulder, 'arm' puts his arm round her
// shoulders (that arm stays out of seatRest's hands-in-the-lap). k 0..1 eases it in and out. On a bed (lie) the same pair lies
// turned a little toward each other.
// (bodies-fix) params.snug.at = [x, y, z]: the partner's far shoulder (the top of it) in this person's root frame (house-rest.js reads
// it off the partner's body each frame): near the camera the arm round her is solved by IK so the hand drapes over that shoulder,
// whatever the two sizes; far off, or without it, the angles below (the upper arm out and back over her, the forearm down her far arm).
export const SNUG_ARM = { sw: -0.2, ab: 1.3, az: 0.55, el: 0.95, tw: -1.2 }; // the arm round her: out over her shoulders, back behind her, the forearm hanging down her far arm
export const SNUG_HAND = { up: 0.012, out: 0.015 }; // the palm this far over the top of her far shoulder, and out past it
function snuggle(h, c, p) {
  const S = h.params.snug, k = smooth(clamp(S.k ?? 1, 0, 1)), sd = S.side < 0 ? -1 : 1;
  if (k <= 0) return;
  if (S.role === 'head') {
    p.crz = lerp(p.crz, -sd * 0.1, k); p.crx = lerp(p.crx, 0.08, k);   // (crz > 0 tips the chest toward -x)
    p.hrz = lerp(p.hrz, -sd * 0.38, k); p.hry = lerp(p.hry, sd * 0.12, k); p.hrx = lerp(p.hrx, 0.04, k);
    p.eyeO = lerp(p.eyeO, 0.5, k); p.smile = lerp(p.smile, 0.95, k);
  } else {
    const A = SNUG_ARM;
    p.crz = lerp(p.crz, -sd * 0.07, k); p.hrz = lerp(p.hrz, -sd * 0.1, k); p.hry = lerp(p.hry, sd * 0.28, k); p.hrx = lerp(p.hrx, 0.06, k);
    if (sd > 0) { p.lsw = lerp(p.lsw, A.sw, k); p.lab = lerp(p.lab, A.ab, k); p.laz = lerp(p.laz, A.az, k); p.lel = lerp(p.lel, A.el, k); p.ltw = lerp(p.ltw, A.tw, k); p.lca = 0; p.lgrip = HAND_REST; }
    else { p.rsw = lerp(p.rsw, A.sw, k); p.rab = lerp(p.rab, A.ab, k); p.raz = lerp(p.raz, A.az, k); p.rel = lerp(p.rel, A.el, k); p.rtw = lerp(p.rtw, A.tw, k); p.rca = 0; p.rgrip = HAND_REST; }
    p.smile = lerp(p.smile, 1.0, k);
    if (S.at && h.ik && h.ik.near) { // the hand on her far shoulder, the palm down on it, the elbow up and back behind her
      const i = sd > 0 ? 0 : 1, A2 = h.ik.arm[i], D = h.dims;
      let x = S.at[0] + sd * SNUG_HAND.out, y = S.at[1] + SNUG_HAND.up, z = S.at[2];
      // a partner too big to reach over (a child beside a broad grown-up): the hand goes round her back at his own shoulder's
      // height instead, as far as the arm reaches. (A little short is fine: the solve stretches the arm and the hand rests on her
      // far upper arm just under the shoulder.)
      const sx = (sd > 0 ? h.armL : h.armR).shoulder.position.x, sy = shoulderY(h, p) - p.shd, reach = (D.Lu + D.Lf) * 0.96;
      if (Math.hypot(x - sx, y - sy, z) > reach * 1.8) { y = Math.min(y, sy - 0.05); const dx = x - sx, dz = z - 0.02, dd = Math.hypot(dx, y - sy, dz); if (dd > reach) { const q = reach / dd; x = sx + dx * q; y = sy + (y - sy) * q; z = 0.02 + dz * q; } }
      A2.set('root', 'palm', x, y, z).face('palm', -sd * 0.35, -0.9, 0.1).elbow(sd * 0.6, 0.45, -0.75); A2.pick = 'pole';
      if (i) p.rik = k; else p.lik = k;
    }
  }
}
// Lying on a bed (house-rest.js): on the back, the head on the pillow. The root stands at the feet with its yaw the way the feet
// point; the body tips back about it (brx) and rises to the quilt (params.lieY, root units: the quilt's top over the root).
// params.lieK 0..1 eases the lying down and getting up. The head rides higher than the back (the pillow, and our people's big
// heads): the chest curls a little and the chin comes down.
export const LIE_BACK = 0.45; // the back's depth behind the body's middle line, in dT (bodyDims' torso depth)
export const LIE_LIFT = 0.1;  // ...and the round of the seat behind the hips (house-scale: the hips and legs sank 5-10 cm into the quilt)
function lie(h, c, p) {
  const t = c.t, ph = c.ph, D = h.dims, br = Math.sin(t * 1.5 + ph), k = smooth(clamp(h.params.lieK ?? 1, 0, 1));
  const lieY = h.params.lieY || 0;
  p.brx = -Math.PI / 2 * k; p.bdy = (lieY + D.dT * LIE_BACK + LIE_LIFT) * k;
  p.pdy = 0; p.psq = 0;
  p.lhp = p.rhp = 0.06; p.lkn = p.rkn = 0.14; p.lan = p.ran = -0.25; p.lhab = 0.07; p.rhab = 0.09; p.legsSet = true;
  p.crx = 0.16 + br * 0.015; p.hrx = 0.42; p.hry = 0.08 * Math.sin(t * 0.21 + ph); p.hrz = 0;
  // the arms by the sides, relaxed
  p.lsw = p.rsw = 0.06; p.lab = p.rab = 0.22; p.lel = p.rel = 0.32; p.lca = p.rca = 0;
  p.lgrip = p.rgrip = HAND_REST;
  p.eyeO = 0.72; p.smile = 0.62 + br * 0.02; p.shd = 0.014;
  const S = h.params.snug;
  if (S) {
    const ks = smooth(clamp(S.k ?? 1, 0, 1)), sd = S.side < 0 ? -1 : 1;
    p.bry = sd * 0.32 * ks;                                       // (rolled about the body's length: toward the partner)
    p.hry = lerp(p.hry, sd * 0.38, ks); p.hrz = lerp(0, -sd * (S.role === 'head' ? 0.3 : 0.12), ks);
    p.eyeO = lerp(p.eyeO, 0.5, ks); p.smile = lerp(p.smile, 1.0, ks);
    if (S.role === 'arm') { // his near arm out under her shoulders
      if (sd > 0) { p.lsw = lerp(p.lsw, 0.05, ks); p.lab = lerp(p.lab, 1.25, ks); p.lel = lerp(p.lel, 0.55, ks); }
      else { p.rsw = lerp(p.rsw, 0.05, ks); p.rab = lerp(p.rab, 1.25, ks); p.rel = lerp(p.rel, 0.55, ks); }
    }
  }
}
function warm(h, c, p) {
  const a = c.a, t = c.t, ph = c.ph;
  idle(h, c, p);
  p.pdy = 0; p.ppx = 0; p.prz = 0; p.crz = 0;
  const seat = h.params.seatY || 0;
  seated(h, c, p, seat, seat < 0.15 ? 0.3 : 0.1, seat < 0.15 ? h.dims.a0 : h.dims.a0 + 0.06);
  p.crx = 0.06;
  armL(p, 1.25 + wig(t, 1.7, ph) * 0.05, 0.3, 0.45, 0, 0); armR(p, 1.2, 0.34, 0.45);
  p.lel += Math.sin(t * 5 + ph) * 0.04; p.hrx = 0.06;
  p.smile = 0.7; p.eyeO = 0.85;
  hands(p, 0.06); // (palms to the fire)
}

// Talking (NPCs, the chat; anim-redo): the talking hand moves in arcs with a flick of the forearm on the stressed syllables (talking
// with the hands), the other hand opens and closes with the words, the chest leans in and back with the phrases, the weight shifts,
// the head nods with the syllables and tips on a stress. An NPC's talk runs as long as it's asked.
function talk(h, c, p) {
  idle(h, c, p);
  const a = c.a, k = inK(c, 0.4) * outK(c), kL = inK(c, 0.4, 0.08) * outK(c, 0.08);
  // the words (talkAt): the flick a beat after the stress, so the hand follows the voice
  const T = talkAt(c.t, c.ph), open = T.open, stress = T.stress, rest = T.rest, mw = T.w;
  const fl = talkAt(c.t - 0.07, c.ph).stress, ph = wig(a, 1.4);
  p.hrx = lerp(p.hrx, wig(a, 6) * 0.04 + 0.02 + 0.04 * open, k); p.hrz += 0.06 * stress * k;
  p.rsw = lerp(p.rsw, 0.75 + wig(a, 3) * 0.32 + 0.1 * fl, k); p.rab = lerp(p.rab, 0.32 + 0.05 * fl, k); p.rel = lerp(p.rel, 1.15 + wig(a, 3, -0.7) * 0.3 - 0.22 * fl, kL); p.rtw = lerp(0, -0.25 + wig(a, 3, -1.3) * 0.2, kL); p.rca = lerp(p.rca, 0, k);
  p.lsw = lerp(p.lsw, 0.35 + wig(a, 2.3, 1) * 0.25, k); p.lel = lerp(p.lel, 0.8 + wig(a, 2.3, 0.4) * 0.2, kL); p.lab = lerp(p.lab, 0.3, k); p.lca = lerp(p.lca, 0, k);
  p.cry = lerp(p.cry, ph * 0.09, k); p.hry += -p.cry * 0.4; p.crx += (0.03 * wig(a, 0.9, 0.5) + 0.02 * open) * k; p.ppx += 0.012 * wig(a, 0.7, 1) * k;
  p.shd -= 0.004 * fl * k;
  p.mopen = (0.08 + 0.6 * open) * k; p.mw = lerp(1, mw, k); p.brow = (0.25 * wig(a, 2.1) - 0.15 * stress) * k; p.btilt = 0.12 * stress * k;
  p.smile = lerp(p.smile, 0.58, 0.5 * rest * k);
  hands(p, lerp(HAND_REST, 0.2 + 0.25 * rest, kL), lerp(HAND_REST, 0.08 + 0.1 * fl, kL)); // (the talking hand open, flicking)
}

// Laugh (2.2 s; anim-redo): a breath in with the head ducking forward (the wind-up), then the head thrown back with both hands on the
// belly (by IK near the camera), the shoulders shaking and the knees bouncing with them, doubling forward over it and back. (Not a
// hand to the mouth: these short arms only reach a cheek, and off the face it reads as a wave.)
function laugh(h, c, p) {
  idle(h, c, p);
  const a = cyc(c, 2.2), again = c.left === Infinity && c.a > a + 0.01, loop = c.left === Infinity ? (1 - smooth((a - 1.8) / 0.3)) * (again ? smooth(a / 0.3) : 1) : 1; // (an NPC's loop: the hands come off the belly before the next breath in, and back on after it)
  const o = outK(c) * loop, k = inK(c, 0.3, 0.1) * o, kL = inK(c, 0.3, 0.17) * outK(c, 0.07) * loop;
  const inhale = Math.sin(clamp(a / 0.2, 0, 1) * Math.PI) * o;
  const shake = Math.abs(Math.sin(a * 13)) * smooth((a - 0.25) / 0.15) * o, shL = Math.abs(Math.sin(a * 13 - 0.7)) * smooth((a - 0.3) / 0.15) * o;
  const fold = smooth((a - 0.9) / 0.5) * (1 - smooth((a - 1.7) / 0.4)) * o; // (doubled over in the middle of it)
  p.bdy = 0.012 * shake; p.shd -= 0.012 * shake; p.pdy -= 0.012 * shL + 0.01 * fold; // (the shoulders hop, the knees bounce after them)
  p.crx += 0.1 * inhale - 0.07 * k + 0.22 * fold + 0.03 * shake;
  p.hrx = lerp(p.hrx + 0.14 * inhale, -0.36 + 0.42 * fold, k) + 0.06 * shL; p.hrz += 0.07 * Math.sin(a * 3.1) * k;
  p.brz = 0.025 * Math.sin(a * 6.5) * k; p.ppx += 0.015 * Math.sin(a * 3.1 - 0.5) * k; p.prz -= 0.03 * Math.sin(a * 3.1 - 0.5) * k;
  // the arms (far off: angles; near: both palms on the belly by IK, low and to the sides of it)
  p.lsw = lerp(p.lsw, 0.7, k); p.lab = lerp(p.lab, 0.36, k); p.lel = lerp(p.lel, 1.35, kL); p.laz = 0.15 * k; p.lca = lerp(p.lca, 0, k);
  p.rsw = lerp(p.rsw, 0.7, k); p.rab = lerp(p.rab, 0.36, k); p.rel = lerp(p.rel, 1.35, kL); p.raz = 0.15 * k; p.rca = lerp(p.rca, 0, k);
  if (h.ik && h.ik.near) {
    const reach = h.clothReachAt(0.04, 0, 1) || h.dims.dT;
    for (let i = 0; i < 2; i++) {
      const sd = i ? -1 : 1;
      h.ik.arm[i].set('chest', 'palm', sd * 0.11, 0.05 + 0.012 * shL, reach + 0.09 + (h.sleeveOut || 0)).face('palm', -sd * 0.35, 0.1, -1).elbow(sd * 1, -0.35, 0.15); h.ik.arm[i].pick = 'pole'; // (the palms a little off the shirt: a wide build's forearm otherwise lay in its belly)
    }
    p.lik = k; p.rik = inK(c, 0.3, 0.17) * o;
  }
  p.eyeO = lerp(1 + 0.15 * inhale, 0.2, k); p.smile = lerp(p.smile, 1.5, k); p.mopen = (0.45 + 0.3 * shake) * k + 0.3 * inhale; p.brow = 0.5 * k + 0.4 * inhale;
  hands(p, lerp(HAND_REST, 0.12, kL), lerp(HAND_REST, 0.12, kL));
}

// Point (2.2 s, NPCs hold it; anim-redo): the head looks first, the hand draws back a touch (the wind-up), then the arm thrusts out
// with the weight going onto a foot that steps forward, two little jabs with the head nodding on them, the other fist on the hip (by IK
// near the camera), the chest turned into it.
function point(h, c, p) {
  idle(h, c, p);
  const a = c.a, o = outK(c), oL = outK(c, 0.08), look = smooth(a / 0.18) * o, k = inK(c, 0.3, 0.14) * o, kL = inK(c, 0.3, 0.2) * oL;
  const ant = antic(a, 0.02, 0.26) * o, st = smooth((a - 0.12) / 0.3) * o;
  const jab = (Math.exp(-((a - 0.75) ** 2) / 0.006) + Math.exp(-((a - 1.15) ** 2) / 0.006)) * o;
  p.hry = lerp(p.hry, 0.14, look); p.hrx = lerp(p.hrx, 0.06, look) - 0.04 * jab + 0.05 * ant; p.cry = -0.18 * k - 0.04 * jab + 0.08 * ant;
  p.rsw = lerp(p.rsw - 0.25 * ant, 1.52 + 0.08 * jab, k); p.rab = lerp(p.rab, 0.14, k); p.rel = lerp(p.rel + 0.35 * ant, 0.1 + 0.25 * (1 - kL) * k, kL); p.rca = lerp(p.rca, 0, k); p.rtw = -0.2 * kL;
  p.crx += 0.05 * jab + 0.04 * st - 0.02 * ant; p.ppz = 0.03 * st - 0.01 * ant; p.ppx += -0.012 * st;
  if (!((h.params.seatY || 0) > 0.15)) { const q = p.ikIn[1], hh = hipHeight(h, p); ik(h, p, 1, q[0] + 0.07 * st, q[1] + 0.025 * bump(st), hh, q[3] - 0.25 * bump(st)); } // (the right foot steps a little forward under the point)
  const hip = smooth((a - 0.05) / 0.35) * outK(c, 0.12);
  p.lab = lerp(p.lab, 0.62, hip); p.lel = lerp(p.lel, 1.55, hip); p.lsw = lerp(p.lsw, -0.18, hip); p.lca = lerp(p.lca, 0, hip); p.ltw = 0.4 * hip;
  if (h.ik && h.ik.near && !h.lantern && !h.candle && !h.balloon && !h.book && !h.notepad && !((h.params.seatY || 0) > 0.15)) { // (the fist on the hip, knuckles to it, the elbow out; standing, an empty hand)
    const D = h.dims, x = Math.max(D.hipX + 0.112, h.fit ? h.fit.pelvis.max : 0) + 0.035 + 1.7 * (h.sleeveOut || 0); // (a wide sleeve's own room)
    h.ik.arm[0].set('root', 'anchor', x, D.legLen + p.pdy + 0.05, 0.0).face('palm', -0.6, 0, -0.5).elbow(1, -0.15, -0.5); h.ik.arm[0].pick = 'pole';
    p.lik = smooth((a - 0.05) / 0.35) * o; // (0 exactly at the window's end, or it gets laid on the cross-fade's angles twice)
  }
  p.smile = lerp(p.smile, 0.8, k); p.brow = 0.2 * k + 0.2 * jab + 0.2 * ant; p.mopen = 0.25 * jab + 0.1 * ant;
  p.rpoint = kL; p.rgrip = HAND_REST + (0.9 - HAND_REST) * kL; p.lgrip = lerp(HAND_REST, 0.95, hip); // (pointing; the other a fist on the hip)
}

// High five (1.6 s; anim-redo): the hand cocks back with the weight going back (the wind-up), swings up in an arc to meet the other
// person's (by IK near the camera, half way to params.mate, or up in front with nobody there), slaps with a little hop and a recoil
// the whole body feels (the knees, the chest, the head), the other arm swinging back for balance, and comes down.
function highfive(h, c, p) {
  idle(h, c, p);
  const a = c.a, o = outK(c), oL = outK(c, 0.08), cock = Math.sin(clamp(a / 0.18, 0, 1) * Math.PI * 0.5) * (1 - smooth((a - 0.14) / 0.1)) * o;
  const k = back((a - 0.12) / 0.3, 0.6) * o, kL = back((a - 0.17) / 0.3, 0.6) * oL;
  const slap = a > 0.4 && a < 0.62 ? Math.sin((a - 0.4) / 0.22 * Math.PI) : 0, recoil = a > 0.42 ? Math.exp(-(a - 0.42) * 10) * Math.sin((a - 0.42) * 22) : 0, lnd = settle(a - 0.55, 16, 7);
  p.rsw = lerp(lerp(p.rsw, -0.3, cock), 2.05 - 0.1 * recoil + 0.12 * bump(k) * (1 - smooth((a - 0.45) / 0.1)), k); p.rab = lerp(p.rab, 0.62, k); // (up in front and out to the right, clear of the big head; near the camera with someone the IK takes it from here)
  p.rel = lerp(p.rel + 0.2 * cock, 0.25 + 0.15 * recoil, kL); p.rca = lerp(p.rca, 0, k); p.rtw = -0.2 * kL;
  const bal = smooth((a - 0.1) / 0.45) * o; p.lsw = lerp(p.lsw, -0.14 + 0.08 * slap, bal); p.lel = lerp(p.lel, 0.42, bal); // (the other arm eases back a little for balance)
  p.crx += -0.06 * cock + 0.06 * k - 0.05 * slap + 0.02 * lnd; p.cry = -0.1 * k + 0.05 * cock; p.bdy = 0.05 * slap; p.pdy -= 0.025 * cock + 0.03 * Math.max(0, lnd);
  p.ppz += -0.02 * cock + 0.03 * k; p.sqz = -0.02 * cock + 0.02 * slap;
  const M = mateLocal(h);
  if (M && M.d > 0.3) { // with someone: lean in to them, the right shoulder a little forward, the palm to the point half way between
    // them a little over the shoulders. main.js turns both a little to the right (HIGHFIVE_TURN) so the meeting point is beside the
    // big heads, not between them, and in reach of these short arms about a metre apart
    p.crx += 0.16 * k; p.ppz += 0.07 * k; p.cry += 0.12 * k; p.hry -= 0.12 * k;
    if (h.ik && h.ik.near) {
      const sy = shoulderY(h, p), d = clamp(M.d / 2, 0.2, 0.7), ux = M.x / M.d, uz = M.z / M.d;
      h.ik.arm[1].set('root', 'palm', ux * d, sy + 0.12, uz * d).elbow(-0.9, -0.7, -0.1); h.ik.arm[1].pick = 'pole'; // (no facing: near this reach a palm facing flips the elbow over from frame to frame)
      p.rik = back((a - 0.17) / 0.3, 0.6) * o;
    }
  }
  p.smile = lerp(p.smile, 1.3, k); p.mopen = 0.35 * k + 0.25 * slap; p.eyeO = lerp(1 + 0.1 * cock, 0.85, k) - 0.3 * slap; p.hrx = lerp(p.hrx + 0.05 * cock, -0.12, k) + 0.05 * slap; p.brow = 0.3 * cock + 0.2 * k;
  p.rgrip = lerp(HAND_REST, 0.02, kL);
}

// Shrug (2 s, an NPC repeats it every 2.6 s; anim-redo): the shoulders dip a touch first (the wind-up), then up with the palms turning
// up a beat behind, the head tipped one way and then the other ("beats me"), the weight on one hip, held a moment, then down with a
// little drop and a settle.
function shrug(h, c, p) {
  idle(h, c, p);
  const a = cyc(c, 2.6), o = outK(c);
  const hold = 1 - smooth((a - 1.15) / 0.4), ant = antic(a, 0, 0.18) * o;
  const k = back((a - 0.06) / 0.3, 0.55) * hold * o, kL = back((a - 0.13) / 0.3, 0.55) * (1 - smooth((a - 1.22) / 0.4)) * outK(c, 0.06);
  const drop = a > 1.4 && a < 1.9 ? Math.sin((a - 1.4) / 0.5 * Math.PI) * 0.4 : 0, tip2 = smooth((a - 0.7) / 0.25) * hold;
  p.shd = lerp(p.shd, -0.035, k) + 0.008 * ant + 0.01 * drop; // (the shoulders dip, then up)
  p.lab = lerp(p.lab, 0.62, k); p.rab = lerp(p.rab, 0.62, k); p.lsw = lerp(p.lsw, 0.2, k); p.rsw = lerp(p.rsw, 0.2, k);
  p.lel = lerp(p.lel, 1.35, kL); p.rel = lerp(p.rel, 1.35, kL); p.ltw = 1.3 * kL; p.rtw = 1.3 * kL; p.lca = lerp(p.lca, 0, k); p.rca = lerp(p.rca, 0, k);
  p.hrz = (0.17 - 0.3 * tip2) * k + 0.03 * Math.sin(a * 7) * k; p.hry = lerp(p.hry, 0.1 * tip2, k); p.crx = lerp(p.crx + 0.03 * ant, -0.04, k); p.pdy -= 0.012 * drop + 0.006 * ant;
  p.ppx += 0.02 * k; p.prz -= 0.03 * k; p.crz += 0.03 * k;
  p.smile = lerp(p.smile, 0.0, k); p.brow = 0.7 * k; p.eyeO = lerp(1, 0.85, k); p.btilt = -0.2 * k; p.mw = lerp(1, 0.8, k);
  stand(h, p, 0.06);
  hands(p, lerp(HAND_REST, 0.04, kL)); // (palms up, open)
}

// Startled (NPC pairs; anim-redo): a fast jump back with the arms flung up and out (0.1 s, past and back), the fingers spread, the
// eyes wide, the body stretched in the air and squashed on landing with a wobble; then the hands come down to the chest, clutched
// ("oh my"), the shoulders up, as it eases off.
function startle(h, c, p) {
  idle(h, c, p);
  const a = c.a, D = h.dims, a0 = D.a0, k = back(a / 0.52, 0.5), hop = a < 0.42 ? Math.sin(a / 0.42 * Math.PI) : 0, kL = back((a - 0.05) / 0.52, 0.5);
  const lnd = settle(a - 0.42, 18, 7), rec = smooth((a - 0.65) / 0.4); // (the landing's wobble; the recovery: hands to the chest)
  p.lab = lerp(lerp(p.lab, 1.75 + 0.25 * hop, k), 0.5, rec); p.rab = lerp(lerp(p.rab, 1.75 + 0.25 * hop, k), 0.5, rec); p.lsw = lerp(lerp(p.lsw, 0.2, k), 0.65, rec); p.rsw = lerp(lerp(p.rsw, 0.2, k), 0.65, rec);
  p.lel = lerp(lerp(p.lel, 0.55, kL), 1.55, rec); p.rel = lerp(lerp(p.rel, 0.55, kL), 1.55, rec); p.ltw = 0.3 * rec; p.rtw = 0.3 * rec; p.lca = lerp(p.lca, 0, k); p.rca = lerp(p.rca, 0, k);
  p.bdy = 0.3 * hop; p.sqz = 0.08 * hop - 0.05 * Math.max(0, lnd); p.pdy -= 0.04 * Math.max(0, lnd);
  const hh = hipHeight(h, p);
  ik(h, p, 0, 0.04, a0 + 0.18 * hop, hh, -0.4 * hop); ik(h, p, 1, -0.04, a0 + 0.1 * hop, hh, -0.4 * hop);
  p.lhab = p.rhab = 0.12;
  p.hrx = lerp(p.hrx, -0.18 + 0.1 * rec, k); p.crx = lerp(p.crx, -0.14 + 0.1 * rec, k) + 0.03 * lnd; p.brx = -0.1 * Math.min(1, a * 4) * (1 - 0.5 * rec);
  p.shd = lerp(p.shd, -0.02, rec);
  p.eyeO = lerp(1, 1.45 - 0.35 * rec, k); p.brow = k; p.mopen = (0.85 - 0.5 * rec) * k; p.smile = lerp(p.smile, -0.2 + 0.3 * rec, k); p.mw = lerp(1, 0.6 + 0.2 * rec, k);
  hands(p, lerp(lerp(HAND_REST, 0.02, kL), 0.7, rec)); // (fingers spread in fright, then clutched at the chest)
}

// Whisper (NPC pairs; anim-redo): a glance to the side, a lean in with the weight going onto the near foot and the shoulders hunched,
// the hand cupped beside the mouth (the forearm arriving a beat after the arm), the other hand drawn in, the lips moving.
function whisper(h, c, p) {
  idle(h, c, p);
  const a = c.a, k = inK(c, 0.32, 0.08) * outK(c), kL = inK(c, 0.32, 0.16) * outK(c, 0.06), glance = Math.sin(clamp(a / 0.5, 0, 1) * Math.PI);
  p.crx = lerp(p.crx, 0.22, k); p.crz = lerp(p.crz, 0.1, k); p.hrz = 0.18 * k; p.hry = lerp(p.hry, -0.35, k) + 0.25 * glance * (1 - k);
  p.ppx += -0.02 * k; p.prz += 0.03 * k; p.shd -= 0.008 * k; p.cry = lerp(p.cry, -0.08, k);
  p.rsw = lerp(p.rsw, 2.0, k); p.rab = lerp(p.rab, 0.42, k); p.rel = lerp(p.rel, 1.5, kL); p.rtw = -0.6 * kL; p.rca = lerp(p.rca, 0, k);
  p.lsw = lerp(p.lsw, 0.22, k); p.lel = lerp(p.lel, 0.75, kL); p.lca = lerp(p.lca, 0, k); // (the other hand drawn in a little)
  p.mopen = 0.15 * k * (0.6 + 0.4 * Math.abs(Math.sin(a * 9))); p.smile = lerp(p.smile, 0.2, k); p.brow = 0.3 * k; p.eyeO = lerp(1, 0.85, k);
  p.rgrip = lerp(HAND_REST, 0.14, kL); // (cupped at the mouth)
  // near the camera the hand is placed in the head's frame, so it follows the head's turn and stays under a hat's brim
  if (h.ik && h.ik.near) { h.ik.arm[1].set('head', 'palm', -0.36, -0.13, 0.2).face('palm', 0.92, 0.1, 0.38).elbow(-0.3, -1, 0.5); p.rik = inK(c, 0.32, 0.16) * outK(c); }
}

// Pet (anim-redo): a bend down to the dog with the head tipped fondly, the stroking hand in long arcs with the forearm trailing, the
// body rocking a little with each stroke, the other hand on the knee.
function pet(h, c, p) {
  const a = c.a;
  idle(h, c, p);
  const k = inK(c, 0.45) * outK(c), kL = inK(c, 0.45, 0.1) * outK(c, 0.08), st = wig(a, 6) * smooth((a - 0.35) / 0.3), stL = wig(a, 6, -0.9) * smooth((a - 0.4) / 0.3);
  p.pdy = lerp(p.pdy, -0.16, k); p.crx = lerp(p.crx, 0.5, k) + 0.02 * st * k; p.hrx = lerp(p.hrx, 0.05, k) + 0.02 * stL * k; p.hrz = lerp(p.hrz, 0.1, k);
  p.rsw = lerp(p.rsw, 1.0 + st * 0.22, k); p.rab = lerp(p.rab, 0.2, k); p.rel = lerp(p.rel, 0.5 + 0.12 * stL, kL); p.lsw = lerp(p.lsw, 0.65, k); p.lab = lerp(p.lab, 0.22, k); p.lel = lerp(p.lel, 0.5, kL);
  p.lca = lerp(p.lca, 0, k); p.rca = lerp(p.rca, 0, k);
  p.ppz = -0.03 * k; p.ppx += 0.01 * st * k; p.smile = lerp(p.smile, 1.1, k); p.eyeO = lerp(1, 0.8, k);
  stand(h, p, 0.1);
  hands(p, lerp(HAND_REST, 0.1, kL), lerp(HAND_REST, 0.06, kL)); // (open, stroking)
}

function look(h, c, p) {
  idle(h, c, p);
  const a = c.a, s = Math.sin(a * 1.3), sL = Math.sin(a * 1.3 - 0.35);
  p.hry = s * 0.9; p.hrx = -0.05 + 0.06 * Math.sin(a * 2.1);
  p.cry = sL * 0.14; p.ppx += 0.01 * sL; p.crz -= 0.02 * sL; p.brow = 0.4; // (the shoulders follow the head a beat late, the weight with them)
}

// gaze (the intro's morning shot): the face lifted to the sky. h.params.gaze: up 0..1 how far the head tips back, shade 0..1 the
// right hand up by the brow, squint 0..1. The head's turn is the Human's lookYaw. Local only: not in codes.js ANIM_CODES (a remote
// copy sees idle).
function gaze(h, c, p) {
  idle(h, c, p);
  const g = h.params.gaze || {}, up = g.up ?? 1, sh = smooth(g.shade || 0), sq = g.squint || 0;
  p.hrx = lerp(p.hrx, -0.62, up); p.crx = lerp(p.crx, -0.07, up); p.hrz *= 1 - 0.6 * up;
  p.smile = lerp(p.smile, 0.75, up); p.brow = lerp(p.brow || 0, 0.25, up);
  p.eyeO = lerp(p.eyeO ?? 1, 0.5, sq);
  // the right hand up in front of the brow as far as the short arm goes, palm down, elbow out
  p.rsw = lerp(p.rsw, 2.0, sh); p.rab = lerp(p.rab, 0.4, sh); p.rel = lerp(p.rel, 1.5, sh); p.rtw = lerp(p.rtw || 0, -1.1, sh); p.rca = lerp(p.rca, 0, sh);
  p.rgrip = lerp(p.rgrip ?? HAND_REST, 0.06, sh);
  // near the camera the IK takes the palm as close to the brow as the arm reaches (solveTarget clamps, nothing stretches)
  if (sh > 0.001 && h.ik && h.ik.near) { const A = h.ik.arm[1].set('head', 'palm', -0.12, -0.33, 0.28).face('palm', 0.15, -1, 0.3).elbow(-1, -0.9, 0.1); A.pick = 'pole'; p.rik = sh; }
}

function garden(h, c, p) {
  const a = c.a;
  idle(h, c, p);
  p.pdy = -0.17; p.crx = 0.72; p.hrx = -0.35; p.ppz = -0.06;
  p.rsw = 1.25 + wig(a, 5) * 0.4; p.rel = 0.7 + wig(a, 5, 1) * 0.25; p.rab = 0.18; p.lsw = 0.9; p.lel = 0.5; p.lab = 0.2;
  p.smile = 0.7;
  stand(h, p, 0.12);
}

function read(h, c, p) {
  idle(h, c, p);
  p.lsw = 1.1; p.lab = 0.28; p.lel = 1.35; p.rsw = 0.75; p.rab = 0.22; p.rel = 1.4;
  p.hrx = 0.38; p.crx = 0.04; p.hry *= 0.3; p.eyeO = 0.75; p.smile = 0.2;
  // near the camera the book is held by IK in front of the chest, where the other hand reaches its page (followHand)
  if (h.ik && h.ik.near && (h.book || h.notepad)) {
    const reach = h.clothReachAt(0.15, 0, 1); // (the coat's front, not its widest anywhere round)
    h.ik.arm[0].set('chest', 'anchor', 0.0, 0.13, (reach || h.dims.dT) + 0.12).elbow(0.45, -0.35, 0.85); h.ik.arm[0].pick = 'pole';
    p.lik = 1;
  }
}

// Stretch (anim-redo): a curl forward first with the shoulders drawn up (the wind-up of a big yawn), then the arms reach up and a
// little forward with the forearms arriving after, the body rising onto its toes and arching back, swaying side to side at the top
// with the hips going the other way, the head rolling with it; the arms come down with a shake of the shoulders.
function stretch(h, c, p) {
  const a = c.a, o = outK(c), k = back((a - 0.08) / 0.55, 0.65) * o, kL = back((a - 0.17) / 0.55, 0.65) * outK(c, 0.08), ant = antic(a, 0, 0.3) * o;
  idle(h, c, p);
  const sway = Math.sin(a * 1.5) * k, swayL = Math.sin(a * 1.5 - 0.5) * k;
  p.lab = lerp(p.lab, 2.45 + 0.05 * sway, k); p.rab = lerp(p.rab, 2.45 - 0.05 * sway, k); p.lsw = lerp(p.lsw + 0.15 * ant, 0.6, k); p.rsw = lerp(p.rsw + 0.15 * ant, 0.6, k); // (up and a little forward: straight up, the arm fit fought the head for them)
  p.lel = lerp(p.lel + 0.3 * ant, 0.1, kL); p.rel = lerp(p.rel + 0.3 * ant, 0.1, kL);
  p.lca = lerp(p.lca, 0, k); p.rca = lerp(p.rca, 0, k);
  p.crx = lerp(p.crx + 0.14 * ant, -0.16, k); p.crz = sway * 0.14; p.prz = -sway * 0.05; p.ppx += 0.02 * swayL; p.hrx = lerp(p.hrx + 0.12 * ant, -0.25, k); p.hrz = swayL * 0.1; p.pdy += 0.03 * k - 0.01 * ant;
  p.shd -= 0.02 * ant + 0.012 * k - 0.01 * bump(1 - o);
  p.eyeO = lerp(1, 0.3, k); p.mopen = 0.6 * k * (0.7 + 0.3 * Math.sin(a * 2)); p.brow = 0.4 * k;
  stand(h, p, 0.1);
  hands(p, HAND_REST * (1 - kL) + 0.03 * kL);
}

// ---- fishing, treats, the swing

// The pole's angle in the chest's frame: how far it leans out to the right (az), and its elevation within the body's
// mid plane (el: 0 = level ahead, pi/2 = straight up, more = back over the shoulder). human.js turns it into the hand's frame.
export const CARRY_EL = 0.73, CARRY_AZ = 0.42;   // carried: about 38 degrees up and 24 degrees out to the right
function aimRod(p, el, az) { p.carry = 1; p.cpit = el - CARRY_EL; p.cyaw = az - CARRY_AZ; }

// fish = standing, rod out over the water, waiting
function fishBase(h, c, p, a) {
  idle(h, c, p);
  // both hands on the pole: the right at the belly, the left 0.24 m up the pole. The chest turns a little so the short left arm
  // gets there (the pole aims in the chest's frame, so it still points out to the right)
  p.rsw = 0.6 + wig(c.t, 1.1, c.ph) * 0.03; p.rab = -0.5; p.raz = 0; p.rel = 1.35; p.rtw = 0.0; p.cross = 1;
  p.lsw = 1.6; p.lab = -0.3; p.laz = 0; p.lel = 0.5; p.ltw = 0.3;
  aimRod(p, 0.42 + wig(c.t, 1.1, c.ph) * 0.02, 0.1);
  p.cry = -0.3; p.hry = 0.3; p.hrx = 0.05 + wig(c.t, 0.7, c.ph) * 0.03; p.crx = 0.05; p.crz = 0;
  p.ppx = 0; p.prz = 0; p.smile = 0.55; p.eyeO = 0.95;
  stand(h, p, 0.11);
  hands(p, 0.72); // (both round the pole)
}
function fish(h, c, p) {
  fishBase(h, c, p, c.a);
  // waiting on a bite, the right hand holds the butt in at the belly, where the left hand (following the pole, human.js) reaches it too
  if (h.ik && h.ik.near && h.held === 'rod') {
    aimRod(p, 0.95 + wig(c.t, 1.1, c.ph) * 0.02, 0.05); // (the pole up steeper, so the left hand's spot on it is within its reach)
    // (the fist's facing is left to the arm: turned along the pole it puts the elbow into the chest)
    h.ik.arm[1].set('chest', 'anchor', 0.0, 0.2, Math.max(0.33, (h.fit ? h.fit.torso.max : h.dims.dT) + 0.1)).elbow(-0.6, -0.4, 0.5);
    p.rik = 1;
  }
}

// cast: wind up (~0.35 s), flick (~0.2 s), follow through and settle
function cast(h, c, p) {
  const a = c.a;
  fishBase(h, c, p, a);
  const wind = smooth(a / 0.34), flick = smooth((a - 0.34) / 0.14), settle = smooth((a - 0.5) / 0.3);
  // the hand comes up beside the shoulder (not over the head) and the pole swings back over the right shoulder
  const rsw = lerp(lerp(1.05, 1.8, wind), 1.15, flick);
  p.rsw = lerp(rsw, 1.05, settle);
  p.rel = lerp(lerp(0.98, 1.2, wind), 0.35, flick); p.rel = lerp(p.rel, 0.98, settle);
  p.rab = lerp(lerp(0.26, 0.8, wind), 0.3, flick);
  const el = lerp(lerp(0.42, 1.85, wind), 0.18, flick), az = lerp(lerp(0.26, 0.9, wind), 0.22, flick);
  aimRod(p, lerp(el, 0.42, settle), lerp(az, 0.26, settle));
  p.flick = lerp(lerp(0, -0.45, wind), 0.75, flick) * (1 - settle);
  const lean = lerp(lerp(0, -0.22, wind), 0.3, flick) * (1 - settle);
  p.crx = 0.05 + lean; p.brx = lean * 0.4; p.cry = lerp(0, 0.3, wind) * (1 - flick); p.hry = -p.cry * 0.5;
  p.ppz = lerp(0, 0.06, flick) * (1 - settle);
  p.lsw = lerp(p.lsw, 1.35, wind * (1 - flick));
  p.smile = 0.7 + 0.4 * flick * (1 - settle); p.mopen = 0.25 * flick * (1 - settle); p.brow = 0.3 * wind;
  stand(h, p, 0.12);
}

function reel(h, c, p) {
  const a = c.a, ten = clamp(h.params.tension || 0, 0, 1);
  fishBase(h, c, p, a);
  const cr = a * 12;
  p.rsw = 0.95 + Math.sin(cr) * 0.16; p.rel = 1.25 + Math.cos(cr) * 0.35; p.rab = 0.32; p.rtw = Math.cos(cr) * 0.25;
  p.lsw = 0.95 + ten * 0.1; p.lel = 1.0;
  aimRod(p, 0.5 + ten * 0.3 + Math.sin(cr) * 0.02, 0.3);
  p.crx = 0.02 - ten * 0.16; p.brx = -0.05 - ten * 0.14; p.ppz = -0.03 * ten;
  p.pdy = -0.03 * ten;
  p.brow = 0.35 * ten; p.eyeO = 1.05 + ten * 0.25; p.mopen = ten * 0.35; p.smile = 0.35 + 0.3 * (1 - ten); p.btilt = ten * 0.25;
  p.crz = Math.sin(a * 3.1) * 0.03 * ten;
  stand(h, p, 0.13);
}

// hook: startled strike, rod snaps up (~0.4 s)
function hook(h, c, p) {
  const a = c.a, k = a < 0.4 ? Math.sin(a / 0.4 * Math.PI) : 0;
  fishBase(h, c, p, a);
  const jerk = smooth(a / 0.1);
  p.rsw = lerp(1.05, 1.9, jerk); p.rel = lerp(0.98, 0.7, jerk); p.rab = lerp(0.26, 0.4, jerk);
  aimRod(p, lerp(0.42, 1.2, jerk), lerp(0.26, 0.4, jerk));
  p.flick = 0.6 * (1 - smooth((a - 0.15) / 0.3));
  p.brx = -0.16 * jerk; p.crx = -0.12 * jerk; p.bdy = 0.13 * k; p.sqz = 0.05 * k;
  p.eyeO = 1.4; p.brow = 1.0; p.mopen = 0.7; p.smile = 0.0; p.mw = 0.7;
  stand(h, p, 0.13);
}

// catch: the fish held overhead, delighted
function catchPose(h, c, p) {
  const a = c.a, b = Math.abs(Math.sin(a * 7)), hh = hipHeight(h, p), a0 = h.dims.a0;
  const up = smooth(a / 0.25);
  armR(p, lerp(0.3, 2.55, up), 0.22, 0.25); p.rab = lerp(0.2, 0.5, up);
  armL(p, 0.3, lerp(0.15, 2.5, up), 0.15);
  p.hold = lerp(0, -0.3, up) + 0.55;
  p.bdy = 0.16 * b * up; p.sqz = 0.05 * b - 0.05 * Math.pow(1 - b, 4);
  ik(h, p, 0, 0.04 * b, a0 + 0.1 * b * b, hh, -0.3); ik(h, p, 1, -0.02 * b, a0 + 0.06 * b * b, hh, -0.3);
  p.lhab = p.rhab = 0.12;
  p.hrx = -0.3 * up; p.crx = -0.1 * up; p.brz = 0.04 * Math.sin(a * 3.5);
  p.eyeO = 0.6; p.smile = 1.4; p.mopen = 0.7; p.brow = 0.6 * up;
  p.lgrip = 0.04; // (the free hand open in delight; the fish is held in the right)
}

// throw: a treat, overarm (~0.5 s)
function throwPose(h, c, p) {
  const a = c.a;
  idle(h, c, p);
  const wind = smooth(a / 0.17), rel = smooth((a - 0.17) / 0.11), fol = smooth((a - 0.3) / 0.2);
  const sw = lerp(lerp(0.1, -0.7, wind), 2.0, rel);
  p.rsw = lerp(sw, 0.9, fol);
  p.rel = lerp(lerp(0.14, 1.2, wind), 0.2, rel); p.rel = lerp(p.rel, 0.5, fol);
  p.rab = 0.3; p.lsw = lerp(0.1, 0.9, wind) - 0.5 * rel; p.lab = 0.4; p.lel = 0.5;
  p.cry = lerp(lerp(0, 0.5, wind), -0.5, rel) * (1 - fol * 0.8); p.pry = -p.cry * 0.4;
  p.crx = lerp(lerp(0, -0.12, wind), 0.25, rel) * (1 - fol * 0.6); p.hry = -p.cry * 0.6;
  p.ppz = 0.05 * rel * (1 - fol); p.brx = 0.1 * rel * (1 - fol);
  p.mopen = 0.5 * rel * (1 - fol); p.smile = 1.0; p.brow = 0.3 * rel;
  stand(h, p, 0.14);
  p.rgrip = lerp(0.62, 0.05, rel); // (let go as the arm comes over)
}

// swing: sitting on the tire, hands on the ropes, legs dangling. params.lean -1..1 is the phase (+1 forward apex). The bottom sits on
// the tire's top (params.tireY, root frame, world metres, set by swing-rig's rigSync), the shins hanging through the hole. At the
// forward apex the legs shoot out over the rim, at the back the shins tuck under. Near the camera the hands hold the ropes by IK
// (ropeGrip, params.knotY where the ropes meet). docs/refs/andrew-swing-float.jpg is what it looks like when the bottom floats.
function swing(h, c, p) {
  const lean = clamp(h.params.lean || 0, -1, 1), t = c.t, s = h.opts.scale, st = h.style || DEF_STYLE;
  const D = h.dims, top = (h.params.tireY ?? -0.28) / s;
  // (the hips back of the tire's middle, more on long thighs, so the knees stay over the hole: the shins hang down through it, clear of the rim)
  const hole = TIRE_HOLE / s;
  p.pdy = top + sitDrop(D) - D.legLen; p.psq = 1; p.ppz = clamp(hole - D.Lt - 0.7 * D.legR, -0.14, -0.08); // (back of the middle: the side ropes run in front of the shoulders, where the hands hold them)
  const hh = hipHeight(h, p), kz = p.ppz + D.Lt, room = hole - kz - 0.8 * D.legR; // (how far forward of the knee the shin may reach)
  const fwd = Math.max(0, lean), back = Math.max(0, -lean);
  for (let i = 0; i < 2; i++) { // the shin's angle forward from straight down (nearly straight out at the forward apex)
    const hang = Math.min(-0.12 + 0.06 * st[1], Math.asin(clamp(room / D.Ls, -0.7, 0.7)));
    const a = lerp(hang, Math.min(hang, -0.5), back) + (i ? 0.04 : -0.04); // (hanging, the toes pointed down: the feet clear the tire's inside)
    const fx = p.ppz + D.Lt + D.Ls * Math.sin(a), fy = hh - D.Ls * Math.cos(a);
    // (at the forward apex the feet rise out of the hole and kick out over the rim, never through it. A rider too big for the hole
    // sits that way all the time)
    const out = Math.max(fwd, smooth((0.01 - room) / 0.03)), up = Math.pow(out, 0.3), on = out * out * out; // (the feet come up out of the hole first, then go forward)
    ik(h, p, i, lerp(fx, p.ppz + D.Lt * 0.86 + D.Ls * 0.92, on), lerp(fy, hh + 0.07, up), hh, lerp(-1.4, -0.2, up));
  }
  p.lhab = p.rhab = 0.05;
  p.crx = -lean * 0.24 + 0.03; p.hrx = lean * 0.14; p.prx = 0;
  bothArms(p, 0.32, 0.62, 2.05);
  p.lel = p.rel = 2.05 - fwd * 0.15;
  p.brz = 0; p.smile = 0.8 + fwd * 0.6; p.mopen = 0.2 + fwd * 0.5; p.eyeO = 1 + fwd * 0.15;
  const danger = clamp(h.params.danger ?? h.params.tension ?? 0, 0, 1); // the swing piece publishes its danger as tension
  p.eyeO += danger * 0.35; p.brow = danger * 0.8; p.btilt = -danger * 0.2; p.mopen += danger * 0.3;
  p.pdy += Math.sin(t * 8) * 0.003 * danger;
  hands(p, 0.78); // (round the ropes)
  if (h.ik && h.ik.near) ropeGrip(h, p, top);
}
// Each hand round its side rope (the rope runs from the tire's side straight up to where the ropes meet), at about the shoulders'
// height, the rope through the fist, the elbow down by the side. swing-rig threads the drawn rope through the hand.
export const ROPE_X = 0.5, TIRE_HOLE = 0.33, D_ARM_OUT = 0.13; // m: the side ropes' ends on the tire, either side of its middle; the hole's radius (swing-tree.js: the torus 0.5 round, 0.17 thick)
function ropeGrip(h, p, top) {
  const s = h.opts.scale, knot = (h.params.knotY ?? 1.75) / s, sx = Math.abs(h.armL.shoulder.position.x) + D_ARM_OUT + 2 * (h.sleeveOut || 0); // (a wide sleeve: the hands further out)
  const yG = shoulderY(h, p) - 0.17; // (about the chest's height: the upper arms hang by the sides, the forearms out to the ropes, clear of the big head)
  const k = clamp((yG - top) / (knot - top), 0, 1), x = Math.max((ROPE_X / s) * (1 - k), sx); // (on the rope's line, or just outside broad shoulders: swing-rig pulls the rope out through the fist)
  for (let i = 0; i < 2; i++) {
    const side = i ? -1 : 1, A = h.ik.arm[i];
    A.set('root', 'anchor', side * x, yG, 0.0); // (the arm's plane from the elbow's hint: a thumb along the rope folds the upper arm into the body)
    A.pole.set(side * 0.8, -0.6, -0.2); A.pick = 'pole';
    if (i) p.rik = 1; else p.lik = 1;
  }
}

// swingfly: flung through the air, flailing and spinning (params.spin = rad/s, default a happy tumble)
function swingfly(h, c, p) {
  const a = c.a, t = c.t;
  // The swing piece tumbles the whole root itself, so by default this pose only flails the limbs (no second spin).
  // Set params.spin (rad/s) to make the body somersault about its middle here instead.
  const spin = h.params.spin || 0;
  if (spin) {
    p.brx = (a * spin) % TAU;
    p.brz = Math.sin(a * 3) * 0.5;
    p.bry = Math.sin(a * 2.2) * 0.7;
    p.bpy = 0.85;
  }
  const hh = hipHeight(h, p);
  p.lab = 1.7 + Math.sin(a * 14) * 0.9; p.rab = 1.7 + Math.sin(a * 14 + 2) * 0.9;
  p.lsw = Math.sin(a * 11) * 1.3; p.rsw = Math.cos(a * 11) * 1.3;
  p.lel = 0.6 + Math.sin(a * 13) * 0.5; p.rel = 0.6 + Math.cos(a * 13) * 0.5;
  const ll = Math.sin(a * 12), rr = Math.sin(a * 12 + Math.PI);
  ik(h, p, 0, 0.1 * ll, h.dims.a0 + 0.14 + 0.1 * Math.max(0, ll), hh, -0.3); ik(h, p, 1, 0.1 * rr, h.dims.a0 + 0.14 + 0.1 * Math.max(0, rr), hh, -0.3);
  p.lhab = 0.35 + 0.2 * ll; p.rhab = 0.35 + 0.2 * rr;
  p.hrx = -0.3 + Math.sin(a * 9) * 0.2; p.hrz = Math.sin(a * 6) * 0.3;
  p.eyeO = 1.5; p.brow = 1.0; p.mopen = 0.95; p.smile = 0.6; p.mw = 0.9;
  void t;
}

// push: both hands out, leaning in (~0.6 s), then settle
function push(h, c, p) {
  const a = c.a, D = h.dims;
  idle(h, c, p);
  const u = a < 0.26 ? smooth(a / 0.26) : a < 0.38 ? 1 : 1 - smooth((a - 0.38) / 0.32);
  bothArms(p, 1.5, 0.16, 0.32);
  p.lsw = lerp(p.lsw, 1.5, u); p.rsw = lerp(p.rsw, 1.5, u); p.lel = lerp(p.lel, 0.3, u); p.rel = lerp(p.rel, 0.3, u);
  p.lab = lerp(p.lab, 0.18, u); p.rab = lerp(p.rab, 0.18, u);
  p.crx = 0.28 * u; p.brx = 0.16 * u; p.ppz = 0.1 * u; p.hrx = -0.2 * u;
  p.pdy -= 0.03 * u;
  const hh = hipHeight(h, p), a0 = D.a0;
  ik(h, p, 0, 0.2 * u, a0, hh, 0.1 * u); ik(h, p, 1, -0.24 * u, a0 + 0.02 * u, hh, -0.5 * u);
  p.lhab = p.rhab = 0.1;
  p.eyeO = 0.85; p.mopen = 0.35 * u; p.smile = 0.9; p.btilt = 0.2 * u;
  hands(p, HAND_REST * (1 - u) + 0.03 * u);
}

// ------------------------------------------------------------------ the dance wheel's three dances
// Ballet, ballroom and hip-hop. Each loops until you move and reads from behind and above (the default camera). h.style gives each
// person their own tempo, size and variation, the same on every screen. Keyframes over a phrase, cosine-eased, with the forearms
// and the head a moment behind.
const KCH = ['lsw', 'lab', 'lel', 'lca', 'ltw', 'rsw', 'rab', 'rel', 'rca', 'rtw', 'crx', 'cry', 'crz', 'prx', 'pry', 'prz', 'ppx', 'ppz', 'hrx', 'hry', 'hrz', 'pdy', 'shd'];
const KLAG = KCH.map(k => /^(lel|lca|ltw|rel|rca|rtw|hrx|hry|hrz)$/.test(k)); // (these from the lagged sample)
const KLEG = 10; // per key: [lfx, lfy, lan, lhab, rfx, rfy, ran, rhab, lgrip, rgrip]
// a key: [time in the phrase, { channels }, [legs]]; the channels a key leaves out are the dance's base
function makeKeys(base, list) {
  return list.map(([t, ch, legs]) => { const v = new Float32Array(KCH.length + KLEG); KCH.forEach((k, i) => { v[i] = ch[k] ?? base[k] ?? 0; }); for (let i = 0; i < KLEG; i++) v[KCH.length + i] = legs[i]; return { t, v }; });
}
const _kv = new Float32Array(KCH.length + KLEG), _kvL = new Float32Array(KCH.length + KLEG);
// the phrase at time u (looping over T) into `into`
function sampleKeys(K, T, u, into) {
  u = ((u % T) + T) % T;
  let i = K.length - 1; for (let j = 0; j < K.length; j++) if (K[j].t <= u) i = j;
  const A = K[i], B = K[(i + 1) % K.length], tb = i + 1 < K.length ? B.t : T + K[0].t, e = 0.5 - 0.5 * Math.cos(Math.PI * clamp((u - A.t) / ((tb - A.t) || 1), 0, 1));
  for (let k = 0; k < into.length; k++) into[k] = A.v[k] + (B.v[k] - A.v[k]) * e;
  return into;
}
// lay a sampled key on the pose with weight w (the forearms, hands and head from the lagged sample)
function applyKeys(h, p, v, vL, w, a0) {
  const n = KCH.length;
  for (let i = 0; i < n; i++) { const k = KCH[i]; p[k] = lerp(p[k], (KLAG[i] ? vL : v)[i], w); }
  const hh = hipHeight(h, p);
  ik(h, p, 0, v[n] * w, a0 + v[n + 1] * w, hh, v[n + 2] * w); ik(h, p, 1, v[n + 4] * w, a0 + v[n + 5] * w, hh, v[n + 6] * w);
  p.lhab = lerp(p.lhab, v[n + 3], w); p.rhab = lerp(p.rhab, v[n + 7], w);
  p.lgrip = lerp(p.lgrip, vL[n + 8], w); p.rgrip = lerp(p.rgrip, vL[n + 9], w);
}
// the dance's own clock: tempo from the look (+-7%), so a crowd dancing is not in lock step
const danceT = (c, sp = 0.14) => c.a * (1 - sp / 2 + sp * (c.sty ? c.sty[0] : 0.5));

// Ballet (a 6.4 s phrase): a plié, up onto the toes with the arms en haut, a pirouette, a plié with the arms in second, an
// arabesque, a little bow, and again.
const BALLET_BASE = { crx: -0.05, hrx: -0.12, lca: 0, rca: 0, ltw: 0.3, rtw: 0.3, shd: 0.01 };
const P_ = (fy, fx = 0, an = 0, hab = 0.16) => [fx, fy, an, hab];
const legs = (L, R, g = 0.18) => [...L, ...R, g, g];
const BALLET = makeKeys(BALLET_BASE, [
  [0.0, { lsw: 0.3, lab: 0.3, lel: 0.45, rsw: 0.3, rab: 0.3, rel: 0.45, pdy: 0 }, legs(P_(0, 0.01), P_(0, 0.01))],
  [0.8, { lsw: 1.0, lab: 0.5, lel: 0.55, ltw: 0.9, rsw: 1.0, rab: 0.5, rel: 0.55, rtw: 0.9, pdy: -0.07, hrx: -0.04, crx: 0.0 }, legs(P_(0, 0.02, 0, 0.3), P_(0, 0.02, 0, 0.3))],
  [1.6, { lsw: 0.25, lab: 2.55, lel: 0.3, lca: -0.85, rsw: 0.25, rab: 2.55, rel: 0.3, rca: -0.85, pdy: 0.05, hrx: -0.2 }, legs(P_(0.05, 0.0, -0.75, 0.12), P_(0.05, 0.0, -0.75, 0.12))],
  [2.3, { lsw: 1.0, lab: 0.5, lel: 0.55, ltw: 0.9, rsw: 1.0, rab: 0.5, rel: 0.55, rtw: 0.9, pdy: 0.05, hrx: -0.1 }, legs(P_(0.05, 0.0, -0.75, 0.08), P_(0.3, 0.06, -0.9, 0.55))],
  [3.3, { lsw: 1.0, lab: 0.5, lel: 0.55, ltw: 0.9, rsw: 1.0, rab: 0.5, rel: 0.55, rtw: 0.9, pdy: 0.05, hrx: -0.1 }, legs(P_(0.05, 0.0, -0.75, 0.08), P_(0.3, 0.06, -0.9, 0.55))],
  [3.8, { lsw: 0.25, lab: 1.45, lel: 0.25, rsw: 0.25, rab: 1.45, rel: 0.25, pdy: -0.06, hrx: -0.08 }, legs(P_(0, 0.03, 0, 0.3), P_(0, 0.03, 0, 0.3))],
  [4.5, { lsw: 1.85, lab: 0.3, lel: 0.12, rsw: -0.35, rab: 1.35, rel: 0.12, crx: 0.4, prx: 0.3, hrx: -0.3, pdy: 0.0 }, legs(P_(0, 0.05, 0, 0.1), P_(0.34, -0.42, -0.7, 0.14))],
  [5.3, { lsw: 1.9, lab: 0.3, lel: 0.12, rsw: -0.35, rab: 1.35, rel: 0.12, crx: 0.42, prx: 0.32, hrx: -0.32, pdy: 0.0 }, legs(P_(0, 0.05, 0, 0.1), P_(0.36, -0.44, -0.7, 0.14))],
  [5.9, { lsw: 0.3, lab: 0.75, lel: 0.3, rsw: 0.3, rab: 0.75, rel: 0.3, crx: 0.18, hrx: -0.06, pdy: -0.05 }, legs(P_(0, 0.03, 0, 0.18), P_(0, -0.12, 0, 0.16))],
]);
function ballet(h, c, p) {
  idle(h, c, p);
  const S = c.sty || [0.5, 0.5, 0.5, 0.5], T = 6.4, u = danceT(c), w = smooth(c.a / 0.5);
  const v = sampleKeys(BALLET, T, u, _kv), vL = sampleKeys(BALLET, T, u - 0.13, _kvL); // (anim-redo: the forearms, hands and head a longer beat behind the arms)
  applyKeys(h, p, v, vL, w, h.dims.a0);
  p.pdy += 0.006 * Math.sin(u * 1.3) * w; p.crz += 0.025 * Math.sin(u * 0.8 + 1) * w; p.shd -= 0.006 * w; // (anim-redo: a breath through the phrase, the shoulders held up)
  // the pirouette: one turn on the toes (two for some), spotting: the head stays facing front as long as it can and whips round
  const q = ((u % T) + T) % T, turns = 1, spin = smooth((q - 2.3) / 1.0); // (one turn a second: a hand moving under 10 cm a frame)
  p.bry = (TAU * turns * spin) % TAU * w;
  const sp = (q > 2.3 && q < 3.3) ? Math.sin(spin * TAU * turns) : 0; p.hry += -0.5 * sp * w;
  // a little of the person in it: how high the arms go, the head's tilt
  p.hrz += (S[3] - 0.5) * 0.2 * w; p.lab += (S[1] - 0.5) * 0.15 * w; p.rab += (S[1] - 0.5) * 0.15 * w;
  p.smile = lerp(p.smile, 0.75, w); p.eyeO = lerp(1, 0.75, w); p.brow = 0.15 * w;
}

// Hip-hop (8 beats at about 96 bpm): four beats of the bounce, two of the running man, then a freeze (arm up and fist on the hip,
// or arms folded leaning back), and again.
function hiphop(h, c, p) {
  idle(h, c, p);
  const S = c.sty || [0.5, 0.5, 0.5, 0.5], w = smooth(c.a / 0.4), D = h.dims, a0 = D.a0;
  const B = 0.625, u = danceT(c, 0.12) / B, bar = ((u % 8) + 8) % 8, beat = bar % 1, bi = Math.floor(bar);
  const big = 0.85 + 0.3 * S[1], dip = Math.pow(Math.sin(beat * Math.PI), 2) * big; // (down on the beat, up between)
  const nod = Math.sin(beat * TAU - 0.5);
  const run = smooth((bar - 3.8) / 0.3) * (1 - smooth((bar - 5.8) / 0.3)), frz = smooth((bar - 5.9) / 0.25) * (1 - smooth((bar - 7.75) / 0.25)), bounce = 1 - Math.max(run, frz);
  // the bounce
  p.pdy = lerp(p.pdy, -0.03 - 0.055 * dip * (1 - frz) - 0.04 * frz, w);
  const side = bi % 2 ? 1 : -1, sw = Math.sin((bar % 2) * Math.PI); // (the arms swing across, one bar left, one right)
  p.crx = lerp(p.crx, 0.1 + 0.08 * dip * bounce - 0.14 * frz, w); p.crz = lerp(p.crz, 0.07 * side * sw * bounce, w); p.cry = lerp(p.cry, 0.22 * Math.sin(bar * Math.PI) * bounce, w);
  p.prz = lerp(p.prz, -0.05 * side * sw * bounce, w); p.ppx = lerp(p.ppx, 0.03 * Math.sin(bar * Math.PI) * bounce, w);
  p.shd = lerp(p.shd, -0.012 * dip, w);
  p.crz += 0.045 * Math.sin(bar * TAU - 0.4) * bounce * w; p.sqz = -0.02 * dip * bounce * w; // (anim-redo: the shoulders bounce side to side off the beat, the body squashes a hair on it)
  p.hrx = lerp(p.hrx, 0.14 * nod * (1 - frz) - 0.05, w); p.hry = lerp(p.hry, -p.cry * 0.5, w); p.hrz = lerp(p.hrz, 0.05 * Math.sin(bar * TAU - 0.9) * bounce, w);
  const A = Math.sin(bar * Math.PI), AL = Math.sin(bar * Math.PI - 0.5);
  let lsw = 0.55 + 0.45 * A, rsw = 0.55 - 0.45 * A, lel = 1.55 + 0.3 * AL, rel = 1.55 - 0.3 * AL, lab = 0.4, rab = 0.4;
  // the running man: the knee up on one beat, the other foot sliding back
  const rl = bi % 2 === 0, up = Math.sin(beat * Math.PI);
  let lfx = 0.04, lfy = 0, rfx = -0.02, rfy = 0;
  if (run > 0) { // (the swinging foot comes from behind, up and forward over its beat while the planted one slides back: each ends where the other starts)
    const sx = lerp(-0.12, 0.1, smooth(beat)), sy = 0.2 * up, px = lerp(0.1, -0.12, beat);
    if (rl) { lfx = lerp(lfx, sx, run); lfy = sy * run; rfx = lerp(rfx, px, run); } else { rfx = lerp(rfx, sx, run); rfy = sy * run; lfx = lerp(lfx, px, run); }
    const pm = Math.cos(bar * Math.PI);
    lsw = lerp(lsw, 0.3 - 0.6 * pm, run); rsw = lerp(rsw, 0.3 + 0.6 * pm, run); lel = lerp(lel, 1.4, run); rel = lerp(rel, 1.4, run);
  }
  // the freeze
  let lca = 0, rca = 0, rpt = 0;
  if (frz > 0) {
    if (S[2] < 0.5) { lsw = lerp(lsw, -0.18, frz); lab = lerp(lab, 0.62, frz); lel = lerp(lel, 1.55, frz); rsw = lerp(rsw, 0.35, frz); rab = lerp(rab, 2.35, frz); rel = lerp(rel, 0.1, frz); rpt = frz; p.crz = lerp(p.crz, -0.12, frz); p.hrz = lerp(p.hrz, 0.15, frz); }
    else { lsw = lerp(lsw, 1.0, frz); lab = lerp(lab, 0.45, frz); lel = lerp(lel, 2.1, frz); rsw = lerp(rsw, 1.0, frz); rab = lerp(rab, 0.45, frz); rel = lerp(rel, 2.1, frz); p.hrx = lerp(p.hrx, -0.18, frz); }
    lfx = lerp(lfx, 0.12, frz); rfx = lerp(rfx, -0.06, frz);
  }
  p.lsw = lerp(p.lsw, lsw, w); p.rsw = lerp(p.rsw, rsw, w); p.lel = lerp(p.lel, lel, w); p.rel = lerp(p.rel, rel, w); p.lab = lerp(p.lab, lab, w); p.rab = lerp(p.rab, rab, w);
  p.lca = lerp(p.lca, lca, w); p.rca = lerp(p.rca, rca, w); p.ltw = 0.3 * w; p.rtw = 0.3 * w;
  const hh = hipHeight(h, p);
  ik(h, p, 0, lfx * w, a0 + lfy * w, hh, -0.3 * lfy / 0.2 * w); ik(h, p, 1, rfx * w, a0 + rfy * w, hh, -0.3 * rfy / 0.2 * w);
  p.lhab = lerp(p.lhab, 0.14 + 0.06 * frz, w); p.rhab = lerp(p.rhab, 0.18 + 0.06 * frz, w);
  p.rpoint = rpt; hands(p, lerp(HAND_REST, 0.75, w), lerp(HAND_REST, rpt > 0.5 ? 0.9 : 0.75, w));
  if (frz > 0 && S[2] < 0.5) p.lgrip = lerp(p.lgrip, 0.95, frz);
  p.smile = lerp(p.smile, 1.05, w); p.eyeO = lerp(1, 0.8 + 0.25 * frz, w); p.mopen = 0.15 * w * (1 - frz);
}

// Ballroom (a waltz, 3/4 at about 84 bpm): the box step, down on one and rising through two and three, the frame held with both hands
// joined to the partner's (these short arms can't reach round a partner's back). params.role 'lead' or 'follow' (dance-wheel.js,
// alone: lead), and the follower mirrors. Near the camera the joined hands meet by IK halfway to params.mate. The pair's turn round
// each other moves the roots and belongs to the pairing. Alone, the dancer turns slowly on the spot.
export const BALLROOM_GAP = 0.7; // m between partners' roots (the big heads, leaning out, just clear)
function ballroom(h, c, p) {
  idle(h, c, p);
  const S = c.sty || [0.5, 0.5, 0.5, 0.5], w = smooth(c.a / 0.5), D = h.dims, a0 = D.a0, fol = h.params.role === 'follow';
  const cnt = 0.71, u = (h.params.clock !== undefined ? h.params.clock : danceT(c, 0.08)) / cnt, // (a pair steps to the shared clock: params.clock, dance-pair.js)
    box = ((u % 6) + 6) % 6, ci = Math.floor(box), f = box - ci, e = smooth(f);
  // the box: [lead's left foot fx, lat], [right] at the start of each count; a foot moves on its count, lifted a little on the way
  const BX = [[0, 0, 0, 0], [0.18, 0, 0, 0], [0.18, 0, 0.18, -0.16], [0.18, -0.16, 0.18, -0.16], [0.18, -0.16, 0, -0.16], [0, 0, 0, -0.16]];
  const a = BX[ci], b = BX[(ci + 1) % 6];
  let lfx = lerp(a[0], b[0], e), llat = lerp(a[1], b[1], e), rfx = lerp(a[2], b[2], e), rlat = lerp(a[3], b[3], e);
  const movingL = a[0] !== b[0] || a[1] !== b[1], lift = Math.sin(f * Math.PI) * 0.035;
  let lfy = movingL ? lift : 0, rfy = movingL ? 0 : lift;
  // the box steps about the root: centre it (forward 0.09, right 0.08)
  lfx -= 0.09; rfx -= 0.09; llat += 0.08; rlat += 0.08;
  if (fol) { const t1 = lfx, t2 = llat, t3 = lfy; lfx = -rfx; llat = -rlat; lfy = rfy; rfx = -t1; rlat = -t2; rfy = t3; } // (mirrored: back for forward, legs swapped)
  const rise = -0.03 * Math.cos((box % 3) / 3 * TAU); // (down on one, up through two and three)
  p.pdy = lerp(p.pdy, -0.015 + rise, w); p.crz += 0.03 * Math.sin((box % 6) / 6 * TAU) * w; p.shd -= 0.004 * w; // (anim-redo: the frame sways with the box, the shoulders held)
  p.ppx = lerp(p.ppx, (llat + rlat) * 0.35, w); p.prz = lerp(p.prz, 0, w); p.crz = lerp(p.crz, -(llat + rlat) * 0.3 + 0.03, w);
  p.crx = lerp(p.crx, -0.1, w); p.hrx = lerp(p.hrx, -0.12, w); p.hry = lerp(p.hry, 0.45, w); p.hrz = lerp(p.hrz, 0.06, w);
  // the frame: the high hand (the leader's left, the follower's right) up to the side, the other low across
  const hiL = !fol, sh = shoulderY(h, p);
  const hi = [0.55, 1.3, 1.45], lo = [1.05, 0.42, 1.25];
  if (hiL) { p.lsw = lerp(p.lsw, hi[0], w); p.lab = lerp(p.lab, hi[1], w); p.lel = lerp(p.lel, hi[2], w); p.rsw = lerp(p.rsw, lo[0], w); p.rab = lerp(p.rab, lo[1], w); p.rel = lerp(p.rel, lo[2], w); }
  else { p.rsw = lerp(p.rsw, hi[0], w); p.rab = lerp(p.rab, hi[1], w); p.rel = lerp(p.rel, hi[2], w); p.lsw = lerp(p.lsw, lo[0], w); p.lab = lerp(p.lab, lo[1], w); p.lel = lerp(p.lel, lo[2], w); }
  p.lca = lerp(p.lca, 0, w); p.rca = lerp(p.rca, 0, w);
  const M = mateLocal(h);
  if (M && h.ik && h.ik.near) { // the joined hands halfway to the partner (alone, the frame's angles: a target fixed in the turning root's frame would pull the arms through the body)
    const d = clamp(M.d / 2, 0.2, 0.6), ux = M.x / (M.d || 1), uz = M.z / (M.d || 1);
    const hx = 0.36 * (hiL ? 1 : -1), lx = -0.3 * (hiL ? 1 : -1);
    h.ik.arm[hiL ? 0 : 1].set('root', 'palm', ux * d + hx * uz, sh + 0.12, uz * d - hx * ux).elbow(hiL ? 0.8 : -0.8, -0.8, -0.2); h.ik.arm[hiL ? 0 : 1].pick = 'pole';
    h.ik.arm[hiL ? 1 : 0].set('root', 'palm', ux * d + lx * uz, sh - 0.06, uz * d - lx * ux).elbow(hiL ? -0.8 : 0.8, -0.8, -0.1); h.ik.arm[hiL ? 1 : 0].pick = 'pole';
    p.lik = p.rik = w;
  }
  const hh = hipHeight(h, p);
  ik(h, p, 0, lfx * w, a0 + lfy * w, hh, 0); ik(h, p, 1, rfx * w, a0 + rfy * w, hh, 0);
  p.lhab = lerp(p.lhab, 0.06 + llat * 1.6, w); p.rhab = lerp(p.rhab, 0.06 - rlat * 1.6, w);
  if (!h.params.mate) p.bry = (c.a * (0.35 + 0.1 * S[0])) % TAU * w; // (alone: a slow turn on the spot)
  hands(p, lerp(HAND_REST, 0.45, w)); // (holding hands)
  p.smile = lerp(p.smile, 0.95, w); p.eyeO = lerp(1, 0.85, w);
}

const POSES = {
  idle, loco, jump, wave, cheer, dance, sit, warm, talk, laugh, point, highfive, shrug, startle, whisper, pet, look, garden, read, stretch,
  fish, cast, reel, hook, catch: catchPose, throw: throwPose, swing, swingfly, push, swim, climb, vault, sweep, drink, tiller, drive, ride,
  ballet, ballroom, hiphop, gaze, crouch, think, hammer, paint, reach, tinker, carry, lie,
};
// think (a bot or a town folk on its turn at a table game, table-games): the right elbow forward, the hand up at the chin, the head
// tipped a little, the fingers tapping slowly. Done sitting (SEATED_OK), the left hand stays on the table. Local only: not in
// codes.js ANIM_CODES (nobody's own avatar does it).
function think(h, c, p) {
  idle(h, c, p);
  const a = c.a, k = inK(c, 0.45) * outK(c), kL = inK(c, 0.45, 0.1) * outK(c, 0.06), tap = 0.5 + 0.5 * Math.sin(a * 4.2), hm = Math.sin(a * 0.55); // (anim-redo: a slow sway of the head and a glance up, thinking)
  p.rsw = lerp(p.rsw, 1.25, k); p.rab = lerp(p.rab, 0.3, k); p.rel = lerp(p.rel, 2.2, kL); p.rtw = lerp(0, -0.85, kL); p.rca = lerp(p.rca, 0, k);
  p.crx = lerp(p.crx, 0.08 + 0.02 * hm, k); p.hrz = lerp(p.hrz || 0, 0.13 + 0.04 * hm, k); p.hrx = lerp(p.hrx, 0.06 - 0.08 * Math.max(0, Math.sin(a * 0.9 - 1)), k); p.hry = lerp(p.hry, 0.06 * hm, k);
  p.brow = 0.35 * k; p.btilt = 0.15 * k; p.smile = lerp(p.smile, 0.15, k); p.mw = lerp(1, 0.85, k);
  p.rgrip = lerp(HAND_REST, 0.7 - 0.12 * tap, kL);
}
// crouch: sneaking below (Beneath Angell Street). Still, a low crouch; moving, a creeping walk on the walk's own cycle so the feet
// keep up with the ground. The pelvis down about 40% of the leg, the head lifted to see ahead, the arms forward (the lantern held low)
function crouch(h, c, p) {
  if (c.moving) loco(h, c, p); else idle(h, c, p);
  const D = h.dims, drop = D.legLen * 0.4;
  p.pdy -= drop; p.ppz -= 0.05;
  const hh = hipHeight(h, p);
  for (let i = 0; i < 2; i++) { const q = p.ikIn[i]; ik(h, p, i, p.ikSet[i] ? q[0] * 0.75 + 0.04 : 0.05, p.ikSet[i] ? q[1] : D.a0, hh, p.ikSet[i] ? q[3] * 0.6 : 0); }
  p.lhab = p.rhab = 0.13;
  p.brx += 0.06; p.crx += 0.36; p.hrx -= 0.34;
  p.lsw = 0.55 + p.lsw * 0.3; p.rsw = 0.55 + p.rsw * 0.3; p.lel = p.rel = 0.75; p.lab = p.rab = 0.18;
  p.mopen *= 0.3; p.smile = 0.3; p.eyeO = 1.08; // (holding still, wide-eyed)
}
// drive: both hands on a steering wheel (Joyce in her golf cart), easing it side to side. The legs sit (SEATED_OK, params.seatY).
function drive(h, c, p) {
  idle(h, c, p);
  const t = c.t, ph = c.ph, st = Math.sin(t * 0.7 + ph) * 0.06 + Math.sin(t * 1.9 + ph * 2) * 0.025;
  armL(p, 0.95 + st, 0.2, 0.95 - st, 0.16, 0); armR(p, 0.95 - st, 0.2, 0.95 + st, 0.16, 0);
  p.crx = 0.05; p.cry = st * 0.4; p.hry = Math.sin(t * 0.23 + ph) * 0.3; p.hrx = -0.02;
  p.smile = 0.85; p.eyeO = 1;
  hands(p, 0.72); // (round the wheel)
}

// ride (crib-move): Kevin on his motorcycle: sitting (SEATED_OK, params.seatY over the floorboards), leaning forward a little,
// both arms out and down to the grips a shoulder's width apart (nearly straight, hands closed round them), the head up and
// looking down the road with a slow sway from the road. Local only: not in ANIM_CODES.
function ride(h, c, p) {
  idle(h, c, p);
  const t = c.t, ph = c.ph, sw = Math.sin(t * 0.9 + ph) * 0.03;
  armL(p, 1.1 + sw, 0.3, 0.3, 0.05, 0.15); armR(p, 1.1 - sw, 0.3, 0.3, 0.05, 0.15);
  p.crx = 0.18; p.cry = sw * 0.3; p.hrx = -0.12; p.hry = Math.sin(t * 0.17 + ph) * 0.12;
  p.smile = 0.9; p.eyeO = 0.9;
  hands(p, 0.78); // (round the grips)
  // (town-fixes) the fists ON the grips: kevin-boat.js gives h.rideGrip (root frame, metres) from the bike's hand anchors; the
  // IK lands each hand's grip point there, the elbows a little out and down
  const G = h.rideGrip;
  if (G && h.ik) {
    const sc = h.root.scale.y || 1;
    for (let i = 0; i < 2; i++) { const side = i ? -1 : 1, A = h.ik.arm[i]; A.set('root', 'anchor', side * G[0] / sc, G[1] / sc, G[2] / sc).elbow(side * 0.9, -0.7, -0.3); A.pick = 'pole'; }
    p.lik = p.rik = 1;
  }
}
// ---- Kevin's day (kevin-day.js): sweeping the shack front, a beer in the boat, a hand on the tiller
// sweep: both hands low on a broom (kevin-boat.js hangs it from the right hand), swishing side to side
function sweep(h, c, p) {
  idle(h, c, p);
  const a = c.a, s = Math.sin(a * 2.6);
  p.crx = 0.32; p.hrx = 0.18; p.cry = s * 0.22; p.hry = -p.cry * 0.6; p.pdy = -0.03;
  p.rsw = 0.75 + s * 0.3; p.rab = 0.18; p.rel = 0.55; p.rtw = 0.2;
  p.lsw = 0.95 + s * 0.3; p.lab = -0.15; p.lel = 0.75; p.ltw = 0.2;
  p.smile = 0.6;
  stand(h, p, 0.14);
  hands(p, 0.75); // (round the broom)
}
// drink: the right hand brings the can up to the mouth, a long sip with the head back, then down again
function drink(h, c, p) {
  idle(h, c, p);
  const a = c.a, up = smooth(a / 0.6), sip = smooth((a - 0.9) / 0.5) * (1 - smooth((a - 5.2) / 0.6));
  p.rsw = lerp(0.3, 1.5 + sip * 0.15, up); p.rab = lerp(0.18, -0.12, up); p.rel = lerp(0.3, 1.25 + sip * 0.2, up); p.raz = 0; p.rtw = 0;
  p.hold = -0.85 * sip; // (the can, kept upright in the fist by human.js, tips to the mouth as he sips)
  p.hrx = -0.42 * sip; p.crx = -0.06 * sip;
  p.eyeO = 1 - 0.65 * sip; p.smile = 0.5 + 0.5 * (1 - sip); p.mopen = 0.12 * sip;
}
// tiller: the right hand back on the tiller behind him, the left on a knee, looking where he is going
function tiller(h, c, p) {
  idle(h, c, p);
  const t = c.t;
  p.rsw = -0.55 + Math.sin(t * 0.6) * 0.05; p.rab = 0.35; p.rel = 0.35; p.rtw = 0.2;
  p.lsw = 0.7; p.lab = 0.25; p.lel = 1.1;
  p.cry = -0.12; p.hry = 0.25 * Math.sin(t * 0.21 + c.ph); p.hrx = -0.02;
  p.smile = 0.75; p.eyeO = 0.9;
}
// ---- Kevin at work (tool-crib, kevin-day.js; kevin-props.js puts the tool in his right hand). Local poses: not in ANIM_CODES.
// hammer: the left hand steadies the nail, the right brings the hammer down from the elbow, a tap about every 0.7 s
function hammer(h, c, p) {
  idle(h, c, p);
  const a = c.a, s = Math.sin(a * 9), hit = Math.max(0, s) ** 0.6, up = Math.max(0, -s);
  p.crx = 0.24; p.hrx = 0.26; p.pdy = -0.02;
  p.rsw = 1.15 + up * 0.55 - hit * 0.15; p.rab = 0.16; p.rel = 0.75 + up * 0.75; p.rtw = 0.1;
  p.lsw = 0.95; p.lab = -0.05; p.lel = 0.95;
  p.smile = 0.5; p.eyeO = 0.85;
  stand(h, p, 0.13);
  hands(p, 0.55, 0.85);
}
// paint: long strokes with the brush at chest height, side to side and up and down
function paint(h, c, p) {
  idle(h, c, p);
  const a = c.a, v = Math.sin(a * 2.4), sd = Math.sin(a * 0.9);
  p.crx = 0.3; p.hrx = 0.2; p.cry = sd * 0.12; p.pdy = -0.04;
  p.rsw = 1.0 + v * 0.28; p.rab = 0.12 + sd * 0.18; p.rel = 0.55 + v * 0.15; p.rtw = 0.15;
  p.lsw = 0.35; p.lab = 0.15; p.lel = 0.5;
  p.smile = 0.75;
  stand(h, p, 0.14);
  hands(p, HAND_REST, 0.8);
}
// reach: up to a high shelf, a peg or a gutter, the hand moving a little at the top
function reach(h, c, p) {
  idle(h, c, p);
  const a = c.a, w = wig(a, 3.1);
  p.rsw = 2.35 + w * 0.08; p.rab = 0.12; p.rel = 0.35 + wig(a, 3.1, 1) * 0.15; p.rtw = 0.1;
  p.lsw = 0.55; p.lab = 0.1; p.lel = 0.45;
  p.crx = -0.04; p.hrx = -0.32; p.smile = 0.6;
  stand(h, p, 0.12);
  hands(p, HAND_REST, 0.6);
}
// tinker: both hands at work at waist height (a box of springs, a mailbox's bolt, the register, the kettle)
function tinker(h, c, p) {
  idle(h, c, p);
  const a = c.a;
  p.crx = 0.32; p.hrx = 0.3; p.pdy = -0.02;
  p.rsw = 0.95 + wig(a, 4.2) * 0.12; p.rab = -0.04; p.rel = 1.05 + wig(a, 4.2, 1) * 0.15;
  p.lsw = 0.9 + wig(a, 3.3, 2) * 0.1; p.lab = -0.04; p.lel = 1.1 + wig(a, 3.3) * 0.12;
  p.smile = 0.55; p.eyeO = 0.85;
  stand(h, p, 0.12);
  hands(p, 0.45, 0.5);
}
// carry: boards on the right shoulder, the right hand up holding them; walking or standing
function carry(h, c, p) {
  if (c.moving) loco(h, c, p); else idle(h, c, p);
  p.rsw = 1.05; p.rab = 0.38; p.rel = 2.3; p.rtw = 0.2; p.cry = -0.05; p.hrz = (p.hrz || 0) + 0.06;
  hands(p, p.lgrip ?? HAND_REST, 0.85);
}
// Upper-body poses done sitting down (Kevin on his thwart, fishing, drinking, looking round): the legs sit, the rest
// of the pose stays. seatY as in `sit`.
const SEATED_OK = new Set(['fish', 'cast', 'reel', 'hook', 'catch', 'look', 'drink', 'tiller', 'drive', 'ride', 'pet', 'talk', 'wave', 'laugh', 'point', 'idle', 'garden', 'cheer', 'shrug', 'think']);
function seatedLegs(h, c, p, name) {
  const crx = p.crx, seat = h.params.seatY || 0;
  seated(h, c, p, seat);
  p.crx = crx; p.brx = 0; p.ppz = 0;
  if (h.params.chair) { chairLegs(h, p); if (CHAIR_REST_LEFT.has(name)) chairArms(h, p, 1); }
}
// In an armchair the hand a gesture does not use stays on its armrest
const CHAIR_REST_LEFT = new Set(['talk', 'wave', 'point', 'pet', 'look', 'drink']);

// swim: the water's height and the lake bed come from swim.js (params.waterY, params.floorY, world metres), the speed from the root
// (c.rootSpd). Four ways of being in the water, blended: wading (shallower than SWIM_WADE), treading (still), the front crawl
// (moving), and diving (well under, breaststroke). Nothing here moves the root: swim.js keeps it WATER_Y - 0.3 at the surface (its
// tests read that), and the body is placed against the waterline from it (bdy), pivoting about the hips (bpy).
export const SWIM_WADE = 0.8;  // m of water under which a swimmer stands on the bed
export const SWIM_SPLASH = 4.8; // rad/s of the stroke's arm wheel (swim.js plays the hands' entries from the same clock)
const mul = (w, v) => w * v;
// one arm of the crawl at phase q (0: the hand entering ahead, pi: at the hip, round over the back to 2 pi): [sw, ab, el] into out
const _armL = [0, 0, 0], _armR = [0, 0, 0];
function crawlArm(q, out) {
  q = ((q % TAU) + TAU) % TAU;
  const pull = q < Math.PI, u = Math.sin((pull ? q : q - Math.PI));
  out[0] = Math.PI - q; // (pi: overhead, ahead in the water; 0: down at the hip; -pi: back over the top and round)
  out[1] = pull ? 0.2 + 0.1 * u : 0.45 + 0.25 * u;
  out[2] = pull ? 0.25 + 0.35 * u : 0.4 + 1.3 * u; // (the elbow high on the way over)
  return out;
}
function swim(h, c, p) {
  idle(h, c, p);
  const D = h.dims, s = h.opts.scale, R = h.root.position, t = c.t;
  const wy = h.params.waterY ?? R.y + 0.3, fy = h.params.floorY ?? R.y - 20;
  const above = (wy - R.y) / s, bed = (fy - R.y) / s;                 // the waterline and the bed over the root (body units)
  const deep = (wy - fy) / s;
  const dive = smooth((above - 0.3 / s - 0.45) / 0.5); // (the root well under its surface spot)
  const wade = (1 - smooth((deep - SWIM_WADE / s) / 0.3)) * (1 - dive);
  const mv = smooth((c.rootSpd / s - 0.3) / 1.0);
  const k = mv * (1 - wade) * (1 - dive);                              // the stroke
  const tr = (1 - mv) * (1 - wade) * (1 - dive);                       // treading
  const ph = c.ph;
  // ---- the arms and legs of each way, laid over one another by weight
  let lsw = 0, rsw = 0, lab = 0, rab = 0, lel = 0, rel = 0, laz = 0, raz = 0, ltw = 0, rtw = 0;
  let lhp = 0, rhp = 0, lkn = 0, rkn = 0, lan = 0, ran = 0, hab = 0;
  let brx = 0, cry = 0, hrx = 0, hry = 0, mo = 0, lgr = HAND_REST, rgr = HAND_REST;
  // treading: sculling arms, pedalling legs
  if (tr > 0) {
    const sc = Math.sin(t * 2.4 + ph), sc2 = Math.sin(t * 2.4 + ph + 0.7), pd = t * 3.1 + ph;
    lsw += mul(tr, 0.42 + 0.32 * sc); rsw += mul(tr, 0.42 - 0.32 * sc); lab += mul(tr, 1.12 + 0.1 * sc2); rab += mul(tr, 1.12 - 0.1 * sc2);
    lel += mul(tr, 0.45 + 0.15 * sc2); rel += mul(tr, 0.45 - 0.15 * sc2); ltw += mul(tr, 0.6 * sc2); rtw += mul(tr, -0.6 * sc2);
    lhp += mul(tr, 0.55 + 0.35 * Math.sin(pd)); rhp += mul(tr, 0.55 + 0.35 * Math.sin(pd + Math.PI)); lkn += mul(tr, 0.95 + 0.45 * Math.sin(pd + 1.2)); rkn += mul(tr, 0.95 + 0.45 * Math.sin(pd + 1.2 + Math.PI));
    lan += mul(tr, -0.3); ran += mul(tr, -0.3); hab += mul(tr, 0.2);
    brx += mul(tr, 0.12); hrx += mul(tr, -0.12); hry += mul(tr, 0.25 * Math.sin(t * 0.37 + ph));
    mo += mul(tr, 0.2 * Math.max(0, Math.sin(t * 1.3 + ph)) ** 4);
  }
  // the stroke: the front crawl
  if (k > 0) {
    const f = t * SWIM_SPLASH, L = crawlArm(f, _armL), Rr = crawlArm(f + Math.PI, _armR);
    lsw += mul(k, L[0]); lab += mul(k, L[1]); lel += mul(k, L[2]); rsw += mul(k, Rr[0]); rab += mul(k, Rr[1]); rel += mul(k, Rr[2]);
    ltw += mul(k, 0.5); rtw += mul(k, 0.5);
    const kick = Math.sin(f * 2.4 + ph);
    lhp += mul(k, 0.12 + 0.28 * kick); rhp += mul(k, 0.12 - 0.28 * kick); lkn += mul(k, 0.3 + 0.2 * Math.max(0, -kick)); rkn += mul(k, 0.3 + 0.2 * Math.max(0, kick));
    lan += mul(k, -0.75); ran += mul(k, -0.75); hab += mul(k, 0.08);
    brx += mul(k, 1.0); cry += mul(k, 0.28 * Math.sin(f + 0.4)); // (the body rolls with the arms)
    const breath = Math.max(0, Math.sin(f * 0.5 + 0.6)) ** 3; // (to the side every second stroke)
    hrx += mul(k, -1.15 + 0.05 * Math.sin(f * 2)); hry += mul(k, -0.3 * Math.sin(f + 0.4) + 0.5 * breath); mo += mul(k, 0.45 * breath);
    lgr = lerp(lgr, 0.12, k); rgr = lerp(rgr, 0.12, k);
  }
  // diving: head first, breaststroke
  if (dive > 0) {
    const f = t * 2.6 + ph, cyc = (Math.sin(f) + 1) / 2, pullK = Math.max(0, Math.sin(f));
    const tip = clamp(-c.vy * 0.35, -0.6, 0.6);
    lsw += mul(dive, lerp(2.9, 1.3, pullK)); rsw += mul(dive, lerp(2.9, 1.3, pullK)); lab += mul(dive, lerp(0.25, 1.1, pullK)); rab += mul(dive, lerp(0.25, 1.1, pullK));
    lel += mul(dive, 0.2 + 0.6 * pullK); rel += mul(dive, 0.2 + 0.6 * pullK);
    lhp += mul(dive, 0.2 + 0.5 * (1 - cyc)); rhp += mul(dive, 0.2 + 0.5 * (1 - cyc)); lkn += mul(dive, 0.3 + 1.0 * (1 - cyc)); rkn += mul(dive, 0.3 + 1.0 * (1 - cyc));
    lan += mul(dive, -0.8); ran += mul(dive, -0.8); hab += mul(dive, 0.25 * (1 - cyc));
    brx += mul(dive, 1.5 + tip); hrx += mul(dive, -0.7); mo += mul(dive, 0);
  }
  // wading: standing on the bed, arms up out of the water, high steps while moving
  if (wade > 0) {
    const st = t * 5.2 + ph, wk = mv;
    lsw += mul(wade, 0.35 + 0.25 * Math.sin(st) * wk); rsw += mul(wade, 0.35 - 0.25 * Math.sin(st) * wk); lab += mul(wade, 0.75); rab += mul(wade, 0.75);
    lel += mul(wade, 0.7); rel += mul(wade, 0.7);
    // (the legs below through the IK, so the feet stand on the bed)
    brx += mul(wade, 0.08 * wk); hrx += mul(wade, -0.05);
  }
  p.lsw = lsw; p.rsw = rsw; p.lab = lab; p.rab = rab; p.lel = lel; p.rel = rel; p.laz = laz; p.raz = raz; p.ltw = ltw; p.rtw = rtw; p.lca = p.rca = 0;
  p.cry = cry; p.hrx = hrx; p.hry = hry; p.hrz = 0; p.crx = 0.05 * (1 - wade); p.crz = 0; p.ppx = 0; p.prz = 0; p.shd = 0;
  p.lgrip = lgr; p.rgrip = rgr;
  // ---- the body against the water: tipped about the hips, the shoulders at the waterline (or the feet on the bed)
  p.bpy = D.legLen; p.brx = brx;
  const sy = shoulderY(h, p), ys = D.legLen + (sy - D.legLen) * Math.cos(brx); // (the shoulders' height once tipped)
  const bob = 0.022 * Math.sin(t * 2.2 + ph) * (1 - wade) * (1 - dive);
  let bdy = above - ys + 0.02 + bob;                                 // floating: the shoulders a hair under the water
  bdy = lerp(bdy, Math.max(bed, Math.min(bdy, above - 0.35)), wade);  // wading: the feet on the bed (never deeper than the water lets it)
  bdy = lerp(bdy, 0, dive);                                          // diving: the body where the swimmer is
  if (dive < 0.5) bdy = Math.max(bdy, bed);                           // (the feet never through the bed: an upright treader in shallow water rises)
  p.bdy = bdy;
  // the legs: set directly while floating or diving; standing in the shallows they step on the bed by the IK
  if (wade > 0.5) {
    const st = t * 5.2 + ph, hh = hipHeight(h, p), a0 = D.a0;
    ik(h, p, 0, 0.1 * Math.sin(st) * mv, a0 + Math.max(0, Math.sin(st)) * 0.16 * mv, hh, 0); ik(h, p, 1, -0.1 * Math.sin(st) * mv, a0 + Math.max(0, -Math.sin(st)) * 0.16 * mv, hh, 0);
    p.lhab = p.rhab = 0.08;
  } else {
    p.lhp = lhp; p.rhp = rhp; p.lkn = lkn; p.rkn = rkn; p.lan = lan; p.ran = ran; p.lhab = p.rhab = 0.08 + hab; p.lld = p.rld = 0; p.legsSet = true;
  }
  p.smile = 0.55 - 0.2 * k; p.mopen = mo; p.eyeO = 1 - 0.3 * dive;
}
// vault: over a fence in one flow: the body folds forward over the hands, the legs swing up and to the side, then
// unfold for the landing (c.a is the time into it; the whole thing is about 0.66 s)
function vault(h, c, p) {
  idle(h, c, p);
  const k = clamp(c.a / 0.66, 0, 1), up = Math.sin(k * Math.PI), tuck = Math.sin(clamp((k - 0.15) / 0.6, 0, 1) * Math.PI);
  p.crx = 0.35 + up * 0.75; p.prx = 0.15 + up * 0.35; p.hrx = -0.35 - up * 0.25;
  p.lsw = 1.15 + up * 0.5; p.rsw = 1.15 + up * 0.5; p.lab = p.rab = 0.32; p.lel = p.rel = 0.08 + (1 - up) * 0.4; p.laz = p.raz = 0;
  p.lhp = 0.2 + tuck * 1.35; p.rhp = 0.2 + tuck * 1.05; p.lkn = 0.3 + tuck * 1.5; p.rkn = 0.3 + tuck * 1.2;
  p.lhab = 0.12 + tuck * 0.55; p.rhab = 0.1 + tuck * 0.15; p.lan = p.ran = 0.2 * tuck; p.prz = tuck * 0.35; p.legsSet = true;
  p.smile = 0.5; p.mopen = up * 0.25; p.brow = up * 0.3;
}
// climb: hands up the steel one after the other, knees up, face to the wall
function climb(h, c, p) {
  idle(h, c, p);
  const t = c.t * 3.0, s = Math.sin(t);
  p.crx = 0.15; p.hrx = -0.5;
  p.lsw = 2.5 + s * 0.35; p.rsw = 2.5 - s * 0.35; p.lab = p.rab = 0.45; p.lel = 0.9 - s * 0.3; p.rel = 0.9 + s * 0.3; p.laz = p.raz = 0;
  p.lhp = 0.9 + s * 0.4; p.rhp = 0.9 - s * 0.4; p.lkn = 1.5 + s * 0.3; p.rkn = 1.5 - s * 0.3; p.lhab = p.rhab = 0.25; p.lan = p.ran = 0.2; p.legsSet = true;
  hands(p, 0.8); // (round the rungs)
  if (IK_WORLD.climb && h.ik && h.ik.near) climbHolds(h, c, p);
}
// Near the camera a climber's hands go on the rungs or holds in front of them (IK_WORLD.climb, from where the climber is alone, so
// everyone sees the same). Each hand eases to its grip (open on the way, closed there) and stays on it while the body climbs past.
// The hold is turned into the root's frame by hand (the root turns about y only and scales evenly). One small object a climb.
const _cgL = [0, 0, 0], _cgR = [0, 0, 0];
function climbHolds(h, c, p) {
  const R = h.root, sc = R.scale.y || 1;
  const bits = IK_WORLD.climb(R.position.x, R.position.y, R.position.z, sc, _cgL, _cgR);
  let G = h._climbG;
  if (!bits) { if (G) { G.on[0] = G.on[1] = 0; G.s[0] = G.s[1] = G.s[2] = 0; } return; }
  if (!G) G = h._climbG = { p: [[0, 0, 0], [0, 0, 0]], on: [0, 0], t: 0, s: [0, 0, 0], w: [0, 0, 0] };
  if (c.t - G.t > 0.5) { G.on[0] = G.on[1] = 0; G.s[0] = G.s[1] = G.s[2] = 0; } // (a new climb: the hands start on their grips)
  G.t = c.t;
  const cy = Math.cos(R.rotation.y), sy = Math.sin(R.rotation.y), k = Math.min(1, (c.dt || 1 / 60) * 14);
  const L = h.ik.arm[0].pos, Rr = h.ik.arm[1].pos; // (the asks' points, root frame: filled below, then the body comes to them)
  for (let i = 0; i < 2; i++) {
    if (!(bits & (i ? 2 : 1))) { G.on[i] = 0; continue; }
    const t = i ? _cgR : _cgL, q = G.p[i];
    if (!G.on[i] || Math.hypot(t[0] - q[0], t[1] - q[1], t[2] - q[2]) > 1.5) { q[0] = t[0]; q[1] = t[1]; q[2] = t[2]; G.on[i] = 1; } // (a grip a long way off: a new place, not a reach)
    const d = Math.hypot(t[0] - q[0], t[1] - q[1], t[2] - q[2]);
    q[0] += (t[0] - q[0]) * k; q[1] += (t[1] - q[1]) * k; q[2] += (t[2] - q[2]) * k;
    const wx = q[0] - R.position.x, wy = q[1] - R.position.y + Math.min(0.08, d * 0.3), wz = q[2] - R.position.z; // (a little lift on the way)
    const side = i ? -1 : 1;
    h.ik.arm[i].set('root', 'anchor', (cy * wx - sy * wz) / sc, wy / sc, (sy * wx + cy * wz) / sc).face('palm', 0, -0.5, 1).elbow(side * 0.8, -1, -0.3);
    if (i) { p.rik = 1; p.rgrip = d > 0.05 ? 0.05 : 0.85; } else { p.lik = 1; p.lgrip = d > 0.05 ? 0.05 : 0.85; }
  }
  climbReach(h, G, L, Rr, sc, cy, sy, c.dt || 1 / 60);
  p.ppx += G.s[0]; p.pdy += G.s[1]; p.ppz += G.s[2];
}
// (tower-hands) the climber's body comes to the grips rather than an arm stretching to them: where each hand's grip is out of the arm's
// reach (Lu + Lf and the hand to its grip point) from its shoulder, the hips (and all above them) move toward it, forward and up,
// as far as both grips need (a few passes), eased. The shoulders are read from the last frame's pose, less the move it had then.
const REACH_K = 0.97, REACH_MAX = [0.15, 0.9, 0.6]; // (most the body moves: sideways, up, toward the steel; root units)
function climbReach(h, G, L, Rr, sc, cy, sy, dt) {
  const D = h.dims, reach = (D.Lu + D.Lf) * REACH_K + 0.1, R = h.root, w = G.w;
  w[0] = w[1] = w[2] = 0;
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < 2; i++) {
    if (!G.on[i]) continue;
    const a = i ? h.armR : h.armL, e = a.shoulder.matrixWorld.elements, T = i ? Rr : L;
    const wx = e[12] - R.position.x, wz = e[14] - R.position.z;
    const sx = (cy * wx - sy * wz) / sc - G.s[0], sy2 = (e[13] - R.position.y) / sc - G.s[1], sz = (sy * wx + cy * wz) / sc - G.s[2];
    const vx = T.x - sx - w[0], vy = T.y - sy2 - w[1], vz = T.z - sz - w[2], d = Math.hypot(vx, vy, vz);
    if (d <= reach) continue;
    const f = (d - reach) / d; w[0] += vx * f; w[1] += vy * f; w[2] += vz * f;
  }
  for (let j = 0; j < 3; j++) { const t = clamp(w[j], j === 2 ? 0 : -REACH_MAX[j], REACH_MAX[j]); G.s[j] += (t - G.s[j]) * Math.min(1, dt * (Math.abs(t) > Math.abs(G.s[j]) ? 30 : 8)); } // (quick to reach, slow to settle back)
}

// ---- carrying the rod
// Out of the fishing poses the rod is carried like a fishing pole: the right hand low and forward, the pole angled
// up, forward and out to the side. Its angle is held in the chest's frame (human.js), not the hand's, so whatever
// the arm does it never swings through the head or a hat. Poses that gesture with the right hand use the left one.
const ROD_WORK = new Set(['fish', 'cast', 'reel', 'hook']);
const RIGHT_HANDED = new Set(['wave', 'point', 'highfive', 'whisper', 'talk', 'pet', 'garden']);
function swapArms(p, h) {
  let t;
  t = p.lsw; p.lsw = p.rsw; p.rsw = t; t = p.lab; p.lab = p.rab; p.rab = t; t = p.lel; p.lel = p.rel; p.rel = t;
  t = p.laz; p.laz = p.raz; p.raz = t; t = p.ltw; p.ltw = p.rtw; p.rtw = t; t = p.lca; p.lca = p.rca; p.rca = t;
  t = p.lgrip; p.lgrip = p.rgrip; p.rgrip = t; t = p.lpoint; p.lpoint = p.rpoint; p.rpoint = t;
  p.cry = -p.cry; p.crz = -p.crz; p.hry = -p.hry; p.hrz = -p.hrz; // lean the other way too
  // the arms' targets go with them, mirrored
  t = p.lik; p.lik = p.rik; p.rik = t;
  if (h && h.ik) h.ik.arm[0].swapWith(h.ik.arm[1]);
}
function carryRod(h, c, p, name) {
  if (RIGHT_HANDED.has(name)) swapArms(p, h);
  if ((h.params.seatY || 0) > 0.15 && SEAT_REST.has(name) && !h.params.chair) { // (sitting, the pole rests forward and up over the knees, the fist on the thigh)
    p.carry = 1; p.cpit = 0.62 - CARRY_EL; p.cyaw = 0.12 - CARRY_AZ;
    return;
  }
  const loco = name === 'loco', wk = loco ? clamp(c.speed / 2, 0, 1) : 0, run = loco ? c.runK : 0, two = c.cyc * TAU;
  // the pole rests over the right shoulder, about 130 degrees from forward and a touch out so it clears the head and any hat.
  // It bobs a little with the steps and tips forward at a run.
  p.rsw = 1.32 + 0.06 * Math.cos(two) * wk + 0.15 * run;
  p.rab = 0.28; p.rel = 2.25 - 0.05 * wk; p.raz = 0.1; p.rtw = 0;
  p.carry = 1;
  p.cpit = (2.28 - CARRY_EL) + 0.05 * Math.sin(two * 2 - 0.9) * wk - 0.25 * run + (name === 'jump' ? 0.1 : 0);
  p.cyaw = (0.22 - CARRY_AZ) + 0.04 * Math.sin(two) * wk;
}

// ------------------------------------------------------------------ the pose in the world it is in (bodies-ik.js)

// Hands resting on a table top. `params.table` (world, bodies-ik.js tableInside has the shapes) is set by whoever sat this person at
// one. Which hands rest is per pose (bits: 1 left, 2 right), so the hand a gesture uses stays free. A hand with something hanging
// from it is never put down (human.js keeps it above the top), a book or notepad stands on its edge. A top the short arms can't
// reach is reached by leaning the chest forward, never by stretching.
const TABLE_REST = { sit: 3, idle: 3, look: 3, talk: 1, point: 1, wave: 1, drink: 1, highfive: 1, think: 1 };
const TABLE_IN = 0.1; // m in from the edge the palms lie
function tableRest(h, c, p, name, swapped) {
  const T = h.params.table;
  let bits = T ? TABLE_REST[name] || 0 : 0;
  if (swapped) bits = ((bits & 1) << 1) | ((bits & 2) >> 1); // (the gesture went to the other hand)
  if (!bits) return;
  const D = h.dims, s = h.opts.scale, R = h.root.position, yaw = h.root.rotation.y;
  const ahead = tableAhead(T, R.x, R.z, Math.sin(yaw), Math.cos(yaw)) / s;
  if (!(ahead > -0.25 && ahead < 0.8)) return; // (not sat at it)
  const yT = (T.y - h.root.position.y) / s + PALM_CLEAR, xT = Math.max(0.17, h.armL.shoulder.position.x * 0.8, (h.fit ? h.fit.pelvis.max : 0) + 0.03); // (the hands a little inside the shoulders' line, outside the hips and a skirt)
  // the shoulders' place in the root's frame for a lean crx (human.js shares a deep bend with the pelvis: the waist turns by that
  // share, the chest by all of it), and the lean (no more than TABLE_LEAN) that brings the top within the arms' reach
  const L = D.torsoTop - 0.105, sX = h.armL.shoulder.position.x, hipY = D.legLen + p.pdy, reach = (D.Lu + D.Lf) * 0.96;
  let zT = Math.min(ahead + TABLE_IN, 0.55), crx = p.crx;
  let f = tableFar(crx, p, D, L, hipY, xT, sX, yT, zT, reach);
  while (f > 0 && crx < TABLE_LEAN) { crx = Math.min(TABLE_LEAN, crx + 0.025); f = tableFar(crx, p, D, L, hipY, xT, sX, yT, zT, reach); }
  if (f > 0) { zT = Math.max(ahead - 0.04, zT - f); f = tableFar(crx, p, D, L, hipY, xT, sX, yT, zT, reach); } // (even leaning it is short: the hands at the very edge, or just off it)
  if (f > 0.03) return; // (out of reach even so: the hands stay as the pose has them, in the lap, not stopped short in mid-air)
  p.crx = Math.max(p.crx, crx);
  for (let i = 0; i < 2; i++) {
    if (!(bits & (i ? 2 : 1))) continue;
    const side = i ? -1 : 1, A = h.ik.arm[i];
    const hang = i ? (h.lantern || h.candle || h.balloon || h.held) : null;
    if (hang) continue; // (what hangs from it would go through the top, a carried pole would lie across it: left to the pose, held above the top by human.js)
    const held = (i ? h.armR : h.armL).hand.shape === 'grip'; // (a fist round a pencil, a treat; a book or notepad stood on its edge: the hand as far above the top as human.js measured it reaching below its anchor)
    const item = i ? null : (h.book || h.notepad);
    A.set('root', item ? 'anchor' : held ? 'restg' : 'rest', side * xT, yT + (item ? h.ik.below[i] : 0), zT);
    REST_FACE(side, A.dir); A.facing = 'palm'; A.rest = true;
    if (i) { p.rik = 1; p.rgrip = Math.min(p.rgrip, HAND_REST); }
    else { p.lik = 1; p.lgrip = Math.min(p.lgrip, HAND_REST); }
  }
}
const TABLE_LEAN = 0.26; // rad: the most a sitter leans in to reach the top

// Sitting at ease, near the camera the hands rest on something by IK: the thighs, the knees, the lap, or the seat beside the hips
// where the short arms reach it. Which is per person from h.style (the same on every screen), so a bench of people doesn't sit
// identically. Armchairs and tables are chairArms' and tableRest's. A lantern or candle stands on the seat beside the hip, a book
// or notepad on its edge on the thigh, a fist on the thigh, the rod over the knees.
const SEAT_REST = new Set(['sit', 'idle', 'look']);
const _seatPt = { x: 0, y: 0, z: 0 };
function thighTop(h, p, i, d, inward = 0) { // a point on top of thigh i, d along it from the hip (root frame); inward: toward the middle (thigh radii)
  const D = h.dims, side = i ? -1 : 1, hab = i ? p.rhab : p.lhab, hh = hipHeight(h, p);
  _seatPt.x = side * (D.hipX + Math.sin(hab) * d - inward * D.legR + 0.01); /* (a centimetre out: the forearm clear of a coat's front) */ _seatPt.y = hh + D.legR * Math.sqrt(Math.max(0.2, 1 - inward * inward)); _seatPt.z = p.ppz + d * Math.cos(hab);
  return _seatPt;
}
function seatRest(h, c, p, name) {
  const seat = h.params.seatY || 0;
  if (!(seat > 0.15) || h.params.chair || h.params.table || !SEAT_REST.has(name)) return; // (at a table, tableRest decides: on the top, or the pose's own lap)
  const hug = h.params.snug && h.params.snug.role === 'arm' && (h.params.snug.k ?? 1) > 0.02 ? (h.params.snug.side < 0 ? 1 : 0) : -1; // (the arm round a snuggling partner: house-rest)
  const D = h.dims, st = h.style || DEF_STYLE, s = h.opts.scale, hh = hipHeight(h, p);
  const sY = shoulderY(h, p) - p.shd, sX = h.armL.shoulder.position.x, reach = (D.Lu + D.Lf) * 0.97 + 0.15 * D.shape.handK[1];
  // beside the hips on the seat: past the pelvis' side (its envelope) and a hand's width
  const xB = Math.max(D.hipX + D.legR, h.fit ? h.fit.pelvis.max : 0.2) + 0.06, zB = p.ppz + 0.03;
  const benchOK = Math.hypot(xB - sX, seat - sY, zB) < reach;
  const z1 = D.Lt + 0.02, z0 = Math.min(z1, Math.max(D.Lt * 0.4, h.clothReachAt ? h.clothReachAt(D.legR - D.waist, 0, 1) + 0.1 : 0)); // (the thigh's reach in front of the body)
  const mode = st[0] < 0.36 ? 'thigh' : st[0] < 0.62 ? 'knee' : st[0] < 0.82 ? 'lap' : 'bench';
  for (let i = 0; i < 2; i++) {
    const side = i ? -1 : 1, A = h.ik.arm[i], hand = i ? h.handR : h.handL, other = (st[3] > 0.5) === !!i; // (the hand that does a little differently)
    if (i === hug) continue;
    let item = hand.children.length ? (i ? (h.lantern || h.candle ? 'hang' : h.held === 'rod' ? 'rod' : h.heldObj || h.balloon ? 'fist' : hand.children.length > 1 || h.notepad ? 'pencil' : 'fist') : (h.book || h.notepad ? 'book' : 'fist')) : null;
    if (item === 'pencil' && !i) item = 'book';
    if (h.balloon && i) continue; // (a balloon floats up from its hand: that arm stays as the pose has it)
    if (item === 'hang') { // the lantern on the seat beside the hip, its base on it
      const g = h.lantern || h.candle, c8 = g.userData.corners; let lo = 0; if (c8) for (let q = 1; q < c8.length; q += 3) lo = Math.min(lo, c8[q]);
      const below = -(g.position.y + lo); // (it hangs level: its base this far under the anchor)
      A.set('root', 'anchor', side * (xB + 0.04), seat + below, zB + 0.02); A.pole.set(side * 0.7, -0.3, -0.5); A.pick = 'pole';
    } else {
      const m = item === 'book' || item === 'pencil' || item === 'rod' || item === 'fist' ? 'thigh' : mode === 'bench' && !benchOK ? 'thigh' : mode === 'bench' && other ? 'thigh' : mode;
      if (m === 'bench') A.set('root', 'rest', side * xB, seat + PALM_CLEAR, zB);
      else {
        // (along the thigh from in front of the shirt or belly over it, the hand's heel and the wrist clear of it, to the knee)
        const f = m === 'knee' ? 0.88 + 0.12 * st[2] : m === 'lap' ? 0.55 + 0.2 * st[2] : 0.3 + 0.25 * st[2] + (other ? 0.15 : 0);
        const q = thighTop(h, p, i, z0 + (z1 - z0) * f, m === 'lap' ? 0.6 : 0.15);
        if (item === 'book') A.set('root', 'anchor', q.x, q.y + (h.book ? 0.13 : 0.11), q.z); // (stood on its edge on the thigh: about this far under the hand; the book's bottom edge 0.145 under its anchor less the palm's turn)
        else A.set('root', item ? 'restg' : 'rest', q.x, q.y + PALM_CLEAR + 0.004, q.z); // (the thigh is round: a hair over its top line)
      }
      if (item !== 'book') { REST_FACE(side, A.dir); A.facing = 'palm'; A.rest = true; }
      if (A.rest && item !== 'hang') A.facing = null; // (the palm as the arm brings it: turned flat down, the untwisted forearm puts the elbows out like wings)
      A.pole.set(side * 0.3, -1, -0.6); A.pick = 'pole'; // (the elbows down and back by the sides)
    }
    // (out of reach on an extreme build: the hand stays in the lap as the pose has it, not stopped short in mid-air)
    if (Math.hypot(A.pos.x - side * sX, A.pos.y - sY, A.pos.z - p.ppz - (sY - hh) * Math.sin(p.crx)) > reach + (A.point === 'anchor' ? 0.12 : 0)) { A.on = false; continue; }
    if (i) { p.rik = 1; if (!item) p.rgrip = Math.min(p.rgrip, HAND_REST); } else { p.lik = 1; if (!item) p.lgrip = Math.min(p.lgrip, HAND_REST); }
  }
  if (h.held === 'rod' && p.carry > 0.5) { p.cpit = 0.62 - CARRY_EL + 0.03 * Math.sin(c.t * 0.7 + c.ph); p.cyaw = 0.12 - CARRY_AZ; } // (the pole forward and up over the knees, resting)
  void s;
}
// how far the resting hand's spot is beyond the arm's reach for a lean (the wrist sits a little above the resting hand)
function tableFar(lean, p, D, L, hipY, xT, sX, yT, zT, reach) {
  const bend = Math.sign(lean) * Math.max(0, Math.abs(lean) - 0.12) * 0.6;
  const yS = hipY + D.waist * Math.cos(bend) + L * Math.cos(lean), zS = p.ppz + D.waist * Math.sin(bend) + L * Math.sin(lean);
  return Math.sqrt((zT - zS) ** 2 + (yT + 0.03 - yS) ** 2 + (xT - sX) ** 2) - reach;
}

// The hand that holds nothing goes to what the other holds: the pole (both hands on it, the left up it), a book or a notepad (the
// right hand on the page). human.js finds the point each frame from the holding hand (`follow`).
function followHand(h, p, name) {
  if (h.held === 'rod' && ROD_WORK.has(name)) { h.ik.arm[0].set('root', 'anchor').follow = 'rod'; p.lik = 1; }
  else if ((h.book || h.notepad) && name === 'read') { h.ik.arm[1].set('root', h.book ? 'palm' : 'anchor').follow = h.book ? 'book' : 'notepad'; p.rik = 1; }
}

// The feet on the real ground (bodies-ik.js footGround): each leg that went through ik() this pose is solved again with its
// foot lifted or dropped by the ground under it, and when a planted foot cannot reach down to its ground the hips come down
// (standing; on a seat they stay) and both legs are solved once more.
function groundFeet(h, c, p) {
  const K = h.ik;
  if (!K || !K.near) return;
  const D = h.dims, seated = (h.params.seatY || 0) > 0.15, maxD = (D.Lt + D.Ls) * 0.985;
  let drop = 0;
  for (let i = 0; i < 2; i++) {
    if (!p.ikSet[i]) { K.foot[i].dy = 0; continue; }
    const q = p.ikIn[i], fx = q[0], fy = q[1], hipH = q[2], an = q[3], side = i ? -1 : 1, hab = i ? p.rhab : p.lhab;
    const dy = footGround(h, i, fx, side * (D.hipX + Math.sin(hab) * D.Lr * 0.6) + p.ppx, c.dt), planted = fy <= D.a0 + 0.045;
    const pitch = K.foot[i].pitch; // (the foot lies to the slope under it, swinging too, on top of the pose's own pitch)
    if (dy === 0 && pitch === 0) continue;
    ik(h, p, i, fx, fy + dy, hipH, an + pitch);
    q[1] = fy; q[3] = an; // (ik() remembered the lifted foot: keep the pose's own)
    if (!seated && dy < 0 && planted) {
      const ax = fx - p.ppz, need = Math.hypot(ax, hipH - fy - dy);
      if (need > maxD) drop = Math.max(drop, Math.min(HIP_DROP, hipH - fy - dy - Math.sqrt(Math.max(0, maxD * maxD - ax * ax))));
    }
  }
  if (drop > 0) {
    p.pdy -= drop;
    for (let i = 0; i < 2; i++) { if (!p.ikSet[i]) continue; const q = p.ikIn[i], fy = q[1], an = q[3]; ik(h, p, i, q[0], fy + K.foot[i].dy, q[2] - drop, an + K.foot[i].pitch); q[1] = fy; q[2] += drop; q[3] = an; }
  }
}

// Fill `p` (already reset) with the pose `name`.
export function computePose(h, name, c, p) {
  (POSES[name] || idle)(h, c, p);
  let swapped = false;
  if (h.held === 'rod' && !ROD_WORK.has(name)) { carryRod(h, c, p, name); swapped = RIGHT_HANDED.has(name); }
  else if ((h.lantern || h.balloon || h.trowel || h.candle) && RIGHT_HANDED.has(name) && name !== 'garden') { swapArms(p, h); swapped = true; } // the hand holding something stays down
  if (!p.legsSet) stand(h, p, 0.05);
  if ((h.params.seatY || 0) > 0.15 && SEATED_OK.has(name)) seatedLegs(h, c, p, name);
  // (does nothing: each pose sets the head's turn itself)
  if (name !== 'loco' && name !== 'swingfly') p.hry += 0;
  // hands to what they should touch, feet to the ground under them: only near the camera (human.js sets h.ik.near)
  if (h.ik && h.ik.near) {
    seatRest(h, c, p, name); tableRest(h, c, p, name, swapped); followHand(h, p, name); if (!OFF_GROUND.has(name)) groundFeet(h, c, p);
    if (name === 'sit' && (h.params.seatY || 0) >= 0.15) { const r = sitReach(c); if (r > 0) { p.lik *= 1 - r; p.rik *= 1 - r; } } // (anim-redo: the hands reach for the seat on the way down, then rest)
  }
}
const OFF_GROUND = new Set(['jump', 'swing', 'swingfly', 'swim', 'climb', 'vault', 'lie']); // (in the air or on the rope: the feet do not reach for the ground)
