// Andrew's tools menu. When the owner signs in (the server answers owner: true for his own
// account only, lib/accounts.js OWNER_KEYS), the loading screen's photos come back with a short menu on them instead of going
// straight into the game: Play, the NPC, World and HUD Editors, then a row of tiles: Music & SFX, the voice booth, Exit (owner-tiles). Each tool has a small "Back to Breneland" link
// (public/js/tools-back.js) to /?tools, which brings this menu straight back over the loading screen while the yard loads behind
// it: the device's remembered session, within TOOLS_WINDOW of the last tool opened from here (otherwise the PIN is asked as
// usual, and the menu follows it). Everyone else never sees any of this.
// Two script tags load it, one module: its own <script type="module"> in index.html, ahead of main.js, so the /?tools check
// starts before the game's modules have been fetched, and main.js's import, which drives it:
//   toolsMenu.early                 a promise: the owner's resume answer on /?tools (the menu is already up), or null
//   toolsMenu.beforeLoadingHides(name)  the loading card is about to hide: the menu keeps a copy of its photos (shows it if needed)
//   toolsMenu.open(name)            after a PIN sign in, the loading card long gone: the menu on a fresh collage
//   toolsMenu.wait()                resolves when Play is pressed (at once if it already was)
//   toolsMenu.played                Play was pressed (the menu shows once per page)
//   toolsMenu.dismiss()             the early menu goes away again (the session did not resume after all)

const TOOLS_WINDOW = 3 * 3600e3;   // like the welcome back from a game (main.js `returning`)
const $ = s => document.querySelector(s);
const read = k => { try { return JSON.parse(localStorage.getItem('breneland.' + k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem('breneland.' + k, JSON.stringify(v)); } catch { /* private mode */ } };
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// the editors (the Dog Editor and the NPC Editor are one and the same: /editor/dogs.html only forwards to npcs.html)
const EDITORS = [
  { id: 'npcs', href: '/editor/npcs.html', title: 'NPC Editor', sub: 'The folks, the dogs and the unicorns', c: '#f58ab0', icon: 'npc' },
  { id: 'world', href: '/editor/world.html', title: 'World Editor', sub: 'Move things and add new ones', c: '#7dd36a', icon: 'world' },
  { id: 'hud', href: '/editor/hud.html', title: 'HUD Editor', sub: 'Where the buttons sit', c: '#8fd0ee', icon: 'hud' },
  { id: 'pose', href: '/editor/pose.html', title: 'Pose Editor', sub: 'Pose people for storyboards', c: '#c8b1f5', icon: 'pose' },   // (pose-editor: owner only, as the whole menu)
];
// the tiles under them (owner-tiles, Andrew 2026-11-06: "tiles for Music and SFX ... the voice booth and then just an Exit tile").
// The dog voices are a section of the music page now; the ghoul studio (/ghoul-studio.html) and the phone check (/diag.html) left
// the menu but still open by their address. tools/tools-menu-test.mjs opens each tile.
const TILES = [
  { id: 'music', href: '/music.html', title: 'Music & SFX', sub: 'Songs, sounds, the dogs', c: '#ffcf6b', icon: 'music' },
  { id: 'voice-booth', href: '/voice-booth.html', title: 'Voice booth', sub: 'Record your voice', c: '#c8b3e6', icon: 'mic' },   // (lib/voice-booth.js)
  { id: 'exit', title: 'Exit', sub: 'Sign out here', c: '#ff8a7a', icon: 'exit' },   // (a button: forgets the session on this device)
];
// little ink drawings for the editors (fixed markup, nothing anyone typed)
const ICONS = {
  npc: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="6" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><path d="M5.5 28c1-6 5.2-9 10.5-9s9.5 3 10.5 9" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4" stroke-linejoin="round"/><path d="M10.5 7.5l-3-3.5M21.5 7.5l3-3.5" stroke="#2b2340" stroke-width="2.4" stroke-linecap="round"/></svg>',
  world: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4c5 0 9 3.6 9 8.4 0 4.5-3.8 7.6-9 7.6s-9-3.1-9-7.6C7 7.6 11 4 16 4z" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><path d="M16 20v8M10 28h12" stroke="#2b2340" stroke-width="2.4" stroke-linecap="round"/></svg>',
  hud: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="7" width="22" height="18" rx="4" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><circle cx="11" cy="19" r="2.4" fill="#2b2340"/><circle cx="21.5" cy="18" r="3" fill="none" stroke="#2b2340" stroke-width="2.2"/><path d="M9 12h6" stroke="#2b2340" stroke-width="2.2" stroke-linecap="round"/></svg>',
  pose: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="7" r="3.6" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><path d="M16 11v8.5M8 12.5l8 2.5 7.5-6M16 19.5l-5.5 8.5M16 19.5l6.5 7.5" fill="none" stroke="#2b2340" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24.5" cy="8" r="1.6" fill="#2b2340"/></svg>',
  music: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12 23V8.5l13-3V20" fill="none" stroke="#2b2340" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="8.6" cy="23.5" rx="4" ry="3.2" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><ellipse cx="21.6" cy="20.5" rx="4" ry="3.2" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><path d="M12 13l13-3" stroke="#2b2340" stroke-width="2.4"/></svg>',
  mic: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="11.5" y="4" width="9" height="15" rx="4.5" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><path d="M7.5 15a8.5 8.5 0 0 0 17 0M16 23.5V28M11 28h10" fill="none" stroke="#2b2340" stroke-width="2.4" stroke-linecap="round"/></svg>',
  exit: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M17 5H8.5v22H17" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 16h13M22 11l5 5-5 5" fill="none" stroke="#2b2340" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><path d="M16 9.5V16l4.5 3" fill="none" stroke="#2b2340" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  five: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="#fff3d6" stroke="#2b2340" stroke-width="2.4"/><path d="M16 9.5V16l-3.6 5.6" fill="none" stroke="#2b2340" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 27.5h22" stroke="#e8703a" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

// /?tools: take the word out of the address (a reload goes on as usual) and remember we came back from a tool
const q = new URLSearchParams(location.search);
const back = q.has('tools');
if (back) { q.delete('tools'); const s = q.toString(); history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); }

let state = 'none';   // none | early (over the loading card) | open | played
let wrap = null, hiEl = null;
let resolvePlay;
const playedP = new Promise(r => { resolvePlay = r; });

const token = () => { const a = read('account'); return a && typeof a.token === 'string' ? a.token : ''; };

function build() {
  if (wrap) return;
  wrap = document.createElement('div');
  wrap.id = 'tools-menu';
  wrap.className = 'tm';
  wrap.hidden = true;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Where to?');
  const card = document.createElement('div');
  card.className = 'tm-card';
  const logo = document.createElement('div');
  logo.className = 'logo big tm-logo'; logo.textContent = 'Breneland';
  hiEl = document.createElement('p');
  hiEl.className = 'tm-hi';
  const play = document.createElement('button');
  play.type = 'button'; play.className = 'btn primary huge tm-play'; play.textContent = 'Play';
  play.addEventListener('click', onPlay);
  const eds = document.createElement('div');
  eds.className = 'tm-eds';
  for (const t of EDITORS) {
    const a = document.createElement('a');
    a.className = 'tm-ed'; a.href = t.href; a.dataset.tool = t.id;
    a.style.setProperty('--c', t.c);
    const ic = document.createElement('i');
    ic.className = 'tm-ic'; ic.innerHTML = ICONS[t.icon];
    const txt = document.createElement('span');
    txt.className = 'tm-txt';
    const b = document.createElement('b'); b.textContent = t.title;
    const sm = document.createElement('small'); sm.textContent = t.sub;
    txt.append(b, sm);
    a.append(ic, txt);
    a.addEventListener('click', opened);
    eds.append(a);
  }
  const pc = document.createElement('p');
  pc.className = 'tm-pc'; pc.textContent = 'The editors are best on a computer.';
  pc.hidden = !coarse();
  const tiles = document.createElement('div');
  tiles.className = 'tm-tiles';
  for (const t of TILES) {
    const a = document.createElement(t.href ? 'a' : 'button');
    a.className = 'tm-tile'; a.dataset.tool = t.id;
    if (t.href) { a.href = t.href; a.addEventListener('click', opened); } else { a.type = 'button'; a.addEventListener('click', exit); }
    a.style.setProperty('--c', t.c);
    const ic = document.createElement('i');
    ic.className = 'tm-ic'; ic.innerHTML = ICONS[t.icon];
    const txt = document.createElement('span');
    txt.className = 'tm-txt';
    const b = document.createElement('b'); b.textContent = t.title;
    const sm = document.createElement('small'); sm.textContent = t.sub;
    txt.append(b, sm);
    a.append(ic, txt);
    tiles.append(a);
  }
  card.append(logo, hiEl, play, eds, pc, tiles, clockRow());
  wrap.append(card);
  document.body.append(wrap);
}

// Breneland's clock (clock-lag): how far behind real time it runs, and two buttons, real time (the lag goes, for everyone) and
// 5 pm now (a testing lag again). The server checks the owner's session token; nobody else can move it.
let clockTxt = null;
function clockRow() {
  const row = document.createElement('div');
  row.className = 'tm-clock';
  clockTxt = document.createElement('p');
  clockTxt.className = 'tm-clock-txt'; clockTxt.setAttribute('aria-live', 'polite');
  const btn = (op, icon, label, c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tm-clock-btn'; b.dataset.clock = op; b.title = label; b.setAttribute('aria-label', label);
    b.style.setProperty('--c', c);
    const ic = document.createElement('i'); ic.className = 'tm-ic'; ic.innerHTML = ICONS[icon];
    b.append(ic);
    b.addEventListener('click', () => setClock(op));
    return b;
  };
  row.append(clockTxt, btn('real', 'clock', 'Real time', '#9be08a'), btn('five', 'five', '5 pm now', '#ffb36b'));
  return row;
}
const lagWords = ms => {
  const m = Math.round(Math.abs(ms) / 60000);
  if (!m) return 'Breneland is on real time';
  const h = Math.floor(m / 60), mm = m % 60, t = (h ? h + ' h' : '') + (h && mm ? ' ' : '') + (mm ? mm + ' min' : '');
  return `Breneland is ${t} ${ms > 0 ? 'behind' : 'ahead'}`;
};
function showLag(j) { if (clockTxt && j && Number.isFinite(j.lagMs)) { clockTxt.textContent = lagWords(j.lagMs); wrap.dataset.lag = String(j.lagMs); } }
async function readClock() {
  try { const r = await fetch('/api/clock-lag', { cache: 'no-store' }); if (r.ok) showLag(await r.json()); } catch { /* offline */ }
}
async function setClock(op) {
  try {
    const r = await fetch('/api/clock-lag', { method: 'POST', headers: { 'content-type': 'application/json', 'x-breneland-token': token() }, body: JSON.stringify({ op }), cache: 'no-store' });
    if (r.ok) showLag(await r.json()); else if (clockTxt) clockTxt.textContent = 'The clock did not move (sign in again?)';
  } catch { if (clockTxt) clockTxt.textContent = 'Offline: the clock did not move'; }
}

// a tool opened from here: its Back link may bring the menu back without the PIN for a while
function opened() { write('toolsAt', Date.now()); }

// Exit: the session goes (the server forgets the token, this device forgets the account) and the start screen asks for a name
// again. No confirm: signing back in is a name and a PIN.
let exiting = false;
async function exit() {
  if (exiting) return;
  exiting = true;
  const t = token();
  try { localStorage.removeItem('breneland.account'); localStorage.removeItem('breneland.toolsAt'); } catch { /* private mode */ }
  if (t) {
    try { await Promise.race([fetch('/api/account/logout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-breneland-token': t }, body: '{}', keepalive: true }), new Promise(r => setTimeout(r, 1500))]); }
    catch { /* offline: the token runs out by itself */ }
  }
  location.replace('/');
}

// how: 'over' = see-through, over the loading card and its photos; 'copy' = a copy of the loading card's photos (it is about to
// hide); 'fresh' = a new collage (public/js/loading-collage.js mount)
function show(name, how) {
  build();
  hiEl.textContent = name ? `Hi, ${name}! Where to?` : 'Where to?';
  wrap.classList.toggle('tm-over', how === 'over');
  wrap.hidden = false;
  readClock();
  if (how === 'copy') copyPhotos();
  else if (how === 'fresh') { try { window.brenelandCollage?.mount(wrap); } catch { /* the plain card stays */ } }
  state = how === 'over' ? 'early' : 'open';
  if (!coarse()) setTimeout(() => { if (state !== 'played') wrap.querySelector('.tm-play').focus({ preventScroll: true }); }, 30);   // (Enter plays; no ring on a phone)
}
function copyPhotos() {
  wrap.classList.remove('tm-over');
  const src = $('#loading #collage');
  if (!src || wrap.querySelector('#collage')) return;
  wrap.insertBefore(src.cloneNode(true), wrap.firstChild);   // the same pictures, already loaded: nothing moves as the loading card hides
}

function onPlay() {
  if (state === 'played') return;
  state = 'played';
  wrap.hidden = true;                                       // (a mounted collage clears itself away when its card hides)
  wrap.querySelector('#collage')?.remove();
  addSettingsButton();
  resolvePlay();
}

// Settings > You gets a way back to this menu (the owner only: the menu showed)
function addSettingsButton() {
  const row = $('#help .you-actions');
  if (!row || row.querySelector('#btn-tools')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'btn-tools'; b.className = 'btn'; b.textContent = 'Tools menu';
  b.addEventListener('click', () => { opened(); location.href = '/?tools'; });
  const home = row.querySelector('#btn-home');
  if (home) row.insertBefore(b, home); else row.append(b);
}

// /?tools: is this device holding the owner's session, and was a tool opened from the menu lately? Then the menu now.
const early = (async () => {
  if (!back || !token()) return null;
  if (Date.now() - (Number(read('toolsAt')) || 0) > TOOLS_WINDOW) return null;
  try {
    const r = await fetch('/api/account/resume', { method: 'POST', headers: { 'content-type': 'application/json', 'x-breneland-token': token() }, body: '{}', cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (!j || j.owner !== true) return null;
    const card = $('#loading');
    if (state === 'none' && card && !card.hidden) show(j.name, 'over');
    return j;
  } catch { return null; }
})();

export const toolsMenu = {
  early,
  get played() { return state === 'played'; },
  get state() { return state; },
  beforeLoadingHides(name) {
    if (state === 'played') return;
    if (state === 'none') show(name, 'copy'); else copyPhotos();
    state = 'open';
  },
  open(name) {
    if (state === 'none') show(name, 'fresh');
    return playedP;
  },
  wait: () => playedP,
  // the menu went up early but the session did not come back after all: the start screen (and its PIN) instead
  dismiss() {
    if (state !== 'early') return;
    state = 'none';
    wrap.hidden = true;
  },
};
window.__toolsMenu = toolsMenu;   // (tests)
