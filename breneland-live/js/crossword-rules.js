// The crossword on the cracker barrel in Kevin's Tool Crib (crib-crossword): the rules both sides share. Pure, no imports, so
// the server (lib/crossword.js loads it as a data: URL, the fire-season.js way), every client and the tests agree.
//
//   weekOf(ms)         -> the week number (weeks since WEEK0, a Sunday), switching at midnight Saturday to Sunday, Eastern
//   puzzleOf(week)     -> which of the N_PUZZLES puzzles that week shows (week mod 30)
//   weekStart(week)    -> the ms that week begins (Sunday 00:00 Eastern)
//   cellsOf(e)         -> an entry's squares [[r, c], ...] (e: { r, c, d: 'A' | 'D', len })
//   numberGrid(w, h, open) -> the clue numbers of a grid of open squares (open(r, c) -> bool), row by row: { 'r,c': n }
//   entryAt(entries, r, c, d) -> the index of the entry in direction d through (r, c), or -1
//   pointsFor(len)     -> an answer's points (its length)
//
// A puzzle a browser sees has no answers (lib/crossword-puzzles.json keeps them on the server): only its squares, numbers and
// clues, and the answers already locked in.

export const N_PUZZLES = 30;
export const WEEK0 = Date.UTC(2026, 10, 1);   // Sunday 1 November 2026 (an Eastern calendar date, as UTC midnight)
const H = 3600e3, DAY = 864e5;

// US Eastern time, the rule since 2007 (fire-season.js's: no Intl, so a server and a browser never disagree)
const sundayOf = (y, mo, nth) => 1 + ((7 - new Date(Date.UTC(y, mo - 1, 1)).getUTCDay()) % 7) + (nth - 1) * 7;
const dst = new Map();
function offsetAt(ms) {
  const y = new Date(ms).getUTCFullYear();
  let s = dst.get(y);
  if (!s) { s = [Date.UTC(y, 2, sundayOf(y, 3, 2), 7), Date.UTC(y, 10, sundayOf(y, 11, 1), 6)]; dst.set(y, s); }
  return ms >= s[0] && ms < s[1] ? -4 * H : -5 * H;
}
// the Eastern calendar day of ms, as days since 1970-01-01
export const easternDayOf = ms => Math.floor((ms + offsetAt(ms)) / DAY);
export const weekOf = ms => Math.floor((easternDayOf(ms) - WEEK0 / DAY) / 7);
export const puzzleOf = week => ((week % N_PUZZLES) + N_PUZZLES) % N_PUZZLES;
export function weekStart(week) {
  const d = WEEK0 + week * 7 * DAY;           // that Sunday's date at UTC midnight
  return d - offsetAt(d + 5 * H);             // (midnight Eastern: the clocks change at 2 am, never at midnight)
}

export const step = d => (d === 'A' ? [0, 1] : [1, 0]);
export function cellsOf(e) {
  const [dr, dc] = step(e.d), out = [];
  for (let k = 0; k < e.len; k++) out.push([e.r + dr * k, e.c + dc * k]);
  return out;
}
export function numberGrid(w, h, open) {
  const nums = {};
  let n = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    if (!open(r, c)) continue;
    const across = !open(r, c - 1) && open(r, c + 1), down = !open(r - 1, c) && open(r + 1, c);
    if (across || down) nums[r + ',' + c] = ++n;
  }
  return nums;
}
export function entryAt(entries, r, c, d) {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.d !== d) continue;
    if (d === 'A' ? r === e.r && c >= e.c && c < e.c + e.len : c === e.c && r >= e.r && r < e.r + e.len) return i;
  }
  return -1;
}
export const pointsFor = len => len;
export const cleanAnswer = s => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z]/g, '') : '');
