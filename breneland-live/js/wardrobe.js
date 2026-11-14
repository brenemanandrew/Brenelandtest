// The wardrobe at home (clothing-store): players live at Breneland (lib/wreaths.js), so the clothes you bought at Peak Threads hang in a
// wardrobe in the main bedroom, against the east wall between the main bath and the bed (the Blender model `wardrobe`, clothing-wear.js;
// a code-built cabinet if the model is missing). E at it opens the wardrobe: a tab per kind (icons), a tile per owned piece drawn on
// your own character (avatar-tiles.js), a "nothing" tile; tap one and you change (lib/clothing.js cl-wear: owned pieces only), everyone
// sees it, your account keeps it. While it is open you stand before the wardrobe and see yourself as in its mirror (the fitting
// room's camera), turning with A / D. Test hooks: feature.open, .kind, .tiles, .show(kind), .wear(kind, id), .close(), .spot.
import * as THREE from 'three';
import { loadCss, el } from './util.js';
import { toon } from './toon.js';
import { HOUSE } from './layout.js';
import { PIECES, KINDS, SLOT_KEY, pieceOf } from './clothing-catalog.js';
import { clothesReady, modelMesh } from './clothing-wear.js';
import { ICON, icon, KIND_LABEL, applyLook, mirrorTakeover, makeTiles, frameFor } from './clothing-ui.js';

// the main bedroom's east wall (layout.js HOUSE_PLAN rooms.main: x 4.96..8.4, z 0.66..5.4; the main bath takes the corner to z 2.54,
// the bed starts at z 3.3 from x 5.9): the cabinet's back on the wall, its doors to the room (west). `front` is where you stand
export const WARDROBE = { x: 8.1, z: 3.12, yaw: -Math.PI / 2, w: 1.0, d: 0.56, h: 2.0, front: { x: 6.25, z: 3.1, yaw: Math.PI / 2 }, box: { minX: 7.82, maxX: 8.38, minZ: 2.62, maxZ: 3.62 } };

export function createWardrobe(ctx) {
  const { scene, colliders, player, net, ui, audio, input, house } = ctx;
  loadCss('/css/clothing.css');
  const hud = document.getElementById('hud');
  const W = WARDROBE, F = HOUSE.floorY;
  const owned = () => (ctx.features?.find(f => f.name === 'clothing-store')?.state.owned) || [];
  const worn = () => (ctx.features?.find(f => f.name === 'clothing-store')?.state.worn) || {};

  // ---- the cabinet, in the house's inside group (drawn when the inside is)
  const parent = house?.inside?.group || scene;
  let mesh = clothesReady() ? modelMesh('wardrobe', ['#c9a06a']) : null;
  if (!mesh) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(W.w, W.h, W.d), toon('#c9a06a')); body.position.y = W.h / 2; g.add(body);
    for (const k of [-0.24, 0.24]) { const door = new THREE.Mesh(new THREE.BoxGeometry(0.44, W.h - 0.3, 0.03), toon('#b8905c')); door.position.set(k, W.h / 2, W.d / 2 + 0.01); g.add(door); }
    for (const k of [-0.06, 0.06]) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), toon('#c9a24a')); knob.position.set(k, W.h / 2, W.d / 2 + 0.04); g.add(knob); }
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    mesh = g;
  }
  mesh.position.set(W.x, F, W.z); mesh.rotation.y = W.yaw; mesh.name = 'wardrobe';
  parent.add(mesh);
  colliders.push({ type: 'box', ...W.box, inner: true });

  // ---- the panel
  const tiles = makeTiles(ctx);
  let panel = null, open = false, kind = 'top', take = null, refs = null;
  function build() {
    panel = el('div', 'wd-panel', '', { role: 'dialog', 'aria-label': 'Wardrobe' }); panel.hidden = true;
    const tabs = el('div', 'wd-tabs', '', { role: 'tablist' });
    for (const k of KINDS) {
      const b = el('button', 'wd-tab', '', { type: 'button', role: 'tab', 'aria-label': KIND_LABEL[k], title: KIND_LABEL[k], 'data-kind': k });
      b.append(icon(k)); b.onclick = () => show(k); tabs.append(b);
    }
    const main = el('div', 'wd-main'), head = el('div', 'wd-head'), title = el('div', 'wd-title', 'Wardrobe'), x = el('button', 'cl-x', '', { type: 'button', 'aria-label': 'Close' });
    x.innerHTML = ICON.close; x.onclick = () => close();
    head.append(title); main.append(head);
    const grid = el('div', 'wd-grid', '', { role: 'radiogroup' });
    main.append(grid);
    panel.append(tabs, main, x);
    ctx.hud.append(panel);
    refs = { tabs, title, grid };
  }
  function tile(piece, k) {
    const on = piece ? worn()[k] === piece.id : !worn()[k];
    const t = el('button', 'wd-tile', '', { type: 'button', role: 'radio', 'aria-checked': String(on), 'data-id': piece ? piece.id : '' });
    const pic = el('div', 'wd-pic'), name = el('div', 'wd-name', piece ? piece.name : 'Nothing'), mark = el('span', 'wd-on'); mark.innerHTML = ICON.check;
    if (piece) tiles.request({ [SLOT_KEY[k]]: piece.id }, frameFor(piece), pic); else pic.append(icon('none'));
    t.append(pic, name, mark);
    t.onclick = () => wear(k, piece ? piece.id : null);
    return t;
  }
  function show(k) {
    if (!panel) build();
    kind = k;
    for (const b of refs.tabs.children) b.setAttribute('aria-selected', String(b.dataset.kind === k));
    refs.title.textContent = KIND_LABEL[k];
    refs.grid.replaceChildren();
    tiles.cancel();
    const mine = PIECES.filter(p => p.kind === k && owned().includes(p.id));
    refs.grid.append(tile(null, k));
    for (const p of mine) refs.grid.append(tile(p, k));
    if (!mine.length) refs.grid.append(el('div', 'wd-empty', `No ${KIND_LABEL[k].toLowerCase()} yet. Peak Threads has new ones every week.`));
  }
  function openPanel() {
    if (!ctx.playing || open) return;
    if (!panel) build();
    open = true;
    take = mirrorTakeover(ctx, W.front, [W.x - W.d / 2 - 0.02, F + 1.25, W.z]); // (as if its door were a mirror)
    hud.classList.add('wd-on');
    const w = worn(); show(KINDS.find(k => w[k]) || 'top');
    panel.hidden = false;
    audio.ui?.('pop');
    setTimeout(() => refs.tabs.querySelector('[aria-selected="true"]')?.focus(), 0);
  }
  function close() {
    if (!open) return;
    open = false; take?.end(); take = null;
    hud.classList.remove('wd-on');
    if (panel) panel.hidden = true;
    tiles.cancel();
  }
  function wear(k, id) {
    if (id && !owned().includes(id)) return;
    net.send({ t: 'cl-wear', [k]: id });
  }
  net.on('cl-wear', m => {
    if (!m.ok) { ui.toast({ own: 'That one is not yours.', guest: 'Sign in to keep clothes.', bad: 'Hmm, that did not fit.' }[m.why] || 'Not this time.', 2400); audio.ui?.('blip'); return; }
    applyLook(ctx, m.look);
    audio.ui?.('pop'); input.rumble(0.2, 0.3, 60);
    if (open) { const st = ctx.features?.find(f => f.name === 'clothing-store')?.state; if (st) { if (m.worn) st.worn = m.worn; if (Array.isArray(m.owned)) st.owned = m.owned; } for (const t of refs.grid.querySelectorAll('.wd-tile')) t.setAttribute('aria-checked', String((t.dataset.id || null) === (worn()[kind] || null))); }
  });
  const near = (px, pz) => px < W.box.minX && px > W.box.minX - 2.0 && Math.abs(pz - W.z) < 0.9 && ctx.features?.find(f => f.name === 'main-house')?.inside?.();

  return {
    name: 'wardrobe',
    spot: W, mesh,
    get open() { return open; }, get kind() { return kind; }, get tiles() { return refs ? [...refs.grid.querySelectorAll('.wd-tile')].map(t => ({ id: t.dataset.id || null, on: t.getAttribute('aria-checked') === 'true' })) : []; },
    show, wear, close, openPanel,
    target(px, pz) {
      if (open) return { hint: 'E  Done', prio: 9, run: close };
      if (near(px, pz)) return { hint: 'E  Open the wardrobe', prio: 8, run: openPanel }; // (over the bed's lie-down beside it)
      return null;
    },
    onKey(code) { if (code === 'Escape' && open) { close(); return true; } return false; },
    help: [[['E'], 'at the wardrobe in the main bedroom: change into the clothes you own']],
    update() { tiles.pump(5); if (open && ctx.mode !== 'play') close(); },
  };
}
