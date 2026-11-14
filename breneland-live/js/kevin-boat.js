// Kevin's sailboat, big enough for three to go out fishing, built at that size rather than scaled so the outlines and cel bands
// keep their weight: a round-bilged hull with a shaped foredeck, a cockpit floor, three seats (Kevin's in the stern at the tiller,
// a thwart and a bow seat for the crew), a rod holder at every seat, a cooler, a beer can on Kevin's seat, a tall mast with a sail
// that unfurls from the boom (up while sailing, furled at anchor), a rudder and tiller, a lantern on a pole at the stern that lights
// the water round the boat at night, and fenders and a mooring line at the pier. Plus his "Gone fishing 7pm-11pm" sign at the head
// of the pier.
//
// Where it all is comes from kevin-day.js (a pure function of the shared clock, BOAT and BOAT_SEATS are the numbers). dock.js
// builds it (buildKevinBoat). npcs.js steps it every frame with the shared time (kevinFrame) before it places Kevin, and dresses
// Kevin and his companion for what they're doing (kevinDress, crewDress).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { toon, shadows } from './toon.js';
import { GEO } from './batch.js';
import { LIGHT, lampGlow } from './daynight-mats.js';
import { signTexture } from './areas.js';
import { terrainHeight } from './terrain.js';
import { kevinState, MOOR, SIGN, BOAT, BOAT_SEATS, BOB, RIDE } from './kevin-day.js';
import { buildApron, buildTools, buildToolbox, buildPlank, buildHelmet } from './kevin-props.js';
import { kevinBoatModel, boatMaterial, boatPartGeometry } from './rowboats.js';
import { vehicleAnchor } from './vehicle-models.js';   // (town-fixes) his hands on the cruiser's grips   // (props-vehicles) the Blender sailboat from boats.json, when loaded

// the hull: half-length, half-beam, the sheer (gunwale height above the water), the depth of the bilge
const { HL, HB, SHEER, DEPTH } = BOAT;
const halfBeam = s => (s < 0.62 ? HB * (0.84 + 0.16 * Math.sin((s / 0.62) * Math.PI / 2)) : HB * Math.sqrt(Math.max(0, 1 - ((s - 0.62) / 0.38) ** 2)));
const sheer = s => SHEER + 0.22 * ((s - 0.45) / 0.55) ** 2;               // rises toward bow and stern
const depth = s => DEPTH * (s < 0.7 ? 1 : 1 - 0.55 * ((s - 0.7) / 0.3));
const sOf = z => (z + HL) / (2 * HL);
// the hull's half-width at height y over the water at station s (the inside face; for fitting seats and decks)
function widthAt(s, y) {
  const c = Math.min(1, Math.max(0, (sheer(s) - y) / depth(s))) ** (1 / 1.35), sn = Math.sqrt(Math.max(0, 1 - c * c));
  return halfBeam(s) * sn ** 0.75;
}

function hullGeometry() {
  const M = 30, N = 14, pos = [], idx = [];
  for (let i = 0; i <= M; i++) {
    const s = i / M, z = -HL + s * 2 * HL, w = halfBeam(s), top = sheer(s), d = depth(s);
    for (let j = 0; j <= N; j++) {
      const th = -Math.PI / 2 + (j / N) * Math.PI, sn = Math.sin(th), cs = Math.cos(th);
      pos.push(w * Math.sign(sn) * Math.abs(sn) ** 0.75, top - d * Math.abs(cs) ** 1.35, z);
    }
  }
  for (let i = 0; i < M; i++) for (let j = 0; j < N; j++) {
    const a = i * (N + 1) + j, b = a + N + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the flat transom across the stern, a fan from its middle
function transomGeometry() {
  const N = 14, s = 0, w = halfBeam(s), top = sheer(s), d = depth(s), pos = [0, top - d * 0.5, -HL], idx = [];
  for (let j = 0; j <= N; j++) {
    const th = -Math.PI / 2 + (j / N) * Math.PI, sn = Math.sin(th), cs = Math.cos(th);
    pos.push(w * Math.sign(sn) * Math.abs(sn) ** 0.75, top - d * Math.abs(cs) ** 1.35, -HL);
    if (j) idx.push(0, j + 1, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the gunwale rail on one side, a tube along the sheer
function railGeometry(side) {
  const pts = [];
  for (let i = 0; i <= 20; i++) { const s = i / 20; pts.push(new THREE.Vector3(side * halfBeam(s), sheer(s) + 0.025, -HL + s * 2 * HL)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.055, 6, false);
}
// the foredeck: a plank floor shaped to the bow, from z0 forward to the stem, `t` thick
function foredeckGeometry(z0, t) {
  const sh = new THREE.Shape(), steps = 10;
  const pt = (k, side) => { const z = z0 + (HL - z0) * k, s = sOf(z); return [side * Math.max(0.02, halfBeam(s) - 0.04), z]; };
  const first = pt(0, 1); sh.moveTo(first[0], -first[1]);
  for (let i = 1; i <= steps; i++) { const p = pt(i / steps, 1); sh.lineTo(p[0], -p[1]); }
  for (let i = steps; i >= 0; i--) { const p = pt(i / steps, -1); sh.lineTo(p[0], -p[1]); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);   // the shape's y (= -z) lies along the boat; the extrusion goes up
  return g;
}
// a soft round pool of lantern light on the water (painted by hand, no canvas filters)
function poolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,214,140,0.9)'); r.addColorStop(0.35, 'rgba(255,200,120,0.45)'); r.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const BOATO = { obj: null };
// Merge the direct mesh children of `g` (except `keep`) into one mesh per material, in g's frame.
function mergeStatic(g, keep) {
  const groups = new Map();
  for (const m of [...g.children]) {
    if (!m.isMesh || keep.has(m)) continue;
    m.updateMatrix();
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(m.matrix);
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(geo);
    g.remove(m);
  }
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    geos.forEach(x => x.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat); mesh.name = 'kevin-boat-part';
    g.add(mesh);
  }
}
// the hull's footprint in its own frame (the tests compare it with the old 4.7 x 1.84 m boat)
export const BOAT_BOUNDS = { length: 2 * HL, beam: 2 * HB, height: SHEER + 0.22 };

// The pieces both builds share: the lantern's pool of light on the water, the rod resting in a holder by seat i (hidden until its
// owner's hands are busy), the beer can on Kevin's seat, the "Gone fishing" sign at the head of the pier, the berth's collider.
function sharedBits(boat, group, colliders, { holders = true } = {}) {
  const F = BOAT.FLOOR, woodD = toon('#7a5234');
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, parent = boat) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true }));
  pool.rotation.x = -Math.PI / 2; pool.scale.setScalar(15); pool.name = 'kevin-boat-light'; pool.renderOrder = 2;
  group.add(pool);
  const rodRests = BOAT_SEATS.map((S) => {
    const z = S.z + 0.35, s = sOf(z), x = S.side * (halfBeam(s) - 0.1), y = sheer(s) - 0.06;
    if (holders) add(GEO.cyl8, woodD, x, y, z, 0.06, 0.3, 0.06, -0.35, 0, -0.25 * S.side);
    const rest = new THREE.Group(); rest.position.set(x, y - 0.08, z); rest.rotation.set(-0.45, 0, -0.3 * S.side); boat.add(rest);
    add(GEO.cyl6, toon('#6b4a2b'), 0, 1.0, 0, 0.018, 2.2, 0.018, 0, 0, 0, rest);
    add(GEO.cyl8, toon('#3a3f47'), 0, 0.2, 0.04, 0.05, 0.08, 0.05, Math.PI / 2, 0, 0, rest);   // the reel
    rest.visible = false;
    return rest;
  });
  const can = new THREE.Group(); can.position.set(0.5, F + BOAT_SEATS[0].seat + 0.07, BOAT_SEATS[0].z); boat.add(can);
  add(GEO.cyl12, toon('#3f8fd9'), 0, 0, 0, 0.034, 0.12, 0.034, 0, 0, 0, can);
  add(GEO.cyl12, toon('#c9ced4'), 0, 0.063, 0, 0.03, 0.008, 0.03, 0, 0, 0, can);
  // solid while tied up at the pier (she lies along x; it stops at the pier's edge so the boards stay walkable)
  const ax = Math.abs(Math.sin(MOOR.yaw)) > 0.5;
  const col = ax ? { type: 'box', minX: MOOR.x - HL - 0.15, maxX: MOOR.x + HL + 0.15, minZ: MOOR.z - HB, maxZ: MOOR.z + HB }
    : { type: 'box', minX: MOOR.x - HB, maxX: MOOR.x + HB, minZ: MOOR.z - HL - 0.15, maxZ: MOOR.z + HL + 0.15 };
  colliders.push(col);
  // "Gone fishing 7pm-11pm": an A-frame board he stands up at the head of the pier
  const sign = new THREE.Group(); sign.name = 'kevin-sign';
  const sy = terrainHeight(SIGN.x, SIGN.z);
  sign.position.set(SIGN.x, sy, SIGN.z); sign.rotation.y = SIGN.yaw;
  const face = new THREE.MeshBasicMaterial({ map: signTexture(['GONE FISHING', '7pm-11pm'], { bg: '#f3e6c8', fg: '#7a3b2a', w: 256, h: 192 }), fog: true });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.rotation.x = -s * 0.24; leaf.position.y = 0.92; sign.add(leaf);
    const board = new THREE.Mesh(GEO.box, woodD); board.scale.set(0.7, 0.92, 0.04); board.position.set(0, -0.46, s * 0.025); leaf.add(board);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62 * 0.75), face); pic.position.set(0, -0.36, s * 0.05); pic.rotation.y = s > 0 ? 0 : Math.PI; leaf.add(pic);
  }
  sign.visible = false; shadows(sign); group.add(sign);
  const signCol = { type: 'circle', x: SIGN.x, z: SIGN.z, r: 0.4, off: true };
  colliders.push(signCol);
  return { pool, rodRests, can, col, sign, signCol };
}

// (props-vehicles) The Blender sailboat (assets/blender/props-boats.blend `prop_boat_kevin`, build_boats.py; boats.json `kevin`): the
// hull with everything fixed to it one mesh, the sail on its boom (scaled up to unfurl), the furled bundle with its ties (slimmer
// as the sail goes up), the tiller on the rudder head, the lantern's glass (swapped to its glow at night) and bulb, the fenders
// and mooring lines shown while she is tied up. Her seats are where BOAT_SEATS say (the model was built to them).
function buildFromModel(KM, { group, colliders }) {
  const boat = new THREE.Group(); boat.name = 'kevin-boat';
  const mat = boatMaterial(), P = KM.parts;
  const mesh = (key, parent = boat) => { const m = new THREE.Mesh(boatPartGeometry(P[key]), mat); m.name = 'kevin-boat-' + key; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const pivotGroup = key => { const g = new THREE.Group(); const p = P[key].pivot; g.position.set(p[0], p[1], p[2]); boat.add(g); mesh(key, g); return g; };
  const hullMesh = mesh('body');
  const sail = pivotGroup('sail'), furl = pivotGroup('furl'), tiller = pivotGroup('tiller');
  sail.children[0].castShadow = false; sail.children[0].receiveShadow = false;
  const glass = mesh('glass'), glassOff = mat, glassOn = lampGlow('#ffd98e');
  if (P.bulb) mesh('bulb');
  const moorBits = mesh('moor');
  const S = sharedBits(boat, group, colliders, { holders: false });   // (the rod holders are in the model)
  group.add(shadows(boat, true, true));
  boat.position.set(MOOR.x, 0, MOOR.z); boat.rotation.y = MOOR.yaw;
  BOATO.obj = { boat, hull: hullMesh, sail, furl, ties: [], glass, glassOn, glassOff, pool: S.pool, can: S.can, rodRests: S.rodRests, moorBits, col: S.col, sign: S.sign, signCol: S.signCol, tiller, last: null, crewRod: [false, false, false], model: true };
  return BOATO.obj;
}

export function buildKevinBoat({ group, colliders }) {
  const KM = kevinBoatModel();
  if (KM) return buildFromModel(KM, { group, colliders });
  const boat = new THREE.Group(); boat.name = 'kevin-boat';
  const red = toon('#d9483f'), wood = toon('#b98a5a'), woodD = toon('#7a5234');
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, parent = boat) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
  const hull = hullGeometry();
  const hullMesh = add(hull, red, 0, 0, 0);                  // outside: red
  const inner = add(hull, toon('#f3e6c8', { side: 'double' }), 0, 0, 0); inner.scale.set(0.975, 0.99, 0.99); // inside: cream
  add(transomGeometry(), toon('#d9483f', { side: 'double' }), 0, 0, 0.005);
  for (const s of [-1, 1]) add(railGeometry(s), woodD, 0, 0, 0);
  // a white stripe along the topsides, just under the rail
  for (const s of [-1, 1]) { const st = add(railGeometry(s), toon('#fff4dc'), 0, -0.13, 0); st.scale.set(1.004, 1, 0.995); }
  const F = BOAT.FLOOR;
  // the cockpit floor (planks) from the stern seat to the foredeck
  const fz0 = -HL + 0.45, fz1 = 1.95, fw = 2 * widthAt(sOf(-1), F) - 0.25;
  add(GEO.box, wood, 0, F - 0.025, (fz0 + fz1) / 2, Math.min(2.3, fw), 0.05, fz1 - fz0);
  for (let i = -3; i <= 3; i++) add(GEO.box, woodD, i * 0.3, F + 0.004, (fz0 + fz1) / 2, 0.035, 0.012, fz1 - fz0 - 0.04);
  // the three seats, each fitted to the hull at its station, on two legs
  const seat = (z, depthZ, inset) => {
    const y = F + BOAT_SEATS[0].seat - 0.03, w = 2 * (widthAt(sOf(z), y) - inset);
    add(GEO.box, wood, 0, y, z, w, 0.07, depthZ);
    add(GEO.box, woodD, 0, y - 0.045, z, w - 0.1, 0.03, depthZ * 0.5);
    for (const s of [-1, 1]) add(GEO.box, woodD, s * w * 0.3, F + (y - F) / 2, z, 0.07, y - F, depthZ * 0.75);
    return w;
  };
  seat(BOAT_SEATS[0].z, 0.5, 0.08);   // Kevin's, in the stern
  seat(BOAT_SEATS[1].z, 0.42, 0.06);  // the thwart
  seat(BOAT_SEATS[2].z, 0.42, 0.08);  // the bow seat
  // the foredeck, shaped to the bow, with its edge
  const DZ = 1.95, dy = sheer(sOf(DZ)) - 0.07;
  add(foredeckGeometry(DZ, 0.06), wood, 0, dy, 0);
  add(GEO.box, woodD, 0, dy + 0.05, DZ, 2 * halfBeam(sOf(DZ)) - 0.1, 0.09, 0.09);
  // the mast through the foredeck, the boom, the sail and its furled bundle
  const MZ = 2.5, MAST_H = 7.4, BOOM_Y = F + 2.45, BOOM_END = -HL + 0.65;
  add(GEO.cyl8, woodD, 0, F + MAST_H / 2, MZ, 0.085, MAST_H, 0.085);
  add(GEO.cyl8, woodD, 0, BOOM_Y, (MZ + BOOM_END) / 2, 0.06, MZ - BOOM_END, 0.06, Math.PI / 2);
  add(GEO.box, woodD, 0, F + MAST_H + 0.06, MZ, 0.16, 0.13, 0.16);               // the masthead
  add(GEO.box, woodD, 0, BOOM_Y, MZ, 0.16, 0.12, 0.16);                          // the gooseneck
  const LUFF = MAST_H - 2.75, FOOT = MZ - BOOM_END - 0.15;
  const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, LUFF), new THREE.Vector2(FOOT, 0)]);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), toon('#fbf6e8', { side: 'double' }));
  sail.rotation.y = -Math.PI / 2; sail.position.set(0.012, BOOM_Y + 0.04, MZ - 0.07); boat.add(sail);
  const band = (y0, y1) => new THREE.Shape([new THREE.Vector2(0, y0), new THREE.Vector2(0, y1), new THREE.Vector2(FOOT * (1 - y1 / LUFF), y1), new THREE.Vector2(FOOT * (1 - y0 / LUFF), y0)]);
  const stripe = new THREE.Mesh(new THREE.ShapeGeometry(band(0.95, 1.45)), toon('#d9483f', { side: 'double' }));
  stripe.position.z = 0.003; sail.add(stripe);
  const furl = add(GEO.cyl8, toon('#efe6cf'), 0, BOOM_Y + 0.08, (MZ + BOOM_END) / 2 - 0.15, 0.09, MZ - BOOM_END - 0.6, 0.1, Math.PI / 2);
  for (const z of [1.6, 0.2, -1.2, -2.6]) add(GEO.cyl6, toon('#b5532f'), 0, BOOM_Y + 0.08, z, 0.11, 0.04, 0.12, Math.PI / 2).userData.tie = true; // the ties round the furled sail
  const ties = boat.children.filter(o => o.userData.tie);
  // the stays from the masthead to the bow and the quarters (thin dark lines)
  const stay = (x1, y1, z1) => { const a = new THREE.Vector3(0, F + MAST_H, MZ), b = new THREE.Vector3(x1, y1, z1), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b); const m = add(GEO.cyl6, toon('#3a3f47'), mid.x, mid.y, mid.z, 0.012, len, 0.012); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); };
  stay(0, sheer(1) - 0.02, HL - 0.1);
  for (const s of [-1, 1]) stay(s * (halfBeam(sOf(MZ - 0.9)) - 0.05), sheer(sOf(MZ - 0.9)), MZ - 0.9);
  // rudder and tiller (the tiller reaches forward to Kevin's hand on the stern seat)
  add(GEO.box, woodD, 0, F - 0.2, -HL - 0.08, 0.08, 1.25, 0.6);
  const tiller = new THREE.Group(); tiller.position.set(0, sheer(0) + 0.06, -HL - 0.04); boat.add(tiller);
  add(GEO.cyl8, woodD, 0, 0, 0.75, 0.04, 1.5, 0.04, Math.PI / 2 - 0.2, 0, 0, tiller); // (down to Kevin's hand on the lower seat: seat-height)
  // the cooler (blue, white lid) on the floor in front of Kevin, to his right
  add(GEO.box, toon('#3f7fc9'), 0.62, F + 0.2, -2.55, 0.64, 0.38, 0.44);
  add(GEO.box, toon('#f4f2ea'), 0.62, F + 0.42, -2.55, 0.67, 0.07, 0.47);
  for (const s of [-1, 1]) add(GEO.box, toon('#2b3a52'), 0.62 + s * 0.33, F + 0.3, -2.55, 0.04, 0.05, 0.2);
  // a rod holder on the gunwale by every seat, and a rod resting in it while its owner's hands are busy
  const rodRests = BOAT_SEATS.map((S, i) => {
    const z = S.z + 0.35, s = sOf(z), x = S.side * (halfBeam(s) - 0.1), y = sheer(s) - 0.06;
    add(GEO.cyl8, woodD, x, y, z, 0.06, 0.3, 0.06, -0.35, 0, -0.25 * S.side);
    const rest = new THREE.Group(); rest.position.set(x, y - 0.08, z); rest.rotation.set(-0.45, 0, -0.3 * S.side); boat.add(rest);
    add(GEO.cyl6, toon('#6b4a2b'), 0, 1.0, 0, 0.018, 2.2, 0.018, 0, 0, 0, rest);
    add(GEO.cyl8, toon('#3a3f47'), 0, 0.2, 0.04, 0.05, 0.08, 0.05, Math.PI / 2, 0, 0, rest);   // the reel
    rest.visible = false;
    return rest;
  });
  // the beer can on Kevin's seat beside him
  const can = new THREE.Group(); can.position.set(0.5, F + BOAT_SEATS[0].seat + 0.07, BOAT_SEATS[0].z); boat.add(can);
  add(GEO.cyl12, toon('#3f8fd9'), 0, 0, 0, 0.034, 0.12, 0.034, 0, 0, 0, can);
  add(GEO.cyl12, toon('#c9ced4'), 0, 0.063, 0, 0.03, 0.008, 0.03, 0, 0, 0, can);
  // the lantern on a pole at the stern (port side), and its pool of light on the water
  const LX = -(halfBeam(0.06) - 0.18), LZ = -HL + 0.55, LY = sheer(0.06);
  add(GEO.cyl6, woodD, LX, LY + 0.85, LZ, 0.035, 1.75, 0.035);
  add(GEO.box, woodD, LX, LY + 1.7, LZ + 0.15, 0.04, 0.04, 0.34);
  add(GEO.cone6, toon('#3a3f47'), LX, LY + 1.6, LZ + 0.3, 0.15, 0.1, 0.15);
  const glassOff = toon('#e8dfc4'), glassOn = lampGlow('#ffd98e');
  const glass = add(GEO.box, glassOff, LX, LY + 1.45, LZ + 0.3, 0.17, 0.22, 0.17);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true }));
  pool.rotation.x = -Math.PI / 2; pool.scale.setScalar(15); pool.name = 'kevin-boat-light'; pool.renderOrder = 2;
  group.add(pool);
  // fenders over the pier side (+x when she lies bow to the shore) and a mooring line, only while tied up
  const moorBits = new THREE.Group(); boat.add(moorBits);
  for (const z of [-2.6, -0.2, 2.2]) add(GEO.cyl8, toon('#f4f2ea'), halfBeam(sOf(z)) + 0.05, sheer(sOf(z)) - 0.3, z, 0.1, 0.38, 0.1, 0, 0, 0, moorBits);
  add(GEO.cyl6, toon('#d9c7a0'), HB * 0.55, sheer(0.92) + 0.22, HL - 0.55, 0.022, 1.5, 0.022, 0.75, 0, -0.85, moorBits);
  add(GEO.cyl6, toon('#d9c7a0'), HB * 0.75, sheer(0.06) + 0.22, -HL + 0.6, 0.022, 1.3, 0.022, -0.6, 0, -0.85, moorBits);
  // the parts that never change are merged into one mesh per material (a dozen draws instead of seventy-odd, in every pass)
  mergeStatic(boat, new Set([hullMesh, sail, furl, glass, ...ties]));
  boat.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  sail.castShadow = false; stripe.castShadow = false; sail.receiveShadow = false; stripe.receiveShadow = false;
  group.add(shadows(boat, true, true));
  boat.position.set(MOOR.x, 0, MOOR.z); boat.rotation.y = MOOR.yaw;
  // solid while tied up at the pier (she lies along x; it stops at the pier's edge so the boards stay walkable)
  const ax = Math.abs(Math.sin(MOOR.yaw)) > 0.5;
  const col = ax ? { type: 'box', minX: MOOR.x - HL - 0.15, maxX: MOOR.x + HL + 0.15, minZ: MOOR.z - HB, maxZ: MOOR.z + HB }
    : { type: 'box', minX: MOOR.x - HB, maxX: MOOR.x + HB, minZ: MOOR.z - HL - 0.15, maxZ: MOOR.z + HL + 0.15 };
  colliders.push(col);

  // "Gone fishing 7pm-11pm": an A-frame board he stands up at the head of the pier
  const sign = new THREE.Group(); sign.name = 'kevin-sign';
  const sy = terrainHeight(SIGN.x, SIGN.z);
  sign.position.set(SIGN.x, sy, SIGN.z); sign.rotation.y = SIGN.yaw;
  const face = new THREE.MeshBasicMaterial({ map: signTexture(['GONE FISHING', '7pm-11pm'], { bg: '#f3e6c8', fg: '#7a3b2a', w: 256, h: 192 }), fog: true });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.rotation.x = -s * 0.24; leaf.position.y = 0.92; sign.add(leaf);
    const board = new THREE.Mesh(GEO.box, woodD); board.scale.set(0.7, 0.92, 0.04); board.position.set(0, -0.46, s * 0.025); leaf.add(board);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62 * 0.75), face); pic.position.set(0, -0.36, s * 0.05); pic.rotation.y = s > 0 ? 0 : Math.PI; leaf.add(pic);
  }
  sign.visible = false; shadows(sign); group.add(sign);
  const signCol = { type: 'circle', x: SIGN.x, z: SIGN.z, r: 0.4, off: true };
  colliders.push(signCol);

  BOATO.obj = { boat, hull: hullMesh, sail, furl, ties, glass, glassOn, glassOff, pool, can, rodRests, moorBits, col, sign, signCol, tiller, last: null, crewRod: [false, false, false] };
  return BOATO.obj;
}
// the boat's parts (tests, kevin-crew.js)
export function kevinBoatObj() { return BOATO.obj; }
// the companion's rod in the holder at seat i (npcs.js: crewDress)
export function setCrewRod(i, on) { if (BOATO.obj) BOATO.obj.crewRod[i] = !!on; }

// Every frame, with the shared time (npcs.update): put the boat, its sail, lantern and props where the day says.
export function kevinFrame(dt, t, audio) {
  const o = BOATO.obj;
  if (!o) return null;
  const s = kevinState(t);
  if (audio) sounds(o, s, t, audio);
  const B = s ? s.boat : null, out = !!(B && B.out);
  const x = B ? B.x : MOOR.x, z = B ? B.z : MOOR.z, yaw = B ? B.yaw : MOOR.yaw;
  o.boat.position.set(x, BOB(t), z);
  o.boat.rotation.set(Math.sin(t * 0.9) * 0.01, yaw, Math.sin(t * 1.1) * (B && B.speed ? 0.03 : 0.013));
  const sail = B ? B.sail : 0;
  o.sail.visible = sail > 0.03; o.sail.scale.set(1, Math.max(0.03, sail), 1);
  o.furl.visible = sail < 0.97;
  if (o.model) { const k = 1 - sail * 0.6; o.furl.scale.set(k, k, 1); }   // (the Blender bundle lies along z: slimmer round it)
  else o.furl.scale.set(0.09 * (1 - sail * 0.6), o.furl.scale.y, 0.1 * (1 - sail * 0.6));
  for (const tie of o.ties) tie.visible = sail < 0.2;
  o.tiller.rotation.y = B && B.speed ? Math.sin(t * 0.6) * 0.18 : 0;
  o.moorBits.visible = !B || B.moored;
  o.col.off = !!(B && !B.moored);
  // the lantern: lit for his evening out, a pool of warm light on the water after dark
  o.glass.material = out ? o.glassOn : o.glassOff;
  const night = LIGHT.night || 0;
  o.pool.visible = out && night > 0.05;
  if (o.pool.visible) { o.pool.position.set(x, 0.03, z); o.pool.material.opacity = 0.55 * night; }
  // the props: Kevin's beer on his seat, his rod in the holder while his hands are busy, the companion's rod likewise
  const inBoat = !!(s && s.inBoat);
  o.can.visible = inBoat && s.beer === 'bench';
  o.rodRests[0].visible = inBoat && s.rod === 'holder';
  o.rodRests[1].visible = false;   // players keep their own rods in their hands
  o.rodRests[2].visible = out && o.crewRod[2];
  o.sign.visible = !!(s && s.sign); o.signCol.off = !o.sign.visible;
  o.last = s;
  return s;
}

// The dock's sounds of his day (positional: you hear them near him): the sail hauled up and let down, the boat
// creaking at anchor, a beer opened, the broom in the morning.
function sounds(o, s, t, audio) {
  const B = s && s.boat, last = o.snd || (o.snd = { sail: 0, beer: 'cooler', creak: 0, sweep: 0 });
  const sail = B ? B.sail : 0, bx = B ? B.x : MOOR.x, bz = B ? B.z : MOOR.z;
  if (sail > 0.04 && last.sail <= 0.04) audio.play?.('sail-up', bx, 3.5, bz);
  if (sail < 0.96 && last.sail >= 0.96) audio.play?.('sail-down', bx, 3.5, bz);
  last.sail = sail;
  const beer = s ? s.beer : 'cooler';
  if (beer === 'hand' && last.beer === 'cooler' && s) audio.play?.('can-open', s.x, 1.2, s.z);
  last.beer = beer;
  if (B && B.out && !B.speed && t - last.creak > 7) { last.creak = t + Math.random() * 4; audio.play?.('boat-creak', bx, 0.6, bz); }
  if (s && s.broom && t - last.sweep > 0.85) { last.sweep = t; audio.play?.('sweep', s.x, 0.3, s.z); }
}

// Dress Kevin for what he is doing (s = his state this frame; null fields = the pier defaults).
const canGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 12);
export function kevinDress(body, s) {
  if (!body || !body.handR) return;
  const p = body.__kev || (body.__kev = makeProps(body));
  const rod = s && s.rod ? s.rod : 'hand';
  body.setHeld?.(rod === 'hand' ? 'rod' : null);
  p.can.visible = !!(s && s.beer === 'hand');
  p.broom.visible = !!(s && s.broom);
  if (p.tackle) p.tackle.visible = !!(s && s.tackle);
  body.params.seatY = s && s.seatY ? s.seatY / (body.root.scale.y || 1) : 0;
  // the shop and the odd jobs (kevin-props.js): the apron over his own clothes, a tool, the toolbox, boards on his shoulder
  const apron = !!(s && s.apron), tool = (s && s.tool) || null;
  if (apron || p.apron) {
    const A = p.apron || (p.apron = buildApron(body));
    A.bib.visible = A.skirt.visible = apron;
    if (apron) { const a = Math.min(0, body.legL?.hip.rotation.x ?? 0, body.legR?.hip.rotation.x ?? 0); A.skirt.rotation.x = a * 0.85; } // (swings out ahead of a stepping thigh)
  }
  if (tool || p.tools) { const T = p.tools || (p.tools = buildTools(body)); for (const k in T) T[k].visible = k === tool; }
  if (s && s.toolbox && !p.toolbox) p.toolbox = buildToolbox(body);
  if (p.toolbox) p.toolbox.visible = !!(s && s.toolbox);
  if (s && s.plank && !p.plank) p.plank = buildPlank(body);
  if (p.plank) p.plank.visible = !!(s && s.plank);
  // (crib-move) the Sunday ride: his helmet on, and on the bike his root stands on its floorboards, RIDE.lift over the road
  if (s && s.helmet && !p.helmet) p.helmet = buildHelmet(body);
  if (p.helmet) p.helmet.visible = !!(s && s.helmet);
  if (s && s.onBike) {
    body.root.position.y += RIDE.lift;
    // (town-fixes) where his hands hold the bars, in his root's frame (metres: x left, y up from the floorboards, z forward): the
    // model's hand_L anchor (the code-built bike's bars are the same) from his seat behind the bike's middle; the 'ride' pose
    // puts his hands there by IK
    if (!body.rideGrip) { const g = vehicleAnchor('moto', 'hand_L') || [0.41, 1.17, 0.27]; body.rideGrip = [Math.abs(g[0]), g[1] - RIDE.lift, g[2] - RIDE.seat]; }
  }
}
// The companion: seated in the boat (the legs sit), a rod in hand while fishing, its rod in the holder otherwise.
export function crewDress(body, s, seat = 2) {
  if (!body || !body.params) return;
  const aboard = !!(s && s.inBoat);
  const held = aboard && s.rod === 'hand';
  if (body.__crewHeld !== held) { body.__crewHeld = held; body.setHeld?.(held ? 'rod' : null); }
  setCrewRod(seat, aboard && s.rod === 'holder');
  body.params.seatY = aboard && s.seatY ? s.seatY / (body.root.scale.y || 1) : 0;
}
function makeProps(body) {
  const can = new THREE.Group();
  const c = new THREE.Mesh(canGeo, toon('#f2c230')); c.castShadow = true; can.add(c);
  const top = new THREE.Mesh(GEO.cyl12, toon('#c9ced4')); top.scale.set(0.058, 0.01, 0.058); top.position.y = 0.112; can.add(top);
  can.position.set(0, -0.08, 0); can.visible = false; can.userData.upright = true; // upright in the fist whatever the arm does (human.js; the drink pose tips it to his mouth)
  body.handR.add(can);
  const broom = new THREE.Group();
  const stick = new THREE.Mesh(GEO.cyl6, toon('#b98a5a')); stick.scale.set(0.02, 1.25, 0.02); stick.position.y = -0.35; broom.add(stick);
  const head = new THREE.Mesh(GEO.box, toon('#d8b45a')); head.scale.set(0.34, 0.16, 0.08); head.position.y = -0.98; broom.add(head);
  broom.rotation.x = 0.35; broom.visible = false; broom.userData.upright = true; // (stands on its head whatever the arm does, with this lean)
  broom.traverse(o => { if (o.isMesh) o.castShadow = true; });
  body.handR.add(broom);
  // his tackle box, carried in the left hand on the evening wander (green, a brass catch, a handle)
  let tackle = null;
  if (body.handL) {
    tackle = new THREE.Group();
    const box = new THREE.Mesh(GEO.box, toon('#3f7a4f')); box.scale.set(0.12, 0.2, 0.34); box.position.y = -0.2; tackle.add(box);
    const lid = new THREE.Mesh(GEO.box, toon('#2f5d3c')); lid.scale.set(0.13, 0.04, 0.35); lid.position.y = -0.09; tackle.add(lid);
    const catchB = new THREE.Mesh(GEO.box, toon('#d8b45a')); catchB.scale.set(0.135, 0.04, 0.05); catchB.position.y = -0.13; tackle.add(catchB);
    const handle = new THREE.Mesh(GEO.box, toon('#2b2340')); handle.scale.set(0.03, 0.06, 0.14); handle.position.y = -0.04; tackle.add(handle);
    tackle.traverse(o => { if (o.isMesh) o.castShadow = true; });
    tackle.visible = false; tackle.userData.upright = 'hang';
    body.handL.add(tackle);
  }
  return { can, broom, tackle };
}
