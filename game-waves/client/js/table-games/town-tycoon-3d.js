// Town Tycoon in 3D on a real table (game-waves): what passers-by see, from the public view only. The ring of 28 spaces
// printed on a wooden tray in the overlay's colours and names (colour bands, the corner and card pictures, the town in the
// middle with the logo), an owner's chip in their seat colour on each bought space (grey when mortgaged), green cottages and
// a red shop on built streets, the two card piles, the dice as last rolled, and a pawn per player still in the game on their
// space (stepping along the ring to a new one). Draws: the printed board, one vertex-colour batch for the board's pieces
// (rebuilt only when the public view changes) and one small batch for the pawns (rebuilt per step while one walks).
import { THREE, Batcher, GEO, SEAT_COLORS, INK, FONT, CREAM, tableBase, boardYaw, sideSpot, canvasMat, whenFonts, svgImg, rr, tray, facePlane, TRAY_TOP, drop, pawn, die, roof } from './tg-kit3d.js';

const SIZE = 28, SIDE = 8; // 8 x 8 cells round the edge: corners at 0, 7, 14, 21
const ST = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const SV = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="160" height="160">${body}</svg>`;
// the overlay's pictures for the corners and the special spaces (town-tycoon-ui.js ART)
const ART = {
  start: `<rect x="6" y="20" width="28" height="14" rx="2" fill="#fff8ec" ${ST}/><path d="M4 21L20 8l16 13z" fill="#e0463c" ${ST}/><rect x="17" y="25" width="6" height="9" fill="#9a6538" ${ST}/><path d="M20 8V2l7 2.5-7 2.5" fill="#ffd34d" ${ST}/>`,
  woods: `<path d="M12 34V26M28 34V26" ${ST}/><path d="M12 4l-9 15h5l-6 9h20l-6-9h5z" fill="#4fa45a" ${ST}/><path d="M28 6l-8 13h4l-5 8h18l-5-8h4z" fill="#2f6b4f" ${ST}/><text x="20" y="38" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}" font-family="Fredoka, sans-serif">?</text>`,
  picnic: `<path d="M4 30h32l-4-10H8z" fill="#e0463c" ${ST}/><path d="M10 20l4 10M18 20l2 10M26 20l-2 10M32 20l-4 10" stroke="#fff8ec" stroke-width="2"/><path d="M14 18c0-6 12-6 12 0z" fill="#9a6538" ${ST}/><circle cx="31" cy="8" r="4" fill="#ffd34d" ${ST}/>`,
  wrong: `<path d="M20 36V10" ${ST} stroke-width="3"/><path d="M8 8h18l5 5-5 5H8z" fill="#ffd34d" ${ST}/><path d="M32 20H16l-5 5 5 5h16z" fill="#e0463c" ${ST}/><path d="M14 13h8" ${ST}/>`,
  lucky: `<path d="M20 5l4.5 9 10 1.5-7.2 7 1.7 10L20 28l-9 4.5 1.7-10-7.2-7 10-1.5z" fill="#ffd34d" ${ST}/>`,
  notice: `<rect x="7" y="6" width="26" height="22" rx="2" fill="#fff8ec" ${ST}/><path d="M12 13h16M12 18h16M12 23h10" ${ST}/><path d="M20 28v8" ${ST} stroke-width="3"/><circle cx="20" cy="6" r="2.5" fill="#e0463c" ${ST}/>`,
  tax: `<path d="M8 22c0-8 24-8 24 0v8H8z" fill="#f3e3c3" ${ST}/><path d="M14 16c-2-6 2-10 6-10s8 4 6 10" fill="none" ${ST}/><path d="M14 26l3-3 3 3 3-3 3 3" fill="none" ${ST}/><circle cx="31" cy="9" r="4.5" fill="#ffd34d" ${ST}/>`,
  transit: `<rect x="5" y="9" width="30" height="19" rx="4" fill="#ffd34d" ${ST}/><rect x="9" y="13" width="7" height="6" fill="#bfe3ff" ${ST}/><rect x="19" y="13" width="7" height="6" fill="#bfe3ff" ${ST}/><circle cx="12" cy="30" r="3.4" fill="${INK}"/><circle cx="28" cy="30" r="3.4" fill="${INK}"/>`,
  van: `<path d="M4 12h20v16H4zM24 17h7l5 5v6H24z" fill="#fff8ec" ${ST}/><path d="M8 16l6 5 6-5" fill="none" stroke="#e0463c" stroke-width="2"/><circle cx="11" cy="30" r="3.4" fill="${INK}"/><circle cx="29" cy="30" r="3.4" fill="${INK}"/>`,
  tool: `<path d="M9 31l13-13" stroke="#9a6538" stroke-width="5" stroke-linecap="round"/><path d="M9 31l13-13" ${ST} fill="none"/><path d="M20 10a7 7 0 0 1 10-4l-5 5 1 3 3 1 5-5a7 7 0 0 1-9 9z" fill="#c9d7e6" ${ST}/>`,
};
const artFor = b => (b.kind === 'transit' ? (String(b.name).startsWith('Mail') ? ART.van : ART.transit) : ART[b.kind] || '');
// short names for the tiles (the overlay's TINY)
const TINY = { 1: 'Maple Ave', 3: 'Acorn Way', 4: 'Pier Walk', 6: 'Bait Shop', 8: 'Strickler Park', 10: 'Duck Pond', 12: 'Angell St', 13: 'Bakery', 15: 'Lake Rufallia', 17: 'Boat-house', 18: 'Summit Rd', 20: 'Lookout', 22: 'Breneland Rd', 23: 'Market', 26: 'Water Tower', 27: 'Clock-tower',
  0: 'Town Square', 2: 'Lucky Find', 5: 'Dog Fund', 7: 'Woods', 9: 'Tool Crib', 11: 'Bus 7', 14: 'Picnic', 16: 'Notice', 19: 'Lucky Find', 21: 'Wrong Turn', 24: 'Mail Van', 25: 'Notice' };
// the middle: the overlay's little town map
const TOWN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="600" height="400" preserveAspectRatio="xMidYMid slice">
<rect width="300" height="200" fill="#bfe0a0"/>
<path d="M0 150c40-10 70 10 110 0s60-30 100-20 60 20 90 10V200H0z" fill="#8fd0f0" stroke="${INK}" stroke-width="2"/>
<path d="M-5 95h310M150 -5v210M60 95c0 30 20 50 30 105M230 95c-10-40 0-70 30-100" fill="none" stroke="#f3e3c3" stroke-width="10"/>
<path d="M-5 95h310M150 -5v210M60 95c0 30 20 50 30 105M230 95c-10-40 0-70 30-100" fill="none" stroke="#e8d3a8" stroke-width="2" stroke-dasharray="6 6"/>
<g stroke="${INK}" stroke-width="2" stroke-linejoin="round">
<rect x="20" y="55" width="26" height="22" fill="#fff8ec"/><path d="M17 57l16-14 16 14z" fill="#e0463c"/>
<rect x="100" y="60" width="22" height="18" fill="#fff8ec"/><path d="M97 62l14-12 14 12z" fill="#3f6fd9"/>
<rect x="170" y="110" width="26" height="20" fill="#fff8ec"/><path d="M167 112l16-13 16 13z" fill="#f2b630"/>
<rect x="250" y="112" width="22" height="18" fill="#fff8ec"/><path d="M247 114l14-12 14 12z" fill="#4fa45a"/>
<rect x="196" y="20" width="10" height="40" fill="#c9d7e6"/><ellipse cx="201" cy="22" rx="16" ry="10" fill="#c9d7e6"/>
<circle cx="80" cy="30" r="10" fill="#4fa45a"/><circle cx="95" cy="22" r="8" fill="#2f6b4f"/><circle cx="270" cy="60" r="10" fill="#4fa45a"/>
<circle cx="120" cy="125" r="9" fill="#4fa45a"/><circle cx="30" cy="125" r="8" fill="#2f6b4f"/>
</g></svg>`;

// the cells round the edge as the overlay lays them out (8 x 8): [column, row] and the side each is on
const CELLS = (() => {
  const c = [];
  for (let x = 0; x < SIDE; x++) c.push([x, 0, 'top']);
  for (let y = 1; y < SIDE; y++) c.push([SIDE - 1, y, 'right']);
  for (let x = SIDE - 2; x >= 0; x--) c.push([x, SIDE - 1, 'bottom']);
  for (let y = SIDE - 2; y >= 1; y--) c.push([0, y, 'left']);
  return c.map(([x, y, side], i) => ({ x, y, side: i % 7 === 0 ? 'corner' : side, rot: { top: Math.PI, right: -Math.PI / 2, bottom: 0, left: Math.PI / 2 }[side] }));
})();

export function create(parent, table) {
  const { root, S, dirOf } = tableBase(parent, table, 'tg-tt');
  const C = S / SIDE, board = canvasMat(1024, 1024);
  const bg = new THREE.Group(); root.add(bg);
  facePlane(bg, board.mat, S, 'tg-tt-board');
  let built = [], pawnsBuilt = [], key = '', boardKey = '', builds = 0, lastBoard = null;
  const walk = { shown: [], target: [], t: 0 }; let pawnView = null, pawnOrder = null, pawnPhase = '';
  // a cell's middle in board metres, and a point in it: u along the edge (-0.5..0.5), w from its outer edge (0) inward (1)
  const cellXY = i => { const c = CELLS[i]; return [-S / 2 + (c.x + 0.5) * C, -S / 2 + (c.y + 0.5) * C]; };
  function inCell(i, u, w) {
    const c = CELLS[i], [x, z] = cellXY(i);
    if (c.side === 'corner') return [x + u * C, z + (w - 0.5) * C * (c.y === 0 ? -1 : 1)];
    const d = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[c.side]; // outward
    const t = [-d[1], d[0]]; // along
    return [x + t[0] * u * C + d[0] * (0.5 - w) * C, z + t[1] * u * C + d[1] * (0.5 - w) * C];
  }

  function drawBoard(B, groups) {
    const g = board.g, W = 1024, c = W / SIDE;
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, W, W);
    // the middle: the town, the logo
    const town = svgImg(TOWN, () => drawBoard(B, groups));
    const mx = c, my = c, mw = W - 2 * c;
    if (town) { g.save(); g.beginPath(); g.rect(mx, my, mw, mw); g.clip(); g.drawImage(town, mx - mw * 0.25, my, mw * 1.5, mw); g.restore(); } else { g.fillStyle = '#bfe0a0'; g.fillRect(mx, my, mw, mw); }
    g.lineWidth = 6; g.strokeStyle = INK; g.strokeRect(mx, my, mw, mw);
    g.save(); g.translate(W / 2, W * 0.33); g.rotate(-0.07);
    rr(g, -170, -62, 340, 124, 22); g.fillStyle = 'rgba(43,35,64,0.85)'; g.save(); g.translate(0, 8); g.fill(); g.restore();
    rr(g, -170, -62, 340, 124, 22); g.fillStyle = '#ffd34d'; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 56px ${FONT}`; g.fillText('TOWN', 0, -24); g.fillText('TYCOON', 0, 30);
    g.restore();
    // the spaces
    for (let i = 0; i < SIZE; i++) {
      const b = B[i] || {}, cl = CELLS[i], corner = cl.side === 'corner';
      g.save(); g.translate(cl.x * c + c / 2, cl.y * c + c / 2); g.rotate(corner ? (cl.y === 0 ? Math.PI : 0) : cl.rot);
      g.fillStyle = corner ? (b.kind === 'start' ? '#ffe08a' : '#fff1b8') : CREAM; g.fillRect(-c / 2, -c / 2, c, c);
      // (local frame: the board's edge at +y, the middle at -y)
      if (b.kind === 'street' && groups[b.group]) { g.fillStyle = groups[b.group].color; g.fillRect(-c / 2, -c / 2, c, c * 0.28); g.lineWidth = 4; g.strokeStyle = INK; g.beginPath(); g.moveTo(-c / 2, -c / 2 + c * 0.28); g.lineTo(c / 2, -c / 2 + c * 0.28); g.stroke(); }
      else { const im = svgImg(SV(artFor(b)), () => drawBoard(B, groups)); const s = corner ? c * 0.62 : c * 0.46; if (im) g.drawImage(im, -s / 2, -c / 2 + (corner ? c * 0.06 : c * 0.05), s, s); }
      const name = TINY[i] || b.short || b.name || '', words = name.split(' ');
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = corner ? 25 : 23; g.font = `700 ${fs}px ${FONT}`;
      const lines = words.length > 1 && g.measureText(name).width > c * 0.9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
      const y0 = corner ? c * 0.3 : b.kind === 'street' ? c * 0.02 : c * 0.12;
      lines.forEach((t, k) => g.fillText(t, 0, y0 + (k - (lines.length - 1) / 2) * fs * 1.05, c * 0.94));
      if (b.price && b.kind !== 'tax' && !corner) { g.font = `600 19px ${FONT}`; g.fillStyle = '#6b5e52'; g.fillText('B' + b.price, 0, c * 0.37); }
      g.lineWidth = 4; g.strokeStyle = INK; g.strokeRect(-c / 2, -c / 2, c, c);
      g.restore();
    }
    g.lineWidth = 10; g.strokeStyle = INK; g.strokeRect(5, 5, W - 10, W - 10);
    board.dirty();
  }

  // a cottage (green) or the shop (red), standing on the street's colour band
  function house(b, x, z, yaw, shop) {
    const y = TRAY_TOP, w = shop ? C * 0.42 : C * 0.19, h = shop ? C * 0.24 : C * 0.17;
    b.add(GEO.box, shop ? '#e0463c' : '#7ddc7a', { x, y: y + h / 2, z, sx: w, sy: h, sz: C * 0.17, ry: yaw });
    roof(b, shop ? '#a8302a' : '#3f9a4a', x, y + h, z, C * 0.21, w * 1.12, h * 0.75, yaw + Math.PI / 2);
  }

  function build(view, order, phase) {
    const v = view || {};
    const k = JSON.stringify([v.owner, v.lvl, v.mort, v.dice, v.decks, v.turn, phase, order, v.alive]);
    if (k !== key) {
      key = k; builds++;
      const B = Array.isArray(v.board) ? v.board : [], groups = Array.isArray(v.groups) ? v.groups : [];
      const bk = JSON.stringify([B.map(b => [b.name, b.kind, b.group, b.price]), groups.map(g2 => g2.color)]);
      if (bk !== boardKey) { boardKey = bk; lastBoard = [B, groups]; drawBoard(B, groups); whenFonts(() => drawBoard(...lastBoard)); }
      built = drop(built);
      const yaw = boardYaw(table, dirOf, order); bg.rotation.y = yaw; bg.updateMatrix();
      const b = new Batcher({ vertexColors: true, castShadow: false });
      tray(b, S, { frame: '#6e4224', lip: '#c99a62' });
      const own = v.owner || [], lvl = v.lvl || [], mort = v.mort || [];
      for (let i = 0; i < SIZE; i++) {
        const cl = CELLS[i], ry = cl.side === 'corner' ? 0 : -cl.rot;
        if (own[i] >= 0 && order && order[own[i]] !== undefined) {
          const [x, z] = inCell(i, 0.33, 0.14), col = mort[i] ? '#9b948c' : SEAT_COLORS[order[own[i]] % 8];
          b.add(GEO.cyl12, INK, { x, y: TRAY_TOP + 0.0015, z, sx: C * 0.15, sy: 0.003, sz: C * 0.15 });
          b.add(GEO.cyl12, col, { x, y: TRAY_TOP + 0.003, z, sx: C * 0.12, sy: 0.003, sz: C * 0.12 });
        }
        const L = lvl[i] | 0;
        if (L >= 5) { const [x, z] = inCell(i, 0, 0.86); house(b, x, z, ry, true); }
        else for (let j = 0; j < L; j++) { const [x, z] = inCell(i, (j - (L - 1) / 2) * 0.22, 0.86); house(b, x, z, ry, false); }
      }
      // the two card piles in the middle (Lucky Find gold, Town Notice cream), as high as they hold cards
      const decks = v.decks || {};
      [[decks.lucky, '#ffd34d', -1], [decks.notice, CREAM, 1]].forEach(([cnt, col, s]) => {
        const hgt = 0.003 + Math.min(16, cnt || 0) * 0.0007, x = s * S * 0.14, z = S * 0.06;
        b.add(GEO.box, col, { x, y: TRAY_TOP + hgt / 2, z, sx: C * 0.75, sy: hgt, sz: C * 1.05, ry: s * 0.12 });
        b.add(GEO.box, s < 0 ? '#e0a92a' : '#e9dcc0', { x, y: TRAY_TOP + hgt + 0.0006, z, sx: C * 0.5, sy: 0.001, sz: C * 0.75, ry: s * 0.12 });
      });
      // the dice as last rolled
      const dice = Array.isArray(v.dice) && v.dice.length === 2 ? v.dice : [3, 4];
      dice.forEach((n, j) => die(b, (j - 0.5) * C * 0.85, S * 0.2, C * 0.5, n, { y: TRAY_TOP, yaw: 0.35 + j * 0.5 + n * 0.21 }));
      built = b.build(bg, 'tg-tt-pieces') || [];
      for (const m of built) m.receiveShadow = true;
    }
    // the pawns walk to their spaces in tick
    pawnView = v; pawnOrder = order; pawnPhase = phase;
    const pos = v.pos || [];
    let moved = false;
    for (let s = 0; s < pos.length; s++) {
      if (walk.shown[s] === undefined || !Number.isInteger(walk.shown[s])) { walk.shown[s] = pos[s]; moved = true; }
      if (walk.target[s] !== pos[s]) { walk.target[s] = pos[s]; const fwd = (pos[s] - walk.shown[s] + SIZE) % SIZE; if (fwd > 12) walk.shown[s] = pos[s]; moved = true; }
    }
    if (moved || !pawnsBuilt.length || pawnKey() !== lastPawnKey) buildPawns();
  }
  let lastPawnKey = '';
  const pawnKey = () => JSON.stringify([walk.shown, pawnView && pawnView.alive, pawnView && pawnView.turn, pawnPhase, pawnOrder]);
  function buildPawns() {
    lastPawnKey = pawnKey();
    pawnsBuilt = drop(pawnsBuilt);
    const v = pawnView || {}, order = pawnOrder || [], b = new Batcher({ vertexColors: true, castShadow: false });
    const at = new Map();
    for (let s = 0; s < order.length; s++) { if (v.alive && !v.alive[s]) continue; const p = walk.shown[s]; if (!Number.isInteger(p)) continue; if (!at.has(p)) at.set(p, []); at.get(p).push(s); }
    for (const [p, list] of at) list.forEach((s, j) => {
      const u = list.length === 1 ? 0 : (j % 2 ? 0.2 : -0.2), w = list.length <= 2 ? 0.45 : (j < 2 ? 0.32 : 0.6);
      const [x, z] = inCell(p, list.length <= 2 ? (j - (list.length - 1) / 2) * 0.4 : u, w), turn = s === v.turn && pawnPhase === 'play';
      if (turn) b.add(GEO.cyl12, '#ffd34d', { x, y: TRAY_TOP + 0.001, z, sx: C * 0.22, sy: 0.002, sz: C * 0.22 });
      pawn(b, x, z, SEAT_COLORS[order[s] % 8], { h: C * 0.78, y: TRAY_TOP + (turn ? 0.003 : 0), ring: CREAM });
    });
    pawnsBuilt = b.build(bg, 'tg-tt-pawns') || [];
  }
  function tick(dt) {
    let any = false;
    for (let s = 0; s < walk.target.length; s++) if (Number.isInteger(walk.target[s]) && walk.shown[s] !== walk.target[s]) any = true;
    if (!any) { walk.t = 0; return; }
    walk.t += dt; if (walk.t < 0.17) return; walk.t = 0;
    for (let s = 0; s < walk.target.length; s++) if (Number.isInteger(walk.target[s]) && walk.shown[s] !== walk.target[s]) walk.shown[s] = (walk.shown[s] + 1) % SIZE;
    buildPawns();
  }
  return {
    root, flying: false,
    update(view, order, phase) { try { build(view, order, phase); } catch (e) { console.error('[tg-tt3d]', e); } },
    tick(dt) { try { tick(dt || 0); } catch (e) { console.error('[tg-tt3d]', e); } }, slide() {},
    drawn: () => { let m = 0; root.traverse(o => { if (o.isMesh && o.visible) m++; }); return { builds, meshes: m }; },
    dispose() { built = drop(built); pawnsBuilt = drop(pawnsBuilt); root.removeFromParent(); root.traverse(o => o.geometry && o.geometry.dispose()); board.dispose(); },
  };
}
export default { create };
