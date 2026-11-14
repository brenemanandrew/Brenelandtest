// The first-time tutorial: a click-through of coach marks over the live game. A soft white wash
// covers the screen with spotlights cut out round the control being explained (an SVG mask, one hole per control), and a
// cartoon speech card in the HUD's doodle style points at it. The steps follow the layout in your hands (hud-layout.js:
// phone, pc, pad) and only point at controls that are on screen; a step whose control is missing is skipped quietly.
//
// Loaded lazily by main.js (startTutorial) the first time a player comes out of the morning walk, from Settings > You >
// Replay the tutorial, or by typing /tutorial in the chat. Remembered per browser (main.js: localStorage) and per player
// record on the server (lib/tutorial.js), so it shows once. While it runs:
//   - input.block holds walking, looking and the keys (input.js: overlayOpen), except on the try-it steps
//   - main.js hands every key press to onKey (Enter / Space / Right: Next, Left / Backspace: Back, Esc: Skip; a pad's A
//     presses the card's buttons, B goes back)
//   - ext.tut puts a "Tutorial" badge beside your name tag on everyone's screen (lib/tutorial.js, net.js, style.css)
//   - it is a feature in ctx.features (update(dt): the spotlight's easing and the card's place); it leaves the list, the
//     DOM and every listener when it ends, so nothing of it runs afterwards.
//
//   createTutorial(ctx, { selfTag() -> your name tag item, done() }) -> { start(), stop(skipped), active, step, steps, api }
import { el, loadCss } from './util.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const PAD = 10;          // the spotlight's margin round a control (px)
const GAP = 16;          // card to spotlight
const EDGE = 10;         // card to the screen's edge
const TWEEN = 0.38;      // seconds for the spotlight to move to the next control
const INK = '#2b2340';
const S = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
// the card's little pictures: constant SVG strings (viewBox 0 0 32 32), never built from anything a player typed
const ICONS = {
  paw: `<ellipse cx="16" cy="21" rx="7" ry="6" fill="#fff" ${S}/><circle cx="8" cy="13" r="3" fill="#fff" ${S}/><circle cx="13" cy="8" r="3" fill="#fff" ${S}/><circle cx="19" cy="8" r="3" fill="#fff" ${S}/><circle cx="24" cy="13" r="3" fill="#fff" ${S}/>`,
  walk: `<path d="M16 3 l5 6 h-3 v5 h5 v-3 l6 5 -6 5 v-3 h-5 v5 h3 l-5 6 -5 -6 h3 v-5 h-5 v3 l-6 -5 6 -5 v3 h5 v-5 h-3 z" fill="#fff" ${S}/>`,
  look: `<path d="M3 16 q13 -14 26 0 q-13 14 -26 0 z" fill="#fff" ${S}/><circle cx="16" cy="16" r="5" fill="${INK}"/><circle cx="17.6" cy="14.4" r="1.6" fill="#fff"/>`,
  jump: `<path d="M16 4 l10 11 h-6 v9 h-8 v-9 h-6 z" fill="#fff" ${S}/><path d="M9 28 h14" fill="none" ${S}/>`,
  act: `<circle cx="16" cy="16" r="12" fill="#fff" ${S}/><path d="M20 10 h-8 v12 h8 M12 16 h6" fill="none" ${S}/>`,
  emote: `<circle cx="16" cy="16" r="12" fill="#fff" ${S}/><circle cx="12" cy="13" r="1.8" fill="${INK}"/><circle cx="20" cy="13" r="1.8" fill="${INK}"/><path d="M10.5 18.5 q5.5 6 11 0" fill="none" ${S}/>`,
  tools: `<path d="M6 12h20l-2 13a3.5 3.5 0 0 1-3.5 3h-9A3.5 3.5 0 0 1 8 25z" fill="#fff" ${S}/><path d="M11 12a5 5 0 0 1 10 0" fill="none" ${S}/><path d="M7 17h18" fill="none" ${S}/>`,
  chat: `<path d="M5 7 h22 a2 2 0 0 1 2 2 v11 a2 2 0 0 1 -2 2 h-12 l-6 5 v-5 h-4 a2 2 0 0 1 -2 -2 v-11 a2 2 0 0 1 2 -2 z" fill="#fff" ${S}/><path d="M10 13 h12 M10 17 h8" fill="none" ${S}/>`,
  quests: `<path d="M16 3 l3.8 8 8.6 1 -6.4 5.9 1.8 8.6 -7.8 -4.4 -7.8 4.4 1.8 -8.6 -6.4 -5.9 8.6 -1 z" fill="#fff" ${S}/>`,
  map: `<path d="M16 29 q-10 -10 -10 -16 a10 10 0 0 1 20 0 q0 6 -10 16 z" fill="#fff" ${S}/><circle cx="16" cy="13" r="3.6" fill="#fff" ${S}/>`,
  fish: `<path d="M4 16 q8 -10 18 -3 l6 -5 v16 l-6 -5 q-10 7 -18 -3 z" fill="#fff" ${S}/><circle cx="10" cy="14.5" r="1.6" fill="${INK}"/>`,
  heart: `<path d="M16 27 q-12 -8 -12 -15 a6.5 6.5 0 0 1 12 -3 a6.5 6.5 0 0 1 12 3 q0 7 -12 15 z" fill="#fff" ${S}/>`,
  help: `<circle cx="16" cy="16" r="12" fill="#fff" ${S}/><path d="M12 12.5 a4 4 0 1 1 5.5 3.7 q-1.5 0.7 -1.5 2.6 v1" fill="none" ${S}/><circle cx="16" cy="23.5" r="1.7" fill="${INK}"/>`,
};

// ---------------------------------------------------------------- the steps, per layout
// text: the words for each layout ({ phone, pc, pad }, or one string for all). targets(env) -> [{ el } | { rect }] (the
// first one is what the card's pointer points at). need: skip the step when none of its controls is on screen.
// try: 'walk' | 'look' (the controls are free on this step; Next lights up once you have done it). demo: show an example
// on the interact button while the step is up.
function stepList(env) {
  const { layout, P, has } = env;
  const pick = t => (typeof t === 'string' ? t : t[layout] ?? t.pc);
  const q = s => ({ sel: s });
  const pad = layout === 'pad';
  const list = [
    { id: 'welcome', icon: 'paw', color: '#ffd34d', title: 'Welcome to Breneland!',
      text: "A cosy backyard hangout with Dax and Nala. Catch fish, play games and make friends. Here's a quick tour of the controls." },
    { id: 'move', icon: 'walk', color: '#a8e06b', title: 'Walking', try: 'walk',
      text: { phone: 'Put your thumb on the left side of the screen and drag to walk. Drag further to run.',
        pc: 'This is you! Walk with WASD or the arrow keys. Hold Shift to run.',
        pad: `This is you! Push the left stick to walk. Hold ${P('Run')} to run.` },
      targets: () => layout === 'phone' ? [{ zone: 'left' }] : [{ avatar: true }] },
    { id: 'look', icon: 'look', color: '#8fd0ee', title: 'Looking around', try: 'look',
      text: { phone: 'Drag on the right side of the screen to look around.',
        pc: 'Hold the right mouse button and move the mouse to look around. Scroll to zoom in and out.',
        pad: `Push the right stick to look around. Click in the left stick to zoom.` },
      targets: () => layout === 'phone' ? [{ zone: 'right' }] : [] },
    { id: 'jump', icon: 'jump', color: '#a8e06b', title: 'Jumping', need: false,
      text: { phone: 'Tap quickly on the right side of the screen to jump. Boing!', pc: 'Press Space to jump. Boing!', pad: `Press ${P('Space')} to jump. Boing!` },
      targets: () => layout === 'phone' ? [{ zone: 'right' }] : [] }, // (hud3: no jump button; a quick tap on the right half jumps)
    { id: 'act', icon: 'act', color: '#ff8fb8', title: 'Say hi and use things', need: true, demo: 'Say hi to Nala',
      text: { phone: "When you're near someone or something, this button pops up and says what it does, like Say hi to Nala. Tap it!",
        pc: "When you're near someone or something, the E button lights up and says what it does, like Say hi to Nala. Press E or click it.",
        pad: `When you're near someone or something, the ${P('KeyE')} button lights up and says what it does, like Say hi to Nala. Press ${P('KeyE')} to do it.` },
      targets: () => [q('#btn-act'), q('#btn-act .act-name')] },
    { id: 'emotes', icon: 'emote', color: '#b48cff', title: 'Emotes', need: !pad,
      text: { phone: 'Tap the smiley by the E to wave, cheer, dance and more. Everyone nearby sees it.',
        pc: 'Click the smiley or press G to wave, cheer, dance and more. Keys 1 to 8 play them right away, and 3 opens the dances.',
        pad: `Hold ${P('EmoteWheel')} and point the right stick to wave, cheer, dance and more.` },
      targets: () => pad ? [] : [q('#tg-emotes')] },
    { id: 'tools', icon: 'tools', color: '#ff9f4a', title: 'Your basket', need: true,
      text: { phone: 'Your basket holds your tools, like a fishing rod and dog treats. Tap it and they fan out: tap one to hold it. Hold an empty spot to put a tool there, hold a full one to take it off.',
        pc: 'Your basket holds your tools, like a fishing rod and dog treats. Click it or press Tab and they fan out, or press Z, X, C or V to grab one. Hold an empty spot to put a tool there.',
        pad: `${P('SlotX')} and ${P('SlotY')} are your tool slots: press one to use its tool. Hold one to pick what goes on it: point the right stick and let go.` },
      targets: () => pad ? [q('#pad-slot-x'), q('#pad-slot-y')] : [q('#tg-tools')] },
    { id: 'chat', icon: 'chat', color: '#8fd0ee', title: has('#mic-toggle') ? 'Chat and voice' : 'Chat', need: true,
      text: {
        phone: 'Tap here to chat with everyone in Breneland.' + (has('#mic-toggle') ? ' The mic button turns on voice chat, so people near you can hear you.' : ''),
        pc: 'Press Enter to chat with everyone in Breneland.' + (has('#mic-toggle') ? ' The mic button turns on voice chat, so people near you can hear you.' : ''),
        pad: 'Click in the right stick to chat.' + (has('#mic-toggle') ? ` The mic button turns on voice chat. Hold ${P('KeyB')} to talk.` : '') },
      targets: () => [q('#chat-form'), q('#mic-toggle')] },
    { id: 'quests', icon: 'quests', color: '#ff9f4a', title: 'Quests', need: !pad,
      text: { phone: 'Quests tell you what to do next, like earning your next dog treat. Tap to open or fold them.',
        pc: 'Quests tell you what to do next, like earning your next dog treat. Click to open or fold them, or press J.',
        pad: `Quests tell you what to do next, like earning your next dog treat. ${P('KeyJ')} opens the quest log, and a little flare pops up when one changes.` },
      targets: () => pad ? [] : [q('#quests .qt-head')] },
    { id: 'map', icon: 'map', color: '#a8e06b', title: 'The map', need: true,
      text: { phone: "You're the yellow arrow, and the label names the place you're in. Tap the map to open the big one. On top: the time and today's weather.",
        pc: "You're the yellow arrow, and the label names the place you're in. Click the map or press N for the big one. On top: the time and today's weather.",
        pad: `You're the yellow arrow, and the label names the place you're in. ${P('KeyN')} opens the big map. On top: the time and today's weather.` },
      targets: () => [q('#minimap'), q('#place'), q('#hud-time'), q('#hud-wx')] },
    { id: 'money', icon: 'fish', color: '#8fd0ee', title: 'Fish and bones', need: true,
      text: "Fish are Breneland's money: catch them at the pier or earn them around town, then spend them at the shops. Every 10 fish also gets you a bone, a treat for Dax and Nala.",
      targets: () => [q('#currency .cur[data-id="fish"]'), q('#currency .cur[data-id="treat"]')] },
    { id: 'online', icon: 'heart', color: '#ff8fb8', title: "Who's here", need: true,
      text: { phone: "The heart counts everyone in Breneland right now. Tap it to see who's here.",
        pc: "The heart counts everyone in Breneland right now. Click it to see who's here.",
        pad: 'The heart counts everyone in Breneland right now.' },
      targets: () => [q('#online')] },
    { id: 'help', icon: 'help', color: '#b48cff', title: 'Settings and help', need: !pad,
      text: { phone: 'Tap ? for the controls, sound, graphics and more. You can replay this tour there too.',
        pc: 'Click ? or press H for the controls, sound, graphics and more. You can replay this tour there too.',
        pad: `${P('PadStart')} opens the log off card, and ${P('SlotY')} there opens Settings: the controls, sound, graphics and more. You can replay this tour there too.` },
      targets: () => pad ? [] : [q('#btn-help')] },
    { id: 'done', icon: 'paw', color: '#ffd34d', title: 'Have fun!', next: "Let's go!",
      text: 'Try talking to Kevin at the end of the pier for a fishing rod. Type /tutorial in the chat any time to see this again.' },
  ];
  // keycaps under the words on a keyboard
  const PC_KEYS = { move: [['W', 'A', 'S', 'D'], ['Shift']], look: [['Right mouse button'], ['Scroll']], jump: [['Space']], act: [['E']],
    emotes: [['G'], ['1', '2', '3', '4', '5', '6', '7', '8']], tools: [['Tab'], ['Z', 'X', 'C', 'V']], chat: [['Enter']], quests: [['J']], map: [['N']], help: [['H']] };
  for (const s of list) { s.words = pick(s.text); s.targets ||= () => []; s.keys = layout === 'pc' ? PC_KEYS[s.id] || null : null; }
  return list;
}

// ---------------------------------------------------------------- the tutorial
export function createTutorial(ctx, opts = {}) {
  loadCss('/css/tutorial.css');
  const { input, ui, player, camera, net } = ctx;
  const hud = document.getElementById('hud');
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let root = null, svg = null, holeG = null, ringG = null, card = null, parts = null, thumb = null;
  let active = false, steps = [], index = 0, layout = '';
  let holes = [];            // what is drawn now: [{ x, y, w, h, r }] (eased)
  let from = [], to = [], tweenT = 1;
  let primary = null;        // the rect the card points at
  let tryStart = null, tryDone = false, rectT = 0, vw = 0, vh = 0;
  let mo = null;

  // ---- the DOM (built on start, removed on stop)
  function build() {
    root = el('div', 'tut', '', { id: 'tutorial', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tut-title', 'aria-describedby': 'tut-text' });
    svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'tut-wash'); svg.setAttribute('aria-hidden', 'true');
    const defs = document.createElementNS(SVGNS, 'defs');
    const mask = document.createElementNS(SVGNS, 'mask'); mask.setAttribute('id', 'tut-mask');
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    const all = document.createElementNS(SVGNS, 'rect');
    for (const [k, v] of [['x', '-10'], ['y', '-10'], ['width', '10000'], ['height', '10000'], ['fill', '#fff']]) all.setAttribute(k, v);
    holeG = document.createElementNS(SVGNS, 'g');
    mask.append(all, holeG); defs.append(mask);
    const fog = document.createElementNS(SVGNS, 'rect');
    for (const [k, v] of [['x', '-10'], ['y', '-10'], ['width', '10000'], ['height', '10000'], ['class', 'tut-fog'], ['mask', 'url(#tut-mask)']]) fog.setAttribute(k, v);
    ringG = document.createElementNS(SVGNS, 'g'); ringG.setAttribute('class', 'tut-rings');
    svg.append(defs, fog, ringG);
    thumb = el('i', 'tut-thumb', '', { 'aria-hidden': 'true' });

    card = el('div', 'tut-card');
    const tail = el('i', 'tut-tail', '', { 'aria-hidden': 'true' });
    const head = el('div', 'tut-head');
    const icon = el('i', 'tut-icon', '', { 'aria-hidden': 'true' });
    const title = el('h2', 'tut-title', '', { id: 'tut-title' });
    const count = el('span', 'tut-count', '');
    head.append(icon, title, count);
    const text = el('p', 'tut-text', '', { id: 'tut-text' });
    const keys = el('div', 'tut-keys', '', { 'aria-hidden': 'true' });
    const tryChip = el('div', 'tut-try', '', { role: 'status' });
    const btns = el('div', 'tut-btns');
    const skip = el('button', 'tut-skip', 'Skip tutorial', { type: 'button' });
    const back = el('button', 'btn tut-back', 'Back', { type: 'button' });
    const next = el('button', 'btn primary tut-next', 'Next', { type: 'button' });
    const nextTxt = el('span', 'tut-next-t', 'Next'); next.textContent = ''; next.append(nextTxt);
    const nextKey = el('kbd', 'tut-k', ''); next.append(nextKey);
    const backKey = el('kbd', 'tut-k', ''); back.append(backKey);
    btns.append(skip, el('span', 'tut-fill'), back, next);
    card.append(tail, head, text, keys, tryChip, btns);
    root.append(svg, thumb, card);
    document.body.append(root);
    parts = { tail, icon, title, count, text, keys, tryChip, skip, back, next, nextTxt, nextKey, backKey };

    skip.addEventListener('click', () => stop(true));
    back.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    // Enter and Space on the card's buttons go through onKey (main.js hands it every key), never twice
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
    // the wash swallows taps and clicks: the yard and the HUD wait until the tour is over
    svg.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
    svg.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    svg.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('resize', onResize);
    mo = new MutationObserver(() => { if (layoutOf() !== layout) relayout(); else rectT = 0; });
    mo.observe(hud, { attributes: true, attributeFilter: ['data-layout', 'data-hud'] });
  }
  function onResize() { rectT = 0; }

  // ---- which controls are on screen
  function shown(e) {
    if (!e || !e.isConnected || e.hidden) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(e);
    // (a piece stepped aside under an open popout, the quest list popping say, is still on the layout: hud-clear.js .pop-under)
    return (cs.visibility !== 'hidden' || !!e.closest('.pop-under')) && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  }
  const P = code => input.pad.btnName(code);
  function env() { return { layout, P, has: s => shown(document.querySelector(s)) }; }

  // the rects of a step's targets, live (with the spotlight's margin); [] when none is on screen
  function rectsOf(step) {
    const out = [];
    for (const t of step.targets()) {
      let r = null;
      if (t.sel) {
        const e = document.querySelector(t.sel);
        if (!shown(e)) continue;
        const b = e.getBoundingClientRect();
        r = { x: b.left, y: b.top, w: b.width, h: b.height };
      } else if (t.zone) r = zoneRect(t.zone);
      else if (t.avatar) r = avatarRect();
      if (!r) continue;
      const g = t.zone ? 0 : PAD;
      const x = r.x - g, y = r.y - g, w = r.w + 2 * g, h = r.h + 2 * g;
      out.push({ x, y, w, h, r: t.zone ? 30 : Math.min(40, Math.min(w, h) / 2) });
    }
    // controls that touch share one spotlight (the minimap and the place name on its edge; the E and its words)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        // (a sliver of overlap from the margins alone keeps two spotlights: the phone's clock and the map under it)
        if (overlap(a, b) < 0.12 * Math.min(a.w * a.h, b.w * b.h)) continue;
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        out[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, r: Math.max(a.r, b.r) };
        out.splice(j, 1); j = i;
      }
    }
    return out;
  }
  // the phone's drag areas: the left side walks (input.js: x < 45%), the right side looks; between the quests and the chat
  function zoneRect(side) {
    const below = sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.bottom > 0 ? r.bottom + 14 : 0; };
    const top = Math.max(innerHeight * 0.3, below('#quests .qt-head'), side === 'right' ? below('#minimap') : 0); // (clear of the quests and the map)
    const chat = document.querySelector('#chat-form')?.getBoundingClientRect();
    const bottom = Math.min(innerHeight - 120, (chat && chat.top > 0 ? chat.top : innerHeight) - 16);
    if (side === 'left') return { x: 14, y: top, w: innerWidth * 0.45 - 24, h: Math.max(80, bottom - top) };
    return { x: innerWidth * 0.5 + 10, y: top, w: innerWidth * 0.5 - 24, h: Math.max(80, bottom - top) };
  }
  // you, on screen: from your feet to just over your head
  const v3 = new ctx.THREE.Vector3();
  function avatarRect() {
    const p = player.pos;
    v3.set(p.x, p.y, p.z).project(camera);
    if (v3.z > 1) return null;
    const fx = (v3.x * 0.5 + 0.5) * innerWidth, fy = (-v3.y * 0.5 + 0.5) * innerHeight;
    v3.set(p.x, p.y + 1.95, p.z).project(camera);
    const hy = (-v3.y * 0.5 + 0.5) * innerHeight;
    const h = Math.max(60, fy - hy), w = Math.max(54, h * 0.62);
    return { x: fx - w / 2, y: fy - h - 4, w, h: h + 8 };
  }

  // ---- steps
  // the words follow the layout: the tablet is a touch screen (phone words), the rest as #hud[data-layout] says
  const layoutOf = () => hud.dataset.hud === 'tablet' ? 'phone' : hud.dataset.layout || 'pc';
  function relayout() {
    layout = layoutOf();
    const was = steps[index]?.id;
    steps = stepList(env()).filter(usable);
    const i = steps.findIndex(s => s.id === was);
    if (i >= 0) index = i;
    index = Math.max(0, Math.min(index, steps.length - 1));
    root?.setAttribute('data-layout', layout);
    if (active) show(true);
  }

  // one step on (dir 1) or back (-1). Which controls are on screen is asked again here, not just at the start: the quests
  // only appear once the server has sent them, so a step skipped at the start can come back (and one gone is passed over)
  const usable = s => !s.need || s.demo || rectsOf(s).length;
  function go(i) {
    if (!active) return;
    const dir = i > index ? 1 : -1;
    const all = stepList(env());
    let j = all.findIndex(s => s.id === steps[index]?.id) + dir;
    while (j >= 0 && j < all.length && !usable(all[j])) j += dir;
    if (j >= all.length) { stop(false); return; }
    if (j < 0) return;
    steps = all.filter(usable);
    index = Math.max(0, steps.findIndex(s => s.id === all[j].id));
    show();
  }

  function show(keepTween) {
    const s = steps[index];
    parts.title.textContent = s.title;
    parts.text.textContent = s.words;
    parts.count.textContent = `${index + 1} / ${steps.length}`;
    parts.icon.innerHTML = `<svg viewBox="0 0 32 32">${ICONS[s.icon] || ICONS.paw}</svg>`; // (constant strings)
    card.style.setProperty('--c', s.color);
    parts.back.hidden = index === 0;
    parts.skip.hidden = index === steps.length - 1; // (nothing left to skip on the last card)
    parts.nextTxt.textContent = s.next || 'Next';
    const isPad = layout === 'pad' || input.lastDevice === 'pad';
    parts.nextKey.textContent = isPad ? P('KeyE') : layout === 'pc' ? 'Enter' : '';
    parts.backKey.textContent = isPad ? P('Escape') : '';
    parts.skip.title = layout === 'pc' ? 'Skip tutorial (Esc)' : '';
    // keycaps under the words (PC walking)
    parts.keys.replaceChildren();
    if (s.keys) for (const row of s.keys) { const g = el('span', 'tut-keyrow'); for (const k of row) g.append(el('kbd', 'tut-cap' + (k.length > 1 ? ' wide' : ''), k)); parts.keys.append(g); }
    parts.keys.hidden = !s.keys;
    // the example on the interact button
    ui.actDemo = s.demo || null; ui.setAct('');
    if (s.demo) hud.classList.add('can-act'); // (hud-layout.js takes it from here: the words are on the button now)
    // try-it steps: the controls are yours for a moment
    tryDone = false;
    tryStart = s.try ? { x: player.pos.x, z: player.pos.z, yaw: player.cam.yaw } : null;
    parts.tryChip.hidden = !s.try;
    if (s.try) { parts.tryChip.textContent = s.try === 'walk' ? 'Try it: walk a few steps' : 'Try it: look around'; parts.tryChip.classList.remove('done'); }
    setBlock(!s.try);
    root.classList.toggle('try', !!s.try);
    parts.next.classList.remove('ready');
    root.classList.toggle('no-target', !s.targets().length);
    thumb.className = 'tut-thumb' + (s.try && layout === 'phone' ? ' on ' + (s.try === 'walk' ? 'walk' : 'look') : '');
    // the spotlight eases over from where it was
    rectT = 0;
    if (!keepTween) { from = holes.map(h => ({ ...h })); tweenT = reduced() ? 1 : 0; }
    place(true);
    // the focus on Next (keyboard and pad players press it straight away; not on a phone: no keyboard pops up anyway)
    if (input.lastDevice !== 'touch') setTimeout(() => { if (active && !card.contains(document.activeElement)) parts.next.focus({ preventScroll: true }); }, 0);
    audioBlip();
  }
  function audioBlip() { try { ctx.audio.ui?.('blip'); } catch { /* fine */ } }

  function setBlock(on) {
    const was = !!input.block;
    input.block = on;
    if (on && !was) input.reset();
    document.body.classList.toggle('tutorial-try', !on);
  }

  // ---- the spotlight and the card
  function place(fresh) {
    vw = innerWidth; vh = innerHeight;
    const s = steps[index];
    let rs = rectsOf(s);
    to = rs;
    primary = rs[0] || null;
    if (fresh && from.length === 0 && tweenT < 1) {
      // nothing to ease from (the first step with a target): grow from the middle of each hole
      from = rs.map(r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: 0, h: 0, r: 0 }));
    }
    paintHoles(tweenT >= 1);
    placeCard(rs);
    // the phone's thumb that drags in the walk / look area
    if (thumb.classList.contains('on') && rs[0]) {
      thumb.style.left = (rs[0].x + rs[0].w / 2) + 'px'; thumb.style.top = (rs[0].y + rs[0].h * 0.55) + 'px';
    }
  }

  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function lerpRect(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k, r: a.r + (b.r - a.r) * k }; }
  function paintHoles(final) {
    const k = final ? 1 : ease(Math.min(1, tweenT));
    const n = to.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const b = to[i];
      const a = from[i] || from[from.length - 1] || { x: b.x + b.w / 2, y: b.y + b.h / 2, w: 0, h: 0, r: 0 };
      out.push(lerpRect(a, b, k));
    }
    // holes that are going away shrink to their middle
    if (k < 1) for (let i = n; i < from.length; i++) { const a = from[i]; out.push(lerpRect(a, { x: a.x + a.w / 2, y: a.y + a.h / 2, w: 0, h: 0, r: 0 }, k)); }
    holes = out;
    sync(holeG, out, 'tut-hole');
    sync(ringG, out, 'tut-ring');
  }
  function sync(g, rects, cls) {
    while (g.childNodes.length > rects.length) g.lastChild.remove();
    while (g.childNodes.length < rects.length) { const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('class', cls); if (cls === 'tut-hole') r.setAttribute('fill', '#000'); g.append(r); }
    rects.forEach((r, i) => {
      const n = g.childNodes[i];
      n.setAttribute('x', r.x.toFixed(1)); n.setAttribute('y', r.y.toFixed(1));
      n.setAttribute('width', Math.max(0, r.w).toFixed(1)); n.setAttribute('height', Math.max(0, r.h).toFixed(1));
      n.setAttribute('rx', Math.max(0, Math.min(r.r, r.w / 2, r.h / 2)).toFixed(1));
    });
  }

  const overlap = (a, b, m = 0) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + m) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + m);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function placeCard(rs, sideways = steps[index]?.targets().some(t => t.avatar)) {
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let best = null;
    if (!rs.length) {
      best = { x: (vw - cw) / 2, y: (vh - ch) / 2, side: '' };
    } else {
      const u = rs.reduce((a, r) => ({ x: Math.min(a.x, r.x), y: Math.min(a.y, r.y), x2: Math.max(a.x2, r.x + r.w), y2: Math.max(a.y2, r.y + r.h) }), { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity });
      const p = rs[0], pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      const ucx = (u.x + u.x2) / 2, ucy = (u.y + u.y2) / 2;
      const cx = clamp(pcx - cw / 2, EDGE, vw - cw - EDGE), cy = clamp(pcy - ch / 2, EDGE, vh - ch - EDGE);
      const cand = [
        { side: 'top', x: cx, y: u.y2 + GAP },         // the card below the controls, its pointer on top
        { side: 'bottom', x: cx, y: u.y - GAP - ch },  // above them
        { side: 'left', x: u.x2 + GAP, y: cy },        // to their right
        { side: 'right', x: u.x - GAP - cw, y: cy },   // to their left
      ];
      // above or below first (the card reads best over or under a button; beside you when it points at you), the side with
      // more room first
      const vert = c => (c.side === 'top' || c.side === 'bottom') !== !!sideways;
      cand.sort((a, b) => (vert(b) - vert(a)) || room(b) - room(a));
      function room(c) { return c.side === 'top' ? vh - u.y2 : c.side === 'bottom' ? u.y : c.side === 'left' ? vw - u.x2 : u.x; }
      for (const c of cand) {
        const fits = c.x >= EDGE - 0.5 && c.y >= EDGE - 0.5 && c.x + cw <= vw - EDGE + 0.5 && c.y + ch <= vh - EDGE + 0.5;
        const box = { x: c.x, y: c.y, w: cw, h: ch };
        const hit = rs.reduce((n, r) => n + overlap(box, r, 4), 0);
        c.score = (fits ? 0 : 1e7) + hit;
        if (!best || c.score < best.score) best = c;
        if (fits && !hit) { best = c; break; }
      }
      if (best.score > 0) { // nothing fit cleanly: slide each candidate inside the screen and keep the one that covers least
        for (const c of cand) {
          const box = { x: clamp(c.x, EDGE, vw - cw - EDGE), y: clamp(c.y, EDGE, vh - ch - EDGE), w: cw, h: ch };
          const hit = rs.reduce((n, r) => n + overlap(box, r, 4), 0);
          if (hit < best.score) best = { ...c, x: box.x, y: box.y, score: hit };
        }
      }
      best.px = pcx; best.py = pcy; best.ucx = ucx; best.ucy = ucy;
    }
    card.style.transform = `translate(${Math.round(best.x)}px, ${Math.round(best.y)}px)`;
    card.dataset.side = best.side || '';
    // the pointer: on the card's edge facing the control, across from its middle
    const t = parts.tail;
    t.hidden = !best.side;
    if (best.side === 'top' || best.side === 'bottom') t.style.setProperty('--at', clamp(best.px - best.x, 28, cw - 28) + 'px');
    else if (best.side) t.style.setProperty('--at', clamp(best.py - best.y, 26, ch - 26) + 'px');
    cardBox = { x: best.x, y: best.y, w: cw, h: ch };
  }
  let cardBox = null;

  // ---- per frame (a feature while active): the easing, the live rects a few times a second, the try-it checks
  const feature = {
    name: 'tutorial',
    update(dt) {
      if (!active) return;
      if (tweenT < 1) { tweenT = Math.min(1, tweenT + dt / TWEEN); paintHoles(false); }
      const s = steps[index];
      rectT -= dt;
      const live = s.targets().some(t => t.avatar);
      if (rectT <= 0 || live || innerWidth !== vw || innerHeight !== vh) {
        rectT = 0.25;
        to = rectsOf(s);
        if (tweenT >= 1) paintHoles(true);
        placeCard(to);
        if (thumb.classList.contains('on') && to[0]) { thumb.style.left = (to[0].x + to[0].w / 2) + 'px'; thumb.style.top = (to[0].y + to[0].h * 0.55) + 'px'; }
        const tag = opts.selfTag?.(); if (tag?.node && !tag.node.classList.contains('tutoring')) tag.node.classList.add('tutoring');
      }
      if (tryStart && !tryDone) {
        const ok = s.try === 'walk' ? Math.hypot(player.pos.x - tryStart.x, player.pos.z - tryStart.z) > 1.5
          : Math.abs(Math.atan2(Math.sin(player.cam.yaw - tryStart.yaw), Math.cos(player.cam.yaw - tryStart.yaw))) > 0.5;
        if (ok) {
          tryDone = true;
          parts.tryChip.textContent = s.try === 'walk' ? 'Nice walking!' : 'Nice!';
          parts.tryChip.classList.add('done');
          parts.next.classList.add('ready');
          audioBlip();
        }
      }
    },
  };

  // ---- keys (main.js hands every key press over while the tutorial runs)
  function onKey(code) {
    if (!active) return true;
    const s = steps[index];
    const freeArrows = !!s?.try; // arrows walk on the try-it steps
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || (code === 'KeyE' && input.lastDevice === 'pad')) { // (a pad's A is KeyE now)
      const f = document.activeElement;
      if (f && card.contains(f) && f.tagName === 'BUTTON') f.click(); else go(index + 1);
    } else if ((code === 'ArrowRight' && !freeArrows) || code === 'PadRight') go(index + 1);
    else if (((code === 'ArrowLeft' && !freeArrows) || code === 'PadLeft' || code === 'Backspace') && index > 0) go(index - 1);
    else if (code === 'Escape') { if (input.lastDevice === 'pad') { if (index > 0) go(index - 1); } else stop(true); }
    return true;
  }

  // ---- start and stop
  function start() {
    if (active) return;
    if (!root) build();
    index = 0; holes = []; from = []; tweenT = 1; steps = [];
    relayout(); // (the steps for the layout in your hands, before anything shows)
    active = true;
    document.body.classList.add('tutorial-on');
    hud.classList.remove('tools-open', 'tools-over');
    const who = document.getElementById('who'); if (who) who.hidden = true;
    if (document.activeElement && document.activeElement.id === 'chat-input') document.activeElement.blur();
    if (!ctx.features.includes(feature)) ctx.features.push(feature);
    net?.send({ t: 'tut', on: 1 });
    const tag = opts.selfTag?.(); tag?.node?.classList.add('tutoring');
    root.hidden = false;
    show();
  }

  function stop(skipped) {
    if (!active) return;
    active = false;
    setBlock(false);
    document.body.classList.remove('tutorial-on', 'tutorial-try');
    ui.actDemo = null; ui.setAct('');
    const i = ctx.features.indexOf(feature); if (i >= 0) ctx.features.splice(i, 1);
    net?.send({ t: 'tut', on: 0 });
    const tag = opts.selfTag?.(); tag?.node?.classList.remove('tutoring');
    removeEventListener('resize', onResize);
    mo?.disconnect(); mo = null;
    if (card.contains(document.activeElement)) document.activeElement.blur();
    root.remove(); root = null;
    lastResult = skipped ? 'skipped' : 'finished';
    try { opts.done?.(lastResult); } catch (e) { console.error('[tutorial] done', e); }
    if (!skipped) audioBlip();
  }
  let lastResult = null;

  return {
    start, stop, onKey, feature,
    get active() { return active; },
    get step() { return steps[index]?.id || null; },
    get index() { return index; },
    get steps() { return steps.map(s => s.id); },
    get result() { return lastResult; },
    // for the tests: what is on screen now (the spotlight's holes as drawn, the card's box, the step's live target rects)
    api: {
      holes: () => holes.map(h => ({ ...h })),
      card: () => (card && root ? (r => ({ x: r.left, y: r.top, w: r.width, h: r.height }))(card.getBoundingClientRect()) : null),
      targets: () => (active ? rectsOf(steps[index]) : []),
      settle: () => { tweenT = 1; rectT = 0; feature.update(0); },
      text: () => (active ? { title: parts.title.textContent, text: parts.text.textContent, count: parts.count.textContent } : null),
      allText: () => stepList(env()).map(s => ({ id: s.id, title: s.title, text: s.words })),
    },
  };
}
