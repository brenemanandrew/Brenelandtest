// The table games' sounds (tg-look), all generated with Web Audio, no files: through the effects bus, so they follow the
// Sound settings, and silent until the first click switches the sound on (audio.js makes its context then). With no position a
// sound plays straight to the bus (your own table, the overlay); with one, from the table (a passer-by hears it from there).
// The round-1 names (tg-clack, tg-click, tg-shuffle, tg-bell, tg-knock) are kept as quiet stand-ins: the moments are played
// from here now (tg-look.js), timed to what you see (the clack when the tile lands, not when the server says so).
export const SOUNDS = ['tg-tile', 'tg-lift', 'tg-back', 'tg-hover', 'tg-draw', 'tg-deal', 'tg-chuff', 'tg-ring', 'tg-answer', 'tg-onetile', 'tg-yourturn', 'tg-tick', 'tg-tally', 'tg-fanfare', 'tg-cheer', 'tg-stamp'];
const OLD = ['tg-clack', 'tg-click', 'tg-shuffle', 'tg-bell', 'tg-knock'];
const outOf = (a, x, y, z, ref = 3) => (x == null ? a.sfx : a.at(x, y, z, ref));
const LIB = {
  // an ivory tile clicked down on the cloth: a sharp click, the woody body of it, a tiny bounce
  'tg-tile'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.014, f: 3600, Q: 5, peak: 0.2 }); a.burst(o, { t: t + 0.004, dur: 0.03, f: 1500, Q: 2, peak: 0.07 }); a.tone(o, { f: 240, glide: 170, t, a: 0.002, d: 0.07, peak: 0.08, type: 'triangle' }); a.burst(o, { t: t + 0.055, dur: 0.012, f: 3900, Q: 6, peak: 0.06 }); },
  // picked up off the rack: a little tick and a breath of air
  'tg-lift'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.012, f: 2800, Q: 4, peak: 0.05 }); a.burst(o, { t: t + 0.01, dur: 0.09, f: 1400, sweep: 2600, Q: 1.5, peak: 0.03, attack: 0.02 }); },
  // slid back to the rack, then set down
  'tg-back'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.16, f: 1600, sweep: 700, Q: 1.2, peak: 0.045, attack: 0.01 }); a.burst(o, { t: t + 0.2, dur: 0.012, f: 3200, Q: 5, peak: 0.08 }); },
  // over a spot it fits: the faintest tick
  'tg-hover'(a, x, y, z) { const o = outOf(a, x, y, z); a.tone(o, { f: 1320, t: a.ctx.currentTime, d: 0.035, peak: 0.016 }); },
  // a draw from the boneyard: a shuffle-slide
  'tg-draw'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.2, f: 900, sweep: 2000, Q: 1.3, peak: 0.06, attack: 0.02 }); for (const [k, f] of [[0.05, 2600], [0.11, 3000], [0.19, 3300]]) a.burst(o, { t: t + k, dur: 0.012, f, Q: 5, peak: 0.045 }); },
  // the deal: the tiles shuffled on the cloth
  'tg-deal'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.6, f: 800, sweep: 1500, Q: 0.9, peak: 0.04, attack: 0.08 }); for (let i = 0; i < 14; i++) a.burst(o, { t: t + i * 0.045 + (i % 3) * 0.011, dur: 0.016, f: 2400 + (i % 5) * 300, Q: 4, peak: 0.04 + (i % 4) * 0.01 }); },
  // a pass: the marker engine chuffs up and whistles
  'tg-chuff'(a, x, y, z) { const o = outOf(a, x, y, z, 4), t = a.ctx.currentTime; for (const [k, p] of [[0, 0.1], [0.15, 0.08], [0.28, 0.07]]) a.burst(o, { t: t + k, dur: 0.09, type: 'lowpass', f: 600, Q: 0.8, peak: p, brown: true, attack: 0.01 }); a.tone(o, { f: 1480, glide: 1568, t: t + 0.42, a: 0.03, d: 0.32, peak: 0.04 }); a.tone(o, { f: 1865, glide: 1976, t: t + 0.42, a: 0.03, d: 0.32, peak: 0.03 }); },
  // a double played: a small bell rings
  'tg-ring'(a, x, y, z) { const o = outOf(a, x, y, z, 5), t = a.ctx.currentTime; a.tone(o, { f: 1318, t, d: 1.0, peak: 0.06, verb: 0.5 }); a.tone(o, { f: 1976, t: t + 0.003, d: 0.8, peak: 0.035, verb: 0.5 }); a.tone(o, { f: 2637, t, d: 0.45, peak: 0.018 }); },
  // the double answered: two notes up
  'tg-answer'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.tone(o, { f: 988, t, d: 0.16, peak: 0.045, type: 'triangle' }); a.tone(o, { f: 1318, t: t + 0.11, d: 0.3, peak: 0.05, type: 'triangle', verb: 0.3 }); },
  // one tile left: two knocks on the table
  'tg-onetile'(a, x, y, z) { const o = outOf(a, x, y, z, 4), t = a.ctx.currentTime; for (const k of [0, 0.15]) { a.burst(o, { t: t + k, dur: 0.05, f: 420, Q: 1.4, peak: 0.15, brown: true }); a.tone(o, { f: 170, glide: 120, t: t + k, d: 0.06, peak: 0.06 }); } },
  // your turn: a soft bell
  'tg-yourturn'(a, x, y, z) { const o = outOf(a, x, y, z, 6), t = a.ctx.currentTime; a.tone(o, { f: 1568, t, d: 0.7, peak: 0.055, verb: 0.4 }); a.tone(o, { f: 2093, t: t + 0.09, d: 0.8, peak: 0.04, verb: 0.4 }); },
  // the pips counted up: a tick each
  'tg-tick'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.tone(o, { f: 2300, t, d: 0.02, peak: 0.025, type: 'triangle' }); a.burst(o, { t, dur: 0.006, f: 4200, Q: 3, peak: 0.03 }); },
  // a seat's count done
  'tg-tally'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.tone(o, { f: 330, glide: 260, t, d: 0.12, peak: 0.06, type: 'triangle' }); },
  // the game won: a short fanfare
  'tg-fanfare'(a, x, y, z) { const o = outOf(a, x, y, z, 6), t = a.ctx.currentTime; [523, 659, 784].forEach((f, i) => a.tone(o, { f, t: t + i * 0.12, d: 0.14, peak: 0.055, type: 'triangle' })); for (const f of [523, 659, 784, 1047]) a.tone(o, { f, t: t + 0.36, d: 0.75, peak: 0.035, type: 'triangle', verb: 0.4 }); },
  // someone else won: a friendly little cadence
  'tg-cheer'(a, x, y, z) { const o = outOf(a, x, y, z, 6), t = a.ctx.currentTime; a.tone(o, { f: 659, t, d: 0.14, peak: 0.04, type: 'triangle' }); a.tone(o, { f: 784, t: t + 0.13, d: 0.45, peak: 0.04, type: 'triangle', verb: 0.3 }); },
  // a stamp eyecatch landing
  'tg-stamp'(a, x, y, z) { const o = outOf(a, x, y, z), t = a.ctx.currentTime; a.tone(o, { f: 130, glide: 70, t, a: 0.003, d: 0.14, peak: 0.1 }); a.burst(o, { t, dur: 0.05, type: 'lowpass', f: 700, peak: 0.07, brown: true }); },
};
// (re)register every sound; the old names as quiet stand-ins (index.js registers its own after the overlay is made, so this
// runs again before each table message reaches it)
export function registerSounds(audio) {
  if (!audio || !audio.registerSfx) return;
  const lib = audio.sfxLib || {};
  for (const n of SOUNDS) if (lib[n] !== LIB[n]) audio.registerSfx(n, LIB[n]);
  for (const n of OLD) if (!lib[n] || !lib[n].quiet) audio.registerSfx(n, QUIET);
}
const QUIET = () => {}; QUIET.quiet = true;
