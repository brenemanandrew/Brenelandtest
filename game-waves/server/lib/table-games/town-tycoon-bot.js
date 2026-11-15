// Town Tycoon's bots. No imports: a bot sees only its view (the board data travels in view.board / view.groups) and picks one of
// view.moves. Deterministic for the same view (no rng needed).
// Levels:
//   easy    buys when it keeps more than B100, never builds, rolls out of the woods, raises money with the first move offered
//   normal  buys by group value, builds when it holds a pair and keeps a reserve, mortgages singles first to pay a debt,
//           pays out of the woods while it is rich
//   hard    values completing pairs and blocking other players' pairs, builds to 3 cottages fast on the best-landed groups,
//           keeps a reserve tied to the worst rent it could land on, pays out of the woods early and stays in late
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

  // roll / manage: build or unmortgage first, then roll or end
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
