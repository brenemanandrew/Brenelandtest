// The Angell Street door's leaf and its reach: the numbers maze-door.js stands them by, shared with tools/lovecraft-review-reach-sweep.mjs
// (Node reads this through harness.mjs's clientModule, so: pure, no imports). Everything is relative to the door: x east of the door's
// middle (dx), y up from the hall's floor (y0), z out of the wall into the hall (wallZ).
export const LEAF_W = 0.99, LEAF_H = 2.37, LEAF_Z = 0.108; // our leaf: just inside the frame's posts, a little proud of the merged door; hinged on the west post, the latch east
// the creature's base: behind the wall plane at the gap's side (east, by the latch), chest high, aimed out and east so it comes round
// the leaf's latch edge, not through the leaf (lovecraft-review: it stood at 0.25 aimed 0.2 and the forearm went through the leaf)
export const REACH_AT = { x: 0.33, y: 1.15, z: -0.02, yaw: 0.5 };
export const REACH_SLOT = 16000; // ms of the shared clock between chances of a reach (maze-door.js)
const smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
// the leaf while something reaches: pushed ajar ahead of the creature, held, shut behind it (u = the clip's 0..1; radians on the west post)
// (the creature holds behind the door for the first tenth and the last twelfth of its clip: build_reach.py phase_k)
export const REACH_LEAF = { max: 0.55, shape: u => (u < 0.1 ? smooth(u / 0.1) : u < 0.92 ? 1 : 1 - smooth((u - 0.92) / 0.08)) };
