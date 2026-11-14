// Two rowboats at the dock (Andrew, 2026-11-08: "put a rowboat or 2 in. Don't crowd the dock though"). Decor for now: no
// rowing. The model is the Blender dock rowboat (assets/blender/props-boats.blend `prop_boat_rowboat`, built by
// scripts/build_boats.py, exported by scripts/export_boats.py to public/models/boats.json): one hull, three skins as vertex
// colours (the palette with a soft baked AO and top light), 1,238 triangles. Every boat shares the positions, normals and
// index; each skin is its own colour buffer; one material draws them all, under the ink pass like the rest of the world.
//
// Where they lie is layout.js ROWBOATS: the Lake Blue one tied along the pier's south side by the shore (clear of Kevin's
// sailboat on the north side, the boards and the pier's end where he fishes), the Butter Yellow one riding on the red buoy
// off the pier. They bob like Kevin's boat (kevin-day.js BOB) with a little roll and pitch, each on its own phase. If the
// model does not load, a plain code-built rowboat takes its place.
import * as THREE from 'three';
import { GEO } from './batch.js';
import { toon } from './toon.js';
import { ROWBOATS } from './layout.js';
import { view } from './perf-flags.js';

let DATA = null;
/** Fetch the boats once, before the world is built (main.js). The dock builds code-made boats if this fails. */
export async function loadBoatModels() {
  try { const r = await fetch('/models/boats.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.shapes || !DATA.shapes.rowboat) DATA = null;
  return !!DATA;
}
export const boatModelsReady = () => !!DATA;
/** (props-vehicles) Kevin's sailboat from the same file: { parts: { body, sail, furl, tiller, glass, bulb, moor }, anchors } or null (kevin-boat.js). */
export const kevinBoatModel = () => (DATA && DATA.kevin && DATA.kevin.parts && DATA.kevin.parts.body ? DATA.kevin : null);
/** The boats' one material (toon, vertex colours, the soft ramp). */
export const boatMaterial = () => material();
/** A geometry from an exported part { pos, nor, col (sRGB bytes), idx }: metres, unit normals, linear colours. */
export function boatPartGeometry(P) {
  const lin = new Float32Array(P.col.length), c = new THREE.Color();
  for (let i = 0; i < lin.length; i += 3) { c.setRGB(P.col[i] / 255, P.col[i + 1] / 255, P.col[i + 2] / 255, THREE.SRGBColorSpace); lin[i] = c.r; lin[i + 1] = c.g; lin[i + 2] = c.b; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(lin, 3));
  g.setIndex(P.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
  g.computeBoundingSphere();
  return g;
}

// the hull's numbers (build_boats.py ROW; the export's bounds say the same): half-length, half-beam, the bow ring
export const ROW = { HL: 1.65, HB: 0.7, KEEL: -0.15, SHEER: 0.4, FLOOR_Y: 0.08, RING: [0, 0.42, 1.7] };   // (FLOOR_Y: the top of her floor boards)
export const ROW_BOB = (t, phase) => 0.05 * Math.sin(t * 1.3 + phase);   // (a touch less than Kevin's: a lighter boat on a calmer berth)

// A softer toon ramp than toon.js's: the shading is already baked into the vertex colours, so the cel steps only nudge it
// (the Blender mailboxes' SOFT_STEPS).
const SOFT_STEPS = (() => {
  const t = new THREE.DataTexture(new Uint8Array([168, 214, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
let MAT = null;
const material = () => MAT || (MAT = Object.assign(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: SOFT_STEPS }), { name: 'rowboats' }));

const geos = new Map();
function skinGeometry(key) {
  let g = geos.get(key);
  if (g) return g;
  const S = DATA.shapes.rowboat;
  let shared = geos.get('');
  if (!shared) {
    shared = { pos: new THREE.Float32BufferAttribute(S.pos, 3), nor: new THREE.Float32BufferAttribute(S.nor, 3), idx: new THREE.Uint16BufferAttribute(S.idx, 1) };
    geos.set('', shared);
  }
  const skin = S.skins.find(s => s.key === key) || S.skins[0];
  const lin = new Float32Array(skin.col.length), c = new THREE.Color();
  for (let i = 0; i < lin.length; i += 3) { c.setRGB(skin.col[i] / 255, skin.col[i + 1] / 255, skin.col[i + 2] / 255, THREE.SRGBColorSpace); lin[i] = c.r; lin[i + 1] = c.g; lin[i + 2] = c.b; }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', shared.pos); g.setAttribute('normal', shared.nor); g.setAttribute('color', new THREE.BufferAttribute(lin, 3));
  g.setIndex(shared.idx);
  g.computeBoundingSphere();
  geos.set(key, g);
  return g;
}

// The fallback: a plain rowboat from a half sphere, a rim, two thwarts (only if the model did not load).
const FALLBACK_HULL = { lake: '#2f5da8', pine: '#4f7d44', butter: '#f2c94c' };
function fallbackBoat(key) {
  const boat = new THREE.Group();
  const hull = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const out = new THREE.Mesh(hull, toon(FALLBACK_HULL[key] || FALLBACK_HULL.lake)); out.scale.set(ROW.HB, ROW.SHEER - ROW.KEEL, ROW.HL); out.position.y = ROW.SHEER;
  const inn = new THREE.Mesh(hull, toon('#f3e6c8', { side: 'double' })); inn.scale.set(ROW.HB - 0.05, ROW.SHEER - ROW.KEEL - 0.06, ROW.HL - 0.05); inn.position.y = ROW.SHEER + 0.01;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 5, 24), toon('#7a5234')); rim.scale.set(ROW.HB, ROW.HL, 1); rim.rotation.x = Math.PI / 2; rim.position.y = ROW.SHEER;
  boat.add(out, inn, rim);
  for (const z of [-0.95, 0.05]) { const s = new THREE.Mesh(GEO.box, toon('#b98a5a')); s.scale.set(ROW.HB * 1.7, 0.06, 0.3); s.position.set(0, 0.31, z); boat.add(s); }
  return boat;
}

// A rope from a to b with a little sag, two straight pieces into the dock's batch (static: the boat's bob is a few cm).
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function rope(b, from, to, sag = 0.12) {
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - sag, (from[2] + to[2]) / 2];
  for (const [p, q] of [[from, mid], [mid, to]]) {
    _a.set(...p); _b.set(...q); _d.subVectors(_b, _a);
    const len = _d.length();
    _q.setFromUnitVectors(_up, _d.normalize());
    _m.compose(_a.add(_b).multiplyScalar(0.5), _q, _s.set(0.022, len + 0.02, 0.022));
    b.add(GEO.cyl6, '#d9c7a0', { matrix: _m });
  }
}
// a boat-local point (lx, ly, lz) in the world, for a boat at B
const toWorld = (B, lx, ly, lz) => [B.x + lx * Math.cos(B.yaw) + lz * Math.sin(B.yaw), ly, B.z - lx * Math.sin(B.yaw) + lz * Math.cos(B.yaw)];

/** Is (x, z) inside a rowboat's footprint (plus margin)? Pure, from layout.js (fish-water.js: no bobber lands in a boat). */
export function inRowboat(x, z, margin = 0.3) {
  for (const B of ROWBOATS) {
    const dx = x - B.x, dz = z - B.z, c = Math.cos(B.yaw), s = Math.sin(B.yaw);
    if (Math.abs(dx * c - dz * s) < ROW.HB + margin && Math.abs(dx * s + dz * c) < ROW.HL + margin) return true;
  }
  return false;
}

const BOATS = [];
/** The rowboats as built: [{ key, group, x, z, yaw, phase, model }] (tests). */
export const rowboats = () => BOATS;

/** Build the rowboats into the dock (dock.js): the boats, their lines and their colliders. */
export function buildRowboats({ b, group, colliders, updaters }) {
  BOATS.length = 0;
  const model = !!DATA;
  for (const B of ROWBOATS) {
    const boat = new THREE.Group(); boat.name = 'rowboat-' + B.skin;
    if (model) {
      const mesh = new THREE.Mesh(skinGeometry(B.skin), material());
      mesh.name = 'rowboat'; boat.add(mesh);
    } else boat.add(fallbackBoat(B.skin));
    boat.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    boat.position.set(B.x, 0, B.z); boat.rotation.set(0, B.yaw, 0, 'YXZ');
    group.add(boat);
    // the painter: from the bow ring to the post (a piling's side) or the buoy
    rope(b, toWorld(B, ...ROW.RING), B.tie, B.sag ?? 0.12);
    // solid, so you can't step off the pier into her and a swimmer bumps her: a box when she lies along an axis, else five
    // circles along her length (close enough that nobody squeezes between them)
    const sn = Math.abs(Math.sin(B.yaw)), cs = Math.abs(Math.cos(B.yaw));
    if (sn > 0.999 || cs > 0.999) {
      const hx = sn > 0.999 ? ROW.HL : ROW.HB, hz = sn > 0.999 ? ROW.HB : ROW.HL;
      colliders.push({ type: 'box', minX: B.x - hx, maxX: B.x + hx, minZ: B.z - hz, maxZ: B.z + hz });
    } else for (let k = -2; k <= 2; k++) {
      const [cx, , cz] = toWorld(B, 0, 0, (k / 2) * (ROW.HL - ROW.HB));
      colliders.push({ type: 'circle', x: cx, z: cz, r: ROW.HB });
    }
    BOATS.push({ key: B.skin, group: boat, x: B.x, z: B.z, yaw: B.yaw, phase: B.phase, model });
  }
  const FAR2 = 110 * 110;   // past this they are a few pixels: not drawn at all (the town and the game store never pay for them)
  updaters.push((dt, t) => {
    const cam = view.camera;
    for (const o of BOATS) {
      const g = o.group;
      g.visible = !cam || (cam.position.x - o.x) ** 2 + (cam.position.z - o.z) ** 2 < FAR2;
      if (!g.visible) continue;
      g.position.y = ROW_BOB(t, o.phase);
      g.rotation.x = Math.sin(t * 0.9 + o.phase) * 0.012;          // pitch
      g.rotation.z = Math.sin(t * 1.1 + o.phase * 1.7) * 0.02;     // roll
    }
  });
  return BOATS;
}
