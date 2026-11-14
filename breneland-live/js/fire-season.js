// Fire season: our fireplace and the lakeside firepit burn on their own from 6 pm to 2 am Eastern every evening from October 1
// through February 14 (the night of Feb 14 runs to 2 am on the 15th). Pure functions of the shared clock with no imports, so the
// server (lib/hearth.js and lib/firepit.js load this file as a data: URL, the maze-gen.js way), every client and the tests work
// out the same fire from the same { litAt, outAt } and the time. Nothing is kept for the schedule: a restart loses nothing.
//
//   evening(ms)      -> { from, to } the season's evening ms is in (6 pm to 2 am), or null
//   lastEvening(ms)  -> { from, to } the latest season evening that began at or before ms
//   fireSpan(litAt, outAt, now, out?) -> { from, to, end, night }: the burn going on now, or the last one. from: when it caught
//     (ms, or null: never), to: when it goes out (ms, may be still to come), end: 'out' (put out with E), 'night' (the 2 am) or
//     'life' (three hours after a match outside the hours); night: a fire that was to burn till 2 am (even if put out sooner)
//   burning(litAt, outAt, now) -> true while it burns
//
// The rules: at 6 pm in season it catches on its own; at 2 am it dies down. Put out with E it stays out till someone lights it
// or the next evening's 6 pm. Lit with E in the hours it burns till 2 am; lit outside them it burns three hours, and if the
// evening comes while it burns it carries on till 2 am. Clock change nights go by the wall clock (2 am is 2 am EST).

export const FROM_H = 18, TO_H = 2;   // 6 pm to 2 am Eastern
export const LIFE = 3 * 3600e3;       // ms: a fire lit by hand outside the hours burns three hours
const H = 3600e3, SKEW = 5000;        // (a server time a moment ahead of a client's still counts as now)

// US Eastern time, the rule since 2007: daylight time from 2 am on the second Sunday of March to 2 am on the first Sunday of
// November (no Intl, so a server and a browser can never disagree)
const sundayOf = (y, mo, nth) => 1 + ((7 - new Date(Date.UTC(y, mo - 1, 1)).getUTCDay()) % 7) + (nth - 1) * 7;
const dstYear = new Map();
function dstSpan(y) {
  let s = dstYear.get(y);
  if (!s) { s = [Date.UTC(y, 2, sundayOf(y, 3, 2), 7), Date.UTC(y, 10, sundayOf(y, 11, 1), 6)]; dstYear.set(y, s); }
  return s;
}
export function offsetAt(ms) { const [a, b] = dstSpan(new Date(ms).getUTCFullYear()); return ms >= a && ms < b ? -4 * H : -5 * H; }
// the wall clock in Eastern at ms: { y, mo, d, h } (h fractional)
export function eastern(ms) {
  const t = new Date(ms + offsetAt(ms));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600 };
}
// an Eastern wall-clock hour on a date -> ms (an hour that comes twice: its second time, so the fall's 2 am is 2 am EST)
export function wallMs(y, mo, d, h) {
  const u = Date.UTC(y, mo - 1, d) + h * H, a = u + 4 * H;
  return offsetAt(a) === -4 * H && offsetAt(a + H) === -4 * H ? a : u + 5 * H;
}
export const inSeason = (mo, d) => mo >= 10 || mo === 1 || (mo === 2 && d <= 14);
const dayOf = (y, mo, d) => { const t = new Date(Date.UTC(y, mo - 1, d)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const span = D => { const n = dayOf(D.y, D.mo, D.d + 1); return { from: wallMs(D.y, D.mo, D.d, FROM_H), to: wallMs(n.y, n.mo, n.d, TO_H) }; };

export function evening(ms) {
  const e = eastern(ms);
  const D = e.h >= FROM_H ? dayOf(e.y, e.mo, e.d) : e.h < TO_H ? dayOf(e.y, e.mo, e.d - 1) : null;
  if (!D || !inSeason(D.mo, D.d)) return null;
  const w = span(D);
  return ms >= w.from && ms < w.to ? w : null;
}
export function lastEvening(ms) {
  const e = eastern(ms);
  let D = dayOf(e.y, e.mo, e.h >= FROM_H ? e.d : e.d - 1);
  if (!inSeason(D.mo, D.d)) D = { y: D.y, mo: 2, d: 14 }; // (from Feb 15 to Sep 30 the last was Feb 14's)
  return span(D);
}

const set = (o, from, to, end, night) => { o.from = from; o.to = to; o.end = end; o.night = night; return o; };
export function fireSpan(litAt, outAt, now, out = {}) {
  const L = Number.isFinite(litAt) ? litAt : null, O = Number.isFinite(outAt) ? outAt : null;
  // the last match: in the hours till 2 am, outside them three hours (or on till 2 am if the evening comes while it burns)
  let pf = null, pt = 0, pe = 'life', pn = false;
  if (L !== null && L <= now + SKEW) {
    const w = evening(L);
    if (w) { pt = w.to; pe = 'night'; } else { pt = L + LIFE; const w2 = evening(pt); if (w2 && w2.from > L) { pt = w2.to; pe = 'night'; } }
    pn = pe === 'night';
    if (O !== null && O >= L && O < pt) { pt = O; pe = 'out'; }
    pf = L;
  }
  // the latest evening: it catches at 6 pm unless the match's fire was already burning then
  const W = lastEvening(now);
  if (W.from <= now && !(pf !== null && pf <= W.from && pt >= W.from) && (pf === null || W.from > pf)) {
    return O !== null && O >= W.from && O < W.to ? set(out, W.from, O, 'out', true) : set(out, W.from, W.to, 'night', true);
  }
  return pf === null ? set(out, null, null, 'out', false) : set(out, pf, pt, pe, pn);
}
const _s = {};
export function burning(litAt, outAt, now) { const s = fireSpan(litAt, outAt, now, _s); return s.from !== null && now >= s.from - SKEW && now < s.to; }
