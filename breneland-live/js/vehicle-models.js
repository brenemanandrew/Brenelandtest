// The Blender vehicles (props-vehicles, 2026-11-08): the five cars, the Route 7 bus, Joyce's golf cart and Kevin's cruiser, from
// assets/blender/props-vehicles.blend (build_vehicles.py + build_vehicles_2.py, exported by export_vehicles.py) as
// public/models/vehicles.json. One fetch at boot (main.js, before the world is built); if it fails every vehicle is the
// code-built one as before (car-models.js, bus-model.js, joyce-cart.js, crib-clutter.js keep those as the fallback).
//
// Each shape is parts in car-models.js's format, so cars.js, buddy-carol.js and addCarModel drive the models unchanged:
//   body   the car-colour faces: their vertex colour is the baked light alone (grey), the Batcher tints it with the skin
//   fixed  everything else, palette colour x light baked into the vertex colours
//   glass  the windows (the game lights them as glass), lamp_<name> each lamp alone round its anchor (cars.js colours and glows by name)
//   wheel_L / wheel_R  one wheel per side round its axle; `wheels` says where the four go
// Axes are the game's: y up, the nose +z, +x the left (driver's) side, the tyres on y = 0. The file keeps positions in mm,
// normals in hundredths and colours as sRGB bytes; the geometries here are metres, unit normals and linear colours.
import * as THREE from 'three';
import { toon } from './toon.js';

let DATA = null;
/** Fetch the vehicles once, before the world is built (main.js). Everything builds its code-made vehicle if this fails. */
export async function loadVehicleModels() {
  try { const r = await fetch('/models/vehicles.json'); if (r.ok) DATA = await r.json(); } catch { DATA = null; }
  if (!DATA || !DATA.shapes) DATA = null;
  return !!DATA;
}
export const vehicleModelsReady = () => !!DATA;
/** The shape's data (parts, wheels, anchors, wheelR, axles) or null when the model is not loaded or has no such shape. */
export const vehicleShape = kind => (DATA && DATA.shapes[kind]) || null;
/** An anchor's position [x, y, z] in the vehicle's frame (seats, hands, the wheel...), or null. */
export const vehicleAnchor = (kind, name) => { const S = vehicleShape(kind); return S && S.anchors[name] ? S.anchors[name].pos : null; };

// one toon material (vertex colours, the game's cel ramp) for every vehicle mesh built here; the Batcher's own is the same
export const VEHICLE_MAT = () => toon('#ffffff', { vertexColors: true });

const geos = new Map();
const _c = new THREE.Color();
/** The geometry of one part (cached): position, normal, a linear-float colour attribute and an index. */
export function partGeometry(kind, name) {
  const key = kind + ':' + name;
  let g = geos.get(key);
  if (g) return g;
  const P = vehicleShape(kind)?.parts[name];
  if (!P) return null;
  const n = P.pos.length / 3, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) { pos[i] = P.pos[i] / 1000; nor[i] = P.nor[i] / 100; }
  for (let i = 0; i < n; i++) {
    _c.setRGB(P.col[i * 3] / 255, P.col[i * 3 + 1] / 255, P.col[i * 3 + 2] / 255, THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
  g.computeBoundingSphere();
  geos.set(key, g);
  return g;
}

const formatCache = new Map();
/** The shape as car-models.js parts: { kind, parts: [{ geo, color, o, lamp?, glass?, wheel?, az? }], wheelR, axles, spec }. */
export function carFormatParts(kind) {
  let out = formatCache.get(kind);
  if (out) return out;
  const S = vehicleShape(kind);
  if (!S) return null;
  const parts = [];
  for (const name of Object.keys(S.parts)) {
    const P = S.parts[name], geo = partGeometry(kind, name);
    if (P.kind === 'wheel') continue;
    if (P.kind === 'body') parts.push({ geo, color: 'body', o: {} });
    else if (P.kind === 'glass') parts.push({ geo, color: '#ffffff', o: {}, glass: true });
    else if (P.kind === 'lamp') { const a = S.anchors[name].pos; parts.push({ geo, color: '#ffffff', o: { x: a[0], y: a[1], z: a[2] }, lamp: name.slice(5) }); }
    else parts.push({ geo, color: '#ffffff', o: {} });
  }
  for (const w of S.wheels) parts.push({ geo: partGeometry(kind, w.geo), color: '#ffffff', o: { x: w.x }, wheel: w.axle, az: S.axles[w.axle] });
  out = { kind, parts, wheelR: S.wheelR, axles: S.axles.slice(), spec: { L: S.length, W: S.width }, model: true };
  formatCache.set(kind, out);
  return out;
}

/** One mesh of the parts whose names pass `pick` (default: every fixed and body part), in the vehicle's frame. */
export function partsMesh(kind, pick = null, mat = VEHICLE_MAT()) {
  const S = vehicleShape(kind);
  if (!S) return null;
  const names = Object.keys(S.parts).filter(n => (pick ? pick(n, S.parts[n]) : S.parts[n].kind === 'fixed' || S.parts[n].kind === 'body'));
  if (!names.length) return null;
  let geo;
  if (names.length === 1) geo = partGeometry(kind, names[0]);
  else {
    // merged by hand (the parts share the attribute layout): the lamps of a shape, say, as one mesh
    let nv = 0, ni = 0;
    const gs = names.map(n => partGeometry(kind, n));
    for (const g of gs) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, k = 0;
    for (const g of gs) {
      pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); col.set(g.attributes.color.array, v * 3);
      const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[k++] = ix[i] + v;
      v += g.attributes.position.count;
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** The wheels as groups a vehicle can turn: [{ steer, roll, front }], steer at the axle, roll the wheel mesh (joyce-cart.js's shape). */
export function wheelGroups(kind, parent, mat = VEHICLE_MAT()) {
  const S = vehicleShape(kind), out = [];
  if (!S) return out;
  for (const w of S.wheels) {
    const steer = new THREE.Group();
    if (w.pos) steer.position.set(w.pos[0], w.pos[1], w.pos[2]); else steer.position.set(w.x, S.wheelR, S.axles[w.axle]);
    const roll = new THREE.Mesh(partGeometry(kind, w.geo), mat); roll.castShadow = true; roll.receiveShadow = false;
    steer.add(roll); parent.add(steer);
    out.push({ steer, roll, front: w.axle === 0 });
  }
  return out;
}
