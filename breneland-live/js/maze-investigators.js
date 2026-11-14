// Beneath Angell Street, the investigators: who you go down as, and what they bring.
//   - a lineup of headshots as you go down (Start your own / Join). Tap a head for its card (the premise, its ability, what it gives
//     the party), Select it or look at the others. A "?" picks a random free one. One person each per run (lib/maze.js has the
//     word: a head someone in the run already has is greyed with their name).
//   - the Detective (his own light 15% further, the party's 8%), the Librarian (a map in the bottom-right corner that fills in where
//     she walks, hers alone), the Rogue (the ghoul hears him 15% less far, the party 8%: lib/maze-investigators.js), the Mystic (a
//     heartbeat, felt through haptics, when a ghoul is within HEART.range m of path, faster as it comes, hers alone), the Survivor
//     (escapes 4 grabs, taken on the 5th, the party on the 4th: lib/maze-investigators.js).
//   - an investigator who's taken takes their share with them (the server's 'invs' list says who is below and who is taken).
//   - the week's goal (w16-goals): the Librarian's map shows the goal's things once she has seen them; the Detective's reach
//     picks a thing up from a step further (lib/maze-goals.js PICK); the Rogue's hush covers the cask's slosh (it is a step).
// The looks: the Detective is the Arkham table's own (npc-looks.js, with Andrew's saved edits). The other four are original 1920s
// figures in the house style, not the board game's art.
import { Human } from './human.js';
import { NPCS, lookOf } from './npc-looks.js';
import { createTiles } from './avatar-tiles.js';
import { el, loadCss } from './util.js';
import { CELL, N, E, S, W as WEST } from './maze-gen.js';
import { dress } from './cloth-textures.js';

export const LIGHT = { self: 1.15, party: 1.08 };   // the Detective: your lantern's reach (and how far you see before the dark takes it)
export const HEART = { range: 12, slow: 1.35, fast: 0.38, near: 2 }; // the Mystic: metres of path; seconds between beats at the edge and up close

const LOOKS = {
  librarian: { outfit: 'blazer', shirt: '#6a5240', inner: '#efe6d2', pants: '#3a3a42', shoeKind: 'dress', shoes: '#3a2a22', glasses: 'square', acc: 'satchel', accColor: '#7a5234',
    skin: '#f0c7a0', hair: '#5a3a26', hairStyle: 'bun', faceShape: 'oval', eyes: 'oval', brows: 'soft', nose: 'small', mouth: 'smile', blush: true, body: 'f', build: 0.3, height: 0.48 },
  rogue: { outfit: 'vest', shirt: '#4a4a52', inner: '#e8dcc2', tie: 'skinny', tieColor: '#8a2c2c', pants: '#36363e', shoeKind: 'dress', shoes: '#2a201c', hat: 'flatcap', hatColor: '#5e5246',
    skin: '#d9a07a', hair: '#1e1a18', hairStyle: 'sidepart', faceShape: 'square', eyes: 'dot', brows: 'angry', nose: 'long', mouth: 'smirk', facialHair: 'stubble', blush: false, body: 'm', build: 0.45, height: 0.6 },
  mystic: { outfit: 'gown', shirt: '#2f5a58', pants: '#2a3a3c', shoeKind: 'boots', shoes: '#2a2224', hat: 'headband', hatColor: '#c9a24a', acc: 'scarf', accColor: '#8e2f3a',
    skin: '#b97f58', hair: '#231a16', hairStyle: 'long', faceShape: 'oval', eyes: 'lash', brows: 'arched', nose: 'small', mouth: 'tiny', blush: false, body: 'f', build: 0.3, height: 0.52 },
  survivor: { outfit: 'jacket', shirt: '#7a6248', inner: '#c9b590', pants: '#4a4a52', shoeKind: 'boots', shoes: '#3a2c22', hat: 'cap', hatColor: '#3e4452',
    skin: '#f2c49c', hair: '#a8672c', hairStyle: 'shag', faceShape: 'round', eyes: 'wide', brows: 'plain', nose: 'button', mouth: 'flat', blush: true, body: 'f', build: 0.2, height: 0.35, scale: 0.86 },
};

// the cloth each look is made of (cloth-textures.js): which of the look's colours gets which weave
const CLOTH = {
  detective: { coat: 'twill', pants: 'wool', shirt: 'cotton', tieColor: 'silk', hatColor: 'felt', shoes: 'leather', hair: 'hair' },
  librarian: { shirt: 'tweed', inner: 'cotton', pants: 'wool', accColor: 'leather', shoes: 'leather', hair: 'hair' },
  rogue: { shirt: 'wool', inner: 'cotton', tieColor: 'silk', pants: 'pinstripe', hatColor: 'tweed', shoes: 'leather', hair: 'hair' },
  mystic: { shirt: 'velvet', pants: 'velvet', accColor: 'knit', hatColor: 'silk', shoes: 'leather', hair: 'hair' },
  survivor: { shirt: 'tweed', inner: 'cotton', pants: 'wool', hatColor: 'felt', shoes: 'leather', hair: 'hair' },
};
// a built figure of this investigator in its cloth: dressFor(human, 'rogue') -> how many parts got a texture
export function dressFor(human, id) {
  const L = lookFor(id), C = CLOTH[id];
  if (!L || !C) return 0;
  const slots = {};
  for (const [k, kind] of Object.entries(C)) if (typeof L[k] === 'string' && L[k][0] === '#') slots[L[k]] = kind;
  return dress(human, slots);
}

export const INVESTIGATORS = [
  { id: 'detective', role: 'The Detective', kind: 'Guardian', premise: 'A lawman who trusts procedure. He has walked into worse cellars than this one, or so he tells himself.',
    you: 'Sees further: your lantern reaches 15% further into the dark.', party: 'Everyone else\'s lantern reaches 8% further while he is below.' },
  { id: 'librarian', role: 'The Librarian', kind: 'Seeker', premise: 'She has read about tunnels like these. Reading was supposed to be the safe part.',
    you: 'Maps the labyrinth: a map in the bottom-right corner fills in wherever you walk.', party: 'The map is hers alone.' },
  { id: 'rogue', role: 'The Rogue', kind: 'Rogue', premise: 'A hustler with soft shoes and a reason to be good at not being heard.',
    you: 'Quiet feet: the ghoul hears you from 15% less far.', party: 'Everyone else is 8% quieter while he is below.' },
  { id: 'mystic', role: 'The Mystic', kind: 'Mystic', premise: 'She dreams of things before they happen. Down here her heart knows first.',
    you: `Senses the ghoul: your heart beats (you feel it) when one is within about ${HEART.range} m, faster the closer it comes.`, party: 'The sense is hers alone.' },
  { id: 'survivor', role: 'The Survivor', kind: 'Survivor', premise: 'A street kid who has slipped out of every grip so far, and means to keep it that way.',
    you: 'Hard to hold: you escape 4 grabs; the 5th takes you.', party: 'Everyone else escapes one more grab (taken on the 4th) while she is below.' },
];
export const byId = id => INVESTIGATORS.find(x => x.id === id) || null;
// the body an investigator is drawn with (the Detective's from the NPC Editor's saved look when there is one)
export function lookFor(id) {
  if (id === 'detective') return { ...lookOf('detective', NPCS.detective.look) };
  return LOOKS[id] ? { ...LOOKS[id] } : null;
}

// ---------------------------------------------------------------- the lineup (the picker)
// open({ taken: Map(id -> name) }) -> Promise('detective' | ... | 'random' | null for Back)
export function createPicker(ctx) {
  loadCss('/css/maze-investigators.css');
  const { input, audio } = ctx;
  const tiles = createTiles(() => ctx.renderer, { decorate: (h, p) => { if (p.inv) dressFor(h, p.inv); } });
  const box = el('div', 'mzi panel', '', { hidden: '', role: 'dialog', 'aria-label': 'Choose your investigator' });
  const title = el('div', 'mzi-title', 'Who goes down?'), sub = el('div', 'mzi-sub', 'Beneath Angell Street. One investigator each.');
  const row = el('div', 'mzi-row'), info = el('div', 'mzi-info', '', { hidden: '' }), foot = el('div', 'mzi-foot');
  const back = el('button', 'btn', 'Not now', { type: 'button' });
  foot.append(back); box.append(title, sub, row, info, foot); ctx.hud.append(box);
  let resolve = null, taken = new Map(), showing = null, raf = 0, savedHook = null;
  const heads = () => [...row.querySelectorAll('button')];
  function pump() { tiles.pump(8); if (!box.hidden) raf = requestAnimationFrame(pump); }
  function fill() {
    row.replaceChildren();
    for (const x of INVESTIGATORS) {
      const who = taken.get(x.id), b = el('button', 'mzi-head', '', { type: 'button', 'data-inv': x.id, 'aria-label': who ? `${x.role}, taken by ${who}` : x.role });
      const pic = el('div', 'mzi-pic'), nm = el('div', 'mzi-name', x.role.replace('The ', '')), by = el('div', 'mzi-by', who ? who : x.kind !== x.role.replace('The ', '') ? x.kind : '\u00a0');
      b.append(pic, nm, by);
      if (who) { b.classList.add('taken'); pic.dataset.stamp = 'Taken'; }
      tiles.request({ rawLook: lookFor(x.id), inv: x.id, yaw: 0, tex: 'cloth1' }, 'head', cv => { pic.replaceChildren(cv); }, 'mzi-' + x.id); // facing you, in their cloth
      b.onclick = () => openInfo(x.id);
      row.append(b);
    }
    const free = INVESTIGATORS.filter(x => !taken.has(x.id)).length;
    const r = el('button', 'mzi-head mzi-random', '', { type: 'button', 'data-inv': 'random', 'aria-label': 'Random' });
    r.append(el('div', 'mzi-pic mzi-q', '?'), el('div', 'mzi-name', 'Random'), el('div', 'mzi-by', `${free} free`));
    if (!free) r.classList.add('taken');
    r.onclick = () => openInfo('random');
    row.append(r);
  }
  function openInfo(id) {
    audio.ui?.('blip');
    showing = id;
    for (const h of heads()) h.classList.toggle('on', h.dataset.inv === id);
    const x = byId(id), who = x ? taken.get(id) : null;
    info.replaceChildren();
    if (id === 'random') {
      info.append(el('div', 'mzi-role', 'Random'), el('p', 'mzi-premise', 'Let the house decide. You go down as one of the investigators nobody has taken.'));
    } else {
      info.append(el('div', 'mzi-role', `${x.role}`), el('div', 'mzi-kind', x.kind), el('p', 'mzi-premise', x.premise),
        line('You', x.you), line('The party', x.party));
      if (who) info.append(el('p', 'mzi-takenby', `${who} is already going down as ${x.role.replace('The ', 'the ')}.`));
    }
    const btns = el('div', 'mzi-btns');
    const sel = el('button', 'btn primary', 'Select', { type: 'button' }); sel.disabled = id === 'random' ? !INVESTIGATORS.some(z => !taken.has(z.id)) : !!who;
    sel.onclick = () => done(id);
    const others = el('button', 'btn', 'Look at others', { type: 'button' }); others.onclick = closeInfo;
    btns.append(sel, others); info.append(btns);
    info.hidden = false;
    (sel.disabled ? others : sel).focus({ preventScroll: true });
  }
  const line = (k, v) => { const p = el('p', 'mzi-line'); p.append(el('b', '', k + ': '), document.createTextNode(v)); return p; };
  function closeInfo() {
    const id = showing; showing = null; info.hidden = true;
    for (const h of heads()) h.classList.remove('on');
    (heads().find(h => h.dataset.inv === id) || heads()[0])?.focus({ preventScroll: true });
  }
  function done(v) {
    if (box.hidden) return;
    box.hidden = true; info.hidden = true; showing = null; cancelAnimationFrame(raf); tiles.cancel();
    input.menuHook = savedHook; savedHook = null;
    const r = resolve; resolve = null; r?.(v);
  }
  back.onclick = () => done(null);
  function move(d) {
    if (showing) { const bs = [...info.querySelectorAll('button')].filter(b => !b.disabled); const i = bs.indexOf(document.activeElement); bs[(i + d + bs.length) % bs.length]?.focus({ preventScroll: true }); return; }
    const hs = heads(), i = hs.indexOf(document.activeElement);
    hs[i < 0 ? 0 : (i + d + hs.length) % hs.length].focus({ preventScroll: true });
  }
  return {
    open({ taken: t = new Map() } = {}) {
      if (resolve) done(null);
      taken = t; fill(); info.hidden = true; showing = null; box.hidden = false;
      savedHook = input.menuHook;
      input.menuHook = dir => { if (box.hidden) return false; if (dir === 'left' || dir === 'up') move(-1); else if (dir === 'right' || dir === 'down') move(1); return true; };
      raf = requestAnimationFrame(pump);
      setTimeout(() => (heads().find(h => !h.classList.contains('taken')) || heads()[0])?.focus({ preventScroll: true }), 20);
      audio.ui?.('pop');
      return new Promise(res => { resolve = res; });
    },
    get open_() { return !box.hidden; },
    get showing() { return showing; },
    close: () => done(null),
    onKey(code) {
      if (box.hidden) return false;
      if (code === 'Escape' || code === 'KeyE') { if (showing && code === 'Escape') closeInfo(); else if (input.lastDevice === 'pad' && document.activeElement?.closest?.('.mzi')) document.activeElement.click(); else done(null); return true; }
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { document.activeElement?.closest?.('.mzi') ? document.activeElement.click() : null; return true; }
      if (code === 'ArrowLeft' || code === 'ArrowUp') { move(-1); return true; }
      if (code === 'ArrowRight' || code === 'ArrowDown') { move(1); return true; }
      return true;
    },
    // tests
    el: box, pick: v => done(v), openInfo, closeInfo, tiles,
    dispose() { done(null); tiles.dispose(); box.remove(); },
  };
}

// ---------------------------------------------------------------- below: the abilities on this screen
// scene: maze-scene.js's api (me, maze, ghoul views, setReach); inv: yours; setParty(list from the server's 'invs')
export function createAbilities(ctx, scene, { inv }) {
  const { ui } = ctx;
  let party = [], reach = 1, mapOn = inv === 'librarian', heartOn = inv === 'mystic';
  // ---- the Detective's light
  function computeReach() {
    if (inv === 'detective') return LIGHT.self;
    return party.some(x => x.inv === 'detective' && !x.taken && x.sid !== ctx.net.sid) ? LIGHT.party : 1;
  }
  function setParty(list) { party = Array.isArray(list) ? list : []; reach = computeReach(); scene.setReach?.(reach); }
  // ---- the Librarian's map: the cells she has stood in (and the walls round them), drawn on a small canvas in the bottom-right
  const M = scene.maze, cellsW = M.W, cellsH = M.H, PX = 5, seen = new Uint8Array(cellsW * cellsH);
  let mapEl = null, cv = null, g = null, lastCell = -1, dirty = true, drawAt = 0;
  if (mapOn) {
    mapEl = el('div', 'mzi-map', '', { 'aria-label': 'Your map' });
    cv = document.createElement('canvas'); cv.width = cellsW * PX + 2; cv.height = cellsH * PX + 2; g = cv.getContext('2d');
    mapEl.append(cv, el('div', 'mzi-map-cap', 'Your map')); ctx.hud.append(mapEl);
  }
  function drawMap(me) {
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(20,16,12,0.72)'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#d8c7a2';
    for (let i = 0; i < seen.length; i++) if (seen[i]) g.fillRect(1 + (i % cellsW) * PX, 1 + Math.floor(i / cellsW) * PX, PX, PX);
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 1; g.beginPath();
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      const x = 1 + (i % cellsW) * PX, y = 1 + Math.floor(i / cellsW) * PX, c = M.cells[i];
      if (c & N) { g.moveTo(x, y + 0.5); g.lineTo(x + PX, y + 0.5); }
      if (c & S) { g.moveTo(x, y + PX - 0.5); g.lineTo(x + PX, y + PX - 0.5); }
      if (c & WEST) { g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + PX); }
      if (c & E) { g.moveTo(x + PX - 0.5, y); g.lineTo(x + PX - 0.5, y + PX); }
    }
    g.stroke();
    // the week's goal's things she has seen (maze-goals.js known: within the lantern's reach and in sight once), gold
    for (const t of scene.goals?.known?.() || []) { g.fillStyle = '#e6b24a'; g.beginPath(); g.arc(1 + (t.x / CELL) * PX, 1 + (t.z / CELL) * PX, 2.4, 0, Math.PI * 2); g.fill(); }
    // you: a dot and the way you face
    const px = 1 + (me.x / CELL) * PX, pz = 1 + (me.z / CELL) * PX;
    g.fillStyle = '#e0574f'; g.beginPath(); g.arc(px, pz, 2.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e0574f'; g.beginPath(); g.moveTo(px, pz); g.lineTo(px + Math.sin(me.yaw) * 5, pz + Math.cos(me.yaw) * 5); g.stroke();
  }
  // ---- the Mystic's heartbeat: the nearest ghoul by path (maze-ghoul.js views[].path), felt (ctx.haptics 'heart'), a small heart
  // on screen as well (a PC with no pad feels nothing otherwise)
  let heartEl = null, beatT = 0, lastBeat = 0;
  if (heartOn) { heartEl = el('div', 'mzi-heart', '♥', { 'aria-hidden': 'true' }); ctx.hud.append(heartEl); }
  function nearestGhoul() {
    const vs = scene.ghoul?.views || [];
    let d = Infinity;
    for (const v of vs) { const p = Number.isFinite(v.path) && v.path >= 0 ? v.path : v.dist; if (Number.isFinite(p)) d = Math.min(d, p); }
    return d;
  }
  const beatGap = d => { const k = Math.max(0, Math.min(1, (d - HEART.near) / (HEART.range - HEART.near))); return HEART.fast + (HEART.slow - HEART.fast) * k; };
  function frame(dt, now) {
    const me = scene.me;
    if (mapOn && scene.phase !== 'stair') {
      const cx = Math.floor(me.x / CELL), cy = Math.floor(me.z / CELL);
      if (cx >= 0 && cy >= 0 && cx < cellsW && cy < cellsH) { const c = cy * cellsW + cx; if (c !== lastCell) { lastCell = c; if (!seen[c]) { seen[c] = 1; dirty = true; } } }
      if (dirty || now - drawAt > 0.15) { dirty = false; drawAt = now; drawMap(me); }
    }
    if (heartOn) {
      const d = scene.phase === 'maze' ? nearestGhoul() : Infinity;
      if (d <= HEART.range) {
        beatT += dt;
        if (beatT >= beatGap(d)) { beatT = 0; lastBeat = now; ctx.haptics?.buzz('heart'); heartEl.classList.remove('beat'); void heartEl.offsetWidth; heartEl.classList.add('beat'); }
        heartEl.classList.add('on');
      } else { beatT = HEART.slow; heartEl.classList.remove('on'); }
    }
  }
  function dispose() { mapEl?.remove(); heartEl?.remove(); }
  setParty([]);
  return {
    frame, setParty, dispose,
    get reach() { return reach; }, get inv() { return inv; },
    // tests
    get seen() { let n = 0; for (const v of seen) n += v; return n; }, get lastBeat() { return lastBeat; }, nearestGhoul, beatGap, mapEl: () => mapEl, heartEl: () => heartEl,
  };
}
