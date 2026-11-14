// The Sound page of Settings (index.html #help [data-page=sound]): Master / Effects / Ambience / Voices / Music sliders over AudioEngine.setLevel.
// Values persist in localStorage (store key 'mix', 0..1.5 each, 1 = as mixed). The mute button and M are separate.
import { el, loadCss } from './util.js';

const ROWS = [
  ['master', 'Master', 'Everything'],
  ['sfx', 'Effects', 'Footsteps, splashes, the swing, pops'],
  ['amb', 'Ambience', 'Wind, waves, birds, the areas'],
  ['voices', 'Voices', 'Chatter, dogs and unicorns'],
  ['music', 'Music', 'Our own tunes: the yard, the shops, fishing, the boat'],   // the master mute mutes it too
];

export function mountMixer(audio, store) {
  const panel = document.querySelector('#help [data-page="sound"] .set-body');
  if (!panel || panel.querySelector('.mix')) return null;
  loadCss('/css/audio.css');
  const saved = store.get('mix', {}) || {};
  for (const [k] of ROWS) if (Number.isFinite(saved[k])) audio.setLevel(k, saved[k]);

  const box = el('div', 'mix', '', { role: 'group', 'aria-labelledby': 'mix-title' });
  const head = el('div', 'mix-head');
  head.append(el('h3', '', 'Levels', { id: 'mix-title' }));
  const reset = el('button', 'mix-reset', 'Reset', { type: 'button', title: 'Put every level back' });
  head.append(reset);
  box.append(head);
  const grid = el('div', 'mix-grid');
  const inputs = {};
  let previewAt = 0;
  const preview = k => { // a little sound on release so you hear the new level (only once sound is running)
    if (!audio.ready || audio.muted || performance.now() - previewAt < 250) return;
    previewAt = performance.now();
    if (k === 'voices') { const L = audio.listener; audio.speak(L.x, L.y, L.z - 1.5, 'Hi!', { pitch: 162, formant: 1.03 }); }
    else if (k !== 'amb' && k !== 'music') audio.ui('pop');
  };
  const save = () => { const o = {}; for (const [k] of ROWS) o[k] = audio.levels[k]; store.set('mix', o); };
  for (const [k, label, hint] of ROWS) {
    const id = 'mix-' + k;
    const cell = el('div', 'mix-cell');
    const top = el('div', 'mix-top');
    const lab = el('label', '', label, { for: id, title: hint });
    const out = el('output', 'mix-val', '', { for: id });
    top.append(lab, out);
    const r = el('input', '', '', { type: 'range', id, min: '0', max: '150', step: '5', 'aria-describedby': id + '-hint' });
    const small = el('span', 'mix-hint', hint, { id: id + '-hint' });
    const show = () => { const v = Math.round(audio.levels[k] * 100); r.value = String(v); out.textContent = v + '%'; r.setAttribute('aria-valuetext', v + ' percent'); };
    r.addEventListener('input', () => { audio.setLevel(k, Number(r.value) / 100); show(); save(); });
    r.addEventListener('change', () => preview(k));
    r.addEventListener('keydown', e => { if (e.key === 'Escape') r.blur(); }); // the next Escape closes the panel
    inputs[k] = show;
    show();
    cell.append(top, r, small);
    grid.append(cell);
  }
  box.append(grid);
  reset.onclick = () => { for (const [k] of ROWS) { audio.setLevel(k, 1); inputs[k](); } save(); preview('sfx'); };
  panel.append(box);
  return box;
}
