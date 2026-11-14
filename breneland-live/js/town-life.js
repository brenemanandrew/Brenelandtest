// Life in the neighborhoods: a dozen residents who live in the town's houses (world-town.js TOWN_HOUSES) and go about a day:
// out of the door, a stroll along their sidewalk, down Maple Ave to Breneland Rd, over to the park, up to Breneland's fence to
// look in and wave, a jog, a dog walk after dark. Everything is a pure function of the shared clock (hash01 per person per
// 10-minute slot), so every visitor sees the same neighbour in the same place. At night they're home (windows lit by
// daynight.js) except a night walker or two. Say hi with E (local).
import * as THREE from 'three';
import { hash01, alongPolyline, polylineLength } from './util.js';
import { TOWN_HOUSES } from './world-town.js';
import { streetY } from './mailman-route.js';
import { hourAt } from './npcs-day.js';
import { Human } from './human.js';
import { PARK } from './layout.js';
import { castMember, castOn, castAt, castSeat, mayBuild } from './town-cast.js';
import { NPCS, TOWN_RESIDENTS, lookOf, voiceOf, tagOf } from './npc-looks.js';
import { guestAt } from './joyce-evening.js';   // Joyce's girlfriends' evenings at her house (joyce-house)
import { seatFit } from './seats.js';
import { partyGuestAt } from './mall-staff-day.js';   // the adults who drop in at Summit Slice's late party (mall-staff)

const SLOT = 600; // seconds per activity slot
const AVE = -25.5, ROW_Z = -120.5, HILL_Z = -132.5, RD_N = -54.1, RD_S = -43.2;
// the residents (looks and voices in npc-looks.js, where the NPC Editor dresses them; never reorder: the index picks the night walkers)
const PEOPLE = TOWN_RESIDENTS.map(id => ({ name: NPCS[id].name, look: NPCS[id].look, voice: NPCS[id].voice, npc: id }));
const LINES = ['Lovely day for it.', 'Morning, neighbour!', 'Have you seen the dogs? Nala got out... no wait, there she is.', 'The carnival is in town, you can see the wheel from the hill.', 'Pat is late with the mail again.', 'Off to the park.', 'Kevin was out on the lake till eleven.', 'That water tower is not for climbing. Well. Maybe once.', 'Summit Slice does a garlic knot you would not believe.', 'Watch the crows in the garden.'];

// Which outing a person takes in slot j (null: they stay in). The same draws as ever, so nobody's day moved.
function outing(name, i, j, night) {
  const r = hash01('trip', name, j);
  if (night) return r < 0.08 && i % 4 === 1 ? 'night' : null; // a night walker now and then
  return r < 0.42 ? null : r < 0.58 ? 'row' : r < 0.72 ? 'fence' : r < 0.86 ? 'park' : 'lake';
}
// Everyone who goes to the same place in slot j, in a hashed order: [kind] -> [i...] (npc-lumps: they all walked to one point and
// stood there in a lump for two minutes; now each stands at their own place in the group, below).
const groupMemo = new Map();
function groupsAt(j, night) {
  const key = j + (night ? 'n' : 'd');
  let g = groupMemo.get(key);
  if (g) return g;
  g = {};
  PEOPLE.forEach((q, i) => { const k = outing(q.name, i, j, night); if (k) (g[k] || (g[k] = [])).push(i); });
  for (const k in g) g[k].sort((a, b) => hash01('rank', PEOPLE[a].name, j) - hash01('rank', PEOPLE[b].name, j));
  groupMemo.set(key, g);
  if (groupMemo.size > 12) groupMemo.delete(groupMemo.keys().next().value);
  return g;
}
// The shared places: where each of n people stands, and which way they face. At Breneland's fence they line the sidewalk
// SPACE apart, from the front gate outwards, looking in at the yard. At the park and at the lake end of the street they stand in
// a loose circle facing each other (a chat), its radius growing with the group so no two are nearer than about 2.4 m.
const SPACE = 2.6;
const PARK_RING = { x: PARK.sign.x - 3, z: PARK.sign.z + 1.2 };      // on the lawn by the park gate's path, clear of the lamp and the bench
const LAKE_RING = { x: 50.5, z: -59.5 };                            // the lawn at the lake end of the street, north of its sidewalk
function placeIn(kind, rank, n, j) {
  if (kind === 'fence') { const s = rank === 0 ? 0 : Math.ceil(rank / 2) * (rank % 2 ? 1 : -1); return { x: 2.5 + s * SPACE, z: RD_S + 0.4, yaw: 0, ring: null }; }
  const c = kind === 'park' ? PARK_RING : LAKE_RING;
  const R = Math.max(1.6, (n * SPACE) / (2 * Math.PI)), a = hash01('ring', kind, j) * 6.283 + (rank / n) * 6.283;
  const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
  return { x, z, yaw: Math.atan2(c.x - x, c.z - z), ring: c };
}

// Where a person goes in a slot. Returns a closed polyline starting and ending at their door, or null (they stay in). A trip
// to a shared place carries `spot` (where they stand there: { x, z, yaw, ring }).
function tripFor(p, j, h) {
  const home = p.house, door = [home.door.x, home.door.z];
  const walkZ = home.facing === -1 ? ROW_Z : HILL_Z;
  const curb = [home.x, walkZ];
  const night = h < 6.5 || h >= 21.5;
  const kind = outing(p.name, p.i, j, night);
  if (!kind) return null;                                                 // home
  if (kind === 'night') return loop([door, curb, [AVE, walkZ], [AVE, walkZ + (home.facing === -1 ? 10 : -10)]]);
  if (kind === 'row') { const dir = hash01('dir', p.name, j) < 0.5 ? -1 : 1; return loop([door, curb, [curb[0] + dir * (40 + houseRank(p.name) * SPACE), walkZ]]); }   // a stroll along the row (housemates turn back a few steps apart)
  const grp = groupsAt(j, night)[kind], at = placeIn(kind, grp.indexOf(p.i), grp.length, j);
  let trip;
  if (kind === 'fence') { const cx = Math.min(-2, at.x); trip = loop([door, curb, [AVE, walkZ], [AVE, RD_N], [cx, RD_N], [cx, RD_S], [at.x, at.z]]); }   // to Breneland's fence: look in (over the road at x -2, or further west for a place west of it)
  else if (kind === 'park') trip = loop([door, curb, [AVE, walkZ], [AVE, RD_N], [-46, RD_N], [-48, RD_S], [PARK.sign.x - 2, PARK.sign.z + 4], [at.x, at.z]]); // the park
  else trip = loop([door, curb, [AVE, walkZ], [AVE, RD_N], [30, RD_N], [50, RD_N], [at.x, at.z]]);                     // down to the lake end of the street
  trip.spot = at;   // (not `at`: arrays have an at() method)
  return trip;
}
// Which of a house's people this one is (0 for the first of them in PEOPLE's order).
const houseOf = name => Math.floor(hash01('home', name) * TOWN_HOUSES.length);
const ranks = new Map();
function houseRank(name) {
  if (ranks.has(name)) return ranks.get(name);
  const h = houseOf(name); let k = 0;
  for (const q of PEOPLE) { if (q.name === name) break; if (houseOf(q.name) === h) k++; }
  ranks.set(name, k);
  return k;
}
function loop(pts) { return [...pts, ...pts.slice(0, -1).reverse()]; }

// The residents' timetables (no bodies): where each one is at shared time t, for anyone who needs to know without the
// scene (cars.js brakes for a neighbour crossing the road). Pure: the same t gives the same answer on every client.
let roster = null;
export function residentStates(t) {
  return getRoster().map(p => stateAt(p, t));
}
function getRoster() {
  if (!roster) {
    roster = PEOPLE.map((p, i) => ({ ...p, i, house: TOWN_HOUSES[Math.floor(hash01('home', p.name) * TOWN_HOUSES.length)], tripCache: new Map() }));
    // every resident is in the phone's town cast pool (town-cast.js), probed by their own timetable (its own trip cache)
    for (const r of roster) castMember('town:' + r.name, t => !stateAt(r, t).hidden);
  }
  return roster;
}

// a girlfriend of Joyce's on one of her evenings (joyce-evening.js): from her door down Maple Ave to Breneland Rd and on to Joyce's
const toRoad = p => p.toRoad || (p.toRoad = { door: [p.house.door.x, p.house.door.z], toRoad: [[p.house.door.x, p.house.door.z], [p.house.x, p.house.facing === -1 ? ROW_Z : HILL_Z], [AVE, p.house.facing === -1 ? ROW_Z : HILL_Z], [AVE, RD_N]] });
function stateAt(p, t) {
  const g = guestAt(p.npc, t, toRoad(p), 1.25 + hash01('sp', p.name) * 0.35);
  if (g) return g;
  const pg = partyGuestAt(p.npc, t, toRoad(p), 1.25 + hash01('sp', p.name) * 0.35);   // (mall-staff: a party night's guest)
  if (pg) return pg;
  const j = Math.floor(t / SLOT), u = t - j * SLOT;
  const h = hourAt(t);
  let trip = p.tripCache.get(j);
  if (trip === undefined) { trip = tripFor(p, j, h); p.tripCache.set(j, trip); if (p.tripCache.size > 6) p.tripCache.delete(p.tripCache.keys().next().value); }
  if (!trip) {
    // at home: now and then on the porch for a bit
    const porch = hash01('porch', p.name, j) < 0.25 && u > 60 && u < 200;
    if (!porch) return { hidden: true };
    // (two or three of them share some houses: each has their own spot, the doorstep or the lawn either side of the front walk;
    // they all stood on the doorstep in one lump before, npc-lumps)
    const k = houseRank(p.name), side = k === 0 ? 0 : k % 2 ? 1 : -1, out = k === 0 ? 0 : 0.6 + Math.floor((k - 1) / 2) * 1.6;
    return { x: p.house.door.x + side * 2.2, z: p.house.door.z + p.house.facing * out, yaw: p.house.facing === 1 ? 0 : Math.PI, speed: 0, anim: Math.floor(u / 8) % 3 === 0 ? 'look' : 'idle', hidden: false };
  }
  const len = polylineLength(trip), sp = 1.25 + hash01('sp', p.name) * 0.35;
  const walkT = len / sp, stay = Math.min(150, Math.max(30, SLOT - walkT - 40));
  const half = walkT / 2;
  if (u < 15) return { hidden: true };
  const tt = u - 15;
  if (tt < half) { const [x, z, dx, dz] = alongPolyline(trip, tt * sp); return { x, z, yaw: Math.atan2(dx, dz), speed: sp, anim: null, hidden: false }; }
  if (tt < half + stay) {
    const [x, z] = alongPolyline(trip, half * sp), k = Math.floor((tt - half) / 6) + Math.floor(hash01('beat', p.name, j) * 5), at = trip.spot;
    if (at?.ring) return { x, z, yaw: at.yaw, speed: 0, anim: ['talk', 'look', 'laugh', 'idle', 'talk', 'shrug'][k % 6], hidden: false };   // a chat in a circle
    if (at) return { x, z, yaw: at.yaw + (hash01('face', p.name, j) - 0.5) * 0.8, speed: 0, anim: ['look', 'idle', 'wave', 'idle', 'look'][k % 5], hidden: false };   // looking in at the yard
    return { x, z, yaw: Math.atan2(-x, 1) + hash01('face', p.name, j) * 6.28, speed: 0, anim: ['look', 'idle', 'wave', 'idle', 'stretch'][k % 5], hidden: false };
  }
  const back = tt - half - stay;
  if (back < half) { const [x, z, dx, dz] = alongPolyline(trip, (half + back) * sp); return { x, z, yaw: Math.atan2(dx, dz), speed: sp, anim: null, hidden: false }; }
  return { hidden: true };
}

export function createTownLife(ctx) {
  const { scene, player, ui, audio, camera, net } = ctx;
  if (!TOWN_HOUSES.length) return null;
  getRoster(); // (registers the cast pool)
  // a computer builds everyone now; a phone builds a resident when the town cast (town-cast.js) first wants them, and
  // frees them again when the cast moves on (their timetable keeps running either way, so every client agrees)
  const lazy = castOn();
  const build = p => {
    p.h = new Human({ ...lookOf(p.npc, p.look) });   // (what the NPC Editor saved for them, merged when they are built: lazily on a phone)
    p.h.root.visible = false; scene.add(p.h.root);
    p.tag = ui.nameTag(p.h.root, tagOf(p.npc, p.name), '#ffffff'); p.tag.max = 16; p.tag.fade = 11;
    p.h.root.userData.crowd = { r: 0.34 }; // (they give way to everyone else: crowd.js)
  };
  const free = p => { scene.remove(p.h.root); p.h.dispose(); p.tag.remove(); p.h = null; p.tag = null; };
  const people = PEOPLE.map((p, i) => {
    const house = TOWN_HOUSES[Math.floor(hash01('home', p.name) * TOWN_HOUSES.length)];
    const person = { ...p, i, house, h: null, tag: null, tripCache: new Map(), local: null, greetAt: 0, castSeat: castSeat() };
    if (!lazy) build(person);
    return person;
  });
  const cam = camera.position;

  const V = { pitch: 150 };
  return {
    name: 'town',
    people,
    update(dt, now) {
      const t = net.serverNow() / 1000;
      const cast = lazy ? castAt(t) : null;
      for (const p of people) {
        const s = stateAt(p, t);
        if (lazy) {
          const want = cast.has('town:' + p.name);
          const on = p.castSeat.step(want, !s.hidden, s.hidden ? Infinity : Math.abs(cam.x - s.x) + Math.abs(cam.z - s.z));
          if (!on) { if (p.h) free(p); continue; }
          if (!p.h) { if (s.hidden || !mayBuild(now)) continue; build(p); } // (built the first time they step out, kept while cast)
        }
        const r = p.h.root;
        if (s.hidden) { r.visible = false; continue; }
        r.visible = true;
        // (slice-seats) a seat with a front and a back (Summit Slice's, the party): each guest's own back against it, as a player's (seats.js)
        let sx = s.x, sz = s.z;
        // (fitted on taking the seat, and once more after two seconds sat: the back measured as it sits, as picnic.js does a player)
        if (s.seat) {
          if (p.fit?.seat !== s.seat) p.fit = { seat: s.seat, f: seatFit(p.h, s.seat.front, s.seat.back), t: now, again: true };
          else if (p.fit.again && now - p.fit.t > 2 && s.anim === 'sit') { p.fit.again = false; p.fit.f = seatFit(p.h, s.seat.front, s.seat.back, true); }
          const f = p.fit.f; sx += Math.sin(s.seat.yaw) * f; sz += Math.cos(s.seat.yaw) * f; p.h.params.seatEdge = (s.seat.front - f) / (r.scale.y || 1);
        } else { p.fit = null; p.h.params.seatEdge = 0; }
        const y = streetY(sx, sz);
        if (Math.hypot(r.position.x - sx, r.position.z - sz) > 5) r.position.set(sx, y, sz);
        else { const k = Math.min(1, dt * 10); r.position.x += (sx - r.position.x) * k; r.position.z += (sz - r.position.z) * k; r.position.y = y; }
        let yaw = s.yaw, anim = s.anim;
        if (p.local && now < p.local.until) { anim = p.local.anim; yaw = Math.atan2(player.pos.x - r.position.x, player.pos.z - r.position.z); }
        let d = yaw - r.rotation.y; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2; r.rotation.y += d * Math.min(1, dt * 7);
        p.h.params.seatY = (s.seatY || 0) / (r.scale.y || 1);   // (a chair round Joyce's firepit or in her sun room; root units: seat-height, a big friend sat 4 cm over it)
        p.h.params.table = s.table || null;                        // (slice-seats: a party guest at a Summit Slice table rests the hands on its top)
        if (Math.abs(cam.x - s.x) + Math.abs(cam.z - s.z) < 90) p.h.update(dt, now, s.speed, anim === 'idle' ? null : anim);
      }
    },
    target(px, pz) {
      let best = null, bd = 2.8;
      for (const p of people) { if (!p.h || !p.h.root.visible) continue; const d = Math.hypot(px - p.h.root.position.x, pz - p.h.root.position.z); if (d < bd) { bd = d; best = p; } }
      if (!best) return null;
      return { hint: `E  Say hi to ${best.name}`, prio: 3, run: () => {
        const now = performance.now() / 1000;
        best.local = { anim: 'wave', until: now + 2.6 };
        const line = LINES[Math.floor(hash01('hi', best.name, Math.floor(now / 20)) * LINES.length)];
        ui.say(best.h.root, line, 3.5, 2.3); const q = best.h.root.position; audio.speak(q.x, q.y + 1.6, q.z, line, voiceOf(best.npc, best.voice) || V); best.h.say?.(1.2);
        player.playEmote?.('wave', now);
      } };
    },
    lazy,
    bodies() { const out = []; for (const p of people) if (p.h && p.h.root.visible) out.push({ x: p.h.root.position.x, z: p.h.root.position.z, r: 0.3 }); return out; },
  };
}
void THREE;
