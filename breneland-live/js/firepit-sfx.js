// The firepit's two one-shot sounds, measured by tools/audio-levels.mjs (group `firepit`). The fire's own crackle is the
// 'firepit' area bed in audio.js, scaled by the fire curve (firepit.js sets the table's `k`).
//   fire-light   a match struck, a little whoomph as the kindling catches
//   fire-douse   a bucket of water: a slosh and a long hiss of steam
const rand = (a, b) => a + Math.random() * (b - a);

export function registerFirepitSfx(audio) {
  if (!audio?.registerSfx || audio._firepitSfx) return;
  audio._firepitSfx = true;
  const at = (a, x, y, z) => (x === undefined ? a.sfx : a.at(x, y, z, 3));
  audio.registerSfx('fire-light', (a, x, y, z) => {
    const o = at(a, x, y, z), t = a.ctx.currentTime;
    a.burst(o, { t, dur: 0.09, type: 'bandpass', f: 3200, Q: 1.4, peak: 0.12 });                 // the strike
    a.burst(o, { t: t + 0.08, dur: 0.35, type: 'bandpass', f: 1900, Q: 0.9, peak: 0.05, attack: 0.03 }); // the match flaring
    a.burst(o, { t: t + 0.55, dur: 0.9, type: 'lowpass', f: 420, peak: 0.16, attack: 0.18, brown: true }); // whoomph
    for (let i = 0; i < 5; i++) a.burst(o, { t: t + 0.7 + i * rand(0.08, 0.2), dur: rand(0.006, 0.02), type: 'bandpass', f: rand(1500, 3200), Q: 0.8, peak: rand(0.05, 0.12) });
  });
  audio.registerSfx('fire-douse', (a, x, y, z) => {
    const o = at(a, x, y, z), t = a.ctx.currentTime;
    a.burst(o, { t, dur: 0.4, type: 'lowpass', f: 900, peak: 0.14, attack: 0.04, brown: true });     // the slosh
    a.burst(o, { t: t + 0.12, dur: 2.4, type: 'bandpass', f: 3400, Q: 0.5, peak: 0.07, attack: 0.08 }); // the hiss, soft
    a.burst(o, { t: t + 0.2, dur: 1.6, type: 'bandpass', f: 1800, Q: 0.7, peak: 0.035, attack: 0.2 });
  });
}
