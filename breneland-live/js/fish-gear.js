// Fishing gear: the poles and baits (Kevin's stick rod and what Mabel lends at the Fish Shack). Plain data, no imports
// (tools load it into Node). Keep the ids in step with lib/fishing.js (POLE_IDS, BAIT_IDS: the server's whitelist).
// The 3D models are in fish-gear-art.js, the icons in fish-art.js.
// Balance: all gear is free, and the stick rod with a plain bobber is the baseline. Each pole has one perk and none
// changes how often fish bite. Baits change who comes to the line: worms make everything keener, the rest pick
// favourites and put the others off a little, so they're for hunting a kind, not for more fish.
export const POLES = {
  stick:   { id: 'stick',   name: 'Stick Rod',         blurb: 'A crooked stick with string tied on. Kevin swears by it.', perk: 'Kevin\'s own. It does the job.',
             cast: 14, reel: 1, window: 1, junk: 1, line: '#f1e6c8', lineR: 0.016 },
  bamboo:  { id: 'bamboo',  name: 'Bamboo Pole',       blurb: 'Light and long, with a green tip.', perk: 'Casts 3 m further.',
             cast: 17, reel: 1, window: 1, junk: 1, line: '#b6f04a', lineR: 0.011 },
  spinner: { id: 'spinner', name: 'Blue Spinner',      blurb: 'Fibreglass with a real spinning reel. Click click click.', perk: 'Reels in a third faster.',
             cast: 14, reel: 1.33, window: 1, junk: 1, line: '#ff7a1f', lineR: 0.011 },
  lucky:   { id: 'lucky',   name: 'Kevin\'s Lucky Rod', blurb: 'Older than the pier. Gold rings, a brass reel and a clover.', perk: 'More time to hook. Half the junk.',
             cast: 14, reel: 1, window: 1.3, junk: 0.5, line: '#ffc61a', lineR: 0.012 },
};
export const POLE_IDS = Object.keys(POLES);

// appeal: how keen each kind of fish is (1 = the baseline). k is the fish's size (1 = a typical one of its kind).
export const BAITS = {
  none:     { id: 'none',     name: 'Just a Bobber',  blurb: 'The red and white classic over a bare hook.', perk: 'Nothing fancy.', color: '#e0574f',
              appeal: () => 1 },
  worms:    { id: 'worms',    name: 'Worms',          blurb: 'A wriggly pink worm under a tall green float.', perk: 'Every fish is a bit keener.', color: '#ff8fb0',
              appeal: () => 1.35 },
  crickets: { id: 'crickets', name: 'Crickets',       blurb: 'A cricket on the hook under a bumblebee float.', perk: 'Perch, sunfish and minnows love it.', color: '#f2c230',
              appeal: id => (id === 'perch' ? 2.4 : id === 'sunfish' ? 2 : id === 'minnow' || id === 'trout' ? 1.6 : 0.8) },
  spoon:    { id: 'spoon',    name: 'Shiny Spoon',    blurb: 'A silver spoon that flashes in the sun. No float.', perk: 'Mackerel, pike and golden fish notice.', color: '#c9d6e2',
              appeal: (id, k) => (id === 'golden' ? 2.5 : id === 'mackerel' || id === 'pike' ? 2 : id === 'minnow' ? 0.5 : 1) * (k > 1.05 ? 1.3 : 1) },
  frog:     { id: 'frog',     name: 'Rubber Frog',    blurb: 'A squeaky green frog that sits on the water.', perk: 'Bass, catfish and pufferfish go wild.', color: '#5cc05a',
              appeal: id => (id === 'bass' ? 2.4 : id === 'puffer' || id === 'catfish' ? 1.8 : id === 'minnow' ? 0.4 : 0.8) },
};
export const BAIT_IDS = Object.keys(BAITS);
// 'lure' is the spoon's old id, still found in choices saved on a device
export const BAIT_ALIASES = { lure: 'spoon' };

export const DEFAULT_GEAR = { pole: 'stick', bait: 'none' };
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);   // not 'constructor', '__proto__'...
export const cleanPole = p => (own(POLES, p) ? p : 'stick');
export const cleanBait = b => { const k = own(BAIT_ALIASES, b) ? BAIT_ALIASES[b] : b; return own(BAITS, k) ? k : 'none'; };
export const poleOf = p => POLES[cleanPole(p)];
export const baitOf = b => BAITS[cleanBait(b)];

// The held-item code a rod travels as (codes.js HELD_CODES): 'rod' is the stick, the others are 'rod-<pole>'.
export const rodHeld = pole => (cleanPole(pole) === 'stick' ? 'rod' : 'rod-' + cleanPole(pole));
export const poleFromHeld = kind => (typeof kind === 'string' && kind.startsWith('rod-') ? cleanPole(kind.slice(4)) : 'stick');
