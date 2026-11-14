// The lakeside firepit: E at the ring lights it or puts it out, E by a camp chair or log sits you down (E, Space or a push
// on the stick to get up). The server keeps only when it was lit and put out (lib/firepit.js), and every client works out
// the same fire from those and the shared clock (firepit-curve.js). Built by firepit-build.js. In fire season it burns on its
// own from 6 pm to 2 am (fire-season.js); lit by hand in the hours it burns till 2, outside them three hours.
//
// On `feature.api`, for the scenic view and tests:
//   seats            [{ id, kind: 'chair' | 'log', x, z, y (ground), seatY (seat top above y), yaw (the way a sitter faces), chair }]
//   centre           { x, y, z }: the fire's middle at flame height
//   sitting          the seat you sit in, or null;  sitters() -> [{ seat, sid | 'me' }] (who sits where, remotes too)
//   hooks.camera     null, or fn(seat, dt, camera, input, now, player) -> true when it placed the camera (it becomes the
//                    sitting takeover's camera, so it runs only while you sit here)
//   hooks.onSit / hooks.onStand   arrays of fn(seat): called when you sit down and get up
//   fire()           { flame, ember, smoke, lit, phase, litAt, outAt, by } right now
//   sit(id), stand(), light(), out(), preview(ageSeconds | null | undefined) (pins the look: null = out, undefined = live)
import { fireAt, fireSpanAt, spanLeft } from './firepit-curve.js';
import { fireSpan } from './fire-season.js';
import { PLAN } from './firepit-build.js';
import { registerFirepitSfx } from './firepit-sfx.js';
import { ANIM_CODES } from './codes.js';
import { SEATED_POSES } from './scenic-bench.js';

const REACH = { chair: 1.0, log: 0.95 };   // m from a seat's spot to be offered it (from the front or either side)
const RING = 2.15;                         // m from the fire's middle to be offered the fire
const STAND = { chair: 0.75, log: 0.62 };  // m in front of the seat where you stand up
const num = v => (Number.isFinite(v) ? v : null);

export function createFirepit(ctx) {
  const { player, areas, net, audio, ui, remotes } = ctx;
  const area = areas.find(a => a.npcSpec?.firepit);
  if (!area) return null;
  const FP = area.npcSpec.firepit, { seats, centre, fuel } = FP;
  ctx.world.addTrailStop?.({ x: area.x, z: area.z, r: PLAN.dirtR * 0.86 }); // (the firepit trail stops at the dirt circle's ragged rim)
  registerFirepitSfx(audio);
  let litAt = null, outAt = null, by = null, heard = false, pinned;
  const fire = fireAt(null, null, 0), sp = {}; // (sp: the fire's span, fire-season.js: the schedule and the last E)
  const hooks = { camera: null, onSit: [], onStand: [] };
  let tb = null; // the 'firepit' area bed's table in audio.js (found once)
  const table = () => tb || (tb = audio?.tables?.find(t => t.theme === 'firepit') || null);
  const near = (x, z, r) => Math.hypot(x - centre.x, z - centre.z) < r;

  net.on('firepit', m => {
    const nl = num(m.litAt), no = num(m.outAt), first = !heard;
    heard = true;
    const lit = nl !== litAt, doused = no !== outAt && no !== null;
    litAt = nl; outAt = no; by = typeof m.by === 'string' ? m.by : null;
    if (first) return; // what was already burning when you arrived: no sound, no word
    const here = near(player.pos.x, player.pos.z, 22), mine = m.bySid != null && m.bySid === net.sid;
    if (lit && litAt !== null) {
      if (here) audio.play?.('fire-light', centre.x, centre.y, centre.z);
      if (here) ui.toast(mine ? `The fire is catching. ${fireSpan(litAt, outAt, net.serverNow(), sp).night ? 'It burns till 2.' : 'It burns for three hours.'}` : `${by || 'Someone'} lit the fire.`, 2600);
    } else if (doused) {
      if (here) audio.play?.('fire-douse', centre.x, centre.y, centre.z);
      if (here) ui.toast(mine ? 'Fire out. Splash!' : `${by || 'Someone'} put the fire out.`, 2400);
    }
  });

  // ---- sitting (the store's way: our own takeover, the seat's height and, in a camp chair, the armrests' line)
  let sitting = null, satAt = -1;
  const remoteSat = new Map(); // remote sid -> seat
  const takenByRemote = seat => { for (const s of remoteSat.values()) if (s === seat) return true; return false; };
  function sit(seat) {
    if (!seat || takenByRemote(seat)) return false;
    if (sitting) stand();
    sitting = seat; satAt = -1;
    const ch = player.character, sc = ch.root.scale.y || 1;
    player.pos.set(seat.x, seat.y, seat.z); player.yaw = seat.yaw;
    ch.params.seatY = seat.seatY / sc;
    ch.params.chair = seat.chair ? { armX: seat.chair.armX / sc, elbowDrop: seat.chair.elbowDrop, armY: seat.chair.armY / sc } : null;
    const to = {
      anim: 'sit', firepit: true,
      update(dt, now, inp, pl) {
        if (satAt < 0) satAt = now;
        pl.pos.set(seat.x, seat.y, seat.z); pl.yaw = seat.yaw;
        const mv = inp.move();
        if (Math.hypot(mv.x, mv.y) > 0.5 && now - satAt > 0.6) stand();
      },
    };
    if (hooks.camera) to.camera = (dt, cam, inp, now, pl) => hooks.camera(seat, dt, cam, inp, now, pl);
    player.takeover = to;
    audio.ui?.('pop');
    ui.toast(fire.lit ? 'Warm by the fire. E or move to get up.' : 'Sitting down. E or move to get up.', 2200);
    for (const fn of hooks.onSit) { try { fn(seat); } catch (e) { console.error('[firepit] onSit', e); } }
    return true;
  }
  function stand() {
    if (!sitting) return;
    const s = sitting; sitting = null;
    if (player.takeover?.firepit) player.takeover = null;
    player.character.params.seatY = 0; player.character.params.chair = null;
    const d = STAND[s.kind] || 0.7;
    player.pos.set(s.x + Math.sin(s.yaw) * d, s.y, s.z + Math.cos(s.yaw) * d);
    player.collide();
    for (const fn of hooks.onStand) { try { fn(s); } catch (e) { console.error('[firepit] onStand', e); } }
  }
  const seatNear = (px, pz) => {
    let best = null, bd = Infinity;
    for (const s of seats) {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (d < (REACH[s.kind] || 0.8) && d < bd && !takenByRemote(s)) { bd = d; best = s; }
    }
    return best;
  };
  const send = op => net.send({ t: 'firepit', op });

  return {
    name: 'firepit',
    update(dt) {
      const now = net.serverNow();
      if (pinned !== undefined) fireAt(pinned === null ? null : now - pinned * 1000, null, now, fire);
      else fireSpanAt(fireSpan(litAt, outAt, now, sp), now, fire);
      fuel.flame = fire.flame; fuel.ember = fire.ember; fuel.smoke = fire.smoke;
      const steam = fire.phase === 'doused' ? 1 : 0;
      fuel.steam += (steam - fuel.steam) * Math.min(1, dt * 3);
      const t = table();
      if (t) t.k = Math.max(fire.flame, fire.ember * 0.25);
      // something else took you over while you sat (a teleport, a cutscene): you are no longer in the seat
      if (sitting && !player.takeover?.firepit) { sitting = null; player.character.params.seatY = 0; player.character.params.chair = null; }
    },
    target(px, pz) {
      if (sitting) return { hint: 'E  Get up', prio: 7, run: stand };
      const seat = seatNear(px, pz);
      if (seat) return { hint: seat.hint, prio: 6, run: () => sit(seat) };
      if (near(px, pz, RING)) {
        return fire.lit
          ? { hint: 'E  Put out the fire', prio: 6, run: () => send('out') }
          : { hint: 'E  Light the fire', prio: 6, run: () => send('light') };
      }
      return null;
    },
    // a remote player sitting in one of our seats is drawn in it: its height, facing the fire, arms on the armrests
    afterRemotes() {
      if (!remotes?.map) return;
      for (const r of remotes.map.values()) {
        const last = r.buf?.[r.buf.length - 1];
        let sat = last && ANIM_CODES[last.a] === 'sit' && Math.abs(last.x - centre.x) + Math.abs(last.z - centre.z) < 6
          ? seats.find(s => Math.hypot(last.x - s.x, last.z - s.z) < 0.35) : null;
        // (a sitter posing for a photo, a wave or a cheer after sitting down, stays drawn in the seat)
        const was = remoteSat.get(r.sid);
        if (!sat && last && was && SEATED_POSES.has(ANIM_CODES[last.a]) && Math.hypot(last.x - was.x, last.z - was.z) < 0.35) sat = was;
        if (sat) {
          const sc = r.ch.root.scale.y || 1;
          r.ch.params.seatY = sat.seatY / sc;
          r.ch.params.chair = sat.chair ? (r.ch.params.chair || { armX: sat.chair.armX / sc, elbowDrop: sat.chair.elbowDrop, armY: sat.chair.armY / sc }) : null;
          r.ch.root.rotation.y = sat.yaw;
          remoteSat.set(r.sid, sat);
        } else if (remoteSat.has(r.sid)) { r.ch.params.seatY = 0; r.ch.params.chair = null; remoteSat.delete(r.sid); }
      }
      for (const sid of remoteSat.keys()) if (!remotes.map.has(sid)) remoteSat.delete(sid);
    },
    onKey(code) { if (sitting && code === 'Space') { stand(); return true; } return false; },
    help: [[['E'], 'light the lakeside firepit, or pull up a camp chair']],
    api: {
      seats, centre, hooks,
      get sitting() { return sitting; },
      sitters() { const out = []; if (sitting) out.push({ seat: sitting, sid: 'me' }); for (const [sid, seat] of remoteSat) out.push({ seat, sid }); return out; },
      fire: () => { const now = net.serverNow(), s = fireSpan(litAt, outAt, now, {}); return { ...fire, litAt, outAt, by, span: s, left: spanLeft(s, now) }; },
      sit: id => sit(seats.find(s => s.id === id)),
      stand, light: () => send('light'), out: () => send('out'),
      preview(age) { pinned = age; },
    },
  };
}
