// The real sound effects: short clips cut from open-source packs (public/audio/sfx, catalogued in sfx-clips.js, credits in
// docs/audio-credits.md), played for the game's sounds as sfx-map.js says. The bank is fetched and decoded once per
// AudioContext, only once the sound is on (AudioEngine.start -> loadSfx, a moment after the click), like the dogs' clips. Until
// it has loaded, and for any sound whose clips failed, the synthesised sound plays: audio.play(), ui(), door() and neigh() ask
// playSfx first (the footsteps are always synthesised) and fall back when it says no.
//
// Each play picks a clip (never the last one for that sound when there's a choice), detunes it a little and moves its level a
// little (sfx-map.js `jit`, `jitDb`), so a sound repeated quickly doesn't machine-gun. Positional sounds go through the same
// panners as the synth (a.at / a.atAmb / a.atVoice), so the distance falloff, HRTF and the buses (the sliders, the ambience
// duck, the master stage) all apply. Sound is local: Math.random is fine here.
import { CLIPS, CLIP_BASE } from './sfx-clips.js';
import { SFX_MAP, DEFAULTS, allClipIds } from './sfx-map.js';

const BANKS = new WeakMap();
export const sfxBankOf = ctx => (ctx && BANKS.get(ctx)) || null;
const dbGain = db => Math.pow(10, db / 20);

function decodeClip(ctx, ab, ms = 10000) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('decode timed out')), ms);
    const ok = b => { clearTimeout(timer); res(b); }, no = e => { clearTimeout(timer); rej(e); };
    const p = ctx.decodeAudioData(ab, ok, no);   // (the callback form for older Safari, the promise where there is one)
    if (p && typeof p.then === 'function') p.then(ok, no);
  });
}
// where the sound starts in this decode: MP3 decoders differ in how much encoder padding they leave in front
function leadOf(buf) {
  const x = buf.getChannelData(0), n = Math.min(x.length, Math.round(buf.sampleRate * 0.15));
  let pk = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v; }
  let i = 0;
  while (i < n && Math.abs(x[i]) < pk * 0.003) i++;
  return Math.max(0, i / buf.sampleRate - 0.001);
}

/** Fetch and decode the clips into ctx's bank (all the game's by default). Resolves with the bank
 *  { clips: Map(id -> { buf, lead }), failed: Set, done, plays: { name: n } }; a clip that fails is in `failed`. */
export function loadSfxBank(ctx, { ids = allClipIds(), base = CLIP_BASE, fetchFn = u => fetch(u), decodeFn = ab => decodeClip(ctx, ab) } = {}) {
  let bank = BANKS.get(ctx);
  if (!bank) BANKS.set(ctx, bank = { clips: new Map(), failed: new Set(), requested: new Set(), loading: Promise.resolve(), done: false, plays: {}, synth: {} });
  const todo = ids.filter(id => !bank.requested.has(id));
  for (const id of todo) bank.requested.add(id);
  const p = Promise.all(todo.map(async id => {
    try {
      const c = CLIPS[id];
      if (!c) throw new Error('no such clip');
      const r = await fetchFn(base + c.file);
      if (!r || !r.ok) throw new Error('http ' + (r && r.status));
      const buf = await decodeFn(await r.arrayBuffer(), id);
      bank.clips.set(id, { buf, lead: c.loop ? leadOf(buf) : Math.min(leadOf(buf), 0.08) });
    } catch { bank.failed.add(id); }
  }));
  bank.loading = Promise.all([bank.loading, p]).then(() => { bank.done = true; return bank; });
  return bank.loading;
}

const LAST = new Map();   // sound:layer -> the clip played last
function layersOf(name, opts) {
  let s = SFX_MAP[name];
  if (!s) return null;
  if (typeof s === 'function') s = s(opts || {});
  return [].concat(s).map(l => ({ ...DEFAULTS, ...l }));
}
function pickId(bank, key, ids) {
  const ok = ids.filter(id => bank.clips.has(id));
  if (!ok.length) return null;
  const pool = ok.length > 1 ? ok.filter(id => id !== LAST.get(key)) : ok;
  const id = pool[Math.floor(Math.random() * pool.length) % pool.length];
  LAST.set(key, id);
  return id;
}
/** True when every layer of `name` has at least one loaded clip (so playSfx would play it for real). */
export function hasSfx(a, name, opts) {
  const bank = a && sfxBankOf(a.ctx), layers = bank && layersOf(name, opts);
  return !!(layers && layers.every(l => l.ids.some(id => bank.clips.has(id))));
}

/** Play `name` from the bank: at (x, y, z) when x is a number, straight to its bus otherwise. Returns false (nothing
 *  played) when the sound has no clips here or they have not loaded or failed: the caller plays the synth then. */
export function playSfx(a, name, x, y, z, opts = {}) {
  if (!a || !a.ctx) return false;
  const bank = sfxBankOf(a.ctx);
  if (!bank) return false;
  const layers = layersOf(name, opts);
  if (!layers || !layers.every(l => l.ids.some(id => bank.clips.has(id)))) { if (layers) bank.synth[name] = (bank.synth[name] || 0) + 1; return false; }
  const ctx = a.ctx, t = ctx.currentTime + 0.005, pos = typeof x === 'number';
  // one output for the whole sound (a positional one has its own panner, freed after the longest layer)
  const busName = layers[0].bus || 'sfx';
  let out;
  if (pos) {
    const ref = layers[0].ref ?? 5, roll = layers[0].roll ?? 1.2;
    out = busName === 'amb' ? a.atAmb(x, y, z, ref, roll) : busName === 'voices' ? a.atVoice(x, y, z) : a.at(x, y, z, ref, roll);
  } else out = a[busName];
  let end = t;
  const ids = [], rates = [];
  layers.forEach((l, i) => {
    const id = pickId(bank, name + ':' + i, l.ids), c = bank.clips.get(id);
    end = Math.max(end, playBuffer(a, out, c, t + (l.at || 0), l, rates));
    ids.push(id);
  });
  bank.plays[name] = (bank.plays[name] || 0) + 1;
  a.lastSfx = { name, real: true, end, ids, rates };   // (what played: the tests read it)
  return true;
}

// one clip into `out` at t with a layer's rate / level / jitter / lowpass; returns when it ends
function playBuffer(a, out, c, t, l = {}, rates = null) {
  const ctx = a.ctx, src = ctx.createBufferSource();
  src.buffer = c.buf;
  const r0 = Array.isArray(l.rate) ? l.rate[0] + Math.random() * (l.rate[1] - l.rate[0]) : (l.rate ?? 1);
  const rate = r0 * Math.pow(2, ((Math.random() * 2 - 1) * (l.jit ?? 0)) / 12);
  src.playbackRate.value = rate;
  if (rates) rates.push(rate);
  const g = ctx.createGain();
  g.gain.value = dbGain((l.db ?? 0) + (Math.random() * 2 - 1) * (l.jitDb ?? 0)) * (l.gain ?? 1);
  let head = g;
  if (l.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = l.lp; f.Q.value = 0.7; f.connect(g); head = f; }
  src.connect(head); g.connect(out);
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* gone */ } };
  src.start(Math.max(t, ctx.currentTime), c.lead);
  return t + (c.buf.duration - c.lead) / rate;
}

/** One clip (a random one of `ids` that has loaded) into an existing node `out` (a table's soundscape, the boat's bus).
 *  layer: { db, rate, jit, jitDb, gain, lp }. Returns the end time, or 0 when none of the clips has loaded. */
export function playClipInto(a, out, ids, t, layer = {}, key = ids.join()) {
  const bank = a && sfxBankOf(a.ctx);
  if (!bank) return 0;
  const id = pickId(bank, key, [].concat(ids));
  if (!id) return 0;
  return playBuffer(a, out, bank.clips.get(id), t, { ...DEFAULTS, ...layer });
}

/** A looping source of a loop clip (the seam cross-faded by the cut tool), started at a random point, or null when the clip
 *  has not loaded. The caller connects, starts (src.start(when)) and stops it. */
export function loopSource(a, id) {
  const bank = a && sfxBankOf(a.ctx), c = bank && bank.clips.get(id);
  if (!c) return null;
  const src = a.ctx.createBufferSource(), dur = CLIPS[id]?.dur || c.buf.duration;
  src.buffer = c.buf; src.loop = true;
  src.loopStart = c.lead; src.loopEnd = Math.min(c.buf.duration, c.lead + dur);
  const start = src.start.bind(src), off = c.lead + Math.random() * (src.loopEnd - c.lead);
  src.start = (when = 0) => start(when, off);
  return src;
}
