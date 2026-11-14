// Gamepad support for Input (Gamepad API, "standard" mapping: Xbox, PlayStation, Switch Pro and most others).
//
// Sticks are read as analog values (walk speed, camera turn). Most buttons are turned into the key code the keyboard would
// produce and pushed through input.padKey(), so any feature that reads keys (fishing on Space, the swing on Space/E, the bocce aim)
// works with a pad for free. The layout follows Andrew's gamepad HUD (docs/refs/andrew-gamepad-hud-layout.json). A and B follow
// the controller's OWN letters (a Switch pad's A is on the right), so do X and Y. The rest go by place:
//   A = KeyE: interact and confirm        B = Escape: cancel, back, put away
//   X, Y = the two tool slots (hud-pad.js reads `slots`): a press uses the tool on it; a hold (ASSIGN_SECS, a ring fills) opens
//          the tool picker to choose what goes on it ("None" takes it off); empty, a press opens the picker too
//   L1 (LB) = hold to run        R1 (RB) = Space: jump        L2 (LT) = hold for the emote wheel (`wheel`)
//   R2 (RT) = KeyN: the big map        Select (View) = KeyJ: the quest log        Start (Menu) = PadStart: the log off card
//   R3 = KeyT: chat        L3 = camera distance        D-pad: steers the tool picker; held down = push to talk (voice chat)
// On the start screen, in Settings, the letter and the log off card (plain DOM) the same pad drives the focus instead: the
// D-pad or left stick moves between controls, A presses, B goes back a page (or closes), Start = "Step outside" / close, Y on
// the log off card opens Settings.

const DEADZONE = 0.18;        // radial, left stick
const LOOK_DEADZONE = 0.14;   // right stick
const LOOK_YAW = 2.9;         // radians per second at full tilt (mouse: 0.0055 rad per px, so this is px/s below)
const LOOK_PITCH = 1.7;
const NAV_FIRST = 0.36, NAV_REPEAT = 0.13; // seconds before a held direction repeats in menus
export const HOLD_SECS = 0.3; // a press longer than this is a hold
export const ASSIGN_SECS = 0.6; // a hold this long on X or Y opens the tool picker for that slot (hud3-wheels: was a 5 s hold to take it off)

// standard-mapping button index -> key code, for the buttons that go by place
const KEYS = {
  5: 'Space', 7: 'KeyN', 8: 'KeyJ', 9: 'PadStart', 11: 'KeyT',
  12: 'PadUp', 15: 'PadRight', 13: 'PadDown', 14: 'PadLeft',
};
const LB = 4;
const WHEEL = 6;             // L2 / LT: hold = the emote wheel
const RUN_BUTTONS = [4];     // L1 / LB
const L3 = 10;
const TALK = 13;             // D-pad down held = push to talk (voice chat); nothing else in the world uses it
const VIEW = 8, TOOL = 3;    // kept for older callers: View is the quest log now, the tool slots are X and Y
// the standard index of each face LETTER, per controller family
const LETTERS = { xbox: { A: 0, B: 1, X: 2, Y: 3 }, ps: { A: 0, B: 1, X: 2, Y: 3 }, switch: { A: 1, B: 0, X: 3, Y: 2 } };
// what each face button does, by letter (the Controls picture and the HUD read these)
const FACE_CODES = ['KeyE', 'Escape', 'SlotX', 'SlotY']; // A B X Y
// the buttons that do something on a hold, and the tap's key where the tap does something else (the Controls picture reads these)
const PAD_HOLDS = { [WHEEL]: 'EmoteWheel', [TALK]: 'KeyB' };
const PAD_TAPS = {};

// What each key is called on a pad, by controller family.
const FACE = {
  xbox: { KeyE: 'A', Escape: 'B', SlotX: 'X', SlotY: 'Y', Space: 'RB', KeyN: 'RT', KeyJ: 'View', PadStart: 'Menu', KeyH: 'Menu', KeyT: 'R3', LB: 'LB', KeyB: 'D-pad down', EmoteWheel: 'LT', Run: 'LB', Tab: 'X' },
  ps: { KeyE: 'Cross', Escape: 'Circle', SlotX: 'Square', SlotY: 'Triangle', Space: 'R1', KeyN: 'R2', KeyJ: 'Share', PadStart: 'Options', KeyH: 'Options', KeyT: 'R3', LB: 'L1', KeyB: 'D-pad down', EmoteWheel: 'L2', Run: 'L1', Tab: 'Square' },
  switch: { KeyE: 'A', Escape: 'B', SlotX: 'X', SlotY: 'Y', Space: 'R', KeyN: 'ZR', KeyJ: '-', PadStart: '+', KeyH: '+', KeyT: 'R stick', LB: 'L', KeyB: 'D-pad down', EmoteWheel: 'ZL', Run: 'L', Tab: 'X' },
};
// the words hints use ("E  Say hi") -> key code
const WORD = { E: 'KeyE', Space: 'Space', Esc: 'Escape', Tab: 'Tab', H: 'KeyH', N: 'KeyN', T: 'KeyT', B: 'KeyB', J: 'KeyJ' };

export function padFamily(id = '') {
  if (/054c|playstation|dualshock|dualsense|ps[345]/i.test(id)) return 'ps';
  if (/057e|nintendo|switch|joy-?con|pro controller/i.test(id)) return 'switch';
  return 'xbox';
}

// Radial dead zone with a gentle curve so slow walking is easy: returns [x, y] with |v| in 0..1.
export function shape(x, y, dead, power = 1.5) {
  const m = Math.hypot(x, y);
  if (m <= dead) return [0, 0];
  const t = Math.min(1, (m - dead) / (1 - dead));
  const k = Math.pow(t, power) / m;
  return [x * k, y * k];
}

export class GamepadReader {
  constructor(input) {
    this.input = input;
    this.index = -1;              // the pad that last had input
    this.family = 'xbox';
    this.connected = false;
    this.moveX = 0; this.moveY = 0; // walk intent, y = forward
    this.run = false;
    this.lookX = 0; this.lookY = 0;  // this frame's camera turn in mouse-pixel units (not accumulated)
    this.sx = [0, 0]; this.sy = [0, 0]; // both sticks raw (left, right), for the wheels: x right, y down
    this.prev = new Array(17).fill(false);
    this.cur = new Array(17).fill(false); // this frame's button states (reused, no per-frame allocation)
    this.idleT = 1;
    this.prime = true;            // the next poll only records button states (after focus returns, no phantom presses)
    this.navDir = null; this.navT = 0;
    this.slots = [false, false];  // the X and Y tool slots are down, in the world (hud-pad.js decides use, pick or unequip)
    this.tool = false;            // either slot, for older callers
    this.wheel = false;           // L2 is down, in the world (the emote wheel)
    this.lb = false;              // push to talk is held (D-pad down; voice.js reads it)
    this.dpad = [false, false, false, false]; // up, right, down, left held (the tool picker steers with them)
    this.letterKeys = { A: false, B: false }; // A (KeyE) and B (Escape) are sent by letter, so released here too
    this.lastRumble = 0;
    this.hasApi = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    this.blurred = false;         // the window is not focused: browsers may keep reporting a held stick, so we ignore the pad
    addEventListener('blur', () => { this.blurred = true; });
    addEventListener('focus', () => { this.blurred = false; this.prime = true; });
    addEventListener('gamepadconnected', e => this.onConnect(e.gamepad));
    addEventListener('gamepaddisconnected', e => this.onDisconnect(e.gamepad));
  }

  onConnect(pad) {
    if (pad.mapping !== 'standard') { this.input.toast?.('That controller has an unusual layout, so it is ignored. Try an Xbox, PlayStation or Switch pad'); return; }
    this.family = padFamily(pad.id);
    this.prime = true;
    this.input.toast?.('Controller connected - left stick walks, right stick looks');
  }
  onDisconnect(pad) {
    if (pad.index === this.index) { this.release(); this.index = -1; this.connected = false; this.input.setHudFocus?.(false); this.input.toast?.('Controller unplugged'); }
  }

  // let go of everything the pad is holding (blur, disconnect, typing, overlays opening)
  release() {
    for (const i in KEYS) if (this.prev[i]) this.input.padKey(KEYS[i], false);
    if (this.letterKeys.A) this.input.padKey('KeyE', false);
    if (this.letterKeys.B) this.input.padKey('Escape', false);
    this.letterKeys.A = this.letterKeys.B = false;
    this.prev.fill(false);
    this.moveX = this.moveY = 0; this.run = false; this.lookX = this.lookY = 0;
    this.sx[0] = this.sx[1] = this.sy[0] = this.sy[1] = 0;
    this.navDir = null;
    this.tool = this.wheel = this.lb = false; this.slots[0] = this.slots[1] = false;
    this.dpad.fill(false);
    this.prime = true;
  }

  // what a face button (0-3 = A B X Y by letter), or a key code / 'LB', is called on this pad
  btnName(i) { const code = typeof i === 'number' ? FACE_CODES[i] : i; return (code && FACE[this.family][code]) || String(i); }
  // the standard index of a face letter on this pad ('A', 'B', 'X', 'Y')
  idx(letter) { return LETTERS[this.family][letter]; }

  // The pad that most recently had input; if none has, the first connected one.
  pick(pads) {
    let best = null;
    for (const p of pads) {
      if (!p || !p.connected || p.mapping !== 'standard') continue; // wheels, flight sticks and odd pads report axes that would spin the camera
      if (!best) best = p;
      if (p.index === this.index) best = p; // stay on the current one unless another shows activity below
    }
    for (const p of pads) {
      if (!p || !p.connected || p.mapping !== 'standard' || p.index === this.index) continue;
      if (this.active(p)) { best = p; break; }
    }
    return best;
  }
  active(p) {
    for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i]?.pressed) return true;
    return Math.hypot(p.axes[0] || 0, p.axes[1] || 0) > 0.5 || Math.hypot(p.axes[2] || 0, p.axes[3] || 0) > 0.5;
  }

  poll(dt) {
    if (!this.hasApi) return;
    if (this.blurred) { if (this.connected) this.release(); return; }
    // with no pad around, look for one a few times a second instead of every frame
    if (!this.connected && (this.idleT += dt) < 0.3) return;
    this.idleT = 0;
    let pads;
    try { pads = navigator.getGamepads(); } catch { return; }
    if (!pads) return;
    const pad = this.pick(pads);
    if (!pad) { if (this.connected) { this.release(); this.connected = false; } return; }
    if (pad.index !== this.index) { this.release(); this.index = pad.index; this.family = padFamily(pad.id); if (this.active(pad)) this.input.setDevice('pad'); }
    this.connected = true;
    const input = this.input;
    const btn = i => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };

    // while typing (chat) the pad sleeps: nothing walks, nothing presses
    if (input.typing) { this.release(); return; }

    const dom = input.overlayOpen; // a menu, or the HUD focus
    const ax0 = pad.axes[0] || 0, ax1 = pad.axes[1] || 0, ax2 = pad.axes[2] || 0, ax3 = pad.axes[3] || 0;
    const [lx, ly] = shape(ax0, ax1, DEADZONE, 1.35);
    const [rx, ry] = shape(ax2, ax3, LOOK_DEADZONE, 1.7);
    // a stick has to be pushed properly to count as "the player switched to the pad" (a worn stick that rests at 0.2 must not fight the mouse for the hint labels)
    let busy = Math.hypot(lx, ly) > 0.25 || Math.hypot(rx, ry) > 0.25;
    const down = this.cur;
    for (let i = 0; i < 17; i++) { down[i] = btn(i); if (down[i] && !this.prev[i]) busy = true; }
    if (busy && !this.prime) input.setDevice('pad');

    if (this.prime) { // first frame after focus / connect: just remember what is held
      this.prime = false;
      for (let i = 0; i < 17; i++) this.prev[i] = down[i];
      return;
    }

    if (dom) {
      this.wasDom = true;
      this.pollMenu(dt, down, pad);
      for (let i = 0; i < 17; i++) this.prev[i] = down[i];
      this.moveX = this.moveY = 0; this.run = false; this.lookX = this.lookY = 0; this.tool = this.wheel = this.lb = false; this.slots[0] = this.slots[1] = false;
      for (let i = 0; i < 4; i++) this.dpad[i] = false;
      return;
    }

    // a menu just closed (B on the log off card, A on a button): a button still held from it must not act again out here
    if (this.wasDom) {
      this.wasDom = false;
      const L0 = LETTERS[this.family];
      for (let i = 0; i < 17; i++) this.prev[i] = down[i];
      this.letterKeys.A = down[L0.A]; this.letterKeys.B = down[L0.B];
    }
    // walking and looking (an open wheel takes both sticks, hud-wheel.js picks with them)
    this.sx[0] = ax0; this.sy[0] = ax1; this.sx[1] = ax2; this.sy[1] = ax3;
    if (input.wheelOpen) { this.moveX = this.moveY = 0; this.lookX = this.lookY = 0; }
    else {
      this.moveX = lx; this.moveY = -ly;
      this.lookX = rx * LOOK_YAW * dt / 0.0055;
      this.lookY = ry * LOOK_PITCH * dt / 0.004;
    }
    this.run = down[RUN_BUTTONS[0]];
    // buttons -> keys (A and B by their letters, so they follow the controller's own A and B)
    for (const i in KEYS) {
      if (down[i] === this.prev[i]) continue;
      input.padKey(KEYS[i], down[i]);
    }
    const L = LETTERS[this.family], a = down[L.A], b = down[L.B];
    if (a !== this.letterKeys.A) { this.letterKeys.A = a; input.padKey('KeyE', a); }
    if (b !== this.letterKeys.B) { this.letterKeys.B = b; input.padKey('Escape', b); }
    if (down[L3] && !this.prev[L3]) input.zoomCycle = true;
    this.slots[0] = down[L.X]; this.slots[1] = down[L.Y];
    this.tool = this.slots[0] || this.slots[1];
    this.wheel = down[WHEEL];
    this.lb = down[TALK];
    this.dpad[0] = down[12]; this.dpad[1] = down[15]; this.dpad[2] = down[13]; this.dpad[3] = down[14];
    for (let i = 0; i < 17; i++) this.prev[i] = down[i];
  }

  // ---- menus: the pad moves the focus around plain DOM (start screen, help panel, mail letter, the HUD focus)
  pollMenu(dt, down, pad) {
    const input = this.input;
    const edge = i => down[i] && !this.prev[i];
    const [sx, sy] = [pad.axes[0] || 0, pad.axes[1] || 0];
    let dir = null;
    if (down[12] || sy < -0.6) dir = 'up';
    else if (down[13] || sy > 0.6) dir = 'down';
    else if (down[14] || sx < -0.6) dir = 'left';
    else if (down[15] || sx > 0.6) dir = 'right';
    if (dir !== this.navDir) { this.navDir = dir; this.navT = NAV_FIRST; if (dir) input.menuMove(dir); }
    else if (dir) { this.navT -= dt; if (this.navT <= 0) { this.navT = NAV_REPEAT; input.menuMove(dir); } }
    const L = LETTERS[this.family];
    if (edge(L.A)) input.menuPress();
    if (edge(L.B)) input.menuBack();
    if (edge(9)) input.menuStart();
    if (edge(L.Y)) input.menuY?.();
  }

  rumble(strong, weak, ms) {
    if (!this.hasApi || this.index < 0) return;
    let pad;
    try { pad = navigator.getGamepads()?.[this.index]; } catch { return; }
    const act = pad?.vibrationActuator;
    if (!act?.playEffect) return;
    try {
      const p = act.playEffect('dual-rumble', { startDelay: 0, duration: Math.max(1, Math.min(2000, ms | 0)), strongMagnitude: Math.max(0, Math.min(1, strong)), weakMagnitude: Math.max(0, Math.min(1, weak)) });
      p?.catch?.(() => {});
    } catch { /* not supported */ }
  }

  // what a hint word ("E", "Space", "Esc"...) is called on this pad
  glyph(word) {
    const code = WORD[word];
    return (code && FACE[this.family][code]) || word;
  }
}

// the Settings > Controls picture labels the drawn pad from these (settings-controls.js), so a remap here relabels it
export { KEYS as PAD_KEYS, FACE, FACE_CODES, LETTERS, RUN_BUTTONS, L3, LB, TALK, TOOL, WHEEL, VIEW, PAD_HOLDS, PAD_TAPS };
