// Our living room's main light (living-light, Andrew 2026-11-07): the ceiling fan's light is off from 10 pm to 7 am by the shared
// clock, for everyone. Then the fireplace is the only light in the room: lit (fire season 6 pm-2 am, or by hand with E) the room
// glows from it (fires.js's spot); out, the room is dark but for the moon through the windows (the night's own ambient).
// What it switches, each with a quick fade (no pop): the fan's night spot (house-inside.js: its `k` dims the lamp light main.js
// parks on it and its pool on the floor), the fan's bulb and the console lamp's shade (FAN_BULB: house-rooms.js gives them this
// material, apart from the shared lamp colour, so only they go out), intro.js's hallLight (LIVING.k), and the living room's
// windows seen from outside (LIVING_GLASS: lamp-yellow while the light is on, a warm flicker while only the fire burns).
// main-house.js calls updateLivingLight() every frame (and in the intro). Nothing is allocated per frame.
import * as THREE from 'three';
import { LIGHT, LAMPS, GLASS, GLASS_DAY, GLASS_EM_DAY, lampGlow } from './daynight-mats.js';
import { GRADIENT_3 } from './toon.js';

export const OFF_H = 22, ON_H = 7;   // the light is off from 10 pm until 7 am
const FADE = 1.2;                    // s: the fade at 10 pm and 7 am
const BULB = '#f6e3bd';              // the shared lamp colour the bulb wears while on (house-rooms.js lampGlow)
const OFF_BULB = new THREE.Color('#7a766e'); // a bulb that is off: a little grey glass, not glowing
const FIRE_WIN = new THREE.Color('#ff9c4a'), FIRE_EM = new THREE.Color('#e8621e');

// on by the clock at this hour (0..24, Eastern: daynight.js LIGHT.hour, the shared time)
export const livingOnAt = h => !(h >= OFF_H || h < ON_H);

// state the others read: k 0..1 (1 on), on (the target by the clock)
export const LIVING = { k: 1, on: true, fire: 0 };

// the fan's bulb and the console lamp's shade: their own material (MeshBasic like lampGlow's), on = the shared lamp's colour
export const FAN_BULB = new THREE.MeshBasicMaterial({ color: BULB, fog: true });
FAN_BULB.name = 'lamp-living-main';

// the living room's panes from outside (house.js gives them a see-through copy of this, as it does for the town's GLASS)
export const LIVING_GLASS = new THREE.MeshToonMaterial({ color: new THREE.Color(GLASS_DAY), gradientMap: GRADIENT_3, emissive: new THREE.Color(GLASS_EM_DAY), emissiveIntensity: 0.45 });
LIVING_GLASS.name = 'window-glass-living';

const offC = new THREE.Color();
let started = false;
// house: ctx.house (its lamps[0] is the fan's spot); flame: our fire's flame now (0..1); camInLiving: the camera is in the living room
export function updateLivingLight(dt, house, flame = 0, camInLiving = false) {
  const h = LIGHT.hour;
  LIVING.on = livingOnAt(h);
  const want = LIVING.on ? 1 : 0;
  if (!started) { started = true; LIVING.k = want; }  // the first frame takes the hour as it is (a page loaded at 3 am: no fade)
  else if (LIVING.k !== want) {
    const step = Math.min(1, (dt || 0) / FADE);
    LIVING.k = want > LIVING.k ? Math.min(want, LIVING.k + step) : Math.max(want, LIVING.k - step);
  }
  const k = LIVING.k, s = k * k * (3 - 2 * k);        // (eased: the fade starts and ends softly)
  LIVING.fire = flame;
  const spot = house?.lamps?.[0];
  if (spot) spot.k = Math.round(s * 100) / 100;       // (the pools re-upload only when this changes: during the fade)
  // the other rooms' lamps stay on (their bulbs and pools as ever), but with no walls in the light's way (no shadows indoors) their
  // lights would wash our dark living room cream through the partitions: while you look on from in it, theirs light only their rooms
  const lk = camInLiving ? Math.round(s * 100) / 100 : 1;
  const L = house?.lamps;
  if (L) for (let i = 1; i < L.length; i++) L[i].lightK = lk;
  // the bulb: the shared lamp's colour by the hour while on, grey glass while off (dimmer still in the dark)
  const lamp = LAMPS.get(BULB) || (lampGlow(BULB), LAMPS.get(BULB));
  offC.copy(OFF_BULB).multiplyScalar(1 - 0.7 * (LIGHT.night || 0));
  FAN_BULB.color.copy(offC).lerp(lamp.mat.color, s);
  // the windows from outside: GLASS[0] (the all-night lit wave) while on, GLASS[4] (nobody home) while off; the fire's flicker
  // over the dark ones while it burns (only at night: by day every pane is day glass anyway)
  const fl = (1 - s) * flame * (LIGHT.night || 0);
  const t = performance.now() / 1000;
  const flick = fl > 0.01 ? fl * (0.78 + 0.12 * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 12.9 + 1.7)) : 0;
  const qf = Math.round(flick * 40) / 40, on = GLASS[0], off = GLASS[4];
  LIVING_GLASS.color.copy(off.color).lerp(on.color, s).lerp(FIRE_WIN, qf * 0.55);
  LIVING_GLASS.emissive.copy(off.emissive).lerp(on.emissive, s).lerp(FIRE_EM, qf * 0.75);
  LIVING_GLASS.emissiveIntensity = off.emissiveIntensity + (on.emissiveIntensity - off.emissiveIntensity) * s + qf * 0.7;
}
