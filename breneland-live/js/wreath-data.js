// Carol's wreaths as plain data (no imports, so the game, the tests in Node and the server all read the same file):
// about thirty designs built from parts (a base, a palette, accents, a bow, a word plaque), the booth's seasonal
// arrangements, the dog "Welcome" signs, and the day-seeded choices: which arrangement is up today and which wreath stands
// on the tripod after n sales. Everything here is a pure function of its arguments (CLAUDE.md: no Math.random), so every
// client builds the same booth and the same door wreaths. wreath-art.js turns a design into a mesh; buddy-day.js decides
// who buys what and when.

// ------------------------------------------------------------------ hashing (the same numbers as util.js hash01)
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
export function h01(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const v = typeof p === 'number' ? (p | 0) ^ Math.imul((p * 4096) | 0, 31) : hashStr(String(p));
    h = mix(h ^ v);
  }
  return h / 4294967296;
}

// ------------------------------------------------------------------ the parts
export const BASES = ['grapevine', 'burlap', 'mesh', 'evergreen', 'floral'];
// palette: ring colours (the base, alternated), accent colours, the bow
export const PALETTES = {
  fall: { ring: ['#c98a4b', '#e8a23c', '#b8562e'], acc: ['#e07a2a', '#f2c230', '#8a3b1e'], bow: '#b8562e' },
  harvest: { ring: ['#d9c39a', '#c9a874', '#e3d3b0'], acc: ['#e07a2a', '#f2c230', '#6b8a3a'], bow: '#a8432e' },
  halloween: { ring: ['#f07a1e', '#7a3fa8', '#76c043'], acc: ['#1f1f24', '#f07a1e', '#7a3fa8'], bow: '#1f1f24' },
  spooky: { ring: ['#1f1f24', '#f07a1e', '#1f1f24'], acc: ['#f07a1e', '#f4f2ea', '#7a3fa8'], bow: '#f07a1e' },
  christmas: { ring: ['#c8302c', '#2f7a3f', '#f4f2ea'], acc: ['#c8302c', '#e8c25a', '#d4d7dc'], bow: '#c8302c' },
  winter: { ring: ['#2f6b46', '#3f8a52', '#24583a'], acc: ['#c8302c', '#e8c25a', '#f4f2ea'], bow: '#c8302c' },
  spring: { ring: ['#f6b8cc', '#bfe3a8', '#f9e3a0'], acc: ['#ff8fb8', '#b48cff', '#fff27a'], bow: '#ff8fb8' },
  sunny: { ring: ['#f9d84a', '#7cc452', '#f9d84a'], acc: ['#f2b618', '#ffffff', '#6b4a2b'], bow: '#3f8fd9' },
  patriotic: { ring: ['#c8302c', '#f4f2ea', '#2f4f9f'], acc: ['#f4f2ea', '#2f4f9f', '#c8302c'], bow: '#2f4f9f' },
  gameday: { ring: ['#7a4a2a', '#f4f2ea', '#2f7a3f'], acc: ['#7a4a2a', '#f4f2ea', '#e07a2a'], bow: '#2f7a3f' },
  teamred: { ring: ['#c8302c', '#1f1f24', '#f4f2ea'], acc: ['#7a4a2a', '#f4f2ea', '#c8302c'], bow: '#1f1f24' },
  summer: { ring: ['#7dd3e8', '#f4f2ea', '#f9d84a'], acc: ['#f2c230', '#ff8a3a', '#7cc452'], bow: '#3fa8d9' },
};
export const WORDS = ['BEWARE', 'Welcome', 'Game Day', 'Hello Spring', 'Merry', 'Hello Fall', 'Boo!', 'Home Sweet Home'];

// ------------------------------------------------------------------ the designs (deterministic by index; shared with the doors)
// accents: [kind, count] with kind in pumpkin sunflower scarecrow ornament pinecone leaf football flower star berry
// bow: 'plain' | 'check' | null; word: an index into WORDS or null; big: drawn larger on the booth's corner towers
export const DESIGNS = [
  { name: 'Scarecrow Burlap', theme: 'fall', base: 'burlap', pal: 'harvest', acc: [['scarecrow', 1], ['leaf', 6]], bow: 'check' },
  { name: 'Sunflower Grapevine', theme: 'fall', base: 'grapevine', pal: 'fall', acc: [['sunflower', 3], ['leaf', 4]], bow: 'plain' },
  { name: 'Pumpkin Patch Mesh', theme: 'fall', base: 'mesh', pal: 'fall', acc: [['pumpkin', 3], ['leaf', 5]], bow: 'plain' },
  { name: 'Big Sunflower', theme: 'fall', base: 'burlap', pal: 'sunny', acc: [['sunflower', 1], ['leaf', 3]], bow: null, bigFlower: true },
  { name: 'Pinecone Harvest', theme: 'fall', base: 'grapevine', pal: 'harvest', acc: [['pinecone', 4], ['pumpkin', 1]], bow: 'check' },
  { name: 'Hello Fall', theme: 'fall', base: 'floral', pal: 'fall', acc: [['flower', 6], ['pumpkin', 1]], bow: 'plain', word: 5 },
  { name: 'Beware', theme: 'halloween', base: 'mesh', pal: 'halloween', acc: [['pumpkin', 2]], bow: 'plain', word: 0 },
  { name: 'Jack O Mesh', theme: 'halloween', base: 'mesh', pal: 'spooky', acc: [['pumpkin', 3]], bow: 'check' },
  { name: 'Boo Grapevine', theme: 'halloween', base: 'grapevine', pal: 'halloween', acc: [['berry', 6], ['pumpkin', 1]], bow: 'check', word: 6 },
  { name: 'Spooky Scarecrow', theme: 'halloween', base: 'burlap', pal: 'halloween', acc: [['scarecrow', 1], ['pumpkin', 2]], bow: 'plain' },
  { name: 'Witchy Florals', theme: 'halloween', base: 'floral', pal: 'spooky', acc: [['flower', 7]], bow: 'plain' },
  { name: 'Game Day', theme: 'gameday', base: 'mesh', pal: 'gameday', acc: [['football', 1]], bow: 'check', word: 2 },
  { name: 'Touchdown', theme: 'gameday', base: 'mesh', pal: 'gameday', acc: [['football', 3]], bow: 'plain' },
  { name: 'Red and Black', theme: 'gameday', base: 'mesh', pal: 'teamred', acc: [['football', 2], ['star', 3]], bow: 'check' },
  { name: 'Tailgate Burlap', theme: 'gameday', base: 'burlap', pal: 'gameday', acc: [['football', 1], ['star', 4]], bow: 'check' },
  { name: 'Classic Evergreen', theme: 'christmas', base: 'evergreen', pal: 'winter', acc: [['ornament', 6], ['berry', 5]], bow: 'plain' },
  { name: 'Pinecone Evergreen', theme: 'christmas', base: 'evergreen', pal: 'winter', acc: [['pinecone', 6]], bow: 'check' },
  { name: 'Merry', theme: 'christmas', base: 'mesh', pal: 'christmas', acc: [['ornament', 5]], bow: 'plain', word: 4 },
  { name: 'Buffalo Check Burlap', theme: 'christmas', base: 'burlap', pal: 'christmas', acc: [['pinecone', 3], ['berry', 4]], bow: 'check' },
  { name: 'Poinsettia', theme: 'christmas', base: 'floral', pal: 'christmas', acc: [['flower', 6], ['berry', 4]], bow: null },
  { name: 'Ornament Grapevine', theme: 'christmas', base: 'grapevine', pal: 'christmas', acc: [['ornament', 7]], bow: 'plain' },
  { name: 'Hello Spring', theme: 'spring', base: 'floral', pal: 'spring', acc: [['flower', 8]], bow: 'plain', word: 3 },
  { name: 'Spring Grapevine', theme: 'spring', base: 'grapevine', pal: 'spring', acc: [['flower', 6]], bow: 'check' },
  { name: 'Pastel Mesh', theme: 'spring', base: 'mesh', pal: 'spring', acc: [['flower', 3]], bow: 'plain' },
  { name: 'Welcome Burlap', theme: 'spring', base: 'burlap', pal: 'spring', acc: [['flower', 4]], bow: 'check', word: 1 },
  { name: 'Lemon Daisy', theme: 'spring', base: 'floral', pal: 'sunny', acc: [['flower', 6], ['sunflower', 1]], bow: null },
  { name: 'Stars and Stripes', theme: 'patriotic', base: 'mesh', pal: 'patriotic', acc: [['star', 5]], bow: 'plain' },
  { name: 'Liberty Burlap', theme: 'patriotic', base: 'burlap', pal: 'patriotic', acc: [['star', 4]], bow: 'check' },
  { name: 'Beach Welcome', theme: 'summer', base: 'floral', pal: 'summer', acc: [['flower', 6]], bow: 'plain', word: 1 },
  { name: 'Home Sweet Home', theme: 'summer', base: 'grapevine', pal: 'sunny', acc: [['sunflower', 2], ['flower', 3]], bow: 'check', word: 7 },
].map((d, i) => ({ id: i, word: null, ...d }));
export const N_DESIGNS = DESIGNS.length;
export const designsOf = theme => DESIGNS.filter(d => d.theme === theme).map(d => d.id);

// ------------------------------------------------------------------ the booth's arrangements
// The left canopy's wall (two rows of 4 on the back grid, 4 on the side grid), the three on the table, and the big
// seasonal wreath on each front corner tower. The dog-sign wall (right canopy) is the same every day.
const byName = n => DESIGNS.find(d => d.name === n).id;
export const ARRANGEMENTS = [
  { id: 'harvest', name: 'Fall harvest', themes: ['fall', 'fall', 'halloween'], corners: [byName('Big Sunflower'), byName('Hello Fall')] },
  { id: 'halloween', name: 'Halloween', themes: ['halloween', 'fall', 'halloween'], corners: [byName('Beware'), byName('Game Day')] },
  { id: 'gameday', name: 'Game day', themes: ['gameday', 'fall', 'gameday'], corners: [byName('Game Day'), byName('Touchdown')] },
  { id: 'christmas', name: 'Christmas', themes: ['christmas', 'christmas', 'christmas'], corners: [byName('Merry'), byName('Classic Evergreen')] },
  { id: 'spring', name: 'Spring florals', themes: ['spring', 'spring', 'patriotic'], corners: [byName('Hello Spring'), byName('Stars and Stripes')] },
  { id: 'summer', name: 'Summer welcome', themes: ['summer', 'spring', 'patriotic'], corners: [byName('Home Sweet Home'), byName('Beach Welcome')] },
];
export const WALL_SLOTS = 12, TABLE_SLOTS = 3;
// Which wreath hangs in each slot of arrangement a on day `day`: { wall: [12 ids], table: [3 ids], corners: [2 ids] }.
// The wall repeats designs (as the real booth does), so the repeated ones are instanced.
export function arrangementLayout(a, day) {
  const A = ARRANGEMENTS[a];
  const pool = [...new Set(A.themes.flatMap(designsOf))];
  const pick = (salt, k) => pool[Math.floor(h01('wreath-slot', A.id, day, salt, k) * pool.length)];
  const wall = [], table = [];
  for (let k = 0; k < WALL_SLOTS; k++) wall.push(pick('w', k % 6)); // six designs, each twice
  for (let k = 0; k < TABLE_SLOTS; k++) table.push(pick('t', k));
  return { wall, table, corners: A.corners.slice() };
}
// The arrangement on a given Eastern day (seeded, so every client sees the same one).
export function arrangementFor(day) { return Math.floor(h01('arrangement', day) * ARRANGEMENTS.length); }
// The wreath on the tripod after n sales today (restocked from the whole range after each one).
export function tripodDesign(day, n) { return Math.floor(h01('tripod', day, n) * N_DESIGNS); }

// ------------------------------------------------------------------ the dog signs (right canopy, always there)
// Round wooden "Welcome" signs: a dog peeking over a line, a check bow on top, a paw print for the "o". caption: the
// sign's words (the "o" of Welcome is drawn as a paw).
export const BREEDS = [
  { id: 'boston', name: 'Boston terrier', caption: ['Welcome'] },
  { id: 'frenchie', name: 'French bulldog', caption: ['Welcome'] },
  { id: 'dachshund', name: 'Dachshund', caption: ['Welcome', 'We know you\'re here'] },
  { id: 'shepherd', name: 'German shepherd', caption: ['Welcome'] },
  { id: 'lab', name: 'Black lab', caption: ['Welcome'] },
  { id: 'basset', name: 'Basset hound', caption: ['I Hear You', 'I\'m just not listening'] },
  { id: 'dax', name: 'Dax', caption: ['Welcome'] }, // Andrew's brindle lab, a nod to him
  { id: 'pug', name: 'Pug', caption: ['Welcome'] },
];

// ------------------------------------------------------------------ the Eastern calendar day (the booth's day)
const dayFmt = (() => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { return null; } })();
const dayMemo = new Map();
// Days since 1970-01-01 of the Eastern calendar date at UTC milliseconds ms (memoised per minute).
export function easternDay(ms) {
  const m = Math.floor(ms / 60000);
  let d = dayMemo.get(m);
  if (d === undefined) {
    let y, mo, dd;
    if (dayFmt) { const s = dayFmt.format(new Date(m * 60000)); [y, mo, dd] = s.split('-').map(Number); }
    else { const t = new Date(m * 60000 - 5 * 3600e3); y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; dd = t.getUTCDate(); }
    d = Math.round(Date.UTC(y, mo - 1, dd) / 864e5);
    dayMemo.set(m, d);
    if (dayMemo.size > 64) dayMemo.delete(dayMemo.keys().next().value);
  }
  return d;
}

// The price on the tripod (paid in fish, lib/wreaths.js charges it).
export const WREATH_PRICE = 10;
