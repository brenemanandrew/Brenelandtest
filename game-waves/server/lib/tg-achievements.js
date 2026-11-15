// The table games' achievements (tg-look): earned at the table, in the existing system (lib/achievements.js keeps them per
// account, a guest's for the visit; public/js/achievements.js draws each one's medallion). It listens to the table-games
// server's moments (api.tableGames.on((T, ev) => ...): each move's beats and the game's result), reads them and the table's
// seats, and grants. api.tgEvent(table, beats) is the same reading, called directly by the tests. Games with bots count for all of them but the full table of people (the
// leaderboard's rule stays: a game with a bot is not on the window board).
//   Generic (any table game): a game played to the end, a win, a win over a hard bot, a game with four or more people.
//   Mexican Train: going out on a double, a round with zero pips, all thirteen rounds of the full game.
//   Word Weave: a Full Weave, a single word worth 50+, a Triple Word square, going out with your last tile.
//   The Missing Pie: solving it, solving it by round 6, an ask nobody could answer.
//   Town Tycoon: a full colour pair, a shop, a rent of B500+ paid to you, last one standing in a full game.
'use strict';

const ACHS = [
  { id: 'tg-first-game', title: 'Pull Up a Chair', line: 'Played a table game all the way to the end.', icon: 'tg-domino', color: '#e3aa45' },
  { id: 'tg-first-win', title: 'Table Winner', line: 'Won a table game.', icon: 'tg-cup', color: '#ffd34d' },
  { id: 'tg-beat-hard', title: 'Outfoxed the Bots', line: 'Won a table game against a hard bot.', icon: 'tg-bot', color: '#7fb4d8' },
  { id: 'tg-full-table', title: 'Full House', line: 'Played a table game with four or more people, no bots.', icon: 'tg-friends', color: '#ff8fb8' },
  { id: 'mt-out-double', title: 'Double Down', line: 'Went out on a double in Mexican Train.', icon: 'tg-double', color: '#e0463c' },
  { id: 'mt-zero', title: 'Not a Pip Left', line: 'Ended a round of Mexican Train with zero pips in your hand.', icon: 'tg-zero', color: '#7ddc7a' },
  { id: 'mt-full-ride', title: 'The Whole Line', line: 'Played all 13 rounds of a full Mexican Train game.', icon: 'tg-train', color: '#3f8fd9' },
  // Word Weave
  { id: 'ww-full-weave', title: 'Full Weave', line: 'Played all seven of your tiles in one turn of Word Weave.', icon: 'ww-rack', color: '#ffd34d' },
  { id: 'ww-big-word', title: 'Word Wizard', line: 'Made a single word worth 50 points or more in Word Weave.', icon: 'ww-tile', color: '#b98cf0' },
  { id: 'ww-triple', title: 'Triple Treat', line: 'Covered a Triple Word square in Word Weave.', icon: 'ww-triple', color: '#e0463c' },
  { id: 'ww-last-tile', title: 'Empty Rack', line: 'Played your very last tile to finish a game of Word Weave.', icon: 'ww-last', color: '#7ddc7a' },
  // The Missing Pie
  { id: 'mp-solved', title: 'Pie Detective', line: 'Solved the mystery of The Missing Pie.', icon: 'mp-pie', color: '#f0862f' },
  { id: 'mp-quick', title: 'Quick Crumbs', line: 'Solved The Missing Pie by round 6.', icon: 'mp-clock', color: '#7fc8f8' },
  { id: 'mp-stumper', title: 'Stumped the Table', line: 'Asked a question in The Missing Pie that nobody could answer.', icon: 'mp-ask', color: '#ff8fb8' },
  // Town Tycoon
  { id: 'tt-pair', title: 'Matching Set', line: 'Owned both streets of a colour pair in Town Tycoon.', icon: 'tt-pair', color: '#4fa45a' },
  { id: 'tt-shop', title: 'Open for Business', line: 'Built a shop on a street in Town Tycoon.', icon: 'tt-shop', color: '#ffd34d' },
  { id: 'tt-big-rent', title: 'Rent Day', line: 'Collected a rent of B500 or more in Town Tycoon.', icon: 'tt-coins', color: '#e3aa45' },
  { id: 'tt-last', title: 'Last One Standing', line: 'Won a full game of Town Tycoon as the last player left.', icon: 'tt-crown', color: '#3f6fd9' },
];

const WW_BIG = 50;     // one word's points (bonus squares in, the Full Weave bonus out)
const MP_QUICK = 6;    // solved on or before this round
const TT_RENT = 500;   // one rent payment
const TT_SHOP = 5;     // a street's building level: 1-4 cottages, 5 a shop
// Town Tycoon's colour pairs (board spaces). Keep in step with town-tycoon.js GROUP_SPACES (the test checks it).
const TT_PAIRS = [[1, 3], [4, 6], [8, 10], [12, 13], [15, 17], [18, 20], [22, 23], [26, 27]];

function register(api) {
  if (!api.achievements) return;
  for (const a of ACHS) api.achievements.define(a);
  const kindOf = b => (b && typeof b === 'object' ? b.kind : String(b));
  // the people at the table: engine seat -> the player (only people still in their chair and connected)
  function people(T) {
    const out = new Map();
    if (!Array.isArray(T.order)) return out;
    T.order.forEach((chair, k) => { const s = T.seats[chair]; if (!s || s.kind !== 'human' || !s.sid) return; const pl = api.players.get(s.sid); if (pl) out.set(k, pl); });
    return out;
  }
  const grant = (pl, id) => { try { return api.achievements.grant(pl, id); } catch (e) { console.error('[tg-achievements]', id, e.message); return false; } };
  // Town Tycoon: who owns what this game, from the buy, bankrupt and accepted trade beats (kept on the table, one game at a time)
  function ttOwners(T) {
    const key = T.seed != null ? T.seed : T.createdAt;
    if (!T._achTT || T._achTT.key !== key) T._achTT = { key, own: {} };
    return T._achTT.own;
  }
  api.tgEvent = (T, beats) => {
    if (!T || !T.order) return;
    const list = Array.isArray(beats) ? beats : [];
    const tt = T.game === 'town-tycoon';
    // (ownership is followed for every seat, bots too, so a person who takes a bot's streets in a bankruptcy is counted right)
    if (tt) {
      const own = ttOwners(T);
      for (const b of list) {
        const k = kindOf(b);
        if (k === 'buy' && Number.isInteger(b.space)) own[b.space] = b.seat;
        else if (k === 'bankrupt' && Array.isArray(b.props)) for (const sp of b.props) { if (Number.isInteger(b.to) && b.to >= 0) own[sp] = b.to; else delete own[sp]; }
        else if (k === 'trade' && b.step === 'accept') { for (const sp of b.give || []) own[sp] = b.to; for (const sp of b.get || []) own[sp] = b.from; } // (trades, once the engine has them)
      }
    }
    const P = people(T);
    if (!P.size) { if (tt && list.some(b => kindOf(b) === 'gameOver')) T._achTT = null; return; }
    const mt = T.game === 'mexican-train', ww = T.game === 'word-weave', mp = T.game === 'missing-pie';
    for (let i = 0; i < list.length; i++) {
      const b = list[i], k = kindOf(b);
      // out on a double: the place of a double and the out, the same seat, one after the other
      if (mt && k === 'out' && P.has(b.seat)) { const prev = list.slice(0, i).reverse().find(x => kindOf(x) === 'place'); if (prev && prev.seat === b.seat && prev.double) grant(P.get(b.seat), 'mt-out-double'); }
      if (mt && k === 'roundEnd' && Array.isArray(b.pips)) b.pips.forEach((p, s) => { if (p === 0 && P.has(s)) grant(P.get(s), 'mt-zero'); });
      if (ww) {
        if (k === 'fullweave' && P.has(b.seat)) grant(P.get(b.seat), 'ww-full-weave');
        if (k === 'place' && P.has(b.seat)) {
          if (Array.isArray(b.words) && b.words.some(w => w && w.score >= WW_BIG)) grant(P.get(b.seat), 'ww-big-word');
          if (b.tripleWord === true) grant(P.get(b.seat), 'ww-triple');
        }
        if (k === 'gameOver' && b.why === 'out' && P.has(b.out)) grant(P.get(b.out), 'ww-last-tile');
      }
      if (mp) {
        if (k === 'accuse' && b.right === true && P.has(b.seat)) { grant(P.get(b.seat), 'mp-solved'); if (Number.isFinite(b.round) && b.round <= MP_QUICK) grant(P.get(b.seat), 'mp-quick'); }
        if (k === 'noneShown' && P.has(b.seat)) grant(P.get(b.seat), 'mp-stumper');
      }
      if (tt) {
        // building needs the whole pair, so a build counts for it too (in case the table was reloaded mid-game)
        if (k === 'build' && P.has(b.seat)) { grant(P.get(b.seat), 'tt-pair'); if (b.level >= TT_SHOP) grant(P.get(b.seat), 'tt-shop'); }
        if (k === 'buy' || k === 'bankrupt' || (k === 'trade' && b.step === 'accept')) {
          const own = ttOwners(T);
          for (const pair of TT_PAIRS) { const o = own[pair[0]]; if (o !== undefined && pair.every(sp => own[sp] === o) && P.has(o)) grant(P.get(o), 'tt-pair'); }
        }
        if (k === 'rent' && Number.isFinite(b.amount) && b.amount >= TT_RENT && P.has(b.owner)) grant(P.get(b.owner), 'tt-big-rent');
        if (k === 'gameOver' && b.why === 'last' && T.settings && T.settings.length === 'full' && Array.isArray(b.winners)) for (const s of b.winners) if (P.has(s)) grant(P.get(s), 'tt-last');
      }
    }
    if (tt && list.some(b => kindOf(b) === 'gameOver')) T._achTT = null;
    // the end of a game (the runner has its result by now): once per game
    if (T.phase === 'over' && T.result && T._achDone !== T.result) {
      T._achDone = T.result;
      const win = Array.isArray(T.result.winners) ? T.result.winners : [];
      const hardBot = T.order.some(c => { const s = T.seats[c]; return s && s.kind === 'bot' && s.level === 'hard'; });
      const allPeople = !T.hadBot && T.order.every(c => T.seats[c] && T.seats[c].kind === 'human');
      for (const [s, pl] of P) {
        grant(pl, 'tg-first-game');
        if (win.includes(s)) { grant(pl, 'tg-first-win'); if (hardBot) grant(pl, 'tg-beat-hard'); }
        if (allPeople && T.order.length >= 4) grant(pl, 'tg-full-table');
        if (mt && T.settings && T.settings.length === 'full' && list.some(b => kindOf(b) === 'gameOver')) grant(pl, 'mt-full-ride');
      }
    }
  };
  // the table-games server registers after this module: subscribe once every module has loaded
  setImmediate(() => { if (api.tableGames && api.tableGames.on) api.tableGames.on((T, ev) => { if (ev && ev.kind === 'beats') api.tgEvent(T, ev.beats); else if (ev && ev.kind === 'result') api.tgEvent(T, null); }); });
}

module.exports = { register, ACHS, TT_PAIRS };
