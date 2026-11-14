// The Lovecraft house as a Blender set piece (lovecraft-setpiece, 2026-11-08: direction A of docs/refs/lovecraft-ideas/PROPOSAL.md,
// "the same house, done properly"). assets/blender/scripts/build_lovecraft.py builds the house to the game's own plan
// (lovecraft-plan.js, dumped by tools/lovecraft-plan-dump.mjs) and exports public/models/lovecraft.json (+ public/models/lovecraft/*.webp):
// the parts `shell` (everything outside), `inside` (every room you can walk in, furnished), `winter`, `halloween` and `spring` (the
// seasonal extras) and `anchors` (every spot the code hangs something on: the lamps' glowing glass `glow-*`, the portrait and the
// star chart, the maze door, the door's wreath).
//
// lovecraft-hires (2026-11-09, Andrew: "the textures and geometry suck, very low resolution"): the paint is not baked into a sheet any
// more. Every vertex carries a PAINT uv (a tile every 1.5 m, box-projected per piece) and a TILE (its colour key), and the material
// samples the hand-painted ATLAS live (4096: 16 x 16 cells, a 224 px tile with its own wrap as padding in each: 0.67 cm a texel, the
// mip picked from the unwrapped uv's derivatives so the wrap has no seam) through the season's PALETTE (tile -> cell: a 256 x 1
// texture, so a skin is a palette swap), and multiplies it by the part's baked LIGHT SHEET (4096: half the WoW gain in rgb, 1 - half
// the worn-edge mask in alpha; the inside's gaslight and firelight mood multiplied in) exactly as the bake used to: paint x gain + 0.16
// x gain x edge. Phones get the half-size atlas and sheets (2048: 1.3 cm a texel). The game's toon steps and lamp lights come on top.
//
// In the game (lovecraft-build.js) each part is its own mesh with this material (one draw a part, as the batch was); what the code
// still builds round it (the door, the glass, the lamps' glass, the fires, the game on the table, the folk) goes into the house's own
// batches as before. If the JSON does not load, lovecraft-build.js builds the old code-built house (`lovecraftModel()` null).
// `?lovecraft=code` builds the code-built house on purpose (the before pictures and numbers); `?lcskin=winter` forces a skin;
// `?lchd=half|full` forces the texture size (tests and pictures).
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';
import { easternParts } from './daytime.js';
import { GFX } from './gfx.js';

let DATA = null, FORCED = null, HD = null;
const SEASONS_PARKED = true; // the seasonal skins and pieces wait (Andrew, 2026-11-09); `?lcskin=` still forces one for a look
/** Fetch the model once, before the world is built (main.js boot). */
export async function loadLovecraftModel() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q?.get('lovecraft') === 'code') { DATA = null; return false; }
  FORCED = q?.get('lcskin') || null;
  HD = q?.get('lchd') === 'half' ? 'half' : q?.get('lchd') === 'full' ? 'full' : GFX.cls === 'phone' ? 'half' : 'full';
  try { const r = await fetch('/models/lovecraft.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.parts || !DATA.parts.shell || !DATA.parts.inside || !DATA.atlas || !DATA.sheets || !DATA.palettes) DATA = null;
  return !!DATA;
}
/** The model's data (null: build the code-built house). */
export const lovecraftModel = () => DATA;
/** Which texture size this device draws: 'full' (4096) or 'half' (2048, phones). */
export const lovecraftHD = () => HD;
/** An anchor by name: `{ pos: [x, y, z] (world), ...props }`, or null. */
export const lovecraftAnchor = name => (DATA && DATA.anchors[name]) || null;
/** Every anchor whose name starts with `prefix`: [{ name, ...anchor }]. */
export function lovecraftAnchors(prefix) {
  const out = [];
  for (const [name, a] of Object.entries(DATA ? DATA.anchors : {})) if (name.startsWith(prefix)) out.push({ name, ...a });
  return out;
}

/** The season's skin for a time (Eastern calendar, the way the dogs' holiday headbands go: paws.js SEASONS): halloween Oct 15-31,
 * winter Dec 1 - Feb 28, spring Mar 20 - Jun 20, else the default (direction A as approved). `?lcskin=` overrides. */
export function lovecraftSkin(ms) {
  if (FORCED) return FORCED;
  if (SEASONS_PARKED) return 'default'; // (lovecraft-hires, Andrew 2026-11-09: "don't worry about the winter or halloween or spring versions yet": the base skin all year until the seasons are looked at in the HD format)
  const { mo, d } = easternParts(ms), v = mo * 100 + d;
  if (v >= 1015 && v <= 1031) return 'halloween';
  if (v >= 1201 || v <= 228) return 'winter';
  if (v >= 320 && v <= 620) return 'spring';
  return 'default';
}
/** The parts drawn in a season (`winter`, `halloween`, `spring`). */
export const lovecraftSeasonParts = skin => Object.entries(DATA ? DATA.parts : {}).filter(([, p]) => p.season === skin).map(([n]) => n);

const geos = new Map(), mats = new Map(), texes = new Map();
/** A part's geometry (world frame, metres), cached: position, normal, uv (the light sheet), aPaint (the atlas tile every 1.5 m), aTile. */
export function lovecraftGeometry(part) {
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
  t = new THREE.TextureLoader().load(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  texes.set(url, t);
  return t;
}
// the palette: tile -> atlas cell (column in r, row in g), one 256 x 1 texture shared by every part's material, rewritten for a skin
let PAL = null;
function palette() {
  if (PAL) return PAL;
  PAL = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  PAL.minFilter = PAL.magFilter = THREE.NearestFilter; PAL.generateMipmaps = false; PAL.colorSpace = THREE.NoColorSpace;
  fillPalette(FORCED || 'default');
  return PAL;
}
function fillPalette(skin) {
  const pal = DATA.palettes[skin] || DATA.palettes.default, grid = DATA.atlas.grid, d = PAL.image.data;
  d.fill(0);
  for (let i = 0; i < pal.length && i < 256; i++) { d[i * 4] = pal[i] % grid; d[i * 4 + 1] = Math.floor(pal[i] / grid); d[i * 4 + 3] = 255; }
  PAL.needsUpdate = true;
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
    uGradMax: { value: pad / px / 2 }, // (the mip stops where the cell's padding would be a texel wide: no neighbour bleeds into the wrap)
  });
  return UNIFORMS;
}
const VERT_PARS = /* glsl */`attribute vec2 aPaint; attribute float aTile; varying vec2 vPaint; varying float vTile;`;
const FRAG_PARS = /* glsl */`uniform sampler2D uAtlas, uPal; uniform float uCellUV, uPadUV, uTileUV, uGradMax; varying vec2 vPaint; varying float vTile;`;
const FRAG_MAP = /* glsl */`
  vec4 lcSheet = texture2D( map, vMapUv );
  vec2 lcCell = floor( texture2D( uPal, vec2( ( vTile + 0.5 ) / 256.0, 0.5 ) ).rg * 255.0 + 0.5 );
  vec2 lcUv = lcCell * uCellUV + uPadUV + fract( vPaint ) * uTileUV;
  vec2 lcGx = dFdx( vPaint ) * uTileUV, lcGy = dFdy( vPaint ) * uTileUV;
  float lcG = max( length( lcGx ), length( lcGy ) );
  if ( lcG > uGradMax ) { lcGx *= uGradMax / lcG; lcGy *= uGradMax / lcG; }
  vec3 lcPaint = texture2DGradEXT( uAtlas, lcUv, lcGx, lcGy ).rgb;
  vec3 lcGain = lcSheet.rgb * 2.0;
  float lcEdge = ( 1.0 - lcSheet.a ) * 2.0; // (the worn-edge mask rides in alpha as 1 - e/2: an alpha near 0 would be quantised away when the browser premultiplies the decoded image)
  diffuseColor.rgb *= lcPaint * lcGain + lcGain * ( lcEdge * 0.1067 );
`;
/** A part's material: the atlas live through the palette, times the part's baked light sheet, under the game's toon steps. */
export function lovecraftMaterial(sheet) {
  let m = mats.get(sheet);
  if (m) return m;
  const S = DATA.sheets[sheet];
  m = new THREE.MeshToonMaterial({ color: '#ffffff', map: texture(HD === 'half' ? S.half : S.full, false), gradientMap: GRADIENT_3 });
  m.name = 'lovecraft-model-' + sheet;
  const U = uniforms();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPaint = aPaint; vTile = aTile;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS).replace('#include <map_fragment>', FRAG_MAP);
  };
  m.customProgramCacheKey = () => 'lovecraft-hires';
  mats.set(sheet, m);
  return m;
}
/** Swap the palette to another skin's (the seasons change at midnight while the game is open: lovecraft-house.js). */
export function setLovecraftSkin(skin) {
  if (!DATA || !DATA.palettes[skin]) return false;
  palette(); fillPalette(skin);
  return true;
}
/** For tests and the sheet: the texel sizes this device draws (cm), the texture files in use. */
export function lovecraftTexels() {
  if (!DATA) return null;
  const A = DATA.atlas, k = HD === 'half' ? 2 : 1;
  const out = { hd: HD, atlas: { px: A.px / k, cm: +(A.metres * 100 / (A.tile / k)).toFixed(2), file: HD === 'half' ? A.half : A.full }, sheets: {} };
  for (const [s, S] of Object.entries(DATA.sheets)) out.sheets[s] = { px: S.px / k, cm: S.pxm ? +(100 / (S.pxm / k)).toFixed(1) : null, file: HD === 'half' ? S.half : S.full };
  return out;
}
