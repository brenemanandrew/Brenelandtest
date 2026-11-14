// Voice chat wire format and the fallback codec (no imports, so the tests load it straight into Node).
//
// Frames are 20 ms of 16 kHz mono (320 samples). The relay (lib/voice.js) sees:
//   client -> server: [MAGIC, flags, seq lo, seq hi, payload...]
//   server -> client: [MAGIC, flags, seq lo, seq hi, sid u32 LE, payload...]
// flags bits 0-1 = codec (CODEC.opus 0, CODEC.adpcm 1), bit 2 = loud (a shout: the relay sends it further).
//
// Opus (WebCodecs AudioEncoder / AudioDecoder) is the normal codec, about 20 kbps. Browsers without WebCodecs audio
// (Safari before 26, old Firefox) use IMA ADPCM: 4 bits a sample, 64 kbps, a few adds and shifts per sample, every
// frame self-contained (the predictor travels in a 3-byte header) so a lost frame never garbles the next.
export const MAGIC = 0x56;
export const CODEC = { opus: 0, adpcm: 1 };
export const CODEC_MASK = 0x03, F_LOUD = 0x04;
export const RATE = 16000, FRAME = 320, FRAME_MS = 20;
export const ADPCM_BYTES = 3 + FRAME / 2;

const STEPS = new Int16Array([
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
  1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
  7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
]);
const IDX = new Int8Array([-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]);

// state = { pred, idx } carries across frames (and is written into each frame's header). Returns `out`.
export function adpcmEncode(pcm, state, out = new Uint8Array(3 + (pcm.length >> 1))) {
  let pred = state.pred | 0, idx = state.idx | 0;
  out[0] = pred & 0xff; out[1] = (pred >> 8) & 0xff; out[2] = idx;
  for (let i = 0; i < pcm.length; i++) {
    let s = Math.round(pcm[i] * 32767);
    s = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
    let diff = s - pred, nib = 0, step = STEPS[idx];
    if (diff < 0) { nib = 8; diff = -diff; }
    let vp = step >> 3;
    if (diff >= step) { nib |= 4; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { nib |= 2; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { nib |= 1; vp += step; }
    pred += nib & 8 ? -vp : vp;
    pred = pred > 32767 ? 32767 : pred < -32768 ? -32768 : pred;
    idx += IDX[nib]; idx = idx < 0 ? 0 : idx > 88 ? 88 : idx;
    if (i & 1) out[3 + (i >> 1)] |= nib << 4; else out[3 + (i >> 1)] = nib;
  }
  state.pred = pred; state.idx = idx;
  return out;
}

// bytes (a Uint8Array view of one frame's payload) -> Float32Array of samples (-1..1)
export function adpcmDecode(bytes, out = new Float32Array((bytes.length - 3) * 2)) {
  let pred = (bytes[0] | (bytes[1] << 8)) << 16 >> 16, idx = Math.min(88, bytes[2]);
  const n = Math.min(out.length, (bytes.length - 3) * 2);
  for (let i = 0; i < n; i++) {
    const b = bytes[3 + (i >> 1)], nib = i & 1 ? b >> 4 : b & 15;
    const step = STEPS[idx];
    let vp = step >> 3;
    if (nib & 4) vp += step;
    if (nib & 2) vp += step >> 1;
    if (nib & 1) vp += step >> 2;
    pred += nib & 8 ? -vp : vp;
    pred = pred > 32767 ? 32767 : pred < -32768 ? -32768 : pred;
    idx += IDX[nib]; idx = idx < 0 ? 0 : idx > 88 ? 88 : idx;
    out[i] = pred / 32768;
  }
  return out;
}

// client -> server frame
export function packFrame(flags, seq, payload) {
  const out = new Uint8Array(4 + payload.length);
  out[0] = MAGIC; out[1] = flags; out[2] = seq & 0xff; out[3] = (seq >> 8) & 0xff;
  out.set(payload, 4);
  return out;
}
// server -> client frame -> { flags, codec, loud, seq, sid, payload } or null
export function unpackFrame(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u.length < 9 || u[0] !== MAGIC) return null;
  const flags = u[1];
  return {
    flags, codec: flags & CODEC_MASK, loud: !!(flags & F_LOUD), seq: u[2] | (u[3] << 8),
    sid: (u[4] | (u[5] << 8) | (u[6] << 16) | (u[7] << 24)) >>> 0, payload: u.subarray(8),
  };
}

// 0..1 level from an RMS (the mouths and the meter): -50 dBFS is shut, -15 wide open
export function levelOf(rms) {
  const db = 20 * Math.log10(rms + 1e-9);
  return db <= -50 ? 0 : db >= -15 ? 1 : (db + 50) / 35;
}
export const dbOf = rms => 20 * Math.log10(rms + 1e-9);
