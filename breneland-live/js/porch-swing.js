// The porch swing (layout.js PORCH_SWING): a slatted two-seater bench hanging on two chains from the porch ceiling, left of the
// front door, facing the yard. Walk up and press E to sit. It swings gently while anyone sits on it, and E, Space or a push on
// the stick gets you up.
//
// Seated you see through your own eyes: the camera rides the seat, so the yard rocks with the swing, and the camera controls (a
// drag, the right stick) turn your head. Your own body is hidden so it's not in the way.
//
// Everyone sees the same swing: its phase is the shared clock (net.serverNow). A sitter's anim travels as 'sit' like any seat,
// and a remote player sitting within reach of a seat is drawn on it, riding it (afterRemotes(), which main.js calls after
// remotes.update), with the dangling-legs sit (params.seatY).
import * as THREE from 'three';
import { propsReady, propMesh } from './props-static.js';
import { PORCH_SWING as SW, PORCH } from './layout.js';
import { toon, shadows } from './toon.js';
import { GEO } from './batch.js';
import { ANIM_CODES } from './codes.js';
import { seatFit } from './seats.js';

const PIVOT_Y = PORCH.ceilY ?? 3.62;     // the hooks in the porch ceiling
const SEAT_Y = PORCH.y + 0.3;            // the seat's top at rest (seat-height: was 0.46, the feet hung 17 cm; now on the floor)
const L = PIVOT_Y - SEAT_Y;              // the chains
const OMEGA = Math.sqrt(9.81 / (L + 0.25)); // a pendulum's own pace (the seat's mass sits a little below the chains' end)
const AMP = 0.1;                         // rad: gentle
const YAW = Math.PI;                     // a sitter faces the yard (north, -z)
const SEATS = [-0.5, 0.5];               // along the bench (local x): two grown-ups, a little air between them
const SWING_FRONT = 0.17;                // (seats-bodies) the seat's front edge in front of SIT_Z: each body fitted to it (seats.js seatFit)
const SIT_Z = -0.08;                     // the hips, local z (the front edge at -0.25: the knees just past it, the calves clear of the slats; house-scale)
const EYE = 1.12;                        // a sitter's eyes above the seat top (the dangling-legs sit)
const SIT = 'sit';

export function createPorchSwing(ctx) {
  const { scene, player, colliders, audio, ui, remotes, net, camera } = ctx;
  const g = new THREE.Group(); g.name = 'porch-swing';
  g.position.set(SW.x, PIVOT_Y, SW.z);
  scene.add(g);
  const wood = toon('#b9814f'), dark = toon('#7a5234'), chainM = toon('#5c6066');
  const W = SW.w;
  const m = (geo, mat, x, y, z, sx, sy, sz, rx = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; g.add(o); return o; };
  const sy = -L; // the seat's top, in the swing's frame
  const model = propsReady('porch_swing');
  if (model) { // props-static: the Blender swing (seat, chains) turned to face the yard, its seat top at the code's; the hooks stay put
    const seat = propMesh('porch_swing', 'seat', 'porch'); seat.position.set(0, sy - 0.3, 0); seat.rotation.y = YAW; g.add(seat);
    const hooks = propMesh('porch_swing', 'hooks', 'porch'); hooks.position.set(SW.x, SEAT_Y - 0.3, SW.z); hooks.rotation.y = YAW; scene.add(hooks);
  }
  // the seat: four slats on two cross rails, a slatted back, arm rests on short posts
  if (!model) for (let i = 0; i < 4; i++) m(GEO.box, wood, 0, sy - 0.03, -0.2 + i * 0.13, W, 0.05, 0.1);
  if (!model) for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) m(GEO.box, dark, x, sy - 0.08, -0.02, 0.07, 0.07, 0.56);
  if (!model) for (let i = 0; i < 3; i++) m(GEO.box, wood, 0, sy + 0.14 + i * 0.15, 0.27 + i * 0.015, W, 0.1, 0.045, -0.1);
  if (!model) for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
    m(GEO.box, dark, x, sy + 0.28, 0.285, 0.07, 0.62, 0.07, -0.1);       // the back posts (1.5 cm behind the slats' line: leaning from a higher middle, a post's face came level with a slat's)
    m(GEO.box, dark, x, sy + 0.25, -0.02, 0.08, 0.05, 0.56);              // the arm rests
    m(GEO.box, dark, x - Math.sign(x) * 0.01, sy + 0.11, -0.25, 0.06, 0.28, 0.06); // their front posts (a centimetre in from the slats' ends: level with them, they flickered)
  }
  // the chains: from a ring at each front arm and each back post up to a hook, in a V to one ceiling hook per side
  const chainLen = (dx, dy, dz) => Math.hypot(dx, dy, dz);
  if (!model) for (const sx of [-1, 1]) {
    const hx = sx * (W / 2 - 0.02);
    for (const [cz, cy] of [[-0.25, sy + 0.25], [0.27, sy + 0.55]]) {
      const len = chainLen(0, -cy, cz);
      const c = m(GEO.cyl6, chainM, hx, cy / 2, cz / 2, 0.012, len, 0.012);
      c.rotation.x = Math.atan2(cz, -cy) * -1;
      for (let k = 1; k < 9; k++) { const t = k / 9; m(GEO.sphere, chainM, hx, cy * t, cz * t, 0.02, 0.02, 0.02); } // the links read as a chain
    }
    // the hook block in the ceiling (outside the swinging group: it does not swing)
    const hook = new THREE.Mesh(GEO.box, dark); hook.scale.set(0.12, 0.24, 0.12); hook.position.set(SW.x + hx, PIVOT_Y + 0.12, SW.z); scene.add(hook);
  }
  shadows(g);
  // solid: the bench and its sweep
  colliders.push({ type: 'box', minX: SW.x - W / 2 - 0.05, maxX: SW.x + W / 2 + 0.05, minZ: SW.z - 0.5, maxZ: SW.z + 0.45 });

  // ---- the motion: the shared clock's phase, a local amplitude that grows while someone sits
  let amp = 0, theta = 0, lastSign = 0;
  const local = new THREE.Vector3(), out = new THREE.Vector3();
  // world position of seat i (the top of the seat, where you sit) at the swing's current angle
  const seatAt = (i, v, ch = null) => { local.set(SEATS[i], sy, SIT_Z - seatFit(ch, SWING_FRONT)); g.updateMatrixWorld(); return v.copy(local).applyMatrix4(g.matrixWorld); };
  const restOf = i => ({ x: SW.x + SEATS[i], z: SW.z + SIT_Z });

  // who sits where: { mine: seat index or -1, remote: Map(sid -> seat) }
  let mine = -1, satAt = 0;
  const riders = new Map();
  const taken = i => mine === i || [...riders.values()].includes(i);

  // Seated, a camera of its own: first person. It sits where your eyes are, on the seat, so it rides the swing's arc. The look
  // input (the same drag or stick that turns the follow camera) turns your head, and you stand up facing the way you were looking.
  // Your own body is hidden meanwhile (a head in front of the lens).
  const eye = new THREE.Vector3(), ahead = new THREE.Vector3(), camP = new THREE.Vector3(), camL = new THREE.Vector3();
  const fp = { yaw: YAW, pitch: 0 };
  let hidRoot = false;
  const hide = on => { const r = player.character?.root; if (r && r.visible === on) { r.visible = !on; hidRoot = on; } else if (!on) hidRoot = false; };
  function sit(i) {
    mine = i; satAt = performance.now() / 1000;
    player.character.params.seatY = SEAT_Y - PORCH.y;
    fp.yaw = YAW; fp.pitch = 0;
    camP.copy(camera.position); camL.set(SW.x, SEAT_Y + EYE, SW.z - 3);
    player.takeover = {
      anim: SIT,
      update(dt, now, inp, pl) {
        seatAt(i, out, pl.character); pl.pos.set(out.x, PORCH.y, out.z); pl.yaw = YAW;
        const mv = inp.move();
        if (Math.hypot(mv.x, mv.y) > 0.5 && now - satAt > 0.6) stand();
      },
      camera(dt, cam, inp) {
        hide(true);
        const look = inp.takeLook();
        if (look.x || look.y) { fp.yaw -= look.x * 0.0055; fp.pitch = Math.max(-0.9, Math.min(0.9, fp.pitch + look.y * 0.004)); }
        // the eyes and a point a metre ahead of them, both in the seat's frame so they swing with it
        local.set(SEATS[i], sy + EYE, SIT_Z - 0.08); eye.copy(local).applyMatrix4(g.matrixWorld);
        local.set(SEATS[i] + Math.sin(fp.yaw) * Math.cos(fp.pitch), sy + EYE - Math.sin(fp.pitch), SIT_Z - 0.08 + Math.cos(fp.yaw) * Math.cos(fp.pitch));
        ahead.copy(local).applyMatrix4(g.matrixWorld);
        // the first frame eases in from wherever the camera was; after that it is your head
        const k = 1 - Math.exp(-dt * 6);
        camP.lerp(eye, Math.min(1, k * (now_s() - satAt > 0.7 ? 4 : 1)));
        camL.lerp(ahead, Math.min(1, k * 2));
        cam.position.copy(camP); cam.lookAt(camL);
        return true;
      },
    };
    audio.play?.('porch-swing-sit', SW.x, SEAT_Y, SW.z);
    ui.toast(ctx.hudLayout?.layout === 'pc' ? 'Swinging on the porch. Drag to look around; E or move to get up.' : 'Swinging on the porch. Drag to look around; move to get up.', 2800);
  }
  const now_s = () => performance.now() / 1000;
  function stand() {
    if (mine < 0) return;
    const r = restOf(mine); mine = -1;
    if (player.takeover?.anim === SIT) player.takeover = null;
    player.character.params.seatY = 0;
    hide(false);
    player.pos.set(r.x, PORCH.y, SW.z - 1.1); player.yaw = YAW;
    player.collide?.();
    // the follow camera picks up behind the way you were looking, out in the yard (behind you is the house wall, where it would
    // press up against your back)
    const c = player.cam;
    if (c) { c.yaw = fp.yaw + Math.PI; c.pitch = 0.32; c.pos.copy(camera.position); c.look.set(player.pos.x, player.pos.y + 1.6, player.pos.z); c.manualAt = performance.now() / 1000; }
  }

  return {
    name: 'porchswing',
    get sitting() { return mine; },
    get amp() { return amp; },
    get theta() { return theta; },
    riders,
    seatAt: (i, ch = null) => { const v = seatAt(i, new THREE.Vector3(), ch); // (ch: that body's fit, seats.js seatFit)
      return { x: v.x, y: v.y, z: v.z }; },
    update(dt) {
      if (mine >= 0 && player.takeover?.anim !== SIT) { mine = -1; player.character.params.seatY = 0; hide(false); } // something else took you over
      if (mine < 0 && hidRoot) hide(false);
      const busy = mine >= 0 || riders.size > 0;
      amp += ((busy ? AMP : 0) - amp) * Math.min(1, dt * (busy ? 0.45 : 0.3));
      if (amp < 1e-4) amp = 0;
      const t = net.serverNow() / 1000;
      theta = amp * Math.sin(t * OMEGA);
      g.rotation.x = theta;
      // a creak of the chains at each end of the arc
      const s = Math.sign(Math.cos(t * OMEGA));
      if (s !== lastSign) { lastSign = s; if (amp > 0.03) audio.play?.('porch-swing-creak', SW.x, PIVOT_Y - 0.4, SW.z, { k: amp / AMP, dir: s }); }
    },
    // main.js, after remotes.update: a remote sitter near one of the seats rides it
    afterRemotes() {
      for (const [sid, i] of riders) { const r = remotes.map.get(sid); if (!r || ANIM_CODES[r.buf[r.buf.length - 1].a] !== SIT) { if (r) r.ch.params.seatY = 0; riders.delete(sid); } }
      for (const r of remotes.map.values()) {
        const last = r.buf[r.buf.length - 1];
        if (ANIM_CODES[last.a] !== SIT) continue;
        let seat = riders.get(r.sid);
        if (seat === undefined) {
          for (let i = 0; i < SEATS.length; i++) { const q = restOf(i); if (Math.hypot(last.x - q.x, last.z - q.z) < 0.5 && !taken(i)) { seat = i; break; } }
          if (seat === undefined) continue;
          riders.set(r.sid, seat);
        }
        seatAt(seat, out, r.ch);
        r.ch.root.position.set(out.x, PORCH.y, out.z);
        r.ch.root.rotation.y = YAW;
        r.ch.params.seatY = SEAT_Y - PORCH.y;
      }
    },
    target(px, pz) {
      if (mine >= 0) return { hint: 'E  Get up', prio: 7, run: stand };
      if (Math.hypot(px - SW.x, pz - (SW.z - 0.5)) > 2.0) return null;
      let best = -1, bd = Infinity;
      for (let i = 0; i < SEATS.length; i++) { if (taken(i)) continue; const q = restOf(i), d = Math.hypot(px - q.x, pz - q.z); if (d < bd) { bd = d; best = i; } }
      if (best < 0) return { hint: 'The porch swing is full', prio: 2, run: () => ui.toast('Both seats are taken. Wait your turn!', 2000) };
      return { hint: 'E  Sit on the porch swing', prio: 5, run: () => sit(best) };
    },
    onKey(code) { if (mine >= 0 && code === 'Space') { stand(); return true; } return false; },
    help: [[['E'], 'sit on the porch swing (two seats; drag to look around), E or move to get up']],
  };
}
