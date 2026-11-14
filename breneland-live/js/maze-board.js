// Beneath Angell Street: the board by the door, in the Lovecraft house's hall on the west wall, between the corner and the
// grandfather clock. A dark wooden board with brass corners, chalked names, a chalk ledge and a candle guttering on it. Two panels,
// TODAY (one maze a day) and ALL TIME, the top ten each: escapers first by their time, then everyone else by how far they got
// (lib/maze-board.js ranks it and pushes { t: 'mazeboard', day, today, all, at } when it changes; GET /api/mazeboard is the same).
// On a day the door is locked the board says when it next opens. E in front of it (facing it) opens a card with the same lists,
// which is how a phone reads it too. One CanvasTexture on an unlit face, repainted only when the lists, the day or the door's state
// change. The candle's glow only flickers while the house's inside is drawn. One maze a week (w16-phase4): the board says so,
// with the week's difficulty in a word (maze-gen.js difficultyOf on the week's maze) beside the goal line.
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { soft, redrawWhenFontsLoad } from './toon.js';
import { houseGame, nextOpen } from './lovecraft-days.js';
import { el, loadCss } from './util.js';
import { weekOf, mazeForWeek, goalForWeek } from './maze-gen.js';
import { GOAL_TEXT } from './maze-story.js'; // the week's goal in one line (w16-goals)

const W_M = 0.84, H_M = 1.36;             // the board's face, metres
const PX = 640, PY = Math.round(PX * H_M / W_M);
const V_MID = 0.04, Y0 = 0.9;             // house-local v of its middle (the hall's north-west corner is at v -0.5), its bottom over the floor (its middle at eye height)
const CHALK = '#ece6d6', CHALK_DIM = 'rgba(236, 230, 214, 0.55)', BRASS = '#d6ae55', SLATE = '#1f2622';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// an Eastern day number (days since 1970-01-01 on the Eastern calendar) as "Friday, October 30"
export function dayText(day) { const d = new Date(day * 864e5); return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; }
// 252000 ms -> "4:12"
export const timeText = ms => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const resultText = r => (r.esc ? `escaped in ${timeText(r.ms)}` : `${r.m} m`);
const F = (w, px, fam = 'Special Elite') => `${w} ${px}px "${fam}", "Courier New", serif`;

function fit(g, text, font, px, maxW, min = 12) { let s = px; g.font = font(s); while (g.measureText(text).width > maxW && s > min) { s -= 1; g.font = font(s); } return s; }
// chalk: a stroke of smudge under the words, plain fills only (no canvas filters)
function smudges(g, W, H, seed) {
  let a = seed >>> 0; const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < 120; i++) { // old wiping: long faint strokes, mostly level
    g.strokeStyle = `rgba(236, 230, 214, ${0.012 + rnd() * 0.022})`; g.lineWidth = 6 + rnd() * 16; g.lineCap = 'round';
    const x = rnd() * W, y = rnd() * H, l = 40 + rnd() * 160, a = (rnd() - 0.5) * 0.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.5, y + (rnd() - 0.5) * 30, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}
export const GOAL_LINE = 'Out first, fastest first. Then the furthest along the way.';
// the board's face: W x H px. b = { today, all, sub, open, closedLine, word }
function paint(g, W, H, b) {
  g.fillStyle = SLATE; g.fillRect(0, 0, W, H);
  smudges(g, W, H, 454);
  g.strokeStyle = 'rgba(214, 174, 85, 0.5)'; g.lineWidth = 3; g.strokeRect(14, 12, W - 28, H - 24); // a brass bead inside the frame
  // the brass plate at the top
  g.fillStyle = '#5a4020'; g.fillRect(36, 18, W - 72, 74);
  g.fillStyle = BRASS; g.fillRect(40, 22, W - 80, 66);
  g.fillStyle = '#f0d58c'; g.fillRect(40, 22, W - 80, 6);
  g.fillStyle = '#2a1e12'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, 'BENEATH ANGELL STREET', s => F(700, s), 40, W - 120); g.fillText('BENEATH ANGELL STREET', W / 2, 57);
  for (const x of [52, W - 52]) { g.fillStyle = '#7a5a22'; g.beginPath(); g.arc(x, 55, 6, 0, Math.PI * 2); g.fill(); }
  // the day, chalked
  g.fillStyle = CHALK; fit(g, b.sub[0], s => F(400, s), 30, W - 60); g.fillText(b.sub[0], W / 2, 122);
  g.fillStyle = CHALK_DIM; fit(g, b.sub[1], s => F(400, s), 24, W - 60); g.fillText(b.sub[1], W / 2, 154);
  const top = 180, foot = 88, panelH = (H - top - foot) / 2;
  const panel = (y, title, rows, empty) => {
    g.strokeStyle = 'rgba(236, 230, 214, 0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, y + 8); g.lineTo(W - 40, y + 8); g.stroke();
    g.fillStyle = BRASS; g.font = F(700, 28); g.textAlign = 'center'; g.fillText(title, W / 2, y + 34);
    const rowH = (panelH - 58) / 10, y0 = y + 58;
    if (!rows.length) { g.fillStyle = CHALK_DIM; fit(g, empty, s => F(400, s), 26, W - 80); g.fillText(empty, W / 2, y0 + rowH * 2.5); return; }
    for (let i = 0; i < 10; i++) {
      const r = rows[i], cy = y0 + rowH * (i + 0.5);
      if (!r) break;
      g.textAlign = 'right'; g.fillStyle = i < 3 ? BRASS : CHALK_DIM; g.font = F(700, 24); g.fillText(`${i + 1}.`, 84, cy);
      const res = resultText(r);
      g.textAlign = 'right'; g.fillStyle = r.esc ? '#f2cf7a' : CHALK; g.font = F(400, 23); const rw = g.measureText(res).width; g.fillText(res, W - 40, cy);
      g.textAlign = 'left'; g.fillStyle = CHALK; fit(g, r.n, s => F(400, s), 25, W - 40 - rw - 120 - 14); g.fillText(r.n, 98, cy);
      if (r.esc) { g.fillStyle = '#f2cf7a'; g.beginPath(); g.moveTo(W - 52 - rw, cy + 8); g.lineTo(W - 52 - rw, cy - 3); g.arc(W - 58 - rw, cy - 3, 6, 0, Math.PI, true); g.lineTo(W - 64 - rw, cy + 8); g.closePath(); g.fill(); } // a little doorway: they got out
    }
  };
  panel(top, 'TODAY', b.today, b.open ? 'Nobody yet today. Be the first!' : b.closedLine);
  panel(top + panelH, 'ALL TIME', b.all, 'Nobody yet. Be the first!');
  // this week's maze in a word, the week's goal in a line under it (w16-goals), then the board's rule (all clear of the candle at the right)
  g.fillStyle = BRASS; g.textAlign = 'center'; fit(g, `This week's maze: ${b.word}`, s => F(700, s), 24, W - 190); g.fillText(`This week's maze: ${b.word}`, (W - 130) / 2 + 10, H - 72);
  g.fillStyle = '#f2cf7a'; fit(g, b.goalLine, s => F(400, s), 22, W - 190); g.fillText(b.goalLine, (W - 130) / 2 + 10, H - 47);
  g.fillStyle = CHALK_DIM; fit(g, GOAL_LINE, s => F(400, s), 21, W - 190);
  g.fillText(GOAL_LINE, (W - 130) / 2 + 10, H - 22);
  // candlelight from the ledge's right end (the candle stands there), warm on the slate
  const gr = g.createRadialGradient(W - 70, H + 30, 10, W - 70, H + 30, H * 0.75);
  gr.addColorStop(0, 'rgba(255, 190, 110, 0.22)'); gr.addColorStop(0.5, 'rgba(255, 170, 90, 0.07)'); gr.addColorStop(1, 'rgba(255, 170, 90, 0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
// the glow sprite's picture (a soft warm dot)
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255, 214, 140, 1)'); gr.addColorStop(0.3, 'rgba(255, 180, 90, 0.45)'); gr.addColorStop(1, 'rgba(255, 160, 70, 0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createMazeBoard(ctx) {
  const { net, ui, player, input, audio, config } = ctx;
  loadCss('/css/maze-board.css');
  const gm = houseGame(config?.games);
  const now = () => net.serverNow();
  let data = { day: 0, today: [], all: [], at: 0 }, lc = null, built = null, key = '', checkAt = 0, flick = 0;
  const maze = () => ctx.features?.find(f => f.name === 'maze') || null;
  const isOpen = () => { const m = maze(); return m ? m.open : true; };
  let wk = null; // { week, word }: the week's maze is built once a week for its word
  const wordFor = day => { const w = weekOf(day); if (!wk || wk.week !== w) { let word = ''; try { word = mazeForWeek(w).report.difficulty.word; } catch (e) { console.error('[mazeboard] the week\'s maze', e); } wk = { week: w, word }; } return wk.word; };
  const dayNow = () => { const d = new Date(now()); const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); };
  // what the board says right now
  function view() {
    const open = isOpen(), day = data.day || dayNow(), next = gm ? nextOpen(gm, now()) : '';
    const today = data.today; // the server's day: it pushes a fresh, empty list within half a minute of midnight
    const goal = goalForWeek(weekOf(dayNow())); // (the week's goal: w16-goals)
    return {
      open, day, today, all: data.all, word: wordFor(dayNow()), week: weekOf(dayNow()), goal, goalLine: `This week: ${(GOAL_TEXT[goal] || GOAL_TEXT.escape).board}`,
      sub: open ? ['One maze all week. New paths on Monday.', dayText(day)] : ['The door is locked today.', next ? `It opens ${next === 'tomorrow' ? 'tomorrow' : 'on ' + next}.` : dayText(day)],
      closedLine: next ? `The door is locked. It opens ${next === 'tomorrow' ? 'tomorrow' : 'on ' + next}.` : 'The door is locked today.',
    };
  }

  // ---- the board in the hall (built once the house exists)
  function build() {
    lc = ctx.features?.find(f => f.name === 'lovecraft') || null;
    if (!lc?.built?.inside) return;
    const P = lc.plan, X = P.HX + P.PU + 0.08 + 0.05, zc = P.HZ + V_MID, yb = P.FY + Y0, yt = yb + H_M, z0 = zc - W_M / 2, z1 = zc + W_M / 2; // X: 5 cm off the papered wall, clear of the wainscot's rail behind it
    const group = new THREE.Group(); group.name = 'maze-board';
    const b = new Batcher({ vertexColors: true, castShadow: false });
    const WOOD = '#3b2418', WOOD2 = '#5a3826', BR = '#c9a24a', WAX = '#efe6cf';
    b.boxMinMax(X - 0.05, yb - 0.08, z0 - 0.08, X + 0.03, yt + 0.08, z1 + 0.08, WOOD);                // the back (to the wall)
    b.boxMinMax(X, yt + 0.02, z0 - 0.08, X + 0.07, yt + 0.09, z1 + 0.08, WOOD2);                      // the rails
    b.boxMinMax(X, yb - 0.09, z0 - 0.08, X + 0.07, yb - 0.02, z1 + 0.08, WOOD2);
    b.boxMinMax(X, yb - 0.02, z0 - 0.08, X + 0.07, yt + 0.02, z0, WOOD2);
    b.boxMinMax(X, yb - 0.02, z1, X + 0.07, yt + 0.02, z1 + 0.08, WOOD2);
    for (const y of [yb - 0.045, yt + 0.045]) for (const z of [z0 - 0.04, z1 + 0.04]) { b.add(GEO.box, BR, { x: X + 0.074, y, z, sx: 0.008, sy: 0.075, sz: 0.075 }); b.add(GEO.cyl8, '#7a5a22', { x: X + 0.079, y, z, sx: 0.012, sy: 0.006, sz: 0.012, rz: Math.PI / 2 }); } // brass corner plates, a rivet each
    b.boxMinMax(X, yb - 0.13, z0, X + 0.13, yb - 0.09, z1, WOOD2);                                   // the chalk ledge
    for (const [z, l] of [[z0 + 0.12, 0.07], [z0 + 0.22, 0.05]]) b.add(GEO.box, '#f4f0e6', { x: X + 0.09, y: yb - 0.08, z, sx: 0.016, sy: 0.016, sz: l, ry: 0.3 }); // chalk
    // the candle at the ledge's north end (by the door): a brass dish, the wax, the flame
    const cz = z0 + 0.07 + 0.03, cx = X + 0.085;
    b.add(GEO.cyl12, BR, { x: cx, y: yb - 0.083, z: cz, sx: 0.045, sy: 0.012, sz: 0.045 });
    b.add(GEO.cyl8, WAX, { x: cx, y: yb - 0.03, z: cz, sx: 0.02, sy: 0.1, sz: 0.02 });
    b.add(GEO.cyl6, '#2a2228', { x: cx, y: yb + 0.028, z: cz, sx: 0.003, sy: 0.016, sz: 0.003 }); // the wick (its flame is fires.js's)
    b.build(group, 'maze-board-frame');
    const canvas = document.createElement('canvas'); canvas.width = PX; canvas.height = PY;
    const g = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true }); mat.name = 'maze-board-face';
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W_M, H_M), mat);
    face.position.set(X + 0.035, (yb + yt) / 2, zc); face.rotation.y = Math.PI / 2; face.name = 'maze-board-face';
    group.add(face);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
    glow.position.set(cx + 0.01, yb + 0.05, cz); glow.scale.setScalar(0.16); glow.name = 'maze-board-candle';
    soft(glow); group.add(glow);
    lc.built.inside.add(group);
    const draw = () => { paint(g, PX, PY, built.v); tex.needsUpdate = true; };
    built = { group, face, glow, canvas, mat, tex, draw, v: view(), spot: { x: X + 1.4, z: zc }, X, zc, yb, yt, candle: { id: 'board', x: cx, y: yb + 0.033, z: cz, fw: 0.012, fh: 0.048, group } };
    draw();
    redrawWhenFontsLoad(() => built && draw(), [F(700, 28), F(400, 24)]);
  }
  function repaint(force) {
    const v = view(), k = JSON.stringify([v.open, v.day, v.sub, v.today, v.all, v.word, v.goal]);
    if (!force && k === key) return false;
    key = k;
    if (built) { built.v = v; built.draw(); }
    if (!card.hidden) fillCard();
    return true;
  }
  net.on('mazeboard', m => { if (!m || !Array.isArray(m.today) || !Array.isArray(m.all)) return; data = { day: m.day | 0, today: m.today.slice(0, 10), all: m.all.slice(0, 10), at: m.at || 0 }; repaint(); });

  // ---- the card (E at the board; a phone reads it here)
  const card = el('div', 'mzb-card panel', '', { hidden: '', role: 'dialog', 'aria-label': 'The board by the door' });
  const cTitle = el('div', 'mzb-title', 'Beneath Angell Street'), cSub = el('div', 'mzb-sub', '');
  const tabs = el('div', 'mzb-tabs', '', { role: 'tablist', 'aria-label': 'Which board' });
  const tToday = el('button', 'mzb-tab', 'Today', { type: 'button', role: 'tab', 'aria-selected': 'true' }), tAll = el('button', 'mzb-tab', 'All time', { type: 'button', role: 'tab', 'aria-selected': 'false' });
  tabs.append(tToday, tAll);
  const list = el('ol', 'mzb-list'), cFoot = el('div', 'mzb-foot', GOAL_LINE);
  const close = el('button', 'btn mzb-close', 'Close', { type: 'button' });
  card.append(cTitle, cSub, tabs, list, cFoot, close); ctx.hud.append(card);
  let tab = 'today', savedHook = null;
  // reading the board: on a phone standing at it (its E prompt up), and anywhere while its card is open, the Quests panel and the
  // speech bubbles step aside (body.mzb-reading, css/maze-board.css). On a phone they sat over the board's top, and the card is how
  // a phone reads it
  let readAt = -1e9, reading = false;
  const phoneNow = () => ctx.hudLayout?.layout === 'phone' || input.lastDevice === 'touch';
  function fillCard() {
    const v = built?.v || view();
    cSub.textContent = v.sub.join(' ');
    cFoot.textContent = `This week's maze: ${v.word}. ${v.goalLine} ${GOAL_LINE}`;
    tToday.setAttribute('aria-selected', String(tab === 'today')); tAll.setAttribute('aria-selected', String(tab === 'all'));
    const rows = tab === 'today' ? v.today : v.all;
    list.replaceChildren();
    if (!rows.length) list.append(el('li', 'mzb-empty', tab === 'today' ? (v.open ? 'Nobody yet today. Be the first!' : v.closedLine) : 'Nobody yet. Be the first!'));
    rows.forEach((r, i) => { const li = el('li', 'mzb-row' + (r.esc ? ' esc' : '')); li.append(el('span', 'mzb-n', `${i + 1}.`), el('span', 'mzb-name', r.n), el('span', 'mzb-res', resultText(r))); list.append(li); });
  }
  const setTab = t => { if (tab === t) return; tab = t; fillCard(); audio.ui?.('blip'); };
  tToday.onclick = () => setTab('today'); tAll.onclick = () => setTab('all');
  function showCard() {
    tab = 'today'; fillCard();
    card.hidden = false; player.controls = false;
    audio.ui?.('pop');
    savedHook = input.menuHook;
    input.menuHook = dir => { if (card.hidden) return false; if (dir === 'left') setTab('today'); else if (dir === 'right') setTab('all'); return true; };
    setTimeout(() => { if (!card.hidden) (tab === 'today' ? tToday : tAll).focus({ preventScroll: true }); }, 20);
  }
  function hideCard() { if (card.hidden) return; card.hidden = true; input.menuHook = savedHook; savedHook = null; if (ctx.playing && !ctx.below) player.controls = true; }
  close.onclick = hideCard;

  return {
    name: 'mazeboard',
    get data() { return data; },
    get built() { return built; },
    get view() { return built ? built.v : view(); },
    get cardOpen() { return !card.hidden; },
    get cardRows() { return [...list.querySelectorAll('li')].map(li => li.textContent); },
    get cardSub() { return cSub.textContent; }, get cardFoot() { return cFoot.textContent; },
    get word() { return wordFor(dayNow()); }, get goal() { return goalForWeek(weekOf(dayNow())); },
    get tab() { return tab; }, get reading() { return reading; },
    get candle() { return built?.candle || null; }, // the candle on the ledge (fires.js gives it its flame)
    showCard, hideCard, setTab, repaint,
    update(dt) {
      if (!built) { if (ctx.features) build(); if (!built) return; }
      const t = performance.now();
      if (t > checkAt) { checkAt = t + 1000; repaint(); } // the day, and the door's open days, change with the clock
      const read = !card.hidden || (phoneNow() && t - readAt < 300);
      if (read !== reading) { reading = read; document.body.classList.toggle('mzb-reading', read); }
      if (!lc.insideShown) return;
      // the candle: a warm glow that breathes and gutters now and then; the slate brightens and dims a hair with it
      flick += dt;
      const k = 0.9 + 0.06 * Math.sin(flick * 9.3) + 0.04 * Math.sin(flick * 23.1 + 1.3) - (Math.sin(flick * 0.7) > 0.93 ? 0.12 : 0);
      built.glow.scale.setScalar(0.13 + 0.05 * k);
      built.mat.color.setScalar(0.9 + 0.1 * k);
    },
    target(px, pz, yaw) {
      readAt = -1e9; // asked every frame, so it's reading only while the last answer was the board's prompt
      if (!card.hidden) return { hint: 'E  Close', prio: 9, run: hideCard };
      if (!built || !lc.inside()) return null;
      const s = built.spot;
      if (px < built.X + 0.2 || Math.hypot(px - s.x, pz - s.z) > 1.15) return null;
      if (-Math.sin(yaw) < 0.45) return null; // facing the board: west, give or take 60 degrees. Else the door's prompt
      readAt = performance.now(); // at the board, facing it
      return { hint: 'E  Read the board', prio: 8, run: showCard };
    },
    onKey(code) {
      if (card.hidden) return false;
      if (code === 'Escape' || code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter') { hideCard(); return true; }
      if (code === 'ArrowLeft') { setTab('today'); return true; }
      if (code === 'ArrowRight' || code === 'Tab') { setTab(tab === 'today' ? 'all' : 'today'); return true; }
      return true;
    },
  };
}
