// The crossword on the cracker barrel in Kevin's Tool Crib (crib-crossword, Andrew 2026-11-07: "I want a crossword"). One puzzle
// a week for everybody (lib/crossword.js keeps it and the answers; crossword-rules.js the shared rules). E at the barrel opens the
// sheet over the view: a printed crossword (numbered squares, Across and Down clues). Press on an answer's first square and drag
// through it to pick it (a tap picks the Across, a second tap the Down), then type; a phone gets a big letter keyboard on the
// sheet (the phone's own would cover the grid). No check, no reveal, no red letters: a finished answer goes to the server; right,
// it locks in ink for everyone, a 3D pencil (the one 3D piece) circles it and the finder's name goes by the clue in pencil;
// wrong, nothing happens: the letters stay as written, unscored, to be written over (Andrew's CHANGE 2). The letters a player
// has written and not locked are theirs only, kept on the server for them (op pencil), so the sheet has them next visit.
// Also here: the sheet on the barrel's lid (drawn from the same state) and the CROSSWORD score card pinned on the window display's
// back by the barrel: the top five by points, all time.
import * as THREE from 'three';
import { el, loadCss } from './util.js';
import { weekOf, entryAt, cellsOf } from './crossword-rules.js';
import { toLocal, worldYaw } from './tool-crib-plan.js';

const INK = '#2b2340', PAPER = '#fbf6e8', LEAD = '#5d5a66', HILITE = '#fff0a8', CURSOR = '#ffd34d';
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const BACK = String.fromCharCode(9003);
const svg = (d, label) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-label', label); s.setAttribute('role', 'img'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; };

// a hand-drawn oval round an answer: centre, half length, half width, angle; the loop goes round 1.08 times with a little wobble
function loopPoint(L, u, out) {
  const th = L.t0 + u * Math.PI * 2 * 1.08, wob = 1 + 0.05 * Math.sin(th * 3 + L.seed) + 0.04 * u;
  const x = Math.cos(th) * L.a * wob, y = Math.sin(th) * L.b * wob;
  out[0] = L.cx + x * Math.cos(L.ang) - y * Math.sin(L.ang); out[1] = L.cy + x * Math.sin(L.ang) + y * Math.cos(L.ang);
  return out;
}

// ---- the 3D pencil: its own little renderer over the sheet, made the first time a pencil is needed, drawn only while it moves
function makePencil() {
  const canvas = el('canvas', 'cw-pencil');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, 1, 0, -1, -400, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-0.5, 0.8, 1); scene.add(sun);
  const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const mat = c => new THREE.MeshToonMaterial({ color: c, gradientMap: grad });
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  // along +y, the point at the origin; 1 unit = one square
  const pen = new THREE.Group();
  const part = (geo, m, y) => { const a = new THREE.Mesh(geo, m); a.position.y = y; const o = new THREE.Mesh(geo, ink); o.position.y = y; o.scale.setScalar(1.12); pen.add(a, o); };
  const R = 0.17;
  part(new THREE.CylinderGeometry(0.012, 0.05, 0.14, 6), mat('#3a3a42'), 0.07);       // the lead
  part(new THREE.CylinderGeometry(0.05, R, 0.5, 6), mat('#e8c9a0'), 0.39);            // the sharpened wood
  part(new THREE.CylinderGeometry(R, R, 4.2, 6), mat('#f2c230'), 2.74);               // the yellow body
  part(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.36, 12), mat('#b8bec6'), 5.02); // the ferrule
  part(new THREE.CylinderGeometry(R, R, 0.42, 12), mat('#f08a9a'), 5.4);              // the eraser
  pen.rotation.order = 'ZXY';
  scene.add(pen);
  return {
    canvas, pen,
    size(w, h, px) { renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; cam.left = 0; cam.right = w; cam.top = 0; cam.bottom = -h; cam.updateProjectionMatrix(); this.px = px; },
    // tip at (x, y) css px over the sheet, `lift` px off the paper, leaning up and to the right
    draw(x, y, lift, lean) {
      const s = this.px;
      pen.scale.setScalar(s);
      pen.position.set(x, -y + lift * 0.4, lift);
      pen.rotation.set(-0.95, 0, -0.55 - lean);
      renderer.render(scene, cam);
    },
    clear() { renderer.clear(); },
    get info() { return renderer.info.render; },
  };
}

export function createCribCrossword(ctx, built, P) {
  const { ui, audio, net, player, input } = ctx;
  loadCss('/css/crossword.css');
  const B = P.barrel, fy = P.fy;
  let S = null;              // the server's state: { wk, p, theme, w, h, entries, locked: [{ i, s, n }], top, done }
  const lockedBy = new Map(); // entry i -> { s, n }
  let letters = new Map();    // 'r,c' -> the locked letter there (from every locked answer)
  const typed = new Map();    // 'r,c' -> a letter this player typed (not shared)
  let sel = -1, cur = 0, pending = -1, anims = [], drag = null, hiAt = 0, saveAt = 0, sentS = '';
  const tried = new Map();   // entry i -> the letters the server said no to (not sent again unchanged)
  const key = (r, c) => r + ',' + c;

  function rebuild() {
    letters = new Map();
    for (const [i, L] of lockedBy) cellsOf({ ...S.entries[i] }).forEach(([r, c], k) => letters.set(key(r, c), L.s[k]));
    for (const k of [...typed.keys()]) if (letters.has(k)) typed.delete(k);
  }
  net.on('cw', m => {
    if (m.op === 'state') {
      const fresh = !S || S.wk !== m.wk;
      S = m; lockedBy.clear();
      for (const l of m.locked) lockedBy.set(l.i, { s: l.s, n: l.n });
      if (fresh) { typed.clear(); tried.clear(); sel = -1; anims = []; pending = -1; }
      if (fresh || !typed.size) for (const [k, v] of Object.entries(m.mine || {})) if (typeof v === 'string' && /^[A-Z]$/.test(v)) typed.set(k, v);
      rebuild(); refreshAll();
    } else if (m.op === 'locked' && S && m.wk === S.wk) {
      lockedBy.set(m.i, { s: m.s, n: m.n }); S.top = m.top; S.done = m.done;
      if (!S.locked.some(l => l.i === m.i)) S.locked.push({ i: m.i, s: m.s, n: m.n });
      const had = typed.size;
      rebuild();
      if (typed.size !== had) saveSoon();
      if (pending === m.i) pending = -1;
      if (!sheet.hidden) anims.push({ i: m.i, t: 0 });
      if (m.by === net.sid) { ui.toast(m.pts ? `${S.entries[m.i].n} ${S.entries[m.i].d === 'A' ? 'Across' : 'Down'}: right! +${m.pts}` : 'Right! Sign in to keep points.', 2600); audio.ui?.('pop'); }
      audio.play?.('cw-scratch', B.x, B.top + 0.2, B.z);
      if (sel === m.i) moveOn();
      refreshAll();
    } else if (m.op === 'no') {
      if (m.i === pending) pending = -1;
      if (m.why === 'wrong' && S && S.entries[m.i]) tried.set(m.i, sentS);   // (nothing shows: the letters stay as written)
      else if (m.why === 'far') ui.toast('Step up to the barrel or the clipboard by the door to fill it in.', 2200);
      draw();
    }
  });
  const hello = () => { if (performance.now() - hiAt > 3000) { hiAt = performance.now(); net.send({ t: 'cw', op: 'hi' }); } };
  net.on('welcome', () => { hiAt = 0; hello(); });

  // ================================================================ the sheet
  const sheet = el('div', 'cw-sheet', '', { hidden: '', role: 'dialog', 'aria-label': 'The crossword' });
  const paper = el('div', 'cw-paper');
  const head = el('div', 'cw-head'), title = el('div', 'cw-title', 'CROSSWORD'), theme = el('div', 'cw-theme', '');
  const close = el('button', 'cw-close', '', { type: 'button', 'aria-label': 'Close the crossword' });
  close.append(svg('M6 6 L18 18 M18 6 L6 18', 'Close'));
  head.append(title, theme, close);
  const gridWrap = el('div', 'cw-gridwrap'), gridCv = el('canvas', 'cw-grid', '', { tabindex: '0', 'aria-label': 'The crossword grid' });
  gridWrap.append(gridCv);
  const clueBar = el('div', 'cw-cluebar', '', { 'aria-live': 'polite' });
  const lists = el('div', 'cw-lists');
  const colA = el('div', 'cw-col'), colD = el('div', 'cw-col');
  colA.append(el('div', 'cw-colhead', 'Across'), el('ol', 'cw-ol')); colD.append(el('div', 'cw-colhead', 'Down'), el('ol', 'cw-ol'));
  lists.append(colA, colD);
  const kb = el('div', 'cw-kb');
  for (const [i, row] of ROWS.entries()) {
    const rEl = el('div', 'cw-kbrow');
    for (const ch of row) { const b = el('button', 'cw-key', ch, { type: 'button', 'data-k': ch }); rEl.append(b); }
    if (i === 2) { const b = el('button', 'cw-key wide', BACK, { type: 'button', 'data-k': 'BACK', 'aria-label': 'Rub out' }); rEl.append(b); }
    kb.append(rEl);
  }
  const side = el('div', 'cw-side');
  side.append(head, clueBar, lists, kb);
  paper.append(gridWrap, side);
  sheet.append(paper);
  ctx.hud.append(sheet);
  let pencil = null;

  let cell = 30, ox = 0, oy = 0, gw = 0, gh = 0, touchKb = false;
  function layout() {
    if (!S) return;
    const vw = window.innerWidth, vh = window.innerHeight, wide = vw > vh * 1.05;
    touchKb = input?.lastDevice === 'touch' || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    paper.classList.toggle('wide', wide); paper.classList.toggle('tall', !wide); kb.hidden = !touchKb;
    const phone = Math.min(vw, vh) < 560, m = phone ? 4 : 18, pad = phone ? 6 : 14;
    const pw = Math.min(vw - m * 2, phone ? 9999 : 1100), ph = Math.min(vh - m * 2, phone ? 9999 : 760);
    paper.style.width = pw + 'px'; paper.style.height = ph + 'px';
    if (wide && !touchKb && !phone) paper.style.height = Math.min(ph, Math.max(S.h * 40 + pad * 2 + 6, 460)) + 'px';   // (no empty paper under the grid on a PC)
    const availW = wide ? pw * (touchKb ? 0.46 : 0.54) - pad * 2 : pw - pad * 2;
    const availH = wide ? ph - pad * 2 : ph * (touchKb ? 0.47 : 0.56) - pad;
    cell = Math.max(16, Math.min(phone ? 44 : 40, Math.floor(Math.min(availW / S.w, availH / S.h))));
    gw = cell * S.w; gh = cell * S.h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    gridCv.width = Math.round(gw * dpr); gridCv.height = Math.round(gh * dpr); gridCv.style.width = gw + 'px'; gridCv.style.height = gh + 'px';
    gridWrap.style.width = (wide ? gw + pad * 2 : pw) + 'px';
    paper.style.setProperty('--pad', pad + 'px');
    if (pencil) placePencil();
    draw();
  }
  function placePencil() {
    const pr = paper.getBoundingClientRect(), gr = gridCv.getBoundingClientRect();
    pencil.size(pr.width, pr.height, cell);
    ox = gr.left - pr.left; oy = gr.top - pr.top;
  }
  addEventListener('resize', () => { if (!sheet.hidden) layout(); });

  // ---- drawing the grid
  const gx = gridCv.getContext('2d');
  const loopOf = i => {
    const e = S.entries[i], len = e.len, A = e.d === 'A';
    const x0 = (e.c + 0.5) * cell, y0 = (e.r + 0.5) * cell, x1 = x0 + (A ? (len - 1) * cell : 0), y1 = y0 + (A ? 0 : (len - 1) * cell);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, a: (len - 1) / 2 * cell + cell * 0.56, b: cell * 0.5, ang: A ? 0 : Math.PI / 2, t0: 2.3 + (i % 5) * 0.4, seed: i * 1.7 };
  };
  const P2 = [0, 0];
  function strokeLoop(i, upto) {
    const L = loopOf(i), n = 64;
    gx.beginPath();
    for (let k = 0; k <= n * upto; k++) { loopPoint(L, k / n, P2); if (k) gx.lineTo(P2[0], P2[1]); else gx.moveTo(P2[0], P2[1]); }
    gx.stroke();
  }
  const isOpen = (r, c) => !!S && r >= 0 && c >= 0 && r < S.h && c < S.w && openSet.has(key(r, c));
  let openSet = new Set(), nums = new Map();
  function shape() {
    openSet = new Set(); nums = new Map();
    for (const e of S.entries) { for (const [r, c] of cellsOf(e)) openSet.add(key(r, c)); nums.set(key(e.r, e.c), e.n); }
  }
  function draw() {
    if (!S || sheet.hidden) return;
    const dpr = gridCv.width / Math.max(1, gw);
    gx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gx.clearRect(0, 0, gw, gh);
    const selCells = new Set(sel >= 0 ? cellsOf(S.entries[sel]).map(([r, c]) => key(r, c)) : []);
    const curCell = sel >= 0 ? cellsOf(S.entries[sel])[cur] : null;
    for (const k of openSet) {
      const [r, c] = k.split(',').map(Number), x = c * cell, y = r * cell;
      gx.fillStyle = curCell && curCell[0] === r && curCell[1] === c ? CURSOR : selCells.has(k) ? HILITE : '#ffffff';
      gx.fillRect(x, y, cell, cell);
    }
    gx.strokeStyle = INK; gx.lineWidth = Math.max(1, cell / 26);
    for (const k of openSet) { const [r, c] = k.split(',').map(Number); gx.strokeRect(c * cell + 0.5, r * cell + 0.5, cell - 1, cell - 1); }
    gx.fillStyle = INK; gx.textAlign = 'left'; gx.textBaseline = 'top'; gx.font = `600 ${Math.max(8, Math.round(cell * 0.3))}px Nunito, sans-serif`;
    for (const [k, n] of nums) { const [r, c] = k.split(',').map(Number); gx.fillText(String(n), c * cell + cell * 0.08, r * cell + cell * 0.04); }
    gx.textAlign = 'center'; gx.textBaseline = 'middle';
    const big = `700 ${Math.round(cell * 0.6)}px Fredoka, sans-serif`;
    gx.font = big;
    for (const [k, ch] of letters) { const [r, c] = k.split(',').map(Number); gx.fillStyle = INK; gx.fillText(ch, (c + 0.55) * cell, (r + 0.6) * cell); }
    gx.font = `500 ${Math.round(cell * 0.58)}px Fredoka, sans-serif`;
    for (const [k, ch] of typed) { const [r, c] = k.split(',').map(Number); gx.fillStyle = LEAD; gx.fillText(ch, (c + 0.55) * cell, (r + 0.6) * cell); }
    // the pencil loops round the locked answers (one being drawn just now: as far as the pencil has got)
    gx.strokeStyle = 'rgba(70, 68, 80, 0.85)'; gx.lineWidth = Math.max(1.4, cell / 16); gx.lineCap = 'round'; gx.lineJoin = 'round';
    for (const i of lockedBy.keys()) { const a = anims.find(q => q.i === i); strokeLoop(i, a ? drawnOf(a) : 1); }
    // the drag band
    if (drag && drag.moved && drag.end) {
      const [r0, c0] = drag.start, [r1, c1] = drag.end;
      gx.strokeStyle = 'rgba(93, 90, 102, 0.35)'; gx.lineWidth = cell * 0.78; gx.lineCap = 'round';
      gx.beginPath(); gx.moveTo((c0 + 0.5) * cell, (r0 + 0.5) * cell); gx.lineTo((c1 + 0.5) * cell + 0.01, (r1 + 0.5) * cell); gx.stroke();
    }
  }
  // an animation's phases: down onto the paper 0.3 s, round the answer 1.1 s, up and away 0.4 s
  const T_IN = 0.3, T_LOOP = 1.1, T_OUT = 0.4;
  const drawnOf = a => Math.max(0, Math.min(1, (a.t - T_IN) / T_LOOP));

  // ---- the lists
  function fillLists() {
    for (const [col, d] of [[colA, 'A'], [colD, 'D']]) {
      const ol = col.querySelector('ol'); ol.replaceChildren();
      S.entries.forEach((e, i) => {
        if (e.d !== d) return;
        const li = el('li', 'cw-clue' + (i === sel ? ' on' : '') + (lockedBy.has(i) ? ' done' : ''), '', { 'data-i': String(i) });
        li.append(el('b', '', e.n + ' '), el('span', '', e.clue + ' (' + e.len + ')'));
        if (lockedBy.has(i)) li.append(el('span', 'cw-by', lockedBy.get(i).n));
        li.onclick = () => { select(i, firstEmpty(i)); };
        ol.append(li);
      });
    }
    const e = sel >= 0 ? S.entries[sel] : null;
    clueBar.textContent = e ? `${e.n} ${e.d === 'A' ? 'Across' : 'Down'}: ${e.clue}` : (S.done ? 'All filled in! A new one on Sunday.' : 'Drag through an answer, or tap a square.');
    theme.textContent = S.theme;
    // the picked clue in view (the list's own scroll only: scrollIntoView would also scroll the sheet under the finger)
    const on = lists.querySelector('.on');
    if (on) { const t = on.offsetTop - lists.offsetTop, h = on.offsetHeight; if (t < lists.scrollTop) lists.scrollTop = t - 4; else if (t + h > lists.scrollTop + lists.clientHeight) lists.scrollTop = t + h - lists.clientHeight + 4; }
  }
  function refreshAll() { if (S) { shape(); if (!sheet.hidden) { fillLists(); draw(); } } paintLid(); paintCard(); }

  // ---- picking and typing
  const filledAt = (r, c) => letters.has(key(r, c)) || typed.has(key(r, c));
  function firstEmpty(i, from = 0) { const cs = cellsOf(S.entries[i]); for (let k = from; k < cs.length; k++) if (!filledAt(...cs[k])) return k; for (let k = 0; k < cs.length; k++) if (!filledAt(...cs[k])) return k; return Math.min(from, cs.length - 1); }
  function select(i, k = 0) { sel = i; cur = Math.max(0, Math.min(S.entries[i].len - 1, k)); fillLists(); draw(); }
  function moveOn() { if (sel >= 0 && lockedBy.has(sel)) { /* stays picked: its clue shows its finder */ } }
  function typeLetter(ch) {
    if (sel < 0 || lockedBy.has(sel) || pending === sel) return;
    const cs = cellsOf(S.entries[sel]);
    let k = cur;
    while (k < cs.length && letters.has(key(...cs[k]))) k++;
    if (k >= cs.length) k = cs.findIndex(q => !letters.has(key(...q)));
    if (k < 0) return;
    typed.set(key(...cs[k]), ch);
    let n = k + 1;
    while (n < cs.length && letters.has(key(...cs[n]))) n++;
    cur = Math.min(n, cs.length - 1);
    saveSoon();
    maybeSend();
    draw();
  }
  function rubOut() {
    if (sel < 0 || lockedBy.has(sel) || pending === sel) return;
    const cs = cellsOf(S.entries[sel]);
    let k = cur;
    if (!typed.has(key(...cs[k]))) { k--; while (k >= 0 && letters.has(key(...cs[k]))) k--; }
    if (k < 0) return;
    typed.delete(key(...cs[k])); cur = k; saveSoon(); draw();
  }
  function maybeSend() {
    if (sel < 0 || lockedBy.has(sel) || pending >= 0) return;
    const cs = cellsOf(S.entries[sel]);
    if (!cs.every(q => filledAt(...q))) return;
    const s = cs.map(q => letters.get(key(...q)) || typed.get(key(...q))).join('');
    if (tried.get(sel) === s) return;
    pending = sel; sentS = s;
    net.send({ t: 'cw', op: 'answer', wk: S.wk, i: sel, s });
    setTimeout(() => { if (pending >= 0) { pending = -1; } }, 5000);
  }

  // my pencil letters to the server (half a second after the last change)
  function saveSoon() { saveAt = performance.now() + 500; }
  function flushSave() { saveAt = 0; if (S) net.send({ t: 'cw', op: 'pencil', wk: S.wk, m: Object.fromEntries(typed) }); }

  // ---- the pointer on the grid: press, drag through an answer, let go; a tap without a drag picks Across, a second tap Down
  const cellAt = e => { const r = gridCv.getBoundingClientRect(); return [(e.clientY - r.top) / cell - 0.5, (e.clientX - r.left) / cell - 0.5]; };
  gridCv.addEventListener('pointerdown', e => {
    if (!S) return;
    const [fr, fc] = cellAt(e), r = Math.round(fr), c = Math.round(fc);
    if (!isOpen(r, c)) return;
    e.preventDefault(); gridCv.setPointerCapture?.(e.pointerId);
    drag = { id: e.pointerId, start: [r, c], end: [r, c], moved: false, d: null };
  });
  gridCv.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const [fr, fc] = cellAt(e), dr = fr - drag.start[0], dc = fc - drag.start[1];
    if (!drag.moved && Math.hypot(dr, dc) < 0.45) return;
    drag.moved = true;
    drag.d = Math.abs(dc) >= Math.abs(dr) ? 'A' : 'D';
    const i = entryAt(S.entries, drag.start[0], drag.start[1], drag.d);
    if (i < 0) { drag.end = null; draw(); return; }
    const e2 = S.entries[i], A = drag.d === 'A';
    const lo = A ? e2.c : e2.r, hi = lo + e2.len - 1, v = Math.max(lo, Math.min(hi, Math.round(A ? fc : fr)));
    drag.end = A ? [drag.start[0], v] : [v, drag.start[1]];
    draw();
  });
  const up = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    const [r, c] = d.start;
    if (d.moved) {
      const i = d.d ? entryAt(S.entries, r, c, d.d) : -1;
      if (i >= 0) select(i, firstEmpty(i)); else draw();   // (a word is written from its start, whichever end the drag began)
    } else {
      const a = entryAt(S.entries, r, c, 'A'), dn = entryAt(S.entries, r, c, 'D');
      const curCell = sel >= 0 ? cellsOf(S.entries[sel])[cur] : null, same = curCell && curCell[0] === r && curCell[1] === c;
      let i = a >= 0 ? a : dn;
      if (same && a >= 0 && dn >= 0) i = sel === a ? dn : a;
      else if (sel >= 0 && (sel === a || sel === dn)) i = sel;
      const e2 = S.entries[i];
      select(i, e2.d === 'A' ? c - e2.c : r - e2.r);
    }
    gridCv.focus({ preventScroll: true });
  };
  gridCv.addEventListener('pointerup', up);
  gridCv.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) { drag = null; draw(); } });
  gridCv.style.touchAction = 'none';
  kb.addEventListener('pointerdown', e => { const b = e.target.closest('.cw-key'); if (!b) return; e.preventDefault(); const k = b.dataset.k; if (k === 'BACK') rubOut(); else typeLetter(k); b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120); });
  kb.addEventListener('click', e => e.preventDefault());
  // the keyboard: letters type, Backspace rubs out, arrows move along (or switch), Tab the next clue, Esc closes. The sheet has
  // every key while it is open (the town never hears them)
  const onKeyDown = e => {
    if (sheet.hidden) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key;
    let used = true;
    if (k === 'Escape') hide();
    else if (/^[a-zA-Z]$/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) typeLetter(k.toUpperCase());
    else if (k === 'Backspace' || k === 'Delete') rubOut();
    else if (k === 'Enter') maybeSend();
    else if (k === 'Tab') { const n = S.entries.length; select(((sel < 0 ? -1 : sel) + (e.shiftKey ? n - 1 : 1)) % n, 0); }
    else if (/^Arrow/.test(k) && sel >= 0) {
      const e2 = S.entries[sel], A = e2.d === 'A', along = A ? (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0) : (k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0);
      if (along) { cur = Math.max(0, Math.min(e2.len - 1, cur + along)); draw(); }
      else { const [r, c] = cellsOf(e2)[cur], o = entryAt(S.entries, r, c, A ? 'D' : 'A'); if (o >= 0) { const e3 = S.entries[o]; select(o, A ? r - e3.r : c - e3.c); } }
    } else if (/^Arrow/.test(k)) select(0, 0);
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
    else if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
  };
  addEventListener('keydown', onKeyDown, true);
  close.onclick = () => hide();

  function show() {
    if (!S) { hello(); ui.toast('One moment...', 1200); return; }
    sheet.hidden = false; ctx.hud.classList.add('cw-on'); player.controls = false;
    input?.reset?.();
    shape(); layout(); fillLists(); draw();
    audio.ui?.('pop');
    setTimeout(() => gridCv.focus({ preventScroll: true }), 30);
  }
  function hide() {
    if (sheet.hidden) return;
    sheet.hidden = true; ctx.hud.classList.remove('cw-on'); drag = null;
    if (saveAt) flushSave();
    anims = []; if (pencil) { pencil.canvas.hidden = true; }
    if (ctx.playing && !ctx.below) player.controls = true;
  }

  // ================================================================ the barrel's lid and the score card
  const lidCv = document.createElement('canvas'); lidCv.width = 320; lidCv.height = 400;
  const lidTex = new THREE.CanvasTexture(lidCv); lidTex.colorSpace = THREE.SRGBColorSpace; lidTex.anisotropy = 4;
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), new THREE.MeshBasicMaterial({ map: lidTex, fog: true, color: 0xeeeeee }));
  lid.rotation.set(-Math.PI / 2, 0, 0.18); lid.position.set(B.x - 0.03, fy + 0.72 + 0.034, B.z + 0.01); lid.name = 'crib-crossword-lid';
  built.inside.add(lid);
  // the clipboard on the porch wall by the door (Andrew 2026-11-07: "generally be able to play it whenever"): the same week's sheet,
  // out under the gooseneck lamp, so the shop's hours don't shut the puzzle away
  const K = B.clip, clip = new THREE.Group(); clip.name = 'crib-crossword-clip';
  clip.position.set(K.x, K.y, K.z); clip.rotation.set(0, Math.PI, -0.02);
  { const board = new THREE.Mesh(new THREE.BoxGeometry(K.w, K.h, 0.012), new THREE.MeshLambertMaterial({ color: 0x8a6440 })); board.position.z = -0.006; clip.add(board);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(K.w - 0.03, (K.w - 0.03) * 1.25), new THREE.MeshBasicMaterial({ map: lidTex, fog: true, color: 0xe4e4e4 }));
    paper.position.set(0, -0.015, 0.002); clip.add(paper);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.016), new THREE.MeshLambertMaterial({ color: 0xb8bcc2 })); jaw.position.set(0, K.h / 2 - 0.03, 0.008); jaw.name = 'crib-crossword-jaw'; clip.add(jaw);
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), new THREE.MeshLambertMaterial({ color: 0x5d636b })); nail.rotation.x = Math.PI / 2; nail.position.set(0, K.h / 2 + 0.012, 0); clip.add(nail); }
  built.group.add(clip);
  function paintLid() {
    const g = lidCv.getContext('2d'), W = 320, H = 400;
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 28px Fredoka, sans-serif'; g.fillText('CROSSWORD', W / 2, 26);
    if (S) {
      g.font = '600 15px Nunito, sans-serif'; g.fillText(S.theme, W / 2, 52);
      const cs = Math.floor(Math.min((W - 30) / S.w, 210 / S.h)), x0 = (W - cs * S.w) / 2, y0 = 68;
      for (const e of S.entries) for (const [r, c] of cellsOf(e)) { g.fillStyle = '#ffffff'; g.fillRect(x0 + c * cs, y0 + r * cs, cs, cs); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(x0 + c * cs, y0 + r * cs, cs, cs); }
      g.fillStyle = INK; g.font = `700 ${Math.round(cs * 0.7)}px Fredoka, sans-serif`;
      for (const [k, ch] of letters) { const [r, c] = k.split(',').map(Number); g.fillText(ch, x0 + (c + 0.5) * cs, y0 + (r + 0.56) * cs); }
      // the clue lines, too small to read: grey bars as on a printed sheet
      g.fillStyle = 'rgba(43,35,64,0.35)';
      for (let k = 0; k < 12; k++) g.fillRect(k < 6 ? 22 : 170, y0 + S.h * cs + 18 + (k % 6) * 13, 90 + ((k * 37) % 40), 5);
    }
    lidTex.needsUpdate = true;
  }
  const cardCv = document.createElement('canvas'); cardCv.width = 512; cardCv.height = 400;
  const cardTex = new THREE.CanvasTexture(cardCv); cardTex.colorSpace = THREE.SRGBColorSpace; cardTex.anisotropy = 4;
  const C2 = B.card;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(C2.w, C2.h), new THREE.MeshBasicMaterial({ map: cardTex, fog: true, color: 0xeeeeee }));
  card.position.set(C2.x, C2.y, C2.z); card.rotation.set(0, 0, 0.03); card.name = 'crib-crossword-card';
  built.inside.add(card);
  let cardRows = [];
  function paintCard() {
    const g = cardCv.getContext('2d'), W = 512, H = 400;
    g.fillStyle = '#f6efdc'; g.fillRect(0, 0, W, H);
    g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(W / 2, 26, 11, 0, Math.PI * 2); g.fill();   // the tack
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 58px Fredoka, sans-serif'; g.fillText('CROSSWORD', W / 2, 78);
    g.font = '600 24px Nunito, sans-serif'; g.fillStyle = '#5d5a66'; g.fillText('Most points', W / 2, 122);
    const top = (S && S.top) || [];
    cardRows = top.map(t => `${t.n} ${t.pts}`);
    g.textBaseline = 'alphabetic';
    if (!top.length) { g.textAlign = 'center'; g.font = '600 30px Nunito, sans-serif'; g.fillStyle = INK; g.fillText('Nobody yet!', W / 2, 230); }
    top.forEach((t, k) => {
      const y = 180 + k * 48;
      g.fillStyle = INK; g.textAlign = 'left'; g.font = `700 ${k ? 34 : 38}px Fredoka, sans-serif`;
      g.fillText(`${k + 1}. ${t.n}`.slice(0, 18), 40, y, 340);
      g.textAlign = 'right'; g.fillText(String(t.pts), W - 40, y);
    });
    cardTex.needsUpdate = true;
  }
  paintLid(); paintCard();

  // a pencil's scratch (a few soft bursts)
  audio.registerSfx?.('cw-scratch', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; for (let k = 0; k < 5; k++) a.burst(o, { t: t + k * 0.2, dur: 0.16, f: 3200, Q: 0.8, peak: 0.03 }); });

  let checkAt = 0;
  return {
    name: 'crossword',
    get state() { return S; }, get open() { return !sheet.hidden; }, get sel() { return sel; }, get cur() { return cur; },
    get typed() { return Object.fromEntries(typed); }, get letters() { return Object.fromEntries(letters); },
get anims() { return anims.map(a => ({ i: a.i, t: a.t, drawn: drawnOf(a) })); },
    get cardRows() { return cardRows; }, get cell() { return cell; }, get keyboard() { return !kb.hidden; },
    get pencil() { return pencil && !pencil.canvas.hidden ? { tip: pencil.tip, info: { ...pencil.info } } : null; },
    get clueBar() { return clueBar.textContent; },
    clueText: i => lists.querySelector(`[data-i="${i}"]`)?.textContent || '',
    rect: (r, c) => { const g = gridCv.getBoundingClientRect(); return { x: g.left + (c + 0.5) * cell, y: g.top + (r + 0.5) * cell }; },
    paperRect: () => { const r = paper.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    lid, card, show, hide, hello,
    update(dt) {
      const now = performance.now();
      if (now > checkAt) { checkAt = now + 10000; if (!S || weekOf(net.serverNow()) !== S.wk) hello(); }
      if (saveAt && now > saveAt) flushSave();
      if (sheet.hidden) return;
      let redraw = false;
      if (anims.length) {
        if (!pencil) { pencil = makePencil(); paper.append(pencil.canvas); placePencil(); }
        const a = anims[0];
        a.t += dt;
        pencil.canvas.hidden = false;
        const L = loopOf(a.i), u = drawnOf(a);
        loopPoint(L, u, P2);
        let lift = 0, tx = P2[0], ty = P2[1];
        if (a.t < T_IN) { const k = 1 - a.t / T_IN; lift = k * cell * 4; tx += k * cell * 3; ty -= k * cell * 3; }
        else if (a.t > T_IN + T_LOOP) { const k = Math.min(1, (a.t - T_IN - T_LOOP) / T_OUT); lift = k * cell * 4; tx += k * cell * 3; ty -= k * cell * 3; }
        pencil.tip = [Math.round(tx), Math.round(ty), Math.round(lift)];
        pencil.draw(ox + tx, oy + ty, lift, Math.sin(a.t * 9) * 0.04);
        if (a.t > T_IN + T_LOOP + T_OUT) { anims.shift(); if (!anims.length) { pencil.clear(); pencil.canvas.hidden = true; } }
        redraw = true;
      }
      if (redraw) draw();
    },
    target(wx, wz, wyaw) {
      const [px, pz] = toLocal(wx, wz), yaw = worldYaw(wyaw);   // (crib-move: the barrel and the clipboard are plan-frame spots; you, turned into it)
      if (!sheet.hidden) return null;
      if (player.pos.y > fy + 1) return null;
      const at = (x, z, r, f = 0.3) => { const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz); return d <= r && d >= 0.1 && (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d >= f; };
      if (at(B.x, B.z, 1.35) || (pz < K.z && at(K.x, K.z, 1.5, 0.75))) return { hint: 'E  Do the crossword', prio: 8, run: show };   // the barrel, or the clipboard by the door
      return null;
    },
    onKey() { return !sheet.hidden; },
  };
}
