// The static Blender props (props-static, Andrew 2026-11-08: "I want the rest of this deployed asap"): the street lamps, the
// lanterns, the stop signs' poles, the planters, the benches, the porch swing, the picnic tables, Summit Square's shelter and the
// Strickler Park community board, modelled in Blender (assets/blender/props-{lights,seating,park}.blend, built by the
// blender-props piece's scripts) and exported by scripts/export_props.py + tools/props-static-merge.mjs to public/models/props.json.
//
// Each shape is vertex-coloured (the palette x a soft baked AO and top light), so a prop goes into the caller's own Batcher with
// the shared vertex-colour toon material (batch.js's: a `vertexColors` batch draws it in the same call as its boxes) and its glass
// with the caller's lamp glow material: no new draw calls. Seats, colliders and night spots stay the caller's (the code's numbers);
// the anchors (light, faces, seats) are here for placing and for the tests. If the JSON does not load, every caller builds its old
// code-made prop instead (`propsReady()` false).
import * as THREE from 'three';
import { toon } from './toon.js';
import { lampGlow } from './daynight-mats.js';

let DATA = null;
/** Fetch the props once, before the world is built (main.js boot). The callers build their old props if this fails. */
export async function loadStaticProps() {
  try { const r = await fetch('/models/props.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.shapes) DATA = null;
  return !!DATA;
}
/** Is the model of `shape` here (any shape when none is named)? */
export const propsReady = (shape) => !!DATA && (!shape || !!DATA.shapes[shape]);
export const propShape = (shape) => (DATA && DATA.shapes[shape]) || null;

// batch.js's vertex-colour material (toon() caches it): a prop in a vertexColors batch shares its draw call
const VC = () => toon('#ffffff', { vertexColors: true });

const geos = new Map();
function partGeometry(shape, pname, skin) {
  const key = shape + '|' + pname + '|' + (skin || '');
  let g = geos.get(key);
  if (g) return g;
  const P = DATA.shapes[shape].parts[pname];
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.pos.length / 3 * 2), 2)); // (no texture: zero UVs, so it merges with the boxes)
  if (P.skins) {
    const src = P.skins[skin] || Object.values(P.skins)[0], lin = new Float32Array(src.length), c = new THREE.Color();
    for (let i = 0; i < lin.length; i += 3) { c.setRGB(src[i] / 255, src[i + 1] / 255, src[i + 2] / 255, THREE.SRGBColorSpace); lin[i] = c.r; lin[i + 1] = c.g; lin[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(lin, 3));
  }
  g.setIndex(P.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
  geos.set(key, g);
  return g;
}

/** How many of each shape went in, and where (the tests). */
export const PLACED = {}, PLACEMENTS = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** A point given in a shape's own space, for a prop at (x, y, z) turned yaw (scaled s): [x, y, z] in the world. */
export function propPoint(p, { x = 0, y = 0, z = 0, yaw = 0, s = 1, sx = 0 }) {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  const px = p[0] * (sx || s);
  return [x + (px * c + p[2] * s * n), y + p[1] * s, z + (-px * n + p[2] * s * c)];
}
/** A shape's anchor (light_anchor, face_front, seat_0, ...) in the world for a prop placed with `at`. */
export function propAnchor(shape, name, at) {
  const a = propShape(shape)?.anchors[name];
  return a ? propPoint(a.pos, at) : null;
}

/**
 * Put one prop into a Batcher. `at`: { x, y (the ground it stands on), z, yaw (its +z front turned to (sin yaw, cos yaw)), s, sx
 * (its length alone: a shorter bench keeps its seat height) }.
 * opts: skin (the shape's skin key), glow (a Material for its glass; default the lamp glow of its light anchor's colour, or false
 * for none), glowB (another Batcher, or { add(geo, mat, o) }, for the glass), skip (part names to leave out), only (the parts to use).
 * Returns the matrix's `at` with an `anchor(name)` helper.
 */
export function addProp(b, shape, at, { skin = null, glow = null, glowB = null, skip = null, only = null } = {}) {
  const S = DATA.shapes[shape];
  _e.set(0, at.yaw || 0, 0, 'YXZ'); _q.setFromEuler(_e); _p.set(at.x, at.y || 0, at.z); _s.set(at.sx || at.s || 1, at.s || 1, at.s || 1);
  _m.compose(_p, _q, _s);
  for (const pname of Object.keys(S.parts)) {
    if ((skip && skip.includes(pname)) || (only && !only.includes(pname))) continue;
    const isGlow = !S.parts[pname].skins;
    if (isGlow) {
      if (glow === false) continue;
      const mat = glow || lampGlow(S.anchors.light_anchor?.glow || '#fff3c4');
      (glowB || b).add(partGeometry(shape, pname), mat, { matrix: _m });
    } else b.add(partGeometry(shape, pname, skin), VC(), { matrix: _m });
  }
  PLACED[shape] = (PLACED[shape] || 0) + 1;
  PLACEMENTS.push({ shape, skin, x: at.x, y: at.y || 0, z: at.z, yaw: at.yaw || 0, s: at.s || 1, sx: at.sx || 0 });
  return { ...at, anchor: (name) => propAnchor(shape, name, at) };
}

/** One part of a shape as its own Mesh (a live, moving prop: the porch swing's seat), with the shared vertex-colour material. */
export function propMesh(shape, pname, skin = null) {
  const m = new THREE.Mesh(partGeometry(shape, pname, skin), VC());
  m.name = shape + '-' + pname; m.castShadow = true; m.receiveShadow = true;
  PLACED[shape] = (PLACED[shape] || 0) + 1;
  return m;
}
