// Beneath Angell Street: the phone's controls below, and the look assist. Loaded with maze-scene.js.
//
// The yard's stick (input.js) has no dead zone and tips into a sprint just past full walking speed, so a firm thumb sprints by
// accident, empties the breath and is heard by the ghoul four times as far off. Its look has no slop, so a resting thumb's wobble
// turns the view. Below, this takes the canvas's touches before input.js sees them (a capturing listener on the window, the yard
// is unchanged):
//   the left half    a floating stick where your thumb lands (shown by input.js's #joystick ring), a small dead zone, full walk well
//                    inside the ring, a thumb a little off straight walks straight (a forward cone), a run only with a clear push
//                    out past the ring (the ring turns amber), the stick following a thumb that slides on past that. The Run button
//                    still works
//   the right half   look, wherever it isn't a button: the yard's rate (1:1, linear, no smoothing, no acceleration), up and down a
//                    little slower as in the yard, kept within +-45 degrees, 3 px of slop for a resting thumb (and none of the drag
//                    lost once it moves). Settings > Controls has the speed (maze-settings.js)
//   a third finger   ignored (one stick, one look, and a second touch on a side already in use is ignored too)
// In first person a push past the straight-ahead cone toward a side turns you that way (`turn` -1..1, maze-scene.js times
// STEER.turn) and only strafes a little (move(base, strafeK)). The look thumb still turns freely. In third person the stick is
// camera-relative (the body turns to face the way you push and the camera follows behind, maze-scene.js).
// The look assist (Settings > Controls, off by default: a view that turns on its own felt like fighting the game): when on,
// walking forward with the look thumb off the glass for 1.5 s eases the view toward the way the corridor goes (round its bends,
// down the helix stair).
import { lookSpeed, lookAssist } from './maze-settings.js';

const R = 52;                 // px: the stick's ring (input.js's #joystick is 110 px across)
const DEAD = 0.12;            // of R: nothing under this (6 px)
const WALK_AT = 0.6;          // of R: full walking speed from here on (31 px: well inside the ring)
const CONE = 0.31;            // rad (18 degrees) either side of straight ahead (or back) walks straight: a thumb is not a ruler
const TURN_DEAD = 0.17;       // rad (10 degrees) either side of straight: no turn (the stick's steer in first person)
const RUN_IN = 1.3, RUN_OUT = 1.1; // of R: a run only with a clear push out past the ring, held until the thumb comes back to it
const FOLLOW = 1.6;           // of R: past this the stick's centre follows the thumb
export const LOOK = 0.0077;   // rad per CSS px at speed 1: the yard's touch look (input.js: 0.0055 x 1.4)
const V_K = 0.727;            // up and down: the yard's ratio (0.004 / 0.0055)
const SLOP = 3;               // px a resting thumb may wobble
const PITCH = [-0.78, 0.78];  // the touch look's limits (the controller's own are +-1.15)
const ASSIST = { quiet: 1.5, rate: 1.1, pitch: 0.08, pitchRate: 0.6, maxTurn: 1.9 }; // only when switched on in Settings

export function createMazeTouch(ctx, { me, maze, kit, CELL, phase }) {
  const { input, canvas } = ctx;
  const W = maze.W, H = maze.H;
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, run: false, k: 0, turn: 0 };
  const look = { id: null, x: 0, y: 0, sx: 0, sy: 0, live: false };
  let pendX = 0, pendY = 0, touched = false, idle = 0; // touched: the look thumb went down, moved or lifted since the last frame
  const out = { x: 0, y: 0 }, turn = { yaw: 0, pitch: 0 };
  const log = { starts: 0, ignored: 0, assist: 0, assistYaw: 0 };   // for the tests (assistYaw: the radians the assist turned you)
  const joy = input.joy;

  const showJoy = (dx, dy) => { input.showJoy(stick.ox, stick.oy, dx, dy); joy?.classList.toggle('mz-run-ring', stick.run); };
  function stickTo(t) {
    let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy, m = Math.hypot(dx, dy);
    if (m > R * FOLLOW) { const k = (m - R * FOLLOW) / m; stick.ox += dx * k; stick.oy += dy * k; dx = t.clientX - stick.ox; dy = t.clientY - stick.oy; m = Math.hypot(dx, dy); }
    const raw = m / R;
    stick.run = stick.run ? raw >= RUN_OUT : raw >= RUN_IN;
    const k = raw <= DEAD ? 0 : Math.min(1, (raw - DEAD) / (WALK_AT - DEAD));
    stick.k = k;
    // the forward (and back) cone: inside it straight on; outside, the rest of the quarter spread over the whole of it (no jump)
    const a = Math.atan2(dx, -dy), back = Math.abs(a) > Math.PI / 2, u = back ? Math.PI - Math.abs(a) : Math.abs(a);
    const v = u <= CONE ? 0 : (u - CONE) / (Math.PI / 2 - CONE) * Math.PI / 2, b = Math.sign(a) * (back ? Math.PI - v : v);
    stick.x = m > 0 ? Math.sin(b) * k : 0; stick.y = m > 0 ? Math.cos(b) * k : 0;
    stick.rx = m > 0 ? Math.sin(a) * k : 0; stick.ry = m > 0 ? Math.cos(a) * k : 0; // the way the thumb points, no cone: third person goes exactly there
    // the steer: how far toward a side past a small dead zone (TURN_DEAD, so a thumb a few degrees off doesn't turn you; a cone on
    // the turn as well as the strafe made small corrections impossible). Front half only (pulling back walks back), times the push
    const side = back ? 0 : Math.min(1, Math.max(0, (u - TURN_DEAD) / (Math.PI / 2 - TURN_DEAD)));
    stick.turn = m > 0 ? Math.sign(a) * Math.pow(side, 1.2) * k : 0;
    const c = Math.min(1, R / Math.max(m, 1e-6)); showJoy(dx * c, dy * c);
  }
  function endStick() { stick.id = null; stick.x = stick.y = stick.k = stick.turn = stick.rx = stick.ry = 0; stick.run = false; input.hideJoy(); joy?.classList.remove('mz-run-ring'); }
  function endLook() { look.id = null; look.live = false; touched = true; }

  const opt = { capture: true, passive: false };
  function onStart(e) {
    if (e.target !== canvas) return;      // a HUD button keeps its own touch
    e.preventDefault(); e.stopPropagation();
    input.setDevice('touch');
    for (const t of e.changedTouches) {
      log.starts++;
      if (t.clientX < innerWidth * 0.5) {
        if (stick.id !== null) { log.ignored++; continue; }
        stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.x = stick.y = stick.k = stick.turn = 0; stick.run = false; showJoy(0, 0);
      } else {
        if (look.id !== null) { log.ignored++; continue; }
        Object.assign(look, { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, live: false });
        touched = true;
      }
    }
  }
  function onMove(e) {
    if (e.target !== canvas) return;
    e.preventDefault(); e.stopPropagation();
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) stickTo(t);
      else if (t.identifier === look.id) {
        if (!look.live && Math.hypot(t.clientX - look.sx, t.clientY - look.sy) < SLOP) continue; // a resting thumb
        look.live = true;   // counted from where it went down, so none of the drag is lost to the slop
        pendX += t.clientX - look.x; pendY += (t.clientY - look.y) * V_K;
        look.x = t.clientX; look.y = t.clientY;
        touched = true;
      }
    }
  }
  function onEnd(e) {
    let mine = false;
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { endStick(); mine = true; }
      else if (t.identifier === look.id) { endLook(); mine = true; }
    }
    if (mine) e.stopPropagation();
  }
  addEventListener('touchstart', onStart, opt);
  addEventListener('touchmove', onMove, opt);
  addEventListener('touchend', onEnd, opt);
  addEventListener('touchcancel', onEnd, opt);
  // whatever input.js was holding when we came down is let go (its stick would walk you on its own otherwise)
  input.stick.active = false; input.stick.x = input.stick.y = 0; input.stick.id = null; input.lookTouch = null; input.hideJoy();

  const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const inRoom = (cx, cy) => maze.rooms.some(r => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1);
  const DIRS = [[0, -1, 1, Math.PI], [1, 0, 2, Math.PI / 2], [0, 1, 4, 0], [-1, 0, 8, -Math.PI / 2]]; // dx, dy, wall bit, the yaw that way
  // where the way on is, from here: a corridor cell (two ways out), the one ahead of you; the helix, round and down (or up)
  function wayOn() {
    if (me.inShaft) {
      const st = kit.stair, phi = Math.atan2(me.x - st.cx, me.z - st.cz);
      const dn = phi + Math.PI / 2 + 0.25, up = phi - Math.PI / 2 - 0.25;
      return Math.abs(angle(dn, me.yaw)) <= Math.abs(angle(up, me.yaw)) ? dn : up;
    }
    const cx = Math.floor(me.x / CELL), cy = Math.floor(me.z / CELL);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || inRoom(cx, cy)) return null;
    const c = maze.cells[cy * W + cx];
    let n = 0, best = null, bestCos = -2;
    for (const d of DIRS) {
      if (c & d[2]) continue;
      n++;
      const cs = Math.cos(d[3] - me.yaw);
      if (cs > bestCos) { bestCos = cs; best = d; }
    }
    if (n !== 2 || bestCos < -0.1) return null;  // a junction, a dead end, or turned round: your own choice
    const tx = (cx + best[0] + 0.5) * CELL, tz = (cy + best[1] + 0.5) * CELL;
    return Math.atan2(tx - me.x, tz - me.z);
  }

  return {
    log, stick, look,
    get active() { return stick.id !== null || look.id !== null; },
    get run() { return stick.run && !input.overlayOpen && !input.typing; },
    // the stick's steer, -1 (left) .. 1 (right): maze-scene.js turns first person by it
    get turn() { return input.overlayOpen || input.typing ? 0 : stick.turn; },
    // the walk: the keys, pad and input.js's own stick, plus this one (a reused object). strafeK: how much of the stick's sideways
    // push walks sideways (first person: a little, the rest turns you, see `turn`)
    move(base, strafeK = 1, raw = false) { // raw: the thumb's own way, no straight-ahead cone (third person)
      const off = input.overlayOpen || input.typing; // a menu or the chat open: the thumb on the stick waits, as input.move does
      let x = base.x + (off ? 0 : (raw ? stick.rx || 0 : stick.x) * strafeK), y = base.y + (off ? 0 : raw ? stick.ry || 0 : stick.y);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      out.x = x; out.y = y; return out;
    },
    // the look since the last frame, in radians to add (all of it at once, 1:1 like the yard, the speed from Settings)
    take(dt, held) {
      const ax = pendX, ay = pendY;
      pendX = pendY = 0;
      if (held || input.overlayOpen || input.typing) { pendX = pendY = 0; turn.yaw = turn.pitch = 0; return turn; }
      const s = LOOK * lookSpeed();
      turn.yaw = -ax * s;
      const p = me.pitch + ay * s;
      turn.pitch = Math.max(Math.min(me.pitch, PITCH[0]), Math.min(Math.max(me.pitch, PITCH[1]), p)) - me.pitch;
      return turn;
    },
    // the look assist (only if switched on): after the walk, before the camera (looked: the mouse, the pad or a touch turned the view
    // this frame). Never while the look thumb is down or for 1.5 s after it lifts
    assist(dt, mv, looked) {
      if (looked || touched || look.id !== null) idle = 0; else idle += dt;
      touched = false;
      if (!lookAssist() || idle < ASSIST.quiet) return;
      const ph = phase();
      if ((ph !== 'maze' && ph !== 'stair') || mv.y < 0.45 || Math.abs(mv.x) > 0.55 || me.speed < 0.7) return;
      const want = wayOn();
      if (want === null) return;
      const d = angle(want, me.yaw);
      if (Math.abs(d) > ASSIST.maxTurn) return;
      const k = Math.min(1, dt * ASSIST.rate * Math.min(1, me.speed / 2.5));
      me.yaw += d * k; log.assistYaw += Math.abs(d * k);
      if (!me.inShaft) me.pitch += (ASSIST.pitch - me.pitch) * Math.min(1, dt * ASSIST.pitchRate);
      if (Math.abs(d) > 0.02) log.assist++;
    },
    dispose() {
      removeEventListener('touchstart', onStart, opt); removeEventListener('touchmove', onMove, opt);
      removeEventListener('touchend', onEnd, opt); removeEventListener('touchcancel', onEnd, opt);
      endStick(); endLook();
    },
  };
}
