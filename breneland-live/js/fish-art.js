// Fishing art: cartoon SVG icons (inventory, catch card, counter) and little cel-shaded 3D fish and junk.
// Everything is procedural; the SVG strings are constants (never built from user text), so innerHTML is safe here.
import * as THREE from 'three';
import { toon } from './toon.js';
import { GEO } from './batch.js';
import { SPECIES, sizeScale } from './fish-data.js';

const INK = '#2b2340';
const S = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
const S2 = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;

// ------------------------------------------------------------------ SVG

const BODY = 'M93 35 C86 16 52 10 26 29 L26 41 C52 60 86 54 93 35 Z';
const TAIL = 'M30 35 L5 14 Q13 35 5 56 Z';

function eye(cx, cy, r = 6.5) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" ${S2}/><circle cx="${cx + 1.2}" cy="${cy + 0.4}" r="${r * 0.55}" fill="${INK}"/><circle cx="${cx + 2.4}" cy="${cy - 1.6}" r="${r * 0.2}" fill="#fff"/>`;
}
function sparkle(x, y, k = 1) {
  return `<path d="M${x} ${y - 7 * k} l${2 * k} ${5 * k} ${5 * k} ${2 * k} ${-5 * k} ${2 * k} ${-2 * k} ${5 * k} ${-2 * k} ${-5 * k} ${-5 * k} ${-2 * k} ${5 * k} ${-2 * k}z" fill="#fffbe0" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

const FISH_SVG = {
  streamlined(id, s) {
    let deco = '';
    if (s.stripe && id === 'perch') for (const x of [40, 50, 60, 70]) deco += `<path d="M${x} 8 L${x - 6} 62" stroke="${s.stripe}" stroke-width="5" opacity="0.85"/>`;
    if (s.stripe && id === 'mackerel') for (const y of [22, 29, 36]) deco += `<path d="M24 ${y} q8 -5 16 0 t16 0 t16 0 t16 0" fill="none" stroke="${s.stripe}" stroke-width="3" opacity="0.85"/>`;
    if (s.band) deco += `<path d="M22 33 Q58 27 96 33 L96 39 Q58 34 22 40Z" fill="${s.band}" opacity="0.9"/>`;   // the trout's pink stripe
    if (s.spots && (id === 'trout' || id === 'pike')) for (const [x, y] of [[36, 24], [48, 19], [58, 25], [70, 20], [44, 44], [62, 45], [32, 37], [76, 40]]) deco += `<ellipse cx="${x}" cy="${y}" rx="${id === 'pike' ? 3.6 : 2}" ry="${id === 'pike' ? 2 : 2}" fill="${s.spots}" opacity="0.9"/>`;
    if (s.spots && id === 'sturgeon') for (const x of [34, 44, 54, 64, 74]) deco += `<path d="M${x} 17 l4 4 l-4 4 l-4 -4z" fill="${s.spots}" ${S2}/>`;   // the bony plates along its back
    if (s.spots && id === 'sunfish') for (const [x, y] of [[40, 26], [52, 22], [62, 30], [48, 34], [70, 24]]) deco += `<circle cx="${x}" cy="${y}" r="2.6" fill="${s.spots}" opacity="0.9"/>`;
    const dorsal = id === 'bass' ? 'M42 19 l4 -10 5 8 5 -11 5 10 5 -9 5 12 Z' : id === 'pike' ? 'M30 26 Q36 14 46 22 Z' : id === 'sturgeon' ? 'M30 26 Q38 12 48 21 Z' : id === 'catfish' ? 'M50 17 Q56 3 66 17 Z' : id === 'sunfish' ? 'M44 17 Q58 6 76 17 Z' : 'M46 18 Q58 1 76 18 Z';
    // a deep round sunfish and a long thin pike: the same drawing, squashed or stretched
    const wrap = id === 'sunfish' ? ['<g transform="translate(0 -8.75) scale(1 1.25)">', '</g>'] : id === 'pike' || id === 'sturgeon' ? ['<g transform="translate(0 7) scale(1 0.8)">', '</g>'] : ['', ''];
    const extra = id === 'catfish' ? `<path d="M92 38 q8 6 6 16 M90 40 q2 8 -4 14 M90 33 q8 -4 9 -12" fill="none" ${S2}/>` : id === 'sturgeon' ? `<path d="M90 33 l9 1 l-8 4" fill="${s.color}" ${S2}/><path d="M86 41 q1 5 -2 8 M82 42 q0 5 -3 7" fill="none" ${S2}/>` : '';
    return wrap[0] + `<path d="${TAIL}" fill="${s.fin}" ${S}/><path d="${dorsal}" fill="${s.fin}" ${S}/>` +
      `<clipPath id="fc-${id}"><path d="${BODY}"/></clipPath>` +
      `<path d="${BODY}" fill="${s.color}"/><g clip-path="url(#fc-${id})"><path d="M20 40 Q60 30 100 40 V70 H20Z" fill="${s.belly}"/>${deco}</g>` +
      `<path d="${BODY}" fill="none" ${S}/>` +
      `<path d="M60 43 Q52 57 44 50 Q50 46 60 43Z" fill="${s.fin}" ${S2}/>` +
      `<path d="M68 22 q-6 13 0 26" fill="none" ${S2} opacity="0.45"/>` +
      eye(79, 29) + `<path d="M93 37 q-5 3 -9 1" fill="none" ${S2}/>` +
      extra + (id === 'golden' ? sparkle(20, 12, 1) + sparkle(84, 56, 0.8) + sparkle(56, 7, 0.7) : '') + wrap[1];
  },
  flounder(id, s) {
    let spots = '';
    for (const [x, y, r] of [[38, 34, 4], [52, 28, 3.2], [60, 40, 4.2], [46, 44, 3], [70, 33, 3]]) spots += `<circle cx="${x}" cy="${y}" r="${r}" fill="${s.spots}" opacity="0.8"/>`;
    return `<path d="M14 34 Q4 22 8 14 Q26 24 30 30 Z M14 36 Q4 48 8 56 Q26 46 30 40 Z" fill="${s.fin}" ${S}/>` +
      `<ellipse cx="52" cy="35" rx="40" ry="24" fill="${s.fin}" ${S}/>` +
      `<clipPath id="fc-${id}"><ellipse cx="52" cy="35" rx="35" ry="19"/></clipPath>` +
      `<ellipse cx="52" cy="35" rx="35" ry="19" fill="${s.color}"/><g clip-path="url(#fc-${id})">${spots}</g><ellipse cx="52" cy="35" rx="35" ry="19" fill="none" ${S}/>` +
      eye(76, 25, 5.4) + eye(84, 33, 5.4) + `<path d="M88 44 q-4 2 -8 -1" fill="none" ${S2}/>`;
  },
  puffer(id, s, puff) {
    let spikes = '';
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, cx = 54 + Math.cos(a) * 28, cy = 34 + Math.sin(a) * 25;
      const nx = 54 + Math.cos(a) * 36, ny = 34 + Math.sin(a) * 32;
      const px = -Math.sin(a) * 4, py = Math.cos(a) * 4;
      spikes += `<path d="M${cx + px} ${cy + py} L${nx} ${ny} L${cx - px} ${cy - py}Z" fill="#fff8d6" ${S2}/>`;
    }
    return `<path d="M26 36 L6 22 Q12 36 6 50 Z" fill="${s.fin}" ${S}/>` + spikes +
      `<clipPath id="fc-${id}"><circle cx="54" cy="34" r="28"/></clipPath>` +
      `<ellipse cx="54" cy="34" rx="29" ry="27" fill="${s.color}"/><g clip-path="url(#fc-${id})"><path d="M20 40 Q54 28 90 40 V70 H20Z" fill="${s.belly}"/>` +
      [[42, 20], [56, 16], [66, 24], [48, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${s.spots}" opacity="0.8"/>`).join('') + `</g>` +
      `<ellipse cx="54" cy="34" rx="29" ry="27" fill="none" ${S}/>` +
      `<path d="M56 42 Q48 56 42 48 Q48 44 56 42Z" fill="${s.fin}" ${S2}/>` +
      eye(70, 27, 7) + `<ellipse cx="82" cy="38" rx="3.4" ry="4.2" fill="#f4a7a0" ${S2}/>` +
      (puff ? '' : '');
  },
};

let clipN = 0;
export function fishSVG(id, { puff = false } = {}) {
  const s = SPECIES[id];
  if (!s) return junkSVG(id);
  const kind = id === 'flounder' ? 'flounder' : id === 'puffer' ? 'puffer' : 'streamlined';
  // each picture gets its own clip id: a copy of the same fish in a hidden card (display: none) would break the clip of every later one
  const uid = `fc-${id}-${++clipN}`;
  return `<svg viewBox="0 0 100 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FISH_SVG[kind](id, s, puff).split(`fc-${id}`).join(uid)}</svg>`;
}

const JUNK_SVG = {
  boot: `<path d="M30 8 h26 v24 c0 9 10 11 25 15 c9 3 13 8 13 16 H22 V8 Z" fill="#8a5a3a" ${S}/><path d="M22 52 h72 v8 H22z" fill="#3a2f2a" ${S}/><path d="M30 8 h26 v8 H30z" fill="#6b4428" ${S2}/>` +
    `<path d="M34 24 h16 M34 32 h16" ${S2}/><path d="M60 46 q6 -8 12 0" fill="none" ${S2}/><path d="M78 58 q6 -10 2 -18 q10 6 2 18z" fill="#4f9a3e" ${S2}/>`,
  duck: `<path d="M14 40 Q14 62 46 62 Q78 62 82 40 Q70 46 58 36 L36 36 Q24 46 14 40Z" fill="#ffd23f" ${S}/><circle cx="62" cy="24" r="16" fill="#ffd23f" ${S}/>` +
    `<path d="M74 24 h18 q2 8 -10 9 q-8 0 -8 -9z" fill="#ff8a2a" ${S2}/>${eye(64, 18, 4.2)}<path d="M28 44 Q40 54 52 46" fill="none" ${S2}/>`,
  can: `<path d="M30 14 h40 v46 a20 6 0 0 1 -40 0z" fill="#b8c2cc" ${S}/><ellipse cx="50" cy="14" rx="20" ry="6" fill="#dfe6ec" ${S}/>` +
    `<path d="M30 28 h40 v14 h-40z" fill="#e0574f" ${S2}/><path d="M38 32 h24 M38 38 h16" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M64 18 l10 -8 l-2 10" fill="#dfe6ec" ${S2}/>`,
};
export function junkSVG(id) {
  return `<svg viewBox="0 0 100 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${JUNK_SVG[id] || JUNK_SVG.can}</svg>`;
}

// Inventory and HUD icons, viewBox 0 0 64 64 like the rest.
const ICONS = {
  rod: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 57 L47 9" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M9 57 L47 9" stroke="#c4884f" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M44 20 l5 3 M32 36 l5 3" stroke="#8a5a30" stroke-width="2.6" stroke-linecap="round"/><path d="M47 9 Q60 22 54 40" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="54" cy="46" r="7" fill="#fff" ${S2}/><path d="M47 46 a7 7 0 0 1 14 0z" fill="#e0574f" ${S2}/></svg>`,
  treat: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="rotate(-35 32 32)"><path d="M14 24 a8 8 0 1 1 6 -7 h24 a8 8 0 1 1 6 7 v0 a8 8 0 1 1 -6 7 h-24 a8 8 0 1 1 -6 -7z" fill="#e8b46a" ${S} transform="translate(0 8)"/></g>` +
    `<circle cx="24" cy="30" r="1.8" fill="#b9823a"/><circle cx="36" cy="34" r="1.8" fill="#b9823a"/><circle cx="31" cy="40" r="1.6" fill="#b9823a"/></svg>`,
  fish: `<svg viewBox="0 0 100 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FISH_SVG.streamlined('perch', SPECIES.perch)}</svg>`,
  pocket: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 22 h40 v26 a10 10 0 0 1 -10 10 H22 a10 10 0 0 1 -10 -10z" fill="#e8a24a" ${S}/><path d="M12 22 q20 12 40 0" fill="none" ${S2}/><rect x="24" y="14" width="16" height="10" rx="5" fill="#c4884f" ${S2}/></svg>`,
};
// ------------------------------------------------------------------ gear icons: the poles and lures (fish-gear.js), matching fish-gear-art.js
// Each lure is drawn round its tie point (0, 0), hanging down (+y), about 18 wide and 28 tall; `w` is the outline width.
const SILVER = '#d4dde6';
const LURE_SVG = {
  none: w => `<rect x="-1.6" y="0" width="3.2" height="5" fill="#fff" stroke="${INK}" stroke-width="${w * 0.6}"/><circle cx="0" cy="11" r="7" fill="#fff" stroke="${INK}" stroke-width="${w}"/>` +
    `<path d="M-7 11 a7 7 0 0 1 14 0z" fill="#e0574f" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/><circle cx="0" cy="0" r="2.2" fill="#ffe27a" stroke="${INK}" stroke-width="${w * 0.5}"/>` +
    `<path d="M0 18 v5 q0 3.5 -3.2 3.5 q-2.2 0 -2.2 -2.4" fill="none" stroke="${INK}" stroke-width="${w * 0.9}" stroke-linecap="round"/><path d="M0 18 v5 q0 3.5 -3.2 3.5 q-2.2 0 -2.2 -2.4" fill="none" stroke="${SILVER}" stroke-width="${w * 0.35}" stroke-linecap="round"/>`,
  worms: w => `<path d="M-3.6 3 h7.2 l-1 13 l-2.6 4.5 l-2.6 -4.5 z" fill="#3fa34d" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>` +
    `<rect x="-3.8" y="7.5" width="7.6" height="2.6" fill="#fff" stroke="${INK}" stroke-width="${w * 0.5}"/><rect x="-3.4" y="-1.5" width="6.8" height="5.5" rx="2.4" fill="#ff6a2a" stroke="${INK}" stroke-width="${w}"/>` +
    `<path d="M-7 27 q3 -5 6 0 t6 0 q2 -3 3 -5" fill="none" stroke="${INK}" stroke-width="${w + 3.4}" stroke-linecap="round"/><path d="M-7 27 q3 -5 6 0 t6 0 q2 -3 3 -5" fill="none" stroke="#ff8fb0" stroke-width="3.4" stroke-linecap="round"/>`,
  crickets: w => `<ellipse cx="-4.5" cy="2.5" rx="4.2" ry="2.2" fill="#eef8ff" stroke="${INK}" stroke-width="${w * 0.5}" transform="rotate(-25 -4.5 2.5)"/><ellipse cx="4.5" cy="2.5" rx="4.2" ry="2.2" fill="#eef8ff" stroke="${INK}" stroke-width="${w * 0.5}" transform="rotate(25 4.5 2.5)"/>` +
    `<circle cx="0" cy="10" r="7.5" fill="#f2c230" stroke="${INK}" stroke-width="${w}"/><path d="M-7 8 h14 M-6.7 12.6 h13.4" stroke="${INK}" stroke-width="2.4"/><circle cx="0" cy="10" r="7.5" fill="none" stroke="${INK}" stroke-width="${w}"/>` +
    `<path d="M-6 21 l-3 5 M-2 23 l-1 5 M5 21 l4 -3 l1 7" fill="none" stroke="#5a3f1e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="0" cy="22.5" rx="6" ry="3.2" fill="#7a5a2e" stroke="${INK}" stroke-width="${w * 0.7}"/><circle cx="5.5" cy="21.5" r="2.3" fill="#5a3f1e" stroke="${INK}" stroke-width="${w * 0.5}"/>`,
  spoon: w => `<circle cx="0" cy="1.5" r="2.2" fill="none" stroke="${INK}" stroke-width="${w * 0.6}"/><path d="M0 3.5 C7 6 8 17 0 25 C-8 17 -7 6 0 3.5Z" fill="${SILVER}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>` +
    `<path d="M0 8 v12" stroke="#e0463c" stroke-width="2.6" stroke-linecap="round"/><path d="M-3.4 9 q-1 4 0 7" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M-3 27 l3 3 l3 -3" fill="none" stroke="#e0463c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` + sparkle(8, 6, 0.7),
  frog: w => `<ellipse cx="-8.5" cy="17" rx="4" ry="2.2" fill="#3f9a45" stroke="${INK}" stroke-width="${w * 0.6}"/><ellipse cx="8.5" cy="17" rx="4" ry="2.2" fill="#3f9a45" stroke="${INK}" stroke-width="${w * 0.6}"/>` +
    `<ellipse cx="0" cy="12" rx="9" ry="6.8" fill="#5cc05a" stroke="${INK}" stroke-width="${w}"/><ellipse cx="0" cy="14.5" rx="6" ry="3.4" fill="#e8f0a0"/>` +
    `<circle cx="-4.6" cy="5.4" r="3.6" fill="#5cc05a" stroke="${INK}" stroke-width="${w * 0.8}"/><circle cx="4.6" cy="5.4" r="3.6" fill="#5cc05a" stroke="${INK}" stroke-width="${w * 0.8}"/>` +
    `<circle cx="-4.6" cy="5" r="2.1" fill="#fff"/><circle cx="4.6" cy="5" r="2.1" fill="#fff"/><circle cx="-4.2" cy="5.3" r="1.1" fill="${INK}"/><circle cx="5" cy="5.3" r="1.1" fill="${INK}"/>` +
    `<path d="M-3 10.5 q3 2.4 6 0" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/><circle cx="-6" cy="10" r="1.3" fill="#ff9aa8"/><circle cx="6" cy="10" r="1.3" fill="#ff9aa8"/>`,
};
// a pole from the butt (bottom left) to the tip (top right): [markup, tipX, tipY]
const ROD = (d, w, col) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const POLE_SVG = {
  stick: () => [ROD('M9 57 L19 45 L26 39 L35 26 L46 10', 5, '#8a5a34') +
    `<path d="M26 39 l9 1" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/><path d="M26 39 l9 1" stroke="#8a5a34" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="38" cy="40" rx="4.4" ry="2.4" fill="#6fbf4f" stroke="${INK}" stroke-width="1.8" transform="rotate(20 38 40)"/>` +
    `<path d="M10 52.5 l4 3 M12.5 49.5 l4 3 M15 46.5 l4 3" stroke="#f1e6c8" stroke-width="2" stroke-linecap="round"/>`, 46, 10],
  bamboo: () => [ROD('M7 59 L42 15', 5.4, '#dccf72') + ROD('M42 15 L51 4', 3.6, '#5cae4a') +
    [[13, 51.5], [20, 42.7], [27, 33.9], [34, 25.1], [41, 16.3]].map(([x, y]) => `<path d="M${x - 3.2} ${y - 2.6} l6.4 5.2" stroke="#8a7a30" stroke-width="2" stroke-linecap="round"/>`).join('') +
    `<path d="M8 57.5 l5 -6" stroke="#3d6b3a" stroke-width="6" stroke-linecap="round"/><ellipse cx="54" cy="8" rx="4" ry="1.8" fill="#6cc35a" stroke="${INK}" stroke-width="1.6" transform="rotate(-30 54 8)"/>`, 51, 4],
  spinner: () => [ROD('M9 57 L47 9', 3.6, '#2f7fe0') + `<path d="M9 57 L18 45.6" stroke="#2a2a36" stroke-width="6.5" stroke-linecap="round"/>` +
    `<path d="M21 42 l5 4" stroke="${INK}" stroke-width="3"/><circle cx="27" cy="47" r="6" fill="#c8d0d8" stroke="${INK}" stroke-width="2.6"/><circle cx="27" cy="47" r="2.6" fill="#ff7a1f" stroke="${INK}" stroke-width="1.4"/><path d="M33 47 h4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><circle cx="38" cy="47" r="1.8" fill="${INK}"/>` +
    [[32, 28], [40, 18]].map(([x, y]) => `<circle cx="${x + 2.4}" cy="${y + 2}" r="2" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`).join('') + `<path d="M44.5 12.2 L47 9" stroke="#e0463c" stroke-width="3.4" stroke-linecap="round"/>`, 47, 9],
  lucky: () => [ROD('M9 57 L47 9', 4.4, '#7a2e2a') + `<path d="M9.5 56.4 L17.5 46.3" stroke="#c9a26b" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M10 47 l5 3" stroke="${INK}" stroke-width="3"/><circle cx="8" cy="45" r="5.6" fill="#d9a63a" stroke="${INK}" stroke-width="2.4"/><circle cx="8" cy="45" r="2" fill="#7a2e2a"/>` +
    [[21, 41.8], [29, 31.7], [37, 21.6], [43.5, 13.4]].map(([x, y]) => `<path d="M${x - 2.6} ${y - 2.1} l5.2 4.2" stroke="#e8b84a" stroke-width="2.4" stroke-linecap="round"/>`).join('') +
    `<g transform="translate(23 51)"><circle cx="-2.2" cy="-2.2" r="2.4" fill="#3fae4a" stroke="${INK}" stroke-width="1"/><circle cx="2.2" cy="-2.2" r="2.4" fill="#3fae4a" stroke="${INK}" stroke-width="1"/><circle cx="-2.2" cy="2.2" r="2.4" fill="#3fae4a" stroke="${INK}" stroke-width="1"/><circle cx="2.2" cy="2.2" r="2.4" fill="#3fae4a" stroke="${INK}" stroke-width="1"/></g>`, 47, 9],
};
const LINE_COL = { stick: '#f1e6c8', bamboo: '#b6f04a', spinner: '#ff7a1f', lucky: '#ffc61a' };
const lureAt = (id, x, y, k, w) => `<g transform="translate(${x} ${y}) scale(${k})">${(LURE_SVG[id] || LURE_SVG.none)(w)}</g>`;
const svg64 = body => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
// the rod in your pockets and on the cross pad: the pole you have, with your lure on the end of its line
export function rodSVG(pole = 'stick', bait = 'none') {
  const [body, tx, ty] = (POLE_SVG[pole] || POLE_SVG.stick)();
  const lx = 54, ly = 34, col = LINE_COL[pole] || LINE_COL.stick;
  const line = `M${tx} ${ty} Q${lx + 5} ${ty + 6} ${lx} ${ly}`;
  return svg64(body + `<path d="${line}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="${line}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linecap="round"/>` + lureAt(bait, lx, ly, 0.92, 2.4));
}
// the Fish Shack's tiles: a pole on its own, a lure on its own (bigger)
export const poleSVG = pole => { const [body] = (POLE_SVG[pole] || POLE_SVG.stick)(); return svg64(body); };
export const baitSVG = bait => svg64(lureAt(bait, 32, 12, 1.65, 1.7));
let rodLook = 'stick|none';
ICONS.rod = rodSVG();
// The gear changed (fishing.js): every rod icon on screen redraws (setIcon tags them), and new ones come out right.
export function setRodLook(pole, bait) {
  if (rodLook === pole + '|' + bait) return;
  rodLook = pole + '|' + bait;
  ICONS.rod = rodSVG(pole, bait);
  if (typeof document !== 'undefined') for (const n of document.querySelectorAll('[data-icon="rod"]')) if (n.firstChild) n.innerHTML = ICONS.rod; // (an emptied slot keeps its tag: leave it empty)
}

export const iconSVG = id => ICONS[id] || '';
// Put an icon into an element (constants only). Item icons are tagged with their id so setRodLook can find them.
export function setIcon(node, id, kind = 'item') {
  node.innerHTML = kind === 'fish' ? fishSVG(id) : kind === 'junk' ? junkSVG(id) : iconSVG(id);
  if (kind === 'item' && node.dataset) node.dataset.icon = id;
}

// ------------------------------------------------------------------ 3D

const mesh = (geo, color, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, opts) => {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? toon(color, opts) : color);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  return m;
};
const RING = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);

// A little cel-shaded fish facing +z, `L` metres long.
export function buildFish3D(id, cm) {
  const s = SPECIES[id];
  const L = s.len * sizeScale(id, cm ?? (s.cm[0] + s.cm[1]) / 2);
  const g = new THREE.Group();
  const flat = id === 'flounder', round = id === 'puffer';
  const rx = (flat ? 0.5 : 0.5) * s.wid * (L / s.len), ry = flat ? 0.05 * L / 0.9 : rx * (round ? 1 : 0.95), rz = L * (round ? 0.4 : 0.36);
  const zc = L * 0.08;
  g.add(mesh(GEO.sphere, s.color, rx, ry, rz, 0, 0, zc));
  g.add(mesh(GEO.sphere, s.belly, rx * 0.96, ry * 0.62, rz * 0.94, 0, -ry * 0.42, zc + 0.005 * L));
  // tail: a flattened cone fanning out behind
  const tail = mesh(GEO.cone6, s.fin, ry * 0.9, L * 0.2, 0.018 * L / 0.6, 0, 0, -rz * 0.98 + zc - L * 0.1);
  tail.rotation.x = -Math.PI / 2;
  g.add(tail);
  if (!flat) {
    const dorsal = mesh(GEO.cone6, s.fin, 0.02 * L / 0.6, ry * 0.9, rz * 0.7, 0, ry * 0.95, zc - rz * 0.1);
    dorsal.rotation.x = 0.35;
    g.add(dorsal);
  }
  for (const side of [-1, 1]) {
    const fin = mesh(GEO.sphere, s.fin, 0.02 * L / 0.6, ry * 0.3, rz * 0.22, side * rx * 0.92, -ry * 0.35, zc + rz * 0.1);
    fin.rotation.z = side * 0.5;
    g.add(fin);
    const ex = flat ? side * rx * 0.28 : side * rx * 0.72, ey = flat ? ry * 0.9 : ry * 0.28, ez = zc + rz * 0.72;
    const er = Math.max(0.03, L * 0.06);
    g.add(mesh(GEO.sphere, '#ffffff', er, er, er, ex, ey, ez));
    g.add(mesh(GEO.sphere, INK, er * 0.55, er * 0.55, er * 0.55, ex + side * er * 0.25, ey, ez + er * 0.55));
  }
  if (s.stripe) {
    const n = id === 'perch' ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const t = -0.55 + (i / (n - 1)) * 1.1;
      const k = Math.sqrt(Math.max(0.05, 1 - t * t));
      const r = mesh(RING, s.stripe, rx * k * 1.02, rz * 0.08, ry * k * 1.02, 0, 0, zc + t * rz * 0.8);
      r.rotation.x = Math.PI / 2;
      g.add(r);
    }
  }
  if (s.band) g.add(mesh(GEO.sphere, s.band, rx * 1.01, ry * 0.22, rz * 0.86, 0, ry * 0.05, zc));   // the trout's stripe down each side
  if (id === 'catfish') for (const side of [-1, 1]) for (const k of [0, 1]) {                            // whiskers
    const w = mesh(GEO.cyl6, s.fin, 0.008 * L / 0.6, rz * 0.5, 0.008 * L / 0.6, side * rx * (0.35 + k * 0.2), -ry * 0.2 - k * ry * 0.25, zc + rz * 1.05);
    w.rotation.set(1.1 + k * 0.5, 0, side * (0.9 + k * 0.4)); g.add(w);
  }
  if (id === 'sturgeon') { const sn = mesh(GEO.cone6, s.color, rx * 0.35, rz * 0.35, ry * 0.3, 0, -ry * 0.1, zc + rz * 1.1); sn.rotation.x = Math.PI / 2; g.add(sn); }
  if (s.spots) for (const [a, t] of [[0.6, -0.3], [-0.5, 0.1], [0.2, 0.4], [-0.2, -0.5], [0.7, 0.2]]) {
    g.add(mesh(GEO.sphere, s.spots, 0.03 * L / 0.6, 0.012 * L / 0.6, 0.03 * L / 0.6, a * rx * 0.7, ry * 0.92, zc + t * rz));
  }
  if (round) for (let i = 0; i < 14; i++) {
    const a = i * 2.4, b = Math.acos(1 - ((i + 0.5) / 14) * 2);
    const sp = mesh(GEO.cone6, '#fff8d6', 0.02 * L / 0.6, 0.06 * L / 0.6, 0.02 * L / 0.6, Math.sin(b) * Math.cos(a) * rx * 0.98, Math.cos(b) * ry * 0.98, zc + Math.sin(b) * Math.sin(a) * rz * 0.98);
    sp.lookAt(sp.position.x * 2, sp.position.y * 2, (sp.position.z - zc) * 2 + zc);
    sp.rotateX(Math.PI / 2);
    g.add(sp);
  }
  g.userData.length = L;
  return g;
}

export function buildJunk3D(id) {
  const g = new THREE.Group();
  if (id === 'boot') {
    g.add(mesh(GEO.box, '#8a5a3a', 0.16, 0.34, 0.16, 0, 0.17, -0.06));
    g.add(mesh(GEO.box, '#8a5a3a', 0.16, 0.13, 0.32, 0, 0.07, 0.1));
    g.add(mesh(GEO.box, '#3a2f2a', 0.17, 0.04, 0.36, 0, 0.0, 0.08));
    g.add(mesh(GEO.box, '#6b4428', 0.17, 0.06, 0.17, 0, 0.35, -0.06));
    g.add(mesh(GEO.cone6, '#4f9a3e', 0.03, 0.14, 0.02, 0.06, 0.3, 0.04));
  } else if (id === 'duck') {
    g.add(mesh(GEO.sphere, '#ffd23f', 0.15, 0.11, 0.17, 0, 0.11, 0));
    g.add(mesh(GEO.sphere, '#ffd23f', 0.1, 0.1, 0.1, 0, 0.26, 0.09));
    g.add(mesh(GEO.box, '#ff8a2a', 0.07, 0.03, 0.06, 0, 0.25, 0.19));
    g.add(mesh(GEO.sphere, INK, 0.018, 0.018, 0.018, 0.045, 0.29, 0.16));
    g.add(mesh(GEO.sphere, INK, 0.018, 0.018, 0.018, -0.045, 0.29, 0.16));
    const tl = mesh(GEO.cone6, '#ffd23f', 0.05, 0.08, 0.05, 0, 0.16, -0.17); tl.rotation.x = -1.9; g.add(tl);
  } else {
    g.add(mesh(GEO.cyl8, '#b8c2cc', 0.08, 0.2, 0.08, 0, 0.1, 0));
    g.add(mesh(GEO.cyl8, '#e0574f', 0.082, 0.07, 0.082, 0, 0.1, 0));
    g.add(mesh(GEO.cyl8, '#dfe6ec', 0.085, 0.015, 0.085, 0, 0.205, 0));
  }
  g.userData.length = 0.4;
  return g;
}

export function build3D(id, cm) { return SPECIES[id] ? buildFish3D(id, cm) : buildJunk3D(id); }

// A dog treat lying on the ground: a chunky bone, about 0.3 m long.
export function buildTreat3D() {
  const g = new THREE.Group();
  const bone = '#e8b46a';
  const shaft = mesh(GEO.cyl8, bone, 0.045, 0.3, 0.045, 0, 0, 0); shaft.rotation.z = Math.PI / 2; g.add(shaft);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(GEO.sphere, bone, 0.065, 0.065, 0.065, sx * 0.15, 0, sz * 0.045));
  g.position.y = 0;
  g.userData.rest = 0.07;
  return g;
}
