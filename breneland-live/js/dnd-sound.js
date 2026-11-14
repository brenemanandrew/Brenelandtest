// The D&D back room's sound, to make up for the plain browser voice the DM uses: the music (game-night-music.js, crossfaded on
// the bar), the room's ambience, the table sounds, stingers for fights, crits and scenes, each scene's acoustics, and a duck
// while the DM speaks. Heard in the room, muffled in the shop, nothing outside. The DM's voice is speechSynthesis, outside Web
// Audio, so the echo can't reach it.
// It reads the D&D state and log lines off the network itself (wire(ctx)). A feature that knows more calls it directly:
// ctx.audio.backroom.onEvent('monster', { name: 'Ghoul', boss: true }), ctx.audio.backroom.playDice(0.8, 'felt').
// Everything renders offline too (an OfflineAudioContext and a scripted source).
import { SONGS, TABLE_SONGS } from './music-songs.js';
import { playNote, playDrum } from './music-band.js';
import { instBank } from './music-sampler.js';
import { createTableMusic, tableMood, combatLayers, SPACES, VICTORY_HOLD } from './game-night-music.js';
import { backroomAt } from './music-place.js';

const dbGain = db => Math.pow(10, db / 20);
const THIN = { base: 1, rhythm: 0.25, lead: 0 }, FULL = { base: 1, rhythm: 1, lead: 1 };   // (a check in the air; everything)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const DUCK_DB = { music: -9, sfx: -4, amb: -6 };      // under the DM's voice
// where you are: the level and the high cut of each part (the shop hears the room through the wall; outside nothing)
export const PLACE = {
  room: { music: [0, 18000], sfx: [0, 18000], amb: [0, 18000] },
  shop: { music: [-15, 650], sfx: [-18, 550], amb: [-60, 400] },
  out: { music: [-90, 300], sfx: [-90, 300], amb: [-90, 300] },
};
export const STING_DB = -14;        // the stingers into the music, against the band's notes
export const SFX_DB = -9;           // the table sounds into the effects bus
export const AMB_DB = 0;            // the ambience into the ambience bus
export const REVERB_XF = 3;         // the acoustics' crossfade between scenes (s)
export const ROLL = 1.4;            // start_combat's drum roll (s), the fight's music comes in at its end
export const HELD_MAX = 9;          // a check's held note at most (s)
export const REFRESH = 0.1;         // how often the room, the table and the mood are read again (s); the bands pump every frame
export const SURFACES = ['felt', 'tray', 'table', 'floor'];
export const EVENTS = ['dice', 'combat-start', 'combat-end', 'damage', 'heal', 'crit', 'fumble', 'scene', 'handout', 'item', 'monster', 'check', 'result', 'narrate', 'sheet', 'char', 'speak'];

/** the song's key: { root (MIDI near middle C), minor } from music-songs' `key` ('D major', 'E minor (Phrygian)') */
export function keyOf(song) {
  const m = /^([A-G])(#|b)?/.exec(song?.key || 'C'), pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m ? m[1] : 'C'] + (m && m[2] === '#' ? 1 : m && m[2] === 'b' ? -1 : 0);
  return { root: 60 + ((pc + 12) % 12), minor: /minor/i.test(song?.key || '') };
}

// an impulse response for a space: a decaying, darkening noise tail, the early echoes, the pre-delay (one per context and space)
const IRS = new WeakMap();
export function spaceIR(ctx, name) {
  let m = IRS.get(ctx); if (!m) IRS.set(ctx, m = new Map());
  if (m.has(name)) return m.get(name);
  const S = SPACES[name] || SPACES.tavern, sr = ctx.sampleRate, len = Math.floor(sr * (S.tail * 1.15 + S.pre + 0.05)), ir = ctx.createBuffer(2, len, sr);
  let seed = 1234 + name.length * 77;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c), p0 = Math.floor(sr * S.pre);
    let y = 0;
    for (let i = p0; i < len; i++) {
      const tt = (i - p0) / sr, fc = S.dark + (9000 - S.dark) * Math.exp(-tt / (S.tail * 0.25)), a = Math.exp(-2 * Math.PI * fc / sr);
      y = (1 - a) * (rnd() * 2 - 1) + a * y;
      d[i] = y * Math.exp(-6.9 * tt / S.tail) * (tt < 0.004 ? tt / 0.004 : 1) * 1.6;
    }
    S.echoes.forEach((e, k) => { const at = p0 + Math.floor(sr * (e + (c ? 0.009 : 0))), amp = 0.55 * Math.pow(0.62, k); for (let j = 0; j < sr * 0.006 && at + j < len; j++) d[at + j] += amp * (rnd() * 2 - 1) * Math.exp(-j / (sr * 0.0015)); });
  }
  m.set(name, ir);
  return ir;
}

/** createDndSound(audio, { source }) -> the back room's sound; audio.update calls update() every frame */
export function createDndSound(audio, opt = {}) {
  let C = null;           // the output chains, built with the sound
  let music = null, space = null, verbs = [], amb = null, ambOffAt = -1;
  let where = 'out', talkUntil = -1, lastDmAt = -1e9, diceAt = -1e9, victoryUntil = -1, prevCombat = null, prevScene = null, prevStarted = false;
  let combatStingAt = -1e9, rollEnd = -1, held = null, heldUntil = -1, nextCreak = -1, nextGust = -1, sceneInfo = {}, lastWhereLog = null;
  let tableOverride = null, whereOverride = null, talkOverride = null;
  let want = null, wantKey = '', srcAt = -1e9, dirty = true;   // (what the music wants, read every REFRESH s or when something happened)
  const queue = [], events = [], stings = [], sounds = [];
  const now = () => audio.ctx.currentTime;
  const rand = (a, b) => a + Math.random() * (b - a);
  const bank = () => (api.useSamples && audio.ctx ? instBank(audio.ctx) : null);
  const note = (t, inst, n, dur, vel, out = C.sting) => playNote(audio, bank(), out, inst, t, n, dur, vel);
  const drum = (t, piece, vel, out = C.sting) => playDrum(audio, bank(), out, piece, t, vel);
  const song = () => SONGS[TABLE_SONGS[music?.mood || 'tavern']];
  const logSound = (name, t) => { sounds.push({ name, at: +t.toFixed(2) }); if (sounds.length > 80) sounds.shift(); };

  function build() {
    const ctx = audio.ctx, A = ctx.createGain.bind(ctx);
    const chain = (dest, inDb) => {
      const input = A(), duck = A(), place = A(), muffle = ctx.createBiquadFilter();
      input.gain.value = dbGain(inDb); place.gain.value = 0; muffle.type = 'lowpass'; muffle.frequency.value = 300; muffle.Q.value = 0.5;
      input.connect(duck).connect(place).connect(muffle).connect(dest || audio.master);
      const rev = A(); rev.connect(duck);   // (the space's return, ducked and muffled with the dry)
      return { input, duck, place, muffle, rev, revIn: A(), k: 1 };
    };
    C = { music: chain(audio.music, 0), sfx: chain(audio.levelNodes?.sfx, SFX_DB), amb: chain(audio.levelNodes?.amb, AMB_DB) };
    C.sting = A(); C.sting.gain.value = dbGain(STING_DB); C.sting.connect(C.music.input);
    const sSend = A(); sSend.gain.value = 0.35; C.sting.connect(sSend).connect(C.music.revIn);
    const fxSend = A(); fxSend.gain.value = 0.5; C.sfx.input.connect(fxSend).connect(C.sfx.revIn);
    C.fx = C.sfx.input;
    music = createTableMusic(audio, { out: C.music.input, send: C.music.revIn, useSamples: api.useSamples, loadOpts: api.loadOpts });
  }

  // ---------------------------------------------------------------- the space (a convolver per part, crossfaded on a change)
  function setSpace(name, t, xf = REVERB_XF) {
    if (name === space) return;
    const ctx = audio.ctx, S = SPACES[name] || SPACES.tavern, ir = spaceIR(ctx, name);
    for (const v of verbs) if (!v.dying) { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + xf); v.dying = t + xf + 0.5; }
    for (const part of ['music', 'sfx']) {
      const conv = ctx.createConvolver(), g = ctx.createGain();
      conv.buffer = ir; g.gain.value = 0;
      C[part].revIn.connect(conv).connect(g).connect(C[part].rev);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(S.wet * (part === 'sfx' ? 1.2 : 1), t + (space === null ? 0.05 : xf));
      verbs.push({ conv, g, part, space: name, dying: 0 });
    }
    events.push({ type: 'space', from: space, to: name, at: +t.toFixed(2) });
    space = name;
  }
  function trimVerbs(t) {
    for (let i = verbs.length - 1; i >= 0; i--) if (verbs[i].dying && t > verbs[i].dying) { const v = verbs[i]; try { C[v.part].revIn.disconnect(v.conv); v.conv.disconnect(); v.g.disconnect(); } catch { /* gone */ } verbs.splice(i, 1); }
  }

  // ---------------------------------------------------------------- little synthesised sounds
  function burst(t, dur, { type = 'bandpass', f = 2000, f2 = null, q = 1, peak = 0.2, att = 0.004, out = C.fx, buf = null } = {}) {
    const ctx = audio.ctx, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf || audio.white; s.loop = true;
    bp.type = type; bp.frequency.setValueAtTime(f, t); if (f2) bp.frequency.exponentialRampToValueAtTime(f2, t + dur); bp.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setTargetAtTime(0, t + att, Math.max(0.004, (dur - att) / 3));
    s.connect(bp).connect(g).connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
    s.onended = () => { try { bp.disconnect(); g.disconnect(); } catch { /* gone */ } };
  }
  function ping(t, f, dur, peak, out = C.fx, type = 'sine') {
    const ctx = audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, dur / 3);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05); o.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
  }
  const SURF = { felt: { f: 1300, q: 0.8, k: 0.7, tick: 0 }, tray: { f: 2500, q: 1.6, k: 1, tick: 1150 }, table: { f: 3300, q: 1.1, k: 1, tick: 1700 }, floor: { f: 900, q: 0.7, k: 1.1, tick: 420 } };
  function dice(t, power = 0.6, surface = 'felt') {
    const p = clamp(+power || 0.5, 0.05, 1), S = SURF[surface] || SURF.felt, n = 2 + Math.round(p * 6);
    let tt = t, v = 0.55 + 0.45 * p;
    for (let k = 0; k < n; k++) {
      burst(tt, 0.035, { f: S.f * rand(0.85, 1.2), q: S.q, peak: 0.32 * v * S.k, att: 0.002 });
      if (S.tick) ping(tt, S.tick * rand(0.8, 1.35), 0.03, 0.08 * v);
      tt += (0.05 + 0.13 * p) * Math.pow(0.66, k) + rand(0, 0.025); v *= 0.74;
    }
    if (p > 0.45) burst(t + 0.05, 0.25 + 0.3 * p, { f: S.f * 1.4, q: 2, peak: 0.04 * p, att: 0.05 });   // (the dice rattling as they roll)
    logSound('dice:' + surface, t);
  }
  function pageTurn(t, k = 1) {
    burst(t, 0.16, { f: 1600, f2: 3600, q: 0.9, peak: 0.06 * k, att: 0.04 });
    for (let i = 0; i < 6; i++) burst(t + 0.14 + i * rand(0.025, 0.045), 0.04, { f: rand(2500, 5000), q: 1.4, peak: 0.05 * k, att: 0.004 });
    burst(t + 0.3, 0.22, { f: 2400, f2: 900, q: 0.8, peak: 0.05 * k, att: 0.02 });
    logSound('page', t);
  }
  function pencil(t) {
    let tt = t;
    for (let i = 0; i < 4; i++) { const d = rand(0.12, 0.24); burst(tt, d, { f: rand(3800, 5200), q: 2.2, peak: 0.035, att: 0.02 }); tt += d + rand(0.04, 0.1); }
    logSound('pencil', t);
  }
  function coins(t) {
    for (let i = 0; i < 6; i++) { const tt = t + i * rand(0.05, 0.11), f = rand(2100, 3300); ping(tt, f, 0.16, 0.035); ping(tt, f * 2.76, 0.08, 0.018); ping(tt, f * 5.4, 0.04, 0.01); burst(tt, 0.02, { type: 'highpass', f: 6000, peak: 0.03, att: 0.001 }); }
    logSound('coins', t);
  }
  function creak(t) {
    const ctx = audio.ctx, o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), d = rand(0.5, 0.9);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(rand(150, 190), t); o.frequency.linearRampToValueAtTime(rand(105, 130), t + d);
    bp.type = 'bandpass'; bp.frequency.value = rand(650, 900); bp.Q.value = 5;
    lfo.type = 'square'; lfo.frequency.value = rand(18, 28); lg.gain.value = 0.5; am.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.08); g.gain.setTargetAtTime(0, t + d * 0.7, 0.08);
    o.connect(bp).connect(am).connect(g).connect(C.amb.input); o.start(t); lfo.start(t); o.stop(t + d + 0.3); lfo.stop(t + d + 0.3);
    o.onended = () => { try { bp.disconnect(); am.disconnect(); g.disconnect(); lg.disconnect(); } catch { /* gone */ } };
    logSound('creak', t);
  }
  const whoosh = (t, k = 1) => { burst(t, 0.55, { f: 350, f2: 3200, q: 1.3, peak: 0.07 * k, att: 0.25 }); logSound('whoosh', t); };
  function thud(t, amount = 6) {
    const k = clamp(amount / 15, 0.15, 1);
    drum(t, 'boom', 0.22 + 0.3 * k, C.fx); burst(t, 0.18, { type: 'lowpass', f: 260, q: 0.7, peak: 0.1 * k, att: 0.003 });
    logSound('thud', t);
  }

  // ---------------------------------------------------------------- the stingers (in the key of the song playing)
  function rollIn(t) {
    drum(t, 'boom', 0.75); drum(t, 'snare', 0.6);
    const n = 22; for (let i = 0; i < n; i++) drum(t + 0.12 + i * (ROLL - 0.2) / n, 'snare', 0.22 + 0.7 * (i / n) ** 1.6);
    drum(t + ROLL - 0.05, 'tom', 0.9); drum(t + ROLL, 'boom', 1);
    stings.push({ name: 'combat-start', at: +t.toFixed(2) }); logSound('roll', t);
    return t + ROLL;
  }
  function fanfare(t) {
    const r = keyOf(song()).root, T = r < 64 ? r + 12 : r;
    [0, 4, 7, 12].forEach((iv, i) => note(t + i * 0.09, 'flute', T + iv, 0.5, 0.85));
    [0, 4, 7].forEach(iv => note(t + 0.27, 'strings', T + iv - 12, 1.8, 0.7));
    note(t + 0.36, 'glock', T + 24, 1, 0.6); note(t + 0.45, 'glock', T + 28, 1, 0.55); drum(t + 0.27, 'boom', 0.7);
    whoosh(t - 0.25, 0.7);
    stings.push({ name: 'crit', at: +t.toFixed(2) }); logSound('fanfare', t);
  }
  function wah(t) {
    [67, 66, 65].forEach((n, i) => note(t + i * 0.42, 'clarinet', n - 12, 0.36, 0.75));
    note(t + 1.26, 'clarinet', 52, 1.3, 0.7);
    dice(t + 1.9, 0.3, 'floor');
    stings.push({ name: 'fumble', at: +t.toFixed(2) }); logSound('wah', t);
  }
  function sceneSting(t, mood) {
    const k = keyOf(SONGS[TABLE_SONGS[mood]]), T = k.root, sc = k.minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12];
    if (mood === 'tavern') [12, 16, 19, 24].forEach((iv, i) => note(t + i * 0.08, 'fiddle', T + iv - 12, 0.3, 0.7));
    else if (mood === 'explore') sc.forEach((iv, i) => note(t + i * 0.07, 'harp', T + iv, 0.9, 0.6));
    else if (mood === 'tension') { note(t, 'cello', T - 24, 2.4, 0.75); note(t + 0.5, 'pizz', T + 1, 0.4, 0.6); drum(t, 'boom', 0.5); }
    else if (mood === 'spooky') { [15, 14, 12].forEach((iv, i) => note(t + i * 0.4, 'musicbox', T + iv, 0.9, 0.6)); note(t + 1.3, 'celesta', T + 23, 1.2, 0.4); }
    else if (mood === 'victory') [24, 28, 31].forEach((iv, i) => note(t + i * 0.12, 'glock', T + iv - 12, 1, 0.55));
    else return;
    stings.push({ name: 'scene:' + mood, at: +t.toFixed(2) }); logSound('sting:' + mood, t);
  }
  function monsterSting(t) {
    const T = keyOf(song()).root;
    note(t, 'cello', T - 24, 2.2, 0.85); note(t + 0.05, 'cello', T - 23, 2, 0.6); drum(t, 'boom', 0.8);
    stings.push({ name: 'monster', at: +t.toFixed(2) }); logSound('monster', t);
  }
  function shimmer(t) {
    const T = keyOf(song()).root;
    [12, 16, 19, 24, 28].forEach((iv, i) => note(t + i * 0.07, 'celesta', T + iv, 1, 0.55));
    note(t, 'strings', T + 12, 1.6, 0.45);
    stings.push({ name: 'heal', at: +t.toFixed(2) }); logSound('shimmer', t);
  }
  function reveal(t) {
    burst(t, 0.6, { f: 2200, f2: 4200, q: 0.7, peak: 0.05, att: 0.15 }); pageTurn(t + 0.25, 0.8);
    const T = keyOf(song()).root;
    [0, 7, 16].forEach((iv, i) => note(t + 0.55 + i * 0.06, 'harp', T + iv, 1.6, 0.6)); note(t + 0.8, 'celesta', T + 24, 1.4, 0.45);
    stings.push({ name: 'handout', at: +t.toFixed(2) }); logSound('reveal', t);
  }
  function holdNote(t) {
    if (held) releaseHeld(t, null);
    const ctx = audio.ctx, g = ctx.createGain(), T = keyOf(song()).root;
    g.gain.value = 1; g.connect(C.sting);
    note(t, 'strings', T + 7 - 12, HELD_MAX, 0.55, g); note(t, 'strings', T, HELD_MAX, 0.45, g);
    held = { g, at: t }; heldUntil = t + HELD_MAX;
    stings.push({ name: 'check', at: +t.toFixed(2) }); logSound('held', t);
  }
  function releaseHeld(t, ok) {
    if (!held) return;
    const g = held.g, T = keyOf(song()).root;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(0, t, 0.15);
    setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 2000);
    held = null; heldUntil = -1;
    if (ok === true) { [0, 4, 7, 12].forEach((iv, i) => note(t + i * 0.06, 'harp', T + iv, 1.2, 0.6)); stings.push({ name: 'resolve:up', at: +t.toFixed(2) }); }
    else if (ok === false) { note(t, 'cello', T - 9, 0.5, 0.6); note(t + 0.4, 'cello', T - 12, 1.4, 0.6); stings.push({ name: 'resolve:down', at: +t.toFixed(2) }); }
  }

  // ---------------------------------------------------------------- the ambience (built while the room is near)
  function ambOn() {
    if (amb) return;
    const ctx = audio.ctx, G = v => { const g = ctx.createGain(); g.gain.value = v; return g; }, loop = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(ctx.currentTime, Math.random() * 1.5); return s; };
    const flt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const A = C.amb.input, nodes = [];
    // the room's own tone: brown noise, low
    const tone = loop(audio.brown || audio.white), toneG = G(0.05); tone.connect(flt('lowpass', 260, 0.5)).connect(toneG).connect(A);
    // the shop through the door: a murmur (band-passed noise, breathing slowly), its level by how far the door is open
    const mur = loop(audio.white), murBp = flt('bandpass', 480, 1.1), murBp2 = flt('peaking', 1150, 2), murAm = G(0.5), murG = G(0.003);
    murBp2.gain.value = 5;
    const l1 = ctx.createOscillator(), l2 = ctx.createOscillator(), lg1 = G(0.22), lg2 = G(0.15);
    l1.frequency.value = 0.31; l2.frequency.value = 0.83; l1.connect(lg1).connect(murAm.gain); l2.connect(lg2).connect(murAm.gain); l1.start(); l2.start();
    mur.connect(murBp).connect(murBp2).connect(murAm).connect(murG).connect(A);
    // the hanging lamp's hum
    const h1 = ctx.createOscillator(), h2 = ctx.createOscillator(), humG = G(0.0022), h2g = G(0.4);
    h1.frequency.value = 120; h2.frequency.value = 240; h1.connect(humG); h2.connect(h2g).connect(humG); humG.connect(A); h1.start(); h2.start();
    // rain on the window and the wind round it
    const rain = loop(audio.white), rainG = G(0); rain.connect(flt('highpass', 2600, 0.6)).connect(flt('lowpass', 7000, 0.5)).connect(rainG).connect(A);
    const wind = loop(audio.brown || audio.white), windBp = flt('bandpass', 520, 0.9), windG = G(0); wind.connect(windBp).connect(windG).connect(A);
    nodes.push(tone, mur, l1, l2, h1, h2, rain, wind);
    amb = { nodes, toneG, murG, humG, rainG, windG, windBp, door: -1, rain: -1, wind: -1, gust: 0 };
    nextCreak = now() + rand(8, 25); nextGust = now() + rand(20, 50);
    events.push({ type: 'ambience', on: true, at: +now().toFixed(2) });
  }
  function ambOff() {
    if (!amb) return;
    for (const n of amb.nodes) { try { n.stop(); n.disconnect(); } catch { /* gone */ } }
    amb = null; events.push({ type: 'ambience', on: false, at: +now().toFixed(2) });
  }
  function ambUpdate(t, src) {
    const door = clamp(src.door ?? 0, 0, 1), rain = clamp(src.rain ?? 0, 0, 1), wind = clamp(src.wind ?? 0, 0, 1);
    if (Math.abs(door - amb.door) > 0.02) { amb.murG.gain.setTargetAtTime(0.003 + 0.016 * door, t, 0.25); amb.door = door; }
    if (Math.abs(rain - amb.rain) > 0.02) { amb.rainG.gain.setTargetAtTime(0.018 * rain, t, 1.5); amb.rain = rain; }
    // a gust now and then: at night, or more of them in a wind
    if (t >= nextGust) {
      const want = src.night || wind > 0.35;
      if (want) { const g = 0.004 + 0.012 * Math.max(wind, src.night ? 0.4 : 0), d = rand(3, 6); amb.windG.gain.setTargetAtTime(g, t, d * 0.3); amb.windG.gain.setTargetAtTime(0.0015 * wind, t + d, d * 0.35); amb.windBp.frequency.setTargetAtTime(rand(380, 760), t, 2); logSound('gust', t); }
      nextGust = t + (wind > 0.35 ? rand(12, 30) : rand(40, 90));
    }
    if (rain > 0.05 && Math.random() < rain * 0.25) ping(t + Math.random() * 0.1, rand(2800, 6400), 0.012, 0.006 * rain, C.amb.input);   // (a drop on the glass)
    if (t >= nextCreak) { creak(t); nextCreak = t + rand(25, 70); }
  }

  // ---------------------------------------------------------------- the hook
  function onEvent(type, data = {}) {
    if (!audio.ctx) return false;
    if (!C) build();
    dirty = true;
    const t = now() + 0.02;
    events.push({ type, at: +t.toFixed(2), data: data && typeof data === 'object' ? { ...data, text: undefined } : data });
    if (events.length > 120) events.shift();
    if (where === 'out' && type !== 'narrate' && type !== 'speak') return false;
    switch (type) {
      case 'dice': diceAt = t; dice(t, data.power ?? 0.6, data.surface || 'felt'); break;
      case 'combat-start': combatStingAt = t; rollEnd = rollIn(t); break;
      case 'combat-end': victoryUntil = t + VICTORY_HOLD; stings.push({ name: 'combat-end', at: +t.toFixed(2) }); break;
      case 'damage': thud(t, +data.amount || 6); break;
      case 'heal': shimmer(t); break;
      case 'crit': releaseHeld(t, null); fanfare(t + 0.15); break;
      case 'fumble': releaseHeld(t, null); wah(t + 0.2); break;
      case 'scene': queue.push({ at: t + 0.35, run: tt => { const m = tableMood(api.table(), { now: tt, victoryUntil, sceneInfo: sceneInfo[api.table()?.scene] }).mood; if (m !== 'combat') sceneSting(tt, m); } }); victoryUntil = -1; break;
      case 'handout': reveal(t); break;
      case 'item': if (!data.remove) { coins(t); note(t + 0.25, 'glock', keyOf(song()).root + 24, 1, 0.5); note(t + 0.37, 'glock', keyOf(song()).root + 31, 1, 0.45); } else pageTurn(t, 0.6); break;
      case 'monster': monsterSting(t); break;
      case 'check': holdNote(t); break;
      case 'result': releaseHeld(t, data.ok === undefined ? null : !!data.ok); break;
      case 'narrate': { pageTurn(t, 0.8); const src = api.src(); if (src.voiceOn !== false && where === 'room') { talkUntil = Math.max(talkUntil, t + 0.6 + String(data.text || '').length / 13); lastDmAt = t; } break; }
      case 'speak': talkUntil = data.on === false ? t : Math.max(talkUntil, t + (data.secs || 30)); lastDmAt = t; break;
      case 'sheet': pageTurn(t, 0.9); break;
      case 'char': pencil(t); break;
      default: return false;
    }
    return true;
  }
  /** a log line of the table (lib/dnd.js logLine), as the network brings it: the events it means */
  function fromLog(e) {
    if (!e || !e.k) return;
    const t = audio.ctx ? now() : 0;
    switch (e.k) {
      case 'dm': onEvent('narrate', { text: e.text || '' }); break;
      case 'roll': {
        if (t - diceAt > 1.5) onEvent('dice', { power: 0.55, surface: e.seat === 6 ? 'table' : 'tray' });
        if (e.nat === 20) onEvent('crit'); else if (e.nat === 1) onEvent('fumble');
        else if (e.dc !== undefined && e.ok !== undefined) onEvent('result', { ok: e.ok });
        break;
      }
      case 'ask': onEvent('check', { check: e.check }); break;
      case 'combat': if (/initiative/i.test(e.text || '')) onEvent('combat-start'); else if (/over/i.test(e.text || '')) onEvent('combat-end'); break;
      case 'hp': if (e.delta < 0) onEvent('damage', { amount: -e.delta }); else if (e.delta > 0) onEvent('heal', { amount: e.delta }); break;
      case 'scene': onEvent('scene', { name: e.text }); break;
      case 'handout': onEvent('handout', { id: e.id }); break;
      case 'item': onEvent('item', { remove: !!e.remove }); break;
      case 'journal': onEvent('sheet'); break;
      case 'sys': if (/ plays .+, /.test(e.text || '')) onEvent('char'); break;
    }
  }

  const refresh = t => api._refresh(t);
  const api = {
    source: opt.source || null,   // () -> { where: 'room'|'shop'|'out', s, seated, voiceOn, door, rain, wind, night } (main.js: backroomSource)
    useSamples: opt.useSamples ?? true,
    loadOpts: opt.loadOpts || null,
    onEvent, fromLog,
    /** the dice hook (hold-to-throw): power 0..1 (how hard), surface 'felt' | 'tray' | 'table' | 'floor' */
    playDice(power = 0.6, surface = 'felt') { return onEvent('dice', { power, surface }); },
    src() {
      let s = null;
      try { s = api.source ? api.source() : null; } catch { s = null; }
      s = { where: 'out', ...(s || {}) };
      if (whereOverride) s.where = whereOverride;
      if (tableOverride) s.s = tableOverride;
      return s;
    },
    table() { return tableOverride || api.src().s || null; },
    /** every frame (audio.update): the bands pump every frame; the room, the table and the mood are read every REFRESH s */
    update() {
      if (!audio.ctx) return;
      if (!C) build();
      const t = now();
      if (dirty || t - srcAt >= REFRESH) { srcAt = t; dirty = false; refresh(t); }
      music.update(t, want);
      if (queue.length) for (let i = queue.length - 1; i >= 0; i--) if (t >= queue[i].at) { const q = queue.splice(i, 1)[0]; try { q.run(t); } catch (err) { console.error('[dnd-sound]', err); } }
    },
    _refresh(t) {
      const src = api.src(), s = src.s || null;
      where = src.where || 'out';
      if (where !== lastWhereLog) { events.push({ type: 'where', where, at: +t.toFixed(2) }); lastWhereLog = where; }
      const P = PLACE[where] || PLACE.out;
      for (const part of ['music', 'sfx', 'amb']) {
        const ch = C[part], [db, lp] = P[part], g = db <= -89 ? 0 : dbGain(db);
        if (ch.tg !== g) { ch.place.gain.setTargetAtTime(g, t, 0.35); ch.tg = g; }
        if (ch.tlp !== lp) { ch.muffle.frequency.setTargetAtTime(lp, t, 0.3); ch.tlp = lp; }
      }
      // the table's changes seen in the state (a fight began or ended without its log line, a new scene, the night's end)
      const combat = !!s?.combat;
      if (combat && !prevCombat && t - combatStingAt > 3 && where !== 'out') { combatStingAt = t; rollEnd = rollIn(t); }
      if (!combat && prevCombat) victoryUntil = Math.max(victoryUntil, t + VICTORY_HOLD);
      if (s?.scene !== prevScene && prevScene !== null && !combat) victoryUntil = -1;
      if (!s?.started && prevStarted) victoryUntil = -1;
      prevCombat = combat; prevScene = s?.scene ?? null; prevStarted = !!s?.started;
      const tm = tableMood(s, { now: t, victoryUntil, sceneInfo: sceneInfo[s?.scene] });
      // the music: in the room always (the tavern while nobody plays), in the shop only while an adventure runs
      const blocked = audio.musicApi?.blockedBy ? audio.musicApi.blockedBy() : (audio.muted ? 'muted' : null);
      const active = !blocked && (where === 'room' || (where === 'shop' && !!s?.started));
      const thin = (s?.pending?.length > 0) || t < heldUntil;
      const L = tm.mood === 'combat' ? combatLayers(s) : thin ? THIN : FULL, at = tm.mood === 'combat' && rollEnd > t ? rollEnd : null;
      const key = active ? `${tm.mood}|${L.base}|${L.rhythm}|${L.lead}|${at}|${thin}` : '';
      if (key !== wantKey) { wantKey = key; want = active ? { mood: tm.mood, layers: { base: L.base, rhythm: L.rhythm, lead: L.lead }, at, layerFade: thin ? 1.2 : 2.5 } : null; }
      if (active || where === 'room') setSpace(tm.space, t);
      trimVerbs(t);
      if (held && t > heldUntil) releaseHeld(t, null);
      // under the DM's voice
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
      const talking = talkOverride ?? (where === 'room' && (t < talkUntil || (!!synth?.speaking && t - lastDmAt < 60)));
      if (talking !== C.talking) { C.talking = talking; for (const part of ['music', 'sfx', 'amb']) C[part].duck.gain.setTargetAtTime(talking ? dbGain(DUCK_DB[part]) : 1, t, talking ? 0.2 : 0.9); events.push({ type: 'duck', on: talking, at: +t.toFixed(2) }); }
      // the ambience
      if (where === 'room') { ambOn(); ambOffAt = -1; ambUpdate(t, src); }
      else if (amb) { if (ambOffAt < 0) ambOffAt = t + 8; else if (t > ambOffAt) ambOff(); }
    },
    /** wire it to the game: the table's log lines and state over the network, a sheet opening, the module's scenes */
    wire(ctx) {
      const net = ctx.net;
      net?.on?.('dnd-log', m => { if (m && m.e) fromLog(m.e); });
      net?.on?.('dnd-you', m => { if (m && m.char) onEvent('char'); });
      if (typeof document !== 'undefined') document.addEventListener('click', e => { if (e.target?.closest?.('.dnd .sheet-btn')) onEvent('sheet'); }, true);
      let modId = null;
      const fetchScenes = id => { modId = id; sceneInfo = {}; if (!id || typeof fetch === 'undefined') return; fetch('/dnd/modules/' + encodeURIComponent(id) + '.json').then(r => (r.ok ? r.json() : null)).then(j => { if (j && modId === id) for (const sc of j.scenes || []) sceneInfo[sc.id] = { mood: sc.mood || null, space: sc.space || null, area: sc.area || '' }; }).catch(() => {}); };
      const watch = m => { const id = m?.s?.module?.id || null; if (id !== modId) fetchScenes(id); };
      net?.on?.('dnd', watch); net?.on?.('dnd-state', watch);
    },
    state() {
      const s = api.table(), t = audio.ctx ? now() : 0;
      return { where, mood: music?.mood || null, track: music?.track || null, pending: music?.pending || null, space, layers: music?.band ? music.band.layers : null,
        talking: !!C?.talking, ambience: !!amb, amb: amb ? { door: amb.door, rain: amb.rain, murmur: +amb.murG.gain.value.toFixed(4), rainLevel: +amb.rainG.gain.value.toFixed(4), hum: +amb.humG.gain.value.toFixed(4) } : null,
        duck: C ? +C.music.duck.gain.value.toFixed(3) : 1, victoryIn: victoryUntil > t ? +(victoryUntil - t).toFixed(1) : 0, held: !!held,
        want: tableMood(s, { now: t, victoryUntil, sceneInfo: sceneInfo[s?.scene] }), combat: s?.combat ? combatLayers(s) : null,
        gains: music ? music.gains() : null, place: C ? Object.fromEntries(['music', 'sfx', 'amb'].map(p => [p, +C[p].place.gain.value.toFixed(3)])) : null };
    },
    get events() { return events.slice(); },
    get stings() { return stings.slice(); },
    get sounds() { return sounds.slice(); },
    get log() { return music ? music.log : []; },
    get music() { return music; },
    get chains() { return C; },
    get verbs() { return verbs.map(v => ({ space: v.space, part: v.part, gain: +v.g.gain.value.toFixed(3), dying: !!v.dying })); },
    // tests, renders and the curious
    setTable(s) { tableOverride = s || null; dirty = true; },
    setWhere(w) { whereOverride = w || null; dirty = true; },
    setTalking(v) { talkOverride = v ?? null; dirty = true; },
    setSceneInfo(id, info) { sceneInfo[id] = info; },
  };
  return api;
}

/** where the back room's sound reaches you and what the table is doing, from the game (main.js: audio.backroom.source) */
export function backroomSource(ctx, { weather = null, light = null } = {}) {
  const f = {}, find = n => f[n] || (f[n] = ctx.features?.find(x => x.name === n) || null);
  return () => {
    const p = ctx.player?.pos, store = find('store'), dnd = find('dnd');
    if (!p || !store) return { where: 'out' };
    const seated = (dnd?.seat ?? -1) >= 0, h = light && Number.isFinite(light.hour) ? light.hour : 12;
    return { where: backroomAt(store, p.x, p.y, p.z, seated), s: dnd?.state || null, seated, voiceOn: dnd ? dnd.voiceOn !== false : true,
      door: store.backDoor || 0, rain: weather ? weather.rain || 0 : 0, wind: weather ? weather.wind || 0 : 0, night: h < 6 || h >= 20.5 };
  };
}
