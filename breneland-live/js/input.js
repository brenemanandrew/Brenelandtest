// Keyboard, mouse, gamepad and touch. The contract features rely on is in docs/CONTRACTS.md (Contract 7).
//
//   Mouse: hold the RIGHT button and move to look around; hold LEFT as well and you walk forward (both = auto-forward,
//   Shift runs). A plain LEFT drag looks too (old habits, laptops) and a left press that barely moved is a click (takeClicks()).
//   Wheel zooms. Touch: left half joystick, right half look (a second finger there pinches: the zoom). Gamepad: see gamepad.js (buttons become key codes).
import { GamepadReader } from './gamepad.js';
import { MOVE_KEYS, RUN_KEYS } from './controls-map.js'; // the one table the Settings > Controls picture is drawn from

const CLICK_PX = 6, CLICK_MS = 400;   // a press that moved less than this and was quicker than this is a click
const DRAG_PX = 4;                    // a left press starts turning the camera after this much movement
const OVERLAYS = ['#help', '#letter', '#start', '#logoff', '#voice-ask']; // the big map is a popout, so you can walk with it open
const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;
const ZOOM_STOPS = [4.5, 7.5, 11.5];  // what the controller's L3 cycles through (camera distance)

export class Input {
  constructor(canvas, joystickEl) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = [];
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.zoomCycle = false;
    this.stick = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0 };
    this.lookTouch = null;
    this.pinch = null;      // a second finger on the look side: { id, x, y, d } (the zoom, camera-view)
    this._typing = false;
    this.lastLookAt = 0;
    this.joy = joystickEl;
    // Contract for features (keep when rewriting this file):
    //   pointer: { x, y, over }  where the mouse is over the canvas, in CSS pixels
    //   clicks:  takeClicks() -> [{ x, y, button }]  left presses that were clicks, not camera drags
    //   helpLines: [] (kept for old callers; the controls are drawn in Settings > Controls from controls-map.js and gamepad.js)
    //   update(dt, now): called once per frame (gamepad polling lives here)
    //   lastDevice: 'kbm' | 'pad' | 'touch' (what the player touched last), rumble(strong, weak, ms), glyph('E') -> 'X' on a pad
    this.pointer = { x: 0, y: 0, over: false };
    this.clicks = [];
    this.helpLines = [];
    // a touch-first device (a phone, a tablet) starts as touch, or until the first touch on the 3D view a phone's first tips named keys
    // ("Hold E for 4 seconds..."). Any touch on the page counts (the start screen, the tutorial's and the HUD's buttons)
    this.lastDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0 ? 'touch' : 'kbm';
    addEventListener('touchstart', () => this.setDevice('touch'), { capture: true, passive: true });
    this.padAt = 0;
    this.toast = null;      // main.js sets this to ui.toast
    this.onDevice = null;

    // ---- mouse state
    this.mouse = { left: false, right: false };
    this.armed = false;     // a press that began on the canvas is in progress
    this.gesture = null;    // { x, y, t, dist, chorded } for the press in progress
    this.suppressClick = false;
    this.looking = false;   // the mouse is turning the camera right now
    this.lastRightAt = 0;
    this._overlay = false;   // a DOM overlay (Settings, the letter, the start screen, the map, the voice question) is open
    this.hudFocus = false;   // the pad is moving the focus round the HUD's buttons (hold View: gamepad.js)
    this.wheelOpen = false;  // an emote or tool wheel is up: the sticks pick in it (hud-wheel.js)
    this.promptOpen = false;
    let lx = 0, ly = 0;

    // ---- gamepad
    this.pad = new GamepadReader(this);

    // ---- keyboard
    addEventListener('keydown', e => {
      if (this.typing || (e.target && FIELD.test(e.target.tagName || ''))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // browser shortcuts (and macOS never sends keyup while Cmd is held)
      // in a menu (Settings, the letter, the map) Tab moves the focus and Space presses the focused button, as on any page
      const menuKey = this.overlayOpen && (e.code === 'Tab' || e.code === 'Space');
      if (!menuKey && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.setDevice('kbm');
      if (!e.repeat) this.pressed.push(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => this.reset());
    addEventListener('focus', () => { this.pad.prime = true; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    addEventListener('pagehide', () => this.reset());

    // ---- mouse
    // `buttons` on every pointer/mouse event is the truth about which buttons are down; each event just brings us up to date.
    const sync = (buttons, x, y, now) => {
      if (!this.armed) buttons = 0;
      const left = !!(buttons & 1), right = !!(buttons & 2), m = this.mouse;
      if ((left || right) && !this.gesture) this.gesture = { x, y, t: now, dist: 0, chorded: false };
      const g = this.gesture;
      if (g) {
        if (right) g.chorded = true; // a right press is never a click
        g.dist = Math.max(g.dist, Math.hypot(x - g.x, y - g.y));
      }
      m.left = left; m.right = right;
      if (right) this.lastRightAt = now;
      if (!left && !right && g) {
        // everything is up: was it a click?
        if (!g.chorded && g.dist < CLICK_PX && now - g.t < CLICK_MS) this.clicks.push({ x: g.x, y: g.y, button: 0 });
        this.suppressClick = g.dist >= CLICK_PX || g.chorded;
        this.gesture = null; this.armed = false;
      }
      const looking = right || (left && !!this.gesture && this.gesture.dist >= DRAG_PX);
      if (looking !== this.looking) {
        this.looking = looking;
        document.body.classList.toggle('cam-drag', looking);
      }
    };

    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0 && e.button !== 2) return;
      this.setDevice('kbm');
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.over = true;
      if (this.overlayOpen) return;
      if (!this.armed) { this.armed = true; this.suppressClick = false; lx = e.clientX; ly = e.clientY; }
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable (fine) */ }
      sync(e.buttons, e.clientX, e.clientY, performance.now());
    });
    // Moves are listened to on the window: with pointer capture they still arrive after the mouse leaves the canvas.
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      if (e.target === canvas) { this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.over = true; this.setDevice('kbm'); }
      if (!this.armed) return;
      sync(e.buttons, e.clientX, e.clientY, performance.now()); // a chorded second button arrives as a move with new `buttons`
      if (this.looking) {
        this.lookX += e.clientX - lx; this.lookY += e.clientY - ly;
        this.lastLookAt = performance.now();
      }
      lx = e.clientX; ly = e.clientY;
    });
    const upTo = e => { if (e.pointerType !== 'touch' && this.armed) sync(e.buttons, e.clientX, e.clientY, performance.now()); };
    addEventListener('pointerup', upTo);
    addEventListener('pointercancel', e => { if (e.pointerType !== 'touch') this.reset(); });
    // mouse events fire for every button (pointer events only for the first down and the last up), so they catch chords reliably
    addEventListener('mousedown', e => { if (this.armed) sync(e.buttons, e.clientX, e.clientY, performance.now()); });
    addEventListener('mouseup', e => { if (this.armed) sync(e.buttons, e.clientX, e.clientY, performance.now()); });
    canvas.addEventListener('lostpointercapture', e => { if (e.pointerType !== 'touch' && this.armed && !e.buttons) sync(0, e.clientX, e.clientY, performance.now()); });
    canvas.addEventListener('pointerleave', () => { this.pointer.over = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // a right-drag that ends outside the canvas must not pop the browser menu
    addEventListener('contextmenu', e => { if (this.armed || performance.now() - this.lastRightAt < 500) e.preventDefault(); });
    // a drag that ended on the canvas fires `click`: keep it away from click handlers (intro skip)
    canvas.addEventListener('click', e => { if (this.suppressClick) { this.suppressClick = false; e.stopImmediatePropagation(); } }, true);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.setDevice('kbm'); this.zoom += Math.sign(e.deltaY); }, { passive: false });

    // ---- touch: left half = joystick, right half = look, and a quick still tap there jumps (hud3: no jump button; onTap, set by
    // hud-layout.js, decides. A tap is short and still: under TAP_MS and TAP_PX from where it went down. A drag that started as a
    // tap is a look, and a look's release never jumps. A tap on a HUD button never reaches the canvas.)
    const TAP_MS = 200, TAP_PX = 10;
    canvas.addEventListener('touchstart', e => {
      this.setDevice('touch');
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.5 && !this.stick.active) {
          Object.assign(this.stick, { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 });
          this.showJoy(t.clientX, t.clientY, 0, 0);
        } else if (!this.lookTouch) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now(), far: false };
        } else if (!this.pinch) { // (camera-view) a second finger beside the look finger: a pinch zooms (as the wheel), it doesn't look
          const l = this.lookTouch; l.far = true;
          this.pinch = { id: t.identifier, x: t.clientX, y: t.clientY, d: Math.hypot(t.clientX - l.x, t.clientY - l.y) };
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (this.stick.active && t.identifier === this.stick.id) {
          let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const m = Math.hypot(dx, dy), max = 55;
          if (m > max) { dx *= max / m; dy *= max / m; }
          this.stick.x = dx / max; this.stick.y = -dy / max;
          this.showJoy(this.stick.ox, this.stick.oy, dx, dy);
        } else if (this.pinch && t.identifier === this.pinch.id) {
          this.pinch.x = t.clientX; this.pinch.y = t.clientY;
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          if (!this.pinch) { this.lookX += (t.clientX - this.lookTouch.x) * 1.4; this.lookY += (t.clientY - this.lookTouch.y) * 1.4; }
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
          if (Math.hypot(t.clientX - this.lookTouch.x0, t.clientY - this.lookTouch.y0) >= TAP_PX) this.lookTouch.far = true;
          this.lastLookAt = performance.now();
        }
      }
      if (this.pinch && this.lookTouch) { // spreading the two fingers 30 px is one wheel step in, pinching them one step out
        const P = this.pinch, d = Math.hypot(P.x - this.lookTouch.x, P.y - this.lookTouch.y);
        this.zoom += (P.d - d) / 30; P.d = d;
      }
      e.preventDefault();
    }, { passive: false });
    const tend = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.active = false; this.stick.x = this.stick.y = 0; this.stick.id = null; this.hideJoy(); }
        if (this.pinch && (t.identifier === this.pinch.id || (this.lookTouch && t.identifier === this.lookTouch.id))) this.pinch = null;
        if (this.lookTouch && t.identifier === this.lookTouch.id) {
          const l = this.lookTouch; this.lookTouch = null;
          if (e.type === 'touchend' && !l.far && performance.now() - l.t0 < TAP_MS && Math.hypot(t.clientX - l.x0, t.clientY - l.y0) < TAP_PX) this.onTap?.(t.clientX, t.clientY);
        }
      }
    };
    canvas.addEventListener('touchend', tend);
    canvas.addEventListener('touchcancel', tend);

    // ---- which overlays are open (they own the mouse and the pad while they are)
    const watch = () => {
      const open = OVERLAYS.some(q => { const el = document.querySelector(q); return el && !el.hidden; });
      const prompt = document.querySelector('#prompt');
      this.promptOpen = !!prompt && !prompt.hidden;
      // one menu straight into another (the log off card into Settings): a pad player gets the new one's main button
      if (open && open === this._overlay) { const root = this.menuRoot(); if (root !== this._menuWas) { this._menuWas = root; if (this.lastDevice === 'pad' && root && root.id !== 'start') setTimeout(() => this.focusEl(this.primary(root, this.focusables(root))), 30); } return; }
      if (open === this._overlay) return;
      this._overlay = open;
      this._menuWas = open ? this.menuRoot() : null;
      if (open && this.hudFocus) this.setHudFocus(false); // a menu opening takes over from the HUD focus
      if (open) {
        this.reset();
        // a pad player gets the panel's main button focused so A works straight away (the start screen keeps its name field)
        if (this.lastDevice === 'pad') { const root = this.menuRoot(); if (root && root.id !== 'start') setTimeout(() => this.focusEl(this.primary(root, this.focusables(root))), 30); }
      }
    };
    const mo = new MutationObserver(watch);
    for (const q of [...OVERLAYS, '#prompt']) { const el = document.querySelector(q); if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] }); }
    watch();
  }

  // ------------------------------------------------------------------ state

  // a menu or the HUD focus owns the pad and the mouse buttons (features read this)
  // block: the first-time tutorial's click-through holds everything but its own card (tutorial.js sets it, false on try-it steps)
  get overlayOpen() { return this._overlay || this.hudFocus || !!this.block; }
  get typing() { return this._typing; }
  set typing(v) { this._typing = v; if (v) this.reset(); } // focusing the chat ends any drag / walk

  // Let go of everything: mouse buttons, keys, the pad (window blur, tab switch, an overlay opening, chat focus).
  reset() {
    this.armed = false; this.gesture = null;
    this.mouse.left = this.mouse.right = false;
    if (this.looking) { this.looking = false; document.body.classList.remove('cam-drag'); }
    this.down.clear();
    this.pad.release();
    this.stick.active = false; this.stick.x = this.stick.y = 0; this.stick.id = null; this.lookTouch = null; this.pinch = null; this.hideJoy();
  }

  // The HUD focus (a pad player holds View): the D-pad and the stick walk the focus round the HUD's buttons, A or X presses,
  // B or View again (or Start) leave. The player stands still meanwhile (overlayOpen is true).
  setHudFocus(on) {
    on = !!on && !this._overlay;
    if (on === this.hudFocus) return;
    this.hudFocus = on;
    document.body.classList.toggle('hud-focus', on);
    this.onHudFocus?.(on);
    if (on) {
      this.reset();
      const hud = document.querySelector('#hud');
      const list = hud ? this.focusables(hud) : [];
      setTimeout(() => this.focusEl(this.primary(hud, list)), 0);
    } else {
      const a = document.activeElement;
      if (a && a.closest?.('#hud')) a.blur();
    }
  }

  setDevice(d) {
    if (d === 'pad') this.padAt = performance.now();
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    document.body.classList.toggle('using-pad', d === 'pad');
    this.onDevice?.(d);
  }
  get dragging() { return this.looking; }
  // the mouse is walking you: right and left held together
  get mouseWalk() { return this.mouse.left && this.mouse.right && this.armed && !this.overlayOpen; }
  glyph(word) { return this.lastDevice === 'pad' ? this.pad.glyph(word) : word; }
  rumble(strong = 0.5, weak = 0.5, ms = 150) {
    if (this.lastDevice === 'pad' || performance.now() - this.padAt < 20000) this.pad.rumble(strong, weak, ms);
  }

  // called by the gamepad: press or release a key as if the keyboard did it
  padKey(code, isDown) {
    if (isDown) { if (!this.down.has(code)) this.pressed.push(code); this.down.add(code); }
    else this.down.delete(code);
  }

  showJoy(x, y, dx, dy) {
    if (!this.joy) return;
    this.joy.style.display = 'block';
    this.joy.style.left = x + 'px'; this.joy.style.top = y + 'px';
    this.joy.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  hideJoy() { if (this.joy) this.joy.style.display = 'none'; }

  // Movement intent: x = right, y = forward, each -1..1 (analog on a stick)
  move() {
    if (this.typing || this.overlayOpen) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.anyDown(MOVE_KEYS.fwd)) y += 1;
    if (this.anyDown(MOVE_KEYS.back)) y -= 1;
    if (this.anyDown(MOVE_KEYS.right)) x += 1;
    if (this.anyDown(MOVE_KEYS.left)) x -= 1;
    if (this.stick.active) { x += this.stick.x; y += this.stick.y; }
    if (this.mouseWalk) y += 1;
    x += this.pad.moveX; y += this.pad.moveY;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
  get running() {
    if (this.typing) return false;
    return this.anyDown(RUN_KEYS) || Math.hypot(this.stick.x, this.stick.y) > 0.92 || this.pad.run;
  }

  anyDown(codes) { for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i])) return true; return false; }
  update(dt, now) { this.pad.poll(dt); }
  takeClicks() { const c = this.clicks; if (!c.length) return c; this.clicks = []; return c; }
  takePressed() { const p = this.pressed; if (!p.length) return p; this.pressed = []; return p; }
  // Camera turn since last call in mouse pixels (the pad's stick is converted per frame, it never piles up), wheel steps,
  // and `cycle` when the pad asked for the next camera distance.
  takeLook() {
    const l = { x: this.lookX + this.pad.lookX, y: this.lookY + this.pad.lookY, zoom: this.zoom, cycle: this.zoomCycle };
    this.lookX = this.lookY = this.zoom = 0; this.zoomCycle = false;
    this.pad.lookX = this.pad.lookY = 0;
    return l;
  }
  static get ZOOM_STOPS() { return ZOOM_STOPS; }

  // ------------------------------------------------------------------ menus driven by a pad (plain DOM)

  menuRoot() {
    if (this.hudFocus && !this._overlay) return document.querySelector('#hud');
    if (this.block && !this._overlay) { const t = document.querySelector('#tutorial'); if (t && !t.hidden) return t; } // tutorial.js
    for (const q of ['#help', '#letter', '#start', '#logoff', '#voice-ask']) { const el = document.querySelector(q); if (el && !el.hidden) return el; }
    return null;
  }
  focusables(root) {
    const out = [];
    for (const el of root.querySelectorAll('button, input, select, textarea, a[href], summary, [role="radio"], [tabindex]:not([tabindex="-1"])')) {
      if (el.disabled || el.hidden || el.type === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (root.id === 'hud' && (getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"], .fish-panel, #chat-log'))) continue; // the HUD hides things by style
      out.push(el);
    }
    return out;
  }
  primary(root, list) {
    if (root && root.id === 'hud') return list.find(e => e.id === 'btn-act') || list.find(e => e.id === 'minimap-open') || list[0];
    return list.find(e => e.matches('.btn.primary')) || list[0];
  }
  focusEl(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  menuMove(dir) {
    if (this.menuHook?.(dir)) return; // a menu with its own rows (settings.js) moves the focus itself
    const root = this.menuRoot();
    if (!root) return;
    const list = this.focusables(root);
    if (!list.length) return;
    const cur = document.activeElement;
    if (!list.includes(cur)) return this.focusEl(this.primary(root, list));
    if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      if (dir === 'left') cur.stepDown(); else cur.stepUp();
      cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      if (along < 3) continue;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (across > along * 3 + 30) continue; // mostly sideways: not "that way"
      const score = along + across * 2.4;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    // a row of swatches ends: carry on into the next row (the list is in reading order)
    if (!best && (dir === 'left' || dir === 'right')) best = list[list.indexOf(cur) + (dir === 'right' ? 1 : -1)];
    if (best) this.focusEl(best);
  }
  menuPress() {
    const root = this.menuRoot();
    if (!root) return;
    const list = this.focusables(root);
    let el = document.activeElement;
    if (!list.includes(el)) el = this.primary(root, list);
    if (!el) return;
    if (el.matches('input:not([type="range"], [type="checkbox"], [type="radio"], [type="button"], [type="submit"]), textarea')) return; // typing needs a keyboard
    el.click();
  }
  menuBack() {
    if (this.hudFocus && !this._overlay) { this.setHudFocus(false); return; }
    const root = this.menuRoot();
    if (root && root.id !== 'start') { this.padKey('Escape', true); this.padKey('Escape', false); } // main.js closes the panel on Escape
  }
  menuStart() {
    if (this.hudFocus && !this._overlay) { this.setHudFocus(false); this.padKey('KeyH', true); this.padKey('KeyH', false); return; }
    const root = this.menuRoot();
    if (!root) return;
    if (root.id === 'start') {
      const name = document.querySelector('#name-input'), go = document.querySelector('#go');
      if (name && name.value.trim() && go) go.click(); else name?.focus();
    } else if (root.id === 'help') { this.padKey('KeyH', true); this.padKey('KeyH', false); }
    else if (root.id === 'voice-ask' || root.id === 'tutorial') root.querySelector('.btn.primary')?.click();
    else if (root.id === 'logoff') root.querySelector('.lo-stay')?.click(); // Start again: stay
    else document.querySelector('#letter-close')?.click();
  }
  // a pad's Y in a menu: the log off card's Settings
  menuY() {
    const root = this.menuRoot();
    if (root?.id === 'logoff') root.querySelector('.lo-set')?.click();
  }
}
