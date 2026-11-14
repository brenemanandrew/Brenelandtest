// Andrew's dogs, modelled from his photos (docs/refs/andrew-dax-nala-photo.png and the ones named by each look below).
// Built like unicorn.js with skin.js's helpers: the barrel, chest, rump and neck root are one smooth SDF surface so the toon
// shading sees one animal, the head is another, and the neck is a skinned tube between. Legs are IK'd toward paws placed in
// root space, and the gait advances with distance travelled (no skating). Markings are decals, plus Dax's painted brindle.
// Each frame the pose name becomes a flat target pose, and a pose change cross-fades from a snapshot of what's shown.
import * as THREE from 'three';
import { toon, shadows, soft, glow, GRADIENT_3 } from './toon.js';
import { blob, sweep, limb, sdfMesh, decal, band, mount, merge, paint, surfTo, rbox, _sp, _sn, uvScale, uvMap, X, Y, Z } from './skin.js';
import { setDogVoiceSettings } from './dog-voice.js';

const TAU = Math.PI * 2;
const PI = Math.PI;
const sin = Math.sin, cos = Math.cos, abs = Math.abs;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const easeOut = u => { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); };
const pulse = (a, t0, t1) => (a <= t0 || a >= t1 ? 0 : sin(PI * (a - t0) / (t1 - t0))); // 0..1..0 bump between t0 and t1
const col = c => new THREE.Color(c);
function darker(hex, f = 0.7) { return '#' + col(hex).multiplyScalar(f).getHexString(); }
function mix(a, b, t) { return '#' + col(a).lerp(col(b), t).getHexString(); }

// ------------------------------------------------------------------ the two dogs

// Dax, matched against Andrew's photos (docs/refs/andrew-dax-side2/front2/threequarter2/top/sitting) in the Dog Editor
// (tools/dog-editor-match.mjs lays them side by side): lean, deep-chested, a big flat skull, soft drop ears, a long thin
// tail, a pale grey-fawn coat with fine grey brindle.
export const DAX = {
  name: 'Dax', coat: '#b3a995', stripes: '#55493f', belly: '#d4ccbb', mask: '#4d4239', ear: '#7a6650', earTint: '#ab9d8b', nose: '#2a1f1c', eye: '#2e1a0c', lid: '#8e8070',
  collar: '#8fc4ee', tag: '#d9d9d9', earStyle: 'flop', earSize: 1.5, brows: true, scale: 1.1,
  // soft drop ears from a high set: a short rise off the skull, a fold, then the flap hangs down beside the head
  earCurve: [[-0.012, -0.008], [0, 0], [0.016, 0.008], [0.024, 0.018], [0.006, 0.036], [-0.03, 0.05], [-0.07, 0.058], [-0.1, 0.056]], earFold: 3,
  earW: [[0, 0.03], [0.3, 0.042], [0.7, 0.038], [1, 0]], earDir: [-0.3, -1, 0.05], earNrm: [0.95, 0.1, 0.25], earHang: -0.3,
  tail: -2.1, happyTail: -0.8, curl: 0.5, seed: 11, heavy: 1,   // the tail hangs low at rest and curls up over his back when he is happy
  blaze: false, bib: false, socks: false, hindToes: false, lean: false, prance: 0, browTilt: 0.3, lidDroop: 0.4, noseSize: 0.74, dewlap: 0.6, eyeSize: 0.95,   // (Dog() fills missing keys from NALA, so leave these out and Dax wears her blaze and bib)
  brindleDensity: 1.8, brindleContrast: 1.1, brindleWidth: 0.9,
  build: { len: 1.36, girth: 1.1, width: 0.98, chest: 1.2, tuck: 0.3, rump: 1.0, leg: 1.14, hindLeg: 0.97, legR: 1.3, neck: 1.25, neckR: 1.7, neckAngle: 0.1, head: 1.3, headW: 1.25, skull: 0.92, crown: 0.045, muzzle: 1.1, muzzleH: 1.1, muzzleW: 0.98, flews: 0.6, muzzleRound: 0.02, muzzleK: 0.026, muzzleTilt: 0.12, muzzleTaper: 0.25, headRadial: 0.16, earDrop: 0.002, earSet: 1.15, stop: 0.3, tailLen: 1.5, tailR: 1.4 },
};
export const NALA = {
  name: 'Nala', coat: '#c98a4a', white: '#f7f1e6', blaze: true, bib: true, socks: true, hindToes: true, ear: '#b0703a', nose: '#8a5a50', eye: '#24150d', brows: 'soft', browTilt: 1, lidDroop: 1, noseSize: 1.25,
  collar: '#5b2d8e', tag: '#c8c8c8', earStyle: 'rose', earSize: 1.25, lean: true,
  earCurve: [[-0.012, -0.008], [0, 0], [0.022, 0.006], [0.036, 0.01], [0.02, 0.03], [-0.006, 0.046], [-0.036, 0.056]], earFold: 3,
  earW: [[0, 0.03], [0.32, 0.04], [1, 0]], earDir: [-0.85, -1, 0.15], earNrm: [0.6, 0.3, 0.75], scale: 1.06, tail: -1.3, curl: 0, seed: 5, prance: 1, heavy: 0, dewlap: 1,
  build: { len: 1.24, girth: 1.08, width: 1.0, chest: 1.16, tuck: 0.2, rump: 1.03, leg: 1.04, hindLeg: 0.88, legR: 1.16, neck: 1.15, neckR: 1.5, head: 1.08, headW: 1.1, skull: 1.05, crown: 0.075, muzzle: 1.14, muzzleH: 1.16, muzzleW: 0.96, flews: 0.7, muzzleTaper: 0.3, earDrop: 0.028, tailLen: 0.9, tailR: 1.2 },
};
// Molly, Joyce's older dog (docs/refs/andrew-molly-1.jpg, andrew-molly-2.jpg, andrew-molly-dax-nala.jpg): a heeler / shepherd
// mix, smaller than Dax and Nala, shaggy, dark sable with tan points, a grizzled muzzle, a merle-speckled chest, a white tail
// tip. Pink goggles when she rides in Joyce's golf cart (Dog.goggles). The sable coat is `points` (see sableColors).
export const MOLLY = {
  name: 'Molly', coat: '#33271f', points: '#b8834f', belly: '#d8d3cc', muzzle: '#c4beb6', grizzle: 1, speckle: 1, tailTip: '#f4f0e8', fluff: 0.45, tailBush: 1,
  ear: '#2e231d', nose: '#1d1715', eye: '#231509', lid: '#3a2c24', white: '#efe9df',
  collar: '#ff5ca8', tag: '#d9d9d9', harness: '#b59ae0', goggles: '#ff4fa8',
  earStyle: 'flop', earSize: 1.1, brows: false, browTilt: 0.95, lidDroop: 0.6, noseSize: 1.05, dewlap: 0.3, eyeSize: 0.92, eyeTilt: -0.12,
  earCurve: [[-0.012, -0.008], [0, 0], [0.008, 0.006], [0.01, 0.014], [-0.006, 0.024], [-0.034, 0.032], [-0.066, 0.036], [-0.092, 0.034]], earFold: 3,
  earW: [[0, 0.032], [0.3, 0.046], [0.7, 0.04], [1, 0]], earDir: [-0.2, -1, 0.1], earNrm: [0.98, 0, 0.2], earHang: -0.2,
  tail: -1.95, happyTail: -1.05, curl: 0, seed: 23, heavy: 0.7, prance: 0, scale: 0.92,
  blaze: false, bib: false, socks: false, hindToes: false, lean: false,
  build: { len: 1.32, girth: 1.08, width: 1.02, chest: 1.12, tuck: 0.1, rump: 1.04, leg: 0.95, hindLeg: 0.92, legR: 1.25, neck: 1.08, neckR: 1.6, neckAngle: 0.12, head: 1.16, headW: 1.24, skull: 1.08, crown: 0.09, muzzle: 0.88, muzzleH: 0.98, muzzleW: 0.94, flews: 0.3, muzzleTaper: 0.32, stop: 0.15, earDrop: 0.045, earSet: 1.1, tailLen: 1.15, tailR: 1.5 },
};

// The Dog Editor's (public/editor/dogs.html) extra knobs. Each defaults to no change, and a saved look may set any of them.
export const LOOK_DEF = {
  earHang: 0, earTilt: 0, earCup: 1,            // ears: the flap folded closer in (+) or out, the whole ear tipped back (+), how cupped the leaf is
  eyeTilt: 0,                                   // eyes: the outer corners up (+) or down
  maskAmt: 1, blazeSize: 1, bibSize: 1, sockLen: 1,   // markings: how dark the muzzle mask is, how big the blaze and bib, how long the socks
  brindleDensity: 1, brindleContrast: 1, brindleWidth: 1,
  headCarry: 0, neckCarry: 0, spineLevel: 0,    // posture: the head tipped down (+), the neck bent down (+), the body pitched nose-down (+)
  sitBack: 0, sitTuck: 0, sitFront: 0, sitHead: 0, sitSplay: 0.07,   // the sit (see solveSit)
  // Molly's (all off by default): sable with tan points, merle speckles, a grizzled muzzle, a white tail tip, a shaggy coat,
  // a harness, goggles (shown while she rides in the golf cart)
  points: null, muzzle: null, grizzle: 1, speckle: 1, tailTip: null, fluff: 0, tailBush: null, harness: null, goggles: null,   // (tailBush: null = as fluff)
};
export const BUILD_DEF = {
  topline: 0,      // the back sloping down to the rump (+) or up
  neckAngle: 0,    // the neck leaving the shoulders more upright (+) or flatter (radians)
  stop: 0,         // the brow ridge over the muzzle: deeper (+) or flatter
  earSet: 1, eyeSpread: 1, eyeUp: 0,   // ears further out, eyes further apart, eyes higher on the face
  paw: 1, hock: 0, stance: 1,          // paw size, hind paws forward (+) of their rest (more bend), legs further apart
};
const cloneLook = l => JSON.parse(JSON.stringify(l));
// The dogs as built in (before anything saved by the editor is merged over them): the editor's "what the game ships".
export const DAX_BUILTIN = cloneLook(DAX), NALA_BUILTIN = cloneLook(NALA), MOLLY_BUILTIN = cloneLook(MOLLY);
// Merge saved looks ({ dax, nala, molly }, partial looks as lib/dog-look.js stores them) over DAX, NALA and MOLLY in
// place, so npcs.js picks them up. Keys a saved look leaves out keep their built-in values.
export function applySavedLooks(looks) {
  for (const [id, target] of [['dax', DAX], ['nala', NALA], ['molly', MOLLY]]) {
    const s = looks && looks[id];
    if (!s || typeof s !== 'object') continue;
    const build = { ...target.build, ...(s.build && typeof s.build === 'object' ? s.build : {}) };
    Object.assign(target, s, { build, name: target.name });
    // the voice sliders (look.voice; none saved = the default voice) go to dog-voice.js, not into the body
    setDogVoiceSettings(id, s.voice && typeof s.voice === 'object' ? s.voice : null);
  }
}
// Ask the server for the editor's saved looks (GET /api/dog-look) and merge them in. Called by main.js before the dogs
// are built; nothing saved, no server or no answer within a moment = the built-in dogs.
export async function loadDogLooks(timeoutMs = 2500) {
  try {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ac && setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch('/api/dog-look', { cache: 'no-store', signal: ac ? ac.signal : undefined });
    if (timer) clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    applySavedLooks(j.looks);
    return j.looks || null;
  } catch { return null; }
}

// ------------------------------------------------------------------ materials

const matCache = new Map();
// Everything about a look that changes what is built, as one string (the parts and materials are cached by it).
const lookKey = look => JSON.stringify(look);
// The editor rebuilds a dog at every slider move: the caches keep the last few builds and let the rest go.
const CACHE_MAX = 10;
function trimCache(cache, dispose) {
  while (cache.size > CACHE_MAX) { const k = cache.keys().next().value; dispose(cache.get(k)); cache.delete(k); }
}
// face: the head's own map, finer and fainter brindle (the bold stripes are on his body)
// ?nobrindle skips the painted coat (a URL switch for hunting a crash on a phone)
const DOG_FLAGS = (() => { try { const q = new URLSearchParams(location.search); return { nobrindle: q.has('nobrindle') }; } catch { return {}; } })();
// only what the coat painter reads: a body slider mustn't repaint the coat (the editor stutters on Dax if it does)
const coatKey = look => JSON.stringify([look.name, look.coat, look.belly, look.stripes, look.seed, look.brindleDensity, look.brindleContrast, look.brindleWidth]);
function skinMaterial(look, face = false) {
  if (DOG_FLAGS.nobrindle) look = { ...look, stripes: null };
  if (look.points && !look.stripes) {   // Molly: the sable colours are in the vertices, this map multiplies speckles and fur over them
    const key = 'sable|' + JSON.stringify([look.seed, look.speckle, look.fluff]) + (face ? '|face' : '');
    let m = matCache.get(key);
    if (m) return m;
    m = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: GRADIENT_3 });
    m.map = merleTexture(look, face);
    matCache.set(key, m);
    trimCache(matCache, mm => { mm.map?.dispose(); mm.dispose(); });
    return m;
  }
  if (face && !look.stripes) return skinMaterial(look);
  const key = (look.stripes ? coatKey(look) : look.name + '|plain') + (face ? '|face' : '');
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: GRADIENT_3 });
  if (look.stripes) m.map = brindleTexture(look, face);
  matCache.set(key, m);
  trimCache(matCache, mm => { mm.map?.dispose(); mm.dispose(); });
  return m;
}
const flat = () => toon('#ffffff', { vertexColors: true });

// Brindle: the canvas x runs around the body (0.25 = spine, 0.5 = right flank, 0.75 = belly, 0/1 = left flank), y runs
// along it. Stripes run from the spine down each flank and fade before the belly. Layers: mottling, streaks, grizzle.
function brindleTexture(look, face = false) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  let r = (look.seed * 9301 + 49297) % 2147483647;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  // base coat with the lighter belly band (centred on x = 0.75)
  const gr = c.getContext('2d').createLinearGradient(0, 0, W, 0);
  const base = look.coat, light = look.belly || mix(look.coat, '#ffffff', 0.3);
  gr.addColorStop(0, base); gr.addColorStop(0.58, base); gr.addColorStop(0.68, light); gr.addColorStop(0.82, light); gr.addColorStop(0.92, base); gr.addColorStop(1, base);
  const g0 = c.getContext('2d');
  g0.fillStyle = gr; g0.fillRect(0, 0, W, H);
  // the first and last rows meet at the poles (chest front, under the tail): one even colour there, or the belly band
  // converges into a pale wedge
  const pole = g0.createLinearGradient(0, 0, 0, H), pc = col(mix(base, light, 0.3));
  const rgba = a => `rgba(${Math.round(pc.r * 255)},${Math.round(pc.g * 255)},${Math.round(pc.b * 255)},${a})`;
  pole.addColorStop(0, rgba(1)); pole.addColorStop(0.12, rgba(0)); pole.addColorStop(0.88, rgba(0)); pole.addColorStop(1, rgba(1));
  g0.fillStyle = pole; g0.fillRect(0, 0, W, H);
  // the marks go on their own layer, faded out at the top and bottom rows: those meet at the body's poles (the front of
  // the chest, under the tail), where every column of the texture would crowd into one point
  const m = document.createElement('canvas');
  m.width = W; m.height = H;
  const g = m.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const belly = W * 0.75;
  const dBelly = x => Math.min(abs(x - belly), abs(x + W - belly), abs(x - W - belly));    // distance to the belly (wrapping)
  // 1. darker along the back: brindle is densest on the spine and thins down the flanks
  {
    const sp = W * 0.25, bk = g.createLinearGradient(sp - W * 0.3, 0, sp + W * 0.3, 0);
    bk.addColorStop(0, 'rgba(0,0,0,0)'); bk.addColorStop(0.5, look.stripes); bk.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = face ? 0.1 : 0.22; g.fillStyle = bk; g.fillRect(sp - W * 0.3, 0, W * 0.6, H);
    g.globalAlpha = 1;
  }
  // 2. mottling: soft clouds so the ground is uneven
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, R = 8 + rnd() * 30, f = smoothstep(30, 110, dBelly(x));
    if (f < 0.05) continue;
    const xs = (x < R + 2 || x > W - R - 2) ? [0, -W, W] : [0], ys = (y < R + 2 || y > H - R - 2) ? [0, -H, H] : [0];
    for (const ox of xs) for (const oy of ys) {
      const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R);
      rg.addColorStop(0, look.stripes); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = (0.06 + rnd() * 0.09) * f * (face ? 0.6 : 1); g.fillStyle = rg;
      g.beginPath(); g.arc(x + ox, y + oy, R, 0, TAU); g.fill();
    }
  }
  // a short soft streak from (x0, y0) running down the flank (dir), wavering, tapering
  const streak = (x0, y0, dir, len, width, alpha, color) => {
    const steps = Math.max(3, Math.round(len / 5));
    const ph = rnd() * TAU, amp = 1 + rnd() * 3, lean = (rnd() - 0.5) * 0.9;
    let x = x0, y = y0;
    g.strokeStyle = color;
    for (let i = 0; i < steps; i++) {
      const s = i / steps, L = len / steps;
      const nx = x + dir * L, ny = y0 + lean * (nx - x0) * dir + sin(ph + s * 5) * amp;
      g.lineWidth = Math.max(0.8, width * (1 - 0.6 * s) * (0.7 + 0.6 * rnd()));
      g.globalAlpha = alpha * (1 - 0.4 * s) * smoothstep(20, 80, dBelly(x));
      // the copies shifted by a tile only matter within reach of an edge (the texture wraps); most strokes need just one
      const M = 70, xs = (Math.min(x, nx) < M || Math.max(x, nx) > W - M) ? [0, -W, W] : [0], ys = (Math.min(y, ny) < M || Math.max(y, ny) > H - M) ? [0, -H, H] : [0];
      for (const ox of xs) for (const oy of ys) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(nx + ox, ny + oy); g.stroke(); }
      x = nx; y = ny;
    }
  };
  // 3. the brindle itself: hundreds of fine short streaks, then paler fawn ones between. Drawn sharp and softened once
  // when the layer lands on the coat (below).
  // the editor's brindle knobs: how many streaks, how dark against the coat, how wide
  const dens = look.brindleDensity ?? 1, con = look.brindleContrast ?? 1, wid = look.brindleWidth ?? 1;
  const spine = W * 0.25, N = Math.round((face ? 140 : 360) * dens);
  for (let i = 0; i < N; i++) {
    const dir = rnd() < 0.5 ? 1 : -1, x = spine + dir * rnd() * W * 0.45, y = rnd() * H;
    streak(x, y, dir, 18 + rnd() * 50, (1.4 + rnd() * 2.8) * wid, Math.min(1, ((face ? 0.18 : 0.34) + rnd() * 0.22) * con), look.stripes);
  }
  const pale = mix(look.coat, '#f0e2c4', 0.45);
  for (let i = 0; i < Math.round((face ? 50 : 160) * dens); i++) {
    const dir = rnd() < 0.5 ? 1 : -1, x = spine + dir * rnd() * W * 0.45, y = rnd() * H;
    streak(x, y, dir, 10 + rnd() * 30, (1 + rnd() * 2) * wid, Math.min(1, (0.2 + rnd() * 0.15) * con), pale);
  }
  // 4. grizzle: short faint ticks
  g.strokeStyle = look.stripes;
  for (let i = 0; i < 500; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (dBelly(x) < 70 && rnd() < 0.8) continue;
    g.globalAlpha = (0.08 + rnd() * 0.1) * (face ? 0.5 : 1); g.lineWidth = 1 + rnd() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 6); g.stroke();
  }
  g.globalAlpha = 1;
  const fade = g.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0.3)'); fade.addColorStop(0.2, 'rgba(0,0,0,1)'); fade.addColorStop(0.85, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade; g.fillRect(0, 0, W, H);
  // No canvas blur filter: it crashes Android Chrome's GPU canvas hard enough to take the whole phone down. Instead the
  // marks land twice more, a touch offset and faint, which feathers every streak edge.
  g0.drawImage(m, 0, 0);
  g0.globalAlpha = 0.35; g0.drawImage(m, 0.7, 0.5); g0.drawImage(m, -0.7, -0.5); g0.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Molly's coat. The colours are vertex colours (sableColors), and this mostly white map multiplies over them: merle speckles
// round the belly band, chest and legs, and faint fur strands lying tail-ward. The left edge column stays white because the
// tufts and the harness sample it. Plain strokes only (no canvas filter or shadow: the phone GPU rule).
function merleTexture(look, face = false) {
  const W = 512, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let r = ((look.seed || 1) * 7919 + 104729) % 2147483647;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const belly = W * 0.75, sp = look.speckle ?? 1;
  const dB = x => Math.min(abs(x - belly), abs(x + W - belly), abs(x - W - belly)) / W;   // 0 on the belly line .. 0.5 on the spine
  // fur: short darker strands lying along the body
  g.lineCap = 'round';
  g.strokeStyle = '#000000';
  const nf = Math.round((face ? 2200 : 4200) * Math.min(1.5, 0.4 + (look.fluff || 0) * 0.6));
  for (let i = 0; i < nf; i++) {
    const x = 4 + rnd() * (W - 8), y = rnd() * H, L = 5 + rnd() * (face ? 8 : 16);
    g.globalAlpha = 0.05 + rnd() * 0.12; g.lineWidth = 1 + rnd() * 1.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - L); g.stroke();
  }
  // merle: soft grey clouds, then fine grey, black and tan ticks, only by the belly band (the chest, throat and legs map there)
  for (let i = 0; i < (face ? 20 : 90) * sp; i++) {
    const x = 8 + rnd() * (W - 16), y = rnd() * H;
    if (dB(x) > 0.15) continue;
    g.globalAlpha = 0.12 + rnd() * 0.1; g.fillStyle = '#7a8290';
    g.beginPath(); g.ellipse(x, y, 4 + rnd() * 7, 3 + rnd() * 6, rnd() * 3, 0, TAU); g.fill();
  }
  const ns = Math.round((face ? 900 : 7000) * sp);
  for (let i = 0; i < ns; i++) {
    const x = 8 + rnd() * (W - 16), y = rnd() * H, d = dB(x);
    const p = d < 0.15 ? 1 : d < 0.19 ? 0.35 : 0;
    if (rnd() > p) continue;
    const k = rnd(), tan = k < 0.2, R = 0.5 + rnd() * (face ? 0.7 : 1.2);
    g.globalAlpha = tan ? 0.35 + rnd() * 0.25 : 0.3 + rnd() * 0.35;
    g.fillStyle = tan ? '#c49a6c' : k < 0.6 ? '#3c3c44' : '#76808f';
    g.beginPath(); g.ellipse(x, y, R * (0.8 + rnd() * 0.5), R * (1 + rnd() * 0.8), rnd() * 3, 0, TAU); g.fill();
  }
  g.globalAlpha = 1; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 8, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const UV_PLAIN = [0.006, 0.5];   // a white spot of the merle map (tufts, the harness, the goggles' strap)

// Molly's colours, part by part (THREE.Color scratch values: paint() copies them at once). D = dims(look).
function sableColors(look, D) {
  const B = D.B, F = D.F, l = B.len, g = B.girth;
  const dark = col(look.coat), tan = col(look.points), chest = col(look.belly || '#ddd5ca'), grey = col(look.muzzle || '#c9c2b8');
  const cream = chest.clone().lerp(tan, 0.3);   // (the chest: cream warmed with tan)
  const light = col(mix(look.points, '#f4efe6', 0.55)), gz = look.grizzle ?? 1;
  const o = new THREE.Color();
  const body = (x, y, z) => {
    // the back and the top of the flanks dark sable, warming to tan low on the flanks; the chest and the belly merle-pale
    const up = smoothstep(-0.13 * g, -0.02 * g, y);
    o.copy(tan).lerp(dark, 0.25 + 0.75 * up);
    // the chest and the belly's front pale (the merle map ticks them), tan where it meets the sable, the sable round its sides
    const front = smoothstep(0.19 * l, 0.32 * l, z) * (1 - smoothstep(-0.05, 0.06, y)) * (1 - smoothstep(0.07, 0.125, abs(x)));
    const under = smoothstep(-0.1 * g, -0.15 * g, y) * (1 - smoothstep(0.06, 0.11, abs(x))) * smoothstep(-0.05 * l, 0.12 * l, z);
    const pale = Math.max(front, under * 0.8);
    o.lerp(tan, smoothstep(0, 0.45, pale) * 0.6).lerp(chest, smoothstep(0.35, 1, pale) * 0.92);
    const rear = smoothstep(-0.2 * l, -0.32 * l, z) * (1 - up);   // tan britches under the tail
    return o.lerp(tan, rear * 0.6);
  };
  const ey = F.eye[1];
  const head = (x, y, z) => {
    // tan cheeks; the forehead, the top and the back of the head dark sable (down to just over the eyes)
    const crown = Math.max(smoothstep(ey - 0.004, ey + 0.016, y) * (1 - smoothstep(F.stopZ + 0.025, F.stopZ + 0.065, z)), smoothstep(0.035, -0.02, z) * smoothstep(ey - 0.04, ey, y),
      (1 - smoothstep(0.012, 0.03, abs(x))) * smoothstep(F.mTop - 0.012, F.mTop + 0.004, y) * (1 - smoothstep(F.stopZ + 0.02, F.stopZ + 0.08, z)) * 0.8);   // (dark down the forehead to the eyes, and a little way down the bridge)
    o.copy(tan).lerp(dark, crown * 0.95);
    // the eyes sit in darker fur; tan brow spots over them
    const eye = 1 - smoothstep(0.012, 0.03, Math.hypot(abs(x) - F.eye[0], y - ey));
    o.lerp(dark, eye * 0.55 * smoothstep(0.05, 0.08, z));
    const brow = 1 - smoothstep(0.009, 0.017, Math.hypot(abs(x) - F.eye[0] * 0.85, (y - ey - 0.042) * 1.15));   // (the tan eyebrow dots over the eyes, clear of the lids)
    o.lerp(tan, brow * smoothstep(0.06, 0.09, z));
    // the grizzled grey muzzle (an older dog), tan at its root, paler round the mouth and chin
    const muz = smoothstep(F.stopZ + 0.03, F.stopZ + 0.1, z) * gz, chin = smoothstep(F.mY - 0.01, F.mY - 0.035, y) * smoothstep(F.stopZ - 0.05, F.stopZ, z);
    o.lerp(grey, Math.min(1, muz * 0.85 + chin * 0.5 * gz));
    return o.lerp(light, chin * 0.35 * gz);
  };
  const neck = (ang, t) => {   // sin(ang) > 0: the crest; < 0: the throat
    const s = sin(ang), side = smoothstep(0.55, -0.1, s), throat = smoothstep(-0.55, -0.9, s);
    o.copy(dark).lerp(tan, side * (0.55 + 0.35 * t));
    return o.lerp(chest, throat * (0.85 - 0.25 * t));
  };
  const tail = s => { o.copy(dark); if (look.tailTip) o.lerp(col(look.tailTip), smoothstep(0.7, 0.86, s)); return o; };
  return { dark, tan, chest, cream, light, body, head, neck, tail };
}

// A tuft of shaggy fur: a five-sided cone from p along d (length len, base radius w), painted `color`, the merle map's white
// spot for its uv. Merged into whichever part it grows on, so it costs no draw call.
// It is flattened against the skin (n: the surface normal there), so it lies like a clump of coat rather than a spike.
const _tm = new THREE.Matrix4(), _tx = new THREE.Vector3(), _ty = new THREE.Vector3(), _tz = new THREE.Vector3();
function tuft(p, d, len, w, color, n = null) {
  const gq = new THREE.ConeGeometry(w, len, 5, 1, false);
  gq.translate(0, len / 2, 0);
  gq.scale(1, 1, 0.42);
  _ty.set(d[0], d[1], d[2]).normalize();
  if (n) _tz.set(n[0], n[1], n[2]); else _tz.set(abs(_ty.y) < 0.9 ? 0 : 1, abs(_ty.y) < 0.9 ? 1 : 0, 0);
  _tz.addScaledVector(_ty, -_tz.dot(_ty)).normalize();
  _tx.crossVectors(_ty, _tz);
  gq.applyMatrix4(_tm.makeBasis(_tx, _ty, _tz).setPosition(p[0], p[1], p[2]));
  paint(gq, color);
  return uvMap(gq, () => UV_PLAIN);
}
const _tc = new THREE.Color();
// Tufts on a skin (an SDF shape): at each spec { at: [x, y, z] (projected onto the surface), dir: a bias added to the
// surface normal, len, w } coloured by colorFn at the root.
function tuftsOn(sh, specs, colorFn, k = 1) {
  const out = [];
  for (const s of specs) {
    surfTo(sh, s.at[0], s.at[1], s.at[2], s.from);
    const p = [_sp[0] - _sn[0] * 0.006, _sp[1] - _sn[1] * 0.006, _sp[2] - _sn[2] * 0.006], n = [..._sn];
    const d = [n[0] * 0.4 + s.dir[0], n[1] * 0.4 + s.dir[1], n[2] * 0.4 + s.dir[2]];
    const c0 = s.col || colorFn(p[0], p[1], p[2]);
    out.push(tuft(p, d, s.len * k, s.w * (0.8 + 0.2 * k), _tc.copy(c0).multiplyScalar(s.shade ?? 0.88), n));
  }
  return out;
}

// ------------------------------------------------------------------ dimensions (metres, root scale 1)

// The head (origin at the poll, +z = nose): a flat-topped skull, cheeks, a brow ridge over the stop, and a square muzzle
// with flews, blended into one skin. The build sets how blocky and long it is. F = where the face parts go.
function headShape(B) {
  const hw = B.headW, mz = B.muzzle, mh = B.muzzleH || 1, mw = B.muzzleW || 1, sk = B.skull || 1, cr = B.crown || 0.055, fl = B.flews || 0;
  const st = B.stop || 0, eSp = B.eyeSpread || 1, eUp = B.eyeUp || 0, eSet = B.earSet || 1;   // (the editor's knobs, 0 / 1 = no change)
  const top = 0.07 * sk;                                    // the flat of the skull
  const stopZ = 0.115, mLen = 0.14 * mz;                    // the muzzle runs from the stop to the nose
  const mHy = 0.046 * mh, mY = -0.036 - 0.012 * st, mTop = mY + mHy, tp = B.muzzleTaper || 0;
  const fTop = mY + mHy * (1 - 0.5 * tp) - mHy * tp * 0.5;   // the top of the muzzle at its front (after the taper)
  const S = [
    rbox([0, top / 2 - 0.036, 0.035], [0.096 * hw, top / 2 + 0.036, 0.088], 0, Math.min(cr, top / 2 + 0.03)),             // skull: broad, flat on top
    [0, -0.026, -0.012, 0.078 * hw, 0.074, 0.066, 0.06],                                          // the back of the skull, rounded
    [0.066 * hw, -0.046, 0.07, 0.052 * hw, 0.05, 0.066, 0.05], [-0.066 * hw, -0.046, 0.07, 0.052 * hw, 0.05, 0.066, 0.05],   // cheeks
    [0, top - 0.03 + 0.012 * st, 0.105, 0.082 * hw, 0.032 + 0.016 * st, 0.04 + 0.01 * st, 0.035],   // brow ridge over the stop (deeper with `stop`)
    rbox([0, mY, stopZ + mLen / 2 - 0.01], [0.058 * hw * mw, mHy, mLen / 2 + 0.03], B.muzzleK ?? 0.035, B.muzzleRound ?? 0.04 + 0.006 * (1 - fl), B.muzzleTilt ?? 0.05, tp),   // muzzle: square, tapering to the nose
  ];
  // flews: the upper lips hanging at the sides of the muzzle; a boxy muzzle gets boxy flews (a square jaw line)
  if (fl > 0) for (const s of [-1, 1]) {
    if (B.muzzleRound != null) S.push(rbox([s * 0.036 * hw * mw, mY - mHy + 0.002, stopZ + mLen * 0.5], [0.024 * mw, 0.012 * fl + 0.008, mLen * 0.44], 0.016, 0.009, B.muzzleTilt ?? 0.05, tp));
    else S.push([s * 0.04 * hw * mw, mY - mHy + 0.004, stopZ + mLen * 0.5, 0.028 * mw, 0.02 * fl + 0.01, mLen * 0.4, 0.03]);
  }
  const noseZ = stopZ + mLen + 0.012;
  const F = {
    noseZ, noseY: fTop - 0.016 + 0.006 * tp, noseR: [0.03 * hw * mw * (1 - 0.6 * tp), 0.021 * (1 - 0.3 * tp), 0.02],
    eye: [0.047 * hw * eSp, top - 0.06 + eUp, 0.1], eyeSink: 0.006,
    ear: [0.09 * hw * eSet, top - (B.earDrop ?? 0.02), 0.016],
    brow: [0.047 * hw * eSp, top - 0.03 + eUp, 0.1],
    jaw: [0, mY - mHy + 0.012, stopZ - 0.04], jawLen: mLen + 0.03, jawW: 0.04 * hw * mw,
    muzO: [0, mY - 0.004, stopZ], mTop, mY, mHy, stopZ, mLen, top,
  };
  return { S, o: [0, -0.02, 0.06], ro: [0, -0.02, 0.05], radial: B.headRadial ?? 0.3, stretch: [0.1, 0.09, 0.17], maxT: 0.45, axis: 'z', F };
}

// Leg joints [FL, FR, HL, HR] in body space (origin = barrel centre, +z = nose), where paws rest (root space z)
function dims(look) {
  const B = look.build, g = B.girth, l = B.len, lg = B.leg;
  // front: a short upper arm (mostly inside the chest) and a long forearm; hind: thigh, shin, a long metatarsus
  const hl = lg * (B.hindLeg || 1);                    // hindLeg < 1: a lower rear (Nala), the topline slopes down to the rump
  const L1F = 0.16 * lg, L2F = 0.22 * lg, L1H = 0.195 * hl, L2H = 0.185 * hl, PF = 0.06 * lg, PH = 0.095 * hl;
  const PAW_H = 0.028;
  // width: how broad across (Dax is broad, Nala narrow and athletic); tuck: how far the belly rises from the deep chest to
  // the loin (Nala's waist); rump: how solid the hindquarters are
  const w = B.width || 1, tk = B.tuck || 0, rp = B.rump || 1, stn = B.stance || 1, hk = B.hock || 0;
  const hips = [[0.1 * g * w * stn, -0.045, 0.2 * l], [-0.1 * g * w * stn, -0.045, 0.2 * l], [0.095 * g * w * stn, -0.015, -0.21 * l], [-0.095 * g * w * stn, -0.015, -0.21 * l]];
  // standing height: front legs nearly straight, hind a little bent (dogs stand with angulated hind legs)
  const HB = PAW_H + PF * cos(0.35) + (L1F + L2F) * 0.905 + 0.045;
  const ch = B.chest, nR = Math.sqrt(B.neckR || 1);
  const BODY = {
    S: [
      [0, 0.035 * tk, -0.02 * tk, 0.15 * g * w, 0.145 * g * (1 - 0.3 * tk), 0.3 * l],
      [0, -0.025 - 0.015 * tk, 0.165 * l, 0.165 * g * ch * w, 0.185 * ch, 0.15, 0.1],                   // chest, deep and broad (not pushed out in front of the legs)
      [0, 0.015 + 0.02 * tk, -0.2 * l, 0.145 * g * w * rp, 0.148 * g * rp * (1 - 0.2 * tk), 0.15 * rp, 0.1],   // rump
      [0.11 * g * w, -0.01, 0.17 * l, 0.075 * g, 0.125, 0.11, 0.08], [-0.11 * g * w, -0.01, 0.17 * l, 0.075 * g, 0.125, 0.11, 0.08],   // shoulders
      [0.105 * g * w, -0.03, -0.19 * l, 0.07 * g * rp, 0.115 * rp, 0.1, 0.08], [-0.105 * g * w, -0.03, -0.19 * l, 0.07 * g * rp, 0.115 * rp, 0.1, 0.08],   // haunches
      [0, 0.095, 0.27 * l, 0.08 * g * nR, 0.08 * nR, 0.09 * nR, 0.1],     // root of the neck (withers and throat): thick on a bully mix
    ],
    o: [0, 0, 0.02 * l], ro: [0, -0.02, 0.02 * l], radial: 0.12, stretch: [0.17 * g, 0.17, 0.36 * l], maxT: 0.7, axis: 'z',
  };
  const nk = B.neck;
  // the neck leaves the withers up and forward at about 35 degrees (no S-bend), carrying the head out in front of the chest
  const NECK = [[0.08, 0.25 * l], [0.08 + 0.05 * nk, 0.25 * l + 0.07 * nk], [0.08 + 0.095 * nk, 0.25 * l + 0.14 * nk], [0.08 + 0.13 * nk, 0.25 * l + 0.205 * nk]]; // y, z
  if (B.neckAngle) {   // the editor's neck angle: the whole neck swung about its root, up (+) or down
    const ca = cos(B.neckAngle), sa = sin(B.neckAngle), [y0, z0] = NECK[0];
    for (let i = 1; i < NECK.length; i++) { const dy = NECK[i][0] - y0, dz = NECK[i][1] - z0; NECK[i] = [y0 + dy * ca + dz * sa, z0 - dy * sa + dz * ca]; }
  }
  const nr = g * (B.neckR || 1);
  const neckR = [0.065 * nr, 0.078 * nr, 0.068 * nr, 0.06 * nr];   // (the base sits inside the body's neck root, so it never pokes out of the chest)
  const HEAD = headShape(B), F = HEAD.F;
  // the body pitches nose-up by enough to bring the hips down by what the hind legs lost
  const slope = -Math.atan2((0.195 + 0.185 + 0.095) * (lg - hl) * 0.9, 0.41 * l) - (B.topline || 0);   // (topline: the editor's extra slope)
  return { B, L1F, L2F, L1H, L2H, PF, PH, PAW_H, hips, HB, slope, chestDrop: 0.025 + 0.185 * ch, BODY, NECK, neckR, HEAD, F, MUZ_O: F.muzO, noseZ: F.noseZ, restZ: [0.2 * l, 0.2 * l, -0.22 * l + hk, -0.22 * l + hk], tail: [0, 0.075, -0.33 * l] };
}

// ------------------------------------------------------------------ cached parts per dog

const partCache = new Map();
function partsFor(look, D) {
  const key = lookKey(look);
  let c = partCache.get(key);
  if (c) return c;
  c = {};
  const ms = look.maskAmt ?? 1, bs = look.blazeSize ?? 1, bbs = look.bibSize ?? 1, skl = look.sockLen ?? 1, pawS = look.build.paw || 1;   // the editor's marking knobs
  const brindle = !!look.stripes;
  const coat = brindle ? '#ffffff' : look.coat;        // with a brindle map the vertex colour is a tint
  const white = look.white || '#f7f1e6';
  const B = D.B;
  const SC = look.points && !brindle ? sableColors(look, D) : null;   // Molly's sable coat, part by part
  const fl = SC ? (look.fluff || 0) : 0;                              // ...and how shaggy it is

  // ---- body: one smooth skin, with Nala's bib painted on the chest
  {
    // a plain coat is a little paler underneath (Nala's tan fades toward cream under the chest and belly)
    const under = col(mix(coat, '#fff3dc', 0.3)), top = col(coat), _bc = new THREE.Color();
    const bodyColor = SC ? SC.body : brindle ? coat : (x, y) => '#' + _bc.copy(top).lerp(under, smoothstep(-0.06, -0.16, y)).getHexString();
    const parts = [sdfMesh(D.BODY, bodyColor, 36, 24)];
    if (fl > 0) {   // the shaggy coat: a chest ruff, a belly fringe, britches, shag along the back. Its own mesh (c.fur), so the
      // paws sweater (built from the barrel's geometry) stays smooth
      const l = B.len, T = [];
      if (fl >= 0.6) for (let i = 0; i < 7; i++) { const u = i / 6 - 0.5; T.push({ at: [u * 0.18, -0.1 + 0.16 * (1 - abs(u) * 1.6), 0.4 * l], dir: [0, -1, 0.1], len: 0.05 + 0.015 * (i % 2), w: 0.026, col: abs(u) < 0.2 ? SC.cream : SC.tan, shade: 0.8 }); }   // chest ruff (cream in the middle, tan at the sides)
      if (fl > 0.8) for (const s of [-1, 1]) for (let i = 0; i < 5; i++) T.push({ at: [s * 0.11, -0.2, (-0.16 + i * 0.085) * l], dir: [s * 0.15, -1, -0.45], len: 0.04 + 0.012 * ((i + (s > 0 ? 1 : 0)) % 2), w: 0.024, col: SC.tan, shade: 0.8 });   // belly fringe
      if (fl > 0.8) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) T.push({ at: [s * (0.05 + i * 0.035), -0.05 - i * 0.025, -0.4 * l], dir: [s * 0.2, -0.8, -0.7], len: 0.045, w: 0.026, col: SC.tan, shade: 0.85 });   // britches
      if (fl > 0.8) for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1; T.push({ at: [s * (0.07 + 0.03 * (i % 3)), 0.25, (-0.26 + i * 0.07) * l], dir: [s * 0.35, -0.3, -0.85], len: 0.035, w: 0.024, col: SC.dark, shade: 0.75 }); }   // shag on the back
      c.fur = T.length ? merge(tuftsOn({ ...D.BODY, o: [0, 0, 0.02 * l] }, T, SC.body, fl)) : null;
    }
    if (look.bib) {
      const o = [0, -0.04, 0.16];
      parts.push(decal(D.BODY, [0, -0.045, 0.43], 0.078 * bbs, 0.165 * bbs, white, { fromO: o, seg: 28, rings: 5, shape: a => 1 + 0.3 * sin(a) - 0.12 * cos(2 * a) }));
      parts.push(decal(D.BODY, [0, -0.19, 0.3], 0.06 * bbs, 0.1 * bbs, white, { fromO: o, seg: 20, rings: 4 }));   // between the front legs
    }
    c.body = merge(parts);
  }

  // ---- neck: skinned tube on three bones; Nala's throat is white
  {
    const pts = D.NECK.map(([y, z]) => new THREE.Vector3(0, y, z));
    const curve = c.neckCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const rings = [], n = look.dewlap ? 14 : 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t), T = curve.getTangentAt(t);
      const N = new THREE.Vector3(0, T.z, -T.y).normalize();       // crest direction
      const f = t * (D.neckR.length - 1), k = Math.min(D.neckR.length - 2, Math.floor(f)), u = f - k;
      const rr = D.neckR[k] + (D.neckR[k + 1] - D.neckR[k]) * u;
      const a1 = smoothstep(0.05, 0.55, t), b1 = smoothstep(0.5, 0.95, t);
      const ring = { c: [0, p.y, p.z], a: X, b: [0, N.y, N.z], ra: rr, rb: rr * 1.02, col: coat, w: [1 - a1, a1 * (1 - b1), a1 * b1], v: t };
      const dw = look.dewlap || 0;
      if (dw) {
        // loose skin: under the throat (sin < 0 is the throat side) two soft rolls, one where the neck meets the chest and
        // one under the chin, and a little fullness at the sides; the neck's bones move them with the head
        const rolls = pulse(t, 0.1, 0.42) + 0.9 * pulse(t, 0.52, 0.88);   // (zero at the collar, t = 0.45)
        ring.mod = ang => { const u = Math.max(0, -sin(ang)); return 1 + dw * (0.42 * u * u * rolls + 0.08 * abs(cos(ang)) * rolls); };
      }
      if (look.bib) ring.colf = ang => (sin(ang) < -0.45 ? white : coat);
      if (SC) ring.colf = ang => SC.neck(ang, t);
      if (fl > 0) {   // the ruff: a fuller neck with a ragged edge, flattened where the collar sits (t = 0.45)
        const mod0 = ring.mod, ruff = fl * (0.16 + 0.22 * pulse(t, -0.2, 0.75)) * (1 - 0.7 * pulse(t, 0.36, 0.56));
        ring.mod = ang => (mod0 ? mod0(ang) : 1) * (1 + ruff * (0.75 + 0.25 * sin(ang * 6 + t * 9)) * (sin(ang) < 0 ? 1.15 : 1));
      }
      rings.push(ring);
    }
    const cap = rings[n];
    rings.push({ c: [0, cap.c[1] + 0.02, cap.c[2] + 0.03], a: X, b: Y, ra: 0, rb: 0, col: coat, w: [0, 0, 1], v: 1 });
    c.neck = uvScale(sweep(rings, 16, { skinned: true, u0: 0 }), 1, 0.3, 0, 0.1);
  }

  // ---- head: one skin; a darker mask on the muzzle (Dax) or Nala's white blaze and lips
  {
    const H = D.HEAD, F = D.F, nz = F.noseZ, hw = B.headW;
    const maskC = look.mask ? col(look.mask) : null, coatC = col(coat), _mc = new THREE.Color(), greyC = col('#b9b2aa');
    // Dax's mask: the whole muzzle dark, fading up the bridge to between the eyes and softly round them
    const headColor = SC ? SC.head : maskC
      ? (x, y, z) => {
        const muzzle = smoothstep(F.stopZ + 0.012, F.stopZ + 0.05, z);   // (starts in front of the eyes: they sit by the muzzle's root)
        const eyes = 0.15 * (1 - smoothstep(0.012, 0.04, Math.hypot(abs(x) - F.eye[0], y - F.eye[1]))) * smoothstep(0.06, 0.1, z);
        return '#' + _mc.copy(coatC).lerp(maskC, Math.min(0.78, 0.78 * muzzle + eyes) * ms).getHexString();
      }
      : look.blaze
        // Nala: white lips and chin, painted into the skin (a band would bridge the crease between muzzle and cheek)
        ? (x, y, z) => {
          const lips = smoothstep(F.mY - 0.006, F.mY - 0.022, y) * smoothstep(F.stopZ - 0.03, F.stopZ + 0.01, z);
          const front = smoothstep(F.stopZ + F.mLen * 0.3, F.stopZ + F.mLen * 0.6, z);      // the blaze spreads over the whole front of the muzzle
          const k = Math.max(lips, front), grey = smoothstep(F.mY - 0.015, F.mY - 0.04, y) * 0.35;   // greying round the mouth and chin
          return '#' + _mc.copy(coatC).lerp(col(white), k).lerp(greyC, grey * k).getHexString();
        }
        : coat;
    // brindle on the head: u runs round it like the body's (spine on top, the chin in the light band), so the streaks run
    // down the cheeks and across the skull with no mirrored seam up the forehead; v along it
    const parts = [uvMap(sdfMesh(H, headColor, 32, 22), (x, y, z, u) => [u, z * 1.1 + 0.2])];
    if (fl > 0.8) {   // shaggy cheeks and a fringe behind the ears (a shaggy setting only)
      const T = [];
      for (const s of [-1, 1]) {
        T.push({ at: [s * 0.1 * hw, -0.07, 0.04], dir: [s * 0.6, -0.9, -0.5], len: 0.045, w: 0.018 }, { at: [s * 0.095 * hw, -0.085, 0.085], dir: [s * 0.5, -1, -0.2], len: 0.035, w: 0.015 });
        T.push({ at: [s * 0.08 * hw, 0.0, -0.03], dir: [s * 0.4, -0.6, -0.9], len: 0.04, w: 0.018 });
      }
      parts.push(...tuftsOn(H, T, headColor, fl));
    }
    if (look.blaze) {
      // the blaze: a thin white stripe up the forehead that widens down the bridge of the nose
      const t = F.top, pts = [[0, t + 0.02, 0.0], [0, t + 0.012, 0.06], [0, t - 0.01, F.stopZ - 0.005], [0, F.mTop + 0.005, F.stopZ + 0.035], [0, F.mTop, nz - 0.035]];
      parts.push(band(H, pts, [0.012, 0.016, 0.024, 0.044, 0.06].map(v => v * bs), white, { taper: false, sub: 3, fromO: [0, -0.03, 0.06] }));
    }
    // the nose: a broad soft wedge at the end of the muzzle with two dark nostrils
    const noseCol = look.nose, nr = F.noseR.map(v => v * (look.noseSize || 1));
    const plain = g => uvMap(g, () => [0.75, 0.5]);       // the nose is not brindled: a light, stripe-free spot of the map
    parts.push(plain(blob(noseCol, [0, F.noseY, nz], nr)));
    const nost = darker(noseCol, 0.45);
    for (const s of [-1, 1]) parts.push(plain(blob(nost, [s * nr[0] * 0.42, F.noseY - nr[1] * 0.25, nz + nr[2] * 0.82], [nr[0] * 0.2, nr[1] * 0.26, 0.005], [0, 0, s * 0.5])));
    parts.push(plain(blob(mix(noseCol, '#ffffff', 0.35), [nr[0] * 0.15, F.noseY + nr[1] * 0.62, nz + nr[2] * 0.3], [nr[0] * 0.32, nr[1] * 0.2, nr[2] * 0.45])));   // a shine on top
    c.head = merge(parts);
    c.eyeAt = [-1, 1].map(s => mount(H, [s * F.eye[0], F.eye[1], F.eye[2] + 0.02], F.eyeSink, [s * 0.25, 0.08, 1], 0.4));
    c.earAt = [-1, 1].map(s => { surfTo(H, s * F.ear[0], F.ear[1], F.ear[2]); return { p: [..._sp], n: [..._sn] }; });
    // brows: a short band over each eye (separate meshes so they can furrow), built around its own centre
    c.brows = [-1, 1].map(s => {
      const cx = s * F.brow[0], by = F.brow[1], bz = F.brow[2];
      const bt = look.browTilt || 0;             // + = the inner end up and the outer end down (a sad, pleading slope)
      const pts = [[cx - s * 0.032, by - 0.008 + 0.014 * bt, bz + 0.004], [cx, by + 0.003, bz], [cx + s * 0.032, by - 0.002 - 0.014 * bt, bz - 0.006]];
      const bw = look.brows === true ? 1.5 : 1;
      const g = band(H, pts, [0.009 * bw, 0.012 * bw, 0.008 * bw], SC ? look.points : look.stripes ? look.stripes : darker(look.coat, 0.75), { lift: 0.0025, sub: 3, fromO: [0, -0.02, 0.05] });
      surfTo(H, cx, by, bz, [0, -0.02, 0.05]);
      const c0 = [..._sp];
      g.translate(-c0[0], -c0[1], -c0[2]);
      return { g, c: c0 };
    });
  }

  // ---- lower jaw (pivots at the hinge, hidden inside the muzzle while shut): chin, dark mouth
  {
    const F = D.F, L = F.jawLen, w = F.jawW;
    const chin = SC ? mix(look.muzzle || '#c9c2b8', '#f4efe6', 0.3) : look.blaze ? white : (look.mask && ms > 0.5 ? look.mask : coat);
    c.jaw = merge([
      blob(chin, [0, -0.012, L * 0.5 + 0.004], [w, 0.016, L * 0.5], null, 'mid'),
      blob('#6e2a3a', [0, 0.003, L * 0.5], [w * 0.95, 0.011, L * 0.48], null, 'mid'),
    ]);
    c.tongue = blob('#ff8fa3', [0, 0, 0], [1, 1, 1], null, 'lo');
  }

  // ---- eye: the game's own cartoon eye (the people's family, bodies-face.js): a glossy dark oval with a big and a small
  // highlight, no iris rings. A soft lid in the coat colour sits over its top; tilted (lidDroop) it makes Nala's
  // outer corners droop, the mopey look, with the brows doing the rest.
  {
    const iris = look.eye || '#2a1810', dl = look.lidDroop || 0;
    const es = look.eyeSize || 1;
    const parts = [blob(iris, [0, 0, 0.004], [0.022 * es, 0.026 * es, 0.009])];
    if (dl) parts.push(blob(look.lid || look.coat, [0.002, 0.024, 0.007], [0.029, 0.011, 0.011], [0, 0, 0.42 * dl]));
    c.eye = merge(parts);
    c.glint = merge([blob('#ffffff', [-0.0075 * es, 0.0085 * es, 0.0135], [0.0075 * es, 0.0082 * es, 0.003], null, 'tiny'), blob('#ffffff', [0.0075 * es, -0.009 * es, 0.013], [0.0033 * es, 0.0035 * es, 0.002], null, 'tiny')]);
  }

  // ---- ears. flop (Dax): a thick, cupped leaf that rises off the corner of the skull, folds over and hangs down by the
  // cheek. rose (Nala): a short leaf folded back on the skull.
  {
    const earCol = brindle ? look.earTint || '#8c7c6a' : (look.ear || darker(look.coat, 0.8));    // (a tint on the brindle map)
    const flop = look.earStyle !== 'rose';
    let parts;
    if (flop || look.earCurve) {
      // A folded ear: the centre line in the ear's own frame (y up, z out of its face) is a polyline from inside the
      // skull, up the standing part to the fold, then down the flap to the tip. Straight segments keep the fold a
      // crease (with a slightly darker line along it); the width runs straight from a broad base to a point, so the
      // outline is a triangle, and the leaf thins toward the tip.
      const P = (look.earCurve || [[-0.012, -0.008], [0, 0], [0.035, 0.006], [0.06, 0.01], [0.045, 0.03], [0.022, 0.045], [-0.002, 0.055]]).map(([y, z]) => [y, z]);
      const foldAt = Math.min(look.earFold ?? 3, P.length - 2);  // index of the fold point
      if (look.earHang) {   // the editor's fold: the flap past the fold swung closer in to the cheek (+) or out
        const ca = cos(look.earHang), sa = sin(look.earHang), [fy, fz] = P[foldAt];
        for (let i = foldAt + 1; i < P.length; i++) { const dy = P[i][0] - fy, dz = P[i][1] - fz; P[i] = [fy + dy * ca - dz * sa, fz + dy * sa + dz * ca]; }
      }
      const cupK = look.earCup ?? 1;
      const seg = [], len = [0];
      for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); len.push(len[i - 1] + d); }
      const L = len[len.length - 1], sFold = len[foldAt] / L;
      const W = look.earW || [[0, 0.04], [0.2, 0.045], [1, 0]];
      const wAt = s => { for (let i = 1; i < W.length; i++) if (s <= W[i][0]) return lerp(W[i - 1][1], W[i][1], (s - W[i - 1][0]) / (W[i][0] - W[i - 1][0])); return 0; };
      const dirOf = i => { const k = clamp(i, 0, seg.length - 1); return [(P[k + 1][0] - P[k][0]) / seg[k], (P[k + 1][1] - P[k][1]) / seg[k]]; };
      const foldCol = darker(earCol, 0.72), rings = [];
      for (let i = 0; i < P.length; i++) {
        // two rings per segment: one at the point, one half way to the next
        for (const h of i < P.length - 1 ? [0, 0.5] : [0]) {
          const y = P[i][0] + (i < P.length - 1 ? (P[i + 1][0] - P[i][0]) * h : 0), z = P[i][1] + (i < P.length - 1 ? (P[i + 1][1] - P[i][1]) * h : 0);
          const sv = (len[i] + (i < P.length - 1 ? seg[i] * h : 0)) / L;
          let t;
          if (h === 0 && i > 0 && i < P.length - 1) { const d0 = dirOf(i - 1), d1 = dirOf(i); t = [d0[0] + d1[0], d0[1] + d1[1]]; } else t = dirOf(i === P.length - 1 ? i - 1 : i);
          const tl = Math.hypot(t[0], t[1]) || 1, b = [0, t[1] / tl, -t[0] / tl];      // across the leaf's thickness
          if (i === P.length - 1) { rings.push({ c: [0, y, z], a: X, b, ra: 0, rb: 0, col: earCol, v: 1 }); continue; }
          const fold = h === 0 && i === foldAt;
          rings.push({ c: [0, y, z], a: X, b, ra: wAt(sv), rb: lerp(0.015, 0.004, sv), cup: -0.008 * (1 - sv) * cupK, col: fold ? foldCol : earCol, v: sv });
        }
      }
      void sFold;
      parts = [uvScale(sweep(rings, 10), 0.5, 0.3)];
    } else {
      const rings = [], len = 0.092, w0 = 0.05, th = 0.01, n = 7;
      for (let i = 0; i <= n; i++) {
        const s = i / n, w = w0 * (1 - 0.1 * s) * (1 - 0.6 * Math.pow(s, 2.5));
        rings.push(i === n ? { c: [0, -len - 0.012, 0.0], a: X, b: Z, ra: 0, rb: 0, col: earCol, v: 1 }
          : { c: [0, -s * len, 0.01 * s], a: X, b: Z, ra: w, rb: th * (1 - 0.4 * s) + 0.002, cup: -0.006 * (1 - s), col: earCol, v: s });
      }
      parts = [uvScale(sweep(rings, 10), 0.5, 0.3)];
      parts.push(decal({ S: [[0, -len * 0.45, 0, w0 * 0.9, len * 0.5, th + 0.002]], o: [0, -len * 0.45, 0], ro: [0, -len * 0.45, 0], radial: 0, stretch: [1, 1, 1], maxT: 0.3 },
        [0, -len * 0.42, 0.03], w0 * 0.5, len * 0.3, mix(look.ear || '#b0703a', '#ffb0a0', 0.5), { lift: 0.0 }));
    }
    c.ear = merge(parts);
  }

  // ---- paws: a soft pad with three toe bumps (SDF), toes forward (+z)
  {
    const PW = 0.04 * B.legR * pawS, PL = 0.052 * pawS, PHt = D.PAW_H;
    const shape = {
      S: [[0, -0.004, -0.004, PW, PHt * 0.95, PL], [0, -0.006, PL * 0.75, PW * 0.42, PHt * 0.78, 0.022, 0.018], [PW * 0.6, -0.007, PL * 0.62, PW * 0.42, PHt * 0.72, 0.021, 0.018], [-PW * 0.6, -0.007, PL * 0.62, PW * 0.42, PHt * 0.72, 0.021, 0.018]],
      o: [0, -0.005, 0.01], ro: [0, -0.02, 0.01], radial: 0.25, stretch: [PW, PHt, PL], maxT: 0.2, axis: 'z',
    };
    c.paw = SC ? uvScale(sdfMesh(shape, SC.light, 14, 10), 0.2, 0.2, 0.66, 0.6) : uvScale(sdfMesh(shape, coat, 14, 10), 0.3, 0.2, 0.1, 0.6);   // (Molly: pale tan feet, speckled)
    if (look.socks || look.hindToes) c.pawSock = sdfMesh(shape, white, 14, 10);
  }

  // ---- legs: upper (with a shoulder / thigh blending into the body), lower, pastern. The brindle runs DOWN the
  // legs (texture x follows the leg, from the striped flank band into the light band near the paws).
  {
    const lr = B.legR;
    const LEG = { seg: 8 }, PAS = { seg: 8, steps: 2 };   // (phones: eight sides read round under the outline)
    const down = SC   // (Molly: the legs sample the merle map's speckled band)
      ? (g, top, len) => uvMap(g, (x, y, z, u) => [0.64 + u * 0.22, top - y / len * 0.3])
      : (g, top, len) => uvMap(g, (x, y, z, u) => [top - y / len * 0.22, u * 0.35 + 0.1]);
    if (SC) {   // Molly: dark sable thighs and shoulders, tan forelegs and hocks, pale tan feet, feathering behind the legs
      const dk = '#' + SC.dark.getHexString(), tn = '#' + SC.tan.getHexString(), lt = '#' + SC.light.getHexString();
      const feather = (len, n, color) => fl > 0.8 ? Array.from({ length: n }, (_, i) => tuft([0, -len * (0.25 + 0.5 * i / Math.max(1, n - 1)), -0.026 * lr], [0, -0.7, -1], 0.04 * fl, 0.016, color)) : [];
      c.upperFront = merge([down(limb(D.L1F, 0.05 * lr, 0.038 * lr, dk, tn, -D.L1F * 0.45, LEG), 0.3, D.L1F), uvScale(blob(dk, [0, -0.01, -0.01], [0.062 * lr, 0.09, 0.075], null, 'mid'), 0.2, 0.2, 0.66, 0.1)]);
      c.upperHind = merge([down(limb(D.L1H, 0.055 * lr, 0.036 * lr, dk, tn, -D.L1H * 0.7, LEG), 0.3, D.L1H), uvScale(blob(dk, [0, -0.045, 0.02], [0.062 * lr, 0.11, 0.085], [0.25, 0, 0], 'mid'), 0.2, 0.2, 0.66, 0.1), ...feather(D.L1H, 3, dk)]);
      c.lowerFront = merge([down(limb(D.L2F, 0.04 * lr, 0.031 * lr, tn, lt, -D.L2F * 0.85, LEG), 0.4, D.L2F), ...feather(D.L2F * 0.7, 2, tn)]);
      c.lowerHind = down(limb(D.L2H, 0.041 * lr, 0.03 * lr, tn, tn, null, LEG), 0.4, D.L2H);
      c.pasternFront = down(limb(D.PF, 0.029 * lr, 0.028 * lr, lt, lt, null, PAS), 0.48, D.PF * 4);
      c.pasternHind = down(limb(D.PH, 0.03 * lr, 0.027 * lr, tn, lt, -D.PH * 0.6, PAS), 0.46, D.PH * 3);
    } else {
    c.upperFront = merge([down(limb(D.L1F, 0.05 * lr, 0.038 * lr, coat, coat, null, LEG), 0.3, D.L1F), uvScale(blob(coat, [0, -0.01, -0.01], [0.062 * lr, 0.09, 0.075], null, 'mid'), 0.3, 0.2, 0.3, 0.1)]);
    c.upperHind = merge([down(limb(D.L1H, 0.055 * lr, 0.036 * lr, coat, coat, null, LEG), 0.3, D.L1H), uvScale(blob(coat, [0, -0.045, 0.02], [0.062 * lr, 0.11, 0.085], [0.25, 0, 0], 'mid'), 0.3, 0.2, 0.3, 0.1)]);
    c.lowerFront = down(limb(D.L2F, 0.04 * lr, 0.031 * lr, coat, look.socks ? white : coat, look.socks ? -D.L2F * Math.min(0.98, 0.88 * skl) : null, LEG), 0.4, D.L2F);
    c.lowerHind = down(limb(D.L2H, 0.041 * lr, 0.03 * lr, coat, coat, null, LEG), 0.4, D.L2H);
    c.pasternFront = down(limb(D.PF, 0.029 * lr, 0.028 * lr, look.socks ? white : coat, look.socks ? white : coat, null, PAS), 0.48, D.PF * 4);
    c.pasternHind = down(limb(D.PH, 0.03 * lr, 0.027 * lr, coat, coat, null, PAS), 0.46, D.PH * 3);
    }
  }

  // ---- tail: a skinned tapering tube on four bones along +y (carriage rotates the whole chain)
  {
    const TL = 0.3 * B.tailLen, r0 = 0.03 * B.tailR, n = 12, rings = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n, y = s * TL;
      let r = (r0 * (1 - 0.62 * s) + 0.004);
      const f = s * 3, k = Math.min(2, Math.floor(f)), u = f - k;      // bone k..k+1
      const w = [0, 0, 0, 0]; w[k] = 1 - u; w[k + 1] = u;
      const ring = { c: [0, y, 0], a: X, b: Z, ra: r, rb: r, col: SC ? '#' + SC.tail(s).getHexString() : coat, w, v: s };
      const tb = SC ? (look.tailBush ?? fl) : 0;
      if (tb > 0) {   // a bushy tail: full along its length, a soft brush to the white tip, a ragged edge
        r = r0 * (0.75 + tb * 0.9 * Math.pow(Math.sin(PI * Math.min(1, s * 1.08)), 0.6)) * (1 - 0.3 * s) + 0.004;
        ring.ra = ring.rb = r;
        if (s > 0.04 && s < 0.97) ring.mod = ang => 1 + tb * 0.14 * cos(ang * 5 + s * 11);
      }
      rings.push(ring);
    }
    rings.push({ c: [0, TL + 0.012 + fl * 0.02, 0], a: X, b: Z, ra: 0, rb: 0, col: SC ? '#' + SC.tail(1).getHexString() : coat, w: [0, 0, 0, 1], v: 1 });
    c.tail = uvScale(sweep(rings, 10, { skinned: true }), 0.4, 0.5, 0.2, 0.2);
    c.tailLen = TL;
  }

  // ---- collar: a flat band around the neck and a tag
  {
    const t = 0.45, p = c.neckCurve.getPointAt(t), T = c.neckCurve.getTangentAt(t);
    const f = t * (D.neckR.length - 1), k = Math.floor(f), u = f - k;
    const rr = (D.neckR[k] + (D.neckR[k + 1] - D.neckR[k]) * u) * 1.02 * (1 + fl * 0.13) + 0.005;   // the tube's own radius there (and the ruff), plus the strap
    const a1 = smoothstep(0.05, 0.55, t), b1 = smoothstep(0.5, 0.95, t);      // the neck ring's own bone weights there
    c.collarAt = { p, T, r: rr, w: [1 - a1, a1 * (1 - b1), a1 * b1, 0] };
  }

  // ---- gear: the harness (girth and neck straps, one along the back, one down the chest, a ring on the back), in the fur's
  // mesh. The goggles go on the head
  if (look.harness || c.fur) {
    const parts = c.fur ? [c.fur] : [];
    if (look.harness) {
      const l = B.len, hc = look.harness, lift = 0.008 + 0.01 * fl, sh = D.BODY;
      const loop = (cx, cy, cz, R, tilt) => { const pts = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU; pts.push([cx + sin(a) * R, cy + cos(a) * R * cos(tilt), cz - cos(a) * R * sin(tilt)]); } return pts; };
      const strap = (pts, fromO, w = 0.03) => uvMap(band(sh, pts, w, hc, { lift, fromO, taper: false, sub: 2 }), () => UV_PLAIN);
      const zg = 0.06 * l, zn = 0.33 * l;
      parts.push(strap(loop(0, 0, zg, 0.3, 0), [0, -0.01, zg]));
      parts.push(strap(loop(0, 0.03, zn, 0.3, 0.55), [0, 0.03, zn], 0.026));
      parts.push(strap([[0, 0.3, zg], [0, 0.3, (zg + zn) / 2], [0, 0.3, zn - 0.04]], [0, 0, (zg + zn) / 2], 0.024));
      parts.push(strap([[0, -0.3, zg], [0, -0.3, zg + 0.08], [0, -0.2, zn + 0.05]], [0, 0, zg + 0.05], 0.024));
      surfTo(sh, 0, 0.3, zg + 0.02, [0, 0, zg]);
      const ring = new THREE.TorusGeometry(0.014, 0.0035, 5, 12);
      ring.translate(_sp[0], _sp[1] + lift + 0.012, _sp[2]);
      parts.push(uvMap(paint(ring, '#c9c9cf'), () => UV_PLAIN));
    }
    c.gear = merge(parts);
  }
  if (look.goggles) {
    const F = D.F, gc = look.goggles, parts = [];
    for (const s of [-1, 1]) {
      // (big ski-style goggles, as in andrew-molly-1.jpg: dark lenses, a chunky pink frame, a black strap)
      const ex = s * (F.eye[0] + 0.012), ey = F.eye[1] + 0.008, ez = F.eye[2] + 0.034, yaw = s * 0.42;
      const lens = blob('#2b2533', [0, 0, 0], [0.046, 0.034, 0.014], null, 'mid');
      const frame = paint(new THREE.TorusGeometry(0.046, 0.0105, 6, 20), gc); frame.scale(1, 0.8, 1.6);
      const shine = blob('#8a7f9e', [-s * 0.014, 0.012, 0.012], [0.012, 0.007, 0.003], null, 'tiny');
      for (const q of [lens, frame, shine]) { q.rotateY(yaw); q.translate(ex, ey, ez); parts.push(q); }
      const st = paint(new THREE.BoxGeometry(0.014, 0.018, 0.13), '#2a2530');   // the strap, back past the ear
      st.rotateY(s * 0.22); st.translate(s * (F.eye[0] + 0.062), ey + 0.002, ez - 0.07); parts.push(st);
    }
    const br = paint(new THREE.BoxGeometry(0.036, 0.014, 0.014), gc); br.translate(0, F.eye[1] + 0.014, F.eye[2] + 0.052); parts.push(br);
    c.goggles = merge(parts.map(q => { if (q.attributes.uv) q.deleteAttribute('uv'); return q; }));
  }

  partCache.set(key, c);
  trimCache(partCache, parts => { for (const g of Object.values(parts)) { if (g && g.isBufferGeometry) g.dispose(); else if (Array.isArray(g)) for (const q of g) q?.g?.dispose?.(); } });
  return c;
}

// ------------------------------------------------------------------ pose data

// Default (standing, relaxed) pose. Every key is a number so blending is one loop.
const DEF = {
  fx: 0, fy: 0, fz: 0, frx: 0, fry: 0, frz: 0, sq: 1,            // whole dog: offset, rotation, squash
  by: 0, bz: 0, brx: 0, bry: 0, brz: 0,                          // body (barrel)
  neck: 0, n2: 0, nry: 0, hx: 0, hy: 0, hz: 0,                   // neck bend (+ = down), upper neck extra, neck yaw, head relative
  jaw: 0.06, tongue: 0.2, earX: 0, earZ: 0, open: 1, worry: 0, joy: 0,   // face (joy: a happy moment, 0..1)
  tailX: 0, tailY: 0, wagA: 0.4, wagS: 7,                        // tail
  z0: 0, z1: 0, z2: 0, z3: 0, y0: 0, y1: 0, y2: 0, y3: 0, x0: 0, x1: 0, x2: 0, x3: 0, // paw offsets (root space): forward, up, out
  free: 0,                                                        // 1: paws hang from the hips in body space (kicking in the air)
  brate: 1, bamp: 1,                                              // breathing: rate and depth (slow and deep asleep)
  tailC: 0,                                                       // the tail curling sideways along its length (asleep, curled up)
};
const KEYS = Object.keys(DEF);
const NO_SLOPE = new Set(['sit', 'sitlook', 'lie', 'rest', 'tumble', 'flop', 'playbow', 'cower', 'sleep', 'sleepside', 'loaf', 'perk', 'wake']);
const RELAX = new Set(['idle', 'sit', 'wag', 'pant', 'shake']);       // relaxed head carriage (see pose())
const SITS = new Set(['sit', 'sitlook']);
const NAPS = new Set(['sleep', 'sleepside', 'loaf']);
const HAPPY = new Set(['happy', 'wag', 'bounce', 'playbow', 'spin', 'lope', 'snap', 'eat', 'slam', 'pant', 'tug']);   // poses that count as joy
const PZ = ['z0', 'z1', 'z2', 'z3'], PY = ['y0', 'y1', 'y2', 'y3'], PX = ['x0', 'x1', 'x2', 'x3'];

// How long the cross-fade INTO a pose takes (seconds). Default 0.3.
const FADE = { swat: 0.08, tug: 0.2, snap: 0.08, slam: 0.08, tumble: 0.1, flop: 0.1, yip: 0.12, bark: 0.1, cower: 0.15, startle: 0.06, lie: 0.55, rest: 0.6, sit: 0.4, sitlook: 0.4, eat: 0.2, playbow: 0.2, bounce: 0.15, sleep: 1.0, sleepside: 1.2, loaf: 0.9, perk: 0.35, wake: 0.5 };
// a cheap repeatable 0..1 from a number (the naps' twitches and paddles come from the pose's own clock, so every screen agrees)
const fract1 = v => { const x = sin(v * 127.1 + 0.5) * 43758.5453; return x - Math.floor(x); };
export const TUMBLE_DUR = 2.2, FLOP_DUR = 1.6, SLAM_DUR = 0.62, YIP_DUR = 1.0, EAT_DUR = 1.5;
export const SWAT_DUR = 1.1;   // (Molly's swat at a pouncing Nala)
export const SNAP_CATCH = 0.3;   // 'snap': the moment the jaws close on a biscuit in the air

// gait patterns: phase offsets [FL, FR, HL, HR], duty (stance fraction of the cycle)
const GAIT_WALK = [0.25, 0.75, 0, 0.5], GAIT_TROT = [0, 0.5, 0.5, 0], GAIT_GALLOP = [0.5, 0.6, 0, 0.12];

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Dog {
  constructor(look = {}) {
    look = { ...LOOK_DEF, ...NALA, ...look, build: { ...BUILD_DEF, ...NALA.build, ...(look.build || {}) } };
    this.kind = 'dog';
    this.look = look;
    const D = this.D = dims(look);
    const C = partsFor(look, D);
    const skin = skinMaterial(look), VC = flat();
    this.root = new THREE.Group();
    this.frame = new THREE.Group();
    this.root.add(this.frame);
    this.sc = look.scale || 1;
    this.root.scale.setScalar(this.sc);
    this.halfLen = 0.34 * this.sc * look.build.len;   // half a body length in metres (separation, bumping into people)
    this.seed = look.seed || 7;
    this.phase = (this.seed * 0.137) % 1;
    this.wagPhase = 0;
    this.anim = 'idle'; this.animT = 0; this.blend = 0; this.lookYaw = 0;
    this.tailCarriage = look.tail;
    this.fadeT = 1; this.fadeDur = 0.3;
    this.T = { ...DEF }; this.C = { ...DEF }; this.F = { ...DEF };
    this.worry = 0;        // set from outside (0..1) for anxious moments
    this.brPh = 0;         // breathing phase (its rate is a pose key)
    this.sp = 0;           // smoothed ground speed (root units)
    this.wTrot = 0; this.wGal = 0;
    this.t = 0;

    // ---- body
    const body = this.body = new THREE.Group();
    body.position.y = this.bodyY = D.HB;
    this.frame.add(body);
    const barrel = this.barrel = new THREE.Mesh(C.body, skin);
    body.add(barrel);

    // ---- neck: three bones, a skinned tube, the head on the last bone
    const curve = C.neckCurve;
    const bones = this.bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
    const p0 = curve.getPointAt(0), p1 = curve.getPointAt(0.5), p2 = curve.getPointAt(1);
    bones[0].position.copy(p0);
    bones[1].position.copy(p1).sub(p0);
    bones[2].position.copy(p2).sub(p1);
    for (const b of bones) b.rotation.order = 'YXZ';
    body.add(bones[0]); bones[0].add(bones[1]); bones[1].add(bones[2]);
    const neck = this.neck = new THREE.SkinnedMesh(C.neck, skin);
    neck.frustumCulled = false;
    body.add(neck);
    this.root.updateMatrixWorld(true);
    neck.bind(new THREE.Skeleton(bones));
    // the rest curve bends up toward the poll; the bones carry that bend so the head sits on the tube's end
    const T0 = curve.getTangentAt(0.25), T1 = curve.getTangentAt(0.75);
    this.neckRest = [-Math.atan2(T0.y, T0.z), -Math.atan2(T1.y, T1.z)];

    // ---- head (origin at the poll, faces +z)
    const head = this.head = new THREE.Group();
    head.rotation.order = 'YXZ';
    head.scale.setScalar(look.build.head);
    bones[2].add(head);
    head.add(new THREE.Mesh(C.head, skinMaterial(look, true)));
    this.headR = 0.19;   // (kept for callers that size things by it)
    const jaw = this.jawG = new THREE.Group();
    jaw.position.set(...D.F.jaw);
    this.mouthZ = D.F.jawLen * 0.8;      // where a held toy or a treat sits, along the jaw (dog-toys.js)
    head.add(jaw);
    jaw.add(new THREE.Mesh(C.jaw, VC));
    const tongue = this.tongueM = new THREE.Mesh(C.tongue, VC);
    tongue.visible = false;
    jaw.add(tongue);

    // eyes, brows, ears
    this.eyes = [];
    this.brows = [];
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, A = C.eyeAt[i];
      const g = new THREE.Group();
      g.position.copy(A.p); g.quaternion.copy(A.q);
      const inner = new THREE.Group();
      const eye = new THREE.Mesh(C.eye, VC), gl = new THREE.Mesh(C.glint, glow('#ffffff'));
      if (s > 0) { eye.scale.x = -1; gl.scale.x = -1; }
      inner.add(eye, gl);
      if (look.eyeTilt) g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * look.eyeTilt));   // outer corners up (+) or down
      g.add(inner);
      soft(g);
      head.add(g);
      this.eyes.push(inner);
      const bA = C.brows[i];
      const brow = new THREE.Mesh(bA.g, VC);
      brow.position.set(bA.c[0], bA.c[1], bA.c[2]);
      brow.userData.s = s;
      brow.visible = !!look.brows;
      soft(brow);
      head.add(brow);
      this.brows.push(brow);
    }
    this.ears = [];
    const rose = look.earStyle === 'rose';
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, E = C.earAt[i];
      const g = new THREE.Group();
      g.position.set(E.p[0] - s * 0.006, E.p[1], E.p[2]);
      const m = new THREE.Mesh(C.ear, skin);
      m.scale.setScalar(look.earSize || 1);
      g.add(m);
      head.add(g);
      // rest orientation from where the ear points (its length) and which way its face looks:
      // flop ears hang down the cheek, face out and a little forward; rose ears lie folded back on the skull, face up and out
      const ed = look.earDir, en = look.earNrm;      // (a look may aim its ears: [x for the left ear, y, z])
      const dir = ed ? [s * ed[0], ed[1], ed[2]] : rose ? [s * 0.5, -0.25, -0.85] : [s * 0.22, -1, 0.32];
      const nrm = en ? [s * en[0], en[1], en[2]] : rose ? [s * 0.55, 0.8, 0.2] : [s * 0.95, 0, 0.25];
      const y = new THREE.Vector3(...dir).normalize().negate();
      const z = new THREE.Vector3(...nrm).addScaledVector(y, -y.dot(new THREE.Vector3(...nrm))).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      if (look.earTilt) base.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), look.earTilt));   // the whole ear tipped back (+) or forward
      this.ears.push({ g, s, base, a: 0, va: 0, b: 0, vb: 0 });
    }

    // ---- collar and tag: skinned on the neck's bones with the neck's own weights where it sits, so it hugs the neck in
    // every pose (a ring on one bone floats off the tube as soon as the neck bends)
    {
      const A = C.collarAt;
      const parts = [];
      const strap = new THREE.TorusGeometry(A.r, 0.011, 6, 28);
      strap.scale(1, 1, 1.7);                                   // a flat strap: wide along the neck, thin outward
      parts.push(paint(strap, look.collar));
      const ring = new THREE.TorusGeometry(0.008, 0.0025, 5, 10);
      ring.translate(0, -A.r - 0.012, 0.004);
      parts.push(paint(ring, '#aaaaaa'));
      if (look.earStyle !== 'rose') {                           // Dax: a round tag
        const disc = new THREE.CylinderGeometry(0.016, 0.016, 0.003, 14);
        disc.rotateZ(PI / 2); disc.translate(0, -A.r - 0.03, 0.006);
        parts.push(paint(disc, look.tag || '#d9d9d9'));
      }
      const g = merge(parts.map(q => { q.deleteAttribute('uv'); q.deleteAttribute('normal'); return q; }));
      g.computeVertexNormals();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), A.T.clone().normalize()));
      g.translate(A.p.x, A.p.y, A.p.z);
      const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = 0; si[i * 4 + 1] = 1; si[i * 4 + 2] = 2; si[i * 4 + 3] = 3; sw.set(A.w, i * 4); }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      const collar = this.collar = new THREE.SkinnedMesh(g, VC);
      collar.frustumCulled = false;
      body.add(collar);
      collar.bind(neck.skeleton, neck.bindMatrix);
    }

    // ---- Molly's tufts and harness (on the barrel, so they breathe with it), and the goggles (on the head, shown while she
    // rides in the golf cart: `dog.goggles = true`)
    if (C.gear) { this.gear = new THREE.Mesh(C.gear, skin); this.gear.name = 'dog-gear'; barrel.add(this.gear); }
    if (C.goggles) { this.goggleMesh = new THREE.Mesh(C.goggles, VC); this.goggleMesh.name = 'dog-goggles'; this.goggleMesh.visible = false; head.add(this.goggleMesh); }

    // ---- tail: four bones
    {
      const tail = this.tail = new THREE.Group();
      tail.rotation.order = 'YXZ';
      tail.position.set(...D.tail);
      body.add(tail);
      const tb = this.tailBones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
      const seg = C.tailLen / 3;
      tb[0].position.set(0, 0, 0);
      for (let i = 1; i < 4; i++) { tb[i].position.set(0, seg, 0); tb[i - 1].add(tb[i]); }
      tail.add(tb[0]);
      const tm = new THREE.SkinnedMesh(C.tail, skin);
      tm.frustumCulled = false;
      tail.add(tm);
      this.root.updateMatrixWorld(true);
      tm.bind(new THREE.Skeleton(tb));
      this.tailSpring = [0, 0, 0, 0];   // pitch lag per bone and its velocity (pairs)
    }

    // ---- legs: joint on the body -> upper -> lower -> foot (pastern) -> paw
    this.legs = [];
    for (let i = 0; i < 4; i++) {
      const [hx, hy, hz] = D.hips[i];
      const front = i < 2;
      const hip = new THREE.Group();
      hip.position.set(hx, hy, hz);
      const upper = new THREE.Group();
      upper.add(new THREE.Mesh(front ? C.upperFront : C.upperHind, skin));
      const L1 = front ? D.L1F : D.L1H, L2 = front ? D.L2F : D.L2H;
      const lower = new THREE.Group();
      lower.position.y = -L1;
      lower.add(new THREE.Mesh(front ? C.lowerFront : C.lowerHind, skin));
      const foot = new THREE.Group();
      foot.position.y = -L2;
      foot.add(new THREE.Mesh(front ? C.pasternFront : C.pasternHind, skin));
      const paw = new THREE.Group();
      paw.position.y = -(front ? D.PF : D.PH);
      paw.add(new THREE.Mesh((front ? look.socks : look.hindToes) ? C.pawSock : C.paw, skin));
      foot.add(paw); lower.add(foot); upper.add(lower); hip.add(upper); body.add(hip);
      this.legs.push({ hip, upper, lower, foot, paw, front, hx, hy, hz, L1, L2, restZ: D.restZ[i], E: front ? D.PF : D.PH, ea: front ? 0.32 : 0.22, swing: 0 });
    }
    this.capY = 0;
    this.sitRest = this.solveSit();

    shadows(this.root, true, false);
    this.applyPose(1 / 60, 0);
  }

  get goggles() { return !!this.goggleMesh && this.goggleMesh.visible; }
  set goggles(on) { if (this.goggleMesh) this.goggleMesh.visible = !!on; }

  // The sit, from docs/refs/andrew-dax-sitting.jpg: rump on the grass, a straight trunk sloping up, front legs straight
  // under the shoulders, hind legs folded out. Solved per dog: the body pitch at which the front legs are just straight
  // while the rump touches the ground (look.sitBack sinks the rump further, or lifts it).
  solveSit() {
    const D = this.D, B = D.B, lk = this.look, L = this.legs[0];
    const hy = D.hips[0][1], hz = D.hips[0][2];
    const tk = B.tuck || 0, ry = 0.015 + 0.02 * tk, rz = -0.2 * B.len, rr = 0.148 * B.girth * (B.rump || 1) * (1 - 0.2 * tk);
    const legY = D.PAW_H + L.E * cos(L.ea) + (L.L1 + L.L2) * 0.985;   // the front hip this high up: the leg straight
    const rump = th => {   // the rump's underside above the grass with the body pitched by th and the front legs straight
      const hipY = hy * cos(th) - hz * sin(th), by = legY - hipY - this.bodyY;
      return this.bodyY + by + (ry * cos(th) - rz * sin(th)) - rr;
    };
    const want = -0.015 - (lk.sitBack || 0);   // pressed a little into the grass
    let a = -0.25, b = -1.3;
    for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (rump(m) > want) a = m; else b = m; }
    const th = (a + b) / 2;
    const hipY = hy * cos(th) - hz * sin(th), hipZ = hy * sin(th) + hz * cos(th);
    return { brx: th, by: legY - hipY - this.bodyY, hipZ };
  }

  // dt, t: seconds (t is wall time for wobble), speed: ground speed m/s, anim: pose name or null,
  // at: optional seconds since the pose began (scripted moments pass this so every client shows the same frame)
  update(dt, t, speed = 0, anim = null, at = null) {
    dt = Math.min(+dt || 0, 0.05);
    if (!(dt > 0)) return;
    speed = (+speed || 0) / this.sc;
    this.t += dt;
    const key = anim || 'idle';
    if (key !== this.anim) {
      Object.assign(this.F, this.C); // snapshot what is on screen, fade from it
      this.fadeT = 0; this.fadeDur = FADE[key] || 0.3;
      this.anim = key; this.animT = at != null ? at : 0;
    } else this.animT = at != null ? at : this.animT + dt;
    if (this.fadeT < 1) this.fadeT = Math.min(1, this.fadeT + dt / this.fadeDur);
    const moving = speed > 0.15;
    const k = r => 1 - Math.exp(-dt * r);
    this.blend += ((moving ? 1 : 0) - this.blend) * k(9);
    this.sp += (speed - this.sp) * k(moving ? 8 : 5);
    const lope = this.anim === 'lope';
    const trotT = smoothstep(1.25, 2.2, this.sp), galT = Math.max(smoothstep(3.3, 4.6, this.sp), lope && moving ? 0.85 : 0);
    this.wTrot += (trotT - this.wTrot) * k(6); this.wGal += (galT - this.wGal) * k(6);
    // gait phase from distance: stride length is speed over stride frequency (dogs step faster as they go faster)
    const legK = Math.sqrt(0.38 / (this.D.L1F + this.D.L2F));
    const f = clamp(1.3 + 0.42 * this.sp, 1.5, 3.5) * legK;
    if (this.blend > 0.02) this.phase = (this.phase + dt * Math.max(this.sp, 0.3) * (f / Math.max(this.sp, 0.3))) % 1;
    this.freq = f;
    this.wagPhase += dt * this.T.wagS;
    this.pose(t, this.sp);
    const fd = ease(this.fadeT), T = this.T, C = this.C, F = this.F;
    for (let i = 0; i < KEYS.length; i++) { const kk = KEYS[i]; C[kk] = F[kk] + (T[kk] - F[kk]) * fd; }
    this.applyPose(dt, t);
  }

  // Build the target pose for this frame.
  pose(t, speed) {
    const T = this.T;
    for (let i = 0; i < KEYS.length; i++) T[KEYS[i]] = DEF[KEYS[i]];
    const a = this.animT, w = this.blend, ph = this.seed;
    const moving = w > 0.02;
    T.tailX = this.tailCarriage;
    // idle life: breathing, the odd glance, blinks
    T.sq = 1 + sin(t * 2.3 + ph) * 0.005;
    T.hy = sin(t * 0.55 + ph) * 0.22 * (1 - w);
    T.hx = sin(t * 0.37 + ph * 0.7) * 0.05 * (1 - w);
    const bl = (t * 0.31 + ph * 0.137) % 1;
    T.open = bl < 0.035 ? 0.1 : 1;
    T.worry = this.worry;
    const tail = (x, amp, speed) => { T.tailX = x; T.wagA = amp; T.wagS = speed; };
    const paw = (i, z = 0, y = 0, x = 0) => { T[PZ[i]] = z; T[PY[i]] = y; T[PX[i]] = x; };

    // ---- gait: walk (lateral sequence) -> trot (diagonal pairs) -> gallop (hind pair, front pair, suspension)
    if (moving) {
      const wT = this.wTrot, wG = this.wGal, lope = this.anim === 'lope', p = this.phase, pw = TAU * p;
      // pr: Nala prances (high front-leg action, a light floating lope with more airtime, head up); hv: Dax is heavier
      // and more ground-bound. Only the swing and the body change, so a planted paw still travels exactly with the ground.
      const pr = this.look.prance || 0, hv = this.look.heavy || 0;
      const duty = lerp(lerp(0.64, 0.45, wT), 0.32 - 0.05 * pr + 0.03 * hv, wG);
      const SL = Math.max(speed, 0.3) / this.freq;                    // distance per cycle
      const stance = SL * duty;                                       // a planted paw travels this far back
      const liftH = lerp(lerp(0.035, 0.06, wT), 0.11, wG) * this.D.B.leg * (lope ? 1.2 : 1) * (1 - 0.2 * hv);
      let air = 1e9;                                                  // the lowest swinging paw (0 while any paw is planted)
      for (let i = 0; i < 4; i++) {
        const off = lerp(lerp(GAIT_WALK[i], GAIT_TROT[i], wT), GAIT_GALLOP[i], wG);
        const u = (p + off + 8) % 1;
        let z, y = 0;
        if (u < duty) z = stance * (0.5 - u / duty);
        else {
          const s = (u - duty) / (1 - duty);
          z = stance * (-0.5 + ease(s));
          y = liftH * sin(PI * Math.pow(s, 0.85));
          if (i < 2 && pr) { y *= 1 + pr * lerp(0.9, 0.35, wG); z += pr * 0.03 * sin(PI * s); }   // prancing: the front paws come up high and reach
          this.legs[i].swing = s;
        }
        air = u < duty ? 0 : Math.min(air, y);
        if (u < duty) this.legs[i].swing = 0;
        // hind paws reach a little further forward at a gallop (the gathered phase)
        if (i >= 2) z += 0.05 * wG * stance * (0.5 - u);
        paw(i, z * w, y * w, 0);
      }
      // body: walk sways the hips, trot bounces twice a cycle, gallop rocks the spine and bounds
      const walkW = (1 - wT) * (1 - wG), trotW = wT * (1 - wG);
      T.by = (0.012 * abs(sin(pw * 2 + 0.3))) * walkW + (0.018 * abs(sin(pw * 2))) * trotW * (1 + 0.8 * pr - 0.3 * hv) + (0.03 * sin(pw + 0.9)) * wG * (1 + 0.5 * pr - 0.3 * hv);
      // airtime: while all four paws are off the ground the whole dog floats up (a lot for Nala, hardly for Dax)
      T.fy = air < 1e8 ? air * Math.max(0, 0.25 + 0.9 * pr - 0.2 * hv) : 0;
      T.bry = 0.06 * sin(pw) * walkW + 0.02 * sin(pw) * trotW;
      T.brz = 0.025 * cos(pw) * walkW + 0.015 * cos(pw * 2) * trotW;
      T.brx = 0.02 * sin(pw * 2 + 0.5) * trotW + (-0.11 * (1 + 0.6 * pr) * sin(pw + 0.4) - 0.02) * wG;   // the rocking horse
      T.neck = (0.04 * sin(pw * 2) - 0.02) * walkW + (0.03 * sin(pw * 2 + 1) - 0.08) * trotW + (0.12 * sin(pw + 0.4) - 0.1) * wG;
      T.hy += sin(pw) * 0.05 * walkW;
      T.hx += -0.02 * sin(pw * 2) * trotW + 0.08 * sin(pw + 0.4) * wG;
      T.sq = 1 + (sin(pw + 1.3) * 0.03) * wG;
      T.earX = (0.05 + 0.1 * sin(pw * 2 + 1)) * walkW + (0.15 + 0.15 * sin(pw * 2)) * trotW + (0.35 + 0.35 * sin(pw + 1)) * wG;
      if (lope) { T.brz += sin(pw) * 0.05; T.hy += sin(pw * 0.5) * 0.2; T.jaw = 0.4; T.tongue = 0.9; }
      else { T.jaw = lerp(0.12, 0.25, wG); T.tongue = lerp(0.45, 0.9, wG); }
      tail(lope ? -0.7 : lerp(this.tailCarriage, this.tailCarriage + 0.25, wG), lope ? 0.55 : lerp(0.5, 0.25, wG), lope ? 13 : 8 + speed);
      T.neck -= 0.14 * pr * wG;                                       // Nala carries her head up when she lopes
      T.wagA *= w; T.by *= w; T.brx *= w; T.bry *= w; T.brz *= w; T.neck *= w; T.fy *= w;
    }

    switch (this.anim) {
      case 'lope': break; // gait above
      case 'sit':
      case 'sitlook': {
        const look = this.anim === 'sitlook', S = this.sitRest, lk = this.look;
        // see solveSit: the hind paws beside the front ones with the knees out, the neck up, the head level
        T.brx = S.brx; T.by = S.by; T.bz = 0;
        const fz = S.hipZ - this.legs[0].restZ + lk.sitFront;
        paw(0, fz, 0, 0.012); paw(1, fz, 0, -0.012);
        const hz = S.hipZ - 0.12 + lk.sitTuck - this.legs[2].restZ;
        paw(2, hz, 0, lk.sitSplay); paw(3, hz, 0, -lk.sitSplay);
        T.neck = -lk.sitHead - (look ? 0.2 : 0); T.n2 = 0;
        T.hx = -S.brx - 0.25 + 0.6 * lk.sitHead - (look ? 0.15 : 0);   // (the head looks ahead whatever the trunk's slope)
        if (look) T.earX = -0.25;
        tail(-PI / 2 - S.brx - 0.3 - 0.1 * sin(t * 2), look ? 0.55 : 0.3, look ? 5 : 4);   // lying on the grass behind him
        break;
      }
      case 'lie':
      case 'rest': {
        const rest = this.anim === 'rest';
        // chest on the ground, front legs out in front, hind legs folded to the sides
        T.by = -(this.bodyY - Math.max(0.145, this.D.chestDrop - 0.05)); T.brx = 0.05;   // (a deeper chest lies a little higher)
        paw(0, 0.27, 0, 0.035); paw(1, 0.27, 0, -0.035);
        paw(2, 0.1, 0, 0.14); paw(3, 0.1, 0, -0.14);
        T.neck = rest ? 0.75 : 0.58; T.n2 = rest ? 0.2 : 0.05; T.hx = rest ? 0.25 : -0.02;   // lying: the head forward and lowish, not held high
        T.sq = 1 + sin(t * 1.7 + ph) * 0.012;
        if (rest) { T.open = 0.12 + (sin(t * 0.4 + ph) > 0.85 ? 0.7 : 0); T.earX = 0.3; T.hy *= 0.3; }
        tail(-1.9, 0.12, 3);
        T.tongue = 0.1; T.jaw = 0.02;
        break;
      }
      // ---- naps. `a` is the time asleep (from the shared simulation), so the twitches match on every screen. Three ways to
      // sleep: chin on paws, the donut curl, and on the side. Slow deep breathing and the odd twitch.
      case 'loaf': { // chin on paws: on the belly, front legs forward, the head down on them, the tail wrapped round a hip
        T.by = -(this.bodyY - Math.max(0.14, this.D.chestDrop - 0.055)); T.brx = 0.04; T.brz = 0.06;
        paw(0, 0.3, 0, 0.025); paw(1, 0.29, 0, -0.03);
        paw(2, 0.13, 0, 0.17); paw(3, 0.08, 0, -0.1);
        T.neck = 0.9; T.n2 = 0.2; T.hx = -0.3; T.hy = 0.1; T.hz = 0.06;   // (the head level, the chin resting on the paws)
        T.open = 0.08; T.earX = 0.38; T.jaw = 0; T.tongue = 0;
        tail(-1.95, 0.02, 2); T.tailY = -1.15; T.tailC = 0.45;
        if (this.inBed) { T.neck = 0.54; T.n2 = 0.12; T.hx = -0.12; T.hy = 0.06; paw(0, 0.26, 0, 0.03); paw(1, 0.25, 0, -0.035); T.tailY = -2.0; T.tailC = 0.8; }   // (in its bed: the chin up on the bolster, the paws and the tail tucked in the dish. npcs.js sets inBed)
        T.sq = 1 + sin(t * 1.05 + ph) * 0.012; T.brate = 0.55; T.bamp = 2.8;
        this.napTwitch(T, a, ph, 6, 0.55);
        break;
      }
      case 'sleep': { // the donut: on one hip, the back rounded, the nose tucked round to the tail, the hind paws folded in front
        // (on its right hip, the head and the tail both round to the left: from above a circle)
        T.by = -(this.bodyY - Math.max(0.12, this.D.chestDrop - 0.075)); T.brx = 0.02; T.brz = 0.4; T.bry = 0.45;
        paw(0, 0.13, 0, 0.07); paw(1, 0.11, 0, 0.13);
        paw(2, 0.3, 0, 0.27); paw(3, 0.26, 0, 0.21);
        T.neck = 0.75; T.n2 = 0.1; T.nry = 2.3; T.hx = -0.2; T.hy = 1.0; T.hz = 0.5;
        T.open = 0.08; T.earX = 0.42; T.jaw = 0; T.tongue = 0;
        tail(-1.9, 0.02, 2); T.tailY = -2.2; T.tailC = 0.9;   // (round the same side as the head)
        T.sq = 1 + sin(t * 1.05 + ph) * 0.014; T.brate = 0.55; T.bamp = 2.6;
        this.napTwitch(T, a, ph, 7, 0.55);
        break;
      }
      case 'sleepside': { // on its side in the sun, propped a little, the legs folded loosely, the chin tucked, the tail curled in
        const th = PI / 2 * 0.86, cy = this.bodyY, hc = 0.14 * this.D.B.girth * (this.D.B.width || 1);
        T.frz = th; T.fy = hc - cy * cos(th); T.fx = cy * sin(th);
        T.free = 1;
        // (the legs lie out from the belly, bent; the upper pair rests on the lower one; the hind ones curled forward)
        paw(0, 0.03, 0.07, -0.07); paw(1, 0.06, 0.03, 0.0);
        paw(2, 0.13, 0.07, -0.08); paw(3, 0.09, 0.03, 0.0);
        T.neck = 0.65; T.n2 = 0.15; T.hx = 0.2; T.hz = 0.1;
        T.open = 0.08; T.earX = 0.32; T.jaw = 0.01; T.tongue = 0;
        tail(-2.15, 0.02, 2);
        T.sq = 1; T.brate = 0.5; T.bamp = 3.4;
        // a dream: the legs paddle as if running (in most 15 s windows), else the odd twitch
        const c = Math.floor(a / 15), u = a - c * 15;
        if (fract1(c + ph * 3) < 0.7) {
          const t0 = 2 + fract1(c + ph * 3 + 0.5) * 10, k = pulse(u, t0, t0 + 2.0), w = a * 13;
          T.z0 += sin(w) * 0.06 * k; T.z1 += sin(w + 1.7) * 0.06 * k; T.z2 += sin(w + 3.1) * 0.05 * k; T.z3 += sin(w + 4.6) * 0.05 * k;
          T.earX -= 0.15 * k; T.jaw = 0.01 + 0.05 * k * abs(sin(w * 0.5));
        }
        this.napTwitch(T, a, ph, 4, 0.45);
        break;
      }
      case 'perk': { // lying, head up and ears up for someone new: a look
        const up = ease(a / 0.35);
        T.by = -(this.bodyY - Math.max(0.145, this.D.chestDrop - 0.05)); T.brx = 0.05;
        paw(0, 0.27, 0, 0.035); paw(1, 0.27, 0, -0.035);
        paw(2, 0.1, 0, 0.14); paw(3, 0.1, 0, -0.14);
        T.neck = 0.6 - 0.85 * up; T.hx = 0.2 - 0.32 * up; T.hy = 0;
        T.earX = 0.3 - 0.7 * up; T.open = 0.4 + 0.65 * up; T.jaw = 0.02; T.tongue = 0;
        tail(-1.9, 0.08 + 0.12 * up, 3);
        break;
      }
      case 'wake': { // the get-up: head up, onto the feet, a long stretch forward, a stretch back, a big yawn, a sleepy wag
        const lie = 1 - ease((a - 0.7) / 0.6);
        const fw = ease((a - 1.25) / 0.3) * (1 - ease((a - 2.0) / 0.3));
        const hw = ease((a - 2.15) / 0.25) * (1 - ease((a - 2.65) / 0.3));
        const yw = ease((a - 2.95) / 0.25) * (1 - ease((a - 3.6) / 0.35));
        const wg = ease((a - 3.75) / 0.3);
        const lieBy = -(this.bodyY - Math.max(0.145, this.D.chestDrop - 0.05));
        T.by = lieBy * lie - 0.12 * fw - 0.035 * hw;
        T.brx = 0.05 * lie + 0.44 * fw - 0.2 * hw;
        paw(0, 0.27 * lie + 0.24 * fw - 0.03 * hw, 0, 0.035 * lie); paw(1, 0.27 * lie + 0.24 * fw - 0.03 * hw, 0, -0.035 * lie);
        paw(2, 0.1 * lie + 0.02 * fw - 0.24 * hw, 0, 0.14 * lie); paw(3, 0.1 * lie + 0.02 * fw - 0.24 * hw, 0, -0.14 * lie);
        T.neck = -0.2 * lie - 0.05 * fw - 0.4 * hw - 0.5 * yw;
        T.hx = 0.05 * fw - 0.2 * hw - 0.35 * yw; T.hy *= 0.3 * wg;
        T.jaw = 0.75 * yw + 0.12 * wg; T.tongue = 0.6 * yw + 0.3 * wg;
        T.open = Math.min(1, 0.35 + a * 0.5) * (1 - 0.9 * yw) * (1 - 0.35 * fw) * (1 - 0.5 * hw);
        T.earX = 0.25 * lie + 0.3 * fw + 0.35 * yw - 0.1 * wg;
        tail(-1.9 * lie + (this.tailCarriage + 0.25) * (1 - lie), 0.1 + 0.5 * wg, 3 + 4 * wg);
        T.bry = sin(this.wagPhase * 0.5) * 0.06 * wg;
        T.brate = 1 - 0.3 * lie;
        break;
      }
      case 'playbow': {
        const pop = pulse((a * 2.2) % 1, 0, 1); // little bounces while bowed
        // elbows on the ground, rump up in the air
        T.brx = 0.5; T.by = -0.1 + pop * 0.02; T.bz = 0.02;
        paw(0, 0.2, 0, 0.03); paw(1, 0.2, 0, -0.03);
        paw(2, -0.05, 0, 0.01); paw(3, -0.05, 0, -0.01);
        T.neck = -0.45; T.hx = -0.1;
        T.jaw = 0.32; T.tongue = 0.8; T.earX = -0.2;
        tail(-0.55, 0.75, 20);
        break;
      }
      case 'bounce': {
        const u = (a * 2.4) % 1, hop = 4 * u * (1 - u);
        T.fy = hop * 0.3;
        T.sq = u < 0.16 ? 1 - 0.16 * (1 - u / 0.16) : 1 + 0.1 * hop;
        paw(0, 0.08 * hop, 0.14 * hop); paw(1, 0.08 * hop, 0.14 * hop); paw(2, -0.06 * hop, 0.06 * hop); paw(3, -0.06 * hop, 0.06 * hop);
        T.brx = -0.12 * hop;
        T.jaw = 0.35; T.tongue = 0.9; T.earX = 0.5 * hop - 0.2;
        T.hy = sin(t * 3) * 0.3;
        tail(-0.55, 0.7, 20);
        break;
      }
      case 'spin': {
        T.fry = a * 8;
        T.nry = 0.9; T.hy = 0;
        T.brz = sin(a * 8) * 0.06;
        const s = sin(a * 14) * 0.08;
        paw(0, s, Math.max(0, s) * 0.5); paw(3, s, Math.max(0, s) * 0.5); paw(1, -s, Math.max(0, -s) * 0.5); paw(2, -s, Math.max(0, -s) * 0.5);
        T.jaw = 0.3; T.tongue = 0.9;
        tail(-0.8, 0.6, 16);
        break;
      }
      case 'cower': {
        T.by = -0.14; T.brx = 0.08;
        for (let i = 0; i < 4; i++) paw(i, i < 2 ? 0.03 : -0.02, 0, 0);
        T.neck = 0.75; T.hx = -0.1; T.earX = 0.6; T.worry = 1; T.open = 0.85;
        T.fx = sin(t * 47) * 0.006; T.jaw = 0; T.tongue = 0;
        tail(-2.95, 0.05, 6);
        break;
      }
      case 'tuck': { // calm retreat: head low, tail tucked, ears back, but walking normally
        T.neck += 0.5; T.earX = 0.55; T.worry = Math.max(T.worry, 0.9); T.by -= 0.03;
        T.jaw = 0; T.tongue = 0; T.hy *= 0.3;
        tail(-2.9, 0.06, 6);
        break;
      }
      case 'startle': {
        const k = pulse(a, 0, 0.35);
        T.fy = k * 0.12; T.sq = 1 + 0.09 * k; T.neck = -0.2 * k; T.earX = -0.3 * k; T.worry = 1; T.open = 1.1;
        paw(0, 0, 0.06 * k); paw(1, 0, 0.06 * k); T.jaw = 0.2 * k;
        tail(-2.6, 0.05, 6);
        break;
      }
      case 'sniff': {
        T.neck = 0.95 + sin(a * 11) * 0.05; T.n2 = 0.35; T.hx = 0.15; T.brx = 0.05; T.by = -0.02;
        T.hy = sin(a * 2.2) * 0.25;
        paw(0, 0.04); paw(1, 0.04);
        T.jaw = 0.02; T.tongue = 0; T.earX = 0.15;
        tail(this.tailCarriage + 0.25, 0.35, 7);
        break;
      }
      case 'sniffup': { // nose up at a post
        T.neck = -0.5 + sin(a * 12) * 0.05; T.hx = -0.2; T.brx = -0.08;
        T.jaw = 0.02; T.tongue = 0;
        tail(this.tailCarriage, 0.4, 7);
        break;
      }
      case 'wag': {
        T.bry = sin(this.wagPhase * 0.6) * 0.12;
        T.nry = -T.bry * 1.4;
        T.brz = sin(this.wagPhase * 0.6 + 1) * 0.03;
        T.jaw = 0.22; T.tongue = 0.6; T.earX = -0.1;
        tail(this.tailCarriage + 0.4, 0.8, 19);
        break;
      }
      case 'happy': { // ecstatic wiggle
        const hop = abs(sin(a * 7)) * 0.05;
        T.fy = hop;
        T.bry = sin(this.wagPhase * 0.5) * 0.24; T.nry = -T.bry * 1.5; T.brz = sin(a * 7) * 0.04;
        T.hy = sin(a * 5) * 0.2;
        T.jaw = 0.4; T.tongue = 1; T.earX = -0.15 + sin(a * 14) * 0.15; T.open = 0.5;
        tail(-0.9, 0.95, 22);
        break;
      }
      case 'bark': {
        const b = pulse((a * 4.4) % 1, 0, 0.5);
        T.neck = -0.25 - b * 0.3; T.jaw = 0.1 + b * 0.55; T.by = b * 0.03; T.fz = -b * 0.03;
        paw(0, 0.02 * b, 0.03 * b); paw(1, 0.02 * b, 0.03 * b); T.earX = -0.15;
        T.tongue = 0.5;
        tail(this.tailCarriage + 0.4, 0.4, 12);
        break;
      }
      case 'yip': { // "yipe yipe!": two hops, head up, mouth wide
        const k1 = pulse(a, 0.02, 0.3), k2 = pulse(a, 0.27, 0.55), k = Math.max(k1, k2);
        const settle = ease((a - 0.55) / 0.25);
        T.fy = k * 0.14;
        T.sq = 1 + 0.07 * k - 0.08 * (k < 0.15 && a > 0.05 ? 1 - k / 0.15 : 0) * (1 - settle);
        T.neck = -0.6 - k * 0.3; T.hx = -0.25 - k * 0.3;
        T.jaw = 0.12 + k * 0.6; T.tongue = 0.6; T.earX = -0.3; T.open = 1 - 0.75 * k; T.hy *= 0.2;
        paw(0, 0.06 * k, 0.12 * k); paw(1, 0.06 * k, 0.12 * k); T.brx = -0.15 * k;
        paw(2, -0.03 * k, 0.02 * k); paw(3, -0.03 * k, 0.02 * k);
        tail(-1.0, 0.7, 18);
        break;
      }
      case 'eat': { // head to the ground, crunch crunch, then chew with the head up
        const dn = ease(a / 0.18) * (1 - ease((a - 0.95) / 0.3));
        const chew = abs(sin(a * 13));
        T.neck = 1.0 * dn; T.n2 = 0.35 * dn; T.hx = 0.15 * dn; T.brx = 0.1 * dn; T.by = -0.03 * dn;
        paw(0, 0.05 * dn); paw(1, 0.05 * dn);
        T.jaw = 0.06 + chew * 0.42 * (a < 1.25 ? 1 : 0.4); T.tongue = 0.3 + chew * 0.3;
        T.hy *= 0.3; T.open = a > 0.2 && a < 1.2 ? 0.5 : 1;
        T.earX = -0.05;
        tail(this.tailCarriage + 0.35, 0.6, 15);
        break;
      }
      case 'tumble':
      case 'flop': {
        const full = this.anim === 'tumble';
        const D = full ? TUMBLE_DUR : FLOP_DUR;
        this.tumblePose(T, a, full, D, t);
        break;
      }
      case 'slam': { // Nala's pounce: crouch, leap, land
        const crouch = ease(a / 0.14) * (1 - ease((a - 0.14) / 0.04));
        const air = pulse(a, 0.16, 0.5);
        const land = pulse(a, 0.5, 0.62);
        T.fy = air * 0.5;
        T.sq = 1 - 0.14 * crouch + 0.13 * air - 0.14 * land;
        T.brx = 0.32 * crouch - 0.42 * air;
        T.by = -0.08 * crouch;
        paw(0, 0.05 * crouch + 0.22 * air + 0.06 * land, 0.2 * air); paw(1, 0.05 * crouch + 0.22 * air + 0.06 * land, 0.2 * air);
        paw(2, -0.06 * crouch - 0.12 * air, 0.08 * air); paw(3, -0.06 * crouch - 0.12 * air, 0.08 * air);
        T.neck = -0.2 - 0.3 * air; T.jaw = 0.5 * air + 0.2 * crouch; T.tongue = 0.8; T.earX = 0.6 * air;
        T.open = 1 - 0.4 * air;
        tail(-0.7, 0.4, 15);
        break;
      }
      case 'snap': { // catching a biscuit out of the air: crouch, hop up with the mouth wide, SNAP at SNAP_CATCH, land
        const crouch = pulse(a, 0, 0.14), air = pulse(a, 0.08, 0.52), land = pulse(a, 0.48, 0.66);
        const open = a < SNAP_CATCH - 0.02 ? ease((a - 0.04) / 0.12) : 0;
        T.fy = air * 0.34;
        T.sq = 1 - 0.12 * crouch + 0.1 * air - 0.13 * land;
        T.brx = -0.35 * air + 0.12 * crouch;
        paw(0, 0.1 * air, 0.16 * air); paw(1, 0.1 * air, 0.16 * air); paw(2, -0.05 * air, 0.04 * air); paw(3, -0.05 * air, 0.04 * air);
        T.neck = -0.75 * air - 0.1; T.hx = -0.3 * air;
        T.jaw = 0.05 + 0.62 * open; T.tongue = 0.2; T.earX = 0.4 * air - 0.1; T.open = a > SNAP_CATCH && a < SNAP_CATCH + 0.15 ? 0.3 : 1.05;
        tail(-0.6, 0.8, 20);
        break;
      }
      case 'pant': {
        T.sq = 1 + sin(t * 14) * 0.02;
        T.jaw = 0.32 + sin(t * 14) * 0.08; T.tongue = 1; T.neck = 0.05;
        tail(this.tailCarriage + 0.3, 0.5, 10);
        break;
      }
      case 'shake': { // shake off, head to tail
        const k = 1 - ease(a / 1.0);
        T.bry = sin(a * 36) * 0.3 * k; T.nry = sin(a * 36 + 1.2) * 0.35 * k; T.hy = sin(a * 36 + 2.2) * 0.3 * k;
        T.earX = sin(a * 36) * 0.5 * k;
        T.jaw = 0.15;
        break;
      }
      case 'swat': { // Molly has had enough: weight back, a front paw up and a quick swat down, ears back, a grumble
        const up = ease(a / 0.25) * (1 - ease((a - 0.55) / 0.3)), sw = ease((a - 0.25) / 0.18), back = 1 - ease((a - 0.75) / 0.3);
        paw(1, 0.03 + 0.2 * sw * back, 0.17 * up, -0.02); paw(0, -0.02, 0, 0.012);
        T.brx = -0.1 * up; T.fz = 0.06 * sw * back; T.by = -0.015;
        T.neck = -0.12; T.hx = 0.14 * sw * back; T.hy *= 0.2; T.earX = 0.55; T.worry = 0;
        T.jaw = 0.08 + 0.14 * pulse(a, 0.22, 0.75); T.tongue = 0; T.open = 0.75;
        tail(this.tailCarriage + 0.1, 0.04, 3);
        break;
      }
      case 'tug': { // a polite tug of war: the rump down and back, the front paws braced, the head low, a shake now and then
        const sh = pulse(a % 1.3, 0, 0.45);
        T.brx = -0.14; T.by = -0.05; T.bz = -0.04;
        paw(0, 0.09, 0, 0.02); paw(1, 0.11, 0, -0.02); paw(2, 0.05, 0, 0.03); paw(3, 0.05, 0, -0.03);
        T.neck = 0.3; T.n2 = 0.1; T.hx = 0.1; T.hy = sin(a * 15) * 0.4 * sh; T.nry = -T.hy * 0.4;
        T.jaw = 0.22; T.tongue = 0; T.earX = 0.25; T.fz = -0.03 * sh;
        tail(this.tailCarriage + 0.5, 0.6, 12);
        break;
      }
      case 'talk':
      case 'look':
        T.hy = sin(a * 1.4) * 0.7;
        T.neck = -0.5; T.hx = -0.12; T.earX = -0.2; T.brx -= 0.05;   // proud / alert: head up and back, chest out, ears forward
        break;
    }
    // relaxed carriage: standing about, sitting, walking and trotting, the neck is less upright and the head tips a little
    // down. The alert poses keep the head up.
    if (RELAX.has(this.anim)) {
      const k = 1 - this.wGal;
      T.neck += 0.08 * k; T.hx += 0.1 * k;
    }
    // the editor's posture: how this dog carries its head, neck and back by default (the sit has its own knobs)
    if (!SITS.has(this.anim) && !NAPS.has(this.anim)) {   // (asleep the head rests where the pose puts it)
      const lk = this.look;
      T.neck += lk.neckCarry; T.hx += lk.headCarry;
      if (!NO_SLOPE.has(this.anim)) T.brx += lk.spineLevel;
    }
    // a lower rear (Nala): the body slopes down toward the rump on her feet; sitting, lying and rolling set their own
    if (this.D.slope && !NO_SLOPE.has(this.anim)) { T.brx += this.D.slope; T.neck -= this.D.slope * 0.8; }
    // joy: a happy moment curls Dax's tail up over his back and brightens Nala's mopey face
    if (HAPPY.has(this.anim)) {
      T.joy = 1;
      if (this.look.happyTail != null) T.tailX = this.look.happyTail;
    }
  }

  // The whole knocked-over routine. full: barrel-rolls onto the back, kicks, rolls back over, shakes;
  // otherwise: a shorter flop and a wriggle.
  tumblePose(T, a, full, D, t) {
    const cy = this.bodyY;
    let th = 0, hop = 0, kick = 0, sq = 1, shake = 0, dizzy = 0;
    const A = full
      ? { hit: 0.12, r0: 0.12, r1: 0.75, k1: 1.4, b1: 1.85 }
      : { hit: 0.1, r0: 0.1, r1: 0.55, k1: 1.0, b1: 1.3 };
    if (a < A.hit) { sq = 1 - 0.22 * ease(a / A.hit); }
    else if (a < A.r1) {
      const u = (a - A.r0) / (A.r1 - A.r0);
      th = (full ? PI : PI * 0.92) * easeOut(u); hop = 0.3 * sin(PI * u); sq = 1 + 0.09 * sin(PI * u) + (u < 0.2 ? -0.18 * (1 - u / 0.2) : 0);
    } else if (a < A.k1) {
      th = (full ? PI : PI * 0.92) + sin(a * 9) * 0.12; kick = 1; dizzy = 1;
    } else if (a < A.b1) {
      const u = (a - A.k1) / (A.b1 - A.k1);
      th = full ? PI + PI * ease(u) : PI * 0.92 * (1 - ease(u));
      hop = 0.28 * sin(PI * u); sq = 1 + 0.08 * sin(PI * u);
    } else if (a < D) {
      const u = (a - A.b1) / (D - A.b1);
      th = full ? TAU : 0;
      sq = 1 - 0.16 * Math.exp(-u * 6) * cos(u * 12); shake = (1 - u) * (u < 0.15 ? 0 : 1);
    }
    const c = (1 - cos(th)) / 2;               // 0 upright, 1 on the back
    const hc = cy + (0.2 - cy) * c + hop;      // where the belly centre should be
    T.fy = hc - cy * cos(th); T.fx = cy * sin(th); T.frz = th; T.sq = sq;
    // legs leave the ground as the body rolls: they hang from the hips and flail
    T.free = Math.min(1, c * 2.5 + (kick ? 1 : 0));
    const fl = c * (1 - c) * 4;
    if (kick) {
      T.z0 = sin(a * 15) * 0.12; T.z1 = sin(a * 15 + 1.7) * 0.12; T.z2 = sin(a * 15 + 3.1) * 0.1; T.z3 = sin(a * 15 + 4.6) * 0.1;
      T.y0 = 0.1 + sin(a * 15) * 0.06; T.y1 = 0.1 + sin(a * 15 + 1.7) * 0.06; T.y2 = T.y3 = 0.08;
      T.x0 = 0.05; T.x1 = -0.05; T.x2 = 0.06; T.x3 = -0.06;
      T.hz = sin(a * 6) * 0.3; T.tongue = 1; T.jaw = 0.45; T.open = 0.4;
      T.neck = -0.4; T.wagA = 0.6;
    } else {
      T.z0 = -0.08 * fl; T.z1 = 0.1 * fl; T.z2 = 0.08 * fl; T.z3 = -0.08 * fl;
      T.y0 = T.y1 = T.y2 = T.y3 = 0.06 * fl;
      T.x0 = 0.05 * fl; T.x1 = -0.05 * fl; T.x2 = 0.05 * fl; T.x3 = -0.05 * fl;
      T.jaw = 0.25 + 0.2 * fl; T.open = 0.5 + 0.3 * (1 - fl); T.neck = 0.2 * fl;
      T.earX = 0.4 * fl;
    }
    if (shake > 0) {
      T.bry = sin(a * 38) * 0.32 * shake; T.nry = sin(a * 38 + 1.2) * 0.35 * shake; T.hy = sin(a * 38 + 2.2) * 0.3 * shake;
      T.earX = sin(a * 38) * 0.55 * shake; T.jaw = 0.2; T.tongue = 0.7;
    }
    if (a < A.hit + 0.02) { T.jaw = 0.3; T.open = 1.15; }
    if (!dizzy && a > A.b1 && a < A.b1 + 0.3) T.hz = 0;
    T.tailX = -1.2; T.wagA = Math.max(T.wagA, 0.6);
  }

  // A napping dog's small movements: once in a window of `every` s, with a chance of `p`, at a repeatable moment of the
  // time asleep `a`: an ear flick, a front paw, or a sniff of the nose.
  napTwitch(T, a, ph, every, p) {
    const c = Math.floor(a / every), u = a - c * every;
    if (fract1(c + ph) >= p) return;
    const t0 = 0.5 + fract1(c + ph + 0.5) * (every - 1.2), k = pulse(u, t0, t0 + 0.35), kind = fract1(c + ph + 0.25);
    if (kind < 0.45) T.earX -= 0.6 * k; else if (kind < 0.75) T.z1 += 0.07 * k; else { T.jaw += 0.06 * k; T.hz += 0.08 * k; }
  }

  // Write the shown pose to the scene graph: body, neck, head, face, ears (springs), tail (chain), legs (IK).
  applyPose(dt, t) {
    const C = this.C, D = this.D;
    const sq = C.sq, sxz = 1 / Math.sqrt(sq);
    this.frame.position.set(C.fx, C.fy, C.fz);
    this.frame.rotation.set(C.frx, C.fry, C.frz);
    this.frame.scale.set(sxz, sq, sxz);
    const body = this.body;
    body.position.set(0, this.bodyY + C.by, C.bz);
    body.rotation.set(C.brx, C.bry, C.brz);
    this.brPh = (this.brPh + dt * 1.9 * C.brate) % TAU;
    const breathe = sin(this.brPh) * C.bamp;
    this.barrel.scale.set(1 + 0.006 * breathe, 1 + 0.012 * breathe, 1);
    // neck: the bend is shared by the two lower bones, the head counter-rotates a little so it stays level
    const bones = this.bones, nk = C.neck, nY = C.nry + clamp(this.lookYaw, -1.1, 1.1) * 0.35;
    bones[0].rotation.set(this.neckRest[0] + nk * 0.55, nY * 0.5, 0);
    bones[1].rotation.set(this.neckRest[1] - this.neckRest[0] + nk * 0.45 + C.n2, nY * 0.5, 0);
    bones[2].rotation.set(-this.neckRest[1] - nk * 0.35 + 0.03, 0, 0);
    this.head.rotation.set(C.hx, clamp(this.lookYaw, -1.1, 1.1) * 0.65 + C.hy, C.hz);
    this.jawG.rotation.x = clamp(C.jaw, 0, 0.8);
    const tg = this.tongueM;
    if (C.tongue > 0.05 && C.jaw > 0.05) {   // a flat pink tongue that lolls out and droops over the chin
      const len = 0.03 + 0.05 * C.tongue;
      tg.visible = true;
      tg.scale.set(0.018 + 0.006 * C.tongue, 0.006, len);
      tg.position.set(0, 0.004 - 0.012 * C.tongue, D.F.jawLen * 0.45 + len * 0.55);
      tg.rotation.x = 0.15 + 0.6 * C.tongue;
    } else tg.visible = false;
    const open = clamp(C.open, 0.08, 1.15);
    for (const e of this.eyes) { e.scale.y = open; e.position.y = -0.006 * (1 - Math.min(1, open)); }
    for (const b of this.brows) {
      const on = !!this.look.brows || C.worry > 0.3;
      b.visible = on;
      if (on) {
        // worry: the inner ends lift and the brows draw together (a furrow); Dax carries a little of it all the time
        const wr = (this.look.brows ? 0.3 + 0.7 * C.worry : C.worry) * (1 - 0.75 * C.joy);
        b.rotation.z = -b.userData.s * 0.45 * wr;
        if (b.userData.y0 === undefined) b.userData.y0 = b.position.y;
        b.position.y = b.userData.y0 + 0.004 * wr;
        b.scale.set(1 + 0.15 * wr, 1 + 0.6 * wr, 1);
      }
    }
    // ears: springs that lag the head (gravity holds them down, the pose lifts or pins them)
    this.animateEars(dt, C);
    // tail: carriage, wag with follow-through down the chain, a little spring on bounces
    this.animateTail(dt, C);
    // legs
    this.solveLegs(C, dt);
    void t;
  }

  animateEars(dt, C) {
    const headPitch = this.head.rotation.x + C.neck * 0.8;      // how far the head is tipped (down is +)
    const sub = Math.min(dt, 1 / 60), steps = Math.max(1, Math.round(dt / sub)), h = dt / steps;
    for (const e of this.ears) {
      const rose = this.look.earStyle === 'rose';
      // target: the pose's ear angle (earX > 0 = back / droop, < 0 = pricked forward) plus the head's tip
      const tx = (rose ? 0.5 : 0.9) * C.earX - (rose ? 0.25 : 0.6) * headPitch * (rose ? 0.3 : 1);
      const tz = e.s * C.earZ;
      const K = rose ? 160 : 90, Cc = rose ? 16 : 9;
      for (let i = 0; i < steps; i++) {
        e.va += (K * (tx - e.a) - Cc * e.va) * h; e.a += e.va * h;
        e.vb += (K * (tz - e.b) - Cc * e.vb) * h; e.b += e.vb * h;
      }
      // the spring swings the ear about its own hinge (x: back and forth, z: out and in), on top of the rest orientation
      _q.setFromAxisAngle(_v.set(1, 0, 0), clamp(e.a, -1.2, 1.2));
      e.g.quaternion.copy(e.base).multiply(_q);
      _q.setFromAxisAngle(_v.set(0, 0, 1), clamp(e.b, -0.8, 0.8) + (rose ? 0 : -e.s * 0.35 * Math.max(0, -C.earX)));
      e.g.quaternion.multiply(_q);
    }
  }

  animateTail(dt, C) {
    const wp = this.wagPhase, tb = this.tailBones, S = this.tailSpring;
    this.tail.rotation.set(C.tailX, sin(wp) * C.wagA + C.tailY, 0);
    // the chain lags the base: later bones swing later and further (follow-through), and droop under gravity
    const droop = 0.18 + 0.1 * Math.max(0, -cos(C.tailX)) ;
    const sub = Math.min(dt, 1 / 60), steps = Math.max(1, Math.round(dt / sub)), h = dt / steps;
    const target = C.wagA * 0.8 * sin(wp - 0.9);
    for (let i = 0; i < steps; i++) { S[1] += (140 * (target - S[0]) - 14 * S[1]) * h; S[0] += S[1] * h; }
    // a sickle tail (Dax) curls up and forward over the back from each joint while it is carried up; tucked or sitting
    // on it, the curl lets go
    const curl = (this.look.curl || 0) * C.joy * smoothstep(-2.3, -1.2, C.tailX);
    tb[1].rotation.set(droop * 0.6 + curl, S[0] * 0.45, C.tailC);
    tb[2].rotation.set(droop * 0.6 + curl * 1.1, sin(wp - 1.6) * C.wagA * 0.5, C.tailC);
    tb[3].rotation.set(droop * 0.5 + curl * 1.2, sin(wp - 2.3) * C.wagA * 0.4, C.tailC);
  }

  // The pastern's lean: forward-down at rest, further with the paw ahead of the joint, the heel up with the paw behind it,
  // and folding while the paw swings.
  pasternAngle(L, dz, sw) {
    return L.ea + clamp(1.2 * dz / (L.L1 + L.L2), -0.6, 0.6) + 0.5 * sw;
  }

  // Two-bone IK from each shoulder/hip to the pastern joint, then the pastern down to the paw, which stays flat.
  solveLegs(C, dt) {
    const D = this.D, body = this.body;
    const free = C.free;
    // never hold the body so high that a planted paw would be dragged off the ground: find how far it must come down
    let cap = 0;
    if (free < 0.5) {
      for (let i = 0; i < 4; i++) {
        const L = this.legs[i];
        if (L.swing > 0) continue;
        _v2.set(L.hx, L.hy, L.hz).applyQuaternion(body.quaternion).add(body.position);     // joint in frame space
        const ea = this.pasternAngle(L, C[PZ[i]], 0), ax = L.hx + C[PX[i]], ay = D.PAW_H + C[PY[i]] + L.E * cos(ea), az = L.restZ + C[PZ[i]] - L.E * sin(ea);
        const h = Math.hypot(ax - _v2.x, az - _v2.z), maxR = (L.L1 + L.L2) * 0.995;
        const need = Math.sqrt(Math.max(0, maxR * maxR - h * h));
        const d = (_v2.y - ay) - need;
        if (d > cap) cap = d;
      }
    }
    cap *= 1 - 0.7 * this.wGal;     // at a gallop the legs may stretch a little instead (unseen at that speed)
    this.capY += (cap - this.capY) * (1 - Math.exp(-dt * (cap > this.capY ? 45 : 20)));
    body.position.y -= this.capY;
    _q.copy(body.quaternion).invert();
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i], L1 = L.L1, L2 = L.L2;
      // paw target in body space
      if (free < 0.999) {
        _v.set(L.hx + C[PX[i]], D.PAW_H + C[PY[i]], L.restZ + C[PZ[i]]).sub(body.position).applyQuaternion(_q);
      }
      if (free > 0.001) {
        _v2.set(L.hx + C[PX[i]] * 1.5, L.hy - (L1 + L2) * 0.55 + C[PY[i]], L.hz + C[PZ[i]] * 2);
        if (free < 0.999) _v.lerp(_v2, free); else _v.copy(_v2);
      }
      // the pastern leans forward-down from the joint above the paw; more as the paw swings (toes trail)
      const sw = L.swing > 0 ? sin(PI * L.swing) : 0;
      const ea = this.pasternAngle(L, C[PZ[i]], sw);
      const E = L.E;
      const ax = _v.x, ay = _v.y + E * cos(ea), az = _v.z - E * sin(ea);
      const dx = ax - L.hx;
      const psi = Math.atan2(dx, -(ay - L.hy));               // splay sideways so the paw reaches its spot
      let dz = az - L.hz, dy = -Math.hypot(dx, ay - L.hy);
      let dist = Math.hypot(dz, dy);
      const maxR = (L1 + L2) * 0.995;
      if (dist > maxR) { dz *= maxR / dist; dy *= maxR / dist; dist = maxR; }
      const phi = Math.atan2(dz, -dy);
      const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
      const alpha = Math.acos(cosA);
      const phi1 = L.front ? phi - alpha : phi + alpha;        // front: elbow back; hind: stifle forward
      const kz = L.hz + sin(phi1) * L1, ky = L.hy - cos(phi1) * L1;
      const fz = L.hz + dz, fy = L.hy + dy;
      const phi2 = Math.atan2(fz - kz, -(fy - ky));
      const phi3 = ea;                                          // the pastern's own slope (forward = +)
      L.hip.rotation.z = psi;
      L.upper.rotation.x = -phi1;
      L.lower.rotation.x = -(phi2 - phi1);
      L.foot.rotation.x = -(phi3 - phi2);
      // the paw stays flat on the ground (counter the chain and the body pitch), toes dip while swinging
      L.paw.rotation.x = phi3 - C.brx * (1 - free) + 0.9 * sw;
      L.paw.rotation.z = -psi;
    }
  }
}

// ------------------------------------------------------------------ treats (a little biscuit bone on the grass)

let treatGeo = null;
export function treatMesh() {
  const g = new THREE.Group();
  if (!treatGeo) {
    treatGeo = {
      bar: new THREE.CapsuleGeometry(0.035, 0.16, 3, 8),
      knob: new THREE.SphereGeometry(0.052, 8, 6),
    };
  }
  const m = toon('#e8b96a');
  const bar = new THREE.Mesh(treatGeo.bar, m); bar.rotation.z = PI / 2; g.add(bar);
  for (const [x, z] of [[-0.11, 0.035], [-0.11, -0.035], [0.11, 0.035], [0.11, -0.035]]) {
    const k = new THREE.Mesh(treatGeo.knob, m); k.position.set(x, 0, z); g.add(k);
  }
  g.scale.setScalar(1.15);
  shadows(g, true, false);
  return g;
}

// ------------------------------------------------------------------ dog sound effects

// Registered lazily by the NPC system (audio.registerSfx needs no AudioContext).
export function registerDogSfx(audio) {
  if (!audio || audio._dogSfx) return;
  audio._dogSfx = true;
  const dest = (a, x, y, z) => (x === undefined ? a.sfx : a.atVoice(x, y, z));
  // Dax's "yipe yipe!": two short, very high yelps with a downward glide, nasal band-pass (peak about 0.15)
  audio.registerSfx('yipe', (a, x, y, z) => {
    if (x !== undefined && Math.hypot(x - a.listener.x, z - a.listener.z) > 45) return;
    const out = dest(a, x, y, z), ctx = a.ctx, t0 = ctx.currentTime + 0.03;
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.25, top = 2500 - i * 150, len = 0.13;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(top * 0.72, t);
      o.frequency.exponentialRampToValueAtTime(top, t + 0.025);
      o.frequency.exponentialRampToValueAtTime(top * 0.62, t + len);
      const vib = ctx.createOscillator(); vib.frequency.value = 34;
      const vg = a.gain(60); vib.connect(vg).connect(o.frequency);
      const nasal = a.filter('bandpass', 2300, 3.2), body = a.filter('lowpass', 4200, 0.7), g = a.gain(0);
      a.env(g, t, 0.006, 0.26, len);
      o.connect(nasal).connect(body).connect(g).connect(out);
      // a quieter octave-down layer gives it a small dog-sized chest
      const o2 = ctx.createOscillator(); o2.type = 'triangle';
      o2.frequency.setValueAtTime(top * 0.36, t); o2.frequency.exponentialRampToValueAtTime(top * 0.3, t + len);
      const g2 = a.gain(0); a.env(g2, t, 0.008, 0.09, len * 0.9);
      o2.connect(g2).connect(out);
      o.start(t); vib.start(t); o2.start(t);
      o.stop(t + len + 0.05); vib.stop(t + len + 0.05); o2.stop(t + len + 0.05);
    }
  });
  // crunch crunch crunch: a dog treat
  audio.registerSfx('crunch', (a, x, y, z, opts = {}) => {
    const out = x === undefined ? a.sfx : a.at(x, y, z, 4);
    const t0 = a.ctx.currentTime + 0.01, n = opts.count || 3;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.13 + Math.random() * 0.03), k = 0.85 + Math.random() * 0.3;
      a.burst(out, { t, dur: 0.06, f: 2400 * k, Q: 1.1, peak: 0.16 });
      a.burst(out, { t, dur: 0.09, type: 'lowpass', f: 700 * k, peak: 0.14, brown: true });
      a.tone(out, { t, f: 220 * k, glide: 110, a: 0.002, d: 0.06, peak: 0.07 });
    }
  });
  // a dog landing on the grass
  audio.registerSfx('dogthump', (a, x, y, z, opts = {}) => {
    const out = x === undefined ? a.sfx : a.at(x, y, z, 5), s = opts.size || 1;
    const t = a.ctx.currentTime + 0.01;
    a.tone(out, { t, f: 130, glide: 55, a: 0.003, d: 0.14, peak: 0.16 * s });
    a.burst(out, { t, dur: 0.12, type: 'lowpass', f: 500, peak: 0.14 * s, brown: true });
  });
}
