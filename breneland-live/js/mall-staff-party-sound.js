// The after hours party's music at Summit Slice (mall-staff): a heavy four-on-the-floor dance track made on the spot from the game's
// AudioEngine (no file, nothing borrowed): a kick, a clap, hats, a saw bass line and a stab chord, 128 bpm, scheduled a bar ahead.
// Loud in the room, through the walls outside (muffled by a lowpass and down in level), falling off with distance from the room's
// middle (a panner). Follows the game's audio rules: everything runs through audio.music (the Music slider, the talk duck), nothing
// plays before the engine is unlocked by the player's first tap (audio.ready), nothing here is touched while testing (the harness is
// muted). Local, so Math.random is fine for the little variations.
//   createPartySound(audio, pos) -> { set(on, place), update(now), dispose() }   place: 'in' | 'door' | 'wall'
export const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4;
export const LEVEL = { room: 0.42, door: 0.18, wall: 0.07, lpIn: 16000, lpDoor: 1800, lpWall: 420, ref: 7, rolloff: 1.3 };
const BASS = [0, 0, 7, 0, 10, 0, 7, 5, 0, 0, 7, 0, 3, 3, 5, 7];   // semitones over A1, a 16th a step
const STAB = [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]];    // a minor chord a bar
export function createPartySound(audio, pos) {
  let R = null, on = false, place = 'wall', nextBar = 0, bar = 0;
  const at = () => audio.ctx.currentTime;
  const build = () => {
    const ctx = audio.ctx, g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const f = (type, fr, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; return b; };
    const master = g(0), placeG = g(0), muffle = f('lowpass', LEVEL.lpWall, 0.6), drive = ctx.createWaveShaper();
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = (i / 127.5) - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    drive.curve = curve;
    const pan = audio.panner(pos[0], pos[1], pos[2], LEVEL.ref, LEVEL.rolloff);
    master.connect(drive).connect(placeG).connect(muffle).connect(pan).connect(audio.music);
    R = { master, placeG, muffle, pan, nodes: [master, placeG, muffle, pan, drive] };
  };
  const kick = (t) => {
    const ctx = audio.ctx, o = ctx.createOscillator(), e = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1.0, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(e).connect(R.master); o.start(t); o.stop(t + 0.34);
  };
  const noise = (t, dur, hp, lp, peak) => {
    const ctx = audio.ctx, s = ctx.createBufferSource(); s.buffer = audio.white; s.loop = true;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const e = ctx.createGain(); e.gain.setValueAtTime(peak, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(h).connect(l).connect(e).connect(R.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  };
  const bass = (t, semi, dur) => {
    const ctx = audio.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), e = ctx.createGain();
    const fr = 55 * Math.pow(2, semi / 12);
    o.type = 'sawtooth'; o.frequency.value = fr; o2.type = 'square'; o2.frequency.value = fr * 0.5; lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.32, t + 0.006); e.gain.setValueAtTime(0.32, t + dur * 0.6); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(e).connect(R.master); o.start(t); o2.start(t); o.stop(t + dur + 0.01); o2.stop(t + dur + 0.01);
  };
  const stab = (t, chord) => {
    const ctx = audio.ctx, e = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.12, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    for (const s of chord) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 220 * Math.pow(2, s / 12); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + 0.25); }
    lp.connect(e).connect(R.master);
  };
  const scheduleBar = (t0, n) => {
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * BEAT / 4;
      if (i % 4 === 0) kick(t);
      if (i % 8 === 4) noise(t, 0.12, 900, 6000, 0.5);                 // the clap on 2 and 4
      noise(t + BEAT / 8, 0.03, 7000, 14000, i % 4 === 2 ? 0.22 : 0.12); // the off-beat hats
      const b = BASS[(i + n * 16) % BASS.length]; if (b >= 0 && !(n % 8 === 7 && i >= 12)) bass(t, b - 12, BEAT / 4 * 0.9);
      if (i === 0 || i === 10) stab(t, STAB[n % STAB.length]);
    }
  };
  const api = {
    get on() { return on; }, get place() { return place; }, built: () => !!R,
    set(wantOn, wantPlace) {
      if (!audio.ready || !audio.ctx) return;
      if (wantOn && !R) { build(); nextBar = at() + 0.1; bar = 0; }
      if (!R) return;
      const t = at();
      if (wantOn !== on) { on = wantOn; R.master.gain.cancelScheduledValues(t); R.master.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.6 : 0.25); }
      if (wantPlace !== place || !api._placed) {
        place = wantPlace; api._placed = true;
        const lv = place === 'in' ? LEVEL.room : place === 'door' ? LEVEL.door : LEVEL.wall, lp = place === 'in' ? LEVEL.lpIn : place === 'door' ? LEVEL.lpDoor : LEVEL.lpWall;
        R.placeG.gain.cancelScheduledValues(t); R.placeG.gain.setTargetAtTime(lv, t, 0.35);
        R.muffle.frequency.cancelScheduledValues(t); R.muffle.frequency.setTargetAtTime(lp, t, 0.35);
      }
    },
    update() {
      if (!R || !on) return;
      const t = at();
      while (nextBar < t + BAR * 1.2) { scheduleBar(nextBar, bar); nextBar += BAR; bar++; }
    },
    dispose() { if (!R) return; for (const n of R.nodes) { try { n.disconnect(); } catch { /* gone */ } } R = null; on = false; },
  };
  return api;
}
