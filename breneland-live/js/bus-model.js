// Breneland's town bus, Route 7: the schedule (pure numbers, the server clock decides when it runs), its measurements, and the
// pieces it's built from. busParts() is the shell in car-models.js's part format, so cars.js drives it like any car.
// buildBusInside() is what bus.js adds: glass, doors, seats, the driver's cab, the names and the destination sign.
// The bus's frame is car-models.js's: +z its nose, +x its left (the driver's side: traffic keeps right), y up from the road.
import * as THREE from 'three';
import { mergeVertices } from '../vendor/three/addons/BufferGeometryUtils.js';
import { GEO, Batcher } from './batch.js';
import { lampGlow } from './daynight-mats.js';
import { redrawWhenFontsLoad } from './toon.js';
import { drawBusIcon, ROUTE } from './bus-stop-build.js';
import { carFormatParts, vehicleModelsReady } from './vehicle-models.js';   // (props-vehicles) the Blender bus shell when loaded

// ------------------------------------------------------------------ the schedule
// Every period of the shared clock (net.serverNow()) the bus comes out of the tunnel, drives to the stop, waits, calls the last
// call, then drives the loop round Maple Row and back into the tunnel. Tune here: cars.js, bus.js and the tests read these.
export const BUS_SCHEDULE = {
  period: 1800,      // 30 minutes
  offset: 0,         // where in the period it leaves the tunnel
  depart: 110,       // seconds after it leaves the tunnel that it leaves the stop (it gets there in about 30 s: about 80 s to board)
  minDwell: 60,      // never less at the stop than this
  lastCall: 12,      // the chime and "All aboard!" this long before it goes
  stepOff: 4,        // anyone still aboard steps off onto the stop this long before it goes
  maxTrip: 420,      // a trip longer than this is sent home (never seen)
};
// When the bus that is due at (or after) shared time t leaves the tunnel, arrives (about) and leaves the stop (at the earliest).
export function busTimes(t) {
  const S = BUS_SCHEDULE, j = Math.floor((t - S.offset) / S.period), T0 = j * S.period + S.offset;
  return { j, T0, arrive: T0 + BUS_ARRIVE, depart: T0 + S.depart, next: T0 + S.period + BUS_ARRIVE };
}
export const BUS_ARRIVE = 30;   // about how long the drive from the tunnel to the stop takes (the timetable shows this)

// ------------------------------------------------------------------ the bus's measurements
export const BUS = {
  L: 10.6, W: 2.5, H: 3.0, wheelR: 0.5, axles: [2.75, -2.45], floorY: 0.33, beltY: 1.12, roofY: 2.72,
  nose: 5.3, halfW: 1.27,
  doors: [{ z0: 3.35, z1: 4.45 }, { z0: -0.62, z1: 0.62 }],   // on the kerb side (-x): the front door by the driver, the middle door
  driver: { x: 0.62, z: 3.72, seatY: 0.63 },                   // the driver's seat (its top) and the wheel ahead of it (seat-height: 0.3 over the floor, was 0.49; the wheel down as far)
  wheel: { x: 0.62, y: 1.17, z: 4.12, r: 0.45 },               // (where Bernie's hands are in the 'drive' pose: a big bus wheel)
  aisle: { x0: -0.48, x1: 0.28 },
};
// The passenger seats in the bus's frame: { x, z, y (the cushion's top), name }; every one faces the nose.
export const BUS_SEATS = (() => {
  const out = [], F = BUS.floorY + 0.3, R = F; // (seat-height: every cushion 0.3 over the floor, the feet on it; were 0.45, 0.68 over the wheels, 0.51 at the back)
  for (const z of [1.95, 1.1, 0.25, -0.6, -1.45, -2.4, -3.35]) out.push({ x: 0.74, z, y: z === -2.4 ? R : F });       // the driver's side
  for (const z of [1.95, 1.1, -1.45, -2.4, -3.35]) out.push({ x: -0.84, z, y: z === -2.4 ? R : F });                 // the door side
  for (const x of [-0.8, 0, 0.8]) out.push({ x, z: -4.42, y: F });                                            // the back bench
  return out;
})();

// ------------------------------------------------------------------ the shell (car-models.js part format)
const YEL = '#f2c14e', YEL_D = '#d9a63a', GREEN = '#2f6b5f', CREAM = '#f6f0de', DARK = '#2b2b2f', TRIM = '#3a3f47', CHROME = '#d4d7dc';
const unit = {
  disc: new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2),
  tyre: new THREE.TorusGeometry(0.68, 0.32, 7, 16).rotateY(Math.PI / 2),
  hub: new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2),
};
// a side panel's outline (z, y) between z0 and z1 from the skirt to the belt, with any wheel arches inside it cut out
function sidePanel(z0, z1, arches) {
  const s = new THREE.Shape(), yb = 0.2, yt = BUS.beltY, R = BUS.wheelR + 0.1, cy = BUS.wheelR;
  s.moveTo(z0, yb);
  for (const az of arches.filter(a => a > z0 && a < z1).sort((a, b) => a - b)) {
    const d = Math.asin(Math.min(0.95, (yb - cy) / R));
    s.lineTo(az - Math.cos(d) * R, yb);
    s.absarc(az, cy, R, Math.PI - d, d, true);
  }
  s.lineTo(z1, yb); s.lineTo(z1, yt); s.lineTo(z0, yt); s.closePath();
  return s;
}
function across(shape, x, t) { // extrude a (z, y) shape across x by t, its outer face at x
  let g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 8 });
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, x > 0 ? x : x + t, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1)); // (a rotation: world x = the outer face minus the depth)
  g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  return g;
}
let partsCache = null;
export function busParts() {
  if (partsCache) return partsCache;
  const parts = [], add = (geo, color, o, extra) => parts.push({ geo, color, o: o || {}, ...extra });
  const L2 = BUS.L / 2, W2 = BUS.W / 2, T = 0.08, A = BUS.axles, D = BUS.doors;
  // ---- the sides below the windows: the driver's side whole, the kerb side cut for the two doors
  add(across(sidePanel(-L2, L2, A), W2, T), YEL);
  for (const [z0, z1] of [[-L2, D[1].z0], [D[1].z1, D[0].z0], [D[0].z1, L2]]) add(across(sidePanel(z0, z1, A), -W2, T), YEL);
  // the green band along the belt and the skirt's dark rubbing strip, both sides (the kerb side broken by the doors)
  const band = (z0, z1, x, y0, y1, c) => add(GEO.box, c, { x, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: 0.04, sy: y1 - y0, sz: z1 - z0 });
  band(-L2, L2, W2 + 0.01, 0.92, 1.12, GREEN); band(-L2, L2, W2 + 0.01, 0.24, 0.32, DARK);
  for (const [z0, z1] of [[-L2, D[1].z0], [D[1].z1, D[0].z0], [D[0].z1, L2]]) { band(z0, z1, -W2 - 0.01, 0.92, 1.12, GREEN); band(z0, z1, -W2 - 0.01, 0.24, 0.32, DARK); }
  // ---- the window band: pillars between the panes, a rail over them, the roof
  const pill = (x, z, w = 0.1) => add(GEO.box, YEL, { x, y: (BUS.beltY + BUS.roofY) / 2, z, sx: T, sy: BUS.roofY - BUS.beltY, sz: w });
  for (const z of [-L2 + 0.06, -3.6, -2.0, -0.7, 0.7, 2.0, 3.3, L2 - 0.12]) pill(W2 - T / 2, z, z === L2 - 0.12 ? 0.22 : 0.1);
  for (const z of [-L2 + 0.06, -3.6, -2.0, D[1].z0 - 0.05, D[1].z1 + 0.05, 2.0, D[0].z0 - 0.05, D[0].z1 + 0.05, L2 - 0.12]) pill(-W2 + T / 2, z, z === L2 - 0.12 ? 0.22 : 0.1);
  for (const s of [-1, 1]) add(GEO.box, CREAM, { x: s * (W2 - T / 2), y: BUS.roofY - 0.07, z: 0, sx: T + 0.01, sy: 0.14, sz: BUS.L });
  // (no door frame tops: the openings run up to the window rail)
  // roof: a cream slab, rounded along both top edges, the air-con pod on top
  add(GEO.box, CREAM, { y: BUS.roofY + 0.09, z: 0, sx: BUS.W - 0.16, sy: 0.18, sz: BUS.L - 0.1 });
  const capsule = new THREE.CapsuleGeometry(0.11, BUS.L - 0.36, 3, 8).rotateX(Math.PI / 2);
  for (const s of [-1, 1]) add(capsule, CREAM, { x: s * (W2 - 0.1), y: BUS.roofY + 0.07, z: 0 });
  add(GEO.box, '#e4ddca', { y: BUS.roofY + 0.3, z: -1.6, sx: 1.3, sy: 0.26, sz: 2.4 });
  for (const k of [-0.7, 0, 0.7]) add(GEO.box, '#c9c1b0', { x: 0, y: BUS.roofY + 0.44, z: -1.6 + k, sx: 1.0, sy: 0.02, sz: 0.3 });
  // ---- the nose: a panel under the windscreen, the destination box over it, bumper, grille, lamps
  add(GEO.box, YEL, { y: 0.62, z: L2 - 0.06, sx: BUS.W, sy: 0.84, sz: 0.12 });
  add(GEO.box, GREEN, { y: 0.98, z: L2 - 0.02, sx: BUS.W, sy: 0.14, sz: 0.06 });
  add(GEO.box, DARK, { y: 2.6, z: L2 - 0.08, sx: BUS.W - 0.1, sy: 0.3, sz: 0.1 });            // (the sign's black box: bus.js lays its words on)
  add(new THREE.CapsuleGeometry(0.13, BUS.W - 0.3, 3, 10).rotateZ(Math.PI / 2), TRIM, { y: 0.3, z: L2 + 0.02 });
  add(GEO.box, DARK, { y: 0.55, z: L2 + 0.005, sx: 0.9, sy: 0.18, sz: 0.04 });
  add(GEO.box, '#f4f2ea', { y: 0.36, z: L2 + 0.14, sx: 0.5, sy: 0.14, sz: 0.03 });              // (the plate)
  for (const s of [-1, 1]) {   // mirrors on stalks
    add(GEO.box, TRIM, { x: s * (W2 + 0.18), y: 2.25, z: L2 - 0.15, sx: 0.36, sy: 0.04, sz: 0.04 });
    add(GEO.box, DARK, { x: s * (W2 + 0.34), y: 1.95, z: L2 - 0.15, sx: 0.08, sy: 0.5, sz: 0.22 });
  }
  // ---- the back: a panel all the way up with a small window, the engine grille, bumper
  add(GEO.box, YEL, { y: (0.2 + BUS.roofY) / 2, z: -L2 + 0.06, sx: BUS.W, sy: BUS.roofY - 0.2, sz: 0.12 });
  add(GEO.box, GREEN, { y: 1.02, z: -L2 + 0.0, sx: BUS.W, sy: 0.2, sz: 0.04 });
  for (let k = 0; k < 4; k++) add(GEO.box, YEL_D, { y: 0.5 + k * 0.1, z: -L2 - 0.01, sx: 1.2, sy: 0.04, sz: 0.03 });
  add(new THREE.CapsuleGeometry(0.13, BUS.W - 0.3, 3, 10).rotateZ(Math.PI / 2), TRIM, { y: 0.3, z: -L2 - 0.02 });
  add(GEO.box, '#ffffff', { y: 2.0, z: -L2 - 0.005, sx: 1.6, sy: 0.7, sz: 0.03 }, { glass: true, keep: true });   // the back window (lit like a car's; keep: on the Blender shell too)
  // ---- lamps (cars.js colours them by name)
  const lamp = (name, geo, o) => add(geo, '#ffffff', o, { lamp: name });
  for (const s of [-1, 1]) lamp(s > 0 ? 'headL' : 'headR', unit.disc, { x: s * 0.86, y: 0.62, z: L2 + 0.01, sx: 0.16, sy: 0.16, sz: 0.06 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'tailL' : 'tailR', GEO.box, { x: s * 0.98, y: 0.78, z: -L2 - 0.01, sx: 0.3, sy: 0.32, sz: 0.06 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'indFL' : 'indFR', GEO.sphere, { x: s * (W2 - 0.06), y: 0.9, z: L2 - 0.02, sx: 0.12, sy: 0.09, sz: 0.1 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'indRL' : 'indRR', GEO.sphere, { x: s * (W2 - 0.06), y: 1.12, z: -L2 + 0.02, sx: 0.12, sy: 0.09, sz: 0.1 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'indSL' : 'indSR', GEO.box, { x: s * (W2 + 0.02), y: 0.6, z: 1.6, sx: 0.04, sy: 0.08, sz: 0.24 });
  for (const s of [-1, 1]) lamp(s > 0 ? 'revL' : 'revR', GEO.box, { x: s * 0.55, y: 0.78, z: -L2 - 0.01, sx: 0.16, sy: 0.12, sz: 0.05 });
  // ---- wheels (index 0 front, 1 rear), fat and dark with cream hubs
  for (const [ai, az] of [[0, A[0]], [1, A[1]]]) for (const s of [-1, 1]) {
    const x = s * (W2 - 0.24);
    add(unit.tyre, DARK, { x, sx: 0.3, sy: BUS.wheelR, sz: BUS.wheelR }, { wheel: ai, az });
    add(unit.hub, CREAM, { x: x + s * 0.09, sx: 0.14, sy: BUS.wheelR * 0.52, sz: BUS.wheelR * 0.52 }, { wheel: ai, az });
    add(unit.hub, '#8d9098', { x: x + s * 0.13, sx: 0.06, sy: BUS.wheelR * 0.2, sz: BUS.wheelR * 0.2 }, { wheel: ai, az });
  }
  // the wheel wells inside (dark boxes over the tyres, under the raised seats)
  for (const az of A) for (const s of [-1, 1]) add(GEO.box, '#55524c', { x: s * (W2 - 0.36), y: BUS.floorY + 0.24, z: az, sx: 0.6, sy: 0.5, sz: 1.2 }, { keep: true });
  partsCache = { kind: 'bus', parts, wheelR: BUS.wheelR, axles: A.slice(), spec: { L: BUS.L } };
  // (props-vehicles) the Blender shell when the models loaded: its body, lamps and wheels, plus the code parts marked keep (the
  // back window, the wheel wells inside). The glass, doors, inside and words stay the game's own (buildBusInside).
  const model = carFormatParts('bus');
  if (model) partsCache = { ...model, parts: [...model.parts, ...parts.filter(p => p.keep)], spec: { L: BUS.L } };
  return partsCache;
}

// ------------------------------------------------------------------ the inside (bus.js adds it to the bus)

function canvasTex(w, h, draw, fonts) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const redraw = () => { g.clearRect(0, 0, w, h); draw(g, w, h); tex.needsUpdate = true; };
  redraw(); redrawWhenFontsLoad(redraw, fonts);
  return tex;
}
const FONT = s => `700 ${s}px "Fredoka", "Trebuchet MS", sans-serif`;
// one canvas for its words (one texture, one mesh): BRENELAND along each side with the route in a roundel (the top half), the
// destination sign's amber letters on black (below)
let wordsTex = null;
function busWords() {
  return wordsTex || (wordsTex = canvasTex(1024, 256, (g) => {
    const w = 1024, h = 128;
    g.fillStyle = YEL; g.fillRect(0, 0, w, h);
    g.fillStyle = GREEN; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = FONT(84); g.fillText('BRENELAND', 40, h / 2 + 4);
    g.font = FONT(44); g.fillStyle = '#3a3f47'; g.fillText('TRANSIT', 560, h / 2 + 8);
    g.fillStyle = GREEN; g.beginPath(); g.arc(w - 90, h / 2, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = FONT(64); g.fillText(ROUTE.no, w - 90, h / 2 + 4);
    drawBusIcon(g, 790, 30, 90, GREEN, YEL);
    g.save(); g.translate(0, 136);
    g.fillStyle = '#141414'; g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#ffb33a'; g.textBaseline = 'middle'; g.font = FONT(46); g.textAlign = 'left'; g.fillText(ROUTE.no, 18, 34);
    g.textAlign = 'center'; g.font = FONT(38); g.fillText(ROUTE.name, 256 + 30, 34);
    g.restore();
  }, [FONT(84), FONT(46)]));
}
// a plane w x h showing canvas rectangle [x, y, cw, ch] of the 1024 x 256 words canvas
function wordsFace(w, h, [x, y, cw, ch]) {
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (x + u * cw) / 1024, 1 - (y + (1 - v) * ch) / 256); }
  return geo;
}

const GLASS = new THREE.MeshBasicMaterial({ color: '#bfe0ee', transparent: true, opacity: 0.3, depthWrite: false, fog: true });
// Adds to `root` (the bus's own group): { glass (mesh), doors: [{ leaves: [Object3D, Object3D], z0, z1 }], inside (group), names,
// lights (the ceiling strips' material, lit at night), sign }. Called once.
export function buildBusInside(root) {
  const L2 = BUS.L / 2, W2 = BUS.W / 2, F0 = BUS.floorY, D = BUS.doors;
  const out = { doors: [] };
  // ---- the glass: side panes in the window band, the windscreen (raked a little), one transparent mesh
  const geos = [];
  const pane = (x, z0, z1, y0, y1) => { const g = new THREE.BoxGeometry(0.02, y1 - y0, z1 - z0); g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2); geos.push(g); };
  pane(W2 - 0.04, -L2 + 0.1, L2 - 0.2, BUS.beltY, BUS.roofY - 0.14);
  for (const [z0, z1] of [[-L2 + 0.1, D[1].z0 - 0.1], [D[1].z1 + 0.1, D[0].z0 - 0.1], [D[0].z1 + 0.1, L2 - 0.2]]) pane(-W2 + 0.04, z0, z1, BUS.beltY, BUS.roofY - 0.14);
  const ws = new THREE.BoxGeometry(BUS.W - 0.14, 1.42, 0.02); ws.rotateX(-0.08); ws.translate(0, 1.76, L2 - 0.06); geos.push(ws);
  const glass = new THREE.Mesh(mergeGeos(geos), GLASS.clone());
  glass.name = 'bus-glass'; glass.renderOrder = 1;
  root.add(glass); out.glass = glass;
  // ---- the doors: two glass leaves each in yellow frames, hinged at the opening's edges; bus.js folds them in (rotation.y)
  for (const d of D) {
    const leaves = [], w = (d.z1 - d.z0) / 2;
    for (const k of [0, 1]) {
      const leaf = new THREE.Group(); leaf.name = 'bus-door-leaf';
      const sgn = k === 0 ? 1 : -1, zc = sgn * w / 2;   // (leaf 0 hangs on the opening's back edge and reaches forward, leaf 1 the other way)
      const b = new Batcher({ vertexColors: true });
      b.boxMinMax(-0.03, 0.22, zc - w / 2 + 0.01, 0.03, 0.62, zc + w / 2 - 0.01, YEL);
      b.boxMinMax(-0.03, BUS.roofY - 0.24, zc - w / 2 + 0.01, 0.03, BUS.roofY - 0.16, zc + w / 2 - 0.01, YEL);
      for (const e of [-1, 1]) b.boxMinMax(-0.03, 0.22, zc + e * (w / 2 - 0.06) - 0.05, 0.03, BUS.roofY - 0.16, zc + e * (w / 2 - 0.06) + 0.05, YEL);
      b.boxMinMax(-0.035, 1.18, zc - w / 2 + 0.06, 0.035, 1.24, zc + w / 2 - 0.06, '#d4d7dc');   // (a push bar)
      const fb = b.build(leaf, 'bus-door')[0]; fb.castShadow = true;
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.03, BUS.roofY - 0.86, w - 0.12), GLASS);
      gl.position.set(0, (0.62 + BUS.roofY - 0.24) / 2, zc); gl.renderOrder = 1; leaf.add(gl);
      leaf.position.set(-W2 + 0.05, 0, k === 0 ? d.z0 : d.z1);
      leaf.userData.sgn = sgn;
      root.add(leaf); leaves.push(leaf);
    }
    out.doors.push({ leaves, z0: d.z0, z1: d.z1 });
  }
  // both doors shut, as one cheap mesh (bus.js shows it instead of the four leaves when the camera is far and they are closed)
  { const b = new Batcher({ vertexColors: true });
    for (const d of D) {
      b.boxMinMax(-W2 - 0.005, 0.22, d.z0, -W2 + 0.05, BUS.roofY - 0.16, d.z1, YEL);
      b.boxMinMax(-W2 - 0.01, 0.66, d.z0 + 0.07, -W2 + 0.01, BUS.roofY - 0.28, (d.z0 + d.z1) / 2 - 0.05, '#9cc3d3');
      b.boxMinMax(-W2 - 0.01, 0.66, (d.z0 + d.z1) / 2 + 0.05, -W2 + 0.01, BUS.roofY - 0.28, d.z1 - 0.07, '#9cc3d3');
    }
    const shut = new THREE.Group(); shut.name = 'bus-doors-shut'; b.build(shut, 'bus-doors-shut'); root.add(shut); out.shut = shut; }
  // ---- the names on the sides and the destination sign: one mesh
  const wg = [];
  for (const s of [-1, 1]) {
    const [z0, z1] = s > 0 ? [-L2 + 0.4, L2 - 0.6] : [D[1].z1 + 0.15, D[0].z0 - 0.15];
    const g = wordsFace(z1 - z0, (z1 - z0) / 8, [0, 0, 1024, 128]);
    g.rotateY(s * Math.PI / 2); g.translate(s * (W2 + 0.012), 0.6, (z0 + z1) / 2); wg.push(g);
  }
  { const g = wordsFace(BUS.W - 0.3, 0.26, [0, 136, 512, 64]); g.translate(0, 2.6, vehicleModelsReady() ? L2 + 0.04 : L2 - 0.02); wg.push(g); }   // (the Blender shell's sign box is 5 cm further forward)
  const names = new THREE.Mesh(mergeGeos2(wg), new THREE.MeshBasicMaterial({ map: busWords(), fog: true }));
  names.name = 'bus-words'; root.add(names);
  const sign = names;
  // ---- the inside (one batch): floor, seats, poles and rails, the driver's cab, the fare box, the ceiling and its lights
  const inside = new THREE.Group(); inside.name = 'bus-inside';
  const b = new Batcher({ vertexColors: true, castShadow: false });
  b.boxMinMax(-W2 + 0.06, 0.2, -L2 + 0.12, W2 - 0.06, F0, L2 - 0.14, '#5b5f66');                             // the floor
  b.boxMinMax(-W2 + 0.06, BUS.roofY - 0.02, -L2 + 0.12, W2 - 0.06, BUS.roofY + 0.02, L2 - 0.14, '#f3efe4');  // the ceiling
  for (const d of D) b.boxMinMax(-W2 + 0.06, F0, d.z0, -W2 + 0.3, F0 + 0.012, d.z1, '#f1c94a');              // the doors' yellow edge
  b.boxMinMax(-W2 + 0.06, 0.2, -L2 + 0.12, W2 - 0.06, BUS.beltY - 0.05, -L2 + 0.2, '#e7dfcc');               // the back wall inside
  b.boxMinMax(W2 - 0.12, F0, -L2 + 0.12, W2 - 0.06, BUS.beltY, L2 - 0.14, '#e7dfcc');                         // the driver's side wall inside
  for (const s of BUS_SEATS) {
    const y = s.y, w = s.z < -4 ? 0.76 : s.x > 0 ? 0.8 : 0.62, x = s.x;
    if (y > F0 + 0.5) b.boxMinMax(x - w / 2, F0, s.z - 0.3, x + w / 2, y - 0.38, s.z + 0.28, '#55524c');    // (the step over the wheel)
    b.boxMinMax(x - 0.04, Math.max(F0, y - 0.4), s.z - 0.04, x + 0.04, y - 0.12, s.z + 0.04, '#8d9098');       // the leg
    b.boxMinMax(x - w / 2, y - 0.12, s.z - 0.24, x + w / 2, y, s.z + 0.24, '#2f6b5f');                         // the cushion
    b.boxMinMax(x - w / 2, y, s.z - 0.3, x + w / 2, y + 0.62, s.z - 0.2, '#2f6b5f');                           // the back
    b.boxMinMax(x - w / 2 + 0.04, y + 0.62, s.z - 0.29, x + w / 2 - 0.04, y + 0.68, s.z - 0.21, '#d9a63a');   // a grab bar on top
  }
  // poles at the doors and the aisle, rails along the ceiling, a few stop buttons
  for (const [x, z] of [[BUS.aisle.x0 + 0.02, 3.25], [BUS.aisle.x0 + 0.02, 0.78], [BUS.aisle.x0 + 0.02, -0.78], [BUS.aisle.x1 - 0.02, 2.45], [BUS.aisle.x1 - 0.02, -0.95], [BUS.aisle.x1 - 0.02, -3.0]]) {
    b.add(GEO.cyl8, '#f1c94a', { x, y: (F0 + BUS.roofY) / 2, z, sx: 0.025, sy: BUS.roofY - F0, sz: 0.025 });
    b.add(GEO.box, '#d8343c', { x, y: 1.45, z, sx: 0.06, sy: 0.08, sz: 0.06 });
  }
  for (const x of [BUS.aisle.x0 + 0.02, BUS.aisle.x1 - 0.02]) b.add(GEO.cyl8, '#f1c94a', { x, y: 2.15, z: -0.6, sx: 0.022, sy: BUS.L - 2.6, sz: 0.022, rx: Math.PI / 2 });
  // the driver's cab: the seat on its box, a screen behind it, the dashboard and the wheel, the fare box by the door
  const Dr = BUS.driver;
  b.boxMinMax(Dr.x - 0.3, F0, Dr.z - 0.28, Dr.x + 0.3, Dr.seatY - 0.12, Dr.z + 0.26, '#3a3f47');
  b.boxMinMax(Dr.x - 0.27, Dr.seatY - 0.12, Dr.z - 0.25, Dr.x + 0.27, Dr.seatY, Dr.z + 0.25, '#1f3d58');
  b.boxMinMax(Dr.x - 0.27, Dr.seatY, Dr.z - 0.33, Dr.x + 0.27, Dr.seatY + 0.72, Dr.z - 0.23, '#1f3d58');
  b.boxMinMax(BUS.aisle.x1 + 0.02, F0, Dr.z - 0.48, W2 - 0.1, 1.5, Dr.z - 0.43, '#c9c1b0');                       // the screen behind
  b.boxMinMax(-W2 + 0.1, F0, L2 - 0.62, W2 - 0.1, 1.05, L2 - 0.14, '#3a3f47');                                    // the dashboard
  b.boxMinMax(Dr.x - 0.4, 1.0, L2 - 0.62, Dr.x + 0.4, 1.1, L2 - 0.3, '#2b2b2f');
  const W = BUS.wheel;
  b.add(GEO.cyl8, '#2b2b2f', { x: W.x, y: W.y - 0.2, z: W.z + 0.32, sx: 0.05, sy: 0.75, sz: 0.05, rx: 0.95 });   // the column down into the dash
  b.add(new THREE.TorusGeometry(W.r, 0.035, 6, 28), '#2b2b2f', { x: W.x, y: W.y, z: W.z, rx: -0.62 });
  b.add(GEO.box, '#2b2b2f', { x: W.x, y: W.y, z: W.z, sx: W.r * 1.9, sy: 0.05, sz: 0.03, rx: -0.62 });   // (a spoke across)
  b.add(GEO.cyl12, '#3a3f47', { x: W.x, y: W.y, z: W.z, sx: 0.09, sy: 0.05, sz: 0.09, rx: Math.PI / 2 - 0.62 });
  b.boxMinMax(0.02, F0, 4.05, 0.3, 1.18, 4.35, '#8d9098');                                                         // the fare box, by the driver
  b.boxMinMax(0.04, 1.18, 4.08, 0.28, 1.22, 4.32, '#2f6b5f');
  b.build(inside, 'bus-inside').forEach(m => { m.receiveShadow = false; });
  // the ceiling lights: two strips that glow (a lamp material: pale by day, bright at night)
  const lb = new Batcher({ castShadow: false });
  for (const x of [-0.75, 0.6]) lb.add(GEO.box, lampGlow('#fff6d8'), { x, y: BUS.roofY - 0.04, z: -0.4, sx: 0.12, sy: 0.03, sz: BUS.L - 2.4 });
  lb.build(inside, 'bus-inside-lights');
  root.add(inside); out.inside = inside;
  out.names = names; out.sign = sign;
  return out;
}
function mergeGeos2(list) { // positions and uvs
  const pos = [], uv = [];
  for (const g of list) { const n = g.index ? g.toNonIndexed() : g; pos.push(...n.attributes.position.array); uv.push(...n.attributes.uv.array); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
function mergeGeos(list) {
  const pos = [];
  for (const g of list) { const n = g.index ? g.toNonIndexed() : g; pos.push(...n.attributes.position.array); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}
