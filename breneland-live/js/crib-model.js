// Kevin's Tool Crib as a Blender set piece (crib-setpiece, Andrew 2026-11-08: "build out the tool crib as a unique building that
// retains the purpose and fun elements ... a cohesive set piece"). assets/blender/scripts/build_crib.py builds the building to the
// game's own plan (tool-crib-plan.js, dumped by tools/crib-plan-dump.mjs), bakes its hand-painted look into one texture per part and
// exports public/models/crib.json (+ public/models/crib/<part>.webp): two parts, `shell` (everything outside: the walls, the false
// front, the sagging tin roof and its junk, the porch and its striped awning (crib-front: no posts, nothing on top), the lean-to,
// the loft's bump-out) and `inside` (the architecture
// and the fixed furniture, and the clutter that is piles: the paint can pyramid under its tarp, the wire shelving full of totes,
// the shelves' bins and jars, the paint wall's cans, the tyres), plus `anchors`: every spot the code reads (the sign, the awning
// and its baskets, the lean-to's box, each pile's box).
//
// In the game (tool-crib-build.js) a part goes into the crib's own Batcher with this material (the baked sheet, vertex colours on:
// the code-built pieces in the same batch keep their colours and point their zero uvs at the sheet's white corner), so the building
// and what the code still builds (the doors, the glass, the bulbs, the bike, the springs, the barrel, the small clutter) are the
// same draw calls as before. If the JSON does not load, tool-crib-build.js builds the old code-built crib (`cribModel()` null).
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';

let DATA = null;
/** Fetch the model once, before the world is built (main.js boot). */
export async function loadCribModel() {
  try { const r = await fetch('/models/crib.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.parts || !DATA.parts.shell || !DATA.parts.inside) DATA = null;
  return !!DATA;
}
/** The model's data (null: build the code-built crib). */
export const cribModel = () => DATA;
/** An anchor by name: `{ pos: [x, y, z] (the plan's frame), ...props (box, r, w, h, cans, ...) }`, or null. */
export const cribAnchor = name => (DATA && DATA.anchors[name]) || null;
/** A pile's entry for inside.userData.clutter from its anchor: `{ name, box, floor? }` (wire-shelf0 -> 'wire-shelf'). */
export function cribItem(name) {
  const a = cribAnchor(name);
  if (!a || !a.box) return null;
  const it = { name: name.replace(/\d+$/, ''), box: a.box.slice() };
  if (a.floor) it.floor = true;
  return it;
}

/** (crib-clutter-2) every anchor marked `item` as an entry for inside.userData.clutter (`{ name, box, floor?, overhead?, wall? }`;
 * beer-cases0 -> 'beer-cases'), and every anchor marked `collide` as a collider in the plan's frame ('box': its box; 'circle': `r`
 * about its pos). The model's own piles, listed and made solid without the code knowing each by name. */
export function cribItems() {
  const out = [];
  for (const [name, a] of Object.entries(DATA ? DATA.anchors : {})) {
    if (!a.item || !a.box) continue;
    const it = { name: name.replace(/\d+$/, ''), box: a.box.slice() };
    for (const k of ['floor', 'overhead', 'wall']) if (a[k]) it[k] = true;
    out.push(it);
  }
  return out;
}
export function cribColliders() {
  const out = [];
  for (const a of Object.values(DATA ? DATA.anchors : {})) {
    if (a.collide === 'box' && a.box) out.push({ type: 'box', minX: a.box[0], maxX: a.box[3], minZ: a.box[2], maxZ: a.box[5] });
    else if (a.collide === 'circle') out.push({ type: 'circle', x: a.pos[0], z: a.pos[2], r: a.r || 0.3 });
  }
  return out;
}

/** (crib-window) A part's geometry split in two: the triangles whose three corners lie inside one of `boxes` ([x0, y0, z0, x1, y1, z1],
 * the plan's frame) in `split`, the rest in `main` (both carry a white `color` attribute for the batch's vertex-colour material).
 * The awning is cut out of the shell this way and drawn casting no shadow, so the porch under it is sunlit. */
export function cribGeometrySplit(part, boxes) {
  const g = cribGeometry(part), pos = g.attributes.position, idx = g.index.array, a = [], s = [];
  const inBox = i => { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); return boxes.some(B => x >= B[0] && x <= B[3] && y >= B[1] && y <= B[4] && z >= B[2] && z <= B[5]); };
  for (let t = 0; t < idx.length; t += 3) (inBox(idx[t]) && inBox(idx[t + 1]) && inBox(idx[t + 2]) ? s : a).push(idx[t], idx[t + 1], idx[t + 2]);
  const make = list => {
    const o = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) o.setAttribute(k, g.attributes[k]);
    o.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
    o.setIndex(pos.count > 65535 ? new THREE.Uint32BufferAttribute(list, 1) : new THREE.Uint16BufferAttribute(list, 1));
    o.userData.sheet = true;
    return o;
  };
  return { main: make(a), split: make(s), tris: s.length / 3 };
}

const geos = new Map(), mats = new Map();
/** A part's geometry (the plan's frame, metres), cached. */
export function cribGeometry(part) {
  let g = geos.get(part);
  if (g) return g;
  const P = DATA.parts[part], [ox, oy, oz] = DATA.origin || [0, 0, 0], n = P.pos.length / 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = P.pos[i * 3] / 1000 + ox; pos[i * 3 + 1] = P.pos[i * 3 + 1] / 1000 + oy; pos[i * 3 + 2] = P.pos[i * 3 + 2] / 1000 + oz;
    nor[i * 3] = P.nor[i * 3] / 100; nor[i * 3 + 1] = P.nor[i * 3 + 1] / 100; nor[i * 3 + 2] = P.nor[i * 3 + 2] / 100;
    uv[i * 2] = P.uv[i * 2] / 4096; uv[i * 2 + 1] = P.uv[i * 2 + 1] / 4096;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
  g.userData.sheet = true;   // (texture-sweep) the baked sheet's own uv layout: batch.js keeps it (every other piece in the batch gets zero uvs)
  geos.set(part, g);
  return g;
}
/** A part's material: the baked sheet under the game's toon steps, vertex colours on (the batch's own pieces keep theirs). */
export function cribMaterial(part) {
  let m = mats.get(part);
  if (m) return m;
  const tex = new THREE.TextureLoader().load(DATA.parts[part].tex);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, gradientMap: GRADIENT_3, vertexColors: true });
  m.name = 'crib-model-' + part;
  mats.set(part, m);
  return m;
}
