// AudioWorklet processors for voice chat (loaded with audioWorklet.addModule by voice.js; runs on the audio thread).
//
// 'vc-capture': the microphone in, 20 ms frames of 16 kHz mono out (posted to the main thread with their RMS). A
//   low-pass at 7 kHz, then an integrate-and-dump resampler, so any device rate (44.1, 48 kHz...) works.
// 'vc-play': one per voice you're hearing. A jitter buffer (starts after 60 ms, deeper on a jittery link, drains a backlog by
//   playing 4% fast and jumps ahead past 200 ms, so a hiccup never leaves a voice behind), a linear resampler from the frame's
//   rate to the device rate, and two cheap
//   effects driven by AudioParams: `breath` (running, climbing: a panting tremolo and breath noise riding the voice)
//   and `burble` (under water: wobble and bubbles; the low-pass is a BiquadFilter after this node).

class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.fill = 0; this.acc = 0;
    this.frame = new Float32Array(320); this.n = 0;
    // biquad low-pass at 7 kHz (RBJ cookbook, Q 0.707)
    const w = 2 * Math.PI * Math.min(7000, sampleRate * 0.45) / sampleRate, al = Math.sin(w) / (2 * 0.7071), c = Math.cos(w), a0 = 1 + al;
    this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = this.b0; this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    this.on = true;
    this.port.onmessage = e => { if (e.data && 'on' in e.data) this.on = !!e.data.on; };
  }
  emit(v) {
    this.frame[this.n++] = v;
    if (this.n < 320) return;
    let e = 0;
    for (let i = 0; i < 320; i++) e += this.frame[i] * this.frame[i];
    const pcm = this.frame;
    this.port.postMessage({ pcm, rms: Math.sqrt(e / 320), t: currentTime }, [pcm.buffer]);
    this.frame = new Float32Array(320); this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !this.on) return true;
    const r = this.ratio;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
      let w = 1;
      while (this.fill + w >= r) { const take = r - this.fill; this.acc += y * take; this.emit(this.acc / r); this.acc = 0; this.fill = 0; w -= take; }
      this.acc += y * w; this.fill += w;
    }
    return true;
  }
}

const RING = 1 << 16; // samples of the source rate (1.3 s at 48 kHz)
class Play extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'breath', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'burble', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.ring = new Float32Array(RING);
    this.w = 0; this.r = 0;          // write index (integer samples written) and read position (fractional)
    this.rate = 16000;
    this.playing = false;
    this.last = 0; this.env = 0; this.ph = 0; this.ph2 = 0; this.hp = 0; this.nz = 1;
    this.under = 0;                  // underruns (tests read them)
    this.fast = false;               // catching up after a burst
    // adaptive start-up depth: 60 ms, +20 ms each time the voice ran dry mid-sentence (data came back within 150 ms, so
    // it was the network, not a pause), up to 160 ms; it eases back down 5 ms a second while the voice flows
    this.target = 0.06; this.dryAt = -1; this.jitter = 0;
    this.port.onmessage = e => {
      const d = e.data;
      if (d.pcm) {
        if (d.rate && d.rate !== this.rate) { this.rate = d.rate; this.w = 0; this.r = 0; this.playing = false; }
        const p = d.pcm;
        for (let i = 0; i < p.length; i++) this.ring[(this.w + i) & (RING - 1)] = p[i];
        this.w += p.length;
        if (this.dryAt >= 0) { if (currentTime - this.dryAt < 0.15) { this.target = Math.min(0.16, this.target + 0.02); this.jitter++; } this.dryAt = -1; }
        // never more than ~200 ms behind: skip ahead to 100 ms (a hiccup on the network, a tab that slept)
        if (this.w - this.r > this.rate * 0.2) this.r = this.w - this.rate * 0.1;
      } else if (d.stats) this.port.postMessage({ stats: { buffered: (this.w - this.r) / this.rate, under: this.under, jitter: this.jitter, target: this.target, playing: this.playing } });
    };
  }
  process(inputs, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const buffered = this.w - this.r;
    if (!this.playing && buffered >= this.rate * this.target) this.playing = true;
    if (this.playing && this.target > 0.06) this.target = Math.max(0.06, this.target - 0.005 * out.length / sampleRate);
    const hi = this.rate * (this.target + 0.04), lo = this.rate * (this.target + 0.01);
    const step = this.rate / sampleRate;
    const breath = params.breath[0], burble = params.burble[0];
    const ring = this.ring, M = RING - 1;
    for (let i = 0; i < out.length; i++) {
      let x;
      if (this.playing && this.w - this.r > 1) {
        const i0 = Math.floor(this.r), f = this.r - i0;
        x = ring[i0 & M] * (1 - f) + ring[(i0 + 1) & M] * f;
        let s = step;
        // after a burst (a busy main thread, a TCP hiccup) more than target + 40 ms waits: play 4% fast until it drains,
        // so the delay does not stay high for the rest of the sentence (a 4% pitch lift is hard to hear)
        const ahead = this.w - this.r;
        if (ahead > hi) this.fast = true; else if (ahead < lo) this.fast = false;
        if (this.fast) s *= 1.04;
        if (burble > 0) s *= 1 + 0.04 * burble * Math.sin(this.ph2); // a watery wobble in pitch
        this.r += s;
      } else {
        if (this.playing) { this.playing = false; this.under++; this.dryAt = currentTime; }
        x = this.last * 0.995; // fade out instead of clicking
      }
      this.last = x;
      if (breath > 0 || burble > 0) {
        const a = x < 0 ? -x : x;
        this.env += (a - this.env) * (a > this.env ? 0.02 : 0.0015);
        this.ph += 2 * Math.PI * 2.7 / sampleRate; if (this.ph > 6.283) this.ph -= 6.283;
        this.ph2 += 2 * Math.PI * 6 / sampleRate; if (this.ph2 > 6.283) this.ph2 -= 6.283;
        if (breath > 0) {
          this.nz = (this.nz * 16807) % 2147483647;
          const n = this.nz / 1073741823.5 - 1;
          this.hp += (n - this.hp) * 0.25;           // keep the hiss up high (n - low-passed n)
          const pant = 0.5 + 0.5 * Math.sin(this.ph);
          x = x * (1 - 0.35 * breath * pant) + (n - this.hp) * this.env * breath * (0.6 + 0.8 * pant);
        }
        if (burble > 0) x *= 1 - 0.55 * burble * (0.5 + 0.5 * Math.sin(this.ph2 * 1.9 + Math.sin(this.ph * 3)));
      }
      out[i] = x;
    }
    return true;
  }
}

registerProcessor('vc-capture', Capture);
registerProcessor('vc-play', Play);
