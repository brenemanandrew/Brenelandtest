// Kevin's boat: while you're aboard, the lobby's soundscape crossfades (about 2.5 s) to water lapping at the hull, a creak and,
// rarely, a far-off loon, with the lobby's beds ducked. The music aboard is music.js's "Kevin's Boat" (music-songs.js). Local
// player only. It runs on the music bus, so the master level, the Music slider and mute apply.
// API (audio.js owns one: audio.setMusicMode('boat' | 'lobby'), audio.boatMusic): setMode(m), update(), state().
import { mulberry32 } from './util.js';

const FADE_TC = 0.8;            // setTargetAtTime constant: ~2.4 s to 95%
const BUS_GAIN = 0.62;          // the water and the extras on the music bus (quiet)
const DUCK = 0.45;              // what is left of the lobby's beds while you are aboard

export function createBoatMusic(audio) {
  let mode = 'lobby', built = null, nextLoon = 0, nextCreak = 0, nextSlap = 0, switches = 0;
  const rnd = mulberry32(84);
  function build() {
    const ctx = audio.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0;
    bus.connect(audio.music || (audio.levelNodes ? audio.levelNodes.amb : audio.master));
    // water lapping at the hull: brown noise, low, swelling slowly
    let water = null;
    if (audio.brown) {
      const src = ctx.createBufferSource(); src.buffer = audio.brown; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460;
      const g = ctx.createGain(); g.gain.value = 0.07;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.21;
      const depth = ctx.createGain(); depth.gain.value = 0.045;
      lfo.connect(depth).connect(g.gain);
      src.connect(lp).connect(g).connect(bus);
      src.start(); lfo.start();
      water = { src, lfo };
    }
    built = { bus, water };
  }
  // the odd sound of the lake: a slap of water, the hull creaking, a loon far away (all quiet, all into the bus)
  function extras(t) {
    const ctx = audio.ctx, B = built;
    if (t > nextSlap) {
      nextSlap = t + 2.2 + rnd() * 3.5;
      if (audio.white) {
        const s = ctx.createBufferSource(); s.buffer = audio.white;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600 + rnd() * 500; f.Q.value = 1.4;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        s.connect(f).connect(g).connect(B.bus); s.start(t, rnd() * 1.5); s.stop(t + 0.45);
      }
    }
    if (t > nextCreak) {
      nextCreak = t + 9 + rnd() * 12;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95 + rnd() * 30, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.7);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(lp).connect(g).connect(B.bus); o.start(t); o.stop(t + 0.8);
    }
    if (t > nextLoon) {
      if (nextLoon) { // the far-off call of a loon: a long rising wail, then a fall
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(620, t); o.frequency.linearRampToValueAtTime(930, t + 0.9); o.frequency.setValueAtTime(930, t + 1.6); o.frequency.linearRampToValueAtTime(780, t + 2.3);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 0.5); g.gain.setValueAtTime(0.018, t + 1.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        const v = ctx.createGain(); v.gain.value = 0.9;
        o.connect(g).connect(B.bus); g.connect(v); if (audio.ambVerbIn) v.connect(audio.ambVerbIn);
        o.start(t); o.stop(t + 2.7);
      }
      nextLoon = t + 40 + rnd() * 50;
    }
  }
  function fadeTo(m) {
    const t = audio.ctx.currentTime;
    built.bus.gain.cancelScheduledValues(t);
    built.bus.gain.setTargetAtTime(m === 'boat' ? BUS_GAIN : 0, t, FADE_TC);
    if (audio.amb) audio.amb.gain.setTargetAtTime(m === 'boat' ? DUCK : 1, t, FADE_TC);
  }
  // the bluegrass playing aboard (music.js), for the state
  const song = () => { const m = audio.musicApi; return m && m.scene === 'boat' && m.band ? m.band : null; };

  const api = {
    get mode() { return mode; },
    get playing() { return !!built && mode === 'boat'; },
    get bars() { return song()?.bars || 0; },
    get switches() { return switches; },
    setMode(m) {
      m = m === 'boat' ? 'boat' : 'lobby';
      if (m === mode) return;
      mode = m; switches++;
      if (!audio.ctx) return;
      if (m === 'boat' && !built) build();
      if (built) fadeTo(m);
    },
    // every frame (audio.update): the lake's odd sounds while aboard
    update() {
      if (!audio.ctx) return;
      if (mode === 'boat' && !built) { build(); fadeTo('boat'); }
      if (!built || mode !== 'boat' || audio.muted) return;
      extras(audio.ctx.currentTime);
    },
    state() { const s = song(); return { mode, playing: api.playing, built: !!built, bars: s ? s.bars : 0, switches, gain: built ? built.bus.gain.value : 0, track: s ? s.id : null, trackPlaying: !!s }; },
  };
  return api;
}
