// The Fish Shack and the pier diorama as a Blender set piece (fish-shack-setpiece, 2026-11-09; Andrew: "make your own version of the
// fishing shack and the diorama around the pier ... looks better, especially the shack, which is too short at minimum and not
// interesting enough at worst. Some of the current props are vague interpretations as well"). assets/blender/scripts/build_fishshack.py
// builds it to the game's own numbers (assets/blender/fishshack-plan.json, from tools/fish-shack-plan-dump.mjs) and exports
// public/models/fishshack.json (+ public/models/fishshack/*.webp): the parts `shell` (the shack outside: taller, a covered porch, the
// tackle wall, the bait fridge, the rod rack, nets and floats, the fish weather vane, the stovepipe, the board's window frame, the canoe
// rack, the fish-cleaning table), `inside` (the shack within: the counter's cabinet, the shelves of bait, the stove, the pendant's shade),
// `pier` (Kevin's pier: planks, pilings, cleats, bollards, a ladder) and `props` (the buckets, the crate, the cooler, the rope coils,
// the landing net, the crab pots and traps, the life ring), and `anchors`: every spot the code hangs something on (the sign's face,
// the OPEN sign, the hatch's shutter, the TOP FISHERS board's face, the lamps' glowing glass `glow-*`, Mabel's counter spot, the porch
// deck as a walkable surface, and every collider: `collide: 'box' | 'circle'`).
//
// The look is the Lovecraft set piece's HD pipeline (lovecraft-model.js, lovecraft-hires): every vertex carries a PAINT uv (a tile every
// 1.5 m, box-projected per piece) and a TILE (its colour key); the material samples the hand-painted ATLAS live (4096 wide, 16 cells of
// 256 px a row, 3 rows in use: a 224 px tile with its own wrap as padding in each, 0.67 cm a texel; the mip from the unwrapped uv's
// derivatives so the wrap has no seam) through the PALETTE (tile -> cell) and multiplies it by the part's baked LIGHT SHEET (2048: half
// the WoW gain in rgb, 1 - half the worn-edge mask in alpha; the inside's lamplight mood multiplied in): paint x gain + 0.16 x gain x edge.
// Phones get the half-size atlas and sheets. The game's toon steps and lamp lights come on top.
//
// In the game each part is its own mesh with this material (one draw a part); what the code still builds round it (the signs, the
// shutter, the board's face, the glass of the lamps, Mabel, the fish on the crate's ice, the gulls, the drying net, the boats) stays
// the code's. If the JSON does not load, fish-shack.js, dock.js, fish-dock.js, dock-lawn.js and world.js build the old code-built area
// (`fishShackModel()` null). `?fishshack=code` builds the code-built area on purpose (the before pictures and numbers); `?fshd=half|full`
// forces the texture size (tests and pictures).
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';
import { GFX } from './gfx.js';

let DATA = null, HD = null;
/** Fetch the model once, before the world is built (main.js boot). */
export async function loadFishShackModel() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q?.get('fishshack') === 'code') { DATA = null; return false; }
  HD = q?.get('fshd') === 'half' ? 'half' : q?.get('fshd') === 'full' ? 'full' : GFX.cls === 'phone' ? 'half' : 'full';
  try { const r = await fetch('/models/fishshack.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.parts || !DATA.parts.shell || !DATA.parts.inside || !DATA.parts.pier || !DATA.parts.props || !DATA.atlas || !DATA.sheets || !DATA.palettes) DATA = null;
  return !!DATA;
}
/** The model's data (null: build the code-built area). */
export const fishShackModel = () => DATA;
/** Which texture size this device draws: 'full' or 'half' (phones). */
export const fishShackHD = () => HD;
/** An anchor by name: `{ pos: [x, y, z] (world), ...props }`, or null. */
export const fishShackAnchor = name => (DATA && DATA.anchors[name]) || null;
/** Every anchor whose name starts with `prefix`: [{ name, ...anchor }]. */
export function fishShackAnchors(prefix) {
  const out = [];
  for (const [name, a] of Object.entries(DATA ? DATA.anchors : {})) if (name.startsWith(prefix)) out.push({ name, ...a });
  return out;
}
/** The model's colliders for a part of the area (`'shack'` or `'dock'`; every one when omitted), as collider entries (world frame):
 * an anchor marked `collide: 'box'` gives its `box` [minX, y0, minZ, maxX, y1, maxZ], `collide: 'circle'` a circle of `r` about its pos. */
export function fishShackColliders(part = null) {
  const out = [];
  for (const a of Object.values(DATA ? DATA.anchors : {})) {
    if (part && a.part !== part) continue;
    if (a.collide === 'box' && a.box) out.push({ type: 'box', minX: a.box[0], maxX: a.box[3], minZ: a.box[2], maxZ: a.box[5] });
    else if (a.collide === 'circle') out.push({ type: 'circle', x: a.pos[0], z: a.pos[2], r: a.r || 0.3 });
  }
  return out;
}

const geos = new Map(), mats = new Map(), texes = new Map();
/** A part's geometry (world frame, metres), cached: position, normal, uv (the light sheet), aPaint (the atlas tile every 1.5 m), aTile. */
export function fishShackGeometry(part) {
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
  g.computeBoundingSphere();
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
// the palette: tile -> atlas cell (column in r, row in g), one 256 x 1 texture shared by every part's material
let PAL = null;
function palette() {
  if (PAL) return PAL;
  PAL = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  PAL.minFilter = PAL.magFilter = THREE.NearestFilter; PAL.generateMipmaps = false; PAL.colorSpace = THREE.NoColorSpace;
  const pal = DATA.palettes.default, grid = DATA.atlas.grid, d = PAL.image.data;
  for (let i = 0; i < pal.length && i < 256; i++) { d[i * 4] = pal[i] % grid; d[i * 4 + 1] = Math.floor(pal[i] / grid); d[i * 4 + 3] = 255; }
  PAL.needsUpdate = true;
  return PAL;
}
const UNIFORMS = {};
function uniforms() {
  if (UNIFORMS.uAtlas) return UNIFORMS;
  const A = DATA.atlas, rows = A.rows || A.grid, px = HD === 'half' ? A.px / 2 : A.px, pad = HD === 'half' ? A.pad / 2 : A.pad;
  // (the atlas is cropped to its rows in use: a cell is 1/grid wide and 1/rows tall; the painter lays cells from the bottom, v = 0)
  Object.assign(UNIFORMS, {
    uAtlas: { value: texture(HD === 'half' ? A.half : A.full, true) },
    uPal: { value: palette() },
    uCellUV: { value: new THREE.Vector2(1 / A.grid, 1 / rows) },
    uPadUV: { value: new THREE.Vector2(A.pad / A.px, A.pad / (A.cell * rows)) },
    uTileUV: { value: new THREE.Vector2(A.tile / A.px, A.tile / (A.cell * rows)) },
    uAtlasPx: { value: new THREE.Vector2(px, A.cell * rows / (HD === 'half' ? 2 : 1)) },   // (the sheet is wider than tall: the mip clamp works in texels)
    uGradMax: { value: pad / 2 },   // (the mip stops where the cell's padding would be a texel wide: no neighbour bleeds into the wrap)
  });
  return UNIFORMS;
}
const VERT_PARS = /* glsl */`attribute vec2 aPaint; attribute float aTile; varying vec2 vPaint; varying float vTile;`;
const FRAG_PARS = /* glsl */`uniform sampler2D uAtlas, uPal; uniform vec2 uCellUV, uPadUV, uTileUV, uAtlasPx; uniform float uGradMax; varying vec2 vPaint; varying float vTile;`;
const FRAG_MAP = /* glsl */`
  vec4 fsSheet = texture2D( map, vMapUv );
  vec2 fsCell = floor( texture2D( uPal, vec2( ( vTile + 0.5 ) / 256.0, 0.5 ) ).rg * 255.0 + 0.5 );
  vec2 fsUv = fsCell * uCellUV + uPadUV + fract( vPaint ) * uTileUV;
  vec2 fsGx = dFdx( vPaint ) * uTileUV, fsGy = dFdy( vPaint ) * uTileUV;
  float fsG = max( length( fsGx * uAtlasPx ), length( fsGy * uAtlasPx ) );
  if ( fsG > uGradMax ) { fsGx *= uGradMax / fsG; fsGy *= uGradMax / fsG; }
  vec3 fsPaint = texture2DGradEXT( uAtlas, fsUv, fsGx, fsGy ).rgb;
  vec3 fsGain = fsSheet.rgb * 2.0;
  float fsEdge = ( 1.0 - fsSheet.a ) * 2.0;
  diffuseColor.rgb *= fsPaint * fsGain + fsGain * ( fsEdge * 0.1067 );
`;
/** A sheet's material: the atlas live through the palette, times the baked light sheet, under the game's toon steps. */
export function fishShackMaterial(sheet) {
  let m = mats.get(sheet);
  if (m) return m;
  const S = DATA.sheets[sheet];
  m = new THREE.MeshToonMaterial({ color: '#ffffff', map: texture(HD === 'half' ? S.half : S.full, false), gradientMap: GRADIENT_3 });
  m.name = 'fishshack-model-' + sheet;
  const U = uniforms();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPaint = aPaint; vTile = aTile;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS).replace('#include <map_fragment>', FRAG_MAP);
  };
  m.customProgramCacheKey = () => 'fishshack-hd';
  mats.set(sheet, m);
  return m;
}
/** A part as its own mesh (world frame; never merged: the material carries its own attributes). */
export function fishShackMesh(part, name) {
  const P = DATA.parts[part];
  const m = new THREE.Mesh(fishShackGeometry(part), fishShackMaterial(P.sheet));
  m.name = name || ('fishshack-' + part); m.userData.noMerge = true; m.matrixAutoUpdate = false;
  m.castShadow = part !== 'inside'; m.receiveShadow = true;
  return m;
}
/** For tests and the sheet: the texel sizes this device draws (cm), the texture files in use, the parts' triangle counts. */
export function fishShackTexels() {
  if (!DATA) return null;
  const A = DATA.atlas, k = HD === 'half' ? 2 : 1;
  const out = { hd: HD, atlas: { px: A.px / k, cm: +(A.metres * 100 / (A.tile / k)).toFixed(2), file: HD === 'half' ? A.half : A.full }, sheets: {}, tris: {} };
  for (const [s, S] of Object.entries(DATA.sheets)) out.sheets[s] = { px: S.px / k, cm: S.pxm ? +(100 / (S.pxm / k)).toFixed(1) : null, file: HD === 'half' ? S.half : S.full };
  for (const [p, P] of Object.entries(DATA.parts)) out.tris[p] = P.tris;
  return out;
}
