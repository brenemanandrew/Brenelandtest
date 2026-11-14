// Beneath Angell Street: the body below, as numbers and small pure functions (the Node tests load this file). The longer you run
// and the less breath you have, the shakier your gait and the harder you breathe. Crouching hides you.
//
//   unsteady(breath, runLong, winded)   0 steady .. 1 staggering: the breath spent, a long run; winded is at least 0.9
//   gaitAt(u, bob, step, t, seed, out)  the eye's bob, sway and roll for that much unsteadiness (the scene adds the lurches)
//   breathPlan(breath, winded, runRecent, out)   the breathing: seconds to the next breath, how loud, how ragged
//   CROUCH, STEER, ACC                  the crouch (eye height, pace), the phone stick's steer, the starts and stops
// maze-scene.js drives them (camera, crouch, lurches), maze-fx.js schedules the breath and its vapour and swings the lantern
// harder, maze-audio.js voices the breath, and lib/maze-ghoul.js keeps its own count of the breath and believes the crouch.

export const EYE = 1.5;
// the crouch: the eye about 0.9 m up, half the walk, near-silent steps (lib/maze-ghoul.js believes it up to T.crouch.max m/s),
// no running (a push to run stands you up), eased in and out over about a fifth of a second
export const CROUCH = { eye: 0.9, pace: 0.5, ease: 9, vignette: 0.5 };
// the phone's stick in first person (maze-touch.js): pushed past the straight-ahead cone toward a side it turns you that way (up
// to `turn` rad/s at a full push to the side, front half only) and strafes only `strafe` of what it did; the look thumb still
// turns freely. Third person goes the way you push, the body turning to face it and the camera following behind (the yard's way).
export const STEER = { turn: 2.1, strafe: 0.4, follow: 1.8, quiet: 0.7 };
// how quickly you get going and stop (1/s, the velocity's approach)
export const ACC = { go: 16, stop: 24 };

// each investigator's own voice: the breathing, gasps and panting, the yelp and struggle when grabbed, the cry when taken.
// Procedural (maze-audio.js vocal()), no words:
//   f0       the voiced pitch (Hz) of a gasp's catch, a grunt, a yelp
//   formant  the mouth's resonance (Hz): the breath's hiss and the cries are shaped round it
//   lowF     the breath's darker part (Hz, a lowpass)
//   air      breathiness 0..1 (more hiss to the voiced parts)
//   rasp     gruffness 0..1 (a rough, low growl of noise under the voice)
//   rate     how quick the cries are (1 an adult; a kid quicker)
// Sexes and ages follow maze-investigators.js: the Detective an older lawman (gruff, low), the Librarian a woman, the Rogue a
// younger man, the Mystic a woman (airy, low for a woman), the Survivor a street kid (a girl: high and quick)
export const VOICES = {
  detective: { f0: 92, formant: 640, lowF: 520, air: 0.45, rasp: 0.7, rate: 0.9 },
  librarian: { f0: 205, formant: 1250, lowF: 980, air: 0.6, rasp: 0.05, rate: 1 },
  rogue: { f0: 128, formant: 880, lowF: 760, air: 0.5, rasp: 0.3, rate: 1.05 },
  mystic: { f0: 178, formant: 1050, lowF: 860, air: 0.9, rasp: 0, rate: 0.95 },
  survivor: { f0: 285, formant: 1550, lowF: 1250, air: 0.55, rasp: 0.02, rate: 1.2 },
  none: { f0: 150, formant: 1000, lowF: 780, air: 0.55, rasp: 0.15, rate: 1 }, // no investigator: an old server, a test
};
export const voiceFor = inv => VOICES[inv] || VOICES.none;

const clamp = (v, a, b) =>(v < a ? a : v > b ? b : v);
function hash1(i) { let x = Math.imul((i | 0) ^ 0x5bd1e995, 0x27d4eb2d); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
// a smooth value noise (never periodic): -1..1
export function wob(t, seed = 0) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), s = Math.imul(seed | 0, 7919); const a = hash1(i + s), b = hash1(i + 1 + s); return (a + (b - a) * u) * 2 - 1; }

// how unsteady you are: nothing with breath to spare, a little at half, staggering when it is gone
export function unsteady(breath, runLong = 0, winded = false) {
  let u = Math.max((0.72 - breath) / 0.66, runLong * 0.55);
  u = clamp(u, 0, 1);
  return winded ? Math.max(u, 0.9) : u;
}

// the eye's bob (two dips a stride), its sideways sway (one a stride) and roll, for unsteadiness u: steady, a regular bob; unsteady,
// each step a different depth and a little late or early, the head rolling and swaying, wandering a little more the worse it is
export function gaitAt(u, bob, step, t, seed, out) {
  const depth = 1 + 1.25 * u * wob(step * 1.3, seed + 1);         // each footfall its own depth when unsteady
  const late = 0.75 * u * wob(step * 0.9, seed + 2);               // and its own timing
  out.y = Math.sin(bob * 2 + late) * 0.025 * (1 + 0.8 * u) * depth;
  out.x = u * (0.055 * Math.sin(bob + 0.4 * late) + 0.05 * wob(t * 0.55, seed + 3));
  out.roll = u * (0.04 * Math.sin(bob + 0.6) + 0.035 * wob(t * 0.8, seed + 4));
  return out;
}

// the breathing: calm and slow with breath to spare, quicker and louder as it drains, ragged gasps when winded, slowing as it
// refills. period: seconds to the next breath. peak: its loudness (kept under the ghoul's pant and claws, 0.06-0.12 at the
// source). ragged 0..1: a catch in the breath (a gasp in, a short hard out). ex 0..1: how hard you're breathing (the vapour)
export function breathPlan(breath, winded, runRecent = 0, out = {}) {
  const e = clamp((1 - breath) * 1.15 + runRecent * 0.25, 0, 1);
  out.ex = winded ? 1 : e;
  out.period = winded ? 0.95 : 4.2 - 2.75 * e;
  out.peak = winded ? 0.055 : 0.009 + 0.034 * e;
  out.ragged = winded ? 1 : e > 0.7 ? (e - 0.7) / 0.3 * 0.6 : 0;
  return out;
}
