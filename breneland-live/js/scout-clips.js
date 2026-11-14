// The cub scouts' giggles (written by tools/scout-giggles-cut.mjs; do not edit by hand): every clip in
// public/audio/scouts/<id>.mp3 (22.05 kHz mono MP3, cut from real recordings of children laughing), with its kind and the
// numbers measured from the encoded file: dur / lead (s), f0 (median pitch, Hz), cent (spectral centroid, Hz), K (BS.1770
// loudness of the loudest 400 ms, dBFS), peak (dBFS). Credits: docs/audio-credits.md and SOURCES below. Played by scout-voice.js.
export const CLIP_BASE = '/audio/scouts/';
export const CLIPS = {
  "scout-giggle-01": { kind: "giggle", src: "commons-boy-giggle", dur: 1.091, lead: 0, f0: 825, cent: 1198, K: -19.4, peak: -6, bytes: 7122, note: "A quick high giggle, a run of little \"hee\"s" },
  "scout-giggle-02": { kind: "giggle", src: "commons-boy-giggle", dur: 0.357, lead: 0.005, f0: 1151, cent: 1546, K: -19.6, peak: -3.9, bytes: 2734, note: "A tiny \"hehe\"" },
  "scout-giggle-03": { kind: "giggle", src: "commons-boy-giggle", dur: 0.801, lead: 0.005, f0: 1155, cent: 1410, K: -19.4, peak: -7.2, bytes: 5398, note: "A squeaky giggle" },
  "scout-giggle-04": { kind: "giggle", src: "commons-boy-giggle", dur: 0.976, lead: 0.005, f0: 486, cent: 1665, K: -19.4, peak: -5.2, bytes: 6495, note: "A giggle that runs up" },
  "scout-giggle-05": { kind: "giggle", src: "commons-four-years", dur: 0.77, lead: 0.003, f0: 427, cent: 1602, K: -19.4, peak: -7.9, bytes: 5241, note: "A four-year-old giggling" },
  "scout-giggle-06": { kind: "giggle", src: "bsb-0980", dur: 0.637, lead: 0.005, f0: 408, cent: 2143, K: -19.2, peak: -3.9, bytes: 4458, note: "A breathy toddler giggle" },
  "scout-laugh-01": { kind: "laugh", src: "commons-boy-giggle", dur: 1.043, lead: 0.005, f0: 639, cent: 1027, K: -17.4, peak: -3.5, bytes: 6809, note: "A happy belly laugh" },
  "scout-laugh-02": { kind: "laugh", src: "commons-boy-giggle", dur: 1.06, lead: 0.005, f0: 639, cent: 887, K: -18.7, peak: -3.5, bytes: 6965, note: "Laughing, \"ha ha ha\"" },
  "scout-laugh-03": { kind: "laugh", src: "commons-four-years", dur: 0.716, lead: 0, f0: 443, cent: 1811, K: -17.4, peak: -5.6, bytes: 4928, note: "A burst of laughing" },
  "scout-laugh-04": { kind: "laugh", src: "bsb-0980", dur: 0.615, lead: 0, f0: 368, cent: 1396, K: -17.5, peak: -4, bytes: 4301, note: "A toddler laughing" },
  "scout-laugh-05": { kind: "laugh", src: "bsb-0980", dur: 0.611, lead: 0, f0: 336, cent: 1201, K: -17.4, peak: -4.3, bytes: 4301, note: "A toddler laughing, a longer one" },
  "scout-chortle-01": { kind: "chortle", src: "commons-boy-giggle", dur: 1.184, lead: 0.005, f0: 380, cent: 1425, K: -18.5, peak: -3.6, bytes: 7749, note: "A rolling laugh that tails off low" },
  "scout-chortle-02": { kind: "chortle", src: "commons-boy-giggle", dur: 0.849, lead: 0.005, f0: 328, cent: 1140, K: -19.3, peak: -3.4, bytes: 5711, note: "A low chuckle" },
  "scout-chortle-03": { kind: "chortle", src: "commons-four-years", dur: 0.45, lead: 0.002, f0: 412, cent: 561, K: -18.4, peak: -8.2, bytes: 3360, note: "A closed-mouth snicker, \"hm-hm\"" },
  "scout-chortle-04": { kind: "chortle", src: "commons-four-years", dur: 0.69, lead: 0.003, f0: 398, cent: 561, K: -18.4, peak: -7.4, bytes: 4771, note: "A closed-mouth chuckle" },
};
export const SOURCES = {
  "commons-boy-giggle": { title: "Boy giggle (Wikimedia Commons)", author: "thatjeffcarter", license: "CC BY 3.0", page: "https://commons.wikimedia.org/wiki/File:Boy_giggle.ogg" },
  "commons-four-years": { title: "Four Years Old child laughing (Wikimedia Commons)", author: "morgantj", license: "CC BY 3.0", page: "https://commons.wikimedia.org/wiki/File:Four_Years_Old_child_laughing.ogg" },
  "bsb-0980": { title: "BigSoundBank #980, \"Laughing boy of 16 months\"", author: "Joseph Sardin (BigSoundBank)", license: "CC0", page: "https://bigsoundbank.com/laughing-boy-of-16-months_s0980.html" },
};
