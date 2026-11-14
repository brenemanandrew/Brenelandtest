// The songs: our own, written for Breneland in an Animal Crossing spirit (gentle, bouncy, jazzy 7th and 9th chords, walking or
// plucky bass, soft instruments, little melodies, A and B sections that come back changed). music-band.js plays them, music.js
// chooses one by where you are and the time of day. No imports. They play on recorded instruments (music-sampler.js) as mostly
// incidental lo-fi: fewer at once, slower and laid back, the tune resting for whole sections (`air`), the accompaniment thinned
// (`thin`: the share of its notes left out), and a lo-fi stage per song (`lofi`, music-band.js LOFI): warm and lightly worn
// everywhere, most of all fishing (Line Out) and Kevin's boat.
//
// A song: bpm, swing (how late the off-beat eighth: 0 straight, 0.33 a full triplet), meter (beats a bar), the instrument of each
// role (lead, counter, keys, arp, bass, pad, drops, roll, chop, strum) and the patterns they play (music-band.js COMP, ARP, KIT and
// the bass patterns), sections (chords a bar at a time; melody lines in eighth notes, '|' at every bar line) and a form. A form entry
// can change the lead, add a counter-line ('+12' doubles the melody an octave up), lift the key, drop or add a part. Interior,
// fishing and boat songs loop (each time round a little different: loopVary); the walking songs play through once and end.
// `db` levels each song to the same loudness (measured: tools/music-ac-test.mjs and audio-levels group music).

// the time of day, for the walking songs (AC's spirit: brighter mornings, mellower evenings, sparse late at night)
export const WALK_VARS = {
  morning: { lp: 12000 },
  day: {},
  golden: { lp: 6500, bpm: 0.97 },
  evening: { lp: 4200, bpm: 0.94, mix: { drums: 0.5 }, db: -1, thin: { keys: 0.2, arp: 0.3 } },
  late: { lp: 3000, bpm: 0.9, drop: ['drums', 'keys'], db: -2, thin: { arp: 0.4 } },
};

const morningYard = {
  id: 'morning-yard', title: 'Morning Yard', place: 'walk', home: { slots: ['morning', 'day'], areas: ['yard', 'town'] },
  mood: 'Sunny and bouncy: dew on the lawn, the first coffee on the porch', key: 'F major', bpm: 96, swing: 0.16, db: 4.7, verb: 0.24,
  inst: { lead: 'marimba', counter: 'glock', keys: 'piano', arp: 'kalimba', bass: 'bass', pad: 'strings' },
  parts: { keys: 'charleston', bass: 'two', drums: 'pop' },
  mix: { lead: 1, counter: 0.4, keys: 0.5, arp: 0.45, bass: 0.75, pad: 0.45, drums: 0.5 },
  trim: { keys: 3.6, arp: 10.1, bass: -1, drums: 1.9 },
  thin: { keys: 0.2, drums: 0.3, arp: 0.3 },
  sections: {
    intro: { chords: 'Fmaj7 | Gm7 C9', parts: { keys: null, bass: null, arp: 'arp8', drums: 'shaker' } },
    A: {
      chords: 'Fmaj9 | Dm9 | Gm9 | C9 | Am7 | D9 | Gm7 C9 | F69',
      lead: 'c5/1 a4 c5 f5/2 e5/1 c5/2 | d5/2 f5/1 e5 d5/2 a4 | bb4/1 d5 g5/2 f5/1 d5 bb4/2 | c5/2 e5/1 g5 bb4/2 r | a4/1 c5 e5/2 g5 e5 | f#5/2 e5/1 d5 c5/2 a4 | g4/1 bb4 d5/2 e5/1 d5 c5 bb4 | a4/4 r/2 a4/1 bb4',
    },
    A2: {
      chords: 'Fmaj9 | Dm9 | Gm9 | C9 | Am7 | D9 | Gm7 C9 | Fmaj7',
      lead: 'c5/1 a4 c5 f5/2 e5/1 c5/2 | d5/2 f5/1 e5 d5/2 a4 | bb4/1 d5 g5/2 f5/1 d5 bb4/2 | c5/2 e5/1 g5 bb4/2 r | a4/1 c5 e5/2 g5 e5 | f#5/2 e5/1 d5 c5/2 a4 | bb4/1 a4 g4/2 e5 c5 | f5/4 r',
      parts: { keys: 'bounce', bass: 'walk' },
    },
    B: {
      chords: 'Bbmaj7 | Bbm6 | Am7 | D9 | Gm7 | C9 | Am7 D7 | Gm7 C7',
      lead: 'd5/3 f5/1 a5/4 | g5/2 f5 db5/4 | c5/3 e5/1 g5/2 e5 | f#5/4 e5/2 d5 | d5/3 g5/1 f5/2 d5 | e5/4 d5/2 c5 | c5/2 e5 d5 f#5 | g5/2 f5 e5 r',
      inst: { lead: 'ocarina' }, parts: { keys: 'hold', drums: 'brush' },
    },
    C: {
      chords: 'Dm9 | Bbmaj7 | Gm7 | A7 | Dm9 | Bbmaj7 | Gm7 | C7sus4 C7',
      lead: 'a5/1 f5 e5 d5 a4/2 r | f5/1 d5 c5 bb4 f4/2 r | g5/1 f5 d5 bb4 g4/2 a4/1 bb4 | c#5/2 e5 g5 a5 | d5/1 e5 f5 a5 c6/2 a5 | bb5/2 a5 f5 d5 | f5/2 d5 bb4 g4 | f5/4 e5',
      inst: { lead: 'kalimba', arp: 'musicbox' }, parts: { keys: null, pad: 'hold', arp: 'slow', bass: 'root', drums: 'sparse' },
    },
    outro: { chords: 'Bbmaj7 Bbm6 | Fmaj9', lead: 'a5/2 f5 db5 bb4 | c5/1 a4 f5/6', parts: { keys: 'hold', bass: 'root', drums: null }, bpm: 0.9 },
  },
  form: ['intro', 'A', { s: 'A2', air: true, parts: { arp: 'slow' }, label: 'A2 (the band alone)' }, 'B', { s: 'A', inst: { lead: 'vibes' }, parts: { keys: 'bounce' }, label: 'A (vibes)' },
    { s: 'C', air: true, label: 'C (the kalimba alone)' }, { s: 'B', inst: { lead: 'flute' }, label: 'B (flute)' }, 'outro'],
};

const townStroll = {
  id: 'town-stroll', title: 'Town Stroll', place: 'walk', home: { slots: ['day', 'morning'], areas: ['town', 'yard'] },
  mood: 'An easy afternoon walk past the houses and the shops: a walking bass, brushes, a vibraphone tune', key: 'Bb major', bpm: 108, swing: 0.22, db: 6.2, verb: 0.22,
  inst: { lead: 'vibes', counter: 'clarinet', keys: 'piano', bass: 'bass' },
  parts: { keys: 'twofour', bass: 'walk', drums: 'swing' },
  mix: { lead: 0.95, counter: 0.4, keys: 0.5, bass: 0.8, drums: 0.5 },
  trim: { keys: 1.3, bass: -5.3, drums: 3.5 },
  thin: { keys: 0.15, drums: 0.25 },
  sections: {
    intro: { chords: 'Cm7 | F7' },
    A: {
      chords: 'Bbmaj7 | G7 | Cm7 | F7 | Dm7 | G7b9 | Cm7 F7 | Bb6',
      lead: 'f5/1 d5 bb4 c5 d5/2 f5 | g5/2 f5/1 d5 b4/2 d5 | eb5/1 g5 bb5/2 g5/1 eb5 c5/2 | a4/2 c5/1 eb5 f5/2 r | d5/1 f5 a5/2 g5/1 f5 d5/2 | ab5/2 g5/1 f5 d5/2 b4 | c5/1 eb5 g5/2 a5/1 g5 f5 eb5 | d5/4 r',
    },
    B: {
      chords: 'Ebmaj7 | Ebm6 | Dm7 | G7 | Cm7 | F7 | Dm7 G7 | Cm7 F7',
      lead: 'g5/3 bb5/1 d6/2 bb5 | c6/2 bb5 gb5/4 | f5/3 a5/1 c6/2 a5 | b5/4 a5/2 g5 | g5/3 c6/1 bb5/2 g5 | a5/4 g5/2 f5 | f5/2 d5 b4 d5 | eb5/2 c5 a4 c5',
      inst: { lead: 'clarinet' }, parts: { keys: 'charleston' },
    },
    C: {
      chords: 'Cmaj7 | A7 | Dm7 | G7 | Em7 | A7 | Dm7 G7 | Cm7 F7',
      lead: 'e5/1 g5 b5/2 g5/1 e5 c5/2 | c#5/2 e5/1 g5 a5/2 g5 | f5/1 a5 c6/2 a5/1 f5 d5/2 | b4/2 d5/1 f5 g5/2 r | g5/1 b5 d6/2 b5/1 g5 e5/2 | c#6/2 b5/1 a5 g5/2 e5 | d5/1 f5 a5/2 g5/1 f5 d5 b4 | c5/2 eb5 f5 eb5',
      inst: { lead: 'marimba' }, parts: { keys: 'stabs' },
    },
    outro: { chords: 'Cm7 F7 | Bbmaj9', lead: 'c5/2 eb5 a4 c5 | bb4/1 d5 f5/6', parts: { keys: 'hold', bass: 'root', drums: null }, bpm: 0.92 },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the band alone)' }, 'C', { s: 'B', inst: { lead: 'vibes' }, label: 'B (vibes)' },
    { s: 'A', inst: { counter: 'clarinet' }, counter: '-12', label: 'A (clarinet below)' }, 'outro'],
};

const lakeshore = {
  id: 'lakeshore', title: 'Lakeshore at Golden Hour', place: 'walk', home: { slots: ['golden', 'day'], areas: ['lake'] },
  mood: 'Warm light on Lake Tamakiya: a flute over a rippling kalimba, water drops, a lift into a new key', key: 'D major (lifts to E)', bpm: 80, swing: 0, db: 7.6, verb: 0.3,
  inst: { lead: 'flute', counter: 'flute', keys: 'piano', arp: 'nylon', bass: 'bass', pad: 'strings', drops: 'musicbox' },
  parts: { arp: 'arp8', pad: 'hold', bass: 'two', drums: 'water', drops: true },
  mix: { lead: 0.9, counter: 0.45, arp: 0.5, pad: 0.4, bass: 0.7, drums: 0.45, drops: 0.5, keys: 0.4 },
  trim: { keys: 7.9, arp: 3.4, bass: -2.3, pad: -6.9, drums: 17.5, drops: 7.9 },
  thin: { arp: 0.3, drops: 0.3 }, lofi: { lp: 7500 },
  sections: {
    intro: { chords: 'Dmaj7 | Dmaj7#11', parts: { bass: null, drums: null } },
    A: {
      chords: 'Dmaj7 | Dmaj7#11 | Bm7 | Gmaj7 | Em7 | A7sus4 A7 | Dmaj7 | Gmaj7 A7',
      lead: 'f#5/3 a5/1 c#6/4 | b5/2 g#5 e5/4 | d5/3 f#5/1 a5/2 f#5 | b5/4 a5/2 f#5 | g5/3 b5/1 d6/2 b5 | d6/4 c#6 | a5/2 f#5 e5 d5 | b4/4 c#5/2 e5',
    },
    B: {
      chords: 'Gmaj7 | F#m7 | Em9 | Bm7 | Gmaj7 | Gm6 | F#m7 B7 | Em7 A7',
      lead: 'd5/2 f#5 b5/3 a5/1 | a5/4 e5/2 c#5 | f#5/3 g5/1 b5/4 | a5/2 f#5 d5/4 | b4/2 d5 f#5 a5 | bb5/4 g5/2 e5 | a5/2 f#5 d#5 f#5 | g5/2 e5 c#5 e5',
      inst: { lead: 'vibes' }, parts: { keys: 'hold', arp: 'slow' },
    },
    lift: { chords: 'B7sus4', parts: { drums: null } },
    outro: { chords: 'Dmaj7 | Gmaj7 | Dmaj9', lead: 'f#5/2 e5 d5/4 | b4/2 d5 f#5/4 | e5/4 d5', parts: { drums: null, bass: 'root' }, bpm: 0.92 },
  },
  form: ['intro', 'A', { s: 'B', air: true, inst: { arp: 'harp' }, parts: { arp: 'slow' }, label: 'B (the harp alone)' }, { s: 'A', inst: { lead: 'vibes' }, label: 'A (vibes)' },
    { s: 'B', inst: { lead: 'harp' }, label: 'B (harp)' }, 'lift', { s: 'A', transpose: 2, label: 'A (up a step)' }, { s: 'outro', transpose: 2 }],
};

const woodsPath = {
  id: 'woods-path', title: 'Woods Path', place: 'walk', home: { slots: ['morning', 'day', 'golden'], areas: ['woods'] },
  mood: 'Dappled and curious under the trees of Strickler woods: a kalimba, pizzicato, woodblocks, a little Dorian mystery', key: 'D Dorian', bpm: 90, swing: 0.12, db: 5.5, verb: 0.28,
  inst: { lead: 'kalimba', counter: 'kalimba', keys: 'nylon', arp: 'kalimba', bass: 'bass', pad: 'strings' },
  parts: { keys: 'bounce', bass: 'two', drums: 'woods' },
  mix: { lead: 1, counter: 0.45, keys: 0.5, arp: 0.4, bass: 0.8, pad: 0.4, drums: 0.5 },
  trim: { keys: 5.5, arp: 11.7, bass: -0.9, pad: -4.9, drums: 8.4 },
  thin: { keys: 0.25, drums: 0.3, arp: 0.3 },
  sections: {
    intro: { chords: 'Dm9 | G13', parts: { keys: null, arp: 'up8' } },
    A: {
      chords: 'Dm9 | G13 | Dm9 | G13 | Bbmaj7 | C7 | Am7 | A7',
      lead: 'd5/1 f5 a5 f5 e5 d5 c5/2 | b4/1 d5 e5 f5 e5/2 d5 | a5/1 f5 d5 f5 a5/2 c6 | b5/2 a5/1 g5 e5/2 r | f5/1 d5 bb4 d5 f5/2 a5 | g5/2 e5/1 c5 bb4/2 c5 | e5/1 c5 a4 c5 e5/2 g5 | c#5/2 e5/1 a5 g5/2 r',
    },
    B: {
      chords: 'Fmaj7 | Em7 A7 | Dm7 | Dm7 | Bbmaj7 | Gm7 | Em7b5 | A7',
      lead: 'c6/3 a5/1 e5/4 | g5/2 e5 c#5 e5 | f5/4 a5/2 d6 | c6/4 a5 | d6/3 bb5/1 f5/4 | g5/2 bb5 d6 f5 | e5/2 g5 bb5/4 | a5/4 g5/2 e5',
      inst: { lead: 'clarinet' }, parts: { keys: null, pad: 'hold', drums: 'shaker' },
    },
    C: {
      chords: 'Bbmaj7 | C | Am7 | Dm7 | Gm7 | C7 | Fmaj7 | A7',
      lead: 'd5/1 f5 a5/2 bb5 a5 | g5/2 e5 c5 e5 | a5/1 g5 e5/2 c5/4 | d5/1 f5 a5/2 c6/4 | bb5/2 a5/1 g5 d5/4 | e5/2 g5 bb5/4 | a5/2 f5 c5 e5 | c#5/2 e5 g5 a5',
      inst: { lead: 'marimba' }, parts: { keys: 'charleston' },
    },
    outro: { chords: 'Dm9 | Dm9', lead: 'a5/1 f5 d5 a4 d5/4 | r/8', parts: { keys: 'hold', drums: null }, bpm: 0.92 },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the guitar alone)' }, { s: 'C', inst: { lead: 'marimba' }, label: 'C (marimba)' },
    { s: 'B', inst: { lead: 'ocarina' }, label: 'B (ocarina)' }, 'outro'],
};

const porchLight = {
  id: 'porch-light', title: 'Porch Light', place: 'walk', home: { slots: ['evening', 'golden', 'late'], areas: ['yard', 'town', 'lake', 'woods'] },
  mood: 'Mellow evening on the porch, the lamp on and the crickets out: felt piano, vibes, a slow swing', key: 'Db major', bpm: 72, swing: 0.25, db: 12.7, verb: 0.3,
  inst: { lead: 'piano', counter: 'vibes', keys: 'nylon', bass: 'bass', pad: 'strings' },
  parts: { keys: 'charleston', bass: 'two', drums: 'lounge' },
  mix: { lead: 0.9, counter: 0.4, keys: 0.5, bass: 0.75, drums: 0.4, pad: 0.4 },
  trim: { keys: 1.2, bass: -5.4, pad: 18.5, drums: 5.4 },
  thin: { keys: 0.2, drums: 0.3 }, lofi: { sat: 0.5, lp: 7000, lag: 0.012 },
  sections: {
    intro: { chords: 'Dbmaj7 | Ab7sus4', parts: { keys: 'hold', drums: null } },
    A: {
      chords: 'Dbmaj7 | Bbm7 | Ebm7 | Ab7 | Fm7 | Bb7 | Ebm7 Ab7 | Dbmaj7 Ab7',
      lead: 'f5/3 ab5/1 c6/2 ab5 | db6/2 bb5 f5/4 | gb5/3 bb5/1 db6/2 bb5 | c6/3 bb5/1 ab5/2 gb5 | f5/2 ab5/1 c6 eb6/2 c6 | d6/4 c6/2 ab5 | gb5/2 eb5 c5 eb5 | db5/4 r/2 eb5/1 f5',
    },
    B: {
      chords: 'Gbmaj7 | Gbm6 | Fm7 | Bb7 | Ebm7 | Ab7 | Fm7 Bb7 | Ebm7 Ab7',
      lead: 'bb4/3 db5/1 f5/4 | eb5/2 db5 a4/4 | ab4/3 c5/1 eb5/2 c5 | d5/4 c5/2 ab4 | gb4/2 bb4 db5 f5 | eb5/4 c5/2 ab4 | ab4/2 c5 d5 f5 | gb5/2 f5 eb5 c5',
      inst: { lead: 'vibes' }, parts: { keys: 'hold', bass: 'walk' },
    },
    outro: { chords: 'Ebm7 Ab7 | Dbmaj9', lead: 'gb5/2 eb5 c5 eb5 | f5/8', parts: { keys: 'hold', drums: null, bass: 'root' }, bpm: 0.9 },
  },
  form: ['intro', 'A', { s: 'B', air: true, label: 'B (the guitar alone)' }, { s: 'A', inst: { lead: 'vibes' }, label: 'A (vibes)' }, { s: 'B', inst: { lead: 'clarinet' }, vol: 0.9, label: 'B (clarinet)' },
    { s: 'A', air: true, label: 'A (the band alone)' }, 'outro'],
};

const starlight = {
  id: 'starlight', title: 'Starlight', place: 'walk', home: { slots: ['late'], areas: ['yard', 'town', 'lake', 'woods'] },
  mood: 'Late at night: a music box, a soft pad and long rests under the stars (sparse, so the owl and the crickets have the yard)', key: 'A major', bpm: 60, swing: 0, db: 15.1, verb: 0.36,
  inst: { lead: 'musicbox', keys: 'piano', pad: 'strings', bass: 'bass', arp: 'harp' },
  parts: { pad: 'hold', bass: 'root' },
  mix: { lead: 0.85, pad: 0.45, bass: 0.5, arp: 0.35 },
  trim: { arp: 11.1, bass: -3, pad: -12.6 },
  thin: { arp: 0.3 }, lofi: { lp: 6000 },
  sections: {
    intro: { chords: 'Amaj7 | Dmaj7', parts: { bass: null } },
    A: {
      chords: 'Amaj7 | F#m7 | Dmaj7 | E7sus4 | Amaj7 | C#m7 | Dmaj7 | E7',
      lead: 'e5/2 c#5 g#5/4 | a5/4 r | f#5/2 a5 c#6/4 | b5/4 r | c#6/2 b5 a5/4 | g#5/4 e5 | f#5/2 e5 d5/4 | d5/4 r',
    },
    B: {
      chords: 'Dmaj7 | Dm6 | C#m7 | F#m7 | Bm7 | E7sus4 | Amaj7 | E7sus4',
      lead: 'a5/4 f#5 | f5/4 b4 | e5/4 g#5 | a5/6 r/2 | f#5/2 d5 b4/4 | a4/4 b4 | c#5/8 | r/8',
      inst: { lead: 'celesta' }, parts: { arp: 'slow' },
    },
    outro: { chords: 'Dmaj7 | Amaj9', lead: 'f#5/4 e5 | c#5/8', parts: { bass: null }, bpm: 0.9 },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, parts: { arp: 'slow' }, label: 'A (the harp alone)' }, { s: 'A', inst: { lead: 'celesta' }, label: 'A (celesta)' }, 'outro'],
};

const parlourWaltz = {
  id: 'parlour-waltz', title: 'Parlour Waltz', place: 'lovecraft', loop: true, loopTo: 1,
  mood: 'Inside the Lovecraft house: a celesta waltz with a clock ticking, cosy with a minor-key secret (a chromatic line, a flat-two chord); never scary. Storm days: lower, darker, slower', key: 'D minor', meter: 3, bpm: 88, swing: 0, db: 8.1, verb: 0.34,
  inst: { lead: 'celesta', keys: 'piano', bass: 'bass', pad: 'cello' },
  parts: { keys: 'waltz', bass: 'waltz', drums: 'clock' },
  mix: { lead: 0.9, keys: 0.45, bass: 0.75, drums: 0.4, pad: 0.45 },
  trim: { keys: 5.8, bass: -1.6, pad: -6.7, drums: 13.6 },
  thin: { keys: 0.15, drums: 0.2 },
  sections: {
    intro: { chords: 'Dm | A7' },
    A: {
      chords: 'Dm | Dm | Bbmaj7 | A7 | Dm | Gm6 | A7sus4 | A7 | Dm | Dmmaj7 | Dm7 | Dm6 | Bbmaj7 | Em7b5 | A7 | Dm',
      lead: 'a5/4 f5/2 | e5/2 f5 a5 | d6/4 a5/2 | c#6/4 e5/2 | f5/2 e5 d5 | bb5/4 g5/2 | d5/4 e5/2 | c#5/6 | a5/4 f5/2 | c#6/4 a5/2 | c6/4 a5/2 | b5/4 f5/2 | bb5/2 a5 f5 | g5/4 bb5/2 | a5/2 g5 c#5 | d5/6',
    },
    B: {
      chords: 'Fmaj7 | C7 | Fmaj7 | Bbmaj7 | Ebmaj7 | A7 | Dm | A7',
      lead: 'c6/2 a5 f5 | g5/4 bb5/2 | a5/2 c6 e6 | d6/4 bb5/2 | g5/2 bb5 d6 | c#6/4 a5/2 | d6/2 a5 f5 | e5/2 g5 c#6',
      inst: { lead: 'musicbox' }, parts: { pad: 'hold' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the piano and the clock)' }, { s: 'B', inst: { lead: 'celesta' }, label: 'B (celesta)' }],
  loopVary: [{ inst: { lead: 'musicbox' } }, {}],
  vars: { storm: { lp: 2400, bpm: 0.93, oct: { lead: -1 }, parts: { pad: 'hold' }, db: -1, mix: { drums: 0.4, keys: 0.35 } } },
};

const lamplightStudy = {
  id: 'lamplight-study', title: 'Study by Lamplight', place: 'lovecraft', loop: true, loopTo: 1,
  mood: 'The study upstairs: slow celesta and vibes over soft strings, an E minor with a Lydian flat-two that hints at something in the stars', key: 'E minor', bpm: 70, swing: 0, db: 9.4, verb: 0.36,
  inst: { lead: 'celesta', counter: 'celesta', keys: 'piano', pad: 'strings', bass: 'bass', arp: 'harp' },
  parts: { pad: 'hold', bass: 'root', keys: 'sparse' },
  mix: { lead: 0.9, counter: 0.4, keys: 0.4, pad: 0.45, bass: 0.6, arp: 0.35 },
  trim: { keys: 6.4, arp: 9.5, bass: -1.7, pad: -10.9 },
  thin: { arp: 0.25 },
  sections: {
    intro: { chords: 'Em9 | Cmaj7', parts: { keys: null } },
    A: {
      chords: 'Em9 | Cmaj7 | Am9 | B7sus4 B7 | Em9 | Fmaj7#11 | Cmaj7 | B7',
      lead: 'b5/3 g5/1 f#5/4 | e5/4 g5/2 b5 | c6/3 b5/1 g5/4 | e5/4 d#5 | g5/2 b5 d6/4 | e6/3 c6/1 b5/4 | g5/4 e5 | f#5/2 a5 d#5/4',
    },
    B: {
      chords: 'Am7 | D9 | Gmaj7 | Cmaj7 | F#m7b5 | B7b9 | Em9 | Em9',
      lead: 'c5/3 e5/1 g5/4 | f#5/4 e5 | d5/3 g5/1 b5/4 | e5/4 b4 | a4/3 c5/1 e5/4 | d#5/4 c5 | b4/3 e5/1 f#5/4 | g5/8',
      inst: { lead: 'vibes' }, parts: { arp: 'slow' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the strings alone)' }, { s: 'B', inst: { lead: 'cello' }, oct: { lead: -1 }, label: 'B (cello)' }],
  loopVary: [{ inst: { lead: 'musicbox' } }, {}],
  vars: { storm: { lp: 2200, bpm: 0.92, inst: { pad: 'cello' }, db: -1, mix: { keys: 0.3 } } },
};

const counterTalk = {
  id: 'counter-talk', title: 'Counter Talk', place: 'store', loop: true, loopTo: 1,
  mood: 'The game store: a warm bossa on a nylon guitar, vibes on the tune, a clarinet answering, a marimba break with a glockenspiel twinkling over it', key: 'G major', bpm: 112, swing: 0, db: 8.6, verb: 0.22,
  inst: { lead: 'vibes', counter: 'clarinet', keys: 'nylon', bass: 'bass', arp: 'glock' },
  parts: { keys: 'bossa', bass: 'bossa', drums: 'bossa' },
  mix: { lead: 0.9, counter: 0.35, keys: 0.6, bass: 0.75, drums: 0.45, arp: 0.25 },
  trim: { keys: -1.8, arp: 11.2, bass: -4.4, drums: -4.1 },
  thin: { drums: 0.25, keys: 0.1 }, lofi: { sat: 0.2, wow: 0.001, lp: 10000 },
  sections: {
    intro: { chords: 'Gmaj7 | A9' },
    A: {
      chords: 'Gmaj7 | A9 | Am7 | Ab7 | Gmaj7 | E7 | Am7 D7 | Gmaj7 D7',
      lead: 'd5/3 b4 f#5/2 | e5/3 c#5 b4/2 | c5/3 a4/1 e5/2 g5 | gb5/3 eb5/1 c5/4 | b4/2 d5 f#5 a5 | g#5/3 f#5/1 e5/2 d5 | c5/2 e5 f#5 a5 | g5/4 r/2 a4/1 c5',
    },
    B: {
      chords: 'Cmaj7 | Cm6 | Bm7 | E7 | Am7 | D7 | Bm7 E7 | Am7 D7',
      lead: 'e5/1 g5 b5/2 c6 b5 | a5/2 g5 eb5/4 | d5/1 f#5 a5/2 b5 a5 | g#5/4 e5/2 d5 | c5/1 e5 g5/2 a5 g5 | f#5/4 c5/2 a4 | d5/2 f#5 g#5 b5 | c6/2 a5 f#5 d5',
      inst: { lead: 'flute' },
    },
    C: {
      chords: 'Em7 | A7 | Dmaj7 | G7 | Cmaj7 | F#m7b5 | Bm7 E7 | Am7 D7',
      lead: 'g5/2 b5 e6/4 | c#6/2 a5 g5/4 | f#5/2 a5 c#6/4 | b5/2 g5 f5/4 | e5/2 g5 b5/4 | c6/2 a5 e5/4 | d5/2 f#5 g#5 e5 | c5/2 e5 a5 f#5',
      inst: { lead: 'marimba' }, parts: { arp: 'arp16' }, thin: { arp: 0.45 }, label: 'C (marimba break)',
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the guitar alone)' }, 'C', { s: 'B', inst: { lead: 'vibes', counter: 'clarinet' }, counter: '-12', label: 'B (vibes, clarinet below)' }, 'A'],
  loopVary: [{ inst: { lead: 'marimba' } }, {}],
};

const highScore = {
  id: 'high-score', title: 'High Score', place: 'store', loop: true, loopTo: 1,
  mood: 'Playful shop tune with a grin: a marimba lead, a glockenspiel on top, piano off-beats, a walking bass, a shaker and claves', key: 'C major', bpm: 120, swing: 0.15, db: 7.8, verb: 0.2,
  inst: { lead: 'marimba', counter: 'glock', keys: 'piano', bass: 'bass', arp: 'glock' },
  parts: { keys: 'offbeat', bass: 'walk', drums: 'pop' },
  mix: { lead: 0.85, counter: 0.3, keys: 0.45, bass: 0.7, drums: 0.45, arp: 0.22 },
  trim: { counter: 6.7, keys: 1.6, arp: 12, bass: -5.5, drums: -2.2 },
  thin: { keys: 0.2, drums: 0.25, arp: 0.4 }, lofi: { sat: 0.2, wow: 0.001, lp: 10000 },
  sections: {
    intro: { chords: 'C6 | G7', parts: { arp: 'arp16' } },
    A: {
      chords: 'C6 | E7 | Am7 | C7 | Fmaj7 | Fm6 | Em7 A7 | Dm7 G7',
      lead: 'e5/1 g5 a5 g5 e5 c5 e5/2 | g#5/2 b5/1 d6 b5/2 g#5 | a5/1 c6 e6/2 c6/1 a5 e5/2 | bb5/2 g5/1 e5 c5/2 r | a5/1 c6 e6/2 c6/1 a5 f5/2 | ab5/2 f5/1 d5 c5/2 r | g5/1 e5 b4 e5 c#5 e5 g5 a5 | f5/2 d5 b4 r',
    },
    B: {
      chords: 'Fmaj7 | G7 | Em7 | Am7 | Dm7 | G7 | Cmaj7 | G7',
      lead: 'c6/3 a5/1 f5/2 e5 | d5/3 f5/1 b5/2 a5 | g5/3 e5/1 b4/2 d5 | c5/4 e5/2 g5 | f5/3 a5/1 c6/2 a5 | b5/4 a5/2 g5 | e5/2 g5 b5 c6 | d6/4 r',
      inst: { lead: 'vibes' }, parts: { keys: 'charleston', drums: 'swing' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', counter: '+12', label: 'A (marimba, glockenspiel above)' }, { s: 'B', air: true, label: 'B (the band alone)' }, 'A'],
  loopVary: [{ inst: { lead: 'kalimba' } }, {}],
};

const lineOut = {
  id: 'line-out', title: 'Line Out', place: 'fishing', loop: true, loopTo: 1,
  mood: 'Fishing, lo-fi: calm and patient, a nylon guitar and the vibes, an upright bass, brushes, a drop of music box now and then, a worn old tape; when a fish comes in the tune steps back for the catch and answers it', key: 'G major (Lydian colour)', bpm: 66, swing: 0.18, db: 15.6, verb: 0.3,
  inst: { lead: 'vibes', counter: 'vibes', keys: 'nylon', pad: 'strings', bass: 'bass', drops: 'musicbox' },
  parts: { pad: 'hold', bass: 'root', drops: true, drums: 'lofi', keys: 'half' },
  mix: { lead: 0.85, counter: 0.4, pad: 0.3, bass: 0.65, drops: 0.45, drums: 0.5, keys: 0.6 },
  trim: { keys: -0.2, bass: -6.9, pad: -12.3, drums: -6.9, drops: 2.4 },
  thin: { keys: 0.15, drums: 0.2, drops: 0.4 },
  lofi: { sat: 0.65, wow: 0.0032, flutter: 0.0008, lp: 5200, hiss: -50, crackle: -46, lag: 0.018, hum: 0.02, vel: 0.16, room: 0.26 },
  sections: {
    intro: { chords: 'Gmaj7 | Cmaj7#11', parts: { bass: 'pedal' } },
    A: {
      chords: 'Gmaj7 | Cmaj7#11 | Gmaj7 | Cmaj7#11 | Em9 | Am9 | Cmaj7 | D7sus4 D7',
      lead: 'b4/4 d5/2 f#5 | e5/4 r | d5/2 f#5 a5/4 | g5/2 f#5 e5/4 | g5/3 f#5/1 d5/4 | e5/4 c5 | b4/2 c5 e5/4 | g5/4 f#5',
    },
    B: {
      chords: 'Cmaj7 | Bm7 | Am7 | Gmaj7 | Cmaj7 | Bm7 E7 | Am7 | D7sus4',
      lead: 'e5/2 g5 b5/4 | a5/4 f#5 | g5/2 e5 c5/4 | d5/4 b4 | c5/2 e5 g5/4 | f#5/4 g#5 | a5/6 r/2 | g5/2 a5 r/4',
      inst: { lead: 'nylon' }, parts: { keys: 'sparse' },
    },
  },
  form: ['intro', 'A', { s: 'B', air: true, label: 'B (the guitar alone)' }, { s: 'A', air: true, parts: { keys: 'sparse' }, label: 'A (the bass and brushes)' }, { s: 'B', label: 'B (guitar)' }],
  loopVary: [{ inst: { lead: 'piano' } }, {}],
  // the catch: the bed dips under the catch's own sound (The Reel Winner or the arpeggio), then this answers in the key
  sting: { lines: [{ inst: 'vibes', line: 'g5/0.5 b5 d6 f#6 a6/4' }, { inst: 'glock', line: 'r/2 g6/6', vol: 0.6 }], dip: 0.3, wait: 2.3 },
};

const kevinsBoat = {
  id: 'kevins-boat', title: "Kevin's Boat", place: 'boat', loop: true, loopTo: 1,
  mood: "Out on the lake with Kevin, lo-fi bluegrass: unhurried, a banjo rolling now and then, a fiddle that comes and goes, a mandolin chopping on two and four, the guitar's boom-chick, an upright bass walking up to every change, an old tape", key: 'G major', bpm: 92, swing: 0.08, db: 8.4, verb: 0.16,
  inst: { lead: 'fiddle', counter: 'mandolin', roll: 'banjo', chop: 'mandolin', strum: 'guitar', bass: 'bass' },
  parts: { roll: true, chop: true, strum: true, bass: 'bluegrass' },
  mix: { lead: 0.75, counter: 0.45, roll: 0.5, chop: 0.4, strum: 0.6, bass: 0.8 },
  trim: { bass: -11, roll: 3.4, chop: -7.5, strum: -10 },
  thin: { roll: 0.45, chop: 0.25, strum: 0.2 },
  lofi: { sat: 0.6, wow: 0.003, flutter: 0.0007, lp: 5600, hiss: -51, crackle: -47, lag: 0.016, hum: 0.02, vel: 0.16, room: 0.2 },
  sections: {
    intro: { chords: 'G | D7', parts: { chop: null, strum: null, bass: null }, label: 'banjo kick-off' },
    A: {
      chords: 'G | C | G | D | G | C | G D | G',
      lead: 'g4/1 a4 b4 c5 d5 e5 d5 b4 | e5/1 g5 e5 d5 c5/2 e5 | d5/1 b4 g4 b4 d5/2 g5 | f#5/1 e5 d5 a4 f#4/2 a4 | b4/1 d5 g5 a5 b5/2 a5/1 g5 | e5/1 g5 c6/2 g5/1 e5 c5/2 | d5/1 b4 g4/2 a4/1 f#4 d4/2 | g4/4 r/2 d4/1 f#4',
    },
    B: {
      chords: 'C | G | D | G | C | G | D7 | G',
      lead: 'g5/1 e5 g5 c6 e6/2 c6 | d6/1 b5 g5 b5 d6/2 b5 | a5/1 f#5 d5 f#5 a5/2 d6 | b5/1 a5 g5 e5 d5/2 b4 | c5/1 e5 g5 e5 c6/2 g5 | b5/1 g5 d5 g5 b5/2 d6 | c6/1 a5 f#5 a5 d5/2 f#5 | g5/4 r',
      label: 'B (the high part)',
    },
  },
  form: ['intro', 'A', { s: 'A', air: true, label: 'A (the band rolls on)' }, 'B', { s: 'B', inst: { lead: 'mandolin' }, label: 'B (mandolin)' },
    { s: 'A', mute: ['lead'], mix: { roll: 0.9 }, thin: { roll: 0 }, label: 'banjo break' }, { s: 'A', air: true, label: 'A (guitar and bass)' }],
  loopVary: [{ inst: { lead: 'mandolin', counter: 'fiddle' } }, {}],
};

// ------------------------------------------------------------------ game night: our own, in the spirit of a fantasy tabletop
// playlist. Six for the D&D table in the game store's back room (place 'backroom'; game-night-music.js picks one by the table's
// mood: the tavern while nobody plays, then the DM's scene and the fight) and three lighter ones for a board game at one of the
// store's tables (place 'boardgame'; music.js, the games' hook). The table's songs play in layers (base, rhythm, lead) that fade
// with the fight's intensity or thin out while a check is in the air. `table` names the mood a song is for.

const hearthAndHound = {
  id: 'hearth-and-hound', title: 'The Hearth and Hound', place: 'backroom', table: 'tavern', loop: true, loopTo: 1,
  mood: 'Table talk in the tavern: a fiddle jig, a lute-like guitar strumming in six-eight, a hand drum, a flute and a mandolin taking turns; warm and unhurried, the back room\'s tune while nobody plays', key: 'D major', meter: 3, bpm: 100, swing: 0, db: 8.7, verb: 0.2,
  inst: { lead: 'fiddle', counter: 'flute', keys: 'nylon', bass: 'bass' },
  parts: { keys: 'jig', bass: 'jig', drums: 'jig' },
  mix: { lead: 0.8, counter: 0.4, keys: 0.6, bass: 0.75, drums: 0.5 },
  trim: { keys: -3.2, bass: -7, drums: 1.7 },
  thin: { keys: 0.12, drums: 0.2 }, lofi: { sat: 0.3, lp: 8000 },
  sections: {
    intro: { chords: 'D | A' },
    A: {
      chords: 'D | G | D | A | D | G | Bm A | D',
      lead: 'd5/1 f#5 a5 f#5/2 e5/1 | g5/1 b5 g5 d5/2 b4/1 | a4/1 d5 f#5 a5/2 f#5/1 | e5/1 c#5 a4 e5/3 | f#5/1 a5 d6 a5/2 f#5/1 | g5/1 b5 d6 b5/2 g5/1 | b5/1 a5 f#5 e5/1 c#5 a4 | d5/3 r/3',
    },
    B: {
      chords: 'G | A | F#m | Bm | G | A | G A | D',
      lead: 'b5/2 a5/1 g5/2 d5/1 | c#6/2 b5/1 a5/2 e5/1 | a5/1 f#5 c#5 f#5/2 a5/1 | b5/3 a5/1 f#5 d5 | d6/2 b5/1 g5/2 b5/1 | e6/2 c#6/1 a5/2 c#6/1 | b5/1 g5 d5 e5/1 f#5 g5 | f#5/3 d5/3',
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', inst: { lead: 'flute' }, label: 'A (flute)' }, { s: 'B', air: true, label: 'B (the guitar and the drum)' },
    { s: 'A', counter: '+12', label: 'A (fiddle, flute above)' }, { s: 'B', inst: { lead: 'mandolin' }, label: 'B (mandolin)' }],
  loopVary: [{ inst: { lead: 'mandolin' } }, {}],
};

const openRoad = {
  id: 'open-road', title: 'The Open Road', place: 'backroom', table: 'explore', loop: true, loopTo: 1,
  mood: 'Exploring and travelling: gentle and curious, a flute over a rippling harp, soft violas, a clarinet answering, a bright Lydian lift', key: 'G major (Lydian)', bpm: 84, swing: 0, db: 6.8, verb: 0.3,
  inst: { lead: 'flute', counter: 'clarinet', arp: 'harp', pad: 'strings', bass: 'bass' },
  parts: { arp: 'arp8', pad: 'hold', bass: 'two', drums: 'road' },
  mix: { lead: 0.85, counter: 0.4, arp: 0.5, pad: 0.4, bass: 0.7, drums: 0.4 },
  trim: { arp: 6.7, bass: -0.5, pad: -7.6, drums: 8.2 },
  thin: { arp: 0.25, drums: 0.3 },
  sections: {
    intro: { chords: 'Gmaj7 | A/G', parts: { bass: null, drums: null } },
    A: {
      chords: 'Gmaj7 | A/G | Em7 | Cmaj7 | Gmaj7 | A/G | Cmaj7 | D7sus4 D7',
      lead: 'd5/3 g5/1 b5/4 | c#6/2 b5 a5/4 | g5/3 e5/1 b4/4 | c5/2 e5 g5 b5 | d6/3 b5/1 g5/4 | e6/2 c#6 a5 e5 | g5/2 e5 c5 e5 | a5/4 f#5',
    },
    B: {
      chords: 'Em7 | Cmaj7 | Am7 | D7 | Bm7 | Em7 | Cmaj7 | D7sus4',
      lead: 'b4/2 e5 g5/4 | e5/2 g5 c6/4 | c6/3 b5/1 a5/2 e5 | f#5/4 r | d5/2 f#5 b5/4 | a5/3 g5/1 e5/4 | g5/2 e5 b4 c5 | d5/4 a4',
      inst: { lead: 'clarinet', counter: 'flute' },
    },
  },
  form: ['intro', 'A', { s: 'B', air: true, label: 'B (the harp alone)' }, { s: 'A', inst: { lead: 'clarinet' }, label: 'A (clarinet)' }, 'B',
    { s: 'A', counter: '-12', label: 'A (flute, clarinet below)' }],
  loopVary: [{ inst: { arp: 'nylon' } }, {}],
};

const deepHalls = {
  id: 'deep-halls', title: 'Deep Halls', place: 'backroom', table: 'tension', loop: true, loopTo: 1,
  mood: 'Tension in the dungeon: a low cello drone, a slow heartbeat, sparse plucks and a harp in the dark, a Phrygian step that never quite settles', key: 'D minor (Phrygian)', bpm: 60, swing: 0, db: 13.4, verb: 0.38,
  inst: { lead: 'pizz', counter: 'harp', pad: 'cello', bass: 'bass' },
  parts: { pad: 'hold', bass: 'pedal', drums: 'heart' },
  mix: { lead: 0.8, counter: 0.4, pad: 0.55, bass: 0.6, drums: 0.6 },
  trim: { bass: -6.2, pad: -6.7, drums: 2.8 },
  thin: { drums: 0.1 }, oct: { pad: -1 },
  layers: { rhythm: ['drums'], lead: ['lead', 'counter'] },
  sections: {
    intro: { chords: 'Dm | Dm' },
    A: {
      chords: 'Dm | Ebmaj7 | Dm | Ebmaj7 | Bbmaj7 | Gm6 | A7sus4 | A7',
      lead: 'd5/1 r/3 f5/1 r/3 | g5/1 r/3 eb5/2 r/2 | a5/1 r f5 r d5/4 | bb5/2 r/2 g5/4 | f5/1 r/3 d5/1 r/3 | e5/2 r/2 g5/2 r/2 | d5/2 e5 r/4 | c#5/4 r/4',
    },
    B: {
      chords: 'Gm | Gm | Dm | Dm | Bbmaj7 | Ebmaj7#11 | A7sus4 | A7',
      lead: 'bb4/4 d5/4 | g5/4 r/4 | f5/2 e5 d5/4 | a4/8 | d5/2 f5 a5/4 | g5/4 a5/4 | e5/4 d5/4 | c#5/8',
      inst: { lead: 'harp' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the drone and the heartbeat)' }, { s: 'A', inst: { lead: 'celesta' }, label: 'A (celesta)' }, { s: 'B', air: true, label: 'B (the dark alone)' }],
  loopVary: [{ inst: { lead: 'harp' } }, {}],
};

const steelAndThunder = {
  id: 'steel-and-thunder', title: 'Steel and Thunder', place: 'backroom', table: 'combat', loop: true, loopTo: 1,
  mood: 'Combat: driving cellos in eighths, war drums and a snare, a heroic fiddle line with the cellos below it; in layers, so the fight starts with the strings, the drums come in as it goes on and the tune when a hero is in trouble or a boss appears', key: 'E minor', bpm: 132, swing: 0, db: 7.6, verb: 0.2,
  inst: { lead: 'fiddle', counter: 'cello', arp: 'cello', pad: 'strings', bass: 'bass' },
  parts: { arp: 'ostinato', pad: 'hold', bass: 'drive', drums: 'battle' },
  mix: { lead: 0.85, counter: 0.5, arp: 0.6, pad: 0.4, bass: 0.6, drums: 0.7 },
  trim: { counter: 2.8, arp: 3.7, bass: -8.9, pad: -6.9, drums: -6.6 },
  thin: { drums: 0.08 }, oct: { arp: -1 },
  layers: { rhythm: ['drums'], lead: ['lead', 'counter'] },
  sections: {
    intro: { chords: 'Em | Em' },
    A: {
      chords: 'Em | Em | Cmaj7 | D | Em | Em | C D | B7',
      lead: 'e5/3 b4/1 e5/2 g5 | b5/4 a5/2 g5 | g5/3 e5/1 c5/2 e5 | f#5/4 a5 | g5/3 f#5/1 e5/2 b5 | e6/4 b5/2 g5 | c6/2 b5 a5 f#5 | d#5/4 f#5',
    },
    B: {
      chords: 'Am | D | G | Em | Cmaj7 | Am7 | B7 | B7',
      lead: 'c6/3 b5/1 a5/4 | a5/3 f#5/1 d5/4 | b5/2 d6 g5/4 | e5/8 | e6/3 d6/1 c6/2 g5 | c6/3 b5/1 a5/2 e5 | b5/2 a5 f#5 d#5 | f#5/8',
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the strings and drums)' }, { s: 'A', counter: '-12', label: 'A (fiddle, cellos below)' }, 'B'],
  loopVary: [{ inst: { lead: 'strings' } }, {}],
};

const lanternGhosts = {
  id: 'lantern-ghosts', title: 'Lantern Ghosts', place: 'backroom', table: 'spooky', loop: true, loopTo: 1,
  mood: 'Spooky and haunted (Waifs in White, the Swarm): a music-box waltz with a creeping line underneath, violas like a far-off choir, a clock ticking; eerie, never loud', key: 'A minor', meter: 3, bpm: 80, swing: 0, db: 8.6, verb: 0.4,
  inst: { lead: 'musicbox', counter: 'celesta', keys: 'harp', pad: 'strings', bass: 'bass' },
  parts: { keys: 'waltz', pad: 'hold', bass: 'waltz', drums: 'clock' },
  mix: { lead: 0.85, counter: 0.4, keys: 0.4, pad: 0.45, bass: 0.6, drums: 0.4 },
  trim: { keys: 9.6, bass: 0.8, pad: -7.4, drums: 11 },
  thin: { keys: 0.2, drums: 0.15 }, lofi: { lp: 6500, wow: 0.002 },
  sections: {
    intro: { chords: 'Am | E7', parts: { keys: null } },
    A: {
      chords: 'Am | Ammaj7 | Am7 | Am6 | Fmaj7 | Dm6 | E7 | E7',
      lead: 'e5/2 a5 c6 | b5/4 g#5/2 | g5/4 e5/2 | f#5/4 a5/2 | a5/2 c6 e6 | f5/4 d5/2 | g#5/2 b5 d6 | e5/6',
    },
    B: {
      chords: 'Fmaj7 | E7 | Am | Am | Dm | Am | Bm7b5 | E7',
      lead: 'c6/4 a5/2 | b5/4 g#5/2 | a5/2 e5 c5 | e5/6 | f5/2 a5 d6 | c6/4 b5/2 | d6/2 b5 f5 | g#5/4 e5/2',
      inst: { lead: 'celesta' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the harp and the choir)' }, { s: 'A', inst: { lead: 'celesta' }, counter: '+12', label: 'A (celesta, a music box above)' }, { s: 'B', inst: { lead: 'harp' }, label: 'B (harp)' }],
  loopVary: [{ inst: { lead: 'celesta', counter: 'musicbox' } }, {}],
};

const embersRest = {
  id: 'embers-rest', title: 'Embers and Rest', place: 'backroom', table: 'victory', loop: true, loopTo: 1,
  mood: 'Victory, then rest: a short warm fanfare on the violas and a glockenspiel, then a calm by the fire, a nylon guitar, a harp, the flute and a clarinet', key: 'F major', bpm: 76, swing: 0, db: 6.2, verb: 0.3,
  inst: { lead: 'flute', counter: 'glock', keys: 'nylon', arp: 'harp', pad: 'strings', bass: 'bass' },
  parts: { keys: 'half', arp: 'slow', pad: 'hold', bass: 'two' },
  mix: { lead: 0.85, counter: 0.35, keys: 0.5, arp: 0.4, pad: 0.45, bass: 0.65 },
  trim: { counter: 11.3, keys: 4.3, arp: 9.9, bass: 1.2, pad: -9.2 },
  thin: { keys: 0.15, arp: 0.3 },
  sections: {
    fanfare: { chords: 'Bb | C7sus4 C7 | F', lead: 'c5/1 f5 a5/2 c6/4 | d6/2 c6 bb5 g5 | a5/8', counter: '+12', inst: { lead: 'strings' }, parts: { keys: null, arp: 'arp8' }, label: 'fanfare' },
    A: {
      chords: 'Fmaj7 | Dm7 | Bbmaj7 | C7sus4 C7 | Fmaj7 | Am7 | Bbmaj7 | C7sus4',
      lead: 'a5/3 g5/1 f5/4 | f5/3 e5/1 d5/4 | d5/2 f5 a5/4 | g5/4 e5 | c6/3 a5/1 f5/4 | e5/2 g5 c6/4 | bb5/2 a5 f5 d5 | g5/8',
    },
    B: {
      chords: 'Bbmaj7 | Am7 | Gm7 | Fmaj7 | Bbmaj7 | Am7 | Gm7 | C7sus4 C7',
      lead: 'f5/4 d5 | e5/4 c5 | d5/2 f5 bb5/4 | a5/8 | d6/3 c6/1 bb5/4 | c6/3 a5/1 e5/4 | f5/2 d5 bb4 d5 | f5/4 e5',
      inst: { lead: 'clarinet' },
    },
  },
  form: ['fanfare', 'A', { s: 'B', air: true, label: 'B (the guitar and the harp)' }, { s: 'A', inst: { lead: 'clarinet' }, label: 'A (clarinet)' }, 'B'],
  loopVary: [{ inst: { lead: 'harp' } }, {}],
};

const cozyTable = {
  id: 'cozy-table', title: 'Cozy Table', place: 'boardgame', loop: true, loopTo: 1,
  mood: 'A board game night: a felt piano with a swing, brushes, a walking bass, a nylon guitar comping and a clarinet; cozy, never in the way of the talk', key: 'F major', bpm: 100, swing: 0.2, db: 7.6, verb: 0.22,
  inst: { lead: 'piano', counter: 'clarinet', keys: 'nylon', bass: 'bass' },
  parts: { keys: 'charleston', bass: 'walk', drums: 'brush' },
  mix: { lead: 0.85, counter: 0.4, keys: 0.5, bass: 0.75, drums: 0.45 },
  trim: { keys: 1.8, bass: -5, drums: 10.6 },
  thin: { keys: 0.2, drums: 0.25 }, lofi: { sat: 0.35, lp: 8500 },
  sections: {
    intro: { chords: 'Gm7 | C7' },
    A: {
      chords: 'Fmaj7 | D7 | Gm7 | C7 | Am7 | D7 | Gm7 C7 | Fmaj7',
      lead: 'a5/2 c6 a5 f5 | f#5/3 a5/1 c6/4 | bb5/2 a5 g5 d5 | e5/4 g5/2 bb5 | c6/3 a5/1 g5/2 e5 | f#5/2 a5 d6 c6 | bb5/2 g5 e5 c5 | f5/4 r',
    },
    B: {
      chords: 'Bbmaj7 | Bbm6 | Am7 | D7 | Gm7 | C7 | Fmaj7 D7 | Gm7 C7',
      lead: 'd6/3 c6/1 bb5/4 | db6/3 bb5/1 g5/4 | c6/2 a5 e5 g5 | f#5/4 a5 | bb5/3 a5/1 g5/2 d5 | e5/2 g5 bb5 c6 | a5/4 f#5 | g5/4 e5',
      inst: { lead: 'clarinet', counter: 'piano' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the band alone)' }, { s: 'A', inst: { lead: 'clarinet' }, label: 'A (clarinet)' }, { s: 'B', counter: '-12', label: 'B (clarinet, piano below)' }],
  loopVary: [{ inst: { lead: 'vibes' } }, {}],
  stings: { over: { lines: [{ inst: 'piano', line: 'c5/0.5 f5 a5 c6 f6/4', vol: 0.22 }, { inst: 'glock', line: 'r/2 a6/6', vol: 0.12 }], dip: 0.35, wait: 0.4 } },
};

const yourMove = {
  id: 'your-move', title: 'Your Move', place: 'boardgame', loop: true, loopTo: 1,
  mood: 'Playful turns round the table: a kalimba and a marimba trading the tune, pizzicato strings bouncing, woodblocks; light and a little cheeky', key: 'G major', bpm: 112, swing: 0.12, db: 5.5, verb: 0.2,
  inst: { lead: 'kalimba', counter: 'marimba', keys: 'pizz', bass: 'bass' },
  parts: { keys: 'bounce', bass: 'two', drums: 'woods' },
  mix: { lead: 0.95, counter: 0.4, keys: 0.5, bass: 0.75, drums: 0.45 },
  trim: { counter: 7.7, keys: 3.4, bass: -1.7, drums: 8.4 },
  thin: { keys: 0.25, drums: 0.25 },
  sections: {
    intro: { chords: 'G | D7' },
    A: {
      chords: 'G | Em7 | Am7 | D7 | G | E7 | Am7 D7 | G',
      lead: 'd5/1 g5 b5 g5 d5/2 b4 | e5/1 g5 b5 g5 e5/2 d5 | c5/1 e5 a5 e5 c5/2 e5 | f#5/2 a5/1 c6 a5/2 f#5 | g5/1 b5 d6 b5 g5/2 d5 | g#5/1 b5 d6 b5 g#5/2 e5 | a5/2 c6 f#5 a5 | g5/4 r',
    },
    B: {
      chords: 'Cmaj7 | Bm7 | Am7 | G | Cmaj7 | Bm7 E7 | Am7 | D7',
      lead: 'e5/2 g5 b5/4 | d5/2 f#5 a5/4 | c5/2 e5 g5/4 | b4/2 d5 g5/4 | e5/2 g5 c6/4 | b5/4 g#5 | a5/2 g5 e5 c5 | d5/2 f#5 a5 c6',
      inst: { lead: 'marimba', counter: 'kalimba' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the strings and the blocks)' }, { s: 'A', inst: { lead: 'marimba', counter: 'kalimba' }, counter: '+12', label: 'A (marimba, kalimba above)' }, 'B'],
  loopVary: [{ inst: { lead: 'glock' } }, {}],
  stings: { over: { lines: [{ inst: 'marimba', line: 'g5/0.5 b5 d6 g6/4', vol: 0.22 }, { inst: 'kalimba', line: 'r/2 b6/6', vol: 0.15 }], dip: 0.35, wait: 0.4 } },
};

const closeGame = {
  id: 'close-game', title: 'Close Game', place: 'boardgame', loop: true, loopTo: 1,
  mood: 'A tense moment, kept light: a sneaky clarinet, pizzicato tiptoeing, a clock ticking on the woodblocks; the last turns of a close game', key: 'D minor', bpm: 120, swing: 0, db: 7.2, verb: 0.2,
  inst: { lead: 'clarinet', counter: 'pizz', keys: 'pizz', bass: 'bass' },
  parts: { keys: 'offbeat', bass: 'two', drums: 'timer' },
  mix: { lead: 0.85, counter: 0.45, keys: 0.5, bass: 0.75, drums: 0.45 },
  trim: { counter: 6.3, keys: 4.5, bass: -3.5, drums: 10.5 },
  thin: { keys: 0.2, drums: 0.15 },
  sections: {
    intro: { chords: 'Dm | A7' },
    A: {
      chords: 'Dm | Dm | Gm | A7 | Dm | Bb7 | Em7b5 A7 | Dm',
      lead: 'd5/1 r f5 r a5/2 f5 | e5/1 r f5 r d5/4 | g5/1 r bb5 r d6/2 bb5 | c#6/2 a5 e5 g5 | f5/1 r a5 r d6/2 a5 | d6/2 bb5 ab5 f5 | g5/2 e5 c#5 e5 | d5/4 r',
    },
    B: {
      chords: 'Bbmaj7 | A7 | Dm | Dm | Gm6 | A7 | Dm Bb7 | A7',
      lead: 'f5/2 d5 a5/4 | e5/2 c#5 g5/4 | f5/1 e5 d5 e5 f5/4 | a5/8 | e5/2 g5 bb5/4 | c#6/4 a5 | d6/4 ab5 | e5/2 g5 c#6 a5',
      inst: { lead: 'pizz', counter: 'clarinet' },
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the clock and the strings)' }, { s: 'A', counter: '-12', inst: { counter: 'bass' }, label: 'A (clarinet, the bass below)' }, 'B'],
  loopVary: [{ inst: { lead: 'ocarina' } }, {}],
  stings: { over: { lines: [{ inst: 'clarinet', line: 'a4/1 d5 f#5 a5/4', vol: 0.22 }, { inst: 'pizz', line: 'd6/1 r a6/2', vol: 0.2 }], dip: 0.35, wait: 0.4 } },
};

export const SONGS = {};
for (const s of [morningYard, townStroll, lakeshore, woodsPath, porchLight, starlight, parlourWaltz, lamplightStudy, counterTalk, highScore, lineOut, kevinsBoat,
  hearthAndHound, openRoad, deepHalls, steelAndThunder, lanternGhosts, embersRest, cozyTable, yourMove, closeGame]) {
  if (s.place === 'walk') s.vars = { ...WALK_VARS, ...s.vars };
  SONGS[s.id] = s;
}
export const ORDER = Object.keys(SONGS);
export const WALK = ORDER.filter(id => SONGS[id].place === 'walk');
export const PLAYLISTS = { store: ['counter-talk', 'high-score'], lovecraft: ['parlour-waltz', 'lamplight-study'], fishing: ['line-out'], boat: ['kevins-boat'],
  boardgame: ['cozy-table', 'your-move'], 'boardgame-tense': ['close-game'] };   // a board game in play; a tense moment
// the D&D table's song for each mood (game-night-music.js follows the table)
export const TABLE_SONGS = Object.fromEntries(ORDER.filter(id => SONGS[id].table).map(id => [SONGS[id].table, id]));
export const PLACE_NAMES = { walk: 'Walking around Breneland', lovecraft: 'Inside the Lovecraft house', store: 'Inside the game store', fishing: 'Fishing', boat: "Out on Kevin's boat",
  backroom: 'D&D night in the back room', boardgame: "A board game at the store's tables" };
