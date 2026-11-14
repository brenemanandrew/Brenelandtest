// Fishing data: the species table, the zones fish loiter in, and the small rolls that pick who bites.
// Keep the ids and size ranges in step with lib/fishing.js (the server whitelist).
import { hash01, lerp } from './util.js';
import { POOLS } from './fish-regions.js';

// len/wid: length (tail included) and body width in metres for a typical fish of the kind; speed: cruising m/s; window: seconds you get to
// hit the button after the bite (skittish little fish give less, big lazy ones more); nibbles: how many tugs first.
export const SPECIES = {
  minnow:   { id: 'minnow',   name: 'Minnow',      color: '#8fd3f4', belly: '#f2fbff', fin: '#5fb0d8', cm: [4, 9],   len: 0.34, wid: 0.12, speed: 2.3, window: 0.45, nibbles: [1, 2], rare: 0 },
  perch:    { id: 'perch',    name: 'Perch',       color: '#7fb85a', belly: '#f1f0a8', fin: '#e8763a', stripe: '#2f5f3a', cm: [14, 32], len: 0.62, wid: 0.2, speed: 1.6, window: 0.6, nibbles: [1, 2], rare: 0 },
  mackerel: { id: 'mackerel', name: 'Mackerel',    color: '#3f8fb0', belly: '#dff4f8', fin: '#2b6a8a', stripe: '#173d55', cm: [22, 45], len: 0.86, wid: 0.18, speed: 2.0, window: 0.6, nibbles: [1, 2], rare: 0 },
  bass:     { id: 'bass',     name: 'Sea Bass',    color: '#7f95a8', belly: '#e5edf2', fin: '#5b7085', cm: [30, 78], len: 1.22, wid: 0.36, speed: 0.9, window: 0.95, nibbles: [2, 3], rare: 0 },
  flounder: { id: 'flounder', name: 'Flounder',    color: '#b39a6e', belly: '#e8dcbc', fin: '#8d764d', spots: '#7a6446', cm: [20, 46], len: 0.9, wid: 0.55, speed: 0.55, window: 1.0, nibbles: [2, 3], rare: 0 },
  puffer:   { id: 'puffer',   name: 'Pufferfish',  color: '#e8c65a', belly: '#fff5cf', fin: '#d19b2e', spots: '#b8892e', cm: [12, 28], len: 0.62, wid: 0.44, speed: 0.9, window: 0.8, nibbles: [1, 3], rare: 0 },
  // the regions' own fish (fish-regions.js TIER and POOLS say who lives where)
  trout:    { id: 'trout',    name: 'Rainbow Trout', color: '#8fae78', belly: '#f6f0de', fin: '#6f9058', band: '#ef8fa8', spots: '#3d4a32', cm: [20, 55], len: 0.95, wid: 0.2, speed: 1.8, window: 0.6, nibbles: [1, 2], rare: 0 },
  pike:     { id: 'pike',     name: 'Pike',        color: '#6f9450', belly: '#eef0c4', fin: '#d08a3a', spots: '#e2eea6', cm: [40, 110], len: 1.45, wid: 0.24, speed: 1.4, window: 0.8, nibbles: [2, 3], rare: 0 },
  sturgeon: { id: 'sturgeon', name: 'Sturgeon',    color: '#808a96', belly: '#e6e3da', fin: '#5f6874', spots: '#efeadc', cm: [60, 150], len: 1.8, wid: 0.32, speed: 0.7, window: 1.1, nibbles: [2, 3], rare: 0 },
  sunfish:  { id: 'sunfish',  name: 'Sunfish',     color: '#4fa3ac', belly: '#ffb04a', fin: '#3a7f88', spots: '#ffd86b', cm: [8, 22], len: 0.42, wid: 0.3, speed: 1.5, window: 0.5, nibbles: [1, 2], rare: 0 },
  catfish:  { id: 'catfish',  name: 'Catfish',     color: '#73645a', belly: '#ecdcc2', fin: '#564840', cm: [35, 95], len: 1.3, wid: 0.34, speed: 0.7, window: 1.0, nibbles: [2, 3], rare: 0 },
  golden:   { id: 'golden',   name: 'Golden Fish', color: '#ffc933', belly: '#fff0a0', fin: '#ff9a1f', cm: [16, 34], len: 0.78, wid: 0.26, speed: 1.7, window: 0.55, nibbles: [2, 3], rare: 1 },
};
export const SPECIES_IDS = Object.keys(SPECIES);

export const JUNK = {
  boot: { id: 'boot', name: 'Old Boot' },
  duck: { id: 'duck', name: 'Rubber Duck' },
  can:  { id: 'can',  name: 'Tin Can' },
};
export const JUNK_IDS = Object.keys(JUNK);

export const isFish = id => !!SPECIES[id];
export const nameOf = id => (SPECIES[id] || JUNK[id] || { name: 'Something' }).name;

// Where the fish live: a few zones per region of Andrew's map (fish-regions.js), each with its region's pool (POOLS, the
// same weights the server checks a catch against). `n` is how many shadows the zone keeps.
const zone = (id, region, x, z, r, n) => ({ id, region, x, z, r, n, weights: POOLS[region] });
export const ZONES = [
  // east: the pier, the shore by the Fish Shack and the lake past the swimming area
  zone('dock', 'east', 68, -19, 10, 8), zone('eastN', 'east', 68, -38, 9, 4), zone('eastS', 'east', 68, -2, 9, 4), zone('rufE', 'east', 46, 22, 12, 6),
  // north: Lake Tamakiya up the east shore past Maple Row
  zone('tamN', 'north', 69, -60, 10, 5), zone('tamMid', 'north', 69, -82, 9, 4), zone('tamFar', 'north', 71, -104, 10, 5),
  // south: along the south shore below the woods, to the mouth of Oyster Cove
  zone('rufCove', 'south', -20, 56, 10, 4), zone('rufPark', 'south', -58, 49, 12, 6), zone('rufSW', 'south', -86, 52, 11, 5), zone('rufW', 'south', -112, 60, 12, 5),
  // round Kevin's boat wherever it is (fishing.js moves this zone with the boat and gives it the pool of the water it's in); keep it last
  { id: 'boat', region: 'east', x: 60, z: -24, r: 8, n: 5, follow: true, weights: POOLS.east },
];

// A gentle "run" changes what is biting every few minutes, from the shared clock (so friends fishing together agree).
export function runBoost(slot, id) {
  const h = hash01('run', slot, id);
  return h > 0.82 ? 2.2 : h < 0.15 ? 0.5 : 1;
}

// Pick a species for a zone. r in [0,1). `slot` is floor(sharedSeconds / 180).
export function pickSpecies(zone, slot, r) {
  let total = 0;
  const ws = [];
  for (const id of Object.keys(zone.weights)) { const w = zone.weights[id] * runBoost(slot, id); ws.push([id, w]); total += w; }
  let t = r * total;
  for (const [id, w] of ws) { t -= w; if (t <= 0) return id; }
  return ws[0][0];
}

// A size in cm, weighted toward the small end (big ones are rare). u in [0,1).
export function sizeCm(id, u) {
  const [lo, hi] = SPECIES[id].cm;
  return Math.round(lerp(lo, hi, Math.pow(u, 1.7)));
}
// How big the shadow looks (1 = the typical fish of its kind), so a big shadow really is a big fish.
export function sizeScale(id, cm) {
  const [lo, hi] = SPECIES[id].cm;
  return 0.72 + 0.62 * ((cm - lo) / Math.max(1, hi - lo));
}

export function fmtTime(secs) {
  secs = Math.max(0, Math.round(secs || 0));
  if (secs < 60) return `${secs} sec`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
export function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; }
}
