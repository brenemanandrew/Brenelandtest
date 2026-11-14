// The bus stop and the tunnel at the west end of Summit Rd: the plaza, the shelter with its bench, timetable and route map,
// the sign, and the bay paint. Built once into the town's batches by world-town.js. The bus itself lives in cars.js and bus.js.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { BUS_STOP, BUS_TUNNEL, CAR_LOT, SIDEWALK_W } from './layout.js';
import { TAR_Y, WALK_Y, paveField } from './road-net.js';
import { terrainHeight, addSurface } from './terrain.js';
import { GEO } from './batch.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { redrawWhenFontsLoad } from './toon.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { addSeat } from './seats.js';

export const ROUTE = { no: '7', name: 'Breneland Loop' };
const PAVER = '#cdbfa6', PAVER_LINE = '#b3a58c', FRAME = '#2f6b5f', ROOF = '#efe9dc', BENCH = '#a8743f', METAL = '#3a3f47';
const YELLOW = '#f1c94a', WHITE = '#f4f2ea', CONCRETE = '#b9b2a6', STONE = '#9d968b';
const FONT = 'Fredoka';
const F = (w, px) => `${w} ${px}px "${FONT}", "Trebuchet MS", sans-serif`;

// What bus.js and the tests reach: the timetable canvas, the bench seats, the plaza.
export const STOP_PARTS = { timetable: null, benchSeats: [], glass: null, shelterBoxes: [] };

// ------------------------------------------------------------------ canvases

// All the signs share one canvas atlas, so one texture and one mesh (finishBusSigns). Each region has its own draw function.
const ATLAS = { S: 1024, c: null, g: null, tex: null, geos: [] };
function region(x, y, w, h, draw, fonts = [F(700, 60)]) {
  if (!ATLAS.c) { const c = document.createElement('canvas'); c.width = c.height = ATLAS.S; ATLAS.c = c; ATLAS.g = c.getContext('2d'); ATLAS.tex = new THREE.CanvasTexture(c); ATLAS.tex.colorSpace = THREE.SRGBColorSpace; ATLAS.tex.anisotropy = 4; }
  const g = ATLAS.g;
  const redraw = () => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); g.clearRect(0, 0, w, h); draw(g, w, h); g.restore(); ATLAS.tex.needsUpdate = true; };
  redraw();
  redrawWhenFontsLoad(redraw, fonts);
  return { tex: ATLAS.tex, redraw, uv: [x, y, w, h] };
}
// a face for region r: pw x ph metres, turned ry about y, its middle at pos
function signFace(r, pw, ph, pos, ry) {
  const geo = new THREE.PlaneGeometry(pw, ph), uv = geo.attributes.uv, S = ATLAS.S, [x, y, w, h] = r.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (x + u * w) / S, 1 - (y + (1 - v) * h) / S); }
  geo.rotateY(ry); geo.translate(pos[0], pos[1], pos[2]);
  ATLAS.geos.push(geo);
}
// all the sign faces as one mesh (world-town.js calls it after the stop and the tunnel are built)
export function finishBusSigns(group) {
  if (!ATLAS.geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(ATLAS.geos, false), new THREE.MeshBasicMaterial({ map: ATLAS.tex, fog: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ATLAS.geos.forEach(g => g.dispose()); ATLAS.geos.length = 0;
  m.name = 'bus-stop-signs'; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m);
  return m;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// a little side-on bus, the pictogram on the signs (x, y its top left, w its length)
export function drawBusIcon(g, x, y, w, body = '#ffffff', glass = '#2f6b5f') {
  const h = w * 0.5;
  g.fillStyle = body; rr(g, x, y, w, h * 0.82, h * 0.16); g.fill();
  g.fillStyle = glass;
  for (let i = 0; i < 4; i++) g.fillRect(x + w * (0.08 + i * 0.19), y + h * 0.12, w * 0.15, h * 0.28);
  g.fillRect(x + w * 0.85, y + h * 0.12, w * 0.1, h * 0.5);
  g.fillStyle = body;
  for (const wx of [0.24, 0.74]) { g.beginPath(); g.arc(x + w * wx, y + h * 0.84, h * 0.17, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = glass;
  for (const wx of [0.24, 0.74]) { g.beginPath(); g.arc(x + w * wx, y + h * 0.84, h * 0.07, 0, Math.PI * 2); g.fill(); }
}
function fitText(g, text, maxW, weight, px) { let s = px; g.font = F(weight, s); while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = F(weight, s); } return s; }

// The flag on the pole: a red BUS STOP band, the bus, the stop's name and the route number.
function flagTexture() {
  return region(768, 272, 256, 360, (g, w, h) => {
    g.fillStyle = '#ffffff'; rr(g, 4, 4, w - 8, h - 8, 26); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#1f3d58'; rr(g, 4, 4, w - 8, h - 8, 26); g.stroke();
    g.fillStyle = '#d8343c'; rr(g, 18, 18, w - 36, 86, 20); g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, 'BUS STOP', w - 60, 700, 50); g.fillText('BUS STOP', w / 2, 62);
    drawBusIcon(g, 48, 120, 160, '#1f3d58', '#ffffff');
    g.fillStyle = '#1f3d58'; fitText(g, 'Breneland', w - 40, 700, 44); g.fillText('Breneland', w / 2, 236);
    g.fillStyle = '#2f6b5f'; rr(g, w / 2 - 64, 270, 128, 70, 16); g.fill();
    g.fillStyle = '#ffffff'; g.font = F(700, 52); g.fillText(ROUTE.no, w / 2, 307);
  });
}
// BUS STOP painted on the bay's tar. Drawn turned a quarter in the atlas (wordsFace turns it back), on a clear background so the
// atlas's alphaTest cuts the letters out.
const TW = 220, TH = 760;
function tarWordsTexture() {
  return region(264, 664, TH, TW, g => {
    g.translate(0, TW); g.rotate(-Math.PI / 2);   // (tall (tx, ty) lands at (ty, TW - tx))
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [word, y] of [['STOP', TH * 0.27], ['BUS', TH * 0.73]]) {
      g.save(); g.translate(TW / 2, y); g.scale(1, 2.3);
      fitText(g, word, TW - 16, 700, 104); g.fillText(word, 0, 0);
      g.restore();
    }
  }, [F(700, 104)]);
}
function wordsFace(r, pw, ph, pos) {
  const geo = new THREE.PlaneGeometry(pw, ph), uv = geo.attributes.uv, S = ATLAS.S, [x0, y0] = r.uv;
  for (let i = 0; i < uv.count; i++) { const tx = uv.getX(i) * TW, ty = (1 - uv.getY(i)) * TH; uv.setXY(i, (x0 + ty) / S, 1 - (y0 + TW - tx) / S); }
  geo.rotateX(-Math.PI / 2); geo.translate(pos[0], pos[1], pos[2]);
  ATLAS.geos.push(geo);
}
// The fascia over the shelter's open side
function fasciaTexture() {
  return region(0, 0, 1024, 96, (g, w, h) => {
    g.fillStyle = FRAME; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    drawBusIcon(g, 24, 18, 110, '#ffffff', FRAME);
    g.fillStyle = '#ffffff'; g.font = F(700, 58); g.fillText('BUS STOP', 160, h / 2 + 2);
    g.textAlign = 'right'; g.font = F(600, 44); g.fillText(`Route ${ROUTE.no}  ·  ${ROUTE.name}`, w - 28, h / 2 + 2);
  }, [F(700, 58), F(600, 44)]);
}
// The route map poster: the town's roads, the loop the bus drives, its stop and the tunnel.
function mapTexture() {
  return region(0, 272, 512, 384, (g, w, h) => {
    g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = FRAME; g.fillRect(0, 0, w, 58);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = F(700, 34);
    g.fillText(`Route ${ROUTE.no}  ${ROUTE.name}`, 18, 30);
    // the map: x -216..60 -> 30..490, z -132..-42 -> 90..350
    const X = x => 30 + (x + 216) / 276 * 460, Z = z => 90 + (z + 132) / 90 * 250;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#c9c1b0'; g.lineWidth = 16;
    g.beginPath(); g.moveTo(X(-192), Z(-126.5)); g.lineTo(X(59), Z(-126.5)); g.stroke();                  // Summit Rd
    g.beginPath(); g.moveTo(X(-107.5), Z(-126.5)); g.lineTo(X(-107.5), Z(-84)); g.lineTo(X(-101), Z(-53)); g.lineTo(X(-92), Z(-48.5)); g.lineTo(X(57), Z(-48.5)); g.stroke(); // Breneland Rd
    g.beginPath(); g.moveTo(X(-20), Z(-48.5)); g.lineTo(X(-20), Z(-126.5)); g.stroke();                  // Maple Ave
    g.strokeStyle = '#d8343c'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(X(-200), Z(-126.5)); g.lineTo(X(-107.5), Z(-126.5)); g.lineTo(X(-107.5), Z(-84)); g.lineTo(X(-101), Z(-53)); g.lineTo(X(-92), Z(-48.5)); g.lineTo(X(-20), Z(-48.5)); g.lineTo(X(-20), Z(-126.5)); g.lineTo(X(-107.5), Z(-126.5)); g.stroke();
    // the tunnel: a dark arch at the left
    g.fillStyle = '#4a4540'; g.beginPath(); g.arc(X(-204), Z(-126.5) + 6, 16, Math.PI, 0); g.fill();
    g.fillStyle = '#111111'; g.beginPath(); g.arc(X(-204), Z(-126.5) + 6, 10, Math.PI, 0); g.fill();
    // the stop, our house, the park
    g.fillStyle = '#2f6b5f'; g.beginPath(); g.arc(X(-113.8), Z(-94.5), 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.font = F(700, 14); g.textAlign = 'center'; g.fillText(ROUTE.no, X(-113.8), Z(-94.5) + 1);
    g.fillStyle = '#e88fb3'; g.fillRect(X(-6), Z(-40) + 4, 22, 16);
    g.fillStyle = '#7fb069'; g.fillRect(X(-100), Z(-40) + 4, 46, 20);
    g.fillStyle = '#3a3f47'; g.textAlign = 'left'; g.font = F(600, 18);
    g.fillText('Tunnel', X(-216), Z(-126.5) + 30);
    g.fillText('Summit Rd', X(-60), Z(-126.5) - 18);
    g.fillText('Breneland Rd', X(-60), Z(-48.5) + 22);
    g.fillText('Maple Ave', X(-16), Z(-90));
    g.fillStyle = '#d8343c'; g.font = F(700, 20); g.fillText('You are here', X(-190), Z(-90));
    g.strokeStyle = '#d8343c'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(-125), Z(-92)); g.lineTo(X(-117), Z(-94)); g.stroke();
  }, [F(700, 34), F(600, 18)]);
}
// The timetable panel (bus.js redraws it with the next bus: STOP_PARTS.timetable.set(lines))
function timetableTexture() {
  const T = { lines: ['Every 30 minutes', 'Next bus', '-', ''] };
  const t = region(520, 272, 240, 360, (g, w, h) => {
    g.fillStyle = '#fffdf6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3d58'; g.fillRect(0, 0, w, 64);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, 'Timetable', w - 30, 700, 40); g.fillText('Timetable', w / 2, 34);
    g.fillStyle = '#2f6b5f'; rr(g, 20, 80, 70, 56, 12); g.fill();
    g.fillStyle = '#ffffff'; g.font = F(700, 40); g.fillText(ROUTE.no, 55, 110);
    g.fillStyle = '#1f3d58'; g.textAlign = 'left'; fitText(g, ROUTE.name, w - 120, 600, 26); g.fillText(ROUTE.name, 102, 108);
    g.textAlign = 'center';
    g.fillStyle = '#3a3f47'; fitText(g, T.lines[0], w - 30, 600, 26); g.fillText(T.lines[0], w / 2, 166);
    g.fillStyle = '#8a8378'; g.font = F(600, 24); g.fillText(T.lines[1], w / 2, 212);
    g.fillStyle = '#d8343c'; fitText(g, T.lines[2], w - 30, 700, 56); g.fillText(T.lines[2], w / 2, 260);
    g.fillStyle = '#3a3f47'; fitText(g, T.lines[3], w - 30, 600, 26); g.fillText(T.lines[3], w / 2, 312);
  }, [F(700, 56), F(600, 26)]);
  t.set = lines => { if (lines.join('|') === T.lines.join('|')) return false; T.lines = lines.slice(); t.redraw(); return true; };
  t.lines = () => T.lines.slice();
  return t;
}

// ------------------------------------------------------------------ the corner

// The corner between the shops' lot, the stop's path and Breneland Rd's sidewalk. The lot ends at a kerb, and the path from the
// shelter runs straight between two low hedges, with flowers in the wide end of the bed by the sidewalk.
const KERB = '#bdb7ab', HEDGE = ['#3f8a3f', '#4a9a45'];
export const CORNER = { kerbX: null, hedgeX: null, beds: [] };   // (for the tests)
function buildCorner(b, f, colliders, L) {
  const P = BUS_STOP.plaza, Pa = BUS_STOP.path, G = WALK_Y, back = -126.5 + 4.5 + SIDEWALK_W;   // (Summit Rd's south sidewalk's back edge)
  // the lot's kerbs: along its east side (x = its maxX) from the sidewalk to its back, and across its back
  const kx = CAR_LOT.maxX;
  b.boxMinMax(kx - 0.08, 0.3, back, kx + 0.12, 0.52, CAR_LOT.maxZ + 0.12, KERB);
  b.boxMinMax(CAR_LOT.minX + 0.01, 0.3, CAR_LOT.maxZ - 0.08, kx + 0.12, 0.52, CAR_LOT.maxZ + 0.12, KERB); // (a hair in from the pad's west edge: level with it, the two faces flickered)
  CORNER.kerbX = kx;
  // a low hedge on the grass beside that kerb, straight on to the plaza (a row of clipped bushes, solid)
  const hx = kx + 0.62, z0 = back + 0.55, z1 = P.minZ - 0.45, n = Math.round((z1 - z0) / 0.78);
  for (let i = 0; i <= n; i++) {
    const z = z0 + (z1 - z0) * i / n;
    b.add(GEO.ico1, HEDGE[i % 2], { x: hx + (i % 3 === 1 ? 0.04 : -0.03), y: 0.62 + (i % 2) * 0.05, z, sx: 0.42, sy: 0.42, sz: 0.5, ry: i * 1.7 });
  }
  colliders.push({ type: 'box', minX: hx - 0.38, maxX: hx + 0.38, minZ: z0 - 0.4, maxZ: z1 + 0.4 });
  CORNER.hedgeX = hx;
  // edging along both sides of the path, and the plaza's north side (but where the path comes in)
  b.boxMinMax(Pa.minX - 0.14, 0.3, back, Pa.minX, G + 0.06, P.minZ, KERB);
  b.boxMinMax(Pa.maxX, 0.3, back, Pa.maxX + 0.14, G + 0.06, P.minZ, KERB);
  b.boxMinMax(P.minX - 0.16, 0.3, P.minZ - 0.14, Pa.minX - 0.14, G + 0.06, P.minZ, KERB);
  b.boxMinMax(Pa.maxX + 0.14, 0.3, P.minZ - 0.14, P.maxX, G + 0.06, P.minZ, KERB);
  // the bed between the path and the sidewalk narrows along the bay's taper: hedge as far as it fits, flowers in its wide end
  const ex = z => { let x = Pa.maxX + 0.2; while (x < Pa.maxX + 8 && paveField(x, z) > SIDEWALK_W) x += 0.05; return x; };   // (the sidewalk's back edge)
  const ex0 = Pa.maxX + 0.62;
  let zEnd = z0;
  for (let z = z0; z <= z1 + 1e-6; z += 0.25) { if (ex(z) - Pa.maxX < 1.05) break; zEnd = z; }
  const m = Math.max(1, Math.round((zEnd - z0) / 0.78));
  for (let i = 0; i <= m; i++) {
    const z = z0 + (zEnd - z0) * i / m;
    b.add(GEO.ico1, HEDGE[(i + 1) % 2], { x: ex0 + (i % 3 === 1 ? -0.04 : 0.03), y: 0.62 + ((i + 1) % 2) * 0.05, z, sx: 0.42, sy: 0.42, sz: 0.5, ry: i * 1.3 });
  }
  colliders.push({ type: 'box', minX: ex0 - 0.38, maxX: ex0 + 0.38, minZ: z0 - 0.4, maxZ: zEnd + 0.4 });
  CORNER.beds.push({ hedgeX: ex0, z0, z1: zEnd });
  for (let z = z0 + 0.6, k = 0; z < zEnd; z += 1.6, k++) {
    const w = ex(z) - (ex0 + 0.5);
    if (w < 0.7) continue;
    for (let j = 0; j < 2; j++) f.add(GEO.sphere, ['#f07a7a', '#f1c94a', '#ffffff'][(k + j) % 3], { x: ex0 + 0.5 + w * (0.3 + 0.4 * j), y: 0.45, z: z + j * 0.6, sx: 0.09, sy: 0.09, sz: 0.09 });
  }
}

// ------------------------------------------------------------------ the stop

// b, f: the town's batches (solid; details without shadows); group: for the textured faces; lamp: world-town's street lamp
export function buildBusStop(b, f, group, colliders, lamp) {
  const P = BUS_STOP.plaza, L = BUS_STOP.link, Pa = BUS_STOP.path, G = WALK_Y;
  // ---- the plaza and its path (the pavers are flush with the sidewalk)
  b.boxMinMax(P.minX, 0.3, P.minZ, P.maxX, G, P.maxZ, PAVER);
  b.boxMinMax(Pa.minX, 0.3, Pa.minZ + 0.05, Pa.maxX, G, Pa.maxZ, PAVER); // (from the sidewalk's back edge, which reaches 5 cm past the path's line: over it the two tops flickered)
  addSurface({ minX: P.minX, maxX: P.maxX, minZ: P.minZ, maxZ: P.maxZ, y: G });
  addSurface({ minX: Pa.minX, maxX: Pa.maxX, minZ: Pa.minZ, maxZ: Pa.maxZ, y: G });
  for (let x = P.minX + 1.2; x < P.maxX - 0.2; x += 1.2) f.add(GEO.box, PAVER_LINE, { x, y: G + 0.004, z: (P.minZ + P.maxZ) / 2, sx: 0.05, sy: 0.01, sz: P.maxZ - P.minZ - 0.1 });
  for (let z = P.minZ + 1.2; z < P.maxZ - 0.2; z += 1.2) f.add(GEO.box, PAVER_LINE, { x: (P.minX + P.maxX) / 2, y: G + 0.004, z, sx: P.maxX - P.minX - 0.1, sy: 0.01, sz: 0.05 });
  for (let z = Pa.minZ + 1.2; z < Pa.maxZ; z += 1.2) f.add(GEO.box, PAVER_LINE, { x: (Pa.minX + Pa.maxX) / 2, y: G + 0.004, z, sx: Pa.maxX - Pa.minX - 0.1, sy: 0.01, sz: 0.05 });
  // a low kerb round the plaza's grass sides
  b.boxMinMax(P.minX - 0.16, 0.3, P.minZ, P.minX, G + 0.06, P.maxZ, '#bdb7ab');
  b.boxMinMax(P.minX - 0.16, 0.3, P.maxZ, P.maxX, G + 0.06, P.maxZ + 0.16, '#bdb7ab');
  buildCorner(b, f, colliders, L);

  // ---- the shelter: open to the bay (east), glass at the back and the ends, a bench, the timetable and the map
  const S = BUS_STOP.shelter, xb = S.x - S.d / 2, xf = S.x + S.d / 2, z0 = S.z - S.w / 2, z1 = S.z + S.w / 2, H = 2.45;
  for (const [px, pz] of [[xb + 0.06, z0 + 0.06], [xb + 0.06, z1 - 0.06], [xf - 0.08, z0 + 0.06], [xf - 0.08, z1 - 0.06], [xb + 0.06, S.z]]) {
    b.add(GEO.box, FRAME, { x: px, y: G + H / 2, z: pz, sx: 0.1, sy: H, sz: 0.1 });
    colliders.push({ type: 'circle', x: px, z: pz, r: 0.12 });
  }
  // the roof: a slab with a lip, falling a little to the back; the fascia over the open side
  b.boxMinMax(xb - 0.3, G + H, z0 - 0.35, xf + 0.5, G + H + 0.16, z1 + 0.35, ROOF);
  b.boxMinMax(xb - 0.32, G + H - 0.12, z0 - 0.37, xb - 0.2, G + H + 0.2, z1 + 0.37, FRAME);
  b.boxMinMax(xf + 0.42, G + H - 0.2, z0 - 0.37, xf + 0.56, G + H + 0.22, z1 + 0.37, FRAME);
  for (const zz of [z0 - 0.37, z1 + 0.25]) b.boxMinMax(xb - 0.32, G + H - 0.12, zz, xf + 0.56, G + H + 0.2, zz + 0.12, FRAME);
  signFace(fasciaTexture(), S.w + 0.6, 0.4, [xf + 0.565, G + H + 0.01, S.z], Math.PI / 2);
  // the light under the roof
  b.add(GEO.box, lampGlow('#fff3c4'), { x: S.x + 0.2, y: G + H - 0.04, z: S.z, sx: 0.3, sy: 0.06, sz: S.w - 1.2 });
  addNightSpot({ x: S.x + 0.3, y: G + H - 0.2, z: S.z, color: '#ffe6b0', pool: 3.2, gy: G, halo: 0.8 });
  // the frames the glass sits in (rails top and bottom, at the back and both ends)
  const GH0 = G + 0.12, GH1 = G + 2.3, ends = xb + 1.55;
  for (const y of [GH0, GH1]) {
    b.boxMinMax(xb, y - 0.04, z0, xb + 0.08, y + 0.04, z1, FRAME);
    for (const zz of [z0, z1 - 0.08]) b.boxMinMax(xb, y - 0.04, zz, ends, y + 0.04, zz + 0.08, FRAME);
  }
  for (const zz of [z0, z1 - 0.08]) b.boxMinMax(ends - 0.08, G, zz, ends, GH1 + 0.04, zz + 0.08, FRAME);
  // the glass (one transparent mesh: back and ends), with a soft frosted band at eye height so it reads as glass
  const gb = [];
  const pane = (x0, x1, za, zb2) => { const g = new THREE.BoxGeometry(Math.max(0.02, x1 - x0), GH1 - GH0 - 0.08, Math.max(0.02, zb2 - za)); g.translate((x0 + x1) / 2, (GH0 + GH1) / 2, (za + zb2) / 2); gb.push(g); };
  pane(xb + 0.02, xb + 0.06, z0 + 0.1, S.z - 0.06); pane(xb + 0.02, xb + 0.06, S.z + 0.06, z1 - 0.1);
  pane(xb + 0.1, ends - 0.1, z0 + 0.02, z0 + 0.06); pane(xb + 0.1, ends - 0.1, z1 - 0.06, z1 - 0.02);
  const glassGeo = mergeBoxes(gb);
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.32, depthWrite: false, fog: true }));
  glass.name = 'bus-stop-glass'; glass.renderOrder = 1;
  STOP_PARTS.glass = glass;
  for (const zz of [z0 + 0.04, z1 - 0.04]) f.boxMinMax(xb + 0.12, G + 1.3, zz - 0.012, ends - 0.12, G + 1.42, zz + 0.012, '#ffffff'); // (a white band across each end pane)
  colliders.push({ type: 'box', minX: xb - 0.05, maxX: xb + 0.12, minZ: z0, maxZ: z1 });
  colliders.push({ type: 'box', minX: xb, maxX: ends, minZ: z0 - 0.05, maxZ: z0 + 0.1 });
  colliders.push({ type: 'box', minX: xb, maxX: ends, minZ: z1 - 0.1, maxZ: z1 + 0.05 });
  STOP_PARTS.shelterBoxes = [{ minX: xb - 0.3, maxX: xf + 0.5, minZ: z0 - 0.35, maxZ: z1 + 0.35, top: G + H + 0.2 }];
  // the bench along the back, facing the bay: slats on two metal legs (sittable: seats.js, four places)
  const bx = xb + 0.5, bz0 = S.z - 2.25, bz1 = S.z + 2.25, seatY = G + 0.3; // (seat-height: was 0.46, the feet hung 17 cm)
  for (let k = 0; k < 3; k++) b.boxMinMax(bx - 0.24 + k * 0.165, seatY - 0.05, bz0, bx - 0.1 + k * 0.165, seatY, bz1, BENCH);
  for (let k = 0; k < 2; k++) b.boxMinMax(xb + 0.14, seatY + 0.14 + k * 0.17, bz0, xb + 0.2, seatY + 0.26 + k * 0.17, bz1, BENCH);
  for (const zz of [bz0 + 0.25, S.z, bz1 - 0.25]) {
    b.boxMinMax(bx - 0.04, G, zz - 0.04, bx + 0.04, seatY - 0.05, zz + 0.04, METAL);
    b.boxMinMax(bx - 0.26, seatY - 0.09, zz - 0.04, bx + 0.12, seatY - 0.05, zz + 0.04, METAL);
  }
  colliders.push({ type: 'box', minX: xb, maxX: bx + 0.18, minZ: bz0, maxZ: bz1 });
  STOP_PARTS.benchSeats.length = 0;
  for (const k of [-1.65, -0.55, 0.55, 1.65]) {
    const s = { x: bx + 0.1, z: S.z + k, y: seatY, floor: G, yaw: Math.PI / 2 }; // (floor: where a waiting rider's feet stand, bus.js) // (the knees just past the slats' front edge, the calves clear: house-scale)
    addSeat(s.x, s.z, s.y, s.yaw, 'bench', 'E  Sit on the bus stop bench', { front: 0.13 }); // (front: the slats' front edge, seats.js seatFit)
    STOP_PARTS.benchSeats.push(s);
  }
  // the timetable (north end of the back wall) and the route map (south end), both facing the bay above the bench
  const tt = timetableTexture();
  STOP_PARTS.timetable = tt;
  signFace(tt, 0.7 * 240 / 256, 0.98, [xb + 0.14, G + 1.62, S.z - 1.75], Math.PI / 2);
  b.boxMinMax(xb + 0.08, G + 1.08, S.z - 2.15, xb + 0.13, G + 2.16, S.z - 1.35, FRAME);
  signFace(mapTexture(), 1.4, 1.05, [xb + 0.14, G + 1.62, S.z + 1.45], Math.PI / 2);
  b.boxMinMax(xb + 0.08, G + 1.05, S.z + 0.7, xb + 0.13, G + 2.19, S.z + 2.2, FRAME);

  // ---- the BUS STOP sign on its pole at the bay's front end (the flag faces up and down the road, both sides)
  const sg = BUS_STOP.sign;
  const signModel = propsReady('bus_stop_sign');
  if (signModel) addProp(b, 'bus_stop_sign', { x: sg.x, y: G, z: sg.z }); // (props-static: the Blender pole, flag plate and timetable case; the faces stay the game's)
  else {
    b.add(GEO.cyl8, METAL, { x: sg.x, y: G + 1.6, z: sg.z, sx: 0.06, sy: 3.2, sz: 0.06 });
    b.add(GEO.box, METAL, { x: sg.x + 0.25, y: G + 2.66, z: sg.z, sx: 0.62, sy: 1.28, sz: 0.05 });
  }
  colliders.push({ type: 'circle', x: sg.x, z: sg.z, r: 0.1 });
  const flag = flagTexture();
  for (const s of [1, -1]) signFace(flag, 0.6, 0.84, [sg.x + 0.25, G + 2.66, sg.z + s * 0.03], s > 0 ? 0 : Math.PI);
  // a little timetable case on the pole (the side people stand on)
  if (!signModel) b.add(GEO.box, '#e9e2d0', { x: sg.x - 0.07, y: G + 1.45, z: sg.z, sx: 0.06, sy: 0.5, sz: 0.36 });

  // ---- a bin and a lamp
  b.add(GEO.cyl12, '#2f6b4f', { x: -118.85, y: G + 0.45, z: -98.4, sx: 0.28, sy: 0.9, sz: 0.28 });
  b.add(GEO.cyl12, '#24523c', { x: -118.85, y: G + 0.93, z: -98.4, sx: 0.31, sy: 0.08, sz: 0.31 });
  b.add(GEO.box, '#1e1e22', { x: -118.85 + 0.25, y: G + 0.72, z: -98.4, sx: 0.06, sy: 0.12, sz: 0.2 });
  colliders.push({ type: 'circle', x: -118.85, z: -98.4, r: 0.32 });
  lamp(b, -118.7, -101.2, 1, 0, colliders);

  // ---- the bay's paint: the yellow kerb, a yellow dashed line where the lane was, BUS STOP on the tar
  const bay = BUS_STOP.bay, bx0 = bay[1][0], zA = bay[1][1] + 0.6, zB = bay[2][1] - 0.6;
  f.add(GEO.box, YELLOW, { x: bx0 - 0.09, y: WALK_Y + 0.006, z: (zA + zB) / 2, sx: 0.14, sy: 0.01, sz: zB - zA });
  for (let z = -110; z < -83; z += 1.6) f.add(GEO.box, YELLOW, { x: -112.05, y: TAR_Y + 0.008, z, sx: 0.14, sy: 0.012, sz: 0.9 });
  wordsFace(tarWordsTexture(), 2.5, 8.6, [-113.65, TAR_Y + 0.012, -96]);

  group.add(glass); glass.matrixAutoUpdate = false; glass.updateMatrix();
}
function mergeBoxes(list) {
  const pos = [];
  for (const g of list) { const n = g.toNonIndexed(); pos.push(...n.attributes.position.array); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

// ------------------------------------------------------------------ the tunnel

// The portal: a concrete headwall set into the hill, and a tube inside that goes from grey to black a few metres in, so the bus
// drives into the dark. Players never get in: the map's edge is the portal's face, and a collider stands across the mouth.
export const TUNNEL_PARTS = { curtains: null };
export function buildTunnel(b, f, group, colliders, lamp) {
  const T = BUS_TUNNEL, x0 = T.x, cz = T.z, hw = T.w / 2, AH = T.h, spring = AH - hw * 0.45; // the arch: straight walls to `spring`, then an elliptic arch to AH
  const DEPTH = 7, WALL_W = 17, WALL_H = 8.6;
  // the arch's outline (z, y) from the left foot round to the right foot
  const arch = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI - (i / 16) * Math.PI; arch.push([cz + Math.cos(a) * hw, spring + Math.sin(a) * (AH - spring)]); }
  // the same outline pulled in by d all round (the walls in, the crown down)
  const inset = d => arch.map(([z, y]) => [cz + (z - cz) * (1 - d / hw), spring + (y - spring) * (1 - d / (AH - spring))]);
  // ---- the headwall block, a hole the arch's shape through it (shape in the (z, y) plane, extruded along -x)
  const shape = new THREE.Shape();
  shape.moveTo(cz - WALL_W / 2, 0); shape.lineTo(cz + WALL_W / 2, 0); shape.lineTo(cz + WALL_W / 2, WALL_H); shape.lineTo(cz - WALL_W / 2, WALL_H); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(cz - hw, 0); hole.lineTo(cz - hw, spring);
  for (const [z, y] of arch) hole.lineTo(z, y);
  hole.lineTo(cz + hw, 0); hole.closePath();
  shape.holes.push(hole);
  const block = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 4 });
  // shape x -> world z, shape y -> world y, extrusion (+z) -> world -x
  block.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, x0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  b.add(block, CONCRETE);
  // the stone ring round the arch, proud of the face, and a coping along the top
  const ring = new THREE.Shape();
  const outer = arch.map(([z, y]) => [cz + (z - cz) * 1.13, spring + (y - spring) * 1.18]);
  ring.moveTo(cz - hw * 1.13, 0); ring.lineTo(cz - hw * 1.13, spring); for (const [z, y] of outer) ring.lineTo(z, y); ring.lineTo(cz + hw * 1.13, 0);
  // (its inside edge 1 cm in from the hole's, so the two never share a face)
  const inner = inset(0.01);
  ring.lineTo(cz + hw - 0.01, 0); for (let i = inner.length - 1; i >= 0; i--) ring.lineTo(inner[i][0], inner[i][1]); ring.lineTo(cz - hw + 0.01, 0); ring.closePath();
  const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.22, bevelEnabled: false, curveSegments: 4 });
  ringGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, x0 + 0.2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  b.add(ringGeo, STONE);
  b.boxMinMax(x0 - DEPTH - 0.2, WALL_H, cz - WALL_W / 2 - 0.25, x0 + 0.3, WALL_H + 0.4, cz + WALL_W / 2 + 0.25, '#a7a094');
  for (const s of [-1, 1]) b.boxMinMax(x0 - 0.2, 0, cz + s * (WALL_W / 2) - 0.6, x0 + 0.45, WALL_H, cz + s * (WALL_W / 2) + 0.6, '#aaa397'); // pilasters
  // the name over the arch
  const name = region(0, 104, 1024, 160, (g, w, h) => {
    g.fillStyle = '#4a4540'; rr(g, 6, 6, w - 12, h - 12, 18); g.fill();
    g.fillStyle = '#f4efe0'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'SUMMIT TUNNEL', w - 80, 700, 96); g.fillText('SUMMIT TUNNEL', w / 2, h / 2 + 4);
  }, [F(700, 96)]);
  signFace(name, 7, 1.1, [x0 + 0.24, AH + 1.05, cz], Math.PI / 2);
  // ---- the inside: a tube in the arch's shape, grey at the mouth going to black, then a black back wall far in
  const xs = [x0 + 0.05, x0 - 2, x0 - 4.5, x0 - 7, x0 - 10, x0 - 14, x0 - 46];
  const shade = x => { const u = Math.min(1, Math.max(0, (x0 - x) / 12)); return 0.5 * Math.pow(1 - u, 1.6); };
  // (2 cm inside the headwall's hole, so the tube's walls don't fight the hole's faces)
  const tin = inset(0.02);
  const prof = [[cz - hw + 0.02, TAR_Y - 0.05], [cz - hw + 0.02, spring], ...tin.slice(1, -1), [cz + hw - 0.02, spring], [cz + hw - 0.02, TAR_Y - 0.05]];
  const pos = [], col = [];
  for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < prof.length - 1; k++) {
    const [za, ya] = prof[k], [zb2, yb2] = prof[k + 1], xa = xs[i], xc = xs[i + 1];
    const quad = [[xa, ya, za], [xc, ya, za], [xc, yb2, zb2], [xa, ya, za], [xc, yb2, zb2], [xa, yb2, zb2]];
    for (const [x, y, z] of quad) { pos.push(x, y, z); const c = shade(x) * (0.85 + 0.15 * Math.min(1, y / AH)); col.push(c * 1.0, c * 0.96, c * 0.9); }
  }
  // the floor past the road's end and the back wall
  const fl = [[x0 - 23, TAR_Y - 0.01, cz - hw], [x0 - 46, TAR_Y - 0.01, cz - hw], [x0 - 46, TAR_Y - 0.01, cz + hw], [x0 - 23, TAR_Y - 0.01, cz - hw], [x0 - 46, TAR_Y - 0.01, cz + hw], [x0 - 23, TAR_Y - 0.01, cz + hw]];
  for (const [x, y, z] of fl) { pos.push(x, y, z); col.push(0, 0, 0); }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tube.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const inside = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  inside.name = 'tunnel-inside';
  // dark veils across the tube: what drives in fades into the dark (they darken what is behind them; bus.js hides the bus past the last)
  const vg = [];
  for (const dx of [2.5, 5, 7.5, 10, 13]) {
    const g = new THREE.ShapeGeometry(new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y))));
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0 - dx, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1)); // shape (z, y) in the x = x0 - dx plane
    g.deleteAttribute('uv');
    vg.push(g);
  }
  // (one mesh: black at 0.4 each blends the same in any order, so the layers need no sorting)
  const veils = [new THREE.Mesh(mergeGeometries(vg, false), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false, fog: false, side: THREE.DoubleSide }))];
  veils[0].renderOrder = 3; veils[0].name = 'tunnel-veils';
  TUNNEL_PARTS.curtains = veils;
  // small orange lamps along the walls near the mouth
  for (const dx of [2.2, 6.5, 11]) for (const s of [-1, 1]) b.add(GEO.box, lampGlow('#ffb24a'), { x: x0 - dx, y: spring - 0.4, z: cz + s * (hw - 0.07), sx: 0.5, sy: 0.12, sz: 0.08 }); // (their backs 1 cm off the tube's wall)
  // a street lamp each side of the mouth, on the sidewalks, their arms over the road
  lamp(b, x0 + 2.2, cz - 5.05, 0, 1, colliders);   // (on the kerb's edge of the sidewalks, like the street's lamps: the walking line stays clear)
  lamp(b, x0 + 2.2, cz + 5.05, 0, -1, colliders);
  // BUSES ONLY on a post at the south sidewalk's end
  const bo = region(0, 664, 256, 256, (g, w, h) => {
    g.fillStyle = '#1f5fa8'; rr(g, 6, 6, w - 12, h - 12, 22); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; rr(g, 16, 16, w - 32, h - 32, 16); g.stroke();
    drawBusIcon(g, 48, 46, 160, '#ffffff', '#1f5fa8');
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'BUSES ONLY', w - 50, 700, 40); g.fillText('BUSES ONLY', w / 2, 192);
  }, [F(700, 40)]);
  const px = x0 + 0.9, pz = cz + 7.4, gy = WALK_Y;
  b.add(GEO.cyl8, METAL, { x: px, y: gy + 1.2, z: pz, sx: 0.05, sy: 2.4, sz: 0.05 });
  signFace(bo, 0.75, 0.75, [px + 0.04, gy + 2.05, pz], Math.PI / 2);
  b.add(GEO.box, METAL, { x: px - 0.01, y: gy + 2.05, z: pz, sx: 0.04, sy: 0.79, sz: 0.79 });
  colliders.push({ type: 'circle', x: px, z: pz, r: 0.1 });
  // nobody walks in (the map's edge is the face; this makes sure), the block and the pilasters are solid
  colliders.push({ type: 'box', minX: x0 - 1.2, maxX: x0 + 0.1, minZ: cz - WALL_W / 2 - 0.6, maxZ: cz + WALL_W / 2 + 0.6 });
  // ---- the hill it bores through: a grassy dome behind the headwall (a height field over the ground), rocks and a few pines
  buildHill(b, x0, cz, DEPTH, WALL_W);
  for (const m of [inside, ...veils]) { group.add(m); m.matrixAutoUpdate = false; m.updateMatrix(); }
}

function buildHill(b, x0, cz, depth, wallW) {
  const Hh = BUS_TUNNEL.hill;
  const dome = (x, z) => { const u = 1 - ((x - Hh.x) / Hh.rx) ** 2 - ((z - Hh.z) / Hh.rz) ** 2; return u > 0 ? Hh.h * Math.pow(u, 0.62) : 0; };
  // over the tube (and in the headwall's footprint, where the block hides it) the ground stays high enough to cover the arch
  const hgt = (x, z) => {
    let h = dome(x, z);
    const dz = Math.abs(z - cz) - wallW / 2;   // (the plateau ends inside the pilasters, which reach 0.6 m past the wall)
    if (x < x0 + 0.1 && dz < 0.6) h = Math.max(h, (BUS_TUNNEL.h + 1.2) * Math.min(1, (0.6 - dz) / 0.5));
    return h;
  };
  const X0 = Hh.x - Hh.rx - 1, X1 = x0 - 0.4, Z0 = Hh.z - Hh.rz - 1, Z1 = Hh.z + Hh.rz + 1, ST = 1.5;
  const nx = Math.ceil((X1 - X0) / ST), nz = Math.ceil((Z1 - Z0) / ST);
  const P = [];
  const at = (i, j) => { const x = Math.min(X1, X0 + i * ST), z = Z0 + j * ST, h = hgt(x, z); return [x, terrainHeight(x, z) + h - 0.25 + (h > 0 ? Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.25 : -0.3), z, h]; };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = at(i, j), c = at(i + 1, j), d = at(i + 1, j + 1), e = at(i, j + 1);
    if (Math.max(a[3], c[3], d[3], e[3]) <= 0) continue;
    P.push(a[0], a[1], a[2], e[0], e[1], e[2], d[0], d[1], d[2], a[0], a[1], a[2], d[0], d[1], d[2], c[0], c[1], c[2]);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.computeVertexNormals();
  b.add(geo, '#4f7d3c');
  // rocks poking out of the slope and a few pines up top
  const rock = [[-198, -137], [-201, -114], [-207, -142], [-210, -111], [-196, -133.5]];
  for (const [x, z] of rock) b.add(GEO.dodec, '#8f897e', { x, y: terrainHeight(x, z) + hgt(x, z) - 0.2, z, sx: 1.4, sy: 1.0, sz: 1.2, ry: x * 0.7 });
  const pines = [[-212, -132], [-216, -121], [-219, -129], [-208, -124], [-221, -138], [-222, -116], [-213, -142], [-214, -110]];
  for (const [x, z] of pines) {
    const y = terrainHeight(x, z) + hgt(x, z) - 0.3, s = 0.8 + ((x * 13 + z * 7) % 5 + 5) % 5 * 0.12;
    b.add(GEO.cyl6, '#6b4a32', { x, y: y + 0.8 * s, z, sx: 0.22 * s, sy: 1.6 * s, sz: 0.22 * s });
    for (let k = 0; k < 3; k++) b.add(GEO.cone8, k % 2 ? '#2f5f3c' : '#3a6b45', { x, y: y + (2.1 + k * 1.3) * s, z, sx: (1.9 - k * 0.45) * s, sy: 2.2 * s, sz: (1.9 - k * 0.45) * s });
  }
  void depth;
}
