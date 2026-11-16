// Hearthfield in 3D on a real table (game-waves): what passers-by see, from the public view only. The long meadow printed on a
// wooden tray in the overlay's colours (fields with their pictures and number signs, the town, the market carts on the rim),
// lanes as little wooden rails and cottages and halls in seat colours standing on it, Rascal the raccoon on his field, the dice
// as last rolled, the favour deck, and each player's cards as a small fan in front of their chair. Draws: the printed board and
// one vertex-colour batch for every piece, rebuilt only when the public view changes.
import { THREE, Batcher, GEO, SEAT_COLORS, INK, FONT, CREAM, tableBase, boardYaw, canvasMat, whenFonts, svgImg, rr, drop, die, roof, cardFan, clearR } from './tg-kit3d.js';

const FILL = { timber: '#5fb36a', clay: '#e39a63', wool: '#d6eda6', berries: '#f4b8cf', stone: '#bdbacb', town: '#f3e3c3' };
const S_ = `stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;
const ART = {
  timber: `<path d="M12 2l-6.5 9h3.5l-4.5 6.5h15L15 11h3.5z" fill="#2f8a4a" ${S_}/><rect x="10.4" y="17.5" width="3.2" height="4.5" fill="#9a6538" ${S_}/>`,
  clay: `<rect x="2.5" y="13.5" width="9" height="5.5" rx="1" fill="#d26f3a" ${S_}/><rect x="12.5" y="13.5" width="9" height="5.5" rx="1" fill="#e08a50" ${S_}/><rect x="7.5" y="7" width="9" height="5.5" rx="1" fill="#c9622e" ${S_}/>`,
  wool: `<path d="M5.5 10.5a3 3 0 0 1 4.5-2.6 3.2 3.2 0 0 1 5.4.2 3 3 0 0 1 3.3 4.4 2.8 2.8 0 0 1-2.4 4.5H8a3 3 0 0 1-2.5-6.5z" fill="#fff8ec" ${S_}/><ellipse cx="19" cy="10.5" rx="2.6" ry="2.1" fill="${INK}"/><path d="M9 17v4M14 17v4" ${S_}/>`,
  berries: `<path d="M12 2.5c1.5 2.5 4 3 6.5 2-1 3-3.5 4-6.5 3.5" fill="#4fa45a" ${S_}/><path d="M12 8V4" ${S_}/><circle cx="7.5" cy="13" r="4" fill="#d6336c" ${S_}/><circle cx="15.8" cy="12.5" r="4" fill="#9b2fae" ${S_}/><circle cx="11.6" cy="18.4" r="3.8" fill="#e8467c" ${S_}/>`,
  stone: `<path d="M2.5 19.5l3-7.5 5-4.5 6.5 1.5 4.5 7-2 3.5z" fill="#a9a6b8" ${S_}/><path d="M10.5 7.5l1.5 6 5.5-.5M12 13.5l-4 6" fill="none" ${S_}/>`,
  town: `<g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><rect x="1" y="13" width="7" height="7" fill="#fff8ec"/><path d="M0 13.5l4.5-4.5 4.5 4.5z" fill="#e0463c"/><rect x="9" y="5" width="6" height="15" fill="#c9d7e6"/><path d="M8 5.5l4-4 4 4z" fill="#3f6fd9"/><circle cx="12" cy="9.5" r="1.8" fill="#fff8ec"/><rect x="16" y="14" width="7" height="6" fill="#fff8ec"/><path d="M15 14.5l4.5-4 4.5 4z" fill="#f2b630"/></g>`,
};
const SV = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">${body}</svg>`;

// the meadow's geometry (a copy of hearthfield-board.js makeGeo: centres, corners, sides, by the same ids)
function makeGeo(rows) {
  const R3 = Math.sqrt(3), mid = (rows.length - 1) / 2, hex = [];
  rows.forEach((cnt, r) => { for (let c = 0; c < cnt; c++) hex.push({ r, c, x: (c - (cnt - 1) / 2) * R3, y: (r - mid) * 1.5 }); });
  const key = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000);
  const vm = new Map();
  for (const h of hex) {
    h.vk = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 90), x = h.x + Math.cos(a), y = h.y + Math.sin(a), kk = key(x, y);
      if (!vm.has(kk)) vm.set(kk, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
      h.vk.push(kk);
    }
  }
  const vkeys = [...vm.keys()].sort((p, q) => vm.get(p).y - vm.get(q).y || vm.get(p).x - vm.get(q).x);
  const vi = new Map(vkeys.map((k, i) => [k, i]));
  const v = vkeys.map(k => ({ x: vm.get(k).x, y: vm.get(k).y }));
  const em = new Map();
  hex.forEach((h, i) => {
    h.v = h.vk.map(k => vi.get(k)); delete h.vk;
    for (let k = 0; k < 6; k++) { const a = h.v[k], b = h.v[(k + 1) % 6], lo = Math.min(a, b), hi = Math.max(a, b), kk = lo + '-' + hi; if (!em.has(kk)) em.set(kk, { a: lo, b: hi, hexes: [] }); em.get(kk).hexes.push(i); }
  });
  const mpt = x => ({ x: (v[x.a].x + v[x.b].x) / 2, y: (v[x.a].y + v[x.b].y) / 2 });
  const e = [...em.values()].sort((p, q) => Math.round(mpt(p).y * 1000) - Math.round(mpt(q).y * 1000) || mpt(p).x - mpt(q).x);
  return { hex, v, e };
}

const UX = 13.6, UY = 6.8; // the printed meadow's extent in hex units (with the carts round it)
export function create(parent, table) {
  const { root, S, dirOf, edgeOf } = tableBase(parent, table, 'tg-hf', { min: 0.3, max: 0.62, k: 1.3 });
  const D = S * UY / UX, k = S / UX, TOP = 0.016;
  const board = canvasMat(1024, Math.round(1024 * UY / UX));
  const bg = new THREE.Group(); root.add(bg);
  { const g = new THREE.PlaneGeometry(S, D); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, board.mat); m.position.y = TOP; m.name = 'tg-hf-board'; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); bg.add(m); }
  let built = [], key = '', boardKey = '', builds = 0, G = null, last = null;

  function drawBoard(v) {
    const g = board.g, W = board.canvas.width, H = board.canvas.height, u = W / UX, X = x => W / 2 + x * u, Y = y => H / 2 + y * u;
    g.fillStyle = '#cfe8b4'; g.fillRect(0, 0, W, H);
    // the grassy edge
    const hexPath = (h, s = 1) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 90), x = X(h.x + Math.cos(a) * s), y = Y(h.y + Math.sin(a) * s); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); };
    g.fillStyle = '#9fcf7f'; for (const h of G.hex) { hexPath(h, 1.25); g.fill(); }
    // the carts
    (v.ports || []).forEach((e, i) => {
      const E = G.e[e], a = G.v[E.a], b = G.v[E.b], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = G.hex[E.hexes[0]];
      const dx = mx - h.x, dy = my - h.y, d = Math.hypot(dx, dy), px = mx + dx / d * 0.62, py = my + dy / d * 0.62;
      g.strokeStyle = '#9a6538'; g.lineWidth = u * 0.1; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(a.x), Y(a.y)); g.lineTo(X(px), Y(py)); g.lineTo(X(b.x), Y(b.y)); g.stroke();
      const c = v.carts[i], R = u * 0.36;
      g.beginPath(); g.arc(X(px), Y(py), R, 0, Math.PI * 2); g.fillStyle = c === 'any' ? CREAM : FILL[c]; g.fill(); g.lineWidth = u * 0.07; g.strokeStyle = INK; g.stroke();
      if (c === 'any') { g.fillStyle = INK; g.font = `700 ${Math.round(R)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('3:1', X(px), Y(py) + 1); }
      else { const im = svgImg(SV(ART[c]), () => redraw()); if (im) g.drawImage(im, X(px) - R * 0.75, Y(py) - R * 0.75, R * 1.5, R * 1.5); }
    });
    // the fields
    G.hex.forEach((h, i) => {
      const t = v.tiles[i] || {}, res = t.res || 'town';
      hexPath(h, 0.985); g.fillStyle = FILL[res]; g.fill(); g.lineWidth = u * 0.075; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
      const im = svgImg(SV(ART[res]), () => redraw());
      const sz = t.res ? u * 0.82 : u * 1.3;
      if (im) g.drawImage(im, X(h.x) - sz / 2, Y(h.y) - (t.res ? u * 0.86 : sz * 0.55), sz, sz);
      if (t.res) {
        const hot = t.num === 6 || t.num === 8, bw = u * 0.66, bh = u * 0.5, bx = X(h.x) - bw / 2, by = Y(h.y) + u * 0.12;
        rr(g, bx, by, bw, bh, u * 0.12); g.fillStyle = hot ? '#ffd34d' : CREAM; g.fill(); g.lineWidth = u * 0.06; g.strokeStyle = INK; g.stroke();
        g.fillStyle = hot ? '#a8302a' : INK; g.font = `700 ${Math.round(bh * 0.9)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(t.num), X(h.x), by + bh * 0.54);
      }
    });
    g.lineWidth = 10; g.strokeStyle = INK; g.strokeRect(5, 5, W - 10, H - 10);
    board.dirty();
  }
  const redraw = () => { if (last) drawBoard(last); };

  // a cottage (or a hall: wider, two roofs and a chimney) at (x, z) in seat colour
  function house(b, x, z, col, hall, yaw) {
    const w = hall ? k * 0.62 : k * 0.4, h = hall ? k * 0.36 : k * 0.3, d = k * 0.36;
    b.add(GEO.box, col, { x, y: TOP + h / 2, z, sx: w, sy: h, sz: d, ry: yaw });
    if (hall) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (const o of [-0.25, 0.25]) roof(b, col === '#2fb5a8' ? '#1f8a80' : INK, x + c * o * w, TOP + h, z - s * o * w, w * 0.52, d * 1.12, h * 0.6, yaw);
      b.add(GEO.box, '#9a6538', { x: x + c * w * 0.3, y: TOP + h * 1.35, z: z - s * w * 0.3, sx: k * 0.07, sy: h * 0.6, sz: k * 0.07, ry: yaw });
    } else roof(b, INK, x, TOP + h, z, w * 1.12, d * 1.1, h * 0.7, yaw + Math.PI / 2);
    b.add(GEO.box, CREAM, { x: x + Math.sin(yaw) * d * 0.51, y: TOP + h * 0.3, z: z + Math.cos(yaw) * d * 0.51, sx: w * 0.25, sy: h * 0.55, sz: 0.001, ry: yaw });
  }
  // Rascal: a grey round body, a striped tail, a head with a dark mask
  function raccoon(b, x, z) {
    const r = k * 0.28;
    b.add(GEO.sphere, '#9b97a8', { x, y: TOP + r * 0.85, z, sx: r, sy: r * 0.85, sz: r * 1.1 });
    b.add(GEO.sphere, '#9b97a8', { x, y: TOP + r * 1.75, z: z + r * 0.75, sx: r * 0.72, sy: r * 0.62, sz: r * 0.66 });
    b.add(GEO.box, INK, { x, y: TOP + r * 1.82, z: z + r * 1.28, sx: r * 1.15, sy: r * 0.28, sz: r * 0.1 });
    b.add(GEO.sphere, CREAM, { x, y: TOP + r * 1.6, z: z + r * 1.32, sx: r * 0.26, sy: r * 0.2, sz: r * 0.16 });
    for (const sx of [-1, 1]) b.add(GEO.cone8, '#8a8698', { x: x + sx * r * 0.42, y: TOP + r * 2.35, z: z + r * 0.7, sx: r * 0.2, sy: r * 0.38, sz: r * 0.2 });
    for (let i = 0; i < 4; i++) b.add(GEO.sphere, i % 2 ? INK : '#c9c5d4', { x, y: TOP + r * (0.55 + i * 0.12), z: z - r * (1.1 + i * 0.28), sx: r * 0.3, sy: r * 0.3, sz: r * 0.3 });
  }

  function build(view, order, phase) {
    const v = view || {};
    if (!Array.isArray(v.tiles) || !Array.isArray(v.own)) return;
    G = G || makeGeo(v.rows || [6, 7, 6]);
    const kk = JSON.stringify([v.own, v.hall, v.lanes, v.raccoon, v.dice, v.cards, v.deck, phase, order, v.roller]);
    if (kk === key) return;
    key = kk; builds++;
    const bk = JSON.stringify([v.tiles, v.carts]);
    last = v;
    if (bk !== boardKey) { boardKey = bk; drawBoard(v); whenFonts(redraw); }
    built = drop(built);
    const yaw = boardYaw(table, dirOf, order); bg.rotation.y = yaw; bg.updateMatrix();
    const b = new Batcher({ vertexColors: true, castShadow: false });
    // the tray: a dark frame and a lighter lip round the printed meadow
    b.add(GEO.box, '#6e4224', { y: 0.006, sx: S + 0.034, sy: 0.012, sz: D + 0.034 });
    b.add(GEO.box, '#c99a62', { y: 0.0125, sx: S + 0.014, sy: 0.003, sz: D + 0.014 });
    const at = (x, y) => [x * k, y * k];
    const col = s => (order && order[s] !== undefined ? SEAT_COLORS[order[s] % 8] : '#888');
    // lanes: little rails along the sides, an ink base under the seat colour
    v.lanes.forEach((o, e) => {
      if (o < 0) return;
      const E = G.e[e], a = G.v[E.a], c = G.v[E.b], [x1, z1] = at(a.x, a.y), [x2, z2] = at(c.x, c.y);
      const len = Math.hypot(x2 - x1, z2 - z1) * 0.62, ang = Math.atan2(x2 - x1, z2 - z1);
      b.add(GEO.box, INK, { x: (x1 + x2) / 2, y: TOP + k * 0.06, z: (z1 + z2) / 2, sx: k * 0.17, sy: k * 0.1, sz: len + k * 0.04, ry: ang });
      b.add(GEO.box, col(o), { x: (x1 + x2) / 2, y: TOP + k * 0.1, z: (z1 + z2) / 2, sx: k * 0.12, sy: k * 0.06, sz: len, ry: ang });
    });
    // homes, facing the board's front
    v.own.forEach((o, x) => { if (o < 0) return; const [px, pz] = at(G.v[x].x, G.v[x].y); house(b, px, pz, col(o), !!v.hall[x], 0); });
    // Rascal on his field (beside the number sign)
    { const h = G.hex[v.raccoon] || G.hex[0], [rx, rz] = at(h.x + 0.42, h.y - 0.15); raccoon(b, rx, rz); }
    // the dice and the favour deck beside the meadow's front edge
    const dice = Array.isArray(v.dice) && v.dice.length === 2 ? v.dice : [3, 4];
    dice.forEach((n, j) => die(b, -S * 0.36 + j * k * 0.75, D / 2 + k * 0.62, k * 0.5, n, { y: 0, yaw: 0.3 + j * 0.45 + n * 0.21 }));
    const dh = 0.003 + Math.min(24, v.deck || 0) * 0.0007;
    b.add(GEO.box, '#fff1b8', { x: S * 0.36, y: dh / 2, z: D / 2 + k * 0.62, sx: k * 0.6, sy: dh, sz: k * 0.85, ry: 0.1 });
    b.add(GEO.box, '#ffd34d', { x: S * 0.36, y: dh + 0.0006, z: D / 2 + k * 0.62, sx: k * 0.36, sy: 0.001, sz: k * 0.5, ry: 0.1 });
    built = b.build(bg, 'tg-hf-pieces') || [];
    for (const m of built) m.receiveShadow = true;
    // each player's cards: a small fan in front of their chair (in the root, not turned with the board)
    const fb = new Batcher({ vertexColors: true, castShadow: false });
    (order || []).forEach((chair, s) => {
      const n = (v.cards || [])[s] || 0; if (!n) return;
      const a = dirOf(chair), r = clearR(Math.max(S, D), yaw, a, 0.06, 0.03, S * 0.5, Math.max(S * 0.5, edgeOf(chair) - 0.07));
      cardFan(fb, Math.sin(a) * r, Math.cos(a) * r, a, Math.min(9, n), col(s), { w: 0.03, h: 0.044 });
    });
    built = built.concat(fb.build(root, 'tg-hf-fans') || []);
  }
  return {
    root, flying: false,
    update(view, order, phase) { try { build(view, order, phase); } catch (e) { console.error('[tg-hf3d]', e); } },
    tick() {}, slide() {},
    drawn: () => { let m = 0; root.traverse(o => { if (o.isMesh && o.visible) m++; }); return { builds, meshes: m }; },
    dispose() { built = drop(built); root.removeFromParent(); root.traverse(o => o.geometry && o.geometry.dispose()); board.dispose(); },
  };
}
export default { create };
