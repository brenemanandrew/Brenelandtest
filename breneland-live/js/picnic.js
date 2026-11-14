// The picnic tables (picnic-build.js): walk up to any table and press E to sit on its bench with your hands on the top
// (TABLE_TOP, bodies-poses tableRest). Priya and Dale chat to you from their blanket while you sit nearby. Chat and emotes work
// while you sit, and E, Space or a nudge on the stick stands you up. Every table seats four, and others see you seated
// (afterRemotes). Also every other bench in Breneland (seats.js SEATS: the town's benches, logs, Joyce's chair).
import { terrainHeight, groundHeight } from './terrain.js';
// the floor under a seat: a porch or a dock it stands on (house-scale: the Tool Crib's bench is on its porch, 0.31 m over the ground,
// and the legs hung for the ground under the boards), else the ground; seat-height: where the feet go, 0.3 m in front of the seat
// (a bench on a slope, or by a kerb, has its ground lower there: the feet reach down to it)
// (slice-seats) a seat with a back: its front edge ahead of a sitter's hip joints (root units) for one fitted `f` forward of the spot
const seatEdge = (s, f, ch) => (s.back > 0 && s.front > 0 ? (s.front - f) / (ch.root.scale.y || 1) : 0);
const floorUnder = s => { const x = s.x + Math.sin(s.yaw) * 0.3, z = s.z + Math.cos(s.yaw) * 0.3, g = groundHeight(x, z, s.y); return g < s.y - 0.15 ? g : terrainHeight(x, z); };
import { hash01 } from './util.js';
import { SEATS, seatFit } from './seats.js';
import { ANIM_CODES } from './codes.js';

const CHAT = [
  'Lemonade? It is fresh.', 'Try a sandwich, we made too many.', 'Perfect day for it, isn\'t it?', 'Have you been down to the water?',
  'Dax was by earlier. He sniffed the basket and ran off.', 'The ants have found us again.', 'Did you see the boat out on the lake last night?',
  'Joyce says the tomatoes are in.', 'Kevin swears there is a fish as long as his arm out there.', 'Stay as long as you like.',
  'Have you tried the pie contest? I managed four!', 'Somebody threw a frisbee clean over the hedge yesterday.',
];

export function createPicnic(ctx) {
  const { player, areas, npcs, ui, audio, remotes, world } = ctx;
  const area = areas.find(a => a.id === 'north-lawn');
  if (!area) return null;
  const P = area.npcSpec?.picnic || { tables: [] };
  if (area.rect) world.addTrailStop?.({ ...area.rect });   // (the spur from the main path ends at the block's edge)
  const seats = P.tables.flatMap(t => t.seats);            // { id, x, z, y (the bench top), yaw, table }

  let sitting = null, satAt = 0, nextChat = 0;
  const picnickers = () => npcs.npcs.filter(d => d.name === 'Priya' || d.name === 'Dale');
  function sit(seat) {
    sitting = seat; satAt = performance.now() / 1000; nextChat = satAt + 2.5;
    // (seats-bodies) a seat that says where its front edge is fits each body: the knees just past it (seats.js seatFit)
    // (slice-seats) and one with a back too: the body's back against it, the shins out over a front edge too deep for short thighs
    let f = seatFit(player.character, seat.front, seat.back), sx = seat.x + Math.sin(seat.yaw) * f, sz = seat.z + Math.cos(seat.yaw) * f, refit = seat.back > 0, seatedFor = 0;
    player.pos.set(sx, seat.y, sz); player.yaw = seat.yaw;
    player.character.params.seatY = Math.max(0.16, seat.y - floorUnder(seat)); // the seat's real top: the bottom sits on it and the legs hang from the knees
    player.character.params.table = seat.table || null;
    player.character.params.seatEdge = seatEdge(seat, f, player.character);
    player.takeover = {
      anim: 'sit',
      update(dt, now, inp, pl) {
        if (refit && (seatedFor += dt) > 1.9) { // (slice-seats: settled on the seat (sitDown is done), the back measured as it sits now; once)
          refit = false; f = seatFit(pl.character, seat.front, seat.back, true);
          sx = seat.x + Math.sin(seat.yaw) * f; sz = seat.z + Math.cos(seat.yaw) * f; pl.character.params.seatEdge = seatEdge(seat, f, pl.character);
        }
        pl.pos.set(sx, floorUnder(seat), sz); pl.yaw = seat.yaw;
        const mv = inp.move();
        if (Math.hypot(mv.x, mv.y) > 0.5 && now - satAt > 0.6) stand();
      },
    };
    // (mpfb-in-game, Andrew's v262) Summit Slice's seats are by the front windows and in booths: the camera behind you stood outside,
    // above the canopy or in the booth's back. Indoors there it looks at you across your table instead
    if (/^pizza /.test(seat.name || '')) {
      const fy = floorUnder(seat), fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
      player.takeover.camera = (dt, cam) => { cam.position.set(sx + fx * 2.7 + fz * 0.6, fy + 2.0, sz + fz * 2.7 - fx * 0.6); cam.lookAt(sx, fy + 0.8, sz); return true; };
    }
    audio.ui?.('pop');
    ui.toast('Sitting down. E or move to get up. Enter to chat.', 2600);
    const who = picnickers().filter(d => Math.hypot(d.body.root.position.x - seat.x, d.body.root.position.z - seat.z) < 9);
    for (const d of who) npcs.local.set(d.id, { anim: 'talk', until: performance.now() / 1000 + 3 });
    if (who.length) setTimeout(() => npcs.say(who[Math.floor(Math.random() * who.length)], ['Come, sit with us!', 'Oh hello! Good spot, that one.', 'Pull up a bench!'][Math.floor(Math.random() * 3)], 3.5), 400);
  }
  function stand() {
    if (!sitting) return;
    const s = sitting; sitting = null;
    player.takeover = null;
    player.character.params.seatY = 0; player.character.params.table = null; player.character.params.seatEdge = 0;
    // up and out over the bench, away from the table (or straight back from a bench without one)
    player.pos.set(s.x - Math.sin(s.yaw) * 0.75, floorUnder(s), s.z - Math.cos(s.yaw) * 0.75);
    player.collide();
  }

  // someone else sitting at a table: drawn on the bench with their hands on the top (their own screen does the same)
  const remoteSat = new Map();
  // (slice-seats, Andrew's v265: Whitney at a Summit Slice chair was drawn sitting on the floor, the top across her chest and her legs
  // out under the table) someone else on any seats.js seat is drawn on it too: their client put them at the seat's spot (fitted to
  // their body by seatFit, a few cm along its facing) on the floor under it, so the seat whose spot is nearest, its floor where they stand. The bus's
  // seats are bus.js's (it draws its riders itself)
  function anySeatAt(q) {
    let best = null, bd = 0.2;
    for (const s of SEATS) {
      if (s.bus !== undefined || (s.on && !s.on())) continue;
      const d = Math.hypot(q.x - s.x, q.z - s.z);
      if (d < bd && Math.abs(q.y - floorUnder(s)) < 0.12) { bd = d; best = s; }
    }
    return best;
  }
  return {
    name: 'picnic',
    api: { seats, tables: P.tables, get sitting() { return sitting; }, sit: id => { const s = seats.find(q => q.id === id); if (s) sit(s); return !!s; }, stand },
    update(dt, now) {
      if (!sitting) return;
      if (now > nextChat) {
        nextChat = now + 7 + hash01('pc', Math.floor(now)) * 6;
        const who = picnickers().filter(d => Math.hypot(d.body.root.position.x - player.pos.x, d.body.root.position.z - player.pos.z) < 9);
        if (who.length) {
          const d = who[Math.floor(hash01('pw', Math.floor(now)) * who.length)];
          npcs.say(d, CHAT[Math.floor(hash01('pl', Math.floor(now)) * CHAT.length)], 4);
          npcs.local.set(d.id, { anim: 'talk', until: now + 3 });
        }
      }
    },
    afterRemotes() {
      if (!remotes?.map) return;
      for (const r of remotes.map.values()) {
        const last = r.buf?.[r.buf.length - 1];
        const sitting = last && ANIM_CODES[last.a] === 'sit';
        const sat = !sitting ? null : (Math.abs(last.x - area.x) < 16 && Math.abs(last.z - area.z) < 9 && seats.find(s => Math.hypot(last.x - s.x, last.z - s.z) < 0.35)) || anySeatAt(last);
        if (sat) {
          const sc = r.ch.root.scale.y || 1;
          r.ch.params.seatY = (sat.y - floorUnder(sat)) / sc;
          r.ch.params.table = sat.table || null;
          r.ch.params.seatEdge = seatEdge(sat, (last.x - sat.x) * Math.sin(sat.yaw) + (last.z - sat.z) * Math.cos(sat.yaw), r.ch); // (where their client fitted them)
          r.ch.root.rotation.y = sat.yaw;
          remoteSat.set(r.sid, sat);
        } else if (remoteSat.has(r.sid)) { r.ch.params.seatY = 0; r.ch.params.table = null; r.ch.params.seatEdge = 0; remoteSat.delete(r.sid); }
      }
      for (const sid of remoteSat.keys()) if (!remotes.map.has(sid)) remoteSat.delete(sid);
    },
    target(px, pz) {
      if (sitting) return { hint: 'E  Get up', prio: 7, run: stand };
      let best = null, bd = 1.3;
      for (const s of seats) { const d = Math.hypot(px - s.x, pz - s.z); if (d < bd) { bd = d; best = s; } }
      if (best) return { hint: 'E  Sit down at the picnic table', prio: 4, d: bd, run: () => sit(best) }; // (d: main.js lets the nearer of a seat and an NPC's hello take E)
      bd = 1.9;
      for (const s of SEATS) { if (s.on && !s.on()) continue; const d = Math.hypot(px - s.x, pz - s.z); if (d < bd) { bd = d; best = s; } } // any bench in Breneland (seats.js; s.on: a seat that is not always there, the bus's)
      if (best) return { hint: best.hint || ('E  Sit down on the ' + best.name), prio: 4, d: bd, run: () => sit(best) };
      return null;
    },
    onKey(code) { if (sitting && (code === 'Space')) { stand(); return true; } return false; },
    help: [[['E'], 'sit down at a picnic table and chat with Priya and Dale']],
  };
}
