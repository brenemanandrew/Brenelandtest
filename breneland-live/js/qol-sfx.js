// Sound effects for the places that had none. Registered once by main.js through audio.registerSfx (docs/CONTRACTS.md),
// measured offline by tools/audio-levels.mjs (group `qol`). Peaks 0.02-0.3 as written, SFX_MIX in audio.js may trim them.
// Called without a position, a builder plays straight to the sfx bus (footsteps, menus), like audio.footstep() and audio.ui().
//
//   the yard      basket (wicker rummage), pickup (a soft grab), toy-windup (a rising tick while you hold E)
//   the porch     porch-swing-sit, porch-swing-creak (the chains at each end of the arc)
//   footsteps     step-stone (roads and sidewalks), step-gravel (the shops' lot), step-leaves (the woods), step-water
//                 (wading at the shore), step-snow (when snow lies), step-wet (puddles after rain). Grass, wood, dirt
//                 and sand are audio.footstep(). stepSurface() decides which (main.js player.onStep).
//   menus         menu-open, menu-close, menu-page (Settings)
//   the dock      sail-up, sail-down (Kevin's sail), boat-creak (his boat at anchor), can-open (a beer, pssht), sweep
//                 (Kevin's broom in the morning)
//   the booth     till (a wreath bought at Carol's stand), wreath-rustle (lifted off the tripod)
import { FISH_SHACK, CAR_LOT, WOODS_X } from './layout.js';
import { surfaceAt, coastSigned, onSurface } from './terrain.js';
import { WEATHER } from './daynight-mats.js';

const at = (a, x, y, z, ref = 3) => (x === undefined ? a.sfx : a.at(x, y, z, ref));
const rand = (a, b) => a + Math.random() * (b - a);
const OLD = new Set(['grass', 'wood', 'dirt', 'sand']);

// Which footstep for a step at (x, z): the basic four, refined by place and by the weather on the ground.
export function stepSurface(x, z, onTrail) {
  const S = FISH_SHACK;
  if (Math.abs(x - S.x) < S.w / 2 && Math.abs(z - S.z) < S.d / 2) return 'wood';   // the shack's plank floor
  let s = surfaceAt(x, z, onTrail);
  if (s === 'wood') return s;
  if (coastSigned(x, z) > 0.05 && !onSurface(x, z)) return 'water';   // (wading: any shore, swim.js lets you in anywhere)
  if (x > CAR_LOT.minX && x < CAR_LOT.maxX && z > CAR_LOT.minZ && z < CAR_LOT.maxZ) s = 'gravel';
  else if (s === 'dirt' && !onTrail) s = 'stone';                    // tar and sidewalk (surfaceAt calls them dirt)
  else if (x < WOODS_X && s !== 'sand') s = 'leaves';
  const g = WEATHER.ground;
  if (g && g.snow > 0.35 && s !== 'water') return 'snow';
  if (g && g.wet > 0.5 && (s === 'stone' || s === 'dirt' || s === 'gravel')) return 'wet';
  return s;
}
// Play the step (the basic four through audio.footstep, the rest through their registered effects).
export function playStep(audio, s) {
  if (OLD.has(s)) audio.footstep(s); else audio.play('step-' + s);
}

export function registerQolSfx(audio) {
  if (!audio?.registerSfx || audio._qolSfx) return;
  audio._qolSfx = true;
  const R = (name, fn) => audio.registerSfx(name, fn);

  // ---- the toy basket and your toy
  R('basket', (a, x, y, z) => { // wicker creaks and a rummage
    const o = at(a, x, y, z), t = a.ctx.currentTime;
    for (let i = 0; i < 3; i++) a.burst(o, { t: t + i * 0.07 + Math.random() * 0.02, dur: 0.06, type: 'bandpass', f: 1500 + Math.random() * 900, Q: 3, peak: 0.17 });
    a.burst(o, { t, dur: 0.22, type: 'bandpass', f: 3200, Q: 0.8, peak: 0.07, attack: 0.04 });
  });
  R('pickup', (a, x, y, z) => { const o = at(a, x, y, z), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.05, type: 'lowpass', f: 900, peak: 0.08, brown: true }); a.tone(o, { f: 520, glide: 760, t: t + 0.03, d: 0.09, peak: 0.045, type: 'triangle' }); });
  R('toy-windup', (a, x, y, z, op = {}) => { const o = at(a, x, y, z, 2), k = op.k || 0; a.tone(o, { f: 380 + k * 520, d: 0.05, peak: 0.035 + k * 0.02, type: 'triangle' }); });

  // ---- the porch swing: a wooden creak as you sit, the chains creaking softly at each end of the arc
  R('porch-swing-sit', (a, x, y, z) => {
    const o = at(a, x, y, z), t = a.ctx.currentTime;
    a.burst(o, { t, dur: 0.08, type: 'lowpass', f: 500, peak: 0.12, brown: true });
    a.tone(o, { f: 180, glide: 240, t: t + 0.05, d: 0.28, peak: 0.035, type: 'sawtooth' });
    a.burst(o, { t: t + 0.12, dur: 0.05, f: 2600, Q: 5, peak: 0.04 });
  });
  R('porch-swing-creak', (a, x, y, z, op = {}) => {
    const o = at(a, x, y, z, 2.5), t = a.ctx.currentTime, k = Math.min(1, op.k ?? 1), up = op.dir > 0;
    a.tone(o, { f: up ? 300 : 250, glide: up ? 380 : 210, t, d: 0.32, peak: 0.032 * k, type: 'sawtooth' });
    a.burst(o, { t: t + 0.02, dur: 0.04, f: 3600, Q: 6, peak: 0.02 * k }); // a chain link tick
  });

  // ---- footsteps on the other surfaces (straight to the sfx bus, about as loud as audio.footstep's)
  R('step-stone', a => { const o = a.sfx, t = a.ctx.currentTime; a.burst(o, { t, dur: 0.045, type: 'bandpass', f: rand(1700, 2300), Q: 1.4, peak: 0.12 }); a.burst(o, { t, dur: 0.03, type: 'lowpass', f: 500, peak: 0.08, brown: true }); });
  R('step-gravel', a => { const o = a.sfx, t = a.ctx.currentTime; for (let i = 0; i < 4; i++) a.burst(o, { t: t + i * 0.018 + Math.random() * 0.01, dur: 0.03, type: 'bandpass', f: rand(2500, 4200), Q: 2, peak: 0.11 }); });
  R('step-leaves', a => { const o = a.sfx, t = a.ctx.currentTime; a.burst(o, { t, dur: 0.11, type: 'bandpass', f: rand(2600, 3600), Q: 0.7, peak: 0.06, attack: 0.01 }); if (Math.random() < 0.18) a.burst(o, { t: t + 0.04, dur: 0.02, type: 'bandpass', f: 1400, Q: 6, peak: 0.07 }); }); // now and then a twig
  R('step-water', a => { const o = a.sfx, t = a.ctx.currentTime; a.burst(o, { t, dur: 0.16, type: 'bandpass', f: rand(900, 1300), Q: 0.9, peak: 0.1, attack: 0.012 }); a.tone(o, { f: rand(500, 700), glide: 260, t: t + 0.02, d: 0.09, peak: 0.025 }); });
  R('step-snow', a => { const o = a.sfx, t = a.ctx.currentTime; a.burst(o, { t, dur: 0.14, type: 'lowpass', f: 1800, Q: 0.6, peak: 0.1, attack: 0.025 }); a.burst(o, { t: t + 0.03, dur: 0.07, type: 'bandpass', f: 4200, Q: 1.5, peak: 0.025 }); });
  R('step-wet', a => { const o = a.sfx, t = a.ctx.currentTime; a.burst(o, { t, dur: 0.05, type: 'bandpass', f: 1900, Q: 1.3, peak: 0.15 }); a.burst(o, { t: t + 0.02, dur: 0.09, type: 'bandpass', f: 1100, Q: 1, peak: 0.08 }); });

  // ---- menus: the Settings panel opening, closing and turning a page
  R('menu-open', a => { const o = a.sfx, t = a.ctx.currentTime; a.tone(o, { f: 520, glide: 780, t, d: 0.1, peak: 0.045, type: 'triangle' }); a.tone(o, { f: 780, t: t + 0.07, d: 0.16, peak: 0.035, type: 'triangle' }); });
  R('menu-close', a => { const o = a.sfx, t = a.ctx.currentTime; a.tone(o, { f: 700, glide: 470, t, d: 0.12, peak: 0.04, type: 'triangle' }); });
  R('menu-page', a => { const o = a.sfx, t = a.ctx.currentTime; a.burst(o, { t, dur: 0.06, type: 'bandpass', f: 2600, Q: 1.2, peak: 0.06, attack: 0.01 }); a.tone(o, { f: 640, d: 0.05, t: t + 0.02, peak: 0.04, type: 'triangle' }); });

  // ---- the dock: Kevin's sail going up and coming down, his boat creaking at anchor, a beer, the broom
  R('sail-up', (a, x, y, z) => { const o = at(a, x, y, z, 5), t = a.ctx.currentTime; for (let i = 0; i < 5; i++) a.burst(o, { t: t + i * 0.16, dur: 0.12, type: 'bandpass', f: 700 + i * 120, Q: 0.8, peak: 0.08 }); a.burst(o, { t: t + 0.9, dur: 0.3, type: 'lowpass', f: 400, peak: 0.12, brown: true }); }); // hauling, then the sail fills with a whump
  R('sail-down', (a, x, y, z) => { const o = at(a, x, y, z, 5), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.5, type: 'bandpass', f: 600, sweep: 300, Q: 0.7, peak: 0.08, attack: 0.05 }); a.burst(o, { t: t + 0.55, dur: 0.12, type: 'lowpass', f: 300, peak: 0.07, brown: true }); });
  R('boat-creak', (a, x, y, z) => { const o = at(a, x, y, z, 4), t = a.ctx.currentTime; a.tone(o, { f: rand(130, 170), glide: rand(190, 240), t, d: 0.45, peak: 0.03, type: 'sawtooth' }); });
  R('can-open', (a, x, y, z) => { const o = at(a, x, y, z, 2), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.02, type: 'bandpass', f: 2800, Q: 4, peak: 0.08 }); a.burst(o, { t: t + 0.02, dur: 0.28, type: 'bandpass', f: 2800, Q: 0.6, peak: 0.06, attack: 0.005 }); });
  R('sweep', (a, x, y, z) => { const o = at(a, x, y, z, 2.5), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.32, type: 'bandpass', f: rand(2400, 3200), Q: 0.6, peak: 0.05, attack: 0.08 }); });

  // ---- Carol's wreath stand (buddy-carol.js): the till as a wreath is bought, the rustle of one lifted off the tripod
  R('till', (a, x, y, z) => { // ka-ching: a drawer bump and a bright two-note bell
    const o = at(a, x, y, z, 3), t = a.ctx.currentTime;
    a.burst(o, { t, dur: 0.05, type: 'lowpass', f: 700, peak: 0.1, brown: true });
    a.tone(o, { f: 1568, t: t + 0.06, d: 0.35, peak: 0.06, type: 'triangle' });
    a.tone(o, { f: 2093, t: t + 0.16, d: 0.5, peak: 0.055, type: 'triangle' });
  });
  R('wreath-rustle', (a, x, y, z) => { const o = at(a, x, y, z, 2.5), t = a.ctx.currentTime; for (let i = 0; i < 3; i++) a.burst(o, { t: t + i * 0.06, dur: 0.09, type: 'bandpass', f: rand(2200, 3800), Q: 0.9, peak: 0.06, attack: 0.01 }); });
}
