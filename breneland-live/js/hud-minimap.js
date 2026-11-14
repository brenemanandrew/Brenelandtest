// The minimap and the big map (a popout over the minimap, under the top bar's buttons: N, a tap on the minimap, or R2 on a pad.
// Esc, N, its X or B close it, and you can keep walking while it's open). The map is painted ONCE from layout.js into an offscreen
// canvas (lakes and shore, roads with sidewalks, trails, fences and gates, the house, the pier and the shack, the town's houses and
// shops, the water tower, the park and the woods, the game plazas and named places). Every few frames the minimap copies the part
// round the player (north up, player centred) and draws the live dots on top: you (with a heading), other players (their colour,
// their initial), Dax and Nala (paws), Kevin (a K). After dark the map is tinted night-blue.
import {
  LAKES, MAP, WALK, HOUSE, PORCH, DOCK, FENCES, GATES, MAILBOX, FISH_SHACK, ROADS, SIDEWALK_W, NEIGHBORHOODS, SHOPS, GAME_STORE, STRIP_MALL,
  WATER_TOWER, BUS_STOP, BUS_TUNNEL, MAIL_OFFICE, PARK, WOODS_X, WOODS_WEST, WOODS_SOUTH, GLADE, SCOUT_CAMP, TENT, TRAILS, YARD_TREES, SWING_TREE, BOCCE, BOOTH, PARK_LOT, LOVECRAFT_HOUSE, resolveTrail,
} from './layout.js';
import { PLAN as GARDEN_PLAN } from './garden-build.js';
import { FRISBEE_FIELD, HEDGE, HEDGES, VAN_STOP, TOOL_CRIB, SUMMIT_SQUARE } from './layout.js';
import { TOWN_HOUSES } from './world-town.js';
import { LIGHT } from './daynight-mats.js';
import { smoothPath } from './util.js';
import { SWING_FRAME, pitOutline, hillXZ } from './swing-hill.js';

const SCALE = 3;                    // base canvas pixels per metre
const MINI_K = 2.6;                 // minimap pixels per metre (about 90 m across)
const FPS_DIV = 2;                  // repaint the minimap every other frame
const INK = '#2b2340';
const C = {
  grass: '#86c75c', park: '#79bd54', woods0: '#5f9f45', woods1: '#2f5c35', edge: '#44703d',
  water: '#5fb3e6', shore: '#eedaa4', deep: '#4a9fd8',
  tar: '#8e8b90', walk: '#dcd5c6', trail: '#cfae72', lot: '#d9e6b0',
  house: '#e9b27c', roof: '#c9534a', porch: '#b98a5a', wood: '#a97c4f', fence: '#b98a52',
  town: '#efe3c8', roofs: ['#c9534a', '#3f6ea8', '#6b8a4a', '#8a5a9a', '#d0894a'],
};
// (town-fixes: exported for the label test; a newline (NL) in a name stacks it on two lines)
const NL = String.fromCharCode(10);
export const LABELS = [
  ['Lake Tamakiya', 140, -100, 9], ['Lake Rufallia', 40, 120, 9], ['Strickler Park', -96, -18, 7], ['The Woods', -196, 66, 7],
  ['Maple Row', -22, -90, 6], ['Summit Hill', 0, -150, 6], ['The Shops', -162, -112, 5], ['Breneland Rd', -40, -46, 4.5],
  // (strip-mall) the two stores' names over the building (the lot's label, The Shops, is east of it by the square)
  ['Summit Slice', (STRIP_MALL.units.pizza.minX + STRIP_MALL.units.pizza.maxX) / 2, STRIP_MALL.maxZ + 3.2, 3.6], ['Peak Threads', (STRIP_MALL.units.clothes.minX + STRIP_MALL.units.clothes.maxX) / 2, STRIP_MALL.maxZ + 3.2, 3.6],
  ['Summit Rd', 20, -126.5, 4.5], ['Scout Camp', SCOUT_CAMP.x, SCOUT_CAMP.z - 11, 4.5], ['Water Tower', WATER_TOWER.x, WATER_TOWER.z - 12, 4.5],
  ['Old Swing Tree', SWING_TREE.x, SWING_TREE.z + 8, 4.5], ['Bocce', BOCCE.x, BOCCE.z - 12, 4.5], ['Oyster Cove', 8, 24, 4.5], ['Fish Shack', FISH_SHACK.x, FISH_SHACK.z - 5, 4], ['Frisbee Field', FRISBEE_FIELD.x, FRISBEE_FIELD.z, 3.6],
  ['Bus Stop', BUS_STOP.shelter.x - 1, BUS_STOP.shelter.z - 7.5, 4.5], ['Post Office', MAIL_OFFICE.x - 3, MAIL_OFFICE.z - MAIL_OFFICE.d / 2 - 3, 4.5], ['Tunnel', BUS_TUNNEL.x + 6, BUS_TUNNEL.z - 7.5, 4],
  ['Mama Carol', BOOTH.x - 3, BOOTH.z + 5.5, 4], ['Glade', GLADE.x, GLADE.z - GLADE.r - 2.5, 4], ['Lovecraft House', LOVECRAFT_HOUSE.x - 1, LOVECRAFT_HOUSE.lot.maxZ + 1.6, 4],
  ['Tool Crib', TOOL_CRIB.x, TOOL_CRIB.z - (TOOL_CRIB.door === 'south' ? 1 : -1) * (TOOL_CRIB.d / 2 + 2.2), 4], // (behind the building: in front is the road's label)
  // (town-fixes) on two lines over the square itself: south of it the Bus Stop's name ran into it on a phone
  [SUMMIT_SQUARE.name.replace(' ', NL), (SUMMIT_SQUARE.minX + SUMMIT_SQUARE.maxX) / 2, SUMMIT_SQUARE.shelter.z, 4],
];

export function createMinimap(ctx) {
  const { player, remotes, npcs, areas, world, input } = ctx;
  const W = (MAP.maxX - MAP.minX) * SCALE, H = (MAP.maxZ - MAP.minZ) * SCALE;
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  paintBase(base.getContext('2d'), { areas, forest: world.forest || [] });

  const wrap = document.getElementById('minimap');
  const cv = document.getElementById('minimap-canvas');
  // drawn through an OffscreenCanvas where the browser has one: a canvas in the page resolves its font against the page's style, and
  // the HUD's style changes every frame, so each paint's first letter forced a style recalculation (~0.3 ms a frame). Same calls,
  // same pixels.
  let surf = cv;
  try { if (cv.transferControlToOffscreen && typeof OffscreenCanvasRenderingContext2D !== 'undefined') surf = cv.transferControlToOffscreen(); } catch { surf = cv; }
  const g = surf.getContext('2d');
  const overlay = document.getElementById('map');
  const big = document.getElementById('map-canvas');
  const bg = big.getContext('2d');
  let frame = 0, cw = 0, ch = 0, dpr = 1;
  let kevin = null, kevinLook = 0;
  try { document.fonts.addEventListener('loadingdone', () => { g._font = null; bg._font = null; }); } catch { /* no FontFaceSet */ }

  // the box's size, read only when it changes (getBoundingClientRect every other frame forced a layout each time)
  let boxW = 0, boxH = 0, boxRead = false;
  try { new ResizeObserver(() => { boxRead = false; }).observe(wrap); } catch { /* no ResizeObserver: read it every time */ }
  function fit() {
    if (!boxRead || typeof ResizeObserver === 'undefined') { const r = wrap.getBoundingClientRect(); boxW = r.width; boxH = r.height; boxRead = boxW > 0; }
    const w = Math.max(60, Math.round(boxW)), h = Math.max(60, Math.round(boxH));
    dpr = Math.min(2, devicePixelRatio || 1);
    if (w === cw && h === ch && surf.width === Math.round(w * dpr)) return;
    cw = w; ch = h; surf.width = Math.round(w * dpr); surf.height = Math.round(h * dpr); g._font = null;
  }

  // Paint the map centred on world (cx, cz) at k px/m into a (w x h) context, then the live dots.
  function draw(g2, w, h, k, cx, cz, { you = true, labelsK = 1 } = {}) {
    g2.fillStyle = C.edge; g2.fillRect(0, 0, w, h);
    const sx = (MAP.minX - cx) * k + w / 2, sy = (MAP.minZ - cz) * k + h / 2;
    g2.drawImage(base, 0, 0, W, H, sx, sy, (W / SCALE) * k, (H / SCALE) * k);
    const night = LIGHT.night || 0;
    if (night > 0.02) { g2.fillStyle = `rgba(22, 24, 70, ${(0.5 * night).toFixed(3)})`; g2.fillRect(0, 0, w, h); }
    const X = x => (x - cx) * k + w / 2, Z = z => (z - cz) * k + h / 2;
    const r = Math.max(4, Math.min(8, 2.4 * labelsK * k));
    // Dax and Nala: paws
    for (const d of npcs.npcs) {
      if (d.kind !== 'dog' || !d.body.root.visible) continue;
      const p = d.body.root.position;
      paw(g2, X(p.x), Z(p.z), r * 0.9, d.name === 'Nala' ? '#d9a066' : '#8a5a3a');
    }
    // Kevin
    if (!kevin || !kevin.body.root.parent) { if (!kevinLook--) { kevinLook = 60; kevin = npcs.npcs.find(d => d.name === 'Kevin') || null; } }
    if (kevin && kevin.body.root.visible) { const p = kevin.body.root.position; dot(g2, X(p.x), Z(p.z), r, '#5a4230', 'K', '#fff4dc'); }
    // other players: their colour and initial
    for (const rp of remotes.map.values()) {
      const p = rp.ch.root.position;
      dot(g2, X(p.x), Z(p.z), r, rp.color || '#3f8fd9', (rp.name || '?').trim().charAt(0).toUpperCase(), '#fff');
    }
    // you: a yellow arrow pointing the way you face
    if (you) {
      const px = X(player.pos.x), pz = Z(player.pos.z), a = player.yaw;
      const dx = Math.sin(a), dz = Math.cos(a);
      g2.save(); g2.translate(px, pz); g2.rotate(Math.atan2(dx, -dz));
      g2.beginPath(); g2.moveTo(0, -r * 1.9); g2.lineTo(r * 1.25, r * 1.1); g2.lineTo(0, r * 0.45); g2.lineTo(-r * 1.25, r * 1.1); g2.closePath();
      g2.fillStyle = '#ffd34d'; g2.strokeStyle = INK; g2.lineWidth = 2.5; g2.lineJoin = 'round'; g2.fill(); g2.stroke();
      g2.restore();
    }
  }
  function dot(g2, x, y, r, fill, letter, fg) {
    g2.beginPath(); g2.arc(x, y, r, 0, Math.PI * 2); g2.fillStyle = fill; g2.strokeStyle = INK; g2.lineWidth = 2; g2.fill(); g2.stroke();
    if (letter) {
      // setting a canvas font costs a style lookup (~0.3 ms a frame here) even when it's the same one, so set it only when it changes.
      // Resizing the canvas resets it, so fit() and paintBig forget it.
      const font = `700 ${Math.round(r * 1.3)}px Fredoka, sans-serif`;
      if (g2._font !== font) { g2.font = font; g2._font = font; }
      g2.fillStyle = fg; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(letter, x, y + 0.5);
    }
  }
  function paw(g2, x, y, r, fill) {
    g2.fillStyle = fill; g2.strokeStyle = INK; g2.lineWidth = 1.5;
    g2.beginPath(); g2.ellipse(x, y + r * 0.25, r * 0.75, r * 0.6, 0, 0, Math.PI * 2); g2.fill(); g2.stroke();
    for (const [ox, oy] of [[-0.75, -0.45], [-0.25, -0.8], [0.25, -0.8], [0.75, -0.45]]) { g2.beginPath(); g2.arc(x + ox * r, y + oy * r, r * 0.26, 0, Math.PI * 2); g2.fill(); g2.stroke(); }
  }

  function paintMini() {
    fit();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, cw, ch, MINI_K, player.pos.x, player.pos.z);
  }
  // the big map: about BIG_SPAN metres across round you (three times the minimap's reach), kept inside the map's edge
  const BIG_SPAN = 270;
  const bigPlace = overlay.querySelector('.bm-place');
  function paintBig() {
    const r = overlay.getBoundingClientRect();
    const cw2 = Math.max(80, Math.round(r.width)), ch2 = Math.max(60, Math.round(r.height));
    const d2 = Math.min(2, devicePixelRatio || 1);
    if (big.width !== Math.round(cw2 * d2) || big.height !== Math.round(ch2 * d2)) { big.width = Math.round(cw2 * d2); big.height = Math.round(ch2 * d2); bg._font = null; }
    const k = Math.max(cw2 / (W / SCALE), ch2 / (H / SCALE), cw2 / BIG_SPAN);
    const hw = cw2 / 2 / k, hh = ch2 / 2 / k;
    const cx = Math.max(MAP.minX + hw, Math.min(MAP.maxX - hw, player.pos.x)), cz = Math.max(MAP.minZ + hh, Math.min(MAP.maxZ - hh, player.pos.z));
    bg.setTransform(d2, 0, 0, d2, 0, 0);
    draw(bg, cw2, ch2, k, cx, cz, { labelsK: 1.2 });
    const pn = ctx.ui.placeName || '';
    if (bigPlace.textContent !== pn) bigPlace.textContent = pn;
  }

  const api = {
    name: 'minimap',
    get base() { return base; }, // the painted map (w8-woods-test reads it)
    get open() { return !overlay.hidden; },
    show() { if (!overlay.hidden || ctx.mode !== 'play') return; overlay.hidden = false; paintBig(); ctx.audio.ui?.('pop'); },
    get isOpen() { return !overlay.hidden; },
    hide() { if (overlay.hidden) return; overlay.hidden = true; ctx.audio.ui?.('pop'); },
    toggle() { if (overlay.hidden) api.show(); else api.hide(); },
    update(dt, now) {
      if (!overlay.hidden) { if ((frame++ & 7) === 0) paintBig(); return; }
      if ((frame++ % FPS_DIV) === 0) paintMini();
    },
    onKey(code) {
      if (input.typing) return false;
      if (code === 'KeyN') { api.toggle(); return true; }
      if (!overlay.hidden && code === 'Escape') { api.hide(); return true; }
      return false;
    },
    // no help lines: these keys are drawn in Settings > Controls, from controls-map.js
    paintMini, paintBig,
  };
  document.getElementById('minimap-open').onclick = () => api.toggle();
  document.getElementById('map-close').onclick = () => api.hide();
  // a panel that must not survive leaving play mode
  const watch = () => { if (ctx.mode !== 'play' && !overlay.hidden) overlay.hidden = true; };
  setInterval(watch, 500);
  paintMini();
  return api;
}

// ---------------------------------------------------------------- the base map (world metres; the context is scaled)
function paintBase(g, { areas, forest }) {
  g.setTransform(SCALE, 0, 0, SCALE, -MAP.minX * SCALE, -MAP.minZ * SCALE);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const poly = pts => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); };
  const line = pts => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); };
  const rect = (x0, z0, x1, z1, fill, stroke, lw = 0.5) => { g.fillStyle = fill; g.fillRect(x0, z0, x1 - x0, z1 - z0); if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.strokeRect(x0, z0, x1 - x0, z1 - z0); } };
  const circle = (x, z, r, fill, stroke, lw = 0.5) => { g.beginPath(); g.arc(x, z, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };

  // ground: grass, the park, the woods getting darker to the west
  g.fillStyle = C.grass; g.fillRect(MAP.minX, MAP.minZ, MAP.maxX - MAP.minX, MAP.maxZ - MAP.minZ);
  rect(PARK.minX, PARK.minZ, PARK.maxX, PARK.maxZ, C.park);
  const wg = g.createLinearGradient(WOODS_X + 10, 0, -192, 0); // as dark from x -192 on as at the woods' old edge
  wg.addColorStop(0, C.park); wg.addColorStop(0.3, C.woods0); wg.addColorStop(1, C.woods1);
  g.fillStyle = wg; g.fillRect(WOODS_WEST, PARK.minZ, WOODS_X + 10 - WOODS_WEST, WOODS_SOUTH - PARK.minZ);
  // outside the map edge where it is land (the corner by the shops): the tree wall
  g.fillStyle = C.edge; g.fillRect(WOODS_WEST, MAP.minZ, -192 - WOODS_WEST, -96 - MAP.minZ);
  // the town's lots
  for (const n of NEIGHBORHOODS) rect(n.minX, n.minZ, n.maxX, n.maxZ, C.lot);
  rect(SHOPS.minX, SHOPS.minZ, SHOPS.maxX, SHOPS.maxZ, C.lot);
  // the lake: a sandy shore, then the water
  for (const l of LAKES) {
    poly(l.poly); g.strokeStyle = C.shore; g.lineWidth = 5; g.stroke();
    poly(l.poly); g.fillStyle = C.water; g.fill();
    poly(l.poly); g.strokeStyle = C.deep; g.lineWidth = 1.2; g.stroke();
  }
  // roads: sidewalks under the tar
  for (const r of ROADS) { line(r.pts); g.strokeStyle = C.walk; g.lineWidth = r.width + SIDEWALK_W * 2; g.stroke(); }
  for (const r of ROADS) { line(r.pts); g.strokeStyle = C.tar; g.lineWidth = r.width; g.stroke(); line(r.pts); g.setLineDash([2.5, 2.5]); g.strokeStyle = '#f4efe2'; g.lineWidth = 0.35; g.stroke(); g.setLineDash([]); }
  // trails
  const slotsById = {}; for (const a of areas) slotsById[a.id] = { x: a.x, z: a.z };
  for (const t of TRAILS) { const pts = smoothPath(resolveTrail(t, slotsById), 5); line(pts); g.strokeStyle = C.trail; g.lineWidth = t.width; g.stroke(); }
  // the game plazas (flat rings) and their tables
  for (const a of areas) {
    if (a.rect) { // the garden's block: its outline and its six beds
      rect(a.rect.minX, a.rect.minZ, a.rect.maxX, a.rect.maxZ, '#9fcf72', '#efe9dc', 0.5);
      if (a.id === 'north-lawn') { for (const t of a.npcSpec?.picnic?.tables || []) circle(t.x, t.z, 1.1, '#b98a5a', INK, 0.25); const c = a.npcSpec?.picnic?.contest; if (c) rect(c.x - 2.6, c.z - 1.3, c.x + 2.6, c.z + 0.5, '#e0463c', INK, 0.3); } // the picnic tables and the contest table
      else for (const p of Object.values(GARDEN_PLAN.beds)) rect(a.x + p.u - 1.5, a.z + p.v - 0.75, a.x + p.u + 1.5, a.z + p.v + 0.75, '#6b4a2e', INK, 0.25);
    } else circle(a.x, a.z, 6.8, '#f1dcbf', '#c9b48f', 0.4);
    if (a.game) {
      const dark = a.game.theme === 'arkham';
      rect(a.x - 2.2, a.z - 1.4, a.x + 2.2, a.z + 1.4, dark ? '#2a2530' : '#ff8fb8', INK, 0.5);
      for (const [ox, oz] of [[-1.6, -2.2], [1.6, -2.2], [-1.6, 2.2], [1.6, 2.2]]) circle(a.x + ox, a.z + oz, 0.7, '#8a5a3a', INK, 0.3);
    }
  }
  // the frisbee field and the hedges
  g.save(); g.beginPath(); g.ellipse(FRISBEE_FIELD.x, FRISBEE_FIELD.z, FRISBEE_FIELD.rx, FRISBEE_FIELD.rz, 0, 0, Math.PI * 2); g.fillStyle = '#a5d77a'; g.fill(); g.strokeStyle = '#eef6dc'; g.lineWidth = 0.35; g.stroke(); g.restore();
  for (const h of HEDGES) rect(h.x0, HEDGE.z0, h.x1, HEDGE.z1, '#3d7a3a');
  // fences and gates
  for (const f of FENCES) { line([f.a, f.b]); g.setLineDash([1.6, 1.0]); g.strokeStyle = C.fence; g.lineWidth = 0.9; g.stroke(); g.setLineDash([]); }
  for (const gt of GATES) rect(gt.x - (gt.axis === 'x' ? gt.w / 2 : 0.6), gt.z - (gt.axis === 'z' ? gt.w / 2 : 0.6), gt.x + (gt.axis === 'x' ? gt.w / 2 : 0.6), gt.z + (gt.axis === 'z' ? gt.w / 2 : 0.6), '#ffd34d', INK, 0.35);
  // the house, porch, mailbox, pier, shack
  rect(PORCH.minX, PORCH.minZ, PORCH.maxX, PORCH.maxZ, C.porch, INK, 0.45);
  rect(HOUSE.minX, HOUSE.minZ, HOUSE.maxX, HOUSE.maxZ, C.house, INK, 0.6);
  rect(HOUSE.minX + 1.2, HOUSE.minZ + 1.2, HOUSE.maxX - 1.2, HOUSE.maxZ - 1.2, C.roof);
  g.strokeStyle = INK; g.lineWidth = 0.45; g.beginPath(); g.moveTo(HOUSE.minX + 1.2, (HOUSE.minZ + HOUSE.maxZ) / 2); g.lineTo(HOUSE.maxX - 1.2, (HOUSE.minZ + HOUSE.maxZ) / 2); g.stroke();
  circle(MAILBOX.x, MAILBOX.z, 0.8, '#3c4f7a', INK, 0.3);
  rect(DOCK.minX, DOCK.minZ, DOCK.maxX, DOCK.maxZ, C.wood, INK, 0.45);
  rect(FISH_SHACK.x - FISH_SHACK.w / 2, FISH_SHACK.z - FISH_SHACK.d / 2, FISH_SHACK.x + FISH_SHACK.w / 2, FISH_SHACK.z + FISH_SHACK.d / 2, '#8f6b4a', INK, 0.45);
  // Strickler Park parking (park-lot): the tar pad and its driveway, the bay lines, and a P
  {
    const L = PARK_LOT, d = L.drive;
    rect(d.minX, d.cutZ - SIDEWALK_W, d.maxX, L.minZ + 0.5, C.tar);
    rect(L.minX, L.minZ, L.maxX, L.maxZ, C.tar, INK, 0.35);
    g.strokeStyle = '#f4efe2'; g.lineWidth = 0.18;
    for (const [bx, bz] of L.bays) for (const s of [-1, 1]) line([[bx - L.bayD / 2, bz + s * L.bayW / 2], [bx + L.bayD / 2, bz + s * L.bayW / 2]]), g.stroke();
    g.font = '700 5px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 1.2; g.strokeStyle = INK; g.strokeText('P', L.aisleX, (L.minZ + L.maxZ) / 2 + 0.3);
    g.fillStyle = '#ffffff'; g.fillText('P', L.aisleX, (L.minZ + L.maxZ) / 2 + 0.3);
  }
  // the bus stop: the bay's tar, the plaza and its path, the shelter, the sign, the tunnel's dark mouth
  {
    const B = BUS_STOP, P = B.plaza, Pa = B.path, sh = B.shelter;
    poly(B.bay); g.fillStyle = C.tar; g.fill();
    rect(P.minX, P.minZ, P.maxX, P.maxZ, C.walk, INK, 0.3); rect(Pa.minX, Pa.minZ, Pa.maxX, Pa.maxZ, C.walk);
    rect(sh.x - sh.d / 2, sh.z - sh.w / 2, sh.x + sh.d / 2, sh.z + sh.w / 2, '#2f6b5f', INK, 0.35);
    circle(B.sign.x, B.sign.z, 1.1, '#d8343c', INK, 0.35);   // the stop's sign
    const T = BUS_TUNNEL; rect(T.x - 9, T.z - 8.5, T.x, T.z + 8.5, '#8f897e', INK, 0.5); rect(T.x - 9, T.z - 5.5, T.x, T.z + 5.5, '#1b1b1f');
  }
  // the mail van's lay-by by the park and the white box of its spot
  poly(VAN_STOP.bay); g.fillStyle = C.tar; g.fill();
  { const S = VAN_STOP.spot; rect(S.x - 3.9, S.z - 1.25, S.x + 3.9, S.z + 1.25, C.tar, '#f4efe2', 0.25); }
  // Carol's wreath booth in the park (buddy-carol.js): two white canopies side by side, turned to face the path
  g.save(); g.translate(BOOTH.x, BOOTH.z); g.rotate(-BOOTH.yaw); for (const sx of [-1, 1]) { g.fillStyle = '#f7f7f3'; g.strokeStyle = INK; g.lineWidth = 0.4; g.fillRect(sx > 0 ? 0.1 : -3.05, -1.5, 2.95, 3); g.strokeRect(sx > 0 ? 0.1 : -3.05, -1.5, 2.95, 3); } g.restore();
  // the town: every house with its own roof, the shops, the game store, the water tower
  TOWN_HOUSES.forEach((h, i) => {
    rect(h.x - h.w / 2, h.z - h.d / 2, h.x + h.w / 2, h.z + h.d / 2, C.town, INK, 0.4);
    rect(h.x - h.w / 2 + 0.8, h.z - h.d / 2 + 0.8, h.x + h.w / 2 - 0.8, h.z + h.d / 2 - 0.8, C.roofs[i % C.roofs.length]);
  });
  // the strip mall (strip-mall): its lot and walkway in front, the building with its two stores' roofs (the third shop's spot is Summit Square since crib-move)
  { const M = STRIP_MALL, U = M.units;
    rect(M.minX, M.lot.minZ, M.maxX, M.lot.maxZ, C.tar); rect(M.minX - 0.5, M.walk.minZ, M.maxX + 0.5, M.minZ, C.walk);
    rect(M.minX, M.minZ, M.maxX, M.maxZ, C.town, INK, 0.4);
    rect(U.pizza.minX + 0.8, M.minZ + 0.8, U.pizza.maxX - 0.3, M.maxZ - 0.8, '#b8503f'); rect(U.clothes.minX + 0.3, M.minZ + 0.8, U.clothes.maxX - 0.8, M.maxZ - 0.8, '#5f8a6b'); }
  // Summit Square (crib-move): the pavers, the shelter's roof, the trees
  { const S = SUMMIT_SQUARE, sh = S.shelter;
    rect(S.minX, S.minZ, S.maxX, S.maxZ, C.walk, INK, 0.35);
    rect(sh.x - sh.w / 2, sh.z - sh.d / 2, sh.x + sh.w / 2, sh.z + sh.d / 2, '#3f7a4f', INK, 0.35);
    for (const t of S.trees) circle(t.x, t.z, 1.6, '#4f9a45', '#2e5e34', 0.4); }
  // Kevin's Tool Crib beside the post office (crib-move): its porch and walk in front, the building with its tin roof
  { const T = TOOL_CRIB, fr = T.door === 'south' ? 1 : -1, fz = T.z + fr * T.d / 2, walkZ = fr > 0 ? -134 : -119;
    rect(T.x - 1.3, Math.min(fz, walkZ), T.x + 1.3, Math.max(fz, walkZ), C.walk);
    rect(T.x - T.w / 2, Math.min(fz, fz + fr * 2.1), T.x + T.w / 2, Math.max(fz, fz + fr * 2.1), C.porch, INK, 0.3);
    rect(T.x - T.w / 2, T.z - T.d / 2, T.x + T.w / 2, T.z + T.d / 2, C.town, INK, 0.4);
    rect(T.x - T.w / 2 + 0.8, T.z - T.d / 2 + 0.8, T.x + T.w / 2 - 0.8, T.z + T.d / 2 - 0.8, '#8b5a46'); }
  // the Lovecraft house: its raised lawn inside the bend, the house with its slate mansard, the porch
  { const L = LOVECRAFT_HOUSE, lt = L.lot, c = lt.corner;
    poly([[lt.maxX, lt.maxZ], c[0], c[1], [lt.minX, lt.minZ], [lt.maxX, lt.minZ]]); g.fillStyle = '#8fcf62'; g.fill(); g.strokeStyle = '#3f4a3a'; g.lineWidth = 0.4; g.stroke();
    rect(L.x - L.w / 2, L.z - L.d / 2, L.x + L.w / 2, L.z + L.d / 2, '#c3c7b1', INK, 0.5);
    rect(L.x - L.w / 2 + 0.9, L.z - L.d / 2 + 0.9, L.x + L.w / 2 - 0.9, L.z + L.d / 2 - 0.9, '#525669');
    rect(L.x + 1.6, L.z + L.d / 2, L.x + 5.4, L.z + L.d / 2 + 2.2, '#efe6cf', INK, 0.35); }
  // the post office: its walk and the van's bay with the driveway, the building with its navy roof
  { const O = MAIL_OFFICE, D = O.drive;
    rect(D.minX - 0.5, O.bay.z - 5, O.x - O.w / 2, D.roadZ, C.tar); rect(O.door.x - 1.25, O.z, O.door.x + 1.25, O.lot.maxZ, C.walk);
    rect(O.x - O.w / 2, O.z - O.d / 2, O.x + O.w / 2, O.z + O.d / 2, '#b5563f', INK, 0.5);
    rect(O.x - O.w / 2 + 0.8, O.z - O.d / 2 + 0.8, O.x + O.w / 2 - 0.8, O.z + O.d / 2 - 0.8, '#1f3d58'); }
  // the game store: its front walk, the path round the back to the D&D room's own door, the building, a tick for each door
  { const G = GAME_STORE, gx0 = G.x - G.w / 2, gx1 = G.x + G.w / 2, gz0 = G.z - G.d / 2, gz1 = G.z + G.d / 2, bd = G.x + 3.55;
    rect(G.x - 1.3, -119.2, G.x + 1.3, gz0, C.walk);
    rect(G.x + 2.8, gz1 + 0.5, gx1 + 2.05, gz1 + 2.1, C.walk); rect(gx1 + 0.45, -119.0, gx1 + 2.05, gz1 + 2.1, C.walk);
    rect(gx0, gz0, gx1, gz1, '#b48cff', INK, 0.5);
    rect(G.x - 1, gz0 - 0.35, G.x + 1, gz0 + 0.35, '#f3e6c8'); rect(bd - 0.55, gz1 - 0.35, bd + 0.55, gz1 + 0.35, '#f3e6c8'); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; circle(WATER_TOWER.x + Math.cos(a) * 6.2, WATER_TOWER.z + Math.sin(a) * 6.2, 0.9, '#5b6168'); }
  circle(WATER_TOWER.x, WATER_TOWER.z, 4.8, '#c9cfd4', INK, 0.5); circle(WATER_TOWER.x, WATER_TOWER.z, 2.2, '#8a3b34');
  // the park's things: the swing tree, the bocce court, the scout camp, the tent
  g.save(); g.translate(BOCCE.x, BOCCE.z); g.rotate(-BOCCE.rot); rect(-2.2, -9, 2.2, 9, '#d9c59a', INK, 0.4); g.restore();
  circle(SCOUT_CAMP.x, SCOUT_CAMP.z, 2.2, '#ff9f4a', INK, 0.4); circle(SCOUT_CAMP.x, SCOUT_CAMP.z, 0.9, '#ffd34d');
  g.beginPath(); g.moveTo(TENT.x - 2.2, TENT.z + 1.4); g.lineTo(TENT.x + 2.2, TENT.z + 1.4); g.lineTo(TENT.x, TENT.z - 1.8); g.closePath(); g.fillStyle = '#4f7a4a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke();
  // the swing hill's sand pit, under the trees
  poly(pitOutline(2).map(p => { const w = hillXZ(p.u, p.v); return [w.x, w.z]; })); g.fillStyle = '#ecd9a0'; g.fill(); g.strokeStyle = '#8a5f35'; g.lineWidth = 0.5; g.stroke();
  // trees: the named yard trees, then the woods (lightly, there are thousands)
  for (const s of forest) { if (!s.solid) continue; circle(s.x, s.z, 1.1, 'rgba(46, 94, 52, 0.55)'); }
  for (const t of YARD_TREES) { if (t.gone) continue; circle(t.x, t.z, 1.8, t.kind === 'pine' ? '#3f7d3c' : '#4f9a45', '#2e5e34', 0.4); }
  circle(SWING_TREE.x, SWING_TREE.z, 3.2, '#4f9a45', '#2e5e34', 0.5); circle(SWING_FRAME.x, SWING_FRAME.z, 0.9, '#2b2b2f', INK, 0.3); // the tire where it hangs
  // the map edge
  poly(WALK); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  // names
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // ...and every game table in the open by its game's name, just north of its plaza (Unstable Unicorns in the woods corner)
  for (const [text, x, z, size] of [...LABELS, ...areas.filter(a => a.game).map(a => [a.game.name, a.x, a.z - 10.5, 4]), ...areas.filter(a => a.id === 'north-lawn').map(a => [a.slot.name, a.x, a.z + 8.6, 4])]) {
    g.font = `700 ${size}px Fredoka, Nunito, sans-serif`;
    const lines = text.split(NL);
    lines.forEach((t, i) => {
      const zz = z + (i - (lines.length - 1) / 2) * size * 1.05;
      g.lineWidth = size * 0.28; g.strokeStyle = 'rgba(43, 35, 64, 0.85)'; g.strokeText(t, x, zz);
      g.fillStyle = '#fff8ec'; g.fillText(t, x, zz);
    });
  }
}
