// The DM's lines in Andrew's voice (dm-voice): clips made on the server (lib/dm-voice.js, Piper) played through the game's
// own mixer. dnd.js hands a DM line over with expect(); the server's { t: 'dnd-voice' } messages say whether clips are coming
// (go) and bring them one at a time (the tag first, then each sentence), and they are played back to back in order, line
// after line, on the Voices bus (the Voices and Master sliders, mute), through the back room's hearing: full in the room,
// quieter and muffled in the shop (more with the door open), nothing outside. A character's clip was made slower by its
// rate and plays that much faster: the DM's pace, the character's pitch. Whenever a clip doesn't come (no go in time, the
// server says no, a fetch or decode fails, a clip is late) the rest of that line is read by the browser's voice instead,
// silently. The bubble and the parchment follow the real playback (at()); the music ducks under it (duck / quiet); the mic
// waits while it plays (speech.left / speech.until, shared with the browser voice).
import { muffleLp } from './voice-space.js';

const GO_WAIT = 1.5;    // s after the line for the server's go
const CLIP_WAIT = 4.5;  // s after the go for a line's first clip
const CLIP_LATE = 2.5;  // s of silence after what is playing ends before a missing next clip is given up on
const GAIN = 0.55;      // Piper's clips peak near -1 dBFS; the other voices on the bus peak -17..-12
const GAP = { tag: 0.32, part: 0.16, line: 0.38 };

// (dm-andrew-voice, a test hook) a decoded clip's loudness: the RMS of its voiced part (samples over 0.01) in dBFS, as the server
// levels it (lib/dm-voice-worker.py), and its peak; once per clip, after decoding
function voicedDb(buf) {
  const a = buf.getChannelData(0); let s = 0, n = 0, pk = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] < 0 ? -a[i] : a[i]; if (x > pk) pk = x; if (x > 0.01) { s += x * x; n++; } }
  return { rms: n ? +(10 * Math.log10(s / n)).toFixed(2) : null, peak: +pk.toFixed(3) };
}

export function createDmVoicePlayer({ audio, net, speech, secs, level, duck, quiet, browser }) {
  const lines = [];                 // the queue, in order: { id, text, speaker, tag, go, n, parts, clips, next, ... }
  const byId = new Map();
  const live = new Set();           // playing sources (stopAll)
  const info = { clips: [], fell: [], played: [] }; // (test hooks)
  let freeAt = 0;                   // secs(): when the clips scheduled end
  let browserUntil = 0;             // secs(): when the browser's voice should be done with a line it took over (estimated)
  let bus = null, lp = null, timer = null;

  const ctxOk = () => !!(audio && audio.ctx && audio.ctx.state !== 'closed' && (audio.levelNodes?.voices || audio.master));
  function busOf() {
    if (bus) return bus;
    const c = audio.ctx;
    lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = 0.5;
    bus = c.createGain(); bus.gain.value = GAIN * gainOf(level());
    lp.connect(bus).connect(audio.levelNodes?.voices || audio.master);
    return bus;
  }
  // the room's hearing: 1 in the room, 0.5 in the shop with the door open, 0.3 shut, 0 outside (as the browser voice's volume)
  const gainOf = l => (l >= 1 ? 1 : l >= 0.5 ? 0.62 : l > 0 ? 0.42 : 0);
  const lpOf = l => muffleLp(l >= 1 ? 0 : l >= 0.5 ? 0.5 : 1);

  function expect(id, text, speaker, tag) {
    if (!ctxOk()) return false;
    const L = { id, text, speaker, tag, go: null, n: 0, parts: null, clips: [], next: 0, t0: secs(), waitFrom: secs(), done: false, fell: false, wordLen: 0, at: 0, ended: false };
    lines.push(L); byId.set(id, L);
    while (byId.size > 24) byId.delete(byId.keys().next().value);
    // the bubble and the mic: the line counts as speaking from now (estimated until its clips are timed)
    const est = String(text).length / 14.5 + (tag ? 1.2 : 0);
    speech.left++;
    speech.until = Math.max(speech.until, secs()) + est; speech.t0 = secs();
    speech.lines.set(text, { clip: L, at: 0, len: 1, t0: secs(), est, parts: 1, ended: 0 });
    if (speech.lines.size > 8) speech.lines.delete(speech.lines.keys().next().value);
    tickSoon();
    return true;
  }
  function onMsg(m) {
    const L = m && byId.get(m.line); if (!L || L.done) return;
    if (m.go === false) return fall(L, 0, m.why || 'no');
    if (m.go === true) { L.go = true; L.n = m.n; L.parts = Array.isArray(m.parts) ? m.parts.map(String) : null; L.hasTag = !!m.tag; L.waitFrom = secs(); return; }
    if (m.fail) { const c = L.clips[m.i] || (L.clips[m.i] = {}); c.failed = true; pump(); return; }
    if (!m.src) return;
    L.go = true; L.n = m.n || L.n;
    const c = L.clips[m.i] = { i: m.i, tag: !!m.tag, src: m.src, dur: m.dur, rate: m.rate || 1, buf: null, failed: false, at: secs() };
    info.clips.push({ line: L.id, i: m.i, tag: c.tag, dur: m.dur, rate: c.rate, src: m.src, cached: !!m.cached, decoded: null });
    if (info.clips.length > 60) info.clips.shift();
    fetch(m.src, { credentials: 'same-origin' }).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
      .then(ab => new Promise((res, rej) => { const p = audio.ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
      .then(buf => { c.buf = buf; const rec = info.clips.find(x => x.line === L.id && x.i === m.i); if (rec) { rec.decoded = +buf.duration.toFixed(3); rec.db = voicedDb(buf); } pump(); })
      .catch(() => { c.failed = true; pump(); });
  }
  // the browser's voice reads the rest of a line from part i (its words; the tag only if nothing was heard yet)
  function fall(L, i, why) {
    if (L.done) return;
    L.fell = true; L.fellAt = i;
    info.fell.push({ line: L.id, from: i, why }); if (info.fell.length > 30) info.fell.shift();
    pump();
  }
  // play the head of the queue: each clip in order once it's decoded, back to back after what is already scheduled
  function pump() {
    while (lines.length) {
      const L = lines[0];
      if (L.fell) { // the browser's turn: once what is scheduled ends, the rest of this line (the queue then waits for it)
        const wait = Math.max(0, freeAt - secs());
        lines.shift(); L.done = true;
        // what is left: the line's own sentences from the part that didn't come (the go listed them), else the whole line
        const from = L.fellAt || 0, heardAny = L.clips.some(c => c && c.played);
        const rest = L.parts ? L.parts.slice(from).filter((p, k) => !(L.hasTag && from + k === 0)).join(' ') : L.text;
        const say = () => {
          release(L);
          if (rest.trim()) browser(rest, L.speaker, heardAny ? '' : L.tag, L.text);
          browserUntil = Math.max(browserUntil, speech.until); // (a clip after it waits for it; the browser's own queue orders its lines)
        };
        if (wait > 0.05) setTimeout(say, wait * 1000); else say();
        continue;
      }
      if (!L.n) return; // (no go yet)
      while (L.next < L.n) {
        const c = L.clips[L.next];
        if (c && c.failed) { fall(L, L.next, 'clip failed'); return; }
        if (c && c.tag && !L.tag) { c.skipped = true; L.next++; continue; } // (the same speaker carrying on: no tag said again)
        if (!c || !c.buf) return; // (waiting for it)
        schedule(L, c);
        L.next++;
      }
      // every part scheduled: the line is done when its last clip ends
      lines.shift();
      L.allIn = true;
      if (L.lastSrc == null) finishLine(L);
    }
  }
  function schedule(L, c) {
    const ctx = audio.ctx, now = secs(), first = !L.clips.some(x => x && x.played);
    const gap = first ? (freeAt > now ? GAP.line : 0) : (L.clips[c.i - 1]?.tag ? GAP.tag : GAP.part);
    const startS = Math.max(now + 0.04, freeAt + gap, browserUntil > now ? browserUntil + GAP.line : 0), len = c.buf.duration / c.rate;
    const src = ctx.createBufferSource(); src.buffer = c.buf; src.playbackRate.value = c.rate;
    src.connect(busOf());
    src.start(ctx.currentTime + (startS - now));
    c.played = true; c.startS = startS; c.endS = startS + len;
    freeAt = c.endS;
    speech.until = Math.max(speech.until, c.endS); // (the mic waits; the tag rule's "their last words")
    live.add(src); L.lastSrc = src; speech.left++;
    info.played.push({ line: L.id, i: c.i, tag: c.tag, rate: c.rate, start: +(startS - L.t0).toFixed(2), len: +len.toFixed(3) }); if (info.played.length > 60) info.played.shift();
    setTimeout(() => { if (live.has(src)) duck(); }, Math.max(0, (startS - now) * 1000));
    src.onended = () => {
      live.delete(src); speech.left = Math.max(0, speech.left - 1);
      if (L.lastSrc === src) { L.lastSrc = null; if (L.allIn) finishLine(L); }
      if (!speech.left) quiet();
    };
  }
  function release(L) { if (!L.released) { L.released = true; speech.left = Math.max(0, speech.left - 1); } }
  function finishLine(L) { L.done = true; L.ended = true; release(L); if (!speech.left) quiet(); }
  // the deadlines, while anything is waiting
  function tickSoon() { if (!timer) timer = setInterval(tick, 150); }
  function tick() {
    const t = secs();
    const L = lines[0];
    if (!L) { clearInterval(timer); timer = null; return; }
    if (!L.fell) {
      if (L.go === null && t > L.t0 + GO_WAIT) fall(L, 0, 'no go');
      else if (L.go && L.n) {
        // (late counts from when it is needed: the go, or the end of what is already playing)
        const from = Math.max(L.waitFrom, freeAt), heard = L.clips.some(c => c && c.played);
        if (t > from + (heard ? CLIP_LATE : CLIP_WAIT) && !(L.clips[L.next] && L.clips[L.next].buf)) fall(L, L.next, 'late');
      }
    }
  }
  // the bubble's progress through a line (0..1), null when it is not being read in this voice
  function at(text) {
    const E = speech.lines.get(text); if (!E || !E.clip) return undefined;
    const L = E.clip; if (L.fell && !L.clips.some(c => c && c.played)) return undefined; // (the browser voice reads it)
    if (L.ended) return null;
    const words = L.clips.filter(c => c && !c.tag && !c.skipped), total = words.reduce((a, c) => a + (c.endS ? c.endS - c.startS : c.dur || 0), 0) || 1;
    const t = secs(); let done = 0;
    for (const c of words) { if (!c.startS) break; if (t >= c.endS) { done += c.endS - c.startS; continue; } if (t > c.startS) done += t - c.startS; break; }
    return Math.min(1, done / total);
  }
  function stopAll() {
    for (const s of live) { try { s.onended = null; s.stop(); } catch { /* done */ } }
    live.clear();
    for (const L of lines) { L.done = true; }
    lines.length = 0; freeAt = 0;
    speech.left = 0; quiet();
  }
  // per frame: the room's hearing as you move (in, out of the room, the door)
  let lastL = -1;
  function step() {
    if (!bus) return;
    const l = level(); if (l === lastL) return; // (only when it changes: no automation event a frame)
    lastL = l; const t = audio.ctx.currentTime;
    bus.gain.setTargetAtTime(GAIN * gainOf(l), t, 0.12);
    lp.frequency.setTargetAtTime(lpOf(l), t, 0.12);
  }
  net.on('dnd-voice', onMsg);
  return { expect, at, stopAll, step, get info() { return { ...info, queue: lines.length, live: live.size, freeIn: +(freeAt - secs()).toFixed(2), gain: bus ? +bus.gain.value.toFixed(3) : null, lp: lp ? Math.round(lp.frequency.value) : null }; } };
}
