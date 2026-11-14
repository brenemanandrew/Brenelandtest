// Our living room's fire as a pure function of time (no imports, so the tests load it straight into Node). The server keeps only
// when it was lit and when it was put out (lib/hearth.js); every client works the same fire out from those and the shared clock.
// It catches over a few seconds (a small flame first, the logs taking it), and when it is put out the flames die down over a few
// seconds and the coals glow on a little longer. When it goes out on its own (2 am in fire season, or three hours after a match
// outside the hours: fire-season.js) it dies down the same way: fires.js passes the span's { from, to } as litAt, outAt.
//   hearthAt(litAt, outAt, now, out?) -> { flame, ember, lit } (0..1; lit: burning or catching). Pass `out` to fill it in place.
//   (outAt may be still to come: till then it burns)

export const CATCH = 6;     // s: from the match to the whole fire
export const DIE = 4;       // s: the flames die down after it is put out
export const COOL = 30;     // s: and the coals stop glowing
export const START = 0.12;  // the first small flame

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const u = clamp01((v - a) / (b - a)); return u * u * (3 - 2 * u); };
const set = (o, flame, ember, lit) => { o.flame = flame; o.ember = ember; o.lit = lit; return o; };

// the burning fire, age seconds after it was lit
export function burnAt(age, out = {}) {
  if (!(age >= 0)) return set(out, 0, 0, false);
  const flame = START + (1 - START) * smooth(0.3, CATCH, age);
  return set(out, clamp01(flame * smooth(0, 0.3, age)), smooth(0.8, CATCH * 2, age), true);
}

const _was = {};
export function hearthAt(litAt, outAt, now, out = {}) {
  if (!Number.isFinite(litAt)) return set(out, 0, 0, false);
  if (Number.isFinite(outAt) && outAt >= litAt && now >= outAt) {
    const was = burnAt((outAt - litAt) / 1000, _was), d = (now - outAt) / 1000;
    return set(out, was.flame * (1 - smooth(0, DIE, d)), was.ember * (1 - smooth(0, COOL, d)), false);
  }
  return burnAt((now - litAt) / 1000, out);
}
