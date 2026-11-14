// Which real clips Dax, Nala and Molly use, and what each mood plays (dog-voice.js reads this). Picks come from
// /dog-audition.html. Every id is a clip in dog-clips.js (public/audio/dogs/<id>.mp3). The game only loads the clips named here.

// The clips per dog and kind. A kind with no clips (or none that loaded) is quiet. There's no synthesised voice.
export const DOG_VOICE_MAP = {
  dax: {
    bark: ['dax-bark-06', 'dax-bark-07', 'dax-bark-08'],
    volley: ['dax-volley-02', 'dax-volley-03'],
    whine: ['dax-whine-05'],
    yip: ['dax-yip-01'],
    woof: ['dax-woof-02'],
    pant: ['dog-pant-01'],
    sniff: ['dog-sniff-01'],
  },
  nala: {
    bark: ['nala-bark-04', 'nala-bark-10'],
    growl: ['nala-growl-04', 'nala-growl-07'],
    whimper: ['nala-whimper-02', 'nala-whimper-03'],
    calm: ['nala-grumble-01', 'nala-huff-01'],
    yip: ['nala-yip-02'],
    pant: ['dog-pant-01'],
    sniff: ['dog-sniff-01'],
  },
  // Molly, Joyce's older dog, has no clips of her own. She borrows the softest ones and her plans play them lower and slower
  // (rate 0.8-0.86). Same recordings, so the credits in docs/audio-credits.md cover her.
  molly: {
    bark: ['nala-bark-04', 'dax-woof-02'],
    woof: ['dax-woof-02'],
    calm: ['nala-grumble-01', 'nala-huff-01'],
    growl: ['nala-growl-04'],
    whimper: ['nala-whimper-02'],
    pant: ['dog-pant-01'],
    sniff: ['dog-sniff-01'],
  },
};

// What each mood plays, per dog: a list of steps, each { kind, n: [min, max] clips, rate (pitch and tempo together, 1 = as
// recorded), gap (s, onset to onset, before the Bark speed slider), gain, len (s, cuts a long clip short), chance (0-1) }.
// Mood-wide: bright (dB of treble tilt), growl (the throaty layer), sharp (pick from the brighter half of the barks),
// volley (the chance an excited call opens with a volley clip).
export const MOOD_PLAN = {
  dax: {
    excited: { bright: 2, volley: 0.3, steps: [{ kind: 'bark', n: [3, 5], rate: 1.12, gap: 0.24, gain: 1 }] },
    happy: { bright: 0, steps: [{ kind: 'bark', n: [1, 2], rate: 1.0, gap: 0.3, gain: 0.95 }, { kind: 'pant', n: [1, 1], rate: 1.12, len: 0.6, gain: 0.5 }] },
    alert: { bright: 1, sharp: true, steps: [{ kind: 'bark', n: [2, 3], rate: 0.9, gap: 0.36, gain: 1 }] },
    sad: { bright: -1, steps: [{ kind: 'whine', n: [1, 1], rate: 1.0, gain: 0.55 }] },
    calm: { bright: -2, steps: [{ kind: 'woof', n: [1, 1], rate: 0.94, gain: 0.6 }] },
  },
  nala: {
    excited: { bright: 1, steps: [{ kind: 'bark', n: [3, 4], rate: 1.12, gap: 0.34, gain: 1 }] },
    happy: { bright: 0, steps: [{ kind: 'bark', n: [1, 2], rate: 1.0, gap: 0.45, gain: 0.95 }, { kind: 'pant', n: [1, 1], rate: 1.0, len: 0.7, gain: 0.5 }] },
    alert: { bright: 0, growl: 0.2, steps: [{ kind: 'growl', n: [1, 1], rate: 0.95, len: 0.75, gain: 0.5 }, { kind: 'bark', n: [2, 3], rate: 0.9, gap: 0.5, gain: 0.8 }] },
    sad: { bright: -1, steps: [{ kind: 'whimper', n: [1, 2], rate: 1.0, gap: 0.6, gain: 0.7 }] },
    calm: { bright: -2, steps: [{ kind: 'calm', n: [1, 1], rate: 0.94, gain: 0.5 }] },
  },
  molly: {   // low, slow, soft: one woof where Nala would bark three times
    excited: { bright: -1, steps: [{ kind: 'bark', n: [1, 2], rate: 0.86, gap: 0.6, gain: 0.85 }] },
    happy: { bright: -1.5, steps: [{ kind: 'woof', n: [1, 1], rate: 0.84, gain: 0.8 }, { kind: 'pant', n: [1, 1], rate: 0.84, len: 0.6, gain: 0.4 }] },
    alert: { bright: -1, growl: 0.25, steps: [{ kind: 'growl', n: [1, 1], rate: 0.8, len: 0.8, gain: 0.55 }, { kind: 'bark', n: [1, 1], rate: 0.8, gain: 0.8 }] },
    sad: { bright: -2, steps: [{ kind: 'whimper', n: [1, 1], rate: 0.84, gain: 0.5 }] },
    calm: { bright: -2.5, steps: [{ kind: 'calm', n: [1, 1], rate: 0.8, gain: 0.5 }] },
  },
};
