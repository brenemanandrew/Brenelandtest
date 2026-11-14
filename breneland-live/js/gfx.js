// Graphics by device: what kind of device this is, which level to start on, and what each level (Fast / High / Max) means on it.
// Auto-detects the best start for a phone, and a phone's Max is scaled to what it can do.
//
//   GFX            the live state, read it like LIGHT / WEATHER (never write it from outside this file):
//                  { info, cls, tier, level, mode: 'auto' | 'manual', why, s }   s = the settings for this class and level
//   detectDevice(renderer)  -> info { gpu, gpuName, mem, cores, dpr, w, h, touch, coarse, mobile, cls, tier, tierWhy, sig }
//   startLevel(info)        -> 'low' | 'high' | 'max' (what auto picks before the frame sample)
//   settingsFor(cls, level) -> s (pixel ratio, shadow maps, lights, particles, MSAA)
//   setLevel(level)         updates GFX.level and GFX.s (main.js setQuality calls it first, then the world hears)
//
// Device classes: 'phone' (a mobile browser, or a coarse pointer on a small screen), 'tablet' (an iPad or an Android
// tablet), 'desktop' (everything else, Surface included). Desktop settings are exactly what the levels always were.
// Tests: ?device=phone|tablet|desktop forces the class (and ?gpu=<renderer string> the chip) without touching the rest.

const mm = q => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch { return false; } };

// The look of each level per class. Phone Max comes from tools/phone-budget-perf.mjs: the lamps' and the campfire's cube shadow
// maps are the big cost at Max (each point light renders the scene six times, so at night Max drew 8.6 M triangles a frame against
// 2.2 M at High). A phone gets one lamp and the fire only up close, smaller maps, the pixel ratio capped at 2 (the S24 Ultra's 3.75
// is 3.5 times the pixels for a picture you can't tell apart at arm's length), 2x MSAA in the ink pass, the 1024 shelter map and
// the High weather particles.
const DESKTOP = {
  low: { pr: 1, msaa: 0, sun: 1024, soft: false, lamps: 0, lampMap: 512, fire: false, fireNear: 45, shelter: 1024, particles: 'low', flies: 1 },
  high: { pr: 1.75, msaa: 4, sun: 2048, soft: false, lamps: 0, lampMap: 512, fire: false, fireNear: 45, shelter: 1024, particles: 'high', flies: 1 },
  max: { pr: 2, msaa: 4, sun: 4096, soft: true, lamps: 3, lampMap: 512, fire: true, fireNear: 45, shelter: 2048, particles: 'max', flies: 2.4 },
};
for (const k in DESKTOP) DESKTOP[k].fireEvery = 1;
// The sun's shadow box (shadows.js): a square of sunBox metres (the map's texel size is sunBox / sun) slid sunAhead metres in front
// of the camera, so it covers what you look at instead of what's behind you. The same size on every level, so up close the shadows
// are just as crisp. The far edge fades out softly.
const SUN_BOX = { sunBox: 96, sunAhead: 30 };
const PHONE = {
  low: { pr: 1, msaa: 0, sun: 1024, soft: false, lamps: 0, lampMap: 256, fire: false, fireNear: 25, shelter: 1024, particles: 'low', flies: 1 },
  high: { pr: 1.5, msaa: 2, sun: 2048, soft: false, lamps: 0, lampMap: 256, fire: false, fireNear: 25, shelter: 1024, particles: 'high', flies: 1 },
  max: { pr: 2, msaa: 2, sun: 2048, soft: true, lamps: 1, lampMap: 256, fire: true, fireNear: 25, shelter: 1024, particles: 'high', flies: 1.5 },
};
// a phone redraws the fire's shadow map every other frame, like the lamps' (a point light's map is six renders of the scene
// out to the light's distance: three.js takes the shadow camera's far from light.distance, so the reach cannot be trimmed)
for (const k in PHONE) PHONE[k].fireEvery = 2;
const TABLET = {
  low: PHONE.low,
  high: { ...PHONE.high, pr: 1.5 },
  max: { ...PHONE.max, lamps: 2, lampMap: 512, sun: 2048, fireNear: 35 },
};
const PROFILES = { desktop: DESKTOP, phone: PHONE, tablet: TABLET };
for (const p of Object.values(PROFILES)) for (const k in p) p[k] = { ...SUN_BOX, ...p[k] };
export const LEVELS = ['low', 'high', 'max'];
export const LEVEL_NAMES = { low: 'Fast', high: 'High', max: 'Max' };
const CLASS_WORDS = { phone: 'phone', tablet: 'tablet', desktop: 'computer' };

export function settingsFor(cls, level) { return (PROFILES[cls] || DESKTOP)[level] || DESKTOP.high; }

// Scenic views: sitting in a view the camera is pinned near your head, so the sun's shadow box can shrink to what that camera can
// ever see (the same map, sharper shadows: 1.5x the texels a metre at 64 m, 1.7x at 56). The fire casts its shadow at night on High
// too (every other frame on a phone), the lamps' maps are finer at Max, and a cone behind your head is hidden for you (shadows.js).
// Laid over the level's settings while the view lasts (setView), gone exactly when it ends. The pixel ratio is left alone: on a
// phone 1.5 -> 1.75 cost more GPU time than everything else together (tools/w1-scenic-cost.mjs), and a Surface would pay the same.
// Fast stays Fast but gets the sharper box.
const VIEW_BOOST = {
  desktop: {
    low: { sunBox: 64, sunAhead: 18 },
    high: { sunBox: 64, sunAhead: 18, fire: true, fireNear: 30 },
    max: { sunBox: 56, sunAhead: 16, fireNear: 30, lampMap: 1024 },
  },
  tablet: {
    low: { sunBox: 64, sunAhead: 18 },
    high: { sunBox: 64, sunAhead: 18, fire: true, fireNear: 25, fireEvery: 2 },
    max: { sunBox: 56, sunAhead: 16, lampMap: 512, fireEvery: 1 },
  },
  phone: {
    low: { sunBox: 64, sunAhead: 18 },
    high: { sunBox: 64, sunAhead: 18, fire: true, fireNear: 25, fireEvery: 2 },
    max: { sunBox: 56, sunAhead: 16, lampMap: 512 },
  },
};
export function viewSettings(cls, level) { return { ...settingsFor(cls, level), ...((VIEW_BOOST[cls] || VIEW_BOOST.desktop)[level] || {}), view: true }; }

export const GFX = {
  info: null, cls: 'desktop', tier: 1, level: 'high', mode: 'auto', why: '', fps: null, view: null,
  s: DESKTOP.high,
  get phone() { return this.cls === 'phone'; },
  // the level's name as Settings shows it: "Max (phone)" when the class scales it
  get label() { return LEVEL_NAMES[this.level] + (this.cls !== 'desktop' && this.level !== 'low' ? ` (${this.cls})` : ''); },
};
export function setLevel(level) {
  GFX.level = LEVELS.includes(level) ? level : 'high';
  GFX.s = GFX.view ? viewSettings(GFX.cls, GFX.level) : settingsFor(GFX.cls, GFX.level);
  return GFX.s;
}
// in a scenic view (kind: 'firepit' | 'bench') or not (null); main.js's ctx.regraphics() then applies GFX.s everywhere
export function setView(kind) { GFX.view = kind || null; return setLevel(GFX.level); }

// "ANGLE (Qualcomm, Adreno (TM) 750, OpenGL ES 3.2)" -> "Adreno 750"; "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x...) Direct3D11 ...)" -> "NVIDIA GeForce RTX 3060"
export function gpuName(s) {
  let n = String(s || '');
  const m = /^ANGLE \((.*)\)$/.exec(n);
  if (m) { const parts = m[1].split(', '); n = parts.length >= 2 ? parts[1] : parts[0]; }
  n = n.replace(/\((TM|R|C)\)/gi, '').replace(/\(0x[0-9a-f]+\)/gi, '').replace(/\b(Direct3D\d*|vs_\d_\d|ps_\d_\d|D3D\d+|OpenGL( ES)?( Engine)?|Metal|Vulkan)\b.*$/i, '');
  return n.replace(/\s+/g, ' ').trim().slice(0, 48) || 'unknown';
}

// How strong the graphics chip is: 0 weak (or software), 1 middling, 2 strong. Rules of thumb by family. Anything we don't know is
// middling (the frame sample sorts it out).
export function gpuTier(gpu) {
  const g = String(gpu || '');
  let m;
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(g)) return [0, 'software graphics'];
  if ((m = /Adreno[^0-9]*(\d{3})/i.exec(g))) { const n = +m[1]; return n >= 730 ? [2, 'a strong chip'] : n >= 640 ? [1, 'a middling chip'] : [0, 'an older chip']; }
  if (/Immortalis|Xclipse/i.test(g)) return [2, 'a strong chip'];
  if ((m = /Mali-G(\d+)/i.exec(g))) { const n = +m[1]; return n >= 710 ? [2, 'a strong chip'] : n >= 76 ? [1, 'a middling chip'] : [0, 'an older chip']; }
  if (/Mali|PowerVR|Vivante|VideoCore|Tegra/i.test(g)) return [0, 'an older chip'];
  if (/Apple M\d|Apple GPU/i.test(g)) return [2, 'an Apple chip'];
  if (/GeForce|RTX|GTX|Quadro|Radeon (RX|Pro)|Arc\b/i.test(g)) return [2, 'a gaming graphics card'];
  if (/Radeon|Iris|UHD|Intel|HD Graphics/i.test(g)) return [1, 'built-in graphics'];
  return [1, 'a chip we do not know'];
}

export function detectDevice(renderer, params = (typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams())) {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { /* some browsers hide it: unknown */ }
  if (params.get('gpu')) gpu = params.get('gpu').slice(0, 120);
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = nav.userAgent || '';
  const mem = Number(nav.deviceMemory) || null, cores = Number(nav.hardwareConcurrency) || null;
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
  const sw = (typeof screen !== 'undefined' && screen.width) || (typeof innerWidth === 'number' ? innerWidth : 1280);
  const sh = (typeof screen !== 'undefined' && screen.height) || (typeof innerHeight === 'number' ? innerHeight : 720);
  const short = Math.min(sw, sh);
  const touch = (nav.maxTouchPoints || 0) > 0, coarse = mm('(pointer: coarse)');
  const mobile = typeof nav.userAgentData?.mobile === 'boolean' ? nav.userAgentData.mobile || /Android.+Mobile|iPhone|iPod/i.test(ua) : /Android.+Mobile|iPhone|iPod|Windows Phone/i.test(ua);
  const tabletUA = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (/Macintosh/i.test(ua) && touch); // iPadOS says Macintosh
  let cls = mobile || (coarse && touch && short < 600) ? 'phone' : tabletUA ? 'tablet' : 'desktop';
  if (PROFILES[params.get('device')]) cls = params.get('device');
  let [tier, tierWhy] = gpuTier(gpu);
  // a small memory or few cores hold a good chip back (deviceMemory is rounded and capped at 8 by the browser)
  if (mem && mem <= 2 && tier > 0) { tier = 0; tierWhy += ', little memory'; } else if (mem && mem <= 4 && tier > 1) { tier = 1; tierWhy += ', 4 GB or less'; }
  if (cores && cores <= 2 && tier > 0) { tier = 0; tierWhy += ', two cores'; } else if (cores && cores <= 4 && tier > 1) { tier = 1; tierWhy += ', four cores'; }
  const name = gpuName(gpu);
  return { gpu: gpu.slice(0, 120), gpuName: name, mem, cores, dpr: Math.round(dpr * 100) / 100, w: sw, h: sh, touch, coarse, mobile, cls, tier, tierWhy,
    sig: [cls, tier, name].join('|') };
}

export function startLevel(info) { return info.tier >= 2 ? 'max' : info.tier === 1 ? 'high' : 'low'; }

// The words for Settings: what was detected, in a short line
export function describe(info) {
  const bits = [info.gpuName !== 'unknown' ? info.gpuName : 'an unknown chip'];
  if (info.mem) bits.push(info.mem + ' GB');
  if (info.cores) bits.push(info.cores + ' cores');
  if (info.dpr > 1.01) bits.push(`${info.dpr}x screen`);
  return `A ${CLASS_WORDS[info.cls] || 'computer'} with ${info.tierWhy} (${bits.join(', ')})`;
}

// Fill in GFX from a detection, the saved choice and the saved auto result. Returns the level to start on.
//   store: main.js's store (get/set). Keys: quality (the level in use), gfxMode ('auto' | 'manual'), gfxAuto ({ sig, level, why,
//   fps }). A saved quality with no gfxMode counts as the player's choice.
export function initGraphics(info, store, forced = null) {
  GFX.info = info; GFX.cls = info.cls; GFX.tier = info.tier;
  let mode = store.get('gfxMode', null);
  const saved = store.get('quality', null);
  if (forced) { mode = 'manual'; store.set('gfxMode', 'manual'); }
  else if (!mode) { mode = LEVELS.includes(saved) ? 'manual' : 'auto'; store.set('gfxMode', mode); }
  GFX.mode = mode;
  let level;
  if (forced) level = forced;
  else if (mode === 'manual' && LEVELS.includes(saved)) level = saved;
  else {
    const rec = store.get('gfxAuto', null);
    if (rec && rec.sig === info.sig && LEVELS.includes(rec.level)) { level = rec.level; GFX.why = rec.why || ''; GFX.fps = rec.fps ?? null; GFX.sampled = true; }
    else { level = startLevel(info); GFX.why = ''; GFX.sampled = false; }
    GFX.mode = 'auto';
  }
  setLevel(level);
  store.set('quality', level);
  return level;
}

// The frame sample: the first seconds of drawing (the start screen, or right after "Pick for me"). Only in auto mode.
// A 2 s settle first (the world finishing its build and the first shaders compiling after the loading screen: a hitch there says
// nothing about the device, and at 0.6 s the bus stop's start-up alone could read a fast PC as 16 fps), then 2.4 s of frames. The
// median frame says it: under 18 fps -> Fast, under 27 fps -> one level down.
// Never raises the level (the running check in main.js only lowers it too).
export const SAMPLE = { SETTLE: 2.0, SPAN: 2.4 };
export function createFrameSample({ onDone }) {
  let on = false, t = 0;
  const dts = [];
  return {
    get running() { return on; },
    start() { on = true; t = 0; dts.length = 0; },
    stop() { on = false; },
    frame(realDt) {
      if (!on || !(realDt > 0)) return;
      t += realDt;
      if (t < SAMPLE.SETTLE) return;
      dts.push(realDt);
      if (t < SAMPLE.SETTLE + SAMPLE.SPAN || dts.length < 20) return;
      on = false;
      const sorted = dts.slice().sort((a, b) => a - b);
      const fps = 1 / sorted[sorted.length >> 1];
      onDone(Math.round(fps));
    },
  };
}
// The running check: once per visit, from the morning on. The first WARM s are skipped (shaders compiling, the house's first draw,
// the town cast building: hitches that say nothing about the walk), then SPAN s of frames. Their median frame decides by
// levelAfterSample (one level down under 27 fps, Fast under 18), so a phone held at 30 fps, or one start-up hitch, doesn't drop Max
// straight to Fast. onDone(fps) once. Never raises the level.
export const RUNNING = { WARM: 2.5, SPAN: 6 };
export function createRunningCheck({ onDone }) {
  let t = 0, done = false;
  const dts = [];
  return {
    get done() { return done; },
    stop() { done = true; },
    frame(realDt) {
      if (done || !(realDt > 0)) return;
      t += realDt;
      if (t < RUNNING.WARM) return;
      dts.push(Math.min(realDt, 1));
      if (t < RUNNING.WARM + RUNNING.SPAN || dts.length < 12) return;
      done = true;
      const sorted = dts.slice().sort((a, b) => a - b);
      onDone(Math.round(1 / sorted[sorted.length >> 1]));
    },
  };
}
export function levelAfterSample(level, fps) {
  if (fps < 18) return 'low';
  if (fps < 27) return LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)];
  return level;
}
