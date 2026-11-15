// The Missing Pie: the cards, the town map, the notebook solver and the bots. No imports (the engine imports this file).
// A bot sees only its own view (view() of the engine, with its legal `moves`) and picks one of them.
//   chooseMove(view, level, rng?) -> one of view.moves, or null
// Levels:
//   easy    wanders and asks at random half the time (else as normal), accuses only when its own cards and the cards shown to it leave one answer each
//   normal  the same notes, asks about cards it has not seen, heads for places it has not seen, accuses when sure
//   hard    also reads everyone else's asks: who could not show holds none of the three, who showed holds one of them,
//           hand sizes fill in the rest; asks with its own cards to pin down one thing at a time, takes the bus
export const LEVELS = ['easy', 'normal', 'hard'];

// ---- the cards (ids are what moves and views carry; the client has its own names and pictures for them)
export const WHO = ['pudding', 'sprocket', 'fig', 'quill', 'brine', 'marmalade'];
export const WHAT = ['basket', 'net', 'barrow', 'kite', 'lunchbox', 'umbrella'];
// the places, in map order: the ring from the top left corner going clockwise, then the Picnic Lawn in the middle
export const WHERE = ['games', 'fish', 'post', 'crib', 'tower', 'fountain', 'lovecraft', 'bus', 'lawn'];
export const CARDS = [...WHO, ...WHAT, ...WHERE];
export const CAT = c => (WHO.includes(c) ? 'who' : WHAT.includes(c) ? 'what' : WHERE.includes(c) ? 'where' : null);
export const LAWN = 8;

// ---- the town map: paths between places with their steps, and the two Bus Route shortcuts (corner to opposite corner)
export const PATHS = [
  [0, 1, 3], [1, 2, 3], [2, 3, 2], [3, 4, 3], [4, 5, 3], [5, 6, 2], [6, 7, 3], [7, 0, 2], // the ring
  [8, 1, 3], [8, 3, 3], [8, 5, 3], [8, 7, 3],                                         // lanes to the Picnic Lawn
];
export const BUS = { 0: 4, 4: 0, 2: 6, 6: 2 };
export const DIST = (() => {
  const N = WHERE.length, d = [];
  for (let i = 0; i < N; i++) { d.push(new Array(N).fill(99)); d[i][i] = 0; }
  for (const [a, b, s] of PATHS) { d[a][b] = s; d[b][a] = s; }
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
  return d;
})();

// ---- the notebook solver: what one seat can know. K[card][owner] is 1 (holds it), 0 (does not) or null (not known).
// Owners are the seats 0..n-1 and the Pie Tin (n). info: { n, me, counts, hand, seen, log, accusations }
// full false: only your own cards and the cards shown to you (no reading of other people's asks).
export function solve(info, full = true) {
  const { n, me } = info, O = n + 1, C = CARDS.length;
  const K = CARDS.map(() => new Array(O).fill(null));
  const idx = c => CARDS.indexOf(c);
  let changed = true, bad = false;
  const set = (c, o, val) => { if (K[c][o] === val) return; if (K[c][o] !== null) { bad = true; return; } K[c][o] = val; changed = true; };
  const mine = new Set(info.hand || []);
  if (me !== null && me !== undefined) for (let c = 0; c < C; c++) set(c, me, mine.has(CARDS[c]) ? 1 : 0);
  for (const s of info.seen || []) set(idx(s.card), s.by, 1);
  const clauses = [], triples = [];
  if (full) {
    for (const e of info.log || []) {
      const three = [idx(e.who), idx(e.what), idx(e.where)];
      for (const p of e.passed || []) for (const c of three) set(c, p, 0);
      if (e.by !== null && e.by !== undefined && e.seat !== me) clauses.push([e.by, three]);
    }
    for (const a of info.accusations || []) triples.push([idx(a.who), idx(a.what), idx(a.where)]);
  }
  const sizes = info.counts ? [...info.counts, 3] : null;
  const groups = [[0, 6], [6, 12], [12, 21]];
  for (let guard = 0; changed && guard < 60; guard++) {
    changed = false;
    for (let c = 0; c < C; c++) {
      const row = K[c];
      if (row.includes(1)) { for (let o = 0; o < O; o++) if (row[o] === null) set(c, o, 0); continue; }
      const open = []; for (let o = 0; o < O; o++) if (row[o] !== 0) open.push(o);
      if (open.length === 1) set(c, open[0], 1);
    }
    for (const [a, b] of groups) { // one of each kind in the tin
      let ones = 0; const open = [];
      for (let c = a; c < b; c++) { if (K[c][n] === 1) ones++; if (K[c][n] !== 0) open.push(c); }
      if (ones === 1) for (let c = a; c < b; c++) if (K[c][n] === null) set(c, n, 0);
      if (open.length === 1) set(open[0], n, 1);
    }
    if (full && sizes) for (let o = 0; o < O; o++) {
      let ones = 0, nul = 0;
      for (let c = 0; c < C; c++) { if (K[c][o] === 1) ones++; else if (K[c][o] === null) nul++; }
      if (o === n) continue; // (the tin is counted per kind above)
      if (ones === sizes[o] && nul) for (let c = 0; c < C; c++) if (K[c][o] === null) set(c, o, 0);
      if (ones + nul === sizes[o] && nul) for (let c = 0; c < C; c++) if (K[c][o] === null) set(c, o, 1);
    }
    for (const [o, three] of clauses) {
      if (three.some(c => K[c][o] === 1)) continue;
      const open = three.filter(c => K[c][o] !== 0);
      if (open.length === 1) set(open[0], o, 1);
    }
    for (const t of triples) { const sure = t.filter(c => K[c][n] === 1); if (sure.length === 2) for (const c of t) if (K[c][n] === null) set(c, n, 0); }
  }
  const cand = groups.map(([a, b]) => CARDS.slice(a, b).filter((x, i) => K[a + i][n] !== 0));
  return { K, cand: { who: cand[0], what: cand[1], where: cand[2] }, bad };
}

// ---- helpers
function hash01(...xs) {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ ((x | 0) + 0x9e37), 16777619); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// a steady rng for this moment of this seat (a bot asked twice about the same moment answers the same)
function viewRng(v) {
  const xs = [v.seat, v.turnNo, (v.log || []).length, v.roll || 0, v.stage.length];
  for (const c of v.hand || []) xs.push(CARDS.indexOf(c));
  return rngFrom(Math.floor(hash01(...xs) * 4294967296));
}
const pick = (a, rng) => a[Math.floor(rng() * a.length) % a.length];

function knowledge(v, lv) {
  return solve({ n: v.n, me: v.seat, counts: v.counts, hand: v.hand, seen: v.seen, log: v.log, accusations: v.accusations }, lv === 'hard');
}

// the place a bot wants to ask in: a place card still in the running (hard: the nearest; when the place is known, any place
// where it can name its own place card or the answer)
function wantedPlaces(v, k, lv) {
  const cand = k.cand.where.map(p => WHERE.indexOf(p));
  if (lv === 'hard' && cand.length === 1) {
    const own = (v.hand || []).filter(c => CAT(c) === 'where').map(p => WHERE.indexOf(p));
    return [...own, cand[0]];
  }
  return cand;
}

export function chooseMove(v, level = 'normal', rng) {
  const moves = v && v.moves;
  if (!moves || !moves.length || v.seat === null || v.seat === undefined) return null;
  const lv = LEVELS.includes(level) ? level : 'normal';
  const R = rng || viewRng(v);
  const has = t => moves.filter(m => m.type === t);
  // showing a card to someone who asked
  const shows = has('show');
  if (shows.length) return chooseShow(v, shows, lv, R);
  if (v.phase !== 'play' || v.turn !== v.seat) return null;
  const k = knowledge(v, lv === 'hard' ? 'hard' : 'normal');
  const sure = k.cand.who.length === 1 && k.cand.what.length === 1 && k.cand.where.length === 1 && !k.bad;
  if (sure && has('accuse').length) {
    const m = moves.find(x => x.type === 'accuse' && x.who === k.cand.who[0] && x.what === k.cand.what[0] && x.where === k.cand.where[0]);
    if (m) return m;
  }
  const here = WHERE.indexOf(v.pos[v.seat]);
  const want = wantedPlaces(v, k, lv);
  const asks = has('ask');
  if (v.stage === 'roll') {
    // pulled here by someone's ask: stay and ask, if this place is worth it
    if (asks.length && (lv === 'easy' ? R() < 0.5 : want.includes(here))) return chooseAsk(v, asks, k, lv, R);
    const bus = has('bus')[0];
    if (bus && lv !== 'easy') {
      const to = BUS[here], near = p => Math.min(99, ...want.map(w => DIST[p][w]));
      if (want.includes(to) || near(to) + 3 < near(here)) return bus;
    }
    return has('roll')[0] || moves[0];
  }
  if (v.stage === 'move') {
    const gos = has('go');
    if (!gos.length) return has('end')[0] || moves[0];
    if (lv === 'easy' && R() < 0.5) return pick(gos, R); // (wanders half the time)
    const near = p => Math.min(99, ...want.map(w => DIST[p][w]));
    let best = null, bs = Infinity;
    for (const m of gos) {
      const p = WHERE.indexOf(m.place);
      const s = (want.includes(p) ? 0 : 10 + near(p)) + R() * 0.5;
      if (s < bs) { bs = s; best = m; }
    }
    return best;
  }
  if (v.stage === 'ask' && asks.length) return chooseAsk(v, asks, k, lv, R);
  return has('end')[0] || moves[0];
}

function chooseAsk(v, asks, k, lv, R) {
  if (lv === 'easy' && R() < 0.4) return pick(asks, R); // (asks at random now and then)
  const hand = new Set(v.hand || []);
  const choose = (cat, list) => {
    const cand = k.cand[cat];
    if (lv === 'hard' && cand.length === 1) {
      // known: name one of your own cards (or the answer) so any card shown is about the other things
      const own = list.filter(c => hand.has(c));
      return own.length ? pick(own, R) : cand[0];
    }
    if (lv === 'hard') {
      // the candidate fewest people are known not to hold is the one most likely to be shown: ask about the least clear one
      const open = c => { const row = k.K[CARDS.indexOf(c)]; return row.filter(x => x === null).length; };
      const best = Math.max(...cand.map(open));
      return pick(cand.filter(c => open(c) === best), R);
    }
    return pick(cand.length ? cand : list, R);
  };
  const who = choose('who', WHO), what = choose('what', WHAT);
  return asks.find(m => m.who === who && m.what === what) || pick(asks, R);
}

function chooseShow(v, shows, lv, R) {
  if (shows.length === 1 || lv === 'easy') return shows[0];
  if (lv === 'normal') return pick(shows, R);
  const to = v.pending ? v.pending.asker : -1, mine = v.showed || [];
  const toThem = shows.find(m => mine.some(x => x.to === to && x.card === m.card));
  if (toThem) return toThem;
  // else the card already shown the most (others may know it), else a place card (the biggest group, the least telling)
  let best = shows[0], bs = -1;
  for (const m of shows) {
    const s = mine.filter(x => x.card === m.card).length * 10 + (CAT(m.card) === 'where' ? 2 : 0) + R() * 0.1;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}
