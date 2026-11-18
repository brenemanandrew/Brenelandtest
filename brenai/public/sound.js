// Sound for Brenai, made in the browser (Web Audio): no audio files. Music is generated bar by bar from chord charts;
// effects are short synthesized sounds.
//   WizraSound.scene('chat' | 'house' | 'dorm')   which soundscape plays (music rotation + what you hear outside)
//   WizraSound.path('romance' | 'mentor' | ...)    what you two are: that theme joins the rotation while you are together
//   WizraSound.moment('romance' | 'mentor')        a moment of that kind just happened: its theme plays for a while
//   WizraSound.fx(name)                            one effect: type, pop, sparkle, heart, anger, ask, sweat, step, sit, tv, click, door, pour...
//   WizraSound.emote(ch)                           the effect for an emoji that popped up over her
//   WizraSound.volume('music' | 'fx', 0..1)        stored on the device;  WizraSound.duckWhen(fn) lowers music while fn() is true
(function () {
  const LS = (k, d) => { const v = parseFloat(localStorage.getItem(k)); return Number.isFinite(v) ? v : d; };
  const vol = { music: LS('brenai.vol.music', 0.35), fx: LS('brenai.vol.fx', 0.6) };
  let ctx = null, musicBus, fxBus, noise, scene = 'chat', path = '', track = null, themeUntil = 0, theme = '', duck = () => false, onCall = false, lastType = 0, trackSince = 0, lastName = '';
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0], mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- instruments ----------
  function tone(out, type, f, t, dur, g, o = {}) {
    const osc = ctx.createOscillator(), amp = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur)); if (o.det) osc.detune.value = o.det;
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = f * 0.006; l.connect(lg).connect(osc.frequency); l.start(t); l.stop(t + dur + 0.3); }
    const a = o.a || 0.008, r = o.r || Math.min(0.4, dur * 0.6);
    amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(g, t + a);
    if (o.decay) amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, g * 0.02), t + dur); else { amp.gain.setValueAtTime(g, t + Math.max(a, dur - r)); amp.gain.linearRampToValueAtTime(0.0001, t + dur); }
    let node = amp; if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; amp.connect(fl); node = fl; }
    if (o.pan != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; }
    osc.connect(amp); node.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function hit(out, t, dur, g, o = {}) { // a burst of noise through a filter: drums, clicks, whooshes
    const src = ctx.createBufferSource(), amp = ctx.createGain(), fl = ctx.createBiquadFilter(); src.buffer = noise; src.loop = true;
    fl.type = o.type || 'highpass'; fl.frequency.setValueAtTime(o.f || 4000, t); if (o.fTo) fl.frequency.exponentialRampToValueAtTime(o.fTo, t + dur); fl.Q.value = o.q || 0.7;
    amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(g, t + (o.a || 0.002)); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = amp; if (o.pan != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(o.pan, t); if (o.panTo != null) p.pan.linearRampToValueAtTime(o.panTo, t + dur); amp.connect(p); node = p; }
    src.connect(fl).connect(amp); node.connect(out); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  const kick = (o, t, g = 0.5) => tone(o, 'sine', 120, t, 0.22, g, { to: 42, glide: 0.12, decay: true });
  const snare = (o, t, g = 0.16) => { hit(o, t, 0.16, g, { type: 'bandpass', f: 1800, q: 0.6 }); tone(o, 'triangle', 190, t, 0.09, g * 0.5, { decay: true }); };
  const hat = (o, t, g = 0.05, d = 0.04) => hit(o, t, d, g, { f: 7000 });
  const keys = (o, m, t, d, g) => { tone(o, 'sine', mtof(m), t, d, g, { decay: true }); tone(o, 'triangle', mtof(m), t, d * 0.7, g * 0.35, { decay: true, det: 6 }); };          // soft electric piano
  const bell = (o, m, t, d, g) => { tone(o, 'sine', mtof(m), t, d, g, { decay: true }); tone(o, 'sine', mtof(m) * 2.76, t, d * 0.4, g * 0.22, { decay: true }); };               // music box
  const pad = (o, ms, t, d, g, lp = 900) => { for (const m of ms) { tone(o, 'sawtooth', mtof(m), t, d, g, { a: d * 0.3, r: d * 0.4, lp, det: -7 }); tone(o, 'sawtooth', mtof(m), t, d, g, { a: d * 0.3, r: d * 0.4, lp, det: 7 }); } };
  const bass = (o, m, t, d, g) => tone(o, 'triangle', mtof(m), t, d, g, { lp: 500, a: 0.012, r: 0.08 });

  // ---------- chord charts ----------
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, QUAL = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m: [0, 3, 7], '': [0, 4, 7] };
  const chart = s => s.split(' ').map(c => { const m = /^([A-G])([b#]?)(.*)$/.exec(c), root = NOTE[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0); return { root, tones: QUAL[m[3]] || QUAL[''], minor: /^m(?!aj)/.test(m[3]) }; });
  const scaleOf = c => (c.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]).map(x => c.root + x);   // pentatonic that fits the chord
  // Each style writes one bar: (out, chord, next chord, bar start, seconds per beat, bar number, the track's memory)
  const STYLE = {
    lofi(o, c, n, t, b, bar, mem) {
      const sw = 0.14 * b; kick(o, t, 0.42); kick(o, t + 2.5 * b, 0.3); snare(o, t + b, 0.1); snare(o, t + 3 * b, 0.11);
      for (let i = 0; i < 8; i++) hat(o, t + i * b / 2 + (i % 2 ? sw : 0), 0.018 + 0.02 * Math.random());
      for (const x of c.tones) keys(o, 60 + c.root + x, t + 0.02 * Math.random(), b * 2.4, 0.055); if (Math.random() < 0.6) for (const x of c.tones.slice(1)) keys(o, 60 + c.root + x, t + 2.5 * b + sw, b * 1.2, 0.035);
      bass(o, 36 + c.root, t, b * 1.6, 0.2); bass(o, 36 + c.root + (Math.random() < 0.5 ? 7 : 0), t + 2.5 * b, b * 1.1, 0.15);
      const sc = scaleOf(c); for (let i = 0; i < 8; i++) if (Math.random() < 0.3) { mem.i = Math.max(0, Math.min(9, (mem.i || 4) + pick([-2, -1, 1, 1, 2]))); tone(o, 'triangle', mtof(72 + sc[mem.i % 5] + 12 * (mem.i / 5 | 0) - 12), t + i * b / 2 + (i % 2 ? sw : 0), b * 0.9, 0.05, { vib: true, lp: 1800 }); }
      for (let i = 0; i < 5; i++) hit(o, t + Math.random() * 4 * b, 0.012, 0.03 * Math.random(), { f: 3000 });                                                               // vinyl crackle
    },
    jazz(o, c, n, t, b, bar, mem) {
      const sw = b * 0.66; for (let i = 0; i < 4; i++) { hit(o, t + i * b, 0.3, 0.035, { f: 6500 }); if (i % 2) { hit(o, t + i * b + sw, 0.2, 0.022, { f: 6500 }); hat(o, t + i * b, 0.03, 0.03); } }
      if (bar % 2) hit(o, t + 3 * b + sw, 0.12, 0.05, { type: 'bandpass', f: 2200 });                                                                                         // a brush
      const walk = [c.root, c.root + c.tones[1], c.root + 7, n.root + pick([-1, 1, -2])]; walk.forEach((m, i) => bass(o, 36 + ((m % 12) + 12) % 12, t + i * b, b * 0.92, 0.2));
      for (const at of pick([[0, 1 + 0.66], [0.66 + 1, 3], [0, 2 + 0.66], [1, 3 + 0.66]])) for (const x of c.tones.slice(1)) keys(o, 60 + c.root + x, t + at * b, b * 0.7, 0.045);
      if (Math.random() < 0.45) { const sc = scaleOf(c); let at = pick([0, 1, 2]); for (let i = 0; i < pick([2, 3, 4]); i++) { mem.i = Math.max(0, Math.min(9, (mem.i || 5) + pick([-2, -1, 1, 2]))); tone(o, 'sine', mtof(72 + sc[mem.i % 5] + 12 * (mem.i / 5 | 0) - 12), t + at * b, b * 0.5, 0.06, { decay: true, vib: true }); at += pick([0.66, 0.34, 1]); } }
    },
    chip(o, c, n, t, b, bar, mem) { // quiet 8-bit: arpeggio, square bass, a little lead
      const ar = [0, 1, 2, 1].map(i => c.tones[i % c.tones.length]); for (let i = 0; i < 16; i++) tone(o, 'square', mtof(72 + c.root + ar[i % 4] + (i % 8 > 3 ? 12 : 0)), t + i * b / 4, b / 4.4, 0.018, { lp: 2600 });
      for (let i = 0; i < 4; i++) { tone(o, 'square', mtof(36 + c.root), t + i * b, b * 0.45, 0.06, { lp: 700 }); hat(o, t + i * b + b / 2, 0.02, 0.02); }
      if (bar % 2 === 0) { const sc = scaleOf(c); for (let i = 0; i < 4; i++) if (Math.random() < 0.7) tone(o, 'triangle', mtof(84 + pick(sc)), t + i * b, b * 0.8, 0.06, { vib: true }); }
    },
    tavern(o, c, n, t, b, bar, mem) { // a harp and a flute, in three
      const ar = [0, 1, 2, 1, 2, 1].map(i => c.tones[i % c.tones.length]); ar.forEach((x, i) => tone(o, 'triangle', mtof(60 + c.root + x + (i > 2 ? 12 : 0)), t + i * b / 2, b * 1.1, 0.07, { decay: true }));
      bass(o, 36 + c.root, t, b * 2.6, 0.16);
      if (bar % 2 === 0) { const sc = scaleOf(c); mem.i = Math.max(0, Math.min(9, (mem.i || 5) + pick([-2, -1, 1, 2]))); tone(o, 'sine', mtof(72 + sc[mem.i % 5] + 12 * (mem.i / 5 | 0) - 12), t, b * 2.7, 0.07, { a: 0.08, vib: true }); }
    },
    dungeon(o, c, n, t, b, bar, mem) { // slow and dark: a drone, a pad, a far bell
      pad(o, c.tones.map(x => 48 + c.root + x), t, b * 4.05, 0.022, 600); tone(o, 'sine', mtof(24 + c.root), t, b * 4, 0.13, { a: 0.4, r: 0.8 });
      const sc = scaleOf(c); for (let i = 0; i < 4; i++) if (Math.random() < 0.45) bell(o, 72 + pick(sc), t + i * b, b * 2.5, 0.05);
    },
    romance(o, c, n, t, b, bar, mem) { // a music box in three, cute on purpose
      pad(o, c.tones.slice(0, 3).map(x => 60 + c.root + x), t, b * 3.05, 0.012, 1100); bass(o, 48 + c.root, t, b * 2.5, 0.1);
      const ar = [0, 2, 1, 2, 3, 2].map(i => c.tones[i % c.tones.length]); ar.forEach((x, i) => bell(o, 72 + c.root + x, t + i * b / 2, b * 1.4, 0.05));
      if (bar % 2) { const sc = scaleOf(c); bell(o, 84 + pick(sc), t + b, b * 2, 0.06); if (Math.random() < 0.5) bell(o, 84 + pick(sc), t + 2 * b, b * 1.5, 0.05); }
    },
    mentor(o, c, n, t, b, bar, mem) { // warm and steady: a pad, a rising piano figure, no drums
      pad(o, c.tones.map(x => 55 + c.root + x), t, b * 4.05, 0.016, 800); bass(o, 36 + c.root, t, b * 1.9, 0.15); bass(o, 43 + c.root, t + 2 * b, b * 1.9, 0.11);
      [0, 1, 2, 1].forEach((i, k) => keys(o, 60 + c.root + c.tones[i % c.tones.length] + (k === 2 ? 12 : 0), t + k * b, b * 1.6, 0.06));
      for (let i = 0; i < 8; i++) if (i % 2) hit(o, t + i * b / 2, 0.05, 0.012, { f: 5000 });                                                                                 // a soft shaker
      if (bar % 4 === 3) { const sc = scaleOf(c); [0, 1, 2].forEach(k => keys(o, 79 + sc[(k * 2) % 5], t + (1 + k) * b, b, 0.05)); }
    },
  };
  const TRACKS = {
    lofi1: ['lofi', 72, 4, 'Fmaj7 Em7 Dm7 Cmaj7'], lofi2: ['lofi', 80, 4, 'Am7 Dm7 G7 Cmaj7'], lofi3: ['lofi', 66, 4, 'Dm9 G7 Cmaj9 A7'], lofi4: ['lofi', 76, 4, 'Ebmaj7 Dm7 Cm7 Bbmaj7'],
    jazz1: ['jazz', 104, 4, 'Dm7 G7 Cmaj7 A7'], jazz2: ['jazz', 92, 4, 'Cm7 F7 Bbmaj7 Ebmaj7 Am7 D7 Gm7 Gm7'], jazz3: ['jazz', 116, 4, 'Fmaj7 Dm7 Gm7 C7'],
    game1: ['chip', 96, 4, 'Am F C G'], game2: ['tavern', 88, 3, 'Dm C Bb A'], game3: ['dungeon', 58, 4, 'Em C Am B'],
    romance: ['romance', 76, 3, 'Cmaj7 Am7 Fmaj7 G7'], mentor: ['mentor', 84, 4, 'Gmaj7 Em7 Cmaj7 D'],
  };
  const ROTATION = { chat: ['lofi1', 'lofi2', 'lofi3', 'lofi4'], house: ['jazz1', 'jazz2', 'jazz3'], dorm: ['game1', 'game2', 'game3'] };
  function startTrack(name) {
    if (track) { const old = track; old.dead = true; old.gain.gain.cancelScheduledValues(ctx.currentTime); old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.9); setTimeout(() => old.gain.disconnect(), 6000); }
    const [style, bpm, beats, ch] = TRACKS[name], gain = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = style === 'lofi' ? 2400 : 6000;
    gain.gain.value = 0; gain.gain.setTargetAtTime(1, ctx.currentTime, 1.2); gain.connect(lp).connect(musicBus);
    track = { name, style, b: 60 / bpm, beats, chords: chart(ch), gain, bar: 0, next: ctx.currentTime + 0.25, mem: {} }; trackSince = performance.now(); lastName = name;
  }
  function wantTrack() { // the theme of the moment, else the place's rotation (with your theme mixed in when you are together)
    if (performance.now() < themeUntil && TRACKS[theme]) return [theme];
    const list = [...ROTATION[scene]]; if (scene !== 'chat' && TRACKS[path]) list.push(path); return list;
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const want = wantTrack(), stale = performance.now() - trackSince > 170000;
    if (!track || !want.includes(track.name) || (stale && want.length > 1)) startTrack(pick(want.filter(n => n !== lastName).length ? want.filter(n => n !== lastName) : want));
    while (track.next < ctx.currentTime + 0.5) { const c = track.chords[track.bar % track.chords.length], n = track.chords[(track.bar + 1) % track.chords.length]; STYLE[track.style](track.gain, c, n, track.next, track.b, track.bar, track.mem); track.next += track.b * track.beats; track.bar++; }
    const level = vol.music * (onCall ? 0 : duck() ? 0.15 : 1); musicBus.gain.setTargetAtTime(level * 0.9, ctx.currentTime, 0.25);
    ambience();
  }

  // ---------- what you hear around you ----------
  const due = {}; const every = (key, lo, hi) => { const now = performance.now(); if (!due[key]) due[key] = now + rnd(lo, hi) * 600; if (now < due[key]) return false; due[key] = now + rnd(lo, hi) * 1000; return true; };
  function car(far) { const t = ctx.currentTime, d = far ? 6 : 4.2, dir = Math.random() < 0.5 ? 1 : -1, g = ctx.createGain(); g.gain.value = 1; g.connect(fxBus);
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), amp = ctx.createGain(); src.buffer = noise; src.loop = true; fl.type = 'bandpass'; fl.Q.value = 0.5;
    fl.frequency.setValueAtTime(far ? 180 : 300, t); fl.frequency.linearRampToValueAtTime(far ? 320 : 800, t + d / 2); fl.frequency.linearRampToValueAtTime(far ? 160 : 260, t + d);
    amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(far ? 0.05 : 0.16, t + d / 2); amp.gain.linearRampToValueAtTime(0.0001, t + d);
    let node = amp; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-dir * 0.8, t); p.pan.linearRampToValueAtTime(dir * 0.8, t + d); amp.connect(p); node = p; }
    src.connect(fl).connect(amp); node.connect(g); src.start(t); src.stop(t + d + 0.1); }
  function birds() { const t = ctx.currentTime, pan = rnd(-0.8, 0.8), base = rnd(2600, 4200); let at = 0; for (let i = 0; i < pick([2, 3, 4, 6]); i++) { tone(fxBus, 'sine', base * rnd(0.9, 1.1), t + at, 0.09, 0.035, { to: base * rnd(1.2, 1.6), glide: 0.07, pan, a: 0.01 }); at += rnd(0.1, 0.24); } }
  function roommate() { const t = ctx.currentTime, out = ctx.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 650; out.connect(fxBus); // through the wall: a door, steps, keys
    tone(out, 'sine', 95, t, 0.3, 0.5, { to: 50, decay: true }); hit(out, t, 0.08, 0.2, { type: 'lowpass', f: 900 });
    for (let i = 0; i < pick([4, 5, 7]); i++) hit(out, t + 0.7 + i * 0.46, 0.09, 0.9, { type: 'lowpass', f: 260 });
    for (let i = 0; i < 5; i++) tone(fxBus, 'sine', rnd(3200, 5200), t + 1.2 + i * 0.07, 0.08, 0.006, { decay: true });
    if (Math.random() < 0.6) tone(out, 'sine', 90, t + 4.2, 0.3, 0.4, { to: 48, decay: true }); }
  function ambience() {
    if (onCall || vol.fx <= 0) return;
    if (scene === 'house') { if (every('car', 22, 60)) car(false); }
    else if (scene === 'dorm') { if (every('bird', 12, 34)) birds(); if (every('far', 35, 80)) car(true); if (every('mate', 110, 260)) roommate(); }
  }

  // ---------- effects ----------
  const FX = {
    type(t) { hit(fxBus, t, 0.022, 0.1, { f: rnd(1800, 3200) }); tone(fxBus, 'sine', rnd(180, 260), t, 0.03, 0.05, { decay: true }); },
    pop(t) { tone(fxBus, 'sine', 420, t, 0.12, 0.22, { to: 980, glide: 0.08, decay: true }); },
    sparkle(t) { [84, 88, 91, 96].forEach((m, i) => bell(fxBus, m, t + i * 0.06, 0.5, 0.07)); },
    heart(t) { bell(fxBus, 76, t, 0.6, 0.1); bell(fxBus, 80, t + 0.13, 0.8, 0.1); },
    anger(t) { tone(fxBus, 'square', 130, t, 0.16, 0.12, { to: 70, lp: 900, decay: true }); tone(fxBus, 'square', 110, t + 0.14, 0.2, 0.12, { to: 60, lp: 900, decay: true }); },
    ask(t) { tone(fxBus, 'triangle', 520, t, 0.09, 0.14, { decay: true }); tone(fxBus, 'triangle', 780, t + 0.1, 0.16, 0.14, { decay: true }); },
    sweat(t) { tone(fxBus, 'sine', 900, t, 0.25, 0.12, { to: 420, glide: 0.22, decay: true }); },
    step(t) { hit(fxBus, t, 0.07, 0.7, { type: 'lowpass', f: rnd(260, 380) }); }, step2(t) { hit(fxBus, t, 0.06, 0.35, { type: 'lowpass', f: rnd(500, 700) }); hit(fxBus, t, 0.015, 0.03, { f: 2500 }); },   // you, and her boots
    sit(t) { hit(fxBus, t, 0.22, 1.2, { type: 'lowpass', f: 200 }); hit(fxBus, t + 0.05, 0.3, 0.05, { type: 'bandpass', f: 1200 }); },
    tv(t) { hit(fxBus, t, 0.012, 0.25, { f: 2000 }); hit(fxBus, t + 0.02, 0.22, 0.07, { type: 'bandpass', f: 3000, fTo: 6000 }); tone(fxBus, 'sine', 9000, t + 0.02, 0.3, 0.012, { decay: true }); },
    thunder(t) { hit(fxBus, t, 0.06, 0.8, { type: 'lowpass', f: 2600 }); hit(fxBus, t + 0.06, 2.8, 1.4, { type: 'lowpass', f: 190, fTo: 55 }); hit(fxBus, t + 0.9, 1.6, 0.6, { type: 'lowpass', f: 120 }); },   // a crack, then the long roll
    powerdown(t) { tone(fxBus, 'sawtooth', 220, t, 0.7, 0.1, { to: 40, lp: 700, decay: true }); hit(fxBus, t, 0.02, 0.3, { f: 1200 }); }, powerup(t) { tone(fxBus, 'sine', 90, t, 0.5, 0.08, { to: 240 }); hit(fxBus, t + 0.45, 0.02, 0.25, { f: 1800 }); },
    click(t) { hit(fxBus, t, 0.014, 0.25, { f: 1500 }); tone(fxBus, 'sine', 1300, t, 0.02, 0.06, { decay: true }); },
    door(t) { tone(fxBus, 'sawtooth', 240, t, 0.35, 0.03, { to: 330, lp: 1200, vib: true }); tone(fxBus, 'sine', 100, t + 0.4, 0.28, 0.45, { to: 52, decay: true }); hit(fxBus, t + 0.4, 0.06, 0.6, { type: 'lowpass', f: 1200 }); },
    pour(t) { hit(fxBus, t, 1.6, 0.3, { type: 'bandpass', f: 900, fTo: 2600, q: 2, a: 0.2 }); },
    send(t) { hit(fxBus, t, 0.16, 0.25, { type: 'bandpass', f: 800, fTo: 3200, q: 1.2 }); },
    bond(t) { [72, 76, 79, 84].forEach((m, i) => bell(fxBus, m, t + i * 0.09, 0.7, 0.09)); },
    connect(t) { tone(fxBus, 'sine', 660, t, 0.1, 0.12, { decay: true }); tone(fxBus, 'sine', 990, t + 0.1, 0.18, 0.12, { decay: true }); },
    hangup(t) { for (let i = 0; i < 3; i++) tone(fxBus, 'sine', 480, t + i * 0.28, 0.16, 0.12, {}); },
    dial(t) { tone(fxBus, 'sine', 941, t, 0.11, 0.07, {}); tone(fxBus, 'sine', 1336, t, 0.11, 0.07, {}); },
    phone(t) { for (const at of [0, 0.42]) for (let i = 0; i < 7; i++) tone(fxBus, 'sine', i % 2 ? 1568 : 1319, t + at + i * 0.045, 0.05, 0.16, { a: 0.004, r: 0.01 }); },   // your phone ringing: she is calling
    ring(t) { for (const f of [440, 480]) tone(fxBus, 'sine', f, t, 1.8, 0.06, { a: 0.03, r: 0.05 }); },   // the ringing you hear while you wait
  };
  const EMOTE = { '✨': 'sparkle', '💗': 'heart', '💢': 'anger', '❓': 'ask', '💦': 'sweat' };
  function fx(name) {
    if (!ctx || ctx.state !== 'running' || !FX[name] || vol.fx <= 0) return;
    if (name === 'type') { const now = performance.now(); if (now - lastType < 55) return; lastType = now; }
    FX[name](ctx.currentTime + 0.005);
  }

  // ---------- start up (a browser only lets sound begin after a tap or a key) ----------
  let ringTimer = 0;
  function boot() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(comp); fxBus = ctx.createGain(); fxBus.gain.value = vol.fx; fxBus.connect(comp);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(tick, 110);
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, boot, { passive: true });
  document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });
  window.addEventListener('wizra-sound', e => fx(e.detail));
  // the phone: the page marks a call on <body>; the sounds follow it
  function watchCall() {
    const c = document.body.classList, calling = c.contains('calling'), ringing = calling && c.contains('ringing');
    if (ringing && !ringTimer) { fx('dial'); ringTimer = 1; }                    // (the page plays the ringing itself while it connects)
    if (!ringing && ringTimer) { ringTimer = 0; if (calling) fx('connect'); }
    if (onCall && !calling) fx('hangup');
    onCall = calling;
  }
  document.addEventListener('DOMContentLoaded', () => { new MutationObserver(watchCall).observe(document.body, { attributes: true, attributeFilter: ['class'] }); });

  window.WizraSound = {
    fx, emote(ch) { fx(EMOTE[ch] || 'pop'); },
    scene(name) { scene = ROTATION[name] ? name : 'chat'; for (const k in due) delete due[k]; },
    path(p) { path = p === 'romance' || p === 'mentor' ? p : ''; },
    moment(kind) { fx('bond'); if (kind === 'romance' || kind === 'mentor') { theme = kind; themeUntil = performance.now() + 80000; } },
    volume(which, v) { if (v === undefined) return vol[which]; vol[which] = Math.max(0, Math.min(1, v)); localStorage.setItem('brenai.vol.' + which, vol[which]); if (ctx && which === 'fx') fxBus.gain.value = vol.fx; },
    duckWhen(fn) { duck = fn; }, playing: () => track && track.name,
  };
})();
