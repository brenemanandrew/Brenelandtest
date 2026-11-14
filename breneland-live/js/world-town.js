// The town north of the yard: roads with curbs and sidewalks, Maple Row and Summit Hill (houses, walks, driveways,
// mailboxes, trees), the shop fronts on Summit Rd (the game store's lot is left to game-store.js), street lamps, street
// signs, parked cars, and the carnival on the far hill (seen, never reached).
// world.js calls buildTown(root, colliders, updaters) once while the world is built. Everything static is batched.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { ROADS, SIDEWALK_W, GAME_STORE, CARNIVAL, SHOPS, CAR_LOT, CROSSINGS, PARK_LOT, STREET } from './layout.js';
import { NET, PAVED_BOX, CUTS, KERB_W, TAR_Y, WALK_Y, paveField, paveFieldRaw, pastEnd, othersField } from './road-net.js';
import { terrainHeight, addSurface } from './terrain.js';
import { Batcher, GEO } from './batch.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { soft, glow } from './toon.js';
import { mulberry32 } from './util.js';
import { lampGlow, addNightSpot, windowGlass } from './daynight-mats.js';
import { addGableHouse, addCar, STREET_HOUSES } from './world.js';
import { houseNames, buildNamePlates } from './mailbox-names.js';
import { CRIB, toWorld } from './tool-crib-plan.js';
import { addTree } from './world-trees.js';
import { signTexture } from './areas.js';
import { addBenchSeats } from './seats.js';
import { buildBusStop, buildTunnel, finishBusSigns } from './bus-stop-build.js';
import { buildMailOffice } from './mail-office-build.js';

const TAR = '#5d6168', WALKWAY = '#d4cfc5', CURB = '#bdb7ab', KERB_FACE = '#a8a296', LINE = '#f1c94a', WHITE = '#f4f2ea';

// ------------------------------------------------------------------ roads, kerbs and sidewalks
// One paved field (road-net.js) cut into three flat bands on a 1 m grid: the tar (field < 0), the kerb top (0..KERB_W)
// and the sidewalk (KERB_W..SIDEWALK_W). Each grid triangle is clipped against the band edges, so neighbouring
// triangles share every vertex exactly: no overlaps, no gaps, no z-fighting, and the kerb follows the field round
// every corner. The square ends (the lake, the map edge) are clipped exactly on their end line. Vertical faces go
// where the tar meets the kerb and round the paving's outer edge, down to the real ground.

const GRID = 1;
const LEVELS = [0, KERB_W, SIDEWALK_W];
const BANDS = [['tar', -Infinity, 0], ['kerb', 0, KERB_W], ['walk', KERB_W, SIDEWALK_W]];
const BAND_Y = { tar: TAR_Y, kerb: WALK_Y, walk: WALK_Y };
const keyOf = (x, z) => Math.round(x * 1e4) + ',' + Math.round(z * 1e4);

// the point where value `val` crosses `level` on segment a-b, computed the same way from either end (shared edges)
function cross(a, b, va, vb, level) {
  if (a.x > b.x || (a.x === b.x && a.z > b.z)) { const t = a; a = b; b = t; const u = va; va = vb; vb = u; }
  const t = (level - va) / (vb - va);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, f: a.f + (b.f - a.f) * t };
}
// Sutherland-Hodgman against one half-plane: keep v(p) <= level (below) or >= level
function clipPoly(poly, v, level, below) {
  const out = [];
  const inside = p => (below ? v(p) <= level : v(p) >= level);
  for (let i = 0; i < poly.length; i++) {
    const S = poly[(i + poly.length - 1) % poly.length], E = poly[i];
    const si = inside(S), ei = inside(E);
    if (ei) { if (!si) out.push(cross(S, E, v(S), v(E), level)); out.push(E); }
    else if (si) out.push(cross(S, E, v(S), v(E), level));
  }
  // drop repeated points (a vertex lying exactly on the line)
  const clean = [];
  for (const p of out) { const k = keyOf(p.x, p.z); if (!clean.length || clean[clean.length - 1].k !== k) clean.push({ x: p.x, z: p.z, f: p.f, k }); }
  if (clean.length > 1 && clean[0].k === clean[clean.length - 1].k) clean.pop();
  return clean;
}

// The paving as plain data (tests read it too): top triangles per band ([x, z] x 3, wound to face up) and the vertical
// faces ({ a: [x, z], b: [x, z], top, band, bottom: 'tar' | 'ground', out: [nx, nz] (the way the face looks) }).
export function pavingData() {
  const B = PAVED_BOX;
  const x0 = Math.floor(B.minX), z0 = Math.floor(B.minZ);
  const nx = Math.ceil((B.maxX - x0) / GRID), nz = Math.ceil((B.maxZ - z0) / GRID);
  const F = new Float64Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let f = paveFieldRaw(x0 + i * GRID, z0 + j * GRID);
    for (const L of LEVELS) if (Math.abs(f - L) < 1e-5) f = L + 1e-5; // never exactly on a band edge
    F[j * (nx + 1) + i] = f;
  }
  const node = (i, j) => ({ x: x0 + i * GRID, z: z0 + j * GRID, f: F[j * (nx + 1) + i] });
  const tris = { tar: [], kerb: [], walk: [] };
  const fv = p => p.f;
  const push = (band, p0, p1, p2) => {
    const area = (p1.x - p0.x) * (p2.z - p0.z) - (p1.z - p0.z) * (p2.x - p0.x);
    if (Math.abs(area) < 1e-7) return;
    // facing up (+y): (p1 - p0) x (p2 - p0) has a positive y when this area is negative
    tris[band].push(area < 0 ? [[p0.x, p0.z], [p1.x, p1.z], [p2.x, p2.z]] : [[p0.x, p0.z], [p2.x, p2.z], [p1.x, p1.z]]);
  };
  // one 1 m cell, clipped against the square ends and the band edges
  const fineCell = (i, j) => {
    const a = node(i, j), b = node(i + 1, j), c = node(i + 1, j + 1), d = node(i, j + 1);
    if (Math.min(a.f, b.f, c.f, d.f) > SIDEWALK_W) return;
    for (let poly of [[a, b, c], [a, c, d]]) {
      if (Math.min(poly[0].f, poly[1].f, poly[2].f) > SIDEWALK_W) continue;
      const cx = (poly[0].x + poly[1].x + poly[2].x) / 3, cz = (poly[0].z + poly[1].z + poly[2].z) / 3;
      for (const e of CUTS) { // a square end or a driveway apron's cut: keep only what is behind its line
        const along = (cx - e.x) * e.ux + (cz - e.z) * e.uz, lat = Math.abs((cx - e.x) * -e.uz + (cz - e.z) * e.ux);
        if (lat > e.lat || along < -3 || along > e.depth) continue;
        poly = clipPoly(poly, p => (p.x - e.x) * e.ux + (p.z - e.z) * e.uz, 0, true);
        if (poly.length < 3) break;
      }
      if (poly.length < 3) continue;
      for (const [band, lo, hi] of BANDS) {
        let q = poly;
        if (lo > -Infinity) q = clipPoly(q, fv, lo, false);
        if (q.length >= 3) q = clipPoly(q, fv, hi, true);
        for (let k = 1; k + 1 < q.length; k++) push(band, q[0], q[k], q[k + 1]);
      }
    }
  };
  // 2 m cells lying wholly inside one band (most of the tar, some sidewalk) are drawn whole: two triangles, or a fan
  // through the edge midpoints a finer neighbour uses (so no vertex ever sits on another triangle's edge)
  const cnx = Math.floor(nx / 2), cnz = Math.floor(nz / 2);
  const U = new Array(cnx * cnz).fill(null);
  for (let cj = 0; cj < cnz; cj++) for (let ci = 0; ci < cnx; ci++) {
    const cx = x0 + (ci * 2 + 1) * GRID, cz = z0 + (cj * 2 + 1) * GRID;
    if (CUTS.some(e => Math.abs((cx - e.x) * -e.uz + (cz - e.z) * e.ux) < e.lat + 3 && (cx - e.x) * e.ux + (cz - e.z) * e.uz > -6)) continue;
    let band = null;
    for (let dj = 0; dj <= 2 && band !== 'x'; dj++) for (let di = 0; di <= 2; di++) {
      const f = F[(cj * 2 + dj) * (nx + 1) + ci * 2 + di];
      const nb = f < -0.03 ? 'tar' : f > KERB_W + 0.03 && f < SIDEWALK_W - 0.03 ? 'walk' : 'x';
      if (band === null) band = nb; else if (nb !== band) band = 'x';
      if (band === 'x') break;
    }
    if (band !== 'x') U[cj * cnx + ci] = band;
  }
  const uni = (ci, cj) => (ci >= 0 && cj >= 0 && ci < cnx && cj < cnz ? U[cj * cnx + ci] : null);
  for (let cj = 0; cj * 2 < nz; cj++) for (let ci = 0; ci * 2 < nx; ci++) {
    const band = uni(ci, cj), i = ci * 2, j = cj * 2;
    if (!band) { for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) if (i + di < nx && j + dj < nz) fineCell(i + di, j + dj); continue; }
    const mid = [!uni(ci, cj - 1), !uni(ci + 1, cj), !uni(ci, cj + 1), !uni(ci - 1, cj)]; // north, east, south, west neighbours finer
    if (!mid.some(Boolean)) { push(band, node(i, j), node(i + 2, j), node(i + 2, j + 2)); push(band, node(i, j), node(i + 2, j + 2), node(i, j + 2)); continue; }
    const ring = [node(i, j)];
    if (mid[0]) ring.push(node(i + 1, j));
    ring.push(node(i + 2, j));
    if (mid[1]) ring.push(node(i + 2, j + 1));
    ring.push(node(i + 2, j + 2));
    if (mid[2]) ring.push(node(i + 1, j + 2));
    ring.push(node(i, j + 2));
    if (mid[3]) ring.push(node(i, j + 1));
    const ctr = node(i + 1, j + 1);
    for (let k = 0; k < ring.length; k++) push(band, ctr, ring[k], ring[(k + 1) % ring.length]);
  }
  // the edges: shared by two triangles at two heights (tar against kerb) or by one only (the paving's rim)
  const edges = new Map();
  for (const band of ['tar', 'kerb', 'walk']) for (const t of tris[band]) {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cz = (t[0][1] + t[1][1] + t[2][1]) / 3;
    for (let k = 0; k < 3; k++) {
      const p = t[k], q = t[(k + 1) % 3], kp = keyOf(p[0], p[1]), kq = keyOf(q[0], q[1]);
      const key = kp < kq ? kp + '|' + kq : kq + '|' + kp;
      let e = edges.get(key);
      if (!e) edges.set(key, e = { a: p, b: q, sides: [] });
      e.sides.push({ band, cx, cz });
    }
  }
  const faces = [];
  let odd = 0;
  for (const e of edges.values()) {
    let hi = null, bottom = null;
    if (e.sides.length === 1) { hi = e.sides[0]; bottom = 'ground'; }
    else if (e.sides.length === 2) {
      const [s, t] = e.sides;
      if (BAND_Y[s.band] === BAND_Y[t.band]) continue;
      hi = BAND_Y[s.band] > BAND_Y[t.band] ? s : t; bottom = 'tar';
    } else { odd++; continue; }
    // look away from the higher (or only) side
    let ox = -(e.b[1] - e.a[1]), oz = e.b[0] - e.a[0];
    const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L;
    const mx = (e.a[0] + e.b[0]) / 2, mz = (e.a[1] + e.b[1]) / 2;
    if ((mx - hi.cx) * ox + (mz - hi.cz) * oz < 0) { ox = -ox; oz = -oz; }
    faces.push({ a: e.a, b: e.b, top: BAND_Y[hi.band], band: hi.band, bottom, out: [ox, oz] });
  }
  return { tris, faces, odd, grid: GRID };
}

// Bake the paving into the town batch (vertex colours: one draw call with everything else in it).
function addPaving(b) {
  const { tris, faces } = pavingData();
  const COL = { tar: TAR, kerb: CURB, walk: WALKWAY };
  for (const band of ['tar', 'kerb', 'walk']) {
    const pos = new Float32Array(tris[band].length * 9);
    let o = 0;
    for (const t of tris[band]) for (const [x, z] of t) { pos[o++] = x; pos[o++] = BAND_Y[band]; pos[o++] = z; }
    if (!o) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, COL[band]);
  }
  for (const kind of ['tar', 'ground']) {
    const pos = [];
    for (const f of faces) {
      if (f.bottom !== kind) continue;
      const lo = p => (kind === 'tar' ? TAR_Y : Math.min(f.top - 0.06, terrainHeight(p[0], p[1]) - 0.05));
      let a = f.a, c = f.b;
      // wind it so its normal looks along `out`: the quad (a top, a low, c top) faces (c - a) x down
      const nx = -(c[1] - a[1]), nz = c[0] - a[0];
      if (nx * f.out[0] + nz * f.out[1] < 0) { const t = a; a = c; c = t; }
      const ya = lo(a), yc = lo(c);
      pos.push(a[0], f.top, a[1], a[0], ya, a[1], c[0], f.top, c[1], c[0], f.top, c[1], a[0], ya, a[1], c[0], yc, c[1]);
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, kind === 'tar' ? KERB_FACE : CURB);
  }
}

// Painted lines and crossings (the details batch: no shadows). Kept as data for the tests.
export const ROAD_MARKS = { dashes: [], zebras: [], stops: [] };
const MARK_Y = TAR_Y + 0.007;
function nearCrossing(x, z, r) {
  for (const c of ROAD_MARKS.zebras) if (Math.hypot(x - c.x, z - c.z) < r) return true;
  return false;
}
function zebra(f, x, z, ux, uz, hw, kind) {
  // stripes lie along the traffic (u), spaced across the road
  const n = Math.floor((hw - 0.6) / 1.1);
  for (let k = -n; k <= n; k++) f.add(GEO.box, WHITE, { x: x - uz * k * 1.1, y: MARK_Y, z: z + ux * k * 1.1, sx: 0.55, sy: 0.014, sz: 2.4, ry: Math.atan2(ux, uz) });
  ROAD_MARKS.zebras.push({ x, z, ux, uz, hw, kind });
}
function addMarkings(f) {
  ROAD_MARKS.dashes.length = ROAD_MARKS.zebras.length = ROAD_MARKS.stops.length = 0;
  const byId = Object.fromEntries(NET.map(n => [n.id, n]));
  // a zebra across the mouth of every side road, in line with the main road's sidewalk, and a stop line behind it
  for (const n of NET) for (const e of n.ends) {
    if (e.kind !== 'join') continue;
    const into = byId[e.into], back = into.hw + SIDEWALK_W * 0.5;
    zebra(f, e.x - e.ux * back, e.z - e.uz * back, e.ux, e.uz, n.hw, 'junction');
    const sb = into.hw + SIDEWALK_W + 0.9, rx = -e.uz, rz = e.ux; // the lane coming in: right of travel (+u)
    const sx = e.x - e.ux * sb + rx * n.hw / 2, sz = e.z - e.uz * sb + rz * n.hw / 2;
    f.add(GEO.box, WHITE, { x: sx, y: MARK_Y, z: sz, sx: n.hw - 0.5, sy: 0.014, sz: 0.4, ry: Math.atan2(e.ux, e.uz) });
    ROAD_MARKS.stops.push({ x: sx, z: sz });
  }
  for (const c of CROSSINGS) {
    const n = byId[c.road];
    // on the centre line at the point nearest the spot, along the road there
    let best = Infinity, px = c.x, pz = c.z, ux = 1, uz = 0;
    for (let i = 0; i < n.path.length - 1; i++) {
      const [ax, az] = n.path[i], [bx, bz] = n.path[i + 1], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / (dx * dx + dz * dz))), qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(qx - c.x, qz - c.z);
      if (d < best) { best = d; px = qx; pz = qz; ux = dx; uz = dz; }
    }
    const L = Math.hypot(ux, uz); zebra(f, px, pz, ux / L, uz / L, n.hw, 'path');
  }
  // centre dashes: 3 m on, 3 m off; never through a junction, a zebra or past a square end
  for (const n of NET) {
    let d = 3;
    for (let i = 0; i < n.path.length - 1; i++) {
      const [x0, z0] = n.path[i], [x1, z1] = n.path[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      for (; d < L; d += 6) {
        const x = x0 + (x1 - x0) * (d / L), z = z0 + (z1 - z0) * (d / L), tx = (x1 - x0) / L * 2, tz = (z1 - z0) / L * 2;
        if (othersField(n, x, z) < 2.5 || nearCrossing(x, z, 3.2) || pastEnd(x + tx, z + tz) || pastEnd(x - tx, z - tz)) continue;
        f.add(GEO.box, LINE, { x, y: MARK_Y, z, sx: 0.16, sy: 0.014, sz: 3, ry: Math.atan2(x1 - x0, z1 - z0) });
        ROAD_MARKS.dashes.push({ x, z });
      }
      d -= L;
    }
  }
}

function buildRoads(b, f, colliders) {
  addPaving(b);
  addMarkings(f);
  // guard rail where Summit Rd ends at Lake Tamakiya
  const s = ROADS.find(r => r.id === 'summit-rd');
  if (s) {
    const [ex, ez] = s.pts[0];
    for (let z = ez - 7; z <= ez + 7; z += 1.6) b.add(GEO.cyl8, '#fbfaf5', { x: ex - 0.4, y: 0.85, z, sx: 0.12, sy: 0.9, sz: 0.12 });
    for (const yy of [0.95, 1.2]) b.boxMinMax(ex - 0.5, yy, ez - 7.2, ex - 0.3, yy + 0.14, ez + 7.2, yy > 1 ? '#e0463c' : '#fbfaf5');
    colliders.push({ type: 'box', minX: ex - 0.6, maxX: ex - 0.2, minZ: ez - 7.3, maxZ: ez + 7.3 });
    // (its west end runs on into the bus tunnel at the map's edge: bus-stop-build.js buildTunnel)
  }
}

// Street lamps every 34 m on alternating sides, on the sidewalk by the kerb (world.js lights the straight street), but
// never in a junction, by a zebra, or in the mouth of a driveway, a front walk or the shops' lot (cars and people
// come through there). Called once the houses are placed.
function addLamps(b, colliders, out) {
  const L = CAR_LOT;
  const inMouth = (x, z) => out.driveways.some(d => Math.abs(x - d.x) < 2.6 && Math.abs(z - d.curbZ) < SIDEWALK_W + 1.5)
    || out.houses.some(h => Math.abs(x - h.x) < 1.6 && Math.abs(z - h.door.z) < 30 && paveField(x, z) < SIDEWALK_W && Math.sign(z - h.z) === h.facing)
    || (x > L.minX - 1.5 && x < L.maxX + 1.5 && z > L.minZ - SIDEWALK_W - 1 && z < L.maxZ);
  for (const n of NET) {
    const r = n.road, path = n.path, hw = n.hw;
    let run = 17, side = 1;
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0] = path[i], [x1, z1] = path[i + 1], len = Math.hypot(x1 - x0, z1 - z0);
      for (; run < len; run += 34) {
        let x = x0 + (x1 - x0) * (run / len), z = z0 + (z1 - z0) * (run / len);
        const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
        x += nx * side * (hw + 0.55); z += nz * side * (hw + 0.55); side = -side;
        if ((r.lampsTo != null && x > r.lampsTo - 6) || othersField(n, x, z) < 3 || nearCrossing(x, z, 4) || paveField(x, z) > 1 || paveField(x, z) < 0.1) continue; // (< 0.1: on the tar, the bus bay's)
        if (inMouth(x, z)) { // step along the kerb to the first clear spot (up to 6 m either way)
          let moved = false;
          for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
            const tx = x + (x1 - x0) / len * d, tz = z + (z1 - z0) / len * d;
            if (!inMouth(tx, tz) && othersField(n, tx, tz) >= 3 && !nearCrossing(tx, tz, 4)) { x = tx; z = tz; moved = true; break; }
          }
          if (!moved) continue;
        }
        lamp(b, x, z, -side * nx, -side * nz, colliders);
      }
      run -= len;
    }
  }
}

// a street lamp at (x, z) whose arm reaches toward (dx, dz) (over the road)
function lamp(b, x, z, dx, dz, colliders) {
  if (propsReady('street_lamp')) { // (props-static: the Blender lamp on the sidewalk, the spot at its bulb, 0.98 m out over the road)
    const at = addProp(b, 'street_lamp', { x, y: 0.44, z, yaw: Math.atan2(dx, dz) }), [lx, ly, lz] = at.anchor('light_anchor');
    addNightSpot({ x: lx, y: ly, z: lz, color: '#ffd98e', pool: 3.4, gy: 0.44, halo: 1.3 });
    colliders.push({ type: 'circle', x, z, r: 0.15 });
    return;
  }
  b.add(GEO.cyl6, '#3a3f47', { x, y: 2.6, z, sx: 0.09, sy: 4.4, sz: 0.09 });
  b.add(GEO.box, '#3a3f47', { x: x + dx * 0.5, y: 4.8, z: z + dz * 0.5, sx: 0.12, sy: 0.12, sz: 1.1, ry: Math.atan2(dx, dz) });
  const bx = x + dx * 0.95, bz = z + dz * 0.95;
  b.add(GEO.box, lampGlow('#fff3c4'), { x: bx, y: 4.65, z: bz, sx: 0.4, sy: 0.18, sz: 0.3, ry: Math.atan2(dx, dz) });
  addNightSpot({ x: bx, y: 4.5, z: bz, color: '#ffd98e', pool: 3.4, gy: 0.44, halo: 1.3 });
  colliders.push({ type: 'circle', x, z, r: 0.15 });
}

// ------------------------------------------------------------------ houses

const WALLS = ['#9cc8e8', '#a9dcc1', '#f2de8c', '#f0a58a', '#c8b3e6', '#f3efe6', '#e8b4c8', '#b8d8a8', '#f6c9a0'];
const ROOFS = ['#5b6b86', '#8a4b3c', '#4f5d52', '#6d4f7a', '#7a5a3a', '#3f4a5c'];

// A row of houses facing a sidewalk edge at z = walkZ. facing: +1 = door to the south, -1 = door to the north.
function houseRow(b, f, colliders, rnd, xs, z, walkZ, facing, out) {
  for (const hx of xs) {
    const w = 10 + rnd() * 3, d = 8 + rnd() * 2, h = rnd() < 0.5 ? 4.2 : 6.2;
    const hz = z + (rnd() - 0.5) * 2;
    addGableHouse(b, f, hx, hz, w, d, h, WALLS[Math.floor(rnd() * WALLS.length)], ROOFS[Math.floor(rnd() * ROOFS.length)], rnd, facing);
    const front = hz + facing * (d / 2);
    colliders.push({ type: 'box', minX: hx - w / 2 - 0.1, maxX: hx + w / 2 + 0.1, minZ: Math.min(hz - d / 2, front + facing * 0.95) - 0.1, maxZ: Math.max(hz + d / 2, front + facing * 0.95) + 0.1 });
    // front walk from the step to the sidewalk
    const w0 = Math.min(front + facing * 0.9, walkZ), w1 = Math.max(front + facing * 0.9, walkZ);
    b.boxMinMax(hx - 0.8, 0.3, w0, hx + 0.8, 0.4, w1, '#cbbfa9');
    // mailbox at the sidewalk
    const mz = walkZ - facing * 0.8;
    b.add(GEO.box, ['#3c4f7a', '#2f6b4f', '#8a3b34', '#2b2b2f'][Math.floor(rnd() * 4)], { x: hx + 3, y: 1.3, z: mz, sx: 0.4, sy: 0.35, sz: 0.6 });
    b.add(GEO.box, '#6f5a44', { x: hx + 3, y: 0.8, z: mz, sx: 0.1, sy: 1, sz: 0.1 });
    b.add(GEO.box, '#e0463c', { x: hx + 3.22, y: 1.42, z: mz, sx: 0.04, sy: 0.3, sz: 0.06 });
    colliders.push({ type: 'circle', x: hx + 3, z: mz, r: 0.3 });
    out.mailboxes.push({ x: hx + 3, z: mz, house: { x: hx, z: hz, door: front + facing * 1.35, facing } });
    out.houses.push({ x: hx, z: hz, w, d, h, facing, door: { x: hx, z: front + facing * 1.35 } });
    // hedge along the front
    for (let i = 0; i < 4; i++) b.add(GEO.ico1, i % 2 ? '#3f8a3f' : '#4a9a45', { x: hx - w / 2 + 0.5 + i * 0.85 + rnd() * 0.2, y: 0.85 + (i % 2) * 0.08, z: walkZ - facing * 1.8, sx: 0.62, sy: 0.6, sz: 0.55, ry: rnd() * 3 });
    // a tree in the back yard, sometimes a shed or a swing set
    const back = hz - facing * (d / 2 + 4 + rnd() * 3);
    if (rnd() < 0.8) { const tx = hx - w / 4 + rnd() * w / 2; colliders.push({ type: 'circle', x: tx, z: back, r: addTree(b, tx, back, rnd() < 0.4 ? 'maple' : rnd() < 0.5 ? 'oak' : 'birch', rnd, 0.6 + rnd() * 1.0) + 0.2 }); }
    if (rnd() < 0.35) {
      const sx = hx + w / 2 - 1.5, sz = back - facing * 2;
      b.boxMinMax(sx - 1.2, 0.3, sz - 1, sx + 1.2, 2.4, sz + 1, ['#b5654a', '#8fa8c4', '#d9c38a'][Math.floor(rnd() * 3)]);
      b.add(GEO.box, '#5a4a3c', { x: sx, y: 2.6, z: sz, sx: 2.8, sy: 0.2, sz: 2.4 });
      colliders.push({ type: 'box', minX: sx - 1.3, maxX: sx + 1.3, minZ: sz - 1.1, maxZ: sz + 1.1 });
    }
    // driveway and (often) a car; the empty driveways are homes for the cars that drive around (cars.js)
    if (rnd() < 0.6) {
      const dx0 = hx + w / 2 + 0.5, dx1 = hx + w / 2 + 4;
      b.boxMinMax(dx0, 0.3, Math.min(hz - d / 2, walkZ), dx1, 0.38, Math.max(hz + d / 2, walkZ), '#a9a39a');
      const cz = front + facing * 3, parked = rnd() < 0.5;
      if (parked) {
        addCar(b, hx + w / 2 + 2.25, cz, Math.PI / 2, rnd);
        colliders.push({ type: 'box', minX: hx + w / 2 + 1.25, maxX: hx + w / 2 + 3.25, minZ: cz - 2.15, maxZ: cz + 2.15 });
      }
      out.driveways.push({ x: hx + w / 2 + 2.25, bayZ: cz, curbZ: walkZ, facing, parked });
    }
  }
}

// (the shops: Rufallia Diner and Sweet Crumb Bakery stood west of the game store until strip-mall (2026-11-09); the strip mall,
// Summit Slice and Peak Threads, is built there by strip-mall.js to layout.js STRIP_MALL)

// ------------------------------------------------------------------ street signs

// The pole stops under the blades (so it doesn't hide the name on either side): the blades sit on a small cap, the second one
// standing on the first.
function streetSign(group, b, colliders, x, z, a, bName) {
  b.add(GEO.cyl6, '#6b7078', { x, y: 1.42, z, sx: 0.05, sy: 2.84, sz: 0.05 });
  b.add(GEO.box, '#6b7078', { x, y: 2.835, z, sx: 0.16, sy: 0.03, sz: 0.16 });
  colliders.push({ type: 'circle', x, z, r: 0.12 });
  // each blade is two faces back to back, both reading the right way round (one double-sided face shows the name mirrored
  // from behind)
  [[a, 0], [bName, Math.PI / 2]].forEach(([name, ry], i) => {
    const front = new THREE.PlaneGeometry(1.5, 0.3), rear = front.clone().rotateY(Math.PI);
    const m = new THREE.Mesh(mergeGeometries([front, rear], false), new THREE.MeshBasicMaterial({ map: signTexture([name], { bg: '#2f7a4a', fg: '#ffffff', w: 256, h: 52 }), fog: true }));
    front.dispose(); rear.dispose();
    m.name = 'street-sign'; m.position.set(x, 3.0 + i * 0.3, z); m.rotation.y = ry; group.add(m);
  });
}

// ------------------------------------------------------------------ the carnival

function buildCarnival(root, updaters) {
  const { x, z } = CARNIVAL;
  const y = terrainHeight(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z); g.name = 'carnival';
  const b = new Batcher({ vertexColors: true, castShadow: false });
  // tents: striped cones
  const tents = [[-26, 10, 7, '#e0463c'], [22, 14, 6, '#3f8fd9'], [-8, 24, 5, '#f0b33f'], [30, -8, 5.5, '#8e5bd0']];
  for (const [tx, tz, r, c] of tents) {
    for (let i = 0; i < 12; i++) b.add(new THREE.ConeGeometry(r, r * 1.1, 12, 1, true, (i / 12) * Math.PI * 2, Math.PI / 6), i % 2 ? '#fbfaf5' : c, { x: tx, y: r * 0.55 + r * 0.9, z: tz });
    b.add(GEO.cyl12, i2(c), { x: tx, y: r * 0.45, z: tz, sx: r, sy: r * 0.9, sz: r });
    b.add(GEO.cone6, '#f0b33f', { x: tx, y: r * 2.2, z: tz, sx: 0.3, sy: 0.9, sz: 0.3 });
  }
  // roller coaster: a humped track on posts
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, ax = -40 + t * 70; pts.push([ax, 6 + Math.abs(Math.sin(t * Math.PI * 3)) * 14, -20 + Math.sin(t * 5) * 6]); }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz), new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const mat = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(0.9, 0.35, len));
    b.add(GEO.box, '#d9534f', { matrix: mat });
    if (i % 3 === 0) b.add(GEO.cyl6, '#e8e2d6', { x: ax, y: ay / 2, z: az, sx: 0.25, sy: ay, sz: 0.25 });
  }
  b.build(g, 'carnival');
  // the Ferris wheel (turns)
  const R = 16, hub = new THREE.Vector3(8, R + 3, 0);
  const frame = new Batcher({ castShadow: false, vertexColors: true });
  for (const s of [-1, 1]) {
    frame.add(GEO.cyl6, '#e8e2d6', { x: hub.x - 7, y: hub.y / 2, z: s * 2.2, sx: 0.35, sy: hub.y * 1.08, sz: 0.35, rz: -0.38 });
    frame.add(GEO.cyl6, '#e8e2d6', { x: hub.x + 7, y: hub.y / 2, z: s * 2.2, sx: 0.35, sy: hub.y * 1.08, sz: 0.35, rz: 0.38 });
  }
  frame.build(g, 'ferris-frame');
  const wheel = new THREE.Group(); wheel.position.copy(hub); g.add(wheel);
  const wb = new Batcher({ castShadow: false });
  for (const s of [-1, 1]) wb.add(new THREE.TorusGeometry(R, 0.25, 6, 48), '#f4f2ea', { z: s * 1.6 });
  const gondolas = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    wb.add(GEO.box, '#f4f2ea', { x: Math.cos(a) * R / 2, y: Math.sin(a) * R / 2, sx: R, sy: 0.18, sz: 0.18, rz: a });
    wb.add(GEO.sphere, lampGlow(['#ffd24a', '#ff6fa8', '#6fd3ff', '#9dff7a'][i % 4]), { x: Math.cos(a) * R, y: Math.sin(a) * R, z: 1.9, sx: 0.45, sy: 0.45, sz: 0.45 });
  }
  wb.build(wheel, 'ferris-wheel');
  const gm = new THREE.MeshLambertMaterial({ color: '#e0463c' });
  for (let i = 0; i < 8; i++) {
    const gd = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.8), gm);
    g.add(gd); gondolas.push({ m: gd, a: (i / 8) * Math.PI * 2 });
  }
  // string lights over the midway
  const lb = new Batcher({ castShadow: false });
  for (let i = 0; i < 30; i++) { const t = i / 29; lb.add(GEO.sphere, lampGlow(i % 3 ? '#ffe7a0' : '#ff9ad8'), { x: -30 + t * 60, y: 7 - Math.sin(t * Math.PI) * 1.5, z: 4, sx: 0.35, sy: 0.35, sz: 0.35 }); }
  lb.build(g, 'carnival-lights');
  root.add(g);
  updaters.push((dt, t) => {
    const a0 = t * 0.12;
    wheel.rotation.z = a0;
    for (const o of gondolas) { const a = o.a + a0; o.m.position.set(hub.x + Math.cos(a) * R, hub.y + Math.sin(a) * R - 1.2, 0); }
  });
}
const i2 = c => new THREE.Color(c).multiplyScalar(0.8).getStyle();

// ------------------------------------------------------------------ build

// Every mailbox in the neighborhoods, filled by buildTown (mailman.js reads it for Pat's rounds and pizza deliveries):
// { x, z, house: { x, z, door (z of the doorstep), facing (+1 door faces south, -1 north) } }
export const TOWN_MAILBOXES = [];
export const TOWN_HOUSES = [];
// Every driveway on Summit Rd: { x (its centre line), bayZ (where a car parks), curbZ (the sidewalk edge), facing (-1: the
// house is south of Summit Rd, +1: north), parked (a car already sits in it) }. cars.js homes its cars in the empty ones.
export const TOWN_DRIVEWAYS = [];

// The shops' gravel lot (layout.js CAR_LOT): a flat pad with painted bay lines; the cars themselves are cars.js's.
function buildLot(b, f) {
  const L = CAR_LOT;
  // the pad starts where Summit Rd's sidewalk ends
  let z0 = L.minZ;
  while (paveField((L.minX + L.maxX) / 2, z0) <= SIDEWALK_W && z0 < L.maxZ) z0 += 0.05;
  b.boxMinMax(L.minX, 0.3, z0, L.maxX, 0.4, L.maxZ, '#b8b0a2');
  for (let i = 0; i <= L.bays.length; i++) { // a line between the bays and at both ends
    const x = i < L.bays.length ? L.bays[i][0] - 1.3 : L.bays[i - 1][0] + 1.3;
    f.add(GEO.box, WHITE, { x, y: 0.4, z: L.bays[0][1], sx: 0.1, sy: 0.01, sz: 4.6 });
  }
  // (no wall at the back: the gravel runs on to the bus stop, bus-stop-build.js)
}

// Strickler Park parking (layout.js PARK_LOT): a tar pad with the driveway joining it to the apron road-net.js
// cuts across Breneland Rd's sidewalk, painted bay lines, a hatched keep-clear bay, a concrete kerb stop at the head of every
// bay, a low timber edge round the pad (no colliders: you step over it) and a "Strickler Park parking" sign whose two
// posts stand behind its board. All of it in the town batches (no new draw call but the sign's face); the parked cars are
// park-lot.js's.
const LOT_TAR = '#5f636a', TIMBER = '#8a6a48', STOP = '#c9c3b6';
export const LOT_MARKS = { lines: [], stops: [], hatch: [] }; // for the tests
function buildParkLot(b, f, group, colliders) {
  const L = PARK_LOT, d = L.drive, top = TAR_Y, my = TAR_Y + 0.007;
  LOT_MARKS.lines.length = LOT_MARKS.stops.length = LOT_MARKS.hatch.length = 0;
  b.boxMinMax(L.minX, 0.3, L.minZ, L.maxX, top, L.maxZ, LOT_TAR);
  b.boxMinMax(d.minX, 0.3, d.cutZ, d.maxX, top, L.minZ, LOT_TAR); // the driveway, from the sidewalk's back edge to the pad
  addSurface({ minX: L.minX, maxX: L.maxX, minZ: L.minZ, maxZ: L.maxZ, y: top });
  addSurface({ minX: d.minX, maxX: d.maxX, minZ: d.cutZ, maxZ: L.minZ, y: top });
  // bay lines: one across the aisle end of every bay boundary, down the bay's depth
  const seen = new Set();
  for (const [bx, bz] of L.bays) for (const s of [-1, 1]) {
    const lz = bz + s * L.bayW / 2, key = Math.round(bx) + ':' + Math.round(lz * 10);
    if (seen.has(key)) continue; seen.add(key);
    f.add(GEO.box, WHITE, { x: bx, y: my, z: lz, sx: L.bayD, sy: 0.014, sz: 0.11 });
    LOT_MARKS.lines.push({ x: bx, z: lz });
  }
  // the bay Buddy and Carol swing into before they reverse into theirs: yellow hatching, kept clear
  const [kx, kz] = L.bays[L.keepClear];
  for (let k = -3; k <= 3; k++) {
    const len = 2.1 - Math.abs(k) * 0.22;
    f.add(GEO.box, LINE, { x: kx + k * 0.62, y: my, z: kz, sx: 0.13, sy: 0.014, sz: len, ry: 0.62 });
    LOT_MARKS.hatch.push({ x: kx + k * 0.62, z: kz });
  }
  for (const s of [-1, 1]) f.add(GEO.box, LINE, { x: kx, y: my + 0.001, z: kz + s * (L.bayW / 2 - 0.2), sx: L.bayD - 0.4, sy: 0.014, sz: 0.1 });
  for (const s of [-1, 1]) f.add(GEO.box, LINE, { x: kx + s * (L.bayD / 2 - 0.2), y: my + 0.001, z: kz, sx: 0.1, sy: 0.014, sz: L.bayW - 0.4 });
  // kerb stops at the head of every bay (the timber edge side); the keep-clear bay has none
  L.bays.forEach(([bx, bz, yaw], i) => {
    if (i === L.keepClear) return;
    const fx = Math.sin(yaw), sx = bx + fx * (L.bayD / 2 - 0.55);
    b.add(GEO.box, STOP, { x: sx, y: top + 0.07, z: bz, sx: 0.24, sy: 0.15, sz: 1.5 });
    LOT_MARKS.stops.push({ x: sx, z: bz });
  });
  // the low timber edge: round the pad, open where the driveway comes in, and along both sides of the driveway
  const T = 0.16, y0 = top - 0.03, y1 = top + 0.15;
  b.boxMinMax(L.minX, y0, L.maxZ - T, L.maxX, y1, L.maxZ, TIMBER);                      // south
  b.boxMinMax(L.minX, y0, L.minZ, L.minX + T, y1, L.maxZ - T, TIMBER);                  // west
  b.boxMinMax(L.maxX - T, y0, L.minZ, L.maxX, y1, L.maxZ - T, TIMBER);                  // east
  b.boxMinMax(L.minX + T, y0, L.minZ, d.minX, y1, L.minZ + T, TIMBER);                  // north, west of the driveway
  b.boxMinMax(d.maxX, y0, L.minZ, L.maxX - T, y1, L.minZ + T, TIMBER);                  // north, east of it
  b.boxMinMax(d.minX - T, y0, d.cutZ + 0.05, d.minX, y1, L.minZ + T, TIMBER);           // the driveway's sides
  b.boxMinMax(d.maxX, y0, d.cutZ + 0.05, d.maxX + T, y1, L.minZ + T, TIMBER);
  // the sign: a single-faced board facing the road, hung between two posts that stand behind it
  const S = L.sign, fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw), gy = terrainHeight(S.x, S.z);
  const BW = 1.9, BH = 0.82, BY = gy + 1.55;
  for (const s of [-1, 1]) {
    const px = S.x + rx * s * (BW / 2 - 0.08) - fx * 0.09, pz = S.z + rz * s * (BW / 2 - 0.08) - fz * 0.09;
    b.add(GEO.box, '#6f5a44', { x: px, y: gy + 1.0, z: pz, sx: 0.1, sy: 2.0, sz: 0.1, ry: S.yaw });
    colliders.push({ type: 'circle', x: px, z: pz, r: 0.12 });
  }
  b.add(GEO.box, '#e9e2d0', { x: S.x - fx * 0.025, y: BY, z: S.z - fz * 0.025, sx: BW + 0.08, sy: BH + 0.08, sz: 0.04, ry: S.yaw }); // the board's back and rim
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: signTexture(['Strickler Park', 'parking'], { bg: '#2f6b4f', fg: '#ffffff', w: 512, h: 224 }), fog: true }));
  face.position.set(S.x + fx * 0.002, BY, S.z + fz * 0.002); face.rotation.y = S.yaw; face.name = 'park-lot-sign';
  face.matrixAutoUpdate = false; face.updateMatrix();
  group.add(face);
}

export function buildTown(root, colliders, updaters) {
  const rnd = mulberry32(88);
  const group = new THREE.Group(); group.name = 'town'; root.add(group);
  const b = new Batcher({ vertexColors: true }), f = new Batcher({ castShadow: false, vertexColors: true });
  const out = { houses: [], mailboxes: [], driveways: [] };
  buildRoads(b, f, colliders);
  // Maple Row's back row faces Summit Rd (doors north); Summit Hill faces it from the other side (doors south)
  const summitZ = -126.5, hw = 4.5;
  houseRow(b, f, colliders, rnd, [-88, -66, -44, 4, 26, 46], -107, summitZ + hw + SIDEWALK_W, -1, out);
  // (crib-move: the first Summit Hill house moved 8 m east, from x -82, to make room for Kevin's Tool Crib and its motorcycle pad
  // beside the post office; the row closes up toward the last house, which stays by the shore. The random draws are per house in
  // order, so every house keeps its size and colours.)
  houseRow(b, f, colliders, rnd, [-74, -54, -33, -13, 8, 29, 50], -147, summitZ - hw - SIDEWALK_W, 1, out);
  // (the shops west of the game store are the strip mall's, strip-mall.js, since strip-mall; the third shop's spot, x -137, was
  // Kevin's Tool Crib's until crib-move: tool-crib.js builds it beside the post office now (layout.js TOOL_CRIB) and Summit Square
  // stands here (summit-square.js))
  // street signs at the junctions
  streetSign(group, b, colliders, -25.2, -55.2, 'Maple Ave', 'Breneland Rd');
  streetSign(group, b, colliders, -25.2, -119.8, 'Maple Ave', 'Summit Rd');
  streetSign(group, b, colliders, -114.4, -119.8, 'Breneland Rd', 'Summit Rd');
  // (the cars in the lanes drive around: cars.js. The parked ones are in driveways and the lot)
  buildLot(b, f);
  buildParkLot(b, f, group, colliders);
  addLamps(b, colliders, out);
  // (the lot's gravel runs on to the bus stop's plaza)
  buildBusStop(b, f, group, colliders, lamp);
  buildTunnel(b, f, group, colliders, lamp);
  finishBusSigns(group);
  buildMailOffice(b, f, group, colliders); // (the post office across from the game store, the mail van's home)
  b.build(group, 'town');
  f.build(group, 'town-details').forEach(m => soft(m));
  buildCarnival(root, updaters);
  TOWN_MAILBOXES.length = 0; TOWN_MAILBOXES.push(...out.mailboxes);
  TOWN_HOUSES.length = 0; TOWN_HOUSES.push(...out.houses);
  TOWN_DRIVEWAYS.length = 0; TOWN_DRIVEWAYS.push(...out.driveways);
  // the names on the mailboxes (mailbox-names.js): both sides of every box, under the flag, the street row's across Breneland Rd, the Tool Crib's
  const nm = houseNames(out.houses, STREET_HOUSES), plates = [];
  out.houses.forEach((h, i) => { const m = out.mailboxes[i]; m.name = nm.town[i]; for (const s of [-1, 1]) plates.push({ x: m.x + s * 0.2, y: 1.2, z: m.z, nx: s, nz: 0, name: m.name }); });
  STREET_HOUSES.forEach((h, i) => { h.mailboxName = nm.street[i]; for (const s of [-1, 1]) plates.push({ x: h.x + 3 + s * 0.2, y: 1.2, z: STREET.sidewalkN - 0.8, nx: s, nz: 0, name: nm.street[i] }); });
  { const M = CRIB.mailbox, [mx, mz] = toWorld(M.x, M.z - 0.006); plates.push({ x: mx, y: M.y - 0.05, z: mz, nx: 0, nz: CRIB.front, name: 'Kevin', w: 0.24 }); } // (the plan's frame turned to the world: crib-move)
  out.mailNames = buildNamePlates(group, plates);
  void GAME_STORE; void glow;
  return out;
}
