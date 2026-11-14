// The town's cast on a phone: only a few of the town's wandering folk are built and drawn at a time, to save memory.
//
// On a phone class (gfx.js) the town residents (town-life.js's Maple Row and Summit Hill folk, Lou the jogger, the game store's
// two shoppers) are a pool, and only a cast of 7 to 12 of them is built and drawn at any time. Everyone else in the lobby (Dax,
// Nala, Kevin, Mabel, Clem, the unicorns, the scouts, Joyce, the park's people, Pat, Pete) isn't in the pool. The cast is a pure
// function of the shared clock: every phone shows the same faces, and it changes every hour so the whole town takes turns over
// a day. The schedules themselves are untouched (a resident who isn't cast is still walking their route on the clock, just not
// drawn), so phones and computers agree about where everybody is.
//
//   castMember(id, out)  a pool member and its schedule probe out(t) -> true when the schedule has them out and about
//   castAt(t)            -> Set of the member ids cast at shared time t (pure: same t, same set, on every client)
//   castOn()             the cap applies here (a phone class); computers build everyone
//   castSize(j)          how many are cast in hour-window j (7..12, never zero)
//   mayBuild(now)        one lazy build per frame across the pool (so a change of cast never builds three people at once)
//   KEEP_NEAR            a change of cast waits while the person is visible within this many metres of the camera
import { hash01 } from './util.js';
import { GFX } from './gfx.js';

export const CAST_WINDOW = 3600; // seconds: a multiple of town-life's 600 s slots (every resident is indoors at a slot's start)
export const CAST_MIN = 7, CAST_MAX = 12;
export const KEEP_NEAR = 60;
const SAMPLES = 12;

const members = new Map();
const cache = new Map();
export function castMember(id, out) { members.set(id, out); cache.clear(); }
export function castReset() { cache.clear(); } // (npcs.resetCaches: a test pinned another hour)
export function castMembers() { return [...members.keys()].sort(); }
export const castOn = () => GFX.cls === 'phone';
export const castSize = j => CAST_MIN + Math.floor(hash01('cast-n', j) * (CAST_MAX - CAST_MIN + 1));

// Who is cast in window j: the members ranked by how much of the hour their schedule has them out (so the cast is people
// you can actually meet, not folk indoors all hour), then by a per-hour draw (so the faces rotate through the day).
export function castFor(j) {
  let set = cache.get(j);
  if (set) return set;
  const ids = castMembers();
  const t0 = j * CAST_WINDOW;
  const ranked = ids.map(id => {
    const out = members.get(id);
    let n = 0;
    for (let k = 0; k < SAMPLES; k++) { try { if (out(t0 + (k + 0.5) * (CAST_WINDOW / SAMPLES))) n++; } catch { /* a probe that fails counts as indoors */ } }
    return { id, score: n / SAMPLES + hash01('cast', id, j) * 0.6 };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  set = new Set(ranked.slice(0, castSize(j)).map(r => r.id));
  cache.set(j, set);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  return set;
}
export const castAt = t => castFor(Math.floor(t / CAST_WINDOW));

let lastBuild = -1;
export function mayBuild(now) { if (now === lastBuild) return false; lastBuild = now; return true; }

// One member's on-screen state on this client: whether its body should exist now. `want` is the shared cast; a change
// waits while the person is in sight near the camera (the nearest ones win when it matters), so nobody pops in or out
// in front of you. Local only: it decides drawing, never where anyone is.
export function castSeat() {
  return {
    on: null,
    step(want, visible, dist) {
      if (this.on === null || this.on === want) { this.on = want; return want; }
      if (!visible || dist > KEEP_NEAR) this.on = want;
      return this.on;
    },
  };
}
