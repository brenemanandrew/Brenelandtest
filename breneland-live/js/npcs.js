// NPCs that everyone sees doing the same thing at the same moment, without the
// server simulating anything. Behaviour is a pure function of the shared clock:
// time is cut into 16-second beats, and every beat each NPC's plan (where to stand,
// who to meet, what to say) comes from a hash of (npc, beat). Clients agree because
// they hash the same numbers.
import * as THREE from 'three';
import { Human } from './human.js';
import { Unicorn } from './unicorn.js';
import { Dog, DAX, NALA, MOLLY, registerDogSfx } from './dogs.js';
import { mollyPlan } from './molly-day.js';   // Molly, Joyce's dog: her plan follows Joyce's day
import { DogBrain } from './dogs-brain.js';
import { DogSync } from './dogs-sync.js';
import { episodeState, episodeOf, EP_SLOT } from './dogs-play.js';
import { toyState } from './dog-toys.js';
import { kevinState, setKevinWorld, crewMateState, CREW_POOL } from './kevin-day.js';
import { kevinFrame, kevinDress, crewDress } from './kevin-boat.js';
import { setJoyceWorld, joyceState, joyceDress } from './joyce-day.js';   // her day and her golf cart
import { Street, PAT_LOOK, PIZZA_LOOK, PAT_LINES, SCOOTER } from './mailman.js';
import { streetY } from './mailman-route.js';
import {
  stintAt, pinned, moodAt, isDark, areaLines, greeting, dogsAsleep, dogsLively, louOut, clearDayCache,
} from './npcs-day.js';
import { hourOverride } from './daytime.js';
import { castMember, castOn, castAt, castSeat, mayBuild, castReset } from './town-cast.js';
import { NPCS, lookOf, voiceOf, tagOf } from './npc-looks.js';
import { hash01, mulberry32, polylineLength, alongPolyline, closestOnSeg, angleLerp, pointInPoly } from './util.js';
import { MAILBOX, STREET, YARD as WALK, HOUSE, GARAGE, FENCE_Z, PORCH, PORCH_SWING, YARD_TREES, DOG_BEDS, INDOOR_DOG_BED, inHouseBox, HEDGE, hedgeAt } from './layout.js'; // WALK here = the dogs' yard
import { farLawn } from './perf-flags.js';   // a far lawn's folk aren't drawn
import { bedLift, bedAt } from './dog-beds.js';   // a dog in its bed sits on the cushion

// In this share of the itinerary loops both dogs favour their beds for the long nap (one roll for both, so they nap there
// together). The rest of the loops pick by the spots' weights (the beds among them).
const BEDS_TOGETHER = 0.6;
// Of the loops both dogs take to their beds, this share they spend together in the big bed in the living room instead. The way
// in and out: from the bed round the loveseat's end, past the sofa, to the front door and out onto the porch (front to back).
const INDOOR_SHARE = 0.55;
const IN_WAY = [[0.2, -4.75], [0.28, -3.1], [0.9, 0.0], [0.82, 1.55], [0.5, 3.7]];

const L = 16;          // seconds per beat
const LOOP = 40;       // beats per wanderer itinerary (~10.7 minutes)
const TAU = Math.PI * 2;

const GENERIC_PAIRS = [['talk', 'laugh'], ['wave', 'wave'], ['highfive', 'highfive'], ['talk', 'talk'], ['talk', 'shrug']];
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// Leaving for the night: out round the west end of the fence and off down the street (never through the fence).
const WOODS = [2.6, -36.5];                                                 // inside the front gate, on the main trail
// out through the front gate and off down Breneland Rd (round the back of the mail van's lay-by on the sidewalk)
const GATE = [[2.5, -39.4], [2.5, -42.2], [-8, -42.6], [-70.5, -42.8], [-77, -40], [-86, -39.7], [-91, -42.4], [-98, -43.3]];
const MARGIN = 200;           // seconds after coming back before the beat plans may pair someone up again
const MOVE_CAP = 175;         // a walk to or from home never takes longer than this (they hurry a little)
const NIGHT_IDLE = { arkham: ['look', 'whisper', 'point', 'talk', 'look'] };

// ------------------------------------------------------------------ navigation

class NavGraph {
  constructor(trails, walks = []) {
    this.nodes = [];
    this.adj = [];
    const key = p => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
    const index = new Map();
    const id = p => {
      const k = key(p);
      if (!index.has(k)) { index.set(k, this.nodes.length); this.nodes.push([p[0], p[1]]); this.adj.push([]); }
      return index.get(k);
    };
    // A `late` trail's points go in after every other trail's, and `pickN` counts only the others: a wandering stop is picked by
    // index, so a trail added later mustn't shift what every NPC's day picks. Walks (points only in this graph, not drawn, like the
    // picnic's stroll, layout.js PICNIC_WALK) go at the end of the picked-from points.
    const order = [...trails.filter(t => !t.late), ...walks, ...trails.filter(t => t.late)];
    for (const tr of order) {
      if (tr.late && this.pickN === undefined) this.pickN = this.nodes.length;
      for (let i = 1; i < tr.pts.length; i++) {
        const a = id(tr.pts[i - 1]), b = id(tr.pts[i]);
        const d = Math.hypot(this.nodes[a][0] - this.nodes[b][0], this.nodes[a][1] - this.nodes[b][1]);
        this.adj[a].push([b, d]); this.adj[b].push([a, d]);
      }
    }
    if (this.pickN === undefined) this.pickN = this.nodes.length;
  }
  nearest(x, z) {
    let best = 0, bd = Infinity;
    this.nodes.forEach((n, i) => { const d = (n[0] - x) ** 2 + (n[1] - z) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  route(ax, az, bx, bz) {
    const s = this.nearest(ax, az), g = this.nearest(bx, bz);
    const direct = Math.hypot(bx - ax, bz - az);
    const dist = new Array(this.nodes.length).fill(Infinity), prev = new Array(this.nodes.length).fill(-1);
    const done = new Array(this.nodes.length).fill(false);
    dist[s] = 0;
    for (;;) {
      let u = -1, ud = Infinity;
      for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
      if (u < 0 || u === g) break;
      done[u] = true;
      for (const [v, w] of this.adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const pts = [];
    for (let c = g; c >= 0; c = prev[c]) pts.unshift(this.nodes[c]);
    const path = [[ax, az], ...pts, [bx, bz]];
    // short hops go straight
    if (direct < 12 || polylineLength(path) > direct * 2.6) return this.skirt([[ax, az], [bx, bz]]);
    return this.skirt(path);
  }
  // A leg that would cross a keep-out disc (`keepOuts`: [{ x, z, r }], like the firepit's ring of seats) goes round it instead:
  // in to its rim, along the shorter arc, and out again. Pure (the same path on every client).
  skirt(path) {
    const K = this.keepOuts;
    if (!K || !K.length) return path;
    const out = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i];
      for (const k of K) {
        const c = closestOnSeg(k.x, k.z, ax, az, bx, bz);
        if (c[2] >= k.r * k.r || Math.hypot(ax - k.x, az - k.z) < k.r || Math.hypot(bx - k.x, bz - k.z) < k.r) continue; // clear, or an end inside: as it is
        const R = k.r + 0.5, a0 = Math.atan2(az - k.z, ax - k.x);
        let da = Math.atan2(bz - k.z, bx - k.x) - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const n = Math.max(1, Math.ceil(Math.abs(da) / 0.5));
        for (let j = 0; j <= n; j++) { const a = a0 + (da * j) / n; out.push([k.x + Math.cos(a) * R, k.z + Math.sin(a) * R]); }
        break;
      }
      out.push([bx, bz]);
    }
    return out;
  }
  clearOf(x, z, pad = 0) { return !(this.keepOuts || []).some(k => Math.hypot(x - k.x, z - k.z) < k.r + pad); }
  // A spot inside a keep-out disc moved out to its rim (+ pad), straight away from the middle: no new random draws, so a
  // dog's plan only changes where it would have stood in the ring.
  pushOut(x, z, pad = 0) {
    for (const k of this.keepOuts || []) { const d = Math.hypot(x - k.x, z - k.z); if (d < k.r + pad) { if (d < 1e-6) return [k.x + k.r + pad, k.z]; const f = (k.r + pad) / d; return [k.x + (x - k.x) * f, k.z + (z - k.z) * f]; } }
    return [x, z];
  }
}

// A planned walk goes round the house and the garage instead of through them: a leg that would cross them turns at the corner
// (or two) that makes it shortest, round the front, the garage's far side or the east end. Pure, so every screen agrees.
const HC = 1.3, HOUSE_CORNERS = [[GARAGE.minX - HC, GARAGE.minZ - HC], [HOUSE.minX - 0.2, GARAGE.minZ - HC], [HOUSE.maxX + HC, HOUSE.minZ - HC],
  [GARAGE.minX - HC, GARAGE.maxZ + HC], [HOUSE.minX - HC, HOUSE.maxZ + HC], [HOUSE.maxX + HC, HOUSE.maxZ + HC]];
function legHitsHouse(ax, az, bx, bz) {
  const n = Math.max(8, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let i = 1; i < n; i++) { const t = i / n; if (inHouseBox(ax + (bx - ax) * t, az + (bz - az) * t, 0.5)) return true; }
  return false;
}
export function aroundHouse(path) {
  if (path.length < 2) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = out[out.length - 1], [bx, bz] = path[i];
    if (inHouseBox(ax, az, 0.3) || inHouseBox(bx, bz, 0.3) || !legHitsHouse(ax, az, bx, bz)) { out.push(path[i]); continue; } // (an end inside: the door's own way)
    let best = null, bd = Infinity;
    for (const c of HOUSE_CORNERS) {
      if (legHitsHouse(ax, az, c[0], c[1])) continue;
      if (!legHitsHouse(c[0], c[1], bx, bz)) { const d = Math.hypot(c[0] - ax, c[1] - az) + Math.hypot(bx - c[0], bz - c[1]); if (d < bd) { bd = d; best = [c]; } continue; }
      for (const c2 of HOUSE_CORNERS) {
        if (c2 === c || legHitsHouse(c[0], c[1], c2[0], c2[1]) || legHitsHouse(c2[0], c2[1], bx, bz)) continue;
        const d = Math.hypot(c[0] - ax, c[1] - az) + Math.hypot(c2[0] - c[0], c2[1] - c[1]) + Math.hypot(bx - c2[0], bz - c2[1]);
        if (d < bd) { bd = d; best = [c, c2]; }
      }
    }
    if (best) out.push(...best);
    out.push(path[i]);
  }
  return out;
}

// Walk around the table instead of through it.
function detour(sx, sz, ex, ez, cx, cz, r) {
  if (r <= 0) return [[sx, sz], [ex, ez]];
  const c = closestOnSeg(cx, cz, sx, sz, ex, ez);
  if (c[2] >= r * r || c[3] <= 0.02 || c[3] >= 0.98) return [[sx, sz], [ex, ez]];
  let dx = c[0] - cx, dz = c[1] - cz;
  let d = Math.hypot(dx, dz);
  if (d < 1e-3) { dx = -(ez - sz); dz = ex - sx; d = Math.hypot(dx, dz) || 1; }
  const k = (r + 0.4) / d;
  return [[sx, sz], [cx + dx * k, cz + dz * k], [ex, ez]];
}

// Where a travel segment is after `tl` seconds, allowing for pauses (sniff stops): { dist, pause }
function travelAt(seg, tl, sp) {
  if (!seg.pauses) return { dist: Math.min(seg.len, tl * sp), pause: null };
  let t = tl, d0 = 0;
  for (const p of seg.pauses) {
    const walk = (p.d - d0) / sp;
    if (t < walk) return { dist: d0 + t * sp, pause: null };
    t -= walk;
    if (t < p.dur) return { dist: p.d, pause: p };
    t -= p.dur; d0 = p.d;
  }
  return { dist: Math.min(seg.len, d0 + t * sp), pause: null };
}

// ------------------------------------------------------------------ system

export class NpcSystem {
  constructor(scene, areas, trails, ui) {
    this.scene = scene;
    this.ui = ui;
    this.areas = areas;
    this.nav = new NavGraph(trails, areas.filter(a => a.navWalk).map(a => ({ name: a.id + ':walk', pts: a.navWalk })));   // the picnic's stroll
    this.nav.keepOuts = [...areas.filter(a => a.keepOut > 0).map(a => ({ x: a.x, z: a.z, r: a.keepOut })), ...areas.flatMap(a => a.keepOuts || [])];   // the firepit, the picnic's tables
    for (const n of this.nav.nodes) { const [x, z] = this.nav.pushOut(n[0], n[1], 0.3); n[0] = x; n[1] = z; }   // a trail ending inside the ring: its last node waits at the rim
    this.npcs = [];
    this.byArea = new Map();
    this.wanderers = [];
    this.patrols = [];
    this.planCache = new Map();
    this.itinCache = new Map();
    this.spoken = new Set();
    this.local = new Map(); // npc id -> { anim, until, yaw } local-only reactions to the player
    this.friendUntil = new Map(); // Dax is a friend for a while after you say hi (bond is the lasting version)
    this.brain = new DogBrain(this); // the dogs' reactions: treats, toys, hellos, yipes, unicorn nerves (a shared simulation)
    this.dogSync = new DogSync(this); // ...stepped on the shared clock with everyone's events (dogs-sync.js; main.js attaches the net)
    this.epFired = new Set();
    this.now = 0;
    this.group = new THREE.Group();
    this.group.name = 'npcs';
    scene.add(this.group);

    for (const area of areas) {
      const spec = area.npcSpec;
      const list = [];
      (spec.npcs || []).forEach((n, i) => {
        const count = spec.npcs.length;
        const def = {
          id: area.id + ':' + i, name: n.name, area, kind: n.kind, npc: n.npc || null,
          look: lookOf(n.npc, n.look || {}), voice: voiceOf(n.npc, n.voice || null),   // what the NPC Editor saved, over the built-in (npc-looks.js)
          behavior: n.seat ? (n.seat.anim === 'fish' ? 'fixed' : 'sit') : 'roam',
          seat: n.seat || null,
          homeAngle: (i / count) * TAU + hash01(area.id, i) * 0.8,
          ring: [Math.max(2.4, (area.tableR || 0) + 1.5), area.radius - 1.4],
          speed: n.kind === 'unicorn' ? 1.5 : n.kind === 'dog' ? 3 : (n.look.scale || 1) < 1 ? 1.6 : 1.25,
          lines: spec.lines || [], pairs: spec.pairs || GENERIC_PAIRS,
          idle: spec.idle || ['idle', 'look'],
        };
        this.add(def);
        list.push(def);
      });
      this.byArea.set(area.id, list);
    }

    // Kevin keeps his own day (kevin-day.js): home, the shack, the pier, the boat
    for (const d of this.npcs) if (d.name === 'Kevin') d.kevin = true;
    // ...and so does Joyce (joyce-day.js): home, her power walk, the golf cart to and from the garden (whose slot is her area)
    for (const d of this.npcs) if (d.name === 'Joyce' && d.area?.id === 'garden') { d.joyce = true; setJoyceWorld({ garden: d.area, route: (ax, az, bx, bz) => this.nav.route(ax, az, bx, bz) }); }
    // ...and at 7 pm he takes one of the always-present park and yard folk fishing (kevin-day.js crewPick; kevin-crew.js).
    // The pool is whoever of CREW_POOL this lobby has (the game slots decide), in that fixed order, and the trails route him.
    for (const d of this.npcs) if (d.kind === 'human' && d.area && CREW_POOL.includes(d.name)) d.crewPool = true;
    setKevinWorld({ pool: this.npcs.filter(d => d.crewPool).map(d => ({ name: d.name, x: d.area.x, z: d.area.z, r: d.area.radius || 7 })), route: (ax, az, bx, bz) => this.nav.route(ax, az, bx, bz) });
    this.crewBumped = false;   // both crew seats taken by players at the berth (server-held, kevin-crew.js): the companion stays ashore

    // Folks who don't belong to any one game. Nala and Dax are Andrew's dogs.
    this.addWanderer({
      id: 'nala', name: 'Nala', kind: 'dog', look: NALA, personality: 'hyper',
      home: { x: 3.6, z: -9.9, yaw: Math.PI - 0.5, anim: 'lie' },
      bed: { x: -1.35, z: -5.05, yaw: Math.PI + 0.35, anim: 'rest', path: [[0.0, -8.5], [-0.2, -7.3], [-0.8, -6.2]] }, // by the front door at night
      speed: 4.3, stops: [7, 10], lawnStops: 0.55, zoomies: 0.6, stayBeats: [1, 1], stayAnim: 'sniff',
      lines: ['BORK!', 'Bork bork!', 'Zoomies!!', 'Play with me!', '*wiggle wiggle*', 'Ball? BALL?!', '*happy yip*'],
      // where she naps outside her lively hours: sprawled on her side in the sun, or curled up somewhere snug
      naps: { speed: 2.2, spots: [
        { bed: 1, wt: 2.5, anims: ['sleep', 'loaf', 'sleep', 'loaf'] },                  // her bed on the porch (the long naps mostly go there)
        { indoor: true, wt: 1, anims: ['sleep', 'loaf', 'sleep', 'loaf'] },              // the big bed in the living room, with Dax
        { home: true, wt: 3, anims: ['loaf', 'loaf', 'sleepside', 'sleep'] },          // her spot on the lawn in front of the porch
        { x: -1.35, z: -5.05, yaw: Math.PI + 0.35, wt: 1, anims: ['sleep', 'loaf'] },  // by the front door (her night spot)
        { swing: true, wt: 1, anims: ['loaf', 'sleep'] },                              // under the porch swing
        { tree: 8, wt: 1.5, anims: ['loaf', 'sleepside', 'sleep', 'loaf'] },           // in the big oak's shade
        { x: 8.5, z: -15.5, wt: 2, anims: ['sleepside', 'loaf', 'sleep', 'loaf'] },    // sunny patches of lawn
        { x: -9, z: -19.5, wt: 1.5, anims: ['loaf', 'sleep', 'sleepside', 'loaf'] },
      ] },
    });
    // Dax: shy with strangers and other animals (not Nala), but a contented wanderer. He patrols the fence line
    // sniffing posts, potters about the lawn, rests in sunny spots, and keeps well away from the unicorns.
    this.addWanderer({
      id: 'dax', name: 'Dax', kind: 'dog', look: DAX, personality: 'nervous',
      home: { x: 1.15, z: -4.95, yaw: Math.PI + 0.25, anim: 'lie' }, // by the front door, watching the yard
      exit: [[0.9, -6.1], [0.4, -7.2], [0.3, -8.4]], // down the porch steps
      speed: 2.0, stops: [5, 8], lawnStops: 0.6, lawnNear: 26, stayBeats: [1, 2],
      stayAnims: ['rest', 'rest', 'sit', 'sniff', 'lie'],
      fence: { p: 0.5, z: FENCE_Z + 1.15, x0: -39, x1: 53, speed: 1.5 },
      avoid: true,
      areaWeight: a => (this.unicornArea(a) ? 0 : a.game ? 0.25 : 1), // prefers the quiet spots
      lines: ['*soft wuff*', '*sniff sniff*', '*happy wag*', '*soft wuff*', '*sniff sniff*'],
      // where he naps: mostly by the front door or in his bed on the porch, under the porch swing or by the oak by the house
      naps: { speed: 1.4, spots: [
        { bed: 0, wt: 3, anims: ['sleep', 'loaf', 'sleep', 'loaf'] },   // his bed on the porch
        { indoor: true, wt: 1, anims: ['sleep', 'loaf', 'sleep', 'loaf'] },   // the big bed in the living room, with Nala
        { home: true, wt: 4, anims: ['sleep', 'loaf', 'loaf'] },
        { swing: true, wt: 2, anims: ['loaf', 'sleep'] },
        { tree: 3, wt: 2.5, anims: ['sleep', 'loaf', 'sleepside', 'loaf'] },
        { x: -4, z: -18, wt: 1.5, anims: ['loaf', 'sleepside', 'sleep', 'loaf'] },                     // a sunny patch of lawn
      ] },
    });
    // Molly: Joyce's older dog. Not a wanderer (no itinerary, no beat plans): her plan is Joyce's day (molly-day.js) and the shared
    // simulation moves her off it (molly-brain.js in dogs-brain.js), like Dax and Nala.
    this.molly = { id: 'molly', name: 'Molly', kind: 'dog', look: MOLLY, personality: 'wise', behavior: 'molly', area: null, lines: ['*soft wuff*', '*slow wag*'] };
    this.add(this.molly);
    // The street: Pat delivers the mail in the daytime, Pepperoni Pete delivers pizza in the evening (mailman.js).
    // Both stay outside the picket fence; Nala barks at them now and then (dogs-mail.js).
    this.street = new Street(this);
    this.addStreet({ id: 'pat', role: 'pat', npc: 'pat', name: 'Pat the Mail Carrier', kind: 'human', look: lookOf('pat', PAT_LOOK), voice: voiceOf('pat', NPCS.pat.voice), lines: PAT_LINES });
    this.addStreet({ id: 'pizza', role: 'pizza', npc: 'pete', name: 'Pepperoni Pete', kind: 'human', look: lookOf('pete', PIZZA_LOOK), voice: voiceOf('pete', NPCS.pete.voice),
      lines: ['Pizza!', 'Hot and fresh!', 'Anyone order a large pepperoni?', 'Extra cheese, coming through!'] });
    this.addPatrol({
      id: 'lou', npc: 'lou', name: 'Lou (out for a jog)', kind: 'human', out: louOut,   // jogs at dawn and in the evening
      cast: 'lou',   // one of the town's folk: on a phone only built while the town cast has him (town-cast.js)
      look: lookOf('lou', NPCS.lou.look), voice: voiceOf('lou', undefined),
      speed: 3.6,
      path: [[-90, STREET.z0 + 1.5], [-86, -39.7], [-77, -40], [-70.5, STREET.z0 + 1.5], [55, STREET.z0 + 1.5], [58, STREET.z1 - 1.8], [-90, STREET.z1 - 1.8], [-90, STREET.z0 + 1.5]], // (round the lay-by)
    });
  }

  // A feature's own NPC (like Bernie the bus driver): def.custom(t, def) -> the state (as stateOf's: x, z, y?, yaw, speed, anim,
  // hidden?, snap?), then def.dress?(body, s) once it's placed. Lines, voice and the name tag work as everyone's. It has to stay a
  // function of shared things (the clock, the lockstep traffic) so every visitor sees the same.
  addCustom(def) { def.behavior = 'custom'; def.area = def.area || null; this.add(def); return def; }
  addStreet(def) { def.behavior = 'street'; def.area = null; this.add(def); this.street.defs[def.role] = def; }

  // Forget cached schedules (tests change the pinned hour with setHourOverride).
  resetCaches() {
    this.planCache.clear(); this.itinCache.clear(); this.street.reset(); this.dayMoves?.clear(); this.liveCache?.clear();
    if (this.epCache) this.epCache.clear();
    clearDayCache(); castReset();
  }
  mailBusy(t0, t1) { return this.street.busy(t0, t1); }
  // as the dogs' itineraries decide it: per itinerary loop, from the hour the loop starts
  dogsAsleep(t) { const n = Math.floor(t / (LOOP * L)); return dogsAsleep(n * LOOP * L + 1); }
  // Is either dog napping on its plan at t? The play and toy scenes wait until both are up.
  dogNap(t) { for (const w of this.wanderers) if (w.naps && this.baseState(w, t).nap) return true; return false; }

  // Hooks other systems call.
  //   dropTreat(x, z, now, byName, hideFor, relay): a treat landed at (x, z). The nearest dog runs over and eats it on every screen
  //     (relay = the server's treat message with its tick and number, without one it's sent as our own). True if a dog will.
  //   dog(id): the wanderer def for 'dax' or 'nala' ({ body: Dog, ... }) or null
  dropTreat(x, z, now, byName, hideFor = 0, relay = null) { return this.dogSync.treat(x, z, byName, hideFor, relay, this.now || now); }
  dog(id) { return id === 'molly' ? this.molly || null : this.wanderers.find(w => w.id === id) || null; }
  // Is this dog asleep right now (the shared simulation's nap state)? main.js words the E prompt by it.
  dogDozing(id) { const z = this.dogSync.S.dogs[id]?.zz; return !!z && (z.ph === 'sleep' || z.ph === 'settle'); }

  // main.js hands the audio engine over once it exists (registers the yipe / crunch / thump effects)
  get audio() { return this._audio; }
  set audio(a) { this._audio = a; registerDogSfx(a); }

  unicornArea(a) { return (a.npcSpec?.npcs || []).some(n => n.kind === 'unicorn'); }
  // the unicorns' neighbourhoods, which nervous Dax stays out of: [{ x, z, r }]
  avoidZones() {
    return this._avoid || (this._avoid = this.areas.filter(a => this.unicornArea(a)).map(a => ({ x: a.x, z: a.z, r: a.radius + 9 })));
  }
  avoidUnicorns(x, z, pad = 8) { return this.areas.some(a => this.unicornArea(a) && Math.hypot(x - a.x, z - a.z) < a.radius + pad); }
  nearestUnicorn(x, z) {
    let best = null;
    for (const d of this.npcs) {
      if (d.kind !== 'unicorn') continue;
      const p = d.body.root.position, dd = Math.hypot(p.x - x, p.z - z);
      if (!best || dd < best.d) best = { d: dd, x: p.x, z: p.z };
    }
    return best;
  }
  nearUnicorn(x, z, r) { const u = this.nearestUnicorn(x, z); return !!u && u.d < r; }

  makeBody(def) {
    window.__loadStep?.('Waking up ' + (def.name || def.id || 'someone').replace(/\s*\(.*$/, '') + '...'); // a loading step per character (boot-guard.js)
    const ch = def.kind === 'human' ? new Human({ ...def.look })
      : def.kind === 'dog' ? new Dog({ ...def.look })
        : new Unicorn({ ...def.look });
    ch.root.userData.npc = def;
    this.group.add(ch.root);
    return ch;
  }

  add(def) { def.tag = tagOf(def.npc, def.name); def.body = def.cast && castOn() ? this.lazyBody(def) : this.makeBody(def); this.npcs.push(def); }   // (tag: the name tag's words, which the NPC Editor may change)
  // A stand-in body for a cast member on a phone: an empty group that stands where the schedule says, with the real person
  // built inside it when the town cast wants them (update()) and freed when it moves on. Everything that reads
  // d.body.root (name tag, bubbles, the minimap, bumping into people) works on the group.
  lazyBody(def) {
    const root = new THREE.Group();
    root.userData.npc = def; root.visible = false;
    this.group.add(root);
    def.castSeat = castSeat();
    return {
      root, h: null, params: {}, lazy: true,
      update(dt, now, speed, anim) { this.h?.update(dt, now, speed, anim); },
      say(s) { this.h?.say?.(s); },
      build() { this.h = new Human({ ...def.look }); this.root.add(this.h.root); this.params = this.h.params; root.userData.tagAnchor = this.h.root.userData.tagAnchor; },
      free() { if (!this.h) return; this.root.remove(this.h.root); this.h.dispose(); this.h = null; this.params = {}; delete root.userData.tagAnchor; },
    };
  }
  addWanderer(def) { def.behavior = 'wander'; def.area = null; this.add(def); this.wanderers.push(def); }
  addPatrol(def) {
    def.behavior = 'patrol'; def.area = null;
    def.pathLen = polylineLength(def.path);
    this.add(def); this.patrols.push(def);
    if (def.cast) castMember(def.cast, t => !this.baseState(def, t).hidden); // (in the phone's town cast pool on every client)
  }

  // ---------------------------------------------------------------- wanderers

  stopFor(area) {
    const n = this.nav.nodes[this.nav.nearest(area.x, area.z)];
    const dx = n[0] - area.x, dz = n[1] - area.z, d = Math.hypot(dx, dz) || 1;
    const r = area.radius - 0.6;
    return { x: area.x + (dx / d) * r, z: area.z + (dz / d) * r, area };
  }

  // A stroll along the picket fence: weaving a little, pausing every few metres to sniff a post.
  // { start, path, pauses, end } or null.
  fencePatrol(w, rnd) {
    const f = w.fence;
    const len = 14 + rnd() * 22, dir = rnd() < 0.5 ? 1 : -1;
    const x0 = f.x0 + 3 + rnd() * (f.x1 - f.x0 - len - 6);
    const xa = dir > 0 ? x0 : x0 + len, xb = dir > 0 ? x0 + len : x0;
    const n = Math.ceil(len / 2), path = [];
    for (let i = 0; i <= n; i++) {
      const x = xa + (xb - xa) * (i / n);
      const mail = Math.abs(x - MAILBOX.x) < 1.8;   // walk round the mailbox post instead of through it
      path.push([x, mail ? f.z + 0.85 : hedgeAt(x, 0.6) ? HEDGE.z1 + 0.45 + Math.sin(x * 0.85) * 0.12 : f.z + Math.sin(x * 0.85) * 0.2]);   // (and along the hedges' face)
    }
    const pauses = [];
    for (let d = 1.2 + rnd() * 2; d < len - 1; d += 5 + rnd() * 5) {
      pauses.push({ d, dur: 2.4 + rnd() * 2.6, anim: rnd() < 0.35 ? 'sniffup' : 'sniff', yaw: Math.PI + (rnd() - 0.5) * 0.5 });
    }
    return { start: path[0], path, pauses, end: path[path.length - 1] };
  }

  itinerary(w, n) {
    const key = w.id + ':' + n;
    let it = this.itinCache.get(key);
    if (it) return it;
    const rnd = mulberry32(Math.floor(hash01(w.id, n, 'itin') * 4294967296));
    const segs = new Array(LOOP);
    const home = w.home;
    const stay = (x, z, area, yaw, anim) => ({ type: 'stay', x, z, area, yaw, anim });
    const napped = seg => { seg.nap = true; return seg; };   // (a stay asleep: dogs-brain.js lets a hello or a new arrival wake it)
    const put = (from, count, v) => { for (let j = 0; j < count; j++) segs[from + j] = v; };
    const travel = (from, path, speed = w.speed, pauses = null) => {
      const len = polylineLength(path), dur = len / speed + (pauses ? pauses.reduce((s, p) => s + p.dur, 0) : 0);
      const count = Math.max(1, Math.ceil((dur + 0.5) / L));
      return { seg: { type: 'travel', path, len, t0: from * L, dur, speed, pauses }, count };
    };
    // Routes leaving or reaching home follow the home's exit path (e.g. off the porch).
    const exit = w.exit || [];
    const route = (ax, az, bx, bz) => {
      const fromHome = ax === home.x && az === home.z, toHome = bx === home.x && bz === home.z;
      const s = fromHome && exit.length ? exit[exit.length - 1] : [ax, az];
      const e = toHome && exit.length ? exit[exit.length - 1] : [bx, bz];
      let pts = aroundHouse(this.nav.route(s[0], s[1], e[0], e[1])); // round the house
      if (fromHome && exit.length) pts = [[ax, az], ...exit.slice(0, -1), ...pts];
      if (toHome && exit.length) pts = [...pts, ...exit.slice(0, -1).reverse(), [bx, bz]];
      return pts;
    };
    // nervous dogs keep out of the unicorns' neighbourhood, in their stops and on the way there
    const zones = w.avoid ? this.avoidZones() : [];
    const near = (x, z) => zones.some(q => Math.hypot(x - q.x, z - q.z) < q.r);
    const badPath = path => {
      if (!zones.length) return false;
      const len = polylineLength(path);
      for (let d = 0; d <= len; d += 3) { const [x, z] = alongPolyline(path, d); if (near(x, z)) return true; }
      return false;
    };
    const pickArea = () => {
      const weights = this.areas.map(a => (w.kind === 'dog' && !pointInPoly(a.x, a.z, WALK) ? 0 : w.areaWeight ? w.areaWeight(a) : 1)); // dogs only visit areas inside the fence
      let r = rnd() * weights.reduce((s, x) => s + x, 0);
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return this.areas[i]; }
      return this.areas[this.areas.length - 1];
    };
    const stayAnimFor = () => (w.stayAnims ? w.stayAnims[Math.floor(rnd() * w.stayAnims.length)] : (w.stayAnim || 'look'));
    // Night: both dogs sleep by the front door (Nala walks over to her spot on the porch, Dax is already there).
    const t0 = n * LOOP * L;
    const night = w.kind === 'dog' && dogsAsleep(t0 + 1), nightBefore = w.kind === 'dog' && dogsAsleep(t0 - LOOP * L + 1);
    const bed = w.bed || { x: home.x, z: home.z, yaw: home.yaw, anim: 'rest' };
    const bedPath = w.bed ? [[home.x, home.z], ...w.bed.path, [bed.x, bed.z]] : null;
    if (night) {
      let at = 0;
      if (!nightBefore && bedPath) { segs[0] = stay(home.x, home.z, null, home.yaw, home.anim); const tr = travel(1, bedPath, 1.6); put(1, tr.count, tr.seg); at = 1 + tr.count; }
      put(at, LOOP - at, w.naps ? napped(stay(bed.x, bed.z, null, bed.yaw, 'sleep')) : stay(bed.x, bed.z, null, bed.yaw, 'rest'));   // properly asleep
      it = { segs, start: n * LOOP * L };
      this.itinCache.set(key, it);
      if (this.itinCache.size > 12) this.itinCache.delete(this.itinCache.keys().next().value);
      return it;
    }
    segs[0] = stay(home.x, home.z, null, home.yaw, home.anim);
    let local = 1, cx = home.x, cz = home.z;
    if (nightBefore && bedPath) {   // morning: up off the porch
      segs[0] = stay(bed.x, bed.z, null, bed.yaw, 'rest');
      const tr = travel(1, bedPath.slice().reverse(), 1.8);
      put(1, tr.count, tr.seg); local = 1 + tr.count;
      put(local, 1, stay(home.x, home.z, null, home.yaw, 'sniff')); local++;
    }
    // The day's roaming from home: stops at areas and on the lawn, fence walks, zoomies; home again by beat `limit`.
    const wander = limit => {
      // Nala's last zoomies of the day at dusk
      const dusk = !!w.zoomies && moodAt(t0 + 1) === 'dusk';
      const [smin, smax] = w.stops || [3, 4];
      const wanted = smin + Math.floor(rnd() * (smax - smin + 1));
      for (let i = 0; i < wanted; i++) {
        // a walk along the fence with sniffing stops
        if (w.fence && rnd() < w.fence.p) {
          const fp = this.fencePatrol(w, rnd);
          const goPath = route(cx, cz, fp.start[0], fp.start[1]);
          const back = travel(0, route(fp.end[0], fp.end[1], home.x, home.z));
          const go = travel(local, goPath), walk = travel(0, fp.path, w.fence.speed, fp.pauses);
          if (badPath(goPath) || badPath(back.seg.path) || local + go.count + walk.count + 1 + back.count + 1 > limit) continue;
          put(local, go.count, go.seg); local += go.count;
          walk.seg.t0 = local * L;
          put(local, walk.count, walk.seg); local += walk.count;
          put(local, 1, stay(fp.end[0], fp.end[1], null, Math.PI + 0.2, 'sniff')); local += 1;
          cx = fp.end[0]; cz = fp.end[1];
          continue;
        }
        let stop = null;
        const zoomNow = dusk && i === 0;
        if (rnd() < (w.lawnStops || 0) || zoomNow) {
          for (let tries = 0; tries < 6 && !stop; tries++) {
            const node = this.nav.nodes[Math.floor(rnd() * this.nav.pickN)]; // (not the late trails' points: NavGraph)
            const a = rnd() * TAU;
            const c = { x: node[0] + Math.cos(a) * 3, z: node[1] + Math.sin(a) * 3, area: null };
            [c.x, c.z] = this.nav.pushOut(c.x, c.z, 0.6);   // not in the firepit's ring of seats
            if ((!w.lawnNear || Math.hypot(c.x - home.x, c.z - home.z) < w.lawnNear) && !near(c.x, c.z) && !inHouseBox(c.x, c.z, 1.0) && (w.kind !== 'dog' || pointInPoly(c.x, c.z, WALK))) stop = c; // never a stop inside the house
          }
        }
        if (!stop) stop = this.stopFor(pickArea());
        const goPath = route(cx, cz, stop.x, stop.z), backPath = route(stop.x, stop.z, home.x, home.z);
        if (badPath(goPath) || badPath(backPath)) continue;
        const go = travel(local, goPath);
        const back = travel(0, backPath);
        const [b0, b1] = w.stayBeats || [1, 2];
        const stayLen = b0 + Math.floor(rnd() * (b1 - b0 + 1));
        // zoomies: a couple of flat-out laps around the lawn stop
        let zoom = null;
        if (!stop.area && w.zoomies && (rnd() < w.zoomies || zoomNow)) {
          const R = 3.5 + rnd() * 1.5, a0 = rnd() * TAU, dir = rnd() < 0.5 ? 1 : -1;
          const ccx = stop.x - Math.cos(a0) * R, ccz = stop.z - Math.sin(a0) * R;
          const loop = [];
          for (let j = 0; j <= 32; j++) { const a = a0 + dir * (j / 16) * TAU; loop.push([ccx + Math.cos(a) * R, ccz + Math.sin(a) * R]); }
          if (loop.every(q => pointInPoly(q[0], q[1], WALK) && this.nav.clearOf(q[0], q[1], 0.6) && !inHouseBox(q[0], q[1], 0.6))) zoom = loop;
        }
        const zoomSeg = zoom ? travel(0, zoom, 7.5) : null;
        const extra = zoomSeg ? zoomSeg.count : 0;
        if (local + go.count + extra + stayLen + back.count + 1 > limit) break;
        put(local, go.count, go.seg);
        local += go.count;
        if (zoomSeg) {
          zoomSeg.seg.t0 = local * L;
          put(local, zoomSeg.count, zoomSeg.seg);
          local += zoomSeg.count;
        }
        const yaw = stop.area ? faceTo(stop.x, stop.z, stop.area.x, stop.area.z) : rnd() * TAU;
        put(local, stayLen, stay(stop.x, stop.z, stop.area, yaw, zoomSeg ? 'pant' : stayAnimFor()));
        local += stayLen;
        cx = stop.x; cz = stop.z;
      }
      if (cx !== home.x || cz !== home.z || local < limit) {
        const back = travel(local, route(cx, cz, home.x, home.z));
        put(local, back.count, back.seg);
        local += back.count;
      }
      put(local, limit - local, stay(home.x, home.z, null, home.yaw, home.anim));
      local = limit; cx = home.x; cz = home.z;
    };

    // Naps: outside the dogs' high-energy windows (npcs-day.js DOG_LIVELY) they mostly sleep in good spots. Beat by beat, so a
    // window starts and ends on time. A run of napping beats starts and ends at home, except that a whole loop of naps may start
    // where the loop before ended its nap, and end at its own favourite spot when the next loop naps too (so one long nap can run
    // across loops). Which spot a loop favours and how the dog lies there are hashes of the loop alone, so neighbouring loops know
    // them without building each other.
    const live = w.naps ? this.liveBeats(n) : null;
    if (!live || live.every(Boolean)) wander(LOOP);   // the lively hours: the plain roaming day
    else {
      const homeSp = this.napSpots(w)[0];
      const runs = [];
      for (let j = 0; j < LOOP;) { let e = j; while (e < LOOP && live[e] === live[j]) e++; runs.push([j, e, live[j]]); j = e; }
      const whole = runs.length === 1 && !nightBefore;
      for (const [a, b, lively] of runs) {
        if (local >= b) continue;   // (the morning walk off the porch took it)
        if (lively) { wander(b); continue; }
        const from = whole && this.napLoop(n - 1) ? this.napHub(w, n - 1) : homeSp;
        const hub = this.napHub(w, n);
        const to = whole && this.napLoop(n + 1) ? hub : homeSp;
        const at = a === 0 && !nightBefore ? 0 : Math.max(a, local);   // (beat 0 is the nap's, unless the dog is walking off the porch)
        local = this.napRun(w, n, rnd, { put, travel, stay, stayAnimFor }, at, b, from, to, hub, at > 0);
      }
    }
    it = { segs, start: n * LOOP * L };
    this.itinCache.set(key, it);
    if (this.itinCache.size > 12) this.itinCache.delete(this.itinCache.keys().next().value);
    return it;
  }

  wanderSeg(w, k) {
    const n = Math.floor(k / LOOP);
    const it = this.itinerary(w, n);
    return { seg: it.segs[k - n * LOOP], start: it.start };
  }

  // ---------------------------------------------------------------- naps

  // Which beats of itinerary loop n are in the dogs' lively hours (from the hours alone: the same for both dogs).
  liveBeats(n) {
    const c = this.liveCache || (this.liveCache = new Map());
    let a = c.get(n);
    if (!a) {
      a = [];
      for (let j = 0; j < LOOP; j++) a.push(dogsLively((n * LOOP + j) * L + L / 2));
      c.set(n, a);
      if (c.size > 8) c.delete(c.keys().next().value);
    }
    return a;
  }
  // Is loop n one whole loop of naps (not the night, not the morning walk off the porch)?
  napLoop(n) {
    const t0 = n * LOOP * L;
    if (dogsAsleep(t0 + 1) || dogsAsleep(t0 - LOOP * L + 1)) return false;
    return !this.liveBeats(n).some(Boolean);
  }
  // The dog's nap spots, resolved once from layout.js (after the World Editor's moves): [{ i, x, z, yaw, anims, wt, porch }];
  // the first is home. A spot that is not a fine place to lie (off the lawn, by a table, in the unicorns' way) is left out.
  napSpots(w) {
    if (w._napSpots) return w._napSpots;
    const ok = (x, z) => pointInPoly(x, z, WALK) && !(x > HOUSE.minX - 0.6 && x < HOUSE.maxX + 0.6 && z > HOUSE.minZ - 0.6 && z < HOUSE.maxZ + 0.6)
      && !this.areas.some(a => a.tableR && Math.hypot(x - a.x, z - a.z) < a.tableR + 1.6) && !(w.avoid && this.avoidUnicorns(x, z, 8));
    const out = [];
    for (const sp of w.naps.spots) {
      let x, z, yaw = sp.yaw;
      if (sp.home) { x = w.home.x; z = w.home.z; yaw = w.home.yaw; }
      else if (sp.swing) { x = PORCH_SWING.x + 0.2; z = PORCH_SWING.z - 1.5; yaw = Math.PI / 2 + 0.15; }   // at the feet of whoever swings (clear of its collider)
      else if (sp.bed != null) { const B = DOG_BEDS[sp.bed]; if (!B) continue; x = B.x; z = B.z; yaw = B.yaw; }   // in its bed on the porch
      else if (sp.indoor) { const B = INDOOR_DOG_BED.spots[w.id]; if (!B) continue; x = B.x; z = B.z; yaw = B.yaw; }   // its side of the big bed indoors
      else if (sp.tree != null) {
        const T = YARD_TREES[sp.tree];
        if (!T) continue;
        // in the shade on the north side of the trunk (the sun is to the south), clear of the trunk's collider
        for (const a of [0, 0.6, -0.6, 1.3, -1.3, Math.PI]) { const xx = T.x + Math.sin(a) * 1.75, zz = T.z - Math.cos(a) * 1.75; if (ok(xx, zz)) { x = xx; z = zz; break; } }
        if (x === undefined) continue;
        yaw = faceTo(x, z, T.x, T.z) + Math.PI / 2;   // lying along the trunk's shade
      } else { x = sp.x; z = sp.z; }
      if (yaw === undefined) yaw = hash01(w.id, 'napyaw', out.length) * TAU;
      if (!sp.home && !sp.indoor && !(ok(x, z) || this.onPorch(x, z))) continue;
      out.push({ i: out.length, x, z, yaw, anims: sp.anims, wt: sp.wt || 1, porch: this.onPorch(x, z), bed: sp.bed ?? null, indoor: !!sp.indoor });
    }
    return (w._napSpots = out);
  }
  onPorch(x, z) { return x > PORCH.minX && x < PORCH.maxX && z > PORCH.minZ && z < PORCH.maxZ; }
  indoorAt(x, z) { return x > HOUSE.minX && x < HOUSE.maxX && z > HOUSE.minZ && z < HOUSE.maxZ; } // in the house, i.e. the big bed
  // The spot loop n favours (a hash of the loop: its neighbours ask without building it).
  napHub(w, n) {
    const spots = this.napSpots(w);
    // Most loops both dogs take to their beds (one roll of the loop, shared by both), otherwise the weights decide
    const bed = spots.find(q => q.bed != null);
    if (bed && hash01('dogbeds', n) < BEDS_TOGETHER) { const inn = spots.find(q => q.indoor); return inn && hash01('dogbedin', n) < INDOOR_SHARE ? inn : bed; } // some of them in the big bed indoors
    let r = hash01(w.id, n, 'naphub') * spots.reduce((s, q) => s + q.wt, 0);
    for (const q of spots) { r -= q.wt; if (r <= 0) return q; }
    return spots[spots.length - 1];
  }
  // How the dog lies at spot q in loop nn (curled up or flat out on its side), and the stay itself.
  napStay(w, q, nn) {
    const anim = q.anims[Math.floor(hash01(w.id, nn, 'napanim', q.i) * q.anims.length)];
    const fwd = q.bed != null && anim === 'loaf' ? 0.12 : 0;   // in a bed the loaf sits a little forward: chin on the front bolster, tail in the dish
    return { type: 'stay', x: q.x + Math.sin(q.yaw) * fwd, z: q.z + Math.cos(q.yaw) * fwd, area: null, yaw: q.yaw, anim, nap: true };
  }
  // A path between two spots; up and down the porch steps when one end is on the porch.
  napRoute(ax, az, bx, bz) {
    // to or from the big bed indoors: through the living room and the front door, then as from the porch
    const ia = this.indoorAt(ax, az), ib = this.indoorAt(bx, bz);
    if (ia && ib) return [[ax, az], [bx, bz]];
    if (ia) return [[ax, az], ...IN_WAY.slice().reverse(), ...this.napRoute(IN_WAY[0][0], IN_WAY[0][1], bx, bz).slice(1)];
    if (ib) return [...this.napRoute(ax, az, IN_WAY[0][0], IN_WAY[0][1]), ...IN_WAY.slice(1), [bx, bz]];
    const pa = this.onPorch(ax, az), pb = this.onPorch(bx, bz);
    if (pa && pb) return [[ax, az], [(ax + bx) / 2, -7], [bx, bz]];   // (along the front of the porch, clear of the swing)
    const FOOT = [0.3, -9.1], TOP = [0.3, -7.25];
    const s = pa ? FOOT : [ax, az], e = pb ? FOOT : [bx, bz];
    let pts = Math.hypot(e[0] - s[0], e[1] - s[1]) < 0.05 ? [s] : aroundHouse(this.nav.route(s[0], s[1], e[0], e[1]));
    if (pa) pts = [[ax, az], TOP, ...pts];
    if (pb) pts = [...pts, TOP, [bx, bz]];
    return pts;
  }
  // A spot for a sniff about between naps: a few metres off, on open lawn.
  potterSpot(w, q, rnd) {
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, r = 3 + rnd() * 4, [x, z] = this.nav.pushOut((q.porch || q.indoor ? 0.3 : q.x) + Math.sin(a) * r, (q.porch || q.indoor ? -11 : q.z) + Math.cos(a) * r, 0.6);   // (pushed out of the firepit's ring)
      if (pointInPoly(x, z, WALK) && !this.onPorch(x, z) && !(x > HOUSE.minX - 1 && x < HOUSE.maxX + 1 && z > PORCH.minZ - 1.2 && z < HOUSE.maxZ + 1)
        && !this.areas.some(ar => ar.tableR && Math.hypot(x - ar.x, z - ar.z) < ar.tableR + 1.2) && !(w.avoid && this.avoidUnicorns(x, z, 8))) return { i: -1, x, z, porch: false };
    }
    return null;
  }
  // Beats a..b-1 of loop n asleep: still asleep at `from` when it starts (`awake`: it just came home from a walk), a
  // few more beats there, now and then up for a sniff about, then the long nap at the hub (perhaps broken by another
  // sniff about), and at `to` by beat b. Returns b. h = the itinerary's helpers (put, travel, stay, stayAnimFor).
  napRun(w, n, rnd, h, a, b, from, to, hub, awake) {
    const sp = w.naps.speed;
    let lc = a, cur = from;
    const trip = (p, q) => (p === q ? 0 : h.travel(0, this.napRoute(p.x, p.z, q.x, q.z), sp).count);
    const go = q => { if (q === cur) return; const tr = h.travel(lc, this.napRoute(cur.x, cur.z, q.x, q.z), sp); h.put(lc, tr.count, tr.seg); lc += tr.count; cur = q; };
    const nap = (q, nn, cnt) => { if (cnt > 0) { h.put(lc, cnt, this.napStay(w, q, nn)); lc += cnt; } };
    const keyOf = q => (q === hub ? n : q === from && !awake ? n - 1 : n);   // (the loop whose hash says how it lies there)
    const potter = then => {
      const q = this.potterSpot(w, cur, rnd);
      if (!q || lc + trip(cur, q) + 1 + trip(q, then) + trip(then, to) + 2 > b) return false;
      go(q);
      h.put(lc, 1, h.stay(q.x, q.z, null, rnd() * TAU, h.stayAnimFor())); lc += 1;
      return true;
    };
    if (cur !== hub) {
      const spare = b - lc - trip(cur, hub) - trip(hub, to) - 1;
      if (spare < 1) {   // (no time to go anywhere: sleep where we are, then to `to`)
        nap(cur, keyOf(cur), b - lc - trip(cur, to));
        go(to); nap(to, keyOf(to), b - lc);
        return b;
      }
      nap(cur, keyOf(cur), Math.min(spare, 2 + Math.floor(rnd() * 6)));
      if (rnd() < 0.45) potter(hub);
      go(hub);
    }
    let left = b - lc - trip(hub, to);
    if (left > 16 && rnd() < 0.4) {
      nap(hub, n, 6 + Math.floor(rnd() * (left - 12)));
      if (potter(hub)) go(hub);
      left = b - lc - trip(hub, to);
    }
    nap(hub, n, left);
    go(to);
    nap(to, keyOf(to), b - lc);
    return b;
  }

  // ---------------------------------------------------------------- beat plans

  plan(k) {
    let p = this.planCache.get(k);
    if (p) return p;
    p = new Map();
    const taken = new Set();
    // people who are away, on their way, or just back (the time of day) are nobody's partner this beat
    for (const list of this.byArea.values()) for (const d of list) if (!this.homeBeat(d, k)) taken.add(d.id);
    const mood = moodAt(k * L), dark = isDark(mood);
    const pickFree = (list, salt) => {
      const free = list.filter(d => !taken.has(d.id) && d.behavior !== 'fixed');
      if (!free.length) return null;
      return free[Math.floor(hash01(salt, k) * free.length)];
    };
    const lineFor = (d, salt) => {
      const extra = d.area ? areaLines(d.area.theme, mood) : null;
      const pool = extra ? (extra.replace ? extra.lines : d.lines.concat(extra.lines)) : d.lines;
      if (dark && hash01(d.id, k, salt, 'hush') < 0.45) return null;   // quieter at night
      return pool.length ? pool[Math.floor(hash01(d.id, k, salt) * pool.length)] : null;
    };

    // 1. a wanderer visiting an area meets someone there
    for (const w of this.wanderers) {
      const { seg } = this.wanderSeg(w, k);
      if (seg.type !== 'stay') continue;
      const entry = { x: seg.x, z: seg.z, yaw: seg.yaw, anim: seg.anim, line: null, delay: 0 };
      p.set(w.id, entry);
      if (!seg.area || hash01(w.id, k, 'meet') > 0.85) continue;
      const partner = pickFree(this.byArea.get(seg.area.id) || [], w.id);
      if (!partner) continue;
      taken.add(partner.id);
      const dx = seg.area.x - seg.x, dz = seg.area.z - seg.z, d = Math.hypot(dx, dz) || 1;
      // Dax keeps his distance; Nala gets right up close
      const gap = w.personality === 'nervous' ? 2.2 : w.personality === 'hyper' ? 0.95 : w.kind === 'dog' || partner.kind !== 'human' ? 1.25 : 1.1;
      const mx = seg.x + (dx / d) * gap, mz = seg.z + (dz / d) * gap;
      const [wa, pa] = this.meetAnims(w, partner, k);
      entry.yaw = faceTo(seg.x, seg.z, mx, mz); entry.anim = wa; entry.line = lineFor(w, 'w'); entry.partner = partner.id;
      p.set(partner.id, { x: mx, z: mz, yaw: faceTo(mx, mz, seg.x, seg.z), anim: pa, line: lineFor(partner, 'p'), lineDelay: 1.8, delay: 0.2, partner: w.id });
    }

    // (the dogs playing together is a scripted episode of its own: see dogs-play.js)

    // 2. now and then two neighbouring areas send someone to chat halfway
    if (hash01('cross', k) < (dark ? 0.07 : 0.2) && this.areas.length > 1) {
      const pairs = [];
      for (let i = 0; i < this.areas.length; i++) for (let j = i + 1; j < this.areas.length; j++) {
        const a = this.areas[i], b = this.areas[j];
        if (Math.hypot(a.x - b.x, a.z - b.z) < 32) pairs.push([a, b]);
      }
      if (pairs.length) {
        const [A, B] = pairs[Math.floor(hash01('crosspair', k) * pairs.length)];
        const la = (this.byArea.get(A.id) || []).filter(d => d.behavior === 'roam');
        const lb = (this.byArea.get(B.id) || []).filter(d => d.behavior === 'roam');
        const a = pickFree(la, 'xa'), b = pickFree(lb, 'xb');
        if (a && b) {
          taken.add(a.id); taken.add(b.id);
          const mx = (A.x + B.x) / 2 + (hash01('mx', k) - 0.5) * 4, mz = (A.z + B.z) / 2 + (hash01('mz', k) - 0.5) * 4;
          const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1;
          const ax = mx - (dx / d) * 0.6, az = mz - (dz / d) * 0.6, bx = mx + (dx / d) * 0.6, bz = mz + (dz / d) * 0.6;
          const [aa, ba] = this.meetAnims(a, b, k);
          p.set(a.id, { x: ax, z: az, yaw: faceTo(ax, az, bx, bz), anim: aa, line: lineFor(a, 'x'), delay: 0, partner: b.id });
          p.set(b.id, { x: bx, z: bz, yaw: faceTo(bx, bz, ax, az), anim: ba, line: lineFor(b, 'x'), lineDelay: 2, delay: 0, partner: a.id });
        }
      }
    }

    // 3. pairs inside an area, then 4. everyone else on their own
    for (const area of this.areas) {
      const list = this.byArea.get(area.id) || [];
      // the investigators get busier after dark; the unicorns doze
      const pairP = area.theme === 'arkham' ? (dark ? 0.8 : 0.4) : area.theme === 'unicorns' && dark ? 0 : 0.5;
      if (hash01(area.id, k, 'pair') < pairP) {
        const a = pickFree(list.filter(d => d.behavior === 'roam'), area.id + 'a');
        if (a) taken.add(a.id);
        const b = a ? pickFree(list.filter(d => d.behavior !== 'fixed'), area.id + 'b') : null;
        if (a && b) {
          taken.add(b.id);
          const ang = (a.homeAngle + b.homeAngle) / 2 + (Math.abs(a.homeAngle - b.homeAngle) > Math.PI ? Math.PI : 0);
          const r = (a.ring[0] + a.ring[1]) / 2;
          let mx = area.x + Math.cos(ang) * r, mz = area.z + Math.sin(ang) * r;
          if (b.behavior === 'sit') { mx = b.seat.x; mz = b.seat.z; }
          const tx = -Math.sin(ang), tz = Math.cos(ang);
          const ax = mx - tx * 0.65, az = mz - tz * 0.65;
          const bx = b.behavior === 'sit' ? b.seat.x : mx + tx * 0.65, bz = b.behavior === 'sit' ? b.seat.z : mz + tz * 0.65;
          const [aa, ba] = b.behavior === 'sit' ? ['talk', b.seat.anim] : this.meetAnims(a, b, k);
          p.set(a.id, { x: ax, z: az, yaw: faceTo(ax, az, bx, bz), anim: aa, line: lineFor(a, 'a'), delay: hash01(a.id, k, 'd') * 1.5, partner: b.id });
          p.set(b.id, { x: bx, z: bz, yaw: b.behavior === 'sit' ? this.seatYaw(b) : faceTo(bx, bz, ax, az), anim: ba, line: lineFor(b, 'b'), lineDelay: 2, delay: 0.3, partner: a.id });
        } else if (a) {
          taken.delete(a.id);
        }
      }
      for (const d of list) {
        if (p.has(d.id)) continue;
        p.set(d.id, this.soloPlan(d, k, lineFor, mood));
      }
    }
    this.planCache.set(k, p);
    if (this.planCache.size > 6) this.planCache.delete(this.planCache.keys().next().value);
    return p;
  }

  seatYaw(d) {
    const s = d.seat;
    if (s.yaw !== undefined) return s.yaw;
    if (s.faceX !== undefined) return faceTo(s.x, s.z, s.faceX, s.faceZ);
    return faceTo(s.x, s.z, d.area.x, d.area.z);
  }

  soloPlan(d, k, lineFor, mood = 'day') {
    const h = (salt) => hash01(d.id, k, salt);
    const dark = isDark(mood), theme = d.area?.theme;
    const talkP = theme === 'arkham' ? (dark ? 0.34 : 0.2) : theme === 'unicorns' && dark ? 0.05 : dark ? 0.14 : 0.28;
    const speak = h('speak') < talkP ? lineFor(d, 's') : null;
    if (d.behavior === 'fixed' || (d.behavior === 'sit' && (dark || h('stand') < 0.8))) {   // nobody gets up to stretch at night
      return { x: d.seat.x, z: d.seat.z, yaw: this.seatYaw(d), anim: d.seat.anim, line: speak, delay: 0 };
    }
    const area = d.area;
    if (d.kind === 'unicorn' && dark) {   // asleep on their feet at their own spot (unicorn.js may map 'sleep' to a pose; unknown names idle)
      const r = (d.ring[0] + d.ring[1]) / 2, x = area.x + Math.cos(d.homeAngle) * r, z = area.z + Math.sin(d.homeAngle) * r;
      return { x, z, yaw: faceTo(x, z, area.x, area.z) + 0.6, anim: 'sleep', line: speak, delay: 0 };
    }
    let ang, r;
    if (d.behavior === 'sit') { // stretch the legs near the seat
      const a0 = Math.atan2(d.seat.z - area.z, d.seat.x - area.x);
      ang = a0 + (h('a') - 0.5) * 0.8; r = Math.hypot(d.seat.x - area.x, d.seat.z - area.z) + 0.8;
    } else {
      ang = d.homeAngle + (h('a') - 0.5) * 2.2;
      r = d.ring[0] + h('r') * (d.ring[1] - d.ring[0]);
    }
    let x = area.x + Math.cos(ang) * r, z = area.z + Math.sin(ang) * r;
    const idles = (dark && NIGHT_IDLE[theme]) || (theme === 'garden' && mood === 'dawn' ? ['garden'] : d.idle);
    const idleAnim = d.behavior === 'sit' ? 'stretch' : idles[Math.floor(h('idle') * idles.length)];
    let yaw = h('face') < 0.6 ? faceTo(x, z, area.x, area.z) : h('yaw') * TAU;
    const spots = d.behavior === 'roam' && area.npcSpec?.spots; // (an area may list where its people stand: the garden's paths, not its beds)
    if (spots && spots.length) { const s = spots[Math.floor(h('spot') * spots.length)]; x = s.x; z = s.z; yaw = s.yaw ?? yaw; }
    return { x, z, yaw, anim: idleAnim, line: speak, delay: h('delay') * 2.5 };
  }

  meetAnims(a, b, k) {
    const hum = d => d.kind === 'human';
    const salt = hash01(a.id, b.id, k);
    if (hum(a) && hum(b)) {
      const list = a.area && a.area === b.area ? a.pairs : GENERIC_PAIRS;
      return list[Math.floor(salt * list.length)];
    }
    if (a.kind === 'unicorn' && b.kind === 'unicorn') return a.pairs[Math.floor(salt * a.pairs.length)];
    const pick = list => list[Math.floor(salt * list.length)];
    const quadAnim = d => (d.kind !== 'dog' ? pick(['nuzzle', 'prance'])
      : d.personality === 'nervous' ? pick(['sniff', 'sit', 'wag'])
        : d.personality === 'hyper' ? pick(['bounce', 'playbow', 'wag', 'spin']) : pick(['wag', 'sit', 'bark']));
    if (hum(a)) return [b.kind === 'dog' ? 'pet' : 'talk', quadAnim(b)];
    if (hum(b)) return [quadAnim(a), a.kind === 'dog' ? 'pet' : 'talk'];
    return [quadAnim(a), quadAnim(b)];
  }

  // ---------------------------------------------------------------- the time of day (npcs-day.js)

  // Is an area person simply at their area for the whole of beat k (and the beats either side)? Only then may the
  // beat plans pair them up. Decided from the hours alone (no paths), so plans and walks never depend on each other.
  homeBeat(d, k) {
    if (d.joyce) return false;   // (her day is joyce-day.js's: never anyone's partner in the beat plans)
    for (const t of [(k - 1) * L, k * L, (k + 1) * L + 0.5]) {
      const st = stintAt(d.name, t);
      if (!st) return true;
      if (st.cur.place !== 'home') return false;
      if (st.prev.place !== 'home' && !pinned() && t - st.t0 < MARGIN) return false;
    }
    return true;
  }

  placePos(d, place, t) {
    if (place === 'away') return { x: GATE[GATE.length - 1][0], z: GATE[GATE.length - 1][1] };
    if (place === 'boat') return { x: 57.5, z: -19 }; // Kevin steps down into his sailboat at the pier
    if (place === 'home') { const s = this.areaState(d, t); return { x: s.x, z: s.z }; }
    const a = this.areas.find(x => x.id === place.seat) || d.area;
    return { x: a.x + Math.cos(place.a) * 2.2, z: a.z + Math.sin(place.a) * 2.2, area: a };
  }
  // The walk from one place to the next, starting at t0 (cached): { path, dur, sp }
  dayMove(d, from, to, t0) {
    const key = d.id + ':' + t0;
    const cache = this.dayMoves || (this.dayMoves = new Map());
    let m = cache.get(key);
    if (m) return m;
    const tEnd = t0 + MARGIN;   // arriving home: walk to where the plan will want you once the margin is over
    const A = this.placePos(d, from, t0), B = this.placePos(d, to, to === 'home' ? tEnd : t0);
    let path;
    if (from === 'away') path = [...GATE.slice().reverse(), ...this.nav.route(WOODS[0], WOODS[1], B.x, B.z).slice(1)];
    else if (to === 'away') path = [...this.nav.route(A.x, A.z, WOODS[0], WOODS[1]), ...GATE];
    else path = this.nav.route(A.x, A.z, B.x, B.z);
    const len = polylineLength(path), sp = Math.max(d.speed, len / MOVE_CAP);
    m = { path, dur: len / sp, sp };
    cache.set(key, m);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return m;
  }

  // Where an area person is because of the time of day, or null when their day is just the usual one.
  dayState(d, t) {
    const st = stintAt(d.name, t);
    if (!st) return null;
    const { cur, prev, t0 } = st;
    const since = pinned() ? 1e9 : t - t0;
    if (prev.place !== cur.place && since < 1e8) {
      const m = this.dayMove(d, prev.place, cur.place, t0);
      if (since < m.dur) {
        const [x, z, dx, dz] = alongPolyline(m.path, since * m.sp);
        return { x, z, yaw: Math.atan2(dx, dz), speed: m.sp, anim: null };
      }
      if (cur.place === 'home' && since < MARGIN) {   // back: wait at the spot the plan will want, looking about
        const e = m.path[m.path.length - 1];
        return { x: e[0], z: e[1], yaw: faceTo(e[0], e[1], d.area.x, d.area.z), speed: 0, anim: 'look' };
      }
    }
    if (cur.place === 'home') return null;
    if (cur.place === 'boat') return { x: 57.5, z: -19, yaw: 0, speed: 0, anim: 'idle', hidden: true }; // dock.js draws him out on the lake
    if (cur.place === 'away') { const p = this.placePos(d, 'away', t); return { x: p.x, z: p.z, yaw: 0, speed: 0, anim: 'idle', hidden: true }; }
    // a seat elsewhere: round the campfire after dusk
    const p = this.placePos(d, cur.place, t), k = Math.floor(t / L);
    const mood = moodAt(k * L), al = areaLines(p.area.theme, mood);
    const lines = al ? al.lines : p.area.npcSpec?.lines || [];
    const line = hash01(d.id, k, 'seat') < (isDark(mood) ? 0.22 : 0.3) && lines.length ? lines[Math.floor(hash01(d.id, k, 'sl') * lines.length)] : null;
    const entry = { line, lineDelay: hash01(d.id, k, 'sd') * 4 };
    return { x: p.x, z: p.z, yaw: faceTo(p.x, p.z, p.area.x, p.area.z), speed: 0, anim: 'warm', entry, u: t - k * L, k, arrived: 0 };
  }

  // ---------------------------------------------------------------- per frame

  // The two dogs are one scene while they play: their positions and poses then come from the episode script.
  // A street visitor (Pat, Pete) has his own route; Nala barking at him outranks everything else she does.
  stateOf(d, t) {
    if (d.custom) return d.custom(t, d);   // a feature's own NPC (like the bus driver): its state comes from the feature
    if (d.behavior === 'street') return this.street.stateOf(d, t);
    if (d.behavior === 'molly') return mollyPlan(t);
    if (d.id === 'nala') { const s = this.street.nalaState(t); if (s) return s; }
    if (d.id === 'nala' || d.id === 'dax') {
      const es = episodeState(this, t);
      if (es) { const s = es[d.id]; s.ep = es.ep; s.epU = es.u; return s; }
      const ts = toyState(this, t); // a toy scene (dog-toys.js): the basket, and Nala taking Dax's toy
      if (ts && ts[d.id]) { const s = ts[d.id]; s.ep = ts.ep; return s; }
    }
    if (d.id === 'dax') { const b = this.baseState(d, t), w = this.street.daxState(t, b); return w || b; }
    return this.baseState(d, t);
  }

  // What the plain schedule says (no play episode). `stay: true` marks a settled stay.
  baseState(d, t) {
    if (d.behavior === 'patrol') {
      const dist = ((t * d.speed) % d.pathLen + d.pathLen) % d.pathLen;
      const [x, z, dx, dz] = alongPolyline(d.path, dist);
      const lap = Math.floor(t * d.speed / d.pathLen);
      const hidden = d.out ? !d.out(lap * d.pathLen / d.speed + 1) : false;   // each lap starts far down the street
      return { x, z, yaw: Math.atan2(dx, dz), speed: d.speed, anim: null, hidden };
    }
    if (d.joyce) return joyceState(d, t);
    if (d.kevin) { const k = kevinState(t); if (k) return k; }   // (null: at the end of the pier, the usual plan)
    if (d.crewPool) { const c = crewMateState(d, t, (dd, tt) => this.areaState(dd, tt), this.crewBumped); if (c) return c; }   // Kevin's fishing companion tonight
    if (d.area) { const ds = this.dayState(d, t); if (ds) return ds; }
    return this.areaState(d, t);
  }

  // The usual schedule (wanderers' itineraries, area people's beat plans).
  areaState(d, t) {
    const k = Math.floor(t / L), u = t - k * L;
    if (d.behavior === 'wander') {
      const { seg, start } = this.wanderSeg(d, k);
      if (seg.type === 'travel') {
        const tl = t - (start + seg.t0);
        const sp = seg.speed || d.speed;
        const { dist, pause } = travelAt(seg, Math.max(0, tl), sp);
        const [x, z, dx, dz] = alongPolyline(seg.path, dist);
        const moving = tl < seg.dur;
        if (pause && moving) return { x, z, yaw: pause.yaw, speed: 0, anim: pause.anim }; // a sniff stop on a fence walk
        return { x, z, yaw: Math.atan2(dx, dz), speed: moving ? sp : 0, anim: moving ? null : (d.kind === 'dog' ? 'sniff' : 'look') };
      }
      const e = this.plan(k).get(d.id);
      return { x: seg.x, z: seg.z, yaw: e ? e.yaw : seg.yaw, speed: 0, anim: e ? e.anim : seg.anim, entry: e, u, k, arrived: 0, stay: true, nap: !!seg.nap };   // (nap: asleep)
    }
    const prev = this.plan(k - 1).get(d.id), cur = this.plan(k).get(d.id);
    if (!prev || !cur) return { x: d.area.x, z: d.area.z, yaw: 0, speed: 0, anim: 'idle' };
    const path = detour(prev.x, prev.z, cur.x, cur.z, d.area.x, d.area.z, (d.area.tableR || 0) + 0.6);
    const len = polylineLength(path);
    let sp = d.speed;
    let walk = len / sp;
    const budget = L - cur.delay - 3.5;
    if (walk > budget) { sp = len / budget; walk = budget; }
    if (len < 0.05 || u < cur.delay) {
      const still = len < 0.05 ? cur : prev;
      return { x: still.x, z: still.z, yaw: still.yaw, speed: 0, anim: still.anim, entry: len < 0.05 ? cur : null, u, k, arrived: 0 };
    }
    if (u < cur.delay + walk) {
      const [x, z, dx, dz] = alongPolyline(path, (u - cur.delay) * sp);
      return { x, z, yaw: Math.atan2(dx, dz), speed: sp, anim: null };
    }
    return { x: cur.x, z: cur.z, yaw: cur.yaw, speed: 0, anim: cur.anim, entry: cur, u, k, arrived: cur.delay + walk };
  }

  // Speech bubble plus a voice (people babble, dogs bark or whine, unicorns neigh). `mood` is a hint for a dog's voice
  // ('alert' at the mail van, 'excited' in a play episode: dog-voice.js dogMood); the balloon is the same either way.
  say(d, text, secs = 4, silent = false, mood = null) {
    const dy = d.kind === 'human' ? 2.3 * (d.look.scale || 1) : d.kind === 'dog' ? 1.35 : 1.9;
    this.ui?.say(d.body.root, text, secs, dy, d.kind === 'dog' ? 'dog ' + d.id : ''); // (each dog has her own balloon: style.css .bubble.dog)
    { // said to the beat's partner, when there is one: the look goes to them (gaze.js; the mouth is main.js onSay's say())
      const h = d.body.h || d.body, pid = d._s?.entry?.partner, p = pid ? this.npcs.find(q => q.id === pid) : null, ph = p ? p.body.h || p.body : null;
      if (h.attn) h.attn.to = ph && ph.attn ? ph : null;
    }
    if (!silent) this.onSay?.(d, text, mood); // silent: the caller plays its own sound (yipe, thump)
  }

  // The player said hi. A dog's answer is shared (dogs-sync.js: everyone sees it); anyone else's is local-only.
  poke(d, now) {
    if (d.personality) { this.dogSync.poke(d.id); return; }
    let anim = d.kind === 'unicorn' ? 'prance' : 'wave';
    const hello = d.kind === 'human' && this.lastT ? greeting(this.lastT, Math.random()) : null;   // "Good evening!" (local, so random is fine)
    const line = hello || (d.lines?.length ? d.lines[Math.floor(Math.random() * d.lines.length)] : 'Hi!');   // (Lou the jogger has no lines)
    this.local.set(d.id, { anim, until: now + 3 });
    this.say(d, line, 3.5);
  }

  update(dt, t, now, playerPos) {
    this.now = now; this.lastT = t;
    const ov = hourOverride();
    if (ov !== this._override) { if (this._override !== undefined) this.resetCaches(); this._override = ov; }
    this.tickEpisode(t);
    this.street.update(dt, t, playerPos); // (the van isn't drawn far from you)
    kevinFrame(dt, t, this._audio);   // Kevin's boat, sail, lantern and sign for the shared hour (kevin-boat.js)
    // the dogs first: the shared simulation of their reactions, stepped to t (dogs-sync.js fills d._frame for both)
    this.dogSync.frame(dt, t, now, playerPos);
    for (const a of this.areas) if (a.npcSpec?.far) farLawn(a.npcSpec.far, a.x, a.z);   // (areas.js updates it too; the same answer)
    for (const d of this.npcs) {
      const s = d.personality && d._frame ? d._frame.s : this.stateOf(d, t);
      d._s = s;   // (crowd.js reads who is seated, riding or walking)
      if (d.kind === 'dog') d._escape = !!s.escape;   // (Nala out through the front gate: dogs-mail.js)
      const body = d.body;
      const root = body.root;
      // a town-cast member on a phone (Lou): drawn only while the shared cast has him; built on first need, freed after
      if (body.lazy) {
        const p = playerPos, dist = s.hidden || !p ? Infinity : Math.abs(p.x - s.x) + Math.abs(p.z - s.z);
        const on = d.castSeat.step(castAt(t).has(d.cast), !s.hidden, dist);
        if (!on && body.h) body.free();
        if (on && !body.h && !s.hidden && mayBuild(now)) body.build();
        if (!body.h) { if (root.visible) root.visible = false; d._placed = false; continue; }
      }
      // gone for the night / in the van: out of the scene (and placed afresh when they come back)
      // (Kevin asleep in his loft stands there unseen: a client that loads at night never placed him, and anything reading his
      // root would otherwise find him at the origin, in our living room)
      if (s.hidden) { if (root.visible) root.visible = false; if (d.kevin) root.position.set(s.x, s.y ?? 0, s.z); d._placed = false; continue; }
      // a lawn far from the camera (areas.js spec.far: the unicorns'): not drawn or animated, only kept at its spot (code that
      // reads where they are still finds them), eased in afresh when near
      if (d.area?.npcSpec?.far?.far) { if (root.visible) root.visible = false; root.position.set(s.x, 0, s.z); if (s.yaw != null) root.rotation.y = s.yaw; d._placed = false; continue; }
      if (!root.visible) root.visible = true;
      let anim = s.anim, yaw = s.yaw, speed = s.speed, at = null;
      const isDog = !!d.personality;
      if (d.behavior === 'street') {   // exactly where the route says (the scooter is drawn there too)
        body.params.seatY = s.seated ? SCOOTER.seat / (root.scale.y || 1) : 0; // (seat-height: the root on the scooter's deck, the seat over it)
        if (s.seated) { anim = 'sit'; speed = 0; s.x -= Math.sin(s.yaw) * 0.14; s.z -= Math.cos(s.yaw) * 0.14; }
        root.position.set(s.x, streetY(s.x, s.z) + (s.seated ? SCOOTER.deck : 0), s.z);
        root.rotation.y = !d._placed || s.riding ? yaw : angleLerp(root.rotation.y, yaw, Math.min(1, dt * 8));
        d._placed = true;
        const loc = this.local.get(d.id);
        if (loc) { if (now > loc.until) this.local.delete(d.id); else if (speed < 0.2 && !s.seated) anim = loc.anim; }
        body.update(dt, now, speed, anim === 'idle' ? null : anim);
        this.street.dress(d, s);
        continue;
      }

      // Dogs react to the visitors, to treats, toys and unicorns (shared: dogs-sync.js; so are the schedule and play episodes).
      if (isDog && d._frame) {
        const r = d._frame.r;
        s.x = r.x; s.z = r.z; anim = r.anim; yaw = r.yaw; speed = r.speed; at = r.at;
        if (s.ep && r.at == null) at = s.at ?? null;
        if (r.y != null) s.y = streetY(s.x, s.z) + r.y; else if (d.behavior === 'molly') delete s.y;   // (Molly up on the cart's seat, goggles on)
        if (d.behavior === 'molly') body.goggles = !!r.gog;
      }

      // don't snap: ease toward the computed pose (covers clock corrections)
      const first = !d._placed;
      d._placed = true;
      if (first || s.snap || Math.hypot(root.position.x - s.x, root.position.z - s.z) > 6) root.position.set(s.x, 0, s.z); // (snap: riding something, e.g. Kevin in his boat)
      else { const k = Math.min(1, dt * (isDog ? 26 : 12)); root.position.x += (s.x - root.position.x) * k; root.position.z += (s.z - root.position.z) * k; }
      root.position.y = s.y ?? (streetY(root.position.x, root.position.z) + (isDog ? bedLift(root.position.x, root.position.z) : 0));   // the lawn, or a sidewalk for Lou and anyone leaving. s.y: a boat. A dog in its bed sits on the cushion
      if (isDog) body.inBed = bedAt(root.position.x, root.position.z) >= 0;   // (its loaf rests the chin on the bolster: dogs.js)
      const loc = this.local.get(d.id);
      if (loc) {
        if (now > loc.until) this.local.delete(d.id);
        else if (speed < 0.2) {
          anim = loc.anim;
          if (loc.at) yaw = faceTo(root.position.x, root.position.z, loc.at.x, loc.at.z);   // (a local reaction to someone else: Kevin patting Molly)
          else if (playerPos) yaw = faceTo(root.position.x, root.position.z, playerPos.x, playerPos.z);
        }
      }
      root.rotation.y = first || s.snap ? yaw : angleLerp(root.rotation.y, yaw, Math.min(1, dt * (isDog ? 9 : 7)));
      if (d.kevin) kevinDress(body, s);   // his rod, a beer, the broom, sitting in the boat
      if (d.joyce) joyceDress(body, s);   // her seat in the golf cart or her chair, her power walk's arms
      if (d.dress) d.dress(body, s);      // (a feature's own NPC: seated, holding things)
      if (d.crewPool && (s.crew || d._crewOn)) { crewDress(body, s); d._crewOn = !!s.crew; }   // Kevin's companion: seated in the boat, a rod
      body.update(dt, now, speed, anim === 'idle' ? null : anim, isDog ? at : undefined);

      // speech bubbles, once per beat, shortly after arriving
      const e = s.entry;
      if (e && e.line) {
        const key = d.id + ':' + s.k;
        if (!this.spoken.has(key) && s.u > s.arrived + 0.4 + (e.lineDelay || 0) && s.u < L - 2) {
          this.spoken.add(key);
          if (this.spoken.size > 400) this.spoken.clear();
          this.say(d, e.line, 4);
        }
      }
    }
    this.brain.separateDrawn?.();   // (the eased bodies of the two dogs held to the same margin as their spots)
  }

  // Lines and sounds of the play episode (once each per client, only while it is on)
  tickEpisode(t) {
    const j = Math.floor(t / EP_SLOT);
    const ep = episodeOf(this, j);
    if (!ep) return;
    const u = t - ep.ts;
    if (u < 0 || u > ep.te) return;
    ep.events.forEach((e, i) => {
      if (u < e.u || u > e.u + 2.5) return;
      const key = j + ':' + i;
      if (this.epFired.has(key)) return;
      if (this.epFired.size > 200) this.epFired.clear();   // (before adding, or the event just fired would fire again)
      this.epFired.add(key);
      const d = this.dog(e.dog || e.at);
      if (!d) return;
      if (e.text) this.say(d, e.text, 3, !!e.silent, 'excited');   // (the play episode: the voices are excited)
      if (e.sfx) { const p = d.body.root.position; this.audio?.play(e.sfx, p.x, p.y + 0.2, p.z, { size: e.size }); }
    });
  }

  // Who would "E" talk to? Prefer whoever you're facing; shy Dax can be reached from further away.
  nearest(x, z, maxDist, facingYaw = null) {
    let best = null, bs = Infinity;
    for (const d of this.npcs) {
      if (!d.body.root.visible) continue;
      const p = d.body.root.position;
      const reach = d.personality === 'nervous' ? maxDist + 1.6 : maxDist;
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist > reach) continue;
      let score = dist / reach;
      if (facingYaw !== null && dist > 0.01) {
        const diff = Math.abs(angleLerp(0, Math.atan2(p.x - x, p.z - z) - facingYaw, 1));
        score += 0.8 * (diff / Math.PI);
      }
      if (score < bs) { bs = score; best = d; }
    }
    return best;
  }

}
