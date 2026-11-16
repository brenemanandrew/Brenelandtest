// Pillow Forts' bots. No imports: a bot sees only its view (the house map travels in view.map) and picks one of view.moves.
// Deterministic for the same view (easy draws its little bit of chance from the view itself). All fast: well under a
// millisecond a move.
// Levels:
//   easy    trades only when it must, piles new pillows on one front area, throws once at a time when well ahead (two fights a
//           turn at most), moves in the fewest pillows, never shuffles
//   normal  trades as soon as it can, picks the region it holds most of, piles up beside it, keeps fighting while it is well
//           ahead, moves in all when the old area is safe, shuffles a back-room pile to the front
//   hard    looks one move ahead on a worth of the whole house: its income (areas and whole regions), the exposure of each of
//           its areas to the biggest stack next door (the real odds of a pillow fight, from a table), how close anyone is to
//           winning (and near the round cap, the areas themselves); in a duel the rival's income too. Every fight is the
//           expected change of that worth (won with the best move-in, or lost), plus a treat for the first win of a turn and a
//           flopped crew's treats; it places, moves in and shuffles the same way, and throws one at a time when the odds are
//           close so it can stop.
// Tuned by self-play (tools/pillow-forts-test.mjs prints the rates).
export const LEVELS = ['easy', 'normal', 'hard'];
// hard's weights
export const TUNE = { inc: 2, area: 0.4, foeInc: 0.5, holdReg: 0.3, risk: 1.0, oppInc: 0, duel: 2, lateR: 3, late: 0.8, lateOpp: 0.5, card: 0.9, treat: 0.8, elim: 3, minGain: 0.15, fightK: 0.6, lowW: 0.5, shiftMin: 0.1, rollBelow: 0.6, guard: 12, regW: 1.5, near: 3 };

// ---- the odds: W[a][d] the chance a attacking pillows (the ones past the one that stays home) win against d defenders when
// throwing until it is decided; E[a][d] the attackers expected to be left (0 when it is lost)
const MAXP = 64;
const OUT = {};
(function roundOdds() {
  for (let ad = 1; ad <= 3; ad++) for (let dd = 1; dd <= 2; dd++) {
    const tally = new Map(); let tot = 0;
    const rollAll = (k, acc, f) => { if (!k) { f(acc); return; } for (let x = 1; x <= 6; x++) rollAll(k - 1, acc.concat(x), f); };
    rollAll(ad, [], a => rollAll(dd, [], d => {
      const A = a.slice().sort((x, y) => y - x), D = d.slice().sort((x, y) => y - x);
      let al = 0, dl = 0; for (let k = 0; k < Math.min(ad, dd); k++) { if (A[k] > D[k]) dl++; else al++; }
      const key = al + ',' + dl; tally.set(key, (tally.get(key) || 0) + 1); tot++;
    }));
    OUT[ad + 'v' + dd] = [...tally].map(([k, c]) => { const [al, dl] = k.split(',').map(Number); return { al, dl, p: c / tot }; });
  }
})();
export const W = [], E = [];
for (let a = 0; a <= MAXP; a++) { W.push(new Float64Array(MAXP + 1)); E.push(new Float64Array(MAXP + 1)); }
for (let a = 0; a <= MAXP; a++) for (let d = 0; d <= MAXP; d++) {
  if (d === 0) { W[a][d] = 1; E[a][d] = a; continue; }
  if (a === 0) { W[a][d] = 0; E[a][d] = 0; continue; }
  let w = 0, e = 0;
  for (const o of OUT[Math.min(3, a) + 'v' + Math.min(2, d)]) { const a2 = a - o.al, d2 = d - o.dl; w += o.p * W[a2][d2]; e += o.p * E[a2][d2]; }
  W[a][d] = w; E[a][d] = e;
}
const ix = x => Math.max(0, Math.min(MAXP, Math.round(x)));
export const winOdds = (a, d) => W[ix(a)][ix(d)];
const leftOdds = (a, d) => E[ix(a)][ix(d)];

// ---- the map, from the view (cached per areas list)
const GEO = new WeakMap();
function geo(map) {
  let g = GEO.get(map.areas);
  if (g) return g;
  const N = map.areas.length, adj = map.areas.map(() => []);
  for (const [a, b] of map.links) { adj[a].push(b); adj[b].push(a); }
  for (const l of adj) l.sort((x, y) => x - y);
  const reg = map.regions.map((r, k) => map.areas.filter(a => a.region === k).map(a => a.i));
  // a region's doors: its areas with a way out
  const doors = reg.map((list, k) => list.filter(i => adj[i].some(j => map.areas[j].region !== k)));
  g = { N, adj, reg, doors, region: map.areas.map(a => a.region), bonus: map.regions.map(r => r.bonus) };
  GEO.set(map.areas, g);
  return g;
}

function hash01(...xs) {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ ((x | 0) + 0x9e37), 16777619); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const viewSeed = v => hash01(v.seat, v.round, v.battles, v.left, v.pillows.reduce((s, p, i) => s + p * (i + 1), 0), v.stage.length);

// ---- what things are worth to seat s
function ctxOf(v) {
  const G = geo(v.map), s = v.seat, own = v.owner, p = v.pillows;
  const mine = i => own[i] === s;
  const held = G.reg.map(list => { const o = own[list[0]]; return list.every(i => own[i] === o) ? o : null; });
  const ownIn = G.reg.map(list => list.filter(mine).length);
  return { G, s, own, p, mine, held, ownIn, goal: v.goal || {} };
}
// normal's value of taking area j: closer to a whole region, a region finished or broken, the first win of the turn
function takeValue(c, v, j) {
  const { G, own, held, ownIn } = c, g = G.region[j], size = G.reg[g].length, def = own[j];
  const after = ownIn[g] + 1;
  let val = 1 + G.bonus[g] * Math.pow(after / size, 2) * 1.2;
  if (after === size) val += G.bonus[g] * 2.2;
  if (def >= 0 && held[g] === def) val += G.bonus[g];
  if (def < 0) val *= 0.75; // the Teddies: harmless where they are
  if (!v.gained && v.settings.cards) val += 1.5;
  return val;
}
// how hard area i (mine) is pressed: the biggest crew stack next door, and all of them
function pressure(c, i) {
  let t = 0, sum = 0;
  for (const j of c.G.adj[i]) if (!c.mine(j) && c.own[j] >= 0) { t = Math.max(t, c.p[j] - 1); sum += c.p[j] - 1; }
  return { max: t, sum };
}
const holdValue = (c, i) => { const g = c.G.region[i]; return 1 + (c.held[g] === c.s ? c.G.bonus[g] * 1.4 : 0); };

// ---- hard's look ahead: a position's worth to seat s (income, areas, the regions kept, exposure to the stacks next door, the
// rivals' income and how close anyone is to winning), and the expected change a move makes to it
function incomeOf(c, own, k) {
  let n = 0; for (const o of own) if (o === k) n++;
  let b = 0;
  for (let g = 0; g < c.G.reg.length; g++) if (c.G.reg[g].every(i => own[i] === k)) b += c.G.bonus[g];
  return { areas: n, inc: Math.max(3, Math.floor(n / 3)) + b, regs: c.G.reg.filter(l => l.every(i => own[i] === k)).length };
}
function evalPos(c, v, own, p) {
  const s = c.s, me = incomeOf(c, own, s);
  if (!me.areas) return -100;
  // near the round cap the areas themselves decide it
  const togo = (v.rounds || 99) - (v.round || 0);
  let sc = me.inc * TUNE.inc + me.areas * (TUNE.area + Math.max(0, TUNE.lateR - togo) * TUNE.late);
  const opp = [];
  for (let k = 0; k < v.n; k++) if (k !== s && v.alive[k]) { const o = incomeOf(c, own, k); if (o.areas) opp.push([k, o]); }
  // exposure: each of my areas against the biggest crew stack next door (plus some of that crew's new pillows)
  for (let i = 0; i < own.length; i++) {
    if (own[i] !== s) continue;
    let foe = 0;
    for (const j of c.G.adj[i]) { const o = own[j]; if (o !== s && o >= 0) { const e = opp.find(x => x[0] === o); foe = Math.max(foe, p[j] - 1 + (e ? e[1].inc * TUNE.foeInc : 0)); } }
    if (foe <= 0) continue;
    const g = c.G.region[i], whole = c.G.reg[g].every(x => own[x] === s);
    // holding the regions that win (quick): any of them lost and the win is gone
    const key = whole && c.goal.regions && me.regs >= c.goal.regions ? TUNE.guard : 0;
    sc -= winOdds(foe, p[i]) * (1 + (whole ? c.G.bonus[g] * TUNE.holdReg : 0) + key) * TUNE.risk;
  }
  // the rivals: their income, more for the one ahead; anyone close to winning
  let oi = 0;
  for (const [k, o] of opp) oi += o.inc;
  if (opp.length) sc -= (opp.length === 1 ? TUNE.duel : TUNE.oppInc) * oi / opp.length;
  if (togo < TUNE.lateR) for (const [, o] of opp) sc -= Math.max(0, TUNE.lateR - togo) * TUNE.late * o.areas / opp.length * (opp.length === 1 ? 1 : TUNE.lateOpp);
  const goal = c.goal;
  if (goal.regions) {
    if (me.regs >= goal.regions) sc += 30;
    for (const [, o] of opp) { if (o.regs >= goal.regions) sc -= 30; else if (o.regs === goal.regions - 1) sc -= TUNE.near; }
    sc += me.regs * TUNE.regW;
  } else if (goal.areas) {
    if (me.areas >= goal.areas) sc += 60;
    for (const [, o] of opp) sc -= Math.max(0, o.areas - (goal.areas - 8)) * 1.6;
  }
  if (!opp.length) sc += 60;
  return sc;
}
// a fight from -> to, thrown until decided: the expected change, the best move-in counted on a win
function fightGain(c, v, own, p, from, to, base) {
  const a = p[from] - 1, d = p[to], w = winOdds(a, d);
  if (w < 0.08) return { gain: -9, w };
  const def = own[to];
  // won: the survivors split between the two areas as well as can be
  const left = Math.max(1, Math.round(leftOdds(a, d) / Math.max(w, 1e-6)));
  const o2 = own.slice(); o2[to] = c.s;
  let best = -1e9;
  for (const k of uniqCounts(left)) { const p2 = p.slice(); p2[from] = 1 + left - k; p2[to] = k; best = Math.max(best, evalPos(c, v, o2, p2)); }
  let bonus = 0;
  if (!v.gained && v.settings.cards) bonus += TUNE.treat;
  if (def >= 0 && v.areas[def] === 1) bonus += TUNE.elim + TUNE.card * (v.cards[def] || 0);
  // lost: down to 1 here, the defender keeps some
  const p3 = p.slice(); p3[from] = 1; p3[to] = Math.max(1, Math.round(d - a * 0.55));
  const lose = evalPos(c, v, own, p3);
  return { gain: w * (best + bonus) + (1 - w) * lose - base, w };
}
const uniqCounts = n => { const out = [n]; if (n > 1) out.push(1); if (n > 3) out.push(Math.ceil(n / 2)); return out; };


// ---- hard by the evaluation
function hardPlace(v, moves) {
  const trade = moves.find(m => m.type === 'trade');
  if (trade) return trade;
  const c = ctxOf(v), L = v.left, own = v.owner;
  let best = moves[0], bs = -1e9;
  for (let i = 0; i < c.G.N; i++) {
    if (own[i] !== c.s || !c.G.adj[i].some(j => own[j] !== c.s)) continue;
    for (const n of [L, Math.min(L, 3), 1]) {
      const m = moves.find(x => x.type === 'place' && x.area === i && x.n === n);
      if (!m || (n !== L && L <= 3)) continue;
      const p = c.p.slice(); p[i] += n;
      // what this pile then makes possible: the best fight from here (a share of it when only part is placed)
      const base = evalPos(c, v, own, p);
      let fg = 0;
      for (const j of c.G.adj[i]) if (own[j] !== c.s && p[i] >= 2) fg = Math.max(fg, fightGain(c, v, own, p, i, j, base).gain);
      // the rest (when splitting) goes by the auto rule, roughly: worth a bit of safety
      const sc = base + fg * TUNE.fightK;
      if (sc > bs) { bs = sc; best = m; }
    }
  }
  return best;
}
function hardAttack(v, moves) {
  const c = ctxOf(v), own = v.owner, p = c.p;
  const base = evalPos(c, v, own, p);
  let best = null, bg = TUNE.minGain;
  for (const m of moves) {
    if (m.type !== 'blitz') continue;
    const { gain, w } = fightGain(c, v, own, p, m.from, m.to, base);
    const g = gain - (w < 0.5 ? TUNE.lowW : 0);
    if (g > bg) { bg = g; best = m; }
  }
  if (best) {
    const a = p[best.from] - 1, d = p[best.to], w = winOdds(a, d);
    if (w < TUNE.rollBelow && a >= 3) return moves.find(m => m.type === 'roll' && m.from === best.from && m.to === best.to) || best;
    return best;
  }
  // one shuffle if it helps, else end
  let sm = null, ss = base + TUNE.shiftMin;
  for (const m of moves) {
    if (m.type !== 'shift') continue;
    const p2 = p.slice(); p2[m.from] -= m.n; p2[m.to] += m.n;
    const sc = evalPos(c, v, own, p2);
    if (sc > ss) { ss = sc; sm = m; }
  }
  return sm || moves[0];
}
function hardAdvance(v, moves) {
  const c = ctxOf(v), { from, to } = v.adv;
  let best = moves[0], bs = -1e9;
  for (const m of moves) {
    const p = c.p.slice(); p[from] -= m.n; p[to] += m.n;
    let sc = evalPos(c, v, v.owner, p);
    // the next fight from the new area (or the old) counts too
    let fg = 0;
    for (const x of [to, from]) if (p[x] >= 2) for (const j of c.G.adj[x]) if (v.owner[j] !== c.s) fg = Math.max(fg, fightGain(c, v, v.owner, p, x, j, sc).gain);
    sc += fg * TUNE.fightK;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}


export function chooseMove(v, level, rng) {
  const moves = v && v.moves;
  if (!moves || !moves.length) return null;
  if (moves.length === 1) return moves[0];
  const lv = level === 'easy' || level === 'hard' ? level : 'normal';
  const R = rng || (() => viewSeed(v));
  if (v.stage === 'cash') return moves[0]; // (the biggest set comes first)
  if (lv === 'hard') {
    if (v.stage === 'place') return hardPlace(v, moves);
    if (v.stage === 'attack') return hardAttack(v, moves);
    if (v.stage === 'advance') return hardAdvance(v, moves);
    return moves[0];
  }
  if (v.stage === 'place') return placeMove(v, lv, moves, R);
  if (v.stage === 'attack') return attackMove(v, lv, moves, R);
  if (v.stage === 'advance') return advanceMove(v, lv, moves);
  return moves[0];
}

// ---- easy and normal
function placeMove(v, lv, moves, R) {
  const trade = moves.find(m => m.type === 'trade');
  if (trade && lv !== 'easy') return trade;
  const c = ctxOf(v), L = v.left;
  const fronts = [];
  for (let i = 0; i < c.G.N; i++) if (c.mine(i) && c.G.adj[i].some(j => !c.mine(j))) fronts.push(i);
  if (!fronts.length) return moves[0];
  const put = i => moves.find(m => m.type === 'place' && m.area === i && m.n === L) || moves[0];
  if (lv === 'easy') return put(fronts[Math.floor(R() * fronts.length) % fronts.length]);
  // the region we hold most of (not yet whole), the front beside it with the biggest pile
  let best = null, bs = -1;
  for (const i of fronts) for (const j of c.G.adj[i]) {
    if (c.mine(j)) continue;
    const g = c.G.region[j], frac = (c.ownIn[g] + 1) / c.G.reg[g].length;
    const sc = frac * 10 + c.p[i] * 0.3 - c.p[j] * 0.25 + (c.own[j] < 0 ? -1 : 0);
    if (sc > bs) { bs = sc; best = i; }
  }
  return put(best ?? fronts[0]);
}

function attackMove(v, lv, moves, R) {
  const c = ctxOf(v), end = moves[0];
  if (lv === 'easy') {
    if (v.battles >= 2) return end;
    let best = null, bs = -1;
    for (const m of moves) {
      if (m.type !== 'roll') continue;
      const a = c.p[m.from], d = c.p[m.to];
      if (a < d + 3) continue;
      const sc = a - d + R() * 2;
      if (sc > bs) { bs = sc; best = m; }
    }
    return best || end;
  }
  let best = null, bs = 0;
  for (const m of moves) {
    if (m.type !== 'blitz') continue;
    const a = c.p[m.from] - 1, d = c.p[m.to], w = winOdds(a, d);
    if (a < d + 1 || w < 0.6) continue;
    const sc = w * takeValue(c, v, m.to) + (a - d) * 0.05;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best || shiftMove(c, v, moves) || end;
}

// one whole back-room pile to the front area that needs it most
function shiftMove(c, v, moves) {
  const front = i => c.G.adj[i].some(j => !c.mine(j));
  const need = i => {
    const pr = pressure(c, i);
    let opp = 0; for (const j of c.G.adj[i]) if (!c.mine(j)) opp = Math.max(opp, takeValue(c, v, j) / (c.p[j] + 1));
    return (pr.max + pr.sum * 0.3) * holdValue(c, i) + opp * 2;
  };
  let best = null, bs = 0;
  for (const m of moves) {
    if (m.type !== 'shift' || m.n !== c.p[m.from] - 1 || front(m.from) || !front(m.to)) continue;
    const sc = m.n * (1 + need(m.to) * 0.1);
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}

function advanceMove(v, lv, moves) {
  if (lv === 'easy') return moves[0];
  const c = ctxOf(v), { from, to } = v.adv;
  const fromFoes = c.G.adj[from].some(j => !c.mine(j) && j !== to);
  return fromFoes ? moves[Math.floor((moves.length - 1) / 2)] : moves[moves.length - 1];
}
