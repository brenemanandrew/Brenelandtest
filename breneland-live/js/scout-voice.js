// The cub scouts' giggles, laughs and chortles: short clips cut from real recordings of children laughing
// (public/audio/scouts, scout-clips.js; credits in docs/audio-credits.md and Settings > Sound). Nothing is fetched until the
// sound is on and you come near the woods (scouts.js calls loadScoutBank then). Each play picks a clip of the kind, never
// the one that played last, bends it a little (the scout's own pitch and up to half a semitone of chance) and plays it on
// the voices bus through atVoice (falloff and panning as every voice) with the 45 m cut-off. Sound is local: Math.random
// is fine here (nothing about where a scout is depends on it).
import { CLIPS, CLIP_BASE } from './scout-clips.js';

export const SCOUT_KINDS = ['giggle', 'laugh', 'chortle'];
// each kind's level into atVoice (measured: tools/audio-levels.mjs keeps every clip at 3 m under the voices' ceiling,
// tools/w1-scouts-test.mjs the same); a hiding giggle is the quietest
export const LEVEL = { giggle: 0.6, laugh: 0.6, chortle: 0.55 };
export const CUTOFF = 45;
export const clipIds = (kind = null) => Object.keys(CLIPS).filter(id => !kind || CLIPS[id].kind === kind);

const BANKS = new WeakMap();
export const bankOf = ctx => BANKS.get(ctx) || null;
function decodeClip(ctx, ab) {
  return new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
}
/** Fetch and decode the bank once per AudioContext. Resolves to { clips: Map(id -> AudioBuffer), failed: Set, done }. */
export function loadScoutBank(ctx, { ids = clipIds(), base = CLIP_BASE, fetchFn = u => fetch(u), decodeFn = ab => decodeClip(ctx, ab) } = {}) {
  let bank = BANKS.get(ctx);
  if (bank) return bank.loading;
  BANKS.set(ctx, bank = { clips: new Map(), failed: new Set(), done: false, loading: null });
  bank.loading = Promise.all(ids.map(async id => {
    try {
      const r = await fetchFn(base + id + '.mp3');
      if (!r || !r.ok) throw new Error('http ' + (r && r.status));
      bank.clips.set(id, await decodeFn(await r.arrayBuffer(), id));
    } catch { bank.failed.add(id); }
  })).then(() => { bank.done = true; return bank; });
  return bank.loading;
}

const LAST = {};   // kind -> the clip played last
/** A clip id of `kind` that has loaded, never the last one of that kind (when there is a choice). */
export function pickClip(bank, kind, rnd = Math.random) {
  const ids = clipIds(kind).filter(id => bank.clips.has(id));
  if (!ids.length) return null;
  const pool = ids.length > 1 ? ids.filter(id => id !== LAST[kind]) : ids;
  const id = pool[Math.floor(rnd() * pool.length) % pool.length];
  LAST[kind] = id;
  return id;
}

/** Play one clip of `kind` at (x, y, z). rate: the scout's pitch (x playbackRate), rnd: the chance source (pick, detune).
 *  Returns { id, kind, rate, end } or null (no context, too far, or the bank has no clip of that kind yet: the caller decides). */
export function playScoutVoice(a, x, y, z, kind, { rate = 1, rnd = Math.random, id: force = null } = {}) {
  if (!a || !a.ctx || !a.voices) return null;
  if (a.listener && Math.hypot(x - a.listener.x, z - a.listener.z) > CUTOFF) return null;
  const bank = BANKS.get(a.ctx);
  if (!bank) return null;
  const id = force && bank.clips.has(force) ? force : pickClip(bank, kind, rnd);   // (id: a given clip, for the level tests)
  if (!id) return null;
  const ctx = a.ctx, t = ctx.currentTime + 0.02, buf = bank.clips.get(id);
  const r = rate * Math.pow(2, (rnd() - 0.5) / 12);   // up to half a semitone either way
  const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = r;
  const out = a.gain(LEVEL[kind] || 0.5);
  src.connect(out); out.connect(a.atVoice(x, y, z));
  src.onended = () => { try { src.disconnect(); out.disconnect(); } catch { /* gone */ } };
  src.start(t);
  return { id, kind, rate: r, end: t + buf.duration / r };
}
