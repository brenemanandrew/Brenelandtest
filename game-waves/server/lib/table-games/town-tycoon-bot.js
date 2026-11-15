// Town Tycoon's bots. No imports: a bot sees only its view (the board data travels in view.board / view.groups) and picks one of
// view.moves. Deterministic for the same view (no rng needed).
// Levels:
//   easy    buys when it keeps more than B100, never builds, rolls out of the woods, raises money with the first move offered
//   normal  buys by group value, builds when it holds a pair and keeps a reserve, mortgages singles first to pay a debt,
//           pays out of the woods while it is rich
//   hard    values completing pairs and blocking other players' pairs, builds to 3 cottages fast on the best-landed groups,
//           keeps a reserve tied to the worst rent it could land on, pays out of the woods early and stays in late
// Auctions: each bids up to its own value of the place (easy low, hard high for a place that completes or blocks a pair).
// Trades: every level answers by value (easy counts prices only, normal and hard also weigh the pair they would hand over);
// normal and easy now and then offer a swap that completes a pair for both; hard offers swaps and buys the half it lacks for
// cash when it can still build after. A declined offer is not made again for a few rounds.
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
  if (v.offers === 0 && has('trade')) { const p = tradePlan(v, lv); if (p && moves.some(m => m.type === 'trade' && m.to === p.to)) return moves.find(m => m.type === 'trade' && m.to === p.to); }
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
    if (lv === 'hard') return left >= Math.max(80, 0.5 * maxRent(v, me));
    return left >= 200;
  }
  const sp = groupSpaces(v, b.group), others = sp.filter(j => j !== i);
  const completes = others.every(j => v.owner[j] === me);
  const blocks = others.some(j => v.owner[j] >= 0 && v.owner[j] !== me);
  if (lv === 'normal') {
    if (completes) return left >= 50;
    return left >= 150;
  }
  // hard
  const reserve = Math.max(40, 0.5 * maxRent(v, me));
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
  else reserve = Math.max(60, Math.min(500, danger(v, me) * 0.8, 0.6 * maxRent(v, me) + 60));
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
// what place i is worth to seat s at this level (a bid ceiling before the cash reserve)
function worthTo(v, s, i, lv) {
  const b = v.board[i], p = b.price;
  if (lv === 'easy') return p * 0.8;
  if (b.kind !== 'street') {
    if (b.kind === 'transit') { const mine = v.board.some(x => x.kind === 'transit' && x.i !== i && v.owner[x.i] === s); return p * (lv === 'hard' ? (mine ? 1.7 : 1.1) : mine ? 1.3 : 0.95); }
    return p * (lv === 'hard' ? 0.85 : 0.9);
  }
  const others = partner(v, i);
  const completes = others.every(j => v.owner[j] === s);
  const blocks = others.some(j => v.owner[j] >= 0 && v.owner[j] !== s);
  if (lv === 'normal') return p * (completes ? 1.4 : 1.0);
  return p * (completes ? 2.0 : blocks ? 1.35 : 1.1) * (completes ? 1 : HEAT[b.group]);
}
function auctionMove(v, lv) {
  const a = v.auction, me = v.seat, cash = v.cash[me], moves = v.moves;
  const pass = moves.find(m => m.type === 'pass');
  const bids = moves.filter(m => m.type === 'bid');
  if (!bids.length) return pass;
  const reserve = lv === 'easy' ? 100 : lv === 'normal' ? 150 : Math.max(60, Math.min(400, 0.5 * maxRent(v, me) + 40));
  const ceil = Math.min(worthTo(v, me, a.space, lv), cash - reserve);
  const ok = bids.filter(m => m.amount <= ceil);
  if (!ok.length) return pass;
  // a big jump while far under the ceiling, else the smallest raise
  const room = ceil - a.bid;
  if (room > 250 && ok.length >= 3) return ok[2];
  if (room > 120 && ok.length >= 2) return ok[1];
  return ok[0];
}

// ---------------------------------------------------------------- trades
const sum = a => a.reduce((x, y) => x + y, 0);
// the value of an offer to the seat answering it (+ good for them)
function offerValue(v, t, lv, me) {
  const P = i => v.board[i].price;
  const inSp = t.from === me ? t.get : t.give, outSp = t.from === me ? t.give : t.get;
  const cashIn = t.from === me ? -t.cash : t.cash;
  if (lv === 'easy') return sum(inSp.map(P)) - sum(outSp.map(P)) + cashIn;
  const other = t.from === me ? t.to : t.from;
  const after = v.owner.slice();
  for (const i of t.give) after[i] = t.to;
  for (const i of t.get) after[i] = t.from;
  const pairOf = (s, own) => { const out = []; for (let g = 0; g < v.groups.length; g++) { const sp = groupSpaces(v, g); if (sp.every(j => own[j] === s)) out.push(g); } return out; };
  const gVal = g => { const sp = groupSpaces(v, g); const p = sum(sp.map(P)); return lv === 'hard' ? p * 1.25 * HEAT[g] + v.groups[g].build * 2 : p * 1.0; };
  const before = pairOf(me, v.owner), now = pairOf(me, after);
  const oBefore = pairOf(other, v.owner), oNow = pairOf(other, after);
  let val = cashIn + sum(inSp.map(P)) - sum(outSp.map(P));
  for (const g of now) if (!before.includes(g)) val += gVal(g);
  for (const g of oNow) if (!oBefore.includes(g)) val -= gVal(g) * (lv === 'hard' ? 1.15 : 0.6);
  return val;
}
function answerOffer(v, lv) {
  const t = v.trade, me = v.seat;
  if (!t || t.to !== me) return false;
  const val = offerValue(v, t, lv, me);
  const cashIn = t.cash; // what I would get (negative: what I pay)
  if (v.cash[me] + cashIn < (lv === 'easy' ? 50 : 100)) return false; // never pays itself broke
  return val > (lv === 'hard' ? 30 : lv === 'normal' ? 20 : 0);
}
// the offer this bot wants to make this turn, or null. Deterministic from the view (it is rebuilt at each drafting step).
const keyOf = (to, give, get) => to + ':' + give.join(',') + '/' + get.join(',');
function tradePlan(v, lv) {
  const me = v.seat, cash = v.cash[me];
  if (lv === 'easy' && (v.round + me) % 4 !== 0) return null;
  const recent = new Set((v.declined || []).filter(d => d.from === me && v.round - d.round < 4).map(d => keyOf(d.to, d.give, d.get)));
  const free = i => !v.board.some(x => x.kind === 'street' && x.group === v.board[i].group && v.lvl[x.i] > 0);
  // halves: groups where I own one street and player p the other
  const halves = [];
  for (let g = 0; g < v.groups.length; g++) {
    const sp = groupSpaces(v, g); if (sp.some(j => v.lvl[j] > 0 || v.mort[j])) continue;
    const mine = sp.filter(j => v.owner[j] === me), theirs = sp.filter(j => v.owner[j] >= 0 && v.owner[j] !== me);
    if (mine.length === 1 && theirs.length === 1 && v.alive[v.owner[theirs[0]]]) halves.push({ g, mine: mine[0], theirs: theirs[0], p: v.owner[theirs[0]] });
  }
  const plans = [];
  // swaps: I take their half of g, they take my half of h (both complete a pair)
  for (const A of halves) for (const B of halves) {
    if (A === B || A.p !== B.p) continue;
    const plan = { to: A.p, give: [B.mine], get: [A.theirs], cash: 0 };
    // even it up with money when my pair is worth less than theirs (hard) or skip it
    const mineV = sum(groupSpaces(v, A.g).map(j => v.board[j].price)) * HEAT[A.g], theirV = sum(groupSpaces(v, B.g).map(j => v.board[j].price)) * HEAT[B.g];
    if (lv === 'hard' && mineV < theirV * 0.9) continue;
    if (lv !== 'hard' && mineV < theirV * 0.7) continue;
    plans.push({ ...plan, score: mineV - theirV * 0.5 });
  }
  // hard: buy the missing half for cash, when it can still build after
  if (lv === 'hard') for (const A of halves) {
    const b = v.board[A.theirs], build = v.groups[A.g].build;
    const offer = Math.ceil((b.price * 1.85 + 40) / 10) * 10;
    if (cash - offer < Math.max(150, 2 * build + 60)) continue;
    plans.push({ to: A.p, give: [], get: [A.theirs], cash: offer, score: sum(groupSpaces(v, A.g).map(j => v.board[j].price)) * HEAT[A.g] * 0.6 - offer * 0.3 });
  }
  const good = plans.filter(p => free(p.get[0]) && p.give.every(free) && !recent.has(keyOf(p.to, p.give, p.get)) && p.cash <= cash && p.cash <= cash);
  if (!good.length) return null;
  good.sort((x, y) => y.score - x.score || x.to - y.to || x.get[0] - y.get[0]);
  return good[0];
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
