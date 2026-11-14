// The Lovecraft house's plan: the numbers lovecraft-build.js builds the house to and the code keeps (rooms, doors, the stairs, the
// table and its chairs, the wing chair, the fires, the real windows, the colours). Pure (layout.js only), so tools/lovecraft-plan-dump.mjs
// can import it in Node and write assets/blender/lovecraft-plan.json for the Blender set piece (assets/blender/scripts/build_lovecraft.py):
// the model is built to these same numbers, so every collider, surface, seat and spot lines up with what you see (lovecraft-setpiece).
import { LOVECRAFT_HOUSE as L } from './layout.js';

export const HX = L.x, HZ = L.z;
export const TY = 0.94, FY = 1.66, H1 = 3.4, UY = FY + H1, EAVE = FY + 2 * H1; // the terrace, the two floors, the eaves
export const HW = L.w / 2, HD = L.d / 2, WT = 0.25, IU = HW - WT, IV = HD - WT;      // outer and inner half sizes
export const BV = -0.6, PU = 1.5;                                 // the wall between the front and back halves (v), the hall's west wall (u)
export const ST = { u0: 4.0, u1: IU, v0: 4.9, rise: 0.2, tread: 0.29, n: 16 }; // 16 treads north up the east wall; the 17th riser is the top
ST.vTop = ST.v0 - ST.n * ST.tread;
export const DOOR = { u: 3.5, w: 1.3, h: 2.55 };
export const PORCH = { u0: 1.6, u1: 5.4, v1: HD + 2.2 };
export const BAY = { v0: 0.6, v1: 4.2, out: 1.0 };
export const TABLE = { u: -2.2, v: 3.1, r: 0.85 };
export const TT = FY + 0.64; // the table's top (a low table for the low chairs)
// The study's wing chair, in its own frame (x to its right, z forward, y up from the floor): a deep seat, a tall back, padded arms. The
// Professor sits in it (seatY on the cushion, his back to the back, forearms on the arms: bodies-poses.js params.chair); every part
// of him is tested against these boxes (tools/w3-lovecraft-test.mjs).
export const CHAIR_SEAT = 0.34, CHAIR_SIT = 0.03; // (seat-height: the cushion's top is the sitters' seatY, 0.34: it was 0.31, they sat 3 cm over it) // the parlour chairs' cushion top, and how far forward of the middle a sitter's hips are
export const CHAIR_DIST = 1.14; // the chairs' middles from the table's: the folk's short arms reach the top from here, the knees under its edge
export const WING = (() => {
  const S = 0.34; // the cushion's top
  return {
    seatY: S, sitZ: 0.125, chair: { armX: 0.46, elbowDrop: 0.2 },
    boxes: [
      { x: 0, y: S / 2, z: -0.06, sx: 0.92, sy: S - 0.08, sz: 0.5, c: '#5e1a28' },                  // the seat, shallow and low (the folk's legs are short)
      { x: 0, y: S - 0.02, z: -0.05, sx: 0.8, sy: 0.04, sz: 0.46, c: '#7a2a3a' },                    // the cushion
      { x: 0, y: (S - 0.04 + 1.6) / 2, z: -0.37, sx: 0.92, sy: 1.64 - S, sz: 0.12, c: '#6e2232' }, // the back
      { x: -0.46, y: S + 0.14, z: -0.06, sx: 0.12, sy: 0.3, sz: 0.5, c: '#5e1a28' },                // the arms (inner faces 0.4 out)
      { x: 0.46, y: S + 0.14, z: -0.06, sx: 0.12, sy: 0.3, sz: 0.5, c: '#5e1a28' },
      { x: -0.47, y: 1.3, z: -0.27, sx: 0.08, sy: 0.6, sz: 0.24, c: '#6e2232' },                     // the wings at the top of the back
      { x: 0.47, y: 1.3, z: -0.27, sx: 0.08, sy: 0.6, sz: 0.24, c: '#6e2232' },
    ],
  };
})();
export const WING_AT = { u: -0.3, v: -1.9, yaw: -1.2 }; // (its yaw: toward the study's fire, as a person would set it; it was 0.75 pi, facing the partition wall)
export const SCOPE_AT = { u: -4.4, v: -3.4 }; // the telescope's tripod in the study
export const C = {
  wall: '#c3c7b1', line: '#a7ab95', trim: '#f1ead6', shutter: '#2f4a3a', roof: '#525669', roof2: '#43475a', roofTop: '#5e6277',
  stone: '#a29d92', stone2: '#8b867c', cap: '#c4bfb3', brick: '#8f4a3a', brickCap: '#6e3a2e', iron: '#26262d', door: '#5a3424',
  grass: '#79bd47', hedge: '#3f7d3c', hedge2: '#4c8c44', path: '#d2c8b4', wood: '#5a3826', woodDk: '#3b2418', woodLt: '#7a5236',
  cream: '#efe6cf', plaster: '#ece2cc', red: '#7a2232', brass: '#c9a24a', bark: '#5a4636', leaf: '#4f9a45', leaf2: '#3f8a3c',
};
// the windows of the rooms you can walk in are real (a hole through the wall, see-through glass): on a face's own `a`
// (S: u, N: -u, W: v, E: -v), sill y0 to head y1
export const G = FY + 0.62, U = UY + 0.6, GH = 2.15, UH = 1.95;
export const REAL = [
  ...[-4.0, -1.6, 0.9].map(a => ({ f: 'S', a, w: 1.0, y0: G, y1: G + GH })), // the parlour's three to the street
  { f: 'N', a: 2.2, w: 1.1, y0: U, y1: U + UH }, { f: 'N', a: -3.4, w: 1.0, y0: U, y1: U + UH }, // the study's and the landing's
  { f: 'W', a: -3.4, w: 1.0, y0: U, y1: U + UH },                                                // the study's west one (the telescope)
  { f: 'E', a: -5.4, w: 0.9, y0: G, y1: G + GH }, { f: 'E', a: 3.4, w: 1.0, y0: U, y1: U + UH }, // the hall's by the door, the landing's
];
// the other windows (old dark panes, shuttered): face, a, width, sill, height
export const WINDOWS = [
  ...[-4.0, -1.6, 0.9, 3.5].map(a => ({ f: 'S', a, w: 1.0, y0: U, h: UH })),
  ...[-3.6, 0.2, 3.4].map(u => ({ f: 'N', a: -u, w: 1.0, y0: G, h: GH })),
  { f: 'W', a: -3.4, w: 1.0, y0: G, h: GH }, { f: 'W', a: 5.4, w: 0.8, y0: U, h: UH },
  { f: 'E', a: 3.4, w: 1.0, y0: G, h: GH }, { f: 'E', a: -2.6, w: 1.0, y0: U, h: UH }, { f: 'E', a: -0.2, w: 0.7, y0: G + 1.3, h: 1.2, shut: false },
];
// the fireplaces (hearth-build.js specs, fires.js lights them): the parlour's at the north wall facing south, the study's back to back
export const HEARTHS = {
  parlour: { id: 'parlour', u: TABLE.u, y: FY + 0.06, v: BV + 0.1 + 0.55, nx: 0, nz: 1, w: 0.32, h: 0.79, d: 0.37 },
  study: { id: 'study', u: TABLE.u, y: UY + 0.04, v: BV - 0.1 - 0.5, nx: 0, nz: -1, w: 0.26, h: 0.68, d: 0.36 },
};
export const MANTEL_CANDLES = { y0: FY + 1.38, top: FY + 1.836, du: 0.65, v: BV + 0.1 + 0.5 }; // the brass candlesticks on the parlour's mantel (their flames are fires.js's)
export const MAZE_DOOR_U = 2.9; // the shut door down to Beneath Angell Street, in the wall between the halves (maze.js DOOR_U)

/** The whole plan as plain data for the Blender build (tools/lovecraft-plan-dump.mjs). World frame: x east, y up, z south. */
export function planData() {
  return {
    note: 'lovecraft-plan.js: the Lovecraft house in the world frame (x east, y up, z south), metres. Written by tools/lovecraft-plan-dump.mjs.',
    HX, HZ, TY, FY, H1, UY, EAVE, HW, HD, WT, IU, IV, BV, PU, ST, DOOR, PORCH, BAY, TABLE, TT, CHAIR_SEAT, CHAIR_SIT, CHAIR_DIST, WING, WING_AT, SCOPE_AT, C, G, U, GH, UH, REAL, WINDOWS, HEARTHS, MANTEL_CANDLES, MAZE_DOOR_U,
    lot: L.lot, gate: L.gate, uC: UY - 0.12, uTop: EAVE - 0.15, S0: EAVE + 0.46, SH: 2.55, INSET: 0.9,
  };
}
