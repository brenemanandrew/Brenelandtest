// Sound effects for the tire swing, registered on the shared engine (audio.registerSfx). All synthesised (sfx-map.js swaps in
// real clips for a few); peaks stay between 0.05 and 0.3. `a` is the AudioEngine, (x, y, z) a world position, opts per effect.
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9, 12];
// a positional output with a gain in front of it (the panner alone is quiet next to footsteps and the ambience)
const at = (a, x, y, z, ref, roll, k) => { const p = a.at(x, y, z, ref, roll); const g = a.gain(k); g.connect(p); return g; };

export function registerSwingSfx(audio) {
  // rope and branch complaining; v = 0..1.3 how fast the swing is (pitch and volume rise with it)
  audio.registerSfx('swing-creak', (a, x, y, z, { v = 0.3 } = {}) => {
    const out = at(a, x, y, z, 4, 1.2, 9), t = a.ctx.currentTime;
    const f0 = 210 + v * 330, dur = 0.22 + (1.2 - Math.min(1.2, v)) * 0.16;
    const o = a.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.82, t);
    o.frequency.linearRampToValueAtTime(f0 * (1.1 + 0.12 * Math.sin(v * 9)), t + dur * 0.55);
    o.frequency.linearRampToValueAtTime(f0 * 0.9, t + dur);
    const wob = a.ctx.createOscillator(); wob.frequency.value = 23 + v * 40;
    const wg = a.gain(f0 * 0.05); wob.connect(wg).connect(o.frequency);
    const f = a.filter('bandpass', 700 + v * 900, 6), g = a.gain(0);
    a.env(g, t, 0.03, 0.05 + Math.min(1.2, v) * 0.09, dur);
    o.connect(f).connect(g).connect(out);
    o.start(t); wob.start(t); o.stop(t + dur + 0.1); wob.stop(t + dur + 0.1);
    a.burst(out, { t, dur: dur * 0.8, type: 'bandpass', f: 1500 + v * 800, Q: 2, peak: 0.02 + v * 0.03, attack: 0.04 });
  });

  // the rope going taut and singing high: the "you are in danger" sound
  audio.registerSfx('swing-squeal', (a, x, y, z, { v = 1 } = {}) => {
    const out = at(a, x, y, z, 4, 1.1, 5), t = a.ctx.currentTime;
    const o = a.ctx.createOscillator(); o.type = 'triangle';
    const f = 1100 + v * 500;
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.32);
    const lfo = a.ctx.createOscillator(); lfo.frequency.value = 31;
    const lg = a.gain(45); lfo.connect(lg).connect(o.frequency);
    const g = a.gain(0);
    a.env(g, t, 0.05, 0.075, 0.34);
    o.connect(a.filter('bandpass', 1900, 3)).connect(g).connect(out);
    o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
  });

  // air rushing past at the bottom of the arc
  audio.registerSfx('swing-whoosh', (a, x, y, z, { v = 0.5 } = {}) => {
    const out = at(a, x, y, z, 5, 1.1, 4), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.5, type: 'bandpass', f: 380, sweep: 1500 + v * 900, Q: 0.9, peak: 0.05 + Math.min(1.2, v) * 0.11, attack: 0.16 });
  });

  // pump: a soft wooden knock, and a rising chime when the timing was right
  audio.registerSfx('swing-pump', (a, x, y, z, { q = 0.5 } = {}) => {
    const out = at(a, x, y, z, 4, 1.2, 4), t = a.ctx.currentTime;
    a.tone(out, { f: 240 + q * 60, glide: 130, t, a: 0.003, d: 0.09, peak: 0.13, type: 'triangle' });
    a.burst(out, { t, dur: 0.04, f: 900, Q: 2, peak: 0.07 });
  });
  audio.registerSfx('swing-perfect', (a, x, y, z, { n = 0 } = {}) => {
    const out = at(a, x, y, z, 6, 1, 2.2), t = a.ctx.currentTime;
    const base = 79 + PENTA[Math.min(PENTA.length - 3, n % 4)];
    a.tone(out, { f: midi(base), t, d: 0.5, peak: 0.1, verb: 0.5 });
    a.tone(out, { f: midi(base + 7), t: t + 0.07, d: 0.55, peak: 0.09, verb: 0.5 });
    a.tone(out, { f: midi(base + 12), t: t + 0.14, d: 0.6, peak: 0.06, verb: 0.6 });
  });
  audio.registerSfx('swing-miss', (a, x, y, z) => {
    const out = at(a, x, y, z, 4, 1.2, 3), t = a.ctx.currentTime;
    a.tone(out, { f: 190, glide: 110, t, a: 0.005, d: 0.16, peak: 0.09, type: 'square' });
  });

  // SPROING: the rope lets go. A springy wobble that starts low and shoots up.
  audio.registerSfx('swing-sproing', (a, x, y, z) => {
    const out = at(a, x, y, z, 8, 0.9, 2.2), t = a.ctx.currentTime;
    const o = a.ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.12);
    for (let i = 1; i <= 7; i++) o.frequency.linearRampToValueAtTime(760 + (i % 2 ? -1 : 1) * 380 / i, t + 0.12 + i * 0.075);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.9);
    const lfo = a.ctx.createOscillator(); lfo.frequency.value = 13;
    const lg = a.gain(70); lfo.connect(lg).connect(o.frequency);
    const g = a.gain(0);
    a.env(g, t, 0.01, 0.2, 0.9);
    o.connect(g).connect(out); g.connect(a.verbIn);
    o.start(t); lfo.start(t); o.stop(t + 1.05); lfo.stop(t + 1.05);
    a.burst(out, { t, dur: 0.12, f: 2400, Q: 1.5, peak: 0.13 });
  });

  // landings: boing (bounce), oof (the big one), thud (bush)
  audio.registerSfx('swing-boing', (a, x, y, z, { k = 1 } = {}) => {
    const out = at(a, x, y, z, 6, 1, 2.8), t = a.ctx.currentTime;
    a.tone(out, { f: 420 * k, glide: 150 * k, t, a: 0.004, d: 0.28, peak: 0.14, type: 'triangle' });
    a.tone(out, { f: 200 * k, glide: 90 * k, t, a: 0.004, d: 0.2, peak: 0.1 });
    a.burst(out, { t, dur: 0.09, type: 'lowpass', f: 500, peak: 0.12, brown: true });
  });
  audio.registerSfx('swing-oof', (a, x, y, z, { v = 0.6, pitch = 160 } = {}) => {
    const out = at(a, x, y, z, 5, 1, 3.2), t = a.ctx.currentTime;
    a.tone(out, { f: 95, glide: 45, t, a: 0.004, d: 0.32, peak: 0.24 * v });
    a.burst(out, { t, dur: 0.16, type: 'lowpass', f: 420, peak: 0.26 * v, brown: true });
    // the "oof" itself: a short pushed-out breath of a vowel
    const o = a.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch * 0.9, t + 0.02); o.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + 0.3);
    const g = a.gain(0); a.env(g, t + 0.02, 0.02, 0.09, 0.26);
    o.connect(a.filter('bandpass', 620, 4)).connect(g).connect(out);
    o.start(t); o.stop(t + 0.4);
  });
  audio.registerSfx('swing-rustle', (a, x, y, z, { v = 0.5 } = {}) => {
    const out = at(a, x, y, z, 5, 1, 3), t = a.ctx.currentTime;
    for (let i = 0; i < 3; i++) a.burst(out, { t: t + i * 0.09, dur: 0.16, type: 'highpass', f: 2800 + i * 400, Q: 0.7, peak: 0.03 + v * 0.05, attack: 0.03 });
  });
  audio.registerSfx('swing-wings', (a, x, y, z) => {
    const out = at(a, x, y, z, 6, 1, 3.2), t = a.ctx.currentTime;
    for (let i = 0; i < 9; i++) a.burst(out, { t: t + i * 0.055, dur: 0.035, type: 'bandpass', f: 1400 + Math.random() * 500, Q: 1.5, peak: 0.07 * (1 - i / 11) });
    for (let i = 0; i < 3; i++) a.tone(out, { f: 3000 + i * 300, glide: 4200, t: t + 0.05 + i * 0.13, a: 0.005, d: 0.06, peak: 0.05 });
  });
  audio.registerSfx('swing-stars', (a, x, y, z) => {
    const out = at(a, x, y, z, 5, 1, 2.6), t = a.ctx.currentTime;
    for (let i = 0; i < 4; i++) a.tone(out, { f: midi(88 + PENTA[(i * 2) % 5]), t: t + i * 0.12, d: 0.35, peak: 0.05, verb: 0.5 });
  });
  audio.registerSfx('swing-fanfare', (a, x, y, z) => {
    const out = at(a, x, y, z, 12, 0.7, 1.7), t = a.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((n, i) => {
      a.tone(out, { f: midi(72 + n), t: t + i * 0.09, d: 0.7, peak: 0.1, verb: 0.5, type: 'triangle' });
      a.tone(out, { f: midi(84 + n), t: t + i * 0.09, d: 0.5, peak: 0.04, verb: 0.6 });
    });
  });

  // "wheeeee-eeee": the rider's voice while airborne. opts.h receives { p } so the caller can move the sound along.
  audio.registerSfx('swing-wee', (a, x, y, z, { pitch = 160, dur = 1.8, h = {} } = {}) => {
    const ctx = a.ctx, t = ctx.currentTime + 0.02;
    const p = a.panner(x, y, z, 3, 1.2);
    p.connect(a.voices);
    h.p = p;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch * 0.9, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 1.75, t + 0.28);
    o.frequency.linearRampToValueAtTime(pitch * 1.95, t + dur * 0.5);
    o.frequency.exponentialRampToValueAtTime(pitch * 1.2, t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 6.5;
    const vg = a.gain(pitch * 0.045); vib.connect(vg).connect(o.frequency);
    const fk = pitch > 190 ? 1.14 : pitch > 130 ? 1.03 : 0.95;
    const pre = a.gain(2.6); o.connect(pre);
    const F1 = a.filter('bandpass', 310 * fk, 5), F2 = a.filter('bandpass', 2250 * fk, 6), F3 = a.filter('bandpass', 3000 * fk, 5); // a long "eee"
    const env = a.gain(0);
    pre.connect(F1).connect(a.gain(1)).connect(env);
    pre.connect(F2).connect(a.gain(0.7)).connect(env);
    pre.connect(F3).connect(a.gain(0.3)).connect(env);
    env.connect(p);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.19, t + 0.08);
    env.gain.setValueAtTime(0.19, t + dur * 0.8);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } h.p = null; }, (dur + 0.6) * 1000);
  });

  // a small laugh / "whee" for a friend who is being pushed
  audio.registerSfx('swing-giggle', (a, x, y, z, { pitch = 160 } = {}) => {
    a.speak(x, y, z, 'hahaha', { pitch, formant: pitch > 190 ? 1.14 : pitch > 130 ? 1.03 : 0.95 });
  });
}
