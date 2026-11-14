// What the weather leaves on the world: snow that settles on roofs, the ground, fences and tree tops while it snows and
// melts after; a wet look (darker, with a sheen and puddles) on roads, sidewalks and plazas after rain; rain rings in
// the Arkham corner's puddles; and the woods' canopies swaying in the wind.
//
// All of it is a shader patch on materials the world already has (no new meshes, no per-frame JS beyond a handful of
// uniforms), driven by shared uniforms that weather.js sets every frame from the shared forecast (weather-data.js
// groundAt), so every visitor sees the same snow on the same roofs.
//   Fast:  canopy sway and the Arkham puddles' rings only (the cover code is compiled out)
//   High:  snow cover (with a 1024 top-down "what is over me" map, so the porch floor and the ground under trees stay
//          clear), wet darkening, sheen and puddles
//   Max:   a 2048 map, rain rings in every puddle, lamp light mirrored in wet ground at night
//
// patchCover(material, kind) adds the patch: 'ground' (default), 'canopy' (the woods), 'puddle' (always wet),
// 'grass' (tufts sink into the snow). The baked world gets patched copies of its materials (patchWorldMaterials).
// Nothing in a room (indoor-rooms.js: the house, the porch, the game store, the Lovecraft house) takes snow or gets wet, even
// in the Arkham storm (the shelter map alone keeps the snow off a floor, not the wet, and only while the roof was drawn in it).
import * as THREE from 'three';
import { toon } from './toon.js';
import { GFX } from './gfx.js';
import { MAP } from './layout.js';
import { roomUniforms, roomsGlsl } from './indoor-rooms.js';

export const SNOW_LAYER = 5; // meshes that can shelter what is under them (the top-down map renders only these)

// Shared uniforms: every patched material points at these same objects.
export const COVER = {
  uWxSnow: { value: 0 },       // snow cover 0..1
  uWxWet: { value: 0 },        // wetness 0..1
  uWxRain: { value: 0 },       // rain falling right now 0..1 (rings in puddles)
  uWxTime: { value: 0 },
  uWxStorm: { value: new THREE.Vector4(0, 0, 1, 0) },   // the Arkham corner: x, z, radius, k (always wet, never snowy)
  uWxStormIn: { value: 0 },     // ...and where its rim starts (m from its middle: fully wet inside this, fading out to radius + 2)
  uWxSway: { value: new THREE.Vector4(1, 0, 0.1, 0) },  // wind direction xz, sway amplitude (m at a tree top), gust
  uWxNormalPass: { value: 0 },  // the ink pass's normal render: the canopies write normals themselves (see canopyMaterial)
  uWxSnowMap: { value: null },
  uWxSnowRect: { value: new THREE.Vector4(0, 0, 1, 1) }, // x0, z0, width, depth of the map (depth is negative: see buildMap)
  uWxSnowDepth: { value: new THREE.Vector3(0, 0, 1) },   // map on, camera top, depth span
  uWxSheen: { value: new THREE.Color('#9fb0c0') },       // what wet ground mirrors: the sky near the horizon
  uWxGlintDir: { value: new THREE.Vector3(0, 1, 0) },
  uWxGlintCol: { value: new THREE.Color(0) },
  uWxLamps: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, // x, y, z, on (Max, at night)
  uWxLampCol: { value: new THREE.Color('#ffd98e') },
  uWxSnowGlow: { value: new THREE.Color(0.3, 0.31, 0.34) }, // snow lights up a dull day (and glows a little blue at night)
  ...roomUniforms('uWxRoomA', 'uWxRoomB'), // the rooms (indoor-rooms.js): dry inside
};

let level = 1; // 0 Fast, 1 High, 2 Max
const levelOf = q => (q === 'low' ? 0 : q === 'max' ? 2 : 1);
const patched = new Set();

// ------------------------------------------------------------------ GLSL

const COMMON = /* glsl */`
uniform float uWxSnow, uWxWet, uWxRain, uWxTime, uWxNormalPass, uWxStormIn;
uniform vec4 uWxStorm, uWxSway, uWxSnowRect;
uniform vec3 uWxSnowDepth;
uniform sampler2D uWxSnowMap;
varying vec3 vWxPos;
varying float vWxUp;
float wxH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wxN(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxH(i), wxH(i + vec2(1.0, 0.0)), f.x), mix(wxH(i + vec2(0.0, 1.0)), wxH(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 1 inside the Arkham corner's storm (it fades over its rim)
float wxStormK(vec2 p) { return uWxStorm.w * (1.0 - smoothstep(uWxStormIn, uWxStorm.z + 2.0, distance(p, uWxStorm.xy))); }
// 1 with open sky over this point, 0 under a roof or a canopy (the top-down map: the highest static surface there)
float wxOpen(vec3 p, float tol) {
  if (uWxSnowDepth.x < 0.5) return 1.0;
  vec2 uv = (p.xz - uWxSnowRect.xy) / uWxSnowRect.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
  float top = uWxSnowDepth.y - texture2D(uWxSnowMap, uv).x * uWxSnowDepth.z;
  return 1.0 - step(tol, top - p.y);
}
${roomsGlsl('wxIndoor', 'uWxRoomA', 'uWxRoomB')}
`;

const FRAG_COMMON = /* glsl */`
uniform vec3 uWxSheen, uWxGlintDir, uWxGlintCol, uWxLampCol, uWxSnowGlow;
uniform vec4 uWxLamps[3];
// rain rings: a ring expands and fades in a jittered cell; drops land at random moments, more of them in harder rain
float wxRings(vec2 p, float t, float density) {
  p *= 1.8;
  vec2 c = floor(p);
  float r = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cell = c + vec2(float(i), float(j));
    float h = wxH(cell);
    float age = fract(t * (0.75 + h * 0.5) + h * 7.0);
    float alive = step(wxH(cell + floor(t * (0.75 + h * 0.5) + h * 7.0) * 1.37), density); // a new coin per drop
    vec2 ctr = cell + 0.25 + 0.5 * vec2(h, wxH(cell + 3.1));
    float d = length(p - ctr), rad = 0.08 + age * 0.62;
    r = max(r, (1.0 - smoothstep(0.0, 0.07, abs(d - rad))) * (1.0 - age) * alive);
  }
  return r;
}
`;

// After the vertex colours are in: the snow and the wet darkening go into the surface colour, so the toon light shades them.
const FRAG_SURFACE = /* glsl */`
  float wxS = 0.0, wxW = 0.0, wxHard = 0.0, wxPud = 0.0, wxRainHere = 0.0;
  {
    float stK = wxStormK(vWxPos.xz);
    float up = vWxUp;
    vec3 dc = diffuseColor.rgb;
    float mx = max(dc.r, max(dc.g, dc.b)), mn = min(dc.r, min(dc.g, dc.b));
    wxHard = 1.0 - smoothstep(0.06, 0.2, mx - mn);              // grey: tar, concrete, stone, slate
    float lum = dot(dc, vec3(0.299, 0.587, 0.114));
#ifdef WX_PUDDLE
    wxW = 1.0; wxPud = 1.0; wxHard = 1.0; up = 1.0;
    wxRainHere = max(uWxRain, stK * 0.85);
#else
    float open = 1.0, dry = 0.0;
    if ((uWxSnow > 0.002 && up > 0.3) || uWxWet > 0.002 || stK > 0.002) dry = wxIndoor(vWxPos); // (in a room: no snow, no wet)
    if (uWxSnow > 0.002 && up > 0.3) {
      open = wxOpen(vWxPos, 0.35) * (1.0 - dry);
      float flatK = smoothstep(0.35, 0.8, up);
      float darkHard = wxHard * (1.0 - smoothstep(0.05, 0.25, lum));           // tar: it shows through, as grey slush
      float cov = uWxSnow * (1.0 - stK) * mix(1.0, 0.55, darkHard);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.38, 0.42), darkHard * min(1.0, uWxSnow * 1.5) * 0.6 * open);
      float n = wxN(vWxPos.xz * 0.9) * 0.62 + wxN(vWxPos.xz * 3.3 + 7.0) * 0.38;
      wxS = smoothstep(n * 0.9 - 0.025, n * 0.9 + 0.025, cov * 1.12 * flatK - (1.0 - flatK) * 0.25) * open;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 1.0), wxS);
      totalEmissiveRadiance += uWxSnowGlow * wxS;
    }
    float wet = max(uWxWet, stK) * (1.0 - wxS) * (1.0 - dry);
    if (wet > 0.002) {
      wxW = wet * smoothstep(0.45, 0.85, up);
      float pn = wxN(vWxPos.xz * 0.42 + 17.0) * 0.7 + wxN(vWxPos.xz * 1.7 - 3.0) * 0.3;
      float th = 1.0 - 0.3 * wet;
      wxPud = wxHard * smoothstep(0.96, 0.995, up) * smoothstep(th, th + 0.02, pn);
      wxRainHere = max(uWxRain, stK * 0.85);
    }
#endif
    diffuseColor.rgb *= 1.0 - wxW * (0.16 + 0.14 * wxHard) - wxPud * 0.28;   // wet things are darker, puddles darker still
  }
`;

// After the light: the sheen. Wet hard ground mirrors the sky at a glancing angle; puddles mirror it more, catch the
// sun or the moon, the lamps at night (Max), and show rain rings.
const FRAG_SHEEN = /* glsl */`
  if (wxW > 0.002) {
    vec3 V = normalize(cameraPosition - vWxPos);
    float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
    fres = fres > 0.55 ? 0.85 : fres > 0.22 ? 0.45 : fres * 0.6;            // two cel bands
    float shine = wxW * (0.15 + 0.85 * wxHard);
    float k = clamp(fres * shine * 0.55 + wxPud * wxW * (0.12 + 0.45 * fres), 0.0, 0.8); // puddles: dark at your feet, sky far off
    outgoingLight = mix(outgoingLight, uWxSheen, k);
    vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
    float g = dot(R, uWxGlintDir);
    outgoingLight += uWxGlintCol * (step(0.995 - wxPud * 0.02, g) * (0.4 + 0.6 * wxPud) + step(0.93, g) * 0.12 * wxPud) * shine;
#if WX_LEVEL >= 2
    if (wxPud > 0.01) {
      for (int i = 0; i < 3; i++) {
        if (uWxLamps[i].w <= 0.0) continue;
        vec3 L = uWxLamps[i].xyz; L.y = 2.0 * vWxPos.y - L.y;                 // the lamp mirrored in the water
        vec3 a = vWxPos - cameraPosition, b = L - cameraPosition;
        float la = length(a.xz), lb = length(b.xz);
        float side = 1.0 - dot(a.xz / la, b.xz / lb);                          // left-right: tight
        float down = abs(a.y / la - b.y / lb);                                 // up-down: a long streak
        float s = (1.0 - smoothstep(0.0, 0.0012, side)) * (1.0 - smoothstep(0.0, 0.5, down)) * step(la, lb);
        outgoingLight += uWxLampCol * s * uWxLamps[i].w * wxPud * 1.2;
      }
    }
#endif
#if WX_LEVEL >= 2
    bool wxRingOn = wxPud > 0.01;
#else
  #ifdef WX_PUDDLE
    bool wxRingOn = true;
  #else
    bool wxRingOn = false;
  #endif
#endif
    if (wxRingOn && wxRainHere > 0.02) outgoingLight = mix(outgoingLight, uWxSheen * 1.35 + 0.08, wxRings(vWxPos.xz, uWxTime, 0.12 + wxRainHere * 0.38) * 0.5 * wxPud);
  }
`;

const VERT_WORLD = /* glsl */`
  {
    vec4 wxp = vec4(transformed, 1.0); vec3 wxn = objectNormal;
#ifdef USE_INSTANCING
    wxp = instanceMatrix * wxp; wxn = mat3(instanceMatrix) * wxn;
#endif
    wxp = modelMatrix * wxp; wxn = mat3(modelMatrix) * wxn;
    vWxPos = wxp.xyz; vWxUp = normalize(wxn).y;
  }
`;

// The woods sway: a world-space offset after the instance transform that grows with the height in the tree's own frame
// (the trunk top hardly moves, so it stays inside the crown). Two sines with a per-tree phase; the wind leans it.
const VERT_SWAY = /* glsl */`
  vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  {
    vec3 ib = instanceMatrix[3].xyz;
    float hk = clamp((transformed.y - 1.5) / 6.0, 0.0, 1.2); hk *= hk;
    float ph = ib.x * 0.13 + ib.z * 0.09;
    float sw = sin(uWxTime * (0.9 + uWxSway.w * 0.5) + ph) * 0.6 + sin(uWxTime * 2.1 + ph * 1.7) * 0.25;
    float amp = uWxSway.z * hk * length(instanceMatrix[1].xyz);
    vec2 d = uWxSway.xy;
    mvPosition.xz += d * amp * (0.45 + sw) + vec2(-d.y, d.x) * amp * 0.3 * sin(uWxTime * 1.6 + ph * 2.3);
  }
#endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

function inject(sh, kind) {
  for (const k in COVER) sh.uniforms[k] = COVER[k];
  const defs = `#define WX_LEVEL ${level}\n` + (kind === 'puddle' ? '#define WX_PUDDLE\n' : '');
  let vs = defs + sh.vertexShader.replace('#include <common>', '#include <common>\n' + COMMON);
  let fs = defs + sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON + FRAG_COMMON);
  if (kind === 'grass') {
    // the tufts sink into the snow and pale with it (only where the sky is open over them)
    vs = vs.replace('#include <project_vertex>', `{
        #ifdef USE_INSTANCING
          vec3 wxIp = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        #else
          vec3 wxIp = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float wxSk = 0.0;
        #if WX_LEVEL > 0
          if (uWxSnow > 0.002) wxSk = clamp(uWxSnow * 1.15, 0.0, 1.0) * wxOpen(wxIp + vec3(0.0, 0.2, 0.0), 0.35) * (1.0 - wxStormK(wxIp.xz)) * (1.0 - wxIndoor(wxIp));
        #endif
        transformed.y *= 1.0 - 0.8 * wxSk;
        vWxUp = wxSk; vWxPos = wxIp;
      }
      #include <project_vertex>`);
    fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.96), vWxUp * 0.7);');
  } else {
    if (kind === 'canopy') vs = vs.replace('#include <project_vertex>', VERT_SWAY);
    vs = vs.replace('#include <worldpos_vertex>', VERT_WORLD + '#include <worldpos_vertex>');
    if (level > 0 || kind === 'puddle') {
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_SURFACE)
        .replace('#include <opaque_fragment>', FRAG_SHEEN + '#include <opaque_fragment>');
    }
    if (kind === 'canopy') fs = fs.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  if (uWxNormalPass > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);');
  }
  sh.vertexShader = vs; sh.fragmentShader = fs;
}

export function patchCover(mat, kind = 'ground') {
  if (!mat || patched.has(mat) || !mat.isMeshToonMaterial) return mat;
  patched.add(mat);
  const prev = mat.onBeforeCompile;
  const hadOwn = prev !== THREE.Material.prototype.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey() : hadOwn ? prev.toString() : '';
  mat.onBeforeCompile = (sh, r) => { if (hadOwn) prev.call(mat, sh, r); inject(sh, kind); };
  mat.customProgramCacheKey = () => `${baseKey}|wx:${kind}:${level}`;
  mat.needsUpdate = true;
  return mat;
}

// The woods' canopies: one material for every instanced crown. It sways (above), takes snow, and is never overridden
// by the ink pass's normal material (that one would not sway: the outlines would lag behind the leaves), so in the
// normal pass it writes the view normal itself.
let canopy = null;
export function canopyMaterial() {
  if (canopy) return canopy;
  canopy = toon('#ffffff', { vertexColors: true }).clone();
  canopy.name = 'forest-canopy';
  canopy.allowOverride = false;
  canopy.onBeforeRender = (renderer, scene) => { COVER.uWxNormalPass.value = scene.overrideMaterial ? 1 : 0; };
  patchCover(canopy, 'canopy');
  return canopy;
}

// Their shadow sways with them (a static shadow on a moving crown streaks it with self-shadow bands) and lets the sun through in
// places: gaps in the leaves, so the ground under the woods is dappled with sunflecks instead of one flat shade. The gaps are a
// noise pattern on the plane square to the light (the shadow camera's own right and up, taken from its view matrix: no uniforms),
// so every crown along a sunbeam has its gap in the same place and the light reaches the ground. Tied to the world and to each
// crown's unswayed shape, so the flecks sway with the leaves and never slide as the shadow box follows you. LEAF_GAP is how much
// of the canopy is open (a dense October canopy, thinning).
export const LEAF_GAP = { value: 0.3 };
let canopyDepth = null;
export function canopyDepthMaterial() {
  if (canopyDepth) return canopyDepth;
  canopyDepth = new THREE.MeshDepthMaterial();
  canopyDepth.onBeforeCompile = sh => {
    sh.uniforms.uWxTime = COVER.uWxTime; sh.uniforms.uWxSway = COVER.uWxSway; sh.uniforms.uLeafGap = LEAF_GAP;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uWxTime;
uniform vec4 uWxSway;
varying vec2 vLeaf;`)
      .replace('#include <project_vertex>', `{
#ifdef USE_INSTANCING
    vec3 lw = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
    vec3 lw = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
    vLeaf = vec2(dot(lw, vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0])), dot(lw, vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1])));
  }
` + VERT_SWAY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uLeafGap;
varying vec2 vLeaf;
float leafH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float leafN(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(leafH(i), leafH(i + vec2(1.0, 0.0)), f.x), mix(leafH(i + vec2(0.0, 1.0)), leafH(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  {
    float g = leafN(vLeaf * 0.55) * 0.6 + leafN(vLeaf * 1.7 + 31.0) * 0.4; // blobs of a metre or two, ragged at the edge
    if (g < uLeafGap * 0.62 + 0.19) discard;
  }`);
  };
  canopyDepth.customProgramCacheKey = () => 'wx-canopy-depth-gaps';
  return canopyDepth;
}

// ------------------------------------------------------------------ the controller

// The baked world (every Batcher mesh: houses, roads, fences, plazas, the yard, the town, the mountains, and the
// vehicles, which wear snow on their roofs too) moves onto patched copies of its materials. The cached toon materials
// themselves stay as they were: people and dogs share them (bodies-geo.js, dogs.js use the same vertex-colour toon),
// and nobody wants a snowy scalp. The terrain and the trails have materials of their own and are patched in place.
const copies = new Map(); // cached material -> its patched copy
function patchWorldMaterials(scene, puddle) {
  patchCover(toon('#ffffff', { vertexColors: true, steps: 4 }), 'ground'); // the terrain
  patchCover(toon('#d2aa70', { polygonOffset: true, steps: 4, vertexColors: true }), 'ground'); // the trails
  let n = 0;
  scene.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.matrixAutoUpdate !== false) return; // Batcher output only
    const m = o.material;
    if (!m || Array.isArray(m) || !m.isMeshToonMaterial || m.transparent || patched.has(m)) return;
    let c = copies.get(m);
    if (!c) {
      c = m.clone();
      if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; } // clone() drops these
      c.name = (m.name || 'toon') + '+wx';
      patchCover(c, m === puddle ? 'puddle' : 'ground');
      copies.set(m, c);
    }
    o.material = c; n++;
  });
  return { meshes: n, materials: copies.size };
}

export function createCover({ scene, renderer, world, storm, quality = 'high' }) {
  level = levelOf(quality);
  COVER.uWxStorm.value.set(storm.x, storm.z, storm.r, 1);
  COVER.uWxStormIn.value = storm.r - storm.edge;
  // the Arkham corner's puddles (areas.js): picked out by their cached material, no need to reach into the area's batch
  const puddle = toon('#2b2f3d', { polygonOffset: true });
  let mats = null, rescanAt = 0;
  function patchWorld() {
    mats = patchWorldMaterials(scene, puddle);
    const grass = world.root.getObjectByName('grass');
    if (grass) patchCover(grass.material, 'grass');
  }

  // ---- the top-down map: the highest static surface over every point of the map, rendered once when it first snows
  let map = null, mapCam = null, mapSize = 0, built = false;
  const R = { x0: MAP.minX - 12, x1: MAP.maxX + 12, z0: MAP.minZ - 12, z1: MAP.maxZ + 12 }; // MAP plus a margin (layout.js MAP)
  const TOP = 70, NEAR = 1, FAR = 100;
  const blank = new THREE.MeshBasicMaterial({ colorWrite: false });
  function markShelters() {
    const v = new THREE.Vector3();
    scene.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !(o.layers.mask & 1)) return;     // world layer only (no particles, no sky)
      const m = o.material;
      if (!m || Array.isArray(m) || m.transparent || m.isShaderMaterial) return;
      const forest = o.isInstancedMesh && /^forest-/.test(o.name);
      let baked = false;
      if (!o.isInstancedMesh && o.matrixAutoUpdate === false) { v.setFromMatrixPosition(o.matrixWorld); baked = v.lengthSq() < 1e-6; }
      let terrain = false;
      for (let p = o.parent; p; p = p.parent) if (p.name === 'terrain') { terrain = true; break; }
      if (forest || baked || terrain) o.layers.enable(SNOW_LAYER);
    });
  }
  function buildMap() {
    const size = GFX.s.shelter; // (2048 at Max on a computer, 1024 otherwise: gfx.js)
    if (!map || size !== mapSize) {
      map?.dispose();
      const dt = new THREE.DepthTexture(size, size);
      dt.type = THREE.UnsignedIntType;
      map = new THREE.WebGLRenderTarget(size, size, { depthTexture: dt, type: THREE.UnsignedByteType });
      mapSize = size;
    }
    if (!mapCam) {
      mapCam = new THREE.OrthographicCamera(R.x0 - (R.x0 + R.x1) / 2, R.x1 - (R.x0 + R.x1) / 2, (R.z1 - R.z0) / 2, -(R.z1 - R.z0) / 2, NEAR, FAR);
      mapCam.position.set((R.x0 + R.x1) / 2, TOP, (R.z0 + R.z1) / 2);
      mapCam.up.set(0, 0, -1); // screen up = north: u runs with +x, v with -z
      mapCam.lookAt((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
      mapCam.updateMatrixWorld(); mapCam.layers.set(SNOW_LAYER);
      markShelters();
    }
    COVER.uWxSnowMap.value = null; COVER.uWxSnowDepth.value.x = 0; // never sample the map while drawing into it
    const prevT = renderer.getRenderTarget(), prevO = scene.overrideMaterial, fog = scene.fog;
    scene.overrideMaterial = blank; scene.fog = null;
    renderer.setRenderTarget(map); renderer.clear(); renderer.render(scene, mapCam);
    renderer.setRenderTarget(prevT); scene.overrideMaterial = prevO; scene.fog = fog;
    COVER.uWxSnowMap.value = map.depthTexture;
    COVER.uWxSnowRect.value.set(R.x0, R.z1, R.x1 - R.x0, -(R.z1 - R.z0));
    COVER.uWxSnowDepth.value.set(1, TOP - NEAR, FAR - NEAR);
    built = true;
  }

  const tmp = new THREE.Color();
  return {
    COVER,
    get level() { return level; },
    buildMap, patchWorld,
    get map() { return map; },
    setQuality(q) {
      const l = levelOf(q);
      if (l === level) { if (built && level > 0 && mapSize !== GFX.s.shelter) buildMap(); return; }
      level = l;
      for (const m of patched) m.needsUpdate = true;
      if (built && level > 0) buildMap();
    },
    // ground: { snow, wet, rain }; S: weather.js's frame state (windVec, lamps, night, t); W: WEATHER
    update(dt, ground, W, S) {
      if (!mats || S.t > rescanAt) { rescanAt = S.t + 10; patchWorld(); } // and again now and then: things built later
      COVER.uWxTime.value = S.t % 3600;
      COVER.uWxSnow.value = level > 0 ? ground.snow : 0;
      COVER.uWxWet.value = level > 0 ? ground.wet : 0;
      COVER.uWxRain.value = W.rain;
      if (level > 0 && ground.snow > 0.002 && !built) buildMap();
      // the canopies lean with the wind (a breeze even on a still day; the Arkham corner's storm shakes the trees near it)
      const wv = S.windVec, wl = Math.hypot(wv.x, wv.z) || 1;
      COVER.uWxSway.value.set(wv.x / wl, wv.z / wl, 0.07 + W.wind * 0.45 + W.gust * 0.25, W.gust);
      // what wet ground mirrors: the fog colour (the sky at the horizon) leaning toward the sky light
      COVER.uWxSheen.value.copy(scene.fog.color).lerp(tmp.copy(world.hemi.color).multiplyScalar(0.7), 0.35);
      COVER.uWxGlintDir.value.copy(world.sun.position).sub(world.sun.target.position).normalize();
      COVER.uWxGlintCol.value.copy(world.sun.color).multiplyScalar(Math.min(1.2, world.sun.intensity / 2.2));
      const L = COVER.uWxLamps.value;
      for (let i = 0; i < 3; i++) { const l = S.lamps[i]; if (l && level >= 2) L[i].set(l.x, l.y, l.z, Math.min(1, S.night * 1.5)); else L[i].w = 0; }
      if (S.lamps[0]) COVER.uWxLampCol.value.set(S.lamps[0].color || '#ffd98e');
      COVER.uWxSnowGlow.value.setRGB(0.3 - 0.22 * S.night, 0.31 - 0.2 * S.night, 0.34 - 0.16 * S.night);
    },
  };
}
