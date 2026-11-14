// The voice booth's capture (public/js/voice-booth.js): an AudioWorklet that hands the mic's raw samples to the
// page while recording (uncompressed, at the AudioContext's own rate, mono; the page resamples to 24 kHz) and the level for
// the meter all the time.
//   port <- 'start' | 'stop'
//   port -> { lvl: [peak, rms] } about every 1024 samples; { pcm: Float32Array } chunks while recording; { done: true } after 'stop'
class BoothCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.buf = new Float32Array(4096); this.n = 0;
    this.peak = 0; this.sum = 0; this.cnt = 0;
    this.port.onmessage = e => {
      if (e.data === 'start') { this.on = true; this.n = 0; }
      else if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage({ done: true }); }
    };
  }
  flush() {
    if (!this.n) return;
    const out = this.buf.slice(0, this.n);
    this.port.postMessage({ pcm: out }, [out.buffer]);
    this.n = 0;
  }
  process(inputs) {
    const chans = inputs[0];
    if (!chans || !chans.length) return true;
    const a = chans[0], b = chans.length > 1 ? chans[1] : null, len = a.length;
    for (let i = 0; i < len; i++) {
      const v = b ? (a[i] + b[i]) * 0.5 : a[i];
      const m = v < 0 ? -v : v;
      if (m > this.peak) this.peak = m;
      this.sum += v * v;
      if (this.on) { this.buf[this.n++] = v; if (this.n === this.buf.length) this.flush(); }
    }
    this.cnt += len;
    if (this.cnt >= 1024) {
      this.port.postMessage({ lvl: [this.peak, Math.sqrt(this.sum / this.cnt)], frames: this.cnt });
      this.peak = 0; this.sum = 0; this.cnt = 0;
    }
    return true;
  }
}
registerProcessor('booth-capture', BoothCapture);
