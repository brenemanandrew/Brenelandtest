// Kevin's Tool Crib, heard: his radio and the shop's own sounds. tool-crib.js makes it (createCribSound) and calls update() every
// frame with what is going on (its `source`); music.js steps aside inside the shop (music-place.js interior 'crib'), so the radio is
// the music there.
//   the radio    an old AM set on top of the wire shelves (crib-clutter.js): our own songs (crib-radio-songs.js) played by
//                music-band.js through a small speaker (band-limited, a touch of drive, mono, a little static), positioned at the
//                radio on the music bus, so it is louder near it and the Music slider and the talk duck work on it. One song after
//                another, never the same twice running; between them now and then the station drifts (a dial whine, static) and
//                the dial's needle moves. On while the shop is open or Kevin is down in it; off when it is closed and dark. E at the
//                radio turns it off (or on) for OFF_FOR seconds. Outside it leaks through the open front door, muffled, from the
//                door; through the shut door only a murmur. Far off (RADIO.far) the band stops; back in range it picks up mid-song.
//   the bed      inside only, on the ambience bus: the wall clock ticking (crib-clutter.js hangs it behind the counter), the box
//                fan on the tool chest whirring when it is warm and the shop is lit, the pendants' faint buzz while lit, the lot's
//                traffic through the walls (less at night), rain on the roof in the weather's rain. Each at its source.
//   one-shots    quiet and spaced (ONESHOTS, and GAP_ANY between any two): a spring boinging in a box, a wrench clinking in a
//                tote, the paint cans' tarp rustling, the building creaking; the stair creaking under whoever climbs it (the
//                effects bus), and Kevin's work at the pegboard and the spring table (a hammer, a ratchet, a tinker; effects).
// Nothing is made before the sound is on (audio.ctx: the player's first tap); the radio follows the music's blocks (muted, the
// intro, the tutorial, a mini-game). Sound is local, so Math.random is fine here. Renders offline too (an OfflineAudioContext, a
// scripted source; tools/crib-sound-sheet.mjs).
import { createBand, instrumentsOf } from './music-band.js';
import { instBank } from './music-sampler.js';
import { RADIO_SONGS, RADIO_ORDER } from './crib-radio-songs.js';
import { playClipInto } from './sfx-bank.js';

const dbGain = db => Math.pow(10, db / 20);
const rand = (a, b) => a + Math.random() * (b - a);
// the radio's speaker and where it is heard: ref / rolloff the panner's (inverse distance, from the set), hp / lp the band, peak
// the small cone's honk, drive the set's overdriven little amp, db the songs' level into it, hiss the station's static under
// them; leak / leakLp out through the open front door (from the door), wall / wallLp through the shut one; far: past this from
// the door (outside) the band stops, back within `near` it picks up again
export const RADIO = { ref: 2, rolloff: 0.7, hp: 320, lp: 3300, peak: [1350, 5, 1.1], drive: 2.4, db: -3, hiss: -38, crackle: -30,
  leak: 0.3, leakLp: 900, wall: 0.06, wallLp: 360, far: 32, near: 28, xf: 0.7 };
export const OFF_FOR = 600;          // E at the radio: off (or on) for this long, then back to the shop's hours
export const STATION = [2.2, 4.5];   // seconds of station between songs (the dial drifting: a whine, static)
export const DRIFT_SHARE = 0.65;     // how often a gap has the dial's whine (else a short pause in the hiss)
export const LOAD_WAIT = 6;          // a song waits this long for its instruments (the static covers it), then plays with what came
export const DIAL = 0.62;            // the station on the dial (the needle, 0..1 across the dial's face)
export const WARM_C = 22;            // the box fan runs at this temperature (Celsius) or warmer, while the shop is lit
// the bed's levels (linear, before the ambience bus), measured with tools/crib-sound-test.mjs (the bed about the yard's ambience,
// a little under it: a quiet shop)
export const BED = { tick: 0.07, fanAir: 0.014, fanBody: 0.05, fanHum: 0.004, buzz: 0.0024, traffic: 0.05, trafficNight: 0.35, rainHi: 0.03, rainLo: 0.06, fade: 1.2 };
// the one-shots: seconds between (at random in the range), the bus
export const ONESHOTS = { boing: { every: [50, 110], bus: 'amb' }, clink: { every: [45, 100], bus: 'amb' }, tarp: { every: [60, 130], bus: 'amb' }, creak: { every: [30, 80], bus: 'amb' } };
export const GAP_ANY = 9;            // at least this between any two of those
export const STAIR_GAP = 0.22;       // a tread creaks at most this often (and not every tread does: STAIR_CHANCE)
export const STAIR_CHANCE = 0.6;
export const WORK = { hammer: [3.5, 7], wrench: [4, 8], tinker: [5, 10] };   // Kevin's work: seconds between bursts, by what he does

/** createCribSound(audio, { spots, source }) -> the Tool Crib's sound; update(dt) every frame.
 *  spots: { radio: [x, y, z], door: [x, y, z], clock, fan, buzz: [x, y, z], boxes / totes / tarp: [[x0, y0, z0, x1, y1, z1]], creaks:
 *  [x0, x1, y0, y1, z0, z1] (where the building settles), stair: { minX, maxX, z0, tread, rise, y0, y1, x } }.
 *  source() -> { pin, open, kevinIn, shopOn, fan, door (0..1), rain (0..1), hour, kevin: { x, y, z, task, still } | null, climbers:
 *  [[id, x, y, z]] }: the same object may be returned every frame (it is read, never kept). */
export function createCribSound(audio, opt = {}) {
  const spots = opt.spots, S0 = { pin: false, open: false, kevinIn: false, shopOn: false, fan: false, door: 0, rain: 0, hour: 12, kevin: null, climbers: [] };
  let R = null, B = null;            // the radio's nodes and the bed's (built with the sound, let go when not needed)
  let band = null, track = null, phase = 'off', phaseUntil = 0, pending = null, gapK = null, lastSong = null;
  let wantOn = false, override = null, placeKey = '', bedOn = false, bedOffAt = -1, nextTick = -1, tock = false, slowAt = -1;
  const timers = {}, stairIdx = new Map(), log = [], played = [];
  let lastAny = -1e9, workAt = -1e9, dial = DIAL, dialFrom = DIAL, dialTo = DIAL, dialT0 = 0, dialT1 = 0;
  let clockFn = null;
  const now = () => (clockFn ? clockFn() : audio.ctx.currentTime);   // the decisions' clock (a test steps its own)
  const at = () => audio.ctx.currentTime;                                  // the sounds' clock
  const src = () => { let s = null; try { s = api.source ? api.source() : null; } catch { s = null; } return s || S0; };
  const note = (name, p, extra) => { const e = { name, at: +now().toFixed(2), x: +p[0].toFixed(2), y: +p[1].toFixed(2), z: +p[2].toFixed(2), ...extra }; log.push(e); if (log.length > 120) log.shift(); return e; };
  const blocked = () => { if (!audio.ctx) return 'no-sound'; if (audio.muted) return 'muted'; try { return audio.musicApi?.blockedBy?.() || null; } catch { return null; } };
  const panner = (p, ref, roll) => audio.panner(p[0], p[1], p[2], ref, roll);

  // ---------------------------------------------------------------- the radio
  // songs -> in (mono) -> highpass x2 -> the cone's honk -> lowpass x2 -> the little amp's drive -> vol (on, off, the station
  // breaks) -> place (in the shop, through the door, through the wall) -> muffle -> panner (at the set, or the door) -> music bus
  function buildRadio() {
    const ctx = audio.ctx, g = v => { const n = ctx.createGain(); n.gain.value = v; return n; }, f = (type, fr, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; b.gain.value = gain; return b; };
    const input = g(1); input.channelCount = 1; input.channelCountMode = 'explicit'; input.channelInterpretation = 'speakers';
    const hp1 = f('highpass', RADIO.hp), hp2 = f('highpass', RADIO.hp), pk = f('peaking', RADIO.peak[0], RADIO.peak[2], RADIO.peak[1]), lp1 = f('lowpass', RADIO.lp), lp2 = f('lowpass', RADIO.lp * 1.15);
    const drive = ctx.createWaveShaper(), k = RADIO.drive, n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
    drive.curve = curve;
    const vol = g(0), place = g(0), muffle = f('lowpass', 16000, 0.5), pan = panner(spots.radio, RADIO.ref, RADIO.rolloff);
    pan.panningModel = 'equalpower';   // (a mono box on a shelf: equal power is enough and cheaper than HRTF)
    input.connect(hp1).connect(hp2).connect(pk).connect(lp1).connect(lp2).connect(drive).connect(vol).connect(place).connect(muffle).connect(pan).connect(audio.music);
    // the station's static: hiss through the speaker's band, and the odd crackle; `air` swells it in a station break
    const hiss = ctx.createBufferSource(); hiss.buffer = audio.white; hiss.loop = true;
    const hbp = f('bandpass', 2100, 0.6), hissG = g(dbGain(RADIO.hiss)), air = g(1);
    hiss.connect(hbp).connect(hissG).connect(air).connect(hp1);
    const crk = ctx.createBufferSource(); crk.buffer = crackle(ctx); crk.loop = true;
    const crkG = g(dbGain(RADIO.crackle)); crk.connect(crkG).connect(hp1);
    const t = at(); hiss.start(t, Math.random() * 1.5); crk.start(t, Math.random() * 4);
    R = { input, vol, place, muffle, pan, air, hissG, hiss, crk, nodes: [input, hp1, hp2, pk, lp1, lp2, drive, vol, place, muffle, pan, hbp, hissG, air, crkG], pos: spots.radio, placeName: null };
  }
  function dropRadio() {
    if (!R) return;
    const r = R; R = null; placeKey = '';
    stopBand(0.3);
    const t = at(); r.vol.gain.cancelScheduledValues(t); r.vol.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => { for (const s of [r.hiss, r.crk]) { try { s.stop(); } catch { /* gone */ } } for (const x of r.nodes) { try { x.disconnect(); } catch { /* gone */ } } }, 900);
  }
  function stopBand(fade = 0.6) { pending = null; if (band) { band.stop(fade); band = null; } track = null; }
  const bankNow = () => (api.useSamples && audio.ctx ? instBank(audio.ctx) : null);
  function nextSong() {
    const pool = RADIO_ORDER.filter(id => id !== lastSong);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // a song is due: its instruments first (the static plays while they load), then the band into the radio
  function startSong(id, { mid = false } = {}) {
    const song = RADIO_SONGS[id], bank = bankNow(), need = instrumentsOf(song);
    track = id; lastSong = id; phase = 'song';
    const start = mid ? Math.floor(Math.random() * Math.max(1, song.form.length - 1)) : 0;
    if (bank && !bank.settled(need)) { bank.load(need, api.loadOpts || {}); pending = { id, since: now(), need, start }; return; }
    playSong(id, start, bank);
  }
  function playSong(id, start, bank) {
    pending = null;
    band = createBand(audio, RADIO_SONGS[id], { out: R.input, send: R.input, bank, db: RADIO.db, start, loop: false });
    band.start(at() + 0.05, { fade: start ? 1.2 : 0.4 });
    played.push({ id, at: +now().toFixed(2), start }); if (played.length > 30) played.shift();
  }
  // between songs: the dial drifts off the station and back (a heterodyne whine, the static up), or just a breath of hiss
  function station(secs, drift) {
    phase = 'station'; phaseUntil = now() + secs; gapK = drift;
    const t = at();
    if (!R) return;
    if (drift) {
      const ctx = audio.ctx, o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; og.gain.value = 0;
      const f0 = rand(1500, 2600);
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(rand(380, 700), t + secs * 0.45); o.frequency.exponentialRampToValueAtTime(rand(900, 1400), t + secs * 0.8); o.frequency.exponentialRampToValueAtTime(rand(60, 140), t + secs);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.05, t + 0.25); og.gain.setValueAtTime(0.05, t + secs * 0.75); og.gain.linearRampToValueAtTime(0, t + secs);
      o.connect(og).connect(R.input); o.start(t); o.stop(t + secs + 0.05); o.onended = () => { try { og.disconnect(); } catch { /* gone */ } };
      R.air.gain.cancelScheduledValues(t); R.air.gain.setValueAtTime(R.air.gain.value, t); R.air.gain.linearRampToValueAtTime(7, t + 0.3); R.air.gain.setValueAtTime(7, t + secs * 0.7); R.air.gain.linearRampToValueAtTime(1, t + secs);
      dialFrom = dial; dialTo = DIAL + (Math.random() < 0.5 ? -1 : 1) * rand(0.06, 0.14); dialT0 = now(); dialT1 = now() + secs * 0.5;
    }
    note('station', R.pos, { drift: !!drift, secs: +secs.toFixed(2) });
  }
  function radioUpdate(s, t) {
    const why = blocked();
    const ov = override && t < override.until ? override.on : null;
    if (override && ov === null) override = null;
    const schedule = !!(s.open || s.kevinIn);
    const dDoor = Math.hypot(audio.listener.x - spots.door[0], audio.listener.z - spots.door[2]);
    const inRange = s.pin || dDoor < (band || pending || phase === 'station' ? RADIO.far : RADIO.near);
    const on = (ov ?? schedule) && !why;
    wantOn = on;
    if (!on || !inRange) {
      if (R) { if (on && !inRange) note('radio-far', R.pos); dropRadio(); }
      phase = on ? 'away' : 'off';
      return;
    }
    if (!R) { buildRadio(); placeKey = ''; const fresh = !!api._fresh; api._fresh = false; R.vol.gain.setTargetAtTime(1, at(), 0.15); if (fresh) { station(1.0, false); phaseUntil = now() + 0.6; gapK = 'fresh'; } else { station(0.7, false); gapK = 'mid'; } }
    // where you are: in the shop (all of it), outside through the open door (from the door, muffled), through the shut door
    const place = s.pin ? 'in' : s.door > 0.5 ? 'door' : 'wall';
    if (place !== placeKey) {
      placeKey = place; R.placeName = place;
      const tt = at(), pg = place === 'in' ? 1 : place === 'door' ? RADIO.leak : RADIO.wall, lp = place === 'in' ? 16000 : place === 'door' ? RADIO.leakLp : RADIO.wallLp;
      R.place.gain.cancelScheduledValues(tt); R.place.gain.setTargetAtTime(pg, tt, RADIO.xf);
      R.muffle.frequency.cancelScheduledValues(tt); R.muffle.frequency.setTargetAtTime(lp, tt, RADIO.xf);
      R.pos = place === 'door' ? spots.door : spots.radio;
      audio.movePanner(R.pan, R.pos[0], R.pos[1], R.pos[2]);
      R.target = { place: pg, lp };
    }
    // the program: a song, a station break, the next song
    if (pending) {
      const bk = bankNow();
      if (!bk || bk.settled(pending.need) || t - pending.since > LOAD_WAIT) playSong(pending.id, pending.start, bk);
    }
    if (phase === 'station' && t >= phaseUntil) startSong(nextSong(), { mid: gapK === 'mid' });
    else if (phase === 'song' && !pending && band && band.done) { band = null; track = null; const d = Math.random() < DRIFT_SHARE; station(d ? rand(STATION[0], STATION[1]) : rand(0.8, 1.6), d); }
    else if (phase !== 'song' && phase !== 'station') { station(0.7, false); gapK = 'mid'; }
    if (band) band.pump(at());
    // the needle: off the station and back during a drift
    if (t < dialT1) dial = dialFrom + (dialTo - dialFrom) * Math.min(1, (t - dialT0) / Math.max(0.01, dialT1 - dialT0));
    else if (dial !== DIAL) { const k = Math.min(1, (t - dialT1) / 1.2); dial = dialTo + (DIAL - dialTo) * k; if (k >= 1) dial = DIAL; }
  }

  // ---------------------------------------------------------------- the bed (inside only)
  function buildBed() {
    const ctx = audio.ctx, g = v => { const n = ctx.createGain(); n.gain.value = v; return n; }, f = (type, fr, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; return b; };
    const out = g(0), srcs = [], nodes = [out];
    out.connect(audio.amb);
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(at(), Math.random() * 1.8); srcs.push(s); return s; };
    const osc = (type, fr) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.start(at()); srcs.push(o); return o; };
    const at3 = (p, ref, roll) => { const pn = panner(p, ref, roll); pn.connect(out); nodes.push(pn); return pn; };
    // the clock: its ticks are scheduled (tickBuf), each through this
    const clockG = g(BED.tick); clockG.connect(at3(spots.clock, 1.0, 1.5)); nodes.push(clockG);
    // the box fan: air through the grille, the blades' body (pulsing at the blade rate), the motor's hum
    const fanP = at3(spots.fan, 1.3, 1.3), fanG = g(0); fanG.connect(fanP); nodes.push(fanG);
    const fa = f('bandpass', 1500, 0.5), faG = g(BED.fanAir); loop(audio.white).connect(fa).connect(faG).connect(fanG);
    const fb = f('lowpass', 700, 0.6), fbG = g(BED.fanBody); loop(audio.brown).connect(fb).connect(fbG).connect(fanG);
    const lfo = osc('sine', 21), lfoG = g(BED.fanBody * 0.35); lfo.connect(lfoG).connect(fbG.gain);
    const hum = osc('sine', 118), humG = g(BED.fanHum); hum.connect(humG).connect(fanG);
    nodes.push(fa, faG, fb, fbG, lfoG, humG);
    // the pendants' buzz (mains hum and its rasp), from the middle pendant
    const buzzP = at3(spots.buzz, 1.6, 1.2), buzzG = g(0); buzzG.connect(buzzP); nodes.push(buzzG);
    const bz = osc('sawtooth', 120), bzf = f('bandpass', 360, 2), bzG = g(BED.buzz); bz.connect(bzf).connect(bzG).connect(buzzG);
    const bz2 = osc('sine', 240), bz2G = g(BED.buzz * 0.7); bz2.connect(bz2G).connect(buzzG);
    nodes.push(bzf, bzG, bz2G);
    // the lot's traffic through the walls (all round: low, dark, ebbing)
    const trG = g(0), trf = f('lowpass', 210, 0.5); loop(audio.brown).connect(trf).connect(trG).connect(out); nodes.push(trG, trf);
    // rain on the roof: the patter and the drum of it (all round, from above)
    const rnP = at3([spots.buzz[0], spots.roofY, spots.buzz[2]], 4, 0.5), rnG = g(0); rnG.connect(rnP); nodes.push(rnG);
    const rh1 = f('highpass', 1400), rh2 = f('lowpass', 5200), rhG = g(BED.rainHi); loop(audio.white).connect(rh1).connect(rh2).connect(rhG).connect(rnG);
    const rl = f('lowpass', 320), rlG = g(BED.rainLo); loop(audio.brown).connect(rl).connect(rlG).connect(rnG);
    nodes.push(rh1, rh2, rhG, rl, rlG);
    out.gain.setTargetAtTime(1, at(), BED.fade / 3);
    B = { out, srcs, nodes, clockG, fanG, buzzG, trG, rnG, tick: tickBufs(ctx), k: { fan: -1, buzz: -1, traffic: -1, rain: -1 } };
    nextTick = Math.ceil(at() + 0.05);
  }
  function dropBed() {
    if (!B) return;
    const b = B; B = null;
    for (const s of b.srcs) { try { s.stop(at() + 0.05); } catch { /* gone */ } }
    for (const x of b.nodes) { try { x.disconnect(); } catch { /* gone */ } }
  }
  const setK = (key, node, v, tc = 0.8) => { if (Math.abs(B.k[key] - v) < 1e-4) return; B.k[key] = v; node.gain.setTargetAtTime(v, at(), tc); };
  function bedUpdate(s, t) {
    const inNow = !!s.pin && !!audio.ctx;
    if (inNow && !bedOn) { bedOn = true; if (!B) buildBed(); else { B.out.gain.cancelScheduledValues(at()); B.out.gain.setTargetAtTime(1, at(), BED.fade / 3); } bedOffAt = -1; }
    else if (!inNow && bedOn) { bedOn = false; if (B) { B.out.gain.cancelScheduledValues(at()); B.out.gain.setTargetAtTime(0, at(), BED.fade / 3); } bedOffAt = t + BED.fade * 3; }
    if (!bedOn && B && bedOffAt > 0 && t > bedOffAt) { dropBed(); bedOffAt = -1; }
    if (!B) return;
    const ta = at();
    // the clock: tick, tock, once a second, a little ahead
    while (nextTick < ta + 0.25) {
      if (nextTick >= ta - 0.02) { const sN = audio.ctx.createBufferSource(); sN.buffer = tock ? B.tick[1] : B.tick[0]; sN.connect(B.clockG); sN.start(nextTick); sN.onended = disc; }
      tock = !tock; nextTick += 1;
    }
    if (t - slowAt < 0.25) return;   // (the levels four times a second)
    slowAt = t;
    setK('fan', B.fanG, s.fan ? 1 : 0, s.fan ? 0.6 : 1.2);   // (it spins up and runs down)
    setK('buzz', B.buzzG, s.shopOn ? 1 : 0, 0.05);
    const h = s.hour ?? 12, night = h < 6 || h >= 21 ? 1 : h < 7 ? 7 - h : h >= 20 ? h - 20 : 0;
    setK('traffic', B.trG, BED.traffic * (1 - (1 - BED.trafficNight) * night) * (0.8 + 0.2 * Math.sin(t * 0.05) + 0.1 * Math.sin(t * 0.17 + 1)), 2);
    setK('rain', B.rnG, Math.min(1, s.rain || 0), 1.5);
  }
  function disc() { try { this.disconnect(); } catch { /* gone */ } }

  // ---------------------------------------------------------------- one-shots
  const inBox = b => [b[0] + Math.random() * (b[3] - b[0]), b[1] + (b[4] - b[1]) * rand(0.3, 0.9), b[2] + Math.random() * (b[5] - b[2])];
  const out3 = (p, bus = 'amb', ref = 2, roll = 1.4) => { const pn = panner(p, ref, roll); pn.connect(bus === 'sfx' ? audio.sfx : audio.amb); if (bus !== 'sfx') pn.verbDest = audio.ambVerbIn; setTimeout(() => { try { pn.disconnect(); } catch { /* gone */ } }, 5000); return pn; };
  const ONE = {
    boing(p) { const o = out3(p, 'amb', 1.5), t = at(), f = rand(240, 420); audio.tone(o, { f: f * 1.7, glide: f, t, a: 0.004, d: 0.32, peak: 0.022, type: 'triangle' }); audio.tone(o, { f: f * 2.6, glide: f * 1.2, t: t + 0.06, a: 0.004, d: 0.22, peak: 0.01 }); },
    clink(p) { const o = out3(p, 'amb', 1.5), t = at(); for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) audio.tone(o, { f: rand(2300, 3600), t: t + i * rand(0.07, 0.14), a: 0.002, d: rand(0.12, 0.25), peak: 0.016 / (i + 1) }); audio.burst(o, { t, dur: 0.04, f: 4200, Q: 3, peak: 0.012 }); },
    tarp(p) { const o = out3(p, 'amb', 2), t = at(), d = rand(0.5, 1.1); audio.burst(o, { t, dur: d, f: rand(1800, 3200), Q: 0.8, peak: 0.02, attack: d * 0.4, sweep: rand(900, 1500) }); audio.burst(o, { t: t + d * 0.5, dur: d * 0.6, f: 2600, Q: 1.2, peak: 0.012, attack: 0.08 }); },
    creak(p) { const o = out3(p, 'amb', 3, 1), t = at(); if (!playClipInto(audio, o, ['creak-01', 'creak-03', 'creak-04'], t, { db: -30, rate: [0.45, 0.62] }, 'crib-creak')) audio.tone(o, { f: rand(90, 150), glide: rand(70, 110), t, d: rand(0.5, 1.0), peak: 0.03, type: 'sawtooth' }); },
    stair(p) { const o = out3(p, 'sfx', 2, 1.3), t = at(); if (!playClipInto(audio, o, ['creak-01', 'creak-02', 'creak-03'], t, { db: -27, rate: [0.7, 0.95] }, 'crib-stair')) audio.tone(o, { f: rand(140, 220), glide: rand(100, 160), t, d: rand(0.18, 0.35), peak: 0.035, type: 'sawtooth' }); },
    hammer(p) { const o = out3(p, 'sfx', 2.5), t = at(), n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const tt = t + i * rand(0.32, 0.45); audio.burst(o, { t: tt, dur: 0.05, f: rand(1500, 2100), Q: 2.5, peak: 0.06 }); audio.tone(o, { f: rand(380, 520), t: tt, a: 0.002, d: 0.09, peak: 0.03 }); } },
    wrench(p) { const o = out3(p, 'sfx', 2), t = at(), n = 4 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) audio.burst(o, { t: t + i * 0.085, dur: 0.018, f: 3400, Q: 4, peak: 0.035 }); audio.tone(o, { f: 2900, t: t + n * 0.085 + 0.1, a: 0.002, d: 0.2, peak: 0.012 }); },
    tinker(p) { const o = out3(p, 'sfx', 1.6), t = at(); for (let i = 0; i < 3; i++) audio.tone(o, { f: rand(1700, 3000), t: t + i * rand(0.12, 0.3), a: 0.002, d: 0.1, peak: 0.014 }); },
  };
  function fire(name, p, extra) { try { ONE[name](p); } catch (err) { console.error('[crib-sound]', name, err); } return note(name, p, extra); }
  function oneShots(s, t) {
    if (!bedOn || audio.muted) return;
    for (const name in ONESHOTS) {
      const O = ONESHOTS[name];
      if (timers[name] === undefined) { timers[name] = t + rand(O.every[0] * 0.3, O.every[1]); continue; }
      if (t < timers[name]) continue;
      if (t - lastAny < GAP_ANY) { timers[name] = lastAny + GAP_ANY + rand(0.5, 3); continue; }
      const list = name === 'boing' ? spots.boxes : name === 'clink' ? spots.totes : name === 'tarp' ? spots.tarp : null;
      const p = list ? inBox(list[Math.floor(Math.random() * list.length)]) : [rand(spots.creaks[0], spots.creaks[1]), rand(spots.creaks[2], spots.creaks[3]), rand(spots.creaks[4], spots.creaks[5])];
      fire(name, p);
      lastAny = t; timers[name] = t + rand(O.every[0], O.every[1]);
    }
  }
  // the stair: whoever climbs it, a creak now and then as a tread is passed
  function stairs(s, t) {
    if (audio.muted) return;
    const ST = spots.stair, list = s.climbers || [], dz = ST.dir || 1;   // (dir: the treads climb along +z (1) or -z (-1) from z0; crib-move turned the crib round)
    for (let i = 0; i < list.length; i++) {
      const c = list[i], id = c[0], x = c[1], y = c[2], z = c[3], along = dz * (z - ST.z0);
      const on = x > ST.minX - 0.05 && x < ST.maxX + 0.05 && along > 0 && along < ST.n * ST.tread && y > ST.y0 + 0.04 && y < ST.y1 + 0.3;
      if (!on) { stairIdx.delete(id); continue; }
      const k = Math.floor(along / ST.tread), prev = stairIdx.get(id);
      stairIdx.set(id, k);
      if (prev === undefined || prev === k) continue;
      if (t - (timers.stair || -1e9) < STAIR_GAP || Math.random() > STAIR_CHANCE) continue;
      timers.stair = t;
      if (bedOn || Math.hypot(audio.listener.x - x, audio.listener.z - z) < 10) fire('stair', [ST.x, ST.y0 + ST.rise * (k + 1), ST.z0 + dz * (k + 0.5) * ST.tread], { who: id, tread: k });
    }
  }
  // Kevin at his work (in the shop, standing at the pegboard, a shelf or the spring table): a burst now and then
  function kevinWork(s, t) {
    const k = s.kevin;
    if (!k || !k.still || !bedOn || audio.muted) return;
    const kind = k.task === 'peg' ? 'hammer' : k.task === 'peg2' ? 'wrench' : k.task === 'springs' || k.task === 'shelfB' ? 'tinker' : null;
    if (!kind) return;
    if (t < workAt) return;
    if (workAt < 0 || t - workAt > 30) { workAt = t + rand(0.8, 2.5); return; }   // (just got there: a moment first)
    fire(kind, [k.x, k.y + 1.0, k.z], { task: k.task });
    workAt = t + rand(WORK[kind][0], WORK[kind][1]);
  }

  // ---------------------------------------------------------------- each frame
  const api = {
    source: opt.source || null,
    /** tests: the decisions' clock (() -> seconds), stepped by hand; setting it (or null for the sound's own) starts the timers afresh */
    get clock() { return clockFn; },
    set clock(fn) { clockFn = fn || null; for (const k in timers) delete timers[k]; slowAt = -1e9; lastAny = -1e9; workAt = -1e9; if (override) override = null; },
    useSamples: true,
    loadOpts: null,
    _fresh: false,
    update() {
      if (!audio.ctx) return;
      const s = src(), t = now();
      radioUpdate(s, t);
      bedUpdate(s, t);
      oneShots(s, t);
      stairs(s, t);
      kevinWork(s, t);
    },
    /** E at the radio: off if it is playing (on if not), for OFF_FOR seconds */
    toggle() {
      const t = audio.ctx ? now() : 0, was = wantOn;
      override = { on: !was, until: t + OFF_FOR };
      if (override.on) api._fresh = true;
      if (audio.ctx) { const p = spots.radio, o = out3(p, 'sfx', 1.5); audio.burst(o, { t: at(), dur: 0.03, f: 2600, Q: 3, peak: 0.05 }); audio.tone(o, { f: 900, t: at() + 0.01, a: 0.001, d: 0.05, peak: 0.02 }); note('switch', p, { on: override.on }); }
      return override.on;
    },
    get on() { return wantOn; },
    get radioPos() { return spots.radio; },
    get dial() { return dial; },
    get track() { return track; },
    get band() { return band; },
    get log() { return log.slice(); },
    get played() { return played.slice(); },
    /** what the panner does to the radio at the listener (the inverse distance model it uses), for the tests */
    distGain(x = audio.listener.x, y = audio.listener.y, z = audio.listener.z) {
      const p = R ? R.pos : spots.radio, d = Math.max(RADIO.ref, Math.hypot(x - p[0], y - p[1], z - p[2]));
      return RADIO.ref / (RADIO.ref + RADIO.rolloff * (d - RADIO.ref));
    },
    state() {
      const r = R ? { vol: +R.vol.gain.value.toFixed(3), place: +R.place.gain.value.toFixed(3), lp: Math.round(R.muffle.frequency.value), where: R.placeName, pos: R.pos.slice(), air: +R.air.gain.value.toFixed(2), target: R.target || null } : null;
      return { phase, track, on: wantOn, override: override ? { on: override.on, left: +(override.until - (audio.ctx ? now() : 0)).toFixed(1) } : null, blocked: blocked(), radio: r, dist: R ? +api.distGain().toFixed(3) : 0,
        pending: pending ? pending.id : null, band: band ? band.state() : null, bed: B ? { on: bedOn, out: +B.out.gain.value.toFixed(3), fan: B.k.fan, buzz: B.k.buzz, traffic: +B.k.traffic.toFixed(4), rain: B.k.rain } : null,
        dial: +dial.toFixed(3), timers: { ...timers }, lastAny, built: { radio: !!R, bed: !!B } };
    },
    /** tests and the sheet: one of the one-shots now at p ('boing', 'clink', 'tarp', 'creak', 'stair', 'hammer', 'wrench', 'tinker') */
    oneShot(name, p) { return audio.ctx && ONE[name] ? fire(name, p) : null; },
    /** tests: the next song now (and which), the station break skipped */
    skip(id) { if (!R) return false; stopBand(0.2); startSong(id || nextSong()); return true; },
    stop() { dropRadio(); dropBed(); bedOn = false; phase = 'off'; },
    spots,
  };
  return api;
}

// a few seconds of an old set's crackle: sparse ticks and the odd pop (one per context)
const CRK = new WeakMap();
function crackle(ctx) {
  if (CRK.has(ctx)) return CRK.get(ctx);
  const sr = ctx.sampleRate, len = Math.floor(sr * 4.7), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
  let s = 90210; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < len; i++) if (r() < 11 / sr) { const a = (r() < 0.1 ? 1 : 0.2 + r() * 0.4) * (r() < 0.5 ? -1 : 1), L = Math.floor(sr * (0.0002 + r() * 0.0008)); for (let k = 0; k < L * 6 && i + k < len; k++) d[i + k] += a * Math.exp(-k / L) * (k % 2 ? -0.5 : 1); }
  CRK.set(ctx, b);
  return b;
}
// the clock's tick and tock: a short woody click each, the tock a little lower (one pair per context)
const TICKS = new WeakMap();
function tickBufs(ctx) {
  if (TICKS.has(ctx)) return TICKS.get(ctx);
  const sr = ctx.sampleRate, out = [];
  for (const [f, k] of [[3100, 1], [2500, 0.8]]) {
    const len = Math.floor(sr * 0.035), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    let s = 7 + f; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
    for (let i = 0; i < len; i++) { const tt = i / sr; d[i] = k * Math.exp(-tt / 0.004) * (0.6 * Math.sin(2 * Math.PI * f * tt) + 0.4 * r()) + 0.3 * k * Math.exp(-tt / 0.012) * Math.sin(2 * Math.PI * f * 0.31 * tt); }
    out.push(b);
  }
  TICKS.set(ctx, out);
  return out;
}
