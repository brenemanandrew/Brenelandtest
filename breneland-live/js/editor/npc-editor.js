// The NPC Editor (public/editor/npcs.html): pick anyone in Breneland, shape them with sliders, pickers and colours (over a
// photo if you like) and save to the server (lib/npc-look.js) so the game draws them. Each character is built by the game's
// own code, lit and inked like the lobby, so what you make is what everyone sees.
// The kinds (kind-dog.js, kind-human.js, kind-unicorn.js) say which rows to show and how to build one. This file is the rest.
import * as THREE from 'three';
import { InkPass, toon } from '/js/toon.js';
import { createRigidMerge } from '/js/rigid-merge.js';
import { NPCS, NPC_GROUPS } from '/js/npc-looks.js';
import { dogKind, voicePreview } from './kind-dog.js';
import { humanKind } from './kind-human.js';
import { unicornKind } from './kind-unicorn.js';

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const deep = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const KINDS = { dog: dogKind, human: humanKind, unicorn: unicornKind };
const IDS = NPC_GROUPS.flatMap(([g]) => Object.keys(NPCS).filter(id => NPCS[id].group === g));
const GROUP_NAME = Object.fromEntries(NPC_GROUPS);
const kindOf = id => KINDS[NPCS[id].kind];
const VIEWS = { side: { yaw: Math.PI / 2, pitch: 0.12 }, front: { yaw: 0, pitch: 0.12 }, three: { yaw: 0.75, pitch: 0.2 }, top: { yaw: Math.PI / 2, pitch: 1.5 }, back: { yaw: Math.PI, pitch: 0.12 } };
const fmtNum = v => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const HEX6 = /^#[0-9a-f]{6}$/i;

// ------------------------------------------------------------------ state
const state = {
  id: 'dax', looks: {}, base: {}, savedLooks: {}, saved: {}, ranges: {}, admin: false, name: '', hist: {},
  pose: 'stand', poseT: 0, paused: false, turning: false, compare: false, dirty: false, lastBuild: 0,
  cam: { yaw: 0.75, pitch: 0.2, zoom: 1 },
  photo: { file: '', x: 0, y: 0, s: 1, rot: 0, flip: false, front: false, op: 0.5, move: false },
};
const K = () => kindOf(state.id);
const look = () => state.looks[state.id];
const nameOf = id => NPCS[id].name;
const tokenNow = () => { try { const a = JSON.parse(localStorage.getItem('breneland.account') || 'null'); return a && a.token ? a.token : ''; } catch { return ''; } };
const accountName = () => { try { const a = JSON.parse(localStorage.getItem('breneland.account') || 'null'); return a && a.name ? a.name : ''; } catch { return ''; } };
const authHeaders = () => (tokenNow() ? { 'x-breneland-token': tokenNow() } : {});
const histOf = id => (state.hist[id] ||= { undo: [], redo: [] });
// the game's look for id (built-in + what is saved) and the one being edited (made the first time it is opened)
function ensure(id) {
  if (!state.base[id]) state.base[id] = kindOf(id).merged(id, state.savedLooks[id] || null);
  if (!state.looks[id]) state.looks[id] = deep(state.base[id]);
}

let toastTimer = 0;
function toast(text, bad = false, ms = 2600) {
  const t = $('#toast');
  t.textContent = text; t.classList.toggle('bad', bad); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function status(text, bad = false) { const s = $('#status'); s.textContent = text; s.classList.toggle('bad', bad); }

// ------------------------------------------------------------------ the scene: the game's light and ink around one character
const canvas = $('#view'), stage = $('.stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor('#cfe6f5');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe6f5');
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);
scene.add(new THREE.HemisphereLight('#cfe8ff', '#8ba3a6', 1.15));
const sun = new THREE.DirectionalLight('#fff0d6', 2.6);
sun.position.set(4.2, 5.2, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 1, far: 20 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48), toon('#8fcf68'));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
scene.add(floor);
// a plain bench for the poses done sitting (its top at the seat height the pose asks for)
const bench = new THREE.Group();
{
  const wood = toon('#b98a5a'), legs = toon('#7a5438');
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.42), wood); top.position.y = -0.03; bench.add(top);
  for (const x of [-0.56, 0.56]) for (const z of [-0.15, 0.15]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), legs); l.position.set(x, -0.5, z); l.userData.leg = true; bench.add(l); }
  bench.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  bench.position.z = -0.06; bench.visible = false;
  scene.add(bench);
}
const ink = new InkPass(renderer, { quality: 'high' });
let ch = null, baseCh = null;   // the character being edited, and the game's version of it ("Hold: game now")
// drawn as the game draws a settled character: merged into one skinned mesh, inked as one solid (rigid-merge.js)
const rigid = createRigidMerge({ scene, roots: () => [ch?.root, baseCh?.root].filter(Boolean) });

function resize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  ink.setSize(w, h);
  fitPhoto();
}
window.addEventListener('resize', resize);

function placeCamera() {
  const c = state.cam, F = K().frame(look(), ch);
  const dist = F.dist * c.zoom * Math.max(1, (F.tall ? 0.75 : 1.3) / camera.aspect);   // (a tall phone screen: further back, so the whole body fits)
  camera.position.set(Math.sin(c.yaw) * Math.cos(c.pitch) * dist, F.y + Math.sin(c.pitch) * dist, Math.cos(c.yaw) * Math.cos(c.pitch) * dist);
  camera.lookAt(0, F.y, 0);
}

// build (or rebuild) the character from a look; the dogs carry their motion on so a slider drag does not reset the pose
function build(which = 'live') {
  const id = state.id, kind = K();
  const lk = which === 'live' ? look() : state.base[id];
  const old = which === 'live' ? ch : baseCh;
  const nc = kind.build(id, lk, old && old._kind === kind.kind ? old : null);
  nc._kind = kind.kind;
  if (old) { scene.remove(old.root); KINDS[old._kind].dispose(old); }
  scene.add(nc.root);
  nc.root.visible = which === 'live' ? !state.compare : state.compare;
  if (which === 'live') ch = nc; else baseCh = nc;
  return nc;
}
function rebuild(now = false) {   // the frame loop rebuilds at most every 90 ms while a slider is dragged, at once when it settles
  state.dirty = true;
  if (now) state.lastBuild = 0;
}

// the frame loop: the pose runs on the game's own update(); the one-shot moves loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000) || 1 / 60;
  last = now;
  if (state.dirty && now - state.lastBuild > 90) { state.dirty = false; state.lastBuild = now; build('live'); }
  if (!ch) return;
  const kind = K(), P = currentPose();
  if (!state.paused) state.poseT += dt;
  if (state.turning && !state.paused) state.cam.yaw += dt * 0.55;
  const at = P[4] ? state.poseT % P[4] : null;
  const step = state.paused ? 1e-6 : dt;
  bench.visible = !!P[5];
  if (P[5]) { bench.position.y = P[5]; for (const l of bench.children) if (l.userData.leg) { l.scale.y = P[5]; l.position.y = -P[5] / 2 - 0.03; } }
  for (const c of [ch, baseCh]) if (c && c._kind === kind.kind) kind.update(c, step, state.poseT, P, at);
  placeCamera();
  rigid.update();
  ink.render(scene, camera);
}

// ------------------------------------------------------------------ the tools panel
const rowEls = new Map();   // key -> { input, val, row, kind, k, extra }
const openGroups = {};      // kind -> the groups left open
function buildPanel() {
  const root = $('#groups'), kind = K();
  root.textContent = '';
  rowEls.clear();
  const open = openGroups[kind.kind] ||= new Set([kind.groups(state.id)[0].id]);
  for (const g of kind.groups(state.id)) {
    const det = el('details', 'grp');
    det.open = open.has(g.id);
    det.addEventListener('toggle', () => { if (det.open) open.add(g.id); else open.delete(g.id); });
    const sum = el('summary');
    const dot = el('span', 'dot'); dot.style.setProperty('--c', g.color);
    sum.append(dot, el('span', null, g.name));
    const reset = el('button', 'reset', 'Reset');
    reset.type = 'button'; reset.title = 'Back to what the game shows now';
    reset.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); resetGroup(g); });
    sum.append(reset);
    det.append(sum);
    const body = el('div', 'grp-body');
    for (const r of g.rows) body.append(makeRow(r));
    if (g.footer) body.append(g.footer({ id: () => state.id, look: () => look() }));   // (the dogs' voice buttons)
    det.append(body);
    root.append(det);
  }
  refreshRows();
}
function rangeOf(k) {
  const r = (state.ranges[K().kind] || {})[k];
  return Array.isArray(r) ? r : [-3, 3];
}
function makeRow([k, label, type = 'num', extra]) {
  const row = el('div', 'row ' + (type === 'num' ? '' : type));
  const lab = el('label', null, label);
  const id = 'r-' + k.replace('.', '-');
  lab.htmlFor = id;
  row.append(lab);
  const rec = { row, kind: type, k, extra };
  const set1 = (v, settle) => { beginChange(); change(k, v, settle); if (settle) endChange(); };
  if (type === 'num') {
    const val = el('span', 'val');
    const [lo, hi] = rangeOf(k);
    const inp = el('input'); inp.type = 'range'; inp.id = id; inp.min = lo; inp.max = hi; inp.step = K().step ? K().step(lo, hi) : (hi - lo) > 50 ? 1 : (hi - lo) / 400;
    inp.addEventListener('input', () => { beginChange(); change(k, Number(inp.value), false); val.textContent = fmtNum(Number(inp.value)); });
    inp.addEventListener('change', () => { change(k, Number(inp.value), true); endChange(); });
    row.append(val, inp);
    rec.input = inp; rec.val = val;
  } else if (type === 'color') {
    const inp = el('input'); inp.type = 'color'; inp.id = id;
    inp.addEventListener('input', () => { beginChange(); change(k, inp.value, false); if (rec.none) rec.none.setAttribute('aria-pressed', 'false'); });
    inp.addEventListener('change', () => { change(k, inp.value, true); endChange(); });
    row.append(inp);
    rec.input = inp;
    if (extra === 'opt' || (extra && extra.auto)) {
      // dogs: "None" leaves the marking off; people and unicorns: "Auto" lets the game pick (from the hair, the top...)
      const none = el('button', 'none', extra === 'opt' ? 'None' : 'Auto'); none.type = 'button'; none.setAttribute('aria-pressed', 'false');
      if (extra.auto) none.title = extra.auto;
      none.addEventListener('click', () => {
        const off = none.getAttribute('aria-pressed') !== 'true';
        if (extra === 'opt') set1(off ? undefined : inp.value, true);
        else set1(off ? K().autoValue(k) : K().effective(state.id, look(), k), true);
      });
      row.append(none); rec.none = none;
    }
    if (extra && extra.presets) {
      const sw = el('div', 'presets');
      for (const c of extra.presets) {
        const b = el('button', 'preset'); b.type = 'button'; b.style.setProperty('--c', c); b.title = c; b.setAttribute('aria-label', label + ' ' + c);
        b.addEventListener('click', () => set1(c, true));
        sw.append(b);
      }
      row.append(sw);
    }
  } else if (type === 'bool') {
    const sw = el('button', 'sw'); sw.type = 'button'; sw.id = id; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', 'false');
    sw.setAttribute('aria-label', label);
    sw.addEventListener('click', () => set1(sw.getAttribute('aria-checked') !== 'true', true));
    row.append(sw); rec.input = sw;
  } else if (type === 'choice') {
    const box = el('div', 'choices');
    box.setAttribute('role', 'group'); box.setAttribute('aria-label', label);
    rec.chips = extra.map(([v, words]) => {
      const c = el('button', 'chip', words); c.type = 'button'; c.setAttribute('aria-pressed', 'false');
      c.addEventListener('click', () => set1(v, true));
      box.append(c);
      return { v, c };
    });
    row.append(box);
  } else if (type === 'text') {
    const inp = el('input', 'txt'); inp.type = 'text'; inp.id = id; inp.maxLength = (extra && extra.max) || 24; inp.autocomplete = 'off'; inp.spellcheck = false;
    const val = v => (v.trim() && v.trim() !== nameOf(state.id) ? v : undefined);
    inp.addEventListener('input', () => { beginChange(); change(k, val(inp.value), false); });
    inp.addEventListener('change', () => { change(k, val(inp.value), true); endChange(); });
    row.append(inp); rec.input = inp;
  } else if (type === 'colors') {
    const box = el('div', 'colors');
    row.append(box); rec.box = box;
    if (extra && extra.auto) {
      const auto = el('button', 'none', 'Same'); auto.type = 'button'; auto.title = extra.auto; auto.setAttribute('aria-pressed', 'false');
      auto.addEventListener('click', () => { const on = auto.getAttribute('aria-pressed') !== 'true'; set1(on ? undefined : K().effective(state.id, look(), k).slice(), true); });
      row.insertBefore(auto, box); rec.none = auto;
    }
  }
  rowEls.set(k, rec);
  return row;
}
// a list of colours (a unicorn's mane): one swatch per lock colour, with a button to drop the last or add one
function fillColors(rec, list, isAuto) {
  const box = rec.box, k = rec.k, ex = rec.extra || {};
  box.textContent = '';
  list.forEach((c, i) => {
    const inp = el('input'); inp.type = 'color'; inp.value = c; inp.setAttribute('aria-label', 'Colour ' + (i + 1)); inp.disabled = isAuto;
    const put = settle => { const next = K().effective(state.id, look(), k).slice(); next[i] = inp.value; beginChange(); change(k, next, settle); if (settle) endChange(); };
    inp.addEventListener('input', () => put(false));
    inp.addEventListener('change', () => put(true));
    box.append(inp);
  });
  if (isAuto) return;
  const minus = el('button', 'none', '-'); minus.type = 'button'; minus.title = 'One colour fewer'; minus.disabled = list.length <= (ex.min || 1);
  minus.addEventListener('click', () => { beginChange(); change(k, list.slice(0, -1), true); endChange(); });
  const plus = el('button', 'none', '+'); plus.type = 'button'; plus.title = 'One colour more'; plus.disabled = list.length >= (ex.max || 6);
  plus.addEventListener('click', () => { beginChange(); change(k, list.concat([list[list.length - 1] || '#ffffff']), true); endChange(); });
  box.append(minus, plus);
}
// show every row's value for the current character (and mark the ones that differ from the game's)
function refreshRows() {
  const id = state.id, kind = K(), lk = look(), base = state.base[id];
  for (const [k, rec] of rowEls) {
    const v = kind.effective(id, lk, k), bv = kind.effective(id, base, k);
    rec.row.classList.toggle('changed', !same(v, bv));
    rec.row.hidden = !!(rec.extra && rec.extra.when && !rec.extra.when(lk));
    if (rec.kind === 'num') { const n = Number(v) || 0; rec.input.value = n; rec.val.textContent = fmtNum(n); }
    else if (rec.kind === 'color') {
      const on = typeof v === 'string' && HEX6.test(v);
      if (on) rec.input.value = v.toLowerCase();
      if (rec.extra === 'opt') { rec.none.setAttribute('aria-pressed', on ? 'false' : 'true'); rec.input.disabled = !on; }
      else if (rec.none) rec.none.setAttribute('aria-pressed', kind.isAuto(lk, k) ? 'true' : 'false');
    } else if (rec.kind === 'bool') rec.input.setAttribute('aria-checked', v ? 'true' : 'false');
    else if (rec.kind === 'choice') for (const c of rec.chips) c.c.setAttribute('aria-pressed', c.v === v ? 'true' : 'false');
    else if (rec.kind === 'text') { if (document.activeElement !== rec.input) rec.input.value = v || ''; }
    else if (rec.kind === 'colors') {
      const auto = !!(rec.none && kind.isAuto(lk, k));
      if (rec.none) rec.none.setAttribute('aria-pressed', auto ? 'true' : 'false');
      fillColors(rec, Array.isArray(v) ? v : [], auto);
    }
  }
}

// ---- changes, undo and redo
let dragSnap = null;
const snap = () => JSON.stringify(look());
function beginChange() { if (!dragSnap) dragSnap = snap(); }
function endChange() {
  if (dragSnap && dragSnap !== snap()) { const h = histOf(state.id); h.undo.push(dragSnap); if (h.undo.length > 200) h.undo.shift(); h.redo.length = 0; }
  dragSnap = null; refreshButtons();
}
function change(k, v, settle) {
  K().set(look(), k, v);
  rebuild(settle);
  if (settle) refreshRows();
  else { const rec = rowEls.get(k); if (rec) rec.row.classList.toggle('changed', !same(K().effective(state.id, look(), k), K().effective(state.id, state.base[state.id], k))); }
}
function replaceLook(next, words) {
  const h = histOf(state.id);
  h.undo.push(snap()); h.redo.length = 0;
  state.looks[state.id] = next;
  rebuild(true); refreshRows(); refreshButtons();
  if (words) toast(words);
}
function undo() { const h = histOf(state.id); if (!h.undo.length) return; h.redo.push(snap()); state.looks[state.id] = JSON.parse(h.undo.pop()); rebuild(true); refreshRows(); refreshButtons(); }
function redo() { const h = histOf(state.id); if (!h.redo.length) return; h.undo.push(snap()); state.looks[state.id] = JSON.parse(h.redo.pop()); rebuild(true); refreshRows(); refreshButtons(); }
function resetGroup(g) {
  const kind = K(), base = state.base[state.id], next = deep(look());
  for (const r of g.rows) kind.set(next, r[0], deep(kind.get(base, r[0])));
  replaceLook(next, g.name + ': back to the game’s ' + nameOf(state.id));
}
function refreshButtons() {
  const h = histOf(state.id);
  $('#undo-btn').disabled = !h.undo.length; $('#redo-btn').disabled = !h.redo.length;
}

// ---- who: the picker
const pickColor = id => {
  const n = NPCS[id], lk = state.base[id] || n.look || {};
  return n.kind === 'dog' ? (id === 'dax' ? '#7a6248' : id === 'molly' ? '#5a4232' : '#c98a4a') : n.kind === 'unicorn' ? lk.color : lk.outfit === 'coat' && lk.coat ? lk.coat : lk.shirt;
};
function buildPicker() {
  const box = $('#picker');
  box.textContent = '';
  for (const [g, words] of NPC_GROUPS) {
    const sec = el('section', 'pick-sec');
    sec.append(el('h3', null, words));
    const row = el('div', 'pick-row');
    for (const id of IDS.filter(i => NPCS[i].group === g)) {
      const b = el('button', 'pick-chip'); b.type = 'button'; b.dataset.npc = id;
      const d = el('span', 'pick-dot'); d.style.setProperty('--c', pickColor(id) || '#ffffff');
      b.append(d, el('span', null, nameOf(id).replace(/\s*\(.*$/, '')));
      if (state.saved[id]) b.append(el('span', 'pick-saved', 'saved'));
      b.title = NPCS[id].where || '';
      b.addEventListener('click', () => { showPicker(false); select(id); });
      row.append(b);
    }
    sec.append(row);
    box.append(sec);
  }
  markPicker();
}
function markPicker() {
  for (const b of document.querySelectorAll('.pick-chip')) b.setAttribute('aria-current', b.dataset.npc === state.id ? 'true' : 'false');
  const n = NPCS[state.id];
  $('#pick-name').textContent = n.name.replace(/\s*\(.*$/, '');
  $('#pick-group').textContent = GROUP_NAME[n.group];
  $('#pick-dot').style.setProperty('--c', pickColor(state.id) || '#ffffff');
}
function showPicker(on) {
  const box = $('#picker'), btn = $('#pick-btn');
  box.hidden = !on; btn.setAttribute('aria-expanded', String(on));
  if (on) { buildPicker(); (box.querySelector('[aria-current="true"]') || box.querySelector('button'))?.focus(); }
}
function step(d) { const i = IDS.indexOf(state.id); select(IDS[(i + d + IDS.length) % IDS.length]); }

// ---- which character
function select(id) {
  if (!NPCS[id]) return;
  const prevKind = state.id && NPCS[state.id] ? NPCS[state.id].kind : null;
  state.id = id;
  ensure(id);
  if (prevKind !== NPCS[id].kind || !rowEls.size) buildPanel();
  // the pose bar and the photos belong to the character
  const poses = K().poses(id);
  if (!poses.some(p => p[0] === state.pose)) { state.pose = K().defaultPose; state.poseT = 0; }
  buildPoseBar();
  buildPhotoList();
  if (ch && ch._kind !== K().kind) { scene.remove(ch.root); KINDS[ch._kind].dispose(ch); ch = null; }
  if (baseCh && baseCh._kind !== K().kind) { scene.remove(baseCh.root); KINDS[baseCh._kind].dispose(baseCh); baseCh = null; }
  build('base'); build('live');
  state.dirty = false;
  refreshRows(); refreshButtons(); refreshStatus(); markPicker();
  try { history.replaceState(null, '', '?npc=' + id); } catch { /* file: */ }
}
function refreshStatus() {
  const s = state.saved[state.id], name = nameOf(state.id), where = NPCS[state.id].where;
  const who = where ? `${name} (${where})` : name;
  if (s) status(`Editing ${who}. The game shows what ${s.by || 'someone'} saved ${ago(s.at)}.`);
  else status(`Editing ${who}. The game shows the built-in look (nothing saved yet).`);
}
function ago(t) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 60 * 36 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago';
}

// ---- poses and views
const currentPose = () => { const list = K().poses(state.id); return list.find(p => p[0] === state.pose) || list[0]; };
function buildPoseBar() {
  const bar = $('#pose-bar');
  bar.textContent = '';
  for (const p of K().poses(state.id)) {
    const c = el('button', 'chip', p[1]); c.type = 'button'; c.dataset.pose = p[0]; c.setAttribute('aria-pressed', p[0] === state.pose ? 'true' : 'false');
    c.addEventListener('click', () => setPose(p[0]));
    bar.append(c);
  }
}
function setPose(id) {
  if (!K().poses(state.id).some(p => p[0] === id)) return;
  state.pose = id; state.poseT = 0;
  for (const c of document.querySelectorAll('#pose-bar .chip')) c.setAttribute('aria-pressed', c.dataset.pose === id ? 'true' : 'false');
}
function setView(name) {
  const v = VIEWS[name]; if (!v) return;
  state.cam.yaw = v.yaw; state.cam.pitch = v.pitch;
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === name);
}

// ---- the photo overlay: Andrew's photos for whoever has them, or any photo off this device
const photoEl = $('#photo');
let photos = [];
function buildPhotoList() {
  photos = [['', 'No photo'], ...K().photos(state.id), ['@file', 'A photo of your own...']];
  const sel = $('#photo-select');
  sel.textContent = '';
  for (const p of photos) { const o = el('option', null, p[1]); o.value = p[0]; sel.append(o); }
  if (state.photo.file && !state.photo.file.startsWith('blob:') && !photos.some(p => p[0] === state.photo.file)) setPhoto('');
  sel.value = state.photo.file.startsWith('blob:') ? '@file' : state.photo.file;
}
function fitPhoto() {
  if (!photoEl.naturalWidth) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  const fit = Math.min(w / photoEl.naturalWidth, h / photoEl.naturalHeight);
  photoEl.style.width = Math.round(photoEl.naturalWidth * fit) + 'px';
  photoEl.style.height = Math.round(photoEl.naturalHeight * fit) + 'px';
  placePhoto();
}
function placePhoto() {
  const p = state.photo;
  photoEl.style.opacity = p.op;
  photoEl.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg) scale(${p.s * (p.flip ? -1 : 1)}, ${p.s})`;
  stage.classList.toggle('photo-front', p.front);
  stage.classList.toggle('moving', p.move && !!p.file);
}
function setPhoto(file) {
  if (file === '@file') { $('#photo-file').click(); $('#photo-select').value = state.photo.file.startsWith('blob:') ? '@file' : state.photo.file; return; }
  const p = state.photo, entry = photos.find(x => x[0] === file);
  if (p.file.startsWith('blob:') && p.file !== file) URL.revokeObjectURL(p.file);
  p.file = file; p.x = 0; p.y = 0; p.s = 1; p.rot = 0;
  $('#photo-select').value = file.startsWith('blob:') ? '@file' : file;
  if (!file) { photoEl.hidden = true; photoEl.removeAttribute('src'); placePhoto(); return; }
  photoEl.hidden = false;
  photoEl.onload = fitPhoto;
  photoEl.src = file.startsWith('blob:') ? file : '/editor/refs/' + file;
  if (entry && entry[2]) setView(entry[2]);
  if (entry && entry[3]) setPose(entry[3]);
  placePhoto();
}

// ---- orbit, zoom, and moving the photo (mouse, wheel, one finger, two fingers)
const pointers = new Map();
let pinch0 = 0, hintGone = false;
function hideHint() { if (!hintGone) { hintGone = true; $('#stage-hint').classList.add('gone'); } }
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  hideHint();
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  const movePhoto = state.photo.move && state.photo.file;
  if (pointers.size === 1) {
    if (movePhoto) { state.photo.x += dx; state.photo.y += dy; placePhoto(); }
    else { state.cam.yaw -= dx * 0.0065; state.cam.pitch = clamp(state.cam.pitch + dy * 0.0065, -0.2, 1.52); }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0 && d > 0) {
      const k = d / pinch0;
      if (movePhoto) { state.photo.s = clamp(state.photo.s * k, 0.2, 6); placePhoto(); } else state.cam.zoom = clamp(state.cam.zoom / k, 0.2, 2.2);
    }
    pinch0 = d;
  }
});
const lift = e => { pointers.delete(e.pointerId); pinch0 = 0; };
canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const k = Math.exp(e.deltaY * 0.0012);
  if (state.photo.move && state.photo.file) { state.photo.s = clamp(state.photo.s / k, 0.2, 6); placePhoto(); }
  else state.cam.zoom = clamp(state.cam.zoom * k, 0.2, 2.2);
  hideHint();
}, { passive: false });
canvas.addEventListener('dblclick', () => { state.cam.zoom = 1; });

// ------------------------------------------------------------------ save, load, log in
async function fetchLooks() {
  const r = await fetch('/api/npc-look', { cache: 'no-store', headers: authHeaders() });
  if (!r.ok) throw new Error('npc-look ' + r.status);
  const j = await r.json();
  state.ranges = j.ranges || {}; state.admin = !!j.admin; state.name = j.name || '';
  state.saved = j.saved || {}; state.savedLooks = j.looks || {};
  state.base = {};
  for (const id of IDS) if (state.looks[id] || id === state.id) ensure(id);
  return j;
}
function refreshWho() {
  const w = $('#who-name'), b = $('#login-btn');
  const name = state.name || accountName();
  if (state.name) { w.textContent = state.admin ? `${name} (can save)` : `${name} (cannot save)`; w.classList.add('ok'); b.textContent = 'Change'; }
  else { w.textContent = 'Not logged in'; w.classList.remove('ok'); b.textContent = 'Log in'; }
}
async function save() {
  const id = state.id, name = nameOf(id).replace(/\s*\(.*$/, '');
  if (!tokenNow()) { openLogin(); return false; }
  const btn = $('#save-btn'); btn.disabled = true;
  try {
    const r = await fetch('/api/npc-look/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ look: look() }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { openLogin(j.message || 'Log in first.'); return false; }
    if (!r.ok) { toast(j.message || 'Could not save (' + r.status + ')', true); return false; }
    state.savedLooks[id] = j.look;
    state.base[id] = K().merged(id, j.look);
    state.looks[id] = deep(state.base[id]);
    state.saved[id] = { by: state.name, at: Date.now() };
    build('base'); rebuild(true); refreshRows(); refreshStatus();
    toast(`Saved. Everyone sees this ${name} from their next visit.`);
    return true;
  } catch (e) { toast('Could not reach the server', true); return false; }
  finally { btn.disabled = false; }
}
async function forgetSaved() {
  const id = state.id, name = nameOf(id).replace(/\s*\(.*$/, '');
  if (!tokenNow()) { openLogin(); return false; }
  if (!state.saved[id]) { toast('Nothing is saved for ' + name + '.'); return false; }
  const r = await fetch('/api/npc-look/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ clear: true }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { openLogin(); return false; }
  if (!r.ok) { toast(j.message || 'Could not do that', true); return false; }
  delete state.saved[id]; delete state.savedLooks[id];
  state.base[id] = K().builtin(id);
  build('base'); refreshRows(); refreshStatus();
  toast(`The game is back to the built-in ${name}. Your changes are still here.`);
  return true;
}
function openLogin(msg = '') {
  const d = $('#login');
  $('#login-msg').textContent = msg;
  $('#login-name').value = accountName();
  $('#login-pin').value = '';
  if (!d.open) d.showModal();
  ($('#login-name').value ? $('#login-pin') : $('#login-name')).focus();
}
async function login(name, pin) {
  const prev = tokenNow();
  const r = await fetch('/api/account/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pin, prev }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) return j.message || (r.status === 404 ? 'Nobody has that name yet.' : 'That did not work.');
  try { localStorage.setItem('breneland.account', JSON.stringify({ name: j.name, token: j.token })); } catch { /* private mode */ }
  await fetchLooks();
  refreshWho(); refreshRows(); refreshStatus();
  return '';
}

// ---- files and code
function exportFile() {
  const id = state.id, text = JSON.stringify(look(), null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = id + '-look.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importText(text) {
  let j;
  try { j = JSON.parse(text); } catch { toast('That file is not a look.', true); return false; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) { toast('That file is not a look.', true); return false; }
  if (j.looks && typeof j.looks === 'object') j = j.looks[state.id] || j;   // a whole /api/npc-look (or /api/dog-look) answer
  replaceLook(K().merged(state.id, j), 'Loaded. The server tidies any odd values when you save.');
  return true;
}
function showCode() {
  const c = K().code(state.id, look());
  $('#code-text').value = c.text;
  $('#code-where').textContent = c.where;
  $('#code').showModal();
}

// ------------------------------------------------------------------ wiring
function wire() {
  $('#pick-btn').addEventListener('click', () => showPicker($('#picker').hidden));
  $('#prev-npc').addEventListener('click', () => step(-1));
  $('#next-npc').addEventListener('click', () => step(1));
  document.addEventListener('pointerdown', e => { const p = $('#picker'); if (!p.hidden && !p.contains(e.target) && !$('#pick-btn').contains(e.target)) showPicker(false); });
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
  $('#turn-btn').addEventListener('click', e => { state.turning = !state.turning; e.currentTarget.setAttribute('aria-pressed', String(state.turning)); });
  $('#pause-btn').addEventListener('click', e => { state.paused = !state.paused; e.currentTarget.setAttribute('aria-pressed', String(state.paused)); });
  const cmp = $('#compare-btn');
  const hold = on => { state.compare = on; cmp.classList.toggle('on', on); if (ch) ch.root.visible = !on; if (baseCh) baseCh.root.visible = on; };
  cmp.addEventListener('pointerdown', e => { e.preventDefault(); cmp.setPointerCapture(e.pointerId); hold(true); });
  cmp.addEventListener('pointerup', () => hold(false)); cmp.addEventListener('pointercancel', () => hold(false)); cmp.addEventListener('lostpointercapture', () => hold(false));
  cmp.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } });
  cmp.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hold(false); });
  // photos
  const sel = $('#photo-select');
  sel.addEventListener('change', () => setPhoto(sel.value));
  $('#photo-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) { const url = URL.createObjectURL(f); photos = photos.filter(p => !p[0].startsWith('blob:')); setPhoto(url); }
    e.target.value = '';
  });
  $('#photo-opacity').addEventListener('input', e => { state.photo.op = Number(e.target.value); placePhoto(); });
  $('#photo-move').addEventListener('click', e => { state.photo.move = !state.photo.move; e.currentTarget.setAttribute('aria-pressed', String(state.photo.move)); placePhoto(); });
  $('#photo-flip').addEventListener('click', () => { state.photo.flip = !state.photo.flip; placePhoto(); });
  $('#photo-rot').addEventListener('click', () => { state.photo.rot = (state.photo.rot + 90) % 360; placePhoto(); });
  $('#photo-front').addEventListener('click', e => { state.photo.front = !state.photo.front; e.currentTarget.setAttribute('aria-pressed', String(state.photo.front)); placePhoto(); });
  // actions
  $('#undo-btn').addEventListener('click', undo);
  $('#redo-btn').addEventListener('click', redo);
  $('#save-btn').addEventListener('click', save);
  const menu = $('#more-menu'), more = $('#more-btn');
  const showMenu = on => { menu.hidden = !on; more.setAttribute('aria-expanded', String(on)); };
  more.addEventListener('click', () => showMenu(menu.hidden));
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== more) showMenu(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { showMenu(false); if (!$('#picker').hidden) { showPicker(false); $('#pick-btn').focus(); } }
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey || e.metaKey) && !inField && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  });
  menu.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    showMenu(false);
    if (act === 'export') exportFile();
    else if (act === 'import') $('#import-file').click();
    else if (act === 'code') showCode();
    else if (act === 'builtin') replaceLook(K().builtin(state.id), 'The built-in ' + nameOf(state.id) + '. Save to make the game show it.');
    else if (act === 'gamenow') replaceLook(deep(state.base[state.id]), 'Back to what the game shows now.');
    else if (act === 'forget') forgetSaved();
  });
  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (f) importText(await f.text());
    e.target.value = '';
  });
  $('#code-close').addEventListener('click', () => $('#code').close());
  $('#code-copy').addEventListener('click', async () => {
    const t = $('#code-text');
    try { await navigator.clipboard.writeText(t.value); toast('Copied.'); }
    catch { t.focus(); t.select(); toast('Select the text and copy it.'); }
  });
  // log in
  $('#login-btn').addEventListener('click', () => openLogin());
  $('#login-cancel').addEventListener('click', () => $('#login').close());
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#login-name').value.trim(), pin = $('#login-pin').value.trim();
    if (!/^[0-9]{4}$/.test(pin)) { $('#login-msg').textContent = 'A PIN is 4 digits.'; return; }
    $('#login-go').disabled = true;
    const why = await login(name, pin).catch(() => 'Could not reach the server.');
    $('#login-go').disabled = false;
    if (why) { $('#login-msg').textContent = why; return; }
    $('#login').close();
    toast(state.admin ? 'Hello ' + state.name + '. You can save the NPCs.' : 'Hello ' + state.name + '. Only Andrew can save the NPCs.');
  });
}

// ------------------------------------------------------------------ go
const params = new URLSearchParams(location.search);
async function start() {
  resize();
  wire();
  const want = params.get('npc') || params.get('dog') || 'dax';
  state.id = NPCS[want] ? want : 'dax';
  try { await fetchLooks(); }
  catch (e) {
    state.base = {};
    status('No server: showing the built-in looks. Saving needs the game server.', true);
  }
  state.id = null;   // (select() builds the panel for the first kind)
  select(NPCS[want] ? want : 'dax');
  refreshWho();
  if (params.get('pose')) setPose(params.get('pose'));
  setView(params.get('view') || 'three');
  if (params.get('photo')) setPhoto(params.get('photo'));
  if (params.get('bare')) document.body.classList.add('bare');   // just the character (tools/dog-editor-match.mjs)
  resize();
  requestAnimationFrame(frame);
}
// for tests (tools/npc-editor-test.mjs) and the console; window.dogEditor is the same thing (the Dog Editor's tools use it)
window.npcEditor = window.dogEditor = {
  state, NPCS, IDS, KINDS, rowEls,
  get GROUPS() { return K().groups(state.id); }, get POSES() { return K().poses(state.id); }, get PHOTOS() { return photos; },
  get ch() { return ch; }, get baseCh() { return baseCh; },
  get dog() { return ch && ch._kind === 'dog' ? ch : null; }, get baseDog() { return baseCh && baseCh._kind === 'dog' ? baseCh : null; },
  look, effective: k => K().effective(state.id, look(), k),
  set: (k, v) => { beginChange(); change(k, v, true); endChange(); }, get: k => K().get(look(), k),
  buildNow: () => { state.dirty = false; build('live'); return ch; },
  select, setPose, setView, setPhoto, save, forgetSaved, undo, redo, login, importText, toCode: () => K().code(state.id, look()).text, fetchLooks,
  showPicker, voicePreview, resetGroup: gid => { const g = K().groups(state.id).find(x => x.id === gid); if (g) resetGroup(g); },
  ready: start(),
};
