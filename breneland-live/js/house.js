// The player's house: Andrew's 1990s single-storey ranch, an amalgam of his old house and the Breneland house (the mockups,
// docs/refs/w3c-house-reference.html and w3c-living-room-reference.html, turned 180 degrees into our axes: the front door faces
// north, the garage is on the viewer's right from the lawn, i.e. west). Red brick across the front with dark green shutters and
// white trim, a red front door with sidelights, light green lap siding over a brick crawl-space skirt on the sides and back, a
// steep (about 10/12) side-gable roof of dark architectural shingles, a gabled front porch on white square columns with white
// railings, a concrete floor on a brick base and steps to the lawn (the porch swing and the two dog beds are their own features),
// the two-car garage attached on the west (brick in front, its own front gable with a vent, a roll-up door), a brick chimney on
// the back wall behind the living room's fireplace, the deck off the living room toward the beach, and the air conditioner on
// the west side behind the garage.
//
// Every number comes from layout.js (HOUSE, GARAGE, PORCH, STEPS, DECK, CHIMNEY, HVAC, HOUSE_PLAN). The inside (the rooms, the
// living room, the kitchen, the garage's contents) is house-inside.js. main-house.js is the feature (the doors, the camera inside,
// the bed's log-off). buildHouse(parent) -> { group, ext, inside, door, hallLight, colliders, setDoor, update, ... } (main.js).
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { HOUSE, PORCH, STEPS, GARAGE, DECK, CHIMNEY, HVAC, HOUSE_PLAN } from './layout.js';
import { toon, glow, shadows, soft, redrawWhenFontsLoad, LAYER_SOFT, LAYER_WORLD } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { windowGlass, lampGlow, addNightSpot, GLASS } from './daynight-mats.js';
import { realGlass, glassUniforms } from './real-glass.js';
import { addSurface } from './terrain.js';
import { artMat, brick, siding, shingle, worldUV, TILE } from './house-art.js';
import { hash01 } from './util.js';
import { buildInside } from './house-inside.js';
import { LIVING_GLASS } from './living-light.js';

export const COL = {
  trim: '#f4f2ec', shutter: '#2e4a37', door: '#8a2a22', doorPanel: '#741f19', brass: '#d9b04a', bronze: '#3b2a20',
  concrete: '#ddd7cb', concrete2: '#c4bdb0', mulch: '#5a3a26', shrub: '#3f7a35', shrub2: '#4d8a3f', garage: '#f1efe8',
  deck: '#a87a50', deck2: '#946a44', deckDark: '#6e4c30', soffit: '#eeebe3', dark: '#2a2c2d', metal: '#a7acae', drywall: '#e6e1d6',
  vent: '#f4f2ec', hvac: '#b8bab4', bead: '#f2efe6', pot: '#b25a36',
};
const T = 0.2; // the outer walls' thickness
const F = HOUSE.floorY, EAVE = HOUSE.eaveY, PITCH = HOUSE.pitch, OH = 0.45;
const GF = GARAGE.floorY;

// a face of a wall: axis 'x' = the wall runs along x at z = at (out = which way is outside, +1 or -1); axis 'z' runs along z at x = at
const FACE = {
  N: { axis: 'x', at: HOUSE.minZ, out: -1 }, S: { axis: 'x', at: HOUSE.maxZ, out: 1 },
  W: { axis: 'z', at: HOUSE.minX, out: -1 }, E: { axis: 'z', at: HOUSE.maxX, out: 1 },
  GN: { axis: 'x', at: GARAGE.minZ, out: -1 }, GS: { axis: 'x', at: GARAGE.maxZ, out: 1 }, GW: { axis: 'z', at: GARAGE.minX, out: -1 },
};
// a box laid on a face: `a` along it, `o` out from its outer plane (negative: into the wall), sizes along / up / out
export function fbox(b, f, a, y, o, sa, sy, so, mat) {
  if (f.axis === 'x') b.add(GEO.box, mat, { x: a, y, z: f.at + f.out * o, sx: sa, sy, sz: so });
  else b.add(GEO.box, mat, { x: f.at + f.out * o, y, z: a, sx: so, sy, sz: sa });
}
// cut a wall's rectangle (a0..a1 along, y0..y1) round its holes ({ a0, a1, y0, y1 }): the pieces left, as [a0, a1, y0, y1]
export function cutRect(a0, a1, y0, y1, holes) {
  const hs = holes.filter(h => h.a1 > a0 && h.a0 < a1).sort((p, q) => p.a0 - q.a0), out = [];
  let a = a0;
  for (const h of hs) {
    if (h.a0 > a) out.push([a, h.a0, y0, y1]);
    if (h.y0 > y0) out.push([Math.max(a0, h.a0), Math.min(a1, h.a1), y0, Math.min(y1, h.y0)]);
    if (h.y1 < y1) out.push([Math.max(a0, h.a0), Math.min(a1, h.a1), Math.max(y0, h.y1), y1]);
    a = Math.max(a, h.a1);
  }
  if (a < a1) out.push([a, a1, y0, y1]);
  return out;
}
// the colliders of a wall along a face from a0 to a1 (`t` thick inward from `at`), open where a hole reaches the floor
export function wallColliders(f, a0, a1, t, holes, floorY, list, extra = {}) {
  const gaps = holes.filter(h => h.y0 <= floorY + 0.15 && !h.solid).sort((p, q) => p.a0 - q.a0);
  let a = a0;
  const push = (p, q) => {
    if (q - p < 0.02) return;
    const lo = f.at, hi = f.at - f.out * t, mn = Math.min(lo, hi), mx = Math.max(lo, hi);
    list.push(f.axis === 'x' ? { type: 'box', minX: p, maxX: q, minZ: mn, maxZ: mx, house: true, ...extra } : { type: 'box', minX: mn, maxX: mx, minZ: p, maxZ: q, house: true, ...extra });
  };
  for (const h of gaps) { push(a, h.a0); a = Math.max(a, h.a1); }
  push(a, a1);
}

// The windows of the house: face, centre along the face, width, sill and head heights; `sh` = shutters (every front window);
// `tall` = the living room's floor-to-head window onto the deck. house-inside.js reads them for the inside (glass and sills).
export const WINDOWS = [
  { f: 'N', a: -8.3, w: 0.7, y0: F + 1.0, y1: F + 2.15, sh: true, room: 'laundry' },
  { f: 'N', a: -5.9, w: 1.2, y0: F + 1.0, y1: F + 2.15, sh: true, room: 'kitchen' },
  { f: 'N', a: -2.9, w: 1.05, y0: F + 0.7, y1: F + 2.2, sh: true, room: 'living' },
  { f: 'N', a: 3.2, w: 0.7, y0: F + 1.25, y1: F + 2.15, sh: true, room: 'bath' },
  { f: 'N', a: 6.4, w: 1.3, y0: F + 0.75, y1: F + 2.2, sh: true, room: 'bed2' },
  { f: 'E', a: -2.2, w: 1.1, y0: F + 0.85, y1: F + 2.15, room: 'bed2' },
  { f: 'E', a: 0, w: 0.55, y0: F + 1.0, y1: F + 2.0, room: 'hall' },
  { f: 'E', a: 1.6, w: 0.6, y0: F + 1.3, y1: F + 2.1, room: 'mainbath' },
  { f: 'E', a: 4.1, w: 1.2, y0: F + 0.85, y1: F + 2.15, room: 'main' },
  { f: 'S', a: 3.5, w: 1.2, y0: F + 0.85, y1: F + 2.15, room: 'bed3' },
  { f: 'S', a: 0.55, w: 1.1, y0: F + 0.3, y1: F + 2.4, tall: true, room: 'living' },
  { f: 'S', a: -6.6, w: 1.6, y0: F + 0.85, y1: F + 2.15, room: 'dining' },
  { f: 'W', a: 4.3, w: 1.1, y0: F + 0.85, y1: F + 2.15, room: 'dining' },
];
// doors through the outer walls (floor-level holes): the front door with its sidelights, the deck's door, the garage's door in
export const DOORS = [
  { f: 'N', a0: -0.83, a1: 0.83, y0: F, y1: F + HOUSE.door.height + 0.02, id: 'front' },
  { f: 'S', a0: HOUSE_PLAN.slider.x - HOUSE_PLAN.slider.w / 2, a1: HOUSE_PLAN.slider.x + HOUSE_PLAN.slider.w / 2, y0: F, y1: F + 2.12, id: 'deck' },
  { f: 'W', a0: HOUSE_PLAN.houseDoor.z - HOUSE_PLAN.houseDoor.w / 2, a1: HOUSE_PLAN.houseDoor.z + HOUSE_PLAN.houseDoor.w / 2, y0: F, y1: F + 2.05, id: 'garage' },
];
const holesOf = f => [...WINDOWS.filter(w => w.f === f).map(w => ({ a0: w.a - w.w / 2, a1: w.a + w.w / 2, y0: w.y0, y1: w.y1 })), ...DOORS.filter(d => d.f === f)];

function makeSignTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = '#7a5234'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#8f643f';
    for (let y = 8; y < 128; y += 22) g.fillRect(0, y, 512, 3);
    g.strokeStyle = '#4a3020'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 118);
    g.fillStyle = '#fff4dc';
    g.font = '700 70px "Fredoka", "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
    tex.needsUpdate = true;
  };
  draw();
  redrawWhenFontsLoad(draw, ['700 70px "Fredoka"']);
  return tex;
}

// a thick triangle: the top face through three points (x, y, z), `t` thick straight down (a roof's valley piece)
function triPlate(pts, t) {
  const [a, b, c] = pts, v = [];
  const top = [a, b, c].map(p => [p[0], p[1] + 0.09, p[2]]), bot = [a, b, c].map(p => [p[0], p[1] + 0.09 - t, p[2]]);
  const tri = (p, q, r) => v.push(...p, ...q, ...r);
  // wind the top face upward
  const n = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  if (n < 0) { tri(top[0], top[1], top[2]); tri(bot[0], bot[2], bot[1]); } else { tri(top[0], top[2], top[1]); tri(bot[0], bot[1], bot[2]); }
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(top[i], bot[i], bot[j]); tri(top[i], bot[j], top[j]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  return g;
}
// a gable triangle (base w on y 0, peak h), `d` thick, centred, in the x-y plane
function gableGeo(w, h, d) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}
// An upright triangular prism: the triangle (x, z) x3 from y0 to y1, every face turned outward. A wall's corner block, where the
// front meets a side, is two of these split along its diagonal: the front's half carries the front's face and the side's half
// the side's. (Built as one wall's box running through the other, each face of the corner lay in a plane with the other wall's
// end, and brick and siding flashed in turn at the house's corners.)
function prism(pts, y0, y1) {
  const c = new THREE.Vector3((pts[0][0] + pts[1][0] + pts[2][0]) / 3, (y0 + y1) / 2, (pts[0][1] + pts[1][1] + pts[2][1]) / 3);
  const v = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  const tri = (a, b, d) => {
    A.set(...a); B.set(...b); C.set(...d);
    n.subVectors(B, A).cross(m.subVectors(C, A));
    m.copy(A).add(B).add(C).divideScalar(3).sub(c);
    if (n.dot(m) < 0) v.push(...a, ...d, ...b); else v.push(...a, ...b, ...d);
  };
  const P = (i, y) => [pts[i][0], y, pts[i][1]];
  tri(P(0, y0), P(1, y0), P(2, y0)); tri(P(0, y1), P(1, y1), P(2, y1));
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(P(i, y0), P(j, y0), P(j, y1)); tri(P(i, y0), P(j, y1), P(i, y1)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  return g;
}
// the two halves of a corner block: the outer corner (ox, oz), `t` thick, running in by (sx, sz) (+1 or -1) along x and z
const cornerHalves = (ox, oz, sx, sz, t) => [
  [[ox + sx * t, oz], [ox, oz], [ox + sx * t, oz + sz * t]],   // the front's half (its face along x at z = oz)
  [[ox, oz], [ox, oz + sz * t], [ox + sx * t, oz + sz * t]],   // the side's half (its face along z at x = ox)
];

// A moving part's pieces (a door leaf, its panels and knob) baked into one mesh per material: one draw call a door instead of a dozen.
function bakeGroup(g, cast = true, receive = true) {
  const b = new Batcher({ vertexColors: true, castShadow: cast, receiveShadow: receive });
  for (const m of g.children.filter(o => o.isMesh)) {
    m.updateMatrix();
    const mat = m.material, plain = mat.isMeshToonMaterial && !mat.map && !(mat.emissive && mat.emissive.getHex());
    b.add(m.geometry, plain ? '#' + mat.color.getHexString() : mat, { matrix: m.matrix });
    g.remove(m);
  }
  for (const m of b.build(g, g.name)) m.userData.noMerge = true;
}

export function buildHouse(parent) {
  const group = new THREE.Group(); group.name = 'house';
  const ext = new THREE.Group(); ext.name = 'house-ext'; group.add(ext);
  const b = new Batcher({ vertexColors: true });                    // trim, concrete, wood: one draw
  const d = new Batcher({ vertexColors: true, castShadow: false });  // thin trim on the soft layer (never inked: thin boards ink dashed)
  const bk = new Batcher(), sd = new Batcher(), sh = new Batcher();  // brick, siding, shingles (planar UVs in metres below)
  const glass = new Batcher({ castShadow: false });                  // the window panes (daynight lights them, see-through near)
  // every pane has a real room behind it: each of the town's glass materials (GLASS, daynight's waves of lit windows) gets a
  // see-through copy here (real-glass.js; main-house.js copies the hour's colours in and fades them by distance)
  const glassU = glassUniforms(), realMats = new Map();
  const realOf = m => { let r = realMats.get(m); if (!r) { r = realGlass(m, glassU, m === LIVING_GLASS ? 'house-glass-living' : 'house-glass-' + GLASS.indexOf(m)); r.userData.src = m; realMats.set(m, r); } return r; };
  const brickM = artMat('brick', brick), sidingM = artMat('siding', siding), shingleM = artMat('shingle', shingle);
  const colliders = [];
  const { minX, maxX, minZ, maxZ } = HOUSE;
  const cz = (minZ + maxZ) / 2, half = (maxZ - minZ) / 2, ANG = Math.atan(PITCH);
  const ridgeY = EAVE + half * PITCH;

  // ================================================================ the main body's walls
  // the front: brick from the ground to the eaves (its two corner blocks are split with the side walls: prism above)
  for (const [a0, a1, y0, y1] of cutRect(minX + T, maxX - T, 0.2, EAVE, holesOf('N'))) bk.boxMinMax(a0, y0, minZ, a1, y1, minZ + T, brickM);
  {
    const [fE, sE] = cornerHalves(maxX, minZ, -1, 1, T), [fW, sW] = cornerHalves(minX, minZ, 1, 1, T);
    bk.add(prism(fE, 0.2, EAVE), brickM); bk.add(prism(sE, 0.2, F), brickM); sd.add(prism(sE, F, EAVE), sidingM); // (east: the skirt, siding above)
    bk.add(prism(fW, 0.2, EAVE), brickM); b.add(prism(sW, 0.2, EAVE), COL.drywall);                              // (west: the garage's drywall)
  }
  // the sides and the back: a brick skirt to the floor, siding above (the west wall behind the garage is the garage's drywall)
  for (const f of ['S', 'E', 'W']) {
    const FA = FACE[f], along = FA.axis === 'x' ? [minX, maxX] : [minZ, maxZ], holes = holesOf(f);
    const put = (bat, mat, a0, a1, y0, y1) => {
      for (const [p, q, s, t] of cutRect(a0, a1, y0, y1, holes)) {
        if (FA.axis === 'x') bat.boxMinMax(p, s, FA.at - (FA.out > 0 ? T : 0), q, t, FA.at + (FA.out > 0 ? 0 : T), mat);
        else bat.boxMinMax(FA.at - (FA.out > 0 ? T : 0), s, p, FA.at + (FA.out > 0 ? 0 : T), t, q, mat);
      }
    };
    if (f === 'W') { // in the garage from its front to its back wall
      put(b, COL.drywall, minZ + T, GARAGE.maxZ, GF - 0.1, EAVE);
      b.boxMinMax(GARAGE.maxX - 0.215, GF, GARAGE.minZ + 0.15, GARAGE.maxX - 0.2, EAVE - 0.2, minZ, COL.drywall); // (the brick return's inside face)
      put(bk, brickM, GARAGE.maxZ, maxZ, 0.2, F); put(sd, sidingM, GARAGE.maxZ, maxZ, F, EAVE);
    } else { const a0 = f === 'E' ? minZ + T : along[0]; put(bk, brickM, a0, along[1], 0.2, F); put(sd, sidingM, a0, along[1], F, EAVE); } // (E: from behind the front's corner)
  }
  for (const f of ['N', 'S', 'E', 'W']) wallColliders(FACE[f], FACE[f].axis === 'x' ? minX : minZ, FACE[f].axis === 'x' ? maxX : maxZ, T, holesOf(f), F, colliders);
  // white corner boards and a frieze board under the eaves
  for (const [x, z] of [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]) {
    if (x === minX && z === minZ) continue; // (the garage meets that corner)
    d.boxMinMax(x - 0.08, 0.2, z - 0.08, x + 0.08, EAVE, z + 0.08, COL.trim);
  }
  d.boxMinMax(minX - 0.04, EAVE - 0.18, maxZ - 0.02, maxX + 0.04, EAVE, maxZ + 0.04, COL.trim);
  d.boxMinMax(maxX - 0.02, EAVE - 0.18, minZ, maxX + 0.04, EAVE, maxZ, COL.trim);
  d.boxMinMax(minX - 0.04, F - 0.05, maxZ, maxX + 0.04, F + 0.05, maxZ + 0.05, COL.trim); // the water table between brick and siding
  d.boxMinMax(maxX, F - 0.05, minZ, maxX + 0.05, F + 0.05, maxZ, COL.trim);

  // ================================================================ windows and doors from outside
  const winOut = w => {
    const f = FACE[w.f], h = w.y1 - w.y0, ym = (w.y0 + w.y1) / 2;
    fbox(glass, f, w.a, ym, -0.07, w.w, h, 0.02, realOf(w.room === 'living' ? LIVING_GLASS : windowGlass(hash01('housewin', w.a, w.f)))); // (the living room's follow its main light: living-light.js)
    // the head, the sill and the side casings stand on the wall's face, not 1-2 cm into it, where their edges lay in the planes of
    // the opening's own brick or siding and the two flashed in turn
    fbox(b, f, w.a, w.y1 + 0.06, 0.035, w.w + 0.26, 0.12, 0.07, COL.trim);          // the head
    fbox(b, f, w.a, w.y0 - 0.05, 0.0625, w.w + 0.3, 0.1, 0.125, COL.trim);          // the sill
    for (const s of [-1, 1]) fbox(d, f, w.a + s * (w.w / 2 + 0.05), ym, 0.0275, 0.1, h, 0.055, COL.trim);
    fbox(d, f, w.a, ym, -0.05, w.w, 0.05, 0.03, COL.trim);                            // the meeting rail
    if (w.w > 0.8) for (const k of [-1, 1]) fbox(d, f, w.a + k * w.w / 6, ym, -0.055, 0.035, h, 0.02, COL.trim); // the muntins
    else fbox(d, f, w.a, ym, -0.055, 0.035, h, 0.02, COL.trim);
    if (w.sh) for (const s of [-1, 1]) {
      const sw = Math.min(0.55, w.w * 0.45), sa = w.a + s * (w.w / 2 + 0.12 + sw / 2);
      fbox(b, f, sa, ym, 0.03, sw, h + 0.06, 0.05, COL.shutter);
      for (let i = 1; i < 6; i++) fbox(d, f, sa, w.y0 + (h * i) / 6, 0.06, sw * 0.8, 0.025, 0.02, '#24392b');
    }
  };
  WINDOWS.forEach(winOut);
  // the front door's frame and sidelights (the door itself swings: below)
  {
    const f = FACE.N, dh = F + HOUSE.door.height;
    for (const s of [-1, 1]) {
      fbox(glass, f, s * 0.67, F + 1.1, -0.08, 0.26, 1.8, 0.02, realOf(LIVING_GLASS)); // (into the living room)
      fbox(b, f, s * 0.67, F + 0.12, -0.02, 0.32, 0.24, 0.16, COL.trim);           // the sidelight's base panel
      fbox(d, f, s * 0.53, F + HOUSE.door.height / 2, 0.02, 0.06, HOUSE.door.height, 0.08, COL.trim);
      fbox(d, f, s * 0.86, F + HOUSE.door.height / 2, 0.03, 0.08, HOUSE.door.height + 0.04, 0.06, COL.trim);       // on the wall's face
    }
    fbox(b, f, 0, dh + 0.08, 0.03, 1.9, 0.16, 0.1, COL.trim);
    fbox(b, f, 0, dh + 0.24, 0.05, 2.0, 0.08, 0.14, COL.trim);
  }
  // the deck's door (a white French door, glass above a panel; it stays shut: you walk through its open leaf, main-house.js)
  {
    const f = FACE.S, s = HOUSE_PLAN.slider;
    fbox(b, f, s.x, F + 2.18, 0.05, s.w + 0.24, 0.14, 0.1, COL.trim);                                    // on the wall's face
    for (const k of [-1, 1]) fbox(d, f, s.x + k * (s.w / 2 + 0.05), F + 1.06, 0.0275, 0.1, 2.12, 0.055, COL.trim);
  }
  // the door from the garage (seen from the garage: a plain white door in a white frame, two concrete steps up to it)
  {
    const f = FACE.W, hd = HOUSE_PLAN.houseDoor;
    fbox(b, f, hd.z, F + 2.1, 0.035, hd.w + 0.2, 0.1, 0.07, COL.trim);                                   // on the wall's face
    for (const k of [-1, 1]) fbox(b, f, hd.z + k * (hd.w / 2 + 0.05), F + 1.02, 0.035, 0.1, 2.06, 0.07, COL.trim);
    for (let i = 0; i < 2; i++) { // (two steps up: 0.13 m risers from the garage floor to the house's)
      const top = GF + (F - GF) * (i + 1) / 3, x0 = minX - 0.62 + 0.31 * i;
      b.boxMinMax(x0, GF, hd.z - 0.6, minX, top, hd.z + 0.6, COL.concrete);
      addSurface({ minX: x0, maxX: minX, minZ: hd.z - 0.6, maxZ: hd.z + 0.6, y: top });
    }
    colliders.push({ type: 'box', minX: minX - 0.7, maxX: minX, minZ: hd.z - 0.75, maxZ: hd.z - 0.62, house: true }, { type: 'box', minX: minX - 0.7, maxX: minX, minZ: hd.z + 0.62, maxZ: hd.z + 0.75, house: true });
  }

  // ================================================================ the main roof: side gables, the ridge along x
  {
    const slope = (half + OH) / Math.cos(ANG), len = maxX - minX + 0.7, xc = (minX + maxX) / 2;
    for (const s of [-1, 1]) {
      sh.add(GEO.box, shingleM, { x: xc, y: ridgeY - Math.sin(ANG) * slope / 2 + 0.09, z: cz + s * Math.cos(ANG) * slope / 2, sx: len, sy: 0.16, sz: slope, rx: s * ANG });
      b.add(GEO.box, COL.trim, { x: xc, y: EAVE - OH * PITCH - 0.06, z: cz + s * (half + OH + 0.02), sx: len, sy: 0.22, sz: 0.06 });          // the fascia
      const sx0 = s < 0 ? minX : xc - (len - 0.1) / 2, sx1 = xc + (len - 0.1) / 2; // (the front's from the garage on: past it, it lay in the garage's attic on the return's back)
      d.add(GEO.box, COL.soffit, { x: (sx0 + sx1) / 2, y: EAVE - 0.06, z: cz + s * (half + OH / 2), sx: sx1 - sx0, sy: 0.04, sz: OH });     // the soffit
    }
    sh.add(GEO.box, shingleM, { x: xc, y: ridgeY + 0.2, z: cz, sx: len + 0.04, sy: 0.12, sz: 0.36 });                                        // the ridge cap
    for (const x of [minX, maxX]) {
      sd.add(gableGeo(maxZ - minZ, ridgeY - EAVE, T), sidingM, { x: x + (x > 0 ? -T / 2 : T / 2), y: EAVE, z: cz, ry: Math.PI / 2 });
      for (const s of [-1, 1]) b.add(GEO.box, COL.trim, { x: x + (x > 0 ? 0.33 : -0.33), y: ridgeY - Math.sin(ANG) * slope / 2 + 0.02, z: cz + s * Math.cos(ANG) * slope / 2, sx: 0.06, sy: 0.24, sz: slope, rx: s * ANG }); // the rakes
    }
    // a gable vent at each end
    for (const x of [minX, maxX]) { const o = x > 0 ? 1 : -1; b.add(GEO.box, COL.vent, { x: x + o * 0.03, y: EAVE + 2.3, z: cz, sx: 0.06, sy: 0.7, sz: 0.55 }); for (let i = 0; i < 4; i++) d.add(GEO.box, '#9a9890', { x: x + o * 0.065, y: EAVE + 2.06 + i * 0.15, z: cz, sx: 0.02, sy: 0.03, sz: 0.45 }); }
  }

  // ================================================================ the porch: a gable on four square columns, concrete on brick
  const P = PORCH, PE = P.ceilY + 0.2, PP = 0.7, phalf = (P.maxX - P.minX) / 2, pRidge = PE + phalf * PP, PANG = Math.atan(PP);
  {
    bk.boxMinMax(P.minX, 0.2, P.minZ, P.maxX, P.y - 0.06, minZ, brickM);                        // the brick base
    b.boxMinMax(P.minX - 0.05, P.y - 0.06, P.minZ - 0.05, P.maxX + 0.05, P.y, minZ, COL.concrete); // the slab's edge and floor
    for (let x = P.minX + 1.5; x < P.maxX; x += 1.5) d.boxMinMax(x - 0.01, P.y, P.minZ, x + 0.01, P.y + 0.004, minZ, COL.concrete2); // the control joints
    // the steps: two concrete treads (the lower one is layout STEPS, the upper one its own surface)
    const S = STEPS, upZ = (S.minZ + S.maxZ) / 2;
    b.boxMinMax(S.minX, 0.2, S.minZ, S.maxX, S.y, upZ, COL.concrete);
    b.boxMinMax(S.minX, 0.2, upZ, S.maxX, S.y + (P.y - S.y) / 2 + 0.02, S.maxZ, COL.concrete);
    addSurface({ minX: S.minX, maxX: S.maxX, minZ: upZ, maxZ: S.maxZ, y: S.y + (P.y - S.y) / 2 + 0.02 });
    for (const s of [-1, 1]) bk.boxMinMax(s > 0 ? S.maxX : S.minX - 0.25, 0.2, S.minZ + 0.2, s > 0 ? S.maxX + 0.25 : S.minX, P.y - 0.15, S.maxZ, brickM); // the cheek walls
    // the columns, the beam, the beadboard ceiling
    const colX = [P.minX + 0.16, -1.45, 1.45, P.maxX - 0.16], postZ = P.minZ + 0.16;
    for (const x of colX) {
      b.boxMinMax(x - 0.11, P.y, postZ - 0.11, x + 0.11, P.ceilY, postZ + 0.11, COL.trim);
      b.boxMinMax(x - 0.16, P.y, postZ - 0.16, x + 0.16, P.y + 0.14, postZ + 0.16, COL.trim);
      b.boxMinMax(x - 0.15, P.ceilY - 0.14, postZ - 0.15, x + 0.15, P.ceilY, postZ + 0.15, COL.trim);
      colliders.push({ type: 'box', minX: x - 0.17, maxX: x + 0.17, minZ: postZ - 0.17, maxZ: postZ + 0.17 });
    }
    b.boxMinMax(P.minX - 0.05, P.ceilY, P.minZ - 0.02, P.maxX + 0.05, PE, P.minZ + 0.3, COL.trim);     // the beam across the front
    for (const x of [P.minX, P.maxX - 0.14]) b.boxMinMax(x, P.ceilY, P.minZ, x + 0.14, PE, minZ, COL.trim); // the side beams
    b.boxMinMax(P.minX + 0.14, P.ceilY - 0.02, P.minZ + 0.2, P.maxX - 0.14, P.ceilY + 0.02, minZ, COL.bead); // (between the side beams: its ends lay in their faces)
    for (let x = P.minX + 0.2; x < P.maxX; x += 0.2) d.boxMinMax(x - 0.008, P.ceilY - 0.03, P.minZ + 0.25, x + 0.008, P.ceilY - 0.02, minZ, '#dcd8cc'); // the beadboard's lines
    // the railings: front either side of the steps, and both ends, white
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), alongX = Math.abs(x1 - x0) > 0.01, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      b.add(GEO.box, COL.trim, { x: mx, y: P.y + 0.92, z: mz, sx: alongX ? len : 0.1, sy: 0.07, sz: alongX ? 0.1 : len });
      b.add(GEO.box, COL.trim, { x: mx, y: P.y + 0.1, z: mz, sx: alongX ? len : 0.07, sy: 0.06, sz: alongX ? 0.07 : len });
      const n = Math.floor(len / 0.14);
      for (let i = 1; i < n; i++) { const t = i / n; b.add(GEO.box, COL.trim, { x: x0 + (x1 - x0) * t, y: P.y + 0.51, z: z0 + (z1 - z0) * t, sx: 0.045, sy: 0.76, sz: 0.045 }); }
      colliders.push(alongX ? { type: 'box', minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: mz - 0.08, maxZ: mz + 0.08, top: 1.0 } : { type: 'box', minX: mx - 0.08, maxX: mx + 0.08, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), top: 1.0 });
    };
    rail(colX[0] + 0.12, postZ, colX[1] - 0.12, postZ); rail(colX[2] + 0.12, postZ, colX[3] - 0.12, postZ);
    rail(colX[0], postZ + 0.12, colX[0], minZ - 0.02); rail(colX[3], postZ + 0.12, colX[3], minZ - 0.02);
    // the porch's roof: a front gable (a lower pitch than the house's, so it sits under the main ridge), its ridge on the door
    const pz0 = P.minZ - OH, pzBack = minZ + (pRidge - EAVE) / PITCH + 0.2; // (back to where it meets the main roof)
    const slope = (phalf + OH) / Math.cos(PANG);
    // the rakes stand 1 cm proud of the gable's end, the soffits stop 3 mm short of it, and the slab runs 3 mm into the wall to meet
    // the plate there (when the rakes' fronts, the soffits' ends and the valley plate's front shared a plane with the shingles' ends
    // and the brick, the roof's outside corners flashed)
    for (const s of [-1, 1]) {
      // the front part over the porch, with its overhang; behind the front wall a narrower part (it must not show under the rooms' ceilings)
      const lenF = minZ - pz0, lenS = lenF + 0.003;
      sh.add(GEO.box, shingleM, { x: s * Math.cos(PANG) * slope / 2, y: pRidge - Math.sin(PANG) * slope / 2 + 0.09, z: pz0 + lenS / 2, sx: slope, sy: 0.16, sz: lenS, rz: -s * PANG });
      // behind the front wall only the valley's triangle shows above the main roof: a triangular plate from the eave line to the ridge's end
      sh.add(triPlate([[0, pRidge, minZ + 0.003], [s * (phalf + 0.1), PE - 0.07, minZ + 0.003], [0, pRidge, pzBack]], 0.16), shingleM);
      b.add(GEO.box, COL.trim, { x: s * (phalf + OH + 0.02), y: PE - OH * PP - 0.06, z: pz0 + lenF / 2, sx: 0.06, sy: 0.2, sz: lenF });
      b.add(GEO.box, COL.trim, { x: s * Math.cos(PANG) * slope / 2, y: pRidge - Math.sin(PANG) * slope / 2 + 0.02, z: pz0 + 0.02, sx: slope, sy: 0.24, sz: 0.06, rz: -s * PANG }); // the rakes
      d.add(GEO.box, COL.soffit, { x: s * (phalf + OH / 2), y: PE - 0.05, z: pz0 + 0.003 + (lenF - 0.003) / 2, sx: OH, sy: 0.04, sz: lenF - 0.003 });
    }
    sh.add(GEO.box, shingleM, { x: 0, y: pRidge + 0.2, z: (pz0 + pzBack) / 2, sx: 0.34, sy: 0.12, sz: pzBack - pz0 });
    sd.add(gableGeo(P.maxX - P.minX, pRidge - PE, 0.14), sidingM, { x: 0, y: PE, z: P.minZ + 0.05 });
    d.boxMinMax(P.minX, PE - 0.02, P.minZ - 0.04, P.maxX, PE + 0.08, P.minZ + 0.02, COL.trim);
    // the porch light by the door, the ceiling fan, two planters by the steps, the welcome mat
    if (propsReady('wall_lantern')) addProp(b, 'wall_lantern', { x: 1.1, y: F + 1.9, z: minZ - 0.02, yaw: Math.PI }, { skin: 'porch_black', glow: lampGlow('#ffe7a8') }); // (props-static: the porch lantern on the wall by the door)
    else {
      b.boxMinMax(1.0, F + 1.75, minZ - 0.12, 1.2, F + 2.05, minZ - 0.02, COL.dark);
      b.boxMinMax(1.03, F + 1.8, minZ - 0.15, 1.17, F + 2.0, minZ - 0.05, lampGlow('#ffe7a8'));
    }
    addNightSpot({ x: 1.1, y: F + 1.9, z: minZ - 0.3, color: '#ffc978', pool: 2.8, gy: P.y, halo: 0.75 });
    b.add(GEO.cyl8, COL.bronze, { x: 0, y: P.ceilY - 0.18, z: -5.85, sx: 0.025, sy: 0.3, sz: 0.025 });
    b.add(GEO.cyl12, COL.bronze, { x: 0, y: P.ceilY - 0.38, z: -5.85, sx: 0.13, sy: 0.14, sz: 0.13 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; b.add(GEO.box, COL.bronze, { x: Math.cos(a) * 0.36, y: P.ceilY - 0.36, z: -5.85 + Math.sin(a) * 0.36, sx: 0.55, sy: 0.015, sz: 0.13, ry: -a }); }
    for (const x of [-1.05, 1.05]) { // by the columns either side of the steps, 0.6 m+ off the main trail's start
      if (propsReady('planter_pot')) addProp(b, 'planter_pot', { x, y: P.y, z: P.minZ + 0.65, yaw: Math.PI }, { skin: 'boxwood' }); // (props-static)
      else {
        b.add(GEO.cyl8, COL.pot, { x, y: P.y + 0.2, z: P.minZ + 0.65, sx: 0.2, sy: 0.4, sz: 0.2 });
        b.add(GEO.ico1, COL.shrub2, { x, y: P.y + 0.58, z: P.minZ + 0.65, sx: 0.28, sy: 0.3, sz: 0.28 });
      }
      colliders.push({ type: 'circle', x, z: P.minZ + 0.65, r: 0.26 });
    }
    b.boxMinMax(-0.55, P.y, -4.85, 0.55, P.y + 0.02, -4.2, '#6b5a3e');
  }

  // ================================================================ the garage: brick in front, siding round the side and back
  const G = GARAGE, GD = G.door, GT = 0.15, gcx = (G.minX + G.maxX) / 2, ghalf = (G.maxX - G.minX) / 2;
  const gRidge = EAVE + ghalf * PITCH;
  {
    const gN = cutRect(G.minX + GT, G.maxX, 0.2, EAVE, [{ a0: GD.minX, a1: GD.maxX, y0: 0, y1: GF + GD.height }]);
    for (const [a0, a1, y0, y1] of gN) bk.boxMinMax(a0, y0, G.minZ, a1, y1, G.minZ + GT, brickM);
    { const [fr, sw] = cornerHalves(G.minX, G.minZ, 1, 1, GT); bk.add(prism(fr, 0.2, EAVE), brickM); sd.add(prism(sw, 0.2, EAVE), sidingM); } // the corner
    bk.boxMinMax(G.maxX - 0.2, 0.2, G.minZ, G.maxX, EAVE, minZ, brickM);                           // the short return by the house's front
    const gwHoles = [{ a0: -2.1, a1: -1.2, y0: GF + 1.1, y1: GF + 2.2 }];
    for (const [a0, a1, y0, y1] of cutRect(G.minZ + GT, G.maxZ, 0.2, EAVE, gwHoles)) sd.boxMinMax(G.minX, y0, a0, G.minX + GT, y1, a1, sidingM);
    winOut({ f: 'GW', a: -1.65, w: 0.9, y0: GF + 1.1, y1: GF + 2.2 });
    sd.boxMinMax(G.minX, 0.2, G.maxZ - GT, minX, EAVE, G.maxZ, sidingM);
    for (const [x, z] of [[G.minX, G.minZ], [G.maxX - 0.2, G.minZ], [G.minX, G.maxZ]]) d.boxMinMax(x - 0.06, 0.2, z - 0.06, x + 0.08, EAVE, z + 0.08, COL.trim);
    // the door's trim and two coach lights
    b.boxMinMax(GD.minX - 0.12, GF, G.minZ - 0.06, GD.minX, GF + GD.height + 0.12, G.minZ, COL.trim); // on the wall's face
    b.boxMinMax(GD.maxX, GF, G.minZ - 0.06, GD.maxX + 0.12, GF + GD.height + 0.12, G.minZ, COL.trim);
    b.boxMinMax(GD.minX - 0.12, GF + GD.height, G.minZ - 0.06, GD.maxX + 0.12, GF + GD.height + 0.14, G.minZ, COL.trim);
    for (const x of [GD.minX - 0.42, GD.maxX + 0.42]) {
      b.boxMinMax(x - 0.09, GF + 1.85, G.minZ - 0.2, x + 0.09, GF + 2.2, G.minZ, COL.dark);
      b.boxMinMax(x - 0.06, GF + 1.9, G.minZ - 0.22, x + 0.06, GF + 2.12, G.minZ - 0.02, lampGlow('#ffe7a8'));
      addNightSpot({ x, y: GF + 2.0, z: G.minZ - 0.35, color: '#ffc978', pool: 2.2, gy: 0.44, halo: 0.6 });
    }
    // its roof: a front gable (the ridge along z), no overhang on the house's side
    const slope = (ghalf + OH) / Math.cos(ANG), slopeE = ghalf / Math.cos(ANG), gz0 = G.minZ - OH, gz1 = G.maxZ + OH, glen = gz1 - gz0;
    sh.add(GEO.box, shingleM, { x: gcx - Math.cos(ANG) * slope / 2, y: gRidge - Math.sin(ANG) * slope / 2 + 0.09, z: (gz0 + gz1) / 2, sx: slope, sy: 0.16, sz: glen, rz: ANG });
    sh.add(GEO.box, shingleM, { x: gcx + Math.cos(ANG) * slopeE / 2, y: gRidge - Math.sin(ANG) * slopeE / 2 + 0.09, z: (gz0 + gz1) / 2, sx: slopeE, sy: 0.16, sz: glen, rz: -ANG });
    sh.add(GEO.box, shingleM, { x: gcx, y: gRidge + 0.2, z: (gz0 + gz1) / 2, sx: 0.34, sy: 0.12, sz: glen + 0.04 });
    b.add(GEO.box, COL.trim, { x: G.minX - OH - 0.02, y: EAVE - OH * PITCH - 0.06, z: (gz0 + gz1) / 2, sx: 0.06, sy: 0.22, sz: glen - 0.006 });
    d.add(GEO.box, COL.soffit, { x: G.minX - OH / 2, y: EAVE - 0.06, z: (gz0 + gz1) / 2, sx: OH, sy: 0.04, sz: glen - 0.006 }); // 3 mm short of the gables' ends
    for (const [z, o] of [[G.minZ, -1], [G.maxZ, 1]]) {
      sd.add(gableGeo(G.maxX - G.minX, gRidge - EAVE, 0.14), sidingM, { x: gcx, y: EAVE, z: z - o * 0.07 });
      for (const s of [-1, 1]) { const sl = s < 0 ? slope : slopeE; b.add(GEO.box, COL.trim, { x: gcx + s * Math.cos(ANG) * sl / 2, y: gRidge - Math.sin(ANG) * sl / 2 + 0.02, z: z + o * (OH - 0.02), sx: sl, sy: 0.24, sz: 0.06, rz: -s * ANG }); } // the rakes 1 cm proud of the shingles' ends
      d.boxMinMax(G.minX - 0.02, EAVE - 0.06, z - 0.04, G.maxX + 0.003, EAVE + 0.06, z + 0.04, COL.trim); // (3 mm past the return's face, not in it)
    }
    // the gable vent over the door
    b.add(GEO.box, COL.vent, { x: gcx, y: EAVE + 1.25, z: G.minZ - 0.04, sx: 0.85, sy: 0.6, sz: 0.06 });
    for (let i = 0; i < 4; i++) d.add(GEO.box, '#9a9890', { x: gcx, y: EAVE + 1.03 + i * 0.14, z: G.minZ - 0.075, sx: 0.68, sy: 0.03, sz: 0.02 });
    // the concrete floor and the drive in front of it
    b.boxMinMax(G.minX + GT, 0.2, G.minZ + GT, G.maxX - 0.2, GF, minZ, COL.concrete); // (in two: its end lay in the brick return's face)
    b.boxMinMax(G.minX + GT, 0.2, minZ, G.maxX, GF, G.maxZ - GT, COL.concrete);
    addSurface({ minX: G.minX + GT, maxX: G.maxX, minZ: G.minZ, maxZ: G.maxZ - GT, y: GF });
    b.boxMinMax(GD.minX - 0.3, 0.2, G.minZ - 4.2, GD.maxX + 0.3, 0.46, G.minZ, COL.concrete);
    d.boxMinMax((GD.minX + GD.maxX) / 2 - 0.01, 0.46, G.minZ - 4.2, (GD.minX + GD.maxX) / 2 + 0.01, 0.462, G.minZ, COL.concrete2);
    d.boxMinMax(GD.minX - 0.3, 0.46, G.minZ - 2.1, GD.maxX + 0.3, 0.462, G.minZ - 2.08, COL.concrete2);
    addSurface({ minX: GD.minX - 0.3, maxX: GD.maxX + 0.3, minZ: G.minZ - 4.2, maxZ: G.minZ, y: 0.46 });
    // colliders: the front either side of the door, the west side, the back
    colliders.push({ type: 'box', minX: G.minX, maxX: GD.minX, minZ: G.minZ, maxZ: G.minZ + GT, house: true });
    colliders.push({ type: 'box', minX: GD.maxX, maxX: G.maxX, minZ: G.minZ, maxZ: G.minZ + GT, house: true });
    colliders.push({ type: 'box', minX: G.maxX - 0.2, maxX: G.maxX, minZ: G.minZ, maxZ: minZ, house: true });
    colliders.push({ type: 'box', minX: G.minX, maxX: G.minX + GT, minZ: G.minZ, maxZ: G.maxZ, house: true });
    colliders.push({ type: 'box', minX: G.minX, maxX: minX, minZ: G.maxZ - GT, maxZ: G.maxZ, house: true });
  }
  // the roll-up door: white panels that roll up under the ceiling as you come near (main-house.js)
  const gdoor = new THREE.Group(); gdoor.name = 'garage-door';
  {
    const w = GD.maxX - GD.minX, h = GD.height, gm = toon(COL.garage), gl = toon('#d9d6cc');
    const panels = new THREE.Group(); panels.position.set((GD.minX + GD.maxX) / 2, GF + h, G.minZ + 0.08);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(GEO.box, gm); p.scale.set(w - 0.04, h / 4 - 0.03, 0.06); p.position.set(0, -h / 8 - (i * h) / 4, 0); panels.add(p);
      for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(GEO.box, gl); r.scale.set(w / 4 - 0.18, h / 4 - 0.2, 0.02); r.position.set(-w / 2 + w / 8 + (k * w) / 4, -h / 8 - (i * h) / 4, -0.04); panels.add(r); }
    }
    bakeGroup(panels);
    gdoor.add(panels); gdoor.userData.panels = panels; gdoor.userData.h = h;
    const drum = new THREE.Mesh(GEO.box, toon(COL.dark)); drum.scale.set(w, 0.32, 0.36); drum.position.set((GD.minX + GD.maxX) / 2, GF + h + 0.2, G.minZ + 0.35); gdoor.add(drum);
    gdoor.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.noMerge = true; } });
  }
  ext.add(gdoor);
  const gdoorCol = { type: 'box', minX: GD.minX, maxX: GD.maxX, minZ: G.minZ, maxZ: G.minZ + GT, house: true, off: false };
  colliders.push(gdoorCol);

  // ================================================================ the chimney on the back wall, behind the fireplace
  {
    const C = CHIMNEY, x0 = C.x - C.w / 2, x1 = C.x + C.w / 2, z0 = maxZ, z1 = maxZ + C.d;
    bk.boxMinMax(x0, 0.2, z0, x1, EAVE + 0.1, z1, brickM);
    bk.add(GEO.box, brickM, { x: C.x, y: EAVE + 0.35, z: (z0 + z1) / 2 + 0.05, sx: C.w - 0.25, sy: 0.5, sz: C.d - 0.1 });
    const fw = 1.0, fd = 0.6, fz = (z0 + z1) / 2 + 0.06;
    bk.boxMinMax(C.x - fw / 2, EAVE + 0.6, fz - fd / 2, C.x + fw / 2, C.top, fz + fd / 2, brickM);
    b.boxMinMax(C.x - fw / 2 - 0.07, C.top, fz - fd / 2 - 0.07, C.x + fw / 2 + 0.07, C.top + 0.1, fz + fd / 2 + 0.07, '#8a8780');
    b.boxMinMax(C.x - 0.17, C.top + 0.1, fz - 0.15, C.x + 0.17, C.top + 0.4, fz + 0.15, COL.dark);
    colliders.push({ type: 'box', minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  }

  // ================================================================ the deck: boards, rails, posts, steps down on the west end
  {
    const D = DECK, C = CHIMNEY, cx0 = C.x - C.w / 2, cx1 = C.x + C.w / 2, cz1 = maxZ + C.d;
    const plank = (x0, x1, z0, z1) => { for (let x = x0, i = 0; x < x1 - 0.01; x += 0.15, i++) b.boxMinMax(x, D.y - 0.05, z0, Math.min(x1, x + 0.14), D.y, z1, i % 3 ? COL.deck : COL.deck2); };
    plank(D.minX, cx0, D.minZ, D.maxZ); plank(cx1, D.maxX, D.minZ, D.maxZ); plank(cx0, cx1, cz1, D.maxZ);
    b.boxMinMax(D.minX, D.y - 0.28, D.maxZ - 0.06, D.maxX, D.y - 0.05, D.maxZ, COL.deckDark);                      // the rim joists
    b.boxMinMax(D.maxX - 0.06, D.y - 0.28, D.minZ, D.maxX, D.y - 0.05, D.maxZ, COL.deckDark);
    b.boxMinMax(D.minX, D.y - 0.28, D.minZ, D.minX + 0.06, D.y - 0.05, D.maxZ, COL.deckDark);
    for (const x of [D.minX + 0.1, -3.9, cx1 + 0.3, D.maxX - 0.1]) for (const z of [D.maxZ - 0.1, (D.minZ + D.maxZ) / 2]) b.boxMinMax(x - 0.06, -0.6, z - 0.06, x + 0.06, D.y - 0.02, z + 0.06, COL.deckDark); // the posts (down into the sand, up to the boards)
    addSurface({ minX: D.minX, maxX: cx0, minZ: D.minZ, maxZ: D.maxZ, y: D.y, sound: 'wood' });
    addSurface({ minX: cx1, maxX: D.maxX, minZ: D.minZ, maxZ: D.maxZ, y: D.y, sound: 'wood' });
    addSurface({ minX: cx0, maxX: cx1, minZ: cz1, maxZ: D.maxZ, y: D.y, sound: 'wood' });
    const top = D.y + 0.92, stepZ0 = D.minZ + 1.2, stepZ1 = D.minZ + 2.4;
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ax = Math.abs(x1 - x0) > 0.01, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      b.add(GEO.box, COL.deck, { x: mx, y: top, z: mz, sx: ax ? len : 0.12, sy: 0.06, sz: ax ? 0.12 : len });
      b.add(GEO.box, COL.deck2, { x: mx, y: D.y + 0.12, z: mz, sx: ax ? len : 0.06, sy: 0.06, sz: ax ? 0.06 : len });
      const n = Math.floor(len / 0.15);
      for (let i = 1; i < n; i++) { const t = i / n; b.add(GEO.box, COL.deck2, { x: x0 + (x1 - x0) * t, y: D.y + 0.5, z: z0 + (z1 - z0) * t, sx: 0.045, sy: 0.8, sz: 0.045 }); }
      for (const [x, z] of [[x0, z0], [x1, z1]]) b.boxMinMax(x - 0.07, D.y, z - 0.07, x + 0.07, top + 0.08, z + 0.07, COL.deckDark);
      colliders.push(ax ? { type: 'box', minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: mz - 0.08, maxZ: mz + 0.08, top: 1.0 } : { type: 'box', minX: mx - 0.08, maxX: mx + 0.08, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), top: 1.0 });
    };
    const e = 0.06;
    rail(D.minX + e, D.maxZ - e, D.maxX - e, D.maxZ - e); rail(D.maxX - e, D.minZ + 0.05, D.maxX - e, D.maxZ - e);
    rail(D.minX + e, D.minZ + 0.05, D.minX + e, stepZ0); rail(D.minX + e, stepZ1, D.minX + e, D.maxZ - e);
    for (let i = 0; i < 2; i++) {
      const x1 = D.minX - i * 0.32, y = D.y - (i + 1) * (D.y - 0.4) / 3;
      b.boxMinMax(x1 - 0.32, 0.2, stepZ0, x1, y, stepZ1, COL.deck);
      addSurface({ minX: x1 - 0.32, maxX: x1, minZ: stepZ0, maxZ: stepZ1, y });
    }
    // a little table and two chairs out by the rail, the grill by the house wall
    // (seat-height: the chairs' seats 0.3 up, were 0.445; the table's top down as far, 0.56, was 0.705: table-games/tables.js)
    b.add(GEO.cyl12, COL.deck2, { x: -4.6, y: D.y + 0.535, z: 7.35, sx: 0.45, sy: 0.05, sz: 0.45 });
    b.add(GEO.cyl8, COL.deckDark, { x: -4.6, y: D.y + 0.26, z: 7.35, sx: 0.05, sy: 0.52, sz: 0.05 });
    for (const [x, ry] of [[-5.45, 0.4], [-3.75, -0.4]]) {
      b.add(GEO.box, COL.deck, { x, y: D.y + 0.275, z: 7.35, sx: 0.5, sy: 0.05, sz: 0.5, ry });
      b.add(GEO.box, COL.deck, { x: x + Math.sin(ry) * 0.0, y: D.y + 0.555, z: 7.62, sx: 0.5, sy: 0.5, sz: 0.05, ry });
      for (const [u, v] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.add(GEO.box, COL.deckDark, { x: x + u, y: D.y + 0.125, z: 7.35 + v, sx: 0.04, sy: 0.25, sz: 0.04 });
    }
    colliders.push({ type: 'circle', x: -4.6, z: 7.35, r: 0.5 }, { type: 'circle', x: -5.45, z: 7.4, r: 0.3 }, { type: 'circle', x: -3.75, z: 7.4, r: 0.3 });
    b.boxMinMax(-6.3, D.y, 5.75, -5.6, D.y + 0.9, 6.25, COL.dark); b.boxMinMax(-6.35, D.y + 0.9, 5.7, -5.55, D.y + 1.0, 6.3, '#1d1e20');
    colliders.push({ type: 'box', minX: -6.35, maxX: -5.55, minZ: 5.6, maxZ: 6.3 });
  }

  // ================================================================ the air conditioner, the flower beds and shrubs along the front
  {
    const H = HVAC;
    b.boxMinMax(H.x - 0.55, 0.3, H.z - 0.55, H.x + 0.55, 0.42, H.z + 0.55, COL.concrete);
    b.boxMinMax(H.x - 0.42, 0.42, H.z - 0.42, H.x + 0.42, 1.2, H.z + 0.42, COL.hvac);
    b.boxMinMax(H.x - 0.43, 1.2, H.z - 0.43, H.x + 0.43, 1.26, H.z + 0.43, COL.dark);
    b.add(GEO.cyl12, '#1d1e20', { x: H.x, y: 1.27, z: H.z, sx: 0.32, sy: 0.02, sz: 0.32 });
    for (let i = 0; i < 6; i++) d.boxMinMax(H.x - 0.43, 0.5 + i * 0.12, H.z - 0.43, H.x + 0.43, 0.52 + i * 0.12, H.z + 0.43, '#8c8e8a');
    b.boxMinMax(minX - 0.11, 1.3, H.z + 0.1, minX, 1.74, H.z + 0.4, '#9b9d99'); // (tucked under the window's sill, not flush with it)
    colliders.push({ type: 'box', minX: H.x - 0.5, maxX: H.x + 0.5, minZ: H.z - 0.5, maxZ: H.z + 0.5 });
    for (const [x0, x1] of [[G.maxX + 0.1, P.minX - 0.1], [P.maxX + 0.1, maxX - 0.1]]) {
      b.boxMinMax(x0, 0.3, minZ - 1.15, x1, 0.47, minZ, COL.mulch);
      for (let x = x0 + 0.55, i = 0; x < x1 - 0.3; x += 1.25, i++) b.add(GEO.ico1, i % 2 ? COL.shrub : COL.shrub2, { x, y: 0.75, z: minZ - 0.58, sx: 0.5, sy: 0.42, sz: 0.48 });
      colliders.push({ type: 'box', minX: x0, maxX: x1, minZ: minZ - 1.1, maxZ: minZ, top: 0.9 });
    }
    // and one round each back corner
    for (const [x, z] of [[maxX + 0.7, maxZ + 0.4], [maxX + 0.7, minZ - 0.4]]) { b.add(GEO.ico1, COL.shrub, { x, y: 0.8, z, sx: 0.6, sy: 0.5, sz: 0.6 }); colliders.push({ type: 'circle', x, z, r: 0.55 }); }
  }

  // ================================================================ build the outside
  b.build(ext, 'house');
  d.build(ext, 'house-details').forEach(m => soft(m));
  for (const [bat, tile, roof, name] of [[bk, TILE.brick, false, 'house-brick'], [sd, TILE.siding, false, 'house-siding'], [sh, TILE.shingle, true, 'house-roof']]) {
    for (const m of bat.build(ext, name)) { worldUV(m.geometry, tile, roof); m.userData.notSign = true; } // (printed, but no sign: tools/signs-audit.mjs)
  }
  const glassMeshes = glass.build(ext, 'house-glass');
  for (const m of glassMeshes) m.userData.noMerge = true;

  // the front door (hinged on the west side, it swings into the living room)
  const dw = HOUSE.door.width / 2, dh = HOUSE.door.height;
  const door = new THREE.Group(); door.name = 'front-door';
  door.position.set(-dw, F, minZ + 0.1);
  {
    const leaf = new THREE.Mesh(GEO.box, toon(COL.door)); leaf.scale.set(dw * 2 - 0.02, dh - 0.02, 0.07); leaf.position.set(dw, dh / 2, 0); door.add(leaf);
    for (const side of [-1, 1]) {
      for (const [px, py, ph] of [[-0.2, 0.55, 0.8], [0.2, 0.55, 0.8], [-0.2, 1.55, 0.75], [0.2, 1.55, 0.75]]) {
        const p = new THREE.Mesh(GEO.box, toon(COL.doorPanel)); p.scale.set(0.3, ph, 0.02); p.position.set(dw + px, py, side * 0.04); door.add(p);
      }
      const knob = new THREE.Mesh(GEO.sphere, toon(COL.brass)); knob.scale.setScalar(0.045); knob.position.set(dw * 2 - 0.12, 1.0, side * 0.07); door.add(knob);
    }
    bakeGroup(door);
  }
  group.add(door);
  const doorCol = { type: 'box', minX: -dw, maxX: dw, minZ: minZ, maxZ: minZ + T, house: true, off: false };
  colliders.push(doorCol);

  // the two other outer doors, swinging in as you come near (main-house.js): the deck's (white, glass above a panel, hinged on its east
  // side, into the living room) and the garage's (plain white, hinged at its front, into the laundry)
  const sideDoors = [], doorGlass = realGlass(new THREE.MeshBasicMaterial({ color: '#cfe4f2', fog: true }), glassU, 'house-door-glass'); // the deck door's pane: daylight by day, dusk blue at night (main-house.js), see-through near
  const sideDoor = (id, hx, hz, dir, w, h, sign, glassTop, col) => {
    const g = new THREE.Group(); g.name = id + '-door'; g.position.set(hx, F, hz);
    const along = (m, a, y, sa, sy, t) => { m.scale.set(dir[0] ? sa : t, sy, dir[0] ? t : sa); m.position.set(dir[0] * a, y, dir[1] * a); g.add(m); };
    const white = toon('#f3f1ea');
    if (glassTop) {
      along(new THREE.Mesh(GEO.box, white), w / 2, 0.3, w - 0.02, 0.6, 0.06);
      along(new THREE.Mesh(GEO.box, white), w / 2, h - 0.08, w - 0.02, 0.16, 0.06);
      for (const k of [0.06, w - 0.06]) along(new THREE.Mesh(GEO.box, white), k, h / 2, 0.12, h, 0.06);
      along(new THREE.Mesh(GEO.box, doorGlass), w / 2, 0.6 + (h - 0.76) / 2, w - 0.2, h - 0.76, 0.02);
      along(new THREE.Mesh(GEO.box, white), w / 2, 0.6 + (h - 0.76) / 2, 0.03, h - 0.76, 0.04);
    } else {
      along(new THREE.Mesh(GEO.box, white), w / 2, h / 2, w - 0.02, h - 0.02, 0.05);
      for (const y of [0.55, 1.45]) along(new THREE.Mesh(GEO.box, toon('#e4e1d8')), w / 2, y, w - 0.3, 0.7, 0.07);
    }
    const knob = new THREE.Mesh(GEO.sphere, toon(COL.bronze)); knob.scale.setScalar(0.04); knob.position.set(dir[0] * (w - 0.1), 1.0, dir[1] * (w - 0.1)); g.add(knob);
    bakeGroup(g, true, false);
    group.add(g);
    colliders.push(col);
    sideDoors.push({ id, g, col, sign, angle: 0, target: 0 });
  };
  {
    const s = HOUSE_PLAN.slider, hd = HOUSE_PLAN.houseDoor;
    sideDoor('deck', s.x + s.w / 2, maxZ - 0.1, [-1, 0], s.w, 2.1, -1, true, { type: 'box', minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: maxZ - 0.2, maxZ, house: true, off: false });
    sideDoor('garage', minX + 0.1, hd.z - hd.w / 2, [0, 1], hd.w, 2.03, 1, false, { type: 'box', minX, maxX: minX + 0.2, minZ: hd.z - hd.w / 2, maxZ: hd.z + hd.w / 2, house: true, off: false });
  }

  // the sign over the porch steps
  {
    const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture('BRENELAND'), fog: true });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.08), [toon('#7a5234'), toon('#7a5234'), toon('#7a5234'), toon('#7a5234'), signMat, signMat]);
    sign.position.set(0, P.ceilY - 0.42, P.minZ + 0.16); sign.rotation.y = Math.PI;
    const chainMat = toon('#3a3f47');
    for (const x of [-1, 1]) { const ch = new THREE.Mesh(GEO.box, chainMat); ch.scale.set(0.03, 0.12, 0.03); ch.position.set(x, P.ceilY - 0.05, P.minZ + 0.16); ext.add(ch); }
    ext.add(sign);
  }

  // the inside (house-inside.js): the rooms, the living room, the kitchen and dining room, the bedrooms and baths, the garage's things
  const inside = buildInside(group, colliders);

  // the light in the living room: raised while the login intro plays inside (kept in the scene at 0, so switching never recompiles).
  // It is the ceiling fan's light (house-rooms.js), so it shines from the bulb you see (fire-season)
  const hallLight = new THREE.PointLight('#ffcf8a', 0, 10, 1.6);
  hallLight.position.set(-0.9, F + 3.45, 1.4);
  group.add(hallLight);

  parent.add(group);

  let doorAngle = 0, doorTarget = 0, gK = 0, gTarget = 0;
  return {
    group, ext, door, doorCol, hallLight, colliders, gdoor, gdoorCol, inside, plan: HOUSE_PLAN,
    rooms: inside.rooms, walls: inside.walls, lamps: inside.lamps,
    setDoor(open) { doorTarget = open ? THREE.MathUtils.degToRad(100) : 0; },
    setGarage(open) { gTarget = open ? 1 : 0; },
    sideDoors, doorGlass,
    // the see-through panes: their shared uniforms, materials and meshes (the deck door's baked pane included)
    glassU, glassMats: [...realMats.values(), doorGlass],
    glassMeshes: [...glassMeshes, ...(() => { const out = []; group.traverse(o => { if (o.isMesh && o.material === doorGlass) out.push(o); }); return out; })()],
    setSideDoor(id, open) { const d = sideDoors.find(q => q.id === id); if (d) d.target = open ? 1.75 : 0; },
    get doorAngle() { return doorAngle; },
    get garageOpen() { return gK; },
    update(dt) {
      const k = doorTarget > doorAngle ? 2.6 : 3.8;
      doorAngle += (doorTarget - doorAngle) * Math.min(1, dt * k);
      if (Math.abs(doorTarget - doorAngle) < 0.002) doorAngle = doorTarget;
      door.rotation.y = -doorAngle;
      doorCol.off = doorAngle > 0.5;
      for (const sd of sideDoors) {
        sd.angle += (sd.target - sd.angle) * Math.min(1, dt * (sd.target > sd.angle ? 2.8 : 3.8));
        if (Math.abs(sd.target - sd.angle) < 0.002) sd.angle = sd.target;
        sd.g.rotation.y = sd.sign * sd.angle; sd.col.off = sd.angle > 0.5;
      }
      // the garage door rolls up (the panels shrink into the drum) and down
      gK += Math.sign(gTarget - gK) * Math.min(Math.abs(gTarget - gK), dt * 0.7);
      const pn = gdoor.userData.panels;
      pn.scale.y = Math.max(0.02, 1 - gK); pn.visible = gK < 0.99;
      gdoorCol.off = gK > 0.55;
    },
  };
}
