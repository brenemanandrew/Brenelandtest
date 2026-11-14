// The camera inside a walk-in building, shared by all of them so the Lovecraft house and the ranch house use one toggle, one
// remembered choice and one camera. First person (the game store's: eyes 0.12 m in front of the head, the look turns the head, you
// walk the way you look, your body hidden on your screen) or the room view (a three-quarter camera up in a corner of the room
// you're in, looking down at you. Rooms are zones with hysteresis, each with camera spots, and a cut keeps the old way of walking
// while the same input is held: the control hold). Switch with the small round button under the emote smiley (`#hud > .lc-view`:
// an eye in first person, a house in the room view), F, or the pad's L3. Remembered in `breneland.lovecraftView` (first person by
// default).
//
//   const iv = indoorView(ctx);          // one per page (ctx.indoorView)
//   iv.register({ id, inside(x, z), camInside?(c), rooms, walls, zoneHas?(r, x, y, z, depth), keepOut?(cam, dt, fresh), busy?(), camOK?([x, z, y], px, pz), stayIn?(x, z) })
//     rooms: [{ id, minX, maxX, minZ, maxZ, y, cams: [[x, z, y], ...], stair? }]; walls: [{ minX, maxX, minZ, maxZ, y0, y1 }]
//     (2D boxes, for the room view's line of sight); keepOut: keeps the follow camera out of the walls just outside.
// Every change of camera here is a CUT, never a swing: a blend through the doorway flew the camera through the front wall. The
// frame you cross the threshold the camera is at your eyes (or in the room's corner), and the frame you leave it's the follow
// camera behind you, snapped, outside the walls. A change needs you DOOR_PAD m from where the last one happened (no cutting back
// and forth while you stand in the doorway). In the room view a shot that loses sight of you past a wall cuts at once (to the room
// you're stepping into when you're in its doorway, else to another corner of yours), a shot you walk right under holds MIN_SHOT s,
// and the corner camera turns after you gently (its aim eased, never a whip pan). Every cut snaps it.
//
// camera-view (Andrew 2026-11-07: "first person or normal view toggle"): the toggle (the button, F, the pad's L3) now switches
// between FIRST PERSON and the NORMAL view: the game's own follow camera, as outside (drag to turn it, the wheel or a pinch to
// zoom), kept inside the walls, under the ceiling and over the floor (keepIn: pulled in short of them; scenery in the way fades,
// people never do: camera-fade.js). The locked room view is no longer one of the toggle's states (it was where you got stuck);
// setView('room') still gives it (tests, pictures). A remembered 'room' comes back as the normal view. Sitting or lying in our
// house has its own fitted camera (house-rest.js) whatever the view.
import * as THREE from 'three';
import { el, loadCss } from './util.js';

const VIEW_KEY = 'lovecraftView';
const ICON = {
  fp: '<svg viewBox="0 0 24 24"><path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" fill="#fff8ec" stroke="#2b2340" stroke-width="2.2"/><circle cx="12" cy="12" r="3.6" fill="#2b2340"/></svg>',
  room: '<svg viewBox="0 0 24 24"><path d="M3 9l9-6 9 6v11H3z" fill="#ffd34d" stroke="#2b2340" stroke-width="2.2" stroke-linejoin="round"/><rect x="9.5" y="13" width="5" height="7" fill="#2b2340"/></svg>',
  // the normal view: you, seen from behind (the follow camera)
  normal: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="#ffd34d" stroke="#2b2340" stroke-width="2.2"/><path d="M4.5 21c0-5 3.4-8 7.5-8s7.5 3 7.5 8z" fill="#ffd34d" stroke="#2b2340" stroke-width="2.2" stroke-linejoin="round"/></svg>',
};
const WORD = { fp: 'First person', normal: 'Normal view', room: 'Room view' };
// keepIn's margins: a camera stays this far from a wall, under the ceiling, over the floor (m)
export const KEEP = { wall: 0.2, ceil: 0.22, floor: 0.25, min: 0.3 };
const WALK_UP = -1.15, WALK_DOWN = 1.15, EYE_FWD = 0.12;
const ZONE_IN = 0.35, HOLD_ANGLE = 35 * Math.PI / 180, HOLD_STEADY = 2.5, HOLD_BLEND = 1.0;
const DOOR_PAD = 0.3, NEAR_R = 1.1, NEAR_T = 0.6, MIN_SHOT = 0.8, AIM_EASE = 7, OVERHEAD = 1.2; // the doorway's hysteresis; a shot you're under; the corner camera's aim

export function indoorView(ctx) {
  if (ctx.indoorView) return ctx.indoorView;
  const { player, ui, audio, store, input } = ctx;
  loadCss('/css/lovecraft.css'); // the button's look
  const buildings = [];
  let view = store.get(VIEW_KEY, 'fp') === 'fp' ? 'fp' : 'normal'; // (a remembered 'room' is the normal view now)
  const walk = { k: 0, yaw: 0, pitch: 0.08, eyeY: 0, was: false, lx: 0, lz: 0, was2: false };
  const room = { id: null, pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true };
  const wEye = new THREE.Vector3(), wAhead = new THREE.Vector3(), wHead = new THREE.Vector3();
  let hidRoot = false, active = null, last = null, flip = null; // the building you are in (and the last one); where the last cut in or out happened
  const hideMe = on => { const r = player.character?.root; if (!r) return; if (on && r.visible) { r.visible = false; hidRoot = true; } else if (!on && hidRoot) { r.visible = true; hidRoot = false; } };
  const defaultZoneHas = (r, x, y, z, depth = 0) => x > r.minX + depth && x < r.maxX - depth && z > r.minZ + depth && z < r.maxZ - depth && Math.abs(y - r.y) < 1.2;
  const zoneHas = (b, r, x, y, z, depth) => (b.zoneHas || defaultZoneHas)(r, x, y, z, depth);
  const shot = { zone: null, cam: null, lost: 0, cuts: 0, out: 0 };
  // a straight line from the camera spot to your chest misses every wall of your floor (and the building may rule a spot out for
  // now with camOK(spot, your x, z): the Lovecraft house's open front door stands between some spots and you)
  const sees = (b, c, x, y, z) => {
    if (b.camOK && !b.camOK(c, x, z)) return false;
    for (const w of b.walls) {
      if (y + 1 < w.y0 || y + 1 > w.y1) continue;
      let t0 = 0, t1 = 1; const dx = x - c[0], dz = z - c[1];
      let hit = true;
      for (const [o, d, mn, mx] of [[c[0], dx, w.minX, w.maxX], [c[1], dz, w.minZ, w.maxZ]]) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { hit = false; break; } continue; }
        let a = (mn - o) / d, bb = (mx - o) / d; if (a > bb) [a, bb] = [bb, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, bb); if (t0 > t1) { hit = false; break; }
      }
      if (hit) return false;
    }
    return true;
  };
  // the farthest spot that sees you, and of those, one that will still see you where you're walking to (0.6 s or a metre on). A spot
  // you're about to walk out of sight of is a second cut a moment later (past the open front door three cuts came in four frames)
  function pickCam(b, r, p) {
    let best = null, bd = -1;
    const v = player.vel, vl = v ? Math.hypot(v.x, v.y) : 0, ah = vl > 0.01 ? Math.min(0.6, 1 / vl) : 0, ax = p.x + (v ? v.x * ah : 0), az = p.z + (v ? v.y * ah : 0); // no further ahead than a metre
    for (const c of r.cams) { const d = Math.hypot(c[0] - p.x, c[1] - p.z); const ok = r.stair || sees(b, c, p.x, p.y, p.z); const score = d + (ok ? 100 : 0) + (ok && (r.stair || sees(b, c, ax, p.y, az)) ? 50 : 0); if (score > bd) { bd = score; best = c; } }
    return best;
  }
  // which zone you're in, with the hysteresis (a new zone only once you're well into it). Cuts are counted for the tests
  function zoneStep(b, p, dt) {
    const cur = shot.zone;
    if (cur && zoneHas(b, cur, p.x, p.y, p.z)) {
      shot.out = 0;
      const nx = b.rooms.find(r => r !== cur && zoneHas(b, r, p.x, p.y, p.z, ZONE_IN));
      // on the stairs you stay on them until you step off (the hall round their foot holds you too, or the shot flip-flopped between the
      // two every frame on the lower treads). From a room the stairs take over once you're well onto them
      if (!nx || cur.stair || !nx.stair) return false;
      shot.zone = nx; return true;
    }
    shot.out = (shot.out || 0) + dt;
    const nx = b.rooms.find(r => zoneHas(b, r, p.x, p.y, p.z, cur ? ZONE_IN : 0)) || (!cur || shot.out > 0.3 ? b.rooms.find(r => zoneHas(b, r, p.x, p.y, p.z)) : null);
    if (nx) shot.out = 0;
    if (nx && nx !== cur) { shot.zone = nx; return true; }
    return false;
  }
  // the normal view inside (and house-rest's fitted camera): the room a point is in, its ceiling over a spot, and how far a camera
  // may go from a point along a direction before a wall, the ceiling or the floor (minus the margins)
  const roomOf = (b, x, y, z) => b.rooms.find(r => !r.stair && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && Math.abs(y - r.y) < 2.2) || null;
  const ceilOf = (r, x, z) => (r.ceilAt ? r.ceilAt(x, z) : r.top ?? r.y + 2.6);
  function clampRay(b, tx, ty, tz, dx, dy, dz, len) {
    let t = len;
    for (const w of b.walls) { // a 3D slab test on each wall's box
      let t0 = 0, t1 = t, hit = true;
      for (const [o, d, mn, mx] of [[tx, dx, w.minX - KEEP.wall, w.maxX + KEEP.wall], [ty, dy, w.y0, w.y1], [tz, dz, w.minZ - KEEP.wall, w.maxZ + KEEP.wall]]) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { hit = false; break; } continue; }
        let a = (mn - o) / d, c = (mx - o) / d; if (a > c) { const q = a; a = c; c = q; }
        if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) { hit = false; break; }
      }
      if (hit && t0 < t) t = t0;
    }
    const r = roomOf(b, tx, ty, tz);
    if (r) { // the ceiling and the floor (marched: a vaulted ceiling slopes)
      for (let i = 1; i <= 12; i++) {
        const u = (t * i) / 12, x = tx + dx * u, y = ty + dy * u, z = tz + dz * u;
        if (y > ceilOf(r, x, z) - KEEP.ceil || y < r.y + KEEP.floor) { t = (t * (i - 1)) / 12; break; }
      }
    }
    if (!b.inside(tx + dx * t, tz + dz * t)) t *= 0.9; // (never out of the outer walls)
    return Math.max(0, t);
  }
  // the follow camera pulled in along its line to your head (player.js's target) short of the walls, the ceiling and the floor
  const _kt = new THREE.Vector3(), _kd = new THREE.Vector3();
  function keepIn(b, cam) {
    const p = player.pos;
    _kt.set(p.x, p.y + 1.6, p.z); _kd.subVectors(cam.position, _kt);
    const len = _kd.length(); if (len < 1e-4) return;
    _kd.multiplyScalar(1 / len);
    const t = clampRay(b, _kt.x, _kt.y, _kt.z, _kd.x, _kd.y, _kd.z, len);
    if (t < len) { cam.position.copy(_kt).addScaledVector(_kd, Math.max(KEEP.min, t)); cam.lookAt(player.cam.look.lengthSq() ? player.cam.look : _kt); }
  }
  const hold = { on: false, yaw: 0, dir: 0, t: 0 };
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // the movement basis after this frame's camera: a cut (or stepping in) with input held keeps the previous way until the input is
  // let go or changes clearly; after HOLD_STEADY s of steady input it blends over to the new camera's way in HOLD_BLEND s
  function basis(inp, liveYaw, prevYaw, cut, dt) {
    const mv = inp.move(), held = Math.hypot(mv.x, mv.y) > 0.3, dir = Math.atan2(mv.x, mv.y);
    if (cut && held) { if (!hold.on) { hold.on = true; hold.yaw = prevYaw; hold.dir = dir; hold.t = 0; } }
    if (hold.on && (!held || angDiff(dir, hold.dir) > HOLD_ANGLE)) hold.on = false;
    if (!hold.on) return liveYaw;
    hold.t += dt;
    if (hold.t < HOLD_STEADY) return hold.yaw;
    const k = Math.min(1, (hold.t - HOLD_STEADY) / HOLD_BLEND);
    const y = hold.yaw + Math.atan2(Math.sin(liveYaw - hold.yaw), Math.cos(liveYaw - hold.yaw)) * k;
    if (k >= 1) hold.on = false;
    return y;
  }
  const insideAny = (x, z) => buildings.find(b => b.inside(x, z)) || null;
  const followCam = player.updateCamera.bind(player);
  const keepOut = (cam, dt, fresh) => { for (const b of buildings) b.keepOut?.(cam, dt, fresh); };
  player.updateCamera = (dt, cam, inp, nowS) => {
    if (player.takeover) { hideMe(false); followCam(dt, cam, inp, nowS); return; } // a takeover places the camera itself (and shows you: first person had hidden your body, and sat at a Summit Slice table you were left invisible; mpfb-in-game, Andrew's v262)
    const p = player.pos;
    const jumped = Math.hypot(p.x - walk.lx, p.z - walk.lz) > 2;
    walk.lx = p.x; walk.lz = p.z;
    let inB = ctx.playing ? insideAny(p.x, p.z) : null;
    if (!inB && active && ctx.playing && active.stayIn?.(p.x, p.z)) inB = active; // a building's porch keeps you in its view until you step off
    // the doorway: in or out only DOOR_PAD m from where the last change happened (a jump, or not playing, at once)
    if (inB !== active && ctx.playing && !jumped && flip && Math.hypot(p.x - flip.x, p.z - flip.z) < DOOR_PAD) inB = active;
    if (inB !== active) flip = { x: p.x, z: p.z };
    const want = !!inB, leaving = !want && walk.was;
    if (inB && inB !== active) { shot.zone = null; shot.cam = null; walk.was2 = false; } // another building: its own zones
    active = inB; if (inB) last = inB;
    const b = active || last;
    if (want && ((!walk.was && walk.k <= 0) || jumped)) { walk.yaw = player.yaw; walk.pitch = 0.08; walk.eyeY = 0; room.snap = true; if (jumped) { shot.zone = null; shot.cam = null; } }
    walk.was = want;
    walk.k = want ? 1 : 0; // a cut in, a cut out (easing it took the camera through the wall)
    if (leaving && view !== 'normal') { // out of the door: the follow camera, snapped behind the way you face (not where the room's corner was), outside the walls
      const c = player.cam; c.yaw = player.yaw + Math.PI; c.pitch = 0.32; c.pos.set(0, 0, 0); c.look.set(0, 0, 0); hold.on = false;
    }
    if (walk.k <= 0 || !b) { hideMe(false); followCam(dt, cam, inp, nowS); keepOut(cam, dt, leaving); return; } // your body back the frame you're out
    let eye, ahead;
    if (view === 'normal' && want) { // the normal view: the follow camera as outside (no cut at the door), kept inside the walls
      hideMe(false);
      const hs = player.houseSolid; player.houseSolid = false; // (player.js pulls the camera to 1.2 m whenever it is in the house's box: for outside)
      try { followCam(dt, cam, inp, nowS); } finally { player.houseSolid = hs; }
      if (b.inside(p.x, p.z)) keepIn(b, cam); else keepOut(cam, dt, false); // (a porch: as outside)
      room.id = null; room.snap = true; shot.zone = null; shot.cam = null; walk.was2 = false; hold.on = false;
      return;
    }
    if (view === 'room' && (want || shot.zone)) {
      if (want) inp.takeLook(); // the room view: the look input isn't used, the room is the picture
      const prevYaw = player.cam.yaw;
      let cut = !walk.was2; // stepping in counts as a cut: the follow camera's way is held
      if (want && zoneStep(b, p, dt)) cut = true;
      const r = shot.zone;
      if (r) {
        if (cut || !shot.cam) { shot.cam = pickCam(b, r, p); shot.lost = 0; shot.age = 0; if (cut) shot.cuts++; room.snap = true; }
        else {
          // out of its sight (a wall between: at once) or right under it (for a moment): a new spot. Out of sight in a doorway, the room
          // you're stepping into (the camera never holds on a wall). Blind too: the spot inside the walls and you out of them, or the other
          // way round (the porch). On the stairs there's no "under it": their spots hang over either end, where you're stepping off anyway
          const c = shot.cam, near = !r.stair && Math.hypot(c[0] - p.x, c[1] - p.z) < NEAR_R, blind = (!r.stair && !sees(b, c, p.x, p.y, p.z)) || !!b.inside(c[0], c[1]) !== !!b.inside(p.x, p.z);
          shot.lost = near || blind ? shot.lost + dt : 0;
          shot.age = (shot.age || 0) + dt;
          if (blind || (shot.lost > NEAR_T && shot.age > MIN_SHOT)) { // a shot you're under holds at least MIN_SHOT s, not cut, cut, cut
            const nx = blind ? b.rooms.find(q => q !== r && zoneHas(b, q, p.x, p.y, p.z)) : null;
            if (nx) { shot.zone = nx; shot.cam = pickCam(b, nx, p); shot.cuts++; cut = true; room.snap = true; shot.age = 0; }
            else { const c2 = pickCam(b, r, p); if (c2 !== c) { shot.cam = c2; shot.cuts++; cut = true; room.snap = true; shot.age = 0; } }
            shot.lost = 0;
          }
        }
        room.id = shot.zone.id;
        room.pos.set(shot.cam[0], shot.cam[2], shot.cam[1]); // a spot is [x, z, y]
      }
      // the corner camera turns after you gently (eased), and snaps on a cut
      if (room.snap || !(dt > 0)) room.look.set(p.x, p.y + 1.0, p.z);
      else { const k = 1 - Math.exp(-dt * AIM_EASE); room.look.x += (p.x - room.look.x) * k; room.look.y += (p.y + 1.0 - room.look.y) * k; room.look.z += (p.z - room.look.z) * k; }
      room.snap = false;
      eye = room.pos; ahead = room.look;
      // a camera nearly over your head gives no steady "away from it", so the way you walk stays as it was while it is (the stairs'
      // spots hang over their ends, and coming down under one you veered into the wall)
      if (want) { const c = player.cam, over = !cut && Math.hypot(eye.x - p.x, eye.z - p.z) < OVERHEAD; c.yaw = over ? prevYaw : basis(inp, Math.atan2(eye.x - p.x, eye.z - p.z), prevYaw, cut, dt); c.pitch = 0.3; c.manualAt = nowS; }
      walk.was2 = want;
      hideMe(false);
    } else {
      if (want) {
        const look = inp.takeLook();
        if (look.x || look.y) { walk.yaw -= look.x * 0.0055; walk.pitch = Math.max(WALK_UP, Math.min(WALK_DOWN, walk.pitch + look.y * 0.004)); }
        const c = player.cam; c.yaw = walk.yaw + Math.PI; c.pitch = 0.3; c.manualAt = nowS;
        if (player.speed < 0.3) player.yaw = walk.yaw;
      }
      const head = player.character?.head;
      let hy = 1.45;
      if (head) { head.updateWorldMatrix(true, false); head.getWorldPosition(wHead); hy = wHead.y - p.y; }
      walk.eyeY = walk.eyeY ? walk.eyeY + (hy - walk.eyeY) * Math.min(1, dt * 3) : hy;
      const cp = Math.cos(walk.pitch);
      wEye.set(p.x + Math.sin(walk.yaw) * EYE_FWD, p.y + walk.eyeY, p.z + Math.cos(walk.yaw) * EYE_FWD);
      wAhead.set(wEye.x + Math.sin(walk.yaw) * cp, wEye.y - Math.sin(walk.pitch), wEye.z + Math.cos(walk.yaw) * cp);
      eye = wEye; ahead = wAhead;
      room.id = null; room.snap = true; shot.zone = null; shot.cam = null; walk.was2 = false; hold.on = false;
      hideMe(walk.k > 0.35);
    }
    followCam(dt, cam, inp, nowS); // the follow camera keeps its state behind you, for the cut out
    cam.position.copy(eye); cam.lookAt(ahead);
  };
  // the toggle, small, easy to see but easy to ignore: its icon is the CURRENT view (an eye for first person, a house for the room
  // view), its key cap F on a computer (L3 on a pad). hud-clear.js keeps the chat log clear of it, and it tucks away while the emote
  // fan is open (css/lovecraft.css)
  const btn = el('button', 'lc-view', '', { hidden: '', type: 'button', 'aria-label': 'First person' });
  const bIco = el('span', 'lc-ico'), bKey = el('span', 'lc-key');
  btn.append(bIco, bKey); ctx.hud.append(btn);
  let btnFor = null;
  function paintBtn() {
    const lay = ctx.hudLayout?.layout || 'pc', key = lay === 'pad' ? 'L3' : lay === 'phone' ? '' : 'F', sig = view + key;
    if (sig === btnFor) return; btnFor = sig;
    bIco.innerHTML = ICON[view]; // our own constant markup, never player text
    bKey.textContent = key;
    const word = WORD[view];
    btn.setAttribute('aria-label', word); btn.title = word + (key ? ` (${key} to switch)` : '');
    btn.dataset.view = view;
  }
  function setView(v, quiet) {
    view = v === 'room' ? 'room' : v === 'normal' ? 'normal' : 'fp';
    store.set(VIEW_KEY, view);
    if (view === 'fp') { walk.yaw = player.yaw; walk.pitch = 0.08; }
    room.snap = true; room.id = null; shot.zone = null; shot.cam = null; walk.was2 = false;
    paintBtn();
    if (!quiet) { audio.ui?.('blip'); ui.toast(view === 'room' ? 'Room view: the camera watches from the corner.' : view === 'normal' ? 'Normal view: drag to turn the camera.' : 'First person: drag to look around.', 2200); }
  }
  const other = () => (view === 'fp' ? 'normal' : 'fp'); // the toggle: first person <-> the normal view (the room view too goes to first person)
  btn.addEventListener('click', e => { e.preventDefault(); setView(other()); btn.blur(); });
  paintBtn();
  const inNow = () => !!ctx.playing && !!insideAny(player.pos.x, player.pos.z) && !player.takeover;
  // the pad's L3 (the camera distance outside) switches the view inside: input.takeLook().cycle, read before the camera does
  const takeLook = input.takeLook.bind(input);
  input.takeLook = () => { const l = takeLook(); if (l.cycle && inNow()) { l.cycle = false; setView(other()); } return l; };

  // is a building between two points (the camera and a name tag or balloon, ui.js)? One inside a walk-in building and the other not
  // (its outer walls), both inside on different floors (no stair between them), or a wall of its floor across the line.
  const storey = (b, x, y, z) => { for (const r of b.rooms) if (!r.stair && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && y > r.y - 0.4 && y < (r.top ?? r.y + 3) + 0.4) return r.y; return null; };
  function blocked(ax, ay, az, bx, by, bz) {
    for (const b of buildings) {
      const ia = !!b.inside(ax, az), ib = !!b.inside(bx, bz);
      if (ia !== ib) return true;
      if (!ia) continue;
      const sa = storey(b, ax, ay, az), sb = storey(b, bx, by, bz);
      if (sa !== null && sb !== null && Math.abs(sa - sb) > 1) return true;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      for (const w of b.walls) {
        let t0 = 0, t1 = 1;
        if (Math.abs(dx) < 1e-9) { if (ax < w.minX || ax > w.maxX) continue; } else { let p = (w.minX - ax) / dx, q = (w.maxX - ax) / dx; if (p > q) { const s = p; p = q; q = s; } if (p > t0) t0 = p; if (q < t1) t1 = q; if (t0 > t1) continue; }
        if (Math.abs(dz) < 1e-9) { if (az < w.minZ || az > w.maxZ) continue; } else { let p = (w.minZ - az) / dz, q = (w.maxZ - az) / dz; if (p > q) { const s = p; p = q; q = s; } if (p > t0) t0 = p; if (q < t1) t1 = q; if (t0 > t1) continue; }
        const y0 = ay + dy * t0, y1 = ay + dy * t1; // the line's heights where it crosses the wall's footprint: under its top, over its foot
        if (Math.max(y0, y1) > w.y0 && Math.min(y0, y1) < w.y1) return true;
      }
    }
    return false;
  }

  const iv = {
    register(b) { buildings.push(b); return b; },
    blocked,
    get view() { return view; },
    setView, toggle: (quiet = true) => setView(other(), quiet),
    get button() { return btn; },
    // (camera-view) for house-rest's fitted camera and the tests: the building at a spot, a room, its ceiling, how far a camera may go
    buildingAt: (x, z) => insideAny(x, z),
    roomOf: (b, x, y, z) => roomOf(b, x, y, z),
    ceilOf: (r, x, z) => ceilOf(r, x, z),
    clampRay: (b, tx, ty, tz, dx, dy, dz, len) => clampRay(b, tx, ty, tz, dx, dy, dz, len),
    get active() { return active; },
    // the button: shown inside any building while you play (a building may hide it while busy, the telescope), every frame
    update() {
      const b = ctx.playing ? insideAny(player.pos.x, player.pos.z) : null;
      const hide = !b || !!b.busy?.();
      if (hide !== btn.hidden) { btn.hidden = hide; ctx.hudLayout?.relayout?.(); }
      if (!btn.hidden) paintBtn();
    },
    onKey(code) { if (code === 'KeyF' && inNow()) { setView(other()); return true; } return false; },
    look(yaw, pitch = 0.08) { walk.yaw = yaw; walk.pitch = pitch; },
    walkFP(b) { return walk.k > 0 && view === 'fp' && (!b || b === (active || last)) ? { k: walk.k, yaw: walk.yaw, pitch: walk.pitch, eyeY: walk.eyeY, limits: { up: WALK_UP, down: WALK_DOWN }, hidden: hidRoot } : null; },
    roomCam(b) { return walk.k > 0 && view === 'room' && room.id && (!b || b === (active || last)) ? { k: walk.k, room: room.id, x: room.pos.x, y: room.pos.y, z: room.pos.z, cuts: shot.cuts, hold: hold.on, basis: player.cam.yaw } : null; },
    get room() { return room.id; },
    get cuts() { return shot.cuts; },
    get shot() { return shot.zone ? { zone: shot.zone.id, cam: shot.cam, cuts: shot.cuts, hold: hold.on } : null; },
    sees: (b, c, x, y, z) => sees(b, c, x, y, z),
    // a building forgets its zone (you left it, or something put you elsewhere)
    reset() { shot.zone = null; shot.cam = null; walk.was2 = false; hold.on = false; },
    // after a takeover that ends inside (the telescope): straight back to first person looking that way
    resume(yaw) { walk.yaw = yaw; walk.pitch = 0.08; walk.k = 1; room.snap = true; shot.zone = null; shot.cam = null; },
  };
  ctx.indoorView = iv;
  return iv;
}
