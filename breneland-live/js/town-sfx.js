// The town's sounds, in one place: cars (horn, a brake squeak, the engine hum loop), the fountain (a splash bed
// and plips), and the Unstable Unicorns lawn (balloons, sparkles, the clouds, the rainbow hum, party noises).
// One-shots go through audio.registerSfx so the level meter (tools/audio-levels.mjs) can measure them; the loops are
// built here too and handed back as little controllers. Peaks 0.05-0.3 before the master stage (CONTRACTS.md).
import { loopSource } from './sfx-bank.js';
const TAU = Math.PI * 2;
// the real fountain's level (water splashing into a basin, a loop from sfx-bank.js, measured with
// tools/sfx-calibrate.mjs against the synthesised bed it replaces)
export const FOUNTAIN_REAL = 0.45;

export function registerTownSfx(a) {
  if (!a.registerSfx || a.sfxLib?.['car-horn']) return;
  // ---- cars
  // a two-note horn: sawtooth pair through a nasal band, a short "beep" or a longer "beeeep" (opts.long)
  a.registerSfx('car-horn', (a, x, y, z, { long = false, k = 1 } = {}) => {
    const out = a.at(x, y, z, 6, 1.1), t = a.ctx.currentTime, d = long ? 0.55 : 0.28;
    const bp = a.filter('bandpass', 900, 1.6); bp.connect(out);
    for (const f of [392, 494]) {
      const o = a.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      const g = a.gain(0);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * k, t + 0.02); g.gain.setValueAtTime(0.12 * k, t + d - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(bp); o.start(t); o.stop(t + d + 0.05);
    }
  });
  // tyres complaining a little when a car brakes hard
  a.registerSfx('car-brake', (a, x, y, z) => {
    const out = a.at(x, y, z, 5, 1.2), t = a.ctx.currentTime;
    a.tone(out, { f: 2300, glide: 1700, t, a: 0.02, d: 0.22, peak: 0.045, type: 'sine' });
    a.burst(out, { t, dur: 0.25, type: 'bandpass', f: 2600, Q: 2.5, peak: 0.05, attack: 0.03 });
  });

  // ---- the fountain
  a.registerSfx('fountain-plip', (a, x, y, z) => {
    const out = a.at(x, y, z, 4, 1.3), t = a.ctx.currentTime;
    a.tone(out, { f: 1300 + Math.random() * 500, glide: 500, t, a: 0.003, d: 0.09, peak: 0.05 });
  });
  a.registerSfx('fountain-splash', (a, x, y, z, { k = 1 } = {}) => {
    const out = a.at(x, y, z, 4, 1.3), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.32, type: 'lowpass', f: 1100, sweep: 500, Q: 0.6, peak: 0.08 * k, brown: true, attack: 0.03 });
    a.burst(out, { t: t + 0.02, dur: 0.2, type: 'bandpass', f: 2600, Q: 0.8, peak: 0.03 * k, attack: 0.02 });
  });

  // ---- the unicorn lawn
  // a balloon's rubber squeak as it bobs: a bright sine with a wobble, a little rising
  a.registerSfx('uni-squeak', (a, x, y, z) => {
    const out = a.at(x, y, z, 3, 1.4), t = a.ctx.currentTime;
    const o = a.ctx.createOscillator(); o.type = 'sine';
    const f0 = 900 + Math.random() * 300;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.12);
    const wob = a.ctx.createOscillator(); wob.frequency.value = 28; const wg = a.gain(90); wob.connect(wg).connect(o.frequency);
    const g = a.gain(0); a.env(g, t, 0.01, 0.045, 0.13);
    o.connect(g).connect(out); o.start(t); wob.start(t); o.stop(t + 0.2); wob.stop(t + 0.2);
  });
  // the string tugging at the knot
  a.registerSfx('uni-creak', (a, x, y, z) => { const out = a.at(x, y, z, 3, 1.4); a.creak(out, a.ctx.currentTime, 0.45); });
  // POP: a sharp crack with a low thump, then bits of rubber flapping
  a.registerSfx('uni-pop', (a, x, y, z) => {
    const out = a.at(x, y, z, 6, 1.1), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.04, type: 'bandpass', f: 2200, Q: 0.5, peak: 0.3, attack: 0.001 });
    a.tone(out, { f: 160, glide: 60, t, a: 0.002, d: 0.12, peak: 0.14 });
    for (let i = 0; i < 3; i++) a.burst(out, { t: t + 0.06 + i * 0.045, dur: 0.03, type: 'bandpass', f: 1400 - i * 200, Q: 1.5, peak: 0.05 });
  });
  // a kid's giggle (the Party Kid's voice) through the voice bus
  a.registerSfx('uni-giggle', (a, x, y, z) => { a.speak(x, y, z, 'hehehe!', { pitch: 330, rate: 1.3, formant: 1.25 }); });
  // a sparkle twinkling: two tiny high bells with a touch of reverb (matches the sparkle particles' flash)
  a.registerSfx('uni-twinkle', (a, x, y, z, { k = 1 } = {}) => {
    const out = a.at(x, y, z, 4, 1.3), t = a.ctx.currentTime;
    const base = [2093, 2349, 2637, 3136][Math.floor(Math.random() * 4)];
    a.tone(out, { f: base, t, a: 0.003, d: 0.35, peak: 0.035 * k, verb: 0.6 });
    a.tone(out, { f: base * 1.5, t: t + 0.07, a: 0.003, d: 0.3, peak: 0.022 * k, verb: 0.6, type: 'triangle' });
  });
  // walking through a cloud: a soft fluffy whoosh (air through a pillow)
  a.registerSfx('uni-whoosh', (a, x, y, z) => {
    const out = a.at(x, y, z, 3, 1.3), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.7, type: 'lowpass', f: 900, sweep: 1600, Q: 0.5, peak: 0.1, attack: 0.18 });
    a.burst(out, { t: t + 0.1, dur: 0.5, type: 'bandpass', f: 500, Q: 0.8, peak: 0.05, attack: 0.15, brown: true });
  });
  // party horn: a reedy honk that wobbles up
  a.registerSfx('uni-horn', (a, x, y, z) => {
    const out = a.at(x, y, z, 5, 1.2), t = a.ctx.currentTime, d = 0.45 + Math.random() * 0.3;
    const o = a.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(410, t); o.frequency.linearRampToValueAtTime(470, t + d);
    const wob = a.ctx.createOscillator(); wob.frequency.value = 9; const wg = a.gain(14); wob.connect(wg).connect(o.frequency);
    const bp = a.filter('bandpass', 1200, 2.5), g = a.gain(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + 0.04); g.gain.setValueAtTime(0.11, t + d - 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(bp).connect(g).connect(out); o.start(t); wob.start(t); o.stop(t + d + 0.05); wob.stop(t + d + 0.05);
  });
  // kazoo: three buzzy notes of a little tune
  a.registerSfx('uni-kazoo', (a, x, y, z) => {
    const out = a.at(x, y, z, 5, 1.2), t = a.ctx.currentTime;
    const tune = Math.random() < 0.5 ? [[0, 0.18], [4, 0.18], [7, 0.3]] : [[7, 0.16], [4, 0.16], [0, 0.32]];
    let at = t;
    for (const [n, d] of tune) {
      const o = a.ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(330 * Math.pow(2, n / 12), at);
      const bp = a.filter('bandpass', 1500, 1.8), g = a.gain(0);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.07, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(bp).connect(g).connect(out); o.start(at); o.stop(at + d + 0.02);
      at += d + 0.03;
    }
  });
  // a confetti popper: a pop, then a shower of paper (a bright rustle) and a tiny shimmer
  a.registerSfx('uni-confetti', (a, x, y, z) => {
    const out = a.at(x, y, z, 5, 1.2), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.05, type: 'bandpass', f: 1000, Q: 0.6, peak: 0.2, attack: 0.001 });
    a.burst(out, { t: t + 0.06, dur: 0.9, type: 'highpass', f: 3200, Q: 0.5, peak: 0.035, attack: 0.1 });
    for (let i = 0; i < 4; i++) a.tone(out, { f: [2637, 3136, 3520, 4186][i], t: t + 0.08 + i * 0.07, d: 0.3, peak: 0.02, verb: 0.5 });
  });
}

// ---- loops (the caller moves and fades them each frame; stop() tears them down)

// An engine: a low pulse (the firing) plus a band of road noise. speedK 0..1 raises the pitch and the noise.
export function engineLoop(a, x, y, z) {
  const ctx = a.ctx, p = a.panner(x, y, z, 5, 1.3);
  p.connect(a.amb);
  const g = a.gain(0); g.connect(p);
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
  const lp = a.filter('lowpass', 220, 0.9); o.connect(lp).connect(g);
  const n = a.noise('brown'); const nf = a.filter('bandpass', 420, 0.7); const ng = a.gain(0.5); n.connect(nf).connect(ng).connect(g);
  o.start(); n.start();
  return {
    set(x, y, z, speedK, level) {
      const t = ctx.currentTime;
      a.movePanner(p, x, y, z);
      o.frequency.setTargetAtTime(44 + speedK * 70, t, 0.2);
      lp.frequency.setTargetAtTime(200 + speedK * 500, t, 0.2);
      nf.frequency.setTargetAtTime(380 + speedK * 900, t, 0.2);
      ng.gain.setTargetAtTime(0.25 + speedK * 0.9, t, 0.2);
      g.gain.setTargetAtTime(level, t, 0.15);
    },
    stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => { try { o.stop(); n.stop(); } catch { /* stopped */ } p.disconnect(); }, 900); },
  };
}

// The fountain: the hiss of the column and the chatter of water into the basin. gain 0..1 by distance. A real recording
// takes over from the synthesised noise once the bank has it.
export function fountainBed(a, x, y, z) {
  const ctx = a.ctx, p = a.panner(x, y, z, 4, 1.3);
  p.connect(a.amb); p.verbDest = a.ambVerbIn;
  const g = a.gain(0); g.connect(p);
  const synth = a.gain(1); synth.connect(g);   // (the synthesised water, faded out when the real one arrives)
  // (mixed 3 dB down with the rest of the area soundscapes, the hiss a touch lower still)
  const w = a.noise('white'); const wf = a.filter('bandpass', 3200, 0.6); const wg = a.gain(0.022); w.connect(wf).connect(wg).connect(synth);
  const b = a.noise('brown'); const bf = a.filter('lowpass', 700, 0.7); const bg = a.gain(0.113); b.connect(bf).connect(bg).connect(synth);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37; const lg = a.gain(600); lfo.connect(lg).connect(wf.frequency);
  w.start(); b.start(); lfo.start();
  let real = null;
  const ensureReal = () => {
    const src = !real && loopSource(a, 'loop-fountain');
    if (!src) return;
    const rg = a.gain(0); src.connect(rg).connect(g); src.start();
    rg.gain.setTargetAtTime(FOUNTAIN_REAL, ctx.currentTime, 0.6);
    synth.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    real = src;
  };
  ensureReal();
  return {
    set(level) { if (!real) ensureReal(); g.gain.setTargetAtTime(level, ctx.currentTime, 0.4); },
    get real() { return !!real; },
    stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { w.stop(); b.stop(); lfo.stop(); real?.stop(); } catch { /* stopped */ } p.disconnect(); }, 1500); },
  };
}

// The rainbow's shimmer: two detuned sines an octave apart with a slow chorus, rising in pitch as you walk under it.
export function rainbowHum(a, x, y, z) {
  const ctx = a.ctx, p = a.panner(x, y, z, 4, 1.2);
  p.connect(a.amb); p.verbDest = a.ambVerbIn;
  const g = a.gain(0); g.connect(p);
  const oscs = [];
  for (const [f, v] of [[261.6, 0.018], [263.4, 0.014], [523.3, 0.008], [784.9, 0.004]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const og = a.gain(v); o.connect(og).connect(g); o.start(); oscs.push({ o, f });
  }
  const sh = ctx.createOscillator(); sh.frequency.value = 0.8; const sg = a.gain(2.5); sh.connect(sg); sh.start();
  for (const { o } of oscs) sg.connect(o.frequency);
  const send = a.gain(0.6); g.connect(send).connect(a.ambVerbIn);
  return {
    set(level, pitch) { const t = ctx.currentTime; g.gain.setTargetAtTime(level, t, 0.3); for (const { o, f } of oscs) o.frequency.setTargetAtTime(f * pitch, t, 0.25); },
    stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => { try { for (const { o } of oscs) o.stop(); sh.stop(); } catch { /* stopped */ } p.disconnect(); }, 1200); },
  };
}
void TAU;
