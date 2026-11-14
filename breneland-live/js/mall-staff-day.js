// The strip mall's people and the late party (mall-staff, 2026-11-10): where Belinda, Mina, Zoe and Asha are at shared time t, the
// store hours, the party nights and who comes. Pure (layout.js, strip-mall-plan.js, npcs-day.js, daytime.js, util.js, npc-looks.js:
// no THREE), a function of the shared clock, so every visitor sees the same people at the same work (the NPC rule in CLAUDE.md).
//
//   PEAK_HOURS [11, 19.5], SLICE_HOURS [11, 25]; PARTY { days: Wed Fri Sat, start 23.5, end 29 (5 am) }
//   partyAt(t) -> { on, night (the evening's Eastern day number), u (s since 23:30), guests } | null (not a party night at that moment)
//   peakOpenAt(t), sliceOpenAt(t) (the party stretches Summit Slice to 5 am)
//   staffState(id, t) -> { x, z, yaw, speed, anim, hidden, clip, cyc, items { L, R }, outfit, seatY, entry, k, u, arrived, at }
//   partyGuestAt(id, t, toRoad, sp) -> a resident's state while the party has them (town-life.js asks it first), else null
//   partyGuests(night) -> the adults who come that night (never kevin, buddy, carol, never a child); setMallStaffHomes({ sisters, pizza })
import { STRIP_MALL as L, SUMMIT_SQUARE } from './layout.js';
import { FY, PIZZA, CLOTHES, PETE } from './strip-mall-plan.js';
import { hourAt, inHours, sinceHour } from './npcs-day.js';
import { easternParts } from './daytime.js';
import { hash01, alongPolyline, polylineLength } from './util.js';
import { NPCS, TOWN_RESIDENTS } from './npc-looks.js';

export const PEAK_HOURS = L.units.clothes.hours;     // [11, 19.5]: Peak Threads, every day 11 am to 7:30 pm
export const SLICE_HOURS = L.units.pizza.hours;      // [11, 25]: Summit Slice, 11 am to 1 am
export const PARTY = { days: [3, 5, 6], start: 23.5, end: 29, name: 'the after hours party' };   // Wed, Fri, Sat nights 11:30 pm to 5 am (Breneland's clock)
export const CHANGE_HOUR = 21;                        // the pizza girls walk into the back room at 9 pm and come out in green
export const NEVER = ['kevin', 'buddy', 'carol'];     // never at the party (Andrew)
export const SLOT = 600;                              // the work slots, 10 minutes, like the townsfolk's
const WALK_V = 1.25, SASHAY_V = 1.1;
// (mpfb-in-game) each of the four walks at the speed her own Blender walk cycle was authored for (export_game.py `walkSpeed`), so her feet
// never slide: the schedule times every walk by it on every client, model or not (the code-built fallback walks at it too)
export const CLIP_SPEED = { belinda: 0.6433, mina: 0.4691, zoe: 1.0973, asha: 1.0352 };
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const dayN = (y, mo, d) => Math.round(Date.UTC(y, mo - 1, d) / 864e5);

// ---------------------------------------------------------------- the clock: party nights, the hours
export function partyAt(t) {
  const h = hourAt(t), p = easternParts(t * 1000);
  let night = dayN(p.y, p.mo, p.d);
  if (h >= PARTY.start) { /* this evening */ } else if (h < PARTY.end - 24) night -= 1; else return null;
  const wd = ((night + 4) % 7 + 7) % 7;   // (day 0, 1 Jan 1970, was a Thursday)
  if (!PARTY.days.includes(wd)) return null;
  const u = h >= PARTY.start ? (h - PARTY.start) * 3600 : (h + 24 - PARTY.start) * 3600;
  return { on: true, night, u, weekday: wd, guests: partyGuests(night) };
}
export const isPartyNight = night => PARTY.days.includes(((night + 4) % 7 + 7) % 7);
export function peakOpenAt(t) { const h = hourAt(t); return inHours(h, PEAK_HOURS[0], PEAK_HOURS[1]); }
export function sliceOpenAt(t) { const h = hourAt(t); return inHours(h, SLICE_HOURS[0], SLICE_HOURS[1] - 24) || !!partyAt(t); }
// the hour of the day as one run from 5 am (5 .. 29): a night after midnight belongs to the day before
const dayHour = t => { const h = hourAt(t); return h < 5 ? h + 24 : h; };
// the party night that an evening at shared time t belongs to (even before 11:30: the same Eastern day)
function nightOf(t) { const h = hourAt(t), p = easternParts(t * 1000); let n = dayN(p.y, p.mo, p.d); if (h < 5) n -= 1; return n; }
export const partyTonight = t => isPartyNight(nightOf(t));

// ---------------------------------------------------------------- places
const minZ = L.minZ, DOOR_IN = u => [u.door.x, minZ + 1.3], DOOR_OUT = u => [u.door.x, minZ - 0.9];
const WALK_Z = (L.walk.minZ + minZ) / 2;                       // the walkway's middle
const ROW_Z = -120.5, HILL_Z = -132.5, ZEBRA_X = -93;          // Summit Rd's south and north sidewalks (town-life.js), the Tool Crib's zebra
const LOT_GAP_PIZZA = -181.5, LOT_GAP_CLOTHES = L.units.clothes.door.x;   // where a walk crosses the lot (between the parked cars)
const Q = CLOTHES, P = PIZZA;
export const SPOTS = {
  // Peak Threads: the floor Belinda works, the stations Mina works
  // (Belinda at a rack: where her hands meet it in her browse / adjust clips, which reach 0.39 m in front of her: a straight rack's
  // end garment's face is 0.69 m out from its middle, so she stands 1.1 m out and 0.22 m to one side, the end post beside her, not
  // between her arms (v262 put her 0.33 m from the post: her forearms went through it); a round rack's garments ring 0.53 m out)
  rack: Q.racks.map((r, i) => (r.kind === 'round' ? { x: r.x, z: r.z - 0.93, yaw: 0 } : i < 2 ? { x: r.x + r.w / 2 - 0.16 + 0.42, z: r.z + 0.22, yaw: -Math.PI / 2 } : { x: r.x - r.w / 2 + 0.16 - 0.42, z: r.z + 0.22, yaw: Math.PI / 2 })),
  window: { x: Q.x0 + 2.1, z: minZ + 2.3, yaw: Math.PI + 0.3 },
  greet: { x: L.units.clothes.door.x + 0.9, z: minZ + 2.2, yaw: Math.PI },
  counter: { x: Q.counter.clerk.x, z: Q.counter.clerk.z, yaw: Q.counter.clerk.yaw },
  table: { x: Q.table.x + 0.3, z: Q.table.z + 1.05, yaw: Math.PI },
  cubbies: { x: (Q.cubbies.minX + Q.cubbies.maxX) / 2, z: Q.cubbies.minZ - 0.7, yaw: 0 },
  mannequin: { x: Q.mannequins[3].x - 0.85, z: Q.mannequins[3].z, yaw: Math.PI / 2 },
  round: Q.racks.filter(r => r.kind === 'round').map(r => ({ x: r.x, z: r.z - 1.05, yaw: 0 })),
  // Summit Slice: behind the counter, the prep table, the ovens, the gate into the dining room, the tables' serving spots, the back door
  counterZ: { x: P.counter.minX + 1.5, z: P.counter.maxZ + 0.45, yaw: Math.PI },
  counterA: { x: P.counter.maxX - 1.3, z: P.counter.maxZ + 0.45, yaw: Math.PI },
  prep: { x: (P.prep.minX + P.prep.maxX) / 2, z: P.prep.minZ - 0.5, yaw: 0 },
  dome: { x: P.dome.x, z: P.dome.z - P.dome.r - 0.5, yaw: 0 },
  oven: { x: (P.ovens[0].minX + P.ovens[0].maxX) / 2, z: P.ovens[0].minZ - 0.5, yaw: 0 },
  gateIn: { x: (P.counter.gate.x0 + P.counter.gate.x1) / 2, z: P.counter.maxZ + 0.5 },
  gateOut: { x: (P.counter.gate.x0 + P.counter.gate.x1) / 2, z: P.counter.minZ - 0.7 },
  aisleX: P.x0 + 6.6,
  serve: P.tables.map(tb => ({ x: tb.x, z: tb.z - 0.95, yaw: 0, table: tb })),
  backDoor: { x: L.units.pizza.minX + 2.55, z: L.maxZ - 0.9, yaw: 0 },      // (the shut back door in the shell: through it is the back room, out of sight)
  dance: [[P.x0 + 6.6, minZ + 3.0], [P.x0 + 6.6, minZ + 5.2], [P.x0 + 6.6, minZ + 7.4], [P.x0 + 2.9, minZ + 8.5], [P.x0 + 10.4, minZ + 8.5], [P.x0 + 6.6, minZ + 8.7], [P.x0 + 4.3, minZ + 8.6], [P.x0 + 8.9, minZ + 8.6]].map(([x, z]) => ({ x, z })),
  booths: P.seats.filter(s => s.kind === 'booth'), chairs: P.seats.filter(s => s.kind === 'chair'),
  bench: [{ x: L.bench.x + 0.42, z: L.bench.z, yaw: Math.PI, seatY: 0.3 }, { x: L.bench.x - 0.42, z: L.bench.z, yaw: Math.PI, seatY: 0.3 }],   // (strip-mall-build.js: the plank bench's two seats, WALK.y + 0.3)
  square: (SUMMIT_SQUARE?.benches || []).map(b => ({ x: b.x, z: b.z, yaw: b.yaw, seatY: 0.45 })),
};
// the staff's homes: picked from the town's houses by the feature (mall-staff.js setMallStaffHomes: the two westernmost Maple Row
// houses facing Summit Rd); until then a doorstep on the sidewalk east of the lot
const HOMES = { sisters: { x: -150, z: -118.5, door: [-150, -117.5], facing: -1 }, pizza: { x: -140, z: -118.5, door: [-140, -117.5], facing: -1 } };
export function setMallStaffHomes(h) { if (h?.sisters) HOMES.sisters = h.sisters; if (h?.pizza) HOMES.pizza = h.pizza; }
export const mallStaffHomes = () => HOMES;

// ---------------------------------------------------------------- the ways: inside a store straight (the pizza place by its aisle), outside by the walkway, the lot's gap and the sidewalk
function wayPizza(a, b) {
  const inKitchen = p => p[1] > P.counter.minZ - 0.1;
  if (inKitchen(a) === inKitchen(b)) {
    if (inKitchen(a)) return [a, b];
    // the dining room: along the aisle between the tables' columns
    return [a, [SPOTS.aisleX, a[1]], [SPOTS.aisleX, b[1]], b];
  }
  const g1 = [SPOTS.gateIn.x, SPOTS.gateIn.z], g2 = [SPOTS.gateOut.x, SPOTS.gateOut.z];
  return inKitchen(a) ? [a, g1, g2, [SPOTS.aisleX, g2[1]], [SPOTS.aisleX, b[1]], b] : [a, [SPOTS.aisleX, a[1]], [SPOTS.aisleX, g2[1]], g2, g1, b];
}
const inUnit = (u, p) => p[0] > u.minX && p[0] < u.maxX && p[1] > minZ && p[1] < L.maxZ;
export const inPizza = (x, z) => inUnit(L.units.pizza, [x, z]);
// from a store's door (outside) to a home's door along the walkway, the lot's gap and Summit Rd's sidewalk
function outdoors(unit, dest) {
  const d = L.units[unit], gap = unit === 'pizza' ? LOT_GAP_PIZZA : LOT_GAP_CLOTHES;
  const out = [DOOR_OUT(d), [gap, WALK_Z], [gap, L.lot.minZ - 1.5]];
  if (dest.kind === 'bench') return [DOOR_OUT(d), [dest.x, WALK_Z + 0.3], [dest.x, dest.z + 0.25]];
  if (dest.kind === 'square') { const s = dest; return [...out, [-150, ROW_Z], [-141.5, ROW_Z], [-139, -116.5], [s.x + (s.yaw > 0 ? 0.6 : s.yaw < 0 ? -0.6 : 0), s.z + (s.yaw === 0 ? 0.6 : 0)]]; }
  const home = dest.home;
  const curb = home.facing === -1 ? [home.door[0], ROW_Z] : [home.door[0], HILL_Z];
  if (home.facing === -1) return [...out, [-160, ROW_Z], curb, home.door];
  return [...out, [-160, ROW_Z], [ZEBRA_X, ROW_Z], [ZEBRA_X, HILL_Z], curb, home.door];
}
const OUTSIDE = p => p.kind === 'home' || p.kind === 'bench' || p.kind === 'square';   // (a seat carries kind 'booth' / 'chair': inside)
const unitOf = p => (p[0] < L.units.clothes.minX ? 'pizza' : 'clothes');
const toDoor = p => (unitOf(p) === 'pizza' ? wayPizza(p, DOOR_IN(L.units.pizza)) : [p, DOOR_IN(L.units.clothes)]);   // an inside point to its door's inside
function way(a, b) {
  // a, b: { x, z } inside a store, or { kind: 'home' | 'bench' | 'square', ... } outside; two stores by the walkway between their doors
  const A = OUTSIDE(a) ? null : [a.x, a.z], B = OUTSIDE(b) ? null : [b.x, b.z];
  if (A && B) {
    const uA = unitOf(A), uB = unitOf(B);
    if (uA === uB) return uA === 'pizza' ? wayPizza(A, B) : [A, B];
    const da = L.units[uA], db = L.units[uB];
    return [...toDoor(A), DOOR_OUT(da), [da.door.x, WALK_Z], [db.door.x, WALK_Z], DOOR_OUT(db), ...toDoor(B).slice().reverse()];
  }
  if (A && !B) return [...toDoor(A), ...outdoors(unitOf(A), b)];
  if (!A && B) return [...outdoors(unitOf(B), a).slice().reverse(), ...toDoor(B).slice().reverse()];
  return [...outdoors('pizza', a).slice().reverse(), ...outdoors('pizza', b)];   // outside to outside: by the pizza door's walkway
}

// ---------------------------------------------------------------- a day as stints; the state at t walks between them
// stint: { h (5..29), at: a place, anim, clip, cyc, items, outfit, hidden, seatY, lines, sp }
function stateFrom(stints, t, lines, salt) {
  const hd = dayHour(t);
  let cur = stints[stints.length - 1], prev = stints[stints.length - 2] || cur;
  for (let i = 0; i < stints.length; i++) if (stints[i].h <= hd + 1e-9) { cur = stints[i]; prev = stints[i - 1] || stints[stints.length - 1]; }
  const t0 = sinceHour(t, cur.h % 24), since = t - t0;
  const out = { x: 0, z: 0, yaw: 0, speed: 0, anim: 'idle', hidden: false, clip: null, cyc: null, items: cur.items || null, outfit: cur.outfit || prev.outfit || 'day', seatY: 0 };
  const a = prev.at, b = cur.at;
  if (a !== b && !(a.kind === 'home' && b.kind === 'home')) {
    const path = way(a, b), len = polylineLength(path), sp = CLIP_SPEED[salt] || cur.sp || WALK_V, dur = len / sp;
    if (since < dur) {
      const [x, z, dx, dz] = alongPolyline(path, since * sp);
      out.x = x; out.z = z; out.yaw = Math.atan2(dx, dz); out.speed = sp; out.anim = null; out.hidden = !!(prev.hidden && since < 0.5); out.clip = cur.walkClip || null; out.cyc = cur.walkClip ? 'walk' : null;
      out.outfit = prev.outfit || out.outfit; out.items = cur.walkItems || null;
      return out;
    }
  }
  if (cur.hidden || b.kind === 'home') { out.hidden = true; out.x = b.kind === 'home' ? b.home.door[0] : b.x; out.z = b.kind === 'home' ? b.home.door[1] : b.z; return out; }
  out.x = b.x; out.z = b.z; out.yaw = b.yaw ?? 0; out.anim = cur.anim || 'idle'; out.clip = cur.clip || null; out.seatY = cur.seatY || b.seatY || 0;
  // a line now and then, early in a 10-minute slot (npcs.js says it once a slot: entry, k, u, arrived)
  if (lines?.length) {
    const k = Math.floor(t / SLOT), u = t - k * SLOT;
    if (hash01(salt, k, 'talk') < 0.45) out.entry = { line: lines[Math.floor(hash01(salt, k, 'line') * lines.length)], lineDelay: hash01(salt, k, 'dl') * 5 };
    out.k = k; out.u = u; out.arrived = 0;
  }
  return out;
}

export const LINES = {
  belinda: ['Ooh, that is your colour.', 'Mina made that one. She is shy about it.', 'Take your time, hon.', 'Everything looks better in green.', 'Twirl for me!', 'We just got that in. Gorgeous, right?'],
  belindaOut: ['Best garlic knots in town.', 'What a night.', 'Come dance with me later!'],
  mina: ['Oh. Hello.', 'I just finished this one.', 'The hem took three tries.', 'It is nothing, really.', 'Belinda says green. I say charcoal.'],
  minaOut: ['Just reading.', 'A quiet evening.'],
  zoe: ['Hot slice, coming through!', 'Extra cheese? Always.', 'Pete! Order up!', 'Garlic knots on the house. Kidding.', 'Two larges for the booth!'],
  asha: ['Fresh out of the oven!', 'Careful, hot plate!', 'Who ordered the mushroom?', 'Tray coming round!', 'Napkins are by the door.'],
  rave: ['Woo! Party night!', 'Glow sticks for everyone!', 'Turn it up!', 'Dance with us!', 'Best night of the week!'],
};

// ---------------------------------------------------------------- Belinda and Mina (Peak Threads)
const home = who => ({ kind: 'home', home: HOMES[who] });
const BENCH_B = { kind: 'bench', ...SPOTS.bench[0] }, BENCH_M = { kind: 'bench', ...SPOTS.bench[1] };
function belindaStints(t) {
  const party = partyTonight(t), H = home('sisters');
  const S = [{ h: 5, at: H, hidden: true, outfit: 'day' }, { h: 10.85, at: SPOTS.greet, anim: 'look', sp: SASHAY_V, walkClip: 'sashay' }];
  // the floor, every 10 minutes a new stop: the racks (a hand on the hip), the window, the door
  const j0 = Math.floor(sinceHour(t, 11) / SLOT);
  for (let j = 0; j < 51; j++) {
    const h = 11 + j / 6; if (h >= 19.5) break;
    const r = hash01('belinda', j0 + j, 'stop'), i = Math.floor(hash01('belinda', j0 + j, 'rack') * SPOTS.rack.length);
    const at = r < 0.55 ? SPOTS.rack[i] : r < 0.75 ? SPOTS.window : SPOTS.greet;
    S.push({ h, at, anim: r < 0.55 ? 'idle' : 'look', clip: r < 0.55 ? 'sass' : null, sp: SASHAY_V, walkClip: 'sashay' });
  }
  // after close: a slice in a booth, the bench, the party (or home)
  const booth = SPOTS.booths[2 + (nightOf(t) % 2) * 2];
  S.push({ h: 19.5, at: booth, anim: 'sit', seatY: booth.y - FY, sp: SASHAY_V, walkClip: 'sashay' });
  S.push({ h: 21, at: BENCH_B, anim: 'sit', sp: SASHAY_V, walkClip: 'sashay' });
  if (party) {
    const j1 = Math.floor(sinceHour(t, 23.5) / SLOT);
    for (let j = 0; j < 21; j++) {
      const h = 23.5 + j / 6; const r = hash01('belinda', 'party', j1 + j);
      const at = r < 0.7 ? SPOTS.dance[j % SPOTS.dance.length] : SPOTS.booths[1];
      S.push({ h, at, anim: r < 0.7 ? ['dance', 'hiphop', 'dance', 'ballet'][j % 4] : 'sit', seatY: r < 0.7 ? 0 : SPOTS.booths[1].y - FY, sp: SASHAY_V, walkClip: 'sashay' });
    }
    S.push({ h: 27, at: H, hidden: true, sp: SASHAY_V, walkClip: 'sashay' });
  } else S.push({ h: 22.1, at: H, hidden: true, sp: SASHAY_V, walkClip: 'sashay' });
  return S;
}
function minaStints(t) {
  const H = home('sisters');
  const S = [{ h: 5, at: H, hidden: true }, { h: 10.8, at: SPOTS.counter, anim: 'idle', clip: 'sketch' }];
  const j0 = Math.floor(sinceHour(t, 11) / SLOT);
  for (let j = 0; j < 51; j++) {
    const h = 11 + j / 6; if (h >= 19.5) break;
    const r = hash01('mina', j0 + j, 'job');
    const st = r < 0.35 ? ['counter', 'sketch'] : r < 0.55 ? ['table', 'fold'] : r < 0.72 ? ['cubbies', 'fold'] : r < 0.86 ? ['mannequin', 'dress'] : ['round', 'fold'];
    const at = st[0] === 'round' ? SPOTS.round[j % SPOTS.round.length] : SPOTS[st[0]];
    S.push({ h, at, anim: 'idle', clip: st[1], items: st[1] === 'sketch' ? { L: true, R: true } : null, walkItems: { R: true } });
  }
  // the walk and the reading: the mall's bench, then a bench on Summit Square (odd days the other way round), then home
  const odd = nightOf(t) % 2 === 1, sq = SPOTS.square.length ? { kind: 'square', ...SPOTS.square[nightOf(t) % SPOTS.square.length] } : BENCH_M;
  S.push({ h: 19.5, at: odd ? sq : BENCH_M, anim: 'read', items: { L: true }, walkItems: { R: true } });
  S.push({ h: 20.4, at: odd ? BENCH_M : sq, anim: 'read', items: { L: true }, walkItems: { R: true } });
  S.push({ h: 21.3, at: H, hidden: true, walkItems: { R: true } });
  return S;
}

// ---------------------------------------------------------------- Zoe and Asha (Summit Slice)
function pizzaStints(who, t) {
  const zoe = who === 'zoe', H = home('pizza'), party = partyTonight(t);
  const station = zoe ? SPOTS.counterZ : SPOTS.counterA;
  const S = [{ h: 5, at: H, hidden: true, outfit: 'day' }, { h: 10.8, at: station, anim: 'idle', clip: 'work', outfit: 'day' }];
  const job = (j, h, outfit) => {
    const r = hash01(who, 'job', j);
    if (zoe) {
      if (r < 0.4) return { h, at: SPOTS.counterZ, anim: 'idle', clip: 'work', outfit };
      if (r < 0.7) return { h, at: SPOTS.prep, anim: 'idle', clip: 'work', outfit };
      // a delivery bag carried from the prep table out to the door for Pete, then back: a stint at the door with the bag, the next back
      return { h, at: { x: L.units.pizza.door.x + 0.7, z: minZ + 1.6, yaw: Math.PI }, anim: 'look', clip: 'carry', items: { R: true }, walkItems: { R: true }, walkClip: 'carry', outfit };
    }
    if (r < 0.3) return { h, at: SPOTS.counterA, anim: 'idle', clip: 'work', outfit };
    if (r < 0.5) return { h, at: SPOTS.dome, anim: 'idle', clip: 'work', outfit };
    if (r < 0.62) return { h, at: SPOTS.oven, anim: 'idle', clip: 'work', outfit };
    // serving: the tray to a table (the walk and the stand with the tray), the next slot back with it put down
    const sv = SPOTS.serve[Math.floor(hash01(who, 'table', j) * SPOTS.serve.length)];
    return { h, at: sv, anim: 'idle', clip: 'tray', items: { R: true }, walkItems: { R: true }, walkClip: 'tray', outfit };
  };
  const j0 = Math.floor(sinceHour(t, 11) / SLOT);
  for (let j = 0; j < 60; j++) { const h = 11 + j / 6; if (h >= CHANGE_HOUR) break; S.push(job(j0 + j, h, 'day')); }
  // 9 pm: into the back room (hidden a couple of minutes), out in green
  S.push({ h: CHANGE_HOUR, at: SPOTS.backDoor, anim: 'idle', outfit: 'day', hidden: false });
  S.push({ h: CHANGE_HOUR + 0.012, at: SPOTS.backDoor, anim: 'idle', hidden: true, outfit: 'night' });   // (green while out of sight: the change is made in the back room, so no client ever swaps her in view)
  S.push({ h: CHANGE_HOUR + 0.05, at: { ...SPOTS.backDoor, z: SPOTS.backDoor.z - 0.01 }, anim: 'idle', outfit: 'night' });
  const close = party ? PARTY.end : SLICE_HOURS[1];
  const j1 = Math.floor(sinceHour(t, CHANGE_HOUR) / SLOT);
  for (let j = 1; j < 50; j++) {
    const h = CHANGE_HOUR + j / 6; if (h >= close) break;
    if (party && h >= PARTY.start) {
      const r = hash01(who, 'rave', j1 + j);
      if (r < 0.5) { S.push({ h, at: SPOTS.dance[(j + (zoe ? 0 : 4)) % SPOTS.dance.length], anim: 'idle', clip: 'rave', items: zoe ? { L: true, R: true } : { L: true }, outfit: 'night', lines: 'rave' }); continue; }
      const st = job(j1 + j, h, 'night'); S.push(st); continue;
    }
    S.push(job(j1 + j, h, 'night'));
  }
  S.push({ h: close, at: H, hidden: true, outfit: 'night' });
  return S;
}

const CACHE = new Map();
function stintsOf(id, t) {
  // (a day's plan depends on the night's parity and the party: cached per id and Eastern day)
  const key = id + ':' + nightOf(t);
  let s = CACHE.get(key);
  if (!s) { s = id === 'belinda' ? belindaStints(t) : id === 'mina' ? minaStints(t) : pizzaStints(id, t); CACHE.set(key, s); if (CACHE.size > 16) CACHE.delete(CACHE.keys().next().value); }
  return s;
}
export function resetMallStaffCache() { CACHE.clear(); }
export function staffState(id, t) {
  const S = stintsOf(id, t), hd = dayHour(t);
  let cur = S[0]; for (const s of S) if (s.h <= hd + 1e-9) cur = s;
  const lines = id === 'belinda' ? (hd >= 19.5 ? LINES.belindaOut : LINES.belinda) : id === 'mina' ? (hd >= 19.5 ? LINES.minaOut : LINES.mina) : cur.lines === 'rave' ? LINES.rave : LINES[id];
  const st = stateFrom(S, t, lines, id);
  st.id = id; st.unit = st.hidden ? null : unitOf([st.x, st.z]);
  return st;
}
export const STAFF = ['belinda', 'mina', 'zoe', 'asha'];
export const STAFF_HOURS = { belinda: PEAK_HOURS, mina: PEAK_HOURS, zoe: SLICE_HOURS, asha: SLICE_HOURS };

// ---------------------------------------------------------------- the party's guests (town-life.js's residents)
const KID = id => { const l = NPCS[id]?.look; return !l || (l.scale !== undefined && l.scale < 0.92) || !!l.kid; };
export const ADULTS = TOWN_RESIDENTS.filter(id => NPCS[id] && NPCS[id].kind === 'human' && !KID(id) && !NEVER.includes(id));
export function partyGuests(night) {
  if (!isPartyNight(night)) return [];
  const scored = ADULTS.map(id => ({ id, r: hash01('party', night, id) })).sort((a, b) => a.r - b.r);
  const n = 3 + Math.floor(hash01('party-n', night) * 3);   // three to five a night
  return scored.slice(0, n).map(s => s.id);
}
/** a guest's plan for the night: when they set off, how long they stay, where they stand (pure) */
export function guestPlan(id, night) {
  const guests = partyGuests(night), k = guests.indexOf(id);
  if (k < 0) return null;
  const T0 = PARTY.start * 3600 + 600 + hash01('arrive', night, id) * 3600;   // at the door 23:40 .. 0:40 (seconds of the day, past 24 h); the walk there starts earlier by its length
  const stay = 3600 + hash01('stay', night, id) * 3000;                       // 60 .. 110 minutes inside (so from 0:40 to 1:40 everyone is there)
  const spot = SPOTS.dance[(k * 3 + Math.floor(hash01('spot', night, id) * 3)) % SPOTS.dance.length];
  const sits = hash01('sits', night, id) < 0.3, seat = SPOTS.chairs[(k * 5) % SPOTS.chairs.length];
  return { k, T0, stay, spot, sits, seat };
}
const gcache = new Map();
export function partyGuestAt(id, t, toRoad, sp) {
  const night = nightOf(t);
  if (!isPartyNight(night)) return null;
  const plan = guestPlan(id, night);
  if (!plan) return null;
  const h = hourAt(t), hd = h < 5 ? h + 24 : h;
  const sec = hd * 3600;
  if (sec < plan.T0 - 1200) return null;   // (the longest walk from a Summit Hill door is about 15 minutes at a stroll)
  // the way: from the door to the road (town-life's toRoad: door, curb, the avenue, Breneland Rd) is not ours; a resident on Summit Rd
  // walks their own sidewalk west to the mall (Maple Row's is the mall's side; Summit Hill crosses at the Tool Crib's zebra)
  const key = id + ':' + night;
  let w = gcache.get(key);
  if (!w) {
    const door = toRoad.door, curb = toRoad.toRoad[1];
    const south = curb[1] > -126;
    const outside = south ? [door, curb, [-160, ROW_Z]] : [door, curb, [ZEBRA_X, HILL_Z], [ZEBRA_X, ROW_Z], [-160, ROW_Z]];
    const d = L.units.pizza;
    const path = [...outside, [LOT_GAP_PIZZA, L.lot.minZ - 1.5], [LOT_GAP_PIZZA, WALK_Z], DOOR_OUT(d), DOOR_IN(d), [SPOTS.aisleX, DOOR_IN(d)[1]]];
    const behind = plan.sits ? [plan.seat.x - Math.sin(plan.seat.yaw) * 0.6, plan.seat.z - Math.cos(plan.seat.yaw) * 0.6] : null; // (slice-seats: in behind the chair, not through the table)
    const inside = plan.sits ? [[SPOTS.aisleX, behind[1]], behind, [plan.seat.x, plan.seat.z]] : [[SPOTS.aisleX, plan.spot.z], [plan.spot.x, plan.spot.z]];
    const full = [...path, ...inside];
    w = { path: full, len: polylineLength(full), back: full.slice().reverse() };
    gcache.set(key, w); if (gcache.size > 40) gcache.delete(gcache.keys().next().value);
  }
  const speed = sp || WALK_V, walk = w.len / speed, u = sec - (plan.T0 - walk);
  if (u < 0) return null;
  if (u < walk) { const [x, z, dx, dz] = alongPolyline(w.path, u * speed); return { x, z, yaw: Math.atan2(dx, dz), speed, anim: null, hidden: false, party: 'in' }; }
  const inside = u - walk;
  if (inside < plan.stay) {
    const beat = Math.floor(inside / 20);
    if (plan.sits) return { x: plan.seat.x, z: plan.seat.z, yaw: plan.seat.yaw, speed: 0, anim: beat % 4 === 3 ? 'laugh' : 'sit', seatY: plan.seat.y - FY, table: plan.seat.table, seat: plan.seat, hidden: false, party: 'sit' };
    const a = ['dance', 'hiphop', 'dance', 'laugh', 'ballet', 'dance', 'talk'][beat % 7];
    return { x: plan.spot.x, z: plan.spot.z, yaw: faceTo(plan.spot.x, plan.spot.z, P.x0 + 6.6, minZ + 6) + hash01('face', id, beat) * 0.8 - 0.4, speed: 0, anim: a, hidden: false, party: 'dance' };
  }
  const back = inside - plan.stay;
  if (back < walk) { const [x, z, dx, dz] = alongPolyline(w.back, back * speed); return { x, z, yaw: Math.atan2(dx, dz), speed, anim: null, hidden: false, party: 'out' }; }
  if (back < walk + 600) return { hidden: true, party: 'home' };   // (indoors again; after that the night's usual plan)
  return null;
}
/** everyone at the party at t: the staff who are there, Belinda, the guests (ids), for tests and the lights */
export function partyCrowd(t) {
  const pa = partyAt(t);
  if (!pa) return { on: false, guests: [], staff: [] };
  const staff = STAFF.filter(id => { const s = staffState(id, t); return !s.hidden && s.unit === 'pizza' && inUnit(L.units.pizza, [s.x, s.z]); });
  return { on: true, guests: pa.guests.filter(id => { const g = partyGuestAt(id, t, { door: [0, 0], toRoad: [[0, 0], [0, ROW_Z]] }, WALK_V); return g && (g.party === 'dance' || g.party === 'sit'); }), staff, night: pa.night };
}
void PETE;
