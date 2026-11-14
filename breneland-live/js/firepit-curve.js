// The firepit's fire as a pure function of time. No imports, so tests load it straight into Node. litAt and outAt are
// server milliseconds from lib/firepit.js, now is net.serverNow().
//
//   0 to 60 min    it catches slowly from kindling (a small smoky flame) and builds to its peak at one hour
//   60 to 90 min   it falls back from the peak to a steady, settled fire
//   90 to 150 min  it burns down slowly
//   150 to 180 min it dies: the flames shrink to nothing, the embers glow on a little longer, then out at three hours
//
// fireAt(litAt, outAt, now, out?) -> { flame, ember, smoke, lit, phase } (0..1 each, lit: still counts as burning).
// Pass `out` to have it filled in place (no garbage per frame). `flame` drives the flames, sparks, light and crackle,
// `ember` the coals, `smoke` the smoke (and the steam puff after a douse).

export const MIN = 60;
export const KINDLE = 60 * MIN;      // s: the peak, one hour after lighting
export const SETTLE = 90 * MIN;      // s: fallen back to a settled fire half an hour after the peak
export const DYING = 150 * MIN;      // s: from here it dies down
export const OUT = 180 * MIN;        // s: out, three hours after lighting
export const DOUSE_FLAME = 3;        // s: a doused fire's flames are gone this fast
export const DOUSE_EMBER = 75;       // s: and its coals stop glowing
export const DOUSE_SMOKE = 35;       // s: the steam puff after a douse

export const START_FLAME = 0.16;     // the kindling's first flame (a fire never starts at full size)
export const SETTLED = 0.62;         // the settled fire after the peak
export const LOW = 0.4;              // what is left when it starts dying

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const u = clamp01((v - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

const set = (o, flame, ember, smoke, phase, lit) => { o.flame = flame; o.ember = ember; o.smoke = smoke; o.phase = phase; o.lit = lit; return o; };

// The burning fire, age seconds after it was lit (no douse).
export function burnAt(age, out = {}) {
  if (!(age >= 0) || age >= OUT) return set(out, 0, 0, 0, 'out', false);
  let flame, phase;
  if (age < KINDLE) { // slow start: an ease-in that only really gets going after the first quarter hour
    const u = age / KINDLE;
    flame = lerp(START_FLAME, 1, u * u * (3 - 2 * u)); phase = age < 15 * MIN ? 'kindling' : 'building';
  } else if (age < SETTLE) { flame = lerp(1, SETTLED, smooth(KINDLE, SETTLE, age)); phase = age < KINDLE + 10 * MIN ? 'peak' : 'settling'; }
  else if (age < DYING) { flame = lerp(SETTLED, LOW, (age - SETTLE) / (DYING - SETTLE)); phase = 'burning'; }
  else { flame = LOW * (1 - smooth(DYING, OUT - 4 * MIN, age)); phase = 'dying'; }
  // coals: build over the first forty minutes, glow on while the flames die, fade over the last ten minutes
  const ember = smooth(0, 40 * MIN, age) * 0.85 + 0.15 * clamp01(age / 120) - smooth(OUT - 10 * MIN, OUT, age);
  // smoke: thick while it catches, thin at the peak, thicker again as it smoulders, gone when it is out
  const smoke = lerp(0.95, 0.35, smooth(0, 25 * MIN, age)) + 0.4 * smooth(DYING - 20 * MIN, OUT - 15 * MIN, age) - 0.75 * smooth(OUT - 8 * MIN, OUT, age);
  return set(out, clamp01(flame), clamp01(ember), clamp01(smoke), phase, true);
}

// The fire at server time `now` (ms) for a fire lit at litAt (ms or null) and put out at outAt (ms or null).
const _was = {};
export function fireAt(litAt, outAt, now, out = {}) {
  if (!Number.isFinite(litAt)) return set(out, 0, 0, 0, 'out', false);
  const age = (now - litAt) / 1000;
  if (Number.isFinite(outAt) && outAt >= litAt && now >= outAt) {
    return douse(burnAt((outAt - litAt) / 1000, _was), (now - outAt) / 1000, out);
  }
  return burnAt(age, out);
}
// doused d seconds ago: the flames go at once, the coals hiss and fade, a puff of steam
function douse(was, d, out) {
  const flame = was.flame * (1 - clamp01(d / DOUSE_FLAME));
  const ember = was.ember * (1 - smooth(0, DOUSE_EMBER, d));
  const smoke = (was.flame > 0 || was.ember > 0) ? Math.max(was.smoke * (1 - clamp01(d / 4)), 1 - smooth(0, DOUSE_SMOKE, d)) * (d < DOUSE_SMOKE ? 1 : 0) : 0;
  return set(out, flame, ember, smoke, flame > 0 || ember > 0.02 || smoke > 0.02 ? 'doused' : 'out', false);
}

// Fire season (fire-season.js fireSpan: { from, to, end, night }). A match's own three hours as above. A fire that burns till
// 2 am ('night': the evening's own from 6 pm, or a match in the hours) has no match at 6 pm, so it catches over a few seconds,
// builds the usual way and holds the settled fire after the first hour and a half; at 2 am the flames die down over a few
// minutes and the coals glow on a while, smouldering. Put out with E ('out'): the douse.
export const CATCH = 4;              // s: the evening's fire catching with no match (not a pop)
export const NIGHT_FLAME = 180;      // s: at 2 am the flames die down over three minutes
export const NIGHT_EMBER = 600;      // s: and the coals over ten
function holdAt(age, out) {
  burnAt(Math.min(age, SETTLE), out);
  if (age > SETTLE) out.phase = 'burning';
  out.flame *= smooth(0, CATCH, age);
  return out;
}
export function fireSpanAt(s, now, out = {}) {
  if (!s || !Number.isFinite(s.from)) return set(out, 0, 0, 0, 'out', false);
  if (!s.night) return fireAt(s.from, s.end === 'out' ? s.to : null, now, out); // (a match's: its three hours are the curve's own OUT)
  if (now < s.to) return holdAt((now - s.from) / 1000, out);
  const was = holdAt((s.to - s.from) / 1000, _was), d = (now - s.to) / 1000;
  if (s.end === 'out') return douse(was, d, out);
  const flame = was.flame * (1 - smooth(0, NIGHT_FLAME, d)), ember = was.ember * (1 - smooth(NIGHT_FLAME * 0.3, NIGHT_EMBER, d));
  const smoke = clamp01((was.smoke + 0.3 * smooth(0, 60, d)) * (1 - smooth(NIGHT_EMBER * 0.5, NIGHT_EMBER, d)));
  return set(out, flame, ember, smoke, flame > 0 || ember > 0.02 || smoke > 0.02 ? 'dying' : 'out', false);
}
// minutes left of a span's fire (0 when out); for the prompt
export const spanLeft = (s, now) => (s && Number.isFinite(s.from) && now >= s.from - 5000 && now < s.to ? Math.max(0, Math.ceil((s.to - now) / 60000)) : 0);

// Minutes left before it goes out on its own (0 when out); for the prompt.
export function minutesLeft(litAt, outAt, now) {
  if (!Number.isFinite(litAt) || (Number.isFinite(outAt) && now >= outAt)) return 0;
  return Math.max(0, Math.ceil((OUT - (now - litAt) / 1000) / 60));
}
