// Everyone looks at who is talking (gaze, 2026-11-02). Andrew: "When a character is talking, it's important that nearby
// characters or the character being talked to is looking at that person. Eyes as well, especially eyes."
//
// A Human registers itself here on every frame it is updated (human.js calls `touch`); a few times a second `scan` picks each
// one a look target: talking -> the one spoken to (`h.say(secs, to)`) or else the nearest person in front; not talking ->
// whoever near is talking (the one talking to me first); a thing to watch (`h.watch(obj, secs)`: a rolling die); a feature's own
// ask (`h.lookAt(obj, secs)`: the DM's notes) over all of it. The blend per frame is Human.stepAttention: the eyes first and
// furthest, the head a beat later, the shoulders a touch on a wide turn; nothing snaps. The idle glances (bodies-poses idle)
// only while nobody near is talking, never while the character is. A target is a Human (its head), an Object3D (its world
// position) or { x, y, z }. No THREE here, no allocation in the scan (the arrays are kept). The asks last in frames (30 a
// second), the registry runs on frames too: a clock that jumps (a tab brought back; a test between its steps) ends no look early.
//
// The feature (createGaze, main.js) runs the scan; `GAZE.on = false` turns the whole thing off (the before pictures).

export const HEAR_R = 6;    // m: within this you look at whoever is talking
export const TALK_R = 4;    // m: talking to nobody in particular, you look at the nearest person in front within this
export const SCAN_S = 0.25; // s between scans (a look target a few times a second; the blend is per frame)
export const STALE_F = 45;  // frames without an update and a person leaves the registry (hidden, removed, a creator's tile)
// look-storm (Andrew, 2026-11-07: "have their look linger for a few seconds"): once the talker stops, a listener keeps looking at
// them this long (s, a little different per person and per line so they don't all turn back at once), following them if they
// walk off (within the head's limits, human.js), then eases back; a new line renews it. Gone past LINGER_R m or out of the registry.
export const LINGER_S = [3, 4.5];
export const LINGER_R = 14;

// now: the game's clock (main.js's, which the tests step; set at the top of the frame, so the feature is first in main.js's makers);
// frame: counts the frames (the registry runs on it: a clock that jumps, a tab brought back, costs nobody their place)
export const GAZE = { on: true, people: new Set(), me: null, now: 0, at: 0, frame: 0, live: [], n: 0 };

// human.js, once per update: keep this person in the registry
export function touch(h) {
  h.gzF = GAZE.frame;
  if (!h.gzIn) { h.gzIn = true; GAZE.people.add(h); }
}

export const talking = (h, now) => h.talkT > 0 || h.voiceLevel > 0.06 || now < h.attn.talkUntil;
// shown: the root and its parents visible (the store's inside group hides with the shop; the local player is counted even
// hidden in first person: the DM looks at the camera then)
function shown(h) {
  if (h === GAZE.me) return true;
  let o = h.root;
  for (let i = 0; i < 10 && o; i++) { if (!o.visible) return false; o = o.parent; }
  return true;
}
const px = h => h.root.position.x, pz = h => h.root.position.z;
const dist2 = (a, b) => { const dx = px(a) - px(b), dz = pz(a) - pz(b); return dx * dx + dz * dz; };
// how much b is in front of a: 1 straight ahead, -1 behind
function ahead(a, b) {
  const dx = px(b) - px(a), dz = pz(b) - pz(a), d = Math.hypot(dx, dz) || 1, y = a.root.rotation.y;
  return (Math.sin(y) * dx + Math.cos(y) * dz) / d;
}
// where a target is (a Human: its head; an Object3D: its place in the world; a point)
export function targetOf(t) {
  if (!t) return null;
  if (t.headC) return t.root.visible || t === GAZE.me ? t.headC.matrixWorld.elements : null;
  if (t.matrixWorld) return t.matrixWorld.elements;
  return t;
}

// Test hook: where a person's look is. off: degrees between the head's forward and the target, offEyes: the same with the eyes'
// share added (what the eyes point at), err: stepAttention's own reading (rad)
export function lookInfo(h) {
  const A = h.attn, e = targetOf(A.tgt), H = h.headC.matrixWorld.elements;
  const o = { on: A.on, why: A.why, w: +A.w.toFixed(3), hy: A.hy, hx: A.hx, ey: A.ey, ex: A.ex, sy: A.sy, err: A.err, off: null, offEyes: null, tgt: null, talk: talking(h, GAZE.now) };
  if (!e) return o;
  const pt = e.length === 16, tx = pt ? e[12] : e.x, ty = pt ? e[13] : e.y, tz = pt ? e[14] : e.z;
  o.tgt = [tx, ty, tz];
  const dx = tx - H[12], dz = tz - H[14], want = Math.atan2(dx, dz), have = Math.atan2(H[8], H[10]);
  const wrap = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  o.off = Math.abs(wrap(want - have)) * 180 / Math.PI;
  o.offEyes = Math.abs(wrap(want - have - A.ey)) * 180 / Math.PI;
  return o;
}

// how long (frames) this person's look lingers after this line: LINGER_S spread by a golden-ratio walk from a per-person seed
let seeds = 0;
function lingerF(h) {
  if (h.gzSeed === undefined) h.gzSeed = (++seeds * 0.7548776662) % 1;
  const f = (h.gzSeed + 0.6180339887 * (h.gzLines || 0)) % 1;
  return Math.round(30 * (LINGER_S[0] + (LINGER_S[1] - LINGER_S[0]) * f));
}

function set(h, tgt, why) { const A = h.attn; A.on = true; if (A.tgt !== tgt) { A.tgt = tgt; A.fresh = true; } A.why = why; }

export function scan(now) {
  GAZE.now = now;
  const L = GAZE.live; let n = 0;
  for (const h of GAZE.people) {
    if (GAZE.frame - h.gzF > STALE_F) { GAZE.people.delete(h); h.gzIn = false; h.attn.on = false; h.attn.why = ''; continue; }
    if (!GAZE.on || !shown(h)) { h.attn.on = false; h.attn.why = ''; continue; }
    L[n++] = h;
  }
  GAZE.n = n;
  for (let i = 0; i < n; i++) {
    const h = L[i], A = h.attn;
    const talk = talking(h, now);
    if (!talk) A.to = null;
    if (A.force) { if (GAZE.frame < A.forceUntil) { set(h, A.force, 'force'); continue; } A.force = null; }
    if (talk) {
      // the one I'm talking to, if they're about; else the nearest person in front of me (and I'm talking to them now)
      if (A.to && (!A.to.headC || A.to.gzIn) && targetOf(A.to) && dist2(h, A.to) < 144) { set(h, A.to, 'talk'); continue; } // (a person who left is nobody to look at)
      let best = null, bd = TALK_R * TALK_R;
      for (let j = 0; j < n; j++) {
        const o = L[j]; if (o === h) continue;
        const d = dist2(h, o);
        if (d < bd && ahead(h, o) > -0.1) { bd = d; best = o; }
      }
      if (best) { A.to = best; set(h, best, 'talk'); } else set(h, null, 'talk'); // (to nobody: the head held, no idle glances)
      continue;
    }
    if (A.watch) { if (GAZE.frame < A.watchUntil && targetOf(A.watch)) { set(h, A.watch, 'watch'); continue; } A.watch = null; }
    // whoever near is talking: the one talking to me first, then the nearest
    let best = null, bs = Infinity;
    for (let j = 0; j < n; j++) {
      const o = L[j]; if (o === h || !talking(o, now)) continue;
      const d = dist2(h, o); if (d > HEAR_R * HEAR_R) continue;
      const s = o.attn.to === h ? d - 1000 : d;
      if (s < bs) { bs = s; best = o; }
    }
    if (best) {
      if (A.heard !== best || A.why !== 'hear') h.gzLines = (h.gzLines || 0) + 1; // (a new line heard: a new linger length)
      set(h, best, 'hear');
      A.heard = best; A.heardUntil = GAZE.frame + lingerF(h);
      continue;
    }
    // the look lingers on whoever just stopped talking (look-storm)
    const lh = A.heard;
    if (lh) {
      if (GAZE.frame < A.heardUntil && lh.gzIn && shown(lh) && dist2(h, lh) < LINGER_R * LINGER_R) { set(h, lh, 'linger'); continue; }
      A.heard = null;
    }
    A.on = false; A.why = '';
  }
  for (let i = n; i < L.length; i++) L[i] = null;
}

// The feature (first in main.js's makers: the clock and the frame count are set before any feature asks for a look): the scan a
// few times a second. ctx.player's character is "me" (looked at even while hidden in first person).
export function createGaze(ctx) {
  GAZE.me = ctx.player?.character || null;
  return {
    name: 'gaze',
    get people() { return GAZE.people.size; }, get live() { return GAZE.n; },
    get on() { return GAZE.on; }, set on(v) { GAZE.on = !!v; },
    update(dt, now) {
      if (ctx.player && ctx.player.character !== GAZE.me) GAZE.me = ctx.player.character;
      GAZE.now = now; GAZE.frame++;
      if (now - GAZE.at < SCAN_S) return;
      GAZE.at = now;
      scan(now);
    },
  };
}
