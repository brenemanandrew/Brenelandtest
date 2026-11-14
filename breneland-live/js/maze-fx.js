// Beneath Angell Street, the atmosphere: how it feels down there. Pretty dark except your light stays the rule. Built by
// maze-scene.js once the lights, the hand and the controller exist. It then places and drives the lights every frame (the scene
// keeps creating them: a fixed set, so no material recompiles), and owns everything that is only atmosphere:
//
//   the lantern     an organic flicker (layered value noise that never repeats, steadier when you stand still, a gutter now and
//                   then when you sprint or turn fast), the hand's lantern on a little pendulum (the swing moves the shadows),
//                   the light at the glass, a soft glow round the glass, a warm glow on your own hand and sleeve; the one shadow
//                   map per level (Fast hard and small, High soft, Max soft, larger and the spot widened: SHADOW below)
//   the air         dust motes drifting in the lantern's light only (drawn wherever they are, lit by their distance to the
//                   glass; a shader moves them, nothing a frame on the CPU), your breath as faint vapour (more after a sprint),
//                   the composite's cold blue in the deepest shadows near you, a very subtle vignette, a faint film grain on
//                   High and Max (toon.js uCold, uVignette, uGrain), the daylight down the exit flight as a pale shaft with dust
//   wet stone       a banded wet sheen on the stone, the flagstones and the brick (a patch on the kit's toon materials: the
//                   lantern's and the two torches' highlights, in streaks and patches, cel bands not plastic), puddles that
//                   reflect the lights as a bright blob, drips from the ceiling (a streak, a splash ring), the water's slow
//                   ripples with the lights' reflections broken up in it, your steps rippling the flooded cells
//   other lights    the torches' own flicker and smoke wisps, a flickering halo on every torch and candle (the candles gutter),
//                   the ritual sigil pulsing slowly, the glyphs breathing, friends' lanterns flickering on their own seeds
//
// Pools only (no per-frame allocation): 8 drips, 8 rings, 6 ripples, 40 puffs (breath and smoke); the motes and halos are fixed
// buffers. The ghoul talks to it through `api` (maze-scene.js returns it as `scene.fx`, docs/CONTRACTS.md):
//   fx.threat = k (0..1)   something is near: the edges darken, the lantern trembles, the bed hushes a little (held until set)
//   fx.gutter(k = 1)       the flame nearly goes out for a moment, then recovers
//   fx.dim = k (0..1)      the lantern dimmed by k (held until set back to 0)
//   fx.hush = k (0..1)     the ambience and the dread drone lean back by k (silence before something happens)
//   fx.lantern             { x, y, z (world), intensity, flicker } where your light is right now (read only, one reused object)
//   fx.lights              the THREE lights: { lantern, spot, friends, torches, candle } (read only)
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { LAYER_SOFT } from './toon.js';
import { CELL, DIRS } from './maze-gen.js';
import { WALL_H, WATER_Y } from './maze-kit.js';
import { tallHand } from './maze-view.js'; // the hand lower and to the right on a tall screen, the wider view
import { breathPlan, CROUCH } from './maze-sneak.js'; // the breath follows your stamina; the crouch's darker edges

// ---- noise: a value noise on a hashed integer lattice (smooth, never periodic), layered for a flame
function hash1(i) { let x = Math.imul((i | 0) ^ 0x5bd1e995, 0x27d4eb2d); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
export function vnoise(t, seed = 0) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), s = Math.imul(seed | 0, 7919); const a = hash1(i + s), b = hash1(i + 1 + s); return a + (b - a) * u; }
// a flame's lean (radians, world x / z) toward trailing its lantern's motion (vx, vz m/s): a damped spring, so it lags a
// start, leans back at a walk and further at a run, swings past and settles when you stop or turn
export const LEAN = { k: 0.075, max: 0.6, stiff: 38, damp: 6.5 };
export function leanStep(L, vx, vz, dt) {
  let tx = -vx * LEAN.k, tz = -vz * LEAN.k; const m = Math.hypot(tx, tz); if (m > LEAN.max) { tx *= LEAN.max / m; tz *= LEAN.max / m; }
  L.vx += (LEAN.stiff * (tx - L.x) - LEAN.damp * L.vx) * dt; L.vz += (LEAN.stiff * (tz - L.z) - LEAN.damp * L.vz) * dt;
  L.x += L.vx * dt; L.z += L.vz * dt;
}
export function flameNoise(t, seed = 0) { return vnoise(t * 2.3, seed) * 0.5 + vnoise(t * 5.9, seed + 11) * 0.3 + vnoise(t * 14.3, seed + 23) * 0.2; } // 0..1
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- the one shadow map per level: Fast hard and small; High soft (PCF over a radius of texels: three r186's PCF takes
// shadow.radius, so soft needs no recompile); Max soft with a larger map and the spot widened (it is still aimed where you
// look: in first person the view is all you ever see, and a point light's cube is six more renders of the maze a frame)
export const SHADOW = {
  low: { pc: 512, phone: 512, radius: 0, angle: 1.0 },
  high: { pc: 1024, phone: 512, radius: 2.5, angle: 1.0 },
  max: { pc: 2048, phone: 1024, radius: 4, angle: 1.25 },
};
const GRAIN = 0.032, VIGNETTE = 0.42;

// a soft round glow on a small canvas (the lantern's halo sprite)
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- the shader bits shared by the wet stone, the water and the puddles: three lights (the lantern, the two nearest torches)
// in world space, their colours already scaled by their strength this frame, the ripple rings, the time
const GLSL_COMMON = /* glsl */`
uniform float uMzTime; uniform vec3 uMzL[3]; uniform vec3 uMzLC[3];
varying vec3 vMzW;
`;
const GLSL_WET = /* glsl */`
uniform float uMzWet, uMzShine; varying vec3 vMzN;
float mzH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mzN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mzH(i), mzH(i + vec2(1.0, 0.0)), f.x), mix(mzH(i + vec2(0.0, 1.0)), mzH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
// the wet sheen: Blinn highlights in two cel bands (a crisp blob and a faint skirt), only where the stone is wet (patches on the
// floor, streaks down the walls), fading with the light's distance. The highlight is the light's colour cooled toward a pale
// blue-white (water shines cold, or wet walls read as amber stains), tight and glossy (a sharp blob, almost no skirt), fewer
// patches on the walls than on the floor, and the lantern's own share is put out by its shadow (the one spot's map: no highlight
// on stone the lantern can't reach)
const WET_FRAG = /* glsl */`
{
  vec3 N = normalize(vMzN), V = normalize(cameraPosition - vMzW);
  bool mzWall = abs(N.y) <= 0.5;
  vec2 q = mzWall ? vec2(dot(vMzW.xz, vec2(N.z, -N.x)) * 4.5, vMzW.y * 0.22) : vMzW.xz * 1.5;
  float lo = mzWall ? 0.63 : 0.5;
  float m = smoothstep(lo, lo + 0.06, mzN(q) * 0.65 + mzN(q * 3.3 + 7.0) * 0.35) * uMzWet;
  float mzSh = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
    mzSh = receiveShadow ? getShadow( spotShadowMap[ 0 ], spotLightShadows[ 0 ].shadowMapSize, spotLightShadows[ 0 ].shadowIntensity, spotLightShadows[ 0 ].shadowBias, spotLightShadows[ 0 ].shadowRadius, vSpotLightCoord[ 0 ] ) : 1.0;
  #endif
  vec3 sh = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 L = uMzL[i] - vMzW; float d = length(L); L /= max(d, 1e-3);
    float s = pow(max(dot(N, normalize(L + V)), 0.0), uMzShine);
    float gle = pow(1.0 - max(dot(N, V), 0.0), 2.0) * pow(clamp(1.0 - d / 5.5, 0.0, 1.0), 2.0) * max(dot(N, L), 0.0);
    vec3 lc = uMzLC[i]; lc = mix(lc, vec3(dot(lc, vec3(0.3333))) * vec3(0.72, 0.92, 1.25), 0.9); // cool and blue: on the warm stone the dark end of the tone curve pulled a weaker mix back to amber
    float k = (smoothstep(0.6, 0.64, s) * 1.05 + smoothstep(0.3, 0.6, s) * 0.05) / (1.0 + d * d * 0.3) + (mzWall ? smoothstep(0.05, 0.08, gle) * 0.07 : smoothstep(0.014, 0.024, gle) * 0.08 + smoothstep(0.045, 0.075, gle) * 0.14);
    sh += lc * k * (i == 0 ? mzSh : 1.0);
  }
  outgoingLight = outgoingLight * (1.0 - 0.12 * m) + sh * m; // wet stone a touch darker under its gloss
}
`;
// the water and the puddles: a normal from slow waves (water only) and the ripple rings, the lights reflected in it as bright
// blobs (broken up by the ripples), the rings catching the light, darker straight down (a little fresnel)
const WATER_FRAG = /* glsl */`
{
  vec2 xz = vMzW.xz, g = vec2(0.0); float t = uMzTime, ringL = 0.0;
  g += vec2(0.8, 0.6) * cos(dot(xz, vec2(0.8, 0.6)) * 2.3 + t * 0.7) * 0.11 * uMzWave;
  g += vec2(-0.5, 0.86) * cos(dot(xz, vec2(-0.5, 0.86)) * 3.7 - t * 0.9) * 0.09 * uMzWave;
  g += vec2(0.95, -0.3) * cos(dot(xz, vec2(0.95, -0.3)) * 6.1 + t * 1.3) * 0.07 * uMzWave;
  g += vec2(0.2, 0.98) * cos(dot(xz, vec2(0.2, 0.98)) * 11.3 - t * 1.9) * 0.05 * uMzWave;
  for (int i = 0; i < 6; i++) {
    vec4 r = uMzRip[i]; if (r.w <= 0.0) continue;
    vec2 dv = xz - r.xy; float dist = length(dv), x = dist - r.z * 0.55;
    float env = exp(-x * x * 16.0) * r.w * exp(-r.z * 1.5), ph = cos(x * 26.0);
    g += dv / max(dist, 1e-3) * ph * env * 0.35; ringL += max(ph, 0.0) * env;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y)), V = normalize(cameraPosition - vMzW), R = reflect(-V, N), add = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 L = uMzL[i] - vMzW; float d = length(L); L /= max(d, 1e-3);
    float s = dot(R, L), fall = 1.0 / (1.0 + d * d * 0.12);
    add += uMzLC[i] * ((smoothstep(0.988, 0.992, s) * 1.8 + smoothstep(0.95, 0.988, s) * 0.12 + 0.03) * fall + ringL * 0.35 * fall);
  }
  outgoingLight = outgoingLight * (1.0 - 0.35 * pow(1.0 - max(dot(N, V), 0.0), 3.0)) + add;
}
`;
const VERT_WORLD = '#include <project_vertex>\nvMzW = (modelMatrix * vec4(transformed, 1.0)).xyz;';
// your own arm and hand in first person: cel bands from the lantern's glass, not the scene's lights (a lit material this
// close to the light blew out white): a cool dark fill, the warm light in three steps by how the surface faces the glass (warm from
// below, the back of the hand and the top of the forearm in the darker bands), and the warm glow right at the glass
const HAND_CEL = `{ vec3 nW = normalize(inverseTransformDirection(normal, viewMatrix)); vec3 toL = uMzGlass - vMzW; float d = length(toL);
  float ndl = dot(nW, toL / max(d, 1e-4)), band = ndl > 0.3 ? 1.0 : ndl > -0.35 ? 0.68 : 0.44;
  vec3 irr = vec3(0.13, 0.14, 0.19) + vec3(1.0, 0.8, 0.58) * uMzLit * band * 0.82;
  outgoingLight = diffuseColor.rgb * irr + uMzGlow * (0.45 / (1.0 + d * d * 40.0)); }`;

export function createMazeFx(o) {
  const { scene, cam, group, origin, kit, maze, renderer, ink, me, hand, lantern, spot, friendLights, torchLights, candleLight, aud, phone = false, LANTERN, ambient = null, FOG = null, AMBIENT = null } = o;
  const { W, H } = maze;
  const small = phone || GFX.cls !== 'desktop';
  const added = [];   // what this module put in the scene (removed on dispose)
  const owned = [];   // geometries, materials and textures to dispose
  const add = (parent, obj) => { parent.add(obj); added.push(obj); obj.traverse(q => { if (q.isMesh || q.isPoints || q.isSprite) { q.layers.set(LAYER_SOFT); if (q.geometry) owned.push(q.geometry); if (q.material) owned.push(q.material); } }); return obj; };
  const seed = (Math.random() * 1e5) | 0;
  let level = null, reduced = false, grainOn = false;
  let threat = 0, threatS = 0, dim = 0, hush = 0, gutterAsk = 0;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const handAt = { x: 0, y: 0, z: 0, s: 1 };
  const lampCol = new THREE.Color(LANTERN.color), lampW = new THREE.Vector3(); // the glass, in world space, this frame

  // ---- reduced motion (no grain, the lantern barely sways, no camera bob)
  const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const onMql = () => { reduced = !!mql?.matches; applyLevel(true); };
  reduced = !!mql?.matches; mql?.addEventListener?.('change', onMql);

  // ---- shared uniforms (wet stone, water, puddles)
  const U = {
    uMzTime: { value: 0 },
    uMzL: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uMzLC: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uMzRip: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
  function patch(mat, tag, frag, extra = {}, wet = false) {
    mat.userData.mzExtra = extra; // the tests turn the wet off and on
    const prev = mat.onBeforeCompile; // the kit's own patch first, the bump's fade with distance
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      Object.assign(sh.uniforms, U, extra);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMzW;' + (wet ? '\nvarying vec3 vMzN;' : ''))
        .replace('#include <project_vertex>', VERT_WORLD + (wet ? '\nvMzN = normalize(mat3(modelMatrix) * objectNormal);' : ''));
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_COMMON + (wet ? GLSL_WET : 'uniform vec4 uMzRip[6]; uniform float uMzWave;\n'))
        .replace('#include <opaque_fragment>', frag + '\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => 'mz-' + tag;
    mat.needsUpdate = true;
  }
  // the kit's stone, flagstones and brick get the wet sheen; the water its ripples and reflections
  patch(kit.M.floor, 'wet', WET_FRAG, { uMzWet: { value: 1.0 }, uMzShine: { value: 30 } }, true);
  patch(kit.M.stone, 'wet', WET_FRAG, { uMzWet: { value: 0.55 }, uMzShine: { value: 26 } }, true);
  patch(kit.M.brick, 'wet', WET_FRAG, { uMzWet: { value: 0.45 }, uMzShine: { value: 20 } }, true);
  const WET = { floor: 1.0, stone: 0.55, brick: 0.45 };
  // (the water and the puddles reflect the lantern as if held a little higher and ahead: the mirror point of a lantern at your
  // hip is under your own feet, out of sight; this puts its bright blob on the wet floor in front of you, where you look)
  const UW = { ...U, uMzL: { value: [new THREE.Vector3(), U.uMzL.value[1], U.uMzL.value[2]] } };
  patch(kit.M.water, 'water', WATER_FRAG, { uMzWave: { value: 1 }, ...UW });

  // ---- puddles: dark irregular pools on a few dry corridor floors (from the maze's seed: the same on every screen), merged
  // into one mesh, reflecting the lights
  const puddleSpots = [];
  const puddleGeo = (() => {
    const pos = [], idx = [], inRoom = (x, y) => maze.rooms.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx, h = hash1(i * 31 + maze.seed);
      if (h > 0.11 || maze.water[i] || inRoom(cx, cy)) continue;
      const blobs = 1 + Math.floor(hash1(i * 7 + 3) * 3);
      for (let b = 0; b < blobs; b++) {
        const r0 = 0.35 + hash1(i * 13 + b) * 0.5, px = cx * CELL + 0.9 + hash1(i * 17 + b) * 2.2, pz = cy * CELL + 0.9 + hash1(i * 19 + b) * 2.2, n = 14, base = pos.length / 3;
        pos.push(px, 0.012, pz);
        if (b === 0) puddleSpots.push({ x: px, z: pz, cx, cy, r: r0 });
        for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rr = r0 * (0.75 + vnoise(k * 0.9, i + b) * 0.45); pos.push(px + Math.cos(a) * rr, 0.012, pz + Math.sin(a) * rr * 0.8); idx.push(base, base + 1 + ((k + 1) % n), base + 1 + k); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  })();
  const puddleMat = new THREE.MeshBasicMaterial({ color: '#070a10', transparent: true, opacity: 0.72, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  patch(puddleMat, 'puddle', WATER_FRAG, { uMzWave: { value: 0.22 }, ...UW });
  const puddles = add(group, new THREE.Mesh(puddleGeo, puddleMat)); puddles.name = 'maze-puddles'; puddles.renderOrder = 1;

  // ---- the lantern's glow round the glass (a sprite at the glass, both views), the glass warmer, a warm glow on hand and sleeve
  const glowTex = glowTexture(); owned.push(glowTex);
  const halo = add(scene, new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffc27a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })));
  halo.renderOrder = 6; halo.frustumCulled = false;
  const glass = hand.userData.glass, flame = hand.userData.flame, flameCore = hand.userData.flameCore || null, lampG = hand.userData.lamp || null;
  let flameK = 1, glassK = 1; // tests
  glass.material.color.set('#ffd08a'); glass.material.opacity = 0.42;
  const handGlow = { uMzGlass: { value: lampW }, uMzGlow: { value: new THREE.Vector3() }, uMzLit: { value: 0 } };
  hand.traverse(q => {
    const hex = q.isMesh && q.material.color ? q.material.color.getHex() : 0;
    if (!q.isMesh || q === glass || q === flame || hex === 0xfff4d8 || hex === 0xffb34a || hex === 0x3a2a1a || hex === 0x2a241c) return;
    const cel = q.material.isMeshToonMaterial; // your own arm and hand, copies of your body's toon materials
    q.material.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, handGlow);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMzW;').replace('#include <project_vertex>', VERT_WORLD);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uMzGlass, uMzGlow; uniform float uMzLit; varying vec3 vMzW;');
      if (cel) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', '').replace('#include <lights_fragment_maps>', '').replace('#include <lights_fragment_end>', '')
        .replace('#include <opaque_fragment>', HAND_CEL + '\n#include <opaque_fragment>');
      else sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '{ float d = distance(vMzW, uMzGlass); outgoingLight = outgoingLight * (0.8 + 0.35 * uMzGlow.x) + uMzGlow * (0.9 / (1.0 + d * d * 28.0)); }\n#include <opaque_fragment>');
    };
    q.material.customProgramCacheKey = () => cel ? 'mz-hand-cel' : 'mz-hand';
    q.material.needsUpdate = true;
  });

  // ---- dust motes: a fixed set wrapped in a box round the camera, moved by the shader, lit only near the glass (and in the
  // daylight shaft); additive, so the dark parts add nothing
  const MOTES = small ? 70 : 110;
  const moteGeo = new THREE.BufferGeometry();
  { const s = new Float32Array(MOTES * 3); for (let i = 0; i < s.length; i++) s[i] = Math.random(); moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3)); moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(s, 3)); }
  const moteU = {
    uTime: { value: 0 }, uScale: { value: 600 }, uCam: { value: new THREE.Vector3() }, uLamp: { value: lampW }, uLampK: { value: 0 }, uFloor: { value: new THREE.Vector2(origin.y + 0.05, origin.y + WALL_H - 0.1) },
    uShaftA: { value: new THREE.Vector3() }, uShaftB: { value: new THREE.Vector3() }, uShaftK: { value: 0 }, uColor: { value: new THREE.Color('#ffe2b4') },
  };
  const motes = add(scene, new THREE.Points(moteGeo, new THREE.ShaderMaterial({
    uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aSeed; uniform float uTime, uScale, uLampK, uShaftK; uniform vec3 uCam, uLamp, uShaftA, uShaftB; uniform vec2 uFloor; varying float vK;
      void main() {
        vec3 box = vec3(7.0, uFloor.y - uFloor.x, 7.0);
        vec3 p = aSeed * box + vec3(sin(uTime * 0.11 + aSeed.y * 20.0), 0.0, cos(uTime * 0.09 + aSeed.z * 17.0)) * 0.6 + vec3(0.035, -0.014, 0.022) * uTime
          + vec3(sin(uTime * 0.7 + aSeed.x * 31.0), sin(uTime * 0.5 + aSeed.z * 13.0), cos(uTime * 0.6 + aSeed.y * 23.0)) * 0.06;
        vec3 c = vec3(uCam.x - box.x * 0.5, uFloor.x, uCam.z - box.z * 0.5);
        p = c + mod(p - c, box);
        float k = uLampK * pow(clamp(1.0 - distance(p, uLamp) / 3.6, 0.0, 1.0), 2.0);
        vec3 ab = uShaftB - uShaftA; float t = clamp(dot(p - uShaftA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
        k += uShaftK * (1.0 - smoothstep(0.35, 0.9, distance(p, uShaftA + ab * t))) * (1.0 - t * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.01 * uScale / max(0.2, -mv.z), 1.5, 12.0);
        vK = k * smoothstep(0.25, 0.6, -mv.z) * (0.6 + 0.4 * sin(uTime * 1.7 + aSeed.x * 40.0));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vK;
      void main() { vec2 q = gl_PointCoord - 0.5; float a = 1.0 - dot(q, q) * 4.0; if (a <= 0.0 || vK < 0.003) discard; gl_FragColor = vec4(uColor * vK * a * 1.2, 1.0); }`,
  })));
  motes.frustumCulled = false; motes.renderOrder = 4; motes.name = 'maze-motes';

  // ---- the mist: big soft puffs wrapped round you, hanging low (thicker near the floor), drifting slowly, a cold
  // grey-green in the dark and warm where the lantern lights them; faded right in front of you and into the fog far off. Not on Fast
  const MIST = small ? 14 : 24;
  const mistGeo = new THREE.BufferGeometry();
  { const s = new Float32Array(MIST * 3); for (let i = 0; i < s.length; i++) s[i] = Math.random(); mistGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MIST * 3), 3)); mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(s, 3)); }
  const mistU = { uTime: { value: 0 }, uScale: { value: 600 }, uCam: { value: new THREE.Vector3() }, uLamp: { value: lampW }, uLampK: { value: 0 }, uAmb: { value: 1 }, uFloor: { value: origin.y },
    uMist: { value: new THREE.Color('#5d6f66') }, uWarm: { value: new THREE.Color('#e8c08a') } };
  const mist = add(scene, new THREE.Points(mistGeo, new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 aSeed; uniform float uTime, uScale, uLampK, uAmb, uFloor; uniform vec3 uCam, uLamp, uMist, uWarm; varying float vA, vS; varying vec3 vC;
      void main() {
        vec2 box = vec2(13.0);
        vec2 q = aSeed.xz * box + vec2(0.09, 0.05) * uTime + vec2(sin(uTime * 0.07 + aSeed.y * 20.0), cos(uTime * 0.05 + aSeed.x * 11.0)) * 1.2;
        vec2 c = uCam.xz - box * 0.5;
        q = c + mod(q - c, box);
        vec3 p = vec3(q.x, uFloor + 0.1 + pow(aSeed.y, 1.7) * 1.6 + sin(uTime * 0.21 + aSeed.z * 9.0) * 0.08, q.y);
        float lk = uLampK * pow(clamp(1.0 - distance(p, uLamp) / 5.0, 0.0, 1.0), 1.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((2.4 + aSeed.x * 1.6) * uScale / max(0.3, d), 2.0, 1024.0);
        float low = 1.0 - smoothstep(0.2, 1.7, p.y - uFloor);
        vA = (0.07 * uAmb + 0.2 * lk) * (0.35 + 0.65 * low) * smoothstep(0.9, 2.4, d) * (1.0 - smoothstep(7.5, 12.5, d));
        vC = mix(uMist * uAmb, uWarm, clamp(lk * 1.4, 0.0, 0.8));
        vS = aSeed.z * 6.28;
      }`,
    fragmentShader: /* glsl */`
      varying float vA, vS; varying vec3 vC;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r >= 1.0 || vA < 0.002) discard;
        float wisp = 0.75 + 0.25 * sin(q.x * 7.0 + vS) * sin(q.y * 5.0 - vS * 0.7);
        gl_FragColor = vec4(vC, vA * (1.0 - r) * (1.0 - r) * wisp);
      }`,
  })));
  mist.frustumCulled = false; mist.renderOrder = 3; mist.name = 'maze-mist';
  const fogC = FOG ? new THREE.Color(FOG.color) : null, _fc = new THREE.Color();

  // ---- halos on every torch and candle flame (one buffer for the maze): each flickers on its own seed, the candles gutter
  // now and then; they fade far later than the fog, so a torch down a corridor is a faint glow you can steer by
  const flames = [...(kit.flames || []), { ...kit.stair.candle, size: 0.26, kind: 'stair' }];
  const NF = flames.length;
  const hGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(NF * 3), sz = new Float32Array(NF), sd = new Float32Array(NF), kk = new Float32Array(NF), col = new Float32Array(NF * 3);
    flames.forEach((f, i) => { p[i * 3] = f.x; p[i * 3 + 1] = f.y; p[i * 3 + 2] = f.z; sz[i] = f.size; sd[i] = hash1(i * 101 + 7); kk[i] = 1; _c.set(f.kind === 'torch' ? '#ff8c3a' : '#ffbf66'); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; });
    hGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); hGeo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); hGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    hGeo.setAttribute('aK', new THREE.BufferAttribute(kk, 1)); hGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); hGeo.computeBoundingSphere();
  }
  const haloU = { uTime: { value: 0 }, uScale: { value: 600 } };
  const halos = add(group, new THREE.Points(hGeo, new THREE.ShaderMaterial({
    uniforms: haloU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSize, aSeed, aK; attribute vec3 aColor; uniform float uTime, uScale; varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0); float t = uTime, s = aSeed;
        float fl = 0.8 + 0.11 * sin(t * (6.3 + s * 2.0) + s * 40.0) + 0.06 * sin(t * (11.7 + s * 3.0) + s * 13.0) + 0.05 * sin(t * (2.1 + s) + s * 7.0);
        float gut = smoothstep(0.9, 1.0, sin(t * (0.23 + s * 0.17) + s * 60.0)) * (aSize < 0.4 ? 0.55 : 0.2);
        fl *= 1.0 - gut * (0.7 + 0.3 * sin(t * 31.0 + s * 9.0));
        float d = -mv.z;
        vCol = aColor * aK * fl * (1.0 - smoothstep(5.0, 18.0, d)) * smoothstep(0.15, 0.6, d);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * fl * uScale / max(d, 0.1), 1.0, 320.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r >= 1.0) discard; float a = pow(1.0 - r, 2.4) * 0.6 + pow(1.0 - min(r * 6.0, 1.0), 2.0) * 0.55; gl_FragColor = vec4(vCol * a, 1.0); }`,
  })));
  halos.frustumCulled = false; halos.renderOrder = 5; halos.name = 'maze-halos';
  const stairHaloK = hGeo.attributes.aK;

  // ---- puffs: breath and torch smoke, one pool, simulated on the CPU (a few dozen points), soft discs with normal blending
  const NP = 40;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pA = new Float32Array(NP), pSz = new Float32Array(NP);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3)); pGeo.setAttribute('aA', new THREE.BufferAttribute(pA, 1)); pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSz, 1));
  for (const k of ['position', 'aColor', 'aA', 'aSize']) pGeo.attributes[k].setUsage(THREE.DynamicDrawUsage);
  const puffU = { uScale: { value: 600 } };
  const puffs = add(group, new THREE.Points(pGeo, new THREE.ShaderMaterial({
    uniforms: puffU, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aA, aSize; uniform float uScale; varying vec3 vC; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vC = aColor; vA = aA * smoothstep(0.12, 0.35, d) * (1.0 - smoothstep(6.0, 9.0, d)); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(d, 0.1), 1.0, 400.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r >= 1.0 || vA < 0.002) discard; gl_FragColor = vec4(vC, vA * pow(1.0 - r, 1.6)); }`,
  })));
  puffs.frustumCulled = false; puffs.renderOrder = 3; puffs.name = 'maze-puffs';
  const P = Array.from({ length: NP }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 0.05, s1: 0.3, a: 0.1, r: 1, g: 1, b: 1, kind: 0 }));
  let puffN = 0;
  function puff(kind, x, y, z, vx, vy, vz, life, s0, s1, a, col) {
    let p = null; for (let i = 0; i < NP; i++) if (!P[i].on) { p = P[i]; break; }
    if (!p) { p = P[puffN % NP]; } puffN++;
    p.on = true; p.kind = kind; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.t = 0; p.life = life; p.s0 = s0; p.s1 = s1; p.a = a; _c.set(col); p.r = _c.r; p.g = _c.g; p.b = _c.b;
  }

  // ---- drips: a streak falling from the ceiling, a splash ring where it lands (or a ripple in the water), the drip's sound there
  const ND = 8, NR = 8;
  const streaks = add(group, new THREE.InstancedMesh(new THREE.BoxGeometry(0.005, 1, 0.005), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), ND));
  const ringGeo = new THREE.RingGeometry(0.82, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const rings = add(group, new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), NR)); // (front side only: it faces up; a transparent double side makes three re-check its program twice a frame)
  for (const im of [streaks, rings]) { im.frustumCulled = false; im.renderOrder = 4; _m.makeScale(0, 0, 0); for (let i = 0; i < im.count; i++) { im.setMatrixAt(i, _m); im.setColorAt(i, _c.setRGB(0, 0, 0)); } im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
  streaks.name = 'maze-drips'; rings.name = 'maze-rings';
  const D = Array.from({ length: ND }, () => ({ on: false, x: 0, y: 0, z: 0, vy: 0, floor: 0, wet: false }));
  const R = Array.from({ length: NR }, () => ({ on: false, x: 0, y: 0, z: 0, t: 0, big: 1 }));
  let dripT = 1.5, dripsSpawned = 0, ringsSpawned = 0, ripN = 0;
  const RIP = U.uMzRip.value;
  function ripple(x, z, amp = 1) { const r = RIP[ripN++ % RIP.length]; r.set(x + origin.x, z + origin.z, 0, amp); }
  function ring(x, y, z, big = 1) { let r = R.find(q => !q.on) || R[ringsSpawned % NR]; ringsSpawned++; r.on = true; r.x = x; r.y = y; r.z = z; r.t = 0; r.big = big; }
  const noCeil = new Set(); for (const r of [maze.startRoom, maze.exitRoom]) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) noCeil.add(y * W + x);
  function spawnDrip() {
    const d = D.find(q => !q.on); if (!d) return;
    const a = me.yaw + (Math.random() - 0.5) * 2.4, r = 1.3 + Math.random() * 3.4;
    let x = me.x + Math.sin(a) * r, z = me.z + Math.cos(a) * r;
    const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL), mx = Math.floor(me.x / CELL), my = Math.floor(me.z / CELL);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || noCeil.has(cy * W + cx)) return;
    if (cx !== mx || cy !== my) { // (only into the next cell through an opening: never through a wall)
      let ok = false; for (let k = 0; k < 4; k++) if (mx + DIRS[k][0] === cx && my + DIRS[k][1] === cy && !(maze.cells[my * W + mx] & DIRS[k][2])) ok = true;
      if (!ok) return;
    }
    x = clamp(x, cx * CELL + 0.5, cx * CELL + CELL - 0.5); z = clamp(z, cy * CELL + 0.5, cy * CELL + CELL - 0.5);
    const wet = !!maze.water[cy * W + cx];
    d.on = true; d.x = x; d.z = z; d.y = WALL_H - 0.04; d.vy = 0; d.wet = wet; d.floor = wet ? -0.08 : 0.012;
    dripsSpawned++;
  }

  // ---- the daylight down the exit flight: a pale shaft from the doorway down the treads (additive, soft edges), dust in it
  const ex = kit.exitStair;
  const shaftGeo = (() => {
    // the flight turns to face its way in: from the arched door down over the treads to the foot, in its own frame
    const P = (u, y, v) => { const p = ex.at(u, v); return [p.x, y, p.z]; }, ut = ex.uIn - 0.03, ub = -0.3, yt0 = ex.topY + 0.05, yt1 = ex.topY + 2.1, zt = 0.55, yb0 = 0.0, yb1 = 1.3, zb = 0.82;
    const T = [P(ut, yt1, -zt), P(ut, yt1, zt), P(ut, yt0, zt), P(ut, yt0, -zt)], B = [P(ub, yb1, -zb), P(ub, yb1, zb), P(ub, yb0, zb), P(ub, yb0, -zb)];
    const pos = [], uv = [], idx = [];
    for (let s = 0; s < 4; s++) { const a = s, b = (s + 1) % 4, base = pos.length / 3; pos.push(...T[a], ...T[b], ...B[b], ...B[a]); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(base, base + 1, base + 2, base, base + 2, base + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere(); return g;
  })();
  const shaftU = { uTime: { value: 0 }, uColor: { value: new THREE.Color('#fff0cf') } };
  const shaft = add(group, new THREE.Mesh(shaftGeo, new THREE.ShaderMaterial({
    uniforms: shaftU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main() { float e = pow(max(sin(3.14159 * clamp(vUv.x, 0.0, 1.0)), 0.0), 1.5), a = 0.12 * e * (1.0 - clamp(vUv.y, 0.0, 1.0) * 0.8) * (0.92 + 0.08 * sin(uTime * 0.6 + vUv.x * 5.0)); gl_FragColor = vec4(uColor * a, 1.0); }',
  })));
  shaft.name = 'maze-shaft'; shaft.renderOrder = 4;
  { const a = ex.at(ex.uIn - 0.3), b = ex.at(0); moteU.uShaftA.value.set(a.x, ex.topY + 1.2, a.z).add(origin); moteU.uShaftB.value.set(b.x, 0.6, b.z).add(origin); }

  // ---- the level: the shadow map, the grain, how many motes
  function applyLevel(force = false) {
    if (!force && level === GFX.level) return;
    level = GFX.level;
    const s = SHADOW[level] || SHADOW.high, sz = small ? s.phone : s.pc;
    if (spot.shadow.mapSize.x !== sz) { spot.shadow.mapSize.set(sz, sz); spot.shadow.map?.dispose(); spot.shadow.map = null; }
    spot.shadow.radius = s.radius; spot.angle = s.angle; spot.penumbra = level === 'max' ? 0.85 : 0.7;
    grainOn = level !== 'low' && !reduced;
    moteGeo.setDrawRange(0, level === 'low' ? Math.round(MOTES * 0.6) : MOTES);
    mist.visible = level !== 'low'; // no mist on Fast
  }
  applyLevel(true);

  // ---- the frame
  let ambK = -1; const camW = new THREE.Vector3(); // camW: the eye, for the drips' fade up close; ambK: the gloom's level last set
  const bPlan = {}, breathLog = []; // the breath's plan, reused; when the last breaths came, for the tests
  let flick = 1, gutterT = 9, gutterPeak = 0, gutterCool = 0, yawPrev = me.yaw, yawRate = 0, yawRatePrev = 0, speedPrev = 0;
  let runT = 0, gut = 0, flut = 0, flameF = 1; const lean = { x: 0, z: 0, vx: 0, vz: 0 }, lampPrev = new THREE.Vector3(), lampVel = new THREE.Vector3(); let lampHas = false;
  const _fw = new THREE.Vector3(), _fs = new THREE.Vector3(), friendFl = new Map();
  let th = 0, om = 0, ph = 0, pw = 0, omSign = 0, creakAt = 0, runRecent = 0, breathT = 3, smokeT = 0, sigil = 0.5, t0 = null;
  const near2 = [null, null], nearD = [1e9, 1e9];
  const lanternOut = { x: 0, y: 0, z: 0, intensity: 0, flicker: 1 };
  const audSt = { me, phase: 'stair', lit: 0, sigil: 0, hush: 0, threat: 0, exert: 0 };
  const friendSeed = new Map();
  const realTorches = kit.torches.filter(t => t.color === '#ffb060');
  const ritual = maze.rooms.find(r => r.kind === 'ritual');
  const sigilTorch = kit.torches.find(t => t.color === '#7fd6a6');

  let adapt = 1;
  function rayK(yaw) {
    const fx0 = Math.sin(yaw) * Math.cos(me.pitch), fz0 = Math.cos(yaw) * Math.cos(me.pitch);
    for (let k = 1; k <= 9; k++) {
      const d = k * 0.25, x = me.x + fx0 * d, z = me.z + fz0 * d, cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return 0.65;
      const bx = kit.cellBoxes[cy * W + cx];
      for (let b = 0; b < bx.length; b++) { const q = bx[b]; if (!q.circle && x > q.minX && x < q.maxX && z > q.minZ && z < q.maxZ) return 0.62 + 0.38 * Math.min(1, Math.max(0, (d - 0.4) / 1.8)); }
    }
    return 1;
  }
  const nearK = () => Math.min(rayK(me.yaw), 0.15 + rayK(me.yaw + 0.6), 0.15 + rayK(me.yaw - 0.6));
  function lampK(x, y, z, lit) { const d = Math.hypot(x + origin.x - lampW.x, y + origin.y - lampW.y, z + origin.z - lampW.z); const k = Math.max(0, 1 - d / 5.5); return k * k * lit * flick; }

  function update(dt, now, { view, body, remotes, phase, lit, wick = 1, flames = null }) {
    if (t0 === null) t0 = now;
    const t = now - t0;
    if (GFX.level !== level) applyLevel();
    // how you move: the turn rate (the lantern gutters at a fast turn), a sprint lately (more breath)
    let dy = me.yaw - yawPrev; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yawPrev = me.yaw;
    yawRatePrev = yawRate; yawRate += ((dt > 0 ? dy / dt : 0) - yawRate) * Math.min(1, dt * 12);
    runRecent = me.run ? 1 : Math.max(0, runRecent - dt * 0.22);
    threatS += (threat - threatS) * Math.min(1, dt * 3);

    // ---- the flicker: layered noise, more of it when you move, a gutter now and then (a sprint, a fast turn, the ghoul)
    // one signal for the flame you see and the light it gives: steady standing still, more alive walking, a flutter while you run
    // (stronger the longer the sprint), a gutter now and then at a sprint, a splash, a fast turn, the ghoul. The light, the glass and
    // the shadows follow it. Reduced motion: half the flicker, and a gutter doesn't dim the light
    const motion = clamp(me.speed / 6 + Math.abs(yawRate) / 5, 0, 1);
    const amp = (0.03 + 0.085 * motion + 0.12 * threatS) * (reduced ? 0.5 : 1);
    const fn = 1 + amp * (flameNoise(t, seed) * 2 - 1);
    gutterCool -= dt;
    runT = me.run ? runT + dt : 0;
    if (gutterAsk > 0) { gutterPeak = Math.max(gutterAsk, gutterT < 0.9 ? gutterPeak : 0); gutterT = 0; gutterAsk = 0; }
    else if (gutterCool <= 0 && phase === 'maze' && ((me.run && (Math.random() < dt * (0.16 + 0.7 * Math.min(1, runT / 1.5)) || (runT > 1 && gutterT > 2.2))) || Math.abs(yawRate) > 3.4 || (threatS > 0.3 && Math.random() < dt * threatS * 0.5))) { gutterPeak = 0.35 + Math.random() * 0.35 + threatS * 0.3; gutterT = 0; gutterCool = 1.4; }
    gutterT += dt;
    const env = gutterT < 0.1 ? gutterT / 0.1 : Math.exp(-(gutterT - 0.1) / 0.32);
    gut = Math.min(0.85, gutterPeak * env * (0.75 + 0.5 * (vnoise(t * 28, seed + 5) - 0.5)));
    flut += clamp((me.run ? Math.min(1, 0.35 + runT * 0.45) : 0) + gut * 1.3, 0, 1) * Math.min(1, dt * 6) - flut * Math.min(1, dt * 3);
    flut = clamp(flut, 0, 1);
    flameF = fn * (1 - gut) * (1 - flut * 0.18 * vnoise(t * 19, seed + 77));
    let f = (reduced ? fn : flameF) * (1 - dim);
    flick = f;

    // ---- the lantern on its pendulum (the hand's swing moves the light and so the shadows a little)
    // unsteady on your feet (out of breath, a long run): the lantern swings harder, and kicks on a lurch; none of it
    // under reduced motion
    const unst = reduced ? 0 : (me.unsteady || 0);
    const swayK = reduced ? 0.12 : 1, k = me.speed > 0.3 ? Math.min(1, me.speed / 4) : 0, hard = (me.run && !reduced ? 1.9 : 1) * (1 + 1.4 * unst); // under reduced motion a run doesn't swing it harder either
    if (!reduced && me.lurchKick) { om += me.lurchKick * 2.2; pw += Math.abs(me.lurchKick) * 0.8; } if (me.lurchKick) me.lurchKick = 0;
    const yawAcc = clamp(dt > 0 ? (yawRate - yawRatePrev) / dt : 0, -40, 40), acc = clamp(dt > 0 ? (me.speed - speedPrev) / dt : 0, -20, 20); speedPrev = me.speed;
    const idle = reduced ? 0 : (vnoise(t * 0.6, seed + 40) - 0.5) * 1.4;
    if (dt > 0) {
      om += (-38 * (th - Math.sin(me.bob) * 0.09 * k * hard * swayK) - 2.6 * om - yawAcc * 0.05 * swayK + idle) * dt; th = clamp(th + om * dt, -0.35, 0.35);
      pw += (-30 * (ph - Math.sin(me.bob * 2) * 0.03 * k * hard * swayK) - 2.4 * pw - acc * 0.03 * swayK + idle * 0.5) * dt; ph = clamp(ph + pw * dt, -0.25, 0.25);
    }
    const sgn = Math.sign(om);
    if (sgn !== omSign && Math.abs(th) > 0.05 && now - creakAt > 0.45 && view === 'fp') { creakAt = now; aud?.creak(Math.min(1, Math.abs(th) * 5)); }
    omSign = sgn;
    if (view === 'fp') {
      // the lantern swings from your fist, your arm only gives with it a little
      if (lampG) { hand.rotation.set(0.05 + ph * 0.3, -0.1 + th * 0.18, 0.02 + th * 0.3); lampG.rotation.set(ph * 0.75, 0, th * 0.75); }
      else hand.rotation.set(0.05 + ph, -0.1 + th * 0.6, 0.02 + th);
      const tall = cam.aspect < 1, tp = tall ? tallHand(cam, handAt) : null, sk = tall ? tp.s : 1; // placed on the screen
      if (hand.scale.x !== sk) { hand.scale.setScalar(sk); hand.userData.layout?.(tall); } // your arm laid out for a tall screen or a wide one
      hand.position.set(tall ? tp.x : 0.27, (tall ? tp.y : -0.06) + (hand.userData.lowered || 0) + Math.sin(me.bob * 2) * 0.012 * k * hard * (reduced ? 0 : 1), tall ? tp.z : -0.62); // (lowered: the cask under the arm, maze-goals.js)
      // the flame only once the wick has caught, small at first, growing with the light coming up
      flame.visible = wick > 0.02; if (flameCore) flameCore.visible = wick > 0.02; // `flame` is the wick's top, maze-flame.js draws it
      glass.getWorldPosition(lampW); // (updates the hand's chain: the swing just set)
    } else if (body.lantern) body.lantern.getWorldPosition(lampW); else lampW.set(me.x + origin.x, me.y + 1 + origin.y, me.z + origin.z);
    // (the eye adapting: a wall a hand's breadth from the glass would blow out white under the inverse square, so the light eases
    // off as the wall ahead comes close; walked by the grid's wall boxes, a few steps along the look)
    adapt += (nearK() - adapt) * Math.min(1, dt * 6);
    const L = lit * f * adapt;
    lantern.position.copy(lampW); lantern.intensity = LANTERN.k * L;
    spot.position.copy(lampW); spot.intensity = LANTERN.spot * L;
    const cp = Math.cos(me.pitch);
    spot.target.position.set(lampW.x + Math.sin(me.yaw) * cp * 4, lampW.y - Math.sin(me.pitch) * 4 - 0.6, lampW.z + Math.cos(me.yaw) * cp * 4);
    // the glow round the glass, the glass itself, the warm light on your hand and sleeve
    // while only the match burns, its own small glow at the hand (the halo small). The glass stays dark until the wick takes
    halo.position.copy(lampW); halo.visible = L > 0.02;
    const hs = (view === 'fp' ? 0.62 * (hand.scale.x) : 0.85) * (0.85 + 0.25 * f) * (0.45 + 0.55 * wick); halo.scale.set(hs, hs, 1);
    halo.material.opacity = clamp(0.85 * L * (0.55 + 0.45 * wick), 0, 1);
    glassK = (0.55 + 0.45 * L) * (0.3 + 0.7 * wick); flameK = flame.visible ? 0.3 + 0.7 * wick : 0;
    glass.material.color.setRGB(1, 0.82, 0.55).multiplyScalar(glassK * 0.62); // a clearer glass, the flame bright in it
    // the flame in the glass: it trails the glass's own motion with a little inertia (back as you walk, further at a run,
    // swinging out as you turn), shorter and fluttering as it gutters; in your hand, or in your body's lantern in third person
    if (dt > 0) {
      if (lampHas) { lampVel.x += ((lampW.x - lampPrev.x) / dt - lampVel.x) * Math.min(1, dt * 10); lampVel.z += ((lampW.z - lampPrev.z) / dt - lampVel.z) * Math.min(1, dt * 10); }
      lampPrev.copy(lampW); lampHas = true;
      leanStep(lean, lampVel.x, lampVel.z, dt);
    }
    const tpLamp = view !== 'fp' ? body.root.userData?.mzLamp : null;
    if (tpLamp) tpLamp.glass.material.color.setRGB(1, 0.82, 0.55).multiplyScalar(glassK * 1.3);
    if (flames) {
      const anchor = view === 'fp' ? (flame.visible ? flame : null) : (wick > 0.02 && tpLamp ? tpLamp.flame : null);
      if (anchor) {
        anchor.getWorldPosition(_fw); anchor.getWorldScale(_fs);
        const vis = reduced ? 1 + (fn - 1) * 1.2 - gut * 0.35 : 1 + (flameF - 1) * 1.5, kk = Math.max(0.15, (0.3 + 0.7 * wick) * vis * (1 - dim * 0.6));
        flames.setLantern(0, _fw.x - origin.x, _fw.y - origin.y, _fw.z - origin.z, 0.034 * _fs.y, 0.105 * _fs.y, kk, lean.x, lean.z, flut * (reduced ? 0.4 : 1), 0.15 + 0.85 * motion);
      } else flames.lanternOff(0);
    }
    handGlow.uMzGlow.value.set(1.0, 0.6, 0.28).multiplyScalar(0.7 * L); handGlow.uMzLit.value = L;

    // ---- friends' lanterns, each on its own seed
    let i = 0;
    for (const r of remotes.values()) {
      if (i >= friendLights.length) break;
      const l = friendLights[i++]; // i is this friend's flame instance too: 1..3
      let s = friendSeed.get(r.sid); if (s === undefined) { const str = String(r.sid); s = 0x811c9dc5; for (let c = 0; c < str.length; c++) s = Math.imul(s ^ str.charCodeAt(c), 16777619); s = (s >>> 0) % 100000; friendSeed.set(r.sid, s); }
      if (r.h.lantern) r.h.lantern.getWorldPosition(_w); else _w.copy(r.h.root.position).add(origin).add(_v.set(0, 1, 0));
      // their flame: the same as yours, driven by how they move (a flutter and gutters at a run, a gutter in the water)
      let F = friendFl.get(r.sid); if (!F) { F = { lean: { x: 0, z: 0, vx: 0, vz: 0 }, px: _w.x, pz: _w.z, vx: 0, vz: 0, gp: 0, gt: 9, cool: 0, flut: 0 }; friendFl.set(r.sid, F); }
      if (dt > 0) { F.vx += ((_w.x - F.px) / dt - F.vx) * Math.min(1, dt * 10); F.vz += ((_w.z - F.pz) / dt - F.vz) * Math.min(1, dt * 10); F.px = _w.x; F.pz = _w.z; leanStep(F.lean, F.vx, F.vz, dt); }
      const run = r.k === 1 || r.speed > 4.6, cx = Math.floor(r.h.root.position.x / CELL), cz = Math.floor(r.h.root.position.z / CELL), wet = cx >= 0 && cz >= 0 && cx < W && cz < H && !!maze.water[cz * W + cx];
      F.cool -= dt; F.gt += dt;
      if (F.cool <= 0 && ((run && Math.random() < dt * 0.5) || (wet && r.speed > 2.2 && Math.random() < dt * 0.8))) { F.gp = 0.35 + Math.random() * 0.3; F.gt = 0; F.cool = 1.2; }
      const fe = F.gt < 0.1 ? F.gt / 0.1 : Math.exp(-(F.gt - 0.1) / 0.32), fg = Math.min(0.85, F.gp * fe);
      F.flut = clamp(F.flut + ((run ? 0.6 : 0) + fg - F.flut) * Math.min(1, dt * 4), 0, 1);
      const fmo = clamp(r.speed / 6, 0, 1), ffn = 1 + (0.03 + 0.085 * fmo) * (reduced ? 0.5 : 1) * (flameNoise(t, s) * 2 - 1), ff = ffn * (1 - fg) * (1 - F.flut * 0.18 * vnoise(t * 19, s + 77));
      l.position.copy(_w); l.intensity = 22 * (reduced ? ffn : ff);
      F.f = reduced ? ffn : ff;
      const lamp = r.h.root.userData?.mzLamp;
      if (lamp) lamp.glass.material.color.setRGB(1, 0.82, 0.55).multiplyScalar(0.75 + 0.45 * F.f);
      if (flames) {
        if (lamp) { lamp.flame.getWorldPosition(_fw); lamp.flame.getWorldScale(_fs); flames.setLantern(i, _fw.x - origin.x, _fw.y - origin.y, _fw.z - origin.z, 0.026 * _fs.y, 0.085 * _fs.y, Math.max(0.15, 1 + ((reduced ? ffn - fg * 0.35 : ff) - 1) * 1.5), F.lean.x, F.lean.z, F.flut * (reduced ? 0.4 : 1), 0.15 + 0.85 * fmo); }
        else flames.lanternOff(i);
      }
    }
    for (; i < friendLights.length; i++) { friendLights[i].intensity = 0; flames?.lanternOff(i + 1); }

    // ---- the two nearest fixed lights (no sorting a frame), each torch on its own flicker, the sigil's slow pulse
    nearD[0] = nearD[1] = 1e9; near2[0] = near2[1] = null;
    for (let q = 0; q < kit.torches.length; q++) { const tt = kit.torches[q], d = (tt.x - me.x) * (tt.x - me.x) + (tt.z - me.z) * (tt.z - me.z); if (d < nearD[0]) { nearD[1] = nearD[0]; near2[1] = near2[0]; nearD[0] = d; near2[0] = tt; } else if (d < nearD[1]) { nearD[1] = d; near2[1] = tt; } }
    sigil = 0.5 + 0.5 * Math.sin(t * 0.8) * (0.85 + 0.15 * Math.sin(t * 0.31));
    for (let q = 0; q < 2; q++) {
      const l = torchLights[q], tt = near2[q];
      if (!tt || nearD[q] > 256) { l.intensity = 0; continue; }
      l.position.set(tt.x, tt.y, tt.z).add(origin); l.color.set(tt.color);
      const own = kit.torches.indexOf(tt);
      const fl = tt === sigilTorch ? 0.55 + 0.65 * sigil : tt.color === '#ffb060' ? 0.78 + 0.32 * flameNoise(t * 1.1, 300 + own) - (vnoise(t * 0.4, 500 + own) > 0.86 ? 0.25 : 0) : 0.95 + 0.05 * vnoise(t * 0.5, own);
      l.intensity = 14 * tt.k * fl;
    }
    // the candle at the top of the stair gutters out as you go down (and its halo with it)
    const down = Math.max(0, Math.min(1, (kit.stair.top - me.y - 1.5) / (kit.stair.top * 0.7)));
    const ck = phase === 'stair' ? (1 - down) * (0.75 + 0.25 * flameNoise(t * 1.6, seed + 3)) : 0;
    candleLight.intensity = 26 * ck;
    if (Math.abs(stairHaloK.array[NF - 1] - ck) > 0.02) { stairHaloK.array[NF - 1] = ck; stairHaloK.needsUpdate = true; }

    // ---- the materials that breathe: the glyphs, the sigil, the flames' cores
    const M = kit.M;
    for (let q = 0; q < M.glyphs.length; q++) M.glyphs[q].opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * (0.5 + q * 0.07) + q * 2.1));
    M.sigil.color.setScalar(0.55 + 0.6 * sigil);
    M.flame.color.setRGB(1, 0.82 + 0.06 * Math.sin(t * 9.1), 0.48);

    // ---- the shared reflections: the lantern and the two nearest lights
    U.uMzTime.value = t;
    U.uMzL.value[0].copy(lampW); UW.uMzL.value[0].set(lampW.x + Math.sin(me.yaw) * 1.7, lampW.y + 0.9, lampW.z + Math.cos(me.yaw) * 1.7); U.uMzLC.value[0].set(lampCol.r, lampCol.g, lampCol.b).multiplyScalar(0.6 * L);
    for (let q = 0; q < 2; q++) { const l = torchLights[q]; U.uMzL.value[q + 1].copy(l.position); U.uMzLC.value[q + 1].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity / 14 * 0.32); }
    for (const r of RIP) if (r.w > 0) { r.z += dt; if (r.z > 3) r.w = 0; }

    // ---- point sizes follow the drawing buffer
    const scale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    moteU.uScale.value = haloU.uScale.value = puffU.uScale.value = mistU.uScale.value = scale;
    // ---- the motes and the shaft
    moteU.uTime.value = t; cam.getWorldPosition(moteU.uCam.value); moteU.uLampK.value = 0.9 * L;
    // the gloom: in the lights-out beat the fog, the void and the cold ambient go with the light (black before the
    // match), the rest of the time they are there; the mist with them
    const amb = phase === 'dark' ? lit : 1;
    if (fogC && Math.abs(amb - ambK) > 0.002) { ambK = amb; _fc.copy(fogC).multiplyScalar(amb); scene.fog.color.copy(_fc); scene.background?.copy?.(_fc); if (ambient) ambient.intensity = AMBIENT.k * amb; }
    mistU.uTime.value = t; mistU.uCam.value.copy(moteU.uCam.value); mistU.uLampK.value = L; mistU.uAmb.value = amb;
    const sd = Math.hypot(me.x - ex.mid.x, me.z - ex.mid.z);
    moteU.uShaftK.value = sd < 14 ? 0.7 : 0; shaftU.uTime.value = t; shaft.visible = sd < 24;
    haloU.uTime.value = t;

    // ---- breath: an exhale every few seconds, quicker and stronger after a sprint (and heard when the breath bar is low)
    // the breathing follows your stamina (maze-sneak.js breathPlan): calm and slow at full, quicker and louder as it drains, ragged
    // gasps when winded, slowing as it refills. Always heard, quietly at full, and a little under the ghoul's own sounds when it's
    // near (you hold your breath)
    const plan = breathPlan(me.breath, me.winded, runRecent, bPlan);
    const exert = plan.ex;
    if (phase === 'maze' || phase === 'stair') {
      breathT = Math.min(breathT, plan.period * 1.15) - dt; // (winded all at once: the next breath comes sooner)
      if (breathT <= 0) {
        breathT = plan.period * (plan.ragged > 0.5 ? 0.7 + Math.random() * 0.6 : 0.88 + Math.random() * 0.24);
        const fx0 = Math.sin(me.yaw), fz0 = Math.cos(me.yaw), mx = me.x + fx0 * 0.32, my = me.y + 1.36, mz = me.z + fz0 * 0.32, a = 0.05 + 0.13 * exert;
        for (let q = 0; q < 3; q++) puff(1, mx + (Math.random() - 0.5) * 0.04, my - q * 0.01, mz + (Math.random() - 0.5) * 0.04, fx0 * (0.35 + q * 0.08) + (Math.random() - 0.5) * 0.08, 0.06 + Math.random() * 0.05, fz0 * (0.35 + q * 0.08) + (Math.random() - 0.5) * 0.08, 1.4 + exert * 0.5, 0.05, 0.32 + exert * 0.12, a * (1 - q * 0.2), '#d9dee6');
        plan.peak *= 1 - 0.5 * threatS; aud?.breathe(plan); breathLog.push(+now.toFixed(3)); if (breathLog.length > 30) breathLog.shift();
      }
    }
    // ---- smoke off the nearest real torches
    smokeT -= dt;
    if (smokeT <= 0) {
      smokeT = 0.22;
      for (let q = 0; q < 2; q++) { const tt = near2[q]; if (!tt || tt.color !== '#ffb060' || nearD[q] > 144) continue; puff(2, tt.x, tt.y + 0.12, tt.z, (Math.random() - 0.5) * 0.05, 0.22 + Math.random() * 0.1, (Math.random() - 0.5) * 0.05, 2.4, 0.05, 0.3, 0.2, '#2e2620'); }
    }
    for (let q = 0; q < NP; q++) {
      const p = P[q];
      if (!p.on) { pA[q] = 0; continue; }
      p.t += dt; if (p.t >= p.life) { p.on = false; pA[q] = 0; continue; }
      const u = p.t / p.life;
      if (p.kind === 2) { p.vx += (vnoise(t * 0.9 + q, seed + q) - 0.5) * dt * 0.6; p.vz += (vnoise(t * 0.8 + q * 3, seed + q) - 0.5) * dt * 0.6; }
      p.vx *= 1 - dt * 0.8; p.vz *= 1 - dt * 0.8; p.vy *= 1 - dt * (p.kind === 1 ? 0.6 : 0.1);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 2 && p.y > WALL_H - 0.18) { p.y = WALL_H - 0.18; p.vy = 0; p.vx *= 1.02; p.vz *= 1.02; }
      pPos[q * 3] = p.x; pPos[q * 3 + 1] = p.y; pPos[q * 3 + 2] = p.z;
      const lk = p.kind === 1 ? 0.35 + 0.65 * Math.min(1, lampK(p.x, p.y, p.z, lit) * 3) : 0.5 + 0.5 * (1 - u);
      pCol[q * 3] = p.r * lk; pCol[q * 3 + 1] = p.g * lk; pCol[q * 3 + 2] = p.b * lk;
      pA[q] = p.a * Math.sin(Math.PI * Math.min(1, u * 1.6 + 0.05)) * (1 - u * 0.4) * (p.kind === 1 ? Math.min(1, lit + 0.2) : 1);
      pSz[q] = p.s0 + (p.s1 - p.s0) * Math.sqrt(u);
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.aColor.needsUpdate = pGeo.attributes.aA.needsUpdate = pGeo.attributes.aSize.needsUpdate = true;

    // ---- drips and their rings
    cam.getWorldPosition(camW);
    if (phase === 'maze') { dripT -= dt; if (dripT <= 0) { dripT = 1.1 + Math.random() * 2.6; spawnDrip(); } }
    for (let q = 0; q < ND; q++) {
      const d = D[q];
      if (d.on) {
        d.vy -= 9.8 * dt; d.y += d.vy * dt;
        if (d.y <= d.floor) {
          d.on = false;
          if (d.wet) ripple(d.x, d.z, 0.8); else ring(d.x, d.floor + 0.004, d.z, 1);
          aud?.drip(d.x + origin.x, d.floor + origin.y, d.z + origin.z, true);
        }
      }
      if (!d.on) { _m.makeScale(0, 0, 0); streaks.setMatrixAt(q, _m); continue; }
      // thin (5 mm), faint, only as bright as the lantern's light round it makes it, like the motes, and faded out close to the eye
      // (thicker, near the camera it read as a solid white bar)
      const near = clamp((Math.hypot(d.x + origin.x - camW.x, d.y + origin.y - camW.y, d.z + origin.z - camW.z) - 0.45) / 1.0, 0, 1);
      const len = 0.05 + Math.min(0.18, -d.vy * 0.025), bk = Math.min(1, lampK(d.x, d.y, d.z, lit) * 1.6) * 0.32 * near;
      _m.compose(_s.set(d.x, d.y + len / 2, d.z), _q.identity(), _w.set(1, len, 1)); streaks.setMatrixAt(q, _m);
      streaks.setColorAt(q, _c.setRGB(0.75 * bk, 0.8 * bk, 0.9 * bk));
    }
    for (let q = 0; q < NR; q++) {
      const r = R[q];
      if (r.on) { r.t += dt; if (r.t > 0.7) r.on = false; }
      if (!r.on) { _m.makeScale(0, 0, 0); rings.setMatrixAt(q, _m); continue; }
      const rad = (0.03 + r.t * 0.42) * r.big, bk = (1 - r.t / 0.7) * Math.min(1, lampK(r.x, r.y, r.z, lit) * 2.4) * 0.8;
      _m.compose(_s.set(r.x, r.y, r.z), _q.identity(), _w.set(rad, 1, rad)); rings.setMatrixAt(q, _m);
      rings.setColorAt(q, _c.setRGB(0.7 * bk, 0.78 * bk, 0.9 * bk));
    }
    streaks.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = true;
    if (streaks.instanceColor) streaks.instanceColor.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;

    // ---- the composite: a very subtle vignette (darker when something is near), the cold in the near shadows, the grain
    const u = ink.uniforms;
    u.uVignette.value = VIGNETTE + 0.9 * threatS + CROUCH.vignette * (me.crouchK || 0); // crouched, the corners darken: sneaking
    if (u.uCold) u.uCold.value = 1;
    if (u.uGrain) u.uGrain.value = grainOn ? GRAIN : 0;
    if (u.uTime) u.uTime.value = t;

    // ---- what the sound needs from here
    audSt.phase = phase; audSt.lit = lit; audSt.sigil = sigil; audSt.hush = hush; audSt.threat = threatS; audSt.exert = exert;
    aud?.update(dt, now, audSt);

    lanternOut.x = lampW.x; lanternOut.y = lampW.y; lanternOut.z = lampW.z; lanternOut.intensity = lantern.intensity; lanternOut.flicker = f;
  }

  // ---- steps (the scene calls it on each footfall): a splash and a ripple in the flooded cells
  function step(wet, run, soft = false) { // soft, a crouched step: near silent, a small ripple
    if (wet) ripple(me.x, me.z, soft ? 0.5 : run ? 1.3 : 1);
    if (wet && !soft && me.speed > 2.2 && gutterCool <= 0) { gutterPeak = run ? 0.55 : 0.35; gutterT = 0; gutterCool = 0.9; } // a splash gutters the flame
    aud?.step(wet, run, soft);
  }

  function dispose() {
    mql?.removeEventListener?.('change', onMql);
    for (const ob of added) ob.parent?.remove(ob);
    for (const x of owned) x.dispose?.();
    const u = ink.uniforms; if (u.uGrain) u.uGrain.value = 0; if (u.uCold) u.uCold.value = 0; if (u.uTime) u.uTime.value = 0;
  }

  const api = {
    get threat() { return threat; }, set threat(k) { threat = clamp(Number(k) || 0, 0, 1); },
    gutter(k = 1) { gutterAsk = clamp(Number(k) || 0, 0, 1); },
    get dim() { return dim; }, set dim(k) { dim = clamp(Number(k) || 0, 0, 0.95); },
    get hush() { return hush; }, set hush(k) { hush = clamp(Number(k) || 0, 0, 1); },
    get lantern() { return lanternOut; },
    get lights() { return { lantern, spot, friends: friendLights, torches: torchLights, candle: candleLight }; },
    // tests and pictures: the wet sheen off and on again
    wet(on = true) { for (const k of Object.keys(WET)) kit.M[k].userData.mzExtra.uMzWet.value = on ? WET[k] : 0; },
    // tests (tools/w16-atmos-test.mjs)
    get state() {
      return {
        level, small, reduced, grain: ink.uniforms.uGrain?.value ?? null, cold: ink.uniforms.uCold?.value ?? null, vignette: ink.uniforms.uVignette.value,
        shadow: { map: spot.shadow.mapSize.x, radius: spot.shadow.radius, angle: spot.angle, cast: spot.castShadow },
        breath: { ...bPlan, log: breathLog.slice() }, mist: { n: MIST, shown: mist.visible }, gloom: ambK,
        flicker: flick, sway: { roll: th, pitch: ph, rx: hand.rotation.x, rz: hand.rotation.z }, bobK: reduced ? 0 : 1, flame: { shown: flame.visible, k: +flameK.toFixed(3), glass: +glassK.toFixed(3) },
        lamp: { flame: +flameF.toFixed(4), light: +flick.toFixed(4), gutter: +gut.toFixed(3), flutter: +flut.toFixed(3), lean: [+lean.x.toFixed(3), +lean.z.toFixed(3)], vel: [+lampVel.x.toFixed(2), +lampVel.z.toFixed(2)], intensity: +lantern.intensity.toFixed(3) },
        friends: [...friendFl.entries()].map(([sid, F]) => ({ sid, f: +(F.f ?? 1).toFixed(4), flutter: +F.flut.toFixed(3), lean: [+F.lean.x.toFixed(3), +F.lean.z.toFixed(3)] })),
        motes: moteGeo.drawRange.count === Infinity ? MOTES : moteGeo.drawRange.count, halos: NF, puddles: puddleSpots.length, puddleAt: puddleSpots.length ? (() => { const sr = maze.startRoom; return puddleSpots.reduce((a, b) => (Math.hypot(b.cx - sr.x0, b.cy - sr.y0) < Math.hypot(a.cx - sr.x0, a.cy - sr.y0) ? b : a)); })() : null,
        pools: { puffs: P.length, puffsOn: P.filter(p => p.on).length, drips: D.length, dripsOn: D.filter(d => d.on).length, rings: R.length, ripples: RIP.length },
        spawned: { drips: dripsSpawned, rings: ringsSpawned, puffs: puffN }, objects: added.length,
      };
    },
  };
  return { update, step, dispose, api, get bobK() { return reduced ? 0 : 1; } };
}
