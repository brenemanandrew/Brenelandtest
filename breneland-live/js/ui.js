// DOM side of the game: floating labels and speech bubbles pinned to 3D objects,
// the HUD, the play prompt, the stats card, chat and toasts. All user text goes in
// through textContent.
import * as THREE from 'three';
import { initToastClear } from './toast-clear.js';

const $ = sel => document.querySelector(sel);
const v = new THREE.Vector3();
export const CHAT_QUIET_MS = 12000; // the chat log hides after 12 seconds
const EMOJI_ONLY = /^\p{Extended_Pictographic}️?$/u; // one emoji and nothing else: an emote's balloon
const TOAST_MAX = 3;                       // toasts on screen at once
const OCCLUDE_R = 40, OCCLUDE_EVERY = 6;   // tags and balloons nearer than this are checked for a wall in between, every 6th frame each

export class UI {
  constructor() {
    this.layer = $('#labels');
    this.bubbleLayer = $('#bubbles') || this.layer; // speech balloons draw above the HUD
    this.items = new Set();
    this.el = {
      hud: $('#hud'), place: $('#place'), online: $('#online'), hint: $('#hint'),
      prompt: $('#prompt'), stats: $('#stats'), chatLog: $('#chat-log'), chatForm: $('#chat-form'),
      chatInput: $('#chat-input'), chat: $('#chat'), toasts: $('#toasts'), fade: $('#fade'),
      title: $('#title-card'), titleSub: $('#title-sub'), skip: $('#skip'), act: $('#btn-act'),
    };
    this.placeName = '';
    this.chatTimer = 0;
    this.actWords = '';   // what the interact button would do right now ('' = nothing near)
    this.actKey = this.el.act?.querySelector('.act-key');
    this.actName = this.el.act?.querySelector('.act-name');
    this.toastClear = initToastClear(this.el.toasts);   // toasts step below a mini-game's bar in their band (toast-clear.js)
  }

  // ---------------------------------------------------------------- 3D-pinned DOM

  add(item, layer) {
    (layer || this.layer).appendChild(item.node);
    this.items.add(item);
    item.remove = () => { item.node.remove(); this.items.delete(item); };
    return item;
  }

  nameTag(obj, name, color) {
    const node = document.createElement('div');
    node.className = 'tag3d';
    node.textContent = name;
    node.style.setProperty('--c', color || '#fff');
    return this.add({ node, obj, dy: 2.25, max: 38, fade: 26, tag: true });
  }

  areaLabel(pos, text, cls) {
    const node = document.createElement('div');
    node.className = 'area3d ' + (cls || '');
    node.textContent = text;
    return this.add({ node, pos: pos.clone(), dy: 0, max: 95, fade: 70, min: 7 });
  }

  // Speech bubble over a character for `secs` seconds.
  say(obj, text, secs = 4, dy = 2.3, cls = '') {
    for (const it of this.items) if (it.bubbleFor === obj) it.remove();
    const node = document.createElement('div');
    // an emote's balloon holds one emoji, drawn big enough to read at game distance on a phone; chat text stays as it is
    node.className = 'bubble ' + cls + (EMOJI_ONLY.test(text) ? ' emoji' : '');
    node.textContent = text;
    const item = this.add({ node, obj, dy: dy + 0.35, max: 30, fade: 22, until: performance.now() + secs * 1000, bubbleFor: obj }, this.bubbleLayer);
    return item;
  }

  update(camera, w, h) {
    const now = performance.now();
    const items = this.items; // (iterated in place: deleting the current entry of a Set mid-loop is safe; no copy a frame)
    // a camera cut (into a house, a teleport): every tag's wall check is done again this frame, not over the next six
    const cp = camera.position, lc = this._camWas || (this._camWas = { x: cp.x, y: cp.y, z: cp.z });
    const cut = Math.abs(cp.x - lc.x) + Math.abs(cp.y - lc.y) + Math.abs(cp.z - lc.z) > 1.5;
    lc.x = cp.x; lc.y = cp.y; lc.z = cp.z;
    // 1. where everything projects (sx, sy = the bottom centre on screen, ss = its scale)
    for (const it of items) {
      if (it.until && now > it.until) { it.remove(); it.shown = false; continue; }
      const anchor = it.tag && it.obj ? it.obj.userData.tagAnchor : null;
      if (anchor && anchor.parent) {
        // name tags ride just above the head (or hat); ease the height so nods and hops do not jiggle the tag
        anchor.getWorldPosition(v);
        it.ty = it.ty === undefined ? v.y : it.ty + (v.y - it.ty) * 0.15;
        v.y = it.ty;
      } else if (it.obj) { it.obj.getWorldPosition(v); v.y += it.dy * (it.obj.scale?.y || 1); }
      else v.copy(it.pos);
      const dist = v.distanceTo(camera.position);
      // a name tag or balloon with a wall or a floor of a house between it and the camera stays hidden (no folk showing through a
      // floor or a front wall). Asked a few times a second per item, staggered (main.js sets `occluder`: indoor-view.js `blocked`).
      if (this.occluder && it.obj && dist < OCCLUDE_R) {
        const fresh = it._oc === undefined;
        if (fresh) it._oc = (this._ocN = (this._ocN || 0) + 1) % OCCLUDE_EVERY;   // (spread over the frames)
        if (fresh || cut || ++it._oc >= OCCLUDE_EVERY) { if (!fresh) it._oc = 0; const c = camera.position; it.occl = this.occluder(c.x, c.y, c.z, v.x, v.y, v.z); }
      } else it.occl = false;
      v.project(camera);
      // (ui.indoors: you and the camera are inside a building, game-store.js sets it. The places' labels outside stay out, or
      // they'd show through the walls)
      const hidden = v.z > 1 || dist > it.max || (it.min && dist < it.min) || !it.obj?.visible && it.obj || (this.indoors && it.pos) || it.occl;
      it.shown = !hidden;
      // (the DOM is written only when something changed: a style write each frame for every label makes the browser
      // recalculate styles every frame)
      if (hidden) { if (it._disp !== 'none') { it._disp = 'none'; it.node.style.display = 'none'; } continue; }
      if (it._disp !== '') { it._disp = ''; it.node.style.display = ''; }
      it.dist = dist;
      it.sx = (v.x * 0.5 + 0.5) * w; it.sy = (-v.y * 0.5 + 0.5) * h;
      it.ss = Math.max(0.55, Math.min(1.15, 14 / dist));
      if (!it.w) { it.w = it.node.offsetWidth; it.h = it.node.offsetHeight; } // measured once (the first frame it is in the DOM)
      // (dnd-room-ui) where a feature asks for it (the D&D back room: close up, the tags are big), a name tag cut by the screen's
      // edge or under a HUD piece is not drawn (half a name behind the Quests pill helps nobody). clearOf: boxes [l, t, r, b]
      if (it.tag && this.clearOf && it.w) {
        const hw = it.w * it.ss / 2, x0 = it.sx - hw, x1 = it.sx + hw, y0 = it.sy - it.h * it.ss, y1 = it.sy;
        let off = x0 < 0 || x1 > w || y0 < 0;
        for (const r of this.clearOf) if (!off && x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) off = true;
        if (off) { it.shown = false; if (it._disp !== 'none') { it._disp = 'none'; it.node.style.display = 'none'; } }
      }
    }
    // 2. bubbles and name tags never overlap: a bubble sits above its own character's tag, and one that would cover
    //    somebody else's tag (a dog barking right in front of the lens, your own name behind it) is lifted clear of it
    for (const it of items) {
      if (!it.bubbleFor || !it.shown) continue;
      const bw = it.w * it.ss / 2, tail = 10 * it.ss, gap = 4;
      // a balloon whose speaker is on screen stays on screen (a bark near the edge would run off it)
      if (it.sx >= 0 && it.sx <= w) it.sx = Math.min(w - bw - 6, Math.max(bw + 6, it.sx));
      for (const t of items) {
        if (!t.tag || !t.shown || !t.w) continue;
        const tw = t.w * t.ss / 2, tTop = t.sy - t.h * t.ss;
        if (it.sx + bw < t.sx - tw || it.sx - bw > t.sx + tw) continue;          // side by side: fine
        const limit = tTop - gap - tail;                                         // where the bubble's bottom must stay above
        if (t.obj === it.obj ? it.sy > limit : it.sy > limit && it.sy - it.h * it.ss < t.sy + gap) it.sy = limit;
      }
    }
    // 3. draw
    for (const it of items) {
      if (!it.shown) continue;
      const { sx: x, sy: y, ss: s, dist } = it;
      const xs = x.toFixed(1), ys = y.toFixed(1), ss = s.toFixed(3);
      if (xs !== it._x || ys !== it._y || ss !== it._s) {
        const tr = `translate(${xs}px, ${ys}px) translate(-50%, -100%)`;
        it.node.style.transform = tr + ` scale(${ss})`;
        if (xs !== it._x || ys !== it._y) it.node.style.setProperty('--t', tr);
        it._x = xs; it._y = ys; it._s = ss;
      }
      let o = dist > it.fade ? 1 - (dist - it.fade) / (it.max - it.fade) : 1;
      if (it.min) o = Math.min(o, Math.min(1, (dist - it.min) / 6));
      if (it.tag && it.obj && it.obj.userData.fadeK < 1) o *= it.obj.userData.fadeK; // the body is fading out of the camera's way (camera-fade.js)
      const os = Math.max(0, o).toFixed(2);
      if (os !== it._o) { it._o = os; it.node.style.opacity = os; }
      const zi = 1000 - Math.round(dist);
      if (zi !== it._z) { it._z = zi; it.node.style.zIndex = String(zi); }
    }
  }

  // ---------------------------------------------------------------- HUD

  setPlace(name) {
    if (name === this.placeName) return;
    this.placeName = name;
    const el = this.el.place;
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = name; el.style.opacity = '1'; }, 220);
  }

  setOnline(n, status) {
    this.el.online.querySelector('b').textContent = String(n);
    this.el.online.classList.toggle('online', status === 'online');
    this.el.online.title = status === 'online' ? 'People in Breneland right now' : 'Offline - trying to reconnect';
  }

  // The context hint. An "E  Do the thing" hint isn't drawn across the screen: the interact button lights up and wears the
  // words as a small label (setAct). #hint still carries the text for screen readers and the tests (class .act hides it from
  // sight). Other hints ("Space  Dive", "The swing is busy") still show as the pill.
  hint(text) {
    const h = this.el.hint;
    if (!text) { h.hidden = true; this.setAct(''); return; }
    const act = /^E\s{2}/.test(text);
    this.setAct(act ? text.replace(/^E\s+/, '') : '');
    text = this.glyphize(text);
    if (h.textContent !== text) h.textContent = text;
    if (h.classList.contains('act') !== act) h.classList.toggle('act', act);
    h.hidden = false;
  }
  setAct(words) {
    if (this.actDemo) words = this.actDemo; // the tutorial's interact step shows an example ("Say hi to Nala"; tutorial.js)
    if (words === this.actWords) return;
    this.actWords = words;
    if (this.actName) this.actName.textContent = words;
    this.el.act?.setAttribute('aria-label', words ? 'Interact: ' + words : 'Interact');
  }

  // "E  Say hi to Dax" -> "X  Say hi to Dax" when the player is on a controller (set by main.js: ui.glyphs = word -> label)
  glyphize(text) {
    return this.glyphs ? text.replace(/^(E|Space|Q|Esc|Tab|H|M)(?=\s{2})/, w => this.glyphs(w)) : text;
  }
  // the labels on the act button and the Play card follow the device too
  syncGlyphs() {
    if (!this.glyphs) return;
    const e = this.glyphs('E');
    if (this.actKey && this.actKey.textContent !== e) this.actKey.textContent = e;
    const k = this.el.prompt?.querySelector('#prompt-yes kbd');
    if (k && k.textContent !== e) k.textContent = e;
  }

  // A feature's help line: ui.addHelp(['E'], 'swap your pole at the Fish Shack'). The core controls are drawn in
  // Settings > Controls (settings-controls.js); these lines only fill its folded "More" list, keys named per device.
  addHelp(keys, text) {
    if (!this.moreHelp) this.moreHelp = [];
    if (!this.moreHelp.some(l => l[1] === text)) this.moreHelp.push([[...keys], text]);
  }

  showPrompt(area, onYes, onNo) {
    const p = this.el.prompt;
    p.className = 'panel prompt ' + (area.game?.theme || '');
    p.querySelector('.prompt-title').textContent = area.game.name;
    p.querySelector('.prompt-blurb').textContent = area.game.blurb || 'Want to play?';
    p.querySelector('#prompt-yes').onclick = onYes;
    p.querySelector('#prompt-no').onclick = onNo;
    p.hidden = false;
  }
  hidePrompt() { this.el.prompt.hidden = true; }
  get promptOpen() { return !this.el.prompt.hidden; }

  showStats(game, s) {
    const box = this.el.stats;
    box.className = 'panel stats ' + (game.theme || '');
    box.querySelector('.stats-game').textContent = game.name;
    const act = box.querySelector('.stats-active');
    act.replaceChildren();
    if (s.active) {
      const label = document.createElement('span');
      label.textContent = s.active.label;
      act.append(label);
      if (s.active.url) {
        const a = document.createElement('a');
        a.href = s.active.url; a.textContent = 'Resume';
        act.append(a);
      }
      act.hidden = false;
    } else act.hidden = true;
    const dl = box.querySelector('.stats-list');
    dl.replaceChildren();
    const rows = Object.entries(s.stats || {});
    if (s.launches) rows.push(['Visits', s.launches]);
    for (const [k, val] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = String(val);
      dl.append(dt, dd);
    }
    const foot = box.querySelector('.stats-foot');
    const when = s.lastLaunch ? 'Last played ' + ago(s.lastLaunch) : '';
    foot.textContent = when;
    box.hidden = false;
  }
  hideStats() { this.el.stats.hidden = true; }

  chatLine(name, color, text, sys = false) {
    const line = document.createElement('div');
    line.className = 'chat-line' + (sys ? ' sys' : '');
    if (name) {
      const b = document.createElement('b');
      b.textContent = name;
      b.style.setProperty('--c', color || '#ffd34d');
      line.append(b);
    }
    line.append(document.createTextNode(text));
    const log = this.el.chatLog;
    log.append(line);
    while (log.children.length > 30) log.firstChild.remove();
    this.wakeChat();
  }

  // The log shows while chat is happening and fades out after CHAT_QUIET_MS without a line (a system line counts);
  // the input strip stays. Called for every line and whenever the input gains or loses focus (main.js).
  wakeChat() {
    this.el.chat.classList.remove('quiet');
    clearTimeout(this.chatTimer);
    this.chatTimer = setTimeout(() => this.el.chat.classList.add('quiet'), CHAT_QUIET_MS);
  }

  toast(text, ms = 3200) {
    text = String(text);
    // while the first-time tutorial is up a toast waits, and the last few come after it in turn (so a tip doesn't land beside
    // its cards and vanish before you can act on it)
    if (document.body.classList.contains('tutorial-on')) {
      const q = this.heldToasts || (this.heldToasts = []);
      if (!q.some(h => h[0] === text)) q.push([text, ms]);
      if (!this.heldWait) this.heldWait = setInterval(() => {
        if (document.body.classList.contains('tutorial-on')) return;
        clearInterval(this.heldWait); this.heldWait = 0;
        q.splice(0).slice(-TOAST_MAX).forEach(([t, m], i) => setTimeout(() => this.toast(t, m), 400 + i * 700));
      }, 300);
      return;
    }
    // the same words already up: that toast stays on (a wiggle says it heard you) instead of a copy under it. At most TOAST_MAX
    // at once, the oldest leaving first
    for (const o of this.el.toasts.children) {
      if (o.textContent !== text || o.going) continue;
      clearTimeout(o.timer); o.timer = setTimeout(() => this.dropToast(o), ms);
      o.classList.remove('again'); void o.offsetWidth; o.classList.add('again');
      return;
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.el.toasts.append(t);
    t.timer = setTimeout(() => this.dropToast(t), ms);
    let live = 0;
    for (let i = this.el.toasts.children.length - 1; i >= 0; i--) { const o = this.el.toasts.children[i]; if (!o.going && ++live > TOAST_MAX) this.dropToast(o); }
  }
  dropToast(t) {
    if (t.going) return;
    t.going = true; clearTimeout(t.timer);
    t.style.opacity = '0'; setTimeout(() => t.remove(), 600);
  }

  fade(to, ms = 600) {
    const f = this.el.fade;
    f.style.transition = `opacity ${ms}ms`;
    f.style.opacity = String(to);
    return new Promise(r => setTimeout(r, ms));
  }

  titleCard(sub, show) {
    this.el.titleSub.textContent = sub || '';
    this.el.title.classList.toggle('show', !!show);
  }
}

export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400 * 2) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' days ago';
}
