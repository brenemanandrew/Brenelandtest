// World edits: what Andrew places and moves in the World Editor (public/editor/world.html), kept on the server
// as /api/world-edits (DATA_DIR/world-edits.json, so it outlives a redeploy; empty = the world as the code builds it).
//
// The file is one object. Every list is optional:
//   moves:   { "<layout name>": { x, z, ... } }  nudges to named layout.js constants (the ones in MOVABLE below): the swing,
//            the mailbox, the toy basket, a yard tree ("YARD_TREES[3]"), a log, a shore rock, Kevin's lookouts...
//            Four stay fixed because the server reads them straight out of layout.js (lib/layout-read.js): BOCCE, BOOTH,
//            DOCK, SWING_TREE. Moving those is a code change.
//   props:   [{ id, kind, x, z, yaw?, s?, ...per kind }]  doodads from the palette (PROPS below): trees, rocks, bushes,
//            flower beds, benches, lamps, signs, logs, picnic tables, pots, fence runs, and whole gable houses.
//   roads:   [{ id, name, width, pts }]  paved roads, kerbs and sidewalks included (road-net.js joins an end that lands on
//            another road's centre line); trails: [{ name, width, pts }] dirt paths.
//   terrain: [{ x, z, r, dh }]  round bumps (dh > 0) and dips (dh < 0), metres.
//   water:   [{ id, name, poly }]  ponds: closed polygons; the water level is the lakes' (terrain.js WATER_Y).
//   zones:   [{ id, name, type, x, z, r }] or [{ id, name, type, pts }]  named spots: 'region' names the HUD place
//            (REGIONS), 'fishing' and 'event' are kept for the systems that will read them (fishing areas, scheduled events)
//            and drawn only in the editor for now.
//
// Order matters: applyWorldEdits() runs before buildWorld() (it changes the data the builders read), buildWorldProps() runs
// after buildAreas() (it puts the props into the scene and the colliders). Everything is a pure function of the file, so
// every visitor sees the same world (CLAUDE.md: NPCs and dogs stay in step).
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import * as L from './layout.js';
import { rebuildNet } from './road-net.js';
import { rebuildLakes, TERRAIN_BRUSHES, terrainHeight, addFlatZone } from './terrain.js';
import { Batcher, GEO } from './batch.js';
import { addTree } from './world-trees.js';
import { addGableHouse } from './world.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { soft } from './toon.js';
import { mulberry32 } from './util.js';

/** Which layout constants the editor may move, and which of their fields. Lists are addressed as NAME[i]. */
export const MOVABLE = {
  MAILBOX: ['x', 'z'], TOY_BASKET: ['x', 'z'], PORCH_SWING: ['x', 'z', 'w'], FISH_SHACK: ['x', 'z'], FOUNTAIN: ['x', 'z', 'r'],
  SCOUT_CAMP: ['x', 'z'], TENT: ['x', 'z'], WATER_TOWER: ['x', 'z'], SPAWN: ['x', 'z', 'yaw'],
  LOGS: ['x', 'z', 'axis', 'face', 'len'], YARD_TREES: ['x', 'z', 'kind'], SHORE_ROCKS: ['x', 'z', 's'], KEVIN_LOOKOUTS: ['x', 'z'],
  SCENIC_BENCH: ['x', 'z', 'yaw'], PHOTO_BOARD: ['x', 'z', 'yaw'], // (the lake bench and the photo board)
};
export const FIXED = ['BOCCE', 'BOOTH', 'DOCK', 'SWING_TREE']; // the server reads these from layout.js itself

/** The prop palette: id -> { name, r (footprint radius, for the clearing and the collider), fields the editor shows }. */
export const PROPS = {
  tree: { name: 'Tree', r: 0.5, fields: { kind: ['oak', 'maple', 'birch', 'pine', 'palm'], s: [0.5, 2] } },
  rock: { name: 'Rock', r: 0.8, fields: { s: [0.4, 3] } },
  bush: { name: 'Bush', r: 0.6, fields: { s: [0.5, 2] } },
  flowers: { name: 'Flower bed', r: 1.2, fields: { s: [0.5, 3] } },
  bench: { name: 'Bench', r: 0.9, fields: { yaw: true } },
  lamp: { name: 'Lamp post', r: 0.2, fields: {} },
  sign: { name: 'Sign', r: 0.3, fields: { yaw: true, text: true } },
  log: { name: 'Fallen log', r: 1.4, fields: { yaw: true, s: [0.6, 2] } },
  picnic: { name: 'Picnic table', r: 1.5, fields: { yaw: true } },
  pot: { name: 'Plant pot', r: 0.3, fields: {} },
  fence: { name: 'Fence run', r: 0, fields: { line: true } },
  house: { name: 'House', r: 0, fields: { yaw: true, w: [8, 16], d: [7, 12], h: [4, 7], wall: 'color', roof: 'color' } },
};

export const PREVIEW = typeof location !== 'undefined' && new URLSearchParams(location.search).has('preview'); // the World Editor's 3D pane
export async function loadWorldEdits() {
  if (PREVIEW && !new URLSearchParams(location.search).has('pose')) { try { const j = JSON.parse(sessionStorage.getItem('breneland.previewEdits') || 'null'); if (j && typeof j === 'object') return j; } catch { /* the server's then */ } }
  try {
    const r = await fetch('/api/world-edits', { cache: 'no-store' });
    if (!r.ok) return {};
    const j = await r.json();
    return j && typeof j === 'object' ? j : {};
  } catch { return {}; }
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pts2 = pts => (Array.isArray(pts) ? pts.filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [+p[0], +p[1]]) : []);

/** Change the layout data before the world is built. Returns the normalised edits (what buildWorldProps() then places). */
export function applyWorldEdits(raw) {
  const E = raw && typeof raw === 'object' ? raw : {};
  // ---- moves: nudge the named constants in place (same objects every module imported)
  const follow = [['SCOUT_CAMP', 9], ['TENT', 4.5], ['WATER_TOWER', 10], ['FISH_SHACK', 4.2], ['TOY_BASKET', 1.2]].map(([n, r]) => ({ n, r, x: L[n].x, z: L[n].z }));
  for (const [key, patch] of Object.entries(E.moves || {})) {
    const m = /^([A-Z_]+)(?:\[(\d+)\])?$/.exec(key); if (!m || !patch) continue;
    const fields = MOVABLE[m[1]]; if (!fields) continue;
    let target = L[m[1]];
    if (m[2] !== undefined) target = Array.isArray(target) ? target[+m[2]] : null;
    if (!target || typeof target !== 'object') continue;
    const isPair = Array.isArray(target); // KEVIN_LOOKOUTS: [x, z]
    for (const f of fields) {
      if (!(f in patch)) continue;
      const v = patch[f];
      if (isPair) { if (f === 'x') target[0] = num(v, target[0]); else if (f === 'z') target[1] = num(v, target[1]); }
      else if (typeof target[f] === 'number') target[f] = num(v, target[f]);
      else if (typeof target[f] === 'string' && typeof v === 'string') target[f] = v;
    }
  }
  // a moved clearing follows its owner (CLEARINGS copied x, z at load)
  for (const f of follow) { const o = L[f.n]; const c = L.CLEARINGS.find(c => c.r === f.r && c.x === f.x && c.z === f.z); if (c) { c.x = o.x; c.z = o.z; } }
  { const c = L.CLEARINGS.find(c => c.fountain); if (c) { c.x = L.FOUNTAIN.x; c.z = L.FOUNTAIN.z; c.r = L.FOUNTAIN.r * 1.5; } }   // (town-fixes: the fountain's, its size too: the apron scales with r)
  for (const lg of L.LOGS) { const c = L.CLEARINGS.find(c => Math.abs(c.r - (lg.len / 2 + 0.9)) < 1e-9 && Math.hypot(c.x - lg.x, c.z - lg.z) < 30); if (c) { c.x = lg.x; c.z = lg.z; } }
  // ---- terrain and water, before anything measures the ground
  TERRAIN_BRUSHES.length = 0;
  for (const b of E.terrain || []) if (b && num(b.r) > 0.5) TERRAIN_BRUSHES.push({ x: num(b.x), z: num(b.z), r: Math.min(80, num(b.r)), dh: Math.max(-6, Math.min(12, num(b.dh))) });
  const water = [];
  for (const w of E.water || []) { const poly = pts2(w && w.poly); if (poly.length >= 3) { const l = { id: String(w.id || 'pond'), name: String(w.name || 'Pond'), poly, edit: true }; L.LAKES.push(l); water.push(l); } }
  rebuildLakes();
  // ---- roads and trails
  const roads = [];
  for (const r of E.roads || []) {
    const pts = pts2(r && r.pts); if (pts.length < 2) continue;
    const road = { id: String(r.id || 'road-' + roads.length), name: String(r.name || 'New Rd'), width: Math.max(5, Math.min(12, num(r.width, 8))), pts, edit: true };
    if (L.ROADS.some(o => o.id === road.id)) continue;
    L.ROADS.push(road); roads.push(road);
  }
  rebuildNet();
  const trails = [];
  for (const t of E.trails || []) {
    const pts = pts2(t && t.pts); if (pts.length < 2) continue;
    const tr = { name: String(t.name || 'trail-' + trails.length), width: Math.max(0.8, Math.min(3, num(t.width, 1.5))), pts, edit: true };
    L.TRAILS.push(tr); trails.push(tr);
  }
  // ---- zones: a 'region' names the place on the HUD; the rest wait for their systems
  const zones = [];
  for (const z of E.zones || []) {
    if (!z) continue;
    const zone = { id: String(z.id || 'zone-' + zones.length), name: String(z.name || 'Spot'), type: ['region', 'fishing', 'event'].includes(z.type) ? z.type : 'region' };
    if (Array.isArray(z.pts)) { zone.pts = pts2(z.pts); if (zone.pts.length < 3) continue; }
    else { zone.x = num(z.x); zone.z = num(z.z); zone.r = Math.max(1, num(z.r, 5)); }
    zones.push(zone);
    if (zone.type === 'region') L.REGIONS.unshift(zone.pts ? { name: zone.name, poly: zone.pts } : { name: zone.name, x: zone.x, z: zone.z, r: zone.r });
  }
  // ---- props: normalised, and each takes a clearing so no grass or wild tree grows through it
  const props = normaliseProps(E.props, true);
  return { moves: E.moves || {}, props, roads, trails, terrain: TERRAIN_BRUSHES.slice(), water, zones };
}
const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

/** The props list, checked and filled in. clear = true also claims a clearing (and a flat pad under a house) for each. */
export function normaliseProps(list, clear) {
  const props = [];
  for (const p of list || []) {
    if (!p || !PROPS[p.kind]) continue;
    const q = { id: String(p.id || 'p' + props.length), kind: p.kind, x: num(p.x), z: num(p.z), yaw: num(p.yaw), s: Math.max(0.3, Math.min(3, num(p.s, 1))) };
    if (p.kind === 'tree') q.tree = ['oak', 'maple', 'birch', 'pine', 'palm'].includes(p.tree) ? p.tree : 'oak';
    if (p.kind === 'sign') q.text = String(p.text || '').slice(0, 24);
    if (p.kind === 'fence') { q.pts = pts2(p.pts); if (q.pts.length < 2) continue; }
    if (p.kind === 'house') { q.w = Math.max(8, Math.min(16, num(p.w, 11))); q.d = Math.max(7, Math.min(12, num(p.d, 9))); q.h = Math.max(4, Math.min(7, num(p.h, 4.2))); q.wall = color(p.wall, '#f2de8c'); q.roof = color(p.roof, '#5b6b86'); if (clear) addFlatZone({ x: q.x, z: q.z, r: Math.hypot(q.w, q.d) / 2 + 1.5, y: 0.3 }); }
    props.push(q);
    if (!clear) continue;
    const r = p.kind === 'house' ? Math.hypot(q.w, q.d) / 2 + 1 : PROPS[p.kind].r * q.s + 0.6;
    if (r > 0) L.CLEARINGS.push({ x: q.x, z: q.z, r });
    if (p.kind === 'fence') for (const [x, z] of q.pts) L.CLEARINGS.push({ x, z, r: 0.8 });
  }
  return props;
}

/** Build the placed props into the scene; pushes their colliders. Call after buildAreas(), before world.scatter(). */
export function buildWorldProps(root, colliders, edits) {
  const props = edits && edits.props || [];
  const old = root.getObjectByName('world-edits'); if (old) { old.removeFromParent(); old.traverse(o => { if (o.geometry && o.geometry !== GEO.box && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); }); }
  if (!props.length) return null;
  const rnd = mulberry32(2026);
  const b = new Batcher({ vertexColors: true }), f = new Batcher({ castShadow: false, vertexColors: true });
  const group = new THREE.Group(); group.name = 'world-edits'; root.add(group);
  const ink = '#2b2340';
  const gy = (x, z) => terrainHeight(x, z);
  for (const p of props) {
    const { x, z, yaw, s } = p, y = gy(x, z);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const at = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos]; // local -> world, yaw about y (Three.js: forward = (sin, cos))
    switch (p.kind) {
      case 'tree': { const r = addTree(b, x, z, p.tree, rnd, s); colliders.push({ type: 'circle', x, z, r: r + 0.2, tree: true }); break; }
      case 'rock': {
        b.add(GEO.ico0, ['#8d8a84', '#9a948a', '#7f8288'][Math.floor(rnd() * 3)], { x, y: y + 0.45 * s, z, sx: 1.1 * s, sy: 0.8 * s, sz: 0.9 * s, ry: yaw, rx: 0.2 });
        b.add(GEO.ico0, '#a39f96', { x: x + 0.5 * s, y: y + 0.22 * s, z: z + 0.3 * s, sx: 0.5 * s, sy: 0.35 * s, sz: 0.45 * s, ry: yaw + 0.7 });
        colliders.push({ type: 'circle', x, z, r: 0.9 * s }); break;
      }
      case 'bush': {
        for (let i = 0; i < 3; i++) { const a = i * 2.1, d = 0.3 * s; b.add(GEO.ico1, i % 2 ? '#3f8a3f' : '#4a9a45', { x: x + Math.cos(a) * d, y: y + 0.55 * s, z: z + Math.sin(a) * d, sx: 0.62 * s, sy: 0.6 * s, sz: 0.58 * s, ry: a }); }
        colliders.push({ type: 'circle', x, z, r: 0.7 * s }); break;
      }
      case 'flowers': {
        const w = 1.2 * s, d = 0.9 * s;
        b.add(GEO.box, '#6b4a2e', { x, y: y + 0.12, z, sx: w * 2, sy: 0.24, sz: d * 2, ry: yaw });
        b.add(GEO.box, '#bcb3a4', { x, y: y + 0.22, z, sx: w * 2 + 0.2, sy: 0.08, sz: d * 2 + 0.2, ry: yaw });
        const cols = ['#ff8fb1', '#fff27a', '#b89cff', '#ffffff', '#ff9f4a'];
        for (let i = 0; i < Math.round(8 * s); i++) { const [fx, fz] = at((rnd() - 0.5) * w * 1.7, (rnd() - 0.5) * d * 1.7); b.add(GEO.ico1, '#4f9a3e', { x: fx, y: y + 0.4, z: fz, sx: 0.28, sy: 0.26, sz: 0.28 }); b.add(GEO.ico1, cols[i % cols.length], { x: fx + 0.08, y: y + 0.62, z: fz, sx: 0.11, sy: 0.11, sz: 0.11 }); }
        break;
      }
      case 'bench': {
        const wood = '#b9814f', dark = '#7a5234';
        for (let i = 0; i < 3; i++) { const [bx, bz] = at(0, -0.15 + i * 0.15); b.add(GEO.box, wood, { x: bx, y: y + 0.45, z: bz, sx: 1.7, sy: 0.05, sz: 0.12, ry: yaw }); }
        for (let i = 0; i < 2; i++) { const [bx, bz] = at(0, 0.3 + i * 0.015); b.add(GEO.box, wood, { x: bx, y: y + 0.65 + i * 0.16, z: bz, sx: 1.7, sy: 0.12, sz: 0.045, ry: yaw }); }
        for (const lx of [-0.72, 0.72]) { const [bx, bz] = at(lx, 0); b.add(GEO.box, dark, { x: bx, y: y + 0.22, z: bz, sx: 0.08, sy: 0.44, sz: 0.5, ry: yaw }); const [px, pz] = at(lx, 0.3); b.add(GEO.box, dark, { x: px, y: y + 0.6, z: pz, sx: 0.08, sy: 0.5, sz: 0.08, ry: yaw }); }
        colliders.push({ type: 'circle', x, z, r: 0.9 }); break;
      }
      case 'lamp': {
        if (propsReady('street_lamp')) { // (props-static: the Blender street lamp; its arm reaches the prop's yaw, the light at its bulb)
          const [lx, ly, lz] = addProp(b, 'street_lamp', { x, y, z, yaw }).anchor('light_anchor');
          addNightSpot({ x: lx, y: ly, z: lz, color: '#ffd98e', pool: 3.4, gy: y, halo: 1.3 });
          colliders.push({ type: 'circle', x, z, r: 0.15 }); break;
        }
        b.add(GEO.cyl6, '#3a3f47', { x, y: y + 2.2, z, sx: 0.09, sy: 4.4, sz: 0.09 });
        b.add(GEO.box, '#3a3f47', { x, y: y + 4.4, z, sx: 0.5, sy: 0.12, sz: 0.5 });
        b.add(GEO.box, lampGlow('#fff3c4'), { x, y: y + 4.25, z, sx: 0.4, sy: 0.18, sz: 0.4 });
        addNightSpot({ x, y: y + 4.1, z, color: '#ffd98e', pool: 3.4, gy: y, halo: 1.3 });
        colliders.push({ type: 'circle', x, z, r: 0.15 }); break;
      }
      case 'sign': {
        b.add(GEO.box, '#6f5a44', { x, y: y + 0.8, z, sx: 0.12, sy: 1.6, sz: 0.12 });
        b.add(GEO.box, '#8a6240', { x, y: y + 1.55, z, sx: 1.4, sy: 0.5, sz: 0.08, ry: yaw });
        f.add(GEO.box, '#fbf7ee', { x, y: y + 1.55, z, sx: 1.25, sy: 0.36, sz: 0.1, ry: yaw });
        if (p.text) signText(group, p.text, x, y + 1.55, z, yaw);
        colliders.push({ type: 'circle', x, z, r: 0.2 }); break;
      }
      case 'log': {
        const len = 2.6 * s, r = 0.3 * s;
        b.add(GEO.cyl8, '#7a5234', { x, y: y + r * 0.8, z, sx: r, sy: len, sz: r, rz: Math.PI / 2, ry: yaw });
        for (const e of [-1, 1]) { const [ex, ez] = at(e * len / 2, 0); b.add(GEO.cyl8, '#c9a06a', { x: ex, y: y + r * 0.8, z: ez, sx: r * 0.9, sy: 0.04, sz: r * 0.9, rz: Math.PI / 2, ry: yaw }); }
        colliders.push({ type: 'box', minX: x - Math.max(Math.abs(cos) * len / 2, r), maxX: x + Math.max(Math.abs(cos) * len / 2, r), minZ: z - Math.max(Math.abs(sin) * len / 2, r), maxZ: z + Math.max(Math.abs(sin) * len / 2, r) });
        break;
      }
      case 'picnic': {
        const wood = '#b9814f', dark = '#7a5234';
        b.add(GEO.box, wood, { x, y: y + 0.78, z, sx: 1.8, sy: 0.06, sz: 0.8, ry: yaw });
        for (const lz of [-0.75, 0.75]) { const [bx, bz] = at(0, lz); b.add(GEO.box, wood, { x: bx, y: y + 0.45, z: bz, sx: 1.8, sy: 0.05, sz: 0.3, ry: yaw }); }
        for (const lx of [-0.7, 0.7]) { const [bx, bz] = at(lx, 0); b.add(GEO.box, dark, { x: bx, y: y + 0.4, z: bz, sx: 0.08, sy: 0.8, sz: 1.7, ry: yaw, rx: 0.35 }); b.add(GEO.box, dark, { x: bx, y: y + 0.4, z: bz, sx: 0.08, sy: 0.8, sz: 1.7, ry: yaw, rx: -0.35 }); }
        colliders.push({ type: 'circle', x, z, r: 1.3 }); break;
      }
      case 'pot': {
        b.add(GEO.cyl8, '#c9683f', { x, y: y + 0.25, z, sx: 0.28, sy: 0.5, sz: 0.28 });
        b.add(GEO.ico1, '#4f9a3e', { x, y: y + 0.8, z, sx: 0.42, sy: 0.5, sz: 0.42 });
        colliders.push({ type: 'circle', x, z, r: 0.3 }); break;
      }
      case 'fence': {
        for (let i = 0; i < p.pts.length - 1; i++) {
          const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); if (len < 0.3) continue;
          const ry = Math.atan2(dx, dz) + Math.PI / 2, ux = dx / len, uz = dz / len;
          for (let d = 0; d <= len; d += 0.45) { const px = ax + ux * d, pz = az + uz * d, py = gy(px, pz); b.add(GEO.box, '#fbfaf5', { x: px, y: py + 0.5, z: pz, sx: 0.1, sy: 1.0, sz: 0.1 }); }
          for (const ry0 of [0.35, 0.8]) { const mx = (ax + bx) / 2, mz = (az + bz) / 2; b.add(GEO.box, '#fbfaf5', { x: mx, y: gy(mx, mz) + ry0, z: mz, sx: len, sy: 0.08, sz: 0.06, ry }); }
          colliders.push({ type: 'box', minX: Math.min(ax, bx) - 0.15, maxX: Math.max(ax, bx) + 0.15, minZ: Math.min(az, bz) - 0.15, maxZ: Math.max(az, bz) + 0.15 });
        }
        break;
      }
      case 'house': {
        const facing = Math.cos(yaw) >= 0 ? 1 : -1; // the door faces +z (south, toward the viewer at spawn) or -z
        addGableHouse(b, f, x, z, p.w, p.d, p.h, p.wall, p.roof, rnd, facing);
        const front = z + facing * (p.d / 2);
        colliders.push({ type: 'box', minX: x - p.w / 2 - 0.1, maxX: x + p.w / 2 + 0.1, minZ: Math.min(z - p.d / 2, front + facing * 0.95) - 0.1, maxZ: Math.max(z + p.d / 2, front + facing * 0.95) + 0.1 });
        break;
      }
    }
  }
  b.build(group, 'world-edits');
  f.build(group, 'world-edits-details').forEach(m => soft(m));
  void ink;
  return group;
}

// A sign's words: a small canvas on a plane, ink on the board (the game's own area labels do the same, ui.js)
function signText(group, text, x, y, z, yaw) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const g = c.getContext('2d'); g.fillStyle = '#2b2340'; g.font = '700 34px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  for (const side of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.36), mat); m.position.set(x + Math.sin(yaw) * 0.07 * side, y, z + Math.cos(yaw) * 0.07 * side); m.rotation.y = yaw + (side < 0 ? Math.PI : 0); group.add(m); }
}
