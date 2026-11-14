// Day and night, following the real clock in US Eastern time (daytime.js), so every visitor shares the same sunrise.
// Everything that changes with the hour comes from one palette table keyed by the sun's height: sky, sun or moon light,
// fog, water, clouds, the grade, lamps and windows. main.js calls update() once a frame with the shared time.
// Other modules read LIGHT (daynight-mats.js) instead of keeping their own clocks.
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { dayPhase, clockText } from './daytime.js';
import { glow } from './toon.js';
import { SUN_DIR } from './world.js';
import { createNightFx } from './daynight-fx.js';
import { LIGHT, WEATHER, GLASS, GLASS_DAY, GLASS_EM_DAY, LAMPS, NIGHT_SPOTS } from './daynight-mats.js';
import { LABELS, cToF } from './weather-data.js';

export { LIGHT };

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const inHours = (h, from, to) => (from <= to ? h >= from && h < to : h >= from || h < to);
// the sun's height -1..1 at an hour (the same curve as daytime.js dayPhase, so an eased hour gives an eased sky)
function sunAt(hour, rise, set) {
  if (hour >= rise && hour <= set) return Math.sin(Math.PI * (hour - rise) / (set - rise));
  return -Math.sin(Math.PI * ((hour - set + 24) % 24) / (24 - (set - rise)));
}

// ------------------------------------------------------------------ windows (daynight-mats.js holds the materials)

const LIT = { color: new THREE.Color('#ffe2a0'), em: new THREE.Color('#ffb24e') };
const DARK = { color: new THREE.Color('#34466e'), em: new THREE.Color('#1a2644') };
const GLASS_SCHEDULE = [ // [night level that switches it on, hour it goes dark, hour it wakes up again]
  [0.2, null, null], [0.3, 1.5, 6.0], [0.42, 23.75, 6.4], [0.55, 22.5, null],
];
function windowOn(k, night, hour) {
  if (k === 4) return 0;
  const [thr, off, wake] = GLASS_SCHEDULE[k];
  const on = smooth(thr - 0.08, thr + 0.08, night);
  if (off !== null && inHours(hour, off, wake ?? 7.5)) return 0;
  return on;
}

// ------------------------------------------------------------------ the palette

// Keys by sun height s (-1 = the middle of the night, 0 = on the horizon, 1 = noon). The two tables agree away from the
// horizon; around it the dawn is peach and gold with mist, the dusk orange, pink and purple.
const COLS = ['top', 'mid', 'hor', 'low', 'fog', 'sun', 'hemiSky', 'hemiGnd', 'wDeep', 'wMid', 'wShallow', 'wSky', 'foam', 'cloud', 'ink', 'glowN'];
const NUMS = ['s', 'sunI', 'hemiI', 'exp', 'warm', 'vig', 'stars', 'cloudI', 'inkK', 'sat'];
const NIGHT = {
  top: '#0b1438', mid: '#1a2a62', hor: '#34468a', low: '#161e44', fog: '#1e2a58', sun: '#000000',
  hemiSky: '#7c92e0', hemiGnd: '#34406a', wDeep: '#0c2442', wMid: '#15385c', wShallow: '#24566e', wSky: '#34488a', foam: '#6c80aa',
  cloud: '#27325e', ink: '#0a0a1c', glowN: '#3a2c48',
  sunI: 0, hemiI: 1.05, exp: 1.12, warm: 0.02, vig: 0.46, stars: 1, cloudI: 0.55, inkK: 0.82, sat: 0.7,
};
const MORNING = {
  top: '#5aa5ea', mid: '#b9dff0', hor: '#ffe3b8', low: '#f6d2a8', fog: '#f3dcc0', sun: '#fff1cf',
  hemiSky: '#cfe8ff', hemiGnd: '#8ba3a6', wDeep: '#1f6f9a', wMid: '#2f9bb4', wShallow: '#6fd3c8', wSky: '#bfe0f5', foam: '#f4fbff',
  cloud: '#9fb5d6', ink: '#1c1a2e', glowN: '#000000',
  sunI: 2.6, hemiI: 1.15, exp: 1.0, warm: 0.06, vig: 0.28, stars: 0, cloudI: 0.35, inkK: 0.92, sat: 1,
};
const k = (s, o, base = MORNING) => ({ ...base, ...o, s });
const DUSK = [
  k(-1, {}, NIGHT),
  k(-0.3, { top: '#0e1a44', mid: '#1e3070', hor: '#3c4c92' }, NIGHT),
  k(-0.15, { top: '#17246a', mid: '#34408e', hor: '#7462a8', low: '#2c2c5c', fog: '#3e4480', sun: '#5a3070', hemiSky: '#8a94d8', hemiGnd: '#3c3c66',
    wDeep: '#122a4e', wMid: '#1f4470', wShallow: '#35648a', wSky: '#5058a0', foam: '#7c86b4', cloud: '#4a3c70', glowN: '#402c50',
    hemiI: 1.02, exp: 1.12, warm: 0.04, vig: 0.42, stars: 0.55, cloudI: 0.5, inkK: 0.85, sat: 0.8 }, NIGHT),
  k(-0.05, { top: '#2c3c8c', mid: '#8a5caa', hor: '#f08a6c', low: '#6a4a7a', fog: '#8c6c9c', sun: '#ff7a50', hemiSky: '#c0a0d8', hemiGnd: '#5c4c6c',
    wDeep: '#24386c', wMid: '#4c5c94', wShallow: '#7c7cac', wSky: '#c48cb4', foam: '#f0d2e2', cloud: '#ff8a8a', ink: '#161428', glowN: '#2c2034',
    sunI: 0.9, hemiI: 1.18, exp: 1.12, warm: 0.08, vig: 0.36, stars: 0.12, cloudI: 0.55, inkK: 0.88, sat: 0.95 }),
  k(0.03, { top: '#4a6cbc', mid: '#dc8ca4', hor: '#ffa862', low: '#e4926c', fog: '#f0aa8a', sun: '#ffa058', hemiSky: '#ffd4bc', hemiGnd: '#7c6272',
    wDeep: '#2a4c7c', wMid: '#6a6c9c', wShallow: '#b08c9c', wSky: '#f2aaa2', foam: '#ffe2d2', cloud: '#ffa070',
    sunI: 2.0, hemiI: 1.28, exp: 1.12, warm: 0.12, vig: 0.32, cloudI: 0.55 }),
  k(0.13, { top: '#5090da', mid: '#f2c4a4', hor: '#ffc27c', low: '#f6b892', fog: '#f5caa2', sun: '#ffc27a', hemiSky: '#ffe2c4', hemiGnd: '#8c8c88',
    wDeep: '#1f628c', wMid: '#3f8caa', wShallow: '#8ac8b8', wSky: '#ffdab8', foam: '#fff4e8', cloud: '#ffc8a0',
    sunI: 2.35, hemiI: 1.12, warm: 0.12, vig: 0.3, cloudI: 0.45 }),
  k(0.32, {}),
  k(0.62, { top: '#509fea', mid: '#b4dcf2', hor: '#f6ead2', low: '#ecdcc2', fog: '#eee4ce', sun: '#fff4e2', sunI: 2.7, warm: 0.05 }),
  k(1, { top: '#4a9ae8', mid: '#acd8f2', hor: '#eef0de', low: '#e4e2cc', fog: '#e8e8d8', sun: '#fff8ec', sunI: 2.8, hemiI: 1.2, warm: 0.04, wSky: '#c6e4f5' }),
];
// Dawn: the same, but peach and rose instead of orange and purple, and a softer, paler light.
const DAWN = DUSK.map(d => ({ ...d }));
Object.assign(DAWN[3], { mid: '#9c7cba', hor: '#ffb0a0', low: '#8a6a8a', fog: '#a88cb0', sun: '#ff9a7a', hemiSky: '#c8b0dc', cloud: '#ffa0a8', wSky: '#d0a0c0', foam: '#f4dce8' });
Object.assign(DAWN[4], { mid: '#eaa8b8', hor: '#ffbc94', low: '#f0b098', fog: '#f4c0a8', sun: '#ffb27c', hemiSky: '#ffd0c0', cloud: '#ffb8a8', wSky: '#f8c0b8', warm: 0.1 });
Object.assign(DAWN[5], { mid: '#f4d0b4', hor: '#ffd49a', fog: '#f6d6b6', sun: '#ffd28e', warm: 0.1 });

function prepare(table) {
  return table.map(kf => {
    const o = {};
    for (const c of COLS) o[c] = new THREE.Color(kf[c]);
    for (const n of NUMS) o[n] = kf[n];
    return o;
  });
}
const T_DUSK = prepare(DUSK), T_DAWN = prepare(DAWN);
function blankState() {
  const o = {};
  for (const c of COLS) o[c] = new THREE.Color();
  for (const n of NUMS) o[n] = 0;
  return o;
}
function sample(table, s, out) {
  let i = 0;
  while (i < table.length - 2 && s > table[i + 1].s) i++;
  const a = table[i], b = table[i + 1];
  const t = smooth(0, 1, (s - a.s) / (b.s - a.s));
  for (const c of COLS) out[c].copy(a[c]).lerp(b[c], t);
  for (const n of NUMS) out[n] = a[n] + (b[n] - a[n]) * t;
  return out;
}
function mixState(a, b, t, out) {
  for (const c of COLS) out[c].copy(a[c]).lerp(b[c], t);
  for (const n of NUMS) out[n] = a[n] + (b[n] - a[n]) * t;
  return out;
}

// ------------------------------------------------------------------ the controller

const WOODS_FOG = new THREE.Color('#2f3f2a'); // the gloom under the trees (by night)
// (by day the deep woods are an October forest, not a teal cave: the shade is lit through autumn leaves and off the leaf
// litter, and the air between the trunks is a warm haze)
const WOODS_HAZE = new THREE.Color('#bdb184');   // the fog by day under the trees
const CANOPY_SKY = new THREE.Color('#ead9a0');   // the hemisphere's sky half by day under the canopy
const LEAF_LITTER = new THREE.Color('#94703f');  // its ground half: the leaf litter's bounce
const STORM_FOG = new THREE.Color('#34343f'); // the Arkham corner's own gloom: colder and thicker
// an overcast sky: flat grey by day, a black lid at night; a storm is darker still
const OVER_DAY = { top: '#7f8ea0', mid: '#a9b4bd', hor: '#c5c9cc', low: '#aeb2b6', fog: '#c3c7cb', hemiSky: '#c9d0d8', hemiGnd: '#8a8f94' };
const OVER_NIGHT = { top: '#090c12', mid: '#11151e', hor: '#1c212c', low: '#11151e', fog: '#151921', hemiSky: '#4f5a76', hemiGnd: '#262c3c' };
const STORM_DAY = { top: '#4b5361', mid: '#6a7280', hor: '#8d9299', low: '#7a7f86', fog: '#8e9398', hemiSky: '#9aa2ae', hemiGnd: '#666a70' };
const SNOW_GND = new THREE.Color('#e8edf4'), FLASH_SKY = new THREE.Color('#e6eaff'), FLASH_FOG = new THREE.Color('#cfd6ff'), FLASH_SUN = new THREE.Color('#dfe6ff');
const SKY_COLS = ['top', 'mid', 'hor', 'low', 'fog', 'hemiSky', 'hemiGnd'];
const prepOne = o => { const c = {}; for (const k of SKY_COLS) c[k] = new THREE.Color(o[k]); return c; };
const T_OVER_DAY = prepOne(OVER_DAY), T_OVER_NIGHT = prepOne(OVER_NIGHT), T_STORM_DAY = prepOne(STORM_DAY);
const FLICKER_LAMPS = new Set(['#ffc766', '#ffcf6a']); // the Arkham gas lamps and the table's candle: they gutter in the storm
export function createDayNight({ scene, renderer, world, ink, npcs, audio }) {
  const skyU = world.sky.material.uniforms, waterU = world.water.material.uniforms;
  const sun = world.sun, hemi = world.hemi;
  const fx = createNightFx(scene, renderer, { spots: NIGHT_SPOTS, npcs });
  const sA = blankState(), sB = blankState(), S = blankState();
  const sunTrue = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3(), glintDir = new THREE.Vector3();
  const tmpC = new THREE.Color(), moonCol = new THREE.Color('#a8bcff'), moonGlint = new THREE.Color('#d6e0ff');
  const carGlass = glow('#cfe8f5'), carGlassBase = carGlass.color.clone(), carGlassNight = new THREE.Color('#2c3a5c');
  const atticNight = glow('#cfeaf6'), atticBase = atticNight.color.clone(); // the peephole in our front door
  const sparkles = ['#fff27a', '#ffc6e0', '#c6e8ff'].map(c => ({ m: glow(c), base: new THREE.Color(c) }));
  let hs = null, clockEl = null, clockText0 = '', clockTitle0 = '', signs = null;
  const over = prepOne(OVER_DAY);
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  // Max graphics: real shadows from the nearest lamps and the campfire. main.js owns the four lamp PointLights it parks
  // on the nearest lit spots; here they get shadow maps when the level is Max (budget: 3 lamps + the fire, 512 maps).
  let quality = 'high', lampLights = null, fireLight = null, fireLights = [], shadowAt = 0;
  function findLights() {
    lampLights = scene.children.filter(o => o.isPointLight && o.userData.lampLight);           // main.js flags its lamp lights
    scene.traverse(o => { if (o.isPointLight && o.userData.fireLight) fireLights.push(o); }); // and campfire.js its fires (the scouts', the lakeside firepit)
    fireLight = fireLights[0] || null; // the one that casts: the nearest burning one (update)
    for (const l of [...lampLights, ...fireLights]) {
      if (!l) continue;
      l.shadow.mapSize.set(GFX.s.lampMap, GFX.s.lampMap); l.shadow.camera.near = 0.3; l.shadow.camera.far = 30; l.shadow.bias = -0.004; l.shadow.normalBias = 0.03;
      l.shadow.autoUpdate = false; // refreshed by hand: the lamps every other frame, the fire every frame (it flickers)
    }
  }
  let shadowFrame = 0;
  function setQuality(q) {
    quality = q;
    // (three r186 dropped PCFSoftShadowMap: asking for it just warns, draws PCF and recompiles every material twice)
    const type = THREE.PCFShadowMap;
    if (renderer.shadowMap.type !== type) {
      renderer.shadowMap.type = type;
      scene.traverse(o => { const m = o.material; if (!m) return; for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true; });
    }
    if (q !== 'max') for (const l of [...(lampLights || []), ...fireLights]) if (l) l.castShadow = false;
    // the class scales Max (gfx.js): a phone's lamp and fire maps are smaller; a new size needs a new map
    for (const l of [...(lampLights || []), ...fireLights]) {
      if (!l) continue;
      if (l.shadow.mapSize.x !== GFX.s.lampMap) { l.shadow.mapSize.set(GFX.s.lampMap, GFX.s.lampMap); l.shadow.map?.dispose(); l.shadow.map = null; }
    }
    shadowAt = 0;
    fx.setQuality?.(q);
  }
  // the Graphics button (main.js) calls world.setQuality: hear about it here too
  const prevQ = world.setQuality;
  world.setQuality = q => { prevQ?.call(world, q); setQuality(q); };

  // bearing (0 = north, 90 = east) and elevation (degrees) to a direction (+x east, -z north)
  const dirFrom = (out, bearing, elev) => {
    const b = THREE.MathUtils.degToRad(bearing), e = THREE.MathUtils.degToRad(elev);
    return out.set(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
  };

  function mountClock() {
    const place = document.getElementById('place');
    const host = document.getElementById('hud-time') || place?.parentElement; // the HUD's slot on the minimap's top edge
    if (!host) return;
    clockEl = document.createElement('span');
    clockEl.id = 'clock';
    clockEl.className = 'pill clock';
    clockEl.title = 'Breneland time (US Eastern)';
    const ic = document.createElement('i'); ic.className = 'clock-ic';
    const b = document.createElement('b');
    clockEl.append(ic, b);
    host.prepend(clockEl);
  }

  function update(dt, ms, camera) {
    WEATHER.frame?.(dt, ms, camera); // weather.js: the forecast -> WEATHER, the rain, the lightning
    const ph = dayPhase(ms);
    // the real clock moves slowly; an hour override jumps, so the hour eases toward it (a quarter second) instead of snapping
    if (hs === null) hs = ph.hour;
    else {
      const d = ((ph.hour - hs + 36) % 24) - 12;
      hs = Math.abs(d) < 0.01 ? ph.hour : (hs + d * Math.min(1, dt * 4) + 24) % 24;
    }
    const hour = hs;
    const dayLen = ph.sunset - ph.sunrise, noon = (ph.sunrise + ph.sunset) / 2;
    const s = sunAt(hour, ph.sunrise, ph.sunset);
    const night = 1 - smooth(-0.12, 0.1, s);
    const morningW = 0.5 + 0.5 * Math.cos(2 * Math.PI * (hour - (noon - 6)) / 24); // 1 at dawn, 0 at dusk, 0.5 at noon and midnight
    sample(T_DAWN, s, sA); sample(T_DUSK, s, sB);
    mixState(sB, sA, morningW, S);

    // ---- the weather: cloud cover greys the sky and dims the sun, rain and storms darken it, snow pales the ground
    const W = WEATHER;
    const cover = W.cloud, flash = W.flash;
    const gloom = clamp01(cover * 0.6 + W.rain * 0.3 + W.storm * 0.25 + W.snow * 0.1 + W.fog * 0.2);
    const overK = Math.pow(cover, 1.3) * 0.92, stormK = clamp01(W.storm * 0.8 + W.rain * 0.3) * (1 - night * 0.6);
    for (const k of SKY_COLS) {
      over[k].copy(T_OVER_DAY[k]).lerp(T_OVER_NIGHT[k], night);
      S[k].lerp(over[k], overK).lerp(T_STORM_DAY[k], stormK);
    }
    S.sun.multiplyScalar(1 - 0.85 * cover);
    S.sunI *= 1 - 0.62 * gloom;  // a dull day is flat-lit, not dark: faces stay readable (the start screen's preview too)
    S.hemiI *= 1 - 0.1 * gloom;
    S.exp *= 1 - 0.1 * gloom;
    S.stars *= 1 - cover * 0.98;
    S.cloud.lerp(tmpC.set('#6d7482'), cover * 0.8); S.cloudI *= 1 - 0.4 * cover;
    S.sat *= 1 - 0.3 * gloom; S.warm *= 1 - gloom; S.vig += 0.1 * W.storm;
    if (W.snow > 0.01) { S.hemiGnd.lerp(SNOW_GND, W.snow * 0.55); S.hemiSky.lerp(SNOW_GND, W.snow * 0.3); S.exp *= 1 + 0.08 * W.snow; }
    W.skyCloud.copy(S.cloud); W.skyCloudI = S.cloudI; // the cloud deck (weather-fx.js) follows the little clouds' tint
    // lightning: the whole sky goes pale, the world gets a hard flash from the sun's slot, the fog lights up
    if (W.skyFlash > 0.001) for (const k of ['top', 'mid', 'hor', 'low']) S[k].lerp(FLASH_SKY, W.skyFlash * 0.8);
    if (flash > 0.001) { S.fog.lerp(FLASH_FOG, flash * 0.7); S.hemiSky.lerp(FLASH_SKY, flash * 0.6); }

    // sun: rises in the east over the ocean, south at noon (over the lagoon), sets in the west over the mountains
    const td = Math.min(1.05, Math.max(-0.05, (hour - ph.sunrise) / dayLen));
    dirFrom(sunTrue, 90 + 180 * td, 52 * s);
    // moon: up in the south-east at dusk, across the south to the south-west by dawn, high enough for friendly shadows
    const nightLen = 24 - dayLen, tn = ((hour - ph.sunset + 24) % 24) / nightLen;
    dirFrom(moonDir, 112 + 140 * tn, 30 + 26 * Math.sin(Math.PI * Math.min(1, tn)));
    const sunW = smooth(-0.07, 0.05, s), moonW = smooth(0.02, 0.2, -s);
    const moonVis = smooth(0.12, -0.08, s);

    // the one shadow-casting light: the sun by day, the moon by night (it swaps while both are down in the twilight)
    if (sunW >= moonW) {
      lightDir.copy(sunTrue);
      if (lightDir.y < 0.11) { lightDir.y = 0.11; lightDir.normalize(); } // shadows no longer than about 9x an object
      sun.color.copy(S.sun); sun.intensity = S.sunI * sunW;
    } else {
      lightDir.copy(moonDir);
      sun.color.copy(moonCol); sun.intensity = 1.05 * moonW;
    }
    const wd = LIGHT.woods, loc = W.local;
    const wdD = wd * (1 - night), wdN = wd * night; // the woods by day, by night (sunset is in between)
    // inside the Arkham corner's storm the sun is gone: a dark, cold light from the cloud cap, lit up by its lightning
    sun.intensity *= 1 - 0.85 * loc;
    if (flash > 0.001) { sun.color.lerp(FLASH_SUN, flash * 0.8); sun.intensity += 3.4 * flash; }
    SUN_DIR.copy(lightDir); // main.js places the light (and its shadow camera) along SUN_DIR every frame
    hemi.color.copy(S.hemiSky).lerp(CANOPY_SKY, wdD * 0.6).lerp(STORM_FOG, loc * 0.5); hemi.groundColor.copy(S.hemiGnd).lerp(LEAF_LITTER, wdD * 0.7);
    // (the deep woods: shady but not gloomy. By day the canopy's shade is filled by light the leaves and litter scatter, by
    // night dark but readable)
    hemi.intensity = S.hemiI * LIGHT.introHemi * (1 + 0.55 * wdD - 0.18 * wdN) * (1 - 0.45 * loc) + 1.8 * flash;
    renderer.toneMappingExposure = S.exp * LIGHT.introExposure * (1 - 0.08 * wdN) * (1 - 0.22 * loc);
    scene.fog.color.copy(S.fog).lerp(WOODS_HAZE, wdD * 0.5).lerp(WOODS_FOG, wdN * 0.6).lerp(STORM_FOG, loc * 0.9).lerp(FLASH_FOG, flash * 0.6);
    // fog: the woods close it in, then the weather (mist, rain, snow) closes it in further, and the Arkham storm most of all
    const fogK = clamp01(W.fog + W.rain * 0.3 + W.snow * 0.35 + W.storm * 0.2);
    const near0 = 110 + (26 + 16 * (1 - night) - 110) * wd, far0 = 780 + (95 + 75 * (1 - night) - 780) * wd; // (by day the haze opens out: 42 / 170 m)
    let near = near0 + (9 - near0) * fogK, far = far0 + (58 - far0) * fogK;
    near += (3 - near) * loc; far += (34 - far) * loc;
    scene.fog.near = near; scene.fog.far = far;
    renderer.setClearColor(scene.fog.color);

    // sky
    skyU.uTop.value.copy(S.top); skyU.uMid.value.copy(S.mid); skyU.uHorizon.value.copy(S.hor); skyU.uLow.value.copy(S.low);
    skyU.uSun.value.copy(S.sun); skyU.uSunDir.value.copy(sunTrue);
    skyU.uMoonDir.value.copy(moonDir); skyU.uMoon.value = moonVis;
    skyU.uStars.value = S.stars; skyU.uGlow.value.copy(S.glowN);
    skyU.uTime.value = ms / 1000 % 3600;

    // water follows the sky; the glitter path belongs to whichever light is up
    waterU.uDeep.value.copy(S.wDeep); waterU.uMid.value.copy(S.wMid); waterU.uShallow.value.copy(S.wShallow);
    waterU.uSky.value.copy(S.wSky); waterU.uFoam.value.copy(S.foam);
    if (sunW >= moonW) {
      glintDir.copy(sunTrue); if (glintDir.y < 0.05) { glintDir.y = 0.05; glintDir.normalize(); }
      waterU.uSunCol.value.copy(S.sun); waterU.uGlint.value = sunW;
    } else {
      glintDir.copy(moonDir);
      waterU.uSunCol.value.copy(moonGlint); waterU.uGlint.value = moonW * 0.8;
    }
    waterU.uSunDir.value.copy(glintDir);

    // clouds, the grade, the ink
    if (world.cloudMat) { world.cloudMat.emissive.copy(S.cloud); world.cloudMat.emissiveIntensity = S.cloudI; }
    const u = ink.uniforms;
    if (u.uSat) u.uSat.value = S.sat * (1 + 0.08 * wdD); // (the woods by day: a touch warmer and richer, the autumn colour at eye level)
    u.uWarmth.value = S.warm + 0.04 * wdD; u.uVignette.value = S.vig; u.uInk.value.copy(S.ink);
    if (u.uInkAmt) u.uInkAmt.value = S.inkK;
    if (flash > 0.001 && LIGHT.introHemi >= 1) u.uFlash.value = flash * 0.07; // the ink pass's screen flash (the intro owns it for the door)
    // the intro's door flash: a sunlit yard by day, a soft blue moonlit one at night
    LIGHT.flashColor.set('#fff6dc').lerp(tmpC.set('#9fb6ea'), night);
    LIGHT.flashK = 1 - night * 0.75;
    u.uFlashColor.value.copy(LIGHT.flashColor);

    // windows and lamps
    for (let b = 0; b < 5; b++) {
      const on = windowOn(b, night, hour), m = GLASS[b];
      const dark = night * (1 - on);
      m.color.set(GLASS_DAY).lerp(DARK.color, dark).lerp(LIT.color, on);
      m.emissive.set(GLASS_EM_DAY).lerp(DARK.em, dark).lerp(LIT.em, on);
      m.emissiveIntensity = 0.45 + on * 0.9 - dark * 0.1;
    }
    const lampK = smooth(0.15, 0.6, night);
    // in the Arkham storm the gas lamps and the candle gutter in the gusts; every lamp catches a little of a lightning flash
    const gutter = 1 - 0.45 * W.gust * loc * (0.5 + 0.5 * Math.sin(ms * 0.021) * Math.sin(ms * 0.0077 + 1));
    for (const [col, l] of LAMPS) l.mat.color.copy(l.base).multiplyScalar((0.92 + lampK * 1.6) * (FLICKER_LAMPS.has(col) ? gutter : 1) * (1 + flash * 0.4));
    carGlass.color.copy(carGlassBase).lerp(carGlassNight, night * 0.85);
    atticNight.color.copy(atticBase).lerp(LIT.color, night * 0.7);
    for (const sp of sparkles) sp.m.color.copy(sp.base).multiplyScalar(1 + night * 1.3);
    // painted signs (unlit, so they would glow in the dark): dim them after dusk, still readable
    if (!signs) {
      signs = [];
      const seen = new Set();
      scene.traverse(o => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m && m.isMeshBasicMaterial && m.map && !m.transparent && !seen.has(m)) { seen.add(m); signs.push({ m, base: m.color.clone(), k: 0.4 }); }
        }
      });
      // unlit drifting mist sprites (the Arkham fog) turned into a pale glow at night: dim them more
      scene.traverse(o => { if (o.isSprite && o.material.map && !seen.has(o.material)) { seen.add(o.material); signs.push({ m: o.material, base: o.material.color.clone(), k: 0.62 }); } });
    }
    for (const sg of signs) sg.m.color.copy(sg.base).multiplyScalar(1 - night * sg.k);

    // shared state for everyone else
    LIGHT.hour = hour; LIGHT.sun = s; LIGHT.night = night; LIGHT.twilight = ph.twilight; LIGHT.label = ph.label;
    LIGHT.dawn = ph.twilight * morningW; LIGHT.dusk = ph.twilight * (1 - morningW); LIGHT.moonUp = moonW; LIGHT.moonDir.copy(moonDir); LIGHT.moonVis = moonVis;
    // morning mist over the lagoon: thickest around sunrise, burnt off by the middle of the morning
    const sinceRise = hour - ph.sunrise;
    const mist = smooth(-2.2, -0.6, sinceRise) * (1 - smooth(0.6, 2.4, sinceRise));
    fx.update(dt, ms / 1000, camera, { night, lampK, mist: mist * (1 - cover * 0.6), dawn: LIGHT.dawn, gust: W.gust * (0.4 + loc) });
    if (audio) { audio.night = night; audio.dawn = LIGHT.dawn; audio.dusk = LIGHT.dusk; }

    // Max graphics: the three nearest lamp lights and the campfire cast shadows (updated as you move)
    if (quality === 'max' || GFX.s.fire) { // (GFX.s.fire is only ever true at Max, or in a scenic view: gfx.js VIEW_BOOST)
      if (!lampLights) findLights();
      if (ms > shadowAt || ms < shadowAt - 1000) { // (a clock set back: a lamp turned off kept its shadow maps for hours)
        shadowAt = ms + 400;
        lampLights.forEach((l, i) => { l.castShadow = i < GFX.s.lamps && l.intensity > 0.5; }); // (3 on a computer, 1 on a phone: gfx.js)
        if (fireLights.length > 1 && camera) { // two fires: only the nearest burning one casts
          let best = null, bd = Infinity;
          for (const l of fireLights) { const d = l.intensity < 0.3 ? Infinity : camera.position.distanceTo(l.position); if (d < bd) { bd = d; best = l; } }
          if (best && best !== fireLight) { fireLight.castShadow = false; fireLight = best; }
        }
        if (fireLight) fireLight.castShadow = GFX.s.fire && night > 0.1 && fireLight.intensity >= 0.3 && camera && camera.position.distanceTo(fireLight.position) < GFX.s.fireNear;
      }
      shadowFrame++;
      lampLights.forEach((l, i) => { if (l.castShadow && (shadowFrame + i) % 2 === 0) l.shadow.needsUpdate = true; });
      if (fireLight && fireLight.castShadow && shadowFrame % GFX.s.fireEvery === 0) fireLight.shadow.needsUpdate = true;
    }

    // the clock pill (its tooltip carries the weather in Arden, NC)
    if (!clockEl) mountClock();
    if (clockEl) {
      const text = clockText(hour);
      if (text !== clockText0) {
        clockText0 = text;
        clockEl.lastChild.textContent = text;
        clockEl.classList.toggle('night', night > 0.5);
      }
      const title = `${text} in Breneland (US Eastern)` + (W.tempC !== null && W.tempC !== undefined
        ? `. ${W.place || 'Arden, NC'}: ${cToF(W.tempC)}°F (${Math.round(W.tempC)}°C), ${LABELS[W.condition] || W.condition}` + (W.source === 'override' ? ' (demo)' : W.source === 'none' ? ' (no forecast)' : '')
        : '');
      if (title !== clockTitle0) { clockTitle0 = title; clockEl.title = title; }
    }
  }

  return { update, fx, setQuality, get state() { return S; } };
}
