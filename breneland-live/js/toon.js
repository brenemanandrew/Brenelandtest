// Cel shading: stepped toon materials plus a screen-space ink outline pass that
// finds edges from depth (silhouettes) and normals (creases).
import * as THREE from 'three';
import { PERF, updateSceneMatrices, frameHooks } from './perf-flags.js';

export const LAYER_WORLD = 0;   // outlined
export const LAYER_SOFT = 2;    // drawn in colour but never outlined (grass, particles)
// the alpha see-through glass writes into the colour target: GLASS_A + GLASS_R * its ripple (-1..1), below zero where
// nothing else writes (the half-float target keeps it); the composite counts GLASS_BAND as glass (real-glass.js)
export const GLASS_A = -1, GLASS_R = 0.2, GLASS_BAND = [GLASS_A - GLASS_R - 0.1, GLASS_A + GLASS_R + 0.1];

function makeGradient(steps) {
  const data = new Uint8Array(steps.length);
  steps.forEach((v, i) => { data[i] = Math.round(v * 255); });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
export const GRADIENT_3 = makeGradient([0.38, 0.72, 1.0]);
export const GRADIENT_4 = makeGradient([0.32, 0.58, 0.82, 1.0]);

const cache = new Map();
// toon('#7cc34f') -> shared MeshToonMaterial. Options that change the material
// (emissive, vertexColors, side, transparent) become part of the cache key.
export function toon(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: opts.steps === 4 ? GRADIENT_4 : GRADIENT_3 });
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  if (opts.vertexColors) m.vertexColors = true;
  if (opts.side === 'double') m.side = THREE.DoubleSide;
  if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity ?? 1; m.depthWrite = opts.depthWrite ?? false; }
  if (opts.flat) m.flatShading = true;
  if (opts.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
  cache.set(key, m);
  return m;
}
// A plain bright material for things that glow (lantern glass, sun-lit windows).
export function glow(color) {
  const key = 'glow|' + color;
  let m = cache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), fog: true }); cache.set(key, m); }
  return m;
}

// ----------------------------------------------------------------- fading what blocks the camera (camera-fade.js)
//
// Two ways to fade, both read by the ink pass through the colour target's alpha (edge *= base.a below), so the outline
// goes with the mesh:
//   fadeClone(mat)       a whole object (a dog, a neighbour, a car): a transparent copy whose opacity camera-fade.js sets;
//                        it still writes depth and writes its alpha into the target (blendSrcAlpha One / blendDstAlpha Zero)
//   patchFadeHole(mat)   the baked world (one mesh per material, so no per-object opacity): fragments inside the fade
//                        volume (a capsule round the camera-player line and a sphere round the camera, FADE uniforms in
//                        view space) are discarded, and a ghost copy of the mesh (fadeGhostMaterial) draws only those
//                        fragments, blended at the volume's strength and writing depth, so the ink stays continuous.
export const FADE = {
  uFadeOn: { value: 0 },
  uFadeB: { value: new THREE.Vector3(0, 0, -1) }, // the player's end of the line, view space (the camera is the origin)
  uFadeR: { value: 0.6 },                          // the capsule's radius (m)
  uFadeS: { value: 1.2 },                          // the sphere round the camera (m)
  uFadeMin: { value: 1 },                          // how far the fade goes right now: 1 nothing fades, 0.25 nearly gone
  uFadeUp: { value: new THREE.Vector3(0, 1, 0) },  // world up in view space: floors and roofs that face up never fade
  uFadeH: { value: 1.0 },                          // the capsule reaches this far up above the line too (a trunk over your head)
  uFadeFlat: { value: 0 },                         // 1: faces that look down never fade either (indoors: a ceiling over the camera stays shut)
};
const FADE_GLSL = /* glsl */`
uniform float uFadeOn, uFadeR, uFadeS, uFadeMin, uFadeH, uFadeFlat;
uniform vec3 uFadeB, uFadeUp;
// 1 untouched .. uFadeMin faded, from this fragment's view-space position p (the camera at the origin) and its normal
float fadeK(vec3 p, vec3 n) {
  float fu = dot(n, uFadeUp);
  if (uFadeOn < 0.5 || fu > 0.6 || fu < -0.6 * uFadeFlat) return 1.0;
  float t = clamp(dot(p, uFadeB) / max(dot(uFadeB, uFadeB), 1e-4), 0.0, 1.0);
  vec3 q = p - uFadeB * t;
  q -= uFadeUp * clamp(dot(q, uFadeUp), 0.0, uFadeH);
  float k = min(smoothstep(uFadeR * 0.55, uFadeR, length(q)), smoothstep(uFadeS * 0.7, uFadeS, length(p)));
  return max(uFadeMin, k);
}
`;
const fadePatched = new WeakSet();
// Chain a shader patch after whatever the material already has (weather-cover.js does the same), keeping the cache key honest.
function chainPatch(mat, tag, inject) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  const hadOwn = prev !== THREE.Material.prototype.onBeforeCompile;
  const baseKey = prevKey !== THREE.Material.prototype.customProgramCacheKey ? prevKey() : hadOwn ? prev.toString() : '';
  if (!mat.userData.fadeBase) mat.userData.fadeBase = { onBeforeCompile: prev, customProgramCacheKey: prevKey }; // (what a ghost copy starts from: never two fade patches)
  mat.onBeforeCompile = (sh, r) => { if (hadOwn) prev.call(mat, sh, r); inject(sh); };
  mat.customProgramCacheKey = () => `${baseKey}|${tag}`;
  mat.needsUpdate = true;
}
function injectFade(sh, ghost) {
  Object.assign(sh.uniforms, FADE);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FADE_GLSL)
    // (after normal_fragment_begin `normal` exists for flat and smooth shading alike; vViewPosition is minus the view position)
    .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  float fadeKv = fadeK(-vViewPosition, normal);\n' +
      (ghost ? '  if (fadeKv > 0.9995) discard;\n  diffuseColor.a *= fadeKv;' : '  if (fadeKv < 0.999) discard;'));
}
// The baked world's opaque draw: a hole where the fade volume is (idempotent).
export function patchFadeHole(mat) {
  if (!mat || fadePatched.has(mat) || !mat.isMeshToonMaterial) return mat;
  fadePatched.add(mat);
  chainPatch(mat, 'fade:hole', sh => injectFade(sh, false));
  return mat;
}
export const hasFadeHole = mat => fadePatched.has(mat);
// Blend colour by alpha but write the source alpha, so the ink pass can scale its outlines by it.
function alphaWritingBlend(m) {
  m.transparent = true;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.ZeroFactor;
}
function cloneWithHooks(mat) {
  const c = mat.clone();
  const base = mat.userData.fadeBase; // a hole-patched material: the copy starts from the hooks it had before the hole
  // (a material cloned by weather-cover's rescan keeps a fadeBase whose functions JSON dropped: then its own hooks count.
  // Without this guard a car fading out of the camera's way would set customProgramCacheKey to undefined and three would throw)
  const ok = base && typeof base.onBeforeCompile === 'function' && typeof base.customProgramCacheKey === 'function';
  const obc = ok ? base.onBeforeCompile : mat.onBeforeCompile, key = ok ? base.customProgramCacheKey : mat.customProgramCacheKey;
  if (obc !== THREE.Material.prototype.onBeforeCompile) { c.onBeforeCompile = obc; c.customProgramCacheKey = key; } // clone() drops these
  delete c.userData.fadeBase;
  if (mat.allowOverride === false) c.allowOverride = false;
  if (mat.onBeforeRender !== THREE.Material.prototype.onBeforeRender) c.onBeforeRender = mat.onBeforeRender;
  return c;
}
// The ghost that fills the hole: the same material (and its weather patch) drawing only the faded fragments.
export function fadeGhostMaterial(mat) {
  const c = cloneWithHooks(mat);
  c.name = (mat.name || 'toon') + '+ghost';
  alphaWritingBlend(c);
  c.depthWrite = true;
  chainPatch(c, 'fade:ghost', sh => injectFade(sh, true));
  return c;
}
// A whole object's copy of one of its materials, opacity to be set by the caller (1 = as the original).
export function fadeClone(mat) {
  const c = cloneWithHooks(mat);
  c.name = (mat.name || mat.type) + '+fade';
  if (!mat.transparent) { alphaWritingBlend(c); c.depthWrite = true; } // (an already translucent part keeps its own blending; only its opacity scales)
  c.userData.baseOpacity = mat.opacity;
  return c;
}

// Canvas text is drawn once while the world is built, often before the web fonts have arrived (it then falls back to
// Trebuchet). Call this with a draw function and the font strings you use: it redraws once they are loaded.
export function redrawWhenFontsLoad(draw, fonts) {
  try {
    if (!document.fonts?.load) return;
    Promise.all(fonts.map(f => document.fonts.load(f))).then(() => draw()).catch(() => {});
  } catch { /* no font API */ }
}

// Put an object (and its children) on the soft layer so it is not outlined.
export function soft(obj) {
  obj.traverse(o => { o.layers.set(LAYER_SOFT); });
  return obj;
}

// Shadows on for a subtree.
export function shadows(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

// ----------------------------------------------------------------- post pass

const compositeShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    uUseNormal: { value: 1 }, uSolid: { value: 1 },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.1 },
    uFar: { value: 2000 },
    uInk: { value: new THREE.Color('#1c1a2e') },
    uInkAmt: { value: 0.92 },
    uInkW: { value: 1.25 },  // the outline's reach in texels (a touch thicker below Angell Street)
    uDarkLift: { value: 1 },  // the night grade's cool lift in the darks (0 below Angell Street, so far off is true black)
    uSat: { value: 1 },
    uFadeNear: { value: 52 },
    uFadeFar: { value: 175 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#fff6dc') },
    uVignette: { value: 0.28 },
    uWarmth: { value: 0.06 },
    uGrain: { value: 0 },     // a faint film grain below Angell Street on High and Max; 0 everywhere else
    uCold: { value: 0 },      // a hint of cold blue in the deepest shadows near you (not far off: the ends stay black)
    uTime: { value: 0 },      // the grain's frame
    uGlass: { value: 0 },     // how far (texels) see-through glass wavers what is behind it at the ripple's peak; 0 on Fast
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tColor, tDepth, tNormal;
    uniform float uUseNormal, uSolid, uNear, uFar, uFadeNear, uFadeFar, uFlash, uVignette, uWarmth, uInkAmt, uSat, uInkW, uDarkLift, uGrain, uCold, uTime, uGlass;
    uniform vec2 uTexel;
    uniform vec3 uInk, uFlashColor;
    varying vec2 vUv;

    float linDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(z, uNear, uFar);
    }
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    float solid(vec2 uv) { return texture2D(tNormal, uv).a; } // (0 on a person: no crease lines inside them, rigid-merge.js)

    void main() {
      vec4 base = texture2D(tColor, vUv);
      // see-through glass (real-glass.js) writes GLASS_A + GLASS_R * its ripple into the alpha: what is behind it is
      // taken from a texel or two to the side (old glass), and it is inked like an opaque pixel (the room behind keeps its outlines)
      float glass = step(${GLASS_BAND[0].toFixed(3)}, base.a) * step(base.a, ${GLASS_BAND[1].toFixed(3)});
      if (glass > 0.5 && uGlass > 0.0) {
        float rip = clamp((base.a - ${GLASS_A.toFixed(3)}) / ${GLASS_R.toFixed(3)}, -1.0, 1.0);
        vec4 gs = texture2D(tColor, vUv + vec2(rip, rip * 0.35) * uGlass * uTexel);
        if (gs.a >= ${GLASS_BAND[0].toFixed(3)} && gs.a <= ${GLASS_BAND[1].toFixed(3)}) base.rgb = gs.rgb;
      }
      vec3 col = base.rgb;

      float d = linDepth(vUv);
      vec2 o = uTexel * uInkW;
      float dl = linDepth(vUv - vec2(o.x, 0.0)), dr = linDepth(vUv + vec2(o.x, 0.0));
      float du = linDepth(vUv + vec2(0.0, o.y)), dd = linDepth(vUv - vec2(0.0, o.y));

      // Silhouettes: a neighbour much farther away than this pixel.
      float farthest = max(max(dl, dr), max(du, dd));
      float depthEdge = smoothstep(0.035, 0.09, (farthest - d) / d);
      // Creases on the same surface: second derivative of depth. None on or next to a person, whose normal pass alpha is 0:
      // a person reads as one solid, inked only round its silhouette
      float lap = abs(dl + dr + du + dd - 4.0 * d) / d;
      float crease = smoothstep(0.06, 0.16, lap);
      float keep = 1.0;
      if (uUseNormal > 0.5 && uSolid > 0.5) keep = smoothstep(0.25, 0.75, min(min(solid(vUv), min(solid(vUv - vec2(o.x, 0.0)), solid(vUv + vec2(o.x, 0.0)))), min(solid(vUv + vec2(0.0, o.y)), solid(vUv - vec2(0.0, o.y)))));

      float normalEdge = 0.0;
      if (uUseNormal > 0.5) {
        vec3 n = nrm(vUv);
        float nd = 0.0;
        nd = max(nd, 1.0 - dot(n, nrm(vUv - vec2(o.x, 0.0))));
        nd = max(nd, 1.0 - dot(n, nrm(vUv + vec2(o.x, 0.0))));
        nd = max(nd, 1.0 - dot(n, nrm(vUv + vec2(0.0, o.y))));
        nd = max(nd, 1.0 - dot(n, nrm(vUv - vec2(0.0, o.y))));
        normalEdge = smoothstep(0.28, 0.5, nd);
      }

      float edge = max(depthEdge, max(crease, normalEdge) * keep);
      edge *= 1.0 - smoothstep(uFadeNear, uFadeFar, d);
      // things drawn with alpha 0 in the colour target (the campfire's flames) are never inked over: without this the
      // outlines of whatever stands behind a flame showed through it
      edge *= base.a < 0.0 ? 0.75 : clamp(base.a, 0.0, 1.0); // (through glass, or its edge, the outlines a little softer)
      vec3 inkCol = mix(uInk, col * 0.25, 0.35);
      col = mix(col, inkCol, edge * uInkAmt);

      // Morning grade: a touch of warmth in the lights, cool in the darks.
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      // night: the darks lose some colour (moonlight), the bright lamps and windows keep theirs
      col = mix(col, vec3(lum), (1.0 - uSat) * (1.0 - smoothstep(0.2, 0.55, lum)));
      col += vec3(uWarmth, uWarmth * 0.45, -uWarmth * 0.35) * smoothstep(0.25, 1.0, lum);
      col += vec3(-0.01, 0.0, 0.025) * (1.0 - smoothstep(0.0, 0.3, lum)) * uDarkLift;
      if (uCold > 0.0) col += vec3(0.0, 0.006, 0.02) * uCold * (1.0 - smoothstep(0.0, 0.06, lum)) * (1.0 - smoothstep(1.5, 6.0, d)) * smoothstep(0.3, 0.9, d);
      if (uGrain > 0.0) col += (fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.13) * 97.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain * (0.4 + lum);

      vec2 c = vUv - 0.5;
      col *= 1.0 - uVignette * dot(c, c) * 1.6;

      col = mix(col, uFlashColor * 2.2, uFlash);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

// Opaque draw order: three's own (render order, material, then instanced/skinned, then near to far) with the instanced
// and skinned objects grouped before the material. In the normal pass every object wears the one override material,
// so three's order switched its program between instanced and plain meshes dozens of times a pass (each switch looks the
// program up again: getParameters, a cache key string). Opaque, depth-tested draws look the same in any order.
function opaqueSort(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.z !== b.z) return a.z - b.z;
  return a.id - b.id;
}

export class InkPass {
  constructor(renderer, { quality = 'high' } = {}) {
    this.renderer = renderer;
    renderer.setOpaqueSort(opaqueSort);
    this.quality = quality;
    this.normalMat = new THREE.MeshNormalMaterial();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms),
      vertexShader: compositeShader.vertexShader,
      fragmentShader: compositeShader.fragmentShader,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.colorRT = null;
    this.normalRT = null;
    this.clip = 1; // (0..1: only the top part of the picture is drawn, the rest sits under a solid panel: dnd.js fitView)
  }

  get uniforms() { return this.material.uniforms; }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    this.colorRT?.dispose(); this.normalRT?.dispose();
    const depthTexture = new THREE.DepthTexture(W, H);
    depthTexture.type = THREE.UnsignedIntType;
    this.colorRT = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType, samples: this.samples ?? (this.quality === 'low' ? 0 : 4), depthTexture, // (main.js sets samples per device class: gfx.js)
    });
    this.normalRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType });
    this.uniforms.tColor.value = this.colorRT.texture;
    this.uniforms.tDepth.value = depthTexture;
    this.uniforms.tNormal.value = this.normalRT.texture;
    this.uniforms.uTexel.value.set(1 / W, 1 / H);
  }

  setQuality(q) {
    this.quality = q;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
  }

  // beforePasses(scene, camera) / afterPasses(scene, camera): optional hooks round the passes (main.js draws every shadow
  // map in beforePasses: shadows.js). The world matrices and the scene's onBeforeRender hooks (bocce, the swing) run once a
  // frame here, in three's order (matrices, then the hook), not again in every pass.
  render(scene, camera) {
    const r = this.renderer;
    if (scene.matrixWorldAutoUpdate) updateSceneMatrices(scene); // (visible branches only: perf-flags.js)
    for (let i = 0; i < frameHooks.length; i++) frameHooks[i](); // (prop-merge.js: merged props checked before anything draws)
    if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    scene.onBeforeRender(r, scene, camera, null);
    const auto = scene.matrixWorldAutoUpdate, hook = scene.onBeforeRender;
    scene.matrixWorldAutoUpdate = false; scene.onBeforeRender = NOOP;
    try { this.passes(scene, camera); } finally { scene.matrixWorldAutoUpdate = auto; scene.onBeforeRender = hook; }
  }

  passes(scene, camera) {
    const r = this.renderer;
    const u = this.uniforms;
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uSolid.value = PERF.solidInk ? 1 : 0;
    u.uGlass.value = this.quality === 'low' ? 0 : GLASS_WAVER * r.getPixelRatio(); // (Fast leaves the old glass's waver out)
    this.beforePasses?.(scene, camera);
    const clip = this.clip < 1 ? Math.max(0.05, this.clip) : 1;
    for (const rt of [this.colorRT, this.normalRT]) { rt.scissorTest = clip < 1; if (clip < 1) rt.scissor.set(0, Math.floor(rt.height * (1 - clip)), rt.width, Math.ceil(rt.height * clip)); }

    // 1. colour + depth (world and soft layers), shadows computed once here (when beforePasses did not draw them)
    camera.layers.enable(LAYER_WORLD); camera.layers.enable(LAYER_SOFT);
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.colorRT);
    r.clear();
    r.render(scene, camera);

    // 2. view-space normals for crease lines (world layer only)
    const useNormal = this.quality !== 'low'; // High and Max
    u.uUseNormal.value = useNormal ? 1 : 0;
    if (useNormal) {
      camera.layers.disable(LAYER_SOFT);
      // (the fog stays: the override material has none, and the crowns and merged characters that draw themselves here write
      // their normal after it. Taking it away would switch their programs twice a frame: perf-flags.js)
      const bg = scene.background, fog = scene.fog;
      scene.background = null; if (!PERF.fogInNormals) scene.fog = null;
      scene.overrideMaterial = this.normalMat;
      r.getClearColor(this._clear || (this._clear = new THREE.Color()));
      const alpha = r.getClearAlpha();
      r.setRenderTarget(this.normalRT);
      r.setClearColor(0x8080ff, 1);
      r.clear();
      r.render(scene, camera);
      r.setClearColor(this._clear, alpha);
      scene.overrideMaterial = null;
      scene.background = bg; scene.fog = fog;
      camera.layers.enable(LAYER_SOFT);
    }

    this.afterPasses?.(scene, camera);
    // 3. composite to screen
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
const NOOP = () => {};
const GLASS_WAVER = 1.8; // CSS pixels at the ripple's peak
