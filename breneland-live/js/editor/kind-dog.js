// The NPC Editor's dogs (Dax, Nala and Molly): sliders, poses and photos. A kind tells the editor shell (npc-editor.js)
// what rows to show, how to build the character and what its built-in look is.
import { Dog, DAX, NALA, MOLLY, DAX_BUILTIN, NALA_BUILTIN, MOLLY_BUILTIN, LOOK_DEF, BUILD_DEF, TUMBLE_DUR, FLOP_DUR, SLAM_DUR, YIP_DUR, EAT_DUR, SWAT_DUR } from '/js/dogs.js';
import { AudioEngine } from '/js/audio.js';
import { VOICE_DEF } from '/js/dog-voice.js';

const deep = o => JSON.parse(JSON.stringify(o));

// k: the look key ('build.len' lives in look.build). num: a slider (min/max from the server's ranges). color: a colour
// (opt: may be none). bool: a switch. choice: a few named options.
const GROUPS = [
  { id: 'body', name: 'Body', color: '#ffd34d', rows: [
    ['build.len', 'Length'], ['build.girth', 'Depth (back to belly)'], ['build.width', 'Width'], ['build.chest', 'Chest'], ['build.tuck', 'Waist tuck'],
    ['build.rump', 'Rump'], ['build.topline', 'Back slope (down to the rump)'], ['scale', 'Whole dog size'],
  ] },
  { id: 'neck', name: 'Neck', color: '#8fd0ee', rows: [
    ['build.neck', 'Length'], ['build.neckR', 'Thickness'], ['build.neckAngle', 'Angle (more upright)'], ['dewlap', 'Loose skin'],
  ] },
  { id: 'head', name: 'Head', color: '#ff9f4a', rows: [
    ['build.head', 'Size'], ['build.headW', 'Skull width'], ['build.skull', 'Skull height'], ['build.crown', 'Skull roundness'],
    ['build.muzzle', 'Muzzle length'], ['build.muzzleW', 'Muzzle width'], ['build.muzzleH', 'Muzzle depth'], ['build.muzzleTaper', 'Muzzle taper to the nose'],
    ['build.muzzleTilt', 'Muzzle tipped down'], ['build.stop', 'Stop (the step above the muzzle)'], ['noseSize', 'Nose size'], ['build.flews', 'Jowls'],
  ] },
  { id: 'ears', name: 'Ears', color: '#b48cff', rows: [
    ['earSize', 'Size'], ['build.earDrop', 'Set lower on the head'], ['build.earSet', 'Set wider apart'], ['earHang', 'Fold in to the cheek'],
    ['earTilt', 'Tip back'], ['earCup', 'Cup'], ['earStyle', 'Kind', 'choice', [['flop', 'Flop'], ['rose', 'Rose (folded back)']]],
  ] },
  { id: 'eyes', name: 'Eyes', color: '#a8e06b', rows: [
    ['eyeSize', 'Size'], ['build.eyeSpread', 'Spacing'], ['build.eyeUp', 'Height on the face'], ['eyeTilt', 'Outer corners up'],
    ['lidDroop', 'Droopy lids'], ['browTilt', 'Brow slope (sad)'], ['brows', 'Brows', 'choice', [[true, 'Strong'], ['soft', 'Soft'], [false, 'None']]],
  ] },
  { id: 'legs', name: 'Legs', color: '#ff8fb8', rows: [
    ['build.leg', 'Front leg length'], ['build.hindLeg', 'Hind leg length'], ['build.legR', 'Thickness'], ['build.paw', 'Paw size'],
    ['build.hock', 'Hind bend (paws forward)'], ['build.stance', 'Stance width'],
  ] },
  { id: 'tail', name: 'Tail', color: '#8fd0ee', rows: [
    ['build.tailLen', 'Length'], ['build.tailR', 'Thickness'], ['tail', 'Carried up at rest'], ['happyTail', 'Carried up when happy'], ['curl', 'Curl when happy'],
  ] },
  { id: 'coat', name: 'Coat', color: '#c98a4a', rows: [
    ['coat', 'Base colour', 'color'], ['belly', 'Belly and chest', 'color', 'opt'],
    ['stripes', 'Brindle', 'color', 'opt'], ['brindleDensity', 'Brindle: how much'], ['brindleContrast', 'Brindle: how dark'], ['brindleWidth', 'Brindle: streak width'],
    ['mask', 'Dark muzzle', 'color', 'opt'], ['maskAmt', 'Dark muzzle: how dark'],
    ['ear', 'Ears', 'color'], ['earTint', 'Ears (on a brindle coat)', 'color', 'opt'], ['nose', 'Nose', 'color'], ['eye', 'Eyes', 'color'], ['lid', 'Eyelids', 'color', 'opt'],
    ['white', 'White marks', 'color'], ['blaze', 'Blaze (stripe up the face)', 'bool'], ['blazeSize', 'Blaze size'], ['bib', 'White bib', 'bool'], ['bibSize', 'Bib size'],
    ['socks', 'Front socks', 'bool'], ['sockLen', 'Sock length'], ['hindToes', 'White hind toes', 'bool'],
    ['collar', 'Collar', 'color'], ['tag', 'Tag', 'color'],
  ] },
  // Molly's sable coat with tan points, and her gear
  { id: 'sable', name: 'Sable coat', color: '#b8834f', rows: [
    ['points', 'Tan points (cheeks, brows, legs)', 'color', 'opt'], ['speckle', 'Merle speckles'], ['muzzle', 'Grey muzzle', 'color', 'opt'], ['grizzle', 'Grey muzzle: how much'],
    ['tailTip', 'White tail tip', 'color', 'opt'], ['fluff', 'Shaggy coat'], ['tailBush', 'Bushy tail'],
    ['harness', 'Harness', 'color', 'opt'], ['goggles', 'Goggles (in the golf cart)', 'color', 'opt'],
  ] },
  { id: 'posture', name: 'Posture', color: '#ffd34d', rows: [
    ['headCarry', 'Head tipped down'], ['neckCarry', 'Neck bent down'], ['spineLevel', 'Body pitched nose-down'], ['heavy', 'Heavy mover'], ['prance', 'Prancing'],
  ] },
  { id: 'sit', name: 'Sit', color: '#ff9f4a', rows: [
    ['sitBack', 'Lean back'], ['sitTuck', 'Hind paws forward'], ['sitSplay', 'Knees out'], ['sitFront', 'Front paws forward'], ['sitHead', 'Head up'],
  ] },
  // the voice (dog-voice.js): saved in look.voice, heard by everyone when the dog speaks; the buttons play it with these values
  { id: 'voice', name: 'Voice', color: '#ff8fb8', rows: [
    ['voice.pitch', 'Pitch'], ['voice.bright', 'Brightness (darker to brighter)'], ['voice.speed', 'Bark speed'], ['voice.loud', 'Loudness (dB, quieter or a little louder)'],
    ['voice.growl', 'Growl or rasp'], ['voice.woof', 'Yap or woof'],
  ], footer: (...a) => voiceButtons(...a) },
];
// poses: [id, words, anim name, ground speed, loop length for the one-shot moves]
const POSES = [
  ['stand', 'Stand', null, 0], ['walk', 'Walk', null, 1.0], ['trot', 'Trot', null, 2.0], ['run', 'Run', null, 5.0], ['lope', 'Lope', 'lope', 4.2],
  ['sit', 'Sit', 'sit', 0], ['sitlook', 'Sit and look', 'sitlook', 0], ['lie', 'Lie down', 'lie', 0], ['rest', 'Sleep', 'rest', 0],
  ['playbow', 'Play bow', 'playbow', 0], ['look', 'Alert', 'look', 0], ['bark', 'Bark', 'bark', 0], ['happy', 'Happy', 'happy', 0], ['wag', 'Wag', 'wag', 0],
  ['pant', 'Pant', 'pant', 0], ['sniff', 'Sniff', 'sniff', 0], ['bounce', 'Bounce', 'bounce', 0], ['spin', 'Spin', 'spin', 0],
  ['yip', 'Yipe', 'yip', 0, YIP_DUR + 0.5], ['eat', 'Eat', 'eat', 0, EAT_DUR + 0.4], ['cower', 'Scared', 'cower', 0], ['startle', 'Startle', 'startle', 0, 0.9],
  ['tumble', 'Tumble', 'tumble', 0, TUMBLE_DUR + 0.5], ['flop', 'Flop', 'flop', 0, FLOP_DUR + 0.5], ['slam', 'Pounce', 'slam', 0, SLAM_DUR + 0.6],
  ['snap', 'Catch', 'snap', 0, 1.0], ['shake', 'Shake off', 'shake', 0, 1.4],
  ['ride', 'Ride in the cart', 'sit', 0],   // (sitting with the goggles on, as in Joyce's golf cart)
  ['swat', 'Swat', 'swat', 0, SWAT_DUR + 0.6], ['tug', 'Tug', 'tug', 0],
];
// Andrew's photos (tools/npc-editor-refs.mjs shrinks them into /editor/refs). view / pose: what to show them against.
const PHOTOS = [
  ['andrew-dax-side2.jpg', 'Dax from the side', 'side', 'stand'], ['andrew-dax-front2.jpg', 'Dax from the front', 'front', 'stand'],
  ['andrew-dax-threequarter2.jpg', 'Dax three-quarter', 'three', 'stand'], ['andrew-dax-top.jpg', 'Dax from above', 'top', 'stand'],
  ['andrew-dax-sitting.jpg', 'Dax sitting', 'three', 'sit'], ['andrew-dax-side.jpg', 'Dax at night, side', 'side', 'look'],
  ['andrew-dax-nala-front.jpg', 'Both from the front', 'front', 'stand'], ['andrew-dax-nala-photo.jpg', 'Both sitting, from above', 'three', 'sit'],
  ['andrew-nala-lying-front.jpg', 'Nala lying, front', 'front', 'lie'], ['andrew-nala-lying-side.jpg', 'Nala lying, side', 'side', 'lie'],
  ['andrew-molly-1.jpg', 'Molly on the golf cart', 'front', 'ride'], ['andrew-molly-2.jpg', 'Molly sitting, side', 'side', 'sit'],
  ['andrew-molly-dax-nala.jpg', 'Molly, Dax and Nala', 'front', 'lie'],
];
const BUILTIN = { dax: DAX_BUILTIN, nala: NALA_BUILTIN, molly: MOLLY_BUILTIN };

// 'build.len' lives in look.build, 'voice.pitch' in look.voice
const subOf = k => (k.startsWith('build.') ? 'build' : k.startsWith('voice.') ? 'voice' : null);
const isBuild = k => subOf(k) === 'build';
const getP = (o, k) => { const s = subOf(k); return s ? (o[s] ? o[s][k.slice(6)] : undefined) : o[k]; };
function setP(o, k, v) {
  const s = subOf(k);
  if (s) {
    if (!o[s]) o[s] = {};
    if (v === undefined) delete o[s][k.slice(6)]; else o[s][k.slice(6)] = v;
    if (s === 'voice' && !Object.keys(o.voice).length) delete o.voice;   // nothing set: no voice key at all
  } else if (v === undefined) delete o[k]; else o[k] = v;
}

// ---- the voice preview: the game's own AudioEngine and dog voice, made on the first tap (browsers only play sound after
// one). Nothing plays before a button is pressed.
const PREVIEWS = [['bark', 'Bark', '*happy wuff!*', 'happy'], ['excited', 'Excited', 'BORK BORK!', 'excited'], ['alert', 'Alert', 'BORK!', 'alert'],
  ['whine', 'Whine', '*whine*', 'sad'], ['calm', 'Calm', '*soft wuff*', 'calm']];
const NOTE = 'Tap to hear it with these sliders. Save the look and everyone hears it in the game.';
let engine = null;
export const voicePreview = { last: null, plays: 0, engine: () => engine };
function voiceButtons({ id, look }) {
  const wrap = document.createElement('div'), box = document.createElement('div'), note = document.createElement('p');
  box.className = 'choices voice-preview'; note.className = 'voice-note'; note.textContent = NOTE;
  for (const [key, words, text, mood] of PREVIEWS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip voice-btn'; b.dataset.voice = key; b.textContent = words;
    b.addEventListener('click', async () => {
      if (!engine) {   // the context is made inside the tap (iOS needs that), the clips fetched after
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { note.textContent = 'This browser cannot play sound.'; return; }
        engine = new AudioEngine();
        engine.init(new AC(), { beds: false });
        engine.listener = { x: 0, y: 1.6, z: 0 };
      } else if (engine.ctx.state !== 'running' && engine.ctx.resume) engine.ctx.resume().catch(() => {});
      if (!engine.dogBank) note.textContent = 'Fetching the barks...';
      await engine.loadDogs(0);
      note.textContent = NOTE;
      const voice = {};
      for (const k of Object.keys(VOICE_DEF)) voice[k] = dogKind.effective(id(), look(), 'voice.' + k);
      voicePreview.last = { who: id(), mood, voice, info: engine.dogVoice(id(), 0, 0.9, -2, text, mood, voice) };
      voicePreview.plays++;
    });
    box.append(b);
  }
  wrap.append(box, note);
  return wrap;
}
// the look as a dogs.js literal (the "Copy as code" button)
function toCode(id, look) {
  const f = v => typeof v === 'string' ? `'${v}'` : typeof v === 'number' ? String(+v.toFixed(4)) : Array.isArray(v) ? '[' + v.map(f).join(', ') + ']'
    : v && typeof v === 'object' ? '{ ' + Object.entries(v).map(([k, x]) => k + ': ' + f(x)).join(', ') + ' }' : String(v);
  const lines = [], cur = [];
  let len = 0;
  for (const [k, v] of Object.entries(look)) {
    if (k === 'build' || k === 'voice') continue;
    const s = k + ': ' + f(v);
    if (len + s.length > 140 && cur.length) { lines.push(cur.join(', ')); cur.length = 0; len = 0; }
    cur.push(s); len += s.length + 2;
  }
  if (cur.length) lines.push(cur.join(', '));
  return `export const ${id.toUpperCase()} = {\n  ${lines.join(',\n  ')},\n  build: ${f(look.build || {})},${look.voice ? `\n  voice: ${f(look.voice)},` : ''}\n};`;
}

export const dogKind = {
  kind: 'dog', defaultPose: 'stand',
  groups: () => GROUPS,
  poses: () => POSES,
  photos: () => PHOTOS,
  builtin: id => deep(BUILTIN[id]),
  // the game's dog = the built-in look with the saved one merged over it (dogs.js applySavedLooks does the same)
  merged: (id, saved) => (saved ? { ...BUILTIN[id], ...saved, build: { ...BUILTIN[id].build, ...(saved.build || {}) }, name: BUILTIN[id].name } : deep(BUILTIN[id])),
  get: getP, set: setP,
  // what a key is worth once the Dog fills in its defaults (the way Dog() merges: LOOK_DEF, then Nala, then the look)
  effective(id, look, k) {
    const v = getP(look, k);
    if (v !== undefined) return v;
    if (subOf(k) === 'voice') return VOICE_DEF[k.slice(6)];   // (each dog's own voice: never Nala's for Dax)
    const n = getP(NALA, k);
    if (n !== undefined) return n;
    return isBuild(k) ? BUILD_DEF[k.slice(6)] : LOOK_DEF[k];
  },
  // build (or rebuild) the dog; the old one's motion carries on so a slider drag does not reset the pose
  build(id, look, old) {
    const body = deep(look);
    delete body.voice;   // (the voice is not part of the body)
    const nd = new Dog(body);
    if (old) { for (const k of ['anim', 'animT', 'phase', 'wagPhase', 'blend', 'sp', 'wTrot', 'wGal', 't']) nd[k] = old[k]; nd.fadeT = 1; }
    return nd;
  },
  dispose() { /* (dogs.js keeps its own small caches) */ },
  update(d, dt, t, P, at) { d.goggles = P[0] === 'ride'; d.update(dt, t, P[3], P[2], at); },
  frame: look => ({ y: 0.42 * ((look && look.scale) || 1), dist: 3.4 }),
  code: (id, look) => ({ text: toCode(id, look), where: 'Paste this over the same dog in public/js/dogs.js.' }),
};
export { DAX, NALA, MOLLY };
