// Kevin's radio: what a 78-year-old handyman keeps on all day in the Tool Crib. Our own songs in the music-songs.js format (played by
// music-band.js on the recorded instruments of music-sampler.js), written to sound like an old AM station: classic country, a
// gospel-tinged bluegrass waltz, a 50s doo-wop ballad and a bluegrass breakdown. No imports. crib-sound.js plays them one after
// another through the radio's small speaker (band-limited, a little drive, mono, positioned at the radio), with the station's
// static and a dial whine between them. They play through once and end (no loop); the radio picks the next, never the same
// twice running. `db` levels each to the same loudness at the radio (measured: tools/crib-sound-test.mjs --calibrate).

// the station's tape: worn, a little crackle (the radio's own static is crib-sound.js's), nearly no room (the shop is the room)
const AIR = { sat: 0.55, wow: 0.0022, flutter: 0.0006, lp: 6500, hiss: -62, crackle: -50, lag: 0.012, hum: 0.016, vel: 0.14, room: 0.06 };

const tailgate = {
  id: 'tailgate-two-step', title: 'Tailgate Two-Step', place: 'radio',
  mood: 'Classic country on the radio: a fiddle up front, the guitar\'s boom-chick, a honky-tonk piano taking the second verse', key: 'G major', bpm: 108, swing: 0.12, db: 9,
  inst: { lead: 'fiddle', counter: 'piano', strum: 'guitar', bass: 'bass', keys: 'piano' },
  parts: { strum: true, bass: 'two', drums: 'brush' },
  mix: { lead: 0.8, counter: 0.4, strum: 0.65, bass: 0.8, keys: 0.45, drums: 0.45 },
  trim: { bass: -8, strum: -8, keys: 2, drums: 3 },
  thin: { strum: 0.15, drums: 0.2 }, lofi: AIR,
  sections: {
    intro: { chords: 'G | D7', parts: { bass: null }, label: 'the kick-off' },
    A: {
      chords: 'G | G | C | G | D | D7 | G | G',
      lead: 'd5/2 b4/1 d5 g5/3 d5/1 | b4/2 a4 g4/4 | c5/2 e5/1 g5 e5/2 c5 | d5/3 b4/1 g4/4 | a4/2 d5/1 f#5 a5/2 f#5 | e5/2 d5/1 c5 a4/4 | b4/2 d5 g4/1 a4 b4/2 | g4/6 r/2',
    },
    B: {
      chords: 'C | C | G | G | A7 | A7 | D | D7',
      lead: 'e5/2 g5/1 e5 c5/2 e5 | g5/3 e5/1 c5/4 | d5/2 b4/1 d5 g5/2 d5 | b4/4 r/4 | c#5/2 e5/1 g5 a5/2 g5 | e5/3 c#5/1 a4/4 | f#5/2 a5/1 f#5 d5/2 a4 | c5/2 b4/1 a4 f#4/4',
      label: 'B (the chorus)',
    },
    outro: { chords: 'C D7 | G', lead: 'e5/2 d5 c5 a4 | g4/8', parts: { drums: null }, bpm: 0.92 },
  },
  form: ['intro', 'A', 'B', { s: 'A', inst: { lead: 'guitar' }, parts: { keys: 'twofour' }, label: 'A (steel guitar)' }, { s: 'B', inst: { lead: 'piano' }, parts: { keys: null }, label: 'B (honky-tonk piano)' },
    { s: 'A', air: true, parts: { keys: 'twofour' }, label: 'A (the band rolls on)' }, 'B', 'outro'],
};

const ridge = {
  id: 'church-on-the-ridge', title: 'Little Church on the Ridge', place: 'radio', meter: 3,
  mood: 'A gospel-tinged bluegrass waltz: hymn chords on the piano, a held organ-like swell, the fiddle singing, a mandolin taking the chorus', key: 'D major', bpm: 96, swing: 0, db: 10,
  inst: { lead: 'fiddle', counter: 'mandolin', keys: 'piano', bass: 'bass', pad: 'strings' },
  parts: { keys: 'waltz', bass: 'waltz', pad: 'hold' },
  mix: { lead: 0.85, counter: 0.4, keys: 0.5, bass: 0.75, pad: 0.4 },
  trim: { bass: -6, keys: 2, pad: -8 },
  thin: { keys: 0.1 }, lofi: AIR,
  sections: {
    intro: { chords: 'D | A7', parts: { pad: null }, label: 'the piano\'s lead-in' },
    A: {
      chords: 'D | G | D | A7 | D | G | D A7 | D',
      lead: 'f#4/2 a4 d5 | b4/4 a4/2 | a4/2 f#4 d4 | e4/4 r/2 | f#4/2 a4 d5 | d5/3 b4/1 g4/2 | a4/2 f#4/1 g4 e4/2 | d4/6',
      label: 'A (the verse)',
    },
    B: {
      chords: 'G | D | G | A7 | D | Bm | G A7 | D',
      lead: 'd5/2 d5 b4 | a4/4 f#4/2 | g4/2 b4 d5 | c#5/4 e5/2 | d5/2 f#5 a5 | f#5/3 e5/1 d5/2 | b4/3 c#5/3 | d5/6',
      label: 'B (the chorus)',
    },
    outro: { chords: 'G A7 | D', lead: 'b4/3 c#5/3 | d5/6', parts: { keys: 'sparse' }, bpm: 0.88 },
  },
  form: ['intro', 'A', 'B', { s: 'A', air: true, label: 'A (the hymn alone)' }, { s: 'B', inst: { lead: 'mandolin' }, counter: '-12', label: 'B (mandolin)' }, 'B', 'outro'],
};

const soda = {
  id: 'soda-fountain', title: 'Soda Fountain Sweetheart', place: 'radio',
  mood: 'A 50s doo-wop ballad: triplet piano, a clarinet crooning where a sax would, the oohs held by the strings, brushes', key: 'C major', bpm: 74, swing: 0.3, db: 9.5,
  inst: { lead: 'clarinet', counter: 'vibes', keys: 'piano', bass: 'bass', pad: 'strings' },
  parts: { keys: 'offbeat', bass: 'two', pad: 'hold', drums: 'swing' },
  mix: { lead: 0.85, counter: 0.4, keys: 0.5, bass: 0.75, pad: 0.35, drums: 0.4 },
  trim: { bass: -6, keys: 1, pad: -9, drums: 3 },
  thin: { keys: 0.1, drums: 0.2 }, lofi: AIR,
  sections: {
    intro: { chords: 'C | G7', parts: { pad: null }, label: 'the piano\'s triplets' },
    A: {
      chords: 'C | Am | F | G | C | Am | F G | C',
      lead: 'e5/3 d5/1 c5/2 e5 | a4/6 r/2 | f5/3 e5/1 c5/2 a4 | d5/6 r/2 | e5/3 d5/1 c5/2 g5 | e5/4 c5/2 a4 | a4/2 c5 b4 d5 | c5/6 r/2',
      label: 'A (the verse)',
    },
    B: {
      chords: 'Fmaj7 | Fmaj7 | C | C | D7 | D7 | G | G7',
      lead: 'a4/2 c5 f5/4 | e5/3 d5/1 c5/4 | g4/2 c5 e5/4 | d5/3 c5/1 c5/4 | f#5/3 e5/1 d5/2 c5 | a4/6 r/2 | b4/2 d5 g5/4 | f5/3 e5/1 d5/4',
      label: 'B (the bridge)',
    },
    outro: { chords: 'F G7 | C', lead: 'a4/2 c5 b4 d5 | c5/8', parts: { drums: null }, bpm: 0.9 },
  },
  form: ['intro', 'A', { s: 'A', inst: { lead: 'vibes' }, label: 'A (vibes)' }, 'B', { s: 'A', air: true, label: 'A (the oohs and the piano)' }, { s: 'A', counter: '+12', label: 'A (the last verse)' }, 'outro'],
};

const breakdown = {
  id: 'hardware-breakdown', title: 'Hardware Breakdown', place: 'radio',
  mood: 'A bluegrass breakdown: the fiddle racing, the banjo rolling, the mandolin chopping on two and four, the guitar\'s boom-chick, a walking bass', key: 'A major', bpm: 120, swing: 0.05, db: 8.5,
  inst: { lead: 'fiddle', counter: 'mandolin', roll: 'banjo', chop: 'mandolin', strum: 'guitar', bass: 'bass' },
  parts: { roll: true, chop: true, strum: true, bass: 'bluegrass' },
  mix: { lead: 0.75, counter: 0.4, roll: 0.5, chop: 0.4, strum: 0.6, bass: 0.8 },
  trim: { bass: -11, roll: 3.4, chop: -7.5, strum: -10 },
  thin: { roll: 0.4, chop: 0.2, strum: 0.15 }, lofi: AIR,
  sections: {
    intro: { chords: 'A | E', parts: { chop: null, strum: null, bass: null }, label: 'banjo kick-off' },
    A: {
      chords: 'A | A | D | A | A | A | E | A',
      lead: 'a4/1 b4 c#5 e5 a5/2 e5 | c#5/1 e5 c#5 b4 a4/4 | d5/1 f#5 a5 f#5 d5/2 a4 | c#5/2 a4 e4/4 | a4/1 c#5 e5 a5 c#6/2 a5 | b5/1 a5 f#5 e5 c#5/4 | b4/1 e5 g#5 b5 e5/2 d5 | c#5/2 e4 a4/4',
    },
    B: {
      chords: 'D | D | A | A | E | E | A | A',
      lead: 'f#5/1 e5 d5 e5 f#5/2 a5 | a5/2 f#5 d5/4 | e5/1 c#5 a4 c#5 e5/2 a5 | c#6/4 a5/4 | g#5/1 f#5 e5 f#5 g#5/2 b5 | b5/2 g#5 e5/4 | c#5/1 e5 a5 e5 c#5/2 b4 | a4/6 r/2',
      label: 'B (the high part)',
    },
  },
  form: ['intro', 'A', 'B', { s: 'A', mute: ['lead'], mix: { roll: 0.9 }, thin: { roll: 0 }, label: 'banjo break' }, { s: 'B', inst: { lead: 'mandolin' }, label: 'B (mandolin)' },
    { s: 'A', air: true, label: 'A (guitar and bass)' }, 'A'],
};

export const RADIO_SONGS = {};
for (const s of [tailgate, ridge, soda, breakdown]) RADIO_SONGS[s.id] = s;
export const RADIO_ORDER = Object.keys(RADIO_SONGS);
