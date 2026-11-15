// The Missing Pie in 3D on a real table (game-waves): what passers-by see, from the public view only. The town map printed
// on a wooden tray the way the overlay draws it (grass, sandy paths with their steps, the bus routes), the eight places as
// little buildings, the Picnic Lawn in the middle with the closed pie box (opened, with the answer's three cards beside it,
// only once the game is over and the view shows the solution), a pawn per suspect where the view puts them (a player's on a
// base in their seat colour, lying down once they are out), the die after a roll, and each player's cards as a fan of backs
// in front of their chair (one lifted while they pick a card to show). Draws: the printed board and one vertex-colour batch.
import { THREE, Batcher, GEO, SEAT_COLORS, INK, FONT, CREAM, tableBase, canvasMat, whenFonts, rr, tray, facePlane, TRAY_TOP, drop, pawn, cardFan, die, roof, h01 } from './tg-kit3d.js';

// the engine's places (missing-pie-bot.js WHERE order), how each is drawn, and where it sits on the 3 x 3 map
const PLACES = [
  { id: 'games', name: 'Game Store', wall: '#fff1d6', roof: '#e0463c' },
  { id: 'fish', name: 'Fish Shack', wall: '#d9a35b', roof: '#3f8fd9' },
  { id: 'post', name: 'Post Office', wall: '#fff1d6', roof: '#4fa45a' },
  { id: 'crib', name: 'Tool Crib', wall: '#c98b52', roof: '#6e4224' },
  { id: 'tower', name: 'Water Tower', wall: '#2fb5a8', roof: '#1f7f77' },
  { id: 'fountain', name: 'Fountain', wall: '#cfc6b8', roof: '#7fc7ef' },
  { id: 'lovecraft', name: 'Lovecraft House', wall: '#b9a6d9', roof: '#6b4fa0' },
  { id: 'bus', name: 'Bus Stop', wall: '#f2b630', roof: '#f2b630' },
  { id: 'lawn', name: 'Picnic Lawn', wall: '#fff8ec', roof: '#e0463c' },
];
const GRID = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1]];
const PATHS = [[0, 1, 3], [1, 2, 3], [2, 3, 2], [3, 4, 3], [4, 5, 3], [5, 6, 2], [6, 7, 3], [7, 0, 2], [8, 1, 3], [8, 3, 3], [8, 5, 3], [8, 7, 3]];
// the suspects (WHO order) and their colours, as the overlay has them
const WHO = ['pudding', 'sprocket', 'fig', 'quill', 'brine', 'marmalade'];
const WHO_COL = ['#e0463c', '#3f8fd9', '#b48cff', '#4fa45a', '#f0862f', '#ff8fb8'];
const WHAT = ['basket', 'net', 'barrow', 'kite', 'lunchbox', 'umbrella'];
const WHAT_COL = ['#d9a35b', '#cfe8f0', '#4fa45a', '#ffd34d', '#3f8fd9', '#b48cff'];
const placeIdx = id => PLACES.findIndex(p => p.id === id);

export function create(parent, table) {
  const { root, S, dirOf, edgeOf } = tableBase(parent, table, 'tg-mp');
  const board = canvasMat(1024, 1024);
  const bg = new THREE.Group(); root.add(bg);
  facePlane(bg, board.mat, S, 'tg-mp-board');
  const G = S * 0.335; // place to place
  const at = i => { const [c, r] = GRID[i]; return [(c - 1) * G, (r - 1) * G]; };
  let built = [], key = '', builds = 0;

  function drawBoard() {
    const g = board.g, W = 1024, k = W / S, P = i => { const [x, z] = at(i); return [W / 2 + x * k, W / 2 + z * k]; };
    const gr = g.createRadialGradient(W / 2, W / 2, 30, W / 2, W / 2, W * 0.72); gr.addColorStop(0, '#9fd17a'); gr.addColorStop(1, '#6fae55');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(47,107,79,0.22)'; g.beginPath(); g.ellipse(h01(i, 1) * W, h01(i, 2) * W, 5 + h01(i, 3) * 9, 3 + h01(i, 4) * 3, 0, 0, Math.PI * 2); g.fill(); }
    // a pond in a corner gap and a few flower dots, for the town's feel
    g.fillStyle = '#8fd0f0'; g.beginPath(); g.ellipse(W * 0.5, W * 0.965, W * 0.12, W * 0.03, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 40; i++) { g.fillStyle = ['#ffd34d', '#ff8fb8', '#fff8ec'][i % 3]; g.beginPath(); g.arc(h01(i, 7) * W, h01(i, 8) * W, 4, 0, Math.PI * 2); g.fill(); }
    // the bus routes: dashed, corner to corner
    g.save(); g.setLineDash([22, 18]); g.lineCap = 'round';
    for (const [a, b] of [[0, 4], [2, 6]]) { const A = P(a), B = P(b); g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.lineWidth = 14; g.strokeStyle = 'rgba(43,35,64,0.55)'; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#ffd34d'; g.stroke(); }
    g.restore();
    // the paths: sand with an ink edge, stepping stones, the step count in a badge
    const pw = 40;
    for (const [a, b] of PATHS) { g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.lineCap = 'round'; g.lineWidth = pw + 10; g.strokeStyle = INK; g.stroke(); g.lineWidth = pw; g.strokeStyle = '#ecd9a6'; g.stroke(); }
    for (const [a, b, s] of PATHS) {
      const A = P(a), B = P(b);
      for (let i = 1; i < s * 2; i++) { if (i === s) continue; const t = i / (s * 2); g.beginPath(); g.arc(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, 8, 0, Math.PI * 2); g.fillStyle = 'rgba(154,101,56,0.6)'; g.fill(); }
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      g.beginPath(); g.arc(mx, my, 24, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.font = `700 32px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(s), mx, my + 2);
    }
    // the Picnic Lawn's blanket, a checked square under the pie box
    const [lx, ly] = P(8), bs = G * k * 0.62;
    g.save(); g.translate(lx, ly - G * k * 0.08); g.rotate(-0.12);
    rr(g, -bs / 2, -bs / 2, bs, bs * 0.8, 10); g.fillStyle = CREAM; g.fill();
    g.save(); g.clip(); g.fillStyle = 'rgba(224,70,60,0.85)'; for (let i = -4; i <= 4; i++) { g.fillRect(i * bs / 8 - bs / 32, -bs, bs / 16, bs * 2); g.fillRect(-bs, i * bs / 8 - bs / 32, bs * 2, bs / 16); } g.restore();
    rr(g, -bs / 2, -bs / 2, bs, bs * 0.8, 10); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.restore();
    // the places' names on little cream signs below each building
    for (let i = 0; i < PLACES.length; i++) {
      const [x, y] = P(i), t = PLACES[i].name, yy = y + G * k * 0.16;
      g.font = `700 ${t.length > 11 ? 28 : 32}px ${FONT}`; const w = g.measureText(t).width + 26;
      rr(g, x - w / 2, yy - 21, w, 42, 14); g.fillStyle = CREAM; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, yy + 2);
    }
    // the edge
    g.lineWidth = 12; g.strokeStyle = INK; g.strokeRect(6, 6, W - 12, W - 12);
    board.dirty();
  }
  drawBoard(); whenFonts(drawBoard);

  // a little building for place i at (x, z), front toward +z
  function building(b, i, x, z) {
    const p = PLACES[i], w = S * 0.12, d = S * 0.08, h = S * 0.065, y = TRAY_TOP;
    if (p.id === 'fountain') {
      b.add(GEO.cyl12, '#cfc6b8', { x, y: y + h * 0.18, z, sx: w * 0.5, sy: h * 0.36, sz: w * 0.5 });
      b.add(GEO.cyl12, '#7fc7ef', { x, y: y + h * 0.37, z, sx: w * 0.42, sy: 0.002, sz: w * 0.42 });
      b.add(GEO.cyl8, '#cfc6b8', { x, y: y + h * 0.6, z, sx: w * 0.07, sy: h * 0.6, sz: w * 0.07 });
      b.add(GEO.sphere, '#bfe6ff', { x, y: y + h * 0.98, z, sx: w * 0.16, sy: w * 0.1, sz: w * 0.16 });
      return;
    }
    if (p.id === 'tower') {
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(GEO.box, '#6e4224', { x: x + u * w * 0.22, y: y + h * 0.4, z: z + v * w * 0.22, sx: w * 0.06, sy: h * 0.8, sz: w * 0.06 });
      b.add(GEO.cyl12, p.wall, { x, y: y + h * 1.05, z, sx: w * 0.36, sy: h * 0.6, sz: w * 0.36 });
      b.add(GEO.cone8, p.roof, { x, y: y + h * 1.55, z, sx: w * 0.42, sy: h * 0.42, sz: w * 0.42 });
      return;
    }
    if (p.id === 'bus') {
      b.add(GEO.cyl8, INK, { x: x - w * 0.45, y: y + h * 0.6, z: z + d * 0.2, sx: w * 0.035, sy: h * 1.2, sz: w * 0.035 });
      b.add(GEO.cyl12, p.wall, { x: x - w * 0.45, y: y + h * 1.25, z: z + d * 0.2, sx: w * 0.14, sy: w * 0.03, sz: w * 0.14, rx: Math.PI / 2 });
      b.add(GEO.box, p.wall, { x: x + w * 0.1, y: y + h * 0.42, z, sx: w * 0.85, sy: h * 0.62, sz: d * 0.7 });
      b.add(GEO.box, '#cfe8f0', { x: x + w * 0.1, y: y + h * 0.52, z: z + d * 0.351, sx: w * 0.7, sy: h * 0.2, sz: 0.001 });
      for (const u of [-0.2, 0.4]) b.add(GEO.cyl8, INK, { x: x + w * u, y: y + h * 0.12, z: z + d * 0.36, sx: h * 0.12, sy: 0.003, sz: h * 0.12, rx: Math.PI / 2 });
      return;
    }
    if (p.id === 'lawn') return;
    b.add(GEO.box, p.wall, { x, y: y + h / 2, z, sx: w, sy: h, sz: d });
    roof(b, p.roof, x, y + h, z, w * 1.14, d * 1.12, h * 0.75, Math.PI / 2 * 0 + 0);
    b.add(GEO.box, '#6e4224', { x, y: y + h * 0.3, z: z + d / 2 + 0.0006, sx: w * 0.2, sy: h * 0.6, sz: 0.001 });
    for (const u of [-0.3, 0.3]) b.add(GEO.box, '#ffd34d', { x: x + u * w, y: y + h * 0.58, z: z + d / 2 + 0.0006, sx: w * 0.17, sy: h * 0.24, sz: 0.001 });
    if (p.id === 'games') b.add(GEO.box, '#fff8ec', { x, y: y + h * 0.9, z: z + d / 2 + 0.0008, sx: w * 0.8, sy: h * 0.14, sz: 0.001 });
    if (p.id === 'lovecraft') b.add(GEO.sphere, '#ffd34d', { x, y: y + h * 1.45, z: z + d * 0.1, sx: w * 0.06, sy: w * 0.06, sz: w * 0.06 });
  }

  function build(view, order, phase) {
    const v = view || {};
    const k = JSON.stringify([v.pos, v.out, v.active, v.turn, v.stage, v.roll, v.pending && [v.pending.asker, v.pending.by], v.counts, v.solution, phase, order]);
    if (k === key) return; key = k; builds++;
    built = drop(built);
    const yaw = order && order.length ? dirOf(order[0]) : 0; bg.rotation.y = yaw; bg.updateMatrix();
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw), toB = (x, z) => [x * cy + z * sy, -x * sy + z * cy];
    const T = (x, z, a) => { const [bx, bz] = toB(x, z); return { x: bx, z: bz, ry: a - yaw }; };
    const b = new Batcher({ vertexColors: true, castShadow: false });
    tray(b, S, { frame: '#6e4224', lip: '#4f8a3c' });
    for (let i = 0; i < PLACES.length; i++) { const [x, z] = at(i); building(b, i, x, z - G * 0.1); }
    // the pie box on the lawn: shut and tied with a ribbon, or open with the pie inside once the answer is out
    const [lx, lz] = at(8), bz = lz - G * 0.1, bw = S * 0.09, bh = S * 0.05, sol = phase === 'over' && v.solution ? v.solution : null;
    b.add(GEO.box, '#ffaec4', { x: lx, y: TRAY_TOP + bh / 2, z: bz, sx: bw, sy: bh, sz: bw });
    if (!sol) {
      b.add(GEO.box, '#ffc7d6', { x: lx, y: TRAY_TOP + bh + 0.002, z: bz, sx: bw * 1.06, sy: 0.006, sz: bw * 1.06 });
      b.add(GEO.box, '#e0463c', { x: lx, y: TRAY_TOP + bh / 2 + 0.001, z: bz, sx: bw * 0.16, sy: bh + 0.008, sz: bw * 1.08 });
      b.add(GEO.box, '#e0463c', { x: lx, y: TRAY_TOP + bh / 2 + 0.001, z: bz, sx: bw * 1.08, sy: bh + 0.008, sz: bw * 0.16 });
      for (const u of [-1, 1]) b.add(GEO.sphere, '#e0463c', { x: lx + u * bw * 0.12, y: TRAY_TOP + bh + 0.009, z: bz, sx: bw * 0.13, sy: bw * 0.08, sz: bw * 0.09, rz: u * 0.5 });
    } else {
      b.add(GEO.cyl12, '#d9a35b', { x: lx, y: TRAY_TOP + bh + 0.002, z: bz, sx: bw * 0.4, sy: 0.008, sz: bw * 0.4 });
      b.add(GEO.sphere, '#f2b630', { x: lx, y: TRAY_TOP + bh + 0.006, z: bz, sx: bw * 0.36, sy: bw * 0.14, sz: bw * 0.36 });
      b.add(GEO.box, '#ffc7d6', { x: lx + bw * 0.95, y: TRAY_TOP + 0.003, z: bz - bw * 0.2, sx: bw * 1.06, sy: 0.006, sz: bw * 1.06, ry: 0.4 });
      const cards = [WHO_COL[WHO.indexOf(sol.who)] || '#fff8ec', WHAT_COL[WHAT.indexOf(sol.what)] || '#fff8ec', (PLACES[placeIdx(sol.where)] || {}).roof || '#fff8ec'];
      cards.forEach((c, j) => { const x = lx + (j - 1) * S * 0.07, z = bz + G * 0.42; b.add(GEO.box, CREAM, { x, y: TRAY_TOP + 0.002, z, sx: S * 0.055, sy: 0.003, sz: S * 0.08, ry: (j - 1) * 0.12 }); b.add(GEO.box, c, { x, y: TRAY_TOP + 0.004, z: z - S * 0.008, sx: S * 0.038, sy: 0.002, sz: S * 0.04, ry: (j - 1) * 0.12 }); });
    }
    // the suspects' pawns, along the front of their place (a player's on a base in their seat colour)
    const n = order ? order.length : 0, here = new Map();
    WHO.forEach((w, i) => { const p = placeIdx((v.pos || [])[i] || 'lawn'); if (!here.has(p)) here.set(p, []); here.get(p).push(i); });
    const ph = S * 0.085;
    for (const [p, list] of here) {
      const [x, z] = at(p);
      list.forEach((i, j) => {
        const px = x + (j - (list.length - 1) / 2) * ph * 0.62, pz = z + G * 0.3, seat = i < n ? i : null;
        const out = seat !== null && v.out && v.out[seat], go = seat !== null && seat === v.active && phase === 'play';
        if (go) b.add(GEO.cyl12, '#ffd34d', { x: px, y: TRAY_TOP + 0.001, z: pz, sx: ph * 0.36, sy: 0.002, sz: ph * 0.36 });
        if (seat === null) pawn(b, px, pz, WHO_COL[i], { h: ph * 0.8, y: TRAY_TOP, ring: '#cfc6b8' });
        else pawn(b, px, pz, WHO_COL[i], { h: ph, y: TRAY_TOP + (go ? 0.004 : 0), ring: SEAT_COLORS[order[seat] % 8], lie: out ? 0.6 + j : 0 });
      });
    }
    // each player's cards: a fan of backs in front of their chair (one lifted while they pick a card to show)
    for (let i = 0; i < n; i++) {
      const chair = order[i], a = dirOf(chair), cnt = (v.counts || [])[i] || 0;
      const r = Math.max(S * 0.5 + 0.05, Math.min(edgeOf(chair) - 0.07, S * 0.5 + 0.16)), cx = Math.sin(a) * r, cz = Math.cos(a) * r;
      const picking = v.pending && v.pending.by === i && v.stage === 'show';
      const p = T(cx, cz, a);
      b.add(GEO.cyl12, SEAT_COLORS[chair % 8], { x: p.x, y: 0.002, z: p.z, sx: 0.05, sy: 0.004, sz: 0.035, ry: p.ry });
      fanInto(b, p, cnt - (picking ? 1 : 0));
      if (picking) { const q = T(cx - Math.sin(a) * 0.03, cz - Math.cos(a) * 0.03, a); b.add(GEO.box, CREAM, { x: q.x, y: 0.075, z: q.z, sx: 0.036, sy: 0.052, sz: 0.002, ry: q.ry, rx: 0.2 }); b.add(GEO.box, '#b8433a', { x: q.x - Math.sin(q.ry) * 0.0012, y: 0.075, z: q.z - Math.cos(q.ry) * 0.0012, sx: 0.029, sy: 0.044, sz: 0.0014, ry: q.ry, rx: 0.2 }); }
    }
    // the die, after a roll, on the table beside the board toward the one who rolled
    if (v.roll > 0 && n && phase === 'play' && v.active >= 0) {
      const a = dirOf(order[v.active]) + 0.5, r = S * 0.5 + 0.04, p = T(Math.sin(a) * r, Math.cos(a) * r, a);
      die(b, p.x, p.z, 0.022, v.roll, { yaw: p.ry + 0.3 });
    }
    built = b.build(bg, 'tg-mp-pieces') || [];
    for (const m of built) m.receiveShadow = true;
  }
  function fanInto(b, p, cnt) { cardFan(b, p.x, p.z, p.ry, cnt, '#b8433a', { w: 0.034, h: 0.05 }); }
  return {
    root, flying: false,
    update(view, order, phase) { try { build(view, order, phase); } catch (e) { console.error('[tg-mp3d]', e); } },
    tick() {}, slide() {},
    drawn: () => { let m = 0; root.traverse(o => { if (o.isMesh && o.visible) m++; }); return { builds, meshes: m }; },
    dispose() { built = drop(built); root.removeFromParent(); root.traverse(o => o.geometry && o.geometry.dispose()); board.dispose(); },
  };
}
export default { create };
