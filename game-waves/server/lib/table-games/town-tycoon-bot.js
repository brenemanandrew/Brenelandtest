// Town Tycoon's bots. No imports: a bot sees only its view (the board data travels in view.board / view.groups) and picks one of
// view.moves. Deterministic for the same view (no rng needed).
// Levels:
//   easy    buys when it keeps more than B100, never builds, rolls out of the woods, raises money with the first move offered
//   normal  buys by group value, builds when it holds a pair and keeps a reserve, mortgages singles first to pay a debt,
//           pays out of the woods while it is rich
//   hard    values completing pairs and blocking other players' pairs, builds to 3 cottages fast on the best-landed groups,
//           keeps a reserve tied to the worst rent it could land on, pays out of the woods early and stays in late
// Auctions: each bids up to its own value of the place (easy low, hard high for a place that completes or blocks a pair; in a
// quick game hard takes anything under its price, as a deed counts its price at the end). Hard raises by B10 only.
// Trades: every level answers by value (easy counts prices only, normal and hard also weigh the pair they would hand over;
// hard builds faster, so it takes fair pair-for-pair swaps). Normal and easy now and then offer a swap that completes a pair
// for both; hard offers swaps and buys the half it lacks with money and its dead deeds (tool crib, a lone stop, a blocked
// street), only when it can still build 3 cottages a street after. A declined offer is not made again for a few rounds.
// Tuned by self-play (tools/town-tycoon-test.mjs): hard beats normal about 64% in 2-player full games.
export const LEVELS = ['easy', 'normal', 'hard'];

// how often each group is landed on, roughly (the spaces after the woods corner see more traffic)
const HEAT = [0.8, 0.85, 1.15, 1.2, 1.1, 1.0, 0.95, 0.9];

const groupSpaces = (v, g) => v.board.filter(b => b.kind === 'street' && b.group === g).map(b => b.i);
const groupOwner = (v, g) => { const sp = groupSpaces(v, g), o = v.owner[sp[0]]; return o >= 0 && sp.every(i => v.owner[i] === o) ? o : -1; };
const buildCost = (v, i) => (v.board[i].kind === 'street' ? v.groups[v.board[i].group].build : 0);

function rentAt(v, i) {
  const b = v.board[i], o = v.owner[i];
  if (o < 0 || v.mort[i]) return 0;
  if (b.kind === 'street') { const l = v.lvl[i]; return l > 0 ? b.rents[l] : groupOwner(v, b.group) === o ? b.rents[0] * 2 : b.rents[0]; }
  if (b.kind === 'transit') return [0, 25, 60][v.board.filter(x => x.kind === 'transit' && v.owner[x.i] === o).length];
  if (b.kind === 'tool') return 42;
  return 0;
}
// the worst rent on another player's space within 12 steps ahead of seat s
function danger(v, s, far = 12) {
  let worst = 0;
  for (let k = 1; k <= far; k++) {
    const i = (v.pos[s] + k) % v.board.length;
    if (v.owner[i] >= 0 && v.owner[i] !== s) worst = Math.max(worst, rentAt(v, i));
  }
  return worst;
}
function maxRent(v, s) {
  let worst = 0;
  for (const b of v.board) if (v.owner[b.i] >= 0 && v.owner[b.i] !== s) worst = Math.max(worst, rentAt(v, b.i));
  return worst;
}

export function chooseMove(v, level = 'normal') {
  const moves = v && v.moves;
  if (!moves || !moves.length || v.seat === null || v.seat === undefined) return null;
  const lv = LEVELS.includes(level) ? level : 'normal';
  const me = v.seat, has = t => moves.find(m => m.type === t), all = t => moves.filter(m => m.type === t);
  const cash = v.cash[me];

  if (v.stage === 'debt') return raise(v, moves, lv);
  if (v.stage === 'auction') return auctionMove(v, lv);
  if (v.stage === 'offer') return answerOffer(v, lv) ? has('accept') : has('decline');
  if (v.stage === 'trade') return draftMove(v, lv);

  if (v.stage === 'buy') {
    const i = v.buyAt, b = v.board[i], buy = has('buy');
    if (!buy) return has('skip');
    return wantBuy(v, i, b, cash, lv) ? buy : has('skip');
  }

  if (v.stage === 'woods') {
    if (lv !== 'easy') {
      if (has('map') && earlyGame(v)) return has('map');
      if (has('pay') && wantOut(v, lv, cash)) return has('pay');
    }
    // build before the roll if it makes sense
    const bm = lv !== 'easy' && pickBuild(v, lv, cash);
    if (bm) return bm;
    return has('roll');
  }

  // roll / manage: a trade first (once a turn), build or unmortgage, then roll or end
  if (v.offers < (lv === 'hard' ? 2 : 1) && has('trade')) { const p = tradePlan(v, lv); if (p && moves.some(m => m.type === 'trade' && m.to === p.to)) return moves.find(m => m.type === 'trade' && m.to === p.to); }
  if (lv !== 'easy') {
    const bm = pickBuild(v, lv, cash); if (bm) return bm;
    if (lv === 'hard') { const fm = pickFund(v, cash); if (fm) return fm; }
    const um = pickUnmortgage(v, lv, cash); if (um) return um;
  }
  return has('roll') || has('end') || moves[0];
}

// hard: mortgage a lone street (one that will never make a pair for it) to pay for cottages on a pair still under 3
function pickFund(v, cash) {
  const me = v.seat, builds = v.moves.filter(m => m.type === 'build' && v.lvl[m.space] < 3);
  if (!builds.length) return null;
  const c = Math.min(...builds.map(m => buildCost(v, m.space)));
  const reserve = Math.max(60, Math.min(500, danger(v, me) * 0.8, 0.6 * maxRent(v, me) + 60));
  let best = null, bestV = Infinity;
  for (const m of v.moves) {
    if (m.type !== 'mortgage') continue;
    const b = v.board[m.space];
    if (b.kind === 'street' && !groupSpaces(v, b.group).some(j => v.owner[j] >= 0 && v.owner[j] !== me)) continue; // could still pair up
    const val = Math.floor(b.price / 2);
    if (cash + val - c < reserve) continue;
    if (val < bestV) { bestV = val; best = m; }
  }
  return best;
}

const unowned = v => v.board.filter(b => b.price && b.kind !== 'tax' && v.owner[b.i] < 0).length;
const earlyGame = v => unowned(v) >= 6;

function wantOut(v, lv, cash) {
  if (lv === 'normal') return cash >= 300 && earlyGame(v);
  // hard: out early while there is property to buy; stay in (roll) once the board is dangerous
  const d = maxRent(v, v.seat);
  if (earlyGame(v) && cash >= 150) return true;
  return d < 100 && cash >= 400;
}

function wantBuy(v, i, b, cash, lv) {
  const left = cash - b.price, me = v.seat;
  if (lv === 'easy') return left > 100;
  if (b.kind !== 'street') {
    if (lv === 'hard') return left >= (v.settings && v.settings.auctions ? Math.max(40, 0.3 * maxRent(v, me)) : Math.max(80, 0.5 * maxRent(v, me)));
    return left >= 200;
  }
  const sp = groupSpaces(v, b.group), others = sp.filter(j => j !== i);
  const completes = others.every(j => v.owner[j] === me);
  const blocks = others.some(j => v.owner[j] >= 0 && v.owner[j] !== me);
  if (lv === 'normal') {
    if (completes) return left >= 50;
    return left >= 150;
  }
  // hard (with auctions on, a skipped place usually goes cheap to someone else: buy unless it leaves us bare)
  const reserve = v.settings && v.settings.auctions ? Math.max(30, 0.25 * maxRent(v, me)) : Math.max(40, 0.5 * maxRent(v, me));
  if (completes) return left >= 0;
  if (blocks) return left >= reserve * 0.6; // deny another player the pair
  return left >= reserve;
}

// building: normal keeps B200 spare; hard keeps a reserve tied to the worst rent ahead, and races every pair to 3 cottages
// (hottest groups first) before going higher
function pickBuild(v, lv, cash) {
  const builds = v.moves.filter(m => m.type === 'build');
  if (!builds.length) return null;
  const me = v.seat;
  let reserve;
  if (lv === 'normal') reserve = 200;
  else reserve = Math.max(120, Math.min(500, danger(v, me) * 0.8, 0.6 * maxRent(v, me) + 60));
  let best = null, bestS = -Infinity;
  for (const m of builds) {
    const i = m.space, b = v.board[i], c = buildCost(v, i), l = v.lvl[i];
    if (cash - c < reserve) continue;
    const gain = b.rents[l + 1] - (l === 0 ? b.rents[0] * 2 : b.rents[l]);
    let s = gain / c;
    if (lv === 'hard') { s *= HEAT[b.group]; if (l < 3) s += 2; }
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}
function pickUnmortgage(v, lv, cash) {
  const ms = v.moves.filter(m => m.type === 'unmortgage');
  if (!ms.length) return null;
  const need = lv === 'hard' ? 300 + maxRent(v, v.seat) * 0.5 : 400;
  for (const m of ms) {
    const price = v.board[m.space].price, cost = Math.ceil(price / 2 * 1.1);
    if (cash - cost >= need) return m;
  }
  return null;
}

// paying a debt: easy takes the first offer; others mortgage what costs least first (single streets, then transit and the tool
// crib, then sell buildings from the cheapest group, then the pairs)
function raise(v, moves, lv) {
  if (lv === 'easy') return moves[0];
  const me = v.seat;
  let best = moves[0], bestS = Infinity;
  for (const m of moves) {
    const i = m.space, b = v.board[i];
    let s;
    if (m.type === 'mortgage') {
      if (b.kind === 'street') s = groupOwner(v, b.group) === me ? 60 + b.price / 10 : 10 + b.price / 20;
      else s = 25 + b.price / 20;
      if (lv === 'hard' && b.kind === 'street' && groupSpaces(v, b.group).some(j => v.owner[j] >= 0 && v.owner[j] !== me)) s -= 5; // a blocker earns little
    } else { // sell a building
      s = 40 + (b.rents[v.lvl[i]] - b.rents[v.lvl[i] - 1]) / 20;
    }
    if (s < bestS) { bestS = s; best = m; }
  }
  return best;
}

// ---------------------------------------------------------------- auctions
const partner = (v, i) => { const b = v.board[i]; return b.kind === 'street' ? groupSpaces(v, b.group).filter(j => j !== i) : []; };
const quick = v => !!(v.settings && v.settings.length === 'quick');
// rounds still to play, as a 0..1 weight for what rent can still pay back (a long game: 1)
const horizon = v => (quick(v) ? Math.max(0, Math.min(1, (v.rounds - v.round) / 12)) : 1);
// what place i is worth to seat s at this level (a bid ceiling before the cash reserve)
function worthTo(v, s, i, lv) {
  const b = v.board[i], p = b.price;
  if (lv === 'easy') return p * 0.8;
  const others = partner(v, i);
  const completes = b.kind === 'street' && others.every(j => v.owner[j] === s);
  const blocks = b.kind === 'street' && others.some(j => v.owner[j] >= 0 && v.owner[j] !== s);
  if (lv === 'normal') {
    if (b.kind !== 'street') return p * (b.kind === 'transit' ? 0.95 : 0.9);
    return p * (completes ? 1.4 : 1.0);
  }
  // hard: in a quick game a deed counts its price at the end, so anything under the price is a gain
  const h = horizon(v);
  if (b.kind === 'transit') { const mine = v.board.some(x => x.kind === 'transit' && x.i !== i && v.owner[x.i] === s); return p * Math.max(0.97, (mine ? 1.6 : 1.1) * h); }
  if (b.kind === 'tool') return p * 0.9;
  const f = completes ? 1 + 1.0 * h : blocks ? 1 + 0.35 * h : 1 + 0.1 * h * HEAT[b.group];
  return p * Math.max(0.97, f);
}
function auctionMove(v, lv) {
  const a = v.auction, me = v.seat, cash = v.cash[me], moves = v.moves;
  const pass = moves.find(m => m.type === 'pass');
  const bids = moves.filter(m => m.type === 'bid');
  if (!bids.length) return pass;
  const reserve = lv === 'easy' ? 100 : lv === 'normal' ? 150 : Math.max(12, Math.min(90, 0.12 * maxRent(v, me) + 6));
  const ceil = Math.min(worthTo(v, me, a.space, lv), cash - reserve);
  const ok = bids.filter(m => m.amount <= ceil);
  if (!ok.length) return pass;
  // a big jump while far under the ceiling, else the smallest raise
  const room = ceil - a.bid;
  if (lv === 'hard') return room > 150 && ok.length >= 2 ? ok[1] : ok[0]; // hard creeps up by B10 near its ceiling
  if (room > 250 && ok.length >= 3) return ok[2];
  if (room > 120 && ok.length >= 2) return ok[1];
  return ok[0];
}

// ---------------------------------------------------------------- trades
const sum = a => a.reduce((x, y) => x + y, 0);
const r10 = x => Math.ceil(x / 10) * 10;
// the value of a trade t to seat me, judged at level lv (+ good for me)
function tradeValue(v, t, lv, me) {
  const inSp = t.from === me ? t.get : t.give, outSp = t.from === me ? t.give : t.get;
  const cashIn = t.from === me ? -t.cash : t.cash;
  if (lv === 'easy') { const P = i => v.board[i].price; return sum(inSp.map(P)) - sum(outSp.map(P)) + cashIn; }
  // a deed: its price (half when mortgaged); hard counts a dead deed (bus / van / tool crib, a street it can never pair) lower
  // while there is time left to play
  const P = i => { const p = v.board[i].price * (v.mort[i] ? 0.5 : 1); return lv === 'hard' && dead(v, me, i) ? p * (1 - 0.3 * horizon(v)) : p; };
  const other = t.from === me ? t.to : t.from;
  const after = v.owner.slice();
  for (const i of t.give) after[i] = t.to;
  for (const i of t.get) after[i] = t.from;
  const pairs = (s, own) => { const out = []; for (let g = 0; g < v.groups.length; g++) if (groupSpaces(v, g).every(j => own[j] === s)) out.push(g); return out; };
  const h = lv === 'hard' ? horizon(v) : 1;
  const gVal = g => { const p = sum(groupSpaces(v, g).map(P)); return lv === 'hard' ? (p * 1.2 * HEAT[g] + v.groups[g].build * 2) * h : p; };
  const mine0 = pairs(me, v.owner), mine1 = pairs(me, after), th0 = pairs(other, v.owner), th1 = pairs(other, after);
  let val = cashIn + sum(inSp.map(P)) - sum(outSp.map(P));
  for (const g of mine1) if (!mine0.includes(g)) val += gVal(g);
  for (const g of th1) if (!th0.includes(g)) val -= gVal(g) * (lv === 'hard' ? 0.4 : 0.6);
  return val;
}
// a deed seat s gets little from: the tool crib, a lone bus or van stop, a street whose partner someone else owns
function dead(v, s, i) {
  const b = v.board[i];
  if (b.kind === 'tool') return true;
  if (b.kind === 'transit') return !v.board.some(x => x.kind === 'transit' && x.i !== i && v.owner[x.i] === s);
  return b.kind === 'street' && partner(v, i).some(j => v.owner[j] >= 0 && v.owner[j] !== s);
}
const NEED = { easy: 0, normal: 20, hard: 30 }; // the least gain a bot accepts
function answerOffer(v, lv) {
  const t = v.trade, me = v.seat;
  if (!t || t.to !== me) return false;
  if (v.cash[me] + t.cash < (lv === 'easy' ? 50 : 100)) return false; // never pays itself broke
  return tradeValue(v, t, lv, me) > NEED[lv];
}
// a past decline rules out the same places again for a while, unless the money is now better for them
const sameDeal = (d, p) => d.to === p.to && d.give.join() === p.give.join() && d.get.join() === p.get.join();
function tried(v, p) { return (v.declined || []).some(d => d.from === v.seat && sameDeal(d, p) && v.round - d.round < 6 && d.cash >= p.cash); }
// the offer this bot wants to make now, or null. Deterministic from the view (rebuilt at each drafting step).
function tradePlan(v, lv) {
  const me = v.seat, cash = v.cash[me];
  if (lv === 'easy' && (v.round + me) % 5 !== 0) return null;
  if (lv === 'normal' && (v.round + me) % 2 !== 0) return null;
  const free = i => !v.board.some(x => x.kind === 'street' && x.group === v.board[i].group && v.lvl[x.i] > 0);
  // halves: groups where I own one street and player p the other
  const halves = [];
  for (let g = 0; g < v.groups.length; g++) {
    const sp = groupSpaces(v, g); if (sp.some(j => v.lvl[j] > 0 || v.mort[j])) continue;
    const mine = sp.filter(j => v.owner[j] === me), theirs = sp.filter(j => v.owner[j] >= 0 && v.owner[j] !== me);
    if (mine.length === 1 && theirs.length === 1 && v.alive[v.owner[theirs[0]]]) halves.push({ g, mine: mine[0], theirs: theirs[0], p: v.owner[theirs[0]] });
  }
  const cands = [];
  // swaps: I take their half of A, they take my half of B (a pair each)
  for (const A of halves) for (const B of halves) if (A !== B && A.p === B.p) cands.push({ to: A.p, give: [B.mine], get: [A.theirs] });
  // hard: buy the missing half for money, or for its dead deeds (that do not pair them up) and money
  if (lv === 'hard') for (const A of halves) {
    cands.push({ to: A.p, give: [], get: [A.theirs] });
    const junk = v.board.filter(b => b.price && b.kind !== 'tax' && v.owner[b.i] === me && dead(v, me, b.i) && free(b.i) && b.i !== A.mine
      && !(b.kind === 'street' && partner(v, b.i).some(j => v.owner[j] === A.p))).map(b => b.i).sort((x, y) => v.board[x].price - v.board[y].price || x - y);
    if (junk.length) cands.push({ to: A.p, give: [junk[0]], get: [A.theirs] });
    if (junk.length > 1) cands.push({ to: A.p, give: junk.slice(0, 2), get: [A.theirs] });
  }
  const plans = [];
  for (const c of cands) {
    if (!c.give.concat(c.get).every(free)) continue;
    const t = { from: me, to: c.to, give: c.give, get: c.get, cash: 0 };
    if (lv === 'hard') {
      // the money that makes it fair enough for a sensible player (judged as normal), and a cheaper try first (as easy)
      const their = tradeValue(v, t, 'normal', c.to), theirEasy = tradeValue(v, t, 'easy', c.to);
      const tiers = [r10(NEED.easy + 10 - theirEasy), r10(NEED.normal + 10 - their)].filter((x, k, a) => a.indexOf(x) === k);
      for (const pay of tiers) {
        const cashT = Math.max(-Math.floor(Math.max(0, v.cash[c.to] - 150) / 10) * 10, pay); // (steps of B10)
        const p = { ...c, cash: cashT };
        if (cash - Math.max(0, cashT) < 50 + 6 * v.groups[v.board[c.get[0]].group].build) continue;
        if (tried(v, p)) continue;
        const mine = tradeValue(v, { ...t, cash: cashT }, 'hard', me);
        if (mine > 60) { plans.push({ ...p, score: mine }); break; }
      }
    } else {
      const p = { ...c, cash: 0 };
      if (tried(v, p)) continue;
      const mine = tradeValue(v, t, lv, me), their = tradeValue(v, t, lv, c.to);
      if (mine > NEED[lv] + 20 && their > 0) plans.push({ ...p, score: mine });
    }
  }
  if (!plans.length) return null;
  plans.sort((x, y) => y.score - x.score || x.to - y.to || x.get[0] - y.get[0]);
  return plans[0];
}
// one step toward the plan: toggle the places, set the money, send (or cancel when there is no plan)
function draftMove(v, lv) {
  const t = v.trade, moves = v.moves, cancel = moves.find(m => m.type === 'cancel');
  const p = tradePlan(v, lv);
  if (!p || p.to !== t.to) return cancel;
  const want = new Set(p.give.concat(p.get)), have = new Set(t.give.concat(t.get));
  for (const i of [...want].concat([...have])) if (want.has(i) !== have.has(i)) { const m = moves.find(x => x.type === 'pick' && x.space === i); return m || cancel; }
  const d = p.cash - t.cash;
  if (d) {
    const steps = moves.filter(m => m.type === 'cash' && Math.sign(m.add) === Math.sign(d) && Math.abs(m.add) <= Math.abs(d)).sort((x, y) => Math.abs(y.add) - Math.abs(x.add));
    return steps[0] || cancel;
  }
  return moves.find(m => m.type === 'send') || cancel;
}
