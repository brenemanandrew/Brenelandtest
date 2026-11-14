// The emotes: eight of them, keys 1-8 play one straight away on a keyboard.
//   Touch and PC: the smiley sits in the cluster up-left of the E (hud3). Tap or click it (G on a keyboard), or swipe it out, and the
//   emote wheel fans out of it up over the screen (hud-layout.js placeFan; the name of the one under the mouse beside it, with its
//   number key on a PC). Tap or click one to play it. A tap off the wheel, the smiley again, a swipe back down toward the smiley, G
//   or Esc put it back.
//   Pad: hold L2 for the same wheel, point with a stick, let go to play (hud-wheel.js).
// The dances: a tap or click on Dance (or the 3 key) pops the wheel out again as the four dances, straight away, on every device,
//   no holding down. 1-4 pick on a keyboard. A pad: L2 held, the stick on Dance, let go, and the dance wheel stays open. Point with
//   the right stick and pick as the emote wheel does (L2 pressed and let go again), or with A. Back from it (a tap or click off it,
//   a swipe left, Esc, B) folds it back into the emote wheel, once more puts that away. The smiley (or G) puts both away, and so
//   does walking once the dances have been out (the phone's thumb stick, WASD or the arrows, a pad's left stick once the push that
//   chose Dance has let go).
// The wheel never opens while something else owns the input: a takeover (fishing, the swing, bocce, the tower, swimming), a menu,
// the chat, the pockets.
import { makeWheel, pointWith } from './hud-wheel.js';
import { loadCss } from './util.js';

const INK = '#2b2340';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const face = (mouth, extra = '') => `<circle cx="32" cy="34" r="20" fill="#ffd9a8" ${S}/><circle cx="24" cy="30" r="2.6" fill="${INK}"/><circle cx="40" cy="30" r="2.6" fill="${INK}"/>${mouth}${extra}`;
const hand = (tx = 0, ty = 0, rot = 0) => `<g transform="translate(${tx} ${ty}) rotate(${rot} 32 36)"><path d="M20 38 V24 a3.5 3.5 0 0 1 7 0 V21 a3.5 3.5 0 0 1 7 0 V22 a3.5 3.5 0 0 1 7 0 V27 a3.5 3.5 0 0 1 7 0 V42 a14 14 0 0 1 -28 0 Z" fill="#ffd9a8" ${S}/><path d="M20 38 l-5 -6 a3.4 3.4 0 0 1 5 -4.6 l5 5" fill="#ffd9a8" ${S}/><path d="M24 55 h16" stroke="#e8743a" stroke-width="6" stroke-linecap="round"/></g>`;
// constant SVG strings (never built from user text), viewBox 0 0 64 64
const ICONS = {
  wave: hand(0, 0, 14) + `<path d="M8 20 q-6 6 -2 14 M12 14 q-9 9 -3 22" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  cheer: `<path d="M18 50 L12 24 M46 50 L52 24" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M18 50 L12 24 M46 50 L52 24" stroke="#ffd9a8" stroke-width="5" stroke-linecap="round"/>` +
    `<circle cx="32" cy="42" r="12" fill="#ffd9a8" ${S}/><path d="M25 44 q7 7 14 0" fill="none" ${S}/><circle cx="27" cy="40" r="2" fill="${INK}"/><circle cx="37" cy="40" r="2" fill="${INK}"/>` +
    `<circle cx="10" cy="12" r="3" fill="#e0463c"/><circle cx="54" cy="10" r="3" fill="#3f8fd9"/><circle cx="24" cy="10" r="2.5" fill="#ffd34d"/><circle cx="42" cy="14" r="2.5" fill="#7dd36a"/><path d="M30 6 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`,
  dance: `<path d="M26 14 V46" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M26 14 q14 -6 20 4 V42" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<ellipse cx="19" cy="48" rx="9" ry="7" fill="#b48cff" ${S}/><ellipse cx="39" cy="44" rx="9" ry="7" fill="#ff8fb8" ${S}/><path d="M8 20 l3 3 M54 18 l-3 3 M10 34 l4 -1 M56 32 l-4 -1" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  laugh: face(`<path d="M20 38 q12 16 24 0 z" fill="#8a2a3a" ${S}/><path d="M24 39 q8 3 16 0 q-2 5 -8 5 q-6 0 -8 -5z" fill="#fff"/>`, `<path d="M19 27 q5 -4 10 0 M35 27 q5 -4 10 0" fill="none" ${S}/><path d="M52 24 q4 6 0 10 q-3 -4 0 -10z" fill="#8fd0ee" ${S}/>`),
  highfive: hand(2, -2, -10) + `<path d="M8 10 l3 7 M14 6 l0 7 M4 18 l6 2" stroke="#ffd34d" stroke-width="3.5" stroke-linecap="round"/><path d="M8 10 l3 7 M14 6 l0 7 M4 18 l6 2" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>`,
  sit: `<path d="M14 30 h30 v12 H14 z" fill="#c4884f" ${S}/><path d="M14 30 V12 a4 4 0 0 1 4 -4 h10 a4 4 0 0 1 4 4 V30" fill="#e8a24a" ${S}/><path d="M16 42 V56 M42 42 V56" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M46 36 h8 M50 36 V52" stroke="#8a5a30" stroke-width="4" stroke-linecap="round"/>`,
  point: `<g transform="rotate(90 32 32)"><path d="M20 40 V22 a3.6 3.6 0 0 1 7.2 0 V34 h2 V16 a3.6 3.6 0 0 1 7.2 0 V34 h2 V26 a3.5 3.5 0 0 1 7 0 V36 a3.5 3.5 0 0 1 7 0 V42 a14 14 0 0 1 -28 0 Z" fill="#ffd9a8" ${S}/><path d="M20 40 l-5 -6 a3.4 3.4 0 0 1 5 -4.6 l5 5" fill="#ffd9a8" ${S}/></g><path d="M52 24 l6 0 M50 16 l5 -4 M50 32 l5 4" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  ballet: `<path d="M32 10 a6 6 0 1 1 0.1 0 M32 20 V36 M32 24 q-12 -8 -16 -16 M32 24 q12 -8 16 -16" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M14 40 Q32 30 50 40 Q32 48 14 40Z" fill="#ff9ccf" ${S}/><path d="M28 44 L22 58 M36 44 L40 56" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M40 56 h7" stroke="#ff9ccf" stroke-width="4" stroke-linecap="round"/>`,
  ballroom: `<circle cx="22" cy="14" r="6" fill="#ffd9a8" ${S}/><circle cx="42" cy="14" r="6" fill="#ffd9a8" ${S}/><path d="M22 20 L14 50 H30 Z" fill="#7a35d6" ${S}/><path d="M42 20 V44 M42 44 L37 58 M42 44 L47 58" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M26 26 Q32 20 38 26" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M53 8 q3 -4 6 0 q-1 5 -6 8 q-5 -3 -6 -8 q3 -4 6 0z" fill="#e0463c" stroke="${INK}" stroke-width="1.6"/>`,
  hiphop: `<path d="M14 30 a18 18 0 0 1 36 0" fill="none" stroke="${INK}" stroke-width="4"/><rect x="8" y="28" width="11" height="18" rx="5" fill="#3f8fd9" ${S}/><rect x="45" y="28" width="11" height="18" rx="5" fill="#3f8fd9" ${S}/>` +
    `<path d="M26 54 l4 -14 l4 10 l4 -6 l4 10" fill="none" stroke="#e0463c" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  shrug: face(`<path d="M25 42 q7 -3 14 0" fill="none" ${S}/>`, `<path d="M8 44 q0 -10 8 -10 M56 44 q0 -10 -8 -10" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M8 44 q0 -10 8 -10 M56 44 q0 -10 -8 -10" fill="none" stroke="#ffd9a8" stroke-width="3.5" stroke-linecap="round"/><path d="M50 6 q6 0 6 5 q0 4 -4 5 l0 3 M52 23 v2" fill="none" stroke="#3f8fd9" stroke-width="3" stroke-linecap="round"/>`),
};
export const EMOTES = [
  { id: 'wave', name: 'Wave', c: '#ffd34d' },
  { id: 'cheer', name: 'Cheer', c: '#ff8fb8' },
  { id: 'dance', name: 'Dance', c: '#c8b0ff' },
  { id: 'laugh', name: 'Laugh', c: '#ffb86b' },
  { id: 'highfive', name: 'High five', c: '#8fd0ee' },
  { id: 'sit', name: 'Sit', c: '#a8e06b' },
  { id: 'point', name: 'Point', c: '#ffa88a' },
  { id: 'shrug', name: 'Shrug', c: '#9fe0d0' },
];
// the dance wheel (a tap on Dance): the original dance first
export const DANCES = [
  { id: 'dance', name: 'Dance', c: '#c8b0ff' },
  { id: 'ballet', name: 'Ballet', c: '#ffb3d9' },
  { id: 'ballroom', name: 'Ballroom', c: '#ffd34d' },
  { id: 'hiphop', name: 'Hip-hop', c: '#8fd0ee' },
];
const LEFT_DEAD = 0.18; // a pad's left stick past this walks (gamepad.js DEADZONE)
const DANCE_SLOT =EMOTES.findIndex(e => e.id === 'dance');
export const emoteSvg = id => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ICONS[id]}</svg>`;

export function createEmotes(ctx, { play }) {
  const { input } = ctx;
  const hud = document.getElementById('hud');
  const tab = document.getElementById('tg-emotes');
  const tabFace = tab.querySelector('.tg-face');
  // ---- the wheel (the smiley on the left edge; a pad holds L2)
  loadCss('/css/dance-wheel.css');
  const wheel = makeWheel(document.getElementById('emote-wheel'), {
    label: 'Emotes', hubWord: 'tap one',
    onPick: i => { if (performance.now() < quietUntil) return; pick(i); },
  });
  const items = list => list.map((e, i) => ({ id: e.id, name: e.name, color: e.c, key: String(i + 1), icon: n => { n.innerHTML = emoteSvg(e.id); } }));
  const EMOTE_ITEMS = items(EMOTES), DANCE_ITEMS = items(DANCES);
  let dances = false, quietUntil = 0; // the dance wheel is showing; picks are ignored until quietUntil (a quick second tap on Dance)
  // the pad: the wheel lies open after L2 is let go on Dance (the sticks point, A or L2 pressed and let go picks, B steps back); the
  // stick that was on Dance has to come back to the middle before it points at a dance
  let latched = false, stickWait = false;
  // the dance wheel was opened since the wheel came up: walking now puts everything away (the phone's walking thumb lands as a tap
  // off the wheel, one step back, and then walks: no emote wheel left over the screen)
  let fromDances = false;
  const hubTip = wheel.root.querySelector('.wh-tip');
  function setDances(on) {
    if (dances === on) return;
    dances = on;
    wheel.setItems(on ? DANCE_ITEMS : EMOTE_ITEMS);
    wheel.root.classList.toggle('dances', on);
    wheel.root.setAttribute('aria-label', on ? 'Dances' : 'Emotes');
  }
  wheel.setItems(EMOTE_ITEMS);
  // a pick on the wheel: Dance pops out the dances, anything else plays and the wheel goes (-1: a pad let go pointing at nothing)
  function pick(i) {
    if (i < 0) closeWheel();
    else if (!dances && i === DANCE_SLOT) openDances(wheel.mode || 'touch');
    else { fire(i); closeWheel(); }
  }
  // the dances pop out (the wheel opened first if the 3 key asked for them)
  function openDances(mode) {
    if (!wheel.isOpen) openWheel(mode);
    setDances(true); fromDances = true;
    if (wheel.mode === 'pad') { latched = true; stickWait = true; input.wheelOpen = true; }
    wheel.open(wheel.mode, wheel.shape); // re-placed and re-popped, so the slots' entry animation plays again
    quietUntil = performance.now() + 250;
    paintTab(); ctx.audio.ui?.('blip'); input.rumble?.(0.2, 0.4, 80);
  }
  // one step back: the dance wheel folds back into the emotes; the emote wheel goes
  function back() {
    if (!dances) { closeWheel(); return; }
    setDances(false);
    wheel.open(wheel.mode, wheel.shape);
    stickWait = wheel.mode === 'pad';
    ctx.audio.ui?.('blip');
  }

  const layout = () => hud.dataset.layout || 'pc';
  // what blocks the wheel (the start screen and the intro are covered by ctx.mode)
  const busy = () => ctx.mode !== 'play' || !!ctx.player.takeover || input.overlayOpen || input.typing || input.promptOpen
    || !!ctx.inventory?.panelOpen || !!ctx.inventory?.busy?.() || !ctx.player.controls;

  const fanOpen = () => wheel.isOpen && wheel.mode === 'touch';
  function paintTab() {
    const open = wheel.isOpen;
    hud.classList.toggle('emotes-open', fanOpen()); // feature hints step up over the wheel
    tab.classList.toggle('on', open);
    tab.setAttribute('aria-expanded', String(open));
  }
  function openWheel(mode) {
    if (hud.classList.contains('tools-open')) ctx.features?.find(f => f.name === 'tools')?.setOpen(false); // one thing open at a time
    // where: hud-layout.js. Phone, tablet and PC: the fan out of the smiley in the cluster. The pad keeps the ring where the
    // layout's emote popout sits.
    const fan = mode === 'touch' && ctx.hudLayout?.fan;
    if (fan) ctx.hudLayout.placeFan?.();
    wheel.open(mode, fan ? 'fan' : 'ring');
    input.wheelOpen = mode === 'pad';
    paintTab();
  }
  function closeWheel() { wheel.close(); setDances(false); latched = stickWait = fromDances = false; input.wheelOpen = toolWheelOpen(); paintTab(); }
  const toolWheelOpen = () => !!ctx.features?.find(f => f.name === 'pad-hud')?.picker.isOpen; // the pad's tool picker has the sticks
  let swipedAt = 0;
  function toggle() {
    if (wheel.isOpen) closeWheel();
    else if (!busy()) { openWheel('touch'); ctx.audio.ui?.('blip'); }
  }
  tab.onclick = () => {
    tab.blur();
    if (performance.now() - swipedAt < 500) return; // the swipe that just opened it also lands as a click
    toggle();
  };
  // the phone: swipe the smiley out (any way) to pull the fan open, swipe back down and right toward it on the open fan or tap
  // anywhere off it to put it back (from
  // the dance wheel: back to the emotes). The PC: a click or tap anywhere off the fan does the same. One pointer at a time, and the
  // wheel's own slots take their taps before this sees them.
  const SWIPE = 28;
  let drag = null; // { id, x, y, onTab }
  const pointerDown = e => {
    const l = layout();
    if (l === 'pad' || e.pointerType === 'mouse' && e.button !== 0 && !fanOpen()) return;
    const onTab = tab.contains(e.target);
    if (fanOpen() && !onTab && !wheel.root.contains(e.target)) { back(); return; } // on a PC any button, so a right-drag to look puts it away too
    if (e.pointerType === 'mouse') return; // the swipes are a finger's
    if (onTab || (wheel.isOpen && wheel.mode === 'touch')) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, onTab };
  };
  const pointerMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.onTab && !wheel.isOpen && Math.hypot(dx, dy) > SWIPE) { drag = null; swipedAt = performance.now(); if (!busy()) { openWheel('touch'); ctx.audio.ui?.('blip'); } }
    else if (wheel.isOpen && wheel.mode === 'touch' && dx + dy > SWIPE * 1.2) { drag = null; swipedAt = performance.now(); back(); }
  };
  const pointerEnd = e => { if (drag && e.pointerId === drag.id) drag = null; };
  document.addEventListener('pointerdown', pointerDown, true);
  document.addEventListener('pointermove', pointerMove, true);
  document.addEventListener('pointerup', pointerEnd, true);
  document.addEventListener('pointercancel', pointerEnd, true);
  paintTab();

  let flashT = 0;
  function fire(slot) {
    const e = (dances ? DANCES : EMOTES)[slot]; if (!e) return;
    play(e.id);
    // the smiley shows which one for a moment
    tabFace.innerHTML = emoteSvg(e.id); tab.classList.add('fired'); flashT = 1.2; // constant markup
  }

  let lastLayout = '', rtHeld = false;
  return {
    name: 'emotes',
    EMOTES, DANCES,
    wheel,
    toggle,
    get dances() { return dances; },
    openDances: mode => openDances(mode || 'touch'), // for the tests: as a tap on Dance opens it
    back,
    update(dt, now) {
      if (layout() !== lastLayout) { lastLayout = layout(); if (wheel.isOpen) closeWheel(); paintTab(); }
      if (flashT > 0 && (flashT -= dt) <= 0) { tabFace.replaceChildren(); tab.classList.remove('fired'); }
      // the pad: hold L2 for the wheel, point with a stick, let go to play (on Dance: the dance wheel, lying open)
      const pad = input.pad, was = rtHeld;
      rtHeld = !!pad.wheel;
      const padOpen = () => wheel.isOpen && wheel.mode === 'pad';
      if (rtHeld && !was && !padOpen() && !busy() && !toolWheelOpen()) { openWheel('pad'); input.rumble(0.15, 0.3, 60); }
      // walking puts the dance wheel and the emote wheel away: the keys, the phone's thumb stick, the mouse walk, and (the wheel lying
      // open, L2 not held, the leftover push gone) a pad's left stick; then the right stick points
      const mv = input.move();
      const padWalk = latched && !rtHeld && !stickWait && Math.hypot(pad.sx[0], pad.sy[0]) > LEFT_DEAD;
      if (wheel.isOpen && (fromDances || latched) && (Math.hypot(mv.x, mv.y) > 0.15 || padWalk)) closeWheel();
      if (padOpen()) {
        if (stickWait && Math.max(Math.hypot(pad.sx[0], pad.sy[0]), Math.hypot(pad.sx[1], pad.sy[1])) < LEFT_DEAD) stickWait = false;
        if (rtHeld && !stickWait) pointWith(wheel, pad);
        else if (latched && !stickWait) wheel.stick(pad.sx[1], pad.sy[1]);
        if (was && !rtHeld) pick(wheel.picked);
        if (latched && !rtHeld && wheel.picked >= 0) { const w = `${input.pad.glyph?.('E') || 'A'} to pick`; if (hubTip && hubTip.textContent !== w) hubTip.textContent = w; } // nothing held, so not "let go to pick"
      }
      // something took over (a menu opened, a cast began): the wheel goes
      if (wheel.isOpen && (ctx.mode !== 'play' || input.overlayOpen || input.typing)) closeWheel();
    },
    onKey(code) {
      if (input.typing) return false;
      if (code === 'KeyG') { toggle(); return true; }
      if (code === 'Escape' && wheel.isOpen) { back(); return true; } // Esc, or B on a pad: one step back
      if (code === 'KeyE' && latched && wheel.isOpen) { if (wheel.picked >= 0) pick(wheel.picked); return true; } // a pad's A on the wheel lying open
      const m = /^Digit([1-8])$/.exec(code);
      if (!m) return false;
      if (busy() && ctx.player.takeover) return false; // a feature has the keys
      const i = +m[1] - 1;
      if (dances && wheel.isOpen) { if (i < DANCES.length) { fire(i); closeWheel(); } return true; } // the dance wheel: 1-4
      if (i === DANCE_SLOT) { if (wheel.isOpen || !busy()) openDances(wheel.mode || 'touch'); return true; } // 3: the dance wheel
      fire(i);
      if (fanOpen()) closeWheel(); // as a click on one does
      return true;
    },
    // no help lines: these keys are drawn in Settings > Controls, from controls-map.js
  };
}
