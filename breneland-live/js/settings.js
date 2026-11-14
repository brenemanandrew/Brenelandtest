// The Settings menu (the ? pill, H, Esc, Start on a pad): a short top page of chunky rows, nested pages that slide in with
// a Back button. Esc or B goes back one level (main.js calls back(); at the top it closes). The markup is in index.html
// (#help: every page is a <section class="set-page" data-page="...">), so the buttons main.js wires exist at load.
//
//   ui.settings.addSection(id, { title, summary, icon, color }) -> { row, page, body, setSummary(text), open() }
//     fills a section that index.html declares (e.g. 'voice': the row and its page are there, hidden until a piece
//     fills them) or adds a new row + page at the end of the list. `body` is the page's content box: put your controls in it.
//   ui.settings.open(id) / back() / reset() / page / setSummary(id, text) / onShow(id, fn)
import { loadCss } from './util.js';

const INK = '#2b2340';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
// row icons: constant SVG strings (viewBox 0 0 32 32), never built from player text
export const ICONS = {
  sound: `<path d="M5 12 h5 l7 -6 v20 l-7 -6 h-5 z" fill="#fff" ${S}/><path d="M21 11 q4 5 0 10 M24.5 7.5 q7 8.5 0 17" fill="none" ${S}/>`,
  graphics: `<path d="M16 3 l3.4 8.6 L28 15 l-8.6 3.4 L16 27 l-3.4 -8.6 L4 15 l8.6 -3.4 z" fill="#fff" ${S}/><circle cx="26" cy="6" r="2.4" fill="#fff" ${S}/>`,
  controls: `<path d="M8 10 h16 a6 6 0 0 1 6 6 l1 6 a4 4 0 0 1 -7 3 l-3 -4 h-10 l-3 4 a4 4 0 0 1 -7 -3 l1 -6 a6 6 0 0 1 6 -6 z" fill="#fff" ${S}/><path d="M9 14 v5 M6.5 16.5 h5" ${S}/><circle cx="22" cy="15" r="1.6" fill="${INK}"/><circle cx="25" cy="18" r="1.6" fill="${INK}"/>`,
  voice: `<rect x="11" y="3" width="10" height="16" rx="5" fill="#fff" ${S}/><path d="M6 15 a10 10 0 0 0 20 0 M16 25 v4 M11 29 h10" fill="none" ${S}/>`,
  you: `<circle cx="16" cy="11" r="6" fill="#fff" ${S}/><path d="M5 29 a11 10 0 0 1 22 0 z" fill="#fff" ${S}/>`,
  fullscreen: `<rect x="5" y="7" width="22" height="18" rx="3" fill="#fff" ${S}/><path d="M9 14 v-3 h3 M20 11 h3 v3 M23 18 v3 h-3 M12 21 h-3 v-3" fill="none" ${S}/>`,
};

// Full screen: the standard API, with the webkit prefix older iPad Safari still uses. iPhone Safari cannot full-screen a page,
// so the row stays hidden there. Esc / F11 / the browser's own controls leave full screen too; the switch follows the real state.
function setupFullscreen(panel) {
  const d = document, el = d.documentElement;
  const enabled = d.fullscreenEnabled || d.webkitFullscreenEnabled;
  const row = panel.querySelector('[data-section="fullscreen"]'), btn = panel.querySelector('#btn-fullscreen');
  if (!row || !btn || !enabled) return;
  row.hidden = false;
  const isOn = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
  const sync = () => { const on = isOn(); btn.setAttribute('aria-checked', on ? 'true' : 'false'); btn.firstElementChild.textContent = on ? 'On' : 'Off'; };
  btn.addEventListener('click', () => {
    try {
      if (isOn()) (d.exitFullscreen || d.webkitExitFullscreen).call(d)?.catch?.(() => {});
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' })?.catch?.(() => {});
    } catch (e) { console.warn('[settings] full screen refused', e); }
  });
  d.addEventListener('fullscreenchange', sync); d.addEventListener('webkitfullscreenchange', sync);
  sync();
}

// Fewer jump scares, on the You page, off by default: Beneath Angell Street's ghoul leaps softer, its face doesn't fill the
// screen, and the shriek is quieter (maze-ghoul.js reads fewerScares() when it grabs you). Kept in localStorage like the rest.
const SCARES = 'breneland.fewerScares.v2'; // (v2: a new name, so every device starts back at off)
export function fewerScares() { try { return JSON.parse(localStorage.getItem(SCARES) || 'false') === true; } catch { return false; } }
function setupScares(panel, audio) {
  const btn = panel.querySelector('#btn-scares');
  if (!btn) return;
  const sync = () => { const on = fewerScares(); btn.setAttribute('aria-checked', on ? 'true' : 'false'); btn.firstElementChild.textContent = on ? 'On' : 'Off'; };
  btn.addEventListener('click', () => { try { localStorage.setItem(SCARES, JSON.stringify(!fewerScares())); } catch { /* private mode */ } sync(); audio?.ui?.('blip'); });
  sync();
}

export function createSettings({ root, input, audio }) {
  loadCss('/css/settings.css');
  const panel = root.querySelector('.help-panel');
  const pages = new Map();
  for (const p of panel.querySelectorAll('.set-page')) pages.set(p.dataset.page, p);
  const stack = ['top'];
  const showFns = new Map();
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const i of panel.querySelectorAll('.set-ic[data-icon]')) i.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[i.dataset.icon] || ''}</svg>`;
  setupFullscreen(panel);
  setupScares(panel, audio);

  function show(id, dir, focusFrom) {
    const page = pages.get(id);
    if (!page) return;
    for (const [k, p] of pages) p.hidden = k !== id;
    panel.dataset.at = id; // (not data-page: that names the sections)
    panel.scrollTop = 0;
    page.classList.remove('in-fwd', 'in-back');
    if (dir && !reduced()) { void page.offsetWidth; page.classList.add(dir > 0 ? 'in-fwd' : 'in-back'); }
    for (const fn of showFns.get(id) || []) fn(page);
    // focus: going in, the first thing on the page; coming back, the row you came from
    const target = focusFrom || page.querySelector('[data-autofocus], [role="tab"][aria-selected="true"]') || first(page);
    if (target && root.contains(document.activeElement) || dir) setTimeout(() => target?.focus({ preventScroll: true }), 0);
  }
  const first = page => [...page.querySelectorAll('button, input, select, summary, [tabindex="0"]')].find(e => !e.disabled && e.offsetParent !== null && !e.classList.contains('set-x'));

  function open(id) {
    if (!pages.has(id) || stack[stack.length - 1] === id) return;
    stack.push(id);
    audio?.ui?.('blip');
    show(id, 1);
  }
  // one level up; false when already at the top (the caller closes the menu)
  function back() {
    if (stack.length <= 1) return false;
    const from = stack.pop();
    show(stack[stack.length - 1], -1, panel.querySelector(`[data-open="${from}"]`));
    return true;
  }
  function reset() { stack.length = 1; show('top', 0); }

  // rows open their page; the Back and X buttons in every page head
  panel.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o && panel.contains(o)) { open(o.dataset.open); return; }
    if (e.target.closest('.set-back')) back();
  });
  // Tab stays inside the menu (it wraps); input.js lets Tab and Space through while an overlay is open
  root.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const page = pages.get(stack[stack.length - 1]);
    const list = [...page.querySelectorAll('button, input, select, summary, a[href], [tabindex="0"]')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
    else if (!e.shiftKey && (i === list.length - 1 || i < 0)) { e.preventDefault(); list[0].focus(); }
  });

  // D-pad, stick and arrow keys: the menu moves in lines (a row of the top page, the tabs, the page head), so Down from
  // Sound lands on Graphics even though its buttons sit at the far right. In a line that has a chosen one (Fast / High /
  // Max, the tabs) that one gets the focus. Left and right step along a line; a slider keeps them for its value.
  function move(dir) {
    if (root.hidden) return false;
    const page = pages.get(stack[stack.length - 1]);
    const cur = document.activeElement;
    if (cur?.type === 'range' && (dir === 'left' || dir === 'right')) return false;
    const list = [...page.querySelectorAll('button, input, summary, a[href]')].filter(x => !x.disabled && x.offsetParent !== null && !x.closest('[hidden]'));
    if (!list.length) return false;
    if (!list.includes(cur)) { (page.querySelector('[data-autofocus]') || list[0]).focus({ preventScroll: true }); return true; }
    const mid = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; };
    const lines = [];
    for (const el of list) { // group by height on the page
      const m = mid(el);
      let line = lines.find(l => Math.abs(l.y - m.y) < Math.max(18, Math.min(l.h, m.h) * 0.45));
      if (!line) { line = { y: m.y, h: m.h, els: [] }; lines.push(line); }
      line.els.push(el);
    }
    lines.sort((a, b) => a.y - b.y);
    for (const l of lines) l.els.sort((a, b) => mid(a).x - mid(b).x);
    const li = lines.findIndex(l => l.els.includes(cur));
    const line = lines[li];
    let next = null;
    if (dir === 'left' || dir === 'right') {
      const i = line.els.indexOf(cur) + (dir === 'right' ? 1 : -1);
      next = line.els[i] || null;
      if (!next) return true; // the end of a line: stay put
    } else {
      const to = lines[li + (dir === 'down' ? 1 : -1)];
      if (!to) return true;
      const cx = mid(cur).x;
      next = to.els.find(e => e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-selected') === 'true') ||
        to.els.reduce((b, e) => (Math.abs(mid(e).x - cx) < Math.abs(mid(b).x - cx) ? e : b), to.els[0]);
      if (to.els.some(e => e.classList.contains('set-open'))) next = to.els.find(e => e.classList.contains('set-open')); // a row: its main button
    }
    next.focus({ preventScroll: false });
    next.scrollIntoView?.({ block: 'nearest' });
    return true;
  }
  input.menuHook = move;

  function rowOf(id) { return panel.querySelector(`.set-row[data-section="${id}"]`); }
  function setSummary(id, text) { const r = rowOf(id); const sm = r?.querySelector('.set-sum'); if (sm && sm.textContent !== text) sm.textContent = text; }

  function addSection(id, { title, summary = '', icon = 'controls', color = '#8fd0ee' } = {}) {
    let row = rowOf(id), page = pages.get(id);
    if (!row) {
      row = document.createElement('div');
      row.className = 'set-row'; row.dataset.section = id;
      row.style.setProperty('--c', color);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'set-open'; b.dataset.open = id;
      const ic = document.createElement('i'); ic.className = 'set-ic'; ic.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[icon] || ''}</svg>`;
      const txt = document.createElement('span'); txt.className = 'set-txt';
      const bt = document.createElement('b'); const sm = document.createElement('small'); sm.className = 'set-sum';
      txt.append(bt, sm);
      const ch = document.createElement('i'); ch.className = 'set-chev'; ch.setAttribute('aria-hidden', 'true');
      b.append(ic, txt, ch); row.append(b);
      panel.querySelector('.set-rows').append(row);
    }
    if (!page) {
      page = document.createElement('section');
      page.className = 'set-page'; page.dataset.page = id; page.hidden = true;
      const head = document.createElement('header'); head.className = 'set-head';
      const bk = document.createElement('button'); bk.type = 'button'; bk.className = 'set-back'; bk.textContent = 'Back';
      const h = document.createElement('h2');
      head.append(bk, h);
      const body = document.createElement('div'); body.className = 'set-body';
      page.append(head, body);
      panel.append(page);
      pages.set(id, page);
    }
    if (title) { row.querySelector('.set-txt b').textContent = title; page.querySelector('.set-head h2').textContent = title; }
    row.hidden = false;
    setSummary(id, summary);
    return {
      row, page, body: page.querySelector('.set-body'),
      setSummary: text => setSummary(id, text),
      open: () => open(id),
    };
  }

  return {
    open, back, reset, setSummary, addSection,
    get page() { return stack[stack.length - 1]; },
    get depth() { return stack.length - 1; },
    onShow(id, fn) { if (!showFns.has(id)) showFns.set(id, []); showFns.get(id).push(fn); },
    // the menu just opened: start at the top, focus the first row for keyboard and pad players
    opened() { reset(); if (input.lastDevice !== 'touch') setTimeout(() => { if (!root.hidden && input.lastDevice !== 'pad') first(pages.get('top'))?.focus({ preventScroll: true }); }, 0); },
  };
}
