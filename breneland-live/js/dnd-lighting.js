// The back room's lighting while an adventure runs: the room fades down over a couple of seconds (the walls, shelves, couch,
// posters and string lights go dim and warm-dark) and the lamp over the table becomes the light: a cone down from the bulb
// tucked up in its shade, bright on the tops of things (the felt, the sheets, the dice, the chair seats), the sides lit by how
// they face the bulb, falling off with distance and off the lamp's axis, the floor under the table in its shadow, nothing above
// the shade's rim (the ceiling stays dark), the shade's lining aglow. The people at the table are in it too (the shared toon
// material people wear is patched); who stands back falls into the dark. When the game ends or pauses (the DM away or on a
// break, no player left) it fades back up.
// No new lights: one shader patch, the room's box and the lamp in shared uniforms (nothing relinks as you arrive). The shop is
// outside the box, so it never dims. Same on every client: it follows the shared table state. No flicker (a steady electric lamp).
// A fight (or a spooky scene) from the music's mood (game-night-music.js tableMood) sinks the room a little further, slowly.
import * as THREE from 'three';
import { tableMood } from './game-night-music.js';
import { frameHooks } from './perf-flags.js';
import { toon } from './toon.js';

export const FADE_S = 2.4;          // seconds to dim (or come back up)
export const MOOD_S = 1.8;          // a mood's extra, eased this slowly (never a flash)
// the room fully dim: a warm dark multiplier on the room's own light; a fight's and a spooky scene's extra (the room a little
// darker, the lamp a touch brighter)
export const DIM = { tint: [0.4, 0.27, 0.19], lift: 0, fight: { tint: 0.82, lift: 0.06 }, spooky: { tint: 0.88, lift: 0 }, hood: 0.86 }; // (hood: the room a little darker yet while the DM's hood is up, mpfb-in-game)
// the lamp: its warm colour; how bright (gain: on the felt right under it); how it falls off (as the felt's distance over the
// distance to the power `fall`: 2 a real bulb's square law) and where it is gone (`end` m from the bulb); the cone (degrees off straight down where it starts to soften and
// where it is gone, reaching further along the table: `long` squeezes the length that way); the shade's lining; how much darker
// the room's own light is above the shade (the walls' tops, the ceiling)
export const LAMP = { color: [1.0, 0.84, 0.62], gain: 1.9, fall: 2, end: 4.6, inner: 38, outer: 80, long: 0.72, lining: 1.05, high: 0.35 };
// the night grade (toon.js composite) greys the darks and lifts them blue: a dimmed wine wall went navy. With the camera in the
// room most of it is taken back while the room is dim (its own colour stays, warm)
export const GRADE = { darkLift: 0.85, sat: 0.8, shop: 0.6 };
// the door's glass: its pale veil thins while the room is dim, so the lit table shows through from the shop
export const GLASS_THIN = 0.55;

// shared by every patched material (a copy made by weather-cover, camera-fade or rigid-merge keeps them: the patch reads this object)
export const ROOM_DIM = {
  uDimK: { value: 0 },                              // 0 as built .. 1 a game running (eased)
  uDimMin: { value: new THREE.Vector3() },          // the room's box (world)
  uDimMax: { value: new THREE.Vector3() },
  uDimTint: { value: new THREE.Color(1, 1, 1) },    // the room's own light when fully dim
  uLampPos: { value: new THREE.Vector3() },         // the bulb
  uLampAxis: { value: new THREE.Vector3(0, -1, 0) },// straight down
  uLampColor: { value: new THREE.Color(1, 1, 1) },  // its colour times its gain
  uLampCone: { value: new THREE.Vector4() },        // cos inner, cos outer, the squeeze along x, along z
  uLampFall: { value: new THREE.Vector4() },        // the fall-off's power, where it ends, the felt's distance, the lining's glow
  uLampShade: { value: new THREE.Vector4() },       // the shade: rim y, rim radius, top y; how much darker the room is above it
  uLampTable: { value: new THREE.Vector4() },       // the table top (its shadow): min x, min z, max x, max z
  uLampTop: { value: 0 },                           // ...and its height
};

/** is an adventure running at the table? (the shared state: lib/dnd.js pub()) begun, a DM on (Claude or the host), a player seated */
export function gameOn(s) {
  if (!s || !s.module || !s.started) return false;
  const mode = s.dm?.mode;
  if (mode !== 'claude' && mode !== 'host') return false;
  return (s.seats || []).some((x, i) => i < 6 && x && !x.bot);
}
/** the extra for the mood the music plays (game-night-music.js): 'combat' (a fight), 'spooky', or null */
export function lightMood(s) {
  if (!gameOn(s)) return null;
  const m = tableMood(s).mood;
  return m === 'combat' || m === 'spooky' ? m : null;
}

const VERT = /* glsl */`
#include <project_vertex>
{ vec4 dimW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  dimW = instanceMatrix * dimW;
#endif
  vDimW = (modelMatrix * dimW).xyz; }`;
const FRAG_PARS = /* glsl */`
varying vec3 vDimW;
uniform float uDimK, uLampTop;
uniform vec3 uDimMin, uDimMax, uDimTint, uLampPos, uLampAxis, uLampColor;
uniform vec4 uLampCone, uLampFall, uLampShade, uLampTable;
// the lamp's light here, about 0..1 (1 on the felt right under it); n the world normal
float lampAt(vec3 n) {
  vec3 q = vDimW - uLampPos; float d = max(length(q), 1e-3);
  vec3 L = -q / d;
  float nl = clamp((dot(n, L) + 0.08) / 1.08, 0.0, 1.0);
  // the shade's lining (in the shade, facing the bulb) glows; its outside faces away and stays dark
  if (length(q.xz) < uLampShade.y + 0.02 && vDimW.y > uLampShade.x - 0.02 && vDimW.y < uLampShade.z + 0.02) return nl * uLampFall.w;
  // nothing above the shade's rim; off the axis it softens to nothing (further along the table: the squeeze)
  float under = 1.0 - smoothstep(uLampShade.x - 0.03, uLampShade.x + 0.03, vDimW.y);
  float cone = smoothstep(uLampCone.y, uLampCone.x, dot(normalize(vec3(q.x * uLampCone.z, q.y, q.z * uLampCone.w)), uLampAxis));
  float att = min(pow(uLampFall.z / d, uLampFall.x), 1.12) * (1.0 - smoothstep(uLampFall.y * 0.55, uLampFall.y, d));
  float lit = 1.0;
  if (vDimW.y < uLampTop - 0.015) { // under the table top: its shadow, where the line to the bulb passes through it
    vec2 h = mix(vDimW.xz, uLampPos.xz, (uLampTop - vDimW.y) / (uLampPos.y - vDimW.y));
    vec2 e = min(h - uLampTable.xy, uLampTable.zw - h);
    lit = 1.0 - smoothstep(-0.04, 0.04, min(e.x, e.y));
  }
  float x = clamp(under * cone * att * nl * lit, 0.0, 1.2);
  // cel steps like the toon ramp, half soft (so it still falls off across the felt)
  float c = 0.3 * smoothstep(0.03, 0.12, x) + 0.32 * smoothstep(0.2, 0.3, x) + 0.38 * smoothstep(0.6, 0.75, x) + max(x - 1.0, 0.0);
  return mix(x, c, 0.5);
}
// the room's light: as built outside the room or with no game; in the room its own light dim plus the lamp's (mode 0 a surface,
// 1 a glow: the bulbs, the lamp's own stays lit, 2 a decal: the lamps' floor pools just dim)
vec3 roomLight(vec3 col, vec3 alb, vec3 n, float mode, bool face) {
  if (uDimK < 0.002) return col;
  vec3 a = step(uDimMin, vDimW) * step(vDimW, uDimMax);
  if (a.x * a.y * a.z < 0.5 && !face) return col;
  vec3 dim = col * uDimTint;
  if (mode > 1.5) return mix(col, dim * 0.45, uDimK); // (the string lights' pools on the floor: dimmer still)
  dim *= 1.0 - uLampShade.w * smoothstep(uLampShade.x, uLampShade.x + 0.45, vDimW.y); // (above the shade the walls and ceiling darker yet)
  if (mode > 0.5) return mix(col, distance(vDimW, uLampPos) < 0.3 ? col : dim, uDimK);
  return mix(col, dim + alb * uLampColor * lampAt(n), uDimK);
}
// a flat printed thing (a basic material has no normal): its face's, turned to the camera
vec3 roomFaceN() { vec3 n = normalize(cross(dFdx(vDimW), dFdy(vDimW))); return dot(n, cameraPosition - vDimW) < 0.0 ? -n : n; }
`;
const patched = new WeakSet();
export const isRoomLit = mat => patched.has(mat);
// Chain the patch after whatever the material already has (the same way toon.js and weather-cover.js chain theirs).
// door: also the faces turned into the room (the door's leaf: closed it stands just outside the box). glow: a bulb's material
// (dims, but the lamp's own bulb stays lit). decal: a pool of light on the floor (it just dims)
export function patchRoomDim(mat, { door = false, glow = false, decal = false } = {}) {
  if (!mat || patched.has(mat)) return mat;
  patched.add(mat);
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  const hadOwn = prev !== THREE.Material.prototype.onBeforeCompile;
  const baseKey = prevKey !== THREE.Material.prototype.customProgramCacheKey ? prevKey.call(mat) : hadOwn ? prev.toString() : '';
  const face = door && mat.isMeshToonMaterial ? 'inverseTransformDirection(normal, viewMatrix).z > 0.3' : 'false';
  const mode = decal ? '2.0' : glow ? '1.0' : '0.0';
  const nrm = mat.isMeshToonMaterial ? 'inverseTransformDirection(normal, viewMatrix)' : 'roomFaceN()';
  mat.onBeforeCompile = (sh, r) => {
    if (hadOwn) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, ROOM_DIM);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDimW;').replace('#include <project_vertex>', VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n  gl_FragColor.rgb = roomLight(gl_FragColor.rgb, diffuseColor.rgb, ${nrm}, ${mode}, ${face});`); // (after the fog: the night's blue fog greyed a dimmed wall)
  };
  mat.customProgramCacheKey = () => `${baseKey}|roomlamp${door ? ':door' : ''}${glow ? ':glow' : ''}${decal ? ':decal' : ''}`;
  mat.needsUpdate = true;
  return mat;
}

/** the back room's light: createRoomLight({ inside, plan, leaf, scene, camera, ink }) -> { update(dt, s), state }. `inside` is the
 *  store's inside group (the room is baked into its batch), `plan` the back room's plan (game-store-backroom.js backroomPlan),
 *  `ink` () -> the InkPass (main.js makes it after the features) */
export function createRoomLight({ inside, plan, leaf = null, leaves = [], scene = null, camera = null, ink = null }) {
  const R = plan.room, T = plan.table, L = plan.lamp, fy = R.y;
  ROOM_DIM.uDimMin.value.set(R.minX - 0.01, fy - 0.05, R.minZ);
  ROOM_DIM.uDimMax.value.set(R.maxX + 0.01, R.ceil + 0.02, R.maxZ + 0.01);
  // the lamp: the bulb up in the shade, straight down, the cone, the fall-off (1 on the felt), the shade, the table
  ROOM_DIM.uLampPos.value.set(L.x, L.bulbY, L.z);
  const rad = a => Math.cos(a * Math.PI / 180);
  ROOM_DIM.uLampCone.value.set(rad(LAMP.inner), rad(LAMP.outer), LAMP.long, 1);
  ROOM_DIM.uLampFall.value.set(LAMP.fall, LAMP.end, L.bulbY - plan.felt.y, LAMP.lining);
  ROOM_DIM.uLampShade.value.set(L.rimY, L.rimR, L.topY, LAMP.high);
  ROOM_DIM.uLampTable.value.set(T.x - T.w / 2, T.z - T.d / 2, T.x + T.w / 2, T.z + T.d / 2);
  ROOM_DIM.uLampTop.value = T.top;
  // the store's inside batch shares the world's vertex-colour toon material: it gets its own copy (static, nothing drives it);
  // the store's own bulbs and printed things are patched in place (the box keeps the shop's as they are)
  const own = new Map();
  const inRoom = o => o.position.x > R.minX && o.position.x < R.maxX && o.position.z > R.minZ && o.position.z < R.maxZ && o.position.y < R.ceil;
  for (const o of inside.children) {
    if (o.isMesh && o.name === 'store-print' && inRoom(o)) { patchRoomDim(o.material); continue; } // (the room's three framed prints: each its own material)
    if (!o.isMesh || !/^store-(inside|bulbs|bulbs-room)$/.test(o.name)) continue;
    const m = o.material;
    if (m.isMeshToonMaterial && m.vertexColors) {
      let c = own.get(m);
      if (!c) { c = m.clone(); if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; } c.name = 'store-inside-room'; own.set(m, patchRoomDim(c)); }
      o.material = own.get(m);
    } else if (m.isMeshBasicMaterial && /^store-bulbs/.test(o.name)) patchRoomDim(m, { glow: true });
    else if (m.isMeshBasicMaterial && m.map) patchRoomDim(m);
  }
  // the people (players, the DM, town folk) wear the shared vertex-colour toon material: patched in place, so whoever sits at the
  // table is in the lamp's light and whoever stands back is in the dim (rigid-merge's copies keep it; outside the room it does
  // nothing). After the inside's own copy above, which is made from it unpatched
  patchRoomDim(toon('#ffffff', { vertexColors: true }));
  // the doors' leaves (the half-glass door, the glass door to the outside) wear shared toon materials: copies of their own (no
  // new draw calls)
  const glass = leaf?.userData?.glass?.material || null, glassOp = glass ? glass.opacity : 0;
  for (const lf of [leaf, ...leaves]) if (lf) {
    const mine = new Map();
    lf.traverse(o => {
      if (!o.isMesh || !o.material?.isMeshToonMaterial) return;
      let c = mine.get(o.material);
      if (!c) { c = o.material.clone(); c.name = (o.material.name || 'toon') + '+room'; mine.set(o.material, patchRoomDim(c, { door: true })); }
      o.material = mine.get(o.material);
    });
  }
  // the lamps' pools on the floor at night (daynight-fx.js builds them on its first frame): the string lights' pools dim too
  let pools = null, poolLook = 0;
  const findPools = dt => {
    if (pools || !scene) return;
    poolLook -= dt; if (poolLook > 0) return; poolLook = 2;
    pools = scene.getObjectByName('lamp-pools') || null;
    if (pools) patchRoomDim(pools.material, { decal: true });
  };

  // the grade, after daynight.js has set it this frame and before the draw (frameHooks): uSat it sets every frame, uDarkLift
  // nobody does (the maze below sets 0 and back to 1), so ours is undone next frame unless someone else changed it meanwhile
  const Bmin = ROOM_DIM.uDimMin.value, Bmax = ROOM_DIM.uDimMax.value;
  let wrote = null, saved = 1, gradeW = 0;
  const doorX = (plan.door.x0 + plan.door.x1) / 2, SHOP_LOOK = 4.5, fwd = new THREE.Vector3(); // (in the shop, this near the door: some of it, for the view in)
  frameHooks.push(() => {
    const u = ink?.()?.uniforms; if (!u || !u.uDarkLift) return;
    if (wrote !== null && u.uDarkLift.value === wrote) u.uDarkLift.value = saved;
    wrote = null;
    const c = camera?.position, k = ROOM_DIM.uDimK.value;
    gradeW = !c || k < 0.001 || !inside.visible || c.y < Bmin.y || c.y > Bmax.y || c.x < Bmin.x || c.x > Bmax.x ? 0
      : c.z > Bmin.z && c.z < Bmax.z ? k                                        // in the room
      : c.z > Bmin.z - SHOP_LOOK && Math.abs(c.x - doorX) < SHOP_LOOK && camera.getWorldDirection(fwd).z > 0.6 ? k * GRADE.shop * (1 - (Bmin.z - c.z) / SHOP_LOOK) : 0; // in the shop looking in at the door
    if (!gradeW) return;
    saved = u.uDarkLift.value; wrote = u.uDarkLift.value = saved * (1 - GRADE.darkLift * gradeW);
    if (u.uSat) u.uSat.value += (1 - u.uSat.value) * GRADE.sat * gradeW;
  });

  let lin = 0, moodT = 0, moodK = 0, mood = null, on = false, tintK = 1, liftK = 0, seen, hoodK = 0;
  const base = new THREE.Color(...DIM.tint), lampC = new THREE.Color(...LAMP.color);
  const smooth = x => x * x * (3 - 2 * x);
  return {
    get state() { return { on, k: ROOM_DIM.uDimK.value, lin, mood, moodK, tint: ROOM_DIM.uDimTint.value.toArray().map(v => +v.toFixed(3)), lift: +(DIM.lift + liftK * moodK).toFixed(3), lamp: ROOM_DIM.uLampColor.value.toArray().map(v => +v.toFixed(3)), pools: !!pools, grade: +gradeW.toFixed(3), hood: +hoodK.toFixed(3) }; },
    uniforms: ROOM_DIM,
    /** a material of something in the room made later (the map, the DM's card, the dice): patched now, at load */
    add: (mat, opts) => patchRoomDim(mat, opts),
    /** every frame: s = the shared D&D state; hood: 0..1, how far up the DM's hood is (the room sinks a little more with it) */
    update(dt, s, hood = 0) {
      hoodK = hood;
      if (s !== seen) { seen = s; on = gameOn(s); mood = lightMood(s); } // (read again only when a new state arrives)
      findPools(dt);
      lin = Math.max(0, Math.min(1, lin + (on ? dt : -dt) / FADE_S));
      // a fight or a spooky scene: a little deeper, eased slowly
      const extra = mood === 'combat' ? DIM.fight : mood === 'spooky' ? DIM.spooky : null;
      const want = extra ? 1 : 0;
      moodT += Math.sign(want - moodT) * Math.min(Math.abs(want - moodT), dt / MOOD_S);
      moodK = smooth(moodT);
      if (extra) { tintK = extra.tint; liftK = extra.lift; } // (the extra in hand fades in and out with moodK)
      const k = smooth(lin);
      ROOM_DIM.uDimK.value = k;
      if (glass) glass.opacity = glassOp * (1 - GLASS_THIN * k);
      const t = (1 + (tintK - 1) * moodK) * (1 + (DIM.hood - 1) * hoodK);
      ROOM_DIM.uDimTint.value.setRGB(base.r * t, base.g * t, base.b * t);
      ROOM_DIM.uLampColor.value.copy(lampC).multiplyScalar(LAMP.gain * (1 + DIM.lift + liftK * moodK));
    },
  };
}
