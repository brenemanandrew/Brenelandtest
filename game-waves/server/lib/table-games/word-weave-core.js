// Word Weave's shared pieces (engine and bot): the tiles, the board's bonus squares, the word trie and the check + score of a
// placement. Pure: its one import is its own word list, a sibling.
import { PACKED } from './word-weave-words.js';

export const SIZE = 15, CENTER = 7, RACK = 7, FULL_BONUS = 50;
const A = 65;

// how many of each tile ('?' = a blank, a wildcard worth 0) and what each letter is worth: our own counts, 100 tiles
export const COUNTS = { A: 8, B: 2, C: 3, D: 4, E: 11, F: 2, G: 3, H: 3, I: 8, J: 1, K: 1, L: 4, M: 3, N: 6, O: 7, P: 2, Q: 1, R: 6, S: 6, T: 6, U: 4, V: 1, W: 2, X: 1, Y: 2, Z: 1, '?': 2 };
export const VALUES = { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 3, I: 1, J: 9, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 2, V: 5, W: 4, X: 8, Y: 4, Z: 10, '?': 0 };
export const VAL = new Int32Array(26); for (let i = 0; i < 26; i++) VAL[i] = VALUES[String.fromCharCode(A + i)];

// the bonus squares, our own layout, the same from all eight sides. '.' plain, 'd' Double Letter, 't' Triple Letter,
// 'D' Double Word, 'T' Triple Word, '*' the start square (a Double Word).
function makeLayout() {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
  const put = (ch, pts) => { for (const [a, b] of pts) for (const [x, y] of [[a, b], [b, a]]) for (const sx of [1, -1]) for (const sy of [1, -1]) g[CENTER + sx * x][CENTER + sy * y] = ch; };
  put('d', [[0, 2], [2, 4], [1, 6], [0, 7], [4, 6]]);
  put('t', [[1, 3], [5, 5]]);
  put('D', [[0, 5], [4, 4], [7, 7]]);
  put('T', [[3, 7]]);
  g[CENTER][CENTER] = '*';
  return g.map(r => r.join(''));
}
export const LAYOUT = makeLayout();
export const LMUL = { '.': 1, d: 2, t: 3, D: 1, T: 1, '*': 1 };
export const WMUL = { '.': 1, d: 1, t: 1, D: 2, T: 3, '*': 2 };

// ---- the trie: built once per process on first use. Node i: MASK[i] bits 0-25 its children's letters, bit 26 "a word ends
// here"; its children sit together from FIRST[i] in letter order (child of letter l = FIRST[i] + the set bits below l).
let MASK = null, FIRST = null;
export const pop = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
export function trie() {
  if (MASK) return { MASK, FIRST };
  const words = [];
  let cur = '';
  for (let i = 0; i < PACKED.length;) {
    const p = PACKED.charCodeAt(i) - A; i++;
    let j = i; while (j < PACKED.length && PACKED.charCodeAt(j) >= 97) j++;
    cur = cur.slice(0, p) + PACKED.slice(i, j).toUpperCase();
    words.push(cur); i = j;
  }
  let cap = 1 << 19, mask = new Int32Array(cap), first = new Int32Array(cap), used = 1;
  const grow = need => { while (need > cap) cap *= 2; const m = new Int32Array(cap), f = new Int32Array(cap); m.set(mask); f.set(first); mask = m; first = f; };
  // words[lo..hi) all share their first `d` letters and belong to node `node`
  const build = (node, lo, hi, d) => {
    if (words[lo].length === d) { mask[node] |= 1 << 26; lo++; }
    if (lo >= hi) return;
    const groups = [];
    for (let i = lo; i < hi;) { const ch = words[i].charCodeAt(d) - A; let j = i + 1; while (j < hi && words[j].charCodeAt(d) - A === ch) j++; groups.push([ch, i, j]); i = j; }
    if (used + groups.length > cap) grow(used + groups.length);
    first[node] = used; used += groups.length;
    for (const [ch] of groups) mask[node] |= 1 << ch;
    for (let k = 0; k < groups.length; k++) build(first[node] + k, groups[k][1], groups[k][2], d + 1);
  };
  build(0, 0, words.length, 0);
  MASK = mask.slice(0, used); FIRST = first.slice(0, used);
  return { MASK, FIRST };
}
export const child = (n, l) => ((MASK[n] >>> l) & 1 ? FIRST[n] + pop(MASK[n] & ((1 << l) - 1)) : -1);
export function isWord(w) {
  trie();
  let n = 0;
  for (let i = 0; i < w.length; i++) { const l = w.charCodeAt(i) - A; if (l < 0 || l > 25) return false; n = child(n, l); if (n < 0) return false; }
  return (MASK[n] >>> 26) & 1 ? true : false;
}

// ---- a board: an array of SIZE strings, '.' empty, 'A'-'Z' a tile, 'a'-'z' a blank played as that letter
export const emptyBoard = () => Array.from({ length: SIZE }, () => '.'.repeat(SIZE));
export const at = (B, r, c) => (r < 0 || c < 0 || r >= SIZE || c >= SIZE ? '.' : B[r][c]);
export const tileValue = ch => (ch >= 'A' && ch <= 'Z' ? VALUES[ch] : 0); // (a blank's lower-case letter is worth 0)
export const boardEmpty = B => B.every(row => !/[A-Za-z]/.test(row));

// Check a placement on board B (tiles [{ r, c, letter, blank }], letters already validated A-Z) and score it.
// -> { error } or { score, words: [{ word, score }], main, full }
export function evaluate(B, tiles) {
  if (!tiles.length) return { error: 'Place at least one tile.' };
  const seen = new Set();
  for (const t of tiles) {
    if (!(t.r >= 0 && t.r < SIZE && t.c >= 0 && t.c < SIZE)) return { error: 'That square is off the board.' };
    if (B[t.r][t.c] !== '.') return { error: 'That square is taken.' };
    const k = t.r * SIZE + t.c; if (seen.has(k)) return { error: 'Two tiles on one square.' }; seen.add(k);
  }
  const rows = new Set(tiles.map(t => t.r)), cols = new Set(tiles.map(t => t.c));
  if (rows.size > 1 && cols.size > 1) return { error: 'Tiles must be in one row or one column.' };
  const nw = new Map(tiles.map(t => [t.r * SIZE + t.c, t]));
  const get = (r, c) => { const t = nw.get(r * SIZE + c); return t ? (t.blank ? t.letter.toLowerCase() : t.letter) : at(B, r, c); };
  // the line: across if all in one row with 2+ tiles, or a lone tile with a neighbour across; else down
  let across = rows.size === 1 && cols.size > 1;
  if (tiles.length === 1) { const t = tiles[0]; across = at(B, t.r, t.c - 1) !== '.' || at(B, t.r, t.c + 1) !== '.'; }
  const dr = across ? 0 : 1, dc = across ? 1 : 0;
  const sorted = tiles.slice().sort((a, b) => (a.r - b.r) || (a.c - b.c));
  const f = sorted[0], l = sorted[sorted.length - 1];
  for (let r = f.r, c = f.c; r <= l.r && c <= l.c; r += dr, c += dc) if (get(r, c) === '.') return { error: 'No gaps: the tiles must join up in one line.' };
  const first = boardEmpty(B);
  if (first) {
    if (!nw.has(CENTER * SIZE + CENTER)) return { error: 'The first word must cover the star in the middle.' };
    if (tiles.length < 2) return { error: 'Words need at least 2 letters.' };
  }
  // a word through (r, c) along (dr, dc): its cells
  const wordAt = (r, c, wr, wc) => {
    while (get(r - wr, c - wc) !== '.') { r -= wr; c -= wc; }
    const cells = []; while (get(r, c) !== '.') { cells.push([r, c]); r += wr; c += wc; }
    return cells;
  };
  const scoreCells = cells => {
    let sum = 0, mul = 1, text = '';
    for (const [r, c] of cells) {
      const ch = get(r, c); text += ch.toUpperCase();
      let v = tileValue(ch);
      if (nw.has(r * SIZE + c)) { const sq = LAYOUT[r][c]; v *= LMUL[sq]; mul *= WMUL[sq]; }
      sum += v;
    }
    return { word: text, score: sum * mul };
  };
  const words = [];
  const main = wordAt(f.r, f.c, dr, dc);
  if (main.length >= 2) words.push(scoreCells(main));
  for (const t of sorted) { const cw = wordAt(t.r, t.c, dc, dr); if (cw.length >= 2) words.push(scoreCells(cw)); }
  if (!words.length) return { error: first ? 'Words need at least 2 letters.' : 'Your word must join the tiles already on the board.' };
  if (!first && main.length === tiles.length && words.length === 1) return { error: 'Your word must join the tiles already on the board.' };
  const bad = words.find(w => !isWord(w.word));
  if (bad) return { error: `${bad.word} is not in our word list.` };
  const full = tiles.length === RACK;
  const score = words.reduce((s, w) => s + w.score, 0) + (full ? FULL_BONUS : 0);
  return { score, words, main: words[0].word, full };
}
