// Scenic views: sit in a view seat and you see it through your own eyes. The camera sits at your eyes looking at the scene (the
// fire, or out over the lake), your own body hidden so nothing blocks it, and you can turn your head about as far as a head turns
// (HEAD_YAW either way, a little up and down) with the mouse, a finger or the right stick, to look at friends. No free swing. It
// feels like the game store's chairs and the porch swing: the eye in front of the face, the same look speed, and getting up hands
// the follow camera back behind the way you looked.
//
// Views: the lakeside firepit (its seats are firepit.js's: hooks.camera / onSit / onStand) and the lake bench on the shore of Lake
// Rufallia (scenic-bench.js). While you sit in one:
//   - a cone behind your head is hidden, for you only (shadows.js `behind`: left out of the camera's passes and the sun's map)
//   - the graphics go up (gfx.js setView: a sharper sun shadow, finer lamp maps, the fire's shadow at night) and the ink lines
//     reach further, all put back after
//   - the HUD goes quiet (scenic.css: the minimap, quests, money, tools, emotes and jump tuck away; the chat, the voice button and
//     the E to get up stay) and a camera button takes the minimap's place: photos (scenic-photo.js)
// A small "Take in the view" label floats over each view when you come near (ui.add, an area label). The community board in
// Strickler Park (photo-board.js) shows the pictures players share.
//
// feature.api (tests): view (null | { kind, seat, turn, tilt }), views, enter(kind, seat), leave(), look(turn, tilt),
// HEAD_YAW, PITCH, cone(), bench, photo, board.
import * as THREE from 'three';
import { GFX, setView } from './gfx.js';
import { loadCss, clamp } from './util.js';
import { createBench } from './scenic-bench.js';
import { createPhoto } from './scenic-photo.js';
import { createPhotoBoard } from './photo-board.js';

const DEG = Math.PI / 180;
export const HEAD_YAW = 70 * DEG;                 // how far you can turn the view either way (a head's turn)
export const PITCH = { up: 0.3, down: 0.35 };    // and up / down from where the view rests (radians)
const LOOK_K = { x: 0.0055, y: 0.004 };          // radians per pixel of drag (the store's and the porch swing's)
const EYE_FWD = 0.14;                            // the eye this far in front of the head's middle (the store's: not inside the head)
const BLEND_IN = 0.9;                            // seconds from the follow camera to the view
const BLEND_OUT = 0.8;                           // and back
const NEAR_KEEP = 2.5;                           // the cone never hides anything within this of the camera
const MARGIN = 12 * DEG;                         // the cone starts this far past the widest view
// Where each view rests its eyes: the firepit on the fire's middle, `aimY` above its flame line (the flames, the people round
// them and the trees behind); the bench `far` metres out over the water, `aimY` from the seat's ground (just below the far shore).
const FRAMING = {
  firepit: { aimY: 0.45 },
  bench: { far: 40, aimY: -1.2 },
};
// the photo camera's selfie: in front of you (turning round you with your look), a little up and to your right, looking at
// your face and shoulders, so a pose shows (scenic-photo.js); your body shows again for it
const SELFIE = { dist: 1.75, up: 0.28, side: 0.32, aimY: -0.3 };
// the ink lines reach further while you sit and look (toon.js composite: they fade out between these, metres)
const INK_FADE = { near: 95, far: 320 };

export function createScenic(ctx) {
  const { player, ui, input, hud, camera, net } = ctx;
  loadCss('/css/scenic.css');
  const v3 = () => new THREE.Vector3();
  const pivot = v3(), want = v3(), aim = v3(), dir = v3(), tmp = v3(), fromPos = v3();
  const fromQ = new THREE.Quaternion(), toQ = new THREE.Quaternion();
  let view = null;                 // { kind, seat, yaw0, pitch0, turn, tilt, t, blend }
  let firepit = null;              // firepit.js's feature (found on the first update: ctx.features is set after the makers run)
  const marks = [];                // the "Take in the view" labels
  const extras = { fov: null, roll: 0, selfie: false }; // the photo camera's zoom, tilt and selfie (scenic-photo.js)
  const FOV0 = camera.fov;

  // ---- the quiet HUD: a camera button in the minimap's place
  const box = document.createElement('div');
  box.className = 'scenic-hud'; box.hidden = true;
  const camBtn = document.createElement('button');
  camBtn.type = 'button'; camBtn.className = 'scenic-cam'; camBtn.setAttribute('aria-label', 'Take a photo');
  camBtn.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="14" width="36" height="25" rx="6" fill="#fff4dc" stroke="#2b2340" stroke-width="3.2"/><path d="M17 14 l3-5 h8 l3 5" fill="#fff4dc" stroke="#2b2340" stroke-width="3.2" stroke-linejoin="round"/><circle cx="24" cy="26.5" r="7.5" fill="#3f8fd9" stroke="#2b2340" stroke-width="3.2"/><circle cx="21.5" cy="24" r="2.2" fill="#fff"/><circle cx="36" cy="19.5" r="1.8" fill="#e0463c"/></svg><span class="kc">P</span><span class="scenic-cam-t">Photo</span>'; // (constant markup)
  box.append(camBtn);
  hud.append(box);

  const bench = createBench(ctx, { onSit: seat => enter('bench', seat), onStand: () => leave() });
  bench.camera = (dt, cam, inp) => frame(dt, cam, inp);
  const photo = createPhoto(ctx, { get view() { return view; }, extras, button: camBtn });
  const board = createPhotoBoard(ctx);

  // ---- entering and leaving
  function enter(kind, seat) {
    if (view) leave(true);
    const F = FRAMING[kind];
    view = { kind, seat, yaw0: seat.yaw, aimYaw: 0, pitch0: 0, turn: 0, tilt: 0, t: 0, blend: true };
    pivotNow(pivot);
    if (kind === 'firepit' && firepit) { const c = firepit.api.centre; view.target = new THREE.Vector3(c.x, c.y + F.aimY, c.z); }
    else view.target = new THREE.Vector3(seat.x + Math.sin(seat.yaw) * F.far, seat.y + F.aimY, seat.z + Math.cos(seat.yaw) * F.far);
    rest();
    fromPos.copy(camera.position); fromQ.copy(camera.quaternion);
    box.hidden = false;
    hud.classList.add('scenic-on');
    setView(kind); ctx.regraphics?.();
    const u = ctx.ink?.uniforms;
    if (u) { view.ink = [u.uFadeNear.value, u.uFadeFar.value]; u.uFadeNear.value = INK_FADE.near; u.uFadeFar.value = INK_FADE.far; }
    for (const m of marks) if (m.kind === kind) m.item.max = 0; // (your own view's label goes while you sit in it)
    // your own name tag would float in the middle of the picture, over the back of your head: it goes too
    for (const it of ui.items) if (it.tag && it.obj === player.character.root && it.max > 0) { view.tag = [it, it.max]; it.max = 0; }
  }
  // your own body is hidden while you look through your eyes (a head in front of the lens), shown for the selfie; others
  // always see you (this is your screen only)
  let hid = false;
  function hideMe(on) {
    const r = player.character?.root; if (!r) return;
    if (on && r.visible) { r.visible = false; hid = true; } else if (!on && hid) { r.visible = true; hid = false; }
  }
  function leave(quick) {
    if (!view) return;
    photo.close();
    if (camera.fov !== FOV0) { camera.fov = FOV0; camera.updateProjectionMatrix(); }
    hideMe(false);
    const v = view; view = null;
    if (ctx.shadows?.api) ctx.shadows.api.behind = null;
    const u = ctx.ink?.uniforms;
    if (u && v.ink) { u.uFadeNear.value = v.ink[0]; u.uFadeFar.value = v.ink[1]; }
    box.hidden = true;
    hud.classList.remove('scenic-on');
    setView(null); ctx.regraphics?.();
    for (const m of marks) m.item.max = m.max;
    if (v.tag) v.tag[0].max = v.tag[1];
    if (quick) return;
    // the follow camera takes over behind the way you were looking (the store's way); for BLEND_OUT seconds the picture eases
    // from your eyes out to it
    const c = player.cam;
    camera.getWorldDirection(dir);
    c.pos.copy(camera.position); c.look.copy(camera.position).addScaledVector(dir, 2.5);
    c.yaw = Math.atan2(dir.x, dir.z) + Math.PI; c.pitch = 0.3; c.manualAt = performance.now() / 1000;
    out.t = 0; out.pos.copy(camera.position); out.q.copy(camera.quaternion);
  }
  // the ease out: player.js places the follow camera, then this blends the view's last picture into it
  const out = { t: BLEND_OUT, pos: new THREE.Vector3(), q: new THREE.Quaternion() };
  const followCam = player.updateCamera.bind(player);
  player.updateCamera = (dt, cam, inp, now) => {
    followCam(dt, cam, inp, now);
    if (out.t >= BLEND_OUT || view) return;
    out.t += dt;
    const k = Math.min(1, out.t / BLEND_OUT), e = k * k * (3 - 2 * k);
    toQ.copy(cam.quaternion); cam.position.lerpVectors(out.pos, cam.position, e); cam.quaternion.copy(out.q).slerp(toQ, e);
  };
  // rest looking at the target: the yaw and pitch from your eyes to it. Worked out again every frame until the sit pose has
  // settled (the head moves into the seat), then kept.
  function rest() {
    place(want, 0);
    const T = view.target, ay = Math.atan2(T.x - want.x, T.z - want.z) - view.yaw0;
    view.aimYaw = Math.atan2(Math.sin(ay), Math.cos(ay));
    view.pitch0 = Math.atan2(want.y - T.y, Math.hypot(T.x - want.x, T.z - want.z));
  }
  // your eyes for a turn of the head: in front of the head's middle (pivot), the way you look
  function place(out, turn) {
    const yaw = view.yaw0 + view.aimYaw + turn;
    return out.set(pivot.x + Math.sin(yaw) * EYE_FWD, pivot.y, pivot.z + Math.cos(yaw) * EYE_FWD);
  }
  // the head's middle, world
  function pivotNow(out) {
    const head = player.character.head;
    if (head) head.getWorldPosition(out); else out.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
    return out;
  }

  // ---- the camera, every frame while you sit in a view (the seat's takeover asks for it)
  function frame(dt, cam, inp) {
    if (!view) return false;
    const look = inp.takeLook();
    if (!photo.open || photo.canLook) look2(look.x, look.y);
    view.t += dt;
    pivotNow(tmp);
    pivot.lerp(tmp, Math.min(1, dt * 6)); // (eased: the sit pose settles and the head breathes)
    if (view.t < 1.4) rest();
    const yaw = view.yaw0 + view.aimYaw + view.turn, pitch = view.pitch0 + view.tilt;
    const cp = Math.cos(pitch);
    dir.set(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);
    place(want, view.turn);
    aim.copy(want).add(dir);
    hideMe(!extras.selfie);
    if (extras.selfie) {
      const sy = view.yaw0 + view.turn, sx = Math.sin(sy), sz = Math.cos(sy);
      want.set(pivot.x + sx * SELFIE.dist - sz * SELFIE.side, pivot.y + SELFIE.up, pivot.z + sz * SELFIE.dist + sx * SELFIE.side);
      aim.set(pivot.x, pivot.y + SELFIE.aimY - view.tilt * 1.5, pivot.z);
    }
    const fov = extras.fov || FOV0;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.copy(want); cam.lookAt(aim);
    if (extras.roll) cam.rotateZ(extras.roll);
    if (view.blend) {
      const k = Math.min(1, view.t / BLEND_IN), e = k * k * (3 - 2 * k);
      if (k >= 1) view.blend = false;
      else { toQ.copy(cam.quaternion); cam.position.lerpVectors(fromPos, want, e); cam.quaternion.copy(fromQ).slerp(toQ, e); }
    }
    cone(cam);
    return true;
  }
  function look2(dx, dy) {
    if (!view || (!dx && !dy)) return;
    view.turn = clamp(view.turn - dx * LOOK_K.x, -HEAD_YAW, HEAD_YAW);
    view.tilt = clamp(view.tilt + dy * LOOK_K.y, -PITCH.up, PITCH.down);
  }
  // what is behind your head: the widest angle from the seat's facing the camera can ever show is the head's turn plus half
  // the picture's width (and a margin); everything wholly beyond it is hidden for you (shadows.js)
  const behind = { x: 0, y: 0, z: 0, fx: 0, fz: 1, acos: Math.PI, near: NEAR_KEEP };
  function cone(cam) {
    const api = ctx.shadows?.api;
    if (!api) return;
    if (extras.selfie) { api.behind = null; return; } // (the selfie looks back at what is behind your head)
    const halfV = (Math.max(cam.fov, 55) * DEG) / 2, halfH = Math.atan(Math.tan(halfV) * cam.aspect);
    behind.x = cam.position.x; behind.y = cam.position.y; behind.z = cam.position.z;
    behind.fx = Math.sin(view.yaw0); behind.fz = Math.cos(view.yaw0);
    behind.acos = Math.min(Math.PI * 0.94, HEAD_YAW + Math.abs(view.aimYaw) + Math.max(halfH, halfV + PITCH.up) + Math.abs(extras.roll) + MARGIN);
    api.behind = behind;
  }

  // ---- the views' labels ("Take in the view", over each one when you come near)
  function mark(kind, x, y, z) {
    const node = document.createElement('div');
    node.className = 'area3d scenic-mark';
    node.textContent = 'Take in the view';
    const item = ui.add({ node, pos: new THREE.Vector3(x, y, z), dy: 0, max: 18, fade: 11, min: 1.2 });
    marks.push({ kind, item, max: 18 });
  }
  mark('bench', bench.spot.x, bench.spot.y + 1.75, bench.spot.z);

  let linked = false;
  function link() {
    linked = true;
    firepit = ctx.features?.find(f => f.name === 'firepit') || null;
    if (!firepit) return;
    const H = firepit.api.hooks;
    H.camera = (seat, dt, cam, inp) => frame(dt, cam, inp);
    H.onSit.push(seat => enter('firepit', seat));
    H.onStand.push(() => leave());
    const c = firepit.api.centre;
    mark('firepit', c.x, c.y + 2.2, c.z);
  }

  return {
    name: 'scenic',
    update(dt, now) {
      if (!linked) link();
      // something else took the seat's takeover away (a teleport, a test): the view ends
      if (view && !(player.takeover?.firepit || player.takeover?.scenicBench)) leave(true);
      bench.update(dt, now);
      photo.update(dt, now);
      board.update(dt, now);
    },
    target(px, pz) { return board.target(px, pz) || bench.target(px, pz); },
    afterRemotes(dt, now) { bench.afterRemotes(dt, now); },
    onKey(code) {
      if (photo.onKey(code)) return true;
      if (board.onKey(code)) return true;
      // P (or N / the pad's R2: the map is tucked away in a view) opens the camera
      if (view && (code === 'KeyP' || code === 'KeyN')) { photo.toggle(); return true; }
      return bench.onKey(code);
    },
    bodies() { return bench.bodies?.() || []; },
    help: [[['P'], 'take a photo while you sit and take in a view']],
    api: {
      get view() { return view; }, enter, leave, look: (turn, tilt) => { if (view) { view.turn = clamp(turn, -HEAD_YAW, HEAD_YAW); view.tilt = clamp(tilt, -PITCH.up, PITCH.down); } },
      look2, HEAD_YAW, PITCH, FRAMING, SELFIE, marks, behind, extras, get firepit() { return firepit; },
      get gfx() { return { view: GFX.view, s: GFX.s }; },
      bench, photo, board, net,
    },
  };
}
