// When Arkham Horror is open at the Lovecraft house. games.json gives the game `venue: "lovecraft-house"` and `playDays` (getDay()
// numbers on the US Eastern calendar, e.g. Sat, Mon, Thu = [6, 1, 4]), open midnight to midnight Eastern on those days. Pure
// functions of the shared clock (net.serverNow()) so every visitor sees the same table, card and storm (weather.js reads houseOpen).
// Only the house's table is gated, never the Arkham website.
import { easternDay } from './wreath-data.js';

export const HOUSE_VENUE = 'lovecraft-house';
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOT = ' ' + String.fromCharCode(183) + ' '; // a middle dot (built, not typed: see CLAUDE.md on escapes)

// Day of the week on the Eastern calendar at UTC ms, getDay() numbering (0 = Sunday; 1970-01-01 was a Thursday).
export const easternWeekday = ms => (((easternDay(ms) + 4) % 7) + 7) % 7;
export const houseGame = games => (games || []).find(g => g && g.venue === HOUSE_VENUE) || null;
export const playDaysOf = gm => (Array.isArray(gm?.playDays) ? gm.playDays : []);
// Is the game open at UTC ms? (a house game without playDays is always open)
export const houseOpen = (gm, ms) => { const d = playDaysOf(gm); return !d.length || d.includes(easternWeekday(ms)); };
// "Mon · Thu · Sat" (the week from Monday, as the days come round)
export const daysText = days => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_NAMES[d].slice(0, 3)).join(DOT);
// The next open day after today: 'tomorrow' | 'Saturday' ('' when it has no days)
export function nextOpen(gm, ms) {
  const days = playDaysOf(gm), dow = easternWeekday(ms);
  for (let k = 1; k <= 7; k++) { const d = (dow + k) % 7; if (days.includes(d)) return k === 1 ? 'tomorrow' : DAY_NAMES[d]; }
  return '';
}
export const todayName = ms => DAY_NAMES[easternWeekday(ms)];
