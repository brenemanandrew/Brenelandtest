// Every table in Breneland a board game can be set up on (table-games): its id, where it is, the top's height, the play area
// on it, its chairs (where a sitter's feet and seat are, which way they face, the top for their hands), the group the pieces
// go in (a building's inside hides with it), and whether it is free now. Read from the features that built them, so a table
// that moves takes its game with it. setOut(on), where there is one: a game is put down there (on) or put away (the picnic
// tables clear their food off the top, so the pieces have room to be a readable size).
//   the game store's four gaming tables (the demo table not on a Bookwyrm playtest day), the D&D back room's table (while no
//   adventure runs and nobody sits at it), the five picnic tables on the Picnic Lawn (the pie contest's long table is the
//   contest's), Breneland's own dining table (six chairs) and the little table on the back deck, the Lovecraft house's parlour
//   table (not on an Arkham day), and (crib-move) Summit Square's two picnic tables under its shelter, `square:t0` and `square:t1`.
//   Not the yard's game tables (each is its game's own), not Kevin's coffee table (no chairs).
import { HOUSE, DECK } from '../layout.js';
import { terrainHeight } from '../terrain.js';

// how far from the middle to the edge of a top along a direction (atan2 convention, world), for a round or a turned rectangle
const roundEdge = r => () => r;
const rectEdge = (hw, hd, yaw) => a => { const dx = Math.sin(a), dz = Math.cos(a), du = dx * Math.cos(yaw) - dz * Math.sin(yaw), dw = dx * Math.sin(yaw) + dz * Math.cos(yaw); return Math.min(hw / Math.max(1e-6, Math.abs(du)), hd / Math.max(1e-6, Math.abs(dw))); };
const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

export function collectTables(ctx) {
  const F = n => ctx.features?.find(f => f.name === n);
  const out = [];
  const store = F('store');
  if (store?.plan) {
    const P = store.plan, inside = store.back?.door?.parent || ctx.scene, top = P.floorY + P.TOP; // (seat-height: the tables came down with the chairs)
    for (const t of P.tables) {
      const hands = { x: t.x, z: t.z, r: P.TR, y: top };
      const seats = store.seats.filter(s => s.table === t.id).map(s => ({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, seatY: s.seatY, hands, store: s }));
      out.push({ id: 'store:' + t.id, place: 'store', name: t.id === 'demo' ? 'the demo table' : 'a gaming table', x: t.x, z: t.z, top, R: P.TR - 0.22, edge: roundEdge(P.TR), seats, parent: inside, y0: P.floorY,
        free: () => !(t.id === 'demo' && store.playtest), busyWhy: 'Bookwyrm is on the demo table today.' });
    }
    const B = store.back;
    if (B?.plan?.table) {
      const T = B.plan.table, hands = { y: T.top, minX: T.x - T.w / 2, maxX: T.x + T.w / 2, minZ: T.z - T.d / 2, maxZ: T.z + T.d / 2 };
      const seats = (B.seats || []).filter(s => s.dnd !== undefined && !s.dm).sort((a, b) => a.dnd - b.dnd).map(s => ({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, seatY: s.seatY, hands, store: s }));
      out.push({ id: 'store:backroom', place: 'backroom', name: 'the back room table', x: T.x, z: T.z, top: T.top, R: Math.min(T.d / 2, 0.62) - 0.08, edge: rectEdge(T.w / 2, T.d / 2, 0), seats, parent: inside, y0: P.floorY,
        free: () => { const s = F('dnd')?.state; return !s || (!s.started && !(s.seats || []).some(Boolean)); }, busyWhy: 'A D&D adventure is on at that table.' });
    }
  }
  const picnic = F('picnic')?.api;
  if (picnic?.tables) for (const t of picnic.tables) {
    const tp = t.top, seats = t.seats.map(s => { const g = terrainHeight(s.x, s.z); return { x: s.x, y: g, z: s.z, yaw: s.yaw, seatY: Math.max(0.16, s.y - g), hands: s.table, picnic: s }; });
    out.push({ id: 'picnic:' + t.id, place: 'picnic', name: 'a picnic table', x: tp.x, z: tp.z, top: tp.y, R: 0.4, edge: rectEdge(tp.hw, tp.hd, tp.yaw), seats, parent: ctx.scene, y0: terrainHeight(tp.x, tp.z), free: () => true,
      setOut: on => t.clearProps?.(on), propsOn: () => t.propsOn !== false }); // (R: the whole width of the top, the food cleared off it)
  }
  // Summit Square's two shelter tables (summit-square.js, crib-move): the picnic table again, on the square's pavers
  const square = F('square')?.api;
  if (square?.tables) for (const t of square.tables) {
    const tp = t.top, seats = t.seats.map(s => ({ x: s.x, y: t.floor, z: s.z, yaw: s.yaw, seatY: s.y - t.floor, hands: s.table, square: s }));
    out.push({ id: 'square:' + t.id, place: 'square', name: 'a table in Summit Square', x: tp.x, z: tp.z, top: tp.y, R: 0.4, edge: rectEdge(tp.hw, tp.hd, tp.yaw), seats, parent: ctx.scene, y0: t.floor, free: () => true });
  }
  if (ctx.house?.inside?.group) {
    const Fy = HOUSE.floorY, tx = -6.6, tz = 3.5, top = Fy + 0.63, hands = { y: top, minX: tx - 0.95, maxX: tx + 0.95, minZ: tz - 0.5, maxZ: tz + 0.5 };
    const spots = [[tx - 0.5, tz - 0.78], [tx + 0.5, tz - 0.78], [tx + 1.25, tz], [tx + 0.5, tz + 0.78], [tx - 0.5, tz + 0.78], [tx - 1.25, tz]]; // round the table (house-rooms.js: the dining room)
    out.push({ id: 'house:dining', place: 'house', name: 'the dining table', x: tx, z: tz, top, R: 0.4, edge: rectEdge(0.95, 0.5, 0), parent: ctx.house.inside.group, y0: Fy, free: () => true,
      seats: spots.map(([x, z]) => ({ x, y: Fy, z, yaw: facing(x, z, tx, tz), seatY: 0.3, hands })) }); // (house-rooms.js: the chairs 0.3, the table 0.63; seat-height)
    const D = DECK, dx = -4.6, dz = 7.35, dtop = D.y + 0.56, dh = { x: dx, z: dz, r: 0.45, y: dtop };
    out.push({ id: 'house:deck', place: 'deck', name: 'the deck table', x: dx, z: dz, top: dtop, R: 0.33, edge: roundEdge(0.45), parent: ctx.scene, y0: D.y, free: () => true,
      seats: [[-5.45, 7.35], [-3.75, 7.35]].map(([x, z]) => ({ x, y: D.y, z, yaw: facing(x, z, dx, dz), seatY: 0.3, hands: dh })) }); // (house.js: the deck's chairs 0.3, its table 0.56; seat-height)
  }
  const lc = F('lovecraft');
  if (lc?.built?.chairs && lc.plan?.TABLE) {
    const T = lc.plan.TABLE, hands = { x: T.x, z: T.z, r: T.r, y: T.y };
    out.push({ id: 'lovecraft:parlour', place: 'lovecraft', name: 'the parlour table', x: T.x, z: T.z, top: T.y, R: T.r - 0.2, edge: roundEdge(T.r), parent: lc.built.inside || ctx.scene, y0: lc.plan.FY,
      seats: lc.built.chairs.map(c => ({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, seatY: c.seatY, fold: c.fold, hands })),
      free: () => !lc.built.gameOn?.visible, busyWhy: 'Arkham Horror is on in the parlour today.', hideWhileOn: () => lc.built.gameOff });
  }
  return out;
}
