// The mail van's day. A pure function of the shared clock like Pat's rounds (mailman.js), so every visitor sees it in the same place:
//   night   parked in its bay beside the post office (layout.js MAIL_OFFICE.bay), nose to Summit Rd
//   9 am    Pat walks out and gets in. It pulls out across Summit Rd, down Breneland Rd (southbound lane), round the bend by the
//           park and into its lay-by (layout.js VAN_STOP), off the road, where it waits while he walks
//   5 pm    once he's back in it after his last round: out of the lay-by, east along Breneland Rd, up Maple Ave, west along Summit
//           Rd past the office, a stop, and it backs into the bay. He walks into the office
// vanAt(street, t) -> { x, z, yaw, v, moving, rev, phase, roll }. street is mailman.js's Street (its Pat slots say when he works,
// when he set out and when he got back in). The drives use buddy-day.js's lane maths (right-hand traffic, rounded corners).
import { MAIL_OFFICE, ROADS, LANE_OFFSET, VAN_STOP } from './layout.js';
import { offsetRight, roundCorners, drive, driveAt, dense } from './buddy-day.js';

export const VAN = { x: VAN_STOP.spot.x, z: VAN_STOP.spot.z, halfW: 1.05 };   // its spot in the lay-by, facing east (Pat's rounds start here)
// where Pat gets in and out there: the kerb side, by the cab, on the sidewalk behind the lay-by
export const VAN_DOOR = [VAN.x + 1.5, VAN.z + 1.95];
const B = MAIL_OFFICE.bay, R_BACK = 5.5;
// where Pat gets in and out at the bay (the driver's door: the van faces south, so its left side is the office's side)
export const BAY_DOOR = [B.x + 1.45, B.z + 1.5];
// his walk between the office's front step and that door, round the building's front corner
export const OFFICE_WALK = [[MAIL_OFFICE.door.x - 4.1, MAIL_OFFICE.door.z + 0.5], [B.x + 2.3, MAIL_OFFICE.door.z + 0.3], BAY_DOOR];

let DRIVES = null;
// The three drives: out (the bay to the lay-by), home (the lay-by to the stop on Summit Rd past the bay), back (reversing into the bay)
export function vanDrives() {
  if (DRIVES) return DRIVES;
  const SZ = -126.5, BZ = -48.5, laneE = SZ + LANE_OFFSET, laneW = SZ - LANE_OFFSET;
  const bren = ROADS.find(r => r.id === 'breneland-rd').pts.slice().reverse();   // from Summit Rd down into the bend and east
  const L = VAN_STOP.bay, inX = L[0][0] + 0.6;   // (it leaves the lane where the lay-by's taper starts)
  const downC = [[bren[0][0], laneE], ...bren.slice(1).filter(p => p[0] < inX), [inX, BZ]];
  const down = offsetRight(downC, LANE_OFFSET);
  // out of the bay nose first, across the westbound lane into the eastbound one, down Breneland Rd's southbound lane, round the
  // bend and in along the lay-by's taper to its spot
  const out = drive(dense(roundCorners([[B.x, B.z], [B.x, laneE], ...down, [L[1][0] + 0.3, VAN.z], [VAN.x, VAN.z]], 5.5), 2));
  // home the long way round the block (right-hand traffic, no U-turn): out of the lay-by, east, up Maple Ave, west along Summit Rd
  // to just past the bay
  const stopX = B.x - R_BACK;
  const homeC = [[L[3][0] + 0.5, BZ], [-20, BZ], [-20, SZ], [stopX, SZ]];
  const home = drive(dense(roundCorners([[VAN.x, VAN.z], [VAN.x + 2, VAN.z], ...offsetRight(homeC, LANE_OFFSET)], 5.5), 2));
  // and back into the bay: an arc from the westbound lane round into the driveway, then straight back to its spot
  const arcPts = [];
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI / 2; arcPts.push([stopX + R_BACK * Math.sin(a), laneW - R_BACK + R_BACK * Math.cos(a)]); }
  const back = drive(dense([...arcPts, [B.x, B.z]], 1), { rev: true });
  DRIVES = { out, home, back, stopX };
  return DRIVES;
}

const S = { x: B.x, z: B.z, yaw: B.yaw, v: 0, moving: false, rev: false, phase: 'bay', roll: 0 };
function set(x, z, yaw, v, moving, rev, phase, roll) {
  S.x = x; S.z = z; S.yaw = yaw; S.v = v; S.moving = moving; S.rev = rev; S.phase = phase; S.roll = roll;
  return S;
}
// roll: how far the wheels have turned, in metres, continuous through the day (the bay's value is where the evening leaves it)
function onDrive(D, u, phase, sign, base) {
  const p = driveAt(D, u);
  return set(p.x, p.z, p.yaw, p.v, u > 0 && u < D.T, D.rev, phase, base + sign * p.s);
}
const parked = D => set(B.x, B.z, B.yaw, 0, false, false, 'bay', D.out.L + D.home.L - D.back.L);
// when it's home in the evening (the leave slot's v.vanDep plus the two drives)
export function homeAt(v) { const D = vanDrives(); return v.vanDep + D.home.T + D.back.T; }

// the van at shared time t (one object, reused: copy what you keep)
export function vanAt(street, t) {
  const D = vanDrives(), R0 = D.out.L + D.home.L - D.back.L;
  let v = street.slotAt('pat', t);
  if (!v.work) {
    // after hours: still driving home from the last round of the day?
    const p = street.slot('pat', v.s - 1);
    if (!p.work || p.vanDep == null || t >= homeAt(p)) return parked(D);
    v = p;
  }
  if (v.arrive && v.vanOut != null && t < v.vanOut + D.out.T) {
    if (t <= v.vanOut) return parked(D);
    return onDrive(D.out, t - v.vanOut, 'out', 1, R0);
  }
  if (v.leave && v.vanDep != null && t > v.vanDep) {
    const u = t - v.vanDep;
    if (u < D.home.T) return onDrive(D.home, u, 'home', 1, R0 + D.out.L);
    if (u < D.home.T + D.back.T) return onDrive(D.back, u - D.home.T, 'back', -1, R0 + D.out.L + D.home.L);
    return parked(D);
  }
  return set(VAN.x, VAN.z, VAN_STOP.spot.yaw, 0, false, false, 'curb', R0 + D.out.L);
}
