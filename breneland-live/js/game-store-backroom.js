// The back room: the stockroom under the game store's loft, opened up for D&D night. The STAFF ONLY door is a half-glass door
// (wood below, a glass pane above with "D&D NIGHT · TUESDAYS" in gold) that swings in like the shop's own doors, so anyone in the
// shop can look through and see people playing. Inside, gaming style but comfy: a big wooden table with a battle mat, six players'
// chairs and the DM's high-backed chair behind a DM screen, a dice tray at each seat, a rug, a hanging lamp and string lights,
// shelves of rulebooks, minis and dice towers, posters of a dragon and a map, the credits poster, a couch and an armchair, snacks
// and drinks on a side table.
//
// Two floors in a height field: the loft is a `deck` surface over this room (terrain.js counts it only for someone up near it),
// and every collider in here carries `maxY` (it stops someone on the floor, not someone on the loft above). The loft's own carry
// `minY` (game-store-build.js). All static, in the store's inside batch.
import * as THREE from 'three';
import { GEO } from './batch.js';
import { toon } from './toon.js';
import { cellPlane } from './game-store-art.js';
import { backroomAtlas, doorLettering } from './dnd-art.js';

// The lamp's shade: a cone cut off at the top, open at both ends (its outside), and its lining (the same turned inside out).
const SHADE = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).toNonIndexed();
const SHADE_IN = SHADE.clone();
{
  const ps = SHADE_IN.attributes.position, ns = SHADE_IN.attributes.normal, us = SHADE_IN.attributes.uv;
  for (let i = 0; i < ps.count; i += 3) for (const a of [ps, ns, us]) for (let k = 0; k < a.itemSize; k++) { const t = a.array[(i + 1) * a.itemSize + k]; a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k]; a.array[(i + 2) * a.itemSize + k] = t; }
  for (let i = 0; i < ns.array.length; i++) ns.array[i] = -ns.array[i];
}
const shadeGeo = (g, topR) => { const c = g.clone(), p = c.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * topR); p.setZ(i, p.getZ(i) * topR); } c.computeVertexNormals(); return c; };

// The DM's armchair: its arms' half width and top (m from the floor), for the chair and for his pose.
export const DM_CHAIR = { armX: 0.34, armY: 0.5, elbowDrop: 0.19 }; // (seat-height: down with the seat, was 0.66)
// seat-height (2026-11-07): the chairs' seats 0.3 over the floor (were 0.46: the feet hung 15 cm), the table's top down as far (0.62)
export const BR_SEAT = 0.31, BR_DROP = 0.16; // (the cushion's top 0.32: a sitter 1 cm into it)

// The plan: every number dnd.js and the tests need, from the store's PLAN.
export function backroomPlan(P) {
  const fy = P.floorY, sx = P.sx;
  const room = { minX: P.iMinX, maxX: P.iMaxX, minZ: P.zL + 0.06, maxZ: P.iMaxZ, y: fy, ceil: P.LY - 0.3 };
  const door = { x0: sx - 0.55, x1: sx + 0.55, z: P.zL, y0: fy, y1: fy + 2.15, glass: [fy + 1.05, fy + 1.95] };
  // the room is 5.7 m deep: a landing inside the door (the door swings into it) before the chair backs, a lane behind the far chairs
  const table = { x: sx, z: P.zL + 3.0, w: 2.8, d: 1.4, top: fy + 0.78 - BR_DROP };
  const tz = table.z, hw = table.w / 2, hd = table.d / 2;
  // six players (two on the door's side, leaving the middle clear so the glass looks straight down the table, three on the
  // far side facing the door, one at the west end) and the DM at the east end behind the screen
  const seats = [
    { x: sx - 0.8, z: tz - hd - 0.5, yaw: 0 }, { x: sx + 0.8, z: tz - hd - 0.5, yaw: 0 },
    { x: sx - 0.9, z: tz + hd + 0.5, yaw: Math.PI }, { x: sx, z: tz + hd + 0.5, yaw: Math.PI }, { x: sx + 0.9, z: tz + hd + 0.5, yaw: Math.PI },
    { x: sx - hw - 0.55, z: tz, yaw: Math.PI / 2 },
    { x: sx + hw + 0.6, z: tz, yaw: -Math.PI / 2, dm: true },
  ].map((s, i) => ({ ...s, i, y: fy, seatY: BR_SEAT }));
  const screen = { x: sx + hw - 0.42, z: tz, top: table.top + 0.32 };
  // the lamp: a deep shade open below (its rim, its top), the bulb tucked up inside it (dnd-lighting.js: the light comes from there)
  const ly = room.ceil - 0.55;
  const lamp = { x: sx, z: tz, y: ly, bulbY: ly + 0.04, rimY: ly - 0.06, rimR: 0.46, topY: ly + 0.21, topR: 0.15 };
  // Everything on the table at a real size, lying on it, inside its edge, nothing on top of anything else (but the pencil on its sheet
  // and the die in its tray). `props` lists each one's footprint (centre, size, turn), its bottom and height. The build below makes
  // them from this list and dnd-test checks it (and rays down at each one). `felt.y` is the felt's top: things lie on it (the wooden
  // rim round the felt is 2 mm lower, so paper there floats 2 mm, nobody sees that).
  const surf = table.top + 0.002;
  const felt = { minX: sx - hw + 0.08, maxX: sx + hw - 0.08, minZ: tz - hd + 0.08, maxZ: tz + hd - 0.08, y: surf };
  // the battle map (a plane dnd.js textures with the module's map) centred on the felt, between the players' places
  const mat = { x: sx, z: tz, w: 1.56, d: 0.7, y: surf + 0.002 };
  const turn = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const props = [];
  const prop = (kind, x, z, w, d, yaw, h, extra = {}) => { const p = { kind, x, z, w, d, yaw, y0: surf, h, ...extra }; props.push(p); return p; };
  // each player's place: the table's edge in front of the chair; a letter-size character sheet on one side with a pencil on it,
  // a 20 x 15 cm dice tray on the other (lx: across the place, lz: in from the chair, the edge at `edge`)
  const trays = [];
  for (const s of seats.filter(q => !q.dm)) {
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), edge = Math.abs(fz) > 0.5 ? Math.abs(s.z - tz) - hd : Math.abs(s.x - sx) - hw; // the chair to the edge
    const at = (lx, lz) => turn(s.x, s.z, s.yaw, lx, edge + lz);
    const k = Math.cos(s.yaw) > 0.5 && s.x > sx + 0.5 ? -1 : 1; // the near-side chair by the DM's end: its sheet on the far side of the screen's wing
    const [shx, shz] = at(0.12 * k, 0.18), [px, pz] = at(0.1 * k, 0.17), [tx, tz2] = at(-0.13 * k, 0.115);
    const sheet = prop('sheet', shx, shz, 0.216, 0.279, s.yaw, 0.003, { seat: s.i });
    prop('pencil', px, pz, 0.007, 0.19, s.yaw + 0.5, 0.007, { seat: s.i, on: 'sheet', y0: surf + 0.003 });
    const tray = prop('tray', tx, tz2, 0.2, 0.15, s.yaw, 0.03, { seat: s.i, floor: surf + 0.013 });
    trays.push({ x: tx, z: tz2, yaw: s.yaw, i: s.i, floor: tray.floor, w: 0.2, d: 0.15, fx, fz });
    void sheet;
  }
  prop('map', mat.x, mat.z, mat.w, mat.d, 0, 0.002, { y0: mat.y });
  // the DM's end: the screen standing across the felt, the tent card in front of it (dnd.js), notes and a book behind it
  prop('screen', screen.x + 0.035, screen.z, 0.18, 0.98, 0, 0.3);
  prop('tent', screen.x - 0.13, screen.z, 0.1, 0.34, 0, 0.12);
  prop('notes', screen.x + 0.24, screen.z - 0.2, 0.216, 0.279, 0, 0.003);
  prop('book', screen.x + 0.24, screen.z + 0.2, 0.2, 0.26, 0, 0.04);
  // the snacks live on the side table by the couch (a bowl at the west end filled the west chair's view)
  const look = { x: sx, z: P.zL - 1.6 }; // a spot in the shop in front of the door (the view through the glass)
  return { room, door, table, seats, screen, lamp, mat, felt, props, trays, look, maxY: P.LY - 1 };
}

const C = {
  wall: '#5b2b3a', wallTop: '#6a3445', wainscot: '#4a2e1e', trim: '#d9b47c', rug: '#7a2140', rugIn: '#a8443a', gold: '#e3b04a',
  wood: '#8a5a34', woodDark: '#4a2e1e', woodMid: '#6b4128', cushion: '#7a2140', couch: '#5b4a8a', couchDark: '#46386e', felt: '#2f5b45',
  ink: '#2b2340', cream: '#f3e3c3',
};

// Build it into the store's inside batch `b` (and bulbs). kit: { bulbs, colliders, addNightSpot, bookcase, spines, plant, SPH,
// posterMat, posterUv }. Returns { door, doorCol, seats, art, parts } (the door is its own group: it swings).
export function buildBackRoom(b, P, kit) {
  const BR = backroomPlan(P), { room, door: D, table: T } = BR, fy = P.floorY, maxY = BR.maxY;
  const { bulbs, colliders, SPH } = kit;
  const col = c => { c.maxY = maxY; colliders.push(c); return c; };
  const art = backroomAtlas();
  const artMat = new THREE.MeshBasicMaterial({ map: art.tex, fog: true });
  const face = (uv, x, y, z, w, h, yaw) => b.add(cellPlane(w, h, uv), artMat, { x, y, z, ry: yaw });
  const ceil = room.ceil;

  // ---- the walls inside: a wine wallpaper over a dark wainscot, a cream rail; the front wall's inner face round the door
  const wallFace = (axis, a0, a1, t0, t1, holes = []) => {
    const run = (ya, yb, colr) => {
      const xs = [...new Set([a0, a1, ...holes.flatMap(h => [h.a0, h.a1])])].filter(v => v >= a0 && v <= a1).sort((p, q) => p - q);
      for (let i = 0; i < xs.length - 1; i++) {
        const p = xs[i], q = xs[i + 1], h = holes.find(h => h.a0 <= p + 1e-6 && h.a1 >= q - 1e-6);
        let y0 = ya; if (h) { if (h.y1 >= yb) continue; y0 = Math.max(ya, h.y1); }
        if (axis === 'x') b.boxMinMax(p, y0, t0, q, yb, t1, colr); else b.boxMinMax(t0, y0, p, t1, yb, q, colr);
      }
    };
    run(fy, fy + 0.95, C.wainscot); run(fy + 0.95, fy + 1.0, C.trim); run(fy + 1.0, ceil, C.wall);
  };
  const hole = [{ a0: D.x0, a1: D.x1, y1: D.y1 }];
  wallFace('x', room.minX, room.maxX, P.zL + 0.05, P.zL + 0.08, hole);           // the front wall (the door's side)
  const OD = P.outDoor; // the room's own door to the outside, in the back wall (game-store-build.js builds it; the hole is here)
  wallFace('x', room.minX, room.maxX, room.maxZ - 0.03, room.maxZ, [{ a0: OD.x0, a1: OD.x1, y1: OD.y1 }]); // the back wall
  wallFace('z', room.minZ, room.maxZ, room.minX, room.minX + 0.03);               // west
  wallFace('z', room.minZ, room.maxZ, room.maxX - 0.03, room.maxX);               // east
  // ceiling beams under the loft's floor
  for (let x = room.minX + 1.1; x < room.maxX - 0.4; x += 1.9) b.boxMinMax(x - 0.08, ceil - 0.16, room.minZ, x + 0.08, ceil, room.maxZ, C.woodDark);

  // ---- the floor: a big rug under the table (a gold border), a small one by the couch
  b.boxMinMax(T.x - 2.6, fy, T.z - 1.75, T.x + 2.6, fy + 0.012, T.z + 1.75, C.rug);
  b.boxMinMax(T.x - 2.45, fy + 0.002, T.z - 1.6, T.x + 2.45, fy + 0.014, T.z + 1.6, C.gold);
  b.boxMinMax(T.x - 2.35, fy + 0.004, T.z - 1.5, T.x + 2.35, fy + 0.016, T.z + 1.5, C.rugIn);

  // ---- the table: a thick top, a rim, four turned legs, a felt play area (the map sits on it: dnd.js)
  const hw = T.w / 2, hd = T.d / 2;
  b.boxMinMax(T.x - hw, T.top - 0.07, T.z - hd, T.x + hw, T.top, T.z + hd, C.wood);
  b.boxMinMax(T.x - hw + 0.08, T.top, T.z - hd + 0.08, T.x + hw - 0.08, T.top + 0.002, T.z + hd - 0.08, C.felt);
  for (const [kx, kz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.add(GEO.cyl8, C.woodDark, { x: T.x + kx * (hw - 0.14), y: fy + (T.top - 0.07 - fy) / 2, z: T.z + kz * (hd - 0.14), sx: 0.07, sy: T.top - 0.07 - fy, sz: 0.07 });
    b.add(SPH, C.woodMid, { x: T.x + kx * (hw - 0.14), y: fy + 0.35, z: T.z + kz * (hd - 0.14), sx: 0.1, sy: 0.07, sz: 0.1 });
  }
  b.boxMinMax(T.x - hw + 0.1, fy + 0.14, T.z - 0.04, T.x + hw - 0.1, fy + 0.2, T.z + 0.04, C.woodDark); // a stretcher
  col({ type: 'box', minX: T.x - hw, maxX: T.x + hw, minZ: T.z - hd, maxZ: T.z + hd });

  // ---- the chairs: padded wooden chairs for the players, the DM's high back; a dice tray, a character sheet and a pencil
  // at each player's place
  const turn = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const chair = (s, tall) => {
    const at = (lx, ly, lz, sx, sy, sz, c) => { const [px, pz] = turn(s.x, s.z, s.yaw, lx, lz); b.add(GEO.box, c, { x: px, y: fy + ly - BR_DROP, z: pz, sx, sy, sz, ry: s.yaw }); }; // (everything BR_DROP lower: seat-height)
    const w = tall ? 0.56 : 0.46;
    at(0, 0.41, 0, w, 0.05, 0.46, C.woodMid); at(0, 0.455, 0.01, w - 0.06, 0.05, 0.4, C.cushion);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(lx * (w / 2 - 0.04), 0.2 + BR_DROP / 2, lz * 0.19, 0.05, 0.4 - BR_DROP, 0.05, C.woodDark);
    const bh = tall ? 0.95 : 0.5;
    for (const k of [-1, 1]) at(k * (w / 2 - 0.04), 0.43 + bh / 2, -0.21, 0.05, bh, 0.05, C.woodDark);
    at(0, 0.43 + bh - 0.1, -0.21, w, 0.16, 0.056, C.woodMid); // (the rail 3 mm proud of the posts: no shared faces)
    at(0, 0.43 + bh * 0.45, -0.2, w - 0.12, bh * 0.55, 0.04, C.cushion);
    if (tall) { // the DM's armchair: padded arms where his forearms rest (dnd.js sits him with params.chair = DM_CHAIR)
      at(0, 0.43 + bh + 0.06, -0.21, 0.24, 0.1, 0.05, C.gold);
      for (const k of [-1, 1]) {
        at(k * DM_CHAIR.armX, DM_CHAIR.armY + BR_DROP - 0.03, 0.01, 0.09, 0.05, 0.42, C.woodDark);
        at(k * DM_CHAIR.armX, DM_CHAIR.armY + BR_DROP - 0.002, 0.01, 0.07, 0.016, 0.36, C.cushion);
        at(k * DM_CHAIR.armX, 0.52, 0.17, 0.05, 0.2, 0.05, C.woodDark);
      }
    }
    col({ type: 'circle', x: s.x, z: s.z, r: tall ? 0.24 : 0.2, seat: true });
  };
  for (const s of BR.seats) chair(s, !!s.dm);
  // the things on the table, from the plan's list (sizes and places: backroomPlan)
  const trayCols = ['#7a2140', '#2b3a4e', '#2f6b4f', '#5b4a8a', '#8a3b12', '#3f6fa8'];
  for (const p of BR.props) {
    const at = (lx, ly, lz, sx, sy, sz, c, geo = GEO.box) => { const [px, pz] = turn(p.x, p.z, p.yaw, lx, lz); b.add(geo, c, { x: px, y: p.y0 + ly, z: pz, sx, sy, sz, ry: p.yaw }); };
    if (p.kind === 'sheet') { at(0, p.h / 2, 0, p.w, p.h, p.d, C.cream); at(0, p.h + 0.0015, -0.1, p.w - 0.06, 0.003, 0.025, '#7a2140'); } // a letter-size sheet with its red name bar
    else if (p.kind === 'pencil') { const [px, pz] = turn(p.x, p.z, p.yaw, 0, 0); b.add(GEO.cyl6, '#f0c24f', { x: px, y: p.y0 + p.h / 2, z: pz, sx: p.w / 2, sy: p.d, sz: p.w / 2, rx: Math.PI / 2, ry: p.yaw }); } // a pencil lying on its sheet
    else if (p.kind === 'tray') { // a wooden tray (a base, four rims) with a coloured felt floor and a d20 resting in it
      at(0, 0.005, 0, p.w, 0.01, p.d, C.woodDark);
      for (const k of [-1, 1]) { at(k * (p.w / 2 - 0.0075), p.h / 2, 0, 0.015, p.h, p.d, C.woodDark); at(0, p.h / 2, k * (p.d / 2 - 0.0075), p.w - 0.03, p.h, 0.015, C.woodDark); }
      at(0, 0.0115, 0, p.w - 0.03, 0.003, p.d - 0.03, trayCols[p.seat % trayCols.length]);
      const [dx, dz] = turn(p.x, p.z, p.yaw, 0.04, 0.02); b.add(GEO.ico0, trayCols[(p.seat + 2) % trayCols.length], { x: dx, y: p.floor + 0.009, z: dz, sx: 0.011, sy: 0.011, sz: 0.011, ry: p.seat });
    }
    else if (p.kind === 'notes') { at(0, p.h / 2, 0, p.w, p.h, p.d, C.cream); for (let i = 0; i < 6; i++) at(0, p.h + 0.0015, -0.1 + i * 0.035, p.w - 0.05, 0.003, 0.006, '#3a3226'); }
    else if (p.kind === 'book') { at(0, p.h / 2, 0, p.w, p.h, p.d, '#2b3a4e'); at(0, p.h / 2, 0, p.w - 0.012, p.h - 0.008, p.d + 0.004, C.cream); at(0, p.h + 0.0015, 0, 0.08, 0.003, 0.08, C.gold); }
    else if (p.kind === 'bowl') { at(0, p.h / 2, 0, p.w / 2, p.h, p.d / 2, '#3f8fd9', GEO.cyl12); at(0, p.h + 0.004, 0, p.w / 2 - 0.02, 0.012, p.d / 2 - 0.02, '#f0c24f', GEO.cyl8); }
    else if (p.kind === 'can') { at(0, p.h / 2, 0, p.w / 2, p.h, p.d / 2, p.z > T.z + hd - 0.24 ? '#e0463c' : '#7ddc7a', GEO.cyl8); at(0, p.h + 0.001, 0, p.w / 2 - 0.006, 0.002, p.d / 2 - 0.006, '#cfd6dc', GEO.cyl8); }
  }
  // ---- the DM screen: three panels standing on the table's east end, printed on the players' side, notes and a mini on
  // the DM's side
  {
    const S = BR.screen, H = 0.3, pw = 0.36, uv = art.uv('screen');
    const panels = [[-pw, 0.45], [0, 0], [pw, -0.45]]; // offset along the screen, angle toward the DM
    panels.forEach(([o, a], k) => {
      const px = S.x + Math.sin(a) * 0.08, pz = S.z + o * Math.cos(a) * 1.0;
      b.add(GEO.box, '#5a1a2a', { x: px, y: BR.felt.y + H / 2, z: pz, sx: 0.02, sy: H, sz: pw, ry: a });
      const u = [uv[0] + (uv[2] - uv[0]) * (k / 3), uv[1], uv[0] + (uv[2] - uv[0]) * ((k + 1) / 3), uv[3]];
      const [fx, fz] = [px - Math.cos(a) * 0.016, pz + Math.sin(a) * 0.016]; // 6 mm off the panel's face
      b.add(cellPlane(pw - 0.02, H - 0.02, u), artMat, { x: fx, y: BR.felt.y + H / 2, z: fz, ry: -Math.PI / 2 + a });
    });
  }

  // ---- the hanging lamp over the table: a chain, a deep wine shade open below with a pale lining and a gold rim, the bulb up
  // inside it (while a game runs the lamp is the room's light: dnd-lighting.js); string lights round the room
  {
    const L = BR.lamp, h = L.topY - L.rimY, k = L.topR / L.rimR;
    b.add(GEO.cyl6, C.ink, { x: L.x, y: (ceil + L.topY) / 2, z: L.z, sx: 0.012, sy: ceil - L.topY, sz: 0.012 });
    b.add(shadeGeo(SHADE, k), '#7a2140', { x: L.x, y: L.rimY + h / 2, z: L.z, sx: L.rimR, sy: h, sz: L.rimR });
    b.add(shadeGeo(SHADE_IN, k), '#efc98e', { x: L.x, y: L.rimY + h / 2 + 0.004, z: L.z, sx: L.rimR - 0.012, sy: h - 0.008, sz: L.rimR - 0.012 });
    b.add(GEO.cyl12, '#7a2140', { x: L.x, y: L.topY - 0.004, z: L.z, sx: L.topR + 0.012, sy: 0.03, sz: L.topR + 0.012 }); // (the top, closed)
    b.add(GEO.cyl12, '#efc98e', { x: L.x, y: L.topY - 0.03, z: L.z, sx: L.topR, sy: 0.02, sz: L.topR }); // (...and lined under it)
    b.add(SHADE, C.gold, { x: L.x, y: L.rimY + 0.016, z: L.z, sx: L.rimR + 0.007, sy: 0.032, sz: L.rimR + 0.007 }); // (the rim's band)
    b.add(GEO.cyl6, C.gold, { x: L.x, y: L.bulbY + 0.075, z: L.z, sx: 0.03, sy: 0.09, sz: 0.03 }); // (the socket, short of the lining's top)
    bulbs.add(SPH, '#ffe3a0', { x: L.x, y: L.bulbY, z: L.z, sx: 0.075, sy: 0.065, sz: 0.075 });
    kit.addNightSpot({ x: L.x, y: L.y - 0.1, z: L.z, color: '#ffd28a', pool: 2.6, gy: fy, halo: 0 });
    kit.addNightSpot({ x: room.minX + 2.2, y: ceil - 0.2, z: (room.minZ + room.maxZ) / 2, color: '#ffc27a', pool: 1.6, gy: fy, halo: 0 });
    kit.addNightSpot({ x: room.maxX - 2.0, y: ceil - 0.2, z: (room.minZ + room.maxZ) / 2, color: '#ffc27a', pool: 1.6, gy: fy, halo: 0 });
    const BULB = ['#ffd27a', '#ff9a8a', '#ffe14f', '#ffb86b'];
    const strand = (xa, za, xb, zb, n, seed) => { for (let i = 1; i < n; i++) { const t = i / n, x = xa + (xb - xa) * t, z = za + (zb - za) * t, y = ceil - 0.08 - Math.sin(t * Math.PI * 4) ** 2 * 0.12; bulbs.add(GEO.ico0, BULB[(i + seed) % 4], { x, y, z, sx: 0.035, sy: 0.05, sz: 0.035 }); } };
    strand(room.minX + 0.1, room.maxZ - 0.12, room.maxX - 0.1, room.maxZ - 0.12, 36, 0);
    strand(room.minX + 0.1, room.minZ + 0.1, room.maxX - 0.1, room.minZ + 0.1, 36, 1);
    // and one across the ceiling through each of the room's two fill lights (fire-season: a light where its bulbs are)
    for (const [x, k] of [[room.minX + 2.2, 2], [room.maxX - 2.0, 3]]) strand(x, room.minZ + 0.1, x, room.maxZ - 0.12, Math.round((room.maxZ - room.minZ) / 0.22), k);
  }

  // ---- the west end: a couch against the west wall facing the table, an armchair, a side table of snacks and drinks
  {
    const cx = room.minX + 0.5, z0 = T.z - 1.45, z1 = T.z + 1.45; // (facing the table)
    b.boxMinMax(cx - 0.42, fy, z0, cx + 0.42, fy + 0.42, z1, C.couchDark);
    b.boxMinMax(cx - 0.38, fy + 0.42, z0 + 0.15, cx + 0.38, fy + 0.56, z1 - 0.15, C.couch);           // the seat cushions
    for (let z = z0 + 0.15 + 0.01; z < z1 - 0.2; z += (z1 - z0 - 0.3) / 2) b.boxMinMax(cx - 0.37, fy + 0.561, z, cx + 0.37, fy + 0.565, z + 0.01, C.couchDark);
    b.boxMinMax(cx - 0.42, fy + 0.42, z0 + 0.15, cx - 0.2, fy + 0.98, z1 - 0.15, C.couch);           // the back
    for (const z of [z0, z1 - 0.15]) b.boxMinMax(cx - 0.42, fy + 0.3, z, cx + 0.42, fy + 0.72, z + 0.15, C.couchDark); // the arms
    b.add(GEO.box, '#f0c24f', { x: cx - 0.1, y: fy + 0.74, z: z0 + 0.45, sx: 0.12, sy: 0.32, sz: 0.34, rz: -0.2 });   // pillows
    b.add(GEO.box, '#3f8fd9', { x: cx - 0.1, y: fy + 0.74, z: z1 - 0.45, sx: 0.12, sy: 0.32, sz: 0.34, rz: -0.2 });
    b.add(GEO.ico0, '#c0392b', { x: cx + 0.05, y: fy + 0.72, z: (z0 + z1) / 2, sx: 0.16, sy: 0.16, sz: 0.16, ry: 0.4 }); // a big plush d20
    col({ type: 'box', minX: cx - 0.45, maxX: cx + 0.45, minZ: z0, maxZ: z1 });
    // the armchair: in the corner by the front wall, its back to the west wall like the couch (a gap between them), facing the
    // table and turned a little toward the door
    const ax = room.minX + 0.5, az = room.minZ + 0.75, ay = 1.4;
    const at = (lx, ly, lz, sx, sy, sz, c) => { const [px, pz] = turn(ax, az, ay, lx, lz); b.add(GEO.box, c, { x: px, y: fy + ly, z: pz, sx, sy, sz, ry: ay }); };
    at(0, 0.22, 0, 0.8, 0.44, 0.74, '#2f6b4f'); at(0, 0.5, 0.04, 0.6, 0.12, 0.6, '#3f8a64'); at(0, 0.75, -0.32, 0.8, 0.62, 0.16, '#2f6b4f');
    for (const k of [-1, 1]) at(k * 0.34, 0.6, 0, 0.14, 0.32, 0.74, '#255a40');
    col({ type: 'circle', x: ax, z: az, r: 0.45 });
    // the snack table (between the couch and the table's west end): crisps, a bowl of sweets, cans, a jug
    const sx2 = room.minX + 1.45, sz2 = room.maxZ - 0.55;
    b.boxMinMax(sx2 - 0.32, fy + 0.58, sz2 - 0.28, sx2 + 0.32, fy + 0.62, sz2 + 0.28, C.wood);
    for (const [kx, kz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.boxMinMax(sx2 + kx * 0.27 - 0.025, fy, sz2 + kz * 0.23 - 0.025, sx2 + kx * 0.27 + 0.025, fy + 0.58, sz2 + kz * 0.23 + 0.025, C.woodDark);
    b.add(GEO.box, '#e0463c', { x: sx2 - 0.14, y: fy + 0.74, z: sz2 - 0.08, sx: 0.16, sy: 0.24, sz: 0.06, ry: 0.3 });  // a crisp packet
    b.add(GEO.cyl12, '#f3e3c3', { x: sx2 + 0.12, y: fy + 0.66, z: sz2 - 0.1, sx: 0.12, sy: 0.07, sz: 0.12 });
    for (let i = 0; i < 5; i++) { const a = i * 1.257; b.add(SPH, ['#e0463c', '#7ddc7a', '#f0c24f', '#b48cff', '#ff8fb8'][i], { x: sx2 + 0.12 + Math.cos(a) * 0.05, y: fy + 0.71, z: sz2 - 0.1 + Math.sin(a) * 0.05, sx: 0.025, sy: 0.025, sz: 0.025 }); } // each in its own spot
    for (let i = 0; i < 4; i++) b.add(GEO.cyl8, ['#3f8fd9', '#e0463c', '#7ddc7a', '#f0c24f'][i], { x: sx2 - 0.18 + i * 0.1, y: fy + 0.68, z: sz2 + 0.15, sx: 0.033, sy: 0.12, sz: 0.033 });
    b.add(GEO.cyl8, '#cfe6ee', { x: sx2 + 0.2, y: fy + 0.74, z: sz2 + 0.12, sx: 0.06, sy: 0.24, sz: 0.06 });
    col({ type: 'box', minX: sx2 - 0.34, maxX: sx2 + 0.34, minZ: sz2 - 0.3, maxZ: sz2 + 0.3 });
  }

  // ---- the east end: a tall bookcase of rulebooks along the east wall, a low case with minis, dice towers and a dice jar,
  // a second armchair
  {
    const wx = room.maxX, z0 = room.minZ + 0.5, z1 = room.maxZ - 0.5;
    kit.bookcase(b, 'z', wx, -1, z0, z1, fy, 2.2, [0.05, 0.6, 1.15, 1.7], 0.4, C.woodDark, (r, y, rowH, put) => {
      if (r === 1) { for (let i = 0; i < 6; i++) { const z = z0 + 0.3 + i * (z1 - z0 - 0.6) / 5; put(z, 0.2, y + 0.06, 0.06, 0.06, 0.012, '#2b2340'); put(z, 0.2, y + 0.12, 0.03, 0.03, 0.1, ['#e0463c', '#3f8fd9', '#7ddc7a', '#f0c24f', '#b48cff', '#ffffff'][i]); } } // painted minis on bases
      else if (r === 2) { put(z0 + 0.5, 0.2, y + 0.22, 0.22, 0.3, 0.44, '#4a2e1e'); put(z0 + 0.5, 0.06, y + 0.06, 0.12, 0.08, 0.06, C.gold); put(z1 - 0.6, 0.2, y + 0.2, 0.2, 0.3, 0.4, '#3f3a6e'); kit.spines(put, z0 + 0.9, z1 - 0.9, y, rowH, 0.3, 3); } // two dice towers and books
      else kit.spines(put, z0, z1, y, rowH, 0.3, r * 3 + 2);
    });
    col({ type: 'box', minX: wx - 0.42, maxX: wx, minZ: z0, maxZ: z1 });
    // a dice jar on the low stool by the case
    const jx = wx - 0.75, jz = room.minZ + 0.45;
    b.add(GEO.cyl8, C.woodDark, { x: jx, y: fy + 0.25, z: jz, sx: 0.18, sy: 0.5, sz: 0.18 });
    b.add(GEO.cyl12, '#cfe6ee', { x: jx, y: fy + 0.62, z: jz, sx: 0.12, sy: 0.24, sz: 0.12 });
    for (let i = 0; i < 9; i++) b.add(i % 2 ? GEO.ico0 : GEO.box, ['#e0463c', '#3f8fd9', '#f0c24f', '#7ddc7a', '#b48cff'][i % 5], { x: jx + ((i % 3) - 1) * 0.04, y: fy + 0.54 + Math.floor(i / 3) * 0.04, z: jz + ((i * 2 % 3) - 1) * 0.04, sx: 0.03, sy: 0.03, sz: 0.03, ry: i });
    col({ type: 'circle', x: jx, z: jz, r: 0.22 });
  }

  // ---- posters: the dragon and the map on the back wall, the credits poster by the door inside, the party banner over the
  // door, "roll for it" on the west wall
  face(art.uv('dragon'), P.sx - 3.4, fy + 1.75, room.maxZ - 0.035, 0.72, 0.9, Math.PI);
  face(art.uv('map'), P.sx + 1.6, fy + 1.75, room.maxZ - 0.035, 1.2, 0.8, Math.PI);
  face(art.uv('credits'), P.sx - 2.15, fy + 1.55, room.minZ + 0.035, 0.66, 1.2, 0);
  face(art.uv('party'), P.sx, D.y1 + 0.28, room.minZ + 0.035, 1.5, 0.25, 0);
  face(art.uv('tuesday'), P.sx + 2.1, fy + 1.7, room.minZ + 0.035, 0.7, 0.4, 0);
  if (kit.posterMat && kit.posterUv) b.add(cellPlane(0.7, 0.7, kit.posterUv('roll')), kit.posterMat, { x: room.minX + 0.035, y: fy + 1.85, z: room.minZ + 0.55, ry: Math.PI / 2 });

  // ---- the door: a frame (shop side and room side) and the leaf, hinged at its west jamb, swinging into the room
  const doorG = new THREE.Group(); doorG.name = 'backroom-door';
  const leaf = new THREE.Group(); leaf.position.set(D.x0 + 0.017, fy, D.z + 0.02); leaf.name = 'backroom-door-leaf';
  const W = D.x1 - D.x0 - 0.044, H = D.y1 - D.y0 - 0.032, g0 = D.glass[0] - fy, g1 = D.glass[1] - fy;
  {
    const parts = [];
    const add = (x, y, z, sx, sy, sz, c) => { const m = new THREE.Mesh(GEO.box, toon(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parts.push(m); };
    add(W / 2, g0 / 2, 0, W, g0, 0.06, C.woodMid);                         // the wood below
    add(W / 2, (g1 + H) / 2, 0, W, H - g1, 0.06, C.woodMid);               // the top rail
    for (const x of [0.05, W - 0.05]) add(x, (g0 + g1) / 2, 0, 0.1, g1 - g0, 0.06, C.woodMid); // the stiles beside the pane
    add(W / 2, g0 * 0.5, -0.035, W - 0.2, g0 * 0.7, 0.01, C.woodDark);    // a raised panel, both faces
    add(W / 2, g0 * 0.5, 0.035, W - 0.2, g0 * 0.7, 0.01, C.woodDark);
    for (const zz of [-0.045, 0.045]) { const m = new THREE.Mesh(GEO.sphere, toon(C.gold)); m.position.set(W - 0.12, 1.0, zz); m.scale.setScalar(0.04); parts.push(m); } // the knobs
    for (const m of parts) leaf.add(m);
    // the glass: clear (a light tint), and the gold lettering on it, readable from the shop
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, g1 - g0), new THREE.MeshBasicMaterial({ color: '#d8ecf4', transparent: true, opacity: 0.18, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    glass.position.set(W / 2, (g0 + g1) / 2, 0); glass.name = 'backroom-glass'; glass.renderOrder = 2; leaf.add(glass);
    const letters = doorLettering();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.26, (W - 0.26) / 2), new THREE.MeshBasicMaterial({ map: letters.tex, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    sign.position.set(W / 2, (g0 + g1) / 2, -0.004); sign.rotation.y = Math.PI; sign.name = 'backroom-lettering'; sign.renderOrder = 3; leaf.add(sign);
    leaf.userData = { glass, sign, letters };
  }
  doorG.add(leaf);
  // the frame round the opening: cream on the shop side (it matches the store's trim), wood in the room
  b.boxMinMax(D.x0 - 0.1, D.y1, P.zL - 0.16, D.x1 + 0.1, D.y1 + 0.14, P.zL - 0.11, '#f3e6c8');
  for (const x of [D.x0, D.x1]) b.boxMinMax(x - (x < P.sx ? 0.08 : 0), fy, P.zL - 0.16, x + (x < P.sx ? 0 : 0.08), D.y1, P.zL - 0.11, '#f3e6c8');
  b.boxMinMax(D.x0 - 0.08, D.y1, P.zL + 0.08, D.x1 + 0.08, D.y1 + 0.1, P.zL + 0.11, C.trim);
  // the jambs' reveal (the wall's thickness in the opening): lining the opening from the shop's casing to the room's face, so the
  // walls' own faces in the opening are covered (in one plane with it, they shimmered)
  for (const [x0, x1] of [[D.x0, D.x0 + 0.015], [D.x1 - 0.015, D.x1]]) b.boxMinMax(x0, fy, P.zL - 0.16, x1, D.y1, P.zL + 0.08, C.woodDark);
  b.boxMinMax(D.x0, D.y1 - 0.015, P.zL - 0.16, D.x1, D.y1, P.zL + 0.08, C.woodDark);
  const doorCol = col({ type: 'box', minX: D.x0, maxX: D.x1, minZ: P.zL - 0.12, maxZ: P.zL + 0.08, door: true });

  // ---- the room's walls as colliders: the front wall either side of the door (to the stairs' foot of the loft: the stairs
  // run up beside it outside), and a wall between the room and the stairs' top step, both only for someone on the floor
  col({ type: 'box', minX: P.stair.maxX, maxX: D.x0, minZ: P.zL - 0.12, maxZ: P.zL + 0.08 });
  col({ type: 'box', minX: D.x1, maxX: P.iMaxX, minZ: P.zL - 0.12, maxZ: P.zL + 0.08 });
  col({ type: 'box', minX: P.iMinX, maxX: P.stair.maxX, minZ: P.zL - 0.12, maxZ: P.zL + 0.08 });

  const seats = BR.seats.map(s => ({ x: s.x, z: s.z, y: s.y, yaw: s.yaw, seatY: s.seatY, name: s.dm ? 'dm chair' : 'dnd chair', hint: s.dm ? "E  Sit in the DM's chair" : 'E  Join D&D night', floor: 'back', table: 'dnd', dnd: s.i, dm: !!s.dm }));
  return { plan: BR, door: doorG, leaf, doorCol, seats, art };
}
