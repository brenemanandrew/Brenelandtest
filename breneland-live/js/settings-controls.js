// Settings > Controls: one page, a picture of the device you are using with what each button does written at the
// button. Three drawings in inline SVG (the game's ink style): an Xbox-style controller, a keyboard and mouse, a phone.
// Every label comes from the tables the game itself runs on: gamepad.js (which button sends which key) and
// controls-map.js (what each key does, the walk and run keys input.js reads), so the picture cannot drift from the code.
// Feature help lines (fishing, the swing...) aren't on the picture, they fill a small folded "More" list under it.
import { PAD_KEYS, FACE, FACE_CODES, RUN_BUTTONS, L3, LB, TALK, PAD_HOLDS, PAD_TAPS } from './gamepad.js';
import { VERBS, MOVE_KEYS, RUN_KEYS, MOUSE, TOUCH, verb, groupColor, keyWord } from './controls-map.js';

const NS = 'http://www.w3.org/2000/svg';
const INK = '#2b2340', PAPER = '#fff8ec';
const FACE_COLOR = ['#5fbf5a', '#e0463c', '#3f8fd9', '#f2c230']; // A B X Y (hud-layout.js uses the same)
export const DEVICES = [
  { id: 'pad', name: 'Controller' },
  { id: 'kbm', name: 'Keyboard and mouse' },
  { id: 'touch', name: 'Phone' },
];

// ---------------------------------------------------------------- a tiny SVG builder (constant strings only, no player text)
function s(tag, attrs = {}, parent = null, text = '') {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}
const svgRoot = (w, h, label) => s('svg', { viewBox: `0 0 ${w} ${h}`, class: 'ctl-svg', role: 'img', 'aria-label': label });

// A callout: a leader line from a point on the drawing to a pill with an optional button chip and the words.
// side 'l' = the pill ends at x (right-aligned), 'r' = it starts at x. Measured after insertion so the pill fits its text.
// On a narrow screen (D.compact) the pill shows only a big chip (a number when there is none) and the words go to a
// legend under the picture, so nothing is smaller than about 12 px on a phone.
let D = { compact: false, legend: [] };
function callout(g, { from, to, side, chip, chipColor, chipRound, text, via }) {
  if (D.compact) {
    if (!chip) { chip = String(D.legend.filter(l => l.num).length + 1); chipColor = '#ffffff'; chipRound = true; }
    D.legend.push({ chip, color: chipColor || INK, round: !!chipRound, text, num: /^\d+$/.test(chip) });
    text = '';
  }
  const [fx, fy] = from, [tx, ty] = to;
  const pts = [from, ...(via || []), [tx, ty]].map(p => p.join(',')).join(' ');
  s('polyline', { points: pts, class: 'co-line' }, g);
  s('circle', { cx: fx, cy: fy, r: 4.5, class: 'co-dot' }, g);
  const box = s('g', { class: 'co' }, g);
  const big = D.compact ? 1.9 : 1; // compact chips are drawn about twice the size
  const ph = 32 * big, chh = 24 * big;
  const rect = s('rect', { rx: ph / 2, ry: ph / 2, height: ph, class: 'co-pill' }, box);
  let cw = 0, chipEl = null, chipT = null;
  if (chip) {
    chipEl = s('rect', { rx: chipRound ? chh / 2 : 7 * big, ry: chipRound ? chh / 2 : 7 * big, height: chh, class: 'co-chip', fill: chipColor || INK }, box);
    chipT = s('text', { class: 'co-chipt' + (chipColor && chipColor !== INK ? ' dark' : '') }, box, chip);
  }
  const t = text ? s('text', { class: 'co-text' }, box, text) : null;
  // measure (the page is visible when this runs; fall back to an estimate when it is not)
  const m = el => { try { const w = el.getComputedTextLength(); if (w > 0) return w; } catch { /* hidden */ } return el.textContent.length * 9 * big; };
  if (chip) cw = Math.max(chh, m(chipT) + 14 * big);
  const tw = t ? m(t) : 0;
  const w = t ? 12 + (chip ? cw + 7 : 0) + tw + 13 : cw + 8 * big;
  const x0 = side === 'l' ? Math.max(4, tx - w) : tx; // a long label slides over its own line rather than off the picture
  rect.setAttribute('x', x0); rect.setAttribute('y', ty - ph / 2); rect.setAttribute('width', w);
  let x = x0 + 4 * big;
  if (chip) {
    chipEl.setAttribute('x', x); chipEl.setAttribute('y', ty - chh / 2); chipEl.setAttribute('width', cw);
    chipT.setAttribute('x', x + cw / 2); chipT.setAttribute('y', ty + 5.5 * big);
    x += cw + 8;
  } else x += 8;
  if (t) { t.setAttribute('x', x); t.setAttribute('y', ty + 6); }
  return box;
}

// ---------------------------------------------------------------- the controller
// Positions on the drawing by standard-mapping button index (0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu,
// 10 L3, 11 R3, 12-15 the D-pad).
const P = {
  A: [578, 262], B: [614, 226], X: [542, 226], Y: [578, 190], L: [332, 222], R: [520, 300], D: [388, 300],
  view: [420, 216], menu: [480, 216], LB: [326, 128], RB: [574, 128], LT: [318, 98], RT: [582, 98],
};
const padName = code => FACE.xbox[code] || code;
// what a standard button index does, straight from gamepad.js's tables: a key it sends, what a hold does, what a tap does
function padWords(i) {
  if (RUN_BUTTONS.includes(i)) return VERBS.run[1] + ' (hold)';
  const hold = PAD_HOLDS[i], tap = PAD_TAPS[i] || PAD_KEYS[i] || (i < 4 ? FACE_CODES[i] : null);
  if (hold && tap && tap !== hold) return `Tap: ${verb(tap)?.[0] || ''}. ${verb(hold)?.[1] || ''}`;
  return verb(hold || tap)?.[1] || '';
}

function drawPad() {
  const W = 900, H = 470;
  const svg = svgRoot(W, H, 'An Xbox-style controller with what each button does');
  const g = s('g', {}, svg);
  // triggers and bumpers behind the body
  for (const x of [P.LT[0], P.RT[0]]) s('path', { d: `M${x - 36} 130 Q${x - 32} 88 ${x} 86 Q${x + 32} 88 ${x + 36} 130 Z`, class: 'pd-trig' }, g);
  s('rect', { x: P.LB[0] - 54, y: 122, width: 108, height: 30, rx: 14, class: 'pd-bump' }, g); // tucked under the body's top edge
  s('rect', { x: P.RB[0] - 54, y: 122, width: 108, height: 30, rx: 14, class: 'pd-bump' }, g);
  s('text', { x: P.LT[0], y: 112, class: 'pd-lab' }, g, 'LT');
  s('text', { x: P.RT[0], y: 112, class: 'pd-lab' }, g, 'RT');
  s('text', { x: P.LB[0], y: 141, class: 'pd-lab sm' }, g, 'LB');
  s('text', { x: P.RB[0], y: 141, class: 'pd-lab sm' }, g, 'RB');
  // the body
  s('path', { class: 'pd-shadow', d: BODY, transform: 'translate(0 7)' }, g);
  s('path', { class: 'pd-body', d: BODY }, g);
  s('path', { class: 'pd-shine', d: 'M300 170 C340 152 400 148 440 150' }, g);
  // the logo button, View and Menu
  s('circle', { cx: 450, cy: 172, r: 17, class: 'pd-logo' }, g);
  s('path', { d: 'M440 163 L460 181 M460 163 L440 181', class: 'pd-logo-x' }, g);
  for (const [k, word] of [['view', 'View'], ['menu', 'Menu']]) {
    s('rect', { x: P[k][0] - 14, y: P[k][1] - 10, width: 28, height: 20, rx: 10, class: 'pd-small' }, g);
    s('text', { x: P[k][0], y: P[k][1] + 34, class: 'pd-lab xs' }, g, word);
  }
  s('path', { d: `M${P.view[0] - 6} ${P.view[1] - 3} h7 M${P.view[0] - 6} ${P.view[1] + 3} h7 M${P.view[0] + 4} ${P.view[1] - 5} v6`, class: 'pd-glyph' }, g);
  s('path', { d: `M${P.menu[0] - 6} ${P.menu[1] - 4} h12 M${P.menu[0] - 6} ${P.menu[1]} h12 M${P.menu[0] - 6} ${P.menu[1] + 4} h12`, class: 'pd-glyph' }, g);
  // sticks
  for (const k of ['L', 'R']) {
    const [x, y] = P[k];
    s('circle', { cx: x, cy: y, r: 37, class: 'pd-well' }, g);
    s('circle', { cx: x, cy: y + 3, r: 27, class: 'pd-stick-sh' }, g);
    s('circle', { cx: x, cy: y, r: 27, class: 'pd-stick' }, g);
    s('circle', { cx: x, cy: y, r: 17, class: 'pd-stick-top' }, g);
  }
  // the D-pad, its arms in the cross pad's yellow
  {
    const [x, y] = P.D, a = 13, l = 36;
    s('path', { class: 'pd-dpad', d: `M${x - a} ${y - l} h${2 * a} v${l - a} h${l - a} v${2 * a} h-${l - a} v${l - a} h-${2 * a} v-${l - a} h-${l - a} v-${2 * a} h${l - a} Z` }, g);
    for (const [dx, dy, r] of [[0, -24, 0], [24, 0, 90], [0, 24, 180], [-24, 0, 270]]) s('path', { d: 'M-6 4 L0 -5 L6 4 Z', class: 'pd-tri', transform: `translate(${x + dx} ${y + dy}) rotate(${r})` }, g);
  }
  // face buttons
  for (const [i, k] of [[3, 'Y'], [2, 'X'], [1, 'B'], [0, 'A']]) {
    const [x, y] = P[k];
    s('circle', { cx: x, cy: y + 3, r: 19, class: 'pd-btn-sh' }, g);
    s('circle', { cx: x, cy: y, r: 19, class: 'pd-btn', fill: FACE_COLOR[i] }, g);
    s('text', { x, y: y + 7, class: 'pd-face' }, g, padName(FACE_CODES[i]));
  }

  // callouts (drawn after the shapes so they sit on top)
  const c = s('g', { class: 'callouts' }, svg);
  const L = 236, R = 664;
  const lt = (i, k) => ({ chip: k, chipColor: INK, text: padWords(i) });
  callout(c, { from: [P.LT[0] - 20, 100], to: [L, 62], side: 'l', ...lt(6, 'LT') });
  callout(c, { from: [P.LB[0] - 44, 136], to: [L, 118], side: 'l', ...lt(LB, 'LB') });
  callout(c, { from: [P.L[0] - 37, P.L[1]], to: [L, P.L[1]], side: 'l', chip: 'L', chipColor: INK, chipRound: true, text: 'Walk' + (L3 === 10 ? '  (click: zoom)' : '') });
  callout(c, { from: [P.D[0] - 36, P.D[1]], to: [L, P.D[1] + 10], side: 'l', chip: 'D-pad', chipColor: '#ffd34d', text: padWords(12) + (PAD_HOLDS[TALK] ? `. Down: ${verb(PAD_HOLDS[TALK])[1]}` : '') });
  callout(c, { from: [P.view[0] - 8, P.view[1] - 10], to: [P.view[0] - 30, 30], via: [[P.view[0] - 8, 30]], side: 'l', chip: 'View', chipColor: INK, text: padWords(8) });
  callout(c, { from: [P.menu[0] + 8, P.menu[1] - 10], to: [P.menu[0] + 30, 30], via: [[P.menu[0] + 8, 30]], side: 'r', chip: 'Menu', chipColor: INK, text: padWords(9) });
  callout(c, { from: [P.RT[0] + 20, 100], to: [R, 62], side: 'r', ...lt(7, 'RT') });
  callout(c, { from: [P.RB[0] + 44, 136], to: [R, 112], side: 'r', ...lt(5, 'RB') });
  const face = (i, k, to, via) => callout(c, { from: [P[k][0] + (k === 'X' ? 0 : 14), P[k][1] + (k === 'X' ? -19 : 0)], to, via, side: 'r', chip: padName(FACE_CODES[i]), chipColor: FACE_COLOR[i], chipRound: true, text: padWords(i) });
  face(2, 'X', [R, 160], [[P.X[0], 160]]);
  face(3, 'Y', [R, 204]);
  face(1, 'B', [R, 248]);
  face(0, 'A', [R, 292]);
  const r3 = verb(PAD_KEYS[11]);
  callout(c, { from: [P.R[0] + 37, P.R[1] + 8], to: [R, 352], side: 'r', chip: 'R', chipColor: INK, chipRound: true, text: 'Look' + (r3 ? `  (click: ${r3[0]})` : '') });
  // the wheels: hold, point with a stick, let go
  const note = s('g', { class: 'pd-note' }, svg);
  s('text', { x: W / 2, y: 452, class: 'ctl-foot' }, note, `Hold ${padName('EmoteWheel')} for the emote wheel (let go on Dance for the dances); ${padName('SlotX')} or ${padName('SlotY')} on an empty slot opens the tool picker`);
  return svg;
}
const BODY = 'M332 146 C372 132 528 132 568 146 C622 156 652 192 668 252 C690 334 704 404 660 424 C622 442 596 412 572 376 ' +
  'C556 352 534 344 450 344 C366 344 344 352 328 376 C304 412 278 442 240 424 C196 404 210 334 232 252 C248 192 278 156 332 146 Z';

// ---------------------------------------------------------------- the keyboard and mouse
const U = 56, KEY = 51; // one key unit and the keycap inside it
// rows of [code, width in units, shown letter]; '' code = a key the game does not use (drawn pale)
const ROWS = [
  [['Escape', 1, 'Esc'], ['Digit1', 1, '1'], ['Digit2', 1, '2'], ['Digit3', 1, '3'], ['Digit4', 1, '4'], ['Digit5', 1, '5'], ['Digit6', 1, '6'], ['Digit7', 1, '7'], ['Digit8', 1, '8'], ['Digit9', 1, '9'], ['Digit0', 1, '0'], ['', 1, ''], ['', 1, ''], ['', 2, '']],
  [['Tab', 1.5, 'Tab'], ['KeyQ', 1, 'Q'], ['KeyW', 1, 'W'], ['KeyE', 1, 'E'], ['KeyR', 1, 'R'], ['KeyT', 1, 'T'], ['KeyY', 1, 'Y'], ['KeyU', 1, 'U'], ['KeyI', 1, 'I'], ['KeyO', 1, 'O'], ['KeyP', 1, 'P'], ['', 1, ''], ['', 1, ''], ['', 1.5, '']],
  [['', 1.75, ''], ['KeyA', 1, 'A'], ['KeyS', 1, 'S'], ['KeyD', 1, 'D'], ['KeyF', 1, 'F'], ['KeyG', 1, 'G'], ['KeyH', 1, 'H'], ['KeyJ', 1, 'J'], ['KeyK', 1, 'K'], ['KeyL', 1, 'L'], ['', 1, ''], ['', 1, ''], ['Enter', 2.25, 'Enter']],
  [['ShiftLeft', 2.25, 'Shift'], ['KeyZ', 1, 'Z'], ['KeyX', 1, 'X'], ['KeyC', 1, 'C'], ['KeyV', 1, 'V'], ['KeyB', 1, 'B'], ['KeyN', 1, 'N'], ['KeyM', 1, 'M'], ['', 1, ''], ['', 1, ''], ['', 1, ''], ['ShiftRight', 2.75, 'Shift']],
  [['', 1.25, ''], ['', 1.25, ''], ['', 1.25, ''], ['Space', 6.25, 'Space'], ['', 1.25, ''], ['', 0.75, null], ['ArrowLeft', 1, '<'], ['ArrowUpDown', 1, '^'], ['ArrowRight', 1, '>']],
];
const ARROW_ROT = { ArrowLeft: 270, ArrowRight: 90, ArrowUp: 0, ArrowDown: 180 };

function keycap(g, x, y, w, h, code, letter) {
  const v = verb(code);
  const on = !!v;
  const cls = 'kb-key' + (on ? ' on' : '');
  if (on) s('rect', { x, y: y + 4, width: w, height: h, rx: 9, class: 'kb-sh' }, g);
  s('rect', { x, y, width: w, height: h, rx: 9, class: cls, fill: on ? groupColor(code) : PAPER }, g);
  if (ARROW_ROT[code] !== undefined) {
    s('path', { d: 'M-7 5 L0 -6 L7 5 Z', class: 'kb-tri' + (on ? ' on' : ''), transform: `translate(${x + w / 2} ${y + (h > 30 ? 20 : h / 2 + 1)}) rotate(${ARROW_ROT[code]})` }, g);
  } else if (letter) s('text', { x: x + 8, y: y + 21, class: 'kb-let' + (on ? ' on' : '') + (letter.length > 2 ? ' word' : '') }, g, letter);
  if (on && h > 30 && !D.compact) s('text', { x: x + w / 2, y: y + h - 8, class: 'kb-verb' }, g, v[0]);
}

function drawKeyboard() {
  const W = 1040, H = 330;
  const svg = svgRoot(W, H, 'A keyboard and mouse with the keys the game uses');
  const g = s('g', { transform: 'translate(10 14)' }, svg);
  s('rect', { x: -8, y: -8, width: 15 * U + 12, height: 5 * U + 12, rx: 20, class: 'kb-case' }, g);
  ROWS.forEach((row, r) => {
    let x = 0;
    const y = r * U;
    for (const [code, w, letter] of row) {
      if (letter === null) { x += w * U; continue; }
      const kw = w * U - (U - KEY);
      if (code === 'ArrowUpDown') { // half-height up and down, laptop style
        const hh = (KEY - 4) / 2;
        keycap(g, x, y, kw, hh, 'ArrowUp', '');
        keycap(g, x, y + hh + 4, kw, hh, 'ArrowDown', '');
      } else keycap(g, x, y, kw, KEY, code, letter);
      x += w * U;
    }
  });
  // the four mice: what each button does, with that part of the mouse lit
  const mg = s('g', { transform: `translate(${15 * U + 34} 4)` }, svg);
  MOUSE.forEach(([part, ...words], i) => {
    const x = (i % 2) * 86, y = Math.floor(i / 2) * 156;
    mouse(mg, x, y, part, words);
  });
  if (D.compact) { // the legend: each verb with the keys that do it, in keyboard order
    const by = new Map();
    for (const row of ROWS) for (const [code, , letter] of row) {
      const v = verb(code); if (!v || !letter || ARROW_ROT[code] !== undefined) continue;
      // grouped by the keycap word, so Z X C V make one line (their long words name each arm)
      const text = v[0] === 'tool' ? VERBS.PadUp[1] : v[1];
      if (!by.has(text)) by.set(text, { keys: [], color: groupColor(code) });
      if (!by.get(text).keys.includes(letter)) by.get(text).keys.push(letter);
    }
    for (const [text, { keys, color }] of by) D.legend.push({ chip: keys.length > 4 ? keys[0] + '-' + keys[keys.length - 1] : keys.join(' '), color, text, dark: true });
    for (const [, word, how] of MOUSE) D.legend.push({ chip: 'Mouse', color: '#ff9f4a', text: `${word[0].toUpperCase() + word.slice(1)}: ${how}`, dark: true });
  }
  // a line under it all: the arrows walk too, and where the walk keys are
  s('text', { x: 10 + (15 * U) / 2, y: H - 8, class: 'ctl-foot' }, svg, 'Arrows walk too. 1 to 8 play an emote (3: the dances), G opens the wheel, Tab fans out tools, Z X C V take one.');
  return svg;
}
function mouse(g, x, y, part, words) {
  const m = s('g', { transform: `translate(${x} ${y})` }, g);
  const w = 64, h = 100;
  s('rect', { x: 0, y: 6, width: w, height: h, rx: 32, class: 'ms-sh' }, m);
  s('rect', { x: 0, y: 0, width: w, height: h, rx: 32, class: 'ms-body' }, m);
  const lit = p => part === p || (part === 'both' && (p === 'left' || p === 'right'));
  s('path', { d: `M0 34 V32 A32 32 0 0 1 ${w / 2} 0 V40 H0 Z`, class: 'ms-btn' + (lit('left') ? ' on' : '') }, m);
  s('path', { d: `M${w} 34 V32 A32 32 0 0 0 ${w / 2} 0 V40 H${w} Z`, class: 'ms-btn' + (lit('right') ? ' on' : '') }, m);
  s('path', { d: `M0 40 H${w}`, class: 'ms-seam' }, m);
  s('rect', { x: w / 2 - 6, y: 9, width: 12, height: 22, rx: 6, class: 'ms-wheel' + (part === 'wheel' ? ' on' : '') }, m);
  s('text', { x: w / 2, y: h + 26, class: 'ms-word' }, m, words[0]);
  s('text', { x: w / 2, y: h + 44, class: 'ms-sub' }, m, words[1]);
  if (part === 'right') s('path', { d: `M${w + 4} 58 l10 0 m-4 -5 l5 5 -5 5 M-4 58 l-10 0 m4 -5 l-5 5 5 5`, class: 'ms-move' }, m);
}

// ---------------------------------------------------------------- the phone
function drawPhone() {
  const W = 900, H = 480;
  const svg = svgRoot(W, H, 'A phone showing the touch controls');
  const g = s('g', {}, svg);
  const px = 345, py = 18, pw = 210, ph = 444; // the phone body
  const sx = px + 10, sy = py + 14, sw = pw - 20, sh = ph - 28; // its screen
  const k = sw / 390; // phone CSS px -> picture
  const X = v => sx + v * k, Y = v => sy + v * k;
  s('rect', { x: px, y: py + 7, width: pw, height: ph, rx: 34, class: 'ph-sh' }, g);
  s('rect', { x: px, y: py, width: pw, height: ph, rx: 34, class: 'ph-body' }, g);
  const clipId = 'ph-clip';
  const defs = s('defs', {}, svg);
  const cp = s('clipPath', { id: clipId }, defs);
  s('rect', { x: sx, y: sy, width: sw, height: sh, rx: 24 }, cp);
  const scr = s('g', { 'clip-path': `url(#${clipId})` }, g);
  s('rect', { x: sx, y: sy, width: sw, height: sh * 0.42, class: 'ph-sky' }, scr);
  s('rect', { x: sx, y: sy + sh * 0.42, width: sw, height: sh * 0.58, class: 'ph-grass' }, scr);
  s('path', { d: `M${sx} ${sy + sh * 0.42} q${sw * 0.25} -${sh * 0.06} ${sw * 0.5} 0 t${sw * 0.5} 0`, class: 'ph-hill' }, scr);
  // you, standing in the yard
  { const cx = X(195), cy = Y(430);
    s('ellipse', { cx, cy: cy + 30, rx: 22, ry: 6, class: 'ph-shadow' }, scr);
    s('rect', { x: cx - 13, y: cy - 4, width: 26, height: 32, rx: 10, class: 'ph-shirt' }, scr);
    s('circle', { cx, cy: cy - 16, r: 13, class: 'ph-head' }, scr);
    s('circle', { cx: cx - 4.5, cy: cy - 17, r: 1.8, class: 'ph-eye' }, scr);
    s('circle', { cx: cx + 4.5, cy: cy - 17, r: 1.8, class: 'ph-eye' }, scr);
    s('path', { d: `M${cx - 4} ${cy - 11} q4 3 8 0`, class: 'ph-smile' }, scr); }
  // the HUD at phone scale, in phone CSS px on a 390 x 854 screen: quests top-left, time and weather, the ? and who is here
  // top-right with the minimap under them, the smiley on the left edge, the tool button bottom-left beside fish and treats, the
  // chat and mic over them, the jump and the E on the right
  const pill = (x, y, w, h, cls) => s('rect', { x: X(x), y: Y(y), width: w * k, height: h * k, rx: h * k / 2, class: 'ph-ui ' + cls }, scr);
  const dot = (x, y, r, cls) => s('circle', { cx: X(x), cy: Y(y), r: r * k, class: 'ph-ui ' + cls }, scr);
  const SH = sh / k;                         // the screen's height in phone px
  pill(12, 12, 118, 36, 'orange');           // the quest bar, top-left
  pill(146, 14, 122, 32, 'sky');             // weather and time
  dot(300, 30, 18, 'purple');                // the ?
  s('text', { x: X(300), y: Y(30) + 4.5, class: 'ph-q' }, scr, '?');
  pill(328, 12, 50, 36, 'pink');             // who is here
  s('rect', { x: X(228), y: Y(56), width: 150 * k, height: 112 * k, rx: 22 * k, class: 'ph-ui map' }, scr); // the minimap under them
  pill(263, 155, 80, 26, 'yellow');          // where you are, along its bottom
  const em = [14, 430];                      // the smiley peeking out of the left edge
  s('rect', { x: X(-30), y: Y(em[1] - 33), width: 78 * k, height: 66 * k, rx: 33 * k, class: 'ph-ui purple' }, scr);
  dot(em[0] + 10, em[1], 20, 'paper');
  const tl = [40, SH - 30];                  // the tool button, bottom-left
  dot(tl[0], tl[1], 28, 'orange');
  pill(236, SH - 50, 70, 40, 'paper'); pill(314, SH - 50, 64, 40, 'yellow'); // fish and treats
  pill(12, SH - 108, 228, 42, 'sky'); pill(12, SH - 108, 56, 42, 'yellow');  // the chat bar
  const mc = [269, SH - 87];                 // the mic
  dot(mc[0], mc[1], 21, 'green');
  const jb = [342, SH - 92];                 // the jump
  dot(jb[0], jb[1], 32, 'green');
  s('path', { d: `M${X(jb[0])} ${Y(jb[1]) - 9 * k} l${9 * k} ${10 * k} h${-5 * k} v${9 * k} h${-8 * k} v${-9 * k} h${-5 * k} z`, class: 'ph-arrow' }, scr);
  const eb = [342, SH - 176];                // the big red E over it
  dot(eb[0], eb[1], 36, 'red');
  s('text', { x: X(eb[0]), y: Y(eb[1]) + 6, class: 'ph-e' }, scr, 'E');
  // the thumbstick (it appears where your left thumb lands) and the look drag on the right
  const st = [100, 600];
  s('circle', { cx: X(st[0]), cy: Y(st[1]), r: 55 * k, class: 'ph-joy' }, scr);
  s('circle', { cx: X(st[0] + 16), cy: Y(st[1] - 14), r: 23 * k, class: 'ph-knob' }, scr);
  const lk = [250, 600];
  s('path', { d: `M${X(lk[0] - 55)} ${Y(lk[1])} H${X(lk[0] + 55)} M${X(lk[0] - 55) + 9} ${Y(lk[1]) - 7} l-9 7 9 7 M${X(lk[0] + 55) - 9} ${Y(lk[1]) - 7} l9 7 -9 7`, class: 'ph-drag' }, scr);
  s('circle', { cx: X(lk[0]), cy: Y(lk[1]), r: 16 * k, class: 'ph-touch' }, scr);
  s('circle', { cx: X(st[0] + 16), cy: Y(st[1] - 14), r: 16 * k, class: 'ph-touch' }, scr);
  s('path', { d: `M${X(390 * 0.45)} ${Y(500)} V${Y(690)}`, class: 'ph-split' }, scr);
  s('rect', { x: px + pw / 2 - 30, y: py + 6, width: 60, height: 8, rx: 4, class: 'ph-notch' }, g);

  const c = s('g', { class: 'callouts' }, svg);
  const L = 318, R = 582;
  // the compact picture draws numbered chips about twice the size, so they are spread out down each side
  const cy = (normal, compact) => D.compact ? compact : normal;
  callout(c, { from: [X(60), Y(30)], to: [L, 40], side: 'l', text: TOUCH.quests });
  callout(c, { from: [X(em[0] + 32), Y(em[1])], to: [L, cy(Y(em[1]), 190)], via: D.compact ? [[X(em[0] + 60), 190]] : undefined, side: 'l', text: TOUCH.emotes });
  callout(c, { from: [X(st[0] - 50), Y(st[1])], to: [L, cy(Y(st[1]), 280)], via: D.compact ? [[X(st[0] - 60), 280]] : undefined, side: 'l', text: TOUCH.stick });
  callout(c, { from: [X(30), Y(SH - 87)], to: [L, cy(Y(SH - 87), 370)], via: D.compact ? [[X(20), 370]] : undefined, side: 'l', text: TOUCH.chat });
  callout(c, { from: [X(tl[0] + 30), Y(tl[1])], to: [L, cy(Y(tl[1]), 446)], via: D.compact ? [[X(tl[0] + 40), 446]] : undefined, side: 'l', text: TOUCH.tools });
  callout(c, { from: [X(300), Y(12)], to: [R, cy(40, 36)], via: [[X(300), cy(40, 36)]], side: 'r', chip: '?', chipColor: '#b48cff', chipRound: true, text: TOUCH.help });
  callout(c, { from: [X(378), Y(30)], to: [R, cy(76, 100)], via: [[X(378) + 8, cy(76, 100)]], side: 'r', text: TOUCH.heart });
  callout(c, { from: [X(378), Y(112)], to: [R, cy(112, 164)], via: D.compact ? [[X(378) + 14, 164]] : undefined, side: 'r', text: TOUCH.map });
  callout(c, { from: [X(lk[0] + 55), Y(lk[1])], to: [R, cy(Y(lk[1]), 258)], via: D.compact ? [[X(lk[0] + 75), 258]] : undefined, side: 'r', text: TOUCH.look });
  callout(c, { from: [X(eb[0] + 36), Y(eb[1])], to: [R, cy(Y(eb[1]), 322)], via: D.compact ? [[X(eb[0] + 46), 322]] : undefined, side: 'r', chip: 'E', chipColor: '#e0463c', chipRound: true, text: TOUCH.act });
  callout(c, { from: [X(jb[0] + 32), Y(jb[1])], to: [R, cy(Y(jb[1]), 386)], via: D.compact ? [[X(jb[0] + 44), 386]] : undefined, side: 'r', text: TOUCH.jump });
  callout(c, { from: [X(mc[0]), Y(mc[1] + 21)], to: [R, cy(Y(jb[1]) + 38, 448)], via: [[X(mc[0]), cy(Y(jb[1]) + 38, 448)]], side: 'r', text: TOUCH.mic });
  return svg;
}

const DRAW = { pad: drawPad, kbm: drawKeyboard, touch: drawPhone };

// ---------------------------------------------------------------- the page
// page: the <section data-page="controls">; opts: { input, ui, store }
export function mountControls(page, { input, ui, store }) {
  const tabs = [...page.querySelectorAll('[data-dev]')];
  const pic = page.querySelector('.ctl-pic');
  const more = page.querySelector('.ctl-more');
  const moreList = page.querySelector('.ctl-more-list');
  let dev = null, drawn = null;
  // a phone or tablet counts as touch until a pad is picked up (input.lastDevice starts as 'kbm' before any touch)
  const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const deviceNow = () => input.lastDevice === 'pad' ? 'pad' : input.lastDevice === 'touch' || coarse() ? 'touch' : 'kbm';

  function show(d, focus = false) {
    dev = d;
    for (const t of tabs) {
      const on = t.dataset.dev === d;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle('using', t.dataset.dev === deviceNow());
    }
    // narrow (a phone) or squat (a short window): the words go to a legend so nothing is drawn tiny
    let compact = pic.clientWidth > 0 && pic.clientWidth < 600;
    if (!compact && drawn !== d + compact && pic.clientWidth > 0) {
      D = { compact: false, legend: [] }; pic.replaceChildren(); const probe = DRAW[d](); pic.append(probe);
      const k = probe.getBoundingClientRect().height / probe.viewBox.baseVal.height;
      if (k > 0 && k < 0.6) compact = true; else drawn = d + compact;
    }
    if (drawn !== d + compact || !pic.firstChild) { // measured, so drawn while visible
      D = { compact, legend: [] };
      pic.replaceChildren();
      const svg = DRAW[d]();
      svg.classList.toggle('compact', compact);
      pic.append(svg);
      if (compact) { // crop to what is drawn: the words are in the legend, so the picture can be bigger
        try { const b = svg.getBBox(); if (b.width > 0) svg.setAttribute('viewBox', `${b.x - 6} ${b.y - 6} ${b.width + 12} ${b.height + 12}`); } catch { /* not laid out */ }
      }
      if (D.legend.length) {
        const ul = document.createElement('ul'); ul.className = 'ctl-legend';
        for (const l of D.legend) {
          const li = document.createElement('li');
          const i = document.createElement('i'); i.textContent = l.chip; i.style.setProperty('--c', l.color);
          if (l.round) i.classList.add('round');
          if (l.dark || (l.color !== INK && l.color !== '#3f8fd9' && l.color !== '#e0463c' && l.color !== '#5fbf5a')) i.classList.add('dark');
          const t = document.createElement('span'); t.textContent = l.text;
          li.append(i, t); ul.append(li);
        }
        pic.append(ul);
      }
      drawn = d + compact;
    }
    pic.dataset.dev = d;
    fillMore();
    if (focus) tabs.find(t => t.dataset.dev === d)?.focus();
  }
  // feature help lines, keys named for the device on show (the phone shows the words only)
  function fillMore() {
    const lines = ui.moreHelp || [];
    more.hidden = !lines.length;
    moreList.replaceChildren();
    const name = code => FACE.xbox[code] || code;
    for (const [keys, text] of lines) {
      const li = document.createElement('li');
      const k = document.createElement('span'); k.className = 'ctl-keys';
      const seen = new Set();
      for (const key of keys) {
        const w = keyWord(key, dev, name);
        if (!w || seen.has(w)) continue;
        seen.add(w);
        const kb = document.createElement('kbd'); kb.textContent = w; k.append(kb);
      }
      const t = document.createElement('span'); t.textContent = text;
      li.append(k, t);
      moreList.append(li);
    }
  }
  for (const t of tabs) { t.addEventListener('click', () => show(t.dataset.dev)); t.addEventListener('focus', () => { if (t.dataset.dev !== dev) show(t.dataset.dev); }); }
  // a rotated phone or a resized window redraws the picture for its new shape (wide callouts or the compact legend)
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!page.hidden && dev && pic.offsetParent) { drawn = null; show(dev); } }, 150); });
  page.addEventListener('keydown', e => { // arrow keys walk the tabs like any tab strip
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault(); e.stopPropagation();
    show(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.dev, true);
  });
  return {
    // the page opens on the device you used last (the HUD tracks pad vs keyboard; touch = phone)
    onShow() { drawn = null; show(deviceNow()); },
    show,
    // the "in use" badge follows the device you pick up while the page is open
    markUsing() { const now = deviceNow(); for (const t of tabs) t.classList.toggle('using', t.dataset.dev === now); },
    get device() { return dev; },
    deviceNow,
    deviceName: d => DEVICES.find(x => x.id === d)?.name || '',
  };
}
export { RUN_KEYS, MOVE_KEYS };
