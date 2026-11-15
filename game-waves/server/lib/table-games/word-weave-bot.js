// Word Weave's bots and move finder. A bot sees only its view (the board, its own rack, the bag count) and picks a move.
//   chooseMove(view, level, rng?) -> { type: 'place', tiles } | { type: 'exchange', letters } | { type: 'pass' } | null
//   findMoves(board, rack, onMove, budgetMs?) -> every placement (anchor squares + cross-checks over the trie)
//   bestScore(board, rack) -> the top score this rack can make now (for the hints setting)
// Levels:
//   easy    a short, low-scoring word (2-3 tiles, small score); stuck: swaps a few tiles or passes
//   normal  the best score from a random half of the moves it finds
//   hard    the best score plus a rack-leave guess (keep blanks and an S, vowels and consonants in balance, no Q without U,
//           no doubles); swaps when its best is poor and the bag allows
// A move uses at most one blank (keeps the search small). The search stops at a time budget (default 90 ms) with the best so far.
import { SIZE, CENTER, RACK, FULL_BONUS, VAL, LAYOUT, LMUL, WMUL, trie, pop } from './word-weave-core.js';

export const LEVELS = ['easy', 'normal', 'hard'];
const N = SIZE, ALL = (1 << 26) - 1, BLANK = 26, A = 65;
const LM = new Int8Array(N * N), WM = new Int8Array(N * N);
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { LM[r * N + c] = LMUL[LAYOUT[r][c]]; WM[r * N + c] = WMUL[LAYOUT[r][c]]; }
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

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
// a steady rng for this moment of this seat, so a bot asked twice answers the same
function viewRng(v) {
  const xs = [v.seat, v.bag, v.turns || 0];
  for (const row of v.board) for (let i = 0; i < row.length; i++) xs.push(row.charCodeAt(i));
  for (const l of v.rack || []) xs.push(l.charCodeAt(0));
  return rngFrom(Math.floor(hash01(...xs) * 4294967296));
}

// ---- the move finder
// board: SIZE strings ('.', 'A'-'Z', 'a'-'z' a blank). rack: letters with '?' for a blank.
// onMove(score, tiles () => [{ r, c, letter, blank }], left (Int8Array of 27 counts), placed) for each placement found.
export function findMoves(board, rack, onMove, budgetMs = 90) {
  const { MASK, FIRST } = trie();
  const kid = (n, l) => ((MASK[n] >>> l) & 1 ? FIRST[n] + pop(MASK[n] & ((1 << l) - 1)) : -1);
  const counts = new Int8Array(27);
  for (const l of rack) { if (l === '?') counts[BLANK]++; else counts[l.charCodeAt(0) - A]++; }
  const cells = new Int8Array(N * N), blank = new Uint8Array(N * N);
  let empty = true;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const ch = board[r].charCodeAt(c);
    if (ch === 46) cells[r * N + c] = -1;
    else { empty = false; if (ch >= 97) { cells[r * N + c] = ch - 97; blank[r * N + c] = 1; } else cells[r * N + c] = ch - A; }
  }
  const t0 = now(); let steps = 0, out = false;
  const timeUp = () => { if ((++steps & 1023) === 0 && now() - t0 > budgetMs) out = true; return out; };
  // one direction: g(r, c) reads the board turned so that words run along c; pos(r, c) gives the real square index
  const dirs = empty ? [false] : [false, true];
  const cross = new Int32Array(N), csum = new Int32Array(N), anchor = new Uint8Array(N);
  const stack = []; // placed tiles this search: [col, letter, isBlank]
  for (const down of dirs) {
    const idx = down ? (r, c) => c * N + r : (r, c) => r * N + c;
    const g = (r, c) => (r < 0 || c < 0 || r >= N || c >= N ? -1 : cells[idx(r, c)]);
    const gv = (r, c) => (blank[idx(r, c)] ? 0 : VAL[cells[idx(r, c)]]);
    for (let r = 0; r < N && !out; r++) {
      // cross-checks and anchors for this row
      let any = false;
      for (let c = 0; c < N; c++) {
        anchor[c] = 0; cross[c] = ALL; csum[c] = -1;
        if (g(r, c) >= 0) continue;
        const up = g(r - 1, c) >= 0, dn = g(r + 1, c) >= 0;
        if (empty) { if (r === CENTER && c === CENTER) { anchor[c] = 1; any = true; } continue; }
        if (up || dn || g(r, c - 1) >= 0 || g(r, c + 1) >= 0) { anchor[c] = 1; any = true; }
        if (!up && !dn) continue;
        let top = r; while (g(top - 1, c) >= 0) top--;
        let n = 0, s = 0;
        for (let k = top; k < r && n >= 0; k++) { n = kid(n, g(k, c)); s += gv(k, c); }
        let m = 0;
        if (n >= 0) {
          for (let l = 0; l < 26; l++) {
            let x = kid(n, l); if (x < 0) continue;
            for (let k = r + 1; g(k, c) >= 0 && x >= 0; k++) x = kid(x, g(k, c));
            if (x >= 0 && (MASK[x] >>> 26) & 1) m |= 1 << l;
          }
        }
        for (let k = r + 1; g(k, c) >= 0; k++) s += gv(k, c);
        cross[c] = m; csum[c] = s;
      }
      if (!any) continue;
      const record = (endCol, wordLen, score) => {
        const placed = stack.length;
        if (!placed || wordLen < 2) return;
        const total = score + (placed === RACK ? FULL_BONUS : 0);
        onMove(total, () => stack.map(([c, l, b]) => { const p = idx(r, c); const t = { r: (p / N) | 0, c: p % N, letter: String.fromCharCode(A + l) }; if (b) t.blank = true; return t; }), counts, placed);
      };
      // extend to the right from col, with the main word so far (sum, word multiplier) and the cross words' total
      const extend = (node, col, start, anc, sum, wmul, xs, blanks) => {
        if (timeUp()) return;
        if (col >= N || g(r, col) < 0) {
          if (col > anc && (MASK[node] >>> 26) & 1) record(col, col - start, sum * wmul + xs);
          if (col >= N) return;
          let bits = MASK[node] & cross[col] & ALL;
          if (!bits) return;
          const p = idx(r, col), lm = LM[p], wm = WM[p];
          for (let l = 0; l < 26; l++) {
            if (!((bits >>> l) & 1)) continue;
            const nx = kid(node, l);
            if (counts[l] > 0) {
              counts[l]--; stack.push([col, l, 0]);
              const v = VAL[l] * lm;
              extend(nx, col + 1, start, anc, sum + v, wmul * wm, xs + (csum[col] >= 0 ? (csum[col] + v) * wm : 0), blanks);
              stack.pop(); counts[l]++;
            }
            if (counts[BLANK] > 0 && blanks === 0) {
              counts[BLANK]--; stack.push([col, l, 1]);
              extend(nx, col + 1, start, anc, sum, wmul * wm, xs + (csum[col] >= 0 ? csum[col] * wm : 0), 1);
              stack.pop(); counts[BLANK]++;
            }
          }
        } else {
          const nx = kid(node, g(r, col)); if (nx < 0) return;
          extend(nx, col + 1, start, anc, sum + gv(r, col), wmul, xs, blanks);
        }
      };
      // the left part: tiles from the rack on the empty, quiet squares before the anchor (no cross words there)
      const left = [];
      const leftPart = (node, anc, limit, blanks) => {
        if (timeUp()) return;
        // lay the left part down at anc - len .. anc - 1 and extend from the anchor
        const len = left.length, start = anc - len;
        let sum = 0, wmul = 1;
        for (let i = 0; i < len; i++) { const p = idx(r, start + i), [l, b] = left[i]; sum += b ? 0 : VAL[l] * LM[p]; wmul *= WM[p]; stack.push([start + i, l, b]); }
        extend(node, anc, start, anc, sum, wmul, 0, blanks);
        stack.length -= len;
        if (limit <= 0) return;
        const bits = MASK[node] & ALL;
        for (let l = 0; l < 26; l++) {
          if (!((bits >>> l) & 1)) continue;
          const nx = kid(node, l);
          if (counts[l] > 0) { counts[l]--; left.push([l, 0]); leftPart(nx, anc, limit - 1, blanks); left.pop(); counts[l]++; }
          if (counts[BLANK] > 0 && blanks === 0) { counts[BLANK]--; left.push([l, 1]); leftPart(nx, anc, limit - 1, 1); left.pop(); counts[BLANK]++; }
        }
      };
      for (let a = 0; a < N && !out; a++) {
        if (!anchor[a]) continue;
        if (g(r, a - 1) >= 0) { // the tiles before the anchor are the start of the word
          let s = a - 1; while (g(r, s - 1) >= 0) s--;
          let n = 0, sum = 0;
          for (let k = s; k < a && n >= 0; k++) { n = kid(n, g(r, k)); sum += gv(r, k); }
          if (n >= 0) extend(n, a, s, a, sum, 1, 0, 0);
        } else {
          let limit = 0; while (a - limit - 1 >= 0 && g(r, a - limit - 1) < 0 && !anchor[a - limit - 1]) limit++;
          leftPart(0, a, Math.min(limit, RACK - 1), 0);
        }
      }
    }
  }
  return { timedOut: out, ms: now() - t0 };
}

// ---- what the tiles left on the rack are worth to keep (hard)
const VOWEL = new Uint8Array(26); for (const ch of 'AEIOU') VOWEL[ch.charCodeAt(0) - A] = 1;
export function leaveValue(left) {
  let n = 0, vw = 0, v = 0;
  for (let l = 0; l < 26; l++) {
    const k = left[l]; if (!k) continue;
    n += k; if (VOWEL[l]) vw += k;
    if (k > 1) v -= 2.5 * (k - 1);
    if (VAL[l] >= 5) v -= 1.5 * k;
  }
  n += left[BLANK]; v += 7 * left[BLANK];
  if (left[18]) v += 2.5; // S
  if (left[16] && !left[20]) v -= 6; // Q without U
  if (n) v -= 2 * Math.abs(vw - Math.round((n - left[BLANK]) * 0.42));
  return v;
}

export function bestScore(board, rack) {
  let best = 0;
  findMoves(board, rack, s => { if (s > best) best = s; });
  return best;
}

// which tiles a bot swaps: keeps blanks, one S, one each of two vowels and two easy consonants; the rest goes
function swapLetters(rack) {
  const keep = [], give = [], have = new Set(); let vw = 0, cn = 0;
  for (const l of rack.slice().sort()) {
    if (l === '?' || (l === 'S' && !have.has('S'))) { keep.push(l); have.add(l); continue; }
    if (have.has(l)) { give.push(l); continue; }
    if ('AEIO'.includes(l) && vw < 2) { keep.push(l); have.add(l); vw++; continue; }
    if ('RTLNDC'.includes(l) && cn < 2) { keep.push(l); have.add(l); cn++; continue; }
    give.push(l);
  }
  return give.length ? give : rack.slice(0, Math.min(3, rack.length));
}

export function chooseMove(v, level = 'normal', rng) {
  if (!v || v.seat == null || v.phase !== 'play' || v.turn !== v.seat) return null;
  const moves = v.moves || [];
  if (!moves.length) return null;
  const lv = LEVELS.includes(level) ? level : 'normal';
  const R = rng || viewRng(v);
  const rack = v.rack || [];
  const canSwap = moves.some(m => m.type === 'exchange');
  const canPlace = moves.some(m => m.type === 'place');
  let best = null, bestV = -Infinity, low = null, lowV = Infinity, seen = 0;
  if (canPlace) {
    findMoves(v.board, rack, (score, tiles, left, placed) => {
      if (lv === 'hard') {
        const val = score + leaveValue(left);
        if (val > bestV) { bestV = val; best = { score, tiles: tiles() }; }
      } else if (lv === 'normal') {
        if (R() < 0.5 && score > bestV) { bestV = score; best = { score, tiles: tiles() }; }
        if (!best && score < lowV) { lowV = score; low = { score, tiles: tiles() }; }
      } else {
        // easy: a random short, small word (reservoir pick), else the lowest seen
        if (placed <= 3 && score <= 14) { seen++; if (R() * seen < 1) best = { score, tiles: tiles() }; }
        if (score < lowV) { lowV = score; low = { score, tiles: tiles() }; }
      }
    });
  }
  if (!best) best = low;
  const stuck = () => {
    if (canSwap && (lv !== 'easy' || R() < 0.6)) return { type: 'exchange', letters: lv === 'easy' ? rack.slice(0, 3) : swapLetters(rack) };
    return { type: 'pass' };
  };
  if (!best) return stuck();
  if (lv === 'hard' && canSwap && best.score < 6 && bestV < 4) return stuck();
  return { type: 'place', tiles: best.tiles };
}
