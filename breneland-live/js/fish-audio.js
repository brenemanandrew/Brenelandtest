// Fishing sound effects, registered with the audio engine (docs/CONTRACTS.md, contract 8). Peaks stay 0.05 to 0.25.
// a = the engine (a.tone, a.burst, a.at, a.sfx). Pass a world position to place a sound at the water; leave it off for UI sounds.
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const out = (a, x, y, z, ref = 6) => (typeof x === 'number' ? a.at(x, y, z, ref) : a.sfx);

export function registerFishingSounds(audio) {
  const R = (name, fn) => audio.registerSfx(name, fn);

  R('fish-whoosh', (a, x, y, z, o = {}) => {
    const t = a.ctx.currentTime, p = 0.4 + 0.6 * (o.power ?? 0.5);
    a.burst(out(a, x, y, z), { t, dur: 0.22 + 0.15 * p, type: 'bandpass', f: 500, sweep: 1900 + 900 * p, Q: 1.3, peak: 0.17 + 0.08 * p, attack: 0.05 });
  });
  R('fish-plink', (a, x, y, z, o = {}) => { // the bobber lands
    const t = a.ctx.currentTime, d = out(a, x, y, z);
    a.tone(d, { f: 1000, glide: 520, t, d: 0.09, peak: 0.13, type: 'sine' });
    a.burst(d, { t, dur: 0.12, type: 'highpass', f: 2600, peak: 0.1 });
    a.tone(d, { f: 420, glide: 300, t: t + 0.05, d: 0.14, peak: 0.07, type: 'triangle', verb: 0.3 });
  });
  R('fish-splash', (a, x, y, z, o = {}) => {
    const t = a.ctx.currentTime, d = out(a, x, y, z, 7), k = o.size ?? 1;
    a.burst(d, { t, dur: 0.3 + 0.1 * k, type: 'bandpass', f: 1100, sweep: 420, Q: 0.8, peak: 0.16 * Math.min(1.3, k) });
    a.burst(d, { t: t + 0.03, dur: 0.18, type: 'highpass', f: 3000, peak: 0.07 });
    a.tone(d, { f: 220, glide: 90, t, d: 0.2, peak: 0.1 * k });
  });
  R('fish-ripple', (a, x, y, z) => {
    const t = a.ctx.currentTime, d = out(a, x, y, z, 5);
    a.tone(d, { f: 540, glide: 360, t, d: 0.3, peak: 0.05, type: 'triangle', a: 0.02, verb: 0.35 });
  });
  R('fish-tick', (a, x, y, z) => { // a nibble
    const t = a.ctx.currentTime, d = out(a, x, y, z, 4);
    a.tone(d, { f: 1700, glide: 1300, t, d: 0.045, peak: 0.1, type: 'triangle' });
    a.tone(d, { f: 900, glide: 700, t: t + 0.05, d: 0.05, peak: 0.07, type: 'triangle' });
  });
  R('fish-bloop', (a, x, y, z) => { // the bite: sharp and unmistakable
    const t = a.ctx.currentTime, d = out(a, x, y, z, 12);
    a.tone(d, { f: 330, glide: 920, t, d: 0.14, peak: 0.24, type: 'sine' });
    a.tone(d, { f: 520, glide: 1350, t: t + 0.09, d: 0.16, peak: 0.2, type: 'sine', verb: 0.3 });
    a.burst(d, { t, dur: 0.12, type: 'bandpass', f: 1500, peak: 0.08 });
  });
  R('fish-reel', (a, x, y, z, o = {}) => { // one click of the reel; call it in a rhythm
    const t = a.ctx.currentTime, d = out(a, x, y, z, 4);
    a.burst(d, { t, dur: 0.025, type: 'highpass', f: 3800, peak: 0.07 + 0.03 * (o.tension ?? 0) });
    a.tone(d, { f: 1500 + 300 * (o.tension ?? 0), t, d: 0.02, peak: 0.04, type: 'square' });
  });
  R('fish-snap', (a, x, y, z) => { // too early / too late
    const t = a.ctx.currentTime, d = out(a, x, y, z, 6);
    a.burst(d, { t, dur: 0.14, type: 'bandpass', f: 1800, sweep: 700, Q: 1, peak: 0.08 });
    a.tone(d, { f: 300, glide: 180, t, d: 0.16, peak: 0.07, type: 'triangle' });
  });
  R('fish-catch', (a, x, y, z, o = {}) => { // a rising arpeggio; the golden fish and personal bests get a longer one
    const t = a.ctx.currentTime, d = out(a, x, y, z, 14), big = o.big ? 2 : 0;
    const notes = [72, 76, 79, 84, 88, 91].slice(0, 4 + big);
    notes.forEach((n, i) => a.tone(d, { f: midi(n), t: t + i * 0.085, d: 0.34, peak: 0.13, type: 'triangle', verb: 0.5 }));
    a.tone(d, { f: midi(96), t: t + notes.length * 0.085, d: 0.7, peak: 0.06, type: 'sine', verb: 0.6 });
  });
  R('fish-golden', (a, x, y, z) => {
    const t = a.ctx.currentTime, d = out(a, x, y, z, 14);
    for (let i = 0; i < 8; i++) a.tone(d, { f: midi(84 + PENTA[i % 8]), t: t + 0.4 + i * 0.07, d: 0.45, peak: 0.06, type: 'sine', verb: 0.6 });
  });
  R('fish-junk', (a, x, y, z) => { // wah wah
    const t = a.ctx.currentTime, d = out(a, x, y, z, 10);
    a.tone(d, { f: 300, glide: 210, t, d: 0.26, peak: 0.1, type: 'sawtooth', a: 0.03 });
    a.tone(d, { f: 250, glide: 130, t: t + 0.3, d: 0.42, peak: 0.1, type: 'sawtooth', a: 0.03 });
  });
  R('fish-toss', (a, x, y, z) => {
    const t = a.ctx.currentTime;
    a.burst(out(a, x, y, z), { t, dur: 0.22, type: 'bandpass', f: 700, sweep: 1800, Q: 1.1, peak: 0.13, attack: 0.05 });
  });
  R('fish-thud', (a, x, y, z, o = {}) => {
    const t = a.ctx.currentTime, d = out(a, x, y, z, 6), k = o.k ?? 1;
    a.tone(d, { f: 130, glide: 60, t, d: 0.13, peak: 0.14 * k });
    a.burst(d, { t, dur: 0.1, type: 'lowpass', f: 500, peak: 0.11 * k, brown: true });
  });
  R('fish-chomp', (a, x, y, z) => {
    const t = a.ctx.currentTime, d = out(a, x, y, z, 6);
    a.burst(d, { t, dur: 0.05, type: 'bandpass', f: 2200, peak: 0.1 });
    a.burst(d, { t: t + 0.09, dur: 0.05, type: 'bandpass', f: 1800, peak: 0.09 });
    a.tone(d, { f: 180, glide: 110, t, d: 0.08, peak: 0.07, type: 'triangle' });
  });
  R('fish-pop', (a) => { a.tone(a.sfx, { f: 720, glide: 380, t: a.ctx.currentTime, d: 0.1, peak: 0.09, type: 'sine' }); });
  R('fish-equip', (a) => {
    const t = a.ctx.currentTime;
    a.tone(a.sfx, { f: 520, glide: 780, t, d: 0.09, peak: 0.08, type: 'triangle' });
    a.tone(a.sfx, { f: 780, glide: 1040, t: t + 0.06, d: 0.09, peak: 0.06, type: 'triangle' });
  });
  R('fish-away', (a) => { a.tone(a.sfx, { f: 700, glide: 420, t: a.ctx.currentTime, d: 0.11, peak: 0.07, type: 'triangle' }); });
  R('fish-item', (a) => { // you got something!
    const t = a.ctx.currentTime;
    [79, 83, 86, 91].forEach((n, i) => a.tone(a.sfx, { f: midi(n), t: t + i * 0.09, d: 0.4, peak: 0.1, type: 'triangle', verb: 0.5 }));
  });
  R('fish-blip', (a) => { a.tone(a.sfx, { f: 900, glide: 1100, t: a.ctx.currentTime, d: 0.05, peak: 0.05, type: 'triangle' }); });
}
