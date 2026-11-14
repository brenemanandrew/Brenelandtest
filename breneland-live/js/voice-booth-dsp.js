// The voice booth's sound maths (public/voice-booth.html): no imports, so tools/voice-booth-test.mjs loads it into Node too
// (harness.mjs clientModule).
//   resample(x, inRate, outRate)      windowed-sinc (Blackman, 32 zero crossings): the mic's 44.1 / 48 kHz down to 24 kHz
//                                     without aliasing (passes to about 9.7 kHz, stops by 11.9 kHz)
//   analyse(x, rate, { words, clipped })  levels, the noise floor, where the speech starts and ends, and the kind checks
//   trimTake(x, a)                    the take between a.start and a.end with 5 ms fades (no clicks)
//   wavBytes(x, rate)                 a 16-bit mono PCM WAV (44-byte header) as a Uint8Array
//   countClipped(x)                   samples at full scale (on the mic's own samples, before resampling)
//   parseWav(bytes)                   { rate, channels, bits, samples: Float32Array } or null (the tests, the playback of a kept take)

export const RATE = 24000;
const db = v => (v > 1e-10 ? 20 * Math.log10(v) : -200);

// ---------------------------------------------------------------- resampling
const RES = 128;                                // kernel table steps per input sample
const kernels = new Map();
function kernel(inRate, outRate) {
  const key = inRate + '/' + outRate;
  if (kernels.has(key)) return kernels.get(key);
  const fc = 0.45 * Math.min(inRate, outRate) / inRate;   // cutoff, cycles per input sample (0.45 of the lower Nyquist x2 = 10.8 kHz at 24 kHz)
  const half = Math.ceil(16 / fc);                         // 32 zero crossings over the whole kernel
  const tab = new Float32Array(half * RES + 2);
  for (let j = 0; j < tab.length; j++) {
    const d = j / RES, u = d / half;
    if (u >= 1) { tab[j] = 0; continue; }
    const s = d === 0 ? 1 : Math.sin(2 * Math.PI * fc * d) / (2 * Math.PI * fc * d);
    const w = 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u);
    tab[j] = 2 * fc * s * w;
  }
  const k = { half, tab };
  kernels.set(key, k);
  return k;
}
export function resample(x, inRate, outRate = RATE) {
  if (inRate === outRate) return Float32Array.from(x);
  const { half, tab } = kernel(inRate, outRate);
  const step = inRate / outRate, n = Math.floor(x.length / step), out = new Float32Array(n), N = x.length;
  for (let i = 0; i < n; i++) {
    const t = i * step;
    let k = Math.ceil(t - half); if (k < 0) k = 0;
    const kEnd = Math.min(N - 1, Math.floor(t + half));
    let s = 0;
    for (; k <= kEnd; k++) {
      const p = Math.abs(t - k) * RES, j = p | 0, f = p - j;
      s += x[k] * (tab[j] + (tab[j + 1] - tab[j]) * f);
    }
    out[i] = s;
  }
  return out;
}

// ---------------------------------------------------------------- the checks
export function countClipped(x) {
  let n = 0;
  for (let i = 0; i < x.length; i++) if (x[i] >= 0.999 || x[i] <= -0.999) n++;
  return n;
}

// The take, measured in 20 ms frames:
//   noise    the noise floor (the 10th percentile of the frames, dBFS): hum, a fan, the room
//   speech   the active speech level (the RMS of the frames above the voice threshold, dBFS)
//   peak     the loudest sample (dBFS)
//   start, end   the speech with a little air either side (samples); trimmed = the quiet cut off the ends (s)
//   voiced   seconds above the threshold; dur = the trimmed take's length (s)
//   checks   [{ id, level: 'bad' | 'warn' | 'info' | 'good', text }], kindly worded, the worst first
export const LIMITS = {
  silent: -52,      // no frame of speech louder than this: nothing heard
  quiet: -36,       // the speech level below this, or
  quietPeak: -20,   // the peak below this: too quiet
  clipped: 3,       // this many full-scale samples: it clipped
  noise: -52,       // a noise floor above this: some background noise
  noisy: -42,       // above this: a noisy room
  trimNote: 0.3,    // more quiet than this cut from the ends: say so
  perWord: 0.17,    // a take shorter than this many seconds a word (faster than about 350 words a minute) seems cut off
};
export function analyse(x, rate = RATE, { words = 0, clipped = 0 } = {}) {
  const F = Math.round(rate * 0.02), nF = Math.floor(x.length / F);
  const fr = new Float32Array(nF);
  let peak = 0;
  for (let f = 0; f < nF; f++) {
    let e = 0;
    for (let i = f * F, end = i + F; i < end; i++) { const v = x[i]; e += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    fr[f] = db(Math.sqrt(e / F));
  }
  const sorted = Array.from(fr).sort((a, b) => a - b);
  const noise = nF ? Math.max(-100, sorted[Math.floor(nF * 0.1)]) : -100;
  const thr = Math.max(LIMITS.silent, noise + 10);
  // speech = frames over the threshold that come in runs of two or more (a lone click is not speech)
  let first = -1, last = -1, voicedF = 0, eV = 0;
  for (let f = 0; f < nF; f++) {
    const on = fr[f] > thr && ((f > 0 && fr[f - 1] > thr) || (f + 1 < nF && fr[f + 1] > thr));
    if (!on) continue;
    if (first < 0) first = f;
    last = f; voicedF++; eV += Math.pow(10, fr[f] / 10);
  }
  const silent = first < 0;
  const start = silent ? 0 : Math.max(0, first * F - Math.round(rate * 0.15));
  const end = silent ? x.length : Math.min(x.length, (last + 1) * F + Math.round(rate * 0.25));
  const speech = voicedF ? 10 * Math.log10(eV / voicedF) : -100;
  const voiced = voicedF * 0.02, dur = (end - start) / rate, trimmed = (x.length - (end - start)) / rate;
  const checks = [];
  if (silent) checks.push({ id: 'silent', level: 'bad', text: "I didn't hear anything. Is the right mic picked, and is it unmuted?" });
  else if (speech < LIMITS.quiet || db(peak) < LIMITS.quietPeak) checks.push({ id: 'quiet', level: 'bad', text: 'A bit quiet. Move a little closer or turn the mic up.' });
  if (clipped >= LIMITS.clipped) checks.push({ id: 'clipped', level: 'bad', text: 'That one clipped (too loud for the mic). Lean back a little or turn the mic down.' });
  if (!silent && words && dur < words * LIMITS.perWord) checks.push({ id: 'short', level: 'bad', text: 'That seems short for this line. Did the end get cut off?' });
  if (noise > LIMITS.noisy) checks.push({ id: 'noisy', level: 'bad', text: 'Lots of background noise. A quieter room (or turning off a fan) will help a lot.' });
  else if (noise > LIMITS.noise) checks.push({ id: 'noise', level: 'warn', text: 'A little background noise (a hum or a fan?). A quieter spot helps.' });
  if (!silent && trimmed > LIMITS.trimNote) checks.push({ id: 'trimmed', level: 'info', text: `Trimmed ${trimmed.toFixed(1)} s of quiet from the ends.` });
  if (!checks.some(c => c.level === 'bad' || c.level === 'warn')) checks.unshift({ id: 'good', level: 'good', text: 'Sounds great!' });
  const r1 = v => Math.round(v * 10) / 10;
  return { noise: r1(noise), speech: r1(speech), peak: r1(db(peak)), thr: r1(thr), start, end, trimmed: Math.round(trimmed * 100) / 100,
    voiced: Math.round(voiced * 100) / 100, dur: Math.round(dur * 100) / 100, clipped, silent, checks };
}

export function trimTake(x, a, rate = RATE) {
  const out = x.slice(a.start, a.end), fade = Math.min(Math.round(rate * 0.005), out.length >> 1);
  for (let i = 0; i < fade; i++) { const g = i / fade; out[i] *= g; out[out.length - 1 - i] *= g; }
  return out;
}

// ---------------------------------------------------------------- WAV
export function wavBytes(x, rate = RATE) {
  const n = x.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, Math.round(s < 0 ? s * 32768 : s * 32767), true); }
  return new Uint8Array(buf);
}
export function parseWav(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const tag = o => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);
  if (u.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let o = 12, fmt = null, data = null;
  while (o + 8 <= u.length) {
    const id = tag(o), len = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') { data = { at: o + 8, len: Math.min(len, u.length - o - 8) }; break; }
    o += 8 + len + (len & 1);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) return fmt && data ? { ...fmt, samples: null } : null;
  const n = Math.floor(data.len / 2 / fmt.channels), samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = v.getInt16(data.at + i * 2 * fmt.channels, true) / 32768;
  return { ...fmt, samples };
}
