// A still copy of the D&D table for the HUD Editor's "D&D table" screen (editor/dnd-layout-editor.js): the same markup and classes
// as dnd.js builds, with stub words (a party of three, a passage, Brannoc's strip, the tools), skinned by the game's own dnd.css
// and placed by the same layout numbers (dnd-layout.js applyLayout), so what Andrew moves is what he gets at the table. Behind it a
// drawing of the back room with the DM's face where the camera puts it (faceFraction), to keep it clear.
import { ICON, SEAL, ico } from './dnd-icons.js';
import { applyLayout, faceFraction } from './dnd-layout.js';

const h = (tag, cls, text, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const word = t => h('span', 'dnd-word', t);
const tool = (icon, text, cls = '') => { const b = h('button', 'dnd-btn dnd-tool ' + cls, '', { type: 'button', tabindex: '-1', 'aria-label': text }); b.append(ico(icon), word(text)); return b; };
const PARTY = [['Brannoc', '#a3281f', 14, 14], ['Pip', '#25633f', 7, 9], ['Elowen', '#2d5c96', 8, 8]];
const LINES = [
  ['k-dm', '', 'The road to Mossbrook winds down between tall reeds. Fireflies drift over the water, but the great lantern on the old mill is dark tonight. What do you do?'],
  ['k-say to-dm', 'Pip Thistledown: ', 'I look around for tracks.', '#25633f'],
  ['k-dm npc', 'Old Croak: ', 'Please, please hurry!'],
  ['k-roll ok', '', 'Pip Thistledown rolls perception: 14 +3 = 17 vs DC 12, success', '#25633f'],
  ['k-say', 'Elowen Brightleaf (table): ', 'Anyone got snacks?', '#2d5c96'],
];

// the DM in his chair, a drawing: a hood, a face, a long white beard (just to see where his face lands)
const DM_SVG = '<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M50 4C24 4 12 26 12 52v62h76V52C88 26 76 4 50 4z" fill="#1f2f6a" stroke="#0d1430" stroke-width="3"/><ellipse cx="50" cy="50" rx="25" ry="27" fill="#f4c7a1" stroke="#2b2017" stroke-width="2.5"/><path d="M27 58c4 30 14 50 23 54 9-4 19-24 23-54-8 8-15 10-23 10s-15-2-23-10z" fill="#f6f1e6" stroke="#2b2017" stroke-width="2.5"/><circle cx="41" cy="46" r="3" fill="#2b2017"/><circle cx="59" cy="46" r="3" fill="#2b2017"/></svg>';

export function buildMock() {
  const scene = h('div', 'dnd-mock-room'); const dm = h('div', 'dnd-mock-dm'); dm.innerHTML = DM_SVG; scene.append(dm);
  const view = h('div', 'dnd-mock-view'); view.innerHTML = ICON.eye;
  const root = h('div', 'dnd', '', { role: 'presentation' });
  const top = h('div', 'dnd-top'), chip0 = h('div', 'dnd-dmchip'); chip0.append(h('b', '', 'DM: Claude'));
  const party = h('div', 'dnd-party');
  for (const [n, c, hp, max] of PARTY) { const ch = h('div', 'dnd-chip' + (n === 'Brannoc' ? ' me' : '')); ch.style.setProperty('--c', c); const bar = h('i', 'hp'), fill = h('i', 'fill'); fill.style.width = Math.round(100 * hp / max) + '%'; bar.append(fill); ch.append(h('b', '', n), bar, h('small', '', `${hp}/${max}`)); party.append(ch); }
  top.append(chip0, party);
  const log = h('div', 'dnd-log'), head = h('div', 'dnd-log-head'); head.append(ico('book'), h('b', '', 'The Lantern at Mossbrook'), h('small', '', 'Everyone 10+'));
  const narr = h('div', 'dnd-narr');
  for (const [k, b, t, c] of LINES) { const d = h('div', 'dnd-line ' + k); if (c) d.style.setProperty('--c', c); if (k.includes('roll')) d.append(h('i', 'dnd-d20')); if (b) d.append(h('b', '', b)); d.append(document.createTextNode(t)); narr.append(d); }
  log.append(head, narr);
  const pop = h('div', 'dnd-pop'), ask = h('div', 'dnd-ask'), roll = h('button', 'dnd-roll-big', '', { type: 'button', tabindex: '-1' });
  roll.append(ico('die20'), word('Roll '), h('b', 'dnd-roll-n', 'd20 +3'));
  const askText = h('div', 'dnd-ask-text'); askText.append(h('b', '', 'Perception'), h('span', '', 'The DM asks: to spot the tiny footprints'), h('small', '', 'Hold the d20 to throw further'));
  ask.append(roll, askText); ask.hidden = true;
  const last = h('div', 'dnd-last', 'Last roll: Pip Perception 17, success'), dice = h('button', 'dnd-btn dnd-dice-btn', '', { type: 'button', tabindex: '-1' }); dice.append(ico('d20'));
  pop.append(ask, last, dice);
  const me = h('div', 'dnd-me'), card = h('div', 'dnd-card'), strip = h('div', 'dnd-me-strip'); strip.style.setProperty('--c', '#a3281f');
  const st = h('div', 'dnd-strip-top'); st.append(h('b', 'dnd-name', 'Brannoc Stonebrew'), h('span', 'dnd-hp', 'HP 14/14'), h('span', 'dnd-acv', 'AC 18'));
  const mods = h('div', 'dnd-mods'); for (const [k, v] of [['STR', '+3'], ['DEX', '+1'], ['CON', '+3'], ['INT', '+0'], ['WIS', '+1'], ['CHA', '-1']]) { const m = h('span', 'dnd-mini'); m.append(h('small', '', k), h('b', '', v)); mods.append(m); }
  strip.append(st, mods); card.append(strip); me.append(card);
  const talk = h('div', 'dnd-talk'), say = h('div', 'dnd-say'), to = h('div', 'dnd-to on'); to.append(ico('swords'), h('span', 'short', 'DM'));
  const input = h('input', 'dnd-input', '', { type: 'text', placeholder: 'What do you do?', tabindex: '-1', readonly: '' });
  const mic = h('button', 'dnd-mic', '', { type: 'button', tabindex: '-1' }); mic.append(ico('mic'));
  const send = h('button', 'dnd-send', '', { type: 'button', tabindex: '-1' }); send.append(ico('send'));
  say.append(to, input, mic); talk.append(say, send);
  const seal = h('div', 'dnd-seal'); seal.innerHTML = SEAL;
  const tools = h('div', 'dnd-topbtns dnd-tools');
  tools.append(tool('book', 'Adventure'), tool('scroll', 'Character sheet'), tool('micDot', 'Mic: on your turn'), tool('moon', 'End the night'), tool('cog', 'Game settings'));
  const panel = h('div', 'dnd-panel'); panel.append(log, pop, me, talk);
  root.append(h('div', 'dnd-panel-bg'), top, panel, seal, tools);
  // the wheel's buttons on their arcs (dnd.js layWheel, the same sums)
  function layWheel(W) {
    const shown = [...tools.children], n = shown.length, inner = n > 4 ? Math.floor(n / 2) : n;
    shown.forEach((b, i) => {
      const ring = i < inner ? 0 : 1, k = ring ? i - inner : i, m = ring ? n - inner : inner;
      const r = ring || n <= 4 ? W.r * (n <= 4 && !ring ? 0.72 : 1) : W.r * 0.57, a = (m === 1 ? (W.a0 + W.a1) / 2 : W.a0 + k * ((W.a1 - W.a0) / (m - 1))) * Math.PI / 180;
      b.style.setProperty('--wx', Math.round(Math.cos(a) * r) + 'px'); b.style.setProperty('--wy', Math.round(-Math.sin(a) * r) + 'px');
    });
  }
  return {
    scene, root, view,
    // show a form with these numbers (screen: the element that stands for the screen; it holds the view button's corner)
    set(screen, form, L, { asking = false, wheel = false } = {}) {
      root.classList.toggle('portrait', form === 'portrait'); root.classList.toggle('landscape', form !== 'portrait'); root.dataset.form = form;
      root.classList.toggle('asking', asking); ask.hidden = !asking; root.classList.toggle('tools-open', wheel && form === 'portrait');
      applyLayout(root, screen, form, L);
      view.style.left = screen.style.getPropertyValue('--dnd-view-x'); view.style.top = screen.style.getPropertyValue('--dnd-view-y');
      if (form === 'portrait') layWheel(L.wheel); else for (const b of tools.children) { b.style.removeProperty('--wx'); b.style.removeProperty('--wy'); }
      // the room: upright only above the panel; the DM's face at the height the camera puts it
      const vh = form === 'portrait' ? L.view.h : 1, f = faceFraction(form, L);
      scene.style.height = (vh * 100) + '%';
      dm.style.top = (f * 100) + '%';
    },
  };
}
