// Weather data, pure functions: the forecast hours from /api/weather -> what the sky should be doing at a given
// shared time, the named presets for ?weather= overrides, and the shared lightning schedule. No Three.js, no DOM,
// so tools can import it in Node and every visitor computes the same sky from the same hours.
import { hash01, clamp, lerp, angleLerp } from './util.js';

export const HOUR = 3600 * 1000;
export const CONDITIONS = ['clear', 'cloudy', 'overcast', 'fog', 'drizzle', 'rain', 'storm', 'snow', 'wind'];

// WMO weather code (Open-Meteo) -> a condition name
export function conditionOf(code) {
  if (code === 95 || code === 96 || code === 99) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'overcast';
  if (code === 2) return 'cloudy';
  return 'clear';
}

// Words for the clock tooltip
export const LABELS = { clear: 'clear', cloudy: 'partly cloudy', overcast: 'overcast', fog: 'foggy', drizzle: 'drizzle', rain: 'rain', storm: 'a thunderstorm', snow: 'snow', wind: 'windy' };

const blank = () => ({ cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0, windDir: 0, storm: 0, temp: 18, condition: 'clear' });

// Demo and test presets (?weather=rain, breneland.weather.set('storm'))
export const PRESETS = {
  clear: { ...blank(), cloud: 0.08, wind: 0.12, temp: 22 },
  cloudy: { ...blank(), cloud: 0.55, wind: 0.2, temp: 19, condition: 'cloudy' },
  overcast: { ...blank(), cloud: 0.95, wind: 0.22, temp: 15, condition: 'overcast' },
  fog: { ...blank(), cloud: 0.6, fog: 0.9, wind: 0.05, temp: 11, condition: 'fog' },
  drizzle: { ...blank(), cloud: 0.78, rain: 0.3, fog: 0.22, wind: 0.2, temp: 13, condition: 'drizzle' },
  rain: { ...blank(), cloud: 0.92, rain: 0.68, fog: 0.14, wind: 0.35, windDir: 240, temp: 12, condition: 'rain' },
  storm: { ...blank(), cloud: 1, rain: 0.92, storm: 1, fog: 0.18, wind: 0.6, windDir: 250, temp: 16, condition: 'storm' },
  snow: { ...blank(), cloud: 0.88, snow: 0.7, fog: 0.22, wind: 0.18, temp: -2, condition: 'snow' },
  wind: { ...blank(), cloud: 0.35, wind: 0.95, windDir: 270, temp: 17, condition: 'wind' },
};

// One validated hour from the server -> the sky's targets for that hour
export function targetsOfHour(h) {
  const cond = conditionOf(h.code);
  const t = { cloud: clamp(h.cloud / 100, 0, 1), rain: 0, snow: 0, fog: 0, wind: clamp(h.wind / 45, 0, 1), windDir: h.windDir, storm: 0, temp: h.temp, condition: cond };
  const wet = h.precip;
  switch (cond) {
    case 'cloudy': t.cloud = Math.max(t.cloud, 0.45); break;
    case 'overcast': t.cloud = Math.max(t.cloud, 0.9); break;
    case 'fog': t.fog = 0.85; t.cloud = Math.max(t.cloud, 0.5); break;
    case 'drizzle': t.rain = 0.22 + Math.min(0.18, wet * 0.1); t.cloud = Math.max(t.cloud, 0.7); t.fog = 0.2; break;
    case 'rain': t.rain = clamp(0.4 + wet * 0.12, 0.4, 0.85); t.cloud = Math.max(t.cloud, 0.85); t.fog = 0.12; break;
    case 'storm': t.rain = clamp(0.7 + wet * 0.06, 0.7, 1); t.cloud = 1; t.storm = 1; t.fog = 0.15; t.wind = Math.max(t.wind, 0.45); break;
    case 'snow': t.snow = clamp(0.35 + h.snow * 0.5, 0.35, 1); t.cloud = Math.max(t.cloud, 0.8); t.fog = 0.2; break;
  }
  if (h.vis < 4000) t.fog = Math.max(t.fog, (1 - h.vis / 4000) * 0.7);
  if (t.wind > 0.6 && cond === 'clear') t.condition = 'wind';
  return t;
}

const NUMS = ['cloud', 'rain', 'snow', 'fog', 'wind', 'storm', 'temp'];
function mixTargets(a, b, k) {
  const o = {};
  for (const n of NUMS) o[n] = lerp(a[n], b[n], k);
  o.windDir = ((angleLerp(a.windDir * Math.PI / 180, b.windDir * Math.PI / 180, k) * 180 / Math.PI) + 360) % 360;
  o.condition = k < 0.5 ? a.condition : b.condition;
  return o;
}

// The sky at a shared time: the hour that contains `nowMs`, eased toward the next hour. With no hour near, clear.
export function targetsAt(hours, nowMs) {
  if (!hours || !hours.length) return { ...PRESETS.clear, source: 'none' };
  let i = -1;
  for (let k = 0; k < hours.length; k++) if (hours[k].t <= nowMs && nowMs < hours[k].t + HOUR) { i = k; break; }
  if (i < 0) { // nothing covers now: the nearest hour within three hours, otherwise clear
    let best = -1, bd = 3 * HOUR;
    for (let k = 0; k < hours.length; k++) { const d = Math.abs(hours[k].t - nowMs); if (d < bd) { bd = d; best = k; } }
    if (best < 0) return { ...PRESETS.clear, source: 'none' };
    return { ...targetsOfHour(hours[best]), source: 'nearest' };
  }
  const a = targetsOfHour(hours[i]);
  const next = hours[i + 1] && hours[i + 1].t === hours[i].t + HOUR ? targetsOfHour(hours[i + 1]) : a;
  const k = (nowMs - hours[i].t) / HOUR;
  return { ...mixTargets(a, next, k), source: 'forecast' };
}

// ---- what the weather leaves on the ground: snow that settles and melts, wet surfaces that dry. A little bookkeeping
// hour by hour over the hours before `nowMs` (the server serves a day back), so every visitor gets the same answer.
//   depth (cm of snow): + the hour's snowfall (Open-Meteo: cm), - melt (warmth, rain on it, a little even below zero)
//   wet 0..1:           + rain and melt water, - drying (faster when warm and windy, slow while it still rains)
// Returns { snow: 0..1 cover, wet: 0..1, depth }.
export function groundAt(hours, nowMs) {
  let depth = 0, wet = 0;
  if (!hours || !hours.length) return { snow: 0, wet: 0, depth: 0 };
  // one stretch of `span` hours with these conditions
  const step = (span, temp, rain, snow, precip, wind) => {
    depth += snow * span;
    const melt = Math.min(depth, (Math.max(0, temp) * 0.3 + rain * 0.4 + (temp > 0 ? 0.1 : 0.02)) * span);
    depth -= melt;
    wet = Math.min(1, wet + (rain * 0.5 + (rain > 0.05 ? 0.25 : 0) + melt * 0.5) * span);
    wet = Math.max(0, wet - (0.22 + Math.max(0, temp) * 0.012 + wind * 0.004) * (precip > 0.05 ? 0.2 : 1) * span);
  };
  let end = null, last = null;
  for (const h of hours) {
    if (h.t >= nowMs) break;
    const temp = typeof h.temp === 'number' ? h.temp : 10, wind = h.wind || 0;
    if (end !== null && h.t > end) step(Math.min(24, (h.t - end) / HOUR), temp, 0, 0, 0, wind); // a gap: dry weather
    step(Math.min(1, (nowMs - h.t) / HOUR), temp, h.rain || 0, h.snow || 0, h.precip || 0, wind); // the hour we are in counts the part that has passed
    end = h.t + HOUR; last = { temp, wind };
  }
  if (end !== null && nowMs > end) step(Math.min(24, (nowMs - end) / HOUR), last.temp, 0, 0, 0, last.wind); // past the last hour we know
  depth = Math.min(depth, 60);
  return { snow: 1 - Math.exp(-depth / 1.6), wet, depth };
}
// What a named preset leaves on the ground once it has gone on a while (?weather= overrides, tests)
export const PRESET_GROUND = { snow: { snow: 1, wet: 0 }, rain: { snow: 0, wet: 1 }, storm: { snow: 0, wet: 1 }, drizzle: { snow: 0, wet: 0.7 } };

// ---- lightning: a shared, deterministic schedule from the server clock, so every visitor sees the same strikes.
// Time is cut into windows of WINDOW ms; each window has a strike with probability `prob` at a hashed moment inside it.
export const WINDOW = 6000;
export function strikesAround(key, nowMs, prob, { near = 200, far = 4000 } = {}) {
  const w0 = Math.floor(nowMs / WINDOW);
  const out = [];
  for (let w = w0 - 3; w <= w0; w++) {
    if (hash01(key, w) >= prob) continue;
    const u = hash01(key, w, 2);
    out.push({
      id: w, at: w * WINDOW + hash01(key, w, 1) * (WINDOW - 800),
      dist: near + u * u * (far - near),                       // metres: most strikes are far, a few are close
      bearing: hash01(key, w, 3) * Math.PI * 2,                // where it is, as seen from the storm's centre
      power: 0.5 + hash01(key, w, 4) * 0.5,
    });
  }
  return out;
}
// The flash's brightness `age` seconds after the strike: a hard flash, a dip, a second flash, then a fast fade
export function flashAt(age) {
  if (age < 0 || age > 0.9) return 0;
  if (age < 0.06) return 1;
  if (age < 0.1) return 0.3;
  if (age < 0.19) return 0.85;
  return Math.exp(-(age - 0.19) * 9);
}
export const SPEED_OF_SOUND = 340; // m/s: thunder arrives dist / 340 seconds after the flash

export const cToF = c => Math.round(c * 9 / 5 + 32);
