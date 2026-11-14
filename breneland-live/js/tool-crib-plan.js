// Kevin's Tool Crib as plain numbers (no three.js): the building, its porch, the stair and the loft, where everything stands
// inside, the spots Kevin works at and the shop's hours. tool-crib-build.js builds to these, tool-crib.js runs the shop, and
// kevin-day.js (Kevin's week, a pure function of the shared clock) walks him round them. Everything comes from layout.js
// TOOL_CRIB.
//
// THE FRAME (crib-move, 2026-11-08): the plan below is drawn in the crib's OWN frame, as it was built on Summit Rd's south side:
// +x east, +z south, the front and the door at minZ ("north"), the loft over the back (maxZ), the stair up the minX wall, the
// counter and the roll-up door on the maxX wall. The crib now stands on the road's north side facing south (TOOL_CRIB.door), so
// the whole building is turned half round about its middle: tool-crib-build.js rotates its group by PI and everything that is not
// drawn in that group (colliders, surfaces, seats, the lamps' spots, Kevin's spots and walks, the sound's spots, the prompts) goes
// through toWorld / worldYaw / worldBox here. world = (2 sx - x, 2 sz - z), yaw + PI. The outer footprint box is the same either
// way (the turn is about the middle); CRIB.world has the parts that move: the door, the porch, the steps, the sidewalk in front.
// CRIB.front is the world direction the front faces (+1 = +z, south). With TOOL_CRIB.door 'north' every helper is the identity.
//
// Two floors in a height field (as the game store): the loft stands over a stockroom nobody walks into, so every (x, z) has one
// floor: the loft's is a `deck` surface, the stair is fifteen treads up the west wall, the shop floor is everywhere else.
import { TOOL_CRIB } from './layout.js';
import { hash01 } from './util.js';
import { easternDay } from './wreath-data.js';

export const CRIB = (() => {
  const { x: sx, z: sz, w, d, loftD } = TOOL_CRIB;
  const gy = 0.34, fy = 0.65, H = 6.0, T = 0.2, PT = 0.16;    // the town's ground, the floor (on a porch's height), the eaves, the walls, the partition
  const minX = sx - w / 2, maxX = sx + w / 2, minZ = sz - d / 2, maxZ = sz + d / 2;
  const iMinX = minX + T, iMaxX = maxX - T, iMinZ = minZ + T, iMaxZ = maxZ - T;
  const top = gy + H;                                         // the ceiling (the roof's gable is over it)
  const zL = iMaxZ - loftD;                                   // the partition's loft face: the loft is south of it, the shop north
  const zP = zL - PT;                                         // the partition's shop face
  const LY = fy + 2.85;                                       // the loft's floor
  const N = 15, rise = (LY - fy) / N, tread = 0.29;
  const stair = { minX: iMinX, maxX: iMinX + 0.95, z0: zP - N * tread, z1: zP, n: N, rise, tread };
  stair.x = (stair.minX + stair.maxX) / 2;
  // the front: the porch (a boardwalk at the floor's height) the width of the shop, two steps up from the sidewalk
  const porch = { minX, maxX, minZ: minZ - 2.1, maxZ: minZ, y: fy };
  const steps = [{ minX: sx - 1.9, maxX: sx + 1.9, minZ: porch.minZ - 0.85, maxZ: porch.minZ - 0.42, y: 0.51 }, { minX: sx - 1.9, maxX: sx + 1.9, minZ: porch.minZ - 0.42, maxZ: porch.minZ, y: 0.58 }];
  const door = { x0: sx - 0.55, x1: sx + 0.55, z: minZ, y0: fy, y1: fy + 2.2 };
  door.x = sx;
  const mailbox = { x: sx + 0.88, y: fy + 1.42, z: minZ - 0.135, w: 0.3, h: 0.34 };   // his own little mailbox on the wall by the door
  const win = [{ a0: minX + 0.65, a1: sx - 1.2 }, { a0: sx + 1.2, a1: maxX - 0.65 }].map(o => ({ ...o, y0: fy + 0.72, y1: fy + 2.5 }));
  const display = { z0: iMinZ, z1: iMinZ + 0.72, y: fy + 0.5 }; // the window displays' boxes behind the glass (their backs to the shop)
  const upper = [-2.7, 2.7].map(k => ({ a0: sx + k - 0.75, a1: sx + k + 0.75, y0: fy + 3.35, y1: fy + 4.45 })); // high in the front wall, over the awning
  // inside, the shop floor: the counter in the front east corner (Kevin's stool behind it), the east wall's shelves, the
  // pegboard over a workbench on the west wall, the paint wall on the partition, the spring table in the middle
  const counter = { minX: iMaxX - 2.35, maxX: iMaxX - 1.65, minZ: iMinZ + 1.2, maxZ: iMinZ + 3.2, top: fy + 0.98 };
  // (crib-register) the brass register on the counter's south end, nearer Kevin's edge: its keys, crank and drawer face him (+x), its
  // pop-up amount tabs the customer (-x). x, z its middle on the counter top; w along z (the crank on its -z side, his right), d along x
  const register = { x: counter.maxX - 0.24, z: counter.maxZ - 0.33, w: 0.44, d: 0.4 };
  const stool = { x: iMaxX - 0.8, z: (counter.minZ + counter.maxZ) / 2, yaw: -Math.PI / 2, seatY: 0.72, rung: 0.42, rungR: 0.2 }; // (seat-height: his feet on the foot rest `rung` up (its ring `rungR` round, a board in front): kevin-day.js stands him on it)
  // (crib-clutter) the roll-up garage door in the east wall at the back of the shop floor, onto the lot side: z0..z1 its opening,
  // y1 its head (it stays down; Kevin's motorcycle is parked in the corner inside it). The east wall's shelves stop short of it
  const rollup = { z0: zP - 2.95, z1: zP - 0.45, y0: fy, y1: fy + 2.25 };
  // (crib-move) Kevin's motorcycle in the corner inside it (crib-clutter.js builds it here; tool-crib.js moves it): its middle, nose
  // toward the door (its own frame's x is +x here), leaning on its kickstand (the plan's -z side, where his helmet hangs)
  const moto = { x: iMaxX - 1.6, z: rollup.z1 - 0.25, lean: -0.12, heading: Math.PI / 2 };
  const shelf = { x0: iMaxX - 0.55, x1: iMaxX, z0: iMinZ + 3.9, z1: rollup.z0 - 0.3, h: 2.35 };   // east wall
  const peg = { x0: iMinX, x1: iMinX + 0.6, z0: iMinZ + 1.05, z1: stair.z0 - 1.35, y0: fy + 1.0, y1: fy + 2.7 }; // the bench under it is 0.6 deep
  const paint = { x0: stair.maxX + 0.45, x1: iMaxX - 2.15, z0: zP - 0.36, z1: zP, h: 2.3 };   // shelves on the partition's shop face
  const stock = { x0: iMaxX - 1.75, x1: iMaxX - 0.75, y1: fy + 2.1 };                         // the stockroom's door (shut)
  const table = { x: sx - 1.5, z: iMinZ + 4.2, w: 1.6, d: 0.86, top: fy + 0.8 };              // the spring table
  // (crib-crossword) the cracker barrel by the west window: the week's crossword on its lid, the score card on the display's back
  const barrel = { x: sx - 2.6, z: iMinZ + 1.55, r: 0.3, top: fy + 0.75 };
  barrel.clip = { x: sx - 0.88, y: fy + 1.42, z: minZ - 0.02, w: 0.26, h: 0.34 };   // (Andrew: playable whenever) the same sheet on a clipboard by the door, under the porch lamp
  barrel.card = { x: barrel.x + 0.78, y: fy + 1.62, z: iMinZ + 0.72 + 0.05 + 0.004, w: 0.44, h: 0.34 };
  // the loft (over the back): the bed against the back wall, the wardrobe on the west wall, the armchair by the east window,
  // the little kitchen along the partition at the east end, the rod rack on the partition, a table for one
  const loft = { minX: iMinX, maxX: iMaxX, minZ: zL, maxZ: iMaxZ, y: LY };
  const bed = { minX: sx - 2.55, maxX: sx - 1.45, minZ: iMaxZ - 2.05, maxZ: iMaxZ };
  const wardrobe = { minX: iMinX, maxX: iMinX + 0.6, minZ: zL + 1.6, maxZ: zL + 2.8 };
  const eastWin = { a0: zL + 1.55, a1: zL + 2.75, y0: LY + 0.85, y1: LY + 2.0 };               // in the east wall (over the car lot)
  const backWin = { a0: sx + 0.7, a1: sx + 1.9, y0: LY + 0.9, y1: LY + 2.05 };                // in the back wall
  const chair = { x: iMaxX - 0.55, z: eastWin.a1 + 0.75, yaw: -Math.PI / 2 + 0.35 };
  const kitchen = { minX: iMaxX - 2.9, maxX: iMaxX, minZ: zL, maxZ: zL + 0.62 };
  const rack = { x0: stair.maxX + 1.2, x1: stair.maxX + 2.7, z: zL };
  const lunch = { x: iMaxX - 2.0, z: zL + 1.9 };                                              // the little table for one
  // Kevin's spots: [x, z, yaw] (yaw: the way he faces; forward = (sin yaw, cos yaw))
  const K = {
    stool: [stool.x, stool.z, stool.yaw],
    till: [stool.x - 0.15, register.z, -Math.PI / 2],                            // standing at the register (crib-register: square to it; nearer, his head was in its crest)
    cust: [counter.minX - 0.55, stool.z, Math.PI / 2],                           // a customer across the counter
    custShelf: [shelf.x0 - 0.75, shelf.z0 + 2.4, Math.PI / 2],
    custPeg: [peg.x1 + 0.75, (peg.z0 + peg.z1) / 2, -Math.PI / 2],
    custPaint: [(paint.x0 + paint.x1) / 2 + 0.6, paint.z0 - 0.75, 0],
    custTable: [table.x + 0.3, table.z - table.d / 2 - 0.55, 0],
    shelfA: [shelf.x0 - 0.5, shelf.z0 + 0.9, Math.PI / 2], shelfB: [shelf.x0 - 0.5, shelf.z0 + 1.9, Math.PI / 2], shelfC: [shelf.x0 - 0.5, shelf.z1 - 0.5, Math.PI / 2],
    springs: [table.x - 0.2, table.z + table.d / 2 + 0.45, Math.PI],
    peg: [peg.x1 + 0.42, peg.z0 + 1.6, -Math.PI / 2], peg2: [peg.x1 + 0.42, peg.z1 - 0.8, -Math.PI / 2],
    paint: [paint.x0 + 1.4, paint.z0 - 0.48, 0],
    sign: [sx + 0.25, iMinZ + 0.55, Math.PI],
    sweep: [sx + 0.3, iMinZ + 1.75, 0.6],                                        // the broom, by the door                                    // inside the door, turning the card
    moto: [moto.x, moto.z - 0.95, 0],                                            // beside his motorcycle, on its kickstand side (the Sunday ride: crib-move)
    // the loft
    wardrobe: [wardrobe.maxX + 0.45, (wardrobe.minZ + wardrobe.maxZ) / 2, -Math.PI / 2],
    kettle: [kitchen.minX + 1.1, kitchen.maxZ + 0.42, Math.PI],
    window: [iMaxX - 0.5, (eastWin.a0 + eastWin.a1) / 2, Math.PI / 2],
    rack: [(rack.x0 + rack.x1) / 2, zL + 0.6, Math.PI],
    bed: [(bed.minX + bed.maxX) / 2, bed.minZ + 0.9, 0],
  };
  // the walk inside: the door, a hub between the spring table and the counter, the back of the shop, the stair's foot and top
  const W = {
    out: [sx, porch.minZ + 0.5], porch: [sx, minZ - 0.7], in: [sx, iMinZ + 0.55],
    hub: [sx + 0.7, iMinZ + 3.1], back: [sx + 0.7, zP - 1.05], behind: [counter.maxX + 0.75, counter.maxZ + 0.55],
    west: [peg.x1 + 0.55, iMinZ + 3.0], foot: [stair.x, stair.z0 - 0.45], top: [stair.x, zP], landing: [stair.x, zL + 0.55], loftMid: [sx - 1.0, zL + 1.4],
  };
  // the frame (see the top): the plan turned to face the way TOOL_CRIB.door says
  const flip = TOOL_CRIB.door === 'south', front = flip ? 1 : -1;
  const wp = (x, z) => (flip ? [2 * sx - x, 2 * sz - z] : [x, z]);
  const wbox = b => { const [x0, z0] = wp(b.minX, b.minZ), [x1, z1] = wp(b.maxX, b.maxZ); return { ...b, minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) }; };
  const walkZ = flip ? -132.5 : -120.5;                     // Summit Rd's sidewalk in front of the crib (the north one, facing south)
  const world = { minX, maxX, minZ, maxZ, doorZ: flip ? maxZ : minZ, door: { x: sx, z: flip ? maxZ : minZ, y0: door.y0, y1: door.y1 }, porch: wbox(porch), steps: steps.map(wbox), loft: wbox(loft), walkZ, street: [sx, walkZ] };
  return { mailbox, sx, sz, w, d, gy, fy, H, T, PT, top, minX, maxX, minZ, maxZ, iMinX, iMaxX, iMinZ, iMaxZ, zL, zP, LY, stair, porch, steps, door, win, display, upper,
    rollup, moto, counter, register, stool, shelf, peg, paint, stock, table, barrel, loft, bed, wardrobe, eastWin, backWin, chair, kitchen, rack, lunch, K, W, flip, front, world };
})();
// the plan's frame to the world and back (an involution), a yaw, a box { minX, maxX, minZ, maxZ, ...rest }, a point [x, y, z], a
// clutter box [x0, y0, z0, x1, y1, z1], and a collider (circle or box) changed IN PLACE
export const toWorld = (x, z) => (CRIB.flip ? [2 * CRIB.sx - x, 2 * CRIB.sz - z] : [x, z]);
export const toLocal = toWorld;
export const worldYaw = yaw => (CRIB.flip ? yaw + Math.PI : yaw);
export function worldBox(b) { if (!CRIB.flip) return b; const [x0, z0] = toWorld(b.minX, b.minZ), [x1, z1] = toWorld(b.maxX, b.maxZ); return { ...b, minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) }; }
export const worldPt = p => { const [x, z] = toWorld(p[0], p[2]); return [x, p[1], z]; };
export function worldBox6(b) { if (!CRIB.flip) return b; const [x0, z0] = toWorld(b[0], b[2]), [x1, z1] = toWorld(b[3], b[5]); return [Math.min(x0, x1), b[1], Math.min(z0, z1), Math.max(x0, x1), b[4], Math.max(z0, z1)]; }
export function worldCollider(c) {
  if (!CRIB.flip) return c;
  if (c.type === 'circle') { const [x, z] = toWorld(c.x, c.z); c.x = x; c.z = z; return c; }
  const w = worldBox(c); c.minX = w.minX; c.maxX = w.maxX; c.minZ = w.minZ; c.maxZ = w.maxZ; return c;
}

// The floor under world (x, z) inside the building or on its porch (the stair as a smooth ramp through each tread's middle, so
// feet meet the treads), or null outside it. Loft: anywhere past the partition (the plan's south).
export function cribFloorY(wx, wz) {
  const C = CRIB, S = C.stair, [x, z] = toLocal(wx, wz);
  if (x >= C.minX && x <= C.maxX && z >= C.porch.minZ && z < C.minZ) return C.fy;
  if (x < C.minX || x > C.maxX || z < C.minZ || z > C.maxZ) {
    for (const s of C.steps) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s.y;
    return null;
  }
  if (z >= C.zP && x <= S.maxX + 0.05 || z >= C.zL) return C.LY;
  if (x >= S.minX - 0.02 && x <= S.maxX + 0.02 && z > S.z0) return Math.min(C.LY, C.fy + S.rise * (0.5 + (z - S.z0) / S.tread));
  return C.fy;
}

// ---- the hours: Monday to Friday, 8 am to 5 pm, and Saturday, 7 to 11 am, Eastern (closed on Sunday)
export const CRIB_HOURS = [8, 17];
export const SAT_HOURS = [7, 11];
const weekdayOf = ms => (((easternDay(ms) + 4) % 7) + 7) % 7; // getDay() numbering (0 = Sunday)
export const cribWeekday = t => weekdayOf(t * 1000);          // t: shared seconds
export const isWorkday = t => { const w = cribWeekday(t); return w >= 1 && w <= 5; };
export const isSaturday = t => cribWeekday(t) === 6;
// the day's open hours [from, to] (hours Eastern), null on Sunday
export const cribHours = t => (isWorkday(t) ? CRIB_HOURS : isSaturday(t) ? SAT_HOURS : null);
export const cribOpen = (t, hour) => { const h = cribHours(t); return !!h && hour >= h[0] && hour < h[1]; };
export const HOURS_TEXT = 'Open Monday to Friday 8 to 5, Saturday 7 to 11';

// ---- the customers: now and then a neighbour drops in (pure: the shared clock). A visit in each quarter hour of the open day
// by chance: in through the door to the counter, a word with Kevin, a look round a shelf, back to the counter to pay, out.
// u0 = seconds after opening (8 am, 7 am on Saturday) the visit starts (at the door); every time below is from u0. Kevin is at the counter for `chat`
// and `pay` (kevin-day.js plans round them).
const VISIT_SLOT = 900;
export const BROWSE = ['custShelf', 'custPeg', 'custPaint', 'custTable'];
export const ASKS = [
  ['Morning, Kevin. Got any wood screws?', 'Blue bins. Help yourself.'],
  ['My gate squeaks something awful.', 'Oil can. By the till.'],
  ['Need a hinge like this one.', 'Hinge box. Dig in.'],
  ['What colour for a front door?', 'Red. Says come in.'],
  ['Got a spring about so big?', 'Spring box. Go on.'],
  ['Just browsing, Kevin.', 'Browse away.'],
  ['Any picture hooks?', 'Pegboard. Top left.'],
  ['Lovely day for fishing.', "Five o'clock. Pier."],
];
// (Kevin is a man of few words: his half of each exchange is short)
export const THANKS = [['That will do me, thanks!', 'Come again.'], ['How much do I owe you?', 'Call it a dollar.'], ['Thanks, Kevin.', 'Mind how you go.']];
const visitCache = new Map();
// the visits of the open day that starts at shared second t8 (8 am Eastern on a weekday, 7 am on Saturday); [] on Sunday
export function cribVisits(t8) {
  const key = Math.round(t8);
  let v = visitCache.get(key);
  if (v) return v;
  v = [];
  const hrs = cribHours(t8 + 1800);
  if (hrs) {
    const n = Math.floor((hrs[1] - hrs[0]) * 3600 / VISIT_SLOT);
    for (let i = 1; i < n - 1; i++) { // (none in the first quarter hour, while he settles in, nor the last, while he closes)
      if (hash01('crib-visit', key, i) > 0.5) continue;
      const u0 = i * VISIT_SLOT + Math.floor(hash01('crib-at', key, i) * 360);
      const walkIn = 9, chat = 70, browse = 100 + Math.floor(hash01('crib-browse', key, i) * 80), pay = 28;
      const a = { i, u0, spot: BROWSE[Math.floor(hash01('crib-spot', key, i) * BROWSE.length)], ask: Math.floor(hash01('crib-ask', key, i) * ASKS.length), thanks: Math.floor(hash01('crib-thx', key, i) * THANKS.length) };
      a.chat0 = walkIn; a.chat1 = a.chat0 + chat; a.browse0 = a.chat1 + 7; a.browse1 = a.browse0 + browse; a.pay0 = a.browse1 + 7; a.pay1 = a.pay0 + pay; a.out = a.pay1 + 9;
      v.push(a);
    }
  }
  visitCache.set(key, v);
  if (visitCache.size > 4) visitCache.delete(visitCache.keys().next().value);
  return v;
}
