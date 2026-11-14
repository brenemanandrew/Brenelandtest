// The cross pad (the plus-shaped four-way pad right of the chat): the DOM half. inventory.js owns what sits on each arm
// and calls setArm() / pop() / flash(); clicks and taps come back through onPress(dir). Mostly transparent while empty.
// Directions are 0 up, 1 right, 2 down, 3 left (the gamepad's D-pad and the Z X C V keys in that order).
import { el } from './util.js';
import { setIcon } from './fish-art.js';

export const DIRS = ['up', 'right', 'down', 'left'];
export const DIR_ARROWS = ['↑', '→', '↓', '←'];
export const DIR_KEYS = ['Z', 'X', 'C', 'V'];

export function createCrosspad(ctx, { onPress }) {
  const root = document.getElementById('crosspad');
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const arms = DIRS.map((dir, i) => {
    const b = el('button', 'cp-arm empty', '', { type: 'button', 'data-dir': dir, 'aria-label': 'Empty arm' });
    const ic = el('span', 'cp-icon'); const ct = el('span', 'cp-count'); const key = el('span', 'cp-key', touch ? '' : DIR_KEYS[i]); const ar = el('span', 'cp-arrow');
    b.append(ic, ct, key, ar);
    b.onclick = () => { onPress(i); b.blur(); }; // blur: a focused button would also catch the next Space press
    root.append(b);
    return { b, ic, ct, id: '' };
  });
  root.append(el('span', 'cp-hub'));
  let reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no matchMedia */ }

  return {
    // item: { id, name, stackable } | null; count for stackables; on = equipped
    setArm(i, item, count, on) {
      const a = arms[i];
      const id = item ? item.id : '';
      if (a.id !== id) { a.id = id; a.ic.replaceChildren(); if (item) setIcon(a.ic, item.id); }
      a.b.classList.toggle('empty', !item);
      a.b.classList.toggle('on', !!item && on);
      a.ct.textContent = item && item.stackable ? String(count) : '';
      a.b.title = item ? `${item.name}${touch ? '' : ' (' + DIR_KEYS[i] + ', D-pad ' + DIRS[i] + ')'}` : '';
      a.b.setAttribute('aria-label', item ? `${item.name}${item.stackable ? ', ' + count : ''}${on ? ', in hand' : ''}` : 'Empty arm');
      root.classList.toggle('has', arms.some(x => x.id));
    },
    pop(i) { if (reduced) return; const b = arms[i]?.b; if (!b) return; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); },
    flash(ms) { root.classList.add('flash'); setTimeout(() => root.classList.remove('flash'), ms); },
    root,
  };
}
