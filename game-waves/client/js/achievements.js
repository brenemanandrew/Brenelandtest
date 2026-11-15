// Achievements: the toast when you earn one and the list in Settings > You > Achievements. The server keeps them
// (lib/achievements.js, a guest's for the visit only) and sends { t: 'achs', defs, got, guest } on join and { t: 'ach', id, at, guest }
// as each is earned. Each one's picture is drawn here on a brass medallion by ICONS[def.icon], or its title's first letter.
import { el, loadCss } from './util.js';
import { ICONS as SET_ICONS } from './settings.js';

const CREAM = '#f3e6c4', DARK = '#241c26', BRASS = '#c9a24a', BRASS_DK = '#7a5a22';
const line = (g, w, col) => { g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; };
// painters: draw the glyph centred at 0,0 for a medallion of radius r, in `ink` (the achievement's colour, or grey when locked)
export const ICONS = {
  // an arched doorway with daylight in it and the steps up
  door(g, r, ink) {
    const arch = (k, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(-r * k, r * 0.4); g.lineTo(-r * k, -r * 0.08); g.arc(0, -r * 0.08, r * k, Math.PI, 0); g.lineTo(r * k, r * 0.4); g.closePath(); g.fill(); };
    arch(0.42, ink); arch(0.27, CREAM);                                  // the stones round it, the daylight in it
    g.fillStyle = ink; for (let i = 0; i < 3; i++) g.fillRect(-r * (0.27 - i * 0.04), r * (0.3 - i * 0.1), r * (0.54 - i * 0.08), r * 0.06); // the steps up
    g.fillStyle = DARK; g.fillRect(-r * 0.03, -r * 0.5, r * 0.06, r * 0.1);
  },
  // a lantern, its flame lit
  lantern(g, r, ink) {
    line(g, r * 0.07, ink);
    g.beginPath(); g.arc(0, -r * 0.48, r * 0.12, Math.PI, 0); g.stroke();
    g.fillStyle = ink; g.fillRect(-r * 0.28, -r * 0.38, r * 0.56, r * 0.1); g.fillRect(-r * 0.3, r * 0.34, r * 0.6, r * 0.1);
    g.strokeRect(-r * 0.22, -r * 0.28, r * 0.44, r * 0.62);
    g.fillStyle = CREAM; g.beginPath(); g.moveTo(0, -r * 0.16); g.quadraticCurveTo(r * 0.14, r * 0.08, 0, r * 0.2); g.quadraticCurveTo(-r * 0.14, r * 0.08, 0, -r * 0.16); g.fill();
  },
  // three claw scratches, and the one that missed
  claws(g, r, ink) {
    line(g, r * 0.1, ink);
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-r * 0.32 + i * r * 0.2, -r * 0.42); g.quadraticCurveTo(i * r * 0.2 + r * 0.02, -r * 0.02, r * 0.3 + i * r * 0.2, r * 0.4); g.stroke(); }
    line(g, r * 0.05, CREAM); g.setLineDash([r * 0.06, r * 0.08]); g.beginPath(); g.arc(r * 0.42, r * 0.36, r * 0.12, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  },
  // a curtain with two eyes peeking out of the gap
  curtain(g, r, ink) {
    g.fillStyle = ink;
    g.fillRect(-r * 0.5, -r * 0.5, r, r * 0.1);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.48, -r * 0.42); g.lineTo(s * r * 0.08, -r * 0.42); g.quadraticCurveTo(s * r * 0.2, r * 0.1, s * r * 0.06, r * 0.46); g.lineTo(s * r * 0.48, r * 0.46); g.closePath(); g.fill(); }
    g.fillStyle = CREAM; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.045, -r * 0.02, r * 0.035, 0, Math.PI * 2); g.fill(); }
  },
  // a round cartoon face with X eyes (kind: a little smile)
  xeyes(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.arc(0, 0, r * 0.44, 0, Math.PI * 2); g.fill();
    line(g, r * 0.07, DARK);
    for (const s of [-1, 1]) { const x = s * r * 0.17, y = -r * 0.08, k = r * 0.08; g.beginPath(); g.moveTo(x - k, y - k); g.lineTo(x + k, y + k); g.moveTo(x + k, y - k); g.lineTo(x - k, y + k); g.stroke(); }
    g.beginPath(); g.arc(0, r * 0.1, r * 0.16, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  },
  // three small lanterns together
  party(g, r, ink) {
    for (const [x, y, s] of [[-r * 0.3, r * 0.08, 0.8], [r * 0.3, r * 0.08, 0.8], [0, -r * 0.06, 1]]) {
      g.save(); g.translate(x, y); g.scale(s, s);
      g.fillStyle = ink; g.fillRect(-r * 0.14, -r * 0.24, r * 0.28, r * 0.06); g.fillRect(-r * 0.16, r * 0.2, r * 0.32, r * 0.06);
      line(g, r * 0.05, ink); g.strokeRect(-r * 0.11, -r * 0.18, r * 0.22, r * 0.38);
      g.fillStyle = CREAM; g.beginPath(); g.ellipse(0, r * 0.02, r * 0.05, r * 0.09, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  },
  // ---- the weekly goals (w16-goals)
  // an Elder Sign: a five-pointed star of strokes with an eye in the middle
  sign(g, r, ink) {
    line(g, r * 0.09, ink);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46); g.stroke(); }
    g.fillStyle = DARK; g.beginPath(); g.ellipse(0, 0, r * 0.2, r * 0.11, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = ink; g.lineWidth = r * 0.06; g.stroke();
    g.fillStyle = CREAM; g.beginPath(); g.arc(0, 0, r * 0.05, 0, Math.PI * 2); g.fill();
  },
  // the cask, and the flame of the beacon over it
  cask(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.moveTo(-r * 0.3, r * 0.42); g.quadraticCurveTo(-r * 0.4, r * 0.1, -r * 0.3, -r * 0.1); g.lineTo(r * 0.3, -r * 0.1); g.quadraticCurveTo(r * 0.4, r * 0.1, r * 0.3, r * 0.42); g.closePath(); g.fill();
    g.fillStyle = DARK; g.fillRect(-r * 0.36, r * 0.02, r * 0.72, r * 0.05); g.fillRect(-r * 0.36, r * 0.26, r * 0.72, r * 0.05);
    g.fillStyle = CREAM; g.beginPath(); g.moveTo(0, -r * 0.5); g.quadraticCurveTo(r * 0.18, -r * 0.3, 0, -r * 0.14); g.quadraticCurveTo(-r * 0.18, -r * 0.3, 0, -r * 0.5); g.fill();
  },
  // a scout's cap over a neckerchief
  scout(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.arc(0, -r * 0.06, r * 0.3, Math.PI, 0); g.fill(); g.fillRect(-r * 0.3, -r * 0.08, r * 0.78, r * 0.08);
    g.fillStyle = CREAM; g.beginPath(); g.moveTo(-r * 0.34, r * 0.1); g.lineTo(r * 0.34, r * 0.1); g.lineTo(0, r * 0.48); g.closePath(); g.fill();
    g.fillStyle = DARK; g.beginPath(); g.arc(0, r * 0.14, r * 0.05, 0, Math.PI * 2); g.fill();
  },
  // a closed book with a clasp
  book(g, r, ink) {
    g.fillStyle = ink; g.fillRect(-r * 0.32, -r * 0.4, r * 0.64, r * 0.8);
    g.fillStyle = CREAM; g.fillRect(-r * 0.26, -r * 0.34, r * 0.52, r * 0.68);
    g.fillStyle = ink; g.fillRect(-r * 0.32, -r * 0.4, r * 0.1, r * 0.8); g.fillRect(r * 0.12, -r * 0.08, r * 0.2, r * 0.16);
    g.fillStyle = DARK; for (let i = 0; i < 4; i++) g.fillRect(-r * 0.14, -r * 0.24 + i * r * 0.14, r * 0.26, r * 0.04);
  },
  // four pages, fanned
  pages(g, r, ink) {
    for (let i = 0; i < 4; i++) { g.save(); g.rotate(-0.3 + i * 0.2); g.fillStyle = i === 3 ? CREAM : ink; g.fillRect(-r * 0.2, -r * 0.36, r * 0.4, r * 0.56); if (i === 3) { g.fillStyle = DARK; for (let k = 0; k < 4; k++) g.fillRect(-r * 0.12, -r * 0.26 + k * r * 0.11, r * 0.24 - (k % 2) * r * 0.08, r * 0.035); } g.restore(); }
  },  // ---- the table games (tg-look)
  // a domino standing, its two halves' pips
  'tg-domino'(g, r, ink) {
    g.fillStyle = CREAM; g.strokeStyle = ink; g.lineWidth = r * 0.08; g.beginPath(); g.roundRect(-r * 0.22, -r * 0.44, r * 0.44, r * 0.88, r * 0.08); g.fill(); g.stroke();
    g.fillStyle = ink; g.fillRect(-r * 0.15, -r * 0.02, r * 0.3, r * 0.04);
    for (const [x, y] of [[-0.09, -0.3], [0.09, -0.14], [0, -0.22], [-0.09, 0.14], [0.09, 0.14], [-0.09, 0.3], [0.09, 0.3]]) { g.beginPath(); g.arc(x * r, y * r, r * 0.045, 0, Math.PI * 2); g.fill(); }
  },
  // a trophy cup with a pip on it
  'tg-cup'(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.moveTo(-r * 0.3, -r * 0.38); g.lineTo(r * 0.3, -r * 0.38); g.quadraticCurveTo(r * 0.28, r * 0.08, 0, r * 0.12); g.quadraticCurveTo(-r * 0.28, r * 0.08, -r * 0.3, -r * 0.38); g.fill();
    g.lineWidth = r * 0.07; g.strokeStyle = ink; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.3, -r * 0.2, r * 0.13, s < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, s < 0 ? Math.PI * 1.5 : Math.PI * 0.5, s > 0); g.stroke(); }
    g.fillRect(-r * 0.05, r * 0.1, r * 0.1, r * 0.16); g.fillRect(-r * 0.2, r * 0.26, r * 0.4, r * 0.1);
    g.fillStyle = DARK; g.beginPath(); g.arc(0, -r * 0.16, r * 0.07, 0, Math.PI * 2); g.fill();
  },
  // a little bot with a crown knocked askew
  'tg-bot'(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.roundRect(-r * 0.3, -r * 0.16, r * 0.6, r * 0.48, r * 0.1); g.fill();
    g.fillStyle = DARK; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.13, r * 0.06, r * 0.07, 0, Math.PI * 2); g.fill(); }
    g.fillRect(-r * 0.12, r * 0.2, r * 0.24, r * 0.04);
    g.save(); g.translate(r * 0.08, -r * 0.3); g.rotate(0.35); g.fillStyle = CREAM; g.beginPath(); g.moveTo(-r * 0.2, r * 0.08); g.lineTo(-r * 0.2, -r * 0.08); g.lineTo(-r * 0.1, 0); g.lineTo(0, -r * 0.12); g.lineTo(r * 0.1, 0); g.lineTo(r * 0.2, -r * 0.08); g.lineTo(r * 0.2, r * 0.08); g.closePath(); g.fill(); g.restore();
  },
  // four friends round a table
  'tg-friends'(g, r, ink) {
    g.fillStyle = CREAM; g.beginPath(); g.arc(0, 0, r * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, r * 0.12, 0, Math.PI * 2); g.fill(); }
  },
  // a double lying across, a star over it
  'tg-double'(g, r, ink) {
    g.fillStyle = CREAM; g.strokeStyle = ink; g.lineWidth = r * 0.07; g.beginPath(); g.roundRect(-r * 0.18, -r * 0.2, r * 0.36, r * 0.64, r * 0.06); g.fill(); g.stroke();
    g.fillStyle = ink; g.fillRect(-r * 0.12, r * 0.1, r * 0.24, r * 0.03);
    for (const y of [-0.06, 0.26]) for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.07, y * r, r * 0.04, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.07 : r * 0.16; g.lineTo(Math.cos(a) * q, -r * 0.38 + Math.sin(a) * q); } g.closePath(); g.fill();
  },
  // a blank half: zero
  'tg-zero'(g, r, ink) {
    g.strokeStyle = ink; g.lineWidth = r * 0.1; g.beginPath(); g.ellipse(0, 0, r * 0.22, r * 0.32, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = CREAM; g.beginPath(); g.arc(r * 0.28, -r * 0.3, r * 0.06, 0, Math.PI * 2); g.fill();
  },
  // a toy engine
  'tg-train'(g, r, ink) {
    g.fillStyle = ink; g.fillRect(-r * 0.38, -r * 0.02, r * 0.5, r * 0.22); g.fillRect(-r * 0.38, -r * 0.3, r * 0.24, r * 0.3); g.fillRect(r * 0.04, -r * 0.24, r * 0.1, r * 0.22);
    g.beginPath(); g.moveTo(r * 0.12, -r * 0.02); g.lineTo(r * 0.36, r * 0.2); g.lineTo(r * 0.12, r * 0.2); g.fill();
    g.fillStyle = CREAM; g.fillRect(-r * 0.33, -r * 0.24, r * 0.14, r * 0.1);
    g.fillStyle = DARK; for (const x of [-0.28, -0.04, 0.16]) { g.beginPath(); g.arc(x * r, r * 0.26, r * 0.08, 0, Math.PI * 2); g.fill(); g.strokeStyle = ink; g.lineWidth = r * 0.03; g.stroke(); }
  },
  // ---- the new table games (game waves): Word Weave, The Missing Pie, Town Tycoon
  // seven letter tiles on a rack (Word Weave's Full Weave)
  'ww-rack'(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.moveTo(-r * 0.5, r * 0.12); g.lineTo(r * 0.5, r * 0.12); g.lineTo(r * 0.44, r * 0.3); g.lineTo(-r * 0.44, r * 0.3); g.closePath(); g.fill();
    for (let i = 0; i < 7; i++) { const x = -r * 0.47 + i * r * 0.135, y = i % 2 ? -r * 0.16 : -r * 0.2; g.fillStyle = CREAM; g.beginPath(); g.roundRect(x, y, r * 0.12, r * 0.28, r * 0.03); g.fill(); g.fillStyle = DARK; g.fillRect(x + r * 0.04, y + r * 0.08, r * 0.04, r * 0.12); }
    g.fillStyle = CREAM; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.06 : r * 0.14; g.lineTo(Math.cos(a) * q, -r * 0.36 + Math.sin(a) * q); } g.closePath(); g.fill();
  },
  // one big letter tile with its points in the corner
  'ww-tile'(g, r, ink) {
    g.fillStyle = CREAM; g.strokeStyle = ink; g.lineWidth = r * 0.08; g.beginPath(); g.roundRect(-r * 0.34, -r * 0.34, r * 0.68, r * 0.68, r * 0.08); g.fill(); g.stroke();
    g.fillStyle = DARK; g.font = `700 ${Math.round(r * 0.5)}px "Fredoka", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('W', -r * 0.02, r * 0.02);
    g.fillStyle = ink; g.font = `700 ${Math.round(r * 0.18)}px "Fredoka", sans-serif`; g.fillText('50', r * 0.2, r * 0.22);
  },
  // a bonus square with three stacked chevrons
  'ww-triple'(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.roundRect(-r * 0.36, -r * 0.36, r * 0.72, r * 0.72, r * 0.06); g.fill();
    line(g, r * 0.08, CREAM);
    for (let i = 0; i < 3; i++) { const y = -r * 0.04 + (i - 1) * r * 0.18; g.beginPath(); g.moveTo(-r * 0.18, y + r * 0.08); g.lineTo(0, y - r * 0.06); g.lineTo(r * 0.18, y + r * 0.08); g.stroke(); }
  },
  // an empty rack and one tile leaving it
  'ww-last'(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.moveTo(-r * 0.44, r * 0.2); g.lineTo(r * 0.44, r * 0.2); g.lineTo(r * 0.38, r * 0.36); g.lineTo(-r * 0.38, r * 0.36); g.closePath(); g.fill();
    g.save(); g.translate(r * 0.08, -r * 0.18); g.rotate(0.25);
    g.fillStyle = CREAM; g.strokeStyle = ink; g.lineWidth = r * 0.06; g.beginPath(); g.roundRect(-r * 0.16, -r * 0.16, r * 0.32, r * 0.32, r * 0.04); g.fill(); g.stroke();
    g.fillStyle = DARK; g.fillRect(-r * 0.04, -r * 0.08, r * 0.08, r * 0.16); g.restore();
    line(g, r * 0.05, ink); for (const [x, y] of [[-0.3, -0.02], [-0.22, -0.2]]) { g.beginPath(); g.moveTo(x * r, y * r); g.lineTo(x * r - r * 0.1, y * r + r * 0.06); g.stroke(); }
  },
  // a pie with one slice gone (The Missing Pie: solved)
  'mp-pie'(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.moveTo(0, r * 0.04); g.arc(0, r * 0.04, r * 0.4, -Math.PI * 0.25, Math.PI * 1.45); g.closePath(); g.fill();
    g.fillStyle = DARK; for (let i = 0; i < 4; i++) { const a = Math.PI * (0.05 + i * 0.35); g.fillRect(Math.cos(a) * r * 0.22 - r * 0.03, r * 0.04 + Math.sin(a) * r * 0.22 - r * 0.03, r * 0.06, r * 0.06); }
    line(g, r * 0.05, CREAM); g.beginPath(); g.arc(0, r * 0.04, r * 0.34, -Math.PI * 0.2, Math.PI * 1.4); g.stroke();
    g.fillStyle = CREAM; g.beginPath(); g.arc(r * 0.3, -r * 0.34, r * 0.06, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(r * 0.42, -r * 0.18, r * 0.04, 0, Math.PI * 2); g.fill(); // (the crumbs)
  },
  // a round clock with a small pie slice for its hand
  'mp-clock'(g, r, ink) {
    g.fillStyle = CREAM; g.strokeStyle = ink; g.lineWidth = r * 0.09; g.beginPath(); g.arc(0, r * 0.04, r * 0.36, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = ink; g.fillRect(-r * 0.08, -r * 0.48, r * 0.16, r * 0.08);
    g.beginPath(); g.moveTo(0, r * 0.04); g.arc(0, r * 0.04, r * 0.28, -Math.PI / 2, -Math.PI / 2 + Math.PI / 3); g.closePath(); g.fill();
    g.fillStyle = DARK; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.arc(Math.cos(a) * r * 0.27, r * 0.04 + Math.sin(a) * r * 0.27, r * 0.03, 0, Math.PI * 2); g.fill(); }
  },
  // a speech bubble with a question mark, and nobody's answer (three dots crossed)
  'mp-ask'(g, r, ink) {
    g.fillStyle = ink; g.beginPath(); g.ellipse(0, -r * 0.08, r * 0.4, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-r * 0.18, r * 0.14); g.lineTo(-r * 0.28, r * 0.38); g.lineTo(r * 0.02, r * 0.2); g.fill();
    g.fillStyle = DARK; g.font = `700 ${Math.round(r * 0.46)}px "Fredoka", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, -r * 0.06);
    g.fillStyle = CREAM; for (const x of [0.16, 0.28, 0.4]) { g.beginPath(); g.arc(x * r, r * 0.36, r * 0.04, 0, Math.PI * 2); g.fill(); }
  },
  // two street signs side by side, the same colour
  'tt-pair'(g, r, ink) {
    for (const s of [-1, 1]) {
      g.fillStyle = CREAM; g.fillRect(s * r * 0.2 - r * 0.035, -r * 0.1, r * 0.07, r * 0.5);
      g.fillStyle = ink; g.beginPath(); g.roundRect(s * r * 0.2 - r * 0.18, -r * 0.4, r * 0.36, r * 0.32, r * 0.05); g.fill();
      g.fillStyle = CREAM; g.fillRect(s * r * 0.2 - r * 0.12, -r * 0.3, r * 0.24, r * 0.04); g.fillRect(s * r * 0.2 - r * 0.12, -r * 0.2, r * 0.16, r * 0.04);
    }
  },
  // a little shop with an awning
  'tt-shop'(g, r, ink) {
    g.fillStyle = ink; g.fillRect(-r * 0.34, -r * 0.08, r * 0.68, r * 0.46);
    g.fillStyle = CREAM; g.beginPath(); g.moveTo(-r * 0.42, -r * 0.06); g.lineTo(-r * 0.34, -r * 0.34); g.lineTo(r * 0.34, -r * 0.34); g.lineTo(r * 0.42, -r * 0.06); g.closePath(); g.fill();
    g.fillStyle = ink; for (let i = 0; i < 4; i += 2) g.fillRect(-r * 0.34 + i * r * 0.17 + r * 0.04, -r * 0.34, r * 0.17, r * 0.28);
    g.fillStyle = DARK; g.fillRect(-r * 0.08, r * 0.1, r * 0.16, r * 0.28);
    g.fillStyle = CREAM; g.fillRect(-r * 0.28, r * 0.04, r * 0.14, r * 0.12); g.fillRect(r * 0.14, r * 0.04, r * 0.14, r * 0.12);
  },
  // a stack of coins with a B on the top one
  'tt-coins'(g, r, ink) {
    for (let i = 0; i < 4; i++) { const y = r * 0.3 - i * r * 0.13; g.fillStyle = ink; g.beginPath(); g.ellipse(-r * 0.06, y, r * 0.28, r * 0.1, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = DARK; g.lineWidth = r * 0.03; g.stroke(); }
    g.fillStyle = ink; g.beginPath(); g.arc(r * 0.26, -r * 0.18, r * 0.2, 0, Math.PI * 2); g.fill(); g.strokeStyle = DARK; g.lineWidth = r * 0.03; g.stroke();
    g.fillStyle = DARK; g.font = `700 ${Math.round(r * 0.26)}px "Fredoka", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B', r * 0.26, -r * 0.16);
  },
  // a crown on top of one house
  'tt-crown'(g, r, ink) {
    g.fillStyle = CREAM; g.beginPath(); g.moveTo(-r * 0.26, r * 0.1); g.lineTo(0, -r * 0.1); g.lineTo(r * 0.26, r * 0.1); g.lineTo(r * 0.26, r * 0.42); g.lineTo(-r * 0.26, r * 0.42); g.closePath(); g.fill();
    g.fillStyle = DARK; g.fillRect(-r * 0.07, r * 0.2, r * 0.14, r * 0.22);
    g.fillStyle = ink; g.beginPath(); g.moveTo(-r * 0.24, -r * 0.16); g.lineTo(-r * 0.26, -r * 0.44); g.lineTo(-r * 0.12, -r * 0.3); g.lineTo(0, -r * 0.48); g.lineTo(r * 0.12, -r * 0.3); g.lineTo(r * 0.26, -r * 0.44); g.lineTo(r * 0.24, -r * 0.16); g.closePath(); g.fill();
  },
};
// a medallion: brass ring, a dark face, the glyph (or a letter, or "?" for a locked secret)
export function paintIcon(g, size, def, earned) {
  const r = size / 2;
  g.clearRect(0, 0, size, size);
  g.save(); g.translate(r, r);
  g.fillStyle = earned ? BRASS_DK : '#4a4650'; g.beginPath(); g.arc(0, 0, r * 0.98, 0, Math.PI * 2); g.fill();
  g.fillStyle = earned ? BRASS : '#77727c'; g.beginPath(); g.arc(0, 0, r * 0.9, 0, Math.PI * 2); g.fill();
  g.fillStyle = earned ? DARK : '#34303a'; g.beginPath(); g.arc(0, 0, r * 0.76, 0, Math.PI * 2); g.fill();
  if (earned) { g.fillStyle = 'rgba(255, 220, 140, 0.12)'; g.beginPath(); g.arc(-r * 0.2, -r * 0.25, r * 0.42, 0, Math.PI * 2); g.fill(); } // candlelight on the face
  const ink = earned ? (def.color || BRASS) : '#6c6772';
  if (!earned && def.secret) { g.fillStyle = ink; g.font = `700 ${Math.round(r * 0.9)}px "Special Elite", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, r * 0.06); }
  else if (ICONS[def.icon]) ICONS[def.icon](g, r, ink);
  else { g.fillStyle = ink; g.font = `700 ${Math.round(r * 0.8)}px "Special Elite", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((def.title || '?')[0], 0, r * 0.05); }
  g.restore();
}
function iconEl(def, earned, size = 48) {
  const c = el('canvas', 'ach-ic'); const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * dpr); c.style.width = c.style.height = size + 'px';
  paintIcon(c.getContext('2d'), c.width, def, earned);
  return c;
}
// a trophy for the profile's row (the settings icons' style: constant SVG)
SET_ICONS.trophy = '<path d="M10 5 h12 v7 a6 6 0 0 1 -12 0 z" fill="#fff" stroke="#2b2340" stroke-width="3" stroke-linejoin="round"/><path d="M10 7 h-4 a4 4 0 0 0 4 6 M22 7 h4 a4 4 0 0 1 -4 6 M16 18 v5 M11 27 h10 l-1 -4 h-8 z" fill="none" stroke="#2b2340" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';

export function createAchievements(ctx) {
  const { net, ui, audio } = ctx;
  loadCss('/css/achievements.css');
  let defs = [], got = {}, guest = true, page = null, entry = null;
  const byId = id => defs.find(d => d.id === id);
  const earnedN = () => defs.filter(d => got[d.id]).length;

  // ---- the toast: the medallion, "Achievement!", the title and its line (a guest is reminded they do not keep it)
  const shown = [], held = [];
  // toasts wait out a scare: the ghoul has you below, you're being taken, or the maze run's card is up (maze-result.js)
  const busy = () => (ctx.below ? !!ctx.below.ghoul?.frozen : (!!ctx.player.takeover && !ctx.player.controls) || !!ctx.mazeResult?.holding);
  function toast(def, isGuest) {
    if (busy()) { held.push([def, isGuest]); return; }
    const t = el('div', 'toast ach-toast', '', { role: 'status' });
    const tx = el('div', 'ach-tx');
    tx.append(el('small', 'ach-kick', 'Achievement!'), el('b', 'ach-title', def.title), el('span', 'ach-line', def.line));
    if (isGuest) tx.append(el('span', 'ach-guest', 'Guests do not keep achievements. Make an account to keep them.'));
    t.append(iconEl(def, true, 46), tx);
    ui.el.toasts.append(t);
    shown.push({ id: def.id, at: performance.now() }); if (shown.length > 20) shown.shift();
    audio.ui?.('sparkle');
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 600); }, isGuest ? 7000 : 5600);
  }
  net.on('achs', m => { defs = Array.isArray(m.defs) ? m.defs : []; got = m.got && typeof m.got === 'object' ? m.got : {}; guest = !!m.guest; refresh(); });
  net.on('ach', m => {
    if (got[m.id]) return;
    got[m.id] = m.at || Date.now();
    const d = byId(m.id);
    if (d) toast(d, !!m.guest);
    else net.send({ t: 'achs?' });
    refresh();
  });

  // ---- the list: a settings page of its own, opened from a row on the You page
  function mount() {
    if (page || !ui.settings) return;
    page = ui.settings.addSection('achievements', { title: 'Achievements', icon: 'trophy', color: '#e6b24a' });
    page.row.hidden = true; // keeps the top page short
    page.row.remove();
    const you = document.querySelector('#help [data-page="you"] .set-body');
    entry = el('button', 'set-line ach-entry', '', { type: 'button', 'data-open': 'achievements' });
    entry.append(el('span', 'set-line-t'), el('i', 'set-chev', '', { 'aria-hidden': 'true' }));
    entry.firstChild.append(el('b', '', 'Achievements'), el('small', 'ach-count', ''));
    const acts = you?.querySelector('.you-actions');
    if (acts) acts.after(entry); else you?.append(entry);
    ui.settings.onShow('achievements', () => { audio.play?.('menu-page'); net.send({ t: 'achs?' }); fill(); });
    refresh();
  }
  function fill() {
    if (!page) return;
    const body = page.body;
    body.replaceChildren();
    body.append(el('p', 'ach-sum', defs.length ? `${earnedN()} of ${defs.length} earned` : 'Nothing to earn yet.'));
    if (guest) body.append(el('p', 'ach-note', 'You are visiting as a guest: achievements last for this visit only. Make an account to keep them.'));
    const list = el('ul', 'ach-list');
    for (const d of defs) {
      const on = !!got[d.id], hide = !on && d.secret;
      const li = el('li', 'ach-row' + (on ? ' on' : ' locked'));
      const tx = el('div', 'ach-tx');
      tx.append(el('b', 'ach-title', hide ? '???' : d.title), el('span', 'ach-line', hide ? 'A secret. Keep exploring!' : d.line));
      tx.append(el('small', 'ach-when', on ? 'Earned ' + new Date(got[d.id]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not yet'));
      li.append(iconEl(d, on, 52), tx);
      list.append(li);
    }
    body.append(list);
  }
  function refresh() {
    const n = earnedN(), txt = defs.length ? `${n} of ${defs.length}` : '';
    if (entry) { const sm = entry.querySelector('.ach-count'); if (sm.textContent !== txt) sm.textContent = txt; }
    if (page && ui.settings.page === 'achievements') fill();
  }

  return {
    name: 'achievements',
    get defs() { return defs; }, get got() { return got; }, get guest() { return guest; }, get shown() { return shown; },
    get earned() { return earnedN(); },
    open() { mount(); ui.settings?.open('you'); ui.settings?.open('achievements'); },
    paintIcon,
    update() { if (!page) mount(); if (held.length && !busy()) for (const [d, g] of held.splice(0)) toast(d, g); },
  };
}
