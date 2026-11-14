// Beneath Angell Street: the maze as its own scene. Built on the way down (maze.js imports this file then), it runs instead of the
// yard while you're below (main.js hands every frame to ctx.below.frame while it's set): its own THREE.Scene far under the
// Lovecraft house, its own camera, its own first-person controller on the maze grid (walls are solid, the water slows you, a
// short breath for sprinting), the lantern in your hand as the one shadow-casting light (warm, a flicker, swinging harder at a
// run), your friends' lanterns as plain point lights, a few fixed torches and the glyphs' glow, fog closing in, and the ink pass
// a touch thicker (toon.js uInkW). Pretty dark except your light.
//
// The way down: the helix stair from the hall's door (the candle at the top gutters), the lights out at the bottom (black, a
// breath, a drip), a match and the lantern comes up. The way up: the flight in the exit room through the door into daylight, or
// E on the landing at the top of the stair you came down. Both call `onOut(how)`, and maze.js puts the yard back.
import * as THREE from 'three';
import { Human, avatarLook } from './human.js';
import { lookFor, dressFor, createAbilities } from './maze-investigators.js';
import { el } from './util.js';
import { generate, CELL, DIRS } from './maze-gen.js';
import { buildMazeKit, WALL_H, WATER_Y, STAIR } from './maze-kit.js';
import { LOVECRAFT_HOUSE as L } from './layout.js';
import { LIGHT } from './daynight-mats.js'; // the yard's hour for the garden past the door
import { playStep } from './qol-sfx.js';
import { GFX } from './gfx.js';
import { createMazeFx } from './maze-fx.js';       // the light, the air, the wet, the other lights
import { createMazeAudio } from './maze-audio.js'; // the sound below
import { buildLanternHand, dressLantern } from './maze-hand.js';   // your own arm and hand holding the lantern, and a see-through lantern on a body
import { createMazeTouch } from './maze-touch.js';   // the phone's stick and look below, the look assist
import { createMazeDark } from './maze-dark.js';     // the lights out: the heartbeat, the match, the light coming up
import { mazeFov } from './maze-view.js';           // a wider view on a tall screen
import { createMazeFlames } from './maze-flame.js';  // the torches' and candles' flames, one draw
import { createField } from './maze-acoustics.js';   // a line of sight on the grid: friends' tags and bubbles stop at the stone
import { CROUCH, STEER, ACC, unsteady, gaitAt, breathPlan, voiceFor } from './maze-sneak.js'; // the crouch, the stick's steer, the unsteady walk, your voice
import { createMazeGates } from './maze-gates.js'; // the locked gates rattle, and what comes to rattle them
import { createMazeGoals } from './maze-goals.js'; // the week's goal: the things to find, the door sealed, dark or shut, the scout, the strip

export const ORIGIN_Y = -220;                 // the maze lives far under the house (nothing of the yard is near enough to draw or to label)
const EYE = 1.5, RADIUS = 0.35, WALK = 3.3, RUN = 6.0, WATER_K = 0.55, TP_DIST = 2.9;
// through the door: the walk's pace (m/s), the head up to the sky, the exposure's bloom, the white from (s) and how long it takes
// to fill (ms), the hand-over to the yard (s)
export const OUT = { pace: 2.3, pitch: -0.16, bloom: 1.9, white: 0.5, fade: 600, secs: 1.15 };
const BREATH = { drain: 0.2, fill: 0.13, rest: 0.26, empty: 0.04, again: 0.3 };
// an old stone place in deep gloom, so a corridor past the lantern isn't a black void: the fog a dark cool grey-green you can see
// (and the void beyond it the same murk, not black), a faint cold ambient so far walls are just there, the lantern's light falling
// off into it. maze-fx.js adds the mist hanging low in the lantern's light and puts all of it out in the lights-out beat.
export const FOG = { near: 2.2, far: 13, color: '#17211d' }, AMBIENT = { color: '#2c3a44', k: 0.42 };
const LANTERN = { color: '#f2c48c', fill: '#efcaa0', k: 11, dist: 8.5, spot: 15, decay: 1.5 }; // the glow all round a little paler than the beam (warm where you look, cooler at the edges), a paler amber since pure amber turned every wall mustard. Candela: three's lights are physical since r155 (the yard's lamps run at 16). Decay 1.5, not 2, so a wall at arm's length doesn't blow out white
const DARK = { black: 0.25, breath: 1.05, drip: 1.5, match: 2.1, lit: 2.7 }; // seconds into the lights-out beat (unused: maze-dark.js has its own DARK)
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function registerMazeSfx(audio) {
  if (!audio?.registerSfx || audio._mazeSfx) return;
  audio._mazeSfx = true;
  const at = (a, x, y, z, ref = 4) => a.at(x, y, z, ref);
  audio.registerSfx('maze-drip', (a, x, y, z) => { const o = at(a, x, y, z, 6), t = a.ctx.currentTime; a.tone(o, { f: 1900 + Math.random() * 900, glide: 700, t, d: 0.09, peak: 0.07, type: 'sine' }); a.tone(o, { f: 420, glide: 300, t: t + 0.05, d: 0.25, peak: 0.02, type: 'sine', verb: 0.6 }); });
  audio.registerSfx('maze-breath', (a, x, y, z) => { const o = at(a, x, y, z, 2), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.9, type: 'lowpass', f: 900, Q: 0.6, peak: 0.07, attack: 0.35, brown: true }); a.burst(o, { t: t + 1.0, dur: 0.7, type: 'lowpass', f: 600, Q: 0.6, peak: 0.05, attack: 0.1, brown: true }); });
  audio.registerSfx('maze-match', (a, x, y, z) => { const o = at(a, x, y, z, 2), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.06, type: 'bandpass', f: 2600, Q: 2, peak: 0.16 }); a.burst(o, { t: t + 0.05, dur: 0.5, type: 'lowpass', f: 2400, Q: 0.7, peak: 0.08, attack: 0.03 }); a.burst(o, { t: t + 0.12, dur: 1.4, type: 'bandpass', f: 1500, Q: 0.5, peak: 0.025, attack: 0.3 }); });
  audio.registerSfx('maze-gate', (a, x, y, z) => { const o = at(a, x, y, z, 4), t = a.ctx.currentTime; for (let i = 0; i < 3; i++) a.burst(o, { t: t + i * 0.09, dur: 0.07, type: 'bandpass', f: 900 + i * 300, Q: 4, peak: 0.12 }); a.tone(o, { f: 180, glide: 120, t: t + 0.05, d: 0.5, peak: 0.04, type: 'triangle' }); });
}

export function createMazeScene(ctx, { seed, W = 30, H = 30, onOut, phone = false, inv = null, gates: gates0 = null, goal = null }) {
  const { THREE: T, renderer, ink, ui, audio, input, profile, net, camera: lobbyCam } = ctx;
  registerMazeSfx(audio);
  if (audio) audio.below = true; // audio.js makes no yard critters or game-area beds while you're below
  const maze = generate(seed, W, H);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG.color);
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
  const origin = new THREE.Vector3(L.x - W * CELL / 2, ORIGIN_Y, L.z - H * CELL / 2);
  const group = new THREE.Group(); group.name = 'maze'; group.position.copy(origin); scene.add(group);
  const kit = buildMazeKit(maze, group, { shadows: true, gates: false }); // the gates are maze-gates.js's: they shake and fall
  kit.exitStair.setNight(LIGHT.night || 0); // the garden past the door at the yard's hour
  const cam = new THREE.PerspectiveCamera(mazeFov(innerWidth / innerHeight), innerWidth / innerHeight, 0.08, 80); // maze-view.js
  scene.add(cam);

  // ---- the lights: a fixed set (the count never changes, so no material recompiles): the ambient, your lantern (a point for the
  // glow all round and a spot that casts the one shadow map, aimed where you look), three friends' lanterns, two torch lights
  const ambient = new THREE.AmbientLight(AMBIENT.color, AMBIENT.k); scene.add(ambient); // maze-fx.js dims it with the lights-out beat
  const lantern = new THREE.PointLight(LANTERN.fill, 0, LANTERN.dist, LANTERN.decay); scene.add(lantern);
  const spot = new THREE.SpotLight(LANTERN.color, 0, LANTERN.dist + 1, 1.0, 0.7, LANTERN.decay);
  spot.castShadow = true; spot.shadow.mapSize.set(512, 512); // the size, the softness and the cone per level: maze-fx.js SHADOW
  spot.shadow.bias = -0.0015; spot.shadow.normalBias = 0.02; spot.shadow.camera.near = 0.15; spot.shadow.camera.far = LANTERN.dist + 2;
  scene.add(spot); scene.add(spot.target);
  const friendLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(LANTERN.color, 0, 7, 2); scene.add(l); return l; });
  const torchLights = [0, 1].map(() => { const l = new THREE.PointLight('#ffb060', 0, 8, 1.6); scene.add(l); return l; });
  const candleLight = new THREE.PointLight('#ffcf7a', 0, 11, 1.5); scene.add(candleLight); // the candle at the top of the stair (it gutters out as you go down)
  candleLight.position.set(kit.stair.candle.x, kit.stair.candle.y, kit.stair.candle.z).add(origin);
  // torches with a colour of their own: the sigil's green, the cistern's cold blue, the daylight down the exit flight (placed and
  // flickered each frame by maze-fx.js)

  // ---- your body (shown in third person): your own look, a lantern in the hand
  const look = (inv && lookFor(inv)) || avatarLook(profile); // you go down as your investigator
  const body = new Human({ ...look, accessory: 'lantern' }); body.root.visible = false; group.add(body.root);
  if (inv) dressFor(body, inv); // their cloth, before the hand copies the sleeve
  // ---- the lantern in your hand (first person): your own right arm, copied from that body (your sleeve, your skin, your hand's
  // size), the hand closed round the lantern's bail, the lantern hanging from the fist (maze-hand.js. maze-fx.js shades the arm from
  // the glass and swings the lantern)
  const hand = buildLanternHand(body); cam.add(hand);
  dressLantern(body); // a glass you see the flame through, in third person. After the hand copied the arm, so the copy holds none of it
  hand.position.set(0.27, -0.06, -0.62); hand.rotation.set(0.05, -0.1, 0.02);

  // ---- the controller
  const sr = maze.startRoom;
  const me = { x: kit.stair.spawn.x, z: kit.stair.spawn.z, y: STAIR.top, yaw: kit.stair.spawn.yaw, pitch: kit.stair.spawn.pitch ?? 0.12, vx: 0, vz: 0, speed: 0, breath: 1, winded: false, run: false, wet: false, step: 0, bob: 0, turn: kit.stair.landU, inShaft: true, lastPhi: 0 }; me.turn = kit.stair.spawn.u ?? me.turn; // the spawn's own place on the landing
  me.lastPhi = Math.atan2(me.x - kit.stair.cx, me.z - kit.stair.cz);
  // crouched (crouchK eases it), the way your body faces (third person: the way you walk, first person: the look), how unsteady you
  // are (out of breath, a long run), a lurch to one side now and then (lurch: its time, -1 none)
  Object.assign(me, { crouch: false, crouchK: 0, face: me.yaw, unsteady: 0, runLong: 0, lurch: -1, lurchSide: 1, lurchKick: 0, lurches: 0, gx: 0, gy: 0, roll: 0 });
  const gait = { x: 0, y: 0, roll: 0 }, gseed = (Math.random() * 1e5) | 0;
  let lookT = 9; // seconds since you last turned the view yourself: third person's camera follows you only when you leave it be
  let reach = 1; // setReach
  let hold = null; // 'story' (the card in the dark: still), 'top' (the gathering: look, no walk), null: free
  let view = 'fp', phase = 'stair', darkT = 0, sentAt = 0, dripAt = 2, visAt = 0, exitT = 0, outDone = false, runHeld = false;
  let outYaw = 0, outWhite = false;
  const ER = maze.exitRoom, inExitRoom = (x, z) => x >= ER.x0 * CELL && x <= (ER.x1 + 1) * CELL && z >= ER.y0 * CELL && z <= (ER.y1 + 1) * CELL;
  const cellOf = (x, z) => [Math.max(0, Math.min(W - 1, Math.floor(x / CELL))), Math.max(0, Math.min(H - 1, Math.floor(z / CELL)))];
  const floorAt = (x, z, y) => {
    const f = kit.exitStair.floorAt(x, z, y); if (f !== null) return f; // y, so only someone already up there stands in the garden past the door
    const [cx, cy] = cellOf(x, z);
    return maze.water[cy * W + cx] ? WATER_Y : 0;
  };
  // the helix: track the unwound angle while you are in the shaft; the tread under you comes from it
  function shaftStep() {
    const st = kit.stair, dx = me.x - st.cx, dz = me.z - st.cz, r = Math.hypot(dx, dz), phi = Math.atan2(dx, dz);
    const inside = r < st.rOut + 0.3;
    if (inside && !me.inShaft) { me.turn = st.bottomU + 0.3; me.inShaft = true; me.lastPhi = phi; } // in from the room: the bottom
    if (!inside) { me.inShaft = false; return null; }
    let d = phi - me.lastPhi; d = Math.atan2(Math.sin(d), Math.cos(d));
    me.turn += d; me.lastPhi = phi; // the treads run round with the angle: the unwound angle grows as you go down
    return st.floorAt(me.turn);
  }
  function collide() {
    const [cx, cy] = cellOf(me.x, me.z);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      for (const b of kit.cellBoxes[y * W + x]) {
        if (me.y > 3 && !b.high && !b.circle) continue; // up the exit flight only its own walls hold you, the maze's are below
        if (b.circle) { const ddx = me.x - b.x, ddz = me.z - b.z, d = Math.hypot(ddx, ddz), min = b.r + RADIUS; if (d < min && d > 1e-5) { me.x = b.x + ddx / d * min; me.z = b.z + ddz / d * min; } continue; }
        if (me.x < b.minX - RADIUS || me.x > b.maxX + RADIUS || me.z < b.minZ - RADIUS || me.z > b.maxZ + RADIUS) continue;
        const qx = Math.max(b.minX, Math.min(b.maxX, me.x)), qz = Math.max(b.minZ, Math.min(b.maxZ, me.z));
        const ddx = me.x - qx, ddz = me.z - qz, d = Math.hypot(ddx, ddz);
        if (d > 1e-5 && d < RADIUS) { me.x = qx + ddx / d * RADIUS; me.z = qz + ddz / d * RADIUS; }
        else if (d <= 1e-5) { const o = [[me.x - b.minX, -1, 0], [b.maxX - me.x, 1, 0], [me.z - b.minZ, 0, -1], [b.maxZ - me.z, 0, 1]].sort((p, q) => p[0] - q[0])[0]; me.x += o[1] * (o[0] + RADIUS); me.z += o[2] * (o[0] + RADIUS); }
      }
    }
    // the shaft's round wall: solid both ways but for the opening at the bottom; the landing's end at the top
    const st = kit.stair, dx = me.x - st.cx, dz = me.z - st.cz, r = Math.hypot(dx, dz), phi = Math.atan2(dx, dz);
    const gap = Math.abs(Math.atan2(Math.sin(phi - (st.a0 + st.gapMid)), Math.cos(phi - (st.a0 + st.gapMid)))) < 0.5 && me.y < 0.6;
    const inner = st.rOut - RADIUS, outer = st.rOut + 0.6 + RADIUS;
    if (!gap && r > inner && r < outer && r > 1e-5) { const to = r - inner < outer - r ? inner : outer; me.x = st.cx + dx / r * to; me.z = st.cz + dz / r * to; }
    if (me.inShaft && me.turn < -1.05) { me.turn = -1.05; const a = st.a0 - 1.05; me.x = st.cx + Math.sin(a) * r; me.z = st.cz + Math.cos(a) * r; me.lastPhi = Math.atan2(me.x - st.cx, me.z - st.cz); } // the landing's end: the door behind you
  }
  // along a wall: the push-out's normal takes away the part of your speed that went into the wall (so it doesn't build up against
  // it), and a shallow brush (the wall within 50 degrees of the way you walk) keeps most of your pace along it instead of grinding to
  // the cosine of the angle. Head on (or near it) you stop
  function slide(px, pz, wx, wz) {
    const nx = me.x - px, nz = me.z - pz, n = Math.hypot(nx, nz);
    if (n < 1e-5) return;
    const ux = nx / n, uz = nz / n, vn = me.vx * ux + me.vz * uz;
    if (vn < 0) { me.vx -= ux * vn; me.vz -= uz * vn; }
    const w = Math.hypot(wx, wz), wn = wx * ux + wz * uz;
    if (w < 0.3 || wn >= 0) return;
    const tx = wx - ux * wn, tz = wz - uz * wn, tl = Math.hypot(tx, tz);
    if (tl < 0.64 * w) return;
    const vt = me.vx * tx / tl + me.vz * tz / tl, want = 0.92 * w;
    if (vt < want) { me.vx += tx / tl * (want - vt) * 0.5; me.vz += tz / tl * (want - vt) * 0.5; }
    me.speed = Math.hypot(me.vx, me.vz);
  }
  const ZERO = { x: 0, y: 0 };
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  function moveStep(dt) {
    const frozen = phase === 'dark' || phase === 'out' || !!ghoul?.frozen; // held while it has you
    const still = frozen || !!hold; // the story card and the gathering hold you at the top
    const fp = view === 'fp';
    // first person on a phone: the stick's push to a side mostly turns you (maze-touch.js turn), a little strafes
    const mv = still ? ZERO : touch.move(input.move(), fp ? STEER.strafe : 1, !fp);
    const lk = input.takeLook();
    if (lk.cycle) toggleView();
    if (!frozen && hold !== 'story' && (lk.x || lk.y)) { me.yaw -= lk.x * 0.0055; me.pitch = Math.max(-1.15, Math.min(1.15, me.pitch + lk.y * 0.004)); }
    const tl = touch.take(dt, frozen || hold === 'story'); me.yaw += tl.yaw; me.pitch += tl.pitch; // the phone's look (maze-touch.js)
    const looked = !!(lk.x || lk.y || tl.yaw || tl.pitch); lookT = looked ? 0 : lookT + dt;
    if (fp && !still) me.yaw -= touch.turn * STEER.turn * dt; // steer with the stick
    const pushRun = !still && (input.running || runHeld || touch.run) && Math.hypot(mv.x, mv.y) > 0.3;
    if (pushRun && me.crouch) setCrouch(false); // no running crouched: a push to run stands you up
    const wantRun = pushRun;
    if (me.winded && me.breath > BREATH.again) me.winded = false;
    me.run = wantRun && !me.winded && me.breath > BREATH.empty;
    if (wantRun && me.breath <= BREATH.empty) me.winded = true;
    me.breath = Math.max(0, Math.min(1, me.breath + (me.run ? -BREATH.drain : Math.hypot(mv.x, mv.y) > 0.3 ? BREATH.fill : BREATH.rest) * dt));
    // the crouch eases in and out. How unsteady you are (the breath spent, a long run), settling as you recover
    me.crouchK += ((me.crouch ? 1 : 0) - me.crouchK) * Math.min(1, dt * CROUCH.ease);
    me.runLong = me.run ? Math.min(1, me.runLong + dt / 8) : Math.max(0, me.runLong - dt / 6);
    me.unsteady += (unsteady(me.breath, me.runLong, me.winded) - me.unsteady) * Math.min(1, dt * 1.5);
    const lk2 = lurchStep(dt);
    const [cx, cy] = cellOf(me.x, me.z);
    me.wet = !!maze.water[cy * W + cx] && !kit.exitStair.floorAt(me.x, me.z) && !me.inShaft;
    const pk = goals?.paceK; // (the cask under your arm: a touch slower, maze-goals.js CARRY)
    const max = (me.run ? RUN * (pk ? pk.run : 1) : WALK * (pk ? pk.walk : 1)) * (me.wet ? WATER_K : 1) * (me.inShaft ? 0.72 : 1) * (me.crouch ? CROUCH.pace : 1) * (1 - 0.35 * lk2);
    // the screen's right is (-cos, sin) of the look, so a push to the right (the stick, D) walks you right
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), rx = -Math.cos(me.yaw), rz = Math.sin(me.yaw);
    let wx = fx * mv.y + rx * mv.x, wz = fz * mv.y + rz * mv.x;
    const want = Math.hypot(wx, wz);
    const acc = want > 0 ? ACC.go : ACC.stop; // quicker to get going, no slide on letting go
    me.vx += (wx * max - me.vx) * Math.min(1, dt * acc); me.vz += (wz * max - me.vz) * Math.min(1, dt * acc);
    if (lk2 > 0) { const sh = me.lurchSide * 0.8 * lk2; me.vx += rx * sh * dt * 6; me.vz += rz * sh * dt * 6; } // a lurch: a stagger to one side
    me.speed = Math.hypot(me.vx, me.vz);
    me.x += me.vx * dt; me.z += me.vz * dt;
    const preX = me.x, preZ = me.z;
    collide();
    slide(preX, preZ, wx * max, wz * max);
    if (!still) touch.assist(dt, mv, looked); // the look assist round the bends
    // third person goes the way you push: the body turns to face it, and the camera follows round behind you once you leave the view
    // alone (not when you walk back toward it). First person faces where you look
    if (fp) me.face = me.yaw;
    else {
      if (me.speed > 0.3 && want > 0.05) me.face += wrapA(Math.atan2(me.vx, me.vz) - me.face) * Math.min(1, dt * 12);
      const d = wrapA(me.face - me.yaw);
      if (!still && want > 0.2 && lookT > STEER.quiet && Math.abs(d) < 2.3) me.yaw += d * Math.min(1, dt * STEER.follow * Math.min(1, me.speed / 2));
    }
    const fl = shaftStep() ?? floorAt(me.x, me.z, me.y); // y
    me.y += (fl - me.y) * Math.min(1, dt * 14); if (Math.abs(fl - me.y) > 1.2) me.y = fl;
    // footsteps (stone, or wading, near silent crouched) and the bob the lantern swings on
    if (me.speed > 0.3) { const before = me.step; me.step += dt * (1.1 + me.speed * 0.42); if (Math.floor(before) !== Math.floor(me.step)) { mfx.step(me.wet, me.run, me.crouch); goals?.step(me.wet, me.run); } } // (goals: the cask sloshes)
    me.bob += dt * (me.speed > 0.3 ? 4 + me.speed * 1.4 : 2);
  }
  // a lurch now and then when you're unsteady and moving (more often the worse it is: at winded about one every two seconds), none
  // under reduced motion. Returns how far into one you are (0..1..0 over 0.55 s)
  function lurchStep(dt) {
    if (me.lurch >= 0) { me.lurch += dt; if (me.lurch > 0.55) me.lurch = -1; }
    else if (mfx.bobK && me.speed > 0.8 && me.unsteady > 0.25 && Math.random() < dt * 0.5 * me.unsteady * me.unsteady) {
      me.lurch = 0; me.lurchSide = Math.random() < 0.5 ? -1 : 1; me.lurchKick = me.lurchSide * (0.6 + 0.4 * me.unsteady); me.lurches++;
    }
    return me.lurch >= 0 ? Math.sin(Math.PI * me.lurch / 0.55) : 0;
  }
  // crouch or stand: E away from anything to use, C, Ctrl, the phone's crouch button (the E button when nothing is near)
  const canCrouch = () => (phase === 'maze' || phase === 'stair') && hold !== 'story' && !ghoul?.frozen;
  function setCrouch(on) { on = !!on; if (on === me.crouch) return; me.crouch = on; audio.ui?.('blip'); }

  // ---- the camera: your eyes (first person) or over your shoulder (third person, pulled in short of a wall)
  // the eye: lower crouched (CROUCH.eye), and the walk's bob, sway and roll by how unsteady you are (maze-sneak.js gaitAt), plus a
  // lurch's stagger. At rest and hard of breath the chest heaves a little. None of the sway under reduced motion.
  const eyeOut = { x: 0, y: 0, z: 0 };
  function eyeAt() {
    const mk = mfx.bobK, moving = me.speed > 0.3 ? Math.min(1, me.speed / 4) : 0, now = performance.now() / 1000;
    gaitAt(me.unsteady, me.bob, me.step, now, gseed, gait);
    const lk = me.lurch >= 0 ? Math.sin(Math.PI * me.lurch / 0.55) : 0;
    const heave = (1 - moving) * (1 - me.breath) * 0.012 * Math.sin(now * (me.winded ? 6.6 : 3.2));
    me.gy = (gait.y * moving + heave) * mk; me.gx = (gait.x * moving + me.lurchSide * 0.11 * lk) * mk; me.roll = (gait.roll * moving + me.lurchSide * 0.07 * lk) * mk;
    eyeOut.x = me.x - Math.cos(me.yaw) * me.gx; eyeOut.z = me.z + Math.sin(me.yaw) * me.gx;
    eyeOut.y = me.y + EYE + (CROUCH.eye - EYE) * me.crouchK + me.gy;
    return eyeOut;
  }
  function placeCamera() {
    const e = eyeAt(), cp = Math.cos(me.pitch);
    if (view === 'fp') {
      cam.position.set(e.x, e.y, e.z).add(origin);
      cam.lookAt(e.x + Math.sin(me.yaw) * cp + origin.x, e.y - Math.sin(me.pitch) + origin.y, e.z + Math.cos(me.yaw) * cp + origin.z);
      if (me.roll) cam.rotateZ(me.roll); // the head rolls with an unsteady stride
      return;
    }
    // third person: back along the look, down a little; stop short of any wall box on the way
    const bx = -Math.sin(me.yaw) * Math.cos(me.pitch * 0.6), by = Math.sin(Math.max(0.1, me.pitch * 0.6 + 0.2)), bz = -Math.cos(me.yaw) * Math.cos(me.pitch * 0.6);
    let d = TP_DIST;
    const [cx, cy] = cellOf(me.x, me.z);
    for (let k = 1; k <= 10; k++) {
      const t = TP_DIST * k / 10, px = e.x + bx * t, pz = e.z + bz * t, py = e.y + by * t;
      const hall = inExitRoom(px, pz); // the exit room is a tall chamber
      let hit = py > (hall ? kit.exitStair.hall : WALL_H) - 0.1 || py < floorAt(px, pz, e.y) + 0.2;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; for (const b of kit.cellBoxes[y * W + x]) if (!b.circle && !(py > 3.3 && !b.high) && px > b.minX - 0.2 && px < b.maxX + 0.2 && pz > b.minZ - 0.2 && pz < b.maxZ + 0.2) { hit = true; break; } }
      if (hit) { d = Math.max(0.6, t - TP_DIST / 10); break; }
    }
    cam.position.set(e.x + bx * d, e.y + by * d, e.z + bz * d).add(origin);
    cam.lookAt(e.x + Math.sin(me.yaw) * 0.8 + origin.x, e.y - 0.3 + origin.y, e.z + Math.cos(me.yaw) * 0.8 + origin.z);
  }
  function toggleView() {
    view = view === 'fp' ? 'tp' : 'fp';
    me.face = me.yaw; // the body faces where you were looking
    hand.visible = view === 'fp'; body.root.visible = view === 'tp';
    btnView.dataset.view = view; btnView.setAttribute('aria-label', view === 'fp' ? 'First person' : 'Third person');
    audio.ui?.('blip');
  }

  // ---- the others in your run: a body each with a lantern, interpolated, a name tag that fades with the fog
  const remotes = new Map();
  function addRemote(m) {
    if (remotes.has(m.sid) || m.sid === net.sid) return;
    const lr = ctx.remotes.map.get(m.sid);
    const h = new Human({ ...((m.inv && lookFor(m.inv)) || remoteLook(lr, m)), accessory: 'lantern' }); // their whole look, as the yard builds them (net.js Remotes.build), or their investigator's
    if (m.inv) dressFor(h, m.inv);
    dressLantern(h); // their flame in a glass you see through
    h.root.position.set(m.x || 0, 0, m.z || 0); h.root.rotation.y = m.r || 0; // in the group: the maze's own frame
    group.add(h.root);
    const vis = seenBy(h), tag = ui.nameTag(vis, m.name, m.color); tag.max = 9; tag.fade = 5.5;
    remotes.set(m.sid, { sid: m.sid, name: m.name, inv: m.inv || null, h, vis, tag, tx: m.x || 0, tz: m.z || 0, tr: m.r || 0, k: 0, speed: 0, ax: m.x || 0, az: m.z || 0, at: 0, src: lr?.ch || null });
  }
  // what a friend's name tag and speech bubble hang on: an empty child of their body that's "visible" only while no stone stands
  // between your eyes and them (ui.js hides an item whose object isn't visible). A grid line of sight from the camera to them and to
  // either side of them (a shoulder round a corner still counts), every frame (stepRemotes)
  const sight = createField(maze);
  function seenBy(h) { const v = new THREE.Object3D(); v.name = 'mz-seen'; v.userData.tagAnchor = h.root.userData.tagAnchor; h.root.add(v); return v; }
  // a line from the eye to them that crosses the helix shaft's round shell (not on the grid) is blocked, unless it crosses in the
  // opening at the shaft's foot
  const SH = kit.stair, SHR = SH.rOut + 0.3, SHGAP = SH.a0 + SH.gapMid;
  function shaftBetween(ex, ez, ey, x, z, y) {
    const ia = Math.hypot(ex - SH.cx, ez - SH.cz) < SHR, ib = Math.hypot(x - SH.cx, z - SH.cz) < SHR;
    if (ia === ib) return false;
    const dx = x - ex, dz = z - ez, fx = ex - SH.cx, fz = ez - SH.cz, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - SHR * SHR;
    const disc = Math.sqrt(Math.max(0, b * b - 4 * a * c)), t1 = (-b - disc) / (2 * a), t2 = (-b + disc) / (2 * a), t = t1 >= 0 && t1 <= 1 ? t1 : t2;
    const px = ex + dx * t, pz = ez + dz * t, py = ey + (y - ey) * t, d = Math.atan2(Math.sin(Math.atan2(px - SH.cx, pz - SH.cz) - SHGAP), Math.cos(Math.atan2(px - SH.cx, pz - SH.cz) - SHGAP));
    return !(Math.abs(d) < 0.62 && py < 3.0);
  }
  function inSight(x, z, y = 0) {
    const ex = cam.position.x - origin.x, ez = cam.position.z - origin.z, dx = x - ex, dz = z - ez, L = Math.hypot(dx, dz);
    if (shaftBetween(ex, ez, cam.position.y - origin.y, x, z, y + 1.6)) return false;
    if (L < 1.2) return true;
    const ox = -dz / L * 0.32, oz = dx / L * 0.32;
    return sight.los(ex, ez, x, z) || sight.los(ex, ez, x + ox, z + oz) || sight.los(ex, ez, x - ox, z - oz);
  }
  // their chat below: a bubble over their body down here (main.js puts one on their body in the yard, far above and never drawn)
  const offChat = net.on?.('chat', m => { const r = remotes.get(m.sid); if (!r) return; const b = ui.say(r.vis, m.text, 6, 2.3); b.max = 14; b.fade = 9; });
  // a friend's look comes from the yard's copy of them (the run's messages carry only a name and a colour). If that wasn't there yet
  // when they came down, or they change their look while below, they're built again in it (checked once a second)
  const remoteLook = (lr, m) => avatarLook(lr ? { color: lr.color, hat: lr.hat, skin: lr.skin, look: lr.look } : { color: m.color });
  function refreshRemote(r) {
    const lr = ctx.remotes.map.get(r.sid);
    if (!lr || lr.ch === r.src || r.h.root.rotation.x !== 0 || r.inv) return; // not while one lies taken. An investigator's look doesn't follow the yard's
    const h = new Human({ ...remoteLook(lr, r), accessory: 'lantern' });
    h.root.position.copy(r.h.root.position); h.root.rotation.y = r.h.root.rotation.y;
    group.remove(r.h.root); r.h.dispose?.(); r.tag.remove(); dropBubbles(r);
    dressLantern(h);
    group.add(h.root); r.h = h; r.src = lr.ch; r.vis = seenBy(h);
    r.tag = ui.nameTag(r.vis, r.name, lr.color); r.tag.max = 9; r.tag.fade = 5.5;
  }
  let refreshAt = 0;
  const dropBubbles = r => { for (const it of ui.items) if (it.bubbleFor === r.vis) it.remove(); };
  function removeRemote(sid) {
    const r = remotes.get(sid); if (!r) return;
    remotes.delete(sid); r.tag.remove(); dropBubbles(r);
    // a friend who went out through the door: they walk on into the garden and step aside out of the doorway's sight
    const [u] = kit.exitStair.local(r.ax, r.az);
    if (!gone && u > kit.exitStair.uMid - 0.3 && r.h.root.position.y > 3) { r.out = 0; leaving.push(r); walkedOut++; return; }
    group.remove(r.h.root); r.h.dispose?.();
  }
  const leaving = []; let walkedOut = 0;
  function stepLeaving(dt, now) {
    for (let i = leaving.length - 1; i >= 0; i--) {
      const r = leaving[i], E = kit.exitStair; r.out += dt;
      const turn = r.out > 0.45, dx = turn ? E.side.x : E.dir.x, dz = turn ? E.side.z : E.dir.z;
      r.ax += dx * 2.2 * dt; r.az += dz * 2.2 * dt;
      r.h.root.position.set(r.ax, E.topY, r.az);
      const want = Math.atan2(dx, dz), ry = r.h.root.rotation.y; r.h.root.rotation.y = ry + Math.atan2(Math.sin(want - ry), Math.cos(want - ry)) * Math.min(1, dt * 8);
      r.h.update(dt, now, 2.2, null);
      if (r.out > 2.2) { group.remove(r.h.root); r.h.dispose?.(); leaving.splice(i, 1); }
    }
  }
  function remotePos(m) { const r = remotes.get(m.sid); if (!r) return; r.tx = m.x; r.tz = m.z; r.tr = m.r; r.k = m.k; r.c = !!m.c; r.w = !!m.w; r.at = performance.now(); } // c crouched, w winded
  const pant = breathPlan(0, true, 1, {}); // a friend out of breath, heard from where they are in their own voice
  function stepRemotes(dt, now) {
    if (now - refreshAt > 1) { refreshAt = now; for (const r of remotes.values()) refreshRemote(r); }
    for (const r of remotes.values()) {
      const p = r.h.root.position, k = Math.min(1, dt * 9);
      const nx = r.ax + (r.tx - r.ax) * k, nz = r.az + (r.tz - r.az) * k;
      const moved = Math.hypot(nx - r.ax, nz - r.az);
      r.speed += ((dt > 0 ? moved / dt : 0) - r.speed) * Math.min(1, dt * 6);
      r.ax = nx; r.az = nz;
      p.set(nx, floorAt(nx, nz, p.y), nz);
      const ry = r.h.root.rotation.y; r.h.root.rotation.y = ry + Math.atan2(Math.sin(r.tr - ry), Math.cos(r.tr - ry)) * Math.min(1, dt * 10);
      r.h.update(dt, now, r.speed, r.c ? 'crouch' : null); // crouched, you see them crouch
      r.vis.visible = inSight(nx, nz, p.y); // the tag and the bubble only where you could see them
      if (r.w && Math.hypot(nx - me.x, nz - me.z) < 14) { r.breathT = (r.breathT ?? 0) - dt; if (r.breathT <= 0) { r.breathT = pant.period * (0.7 + Math.random() * 0.6); aud.breathe(pant, voiceFor(r.inv), { x: nx, z: nz }); } }
    }
  }

  // ---- the HUD below: a breath sliver and the distance line, a run button and a view button on a phone
  const hud = el('div', 'mz-hud', '');
  const breathBar = el('div', 'mz-breath'), breathFill = el('div', 'mz-breath-fill'); breathBar.append(breathFill);
  const distLine = el('div', 'mz-dist', '');
  hud.append(distLine); ctx.hud.append(breathBar, hud); // (hud-loose: the bar is a HUD item of its own, the line and the goal strip another: --breath-*, --distance-*)
  const btnRun = el('button', 'mz-run', 'RUN', { type: 'button', 'aria-label': 'Run (hold)' });
  const btnView = el('button', 'mz-view', '', { type: 'button', 'aria-label': 'First person', title: 'First person or third person (F)' });
  btnView.append(el('span', 'mz-view-ico', ''));
  ctx.hud.append(btnRun, btnView);
  btnRun.addEventListener('pointerdown', e => { e.preventDefault(); runHeld = true; btnRun.classList.add('on'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btnRun.addEventListener(ev, () => { runHeld = false; btnRun.classList.remove('on'); });
  btnView.addEventListener('click', e => { e.preventDefault(); toggleView(); btnView.blur(); });
  ctx.hud.classList.toggle('mz-touch', !!phone);
  let lastDist = -1, lastBreath = -1;
  // the distance line counts to the doorway at the top of the exit flight, the whole way: up the flight, across the exit room to
  // the flight's foot, and before that along the path (each cell's metres to the doorway through the cells on the way)
  const ES = kit.exitStair, footU = -0.6, flightM = ES.uMid - footU;
  const toWay = (() => {
    const t = new Float32Array(W * H).fill(1e9), q = [];
    for (let y = ER.y0; y <= ER.y1; y++) for (let x = ER.x0; x <= ER.x1; x++) { t[y * W + x] = Math.hypot(x * CELL + 2 - ES.foot.x, y * CELL + 2 - ES.foot.z) + flightM; q.push(y * W + x); }
    for (let i = 0; i < q.length; i++) { const c = q[i], x = c % W, y = (c - x) / W; for (const [dx, dy, bit] of DIRS) { if (maze.cells[c] & bit) continue; const n = (y + dy) * W + x + dx; if (t[c] + CELL < t[n] - 1e-3) { t[n] = t[c] + CELL; q.push(n); } } }
    return t;
  })();
  function wayLeft() {
    const onFlight = ES.toDoor(me.x, me.z); if (onFlight !== null) return onFlight;
    if (inExitRoom(me.x, me.z)) return Math.hypot(me.x - ES.foot.x, me.z - ES.foot.z) + flightM;
    const [cx, cy] = cellOf(me.x, me.z), c = cy * W + cx; let best = -1, bt = toWay[c];
    for (const [dx, dy, bit] of DIRS) { if (maze.cells[c] & bit) continue; const n = (cy + dy) * W + cx + dx; if (toWay[n] < bt) { bt = toWay[n]; best = n; } }
    if (best < 0) return toWay[c] >= 1e8 ? -1 : toWay[c];
    return bt + Math.hypot(me.x - ((best % W) * CELL + 2), me.z - (Math.floor(best / W) * CELL + 2));
  }
  let lastLabel = '';
  function paintHud() {
    // the line points at the next thing to do: the nearest thing of the week's goal still to find (maze-goals.js), then the way out
    const tg = phase === 'maze' && goals ? goals.target() : null, label = tg ? tg.label : 'the way out';
    const m = phase === 'stair' ? -1 : phase === 'out' ? 0 : tg && tg.m !== null ? Math.round(tg.m) : Math.round(wayLeft());
    if (m !== lastDist || label !== lastLabel) { lastDist = m; lastLabel = label; distLine.textContent = m < 0 ? '' : `${m} m to ${label}`; }
    const b = Math.round(me.breath * 100);
    if (b !== lastBreath) { lastBreath = b; breathFill.style.width = b + '%'; breathBar.classList.toggle('low', me.winded); }
  }

  // ---- the lights each frame, the air, the wet, the sound: maze-fx.js places and flickers every light, swings the
  // hand's lantern, and drives the motes, drips, puffs and the composite; maze-audio.js is the bed, your steps and the drone
  let lit = 0;
  const aud = createMazeAudio(audio, { maze, kit, origin, phone, remotes }); // the space's echo, the walls between, your friends' steps
  aud.voice = voiceFor(inv); // your breath and cries in your investigator's voice
  // Ctrl crouches too (input.js keeps Ctrl for the browser's shortcuts: it never reaches handleKeys)
  function onCtrl(e) { if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat && ctx.below === api && !input.typing && !input.overlayOpen && canCrouch()) setCrouch(!me.crouch); }
  addEventListener('keydown', onCtrl);
  // your mic sending right now (voice.js): 1 talking, 2 a shout. The ghoul hears it as a noise where you are
  let voiceF = null;
  function talking() { if (!voiceF) voiceF = ctx.features?.find(f => f.name === 'voice') || 0; const v = voiceF?.api; return v?.tx ? (v.loud ? 2 : 1) : 0; }
  // a cry in a voice when the ghoul has someone: yours, or a friend's from where they are (maze-ghoul.js calls it)
  function vocal(kind, sid = null, secs) {
    if (sid && sid !== net.sid) { const r = remotes.get(sid); if (r) aud.vocal(kind, voiceFor(r.inv), { x: r.ax, z: r.az }, secs); return; }
    aud.vocal(kind, voiceFor(inv), null, secs);
  }
  const mfx = createMazeFx({ scene, cam, group, origin, kit, maze, renderer, ink, me, hand, lantern, spot, friendLights, torchLights, candleLight, aud, phone, LANTERN, ambient, FOG, AMBIENT });
  const fxSt = { view, body, remotes, phase, lit, wick: 0 }; // wick: the lantern's own flame, none on the stair or while only the match burns
  const flames = createMazeFlames({ kit, group, maze }); // after the halos, whose stair candle it follows
  fxSt.flames = flames; // the lanterns' own flames are instances of the same mesh, maze-fx.js places them
  const gates = createMazeGates(ctx, { maze, kit, group, origin, aud, cam, me, getFx: () => mfx.api, gates0 });
  // the phone's controls below and the look assist, and the lights-out beat
  const touch = createMazeTouch(ctx, { me, maze, kit, CELL, phase: () => phase });
  const dark = createMazeDark(ctx, { cam, audio: aud }); // the breath, the drip and the match through the stone's echo

  // ---- the beats: the lights out at the bottom of the stair, the way out at the top of the flight
  function beats(dt, now) {
    if (phase === 'stair' && me.inShaft && me.turn > kit.stair.bottomU - 0.4 && me.y < 0.4) {
      phase = 'dark'; darkT = 0; ui.el.fade.style.background = '#000'; ui.fade(1, 220); me.vx = me.vz = 0;
    } else if (phase === 'dark') {
      // the breath, the heartbeat, the drip, the match and the lantern coming up slowly: maze-dark.js
      if (darkT === 0) dark.reset();
      darkT += dt; lit = dark.step(dt);
      if (dark.done) { phase = 'maze'; lit = 1; ui.el.fade.style.background = ''; }
    } else if (phase === 'maze' && (!goals || goals.open) && kit.exitStair.out(me.x, me.z, me.y)) {
      phase = 'out'; exitT = 0; me.vx = me.vz = 0; outYaw = kit.exitStair.yaw; // over the threshold, not near it (and only with the week's goal met: the door is shut until then)
    } else if (phase === 'out') {
      // no vanishing: the walk carries you on through the door and out onto the grass, your head coming up to the sky, the daylight
      // blooming (the exposure up, then a warm white), and the yard comes up out of the same white (maze.js)
      exitT += dt;
      const ES2 = kit.exitStair, sp = OUT.pace * Math.min(1, 0.6 + exitT * 2);
      me.x += ES2.dir.x * sp * dt; me.z += ES2.dir.z * sp * dt; me.y += (ES2.topY - me.y) * Math.min(1, dt * 10); me.speed = sp;
      let dy = outYaw - me.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); me.yaw += dy * Math.min(1, dt * 2.5);
      me.pitch += (OUT.pitch - me.pitch) * Math.min(1, dt * 2.2);
      { const before = me.step; me.step += dt * (1.1 + sp * 0.42); if (Math.floor(before) !== Math.floor(me.step)) mfx.step(false, false); }
      if (exitT > OUT.white && !outWhite) { outWhite = true; ui.el.fade.style.background = '#fff3d6'; ui.fade(1, OUT.fade); }
      if (exitT > OUT.secs && !outDone) { outDone = true; onOut('exit'); }
    }
    // drips now and then: maze-fx.js shows the near ones land, maze-audio.js places the far ones round you
  }
  const onLanding = () => (phase === 'stair' || phase === 'maze') && me.inShaft && me.turn < -0.2 && me.y > STAIR.top - 0.2; // the way back up: the landing, going down or climbed back to
  const nearGate = () => gates.near(me.x, me.z); // the gate you stand at, -1 none (maze-gates.js)

  // ---- one frame below (main.js: ctx.below.frame)
  const saved = { fadeNear: ink.uniforms.uFadeNear.value, fadeFar: ink.uniforms.uFadeFar.value, inkW: ink.uniforms.uInkW?.value, before: ink.beforePasses, after: ink.afterPasses, exposure: renderer.toneMappingExposure };
  let hintWas = null, quietWas = false, crouchWas = false, eHeld = 0;
  function frame(dt, now) {
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.fov = mazeFov(cam.aspect); cam.updateProjectionMatrix(); } // wider on a tall screen
    moveStep(dt);
    beats(dt, now);
    stepRemotes(dt, now); stepLeaving(dt, now);
    if (view === 'tp') { body.root.position.set(me.x, me.y, me.z); body.root.rotation.y = me.face; body.root.rotation.z = me.roll * 0.8; body.update(dt, now, me.speed, me.crouch ? 'crouch' : null); } // in the group: the maze's own frame. Facing the way you walk, crouched, swaying when unsteady
    placeCamera();
    fxSt.view = view; fxSt.phase = phase; fxSt.lit = lit; fxSt.wick = phase === 'stair' ? 0 : phase === 'dark' ? dark.wick : 1; mfx.update(dt, now, fxSt);
    flames.update(now);
    if (now - visAt > 0.2) { visAt = now; kit.setVisible(me.x, me.z); }
    paintHud();
    // the E prompt: back up at the landing, a locked gate, or away from anything to use, quietly, "E  Crouch" / "E  Stand up" (on a
    // phone the E button wears a crouch icon then: css/maze.css #hud.mz-crouch-act)
    let hint = null, quiet = false, gh = null;
    if (onLanding() && !hold) hint = 'E  Back up to the house'; // the gathering has its own Back up
    else if (phase === 'maze' && !ghoul?.frozen && goals && (gh = goals.hint())) hint = gh; // a thing of the week's goal within reach, the beacon
    else if (phase === 'maze' && nearGate() >= 0 && !ghoul?.frozen) hint = 'E  Rattle the gate'; // it shakes and clanks. Keep at it and something comes
    else if (canCrouch() && !hold) { hint = me.crouch ? 'E  Stand up' : 'E  Crouch'; quiet = true; }
    if (hint !== hintWas || (hint && ui.el?.hint?.hidden)) { hintWas = hint; ui.hint(hint); } // again if something else cleared it (the yard's 6 s walk hint after a first join, a grab)
    if (quiet !== quietWas) { quietWas = quiet; ctx.hud.classList.toggle('mz-crouch-act', quiet); }
    if (me.crouch !== crouchWas) { crouchWas = me.crouch; ctx.hud.classList.toggle('mz-crouched', me.crouch); }
    ctx.hudLayout?.update?.(dt); // the E button lights with what it does (main.js doesn't run the yard's HUD below)
    // a held E at a gate (the key, the phone's button, the pad's A) rattles it again and again
    const gi = phase === 'maze' && !ghoul?.frozen ? nearGate() : -1;
    if (gi >= 0 && input.down?.has('KeyE')) { eHeld += dt; if (eHeld >= 0.3) { eHeld -= 0.26; gates.rattle(gi); } } else eHeld = 0;
    gates.update(dt, now);
    goals?.frame(dt, now); // the week's goal: the things, the scout, the seal, the leaf, the beacon
    // positions to the run's other members at 10 Hz
    if (now - sentAt > 0.1) { sentAt = now; net.send({ t: 'maze', op: 'p', x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.face.toFixed(3), k: me.run ? 1 : 0, c: me.crouch ? 1 : 0, w: me.winded ? 1 : 0, v: talking() }); } // crouched, winded, your mic sending: the ghoul hears talking
    ghoul?.frame(dt, now); // the ghoul, its sounds, a grab's camera, hiding: maze-ghoul.js
    abil?.frame(dt, now); // the Librarian's map, the Mystic's heart
    // the draw: the maze's own fog and ink, the one shadow map from the spot (three draws it in the colour pass: needsUpdate is set there)
    renderer.toneMappingExposure = phase === 'out' ? 1 + OUT.bloom * Math.min(1, exitT / OUT.secs) ** 2 : 1.0; // the daylight blooms as you go through
    ink.beforePasses = null; ink.afterPasses = null;
    const u = ink.uniforms; u.uFadeNear.value = 5 * reach; u.uFadeFar.value = 12 * reach; /* the Detective sees further */ if (u.uInkW) u.uInkW.value = 1.7; u.uInkAmt.value = 1.0; u.uSat.value = 0.82; u.uWarmth.value = 0.0; u.uInk.value.set('#04050a'); if (u.uDarkLift) u.uDarkLift.value = 0;
    audio.update(dt, now, cam, { x: cam.position.x, y: cam.position.y, z: cam.position.z });
    ui.update(cam, innerWidth, innerHeight);
    ink.render(scene, cam);
  }
  function onKey(code) {
    if (code === 'KeyF') { toggleView(); return true; }
    if (code === 'KeyE') {
      if (onLanding()) { onOut('stair'); return true; }
      if (phase === 'maze' && !ghoul?.frozen && goals?.onE()) return true; // a thing of the week's goal taken, the beacon lit (the server has the word)
      const g = phase === 'maze' && !ghoul?.frozen ? nearGate() : -1;
      if (g >= 0) { gates.rattle(g); return true; } // the gate shakes and clanks. The server hears it, and counts
      if (canCrouch()) setCrouch(!me.crouch); // nothing near: E crouches and stands. The yard's E never fires from below
      return true;
    }
    if (code === 'KeyC') { if (canCrouch()) setCrouch(!me.crouch); return true; }
    if (code === 'Space') return true; // (no jumping in the dark)
    return false;
  }
  function dispose() {
    gone = true; ghoul?.dispose(); ghoul = null;
    abil?.dispose(); abil = null;
    goals?.dispose(); goals = null;
    ui.hint(null);
    ink.beforePasses = saved.before; ink.afterPasses = saved.after;
    ink.uniforms.uFadeNear.value = saved.fadeNear; ink.uniforms.uFadeFar.value = saved.fadeFar; if (ink.uniforms.uInkW) ink.uniforms.uInkW.value = saved.inkW; if (ink.uniforms.uDarkLift) ink.uniforms.uDarkLift.value = 1;
    renderer.toneMappingExposure = saved.exposure;
    for (const sid of [...remotes.keys()]) removeRemote(sid);
    for (const r of leaving.splice(0)) { group.remove(r.h.root); r.h.dispose?.(); }
    offChat?.(); if (audio) audio.below = false;
    body.dispose?.(); group.remove(body.root);
    kit.dispose();
    hud.remove(); breathBar.remove(); btnRun.remove(); btnView.remove(); ctx.hud.classList.remove('mz-touch', 'mz-crouch-act', 'mz-crouched');
    removeEventListener('keydown', onCtrl);
    touch.dispose();
    hand.userData.dispose?.(); // the lantern's geometry, the arm's copied materials
    spot.shadow.map?.dispose();
    mfx.dispose(); aud.dispose();
    flames.dispose();
    gates.dispose();
  }

  kit.setVisible(me.x, me.z);
  hand.visible = true;
  const api = {
    maze, scene, cam, kit, group, origin, me, remotes, frame, onKey, dispose, addRemote, removeRemote, remotePos, toggleView,
    fx: mfx.api, atmos: { fx: mfx, aud }, // scene.fx is the ghoul's hook into the atmosphere (docs/CONTRACTS.md), atmos is for the tests
    get phase() { return phase; }, get view() { return view; }, get lit() { return lit; },
    get hold() { return hold; }, set hold(v) { hold = v || null; }, touch, dark,
    flames,
    gates,
    // the crouch (setCrouch for tests and the Ctrl key), and how the body is doing
    setCrouch, get crouched() { return me.crouch; }, vocal,
    get sneak() { return { crouch: me.crouch, crouchK: me.crouchK, eye: cam.position.y - origin.y - me.y, unsteady: me.unsteady, lurches: me.lurches, gy: me.gy, gx: me.gx, roll: me.roll, face: me.face, yaw: me.yaw, lookT, talking: talking() }; },
    get pos() { return { x: me.x, y: me.y, z: me.z, yaw: me.yaw, cell: cellOf(me.x, me.z), wet: me.wet, speed: me.speed, run: me.run, breath: me.breath, winded: me.winded, turn: me.turn, inShaft: me.inShaft }; },
    // tests: put yourself somewhere in the maze's frame (cell middles are cx * 4 + 2), skip a beat, read the HUD
    place(x, z, yaw = me.yaw) { me.x = x; me.z = z; me.yaw = yaw; me.vx = me.vz = 0; me.inShaft = false; me.y = floorAt(x, z); kit.setVisible(x, z); },
    skipStair() { if (phase === 'stair') { me.inShaft = false; this.place(kit.stair.cx + 3.2, kit.stair.cz, me.yaw); phase = 'dark'; darkT = 0; ui.el.fade.style.background = '#000'; ui.fade(1, 50); } },
    get leaving() { return leaving.length; }, get walkedOut() { return walkedOut; }, // friends walking on out of the door's sight
    get hud() { return { breath: breathFill.style.width, dist: distLine.textContent, winded: breathBar.classList.contains('low') }; },
    get lights() { return { lantern: lantern.intensity, spot: spot.intensity, shadow: spot.castShadow, friends: friendLights.map(l => l.intensity), torches: torchLights.map(l => l.intensity), candle: candleLight.intensity }; },
  };
  // the ghoul: loaded below only (never by the yard), handed this scene. It reads your body, the hand and the way out
  let ghoul = null, gone = false, abil = null, goals = null;
  Object.assign(api, { body, hand, onOut, inSight });
  Object.defineProperty(api, 'ghoul', { get: () => ghoul });
  import('./maze-ghoul.js').then(m => { if (!gone) ghoul = m.createMazeGhoul(ctx, api); }).catch(e => console.error('[maze] could not load the ghoul', e));
  // the light's reach (the Detective: 15% his, 8% the party's while he's below and not taken) and the abilities
  function setReach(k) {
    reach = k > 0 ? k : 1;
    lantern.distance = LANTERN.dist * reach; spot.distance = (LANTERN.dist + 1) * reach;
    spot.shadow.camera.far = LANTERN.dist * reach + 2; spot.shadow.camera.updateProjectionMatrix();
    scene.fog.near = FOG.near * reach; scene.fog.far = FOG.far * reach; // and the fog stands back as far
  }
  Object.assign(api, { inv, setReach, setParty: list => abil?.setParty(list) });
  Object.defineProperty(api, 'abilities', { get: () => abil });
  Object.defineProperty(api, 'reach', { get: () => reach });
  abil = createAbilities(ctx, api, { inv });
  // the week's goal (maze-goals.js): the server's state came with the run's enter message
  Object.defineProperty(api, 'goals', { get: () => goals });
  try { goals = createMazeGoals(ctx, api, { state: goal }); } catch (e) { console.error('[maze] the goal could not be built', e); }
  return api;
}
