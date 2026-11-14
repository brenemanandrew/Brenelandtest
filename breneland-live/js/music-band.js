// Our own music, in the spirit of Animal Crossing and fitting the areas, played on real instruments as mostly incidental lo-fi. A
// band plays one song from music-songs.js live with Web Audio: each note is a recorded sample of its instrument (music-sampler.js,
// passed in as opt.bank: upright piano, vibes, marimba, kalimba, glockenspiel, music box, celesta, flute, clarinet, ocarina, harp,
// nylon and steel guitars, banjo, a strumstick for the mandolin, violin, violas, cellos, pizzicato strings, upright bass, a soft
// kit), pitch-shifted from the nearest recorded note. An instrument whose samples didn't load plays its synthesised voice (V
// below). Then the lo-fi stage (LOFI): a little tape saturation, wow and flutter, a soft high cut, hiss and crackle kept very low,
// a small room, laid-back timing. Notes are scheduled a fraction of a second ahead, a bar at a time, and the nodes of a note go
// when it ends.
//
// A song is data: chords per bar ("Fmaj7 | Dm9 | Gm7 C9"), melody lines ("c5/1 a4/1 f5/2 |", durations in eighth notes), comping,
// arpeggio, bass and drum patterns by name, sections (A, B, C, intro, outro) and a form that repeats them with changes (another
// lead, a key lift, an octave, a part dropped or added). The tests read the same data (music-ac-test: every line the length of its
// section, the melody on the chord, every section heard).
//
//   createBand(audio, song, { out, variant, start, seed, db, loop, bank }) -> band   (bank: music-sampler.js instBank(ctx); none: the synth)
//     band.start(when, { fade, from })   fade in (s), the lowpass opening from `from` Hz (a muffled door opening)
//     band.pump(now)                     every frame: schedules what is due in the next AHEAD seconds (cheap when nothing is)
//     band.stop(fade, { to })            fade out (s), the lowpass closing to `to` Hz; scheduling stops
//     band.cue('catch')                  the song's sting (fishing): the bed dips, a flourish in its key, the bed swells back
//     band.render(until)                 offline: schedule everything up to `until` (tests, levels)
//     band.state()                       { id, section, sections, bar, bars, loops, done, ... }
// No imports (Node reads the parsers for the tests). Sound is local to the player: Math.random is fine for the tiny variations.
// Incidental: a form entry with `air: true` drops the tune for a section (the band carries on underneath), `thin` (song,
// section or variant) leaves out a share of the comping, arpeggio, roll, chop and drum notes, and the dynamics breathe bar to bar.

const mf = n => 440 * Math.pow(2, (n - 69) / 12);
const dbGain = db => Math.pow(10, db / 20);
export const AHEAD = 0.3;   // seconds of notes scheduled ahead of the clock
export const BASE_DB = -17; // every song's level into the music bus before its own `db` (measured: music-ac-test --calibrate)
export const TAPE_IN = -6;  // dB into the tape's saturation, taken off again after it: the loudest piano attacks reach it about -3 dBFS

export function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// ------------------------------------------------------------------ notes, chords, lines
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** 'c5', 'eb4', 'f#3' -> MIDI (C4 = 60); NaN if not a note */
export function noteNum(tok) {
  const m = /^([a-gA-G])(#|b)?(-?\d)$/.exec(tok);
  if (!m) return NaN;
  return 12 * (+m[3] + 1) + PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], '69': [0, 4, 7, 9, 14], m69: [0, 3, 7, 9, 14],
  '13': [0, 4, 7, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10],
  '9sus4': [0, 5, 7, 10, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], mmaj7: [0, 3, 7, 11], 'maj7#11': [0, 4, 7, 11, 18],
  aug: [0, 4, 8], m11: [0, 3, 7, 10, 14, 17], '5': [0, 7],
};
const ROOT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = s => { const m = /^([A-G])(#|b)?$/.exec(s); if (!m) throw new Error('bad root ' + s); return (ROOT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; };
/** 'Dm9', 'Bbmaj7', 'C/E', 'A7sus4' -> { sym, root, ivs, bass, minor } */
export function parseChord(sym) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(main);
  if (!m || !QUAL[m[2]]) throw new Error('bad chord ' + sym);
  const root = pcOf(m[1]), ivs = QUAL[m[2]];
  return { sym, root, ivs, bass: slash ? pcOf(slash) : root, minor: ivs.includes(3) && !ivs.includes(4) };
}
/** 'Fmaj7 | Dm9 | Gm7 C9' -> bars: [[{ ch, pos, dur }]] (eighths within the bar; chords in a bar share it evenly) */
export function parseChords(str, E) {
  return str.split('|').map(b => b.trim()).filter(Boolean).map(b => {
    const syms = b.split(/\s+/), d = E / syms.length;
    return syms.map((s, i) => ({ ch: parseChord(s), pos: i * d, dur: d }));
  });
}
/** A melody line: 'c5/2 e5 g5/1 | r/4 bb4+d5/2 ~/2' -> [{ pos, dur, n, vel }] (eighths; '/d' sets the duration, kept for the
 *  next notes; 'r' a rest; '~' ties onto the note(s) before; 'a+b' a dyad; '!' accents, '?' softens; '|' must fall on a bar line) */
export function parseLine(str, E = 8) {
  const out = []; let pos = 0, dur = 2, lastPos = -1;
  for (const raw of String(str).trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw === '|') { if (Math.abs(pos / E - Math.round(pos / E)) > 1e-6) throw new Error(`bar line at ${pos} eighths (not a bar) in: ${str.slice(0, 60)}`); continue; }
    let [body, d] = raw.split('/');
    if (d !== undefined) { dur = +d; if (!(dur > 0)) throw new Error('bad duration ' + raw); }
    let vel = 0.8;
    if (body[0] === '!') { vel = 1; body = body.slice(1); } else if (body[0] === '?') { vel = 0.55; body = body.slice(1); }
    if (body === '~') { for (const nt of out) if (nt.pos === lastPos) nt.dur += dur; pos += dur; continue; }
    if (body !== 'r') {
      for (const nt of body.split('+')) { const n = noteNum(nt); if (!Number.isFinite(n)) throw new Error(`bad note "${nt}" in: ${str.slice(0, 60)}`); out.push({ pos, dur, n, vel }); }
      lastPos = pos;
    }
    pos += dur;
  }
  out.len = pos;
  return out;
}
// swung time: an eighth-note position -> eighths of straight time (the off-beat eighth pushed late by `sw`, 0..0.33)
export function swung(pos, sw) {
  if (!sw) return pos;
  const beat = Math.floor(pos / 2), f = pos - beat * 2;
  return beat * 2 + (f <= 1 ? f * (1 + sw) : (1 + sw) + (f - 1) * (1 - sw));
}

// ------------------------------------------------------------------ the instruments
// Each plays one note: (B, out, t, n, dur, vel); B = { ctx, white }. Peaks about 0.1-0.25 before the channel's level.
function osc(c, type, f, t, end) { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(end); return o; }
function amp(c, v = 0) { const g = c.createGain(); g.gain.value = v; return g; }
function lpf(c, f, q = 0.5, type = 'lowpass') { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
const lowness = n => Math.max(0, Math.min(1, (84 - n) / 36));   // 0 at C6 and up, 1 at C3 and down
const done = (o, ...nodes) => { o.onended = () => { for (const x of nodes) { try { x.disconnect(); } catch { /* gone */ } } }; };
// an envelope: attack to pk, decay toward sus*pk with tau, release from t+dur with rel
function adsr(g, t, a, pk, tau, sus, dur, rel) {
  const p = g.gain;
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(pk, t + a);
  if (tau) p.setTargetAtTime(pk * sus, t + a, tau);
  p.setTargetAtTime(0, t + Math.max(a, dur), rel);
}
function noise(B, out, t, d, off = Math.random() * 1.5) { const s = B.ctx.createBufferSource(); s.buffer = B.white; s.loop = true; s.connect(out); s.start(t, off); s.stop(t + d); return s; }
// a vibrato on an oscillator's frequency, coming in after `delay`
function vibrato(c, o, f, t, end, rate, depth, delay) {
  const l = osc(c, 'sine', rate, t, end), g = amp(c, 0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(f * depth, t + delay + 0.3);
  l.connect(g).connect(o.frequency); done(l, g);
}

const V = {
  piano(B, out, t, n, dur, vel) {   // felt piano: soft, the hammer's brightness closing fast
    const c = B.ctx, f = mf(n), dec = 0.45 + 1.3 * lowness(n), end = t + Math.min(dur, dec * 4) + 0.8;
    const lp = lpf(c, Math.min(5200, f * (2.5 + 4 * vel)), 0.3), g = amp(c), g2 = amp(c, 0.16);
    lp.frequency.setTargetAtTime(Math.max(f * 1.6, 380), t + 0.004, 0.3);
    adsr(g, t, 0.006, 0.2 * vel, dec, 0, dur, 0.13);
    const o1 = osc(c, 'triangle', f, t, end), o2 = osc(c, 'sine', f * 2.003, t, end);
    o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(out); done(o1, lp, g, g2);
  },
  epiano(B, out, t, n, dur, vel) {  // electric piano: a sine with a decaying 1:1 FM bark
    const c = B.ctx, f = mf(n), end = t + dur + 0.9;
    const m = osc(c, 'sine', f, t, end), mi = amp(c, 0), o = osc(c, 'sine', f, t, end), g = amp(c);
    mi.gain.setValueAtTime(f * (0.9 + 1.4 * vel), t); mi.gain.setTargetAtTime(f * 0.15, t, 0.35);
    m.connect(mi).connect(o.frequency);
    adsr(g, t, 0.004, 0.17 * vel, 1.1 + 0.8 * lowness(n), 0.25, dur, 0.18);
    o.connect(g).connect(out); done(o, g, mi);
  },
  marimba(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + 1.3;
    const g = amp(c), g2 = amp(c);
    adsr(g, t, 0.002, 0.24 * vel, 0.16 + 0.3 * lowness(n), 0, 2, 0.1);
    g2.gain.setValueAtTime(0.06 * vel, t); g2.gain.setTargetAtTime(0, t, 0.05);
    const o1 = osc(c, 'sine', f, t, end), o2 = osc(c, 'sine', f * 3.93, t, t + 0.4);
    o1.connect(g).connect(out); o2.connect(g2).connect(out); done(o1, g); done(o2, g2);
  },
  vibes(B, out, t, n, dur, vel) {   // the channel adds the motor's tremolo
    const c = B.ctx, f = mf(n), end = t + dur + 1.6;
    const g = amp(c), g2 = amp(c);
    adsr(g, t, 0.003, 0.17 * vel, 1.4, 0, dur, 0.35);
    g2.gain.setValueAtTime(0.035 * vel, t); g2.gain.setTargetAtTime(0, t, 0.18);
    const o1 = osc(c, 'sine', f, t, end), o2 = osc(c, 'sine', f * 4, t, t + 0.9);
    o1.connect(g).connect(out); o2.connect(g2).connect(out); done(o1, g); done(o2, g2);
  },
  kalimba(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + 1.7;
    const g = amp(c), g2 = amp(c);
    adsr(g, t, 0.002, 0.2 * vel, 0.42, 0, 3, 0.1);
    g2.gain.setValueAtTime(0.05 * vel, t); g2.gain.setTargetAtTime(0, t, 0.03);
    const o1 = osc(c, 'sine', f * 1.012, t, end), o2 = osc(c, 'sine', f * 5.95, t, t + 0.25);
    o1.frequency.setTargetAtTime(f, t, 0.012);
    o1.connect(g).connect(out); o2.connect(g2).connect(out); done(o1, g); done(o2, g2);
  },
  musicbox(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + 2.4;
    const g = amp(c), g2 = amp(c);
    adsr(g, t, 0.001, 0.15 * vel, 0.55, 0, 4, 0.2);
    g2.gain.setValueAtTime(0.04 * vel, t); g2.gain.setTargetAtTime(0, t, 0.07);
    const o1 = osc(c, 'sine', f, t, end), o2 = osc(c, 'sine', f * 4.2, t, t + 0.4);
    o1.connect(g).connect(out); o2.connect(g2).connect(out); done(o1, g); done(o2, g2);
  },
  celesta(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + 2.6;
    const g = amp(c), g2 = amp(c);
    adsr(g, t, 0.002, 0.15 * vel, 0.8, 0, Math.max(dur, 0.3), 0.5);
    g2.gain.setValueAtTime(0.05 * vel, t); g2.gain.setTargetAtTime(0, t, 0.22);
    const o1 = osc(c, 'sine', f, t, end), o2 = osc(c, 'sine', f * 2, t, t + 1.2);
    o1.connect(g).connect(out); o2.connect(g2).connect(out); done(o1, g); done(o2, g2);
  },
  flute(B, out, t, n, dur, vel) {   // breathy: a sine and a little triangle, a delayed vibrato, a puff of noise
    const c = B.ctx, f = mf(n), end = t + dur + 0.5;
    const lp = lpf(c, 3000, 0.3), g = amp(c), gt = amp(c, 0.22);
    adsr(g, t, 0.07, 0.15 * vel, 0.25, 0.82, dur, 0.08);
    const o1 = osc(c, 'sine', f, t, end), o2 = osc(c, 'triangle', f, t, end);
    vibrato(c, o1, f, t, end, 5.1, 0.005, 0.22); vibrato(c, o2, f, t, end, 5.1, 0.005, 0.22);
    o1.connect(lp); o2.connect(gt).connect(lp); lp.connect(g).connect(out);
    const bp = lpf(c, Math.min(7000, f * 2.2), 1.2, 'bandpass'), gn = amp(c);
    adsr(gn, t, 0.03, 0.045 * vel, 0.12, 0.25, dur, 0.06);
    noise(B, bp, t, dur + 0.4); bp.connect(gn).connect(out);
    done(o1, lp, g, gt, bp, gn);
  },
  ocarina(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + dur + 0.4;
    const g = amp(c), g2 = amp(c, 0.07);
    adsr(g, t, 0.04, 0.17 * vel, 0.2, 0.85, dur, 0.07);
    const o1 = osc(c, 'sine', f, t, end), o2 = osc(c, 'sine', f * 2, t, end);
    vibrato(c, o1, f, t, end, 4.6, 0.004, 0.3);
    o1.connect(g).connect(out); o2.connect(g2).connect(g); done(o1, g, g2);
  },
  pizz(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + 0.9;
    const lp = lpf(c, f * 6, 1.1), g = amp(c), gt = amp(c, 0.5);
    lp.frequency.setTargetAtTime(f * 1.3, t, 0.06);
    adsr(g, t, 0.003, 0.2 * vel, 0.14 + 0.2 * lowness(n), 0, 1, 0.05);
    const o1 = osc(c, 'sawtooth', f, t, end), o2 = osc(c, 'triangle', f, t, end);
    o1.connect(lp); o2.connect(gt).connect(lp); lp.connect(g).connect(out); done(o1, lp, g, gt);
  },
  bass(B, out, t, n, dur, vel) {    // a round upright: a sine and a triangle, the pluck's little pitch drop
    const c = B.ctx, f = mf(n), end = t + dur + 0.5;
    const lp = lpf(c, 720, 0.7), g = amp(c), gt = amp(c, 0.4);
    adsr(g, t, 0.006, 0.36 * vel, 0.55, 0.15, dur, 0.06);
    const o1 = osc(c, 'sine', f * 1.03, t, end), o2 = osc(c, 'triangle', f * 1.03, t, end);
    o1.frequency.setTargetAtTime(f, t, 0.008); o2.frequency.setTargetAtTime(f, t, 0.008);
    o1.connect(lp); o2.connect(gt).connect(lp); lp.connect(g).connect(out); done(o1, lp, g, gt);
  },
  pad(B, out, t, n, dur, vel) {     // soft strings: two detuned saws, closed
    const c = B.ctx, f = mf(n), end = t + dur + 3;
    const lp = lpf(c, 1000, 0.3), g = amp(c);
    adsr(g, t, 0.55, 0.06 * vel, 0, 1, dur, 0.7);
    const o1 = osc(c, 'sawtooth', f * 1.004, t, end), o2 = osc(c, 'sawtooth', f * 0.996, t, end);
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(out); done(o1, lp, g);
  },
  cello(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + dur + 1.2;
    const lp = lpf(c, 1300, 0.6), g = amp(c);
    adsr(g, t, 0.2, 0.1 * vel, 0.4, 0.85, dur, 0.25);
    const o = osc(c, 'sawtooth', f, t, end); vibrato(c, o, f, t, end, 5, 0.004, 0.35);
    o.connect(lp).connect(g).connect(out); done(o, lp, g);
  },
  fiddle(B, out, t, n, dur, vel) {  // the channel adds the body (fixed filters)
    const c = B.ctx, f = mf(n), end = t + dur + 0.5;
    const g = amp(c);
    adsr(g, t, 0.035, 0.1 * vel, 0.2, 0.8, dur * 0.95, 0.07);
    const o = osc(c, 'sawtooth', f * 0.99, t, end);
    o.frequency.setTargetAtTime(f, t, 0.02);
    vibrato(c, o, f, t, end, 5.6, 0.006, 0.14);
    o.connect(g).connect(out); done(o, g);
  },
  chip(B, out, t, n, dur, vel) {    // a soft square, filtered: a nod to the store's games
    const c = B.ctx, f = mf(n), end = t + dur + 0.2;
    const lp = lpf(c, 2600, 0.4), g = amp(c);
    adsr(g, t, 0.004, 0.1 * vel, 0.12, 0.55, dur * 0.9, 0.03);
    const o = osc(c, 'square', f, t, end);
    if (dur > 0.3) vibrato(c, o, f, t, end, 6, 0.004, 0.18);
    o.connect(lp).connect(g).connect(out); done(o, lp, g);
  },
  chipbass(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + dur + 0.1;
    const g = amp(c);
    adsr(g, t, 0.003, 0.3 * vel, 0, 1, dur * 0.85, 0.02);
    const o = osc(c, 'triangle', f, t, end);
    o.connect(g).connect(out); done(o, g);
  },
  bell(B, out, t, n, dur, vel) {
    const c = B.ctx, f = mf(n), end = t + 3;
    const g = amp(c), g2 = amp(c), g3 = amp(c);
    adsr(g, t, 0.001, 0.13 * vel, 1.4, 0, 4, 0.4);
    g2.gain.setValueAtTime(0.05 * vel, t); g2.gain.setTargetAtTime(0, t, 0.4);
    g3.gain.setValueAtTime(0.025 * vel, t); g3.gain.setTargetAtTime(0, t, 0.12);
    const o1 = osc(c, 'sine', f, t, end), o2 = osc(c, 'sine', f * 2.76, t, t + 2), o3 = osc(c, 'sine', f * 5.4, t, t + 0.8);
    o1.connect(g).connect(out); o2.connect(g2).connect(out); o3.connect(g3).connect(out); done(o1, g); done(o2, g2); done(o3, g3);
  },
};
// plucked strings: Karplus-Strong, rendered once per context at a few pitches (half rate, under a second) and played at the
// note's pitch by rate; a banjo is bright and short, a mandolin brighter and shorter, a guitar soft and long
const KS = { banjo: { len: 0.95, damp: 0.4984, bright: true, bases: [55, 62, 69, 76] }, mandolin: { len: 0.7, damp: 0.4975, bright: true, bases: [64, 71, 78] }, guitar: { len: 1.5, damp: 0.4992, bright: false, bases: [43, 50, 57, 64] } };
const KS_BUFS = new WeakMap();
function ksBuf(c, kind, base) {
  let m = KS_BUFS.get(c); if (!m) KS_BUFS.set(c, m = new Map());
  const key = kind + base;
  if (m.has(key)) return m.get(key);
  const P = KS[kind], sr = Math.round(c.sampleRate / 2), N = Math.max(2, Math.round(sr / mf(base))), L = Math.floor(sr * P.len);
  const buf = c.createBuffer(1, L, sr), d = buf.getChannelData(0), ring = new Float32Array(N), rnd = mulberry32(hashStr(key));
  for (let i = 0; i < N; i++) ring[i] = rnd() * 2 - 1;
  if (!P.bright) for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N; i++) ring[i] = (ring[i] + ring[i - 1]) * 0.5;
  let idx = 0;
  for (let i = 0; i < L; i++) { const nx = (idx + 1) % N; d[i] = ring[idx] * 0.5; ring[idx] = (ring[idx] + ring[nx]) * P.damp; idx = nx; }
  const fade = Math.floor(sr * 0.06);
  for (let i = 0; i < fade; i++) d[L - 1 - i] *= i / fade;
  const r = { buf, f0: sr / N };
  m.set(key, r);
  return r;
}
for (const kind of Object.keys(KS)) {
  V[kind] = (B, out, t, n, dur, vel) => {
    const c = B.ctx, P = KS[kind], base = P.bases.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
    const { buf, f0 } = ksBuf(c, kind, base), rate = mf(n) / f0, s = c.createBufferSource(), g = amp(c, 0.5 * vel);
    s.buffer = buf; s.playbackRate.value = rate;
    const ring = buf.duration / rate, choke = dur < 0.2 ? dur + 0.03 : Math.min(ring, dur + 0.8);
    if (choke < ring) g.gain.setTargetAtTime(0, t + choke - 0.02, 0.015);
    s.connect(g).connect(out); s.start(t); s.stop(t + Math.min(ring, choke + 0.1)); done(s, g);
  };
}
// the kit (n is the piece's name)
const DRUM = {
  kick(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 92, t, t + 0.35), g = amp(c); o.frequency.exponentialRampToValueAtTime(46, t + 0.09); adsr(g, t, 0.002, 0.45 * vel, 0.08, 0, 0.3, 0.05); o.connect(g).connect(out); done(o, g); },
  snare(B, out, t, vel) { const c = B.ctx, bp = lpf(c, 2000, 0.7, 'bandpass'), g = amp(c), o = osc(c, 'triangle', 190, t, t + 0.2), go = amp(c); adsr(g, t, 0.002, 0.22 * vel, 0.05, 0, 0.3, 0.04); adsr(go, t, 0.002, 0.08 * vel, 0.035, 0, 0.2, 0.03); noise(B, bp, t, 0.3); bp.connect(g).connect(out); o.connect(go).connect(out); done(o, go, bp, g); },
  brush(B, out, t, vel) { const c = B.ctx, bp = lpf(c, 4200, 0.6, 'bandpass'), g = amp(c); adsr(g, t, 0.014, 0.15 * vel, 0.06, 0, 0.3, 0.05); const s = noise(B, bp, t, 0.35); bp.connect(g).connect(out); done(s, bp, g); },
  sweep(B, out, t, vel) { const c = B.ctx, bp = lpf(c, 3000, 0.5, 'bandpass'), g = amp(c); adsr(g, t, 0.12, 0.07 * vel, 0.14, 0, 0.5, 0.1); const s = noise(B, bp, t, 0.8); bp.connect(g).connect(out); done(s, bp, g); },
  shaker(B, out, t, vel) { const c = B.ctx, hp = lpf(c, 6500, 0.5, 'highpass'), g = amp(c); adsr(g, t, 0.007, 0.11 * vel, 0.028, 0, 0.12, 0.02); const s = noise(B, hp, t, 0.15); hp.connect(g).connect(out); done(s, hp, g); },
  hat(B, out, t, vel) { const c = B.ctx, hp = lpf(c, 8500, 0.5, 'highpass'), g = amp(c); adsr(g, t, 0.002, 0.09 * vel, 0.018, 0, 0.08, 0.01); const s = noise(B, hp, t, 0.1); hp.connect(g).connect(out); done(s, hp, g); },
  rim(B, out, t, vel) { const c = B.ctx, o = osc(c, 'triangle', 1700, t, t + 0.08), g = amp(c); adsr(g, t, 0.001, 0.1 * vel, 0.012, 0, 0.05, 0.01); o.connect(g).connect(out); done(o, g); },
  click(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 1250, t, t + 0.12), g = amp(c); adsr(g, t, 0.001, 0.16 * vel, 0.022, 0, 0.08, 0.01); o.connect(g).connect(out); done(o, g); },
  clicklo(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 830, t, t + 0.12), g = amp(c); adsr(g, t, 0.001, 0.16 * vel, 0.025, 0, 0.08, 0.01); o.connect(g).connect(out); done(o, g); },
  tick(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 2400, t, t + 0.06), g = amp(c); adsr(g, t, 0.001, 0.05 * vel, 0.007, 0, 0.04, 0.005); o.connect(g).connect(out); done(o, g); },
  tock(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 1800, t, t + 0.06), g = amp(c); adsr(g, t, 0.001, 0.045 * vel, 0.008, 0, 0.04, 0.005); o.connect(g).connect(out); done(o, g); },
  chipnoise(B, out, t, vel) { const c = B.ctx, bp = lpf(c, 1600, 0.5, 'bandpass'), g = amp(c); adsr(g, t, 0.002, 0.13 * vel, 0.04, 0, 0.15, 0.02); const s = noise(B, bp, t, 0.2); bp.connect(g).connect(out); done(s, bp, g); },
  // the war drum, the hand drum and the heartbeat (with samples they're the kick played lower or higher)
  boom(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 70, t, t + 0.7), g = amp(c); o.frequency.exponentialRampToValueAtTime(38, t + 0.2); adsr(g, t, 0.003, 0.5 * vel, 0.18, 0, 0.6, 0.1); o.connect(g).connect(out); done(o, g); },
  tom(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 150, t, t + 0.3), g = amp(c); o.frequency.exponentialRampToValueAtTime(95, t + 0.12); adsr(g, t, 0.002, 0.32 * vel, 0.07, 0, 0.25, 0.05); o.connect(g).connect(out); done(o, g); },
  heart(B, out, t, vel) { const c = B.ctx, o = osc(c, 'sine', 62, t, t + 0.35), g = amp(c), lp = lpf(c, 180, 0.5); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); adsr(g, t, 0.01, 0.4 * vel, 0.08, 0, 0.25, 0.06); o.connect(lp).connect(g).connect(out); done(o, lp, g); },
};
// per instrument: its level, its place left-right, a tremolo (vibes), a body (fiddle, banjo, guitar), the voicing range
export const INST = {
  piano: { vol: 0.9, pan: -0.12 }, epiano: { vol: 0.85, pan: 0.12 }, marimba: { vol: 0.95, pan: 0.22 }, vibes: { vol: 0.85, pan: -0.22, trem: [4.6, 0.28] },
  kalimba: { vol: 0.9, pan: 0.28 }, musicbox: { vol: 0.75, pan: 0.18 }, celesta: { vol: 0.8, pan: -0.15 }, flute: { vol: 0.7, pan: 0.06 },
  ocarina: { vol: 0.7, pan: -0.04 }, pizz: { vol: 0.7, pan: -0.28 }, bass: { vol: 0.45, pan: 0 }, pad: { vol: 0.65, pan: 0 }, cello: { vol: 0.75, pan: -0.1 },
  fiddle: { vol: 0.7, pan: 0.18, body: [['highpass', 230, 0.7], ['peaking', 480, 1, 3], ['peaking', 2600, 1.2, 4], ['lowpass', 4200, 0.6]] },
  chip: { vol: 0.6, pan: 0.1 }, chipbass: { vol: 0.55, pan: 0 }, bell: { vol: 0.7, pan: 0.05 },
  banjo: { vol: 0.62, pan: 0.32, body: [['peaking', 2400, 0.8, 3], ['highpass', 140, 0.7]] }, mandolin: { vol: 0.55, pan: -0.34, body: [['peaking', 3000, 0.9, 2]] },
  guitar: { vol: 0.7, pan: -0.16, body: [['lowpass', 2300, 0.5]] }, drums: { vol: 0.8, pan: 0 },
  // instruments that came with the samples: the synth plays them as SYNTH_FOR says if their samples are missing
  strings: { vol: 0.5, pan: 0.05 }, glock: { vol: 0.5, pan: 0.2 }, clarinet: { vol: 0.65, pan: -0.08 }, nylon: { vol: 0.8, pan: -0.18 }, harp: { vol: 0.65, pan: 0.25 },
};
// played from samples: how long a struck or plucked note sounds on past its value before it is damped (s; Infinity rings out; the
// held instruments stop with their value), and the real instrument needs neither the synth's body filters nor its tremolo
const RING = { piano: 0.3, epiano: 0.3, vibes: 0.9, marimba: Infinity, kalimba: Infinity, musicbox: Infinity, celesta: Infinity, glock: Infinity, bell: Infinity,
  banjo: Infinity, mandolin: 0.04, guitar: Infinity, nylon: Infinity, harp: Infinity, bass: 0.1, pizz: Infinity };
// the sampled instrument a song's role name plays (older names kept so a song can still say 'pad' or 'epiano')
export const SAMPLE_FOR = { pad: 'strings', epiano: 'piano', bell: 'glock', chip: 'marimba', chipbass: 'bass' };
// an instrument with no synthesised voice of its own falls back to the nearest one
export const SYNTH_FOR = { strings: 'pad', glock: 'bell', clarinet: 'ocarina', nylon: 'guitar', harp: 'guitar' };
export const INSTRUMENTS = Object.keys(V).concat(Object.keys(SYNTH_FOR), ['drums']);
/** every instrument a song can ask for (its parts, sections, form, the loop's variations, the hour or storm variants, the sting),
 *  as sample names: what music.js loads before the song starts */
export function instrumentsOf(song) {
  const set = new Set(), add = o => { if (o) for (const v of Object.values(o)) if (typeof v === 'string') set.add(SAMPLE_FOR[v] || v); };
  add(song.inst);
  for (const s of Object.values(song.sections)) add(s.inst);
  for (const e of song.form) if (typeof e === 'object') add(e.inst);
  for (const v of song.loopVary || []) add(v.inst);
  for (const v of Object.values(song.vars || {})) add(v.inst);
  for (const l of song.sting?.lines || []) set.add(SAMPLE_FOR[l.inst] || l.inst);
  if ([song.parts, ...Object.values(song.sections).map(s => s.parts), ...song.form.map(e => e.parts)].some(p => p && p.drums)) set.add('drums');
  return [...set].sort();
}

// ------------------------------------------------------------------ the lo-fi stage
// sat: the tape's drive (0 clean); wow / flutter: the pitch's wobble (a share of the pitch, about 0.5 Hz and 5.5 Hz); lp: the high
// cut (Hz); hiss / crackle: their level against the band (dB); lag: how far behind the beat the tune sits (s); hum: the timing's
// spread (s); vel: the touch's spread; room: the send to the small room. A song's `lofi` overrides any of these; the fishing song and
// Kevin's boat lean on it hardest, the rest are warm and lightly worn.
export const LOFI = { sat: 0.4, wow: 0.0014, flutter: 0.0004, lp: 9000, hiss: -58, crackle: -54, lag: 0.008, hum: 0.012, vel: 0.12 };

// ------------------------------------------------------------------ patterns
// comping: [pos, dur, vel] in eighths; a pair of lists alternates by bar
const COMP = {
  hold: 'hold',
  charleston: [[0, 2, 0.8], [3, 1.5, 0.62]],
  bounce: [[1, 0.8, 0.5], [3, 0.8, 0.6], [5, 0.8, 0.5], [7, 0.8, 0.58]],
  twofour: [[2, 1.4, 0.6], [6, 1.4, 0.6]],
  half: [[0, 3.8, 0.65], [4, 3.8, 0.55]],
  bossa: [[[0, 1.5, 0.66], [3, 1, 0.56], [6, 1.2, 0.58]], [[2, 1, 0.56], [4, 1.5, 0.62], [7, 0.9, 0.5]]],
  waltz: [[2, 1.5, 0.5], [4, 1.5, 0.45]],
  sparse: [[0, 7, 0.5]],
  offbeat: [[1, 0.5, 0.45], [3, 0.5, 0.5], [5, 0.5, 0.45], [7, 0.5, 0.5]],
  stabs: [[0, 1, 0.7], [2.5, 0.8, 0.55], [5, 1, 0.6]],
  jig: [[0, 1.4, 0.7], [2, 0.8, 0.42], [3, 1.4, 0.6], [5, 0.8, 0.42]],   // a 6/8 strum, the tavern's lute
};
// arpeggios: indexes into the voicing (sorted, plus its lowest note an octave up)
const ARP = {
  arp8: { step: 1, idx: [0, 1, 2, 3, 4, 3, 2, 1] },
  up8: { step: 1, idx: [0, 1, 2, 3, 4, 2, 3, 1] },
  slow: { step: 2, idx: [0, 2, 1, 3] },
  arp16: { step: 0.5, idx: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1] },
  waltz: { step: 1, idx: [0, 2, 3, 4, 3, 2] },
  rain: { step: 1, idx: [4, 2, 3, 1, 4, 3, 2, 0] },
  ostinato: { step: 1, idx: [0, 0, 2, 0, 0, 2, 1, 2] },   // the fight's driving strings
};
// drum kits: a string of steps per piece (16 a bar in 4/4, 12 in 3/4): X accent, x hit, o ghost; fill = what the last bar of a
// section plays in its second half
const KIT = {
  pop: { shaker: 'x.o.x.o.x.o.x.o.', rim: '....x.......x...', kick: 'x.......x.......', fill: { snare: 'o.o.x.xX', shaker: 'x.o.x.o.' } },
  shaker: { shaker: 'x.o.x.o.x.o.x.o.', fill: { shaker: 'x.o.xox.' } },
  brush: { brush: 'x...x...x...x...', snare: '....o.......o...', fill: { brush: 'x.x.x.xX', snare: '....o.o.' } },
  swing: { shaker: 'x...x.x.x...x.x.', brush: '....x.......x...', kick: 'o.......o.......', fill: { snare: 'o..o.oxX', shaker: 'x...x.x.' } },
  bossa: { rim: 'x..x..x...x..x..', shaker: 'xoxoxoxoxoxoxoxo', kick: 'x..x....x..x....', fill: { rim: 'x.x.x.x.', shaker: 'xoxoxoxo' } },
  clock: { tick: 'x...........', tock: '....x...x...', fill: { tock: 'x...x.x.' } },
  waltz: { brush: 'x...o...o...', kick: 'o...........', fill: { brush: 'x.x.x.x.' } },
  sparse: { shaker: '........x.......', fill: { shaker: 'x...x.x.' } },
  chip: { hat: 'x.x.x.x.x.x.x.x.', kick: 'x.......x.......', chipnoise: '....x.......x...', fill: { chipnoise: 'x.x.xxxx', hat: 'x.x.x.x.' } },
  lounge: { brush: 'x...x...x...x...', hat: '....x.......x...', fill: { snare: '..o..oxX', brush: 'x...x...' } },
  water: { shaker: '..o...o...o...o.', fill: { shaker: '..o.o.o.' } },
  // a lazy lo-fi kit: a soft kick, brushes on two and four, a shaker ghosting in between
  lofi: { kick: 'x.........o.....', brush: '....x.......x...', shaker: '..o...o.o.o...o.', fill: { brush: '....x.xo', snare: '......o.' } },
  woods: { click: '....x.......x...', clicklo: 'x.......x.o.....', shaker: '..o...o...o...o.', fill: { click: 'x.x.xxx.', clicklo: 'x.......' } },
  // a hand drum in 6/8, the war drums, a heartbeat in the dark, a walking pace, a game's ticking clock
  jig: { tom: 'x...o.x...o.', shaker: '..o.....o...', fill: { tom: 'x.x.xX' } },
  battle: { boom: 'X......x..x.....', tom: '..o...o...o.o.o.', snare: '....x.......x..o', fill: { tom: 'x.x.xxxx', snare: 'o.o.xxXX' } },
  heart: { heart: 'x.o.............' },
  road: { shaker: '..o...o...o...o.', kick: 'o.......o.......', fill: { shaker: '..o.o.oo' } },
  timer: { tick: 'x...x...x...x...', tock: '..o...o...o...o.', kick: 'o.......o.......', fill: { click: 'x.x.x.xx' } },
};
const VEL = { X: 1, x: 0.72, o: 0.38 };

// ------------------------------------------------------------------ voicing
const PRIO = [4, 3, 11, 10, 9, 14, 13, 21, 18, 17, 2, 5, 7, 6, 8, 0];   // which chord tones a hand keeps first: 3rd, 7th, 6th, 9th...
function tones(ch, size, rootless) {
  let ivs = ch.ivs.slice();
  if (rootless && ivs.length >= 4) ivs = ivs.filter(i => i !== 0);
  const rank = i => { const k = PRIO.indexOf(i % 24); return k < 0 ? 99 : k; };
  ivs.sort((a, b) => rank(a) - rank(b));
  return [...new Set(ivs.slice(0, size).map(i => (ch.root + i) % 12))];
}
function voicing(ch, prev, lo, hi, size = 4, rootless = true) {
  const pcs = tones(ch, size, rootless).sort((a, b) => a - b);
  let best = null, bestS = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const v = []; let n = lo + ((pcs[r] - lo) % 12 + 12) % 12;
    for (let k = 0; k < pcs.length; k++) { const pc = pcs[(r + k) % pcs.length]; while (n % 12 !== pc) n++; v.push(n); n++; }
    for (const shift of [0, -12, 12]) {
      const w = v.map(x => x + shift);
      if (w[0] < lo - 2 || w[w.length - 1] > hi + 2) continue;
      const s = prev && prev.length === w.length ? w.reduce((a, x, i) => a + Math.abs(x - prev[i]), 0) : Math.abs((w[0] + w[w.length - 1]) / 2 - (lo + hi) / 2) * 2;
      if (s < bestS) { bestS = s; best = w; }
    }
  }
  return best || pcs.map(pc => lo + ((pc - lo) % 12 + 12) % 12).sort((a, b) => a - b);
}
const inRange = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;

// ------------------------------------------------------------------ songs, compiled once
const COMPILED = new WeakMap();
export function compile(song) {
  let C = COMPILED.get(song);
  if (C) return C;
  const E = (song.meter || 4) * 2;
  C = { E, sec: {} };
  for (const [id, s] of Object.entries(song.sections)) {
    const chords = parseChords(s.chords, E), bars = chords.length;
    const line = l => (l && !/^[+-]\d+$/.test(l) ? parseLine(l, E) : l || null);
    C.sec[id] = { id, chords, bars, lead: line(s.lead), counter: line(s.counter) };
    for (const k of ['lead', 'counter']) { const L = C.sec[id][k]; if (L && L.len !== undefined && Math.abs(L.len - bars * E) > 1e-6) throw new Error(`${song.id} ${id} ${k}: ${L.len} eighths, the section has ${bars * E}`); }
  }
  for (const e of song.form) { const id = typeof e === 'string' ? e : e.s; if (!C.sec[id]) throw new Error(`${song.id}: the form names ${id}`); }
  COMPILED.set(song, C);
  return C;
}
/** what a song is: for the audition page, the report and the tests */
export function describe(song) {
  const C = compile(song), insts = new Set();
  let secs = 0;
  const labels = [];
  song.form.forEach(e => {
    const S = resolve(song, C, e, 0, {});
    secs += S.bars * C.E * 30 / (song.bpm * S.bpmK);
    labels.push(S.label);
    for (const [role, p] of Object.entries(S.parts)) if (p && S.inst[role]) insts.add(S.inst[role]);
    if (S.lead) insts.add(S.inst.lead); if (S.counter) insts.add(S.inst.counter);
    if (S.parts.drums) insts.add('drums');
  });
  return { id: song.id, title: song.title, mood: song.mood, place: song.place, bpm: song.bpm, key: song.key, meter: song.meter || 4, swing: song.swing || 0,
    loop: !!song.loop, form: labels, sections: [...new Set(song.form.map(e => (typeof e === 'string' ? e : e.s)))], seconds: Math.round(secs), instruments: [...insts] };
}
/** the melody against the chords: the share of notes on the strong beats (and the long ones) that are chord tones or the usual
 *  tensions (9ths, 11ths on minor, 13ths on dominants, #11 on major 7ths), and the misses */
export function harmonyCheck(song) {
  const C = compile(song), miss = [];
  let n = 0, ok = 0;
  for (const s of Object.values(C.sec)) for (const k of ['lead', 'counter']) {
    const L = s[k]; if (!L || !L.length) continue;
    for (const nt of L) {
      const b = Math.floor(nt.pos / C.E), p = nt.pos - b * C.E, strong = p % (C.E === 6 ? 6 : 4) === 0 || nt.dur >= 3;
      if (!strong || !s.chords[b]) continue;
      const seg = s.chords[b].filter(x => x.pos <= p + 1e-6).pop(), ch = seg.ch, iv = ((nt.n - ch.root) % 12 + 12) % 12;
      const set = new Set(ch.ivs.map(i => i % 12));
      set.add(2); if (ch.minor) set.add(5); if (ch.ivs.includes(10) && !ch.minor) set.add(9); if (ch.ivs.includes(11)) { set.add(6); set.add(9); } if (ch.ivs.includes(5)) set.add(5);
      n++; if (set.has(iv)) ok++; else miss.push(`${s.id} bar ${b + 1}: ${nt.n} on ${ch.sym}`);
    }
  }
  return { n, ok, share: n ? ok / n : 1, miss };
}

// a form entry, the loop's variation and the time of day's (or the storm's) variant, merged into what a section plays now
function resolve(song, C, entry, loopN, Vr) {
  const e = typeof entry === 'string' ? { s: entry } : entry, base = song.sections[e.s], cs = C.sec[e.s];
  const lv = loopN > 0 && song.loopVary ? song.loopVary[(loopN - 1) % song.loopVary.length] || {} : {};
  const inst = { ...song.inst, ...base.inst, ...e.inst, ...lv.inst, ...Vr.inst };
  const parts = { ...song.parts, ...base.parts, ...e.parts, ...lv.parts, ...Vr.parts };
  for (const r of [...(lv.drop || []), ...(Vr.drop || [])]) parts[r] = null;
  const pick = k => (e[k] !== undefined ? (typeof e[k] === 'string' && C.sec[e[k]] ? C.sec[e[k]][k] : e[k]) : cs[k]);
  return {
    id: e.s, label: e.label || base.label || e.s, chords: cs.chords, bars: cs.bars, lead: e.mute?.includes('lead') || e.air ? null : pick('lead'), counter: e.air ? null : pick('counter'),
    air: !!e.air, thin: { ...song.thin, ...base.thin, ...e.thin, ...lv.thin, ...Vr.thin },
    parts, inst, transpose: (base.transpose || 0) + (e.transpose || 0) + (lv.transpose || 0),
    oct: { ...song.oct, ...base.oct, ...e.oct, ...lv.oct, ...Vr.oct }, vol: (base.vol ?? 1) * (e.vol ?? 1), mix: { ...song.mix, ...e.mix, ...lv.mix, ...Vr.mix },
    bpmK: (base.bpm ?? 1) * (e.bpm ?? 1) * (Vr.bpm ?? 1), fill: e.fill ?? base.fill ?? true,
  };
}
const tr = (ch, T) => (T ? { ...ch, root: (ch.root + T + 120) % 12, bass: (ch.bass + T + 120) % 12 } : ch);

// ------------------------------------------------------------------ one bar of events
function barEvents(song, S, b, nextCh, rnd, st) {
  const E = (song.meter || 4) * 2, ev = [], T = S.transpose, P = S.parts, I = S.inst;
  const segs = S.chords[b].map(x => ({ ...x, ch: tr(x.ch, T) }));
  const chAt = p => segs.filter(x => x.pos <= p + 1e-6).pop().ch;
  const push = (role, pos, dur, n, vel) => ev.push({ role, inst: I[role], pos, dur, n, vel });
  const oct = r => 12 * (S.oct[r] || 0);
  // the pad (held chords)
  if (P.pad && I.pad) for (const sg of segs) { const v = st.pad = voicing(sg.ch, st.pad, 50, 69, 3, false); for (const n of v) push('pad', sg.pos, sg.dur, n + oct('pad'), 0.7); }
  // the comping hand
  if (P.keys && I.keys) {
    let hits = COMP[P.keys] || COMP.charleston;
    if (hits === 'hold') hits = segs.map(sg => [sg.pos, sg.dur * 0.97, 0.55]);
    else if (Array.isArray(hits[0][0])) hits = hits[st.bars % 2];
    hits = hits.filter(h => h[0] < E).slice();
    for (const sg of segs) if (sg.pos > 0 && !hits.some(h => h[0] >= sg.pos && h[0] < sg.pos + 2)) hits.push([sg.pos, 1.5, 0.55]);
    for (const [pos, dur, vel] of hits) {
      const v = st.keys = voicing(chAt(pos), st.keys, 52, 72, I.keys === 'epiano' || I.keys === 'piano' ? 4 : 3);
      v.forEach((n, i) => push('keys', pos + i * 0.03, dur, n + oct('keys'), vel * (i === v.length - 1 ? 1 : 0.85)));
    }
  }
  // the arpeggio
  if (P.arp && I.arp) {
    const A = ARP[P.arp] || ARP.arp8;
    for (let k = 0; k * A.step < E; k++) {
      const pos = k * A.step, v = st.arp = voicing(chAt(pos), st.arp, 60, 79, 4, false), notes = v.concat([v[0] + 12]);
      push('arp', pos, A.step * 1.6, notes[A.idx[k % A.idx.length] % notes.length] + oct('arp'), (pos % 2 === 0 ? 0.62 : 0.5) * (0.9 + rnd() * 0.2));
    }
  }
  // the bass
  if (P.bass && I.bass) {
    const lo = I.bass === 'chipbass' ? 48 : 36, R = ch => inRange(ch.bass, lo), b5 = r => (r + 7 <= lo + 14 ? r + 7 : r - 5);
    switch (P.bass) {
      case 'two': for (const sg of segs) { const r = R(sg.ch); push('bass', sg.pos, Math.min(sg.dur, 4) * 0.9, r, 0.85); if (sg.dur >= E) push('bass', sg.pos + E / 2, E / 2 * 0.9, b5(r), 0.7); } break;
      case 'root': for (const sg of segs) push('bass', sg.pos, sg.dur * 0.95, R(sg.ch), 0.85); break;
      case 'pedal': push('bass', 0, E * 0.98, R(segs[0].ch), 0.75); break;
      case 'waltz': { const r = R(segs[0].ch); push('bass', 0, 3, st.bars % 2 ? b5(r) : r, 0.8); if (segs[1]) push('bass', segs[1].pos, 2, R(segs[1].ch), 0.7); break; }
      case 'bossa': for (let h = 0; h < E; h += 4) { const ch = chAt(h), r = R(ch); push('bass', h, 2.6, r, 0.8); push('bass', h + 3, 0.9, b5(r) - (b5(r) > r ? 12 : 0), 0.55); } break;
      case 'chip': for (let k = 0; k < E; k++) { const r = R(chAt(k)); push('bass', k, 0.9, k % 2 ? r + 12 : r, 0.7); } break;
      case 'jig': for (const sg of segs) { const r = R(sg.ch); push('bass', sg.pos, 2.6, r, 0.85); if (sg.dur >= E) push('bass', sg.pos + E / 2, 2.6, b5(r), 0.68); } break;   // (6/8: the root, then the fifth)
      case 'drive': for (let k = 0; k < E; k++) push('bass', k, 0.8, R(chAt(k)), k % 2 ? 0.62 : 0.85); break;   // (the fight: eighths on the root)
      case 'bluegrass': {
        const r = R(segs[0].ch), nr = R(nextCh), last = segs[segs.length - 1];
        push('bass', 0, 1.8, r, 0.9);
        if (segs.length > 1) push('bass', last.pos, 1.8, R(last.ch), 0.85);
        else if ((nextCh.root !== segs[0].ch.root) && rnd() < 0.75) { push('bass', 4, 1.8, nr - 3, 0.72); push('bass', 6, 1.8, nr - 1, 0.75); }
        else push('bass', 4, 1.8, b5(r) - 12 >= lo - 5 ? b5(r) - 12 : b5(r), 0.78);
        break;
      }
      default: { // 'walk': a note a beat, chord tones, a step to the next root
        for (let k = 0; k < E / 2; k++) {
          const pos = k * 2, ch = chAt(pos), r = R(ch), lastBeat = k === E / 2 - 1 || segs.some(x => x.pos === pos + 2);
          const isStart = segs.some(x => x.pos === pos);
          let n;
          if (isStart) n = r;
          else if (lastBeat) { const nx = k === E / 2 - 1 ? nextCh : chAt(pos + 2), tn = R(nx); n = rnd() < 0.65 ? tn - 1 : tn + 1; }
          else { const third = ch.ivs.includes(3) ? 3 : ch.ivs.includes(4) ? 4 : 5, opts = [r + third, r + 7, r + (ch.ivs.includes(9) ? 9 : ch.ivs.includes(10) ? 10 : 12)]; n = opts[(k + (rnd() < 0.5 ? 0 : 1)) % opts.length]; }
          if (n > lo + 16) n -= 12;
          push('bass', pos, 1.8, n, isStart ? 0.9 : 0.75);
        }
      }
    }
  }
  // the drums
  if (P.drums) {
    const K = KIT[P.drums] || KIT.shaker, steps = E * 2, fill = S.fill && b === S.bars - 1 && K.fill;
    for (const [piece, grid] of Object.entries(K)) {
      if (piece === 'fill') continue;
      for (let i = 0; i < steps; i++) { if (fill && i >= steps / 2) break; const ch = grid[i % grid.length]; if (VEL[ch]) ev.push({ role: 'drums', inst: 'drums', kit: piece, pos: i / 2, dur: 0.5, vel: VEL[ch] }); }
    }
    if (fill) for (const [piece, grid] of Object.entries(K.fill)) for (let i = 0; i < grid.length; i++) { const ch = grid[i]; if (VEL[ch]) ev.push({ role: 'drums', inst: 'drums', kit: piece, pos: steps / 4 + i / 2, dur: 0.5, vel: VEL[ch] }); }
  }
  // the bluegrass band: a banjo rolling, a mandolin chopping on 2 and 4, the guitar's boom-chick
  if (P.roll && I.roll) {
    const pat = st.bars % 2 ? ['lo', 'hi', 'mid', 'dr', 'lo', 'hi', 'mid', 'dr'] : ['lo', 'mid', 'dr', 'lo', 'hi', 'dr', 'mid', 'hi'];
    for (let k = 0; k < E; k++) {
      const ch = chAt(k), r = ch.root, third = (r + (ch.minor ? 3 : 4)) % 12, fifth = (r + 7) % 12;
      const lo = inRange(r, 55), mid = inRange(third, 59), hi = inRange(rnd() < 0.5 ? r : fifth, 67);
      const dr = ch.root === 2 ? hi : 67;   // the fifth string's G rings, except over D
      const n = { lo, mid, hi, dr }[pat[k]];
      push('roll', k, 1.6, n + oct('roll'), k % 2 ? 0.5 : 0.66);
    }
  }
  if (P.chop && I.chop) for (const pos of [2, 6]) { if (pos >= E) continue; const v = st.chop = voicing(chAt(pos), st.chop, 64, 79, 3, false); v.forEach((n, i) => push('chop', pos + i * 0.02, 0.28, n, 0.7)); }
  if (P.strum && I.strum) {
    const r0 = inRange(segs[0].ch.bass, 43), r1 = inRange(chAt(4).bass, 43);
    push('strum', 0, 1.8, r0, 0.8); push('strum', 4, 1.8, segs.length > 1 ? r1 : (r0 + 7 > 55 ? r0 - 5 : r0 + 7), 0.72);
    for (const pos of [2, 6]) { const v = st.strum = voicing(chAt(pos), st.strum, 52, 67, 3, false); v.forEach((n, i) => push('strum', pos + i * 0.06, 1.2, n, 0.55)); }
  }
  // drops: now and then a high chord tone, like water dripping (fishing, the lake)
  if (P.drops && I.drops) for (let k = 0; k < 2; k++) if (rnd() < 0.45) { const pos = Math.floor(rnd() * E), ch = chAt(pos), iv = ch.ivs[Math.floor(rnd() * ch.ivs.length)]; push('drops', pos, 3, inRange((ch.root + iv) % 12, 84), 0.32 + rnd() * 0.15); }
  // the melody and the counter-line (a line of their own, or the melody doubled '+12' / '-12')
  const lineIn = (L, role, shift = 0) => { if (!L || !I[role]) return; for (const nt of L) if (nt.pos >= b * E - 1e-6 && nt.pos < (b + 1) * E - 1e-6) {
    const n = nt.n + T + oct(role) + shift, pos = nt.pos - b * E;
    if (I[role] === 'mandolin' && nt.dur >= 2) { for (let q = 0; q < nt.dur - 0.25; q += 0.5) push(role, pos + q, 0.45, n, nt.vel * (q ? 0.55 : 0.85)); }   // tremolo picking
    else push(role, pos, nt.dur, n, nt.vel);
  } };
  lineIn(S.lead, 'lead');
  if (typeof S.counter === 'string') lineIn(S.lead, 'counter', +S.counter); else lineIn(S.counter, 'counter');
  return ev;
}

// ------------------------------------------------------------------ the shared reverb (a small warm room, one per context)
const VERBS = new WeakMap();
export function musicVerb(audio) {
  const ctx = audio.ctx;
  let v = VERBS.get(ctx);
  if (v) return v;
  // a small, dark room (1.9 s would be too big for lo-fi)
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.3), ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { const k = i / len, a = 0.5 + 0.45 * k; lp += (Math.random() * 2 - 1 - lp) * (1 - a); d[i] = lp * Math.pow(1 - k, 2.8) * (i < sr * 0.012 ? i / (sr * 0.012) : 1); }
  }
  const input = ctx.createGain(), conv = ctx.createConvolver();
  input.gain.value = 0.9; conv.buffer = ir;
  input.connect(conv).connect(audio.music);
  v = { input, conv };
  VERBS.set(ctx, v);
  return v;
}

// the tape: a soft tanh curve (one per context and drive)
const CURVES = new WeakMap();
function tapeCurve(ctx, k) {
  let m = CURVES.get(ctx); if (!m) CURVES.set(ctx, m = new Map());
  const key = k.toFixed(2);
  if (!m.has(key)) { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const u = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * u) / k; } m.set(key, c); }
  return m.get(key);
}
// the record's crackle: a few seconds of sparse dust and the odd pop, looped (one per context)
const CRACKLE = new WeakMap();
function crackleBuf(ctx) {
  if (CRACKLE.has(ctx)) return CRACKLE.get(ctx);
  const sr = ctx.sampleRate, len = Math.floor(sr * 5.3), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), r = mulberry32(1729);
  for (let i = 0; i < len; i++) {
    if (r() < 7 / sr) { const a = (r() < 0.12 ? 1 : 0.15 + r() * 0.35) * (r() < 0.5 ? -1 : 1), L = Math.floor(sr * (0.0002 + r() * 0.0006)); for (let k = 0; k < L * 6 && i + k < len; k++) d[i + k] += a * Math.exp(-k / L) * (k % 2 ? -0.6 : 1); }
  }
  CRACKLE.set(ctx, b);
  return b;
}

// the layer each role plays into by default (for adaptive music at the D&D table)
export const LAYER_OF = { lead: 'lead', counter: 'lead', drums: 'rhythm', roll: 'rhythm', chop: 'rhythm', drops: 'rhythm' };

/** one note outside a band (game-night-music's stingers): its sample, else its synthesised voice, at the instrument's level */
export function playNote(audio, bank, out, inst, t, n, dur, vel) {
  const s = SAMPLE_FOR[inst] || inst, D = INST[inst] || INST[SYNTH_FOR[inst]] || {}, v = vel * (D.vol ?? 1);
  if (bank && bank.play(s, out, t, n, dur, v, { ring: dur + (RING[inst] ?? 0) })) return 'sample';
  const f = V[inst] || V[SYNTH_FOR[inst]];
  if (f) { f({ ctx: audio.ctx, white: audio.white }, out, t, n, dur, v); return 'synth'; }
  return null;
}
/** one drum outside a band (the stingers' hits and rolls) */
export function playDrum(audio, bank, out, piece, t, vel) {
  if (bank && bank.drum(piece, out, t, vel * INST.drums.vol)) return 'sample';
  const f = DRUM[piece]; if (f) { f({ ctx: audio.ctx, white: audio.white }, out, t, vel * INST.drums.vol); return 'synth'; }
  return null;
}

// ------------------------------------------------------------------ the band
export function createBand(audio, song, opt = {}) {
  const ctx = audio.ctx, C = compile(song), E = C.E;
  const Vr = (opt.variant && song.vars && song.vars[opt.variant]) || {};
  const rnd = mulberry32(opt.seed ?? (hashStr(song.id) ^ Math.floor(Math.random() * 1e9)));
  const B = { ctx, white: audio.white };
  const bank = opt.bank || null;
  const LF = { ...LOFI, ...song.lofi, ...Vr.lofi };
  const out = opt.out || audio.music;
  const lp0 = Math.min(Vr.lp || 16000, song.lp || 16000, LF.lp || 16000);
  // instruments -> mix -> the tape (saturation) -> the song's level -> the fade -> wow and flutter -> the high cut (the door) -> out,
  // and a send to the small room; the hiss and the crackle come in at the song's level, so they fade and duck with it
  // (the song's own level, its db, comes before the tape, so every song reaches the tape, and sits over its hiss, alike)
  const mix = amp(ctx, dbGain((song.db || 0) + TAPE_IN)), tape = ctx.createWaveShaper();
  tape.curve = tapeCurve(ctx, 1 + 3 * (LF.sat || 0));
  const pre = amp(ctx, dbGain(BASE_DB - TAPE_IN + (opt.db || 0) + (Vr.db || 0)));
  const fade = amp(ctx, 0), muffle = lpf(ctx, lp0, 0.5), send = amp(ctx, LF.room ?? song.verb ?? 0.25);
  const wow = ctx.createDelay(0.1); wow.delayTime.value = 0.02;
  mix.connect(tape).connect(pre).connect(fade).connect(wow).connect(muffle).connect(out);
  muffle.connect(send).connect(opt.send || musicVerb(audio).input);   // opt.send: game-night-music's scene reverb instead of the small room
  // layers (adaptive music): every role plays into its layer, and a layer's level can be faded (setLayer);
  // a song's `layers` names its roles per layer, else the tune is 'lead', the beat and the patterns 'rhythm', the rest 'base'
  const layerOf = role => (song.layers && Object.keys(song.layers).find(k => song.layers[k].includes(role))) || LAYER_OF[role] || 'base';
  const layerG = {}, layerWant = { ...opt.layers };
  const layerNode = name => layerG[name] || (layerG[name] = (() => { const g = amp(ctx, layerWant[name] ?? 1); g.connect(mix); return g; })());
  const stingBus = amp(ctx, 1); stingBus.connect(muffle);   // (the sting stays out of the dip)
  const lfos = [];
  for (const [f, depth] of [[0.42 + rnd() * 0.25, LF.wow], [5.2 + rnd() * 0.8, LF.flutter]]) {
    if (!depth) continue;
    const l = ctx.createOscillator(), g = amp(ctx, depth / (2 * Math.PI * f));   // (a delay swinging by A at f bends the pitch by 2 pi f A)
    l.frequency.value = f; l.connect(g).connect(wow.delayTime); lfos.push(l);
  }
  const noiseSrc = [];
  function noiseOn(when) {
    if (LF.hiss > -90 && audio.white) {
      const s = ctx.createBufferSource(); s.buffer = audio.white; s.loop = true;
      const hp = lpf(ctx, 1800, 0.5, 'highpass'), g = amp(ctx, dbGain(LF.hiss + TAPE_IN));
      s.connect(hp).connect(g).connect(pre); s.start(when, Math.random() * 1.5); noiseSrc.push(s);
    }
    if (LF.crackle > -90) {
      const s = ctx.createBufferSource(); s.buffer = crackleBuf(ctx); s.loop = true;
      const bp = lpf(ctx, 2600, 0.6, 'bandpass'), g = amp(ctx, dbGain(LF.crackle + TAPE_IN));
      s.connect(bp).connect(g).connect(pre); s.start(when, Math.random() * 5); noiseSrc.push(s);
    }
  }
  const sampleOf = inst => SAMPLE_FOR[inst] || inst;
  const sampled = inst => !!(bank && bank.has(inst === 'drums' ? 'drums' : sampleOf(inst)));
  const chans = {};
  function chan(inst, role, bus = mix) {
    const key = inst + ':' + role + (bus === mix ? '' : ':s');
    if (chans[key]) return chans[key];
    const D = INST[inst] || INST[SYNTH_FOR[inst]] || {}, real = sampled(inst);
    // (played from samples, a role's balance in the song: its trim, dB, measured part by part by tools/music-lofi-balance.mjs)
    let head = amp(ctx, (D.vol ?? 1) * (real && song.trim ? dbGain(song.trim[role] || 0) : 1)), tail = head;
    const trem = D.trem && (real ? [D.trem[0], D.trem[1] * 0.45] : D.trem);   // (the real vibes: a gentler motor)
    if (trem) { const t = amp(ctx, 1), l = ctx.createOscillator(), lg = amp(ctx, trem[1]); l.frequency.value = trem[0]; l.connect(lg).connect(t.gain); l.start(); tail.connect(t); tail = t; chans['_lfo' + key] = l; }
    if (!real) for (const [type, f, q, g] of D.body || []) { const b = lpf(ctx, f, q, type); if (g) b.gain.value = g; tail.connect(b); tail = b; }
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = D.pan || 0; tail.connect(p); tail = p; }
    tail.connect(bus === mix ? layerNode(layerOf(role)) : bus);
    return (chans[key] = head);
  }
  const st = { bars: 0, keys: null, pad: null, arp: null, chop: null, strum: null };
  const dynPh = rnd() * 6.283, dynLen = 6 + rnd() * 4;   // (the dynamics breathe: a slow swell over six to ten bars)
  let nSampled = 0, nSynth = 0;
  const THIN = new Set(['keys', 'arp', 'drums', 'roll', 'chop', 'strum', 'drops', 'pad']);
  let fi = Math.max(0, Math.min(song.form.length - 1, opt.start || 0)), bi = 0, loopN = 0, barT = 0, ended = false, endT = Infinity;
  let started = false, stopped = false, curLabel = null, curT = 0, flushed = 0;
  const queue = [], sections = [], secCache = new Map(), barStarts = [];
  const loop = opt.loop ?? !!song.loop;
  const secOf = (i, l) => { const k = i + ':' + l; if (!secCache.has(k)) secCache.set(k, resolve(song, C, song.form[i], l, Vr)); return secCache.get(k); };
  const firstChordOf = (i, l) => { if (i >= song.form.length) { if (!loop) return null; i = song.loopTo || 0; l++; } const S = secOf(i, l); return tr(S.chords[0][0].ch, S.transpose); };

  function genBar() {
    if (fi >= song.form.length) {
      if (!loop) { ended = true; endT = barT + 3; return; }
      fi = song.loopTo || 0; loopN++;
    }
    const S = secOf(fi, loopN), bpm = song.bpm * S.bpmK, eighth = 30 / bpm, sw = song.swing || 0;
    const nextCh = bi + 1 < S.bars ? tr(S.chords[bi + 1][0].ch, S.transpose) : (firstChordOf(fi + 1, loopN) || tr(S.chords[0][0].ch, S.transpose));
    if (bi === 0) { sections.push(S.label); curLabel = S.label; if (opt.onSection) opt.onSection(S.label, barT); }
    const evs = barEvents(song, S, bi, nextCh, rnd, st);
    const dyn = 1 + 0.13 * Math.sin(dynPh + st.bars * 6.283 / dynLen);
    for (const e of evs) {
      // thinned: a share of the accompaniment's notes left out (never a bar's downbeat), so it breathes
      const th = THIN.has(e.role) ? S.thin[e.role] ?? S.thin.all : 0;
      if (th && e.pos > 0.01 && rnd() < th) continue;
      const a = swung(e.pos, sw), t0 = barT + a * eighth, t1 = barT + swung(e.pos + e.dur, sw) * eighth;
      const tune = e.role === 'lead' || e.role === 'counter';
      const hum = e.role === 'drums' ? (rnd() - 0.5) * LF.hum * 0.5 : (rnd() - 0.5) * LF.hum * (tune ? 2 : 1) + (tune ? LF.lag : LF.lag * 0.3);
      const lvl = (S.mix[e.role] ?? 1) * S.vol;
      if (lvl <= 0) continue;
      queue.push({ t: t0 + hum, d: Math.max(0.04, t1 - t0), inst: e.inst, kit: e.kit, n: e.n, vel: Math.min(1.2, e.vel * lvl * dyn * (1 - LF.vel / 2 + rnd() * LF.vel)), role: e.role });
    }
    queue.sort((p, q) => p.t - q.t);
    barStarts.push(barT); if (barStarts.length > 8) barStarts.shift();
    barT += E * eighth; st.bars++; bi++;
    if (bi >= S.bars) { bi = 0; fi++; }
  }
  function fill(horizon) { while (!ended && barT < horizon) genBar(); }
  function play(e, bus) {
    const out = chan(e.inst, e.role, bus);
    try {
      if (e.inst === 'drums') {
        if (bank && bank.drum(e.kit, out, e.t, e.vel)) { nSampled++; return; }
        const f = DRUM[e.kit]; if (f) f(B, out, e.t, e.vel); nSynth++;
      } else {
        // the recorded instrument (struck and plucked notes ring on a little past their value), else its synthesised voice
        if (bank && bank.play(sampleOf(e.inst), out, e.t, e.n, e.d, e.vel, { ring: e.d + (RING[e.inst] ?? 0) })) { nSampled++; return; }
        const f = V[e.inst] || V[SYNTH_FOR[e.inst]]; if (f) f(B, out, e.t, e.n, e.d, e.vel); nSynth++;
      }
    } catch (err) { if (!api.err) api.err = String(err); }
  }
  function flush(until, now) {
    let k = 0;
    while (k < queue.length && queue[k].t < until) { const e = queue[k++]; if (e.t >= now - 0.05) { e.t = Math.max(e.t, now); play(e); flushed++; } }
    if (k) queue.splice(0, k);
  }

  const api = {
    song, id: song.id, variant: opt.variant || null, err: null,
    get started() { return started; },
    get stopped() { return stopped; },
    get done() { return stopped || (ended && !queue.length && ctx.currentTime > endT); },
    get loops() { return loopN; },
    get bars() { return st.bars; },
    get formIndex() { return fi; },
    get section() { return curLabel; },
    get sections() { return sections.slice(); },
    get gain() { return fade.gain.value; },
    get notes() { return flushed; },
    /** start at `when`, fading in over `fade` s, the lowpass opening from `from` Hz */
    start(when = ctx.currentTime + 0.05, { fade: fi_ = 2.5, from = null } = {}) {
      started = true; barT = when; curT = when;
      for (const l of lfos) l.start(when);
      noiseOn(when);
      fade.gain.cancelScheduledValues(when); fade.gain.setValueAtTime(0, when); fade.gain.linearRampToValueAtTime(1, when + Math.max(0.02, fi_));
      if (from) { muffle.frequency.setValueAtTime(from, when); muffle.frequency.exponentialRampToValueAtTime(lp0, when + Math.max(0.1, fi_ * 0.9)); }
      return api;
    },
    pump(now = ctx.currentTime) {
      if (!started || stopped) return;
      fill(now + AHEAD + 0.05);
      flush(now + AHEAD, now);
    },
    render(until) { fill(until); flush(until, -1); },
    /** fade out over `fade` s, the lowpass closing to `to` Hz; nothing more is scheduled, the nodes go when the fade is over */
    stop(f = 2.5, { to = null } = {}) {
      if (stopped) return;
      stopped = true; queue.length = 0;
      const t = ctx.currentTime;
      fade.gain.cancelScheduledValues(t); fade.gain.setValueAtTime(fade.gain.value, t); fade.gain.setTargetAtTime(0, t, Math.max(0.01, f / 3.5));
      if (to) { muffle.frequency.cancelScheduledValues(t); muffle.frequency.setValueAtTime(muffle.frequency.value, t); muffle.frequency.exponentialRampToValueAtTime(to, t + Math.max(0.1, f * 0.8)); }
      setTimeout(() => { for (const x of [...noiseSrc, ...lfos, mix, tape, pre, fade, wow, muffle, send, stingBus, ...Object.values(chans)]) { try { if (x.stop) x.stop(); x.disconnect(); } catch { /* gone */ } } }, (f + 2.5) * 1000);
    },
    /** the next bar line at or after `now` (a game-night crossfade waits for it) */
    nextBar(now = ctx.currentTime) { return barStarts.find(t => t >= now + 0.02) ?? Math.max(barT, now); },
    /** fade a layer ('base', 'rhythm', 'lead' or the song's own) to `v` over about `secs` */
    setLayer(name, v, secs = 2) {
      layerWant[name] = v;
      const g = layerG[name]; if (!g) return;
      const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(v, t, Math.max(0.02, secs / 3));
    },
    get layers() { return { ...layerWant }; },
    /** the song's sting: the bed dips under the catch's own sound, then a flourish in the key and the bed swells back
     *  (`stings: { over: ... }` names more of them, a board game's 'over') */
    cue(name) {
      const S = (song.stings && song.stings[name]) || (name === 'catch' ? song.sting : null);
      if (!S || stopped || !started) return false;
      const t = ctx.currentTime, g = fade.gain, dip = S.dip ?? 0.35, wait = S.wait ?? 2.2;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(dip, t, 0.12); g.setTargetAtTime(1, t + wait + 0.4, 1.1);
      const cur = secOf(Math.min(fi, song.form.length - 1), loopN), bpm = song.bpm * cur.bpmK, eighth = 30 / bpm;
      const at = t + wait;
      for (const ln of S.lines) for (const nt of parseLine(ln.line, E)) play({ t: at + nt.pos * eighth, d: nt.dur * eighth, inst: ln.inst, n: nt.n + cur.transpose, vel: nt.vel * (ln.vol ?? 0.9), role: 'sting' }, stingBus);
      api.cued = (api.cued || 0) + 1; (api.cues || (api.cues = [])).push(name);
      return true;
    },
    state() { return { id: song.id, variant: api.variant, section: curLabel, sections: sections.slice(), formIndex: fi, bar: bi, bars: st.bars, loops: loopN, queued: queue.length, notes: flushed, done: api.done, stopped, gain: +fade.gain.value.toFixed(3), lp: Math.round(muffle.frequency.value), err: api.err, sampled: nSampled, synth: nSynth }; },
    /** how many notes played from samples and how many on the synthesised fallback */
    get sampled() { return nSampled; },
    get synth() { return nSynth; },
    lofi: LF,
    _nodes: { mix, pre, fade, muffle, wow, tape },
  };
  return api;
}
