// Beneath Angell Street: two lines on Settings > Controls for the phone controls below, the look drag speed and the look assist
// (the view eases round bends while you walk and aren't looking). Saved in localStorage like the rest of Settings. The yard's phone
// controls don't read these, they stay as they are.
import { el } from './util.js';

const K_SPEED = 'breneland.lookSpeedTouch', K_ASSIST = 'breneland.lookAssist';
export const SPEED = { min: 0.5, max: 2, step: 0.1, dflt: 1 };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

// the look speed for touch (x the base; 0.5 .. 2)
export function lookSpeed() { const v = Number(read(K_SPEED, SPEED.dflt)); return Number.isFinite(v) ? Math.max(SPEED.min, Math.min(SPEED.max, v)) : SPEED.dflt; }
// the look assist: what you chose, else off (a view that turns on its own felt like fighting the game)
export function lookAssist() { const v = read(K_ASSIST, null); return v === true; }

// Settings > Controls: the two lines under the key hints switch
export function mountMazeSettings({ input, audio } = {}) {
  const page = document.querySelector('#help [data-page="controls"]');
  if (!page || page.querySelector('.mz-set-look')) return null;
  // the look assist switch
  const aLine = el('div', 'set-line mz-set-assist');
  const aTxt = el('span', 'set-line-t');
  aTxt.append(el('b', '', 'Look assist'), el('small', '', 'Beneath Angell Street: the view turns with the corridor as you walk'));
  const aBtn = el('button', 'set-switch', '', { type: 'button', role: 'switch', 'aria-label': 'Look assist', id: 'btn-look-assist' });
  aBtn.append(el('span', '', ''));
  aLine.append(aTxt, aBtn);
  // the look speed slider (touch)
  const sLine = el('div', 'set-line mz-set-look');
  const sTxt = el('label', 'set-line-t', '', { for: 'rng-look-speed' });
  sTxt.append(el('b', '', 'Look speed on a phone'), el('small', '', 'Beneath Angell Street: how far a drag turns you'));
  const box = el('span', 'mz-set-range');
  const rng = el('input', '', '', { type: 'range', id: 'rng-look-speed', min: String(SPEED.min), max: String(SPEED.max), step: String(SPEED.step), 'aria-label': 'Look speed on a phone' });
  const out = el('output', 'mz-set-val', '', { for: 'rng-look-speed' });
  box.append(rng, out);
  sLine.append(sTxt, box);
  const after = page.querySelector('.ctl-kc');
  if (after) after.after(sLine, aLine); else page.append(sLine, aLine);
  const paint = () => {
    const on = lookAssist();
    aBtn.setAttribute('aria-checked', String(on)); aBtn.firstElementChild.textContent = on ? 'On' : 'Off';
    const v = lookSpeed(); rng.value = String(v); out.textContent = v.toFixed(1) + 'x';
  };
  aBtn.addEventListener('click', () => { write(K_ASSIST, !lookAssist()); paint(); audio?.ui?.('blip'); });
  rng.addEventListener('input', () => { write(K_SPEED, Math.round(Number(rng.value) * 10) / 10); paint(); });
  paint();
  return { paint, assistBtn: aBtn, speed: rng };
}
