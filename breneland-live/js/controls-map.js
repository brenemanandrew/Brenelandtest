// The one table of what the core buttons do, read by the Settings > Controls pictures (settings-controls.js) and input.js.
// The gamepad side lives in gamepad.js's own tables (PAD_KEYS, PAD_HOLDS / PAD_TAPS...), so a remap there relabels the
// pictures by itself. The pad's own verbs (ToolUse, EmoteWheel, HudFocus) are named here like keys. Things you do in one
// place (fishing, the swing...) show as context hints instead, and their `help` lines feed the "More" list.

// walking and running (input.js move() / running read these)
export const MOVE_KEYS = {
  fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
};
export const RUN_KEYS = ['ShiftLeft', 'ShiftRight'];

// key code -> [short word for a keycap, longer words for a callout]. Who handles each one:
//   main.js handleKeys: Enter / KeyT (chat), KeyE, Space, Escape, KeyH, KeyM;  inventory.js: Tab / KeyI, KeyQ, KeyZ-V, PadUp-Left, ToolUse;
//   hud-emotes.js: Digit1-8, KeyG (the emote fan);  hud-minimap.js: KeyN;  hud-quests.js: KeyJ;  voice.js: KeyB (hold: push to talk);
//   hud-wheels.js: the pad's tool button and RT (the wheels);  input.js: HudFocus.  tools/settings-test.mjs presses them all.
export const VERBS = {
  Space: ['jump', 'Jump'],
  KeyE: ['use', 'Use, talk, play'],
  Escape: ['back', 'Back, put away, menu'],
  KeyQ: ['swap', 'Swap what you hold'],
  Tab: ['tool', 'Fan out your tools'],
  KeyI: ['pockets', 'Pockets'],
  KeyN: ['map', 'The map'],
  KeyH: ['menu', 'Settings'],
  KeyM: ['sound', 'Sound on or off'],
  KeyJ: ['quests', 'Open or fold the quests'],
  KeyG: ['emote', 'Open the emote wheel'],
  KeyB: ['talk', 'Hold to talk (voice chat)'],
  Enter: ['chat', 'Chat'],
  KeyT: ['chat', 'Chat'],
  KeyZ: ['tool', 'Take out the tool marked Z'],
  KeyX: ['tool', 'Take out the tool marked X'],
  KeyC: ['tool', 'Take out the tool marked C'],
  KeyV: ['tool', 'Take out the tool marked V'],
  PadUp: ['tool', 'Steer the tool picker'],
  PadRight: ['tool', 'Steer the tool picker'],
  PadDown: ['tool', 'Steer the tool picker'],
  PadLeft: ['tool', 'Steer the tool picker'],
  ToolUse: ['tool', 'Use the tool in your hand'],
  SlotX: ['tool', 'Tool slot: press to use it, hold to pick what goes on it'],
  SlotY: ['tool', 'Tool slot: press to use it, hold to pick what goes on it'],
  PadStart: ['menu', 'Log off (or Settings)'],
  EmoteWheel: ['emote', 'Hold: the emote wheel'],
  HudFocus: ['hud', 'Hold: move round the HUD'],
  walk: ['walk', 'Walk'],
  run: ['run', 'Run'],
};
for (let i = 1; i <= 8; i++) VERBS['Digit' + i] = ['emote', 'Emotes'];
for (const k of [...MOVE_KEYS.fwd, ...MOVE_KEYS.back, ...MOVE_KEYS.left, ...MOVE_KEYS.right]) VERBS[k] = VERBS.walk;
for (const k of RUN_KEYS) VERBS[k] = VERBS.run;

// colour groups for the pictures (the HUD palette: hud.css)
export const GROUP = {
  walk: '#a8e06b', run: '#a8e06b', jump: '#8fd0ee', use: '#ff9f4a', back: '#ff8fb8', swap: '#ffd34d', pockets: '#ffd34d',
  tool: '#ffd34d', emote: '#c8b0ff', talk: '#a8e06b', map: '#8fd0ee', menu: '#b48cff', sound: '#b48cff', quests: '#b48cff', chat: '#8fd0ee', hud: '#b48cff',
};
export const verb = code => VERBS[code] || null;
export const groupColor = code => GROUP[VERBS[code]?.[0]] || '#ffffff';

// The mouse (input.js header): [the part that is lit, what it does, how]
export const MOUSE = [
  ['right', 'look', 'hold right, move'],
  ['both', 'walk', 'hold both'],
  ['wheel', 'zoom', 'roll it'],
  ['left', 'click', 'left button'],
];

// The phone (input.js touch, the hud.css phone layout: docs/refs/andrew-hud-phone2-doodle.jpg)
export const TOUCH = {
  stick: 'Left thumb: walk (push far to run)',
  look: 'Right thumb: drag to look',
  act: 'Use, talk, play',
  jump: 'Jump',
  help: 'Settings',
  heart: 'Who is here',
  map: 'Minimap: tap for the map',
  tools: 'Your tools: tap, then tap one',
  emotes: 'Emotes: tap the smiley (Dance: more)',
  chat: 'Chat: tap to type',
  mic: 'Mic on or off',
  quests: 'Quests: tap to open',
};

// The words on the HUD's face-button panel (pad layout) and the interact button, by key code
export const HUD_WORDS = { Space: 'Jump', KeyE: 'Interact', Escape: 'Back', ToolUse: 'Tools', SlotX: 'Tool slot', SlotY: 'Tool slot' };

// A key word as a feature's help line writes it ('E', 'Space', 'Esc', 'Shift', 'Tab', 'A'...) on each device.
const PAD_WORD = { E: 'KeyE', Space: 'Space', Esc: 'Escape', Tab: 'Tab', I: 'Tab', N: 'KeyN', H: 'KeyH', T: 'KeyT', Enter: 'KeyT', B: 'KeyB', Shift: 'Run' };
export function keyWord(word, device, padName) {
  if (device === 'pad') {
    if (word === 'A' || word === 'D' || word === 'W' || word === 'S' || word === 'WASD') return 'L stick';
    return PAD_WORD[word] ? padName(PAD_WORD[word]) : word;
  }
  if (device === 'touch') return word === 'E' ? 'E' : null; // the phone has the E button; the rest show as on-screen buttons where they apply
  return word;
}
