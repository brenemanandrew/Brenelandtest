// Hearthfield's bots. A bot sees only its view (the meadow's shape comes from the shared board file) and picks one of view.moves.
// Deterministic for the same view (no rng needed).
// Levels:
//   easy    homes on rich corners in a plain way, builds whatever it can afford first, trades with the carts only from a big pile,
//           shoos Rascal only off its own fields, says yes to any swap that gives it a card it is short of
//   normal  values corners by dice odds and variety, picks a goal (hall, cottage, lane toward a good corner, favour) and trades
//           with the carts toward it, one swap offer a turn, puts Rascal on the field that hurts others most
//   hard    weighs what it is short of (berries and stone for halls), likes corners with room to grow and a cart that fits,
//           races halls, keeps under the raid limit, chases the Grand Parade and the Critter Keeper when close, aims Rascal and its
//           nabs at the leader, offers fair 1-for-1 and 2-for-1 swaps and never helps someone about to win
// Tuned by self-play (tools/hearthfield-test.mjs).
import { GEO } from './hearthfield-board.js';

export const LEVELS = ['easy', 'normal', 'hard'];
const RES = ['timber', 'clay', 'wool', 'berries', 'stone'];
const RI = { timber: 0, clay: 1, wool: 2, berries: 3, stone: 4 };
const COST = { lane: [1, 1, 0, 0, 0], cottage: [1, 1, 1, 1, 0], hall: [0, 1, 0, 2, 2], favour: [0, 0, 1, 1, 1] };
const ways = n => (n >= 2 && n <= 12 && n !== 7 ? 6 - Math.abs(7 - n) : 0);
const sum = a => a.reduce((x, y) => x + y, 0);
const missing = (hand, cost) => cost.reduce((m, c, r) => m + Math.max(0, c - hand[r]), 0);
const NV = GEO.v.length;
const myHomes = (v, me) => v.own.filter(o => o === me).length;

// expected cards per roll for seat s by kind (Rascal's field gives nothing)
function income(v, s) {
  const inc = [0, 0, 0, 0, 0];
  GEO.hex.forEach((h, i) => {
    const t = v.tiles[i]; if (!t.res || i === v.raccoon) return;
    for (const x of h.v) if (v.own[x] === s) inc[RI[t.res]] += ways(t.num) / 36 * (v.hall[x] ? 2 : 1);
  });
  return inc;
}
// what a kind is worth to me: more for what I make little of (hard leans on berries and stone for halls)
function weights(v, me, lv) {
  const inc = income(v, me), w = [1, 1, 0.9, 1, 0.95];
  if (lv === 'easy') return [1, 1, 1, 1, 1];
  for (let r = 0; r < 5; r++) w[r] *= 1 + 0.9 / (1 + 8 * inc[r]);
  if (lv === 'hard') { w[3] *= 1.12; w[4] *= 1.18; w[2] *= 0.92; }
  return w;
}
const freeSpot = (v, x) => v.own[x] < 0 && GEO.v[x].adj.every(u => v.own[u] < 0);
function myCarts(v, me) {
  const out = new Set();
  v.ports.forEach((e, k) => { const E = GEO.e[e]; if (v.own[E.a] === me || v.own[E.b] === me) out.add(v.carts[k]); });
  return out;
}
// a corner's worth to me
function spotScore(v, me, x, lv, w) {
  let s = 0; const kinds = new Set(), inc = income(v, me);
  for (const h of GEO.v[x].hexes) {
    const t = v.tiles[h]; if (!t.res) continue;
    s += ways(t.num) * w[RI[t.res]] * (h === v.raccoon ? 0.6 : 1);
    kinds.add(t.res);
  }
  if (lv === 'easy') return s;
  s += kinds.size * (lv === 'hard' ? 1.4 : 1);
  // a cart here: an 'any' cart is handy; a 2:1 cart is worth it if I make that kind
  const k = v.ports.findIndex(e => GEO.e[e].a === x || GEO.e[e].b === x);
  if (k >= 0) { const c = v.carts[k]; s += c === 'any' ? 1.5 : 1 + 14 * inc[RI[c]]; }
  if (lv === 'hard') { // room to grow: free corners two lanes away
    let room = 0;
    for (const u of GEO.v[x].adj) for (const y of GEO.v[u].adj) if (y !== x && freeSpot(v, y) && !GEO.v[x].adj.includes(y)) room++;
    s += Math.min(room, 4) * 0.35;
  }
  return s;
}

// the corners my lanes can reach: distance in lanes from my network, through free sides and corners no one else holds
function reach(v, me) {
  const dist = new Array(NV).fill(Infinity), first = new Array(NV).fill(-1), q = [];
  for (let x = 0; x < NV; x++) {
    const mine = v.own[x] === me || (v.own[x] < 0 && GEO.v[x].edges.some(e => v.lanes[e] === me));
    if (mine) { dist[x] = 0; q.push(x); }
  }
  for (let i = 0; i < q.length; i++) {
    const x = q[i];
    if (dist[x] >= 4) continue;
    if (v.own[x] >= 0 && v.own[x] !== me) continue;
    for (const e of GEO.v[x].edges) {
      if (v.lanes[e] >= 0) continue;
      const E = GEO.e[e], y = E.a === x ? E.b : E.a;
      if (dist[y] <= dist[x] + 1) continue;
      dist[y] = dist[x] + 1; first[y] = dist[x] === 0 ? e : first[x]; q.push(y);
    }
  }
  return { dist, first };
}
// the best corner to grow toward and the first lane on the way (or null)
function target(v, me, lv, w) {
  const { dist, first } = reach(v, me);
  let best = null, bs = -Infinity;
  for (let x = 0; x < NV; x++) {
    if (!freeSpot(v, x) || dist[x] === Infinity || dist[x] === 0 || dist[x] > 3) continue;
    const s = spotScore(v, me, x, lv, w) / (1 + (lv === 'hard' ? 0.55 : 0.75) * (dist[x] - 1));
    if (s > bs) { bs = s; best = { x, e: first[x], d: dist[x], s }; }
  }
  return best;
}
const connectedSpots = (v, me) => { const out = []; for (let x = 0; x < NV; x++) if (freeSpot(v, x) && GEO.v[x].edges.some(e => v.lanes[e] === me)) out.push(x); return out; };

// the goal: what to save for now
function goalOf(v, me, lv, w) {
  const hand = v.hand, left = v.left[me], out = [];
  const myCot = []; for (let x = 0; x < NV; x++) if (v.own[x] === me && !v.hall[x]) myCot.push(x);
  if (myCot.length && left.hall > 0) out.push({ goal: 'hall', pri: lv === 'hard' ? 3.4 : 3 });
  const spots = connectedSpots(v, me);
  if (spots.length && left.cottage > 0) out.push({ goal: 'cottage', pri: 3 });
  else if (left.lane > 0 && left.cottage > 0) { const t = target(v, me, lv, w); if (t) out.push({ goal: 'lane', pri: (lv === 'hard' && myHomes(v, me) < 4 ? 3.2 : 2.2) - 0.25 * (t.d - 1), t }); }
  if (lv === 'hard' && left.lane > 0) { // the Grand Parade within reach
    const mine = v.laneLen[me], top = Math.max(...v.laneLen.filter((x, s) => s !== me));
    if (v.parade !== me && mine >= 3 && mine + 2 >= Math.max(5, top + 1)) out.push({ goal: 'lane', pri: 3.1, parade: true });
  }
  if (v.deck > 0) out.push({ goal: 'favour', pri: lv === 'hard' ? 1.7 : 1.3 });
  if (!out.length) return null;
  for (const g of out) g.score = g.pri - missing(hand, COST[g.goal]) * 0.75;
  out.sort((a, b) => b.score - a.score);
  return out[0];
}

export function chooseMove(v, level = 'normal') {
  const moves = v && v.moves;
  if (!moves || !moves.length || v.seat === null || v.seat === undefined) return null;
  const lv = LEVELS.includes(level) ? level : 'normal', me = v.seat, w = weights(v, me, lv);
  const all = t => moves.filter(m => m.type === t), one = t => moves.find(m => m.type === t);
  switch (v.stage) {
    case 'setupHome': return setupHome(v, me, lv, w);
    case 'setupLane': return setupLane(v, me, lv, w);
    case 'discard': return dropMove(v, me, lv, w);
    case 'raccoon': return raccoonMove(v, me, lv);
    case 'nab': return nabMove(v, me, lv);
    case 'basket': return basketMove(v, me, lv, w);
    case 'beavers': { const t = target(v, me, lv, w); return (t && moves.find(m => m.type === 'lane' && m.e === t.e)) || paradeLane(v, me, lv) || one('done'); }
    case 'offer': return answer(v, me, lv, w) ? one('accept') || one('decline') : one('decline');
    case 'trade': return draftMove(v, me, lv, w);
    case 'roll': {
      const wr = moves.find(m => m.type === 'use' && m.card === 'wrangler');
      if (wr && wantWrangler(v, me, lv)) return wr;
      return one('roll');
    }
    case 'main': return mainMove(v, me, lv, w, all, one);
    default: return moves[0];
  }
}

// ---------------------------------------------------------------- setup
function setupHome(v, me, lv, w) {
  const cands = v.moves.filter(m => m.type === 'home');
  if (lv === 'easy') { const k = Math.min(cands.length - 1, (me * 3 + (v.setupLeft || 0)) % 4); return cands[k]; }
  // the second cottage leans toward kinds the first does not make
  let best = cands[0], bs = -Infinity;
  for (const m of cands.slice(0, 40)) {
    const s = spotScore(v, me, m.v, lv, w);
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}
function setupLane(v, me, lv, w) {
  const cands = v.moves.filter(m => m.type === 'lane');
  if (lv === 'easy') return cands[0];
  let best = cands[0], bs = -Infinity;
  for (const m of cands) {
    const E = GEO.e[m.e], y = E.a === v.lastHome ? E.b : E.a;
    let s = 0;
    for (const z of GEO.v[y].adj) if (z !== v.lastHome && freeSpot(v, z)) s = Math.max(s, spotScore(v, me, z, lv, w));
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}

// ---------------------------------------------------------------- the raid
function dropMove(v, me, lv, w) {
  const hand = v.hand.slice(), g = goalOf(v, me, lv, w), cost = g ? COST[g.goal] : [0, 0, 0, 0, 0];
  let best = v.moves[0], bs = -Infinity;
  for (const m of v.moves) {
    const r = RI[m.res];
    if (lv === 'easy') { if (hand[r] > bs) { bs = hand[r]; best = m; } continue; }
    const s = hand[r] - cost[r] * 1.5 - w[r] * 0.5;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}
function lead(v, me) { let k = -1, p = -1; for (let s = 0; s < v.n; s++) if (s !== me && (v.points[s] > p || (v.points[s] === p && v.cards[s] > v.cards[k]))) { p = v.points[s]; k = s; } return k; }
function raccoonMove(v, me, lv) {
  const cands = v.moves.filter(m => m.type === 'raccoon');
  const L = lead(v, me);
  let best = cands[0], bs = -Infinity;
  for (const m of cands) {
    const h = GEO.hex[m.hex], t = v.tiles[m.hex];
    const mine = h.v.some(x => v.own[x] === me);
    if (lv === 'easy') { if (!mine && t.res) return m; continue; }
    let s = mine ? -50 : 0;
    for (const x of h.v) {
      const o = v.own[x]; if (o < 0 || o === me) continue;
      const k = (v.hall[x] ? 2 : 1) * ways(t.num), pts = v.points[o];
      s += k * (lv === 'hard' ? 1 + 0.35 * pts + (o === L ? 1.2 : 0) : 1) + (v.cards[o] > 0 ? 1 : 0);
    }
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}
function nabMove(v, me, lv) {
  const cands = v.moves.filter(m => m.type === 'nab');
  let best = cands[0], bs = -Infinity;
  for (const m of cands) {
    const k = m.seat, s = lv === 'hard' ? v.points[k] * 3 + v.cards[k] : lv === 'normal' ? v.cards[k] : -k;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}
function wantWrangler(v, me, lv) {
  const onMine = GEO.hex[v.raccoon].v.some(x => v.own[x] === me) && !!v.tiles[v.raccoon].res;
  if (onMine) return true;
  if (lv !== 'hard') return false;
  // the Critter Keeper: two played and nobody far ahead
  const kp = v.keeper >= 0 ? v.played[v.keeper] : 2;
  if (v.keeper !== me && v.played[me] + 1 >= 3 && v.played[me] + 1 > kp) return true;
  return v.points[lead(v, me)] >= v.target - 3;
}

// ---------------------------------------------------------------- favour cards
function basketMove(v, me, lv, w) {
  const g = goalOf(v, me, lv, w), cost = g ? COST[g.goal] : COST.cottage;
  let best = v.moves[0], bs = -Infinity;
  for (const m of v.moves) { const r = RI[m.res], s = Math.max(0, cost[r] - v.hand[r]) * 3 + w[r]; if (s > bs) { bs = s; best = m; } }
  return best;
}
// the longest run of seat s's lanes in this lane list (another player's home breaks it)
function runOf(v, s, lanes) {
  const mine = []; for (let e = 0; e < lanes.length; e++) if (lanes[e] === s) mine.push(e);
  if (!mine.length) return 0;
  let best = 0; const used = new Set();
  const dfs = (x, len) => {
    if (len > best) best = len;
    if (v.own[x] >= 0 && v.own[x] !== s && len > 0) return;
    for (const e of GEO.v[x].edges) { if (lanes[e] !== s || used.has(e)) continue; used.add(e); const E = GEO.e[e]; dfs(E.a === x ? E.b : E.a, len + 1); used.delete(e); }
  };
  const starts = new Set(); for (const e of mine) { starts.add(GEO.e[e].a); starts.add(GEO.e[e].b); }
  for (const x of starts) dfs(x, 0);
  return best;
}
// a lane that makes my longest run longer (the best such, toward a good corner when tied)
function paradeLane(v, me, lv) {
  if (lv !== 'hard') return null;
  const cur = v.laneLen[me];
  let best = null;
  for (const m of v.moves) {
    if (m.type !== 'lane') continue;
    const L = v.lanes.slice(); L[m.e] = me;
    if (runOf(v, me, L) > cur) { best = m; break; }
  }
  return best;
}

// ---------------------------------------------------------------- your turn
function bestHome(v, me, lv, w, list) { let b = list[0], bs = -Infinity; for (const m of list) { const s = spotScore(v, me, m.v, lv, w); if (s > bs) { bs = s; b = m; } } return b; }
function bestHall(v, me, w, list) {
  let b = list[0], bs = -Infinity;
  for (const m of list) { let s = 0; for (const h of GEO.v[m.v].hexes) { const t = v.tiles[h]; if (t.res && h !== v.raccoon) s += ways(t.num) * w[RI[t.res]]; } if (s > bs) { bs = s; b = m; } }
  return b;
}
function mainMove(v, me, lv, w, all, one) {
  const hand = v.hand, moves = v.moves;
  const halls = all('hall'), homes = all('home'), lanes = all('lane');
  if (lv === 'easy') {
    if (halls.length) return halls[0];
    if (homes.length) return homes[0];
    const t = target(v, me, lv, w);
    if (t && lanes.length && homes.length === 0 && connectedSpots(v, me).length === 0) { const m = lanes.find(x => x.e === t.e); if (m) return m; }
    if (one('favour') && sum(hand) >= 7) return one('favour');
    const wr = moves.find(m => m.type === 'use' && m.card === 'wrangler'); if (wr && wantWrangler(v, me, lv)) return wr;
    const ba = moves.find(m => m.type === 'use' && m.card === 'basket'); if (ba) return ba;
    for (const m of all('bank')) if (hand[RI[m.give]] >= 6 && hand[RI[m.get]] === 0) return m;
    return one('end');
  }
  if (halls.length) return bestHall(v, me, w, halls);
  if (homes.length) return bestHome(v, me, lv, w, homes);
  const g = goalOf(v, me, lv, w);
  // a lane toward the goal corner (or for the parade)
  if (lanes.length && g && g.goal === 'lane') {
    if (g.parade) { const m = paradeLane(v, me, lv); if (m) return m; }
    if (g.t) { const m = lanes.find(x => x.e === g.t.e); if (m) return m; }
  }
  // favour cards to play
  for (const m of moves) {
    if (m.type !== 'use') continue;
    if (m.card === 'wrangler' && wantWrangler(v, me, lv)) return m;
    if (m.card === 'basket') return m;
    if (m.card === 'beavers' && g && (g.goal === 'lane' || connectedSpots(v, me).length === 0)) return m;
    if (m.card === 'market' && g && missing(hand, COST[g.goal]) >= 2 && sum(hand) - sum(COST[g.goal]) >= 4) return m;
  }
  if (one('favour') && g && (g.goal === 'favour' || (lv === 'hard' && sum(hand) >= 8))) return one('favour');
  // carts: toward the goal
  if (g) { const b = cartTrade(v, me, lv, w, g); if (b) return b; }
  // a swap offer
  if (v.settings.trades && g) {
    const p = plan(v, me, lv, w);
    if (p && v.offers < (lv === 'hard' ? 3 : 1)) { const m = moves.find(x => x.type === 'trade' && x.to === p.to); if (m) return m; }
  }
  // hard: over the raid limit at the end of the turn, spend
  if (lv === 'hard' && sum(hand) >= 9) {
    if (one('favour')) return one('favour');
    const bm = all('bank'); if (bm.length) { const g2 = g ? COST[g.goal] : COST.cottage; return bm.slice().sort((a, b) => (hand[RI[b.give]] - g2[RI[b.give]]) - (hand[RI[a.give]] - g2[RI[a.give]]) || (g2[RI[b.get]] - hand[RI[b.get]]) - (g2[RI[a.get]] - hand[RI[a.get]]))[0]; }
  }
  return one('end');
}
// a cart swap that brings the goal closer: give a kind I have spare (after the goal), get one I lack
function cartTrade(v, me, lv, w, g) {
  const hand = v.hand, cost = COST[g.goal];
  if (!missing(hand, cost)) return null;
  let best = null, bs = -Infinity;
  for (const m of v.moves) {
    if (m.type !== 'bank') continue;
    const r = RI[m.give], k = RI[m.get], rate = v.rates[r];
    if (cost[k] <= hand[k]) continue;
    if (hand[r] - rate < cost[r]) continue;
    // after the swap the goal must still be within reach of this turn's cards (or the swap is from a big pile)
    const after = hand.slice(); after[r] -= rate; after[k]++;
    if (missing(after, cost) > missing(hand, cost) - 1) continue;
    const spare = hand[r] - cost[r] - rate;
    const s = spare * 2 - w[r] - rate + w[k];
    if (lv === 'normal' && rate === 4 && missing(after, cost) > 1 && hand[r] < 5) continue;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}

// ---------------------------------------------------------------- swaps between players
// my hand's worth toward my goals (higher is better)
function handWorth(v, me, lv, w, hand) {
  const g = goalOf({ ...v, hand }, me, lv, w), cost = g ? COST[g.goal] : COST.cottage;
  let s = -missing(hand, cost) * 6 - missing(hand, COST.cottage) * 1.5 - missing(hand, COST.hall) * 1.5;
  for (let r = 0; r < 5; r++) s += Math.min(hand[r], 3) * w[r] * 0.8;
  if (sum(hand) >= 9) s -= (sum(hand) - 8) * 1.2;
  return s;
}
const NEED = { easy: 0, normal: 0.9, hard: 1.4 };
function answer(v, me, lv, w) {
  const t = v.trade; if (!t || t.to !== me) return false;
  const after = v.hand.slice();
  for (let r = 0; r < 5; r++) { after[r] += t.give[r] - t.want[r]; if (after[r] < 0) return false; }
  const from = t.from, near = v.target - v.shown[from];
  if (lv !== 'easy' && near <= (lv === 'hard' ? 2 : 1)) return false; // never help someone about to win
  if (lv === 'easy') { const g = goalOf(v, me, 'normal', w), cost = g ? COST[g.goal] : COST.cottage; return missing(after, cost) < missing(v.hand, cost) || sum(t.give) > sum(t.want); }
  const gain = handWorth(v, me, lv, w, after) - handWorth(v, me, lv, w, v.hand);
  const give = sum(t.give), want = sum(t.want);
  return gain > NEED[lv] + (lv === 'hard' && v.shown[from] >= v.shown[me] + 2 ? 1.5 : 0) - (give > want ? 0.6 : 0);
}
const sameDeal = (d, p) => d.to === p.to && d.give.join() === p.give.join() && d.want.join() === p.want.join();
// the offer I want to make: one (or two) spare cards for one I lack, to the player who has the most cards and is not about to win
function plan(v, me, lv, w) {
  if (lv === 'easy') return null;
  if (lv === 'normal' && (v.round + me) % 2 !== 0) return null;
  const g = goalOf(v, me, lv, w); if (!g) return null;
  const cost = COST[g.goal], hand = v.hand;
  const lack = []; for (let r = 0; r < 5; r++) if (hand[r] < cost[r]) lack.push(r);
  if (!lack.length || missing(hand, cost) > (lv === 'hard' ? 3 : 1)) return null;
  lack.sort((a, b) => (cost[b] - hand[b]) - (cost[a] - hand[a]) || w[b] - w[a] || a - b);
  const spare = []; for (let r = 0; r < 5; r++) if (hand[r] > cost[r]) spare.push(r);
  if (!spare.length) return null;
  spare.sort((a, b) => (hand[b] - cost[b]) - (hand[a] - cost[a]) || w[a] - w[b] || a - b);
  // to players whose homes make the kind I lack (likely to hold it) and do not make the kind I give (likely to want it)
  const inc = [];
  for (let k = 0; k < v.n; k++) inc[k] = income(v, k);
  const cands = [];
  for (const k of [...Array(v.n).keys()]) {
    if (k === me || v.cards[k] < 3 || v.target - v.shown[k] <= 2) continue;
    if (v.declined.some(d => d.from === me && d.to === k && d.round === v.round)) continue; // (said no this round)
    for (const L of lack.slice(0, 2)) {
      if (inc[k][L] < 0.05) continue;
      for (const r of spare) {
        const s = inc[k][L] * 10 - inc[k][r] * 12 + v.cards[k] * 0.3 + (L === lack[0] ? 1 : 0) + (hand[r] - cost[r]) * 0.5;
        cands.push({ k, L, r, s });
      }
    }
  }
  cands.sort((x, y) => y.s - x.s || x.k - y.k || x.L - y.L || x.r - y.r);
  for (const c of cands) {
    const want = [0, 0, 0, 0, 0]; want[c.L] = 1;
    const offers = [];
    const give1 = [0, 0, 0, 0, 0]; give1[c.r] = 1; offers.push(give1);
    if (lv === 'hard' && hand[c.r] - cost[c.r] >= 2) { const g2 = give1.slice(); g2[c.r] = 2; offers.push(g2); }
    for (const give of offers) {
      const p = { to: c.k, give, want };
      if (v.declined.some(d => d.from === me && sameDeal(d, p) && v.round - d.round < 3)) continue;
      return p;
    }
  }
  return null;
}
function draftMove(v, me, lv, w) {
  const t = v.trade, moves = v.moves, cancel = moves.find(m => m.type === 'cancel');
  const p = plan(v, me, lv, w);
  if (!p || p.to !== t.to) return cancel;
  for (const side of ['give', 'want']) for (let r = 0; r < 5; r++) {
    const d = p[side][r] - t[side][r];
    if (d) { const m = moves.find(x => x.type === side && x.res === RES[r] && x.add === Math.sign(d)); return m || cancel; }
  }
  return moves.find(m => m.type === 'send') || cancel;
}
