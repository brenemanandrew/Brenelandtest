// The NPC Editor's unicorns (Sprinkles, Moonpie, Clover, Noodle, Bean): the coat, the mane and the tail colours, the build,
// the horn, the socks, the star and the mark. The unicorn on the stage is the game's own (unicorn.js).
import { Unicorn, makePalette, MARKS, UNICORN_BUILDS } from '/js/unicorn.js';
import { NPCS, mergeLook } from '/js/npc-looks.js';

const deep = o => JSON.parse(JSON.stringify(o));
const cap = s => s[0].toUpperCase() + s.slice(1);

const GROUPS = [
  { id: 'body', name: 'Body', color: '#ffc6e0', rows: [
    ['color', 'Coat', 'color', { presets: ['#ffc6e0', '#d9c6ff', '#c6f5e0', '#c9e6ff', '#ffe0b8', '#ffffff', '#fff2a8', '#3a3550'] }],
    ['build', 'Build', 'choice', UNICORN_BUILDS.map(b => [b, { classic: 'Classic', lean: 'Lean and leggy', chunky: 'Chunky', foal: 'Foal' }[b] || cap(b)])],
    ['scale', 'Whole size'],
    ['eye', 'Eyes', 'color', { auto: 'From the mane' }],
  ] },
  { id: 'hair', name: 'Mane and tail', color: '#b48cff', rows: [
    ['mane', 'Mane', 'colors', { min: 1, max: 6 }],
    ['tail', 'Tail', 'colors', { min: 1, max: 6, auto: 'Same as the mane' }],
  ] },
  { id: 'horn', name: 'Horn', color: '#f2b93b', rows: [
    ['horn', 'Horn colour', 'color', { auto: 'Gold' }], ['hornLen', 'Horn length'],
  ] },
  { id: 'marks', name: 'Markings', color: '#8fd0ee', rows: [
    ['mark', 'Mark on the flank', 'choice', MARKS.map(m => [m, cap(m)])],
    ['socks', 'Socks', 'choice', [['none', 'None'], ['front', 'Front'], ['hind', 'Hind'], ['all', 'All four']]],
    ['accent', 'Sock colour', 'color', { auto: 'Paler coat' }],
    ['blaze', 'Pale star on the forehead', 'bool'],
  ] },
];
const POSES = [
  ['idle', 'Stand', null, 0], ['walk', 'Walk', null, 1.2], ['trot', 'Trot', null, 2.6], ['gallop', 'Gallop', null, 5],
  ['graze', 'Graze', 'graze', 0], ['prance', 'Prance', 'prance', 0], ['look', 'Look', 'look', 0], ['talk', 'Talk', 'talk', 0],
  ['nuzzle', 'Nuzzle', 'nuzzle', 0], ['neigh', 'Neigh', 'neigh', 0], ['hop', 'Hop', 'hop', 0], ['sleep', 'Sleep', 'sleep', 0],
];
// the keys the palette picks for itself from the coat's colour: fixed as they look now, so a new coat keeps its socks and mark
const FIXED = ['mark', 'socks', 'blaze'];
function settle(look) {
  const P = makePalette(mergeLook({}, look));
  const out = { ...look };
  for (const k of FIXED) out[k] = P[k];
  if (!out.build) out.build = 'classic';
  return out;
}

function toCode(id, look) {
  const f = v => typeof v === 'string' ? `'${v}'` : typeof v === 'number' ? String(+v.toFixed(4)) : Array.isArray(v) ? '[' + v.map(f).join(', ') + ']' : String(v);
  return `look: { ${Object.entries(look).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => k + ': ' + f(v)).join(', ')} },`;
}

export const unicornKind = {
  kind: 'unicorn', defaultPose: 'idle',
  step: () => 0.005,
  groups: () => GROUPS,
  poses: () => POSES,
  photos: () => [],
  builtin: id => settle(deep(NPCS[id].look)),
  merged(id, saved) {
    const out = deep(NPCS[id].look);
    if (saved) for (const [k, v] of Object.entries(saved)) out[k] = Array.isArray(v) ? v.slice() : v;
    return settle(out);
  },
  get: (o, k) => o[k],
  set: (o, k, v) => { if (v === undefined) delete o[k]; else o[k] = Array.isArray(v) ? v.slice() : v; },
  effective(id, look, k) {
    const v = look[k];
    if (v !== undefined && v !== null) return v;
    const P = makePalette(mergeLook({}, look));
    if (k === 'eye') return P.eye;
    if (k === 'accent') return P.sock;
    if (k === 'horn') return '#f2b93b';
    if (k === 'tail') return P.mane;
    if (k === 'mane') return P.mane;
    if (k === 'scale' || k === 'hornLen') return 1;
    if (k === 'build') return 'classic';
    return P[k];
  },
  isAuto: (look, k) => look[k] === null || look[k] === undefined,
  autoValue: () => undefined,   // (a unicorn's built-in look never sets these, so leaving the key out is "let it choose")
  build: (id, look) => new Unicorn(mergeLook(NPCS[id].look, look)),
  dispose() { /* (unicorn.js caches its parts per palette and trims them) */ },
  update(u, dt, t, P) { u.update(dt, t, P[3], P[2]); },
  frame: look => ({ y: 0.85 * ((look && look.scale) || 1) * (look && look.build === 'foal' ? 0.7 : 1), dist: 4.9 }),
  code: (id, look) => ({ text: toCode(id, look), where: 'The look for public/js/npc-looks.js (NPCS.' + id + '.look).' }),
};
