// The dogs the same on every screen. dogs-brain.js is a fixed-step simulation on the shared clock (tick k is time k / TPS),
// and every client steps the same ticks with the same inputs: the schedule and events, each carrying its tick.
//   att    a visitor's whereabouts near the dogs (spot, facing, pace, camera, bonds), { gone } when they leave
//   poke   somebody said hi to a dog          treat  a dog treat landed (lib/fishing.js relays the throw)
//   toy    a toy left someone's hand          pick   the thrower picked their toy up again
//   catch  someone caught another's toy       walk   take or let go of a dog (dogs-walk.js)
// Your own events happen on your screen at the next tick and go to the server (lib/dogs.js), which numbers them (q) and
// relays them. An event for a tick we've already simulated rolls back to a snapshot and simulates forward again. A late
// joiner gets the newest snapshot the clients upload, plus the events after it. Speech and sounds come out once each,
// even across rollbacks. Only the idle head turn and the brows are local.
import { DogBrain, restState, fixState, TPS, dogWalkable } from './dogs-brain.js';
import { mollyFriend, mollyCan } from './molly-brain.js';   // (Molly, the third dog)
import { treatMesh } from './dogs.js';
import { groundHeight } from './terrain.js';
import { hash01, wrapAngle, angleLerp } from './util.js';

const SNAP_EVERY = 10;        // ticks between rollback snapshots (0.5 s)
const SNAP_KEEP = 20;         // ten seconds of them
const KEEP_EVENTS = 15 * TPS; // events are kept this long after their tick
const UPLOAD_EVERY = 6 * TPS; // a snapshot for late joiners this often...
const UPLOAD_AGE = 30;        // ...1.5 s old (anything that was going to arrive late has arrived)
const FX_SAME = 30;           // the same line or sound within 1.5 s of shared time is the same one (a rollback replays it)
const ACCEPT_SNAP = 30 * TPS; // a snapshot this far behind us is still worth catching up from
const FAR = 60 * TPS;         // an event a minute away from our time came from a clock that is off: nobody can agree on it, so nobody applies it
const DOGS = ['nala', 'dax', 'molly'];
const r3 = v => Math.round(v * 1000) / 1000;
const r1 = v => Math.round(v * 10) / 10;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const qv = e => (e.q == null ? 9e15 : e.q);
const order = (a, b) => a.kx - b.kx || qv(a) - qv(b) || (String(a.sid) < String(b.sid) ? -1 : String(a.sid) > String(b.sid) ? 1 : 0) || (a.c || 0) - (b.c || 0);

export class DogSync {
  constructor(sys) {
    this.sys = sys;
    this.brain = sys.brain || (sys.brain = new DogBrain(sys));
    this.brain.fx = (...a) => this.fx(...a);
    this.brain.sync = this;
    this.net = null;
    this.events = [];        // sorted by order(): { e, k (the tick it was given), kx (the tick we apply it at), q, sid, c, ...fields }
    this.snaps = [];         // [{ k, S }], ascending
    this.simK = null;        // the last tick simulated
    this.dirtyK = Infinity;  // an event arrived for this tick, already simulated: roll back before the next step
    this.cid = 0;            // our own event counter
    this.qFloor = 0;         // the highest event number among events we have forgotten
    this.fxLog = [];
    this.fxFloor = -Infinity;
    this.lastUpload = -Infinity; this.resetK = -Infinity;
    this.stats = { rollbacks: 0, resims: 0, resets: 0, syncs: 0, sent: 0, got: 0, late: 0 };
    this.att = { on: false, x: 0, z: 0, band: -1, cx: NaN, cz: NaN, bn: -1, bd: -1, k: -1e12 };
    this.pPrev = null; this.pSpeed = 0; this.pStill = 0;
    this.cos = { nala: { look: 0, worry: 0 }, dax: { look: 0, worry: 0 }, molly: { look: 0, worry: 0 } };
    this.treatMeshes = new Map(); this.treatHide = new Map();
    this.alpha = 1;
  }

  // main.js: the lobby connection
  attach(net) {
    this.net = net;
    net.on('dogev', m => this.onEvent(m));
    net.on('dogsync', m => this.onSync(m));
    net.on('welcome', () => setTimeout(() => this.requestSync(), 0));
    net.on('clock', () => setTimeout(() => this.resync(), 0));   // (clock-lag: the clock jumped, start over like a fresh arrival)
    if (net.status === 'online') this.requestSync();
  }
  get sid() { return this.net && this.net.sid != null ? this.net.sid : 'me'; }
  get S() { return this.brain.S; }
  requestSync() { if (this.net && this.net.status === 'online') { this.net.send({ t: 'dogsync' }); this.wantSync = true; } }
  // (tests and a long gap: start over from rest and ask the server for the others' state)
  resync() { this.reset(this.simK == null ? 0 : this.simK + 1); this.requestSync(); }

  // ---------------------------------------------------------------- events
  insert(ev) {
    this.events.push(ev);
    this.events.sort(order);
  }
  // our own event: it happens on our screen at the next tick, and the server relays it to everyone
  own(e, fields) {
    // (just after a catch-up simK is seconds behind the clock, and an event stamped there would land at different ticks on
    // different screens, so it goes at the clock's tick instead)
    const k = this.simK == null ? 0 : this.kNow != null && this.kNow - this.simK > 2 * TPS ? this.kNow : this.simK + 1;
    const ev = { e, k, kx: k, q: null, sid: this.sid, c: ++this.cid, ...fields };
    this.insert(ev);
    if (this.net && this.net.status === 'online') { this.net.send({ t: 'dogev', e, k, c: ev.c, ...fields }); this.stats.sent++; }
    return ev;
  }
  onEvent(m) {
    if (!m || typeof m.k !== 'number' || typeof m.e !== 'string') return;
    this.stats.got++;
    if (m.q != null && this.events.some(e => e.q === m.q)) return;   // (already have it: the catch-up and the live relay)
    if (this.net && m.sid === this.net.sid && m.c != null) {
      const mine = this.events.find(e => e.q == null && e.sid === m.sid && e.c === m.c);
      if (mine) {   // our own, back from the server with its number: only its place among the tick's others can change
        mine.q = m.q;
        this.events.sort(order);
        if (this.simK != null && mine.kx <= this.simK && this.events.some(e => e !== mine && e.kx === mine.kx)) this.dirty(mine.kx);
        return;
      }
    }
    if (this.simK != null && Math.abs(m.k - this.simK) > FAR) { this.stats.far = (this.stats.far || 0) + 1; return; }
    const ev = { ...m, kx: m.k };
    delete ev.t;
    this.place(ev);
    this.insert(ev);
    if (this.simK != null && ev.kx <= this.simK) this.dirty(ev.kx);
  }
  // an event for a tick we cannot roll back to any more happens at the next tick instead (we were away too long)
  place(ev) {
    if (this.simK == null) return;
    const first = this.snaps.length ? this.snaps[0].k : this.simK;
    if (ev.kx <= first) { ev.kx = this.simK + 1; this.stats.late++; }
  }
  dirty(k) { if (k < this.dirtyK) this.dirtyK = k; }

  apply(ev, k) {
    const B = this.brain, t = k / TPS;
    B.k = k; B.t = t;
    switch (ev.e) {
      case 'att':
        if (ev.gone) delete B.S.att[ev.sid];
        else B.S.att[ev.sid] = { sid: ev.sid, x: ev.x, z: ev.z, yaw: ev.yaw || 0, v: ev.v || 0, st: ev.st || 0, cx: ev.cx ?? null, cz: ev.cz ?? null, bn: ev.bn || 0, bd: ev.bd || 0, k, ...(ev.mf ? { mf: 1 } : {}) };   // (mf: a Whitney or a Shy..., Molly's friends)
        break;
      case 'poke': B.poke(ev, t); break;
      case 'treat': B.dropTreat({ id: this.treatId(ev), x: ev.x, z: ev.z, by: ev.by, sid: ev.sid }, t); break;
      case 'toy': B.throwToy(ev, t); break;
      case 'pick': B.pickToy(ev); break;
      case 'catch': B.catchToy(ev); break;   // (another visitor's frisbee caught)
      case 'walk': B.applyWalk(ev, t); break;   // (dogs-walk.js)
    }
  }
  treatId(ev) { return ev.c != null ? ev.sid + ':' + ev.c : 'q' + ev.q; }

  // ---------------------------------------------------------------- stepping
  reset(k) {
    this.brain.S = restState();
    this.simK = k - 1; this.snaps = [{ k: k - 1, S: restState() }]; this.dirtyK = Infinity;   // (an event for the first ticks can still roll back to here)
    this.fxFloor = k; this.resetK = k; this.stats.resets++;
    this.events = this.events.filter(e => e.k >= k - 60 * TPS);
    for (const e of this.events) if (e.kx < k) e.kx = k;
    this.events.sort(order);
  }
  rollback() {
    const k = this.dirtyK;
    this.dirtyK = Infinity;
    let snap = null;
    for (const s of this.snaps) if (s.k < k) snap = s;
    if (!snap) return;
    this.brain.S = structuredClone(snap.S);
    this.stats.resims += this.simK - snap.k; this.stats.rollbacks++;
    this.simK = snap.k;
    while (this.snaps.length && this.snaps[this.snaps.length - 1].k > snap.k) this.snaps.pop();
  }
  stepTo(kT) {
    const B = this.brain;
    let i = 0;
    while (this.simK < kT) {
      const k = this.simK + 1;
      while (i < this.events.length && this.events[i].kx < k) i++;
      for (let j = i; j < this.events.length && this.events[j].kx === k; j++) this.apply(this.events[j], k);
      B.tick(k);
      this.simK = k;
      if (k % SNAP_EVERY === 0) {
        this.snaps.push({ k, S: structuredClone(B.S) });
        if (this.snaps.length > SNAP_KEEP) this.snaps.shift();
      }
    }
    // forget what can never be replayed
    const old = this.simK - KEEP_EVENTS;
    while (this.events.length && this.events[0].kx < old) { const e = this.events.shift(); if (e.q != null && e.q > this.qFloor) this.qFloor = e.q; }
    if (this.fxLog.length > 80) this.fxLog = this.fxLog.filter(f => this.simK - f.k < 200);
  }

  // the late joiner's catch-up: the newest snapshot the server has, and the events after it
  onSync(m) {
    if (!this.wantSync) return;
    this.wantSync = false;
    const kNow = this.simK == null ? Math.ceil((this.net ? this.net.serverNow() : Date.now()) / 1000 * TPS) : this.simK;
    const evs = (m.evs || []).filter(e => e && typeof e.k === 'number' && typeof e.e === 'string' && Math.abs(e.k - kNow) <= FAR);
    const mine = this.events.filter(e => e.q == null && e.sid === this.sid);   // ours, not back from the server yet
    const snap = m.snap;
    let k0 = null;
    if (snap && snap.s && snap.k <= kNow + TPS && snap.k >= kNow - ACCEPT_SNAP) {
      this.brain.S = fixState(snap.s);   // (fills in anything an older tab's snapshot is missing, like Molly)
      k0 = snap.k;
      this.snaps = [{ k: k0, S: structuredClone(snap.s) }];
      this.events = evs.filter(e => e.q > (snap.hi || 0)).map(e => ({ ...e, kx: Math.max(e.k, k0 + 1) }));
    } else if (evs.length) {
      let lo = Infinity; for (const e of evs) lo = Math.min(lo, e.k);
      k0 = Math.max(lo - 1, kNow - 60 * TPS);
      this.brain.S = restState();
      this.snaps = [{ k: k0, S: restState() }];
      this.events = evs.map(e => ({ ...e, kx: Math.max(e.k, k0 + 1) }));
    }
    if (k0 === null) return;
    for (const e of this.events) delete e.t;
    for (const e of mine) { e.kx = Math.max(e.kx, k0 + 1); this.events.push(e); }
    this.events.sort(order);
    this.simK = k0; this.dirtyK = Infinity;
    this.fxFloor = kNow - TPS;   // what happened before you came is not said again
    this.stats.syncs++;
  }

  maybeUpload() {
    const net = this.net;
    if (!net || net.status !== 'online' || (typeof document !== 'undefined' && document.hidden)) return;
    if (this.simK - this.lastUpload < UPLOAD_EVERY || this.simK - this.resetK < 3 * TPS) return;
    const target = this.simK - UPLOAD_AGE;
    let snap = null;
    for (const s of this.snaps) if (s.k <= target) snap = s;
    if (!snap) return;
    let hi = this.qFloor;
    for (const e of this.events) {
      if (e.kx > snap.k) break;
      if (e.q == null) { if (e.sid === this.sid) return; continue; }   // (ours, not numbered yet: next time)
      if (e.q > hi) hi = e.q;
    }
    net.send({ t: 'dogsnap', k: snap.k, hi, s: snap.S });
    this.lastUpload = this.simK;
  }

  // ---------------------------------------------------------------- what the simulation says and plays, once each
  fx(kind, a, b, c, d, e) {
    const k = this.brain.k;
    if (k < this.fxFloor) return;
    let key;
    if (kind === 'say') key = 'say|' + a + '|' + b;
    else if (kind === 'sound') key = 'snd|' + a + '|' + Math.round(b) + '|' + Math.round(d);
    else if (kind === 'ate') key = 'ate|' + a + '|' + b + '|' + Math.round(d) + '|' + Math.round(e);
    else return;
    for (const f of this.fxLog) if (f.key === key && Math.abs(f.k - k) <= FX_SAME) return;
    this.fxLog.push({ k, key });
    if (this.onFx) this.onFx(kind, a, b, c, d, e);   // (paws.js reports my treat being eaten, once, like the fx)
    const sys = this.sys;
    if (kind === 'say') { const dog = sys.dog(a); if (dog && dog.body) sys.say(dog, b, c, d, e); }   // (e: the voice's mood hint, e.g. 'calm' for a sleepy one)
    else if (kind === 'sound') sys.audio?.play(a, b, c, d, e);
    else if (kind === 'ate' && b != null && String(b) === String(this.sid)) this.brain.addBond(a, c);   // your treat: you are a better friend
  }

  // ---------------------------------------------------------------- you (sent as 'att' while you are near the dogs)
  attend(dt, P) {
    if (P && this.pPrev && dt > 0) {
      const v = Math.hypot(P.x - this.pPrev.x, P.z - this.pPrev.z) / dt;
      this.pSpeed += (Math.min(v, 12) - this.pSpeed) * Math.min(1, dt * 6);
    }
    if (P) { this.pPrev = this.pPrev || { x: 0, z: 0 }; this.pPrev.x = P.x; this.pPrev.z = P.z; } else this.pPrev = null;
    this.pStill = this.pSpeed < 0.3 ? this.pStill + dt : 0;
    const a = this.att;
    let near = false;
    const mf = mollyFriend(this.net && this.net.profile && this.net.profile.name);   // (Molly comes over to a Whitney or a Shy..., so they count from further off)
    if (P) for (const id of DOGS) { const o = this.S.dogs[id].out; if (o && Math.hypot(P.x - o.x, P.z - o.z) < (id === 'molly' && mf ? 30 : a.on ? 20 : 18)) near = true; }
    if (!near) { if (a.on) { a.on = false; this.own('att', { gone: 1 }); } return; }
    const k = this.simK + 1, B = this.brain, cam = this.sys.cam;
    const band = this.pSpeed < 0.3 ? 0 : this.pSpeed < 1.7 ? 1 : this.pSpeed < 4.5 ? 2 : 3;
    const bn = r3(B.bond.nala), bd = r3(B.bond.dax);
    const camMoved = cam ? !Number.isFinite(a.cx) || Math.hypot(cam.x - a.cx, cam.z - a.cz) > 2.5 : Number.isFinite(a.cx);
    const stride = this.walking() ? 0.5 : 1;   // (walking a dog: every half metre, so it follows your footsteps closely)
    const changed = !a.on || Math.hypot(P.x - a.x, P.z - a.z) > stride || band !== a.band || camMoved || bn !== a.bn || bd !== a.bd;
    if (!((changed && k - a.k >= 5) || k - a.k >= 30)) return;
    const yaw = this.sys.playerYaw || 0;
    const f = { x: r3(P.x), z: r3(P.z), yaw: r3(wrapAngle(yaw)), v: r1(this.pSpeed), st: r1(this.pStill), bn, bd };
    if (mf) f.mf = 1;   // (the server stamps everyone else's from their name, the same rule)
    if (cam) { f.cx = Math.round(cam.x * 100) / 100; f.cz = Math.round(cam.z * 100) / 100; }
    this.own('att', f);
    Object.assign(a, { on: true, x: P.x, z: P.z, band, cx: cam ? cam.x : NaN, cz: cam ? cam.z : NaN, bn, bd, k });
  }

  // ---------------------------------------------------------------- what the rest of the game calls
  // You said hi to a dog (main.js -> npcs.poke).
  poke(id) {
    const B = this.brain, bf = r3(B.bond[id] || 0);
    B.addBond(id, id === 'nala' ? 0.05 : 0.1);
    this.own('poke', { dog: id, bn: r3(B.bond.nala), bd: r3(B.bond.dax), bf });
  }
  // A dog treat landed (fishing.js; m = the server's relay with its tick and number, or nothing offline / in a test).
  // Returns whether a dog will go for it (fishing.js then lets the dogs draw the biscuit).
  treat(x, z, by, hideFor = 0, m = null, now = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const ok = this.brain.wantsTreat(x, z);
    let ev;
    if (m && m.q != null) {
      ev = this.events.find(e => e.q === m.q);
      if (!ev && this.simK != null && typeof m.k === 'number' && Math.abs(m.k - this.simK) > FAR) return ok;
      if (!ev) { ev = { e: 'treat', k: typeof m.k === 'number' ? m.k : (this.simK ?? 0) + 1, q: m.q, sid: m.sid, x, z, by }; ev.kx = ev.k; this.place(ev); this.insert(ev); if (this.simK != null && ev.kx <= this.simK) this.dirty(ev.kx); }
    } else ev = this.own('treat', { x: r3(x), z: r3(z), by: String(by || '').slice(0, 24) });
    if (ok && hideFor > 0) this.treatHide.set(this.treatId(ev), now + hideFor);
    return ok;
  }
  // Your toy left your hand (dog-toys.js). Returns whether the dogs may chase it (only a throw from the yard).
  throwToy(kind, x, y, z, vx, vy, vz, cv = 0) {
    this.own('toy', { kind, x: r3(x), y: r3(y), z: r3(z), vx: r3(vx), vy: r3(vy), vz: r3(vz), ...(cv ? { cv: r3(cv) } : {}) });   // (cv: a frisbee's curve)
    return dogWalkable(x, z) || mollyCan(this.brain, x, z, 16);   // (or Molly is near, outside the fence)
  }
  pickToy() { this.own('pick', {}); }
  catchToy(from) { this.own('catch', { from: String(from) }); }   // (take another visitor's thrown toy)
  // Take dog `id` for a walk (on) or let it go (dog-walk.js). A fresh att goes out next frame so the dog knows where you are.
  walk(id, on, x, z, name = '') {
    if (on && this.att.on) { this.att.k = -1e12; }   // (a fresh att next frame)
    this.own('walk', { dog: id, on: on ? 1 : 0, x: r3(x), z: r3(z), name: String(name || '').slice(0, 24) });   // (the server puts its own name on it for everyone else)
  }
  // Who walks dog `id` right now: { sid, name, t0 } from the simulation (the same on every screen), or null.
  walkerOf(id) { const w = this.S.dogs[id]?.walk; return w && w.ph === 'walk' ? { sid: w.sid, name: w.name, t0: w.t0 } : null; }
  // Is dog `id` walking with you? / is any dog?
  mine(id) { const w = this.S.dogs[id]?.walk; return !!w && w.ph === 'walk' && String(w.sid) === this.myKey; }
  walking() { for (const id of DOGS) if (this.mine(id)) return true; return false; }
  get myKey() { return String(this.sid); }
  pending(e) { return this.events.some(v => v.e === e && v.sid === this.sid && v.kx > this.simK); }

  // ---------------------------------------------------------------- per frame (npcs.update)
  // Steps the simulation to shared time t and fills d._frame = { d, s, r } for each dog: r is the simulation's
  // result at t (between the two ticks round it), s the schedule's state at t.
  frame(dt, t, now, P) {
    const kT = Math.ceil(t * TPS - 1e-7);
    if (this.simK == null) { this.reset(kT); }
    else if (kT < this.simK - 2 * TPS) this.reset(kT);                    // the clock went back (tests): start over
    else if (kT > this.simK + 60 * TPS) { this.reset(kT); this.requestSync(); }   // away for a minute: catch up from the others
    if (this.dirtyK <= this.simK) this.rollback();
    this.kNow = kT;
    this.attend(dt, P);
    this.stepTo(kT);
    this.maybeUpload();
    const sys = this.sys, S = this.S;
    const a = this.alpha = clamp(t * TPS - (this.simK - 1), 0, 1);
    for (const id of DOGS) {
      const d = sys.dog(id); if (!d) continue;
      const s = sys.stateOf(d, t);
      if (s.hidden) { d._frame = null; continue; }
      const b = S.dogs[id], cur = b.out, prev = b.prev || cur;
      let r;
      if (!cur) r = { x: s.x, z: s.z, yaw: s.yaw, speed: s.speed, anim: s.anim, at: null };
      else {
        const src = a < 0.5 ? prev : cur, srcT = (a < 0.5 ? this.simK - 1 : this.simK) / TPS;
        r = { x: prev.x + (cur.x - prev.x) * a, z: prev.z + (cur.z - prev.z) * a, yaw: angleLerp(prev.yaw, cur.yaw, a),
          speed: prev.speed + (cur.speed - prev.speed) * a, anim: src.anim, at: src.at == null ? null : src.at + (t - srcT) };
        if (cur.y != null || prev.y != null) r.y = (prev.y || 0) + ((cur.y || 0) - (prev.y || 0)) * a;   // (Molly on the cart's seat)
        if (src.gog) r.gog = 1;
      }
      d._frame = { d, s, r };
      // the head and the brows: the dog's own interest (shared), else a glance at you when you are near (local, cosmetic)
      const c = this.cos[id], body = d.body;
      let lookT = cur && cur.lx != null ? { x: cur.lx, z: cur.lz } : null;
      const dozing = r.anim === 'sleep' || r.anim === 'sleepside' || r.anim === 'loaf' || r.anim === 'wake';   // (asleep, or getting up: no glance)
      if (!lookT && !dozing && P && Math.hypot(P.x - r.x, P.z - r.z) < 8) lookT = P;
      let lt = 0;
      if (lookT && r.speed < 2.5) lt = clamp(wrapAngle(faceTo(r.x, r.z, lookT.x, lookT.z) - body.root.rotation.y), -1.1, 1.1);
      c.look += (lt - c.look) * Math.min(1, dt * 5);
      body.lookYaw = c.look;
      c.worry += ((cur ? cur.worry : 0) - c.worry) * Math.min(1, dt * 4);
      body.worry = c.worry;
    }
    this.drawTreats(now);
  }

  drawTreats(now) {
    const seen = new Set();
    for (const tr of this.S.treats) {
      if (tr.gone) continue;
      seen.add(tr.id);
      let m = this.treatMeshes.get(tr.id);
      if (!m) {
        m = treatMesh();
        m.rotation.y = hash01('tr', Math.round(tr.x * 10), Math.round(tr.z * 10)) * 6.28;
        this.sys.group.add(m);
        this.treatMeshes.set(tr.id, m);
      }
      m.position.set(tr.x, groundHeight(tr.x, tr.z) + 0.05 + Math.abs(Math.sin(now * 4)) * 0.02, tr.z);
      const hide = this.treatHide.get(tr.id) || 0;
      m.visible = now >= hide;
      m.userData.hideLeft = Math.max(0, hide - now);
      m.scale.setScalar(tr.fade < 1 ? Math.max(0.01, tr.fade) * 1.15 : 1.15);
    }
    for (const [id, m] of this.treatMeshes) if (!seen.has(id)) { m.parent?.remove(m); this.treatMeshes.delete(id); this.treatHide.delete(id); }
  }
  // (integ-treat reads the biscuits on the ground through brain.treats)
  treatViews() { return [...this.treatMeshes.values()].map(m => ({ gone: false, mesh: m, hideLeft: m.userData.hideLeft || 0 })); }
}
