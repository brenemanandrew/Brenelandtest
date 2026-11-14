// Wearing Peak Threads' clothes (clothing-store): the Blender catalogue (public/models/clothes.json + clothes/sheet.webp, built by
// assets/blender/scripts/build_clothes.py on the game's default body) put onto any body human.js builds. A worn piece travels in the
// look (clothing-catalog.js SLOT_KEY: wHat, wTop, wBot, wShoe, wAcc) and resolveLook turns it into `o.wear` ({ hat, top, bot, shoe,
// acc }: pieces or null). human.js calls the hooks below while it builds: each model part is a mesh in a body frame (chest, hips,
// thigh, shin, foot, head), scaled to this body's own dims and added to that frame's Part, so the chest and pelvis parts take the body
// type's warp and the arm tuck with the shirt, the arms are fitted round them, and every part rides its rigid bone with the walk, the
// sit, the dances and the swim. Colours: a vertex colour per zone from the piece's `cols` (zone 0 stays white: the sheet's own baked
// detail), under ONE shared textured toon material, so rigid-merge draws all of a person's clothes as one skinned mesh.
// If the model does not load (`clothesReady()` false) a person wears the code's base clothes in the pieces' colours and nothing else.
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';
import { pieceOf, KINDS, SLOT_KEY, isDress, HAT_RIM } from './clothing-catalog.js';
import { hairShell } from './bodies-gear.js';

let DATA = null, MAT = null, TEX = null;
/** Fetch the catalogue's models once, before the world is built (main.js boot). */
export async function loadClothesModel() {
  try { const r = await fetch('/models/clothes.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.models || !DATA.ref) DATA = null;
  return !!DATA;
}
export const clothesReady = () => !!DATA;
export const clothesModel = () => DATA;
/** The one material every piece wears: the baked sheet under the game's toon steps, vertex colours on (the piece's colours). */
export function clothesMaterial() {
  if (MAT) return MAT;
  TEX = new THREE.TextureLoader().load(DATA.sheet);
  TEX.colorSpace = THREE.SRGBColorSpace; TEX.anisotropy = 4;
  MAT = new THREE.MeshToonMaterial({ color: '#ffffff', map: TEX, gradientMap: GRADIENT_3, vertexColors: true });
  MAT.name = 'clothes-sheet';
  return MAT;
}

// a look's worn pieces (resolveLook): the catalogue's pieces by slot key, kinds checked; a dress puts the top away
export function wearFromLook(opts) {
  const w = {};
  for (const k of KINDS) { const p = pieceOf(opts[SLOT_KEY[k]]); w[k] = p && p.kind === k ? p : null; }
  if (w.bot && isDress(w.bot.id)) w.top = null;
  return w;
}
export const anyWorn = w => !!w && KINDS.some(k => w[k]);

// ---- geometry: a part in its frame (metres), cached; mirrored for the right side; tinted per piece
const base = new Map(), tintedCache = new Map();
function partGeometry(model, frame, mirror = false) {
  const key = model + '|' + frame + (mirror ? '|m' : '');
  let g = base.get(key);
  if (g) return g;
  const P = DATA.models[model] && DATA.models[model].parts[frame];
  if (!P) return null;
  const n = P.pos.length / 3, sx = mirror ? -1 : 1;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = P.pos[i * 3] / 1000 * sx; pos[i * 3 + 1] = P.pos[i * 3 + 1] / 1000; pos[i * 3 + 2] = P.pos[i * 3 + 2] / 1000;
    nor[i * 3] = P.nor[i * 3] / 100 * sx; nor[i * 3 + 1] = P.nor[i * 3 + 1] / 100; nor[i * 3 + 2] = P.nor[i * 3 + 2] / 100;
    uv[i * 2] = P.uv[i * 2] / 4096; uv[i * 2 + 1] = P.uv[i * 2 + 1] / 4096;
  }
  let idx = P.idx;
  if (mirror) { idx = idx.slice(); for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; } }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.userData.zone = P.zone;
  base.set(key, g);
  return g;
}
const _c = new THREE.Color();
/** A part tinted with a piece's colours (zone k -> cols[k - 1]; zone 0 white): shares the base attributes, its own colours. */
export function tintedPart(model, frame, cols, mirror = false) {
  const g = partGeometry(model, frame, mirror);
  if (!g) return null;
  const key = model + '|' + frame + (mirror ? '|m|' : '|') + cols.join(',');
  let t = tintedCache.get(key);
  if (t) return t;
  const zone = g.userData.zone, n = zone.length, col = new Float32Array(n * 3);
  const lin = cols.map(h => { _c.set(h); return [_c.r, _c.g, _c.b]; });
  for (let i = 0; i < n; i++) {
    const z = zone[i], c = z > 0 && lin[z - 1] ? lin[z - 1] : null;
    col[i * 3] = c ? c[0] : 1; col[i * 3 + 1] = c ? c[1] : 1; col[i * 3 + 2] = c ? c[2] : 1;
  }
  t = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) t.setAttribute(k, g.attributes[k]);
  t.setAttribute('color', new THREE.BufferAttribute(col, 3));
  t.setIndex(g.index);
  t.userData.shared = true; // (human.dispose leaves shared geometry alone: the base attributes are everyone's)
  tintedCache.set(key, t);
  return t;
}
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const scaleAbout = (sx, sy, sz, y0) => _m.makeTranslation(0, y0, 0).multiply(_m2.makeScale(sx, sy, sz)).multiply(new THREE.Matrix4().makeTranslation(0, -y0, 0));
const R = () => DATA.ref.dims;
const add = (part, geo, matrix) => { if (geo) part.add(geo.clone(), clothesMaterial(), { matrix: matrix.clone() }); };
// (Part.add clones the geometry and bakes the matrix in; the clone keeps `shared` off, so the clone is disposed with the person)

// ---- the hooks human.js calls while building (each a no-op without the model or without a piece there)
/** The chest Part, before its warps: the top (or a dress's bodice, or overalls' bib) and the chest accessories (scarf, backpack). */
export function wearChest(p, o, D, yb, H) {
  const w = o.wear; if (!DATA || !w) return;
  const d = R(), m = scaleAbout(D.wT / d.wT, H / (d.torsoTop + 0.06), D.dT / d.dT, yb);
  const put = piece => { if (piece && DATA.models[piece.model] && DATA.models[piece.model].parts.chest) add(p, tintedPart(piece.model, 'chest', piece.cols), m); };
  put(w.top);
  if (w.bot && (isDress(w.bot.id) || DATA.models[w.bot.model]?.parts.chest)) put(w.bot);
  if (w.acc && w.acc.where === 'chest') put(w.acc);
}
/** The pelvis Part (the hips frame), before its tuck warp: a bottom's hips part. */
export function wearPelvis(pp, o, D) {
  const w = o.wear; if (!DATA || !w || !w.bot) return;
  const d = R(), S = D.shape, pelR = (d.hipX + 0.112), pelZ = d.dT * 0.95;
  const sx = ((D.hipX + 0.112) * S.hipK) / pelR, sz = (D.dT * 0.95 * (1 + (S.hipK - 1) * 0.6) * S.seatK) / pelZ;
  add(pp, tintedPart(w.bot.model, 'hips', w.bot.cols), scaleAbout(sx, 1, sz, 0));
}
/** A leg Part: `which` 'thigh' (the hip frame) or 'shin' (the knee frame); side 1 left, -1 right. */
export function wearLeg(part, o, D, which, side) {
  const w = o.wear; if (!DATA || !w || !w.bot) return;
  const d = R(), k = D.legR / d.legR, ky = which === 'thigh' ? D.Lt / d.Lt : D.Ls / d.Ls;
  add(part, tintedPart(w.bot.model, which, w.bot.cols, side < 0), scaleAbout(k, ky, k, 0));
}
/** The foot Part (the ankle frame): the shoes, the left mirrored for the right foot; widened with the leg as the code's shoes are. */
export function wearShoe(fp, o, D, side, r) {
  const w = o.wear; if (!DATA || !w || !w.shoe) return;
  add(fp, tintedPart(w.shoe.model, 'foot', w.shoe.cols, side < 0), scaleAbout(r / R().legR, 1, 1, 0));
}
const envelope = style => (style === 'bald' ? 1 : style === 'balding' ? 1.02 : hairShell(style, true).scale);
/** The hair cover for a bought hat (human.js builds the hair under it): the model's own rim and gap (HAT_RIM), so the hair is squashed
 * and trimmed under the whole dome, down to where the hat's edge really is; the hair below the edge stays. The same shape bodies-gear.js
 * hatCover returns for a dome hat: { rim, env, scale, flat, dome, wide }. A hat with no rim (the flower crown) sits on the hair: null. */
export function hatCoverFor(piece, style) {
  const d = piece && HAT_RIM[piece.model];
  if (!d) return null;
  const env = envelope(style);
  return { rim: d.rim, env, scale: env + d.gap - 0.05, flat: 0, dome: true, wide: !!d.wide };
}
/** On the head group: the hat and the head accessories (glasses), scaled to this head's shape and the hair it sits on. Returns the
 * group (hidden while swimming) or null. */
export function wearHead(headC, o, sh) {
  const w = o.wear; if (!DATA || !w || (!w.hat && !(w.acc && w.acc.where === 'head'))) return null;
  const ref = DATA.ref, hk = envelope(o.hairStyle) / ref.hairEnv;
  const g = new THREE.Group(); g.name = 'worn-head';
  const mat = clothesMaterial();
  const put = (piece, onHair) => {
    const geo = tintedPart(piece.model, 'head', piece.cols); if (!geo) return;
    const k = onHair ? hk : 1;
    const m = new THREE.Mesh(geo, mat); m.castShadow = true;
    m.scale.set(sh.rx / ref.head.rx * k, sh.ry / ref.head.ry * (onHair ? 0.5 + 0.5 * k : 1), sh.rz / ref.head.rz * k);
    g.add(m);
  };
  if (w.hat) put(w.hat, true);
  if (w.acc && w.acc.where === 'head') put(w.acc, false);
  headC.add(g);
  return g;
}

/** A display copy of a piece, standing on nothing (the store's racks, the wardrobe): every part at the default body's frames, as a
 * Group whose origin is the floor under the feet, facing +z. `onlyFrames` limits it (a hanging top: ['chest']). */
export function displayPiece(piece, onlyFrames = null) {
  if (!DATA || !piece) return null;
  const d = R(), M = DATA.models[piece.model];
  if (!M) return null;
  const g = new THREE.Group(), mat = clothesMaterial();
  const chestY = d.hipsY + d.waist;
  const at = { chest: [0, chestY, 0], hips: [0, d.hipsY, 0], thigh: [d.hipX, d.hipsY, 0], shin: [d.hipX, d.hipsY - d.Lt, 0], foot: [d.hipX, d.hipsY - d.Lt - d.Ls, 0], head: [0, chestY + d.torsoTop + d.neckY + d.headY, 0], root: [0, 0, 0] };
  for (const frame of Object.keys(M.parts)) {
    if (onlyFrames && !onlyFrames.includes(frame)) continue;
    for (const side of (frame === 'thigh' || frame === 'shin' || frame === 'foot') ? [1, -1] : [1]) {
      const geo = tintedPart(piece.model, frame, piece.cols, side < 0);
      const m = new THREE.Mesh(geo, mat); m.castShadow = true;
      const a = at[frame] || at.root; m.position.set(a[0] * side, a[1], a[2]);
      g.add(m);
    }
  }
  g.userData.frames = Object.keys(M.parts);
  return g;
}
/** A model that is not a piece (the wardrobe, the hanger) as a Mesh at its own root, tinted with `cols`. */
export function modelMesh(model, cols = ['#c9a06a']) {
  const geo = DATA && tintedPart(model, 'root', cols);
  if (!geo) return null;
  const m = new THREE.Mesh(geo, clothesMaterial()); m.castShadow = true; m.receiveShadow = true; m.name = 'clothes-' + model;
  return m;
}
/** Where a part's frame stands on the default body (metres over the floor): the store hangs things by it. */
export function frameHeight(frame) {
  const d = R(); const chestY = d.hipsY + d.waist;
  return { chest: chestY, hips: d.hipsY, thigh: d.hipsY, shin: d.hipsY - d.Lt, foot: d.hipsY - d.Lt - d.Ls, head: chestY + d.torsoTop + d.neckY + d.headY }[frame] ?? 0;
}
