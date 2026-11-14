// The community board: the park's noticeboard by the fountain (layout.js PHOTO_BOARD). A wooden frame with a little shingled
// roof on two posts, the park's green header ("Welcome to Strickler Park" and the hours under it), and two parts on cork:
//   Photos         the snapshots players share from the scenic views (lib/photos.js), four pinned up. One changes every
//                  SLOT_S seconds, picked from the shared list by the shared clock (a daily shuffle, hash01), so everyone
//                  standing there sees the same pictures. Nothing is fetched until you come within NEAR metres.
//   Announcements  Andrew's own notices (lib/photos.js /api/notices, posted from the card by an admin, newest first), then
//                  what's on today from the game's own schedules (park-notices.js). The board shows five.
// The face is one canvas texture, repainted only when what it shows changes (a slot, a picture arriving, the notices).
//
// E at the board opens its card: Announcements (every notice, an admin posts and takes them down there) and Photos
// (Everyone / Mine / Held, the pictures large, one at a time). Hide and report hides one on your screen at once, and after three
// accounts it hides for everyone until Andrew looks. Delete your own, an admin any. Keep a held one. Keys: Left / Right, Esc,
// the pad's D-pad, A next, B close.
// feature api (tests): board.list, board.slots, board.notices, board.refresh(), board.card, board.pick(list, t), SLOTS.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { Batcher, GEO } from './batch.js';
import { terrainHeight } from './terrain.js';
import { PHOTO_BOARD } from './layout.js';
import { hash01 } from './util.js';
import { LIGHT, lampGlow, addNightSpot } from './daynight-mats.js';
import { autoNotices } from './park-notices.js';

export const SLOT_S = 12, SLOTS = 4, NEAR = 60, SHOWN = 5;
const W = 1280, H = 768, BOARD = { w: 5.2, h: 3.12, y0: 0.55 };
const DOT = ' ' + String.fromCharCode(183) + ' ';
export const TITLE = 'Welcome to Strickler Park', SUB = 'open dawn to dusk' + DOT + 'dogs on leads, please';
const VIEW_WORDS = { firepit: 'at the firepit', bench: 'by Lake Rufallia' };
const HIDDEN_KEY = 'breneland.photoHidden';
const F = (w, px, fam = 'Fredoka') => `${w} ${px}px "${fam}", "Trebuchet MS", sans-serif`;
function fit(g, text, weight, px, maxW, fam, min = 9) { let s = px; g.font = F(weight, s, fam); while (g.measureText(text).width > maxW && s > min) { s -= 1; g.font = F(weight, s, fam); } return s; }
const el = (tag, cls, text, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

// Which photo each slot shows at shared time t (ms): pure, the same on every screen. The list is shuffled once a day; slot k
// steps through it every SLOTS * SLOT_S seconds, the slots staggered by SLOT_S, so one picture changes at a time. A slot
// never shows a picture another slot shows (it steps on).
export function pick(list, t) {
  const n = list.length, out = new Array(SLOTS).fill(null);
  if (!n) return out;
  const day = Math.floor(t / 86400e3);
  const order = list.slice().sort((a, b) => hash01('photo-board', day, a.id) - hash01('photo-board', day, b.id) || (a.id < b.id ? -1 : 1));
  if (n <= SLOTS) { for (let k = 0; k < n; k++) out[k] = order[k]; return out; }
  const used = new Set(), s = t / 1000;
  for (let k = 0; k < SLOTS; k++) {
    let i = (k + SLOTS * Math.floor((s + k * SLOT_S) / (SLOTS * SLOT_S))) % n;
    while (used.has(i)) i = (i + 1) % n;
    used.add(i); out[k] = order[i];
  }
  return out;
}

export function createPhotoBoard(ctx) {
  const { net, ui, player, colliders, world, input, hud } = ctx;
  const { x: bx, z: bz, yaw } = PHOTO_BOARD;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw); // forward (the face) and across
  const by = terrainHeight(bx, bz);
  const root = world?.root || ctx.scene;

  // ---- the build: posts, frame, roof, the back (one batch) and the painted face (one mesh, its own canvas)
  const b = new Batcher({ vertexColors: true });
  const at = (a, f) => [bx + rx * a + fx * f, bz + rz * a + fz * f];
  const box = (col, a, h, f, sa, sh, sf, tilt = 0) => { const [x, z] = at(a, f); b.add(GEO.box, col, { x, y: by + h, z, sx: sa, sy: sh, sz: sf, rx: tilt, ry: yaw }); };
  const WOOD = '#7a5232', DARK = '#5a3c26', TRIM = '#a8804f', ROOF = '#3f6b55';
  const top = BOARD.y0 + BOARD.h;
  const model = propsReady('board');
  if (model) addProp(b, 'board', { x: bx, y: by, z: bz, yaw }, { skin: 'park' }); // (props-static: the Blender board, its shingled overhang and lantern; the face stays the game's)
  else {
  for (const a of [-BOARD.w / 2 - 0.12, BOARD.w / 2 + 0.12]) { box(DARK, a, (top + 0.5) / 2, 0, 0.16, top + 0.5, 0.16); box(DARK, a, 0.06, 0, 0.3, 0.12, 0.3); }
  box(WOOD, 0, BOARD.y0 + BOARD.h / 2, -0.05, BOARD.w + 0.1, BOARD.h + 0.1, 0.08);           // the back board
  box(TRIM, 0, top + 0.05, 0.02, BOARD.w + 0.22, 0.1, 0.14); box(TRIM, 0, BOARD.y0 - 0.05, 0.02, BOARD.w + 0.22, 0.1, 0.14); // the frame
  for (const a of [-BOARD.w / 2 - 0.06, BOARD.w / 2 + 0.06]) box(TRIM, a, BOARD.y0 + BOARD.h / 2, 0.02, 0.1, BOARD.h + 0.18, 0.14); // (beside the face: nothing stands in front of its words)
  box(TRIM, 0, BOARD.y0 - 0.16, 0.08, BOARD.w * 0.94, 0.05, 0.2);                            // a little ledge under it
  for (const s of [-1, 1]) box(ROOF, 0, top + 0.46, s * 0.27, BOARD.w + 0.7, 0.06, 0.66, s * 0.42); // the shingled roof
  box(DARK, 0, top + 0.6, 0, BOARD.w + 0.72, 0.07, 0.07);
  // a lantern on the right post for the evening
  { const [lx, lz] = at(BOARD.w / 2 + 0.12, 0.26);
  b.add(GEO.box, '#3a3f47', { x: lx, y: by + top + 0.27, z: lz, sx: 0.05, sy: 0.05, sz: 0.3, ry: yaw });
  b.add(GEO.box, lampGlow('#ffd98e'), { x: lx, y: by + top + 0.06, z: lz, sx: 0.13, sy: 0.19, sz: 0.13, ry: yaw });
  b.add(GEO.cone6, '#3a3f47', { x: lx, y: by + top + 0.2, z: lz, sx: 0.12, sy: 0.08, sz: 0.12 }); }
  }
  const [lx, lz] = at(BOARD.w / 2 + 0.12, 0.26);
  addNightSpot({ x: lx, y: by + top + 0.06, z: lz, color: '#ffd98e', pool: 3.4, poolK: 0.55, gy: by, halo: 0.8, flicker: 0.1 });
  b.build(root, 'photo-board');
  for (const a of [-2.2, -0.75, 0.75, 2.2]) { const [x, z] = at(a, 0); colliders.push({ type: 'circle', x, z, r: 0.42, sign: true }); }

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), mat);
  face.name = 'photo-board-face'; face.userData.noMerge = true;
  { const [x, z] = at(0, model ? 0.014 : 0.01); face.position.set(x, by + BOARD.y0 + BOARD.h / 2, z); face.rotation.y = yaw; }
  root.add(face);

  // ---- the list (from the server), the pictures (loaded as needed), what each slot shows
  let list = [], admin = false, held = [], stale = true, fetching = false, fetchedAt = 0;
  let hidden = new Set(); try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { /* none */ }
  const imgs = new Map(); // id -> { img, ok }
  let slots = new Array(SLOTS).fill(null), slotKey = '', painted = '';
  const visibleList = () => list.filter(p => !hidden.has(p.id));
  async function refresh() {
    if (fetching) return;
    fetching = true;
    try {
      const r = await fetch('/api/photos', { headers: ctx.accounts?.headers?.() || {}, cache: 'no-store' });
      const j = await r.json();
      if (j && Array.isArray(j.photos)) { list = j.photos.filter(p => p && /^[a-f0-9]{18}$/.test(p.id)); admin = !!j.admin; held = Array.isArray(j.held) ? j.held : []; stale = false; fetchedAt = performance.now(); painted = ''; }
    } catch { /* offline: try again on the next push or approach */ } finally { fetching = false; }
    if (card.open) card.sync();
  }
  net.on('photos', () => { stale = true; });
  // the notices: Andrew's (the server's) above the automatic ones (worked out every 30 s from the shared clock)
  let posted = [], nStale = true, nFetching = false, nAt = 0, autos = [], autoAt = -1e15, noticeKey = '', nAdmin = false;
  async function refreshNotices() {
    if (nFetching) return;
    nFetching = true;
    try {
      const r = await fetch('/api/notices', { headers: ctx.accounts?.headers?.() || {}, cache: 'no-store' });
      const j = await r.json();
      if (j && Array.isArray(j.notices)) { posted = j.notices.map(n => ({ ...n, kind: 'posted', color: '#e0463c' })); nAdmin = !!j.admin; nStale = false; nAt = performance.now(); }
    } catch { /* offline */ } finally { nFetching = false; }
    if (card.open) card.sync();
  }
  net.on('notices', () => { nStale = true; });
  const allNotices = () => [...posted, ...autos];
  async function refreshAll() { await Promise.all([refresh(), refreshNotices()]); }
  function imageOf(p) {
    let e = imgs.get(p.id);
    if (!e) {
      e = { img: new Image(), ok: false };
      e.img.decoding = 'async';
      e.img.onload = () => { e.ok = true; painted = ''; };
      e.img.src = p.url;
      imgs.set(p.id, e);
      if (imgs.size > 30) { const old = imgs.keys().next().value; imgs.delete(old); }
    }
    return e;
  }

  // ---- painting the face
  function paint() {
    g.fillStyle = '#5a3c26'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c99a62'; g.fillRect(16, 16, W - 32, H - 32); // cork
    g.fillStyle = 'rgba(110, 70, 30, 0.22)';
    for (let i = 0; i < 340; i++) { const x = 18 + hash01('cork', i) * (W - 36), y = 18 + hash01('cork-y', i) * (H - 36); g.fillRect(x, y, 3, 2); }
    // the header, in the park's green and cream
    g.fillStyle = '#2f5a3a'; g.fillRect(16, 16, W - 32, 132);
    g.fillStyle = '#ffd34d'; g.fillRect(16, 144, W - 32, 6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff4dc'; fit(g, TITLE, 700, 70, W - 120); g.fillText(TITLE, W / 2, 66);
    g.fillStyle = '#d8ecd2'; fit(g, SUB, 600, 28, W - 200, 'Nunito'); g.fillText(SUB, W / 2, 120);
    // the two parts' labels: a painted tab each
    const label = (text, x, w, col) => { g.fillStyle = col; round(g, x, 166, w, 38, 10); g.fill(); g.fillStyle = '#2b2340'; g.textAlign = 'center'; fit(g, text, 700, 24, w - 20); g.fillText(text, x + w / 2, 186); };
    label('PHOTOS', 40, 170, '#ffd34d'); label('ANNOUNCEMENTS', 812, 260, '#ffb86b');
    // photos: two by two
    const cw = 352, ch = 262, gx = 22, gy = 18, x0 = 40, y0 = 218;
    slots.forEach((p, k) => {
      const col = k % 2, row = Math.floor(k / 2);
      const x = x0 + col * (cw + gx), y = y0 + row * (ch + gy);
      const tilt = (hash01('slot-tilt', k) - 0.5) * 0.06;
      g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate(tilt); g.translate(-cw / 2, -ch / 2);
      g.fillStyle = 'rgba(60, 35, 15, 0.25)'; g.fillRect(5, 6, cw, ch); // a soft shadow (a second fill, no blur)
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, cw, ch);
      const px = 12, py = 12, pw = cw - 24, ph = ch - 56;
      const e = p && imageOf(p);
      if (e && e.ok) {
        const iw = e.img.naturalWidth, ih = e.img.naturalHeight, k2 = Math.max(pw / iw, ph / ih), sw = pw / k2, sh = ph / k2;
        g.drawImage(e.img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, px, py, pw, ph);
      } else {
        g.fillStyle = p ? '#dfe7ee' : '#efe4cc'; g.fillRect(px, py, pw, ph);
        g.fillStyle = '#8a7a5a'; g.textAlign = 'center';
        fit(g, p ? 'Developing...' : 'Your photo here!', 700, 28, pw - 20); g.fillText(p ? 'Developing...' : 'Your photo here!', px + pw / 2, py + ph / 2 - (p ? 0 : 14));
        if (!p) { fit(g, 'Sit at a view and press the camera', 600, 18, pw - 24, 'Nunito'); g.fillText('Sit at a view and press the camera', px + pw / 2, py + ph / 2 + 20); }
      }
      if (p) {
        g.fillStyle = '#2b2340'; g.textAlign = 'left';
        const who = p.n || 'Someone'; fit(g, who, 700, 24, pw * 0.56); g.fillText(who, px + 2, ch - 23);
        g.fillStyle = '#6b5a3a'; g.textAlign = 'right';
        const where = VIEW_WORDS[p.v] || 'a scenic view'; fit(g, where, 600, 17, pw * 0.42, 'Nunito'); g.fillText(where, px + pw - 2, ch - 22);
      }
      pin(cw / 2, 4, ['#e0463c', '#3f8fd9', '#3f9a5a', '#c86cd6'][k]);
      g.restore();
    });
    // announcements: paper notes down the right (Andrew's in yellow, then what is on today)
    const nx = 812, nw = 428, top0 = 218, nh = 98, ngap = 12;
    const shown = allNotices().slice(0, SHOWN);
    if (!shown.length) { g.fillStyle = '#6b5a3a'; g.textAlign = 'center'; fit(g, 'Nothing on today. Enjoy the park!', 600, 24, nw - 30, 'Nunito'); g.fillText('Nothing on today. Enjoy the park!', nx + nw / 2, top0 + 60); }
    shown.forEach((n, k) => {
      const y = top0 + k * (nh + ngap), tilt = (hash01('note-tilt', n.id) - 0.5) * 0.03;
      g.save(); g.translate(nx + nw / 2, y + nh / 2); g.rotate(tilt); g.translate(-nw / 2, -nh / 2);
      g.fillStyle = 'rgba(60, 35, 15, 0.22)'; g.fillRect(4, 5, nw, nh);
      g.fillStyle = n.kind === 'posted' ? '#fff7c9' : '#fffaf0'; g.fillRect(0, 0, nw, nh);
      g.fillStyle = n.color || '#3f8fd9'; g.fillRect(0, 0, 10, nh);
      g.textAlign = 'left'; g.fillStyle = '#2b2340';
      fit(g, n.title, 700, 26, nw - 56); g.fillText(n.title, 26, 28);
      g.fillStyle = '#4a3f5c'; g.font = F(600, 19, 'Nunito');
      wrap(g, n.text || '', nw - 44, 2).forEach((line, li) => g.fillText(line, 26, 60 + li * 24));
      pin(nw - 20, 10, n.color || '#3f8fd9');
      g.restore();
    });
    tex.needsUpdate = true;
  }
  function pin(x, y, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x - 3, y - 3, 3.5, 0, Math.PI * 2); g.fill(); }
  function round(gg, x, y, w, h, r) { gg.beginPath(); gg.moveTo(x + r, y); gg.arcTo(x + w, y, x + w, y + h, r); gg.arcTo(x + w, y + h, x, y + h, r); gg.arcTo(x, y + h, x, y, r); gg.arcTo(x, y, x + w, y, r); gg.closePath(); }
  // words into at most n lines of width w (the last one ends in "..." when it runs on)
  function wrap(gg, text, w, n) {
    const words = String(text).split(' '), out = [];
    let line = '', used = 0;
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (gg.measureText(t).width <= w || !line) { line = t; used++; continue; }
      out.push(line); line = wd;
      if (out.length === n) { line = ''; break; }
      used++;
    }
    if (line && out.length < n) out.push(line);
    if (used < words.length && out.length) { let l = out[out.length - 1]; while (l && gg.measureText(l + '...').width > w) l = l.slice(0, -1); out[out.length - 1] = l.trimEnd() + '...'; }
    return out.slice(0, n);
  }
  if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => { painted = ''; });

  // ---- the card
  const card = createCard(ctx, { get list() { return visibleList(); }, get held() { return held; }, get admin() { return admin || nAdmin; }, get slots() { return slots; }, get notices() { return allNotices(); }, hide, refresh: refreshAll });
  function hide(id) {
    hidden.add(id);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden].slice(-300))); } catch { /* private mode */ }
    slotKey = ''; painted = '';
  }

  let nightK = -1, near = false;
  return {
    update() {
      const d = Math.hypot(player.pos.x - bx, player.pos.z - bz);
      near = d < NEAR;
      if (!near) { if (card.open) card.close(); return; }
      if ((stale || performance.now() - fetchedAt > 120000) && !fetching) refresh();
      if ((nStale || performance.now() - nAt > 120000) && !nFetching) refreshNotices();
      const now = net.serverNow();
      if (now - autoAt > 30000 || now < autoAt) { autoAt = now; autos = autoNotices(now, ctx.config?.games || []); }
      const nk = allNotices().map(n => n.id + ':' + n.title + ':' + n.text).join('|');
      if (nk !== noticeKey) { noticeKey = nk; painted = ''; }
      const next = pick(visibleList(), now);
      const key = next.map(p => p ? p.id : '-').join(',');
      if (key !== slotKey) { slotKey = key; slots = next; painted = ''; }
      const ready = slots.map(p => (p ? (imageOf(p).ok ? p.id : p.id + '?') : '-')).join(',');
      if (ready !== painted) { painted = ready; paint(); }
      // dimmer at night (the lantern lights it), like the lit world round it
      const k = Math.round((1 - 0.5 * LIGHT.night) * 50) / 50;
      if (k !== nightK) { nightK = k; mat.color.setScalar(k); }
      if (card.open && d > 6) card.close();
    },
    target(px, pz) {
      const dx = px - bx, dz = pz - bz, f = dx * fx + dz * fz, a = dx * rx + dz * rz;
      if (f > 0.3 && f < 3.4 && Math.abs(a) < BOARD.w / 2 + 0.6) return { hint: card.open ? 'E  Next' : 'E  Read the community board', prio: 6, run: () => (card.open ? card.next(1) : card.show()) };
      return null;
    },
    onKey(code) { return card.onKey(code); },
    get list() { return visibleList(); }, get slots() { return slots; }, get admin() { return admin || nAdmin; }, get held() { return held; },
    get notices() { return allNotices(); }, get posted() { return posted; }, SLOTS, SHOWN, TITLE,
    refresh: refreshAll, card, pick, face, canvas, spot: { x: bx, z: bz, yaw, y: by }, size: BOARD,
    loaded: () => slots.filter(Boolean).every(p => imgs.get(p.id)?.ok), get painted() { return painted; },
  };
}

// The board's card: Announcements (every notice; an admin posts and takes down his own) and Photos (one at a time, big,
// with what it is and what you can do about it)
function createCard(ctx, src) {
  const { hud, audio } = ctx;
  const root = el('div', 'panel photo-view', '', { role: 'dialog', 'aria-label': 'The community board' }); root.hidden = true;
  const title = el('div', 'pv-title', 'Strickler Park community board');
  const secs = el('div', 'pv-secs');
  const sNews = el('button', 'pv-sec pv-sec-news', 'Announcements', { type: 'button' }), sPhotos = el('button', 'pv-sec pv-sec-photos', 'Photos', { type: 'button' });
  secs.append(sNews, sPhotos);
  // -- announcements
  const newsBox = el('div', 'pv-news');
  const list = el('ul', 'pv-notes');
  const form = el('form', 'pv-post'); form.hidden = true;
  const fTitle = el('input', 'pv-in', '', { type: 'text', maxlength: '40', placeholder: 'Title', 'aria-label': 'Notice title' });
  const fText = el('textarea', 'pv-in', '', { maxlength: '120', rows: '2', placeholder: 'A line or two (120 letters)', 'aria-label': 'Notice text' });
  const fUntil = el('input', 'pv-in pv-until', '', { type: 'date', 'aria-label': 'Take it down after (optional)' });
  const fUntilL = el('label', 'pv-until-l', 'Take down after (optional)');
  const fGo = el('button', 'btn primary pv-post-go', 'Post on the board', { type: 'submit' });
  const fRow = el('div', 'pv-post-row'); fRow.append(fUntilL, fUntil, fGo);
  form.append(el('div', 'pv-post-h', 'Post a notice'), fTitle, fText, fRow);
  newsBox.append(list, form);
  // -- photos
  const photoBox = el('div', 'pv-photos');
  const tabs = el('div', 'pv-tabs');
  const tAll = el('button', 'pv-tab', 'Everyone', { type: 'button' }), tMine = el('button', 'pv-tab', 'Mine', { type: 'button' }), tHeld = el('button', 'pv-tab', 'Held', { type: 'button' });
  tabs.append(tAll, tMine, tHeld);
  const img = el('img', 'pv-img', '', { alt: '' });
  const cap = el('div', 'pv-cap');
  const prev = el('button', 'btn pv-prev', 'Back', { type: 'button', 'aria-label': 'The photo before' }), next = el('button', 'btn pv-next', 'Next', { type: 'button', 'aria-label': 'The next photo' });
  const report = el('button', 'btn pv-report', 'Hide and report', { type: 'button' }), del = el('button', 'btn pv-delete', 'Delete', { type: 'button' }), keep = el('button', 'btn pv-keep', 'Keep it', { type: 'button' });
  const nav = el('div', 'pv-btns'); nav.append(prev, next);
  const acts = el('div', 'pv-btns'); acts.append(report, del, keep);
  photoBox.append(tabs, img, cap, nav, acts);
  const msg = el('div', 'pv-msg');
  const close = el('button', 'btn primary pv-close', 'Close', { type: 'button' });
  const foot = el('div', 'pv-btns'); foot.append(close);
  root.append(title, secs, newsBox, photoBox, msg, foot);
  hud.append(root);
  let open = false, i = 0, tab = 'all', sec = 'news', items = [], heldUrl = null;
  const signedIn = () => ctx.accounts?.auth?.mode === 'account';
  function itemsNow() { return tab === 'held' ? src.held : tab === 'mine' ? src.list.filter(p => p.mine) : src.list; }
  function sync() { items = itemsNow(); if (i >= items.length) i = Math.max(0, items.length - 1); draw(); }
  const ago = at => { const m = Math.max(0, (Date.now() - at) / 60000); return m < 2 ? 'just now' : m < 60 ? `${Math.round(m)} minutes ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
  const dateWords = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  function drawNews() {
    list.replaceChildren();
    const ns = src.notices;
    if (!ns.length) list.append(el('li', 'pv-note pv-empty', 'Nothing on today. Enjoy the park!'));
    for (const n of ns) {
      const li = el('li', 'pv-note' + (n.kind === 'posted' ? ' posted' : ''));
      li.style.setProperty('--c', n.color || '#3f8fd9');
      li.append(el('div', 'pv-note-t', n.title), el('div', 'pv-note-x', n.text || ''));
      if (n.kind === 'posted') {
        li.append(el('div', 'pv-note-m', 'From ' + (n.by || 'Andrew') + (n.until ? ', up until ' + dateWords(n.until) : '')));
        if (src.admin) { const d = el('button', 'btn pv-note-del', 'Take it down', { type: 'button', 'data-id': n.id }); d.onclick = () => takeDown(n.id); li.append(d); }
      }
      list.append(li);
    }
    form.hidden = !src.admin;
  }
  async function draw() {
    for (const [b, t] of [[sNews, 'news'], [sPhotos, 'photos']]) b.setAttribute('aria-pressed', sec === t ? 'true' : 'false');
    newsBox.hidden = sec !== 'news'; photoBox.hidden = sec !== 'photos';
    if (sec === 'news') { drawNews(); return; }
    tMine.hidden = !signedIn(); tHeld.hidden = !src.admin;
    for (const [b, t] of [[tAll, 'all'], [tMine, 'mine'], [tHeld, 'held']]) b.setAttribute('aria-pressed', tab === t ? 'true' : 'false');
    const p = items[i];
    prev.disabled = items.length < 2; next.disabled = items.length < 2;
    report.hidden = !p || p.mine || tab === 'held'; del.hidden = !p || !(p.mine || src.admin); keep.hidden = !p || tab !== 'held';
    if (p) del.textContent = p.mine ? 'Delete my photo' : 'Remove it';
    if (!p) { img.hidden = true; cap.textContent = tab === 'mine' ? 'You have not shared a photo yet. Sit at the firepit or the lake bench and press the camera.' : tab === 'held' ? 'Nothing is waiting for a look.' : 'No photos yet. Be the first!'; return; }
    img.hidden = false;
    if (heldUrl) { URL.revokeObjectURL(heldUrl); heldUrl = null; }
    if (tab === 'held') { // a held picture is only served to an admin's fetch (with the token)
      try { const r = await fetch(p.url, { headers: ctx.accounts.headers(), cache: 'no-store' }); if (r.ok) { heldUrl = URL.createObjectURL(await r.blob()); img.src = heldUrl; } } catch { /* gone */ }
    } else img.src = p.url;
    img.alt = `A photo by ${p.n || 'someone'} ${VIEW_WORDS[p.v] || ''}`.trim();
    cap.textContent = `${p.n || 'Someone'}, ${VIEW_WORDS[p.v] || 'at a scenic view'}, ${ago(p.at)}  (${i + 1} of ${items.length})`;
  }
  function show(section = 'news') {
    open = true; root.hidden = false; tab = 'all'; sec = section; msg.textContent = '';
    // the photos start on what the board is showing now
    const first = src.slots.find(Boolean); items = itemsNow(); i = first ? Math.max(0, items.findIndex(p => p.id === first.id)) : 0;
    draw(); audio.ui?.('blip');
    if (ctx.input?.lastDevice !== 'touch') setTimeout(() => (sec === 'photos' ? next : sPhotos).focus({ preventScroll: true }), 30);
  }
  function hideCard() { open = false; root.hidden = true; if (heldUrl) { URL.revokeObjectURL(heldUrl); heldUrl = null; } }
  function step(d) { if (sec !== 'photos' || !items.length) return; i = (i + d + items.length) % items.length; msg.textContent = ''; draw(); }
  function setSec(s) { sec = s; msg.textContent = ''; sync(); }
  async function act(op) {
    const p = items[i]; if (!p) return;
    if (op === 'report') { src.hide(p.id); msg.textContent = 'Hidden. Thanks for keeping the board kind.'; }
    let res = null;
    try { const r = await fetch(`/api/photos/${p.id}/${op}`, { method: 'POST', headers: ctx.accounts?.headers?.() || {}, cache: 'no-store' }); res = await r.json().catch(() => null); } catch { /* offline */ }
    if (op === 'delete') msg.textContent = res && res.ok ? 'Deleted.' : (res && res.message) || 'That did not work.';
    if (op === 'keep') msg.textContent = res && res.ok ? 'Back on the board.' : 'That did not work.';
    await src.refresh();
    sync();
    return res;
  }
  // an admin's notices
  async function post(body) {
    let res = null;
    try { const r = await fetch('/api/notices', { method: 'POST', headers: { ...(ctx.accounts?.headers?.() || {}), 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' }); res = await r.json().catch(() => null); if (res) res.status = r.status; } catch { /* offline */ }
    msg.textContent = res && res.ok ? 'Posted. It is on the board.' : (res && res.message) || 'That did not work.';
    if (res && res.ok) { fTitle.value = ''; fText.value = ''; fUntil.value = ''; }
    await src.refresh(); sync();
    return res;
  }
  async function takeDown(id) {
    let res = null;
    try { const r = await fetch(`/api/notices/${id}/delete`, { method: 'POST', headers: ctx.accounts?.headers?.() || {}, cache: 'no-store' }); res = await r.json().catch(() => null); } catch { /* offline */ }
    msg.textContent = res && res.ok ? 'Taken down.' : (res && res.message) || 'That did not work.';
    await src.refresh(); sync();
    return res;
  }
  form.onsubmit = e => { e.preventDefault(); post({ title: fTitle.value, text: fText.value, until: fUntil.value || undefined }); };
  sNews.onclick = () => setSec('news'); sPhotos.onclick = () => setSec('photos');
  prev.onclick = () => step(-1); next.onclick = () => step(1);
  report.onclick = () => act('report'); del.onclick = () => act('delete'); keep.onclick = () => act('keep'); close.onclick = () => hideCard();
  tAll.onclick = () => { tab = 'all'; i = 0; sync(); }; tMine.onclick = () => { tab = 'mine'; i = 0; sync(); }; tHeld.onclick = () => { tab = 'held'; i = 0; sync(); };
  return {
    get open() { return open; }, get index() { return i; }, get items() { return items; }, get tab() { return tab; }, get section() { return sec; },
    show, close: hideCard, next: step, sync, act, post, takeDown, setSection: setSec, setTab: t => { tab = t; sec = 'photos'; i = 0; sync(); },
    onKey(code) {
      if (!open) return false;
      if (code === 'Escape') { hideCard(); return true; }
      if (code === 'ArrowLeft' || code === 'PadLeft') { if (sec === 'photos') step(-1); else setSec('photos'); return true; }
      if (code === 'ArrowRight' || code === 'PadRight' || code === 'KeyE') { if (sec === 'photos') step(1); else setSec('photos'); return true; }
      return false;
    },
  };
}
