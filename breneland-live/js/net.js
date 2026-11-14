// Lobby connection: presence, positions, chat, emotes, and a shared clock so every
// visitor's NPCs are in step.
import { Human, avatarLook } from './human.js';
import { ANIM_CODES, HELD_CODES, PINNED_ANIMS, emoteTime } from './codes.js';
import { groundHeight } from './terrain.js';
import { angleLerp, wrapAngle } from './util.js';

export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.ws = null;
    this.offset = 0;          // server clock - local clock (ms)
    this.bestRtt = Infinity;
    this.status = 'offline';
    this.sid = null;
    this.lastSent = 0;
    this.lastState = '';
    this.retry = 0;
    this.profile = null;
    this.getPos = null;
    this.listeners = {}; // net.on(type, fn) listeners, alongside the main handlers
  }

  // Features subscribe to any server message type: net.on('swing', m => ...). Returns an unsubscribe function.
  on(type, fn) {
    (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    return () => { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); };
  }

  serverNow() { return Date.now() + this.offset; }

  connect(profile, getPos) {
    this.profile = profile;
    this.getPos = getPos;
    this.open();
  }

  open() {
    if (!this.profile) return; // not joined yet (still on the start screen)
    if (this.ws && this.ws.readyState <= 1) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new WebSocket(`${proto}//${location.host}/ws`); } catch { this.scheduleRetry(); return; }
    this.ws = ws;
    ws.binaryType = 'arraybuffer'; // voice frames (voice.js)
    this.setStatus('connecting');
    ws.onopen = () => {
      this.retry = 0;
      const p = this.getPos ? this.getPos() : { x: 0, y: 0, z: 0, r: 0 };
      this.send({ t: 'hello', id: this.profile.id, name: this.profile.name, color: this.profile.color, hat: this.profile.hat, skin: this.profile.skin, voice: this.profile.voice, look: this.profile.look || {}, ...p, ...(this.helloExtra ? this.helloExtra() : {}) });
      for (let i = 0; i < 4; i++) setTimeout(() => this.ping(), i * 700);
    };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') { this.onBinary?.(e.data); return; } // voice frames (voice.js sets onBinary)
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') {
        const rtt = Date.now() - m.c;
        if (rtt < this.bestRtt * 1.5 || rtt < 150) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = m.now + rtt / 2 - Date.now();
        }
        return;
      }
      if (m.t === 'welcome') { this.sid = m.you; this.offset = m.now - Date.now(); this.setStatus('online'); }
      // (clock-lag: the owner moved Breneland's clock; take it at once, then let fresh pings refine it)
      if (m.t === 'clock') { this.offset = m.now - Date.now(); this.bestRtt = Infinity; for (let i = 0; i < 3; i++) setTimeout(() => this.ping(), 300 + i * 700); }
      this.h[m.t]?.(m);
      const ls = this.listeners[m.t];
      if (ls) for (const fn of [...ls]) { try { fn(m); } catch (err) { console.error('[net] listener for', m.t, err); } }
    };
    ws.onclose = () => { this.setStatus('offline'); this.h.disconnected?.(); this.scheduleRetry(); };
    ws.onerror = () => {};
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.ping(), 20000);
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    const wait = Math.min(15000, 1000 * Math.pow(1.7, this.retry++));
    this.retryTimer = setTimeout(() => this.open(), wait);
  }

  setStatus(s) { this.status = s; this.h.status?.(s); }
  ping() { this.send({ t: 'ping', c: Date.now() }); }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  // A voice frame. Dropped (false) when the socket is backed up, so a slow link loses a syllable instead of falling seconds behind.
  sendBinary(buf) { const ws = this.ws; if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 12000) return false; ws.send(buf); return true; }

  // Position updates at up to 10 Hz, and only when something changed.
  sendState(x, y, z, r, a, nowMs, h = 0) {
    if (nowMs - this.lastSent < 100) return;
    r = wrapAngle(r); // (your facing winds on past +-pi as you run round; the server took -10..10 only, so a wound one froze for everyone else)
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)},${r.toFixed(2)},${a},${h}`;
    if (key === this.lastState && nowMs - this.lastSent < 2000) return;
    this.lastSent = nowMs; this.lastState = key;
    this.send({ t: 's', x, y, z, r, a, h });
  }
  chat(text) { this.send({ t: 'chat', text }); }
  emote(e, to) { this.send({ t: 'emote', e, to }); }
  updateProfile(p) { this.profile = p; this.send({ t: 'profile', name: p.name, color: p.color, hat: p.hat, skin: p.skin, voice: p.voice, look: p.look || {} }); }
}

// Other people in the lobby.
export class Remotes {
  constructor(scene, ui) {
    this.scene = scene;
    this.ui = ui;
    this.map = new Map();
  }

  build(p) {
    return new Human(avatarLook({ color: p.color, hat: p.hat, skin: p.skin, look: p.look }));
  }

  add(p) {
    this.remove(p.sid);
    const ch = this.build(p);
    ch.root.position.set(p.x, p.y, p.z);
    ch.root.rotation.y = p.r;
    this.scene.add(ch.root);
    const r = {
      sid: p.sid, name: p.name, color: p.color, hat: p.hat, skin: p.skin, voice: p.voice, look: p.look || {}, ch,
      ext: { ...(p.ext || {}) }, // per-player extras features publish through the server (fish counts and so on)
      buf: [{ t: performance.now(), x: p.x, y: p.y, z: p.z, r: p.r, a: p.a, h: p.h || 0 }],
      speed: 0, emote: null, emoteUntil: 0,
    };
    r.tag = this.ui.nameTag(ch.root, p.name, p.color);
    if (r.ext.tut) r.tag.node.classList.add('tutoring'); // the "Tutorial" badge beside the name (lib/tutorial.js, style.css)
    this.map.set(p.sid, r);
    return r;
  }

  remove(sid) {
    const r = this.map.get(sid);
    if (!r) return;
    this.scene.remove(r.ch.root);
    r.ch.dispose?.(); // free the GPU geometry: people come and go
    r.tag.remove();
    this.map.delete(sid);
  }

  clear() { for (const sid of [...this.map.keys()]) this.remove(sid); }

  profile(m) {
    const r = this.map.get(m.sid);
    if (!r) return;
    const last = r.buf[r.buf.length - 1];
    this.remove(m.sid);
    this.add({ sid: m.sid, name: m.name, color: m.color, hat: m.hat, skin: m.skin, voice: m.voice, look: m.look, ext: r.ext, x: last.x, y: last.y, z: last.z, r: last.r, a: last.a, h: last.h });
  }

  snap(m) {
    const arrive = performance.now();
    for (const [sid, x, y, z, rr, a, h] of m.ps) {
      const r = this.map.get(sid);
      if (!r) continue;
      r.buf.push({ t: arrive, x, y, z, r: rr, a, h: h || 0 });
      if (r.buf.length > 20) r.buf.shift();
    }
  }

  // server says a remote player's extras changed (see server ext hook)
  ext(m) {
    const r = this.map.get(m.sid);
    if (r) { Object.assign(r.ext, m.ext); if ('tut' in m.ext) r.tag.node.classList.toggle('tutoring', !!m.ext.tut); }
  }

  emote(sid, e, now) {
    const r = this.map.get(sid);
    if (!r) return null;
    r.emote = e; r.emoteUntil = now + emoteTime(e); r.emoteAt = now; // the same windows as the player's own (codes.js)
    return r;
  }

  update(dt, now) {
    const renderT = performance.now() - 160;
    for (const r of this.map.values()) {
      const b = r.buf;
      let a = b[0], c = b[b.length - 1];
      for (let i = b.length - 1; i > 0; i--) {
        if (b[i - 1].t <= renderT) { a = b[i - 1]; c = b[i]; break; }
      }
      const span = c.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
      const x = a.x + (c.x - a.x) * k, z = a.z + (c.z - a.z) * k;
      const root = r.ch.root;
      const moved = Math.hypot(x - root.position.x, z - root.position.z);
      r.speed += ((dt > 0 ? moved / dt : 0) - r.speed) * Math.min(1, dt * 6);
      const y = a.y + (c.y - a.y) * k;
      root.position.set(x, Math.max(groundHeight(x, z, y), y), z); // (y: someone in the D&D back room is not lifted onto the loft over it)
      root.rotation.y = angleLerp(root.rotation.y, angleLerp(a.r, c.r, k), Math.min(1, dt * 10));
      let anim = ANIM_CODES[c.a] || 'idle';
      if (anim === 'walk' || anim === 'run' || anim === 'idle') anim = null;
      if (r.emote && r.speed >= 0.3) r.emote = null; // moving ends it, like the player's own (sit and the dances don't end by themselves)
      if (r.emote && anim && anim !== r.emote && now > r.emoteAt + 0.5) r.emote = null; // their anim says something newer, like a dance from the wheel (the codes run 160 ms behind, so not at once)
      if (r.emote && now < r.emoteUntil) anim = r.emote;
      r.ch.emoteEnd = anim && anim === r.emote ? r.emoteUntil : undefined; // the pose settles back by the window's end
      r.ch.setHeld?.(HELD_CODES[c.h] || null);
      r.ch.update(dt, now, PINNED_ANIMS.has(anim) ? 0 : r.speed, anim);
    }
  }

  nearest(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const r of this.map.values()) {
      const p = r.ch.root.position;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
}

