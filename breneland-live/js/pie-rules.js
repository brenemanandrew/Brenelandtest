// The pie eating contest's rules, shared by the server (lib/pie.js loads this file as a data: URL, like bocce-rules.js) and
// the browsers (pie.js). Plain data and pure functions, no imports.
//
// The first pie takes 18 bites (presses) and each one after takes 6% more. Most pies when the bell rings wins (a pie half eaten
// counts for half; a dead heat goes to whoever got there first). A round: a short wait for others to sit down (lobby), a
// countdown (3, 2, 1, EAT!), 35 seconds of eating, then the winner. Once a week per player, the week starting Monday, Eastern.

export const FIRST = 18;          // bites in the first pie
export const GROW = 1.06;         // each pie after takes 6% more
export const SEATS = 4;
export const MS = { lobby: 10000, count: 3600, eat: 35000, done: 8000 };   // (tests: lib/pie.js PIE_FAST shortens them)
export const MAX_RATE = 12;       // presses a second the server counts at most (anything faster is a stuck key or a script)

// bites needed for pie n (0 = the first): 18, 19, 20, 21, 23, 24, 26, 27, 29, 30...
export const pieNeed = n => Math.round(FIRST * Math.pow(GROW, n));
// how far `bites` presses get you: whole pies eaten, bites into the next, what the next takes, and the score (pies + the fraction)
export function piesOf(bites) {
  let n = 0, left = Math.max(0, Math.floor(bites || 0));
  while (left >= pieNeed(n)) { left -= pieNeed(n); n++; }
  return { pies: n, into: left, need: pieNeed(n), score: n + left / pieNeed(n) };
}
// bites to finish `pies` pies
export function bitesFor(pies) { let b = 0; for (let n = 0; n < pies; n++) b += pieNeed(n); return b; }

// The bots who fill the empty seats: a few personalities at different speeds, beatable at a mash of about 7-8 presses a second
// (never more than about 8 needed), but not pushovers. rate(u, s) = bites a second at u (0..1 through the round) and s
// seconds in. gulp = the seconds they stop to swallow after each pie.
export const BOTS = [
  { id: 'pearl', name: 'Grandma Pearl', line: 'Slow and steady, dearie.', rate: () => 5.0, gulp: 0.35 },
  { id: 'hank', name: 'Hungry Hank', line: 'I skipped breakfast for this!', rate: u => 7.3 - 3.2 * u, gulp: 0.6 },
  { id: 'pip', name: 'Little Pip', line: 'Pie pie pie pie PIE!', rate: (u, s) => (s % 3.4 < 2.4 ? 7.4 : 1.2), gulp: 0.25 },
  { id: 'bertha', name: 'Big Bertha', line: 'Just warming up.', rate: () => 6.2, gulp: 1.1 },
];
export const botById = id => BOTS.find(b => b.id === id) || null;

// The week a moment belongs to: the date of its Monday in US Eastern time ('YYYY-MM-DD'), and the day itself.
const EASTERN = (() => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); } catch { return null; } })();
const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export function easternDay(ms) {
  if (!EASTERN) { const d = new Date(ms - 5 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: (d.getUTCDay() + 6) % 7 }; }
  const p = Object.fromEntries(EASTERN.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, wd: WD[p.weekday] ?? 0 };
}
const iso = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.toISOString().slice(0, 10); };
export const dayKey = ms => { const e = easternDay(ms); return iso(e.y, e.m, e.d); };
export const weekKey = ms => { const e = easternDay(ms); return iso(e.y, e.m, e.d - e.wd); };
// 'Oct 29' from 'YYYY-MM-DD'
export function shortDate(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + d;
}
