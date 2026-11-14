// Weather sounds on the ambience bus (audio.js): rain beds at three intensities that cross-fade with the rain (real rain once
// its loops have loaded: a light patter and a steady rain from sfx-bank.js, the synthesised beds until then and under the
// heaviest rain), thunder with a crack when it's close and a long rumble from the strike's direction, drips under the trees,
// and a louder, wilder wind bed on a windy day (the wind bed itself lives in audio.js; it reads WEATHER).
// Levels: the beds sit with the other ambience (-35..-30 dBFS RMS), thunder peaks about -14 dBFS close, drips -30.
// In a room (indoor-rooms.js, weather.js passes `indoor` 0..1) the rain is the roof's: INDOOR_RAIN quieter and muffled, no drips.
import { WEATHER } from './daynight-mats.js';
import { loopSource } from './sfx-bank.js';

// the real rain's levels on the ambience bus (measured with tools/sfx-calibrate.mjs against the synthesised beds)
export const REAL_RAIN = { light: 0.4, steady: 0.33 };
// the rain heard from in a room: its level (x the outside's) and its lowpass (Hz); out in it the filter is wide open
export const INDOOR_RAIN = { gain: 0.2, lp: 700, open: 20000 };

const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createWeatherSfx(audio) {
  let beds = null;

  // the three rain loops are made once the engine exists (after the first click)
  function ensureBeds() {
    if (beds || !audio.ctx || !audio.amb) return beds;
    const a = audio;
    const bus = a.gain(1), lp = a.filter('lowpass', INDOOR_RAIN.open, 0.7); // every rain sound goes through this (the room muffles it)
    bus.connect(lp).connect(a.amb);
    const mk = (type, chain, g0 = 0) => { const src = a.noise(type); const g = a.gain(g0); chain.reduce((x, y) => x.connect(y), src).connect(g).connect(bus); src.start(); return g; };
    beds = {
      bus, lp,
      // light: a high patter, on leaves and the roof
      light: mk('white', [a.filter('bandpass', 4200, 0.5), a.filter('highpass', 1600, 0.6)]),
      // medium: fuller, more body
      medium: mk('white', [a.filter('lowpass', 3200, 0.5), a.filter('highpass', 500, 0.6)]),
      // heavy: a roar with a low wash under it
      heavy: mk('white', [a.filter('lowpass', 1800, 0.5)]),
      wash: mk('brown', [a.filter('lowpass', 420, 0.6)]),
      // the patter's slow swell so it breathes instead of hissing flat
      t0: a.ctx.currentTime,
    };
    return beds;
  }

  // thunder: a crack first when the strike is close, then a rumble that rolls for several seconds
  audio.registerSfx('thunder', (a, x, y, z, { dist = 1500, power = 0.8 } = {}) => {
    const out = a.atAmb(x, y, z, 40, 0.5);
    const t = a.ctx.currentTime;
    const close = 1 - smooth(300, 2500, dist);        // 1 right overhead, 0 far away
    const len = 2.5 + (1 - close) * 3.5 + power * 1.5;
    const vol = (0.09 + close * 0.2) * power;
    if (close > 0.35) { // the crack
      a.burst(out, { t, dur: 0.12, type: 'bandpass', f: 900, Q: 0.6, peak: 0.28 * close * power, attack: 0.004 });
      a.burst(out, { t: t + 0.03, dur: 0.3, type: 'lowpass', f: 1400, peak: 0.2 * close * power, attack: 0.01 });
    }
    // the rumble: brown noise through a low filter, its level wobbling as it rolls round the hills
    const src = a.noise('brown', true), lp = a.filter('lowpass', 90 + close * 140, 0.8), g = a.gain(0);
    src.connect(lp).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08 + (1 - close) * 0.5);
    let tt = t + 0.4;
    while (tt < t + len - 0.6) { const step = rand(0.25, 0.6); g.gain.linearRampToValueAtTime(vol * rand(0.35, 1), tt + step); tt += step; }
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.start(t, Math.random() * 1.5); src.stop(t + len + 0.1);
    const s = a.gain(0.5); g.connect(s).connect(a.ambVerbIn); // long tail
  });
  // one drip from a leaf or a lamp post: a soft plink
  audio.registerSfx('drip', (a, x, y, z, { k = 1 } = {}) => {
    const out = a.atAmb(x, y, z, 2.5, 1.4);
    const t = a.ctx.currentTime, f = rand(700, 1300);
    a.tone(out, { f, glide: f * 0.6, t, a: 0.003, d: 0.09, peak: 0.24 * k, type: 'sine' });
    a.burst(out, { t, dur: 0.03, type: 'bandpass', f: 2600, Q: 2, peak: 0.1 * k });
  });

  // the real rain loops (null until both have loaded): the patter for light rain, the steady rain for medium and heavy
  let real = null;
  function ensureReal() {
    if (real || !beds) return real;
    const a = audio, l = loopSource(a, 'loop-rain-light'), r = loopSource(a, 'loop-rain');
    if (!l || !r) return null;
    const lg = a.gain(0), rg = a.gain(0), tone = a.filter('lowpass', 5000, 0.5);
    l.connect(lg).connect(beds.bus); r.connect(tone).connect(rg).connect(beds.bus);
    l.start(); r.start();
    return (real = { lg, rg, tone });
  }
  let nextDrip = 0, muffK = -1, level = 0;
  return {
    // rainK: 0..1 where the listener stands; underTree: true when a canopy is overhead; px, pz the player; indoor: 0..1 in a room
    update(dt, now, { rainK, underTree, px, pz, local, indoor = 0 }) {
      const b = ensureBeds();
      if (!b) return;
      const t = audio.ctx.currentTime;
      if (Math.abs(indoor - muffK) > 0.01) { // the roof: quieter, and only the low drumming comes through
        muffK = indoor;
        b.bus.gain.setTargetAtTime(1 + (INDOOR_RAIN.gain - 1) * indoor, t, 0.12);
        b.lp.frequency.setTargetAtTime(INDOOR_RAIN.open * Math.pow(INDOOR_RAIN.lp / INDOOR_RAIN.open, indoor), t, 0.12);
      }
      const light = smooth(0.02, 0.35, rainK) * (1 - smooth(0.45, 0.8, rainK));
      const medium = smooth(0.3, 0.6, rainK) * (1 - smooth(0.8, 1, rainK) * 0.5);
      const heavy = smooth(0.55, 1, rainK);
      const swell = 0.85 + 0.15 * Math.sin(now * 0.37) * Math.sin(now * 0.11);
      const under = underTree ? 1.35 : 1; // under a canopy the patter is louder and the roar softer
      // (measured with tools/weather-audio.mjs: the full bed sits near -34 dBFS RMS, with the other ambience)
      const r = rainK > 0.01 ? ensureReal() : real;   // (the real loops start the first time it rains)
      const synth = r ? 0 : 1;
      b.light.gain.setTargetAtTime(0.05 * light * swell * under * synth, t, 0.8);
      b.medium.gain.setTargetAtTime(0.045 * medium * swell * synth, t, 0.8);
      b.heavy.gain.setTargetAtTime(0.05 * heavy / under * (r ? 0.5 : 1), t, 0.8);   // (the roar stays under the real rain, softer)
      if (r) {
        r.lg.gain.setTargetAtTime(REAL_RAIN.light * light * swell * under, t, 0.8);
        r.rg.gain.setTargetAtTime(REAL_RAIN.steady * Math.max(medium, heavy) * swell * (underTree ? 0.85 : 1), t, 0.8);
        r.tone.frequency.setTargetAtTime(underTree ? 3500 : 3000 + 4000 * heavy, t, 0.8);
      }
      b.wash.gain.setTargetAtTime(0.1 * heavy / under, t, 1.2);
      level = r ? REAL_RAIN.light * light * swell * under + REAL_RAIN.steady * Math.max(medium, heavy) * swell + 0.05 * heavy * 0.5 / under + 0.1 * heavy / under
        : 0.05 * light * swell * under + 0.045 * medium * swell + 0.05 * heavy / under + 0.1 * heavy / under;
      // drips: under a tree in the rain, and round the dead tree and the lamps of the Arkham corner
      if (indoor < 0.5 && ((underTree && rainK > 0.15) || (local > 0.3 && rainK > 0.1))) {
        if (now > nextDrip) {
          nextDrip = now + rand(0.25, 1.1) / Math.max(0.3, rainK);
          const a = rand(0, 6.28), r = rand(0.8, 3.2);
          audio.play('drip', px + Math.cos(a) * r, 1.6 + rand(0, 1.6), pz + Math.sin(a) * r, { k: 0.6 + rainK * 0.5 });
        }
      }
    },
    thunder(x, y, z, opts) { audio.play('thunder', x, y, z, opts); },
    get ready() { return !!beds; },
    // what the rain goes through now (tests): its level x the outside's, the lowpass in Hz, the room 0..1
    get muffle() { return beds ? { gain: beds.bus.gain.value, lp: beds.lp.frequency.value, indoor: muffK } : null; },
    get real() { return !!real; },
    // the rain beds' summed gain just asked for (tests: the storm's sound falling off with distance), before the room's muffle
    get level() { return level; },
  };
}

export { WEATHER };
