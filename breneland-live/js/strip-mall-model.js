// The strip mall as a Blender set piece (strip-mall, 2026-11-09), in the Lovecraft house's HD format (lovecraft-model.js, lovecraft-hires):
// assets/blender/scripts/build_strip_mall.py builds the mall to the game's own plan (strip-mall-plan.js, dumped by
// tools/strip-mall-plan-dump.mjs) and exports public/models/strip-mall.json (+ public/models/strip-mall/*.webp): the parts `shell`
// (everything outside: the lot, the walkway, the building, the canopy) and `inside` (both stores, furnished) and `anchors` (the racks,
// the mannequins, the counters, the mirror, the fitting room, the doors, the signs, every lamp's glowing glass `glow-*`).
//
// Every vertex carries a PAINT uv (a tile every 1.5 m, box-projected per piece) and a TILE (its colour key); the material samples the
// hand-painted ATLAS live (4096: 16 x 16 cells, a 224 px tile with its own wrap as padding in each: 0.67 cm a texel, the mip picked from
// the unwrapped uv's derivatives so the wrap has no seam) through the PALETTE (tile -> cell, a 256 x 1 texture) and multiplies it by the
// part's baked LIGHT SHEET (4096: half the WoW gain in rgb, 1 - half the worn-edge mask in alpha; the inside's lamp light multiplied in):
// paint x gain + 0.16 x gain x edge. Phones get the half-size atlas and sheets (2048). The game's toon steps and lamp lights come on top.
//
// In the game (strip-mall-build.js) each part is its own mesh with this material (one draw a part); what the code still builds round
// it (the glass, the door leaves, the signs' faces, the bulbs, the menu, the cars, the bench) goes into the mall's own batches. If the
// JSON does not load, strip-mall-build.js builds the code-built mall (`stripMallModel()` null). `?stripmall=code` builds the code-built
// mall on purpose (the before pictures and numbers); `?smhd=half|full` forces the texture size (tests and pictures).
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';
import { GFX } from './gfx.js';

let DATA = null, HD = null;
/** Fetch the model once, before the world is built (main.js boot). */
export async function loadStripMallModel() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q?.get('stripmall') === 'code') { DATA = null; return false; }
  HD = q?.get('smhd') === 'half' ? 'half' : q?.get('smhd') === 'full' ? 'full' : GFX.cls === 'phone' ? 'half' : 'full';
  try { const r = await fetch('/models/strip-mall.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.parts || !DATA.parts.shell || !DATA.parts.inside || !DATA.atlas || !DATA.sheets || !DATA.palettes) DATA = null;
  return !!DATA;
}
/** The model's data (null: build the code-built mall). */
export const stripMallModel = () => DATA;
/** Which texture size this device draws: 'full' (4096) or 'half' (2048, phones). */
export const stripMallHD = () => HD;
/** An anchor by name: `{ pos: [x, y, z] (world), ...props }`, or null. */
export const stripMallAnchor = name => (DATA && DATA.anchors[name]) || null;
/** Every anchor whose name starts with `prefix`: [{ name, ...anchor }]. */
export function stripMallAnchors(prefix) {
  const out = [];
  for (const [name, a] of Object.entries(DATA ? DATA.anchors : {})) if (name.startsWith(prefix)) out.push({ name, ...a });
  return out;
}

const geos = new Map(), mats = new Map(), texes = new Map();
/** A part's geometry (world frame, metres), cached: position, normal, uv (the light sheet), aPaint (the atlas tile every 1.5 m), aTile. */
export function stripMallGeometry(part) {
  let g = geos.get(part);
  if (g) return g;
  const P = DATA.parts[part], [ox, oy, oz] = DATA.origin || [0, 0, 0], n = P.pos.length / 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), puv = new Float32Array(n * 2), tile = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = P.pos[i * 3] / 1000 + ox; pos[i * 3 + 1] = P.pos[i * 3 + 1] / 1000 + oy; pos[i * 3 + 2] = P.pos[i * 3 + 2] / 1000 + oz;
    nor[i * 3] = P.nor[i * 3] / 100; nor[i * 3 + 1] = P.nor[i * 3 + 1] / 100; nor[i * 3 + 2] = P.nor[i * 3 + 2] / 100;
    uv[i * 2] = P.uv[i * 2] / 4096; uv[i * 2 + 1] = P.uv[i * 2 + 1] / 4096;
    puv[i * 2] = P.puv[i * 2] / 1024; puv[i * 2 + 1] = P.puv[i * 2 + 1] / 1024;
    tile[i] = P.tile[i];
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aPaint', new THREE.BufferAttribute(puv, 2));
  g.setAttribute('aTile', new THREE.BufferAttribute(tile, 1));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
  geos.set(part, g);
  return g;
}
function texture(url, srgb) {
  let t = texes.get(url);
  if (t) return t;
  t = new THREE.TextureLoader().load(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; // (4, not the Lovecraft house's 8: the mall stands 12 m from perf-budget's store spot, and the three 4096 sheets' sampling was the frame's cost there)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  texes.set(url, t);
  return t;
}
let PAL = null;
function palette() {
  if (PAL) return PAL;
  PAL = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  PAL.minFilter = PAL.magFilter = THREE.NearestFilter; PAL.generateMipmaps = false; PAL.colorSpace = THREE.NoColorSpace;
  const pal = DATA.palettes.default, grid = DATA.atlas.grid, d = PAL.image.data;
  d.fill(0);
  for (let i = 0; i < pal.length && i < 256; i++) { d[i * 4] = pal[i] % grid; d[i * 4 + 1] = Math.floor(pal[i] / grid); d[i * 4 + 3] = 255; }
  PAL.needsUpdate = true;
  return PAL;
}
const UNIFORMS = {};
function uniforms() {
  if (UNIFORMS.uAtlas) return UNIFORMS;
  const A = DATA.atlas, px = HD === 'half' ? A.px / 2 : A.px, pad = HD === 'half' ? A.pad / 2 : A.pad;
  Object.assign(UNIFORMS, {
    uAtlas: { value: texture(HD === 'half' ? A.half : A.full, true) },
    uPal: { value: palette() },
    uCellUV: { value: 1 / A.grid },
    uPadUV: { value: A.pad / A.px },
    uTileUV: { value: A.tile / A.px },
    uGradMax: { value: pad / px / 2 },
  });
  return UNIFORMS;
}
const VERT_PARS = /* glsl */`attribute vec2 aPaint; attribute float aTile; varying vec2 vPaint; varying float vTile;`;
const FRAG_PARS = /* glsl */`uniform sampler2D uAtlas, uPal; uniform float uCellUV, uPadUV, uTileUV, uGradMax; varying vec2 vPaint; varying float vTile;`;
const FRAG_MAP = /* glsl */`
  vec4 smSheet = texture2D( map, vMapUv );
  vec2 smCell = floor( texture2D( uPal, vec2( ( vTile + 0.5 ) / 256.0, 0.5 ) ).rg * 255.0 + 0.5 );
  vec2 smUv = smCell * uCellUV + uPadUV + fract( vPaint ) * uTileUV;
  vec2 smGx = dFdx( vPaint ) * uTileUV, smGy = dFdy( vPaint ) * uTileUV;
  float smG = max( length( smGx ), length( smGy ) );
  if ( smG > uGradMax ) { smGx *= uGradMax / smG; smGy *= uGradMax / smG; }
  vec3 smPaint = texture2DGradEXT( uAtlas, smUv, smGx, smGy ).rgb;
  vec3 smGain = smSheet.rgb * 2.0;
  float smEdge = ( 1.0 - smSheet.a ) * 2.0;
  diffuseColor.rgb *= smPaint * smGain + smGain * ( smEdge * 0.1067 );
`;
/** A part's material: the atlas live through the palette, times the part's baked light sheet, under the game's toon steps. */
export function stripMallMaterial(sheet) {
  let m = mats.get(sheet);
  if (m) return m;
  const S = DATA.sheets[sheet];
  m = new THREE.MeshToonMaterial({ color: '#ffffff', map: texture(HD === 'half' ? S.half : S.full, false), gradientMap: GRADIENT_3 });
  m.name = 'strip-mall-model-' + sheet;
  const U = uniforms();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPaint = aPaint; vTile = aTile;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS).replace('#include <map_fragment>', FRAG_MAP);
  };
  m.customProgramCacheKey = () => 'strip-mall-hires';
  mats.set(sheet, m);
  return m;
}
/** For tests and the sheet: the texel sizes this device draws (cm), the texture files in use. */
export function stripMallTexels() {
  if (!DATA) return null;
  const A = DATA.atlas, k = HD === 'half' ? 2 : 1;
  const out = { hd: HD, atlas: { px: A.px / k, cm: +(A.metres * 100 / (A.tile / k)).toFixed(2), file: HD === 'half' ? A.half : A.full }, sheets: {} };
  for (const [s, S] of Object.entries(DATA.sheets)) out.sheets[s] = { px: S.px / k, cm: S.pxm ? +(100 / (S.pxm / k)).toFixed(1) : null, file: HD === 'half' ? S.half : S.full };
  return out;
}
