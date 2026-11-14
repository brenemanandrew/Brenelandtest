// The instruments the music plays: recorded notes from open sample libraries (public/audio/inst, catalogued in music-samples.js,
// cut by tools/music-lofi-samples.mjs, credits in docs/audio-credits.md). A few notes per instrument across its range, pitch-shifted
// to the note asked for, two velocity layers where it matters, round-robins for repeated hits. Bowed and blown ones hold on a
// cross-faded loop.
//
// Loading is lazy: nothing is fetched before the sound is on, and then only what the song about to play needs (music.js asks when a
// place's song is due). An instrument nobody's played for a while is let go. If one fails to load, music-band.js plays that part
// on its synthesised voice instead, so a song never goes missing.
//   const bank = instBank(ctx)                one per sample rate (an AudioBuffer plays in any context of that rate)
//   bank.load(['piano', 'vibes'], { fetchFn, decodeFn })   -> Promise (settles when each is loaded or failed)
//   bank.has(id), bank.settled(ids), bank.play(inst, out, t, n, dur, vel) -> bool, bank.drum(piece, out, t, vel) -> bool
//   bank.trim(keepIds, olderThan), bank.state()
// Decoded at 22.05 kHz where the browser allows it (an OfflineAudioContext at that rate decodes without resampling up), so a
// place's set takes about half the memory it would at 48 kHz.
import { INST_BASE, INST_SAMPLES } from './music-samples.js';

export const INSTRUMENTS = Object.keys(INST_SAMPLES);
// the pieces of the kit a song's drum patterns name that have no sample of their own: played on another, pitched and softer
const ALIAS = { tick: ['click', 1.7, 0.5], tock: ['clicklo', 1.35, 0.55], chipnoise: ['snare', 1, 0.8], sweep: ['sweep', 1, 1],
  boom: ['kick', 0.72, 1.15], tom: ['kick', 1.5, 0.8], heart: ['kick', 0.8, 0.75] };   // the war drum, the hand drum, a heartbeat
const BANKS = new Map();
// the louder recording (piano, vibes, marimba) only for accented notes: incidental music stays on the soft layer
export const LOUD_LAYER = 0.88;
const dbGain = db => Math.pow(10, db / 20);

/** the onset rule tools/music-lofi-samples.mjs measured each file with: the first sample at 5% of the loudest in the first 1.5 s */
export function onsetOf(buf) {
  const x = buf.getChannelData(0), sr = buf.sampleRate, n = Math.min(x.length, Math.floor(sr * 1.5));
  let pk = 0; for (let i = 0; i < n; i++) { const a = x[i] < 0 ? -x[i] : x[i]; if (a > pk) pk = a; }
  const th = pk * 0.05; for (let i = 0; i < n; i++) if ((x[i] < 0 ? -x[i] : x[i]) >= th) return i / sr;
  return 0;
}

export function instBank(ctx) {
  const key = ctx.sampleRate;
  if (BANKS.has(key)) return BANKS.get(key);
  let decoder = null;
  const decoderCtx = () => {
    if (decoder) return decoder;
    try { decoder = new OfflineAudioContext(1, 1, 22050); } catch { decoder = ctx; }
    return decoder;
  };
  const inst = {};          // id -> { zones: [{ ...zone, buf, off }], layers, rrAt: {}, lastUsed, failed }
  const loading = {};       // id -> Promise
  let fetched = 0, bytes = 0, failedFiles = 0;
  const decode = ab => new Promise((res, rej) => { const d = decoderCtx(); const p = d.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });

  async function loadOne(id, fetchFn, decodeFn) {
    const C = INST_SAMPLES[id];
    if (!C) { inst[id] = { failed: true, zones: [] }; return; }
    const zones = [];
    await Promise.all(C.zones.map(async z => {
      try {
        const r = await (fetchFn || fetch)(INST_BASE + z.f);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ab = await r.arrayBuffer();
        fetched++; bytes += ab.byteLength;
        const buf = await (decodeFn ? decodeFn(ab, z.f) : decode(ab));
        // the decoder may add its own silence in front (MP3's priming): where the attack really is, against where it was cut
        const off = Math.max(0, Math.min(0.12, onsetOf(buf) - z.on));
        zones.push({ ...z, buf, off });
      } catch (err) { failedFiles++; }
    }));
    // usable when most of its notes arrived (a missing note is played from its neighbour)
    const ok = zones.length >= Math.ceil(C.zones.length * 0.6);
    zones.sort((a, b) => (a.root ?? 0) - (b.root ?? 0));
    inst[id] = { failed: !ok, zones: ok ? zones : [], layers: Math.max(...C.zones.map(z => z.layer)) + 1, rrAt: {}, lastUsed: 0, lvl: dbGain(C.lvl || 0), damp: C.damp ?? 0.15, kind: C.kind };
  }

  // the zone for a note: its velocity layer, the nearest root, the next round-robin
  function zoneFor(I, n, vel) {
    const layer = I.layers > 1 && vel > LOUD_LAYER ? 1 : 0;
    let best = null, bd = Infinity;
    for (const z of I.zones) { if (z.layer !== layer && I.layers > 1) continue; const d = Math.abs(z.root - n) + (z.root < n ? 0.01 : 0); if (d < bd) { bd = d; best = z; } }
    if (!best) return I.zones[0];
    const same = I.zones.filter(z => z.root === best.root && z.layer === best.layer);
    if (same.length > 1) { const k = (I.rrAt[best.root] = ((I.rrAt[best.root] ?? -1) + 1) % same.length); return same[k]; }
    return best;
  }
  const done = (src, ...nodes) => { src.onended = () => { for (const x of nodes) { try { x.disconnect(); } catch { /* gone */ } } }; };

  const bank = {
    sampleRate: key,
    load(ids, { fetchFn = null, decodeFn = null } = {}) {
      return Promise.all(ids.filter(id => INST_SAMPLES[id]).map(id => {
        if (inst[id] && !inst[id].failed) return null;
        if (!loading[id]) loading[id] = loadOne(id, fetchFn, decodeFn).catch(() => { inst[id] = { failed: true, zones: [] }; }).finally(() => { delete loading[id]; });
        return loading[id];
      }));
    },
    has(id) { return !!(inst[id] && !inst[id].failed); },
    /** every one of these has loaded or failed (or has no samples at all) */
    settled(ids) { return ids.every(id => !INST_SAMPLES[id] || (inst[id] && !loading[id])); },
    failed(id) { return !!(inst[id] && inst[id].failed); },
    /** a note: false when the instrument has no loaded samples (the band plays its synthesised voice) */
    play(id, out, t, n, dur, vel, o = {}) {
      const I = inst[id];
      if (!I || I.failed || !I.zones.length) return false;
      const c = out.context, z = zoneFor(I, n, vel);
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = z.buf;
      s.playbackRate.value = Math.pow(2, (n - z.root) / 12) * (o.detune || 1);
      const rate = s.playbackRate.value, v = I.lvl * Math.pow(Math.max(0.05, vel), I.layers > 1 ? 1.2 : 1.5) * (o.gain ?? 1);
      const left = (z.buf.duration - z.off) / rate;   // seconds of sound in the file at this pitch
      let end;
      g.gain.setValueAtTime(v, t);
      if (I.kind === 'hold' && z.loop && dur > z.loop[0] / rate * 0.9) {
        s.loop = true; s.loopStart = z.loop[0] + z.off; s.loopEnd = z.loop[1] + z.off;
        g.gain.setTargetAtTime(0, t + dur, I.damp / 3); end = t + dur + I.damp * 2.5;
      } else if (I.kind === 'hit') { end = t + left; }
      else {
        const ring = I.kind === 'hold' ? dur : Math.max(dur, o.ring ?? 0);   // a struck note sounds on through its value, damped then
        if (ring < left) { g.gain.setTargetAtTime(0, t + ring, I.damp / 3); end = t + Math.min(left, ring + I.damp * 2.5); }
        else end = t + left;
      }
      s.connect(g).connect(out);
      s.start(t, z.off + (o.offset || 0));
      s.stop(end + 0.02);
      done(s, s, g);
      I.lastUsed = c.currentTime;
      return true;
    },
    /** a piece of the soft kit (brush, shaker, click...): false when it has no sample */
    drum(piece, out, t, vel) {
      const I = inst.drums;
      if (!I || I.failed) return false;
      const [p, rate, k] = ALIAS[piece] || [piece, 1, 1];
      const zs = I.zones.filter(z => z.piece === p);
      if (!zs.length) return false;
      const i = (I.rrAt[p] = ((I.rrAt[p] ?? -1) + 1) % zs.length), z = zs[i], c = out.context;
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = z.buf; s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.03);
      g.gain.value = I.lvl * k * Math.pow(Math.max(0.05, vel), 1.4);
      s.connect(g).connect(out); s.start(t, z.off); s.stop(t + (z.buf.duration - z.off) / rate + 0.02);
      done(s, s, g);
      I.lastUsed = c.currentTime;
      return true;
    },
    /** let go of the instruments not in `keep` that nobody has played for `olderThan` seconds (memory on phones) */
    trim(keep, olderThan = 300, now = ctx.currentTime) {
      const k = new Set(keep), gone = [];
      for (const id of Object.keys(inst)) if (!k.has(id) && !inst[id].failed && now - inst[id].lastUsed > olderThan) { delete inst[id]; gone.push(id); }
      return gone;
    },
    state() {
      const loaded = Object.keys(inst).filter(id => !inst[id].failed), failed = Object.keys(inst).filter(id => inst[id].failed);
      const secs = loaded.reduce((a, id) => a + inst[id].zones.reduce((p, z) => p + z.buf.duration, 0), 0);
      return { loaded, failed, loading: Object.keys(loading), fetched, bytes, failedFiles, decodedSeconds: +secs.toFixed(1), decodedMB: +(loaded.reduce((a, id) => a + inst[id].zones.reduce((p, z) => p + z.buf.length * 4, 0), 0) / 1048576).toFixed(1), rate: decoder ? decoder.sampleRate : null };
    },
    _inst: inst,
  };
  BANKS.set(key, bank);
  return bank;
}
/** forget every bank (tests) */
export function resetInstBanks() { BANKS.clear(); }
