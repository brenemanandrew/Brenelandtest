// Who is where at what time of day. The day follows US Eastern time through daytime.js, a pure function of the shared clock,
// so everything here is too (the NPC rule in CLAUDE.md). Nothing here keeps state except small caches.
//
// A person's day is a list of stints: { h: hour it starts, place }. place is
//   'home'  - the normal life at their area (the beat plans in npcs.js)
//   'away'  - gone for the night (walked off the map through the west end of the fence)
//   { seat } - sitting somewhere else (the picnic folk move to the campfire after dusk)
// Moving from one place to the next starts at the stint's hour and takes as long as the walk.
import { dayPhase, hourOverride } from './daytime.js';

const memo = new Map();
// dayPhase at the start of t's minute (the Intl call is too slow for every NPC every frame)
export function phaseAt(t) {
  const m = Math.floor(t / 60);
  let p = memo.get(m);
  if (!p) {
    p = dayPhase(m * 60000);
    memo.set(m, p);
    if (memo.size > 96) memo.delete(memo.keys().next().value);
  }
  return p;
}
export function clearDayCache() { memo.clear(); stintMemo.clear(); }

// Eastern hour 0..24 at shared time t (seconds), continuous within a minute.
export function hourAt(t) {
  const o = hourOverride();
  if (o !== null) return o;
  const m = Math.floor(t / 60);
  return (phaseAt(t).hour + (t - m * 60) / 3600) % 24;
}
export const pinned = () => hourOverride() !== null;

// Is hour h inside [a, b)? Hours may run past 24 (25 = 1 am) and the span may wrap midnight.
export function inHours(h, a, b) {
  a = ((a % 24) + 24) % 24; b = ((b % 24) + 24) % 24;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

// Absolute shared time at which the most recent hour `hh` began, seen from time t.
export function sinceHour(t, hh) {
  const h = hourAt(t);
  const back = ((h - hh) % 24 + 24) % 24;
  let s = t - back * 3600;
  // a clock change in between (the night the clocks go back or forward) leaves that an hour out: put it right
  if (!pinned()) {
    const off = ((hh - hourAt(s)) % 24 + 36) % 24 - 12, s2 = s + off * 3600;
    if (Math.abs(off) > 0.5 && Math.abs(off) < 1.5 && s2 <= t && Math.abs(hourAt(s2) - hh) < 0.01) s = s2;
  }
  return Math.round(s * 1000) / 1000;
}

// ---------------------------------------------------------------- the rhythm of the yard

export const PAT_HOURS = [9, 17];          // the mail carrier's working day
export const PIZZA_HOURS = [17.5, 25];     // pizza deliveries, 5:30 pm to 1 am
export const LOU_HOURS = [[5.8, 8.6], [17.3, 20.4]]; // Lou jogs at dawn and in the evening
export const DOG_NIGHT = [22, 6];          // both dogs asleep by the front door
// The dogs' high-energy windows: up, playful and roaming. The rest of the day they mostly nap in good dog spots.
export const DOG_LIVELY = [[6, 10], [18, 19], [21, 22]];

export function dogsAsleep(t) { return inHours(hourAt(t), DOG_NIGHT[0], DOG_NIGHT[1]); }
export function dogsLively(t) { const h = hourAt(t); return DOG_LIVELY.some(([a, b]) => inHours(h, a, b)); }
export function louOut(t) { const h = hourAt(t); return LOU_HOURS.some(([a, b]) => inHours(h, a, b)); }

// 'dawn' | 'day' | 'dusk' | 'night' | 'late' (after half past midnight)
export function moodAt(t) {
  const h = hourAt(t), p = phaseAt(t);
  if (inHours(h, 0.5, p.sunrise - 0.8)) return 'late';
  if (inHours(h, p.sunrise - 0.8, p.sunrise + 1.3)) return 'dawn';
  if (inHours(h, p.sunset - 0.9, p.sunset + 0.8)) return 'dusk';
  if (inHours(h, p.sunrise + 1.3, p.sunset - 0.9)) return 'day';
  return 'night';
}
export const isDark = mood => mood === 'night' || mood === 'late';

// The day of each area person, by name. People not listed are always at their area.
// Hours may use sunrise/sunset (sr, ss) of the day in question.
export function stintsFor(name, sr, ss) {
  switch (name) {
    // (Kevin's day is kevin-day.js, Joyce's is joyce-day.js)
    case 'Party Kid': return [{ h: 8.4, place: 'home' }, { h: 20.0, place: 'away' }];                    // bedtime!
    case 'Priya': return [{ h: 10.2, place: 'home' }, { h: 23.2, place: 'away' }];
    case 'Dale': return [{ h: 10.5, place: 'home' }, { h: 22.8, place: 'away' }];
    case 'Reporter': return [{ h: 1.0, place: 'away' }, { h: 8.0, place: 'home' }];                     // off to file the story
    case 'Cultist': return [{ h: sr - 0.4, place: 'away' }, { h: ss + 0.5, place: 'home' }];            // only comes out at night
    default: return null;
  }
}

// Current stint of a person with a timetable at time t: { cur, prev, t0 } (t0 = when it began), or null.
// Stint hours are rounded to whole minutes, so one answer per (name, minute) is exact and can be cached.
const stintMemo = new Map();
export function stintAt(name, t) {
  const m = Math.floor(t / 60), key = name + '|' + m + '|' + hourOverride();
  if (stintMemo.has(key)) return stintMemo.get(key);
  const p = phaseAt(t);
  const list = stintsFor(name, p.sunrise, p.sunset);
  let r = null;
  if (list) {
    const h = hourAt(m * 60);
    const order = list.map(s => ({ ...s, hh: Math.round((((s.h % 24) + 24) % 24) * 60) / 60 })).sort((a, b) => a.hh - b.hh);
    let cur = order[order.length - 1];
    for (const s of order) if (s.hh <= h + 1e-9) cur = s;
    const prev = order[(order.indexOf(cur) - 1 + order.length) % order.length];
    r = { cur, prev, t0: sinceHour(t, cur.hh) };
  }
  stintMemo.set(key, r);
  if (stintMemo.size > 200) stintMemo.delete(stintMemo.keys().next().value);
  return r;
}

// ---------------------------------------------------------------- what people say by the time of day

const AREA_LINES = {
  arkham: {
    night: ['Shh... did you hear that?', 'Keep the lantern high.', 'Something moved in the trees.', 'The stars are wrong tonight.', 'Stay close. Stay quiet.', 'Was that an owl? Tell me that was an owl.'],
    late: ['Shh... did you hear that?', 'Keep the lantern high.', 'Who goes there?', 'The woods are whispering again.'],
    dusk: ['The light is going. Lanterns out.', 'Night is when the clues come out.'],
    day: ['Quiet day. Too quiet.', 'Back to the case files.'],
  },
  unicorns: { night: ['*sleepy neigh*', 'Zzz... sparkles...'], late: ['Zzz... rainbows...'], dusk: ['Neigh... yawn.'] },
  campfire: {
    night: ['Marshmallow?', 'Mine caught fire again!', 'Perfect golden brown.', 'Who has the graham crackers?', 'Look at all those stars.'],
    late: ['Zzz...', '*snore*', 'Mmm... marshmallows...'],
    dusk: ['Fire is just getting good.', 'S\'mores soon!'],
  },
  garden: { dawn: ['Watering before the sun gets hot.', 'Morning dew on the tomatoes!', 'Early bird gets the weeds.'], dusk: ['Time to put the tools away.'] },
  picnic: { dusk: ['Getting chilly...', 'Pack up the basket?', 'Look at that sunset!'] },
  dock: {
    dawn: ['Best bite is at dawn.', 'Mist on the water. Perfect.'],
    dusk: ['Evening rise. Now we are talking.', 'Fish are jumping tonight.'],
    night: ['*snore*', 'Hm? Oh. Evening.', 'Zzz... big one... zzz'],
    late: ['*snore*', 'Zzz... big one... zzz'],
  },
};

// Lines for an area at a mood; replace = true means use only these (e.g. snoring late at night).
export function areaLines(theme, mood) {
  const set = AREA_LINES[theme];
  const lines = set && set[mood];
  if (!lines) return null;
  return { lines, replace: mood === 'late' || (theme === 'dock' && mood === 'night') || theme === 'unicorns' };
}

// A greeting for "E  Say hi" by the time of day (people only), or null to use their own lines.
export function greeting(t, roll) {
  const h = hourAt(t);
  if (roll > 0.5) return null;
  if (inHours(h, 4.5, 11.5)) return roll < 0.25 ? 'Good morning!' : 'Morning!';
  if (inHours(h, 11.5, 17)) return 'Afternoon!';
  if (inHours(h, 17, 21.5)) return 'Good evening!';
  return roll < 0.25 ? 'Late night, huh?' : 'Up late?';
}
