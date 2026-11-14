// The time of day in Breneland follows the real clock in US Eastern time (America/New_York), so every visitor
// shares the same sunrise and the same night. Pure functions of the shared server clock (net.serverNow()), so
// NPC schedules may use them and stay deterministic.
//
//   dayPhase(ms) -> { hour, sunrise, sunset, sun, night, twilight, label, dayOfYear }
//     hour      0..24 fractional Eastern time
//     sun       -1..1  rough sun height: 1 at solar noon, 0 at sunrise/sunset, negative below the horizon
//     night     0..1   0 in full daylight, 1 in full night (eases over about an hour of twilight each side)
//     twilight  0..1   peaks at 1 right at sunrise and sunset (for the orange/pink sky)
//     label     'dawn' | 'day' | 'dusk' | 'night'
//
// Testing and demos: setHourOverride(20.5) pins the clock to 8:30 pm (null to follow the real clock again);
// a page URL with ?hour=21.5 does the same at load. Never used by the server.

const LAT = 40.7 * Math.PI / 180; // roughly New York
let override = null;
try {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hour') : null;
  if (q !== null && q !== '' && Number.isFinite(+q)) override = ((+q % 24) + 24) % 24;
} catch { /* no location (Node) */ }

export function setHourOverride(h) { override = h === null || h === undefined ? null : ((+h % 24) + 24) % 24; }
export function hourOverride() { return override; }

const fmt = (() => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch { return null; }
})();

// Eastern wall-clock parts for a UTC millisecond time.
export function easternParts(ms) {
  if (fmt) {
    const p = {};
    for (const { type, value } of fmt.formatToParts(new Date(ms))) p[type] = +value;
    return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
  }
  const d = new Date(ms - 5 * 3600e3); // fallback: EST without daylight saving
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}

function dayOfYear(y, mo, d) {
  return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
}

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function dayPhase(ms) {
  const p = easternParts(ms);
  const doy = dayOfYear(p.y, p.mo, p.d);
  let hour = p.h + p.mi / 60 + p.s / 3600;
  if (override !== null) hour = override;
  // day length from the solar declination at this latitude; solar noon near 13:00 during daylight saving, 12:00 otherwise
  const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
  const cosH = -Math.tan(LAT) * Math.tan(decl);
  const half = Math.acos(Math.min(1, Math.max(-1, cosH))) * 12 / Math.PI; // hours from noon to sunset
  const dst = doy > 70 && doy < 308; // close enough to the US daylight-saving window
  const noon = dst ? 13.0 : 12.0;
  const sunrise = noon - half, sunset = noon + half;
  let sun;
  if (hour >= sunrise && hour <= sunset) sun = Math.sin(Math.PI * (hour - sunrise) / (sunset - sunrise));
  else {
    const nightLen = 24 - (sunset - sunrise);
    const since = (hour - sunset + 24) % 24;
    sun = -Math.sin(Math.PI * since / nightLen);
  }
  // twilight: about 45 minutes either side of sunrise and sunset
  const dRise = Math.abs(hour - sunrise), dSet = Math.abs(hour - sunset);
  const twilight = Math.max(0, 1 - Math.min(dRise, dSet) / 0.9);
  const night = 1 - smooth(-0.12, 0.1, sun);
  const label = night > 0.85 ? 'night' : twilight > 0.25 ? (Math.abs(hour - sunrise) < Math.abs(hour - sunset) ? 'dawn' : 'dusk') : night < 0.15 ? 'day' : (hour < noon ? 'dawn' : 'dusk');
  return { hour, sunrise, sunset, sun, night, twilight, label, dayOfYear: doy };
}

// "7:42 pm" for UI.
export function clockText(hour) {
  const h = Math.floor(hour) % 24, m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
