// The NPC Editor's people: everything the avatar creator offers, plus proportions, part colours, what they hold, name tag
// and voice. The stage builds the game's own Human from the same merge the game uses (npc-looks.js mergeLook), so what
// you see is what the lobby draws.
import {
  Human, resolveLook, SKIN_TONES, HATS, NPC_HATS, FACE_SHAPES, OUTFITS, HAIR_STYLES, ACCESSORIES, EYE_STYLES, EYE_STYLE_LABELS, BROWS, NOSES, MOUTHS, FACIAL_HAIR, GLASSES,
  TIES, SHOE_KINDS, POCKETS, BODY_TYPES, FIGURES, PROPORTIONS, figureBust, gaitFor,
} from '/js/human.js';
import { SHIRTS, HAIR_COLORS, HAT_LABELS } from '/js/avatar-editor.js';
import { NPCS, mergeLook } from '/js/npc-looks.js';

const deep = o => JSON.parse(JSON.stringify(o));
const opts = (list, labels) => list.map(v => [v, labels[v] || v[0].toUpperCase() + v.slice(1)]);
const L = {
  hat: { ...HAT_LABELS, mailcap: 'Mail cap', flatcap: 'Flat cap', hood: 'Hood', sagehood: "Sage's hood" },
  face: { round: 'Round', oval: 'Oval', square: 'Square', heart: 'Heart', chubby: 'Chubby' },
  eyes: { dot: 'Dots', oval: 'Oval', wide: 'Wide', happy: 'Happy', sleepy: 'Sleepy', lash: 'Lashes' },
  brows: { plain: 'Plain', thick: 'Thick', arched: 'Arched', angry: 'Grumpy', soft: 'Soft', none: 'None' },
  nose: { small: 'Small', round: 'Round', long: 'Long', button: 'Button', none: 'None' },
  mouth: { smile: 'Smile', grin: 'Grin', toothy: 'Big grin', flat: 'Flat', o: 'Oh!', cat: 'Cat', smirk: 'Smirk', tiny: 'Tiny' },
  glasses: { none: 'None', round: 'Round', square: 'Square', shades: 'Shades' },
  facial: { none: 'None', stubble: 'Stubble', mustache: 'Moustache', goatee: 'Goatee', beard: 'Beard', scruff: 'Scruff', vandyke: 'Van Dyke', boxed: 'Boxed beard', chinstrap: 'Chin strap', longbeard: 'Long beard', muttonchops: 'Mutton chops' },
  hair: { short: 'Short', buzz: 'Buzz', spiky: 'Spiky', side: 'Side swept', bob: 'Bob', long: 'Long', pony: 'Ponytail', pigtails: 'Pigtails', bun: 'Bun', curly: 'Curly', afro: 'Afro', mohawk: 'Mohawk', balding: 'Thinning', wavy: 'Wavy', sidepart: 'Side part', pompadour: 'Pompadour', shag: 'Shag', tiedback: 'Tied back', bald: 'Bald' },
  outfit: { tee: 'Tee', hoodie: 'Hoodie', overalls: 'Overalls', dress: 'Dress', skirt: 'Skirt', coat: 'Coat', tank: 'Tank', suit: 'Suit', blazer: 'Blazer', vest: 'Waistcoat', tux: 'Tuxedo', gown: 'Gown', jacket: 'Work jacket' },
  tie: { none: 'None', tie: 'Tie', bow: 'Bow tie', skinny: 'Skinny tie' },
  shoe: { sneakers: 'Sneakers', dress: 'Dress shoes', boots: 'Boots' },
  pocket: { none: 'None', square: 'Pocket square', flower: 'Flower' },
  acc: { none: 'None', scarf: 'Scarf', backpack: 'Backpack', bowtie: 'Bow tie', headphones: 'Headphones', satchel: 'Satchel' },
  held: { none: 'Nothing', lantern: 'Lantern', satchel: 'Mail bag', book: 'Book', rod: 'Fishing rod', balloon: 'Balloon', trowel: 'Trowel', notepad: 'Notepad and pencil', candle: 'Candle' },
  body: { m: 'Male', f: 'Female', nb: 'Non-binary' },
  figure: { average: 'Average', slim: 'Slim', curvy: 'Curvy', pear: 'Pear', athletic: 'Athletic', plus: 'Plus size' },
};
const NB = look => resolved(look).body === 'nb';
const PANTS = ['#34405e', '#2e2e36', '#6b5a44', '#c9c3b0', '#3f5f8f', '#5a7f4a', '#6b6452', '#e0574f', '#f2c94c', '#ffffff'];
const SHOES = ['#3a2f2a', '#4a3526', '#e0574f', '#3f8fd9', '#ffffff', '#2b2b35', '#f2c94c'];
const EYE_COLORS = ['#231a2a', '#4a3020', '#4a7bb5', '#3f9b6a', '#7a5aa8', '#6b6f78'];

// Rows: [key, words, type, extra]. num (the server's range), color (extra: { auto: words for "let it choose", presets }),
// bool, choice (extra: [[value, words]]), text. extra.when(look) hides a row that does not apply.
const GROUPS = [
  { id: 'body', name: 'Body', color: '#ffd34d', rows: [
    ['body', 'Body type', 'choice', opts(BODY_TYPES, L.body)], ['shape', 'Shape (masculine to feminine)', 'num', { when: NB }],
    ['figure', 'Figure', 'choice', opts(FIGURES, L.figure)], ['bust', 'Bust', 'num', { when: look => resolved(look).shape > 0.5 }],
    ['build', 'Build (slim to round)'], ['height', 'Height (short to tall)'], ['gait', 'Run style (scamper, light, lope, heavy)'], ['scale', 'Whole size (1 = grown-up)'], // (gait unset = picked from the body)
  ] },
  { id: 'prop', name: 'Proportions', color: '#8fd0ee', rows: [
    ['headSize', 'Head size'], ['torsoLen', 'Body length'], ['legLen', 'Leg length'], ['armLen', 'Arm length'], ['shoulders', 'Shoulders'], ['hips', 'Hips'],
  ] },
  { id: 'face', name: 'Face', color: '#ff9f4a', rows: [
    ['faceShape', 'Face shape', 'choice', opts(FACE_SHAPES, L.face)], ['eyeStyle', 'Eyes', 'choice', opts(EYE_STYLES, EYE_STYLE_LABELS)], // (only EYE_STYLES are offered, but a look keeps any older shape it has)
    ['brows', 'Brows', 'choice', opts(BROWS, L.brows)], ['nose', 'Nose', 'choice', opts(NOSES, L.nose)], ['mouth', 'Mouth', 'choice', opts(MOUTHS, L.mouth)],
    ['blush', 'Rosy cheeks', 'bool'], ['lines', 'Smile lines', 'bool'], ['glasses', 'Glasses', 'choice', opts(GLASSES, L.glasses)],
  ] },
  { id: 'hair', name: 'Hair', color: '#b48cff', rows: [
    ['hairStyle', 'Hair style', 'choice', opts(HAIR_STYLES, L.hair)], ['thin', 'Thinning on top', 'bool'],
    ['facialHair', 'Facial hair', 'choice', opts(FACIAL_HAIR, L.facial)],
  ] },
  { id: 'colours', name: 'Colours', color: '#c98a4a', rows: [
    ['skin', 'Skin', 'color', { presets: SKIN_TONES }], ['hair', 'Hair', 'color', { presets: HAIR_COLORS }],
    ['eyeColor', 'Eyes', 'color', { auto: 'Automatic (dark dots, or from the look)', presets: EYE_COLORS }], ['browColor', 'Brows', 'color', { auto: 'From the hair' }],
    ['facialHairColor', 'Beard and stubble', 'color', { auto: 'From the hair' }],
  ] },
  { id: 'outfit', name: 'Outfit', color: '#a8e06b', rows: [
    ['outfit', 'Outfit', 'choice', opts(OUTFITS, L.outfit)],
    ['shirt', 'Top', 'color', { presets: SHIRTS }], ['coat', 'Coat (the coat outfit)', 'color', { auto: 'Same as the top' }],
    ['inner', 'Shirt underneath', 'color', { auto: 'As the outfit says' }],
    ['bottoms', 'Bottoms', 'choice', opts(['pants', 'shorts'], { pants: 'Long', shorts: 'Shorts' })], ['pants', 'Bottoms colour', 'color', { presets: PANTS }],
    ['shoeKind', 'Shoes', 'choice', opts(SHOE_KINDS, L.shoe)], ['shoes', 'Shoe colour', 'color', { presets: SHOES }],
    ['tie', 'Tie', 'choice', opts(TIES, L.tie)], ['tieColor', 'Tie and pocket colour', 'color', { auto: 'As the outfit says' }],
    ['pocket', 'Pocket', 'choice', opts(POCKETS, L.pocket)],
    ['trench', 'Trench coat (belt, collar, a tie)', 'bool', { when: look => resolved(look).outfit === 'coat' }],
    ['robe', 'Robe (long sleeves, cord belt, amulet)', 'bool', { when: look => resolved(look).outfit === 'gown' }],
  ] },
  { id: 'extras', name: 'Hat and extras', color: '#ff8fb8', rows: [
    ['hat', 'Hat', 'choice', opts(HATS.concat(NPC_HATS), L.hat)], ['hatColor', 'Hat colour', 'color', { auto: 'From the top' }],
    ['acc', 'Wearing', 'choice', opts(ACCESSORIES, L.acc)], ['accColor', 'Wearing: colour', 'color', { auto: 'Its own colour' }],
    ['accessory', 'In the hand', 'choice', opts(['none', 'lantern', 'satchel', 'book', 'rod', 'balloon', 'trowel', 'notepad', 'candle'], L.held)],
  ] },
  { id: 'voice', name: 'Name and voice', color: '#8fd0ee', rows: [
    ['tag', 'Name tag', 'text', { max: 24 }], ['voicePitch', 'Voice pitch (Hz: low to high)'], ['voiceRate', 'Talking speed'],
  ] },
];
// poses: [id, words, anim, ground speed, loop length, seat height]
const BASE_POSES = [
  ['idle', 'Stand', null, 0], ['walk', 'Walk', 'walk', 1.3], ['run', 'Run', 'run', 4.6], ['sit', 'Sit', 'sit', 0], ['bench', 'Sit on a bench', 'sit', 0, 0, 0.45],
  ['wave', 'Wave', 'wave', 0], ['talk', 'Talk', 'talk', 0], ['laugh', 'Laugh', 'laugh', 0], ['cheer', 'Cheer', 'cheer', 0], ['point', 'Point', 'point', 0],
  ['shrug', 'Shrug', 'shrug', 0], ['look', 'Look around', 'look', 0], ['dance', 'Dance', 'dance', 0], ['jump', 'Hop', 'jump', 0, 0.9],
];
const WORK = {
  fish: ['fish', 'Fish', 'fish', 0], cast: ['cast', 'Cast', 'cast', 0, 1.4], reel: ['reel', 'Reel in', 'reel', 0], catch: ['catch', 'Catch', 'catch', 0, 2],
  drink: ['drink', 'Sip (on a bench)', 'drink', 0, 0, 0.45], tiller: ['tiller', 'Tiller (sitting)', 'tiller', 0, 0, 0.42], sweep: ['sweep', 'Sweep', 'sweep', 0],
  garden: ['garden', 'Garden', 'garden', 0], stretch: ['stretch', 'Stretch', 'stretch', 0], read: ['read', 'Read', 'read', 0], whisper: ['whisper', 'Whisper', 'whisper', 0],
  warm: ['warm', 'Warm hands', 'warm', 0], pet: ['pet', 'Pet', 'pet', 0], highfive: ['highfive', 'High five', 'highfive', 0],
};
const PHOTOS = [['old-kevin-reference.jpg', 'Kevin (Andrew\'s photo)', 'front', 'idle', ['kevin']]];

// the hash-picked keys (resolveLook rolls them from the colours when a look leaves them out): the editor fixes them as
// they look now, so changing a shirt never re-rolls a face
const FIXED = ['hairStyle', 'faceShape', 'eyes', 'brows', 'nose', 'mouth', 'blush', 'build', 'height', 'glasses', 'facialHair', 'outfit', 'bottoms', 'body', 'shape', 'lines', 'thin', 'acc', 'hat'];
function settle(look) {
  const r = resolveLook(mergeLook({}, look));
  const out = { ...look };
  for (const k of FIXED) out[k] = r[k];
  out.accessory = look.accessory || 'none';
  return out;
}
const resolvedCache = { key: '', r: null };
function resolved(look) {
  const key = JSON.stringify(look);
  if (resolvedCache.key !== key) { resolvedCache.key = key; resolvedCache.r = resolveLook(mergeLook({}, look)); }
  return resolvedCache.r;
}
const AUTO_SHOW = { eyeColor: '#231a2a', accColor: '#e0574f' };   // (what an automatic colour looks like when resolveLook leaves it null)

function toCode(id, look) {
  const f = v => typeof v === 'string' ? `'${v}'` : typeof v === 'number' ? String(+v.toFixed(4)) : v === null ? 'null' : String(v);
  const keep = Object.entries(look).filter(([k, v]) => v !== undefined && !['tag', 'voicePitch', 'voiceRate'].includes(k));
  const parts = keep.map(([k, v]) => k + ': ' + f(v));
  const lines = [], cur = [];
  let len = 0;
  for (const s of parts) { if (len + s.length > 130 && cur.length) { lines.push(cur.join(', ')); cur.length = 0; len = 0; } cur.push(s); len += s.length + 2; }
  if (cur.length) lines.push(cur.join(', '));
  const v = [];
  if (look.voicePitch !== undefined) v.push('pitch: ' + f(look.voicePitch));
  if (look.voiceRate !== undefined) v.push('rate: ' + f(look.voiceRate));
  // (the name tag is not code: the NPC keeps its own name, timetables hash it; the tag is saved instead)
  return `look: {\n  ${lines.join(',\n  ')},\n},` + (v.length ? `\nvoice: { ...the built-in voice, ${v.join(', ')} },` : '') + (look.tag ? `\n// name tag (saved, not code): '${look.tag}'` : '');
}

export const humanKind = {
  kind: 'human', defaultPose: 'idle',
  step: (lo, hi) => (hi - lo > 50 ? 1 : 0.005),   // (round values: what is saved is exactly what the slider shows)
  groups: () => GROUPS,
  poses: id => BASE_POSES.concat((NPCS[id].poses || []).map(p => WORK[p]).filter(p => p && !BASE_POSES.some(b => b[0] === p[0]))),
  photos: id => PHOTOS.filter(p => !p[4] || p[4].includes(id)),
  builtin: id => settle(deep(NPCS[id].look)),
  // the game's person = the built-in look with the saved one over it (a saved null colour stays null here: Auto beats a built-in colour)
  merged(id, saved) {
    const out = deep(NPCS[id].look);
    if (saved) for (const [k, v] of Object.entries(saved)) out[k] = v;
    return settle(out);
  },
  get: (o, k) => o[k],
  set: (o, k, v) => { if (v === undefined) delete o[k]; else o[k] = v; },
  effective(id, look, k) {
    const v = look[k];
    if (k === 'tag') return v || NPCS[id].name;
    if (k === 'voicePitch') return v ?? NPCS[id].voice?.pitch ?? 160;
    if (k === 'voiceRate') return v ?? NPCS[id].voice?.rate ?? 1;
    if (PROPORTIONS.some(p => p[0] === k)) return v ?? 1;
    if (k === 'accessory') return v || 'none';
    const r = resolved(look);
    if (k === 'bust') return v ?? figureBust(r.figure);   // (unset: the figure's own)
    if (k === 'gait') return v ?? gaitFor(r);             // (unset: the body's own run style)
    if (k in r) return r[k] ?? AUTO_SHOW[k] ?? (k === 'facialHairColor' ? r.hair : k === 'coat' ? r.shirt : null);
    return v;
  },
  isAuto: (look, k) => look[k] === null || look[k] === undefined,
  autoValue: () => null,   // (a null colour: back to what the game picks; the server keeps it so it beats a built-in colour)
  build(id, look) {
    const h = new Human(mergeLook(NPCS[id].look, look));
    h.root.updateMatrixWorld(true);
    h._top = h.tagAnchor.getWorldPosition(h.tagAnchor.position.clone()).y - 0.12;   // (the tag sits 0.16 over the head or hat)
    return h;
  },
  dispose(h) { h.dispose(); },
  update(h, dt, t, P, at) {
    h.params.seatY = P[5] || 0;
    if (at !== null && at < (h._at ?? 0)) h.animT = 0;   // a one-shot move (a hop, a cast) starts over
    h._at = at;
    h.update(dt, t, P[3], P[2]);
  },
  // framed by how tall they really are (the top of the head or hat, measured when built: long legs and big heads fit too)
  frame: (look, h) => { const top = (h && h._top) || 1.75 * ((look && look.scale) || 1); return { y: top * 0.48, dist: Math.max(2.2, top * 2.45), tall: true }; },
  code: (id, look) => ({ text: toCode(id, look), where: 'The look for public/js/npc-looks.js (NPCS.' + id + '.look).' }),
};
