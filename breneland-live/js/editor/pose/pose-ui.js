// The Pose Editor's panels (pose-editor): the scene and its camera shots and the cast on the left, the chosen person's pose, joint,
// hands, face and look and the light on the right, the bar along the bottom (undo, redo, snap, mirror, save, load, help, the Shot
// and the storyboard strip). The game's look: ink lines, paper, round pills; icons over words where they read (Andrew's rule), 44 px
// targets, every control a real button or input (keyboard and screen readers). All text through textContent.
// pose-draw: the tools (pose, draw, sculpt, sketch, frame, light) and the Draw, Sculpt, Library and Beats tabs; on a phone (Andrew's v265
// screenshot: two panels side by side over half the view, the bar off the edge) one panel at a time in a bottom sheet, one bar of
// 44 px icons (undo, redo, the mode, mirror, panels, more, the Shot), and the panels step aside while the pen draws.
import { PRESETS, FACES, FACE_KEYS, HAND_SHAPES, DOG_POSES, HUMAN_JOINTS, CHAINS } from './posable.js';
import { rosterList } from './roster.js';
import { HELD } from './props.js';
import { WEATHERS } from './lights.js';
import { PARTS } from './draw-pose.js';
import { BRUSHES, FALLOFFS } from './sculpt.js';

const DEG = 180 / Math.PI;
// little ink drawings (fixed markup, nothing anyone typed)
const P = (d, extra = '') => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
export const ICON = {
  undo: P('<path d="M11 9 5 15l6 6"/><path d="M5 15h13a8 8 0 0 1 0 16h-3" transform="translate(0 -6)"/>'),
  redo: P('<path d="m21 9 6 6-6 6"/><path d="M27 15H14a8 8 0 0 0 0 16h3" transform="translate(0 -6)"/>'),
  snap: P('<path d="M6 26 26 6"/><path d="M6 16h4M16 6v4M16 26v-4M26 16h-4"/>'),
  mirror: P('<path d="M16 4v24"/><path d="M12 9 5 16l7 7zM20 9l7 7-7 7z"/>'),
  save: P('<path d="M7 5h15l5 5v17H7z"/><path d="M11 5v7h9V5M11 27v-8h11v8"/>'),
  load: P('<path d="M5 9h8l3 3h11v15H5z"/><path d="M16 16v8M12 20l4-4 4 4"/>'),
  help: P('<circle cx="16" cy="16" r="12"/><path d="M12.5 12.5a3.6 3.6 0 1 1 5 3.3c-1 .5-1.5 1.2-1.5 2.4V19"/><path d="M16 23.5v.2"/>'),
  camera: P('<path d="M4 10h6l2-4h8l2 4h6v16H4z"/><circle cx="16" cy="17" r="5"/>'),
  plus: P('<path d="M16 7v18M7 16h18"/>'),
  x: P('<path d="m9 9 14 14M23 9 9 23"/>'),
  eye: P('<path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z"/><circle cx="16" cy="16" r="3.5"/>'),
  target: P('<circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="3"/><path d="M16 2v5M16 25v5M2 16h5M25 16h5"/>'),
  pose: P('<circle cx="16" cy="6.5" r="3"/><path d="M16 10v9M8 13l8 2 8-5M16 19l-5 9M16 19l6 8"/>'),
  joint: P('<circle cx="16" cy="16" r="4"/><path d="M16 4a12 12 0 0 1 12 12"/><path d="M4 16A12 12 0 0 0 16 28"/>'),
  hand: P('<path d="M10 17V9a2 2 0 0 1 4 0v6M14 15V7a2 2 0 0 1 4 0v8M18 15V9a2 2 0 0 1 4 0v9c0 6-3 9-8 9-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l3 3"/>'),
  face: P('<circle cx="16" cy="16" r="12"/><path d="M11 19c1.5 2 3 3 5 3s3.5-1 5-3"/><path d="M11.5 12.5v1M20.5 12.5v1"/>'),
  sun: P('<circle cx="16" cy="16" r="5.5"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/>'),
  reset: P('<path d="M7 9v6h6"/><path d="M8 15a9 9 0 1 0 2.5-6.5L7 12"/>'),
  free: P('<path d="M11 15V10a5 5 0 0 1 10 0"/><rect x="7" y="15" width="18" height="12" rx="2"/>'),
  pin: P('<path d="M12 4h8l-1 8 4 4H9l4-4zM16 16v12"/>'),
  person: P('<circle cx="16" cy="9" r="5"/><path d="M6 28c1-6 5-9 10-9s9 3 10 9"/>'),
  pen: P('<path d="M6 26l3-8L22 5l5 5-13 13z"/><path d="M19 8l5 5M6 26l5-1"/>'),
  brush: P('<path d="M27 5 15 17"/><path d="M15 17c-4-1-7 1-8 5-.5 2-1.5 3-3 4 5 1 10 0 12-3 1.5-2 1-4-1-6z"/>'),
  sketch: P('<circle cx="16" cy="7" r="3.5"/><path d="M16 10.5v9M9 13l7 2 7-2M16 19.5l-5 8M16 19.5l5 8"/>', ' stroke-dasharray="0"'),
  frame: P('<path d="M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6"/><rect x="10" y="10" width="12" height="12" rx="1.5" stroke-dasharray="3 3"/>'),
  ray: P('<circle cx="8" cy="8" r="4"/><path d="M11 11l14 14M25 18v7h-7"/>'),
  thirds: P('<rect x="4" y="6" width="24" height="20" rx="2"/><path d="M12 6v20M20 6v20M4 12.7h24M4 19.3h24"/>'),
  onion: P('<rect x="5" y="9" width="15" height="17" rx="2" stroke-dasharray="3 3"/><rect x="12" y="5" width="15" height="17" rx="2"/>'),
  beat: P('<rect x="3" y="8" width="12" height="16" rx="2"/><rect x="17" y="8" width="12" height="16" rx="2" stroke-dasharray="3 3"/><path d="M23 13v6M20 16h6"/>'),
  tween: P('<rect x="3" y="10" width="8" height="12" rx="1.5"/><rect x="21" y="10" width="8" height="12" rx="1.5"/><rect x="12.5" y="12" width="7" height="8" rx="1.5" stroke-dasharray="2 2"/>'),
  menu: P('<circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/><circle cx="24" cy="16" r="1.6"/>'),
  panel: P('<rect x="4" y="5" width="24" height="22" rx="3"/><path d="M4 18h24M12 22.5h8"/>'),
  library: P('<path d="M6 5h5v22H6zM13 5h5v22h-5z"/><path d="m20 7 4.5-1.5 5 20.5-4.5 1.5z"/>'),
  board: P('<rect x="3" y="5" width="11" height="9" rx="1.5"/><rect x="18" y="5" width="11" height="9" rx="1.5"/><rect x="3" y="18" width="11" height="9" rx="1.5"/><path d="M18 20h11M18 24h8"/>'),
  check: P('<path d="m6 17 6 6L26 9"/>'),
  scene: P('<path d="M4 26 12 13l5 7 4-5 7 11z"/><circle cx="22" cy="8" r="3"/>'),
};
// the tools: what the pen (and in all but Pose, the mouse) does on the picture
export const TOOLS = [['pose', 'pose', 'Pose'], ['draw', 'pen', 'Draw'], ['sculpt', 'brush', 'Sculpt'], ['sketch', 'sketch', 'Sketch'], ['frame', 'frame', 'Frame'], ['light', 'ray', 'Light']];
const TOOL_KEY = { pose: 'Esc', draw: 'D', sculpt: 'S', sketch: 'K', frame: 'F', light: 'Light' };
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
};
const iconBtn = (icon, label, on, extra = {}) => el('button', { type: 'button', class: 'pz-ib ' + (extra.class || ''), 'aria-label': label, title: label, html: ICON[icon], onclick: on, ...extra.attrs });
// (pose-draw) a compact chip for option lists (scenes' shots, eye targets, parts, brushes)
const chip = (text, on, active = false, extra = {}) => el('button', { type: 'button', class: 'pz-chip' + (active ? ' on' : ''), 'aria-pressed': active ? 'true' : 'false', text, onclick: on, ...extra });
const pill = (text, on, active = false, extra = {}) => el('button', { type: 'button', class: 'pz-pill' + (active ? ' on' : ''), 'aria-pressed': active ? 'true' : 'false', text, onclick: on, ...extra });
// a labelled slider: value -> text, on input live, on change committed
function slider(label, v, min, max, step, onInput, onDone, fmt = x => String(Math.round(x))) {
  const out = el('output', { text: fmt(v) });
  const inp = el('input', { type: 'range', min, max, step, value: v, 'aria-label': label });
  inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); onInput(+inp.value); });
  inp.addEventListener('change', () => onDone?.(+inp.value));
  return el('label', { class: 'pz-row' }, el('span', { text: label }), inp, out);
}
const card = (title, ...kids) => el('section', { class: 'pz-card' }, el('h2', { text: title }), ...kids);

export function mountUI(api) {
  const S = api.S;
  const root = el('div', { id: 'pose-ui', class: 'pz' });
  const left = el('aside', { class: 'pz-left', 'aria-label': 'Scene and people' });
  const right = el('aside', { class: 'pz-right', 'aria-label': 'Pose and light' });
  const bar = el('nav', { class: 'pz-bar', 'aria-label': 'Tools' });
  const guide = el('div', { class: 'pz-guide', 'aria-hidden': 'true' });
  const toastEl = el('div', { class: 'pz-toast', role: 'status', 'aria-live': 'polite' });
  const helpEl = el('div', { class: 'pz-help', role: 'dialog', 'aria-label': 'How the Pose Editor works', hidden: true });
  // (pose-draw) on a phone one panel at a time, a bottom sheet that slides up over the picture's lower part
  const sheet = el('section', { class: 'pz-sheet', role: 'dialog', 'aria-label': 'Panel', hidden: true });
  root.append(guide, left, right, sheet, bar, toastEl, helpEl);
  document.body.append(root);
  let tab = 'pose';
  let page = null;            // the phone's open panel (null: closed)
  const PHONE = matchMedia('(max-width: 760px), (max-height: 520px)');
  const phone = () => PHONE.matches;
  PHONE.addEventListener?.('change', () => { page = null; refresh(); });

  // ---------------------------------------------------------------- left: the scene, its shots, the cast
  function sceneCard() {
    const sel = el('select', { 'aria-label': 'Scene', class: 'pz-select', onchange: e => api.scene(e.target.value) });
    for (const sc of api.SCENES) sel.append(el('option', { value: sc.id, text: sc.name, selected: sc.id === S.scene.id }));
    const shots = el('div', { class: 'pz-chips' });
    S.scene.shots.forEach(v => shots.append(chip(v.name, () => api.view(v))));
    (S.myShots[S.scene.id] || []).forEach((v, i) => shots.append(el('span', { class: 'pz-mine' }, chip(v.name, () => api.view(v)), iconBtn('x', 'Forget ' + v.name, () => api.dropView(i), { class: 'tiny' }))));
    shots.append(el('button', { type: 'button', class: 'pz-chip add', 'aria-label': 'Save this view', title: 'Save this view', html: ICON.plus + '<span>Save view</span>', onclick: () => api.saveView() }));
    const mm = fovToMm(S.cam.fov);
    const lens = slider('Lens (mm)', mm, 14, 135, 1, v => api.cam({ fov: mmToFov(v) }), () => api.camDone());
    lens.classList.add('pz-lens');
    return card('Scene', sel, shots, lens);
  }
  function castCard() {
    const list = el('div', { class: 'pz-cast' });
    S.cast.forEach((c, i) => {
      const b = el('button', { type: 'button', class: 'pz-who' + (i === S.sel ? ' on' : ''), 'aria-pressed': i === S.sel ? 'true' : 'false', onclick: () => api.select(i) },
        el('i', { html: ICON.person, 'aria-hidden': 'true' }), el('span', { text: `${i + 1}. ${api.nameOf(c.id)}` }));
      list.append(el('div', { class: 'pz-whorow' }, b, iconBtn('x', 'Take ' + api.nameOf(c.id) + ' out', () => api.remove(i), { class: 'tiny' })));
    });
    const pick = rosterSelect('Who to add', 'kevin');
    const full = S.cast.length >= api.MAX_CAST;
    const add = el('button', { type: 'button', class: 'pz-btn', disabled: full, onclick: () => api.add(pick.value), html: ICON.plus + '<span>Add</span>', 'aria-label': 'Add this person' });
    return card(`People (${S.cast.length} of ${api.MAX_CAST})`, list, el('div', { class: 'pz-addrow' }, pick, add), S.cast.length ? null : el('p', { class: 'pz-note', text: 'Add someone, then click them to pose.' }));
  }
  function rosterSelect(label, value, on) {
    const pick = el('select', { 'aria-label': label, class: 'pz-select', onchange: on ? e => on(e.target.value) : null });
    const groups = new Map();
    for (const r of rosterList()) { if (!groups.has(r.group)) groups.set(r.group, el('optgroup', { label: r.group })); groups.get(r.group).append(el('option', { value: r.id, text: r.name })); }
    for (const g of groups.values()) pick.append(g);
    pick.value = value;
    return pick;
  }
  function drawLeft() { left.replaceChildren(); if (phone()) return; left.append(sceneCard(), castCard()); }
  const fovToMm = f => Math.round(12 / Math.tan((f * Math.PI / 180) / 2)); // (a 24 mm tall frame)
  const mmToFov = mm => 2 * Math.atan(12 / mm) * 180 / Math.PI;

  // ---------------------------------------------------------------- right: the inspector
  const TABS = [['pose', 'pose', 'Pose'], ['draw', 'pen', 'Draw'], ['sculpt', 'brush', 'Sculpt'], ['joint', 'joint', 'Joint'], ['hands', 'hand', 'Hands'],
    ['face', 'face', 'Face'], ['look', 'eye', 'Look'], ['library', 'library', 'Library'], ['board', 'board', 'Beats'], ['light', 'sun', 'Light']];
  const FREE_TABS = new Set(['light', 'board', 'draw']); // (work with nobody chosen)
  function tabBody(id, c) {
    const body = el('div', { class: 'pz-tabbody' });
    const dog = c && c.body.kind === 'dog';
    if (!FREE_TABS.has(id) && !c) { body.append(el('p', { class: 'pz-note', text: 'Tap a person in the picture (or in People) to pose them. Light, Draw and Beats work any time.' })); return body; }
    if (dog && !['pose', 'light', 'board', 'draw'].includes(id)) id = 'pose';
    ({ pose: poseTab, joint: jointTab, hands: handsTab, face: faceTab, look: lookTab, light: lightTab, draw: drawTab, sculpt: sculptTab, library: libraryTab, board: boardTab })[id](body, c);
    return body;
  }
  function drawRight() {
    right.replaceChildren();
    if (phone()) return;
    const c = api.cur, dog = c && c.body.kind === 'dog';
    const tabs = el('div', { class: 'pz-tabs', role: 'tablist' });
    for (const [id, icon, label] of TABS) {
      const dis = !FREE_TABS.has(id) && (!c || (dog && id !== 'pose'));
      tabs.append(el('button', { type: 'button', role: 'tab', class: 'pz-tab' + (tab === id ? ' on' : ''), 'aria-selected': tab === id ? 'true' : 'false', 'aria-label': label, title: label, disabled: dis, html: ICON[icon] + `<span>${label}</span>`, onclick: () => { tab = id; drawRight(); } }));
    }
    right.append(tabs, tabBody(tab, c));
  }
  // ---------------------------------------------------------------- the phone's sheet: one panel, its own scroll, drag down to close
  const PAGES = [['scene', 'scene', 'Scene'], ['people', 'person', 'People'], ...TABS];
  function drawSheet() {
    sheet.replaceChildren();
    sheet.hidden = !phone() || !page;
    root.classList.toggle('pz-phone', phone());
    if (sheet.hidden) return;
    const grip = el('div', { class: 'pz-grip', role: 'button', tabindex: '0', 'aria-label': 'Close the panel', title: 'Close' }, el('i'));
    grip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); openPage(null); } });
    let y0 = null;
    grip.addEventListener('pointerdown', e => { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', e => { if (y0 === null) return; const dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
    grip.addEventListener('pointerup', e => { const dy = y0 === null ? 0 : e.clientY - y0; y0 = null; sheet.style.transform = ''; if (dy > 50 || Math.abs(dy) < 4) openPage(null); });
    const nav = el('div', { class: 'pz-pages', role: 'tablist' });
    const c = api.cur;
    for (const [id, icon, label] of PAGES) nav.append(el('button', { type: 'button', role: 'tab', class: 'pz-ib sm' + (page === id ? ' on' : ''), 'aria-selected': page === id ? 'true' : 'false', 'aria-label': label, title: label, html: ICON[icon], onclick: () => openPage(id) }));
    const inner = el('div', { class: 'pz-sheetbody' });
    if (page === 'menu') inner.append(menuPage());
    else if (page === 'scene') inner.append(sceneCard());
    else if (page === 'people') inner.append(castCard());
    else inner.append(tabBody(page, c));
    sheet.append(grip, nav, inner);
  }
  function openPage(id) { page = id; if (id && id !== 'menu' && id !== 'scene' && id !== 'people') tab = id; drawSheet(); drawBar(); }
  function poseTab(body, c) {
    const st = c.body.state;
    if (c.body.kind === 'dog') {
      const g = el('div', { class: 'pz-grid' });
      for (const [id, label] of DOG_POSES) g.append(pill(label, () => { api.state({ preset: id }); api.commit(); }, st.preset === id));
      body.append(card(api.nameOf(c.id), g, turnRow(c)));
      return;
    }
    const g = el('div', { class: 'pz-grid' });
    for (const p of PRESETS) g.append(pill(p.label, () => api.preset(p.id), st.preset === p.id));
    const P = api.presetById(st.preset);
    const kids = [g];
    if (P.speed) kids.push(slider('Step', (st.moment ?? P.cyc) * 100, 0, 100, 1, v => api.state({ moment: v / 100 }), () => api.commit()));
    else if (P.t !== undefined) kids.push(slider('Moment', (st.moment ?? P.t) * 100, 0, 300, 1, v => api.state({ moment: v / 100 }), () => api.commit(), v => (v / 100).toFixed(2) + ' s'));
    if (P.anim === 'sit') kids.push(slider('Seat height (cm)', st.seat * 100, 15, 90, 1, v => api.state({ seat: v / 100 }), () => api.commit()));
    body.append(card(api.nameOf(c.id), ...kids));
    const r = st.rot.body || [0, 0, 0];
    body.append(card('Whole body',
      slider('Lean', r[0] * DEG, -60, 60, 1, v => api.setJointDeg('body', 'x', v), () => api.commit()),
      slider('Twist', r[1] * DEG, -90, 90, 1, v => api.setJointDeg('body', 'y', v), () => api.commit()),
      slider('Tip', r[2] * DEG, -45, 45, 1, v => api.setJointDeg('body', 'z', v), () => api.commit()),
      slider('Hips up / down (cm)', st.hipsDy * 100, -60, 20, 1, v => api.state({ hipsDy: v / 100 }), () => api.commit()),
      turnRow(c),
      el('div', { class: 'pz-btns' }, el('button', { type: 'button', class: 'pz-btn', html: ICON.mirror + '<span>Mirror</span>', onclick: () => api.mirror(), 'aria-label': 'Mirror left and right (M)' }), el('button', { type: 'button', class: 'pz-btn', html: ICON.reset + '<span>Reset pose</span>', onclick: () => api.resetPose(), 'aria-label': 'Reset the whole pose' }))));
    // the IK chains: on, pin, free
    const ik = el('div', { class: 'pz-iks' });
    for (const k of CHAINS) {
      const on = !!st.ik[k], foot = k.startsWith('foot'), name = { handL: 'Left hand', handR: 'Right hand', footL: 'Left foot', footR: 'Right foot' }[k];
      ik.append(el('div', { class: 'pz-ikrow' }, el('span', { text: name + (on ? ': follows its handle' : '') }),
        foot ? el('button', { type: 'button', class: 'pz-ib tiny' + (st.pin[k] ? ' on' : ''), 'aria-pressed': st.pin[k] ? 'true' : 'false', 'aria-label': 'Pin ' + name + ' to the floor', title: 'Pin to the floor', html: ICON.pin, onclick: () => api.pin(k, !st.pin[k]) }) : null,
        on ? iconBtn('free', 'Free the ' + (foot ? 'leg' : 'arm') + ' (back to its joints)', () => api.free(k), { class: 'tiny' }) : null));
    }
    body.append(card('Hands and feet', el('p', { class: 'pz-note', text: 'Drag a pink cube to move a hand or foot: the arm or leg follows. The blue cone says which way the elbow or knee points.' }), ik));
    const held = el('select', { class: 'pz-select', 'aria-label': 'Held in the hand', onchange: e => { api.state({ held: e.target.value || null }); api.commit(); } });
    for (const [id, label] of HELD) held.append(el('option', { value: id, text: label, selected: (st.held || '') === id }));
    body.append(card('Holding', held));
  }
  function turnRow(c) { return slider('Turn', ((c.yaw * DEG) % 360 + 540) % 360 - 180, -180, 180, 1, v => api.place({ yaw: v / DEG }), () => api.commit()); }
  function jointTab(body, c) {
    const st = c.body.state;
    const sel = el('select', { class: 'pz-select', 'aria-label': 'Joint', onchange: e => api.joint(e.target.value || null) });
    sel.append(el('option', { value: '', text: 'Pick a joint (or click a dot)' }));
    for (const j of HUMAN_JOINTS) if (c.body.joints.some(x => x.id === j.id)) sel.append(el('option', { value: j.id, text: j.label, selected: S.joint === j.id }));
    const kids = [sel];
    if (S.joint) {
      const r = st.rot[S.joint] || [0, 0, 0];
      kids.push(slider('Turn x (red)', r[0] * DEG, -180, 180, 1, v => api.setJointDeg(S.joint, 'x', v), () => api.commit()));
      kids.push(slider('Turn y (green)', r[1] * DEG, -180, 180, 1, v => api.setJointDeg(S.joint, 'y', v), () => api.commit()));
      kids.push(slider('Turn z (blue)', r[2] * DEG, -180, 180, 1, v => api.setJointDeg(S.joint, 'z', v), () => api.commit()));
      kids.push(el('div', { class: 'pz-btns' }, el('button', { type: 'button', class: 'pz-btn', html: ICON.reset + '<span>Reset joint</span>', 'aria-label': 'Reset this joint (R)', onclick: () => api.resetJoint() }),
        el('button', { type: 'button', class: 'pz-btn' + (S.snap ? ' on' : ''), 'aria-pressed': S.snap ? 'true' : 'false', html: ICON.snap + '<span>Snap 15</span>', 'aria-label': 'Snap turns to 15 degrees (or hold Shift)', onclick: () => api.snap(!S.snap) })));
    }
    kids.push(el('p', { class: 'pz-note', text: 'Click a white dot on the body, then drag a ring: red turns about x, green y, blue z. Hold Shift to snap to 15 degrees.' }));
    body.append(card('Joint', ...kids));
  }
  function handsTab(body, c) {
    const st = c.body.state;
    for (const [k, name] of [['L', 'Left hand'], ['R', 'Right hand']]) {
      const H = st.hands[k];
      const g = el('div', { class: 'pz-grid four' });
      for (const s of HAND_SHAPES) g.append(pill(s[0].toUpperCase() + s.slice(1), () => { st.hands[k] = { shape: s, curl: null }; api.commit(); }, H.shape === s && !H.curl));
      const base = { open: [0.05, 0.05, 0.05, 0], relaxed: [1.35, 1.45, 1.55, 0.5], grip: [2.5, 2.6, 2.6, 0.5], point: [0, 2.7, 2.7, 0.6] }[H.shape];
      const cur = H.curl || base;
      const set = (i, v) => { const cc = (st.hands[k].curl || base).slice(); cc[i] = v; st.hands[k] = { shape: H.shape, curl: cc }; };
      const names = ['First finger', 'Middle finger', 'Last finger', 'Thumb'];
      body.append(card(name, g, ...names.map((n, i) => slider(n + ' curl', cur[i] * DEG, 0, 160, 1, () => {}, v => { set(i, v / DEG); api.commit(); }))));
    }
    body.append(el('p', { class: 'pz-note', text: 'A hand holding something keeps its grip round it.' }));
  }
  function faceTab(body, c) {
    const st = c.body.state, F = st.face;
    const g = el('div', { class: 'pz-grid' });
    for (const f of FACES) g.append(pill(f.label, () => { api.state({ face: f.v ? { preset: f.id } : null }); api.commit(); }, (F ? F.preset : 'auto') === f.id));
    const now = c.body.h?.expr || {};
    const rows = FACE_KEYS.map(([k, label, a, b]) => slider(label, (F?.[k] ?? FACES.find(f => f.id === F?.preset)?.v?.[k] ?? now[k] ?? 0) * 100, a * 100, b * 100, 1,
      v => { const f = st.face || { preset: 'calm' }; f[k] = v / 100; st.face = f; }, () => api.commit()));
    body.append(card('Face', g, ...rows));
  }
  function lookTab(body, c) {
    const e = c.eye;
    const btns = el('div', { class: 'pz-chips' },
      chip('Free', () => api.eye(null), !e),
      el('button', { type: 'button', class: 'pz-chip' + (e?.mode === 'camera' ? ' on' : ''), 'aria-pressed': e?.mode === 'camera' ? 'true' : 'false', html: ICON.camera + '<span>Camera</span>', 'aria-label': 'Look at the camera', onclick: () => api.eye({ mode: 'camera' }) }),
      el('button', { type: 'button', class: 'pz-chip' + (e?.mode === 'point' ? ' on' : ''), 'aria-pressed': e?.mode === 'point' ? 'true' : 'false', html: ICON.target + '<span>A spot</span>', 'aria-label': 'Click something in the picture to look at (L)', onclick: () => api.lookPick() }));
    S.cast.forEach((o, i) => { if (o !== c) btns.append(chip(api.nameOf(o.id), () => api.eye({ mode: 'char', who: i }), e?.mode === 'char' && e.who === i, { 'aria-label': 'Look at ' + api.nameOf(o.id) })); });
    body.append(card('Eyes', btns,
      slider('Head follows (%)', c.body.state.headW * 100, 0, 100, 1, v => api.state({ headW: v / 100 }), () => api.commit()),
      el('p', { class: 'pz-note', text: 'The eyes go first, the head follows by this much.' })));
  }
  function lightTab(body) {
    const L = api.lights.state;
    const hh = h => { const H = Math.floor(h), M = Math.round((h - H) * 60) % 60, ap = H < 12 ? 'am' : 'pm'; return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${ap}`; };
    const wx = el('div', { class: 'pz-chips' });
    for (const [id, label] of WEATHERS) wx.append(pill(label, () => { api.light({ weather: id }); api.lightDone(); drawRight(); }, L.weather === id));
    body.append(card('Time and weather', slider('Time of day', L.hour * 4, 0, 95, 1, v => api.light({ hour: v / 4 }), () => api.lightDone(), v => hh(v / 4)), wx));
    // the key: the sun as it is, or aimed (a compass pad: drag the sun round and in toward the middle for higher)
    const pad = sunPad(L.key, (az, el2) => api.light({ key: { follow: false, az, el: el2 } }), () => { api.lightDone(); drawRight(); });
    body.append(card('Key light',
      el('div', { class: 'pz-btns' }, pill('The sun', () => { api.light({ key: { follow: true } }); api.lightDone(); drawRight(); }, L.key.follow), pill('Aimed', () => { api.light({ key: { follow: false } }); api.lightDone(); drawRight(); }, !L.key.follow)),
      pad,
      slider('Strength (%)', L.key.i * 100, 0, 250, 1, v => api.light({ key: { i: v / 100 } }), () => api.lightDone()),
      colour('Colour', L.key.color, v => { api.light({ key: { color: v } }); api.lightDone(); })));
    body.append(card('Fill and rim',
      slider('Fill (%)', L.fill.i * 100, 0, 200, 1, v => api.light({ fill: { i: v / 100 } }), () => api.lightDone()),
      colour('Fill colour', L.fill.color, v => { api.light({ fill: { color: v } }); api.lightDone(); }),
      slider('Rim (%)', L.rim.i * 100, 0, 200, 1, v => api.light({ rim: { i: v / 100 } }), () => api.lightDone()),
      colour('Rim colour', L.rim.color, v => { api.light({ rim: { color: v } }); api.lightDone(); })));
    body.append(card('The scene',
      el('div', { class: 'pz-btns' }, pill('Lamps on', () => { api.light({ lamps: true }); api.lightDone(); drawRight(); }, L.lamps), pill('Lamps off', () => { api.light({ lamps: false }); api.lightDone(); drawRight(); }, !L.lamps)),
      slider('Haze (%)', L.haze * 100, 0, 100, 1, v => api.light({ haze: v / 100 }), () => api.lightDone()),
      slider('Exposure (%)', L.exposure * 100, 40, 200, 1, v => api.light({ exposure: v / 100 }), () => api.lightDone())));
  }
  function colour(label, v, on) { const i = el('input', { type: 'color', value: v, 'aria-label': label }); i.addEventListener('change', () => on(i.value)); return el('label', { class: 'pz-row' }, el('span', { text: label }), i); }
  // the sun pad: north up; the dot's bearing is where the light comes from, its distance from the rim how high it is
  function sunPad(key, onMove, onDone) {
    const N = 132, R = N / 2 - 10;
    const cv = el('div', { class: 'pz-sunpad' + (key.follow ? ' off' : ''), role: 'slider', tabindex: '0', 'aria-label': 'Aim the key light: drag the sun (arrow keys too)', 'aria-valuetext': `from ${Math.round(key.az)} degrees, ${Math.round(key.el)} up` });
    const dot = el('i', { class: 'pz-sundot' });
    cv.append(el('b', { text: 'N' }), dot);
    const put = () => { const r = R * (1 - key.el / 90), b = key.az * Math.PI / 180; dot.style.left = (N / 2 + Math.sin(b) * r) + 'px'; dot.style.top = (N / 2 - Math.cos(b) * r) + 'px'; };
    put();
    const at = e => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left - N / 2, y = e.clientY - b.top - N / 2; const az = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360, el2 = Math.max(2, Math.min(89, 90 * (1 - Math.hypot(x, y) / R))); key.az = az; key.el = el2; key.follow = false; cv.classList.remove('off'); put(); onMove(az, el2); };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); at(e); const mv = ev => at(ev), up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); onDone(); }; cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); });
    cv.addEventListener('keydown', e => { const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] }[e.key]; if (!d) return; e.preventDefault(); key.az = (key.az + d[0] + 360) % 360; key.el = Math.max(2, Math.min(89, key.el + d[1])); put(); onMove(key.az, key.el); onDone(); });
    return cv;
  }

  // ---------------------------------------------------------------- pose-draw: Draw, Sculpt, Library, Beats
  function drawTab(body, c) {
    const parts = el('div', { class: 'pz-chips' });
    for (const [id, label] of PARTS) parts.append(chip(label, () => api.part(id), S.part === id));
    const tools = el('div', { class: 'pz-chips' });
    for (const [id, icon, label] of TOOLS) tools.append(el('button', { type: 'button', class: 'pz-chip' + (S.tool === id ? ' on' : ''), 'aria-pressed': S.tool === id ? 'true' : 'false', html: ICON[icon] + `<span>${label}</span>`, onclick: () => api.tool(id) }));
    body.append(card('Draw', tools,
      el('p', { class: 'pz-note', text: 'The pen draws, a finger moves the camera. In Draw a mouse draws too. Light pressure nudges, firm pressure snaps to your line.' })));
    body.append(card('What a line moves', parts,
      el('p', { class: 'pz-note', text: 'Arm or leg: draw from the shoulder or hip to where the hand or foot goes; the elbow or knee bends where your line bends. Spine: a line of action from the hips up. A short flick from a hand or foot points it. From the eyes out: where they look. On the face: a mouth curve or a brow line.' })));
    body.append(card('Quick sketch', el('div', { class: 'pz-addrow' }, rosterSelect('Sketch as', S.sketchWho, v => api.sketchWho(v)), el('button', { type: 'button', class: 'pz-btn' + (S.tool === 'sketch' ? ' on' : ''), html: ICON.sketch + '<span>Sketch</span>', 'aria-label': 'Draw a stick figure (K)', onclick: () => api.tool(S.tool === 'sketch' ? 'pose' : 'sketch') })),
      el('p', { class: 'pz-note', text: 'Draw a stick figure on the ground: a circle for the head, a line for the spine, a line for each arm and leg. They are placed and posed to match.' })));
    void c;
  }
  function sculptTab(body, c) {
    const B = api.sculpt.brush;
    const br = el('div', { class: 'pz-chips' });
    for (const [id, label] of BRUSHES) br.append(chip(label, () => api.brush({ kind: id }), B.kind === id));
    const fo = el('div', { class: 'pz-chips' });
    for (const [id, label] of FALLOFFS) fo.append(chip(label, () => api.brush({ falloff: id }), B.falloff === id));
    body.append(card('Sculpt ' + api.nameOf(c.id),
      el('div', { class: 'pz-btns' }, el('button', { type: 'button', class: 'pz-btn' + (S.tool === 'sculpt' ? ' on' : ''), 'aria-pressed': S.tool === 'sculpt' ? 'true' : 'false', html: ICON.brush + '<span>Sculpt on</span>', 'aria-label': 'Sculpt with the pen or mouse (S)', onclick: () => api.tool(S.tool === 'sculpt' ? 'pose' : 'sculpt') })),
      br,
      slider('Size (px)', B.px, 10, 320, 1, v => { B.px = v; }, () => {}),
      slider('Strength (%)', B.strength * 100, 5, 100, 1, v => { B.strength = v / 100; }, () => {}),
      el('div', { class: 'pz-row' }, el('span', { text: 'Falloff' }), fo),
      el('div', { class: 'pz-btns' },
        chip('Mirror', () => api.brush({ mirror: !B.mirror }), B.mirror),
        chip('Invert', () => api.brush({ invert: !B.invert }), B.invert),
        el('button', { type: 'button', class: 'pz-btn', html: ICON.reset + '<span>Clear sculpt</span>', 'aria-label': 'Clear this person\'s sculpt', onclick: () => api.clearSculpt() })),
      el('p', { class: 'pz-note', text: 'Pen pressure sets the strength. Two fingers pinch the brush size ([ and ] on a keyboard). It changes this shot only, never the game.' })));
  }
  function libraryTab(body, c) {
    const name = el('input', { type: 'text', class: 'pz-select', maxlength: '40', placeholder: 'Name this pose', 'aria-label': 'Name for the pose' });
    body.append(card('Pose library', el('div', { class: 'pz-addrow' }, name, el('button', { type: 'button', class: 'pz-btn', html: ICON.plus + '<span>Keep</span>', 'aria-label': 'Keep this pose in the library', onclick: () => { api.librarySave(name.value.trim() || null); toast('Kept in the library.'); } }))));
    const grid = el('div', { class: 'pz-lib' });
    for (const e of api.library()) {
      const img = e.thumb ? el('img', { src: e.thumb, alt: '' }) : el('i', { html: ICON.pose, 'aria-hidden': 'true' });
      grid.append(el('div', { class: 'pz-libitem' }, img, el('b', { text: e.name }),
        el('div', { class: 'pz-libbtns' },
          iconBtn('check', 'Put ' + e.name + ' on ' + api.nameOf(c.id), () => api.libraryApply(e.id, false), { class: 'tiny' }),
          iconBtn('mirror', 'Put ' + e.name + ' on, mirrored', () => api.libraryApply(e.id, true), { class: 'tiny' }),
          iconBtn('x', 'Forget ' + e.name, () => api.libraryDrop(e.id), { class: 'tiny' }))));
    }
    if (!grid.children.length) grid.append(el('p', { class: 'pz-note', text: 'Nothing kept yet. Pose someone, name it and Keep.' }));
    body.append(grid);
  }
  function boardTab(body) {
    const n = Math.max(1, S.beats.length), beats = el('div', { class: 'pz-chips' });
    for (let i = 0; i < n; i++) beats.append(chip(String(i + 1), () => api.goBeat(i), i === S.beat, { 'aria-label': 'Beat ' + (i + 1) }));
    body.append(card('Beats',
      beats,
      el('div', { class: 'pz-btns' },
        el('button', { type: 'button', class: 'pz-btn', html: ICON.beat + '<span>Next beat</span>', 'aria-label': 'Copy the scene for the next beat (N)', onclick: () => api.nextBeat() }),
        el('button', { type: 'button', class: 'pz-btn', html: ICON.tween + '<span>In-between</span>', disabled: S.beat < 1, 'aria-label': 'Make a beat halfway from the last one', onclick: () => api.tween() }),
        chip('Onion skin', () => api.onion(!S.onion), S.onion, { 'aria-label': 'Show the last beat ghosted (O)' }),
        S.beats.length ? iconBtn('x', 'Drop this beat', () => api.dropBeat(), { class: 'tiny' }) : null),
      el('p', { class: 'pz-note', text: 'Next beat copies the scene for the next frame of the strip. The onion skin shows the beat before, ghosted. In-between makes the halfway pose.' })));
    const list = el('div', { class: 'pz-shots' });
    const shots = api.shots.slice().reverse();
    shots.forEach((s, k) => {
      const i = api.shots.length - 1 - k, note = el('input', { type: 'text', class: 'pz-select', maxlength: '120', value: s.note || '', placeholder: 'A note for this frame', 'aria-label': 'Note for frame ' + (k + 1) });
      note.addEventListener('input', () => api.note(i, note.value));
      list.append(el('div', { class: 'pz-shotrow' }, el('b', { text: String(k + 1) }), el('img', { src: s.url, alt: '' }), note));
    });
    body.append(card('Storyboard', list.children.length ? list : el('p', { class: 'pz-note', text: 'Take Shots (or Shoot every beat) and they line up here with a note each.' }),
      el('div', { class: 'pz-btns' },
        el('button', { type: 'button', class: 'pz-btn', html: ICON.camera + '<span>Shoot every beat</span>', onclick: async () => { const k = await api.shootBeats(); toast(`${k} shot${k === 1 ? '' : 's'} in the strip.`); refresh(); } }),
        el('button', { type: 'button', class: 'pz-btn', html: ICON.board + '<span>Export the sheet</span>', 'aria-label': 'Download every shot on one contact sheet', disabled: !api.shots.length, onclick: () => api.board() }))));
  }
  // the phone's menu: every panel and the rest of the tools
  function menuPage() {
    const g = el('div', { class: 'pz-menu' });
    const item = (icon, label, on, active = false) => el('button', { type: 'button', class: 'pz-ib' + (active ? ' on' : ''), 'aria-label': label, title: label, 'aria-pressed': active ? 'true' : null, html: ICON[icon], onclick: on });
    for (const [id, icon, label] of TOOLS) g.append(item(icon, label + ' tool', () => { api.tool(id); openPage(null); }, S.tool === id));
    g.append(item('snap', 'Snap turns to 15 degrees', () => api.snap(!S.snap), S.snap), item('thirds', 'Rule of thirds', () => api.thirds(!S.thirds), S.thirds), item('onion', 'Onion skin', () => api.onion(!S.onion), S.onion),
      item('beat', 'Next beat', () => api.nextBeat()), item('board', 'Beats and storyboard', () => openPage('board')), item('library', 'Pose library', () => openPage('library')),
      item('save', 'Save the scene to a file', () => api.saveFile()), item('load', 'Load a scene file', () => file.click()), item('help', 'How it works', () => help(true)));
    const sizes = sizeSelect();
    return el('div', {}, g, el('label', { class: 'pz-row' }, el('span', { text: 'Shot size' }), sizes));
  }
  function sizeSelect() {
    const sizes = el('select', { class: 'pz-select size', 'aria-label': 'Shot size', onchange: e => { api.size(e.target.value); showGuide(); } });
    sizes.addEventListener('focus', showGuide);
    for (const s of api.SIZES) sizes.append(el('option', { value: s.id, text: s.label, selected: S.size === s.id }));
    return sizes;
  }

  // ---------------------------------------------------------------- the bar: undo, redo, the tools, save, load, help, the Shot, the strip
  const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', async () => { const f = file.files?.[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!api.fromJSON(j)) toast('That file is not a Pose Editor scene.'); else toast('Loaded ' + f.name); } catch { toast('That file could not be read.'); } file.value = ''; });
  function drawBar() {
    bar.replaceChildren();
    const toolBtn = (id, icon, label) => iconBtn(icon, label, () => api.tool(S.tool === id && id !== 'pose' ? 'pose' : id), { class: 'tool' + (S.tool === id ? ' on' : ''), attrs: { 'aria-pressed': S.tool === id ? 'true' : 'false' } });
    const shotBtn = el('button', { type: 'button', class: 'pz-shot', 'aria-label': 'Take the Shot (P)', title: 'Take the Shot (P)', html: ICON.camera + (phone() ? '' : '<span>Shot</span>'), onclick: () => api.shot() });
    const undo = iconBtn('undo', 'Undo (Ctrl+Z)', () => api.undo(-1), { attrs: { disabled: !api.canUndo } }), redo = iconBtn('redo', 'Redo (Ctrl+Y)', () => api.undo(1), { attrs: { disabled: !api.canRedo } });
    if (phone()) {
      // the essentials: undo, redo, the mode (pose -> draw -> sculpt), mirror, the Shot, and the menu for everything else
      const cyc = { pose: 'draw', draw: 'sculpt', sculpt: 'pose' }, t = TOOLS.find(x => x[0] === S.tool) || TOOLS[0];
      bar.append(undo, redo,
        iconBtn(t[1], `Mode: ${t[2]} (tap for ${(TOOLS.find(x => x[0] === (cyc[S.tool] || 'pose')) || TOOLS[0])[2]})`, () => api.tool(cyc[S.tool] || 'pose'), { class: 'tool on' }),
        iconBtn('mirror', 'Mirror the pose', () => api.mirror(), { attrs: { disabled: !api.cur } }),
        iconBtn('panel', 'Panels', () => openPage(page && page !== 'menu' ? null : (api.cur ? tab : 'scene')), { class: page && page !== 'menu' ? 'on' : '' }),
        iconBtn('menu', 'More', () => openPage(page === 'menu' ? null : 'menu'), { class: page === 'menu' ? 'on' : '' }),
        shotBtn, file);
      drawGuide();
      return;
    }
    const sizes = sizeSelect();
    const strip = el('div', { class: 'pz-strip', 'aria-label': 'This session\'s shots' });
    api.shots.forEach(s => {
      const a = el('a', { href: s.url, download: s.name, class: 'pz-thumb', title: s.name, 'aria-label': 'Download ' + s.name });
      a.append(el('img', { src: s.url, alt: '' }));
      strip.append(a);
    });
    bar.append(undo, redo, el('span', { class: 'pz-sep' }),
      ...TOOLS.map(([id, icon, label]) => toolBtn(id, icon, label + ' (' + TOOL_KEY[id] + ')')),
      el('span', { class: 'pz-sep' }),
      iconBtn('snap', 'Snap turns to 15 degrees', () => api.snap(!S.snap), { class: S.snap ? 'on' : '', attrs: { 'aria-pressed': S.snap ? 'true' : 'false' } }),
      iconBtn('mirror', 'Mirror the pose (M)', () => api.mirror(), { attrs: { disabled: !api.cur } }),
      iconBtn('thirds', 'Rule of thirds (G)', () => api.thirds(!S.thirds), { class: S.thirds ? 'on' : '', attrs: { 'aria-pressed': S.thirds ? 'true' : 'false' } }),
      iconBtn('onion', 'Onion skin: the last beat ghosted (O)', () => api.onion(!S.onion), { class: S.onion ? 'on' : '', attrs: { 'aria-pressed': S.onion ? 'true' : 'false' } }),
      iconBtn('beat', 'Next beat: copy the scene (N)', () => api.nextBeat()),
      el('span', { class: 'pz-sep' }),
      iconBtn('save', 'Save the scene to a file', () => api.saveFile()),
      iconBtn('load', 'Load a scene file', () => file.click()),
      iconBtn('help', 'How it works (?)', () => help(true)),
      el('span', { class: 'pz-sep' }),
      sizes, shotBtn, strip, file);
    drawGuide();
  }
  // the frame guide: a thin outline of the Shot's shape; the rest dimmed only while the size is being chosen
  let guideT = 0;
  function showGuide() { guide.classList.add('choose'); clearTimeout(guideT); guideT = setTimeout(() => guide.classList.remove('choose'), 2500); }
  function drawGuide() {
    const s = api.SIZES.find(x => x.id === S.size) || api.SIZES[0], W = innerWidth, H = innerHeight, a = s.w / s.h;
    let w = W, h = W / a; if (h > H) { h = H; w = H * a; }
    guide.style.width = w + 'px'; guide.style.height = h + 'px'; guide.style.left = (W - w) / 2 + 'px'; guide.style.top = (H - h) / 2 + 'px';
    guide.classList.toggle('thirds', !!S.thirds);
  }
  addEventListener('resize', drawGuide);

  // ---------------------------------------------------------------- toast and help
  let toastT = 0;
  function toast(t, ms = 2600) { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms); }
  const HELP = [
    ['Pick a scene', 'The Scene menu (on a phone: the panels button, then Scene). The camera stays inside the scene. Saved views jump the camera; Save view keeps yours.'],
    ['Camera', 'Drag the picture to look round. Right-drag (or Shift-drag) to slide. Wheel to move in and out, Ctrl+wheel for the lens. On a touch screen one finger turns, two pinch. With a pen, hold the barrel button and drag to turn.'],
    ['People', 'Add up to five. Click someone to pose them (or 1 to 5, Tab for the next). Drag the green ring at their feet to move them, the yellow knob to turn them.'],
    ['Draw to pose (D)', 'The pen draws; in the Draw tool a mouse does too. Draw from a shoulder or hip to where the hand or foot goes: the arm or leg follows, bending where your line bends. Draw a line of action up the spine to curve the body. A short flick from a hand or foot points it. Draw from the eyes to anything to set the look; on the face, a mouth curve or a brow line. Pick a part in the Draw tab, or start on the part. Light pressure nudges, firm pressure snaps.'],
    ['Sculpt (S)', 'Grab, push or pull, smooth, pinch, squash and stretch, and a face brush for big expressions. Pen pressure is the strength, two fingers (or [ and ]) the size, Mirror works both sides. Reset brush and Clear sculpt undo it. It is kept with the scene, never in the game.'],
    ['Quick sketch (K)', 'Draw a stick figure on the ground: a circle head, a spine and four limbs. The person chosen in the Draw tab is placed and posed to match.'],
    ['Frame (F) and light', 'Frame: draw a box round what the shot should hold and the camera moves to fit it. G shows the rule of thirds. Light tool: draw from where the light comes to what it lights.'],
    ['Joints', 'White dots are joints. Click one and drag a ring: red, green, blue. Shift snaps to 15 degrees. R resets the joint.'],
    ['Hands and feet', 'Drag a pink cube and the arm or leg follows (IK). Drag the blue cone to point the elbow or knee. Pin a foot and it stays on the floor while you move the hips.'],
    ['Eyes', 'Look tab: at the camera, at another person, or Pick a spot (L) and click anything. The head follows by the share you set.'],
    ['Library and beats', 'Library keeps a pose with its face under a name, to put on anyone (mirrored too). Next beat (N) copies the scene for the next frame; the onion skin (O) ghosts the beat before; In-between makes the halfway pose.'],
    ['Light', 'Set the time and the weather, aim the key light on the compass, add a fill and a rim, switch the lamps, the haze and the exposure.'],
    ['Shot and storyboard', 'Pick a size and press Shot (P): the picture downloads with no handles in it. Beats: Shoot every beat, write a note under each, and Export the sheet for one contact sheet of the lot.'],
    ['Keep it', 'Save writes the whole scene (poses, sculpts, beats) to a file and Load brings it back. The browser keeps your last scene too. Ctrl+Z undoes, Ctrl+Y redoes, M mirrors. Two fingers tapped undo, three redo; the pen\'s barrel button pressed alone undoes.'],
  ];
  function help(on) {
    helpEl.hidden = !on;
    if (!on) return;
    helpEl.replaceChildren(el('h2', { text: 'The Pose Editor' }), el('dl', {}, ...HELP.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      el('button', { type: 'button', class: 'pz-btn', text: 'Got it', onclick: () => help(false) }));
    helpEl.querySelector('button').focus();
  }
  helpEl.addEventListener('keydown', e => { if (e.key === 'Escape') help(false); });

  function refresh() { drawLeft(); drawRight(); drawSheet(); drawBar(); }
  return {
    refresh, toast, help, openPage, get page() { return page; }, get phone() { return phone(); },
    drawing(on) { root.classList.toggle('pz-drawing', !!on); },
    refreshCam() { const l = left.querySelector('.pz-lens input') || sheet.querySelector('.pz-lens input'); if (l) { l.value = fovToMm(S.cam.fov); l.closest('.pz-row').querySelector('output').textContent = l.value; } },
  };
}
