// Sound effects for the bocce court, registered on the shared engine (Contract 8). All synthesised; peaks 0.05-0.3.
// `a` is the AudioEngine, (x, y, z) a world position, opts per effect (v = how hard, 0..1-ish).
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const at = (a, x, y, z, ref, roll, k) => { const p = a.at(x, y, z, ref, roll); const g = a.gain(k); g.connect(p); return g; };
const lim = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function registerBocceSfx(audio) {
  // resin ball on ball: a bright hard click with a short ring
  audio.registerSfx('bocce-clack', (a, x, y, z, { v = 1 } = {}) => {
    const k = lim(v / 3, 0.25, 1), out = at(a, x, y, z, 5, 1.1, 10), t = a.ctx.currentTime;
    a.tone(out, { f: 2350 + Math.random() * 300, t, a: 0.001, d: 0.07, peak: 0.12 * k, type: 'triangle' });
    a.tone(out, { f: 1180 + Math.random() * 80, t, a: 0.001, d: 0.13, peak: 0.07 * k });
    a.burst(out, { t, dur: 0.025, f: 3400, Q: 2.5, peak: 0.16 * k });
  });
  // a ball knocking the timber boards: hollow and woody
  audio.registerSfx('bocce-knock', (a, x, y, z, { v = 1 } = {}) => {
    const k = lim(v / 3, 0.25, 1), out = at(a, x, y, z, 5, 1.1, 8), t = a.ctx.currentTime;
    a.tone(out, { f: 250, glide: 170, t, a: 0.002, d: 0.13, peak: 0.16 * k, type: 'triangle' });
    a.burst(out, { t, dur: 0.05, f: 750, Q: 2, peak: 0.12 * k });
  });
  // landing on the stone after the underhand hop
  audio.registerSfx('bocce-thump', (a, x, y, z, { v = 1 } = {}) => {
    const k = lim(v / 2.5, 0.3, 1), out = at(a, x, y, z, 5, 1.1, 6), t = a.ctx.currentTime;
    a.tone(out, { f: 120, glide: 62, t, a: 0.002, d: 0.15, peak: 0.2 * k });
    a.burst(out, { t, dur: 0.07, type: 'lowpass', f: 900, peak: 0.12 * k, brown: true });
    a.burst(out, { t: t + 0.01, dur: 0.06, f: 2600, Q: 1.2, peak: 0.04 * k }); // a little gravel scatter
  });
  // one grain of rolling on crushed stone (the game plays these while a ball rolls, faster and louder with speed)
  audio.registerSfx('bocce-roll', (a, x, y, z, { v = 0.5 } = {}) => {
    const k = lim(v, 0.1, 1), out = at(a, x, y, z, 4, 1.2, 7), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.12, type: 'lowpass', f: 420 + k * 300, peak: 0.07 * k, brown: true, attack: 0.03 });
    a.burst(out, { t, dur: 0.08, f: 1900 + Math.random() * 600, Q: 3, peak: 0.018 * k, attack: 0.02 });
  });
  // the swish of the arm as the ball leaves the hand
  audio.registerSfx('bocce-toss', (a, x, y, z, { v = 0.6 } = {}) => {
    const out = at(a, x, y, z, 4, 1.2, 3), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.22, f: 500, sweep: 1500, Q: 1, peak: 0.05 + 0.05 * lim(v, 0, 1), attack: 0.07 });
  });
  // a point on the board: a friendly two-note chime
  audio.registerSfx('bocce-point', (a, x, y, z, { n = 1 } = {}) => {
    const out = at(a, x, y, z, 8, 0.8, 2.2), t = a.ctx.currentTime;
    const base = 76;
    for (let i = 0; i < Math.min(4, n) + 1; i++) a.tone(out, { f: midi(base + [0, 4, 7, 12, 16][i]), t: t + i * 0.09, d: 0.4, peak: 0.09, verb: 0.4 });
  });
  // a dead frame: a little deflating "wah wah"
  audio.registerSfx('bocce-aww', (a, x, y, z) => {
    const out = at(a, x, y, z, 8, 0.8, 2.2), t = a.ctx.currentTime;
    a.tone(out, { f: midi(67), glide: midi(65), t, d: 0.28, peak: 0.08, type: 'triangle' });
    a.tone(out, { f: midi(64), glide: midi(58), t: t + 0.3, d: 0.5, peak: 0.08, type: 'triangle' });
  });
  // the crowd goes wild (game over) plus a tiny fanfare
  audio.registerSfx('bocce-cheer', (a, x, y, z) => {
    const out = at(a, x, y, z, 10, 0.7, 2.2), t = a.ctx.currentTime;
    for (let i = 0; i < 6; i++) a.burst(out, { t: t + i * 0.07, dur: 0.8 + Math.random() * 0.4, f: 800 + Math.random() * 900, Q: 1.6, peak: 0.05, attack: 0.12 });
    [72, 76, 79, 84].forEach((n, i) => a.tone(out, { f: midi(n), t: t + 0.05 + i * 0.12, d: i === 3 ? 0.7 : 0.18, peak: 0.1, type: 'triangle', verb: 0.4 }));
  });
  // countdown blips and the "your turn" nudge
  audio.registerSfx('bocce-tick', (a, x, y, z, { hi = false } = {}) => {
    const out = at(a, x, y, z, 8, 0.8, 7), t = a.ctx.currentTime;
    a.tone(out, { f: hi ? midi(84) : midi(76), t, d: hi ? 0.35 : 0.16, peak: 0.09, type: 'sine', verb: 0.2 });
  });
}
