// The fishing HUD: cue bar, bite "!", wind-up meter, catch card, Kevin's dialogue, hover card and the touch button.
// All DOM, built once, text through textContent only. Styles are in css/fishing.css.
import { el } from './util.js';
import { fishSVG, junkSVG, iconSVG } from './fish-art.js';
import { SPECIES, nameOf, fmtTime } from './fish-data.js';

// Kevin's portrait: brown work jacket, thinning grey hair feathered back, stubble and a big toothy grin.
const KEVIN_FACE = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M6 64 Q8 48 22 45 L42 45 Q56 48 58 64 Z" fill="#5a4230" stroke="#2b2340" stroke-width="3" stroke-linejoin="round"/>' +
  '<path d="M24 45 L32 60 L40 45 Z" fill="#d8c5a2" stroke="#2b2340" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<path d="M28 46 L32 53 L36 46 Z" fill="#f4f1ea"/>' +
  '<ellipse cx="32" cy="29" rx="16" ry="19" fill="#e3ae8b" stroke="#2b2340" stroke-width="3"/>' +
  // feathered 80s hair combed back over the ears, thinning on top
  '<path d="M14 31 q-5 -17 8 -22 q10 -5 21 0 q12 5 8 22 q-2 -7 -7 -8 q-2 5 -7 2 q-4 4 -8 0 q-4 3 -7 -1 q-4 1 -6 6 q-1 -2 -2 1z" fill="#c2beb7" stroke="#2b2340" stroke-width="2.6" stroke-linejoin="round"/>' +
  '<path d="M16 24 q-2 7 0 13 M48 24 q2 7 0 13" fill="none" stroke="#2b2340" stroke-width="2" stroke-linecap="round"/>' +
  '<path d="M22 12 q10 -4 20 0 q-10 1 -20 0z" fill="#d9c6b0" opacity="0.7"/>' +
  '<path d="M19 15 q5 -3 10 -1 M35 13 q5 -2 9 2 M17 20 q3 -3 6 -2" fill="none" stroke="#e2dfda" stroke-width="2" stroke-linecap="round"/>' +
  '<path d="M18 36 q2 11 14 12 q12 -1 14 -12 q-4 6 -14 7 q-10 -1 -14 -7z" fill="#cfa487" opacity="0.8"/>' +
  '<path d="M22 24 q3 -2 6 0 M36 24 q3 -2 6 0" fill="none" stroke="#6f655b" stroke-width="2.4" stroke-linecap="round"/>' +
  '<circle cx="25" cy="28.5" r="2.3" fill="#2b2340"/><circle cx="39" cy="28.5" r="2.3" fill="#2b2340"/>' +
  '<path d="M19 27 l-3 -1 M19 30 l-3 1 M45 27 l3 -1 M45 30 l3 1" stroke="#b07a60" stroke-width="1.6" stroke-linecap="round"/>' +
  '<ellipse cx="21" cy="34" rx="3" ry="1.8" fill="#e98f7a" opacity="0.6"/><ellipse cx="43" cy="34" rx="3" ry="1.8" fill="#e98f7a" opacity="0.6"/>' +
  '<path d="M30 31 q2 3 4 0" fill="none" stroke="#b86f58" stroke-width="2" stroke-linecap="round"/>' +
  '<path d="M22 36 q10 3 20 0 q-1 9 -10 9 q-9 0 -10 -9z" fill="#5c2431" stroke="#2b2340" stroke-width="2.4" stroke-linejoin="round"/>' +
  '<path d="M23.5 37 q8.5 2.5 17 0 l-0.8 3 q-7.7 2 -15.4 0z" fill="#fbf7ec"/>' +
  '<path d="M23 34 q-2 3 -1 6 M41 34 q2 3 1 6" fill="none" stroke="#b07a60" stroke-width="1.6" stroke-linecap="round"/></svg>';

export function createFishUI(ctx) {
  const hud = ctx.hud;
  const svg = (parent, markup) => { parent.innerHTML = markup; return parent; };
  const ui = {};

  // ---------------------------------------------------------------- counter: hud-currency.js shows fish and treats
  ui.counter = {
    set(fish, toTreat, treats, show) { ctx.currency?.set(fish, treats, toTreat); },
    pop() { ctx.currency?.pop('fish'); },
  };

  // ---------------------------------------------------------------- cue bar (above the hotbar)
  const cue = el('div', 'fish-cue', '', { 'aria-live': 'polite' });
  cue.hidden = true;
  const cueText = el('span', 'cue-text');
  const cueBar = el('span', 'cue-bar'); const cueFill = el('span', 'cue-fill'); cueBar.append(cueFill);
  cue.append(cueText, cueBar);
  hud.append(cue);
  let cueKey = '';
  ui.cue = {
    show(text, kind = '', progress = -1) {
      const key = text + '|' + kind;
      if (key !== cueKey) { cueKey = key; cueText.textContent = text; cue.className = 'fish-cue ' + kind; }
      cueBar.hidden = progress < 0;
      if (progress >= 0) cueFill.style.width = Math.round(progress * 100) + '%';
      cue.hidden = false;
    },
    hide() { cue.hidden = true; cueKey = ''; },
  };

  // ---------------------------------------------------------------- bite !
  const bang = el('div', 'fish-bang', '!');
  bang.hidden = true;
  hud.append(bang);
  ui.bang = {
    show() { bang.hidden = false; bang.classList.remove('go'); void bang.offsetWidth; bang.classList.add('go'); },
    hide() { bang.hidden = true; },
  };

  // ---------------------------------------------------------------- wind-up meter (pinned over the player by the caller)
  const meter = el('div', 'fish-meter');
  const mFill = el('span', 'fm-fill'); const mLabel = el('span', 'fm-label', '0 m');
  const mTrack = el('span', 'fm-track'); mTrack.append(mFill);
  meter.append(mTrack, mLabel);
  ui.meter = {
    node: meter,
    set(k, metres, ok) {
      mFill.style.width = Math.round(k * 100) + '%';
      mLabel.textContent = ok ? `${Math.round(metres)} m` : 'no water there';
      meter.classList.toggle('bad', !ok);
      meter.classList.toggle('full', k >= 0.995);
    },
  };

  // ---------------------------------------------------------------- catch card
  const card = el('div', 'fish-card panel', '', { role: 'status' });
  card.hidden = true;
  const kArt = el('div', 'fk-art'); const kBody = el('div', 'fk-body');
  const kKick = el('div', 'fk-kicker'); const kName = el('div', 'fk-name'); const kSize = el('div', 'fk-size'); const kNote = el('div', 'fk-note');
  const kWhere = el('div', 'fk-where');   // which water it came out of (fish-regions.js)
  kBody.append(kKick, kName, kSize, kWhere, kNote);
  card.append(kArt, kBody);
  hud.append(card);
  let cardTimer = 0;
  ui.card = {
    show({ id, cm, junk, record, first, treat, extra, region }, secs = 4) {
      kWhere.textContent = region && !junk ? region.name : '';
      kWhere.hidden = !kWhere.textContent;
      if (region) kWhere.style.setProperty('--rc', region.color);
      kArt.innerHTML = junk ? junkSVG(id) : fishSVG(id);
      kKick.textContent = junk ? 'Hmm, junk!' : first ? 'First of its kind!' : 'You caught a';
      kName.textContent = nameOf(id);
      kSize.textContent = junk ? extra || '' : `${cm} cm`;
      kNote.textContent = record ? 'New personal best!' : treat ? 'That is 10! A dog treat is yours.' : (extra && !junk ? extra : '');
      card.classList.toggle('junk', !!junk); card.classList.toggle('record', !!record || !!treat || id === 'golden');
      card.hidden = false; card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      clearTimeout(cardTimer); cardTimer = setTimeout(() => ui.card.hide(), secs * 1000);
    },
    hide() { card.hidden = true; clearTimeout(cardTimer); },
    get open() { return !card.hidden; },
  };

  // ---------------------------------------------------------------- dialogue (Kevin)
  const dlg = el('div', 'fish-dialog panel', '', { role: 'dialog', 'aria-label': 'Kevin' });
  dlg.hidden = true;
  const dFace = svg(el('div', 'fd-face'), KEVIN_FACE);
  const dBox = el('div', 'fd-box'); const dName = el('div', 'fd-name', 'Kevin'); const dText = el('div', 'fd-text');
  const dHint = el('div', 'fd-hint', '');
  dBox.append(dName, dText, dHint);
  dlg.append(dFace, dBox);
  dlg.onclick = () => ui.dialog.onClick?.();
  hud.append(dlg);
  ui.dialog = {
    onClick: null,
    open(name) { dName.textContent = name; dlg.hidden = false; dlg.classList.remove('in'); void dlg.offsetWidth; dlg.classList.add('in'); },
    text(t) { dText.textContent = t; },
    hint(t) { dHint.textContent = t; },
    close() { dlg.hidden = true; },
    get isOpen() { return !dlg.hidden; },
    talking(v) { dFace.classList.toggle('talk', v); },
  };

  // ---------------------------------------------------------------- hover card
  const hov = el('div', 'fish-hover panel');
  hov.hidden = true;
  const hName = el('div', 'fh-name'); const hFish = el('div', 'fh-row'); const hTime = el('div', 'fh-row'); const hSwing = el('div', 'fh-row');
  const hFishIcon = svg(el('span', 'fh-ic'), iconSVG('fish'));
  const hFishTxt = el('span'); hFish.append(hFishIcon, hFishTxt);
  hov.append(hName, hFish, hTime, hSwing);
  hud.append(hov);
  ui.hover = {
    show(x, y, { name, color, fish, secs, swing, self, rod }) {
      hName.textContent = self ? `${name} (you)` : name;
      hName.style.setProperty('--c', color || '#ffd34d');
      const has = fish > 0 || secs >= 30;
      hFishTxt.textContent = has ? `${fish} fish caught` : rod ? 'Has not landed a fish yet' : 'Has not been fishing yet';
      hTime.textContent = has || secs > 0 ? `Time fishing: ${fmtTime(secs)}` : '';
      hTime.hidden = !hTime.textContent;
      hSwing.textContent = swing > 0 ? `Best swing ${Number(swing).toFixed(1)} m` : '';
      hSwing.hidden = !hSwing.textContent;
      hov.hidden = false;
      const w = hov.offsetWidth || 190, h = hov.offsetHeight || 90;
      const left = Math.min(innerWidth - w - 8, Math.max(8, x + 34)), top = Math.min(innerHeight - h - 8, Math.max(8, y - h - 12));
      hov.style.transform = `translate(${left}px, ${top}px)`;
    },
    hide() { if (!hov.hidden) hov.hidden = true; },
    get open() { return !hov.hidden; },
  };

  // ---------------------------------------------------------------- touch: one big Cast / Reel button
  const tb = el('button', 'fish-touch-btn', 'Cast', { type: 'button', 'aria-label': 'Cast or reel' });
  tb.hidden = true;
  hud.append(tb);
  ui.touch = { btn: tb, label(t) { if (tb.textContent !== t) tb.textContent = t; }, show(v) { tb.hidden = !v; } };

  return ui;
}

export { SPECIES };
