// The people who work the street outside the picket fence, never inside it:
//   Pat the Mail Carrier (9 am to 5 pm Eastern): parks the mail van down the street, crosses, delivers to the houses
//     across the street, crosses back and walks our side along the fence, pops a letter into our mailbox from the
//     verge, and walks back to the van. One round every PAT_SLOT seconds.
//   Pepperoni Pete (5:30 pm to 1 am): now and then scoots up on a pizza scooter and delivers to a house across the
//     street, or to us ("Large pepperoni for... Breneland?"), leaving the box on our mailbox when nobody answers. He works out
//     of Summit Slice, the pizza place in the strip mall on Summit Rd (strip-mall, layout.js STRIP_MALL): his scooter stands in
//     its lot, every round starts with him walking out of its door to the scooter and riding east along Summit Rd and down
//     Breneland Rd to the street, and ends with the ride back and the walk in.
// The van lives at the post office across from the game store (mail-van.js): it drives down to its lay-by by the park when his
// day starts (he walks out of the office and gets in) and back to its bay when it ends (he walks in).
// Both are pure functions of the shared clock (routes built from hash01 per slot), and now and then Nala races to the
// fence to bark at them (dogs-mail.js), which puts little stops into their routes so everyone sees the same scene.
import * as THREE from 'three';
import { hash01, mulberry32 } from './util.js';
import { MAILBOX, MAIL_OFFICE, STRIP_MALL } from './layout.js';
import { TOWN_MAILBOXES, TOWN_HOUSES } from './world-town.js';
import { terrainHeight } from './terrain.js';
import { toon, glow, shadows } from './toon.js';
import { GEO, Batcher } from './batch.js';
import { treatMesh } from './dogs.js';
import { Route, routeAt, streetY, sayings, flights, Z_S, Z_N } from './mailman-route.js';
import { buildMailEpisode, nalaMailAt, daxMailAt } from './dogs-mail.js';
import { hourAt, inHours, PAT_HOURS, PIZZA_HOURS } from './npcs-day.js';
import { NPCS } from './npc-looks.js';
import { VAN, VAN_DOOR, vanAt, vanDrives, homeAt, OFFICE_WALK } from './mail-van.js';

export const PAT_SLOT = 300, PIZZA_SLOT = 180;
const NEIGHBOUR_BOXES = [-69, -43, 9, 35];   // mailboxes of the houses across the street (world.js: house x + 3)
const HOUSES = [-72, -46, 6, 32];
// (VAN: the van's spot in its lay-by by Strickler Park, facing east, down the street from the yard. mail-van.js drives it there and
// home. He gets in and out on the kerb side, VAN_DOOR)
const OUR_STAND = { x: MAILBOX.x + 0.18, z: -40.62 };  // on the verge outside the fence, facing our mailbox
const BOX_DOOR = () => [MAILBOX.x, terrainHeight(MAILBOX.x, MAILBOX.z) + 1.34, MAILBOX.z - 0.34];
export const SCOOTER = { deck: 0.27, seat: 0.3 };  // the scooter's deck top (the rider's root stands on it) and its seat over the deck (seat-height: was 0.64 over the street, the feet hung off the deck)
// (strip-mall) Pete's base: Summit Slice's door and his scooter's spot in the strip mall's lot (layout.js STRIP_MALL). The ride to the
// street: north out of the lot, east along Summit Rd in the south (eastbound) lane, right onto Breneland Rd (its west lane), down round
// the bend and east along the street's south lane to where his rounds used to begin (x -92, z -46.4); home by the other lanes. The lane
// points hug the right-hand side of each road's centre line (layout.js ROADS, LANE_OFFSET 2.1).
const SC = STRIP_MALL.scooter, PZ_DOOR = { x: STRIP_MALL.units.pizza.door.x, z: STRIP_MALL.minZ - 0.55 };
const RIDE_OUT = [[SC.x + 0.4, -118.3], [SC.x + 3.4, -124.4], [-111.5, -124.4], [-109.6, -122.0], [-109.6, -84], [-108.6, -65.9], [-102.9, -52.2], [-93.5, -46.9], [-92, -46.4]];
const RIDE_HOME = [[-92, -51.0], [-100.1, -54.9], [-104.6, -66.8], [-105.4, -84], [-105.4, -122.5], [-108.5, -128.6], [SC.x + 3.6, -128.6], [SC.x + 1.0, -121.5], [SC.x, -118.0], [SC.x, SC.z]];
const RIDE_OUT_MAPLE = [[SC.x + 0.4, -118.3], [SC.x + 3.4, -124.4], [-25, -124.4], [-22.1, -121.5], [-22, -115]];   // a Maple Row delivery: along Summit Rd, right into Maple Ave
const RIDE_HOME_MAPLE = [[-21.2, -117.5], [-18.2, -121], [-19.2, -127.2], [-23, -128.6], [SC.x + 3.6, -128.6], [SC.x + 1.0, -121.5], [SC.x, -118.0], [SC.x, SC.z]];
const SCOOTER_HOME = { x: SC.x, z: SC.z, yaw: SC.yaw, d: 0 };
export const PETE_BASE = { door: PZ_DOOR, scooter: SC };   // (tests: where his rounds start and end)
const TO_SCOOTER = [[PZ_DOOR.x - 0.6, PZ_DOOR.z - 1.0], [SC.x + 0.55, SC.z + 0.3]], FROM_SCOOTER = [[SC.x + 0.55, SC.z + 0.3], [PZ_DOOR.x - 0.6, PZ_DOOR.z - 1.0], [PZ_DOOR.x, PZ_DOOR.z]];
const TAU = Math.PI * 2;
const VAN_DRAW = 110;                             // metres, |dx| + |dz|, from you that the van is drawn

export const PAT_LOOK = NPCS.pat.look, PIZZA_LOOK = NPCS.pete.look;   // npc-looks.js: the NPC Editor dresses them
export const PAT_LINES = ['Mail call!', 'Lovely day for it.', 'Package for you!', 'Morning, neighbor!', 'Another postcard from the lake.', 'Rain or shine!'];
const PAT_LATE = ['Almost done for the day.', 'Last few letters!'];

const rightOf = yaw => [-Math.cos(yaw), Math.sin(yaw)];

export class Street {
  constructor(sys) {
    this.sys = sys;
    this.cache = new Map();
    this.fired = new Set();
    this.defs = {};          // { pat, pizza } NPC defs (set by npcs.js)
    this.doors = null;       // front-door z of the houses across the street (found once by a ray)
    this.props = null;
  }

  reset() { this.cache.clear(); }

  // ------------------------------------------------------------ slots
  slot(kind, s) {
    const key = kind + ':' + s;
    let v = this.cache.get(key);
    if (!v) {
      v = kind === 'pat' ? this.buildPat(s) : this.buildPizza(s);
      this.cache.set(key, v);
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
    }
    return v;
  }
  slotAt(kind, t) { return this.slot(kind, Math.floor(t / (kind === 'pat' ? PAT_SLOT : PIZZA_SLOT))); }
  working(s) { return inHours(hourAt(s * PAT_SLOT + 1), PAT_HOURS[0], PAT_HOURS[1]); }

  finish(v) {
    // Nala now and then: the episode may add his reaction stops to the route
    if (v.route && v.visible) {
      v.holdAt = r => this.holdAtOurs(r);
      const r = buildMailEpisode(this.sys, v);
      if (r) { v.ep = r.ep; v.route = r.route; }
    }
    v.says = v.route ? sayings(v.route, v.key) : [];
    v.flights = v.route ? flights(v.route) : [];
    return v;
  }

  buildPat(s) {
    const T0 = s * PAT_SLOT, T1 = T0 + PAT_SLOT;
    const work = this.working(s);
    const v = { kind: 'pat', key: 'pat:' + s, s, T0, T1, work, visible: work, arrive: work && !this.working(s - 1), leave: work && !this.working(s + 1), walkDir: -1, ep: null };
    const R = new Route(T0).at(VAN_DOOR[0], VAN_DOOR[1]);
    if (!work) { this.homeWalk(s, R); v.route = R; return this.finish(v); }
    const rnd = mulberry32(Math.floor(hash01('patround', s) * 4294967296));
    const late = hourAt(T0) > 15.5;
    const line = () => (late && rnd() < 0.4 ? PAT_LATE : PAT_LINES)[Math.floor(rnd() * (late ? 2 : PAT_LINES.length)) % (late ? 2 : PAT_LINES.length)];
    if (v.arrive) this.fromOffice(v, R); else R.hide(2 + rnd() * 5);
    // two rounds in three go through the neighborhoods (Maple Row, then Summit Hill); the third is our street (and the day's first
    // and last: they start and end at the van, which brings him from the post office and takes him back)
    if (s % 3 !== 0 && TOWN_MAILBOXES.length && !v.arrive && !v.leave) return this.vanTimes(this.patTown(s, v, R, rnd, line, T1));
    // along the sidewalk and out from behind the van to the lay-by's edge, look both ways, cross to the houses
    R.walk([[VAN.x - 3.4, VAN_DOOR[1] + 0.1], [VAN.x - 3.4, -44.4]]).hold(1.7, Math.PI, [[0, 'look']]).walk([[VAN.x - 3.4, -53.4], [VAN.x - 2.4, Z_N]]);
    for (const mx of NEIGHBOUR_BOXES) {
      if (rnd() > 0.8) continue;                                  // no mail for them today
      R.walk([[mx - 1.8, Z_N]]).walk([[mx, -56.2]], 1.3, { hand: 'letter' });
      const post = 1.05, wave = rnd() < 0.3;
      R.hold(2.5 + rnd() * 0.6 + (wave ? 1.3 : 0), Math.PI, wave ? [[0, 'point'], [1.4, 'wave']] : [[0, 'point'], [1.35, 'idle']],
        { hands: [[0, 'letter'], [post, null]], say: wave || rnd() < 0.15 ? [[1.5, wave ? 'Have a good one!' : line()]] : null });
      R.walk([[mx + 1.8, Z_N]]);
    }
    // cross back at the far end of the street and walk our side, along the fence
    R.walk([[44.6, Z_N], [44.6, -53.3]]).hold(1.9, 0, [[0, 'look']]).walk([[44.6, -44.3], [43.4, Z_S]]);
    const stops = [{ x: MAILBOX.x, kind: 'ours' }];
    if (rnd() < 0.6) { const xw = rnd() < 0.5 ? -48 + rnd() * 40 : 14 + rnd() * 24; stops.push({ x: xw, kind: 'wave' }); }
    stops.sort((a, b) => b.x - a.x);
    for (const st of stops) {
      if (st.kind === 'wave') {
        R.walk([[st.x, Z_S]]).hold(1.9, 0, [[0, 'wave']], { say: [[0.3, line()]] });
      } else {
        R.walk([[MAILBOX.x + 1.9, Z_S]]).walk([[OUR_STAND.x, OUR_STAND.z]], 1.3, { hand: 'letter' });
        const door = BOX_DOOR(), [rx, rz] = rightOf(0);
        const from = [OUR_STAND.x + rx * 0.2 + 0.0, 0.44 + 1.5, OUR_STAND.z + rz * 0.2 + 0.3];
        R.hold(2.7, 0, [[0, 'throw'], [0.9, 'idle']], {
          hands: [[0, 'letter'], [0.28, null]],
          fly: [{ u: 0.28, dur: 0.45, kind: 'letter', from, to: door, h: 0.35 }],
          say: rnd() < 0.75 ? [[0.8, rnd() < 0.5 ? 'Mail call!' : line()]] : null,
        });
        R.walk([[MAILBOX.x - 1.9, Z_S]]);
      }
    }
    // back to the van round the lay-by's sidewalk, and in
    R.walk([[VAN.x + 12, Z_S], [VAN.x + 5.5, -40.5], VAN_DOOR]);
    R.hide(T1 - R.t);
    R.minHide = 3;      // the van leaves once he's in it (vanTimes)
    v.route = R;
    v.walkEnd = R.segs[R.segs.length - 1].t0;
    return this.vanTimes(this.finish(v));
  }

  // The first round of the day: out of the post office's front door to the van in its bay, in, and the drive down to its lay-by
  // (mail-van.js); he steps out by its cab when it has parked. v.vanOut = when it pulls out.
  fromOffice(v, R) {
    const D = MAIL_OFFICE.door;
    R.at(D.x, D.z).hide(2).walk(OFFICE_WALK, 1.45);
    v.vanOut = R.t + 1.2;
    R.hide(v.vanOut + vanDrives().out.T + 1.6 - R.t);
    R.at(VAN_DOOR[0], VAN_DOOR[1]);
  }
  // The last round's van: it leaves the lay-by once he is back in it (the route's final hide), not before the drive home fits the slot
  vanTimes(v) {
    if (v.leave) { const D = vanDrives(), last = v.route.segs[v.route.segs.length - 1]; v.vanDep = Math.max(v.T1 - D.home.T - D.back.T - 4, last.t0 + 1.5); }
    return v;
  }
  // After hours: the slot after his last round, he climbs out of the van in its bay and walks into the office; otherwise he is not about
  homeWalk(s, R) {
    if (!this.working(s - 1)) { R.hide(PAT_SLOT); return; }
    const p = this.slot('pat', s - 1), D = MAIL_OFFICE.door, w = OFFICE_WALK;
    R.at(w[w.length - 1][0], w[w.length - 1][1]).hide(Math.max(0.3, homeAt(p) + 1.2 - R.t));
    R.walk([...w.slice(0, -1).reverse(), [D.x, D.z]], 1.35).hide(R.t0 + PAT_SLOT - R.t);
  }

  // A round through one neighborhood: he comes round the Maple Ave corner on foot (the van is parked out of sight),
  // works the mailboxes along the sidewalk (letter in, flag up, a word now and then), and heads back the same way.
  patTown(s, v, R, rnd, line, T1) {
    const summit = s % 3 === 2;                                   // odd rounds Maple Row (south of Summit Rd), even Summit Hill
    const boxes = TOWN_MAILBOXES.filter(m => (summit ? m.house.facing === 1 : m.house.facing === -1)).sort((a, b) => a.x - b.x);
    const walkZ = summit ? -132.5 : -120.5;                       // the sidewalk on the boxes' side
    const standOff = summit ? 1.0 : -1.0, faceYaw = summit ? Math.PI : 0; // stand on the sidewalk side of the box, face the house
    const AVE = -25.5;                                             // Maple Ave's west sidewalk
    R.at(AVE, -57);
    R.walk([[AVE, summit ? -123.5 : -116], [AVE, walkZ]], 1.85);
    if (summit) R.walk([[-22, -123.5], [-22, -130], [AVE, walkZ]], 1.7); // over the crosswalk
    const first = boxes.find(m => m.x > AVE) ? boxes : boxes.slice().reverse();
    // the boxes east of the avenue first, then back west
    const east = first.filter(m => m.x > AVE), west = first.filter(m => m.x <= AVE).reverse();
    for (const list of [east, west]) {
      for (const m of list) {
        if (rnd() > 0.85) continue;                                // no mail for them today
        R.walk([[m.x - 1.8 * Math.sign(m.x - AVE || 1), walkZ]], 1.85).walk([[m.x, m.z + standOff]], 1.5, { hand: 'letter' });
        const wave = rnd() < 0.25;
        R.hold(2.4 + rnd() * 0.5 + (wave ? 1.2 : 0), faceYaw, wave ? [[0, 'point'], [1.3, 'wave']] : [[0, 'point'], [1.3, 'idle']],
          { hands: [[0, 'letter'], [1.0, null]], say: wave || rnd() < 0.12 ? [[1.4, wave ? 'Have a good one!' : line()]] : null });
        R.walk([[m.x + 1.8 * Math.sign(m.x - AVE || 1), walkZ]], 1.85);
      }
      if (list === east) R.walk([[AVE, walkZ]], 1.85);
    }
    R.walk([[AVE, walkZ]], 1.85);
    if (summit) R.walk([[-22, -130], [-22, -123.5], [AVE, -116]], 1.7);
    R.walk([[AVE, -57]], 1.85);
    R.hide(T1 - R.t);
    R.minHide = 3;
    v.route = R;
    v.walkEnd = R.segs[R.segs.length - 1].t0;
    v.town = true;
    return this.finish(v);
  }

  buildPizza(s) {
    const T0 = s * PIZZA_SLOT, T1 = T0 + PIZZA_SLOT;
    const on = inHours(hourAt(T0 + 1), PIZZA_HOURS[0], PIZZA_HOURS[1]) && hash01('pizza', s) < 0.42;
    const v = { kind: 'pizza', key: 'pizza:' + s, s, T0, T1, visible: on, ep: null, far: false, walkDir: 1 };
    const R = new Route(T0).at(PZ_DOOR.x, PZ_DOOR.z);   // (strip-mall) in the pizza place until the round begins
    if (!on) { R.hide(PIZZA_SLOT); v.route = R; return this.finish(v); }
    const H = k => hash01('pizza', s, k);
    const lead = 4 + H('lead') * 20;   // (the ride from the mall and back takes about a minute of the slot: a shorter lead than before)
    R.hide(lead);
    // out of the door, over to the scooter, on it and away (the scooter stands in the mall's lot, nose to the walkway)
    R.walk(TO_SCOOTER, 1.3).walk([[SC.x, SC.z]], 1.0).hold(0.9, SC.yaw, [[0, 'sit']], { seated: true });
    v.ours = H('ours') < 0.4;
    if (v.ours) {
      const side = H('side') < 0.5 ? -1 : 1, px = MAILBOX.x + side * (7 + H('px') * 5);
      v.walkDir = -side;
      v.park = { x: px, z: -45.3, yaw: Math.PI / 2 };
      R.ride([...RIDE_OUT, [px - 4.5, -46.4], [px, -45.3]], 6.5).hold(0.7, Math.PI / 2, [[0, 'sit']], { seated: true });
      R.walk([[px - 0.2, -44.45]], 1.2).walk([[px - 0.2, Z_S], [MAILBOX.x + side * 1.9, Z_S], [OUR_STAND.x, OUR_STAND.z]], 1.5);
      R.hold(8.4, 0, [[0, 'read'], [2.6, 'look'], [4.3, 'shrug'], [6.0, 'point'], [7.1, 'wave']], {
        hands: [[0, 'box'], [6.3, 'bag']],
        say: [[0.3, 'Large pepperoni for... Breneland?'], [3.0, 'Hello-o?'], [5.1, 'I\'ll leave it on the mailbox!'], [7.2, 'Enjoy!']],
        leaveBox: 6.3,
      });
      R.walk([[MAILBOX.x + side * 1.9, Z_S], [px - 0.2, Z_S], [px - 0.2, -44.45]], 1.5).walk([[px, -45.3]], 1.2);
      R.hold(0.8, Math.PI / 2, [[0, 'sit']], { seated: true });
      R.ride([[px + 2.0, -46.4], [px + 2.2, -48.6], [px + 0.2, -50.7], [px - 3, -51.0], ...RIDE_HOME], 6.2);
    } else if (H('town') < 0.5 && TOWN_HOUSES.some(h => h.facing === -1 && Math.abs(h.x + 22) < 32)) {
      // a delivery up in Maple Row: scoot up Maple Ave, park at the top, walk to the door
      const opts = TOWN_HOUSES.filter(h => h.facing === -1 && Math.abs(h.x + 22) < 32);
      const hs = opts[Math.floor(H('thouse') * opts.length)];
      v.far = true; v.walkDir = 1;
      v.park = { x: -22, z: -115, yaw: 0 };
      R.ride(RIDE_OUT_MAPLE, 6.5).hold(0.7, 0, [[0, 'sit']], { seated: true });
      R.walk([[-25.5, -116], [-25.5, -120.5], [hs.x, -120.5], [hs.door.x, hs.door.z]], 1.5);
      const knock = H('what');
      R.hold(7.6, 0, [[0, 'wave'], [1.4, 'look'], [2.8, 'read'], [4.5, 'wave'], [5.8, 'idle']], {
        hands: [[0, 'bag'], [2.8, 'box'], [4.4, 'bag']],
        say: [[0.2, 'Pizza!'], [3.0, knock < 0.33 ? 'Large pepperoni, extra cheese!' : knock < 0.66 ? 'One veggie supreme!' : 'Hot and fresh!'], [4.7, 'Enjoy!']],
      });
      R.walk([[hs.x, -120.5], [-25.5, -120.5], [-25.5, -116], [-22, -115]], 1.5);
      R.hold(0.8, 0, [[0, 'sit']], { seated: true });
      R.ride(RIDE_HOME_MAPLE, 6.2);
    } else {
      const hx = HOUSES[Math.floor(H('house') * HOUSES.length)];
      const doorZ = this.doorZ(hx);
      v.far = true; v.walkDir = 1;
      v.park = { x: hx + 1.6, z: -52.2, yaw: Math.PI / 2 };
      R.ride([...RIDE_OUT, [hx - 7, -46.4], [hx - 2.5, -49.4], [hx + 1.6, -52.2]], 6.5).hold(0.7, Math.PI / 2, [[0, 'sit']], { seated: true });
      R.walk([[hx + 1.5, -53.3]], 1.2).walk([[hx + 0.3, -55.0], [hx, -56.8], [hx, doorZ]], 1.5);
      const knock = H('what');
      R.hold(7.6, Math.PI, [[0, 'wave'], [1.4, 'look'], [2.8, 'read'], [4.5, 'wave'], [5.8, 'idle']], {
        hands: [[0, 'bag'], [2.8, 'box'], [4.4, 'bag']],
        say: [[0.2, 'Pizza!'], [3.0, knock < 0.33 ? 'Large pepperoni, extra cheese!' : knock < 0.66 ? 'One veggie supreme!' : 'Hot and fresh!'], [4.7, 'Enjoy!']],
      });
      R.walk([[hx, -56.8], [hx + 0.3, -55.0], [hx + 1.5, -53.3]], 1.5).walk([[hx + 1.6, -52.2]], 1.2);
      R.hold(0.8, Math.PI / 2, [[0, 'sit']], { seated: true });
      R.ride([[hx + 3.4, -51.4], [hx + 3.6, -49.6], [hx + 1.4, -48.8], [hx - 1.6, -50.3], ...RIDE_HOME], 6.2);
    }
    // home: off the scooter and in at the door (hidden inside till the slot ends)
    R.hold(0.9, SC.yaw, [[0, 'sit']], { seated: true }).walk(FROM_SCOOTER, 1.3);
    R.hide(T1 - R.t);
    v.route = R;
    return this.finish(v);
  }

  // His mailbox stop (for Nala's timing): start time of the hold at our mailbox, or null.
  holdAtOurs(route) {
    for (const g of route.segs) if (g.kind === 'hold' && Math.abs(g.x - OUR_STAND.x) < 0.3 && Math.abs(g.z - OUR_STAND.z) < 0.3) return g.t0;
    return null;
  }

  // Front of each house across the street, found once with a ray (world.js places them with its own random numbers).
  doorZ(hx) {
    if (!this.doors) {
      this.doors = new Map();
      const scene = this.sys.scene, meshes = [];
      scene.updateMatrixWorld(true);
      scene.traverse(o => { if (o.isMesh && (o.name === 'neighborhood' || o.name === 'neighborhood-details')) meshes.push(o); });
      const rc = new THREE.Raycaster();
      for (const x of HOUSES) {
        rc.set(new THREE.Vector3(x, 1.3, -57.6), new THREE.Vector3(0, 0, -1)); rc.far = 16;
        const hit = meshes.length ? rc.intersectObjects(meshes, false)[0] : null;
        this.doors.set(x, hit ? Math.round((hit.point.z + 1.35) * 100) / 100 : -64.5);   // in front of the doorstep
      }
    }
    return this.doors.get(hx) ?? -64.5;
  }

  // ------------------------------------------------------------ state

  // A street walker at shared time t (the NPC system eases toward it like everyone else).
  stateOf(d, t) {
    const v = this.slotAt(d.role, t);
    const s = routeAt(v.route, t, d.role === 'pizza' ? 'bag' : null);
    s.v = v;
    return s;
  }

  // The mail episode running at t (checks this slot and the one before), or null.
  episodeAt(t) {
    for (const kind of ['pat', 'pizza']) {
      const P = kind === 'pat' ? PAT_SLOT : PIZZA_SLOT, s = Math.floor(t / P);
      for (const k of [s, s - 1]) {
        const v = this.slot(kind, k);
        if (v.ep && t >= v.ep.ts && t <= v.ep.te) return v.ep;
      }
    }
    return null;
  }
  // Is any mail episode on at any moment in [t0, t1]? (the dogs' play episodes keep out of the way)
  busy(t0, t1) {
    for (const kind of ['pat', 'pizza']) {
      const P = kind === 'pat' ? PAT_SLOT : PIZZA_SLOT;
      for (let s = Math.floor(t0 / P) - 1; s <= Math.floor(t1 / P); s++) {
        const ep = this.slot(kind, s).ep;
        if (ep && ep.ts - 2 < t1 && ep.te + 2 > t0) return true;
      }
    }
    return false;
  }
  nalaState(t) { const ep = this.episodeAt(t); if (!ep) return null; const s = nalaMailAt(this.sys, ep, t); s.ep = ep; s.escape = !!(ep.escape && t >= ep.tB && t <= ep.tPr + ep.ret + 0.5); return s; } // (escape: out through the front gate, dogs-mail.js)
  daxState(t, base) { const ep = this.episodeAt(t); return ep ? daxMailAt(ep, t, base, this.sys) : null; } // both dogs go to the fence now

  // ------------------------------------------------------------ per frame: lines, sounds, props

  update(dt, t, playerPos = null) {
    if (!this.props) this.buildProps();
    const P = this.props;
    const pat = this.slotAt('pat', t), pz = this.slotAt('pizza', t);
    this.fire(pat, t); this.fire(pz, t);
    const prevPz = this.slot('pizza', pz.s - 1);
    this.fire(this.slot('pat', pat.s - 1), t); this.fire(prevPz, t);

    // the mail van: in its bay at the post office, on the road, or in its lay-by (mail-van.js; the model faces +x)
    // (always somewhere, in its bay at night. Past VAN_DRAW metres from you it's a speck and isn't drawn, a few draw calls saved
    // wherever the town is in view)
    const van = P.van, vn = vanAt(this, t);
    van.visible = !playerPos || Math.abs(playerPos.x - vn.x) + Math.abs(playerPos.z - vn.z) < VAN_DRAW;
    van.position.set(vn.x, streetY(vn.x, vn.z), vn.z);
    van.rotation.y = vn.yaw - Math.PI / 2;

    // the pizza scooter
    const sc = P.scooter;
    const vs = this.scooterAt(pz, t);
    sc.visible = !!vs;
    if (vs) { sc.position.set(vs.x, streetY(vs.x, vs.z), vs.z); sc.rotation.y = vs.yaw; for (const w of P.scWheels) w.rotation.x = vs.d / 0.2; }

    // the pizza left on our mailbox (until the end of that delivery slot)
    let boxOn = false;
    for (const v of [pz, prevPz]) if (v.visible && v.ours) { const h = v.route.segs.find(g => g.leaveBox); if (h && t >= h.t0 + h.leaveBox && t < v.T1) boxOn = true; }
    P.mailboxPizza.visible = boxOn;

    // things in the air
    P.flyLetter.visible = false; P.flyBiscuit.visible = false;
    for (const v of [pat, this.slot('pat', pat.s - 1)]) for (const f of v.flights) {
      const k = (t - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      const m = f.kind === 'letter' ? P.flyLetter : P.flyBiscuit;
      m.visible = true;
      m.position.set(f.from[0] + (f.to[0] - f.from[0]) * k, f.from[1] + (f.to[1] - f.from[1]) * k + f.h * 4 * k * (1 - k), f.from[2] + (f.to[2] - f.from[2]) * k);
      m.rotation.set(k * 6, k * 9, 0);
    }
  }

  // Lines and sounds due now (each once per client).
  fire(v, t) {
    const sys = this.sys;
    for (const s of v.says) {
      if (t < s.t || t > s.t + 2.5 || this.fired.has(s.key)) continue;
      this.mark(s.key);
      const d = this.defs[v.kind];
      if (d && d.body.root.visible) sys.say(d, s.text, 3.6);
    }
    if (!v.ep) return;
    v.ep.ev.forEach((e, i) => {
      const key = v.key + ':ev:' + i;
      if (t < e.t || t > e.t + 2.5 || this.fired.has(key)) return;
      this.mark(key);
      const d = sys.dog(e.dog);
      if (!d) return;
      if (e.text) sys.say(d, e.text, 2.8, false, 'alert');   // the dogs at the van or the scooter: warning barks
      if (e.sfx) { const p = d.body.root.position; sys.audio?.play(e.sfx, p.x, p.y + 0.3, p.z); }
    });
  }
  mark(key) { if (this.fired.size > 300) this.fired.clear(); this.fired.add(key); }

  // Where the scooter is: riding with Pete, parked where he left it on a delivery, or (strip-mall) at home in the strip mall's lot
  // outside Summit Slice, nose to the walkway, whenever he is not out (never null now: the scooter is always somewhere).
  scooterAt(v, t) {
    if (!v.visible) return SCOOTER_HOME;
    const rides = v.route.segs.filter(g => g.kind === 'ride');
    if (!rides.length || t < rides[0].t0 || t > rides[rides.length - 1].t0 + rides[rides.length - 1].dur) return SCOOTER_HOME;
    const s = routeAt(v.route, t);
    if (s.riding) return { x: s.x, z: s.z, yaw: s.yaw, d: s.u * s.seg.sp };
    return { x: v.park.x, z: v.park.z, yaw: v.park.yaw, d: 0 };
  }

  // The van's and the scooter's footprints as drawn this frame, as body circles for the player to bump into (cars.js
  // bodies() hands them to main.js with the cars): parked or moving, only when they are in the street and near you.
  vehicleBodies(out, px, pz) {
    const P = this.props;
    if (!P) return out;
    const van = P.van;
    if (van.visible && Math.abs(van.position.x - px) < 8 && Math.abs(van.position.z - pz) < 8) {
      const fx = Math.cos(van.rotation.y), fz = -Math.sin(van.rotation.y);   // its local +x, the way it faces
      for (const k of [-1.55, -0.5, 0.5, 1.55]) out.push({ x: van.position.x + fx * k, z: van.position.z + fz * k, r: 1.1 }); // 5.2 m long, 2.2 m wide
    }
    const sc = P.scooter;
    if (sc.visible && Math.abs(sc.position.x - px) < 6 && Math.abs(sc.position.z - pz) < 6) {
      const fx = Math.sin(sc.rotation.y), fz = Math.cos(sc.rotation.y);
      for (const [k, r] of [[-0.55, 0.5], [0.25, 0.45]]) out.push({ x: sc.position.x + fx * k, z: sc.position.z + fz * k, r }); // the deck and the box behind the seat
    }
    return out;
  }

  // What the walker holds this frame (called by npcs.js after it placed the body).
  dress(d, s) {
    if (!this.props) this.buildProps();
    const P = this.props, body = d.body;
    if (d.role === 'pat') {
      if (!P.letter.parent && body.handR) { body.handR.add(P.letter); }
      P.letter.visible = s.hand === 'letter';
      return;
    }
    if (!P.bag.parent && body.handR) { P.bag.userData.upright = 'hang'; body.handR.add(P.bag); } // (human.js hangs it level from the fist)
    if (!P.box.parent) body.root.add(P.box);
    P.bag.visible = s.hand === 'bag' && !s.seated;
    P.box.visible = s.hand === 'box';
  }

  buildProps() {
    const g = this.sys.group;
    const P = this.props = { _q: new THREE.Quaternion(), _q2: new THREE.Quaternion(), _up: new THREE.Vector3(0, 1, 0) };
    // ---- the mail van (faces +x): white body, red and blue stripes, a big envelope on the side
    const van = P.van = new THREE.Group(); van.name = 'mail-van';
    const b = new Batcher({ vertexColors: true });
    const bx = (x0, y0, z0, x1, y1, z1, c) => b.boxMinMax(x0, y0, z0, x1, y1, z1, c);
    bx(-2.5, 0.42, -1.05, 1.45, 2.45, 1.05, '#f4f1ea');          // cargo box
    bx(1.45, 0.42, -1.0, 2.5, 1.55, 1.0, '#f4f1ea');             // cab nose
    bx(1.45, 1.55, -1.0, 2.05, 2.1, 1.0, '#f4f1ea');             // cab roof
    bx(-2.52, 1.02, -1.07, 2.52, 1.2, 1.07, '#e0463c');          // red stripe
    bx(-2.52, 1.2, -1.07, 2.52, 1.32, 1.07, '#2f5da8');          // blue stripe
    bx(-2.58, 0.3, -1.08, -2.45, 0.55, 1.08, '#3a3f47');         // bumpers
    bx(2.45, 0.3, -1.08, 2.6, 0.55, 1.08, '#3a3f47');
    for (const s of [-1, 1]) {                                   // the envelope logo on each side
      bx(-1.6, 1.52, s * 1.06 - 0.02, 0.2, 2.25, s * 1.06 + 0.02, '#2f5da8');
      bx(-1.52, 1.58, s * 1.075 - 0.02, 0.12, 2.19, s * 1.075 + 0.02, '#ffffff');
      b.add(GEO.box, '#e0463c', { x: -0.14, y: 2.03, z: s * 1.09, sx: 0.22, sy: 0.22, sz: 0.02 });   // the stamp
      b.add(GEO.box, '#2f5da8', { x: -0.95, y: 1.95, z: s * 1.09, sx: 1.05, sy: 0.05, sz: 0.02, rz: -0.33 });  // the flap
      b.add(GEO.box, '#2f5da8', { x: -0.95, y: 1.95, z: s * 1.09, sx: 1.05, sy: 0.05, sz: 0.02, rz: 0.33 });
    }
    b.add(GEO.box, glow('#cfe8f5'), { x: 2.07, y: 1.78, z: 0, sx: 0.06, sy: 0.5, sz: 1.84, rz: -0.35 });   // windscreen
    for (const s of [-1, 1]) b.add(GEO.box, glow('#cfe8f5'), { x: 1.8, y: 1.78, z: s * 1.005, sx: 0.5, sy: 0.4, sz: 0.02 });
    for (const s of [-1, 1]) {
      b.add(GEO.box, glow('#fff3c4'), { x: 2.52, y: 0.95, z: s * 0.72, sx: 0.04, sy: 0.18, sz: 0.34 });
      b.add(GEO.box, glow('#e0463c'), { x: -2.52, y: 1.6, z: s * 0.85, sx: 0.04, sy: 0.3, sz: 0.18 });
    }
    // the wheels are part of the body's batch (the van is always drawn, in its bay at night, and round tyres and hubs look the same
    // turned or not, so they needn't be meshes of their own)
    for (const [x, z] of [[-1.6, -0.95], [-1.6, 0.95], [1.7, -0.95], [1.7, 0.95]]) {
      b.add(GEO.cyl12, '#2b2b2f', { x, y: 0.42, z, sx: 0.42, sy: 0.3, sz: 0.42, rx: Math.PI / 2 });
      b.add(GEO.cyl8, '#c9c9cf', { x, y: 0.42, z: z + Math.sign(z) * 0.01, sx: 0.2, sy: 0.32, sz: 0.2, rx: Math.PI / 2 });
    }
    b.build(van, 'mail-van');
    P.vanWheels = [];
    van.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    van.visible = false;
    g.add(van);

    // ---- the pizza scooter (faces +z), with a delivery box on the back
    const sc = P.scooter = new THREE.Group(); sc.name = 'pizza-scooter';
    const r = new Batcher({ vertexColors: true });
    r.boxMinMax(-0.17, 0.16, -0.3, 0.17, 0.27, 0.36, '#e0463c');                      // deck
    r.add(GEO.sphere, '#e0463c', { x: 0, y: 0.32, z: -0.38, sx: 0.25, sy: 0.23, sz: 0.4 });   // rear body
    r.boxMinMax(-0.15, SCOOTER.deck + SCOOTER.seat - 0.09, -0.62, 0.15, SCOOTER.deck + SCOOTER.seat, -0.1, '#2b2b2f'); // seat (seat-height: 0.57, was 0.67)
    r.add(GEO.box, '#e0463c', { x: 0, y: 0.6, z: 0.42, sx: 0.4, sy: 0.72, sz: 0.08, rx: -0.22 });   // leg shield
    r.add(GEO.cyl6, '#9aa0a8', { x: 0, y: 0.98, z: 0.5, sx: 0.03, sy: 0.3, sz: 0.03, rx: -0.22 });  // stem
    r.add(GEO.box, '#3a3f47', { x: 0, y: 1.12, z: 0.53, sx: 0.62, sy: 0.05, sz: 0.05 });            // handlebar
    r.add(GEO.box, '#2b2b2f', { x: 0.29, y: 1.12, z: 0.53, sx: 0.09, sy: 0.07, sz: 0.07 });
    r.add(GEO.box, '#2b2b2f', { x: -0.29, y: 1.12, z: 0.53, sx: 0.09, sy: 0.07, sz: 0.07 });
    r.add(GEO.sphere, glow('#fff3c4'), { x: 0, y: 0.98, z: 0.6, sx: 0.08, sy: 0.07, sz: 0.04 });   // headlight
    r.boxMinMax(-0.25, 0.56, -1.0, 0.25, 1.0, -0.56, '#f3efe6');                     // delivery box
    r.boxMinMax(-0.26, 0.74, -1.01, 0.26, 0.84, -0.55, '#e0463c');                   // its red band
    r.boxMinMax(-0.27, 1.0, -1.02, 0.27, 1.04, -0.54, '#d9362b');                    // lid
    r.build(sc, 'pizza-scooter');
    P.scWheels = [];
    const sw = new THREE.CylinderGeometry(0.2, 0.2, 0.11, 12); sw.rotateZ(Math.PI / 2);
    for (const z of [-0.56, 0.52]) { const w = new THREE.Mesh(sw, toon('#2b2b2f')); w.position.set(0, 0.2, z); sc.add(w); P.scWheels.push(w); }
    shadows(sc, true, false);
    sc.visible = false;
    g.add(sc);

    // ---- small things: a letter (Pat's hand), a letter and a biscuit in the air, a hot bag and a pizza box (Pete)
    const letterGeo = new THREE.BoxGeometry(0.22, 0.14, 0.012);
    const letter = () => { const m = new THREE.Group(); m.add(new THREE.Mesh(letterGeo, toon('#fbfaf5'))); const st = new THREE.Mesh(GEO.box, toon('#e0463c')); st.scale.set(0.04, 0.04, 0.014); st.position.set(0.07, 0.035, 0.002); m.add(st); return m; };
    P.letter = letter(); P.letter.position.set(0, -0.06, 0.06); P.letter.rotation.set(0.2, 0, 0.4); P.letter.visible = false;
    P.flyLetter = letter(); P.flyLetter.visible = false; g.add(P.flyLetter);
    P.flyBiscuit = treatMesh(); P.flyBiscuit.visible = false; g.add(P.flyBiscuit);
    const bag = P.bag = new THREE.Group();
    const bagPart = new THREE.Mesh(GEO.box, toon('#c8322b')); bagPart.scale.set(0.13, 0.3, 0.44); bagPart.position.set(0.02, -0.22, 0); bag.add(bagPart);
    const strap = new THREE.Mesh(GEO.box, toon('#2b2b2f')); strap.scale.set(0.03, 0.08, 0.2); strap.position.set(0.02, -0.04, 0); bag.add(strap);
    const logo = new THREE.Mesh(GEO.box, toon('#ffc933')); logo.scale.set(0.135, 0.1, 0.16); logo.position.set(0.02, -0.2, 0); bag.add(logo);
    bag.visible = false;
    const pizzaBox = () => {
      const m = new THREE.Group();
      const c = new THREE.Mesh(GEO.box, toon('#e8d2a8')); c.scale.set(0.44, 0.07, 0.44); m.add(c);
      const l = new THREE.Mesh(GEO.box, toon('#d9362b')); l.scale.set(0.2, 0.074, 0.2); m.add(l);
      return m;
    };
    P.box = pizzaBox(); P.box.position.set(0, 1.02, 0.36); P.box.visible = false;
    P.mailboxPizza = pizzaBox(); P.mailboxPizza.position.set(MAILBOX.x, terrainHeight(MAILBOX.x, MAILBOX.z) + 1.76, MAILBOX.z); P.mailboxPizza.rotation.y = 0.2;
    P.mailboxPizza.visible = false; g.add(P.mailboxPizza);
    for (const m of [P.letter, P.flyLetter, P.bag, P.box, P.mailboxPizza]) shadows(m, true, false);
    void TAU; void PETE_BASE;
  }
}
