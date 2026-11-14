// Which game sound plays which real clips. Hand-edited, like dog-voice-map.js. The clips are catalogued in
// sfx-clips.js (tools/sfx-cut.mjs). sfx-bank.js plays a sound from here once its clips have loaded, and the synthesised
// sound (the builder registered with audio.registerSfx, or the engine's own footstep / ui / door / neigh) otherwise.
//
// A sound is one layer or a list of layers, or a function (opts) -> that, so the caller's options (how fast the swing goes,
// how big the splash) still shape it. A layer:
//   ids     the clips; one is picked each play, never the one played last for this sound when there is a choice
//   db      its level (dB) into the bus, set by measuring it at 3 m against the synthesised sound it replaces
//           (tools/sfx-calibrate.mjs; the effects' peaks and loudness land where the synth's did)
//   rate    playback rate, a number or [lo, hi] (pitch and speed together); on top, every play is detuned by up to `jit`
//           semitones (default 0.5) and its level moved by up to `jitDb` (default 1 dB), so repeats never machine-gun
//   at      a delay (s) from the call
//   bus     'sfx' (default), 'amb' (critters, the shore, the weather) or 'voices' (the unicorns)
//   ref, roll  the panner's distance model when the call has a position (as the synthesised sound's a.at(x, y, z, ref, roll))
//   lp      a lowpass (Hz) in front
// No imports: tools/sfx-cut.mjs reads this file for its report.
const RAND = { jit: 0.5, jitDb: 1 };
const L = (ids, o = {}) => ({ ids, ...o });

const CREAK = ['creak-01', 'creak-02', 'creak-03', 'creak-04'];
const SPARKLE = ['ui-sparkle-01', 'ui-sparkle-02', 'ui-sparkle-03', 'ui-sparkle-04'];
const SPLASH = ['splash-01', 'splash-02', 'splash-03'];
const SWISH = ['swish-01', 'swish-02'];
const CLOTH = ['cloth-02', 'cloth-03'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lin = (db, k) => db + 20 * Math.log10(Math.max(0.05, k));   // a level scaled by k (as the synth's peaks were)

export const SFX_MAP = {
  // ---- the engine's own sounds (audio.js ui / door / neigh). The footsteps on every surface are our own synthesised steps:
  // no step-* entry here, see KEPT.
  'ui-chime': L(['ui-chime-01', 'ui-chime-02'], { db: -11.2, jit: 0 }),
  'ui-blip': L(['ui-blip-01', 'ui-blip-02'], { db: -19.8, jit: 0.3 }),
  'ui-pop': L(['ui-pop-01', 'ui-pop-02', 'ui-pop-03'], { db: -18.4, jit: 0.3 }),
  'ui-sparkle': [L(SPARKLE, { db: -14.2, rate: 1.25 }), L(SPARKLE, { db: -17.2, rate: 1.5, at: 0.11 })],
  'door-open': [L(['door-open-01', 'door-open-02'], { db: -20.9, ref: 3, roll: 1 })],
  'door-close': L(['door-close-01', 'door-close-02', 'door-close-03'], { db: -15.1, ref: 3, roll: 1 }),
  // the unicorns: the cartoon neigh (k: the unicorn's own pitch)
  neigh: (o = {}) => L(['neigh-01', 'neigh-02'], { bus: 'voices', db: -1.8, rate: clamp(o.k || 1, 0.8, 1.3), ref: 3, roll: 1.2 }),
  // creaks the engine makes itself (the dock's boards, a unicorn balloon's string, the deep woods' trunks)
  creak: (o = {}) => L(CREAK, { db: lin(-25.5, o.k ?? 1), rate: o.low ? [0.55, 0.7] : [0.75, 0.9] }),

  // ---- qol-sfx.js
  pickup: L(['grab-02', 'grab-01'], { db: -25.8, ref: 3 }),
  'porch-swing-sit': [L(['creak-04'], { db: -21.9, rate: 0.8, ref: 3 }), L(['thud-02'], { db: -24.9, ref: 3 })],
  'porch-swing-creak': (o = {}) => L(CREAK, { db: lin(-21.7, Math.min(1, o.k ?? 1)), rate: o.dir > 0 ? [0.85, 0.95] : [0.72, 0.82], ref: 2.5 }),
  'menu-open': L(['ui-open-01'], { db: -17.6, jit: 0 }),
  'menu-close': L(['ui-close-01'], { db: -17.6, jit: 0 }),
  'menu-page': L(['ui-page-01', 'ui-page-02'], { db: -24.7 }),
  'sail-up': [L(['cloth-01'], { db: -23.2, rate: 0.75, ref: 5 }), L(['cloth-03'], { db: -25.2, rate: 0.7, at: 0.75, ref: 5 })],
  'sail-down': [L(['cloth-02'], { db: -28.4, rate: 0.7, ref: 5 }), L(['cloth-03'], { db: -30.4, rate: 0.65, at: 0.45, ref: 5 })],
  'boat-creak': L(CREAK, { db: -23.3, rate: [0.6, 0.75], ref: 4 }),
  till: [L(['knock-01'], { db: -29.6, rate: 0.8, ref: 3 }), L(['coins-01'], { db: -20.6, at: 0.05, ref: 3 })],
  'wreath-rustle': L(CLOTH, { db: -25.3, rate: 1.15, ref: 2.5 }),

  // ---- fishing (fish-audio.js)
  'fish-whoosh': (o = {}) => L(SWISH, { db: lin(-20, 0.6 + 0.6 * (o.power ?? 0.5)), rate: 0.85 + 0.25 * (o.power ?? 0.5), ref: 6 }),
  'fish-plink': L(['plop-01', 'plop-02'], { db: -13.6, rate: [1.05, 1.2], ref: 6 }),
  'fish-splash': (o = {}) => L(SPLASH, { db: lin(-13, Math.min(1.3, o.size ?? 1)), rate: clamp(1.15 / Math.sqrt(o.size ?? 1), 0.8, 1.3), ref: 7 }),
  'fish-bloop': L(['bloop-01', 'bloop-02'], { db: -10.5, rate: [1.1, 1.2], ref: 12 }),
  'fish-toss': L(SWISH, { db: -22.9, rate: 0.8, ref: 6 }),
  'fish-thud': (o = {}) => L(['slap-01', 'slap-02'], { db: lin(-16.6, o.k ?? 1), ref: 6 }),
  'fish-pop': L(['ui-drop-01'], { db: -17.8, jit: 0.3 }),
  'fish-equip': L(['ui-toggle-01'], { db: -14, jit: 0 }),
  'fish-away': L(['ui-back-01'], { db: -19.5, jit: 0 }),
  'fish-item': L(['ui-item-01'], { db: -7.6, jit: 0 }),
  'fish-blip': L(['ui-tick-02'], { db: -18.9, jit: 0.3 }),
  // the catch: The Reel Winner (audio.js plays it at most once a minute, and for every big catch; the synthesised arpeggio between)
  'fish-catch': L(['sting-reel-winner'], { db: -11.4, jit: 0, jitDb: 0, ref: 14 }),

  // ---- the tire swing (swing-sfx.js): only the rope's creak and the stars are real; the cartoon ones stay synthesised
  'swing-creak': (o = {}) => { const v = Math.min(1.2, o.v ?? 0.3); return L(CREAK, { db: lin(-11.5, 0.35 + 0.55 * v), rate: 0.75 + 0.3 * v, ref: 4 }); },
  'swing-stars': [L(SPARKLE, { db: -10.2, rate: 1.3, ref: 5 }), L(SPARKLE, { db: -12.2, rate: 1.6, at: 0.14, ref: 5 }), L(SPARKLE, { db: -14.2, rate: 2, at: 0.28, ref: 5 })],

  // ---- bocce (bocce-sfx.js)
  'bocce-knock': (o = {}) => L(['knock-01', 'knock-02', 'knock-03'], { db: lin(2, clamp((o.v ?? 1) / 3, 0.25, 1)), ref: 5 }),
  'bocce-thump': (o = {}) => L(['thud-01', 'thud-02'], { db: lin(1.9, clamp((o.v ?? 1) / 2.5, 0.3, 1)), ref: 5 }),
  'bocce-tick': (o = {}) => L([o.hi ? 'ui-tick-02' : 'ui-tick-01'], { db: o.hi ? -3 : -5, rate: o.hi ? 1.2 : 1, jit: 0, ref: 8, roll: 0.8 }),

  // ---- the town and the unicorns' lawn (town-sfx.js)
  'fountain-plip': L(['bloop-02'], { db: -20.2, rate: [1.5, 1.9], ref: 4, roll: 1.3 }),
  'fountain-splash': (o = {}) => L(['splash-small-01', 'splash-03'], { db: lin(-23.1, o.k ?? 1), rate: [0.9, 1.05], ref: 4, roll: 1.3 }),
  'uni-creak': L(CREAK, { db: -32.5, rate: [0.9, 1.1], ref: 3, roll: 1.4 }),
  'uni-twinkle': (o = {}) => L(SPARKLE, { db: lin(-20.9, o.k ?? 1), rate: [1.3, 1.7], ref: 4, roll: 1.3 }),

  // ---- the yard, the garden, the swim, the water tower, the dogs
  gate: (o = {}) => (o.open
    ? [L(['latch-01'], { db: -21.9, ref: 4 }), L(['creak-02', 'creak-03'], { db: -26.9, rate: [0.85, 1], at: 0.04, ref: 4 })]
    : [L(['creak-04'], { db: -27.9, rate: 1.1, ref: 4 }), L(['knock-03'], { db: -17.9, rate: 0.85, at: 0.32, ref: 4 }), L(['latch-01'], { db: -24.9, at: 0.36, ref: 4 })]),
  'garden-ding': L(['ui-chime-02'], { db: -16.4, ref: 4, jit: 0 }),
  rustle: L(CLOTH, { db: -23.3, rate: 1.2, ref: 4 }),
  'splash-can': L(['pour-01'], { db: -24.4, rate: [0.95, 1.05], ref: 4 }),
  found: L(['ui-chime-01'], { db: -9.5, ref: 4, jit: 0 }),
  splash: (o = {}) => L(['splash-big-01', 'splash-big-02'], { db: lin(-20.8, Math.min(1.4, o.size || 1)), rate: clamp(1 / Math.sqrt(o.size || 1), 0.8, 1.2), ref: 5 }),
  bubbles: L(['bloop-01', 'bloop-03'], { db: -21.3, rate: [1.2, 1.4], ref: 4 }),
  stroke: L(['stroke-01', 'stroke-02'], { db: -30.5, rate: [0.9, 1.1], ref: 4 }),
  grab: L(['grab-01', 'grab-02'], { db: -20.1, ref: 3 }),
  rung: L(['metal-click-01'], { db: -19, rate: [0.9, 1.1], ref: 3 }),
  thump: L(['thud-01'], { db: -7.2, rate: 0.9, ref: 6 }),
  chalk: [L(['ui-scratch-01'], { db: -16.9, ref: 3 }), L(['ui-chime-02'], { db: -20.9, at: 0.1, ref: 3, jit: 0 })],
  dogthump: (o = {}) => L(['thud-01', 'thud-02'], { db: -17.5, rate: [1.0, 1.2], ref: 4 }),
  ballthrow: (o = {}) => L(SWISH, { db: lin(-25, 0.6 + (o.power ?? 0.35)), rate: 1.15, ref: 3 }),
};
for (const k of Object.keys(SFX_MAP)) { const s = SFX_MAP[k]; if (typeof s !== 'function') SFX_MAP[k] = Array.isArray(s) ? s.map(l => ({ ...RAND, ...l })) : { ...RAND, ...s }; }
export const DEFAULTS = RAND;

// The sounds that stay synthesised, and why (nothing in the packs fits as well; tools/sfx-cut.mjs copies this list into docs/sfx-bank.md)
export const KEPT = {
  'footsteps (every surface)': 'our own steps again (music-ac, Andrew 2026-10-29): grass, sand, leaves, stone, wood, dirt, snow, gravel, wading, wet',
  'unicorn hooves': 'off with the footsteps (music-ac): there was no synthesised clop before the real one',
  'ui-whoosh': 'no whoosh in the packs (the vault, the leaving fade)',
  basket: 'a wicker rummage: nothing like it in the packs',
  'toy-windup': 'a rising tone that follows how long E is held',
  'can-open': 'no can in the packs', sweep: 'no broom in the packs',
  'fish-ripple': 'a soft tonal ripple', 'fish-tick': 'the nibble cue: a clean tick reads best', 'fish-reel': 'the reel clicks follow the line tension',
  'fish-snap': 'a cue', 'fish-golden': 'a tuned sparkle run (the Reel Winner sting plays with it)', 'fish-junk': 'the cartoon "wah wah"', 'fish-chomp': 'nothing like it',
  'fish-catch (between stings)': 'the short arpeggio, between Reel Winner stings (the sting plays at most once a minute)',
  'swing-squeal': 'the tuned danger cue', 'swing-whoosh': 'the swish in the packs is a blade; the synth air reads better', 'swing-pump': 'a timing cue',
  'swing-perfect': 'tuned to the run of perfect pumps', 'swing-miss': 'a cue', 'swing-sproing': 'cartoon', 'swing-boing': 'cartoon', 'swing-oof': 'cartoon',
  'swing-rustle': 'no leafy bush in the packs', 'swing-wings': 'cartoon', 'swing-fanfare': 'tuned fanfare', 'swing-wee': 'a voice', 'swing-giggle': 'a voice',
  'bocce-clack': 'no ball-on-ball click in the packs', 'bocce-roll': 'a grain per frame, follows the speed', 'bocce-toss': 'the swish in the packs is a blade',
  'bocce-point': 'tuned to the points scored', 'bocce-aww': 'the cartoon "wah wah"', 'bocce-cheer': 'no crowd in the packs',
  'fire-light': 'no match strike in the packs', 'fire-douse': 'no steam hiss in the packs', thunder: 'no thunder in the packs', drip: 'a tuned plink per drop',
  'car-horn': 'no horn in the packs', 'car-brake': 'no tyres in the packs', 'uni-squeak': 'a balloon squeak', 'uni-pop': 'no balloon pop in the packs', 'uni-giggle': 'a voice',
  'uni-whoosh': 'a fluffy cloud whoosh', 'uni-horn': 'a party horn', 'uni-kazoo': 'a kazoo tune', 'uni-confetti': 'no confetti popper in the packs',
  squeak: 'a squeaky toy', ballbounce: 'per toy (ball, frisbee, rope, duck)', dust: 'a puff of dust', bell: 'the store door bell, tuned',
  caw: 'no crows in the packs', crow: 'no crows in the packs', 'photo-shutter': 'no camera in the packs', pry: 'an oyster knife', slip: 'a slide', heart: 'a heartbeat',
  fanfare: 'tuned fanfare', yipe: 'the dog voices (real clips of their own: dog-voice.js)', crunch: 'a treat crunch',
  'engine loop': 'the cars follow their speed', 'rainbow hum': 'tuned shimmer', 'wind, surf, woods, street beds': 'nothing in the packs fits; sound-moderation tuned them',
  'birds, gulls, crows, woodpecker, owl, crickets, far barks': 'no birds or insects in the packs', 'water laps': 'the shore and the dock; sound-moderation tuned them',
  'area beds (arkham, mushrooms, garden bee, picnic guitar, generic dice)': 'tuned or nothing in the packs',
};

// every clip id a sound can play (for the report and the tests)
export function clipsOf(name) {
  const s = SFX_MAP[name];
  const layers = typeof s === 'function' ? [].concat(s({}), s({ open: true, hi: true })) : [].concat(s || []);
  return [...new Set(layers.flatMap(l => l.ids))];
}
// the loops the beds play (audio.js the fire, town-sfx.js the fountain, weather-sfx.js the rain)
export const LOOPS = ['loop-rain', 'loop-rain-light', 'loop-fountain', 'loop-fire'];
export function allClipIds() { return [...new Set([...Object.keys(SFX_MAP).flatMap(clipsOf), ...LOOPS])]; }
