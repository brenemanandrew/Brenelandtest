// The community board's automatic notices: what's on in Breneland today, read from the game's own schedules, so it's the same
// on every screen and never needs posting. Pure functions of the shared clock (UTC ms) and the games list (ctx.config.games).
//   autoNotices(ms, games) -> [{ id, title, text, color, kind: 'auto' }]
// A holiday first (paws.js SEASONS), then Arkham Horror at the Lovecraft house (games.json `venue` + `playDays`), the Bookwyrm
// playtest at the game shop (`playtestDays`, 9 am to 9 pm), Joyce's garden hours (joyce-day.js) and Kevin's evening boat trip
// (kevin-day.js). Andrew's own notices (lib/photos.js) go above these.
import { easternDay } from './wreath-data.js';
import { houseGame, houseOpen, nextOpen, daysText, playDaysOf } from './lovecraft-days.js';
import { scheduled, nextPlaytest, easternWeekday } from './game-store.js';
import { seasonOf } from './paws.js';
import { JOYCE_HOURS } from './joyce-day.js';
import { KEVIN_HOURS } from './kevin-day.js';

const HOLIDAYS = {
  halloween: ['Happy Halloween!', 'Dax and Nala have their spooky headbands on. Say hi at the house.'],
  christmas: ['Merry Christmas!', 'The dogs are dressed for the holidays. Come by the house and say hi.'],
  valentines: ["Happy Valentine's Day!", 'Dax and Nala are wearing their hearts. Bring a friend to the firepit.'],
  stpatricks: ["Happy St. Patrick's Day!", 'The dogs have their shamrocks on. Green is the color of the day.'],
  july4: ['Happy 4th of July!', 'Stars and stripes for the dogs. Watch the lake from the bench tonight.'],
};
// 8 -> '8 am', 12 -> 'noon', 18.5 -> '6:30', 19.5 -> '7:30 pm'
export function clockWords(h, ampm = true) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (hh === 12 && !mm) return 'noon';
  const h12 = ((hh + 11) % 12) + 1, suf = hh < 12 ? 'am' : 'pm';
  return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ampm ? ' ' + suf : ''}`;
}

let hourFmt = null;
function easternHour(ms) {
  try { hourFmt = hourFmt || new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }); return Number(hourFmt.format(new Date(ms))) || 0; }
  catch { return new Date(ms - 5 * 3600e3).getUTCHours(); }
}

export function autoNotices(ms, games = []) {
  const out = [];
  const day = easternDay(ms), date = new Date(day * 86400e3), dow = easternWeekday(ms);
  const hour = easternHour(ms); // (only for "today at 9 am" before the shop opens)
  const hol = seasonOf(date.getUTCMonth() + 1, date.getUTCDate());
  if (hol && HOLIDAYS[hol]) out.push({ id: 'holiday', title: HOLIDAYS[hol][0], text: HOLIDAYS[hol][1], color: '#e0463c' });
  const ah = houseGame(games);
  if (ah) {
    out.push(houseOpen(ah, ms)
      ? { id: 'arkham', title: `${ah.name} at the Lovecraft house today`, text: 'The parlor is open all day on Breneland Rd. Bring a lantern.', color: '#6b5a8a' }
      : { id: 'arkham', title: `${ah.name} at the Lovecraft house`, text: `Next game night: ${nextOpen(ah, ms)}. Played ${daysText(playDaysOf(ah))}.`, color: '#6b5a8a' });
  }
  for (const gm of games.filter(g => scheduled(g))) {
    out.push(gm.playtestDays.includes(dow)
      ? { id: 'playtest-' + gm.id, title: `${gm.name} playtest today`, text: 'At the game shop\'s demo table, 9 am to 9 pm. Pull up a chair!', color: '#3f8fd9' }
      : { id: 'playtest-' + gm.id, title: `${gm.name} playtest`, text: `Next one at the game shop: ${nextPlaytest(gm, ms, hour)}.`, color: '#3f8fd9' });
  }
  const gh = JOYCE_HOURS.garden;
  if (gh?.length) {
    const spans = gh.map(([a, b]) => `${clockWords(a, false)} to ${clockWords(b)}`).join(' and ');
    out.push({ id: 'joyce', title: 'Joyce is in the community garden', text: `Every day, ${spans}. She could use a hand.`, color: '#3f9a5a' });
  }
  out.push({ id: 'kevin', title: `Kevin's boat trip at ${clockWords(KEVIN_HOURS.sail)}`, text: `He sails from the pier and takes a friend out till ${clockWords(KEVIN_HOURS.back)}.`, color: '#ef8a2a' });
  for (const n of out) n.kind = 'auto';
  return out;
}
