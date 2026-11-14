// The weather: Breneland's sky follows the real hour-by-hour weather in Arden, NC (lib/weather.js fetches it from
// Open-Meteo; this fetches /api/weather at start and every ten minutes, and again when the server pushes
// { t: 'weather' }). Every visitor picks the condition for the same shared Eastern hour (net.serverNow()), eased
// toward the next hour, so everyone sees the same sky. The state lives in WEATHER (daynight-mats.js): daynight.js
// dims the sun and greys the sky and the fog from it, audio.js leans the wind bed on it, and weather-fx.js draws
// the rain, snow, mist, clouds and the Arkham corner's permanent storm. Lightning is a deterministic schedule from
// the shared clock (weather-data.js), so two visitors see the same flash and hear the same thunder.
//
// In a room (indoor-rooms.js: the camera in our house, on the porch, in the game store, in the Lovecraft house) it stays dry:
// WEATHER.indoor eases to 1 there, and the rain and the wind are muffled, a flash is softer and the fog keeps to the outside.
//
//   ?weather=clear|cloudy|overcast|fog|drizzle|rain|storm|snow|wind   or   breneland.weather.set('storm')
//   breneland.weather.set(null) follows the real forecast again; breneland.weather.state() for the numbers.
import * as THREE from 'three';
import { WEATHER, LIGHT, NIGHT_SPOTS } from './daynight-mats.js';
import { PRESETS, PRESET_GROUND, targetsAt, groundAt, strikesAround, flashAt, SPEED_OF_SOUND, LABELS } from './weather-data.js';
import { createCover } from './weather-cover.js';
import { createWeatherFx } from './weather-fx.js';
import { GFX } from './gfx.js';
import { createWeatherSfx } from './weather-sfx.js';
import { YARD_TREES, LOVECRAFT_HOUSE } from './layout.js';
import { houseGame, houseOpen } from './lovecraft-days.js';
import { COVER } from './weather-cover.js';
import { clamp, angleLerp, smoothstep } from './util.js';
import { roomAt } from './indoor-rooms.js';

// The Arkham storm: a permanent, localised thunderstorm whatever the real sky does. It sits over the Lovecraft house and is
// only there on the game's open days (lovecraft-days.js). `k` is how much of it there is right now (0..1, eased over a few
// seconds), and everything it does is scaled by it. createWeather sets its place too. `r` is how far it reaches (m from its middle:
// no rain past it), `edge` how wide its rim is (the rain full inside r - edge, thinning out to r; the wet ground to r + 2; the
// dark sky, the fog and the wind's own gusts eased over r - 5 .. r + 5 where you stand; the rain's sound with the rain where you stand).
const STORM = { x: LOVECRAFT_HOUSE.x, z: LOVECRAFT_HOUSE.z + 2, r: 23, edge: 6, rain: 0.85, fog: 0.85, lightning: 0.45, k: 1, days: null };
// The Lovecraft house's storm (look-storm, Andrew 2026-11-07: "reduce the area of the rainstorm ... just reducing the area"): it was
// r 21 (full rain to 15 m, out over the street); now it hangs over the house and its grounds: full rain to 9 m (the
// house and the front lawn), thinning over the fence and the sidewalk, gone at 16 m. Its look and timing are as they were.
export const HOUSE_STORM = { r: 16, edge: 7 };
const NUMS = ['cloud', 'rain', 'snow', 'fog', 'wind', 'storm'];
// In a room: a flash comes in through the windows at this much of its strength, and the fog starts this far off (m, past
// the room's far wall) and at least `span` m before it closes in
export const ROOM_AIR = { flash: 0.4, near: 18, span: 30 };

export function createWeather(ctx) {
  const { net, world, player, audio, store, scene } = ctx;
  const ark = ctx.areas.find(a => a.theme === 'arkham');
  if (ark) { STORM.x = ark.x; STORM.z = ark.z; }
  const hg = !ark && houseGame(ctx.config?.games);
  if (hg) { STORM.x = LOVECRAFT_HOUSE.x; STORM.z = LOVECRAFT_HOUSE.z + 2; STORM.r = HOUSE_STORM.r; STORM.edge = HOUSE_STORM.edge; STORM.days = hg; STORM.k = houseOpen(hg, net.serverNow()) ? 1 : 0; }
  const quality = store.get('quality', 'high');
  WEATHER.quality = quality;
  const fx = createWeatherFx(scene, { storm: STORM, quality: GFX.s.particles }); // (how many drops and flakes: by level and device, gfx.js)
  const cover = createCover({ scene, renderer: ctx.renderer, world, storm: STORM, quality }); // snow on the roofs, wet streets, swaying woods
  const sfx = createWeatherSfx(audio);

  // ---------------------------------------------------------------- the data
  let hours = [], fetchedAt = 0, source = 'none', place = 'Arden, NC';
  let override = null;
  try { const q = new URLSearchParams(location.search).get('weather'); if (q && PRESETS[q]) override = q; } catch { /* no location */ }
  async function fetchWeather() {
    try {
      const r = await fetch('/api/weather', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      hours = Array.isArray(j.hours) ? j.hours.filter(h => h && typeof h.t === 'number') : [];
      fetchedAt = j.fetchedAt || 0; source = j.source || 'none'; place = j.place || place;
      retarget(true);
    } catch { /* offline or no server: keep what we have (a clear sky if nothing) */ }
  }
  fetchWeather();
  const timer = setInterval(fetchWeather, 10 * 60 * 1000);
  net.on('weather', () => fetchWeather());

  // ---------------------------------------------------------------- the targets and the eased state
  let target = { ...PRESETS.clear }, retargetAt = 0, first = true;
  const state = { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0, storm: 0, windDir: 0, temp: 18 };
  // what the weather has left on the ground (weather-data.js groundAt: the last day of the forecast, added up hour by
  // hour, so every visitor sees the same snow); an override shows its weather as if it had gone on a while
  const ground = { snow: 0, wet: 0 };
  let groundT = { snow: 0, wet: 0 }, groundPin = null;
  WEATHER.ground = ground;
  function retarget(force) {
    target = override ? { ...PRESETS[override], source: 'override' } : targetsAt(hours, net.serverNow());
    groundT = groundPin || (override ? PRESET_GROUND[override] || { snow: 0, wet: 0 } : groundAt(hours, net.serverNow()));
    if (force) first = true;
  }
  function ease(dt) {
    if (first) { for (const n of NUMS) state[n] = target[n]; state.windDir = target.windDir; state.temp = target.temp; ground.snow = groundT.snow; ground.wet = groundT.wet; first = false; }
    const kg = Math.min(1, dt / 6);
    ground.snow += (groundT.snow - ground.snow) * kg; ground.wet += (groundT.wet - ground.wet) * kg;
    const k = Math.min(1, dt / 3.5); // a few seconds from one sky to the next
    for (const n of NUMS) state[n] += (target[n] - state[n]) * k;
    state.temp += (target.temp - state.temp) * k;
    state.windDir = angleLerp(state.windDir, target.windDir, k);
  }

  // ---------------------------------------------------------------- lightning and thunder
  const played = new Set(); // thunder already played, by strike id
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let manual = null; // a strike called from the console or a test (api.strike)
  function lightning(nowMs, px, pz) {
    let flash = 0, sky = 0, local = 0, localBearing = WEATHER.localBearing || 0; // (the bearing of the strongest local strike: the cap lights up on that side)
    const toArk = Math.hypot(px - STORM.x, pz - STORM.z);
    if (manual) {
      const age = (nowMs - manual.at) / 1000, f = flashAt(age) * manual.power;
      sky = Math.max(sky, f); flash = Math.max(flash, f * (1 - smoothstep(500, 3000, manual.dist)));
      if (manual.local && f > local) { local = f; localBearing = manual.bearing; }
      const arrive = manual.at + manual.dist / SPEED_OF_SOUND * 1000;
      if (nowMs >= arrive && !manual.played) { manual.played = true; sfx.thunder(px + Math.sin(manual.bearing) * 100, 30, pz - Math.cos(manual.bearing) * 100, { dist: manual.dist, power: manual.power }); }
      if (age > 20) manual = null;
    }
    // the real storm, if there is one: strikes all round the sky, far more often than near
    if (state.storm > 0.05) {
      for (const s of strikesAround('sky', nowMs, 0.4 * state.storm)) {
        const age = (nowMs - s.at) / 1000;
        const f = flashAt(age) * s.power;
        sky = Math.max(sky, f);
        flash = Math.max(flash, f * (1 - smoothstep(500, 3000, s.dist)));
        const arrive = s.at + s.dist / SPEED_OF_SOUND * 1000;
        if (nowMs >= arrive && nowMs < arrive + 1500 && !played.has('s' + s.id)) {
          played.add('s' + s.id);
          const d = Math.min(s.dist, 160);
          sfx.thunder(px + Math.sin(s.bearing) * d, 30, pz - Math.cos(s.bearing) * d, { dist: s.dist, power: s.power });
        }
      }
    }
    // the Arkham corner's own storm: close strikes over the trees; seen from afar as flickers in that cloud cap
    const near = smoothstep(STORM.r * 4.5, STORM.r, toArk), seen = smoothstep(220, 40, toArk);
    for (const s of STORM.k > 0.02 ? strikesAround('arkham', nowMs, STORM.lightning, { near: 120, far: 900 }) : []) {
      const age = (nowMs - s.at) / 1000;
      const f = flashAt(age) * s.power * STORM.k;
      if (f > local) { local = f; localBearing = s.bearing; }
      flash = Math.max(flash, f * near * (1 - smoothstep(200, 900, s.dist) * 0.5));
      sky = Math.max(sky, f * seen * 0.7);
      const arrive = s.at + s.dist / SPEED_OF_SOUND * 1000;
      if (nowMs >= arrive && nowMs < arrive + 1500 && !played.has('a' + s.id) && toArk < 140) {
        played.add('a' + s.id);
        const d = Math.min(s.dist, 70);
        sfx.thunder(STORM.x + Math.sin(s.bearing) * d, 25, STORM.z - Math.cos(s.bearing) * d, { dist: s.dist + Math.max(0, toArk - STORM.r) * 2, power: s.power });
      }
    }
    if (played.size > 40) { const old = [...played].slice(0, 20); for (const id of old) played.delete(id); }
    WEATHER.flash = (reduced ? flash * 0.35 : flash) * (1 - (1 - ROOM_AIR.flash) * indoorK); // (in a room it comes in through the windows)
    WEATHER.skyFlash = reduced ? sky * 0.35 : sky;
    WEATHER.localFlash = local; WEATHER.localBearing = localBearing;
  }

  // ---------------------------------------------------------------- per frame (daynight.js calls this first, in every mode)
  const windVec = new THREE.Vector3(), lamps = [], camPos = new THREE.Vector3();
  let lampAt = 0, treeAt = 0, underTree = false, nowS = 0, indoorK = 0;
  const rainAt = (x, z) => Math.max(state.rain, STORM.rain * STORM.k * (1 - smoothstep(STORM.r - STORM.edge, STORM.r, Math.hypot(x - STORM.x, z - STORM.z))));
  const S = { night: 0, lamps, windVec, cam: camPos, player: player.pos, t: 0, rainAt };
  WEATHER.frame = (dt, ms, camera) => {
    nowS += dt;
    if (ms > retargetAt) { retargetAt = ms + 500; retarget(false); }
    ease(dt);
    const px = player.pos.x, pz = player.pos.z;
    // inside the Arkham corner's storm: the transition is a few metres wide at the rim
    const toArk = Math.hypot(px - STORM.x, pz - STORM.z);
    if (STORM.days) { const kT = houseOpen(STORM.days, ms) ? 1 : 0; STORM.k += Math.max(-dt / 4, Math.min(dt / 4, kT - STORM.k)); } // (four seconds in or out at midnight)
    COVER.uWxStorm.value.w = STORM.k;
    const localT = smoothstep(STORM.r + 5, STORM.r - 5, toArk) * STORM.k;
    WEATHER.local += (localT - WEATHER.local) * Math.min(1, dt * 1.5);
    for (const n of NUMS) WEATHER[n] = state[n];
    WEATHER.windDir = state.windDir; WEATHER.tempC = state.temp; WEATHER.condition = target.condition || 'clear';
    WEATHER.source = target.source || source; WEATHER.place = place;
    // a gust now and then (the lanterns and the candle flicker in it, the grass leans)
    const g = Math.max(0, Math.sin(nowS * 0.23) * 0.6 + Math.sin(nowS * 0.71) * 0.4);
    WEATHER.gust = (0.3 + 0.7 * g) * Math.max(state.wind, WEATHER.local * 0.7);
    // the wind as a vector: the forecast's direction is where the wind comes FROM, clockwise from north (-z)
    const b = (state.windDir + 180) * Math.PI / 180, speed = (0.4 + state.wind * 11) * (0.85 + 0.15 * g);
    windVec.set(Math.sin(b) * speed, 0, -Math.cos(b) * speed);
    if (WEATHER.local > 0.01) windVec.multiplyScalar(1 + WEATHER.local * 0.6);
    // the camera in a room (indoor-rooms.js, or a building saying so: api.indoor), eased so the sound never jumps
    if (camera) camPos.copy(camera.position);
    const inT = api.indoor || roomAt(camPos.x, camPos.y, camPos.z, true) ? 1 : 0;
    indoorK += (inT - indoorK) * Math.min(1, dt * 6);
    if (Math.abs(inT - indoorK) < 0.005) indoorK = inT;
    WEATHER.indoor = indoorK;
    lightning(ms, px, pz);
    // the nearest lamps light the rain at night
    if (nowS > lampAt) {
      lampAt = nowS + 0.4;
      lamps.length = 0;
      if (LIGHT.night > 0.03) {
        const cands = [];
        for (const s of NIGHT_SPOTS) { if (!(s.pool > 0 || s.halo > 0)) continue; const d = Math.hypot(s.x - px, s.z - pz); if (d < 30) cands.push([d, s]); }
        cands.sort((a, c) => a[0] - c[0]);
        for (const [, s] of cands.slice(0, 3)) lamps.push({ x: s.x, y: s.y, z: s.z, range: (s.pool || 2) * 1.6 + 2.5, color: s.color });
      }
    }
    // under a canopy? (the woods' trunks, the named yard trees)
    if (nowS > treeAt) {
      treeAt = nowS + 0.3;
      underTree = false;
      for (const t of YARD_TREES) if (!t.gone && Math.hypot(t.x - px, t.z - pz) < 2.9) { underTree = true; break; }
      if (!underTree && world.forest) for (const s of world.forest) { if (Math.abs(s.x - px) < 2.7 && Math.abs(s.z - pz) < 2.7 && Math.hypot(s.x - px, s.z - pz) < 2.7) { underTree = true; break; } }
    }
    S.night = LIGHT.night; S.t = nowS;
    S.indoor = api.indoor ? 1 : 0; // (the camera inside the Lovecraft house: no rain in there; lovecraft-house.js sets it)
    fx.update(dt, WEATHER, S);
    cover.update(dt, ground, WEATHER, S);
    if (audio.ctx) sfx.update(dt, nowS, { rainK: rainAt(px, pz), underTree, px, pz, local: WEATHER.local, indoor: indoorK });
    if (typeof window !== 'undefined' && window.breneland && !window.breneland.weather) window.breneland.weather = api;
  };

  // the air in a room is clear: daynight.js sets the fog for the outside after this frame's update, so just before the frame is
  // drawn (toon.js calls the scene's hook once a frame) the fog is pushed out past the room's walls
  const prevHook = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) {
    prevHook?.apply(this, a);
    const f = scene.fog, k = indoorK;
    if (!f || k < 0.001 || !f.isFog) return;
    const near = f.near + Math.max(0, ROOM_AIR.near - f.near) * k;
    f.far = Math.max(f.far, f.far + Math.max(0, near + ROOM_AIR.span - f.far) * k);
    f.near = near;
  };

  // the Graphics button (main.js) tells the world; the weather listens in
  const prevQ = world.setQuality;
  world.setQuality = q => { prevQ?.call(world, q); WEATHER.quality = q; fx.setQuality(GFX.s.particles); cover.setQuality(q); };

  const api = {
    name: 'weather',
    set(name) {
      if (name === null || name === undefined || name === 'real' || name === 'auto') override = null;
      else if (PRESETS[name]) override = name;
      else return false;
      retarget(true);
      return true;
    },
    get override() { return override; },
    // pin what lies on the ground ({ snow, wet } 0..1, tests and demos); ground(null) follows the weather again; ground() reads it
    ground(v) {
      if (v === undefined) return { ...ground, target: { ...groundT }, pinned: !!groundPin };
      groundPin = v ? { snow: clamp(+v.snow || 0, 0, 1), wet: clamp(+v.wet || 0, 0, 1) } : null;
      retarget(true);
      return true;
    },
    // a strike right now (tests and demos): dist in metres sets the thunder's delay and how hard the world flashes
    strike({ dist = 400, bearing = 0.8, power = 1, local = false } = {}) { manual = { at: net.serverNow(), dist, bearing, power, local, played: false }; },
    get flash() { return WEATHER.flash; },
    state() { return { ...state, condition: WEATHER.condition, source: WEATHER.source, local: WEATHER.local, hours: hours.length, fetchedAt, place, label: LABELS[WEATHER.condition], snowCover: ground.snow, wet: ground.wet }; },
    hours: () => hours,
    rainAt, // (x, z) -> how hard it rains there now, 0..1 (the town's rain or the Arkham storm's, whichever is more)
    refresh: fetchWeather,
    storm: STORM,
    indoor: false,
    get indoorK() { return indoorK; },
    fx, sfx, cover,
    dispose() { clearInterval(timer); },
  };
  ctx.weather = api;
  return api;
}
