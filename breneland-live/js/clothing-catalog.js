// Peak Threads, the clothing store (clothing-store, Andrew 2026-11-09: "several random outfit pieces per week that players can buy and
// change into", like Animal Crossing's). The catalogue and the week's stock, pure and import-free, so the server (lib/clothing.js loads
// it as a data: URL), every client and the tests agree on what is for sale this week.
//
//   PIECES            every piece: { id, name, kind, model, cols, price, ... }  (kind: KINDS; the model is one of public/models/clothes.json's
//                     and `cols` its zone colours, so one Blender model yields several pieces). `deco: true` marks a design that is
//                     not up to the polished bar yet (Andrew: fewer pieces made really well; "past and unfinished designs ... for
//                     deco"): it never comes into the weekly stock and only dresses the store (the back mannequin, the racks' far
//                     sides); anyone who owns one keeps it and can wear it (ownership is by id, not by stock)
//   KINDS             'hat' | 'top' | 'bot' | 'shoe' | 'acc' and SLOT_KEY[kind]: the look key the worn piece travels in (wHat, wTop, ...)
//   weekOf(ms)        weeks since WEEK0 (Sunday 1 Nov 2026), switching at midnight Saturday to Sunday, Eastern (crossword-rules.js's rule)
//   weekStart(week)   when that week begins (ms); weekEnd(week) when the stock rolls over
//   stockOf(week)     the STOCK_N piece ids for sale that week (never a deco piece): the same for everyone, picked by a hash of the week,
//                     never Math.random; every kind every week, and a piece comes round again only after its kind's whole list has been through
//   pieceOf(id)       the piece or null;  wornOf(look) -> { hat, top, bot, shoe, acc } piece ids from a look's keys (unknown ids dropped)
// Prices are fish (the lobby's currency). Once bought a piece is yours for good (record.clothing.owned).

export const KINDS = ['hat', 'top', 'bot', 'shoe', 'acc'];
export const SLOT_KEY = { hat: 'wHat', top: 'wTop', bot: 'wBot', shoe: 'wShoe', acc: 'wAcc' };
export const KIND_NAMES = { hat: 'Hats', top: 'Tops', bot: 'Bottoms and dresses', shoe: 'Shoes', acc: 'Accessories' };
export const STOCK_PER_KIND = { hat: 2, top: 2, bot: 1, shoe: 1, acc: 1 }; // 7 pieces a week
export const STOCK_N = 7;

// ---- the catalogue. cols: the model's zone colours in order (zone 1, 2, ...; zone 0 is the model's fixed detail, baked as is).
// Per kind the extras the body build reads: hats `cover` (the code hat it is shaped like; `null` = sits on the hair) with HAT_RIM below
// (the model's own rim and gap: the hair is squashed and trimmed under the whole dome, clothing-wear.js hatCoverFor); tops `sleeves` ('long' | 'short'), `inner` (the shirt showing under an open top; else the
// top's own colour); bottoms `legs` ('pants' | 'shorts' | 'dress'); shoes nothing; accessories `where` ('head' | 'chest').
const P = (id, name, kind, model, cols, price, extra = {}) => ({ id, name, kind, model, cols, price, ...extra });
export const PIECES = [
  // hats and headwear (10)
  P('beanie-red', 'Red Beanie', 'hat', 'beanie', ['#c7392f', '#f1e5d0'], 3, { cover: 'beanie' }),
  P('beanie-pine', 'Pine Beanie', 'hat', 'beanie', ['#2f6b4a', '#f1e5d0'], 3, { cover: 'beanie' }),
  P('beanie-gold', 'Mustard Beanie', 'hat', 'beanie', ['#d9a63a', '#3a3028'], 3, { cover: 'beanie' }),
  P('cap-navy', 'Navy Ball Cap', 'hat', 'cap', ['#2b3a5e', '#f1e5d0'], 4, { cover: 'cap' }),
  P('cap-red', 'Red Ball Cap', 'hat', 'cap', ['#c7392f', '#2b2340'], 4, { cover: 'cap' }),
  P('sunhat-straw', 'Straw Sun Hat', 'hat', 'sunhat', ['#e3c57f', '#c7392f'], 5, { cover: 'sunhat' }),
  P('bucket-olive', 'Olive Bucket Hat', 'hat', 'bucket', ['#6f7a4a', '#3a3028'], 4, { cover: 'cap', deco: true }),
  P('bucket-pink', 'Pink Bucket Hat', 'hat', 'bucket', ['#ef8fb5', '#fbf7ee'], 4, { cover: 'cap', deco: true }),
  P('flower-crown', 'Flower Crown', 'hat', 'flowercrown', ['#4f8a3f', '#f4b8d0'], 5, { cover: null, deco: true }),
  P('trapper-brown', 'Trapper Hat', 'hat', 'trapper', ['#6b4428', '#efe4cc'], 5, { cover: 'beanie', deco: true }),
  // tops (11)
  P('flannel-red', 'Red Flannel', 'top', 'flannel', ['#b8372e', '#2b2340', '#f1e5d0'], 6, { sleeves: 'long', inner: '#f1e5d0' }),
  P('flannel-green', 'Green Flannel', 'top', 'flannel', ['#2f6b4a', '#2b2340', '#f1e5d0'], 6, { sleeves: 'long', inner: '#f1e5d0' }),
  P('flannel-blue', 'Blue Flannel', 'top', 'flannel', ['#3f6fa8', '#8a9ab0', '#f1e5d0'], 6, { sleeves: 'long', inner: '#f1e5d0' }),
  P('hoodie-grey', 'Grey Hoodie', 'top', 'hoodie', ['#8a8f98', '#2b2340'], 7, { sleeves: 'long' }),
  P('hoodie-teal', 'Teal Hoodie', 'top', 'hoodie', ['#3fa09a', '#fbf7ee'], 7, { sleeves: 'long' }),
  P('hoodie-plum', 'Plum Hoodie', 'top', 'hoodie', ['#6b3a7a', '#fbf7ee'], 7, { sleeves: 'long' }),
  P('puffer-orange', 'Orange Puffer Vest', 'top', 'puffer', ['#e07a2c', '#2b2340'], 8, { sleeves: 'long', sleeveCol: 'inner', inner: '#3a3f47' }),
  P('puffer-navy', 'Navy Puffer Vest', 'top', 'puffer', ['#2b3a5e', '#c9a24a'], 8, { sleeves: 'long', sleeveCol: 'inner', inner: '#8a8f98' }),
  P('sweater-pine', 'Pine Sweater', 'top', 'sweater', ['#efe4cc', '#2f6b4a'], 7, { sleeves: 'long' }),
  P('sweater-holly', 'Holly Sweater', 'top', 'sweater', ['#b8372e', '#fbf7ee'], 7, { sleeves: 'long' }),
  P('denim-jacket', 'Denim Jacket', 'top', 'denimjacket', ['#3f5f8f', '#c9a24a'], 8, { sleeves: 'long', inner: '#fbf7ee', deco: true }),
  // bottoms and dresses (8)
  P('jeans-blue', 'Blue Jeans', 'bot', 'jeans', ['#3f5f8f', '#93a9c9'], 6, { legs: 'pants' }),       // (cols[1]: the rolled cuffs' lighter inside; the stitching is baked brass)
  P('jeans-black', 'Black Jeans', 'bot', 'jeans', ['#2b2b30', '#5a5a64'], 6, { legs: 'pants' }),
  P('overalls-denim', 'Denim Overalls', 'bot', 'overalls', ['#3f5f8f', '#93a9c9'], 7, { legs: 'pants', deco: true }),
  P('overalls-tan', 'Tan Overalls', 'bot', 'overalls', ['#c9a26b', '#e3cfa6'], 7, { legs: 'pants', deco: true }),
  P('cargo-khaki', 'Khaki Cargo Shorts', 'bot', 'cargoshorts', ['#c9b58a', '#6b4428'], 5, { legs: 'shorts' }),
  P('cargo-olive', 'Olive Cargo Shorts', 'bot', 'cargoshorts', ['#6f7a4a', '#3a3028'], 5, { legs: 'shorts' }),
  P('sundress-yellow', 'Yellow Sundress', 'bot', 'sundress', ['#f0c24f', '#fbf7ee'], 7, { legs: 'dress' }),
  P('sundress-sky', 'Sky Sundress', 'bot', 'sundress', ['#7fb8d8', '#fbf7ee'], 7, { legs: 'dress' }),
  // shoes (6)
  P('boots-brown', 'Brown Hiking Boots', 'shoe', 'boots', ['#6b4428', '#c9a24a'], 6),
  P('boots-black', 'Black Boots', 'shoe', 'boots', ['#2b2b30', '#8a8f98'], 6),
  P('sneakers-red', 'Red Sneakers', 'shoe', 'sneakers', ['#c7392f', '#fbf7ee'], 4),
  P('sneakers-blue', 'Blue Sneakers', 'shoe', 'sneakers', ['#3f8fd9', '#fbf7ee'], 4),
  P('sneakers-neon', 'Neon Sneakers', 'shoe', 'sneakers', ['#2b2b30', '#7ddc7a'], 5),
  P('sandals-tan', 'Tan Sandals', 'shoe', 'sandals', ['#c9a26b', '#6b4428'], 4, { deco: true }),
  // accessories (6)
  P('glasses-tortoise', 'Round Tortoise Glasses', 'acc', 'glassesround', ['#8a5a30'], 3, { where: 'head' }),
  P('glasses-black', 'Square Black Glasses', 'acc', 'glassessquare', ['#2b2b30'], 3, { where: 'head' }),
  P('scarf-red', 'Red Knit Scarf', 'acc', 'scarf', ['#c7392f', '#f1e5d0'], 4, { where: 'chest' }),
  P('scarf-stripe', 'Striped Scarf', 'acc', 'scarf', ['#3f6fa8', '#f0c24f'], 4, { where: 'chest' }),
  P('backpack-green', 'Green Backpack', 'acc', 'backpack', ['#3f7a4f', '#c9a24a'], 5, { where: 'chest' }),
  P('backpack-navy', 'Navy Backpack', 'acc', 'backpack', ['#2b3a5e', '#e07a2c'], 5, { where: 'chest' }),
];
// the hat models' domes as build_clothes.py makes them: rim = the dome's edge as polar angles from the crown [front, side, back], gap = how
// far the dome stands over the hair's shell (head radii). The hair under a hat is built flattened inside this (bodies-gear.js buildHair's
// cover), so nothing pokes through: the tuck goes as deep as the hat does (the code beanie's cover stopped higher than our beanie's rim)
export const HAT_RIM = { beanie: { rim: [1.5, 1.62, 1.78], gap: 0.075 }, cap: { rim: [1.15, 1.32, 1.5], gap: 0.065 }, sunhat: { rim: [1.05, 1.25, 1.45], gap: 0.065, wide: true }, bucket: { rim: [1.2, 1.35, 1.5], gap: 0.065 }, trapper: { rim: [1.42, 1.5, 1.66], gap: 0.08 } };
const BY_ID = new Map(PIECES.map(p => [p.id, p]));
export const pieceOf = id => (typeof id === 'string' && BY_ID.get(id)) || null;
export const byKind = kind => PIECES.filter(p => p.kind === kind);
export const FOR_SALE = PIECES.filter(p => !p.deco);   // what the weekly stock is drawn from
export const DECO = PIECES.filter(p => !!p.deco);      // store dressing only

// ---- the week (US Eastern, the rule since 2007; no Intl, so a server and a browser never disagree)
export const WEEK0 = Date.UTC(2026, 10, 1);   // Sunday 1 November 2026 (an Eastern calendar date, as UTC midnight)
const H = 3600e3, DAY = 864e5;
const sundayOf = (y, mo, nth) => 1 + ((7 - new Date(Date.UTC(y, mo - 1, 1)).getUTCDay()) % 7) + (nth - 1) * 7;
const dst = new Map();
function offsetAt(ms) {
  const y = new Date(ms).getUTCFullYear();
  let s = dst.get(y);
  if (!s) { s = [Date.UTC(y, 2, sundayOf(y, 3, 2), 7), Date.UTC(y, 10, sundayOf(y, 11, 1), 6)]; dst.set(y, s); }
  return ms >= s[0] && ms < s[1] ? -4 * H : -5 * H;
}
export const easternDayOf = ms => Math.floor((ms + offsetAt(ms)) / DAY);
export const weekOf = ms => Math.floor((easternDayOf(ms) - WEEK0 / DAY) / 7);
export function weekStart(week) { const d = WEEK0 + week * 7 * DAY; return d - offsetAt(d + 5 * H); }
export const weekEnd = week => weekStart(week + 1);

// ---- the stock: a hash of the week, the same everywhere (CLAUDE.md: never Math.random for anything shared)
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// each kind's pieces in a fixed shuffled order (seeded by the kind's name); a week takes the next STOCK_PER_KIND of them along that
// ring, so the whole list goes by before anything comes round again. Within the week's seven the order is the week's own shuffle
const RING = {};
for (const k of KINDS) {
  const list = byKind(k).filter(p => !p.deco).map(p => p.id), r = mulberry32(hashStr('peak-threads:' + k));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  RING[k] = list;
}
export function stockOf(week) {
  const w = Math.floor(Number.isFinite(week) ? week : 0), out = [];
  for (const k of KINDS) {
    const ring = RING[k], n = STOCK_PER_KIND[k];
    for (let i = 0; i < n; i++) out.push(ring[(((w * n + i) % ring.length) + ring.length) % ring.length]);
  }
  const r = mulberry32((w * 2654435761 + 97) >>> 0);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// a look's worn pieces by kind (ids the catalogue knows; anything else is dropped)
export function wornOf(look) {
  const out = {};
  for (const k of KINDS) { const id = look && look[SLOT_KEY[k]]; const p = pieceOf(id); out[k] = p && p.kind === k ? id : null; }
  return out;
}
export const isDress = id => { const p = pieceOf(id); return !!p && p.kind === 'bot' && p.legs === 'dress'; };
