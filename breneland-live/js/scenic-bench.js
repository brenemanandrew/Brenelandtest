// The lake bench: a classic park bench on the shore of Lake Rufallia, looking out over the water. Cast-iron ends with scrolled
// armrests, painted wooden slats, two seats. A scenic view (sit and you see it through your own eyes, scenic.js). Sitting works
// like the firepit's: our own takeover (anim 'sit' at the seat's height), E, Space or a push of the stick gets you up, and a
// remote player sitting on it is drawn on it (afterRemotes). One batch, one draw call a pass. layout.js SCENIC_BENCH says where
// (the World Editor can move it). If the spot is wet the bench steps inland until it stands on dry ground.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { Batcher, GEO } from './batch.js';
import { limb } from './world-trees.js';
import { terrainHeight, coastSigned } from './terrain.js';
import { SCENIC_BENCH } from './layout.js';
import { ANIM_CODES } from './codes.js';

export const BENCH = { len: 1.8, seatY: 0.3, depth: 0.44, back: 0.78, seats: [-0.43, 0.43], fwd: 0.06 }; // metres; fwd = a sitter's spot ahead of the seat's middle (seat-height: 0.3, was 0.45)
const IRON = '#2c3b33', IRON_HI = '#3d5246', SLAT = ['#b77a45', '#a96f3e', '#bf8550', '#ad7341'], BRASS = '#c9a64a';
const REACH = 0.8, STAND = 0.68;
// poses a remote sitter may strike on the bench and still be drawn sitting (the photo poses, scenic-photo.js)
export const SEATED_POSES = new Set(['sit', 'wave', 'cheer', 'laugh', 'point']);

// the spot: SCENIC_BENCH, stepped back from the water (along -forward) until the ground is at least 1.2 m from the shore
export function benchSpot() {
  let { x, z } = SCENIC_BENCH;
  const yaw = SCENIC_BENCH.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (let i = 0; i < 40 && coastSigned(x, z) > -1.2; i++) { x -= fx * 0.25; z -= fz * 0.25; }
  return { x, z, yaw, y: terrainHeight(x, z) };
}

export function buildBench(root, colliders, spot = benchSpot()) {
  const { x, z, yaw } = spot;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const y = Math.min(...[-0.8, 0.8].flatMap(a => [-0.25, 0.25].map(f => terrainHeight(x + c * a + s * f, z - s * a + c * f)))); // feet on the lowest corner
  // local frame: a = along the bench (+ = the sitter's left... the bench's +x), f = forward (toward the water), up
  const W = (a, f) => [x + c * a + s * f, z - s * a + c * f];
  const P = (a, h, f) => { const [wx, wz] = W(a, f); return [wx, y + h, wz]; };
  const b = new Batcher({ vertexColors: true });
  const box = (col, a, h, f, sa, sh, sf, tilt = 0) => { const [wx, wz] = W(a, f); b.add(GEO.box, col, { x: wx, y: y + h, z: wz, sx: sa, sy: sh, sz: sf, rx: tilt, ry: yaw }); };
  const L = BENCH.len, SY = BENCH.seatY, D = BENCH.depth;
  if (propsReady('bench_park')) addProp(b, 'bench_park', { x, y, z, yaw }, { skin: 'lake' }); // (props-static: the Blender cast-iron bench, built to these sizes)
  else {
  // the two cast-iron ends: a front leg, a back leg rising into the back's upright, the seat rail and a scrolled armrest
  for (const a of [-L / 2 + 0.08, L / 2 - 0.08]) {
    limb(b, IRON, P(a, 0.02, D / 2 - 0.02), P(a, SY - 0.04, D / 2 - 0.05), 0.032);           // front leg
    limb(b, IRON, P(a, 0.02, -D / 2 - 0.02), P(a, SY - 0.02, -D / 2 + 0.03), 0.032);          // back leg
    limb(b, IRON, P(a, SY - 0.03, -D / 2 + 0.03), P(a, SY + BENCH.back - 0.02, -D / 2 - 0.13), 0.03); // the back's upright
    limb(b, IRON, P(a, SY - 0.05, -D / 2), P(a, SY - 0.05, D / 2), 0.026);                     // seat rail
    limb(b, IRON, P(a, 0.12, -D / 2 - 0.01), P(a, 0.12, D / 2 - 0.03), 0.018);                 // the stretcher low down
    limb(b, IRON, P(a, SY + 0.2, -D / 2 + 0.02), P(a, SY + 0.22, D / 2 - 0.02), 0.03);         // armrest
    limb(b, IRON, P(a, SY + 0.22, D / 2 - 0.02), P(a, SY + 0.12, D / 2 + 0.06), 0.028);        // its scroll, down and out
    limb(b, IRON, P(a, SY + 0.12, D / 2 + 0.06), P(a, SY + 0.02, D / 2 + 0.02), 0.024);
    limb(b, IRON, P(a, SY + 0.21, D / 2 - 0.06), P(a, SY - 0.04, D / 2 - 0.05), 0.022);        // arm post down to the seat
    box(IRON_HI, a, 0.02, D / 2 - 0.02, 0.09, 0.04, 0.1); box(IRON_HI, a, 0.02, -D / 2 - 0.02, 0.09, 0.04, 0.1); // feet
  }
  // the slats: five on the seat (a slight dip), three on the back (leaning back), each a slightly different brown
  for (let i = 0; i < 5; i++) {
    const f = -D / 2 + 0.05 + i * (D - 0.1) / 4;
    box(SLAT[i % 4], 0, SY - 0.012 - Math.sin((i / 4) * Math.PI) * 0.012, f, L - 0.04, 0.03, 0.075);
  }
  const lean = -0.24;
  for (let i = 0; i < 3; i++) {
    const h = SY + 0.2 + i * 0.17;
    box(SLAT[(i + 1) % 4], 0, h, -D / 2 - 0.02 - (h - SY) * 0.27, L - 0.04, 0.085, 0.028, lean);
  }
  box(BRASS, 0, SY + 0.37, -D / 2 - 0.072, 0.2, 0.05, 0.008, lean); // a little brass plaque on the middle slat
  }
  const meshes = b.build(root, 'scenic-bench');
  // solid: three circles along it (a box would not turn with it)
  for (const a of [-0.62, 0, 0.62]) { const [cx, cz] = W(a, -0.03); colliders.push({ type: 'circle', x: cx, z: cz, r: 0.3, bench: true }); }
  const seats = BENCH.seats.map((a, i) => {
    const [sx, sz] = W(a, BENCH.fwd), [fx, fz] = W(a, BENCH.fwd + 0.32), fy = Math.min(y, terrainHeight(fx, fz)); // (seat-height: the sitter stands on the ground under the feet; the hill falls away in front)
    return { id: 'bench-' + (i ? 'r' : 'l'), x: sx, z: sz, y: fy, seatY: SY + y - fy, yaw, hint: 'E  Sit and take in the view', view: 'bench' };
  });
  return { meshes, seats, y };
}

export function createBench(ctx, { onSit, onStand }) {
  const { player, remotes, audio, ui, world, colliders } = ctx;
  const spot = benchSpot();
  const built = buildBench(world?.root || ctx.scene, colliders, spot);
  spot.y = built.y;
  const seats = built.seats;
  let sitting = null, satAt = -1;
  const remoteSat = new Map(); // sid -> seat
  const taken = seat => { for (const s of remoteSat.values()) if (s === seat) return true; return false; };

  function sit(seat) {
    if (!seat || taken(seat)) return false;
    if (sitting) stand();
    sitting = seat; satAt = -1;
    const ch = player.character, sc = ch.root.scale.y || 1;
    player.pos.set(seat.x, seat.y, seat.z); player.yaw = seat.yaw;
    ch.params.seatY = seat.seatY / sc; ch.params.chair = null;
    const to = {
      anim: 'sit', scenicBench: true,
      update(dt, now, inp, pl) {
        if (satAt < 0) satAt = now;
        pl.pos.set(seat.x, seat.y, seat.z); pl.yaw = seat.yaw;
        const mv = inp.move();
        if (Math.hypot(mv.x, mv.y) > 0.5 && now - satAt > 0.6) stand();
      },
    };
    to.camera = (dt, cam, inp, now, pl) => api.camera?.(dt, cam, inp, now, pl) || false;
    player.takeover = to;
    audio.ui?.('pop');
    ui.toast('Lake Rufallia. Drag to look around.', 2400);
    onSit?.(seat);
    return true;
  }
  function stand() {
    if (!sitting) return;
    const s = sitting; sitting = null;
    if (player.takeover?.scenicBench) player.takeover = null;
    player.character.params.seatY = 0;
    player.pos.set(s.x + Math.sin(s.yaw) * STAND, s.y, s.z + Math.cos(s.yaw) * STAND);
    player.collide();
    onStand?.(s);
  }
  const seatNear = (px, pz) => {
    let best = null, bd = REACH;
    for (const s of seats) { const d = Math.hypot(px - s.x, pz - s.z); if (d < bd && !taken(s)) { bd = d; best = s; } }
    return best;
  };

  const api = {
    spot, seats, camera: null,
    get sitting() { return sitting; },
    sitters() { const out = []; if (sitting) out.push({ seat: sitting, sid: 'me' }); for (const [sid, seat] of remoteSat) out.push({ seat, sid }); return out; },
    sit: id => sit(seats.find(s => s.id === id)), stand,
    update() {
      // something else took you over while you sat (a teleport, a cutscene): you are no longer on the bench
      if (sitting && !player.takeover?.scenicBench) { sitting = null; player.character.params.seatY = 0; }
    },
    target(px, pz) {
      if (sitting) return { hint: 'E  Get up', prio: 7, run: stand };
      const seat = seatNear(px, pz);
      return seat ? { hint: seat.hint, prio: 6, run: () => sit(seat) } : null;
    },
    onKey(code) { if (sitting && code === 'Space') { stand(); return true; } return false; },
    // a remote player sitting on the bench (or posing for a photo on it after sitting down) is drawn on it
    afterRemotes() {
      if (!remotes?.map) return;
      for (const r of remotes.map.values()) {
        const last = r.buf?.[r.buf.length - 1];
        const anim = last && ANIM_CODES[last.a];
        const prev = remoteSat.get(r.sid);
        let sat = null;
        if (last && Math.abs(last.x - spot.x) + Math.abs(last.z - spot.z) < 4) {
          if (anim === 'sit') sat = seats.find(s => Math.hypot(last.x - s.x, last.z - s.z) < 0.35) || null;
          else if (prev && SEATED_POSES.has(anim) && Math.hypot(last.x - prev.x, last.z - prev.z) < 0.35) sat = prev;
        }
        if (sat) {
          const sc = r.ch.root.scale.y || 1;
          r.ch.params.seatY = sat.seatY / sc; r.ch.params.chair = null;
          r.ch.root.rotation.y = sat.yaw;
          remoteSat.set(r.sid, sat);
        } else if (prev) { r.ch.params.seatY = 0; remoteSat.delete(r.sid); }
      }
      for (const sid of remoteSat.keys()) if (!remotes.map.has(sid)) remoteSat.delete(sid);
    },
    bodies: () => [],
  };
  return api;
}
