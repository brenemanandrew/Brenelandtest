// The World Editor: a top-down map of layout.js with tools to move things, drop doodads and houses, draw roads, trails,
// fences, ponds and zones, and raise or lower the ground. It all goes in the world-edits file (world-edits.js has the shape).
// Save posts it to /api/world-edits and the game reads it at boot. Nothing here touches the game's code.
import * as L from '../layout.js';
import { MOVABLE, FIXED, PROPS } from '../world-edits.js';
import { smoothPath } from '../util.js';

const $ = s => document.querySelector(s);
const cv = $('#map'), g = cv.getContext('2d');
const status = (t, err = false) => { const s = $('#status'); s.textContent = t; s.classList.toggle('err', err); };

// ---- the edits (the file) and undo
let E = { moves: {}, props: [], roads: [], trails: [], terrain: [], water: [], zones: [] };
const undo = [];
function snap() { undo.push(JSON.stringify(E)); if (undo.length > 60) undo.shift(); }
function normalise(j) { const d = { moves: {}, props: [], roads: [], trails: [], terrain: [], water: [], zones: [] }; for (const k of Object.keys(d)) if (j && j[k] && typeof j[k] === 'object') d[k] = j[k]; return d; }
const uid = p => p + Math.random().toString(36).slice(2, 7);

// ---- the view: world metres -> screen px, north (-z) up
const view = { cx: -10, cz: -22, k: 5 }; // k = px per metre; opens on the yard
let W = 0, H = 0, DPR = 1;
const sx = x => (x - view.cx) * view.k + W / 2, sz = z => (z - view.cz) * view.k + H / 2;
const wx = px => (px - W / 2) / view.k + view.cx, wz = py => (py - H / 2) / view.k + view.cz;
function resize() { const r = cv.parentElement.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; draw(); }
addEventListener('resize', resize);

// ---- what the code builds (context, drawn but not editable here): the town's house rows live in world.js / world-town.js
const TOWN_ROWS = [
  { xs: [-72, -46, 6, 32], z: -71, w: 11, d: 9 },
  { xs: [-88, -66, -44, 4, 26, 46], z: -107, w: 11, d: 9 },
  { xs: [-82, -60, -38, -16, 6, 28, 50], z: -147, w: 11, d: 9 },
];
const SHOP_XS = [-184, -171, -137];
let slotsById = {}, slots = [];

// ---- the movable layout items: a flat list of handles { key, label, get x/z, set, fields }
function movables() {
  const out = [];
  for (const [name, fields] of Object.entries(MOVABLE)) {
    const v = L[name];
    if (Array.isArray(v) && name !== 'SPAWN') {
      v.forEach((it, i) => {
        const pair = Array.isArray(it);
        out.push({ key: `${name}[${i}]`, label: `${pretty(name)} ${i + 1}${it.kind ? ' (' + it.kind + ')' : it.name ? ' (' + it.name + ')' : ''}`, fields,
          get x() { return pair ? it[0] : it.x; }, get z() { return pair ? it[1] : it.z; }, obj: it, pair });
      });
    } else out.push({ key: name, label: pretty(name), fields, get x() { return v.x; }, get z() { return v.z; }, obj: v, pair: false });
  }
  return out;
}
const pretty = n => n.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
let MOV = [];
function applyMoves() { // the moves in E onto the live layout objects (so the map shows them moved)
  for (const m of MOV) { const patch = E.moves[m.key]; if (!patch) continue; for (const f of m.fields) if (f in patch) { if (m.pair) { if (f === 'x') m.obj[0] = patch.x; else if (f === 'z') m.obj[1] = patch.z; } else m.obj[f] = patch[f]; } }
}
function setMove(m, f, v) { E.moves[m.key] = E.moves[m.key] || {}; E.moves[m.key][f] = v; if (m.pair) { if (f === 'x') m.obj[0] = v; else if (f === 'z') m.obj[1] = v; } else m.obj[f] = v; }

// ---- drawing
const C = { lawn: '#a8e06b', park: '#9ad46a', woods: '#6fae5a', water: '#5fb3e6', sand: '#ecd9a0', tar: '#5d6168', walk: '#d4cfc5', trail: '#c9a06a', house: '#f0a58a', roof: '#8a4b3c', fence: '#ffffff', ink: '#2b2340', edit: '#e0463c', zone: 'rgba(245,138,176,0.35)', fishing: 'rgba(95,179,230,0.35)', event: 'rgba(255,210,74,0.4)' };
function poly(pts, close = true) { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z)))); if (close) g.closePath(); }
function circle(x, z, r) { g.beginPath(); g.arc(sx(x), sz(z), Math.max(2, r * view.k), 0, Math.PI * 2); }
function label(t, x, z, dy = 0, col = C.ink, size = 11) { g.font = `700 ${size}px Fredoka, Nunito, sans-serif`; g.textAlign = 'center'; g.fillStyle = col; g.fillText(t, sx(x), sz(z) + dy); }
let lastProps = '';
function draw() {
  if (threeD) { const j = JSON.stringify(E.props); if (j !== lastProps) { lastProps = j; push3d(); } marks3d(); }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = C.woods; g.fillRect(0, 0, W, H);
  // the map: the walkable rectangle is lawn-ish, the park greener, the woods darker, the water blue
  g.fillStyle = C.park; poly(L.WALK); g.fill();
  g.fillStyle = C.lawn; poly(L.YARD); g.fill();
  for (const l of L.LAKES) { g.fillStyle = C.sand; poly(l.poly); g.lineWidth = 7 * view.k; g.strokeStyle = C.sand; g.stroke(); g.fillStyle = C.water; g.fill(); }
  // grid every 10 m
  g.strokeStyle = 'rgba(43,35,64,0.08)'; g.lineWidth = 1; const step = view.k < 1.5 ? 50 : 10;
  for (let x = Math.floor(wx(0) / step) * step; x < wx(W); x += step) { g.beginPath(); g.moveTo(sx(x), 0); g.lineTo(sx(x), H); g.stroke(); }
  for (let z = Math.floor(wz(0) / step) * step; z < wz(H); z += step) { g.beginPath(); g.moveTo(0, sz(z)); g.lineTo(W, sz(z)); g.stroke(); }
  // roads (sidewalks, tar), then trails
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of L.ROADS) { poly(r.pts, false); g.strokeStyle = C.walk; g.lineWidth = (r.width + L.SIDEWALK_W * 2) * view.k; g.stroke(); }
  for (const r of L.ROADS) { poly(r.pts, false); g.strokeStyle = r.edit ? '#6b5f8a' : C.tar; g.lineWidth = r.width * view.k; g.stroke(); }
  for (const t of L.TRAILS) { const pts = smoothPath(L.resolveTrail(t, slotsById), 4); poly(pts, false); g.strokeStyle = t.edit ? '#b57a3a' : C.trail; g.lineWidth = Math.max(1.5, t.width * view.k); g.stroke(); }
  // the yard fences, the house and porch, the game lawns
  g.strokeStyle = C.fence; g.lineWidth = Math.max(1.5, 0.4 * view.k); for (const f of L.FENCES) { g.beginPath(); g.moveTo(sx(f.a[0]), sz(f.a[1])); g.lineTo(sx(f.b[0]), sz(f.b[1])); g.stroke(); }
  rect(L.HOUSE.minX, L.HOUSE.minZ, L.HOUSE.maxX, L.HOUSE.maxZ, C.roof); rect(L.PORCH.minX, L.PORCH.minZ, L.PORCH.maxX, L.PORCH.maxZ, '#c08a58'); rect(L.STEPS.minX, L.STEPS.minZ, L.STEPS.maxX, L.STEPS.maxZ, '#c08a58');
  rect(L.DOCK.minX, L.DOCK.minZ, L.DOCK.maxX, L.DOCK.maxZ, '#b9814f');
  for (const s of slots) { g.fillStyle = 'rgba(255,255,255,0.35)'; circle(s.x, s.z, 6.8); g.fill(); if (view.k > 1.2) label(s.name || s.id, s.x, s.z, 4, C.ink, 10); }
  for (const row of TOWN_ROWS) for (const x of row.xs) rect(x - row.w / 2, row.z - row.d / 2, x + row.w / 2, row.z + row.d / 2, C.house);
  for (const x of SHOP_XS) rect(x - 5.5, L.SHOPS.minZ + 5, x + 5.5, L.SHOPS.maxZ, '#c96a5a');
  rect(L.GAME_STORE.x - L.GAME_STORE.w / 2, L.GAME_STORE.z - L.GAME_STORE.d / 2, L.GAME_STORE.x + L.GAME_STORE.w / 2, L.GAME_STORE.z + L.GAME_STORE.d / 2, '#8fa8c4');
  rect(L.PARK_LOT.minX, L.PARK_LOT.minZ, L.PARK_LOT.maxX, L.PARK_LOT.maxZ, '#5f636a'); rect(L.CAR_LOT.minX, L.CAR_LOT.minZ, L.CAR_LOT.maxX, L.CAR_LOT.maxZ, '#8a8378');
  // the fixed landmarks (server-read: not movable here)
  for (const n of FIXED) { const v = L[n]; if (!v) continue; const x = v.x ?? (v.minX + v.maxX) / 2, z = v.z ?? (v.minZ + v.maxZ) / 2; g.fillStyle = 'rgba(43,35,64,0.5)'; circle(x, z, 1.2); g.fill(); if (view.k > 2.5) label(pretty(n), x, z, -8, C.ink, 10); }
  // the editor's terrain brushes and ponds and zones
  for (const b of E.terrain) { g.fillStyle = b.dh > 0 ? 'rgba(255,210,74,0.3)' : 'rgba(95,179,230,0.25)'; circle(b.x, b.z, b.r); g.fill(); g.strokeStyle = b.dh > 0 ? '#c99a1a' : '#3b7fb0'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]); label((b.dh > 0 ? '+' : '') + b.dh.toFixed(1) + ' m', b.x, b.z, 4, C.ink, 11); }
  for (const w of E.water) { g.fillStyle = C.water; poly(w.poly); g.fill(); g.strokeStyle = '#3b7fb0'; g.lineWidth = 2; g.stroke(); }
  for (const z of E.zones) { g.fillStyle = z.type === 'fishing' ? C.fishing : z.type === 'event' ? C.event : C.zone; if (z.pts) poly(z.pts); else circle(z.x, z.z, z.r); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]); const c = centre(z); label(z.name, c[0], c[1], 4, C.ink, 11); }
  // the movable layout items
  for (const m of MOV) { const moved = !!E.moves[m.key]; g.fillStyle = moved ? C.edit : '#ffffff'; circle(m.x, m.z, 0.7); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke(); if (view.k > 6 || (sel && sel.m === m)) label(m.label, m.x, m.z, -8, C.ink, 10); }
  // the props
  for (const p of E.props) drawProp(p);
  // the selection
  if (sel) { g.strokeStyle = C.edit; g.lineWidth = 2.5; g.setLineDash([6, 4]); const b = bounds(sel); if (b) { g.strokeRect(sx(b[0]) - 6, sz(b[1]) - 6, (b[2] - b[0]) * view.k + 12, (b[3] - b[1]) * view.k + 12); } g.setLineDash([]); }
  // a line being drawn
  if (drawing) { poly(drawing.pts, drawing.close); g.strokeStyle = C.edit; g.lineWidth = 2; g.stroke(); for (const [x, z] of drawing.pts) { g.fillStyle = '#fff'; circle(x, z, 0.5); g.fill(); g.stroke(); } }
  // the scale bar
  const bar = view.k < 1.5 ? 50 : 10; g.fillStyle = C.ink; g.fillRect(12, H - 18, bar * view.k, 3); g.font = '700 11px Fredoka, sans-serif'; g.textAlign = 'left'; g.fillText(bar + ' m', 12, H - 24);
}
function rect(x0, z0, x1, z1, col) { g.fillStyle = col; g.fillRect(sx(x0), sz(z0), (x1 - x0) * view.k, (z1 - z0) * view.k); }
function centre(z) { if (z.pts) { let x = 0, zz = 0; for (const p of z.pts) { x += p[0]; zz += p[1]; } return [x / z.pts.length, zz / z.pts.length]; } return [z.x, z.z]; }
function drawProp(p) {
  const k = PROPS[p.kind]; if (!k) return;
  const on = sel === p;
  g.lineWidth = 1.5; g.strokeStyle = C.ink;
  if (p.kind === 'fence') { poly(p.pts, false); g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, 0.4 * view.k); g.stroke(); g.strokeStyle = C.ink; g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); return; }
  if (p.kind === 'house') { g.save(); g.translate(sx(p.x), sz(p.z)); g.rotate(-p.yaw); g.fillStyle = p.wall; g.fillRect(-p.w / 2 * view.k, -p.d / 2 * view.k, p.w * view.k, p.d * view.k); g.fillStyle = p.roof; g.fillRect(-p.w / 2 * view.k, -0.12 * view.k, p.w * view.k, 0.24 * view.k); g.strokeRect(-p.w / 2 * view.k, -p.d / 2 * view.k, p.w * view.k, p.d * view.k); g.fillStyle = C.ink; g.fillRect(-0.6 * view.k, (p.d / 2 - 0.2) * view.k, 1.2 * view.k, 0.3 * view.k); g.restore(); return; }
  const col = { tree: p.tree === 'pine' ? '#2f6b3f' : p.tree === 'palm' ? '#7bbf4f' : '#4a9a45', rock: '#8d8a84', bush: '#3f8a3f', flowers: '#ff8fb1', bench: '#b9814f', lamp: '#3a3f47', sign: '#8a6240', log: '#7a5234', picnic: '#b9814f', pot: '#c9683f' }[p.kind] || '#fff';
  const r = Math.max(0.5, k.r * (p.s || 1));
  g.fillStyle = col;
  if (p.kind === 'bench' || p.kind === 'log' || p.kind === 'picnic' || p.kind === 'sign') { g.save(); g.translate(sx(p.x), sz(p.z)); g.rotate(-p.yaw); const len = (p.kind === 'log' ? 2.6 * (p.s || 1) : p.kind === 'sign' ? 1.4 : 1.8) * view.k, dep = (p.kind === 'picnic' ? 1.8 : 0.6) * view.k; g.fillRect(-len / 2, -dep / 2, len, dep); g.strokeRect(-len / 2, -dep / 2, len, dep); g.restore(); }
  else { circle(p.x, p.z, r); g.fill(); g.stroke(); }
  if (view.k > 4 || on) label(p.kind === 'sign' && p.text ? p.text : k.name, p.x, p.z, -(r * view.k + 4), C.ink, 10);
}
function bounds(it) {
  if (it.m) return [it.m.x - 1, it.m.z - 1, it.m.x + 1, it.m.z + 1];
  if (it.pts || it.poly) { const pts = it.pts || it.poly; let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of pts) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a; }
  if (it.kind === 'house') return [it.x - it.w / 2, it.z - it.d / 2, it.x + it.w / 2, it.z + it.d / 2];
  const r = it.r || (PROPS[it.kind] ? Math.max(0.6, PROPS[it.kind].r * (it.s || 1)) : 1);
  return [it.x - r, it.z - r, it.x + r, it.z + r];
}

// ---- hit testing: what is under a point (metres), nearest first
function hit(x, z, tol = 10 / view.k) { // tol: a thumb, in metres
  let best = null, bd = Infinity;
  const consider = (it, d) => { if (d < bd) { bd = d; best = it; } };
  for (const p of E.props) {
    if (p.kind === 'fence') { const d = distToLine(p.pts, x, z); if (d < tol) consider(p, d); continue; }
    if (p.kind === 'house') { if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) consider(p, 0.5); continue; }
    const d = Math.hypot(x - p.x, z - p.z) - Math.max(0.6, PROPS[p.kind].r * (p.s || 1)); if (d < tol) consider(p, Math.max(0, d));
  }
  for (const m of MOV) { const d = Math.hypot(x - m.x, z - m.z); if (d < tol + 0.7) consider({ m }, d); }
  for (const b of E.terrain) { const d = Math.abs(Math.hypot(x - b.x, z - b.z) - b.r); if (d < tol || Math.hypot(x - b.x, z - b.z) < 1.5) consider(b, d + 0.2); }
  for (const w of E.water) { const d = distToLine([...w.poly, w.poly[0]], x, z); if (d < tol) consider(w, d + 0.1); }
  for (const zn of E.zones) { if (zn.pts) { const d = distToLine([...zn.pts, zn.pts[0]], x, z); if (d < tol) consider(zn, d + 0.1); } else { const d = Math.abs(Math.hypot(x - zn.x, z - zn.z) - zn.r); if (d < tol) consider(zn, d + 0.1); } }
  for (const r of E.roads) { const d = distToLine(r.pts, x, z); if (d < tol + r.width / 2) consider(r, d + 0.3); }
  for (const t of E.trails) { const d = distToLine(t.pts, x, z); if (d < tol + t.width / 2) consider(t, d + 0.3); }
  return best;
}
function distToLine(pts, x, z) { let b = Infinity; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t)); b = Math.min(b, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return b; }
function nearestVertex(pts, x, z, tol = 12 / view.k) { let bi = -1, bd = tol; pts.forEach(([px, pz], i) => { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; bi = i; } }); return bi; }

// ---- tools
const TOOLS = [
  ['select', 'Select / move'], ['prop', 'Place'], ['road', 'Road'], ['trail', 'Trail'], ['fence', 'Fence'],
  ['water', 'Pond'], ['zone', 'Zone'], ['raise', 'Raise'], ['lower', 'Lower'], ['delete', 'Delete'],
];
let tool = 'select', propKind = 'tree', sel = null, drawing = null;
const toolsEl = $('#tools');
for (const [id, name] of TOOLS) { const b = document.createElement('button'); b.textContent = name; b.dataset.tool = id; b.onclick = () => setTool(id); toolsEl.append(b); }
const zoomIn = document.createElement('button'); zoomIn.textContent = '+'; zoomIn.onclick = () => zoomBy(1.4); const zoomOut = document.createElement('button'); zoomOut.textContent = '-'; zoomOut.onclick = () => zoomBy(1 / 1.4);
toolsEl.append(zoomOut, zoomIn);
const HINTS = {
  select: 'Tap a thing to select it, drag to move it. Red dots are layout pieces you moved; grey ones are fixed by the server.',
  prop: 'Pick a doodad below, then tap the map to drop it. Tap it again to turn, size or colour it.',
  road: 'Tap points along the road. End a road on another road to join it. Done: tap the last point again.',
  trail: 'Tap points along the dirt path. Done: tap the last point again.',
  fence: 'Tap the fence posts in order. Done: tap the last point again.',
  water: 'Tap round the pond\'s shore, three points or more. Done: tap the first point.',
  zone: 'Tap the same spot twice for a round zone, or tap round its edge and finish on the first point. Name and type in the inspector.',
  raise: 'Tap to raise the ground there (adjust the size and height in the inspector).',
  lower: 'Tap to dig a dip there.',
  delete: 'Tap a thing you added to remove it. Layout pieces go back where the code puts them.',
};
function setTool(t) { tool = t; drawing = null; for (const b of toolsEl.querySelectorAll('button[data-tool]')) b.classList.toggle('on', b.dataset.tool === t); $('#palette').classList.toggle('show', t === 'prop'); $('#hint').textContent = HINTS[t]; if (t !== 'select') select(null); draw(); }
const pal = $('#palette');
for (const [id, k] of Object.entries(PROPS)) { const b = document.createElement('button'); b.className = 'small'; b.textContent = k.name; b.dataset.kind = id; b.onclick = () => { propKind = id; for (const x of pal.children) x.classList.toggle('on', x.dataset.kind === id); if (id === 'fence') { setTool('fence'); } }; pal.append(b); }
pal.children[0].classList.add('on');
function zoomBy(f, px = W / 2, py = H / 2) { const x = wx(px), z = wz(py); view.k = Math.max(0.4, Math.min(24, view.k * f)); view.cx = x - (px - W / 2) / view.k; view.cz = z - (py - H / 2) / view.k; draw(); }

// ---- pointer handling: one finger drags (a thing or the map), two fingers pinch
const ptrs = new Map();
let gesture = null; // { kind: 'pan' | 'move' | 'vertex', x0, z0, start }
let pinch = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, cx: view.cx, cz: view.cz, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; gesture = null; return; }
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, x = wx(px), z = wz(py);
  gesture = press(x, z, 10 / view.k, false) || { kind: 'pan', cx: view.cx, cz: view.cz, x, z };
  Object.assign(gesture, { px, py, moved: false });
});
// A press at (x, z) metres, from the map or the 3D view: with Select, grab a vertex of the selected line, or the thing under
// it. Returns the drag gesture, or null (the map then pans; a release without a drag is a tap).
function press(x, z, tol, from3d) {
  if (tool !== 'select') return null;
  if (sel && (sel.pts || sel.poly)) { const pts = sel.pts || sel.poly, i = nearestVertex(pts, x, z, tol * 1.2); if (i >= 0) { snap(); return { kind: 'vertex', i, pts }; } }
  const h = hit(x, z, tol);
  if (h) { select(h, from3d); if (!h.m || !FIXED.includes(h.m.key.replace(/\[.*/, ''))) { snap(); return { kind: 'move', it: h, x0: x, z0: z, start: startOf(h) }; } return null; }
  select(null);
  return null;
}
function drag(gs, x, z) {
  if (gs.kind === 'vertex') { gs.pts[gs.i] = [round(x), round(z)]; draw(); inspect(); }
  else if (gs.kind === 'move') { moveTo(gs.it, gs.start, round(x - gs.x0), round(z - gs.z0)); draw(); inspect(); }
}
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; view.k = Math.max(0.4, Math.min(24, pinch.k * d / pinch.d)); view.cx = pinch.cx - (mx - pinch.mx) / view.k; view.cz = pinch.cz - (my - pinch.my) / view.k; draw(); return; }
  if (!gesture) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, x = wx(px), z = wz(py);
  if (Math.hypot(px - gesture.px, py - gesture.py) > 4) gesture.moved = true;
  if (gesture.kind === 'pan') { view.cx = gesture.cx - (px - gesture.px) / view.k; view.cz = gesture.cz - (py - gesture.py) / view.k; draw(); }
  else drag(gesture, x, z);
});
const endPtr = e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (!gesture) return;
  const gs = gesture; gesture = null;
  if (gs.kind === 'pan' && !gs.moved) tap(gs.x, gs.z);
};
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
const round = v => Math.round(v * 10) / 10;
function startOf(h) { if (h.m) return { x: h.m.x, z: h.m.z }; if (h.pts || h.poly) return (h.pts || h.poly).map(p => [...p]); return { x: h.x, z: h.z }; }
function moveTo(h, start, dx, dz) {
  if (h.m) { setMove(h.m, 'x', round(start.x + dx)); setMove(h.m, 'z', round(start.z + dz)); return; }
  if (h.pts || h.poly) { const pts = h.pts || h.poly; start.forEach((p, i) => { pts[i] = [round(p[0] + dx), round(p[1] + dz)]; }); return; }
  h.x = round(start.x + dx); h.z = round(start.z + dz);
}
// a tap (no drag): the tool acts
let tapTol = null; // a 3D tap's own tolerance (metres), else the map's
function tap(x, z) {
  x = round(x); z = round(z);
  if (tool === 'select') return;
  if (tool === 'delete') { const h = hit(x, z, tapTol ?? 10 / view.k); if (!h) return; snap(); remove(h); select(null); draw(); return; }
  if (tool === 'prop') { if (propKind === 'fence') { setTool('fence'); return; } snap(); const p = { id: uid('p'), kind: propKind, x, z, yaw: 0, s: 1 }; if (propKind === 'tree') p.tree = 'oak'; if (propKind === 'sign') p.text = ''; if (propKind === 'house') Object.assign(p, { w: 11, d: 9, h: 4.2, wall: '#f2de8c', roof: '#5b6b86' }); E.props.push(p); setTool('select'); select(p); draw(); return; }
  if (tool === 'raise' || tool === 'lower') { snap(); const b = { id: uid('t'), x, z, r: 8, dh: tool === 'raise' ? 1.5 : -1.2 }; E.terrain.push(b); setTool('select'); select(b); draw(); return; }
  // line and polygon tools
  const closeShape = tool === 'water' || tool === 'zone';
  if (!drawing) { drawing = { pts: [[x, z]], close: closeShape }; draw(); return; }
  const first = drawing.pts[0], last = drawing.pts[drawing.pts.length - 1];
  const near = tapTol ?? 12 / view.k, nearFirst = Math.hypot(x - first[0], z - first[1]) < near, nearLast = Math.hypot(x - last[0], z - last[1]) < near;
  if (closeShape && nearFirst && drawing.pts.length >= 3) { finishShape(); return; }
  if (!closeShape && nearLast && drawing.pts.length >= 2) { finishShape(); return; }
  if (tool === 'zone' && drawing.pts.length === 1 && nearFirst) { snap(); const zn = { id: uid('z'), name: 'New spot', type: 'region', x: first[0], z: first[1], r: 6 }; E.zones.push(zn); drawing = null; setTool('select'); select(zn); draw(); return; }
  drawing.pts.push([x, z]); draw();
}
function finishShape() {
  const pts = drawing.pts; drawing = null; snap();
  let it;
  if (tool === 'road') { it = { id: uid('road-'), name: 'New Rd', width: 8, pts }; E.roads.push(it); }
  else if (tool === 'trail') { it = { name: uid('trail-'), width: 1.5, pts }; E.trails.push(it); }
  else if (tool === 'fence') { it = { id: uid('p'), kind: 'fence', x: pts[0][0], z: pts[0][1], yaw: 0, s: 1, pts }; E.props.push(it); }
  else if (tool === 'water') { it = { id: uid('pond-'), name: 'Pond', poly: pts }; E.water.push(it); }
  else if (tool === 'zone') { it = { id: uid('z'), name: 'New spot', type: 'region', pts }; E.zones.push(it); }
  setTool('select'); select(it); draw();
}
function remove(h) {
  if (h.m) { delete E.moves[h.m.key]; reloadLayout(); return; }
  for (const k of ['props', 'roads', 'trails', 'terrain', 'water', 'zones']) { const i = E[k].indexOf(h); if (i >= 0) { E[k].splice(i, 1); return; } }
}

// ---- the inspector
const insp = $('#insp');
function select(it, from3d = false) { sel = it; inspect(); draw(); if (it && !from3d && tapTol === null && !g3) look3d(it); }
function inspect() {
  if (!sel) { insp.classList.remove('show'); return; }
  insp.classList.add('show');
  const rows = [];
  const row = (lab, input, val) => rows.push(`<div class="row"><label>${lab}</label>${input}${val !== undefined ? `<span class="val">${val}</span>` : ''}</div>`);
  const range = (f, min, max, step, v) => `<input type="range" data-f="${f}" min="${min}" max="${max}" step="${step}" value="${v}">`;
  const text = (f, v) => `<input type="text" data-f="${f}" value="${esc(v)}">`;
  let title;
  if (sel.m) {
    title = sel.m.label; const fixed = FIXED.includes(sel.m.key.replace(/\[.*/, ''));
    row('x', text('x', sel.m.x)); row('z', text('z', sel.m.z));
    for (const f of sel.m.fields) { if (f === 'x' || f === 'z') continue; const v = sel.m.obj[f]; if (typeof v === 'number') row(f, range(f, f === 'axis' || f === 'face' || f === 'yaw' ? -3.2 : 0.3, f === 'axis' || f === 'face' || f === 'yaw' ? 3.2 : f === 'len' ? 6 : f === 'r' ? 8 : 4, 0.05, v), fmt(v)); else if (f === 'kind') row('kind', `<select data-f="kind">${['oak', 'maple', 'birch', 'pine', 'palm'].map(k => `<option${k === v ? ' selected' : ''}>${k}</option>`).join('')}</select>`); }
    if (fixed) rows.push('<div class="row"><span style="color:var(--muted);font-size:12px">The server reads this one from layout.js, so it moves only by a code change.</span></div>');
    else if (!E.moves[sel.m.key]) rows.push('<div class="row"><span style="color:var(--muted);font-size:12px">Where the code puts it. Drag it, or type x and z.</span></div>');
  } else if (sel.kind) {
    const k = PROPS[sel.kind]; title = k.name;
    if (sel.kind !== 'fence') { row('x', text('x', sel.x)); row('z', text('z', sel.z)); }
    if (k.fields.yaw) row('turn', range('yaw', -3.14, 3.14, 0.05, sel.yaw), Math.round(sel.yaw * 57.3) + '°');
    if (k.fields.s) row('size', range('s', k.fields.s[0], k.fields.s[1], 0.05, sel.s), fmt(sel.s));
    if (k.fields.kind) row('kind', `<select data-f="tree">${k.fields.kind.map(x => `<option${x === sel.tree ? ' selected' : ''}>${x}</option>`).join('')}</select>`);
    if (k.fields.text) row('words', text('text', sel.text || ''));
    for (const f of ['w', 'd', 'h']) if (k.fields[f]) row({ w: 'width', d: 'depth', h: 'height' }[f], range(f, k.fields[f][0], k.fields[f][1], 0.1, sel[f]), fmt(sel[f]) + ' m');
    for (const f of ['wall', 'roof']) if (k.fields[f]) row(f, `<input type="color" data-f="${f}" value="${sel[f]}">`);
  } else if ('dh' in sel) { title = sel.dh > 0 ? 'Raised ground' : 'Dug ground'; row('x', text('x', sel.x)); row('z', text('z', sel.z)); row('across', range('r', 2, 60, 0.5, sel.r), sel.r + ' m'); row('height', range('dh', -6, 12, 0.1, sel.dh), fmt(sel.dh) + ' m'); }
  else if (sel.poly) { title = 'Pond'; row('name', text('name', sel.name)); rows.push('<div class="row"><span style="color:var(--muted);font-size:12px">Drag a corner to reshape; drag the middle to move it all.</span></div>'); }
  else if (sel.type) { title = 'Zone'; row('name', text('name', sel.name)); row('type', `<select data-f="type">${['region', 'fishing', 'event'].map(t => `<option value="${t}"${t === sel.type ? ' selected' : ''}>${{ region: 'Place name (HUD)', fishing: 'Fishing area', event: 'Event spot' }[t]}</option>`).join('')}</select>`); if (!sel.pts) row('across', range('r', 1, 60, 0.5, sel.r), sel.r + ' m'); }
  else if (sel.width != null && sel.id) { title = 'Road'; row('name', text('name', sel.name)); row('width', range('width', 5, 12, 0.5, sel.width), sel.width + ' m'); rows.push('<div class="row"><span style="color:var(--muted);font-size:12px">Kerbs and sidewalks come with it. An end on another road joins it.</span></div>'); }
  else if (sel.width != null) { title = 'Trail'; row('name', text('name', sel.name)); row('width', range('width', 0.8, 3, 0.1, sel.width), sel.width + ' m'); }
  insp.innerHTML = `<h2>${esc(title)}</h2>${rows.join('')}<div class="btns">${sel.m ? (E.moves[sel.m.key] ? '<button class="small" data-act="reset">Put back</button>' : '') : '<button class="small danger" data-act="delete">Delete</button>'}<button class="small" data-act="close">Close</button></div>`;
  for (const inp of insp.querySelectorAll('[data-f]')) {
    const f = inp.dataset.f;
    const apply = () => { let v = inp.type === 'range' || f === 'x' || f === 'z' ? parseFloat(inp.value) : inp.value; if (typeof v === 'number' && !Number.isFinite(v)) return; if (sel.m) setMove(sel.m, f, v); else sel[f] = v; const val = inp.parentElement.querySelector('.val'); if (val) val.textContent = f === 'yaw' ? Math.round(v * 57.3) + '°' : (f === 'r' || f === 'width' ? v + ' m' : fmt(v) + (f === 'w' || f === 'd' || f === 'h' || f === 'dh' ? ' m' : '')); draw(); };
    inp.addEventListener('input', () => { apply(); });
    inp.addEventListener('pointerdown', () => snap(), { once: true });
    inp.addEventListener('change', () => { apply(); if (inp.type === 'text') inspect(); });
  }
  insp.querySelector('[data-act="close"]').onclick = () => select(null);
  insp.querySelector('[data-act="delete"]')?.addEventListener('click', () => { snap(); remove(sel); select(null); draw(); });
  insp.querySelector('[data-act="reset"]')?.addEventListener('click', () => { snap(); remove(sel); select(null); draw(); });
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = v => (Math.round(v * 100) / 100).toString();

// ---- the layout under the moves: reload layout.js fresh (a new module instance) so "put back" really puts back
let layoutVersion = 0;
async function reloadLayout() {
  const mod = await import(`../layout.js?v=${++layoutVersion}`);
  for (const k of Object.keys(mod)) { const v = mod[k], cur = L[k]; if (Array.isArray(cur) && Array.isArray(v)) { cur.length = 0; cur.push(...JSON.parse(JSON.stringify(v))); } else if (cur && typeof cur === 'object' && v && typeof v === 'object') { for (const f of Object.keys(v)) cur[f] = JSON.parse(JSON.stringify(v[f])); } }
  MOV = movables(); applyMoves(); draw();
}

// ---- the 3D view: the game itself in a frame (?preview: main.js skips the start screen and the HUD and listens for us)
const frame3d = $('#game');
let threeD = false, ready3d = false, propsTimer = 0;
function post(m) { if (threeD && ready3d) frame3d.contentWindow?.postMessage(m, location.origin); }
function rebuild3d() { ready3d = false; try { sessionStorage.setItem('breneland.previewEdits', JSON.stringify(E)); } catch { /* fine */ } frame3d.src = '/?preview&fast&hour=14&t=' + Date.now(); $('#note3d').textContent = 'Building the world...'; }
addEventListener('message', e => { if (e.origin !== location.origin || e.data?.type !== 'preview-ready') return; ready3d = true; lastMarks = ''; lastTerrain = JSON.stringify(E.terrain); post({ type: 'edit', on: edit3d }); noteIdle(); marks3d(); if (sel) look3d(sel); });
function look3d(it) { const c = it.m ? [it.m.x, it.m.z] : it.pts || it.poly ? centre({ pts: it.pts || it.poly }) : [it.x, it.z]; post({ type: 'goto', x: c[0], z: c[1] }); }
// a press, drag and release in the 3D view (editor/preview-edit.js): the same tool, on the ground under the finger
let g3 = null;
addEventListener('message', e => {
  if (e.origin !== location.origin || e.data?.type !== 'pick') return;
  const m = e.data;
  if (m.phase === 'down') { g3 = { x: m.x, z: m.z, tol: m.tol, gs: press(m.x, m.z, m.tol, true) }; }
  else if (m.phase === 'move' && g3) { if (g3.gs) drag(g3.gs, m.x, m.z); }
  else if (m.phase === 'up' && g3) { if (!m.moved && !g3.gs) { tapTol = g3.tol; try { tap(g3.x, g3.z); } finally { tapTol = null; } } g3 = null; }
  else if (m.phase === 'cancel') g3 = null;
});
// what the 3D view marks: a ring round the selection, pins on the points being drawn; and the ground when a bump changes
let lastMarks = '', lastTerrain = '', terrainTimer = 0;
function marks3d() {
  if (!threeD || !ready3d) return;
  let s = null;
  if (sel) { const b = bounds(sel); if (b) s = { x: (b[0] + b[2]) / 2, z: (b[1] + b[3]) / 2, r: Math.max(1, Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 0.4) }; if (sel && 'dh' in sel) s.r = sel.r; }
  const m = { type: 'marks', sel: s, pts: drawing ? drawing.pts : (sel && (sel.pts || sel.poly)) || [] };
  const j = JSON.stringify(m); if (j !== lastMarks) { lastMarks = j; post(m); }
  const t = JSON.stringify(E.terrain); if (t !== lastTerrain) { lastTerrain = t; clearTimeout(terrainTimer); terrainTimer = setTimeout(() => post({ type: 'terrain', terrain: E.terrain }), 250); }
}
function push3d() { clearTimeout(propsTimer); propsTimer = setTimeout(() => post({ type: 'props', props: E.props }), 150); }
$('#toggle3d').onclick = () => { threeD = !threeD; document.body.classList.toggle('split', threeD); $('#toggle3d').classList.toggle('on', threeD); resize(); if (threeD && !frame3d.src) rebuild3d(); else if (threeD && sel) look3d(sel); };
$('#rebuild').onclick = rebuild3d;
let edit3d = true;
function noteIdle() { $('#note3d').textContent = edit3d ? 'Tap the 3D view to use the tool below. Look: right-drag (mouse) or two fingers. Roads, trails and ponds: Rebuild.' : 'Look around: drag. Roads, trails and ponds: Rebuild.'; }
$('#edit3d').onclick = () => { edit3d = !edit3d; $('#edit3d').classList.toggle('on', edit3d); post({ type: 'edit', on: edit3d }); noteIdle(); };

// ---- JSON in and out, undo, save
$('#undo').onclick = () => { const s = undo.pop(); if (!s) return; E = normalise(JSON.parse(s)); select(null); reloadLayout(); status('Undone.'); };
$('#json').onclick = () => { $('#jsontext').value = JSON.stringify(E, null, 1); $('#jsonbox').classList.add('show'); };
$('#closejson').onclick = () => $('#jsonbox').classList.remove('show');
$('#copy').onclick = async () => { const t = $('#jsontext'); t.value = JSON.stringify(E, null, 1); t.select(); try { await navigator.clipboard.writeText(t.value); status('Copied. Paste it to Claude, or Save to game.'); } catch { status('Selected. Press Ctrl+C to copy.'); } };
$('#paste').onclick = () => { try { snap(); E = normalise(JSON.parse($('#jsontext').value)); $('#jsonbox').classList.remove('show'); select(null); reloadLayout(); status('Loaded the pasted edits.'); } catch { status('That is not valid JSON.', true); } };
let key = ''; try { key = localStorage.getItem('breneland.editKey') || ''; } catch { /* fine */ }
// Andrew signed in on this device: his session token saves without the key (server.js editRefusal)
const session = () => { try { const a = JSON.parse(localStorage.getItem('breneland.account') || 'null'); return a && typeof a.token === 'string' ? a.token : ''; } catch { return ''; } };
const saveHeaders = () => ({ 'content-type': 'application/json', ...(key ? { 'x-edit-key': key } : {}), ...(session() ? { 'x-breneland-token': session() } : {}) });
$('#save').onclick = () => { if (!key && !session()) { $('#keyrow').classList.add('show'); $('#key').focus(); status('Enter the edit key once (it is kept on this device), or log in to Breneland as Andrew.'); return; } save(); };
$('#keyok').onclick = () => { key = $('#key').value.trim(); try { localStorage.setItem('breneland.editKey', key); } catch { /* fine */ } $('#keyrow').classList.remove('show'); save(); };
async function save() {
  status('Saving...');
  try {
    const r = await fetch('/api/world-edits', { method: 'POST', headers: saveHeaders(), body: JSON.stringify(E) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) { key = ''; try { localStorage.removeItem('breneland.editKey'); } catch { /* fine */ } $('#keyrow').classList.add('show'); } status('Not saved: ' + (j.error || r.status), true); return; }
    status('Saved. Reload the game to see it (everyone gets it on their next visit).');
  } catch (e) { status('Not saved: ' + e.message, true); }
}

// ---- boot
(async () => {
  try { const cfg = await (await fetch('/api/config', { cache: 'no-store' })).json(); slots = cfg.slots || []; for (const s of slots) slotsById[s.id] = s; } catch { /* no slots drawn */ }
  try { const j = await (await fetch('/api/world-edits', { cache: 'no-store' })).json(); E = normalise(j); } catch { /* starts empty */ }
  MOV = movables(); applyMoves();
  resize(); setTool('select');
  const n = E.props.length + E.roads.length + E.trails.length + E.terrain.length + E.water.length + E.zones.length + Object.keys(E.moves).length;
  status(n ? `Loaded ${n} edits from the game.` : 'No edits yet: the world as the code builds it.');
})();
