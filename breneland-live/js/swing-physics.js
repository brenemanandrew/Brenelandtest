// The pendulum behind the tire swing. Pure numbers and functions (no THREE, no DOM) so the game, the server's sanity
// checks and tools/swing-sim.mjs all use the very same model. The rider's client is the physics authority.
//
// Conventions: theta is the rope angle from straight down, + = forward (north, -z; the rider faces north), radians.
// omega is d(theta)/dt. The seat sits at pivot + L * (0, -cos theta, -sin theta).
// "Height" is how far the seat has climbed above its lowest point, in metres: L * (1 - cos theta).
// Speed is measured as the bottom-of-the-arc speed the swing *would* have (vb), so the danger reading is steady
// instead of flickering up and down through every swing.

export const SW = {
  L: 3.5,            // rope length, pivot to seat centre (m)
  G: 19,             // swing gravity: tuned for fun, a full swing takes about 2.7 s at small angles
  DAMP: 0.085,       // 1/s: no pumping and it slowly winds down
  V_SAFE: 8.8,       // bottom speed (m/s) where the danger band turns red (height about 2.0 m)
  WARN: 0.86,        // danger (vb / V_SAFE) where the band starts: the rope starts to complain
  HARD: 1.28,        // danger where your hands let go no matter how tightly you hold
  GRIP_DRAIN: 0.22,  // grip per second at danger 1.0 (it climbs steeply above that)
  GRIP_REGEN: 0.20,  // grip per second when you are below the warning band
  MAX_H: 3.6,        // top of the gauge (m)
  PUMP_GAP: 0.32,    // pumping faster than this counts as flailing
  PUSH_GAP: 0.8,     // per pusher cooldown (s)
  PUSH_TIME: 0.5,   // a shove is a push that follows the seat for this long (s)
  PUSH_ACC: 6.2,     // its angular acceleration (rad/s^2)
  PUSH_REACH: -0.1,  // their hands are behind you: the tire is only in reach on the back half of the arc (rad)
  PUSH_HAND: 5.6,    // a friend cannot push a seat that is already moving faster than this (m/s)...
  PUSH_HAND_HI: 2.4, // ...plus up to this much more high up (they run with it, so a push still counts up there)
  PUSH_GOOD: 0.75,   // a push this well timed (pushEff) is a "Nice push!"
  LAUNCH_TH: 0.3,    // an out-of-control swing lets go on the way up, once past this angle
  FLY_G: 12.5,       // gravity in the air: floaty, because it is funnier
  SEAT_DROP: 0.45,   // feet origin sits this far below the seat, along the rope
  SEAT_REST_H: 0.85, // seat height above the ground at rest (set by the tree: pivot y - L)
};

export const newSwing = (th = 0, w = 0) => ({
  th, w, t: 0, pushT: 0, pushA: 0, grip: 1, best: 0, bestV: 0, doomed: false, doomT: 0, lastPump: -9, pumps: 0, perfects: 0, pushes: 0,
  lastEvent: '', slipTh: 0.4, rand: null,
});

// bottom-speed equivalent, height-equivalent (the apex it is heading for) and danger
export function energy(s) {
  const v = s.w * SW.L;
  const vb = Math.sqrt(v * v + 2 * SW.G * SW.L * (1 - Math.cos(s.th)));
  const h = (vb * vb) / (2 * SW.G);
  return { vb, h, d: vb / SW.V_SAFE };
}
export const heightOf = th => SW.L * (1 - Math.cos(th));
export const seatSpeed = s => Math.abs(s.w) * SW.L;

// One fixed step of the pendulum (semi-implicit Euler, called at 1/120 s or finer).
function sub(s, h) {
  s.w += (-(SW.G / SW.L) * Math.sin(s.th) - SW.DAMP * s.w) * h;
  if (s.pushT > 0) { // hands on the tire: they push it forward as long as they can keep up (and shove back if you swing into them)
    s.pushT -= h;
    if (s.th < SW.PUSH_REACH && s.w * SW.L < (s.pushCap || SW.PUSH_HAND)) s.w += s.pushA * h;
  }
  s.th += s.w * h;
  // the rope goes slack a bit past horizontal: bounce softly instead of looping over the branch
  const lim = 1.62;
  if (s.th > lim) { s.th = lim; if (s.w > 0) s.w *= -0.35; }
  if (s.th < -lim) { s.th = -lim; if (s.w < 0) s.w *= -0.35; }
  const hh = heightOf(s.th);
  if (hh > s.best) s.best = hh;
}

// Advance the ride by dt seconds. Returns null, or 'launch' when your hands finally let go.
export function step(s, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) sub(s, h);
  s.t += dt;
  const e = energy(s);
  if (e.vb > s.bestV) s.bestV = e.vb;
  // grip: drains in the danger band, comes back when you calm down
  if (e.d > SW.WARN) {
    const k = (e.d - SW.WARN) / (1 - SW.WARN);
    s.grip -= dt * SW.GRIP_DRAIN * Math.pow(k, 1.35);
  } else s.grip = Math.min(1, s.grip + dt * SW.GRIP_REGEN);
  if (s.grip < 0) s.grip = 0;
  if (!s.doomed && (e.d >= SW.HARD || s.grip <= 0)) {
    s.doomed = true; s.doomT = 0;
    s.slipTh = SW.LAUNCH_TH + (s.rand ? s.rand() : 0.5) * 0.5; // where on the way up your hands let go (varies, so every launch is different)
  }
  if (s.doomed) {
    s.doomT += dt;
    // once your hands have gone the swing lets go on the way up (or after a while whatever it is doing)
    if ((s.th > s.slipTh && s.w > 0.4) || s.doomT > 3.2) return 'launch';
  }
  return null;
}

// ---------------------------------------------------------------- pumping

// How far from the bottom of the arc are we, as a phase angle: 0 = passing the bottom, PI/2 = at the top.
export function phaseErr(s) {
  const e = energy(s);
  const cm = Math.max(-1, Math.min(1, 1 - e.h / SW.L));
  const thm = Math.acos(cm);
  if (thm < 0.1) return 0; // barely moving: any moment will do
  return Math.asin(Math.min(1, Math.abs(s.th) / thm));
}

// timing quality for a pump right now: effectiveness -0.5..1 and a label
export function pumpTiming(s) {
  const p = phaseErr(s);
  let f;
  if (p < 0.24) f = 1;
  else if (p < 0.55) f = 1 - ((p - 0.24) / 0.31) * 0.55;
  else if (p < 0.95) f = 0.45 - ((p - 0.55) / 0.4) * 0.6;
  else f = -0.5;
  const label = p < 0.24 ? 'perfect' : p < 0.55 ? 'good' : p < 0.95 ? 'meh' : 'bad';
  return { f, label, phase: p };
}

// Apply a pump. Returns { f, label, dv } (dv = speed added at the seat, m/s).
export function pump(s, now) {
  const tm = pumpTiming(s);
  if (now - s.lastPump < SW.PUMP_GAP) { tm.f = Math.min(tm.f, -0.3); tm.label = 'flail'; }
  s.lastPump = now;
  const e = energy(s);
  const base = 0.8 + 2.2 * Math.pow(1 - Math.min(1, e.d), 1.6); // early pumps count for more, late ones barely nudge
  const dv = tm.f * base;
  const dir = Math.abs(s.w) > 0.12 ? Math.sign(s.w) : (s.th !== 0 ? -Math.sign(s.th) : 1);
  s.w += (dir * dv) / SW.L;
  s.pumps++;
  if (tm.label === 'perfect') s.perfects++;
  return { f: tm.f, label: tm.label, dv };
}

// ---------------------------------------------------------------- friends pushing

// How well a shove from behind would land right now: -0.7 (you were swinging into their hands) .. 1 (back apex,
// going forward). Used for the "Nice push!" feedback; the real effect comes from the physics in sub().
export function pushEff(s) {
  const e = energy(s);
  const cm = Math.max(-1, Math.min(1, 1 - e.h / SW.L));
  const thm = Math.acos(cm);
  if (thm < 0.12) return 0.85; // hanging still: an easy shove gets you going
  const u = Math.max(-1, Math.min(1, s.th / thm));
  if (s.w >= -0.05) return Math.max(0, 1 - 0.5 * (u + 1)); // going forward from the back: 1 at the back apex .. 0 at the front
  return -0.25 - 0.45 * ((u + 1) / 2);                     // coming back at them: a shove is a bad idea
}

// A friend shoves: from now on the seat is pushed for a moment. Several pushers stack (the times and forces add up).
// Timing and height count: a shove right at the back of the arc on the way forward is up to twice as strong as a
// lazy one, and the higher the swing already goes the harder it is (up to 1.5x) and the faster a seat it can still keep up
// with, so pushing is most rewarding high up. A shove into a seat coming back at you is a fumble at half strength (it brakes the
// swing a little, then helps a little once it turns).
export function pushPower(s) {
  const eff = pushEff(s), e = energy(s);
  const hk = Math.max(0, Math.min(1, (e.h - 0.3) / 1.7));
  const hs = hk * hk * (3 - 2 * hk);
  return { eff, hk: hs, mult: eff > 0 ? (0.4 + 0.6 * eff) * (1 + 0.5 * hs) : 0.55, cap: SW.PUSH_HAND + SW.PUSH_HAND_HI * hs };
}
export function push(s, strength = 1) {
  const P = pushPower(s), eff = P.eff;
  s.pushA = Math.min(16, s.pushA * (s.pushT > 0 ? 1 : 0) + SW.PUSH_ACC * strength * P.mult);
  s.pushT = SW.PUSH_TIME;
  s.pushCap = P.cap;
  s.pushes++;
  if (eff >= SW.PUSH_GOOD) s.goodPushes = (s.goodPushes || 0) + 1;
  const e = energy(s);
  if (eff > 0.3 && e.d > 1.0) s.grip = Math.max(0, s.grip - 0.28); // "hold on!"
  return { eff, mult: P.mult, hk: P.hk };
}

// ---------------------------------------------------------------- flying

// velocity of the seat right now: { vy, vf } (up, forward = north)
export function seatVel(s) {
  return { vy: SW.L * Math.sin(s.th) * s.w, vf: SW.L * Math.cos(s.th) * s.w };
}

// How you leave. 'launch' = your hands slipped (SPROING: boosted, mostly up and away),
// 'jump' = you chose to bail out (Wii style: the same speed plus a real jump, so timing matters).
export function leaveVel(s, kind) {
  const v = seatVel(s);
  if (kind === 'launch') return { vy: v.vy * 1.1 + 5.2, vf: v.vf * 1.12 + 1.4 };
  if (kind === 'jump') return { vy: v.vy * 1.05 + 4.2, vf: v.vf * 1.28 + 2.0 };
  return { vy: v.vy * 0.4 + 2.6, vf: v.vf * 0.4 + 0.4 }; // hop off (slow)
}

// Flat-ground flight from a seat height (m above ground): where it first touches down.
// Returns { dist (forward, m), time, apex (m above ground) }.
export function flight(vy, vf, y0) {
  const g = SW.FLY_G;
  const disc = vy * vy + 2 * g * y0;
  const t = (vy + Math.sqrt(Math.max(0, disc))) / g;
  return { dist: vf * t, time: t, apex: y0 + (vy > 0 ? (vy * vy) / (2 * g) : 0) };
}
// the seat's height above the ground for a rope angle
export const seatY = th => SW.SEAT_REST_H + heightOf(th);
