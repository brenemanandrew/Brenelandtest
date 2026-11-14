// The lobby's sound, built with Web Audio: wind and birds everywhere, beds that follow the nearest shore, woods and street, and a
// positional soundscape at every game area. Most effects play real recordings once loaded (sfx-bank.js, sfx-map.js,
// public/audio/sfx). The synth here and in each feature's builder is the fallback and covers what the packs don't have. The
// footsteps are our own synth. The dogs and the scouts have real voices, and music.js plays our own generated music on its own bus.
//
// ---- The mix (measured: `node tools/audio-levels.mjs`, full table in docs/audio-levels.md)
// Targets after the master stage, one sound on its own, the listener (the camera) 3 m away unless noted:
//   ambience bed (wind + surf + woods + street + the area loops): RMS -38..-34 dBFS inland, -35..-31 on the shore and the dock.
//     The surf is full only on the sand and the dock, 20 dB or more down 25 m from the water, darker as it fades, and comes in
//     waves, never a flat hiss. While someone talks near you the whole ambience dips, at most AMB_DUCK_DB.
//     `node tools/sound-moderation-test.mjs` checks all of it at fixed spots, day and night.
//   critters (birds, gulls, crows, woodpecker): peaks -36..-28 at their usual 10-20 m, above the bed but never in your face
//   footsteps: peaks -28..-22 (wood loudest, sand softest)          UI blips and pops: peaks -30..-20
//   voices: peaks -17..-12 close; a crowd talking at once is ducked so it sums to about one loud voice
//   feature effects: peaks -24..-13; the big moments (launch sproing, champion fanfare, a catch) -13..-8, clearly the loudest
//   master: glue compressor -> limiter -> soft clipper: nothing leaves the engine above -1 dBFS however much happens at once
//   music (music.js): by day about -37 LUFS on average, about the ambience bed. Evenings 2 dB softer, late at night 4.
//     Dips by MUSIC_DUCK_DB while someone talks near you.
// Buses: sfx (footsteps, UI, every registered effect, doors), amb (beds, critters, area soundscapes), voices (babble, dogs,
// unicorns), music (the yard's rotation, the boat's tune). Each has a user level (the sliders in Settings > Sound, `setLevel`);
// `SFX_MIX` below trims the synthesised effects (a real clip's level is its own, in sfx-map.js).
import { COAST, WALK, STREET, DOCK, SWING_TREE, WOODS_EDGE, lakeAt } from './layout.js';
import { LIGHT, WEATHER } from './daynight-mats.js';
import { closestOnPoly } from './util.js';
import { createBoatMusic } from './boat-music.js';
import { playDogVoice, loadDogBank } from './dog-voice.js';
import { playSfx, loadSfxBank, playClipInto, loopSource } from './sfx-bank.js';
import { createMusic } from './music.js';
import { createDndSound } from './dnd-sound.js';   // the D&D back room's music, ambience and table sounds

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dbGain = db => Math.pow(10, db / 20);

// Level trims (dB) for the effects other modules register with registerSfx, so their builders stay as written.
// `lp` adds a lowpass (Hz) in front, to take the fizz off noise-heavy ones. Measured against the targets above.
export const SFX_MIX = {
  // swing: the builders boosted their outputs to beat a meter that read 7 dB low (a fresh context's HRTF warm-up)
  'swing-creak': { db: -7 }, 'swing-squeal': { db: -4 }, 'swing-whoosh': { db: -5 }, 'swing-pump': { db: -13 },
  'swing-perfect': { db: -2 }, 'swing-miss': { db: -12, lp: 2400 }, 'swing-sproing': { db: -5 }, 'swing-boing': { db: -11 },
  'swing-oof': { db: -10 }, 'swing-rustle': { db: -5, lp: 5500 }, 'swing-wings': { db: -4 }, 'swing-stars': { db: -2 },
  'swing-fanfare': { db: 2 },
  // fishing: the bite is unmistakable without jumping out. The catch and the golden fish are celebrations.
  'fish-whoosh': { db: 2 }, 'fish-plink': { db: -3 }, 'fish-splash': { db: -2 }, 'fish-tick': { db: 3 }, 'fish-bloop': { db: -5 },
  'fish-reel': { db: 3, lp: 7000 }, 'fish-catch': { db: 3 }, 'fish-golden': { db: 4 }, 'fish-junk': { db: -2, lp: 2600 },
  'fish-toss': { db: 4 }, 'fish-thud': { db: -5 }, 'fish-pop': { db: -2 }, 'fish-item': { db: 1 },
  // dogs: the yipe sits on the quieter voice bus, so it gets some back. The thump is a big low bump.
  'yipe': { db: 4, lp: 5000 }, 'crunch': { db: -3 }, 'dogthump': { db: -6 },
};

// Far-away critters (update() plays them; exported for tools/audio-levels.mjs)
export const CRITTERS = { crowFar: 0.13, barkFar: 0.09, owl: 0.08, crickets: 0.22 };

// Bus trims (the voice bus comes in about 5 dB over everything else).
const MIX = { sfx: 1, voices: 0.56 };

// The ambience's own trims: every area soundscape (loops and events) sits this far under where it was mixed, and the whole
// ambience bus dips by up to this much while someone talks near you.
const AREA_DB = -3;
// the real fire loop's level on a fire's table at full blaze (measured: tools/audio-levels.mjs group firepit)
const FIRE_LOOP = 0.5;
export const AMB_DUCK_DB = -4;
// the music leans back further while someone talks near you
export const MUSIC_DUCK_DB = -8;
// the catch sting (The Reel Winner) plays at most this often; every big catch gets it
export const STING_EVERY = 60;
// The surf by how far you stand from the water (m -> dB on top of the panner's gentle inverse falloff): full on the sand
// and the dock, then away fast, so it is a beach sound and not the whole lawn's. Exported for the test.
export const SURF_NEAR = { full: 4, perM: 0.62, floor: -34 };
export const surfNearDb = d => Math.max(SURF_NEAR.floor, -SURF_NEAR.perM * Math.max(0, d - SURF_NEAR.full));

// A soft clipper: straight up to 0.6, then bends smoothly toward 0.89 (-1 dBFS). The limiter in front of it does the real
// work; this only catches what a limiter lets through in its first milliseconds.
function clipCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.6 ? a : 0.6 + 0.29 * Math.tanh((a - 0.6) / 0.29));
  }
  return c;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.85;
    this.tables = [];
    this.timers = {};
    this.listener = { x: 0, y: 1.6, z: 0 };
    // user levels, 0..1.5 (1 = as mixed); the ? panel sliders set them, persisted by main.js
    this.levels = { master: 1, sfx: 1, amb: 1, voices: 1, music: 1 };
    this.voiceLog = []; // [endTime, weight] of the voices talking right now (crowd ducking)
    // little spots of ambience that are not game areas: they start and stop like the area soundscapes
    this.tables.push({ theme: 'swingtree', x: SWING_TREE.x, z: SWING_TREE.z, node: null, next: {} });
    this.tables.push({ theme: 'dockboards', x: (DOCK.minX + DOCK.maxX) / 2, z: (DOCK.minZ + DOCK.maxZ) / 2, node: null, next: {} });
    // the music mode: 'lobby' (the soundscape as ever) or 'boat' (aboard Kevin's boat: boat-music.js, local only)
    this.boatMusic = createBoatMusic(this);
    // the music (music.js: our own songs by place and hour); main.js sets musicApi.blocker (the intro, the tutorial, a mini-game) and
    // musicApi.place (the area, the store or the Lovecraft house, fishing)
    this.musicApi = createMusic(this);
    // the D&D back room (dnd-sound.js): main.js sets backroom.source and wires it to the table
    this.backroom = createDndSound(this);
    this.stingAt = -1e9;
  }
  setMusicMode(m) { this.boatMusic.setMode(m); }
  // the music answers a catch (the fishing song dips under the sting and replies in its key)
  musicCue(name) { if (name === 'fish-catch') { try { this.musicApi.cue('catch'); } catch (err) { console.error('[audio] music cue', err); } } }
  get musicMode() { return this.boatMusic.mode; }

  get ready() { return !!this.ctx; }

  // ------------------------------------------------------------ feature sound effects
  // Features register their own effects instead of editing this file:
  //   audio.registerSfx('splash', (a, x, y, z, opts) => { const out = a.at(x, y, z); a.burst(out, {...}); });
  //   audio.play('splash', x, y, z, { size: 1 });      // positional (x,y,z = world position)
  //   audio.play('reel-click');                         // no position: plays straight to the sfx bus
  // `a` is this engine, so a.tone / a.burst / a.at / a.noise / a.filter / a.gain / a.verbIn are all available.
  // Write peaks of about 0.05 to 0.3; SFX_MIX (top of this file) trims each one into the mix.
  registerSfx(name, fn) { (this.sfxLib || (this.sfxLib = {}))[name] = fn; }
  play(name, x, y, z, opts = {}) {
    if (!this.ctx || this.muted) return;
    const fn = this.sfxLib && this.sfxLib[name];
    if (!fn) return;
    // the real clip when the bank has it (sfx-bank.js); the catch sting at most once a minute (every big catch gets it)
    const sting = name === 'fish-catch', t = this.ctx.currentTime;
    if (!sting || opts.big || t - this.stingAt >= STING_EVERY) {
      try { if (playSfx(this, name, x, y, z, opts)) { if (sting) this.stingAt = t; this.musicCue(name); return; } } catch (err) { console.error('[audio] clip', name, err); }
    }
    this.lastSfx = { name, real: false };
    try { fn(this.mixFor(name), x, y, z, opts); } catch (err) { console.error('[audio] sfx', name, err); }
    this.musicCue(name);
  }
  // The engine as the effect sees it: `sfx` and `voices` (and so at() / atVoice() / speak()) lead through that
  // effect's trim. Created lazily, only for effects that have one.
  mixFor(name) {
    const m = SFX_MIX[name];
    if (!m) return this;
    const eng = this, a = Object.create(this), cache = {};
    const trim = bus => {
      if (cache[bus]) return cache[bus];
      const g = eng.gain(dbGain(m.db || 0));
      g.connect(eng[bus]);
      let head = g;
      if (m.lp) { head = eng.filter('lowpass', m.lp, 0.7); head.connect(g); }
      return (cache[bus] = head);
    };
    Object.defineProperty(a, 'sfx', { get: () => trim('sfx') });
    Object.defineProperty(a, 'voices', { get: () => trim('voices') });
    return a;
  }

  // Must be called from a click/tap (browser autoplay rules).
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.init(new AC());
    this.loadDogs();
    this.loadSfx();
  }
  // The real effects (sfx-bank.js), the same way: a moment after the click that switched the sound on; until then, and for
  // any clip that fails, the synthesised sound plays.
  loadSfx(delayMs = 900) {
    if (this.sfxBank || !this.ctx) return this.sfxBank;
    this.sfxBank = new Promise(res => setTimeout(res, delayMs)).then(() => loadSfxBank(this.ctx)).catch(() => null);
    return this.sfxBank;
  }
  // The dogs' real recordings (dog-voice.js): fetched and decoded only once the sound is on, a moment after the click that
  // switched it on (until then, and if they fail, the dogs are quiet).
  loadDogs(delayMs = 600) {
    if (this.dogBank || !this.ctx) return this.dogBank;
    this.dogBank = new Promise(res => setTimeout(res, delayMs)).then(() => loadDogBank(this.ctx)).catch(() => null);
    return this.dogBank;
  }

  // Separate from start() so an OfflineAudioContext can be used in tests.
  init(ctx, { beds = true } = {}) {
    this.ctx = ctx;
    // master stage: glue compressor -> limiter -> soft clip
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * this.levelGain('master');
    // a DynamicsCompressorNode adds its own make-up gain, and the trim in front cancels it (measured: -0.74 dB overall)
    const trim = this.gain(0.49);
    const glue = ctx.createDynamicsCompressor(); // gentle: from about -10 dBFS, 2:1
    glue.threshold.value = -20; glue.knee.value = 6; glue.ratio.value = 2; glue.attack.value = 0.005; glue.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor(); // the ceiling: 12 dB too hot still leaves at about -1 dBFS
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    const clip = ctx.createWaveShaper(); clip.curve = clipCurve(); clip.oversample = '2x';
    this.master.connect(trim).connect(glue).connect(lim).connect(clip).connect(ctx.destination);
    this.glue = glue; this.limiter = lim;

    // user level per bus (the sliders), then the buses themselves
    this.levelNodes = {};
    for (const k of ['sfx', 'amb', 'voices', 'music']) { const g = this.levelNodes[k] = ctx.createGain(); g.gain.value = this.levelGain(k); g.connect(this.master); }
    // music -> the talk duck (update() dips it while someone talks near you) -> the Music slider
    this.musicDuck = ctx.createGain(); this.musicDuck.connect(this.levelNodes.music); this.musicDuckK = 1;
    this.music = ctx.createGain(); this.music.connect(this.musicDuck);
    this.sfx = ctx.createGain(); this.sfx.gain.value = MIX.sfx; this.sfx.connect(this.levelNodes.sfx);
    // amb -> the talk duck (update() dips it while someone talks near you) -> the Ambience slider
    this.ambDuck = ctx.createGain(); this.ambDuck.connect(this.levelNodes.amb); this.ambDuckK = 1;
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.ambDuck);
    this.amb.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 2);
    // voices -> crowd duck (update() lowers it while many talk at once)
    this.voiceDuck = ctx.createGain(); this.voiceDuck.connect(this.levelNodes.voices);
    this.voices = ctx.createGain(); this.voices.gain.value = MIX.voices; this.voices.connect(this.voiceDuck);

    // shared noise + a small generated reverb
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), br = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    // brown noise, run twice round the buffer so its end flows into its start. The beds loop it, and a one-pass buffer
    // thumps at every loop.
    let last = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < len; i++) { last = (last + 0.02 * w[i]) / 1.02; br[i] = last * 3.5; }
    const irLen = ctx.sampleRate * 1.8;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
    }
    // two reverb sends so the ambience slider also takes the ambience's reverb tails with it
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.35;
    this.verbIn.connect(this.verb).connect(this.levelNodes.sfx);
    this.ambVerb = ctx.createConvolver(); this.ambVerb.buffer = ir;
    this.ambVerbIn = ctx.createGain(); this.ambVerbIn.gain.value = 0.35;
    this.ambVerbIn.connect(this.ambVerb).connect(this.levelNodes.amb);

    if (beds) this.buildBeds();
    this.plucks = this.makePlucks();
    for (const t of this.tables) t.node = null; // lazily created when in range
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume * this.levelGain('master'), this.ctx.currentTime, 0.08);
  }

  // Slider value (0..1.5, 1 = as mixed) to a gain: squared, so the slider feels even (half way = -12 dB).
  levelGain(name) { const v = this.levels[name] ?? 1; return v * v; }
  // setLevel('master' | 'sfx' | 'amb' | 'voices' | 'music', 0..1.5). Works before start(): init() picks the values up.
  setLevel(name, v) {
    if (!(name in this.levels)) return;
    this.levels[name] = Math.max(0, Math.min(1.5, Number(v) || 0));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (name === 'master') this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * this.levelGain('master'), t, 0.05);
    else this.levelNodes[name].gain.setTargetAtTime(this.levelGain(name), t, 0.05);
  }

  // ------------------------------------------------------------ building blocks

  noise(type = 'white', loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = type === 'brown' ? this.brown : this.white;
    s.loop = loop;
    if (loop) { // start somewhere random in the buffer (so two beds never line up) but always loop the whole, seamless buffer
      const start = s.start.bind(s), off = Math.random() * 1.9;
      s.start = (when = 0, offset = off, ...rest) => start(when, offset, ...rest);
    }
    return s;
  }
  filter(type, freq, Q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = Q;
    return f;
  }
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  panner(x, y, z, ref = 4, rolloff = 1.2) {
    const p = new PannerNode(this.ctx, {
      panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, maxDistance: 400, rolloffFactor: rolloff,
    });
    this.movePanner(p, x, y, z, true);
    return p;
  }
  movePanner(p, x, y, z, now = false) {
    const t = this.ctx.currentTime;
    if (p.positionX) {
      if (now) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
      else { p.positionX.setTargetAtTime(x, t, 0.15); p.positionY.setTargetAtTime(y, t, 0.15); p.positionZ.setTargetAtTime(z, t, 0.15); }
    } else p.setPosition(x, y, z);
  }
  env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  // A one-shot tone into `out` (its reverb send goes to out.verbDest when the output belongs to the ambience)
  tone(out, { f = 440, type = 'sine', t = this.ctx.currentTime, a = 0.005, peak = 0.2, d = 0.3, glide = null, verb = 0 }) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
    const g = this.gain(0);
    this.env(g, t, a, peak, d);
    o.connect(g).connect(out);
    if (verb) { const s = this.gain(verb); g.connect(s).connect(out.verbDest || this.verbIn); }
    o.start(t); o.stop(t + a + d + 0.05);
  }
  burst(out, { t = this.ctx.currentTime, dur = 0.08, type = 'bandpass', f = 1000, Q = 1, peak = 0.3, brown = false, attack = 0.003, sweep = null }) {
    const s = this.noise(brown ? 'brown' : 'white', false);
    const fl = this.filter(type, f, Q);
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = this.gain(0);
    this.env(g, t, attack, peak, dur);
    s.connect(fl).connect(g).connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + attack + 0.05);
  }
  // one-shot at a world position, on the effects bus
  at(x, y, z, ref = 5, rolloff = 1.2) {
    const p = this.panner(x, y, z, ref, rolloff);
    p.connect(this.sfx);
    setTimeout(() => p.disconnect(), 6000);
    return p;
  }
  // the same on the ambience bus (critters, the shore): follows the Ambience slider
  atAmb(x, y, z, ref = 5, rolloff = 1.2) {
    const p = this.panner(x, y, z, ref, rolloff);
    p.connect(this.amb);
    p.verbDest = this.ambVerbIn;
    setTimeout(() => p.disconnect(), 6000);
    return p;
  }

  makePlucks() {
    // Karplus-Strong plucked strings for the picnic guitar
    const sr = this.ctx.sampleRate;
    const notes = [48, 52, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
    const out = {};
    for (const n of notes) {
      const f = midi(n), N = Math.round(sr / f), len = Math.floor(sr * 1.6);
      const buf = this.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
      const ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const nx = (idx + 1) % N;
        const v = (ring[idx] + ring[nx]) * 0.4985;
        d[i] = ring[idx] * 0.5;
        ring[idx] = v; idx = nx;
      }
      // fade the last 60 ms: the string is cut when the buffer ends
      const fade = Math.floor(sr * 0.06);
      for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
      out[n] = buf;
    }
    return out;
  }
  pluck(out, n, t, v = 0.3) {
    const b = this.plucks?.[n];
    if (!b) return;
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.gain(v);
    s.connect(g).connect(out);
    s.start(t);
  }

  // ------------------------------------------------------------ ambient beds

  buildBeds() {
    const ctx = this.ctx;
    // wind: always around you
    const wind = this.noise('brown');
    this.windF = this.filter('bandpass', 420, 0.6);
    this.windG = this.gain(0.07);
    wind.connect(this.windF).connect(this.windG).connect(this.amb);
    wind.start();

    // surf: sits on the nearest bit of coastline. update() makes waves of it (swell, break, draw back, lull), and the low roll
    // follows the swell a beat behind. surfAir + surfNear are the distance from the water: a lowpass and a gain (surfNearDb).
    this.surfP = this.panner(60, 0.5, 0, 6, 0.6);
    this.surfNear = this.gain(1); this.surfNearK = 1;
    this.surfAir = this.filter('lowpass', 1500, 0.5);
    this.surfAir.connect(this.surfNear).connect(this.surfP);
    this.surfG = this.gain(0.026);
    this.surfWashF = this.filter('lowpass', 420, 0.5);
    const surf = this.noise('white');
    surf.connect(this.surfWashF).connect(this.filter('lowpass', 900, 0.5)).connect(this.surfG).connect(this.surfAir);
    this.surfRoll = this.gain(0.031);
    const rumble = this.noise('brown');
    rumble.connect(this.filter('lowpass', 220)).connect(this.surfRoll).connect(this.surfAir);
    this.surfP.connect(this.amb);
    surf.start(); rumble.start();

    // woods rustle on the nearest tree line (leaves, not hiss: a soft band around 2.5 kHz)
    this.woodsP = this.panner(-64, 3, 0, 8, 1.0);
    const leaves = this.noise('white');
    this.leafG = this.gain(0.014);
    leaves.connect(this.filter('highpass', 1600, 0.6)).connect(this.filter('lowpass', 4800, 0.6)).connect(this.leafG).connect(this.woodsP);
    this.woodsP.connect(this.amb);
    leaves.start();

    // distant traffic hum from the street (it ebbs and flows a little: streetG)
    this.streetP = this.panner(0, 1, -48, 10, 1.0);
    const hum = this.noise('brown');
    this.streetG = this.gain(0.04);
    hum.connect(this.filter('lowpass', 300)).connect(this.streetG).connect(this.streetP);
    this.streetP.connect(this.amb);
    hum.start();

    this.woodsEdge = WOODS_EDGE; // layout.js: the line where Strickler Park turns into the woods
    this.nextWave = ctx.currentTime + 0.5; this.waveN = 0;

    // crickets (night only): two seamless loops of a few crickets each, sitting in the grass either side of you.
    // update() fades them in with `this.night` (set by daynight.js) and keeps them a few metres off.
    this.crickets = [];
    for (const [len, n, off] of [[3.6, 3, [-7, 3]], [5.4, 4, [6, -4]]]) {
      const src = ctx.createBufferSource();
      src.buffer = this.cricketBuffer(len, n); src.loop = true;
      const g = this.gain(0), p = this.panner(off[0], 0.3, off[1], 4, 1.0);
      src.connect(this.filter('bandpass', 4300, 1.2)).connect(g).connect(p);
      p.connect(this.amb);
      src.start();
      this.crickets.push({ g, p, off });
    }
  }

  // A loop of `n` crickets: each chirps a little train of pulses (a pure tone near 4-5 kHz) on its own beat. Every
  // cricket's beat divides the loop length exactly, so the loop is seamless.
  cricketBuffer(len, n) {
    const sr = this.ctx.sampleRate, N = Math.floor(sr * len), buf = this.ctx.createBuffer(1, N, sr), d = buf.getChannelData(0);
    for (let k = 0; k < n; k++) {
      const f = rand(3900, 4800), beats = Math.max(2, Math.round(len / rand(0.42, 0.85))), period = len / beats;
      const pulses = 2 + Math.floor(Math.random() * 3), pl = rand(0.011, 0.016), gap = rand(0.012, 0.02), amp = rand(0.18, 0.4), ph = Math.random() * period;
      for (let b = 0; b < beats; b++) {
        if (Math.random() < 0.12) continue; // a skipped chirp now and then
        for (let q = 0; q < pulses; q++) {
          const t0 = ph + b * period + q * (pl + gap), s0 = Math.floor(t0 * sr), ns = Math.floor(pl * sr);
          for (let i = 0; i < ns; i++) {
            const w = Math.sin(Math.PI * i / ns);
            d[(s0 + i) % N] += Math.sin(2 * Math.PI * f * (i / sr)) * w * w * amp;
          }
        }
      }
    }
    return buf;
  }
  // An owl in the woods: "hoo, hoo-hoooo", soft and low (night only, from update()).
  owl(x, y, z, vol = 0.1) {
    const out = this.atAmb(x, y, z, 6, 1);
    const t = this.ctx.currentTime, lp = this.filter('lowpass', 900, 0.7);
    lp.connect(out);
    const f0 = rand(360, 420);
    for (const [dt, len, k] of [[0, 0.32, 1], [0.62, 0.18, 0.85], [0.86, 0.6, 1]]) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0 * (k > 0.9 ? 1 : 1.04), t + dt); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + dt + len);
      const g = this.gain(0);
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(vol * k, t + dt + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + len);
      o.connect(g).connect(lp); o.start(t + dt); o.stop(t + dt + len + 0.05);
      const s = this.gain(0.25); g.connect(s).connect(this.ambVerbIn);
    }
  }

  // ------------------------------------------------------------ one-shots (critters on the ambience bus)

  bird(x, y, z) {
    const out = this.atAmb(x, y, z, 3, 1.1);
    const t0 = this.ctx.currentTime + 0.05;
    const kind = Math.random();
    if (kind < 0.4) { // tweet-tweet
      const base = rand(2600, 4200), n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.tone(out, { f: base, glide: base * rand(1.2, 1.5), t: t0 + i * 0.13, a: 0.005, d: 0.07, peak: 0.19 });
    } else if (kind < 0.7) { // warble
      const base = rand(1800, 2800);
      for (let i = 0; i < 6; i++) this.tone(out, { f: base * (1 + (i % 2) * 0.25), t: t0 + i * 0.06, a: 0.004, d: 0.05, peak: 0.13 });
    } else if (kind < 0.88) { // chickadee "fee-bee"
      this.tone(out, { f: 3900, glide: 3800, t: t0, a: 0.02, d: 0.3, peak: 0.12 });
      this.tone(out, { f: 3300, glide: 3250, t: t0 + 0.38, a: 0.02, d: 0.3, peak: 0.12 });
    } else { // mourning dove
      for (const [dt, f, dd] of [[0, 520, 0.35], [0.45, 600, 0.5], [1.05, 520, 0.4], [1.5, 500, 0.4]]) {
        this.tone(out, { f, glide: f * 0.93, t: t0 + dt, a: 0.08, d: dd, peak: 0.11, type: 'sine' });
      }
    }
  }
  gull(x, y, z) {
    const out = this.atAmb(x, y, z, 6, 1);
    const t = this.ctx.currentTime;
    const soft = this.filter('lowpass', 3200, 0.7); soft.connect(out);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const s = t + i * 0.32;
      o.frequency.setValueAtTime(1350, s); o.frequency.exponentialRampToValueAtTime(700, s + 0.28);
      const f = this.filter('bandpass', 1600, 4), g = this.gain(0);
      this.env(g, s, 0.02, 0.22, 0.26);
      o.connect(f).connect(g).connect(soft); o.start(s); o.stop(s + 0.35);
    }
  }
  crow(x, y, z, vol = 0.1) {
    const out = this.atAmb(x, y, z, 6, 1);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const s = t + i * 0.45;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(560, s); o.frequency.exponentialRampToValueAtTime(420, s + 0.3);
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 38;
      const lg = this.gain(120); lfo.connect(lg).connect(o.frequency);
      const f = this.filter('bandpass', 1100, 3), g = this.gain(0);
      this.env(g, s, 0.02, vol, 0.3);
      o.connect(f).connect(g).connect(out);
      o.start(s); lfo.start(s); o.stop(s + 0.4); lfo.stop(s + 0.4);
    }
  }
  woodpecker(x, y, z) {
    const out = this.atAmb(x, y, z, 6, 1);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 12; i++) this.burst(out, { t: t + i * 0.06, dur: 0.02, f: 1800, Q: 3, peak: 0.2 * (1 - i / 14) });
  }
  car() {
    const p = this.panner(-120, 0.8, STREET.z0 - 2, 8, 1);
    p.connect(this.amb);
    const n = this.noise('brown', true);
    const f = this.filter('lowpass', 500), g = this.gain(0);
    n.connect(f).connect(g).connect(p);
    const t = this.ctx.currentTime, dur = 7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + dur / 2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const z = dir > 0 ? STREET.z0 - 2.5 : STREET.z1 + 2.5;
    if (p.positionX) {
      p.positionX.setValueAtTime(dir > 0 ? -140 : 55, t); p.positionX.linearRampToValueAtTime(dir > 0 ? 55 : -140, t + dur);
      p.positionZ.setValueAtTime(z, t);
    }
    n.start(t); n.stop(t + dur + 0.1);
    setTimeout(() => p.disconnect(), (dur + 1) * 1000);
  }
  bark(x, z, vol = 0.12) {
    const out = this.atAmb(x, 0.6, z, 4, 1);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const s = t + i * 0.22;
      this.tone(out, { f: 380, glide: 240, t: s, a: 0.01, d: 0.12, peak: vol, type: 'square' });
      this.burst(out, { t: s, dur: 0.1, f: 900, Q: 1.5, peak: vol * 0.6 });
    }
  }
  // water lapping at the shore just in front of you: a small wash, sometimes with a plip
  lap(x, z, k = 1) {
    const out = this.atAmb(x, 0.2, z, 3, 1.4);
    const t = this.ctx.currentTime, f = rand(420, 700);
    this.burst(out, { t, dur: rand(0.35, 0.6), type: 'lowpass', f, sweep: f * 0.55, Q: 0.7, peak: 0.1 * k, attack: rand(0.06, 0.12) });
    this.burst(out, { t: t + 0.05, dur: 0.25, type: 'bandpass', f: rand(900, 1300), Q: 1.2, peak: 0.025 * k, attack: 0.05 });
    if (Math.random() < 0.35) this.tone(out, { f: rand(700, 1000), glide: rand(380, 480), t: t + rand(0.1, 0.3), a: 0.004, d: 0.06, peak: 0.03 * k });
  }
  // an old board or a rope complaining: a sawtooth squeezed through a narrow band, with a wobble
  creak(out, t, k = 1, low = false) {
    if (playClipInto(this, out, ['creak-01', 'creak-02', 'creak-03', 'creak-04'], t, { db: -25.5 + 20 * Math.log10(Math.max(0.05, k)), rate: low ? [0.5, 0.62] : [0.7, 0.88] }, 'creak')) return;   // a real creak (sfx-bank.js)
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    const f0 = rand(150, 230), dur = rand(0.35, 0.7);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rand(0.75, 0.9), t + dur);
    const wob = this.ctx.createOscillator(); wob.frequency.value = rand(14, 24);
    const wg = this.gain(f0 * 0.06); wob.connect(wg).connect(o.frequency);
    const bp = this.filter('bandpass', rand(650, 950), 7), g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * k, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(out);
    o.start(t); wob.start(t); o.stop(t + dur + 0.05); wob.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ voices

  // Sims-style babble: a buzzy source through moving vowel formants, with little
  // consonant bursts. Never real words - just the music of talking.
  //   v = { pitch (Hz), rate, formant (timbre scale), style: 'normal'|'gruff'|'whisper' }
  //   opts = { melody: [semitones...], sigh: true }
  speak(x, y, z, text, v = {}, opts = {}) {
    if (!this.ctx || !this.voices) return 0;
    const Lp = this.listener;
    const dist = Math.hypot(x - Lp.x, y - Lp.y, z - Lp.z);
    if (Math.hypot(x - Lp.x, z - Lp.z) > 45) return 0;
    // a crowd: when the voices already talking add up to more than about three close ones, a far voice keeps quiet
    const ctx = this.ctx, now = ctx.currentTime, weight = Math.min(1, 2.5 / Math.max(2.5, dist));
    const talking = this.voiceEnergy(now);
    if (talking > 3 && weight < 0.35) return 0;
    const style = v.style || 'normal';
    const pitch = v.pitch || 160, rate = v.rate || 1;
    const fk = v.formant || (pitch > 260 ? 1.2 : pitch > 190 ? 1.1 : 1);
    const clean = String(text).replace(/[*~]/g, ' ').trim();
    const laugh = /\b(ha|haha|hah|hehe|heh|lol|lmao)\b|laugh/i.test(clean);
    const question = /\?\s*$/.test(clean), exclaim = /!/.test(clean);
    let syl = Math.round(clean.replace(/[^a-z]/gi, '').length / 3.2);
    syl = Math.max(1, Math.min(9, syl));
    if (laugh) syl = 4;
    if (opts.melody) syl = opts.melody.length;
    if (opts.sigh) syl = 1;

    let r = 7;
    for (let i = 0; i < clean.length; i++) r = (r * 31 + clean.charCodeAt(i)) % 2147483647;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);

    const t0 = ctx.currentTime + 0.03;
    const out = this.panner(x, y, z, 2.5, 1.3);
    out.connect(this.voices);
    // source: a buzz (voice) or breath (whisper)
    let src, breath = null;
    if (style === 'whisper') src = this.noise('white', true);
    else {
      src = ctx.createOscillator(); src.type = 'sawtooth';
      src.frequency.setValueAtTime(pitch, t0);
      if (style === 'gruff' || v.nervous) {
        const vib = ctx.createOscillator(); vib.frequency.value = style === 'gruff' ? 31 : 7;
        const vg = this.gain(pitch * (style === 'gruff' ? 0.03 : 0.04));
        vib.connect(vg).connect(src.frequency); vib.start(t0); breath = vib;
      }
    }
    const pre = this.gain(style === 'whisper' ? 4 : 2.6);
    src.connect(pre);
    const F1 = this.filter('bandpass', 700, 5), F2 = this.filter('bandpass', 1200, 7), F3 = this.filter('bandpass', 2600, 5);
    const env = this.gain(0);
    pre.connect(F1).connect(this.gain(1)).connect(env);
    pre.connect(F2).connect(this.gain(0.75)).connect(env);
    pre.connect(F3).connect(this.gain(0.3)).connect(env);
    env.connect(out);
    // consonants (the whisper's hiss is kept out of the top octave)
    const ns = this.noise('white', true), nf = this.filter('bandpass', 3500, 1.2), nenv = this.gain(0);
    const soft = this.filter('lowpass', 7500, 0.7);
    ns.connect(nf).connect(nenv).connect(soft).connect(out);

    const VOW = [[800, 1200], [500, 1900], [310, 2250], [520, 880], [340, 800], [660, 1700], [450, 1500]];
    const CONS = ['p', 't', 'k', 's', 'sh', 'm', 'l', 'b', 'w', '', ''];
    const peak = (exclaim ? 0.5 : 0.38) * (style === 'whisper' ? 1.1 : 1);
    env.gain.setValueAtTime(0.0001, t0);
    nenv.gain.setValueAtTime(0.0001, t0);
    let t = t0;
    for (let i = 0; i < syl; i++) {
      let dur = (0.1 + rnd() * 0.07) / rate;
      if (laugh) dur = 0.11 / rate;
      if (opts.melody) dur = 0.22 / rate;
      if (opts.sigh) dur = 0.7;
      const [a1, a2] = laugh ? [820, 1250] : opts.sigh ? [700, 1150] : VOW[Math.floor(rnd() * VOW.length)];
      let f = pitch * (1 + 0.11 * Math.sin(i * 1.7 + (r % 5))) * (1 - 0.04 * i / syl) * (exclaim ? 1.12 : 1);
      if (question && i === syl - 1) f *= 1.3;
      if (laugh) f = pitch * (1.4 - i * 0.09);
      if (opts.melody) f = pitch * Math.pow(2, opts.melody[i] / 12);
      if (src.frequency) {
        src.frequency.setTargetAtTime(f, t, 0.02);
        if (opts.sigh) src.frequency.linearRampToValueAtTime(pitch * 0.7, t + dur);
        if (question && i === syl - 1) src.frequency.linearRampToValueAtTime(f * 1.15, t + dur);
      }
      const c = laugh ? 'h' : opts.sigh ? 'h' : opts.melody ? (i % 2 ? 'l' : 'd') : CONS[Math.floor(rnd() * CONS.length)];
      let vStart = t;
      if (c === 's' || c === 'sh' || c === 'h') {
        nf.frequency.setValueAtTime(c === 's' ? 5500 : c === 'sh' ? 2800 : 1500, t);
        nenv.gain.linearRampToValueAtTime(0.0001, t);
        nenv.gain.linearRampToValueAtTime(c === 'h' ? 0.35 : 0.25, t + 0.025);
        nenv.gain.linearRampToValueAtTime(0.0001, t + 0.065);
        vStart = t + 0.05;
      } else if (c === 'p' || c === 't' || c === 'k' || c === 'b' || c === 'd') {
        nf.frequency.setValueAtTime(c === 'p' || c === 'b' ? 900 : c === 't' || c === 'd' ? 4200 : 2200, t);
        nenv.gain.linearRampToValueAtTime(0.0001, t);
        nenv.gain.linearRampToValueAtTime(0.3, t + 0.006);
        nenv.gain.linearRampToValueAtTime(0.0001, t + 0.028);
        vStart = t + 0.022;
      } else if (c === 'm' || c === 'l' || c === 'w') {
        F1.frequency.setValueAtTime(290 * fk, t);
        F2.frequency.setValueAtTime((c === 'm' ? 1000 : c === 'w' ? 700 : 1300) * fk, t);
        vStart = t + 0.035;
      }
      F1.frequency.setTargetAtTime(a1 * fk, vStart, 0.014);
      F2.frequency.setTargetAtTime(a2 * fk, vStart, 0.014);
      F3.frequency.setTargetAtTime(2600 * fk, vStart, 0.02);
      env.gain.setTargetAtTime(peak * (0.8 + rnd() * 0.3), c === 'm' || c === 'l' || c === 'w' ? t : vStart, 0.012);
      env.gain.setTargetAtTime(0.0001, t + dur * (opts.sigh ? 0.9 : 0.8), 0.02);
      t += dur + (!opts.melody && rnd() < 0.18 && i < syl - 1 ? 0.07 / rate : 0.012);
    }
    const end = t + 0.2;
    src.start(t0); src.stop(end); ns.start(t0); ns.stop(end);
    if (breath) breath.stop(end);
    this.voiceLog.push([end, weight]);
    setTimeout(() => out.disconnect(), (end - ctx.currentTime + 0.5) * 1000);
    return end - t0;
  }
  // how many "close voices" are talking at time t (each weighted by distance, squared: an energy)
  voiceEnergy(t) {
    const log = this.voiceLog;
    let e = 0;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i][0] < t) { log.splice(i, 1); continue; }
      e += log[i][1] * log[i][1];
    }
    return e;
  }

  // one-shot on the voice bus (not faded with the ambience)
  atVoice(x, y, z) {
    const p = this.panner(x, y, z, 3, 1.2);
    p.connect(this.voices);
    setTimeout(() => p.disconnect(), 6000);
    return p;
  }

  // Emote noises: a quick "hiya", a laugh, a cheer, a hum while dancing...
  emoteVoice(e, x, y, z, v) {
    switch (e) {
      case 'wave': return this.speak(x, y, z, 'Hiya!', v);
      case 'cheer': return this.speak(x, y, z, 'Woo hoo hoo!', v);
      case 'laugh': return this.speak(x, y, z, 'haha', v);
      case 'highfive': return this.speak(x, y, z, 'Yeah!', v);
      case 'dance': return this.speak(x, y, z, 'da da da dum', v, { melody: [0, 4, 7, 12, 7, 4] });
      // the other dances each hum their own tune
      case 'ballet': return this.speak(x, y, z, 'la la laa', v, { melody: [0, 7, 12, 16, 12, 7] });
      case 'ballroom': return this.speak(x, y, z, 'one two three', v, { melody: [0, 4, 7, 0, 4, 7] });
      case 'hiphop': return this.speak(x, y, z, 'boom chk', v, { melody: [0, 0, 5, 0, 3, 0] });
      case 'sit': return this.speak(x, y, z, 'ahh', v, { sigh: true });
      case 'point': return this.speak(x, y, z, 'Look!', v);
    }
    return 0;
  }

  // Dogs (dog-voice.js), from real recordings once loaded (loadDogs), quiet until then. `mood` (excited, happy, alert, sad,
  // calm) picks and bends the clips, read from the text if left out. `voice`: slider values for this call (the NPC Editor's
  // preview), else the dog's saved ones. Returns what played ({ mood, kind, n, end, real, ids }) or undefined.
  dogVoice(who, x, y, z, text = '', mood = null, voice = null) {
    if (!this.ctx) return;
    if (Math.hypot(x - this.listener.x, z - this.listener.z) > 45) return;
    const out = this.gain(1.45);
    out.connect(this.atVoice(x, y, z));
    const r = playDogVoice(this, out, this.ctx.currentTime + 0.02, who, text, mood, voice);
    setTimeout(() => out.disconnect(), (r.end - this.ctx.currentTime + 1) * 1000);
    return r;
  }

  // the unicorns' neigh: a real zebra pitched up and brightened (sfx-map.js) once loaded. k = the unicorn's own pitch.
  neigh(x, y, z, k = 1) {
    if (!this.ctx) return;
    if (Math.hypot(x - this.listener.x, z - this.listener.z) > 45) return;
    if (playSfx(this, 'neigh', x, y, z, { k })) return;
    const out = this.gain(6.5);
    out.connect(this.atVoice(x, y, z));
    const t = this.ctx.currentTime + 0.02;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(950 * k, t); o.frequency.exponentialRampToValueAtTime(430 * k, t + 1.0);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 16;
    const lg = this.gain(80 * k); lfo.connect(lg).connect(o.frequency);
    const f = this.filter('bandpass', 1300 * k, 3), g = this.gain(0);
    this.env(g, t, 0.05, 0.16, 1.0);
    o.connect(f).connect(g).connect(out);
    o.start(t); lfo.start(t); o.stop(t + 1.15); lfo.stop(t + 1.15);
  }

  // ------------------------------------------------------------ player & ui

  footstep(surface) {
    if (!this.ctx) return;
    // our own synthesised steps on every surface, no real step clips
    const t = this.ctx.currentTime, o = this.sfx;
    if (surface === 'wood') {
      this.tone(o, { f: rand(110, 140), glide: 70, t, a: 0.002, d: 0.08, peak: 0.085 });
      this.burst(o, { t, dur: 0.04, f: 420, Q: 2, peak: 0.085 });
    } else if (surface === 'dirt') {
      this.burst(o, { t, dur: 0.07, f: rand(700, 950), Q: 0.9, peak: 0.19 });
    } else if (surface === 'sand') { // a soft shff
      this.burst(o, { t, dur: 0.12, type: 'bandpass', f: rand(2200, 3000), Q: 0.5, peak: 0.07, attack: 0.02 });
    } else {
      this.burst(o, { t, dur: 0.07, type: 'lowpass', f: rand(900, 1300), Q: 0.6, peak: 0.15 });
      this.burst(o, { t: t + 0.01, dur: 0.05, type: 'bandpass', f: 5200, Q: 0.6, peak: 0.022 });
    }
  }

  door(kind, x = 0, y = 2, z = -4) {
    if (!this.ctx) return;
    if (playSfx(this, kind === 'open' ? 'door-open' : 'door-close', x, y, z)) return;
    const out = this.at(x, y, z, 3, 1);
    const t = this.ctx.currentTime;
    // latch
    this.burst(out, { t, dur: 0.03, f: 2500, Q: 4, peak: 0.25 });
    this.burst(out, { t: t + 0.05, dur: 0.02, f: 3200, Q: 4, peak: 0.15 });
    if (kind === 'open') {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(95, t + 0.1);
      const wob = [];
      for (let i = 0; i < 16; i++) wob.push(90 + Math.sin(i * 1.7) * 18 + Math.random() * 12);
      o.frequency.setValueCurveAtTime(Float32Array.from(wob), t + 0.1, 1.1);
      const f = this.filter('bandpass', 1100, 6), g = this.gain(0);
      g.gain.setValueAtTime(0.0001, t + 0.1); g.gain.exponentialRampToValueAtTime(0.4, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      o.connect(f).connect(g).connect(out); o.start(t + 0.1); o.stop(t + 1.3);
    } else { // the door shutting behind you: a solid thud, not a slam
      this.tone(out, { f: 70, glide: 45, t: t + 0.02, a: 0.003, d: 0.35, peak: 0.13 });
      this.burst(out, { t: t + 0.02, dur: 0.18, type: 'lowpass', f: 400, peak: 0.1, brown: true });
    }
  }

  ui(kind) {
    if (!this.ctx) return;
    if (playSfx(this, 'ui-' + kind)) return;   // the whoosh is always synthesised
    const t = this.ctx.currentTime, o = this.sfx;
    if (kind === 'chime') { this.tone(o, { f: 880, t, d: 0.5, peak: 0.08, verb: 0.4 }); this.tone(o, { f: 1320, t: t + 0.08, d: 0.6, peak: 0.07, verb: 0.4 }); }
    if (kind === 'blip') this.tone(o, { f: 740, glide: 880, t, d: 0.08, peak: 0.05, type: 'triangle' });
    if (kind === 'pop') this.tone(o, { f: 600, glide: 300, t, d: 0.12, peak: 0.06 });
    if (kind === 'whoosh') this.burst(o, { t, dur: 0.9, f: 300, sweep: 3000, Q: 1.2, peak: 0.19, attack: 0.3 });
    if (kind === 'sparkle') for (let i = 0; i < 4; i++) this.tone(o, { f: midi(84 + PENTA[i * 2]), t: t + i * 0.07, d: 0.4, peak: 0.05, verb: 0.5 });
  }

  // ------------------------------------------------------------ game-area soundscapes

  addTable(theme, x, z) { this.tables.push({ theme, x, z, node: null, next: {} }); }

  ensureTable(tb) {
    if (tb.node) return tb.node;
    const near = tb.theme === 'swingtree' || tb.theme === 'dockboards' || tb.theme === 'hearth' || tb.theme === 'gasfire'; // small spots: heard from close by only
    const p = this.panner(tb.x, tb.y ?? (near ? 3 : 1.2), tb.z, near ? 3 : 3.5, near ? 1.6 : 1.35); // (tb.y: a fireplace upstairs)
    const out = this.gain(0);
    out.verbDest = this.ambVerbIn;
    out.connect(p).connect(this.amb);
    out.gain.setTargetAtTime(dbGain(AREA_DB), this.ctx.currentTime, 1);
    const loops = [];
    const loop = (src, chain) => { chain.reduce((a, b) => a.connect(b), src).connect(out); src.start(); loops.push(src); };
    switch (tb.theme) {
      case 'arkham': {
        for (const f of [55, 55.7, 82.6]) {
          const o = this.ctx.createOscillator(); o.frequency.value = f; o.type = 'sine';
          loop(o, [this.gain(0.047)]);
        }
        loop(this.noise('brown'), [this.filter('lowpass', 180), this.gain(0.065)]);
        break;
      }
      case 'campfire': { // the fire's breath. The crackles are events.
        const g = this.gain(0.13);
        loop(this.noise('brown'), [this.filter('lowpass', 320), g]);
        tb.fire = null; tb.breathG = g;
        break;
      }
      case 'firepit': // the lakeside firepit: its breath starts the first time the fire burns (tableEvents)
      case 'hearth': // a fireplace indoors (fires.js): the same, quieter, and only while you are in its room
        tb.breath = null; tb.fire = null;
        break;
      case 'gasfire': // Joyce's gas firepit (joyce-house.js): a soft hiss, made the first time it burns (tableEvents)
        tb.hiss = null;
        break;
      case 'dock': // no loop of its own: the water is the shore's surf, and the laps, creaks and gulls are events
        break;
      case 'garden':
      case 'flowers': {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 195;
        const trem = this.ctx.createOscillator(); trem.frequency.value = 11;
        const tg = this.gain(0.012); trem.connect(tg);
        const g = this.gain(0.016); tg.connect(g.gain);
        o.connect(this.filter('lowpass', 800)).connect(g).connect(out);
        o.start(); trem.start(); loops.push(o, trem);
        tb.bee = o;
        break;
      }
      case 'mushrooms': {
        for (const f of [220, 221.3, 330.4]) {
          const o = this.ctx.createOscillator(); o.frequency.value = f;
          loop(o, [this.gain(0.018)]);
        }
        break;
      }
      case 'generic':
        loop(this.noise('brown'), [this.filter('bandpass', 420, 0.8), this.gain(0.05)]);
        break;
      case 'swingtree': { // leaves in the big tree: a soft rustle that breathes with the wind
        const g = this.gain(0.012);
        loop(this.noise('white'), [this.filter('bandpass', 2600, 0.6), this.filter('lowpass', 6000, 0.6), g]);
        tb.leaves = g;
        break;
      }
      case 'dockboards': // just the events (creaks and knocks); the water is the shore's
        break;
    }
    tb.node = { p, out, loops };
    return tb.node;
  }

  // the real fire (the crackling loop, sfx-bank.js) on a fire's table: its gain (from 0) is the caller's; null until it has loaded
  fireLoop(tb) {
    const src = tb.node && loopSource(this, 'loop-fire');
    if (!src) return null;
    const g = this.gain(0);
    src.connect(g).connect(tb.node.out); src.start(); tb.node.loops.push(src);
    return (tb.fire = g);
  }

  dropTable(tb) {
    if (!tb.node) return;
    const n = tb.node;
    tb.node = null;
    n.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => { n.loops.forEach(s => { try { s.stop(); } catch { /* already stopped */ } }); n.p.disconnect(); }, 2500);
  }

  tableEvents(tb, now) {
    const t = this.ctx.currentTime, out = tb.node.out, nx = tb.next;
    const every = (key, a, b, fn) => { if (!nx[key]) nx[key] = now + rand(0, b); if (now >= nx[key]) { nx[key] = now + rand(a, b); fn(); } };
    switch (tb.theme) {
      case 'arkham':
        every('tick', 1, 1, () => { if (tb.stopped) return; tb.tock = !tb.tock; this.burst(out, { t, dur: 0.02, f: tb.tock ? 2200 : 1800, Q: 6, peak: 0.12 }); }); // tb.stopped: the clock stops while the door under the stairs is open
        every('whisper', 4, 9, () => {
          const s = this.noise('white', false), f = this.filter('bandpass', rand(1400, 2400), 4), g = this.gain(0);
          f.frequency.exponentialRampToValueAtTime(rand(600, 1000), t + 1.4);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
          s.connect(f).connect(g).connect(out); g.connect(this.ambVerbIn);
          s.start(t, rand(0, 1)); s.stop(t + 1.6);
        });
        every('crow', 12, 26, () => this.crow(tb.x - 5.6, 4, tb.z - 3.8, 0.12));
        break;
      case 'unicorns':
        every('note', 0.3, 0.55, () => {
          if (Math.random() < 0.18) return;
          const n = 72 + PENTA[Math.floor(Math.random() * PENTA.length)];
          this.tone(out, { f: midi(n), t, a: 0.003, d: 0.9, peak: 0.07, verb: 0.35 });
          this.tone(out, { f: midi(n + 12), t, a: 0.003, d: 0.4, peak: 0.02, type: 'triangle' });
        });
        every('sparkle', 2, 5, () => { // unicorn magic: a glassy ting (sfx-bank.js), the synth's three bells until it loads
          if (playClipInto(this, out, ['ui-sparkle-01', 'ui-sparkle-02', 'ui-sparkle-03', 'ui-sparkle-04'], t, { db: -21, rate: [1.4, 1.9] }, 'uni-sparkle')) return;
          for (let i = 0; i < 3; i++) this.tone(out, { f: midi(96 + PENTA[i * 2]), t: t + i * 0.06, d: 0.35, peak: 0.03, verb: 0.5 });
        });
        every('whinny', 16, 32, () => {
          if (playClipInto(this, out, ['neigh-01', 'neigh-02'], t, { db: -21, rate: [0.95, 1.15] }, 'uni-whinny')) return;   // the cartoon neigh
          const o = this.ctx.createOscillator(); o.type = 'sawtooth';
          o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(420, t + 1.1);
          const lfo = this.ctx.createOscillator(); lfo.frequency.value = 17;
          const lg = this.gain(70); lfo.connect(lg).connect(o.frequency);
          const f = this.filter('bandpass', 1300, 3), g = this.gain(0);
          this.env(g, t, 0.05, 0.08, 1.1);
          o.connect(f).connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + 1.3); lfo.stop(t + 1.3);
        });
        break;
      case 'campfire':
        if (!tb.fire && this.fireLoop(tb)) { tb.fire.gain.setTargetAtTime(FIRE_LOOP, t, 0.8); tb.breathG?.gain.setTargetAtTime(0, t, 0.8); }
        every('crackle', 0.05, 0.35, () => this.burst(out, { t, dur: rand(0.005, 0.03), type: 'bandpass', f: rand(1200, 3500), Q: 0.8, peak: rand(0.05, 0.22) }));
        every('pop', 2.5, 7, () => { this.burst(out, { t, dur: 0.012, type: 'bandpass', f: rand(700, 1400), Q: 1, peak: 0.3 }); this.burst(out, { t: t + 0.02, dur: 0.15, type: 'bandpass', f: rand(2000, 3000), Q: 0.8, peak: 0.05 }); });
        every('owl', 20, 40, () => { for (const [d, f] of [[0, 400], [0.5, 380], [0.75, 380]]) this.tone(out, { f, glide: f * 0.9, t: t + d, a: 0.05, d: 0.3, peak: 0.05 }); });
        break;
      case 'firepit': { // the wind chime on the string-light pole, then the fire: crackles and pops as thick as it is big
        every('chime', 3, 8, () => { for (let i = 0; i < 2; i++) this.tone(out, { f: rand(1400, 2600), t: t + i * 0.18, d: 1.2, peak: 0.025, verb: 0.5 }); });
        const k = tb.k || 0; // the fire's level (0..1, firepit.js sets it from the shared curve)
        if (k >= 0.03 && !tb.breath) { // the synth breath, made only once the fire burns (nothing runs while it's out)
          const g = this.gain(0), src = this.noise('brown');
          src.connect(this.filter('lowpass', 320)).connect(g).connect(out); src.start(); tb.node.loops.push(src);
          tb.breath = g;
        }
        // a real fire (the crackling loop, sfx-bank.js) takes over from the synthesised breath once it has loaded
        if (k >= 0.03 && !tb.fire) this.fireLoop(tb);
        if (tb.breath) tb.breath.gain.setTargetAtTime(tb.fire ? 0 : 0.13 * k, t, 0.8);
        if (tb.fire) tb.fire.gain.setTargetAtTime(FIRE_LOOP * k, t, 0.8);
        if (k < 0.03) { nx.crackle = nx.pop = 0; break; }
        every('crackle', 0.05 / k, 0.35 / k, () => this.burst(out, { t, dur: rand(0.005, 0.03), type: 'bandpass', f: rand(1200, 3500), Q: 0.8, peak: rand(0.05, 0.22) * (0.55 + 0.45 * k) }));
        every('pop', 2.5 / k, 7 / k, () => { this.burst(out, { t, dur: 0.012, type: 'bandpass', f: rand(700, 1400), Q: 1, peak: 0.3 * (0.5 + 0.5 * k) }); this.burst(out, { t: t + 0.02, dur: 0.15, type: 'bandpass', f: rand(2000, 3000), Q: 0.8, peak: 0.05 }); });
        break;
      }
      case 'hearth': { // a fireplace: a quiet crackle in its room. fires.js sets k (the fire's level, 0 when you are not in the room)
        const k = tb.k || 0;
        if (k >= 0.03 && !tb.breath) { const g = this.gain(0), src = this.noise('brown'); src.connect(this.filter('lowpass', 300)).connect(g).connect(out); src.start(); tb.node.loops.push(src); tb.breath = g; }
        if (k >= 0.03 && !tb.fire) this.fireLoop(tb);
        if (tb.breath) tb.breath.gain.setTargetAtTime(tb.fire ? 0 : 0.06 * k, t, 0.8);
        if (tb.fire) tb.fire.gain.setTargetAtTime(FIRE_LOOP * 0.4 * k, t, 0.8);
        if (k < 0.03) { nx.crackle = nx.pop = 0; break; }
        every('crackle', 0.08 / k, 0.5 / k, () => this.burst(out, { t, dur: rand(0.005, 0.025), type: 'bandpass', f: rand(1400, 3600), Q: 0.8, peak: rand(0.03, 0.1) * k }));
        every('pop', 4 / k, 10 / k, () => this.burst(out, { t, dur: 0.012, type: 'bandpass', f: rand(700, 1400), Q: 1, peak: 0.12 * k }));
        break;
      }
      case 'gasfire': { // Joyce's gas firepit: a soft steady hiss and a low breath while it burns (joyce-house.js sets k, 0..1)
        const k = tb.k || 0;
        if (k >= 0.03 && !tb.hiss) {
          const h = this.gain(0), src = this.noise('white'); src.connect(this.filter('bandpass', 4200, 0.7)).connect(h).connect(out); src.start(); tb.node.loops.push(src);
          const r = this.gain(0), low = this.noise('brown'); low.connect(this.filter('lowpass', 240)).connect(r).connect(out); low.start(); tb.node.loops.push(low);
          tb.hiss = h; tb.roar = r;
        }
        if (tb.hiss) { tb.hiss.gain.setTargetAtTime(0.03 * k, t, 0.6); tb.roar.gain.setTargetAtTime(0.06 * k, t, 0.6); }
        break;
      }
      case 'dock':
        every('lap', 0.9, 2.4, () => this.burst(out, { t, dur: rand(0.25, 0.55), type: 'lowpass', f: rand(320, 620), peak: rand(0.04, 0.09), attack: 0.06 }));
        every('creak', 5, 11, () => this.creak(out, t, 0.5));
        every('knock', 4, 9, () => this.tone(out, { f: 95, glide: 70, t, a: 0.004, d: 0.18, peak: 0.1 }));
        every('gull', 18, 40, () => this.gull(tb.x + 15, 10, tb.z + rand(-10, 10)));
        break;
      case 'dockboards': // out on the dock: boards and a mooring rope, now and then
        every('creak', 4, 9, () => this.creak(out, t, rand(0.35, 0.6)));
        every('knock', 6, 13, () => { this.tone(out, { f: rand(85, 110), glide: 60, t, a: 0.004, d: 0.16, peak: 0.07 }); this.tone(out, { f: rand(85, 110), glide: 60, t: t + rand(0.25, 0.5), a: 0.004, d: 0.14, peak: 0.045 }); });
        break;
      case 'swingtree':
        if (tb.leaves) tb.leaves.gain.setTargetAtTime(0.01 + Math.max(0, Math.sin(now * 0.31) + Math.sin(now * 0.83) * 0.4) * 0.012, t, 0.6);
        every('gust', 5, 12, () => { for (let i = 0; i < 3; i++) this.burst(out, { t: t + i * rand(0.12, 0.25), dur: rand(0.3, 0.6), f: rand(2200, 3400), Q: 0.7, peak: 0.03, attack: 0.12 }); });
        break;
      case 'picnic': {
        const prog = [[48, 52, 55, 60, 64], [57, 60, 64, 69, 72], [53, 57, 60, 65, 69], [55, 59, 62, 67, 71]];
        every('strum', 0.34, 0.34, () => {
          tb.step = (tb.step || 0) + 1;
          const chord = prog[Math.floor(tb.step / 8) % prog.length];
          const pattern = [0, 2, 1, 3, 2, 4, 3, 1];
          if (Math.random() < 0.9) this.pluck(out, chord[pattern[tb.step % 8]], t, 0.22);
        });
        break;
      }
      case 'garden':
      case 'flowers':
        if (tb.bee) tb.bee.frequency.setTargetAtTime(185 + Math.sin(now * 0.7) * 20 + Math.sin(now * 2.3) * 8, t, 0.2);
        every('chime', 3, 8, () => { for (let i = 0; i < 2; i++) this.tone(out, { f: rand(1400, 2600), t: t + i * 0.18, d: 1.2, peak: 0.025, verb: 0.5 }); });
        break;
      case 'mushrooms':
        every('twinkle', 1.5, 4, () => this.tone(out, { f: midi(88 + PENTA[Math.floor(Math.random() * 6)]), t, d: 0.8, peak: 0.03, verb: 0.6 }));
        break;
      case 'generic':
        every('dice', 6, 12, () => { for (let i = 0; i < 6; i++) this.burst(out, { t: t + i * rand(0.04, 0.09), dur: 0.015, f: rand(2500, 4000), Q: 5, peak: 0.1 }); });
        every('shuffle', 8, 15, () => this.burst(out, { t, dur: 0.5, f: 3000, Q: 0.7, peak: 0.05, attack: 0.1 }));
        break;
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt, now, camera, playerPos) {
    if (!this.ctx) return;
    this.boatMusic.update();   // keeps the boat loop scheduled while you're aboard Kevin's boat
    this.musicApi.update();    // the yard's music (music.js)
    this.backroom.update();    // the D&D back room (dnd-sound.js)
    const ctx = this.ctx, t = ctx.currentTime, L = ctx.listener;
    const p = camera.position;
    const Lp = this.listener; Lp.x = p.x; Lp.y = p.y; Lp.z = p.z;
    const f = camera.getWorldDirection(this._fwd || (this._fwd = camera.position.clone()));
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05);
      L.forwardX.setTargetAtTime(f.x, t, 0.05); L.forwardY.setTargetAtTime(f.y, t, 0.05); L.forwardZ.setTargetAtTime(f.z, t, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    // a crowd talking at once is ducked so it adds up to about one and a half close voices
    const ve = this.voiceEnergy(t);
    this.voiceDuck.gain.setTargetAtTime(ve > 1.5 ? Math.sqrt(1.5 / ve) : 1, t, 0.15);
    // and the ambience leans back while someone talks near you: the babble (a close voice = 1) or voice chat (voice.js sets
    // talkNear each frame to the gain of the loudest voice you hear). In fast, out slowly.
    const talk = Math.min(1, Math.max(Math.sqrt(ve), this.talkNear || 0));
    this.talkNear = 0;
    const dk = dbGain(AMB_DUCK_DB * talk);
    if (Math.abs(dk - this.ambDuckK) > 0.01) { this.ambDuck.gain.setTargetAtTime(dk, t, dk < this.ambDuckK ? 0.25 : 1.2); this.ambDuckK = dk; }
    // the music leans back further (and the tutorial or a game may ask for it too: musicDuck, 0..1, read and cleared each frame)
    const mk = dbGain(MUSIC_DUCK_DB * Math.max(talk, this.musicDuckAsk || 0));
    this.musicDuckAsk = 0;
    if (Math.abs(mk - this.musicDuckK) > 0.01) { this.musicDuck.gain.setTargetAtTime(mk, t, mk < this.musicDuckK ? 0.25 : 1.5); this.musicDuckK = mk; }
    if (!this.surfP) return; // no beds (offline tests)
    const px = playerPos.x, pz = playerPos.z;

    // beds follow the nearest shore / tree line / street
    const c = closestOnPoly(px, pz, COAST, false);
    this.movePanner(this.surfP, c[0], 0.4, c[1]);
    const w = closestOnPoly(px, pz, this.woodsEdge, false);
    const wd = LIGHT.woods || 0;
    this.movePanner(this.woodsP, wd > 0.15 ? px : w[0] - 4, 3, wd > 0.15 ? pz - 2 : w[1]); // inside the woods the rustle is all round you
    // the deep woods: a creaking trunk, a crow, a twig, now and then
    if (wd > 0.25 && t > (this.nextWoodsFx || 0)) {
      this.nextWoodsFx = t + rand(5, 14) / wd;
      const a = rand(0, 6.28), r = rand(6, 16), out = this.at(px + Math.cos(a) * r, 2 + rand(0, 4), pz + Math.sin(a) * r, 5);
      const k = Math.random();
      if (k < 0.4) { if (!playClipInto(this, out, ['creak-01', 'creak-03', 'creak-04'], t, { db: -24, rate: [0.42, 0.55] }, 'trunk')) this.tone(out, { f: rand(90, 140), glide: rand(70, 110), t, d: rand(0.6, 1.2), peak: 0.06, type: 'sawtooth' }); } // a trunk creaks (a real creak, slowed, once loaded)
      else if (k < 0.7) { this.tone(out, { f: 520, glide: 380, t, d: 0.22, peak: 0.07, type: 'sawtooth' }); this.tone(out, { f: 500, glide: 360, t: t + 0.28, d: 0.2, peak: 0.06, type: 'sawtooth' }); } // a crow
      else this.burst(out, { t, dur: 0.05, f: 2600, Q: 3, peak: 0.12 }); // a twig snaps
    }
    this.movePanner(this.streetP, Math.max(-150, Math.min(80, px)), 1, (STREET.z0 + STREET.z1) / 2);
    this.streetG.gain.setTargetAtTime(0.04 * (0.8 + 0.2 * Math.sin(now * 0.047) + 0.1 * Math.sin(now * 0.13 + 2)), t, 2); // the traffic ebbs
    // the surf by your distance from the water (only touched when it moves by more than 2 %). Out on the water (the pier, the
    // cove, a boat) the waves are all round you, so it never fades there.
    const nearCoast = Math.sqrt(c[2]), onWater = nearCoast > 6 && !!lakeAt(px, pz), kN = dbGain(surfNearDb(onWater ? 6 : nearCoast));
    if (Math.abs(kN / this.surfNearK - 1) > 0.02) {
      this.surfNearK = kN;
      this.surfNear.gain.setTargetAtTime(kN, t, 0.4);
      this.surfAir.frequency.setTargetAtTime(380 + 1120 * Math.sqrt(kN), t, 0.4); // farther off, darker
    }
    // the next wave: it swells in, breaks a little brighter, draws back, then a lull. Every so often a bigger one.
    if (t > this.nextWave) {
      const big = (++this.waveN % 5 === 0 || Math.random() < 0.1) ? 1.4 : 1;
      const up = rand(1.6, 2.6), down = rand(3, 4.6), crest = rand(0.235, 0.35) * big;
      const g = this.surfG.gain, f = this.surfWashF.frequency, r = this.surfRoll.gain;
      g.setTargetAtTime(crest, t, up / 3); g.setTargetAtTime(0.026, t + up, down / 3);
      f.setTargetAtTime(big > 1 ? 820 : 680, t, up / 3); f.setTargetAtTime(360, t + up, down / 2.5);
      r.setTargetAtTime(0.04 + crest * 0.2, t + up * 0.5, up / 2); r.setTargetAtTime(0.031, t + up + down * 0.4, down / 2);
      this.nextWave = t + up + down + rand(0.6, 3.2);
    }
    // the wind bed leans on the weather (WEATHER.wind 0..1, gusts, the Arkham storm's own wind), with slow lulls between breaths
    // (in a room, indoor-rooms.js: WEATHER.indoor, it is heard through the walls, quieter and darker)
    const windy = WEATHER.wind + WEATHER.local * 0.5, gust = WEATHER.gust || 0, room = WEATHER.indoor || 0;
    this.windF.frequency.setTargetAtTime((300 + Math.sin(now * 0.13) * 120 + Math.sin(now * 0.41) * 60 + windy * 180 + gust * 90) * (1 - 0.35 * room), t, 0.5);
    this.windG.gain.setTargetAtTime((0.07 + Math.max(0, Math.sin(now * 0.09)) * 0.064) * (0.8 + 0.2 * Math.sin(now * 0.21 + 1.3)) * (1 + windy * 2 + gust * 1.2) * (1 - 0.5 * room), t, 1);
    // the leaves: the breeze everywhere, and more of them the deeper into the woods you go
    this.leafG.gain.setTargetAtTime(0.012 + Math.max(0, Math.sin(now * 0.23)) * 0.02 + windy * 0.035 + 0.012 * wd, t, 0.8);

    // down in Beneath Angell Street (maze-scene.js sets `below`) no yard critters or game-area beds are made, and any still
    // playing are let go
    if (this.below) { for (const tb of this.tables) this.dropTable(tb); return; }
    // random critters
    const tm = this.timers;
    const every = (key, a, b, fn) => { if (!tm[key]) tm[key] = now + rand(0, b); if (now >= tm[key]) { tm[key] = now + rand(a, b); fn(); } };
    // time of day (daynight.js sets these, 0 when nothing does): birds sleep at night and sing a chorus at dawn, and
    // crickets and an owl take over after dark
    const night = this.night || 0, dawn = this.dawn || 0;
    const wet = Math.max(WEATHER.rain, WEATHER.snow, WEATHER.local); // birds shelter in the rain, crickets go quiet
    const bird = () => {
      if (Math.random() < wet * 0.9) return;
      const a = Math.random() * Math.PI * 2, d = rand(8, 28);
      if (nearCoast < 12 && Math.random() < 0.6) return;
      this.bird(px + Math.cos(a) * d, rand(4, 9), pz + Math.sin(a) * d);
    };
    every('bird', 0.8, 3.2, () => { if (Math.random() >= night * 0.94) bird(); });
    every('chorus', 0.35, 1.1, () => { if (Math.random() < dawn * 0.9) bird(); }); // the dawn chorus, on top
    every('gull', 12, 28, () => { if (nearCoast < 45 && Math.random() >= night * 0.85) this.gull(c[0] + rand(6, 20), rand(10, 18), c[1] + rand(-15, 15)); });
    // small waves lapping at the water's edge when you stand close, a rhythm under the big slow swell. Out on the water they
    // lap round you instead (the pilings, the hull).
    every('lap', 1.4, 3.4, () => {
      if (onWater) this.lap(px + rand(-3, 3), pz + rand(-3, 3), 0.45);
      else if (nearCoast < 14) this.lap(c[0] + rand(-2.5, 2.5), c[1] + rand(-2.5, 2.5), 0.7 * (1 - nearCoast / 16));
    });
    every('pecker', 18, 40, () => { if (Math.sqrt(w[2]) < 35 && night < 0.5) this.woodpecker(w[0] - rand(6, 14), 5, w[1] + rand(-8, 8)); });
    every('crowfar', 25, 50, () => { if (night < 0.6) this.crow(w[0] - 20, 12, w[1] + rand(-20, 20), CRITTERS.crowFar); });
    every('owl', 16, 38, () => { if (night > 0.6) this.owl(w[0] - rand(8, 16), rand(7, 11), w[1] + rand(-14, 14), CRITTERS.owl); });
    every('car', 20, 50, () => { if (Math.random() >= night * 0.6) this.car(); });
    if (this.crickets) {
      // hushed by the surf, loudest out on the lawn and the meadow
      const k = Math.max(0, Math.min(1, (night - 0.45) / 0.4)) * (nearCoast < 10 ? 0.55 : 1) * (1 - wet * 0.85) * CRITTERS.crickets;
      for (const cr of this.crickets) {
        cr.g.gain.setTargetAtTime(k, t, 1.5);
        this.movePanner(cr.p, px + cr.off[0], 0.3, pz + cr.off[1]);
      }
    }
    every('barkfar', 35, 80, () => this.bark(rand(-120, 40), -72, CRITTERS.barkFar));

    // game areas: start when close, fade out when far (the small spots use a shorter range)
    for (const tb of this.tables) {
      const d = Math.hypot(tb.x - px, tb.z - pz), small = tb.theme === 'swingtree' || tb.theme === 'dockboards' || tb.theme === 'hearth' || tb.theme === 'gasfire';
      if (d < (small ? 28 : 55)) { this.ensureTable(tb); this.tableEvents(tb, now); }
      else if (d > (small ? 36 : 70)) this.dropTable(tb);
    }
  }
}
