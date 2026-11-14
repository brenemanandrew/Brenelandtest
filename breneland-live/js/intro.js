// The morning: everything until the standard view is first person. Black, two or three blinks waking up by the bed, an automatic
// walk to the front door, out onto the porch and down its steps. By day the sunlight flash as the door opens, the arm comes up to
// shade the eyes and a short look round. At night no flash and no arm, a look up at the moon. Then the cuts to the game's camera
// behind you and the tutorial (new players) or control (main.js onDone).
// About 12 s, an unhurried walk out. Skippable (a tap, a click, any key or pad button) from the second visit on: main.js sets
// `skippable` (this device or this account has seen it). `skip()` itself always works (the harness and the tests call it).
// The light levels are multipliers on what daynight.js sets for the hour (LIGHT.introHemi / introExposure), so it works at any
// hour: a sunlit yard by day, a moonlit one at night (daynight.js colours the flash). The door's glare follows the real outdoor
// light (full by day, soft at dawn and dusk, none at night), and at night the multipliers never go over 1 (the outside is the
// game's own night the moment the door opens).
import * as THREE from 'three';
import * as L from './layout.js';
import { angleLerp, smoothstep, lerp, clamp, loadCss } from './util.js';
import { LIGHT, WEATHER } from './daynight-mats.js';
import { LIVING, livingOnAt } from './living-light.js';
import { groundHeight } from './terrain.js';
import { rebindArmCopy, poseArmBones } from './bodies-arm.js';
import { handGeo } from './bodies-hands.js';

const { SPAWN } = L;
// The gameplay camera the morning hands over to: under the porch eave, looking out over the lawn.
const SPAWN_CAM = { dist: 5.0, pitch: 0.28 };
// The beats (seconds). The walk to the door is an unhurried stroll, `speed` m/s once under way (`acc` s easing up from the bed and
// down onto the porch), never so long that the whole morning passes maxEnd. It goes on down the porch steps to the front walk,
// `out` m past the door's outside spot, so the arm doesn't clip the Breneland sign over the steps. At night the look round is the
// look up at the moon (`moonLook`: the turn and tilt, `moonTurn`, then a beat held on it), and the walk goes on further down the
// front walk first (`nightOut`): the moon is in the southern sky behind the house, and from the foot of the steps the porch roof
// and the house hide it at every hour of the night (from 7 m out the roof is below it).
// After the look round (or the moon) the camera CUTS, never swings, from your eyes to a three-quarter shot (`tq` s): above and in
// front of you, looking down about 35 degrees at your face turned up to it and the sky. Then it CUTS to the game's camera behind
// you and the game starts. The walk goes on to the hand-over spot itself (endSpot), so nobody moves between the shots.
export const BEATS = { wake: 1.5, look: 1.3, tq: 1.6, speed: 2.95, acc: 0.6, minMove: 2.5, maxEnd: 13, out: 4.4, nightOut: 7.2, moonLook: 1.4, moonTurn: 0.85 };
// The three-quarter shot: `dist` m from your eyes, `down` radians above them (the camera looks down that much), `side` radians round to
// your left of the way you face (a three-quarter view, not straight on), aimed `drop` m under the eyes (negative: over the head, so you
// stand in the lower half of the picture, clear of the morning's greeting card at the top on a short wide screen).
export const TQ = { dist: 3.1, down: 0.61, side: 0.55, drop: -0.42 };
const EYE_FWD = 0.12; // the eyes, a little in front of the head's middle (the store's first person)

// The way out comes from layout.js HOUSE_PLAN (the main bed's wake spot, the front door's inside and outside spots, a waypoint or
// two between them). This stand-in has the same shape for a layout without it (its only room is the hallway, so the "bed" is at
// its back, by the stairs).
export const STAND_IN = {
  mainBed: { wake: { x: -1.15, z: 2.05, yaw: 2.5 } },
  wakeRoute: [[-0.45, 0.45]],
  frontDoor: { inside: { x: 0, z: -3.3 }, outside: { x: 0, z: -4.75 }, yaw: Math.PI },
};

const pt = v => (!v ? null : Array.isArray(v) ? { x: v[0], z: v[1], yaw: v[2] } : { x: v.x, z: v.z, yaw: v.yaw });

// The route: wake spot > waypoints > inside the front door > outside it > a step onto the porch > down the steps onto the front
// walk (`out` m past the outside spot). Pure (tests read it).
export function introRoute(plan = L.HOUSE_PLAN || STAND_IN, out = BEATS.out) {
  const fd = plan.frontDoor || plan.door || {};
  const inside = pt(fd.inside || fd.in), outside = pt(fd.outside || fd.out);
  const bed = plan.mainBed || plan.bed || {};
  const wake = pt(bed.wake || bed);
  // the waypoints between: wakeRoute / route, or a whole path from the wake spot to the door (its ends dropped)
  const near = (a, b) => a && b && Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
  const way = (plan.wakeRoute || plan.route || plan.path || []).map(pt).filter(q => !near(q, wake) && !near(q, inside));
  const yawOut = Number.isFinite(fd.yaw) ? fd.yaw : Number.isFinite(outside.yaw) ? outside.yaw : Math.atan2(outside.x - inside.x, outside.z - inside.z);
  const porch = { x: outside.x + Math.sin(yawOut) * 1.0, z: outside.z + Math.cos(yawOut) * 1.0 };
  const lawn = { x: outside.x + Math.sin(yawOut) * Math.max(1.0, out), z: outside.z + Math.cos(yawOut) * Math.max(1.0, out) };
  const pts = [wake, ...way, inside, outside, porch, lawn].map(p => [p.x, p.z]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const at = s => {
    s = clamp(s, 0, len);
    let i = 1;
    while (i < pts.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], u = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
  };
  // where you face at s: toward the route 1.2 m on (the last stretch faces out of the door)
  const headAt = s => {
    if (len - s < 0.35) return yawOut;
    const [x0, z0] = at(s), [x1, z1] = at(s + 1.2);
    return Math.atan2(x1 - x0, z1 - z0);
  };
  const wakeYaw = Number.isFinite(wake.yaw) ? wake.yaw : headAt(0);
  // the eyes open on the bed you just got out of (when the plan says where it is), then turn to the way out
  const bedYaw = Number.isFinite(bed.x) && Number.isFinite(bed.z) ? Math.atan2(bed.x - wake.x, bed.z - wake.z) : wakeYaw;
  return {
    wake: { x: wake.x, z: wake.z, yaw: wakeYaw, look: bedYaw }, pts, cum, len, at, headAt, yawOut, porch, lawn,
    sInside: cum[pts.length - 4], sOutside: cum[pts.length - 3], door: { x: (inside.x + outside.x) / 2, z: (inside.z + outside.z) / 2 },
    standIn: !L.HOUSE_PLAN,
  };
}

// The timeline for a route (seconds from the black screen). Pure. night: the look up at the moon in place of shading the eyes.
// (pull0 .. end: the three-quarter shot, `tq`; the name kept from the pull back it replaced)
export function introTimeline(route, B = BEATS, night = false) {
  const move0 = B.wake, lookD = night ? B.moonLook : B.look, pullD = B.tq;
  const move = clamp(route.len / B.speed + B.acc, B.minMove, B.maxEnd - B.wake - lookD - pullD);
  const acc = Math.min(B.acc, move / 3), vmax = route.len / (move - acc);
  // the walk's distance at u seconds into it: speeding up from the bed, steady, slowing onto the porch
  const sAt = u => {
    u = clamp(u, 0, move);
    if (u < acc) return 0.5 * vmax * u * u / acc;
    if (u > move - acc) return route.len - 0.5 * vmax * (move - u) ** 2 / acc;
    return vmax * (u - acc / 2);
  };
  const vAt = u => (u <= 0 || u >= move ? 0 : u < acc ? vmax * u / acc : u > move - acc ? vmax * (move - u) / acc : vmax);
  const tAtS = s => { let lo = 0, hi = move; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sAt(m) < s) lo = m; else hi = m; } return move0 + hi; };
  const move1 = move0 + move, look0 = move1, look1 = look0 + lookD, pull0 = look1, end = pull0 + pullD;
  const door = tAtS(Math.max(0.15, route.sInside - 2.1));
  const out = tAtS(route.sOutside);
  return {
    move0, move1, look0, look1, pull0, end, door, flash: door + 0.3, out, close: move1 + 0.25, thud: move1 + 0.8, night,
    // the arm comes up over the last steps onto the front walk (by day; well past the sign over the porch steps); it is still up at
    // the cut and comes down to rest in the three-quarter shot; at night the turn and tilt up to the moon, then the beat held on it,
    // and in the three-quarter shot a last look at the moon before you turn back to the yard (`turn`)
    armUp: [move1 - 0.5, move1 + 0.04], armDown: [pull0 + 0.05, pull0 + 0.9], moon: [look0 + 0.05, look0 + B.moonTurn], hold: [look0 + B.moonTurn, look1],
    tq: [pull0, end], turn: [end - 0.8, end - 0.1],
    title: pull0 + 0.1, sAt, vAt, vmax,
  };
}

// Where the morning hands you over: the spawn spot, or a little further on when the gameplay camera behind you would sit
// under the porch roof (the porch sign hung across its view: the live game's handover looked through the sign).
export function endSpot(S = SPAWN, P = L.PORCH) {
  const cy = S.yaw + Math.PI, c = Math.cos(SPAWN_CAM.pitch) * SPAWN_CAM.dist;
  let x = S.x, z = S.z;
  for (let i = 0; P && i < 40; i++) {
    const cx = x + Math.sin(cy) * c, cz = z + Math.cos(cy) * c;
    if (!(cx > P.minX - 1 && cx < P.maxX + 1 && cz > P.minZ - 0.8 && cz < P.maxZ)) break;
    x += Math.sin(S.yaw) * 0.1; z += Math.cos(S.yaw) * 0.1;
  }
  return { x, z, yaw: S.yaw };
}

// the eyelids: closed is black; they open (and blink) in the first second and a half
const LIDS = [[0, 0], [0.22, 0], [0.5, 0.48], [0.62, 0.04], [0.9, 0.8], [1.0, 0.1], [1.32, 1]];
export function lidOpen(t) {
  if (t >= LIDS[LIDS.length - 1][0]) return 1;
  let i = 1;
  while (LIDS[i][0] < t) i++;
  const [t0, a] = LIDS[i - 1], [t1, b] = LIDS[i];
  return lerp(a, b, smoothstep(t0, t1, t));
}
// how many times the lids close again after first opening (the blinks)
export const BLINKS = LIDS.filter((k, i) => i > 1 && i < LIDS.length - 1 && k[1] < LIDS[i - 1][1]).length;

// the look round from the porch: left, right, back (fractions of the beat, radians)
const LOOK = [[0, 0, 0], [0.34, 0.55, -0.05], [0.72, -0.48, -0.08], [1, 0, 0.02]];
function lookAt(u) {
  let i = 1;
  while (i < LOOK.length - 1 && LOOK[i][0] < u) i++;
  const a = LOOK[i - 1], b = LOOK[i], k = smoothstep(a[0], b[0], u);
  return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

// The shading arm: your whole right arm, a copy of your body's shoulder group (the upper arm in your sleeve, the elbow, the forearm,
// the open hand), in front of the camera. Poses in camera space (x right, y up, -z ahead). A limb runs down its group's -y. armPose
// turns the way it points and which way its +z faces (for the forearm: the back of the hand) into a basis.
export const armPose = (ex, ey, ez, dx, dy, dz, nx = 0, ny = 0, nz = 1) => {
  const d = new THREE.Vector3(dx, dy, dz).normalize(), y = d.clone().negate();
  const n = new THREE.Vector3(nx, ny, nz);
  n.addScaledVector(y, -n.dot(y));
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0).addScaledVector(y, -y.x);
  n.normalize();
  const x = new THREE.Vector3().crossVectors(y, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
  return { p: new THREE.Vector3(ex, ey, ez), q };
};
// The arm is posed joint by joint like the body's own (human.js), laid out from the hand back: the wrist where the shading hand
// goes (w: NDC x, y at zw m ahead: over the brow, close), the forearm running from it back to the elbow along `fore` (out to your
// side and a little down and back), the upper arm on from the elbow to the shoulder along `upper` (down and back, off the edge of
// the view). The elbow is a pure hinge (it only folds the forearm toward the front of the upper arm, never back, never sideways),
// the forearm turned on its own axis so the palm faces `palm` (down over the eyes, tipped a little toward you like a cap's brim),
// the wrist straight but for a little `wrist` flex (relaxed), the fingers together. k: the arm's scale (a grown-up's arm from the
// cartoon's lengths). The raise and the lower are eased joint by joint (the shoulder's turn, the elbow's fold, the forearm's turn),
// so every frame between is a pose a real arm takes. The shoulder is off the edge of the view on every screen, so the arm always
// comes in from the edge (no cut end).
// (ARM: exported so a picture tool can try poses; the game never changes it)
export const ARM = {
  up: [
    [0.46, { w: [0.4, 0.5], zw: 0.85, fore: [0.7, -0.6, 0.8], upper: [0.15, -0.35, 0.95], palm: [0.25, -0.55, 0.8], k: 1.5 }],
    [1.78, { w: [0.3, 0.6], zw: 0.55, fore: [1, -0.5, 0.45], upper: [0.1, -0.45, 0.9], palm: [0.25, -0.55, 0.8], k: 1.5 }],
  ],
  wrist: 0.25,
  reach: 1,
  // lowered: hanging at your side below the view (the wrist this share of the arm's reach from the shoulder), the elbow soft and
  // behind, the palm in toward you
  down: { w: [0.03, -0.96, -0.12], pole: [0, 0, 1], palm: [-1, 0, 0], wrist: 0 },
};
// the raised pose's layout for a screen shape (the rows eased between)
export function armSpec(aspect, rows = ARM.up) {
  if (aspect <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    if (aspect > rows[i][0]) continue;
    const [a0, A] = rows[i - 1], [a1, B] = rows[i], u = (aspect - a0) / (a1 - a0), m = (p, q) => p.map((v, j) => lerp(v, q[j], u));
    return { w: m(A.w, B.w), zw: lerp(A.zw, B.zw, u), fore: m(A.fore, B.fore), upper: m(A.upper, B.upper), palm: m(A.palm, B.palm), k: lerp(A.k, B.k, u) };
  }
  return rows[rows.length - 1][1];
}
// One arm pose, solved: shoulder S, wrist target W, upper arm a and forearm b long (to the wrist), the elbow toward `pole`, the palm
// toward `palm` (camera space). -> { q: the upper arm's turn (its -y down the limb, +z the side the elbow folds to), el: the elbow's
// fold (radians, 0 straight), tw: the forearm's turn on its own axis, E: the elbow, W: the wrist (pulled in if out of reach) }
// (a right arm: its palm is the forearm's +x at no turn, bodies-hands.js)
export function solveShade(S, W, a, b, pole, palm) {
  const V = THREE.Vector3, d0 = W.clone().sub(S), dist = clamp(d0.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const u = d0.normalize(), Wc = S.clone().addScaledVector(u, dist);
  const p = new V(...pole); p.addScaledVector(u, -p.dot(u)); if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(u, -u.y); p.normalize();
  const x = (a * a - b * b + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, a * a - x * x));
  const E = S.clone().addScaledVector(u, x).addScaledVector(p, h);
  const up = E.clone().sub(S).normalize(), fo = Wc.clone().sub(E).normalize();
  const Y = up.clone().negate(), Z = fo.clone().addScaledVector(Y, -fo.dot(Y));
  if (Z.lengthSq() < 1e-8) Z.copy(p).negate(); // (straight: fold toward the far side of the pole)
  Z.normalize();
  const X = new V().crossVectors(Y, Z);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const el = up.angleTo(fo);
  // the forearm's frame at no turn: the upper arm's, folded by el about its x; its +x (the palm) turned onto the wanted palm
  const Zf = Z.clone().multiplyScalar(Math.cos(el)).addScaledVector(Y, Math.sin(el)), N = new V(...palm);
  N.addScaledVector(fo, -N.dot(fo));
  const tw = N.lengthSq() < 1e-8 ? 0 : Math.atan2(-N.dot(Zf), N.dot(X));
  return { q, el, tw, E, W: Wc };
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

// The light (fix/intro-night). By day the hall is dim (the hemisphere at HALL.hemi, the hall's lamp at HALL.lamp) and the eyes a
// little open (HALL.exp) until the door opens on the glare; at night the lamp is a homely one, the eyes already set for the dark
// (HALL.nightExp, under 1) and they settle to the game's own night as you step out, the lamp fading behind you.
const HALL = { hemi: 0.42, lamp: 17, exp: 1.1, nightLamp: 8, nightExp: 0.9 }; // (the lamp: the fan's light up in the vault since fire-season, 2.5 times what it was low by the door)
// how strong the door's glare is at this hour: the sun's height (full from mid morning to mid afternoon, soft at dawn and dusk,
// none once it is down), less under cloud
export const glareAt = (sun = LIGHT.sun, cloud = WEATHER.cloud) => smoothstep(-0.04, 0.42, sun) * (1 - 0.4 * clamp(cloud || 0, 0, 1));
// Where to look up at night: the moon (daynight.js puts it in LIGHT.moonDir), or, if it is down or too low to see over the roof, the
// high southern sky where the stars are brightest. Yaw as the player's (forward = (sin, cos)); pitch as the intro's (positive is down).
// (the eyes rest a few degrees under it, MOON_DROP: the moon a little above the middle of the view, the roof's edge in its foot)
const MOON_DROP = 0.05;
export function moonAim(m = LIGHT.moonDir, vis = LIGHT.moonVis) {
  const ok = m && vis > 0.05 && m.y > 0.12;
  const x = ok ? m.x : 0, y = ok ? m.y : 0.75, z = ok ? m.z : 0.66;
  return { yaw: Math.atan2(x, z), pitch: -Math.atan2(y, Math.hypot(x, z)) + MOON_DROP, moon: !!ok };
}

export class Intro {
  constructor(o) {
    Object.assign(this, o); // player, house, camera, ink, scene, ui, audio, profile, onDone
    this.t = 0;
    this.running = false;
    this.fired = new Set();
    this.skippable = false;
    this.paused = false; // (tests and pictures: hold a frame)
    this.look = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.tqPos = new THREE.Vector3(); this.tqLook = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.state = { lids: 0, arm: 0, flash: 0, fp: true, bodyShown: false, yaw: 0, pitch: 0 };
    this.aim = { yaw: 0, pitch: 0, moon: false };
    loadCss('/css/intro.css');
    handGeo('shade', -1); // the shading hand's shape built now, at load, not in the morning's first frame: it takes a moment
  }

  // where we are: wake, walk, door (stepping out into the light), look, tq (the three-quarter shot), or null
  get phase() {
    if (!this.running) return null;
    const t = this.t, T = this.tl;
    return t < T.move0 ? 'wake' : t < T.door ? 'walk' : t < T.move1 ? 'door' : t < T.pull0 ? 'look' : 'tq';
  }

  start({ skippable = false } = {}) {
    // night or day, settled for the whole morning: at night no glare and no arm, the look up at the moon instead
    this.night = LIGHT.night >= 0.5;
    // the walk ends at the hand-over spot (the three-quarter shot and the game's camera both find you there, nobody moves between the
    // cuts), and never short of the beats' distances (clear of the sign by day, of the roof hiding the moon at night)
    const E = this.end = endSpot(), plan = L.HOUSE_PLAN || STAND_IN, fdo = pt((plan.frontDoor || plan.door || {}).outside || (plan.frontDoor || plan.door || {}).out);
    const toE = fdo ? Math.hypot(E.x - fdo.x, E.z - fdo.z) : 0;
    this.route = introRoute(undefined, Math.max(this.night ? BEATS.nightOut : BEATS.out, toE));
    this.glare = this.night ? 0 : glareAt();
    this.aim = moonAim();
    this.tl = introTimeline(this.route, BEATS, this.night);
    this.t = 0;
    this.running = true;
    this.paused = false;
    this.skipped = null;
    this.tagsOff = null;
    this.skippable = !!skippable;
    this.fired.clear();
    const p = this.player, R = this.route;
    p.controls = false;
    p.houseSolid = false;
    p.emote = null;
    p.place(R.wake.x, R.wake.z, R.wake.look);
    p.character.update(0, 0, 0, null);
    // your eyes' height standing (the head's middle; 1.45 m if the body cannot say)
    const head = p.character.head;
    if (head) { p.character.root.updateMatrixWorld(true); head.getWorldPosition(this.head); }
    this.eyeH = head ? clamp(this.head.y - p.pos.y, 0.9, 2.2) : 1.45;
    this.yawS = R.wake.look;
    this.eyeY = undefined;
    p.character.root.visible = false;
    this.house.setDoor?.(false);
    if (this.house.hallLight) this.house.hallLight.intensity = (this.night ? HALL.nightLamp : HALL.lamp) * (livingOnAt(LIGHT.hour) ? 1 : 0); // (the fan's light is off 10 pm-7 am: living-light.js)
    LIGHT.introHemi = HALL.hemi; LIGHT.introExposure = this.night ? HALL.nightExp : HALL.exp;
    this.ink.uniforms.uFlash.value = 0;
    // the final camera = the gameplay camera behind you at the spawn point
    this.tqCam = null; // (the three-quarter shot's camera: placed at the cut)
    this.buildArm();
    // the house's inside is drawn only when its feature says so, and features sleep through the morning: shown for the walk
    // (its own introUpdate, if it has one, may do more), put back as it was at the end
    const ins = this.house.inside?.group;
    if (ins && this.insideWas === undefined) { this.insideWas = ins.visible; ins.visible = true; }
    this.lids(true);
    this.setLids(0);
    this.ui.titleCard('', false);
    this.update(0, 0);
  }

  once(key, at, fn) { if (this.t >= at && !this.fired.has(key)) { this.fired.add(key); fn(); } }

  update(dt, now = 0) {
    if (!this.running) return;
    if (this.paused) dt = 0;
    this.t += dt;
    const t = this.t, T = this.tl, R = this.route, p = this.player, S = this.state;

    // ---- the body (hidden until the three-quarter shot) and the eyes
    let x, z, yaw, speed = 0, eyeK = 1, pitch = 0.06, headYaw = 0;
    if (t < T.move0) { // waking: sitting on the edge of the bed, then up
      x = R.wake.x; z = R.wake.z;
      yaw = angleLerp(R.wake.look, R.headAt(0), smoothstep(0.62, T.move0, t));
      eyeK = lerp(0.66, 1, smoothstep(0.95, T.move0, t));
      pitch = t < 0.95 ? lerp(-0.1, 0.24, smoothstep(0.15, 0.95, t)) : lerp(0.22, 0.06, smoothstep(0.95, T.move0, t));
    } else if (t < T.move1) { // the walk to the front door, out onto the porch and down its steps
      const u = t - T.move0, s = T.sAt(u);
      [x, z] = R.at(s);
      yaw = R.headAt(s);
      speed = T.vAt(u);
      pitch = lerp(0.1, 0.03, smoothstep(T.door, T.out, t)); // eyes up as the light comes in
    } else if (t < T.pull0) { // by day shading the eyes, a look round; at night the look up at the moon
      x = R.lawn.x; z = R.lawn.z; yaw = R.yawOut;
      if (T.night) {
        this.aim = moonAim();
        pitch = lerp(0.03, this.aim.pitch, smoothstep(T.moon[0] + 0.12, T.moon[1], t)); // (turning, then the eyes go up)
        yaw = angleLerp(R.yawOut, this.aim.yaw, smoothstep(T.moon[0], T.moon[1] - 0.1, t)); // (the body turns to the moon with the eyes: the shot after the cut sees it so)
      } else {
        const [hy, hp] = lookAt((t - T.look0) / (T.look1 - T.look0));
        headYaw = this.reduced ? hy * 0.5 : hy; pitch = hp;
      }
    } else { // the three-quarter shot: standing on the hand-over spot, the face turned up to the camera and the sky
      x = R.lawn.x; z = R.lawn.z;
      // (at night a last look at the moon, then you turn back to the yard, the way the game's camera will find you)
      yaw = T.night ? angleLerp(this.aim.yaw, this.end.yaw, smoothstep(T.turn[0], T.turn[1], t)) : R.yawOut;
    }
    // your body's pose for the three-quarter shot, set from the look on (while it's still hidden, so the change of pose has settled by
    // the cut): the face up, the right hand by the brow coming down to rest (by day), the eyes narrowed against the sun
    const armUp = smoothstep(T.armUp[0], T.armUp[1], t), armDown = smoothstep(T.armDown[0], T.armDown[1], t);
    S.arm = T.night ? 0 : Math.max(0, armUp - armDown); // (no sun at night: nothing to shade)
    const ch = p.character, gz = t >= T.look0;
    p.emote = gz ? 'gaze' : null;
    if (gz) {
      const g = ch.params.gaze || (ch.params.gaze = { up: 1, shade: 0, squint: 0 });
      const turned = T.night ? smoothstep(T.turn[0], T.turn[1], t) : 0;
      g.up = 1 - 0.85 * turned; g.shade = S.arm; g.squint = T.night ? 0 : clamp(this.glare * 1.4, 0, 1) * (1 - 0.4 * turned);
      // the head turned toward the camera (the shot's side of the way you face), back with you as you turn at night
      ch.lookYaw = t >= T.pull0 ? TQ.side * g.up : 0;
    }
    p.scriptedMove(x, z, yaw, speed, dt, now);

    // ---- the camera
    const cam = this.camera;
    if (t < T.pull0) {
      this.yawS = dt > 0 ? angleLerp(this.yawS, yaw, Math.min(1, dt * 9)) : yaw; // (a little lag round the corners)
      // (at night the head turns round to the moon, the shorter way, and holds on it)
      const cyaw = T.night && t >= T.look0 ? angleLerp(this.yawS, this.aim.yaw, smoothstep(T.moon[0], T.moon[1] - 0.1, t)) : this.yawS + headYaw;
      // a walker's gentle bob (down a little on each step) and sway (side to side over a stride), the eyes moving, never
      // tilting or turning with it (nothing to make anyone queasy)
      const stepK = speed > 0.3 && !this.reduced ? Math.min(1, speed / 3) : 0;
      const bob = -Math.abs(Math.sin(p.stepPhase * Math.PI)) * 0.026 * stepK, sway = Math.sin(p.stepPhase * Math.PI) * 0.014 * stepK;
      // (down the porch steps the eyes ease from one tread to the next rather than drop)
      const eyeG = p.pos.y + this.eyeH * eyeK;
      if (this.eyeY === undefined) this.eyeY = eyeG;
      else if (dt > 0) this.eyeY = lerp(this.eyeY, eyeG, Math.min(1, dt * 12));
      const ey = this.eyeY + bob, cp = Math.cos(pitch);
      this.eye.set(p.pos.x + Math.sin(this.yawS) * EYE_FWD + Math.cos(this.yawS) * sway, ey, p.pos.z + Math.cos(this.yawS) * EYE_FWD - Math.sin(this.yawS) * sway);
      this.look.set(this.eye.x + Math.sin(cyaw) * cp * 6, ey - Math.sin(pitch) * 6, this.eye.z + Math.cos(cyaw) * cp * 6);
      cam.position.copy(this.eye);
      cam.lookAt(this.look);
      S.fp = true; S.yaw = cyaw; S.pitch = pitch;
    } else {
      // the three-quarter shot: a CUT from your eyes, no move between. Placed once, at the cut: above and in front of you,
      // round to your left of the way you face (at night, of the way you face the moon), looking down TQ.down at your face; it holds
      // still while you move within it (the head, the arm, at night the turn back to the yard). The next cut is to the game's camera.
      if (!this.tqCam) {
        const fy = T.night ? this.aim.yaw : R.yawOut, cy = fy + TQ.side, gy = groundHeight(R.lawn.x, R.lawn.z);
        const F = this.head.set(R.lawn.x, gy + this.eyeH, R.lawn.z), hd = Math.cos(TQ.down) * TQ.dist;
        this.tqPos.set(F.x + Math.sin(cy) * hd, F.y + Math.sin(TQ.down) * TQ.dist, F.z + Math.cos(cy) * hd);
        this.tqLook.set(F.x, F.y - TQ.drop, F.z);
        this.tqCam = { yaw: cy, face: F.clone() };
      }
      cam.position.copy(this.tqPos);
      cam.lookAt(this.tqLook);
      S.fp = false;
    }
    cam.updateMatrixWorld();
    // your body shows once the camera has left your head
    const show = !S.fp && cam.position.distanceTo(this.head.set(p.pos.x, p.pos.y + this.eyeH, p.pos.z)) > 1.3; // (not right behind your own head)
    if (show !== S.bodyShown) { S.bodyShown = show; p.character.root.visible = show; }

    // ---- the name tags and place labels stay out while you are inside (they showed through the walls)
    const tagsOff = t < T.out + 0.1;
    if (tagsOff !== this.tagsOff) { this.tagsOff = tagsOff; for (const l of [this.ui.layer, this.ui.bubbleLayer]) if (l) l.style.visibility = tagsOff ? 'hidden' : ''; }

    // ---- eyelids, the arm
    S.lids = lidOpen(t);
    this.setLids(S.lids);
    if (t > LIDS[LIDS.length - 1][0] + 0.1) this.lids(false);
    this.poseArm(S.arm); // (in first person only: the copy of your arm in front of your eyes)

    // ---- door, light and sound
    const door = this.route.door;
    this.once('open', T.door, () => { this.house.setDoor?.(true); this.audio.door?.('open', door.x, (L.HOUSE.floorY || 0.9) + 1.1, door.z); });
    this.once('close', T.close, () => this.house.setDoor?.(false));
    this.once('thud', T.thud, () => this.audio.door?.('close', door.x, (L.HOUSE.floorY || 0.9) + 1.1, door.z));
    this.once('title', T.title, () => this.ui.titleCard(`${greeting()}, ${this.profile.name}.`, true));

    const outK = smoothstep(T.door + 0.15, T.out + 0.35, t);
    LIGHT.introHemi = lerp(HALL.hemi, 1, outK);
    if (T.night) {
      // at night: no glare; the hall's lamp fades as you go out of the door (it would light the porch) and the eyes settle to the dark
      LIGHT.introExposure = lerp(HALL.nightExp, 1, smoothstep(T.door, T.out + 0.6, t));
      if (this.house.hallLight) this.house.hallLight.intensity = HALL.nightLamp * LIVING.k * (1 - smoothstep(T.door + 0.2, T.out, t)); // (after 10 pm: off, the fire or the dark)
      S.flash = 0;
    } else {
      LIGHT.introExposure = lerp(HALL.exp, 1, outK) * (1 - 0.06 * S.arm); // the hand takes the edge off the glare
      if (this.house.hallLight) this.house.hallLight.intensity = LIVING.k * (t < T.out ? HALL.lamp : lerp(HALL.lamp, 0, smoothstep(T.out, T.out + 0.7, t)));
      // the glare, as strong as the hour's light: up as the door opens, settling a little while you walk into it and down the steps,
      // gone once your hand is up shading your eyes
      // (the eyes get used to it going down the steps: by the time the hand comes up it is about half what met you at the door)
      const flashUp = smoothstep(T.flash, T.flash + 0.4, t) * lerp(1, 0.6, smoothstep(T.flash + 0.5, T.flash + 1.2, t)) * lerp(1, 0.6, smoothstep(T.out, T.armUp[0], t)), flashDown = 1 - smoothstep(T.armUp[0] - 0.3, T.armUp[1] + 0.9, t);
      S.flash = (this.reduced ? 0.22 : 0.55) * this.glare * Math.min(flashUp, flashDown) * (1 - 0.55 * S.arm);
    }
    this.ink.uniforms.uFlash.value = S.flash;

    if (t >= T.end) this.finish();
  }

  // ---- the eyelids (a DOM layer over the canvas, under the skip prompt and the fade)
  lids(on) {
    if (on && !this.lidEl) {
      const el = this.lidEl = document.createElement('div');
      el.className = 'intro-lids';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="lid top"></div><div class="lid bot"></div>';
      document.body.append(el);
    }
    if (this.lidEl) this.lidEl.hidden = !on;
  }
  setLids(o) {
    if (!this.lidEl || this.lidEl.hidden) return;
    const h = innerHeight, k = Math.round(o * 1000) / 1000;
    if (k === this.lidK) return;
    this.lidK = k;
    const [top, bot] = this.lidEl.children;
    top.style.transform = `translateY(${(-k * 0.78 * h).toFixed(1)}px)`;
    bot.style.transform = `translateY(${(k * 0.78 * h).toFixed(1)}px)`;
  }

  // ---- the shading arm (by day)
  buildArm() {
    const ch = this.player.character;
    if (this.arm?.src === ch) return;
    if (this.arm) this.scene.remove(this.arm.holder);
    this.arm = null;
    const sh = ch.armR?.shoulder, elbow = ch.armR?.elbow;
    if (!sh || !elbow || !this.scene) return;
    // your whole right arm: the shoulder group (the upper arm and its sleeve) with the elbow group (the forearm, the cuff) and the hand
    const ei = sh.children.indexOf(elbow);
    const c = sh.clone(true);
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
    c.traverse(o => {
      if (o !== c && !o.isMesh) o.rotation.set(0, 0, 0); // (the elbow and the wrist straight: posed below)
      if (o.isMesh) {
        if (o.layers.mask === 0) o.layers.mask = 1; // (rigid-merge draws the body's parts as one mesh and parks the originals)
        o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.userData.noMerge = true;
      }
    });
    const el = c.children[ei];
    // (the upper arm drawn ARM.reach times its length: only its elbow end is ever on screen, and the longer arm takes the shoulder's
    // end well off the edge of any screen without a bigger, nearer arm; an arm seen this close looks long anyway)
    // (the arm is one skinned tube: the copy's bones are its own, and its upper arm's bone is the one stretched)
    const bones = rebindArmCopy(c), upper = bones.U;
    if (upper && el) { upper.scale.y = ARM.reach; el.position.y *= ARM.reach; }
    // nothing held in the copy's hand (the anchors under the wrist: plain Object3Ds, the hand's parts are groups); the open hand
    // shape, its back to you (the cartoon hand)
    let wrist = null;
    c.traverse(o => { if (o.userData.wrist) wrist = o; });
    for (const an of wrist ? wrist.children.filter(o => !o.isGroup && !o.isMesh) : []) an.clear();
    // the shading hand: fingers together and relaxed, the thumb alongside (bodies-hands.js 'shade', built for this copy only), in
    // your skin, at your hand's size. The body's own shapes hidden
    let openMesh = null;
    c.traverse(o => { if (o.userData.handShape) { if (o.userData.handShape === 'open') o.traverse(m => { if (m.isMesh && !openMesh) openMesh = m; }); o.visible = false; } });
    if (wrist && openMesh) {
      const [hw, hl] = ch.dims?.shape?.handK || [1, 1], g = handGeo('shade', -1).clone(), n = g.attributes.position.count, col = new Float32Array(n * 3), oc = openMesh.geometry.attributes.color;
      g.scale(hw, hl, hw);
      for (let i = 0; i < n; i++) { col[i * 3] = oc ? oc.getX(0) : 1; col[i * 3 + 1] = oc ? oc.getY(0) : 0.8; col[i * 3 + 2] = oc ? oc.getZ(0) : 0.6; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, openMesh.material);
      m.name = 'intro-hand'; m.userData.noMerge = true; m.frustumCulled = false; m.castShadow = false;
      wrist.add(m);
    }
    const holder = new THREE.Group();
    holder.name = 'intro-arm';
    holder.add(c);
    holder.visible = false;
    this.scene.add(holder);
    // your own lengths (the shoulder to the elbow, the elbow to the wrist) and the arm's thickness
    this.arm = { src: ch, holder, el: c, elbow: el, wrist, Lu: Math.abs(el?.position.y || 0.19), Lf: Math.abs(wrist?.position.y || 0.18), r: ch.dims?.armR || 0.065, rig: null,
      bend: el ? { bones: { C: null, E: bones.E }, shoulder: c, elbow: el } : null, Lu0: ch.dims?.Lu || 0.19 };
  }
  // The raised arm laid out for this screen (ARM.up's row for its shape): the wrist where the row puts it, the elbow on its ray your
  // forearm's length from the wrist, the shoulder on its ray (off the right edge) your upper arm's length from the elbow; then the
  // turns that put the upper arm and the forearm there, and the lowered arm's. Kept until the screen's shape changes.
  armRig() {
    const a = this.arm, cam = this.camera;
    if (a.rig && a.rig.aspect === cam.aspect && a.rig.fov === cam.fov && a.rig.rows === ARM.up) return a.rig;
    const sp = armSpec(cam.aspect), T = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), A = cam.aspect, k = sp.k, D = ARM.down;
    const lu = a.Lu * k, lf = a.Lf * k, V = THREE.Vector3;
    // from the hand back: the wrist, the elbow a forearm's length along `fore`, the shoulder an upper arm's length along `upper`
    const W = new V(sp.w[0] * T * A * sp.zw, sp.w[1] * T * sp.zw, -sp.zw), E = W.clone().addScaledVector(new V(...sp.fore).normalize(), lf);
    const S = E.clone().addScaledVector(new V(...sp.upper).normalize(), lu), u = W.clone().sub(S).normalize(), pole = E.clone().sub(S);
    pole.addScaledVector(u, -pole.dot(u));
    const up = solveShade(S, W, lu, lf, pole.toArray(), sp.palm);
    const dn = solveShade(S, S.clone().add(new THREE.Vector3(D.w[0], D.w[1], D.w[2]).multiplyScalar(lu + lf)), lu, lf, D.pole, D.palm);
    // (the forearm's turn eased the shorter way round)
    const tw0 = dn.tw, tw1 = tw0 + Math.atan2(Math.sin(up.tw - tw0), Math.cos(up.tw - tw0));
    a.rig = { aspect: cam.aspect, fov: cam.fov, rows: ARM.up, k, S, E: up.E, W: up.W, up, dn, tw0, tw1 };
    return a.rig;
  }
  // for the tests: where the shading arm is on screen, in the camera's normalised coordinates: its line from the fingertips down the forearm
  // to the elbow and up the upper arm to the shoulder. hand: the fingertips in view; on: any of it in view; edge: some in view and the
  // line leaves the view; endOn: the shoulder's end (the only end the arm has: round the joint, the sleeve's ball) in view; elbow: the
  // elbow in view; bend: the elbow's bend (degrees); handBox: the hand's box on screen [x0, y0, x1, y1]
  armScreen() {
    const a = this.arm;
    if (!a || !a.holder.visible) return null;
    a.holder.updateMatrixWorld(true);
    const cam = this.camera, v = new THREE.Vector3(), pts = [];
    const proj = (o, x, y, z) => v.set(x, y, z).applyMatrix4(o.matrixWorld).project(cam).toArray();
    for (let t = -(a.Lf + 0.13); t <= 1e-6; t += 0.03) pts.push(proj(a.elbow, 0, t, 0));
    for (let t = -a.Lu; t <= 1e-6; t += 0.03) pts.push(proj(a.el, 0, t, 0));
    const r = a.r * 1.5, ends = [[0, 0, 0], [r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r], [0, r, 0]].map(q => proj(a.el, ...q));
    const inView = q => q[2] < 1 && q[2] > -1 && Math.abs(q[0]) <= 1 && Math.abs(q[1]) <= 1;
    let handBox = null;
    if (a.wrist) a.wrist.traverseVisible(o => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const g = o.geometry.boundingBox;
      for (const x of [g.min.x, g.max.x]) for (const y of [g.min.y, g.max.y]) for (const z of [g.min.z, g.max.z]) {
        const q = proj(o, x, y, z);
        if (q[2] >= 1) continue;
        handBox = handBox ? [Math.min(handBox[0], q[0]), Math.min(handBox[1], q[1]), Math.max(handBox[2], q[0]), Math.max(handBox[3], q[1])] : [q[0], q[1], q[0], q[1]];
      }
    });
    const on = pts.some(inView);
    // how far the elbow is bent (degrees between the upper arm's line and the forearm's: 0 is straight)
    const S = new THREE.Vector3().setFromMatrixPosition(a.el.matrixWorld), E = new THREE.Vector3().setFromMatrixPosition(a.elbow.matrixWorld);
    const W = a.wrist ? new THREE.Vector3().setFromMatrixPosition(a.wrist.matrixWorld) : E.clone();
    const reach = W.distanceTo(cam.position) / ((a.Lu + a.Lf) * a.el.scale.x); // how far off the hand is, in arm's reaches
    const bend = THREE.MathUtils.radToDeg(E.clone().sub(S).angleTo(W.sub(E)));
    // the elbow as a hinge: the forearm's line in the upper arm's own frame (x across the hinge: 0 for a true hinge; z the
    // front of the upper arm, where a real elbow folds the forearm: never negative), the forearm's turn on its own axis and the wrist's
    // bend (degrees)
    const fl = v.set(0, -1, 0).applyQuaternion(a.elbow.quaternion);
    const hinge = [+fl.x.toFixed(4), +fl.z.toFixed(4)], tw = THREE.MathUtils.radToDeg(a.tw || 0), wristBend = THREE.MathUtils.radToDeg(Math.abs(a.wf || 0));
    return { hand: inView(pts[0]), on, edge: on && pts.some(q => !inView(q)), endOn: ends.some(inView), elbow: inView(proj(a.el, 0, -a.Lu, 0)), bend, n: pts.length, handBox, hinge, tw, wristBend, reach };
  }
  // (tests) the BRENELAND sign over the porch steps on screen (house.js: 2.6 x 0.65 m at the porch's front edge, hung from its
  // ceiling on two chains): its box [x0, y0, x1, y1] in the camera's normalised coordinates, or null when it is behind you
  signScreen() {
    const P = L.PORCH;
    if (!P || !Number.isFinite(P.ceilY)) return null;
    const cam = this.camera, v = new THREE.Vector3(), y0 = P.ceilY - 0.42, z0 = P.minZ + 0.16;
    cam.updateMatrixWorld();
    let box = null;
    for (let i = 0; i <= 10; i++) for (const y of [y0 - 0.325, y0, y0 + 0.325, P.ceilY]) for (const dz of [-0.04, 0.04]) {
      v.set(-1.3 + 2.6 * i / 10, y, z0 + dz).project(cam);
      if (v.z >= 1 || v.z <= -1) continue; // (behind the camera)
      box = box ? [Math.min(box[0], v.x), Math.min(box[1], v.y), Math.max(box[2], v.x), Math.max(box[3], v.y)] : [v.x, v.y, v.x, v.y];
    }
    return box;
  }
  poseArm(k) {
    const a = this.arm;
    if (!a) return;
    a.holder.visible = k > 0.002 && this.state.fp;
    if (!a.holder.visible) return;
    a.holder.position.copy(this.camera.position);
    a.holder.quaternion.copy(this.camera.quaternion);
    const R = this.armRig();
    // the upper arm swings up from the shoulder, the elbow folds and the forearm turns the palm down after it (a calm lowering the
    // same way back): joint by joint, so every frame between is a real arm's pose
    const eU = smoothstep(0, 0.8, k), eF = smoothstep(0.15, 1, k);
    a.el.position.copy(R.S);
    a.el.scale.setScalar(R.k);
    a.el.quaternion.slerpQuaternions(R.dn.q, R.up.q, eU);
    a.tw = lerp(R.tw0, R.tw1, eF); a.wf = lerp(ARM.down.wrist, ARM.wrist, eF);
    if (a.elbow) a.elbow.quaternion.setFromEuler(_e.set(-lerp(R.dn.el, R.up.el, eF), a.tw, 0, 'XYZ'));
    if (a.wrist) a.wrist.rotation.set(0, 0, a.wf);
    if (a.bend) poseArmBones(a.bend, a.Lu0); // the elbow's own bones: a smooth bend
    a.holder.updateMatrixWorld(true);
  }

  // a tap, a click, a key: only when this visit may skip
  trySkip() {
    if (!this.running || !this.skippable || this.t < 0.25) return false;
    this.skip(true);
    return true;
  }

  skip(byHand = false) {
    if (!this.running) return;
    this.house.setDoor?.(false);
    if (this.house.hallLight) this.house.hallLight.intensity = 0;
    LIGHT.introHemi = 1; LIGHT.introExposure = 1;
    this.ink.uniforms.uFlash.value = 0;
    this.ui.titleCard('', false);
    this.skipped = byHand ? 'hand' : 'code';
    this.finish();
    // skipped by hand: the eyes open once more onto the yard (a moment, not a cut); the code's skip is a clean cut
    if (byHand && !this.reduced) {
      this.lids(true); this.setLids(0);
      const el = this.lidEl;
      el.classList.add('opening');
      el.getBoundingClientRect();
      this.lidK = null; this.setLids(1);
      clearTimeout(this.lidTimer);
      this.lidTimer = setTimeout(() => { el.classList.remove('opening'); if (!this.running) this.lids(false); }, 420);
    }
  }

  finish() {
    this.running = false;
    this.ui.el.skip.hidden = true;
    const p = this.player;
    p.character.lookYaw = 0;
    p.emote = null; p.character.params.gaze = null; // the three-quarter shot's pose ends here, after the cut
    p.character.root.visible = true;
    this.state.bodyShown = true; this.state.fp = false; this.state.arm = 0; this.state.flash = 0;
    if (this.arm) this.arm.holder.visible = false;
    this.lids(false);
    const ins = this.house.inside?.group;
    if (ins && this.insideWas !== undefined) { ins.visible = this.insideWas; this.insideWas = undefined; }
    this.tagsOff = false; for (const l of [this.ui.layer, this.ui.bubbleLayer]) if (l) l.style.visibility = '';
    const E = this.end || endSpot();
    p.place(E.x, E.z, E.yaw);
    p.speed = 0;
    p.houseSolid = true;
    p.controls = true;
    p.snapCameraBehind();
    p.cam.pitch = SPAWN_CAM.pitch; p.cam.dist = p.cam.targetDist = SPAWN_CAM.dist;
    if (this.house.hallLight) this.house.hallLight.intensity = 0;
    this.house.setDoor?.(false);
    LIGHT.introHemi = 1; LIGHT.introExposure = 1;
    this.ink.uniforms.uFlash.value = 0;
    clearTimeout(this.titleTimer);
    if (this.skipped) this.ui.titleCard('', false);
    else this.titleTimer = setTimeout(() => { if (!this.running) this.ui.titleCard('', false); }, 1500); // (the greeting stays a moment)
    this.onDone?.();
  }
}

// "Good morning" by day, "Good evening" after five, and a wink for the very late visitor
export function greeting(h = LIGHT.hour) {
  if (h >= 4 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Hello, night owl';
}
