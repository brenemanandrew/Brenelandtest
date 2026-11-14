// The board-game base in the world (table-games, wave 2; tg-life): the "free to borrow" cabinet in the game store with a box per
// table game, taking one and carrying it (in your right hand, everyone sees it), and a game's three stages on any free table
// (tables.js): put down (E with the box: set out, anybody's), play (E by a chair sits you; the first one seated hosts: the
// settings, bots and town folk, Start; getting up leaves your seat to a bot or free for anyone, the game stays on the table) and
// put away (E at the table away from the chairs when nobody sits there, or the button once seated: back to its cabinet). The
// pieces in 3D on the table for passers-by, bots and town folk in the chairs with bodies (looking at whose turn it is, a hand at
// the chin on their own), a seat's camera (first person, or the three-quarter view) and one flat overlay frame shared by every
// game (overlay.js, laid out by tg-layout.js, editable in the HUD Editor), the moments one after another, reconnects. Nothing of
// a game stays on screen once its overlay shuts (float() / sweep()). The server is lib/table-games/index.js (the nightly reset,
// the tables kept across a restart). The one game so far: Mexican Train (mt-3d.js, mt-ui.js).
import * as THREE from 'three';
import { el } from '../util.js';
import { Batcher, GEO } from '../batch.js';
import { Human } from '../human.js';
import { NPCS, lookOf, voiceOf, tagOf } from '../npc-looks.js';
import { ANIM_CODES } from '../codes.js';
import { signTexture } from '../areas.js';
import { collectTables } from './tables.js';
import { createFrame } from './overlay.js';
import { createMt3D, SEAT_COLORS } from './mt-3d.js';
import * as MT from './mt-ui.js';

const KEY_STORE = 'breneland.tgKey', TIP_STORE = 'breneland.tgTip', VIEW_STORE = 'breneland.tgView';
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* private */ } } };
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };
const DWELL = { place: 700, draw: 800, pass: 1200, marker: 700, double: 1800, knock: 1500, caught: 1800, out: 1500, blocked: 2000, roundEnd: 7000, deal: 2000, gameOver: 9000, start: 400 };
const PACES = { unhurried: 1.6, steady: 1, brisk: 0.6 };
const LEVEL_WORDS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const INK = 'stroke="#2b2340" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const MY_ICON = { // (static markup only)
  putaway: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="10" width="18" height="10" rx="1.5" fill="#1f5560" ${INK}/><rect x="2.5" y="8" width="19" height="3.4" rx="1" fill="#e3aa45" ${INK}/><path d="M12 2v6m-2.6-2.6L12 8l2.6-2.6" fill="none" ${INK}/></svg>`,
  stop: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="#e0463c" ${INK}/><rect x="9" y="9" width="6" height="6" rx="1" fill="#fff8ec"/></svg>`,
};
const myIco = k => { const s = el('span', 'tg-ico'); s.innerHTML = MY_ICON[k]; return s; };

export function createTableGames(ctx) {
  const { scene, player, net, ui, audio, camera } = ctx;
  const store = ctx.features?.find(f => f.name === 'store');
  const TABLES = collectTables(ctx);
  const byId = new Map(TABLES.map(t => [t.id, t]));
  const S = { games: [], boxes: [], tables: new Map(), you: null, open: null, openId: null, sel: null, order: [], beats: [], fresh: null, view: ls.get(VIEW_STORE) === 'tq' ? 'tq' : 'fp', watchAt: null, seated: null, played: [], lastSay: [] };
  const frame = createFrame(ctx);
  // anything of the game's drawn outside the frame (a dragged tile, a tile flying in) is kept here, so every way out sweeps it
  // (anyone adding such a piece: float() it, or mark it data-tg-float)
  const floats = new Set();
  const float = e => { e.dataset.tgFloat = '1'; floats.add(e); document.body.append(e); return e; };
  const unfloat = e => { e.remove(); floats.delete(e); };
  function sweep() { endDrag(); for (const e of floats) e.remove(); floats.clear(); for (const e of document.querySelectorAll('[data-tg-float]')) e.remove(); }
  frame.toggle.onclick = e => { e.stopPropagation(); S.view = S.view === 'tq' ? 'fp' : 'tq'; ls.set(VIEW_STORE, S.view); audio.ui?.('blip'); render(); };
  frame.board.addEventListener('click', e => { if (!e.target.closest('.tg-spot, button') && S.sel) { S.sel = null; render(); } });

  // ---------------------------------------------------------------- the free-to-borrow shelf in the store, and the boxes on it
  const shelf = (() => {
    if (!store?.plan) return null;
    const P = store.plan, fy = P.floorY, x = P.sx + 3.7, z = P.iMinZ + 0.24, inside = store.back?.door?.parent || scene;
    // a low cabinet under the window leaderboard (its glass starts above it): the games stand on top and on the shelf inside, the
    // sign on the closed bay below
    const b = new Batcher({ vertexColors: true, castShadow: false });
    const W2 = 0.55, D = 0.36, H = 0.72, wood = '#6b4128', dark = '#4a2c1c';
    for (const k of [-1, 1]) b.add(GEO.box, wood, { x: x + k * W2, y: fy + H / 2, z, sx: 0.04, sy: H, sz: D });
    for (const h of [0.02, 0.36, H]) b.add(GEO.box, h === H ? dark : wood, { x, y: fy + h, z, sx: W2 * 2 + (h === H ? 0.06 : 0.04), sy: 0.04, sz: D + (h === H ? 0.03 : 0) });
    b.add(GEO.box, '#3a2418', { x, y: fy + H / 2, z: z - D / 2 + 0.012, sx: W2 * 2 - 0.02, sy: H - 0.02, sz: 0.02 });
    b.add(GEO.box, '#2f6b4f', { x, y: fy + 0.19, z: z + D / 2 - 0.01, sx: W2 * 2 - 0.04, sy: 0.3, sz: 0.02 });
    b.build(inside, 'tg-borrow-shelf');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.26), new THREE.MeshBasicMaterial({ map: signTexture(['FREE TO BORROW', 'take a game to any table'], { bg: '#2f6b4f', fg: '#fff4dc', w: 512, h: 136 }), fog: true }));
    sign.position.set(x, fy + 0.19, z + D / 2 + 0.002); sign.name = 'tg-borrow-sign'; inside.add(sign);
    ctx.colliders.push({ type: 'box', minX: x - W2 - 0.03, maxX: x + W2 + 0.03, minZ: z - D / 2, maxZ: z + D / 2 });
    return { x, z, y: fy + H, fy, inside, slots: [[x - 0.27, fy + H + 0.02], [x + 0.27, fy + H + 0.02], [x - 0.27, fy + 0.38], [x + 0.27, fy + 0.38]] };
  })();
  const boxArt = new Map(); // game -> material for its lid
  function lidMat(game) {
    if (boxArt.has(game)) return boxArt.get(game);
    const name = (S.games.find(g => g.id === game)?.name || game).toUpperCase();
    const m = new THREE.MeshBasicMaterial({ map: signTexture([name, 'dominoes for 2 to 8'], { bg: '#1f5560', fg: '#ffd34d', w: 512, h: 256 }), fog: true });
    boxArt.set(game, m); return m;
  }
  const shelfBoxes = []; // { game, copy, group }
  function syncShelf() {
    if (!shelf) return;
    let i = 0;
    for (const b of S.boxes) {
      let sb = shelfBoxes.find(x => x.game === b.game && x.copy === b.copy);
      if (!sb) {
        const g = new THREE.Group(), [sx, sy] = shelf.slots[shelfBoxes.length % shelf.slots.length];
        const body = new Batcher({ vertexColors: true, castShadow: false });
        body.add(GEO.box, '#1f5560', { x: 0, y: 0.11, z: 0, sx: 0.4, sy: 0.22, sz: 0.27 });
        body.add(GEO.box, '#e3aa45', { x: 0, y: 0.06, z: 0, sx: 0.404, sy: 0.04, sz: 0.274 });
        body.build(g, 'tg-box');
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.19), lidMat(b.game)); face.position.set(0, 0.12, -0.137); face.rotation.y = Math.PI; g.add(face); // (its label to the shop: the shelf's open side faces south, into the room)
        face.rotation.y = 0; face.position.z = 0.137;
        g.position.set(sx, sy, shelf.z + 0.02); g.name = 'tg-shelf-box'; shelf.inside.add(g);
        sb = { game: b.game, copy: b.copy, group: g, x: sx, y: sy, z: shelf.z };
        shelfBoxes.push(sb);
      }
      sb.group.visible = b.at === 'shelf';
      i++;
    }
    void i;
  }

  // ---------------------------------------------------------------- the table's pieces in 3D and the town folk in chairs
  const vis = new Map(); // table id -> { mt, npcs: Map(chair -> { h, tag, id, bot }) } (town folk and bots in their chairs)
  function visOf(id) {
    let v = vis.get(id); if (v) return v;
    const d = byId.get(id); if (!d) return null;
    v = { mt: createMt3D(d.parent, d), npcs: new Map(), d };
    d.setOut?.(true); // (the picnic tables clear their food off for the pieces)
    vis.set(id, v); return v;
  }
  function dropVis(id) {
    const v = vis.get(id); if (!v) return;
    v.mt.dispose();
    for (const n of v.npcs.values()) { scene.remove(n.h.root); n.h.dispose(); n.tag?.remove?.(); }
    if (v.d.hideWhileOn) { const g = v.d.hideWhileOn(); if (g) g.visible = !v.d.free() ? g.visible : true; }
    v.d.setOut?.(false);
    vis.delete(id);
  }
  // who sits in each chair that no player's own avatar fills: a town folk as themselves, a bot with a town folk's look (the server
  // picks it: seat.look) and the bot's own name on its tag. Never an empty chair with tiles in front of it.
  function syncNpcs(T, v) {
    const want = new Map();
    T.seats.forEach((s, chair) => {
      if (s && s.kind === 'npc' && NPCS[s.npc]) want.set(chair, { id: s.npc, key: 'npc:' + s.npc, tag: tagOf(s.npc, NPCS[s.npc].name), bot: false });
      else if (s && s.kind === 'bot') { const id = NPCS[s.look] ? s.look : 'sam'; want.set(chair, { id, key: 'bot:' + id + ':' + s.name, tag: s.name, bot: true }); }
    });
    for (const [chair, n] of [...v.npcs]) if (want.get(chair)?.key !== n.key) { scene.remove(n.h.root); n.h.dispose(); n.tag?.remove?.(); v.npcs.delete(chair); }
    for (const [chair, w] of want) {
      if (v.npcs.has(chair)) continue;
      const seat = v.d.seats[chair]; if (!seat) continue;
      const h = new Human({ ...lookOf(w.id, NPCS[w.id].look) });
      h.root.position.set(seat.x, seat.y, seat.z); h.root.rotation.y = seat.yaw; h.params.seatY = seat.seatY; h.params.table = seat.hands;
      h.root.name = 'tg-sitter';
      scene.add(h.root);
      const tag = ui.nameTag(h.root, w.tag, w.bot ? '#d6e6ff' : '#ffffff'); if (tag) { tag.max = 14; tag.fade = 9; }
      v.npcs.set(chair, { h, tag, id: w.id, key: w.key, bot: w.bot, voice: voiceOf(w.id, NPCS[w.id].voice), talk: 0 });
    }
  }
  // the one whose turn it is, as something to look at: their body in the chair (yours, a friend's, a town folk's or a bot's)
  function bodyAt(T, chair) {
    const s = T.seats[chair]; if (!s) return null;
    if (s.kind === 'human') return s.sid === net.sid ? player.character : ctx.remotes?.map?.get(s.sid)?.ch || null;
    return vis.get(T.id)?.npcs.get(chair)?.h || null;
  }
  const lookPt = { x: 0, y: 0, z: 0 };
  // a sitter each frame: looks at whoever's turn it is; on its own turn, down at its tiles with a hand at the chin, thinking
  function sitterAnim(T, chair, n, seat, now) {
    if (n.talk > now) return 'talk';
    if (T.phase !== 'play' || !T.order || !T.view || T.view.phase !== 'play') return 'sit';
    const k = T.order.indexOf(chair), turn = T.view.turn;
    if (k >= 0 && turn === k) {
      const f = Math.sin(seat.yaw), g = Math.cos(seat.yaw), d = byId.get(T.id);
      lookPt.x = seat.x + f * 0.45; lookPt.y = d ? d.top : seat.y + 0.75; lookPt.z = seat.z + g * 0.45;
      n.h.lookAt(lookPt, 0.4);
      return T.paused || (T._holdUntil || 0) > performance.now() ? 'sit' : 'think';
    }
    const who = turn >= 0 ? bodyAt(T, T.order[turn]) : null;
    if (who && who !== n.h) n.h.lookAt(who, 0.4);
    return 'sit';
  }

  // ---------------------------------------------------------------- the server
  const pubOf = id => S.tables.get(id) || null;
  const mySeat = () => { for (const T of S.tables.values()) { const c = T.seats.findIndex(s => s && s.kind === 'human' && s.sid === net.sid); if (c >= 0) return { T, chair: c }; } return null; };
  const carrying = () => S.boxes.find(b => b.at === 'carry' && b.sid === net.sid) || null;
  function takeTable(T, beats) {
    const was = S.tables.get(T.id);
    T._turnEnds = T.turnLeft ? performance.now() + T.turnLeft : 0; // (the host's turn timer: the turn chip counts it down)
    T._holdUntil = performance.now() + (T.hold || 0); // (the moment being shown: a bot thinks after it)
    S.tables.set(T.id, T);
    const d = byId.get(T.id);
    if (d) {
      const v = visOf(T.id);
      if (v) {
        syncNpcs(T, v);
        const order = T.phase === 'setup' ? null : T.order;
        if (beats && beats.length) for (const b of beats) if (b.kind === 'place' && T.view) { v.mt.slide(T.view, order, b); break; }
        if (!v.mt.flying) v.mt.update(T.view, order, T.phase);
      }
    }
    if (beats && beats.length) onBeats(T, beats, was);
    if (S.openId === T.id) render();
  }
  net.on('tg', m => {
    if (m.op === 'list') {
      S.games = m.games || []; S.boxes = m.boxes || [];
      const ids = new Set((m.tables || []).map(t => t.id));
      for (const id of [...S.tables.keys()]) if (!ids.has(id)) gone(id, '');
      for (const T of m.tables || []) takeTable(T);
      syncShelf(); syncCarry();
      if (S.open) render();
    } else if (m.op === 'table') takeTable(m.table, m.beats);
    else if (m.op === 'gone') gone(m.table, m.why);
    else if (m.op === 'you') {
      S.you = m; if (m.key) ss.set(KEY_STORE, m.key);
      if (S.seated?.id !== m.table || S.seated?.chair !== m.seat) { const d = byId.get(m.table); if (d && d.seats[m.seat]) sitDown(d, m.seat); }
      keepOrder(); if (S.openId === m.table) render();
    } else if (m.op === 'say') heard(m);
    else if (m.op === 'no') { if (m.why) ui.toast(m.why, 3000); }
    else if (m.op === 'rejoin' && !m.ok) ss.set(KEY_STORE, null);
  });
  function gone(id, why) {
    const T = S.tables.get(id); S.tables.delete(id); dropVis(id);
    if (S.seated?.id === id) { standUp(true); if (why) ui.toast(why, 3600); }
    if (S.openId === id) close();
    if (S.you?.table === id) { S.you = null; ss.set(KEY_STORE, null); }
    void T;
  }
  const hello = () => { net.send({ t: 'tg', op: 'hello' }); const k = ss.get(KEY_STORE); if (k) setTimeout(() => net.send({ t: 'tg', op: 'rejoin', key: k }), 300); };
  net.on('welcome', () => setTimeout(hello, 200));
  if (net.sid) setTimeout(hello, 200);

  // ---------------------------------------------------------------- carrying the box (your right hand; others see it through HELD_CODES)
  function syncCarry() {
    const c = carrying();
    if (c && !S.seated) { if (player.held !== 'gamebox') player.setHeld('gamebox'); }
    else if (player.held === 'gamebox') player.setHeld(null);
  }

  // ---------------------------------------------------------------- sitting: your own takeover, first person or the three-quarter view
  const fpEye = new THREE.Vector3(), fpAt = new THREE.Vector3(), camP = new THREE.Vector3(), camL = new THREE.Vector3();
  const look = { yaw: 0, pitch: 0 };
  let hidRoot = false;
  function sitDown(d, chair) {
    const seat = d.seats[chair]; if (!seat) return;
    S.seated = { id: d.id, chair, seat, at: performance.now() / 1000, d };
    if (player.held === 'gamebox') player.setHeld(null);
    player.pos.set(seat.x, seat.y, seat.z); player.yaw = seat.yaw;
    player.character.params.seatY = seat.seatY; player.character.params.table = seat.hands;
    look.yaw = 0; look.pitch = 0;
    camP.copy(camera.position); camL.set(d.x, d.top, d.z);
    const t0 = performance.now() / 1000;
    player.takeover = {
      anim: 'sit', tg: true,
      update(dt, now, inp, pl) {
        pl.pos.set(seat.x, seat.y, seat.z); pl.yaw = seat.yaw;
        const T = pubOf(d.id), mv = inp.move();
        if (Math.hypot(mv.x, mv.y) > 0.5 && now - t0 > 0.8 && (!T || T.phase !== 'play')) stand(); // (in a game you get up with the button: a bump of the stick never hands your seat to a bot)
      },
      camera(dt, cam, inp) {
        const l = inp.takeLook();
        if (look && (l.x || l.y)) { look.yaw = Math.max(-1.1, Math.min(1.1, look.yaw - l.x * 0.004)); look.pitch = Math.max(-0.5, Math.min(0.5, look.pitch + l.y * 0.003)); }
        else { look.yaw *= Math.exp(-dt * 0.6); look.pitch *= Math.exp(-dt * 0.6); }
        const tq = S.view === 'tq', fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw), rx = Math.cos(seat.yaw), rz = -Math.sin(seat.yaw);
        if (tq) {
          showMe(); { const r = player.character?.root; if (r && !r.visible) r.visible = true; } // (you are in the shot, whoever hid you: the store's walking first person does)
          fpEye.set(seat.x - fx * 1.25 + rx * 0.55, seat.y + seat.seatY + 1.45, seat.z - fz * 1.25 + rz * 0.55);
          fpAt.set(d.x, d.top, d.z);
          const c = Math.cos(look.yaw * 0.4), s = Math.sin(look.yaw * 0.4), dx = fpEye.x - seat.x, dz = fpEye.z - seat.z;
          fpEye.x = seat.x + dx * c - dz * s; fpEye.z = seat.z + dx * s + dz * c;
        } else {
          hideMe();
          const head = player.character?.head;
          if (head) { head.updateWorldMatrix(true, false); head.getWorldPosition(fpEye); } else fpEye.set(seat.x, seat.y + seat.seatY + 0.85, seat.z);
          fpEye.x += fx * 0.14; fpEye.z += fz * 0.14;
          // looking down at the table's middle, a drag turns the head a little (and it eases back)
          const ty = Math.atan2(d.x - fpEye.x, d.z - fpEye.z) + look.yaw, dist = Math.hypot(d.x - fpEye.x, d.z - fpEye.z);
          const pitch = Math.atan2(fpEye.y - d.top, Math.max(0.2, dist)) * 0.92 + look.pitch;
          fpAt.set(fpEye.x + Math.sin(ty) * Math.cos(pitch), fpEye.y - Math.sin(pitch), fpEye.z + Math.cos(ty) * Math.cos(pitch));
        }
        const k = 1 - Math.exp(-dt * (performance.now() / 1000 - t0 > 0.7 ? 14 : 5));
        camP.lerp(fpEye, k); camL.lerp(fpAt, k);
        cam.position.copy(camP); cam.lookAt(camL);
        return true;
      },
    };
    audio.ui?.('pop');
    open('seat', d.id);
  }
  const hideMe = () => { const r = player.character?.root; if (r && r.visible) { r.visible = false; hidRoot = true; } };
  const showMe = () => { const r = player.character?.root; if (r && hidRoot) { r.visible = true; hidRoot = false; } };
  function standUp(fromServer) {
    const st = S.seated; if (!st) return;
    S.seated = null; showMe(); sweep();
    if (player.takeover?.tg) player.takeover = null;
    player.character.params.seatY = 0; player.character.params.table = null;
    const s = st.seat, bx = s.x - Math.sin(s.yaw) * 0.75, bz = s.z - Math.cos(s.yaw) * 0.75;
    player.pos.set(bx, s.y, bz); player.collide?.();
    if (player.cam) { player.cam.yaw = s.yaw + Math.PI; player.cam.pitch = 0.3; player.cam.pos?.copy(camera.position); }
    if (!fromServer) net.send({ t: 'tg', op: 'stand' });
    if (S.open === 'seat') close();
    audio.musicApi?.game?.('end', { id: 'mexican-train' });
    syncCarry();
  }
  function stand() {
    const T = S.seated && pubOf(S.seated.id);
    if (T && T.phase === 'play' && !confirmLeave) { confirmLeave = true; ui.toast(T.table?.keep === false ? 'Leave the game? Your seat waits for someone to sit in. Tap Stand up again to go.' : 'Leave the game? A bot plays on for you. Tap Stand up again to go.', 3500); setTimeout(() => { confirmLeave = false; }, 3600); return; }
    confirmLeave = false; standUp(false);
  }
  let confirmLeave = false, confirmEnd = false;
  function endGame() {
    const T = S.seated && pubOf(S.seated.id); if (!T) return;
    if (T.phase === 'play' && !confirmEnd) { confirmEnd = true; ui.toast('End the game for everyone? Tap again to end it.', 3500); setTimeout(() => { confirmEnd = false; }, 3600); return; }
    confirmEnd = false; net.send({ t: 'tg', op: 'end', table: T.id });
  }

  // ---------------------------------------------------------------- the overlay: open, close, render
  function open(mode, id) {
    S.open = mode; S.openId = id; S.watchAt = mode === 'watch' ? { x: player.pos.x, z: player.pos.z } : null;
    S.sel = null; keepOrder();
    frame.show(mode);
    render();
    fitView(true);
  }
  function close() {
    S.open = null; S.openId = null; S.sel = null; sweep(); frame.hide(); fitView(true);
  }
  // upright and seated, the 3D view is the band above the panel (the D&D table's way: dnd.js fitView)
  const fit = { on: false, v: 0 };
  function fitView(force) {
    const want = !!S.open && frame.form === 'portrait', W = innerWidth, H = innerHeight, ink = ctx.ink;
    if (!want) { if (fit.on) { fit.on = false; camera.clearViewOffset(); camera.aspect = W / H; camera.updateProjectionMatrix(); if (ink) ink.clip = 1; } return; }
    const v = Math.max(120, Math.round(frame.L.view.h * H));
    if (!force && fit.on && fit.v === v && camera.view?.enabled && Math.abs(camera.aspect - W / v) < 1e-9) return;
    fit.on = true; fit.v = v; camera.aspect = W / v; camera.setViewOffset(W, v, 0, 0, W, H); if (ink) ink.clip = Math.min(1, (v + 16) / H);
  }
  function keepOrder() {
    const hand = S.you?.view?.hand || [];
    const keys = hand.map(MT.tileKey), kept = S.order.filter(k => keys.includes(k));
    for (const k of keys) if (!kept.includes(k)) kept.push(k);
    S.order = kept;
  }
  const meIn = T => (S.you && S.you.table === T.id && T.order ? S.you.eseat : null);
  function render() {
    const T = S.openId && pubOf(S.openId); if (!T) return;
    frame.relayout();
    const seated = S.open === 'seat' && S.you?.table === T.id, me = seated ? meIn(T) : null;
    const v = seated && S.you.view ? S.you.view : T.view, moves = seated && S.you ? S.you.moves || [] : [];
    const host = T.host === net.sid;
    const game = S.games.find(g => g.id === T.game);
    frame.root.classList.toggle('hosting', host);
    // the players strip
    renderBar(T, v, me);
    // the board: the setup, the game, or the scores
    const B = frame.board;
    if (T.phase === 'setup' || !v) renderSetup(T, game, host, seated);
    else {
      const spots = S.sel && seated ? MT.spotsFor(moves, S.sel) : [];
      MT.renderBoard(B, { T, v, me, sel: S.sel, spots, fresh: S.fresh, onSpot: train => playTo(train) });
    }
    // your hand (spectators: who is watching, and the chairs free to take)
    const Hd = frame.hand;
    Hd.classList.toggle('myturn', !!(seated && v && v.turn === me && v.phase === 'play'));
    if (seated && v && v.hand) {
      const tiles = S.order.map(k => v.hand.find(t => MT.tileKey(t) === k)).filter(Boolean);
      const playable = MT.playableKeys(moves);
      MT.renderHand(Hd, { tiles, playable, sel: S.sel ? MT.tileKey(S.sel) : null, drawn: v.drawn, onPick: pick, onDown: handDown, note: '' });
    } else {
      Hd.textContent = '';
      if (!seated) Hd.append(el('div', 'tg-hand-empty', T.phase === 'setup' ? 'Pick a chair on the board to sit in.' : T.paused ? 'Nobody is playing. Sit in where a seat is free.' : 'Watching. The next game, sit in!'));
      else if (T.phase === 'setup') Hd.append(el('div', 'tg-hand-empty', host ? 'Pick the game, add bots, then Start.' : `Waiting for ${T.hostName} to start.`));
    }
    // the buttons
    const A = frame.acts; A.textContent = '';
    const btn = (b, cls = '') => { const x = el('button', 'tg-act ' + cls + (b.hot ? ' hot' : ''), '', { type: 'button', 'aria-label': b.label, title: b.label + (b.key ? '  (' + b.key + ')' : ''), 'data-act': b.id }); x.append(MY_ICON[b.icon] ? myIco(b.icon) : MT.ico(b.icon)); if (b.word) x.append(el('span', 'tg-act-word', b.word)); x.onclick = e => { e.stopPropagation(); b.run ? b.run() : send(b.move); }; A.append(x); return x; };
    if (seated && T.phase === 'play') for (const b of MT.moveButtons(T, v, moves, me)) btn(b);
    if (seated && host && T.phase === 'setup') { // the host's Start (and packing it up) with the buttons
      const n = T.seats.filter(Boolean).length, min = game?.seats?.[0] || 2;
      const st = btn({ id: 'start', icon: 'next', label: n >= min ? 'Start the game' : `Needs ${min} players: add a bot or wait for a friend`, word: 'Start', hot: n >= min, run: () => net.send({ t: 'tg', op: 'start', table: T.id }) }, 'wide');
      st.dataset.start = '1'; st.disabled = n < min;
    }
    // put away: no game running and nobody else sitting here (the box goes back to its cabinet)
    if (seated && T.phase !== 'play' && !T.seats.some(s => s && s.kind === 'human' && s.sid !== net.sid)) btn({ id: 'putaway', icon: 'putaway', label: `Put ${gameName(T)} away (back to its cabinet)`, run: () => putAway(T) }, 'small');
    if (T.hold > 300 && seated && T.phase === 'play') btn({ id: 'hurry', icon: 'hurry', label: 'On you go (skip the wait)', run: () => net.send({ t: 'tg', op: 'hurry', table: T.id }) }, 'small');
    btn({ id: 'rules', icon: 'rules', label: 'How to play', key: '?', run: () => showRules() }, 'small');
    if (seated && host && T.phase !== 'setup') btn({ id: 'endgame', icon: 'stop', label: 'End the game (it is set out again)', run: endGame }, 'small');
    if (seated) btn({ id: 'stand', icon: 'stand', label: 'Stand up', run: stand }, 'small');
    else btn({ id: 'close', icon: 'close', label: 'Stop watching', key: 'Esc', run: close }, 'small');
    frame.toggle.hidden = !seated;
    frame.toggle.innerHTML = MT.ICON[S.view === 'tq' ? 'view' : 'view3'];
    frame.toggle.title = S.view === 'tq' ? 'First person (F)' : 'Three-quarter view (F)';
    // the end of the game
    if (T.phase === 'over' && T.result && frame.modalKind !== 'over') frame.modalShow('over', MT.overPanel(T, T.result, me));
    if (T.phase !== 'over' && frame.modalKind === 'over') frame.modalHide();
    tipOnce(seated && T.phase === 'play');
  }
  function renderBar(T, v, me) {
    const bar = frame.bar; bar.textContent = '';
    const list = T.order && T.phase !== 'setup' ? T.order.map((chair, k) => ({ chair, k })) : T.seats.map((s, chair) => ({ chair, k: null })).filter(x => T.seats[x.chair]);
    for (const { chair, k } of list) {
      const s = T.seats[chair], c = el('div', 'tg-chip' + (v && k !== null && v.turn === k && v.phase === 'play' ? ' turn' : '') + (k !== null && k === me ? ' me' : '') + (s?.away || s?.kind === 'open' ? ' away' : ''), '', { 'data-chair': chair, title: s?.kind === 'open' ? `${s.name}'s seat is free: anyone may sit in` : '' });
      c.style.setProperty('--seat', SEAT_COLORS[chair % 8]);
      c.append(el('i', 'tg-dot'));
      if (s?.kind === 'bot') c.append(MT.ico('bot', 'tg-kind')); else if (s?.kind === 'npc') c.append(MT.ico('folk', 'tg-kind'));
      c.append(el('span', 'tg-cn', k !== null && k === me ? 'You' : s?.kind === 'open' ? 'Free seat' : s?.name || ''));
      if (v && k !== null) {
        const n = (v.counts || [])[k]; const cnt = el('span', 'tg-cc'); cnt.append(MT.ico('tiles', 'tg-mini')); cnt.append(document.createTextNode(String(n ?? ''))); c.append(cnt);
        c.append(el('b', 'tg-cs', String(v.scores?.totals?.[k] ?? 0)));
        if (v.trains?.[k]?.open) { const t = MT.ico('train', 'tg-marker'); t.style.color = SEAT_COLORS[chair % 8]; c.append(t); }
        if (v.knocked?.[k]) c.append(el('span', 'tg-knocked', '1!'));
        if (T.table?.timer && v.turn === k && v.phase === 'play') c.append(el('span', 'tg-clock', '', { title: 'Time left for this turn' }));
      }
      bar.append(c);
    }
    if (v && T.phase !== 'setup') bar.append(el('div', 'tg-round-pill', `${v.round + 1}/${v.rounds}`, { title: `Round ${v.round + 1} of ${v.rounds}` }));
  }
  function renderSetup(T, game, host, seated) {
    const B = frame.board; B.textContent = '';
    const p = el('div', 'tg-setup');
    p.append(el('div', 'tg-h', game?.name || 'A table game'));
    const seats = el('div', 'tg-seats');
    T.seats.forEach((s, chair) => {
      const c = el('div', 'tg-seat' + (s ? ' taken' : ''), '', { 'data-chair': chair }); c.style.setProperty('--seat', SEAT_COLORS[chair % 8]);
      c.append(el('i', 'tg-dot'));
      if (s) {
        if (s.kind === 'bot') c.append(MT.ico('bot', 'tg-kind')); else if (s.kind === 'npc') c.append(MT.ico('folk', 'tg-kind'));
        c.append(el('span', 'tg-cn', s.sid === net.sid ? 'You' : s.name + (s.level && s.kind === 'bot' ? ' (' + LEVEL_WORDS[s.level] + ')' : '')));
        if (host && s.kind !== 'human') { const x = el('button', 'tg-mini-btn', '', { type: 'button', 'aria-label': 'Take ' + s.name + ' out', title: 'Take them out' }); x.append(MT.ico('close')); x.onclick = () => net.send({ t: 'tg', op: 'bot', table: T.id, seat: chair, level: null }); c.append(x); }
      } else {
        const full = T.seats.filter(Boolean).length >= (T.cap || 8);
        c.append(el('span', 'tg-cn empty', full ? 'Full for this game' : 'Empty chair'));
        if (full) c.classList.add('closed');
        else if (host) for (const lv of ['easy', 'normal', 'hard']) { const x = el('button', 'tg-chipbtn', '', { type: 'button', 'data-bot': lv, title: `Add a bot (${LEVEL_WORDS[lv]})`, 'aria-label': `Add a bot, ${LEVEL_WORDS[lv]}` }); x.append(MT.ico('bot'), el('span', '', LEVEL_WORDS[lv][0])); x.onclick = () => net.send({ t: 'tg', op: 'bot', table: T.id, seat: chair, level: lv }); c.append(x); }
        if (!seated && !full) { const x = el('button', 'tg-chipbtn sit', 'Sit here', { type: 'button', 'data-sit': chair }); x.onclick = () => net.send({ t: 'tg', op: 'sit', table: T.id, seat: chair }); c.append(x); }
      }
      seats.append(c);
    });
    p.append(seats);
    const n = T.seats.filter(Boolean).length;
    const opts = el('div', 'tg-opts');
    for (const sp of game?.settings || []) {
      const row = el('div', 'tg-opt');
      if (sp.kind === 'choice') {
        row.append(el('span', 'tg-ol', sp.label));
        const seg = el('div', 'tg-seg');
        let capNote = '';
        for (const o of sp.options) {
          const tooMany = Number.isInteger(o.maxSeats) && n > o.maxSeats; // (Mexican Train's quick game seats 5 at most)
          const b = el('button', 'tg-segb' + (T.settings[sp.key] === o.value ? ' on' : '') + (tooMany ? ' grey' : ''), o.label.split(':')[0], { type: 'button', title: tooMany ? `${o.label.split(':')[0]}: up to ${o.maxSeats}` : o.label, 'aria-pressed': String(T.settings[sp.key] === o.value), 'data-set': sp.key + '=' + o.value });
          b.disabled = !host || tooMany; b.onclick = () => net.send({ t: 'tg', op: 'set', table: T.id, key: sp.key, value: o.value }); seg.append(b);
          if (tooMany) capNote = `${o.label.split(':')[0]}: up to ${o.maxSeats}`;
        }
        row.append(seg);
        if (capNote) row.append(el('span', 'tg-capnote', capNote));
      } else {
        const b = el('button', 'tg-tog' + (T.settings[sp.key] ? ' on' : ''), sp.label, { type: 'button', role: 'switch', 'aria-checked': String(!!T.settings[sp.key]), 'data-set': sp.key }); b.disabled = !host;
        b.onclick = () => net.send({ t: 'tg', op: 'set', table: T.id, key: sp.key, value: !T.settings[sp.key] }); row.append(b);
      }
      opts.append(row);
    }
    if (T.game === 'mexican-train') opts.append(el('p', 'tg-dealline', MT.dealLine(T.settings, n)));
    { const row = el('div', 'tg-opt'); const on = T.table.keep !== false, b = el('button', 'tg-tog' + (on ? ' on' : ''), 'Bots play on', { type: 'button', title: 'A bot plays on for anyone who gets up mid-game (off: their seat waits for someone)', role: 'switch', 'aria-checked': String(on), 'data-set': 'keep' }); b.disabled = !host; b.onclick = () => net.send({ t: 'tg', op: 'set', table: T.id, key: 'keep', value: !on }); row.append(b); opts.append(row); }
    { const row = el('div', 'tg-opt'); const b = el('button', 'tg-tog' + (T.table.npcs ? ' on' : ''), 'Town folk may sit in', { type: 'button', role: 'switch', 'aria-checked': String(!!T.table.npcs), 'data-set': 'npcs' }); b.disabled = !host; b.onclick = () => net.send({ t: 'tg', op: 'set', table: T.id, key: 'npcs', value: !T.table.npcs }); row.append(b); opts.append(row); }
    { const row = el('div', 'tg-opt'); row.append(el('span', 'tg-ol', 'Turn timer')); const seg = el('div', 'tg-seg');
      for (const t of [0, 30, 60, 90]) { const b = el('button', 'tg-segb' + (T.table.timer === t ? ' on' : ''), t ? t + 's' : 'Off', { type: 'button', 'aria-pressed': String(T.table.timer === t), 'data-set': 'timer=' + t }); b.disabled = !host; b.onclick = () => net.send({ t: 'tg', op: 'set', table: T.id, key: 'timer', value: t }); seg.append(b); }
      row.append(seg); opts.append(row); }
    p.append(opts);
    if (!host && T.host) p.append(el('p', 'tg-wait', `${T.hostName} is hosting. They start the game.`));
    else if (!T.host) p.append(el('p', 'tg-wait', 'Set out for anyone: the first to sit down hosts.'));
    B.append(p);
  }
  // ---- your moves: pick a tile, then a lit spot; drag a tile onto a lit spot, or along the hand to reorder
  function send(move) { const T = pubOf(S.openId); if (!T || !move) return; if (move.type === 'play') S.flyFrom = frame.hand.querySelector('.tg-htile.sel')?.getBoundingClientRect() || null; net.send({ t: 'tg', op: 'move', table: T.id, move }); S.sel = null; audio.ui?.('blip'); }
  function pick(t) {
    const k = MT.tileKey(t); const moves = S.you?.moves || [];
    if (S.sel && MT.tileKey(S.sel) === k) { S.sel = null; render(); return; }
    S.sel = t; const sp = MT.spotsFor(moves, t);
    if (!sp.length) ui.toast('That one does not fit anywhere right now.', 1800);
    render();
  }
  function playTo(train) { const moves = S.you?.moves || []; const m = moves.find(x => x.type === 'play' && x.train === train && S.sel && MT.tileKey(x.tile) === MT.tileKey(S.sel)); if (m) send(m); }
  // A drag follows the pointer on the window, not on the tile's button: the hand is redrawn as soon as a drag starts (the spots
  // light), and a button taken out of the page never hears its pointerup. That was Andrew's tile left on screen after quitting.
  let drag = null;
  function endDrag() {
    const d = drag; drag = null; if (!d) return null;
    removeEventListener('pointermove', d.move); removeEventListener('pointerup', d.up); removeEventListener('pointercancel', d.cancel);
    if (d.ghost) unfloat(d.ghost);
    return d;
  }
  function handDown(e, t, i, btn) {
    if (e.button > 0) return;
    endDrag();
    const d = drag = { t, i, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, id: e.pointerId };
    d.move = ev => {
      if (drag !== d || ev.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 9) {
        d.moved = true; S.sel = t; render(); // (the spots light for it)
        const b2 = frame.hand.querySelector(`[data-tile="${MT.tileKey(t)}"]`) || btn;
        const r = b2.getBoundingClientRect(); d.w = r.width; d.h = r.height;
        d.ghost = float(b2.cloneNode(true)); d.ghost.classList.add('tg-ghost');
      }
      if (d.ghost) Object.assign(d.ghost.style, { left: (ev.clientX - d.w / 2) + 'px', top: (ev.clientY - d.h / 2) + 'px', width: d.w + 'px', height: d.h + 'px' });
    };
    d.up = ev => {
      if (drag !== d || ev.pointerId !== d.id) return;
      endDrag();
      if (!S.open) return;
      if (!d.moved) { pick(t); return; }
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const spot = under?.closest?.('.tg-spot');
      if (spot) { playTo(Number(spot.dataset.train)); return; }
      const other = under?.closest?.('.tg-htile');
      if (other && frame.hand.contains(other)) { const k = MT.tileKey(t), j = S.order.indexOf(other.dataset.tile); const o = S.order.filter(x => x !== k); o.splice(Math.max(0, j), 0, k); S.order = o; }
      render();
    };
    d.cancel = ev => { if (drag === d && ev.pointerId === d.id) { endDrag(); if (S.open) render(); } };
    addEventListener('pointermove', d.move); addEventListener('pointerup', d.up); addEventListener('pointercancel', d.cancel);
  }

  // ---------------------------------------------------------------- the moments, one after another: the slip, the double, the round's end, the sounds
  let slipT = 0;
  function onBeats(T, beats, was) {
    const near = S.openId === T.id || dist(T) < 18;
    const me = S.openId === T.id ? meIn(T) : null, pace = (PACES[T.table?.pace] || 1);
    for (const b of beats) {
      if (b.kind === 'place') { S.fresh = { train: b.train }; if (near) sfx('tg-clack', T); if (S.openId === T.id) setTimeout(() => flyIn(T, b, me), 0); }
      if (b.kind === 'draw' && near) sfx('tg-click', T);
      if ((b.kind === 'deal' || b.kind === 'start') && near) sfx('tg-shuffle', T);
      if (b.kind === 'knock') knockSay(T, b.seat);
      if (b.kind === 'turn' && me !== null && b.seat === me) { sfx('tg-bell', T); }
      if (S.openId !== T.id) continue;
      if (b.kind === 'double') frame.banner('Answer the double!', (b.dwell || DWELL.double) * pace + 600);
      if (b.kind === 'roundEnd') frame.modalShow('round', MT.roundPanel(T, b, me));
      if (b.kind === 'deal' && frame.modalKind === 'round') frame.modalHide();
      if (b.kind === 'start') audio.musicApi?.game?.('start', { id: T.game });
      if (b.kind === 'gameOver') audio.musicApi?.game?.('over', { id: T.game });
      const words = MT.describe(T, T.view, b, me);
      if (words) S.beats.push({ words, ms: Math.max(900, (b.dwell ?? DWELL[b.kind] ?? 800) * pace) });
    }
    if (S.openId === T.id && was && T.view && was.view && T.view.round > was.view.round && Math.max(...(T.view.scores?.totals || [0])) > 0) {
      const tot = T.view.scores.totals.slice().sort((a, b) => a - b); if (tot.length > 1 && tot[1] - tot[0] < 10) audio.musicApi?.game?.('tense', { id: T.game, secs: 60 });
    }
  }
  function flyIn(T, b, me) {
    const row = frame.board.querySelector(`.tg-row[data-train="${b.train}"]`), to = row?.querySelector('.fresh'); if (!to) return;
    const chip = frame.bar.querySelector(`.tg-chip[data-chair="${T.order?.[b.seat]}"]`);
    const from = b.seat === me && S.flyFrom ? S.flyFrom : chip?.getBoundingClientRect(); S.flyFrom = null;
    if (!from) return;
    const r = to.getBoundingClientRect(), g = float(to.cloneNode(true)); g.classList.add('tg-fly'); g.classList.remove('fresh');
    Object.assign(g.style, { left: from.left + 'px', top: from.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    to.style.visibility = 'hidden';
    requestAnimationFrame(() => { g.style.transform = `translate(${r.left - from.left}px, ${r.top - from.top}px)`; });
    setTimeout(() => { unfloat(g); to.style.visibility = ''; }, 460);
  }
  function knockSay(T, k) {
    const chair = T.order?.[k], s = T.seats[chair]; if (!s) return;
    const who = s.sid === net.sid ? player.character?.root : s.kind === 'npc' ? vis.get(T.id)?.npcs.get(chair)?.h.root : ctx.remotes?.map?.get(s.sid)?.ch?.root;
    if (who && (S.openId === T.id || dist(T) < 18)) ui.say(who, 'One tile left!', 3.5);
    if (S.openId === T.id) { const c = frame.bar.querySelector(`.tg-chip[data-chair="${chair}"]`); if (c) { const bb = el('span', 'tg-bubble', 'One tile left!'); c.append(bb); setTimeout(() => bb.remove(), 3200); } sfx('tg-knock', T); }
  }
  function heard(m) {
    const T = pubOf(m.table); if (!T) return;
    if (m.seat === null) { if (S.openId === m.table) S.beats.push({ words: m.text, ms: 2600 }); return; }
    const n = vis.get(m.table)?.npcs.get(m.seat);
    if (n && dist(T) < 26) { ui.say(n.h.root, m.text, 4); audio.speak?.(n.h.root.position.x, n.h.root.position.y + 1.3, n.h.root.position.z, m.text, n.voice); n.talk = performance.now() / 1000 + Math.min(4, 1 + m.text.length / 16); n.h.say?.(1.5); }
    S.lastSay.push({ table: m.table, seat: m.seat, text: m.text }); if (S.lastSay.length > 20) S.lastSay.shift();
  }
  const dist = T => Math.hypot(player.pos.x - T.x, player.pos.z - T.z);
  const sfx = (name, T) => { const d = byId.get(T.id); audio.play?.(name, T.x, d ? d.top : 1, T.z); S.played.push(name); if (S.played.length > 40) S.played.shift(); };
  audio.registerSfx?.('tg-clack', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; a.burst(o, { t, dur: 0.025, f: 3200, Q: 4, peak: 0.16 }); a.burst(o, { t: t + 0.045, dur: 0.02, f: 2600, Q: 5, peak: 0.09 }); a.tone(o, { f: 1900, t, d: 0.05, peak: 0.03, type: 'triangle' }); });
  audio.registerSfx?.('tg-click', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; a.burst(o, { t, dur: 0.02, f: 2400, Q: 3, peak: 0.08 }); });
  audio.registerSfx?.('tg-shuffle', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; for (let i = 0; i < 14; i++) a.burst(o, { t: t + i * 0.045 + (i % 3) * 0.011, dur: 0.02, f: 2200 + (i % 5) * 300, Q: 3, peak: 0.05 + (i % 4) * 0.012 }); });
  audio.registerSfx?.('tg-bell', (a, x, y, z) => { const o = a.at(x, y, z, 6); const t = a.ctx.currentTime; a.tone(o, { f: 1568, t, d: 0.7, peak: 0.07, verb: 0.4 }); a.tone(o, { f: 2093, t: t + 0.09, d: 0.8, peak: 0.05, verb: 0.4 }); });
  audio.registerSfx?.('tg-knock', (a, x, y, z) => { const o = a.at(x, y, z, 4); const t = a.ctx.currentTime; for (const k of [0, 0.16]) a.burst(o, { t: t + k, dur: 0.05, f: 420, Q: 1.4, peak: 0.16, brown: true }); });
  function showRules() { frame.modalShow('rules', MT.rulesCard()); }
  function tipOnce(on) {
    if (!on || S.tipped || ls.get(TIP_STORE)) return;
    S.tipped = true; ls.set(TIP_STORE, '1');
    frame.tip('Tap a tile, then a lit spot to play it. Nothing fits? Draw.', 9000);
  }

  // ---------------------------------------------------------------- E: take a box, put it back, set it up, sit, watch
  const shelfNear = (px, pz) => shelf && player.pos.y < shelf.fy + 1.5 && Math.hypot(px - shelf.x, pz - (shelf.z + 0.5)) < 1.15 && store?.inside?.();
  function freeTables(px, pz) {
    let best = null, bd = Infinity;
    for (const d of TABLES) {
      if (Math.abs(player.pos.y - d.y0) > 1.2) continue;
      const dd = Math.hypot(px - d.x, pz - d.z) - (d.edge ? d.edge(Math.atan2(px - d.x, pz - d.z)) : d.R);
      if (dd < 1.4 && dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  const chairNear = (d, px, pz) => { let best = -1, bd = 0.85; d.seats.forEach((s, i) => { const dd = Math.hypot(px - s.x, pz - s.z); if (dd < bd) { bd = dd; best = i; } }); return best; };
  // put down: the box on a free table, set out for anyone (it is nobody's once it is down)
  function putDown(d) {
    if (!d.free()) { ui.toast(d.busyWhy || 'That table is busy.', 3000); return; }
    net.send({ t: 'tg', op: 'down', table: d.id, place: d.place, name: d.name, x: d.x, z: d.z, seats: d.seats.length });
  }
  const putAway = T => net.send({ t: 'tg', op: 'putaway', table: T.id });
  const gameName = T => S.games.find(g => g.id === T.game)?.name || 'the game';
  const people = T => T.seats.some(s => s && s.kind === 'human');
  // the chair to sit in at a set-out game: the one you stand by, else the nearest free one
  function chairFor(T, d, px, pz, ok) {
    const ch = chairNear(d, px, pz); if (ch >= 0 && ch < T.n && ok(T.seats[ch])) return ch;
    let best = -1, bd = Infinity;
    d.seats.forEach((s, i) => { if (i >= T.n || !ok(T.seats[i])) return; const dd = Math.hypot(px - s.x, pz - s.z); if (dd < bd) { bd = dd; best = i; } });
    return best;
  }
  function selPlay() { const moves = S.you?.moves || []; if (!S.sel) return; const sp = MT.spotsFor(moves, S.sel); if (sp.length === 1) playTo(sp[0]); }
  return {
    name: 'table-games',
    tables: TABLES, get state() { return S; }, get frame() { return frame; }, vis, shelf, shelfBoxes,
    get seated() { return S.seated ? { id: S.seated.id, chair: S.seated.chair } : null; },
    get layout() { return { form: frame.form, fit: fit.on ? { v: fit.v, aspect: camera.aspect } : null }; },
    open: (id) => open('watch', id), close, stand: () => standUp(false), send, pick, playTo, setView: v => { S.view = v; ls.set(VIEW_STORE, v); render(); },
    update(dt, now) {
      // the pieces on each table: only near it, or seated at it; the parlour's shut box hides under a game
      for (const [id, v] of vis) {
        const T = pubOf(id); if (!T) continue;
        const near = Math.hypot(camera.position.x - T.x, camera.position.z - T.z) < 45 || S.openId === id;
        v.mt.root.visible = near; v.mt.tick(dt, T.view, T.phase === 'setup' ? null : T.order);
        if (v.d.hideWhileOn) { const g = v.d.hideWhileOn(); if (g && g.visible) g.visible = false; }
        for (const [chair, n] of v.npcs) {
          const seat = v.d.seats[chair]; n.h.root.visible = near && v.d.parent.visible !== false;
          if (!near) continue;
          n.h.root.position.set(seat.x, seat.y, seat.z); n.h.root.rotation.y = seat.yaw; n.h.params.seatY = seat.seatY; n.h.params.table = seat.hands;
          n.h.update(dt, now, 0, sitterAnim(T, chair, n, seat, now));
        }
      }
      // the slip: one moment's words after another
      if (S.beats.length && now > slipT) { const b = S.beats.shift(); frame.slip(b.words, b.ms); slipT = now + b.ms / 1000; }
      if (S.seated && player.takeover?.tg !== true) { S.seated = null; showMe(); player.character.params.seatY = 0; player.character.params.table = null; net.send({ t: 'tg', op: 'stand' }); if (S.open === 'seat') close(); } // (something else took you over)
      if (S.open === 'watch' && S.watchAt && Math.hypot(player.pos.x - S.watchAt.x, player.pos.z - S.watchAt.z) > 1.2) close();
      if (!S.open && (floats.size || drag)) sweep(); // (nothing of a game stays on screen once its overlay is shut)
      if (S.open) { if (frame.relayout()) { render(); fitView(true); } else fitView(); }
      if (S.open && now > (S.clockAt || 0)) { S.clockAt = now + 0.25; const T = pubOf(S.openId), ck = frame.bar.querySelector('.tg-clock'); if (ck && T?._turnEnds) ck.textContent = String(Math.max(0, Math.ceil((T._turnEnds - performance.now()) / 1000))); }
      if (carrying() && !S.seated && player.held !== 'gamebox') player.setHeld('gamebox');
      if (frame.timerEl) { const T = S.openId && pubOf(S.openId); void T; }
    },
    target(px, pz) {
      if (S.seated) {
        const T = pubOf(S.seated.id);
        if (T && T.phase === 'play') return { hint: '', prio: 20, run: selPlay };
        return { hint: 'E  Get up', prio: 9, run: stand };
      }
      const c = carrying();
      if (c) {
        if (shelfNear(px, pz)) return { hint: `E  Put ${S.games.find(g => g.id === c.game)?.name || 'it'} back`, prio: 8, run: () => net.send({ t: 'tg', op: 'putback' }) };
        const d = freeTables(px, pz);
        if (d && !pubOf(d.id)) return { hint: d.free() ? `E  Put ${S.games.find(g => g.id === c.game)?.name || 'the game'} down here` : 'E  That table is busy', prio: 8, run: () => putDown(d) };
      }
      if (shelfNear(px, pz)) {
        const b = S.boxes.find(x => x.at === 'shelf');
        const g = b && S.games.find(x => x.id === b.game);
        if (g && !c) return { hint: `E  Take ${g.name} (free to borrow)`, prio: 8, run: () => net.send({ t: 'tg', op: 'take', game: g.id }) };
        if (!b && !c && S.games.length) return { hint: 'E  The cabinet is empty: the games are out on tables', prio: 6, run: () => ui.toast('Every game is out on a table. It comes back when someone puts it away, or at midnight.', 3000) };
      }
      // a table with a game on it. Set out: by a chair, play (it sits you); nobody at it and not by a chair, put it away. In a
      // game: a seat someone left (a bot keeping it warm, or empty) is anyone's to sit in. Else watch.
      for (const T of S.tables.values()) {
        const d = byId.get(T.id); if (!d || Math.abs(player.pos.y - d.y0) > 1.2) continue;
        if (Math.hypot(px - d.x, pz - d.z) > (d.edge ? d.edge(Math.atan2(px - d.x, pz - d.z)) : d.R) + 1.6) continue;
        const name = gameName(T), sit = ch => () => net.send({ t: 'tg', op: 'sit', table: T.id, seat: ch });
        if (T.phase === 'setup') {
          const room = T.seats.filter(Boolean).length < (T.cap || 8), byChair = chairNear(d, px, pz);
          const ch = chairFor(T, d, px, pz, s => (s ? s.kind !== 'human' : room));
          if (byChair >= 0 && byChair < T.n && ch === byChair) return { hint: `E  Play ${name}`, prio: 8, run: sit(ch) };
          if (!people(T)) return { hint: `E  Put ${name} away`, prio: 8, run: () => putAway(T) };
          if (ch >= 0) return { hint: `E  Play ${name}`, prio: 8, run: sit(ch) };
        } else if (T.phase === 'play') {
          const ch = chairFor(T, d, px, pz, s => !!s && (s.kind === 'open' || s.standIn));
          if (ch >= 0 && (chairNear(d, px, pz) === ch || !people(T))) return { hint: `E  Sit in for ${T.seats[ch].was || T.seats[ch].name}`, prio: 8, run: sit(ch) };
        }
        if (S.open !== 'watch') return { hint: `E  Watch ${name}`, prio: 7, run: () => open('watch', T.id) };
      }
      return null;
    },
    onKey(code) {
      if (!S.open) return false;
      if (frame.modalKind === 'rules' && (code === 'Escape' || code === 'Enter')) { frame.modalHide(); return true; }
      if (S.open === 'watch' && code === 'Escape') { close(); return true; }
      if (S.open !== 'seat') return false;
      const T = pubOf(S.openId), moves = S.you?.moves || [], find = t => moves.find(m => m.type === t);
      if (code === 'KeyF') { S.view = S.view === 'tq' ? 'fp' : 'tq'; ls.set(VIEW_STORE, S.view); render(); return true; }
      if (code === 'Slash' || code === 'F1') { showRules(); return true; }
      if (!T || T.phase !== 'play') return code === 'Space';
      const tiles = S.order.map(k => (S.you?.view?.hand || []).find(t => MT.tileKey(t) === k)).filter(Boolean);
      if (code === 'ArrowRight' || code === 'ArrowLeft') { if (!tiles.length) return true; const i = S.sel ? tiles.findIndex(t => MT.tileKey(t) === MT.tileKey(S.sel)) : -1; S.sel = tiles[(i + (code === 'ArrowRight' ? 1 : tiles.length - 1) + (i < 0 && code === 'ArrowLeft' ? 1 : 0)) % tiles.length]; render(); return true; }
      if (code === 'ArrowUp' || code === 'ArrowDown') { const sp = MT.spotsFor(moves, S.sel); if (sp.length) { S.spotI = ((S.spotI || 0) + 1) % sp.length; } return true; }
      if (code === 'Enter' || code === 'NumpadEnter') { if (find('next')) { send(find('next')); return true; } const sp = MT.spotsFor(moves, S.sel); if (sp.length) playTo(sp[(S.spotI || 0) % sp.length]); return true; }
      if (code === 'KeyD' && find('draw')) { send(find('draw')); return true; }
      if (code === 'KeyP' && find('pass')) { send(find('pass')); return true; }
      if (code === 'KeyS' && find('end')) { send(find('end')); return true; }
      if (code === 'KeyK' && find('knock')) { send(find('knock')); return true; }
      if (code === 'KeyC' && find('catch')) { send(find('catch')); return true; }
      if (code === 'Escape') { if (frame.modalKind) frame.modalHide(); else S.sel = null; render(); return true; }
      return code === 'Space' || code === 'KeyE';
    },
    // a remote player in one of the chairs no other feature draws (the house's and the parlour's): seated at its height
    afterRemotes() {
      const remotes = ctx.remotes; if (!remotes?.map || !S.tables.size) return;
      for (const r of remotes.map.values()) {
        const last = r.buf?.[r.buf.length - 1]; if (!last || ANIM_CODES[last.a] !== 'sit') continue;
        for (const T of S.tables.values()) {
          const d = byId.get(T.id); if (!d || d.place === 'store' || d.place === 'backroom' || d.place === 'picnic') continue;
          const s = d.seats.find(q => Math.hypot(last.x - q.x, last.z - q.z) < 0.35);
          if (s) { r.ch.params.seatY = s.seatY; r.ch.params.table = s.hands; r.ch.root.rotation.y = s.yaw; }
        }
      }
    },
    // tests: who sits in each chair no player fills, what they are doing and whom they look at (a chair, 'table', or null)
    sitters(id) {
      const v = vis.get(id), T = pubOf(id); if (!v || !T) return [];
      return [...v.npcs].map(([chair, n]) => {
        const f = n.h.attn.force; let looks = null;
        if (f === lookPt) looks = 'table'; else if (f) for (let c = 0; c < T.seats.length; c++) if (bodyAt(T, c) === f) looks = c;
        return { chair, kind: T.seats[chair]?.kind, name: T.seats[chair]?.name, look: n.id, anim: n.h.anim, looks, visible: n.h.root.visible, tag: n.tag?.node?.textContent || null };
      });
    },
    *characterRoots() { for (const v of vis.values()) for (const n of v.npcs.values()) yield n.h.root; },
    bodies() { const out = []; for (const v of vis.values()) for (const [chair] of v.npcs) { const s = v.d.seats[chair]; if (s) out.push({ x: s.x, z: s.z, r: 0.28 }); } return out; },
    help: [[['E'], 'in the game store: borrow a board game from the cabinet, put it down on any table; anyone may sit and play; put it away after'], [['D', 'P', 'K'], 'at a table game: draw, pass, one tile left']],
  };
}
