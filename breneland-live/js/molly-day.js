// Molly's day: where Joyce's older dog would be at shared time t if nothing else happened. A pure function of the shared clock
// (the NPC rule: every visitor sees the same Molly), read from Joyce's day in joyce-day.js:
//   joyceAt(ms) -> { x, z, yaw, mode: 'home' | 'walk' | 'cart' | 'garden', cart: { x, z, yaw, v, rev, moving }, seat: { x, z, yaw, y } |
//   null (the passenger seat while she's in the cart; y = the cushion's top in world metres), hidden (indoors), phase, ... }
// Molly heels beside Joyce on foot, rides the cart's passenger seat (goggles on), lies by Joyce's chair in the oak's shade or sits
// by her in the garden, and stays at Joyce's house when she's home (beside her in her rooms, in her own bed in the sun room while
// Joyce sleeps, napping afternoons and nights). The shared simulation (molly-brain.js, inside dogs-brain.js) moves her off this plan for visitors, toys and walks.
import { hash01 } from './util.js';
import { hourAt, inHours } from './npcs-day.js';
import { joyceAt, homeOf, gardenSpots } from './joyce-day.js';
import { groundHeight } from './terrain.js';
import { MOLLY_BED } from './joyce-house-plan.js';
export { joyceAt };

const L = 16;                       // seconds per beat (npcs.js)
export const SEAT_Y = 0.62;          // the seat's height above the ground when joyceAt gives none
export const MOLLY_NAP = [[13, 17], [21, 6]];   // the hours Molly naps at Joyce's house (an older dog: afternoons and nights)

// Where Joyce's garden and house are (molly-brain.js keeps Molly's spots there clear of the beds and chairs)
export function joyceSpots() {
  const S = gardenSpots(), H = homeOf();
  return { garden: S ? S.joyce : { x: 0, z: 0 }, home: { x: H.x, z: H.front } };
}

// ------------------------------------------------------------------ Molly's plan
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// The plan at t (seconds): { x, z, yaw, speed, anim, nap?, ride?, seatH? (the seat's height above the ground while riding), mode,
// jx, jz (Joyce) }, the shape npcs.js stateOf gives.
export function mollyPlan(t) {
  const J = joyceAt(t * 1000), J2 = joyceAt((t + 0.5) * 1000);
  const jv = J2.mode === J.mode ? near(J, J2) / 0.5 : 0;   // how fast Joyce is going (0 when her mode changes this instant)
  const base = { mode: J.mode, jx: J.x, jz: J.z };
  if (J.mode === 'cart' && J.seat) {
    const S2 = J2.seat || J.seat, sv = near(J.seat, S2) / 0.5;
    const seatH = Number.isFinite(J.seat.y) ? J.seat.y - groundHeight(J.seat.x, J.seat.z) : SEAT_Y;
    // a hand's width out from the cushion's middle, away from Joyce, so her arm on the wheel clears Molly's chest
    const ox = J.seat.x - J.x, oz = J.seat.z - J.z, ol = Math.hypot(ox, oz) || 1, x = J.seat.x + ox / ol * 0.12, z = J.seat.z + oz / ol * 0.12;
    return { ...base, x, z, yaw: J.seat.yaw, speed: sv, anim: 'sit', ride: true, seatH };
  }
  const fx = Math.sin(J.yaw), fz = Math.cos(J.yaw), rx = Math.cos(J.yaw), rz = -Math.sin(J.yaw);
  const heel = () => {   // just behind Joyce on her right
    const hx = J.x - fx * 0.85 + rx * 0.75, hz = J.z - fz * 0.85 + rz * 0.75;
    const H2x = J2.x - Math.sin(J2.yaw) * 0.85 + Math.cos(J2.yaw) * 0.75, H2z = J2.z - Math.cos(J2.yaw) * 0.85 - Math.sin(J2.yaw) * 0.75;
    const v = J2.mode === J.mode ? Math.hypot(H2x - hx, H2z - hz) / 0.5 : 0;
    return { ...base, x: hx, z: hz, yaw: v > 0.2 ? Math.atan2(H2x - hx, H2z - hz) : J.yaw, speed: v > 0.2 ? v : 0, anim: v > 0.2 ? null : 'sit' };
  };
  if (J.mode === 'walk') return heel();
  const k = Math.floor(t / L);
  if (J.mode === 'garden') {
    if (J.phase !== 'garden') return heel();   // from the cart to her spot and back
    const S = gardenSpots(), w = Math.floor(k / 4);
    if (S && S.chair && hash01('molly-chair', w) < 0.55) {   // lying by Joyce's chair in the oak's shade (the garden's 'chair' spot)
      const cy = S.chair.yaw || 0, x = S.chair.x + Math.cos(cy) * 0.95 + Math.sin(cy) * 0.3, z = S.chair.z - Math.sin(cy) * 0.95 + Math.cos(cy) * 0.3;
      const r = hash01('molly-gc', k);
      return { ...base, x, z, yaw: cy + 0.4, speed: 0, anim: r < 0.6 ? 'lie' : r < 0.85 ? 'rest' : 'sit' };
    }
    // by her side, a little in front: sits, lies, sniffs about
    const side = hash01('molly-gs', Math.floor(k / 6)) < 0.5 ? -1 : 1;
    const x = J.x + rx * side * 1.05 + fx * 0.35, z = J.z + rz * side * 1.05 + fz * 0.35;
    const r = hash01('molly-ga', k), anim = jv > 0.3 ? null : r < 0.45 ? 'lie' : r < 0.75 ? 'sit' : r < 0.9 ? 'rest' : 'sniff';
    return { ...base, x, z, yaw: Math.atan2(J.x - x, J.z - z) + side * 0.9, speed: jv, anim };
  }
  // home (joyce-house: she is seen inside): beside Joyce in whichever room she is (each of Joyce's spots says where Molly lies,
  // joyce-house-plan.js ROOM_SPOTS), by her chair at the firepit, at heel while she walks about, by her out front at her flower bed;
  // in her own bed in the sun room while Joyce is in bed; dozing a lot
  const h = hourAt(t), nap = MOLLY_NAP.some(([a, b]) => inHours(h, a, b));
  const r = hash01('molly-ha', k);
  const anim = nap ? (r < 0.6 ? 'sleep' : 'loaf') : r < 0.55 ? 'lie' : r < 0.85 ? 'sit' : 'rest';
  if (J.hidden || J.mode !== 'home') {
    const B = MOLLY_BED;   // her bed in the sun room (seen through its glass from the back yard)
    return { ...base, x: B.x, z: B.z, yaw: B.yaw, speed: 0, anim: nap || J.hidden ? (r < 0.75 ? 'sleep' : 'loaf') : 'loaf', nap: nap || J.hidden, stay: true, bed: true };
  }
  if (jv > 0.3) return heel();
  if (J.mollySpot) { const m = J.mollySpot; return { ...base, x: m.x, z: m.z, yaw: m.yaw, speed: 0, anim: nap ? anim : m.anim || anim, nap, stay: true, bed: !!m.bed }; }
  const x = J.x + fx * 0.9 + rx * 0.6, z = J.z + fz * 0.9 + rz * 0.6;
  return { ...base, x, z, yaw: J.yaw + 0.5, speed: 0, anim, nap, stay: true };
}
