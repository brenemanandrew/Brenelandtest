// Beneath Angell Street: the lights going out at the bottom of the stair. Stepped by maze-scene.js's beats() while the phase is
// 'dark' (you're held still). Seconds from the bottom step:
//   0      the candle above dies (maze-fx.js only burns it while the phase is 'stair'), black
//   1.05   your breath
//   1.35   your heart: two thuds (ctx.haptics 'heart')
//   1.6    a drip somewhere
//   2.3    the match: scratch-scratch (ctx.haptics 'strike'), a tiny warm flare at your hand, then it burns low
//   2.9    the lantern's wick catches and its light comes up slowly to its small circle (full by 4.7)
// The light is the scene's `lit` (0..1, maze-fx.js scales the lantern, its halo and the glow on your hand by it), so the flare is
// the lantern's own light at the glass: no new light, no recompile. Haptics follow Settings > Sound > Vibration (haptics.js).
// Reduced motion: no flash, the flare is a soft glow.
export const DARK = { black: 0.25, breath: 1.05, heart: 1.35, drip: 1.6, strike: 2.3, catch: 2.9, full: 4.7 };
const FLARE = 0.55, FLARE_SOFT = 0.22, MATCH = 0.13;

const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// the light by time (pure: the tests read the curve through the scene)
export function darkLit(t, reduced = false) {
  if (t < DARK.strike) return 0;
  const m = t - DARK.strike, peak = reduced ? FLARE_SOFT : FLARE;
  if (t < DARK.catch) {
    if (m < 0.06) return peak * (m / 0.06);                                  // the flare
    if (m < 0.36) return MATCH + (peak - MATCH) * (1 - smooth((m - 0.06) / 0.3)); // settling to the match's own small flame
    return MATCH * (0.85 + 0.15 * Math.sin(m * 37) * Math.sin(m * 11));      // the match burning, a flutter
  }
  const u = (t - DARK.catch) / (DARK.full - DARK.catch);
  if (u >= 1) return 1;
  const dip = u < 0.18 ? 0.5 * Math.sin(u / 0.18 * Math.PI) : 0;             // the wick catching: a flutter down, then up
  return MATCH + (1 - MATCH) * smooth(u) * (1 - 0.35 * dip);
}

// the lantern's own flame by time: nothing while only the match burns, then the wick catching (0..1). maze-fx.js shows the flame
// and the glass's glow by it, so the lantern isn't already lit before the wick takes
export function darkWick(t) {
  if (t < DARK.catch) return 0;
  const u = (t - DARK.catch) / (DARK.full - DARK.catch);
  if (u >= 1) return 1;
  const dip = u < 0.18 ? 0.5 * Math.sin(u / 0.18 * Math.PI) : 0;
  return Math.max(0.04, smooth(Math.min(1, u * 1.6)) * (1 - 0.45 * dip));
}

export function createMazeDark(ctx, { cam, audio = ctx.audio }) {
  let t = 0, done = false;
  const log = [];   // for the tests: what happened when
  const at = (dx = 0, dy = 0, dz = 0) => [cam.position.x + dx, cam.position.y + dy, cam.position.z + dz];
  const beat = (name, fn) => { log.push([name, +t.toFixed(2)]); try { fn(); } catch (e) { console.error('[maze] the dark', name, e); } };
  return {
    log,
    get t() { return t; }, get done() { return done; }, get wick() { return done ? 1 : darkWick(t); },
    reset() { t = 0; done = false; log.length = 0; },
    // one step of the dark; returns the light (0..1)
    step(dt) {
      if (done) return 1;
      const was = t; t += dt;
      const cross = s => was < s && t >= s;
      if (cross(DARK.breath)) beat('breath', () => audio.play('maze-breath', ...at()));
      if (cross(DARK.heart)) beat('heart', () => ctx.haptics?.buzz('heart'));
      if (cross(DARK.drip)) beat('drip', () => audio.play('maze-drip', ...at(2, 1, -1.5)));
      if (cross(DARK.strike)) beat('strike', () => { audio.play('maze-match', ...at()); ctx.haptics?.buzz('strike'); ctx.ui.fade(0, 250); });
      if (cross(DARK.catch)) beat('catch', () => {});
      if (t >= DARK.full) { done = true; log.push(['full', +t.toFixed(2)]); return 1; }
      return darkLit(t, reducedMotion());
    },
  };
}
