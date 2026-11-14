// The town bus at its stop. cars.js drives it (out of the tunnel every 30 minutes of the server clock, to the stop, round Maple
// Row and back: BUS_SCHEDULE in bus-model.js). This file is the rest: the doors, the inside you can walk into and sit in, Bernie
// the driver, the last call, the townsfolk who ride, the timetable at the shelter, the sounds. Nobody rides into the tunnel yet.
// The riders are a function of the shared clock and the bus's state, so everyone sees the same ones.
// feature.api: state(), seats, aboard(), board(), sit(i), stand(), getOff(), doors(), times(t), riders(), driver.
import * as THREE from 'three';
import { BUS_STOP, TOOL_CRIB, STRIP_MALL } from './layout.js';
import { BUS, BUS_SEATS, BUS_SCHEDULE, BUS_ARRIVE, busTimes, buildBusInside } from './bus-model.js';
import { STOP_PARTS } from './bus-stop-build.js';
import { addSurface, terrainHeight } from './terrain.js';
import { TAR_Y } from './road-net.js';
import { addSeat } from './seats.js';
import { Human } from './human.js';
import { NPCS, lookOf, voiceOf, tagOf } from './npc-looks.js';
import { hourAt } from './npcs-day.js';
import { hash01, alongPolyline, polylineLength } from './util.js';
import { indoorView } from './indoor-view.js';
import { ANIM_CODES } from './codes.js';
import { castOn, mayBuild } from './town-cast.js';

const ST = BUS_STOP.stop, L2 = BUS.L / 2, W2 = BUS.W / 2, D = BUS.doors, AISLE = (BUS.aisle.x0 + BUS.aisle.x1) / 2;
const FLOOR = TAR_Y + BUS.floorY;                          // the floor's height while it stands at the stop
const W = (lx, lz) => [ST.x + lx, ST.z + lz];              // the bus's frame at the stop to the world (it stands facing +z there)
const DOOR_Z = D.map(d => (d.z0 + d.z1) / 2);
const OUT_X = -W2 - 0.5, PAVE_X = -W2 - 1.45;              // a step outside a door, and on the pavement
export const DRIVER_LINES = ['Next stop, Breneland!', 'Mind the step!', 'Route 7, the Breneland Loop.', 'Every half hour, rain or shine.',
  'Dark as a pocket in that tunnel.', 'Hold on to the rail, folks.', 'Tickets? Nah, this one is on Breneland.', 'Lovely day for a ride.'];
const ARRIVE_LINES = ['Breneland! Summit Road!', 'Next stop, Breneland!', 'Here we are, Breneland!', 'Breneland, everybody!'];
const BOARD_LINES = ['Mind the step!', 'Welcome aboard!', 'Find a seat anywhere!', 'Hold on to the rail!'];
const RIDERS = ['ivy', 'hank', 'zoe', 'raj', 'mae'];
// where the riders go and come from: the Tool Crib's front walk (beside the post office since crib-move: over Summit Rd by the
// zebra at its walk, layout.js CROSSINGS) and Peak Threads, the clothing store in the strip mall (strip-mall: it stood where the bakery did)
const CRIB_FRONT = TOOL_CRIB.door === 'south' ? 1 : -1;
const DEST = [{ x: TOOL_CRIB.x, z: TOOL_CRIB.z + CRIB_FRONT * (TOOL_CRIB.d / 2 + 3.6), name: "Kevin's Tool Crib", north: CRIB_FRONT > 0 }, { x: STRIP_MALL.units.clothes.door.x, z: STRIP_MALL.minZ - 0.6, name: STRIP_MALL.units.clothes.name }];
const WALK_V = 1.35;

// ------------------------------------------------------------------ sounds
function registerBusSfx(a) {
  if (!a.registerSfx || a.sfxLib?.['bus-hiss']) return;
  // the air brakes letting go: a soft hiss that falls away
  a.registerSfx('bus-hiss', (a, x, y, z, { k = 1 } = {}) => {
    const out = a.at(x, y, z, 6, 1.1), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.9, type: 'highpass', f: 2600, sweep: 1500, Q: 0.4, peak: 0.07 * k, attack: 0.02 });
    a.burst(out, { t: t + 0.02, dur: 0.5, type: 'bandpass', f: 4200, Q: 1.2, peak: 0.035 * k, attack: 0.01 });
  });
  // the doors: a pneumatic puff and a soft thump at the end
  a.registerSfx('bus-doors', (a, x, y, z) => {
    const out = a.at(x, y, z, 4, 1.2), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.35, type: 'bandpass', f: 1800, Q: 0.8, peak: 0.06, attack: 0.02 });
    a.tone(out, { f: 140, glide: 90, t: t + 0.42, a: 0.004, d: 0.12, peak: 0.07 });
  });
  // the chime: two friendly notes (ding-dong)
  a.registerSfx('bus-chime', (a, x, y, z) => {
    const out = a.at(x, y, z, 5, 1.1), t = a.ctx.currentTime;
    a.tone(out, { f: 988, t, a: 0.004, d: 0.6, peak: 0.07, verb: 0.3 });
    a.tone(out, { f: 784, t: t + 0.32, a: 0.004, d: 0.8, peak: 0.07, verb: 0.3 });
  });
}

// ------------------------------------------------------------------ the riders' plans (pure in the trip and the bus's times)
// Trip j: who gets off (they rode in) and who gets on (they walk to the stop, wait on the bench), their seats and where they go.
const planCache = new Map();
function ridersOf(j) {
  let P = planCache.get(j);
  if (!P) {
    P = ridersOf0(j);
    for (const r of P.off) { r.path = offPath(r); r.len = polylineLength(r.path); }
    for (const r of P.on) { r.toB = toBenchPath(r); r.lenB = polylineLength(r.toB); r.board = boardPath(r); r.lenP = polylineLength(r.board); }
    planCache.set(j, P);
    if (planCache.size > 6) planCache.delete(planCache.keys().next().value);
  }
  return P;
}
function ridersOf0(j) {
  const order = RIDERS.map((id, k) => [hash01('busrider', j, k), id]).sort((a, b) => a[0] - b[0]).map(e => e[1]);
  const pick = h => (h < 0.3 ? 0 : h < 0.78 ? 1 : 2);
  const nOff = pick(hash01('busoff', j)), nOn = pick(hash01('buson', j));
  const seats = BUS_SEATS.map((s, i) => [hash01('busseat', j, i), i]).sort((a, b) => a[0] - b[0]).map(e => e[1]);
  const off = order.slice(0, nOff).map((id, k) => ({ id, k, seat: seats[k], dest: DEST[hash01('busdest', j, id) < 0.7 ? 0 : 1] }));
  const on = order.slice(nOff, nOff + nOn).map((id, k) => ({ id, k, seat: seats[2 + k], dest: DEST[hash01('busfrom', j, id) < 0.7 ? 0 : 1], bench: k === 0 ? 3 : 0 }));
  return { off, on };
}
// the walk from a door of the stopped bus to a shop's door (and back the other way for someone coming to the stop)
function streetRoute(fromZ, dest) {
  return [[-117.3, fromZ - 0.6], [-117.3, -101.6], [-120.2, -103.8], [-120.2, -118.6], [-120.2, -120.4], [dest.x, -120.4], ...(dest.north ? [[dest.x, -132.5]] : []), [dest.x, dest.z]]; // (north: over the zebra to the north sidewalk first)
}
// a rider getting off: seat -> aisle -> the middle door -> the pavement -> the shop
function offPath(r) {
  const s = BUS_SEATS[r.seat], dz = DOOR_Z[1];
  return [W(s.x, s.z), W(AISLE, s.z), W(AISLE, dz), W(OUT_X, dz), W(PAVE_X, dz), ...streetRoute(ST.z + dz, r.dest)];
}
// a rider getting on: the shop -> the bench (wait) ... then the bench -> the front door -> the aisle -> the seat
function toBenchPath(r) {
  const b = STOP_PARTS.benchSeats[r.bench] || STOP_PARTS.benchSeats[0];
  return [...streetRoute(ST.z + DOOR_Z[1], r.dest).reverse(), [-117.6, b.z], [b.x + 0.75, b.z], [b.x, b.z]];
}
function boardPath(r) {
  const b = STOP_PARTS.benchSeats[r.bench] || STOP_PARTS.benchSeats[0], s = BUS_SEATS[r.seat], dz = DOOR_Z[0];
  return [[b.x, b.z], [b.x + 0.75, b.z], [-117.0, ST.z + dz], W(OUT_X, dz), W(AISLE, dz - 0.2), W(AISLE, s.z), W(s.x, s.z)];
}

export function createBus(ctx) {
  const { scene, player, npcs, net, ui, audio, camera, colliders, remotes, features } = ctx;
  const cars = features.find(f => f.name === 'cars');
  if (!cars || !cars.api.bus) return null;
  const bus = cars.api.bus, g = bus.model.g, P = cars.api.busPath();
  registerBusSfx(audio);
  const parts = buildBusInside(g);

  // ---------------------------------------------------------------- what is solid and walkable while it waits at the stop
  // (fixed boxes, since it always stands in the same place; `off` whenever it isn't there)
  const wall = (x0, x1, z0, z1, extra) => { const c = { type: 'box', minX: ST.x + x0, maxX: ST.x + x1, minZ: ST.z + z0, maxZ: ST.z + z1, off: true, bus: true, house: true, ...extra }; colliders.push(c); return c; }; // (house: camera-fade.js cuts no holes for them, you are inside)
  const walls = [
    wall(W2 - 0.12, W2 + 0.06, -L2, L2),                         // the driver's side
    wall(-W2, W2, L2 - 0.62, L2 + 0.06),                         // the dashboard and the nose
    wall(-W2, W2, -L2 - 0.06, -L2 + 0.2),                        // the back
    wall(-W2 - 0.06, -W2 + 0.12, -L2, D[1].z0),                  // the kerb side, between and round the doors
    wall(-W2 - 0.06, -W2 + 0.12, D[1].z1, D[0].z0),
    wall(-W2 - 0.06, -W2 + 0.12, D[0].z1, L2),
    wall(BUS.aisle.x1, W2, BUS.driver.z - 0.5, L2),              // the driver's cab
    wall(0.02, 0.3, 4.05, 4.35),                                 // the fare box
    wall(BUS.aisle.x1 + 0.08, W2, -3.75, 2.25),                  // the seats down the driver's side
    wall(-W2, BUS.aisle.x0 - 0.08, 0.8, 2.25),                   // the seats on the door side, before and after the middle door
    wall(-W2, BUS.aisle.x0 - 0.08, -3.75, -1.15),
    wall(-W2, W2, -L2, -4.12),                                   // the back bench
  ];
  const doorPlugs = D.map(d => wall(-W2 - 0.06, -W2 + 0.12, d.z0, d.z1));   // (closed doors)
  const IN = { minX: ST.x - W2 + 0.1, maxX: ST.x + W2 - 0.1, minZ: ST.z - L2 + 0.2, maxZ: ST.z + L2 - 0.2 };   // inside, for "aboard"
  const floor = { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6, y: FLOOR, sound: 'wood' };
  addSurface(floor);
  const inBus = (x, z, pad = 0) => x > IN.minX - pad && x < IN.maxX + pad && z > IN.minZ - pad && z < IN.maxZ + pad;
  // the seats: in the seat system (on only while it waits), seated by this feature
  const seats = BUS_SEATS.map((s, i) => { const [x, z] = W(s.x, s.z); return addSeat(x, z, FLOOR + (s.y - BUS.floorY), 0, 'bus seat', 'E  Sit', { on: () => ready, bus: i }); });

  // ---------------------------------------------------------------- the camera inside (the walk-in buildings' view)
  const iv = ctx.indoorView || (ctx.indoorView = indoorView(ctx));
  iv.register({
    id: 'bus', inside: (x, z) => ready && inBus(x, z),
    rooms: [{ id: 'bus', minX: IN.minX, maxX: IN.maxX, minZ: IN.minZ, maxZ: IN.maxZ, y: FLOOR, cams: [[ST.x - 0.6, ST.z + L2 - 0.9, FLOOR + 2.05], [ST.x + 0.5, ST.z - L2 + 0.6, FLOOR + 2.05]] }],
    walls: [{ minX: ST.x - W2 - 0.1, maxX: ST.x - W2 + 0.1, minZ: ST.z - L2, maxZ: ST.z + L2, y0: FLOOR - 0.5, y1: FLOOR + 3 }, { minX: ST.x + W2 - 0.1, maxX: ST.x + W2 + 0.1, minZ: ST.z - L2, maxZ: ST.z + L2, y0: FLOOR - 0.5, y1: FLOOR + 3 }],
  });

  // ---------------------------------------------------------------- Bernie, the driver (an NPC: lines, voice, hello with E)
  const dState = { x: ST.x, z: ST.z, y: FLOOR, yaw: 0, speed: 0, anim: 'drive', hidden: true, snap: true, seated: true };
  const driver = npcs.addCustom({
    id: 'bernie', npc: 'bernie', name: NPCS.bernie.name, kind: 'human', look: lookOf('bernie', NPCS.bernie.look), voice: voiceOf('bernie', NPCS.bernie.voice),
    lines: DRIVER_LINES, custom: () => dState,
    dress: body => { body.params.seatY = BUS.driver.seatY - BUS.floorY; },
  });
  { const tg = ui.nameTag(driver.body.root, tagOf('bernie', driver.name), '#ffffff'); tg.max = 16; tg.fade = 11; }
  const busPose = { x: 0, z: 0, y: 0, yaw: 0 };
  const toWorld = (lx, ly, lz, o) => { const c = Math.cos(busPose.yaw), s = Math.sin(busPose.yaw); o[0] = busPose.x + c * lx + s * lz; o[1] = busPose.y + ly; o[2] = busPose.z - s * lx + c * lz; return o; };
  const tmp3 = [0, 0, 0];

  // ---------------------------------------------------------------- the riders (built when near, a pool of five)
  const riders = new Map(RIDERS.map(id => [id, { id, name: NPCS[id].name, h: null, tag: null, s: null }]));
  const lazy = castOn();
  const buildRider = r => { r.h = new Human({ ...lookOf(r.id, NPCS[r.id].look) }); r.h.root.visible = false; scene.add(r.h.root); r.tag = ui.nameTag(r.h.root, tagOf(r.id, r.name), '#ffffff'); r.tag.max = 14; r.tag.fade = 10; };
  const freeRider = r => { scene.remove(r.h.root); r.h.dispose(); r.tag?.remove?.(); r.h = null; r.tag = null; };
  // where rider r is at t on trip j (the bus's shared times arr, dep): { x, z, y, yaw, speed, anim, seatY, inBus } or null (not around)
  // (one state object per rider, refilled: nothing allocated a frame but alongPolyline's little array)
  const riderS = new Map(RIDERS.map(id => [id, { inBus: false, seat: 0, x: 0, z: 0, yaw: 0, speed: 0, anim: null, seatY: 0, sit: false }]));
  const inBusS = (o, seat) => { o.inBus = true; o.seat = seat; o.sit = false; o.anim = 'sit'; o.speed = 0; return o; };
  const walkS = (o, path, d) => { const [x, z, dx, dz] = alongPolyline(path, d); o.inBus = false; o.sit = false; o.x = x; o.z = z; o.yaw = Math.atan2(dx, dz); o.speed = WALK_V; o.anim = null; o.seatY = 0; return o; };
  function riderAt(role, r, t, T, arr, dep, riding) {
    const o = riderS.get(r.id);
    if (role === 'off') {
      if (arr === null) return riding ? inBusS(o, r.seat) : null;
      const t0 = arr + 3 + r.k * 2.6;
      if (t < t0) return inBusS(o, r.seat);
      const d = (t - t0) * WALK_V;
      return d >= r.len ? null : walkS(o, r.path, d);
    }
    // getting on
    const tAppear = T - 48 + r.k * 9, tBench = tAppear + r.lenB / WALK_V;
    if (t < tAppear) return null;
    const tGo = (arr === null ? Infinity : Math.max(dep - 19 + r.k * 3.2, arr + 4));
    if (t < tBench) return walkS(o, r.toB, (t - tAppear) * WALK_V);
    if (t < tGo) {
      const b = STOP_PARTS.benchSeats[r.bench] || STOP_PARTS.benchSeats[0];
      o.inBus = false; o.x = b.x; o.z = b.z; o.yaw = b.yaw; o.speed = 0; o.anim = Math.floor((t - tBench) / 7) % 3 === 2 ? 'look' : 'sit'; o.seatY = b.y - (b.floor ?? 0.44); o.floorY = b.floor ?? 0.44; o.sit = true; // (seat-height: on the shelter's floor, it was 5 cm under it)
      return o;
    }
    const d = (t - tGo) * WALK_V;
    return d < r.lenP ? walkS(o, r.board, d) : inBusS(o, r.seat);
  }

  // ---------------------------------------------------------------- state
  let ready = false;          // standing at the stop with its doors open enough to come and go
  let doorK = 0, phase = 'tunnel', sitting = null, lastTrip = null;
  const ev = { j: null, arr: false, open: false, last: false, close: false, go: false };   // (what this screen has played for the trip)
  const near = (x, z, r) => Math.hypot(player.pos.x - x, player.pos.z - z) < r;
  const sound = (name, lx, ly, lz) => { const [x, y, z] = toWorld(lx, ly, lz, tmp3); if (near(x, z, 60)) audio.play?.(name, x, y, z); };
  const busTimesNow = () => { const B = bus.cur; const t = net.serverNow() / 1000; return { t, B }; };
  const stopped = B => B.trip !== null && !B.left && B.arr !== null;
  const atStop = () => Math.abs(g.position.x - ST.x) < 0.06 && Math.abs(g.position.z - ST.z) < 0.06;
  const aboardMe = () => !!sitting || (ready && inBus(player.pos.x, player.pos.z, 0.05));

  // ---------------------------------------------------------------- the player: board, sit, get up, get off
  function hop(tx, tz, yaw) {
    player.yaw = yaw;
    player.vault = { t: 0, dur: 0.5, from: player.pos.clone(), to: new THREE.Vector3(tx, FLOOR, tz), peak: 0.22 };
  }
  function board(i = 0) {
    if (!ready || sitting) return false;
    const dz = DOOR_Z[i] ?? DOOR_Z[0], [x, z] = W(AISLE, dz - (i === 0 ? 0.2 : 0));
    hop(x, z, i === 0 ? Math.PI : 0);
    if (driver.body.root.visible) setTimeout(() => npcs.say(driver, BOARD_LINES[Math.floor(Math.random() * BOARD_LINES.length)], 3), 450); // (local: your own welcome)
    return true;
  }
  function sit(i) {
    const s = seats[i];
    if (!s || !ready) return false;
    if (player.vault) player.vault = null;
    sitting = s;
    player.pos.set(s.x, FLOOR, s.z); player.yaw = 0; // (seat-height: on the bus's floor, the seat over it: the feet on the floor, not the road under it)
    player.character.params.seatY = Math.max(0.16, s.y - FLOOR);
    player.character.root.visible = true;   // (first person aboard hid your body: seated, the camera looks at you)
    const satAt = performance.now() / 1000;
    player.takeover = {
      anim: 'sit',
      update(dt, now, inp, pl) {
        pl.pos.set(s.x, FLOOR, s.z); pl.yaw = 0;
        const mv = inp.move();
        if (Math.hypot(mv.x, mv.y) > 0.5 && now - satAt > 0.6) stand();
      },
      // a camera up in the front of the bus looking back down the aisle at you (the roof stays on)
      camera(dt, cam) {
        const hz = Math.min(L2 - 0.8, s.z - ST.z + 3.2);   // (up in the door side's front corner, clear of the ceiling rails)
        cam.position.set(ST.x - 0.92, FLOOR + 2.15, ST.z + hz);
        cam.lookAt(s.x, FLOOR + 1.0, s.z);
        return true;
      },
    };
    audio.ui?.('pop');
    ui.toast('Sitting on the bus. E or move to get up.', 2400);
    return true;
  }
  function stand() {
    if (!sitting) return;
    const s = sitting; sitting = null;
    player.takeover = null;
    player.character.params.seatY = 0;
    const lx = AISLE, lz = s.z - ST.z;
    player.pos.set(ST.x + lx, ready ? FLOOR : TAR_Y, s.z); player.yaw = 0;
    player.collide();
  }
  function getOff(i = null, toast = null) {
    if (sitting) stand();
    const lz = player.pos.z - ST.z;
    const k = i !== null ? i : Math.abs(lz - DOOR_Z[0]) < Math.abs(lz - DOOR_Z[1]) ? 0 : 1;
    const [x, z] = W(PAVE_X, DOOR_Z[k]);
    player.yaw = -Math.PI / 2;
    player.vault = { t: 0, dur: 0.5, from: player.pos.clone(), to: new THREE.Vector3(x, 0.44, z), peak: 0.22 };
    if (toast) ui.toast(toast, 3600);
    return true;
  }

  // ---------------------------------------------------------------- the timetable at the shelter
  const clock = t => { const h = hourAt(t), hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`; };
  let ttAt = -1;
  function timetable(t, B) {
    const s = Math.floor(t);
    if (s === ttAt) return; ttAt = s;
    if (stopped(B)) { STOP_PARTS.timetable?.set(['Every 30 minutes', 'Boarding now', 'Route 7', 'leaves ' + clock(B.dep)]); return; }
    const T = busTimes(t), due = B.trip !== null && B.trip === T.j && B.arr === null && !B.left ? T.arrive : T.next;
    const m = Math.ceil((due - t) / 60);
    STOP_PARTS.timetable?.set(['Every 30 minutes', 'Next bus', clock(due), due - t < 50 ? 'any moment now' : m <= 1 ? 'in a minute' : `in ${m} min`]);
  }

  // ---------------------------------------------------------------- per frame
  const remoteSat = new Map();
  function update(dt, now) {
    const t = net.serverNow() / 1000, B = bus.cur;
    const vis = g.visible;
    busPose.x = g.position.x; busPose.y = g.position.y; busPose.z = g.position.z; busPose.yaw = g.rotation.y;
    const there = stopped(B);
    const here = there && atStop();
    phase = B.trip === null ? 'tunnel' : B.left ? 'leaving' : B.arr === null ? 'arriving' : t >= B.dep - BUS_SCHEDULE.lastCall ? 'lastcall' : 'boarding';
    // the doors: open a second after it stops, closed two before it goes
    const open = here && t >= B.arr + 1.0 && t < B.dep - 2.0;
    const k0 = doorK;
    doorK = Math.max(0, Math.min(1, doorK + (open ? dt : -dt) * 1.6));
    // near: the four leaves that fold; far: one cheap shut-doors mesh (or nothing while they stand open)
    const camD = Math.hypot(camera.position.x - g.position.x, camera.position.z - g.position.z), farDoors = camD > 40;
    for (const d of parts.doors) for (const leaf of d.leaves) if (leaf.visible === farDoors) leaf.visible = !farDoors;
    parts.shut.visible = farDoors && doorK === 0 && camD < 90;   // (past 90 m neither the shut doors nor the names are drawn: specks)
    parts.names.visible = camD < 90;
    if (doorK !== k0) { const e = doorK * doorK * (3 - 2 * doorK); for (const d of parts.doors) for (const leaf of d.leaves) leaf.rotation.y = leaf.userData.sgn * 1.42 * e; } // (folded in)
    ready = here && doorK > 0.6;
    bus.docked = here;   // (cars.js: no body circles while it stands at the stop; its walls are solid instead)
    bus.noFade = aboardMe();   // (camera-fade.js: the bus never fades round you while you are aboard)
    for (const c of walls) c.off = !here;
    D.forEach((d, i) => { doorPlugs[i].off = !here || doorK > 0.5; });
    if (here) { floor.minX = IN.minX - 0.1; floor.maxX = IN.maxX + 0.1; floor.minZ = IN.minZ - 0.1; floor.maxZ = IN.maxZ + 0.1; }
    else { floor.minX = floor.maxX = floor.minZ = floor.maxZ = 1e6; }
    // the inside drawn only when someone could see it; far away the glass is darker (no empty bus to see through)
    parts.inside.visible = vis && camD < 34;
    parts.glass.material.opacity = parts.inside.visible ? 0.3 : 0.62;
    // ---- sounds and Bernie's lines, once each per trip on this screen
    if (B.trip !== null) {
      const j = B.trip;
      if (ev.j !== j) { ev.j = j; ev.arr = ev.open = ev.last = ev.close = ev.go = false; }
      if (there && here && !ev.arr) { ev.arr = true; sound('bus-hiss', 0, 0.6, 0); }
      if (open && !ev.open) { ev.open = true; sound('bus-doors', -W2, 1.2, DOOR_Z[0]); setTimeout(() => sound('bus-chime', 0, 2.3, 3.6), 350); if (near(ST.x, ST.z, 40)) { npcs.say(driver, ARRIVE_LINES[Math.floor(hash01('busline', j) * ARRIVE_LINES.length)], 3.5); npcs.local.set(driver.id, { anim: 'wave', until: now + 2.4 }); } }
      if (phase === 'lastcall' && !ev.last) { ev.last = true; sound('bus-chime', 0, 2.3, 3.6); if (near(ST.x, ST.z, 40)) npcs.say(driver, 'All aboard!', 3); }
      if (there && t >= B.dep - 2.0 && doorK < 1 && !ev.close) { ev.close = true; sound('bus-doors', -W2, 1.2, DOOR_Z[0]); }
      if (B.left && !ev.go) { ev.go = true; sound('bus-hiss', 0, 0.6, -2); }
      lastTrip = j;
    }
    // ---- nobody rides into the tunnel: anyone still aboard steps off onto the stop's pavement before the doors close
    if (there && t >= B.dep - BUS_SCHEDULE.stepOff && aboardMe() && !player.vault) getOff(null, 'The bus is off through the tunnel. You hop off at the stop.');
    if (sitting && !ready) stand();
    // ---- Bernie in his seat (the bus's pose this frame), hidden with the bus
    toWorld(BUS.driver.x, BUS.floorY, BUS.driver.z - 0.02, tmp3);
    dState.x = tmp3[0]; dState.y = tmp3[1]; dState.z = tmp3[2]; dState.yaw = busPose.yaw; dState.hidden = !vis || camD > 70;   // (far off he is not drawn: the glass is dark there)
    dState.anim = 'drive';
    const dr = driver.body.root;
    if (vis) { dr.position.set(tmp3[0], tmp3[1], tmp3[2]); dr.rotation.y = busPose.yaw; }
    // ---- the riders
    timetable(t, B);
    riderFrame(t, B, dt, now);
  }
  // which trip's riders to show: the current trip, or the next one's early arrivals walking to the stop
  const seen = new Set();
  function riderFrame(t, B, dt, now) {
    const cd = Math.hypot(camera.position.x - ST.x, camera.position.z - ST.z), cb = Math.hypot(camera.position.x - g.position.x, camera.position.z - g.position.z);
    const nearAny = Math.min(cd, g.visible ? cb : Infinity) < 80;
    const T = busTimes(t), cur = B.trip !== null ? B.trip : null;
    const jNext = T.j + (cur === T.j || t > T.T0 + 200 ? 1 : 0);
    seen.clear();
    const show = (j, T0, arr, dep, riding) => {
      const plan = ridersOf(j);
      for (let q = 0; q < 2; q++) for (const r of q ? plan.on : plan.off) {
        const st = riderAt(q ? 'on' : 'off', r, t, T0, arr, dep, riding);
        if (!st) continue;
        if (st.inBus && (!g.visible || cb > 45)) continue;   // (riding: only drawn when the bus is near the camera)
        seen.add(r.id);
        place(riders.get(r.id), st, dt, now, nearAny);
      }
    };
    if (cur !== null) show(cur, cur * BUS_SCHEDULE.period + BUS_SCHEDULE.offset, B.arr, B.dep ?? (cur * BUS_SCHEDULE.period + BUS_SCHEDULE.depart), true);
    if (jNext !== cur) { const T0 = jNext * BUS_SCHEDULE.period + BUS_SCHEDULE.offset; show(jNext, T0, null, T0 + BUS_SCHEDULE.depart, false); }
    for (const r of riders.values()) if (!seen.has(r.id)) { r.s = null; if (r.h) { r.h.root.visible = false; if (lazy && !nearAny) freeRider(r); } }
  }
  const tmpS = [0, 0, 0];
  function place(r, st, dt, now, nearAny) {
    r.s = st;
    if (!r.h) { if (!nearAny || !mayBuild(now)) return; buildRider(r); }
    const root = r.h.root;
    root.visible = true;
    let anim = st.anim, speed = st.speed || 0;
    if (st.inBus) {
      const s = BUS_SEATS[st.seat];
      toWorld(s.x, BUS.floorY, s.z, tmpS);
      root.position.set(tmpS[0], tmpS[1], tmpS[2]); root.rotation.y = busPose.yaw;
      r.h.params.seatY = s.y - BUS.floorY; anim = 'sit'; speed = 0;
      if (r.tag) r.tag.max = ready ? 14 : 0;   // (no names floating along with a moving bus)
    } else {
      const inside = inBus(st.x, st.z, 0.3);
      if (r.tag) r.tag.max = 14;
      root.position.set(st.x, inside ? FLOOR : st.sit ? st.floorY : groundY(st.x, st.z), st.z);
      root.rotation.y = st.yaw;
      r.h.params.seatY = st.sit ? st.seatY : 0;
      if (st.sit && anim !== 'sit') anim = 'sit';
    }
    if (Math.hypot(camera.position.x - root.position.x, camera.position.z - root.position.z) < 70) r.h.update(dt, now, speed, anim === 'idle' ? null : anim);
  }
  const groundY = (x, z) => { const y = terrainHeight(x, z); return Math.max(y, x > -118.25 && x < -115.3 ? 0.44 : y, BUS_STOP.plaza && x > BUS_STOP.plaza.minX && x < BUS_STOP.plaza.maxX && z > BUS_STOP.plaza.minZ && z < BUS_STOP.plaza.maxZ ? 0.44 : y, z < -119 && z > -122 ? 0.44 : y, x > BUS_STOP.path.minX && x < BUS_STOP.path.maxX && z > BUS_STOP.path.minZ && z < BUS_STOP.path.maxZ ? 0.44 : y); };

  // ---------------------------------------------------------------- the E prompt
  const left = () => { const { t, B } = busTimesNow(); return stopped(B) ? Math.max(0, Math.ceil(B.dep - BUS_SCHEDULE.stepOff - t)) : 0; };
  const soon = () => { const n = left(); return n <= BUS_SCHEDULE.lastCall ? `  ·  leaving in ${n} s` : ''; };
  function target(px, pz) {
    if (sitting) return { hint: 'E  Get up' + soon(), prio: 7, run: stand };
    if (!ready) return null;
    if (inBus(px, pz, 0.05)) {
      let best = -1, bd = 1.25;
      seats.forEach((s, i) => { const d = Math.hypot(px - s.x, pz - s.z); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) return { hint: 'E  Sit' + soon(), prio: 7, run: () => sit(best) };
      const nearDoor = DOOR_Z.findIndex(dz => Math.abs(pz - (ST.z + dz)) < 0.9 && px < ST.x + AISLE + 0.2);
      if (nearDoor >= 0) return { hint: 'E  Get off' + soon(), prio: 6, run: () => getOff(nearDoor) };
      return null;
    }
    for (let i = 0; i < D.length; i++) {
      const [x, z] = W(OUT_X - 0.3, DOOR_Z[i]);
      if (Math.hypot(px - x, pz - z) < 1.9) { const n = left(); return { hint: 'E  Board the bus' + (n <= BUS_SCHEDULE.lastCall ? `  ·  leaving in ${n} s` : ''), prio: 6, run: () => board(i) }; }
    }
    return null;
  }

  // ---------------------------------------------------------------- others seated aboard: drawn in the seats (like picnic.js does)
  function afterRemotes() {
    if (!remotes?.map) return;
    for (const r of remotes.map.values()) {
      const last = r.buf?.[r.buf.length - 1];
      const sat = last && ANIM_CODES[last.a] === 'sit' && Math.abs(last.x - ST.x) < 2 && Math.abs(last.z - ST.z) < 6 ? seats.find(s => Math.hypot(last.x - s.x, last.z - s.z) < 0.35) : null;
      if (sat) {
        const sc = r.ch.root.scale.y || 1;
        r.ch.params.seatY = (sat.y - FLOOR) / sc; r.ch.root.rotation.y = 0;
        remoteSat.set(r.sid, sat);
      } else if (remoteSat.has(r.sid)) { r.ch.params.seatY = 0; remoteSat.delete(r.sid); }
    }
  }

  return {
    name: 'bus',
    update, target, afterRemotes,
    onKey(code) { if (sitting && code === 'Space') { stand(); return true; } return false; },
    help: [[['E'], 'board the bus at the stop, sit down, get off (it comes every 30 minutes)']],
    api: {
      get phase() { return phase; },
      // the bus's shared state now: where it is and what it is doing
      state() {
        const { t, B } = busTimesNow();
        return { t, phase, trip: B.trip, s: B.s, v: B.v, arr: B.arr, dep: B.dep, left: !!B.left, x: g.position.x, z: g.position.z, yaw: g.rotation.y, visible: g.visible, atStop: atStop(), ready, doors: doorK, why: B.why, sStop: P.sStop };
      },
      seats, stop: ST, doors: () => doorK, times: busTimes, schedule: BUS_SCHEDULE, arriveIn: BUS_ARRIVE,
      // who is aboard: you (standing or seated), the others seated (their own screens step them off), the riders inside
      aboard() {
        const out = { me: aboardMe(), seated: sitting ? seats.indexOf(sitting) : -1, remotes: [...remoteSat.keys()], riders: [] };
        for (const r of riders.values()) if (r.s && (r.s.inBus || (r.s.x !== undefined && inBus(r.s.x, r.s.z)))) out.riders.push(r.id);
        return out;
      },
      board, sit, stand, getOff,
      riders: () => [...riders.values()].map(r => ({ id: r.id, built: !!r.h, visible: !!r.h?.root.visible, s: r.s ? (r.s.inBus ? { inBus: true, seat: r.s.seat } : { x: r.s.x, z: r.s.z, yaw: r.s.yaw, speed: r.s.speed, anim: r.s.anim, seatY: r.s.seatY, sit: r.s.sit }) : null })),
      plan: ridersOf,
      driver,
      parts,
      inBus,
    },
  };
}
