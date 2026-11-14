// Real windows: where a house has a real room behind a window (our house and the Lovecraft house), its pane is see-through
// glass with a little old-glass waver, so you see the actual room from outside and the actual yard from inside.
//
// How the glass works (no extra render pass):
//   realGlass(base, U)  a copy of the pane's material (MeshToonMaterial or MeshBasicMaterial, so far off it's exactly the plain
//     pane) patched at the end of its fragment shader. U.uSee (0..1) blends the opaque pane into see-through glass. The colour it
//     adds is a soft reflection (its own colour, stronger at a glancing angle: by day the sky's blue, at night a lit room's warm
//     glow), and it lets 70% of what's behind through at uSee 1 (blending One, OneMinusConstantAlpha: the controller sets the
//     material's blendAlpha to 1 - 0.7 uSee). The alpha it writes into the colour target (One, Zero: its own) is GLASS_A +
//     GLASS_R * ripple, a negative number nothing else writes (opaque things 1, flames 0, camera-fade's copies their opacity):
//     the ripple of old glass, a few slow waves along the pane (world space, so they stay on the pane), stronger at a glancing
//     angle, gone far off.
//   The ink pass's composite (toon.js) reads that alpha: a pixel in the glass band is sampled again a pixel or two to the side
//     by the ripple, and inked as an opaque pixel (the room keeps its outlines). Fast leaves the waver out (uGlass 0).
//   While see-through (uSee from SOFT_AT) the pane draws on the soft layer and writes no depth (the room behind keeps its own
//   depth and normals for the outlines). Below that (far off, or fading) it's on the world layer and writes depth and alpha 1.
//
// createGlassView(opts) is the per-house controller: when the camera is near enough to look in (SHOW m from the house's box,
// hidden past HIDE), the house's inside is drawn and the glass fades to see-through by distance. Far off it fades back to the
// pane before the inside is hidden, so nothing pops and the town's cost doesn't grow.
import * as THREE from 'three';
import { LAYER_WORLD, LAYER_SOFT, GLASS_A, GLASS_R } from './toon.js';
import { GFX } from './gfx.js';
import { LIGHT } from './daynight-mats.js';

// (GLASS_A and GLASS_R, the alpha see-through glass writes and its ripple's swing, live in toon.js)
export const GLASS_VIEW = { SHOW: 16, HIDE: 19, CLEAR: 14.5, OPAQUE: 18.5, RATE: 3 }; // metres from the house's box; RATE = uSee a second
// a phone or a tablet looks in from a little closer (the Lovecraft house's folk at its table are most of what looking in costs there)
export const GLASS_VIEW_PHONE = { SHOW: 12, HIDE: 14.5, CLEAR: 10.5, OPAQUE: 14, RATE: 3 };
export const SOFT_AT = 0.2, GLASS_T = 0.7; // uSee from which a pane is see-through for the ink; what it lets through at uSee 1

export function glassUniforms() {
  return { uSee: { value: 0 }, uInside: { value: 0 }, uNight: { value: 0 }, uRgR: { value: GLASS_R } };
}

const VERT_HEAD = 'varying vec3 vRgW;\nvarying vec3 vRgN;\n';
const VERT_BODY = '\n  vRgW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRgN = normalize(mat3(modelMatrix) * normal);';
const FRAG_HEAD = `varying vec3 vRgW;
varying vec3 vRgN;
uniform float uSee, uInside, uNight, uRgR;
`;
const FRAG_BODY = `
  {
    vec3 rgV = cameraPosition - vRgW;
    float rgD = length(rgV);
    vec3 rgN = normalize(vRgN);
    float rgFr = pow(1.0 - abs(dot(rgV / max(rgD, 1e-4), rgN)), 3.0);   // 0 head-on, 1 at a glancing angle
    // old glass: slow uneven waves along the pane (h across it, y up), a little stronger at a glancing angle, gone far off
    vec2 rgT = normalize(vec2(-rgN.z, rgN.x) + 1e-5);
    float rgH = dot(vRgW.xz, rgT), rgY = vRgW.y;
    float rgRip = sin(rgH * 19.0 + sin(rgY * 5.3 + rgH * 2.1) * 1.8) * 0.62 + sin(rgH * 43.0 - rgY * 8.0 + 1.3) * 0.38;
    rgRip = clamp(rgRip * (0.65 + 1.3 * rgFr) * (1.0 - smoothstep(9.0, 20.0, rgD)), -1.0, 1.0);
    vec3 rgC = gl_FragColor.rgb;                                          // today's pane (lit, fogged): the far look
    // from outside: its own colour as a reflection (the sky's blue by day, stronger at a glancing angle) and at night a lit room's
    // soft glow; from inside: a faint cool sheen of the room (more at a glancing angle)
    vec3 rgOut = rgC * mix(mix(0.1, 0.22, uNight), 0.75, rgFr);
    vec3 rgIn = mix(vec3(0.07, 0.09, 0.11), vec3(0.025, 0.03, 0.045), uNight) * (1.0 + 2.0 * rgFr);
    gl_FragColor = vec4(mix(rgC, mix(rgOut, rgIn, uInside), uSee), uSee < ${SOFT_AT.toFixed(2)} ? 1.0 : ${GLASS_A.toFixed(3)} + uRgR * rgRip);
  }`;

// a patched copy of `base` (its colour and emissive are copied in by the caller every frame where they change with the hour)
export function realGlass(base, U, name) {
  const m = base.clone();
  m.name = name || (base.name || 'glass') + '+real';
  m.transparent = true; m.depthWrite = true;
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusConstantAlphaFactor; m.blendAlpha = 1; // (the controller: 1 - GLASS_T * uSee)
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.ZeroFactor;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>' + FRAG_BODY);
  };
  m.customProgramCacheKey = () => 'real-glass-2';
  m.userData.realGlass = true;
  return m;
}

// A house's inside seen from outside on a phone or a tablet: drawn in colour only (the soft layer: no normal pass, so its creases go and
// its outlines are the depth's), which halves what looking in through the windows costs there. full = true puts every mesh back.
export function insideInk(groups, full) {
  for (const g of groups) g.traverse(o => {
    if (!o.isMesh || o.userData.fadeGhost) return;
    if (full) { if (o.userData.rwMask !== undefined) { o.layers.mask = o.userData.rwMask; delete o.userData.rwMask; } }
    else if (o.userData.rwMask === undefined && o.layers.mask === 1 << LAYER_WORLD) { o.userData.rwMask = o.layers.mask; o.layers.set(LAYER_SOFT); }
  });
}

// The distance from (x, z) to a box { minX, maxX, minZ, maxZ } (0 inside it)
const boxDist = (B, x, z) => Math.hypot(Math.max(B.minX - x, 0, x - B.maxX), Math.max(B.minZ - z, 0, z - B.maxZ));

// The per-house controller.
//   boxes: the house's footprint boxes (distance is measured from the camera to the nearest)
//   meshes(): the see-through panes' meshes (re-read each time the layers change: a door's baked pane included)
//   mats: the real-glass materials (their depthWrite and blendAlpha follow uSee)
//   U: the shared uniforms
// update(camera, { inside, force }) -> whether the inside should be drawn for the glass's sake (the feature ORs its own rules in)
export function createGlassView({ boxes, meshes, mats, U }) {
  let shown = false, see = 0, soft = null, d = Infinity;
  const setSoft = on => {
    if (on === soft) return;
    soft = on;
    for (const o of meshes()) o.layers.set(on ? LAYER_SOFT : LAYER_WORLD);
    for (const m of mats) m.depthWrite = !on;
  };
  const apply = v => {
    U.uSee.value = v;
    for (const m of mats) m.blendAlpha = 1 - GLASS_T * v;
    setSoft(v >= SOFT_AT);
  };
  apply(0);
  return {
    U,
    get shown() { return shown; }, get see() { return see; }, get dist() { return d; },
    // camIn: the camera is inside the house (see-through from inside); otherwise by the camera's distance to the house
    update(dt, cam, camIn = false) {
      const c = cam.position;
      d = Infinity;
      if (!camIn) for (let i = 0; i < boxes.length; i++) d = Math.min(d, boxDist(boxes[i], c.x, c.z)); else d = 0;
      const V = GFX.cls === 'desktop' ? GLASS_VIEW : GLASS_VIEW_PHONE;
      shown = shown ? (d < V.HIDE || see > 0) : d < V.SHOW;
      const target = shown ? Math.min(1, Math.max(0, (V.OPAQUE - d) / (V.OPAQUE - V.CLEAR))) : 0;
      const k = Math.min(1, V.RATE * Math.max(0, Math.min(dt, 0.25)));
      see = Math.abs(target - see) <= k ? target : see + Math.sign(target - see) * k;
      if (d > V.HIDE + 2) see = 0; // (the camera jumped far off in one go: nobody sees the panes switch from there)
      U.uInside.value = camIn ? 1 : 0;
      U.uNight.value = LIGHT.night || 0;
      U.uRgR.value = GFX.level === 'low' ? 0 : GLASS_R; // (Fast: no waver; the composite skips it too)
      apply(see);
      return shown;
    },
    // (tests) the panes as if uSee were v for the next frames drawn without an update; force(see) puts them back
    force(v) { apply(v); },
    // (tests and pictures) jump to the steady state for where the camera is now
    settle(cam, camIn = false) { for (let i = 0; i < 40; i++) this.update(0.1, cam, camIn); },
  };
}
