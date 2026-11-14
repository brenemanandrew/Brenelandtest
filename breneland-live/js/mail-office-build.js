// The Breneland Post Office, built once into the town's batches by world-town.js (buildTown): a little red-brick office on Summit
// Rd's north side (layout.js MAIL_OFFICE) with a white cornice and a raised front carrying the BRENELAND POST OFFICE sign, double
// doors under a small porch roof, a shop window with the counter, parcels and a scale seen through it (lit at night), a bench under
// the small window, a blue collection box by the sidewalk, a flag on its pole, a lamp, and the mail van's bay on the west side (its
// tar pad, a roll-up door, MAIL VANS ONLY). You can't walk in: the doors and the window are the front of a solid block. The van
// itself is mailman.js's (it drives from here, see mail-van.js). Its stop by Strickler Park (the lay-by's paint and sign) is built
// here too (buildVanStop), so its sign shares the office's canvas.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { MAIL_OFFICE, VAN_STOP } from './layout.js';
import { WALK_Y, TAR_Y } from './road-net.js';
import { addSurface } from './terrain.js';
import { GEO } from './batch.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { redrawWhenFontsLoad } from './toon.js';
import { lampGlow, addNightSpot, windowGlass } from './daynight-mats.js';
import { addBenchSeats } from './seats.js';

// the lamps reuse the town's lamp colours, #ffe7a8 in the details and #fff3c4 in the solid batch: no new materials, no new draw calls
const BRICK = '#b5563f', BRICK_DARK = '#9a4533', TRIM = '#fbf7ee', STONE = '#a8a297', NAVY = '#1f3d58', BLUE = '#2f5da8', RED = '#d8343c';
const PAVER = '#cdbfa6', TAR = '#5f636a', WOOD = '#a8743f', METAL = '#3a3f47', CARD = '#c89a5e', CARD_DARK = '#a87a44';
const FONT = 'Fredoka';
const F = (w, px) => `${w} ${px}px "${FONT}", "Trebuchet MS", sans-serif`;

// For the tests and the pictures: where the parts stand
export const OFFICE_PARTS = { sign: null, collectionBox: null, flag: null, lamp: null, bench: null, rollup: null, window: null, signMesh: null, vanStop: null };

// ------------------------------------------------------------------ the signs (one canvas: the name board, the flag, the plaques, the van's stop)
const SH = { S: 1024, H: 1024, c: null, g: null, tex: null, geos: [] };
function region(x, y, w, h, draw, fonts) {
  if (!SH.c) { const c = document.createElement('canvas'); c.width = SH.S; c.height = SH.H; SH.c = c; SH.g = c.getContext('2d'); SH.tex = new THREE.CanvasTexture(c); SH.tex.colorSpace = THREE.SRGBColorSpace; SH.tex.anisotropy = 4; }
  const g = SH.g;
  const redraw = () => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); g.clearRect(0, 0, w, h); draw(g, w, h); g.restore(); SH.tex.needsUpdate = true; };
  redraw();
  redrawWhenFontsLoad(redraw, fonts);
  return [x, y, w, h];
}
// a face showing region r: pw x ph metres, `segs` across (the flag waves), turned ry about y, its middle at pos
function face(r, pw, ph, pos, ry, wave = 0) {
  const geo = new THREE.PlaneGeometry(pw, ph, wave ? 8 : 1, 1), uv = geo.attributes.uv, p = geo.attributes.position, [x, y, w, h] = r;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (x + u * w) / SH.S, 1 - (y + (1 - v) * h) / SH.H); }
  if (wave) for (let i = 0; i < p.count; i++) { const u = p.getX(i) / pw + 0.5; p.setZ(i, Math.sin(u * Math.PI * 2.2) * wave * u); p.setY(i, p.getY(i) - u * u * 0.08); }
  geo.rotateY(ry); geo.translate(pos[0], pos[1], pos[2]);
  SH.geos.push(geo);
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g, text, maxW, weight, px) { let s = px; g.font = F(weight, s); while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = F(weight, s); } return s; }
// an envelope: a white card, its flap's V, a red stamp
function envelope(g, x, y, w, ink = NAVY) {
  const h = w * 0.64;
  g.fillStyle = '#ffffff'; rr(g, x, y, w, h, w * 0.06); g.fill();
  g.strokeStyle = ink; g.lineWidth = Math.max(3, w * 0.05); g.lineJoin = 'round';
  rr(g, x, y, w, h, w * 0.06); g.stroke();
  g.beginPath(); g.moveTo(x + w * 0.04, y + h * 0.08); g.lineTo(x + w / 2, y + h * 0.58); g.lineTo(x + w * 0.96, y + h * 0.08); g.stroke();
  g.fillStyle = RED; g.fillRect(x + w * 0.72, y + h * 0.16, w * 0.16, w * 0.16);
}
function nameBoard() {
  return region(0, 0, 1024, 256, (g, w, h) => {
    g.fillStyle = NAVY; rr(g, 4, 4, w - 8, h - 8, 28); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#f1e7cf'; rr(g, 16, 16, w - 32, h - 32, 20); g.stroke();
    g.fillStyle = RED; g.fillRect(40, h - 58, w - 80, 10); g.fillStyle = '#ffffff'; g.fillRect(40, h - 46, w - 80, 6); g.fillStyle = BLUE; g.fillRect(40, h - 38, w - 80, 10);
    envelope(g, 52, 70, 120); envelope(g, w - 172, 70, 120);
    g.fillStyle = '#f1e7cf'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'BRENELAND', 560, 700, 54); g.fillText('BRENELAND', w / 2, 68);
    g.fillStyle = '#ffffff'; fit(g, 'POST OFFICE', 620, 700, 104); g.fillText('POST OFFICE', w / 2, 146);
  }, [F(700, 104), F(700, 54)]);
}
function flagTex() {
  return region(0, 256, 384, 224, (g, w, h) => {
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c8283a'; g.fillRect(0, i * h / 13, w, h / 13 + 1); }
    g.fillStyle = '#26407a'; g.fillRect(0, 0, w * 0.42, h * 7 / 13);
    g.fillStyle = '#ffffff';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { g.beginPath(); g.arc(14 + c * 30 + (r % 2) * 14, 14 + r * 28, 5, 0, Math.PI * 2); g.fill(); }
  }, []);
}
function hoursPlaque() {
  return region(400, 256, 300, 200, (g, w, h) => {
    g.fillStyle = '#f7f1e2'; rr(g, 4, 4, w - 8, h - 8, 18); g.fill();
    g.lineWidth = 6; g.strokeStyle = NAVY; rr(g, 4, 4, w - 8, h - 8, 18); g.stroke();
    envelope(g, w / 2 - 34, 18, 68);
    g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'Open 9 am to 5 pm', w - 30, 700, 34); g.fillText('Open 9 am to 5 pm', w / 2, 112);
    g.fillStyle = '#5a5248'; fit(g, 'Pat delivers daily', w - 30, 600, 26); g.fillText('Pat delivers daily', w / 2, 154);
  }, [F(700, 34), F(600, 26)]);
}
function vanPlaque() {
  return region(710, 256, 310, 110, (g, w, h) => {
    g.fillStyle = '#ffffff'; rr(g, 4, 4, w - 8, h - 8, 14); g.fill();
    g.lineWidth = 6; g.strokeStyle = BLUE; rr(g, 4, 4, w - 8, h - 8, 14); g.stroke();
    g.fillStyle = BLUE; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'MAIL VANS ONLY', w - 30, 700, 40); g.fillText('MAIL VANS ONLY', w / 2, h / 2 + 2);
  }, [F(700, 40)]);
}
function letterSlot() {
  return region(710, 372, 310, 110, (g, w, h) => {
    g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'MAIL', w - 30, 700, 64); g.fillText('MAIL', w / 2, h / 2 + 2);
  }, [F(700, 64)]);
}
// the van's stop sign by the park: an envelope, MAIL VAN ONLY, the office's name
function stopSign() {
  return region(0, 512, 384, 480, (g, w, h) => {
    g.fillStyle = '#ffffff'; rr(g, 4, 4, w - 8, h - 8, 26); g.fill();
    g.lineWidth = 12; g.strokeStyle = BLUE; rr(g, 10, 10, w - 20, h - 20, 22); g.stroke();
    g.fillStyle = BLUE; rr(g, 10, 10, w - 20, 150, 22); g.fill(); g.fillRect(10, 100, w - 20, 60);
    envelope(g, w / 2 - 70, 40, 140, BLUE);
    g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'MAIL VAN', w - 50, 700, 86); g.fillText('MAIL VAN', w / 2, 222);
    fit(g, 'ONLY', w - 50, 700, 86); g.fillText('ONLY', w / 2, 306);
    g.fillStyle = RED; g.fillRect(40, 362, w - 80, 8);
    g.fillStyle = '#5a5248'; fit(g, 'Breneland Post Office', w - 50, 600, 30); g.fillText('Breneland Post Office', w / 2, 410);
  }, [F(700, 86), F(600, 30)]);
}
// MAIL painted on the lay-by's tar, stretched along the way you drive in (clear round the letters: the alphaTest cuts them out)
function tarWord() {
  return region(400, 512, 256, 460, (g, w, h) => {
    g.fillStyle = '#f4f2ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(w / 2, h / 2); g.scale(1, 3.1); fit(g, 'MAIL', w - 24, 700, 110); g.fillText('MAIL', 0, 4); g.restore();
  }, [F(700, 110)]);
}
// a face lying on the ground, its text's top toward +x (read driving east)
function groundFace(r, across, along, pos) {
  const n = SH.geos.length;
  face(r, across, along, [0, 0, 0], 0);
  const geo = SH.geos[n];
  geo.rotateX(-Math.PI / 2); geo.rotateY(-Math.PI / 2); geo.translate(pos[0], pos[1], pos[2]);
}

function finishSigns(group) {
  const m = new THREE.Mesh(mergeGeometries(SH.geos, false), new THREE.MeshBasicMaterial({ map: SH.tex, fog: true, side: THREE.DoubleSide, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  SH.geos.forEach(g => g.dispose()); SH.geos.length = 0;
  m.name = 'post-office-signs'; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m);
  OFFICE_PARTS.signMesh = m;
  return m;
}

// ------------------------------------------------------------------ the office

// b, f: the town's batches (solid; details without shadows); group: for the signs' mesh
export function buildMailOffice(b, f, group, colliders) {
  const O = MAIL_OFFICE, x0 = O.x - O.w / 2, x1 = O.x + O.w / 2, zb = O.z - O.d / 2, zf = O.z + O.d / 2, Y = 0.3, H = O.h, G = WALK_Y;
  const top = Y + H, FL = G + 0.2;   // the roof line; the floor behind the doors (one step up from the forecourt)
  // ---- the ground: the front walk from the sidewalk, a paved strip along the front; the van's tar pad on the west
  const walk = { minX: O.door.x - 1.25, maxX: O.door.x + 1.25, minZ: zf, maxZ: O.lot.maxZ }, fore = { minX: x0 - 0.2, maxX: x1 + 0.2, minZ: zf, maxZ: zf + 1.7 };
  for (const r of [walk, fore]) { b.boxMinMax(r.minX, 0.3, r.minZ, r.maxX, G, r.maxZ, PAVER); addSurface({ ...r, y: G }); }
  for (let z = walk.minZ + 1.7 + 1.1; z < walk.maxZ - 0.2; z += 1.1) f.add(GEO.box, '#b3a58c', { x: O.door.x, y: G + 0.004, z, sx: 2.4, sy: 0.01, sz: 0.05 });
  const D = O.drive, pad = { minX: D.minX - 0.5, maxX: x0 - 0.15, minZ: O.bay.z - 5, maxZ: D.cutZ };
  b.boxMinMax(pad.minX, 0.3, pad.minZ, pad.maxX, 0.4, pad.maxZ, TAR); addSurface({ ...pad, y: 0.4 });
  // its paint: a white box round the van's spot, a yellow line where the bay meets the building's walkway
  for (const xx of [O.bay.x - 1.5, O.bay.x + 1.5]) f.add(GEO.box, '#f4f2ea', { x: xx, y: 0.405, z: O.bay.z - 0.3, sx: 0.1, sy: 0.01, sz: 6.4 });
  f.add(GEO.box, '#f4f2ea', { x: O.bay.x, y: 0.405, z: O.bay.z - 3.45, sx: 3.1, sy: 0.01, sz: 0.1 });
  f.add(GEO.box, '#f1c94a', { x: x0 - 0.55, y: 0.405, z: (pad.minZ + pad.maxZ) / 2, sx: 0.12, sy: 0.01, sz: pad.maxZ - pad.minZ - 0.4 });
  // ---- the block: brick, a stone base, white corners and a cornice, a flat roof behind a raised front. The front metre is built
  // round the shop window's opening (its recess runs back to `back`, the counter and the parcels in it)
  const wx0 = O.door.x + 1.55, wx1 = x1 - 0.55, wy0 = FL + 0.65, wy1 = FL + 2.55, back = zf - 1.0;
  b.boxMinMax(x0, Y, zb, x1, top, back, BRICK);
  b.boxMinMax(x0, Y, back, wx0, top, zf, BRICK); b.boxMinMax(wx1, Y, back, x1, top, zf, BRICK);
  b.boxMinMax(wx0, Y, back, wx1, wy0, zf, BRICK); b.boxMinMax(wx0, wy1, back, wx1, top, zf, BRICK);
  b.boxMinMax(x0 - 0.06, Y, zb - 0.06, x1 + 0.06, Y + 0.5, zf + 0.06, STONE);
  for (const cx of [x0, x1]) for (const cz of [zb, zf]) f.boxMinMax(cx - 0.12, Y + 0.5, cz - 0.12, cx + 0.12, top, cz + 0.12, TRIM);
  b.boxMinMax(x0 - 0.25, top - 0.25, zb - 0.25, x1 + 0.25, top + 0.05, zf + 0.25, TRIM);                    // the cornice all round
  b.boxMinMax(x0 + 0.1, top + 0.05, zb + 0.1, x1 - 0.1, top + 0.35, zf - 0.1, '#5b5f66');                  // the roof (flat, tarred)
  b.boxMinMax(x0 - 0.1, top + 0.05, zb - 0.1, x1 + 0.1, top + 0.5, zb + 0.15, BRICK_DARK);                // parapets: back and sides
  for (const sx of [x0 - 0.09, x1 - 0.16]) b.boxMinMax(sx, top + 0.05, zb, sx + 0.25, top + 0.5, zf, BRICK_DARK); // (a centimetre inside the raised front's sides: level with them, the ends flickered)
  // the raised front: a brick panel over the cornice carrying the sign, stepped up in the middle, with a white coping
  const FR = zf - 0.05, P1 = top + 1.6, P2 = top + 2.05;
  b.boxMinMax(x0 - 0.1, top + 0.05, FR - 0.3, x1 + 0.1, P1, FR, BRICK);
  b.boxMinMax(O.x - 2.7, P1, FR - 0.3, O.x + 2.7, P2, FR, BRICK);
  b.boxMinMax(x0 - 0.18, P1, FR - 0.38, O.x - 2.7, P1 + 0.15, FR + 0.08, TRIM);
  b.boxMinMax(O.x + 2.7, P1, FR - 0.38, x1 + 0.18, P1 + 0.15, FR + 0.08, TRIM);
  b.boxMinMax(O.x - 2.8, P2, FR - 0.38, O.x + 2.8, P2 + 0.15, FR + 0.08, TRIM);
  for (const sx of [O.x - 2.78, O.x + 2.7]) b.boxMinMax(sx, P1, FR - 0.34, sx + 0.08, P2, FR + 0.04, TRIM);
  face(nameBoard(), 7.0, 1.75, [O.x, top + 0.95, zf + 0.04], 0);
  OFFICE_PARTS.sign = { x: O.x, y: top + 0.95, z: zf + 0.04, w: 7.0, h: 1.75 };
  colliders.push({ type: 'box', minX: x0 - 0.1, maxX: x1 + 0.1, minZ: zb - 0.1, maxZ: zf + 0.12 });

  // ---- the front: double doors under a little porch roof, the hours plaque, a light
  const dx0 = O.door.x - 0.85, dx1 = O.door.x + 0.85, FZ = zf + 0.04;
  f.boxMinMax(dx0 - 0.18, G, FZ - 0.05, dx1 + 0.18, FL + 2.55, FZ + 0.06, TRIM);                            // the frame
  for (const s of [-1, 1]) {
    const a = s < 0 ? dx0 : O.door.x + 0.02, c = s < 0 ? O.door.x - 0.02 : dx1;
    f.boxMinMax(a, FL, FZ - 0.03, c, FL + 2.3, FZ + 0.09, NAVY);                                              // a door leaf
    f.boxMinMax(a + 0.14, FL + 0.95, FZ + 0.08, c - 0.14, FL + 2.12, FZ + 0.11, windowGlass(0.95));           // its glass
    f.boxMinMax(O.door.x + s * 0.12 - 0.03, FL + 1.0, FZ + 0.1, O.door.x + s * 0.12 + 0.03, FL + 1.35, FZ + 0.16, '#e0b54a'); // the handle
  }
  f.boxMinMax(dx0 - 0.2, FL + 2.38, FZ + 0.06, dx1 + 0.2, FL + 2.52, FZ + 0.12, '#e0b54a');               // a brass kick of trim
  b.boxMinMax(dx0 - 0.45, G, FZ, dx1 + 0.45, FL, FZ + 0.75, '#cbc4b8');                                   // the step
  b.add(GEO.box, NAVY, { x: O.door.x, y: FL + 2.95, z: FZ + 0.62, sx: 2.6, sy: 0.12, sz: 1.35, rx: 0.22 }); // the porch roof
  for (const s of [-1, 1]) f.add(GEO.box, TRIM, { x: O.door.x + s * 1.18, y: FL + 2.68, z: FZ + 0.6, sx: 0.08, sy: 0.08, sz: 1.2, rx: -0.6 }); // its brackets
  f.boxMinMax(dx0 - 0.17, FL + 2.4, FZ + 0.1, dx0 - 0.03, FL + 2.62, FZ + 0.2, lampGlow('#ffe7a8'));
  addNightSpot({ x: dx0 - 0.1, y: FL + 2.5, z: FZ + 0.55, color: '#ffd59a', pool: 2.6, gy: G, halo: 0.7 }); // (at the lamp by the door: fire-season)
  face(hoursPlaque(), 0.54, 0.36, [O.door.x + 0.42, FL + 1.62, FZ + 0.125], 0);   // on the right-hand door's glass

  // ---- the shop window east of the door: a real recess with the counter, parcels, pigeonholes and a scale, lit inside
  OFFICE_PARTS.window = { x0: wx0, x1: wx1, y0: wy0, y1: wy1, z: zf };
  // the recess's lining: warm plaster sides and ceiling, a wooden floor
  // (the linings run right to the front, over the brick opening's faces, which the frame's were level with and flickered)
  for (const [a, c] of [[wx0, wx0 + 0.03], [wx1 - 0.03, wx1]]) f.boxMinMax(a, wy0, back, c, wy1, zf, '#e9d9b8');
  f.boxMinMax(wx0, wy1 - 0.03, back, wx1, wy1, zf, '#e9d9b8'); f.boxMinMax(wx0 + 0.03, wy0, back, wx1 - 0.03, wy0 + 0.02, zf, '#9b7a55');
  f.boxMinMax(wx0 + 0.05, wy0 + 0.02, back - 0.02, wx1 - 0.05, wy1 - 0.02, back + 0.03, lampGlow('#ffe7a8')); // the lit back wall
  f.boxMinMax(wx0 + 0.04, wy1 - 0.12, back, wx1 - 0.04, wy1 - 0.02, zf - 0.1, lampGlow('#ffe7a8'));        // a strip light
  // pigeonholes on the back wall (a grid of little navy boxes with letters in them)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    const cx = wx0 + 0.3 + i * 0.3, cy = wy0 + 1.15 + j * 0.28;
    if (cx > wx1 - 0.25) continue;
    f.boxMinMax(cx - 0.13, cy - 0.11, back + 0.03, cx + 0.13, cy + 0.11, back + 0.16, NAVY);
    if ((i + j) % 3 !== 2) f.boxMinMax(cx - 0.09, cy - 0.08, back + 0.12, cx + 0.09, cy + 0.04, back + 0.17, (i + j) % 2 ? '#ffffff' : '#f5e6c4');
  }
  // the counter (a wooden front, a pale top), parcels on it and a red scale; a stack of boxes on the floor
  f.boxMinMax(wx0 + 0.02, wy0, zf - 0.62, wx1 - 0.02, wy0 + 0.42, zf - 0.32, WOOD);
  f.boxMinMax(wx0 + 0.02, wy0 + 0.42, zf - 0.66, wx1 - 0.02, wy0 + 0.48, zf - 0.28, '#efe4cc');
  const pc = [[0.25, 0.34, 0.26, 0.24], [0.62, 0.22, 0.2, 0.3], [1.38, 0.3, 0.24, 0.22]];
  for (const [u, w2, h2, d2] of pc) {
    const cx = wx0 + u, cy = wy0 + 0.48 + h2 / 2;
    f.add(GEO.box, CARD, { x: cx, y: cy, z: zf - 0.47, sx: w2, sy: h2, sz: d2, ry: (u * 7) % 0.5 - 0.25 });
    f.add(GEO.box, '#f2ead6', { x: cx, y: cy + h2 / 2 + 0.002, z: zf - 0.47, sx: w2 * 0.6, sy: 0.006, sz: 0.05, ry: (u * 7) % 0.5 - 0.25 }); // its tape
  }
  f.add(GEO.box, RED, { x: wx0 + 1.0, y: wy0 + 0.56, z: zf - 0.47, sx: 0.28, sy: 0.16, sz: 0.24 });           // the scale
  f.add(GEO.cyl12, '#d9d9de', { x: wx0 + 1.0, y: wy0 + 0.66, z: zf - 0.47, sx: 0.15, sy: 0.03, sz: 0.15 });
  f.add(GEO.box, CARD_DARK, { x: wx1 - 0.35, y: wy0 + 0.75, z: back + 0.3, sx: 0.4, sy: 0.3, sz: 0.3 });
  f.add(GEO.box, CARD, { x: wx1 - 0.33, y: wy0 + 1.02, z: back + 0.3, sx: 0.3, sy: 0.24, sz: 0.26, ry: 0.2 });
  // the frame and the sill outside, a transom bar
  f.boxMinMax(wx0 - 0.14, wy0 - 0.14, zf - 0.02, wx0, wy1 + 0.14, zf + 0.1, TRIM); f.boxMinMax(wx1, wy0 - 0.14, zf - 0.02, wx1 + 0.14, wy1 + 0.14, zf + 0.1, TRIM);
  f.boxMinMax(wx0 - 0.14, wy1, zf - 0.02, wx1 + 0.14, wy1 + 0.14, zf + 0.1, TRIM);
  f.boxMinMax(wx0 - 0.3, wy0 - 0.18, zf - 0.02, wx1 + 0.3, wy0, zf + 0.26, TRIM);
  f.boxMinMax(wx0, wy1 - 0.62, zf - 0.03, wx1, wy1 - 0.56, zf + 0.06, TRIM);
  // no glass pane: a see-through mesh costs draw calls at every spot that sees the office, so two shine strips say "glass"
  f.boxMinMax(wx0 + 0.15, wy0 + 1.62, zf - 0.015, wx0 + 0.55, wy0 + 1.66, zf - 0.01, '#ffffff');
  f.boxMinMax(wx0 + 0.25, wy0 + 1.5, zf - 0.015, wx0 + 0.45, wy0 + 1.54, zf - 0.01, '#ffffff');
  addNightSpot({ x: (wx0 + wx1) / 2, y: wy1 - 0.3, z: zf + 0.15, color: '#ffe0a0', pool: 2.4, gy: G, halo: 0 }); // (the strip light's, out through the window: fire-season)

  // ---- the small window west of the door, a bench under it facing the road
  const sw0 = x0 + 0.85, sw1 = O.door.x - 1.45, sy0 = FL + 1.2, sy1 = FL + 2.4;
  f.boxMinMax(sw0 - 0.12, sy0 - 0.12, zf - 0.03, sw1 + 0.12, sy1 + 0.12, zf + 0.08, TRIM);
  f.boxMinMax(sw0, sy0, zf - 0.04, sw1, sy1, zf + 0.1, windowGlass(0.55));
  f.boxMinMax((sw0 + sw1) / 2 - 0.035, sy0 + 0.005, zf + 0.08, (sw0 + sw1) / 2 + 0.035, sy1 - 0.005, zf + 0.13, TRIM); // (the bar 5 mm short of the glass's edges, as the houses' are)
  f.boxMinMax(sw0 - 0.2, sy0 - 0.2, zf - 0.02, sw1 + 0.2, sy0 - 0.1, zf + 0.25, TRIM);
  const bx = (sw0 + sw1) / 2 - 0.1, bz = zf + 0.55, seatY = G + 0.3; // (seat-height: was 0.46)
  if (propsReady('bench_plank')) addProp(b, 'bench_plank', { x: bx, y: G, z: bz - 0.03, sx: 0.8 }, { skin: 'office' }); // (props-static: the Blender plank bench, a touch shorter under the window)
  else {
    b.boxMinMax(bx - 0.78, seatY - 0.06, bz - 0.24, bx + 0.78, seatY, bz + 0.22, WOOD);
    b.boxMinMax(bx - 0.78, seatY + 0.12, bz - 0.3, bx + 0.78, seatY + 0.42, bz - 0.24, WOOD);
    for (const k of [-0.64, 0.64]) b.boxMinMax(bx + k - 0.05, G, bz - 0.22, bx + k + 0.05, seatY - 0.06, bz + 0.2, METAL);
  }
  addBenchSeats(bx, bz, seatY, 0, 'post office bench', 0.38);
  colliders.push({ type: 'box', minX: bx - 0.82, maxX: bx + 0.82, minZ: bz - 0.32, maxZ: bz + 0.25 });
  OFFICE_PARTS.bench = { x: bx, z: bz, y: seatY };

  // ---- the roll-up door on the west wall, facing the van's bay, a light over it and MAIL VANS ONLY
  const rz0 = O.bay.z - 2.1, rz1 = O.bay.z + 2.1, ry1 = Y + 3.1, RX = x0 - 0.04;
  f.boxMinMax(RX - 0.08, Y, rz0 - 0.15, RX + 0.02, ry1 + 0.15, rz1 + 0.15, TRIM);
  f.boxMinMax(RX - 0.1, Y + 0.02, rz0, RX, ry1, rz1, '#b9bec6');
  for (let y = Y + 0.3; y < ry1; y += 0.28) f.boxMinMax(RX - 0.13, y, rz0 + 0.02, RX - 0.08, y + 0.04, rz1 - 0.02, '#8f959e');
  f.boxMinMax(RX - 0.15, Y + 0.55, O.bay.z - 0.25, RX - 0.1, Y + 0.65, O.bay.z + 0.25, METAL);               // the handle
  f.boxMinMax(RX - 0.22, ry1 + 0.3, O.bay.z - 0.18, RX - 0.04, ry1 + 0.5, O.bay.z + 0.18, lampGlow('#ffe7a8'));
  addNightSpot({ x: RX - 0.55, y: ry1 + 0.4, z: O.bay.z, color: '#ffe6b0', pool: 3.0, gy: 0.4, halo: 0.6 }); // (at the lamp: fire-season)
  face(vanPlaque(), 1.7, 0.6, [RX - 0.05, ry1 + 0.92, O.bay.z + 0.02], -Math.PI / 2);   // above the light
  OFFICE_PARTS.rollup = { x: RX, z0: rz0, z1: rz1 };
  // a low kerb stone at the head of the bay, so the van backs up to a stop
  b.boxMinMax(O.bay.x - 1.3, 0.4, O.bay.z - 4.3, O.bay.x + 1.3, 0.55, O.bay.z - 4.05, '#bdb7ab');

  // ---- out front: the blue collection box by the sidewalk, the flag on its pole, a lamp
  const cbx = O.door.x + 2.25, cbz = O.lot.maxZ - 0.75;
  b.add(GEO.box, BLUE, { x: cbx, y: 0.3 + 0.62, z: cbz, sx: 0.62, sy: 0.82, sz: 0.52 });
  b.add(GEO.cyl12, BLUE, { x: cbx, y: 0.3 + 1.03, z: cbz, sx: 0.31, sy: 0.62, sz: 0.26, rz: Math.PI / 2 });     // the rounded top
  for (const sx of [-0.26, 0.26]) for (const sz of [-0.2, 0.2]) b.add(GEO.box, '#24447e', { x: cbx + sx, y: 0.42, z: cbz + sz, sx: 0.07, sy: 0.24, sz: 0.07 });
  f.boxMinMax(cbx - 0.22, 0.3 + 0.98, cbz + 0.26, cbx + 0.22, 0.3 + 1.04, cbz + 0.3, '#1b2a44');              // the letter flap
  face(letterSlot(), 0.5, 0.18, [cbx, 0.3 + 0.78, cbz + 0.262], 0);
  colliders.push({ type: 'circle', x: cbx, z: cbz, r: 0.42 });
  OFFICE_PARTS.collectionBox = { x: cbx, z: cbz };
  const fx = x1 + 1.3, fz = O.lot.maxZ - 1.6, PH = 7.4;
  b.boxMinMax(fx - 0.45, 0.3, fz - 0.45, fx + 0.45, 0.55, fz + 0.45, '#cbc4b8');
  b.add(GEO.cyl8, '#e9e6df', { x: fx, y: 0.55 + PH / 2, z: fz, sx: 0.07, sy: PH, sz: 0.07 });
  b.add(GEO.sphere, '#e0b54a', { x: fx, y: 0.55 + PH + 0.1, z: fz, sx: 0.13, sy: 0.13, sz: 0.13 });
  face(flagTex(), 1.9, 1.1, [fx + 0.97, 0.55 + PH - 0.65, fz], 0, 0.12);
  colliders.push({ type: 'circle', x: fx, z: fz, r: 0.2 });
  OFFICE_PARTS.flag = { x: fx, z: fz, top: 0.55 + PH };
  // a lamp post by the walk: a dark pole with a lantern
  const lx = O.door.x - 1.85, lz = O.lot.maxZ - 0.6;
  if (propsReady('post_lantern')) addProp(b, 'post_lantern', { x: lx, y: 0.3, z: lz }); // (props-static: the Blender lantern post, its light 3.2 up: the spot below)
  else {
    b.add(GEO.cyl8, METAL, { x: lx, y: 0.3 + 1.5, z: lz, sx: 0.07, sy: 3.0, sz: 0.07 });
    b.add(GEO.cyl8, METAL, { x: lx, y: 0.36, z: lz, sx: 0.16, sy: 0.14, sz: 0.16 });
    b.add(GEO.cyl8, METAL, { x: lx, y: 3.35, z: lz, sx: 0.2, sy: 0.08, sz: 0.2 });
    b.add(GEO.box, lampGlow('#fff3c4'), { x: lx, y: 3.62, z: lz, sx: 0.26, sy: 0.42, sz: 0.26 });
    b.add(GEO.cone8, METAL, { x: lx, y: 3.98, z: lz, sx: 0.24, sy: 0.3, sz: 0.24 });
  }
  addNightSpot({ x: lx, y: 3.5, z: lz, color: '#ffd98e', pool: 3.0, gy: G, halo: 1.0 });
  colliders.push({ type: 'circle', x: lx, z: lz, r: 0.15 });
  OFFICE_PARTS.lamp = { x: lx, z: lz };
  // a planter either side of the step
  for (const s of [-1, 1]) {
    const px = O.door.x + s * 1.42;
    if (propsReady('planter_box')) { addProp(b, 'planter_box', { x: px, y: G, z: zf + 0.375 }, { skin: s < 0 ? 'rose' : 'marigold' }); continue; } // (props-static)
    b.boxMinMax(px - 0.3, G, zf + 0.15, px + 0.3, G + 0.45, zf + 0.6, '#8a6a48');
    b.add(GEO.ico1, s < 0 ? '#4a9a45' : '#3f8a3f', { x: px, y: G + 0.62, z: zf + 0.38, sx: 0.36, sy: 0.3, sz: 0.3 });
    b.add(GEO.sphere, s < 0 ? '#f07a7a' : '#f1c94a', { x: px + 0.1, y: G + 0.78, z: zf + 0.5, sx: 0.07, sy: 0.07, sz: 0.07 });
  }
  buildVanStop(b, f, colliders);
  finishSigns(group);
}

// ------------------------------------------------------------------ the van's stop by Strickler Park

// The lay-by itself is paving (road-net.js); this is its paint (a white box round the van's spot, MAIL on the tar) and its sign
// at the back of the sidewalk, facing the road, just ahead of where the van stands.
export function buildVanStop(b, f, colliders) {
  const S = VAN_STOP.spot, Y = TAR_Y + 0.008, x0 = S.x - 3.9, x1 = S.x + 3.9, zr = VAN_STOP.bay[1][1] - 2.65, zk = VAN_STOP.bay[1][1] - 0.15;
  f.add(GEO.box, '#f4f2ea', { x: S.x, y: Y, z: zr, sx: x1 - x0, sy: 0.012, sz: 0.14 });                        // the road side
  for (const x of [x0, x1]) f.add(GEO.box, '#f4f2ea', { x, y: Y, z: (zr + zk) / 2, sx: 0.14, sy: 0.012, sz: zk - zr });  // the ends
  groundFace(tarWord(), 1.8, 3.2, [S.x, Y + 0.004, (zr + zk) / 2]);
  const P = VAN_STOP.sign, G = WALK_Y, top = G + 2.95;
  const model = propsReady('van_stop_sign');
  if (model) addProp(b, 'van_stop_sign', { x: P.x, y: G, z: P.z, yaw: Math.PI }); // (props-static: the Blender pole and plate, its face toward the road)
  else {
    b.add(GEO.cyl8, METAL, { x: P.x, y: (G + top) / 2, z: P.z, sx: 0.06, sy: top - G, sz: 0.06 });
    b.add(GEO.box, METAL, { x: P.x, y: top - 0.62, z: P.z - 0.05, sx: 0.92, sy: 1.16, sz: 0.04 });   // the plate's back
  }
  face(stopSign(), 0.88, 1.1, [P.x, top - 0.62, P.z - (model ? 0.094 : 0.075)], Math.PI);
  colliders.push({ type: 'circle', x: P.x, z: P.z, r: 0.1 });
  OFFICE_PARTS.vanStop = { sign: { x: P.x, z: P.z, top }, paint: { x0, x1, zr, zk } };
}
