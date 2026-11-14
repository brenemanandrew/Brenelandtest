// Proximity voice chat, like PEAK: you hear the people near you, panned from where their head is, quieter with
// distance, muffled through walls, ringing in the room you stand in, and their mouths move with what you hear.
// Server side: lib/voice.js (a relay that forwards each 20 ms frame only to listeners in earshot; no addresses, no
// recording). The wire format and the fallback codec: voice-codec.js. Zones, reverb and walls: voice-space.js.
// The audio thread: voice-worklet.js.
//
//   Asked once: the first time you are in the world, "Use voice chat?" Yes / Not now. The answer is kept on your record
//   (account or saved id: lib/voice.js) or, for a guest, in this browser. The microphone prompt only comes after a Yes.
//   Settings > Voice chat: On / Off, Open mic (a sensitivity slider and a live meter) or Push to talk, the microphone,
//   the voice chat volume. Push to talk: hold B, D-pad down on a pad (L1 runs), or hold the mic button (phones).
//   The mic toggle (#mic-toggle, right of the chat bar) shows the state at a glance and flips it:
//   voice off -> on; open mic: live <-> muted (you still hear everyone; nothing is sent); push to talk: hold it to talk;
//   a blocked microphone opens the settings. Mute a player in the who's-here list (the minimap's corner).
//
// Transport: Opus through WebCodecs (Chrome, Edge, Firefox 130+, Safari 26+), else IMA ADPCM 16 kHz (older Safari). The
// relay tells a speaker to send ADPCM while a listener near them cannot decode Opus (vcodec).
import { CODEC, CODEC_MASK, F_LOUD, RATE, FRAME, packFrame, unpackFrame, adpcmEncode, adpcmDecode, levelOf, dbOf } from './voice-codec.js';
import { falloff, zoneAt, makeIR, ZONES, wallsFrom, muffleBetween, muffleGain, muffleLp } from './voice-space.js';
import { ANIM_CODES } from './codes.js';
import { WATER_Y } from './terrain.js';
import { LIGHT, WEATHER } from './daynight-mats.js';
import { el, loadCss } from './util.js';

export const PTT_KEY = 'KeyB';          // free since T is chat; controls-map.js VERBS names it
const TRIM = 0.6;                       // a voice at full level into the Voices bus (measured: tools/voice-e2e.mjs)
const SHOUT_DB = -8;                    // a frame this loud is a shout: it carries to FAR_LOUD (talking peaks about -12 after the browser's AGC)
const HANG = 0.35;                      // open mic stays open this long after the level drops
const IDLE = 6;                         // seconds of silence before a voice's nodes are let go
const HEAD = 1.5;                       // metres from the feet to the mouth
const DIVE = 1.2;                       // a swimmer this far under the surface is under water (wading in the shallows is not)
const DEFAULTS = { asked: false, on: true, mode: 'open', sens: 55, vol: 100 };
const TOGGLE_TIP = { off: 'Voice chat is off. Turn it on', asking: 'Asking for the microphone', blocked: 'The microphone is blocked (voice settings)',
  live: 'Your mic is on. Mute it', muted: 'Your mic is muted. Unmute it', ptt: 'Hold to talk' };
const OPUS_ENC = { codec: 'opus', sampleRate: RATE, numberOfChannels: 1, bitrate: 20000 };

export function createVoice(ctx) {
  const { net, audio, ui, input, player, remotes, store } = ctx;
  loadCss('/css/voice.css');
  const qs = new URLSearchParams(location.search);
  const forceCodec = qs.get('voicecodec'); // 'adpcm' tests the Safari path in Chrome
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------- preferences
  let prefs = { ...DEFAULTS, ...(store.get('voice', null) || {}) };
  let fromServer = null;   // null until the server answered: { prefs, saved }
  let askState = 'idle';   // idle -> showing -> done
  let answeredAt = -1e9;
  // a browser driven by test automation (navigator.webdriver: every suite in tools/) is not asked, unless the voice
  // suites say so (localStorage breneland.voiceAsk = true); voice stays off there
  const noAsk = !store.get('voiceAsk', !navigator.webdriver);
  let deviceId = store.get('voiceMic', '') || '';
  const savePrefs = () => {
    store.set('voice', prefs);
    clearTimeout(savePrefs.t);
    savePrefs.t = setTimeout(() => net.send({ t: 'vprefs', prefs }), 400); // sliders are dragged: one message at the end
  };
  const wanted = () => prefs.asked && prefs.on;

  // ---------------------------------------------------------------- capabilities
  const caps = { worklet: false, enc: false, dec: false, gum: !!navigator.mediaDevices?.getUserMedia, ready: null };
  caps.ready = (async () => {
    caps.worklet = typeof AudioWorkletNode !== 'undefined';
    try { caps.enc = forceCodec !== 'adpcm' && typeof AudioEncoder !== 'undefined' && !!(await AudioEncoder.isConfigSupported(OPUS_ENC)).supported; } catch { caps.enc = false; }
    try { caps.dec = forceCodec !== 'adpcm' && typeof AudioDecoder !== 'undefined' && !!(await AudioDecoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 })).supported; } catch { caps.dec = false; }
  })();
  let workletP = null;
  const worklet = () => {
    if (!audio.ctx) return Promise.reject(new Error('no audio'));
    return workletP || (workletP = audio.ctx.audioWorklet.addModule('/js/voice-worklet.js').catch(e => { workletP = null; throw e; }));
  };

  // ---------------------------------------------------------------- the bus: voices -> zone low-pass -> volume -> Voices
  let bus = null;
  function ensureBus() {
    if (bus || !audio.ctx || !audio.levelNodes) return bus;
    const a = audio.ctx;
    const out = a.createGain(); out.gain.value = volGain();
    out.connect(audio.levelNodes.voices);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.6;
    lp.connect(out);
    const dry = a.createGain(); dry.connect(lp);
    const verbIn = a.createGain();
    const convs = [0, 1].map(() => { const c = a.createConvolver(); c.normalize = false; const g = a.createGain(); g.gain.value = 0; c.connect(g).connect(lp); return { c, g, zone: null, live: false }; });
    bus = { out, lp, dry, verbIn, convs, cur: 0, zone: null };
    setZone('open', true);
    return bus;
  }
  const volGain = () => { const v = prefs.vol / 100; return v * v * TRIM; };
  // the listener's room: the new impulse response goes into the idle convolver, then the two cross-fade
  function setZone(id, now = false) {
    if (!bus || bus.zone === id) return;
    const a = audio.ctx, t = a.currentTime, Z = ZONES[id];
    const next = bus.convs[1 - bus.cur], prev = bus.convs[bus.cur];
    if (next.zone !== id) { try { next.c.buffer = makeIR(a, id); } catch { /* a bad buffer: stay dry */ } next.zone = id; }
    if (!next.live) { bus.verbIn.connect(next.c); next.live = true; }
    next.g.gain.setTargetAtTime(1, t, now ? 0.01 : 0.25);
    prev.g.gain.setTargetAtTime(0, t, now ? 0.01 : 0.25);
    clearTimeout(prev.off);
    prev.off = setTimeout(() => { if (prev.live && bus && bus.convs[bus.cur] !== prev) { try { bus.verbIn.disconnect(prev.c); } catch { /* not connected */ } prev.live = false; } }, 1500);
    bus.cur = 1 - bus.cur;
    bus.zone = id;
    bus.lp.frequency.setTargetAtTime(Z.lp, t, now ? 0.01 : 0.3);
  }

  // ---------------------------------------------------------------- remote voices
  const voices = new Map(); // sid -> RemoteVoice
  const muted = new Set();
  const scratch = new Float32Array(256);
  let walls = [], wallsAt = -1e9;
  const stats = { sent: 0, sentBytes: 0, recv: 0, recvBytes: 0, decoded: 0, dropped: 0, codec: null, txStarts: [], rxStarts: [] };

  class RemoteVoice {
    constructor(sid) {
      const a = audio.ctx;
      this.sid = sid;
      this.node = new AudioWorkletNode(a, 'vc-play', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
      this.an = a.createAnalyser(); this.an.fftSize = 256; this.an.smoothingTimeConstant = 0;
      this.lp = a.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.Q.value = 0.5;
      this.g = a.createGain(); this.g.gain.value = 0;
      this.pan = new PannerNode(a, { panningModel: 'HRTF', distanceModel: 'linear', refDistance: 1, maxDistance: 10000, rolloffFactor: 0 });
      this.send = a.createGain(); this.send.gain.value = 0;
      this.node.connect(this.an);
      this.node.connect(this.lp).connect(this.g).connect(this.pan).connect(bus.dry);
      this.pan.connect(this.send).connect(bus.verbIn);
      this.breath = this.node.parameters.get('breath'); this.burble = this.node.parameters.get('burble');
      this.lastAt = performance.now() / 1000; this.loudUntil = 0; this.level = 0; this.talkUntil = 0; this.ts = 0;
      this.dec = null; this.gainNow = 0; this.k = 0; this.wall = false; this.dist = 0; this.inRx = false;
    }
    push(f) {
      const now = performance.now() / 1000;
      if (now - this.lastAt > 0.6) stats.rxStarts.push(Date.now());
      this.lastAt = now;
      if (f.loud) this.loudUntil = now + 1.2;
      if (f.codec === CODEC.adpcm) {
        const pcm = adpcmDecode(f.payload);
        stats.decoded++;
        this.node.port.postMessage({ pcm, rate: RATE }, [pcm.buffer]);
      } else if (f.codec === CODEC.opus) {
        if (!caps.dec) { stats.dropped++; return; }
        if (!this.dec) {
          this.dec = new AudioDecoder({ output: ad => this.out(ad), error: () => { this.dec = null; } });
          this.dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 });
        }
        try { this.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: (this.ts += 20000), data: f.payload })); } catch { this.dec = null; }
      }
    }
    out(ad) {
      try {
        const n = ad.numberOfFrames, pcm = new Float32Array(n);
        try { ad.copyTo(pcm, { planeIndex: 0, format: 'f32-planar' }); }
        catch { // a decoder that only hands out its own format (s16)
          const raw = new Int16Array(n * ad.numberOfChannels); ad.copyTo(raw, { planeIndex: 0 });
          for (let i = 0; i < n; i++) pcm[i] = raw[i * ad.numberOfChannels] / 32768;
        }
        stats.decoded++;
        this.node.port.postMessage({ pcm, rate: ad.sampleRate }, [pcm.buffer]);
      } finally { ad.close(); }
    }
    dispose() {
      try { this.dec?.close(); } catch { /* closed */ }
      for (const n of [this.node, this.an, this.lp, this.g, this.pan, this.send]) { try { n.disconnect(); } catch { /* gone */ } }
      const r = remotes.map.get(this.sid);
      if (r) { r.ch.voiceLevel = 0; r.tag?.node.classList.remove('talking'); }
    }
  }

  net.onBinary = buf => {
    const f = unpackFrame(buf);
    if (!f) return;
    stats.recv++; stats.recvBytes += buf.byteLength;
    if (!active || muted.has(f.sid) || !remotes.map.has(f.sid) || !audio.ctx || !wpReady) return;
    if (!ensureBus()) return;
    let v = voices.get(f.sid);
    if (!v) { v = new RemoteVoice(f.sid); voices.set(f.sid, v); }
    v.push(f);
  };

  // ---------------------------------------------------------------- the microphone
  const mic = { state: 'off', stream: null, src: null, node: null, sink: null, label: '', rms: 0, db: -100, err: '' };
  let active = false, wpReady = false;   // voice is on (hearing); the worklet module has loaded
  let tx = false, hangUntil = 0, seq = 0, txLevel = 0;
  const preroll = [];
  const ad = { pred: 0, idx: 0 };
  let enc = null; const encFlags = new Map();
  let codec = 'opus';
  let heard = true; // someone with voice on is in earshot (the relay says, vcodec): nobody = nothing is sent at all
  let pttTouch = false;
  let micOff = !!store.get('voiceMicOff', false); // the mic toggle's mute (open mic): you hear everyone, nothing is sent

  const pttHeld = () => !input.typing && (input.down.has(PTT_KEY) || (input.pad.lb && !input.overlayOpen) || pttTouch);
  const thrDb = () => -12 - prefs.sens * 0.5; // sensitivity 0 = only shouting (-12 dBFS), the default 55 = talking (-40), 100 = a whisper (-62)

  // something else needs the microphone for a while (D&D's speech to text: a phone gives the mic to one listener at a time):
  // voice chat lets go of it, you still hear everyone, and it takes it back when the last hold ends
  const holds = new Set();
  function holdMic(why, on) {
    if (on) { holds.add(why); if (mic.stream) closeMic(); }
    else if (holds.delete(why) && !holds.size && active && !mic.stream) openMic();
    refresh();
  }

  async function openMic() {
    if (mic.stream || mic.state === 'asking' || holds.size) return;
    if (!caps.gum) { mic.state = 'none'; mic.err = 'This browser cannot use a microphone here'; refresh(); return; }
    mic.state = 'asking'; refresh();
    try {
      const audioC = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...(deviceId ? { deviceId: { ideal: deviceId } } : {}) };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioC, video: false });
      if (!wanted() || holds.size) { for (const t of stream.getTracks()) t.stop(); mic.state = 'off'; refresh(); return; }
      await worklet();
      wpReady = true;
      const a = audio.ctx;
      mic.stream = stream;
      const track = stream.getAudioTracks()[0];
      mic.label = track?.label || 'Microphone';
      track?.addEventListener('ended', () => { closeMic(); mic.state = 'none'; mic.err = 'The microphone went away'; refresh(); });
      mic.src = a.createMediaStreamSource(stream);
      mic.node = new AudioWorkletNode(a, 'vc-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      mic.sink = a.createGain(); mic.sink.gain.value = 0; // pulls the capture node; silent
      mic.src.connect(mic.node).connect(mic.sink).connect(a.destination);
      mic.node.port.onmessage = e => onFrame(e.data.pcm, e.data.rms);
      mic.state = 'live'; mic.err = '';
      // iOS Safari 17+: say we play and record, so the game keeps playing through the speaker with the mic open
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* not there */ }
      listMics();
    } catch (e) {
      mic.state = e && e.name === 'NotAllowedError' ? 'denied' : 'none';
      mic.err = mic.state === 'denied' ? 'The browser blocked the microphone. Allow it next to the address bar to talk.' : 'No microphone found. You can still listen.';
    }
    refresh();
  }
  function closeMic() {
    if (mic.stream) for (const t of mic.stream.getTracks()) t.stop();
    for (const n of [mic.src, mic.node, mic.sink]) { try { n?.disconnect(); } catch { /* gone */ } }
    if (mic.node) mic.node.port.onmessage = null;
    mic.stream = mic.src = mic.node = mic.sink = null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* not there */ }
    if (mic.state === 'live' || mic.state === 'asking') mic.state = 'off';
    try { enc?.close(); } catch { /* closed */ }
    enc = null; tx = false; txLevel = 0; preroll.length = 0;
  }

  function encoder() {
    if (enc || !caps.enc || codec !== 'opus') return enc;
    enc = new AudioEncoder({
      output: chunk => {
        const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
        const s = Math.round(chunk.timestamp / 20000) & 0xffff;
        const fl = encFlags.get(s) ?? CODEC.opus; encFlags.delete(s);
        sendFrame(fl, s, b);
      },
      error: () => { enc = null; },
    });
    enc.configure({ ...OPUS_ENC, opus: { frameDuration: 20000, application: 'voip', complexity: 5 } });
    return enc;
  }
  function sendFrame(flags, s, payload) {
    if (net.sendBinary(packFrame(flags, s, payload))) { stats.sent++; stats.sentBytes += payload.length + 4; }
  }
  function encodeFrame(pcm, loud) {
    const s = seq = (seq + 1) & 0xffff;
    const fl = loud ? F_LOUD : 0;
    if (codec === 'opus' && encoder()) {
      encFlags.set(s, CODEC.opus | fl);
      if (encFlags.size > 50) encFlags.clear();
      const data = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: FRAME, numberOfChannels: 1, timestamp: s * 20000, data: pcm });
      try { enc.encode(data); } finally { data.close(); }
    } else sendFrame(CODEC.adpcm | fl, s, adpcmEncode(pcm, ad));
  }

  // every 20 ms from the capture worklet
  function onFrame(pcm, rms) {
    mic.rms = rms; mic.db = dbOf(rms);
    if (stats.log) { stats.log.push([Date.now(), rms]); if (stats.log.length > 1500) stats.log.shift(); } // the latency test
    const now = performance.now() / 1000;
    let want = false;
    if (active && net.status === 'online' && !document.hidden) { // a tab in the background never sends
      if (prefs.mode === 'ptt') want = pttHeld();
      else { if (mic.db > thrDb()) hangUntil = now + HANG; want = now < hangUntil && !micOff; }
    }
    if (want && !tx) { // a new spurt: the frames just before it go out first, so the first syllable is not clipped
      stats.txStarts.push(Date.now());
      if (stats.txStarts.length > 50) stats.txStarts.shift();
      ad.pred = 0; ad.idx = 0;
      if (heard) for (const p of preroll) encodeFrame(p.pcm, false);
      preroll.length = 0;
    }
    tx = want;
    if (tx && heard) encodeFrame(pcm, mic.db > SHOUT_DB);
    else { preroll.push({ pcm }); if (preroll.length > 2) preroll.shift(); }
    txLevel = tx ? levelOf(rms) : 0;
  }

  async function listMics() {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
      mics = all.map(d => ({ id: d.deviceId, label: d.label || 'Microphone' }));
    } catch { mics = []; }
    refresh();
  }
  let mics = [];

  // turn the whole thing on or off (the toggle, the question, a pref from the server)
  async function apply() {
    const on = wanted() && caps.worklet && !!audio.ctx;
    if (on !== active) {
      active = on;
      if (!on) { closeMic(); for (const v of voices.values()) v.dispose(); voices.clear(); }
    }
    await caps.ready;
    net.send({ t: 'vstate', on: active, enc: caps.enc, dec: caps.dec });
    if (active) {
      try { await worklet(); wpReady = true; } catch { wpReady = false; }
      ensureBus();
      if (!mic.stream) openMic();
    }
    refresh();
  }

  // ---------------------------------------------------------------- server messages
  net.on('welcome', () => { for (const v of voices.values()) v.dispose(); voices.clear(); muted.clear(); if (fromServer) apply(); });
  net.on('vprefs', m => {
    const first = !fromServer;
    fromServer = { prefs: m.prefs, saved: !!m.saved };
    if (m.saved) { // your record wins: it follows you between devices
      if (m.prefs) prefs = { ...DEFAULTS, ...m.prefs };
      else prefs = { ...prefs, asked: false };
      store.set('voice', prefs);
    }
    if (first || prefs.asked) apply();
  });
  net.on('vmuted', m => { for (const s of m.sids || []) { if (m.on) muted.add(s); else muted.delete(s); if (m.on) { voices.get(s)?.dispose(); voices.delete(s); } } refreshWho(); });
  net.on('vcodec', m => { const c = m.c === 'opus' && caps.enc ? 'opus' : 'adpcm'; if (c !== codec) { codec = c; try { enc?.close(); } catch { /* closed */ } enc = null; } stats.codec = codec; heard = m.near !== false; });

  // ---------------------------------------------------------------- the question (once)
  function ask() {
    if (askState !== 'idle') return;
    askState = 'showing';
    const box = $('#voice-ask');
    box.hidden = false;
    audio.ui?.('chime');
    setTimeout(() => box.querySelector('.btn.primary')?.focus({ preventScroll: true }), 40);
  }
  function answer(yes) {
    const box = $('#voice-ask');
    box.hidden = true;
    askState = 'done';
    answeredAt = performance.now(); // the Enter / Space / A that pressed the button must not also open the chat or hop
    prefs.asked = true; prefs.on = yes;
    savePrefs();
    if (yes) ui.toast(prefs.mode === 'ptt' ? `Voice chat is on. Hold ${pttWord()} to talk.` : 'Voice chat is on. People near you can hear you.', 4200);
    else ui.toast('Voice chat is off. Turn it on any time in Settings.', 3600);
    apply();
  }
  $('#voice-ask .va-yes').onclick = () => answer(true);
  $('#voice-ask .va-no').onclick = () => answer(false);

  // ---------------------------------------------------------------- HUD: the mic toggle (right of the chat bar)
  // (the variable is called pill). Its word (.mic-txt) is read by screen readers and the tests, not drawn.
  const pill = el('button', 'mic-toggle off', '', { type: 'button', id: 'mic-toggle', 'aria-live': 'polite' });
  pill.hidden = true;
  const pIc = el('i', 'mic-ic'), pTxt = el('b', 'mic-txt'), pBars = el('i', 'mic-bars');
  for (let i = 0; i < 3; i++) pBars.append(el('i'));
  pill.append(pIc, pBars, pTxt);
  $('#chat')?.append(pill);
  const pttWord = () => (input.lastDevice === 'pad' ? input.pad.btnName('KeyB') : input.lastDevice === 'touch' ? 'the mic' : 'B');
  let pillState = 'off';
  pill.addEventListener('pointerdown', e => { if (pillState === 'ptt') { pttTouch = true; try { pill.setPointerCapture(e.pointerId); } catch { /* fine */ } e.preventDefault(); } });
  const pttUp = () => { pttTouch = false; };
  pill.addEventListener('pointerup', pttUp); pill.addEventListener('pointercancel', pttUp); pill.addEventListener('lostpointercapture', pttUp);
  pill.addEventListener('click', () => {
    pill.blur(); // a focused button would also catch the next Space
    if (pillState === 'off') { prefs.asked = true; prefs.on = true; savePrefs(); apply(); ui.toast(prefs.mode === 'ptt' ? `Voice chat is on. Hold ${pttWord()} to talk.` : 'Voice chat is on. People near you can hear you.', 3600); }
    else if (pillState === 'live' || pillState === 'muted') { micOff = !micOff; store.set('voiceMicOff', micOff); refresh(); audio.ui?.('blip'); }
    else if (pillState === 'blocked') openSettings();
  });
  pill.addEventListener('contextmenu', e => e.preventDefault());
  function openSettings() { if ($('#help').hidden) $('#btn-help').click(); setTimeout(() => ui.settings?.open('voice'), 0); }

  // ---------------------------------------------------------------- Settings > Voice chat
  let section = null, V = null;
  function buildSettings() {
    if (section || !ui.settings) return;
    section = ui.settings.addSection('voice', { title: 'Voice chat', summary: '', icon: 'voice' });
    const b = section.body;
    b.replaceChildren();
    V = {};
    // one chunky line per control, in the Settings style (settings.css .set-line)
    const row = (cls, label, sub) => {
      const r = el('div', 'set-line vc-line ' + cls), tx = el('span', 'set-line-t');
      tx.append(el('b', '', label)); if (sub) tx.append(el('small', '', sub));
      r.append(tx); b.append(r); return r;
    };
    // on / off
    const r1 = row('vc-on', 'Voice chat', 'Talk with people near you. Only people close by hear you, and nothing is ever recorded.');
    V.sw = el('button', 'set-switch', '', { type: 'button', role: 'switch', 'aria-checked': 'false', id: 'vc-switch', 'aria-label': 'Voice chat', 'data-autofocus': '' });
    V.sw.append(el('span', '', 'Off'));
    V.sw.onclick = () => { prefs.on = !wanted(); prefs.asked = true; savePrefs(); apply(); };
    r1.append(V.sw);
    // mode
    const r2 = row('vc-mode', 'How you talk');
    V.modeRow = r2;
    V.mode = el('div', 'set-seg', '', { role: 'radiogroup', 'aria-label': 'How you talk', id: 'vc-mode' });
    for (const [k, word] of [['open', 'Open mic'], ['ptt', 'Push to talk']]) {
      const bt = el('button', '', word, { type: 'button', role: 'radio', 'data-mode': k, 'aria-checked': 'false' });
      bt.onclick = () => { prefs.mode = k; savePrefs(); refresh(); };
      V.mode.append(bt);
    }
    r2.append(V.mode);
    // sensitivity + the live meter (open mic)
    V.sensRow = row('vc-sens', 'Sensitivity', 'Talk: the bar turns green when your voice would be sent. Slide right for quieter voices.');
    V.sens = el('input', '', '', { type: 'range', min: '0', max: '100', step: '5', id: 'vc-sens', 'aria-label': 'Microphone sensitivity' });
    V.sens.oninput = () => { prefs.sens = Number(V.sens.value); savePrefs(); refresh(); };
    V.sens.onkeydown = e => { if (e.key === 'Escape') V.sens.blur(); };
    V.meter = el('div', 'vc-meter', '', { 'aria-hidden': 'true' });
    V.fill = el('i', 'vc-fill'); V.thr = el('i', 'vc-thr');
    V.meter.append(V.fill, V.thr);
    const sensBox = el('div', 'vc-sensbox'); sensBox.append(V.sens, V.meter);
    V.sensRow.append(sensBox);
    // push to talk: which buttons
    V.pttRow = row('vc-ptt', 'Hold to talk');
    V.pttKeys = el('span', 'vc-keys');
    V.pttRow.append(V.pttKeys);
    // microphone
    V.micRow = row('vc-mic', 'Microphone');
    V.mic = el('button', 'btn vc-micbtn', 'Default', { type: 'button', id: 'vc-mic', title: 'Pick another microphone' });
    V.mic.onclick = () => {
      if (!mics.length) { listMics(); return; }
      const i = mics.findIndex(m => m.id === deviceId);
      deviceId = mics[(i + 1) % mics.length].id;
      store.set('voiceMic', deviceId);
      if (mic.stream) { closeMic(); openMic(); }
      refresh();
    };
    V.micRow.append(V.mic);
    // volume (its own level, inside the Voices bus of the Sound page)
    V.volRow = row('vc-vol', 'Voice chat volume', 'Other players. The Voices slider on the Sound page turns these down too.');
    V.vol = el('input', '', '', { type: 'range', min: '0', max: '150', step: '5', id: 'vc-vol', 'aria-label': 'Voice chat volume' });
    V.vol.oninput = () => { prefs.vol = Number(V.vol.value); savePrefs(); if (bus) bus.out.gain.setTargetAtTime(volGain(), audio.ctx.currentTime, 0.05); refresh(); };
    V.vol.onkeydown = e => { if (e.key === 'Escape') V.vol.blur(); };
    V.volOut = el('output', 'vc-volout', '');
    const volBox = el('div', 'vc-volbox'); volBox.append(V.vol, V.volOut);
    V.volRow.append(volBox);
    V.status = el('p', 'vc-status', '', { role: 'status' });
    b.append(V.status);
    ui.settings.onShow('voice', () => { if (mic.stream) listMics(); refresh(); });
    refresh();
  }

  function summary() {
    if (!caps.worklet) return 'Not in this browser';
    if (!wanted()) return 'Off';
    if (mic.state === 'denied' || mic.state === 'none') return 'On, listening only';
    return prefs.mode === 'ptt' ? `On, hold ${pttWord()} to talk` : 'On, open mic';
  }
  function refresh() {
    const on = wanted();
    if (section) {
      section.setSummary(summary());
      V.sw.setAttribute('aria-checked', on ? 'true' : 'false'); V.sw.firstElementChild.textContent = on ? 'On' : 'Off';
      for (const bt of V.mode.children) bt.setAttribute('aria-checked', bt.dataset.mode === prefs.mode ? 'true' : 'false');
      const open = prefs.mode === 'open';
      V.sensRow.hidden = !open || !on; V.pttRow.hidden = open || !on;
      V.modeRow.hidden = V.micRow.hidden = V.volRow.hidden = !on;
      if (String(prefs.sens) !== V.sens.value) V.sens.value = String(prefs.sens);
      if (String(prefs.vol) !== V.vol.value) V.vol.value = String(prefs.vol);
      V.volOut.textContent = prefs.vol + '%';
      V.thr.style.left = ((thrDb() + 70) / 70 * 100).toFixed(1) + '%';
      V.pttKeys.textContent = `B on the keyboard, ${input.pad.btnName('KeyB')} on a controller, or hold the mic button`;
      const m = mics.find(x => x.id === deviceId);
      V.mic.textContent = (m ? m.label : mic.label || 'Default') + (mics.length > 1 ? '  (change)' : '');
      V.status.textContent = !caps.worklet ? 'Voice chat does not work in this browser.'
        : !on ? 'Voice chat is off: you do not hear anyone and nobody hears you.'
        : mic.state === 'asking' ? 'Asking the browser for the microphone...'
        : mic.state === 'live' ? 'Microphone on. ' + (open ? 'It sends when you talk.' : 'It sends while you hold the button.')
        : mic.err || 'Microphone off.';
    }
    pill.hidden = !caps.worklet; // a browser without voice chat gets no button
    const st = !on ? 'off' : mic.state === 'asking' ? 'asking' : mic.state === 'live' ? (prefs.mode === 'ptt' ? 'ptt' : micOff ? 'muted' : 'live') : mic.state === 'denied' || mic.state === 'none' ? 'blocked' : 'asking';
    if (st !== pillState) { pill.classList.remove(pillState); pill.classList.add(st); pillState = st; }
    pill.title = st === 'ptt' ? `Hold to talk (or hold ${pttWord()})` : TOGGLE_TIP[st];
    pill.setAttribute('aria-pressed', st === 'live' || st === 'ptt' ? 'true' : 'false');
    pillText();
  }
  let pillWord = '';
  function pillText() {
    const w = pillState === 'off' ? 'Voice off' : pillState === 'blocked' ? 'No mic' : pillState === 'asking' ? 'Asking' : tx ? 'Talking' : pillState === 'ptt' ? 'Hold ' + pttWord() : pillState === 'muted' ? 'Mic muted' : 'Mic on';
    if (w !== pillWord) { pillWord = w; pTxt.textContent = w; pill.setAttribute('aria-label', 'Microphone: ' + w); }
  }

  // ---------------------------------------------------------------- the who's-here list: mute
  let whoBox = null;
  function whoRow(row, r) {
    whoBox = row.parentElement;
    const micI = el('i', 'who-mic'); micI.title = 'Has voice chat on'; micI.hidden = !r.ext?.vc;
    const b = el('button', 'who-mute', '', { type: 'button', 'data-sid': String(r.sid) });
    const sync = () => { const m = muted.has(r.sid); b.textContent = m ? 'Unmute' : 'Mute'; b.setAttribute('aria-pressed', m ? 'true' : 'false'); b.setAttribute('aria-label', (m ? 'Unmute ' : 'Mute ') + r.name); row.classList.toggle('muted', m); };
    b.onclick = e => {
      e.stopPropagation();
      const on = !muted.has(r.sid);
      if (on) { muted.add(r.sid); voices.get(r.sid)?.dispose(); voices.delete(r.sid); } else muted.delete(r.sid);
      net.send({ t: 'vmute', sid: r.sid, on });
      sync();
      audio.ui?.('blip');
      if (whoBox) { clearTimeout(whoBox._t); whoBox._t = setTimeout(() => { whoBox.hidden = true; }, 8000); } // keep the list up a bit longer
    };
    b._sync = sync;
    sync();
    row.append(micI, b);
  }
  function refreshWho() { for (const b of document.querySelectorAll('#who .who-mute')) b._sync?.(); }

  // ---------------------------------------------------------------- per frame
  let meterDb = -100, zoneT = 0, paramT = 0, selfLevel = 0, selfTag = null, selfTagFor = null;
  const lst = { x: 0, y: 0, z: 0, under: false };
  function update(dt, now) {
    if (!section) buildSettings();
    // the question, once, as soon as we know what your record says (or the server is not there)
    if (askState === 'idle' && !prefs.asked && !noAsk && caps.worklet && (fromServer || (net.status !== 'online' && now > 8)) && ctx.mode === 'play' && $('#help').hidden && !document.body.classList.contains('tutorial-on')) ask(); // (after the first-time tutorial)
    if (askState === 'showing' && !$('#voice-ask').hidden && ctx.mode !== 'play') $('#voice-ask').hidden = true;

    const t = performance.now() / 1000;
    const P = player.pos;
    lst.x = P.x; lst.y = P.y + HEAD; lst.z = P.z;
    lst.under = player.animName === 'swim' && P.y < WATER_Y - DIVE;
    // your own avatar talks with your voice
    selfLevel += ((tx ? txLevel : 0) - selfLevel) * Math.min(1, dt * (txLevel > selfLevel ? 30 : 12));
    const me = player.character;
    if (me) me.voiceLevel = selfLevel;
    if (selfTagFor !== me?.root) { selfTagFor = me?.root; selfTag = null; for (const it of ui.items) if (it.tag && it.obj === selfTagFor) selfTag = it; }
    selfTag?.node.classList.toggle('talking', tx);
    if (!pill.hidden) {
      pill.classList.toggle('talking', tx);
      pill.style.setProperty('--lvl', (tx ? Math.max(0.15, txLevel) : 0).toFixed(2));
      pillText();
    }
    if (V && !V.sensRow.hidden && !$('#help').hidden) { // the live meter
      meterDb = Math.max(mic.db, meterDb - 45 * dt); // falls back slowly, so a word is readable on the bar
      const p = Math.max(0, Math.min(100, (meterDb + 70) / 70 * 100));
      V.fill.style.width = p.toFixed(1) + '%';
      V.meter.classList.toggle('open', tx);
    }
    if (!bus) return;

    // the room you are in
    zoneT -= dt;
    if (zoneT <= 0) {
      zoneT = 0.25;
      setZone(zoneAt(lst.x, lst.y, lst.z, { woods: LIGHT.woods, storm: WEATHER.local, underwater: lst.under }));
      if (t - wallsAt > 10) { walls = wallsFrom(ctx.colliders); wallsAt = t; }
    }
    if (!voices.size) return;
    paramT -= dt;
    const doParams = paramT <= 0;
    if (doParams) paramT = 0.08;
    const at = audio.ctx.currentTime, Z = ZONES[bus.zone] || ZONES.open;
    for (const [sid, v] of voices) {
      const r = remotes.map.get(sid);
      if (!r || t - v.lastAt > IDLE) { v.dispose(); voices.delete(sid); continue; }
      // the mouth: the level you are hearing right now
      v.an.getFloatTimeDomainData(scratch);
      let e = 0;
      for (let i = 0; i < 256; i++) e += scratch[i] * scratch[i];
      const lv = levelOf(Math.sqrt(e / 256));
      v.level += (lv - v.level) * Math.min(1, dt * (lv > v.level ? 30 : 12));
      r.ch.voiceLevel = v.level;
      if (lv > 0.08) v.talkUntil = t + 0.5; // through the gaps between syllables
      const talking = t < v.talkUntil;
      if (talking !== v.inRx) { v.inRx = talking; r.tag?.node.classList.toggle('talking', talking); }
      if (talking && (v.gainNow || 0) > (audio.talkNear || 0)) audio.talkNear = v.gainNow; // the ambience leans back (audio.js reads and clears it each frame)
      if (!doParams) continue;
      const rp = r.ch.root.position, hx = rp.x, hy = rp.y + HEAD, hz = rp.z;
      const d = Math.hypot(hx - lst.x, hy - lst.y, hz - lst.z);
      const last = r.buf[r.buf.length - 1], anim = ANIM_CODES[last?.a] || 'idle';
      const under = anim === 'swim' && rp.y < WATER_Y - DIVE;
      const mf = muffleBetween(walls, lst.x, lst.y, lst.z, hx, rp.y + 0.5, hz); // (rooms inside buildings count, an open door less)
      v.wall = mf > 0; v.muffle = mf;
      v.dist = d;
      const g = falloff(d, t < v.loudUntil) * muffleGain(mf);
      v.gainNow = g;
      v.g.gain.setTargetAtTime(g, at, 0.05);
      v.lp.frequency.setTargetAtTime(under ? 600 : muffleLp(mf), at, 0.08);
      v.burble.setTargetAtTime(under || lst.under ? 1 : 0, at, 0.2);
      v.breath.setTargetAtTime(anim === 'run' || anim === 'climb' ? 1 : 0, at, 0.3);
      v.send.gain.setTargetAtTime(Z.wet * (0.8 + 0.8 * (1 - g)) * (g > 0 ? 1 : 0), at, 0.1); // farther away = wetter
      audio.movePanner(v.pan, hx, hy, hz);
    }
  }

  // keys: B is push to talk (eaten so nothing else reads it); while the question is up it owns the keyboard
  function onKey(code) {
    if (askState === 'showing') { if (code === 'Escape') answer(false); return true; }
    if (performance.now() - answeredAt < 400 && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyE')) return true;
    return code === PTT_KEY;
  }

  // ---------------------------------------------------------------- tests (tools/voice-*.mjs)
  const api = {
    get prefs() { return { ...prefs }; }, caps, stats, voices, muted, mic, get micOff() { return micOff; }, get toggleState() { return pillState; },
    get active() { return active; }, get tx() { return tx; }, get loud() { return tx && mic.db > SHOUT_DB; }, /* (the maze hears a shout further) */  get codec() { return codec; }, get zone() { return bus?.zone || null; }, get heard() { return heard; },
    get ask() { return askState; }, thrDb, answer, apply, openSettings, holdMic, get held() { return holds.size > 0; },
    set(p) { Object.assign(prefs, p); savePrefs(); return apply(); },
    // a stereo tap on the voice bus (after the zone low-pass and the volume): { l, r } RMS right now
    probe() {
      if (!bus) return null;
      if (!bus.tap) {
        const a = audio.ctx, sp = a.createChannelSplitter(2);
        const l = a.createAnalyser(), rr = a.createAnalyser(); l.fftSize = rr.fftSize = 2048;
        bus.out.connect(sp); sp.connect(l, 0); sp.connect(rr, 1);
        bus.tap = { l, r: rr, buf: new Float32Array(2048) };
      }
      const T = bus.tap, rms = an => { an.getFloatTimeDomainData(T.buf); let e = 0; for (let i = 0; i < T.buf.length; i++) e += T.buf[i] ** 2; return Math.sqrt(e / T.buf.length); };
      return { l: rms(T.l), r: rms(T.r) };
    },
    reverb() { const c = bus?.convs[bus.cur]; return c ? { zone: bus.zone, irZone: c.zone, secs: c.c.buffer ? c.c.buffer.duration : 0, wet: ZONES[bus.zone].wet, lp: ZONES[bus.zone].lp } : null; },
    voiceInfo(sid) { const v = voices.get(sid); return v ? { level: v.level, gain: v.gainNow, wall: v.wall, muffle: v.muffle, dist: v.dist, lp: v.lp.frequency.value } : null; },
    playStats(sid) { const v = voices.get(sid); if (!v) return Promise.resolve(null); return new Promise(res => { const h = e => { if (e.data.stats) { v.node.port.removeEventListener('message', h); res(e.data.stats); } }; v.node.port.addEventListener('message', h); v.node.port.start(); v.node.port.postMessage({ stats: 1 }); setTimeout(() => res(null), 500); }); },
  };

  return {
    name: 'voice', update, onKey, whoRow, api, // (no help line: B and LB are on the Controls picture, controls-map.js)
  };
}
