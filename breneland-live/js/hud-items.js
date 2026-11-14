// The HUD's items: every piece a layout places and the HUD Editor (/editor/hud.html) lets Andrew move and size, in one list.
// hud-layout.js places them from it, the editor names them from it and server.js accepts a saved layout's pieces by it (it reads
// the ids from this file at boot). No imports, so all three can load it.
//
// An item: id -> { name, note?, sel (the element; null for a place with no piece of its own), kind, base: [w, h] (frame px at
// size 1), pop? (a popout: shown only on its trigger), feature? (who adds it), mode? (shows only in that mode: ITEM_MODES), touch?
// (only on a touch screen) }.
//   kind: box (width and height set) | pill (height set, width from its words) | log (width set, grows upward) | panel (a list) |
//   strip (the clock and weather along the map's top) | words (the interact words beside the E) | radial | wheel | typing |
//   slot (a place where a feature's own button goes: Cast, Dive, RUN, the tower grip) | anchor (a place a feature reads, see below)
// A FEATURE adds an editable item by adding an entry here (with feature: 'its name') and its spot to each layout's source JSON
// (docs/refs/ui-revamp/hud3-*.json, then tools/hud-part0-gen.mjs), or at run time with registerHudItem(id, item, defaults)
// where defaults = { layoutId: { x, y, s } } (a layout that leaves the item out uses its default). A 'box' or 'pill' item with a sel is
// placed by hud-layout.js like the core pieces; an 'anchor' item is only a place: hud-layout.js writes its box as CSS vars on #hud,
// --<id>-l / -t / -w / -h / -r / -b (px), for the feature's own CSS, and the editor shows it as a box to drag and size. Server ids
// come from this file, so a run-time item is saved only once its entry is here too.
export const HUD_ITEMS = {
  quests: { name: 'Quests pill', sel: '#quests .qt-head', kind: 'pill', base: [139, 38] },
  questopen: { name: 'Quest list', note: 'The open quests (and the tips that come in as quest lines) under the pill.', sel: '#quests .qt-body', kind: 'panel', base: [230, 112], pop: true },
  map: { name: 'Minimap', note: 'The clock, the weather, the heart and the place name keep to it: move or size the map and they come along.', sel: '#minimap', kind: 'box', base: [116, 84] },
  // (hud-loose, Andrew 2026-11-05: "the time and weather should be pills": two pills over the map's top-right corner, they were a strip
  // along its top)
  time: { name: 'Clock', note: "The time; a tap opens the big map. It keeps to the map's top-right corner: move or size the map and it comes along.", sel: '#hud-time', kind: 'pill', base: [88, 28] },
  weather: { name: 'Weather', note: "The weather in Arden (its word shows when you point at it on a PC). It keeps to the map's top-right corner, beside the clock.", sel: '#hud-wx', kind: 'pill', base: [66, 28] },
  online: { name: 'Who is here', note: 'The heart on a bottom corner of the map (the nearer one). It moves with the map.', sel: '#online', kind: 'pill', base: [36, 38] },
  place: { name: 'Place name', note: 'Under the map; takes its width from the place name. It moves with the map.', sel: '#place', kind: 'pill', base: [83, 28] },
  bigmap: { name: 'Big map', sel: '#map', kind: 'box', base: [288, 214], pop: true },
  chatlog: { name: 'Chat log', note: 'Grows upward from its bottom edge, and fades out when nobody has said anything for a while.', sel: '#chat-log', kind: 'log', base: [256, 51] },
  chat: { name: 'Chat bar', sel: '#chat-form', kind: 'box', base: [240, 40] },
  typing: { name: 'Typing bar', note: 'Where the chat bar goes while you type (it rides above a phone keyboard).', sel: '#chat-form', kind: 'typing', base: [440, 38], pop: true },
  interact: { name: 'Interact (E)', note: 'The round E in the middle of the cluster. Its words are their own piece (Action words).', sel: '#btn-act', kind: 'box', base: [94, 80] },
  words: { name: 'Action words', note: 'What the E does ("Say hi to Nala"): their right end and middle go where this box is; they grow left and wrap when long.', sel: '#btn-act .act-name', kind: 'words', base: [120, 22] },
  mic: { name: 'Voice button', sel: '#mic-toggle', kind: 'box', base: [36, 36] },
  smiley: { name: 'Emotes button', note: 'The smiley; the emote wheel fans out of it, up over the screen.', sel: '#tg-emotes', kind: 'box', base: [40, 40] },
  tools: { name: 'Tools button', sel: '#tg-tools', kind: 'box', base: [54, 54] },
  view: { name: 'View toggle', note: 'First person or the room view: only shows inside a building where it works.', sel: '.lc-view', kind: 'box', base: [34, 34] },
  help: { name: '? button', sel: '#btn-help', kind: 'box', base: [34, 34] },
  slot: { name: 'Cast spot', note: 'Cast, Dive, RUN and the tower\'s big button take this spot in the mini-games (there is no jump button: a tap on the right half jumps).', sel: null, kind: 'slot', base: [60, 60] },
  toolradial: { name: 'Tool radial', note: 'Turns about the tools button. The dial sets the tilt.', sel: '#crosspad', kind: 'radial', base: [104, 208], pop: true },
  emote: { name: 'Emote wheel', note: 'Fans out of the emotes button: only its size counts here. Its numbers are below.', sel: '#emote-wheel', kind: 'wheel', base: [176, 176], pop: true },
  treats: { name: 'Treats', sel: '#currency .cur[data-id="treat"]', kind: 'pill', base: [57, 34] },
  fish: { name: 'Fish', sel: '#currency .cur[data-id="fish"]', kind: 'pill', base: [45, 34] },
  // places a feature reads (anchor: CSS vars on #hud, --<id>-l / -t / -w / -h / -r / -b)
  climb: { name: 'Climb bar', note: 'The grip bar and the route name on the water tower while you climb (css/tower.css): its middle and bottom go here.', sel: null, kind: 'anchor', base: [230, 56], feature: 'tower' },
  // a mode's own pieces (hud-loose): anchors with sel = the piece itself, which shows only in that mode (mode: ITEM_MODES below; the
  // HUD Editor shows them behind that mode's chip, a sample of each); touch: only on a touch screen. Their CSS (maze.css, tower.css)
  // places them from the vars and sizes their words by the box's height, so size 1 = how they were before.
  breath: { name: 'Breath bar', note: 'How much running you have left. Size makes it longer (and no thinner than 9 px). The distance line keeps to it.', sel: '.mz-breath', kind: 'anchor', base: [220, 9], feature: 'maze', mode: 'maze' },
  distance: { name: 'Distance line', note: 'How far to the next thing to do ("42 m to the way out"); the week\'s goal strip rides under it. It keeps to the breath bar: move the bar and it comes along.', sel: '.mz-dist', kind: 'anchor', base: [150, 15], feature: 'maze', mode: 'maze' },
  mazeview: { name: 'Maze view button', note: 'First person or over the shoulder, down below. Touch screens only (F on a keyboard).', sel: '.mz-view', kind: 'anchor', base: [38, 38], feature: 'maze', mode: 'maze', touch: true },
  letgo: { name: 'Let go', note: 'Off the steel while you climb. Touch screens only (E on a keyboard, B on a pad). On a tablet the big Lunge / Jump button sits over it.', sel: '.tower-btn.letgo', kind: 'anchor', base: [70, 32], feature: 'tower', mode: 'tower', touch: true },
  climbcard: { name: 'Climb card', note: 'The first climb\'s card: the route and the three things that matter. Its middle and top go here; it is as wide as its words.', sel: '.tower-card', kind: 'anchor', base: [440, 110], feature: 'tower', mode: 'tower' },
  // the gamepad's own
  name: { name: 'Your name', sel: '#pad-name', kind: 'pill', base: [113, 32] },
  slotx: { name: 'Slot X', sel: '#pad-slot-x', kind: 'box', base: [46, 46] },
  sloty: { name: 'Slot Y', sel: '#pad-slot-y', kind: 'box', base: [46, 46] },
  logoff: { name: 'Log off card', sel: '#logoff', kind: 'box', base: [190, 112], pop: true },
  questflare: { name: 'Quest flare', sel: '#quest-flare', kind: 'pill', base: [111, 34], pop: true },
  // the old jump button: gone since hud3, still readable in an old saved layout
  jump: { name: 'Jump (old)', sel: null, kind: 'gone', base: [68, 68] },
  // the coins pill: gone since no-coins (2026-11-09, Andrew: coins are not a currency), still readable in an old saved layout
  coins: { name: 'Coins (old)', sel: null, kind: 'gone', base: [45, 34] },
};

// the modes a piece can belong to: the HUD Editor's chip for each, and what it says about a piece of it
export const ITEM_MODES = {
  maze: { chip: 'Below the house', says: 'Only shows below the Lovecraft house' },
  tower: { chip: 'On the tower', says: 'Only shows on the tower' },
};

// run-time items and their spots per layout (hud-layout.js lays them under the built-in: a layout that has the item keeps its own)
export const ITEM_DEFAULTS = {};
export function registerHudItem(id, item, defaults = {}) {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(id)) throw new Error('hud item ids are lower case: ' + id);
  HUD_ITEMS[id] = { kind: 'anchor', sel: null, base: [60, 60], ...item };
  for (const [lid, e] of Object.entries(defaults)) (ITEM_DEFAULTS[lid] ||= {})[id] = e;
  return HUD_ITEMS[id];
}
export const itemName = id => HUD_ITEMS[id]?.name || id;
