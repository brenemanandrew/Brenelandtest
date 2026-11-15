// Word Weave in 3D on a real table (game-waves): what passers-by see, from the public view only. The 15 x 15 board printed
// on a wooden tray (bonus squares in the overlay's colours), the letter tiles played so far as little cream tiles (the
// last word's in yellow), a rack in each player's seat colour with their tiles stood on it backs out, and the cloth bag
// while it holds tiles. Draws: the printed board, the tiles' faces (one canvas laid over the board, redrawn on a change),
// one vertex-colour batch for everything else. Rebuilt only when the public view changes.
import { THREE, Batcher, GEO, SEAT_COLORS, INK, FONT, CREAM, tableBase, canvasMat, whenFonts, rr, tray, facePlane, TRAY_TOP, drop, h01 } from './tg-kit3d.js';

const N = 15;
const SQ = { '.': '#fff8ec', d: '#ffe08a', t: '#f6a95a', D: '#ffaec4', T: '#e8574d', '*': '#ffaec4' };
const LBL = { d: '2L', t: '3L', D: '2W', T: '3W' };
const VAL = { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 3, I: 1, J: 9, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 2, V: 5, W: 4, X: 8, Y: 4, Z: 10 };

export function create(parent, table) {
  const { root, S, dirOf, edgeOf } = tableBase(parent, table, 'tg-ww');
  const IN = S * 0.93, C = IN / N, TH = C * 0.26; // the grid's side, a square, a tile's height
  const board = canvasMat(1024, 1024), faces = canvasMat(1024, 1024, { alpha: true });
  const bg = new THREE.Group(); root.add(bg); // the board and its tiles, turned toward the first player
  facePlane(bg, board.mat, S, 'tg-ww-board');
  const fg = new THREE.PlaneGeometry(IN, IN); fg.rotateX(-Math.PI / 2);
  const faceMesh = new THREE.Mesh(fg, faces.mat); faceMesh.name = 'tg-ww-faces'; faceMesh.position.y = TRAY_TOP + TH + 0.0004; faceMesh.matrixAutoUpdate = false; faceMesh.updateMatrix(); bg.add(faceMesh);
  let built = [], key = '', layoutKey = '', builds = 0, last = null;

  function drawBoard(layout) {
    const g = board.g, W = 1024, m = (1 - IN / S) / 2 * W, c = (W - 2 * m) / N;
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, W, W);
    rr(g, m * 0.35, m * 0.35, W - m * 0.7, W - m * 0.7, 18); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
      const k = (layout[r] || '')[q] || '.', x = m + q * c, y = m + r * c;
      g.fillStyle = SQ[k] || SQ['.']; g.fillRect(x, y, c, c);
      if (LBL[k]) { g.fillStyle = k === 'T' ? CREAM : 'rgba(43,35,64,0.8)'; g.font = `700 ${Math.round(c * 0.36)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LBL[k], x + c / 2, y + c / 2 + 1); }
      if (k === '*') star(g, x + c / 2, y + c / 2, c * 0.34);
    }
    g.strokeStyle = 'rgba(43,35,64,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(m + i * c, m); g.lineTo(m + i * c, W - m); g.moveTo(m, m + i * c); g.lineTo(W - m, m + i * c); g.stroke(); }
    g.lineWidth = 5; g.strokeStyle = INK; g.strokeRect(m, m, W - 2 * m, W - 2 * m);
    board.dirty();
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
    g.closePath(); g.fillStyle = '#ffd34d'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  }
  // the tiles' tops: a cream rounded square with its letter and value per filled square (the rest see-through)
  function drawFaces(rows, fresh) {
    const g = faces.g, W = 1024, c = W / N;
    g.clearRect(0, 0, W, W);
    for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
      const ch = (rows[r] || '')[q]; if (!ch || ch === '.') continue;
      const x = q * c, y = r * c, p = c * 0.06, blank = ch !== ch.toUpperCase(), L = ch.toUpperCase();
      rr(g, x + p, y + p, c - 2 * p, c - 2 * p, c * 0.16); g.fillStyle = fresh.has(r * N + q) ? '#ffe9a0' : '#fbf6ea'; g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      g.fillStyle = blank ? '#8a5a2b' : INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(c * 0.6)}px ${FONT}`; g.fillText(L, x + c * 0.47, y + c * 0.53);
      if (!blank && VAL[L]) { g.font = `700 ${Math.round(c * 0.22)}px ${FONT}`; g.fillText(String(VAL[L]), x + c * 0.79, y + c * 0.76); }
    }
    faces.dirty();
  }

  function build(view, order, phase) {
    const rows = view && Array.isArray(view.board) ? view.board : [];
    const lastT = view && view.last && view.last.type === 'place' && Array.isArray(view.last.tiles) ? view.last.tiles : [];
    const turn = view && phase === 'play' && Number.isInteger(view.turn) ? view.turn : -1;
    const k = JSON.stringify([rows, view && view.counts, view && (view.bag > 0 ? Math.min(5, Math.ceil(view.bag / 20)) : 0), turn, phase, order, lastT]);
    if (k === key) return; key = k; builds++;
    const layout = view && Array.isArray(view.layout) ? view.layout : [];
    const lk = layout.join('|'); if (lk !== layoutKey || builds === 1) { layoutKey = lk; drawBoard(layout); whenFonts(() => { drawBoard(layout); if (last) drawFaces(...last); }); }
    const fresh = new Set(lastT.map(t => t.r * N + t.c));
    last = [rows, fresh]; drawFaces(rows, fresh);
    built = drop(built);
    const yaw = order && order.length ? dirOf(order[0]) : 0; bg.rotation.y = yaw; bg.updateMatrix();
    const b = new Batcher({ vertexColors: true, castShadow: false });
    tray(b, S, { frame: '#6e4224', lip: '#b47a46' });
    // the tiles' bodies under the faces: a cream block on a darker foot
    for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
      const ch = (rows[r] || '')[q]; if (!ch || ch === '.') continue;
      const x = -IN / 2 + (q + 0.5) * C, z = -IN / 2 + (r + 0.5) * C;
      b.add(GEO.box, '#d9c49a', { x, y: TRAY_TOP + TH * 0.3, z, sx: C * 0.86, sy: TH * 0.6, sz: C * 0.86 });
      b.add(GEO.box, '#fbf6ea', { x, y: TRAY_TOP + TH * 0.75, z, sx: C * 0.88, sy: TH * 0.5, sz: C * 0.88 });
    }
    // in table space -> board space (the batch lives in the turned group)
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
    const toB = (x, z) => [x * cy + z * sy, -x * sy + z * cy];
    const T = (x, z, a) => { const [bx, bz] = toB(x, z); return { x: bx, z: bz, ry: a - yaw }; };
    // the racks: in seat colour, the tiles stood on them backs to the board, the turn's rack with a gold rail
    const n = order ? order.length : 0;
    for (let i = 0; i < n; i++) {
      const chair = order[i], a = dirOf(chair), col = SEAT_COLORS[chair % 8], cnt = Math.min(7, (view && view.counts && view.counts[i]) || 0);
      const r = Math.max(S * 0.5 + 0.035, Math.min(edgeOf(chair) - 0.06, S * 0.5 + 0.16));
      const cx = Math.sin(a) * r, cz = Math.cos(a) * r, tx = Math.cos(a), tz = -Math.sin(a), w = C * 0.95, len = w * 7.8;
      const p = T(cx, cz, a);
      b.add(GEO.box, col, { ...p, y: 0.008, sx: len, sy: 0.016, sz: w * 0.95 });
      b.add(GEO.box, i === turn ? '#ffd34d' : '#2b2340', { ...T(cx + Math.sin(a) * w * 0.4, cz + Math.cos(a) * w * 0.4, a), y: 0.019, sx: len, sy: 0.006, sz: w * 0.16 });
      for (let j = 0; j < cnt; j++) {
        const u = (j - (cnt - 1) / 2) * w * 1.06, x = cx + tx * u, z = cz + tz * u;
        // a tile leaning back on the rail: its back (cream with a seat-colour dot) toward the board
        b.add(GEO.box, '#fbf6ea', { ...T(x, z, a), y: 0.016 + w * 0.47, sx: w * 0.92, sy: w * 0.92, sz: w * 0.3, rx: 0.3 });
        b.add(GEO.box, '#e6d3ae', { ...T(x - Math.sin(a) * w * 0.15, z - Math.cos(a) * w * 0.15, a), y: 0.016 + w * 0.47 + 0.0015, sx: w * 0.62, sy: w * 0.62, sz: w * 0.02, rx: 0.3 });
      }
      if (i === turn) { const q = T(cx + tx * (len / 2 + 0.012), cz + tz * (len / 2 + 0.012), a); b.add(GEO.cone8, '#ffd34d', { ...q, y: 0.03, sx: 0.008, sy: 0.016, sz: 0.008, rx: Math.PI }); }
    }
    // the bag: a soft purple sack beside the board, fuller with more tiles in it
    const bagN = view ? view.bag || 0 : 0;
    if (bagN > 0) {
      const k2 = 0.6 + 0.4 * Math.min(1, bagN / 80), a = n ? dirOf(order[0]) + Math.PI * 0.75 : 2.3, r = S * 0.62;
      const p = T(Math.sin(a) * r, Math.cos(a) * r, a), s = 0.034 * k2;
      b.add(GEO.sphere, '#7b5bb8', { ...p, y: s * 0.8, sx: s, sy: s * 0.85, sz: s });
      b.add(GEO.cyl8, '#5d4392', { ...p, y: s * 1.6, sx: s * 0.4, sy: s * 0.35, sz: s * 0.4 });
      b.add(GEO.cyl8, '#ffd34d', { ...p, y: s * 1.45, sx: s * 0.45, sy: s * 0.08, sz: s * 0.45 });
      for (let j = 0; j < 3; j++) b.add(GEO.box, '#fbf6ea', { x: p.x + (h01(j, 1) - 0.5) * s * 2.6, y: 0.003, z: p.z + (h01(j, 2) - 0.5) * s * 2.6, ry: h01(j, 3) * 3, sx: C * 0.8, sy: 0.006, sz: C * 0.8 });
    }
    built = b.build(bg, 'tg-ww-pieces') || [];
    for (const m of built) m.receiveShadow = true;
  }
  return {
    root, flying: false,
    update(view, order, phase) { try { build(view, order, phase); } catch (e) { console.error('[tg-ww3d]', e); } },
    tick() {}, slide() {},
    drawn: () => ({ builds, meshes: countMeshes(root) }),
    dispose() { built = drop(built); root.removeFromParent(); root.traverse(o => o.geometry && o.geometry.dispose()); board.dispose(); faces.dispose(); },
  };
}
export const countMeshes = root => { let n = 0; root.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; };
export default { create };
