// Pillow Forts in 3D on a real table (game-waves): what passers-by see, from the public view only. The giant house printed on a
// long wooden tray (the overlay's cutaway: sky, roof, the floors in their region colours, the yards, the zip line, every area
// with its name, the ladders, stairs and doors), on each area a coloured mat and a little pile of pillows in its crew's seat
// colour (as high as the count, two by two; the Teddies' piles brown with a bear on top), and the last pillow fight's dice
// on the roof slopes (the attacker's left, the defender's right). Draws: the printed board, and one vertex-colour batch for
// the tray and every piece, rebuilt only when the public view changes.
import { THREE, Batcher, GEO, SEAT_COLORS, INK, FONT, CREAM, tableBase, boardYaw, canvasMat, whenFonts, rr, drop, die } from './tg-kit3d.js';

const TEDDY_COL = '#a8794e';
const CW = 1024, CH = 600; // the printed face (canvas px); the board is as long as this is
const LINK_ART = {
  ladder: g => { g.strokeStyle = '#6e4224'; g.lineWidth = 3; for (const x of [-4, 4]) { g.beginPath(); g.moveTo(x, -9); g.lineTo(x, 9); g.stroke(); } for (const y of [-5, 0, 5]) { g.beginPath(); g.moveTo(-4, y); g.lineTo(4, y); g.stroke(); } },
  stairs: g => { g.strokeStyle = '#6e4224'; g.lineWidth = 3; g.beginPath(); g.moveTo(-8, 8); g.lineTo(-4, 8); g.lineTo(-4, 3); g.lineTo(0, 3); g.lineTo(0, -2); g.lineTo(4, -2); g.lineTo(4, -7); g.lineTo(8, -7); g.stroke(); },
  steps: g => { g.strokeStyle = '#5d5470'; g.lineWidth = 3; g.beginPath(); g.moveTo(-8, 8); g.lineTo(-4, 8); g.lineTo(-4, 3); g.lineTo(0, 3); g.lineTo(0, -2); g.lineTo(4, -2); g.lineTo(4, -7); g.lineTo(8, -7); g.stroke(); },
  door: g => { g.fillStyle = '#c9824a'; g.fillRect(-5, -9, 10, 18); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-5, -9, 10, 18); },
  window: g => { g.fillStyle = '#bfe3ff'; g.fillRect(-7, -7, 14, 14); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-7, -7, 14, 14); g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 7); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke(); },
  slide: g => { g.strokeStyle = '#e0463c'; g.lineWidth = 4; g.beginPath(); g.moveTo(-8, -8); g.bezierCurveTo(0, -8, 0, 8, 8, 8); g.stroke(); },
};

// the overlay's layout: 8 columns x 4 rows under a band for the zip line
function layOf(W, H) {
  const top = Math.round(H * 0.075), cw = W / 8, ch = (H - top) / 4;
  return { W, H, top, cw, ch };
}
function tileRect(L, a) {
  const yard = a.c === 0 || a.c === 7, ix = (yard ? 3 : 2) * 2.2, it = (a.r === 0 ? 4 : 5) * 2.2, ib = 2 * 2.2;
  return { x: a.c * L.cw + ix, y: L.top + a.r * L.ch + it, w: L.cw - 2 * ix, h: L.ch - it - ib };
}

export function create(parent, table) {
  const { root, S, dirOf } = tableBase(parent, table, 'tg-pf');
  const BW = S * 1.22, BD = BW * CH / CW;
  const face = canvasMat(CW, CH);
  const bg = new THREE.Group(); root.add(bg);
  { // the printed face, flat on the tray (canvas top = -z)
    const g = new THREE.PlaneGeometry(BW, BD); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, face.mat); m.position.y = 0.016; m.name = 'tg-pf-board'; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
    bg.add(m);
  }
  const TOP = 0.016;
  let built = [], key = '', boardKey = '', builds = 0, lastMap = null;
  const L = layOf(CW, CH);
  const at = (px, py) => [(px / CW - 0.5) * BW, (py / CH - 0.5) * BD];

  function drawBoard(map) {
    const g = face.g, { W, H, top, cw, ch } = L, R = map.regions;
    g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, top + ch * 1.5); sky.addColorStop(0, '#a9dcf7'); sky.addColorStop(1, '#dff3ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#9fd47e'; g.fillRect(0, top + ch, cw, H); g.fillRect(cw * 7, top + ch, cw, H);
    g.beginPath(); g.moveTo(cw * 0.75, top + ch + 4); g.lineTo(cw * 2, top - 6); g.lineTo(cw * 6, top - 6); g.lineTo(cw * 7.25, top + ch + 4); g.closePath();
    g.fillStyle = '#c0563f'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    g.fillStyle = R[0].color; g.fillRect(cw * 2, top, cw * 4, ch);
    for (let r = 1; r <= 3; r++) { g.fillStyle = R[r].color; g.fillRect(cw, top + ch * r, cw * 6, ch); }
    g.fillStyle = '#7a5230'; g.fillRect(cw * 0.42, top + ch * 0.45, cw * 0.16, ch * 0.6);
    g.fillStyle = '#4fa45a'; g.strokeStyle = INK; g.lineWidth = 4;
    g.beginPath(); g.ellipse(cw * 0.5, top + ch * 0.4, cw * 0.38, ch * 0.34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.lineWidth = 6; g.strokeRect(cw, top + ch, cw * 6, ch * 3);
    g.fillStyle = '#9a6538';
    for (let r = 1; r <= 3; r++) g.fillRect(r === 1 ? cw * 2 : cw, top + ch * r - 5, r === 1 ? cw * 4 : cw * 6, 10);
    g.beginPath(); g.moveTo(cw * 0.55, top + ch * 0.75); g.bezierCurveTo(cw * 2.4, top * 0.05, cw * 5.6, top * 0.05, cw * 7.45, top + ch * 0.75);
    g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
    // the areas: a cream tile with the name at its top (the crew's mat and pillows stand on the rest)
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const a of map.areas) {
      const r = tileRect(L, a);
      rr(g, r.x, r.y, r.w, r.h, 14); g.fillStyle = CREAM; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; let fs = 22; g.font = `700 ${fs}px ${FONT}`;
      while (fs > 13 && g.measureText(a.short).width > r.w - 10) { fs--; g.font = `700 ${fs}px ${FONT}`; }
      g.fillText(a.short, r.x + r.w / 2, r.y + 17, r.w - 8);
    }
    // the ways between floors and to the yards
    for (const [x, y, kind] of map.links) {
      if (!LINK_ART[kind]) continue;
      const a = map.areas[x], b = map.areas[y];
      const cx = a.c === b.c ? cw * (a.c + 0.8) : cw * Math.max(a.c, b.c), cy = a.c === b.c ? top + ch * Math.max(a.r, b.r) : top + ch * (a.r + 0.84);
      g.save(); g.translate(cx, cy); g.beginPath(); g.arc(0, 0, 15, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      g.scale(1.15, 1.15); LINK_ART[kind](g); g.restore();
    }
    // the regions' names and bonuses
    const tag = (k, x, y) => {
      const t = R[k].short + ' +' + R[k].bonus; g.font = `700 19px ${FONT}`; const w = g.measureText(t).width + 18;
      const x0 = Math.max(4, Math.min(W - w - 4, x - w / 2));
      rr(g, x0, y - 13, w, 26, 12); g.fillStyle = R[k].color; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.fillText(t, x0 + w / 2, y + 1);
    };
    tag(0, cw * 4, top - 4); tag(1, cw * 1.6, top + ch - 2); tag(2, cw * 1.6, top + ch * 2 - 2); tag(3, cw * 1.6, top + ch * 3 - 2);
    tag(4, cw * 0.5, top + ch - 34); tag(5, cw * 7.5, top + ch - 34);
    g.lineWidth = 10; g.strokeStyle = INK; g.strokeRect(5, 5, W - 10, H - 10);
    face.dirty();
  }

  // a pillow: a squashed ball with a little ridge, lying along yaw
  function pillow(b, x, y, z, w, col, yaw) {
    b.add(GEO.sphere, col, { x, y: y + w * 0.2, z, sx: w * 0.52, sy: w * 0.2, sz: w * 0.38, ry: yaw });
    b.add(GEO.box, col, { x, y: y + w * 0.18, z, sx: w * 0.86, sy: w * 0.26, sz: w * 0.6, ry: yaw });
  }
  const shade = (hex, t) => { const p = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)); return '#' + p.map(x => Math.round(x + (255 - x) * t).toString(16).padStart(2, '0')).join(''); };
  function build(view, order, phase) {
    const v = view || {}, map = v.map;
    if (!map || !Array.isArray(map.areas)) return;
    const last = v.last ? [v.last.no, v.last.seat, v.last.def, v.last.a, v.last.d] : null;
    const k = JSON.stringify([v.owner, v.pillows, last, order, phase, v.alive]);
    if (k === key) return;
    key = k; builds++;
    const bk = JSON.stringify([map.areas.map(a => [a.short, a.c, a.r]), map.regions.map(r => [r.short, r.bonus, r.color])]);
    if (bk !== boardKey) { boardKey = bk; lastMap = map; drawBoard(map); whenFonts(() => drawBoard(lastMap)); }
    built = drop(built);
    const yaw = boardYaw(table, dirOf, order); bg.rotation.y = yaw; bg.updateMatrix();
    const b = new Batcher({ vertexColors: true, castShadow: false });
    // the long tray
    b.add(GEO.box, '#6e4224', { y: 0.006, sx: BW + 0.034, sy: 0.012, sz: BD + 0.034 });
    b.add(GEO.box, '#c99a62', { y: 0.0125, sx: BW + 0.014, sy: 0.003, sz: BD + 0.014 });
    const colOf = o => (o < 0 ? TEDDY_COL : order && order[o] !== undefined ? SEAT_COLORS[order[o] % 8] : '#9b948c');
    const own = v.owner || [], pil = v.pillows || [], pw = BW / 8 * 0.36;
    for (const a of map.areas) {
      const i = a.i, o = own[i], n = Math.max(0, pil[i] | 0), r = tileRect(L, a);
      const [cx, cz] = at(r.x + r.w / 2, r.y + r.h * 0.6);
      const col = colOf(o);
      // the crew's mat: a ring in its colour
      b.add(GEO.cyl12, INK, { x: cx, y: TOP + 0.0008, z: cz, sx: pw * 1.32, sy: 0.0016, sz: pw * 0.92 });
      b.add(GEO.cyl12, col, { x: cx, y: TOP + 0.0016, z: cz, sx: pw * 1.24, sy: 0.0016, sz: pw * 0.84 });
      b.add(GEO.cyl12, CREAM, { x: cx, y: TOP + 0.0022, z: cz, sx: pw * 1.0, sy: 0.0012, sz: pw * 0.62 });
      // the pile, two by two, as high as the count (12 at most shown), every other layer lighter
      const shown = Math.min(12, n), lh = pw * 0.33;
      for (let q = 0; q < shown; q++) {
        const layer = q >> 1, side = shown - q === 1 && q % 2 === 0 ? 0 : (q % 2 ? 0.5 : -0.5);
        const jx = Math.sin(i * 3.1 + q * 1.7) * pw * 0.05, jy = (q * 0.37 + i) % 1 - 0.5;
        pillow(b, cx + side * pw * 1.12 + jx, TOP + 0.0028 + layer * lh, cz + (layer % 2 ? 0.06 : -0.04) * pw, pw * 1.22, layer % 2 ? shade(col, 0.32) : col, jy * 0.4 + (layer % 2) * 0.2);
      }
      if (o < 0) { // a teddy keeps watch on top
        const y = TOP + 0.0028 + Math.ceil(shown / 2) * lh + pw * 0.1;
        b.add(GEO.sphere, TEDDY_COL, { x: cx, y: y + pw * 0.18, z: cz, sx: pw * 0.2, sy: pw * 0.2, sz: pw * 0.2 });
        for (const s of [-1, 1]) b.add(GEO.sphere, '#8a6040', { x: cx + s * pw * 0.15, y: y + pw * 0.34, z: cz, sx: pw * 0.08, sy: pw * 0.08, sz: pw * 0.06 });
      }
    }
    // the last pillow fight's dice on the roof slopes: the attacker's left, the defender's right
    if (v.last && Array.isArray(v.last.a)) {
      const ds = pw * 0.55;
      v.last.a.forEach((n, j) => { const [x, z] = at(L.cw * 1.25 + j * 0, L.top + L.ch * (0.2 + j * 0.26)); die(b, x + (j % 2) * ds * 0.5, z, ds, n, { y: TOP, yaw: 0.3 + j * 0.7 + n * 0.2, body: colOf(v.last.seat) }); });
      v.last.d.forEach((n, j) => { const [x, z] = at(L.cw * 6.75, L.top + L.ch * (0.3 + j * 0.32)); die(b, x - (j % 2) * ds * 0.5, z, ds, n, { y: TOP, yaw: -0.4 - j * 0.6 + n * 0.2, body: colOf(v.last.def) }); });
    }
    built = b.build(bg, 'tg-pf-pieces') || [];
    for (const m of built) m.receiveShadow = true;
  }
  return {
    root, flying: false,
    update(view, order, phase) { try { build(view, order, phase); } catch (e) { console.error('[tg-pf3d]', e); } },
    tick() {}, slide() {},
    drawn: () => { let m = 0; root.traverse(o => { if (o.isMesh && o.visible) m++; }); return { builds, meshes: m }; },
    dispose() { built = drop(built); root.removeFromParent(); root.traverse(o => o.geometry && o.geometry.dispose()); face.dispose(); },
  };
}
export default { create };
