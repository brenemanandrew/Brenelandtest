// Fish (the lobby's currency) and dog treats: two small pills, each placed on its own by hud-layout.js ("fish", "treats"),
// with counts that bounce when they change. fishing.js feeds it through fish-ui.js (ui.counter -> ctx.currency). Hover or
// tap a chip for "N more fish to a treat". Text goes in through textContent, the icons are constant SVG (fish-art.js).
// (no-coins, 2026-11-09: the coins pill hud3 added is gone; Andrew: coins are not a currency in Breneland. Nothing ever paid or spent them)
import { el } from './util.js';
import { iconSVG } from './fish-art.js';

export function createCurrency(ctx) {
  const root = document.getElementById('currency');
  const chips = {};
  const make = (id, color, label) => {
    const c = el('div', 'cur', '', { tabindex: '0', role: 'status', 'aria-label': label, 'data-id': id });
    c.style.setProperty('--c', color);
    const ic = el('span', 'cur-ic'); ic.innerHTML = iconSVG(id); // constant markup
    const n = el('b', 'cur-n', '0'); const tip = el('span', 'cur-tip', '');
    c.append(ic, n, tip);
    c.onclick = () => { c.classList.toggle('tip-up', c.getBoundingClientRect().top > innerHeight / 2); c.classList.toggle('tip'); setTimeout(() => c.classList.remove('tip'), 2600); };
    root.append(c);
    chips[id] = { c, n, tip, v: 0 };
    return chips[id];
  };
  make('fish', '#bfe6f7', 'Fish');
  make('treat', '#ffe08a', 'Dog treats');
  let reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no matchMedia */ }

  function bounce(chip, delta) {
    if (reduced) return;
    chip.c.classList.remove('pop'); void chip.c.offsetWidth; chip.c.classList.add('pop');
    if (delta > 0) { const f = el('span', 'cur-float', '+' + delta); chip.c.append(f); setTimeout(() => f.remove(), 1200); }
  }
  function put(id, v, tipText) {
    const chip = chips[id];
    v = Math.max(0, v | 0);
    if (v !== chip.v) { bounce(chip, v - chip.v); chip.v = v; chip.n.textContent = String(v); }
    if (chip.tip.textContent !== tipText) chip.tip.textContent = tipText;
    chip.c.setAttribute('aria-label', `${v} ${id === 'fish' ? 'fish' : 'dog treat' + (v === 1 ? '' : 's')}. ${tipText}`);
  }

  const api = {
    // fish caught (and earned), how many more to the next treat, treats in the pocket
    set(fish, treats, toTreat) {
      put('fish', fish, toTreat === 10 && fish === 0 ? 'Fish are what Breneland runs on. Kevin at the pier can get you started.' : `${toTreat} more fish to a dog treat`);
      put('treat', treats, treats > 0 ? 'Equip a treat on the cross pad and throw it for Dax or Nala' : 'Every 10th fish is a dog treat');
      root.hidden = false;
    },
    pop(id = 'fish') { const chip = chips[id]; if (chip) bounce(chip, 0); },
    get fish() { return chips.fish.v; },
    get treats() { return chips.treat.v; },
  };
  api.set(0, 0, 10);
  return api;
}
