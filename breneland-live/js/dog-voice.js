// Dax's, Nala's and Molly's voices. AudioEngine.dogVoice calls playDogVoice.
// Real clips (public/audio/dogs, listed in dog-clips.js), picked per dog and mood by dog-voice-map.js. The bank loads once the
// sound is switched on. Until it has, or for a clip that failed, the dog is quiet. The NPC Editor's voice sliders come in
// through setDogVoiceSettings (dogs.js applySavedLooks).

import { CLIPS, CLIP_BASE } from './dog-clips.js';
import { DOG_VOICE_MAP, MOOD_PLAN } from './dog-voice-map.js';

export const DOG_MOODS = ['excited', 'happy', 'alert', 'sad', 'calm'];

const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));

// ------------------------------------------------------------------ the mood
// From the balloon text, a hint from the caller (the mail and pizza visits say 'alert', the play episode 'excited'),
// and the pose the dog is in (resting or lying: calm).
const SAD = /whine|whimper|tail tuck|sigh|sad/;
const BARKY = /bork|woof|wuff|yap|bark|grr/;
export function dogMood(who, text = '', hint = null, anim = null) {
  const s = String(text).toLowerCase();
  if (SAD.test(s)) return 'sad';
  if (hint === 'alert') return BARKY.test(s) ? 'alert' : /proud|pleased|wiggle|wag/.test(s) ? 'happy' : 'alert';
  if (hint && DOG_MOODS.includes(hint)) return hint;
  if (anim === 'rest' || anim === 'lie' || anim === 'sleep' || anim === 'sleepside' || anim === 'loaf' || anim === 'wake') return 'calm';
  if (/soft wuff|sleepy|yawn|yaaawn|snore|zzz/.test(s)) return 'calm';
  if (/zoom|!!|more\?|ball\?|play\?|got it|almost/.test(s) || (s.match(/bork/g) || []).length >= 3) return 'excited';
  return 'happy';   // a greeting, a treat, a wag
}

// ------------------------------------------------------------------ the real recordings: the bank
// One bank per AudioContext: { clips: id -> { buf, lead (s of silence before the sound in this decode) }, failed, loading }.
const BANKS = new WeakMap();
export const bankOf = ctx => BANKS.get(ctx) || null;
export function gameClipIds() {
  const s = new Set();
  for (const dog of Object.values(DOG_VOICE_MAP)) for (const ids of Object.values(dog)) for (const id of ids) if (CLIPS[id]) s.add(id);
  return [...s];
}
function decodeClip(ctx, ab, ms = 10000) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('decode timed out')), ms);   // (a decode that never answers counts as failed)
    const ok = b => { clearTimeout(timer); res(b); }, no = e => { clearTimeout(timer); rej(e); };
    const p = ctx.decodeAudioData(ab, ok, no);   // (the callback form for older Safari, the promise where there is one)
    if (p && typeof p.then === 'function') p.then(ok, no);
  });
}
// where the sound starts: MP3 decoders differ in how much encoder padding they leave in front
function leadOf(buf) {
  const x = buf.getChannelData(0), n = Math.min(x.length, Math.round(buf.sampleRate * 0.3));
  let pk = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v; }
  let i = 0;
  while (i < n && Math.abs(x[i]) < pk * 0.01) i++;
  return Math.max(0, i / buf.sampleRate - 0.002);
}
// Fetch and decode clips into ctx's bank and resolve with it. A clip that fails goes in bank.failed.
// decodeFn(arrayBuffer, id) -> AudioBuffer: the tools pass one that decodes each file once for all their contexts.
export function loadDogBank(ctx, { ids = gameClipIds(), base = CLIP_BASE, fetchFn = u => fetch(u), decodeFn = ab => decodeClip(ctx, ab) } = {}) {
  let bank = BANKS.get(ctx);
  if (!bank) BANKS.set(ctx, bank = { clips: new Map(), failed: new Set(), requested: new Set(), loading: Promise.resolve() });
  const todo = ids.filter(id => !bank.requested.has(id));
  for (const id of todo) bank.requested.add(id);
  const p = Promise.all(todo.map(async id => {
    try {
      const r = await fetchFn(base + id + '.mp3');
      if (!r || !r.ok) throw new Error('http ' + (r && r.status));
      const buf = await decodeFn(await r.arrayBuffer(), id);
      bank.clips.set(id, { buf, lead: leadOf(buf) });
    } catch { bank.failed.add(id); }
  }));
  bank.loading = Promise.all([bank.loading, p]).then(() => bank);
  return bank.loading;
}

// ------------------------------------------------------------------ the voice sliders (NPC Editor, saved with the dog's look)
// pitch: x the playback rate. bright: -1 darker to 1 brighter (up to 8 dB of treble, 4 dB of bass the other way).
// speed: x how fast barks follow each other. loud: dB, capped at +1 (that's the headroom under the loudest dog sound).
// growl: how much of the throaty layer. woof: which barks get picked (0 the yappiest, 1 the woofiest, 0.5 all alike).
// Missing or junk values fall back to the default.
export const VOICE_DEF = { pitch: 1, bright: 0, speed: 1, loud: 0, growl: 0, woof: 0.5 };
export const VOICE_RANGES = { pitch: [0.7, 1.4], bright: [-1, 1], speed: [0.6, 1.6], loud: [-12, 1], growl: [0, 1], woof: [0, 1] };
const SETTINGS = {};
export function setDogVoiceSettings(who, v) { SETTINGS[who] = v && typeof v === 'object' ? { ...v } : null; }
export function voiceOf(who, override = null) {
  const s = (override && typeof override === 'object' ? override : SETTINGS[who]) || {}, out = {};
  for (const k of Object.keys(VOICE_DEF)) {
    const x = Number(s[k]), r = VOICE_RANGES[k];
    out[k] = s[k] != null && Number.isFinite(x) ? Math.min(r[1], Math.max(r[0], x)) : VOICE_DEF[k];
  }
  return out;
}

// ------------------------------------------------------------------ the real recordings: playing them
// The level of each dog's clips into dogVoice's output (measured: tools/dog-voices-test.mjs, tools/audio-levels.mjs).
export const LEVEL = { dax: 0.3, nala: 0.17, molly: 0.2 };   // (Molly's slower, darker plans come out about 4 dB under Nala's at this level)
const dbGain = db => Math.pow(10, db / 20);
const LAST = {};   // who:kind -> the clip played last (never the same twice in a row)
const has = (bank, who, kind) => ((DOG_VOICE_MAP[who] || {})[kind] || []).some(id => bank.clips.has(id));
function pick(bank, who, kind, v, sharp) {
  let ids = ((DOG_VOICE_MAP[who] || {})[kind] || []).filter(id => bank.clips.has(id));
  if (!ids.length) return null;
  if (sharp && ids.length > 2) ids = [...ids].sort((p, q) => CLIPS[q].cent - CLIPS[p].cent).slice(0, Math.ceil(ids.length / 2));
  const key = who + ':' + kind, pool = ids.length > 1 ? ids.filter(id => id !== LAST[key]) : ids;
  let w = pool.map(() => 1);
  if (Math.abs(v.woof - 0.5) > 1e-3 && pool.length > 1) {   // yap or woof: weigh the clips by how bright they are
    const order = [...pool].sort((p, q) => CLIPS[q].cent - CLIPS[p].cent);
    w = pool.map(id => Math.max(0.03, 1 + (v.woof - 0.5) * 2 * (2 * order.indexOf(id) / (pool.length - 1) - 1)));
  }
  let r = Math.random() * w.reduce((p, q) => p + q, 0), i = 0;
  while (i < pool.length - 1 && (r -= w[i]) > 0) i++;
  return (LAST[key] = pool[i]);
}
const CURVES = new WeakMap();
function growlCurve(ctx) {
  let c = CURVES.get(ctx);
  if (!c) { c = new Float32Array(1024); for (let i = 0; i < c.length; i++) c[i] = Math.tanh(4 * (i / 511.5 - 1)) * 0.8; CURVES.set(ctx, c); }
  return c;
}

// What to play for a line in a mood: { kind (what it is, reported), steps, bright, growl, sharp, volley } (see MOOD_PLAN).
function planFor(who, s, mood, said) {
  const P = MOOD_PLAN[who], dax = who === 'dax', one = (kind, o = {}) => ({ kind, steps: [{ kind, n: [1, 1], ...o }] });
  if (dax) {
    if (/sniff/.test(s) && !/wuff|woof/.test(s)) return one('sniff', { gain: 0.9 });
    if (/pant/.test(s)) return one('pant', { rate: 1.12, len: 1.1, gain: 0.8 });
    if (/wag|okay/.test(s) && !/wuff|woof/.test(s)) {   // a sniff, then a little whine (brighter when happy)
      const up = mood === 'happy' || mood === 'excited';
      return { kind: 'whine', steps: [{ kind: 'sniff', n: [1, 1], gain: 0.7, optional: true }, { kind: 'whine', n: [1, 1], rate: up ? 1.06 : 1, gain: 0.8 }] };
    }
    if (mood === 'sad') return { kind: 'whine', ...P.sad };
    if (mood === 'calm') return { kind: 'woof', ...P.calm };
    if (!BARKY.test(s) && !/yip/.test(s) && mood !== 'excited' && mood !== 'alert') return one('whine', { gain: 0.6 });   // "*watches it go*" (as quiet as a sad whine)
  } else {
    if (/sniff/.test(s)) return one('sniff', { gain: 0.9 });
    if (/pant|wiggle/.test(s) && mood !== 'alert') return one('pant', { len: 1.3, gain: 0.85 });
    if (mood === 'sad') return { kind: 'whimper', ...P.sad };
    if (mood === 'calm') return { kind: 'calm', ...P.calm };
    if (/yip|zoom/.test(s)) return { kind: 'yip', bright: 1, steps: [{ kind: 'yip', n: [3, 4], rate: mood === 'excited' ? 1.12 : 1.05, gap: 0.2, gain: 0.9 }] };
  }
  const m = P[mood] || P.happy;
  // the barks: as many as the balloon says, within the mood's range
  const steps = m.steps.map(st => (st.kind === 'bark' ? { ...st, count: Math.max(st.n[0], Math.min(st.n[1], Math.max(said, irand(st.n[0], st.n[1])))) } : { ...st, optional: st.kind === 'pant' }));
  return { kind: 'bark', ...m, steps };
}

// Schedule a plan's clips into `out` from t through one chain (a gain per clip -> the tilt -> the level -> out, and the
// throaty layer when asked). Returns { end, n (clips of the plan's kind; a volley counts 2), ids, rates (each clip's playback rate), bends (the same before the detune) }.
function playReal(a, out, t, who, plan, v, bank) {
  const ctx = a.ctx;
  const gr = Math.min(1, (plan.growl || 0) + v.growl);
  // the throaty layer and extra treble both sound louder, so the call comes down with them
  const lvl = a.gain(LEVEL[who] * dbGain(Math.min(1, v.loud) - 3.5 * Math.max(0, v.bright)) / (1 + 0.7 * gr));
  // the tilt: the mood's treble (dB) and the Brightness slider, which also leans on the low end the other way
  const tilt = ctx.createBiquadFilter(), low = ctx.createBiquadFilter();
  tilt.type = 'highshelf'; tilt.frequency.value = 1500; tilt.gain.value = (plan.bright || 0) + v.bright * 8;
  low.type = 'lowshelf'; low.frequency.value = 400; low.gain.value = -v.bright * 4;
  tilt.connect(low).connect(lvl).connect(out);
  let layer = null;
  if (gr > 0.01) {   // the throaty layer: a saturated copy, low-passed, under the clean sound
    const sh = ctx.createWaveShaper(); sh.curve = growlCurve(ctx);
    const lp = a.filter('lowpass', 900, 0.8), g = a.gain(gr * 0.45);
    sh.connect(lp).connect(g).connect(lvl);
    layer = sh;
  }
  let at = t, end = t, n = 0;
  const ids = [], rates = [], bends = [];
  for (const st of plan.steps) {
    if (st.chance != null && Math.random() > st.chance) continue;
    let count = st.count ?? irand(st.n ? st.n[0] : 1, st.n ? st.n[1] : 1);
    const list = [];
    if (st.kind === 'bark' && plan.volley && Math.random() < plan.volley && has(bank, who, 'volley')) { list.push('volley'); count = Math.max(1, count - 2); }
    for (let i = 0; i < count; i++) list.push(st.kind);
    list.forEach((kind, i) => {
      const id = pick(bank, who, kind, v, plan.sharp && kind === 'bark');
      if (!id) return;
      const bend = (st.rate || 1) * v.pitch, c = bank.clips.get(id), rate = bend * Math.pow(2, rand(-0.5, 0.5) / 12);
      const full = c.buf.duration - c.lead, len = Math.min(st.len || 99, full), dur = len / rate;
      const src = ctx.createBufferSource();
      src.buffer = c.buf; src.playbackRate.value = rate;
      const g = a.gain(0), gv = (st.gain ?? 1) * rand(0.88, 1);
      g.gain.setValueAtTime(gv, at);
      if (len < full) { g.gain.setValueAtTime(gv, at + Math.max(0, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, at + dur); }
      src.connect(g).connect(tilt);
      if (layer) g.connect(layer);
      src.start(at, c.lead); src.stop(at + dur + 0.01);
      end = Math.max(end, at + dur);
      ids.push(id); rates.push(+rate.toFixed(4)); bends.push(+bend.toFixed(4));
      if (kind === plan.kind || (kind === 'volley' && plan.kind === 'bark')) n += kind === 'volley' ? 2 : 1;
      at += i < list.length - 1 ? Math.max((st.gap || 0.3) / v.speed * rand(0.85, 1.15), dur * (kind === 'volley' ? 1.05 : 0.9)) : dur;
    });
    at = Math.max(at, end) + 0.06;
  }
  return { end: end + 0.05, n, ids, rates, bends };
}

// ------------------------------------------------------------------ the voice
// Schedules `who` saying `text` in `mood` into `out` from time t. A step whose clips haven't loaded is skipped. With nothing
// to play the dog is quiet this time (real: false). voice: slider values for this call (the editor's preview), else the saved ones.
// Returns { mood, kind, n, end, real, ids, rates, bends } (end: the context time it's all over).
export function playDogVoice(a, out, t, who, text = '', mood = null, voice = null) {
  const s = String(text).toLowerCase();
  who = who === 'dax' || who === 'molly' ? who : 'nala';   // (molly: Nala's kind of plans, her own clips and rates)
  if (!DOG_MOODS.includes(mood)) mood = dogMood(who, s);
  const v = voiceOf(who, voice), bank = BANKS.get(a.ctx);
  const plan = planFor(who, s, mood, (s.match(/bork|yap|woof|wuff/g) || []).length);
  if (bank && bank.clips.size) {
    const r = playReal(a, out, t, who, plan, v, bank);
    if (r.ids.length) return { mood, kind: plan.kind, n: Math.max(1, r.n), end: r.end, real: true, ids: r.ids, rates: r.rates, bends: r.bends };
  }
  return { mood, kind: plan.kind, n: 0, end: t, real: false, ids: [] };
}
