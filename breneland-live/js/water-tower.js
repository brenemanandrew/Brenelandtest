// The water tower on the west end of town, and climbing it (PEAK style). 48 m to the catwalk, with brace rings at 9.6, 19.2,
// 28.8 and 38.4 m to rest on. Four ways up, one a side, each painted on the steel in its colour (blazes, like trail marks):
//   the LADDER (easy, a straight shot, a green light shining up from its foot); YELLOW (medium) up a leg's lattice; ORANGE
//   (hard) up the X braces, a brace missing twice (lunge across) and a wet rusty stretch you slide down unless you keep
//   climbing; RED (expert) the same braces with three missing, a long wet stretch and, at the top, hand over hand under the
//   catwalk's knee bracket out to its rim.
// You hang on by yourself until your grip (the bar) runs out or you let go (E, B on a pad, the small Let go on a phone). The
// stick climbs. Space (A on a pad, the one big button on a phone) lunges a gap and jumps off the top, and that button shows
// only when it does something. The first climb explains this on a card, after that the quiet strip speaks only when something
// new comes up. Chalk bags on some rests top you up.
// First person, with hands that hold the real steel (see "first-person hands" below). Others see your hands on it too
// (IK_WORLD.climb, bodies-poses.js climb), and see you on the tower through the normal position stream with the 'climb' pose.
// At the top you walk round the catwalk and up to the deck round the beacon: a banner, a firework, the day's fish
// (ctx.reward('tower')) and a photo moment. "Take in the view" hides every bit of HUD, and you leave when you choose: Jump
// launches you off the top and you land and bounce. A fall bounces too, onto the ground or a footing pad, never into it.
// Test hooks: feature.api.
import * as THREE from 'three';
import { WATER_TOWER, WALK, SIDEWALK_W } from './layout.js';
import { terrainHeight, groundHeight, roadEdgeDist } from './terrain.js';
import { toon, shadows } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { signTexture } from './areas.js';
import { el, loadCss, clamp, pointInPoly, angleLerp } from './util.js';
import { buildHand, setHandShape, wrapAt } from './bodies-hands.js'; // the PEAK-style hands, first person (the tower's wrap and strain shapes)
import { IK_WORLD } from './bodies-ik.js';

// the tower's shape (metres): legs splay from R0 at the ground to R1 at the catwalk, H up. The catwalk is 1.8 m wide (CAT_R),
// so you can walk round it freely between the tank and the rail
const H = 48, R0 = 8, R1 = 5.2, TANK_R = 6.6, TANK_H = 11, ROOF_H = 5, CAT_R = 8.4; // (a wider splay puts a footing on the street east of it)
const LEGS = 4;
export const LEVELS = [9.6, 19.2, 28.8, 38.4]; // the brace rings: where a route may let you rest
const SIN45 = Math.SQRT1_2;
const STAM = { max: 100, hang: 4, up: 9, rest: 22, lunge: 16, chalk: 38, chalkTime: 25, chalkRespawn: 90 };
// the four ways up, one a side; `rests` index LEVELS (the brace rings); gaps / over / slick are spans of your feet's height (m) on
// that route (the steel they leave out or wet is where your hands would be: holeOf, wetOf). `part`: what the route climbs; braces
// start from the leg on the `from` side of their face (u's sign) and zig-zag up; red leaves its brace for the catwalk's bracket.
// (every section between rests can be climbed on one bar of grip by a steady climber, the harder routes with less to
// spare: the ladder about a third, yellow's long section about four fifths, orange and red nearly all of it with their lunges)
export const ROUTES = [
  { id: 'ladder', name: 'The ladder', level: 'Easy', color: '#4fd27a', drain: 0.45, up: 2.2, rests: [0, 1, 2, 3], gaps: [], over: [], slick: [], part: 'ladder',
    about: 'straight up, a ledge to rest on every 10 m', tag: 'easy' },
  { id: 'yellow', name: 'The yellow leg', level: 'Medium', color: '#f2c94c', drain: 0.5, up: 1.9, rests: [0, 2, 3], gaps: [], over: [], slick: [], part: 'leg',
    about: 'up the leg\'s lattice, batten by batten, then out along its bracket; one long stretch with no rest', tag: 'medium, one long stretch' },
  { id: 'orange', name: 'The orange braces', level: 'Hard', color: '#f2994a', drain: 0.46, up: 1.8, rests: [1, 3], gaps: [[13.2, 14.9], [33.4, 35.1]], over: [], slick: [[23, 27.2]], part: 'braces', from: -1, bracket: true,
    about: 'up the X braces corner to corner: two braces missing (lunge!) and a wet stretch', tag: 'hard, gaps and wet steel' },
  { id: 'red', name: 'The red braces', level: 'Expert', color: '#e0574f', drain: 0.5, up: 1.7, rests: [0, 2, 3], gaps: [[5.6, 7.4], [14.8, 16.6], [24.6, 26.4]], over: [[43.8, H - 1.9]], slick: [[30.5, 36]], part: 'braces', from: 1, bracket: true,
    about: 'three missing braces, a long wet stretch, then hand over hand under the catwalk', tag: 'expert, the overhang' },
];
const LADDER_FACE = 0;
const inSpan = (h, spans) => spans.find(([a, b]) => h >= a && h < b) || null;
const legR = h => R0 + (R1 - R0) * clamp(h / H, 0, 1);
const faceD = h => legR(h) * SIN45;              // the face's plane, from the axis
const faceC = k => Math.PI / 4 + k * Math.PI / 2; // a face's middle (the legs stand at 0, 90, 180, 270 degrees)
const legAngle = i => (i / LEGS) * Math.PI * 2;
// the way a climber at angle theta faces: straight at the tower's axis (yaw = atan2(dx, dz))
const faceAxis = theta => Math.atan2(-Math.cos(theta), -Math.sin(theta));
// how far outside the steel you hang: an arm's length (ARM_LEN) behind the rungs of a ladder, or behind what your hands hold (bodyOut)
const ARM_LEN = 0.6;
const EYE = 1.55;                                   // your eye over your feet
const RUNG0 = 0.5, RUNG_STEP = 0.4, RUNG_R = 0.022; // the rungs: every 0.4 m up from 0.5 m, 4.4 cm thick
// the ladder stands out from its face on struts and rises almost straight up, from 1 m out at its foot to just outside
// the catwalk's rim at the top (LAD_R1), so it comes up past the tank's overhang and the planks, never through them, to a gate in the
// rail. ladderR: its rungs' distance from the tower's axis at height h; ladderOut: from the face's plane.
const LAD_R0 = R0 * SIN45 + 1.0, LAD_R1 = CAT_R + 0.4;
const ladderR = h => LAD_R0 + (LAD_R1 - LAD_R0) * clamp(h, 0, H + 1.4) / H;
const ladderOut = h => ladderR(h) - legR(h) * SIN45;
const LADDER_TOP = H - 0.4;                          // your feet at the top of the ladder, its rails going on up past the rim as handles
const LADDER_RUNGS = Math.floor((H + 0.9 - RUNG0) / RUNG_STEP - 1e-6) + 1;
// the way on up from the catwalk: a ladder up the tank's side on standoffs (TL_R from the axis, clear of the bands and
// the eave), bending over the eave onto a ladder lying on the roof (its rungs 0.2 m off the roof's slope), up to a small deck round
// the beacon's mast with a rail. The roof is a cone cut off flat at the top (RE at the eave to RT under the deck).
const RE = TANK_R + 0.15, RT = 2.1, RD = 2.3, MAST_R = 0.12;
const Y_E = H + TANK_H, Y_T = H + TANK_H + ROOF_H, DECK_Y = Y_T + 0.15, M_ROOF = ROOF_H / (RE - RT);
const TL_R = TANK_R + 0.45;
const roofSurfR = y => RE - (y - Y_E) / M_ROOF;      // the roof's surface, its distance from the axis at height y
const slopeR = y => roofSurfR(y) + 0.2;              // the roof ladder's rungs
const CORNER = Y_E + (RE + 0.2 - TL_R) * M_ROOF;     // where the tank's ladder meets the roof's (just under the eave, outside it)
const ROOF_TOP_H = DECK_Y - 1.0;                      // your feet at the top of the roof ladder, before you pull up onto the deck
// the first-person hands: a hand holds a grip from LO to HI metres over your feet, and reaches for the next one past that
const GRIP_LO = 1.4, GRIP_HI = 2.2; // (0.15 m under your eye to 0.65 m over it: the upper hand in the view, over the HUD at the bottom)
const REACH = (GRIP_LO + GRIP_HI) / 2;              // where a route puts you: its line at your hands' middle height
const FACE_TOP = H - 1.9;                           // off the ladder your hands reach the catwalk's edge here and you pull over onto it
// ---- the steel the routes climb. The legs are lattice columns LEG_S either side of their line (sides facing their
// two faces), battens across their sides every BATTEN up (the inner sides every other one), lacing zig-zag between; X braces (BR
// thick) between the legs in each bay of BAYS; knee brackets from the top bay's braces out to the catwalk's rim.
const LEG_S = 0.38, BATTEN = 0.6, BATTEN0 = 0.9, BR = 0.14, BR_F = BR / 2;
const BAYS = [0.8, ...LEVELS, H - 0.6];
const bayOf = g => { let n = 0; while (n < BAYS.length - 2 && g >= BAYS[n + 1]) n++; return n; };
const braceSide = (R, n) => R.from * (n % 2 ? -1 : 1); // the side (the sign of u) bay n's brace of route R starts from
// where along its face route R's brace is at height g (straight between the legs: u is linear in g)
function braceU(R, g) {
  if (g < BAYS[0]) return braceSide(R, 0) * faceD(g);
  if (g >= BAYS[BAYS.length - 1]) return -braceSide(R, BAYS.length - 2) * faceD(g); // (over the top bay: up its leg)
  const n = bayOf(g), a = braceSide(R, n), t = (g - BAYS[n]) / (BAYS[n + 1] - BAYS[n]);
  return a * faceD(BAYS[n]) * (1 - t) - a * faceD(BAYS[n + 1]) * t;
}
// the knee brackets: from the top bay's braces (or a leg) at BK_G0 straight out from the face to under the catwalk's rim (BK_TOP).
// Every coloured route finishes out along one to the rim, so it comes up outside the planks to a gate in the rail: the yellow
// leg's is the one on its leg, the orange and red braces' the one their top brace meets. Only red's drains like an overhang.
const BK_G0 = 45.6, BK_TOP = H - 0.2;
const BK_U = Math.abs(braceU(ROUTES[3], BK_G0)), LEG_BK_U = faceD(BK_G0);
const bkRim = u => Math.sqrt((CAT_R - 0.15) ** 2 - u * u) - faceD(BK_TOP); // (out from the face's plane where it meets the rim)
// the middle of a bracket at u (rooted `root` out from the face) at height g
const bkCore = (u, root, g) => root + (Math.min(g, BK_TOP) - BK_G0) * (bkRim(u) - root) / (BK_TOP - BK_G0);
// a route's line up its face at height g (where the hands go): u along the face, `out` the front of the steel there (off the face's
// plane), `slope` du/dg, `part` what it is (`core`: a bracket's middle)
function routeLine(k, g) {
  const R = ROUTES[k];
  if (R.part === 'ladder') return { u: 0, out: ladderOut(g), slope: 0, part: 'ladder' };
  if (R.part === 'leg') {
    if (g >= BK_G0) { const core = bkCore(LEG_BK_U, LEG_S, g); return { u: LEG_BK_U, out: core + BR_F, core, slope: 0, part: 'bracket' }; }
    return { u: faceD(g), out: LEG_S + 0.03, slope: (faceD(g + 0.05) - faceD(g)) / 0.05, part: 'leg' };
  }
  const s = braceSide(R, BAYS.length - 2);
  if (R.bracket && g >= BK_G0) { const core = bkCore(BK_U, 0, g); return { u: -s * BK_U, out: core + BR_F, core, slope: 0, part: 'bracket' }; }
  const u = braceU(R, g), top = g >= BAYS[BAYS.length - 1] || g < BAYS[0];
  return { u, out: top ? LEG_S + 0.03 : BR_F, slope: (braceU(R, g + 0.05) - u) / 0.05, part: top ? 'leg' : 'brace' };
}
const topOf = k => (k === LADDER_FACE ? LADDER_TOP : FACE_TOP); // where you pull up over the rim onto the catwalk
// how far out from its face you hang at height h (feet): an arm's length behind the ladder's rungs; elsewhere behind the steel your
// hands are on, and under a bracket behind the highest of it in your reach (you hang out with it)
const bodyOut = (k, h) => (k === LADDER_FACE ? ladderOut(h) + ARM_LEN : Math.max(routeLine(k, h + EYE).out, routeLine(k, h + REACH).out, routeLine(k, h + GRIP_HI).out) + ARM_LEN);
const routeU = (k, h) => (k === LADDER_FACE ? 0 : routeLine(k, h + REACH).u);
// the tank's ladder: round from the ladder's gate (so stepping off one isn't stepping onto the other); its rungs up the
// tank's side every 0.4 m, then up the roof's slope every 0.4 m of its length ({ y, r }: height and distance from the axis)
const TLA = Math.PI / 4 + 0.32;
const ROOF_RUNG = [];
for (let y = H + 0.4; y < CORNER - 0.05; y += RUNG_STEP) ROOF_RUNG.push({ y, r: TL_R });
{ const dy = RUNG_STEP / Math.sqrt(1 + 1 / (M_ROOF * M_ROOF)); for (let y = CORNER + dy * 0.6; y < Y_T - 0.05; y += dy) ROOF_RUNG.push({ y, r: slopeR(y) }); }
// your feet on the tank's ladder at height h: an arm's length behind its rungs up the side, then (over the eave) 0.35 m out from the roof
// ladder's, the two blended round the bend; `lean` 0..1 how far onto the roof you are (your eye leans in over its rungs)
function roofBody(h) {
  const a = TL_R + ARM_LEN, c = slopeR(h) + 0.35, r = (a + c - Math.sqrt((a - c) ** 2 + 0.04)) / 2;
  return { r, lean: clamp((a - r) / 0.25, 0, 1) };
}
// the steel a gap leaves out (a missing brace) and the stretch a wet span wets, from the feet's spans: where your hands would be
const holeOf = ([a, b]) => [a + GRIP_HI - 0.1, b + GRIP_LO + 0.3];
const wetOf = ([a, b]) => [a + GRIP_LO, b + GRIP_HI];
const FP_SCALE = 1.12;                              // (a rung of RUNG_R fills the wrap shape's curl at this size: bodies-hands WRAP_R)
const FOV_PHONE = 76;                               // the climb's view on a phone held upright (55 leaves 25 degrees across: the hands off the sides)
const LAUNCH = { up: 7, out: 4.5, g: 17, keep: 0.45, slow: 0.6, bounces: 3 }; // (out 4.5 m/s: you come to rest 25-30 m off; aimLaunch keeps that off the road and the map's edge)
const STEER = [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6]; // how far a launch may turn (rad) to land on grass, before it goes softer
// (tower-hands) others see a climber's hands go for the hold nearest a comfortable reach (REMOTE_AIM: m up from their feet and in toward
// the steel, at scale 1), none further than REMOTE_REACH from their chest; bodies-poses climbReach brings the body the rest of the way
const REMOTE_REACH = 1.15, REMOTE_AIM = { up: 1.55, in: 0.35 };
// (tower-hands) resting on a ring: the camera out behind you (m from your feet, out from the face), up, and the height it looks at;
// your body shows once it is `body` m from your eye
const REST_CAM = { out: 3.1, up: 2.1, look: 1.0, body: 0.55 };
// (tower-hands) the first-person forearm: `len` of sleeve from the wrist (radius r0) toward the elbow (r1), solid for `solid`, then
// fading to nothing over `fade` (a real forearm is about 0.25 m: what you see stops past its middle)
export const FORE = { len: 0.25, solid: 0.12, fade: 0.1, r0: 0.034, r1: 0.04 };
const FORE_LEN = FORE.len, FORE_R0 = FORE.r0, FORE_R1 = FORE.r1;
// The forearm's sleeve: the sleeve's toon material, see-through by how far up the forearm (its own y, metres from the wrist) a
// fragment is. It writes its alpha into the colour target, so the ink pass fades its outline with it (toon.js: edge *= base.a), and
// in the ink pass's normals it writes alpha 0, as a person does (rigid-merge.js), so no crease line hugs the faded part from outside.
function forearmMaterial(src) {
  const m = src.clone(), NP = { value: 0 }, a = FORE.solid.toFixed(3), b = (FORE.solid + FORE.fade).toFixed(3);
  m.name = 'tower-forearm';
  m.transparent = true; m.depthWrite = true;
  m.blending = THREE.CustomBlending; m.blendEquation = m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.ZeroFactor;
  m.allowOverride = false;
  m.onBeforeCompile = sh => {
    sh.uniforms.uForeNP = NP;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vForeY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vForeY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uForeNP;\nvarying float vForeY;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n  float foreA = 1.0 - smoothstep(${a}, ${b}, vForeY);\n  if (foreA < 0.004) discard;\n  diffuseColor.a *= foreA;`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  if (uForeNP > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 0.0);');
  };
  m.customProgramCacheKey = () => `tower-forearm|${a}|${b}`;
  m.onBeforeRender = (r, scene) => { NP.value = scene.overrideMaterial ? 1 : 0; };
  return m;
}

export function createWaterTower(ctx) {
  const { scene, player, colliders, audio, ui, input, camera } = ctx;
  loadCss('/css/tower.css');
  const { x: cx, z: cz } = WATER_TOWER;
  const gy = terrainHeight(cx, cz);
  const group = new THREE.Group(); group.name = 'water-tower'; group.position.set(cx, gy, cz); scene.add(group);
  const b = new Batcher({ vertexColors: true });
  const steel = '#8d949c', dark = '#5b6168', rust = '#9a6b4a', wet = '#5e4636';
  const at = (ang, r, y) => [Math.cos(ang) * r, y, Math.sin(ang) * r];
  const beam = (A, B, w, col) => { // a member from A to B ([x, y, z] in the tower's frame)
    const a = new THREE.Vector3(...A), c = new THREE.Vector3(...B), len = a.distanceTo(c);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(a, c, new THREE.Vector3(0, 1, 0)));
    b.add(GEO.box, col, { matrix: new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), q, new THREE.Vector3(w, w, len)) });
  };
  // a point on face k: u metres along it (to the right as you face it), at height h, `out` metres off its plane
  const onFace = (k, u, h, out = 0) => { const c = faceC(k), d = faceD(h) + out; return [Math.cos(c) * d - Math.sin(c) * u, h, Math.sin(c) * d + Math.cos(c) * u]; };

  // ---- the model (the routes climb the steel itself; nothing bolted on in the air)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const faceN = k => V(Math.cos(faceC(k)), 0, Math.sin(faceC(k))), faceT = k => V(-Math.sin(faceC(k)), 0, Math.cos(faceC(k)));
  const UP = V(0, 1, 0);
  const F3 = (k, u, h, o) => V(...onFace(k, u, h, o));
  const slab = (pos, t, s2, size, col) => { // a box with its x along t, its y along s2 (the tower's frame), centred on pos
    const z = new THREE.Vector3().crossVectors(t, s2);
    const m = new THREE.Matrix4().makeBasis(t, s2, z).scale(new THREE.Vector3(...size)); m.setPosition(pos);
    b.add(GEO.box, col, { matrix: m });
  };
  // a painted stripe from A to B ([x, y, z]) on the face of a member that looks along n, `off` out from its middle
  const stripe = (A, B, n, off, col, w = 0.07) => {
    const a = V(...A), c = V(...B), t = c.clone().sub(a), len = t.length(); t.multiplyScalar(1 / len);
    slab(a.add(c).multiplyScalar(0.5).addScaledVector(n, off), t, V(0, 0, 0).crossVectors(n, t).normalize(), [len, w, 0.02], col);
  };
  const rivets = (c, t, s2, n, w, h2) => { for (const [a, e] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) slab(c.clone().addScaledVector(t, a * w).addScaledVector(s2, e * h2).addScaledVector(n, 0.025), t, s2, [0.06, 0.06, 0.04], dark); };
  // the legs: lattice columns (four angle-iron edges, battens across each side, lacing zig-zag between), on a concrete footing pad.
  // Leg i is the u = +faceD side of face i - 1 and the u = -faceD side of face i: each side of it is drawn in that face's terms.
  for (let i = 0; i < LEGS; i++) {
    const a = legAngle(i);
    b.add(GEO.box, dark, { x: Math.cos(a) * R0, y: 0.45, z: Math.sin(a) * R0, sx: 2.2, sy: 0.9, sz: 2.2 }); // concrete footing
    colliders.push({ type: 'circle', x: cx + Math.cos(a) * R0, z: cz + Math.sin(a) * R0, r: 1.2 });
    const kA = (i + 3) % 4, kB = i; // (the faces it is the right and the left of)
    for (const so of [1, -1]) for (const su of [1, -1]) beam(onFace(kA, faceD(BATTEN0 - 0.1) + su * LEG_S, BATTEN0 - 0.1, so * LEG_S), onFace(kA, faceD(H) + su * LEG_S, H, so * LEG_S), 0.12, steel);
    // each side: in its own face's terms, at out +LEG_S (the outer sides) or -LEG_S (the inner, battens every other one)
    for (const [k, sg] of [[kA, 1], [kB, -1]]) for (const so of [1, -1]) {
      let n = 0;
      for (let g = BATTEN0; g <= H - 0.1; g += BATTEN, n++) {
        if (so < 0 && n % 2) continue;
        const c = sg * faceD(g);
        beam(onFace(k, c - LEG_S, g, so * LEG_S), onFace(k, c + LEG_S, g, so * LEG_S), 0.06, steel);
        if (so > 0 && g + BATTEN <= H - 0.1) { const g2 = g + BATTEN, c2 = sg * faceD(g2), d = n % 2 ? 1 : -1; beam(onFace(k, c - d * LEG_S, g, so * LEG_S), onFace(k, c2 + d * LEG_S, g2, so * LEG_S), 0.045, steel); }
      }
      // gusset plates where the rings and braces meet the leg, riveted
      if (so > 0) for (const L of BAYS) { const p = F3(k, sg * (faceD(L) - LEG_S - 0.32), L, 0.02); slab(p, faceT(k), UP, [0.8, 0.8, 0.03], dark); rivets(p, faceT(k), UP, faceN(k), 0.28, 0.28); }
    }
  }
  // the brace rings at the levels; X braces in every bay of every face. On a route's face its own brace (the one it climbs in each bay)
  // is cut where a gap leaves it out (bent stubs either side), dark and wet where it is slick, and painted with the route's blazes.
  const routeOf = k => (ROUTES[k].part === 'braces' ? ROUTES[k] : null);
  for (let n = 1; n < BAYS.length - 1; n++) for (let i = 0; i < LEGS; i++) beam(at(legAngle(i), legR(BAYS[n]), BAYS[n]), at(legAngle(i + 1), legR(BAYS[n]), BAYS[n]), 0.34, steel);
  const braceAt = (k, s, n, g) => { const t = (g - BAYS[n]) / (BAYS[n + 1] - BAYS[n]); return onFace(k, s * faceD(BAYS[n]) * (1 - t) - s * faceD(BAYS[n + 1]) * t, g, 0); };
  for (let k = 0; k < 4; k++) {
    const R = routeOf(k), holes = R ? R.gaps.map(holeOf) : [], wets = R ? R.slick.map(wetOf) : [];
    for (let n = 0; n < BAYS.length - 1; n++) for (const s of [1, -1]) {
      const g0 = BAYS[n], g1 = BAYS[n + 1], mine = R && braceSide(R, n) === s;
      if (!mine) { beam(braceAt(k, s, n, g0), braceAt(k, s, n, g1), BR, rust); continue; }
      // cut points: the holes' and the wet stretches' ends inside this bay
      const cuts = [g0, g1];
      for (const [x, y] of [...holes, ...wets]) for (const c of [x, y]) if (c > g0 && c < g1) cuts.push(c);
      cuts.sort((p, q) => p - q);
      for (let j = 1; j < cuts.length; j++) {
        const lo = cuts[j - 1], hi = cuts[j], mid = (lo + hi) / 2;
        if (holes.some(([x, y]) => mid > x && mid < y)) { // a missing brace: a bent stub sticking out at each end
          for (const [e, d] of [[lo, -1], [hi, 1]]) { const p = V(...braceAt(k, s, n, e)), q = V(...braceAt(k, s, n, e - d * 0.45)).addScaledVector(faceN(k), 0.28); beam(p.toArray(), q.toArray(), BR, rust); }
          continue;
        }
        beam(braceAt(k, s, n, lo), braceAt(k, s, n, hi), BR, wets.some(([x, y]) => mid > x && mid < y) ? wet : rust);
        stripe(braceAt(k, s, n, lo + 0.05), braceAt(k, s, n, hi - 0.05), faceN(k), BR_F + 0.012, R.color, 0.1); // (the route's line, painted up it)
      }
    }
  }
  // the knee brackets: from the top bay's braces out under the catwalk's rim, two a face, and one from each leg; a
  // coloured route's own is painted (its line on the underside, and bands): the orange and red braces' and the yellow leg's
  for (let k = 0; k < 4; k++) for (const [u, root] of [[BK_U, 0], [-BK_U, 0], [LEG_BK_U, LEG_S]]) {
    const p0 = F3(k, u, BK_G0, root), p1 = F3(k, u, BK_TOP, bkRim(u));
    beam(p0.toArray(), p1.toArray(), 0.16, steel);
    const R = ROUTES[k], mine = R.part !== 'ladder' && Math.abs(routeLine(k, BK_G0 + 0.5).u - u) < 0.01 && routeLine(k, BK_G0 + 0.5).part === 'bracket';
    if (mine) {
      const along = p1.clone().sub(p0).normalize(), dn = faceN(k).addScaledVector(along, -faceN(k).dot(along)).normalize();
      stripe(p0.toArray(), p1.toArray(), dn, 0.09, R.color, 0.08);
      for (let q = 0.25; q < 1; q += 0.25) beam(p0.clone().lerp(p1, q - 0.04).toArray(), p0.clone().lerp(p1, q + 0.04).toArray(), 0.21, R.color);
    }
    if (!root) { const gp = F3(k, u, BK_G0, 0.02); slab(gp, faceT(k), UP, [0.5, 0.5, 0.03], dark); rivets(gp, faceT(k), UP, faceN(k), 0.16, 0.16); }
  }
  // the gusset plate where each bay's braces cross, riveted
  for (let k = 0; k < 4; k++) for (let n = 0; n < BAYS.length - 1; n++) {
    const d0 = faceD(BAYS[n]), d1 = faceD(BAYS[n + 1]), gx = BAYS[n] + (BAYS[n + 1] - BAYS[n]) * d0 / (d0 + d1), p = F3(k, 0, gx, 0.02);
    slab(p, faceT(k), UP, [0.55, 0.55, 0.03], dark); rivets(p, faceT(k), UP, faceN(k), 0.18, 0.18);
  }
  // the routes: blazes in their colour painted on the steel they climb every 1.8 m, a deck plate on the ring where they rest (its
  // edge painted), and the grips the hands close on (HOLDS: on a leg's battens, along a brace, under the bracket). Each grip keeps
  // where a hand closes on it: `p` (world: a batten's middle, a brace's top front edge, the bracket's underside), the way out from it
  // `n`, its up `s` and along `t` (world directions); `bar`: wrapped round like a rung.
  const HOLDS = [[], [], [], []];
  const W0 = V(cx, gy, cz);
  ROUTES.forEach((R, k) => {
    const N = faceN(k), T = faceT(k);
    for (const li of R.rests) { // the deck plate: on the ring, under where the route has you rest
      const L = LEVELS[li], ln = routeLine(k, L + REACH), o = (k === LADDER_FACE ? ladderOut(L) - 0.3 : ln.out - 0.1);
      slab(F3(k, ln.u, L - 0.09, o + 0.6), T, UP, [1.8, 0.08, 1.2], '#7b838b');
      slab(F3(k, ln.u, L - 0.075, o + 1.17), T, UP, [1.82, 0.09, 0.08], R.color); // (its underside a centimetre up inside the plate's: level with it, the two flickered from below)
    }
    if (R.part === 'ladder') { // (the blazes sit on the rails' own line and lean with them: upright on the curve the rails cut across, a rail's side came level with a blaze's and flickered)
      const p0 = V(...onFace(k, 0, 0, ladderOut(0))), p1 = V(...onFace(k, 0, H + 1.15, ladderOut(H + 1.15))), along = p1.clone().sub(p0).normalize();
      for (let g = 2; g < H; g += 3) for (const s of [-0.36, 0.36]) slab(p0.clone().lerp(p1, g / (H + 1.15)).addScaledVector(T, s), T, along, [0.11, 0.3, 0.11], R.color); return; }
    const holes = R.gaps.map(holeOf), wets = R.slick.map(wetOf), inS = (g, sp) => sp.some(([x, y]) => g >= x && g < y);
    const grip = (u, g, p, n, s, t, bar, over) => HOLDS[k].push({ k, u, h: g, p: p.add(W0), n, s, t, slick: inS(g, wets), kind: 'hold', bar, over });
    // under a bracket: two grips either side of its middle, on its underside
    const bracketGrips = (g, ln) => {
      const root = R.part === 'leg' ? LEG_S : 0, p0 = F3(k, ln.u, BK_G0, root), p1 = F3(k, ln.u, BK_TOP, bkRim(ln.u)), along = p1.clone().sub(p0).normalize();
      const n = N.clone().addScaledVector(along, -N.dot(along)).normalize(); // (out and down from its underside)
      for (const du of [-0.09, 0.09]) grip(ln.u + du, g, F3(k, ln.u + du, g, ln.core).addScaledVector(n, 0.08), n, along, T, false, true);
    };
    if (R.part === 'leg') { // the leg's battens: two grips each, either side of its middle; blazes on its side; then its bracket
      for (let g = BATTEN0; g < BK_G0; g += BATTEN) for (const du of [-0.15, 0.15]) grip(faceD(g) + du, g, F3(k, faceD(g) + du, g, LEG_S), N, UP, T, true, false);
      for (let g = BK_G0; g <= BK_TOP; g += 0.25) bracketGrips(g, routeLine(k, g));
      for (let g = BATTEN0 + 3 * BATTEN; g < BK_G0 - 0.5; g += 3 * BATTEN) { // (blazes: every third batten painted, and a band round the edges at it)
        beam(onFace(k, faceD(g) - LEG_S, g, LEG_S), onFace(k, faceD(g) + LEG_S, g, LEG_S), 0.075, R.color);
        for (const s of [-1, 1]) slab(F3(k, faceD(g) + s * LEG_S, g + 0.12, LEG_S), T, UP, [0.14, 0.22, 0.14], R.color);
      }
    } else {
      for (let g = BAYS[0] + 0.15; g < H + 0.4; g += 0.25) { // along its brace (dense: a hand can close anywhere on it), then under the bracket
        if (inS(g, holes)) continue;
        const ln = routeLine(k, g);
        if (ln.part === 'bracket') { if (g <= BK_TOP) bracketGrips(g, ln); continue; }
        if (ln.part === 'leg') { // over the top bay, up its leg's battens to the catwalk
          const gb = BATTEN0 + Math.round((g - BATTEN0) / BATTEN) * BATTEN;
          if (Math.abs(gb - g) < 0.125) for (const du of [-0.15, 0.15]) grip(ln.u + du, gb, F3(k, ln.u + du, gb, LEG_S), N, UP, T, true, false);
          continue;
        }
        const c = F3(k, ln.u, g, 0), along = F3(k, routeLine(k, g + 0.05).u, g + 0.05, 0).sub(c).normalize();
        const s = UP.clone().addScaledVector(along, -UP.dot(along)).normalize(); // (the brace's up: square to it, in the face)
        grip(ln.u, g, c.clone().addScaledVector(s, BR_F).addScaledVector(N, BR_F), N, s, along, false, false);
      }
      // blazes: a painted band round its brace every 1.5 m (the stripe up it is drawn with the brace), not in a hole
      for (let g = 2.2; g < BK_G0; g += 1.5) {
        if (inS(g, holes) || inS(g + 0.4, holes)) continue;
        const a = routeLine(k, g), c2 = routeLine(k, g + 0.4);
        if (a.part !== 'brace' || c2.part !== 'brace') continue;
        beam(onFace(k, a.u, g, 0), onFace(k, c2.u, g + 0.4, 0), BR + 0.07, R.color);
      }
    }
    HOLDS[k].sort((a, c) => a.h - c.h);
  });
  // the ladder up the middle of its face, rungs every 0.4 m, rails either side, standing out from the face on struts and rising
  // nearly straight up to just outside the catwalk's rim, its rails going on past the planks as handles, bent over to the gate
  for (let n = 0; n < LADDER_RUNGS; n++) { const h = RUNG0 + n * RUNG_STEP, p = onFace(LADDER_FACE, 0, h, ladderOut(h)); b.add(GEO.cyl6, dark, { x: p[0], y: h, z: p[2], sx: RUNG_R, sy: 0.7, sz: RUNG_R, rz: Math.PI / 2, ry: -faceC(LADDER_FACE) + Math.PI / 2 }); }
  for (const s of [-0.36, 0.36]) {
    beam(onFace(LADDER_FACE, s, 0, ladderOut(0)), onFace(LADDER_FACE, s, H + 1.15, ladderOut(H + 1.15)), 0.07, dark);
    for (const y of [H - 0.07, H + 1.1]) beam(onFace(LADDER_FACE, s, y, ladderOut(y)), onFace(LADDER_FACE, s * 1.5, y, ladderOut(y) - 0.45), 0.06, dark); // (the goosenecks to the rim)
  }
  b.add(GEO.box, dark, { ...(q => ({ x: q[0], z: q[2] }))(onFace(LADDER_FACE, 0, 0, ladderOut(0))), y: 0.06, sx: 1.1, sy: 0.12, sz: 1.1, ry: -faceC(LADDER_FACE) + Math.PI / 2 }); // (its foot's pad)
  { // the struts holding it out from the face: at each brace ring and where each bay's braces cross, a pair straight out and a knee under
    const ties = [...LEVELS];
    for (let n = 0; n < BAYS.length - 1; n++) { const d0 = faceD(BAYS[n]), d1 = faceD(BAYS[n + 1]); ties.push(BAYS[n] + (BAYS[n + 1] - BAYS[n]) * d0 / (d0 + d1)); }
    for (const h of ties) for (const s of [-0.36, 0.36]) {
      beam(onFace(LADDER_FACE, s, h, 0.1), onFace(LADDER_FACE, s, h, ladderOut(h)), 0.08, dark);
      beam(onFace(LADDER_FACE, s, h - 1.3, 0.1), onFace(LADDER_FACE, s, h - 0.02, ladderOut(h) - 0.06), 0.06, dark);
    }
  }
  // the catwalk: a ring of planks with a railing, at the top of the legs; a gate in the rail where each way up comes over the rim
  b.add(new THREE.RingGeometry(R1 - 0.8, CAT_R, 48).rotateX(-Math.PI / 2), '#b98a5a', { y: H });
  b.add(new THREE.RingGeometry(R1 - 0.8, CAT_R, 48).rotateX(Math.PI / 2), '#8a6240', { y: H - 0.14 });
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; b.add(GEO.box, '#8a6240', { x: Math.cos(a) * (TANK_R + CAT_R) / 2, y: H + 0.004, z: Math.sin(a) * (TANK_R + CAT_R) / 2, sx: CAT_R - TANK_R, sy: 0.01, sz: 0.035, ry: -a }); } // (the planks' joins)
  // where each route comes up over the rim (the angle round the tower of your body at its top): its gate
  const GATE = ROUTES.map((R, k) => { const p = onFace(k, routeU(k, topOf(k)), topOf(k), bodyOut(k, topOf(k))); return Math.atan2(p[2], p[0]); });
  const GATE_W = 0.6; // (half its width, m)
  // a railing round a circle of radius rr at height y0: posts, a top and a middle rail, broken by gates (each a hinged pair of bars in
  // a colour, swinging up as someone comes through); returns the gates' hinges
  function railing(rr, y0, gates, nPosts) {
    const posts = [];
    for (let i = 0; i < nPosts; i++) { const a = i / nPosts * Math.PI * 2; if (gates.every(g => Math.abs(angDiff(a, g.a)) * rr > GATE_W + 0.3)) posts.push(a); }
    for (const g of gates) posts.push(g.a - GATE_W / rr, g.a + GATE_W / rr);
    posts.sort((p, q) => ((p % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - ((q % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i], a1 = posts[(i + 1) % posts.length] + (i === posts.length - 1 ? Math.PI * 2 : 0);
      b.add(GEO.box, dark, { x: Math.cos(a) * rr, y: y0 + 0.54, z: Math.sin(a) * rr, sx: 0.07, sy: 1.12, sz: 0.07 }); // (2 cm down into the walk: standing on it, their feet were level with the planks' joins' undersides)
      const mid = (a + a1) / 2;
      if (gates.some(g => Math.abs(angDiff(mid, g.a)) * rr < GATE_W - 0.05)) continue;
      for (const ry of [0.55, 1.05]) b.add(GEO.box, dark, { x: Math.cos(mid) * rr, y: y0 + ry, z: Math.sin(mid) * rr, sx: 0.07, sy: 0.07, sz: 2 * rr * Math.sin((a1 - a) / 2) + 0.05, ry: -mid });
    }
    return gates.map(g => { // the gate: a boom hinged on one post, its bars along the gap, lifting up to open
      const hinge = new THREE.Group(), a0 = g.a - GATE_W / rr;
      hinge.position.set(Math.cos(a0) * rr, y0, Math.sin(a0) * rr); hinge.rotation.y = -(g.a + Math.PI / 2); // (local x along the gap)
      const boom = new THREE.Group(); hinge.add(boom);
      const len = 2 * rr * Math.sin(GATE_W / rr), mat = toon(g.color);
      for (const ry of [0.55, 1.05]) { const bar = new THREE.Mesh(GEO.box, mat); bar.scale.set(len - 0.08, 0.075, 0.075); bar.position.set(len / 2, ry, 0); boom.add(bar); }
      const latch = new THREE.Mesh(GEO.box, toon(dark)); latch.scale.set(0.05, 0.6, 0.05); latch.position.set(len - 0.06, 0.8, 0); boom.add(latch);
      group.add(hinge);
      return { a: g.a, boom, open: 0, want: 0 };
    });
  }
  const gates = railing(CAT_R, H, GATE.map((a, k) => ({ a, color: ROUTES[k].color })), 40);
  // the tank, its bands, the roof (a cone cut off flat), the deck on top round the beacon's mast with its own rail, and the ladder up
  // from the catwalk: up the tank's side on standoffs (TLA: a little round from the ladder's gate), over the eave and up the roof
  b.add(GEO.cyl12, '#c9cfd4', { y: H + TANK_H / 2, sx: TANK_R, sy: TANK_H, sz: TANK_R });
  for (const hh of [0.5, TANK_H * 0.5, TANK_H - 0.5]) b.add(new THREE.TorusGeometry(TANK_R + 0.06, 0.14, 6, 40).rotateX(Math.PI / 2), dark, { y: H + hh });
  b.add(new THREE.CylinderGeometry(RT, RE, ROOF_H, 24), '#8a3b34', { y: Y_E + ROOF_H / 2 });
  b.add(new THREE.CylinderGeometry(RD, RD, 0.14, 24), '#b98a5a', { y: Y_T + 0.08 }); // (its underside a centimetre up inside the dark rim's: level with it, the two flickered from below)
  b.add(new THREE.CylinderGeometry(RD + 0.02, RD + 0.02, 0.06, 24), dark, { y: Y_T + 0.03 });
  b.add(GEO.cyl8, dark, { y: DECK_Y + 1.3, sx: MAST_R, sy: 2.6, sz: MAST_R });
  const deckGate = railing(RD, DECK_Y, [{ a: TLA, color: ROUTES[0].color }], 14)[0];
  const TA = (r, y, lat) => [Math.cos(TLA) * r + Math.sin(TLA) * lat, y, Math.sin(TLA) * r - Math.cos(TLA) * lat]; // (on the tank's ladder: r from the axis, lat to its right)
  for (const s of [-0.36, 0.36]) {
    beam(TA(TL_R, H, s), TA(TL_R, CORNER, s), 0.07, dark);
    beam(TA(TL_R, CORNER, s), TA(slopeR(Y_T), Y_T + 0.15, s), 0.07, dark);
    beam(TA(slopeR(Y_T) + 0.06, Y_T + 0.1, s), TA(slopeR(Y_T) + 0.06, DECK_Y + 1.0, s), 0.06, dark); // (the handles up past the deck's edge)
    for (let y = H + 1.2; y < Y_E - 0.3; y += 2.2) beam(TA(TANK_R - 0.05, y, s), TA(TL_R, y, s), 0.06, dark); // (the standoffs)
    for (let y = Y_E + 0.9; y < Y_T - 0.3; y += 1.3) beam(TA(roofSurfR(y) - 0.05, y, s), TA(slopeR(y), y, s), 0.05, dark);
  }
  for (const q of ROOF_RUNG) { const p = TA(q.r, q.y, 0); b.add(GEO.cyl6, dark, { x: p[0], y: q.y, z: p[2], sx: RUNG_R, sy: 0.7, sz: RUNG_R, rz: Math.PI / 2, ry: -TLA + Math.PI / 2 }); }
  { // the green light's lamp at the ladder's foot: a squat dark housing, its lens glowing up the ladder (fire-season: a source you see)
    const p = onFace(LADDER_FACE, 0, 0, ladderOut(0) + ARM_LEN);
    b.add(GEO.cyl12, dark, { x: p[0], y: 0.11, z: p[2], sx: 0.46, sy: 0.22, sz: 0.46 });
    b.add(GEO.cyl12, lampGlow('#7dffa8'), { x: p[0], y: 0.23, z: p[2], sx: 0.36, sy: 0.03, sz: 0.36 });
  }
  b.build(group, 'water-tower');
  const beacon = new THREE.Mesh(GEO.sphere, lampGlow('#ff3b3b')); beacon.scale.setScalar(0.4); beacon.position.set(0, DECK_Y + 2.85, 0); group.add(beacon);
  addNightSpot({ x: cx, y: gy + DECK_Y + 2.85, z: cz, color: '#ff4a4a', pool: 0, halo: 2.4 });
  // the name painted round the tank, twice: curved onto the tank between its bands, each facing a way people come (layout
  // WATER_TOWER.boards; the roof ladder runs up over the first like a real tower's). Two never overlap: pushed apart if close.
  const ARC = 11 / TANK_R, nameTex = signTexture(['BRENELAND'], { bg: '#c9cfd4', fg: '#2f3b4c', w: 512, h: 128 });
  const boardAt = (WATER_TOWER.boards || [{ x: cx + 1, z: cz + 1 }, { x: cx - 1, z: cz + 1 }]).map(p => Math.atan2(p.z - cz, p.x - cx));
  if (boardAt.length === 2) { const d = Math.atan2(Math.sin(boardAt[1] - boardAt[0]), Math.cos(boardAt[1] - boardAt[0])), push = Math.max(0, ARC + 0.12 - Math.abs(d)) / 2 * Math.sign(d || 1); boardAt[0] -= push; boardAt[1] += push; }
  for (const a of boardAt) { // (three's cylinder: x = sin(theta), z = cos(theta), so theta = PI/2 - a; u runs left to right seen from outside)
    const geo = new THREE.CylinderGeometry(TANK_R + 0.04, TANK_R + 0.04, 3.2, 24, 1, true, Math.PI / 2 - a - ARC / 2, ARC);
    const sign = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: nameTex, fog: true })); sign.position.y = H + 8; group.add(sign);
    sign.userData.paintedOn = true; // (painted on the tank: the tower's own ladders over it are no post in front of a sign, tools/signs-audit.mjs)
  }
  // at each route's foot: a lamp in the route's colour and a sign with its name, between it and the face's middle (a
  // route starts where its steel does, the leg or the brace's foot); the ladder's lamp throws a green light up it
  const routeLamps = [];
  // where each route starts: its line at your hands as you grab on (the ladder in the middle)
  const footU = k => (k === LADDER_FACE ? 0 : routeLine(k, 0.6 + REACH).u);
  // the ladder's foot stands a metre out from its face, so its lamp, sign and E sit that much further out: FOOT_OUT
  const FOOT_OUT = k => (k === LADDER_FACE ? ladderOut(0) - 0.5 : 0);
  const footProps = k => { const u0 = footU(k), d = k === LADDER_FACE ? 1 : -Math.sign(u0) || 1; return { lampU: k === LADDER_FACE ? 1.8 : u0 + d * 1.5, signU: k === LADDER_FACE ? -1.9 : u0 + d * 3.4, out: FOOT_OUT(k) }; };
  ROUTES.forEach((R, k) => {
    const fp = footProps(k), p = onFace(k, fp.lampU, 0, 1.6 + fp.out), lamp = new THREE.Mesh(GEO.sphere, lampGlow(R.color)); lamp.scale.setScalar(0.32); lamp.position.set(p[0], 1.1, p[2]); group.add(lamp);
    const post = new THREE.Mesh(GEO.cyl6, toon(dark)); post.scale.set(0.07, 1.0, 0.07); post.position.set(p[0], 0.5, p[2]); group.add(post);
    addNightSpot({ x: cx + p[0], y: gy + 1.1, z: cz + p[2], color: R.color, pool: 3, halo: 0.8 });
    const s = onFace(k, fp.signU, 0, 1.8 + fp.out), sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: signTexture([R.level.toUpperCase(), R.name.replace('The ', '')], { bg: '#2f3b4c', fg: R.color, w: 256, h: 96 }), fog: true }));
    sign.position.set(s[0], 1.5, s[2]); sign.rotation.y = -faceC(k) + Math.PI / 2; group.add(sign);
    routeLamps.push(lamp);
  });
  const CONE_OP = 0.16; let ladderCone;
  { // the green light up the ladder: a soft cone of light from its foot (never inked, never shadowed)
    const p = onFace(LADDER_FACE, 0, 0, ladderOut(0) + ARM_LEN);
    const coneMat = new THREE.MeshBasicMaterial({ color: '#7dffa8', transparent: true, opacity: CONE_OP, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
    const cone = ladderCone = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.3, 14, 16, 1, true), coneMat);
    cone.position.set(p[0], 7, p[2]); cone.layers.set(2); group.add(cone);
    const glow = new THREE.PointLight('#5dff8f', 6, 18, 1.6); glow.position.set(p[0], 0.6, p[2]); group.add(glow); // (just over its lamp's lens)
  }
  // chalk bags on some rests' deck plates (yellow's before its long stretch, orange's first, red's before the overhang) and one on
  // the catwalk by the rail (walk over it)
  const chalks = [];
  for (const [k, li] of [[1, 0], [2, 1], [3, 3]]) {
    const h = LEVELS[li], ln = routeLine(k, h + REACH), u = ln.u - Math.sign(ln.u) * 0.7, p = onFace(k, u, h, ln.out + 0.5);
    chalks.push(Object.assign(makeChalk(p, h, k), { u }));
  }
  chalks.push(makeChalk([Math.cos(Math.PI * 1.5) * (CAT_R - 0.9), H, Math.sin(Math.PI * 1.5) * (CAT_R - 0.9)], H, -1, Math.PI * 1.5));
  function makeChalk(p, h, k, th = null) {
    const m = new THREE.Group();
    const bag = new THREE.Mesh(GEO.sphere, toon('#f4f2ea')); bag.scale.set(0.2, 0.26, 0.2); bag.position.y = 0.26; m.add(bag);
    const cord = new THREE.Mesh(GEO.cyl6, toon('#5a3a22')); cord.scale.set(0.025, 0.36, 0.025); cord.position.y = 0.52; m.add(cord);
    m.position.set(p[0], h + (k < 0 ? 0.1 : -0.06), p[2]); group.add(m); // (on a deck plate, whose top is 5 cm under its level)
    return { h, k, th, m, gone: 0 };
  }
  shadows(group);
  // ---- first-person hands that hold on. Each hand holds a real thing in the world: a rung (the ladder, the roof ladder), the
  // route's steel (a batten, a brace, the bracket's underside), the ledge you rest on, the catwalk's top rail. It reaches for it
  // open, closes on it (wrapped over and round a bar with the thumb under, curled over a hold's top with the palm to the steel,
  // flat on a ledge, strained and slipping now and then on a wet hold) and stays fixed to it in the world while your body pulls up
  // past it, so it moves down the view exactly as the rung does. Out of reach it lets go and reaches for the next, the two hands
  // taking turns (GRIP_LO..GRIP_HI over your feet). A lunge throws both up open and slaps them onto the first holds past the gap.
  // The game's PEAK-style hands (bodies-hands.js) with the tower's own wrap and strain shapes, on your sleeve's forearm, which
  // comes up from a shoulder point fixed to the camera below the bottom corners of the view.
  const skin = player.character?.opts?.skin || '#e3ae8b';
  const sleeveCol = player.profile?.color || '#d9534f';
  // (they ride on the camera: each frame their world places are turned into the camera's frame, so a hand on a rung stays on it.
  // Hung in the scene they'd go undrawn now and then, the yard's per-frame matrix and merge passes being meant for it)
  const hands = new THREE.Group(); hands.name = 'tower-hands'; hands.visible = false; camera.add(hands);
  if (!scene.children.includes(camera)) scene.add(camera);
  // (tower-hands) only your hands and the lower half of each forearm: a sleeve of its own length from the wrist toward your
  // shoulder, fading out past mid-forearm (FORE_SOLID solid, then FORE_FADE to nothing), never stretched to reach a hold
  const ARM = new THREE.CylinderGeometry(FORE_R1, FORE_R0, FORE_LEN, 10, 6).translate(0, FORE_LEN / 2, 0); // (y 0 at the wrist, up the forearm)
  const sleeveMat = toon(sleeveCol), foreMat = forearmMaterial(sleeveMat);
  const PALM_AT = bs => [-bs * 0.035 * 1.45, -0.08 * 1.45, 0.003 * 1.45]; // (bodies-ik handPoint 'palm': the palm's surface, for a hand laid flat)
  const mkGrip = () => ({ kind: null, ref: null, p: new THREE.Vector3(), q: new THREE.Quaternion(), shape: 'wrap', anchor: 'wrap', slick: false, h: 0, u: 0, n: 0, phi: 0 });
  const mkHand = side => {
    const bs = -side; // (bodies-hands: side +1 is the left hand)
    const wrist = new THREE.Group(); wrist.scale.setScalar(FP_SCALE); hands.add(wrist);
    const hb = buildHand(wrist, bs, skin, 1, 1, ['wrap', 'strain']);
    const arm = new THREE.Mesh(ARM, foreMat), cuff = new THREE.Mesh(GEO.cyl8, sleeveMat); hands.add(arm, cuff);
    arm.renderOrder = 1; // (after the hands: it is see-through where it fades)
    return { side, bs, wrist, hb, arm, cuff, wp: new THREE.Vector3(), wq: new THREE.Quaternion(), g: mkGrip(), spare: mkGrip(), from: { p: new THREE.Vector3(), q: new THREE.Quaternion() },
      cur: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, t: 1, dur: 0.2, slip: 0, slipT: 1.5, wrapA: wrapAt(bs), palmA: PALM_AT(bs) };
  };
  const handL = mkHand(-1), handR = mkHand(1), HANDS = [handL, handR];
  hands.traverse(o => { if (o.isMesh) o.userData.noMerge = true; }); // (never baked into prop-merge's still props)

  // ---- HUD: the grip bar at the bottom middle, a quiet strip for climbing messages, the first climb's card, a ghost ring where the
  // climb stick is on a phone, the summit banner. While you climb the yard's HUD steps aside (css: #hud.tw-climb keeps chat and the
  // minimap); in "Take in the view" everything goes (#hud.tw-view). On a phone: no grip button (you hang on by yourself), one big
  // button for the move of the moment where the jump is (Lunge at a gap, Jump at the top), shown only when it does something, a
  // small Let go up the right side, out of the thumb's way. The E steps aside while you're on the steel.
  const hud = el('div', 'tower-hud', '', { hidden: '' });
  const bar = el('div', 'tower-bar'), barFill = el('div', 'tower-bar-fill'), barChalk = el('div', 'tower-bar-chalk'), barTxt = el('div', 'tower-bar-txt', '');
  bar.append(barFill, barChalk, barTxt);
  const route = el('div', 'tower-route', '');
  const strip = el('div', 'tower-strip', '');
  const tips = el('div', 'tower-tips', '');
  const card = el('div', 'tower-card', '', { hidden: '' });
  const btns = el('div', 'tower-btns');
  const bMove = el('button', 'btn tower-btn move', 'Lunge'), bLetGo = el('button', 'btn tower-btn letgo', 'Let go');
  bMove.type = bLetGo.type = 'button';
  btns.append(bMove); // (hud-loose: Let go is a HUD item of its own, a child of #hud: --letgo-*, shown with the touch buttons, .on)
  const banner = el('div', 'tower-banner', '', { hidden: '' });
  hud.append(route, bar, tips);
  // (the strip and the buttons sit outside the HUD box: its transform would make their fixed places relative to it, so lifting the
  // bar clear of the buttons would lift the buttons with it)
  ctx.hud.append(hud, btns, bLetGo, banner, strip, card);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  btns.hidden = true;
  const showHud = on => { hud.hidden = !on; btns.hidden = !on || !touch; bLetGo.classList.toggle('on', on && touch); if (!on) { card.hidden = true; ctx.hud.classList.remove('tw-steel'); } };
  let stripT = 0;
  const say = (text, secs = 3) => { strip.textContent = text; strip.classList.add('on'); stripT = secs; placeStrip(); }; // (climbing messages: the quiet strip, not a toast)
  const hudMode = m => { ctx.hud.classList.toggle('tw-climb', m === 'climb' || m === 'view'); ctx.hud.classList.toggle('tw-view', m === 'view'); };
  // the words for this device: what climbs, lunges, lets go (a pad's glyphs, the phone's buttons, the keys)
  const dev = () => (input.lastDevice === 'pad' ? 'pad' : touch || input.lastDevice === 'touch' ? 'touch' : 'kbm');
  const padBtn = i => input.pad?.btnName?.(i) || ['A', 'B', 'X', 'Y'][i];
  const words = () => {
    const d = dev();
    if (d === 'pad') return { climb: 'Left stick: climb', lunge: `${padBtn(0)} lunges`, letgo: `${padBtn(1)} lets go`, lungeNow: `Lunge across: ${padBtn(0)}!`, jump: `${padBtn(0)} jumps off`, view: `${padBtn(1)} takes in the view` };
    if (d === 'touch') return { climb: 'Push the stick up to climb', lunge: 'Lunge shows up at a gap', letgo: 'Let go is up the right side', lungeNow: 'Tap Lunge!', jump: 'Jump when you are ready', view: 'E takes in the view' };
    return { climb: 'W climbs, S goes down', lunge: 'Space lunges a gap', letgo: 'E lets go', lungeNow: 'Lunge across: Space!', jump: 'Space jumps off', view: 'E takes in the view' };
  };
  // the first climb (once on this device, or once a visit when it cannot remember): the three things that matter, on a card
  let taught = false;
  try { taught = localStorage.getItem('breneland.towerTaught') === '1'; } catch { /* (private window: once a visit) */ }
  let cardT = 0;
  function teach() {
    const w = words();
    card.replaceChildren(el('div', 'tc-title', `${R().name}  ·  ${R().level}`),
      el('div', 'tc-line', `${w.climb}. You hang on by yourself.`), el('div', 'tc-line', 'Rest on the ledges: your grip fills up again.'),
      el('div', 'tc-line', `${w.lunge}. ${w.letgo}.`));
    card.style.setProperty('--route', R().color); card.hidden = false; cardT = 7;
    taught = true; try { localStorage.setItem('breneland.towerTaught', '1'); } catch { /* fine */ }
  }
  // the climb's HUD keeps clear of what shares the screen with it, wherever the device's layout (or Andrew's saved one) put
  // those: the grip bar and the route's name rise above the chat field, the mic, the E, GRIP and Lunge and the resting climb
  // stick; the quiet strip drops below the minimap, the time and the help button when it would run under them
  const boxHit = (a, r) => r.width > 0 && r.height > 0 && a.left < r.right - 1 && a.right > r.left + 1 && a.top < r.bottom - 1 && a.bottom > r.top + 1;
  const KEEP_CLEAR = ['#chat-form', '#mic-toggle', '#btn-act', '#btn-jump', '#joystick'], STRIP_CLEAR = ['#minimap', '#btn-help', '#hud-time', '#hud-wx'];
  let hudDirty = true;
  addEventListener('resize', () => { hudDirty = true; });
  function placeHud() {
    hudDirty = false;
    if (hud.hidden) return;
    hud.style.bottom = '';
    const base = parseFloat(getComputedStyle(hud).bottom) || 0, els = KEEP_CLEAR.map(q => document.querySelector(q)).concat([bMove, bLetGo]);
    let lift = 0;
    for (let pass = 0; pass < 8; pass++) { // (rising past one control can meet the next)
      const a = hud.getBoundingClientRect(); let need = 0;
      for (const e of els) if (e) { const r = e.getBoundingClientRect(); if (boxHit(a, r)) need = Math.max(need, a.bottom - r.top + 8); }
      if (!need) break;
      lift += need; hud.style.bottom = `${base + lift}px`;
    }
    placeStrip();
  }
  function placeStrip() {
    strip.style.top = '';
    if (!strip.textContent) return;
    const a = strip.getBoundingClientRect(); let top = 0;
    for (const q of STRIP_CLEAR) { const e = document.querySelector(q); if (!e) continue; const r = e.getBoundingClientRect(); if (boxHit(a, r)) top = Math.max(top, r.bottom + 8); }
    if (top) strip.style.top = `${top}px`;
  }

  // ---- sounds
  audio.registerSfx?.('grab', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; a.burst(o, { t, dur: 0.04, f: 1400, Q: 2, peak: 0.16 }); a.tone(o, { f: 260, glide: 200, t, d: 0.09, peak: 0.05 }); });
  audio.registerSfx?.('rung', (a, x, y, z) => { const o = a.at(x, y, z, 3); a.tone(o, { f: 420, glide: 300, d: 0.07, peak: 0.07, type: 'triangle' }); });
  audio.registerSfx?.('slip', (a, x, y, z) => { const o = a.at(x, y, z, 4); a.burst(o, { dur: 0.35, f: 900, sweep: 300, Q: 1, peak: 0.16 }); });
  audio.registerSfx?.('thump', (a, x, y, z) => { const o = a.at(x, y, z, 6); const t = a.ctx.currentTime; a.tone(o, { f: 90, glide: 40, t, d: 0.35, peak: 0.25 }); a.burst(o, { t, dur: 0.25, f: 300, Q: 0.6, peak: 0.2, brown: true }); });
  audio.registerSfx?.('boing', (a, x, y, z) => { const o = a.at(x, y, z, 6); const t = a.ctx.currentTime; a.tone(o, { f: 150, glide: 420, t, d: 0.22, peak: 0.12, type: 'triangle' }); a.burst(o, { t, dur: 0.12, f: 300, Q: 0.6, peak: 0.1, brown: true }); });
  audio.registerSfx?.('heart', (a) => { const o = a.gain(1); o.connect(a.sfx); const t = a.ctx.currentTime; a.tone(o, { f: 60, t, d: 0.12, peak: 0.12 }); a.tone(o, { f: 55, t: t + 0.18, d: 0.14, peak: 0.1 }); });
  audio.registerSfx?.('chalk', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; a.burst(o, { t, dur: 0.3, f: 2600, Q: 0.5, peak: 0.1 }); a.tone(o, { f: 880, t: t + 0.05, d: 0.3, peak: 0.06, verb: 0.4 }); });
  audio.registerSfx?.('fanfare', (a, x, y, z) => { const o = a.at(x, y, z, 6); const t = a.ctx.currentTime; [0, 4, 7, 12, 7, 12].forEach((n, i) => a.tone(o, { f: 392 * Math.pow(2, n / 12), t: t + i * 0.11, d: 0.4, peak: 0.08, verb: 0.4, type: 'triangle' })); });
  audio.registerSfx?.('pop', (a, x, y, z) => { const o = a.at(x, y, z, 30); const t = a.ctx.currentTime; a.burst(o, { t, dur: 0.5, f: 700, sweep: 200, Q: 0.5, peak: 0.22, brown: true }); for (let i = 0; i < 6; i++) a.burst(o, { t: t + 0.15 + i * 0.07, dur: 0.05, f: 3000 + i * 200, Q: 3, peak: 0.05 }); });
  audio.registerSfx?.('shutter', (a) => { const o = a.gain(1); o.connect(a.sfx); const t = a.ctx.currentTime; a.burst(o, { t, dur: 0.03, f: 3200, Q: 2, peak: 0.12 }); a.burst(o, { t: t + 0.07, dur: 0.04, f: 2200, Q: 2, peak: 0.1 }); });

  // ---- the firework at the summit: a shell up from the roof, a burst of sparks that fall and fade (seen by you; others see the
  // banner's player standing on top and hear the pop)
  const SPARKS = 160, sparkPos = new Float32Array(SPARKS * 3), sparkVel = new Float32Array(SPARKS * 3), sparkCol = new Float32Array(SPARKS * 3);
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3)); sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sparks.visible = false; sparks.frustumCulled = false; sparks.layers.set(2); group.add(sparks);
  const fw = { t: -1 };
  function firework() {
    const top = H + TANK_H + ROOF_H + 10, palette = ROUTES.map(r => new THREE.Color(r.color)).concat([new THREE.Color('#ffffff'), new THREE.Color('#9b51e0')]);
    for (let i = 0; i < SPARKS; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = 9 + Math.random() * 4, r = Math.sqrt(1 - u * u);
      sparkPos.set([0, top, 0], i * 3); sparkVel.set([Math.cos(a) * r * s, u * s, Math.sin(a) * r * s], i * 3);
      const c = palette[i % palette.length]; sparkCol.set([c.r, c.g, c.b], i * 3);
    }
    sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
    sparks.visible = true; sparks.material.opacity = 1; fw.t = 0;
    audio.play?.('pop', cx, gy + top, cz);
  }
  function stepFirework(dt) {
    if (fw.t < 0) return;
    fw.t += dt;
    for (let i = 0; i < SPARKS; i++) { sparkVel[i * 3 + 1] -= 6 * dt; for (let j = 0; j < 3; j++) { sparkVel[i * 3 + j] *= 1 - dt * 0.9; sparkPos[i * 3 + j] += sparkVel[i * 3 + j] * dt; } }
    sparkGeo.attributes.position.needsUpdate = true;
    sparks.material.opacity = Math.max(0, 1 - fw.t / 2.8);
    if (fw.t > 2.8) { sparks.visible = false; fw.t = -1; }
  }

  // ---- the climb
  // modes: 'climb' (up a route), 'roof' (the tank's ladder and the roof's), 'catwalk' and 'peak' (walking), 'tween' (a
  // short carried move: over the rim through a gate, onto a ladder), 'fall', 'fly'
  const S = { on: false, mode: 'climb', face: 0, u: 0, theta: 0, h: 0, stam: STAM.max, look: { yaw: 0, pitch: 0.2 }, reach: 0, lastReach: 0, fall: null, fly: null, daze: 0, lunge: 0, lowBeat: 0,
    summitDone: false, view: false, chalkT: 0, t0: 0, said: {}, photo: null, up: 0, outE: null,
    resting: false, restK: 0, camYaw: null, lat: 0.2, fov0: 55, mv: { x: 0, y: 0 }, wasLunge: false, topK: 0,
    wx: 0, wz: 0, wv: { x: 0, z: 0 }, yaw: 0, speed: 0, tween: null, hop: null, lastCam: '' };
  // (no grip input: you hang on by yourself until the grip bar runs out or you let go)
  const R = () => ROUTES[S.face];
  const onLadder = () => S.mode === 'climb' && S.face === LADDER_FACE;
  const isWalk = () => S.mode === 'catwalk' || S.mode === 'peak';
  const restLevel = () => (S.mode === 'climb' ? R().rests.find(li => Math.abs(S.h - LEVELS[li]) < 0.5) : undefined);
  const resting = up => S.mode === 'climb' && restLevel() !== undefined && Math.abs(up) < 0.2;
  function angDiff(a, b2) { let d = a - b2; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  // a gap just above you (or you under it): the lunge has something to do
  const gapNear = () => (S.mode === 'climb' ? R().gaps.find(([a, b2]) => S.h > a - 1.2 && S.h < b2) || null : null);
  // where you walk up there: a ring between the tank (or the mast) and the rail, the tank ladder's two rails standing on
  // it; your body's middle stays BODY_R inside each (tower frame, metres)
  const BODY_R = 0.38;
  const SURF = { catwalk: { y: H, rIn: TANK_R + 0.22 + BODY_R, rOut: CAT_R - 0.05 - BODY_R }, peak: { y: DECK_Y, rIn: MAST_R + 0.08 + BODY_R, rOut: RD - 0.05 - BODY_R } };
  const TL_FOOT = [-0.36, 0.36].map(s => TA(TL_R, 0, s));
  const tw = (r, a, y, out = new THREE.Vector3()) => out.set(cx + Math.cos(a) * r, gy + y, cz + Math.sin(a) * r); // (a point round the tower, world)
  const GATE_IN = CAT_R - 0.75, DECK_IN = RD - 0.95; // (where you stand inside a gate)

  function worldPos(out = new THREE.Vector3()) {
    if (isWalk()) return out.set(cx + S.wx, gy + SURF[S.mode].y, cz + S.wz);
    if (S.mode === 'tween') return out.copy(S.tween.p);
    if (S.mode === 'roof') return tw(roofBody(S.h).r, TLA, S.h, out);
    const p = onFace(S.face, S.u, S.h, S.outE ?? bodyOut(S.face, S.h));
    return out.set(cx + p[0], gy + S.h, cz + p[2]);
  }
  // your eye from your feet in first person: over them; on the roof's slope leaning in over its rungs
  function eyeOff(out) {
    if (S.mode === 'tween') return out.lerpVectors(S.tween.e0, S.tween.e1, S.tween.k);
    if (S.mode === 'roof') { const l = roofBody(S.h).lean; return out.set(-Math.cos(TLA) * 0.5 * l, EYE - 0.3 * l, -Math.sin(TLA) * 0.5 * l); }
    return out.set(0, EYE, 0);
  }
  const P = new THREE.Vector3(), _eo = new THREE.Vector3();
  // the way you face: the steel on a face or a ladder; walking, the way you walk
  const facing = () => (isWalk() ? S.yaw : S.mode === 'tween' ? S.tween.yaw : S.mode === 'roof' ? faceAxis(TLA) : faceAxis(faceC(S.face)));
  // the ground a fall or a jump comes down on: the ground you walk on, or the top of a leg's concrete footing pad (never inside it)
  const PADS = [0, 1, 2, 3].map(i => ({ x: cx + Math.cos(legAngle(i)) * R0, z: cz + Math.sin(legAngle(i)) * R0 }));
  const PAD_TOP = gy + 0.9, PAD_HALF = 1.1;
  function groundAt(x, z) {
    let g = groundHeight(x, z);
    for (const p of PADS) if (Math.abs(x - p.x) < PAD_HALF && Math.abs(z - p.z) < PAD_HALF) g = Math.max(g, PAD_TOP);
    return g;
  }
  // a place to get control back: off a footing pad (its collider would shove you), out from the tower
  function offPad(x, z) {
    for (const p of PADS) {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.9) { const ax = (d > 0.05 ? dx / d : x - cx), az = (d > 0.05 ? dz / d : z - cz), l = Math.hypot(ax, az) || 1; return { x: p.x + ax / l * 1.9, z: p.z + az / l * 1.9 }; }
    }
    return { x, z };
  }

  function start(face) {
    S.on = true; S.mode = 'climb'; S.face = face; S.h = 0.6; S.u = routeU(face, S.h); S.outE = null; S.stam = Math.max(S.stam, 40); S.look = { yaw: 0, pitch: 0.35 }; S.fall = null; S.fly = null; S.view = false;
    S.chalkT = 0; S.summitDone = false; S.t0 = performance.now() / 1000; S.said = {}; S.photo = null; S.tween = null; S.hop = null;
    S.restK = 0; S.camYaw = null; S.fov0 = camera.fov; S.wasLunge = false; S.topK = 0; S.lunge = 0; S.lastCam = '';
    player.character.root.visible = false; hands.visible = true; showHud(true); hudMode('climb'); hudDirty = true;
    audio.play?.('grab', cx, gy + 1, cz);
    ui.hint(null);
    routeLabel();
    // the first climb: the three things that matter, on a card; after that the route in a line, and the strip speaks when something
    // new comes up (a missing brace above, wet steel, the overhang, a rest, the top)
    if (!taught) teach(); else say(`${R().name}: ${R().about}.`, 4.5);
    player.takeover = {
      anim: 'climb', minigame: 'tower',   // (minigame: the yard's music keeps out, music.js)
      speed: undefined,                   // (walking round the top: how fast, so your legs walk; player.js)
      update(dt, now, inp, pl) { step(dt, now, inp, pl); },
      camera(dt, cam, inp, now) { return placeCamera(dt, cam, inp, now); },
    };
    resetHands(false);
  }
  const routeLabel = () => { route.textContent = `${R().name}  ·  ${R().level}`; hud.style.setProperty('--route', R().color); };
  function stop(land) {
    S.on = false; S.mode = 'climb'; S.view = false; S.tween = null; S.hop = null;
    for (const g of gates) g.want = 0; deckGate.want = 0;
    ctx.quests?.clear('tower');
    player.takeover = null;
    player.character.root.visible = true; hands.visible = false; showHud(false); hudMode(null); banner.hidden = true;
    if (Math.abs(camera.fov - S.fov0) > 0.01) { camera.fov = S.fov0; camera.updateProjectionMatrix(); }
    ladderCone.material.opacity = CONE_OP;
    if (touch) { input.hideJoy?.(); input.joy?.classList.remove('tw-rest'); }
    player.character.params.seatY = 0;
    if (land) { const q = offPad(land.x, land.z); player.pos.set(q.x, groundHeight(q.x, q.z), q.z); player.grounded = true; player.vy = 0; }
    player.snapCameraBehind?.();
  }
  // E (B on a pad, Let go on a phone): off the steel. At the very foot you step off; higher up you fall, and bounce
  function letGo() {
    if (isWalk() || S.mode === 'roof') { say('Climb down a ladder, or jump off the top!', 3); return; }
    if (S.mode !== 'climb') return;
    if (S.h < 0.9) { worldPos(P); const n = faceC(S.face); stop({ x: P.x + Math.cos(n) * 0.8, z: P.z + Math.sin(n) * 0.8 }); return; }
    fall('let go');
  }

  // ---- carried moves along a few points: over the rim through a gate (both ways), onto the tank's ladder, up onto the
  // deck. You see it first person; the gate you pass swings up and drops behind you. `then` runs at the end.
  function carry(pts, yaw, e0, e1, gate, speed, then) {
    let len = 0; const segs = [];
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segs.push(l); len += l; }
    S.tween = { pts, segs, len, t: 0, dur: Math.max(0.35, len / speed), yaw, e0: e0.clone(), e1: e1.clone(), k: 0, gate, then, p: pts[0].clone() };
    S.mode = 'tween'; S.view = false; hands.visible = false; hudDirty = true;
    if (gate) gate.want = 1;
  }
  function stepTween(dt) {
    const T = S.tween; T.t += dt;
    const k = Math.min(1, T.t / T.dur), e = k * k * (3 - 2 * k); T.k = e;
    let d = e * T.len, i = 0;
    while (i < T.segs.length - 1 && d > T.segs[i]) { d -= T.segs[i]; i++; }
    T.p.lerpVectors(T.pts[i], T.pts[i + 1], T.segs[i] > 0 ? Math.min(1, d / T.segs[i]) : 1);
    if (k >= 1) { if (T.gate) T.gate.want = 0; S.tween = null; T.then(); }
  }
  const EYE_UP = new THREE.Vector3(0, EYE, 0);
  // up over the rim from route k's top through its gate onto the catwalk
  function overUp(k) {
    worldPos(P);
    const a = GATE[k], rA = Math.hypot(P.x - cx, P.z - cz);
    const A = P.clone(), B = tw(Math.max(rA, CAT_R + 0.55), a, H + 0.05), C = tw(GATE_IN, a, H);
    S.stam = Math.min(STAM.max, S.stam + 20);
    carry([A, B, C], faceAxis(a), EYE_UP, EYE_UP, gates[k], 1.9, () => {
      enterWalk('catwalk', C, alongRing(a));
      say(S.summitDone ? 'Back on the catwalk.' : 'The catwalk! Walk round it. The ladder up the tank (E) takes you to the very top.', 4.5);
    });
  }
  // down from the catwalk through gate k onto route k (backing out over the rim, facing the tower)
  function overDown(k) {
    worldPos(P);
    const a = GATE[k], h0 = topOf(k) - 0.05, q = onFace(k, routeU(k, h0), h0, bodyOut(k, h0));
    const W0 = P.clone(), C = tw(GATE_IN, a, H), A = new THREE.Vector3(cx + q[0], gy + h0, cz + q[2]), B = tw(Math.max(Math.hypot(q[0], q[2]), CAT_R + 0.55), a, H + 0.05);
    carry([W0, C, B, A], faceAxis(a), EYE_UP, EYE_UP, gates[k], 1.9, () => {
      S.mode = 'climb'; S.face = k; S.h = h0; S.u = routeU(k, h0); S.outE = null; S.look.yaw = 0; S.look.pitch = 0.35; S.camYaw = null; S.lunge = 0;
      routeLabel(); resetHands(false); hudDirty = true;
      say(`Down ${R().name.replace('The ', 'the ')}. S climbs down; rest on its ledges.`, 3.5);
    });
  }
  // onto the tank's ladder from the catwalk, and off it at the bottom
  function tankUp() {
    worldPos(P);
    const F = tw(roofBody(H).r, TLA, H);
    carry([P.clone(), F], faceAxis(TLA), EYE_UP, EYE_UP, null, 2.2, () => {
      S.mode = 'roof'; S.h = H; S.look.yaw = 0; S.look.pitch = 0.35; S.camYaw = null; resetHands(false); hudDirty = true;
      if (!S.said.tank) { S.said.tank = 1; say('Up the tank, over the roof\'s edge and up the roof to the very top. W climbs.', 3.5); }
    });
  }
  function tankOff() {
    worldPos(P);
    enterWalk('catwalk', P, alongRing(TLA));
  }
  // up off the roof ladder onto the deck at the very top, and back down onto it
  function deckUp() {
    worldPos(P);
    // (a step on round past the gate: up here E first takes in the view)
    const rA = Math.hypot(P.x - cx, P.z - cz), A = P.clone(), B = tw(Math.max(rA, RD + 0.55), TLA, DECK_Y + 0.05), C = tw(DECK_IN, TLA, DECK_Y), C2 = tw(DECK_IN, TLA + 0.6, DECK_Y);
    carry([A, B, C, C2], faceAxis(TLA), eyeOff(new THREE.Vector3()), EYE_UP, deckGate, 1.8, () => {
      enterWalk('peak', C2, alongRing(TLA + 0.6));
      if (!S.summitDone) summit(performance.now() / 1000); else say('The very top again.', 2.5);
    });
  }
  function deckDown() {
    worldPos(P);
    const h0 = ROOF_TOP_H - 0.05, rb = roofBody(h0), A = tw(rb.r, TLA, h0), C = tw(DECK_IN, TLA, DECK_Y), B = tw(Math.max(rb.r, RD + 0.55), TLA, DECK_Y + 0.05);
    const e1 = new THREE.Vector3(-Math.cos(TLA) * 0.5 * rb.lean, EYE - 0.3 * rb.lean, -Math.sin(TLA) * 0.5 * rb.lean);
    carry([P.clone(), C, B, A], faceAxis(TLA), EYE_UP, e1, deckGate, 1.8, () => {
      S.mode = 'roof'; S.h = h0; S.look.yaw = 0; S.look.pitch = 0.35; S.camYaw = null; resetHands(false); hudDirty = true;
    });
  }
  // the way along the ring at angle a round the tower (anticlockwise seen from above: the ladder's gate on to the tank's ladder)
  const alongRing = a => Math.atan2(-Math.sin(a), Math.cos(a));
  // start walking (on the catwalk or the deck) at world point p, facing yaw; the camera swings out behind you from where your eye was
  function enterWalk(mode, p, yaw) {
    S.mode = mode; S.wx = p.x - cx; S.wz = p.z - cz; S.wv.x = S.wv.z = 0; S.yaw = yaw; S.speed = 0; S.view = false;
    S.theta = Math.atan2(S.wz, S.wx);
    const c = player.cam; c.yaw = yaw + Math.PI; c.pitch = 0.3; c.dist = c.targetDist;
    S.lastCam = ''; hands.visible = false; hudDirty = true;
  }
  // walking round up there, like the yard (the stick or WASD, the way the camera looks; Shift runs): the tank (or the mast) inside, the
  // rail outside, the tank ladder's rails, all solid; you cannot walk off (the gates stay shut), only jump
  function walkStep(dt, inp) {
    const surf = SURF[S.mode], c = player.cam, mv = inp.move();
    const frozen = S.view || !!S.photo;
    const max = !frozen && inp.running ? 6.2 : 4.0;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const wx = frozen ? 0 : fx * mv.y + rx * mv.x, wz = frozen ? 0 : fz * mv.y + rz * mv.x;
    const acc = wx || wz ? 10 : 12;
    S.wv.x += (wx * max - S.wv.x) * Math.min(1, dt * acc); S.wv.z += (wz * max - S.wv.z) * Math.min(1, dt * acc);
    S.wx += S.wv.x * dt; S.wz += S.wv.z * dt;
    if (S.mode === 'catwalk') for (const q of TL_FOOT) { // (the tank ladder's rails)
      const dx = S.wx - q[0], dz = S.wz - q[2], d = Math.hypot(dx, dz), m = 0.05 + BODY_R;
      if (d < m && d > 1e-5) { S.wx = q[0] + dx / d * m; S.wz = q[2] + dz / d * m; }
    }
    const r = Math.hypot(S.wx, S.wz) || 1e-5, rr = clamp(r, surf.rIn, surf.rOut);
    if (rr !== r) { // against the tank or the rail: slide along it
      const nx = S.wx / r, nz = S.wz / r, vn = S.wv.x * nx + S.wv.z * nz;
      S.wx = nx * rr; S.wz = nz * rr;
      if ((rr > r && vn < 0) || (rr < r && vn > 0)) { S.wv.x -= vn * nx; S.wv.z -= vn * nz; }
    }
    S.speed = Math.hypot(S.wv.x, S.wv.z);
    if (S.speed > 0.3) S.yaw = angleLerp(S.yaw, Math.atan2(S.wv.x, S.wv.z), Math.min(1, dt * 12));
    S.theta = Math.atan2(S.wz, S.wx);
  }
  // what E does up there: climb down at a gate, up the tank's ladder at its foot, down off the deck at its gate; else take in the view
  function topAction() {
    if (!isWalk() || S.photo) return null;
    if (S.view) return { word: 'Back', run: toggleView };
    let best = null, bd = Infinity;
    const cand = (x, z, rad, word, run) => { const d = Math.hypot(S.wx - x, S.wz - z); if (d < rad && d < bd) { bd = d; best = { word, run }; } };
    if (S.mode === 'catwalk') {
      ROUTES.forEach((Rk, k) => cand(Math.cos(GATE[k]) * GATE_IN, Math.sin(GATE[k]) * GATE_IN, 1.3, k === LADDER_FACE ? 'Climb down the ladder' : `Climb down ${Rk.name.replace('The ', 'the ')}`, () => overDown(k)));
      const f = roofBody(H).r; cand(Math.cos(TLA) * f, Math.sin(TLA) * f, 1.25, 'Climb to the very top', tankUp);
    } else cand(Math.cos(TLA) * DECK_IN, Math.sin(TLA) * DECK_IN, 0.6, 'Climb down', deckDown);
    return best || { word: 'Take in the view', run: toggleView };
  }
  // a fall: out from the steel and down, onto the ground (or a footing pad), a couple of bounces, a cheer, control back. Kid-safe:
  // no daze, no damage; the first bounce is never higher than about a metre and a half (FALL.cap) whatever the height
  const FALL = { g: 17, out: 2.2, keep: 0.45, slow: 0.7, cap: 6, bounces: 2, rest: 1.2 };
  function fall(why) {
    worldPos(P);
    const n = faceC(S.face);
    S.fall = { x: P.x, y: P.y, z: P.z, vy: 0, vx: Math.cos(n) * FALL.out, vz: Math.sin(n) * FALL.out, t: 0, why, n, bounces: 0, from: S.h, touches: [] };
    S.mode = 'fall'; hudMode(null); showHud(false); player.character.root.visible = true; hands.visible = false; // (the fall is seen from outside)
    player.takeover.anim = 'swingfly'; player.takeover.speed = undefined;
    audio.play?.('slip', P.x, P.y, P.z);
    ui.toast(why === 'stamina' ? 'Your grip gave out!' : 'Whoa!', 1800);
  }
  // one step of a body in the air coming down: never below the ground; a landing keeps `keep` of the speed (no more than `cap` up)
  // and slows the drift; true on the frame it touches
  function bounceStep(f, dt, g0, keep, slow, cap) {
    f.vy -= g0 * dt; f.y += f.vy * dt; f.x += f.vx * dt; f.z += f.vz * dt;
    const g = groundAt(f.x, f.z);
    if (f.y <= g && f.vy < 0) { f.y = g; f.bounces++; f.vy = Math.min(-f.vy * keep, cap); f.vx *= slow; f.vz *= slow; return true; }
    if (f.y < g) f.y = g; // (drifting over a pad's edge: up onto it, never into it)
    return false;
  }
  // where a launch from (x, y, z) at angle n and k times the usual speed comes to rest: the flight and its bounces
  // worked out ahead, frame by frame as step() flies them
  function landing(x, y, z, n, k) {
    const f = { x, y, z, vx: Math.cos(n) * LAUNCH.out * k, vz: Math.sin(n) * LAUNCH.out * k, vy: LAUNCH.up, bounces: 0 };
    for (let i = 0; i < 900; i++) if (bounceStep(f, 1 / 30, LAUNCH.g, LAUNCH.keep, LAUNCH.slow, Infinity) && f.bounces > LAUNCH.bounces) break;
    return { x: f.x, z: f.z };
  }
  // a sane place to come down: on grass off the road and its sidewalks (2 m past them), 3 m inside the map's edge, clear of anything solid
  const landOk = (x, z) => roadEdgeDist(x, z) > SIDEWALK_W + 2 && [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(([a, c]) => pointInPoly(x + a, z + c, WALK))
    && colliders.every(c => c.off || (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) > c.r + 1.5 : x < c.minX - 1.5 || x > c.maxX + 1.5 || z < c.minZ - 1.5 || z > c.maxZ + 1.5));
  // the way you jump: straight out from where you stand if that lands somewhere sane, else turned a little (STEER), else softer, else
  // turned further; the tower stands 20 m off Summit Rd and the map's edge, so a straight jump could come down on either
  function aimLaunch(x, y, z, n) {
    for (const k of [1, 0.75, 0.5]) for (const d of STEER) { const L = landing(x + Math.cos(n + d) * 0.6, y + 0.4, z + Math.sin(n + d) * 0.6, n + d, k); if (landOk(L.x, L.z)) return { n: n + d, k, land: L }; }
    for (const d of [0.8, -0.8, 1.0, -1.0, 1.2, -1.2, 1.4, -1.4]) { const L = landing(x + Math.cos(n + d) * 0.6, y + 0.4, z + Math.sin(n + d) * 0.6, n + d, 1); if (landOk(L.x, L.z)) return { n: n + d, k: 1, land: L }; }
    return { n, k: 1, land: landing(x + Math.cos(n) * 0.6, y + 0.4, z + Math.sin(n) * 0.6, n, 1) };
  }
  // where a jump off the top leaves from: up onto the rail in front of you (at angle th round the tower), clear of it
  const hopPoint = (mode, th, out = new THREE.Vector3()) => tw((mode === 'peak' ? RD : CAT_R) - 0.35, th, SURF[mode].y + 0.8, out);
  // off the top when you choose: a hop up onto the rail, a launch out and down, a landing, a few bounces, control back (no daze: it is
  // the fun way down)
  function launch() {
    if (!isWalk()) return false;
    worldPos(P);
    const th = S.theta, Q = hopPoint(S.mode, th);
    const { n, k } = aimLaunch(Q.x, Q.y, Q.z, th);
    S.hop = { t: 0, dur: 0.22, from: P.clone(), to: Q.clone() };
    S.fly = { x: Q.x + Math.cos(n) * 0.6, y: Q.y + 0.4, z: Q.z + Math.sin(n) * 0.6, vx: Math.cos(n) * LAUNCH.out * k, vz: Math.sin(n) * LAUNCH.out * k, vy: LAUNCH.up, n, bounces: 0, t: 0 };
    S.mode = 'fly'; S.view = false; hudMode(null); banner.hidden = true; showHud(false); player.takeover.anim = 'swingfly'; player.takeover.speed = undefined;
    player.character.root.visible = true;
    audio.play?.('boing', P.x, P.y, P.z);
    return true;
  }

  function step(dt, now, inp, pl) {
    if (stripT > 0) { stripT -= dt; if (stripT <= 0) strip.classList.remove('on'); }
    if (cardT > 0) { cardT -= dt; if (cardT <= 0) card.hidden = true; }
    if (touch && input.joy && S.on && S.mode !== 'fly' && S.mode !== 'fall') { // the climb stick sits where your thumb goes, faint, until you touch it
      if (!input.stick?.active) { if (!input.joy.classList.contains('tw-rest')) hudDirty = true; input.joy.style.display = 'block'; input.joy.style.left = '96px'; input.joy.style.top = (innerHeight - 150) + 'px'; input.joy.classList.add('tw-rest'); }
      else input.joy.classList.remove('tw-rest');
    }
    const steel = touch && S.mode === 'climb'; // (on a phone the E steps aside while you are on the steel: Let go is its own small button)
    if (ctx.hud.classList.contains('tw-steel') !== steel) { ctx.hud.classList.toggle('tw-steel', steel); hudDirty = true; }
    if (hudDirty) placeHud();
    if (S.mode === 'fall') {
      const f = S.fall; f.t += dt;
      if (bounceStep(f, dt, FALL.g, FALL.keep, FALL.slow, FALL.cap)) {
        f.touches.push({ y: f.y, g: groundAt(f.x, f.z) });
        audio.play?.(f.bounces === 1 ? 'thump' : 'boing', f.x, f.y, f.z);
        if (f.bounces > FALL.bounces || f.vy < FALL.rest) { // down: a cheer, control back
          pl.pos.set(f.x, f.y, f.z);
          S.daze = 1.0; S.stam = Math.max(S.stam, 30);
          stop({ x: f.x, z: f.z });
          player.playEmote?.('cheer', now);
          ui.toast(f.why === 'stamina' ? 'Oof! Your grip gave out, but you bounced. Rest on the ledges next time!' : 'Oof! Boing, boing... you are fine. Climb again any time.', 3200);
          return;
        }
      }
      pl.pos.set(f.x, f.y, f.z); pl.yaw = faceAxis(f.n); pl.grounded = false;
      return;
    }
    if (S.mode === 'fly') {
      const f = S.fly;
      if (S.hop) { // up onto the rail first
        const hp = S.hop; hp.t += dt; const k = Math.min(1, hp.t / hp.dur);
        pl.pos.lerpVectors(hp.from, hp.to, k); pl.pos.y += Math.sin(k * Math.PI) * 0.25; pl.yaw = faceAxis(f.n + Math.PI); pl.grounded = false;
        if (k >= 1) S.hop = null;
        return;
      }
      f.t += dt;
      if (bounceStep(f, dt, LAUNCH.g, LAUNCH.keep, LAUNCH.slow, Infinity)) {
        audio.play?.(f.bounces === 1 ? 'thump' : 'boing', f.x, f.y, f.z);
        if (f.bounces > LAUNCH.bounces) { pl.pos.set(f.x, f.y, f.z); stop({ x: f.x, z: f.z }); player.playEmote?.('cheer', now); ui.toast('What a way down! Climb again any time.', 2600); return; }
      }
      pl.pos.set(f.x, f.y, f.z); pl.yaw = faceAxis(f.n + Math.PI); pl.grounded = false;
      return;
    }
    const mv = inp.move();
    S.mv.x = mv.x; S.mv.y = mv.y;
    const r = R();
    // the stick climbs (up and down); on a brace that leans, pushing the way it leans follows it too
    let up = mv.y;
    if (S.mode === 'climb' && S.face !== LADDER_FACE && Math.abs(mv.x) > Math.abs(mv.y) + 0.1) { const ln = routeLine(S.face, S.h + REACH); if (ln.part === 'brace') up = clamp(-mv.x * Math.sign(ln.slope), -1, 1); }
    S.up = up;
    const rest = resting(up);
    S.resting = rest;
    if (S.chalkT > 0) S.chalkT -= dt;
    // chalk bags within reach (the catwalk's: walk over it)
    for (const c of chalks) {
      if (c.gone > 0) continue;
      const near = S.mode === 'catwalk' ? (c.k < 0 && Math.hypot(S.wx - c.m.position.x, S.wz - c.m.position.z) < 0.8) : (S.mode === 'climb' && c.k === S.face && Math.abs(S.h - c.h) < 0.8 && Math.abs(S.u - c.u) < 1.3);
      if (near) { c.gone = STAM.chalkRespawn; c.m.visible = false; S.stam = Math.min(STAM.max, S.stam + STAM.chalk); S.chalkT = STAM.chalkTime; worldPos(P); audio.play?.('chalk', P.x, P.y + 1, P.z); say('Chalk! Grip topped up, and it drains slower for a while.', 3); }
    }
    if (S.mode === 'tween') stepTween(dt);
    else if (S.mode === 'climb') {
      const pull = 0.55 + 0.9 * Math.max(0, Math.sin(S.reach * Math.PI * 2)); // a pull per reach, a pause between
      const prevH = S.h;
      S.h = clamp(S.h + up * r.up * pull * dt, 0.3, H + 0.2);
      // a gap (a missing brace): no reaching across it, only a lunge carries you over; caught in one, you slip back to its foot
      const gap = inSpan(S.h, r.gaps);
      if (gap && S.lunge <= 0) {
        if (prevH < gap[0] + 0.05) S.h = Math.min(S.h, gap[0] - 0.02);
        else S.h = Math.max(gap[0] - 0.02, S.h - 2.6 * dt);
      }
      const near = gapNear();
      if (near && S.h < near[0] && !S.said['gap' + near[0]]) { S.said['gap' + near[0]] = 1; say(`A brace is missing above you! ${words().lungeNow}`, 4); }
      // a wet stretch: you slide unless you keep climbing
      const slick = inSpan(S.h, r.slick);
      if (slick && up < 0.2) { S.h -= 0.9 * dt; if (!S.said['slick' + slick[0]]) { S.said['slick' + slick[0]] = 1; say('Wet, rusty steel: keep climbing or you slide!', 3.5); } }
      const over = inSpan(S.h, r.over);
      if (over && !S.said['over' + over[0]]) { S.said['over' + over[0]] = 1; say('Under the catwalk: hand over hand out to its edge, quick!', 3.5); }
      // grip
      const moving = Math.abs(up) > 0.2;
      let drain = (STAM.hang + (up > 0.2 ? STAM.up : 0)) * r.drain;
      if (over) drain *= 2.2;
      if (slick) drain *= 1.2;
      if (S.chalkT > 0) drain *= 0.5;
      if (rest) { S.stam = Math.min(STAM.max, S.stam + STAM.rest * dt); S.h += (LEVELS[restLevel()] - S.h) * Math.min(1, dt * 3); } // (you settle onto the ring)
      else S.stam -= drain * dt;
      if (S.lunge > 0) { S.lunge -= dt; S.h = clamp(S.h + 6 * dt, 0.3, H + 0.2); }
      // the pull's rhythm (the view rides it; the hands keep their own count of rungs and grips)
      if (moving) { S.reach += dt * (onLadder() ? 3.2 : 2.4); S.lastReach = S.reach; }
      if (rest && restLevel() !== undefined && !S.said['rest' + restLevel()]) { S.said['rest' + restLevel()] = 1; say(`A rest on the ring at ${Math.round(S.h)} m: let go of the stick and your grip fills up.`, 3.5); }
      // where the route has you: on its line (the ladder keeps you to its middle), an arm's length out from the steel
      if (S.face === LADDER_FACE) S.u += (0 - S.u) * Math.min(1, dt * 8); else S.u = routeU(S.face, S.h);
      const ot = bodyOut(S.face, S.h); S.outE = S.outE === null ? ot : S.outE + (ot - S.outE) * Math.min(1, dt * 6);
      if (S.h > topOf(S.face) - 1.6 && !S.said.top) { S.said.top = 1; say('The catwalk\'s edge is just above. Keep climbing and pull over!', 3); }
      // every route comes up over the catwalk's rim, outside the planks, and through its gate
      if (S.h >= topOf(S.face) && up > 0.2) { S.h = topOf(S.face); S.outE = bodyOut(S.face, S.h); overUp(S.face); }
      else if (S.h > topOf(S.face)) S.h = topOf(S.face);
      if (S.mode === 'climb') {
        if (S.stam <= 0) { S.stam = 0; fall('stamina'); return; }
        if (S.stam < 25) { S.lowBeat -= dt; if (S.lowBeat <= 0) { S.lowBeat = 0.35 + S.stam / 25 * 0.6; audio.play?.('heart'); } }
        if (S.stam < 20 && !S.said.low) { S.said.low = 1; say(R().rests.length ? 'Your grip is nearly gone: get to a rest, or let go now!' : 'Your grip is nearly gone!', 3); }
        if (S.stam > 60) S.said.low = 0;
      }
    } else if (S.mode === 'roof') {
      if (!S.view) S.h = clamp(S.h + mv.y * 1.6 * dt, H, ROOF_TOP_H);
      S.stam = Math.min(STAM.max, S.stam + STAM.rest * 0.5 * dt);
      if (mv.y !== 0 && !S.view) { S.reach += dt * 3; S.lastReach = S.reach; }
      if (S.h <= H + 0.01 && mv.y < -0.3) tankOff();
      else if (S.h >= ROOF_TOP_H - 0.01 && mv.y > 0.3) deckUp();
    } else if (isWalk()) {
      walkStep(dt, inp);
      S.stam = Math.min(STAM.max, S.stam + STAM.rest * dt);
    }
    if (S.photo) { S.photo.t += dt; if (S.photo.t > 3.6) S.photo = null; }
    worldPos(P);
    pl.pos.copy(P); pl.yaw = facing();
    pl.grounded = true;
    const to = player.takeover;
    if (isWalk()) { to.anim = S.speed > 5.2 ? 'run' : S.speed > 0.2 ? 'walk' : 'idle'; to.speed = S.speed; } // (others see you walk round up there)
    else { to.anim = S.resting && S.restK > 0.3 ? 'idle' : 'climb'; to.speed = undefined; } // (tower-hands: resting you stand on the ring's plate)
    const pc = Math.round(S.stam);
    barFill.style.width = `${clamp(S.stam / STAM.max, 0, 1) * 100}%`; bar.classList.toggle('low', S.stam < 25);
    barChalk.style.opacity = S.chalkT > 0 ? '1' : '0';
    const where = S.mode === 'catwalk' ? 'Catwalk' : S.mode === 'peak' ? 'The very top' : S.mode === 'roof' ? 'Roof ladder' : S.mode === 'tween' ? 'Over the edge' : rest ? 'Resting' : `${Math.round(S.h)} m`;
    const txt = `${where}  ·  grip ${pc}%`; if (barTxt.textContent !== txt) barTxt.textContent = txt;
    // the touch buttons: the move of the moment only when it does something (Lunge! under a missing brace, Jump at the top); Let go
    // only on the steel
    const top = isWalk();
    const showMove = top ? !S.view && !S.photo : !!gapNear() && S.stam > STAM.lunge + 2 && S.lunge <= 0, mw = top ? 'Jump' : 'Lunge!';
    if (bMove.textContent !== mw) { bMove.textContent = mw; hudDirty = true; }
    if (bMove.hidden === showMove) { bMove.hidden = !showMove; hudDirty = true; }
    bMove.classList.toggle('hot', !top && showMove);
    if (bLetGo.hidden === (S.mode === 'climb')) { bLetGo.hidden = S.mode !== 'climb'; hudDirty = true; }
    // the keys, one line, on a PC and a pad (a phone's buttons say it themselves)
    const d = dev(), act = top ? topAction() : null, aw = act ? act.word.toLowerCase() : '';
    const tip = d === 'touch' ? '' : S.mode === 'climb' ? (d === 'pad' ? `Left stick: climb   ${padBtn(0)} lunge   ${padBtn(1)} let go` : 'W climb   S down   Space lunge   E let go')
      : S.mode === 'roof' || S.mode === 'tween' ? (d === 'pad' ? 'Left stick: climb up or down' : 'W climb   S down')
      : (d === 'pad' ? `Left stick: walk\n${padBtn(0)} jump off   ${padBtn(1)} ${aw}` : `WASD walk   Shift run\nSpace jump off   E ${aw}`);
    if (tips.textContent !== tip) { tips.textContent = tip; hudDirty = true; }
  }
  function summit(now) {
    S.summitDone = true;
    worldPos(P); audio.play?.('fanfare', P.x, P.y, P.z);
    firework();
    const secs = Math.round(performance.now() / 1000 - S.t0), m = Math.floor(secs / 60), s = secs % 60;
    banner.replaceChildren(el('div', 'tb-title', 'Top of Breneland!'), el('div', 'tb-sub', `${R().name.replace('The ', '')}  ·  ${m}:${String(s).padStart(2, '0')}`));
    banner.style.setProperty('--route', R().color); banner.hidden = false; banner.classList.remove('go'); void banner.offsetWidth; banner.classList.add('go');
    S.bannerT = 5.2; // (game time, not a timer: the banner goes with the frames it was shown in)
    S.photo = { t: 0, shot: false }; // the photo moment: the camera swings out to frame you against the view, then a shutter
    S.look.yaw = 0;
    { const w = words(); say(`Walk round the top and look. The carnival is over the ridge to the north-west. ${w.jump}, or ${w.view}.`, 6); }
    ctx.reward('tower').then(r2 => { if (r2.ok) say('First climb of the day: a fish!', 3.6); else if (r2.why === 'cap') say('You already got today\'s fish for the climb.', 3); });
  }

  // ---- what the camera must never be inside (generous: a camera's near plane): the tank, the roof, the deck, its rail and the mast,
  // the catwalk and its rail, the legs' frame (tower frame: x, z from the axis, y over the ground at the foot)
  function insideTower(x, y, z) {
    const r = Math.hypot(x, z);
    if (y > H - 0.3 && y < Y_E + 0.2 && r < TANK_R + 0.35) return 'tank';
    if (y >= Y_E && y < Y_T + 0.1 && r < roofSurfR(y) + 0.3) return 'roof';
    if (y > Y_T - 0.1 && y < DECK_Y + 0.2 && r < RD + 0.15) return 'deck';
    if (y >= DECK_Y && y < DECK_Y + 1.25 && r > RD - 0.22 && r < RD + 0.22) return 'rail';
    if (y >= DECK_Y && y < DECK_Y + 3.3 && r < MAST_R + 0.25) return 'finial';
    if (y > H - 0.35 && y < H + 1.3 && r > R1 - 1.0 && r < CAT_R + 0.3) return y < H + 0.2 || r > CAT_R - 0.3 ? 'catwalk' : null;
    if (y < H && r < legR(y) + 0.4) return 'frame';
    return null;
  }
  // (tests) what a body may never be in: the solid parts as built (the tank and its bands, the roof, the deck, its rail and the mast,
  // the catwalk's planks and rail; the gates' gaps open), tower frame
  function solidAt(x, y, z) {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (y > H && y < Y_E && r < TANK_R + 0.2) return 'tank';
    if (y >= Y_E && y < Y_T && r < roofSurfR(y)) return 'roof';
    if (y >= Y_T && y < DECK_Y && r < RD) return 'deck';
    if (y >= DECK_Y && y < DECK_Y + 1.1 && Math.abs(r - RD) < 0.05 && Math.abs(angDiff(a, TLA)) * RD > GATE_W) return 'deck rail';
    if (y >= DECK_Y && y < DECK_Y + 2.6 && r < MAST_R) return 'mast';
    if (y > H - 0.14 && y < H && r > R1 - 0.8 && r < CAT_R) return 'planks';
    if (y >= H && y < H + 1.1 && Math.abs(r - CAT_R) < 0.05 && GATE.every(g => Math.abs(angDiff(a, g)) * CAT_R > GATE_W)) return 'rail';
    return null;
  }
  // (tests) a body standing at world feet point p: a capsule 0.3 m round from 0.15 m to 1.7 m over the feet (its whole cross-section), against solidAt
  function bodyHit(px, py, pz) {
    for (const hy of [0.15, 0.6, 1.1, 1.7]) for (let i = 0; i <= 48; i++) { // (the whole disc: rings 0.1, 0.2 and 0.3 m out, and the middle)
      const a = (i % 16) / 16 * Math.PI * 2, rr = i === 48 ? 0 : 0.1 * (1 + Math.floor(i / 16)), hit = solidAt(px - cx + Math.cos(a) * rr, py - gy + hy, pz - cz + Math.sin(a) * rr);
      if (hit) return `${hit} (${hy} m up)`;
    }
    return '';
  }
  // put a camera point clear of the tower: out from the axis and up until it is outside every part
  function clearCam(v) {
    for (let i = 0; i < 40; i++) {
      const x = v.x - cx, y = v.y - gy, z = v.z - cz;
      if (!insideTower(x, y, z)) return v;
      const r = Math.hypot(x, z) || 1;
      v.x += (x / r) * 0.25; v.z += (z / r) * 0.25; v.y += 0.2;
    }
    return v;
  }

  const _eye = new THREE.Vector3(), _dir = new THREE.Vector3(), _vd = new THREE.Vector3(), _wt = new THREE.Vector3(), _wd = new THREE.Vector3(), _wp = new THREE.Vector3();
  function placeCamera(dt, cam, inp, now) {
    worldPos(P);
    const portrait = cam.aspect < 0.95;
    const walkCam = isWalk() && !S.view && !S.photo;
    const fp = (S.mode === 'climb' || S.mode === 'roof' || S.mode === 'tween') && !S.view && !S.photo;
    if (!walkCam) {
      const look = inp.takeLook();
      if (look.x || look.y) { S.look.yaw = clamp(S.look.yaw - look.x * 0.0055, S.mode === 'climb' ? -1.3 : -3.2, S.mode === 'climb' ? 1.3 : 3.2); S.look.pitch = clamp(S.look.pitch + look.y * 0.004, -1.0, 1.15); }
    }
    // a phone held upright sees the climb wider (its 55 degrees are tall, not wide: the hands on a rung were off the sides)
    const fovT = fp && portrait ? FOV_PHONE : S.fov0;
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov += (fovT - cam.fov) * Math.min(1, dt * 6); if (Math.abs(cam.fov - fovT) < 0.05) cam.fov = fovT; cam.updateProjectionMatrix(); }
    hands.visible = fp && S.mode !== 'tween';
    // the ladder's green light is a soft cone up it from its foot: from inside it (on the ladder) it tints the whole view, so it fades
    ladderCone.material.opacity = CONE_OP * (onLadder() && S.h < 13 ? 0.15 : 1);
    if (S.mode === 'fall') { const f = S.fall; cam.position.set(f.x + Math.cos(f.n) * 7, Math.max(groundAt(f.x + Math.cos(f.n) * 7, f.z + Math.sin(f.n) * 7) + 2, f.y + 3), f.z + Math.sin(f.n) * 7); cam.lookAt(f.x, f.y + 0.8, f.z); S.lastCam = 'fall'; return true; }
    if (S.mode === 'fly') { const f = S.fly; clearCam(cam.position.set(f.x - f.vx * 0.5 + Math.cos(f.n) * -4, Math.max(terrainHeight(f.x, f.z) + 2, f.y + 3.2), f.z - f.vz * 0.5 + Math.sin(f.n) * -4)); cam.lookAt(f.x, f.y + 0.8, f.z); S.lastCam = 'fly'; return true; }
    if (S.view) { viewCamera(cam); player.character.root.visible = false; S.lastCam = 'view'; return true; }
    if (S.photo) { // the photo moment at the top: out over the edge, looking back at you with the far hills behind
      const k = Math.min(1, S.photo.t / 1.4); S.topK = k * k * (3 - 2 * k);
      summitCamera(cam, S.topK, portrait);
      player.character.root.visible = true;
      if (!S.photo.shot && S.photo.t > 1.8) { S.photo.shot = true; audio.play?.('shutter'); if (ui.el?.fade) { ui.el.fade.style.background = '#fff'; ui.fade(0.6, 60).then(() => ui.fade(0, 300)).then(() => { ui.el.fade.style.background = ''; }); } }
      S.lastCam = 'photo';
      return true;
    }
    if (walkCam) { walkCamera(dt, cam, inp, now); S.lastCam = 'walk'; return true; }
    S.lastCam = 'fp';
    // first person: your eye over your feet, riding each pull. (tower-hands) Resting on a ring you stand on its deck plate: the
    // camera eases back out behind you (a little to the side the look turns it) and your whole body is back; climbing on, it eases in
    S.restK += ((S.resting ? 1 : 0) - S.restK) * Math.min(1, dt * 4);
    const target = facing() + S.look.yaw;
    if (S.camYaw === null) S.camYaw = target; else S.camYaw += angDiff(target, S.camYaw) * Math.min(1, dt * 9); // (turning round eases)
    const yaw = S.camYaw;
    const bob = S.mode === 'climb' && !S.resting ? Math.sin(S.reach * Math.PI * 2) * 0.05 : 0; // the view rides each pull
    const n = S.mode === 'climb' ? faceC(S.face) : 0, rk0 = S.mode === 'climb' ? S.restK : 0, rk = rk0 * rk0 * (3 - 2 * rk0);
    eyeOff(_eo);
    _eye.set(P.x + _eo.x, P.y + _eo.y + bob, P.z + _eo.z);
    const over = S.mode === 'climb' && inSpan(S.h, R().over) ? 0.1 : 0; // under an overhang you look up at it (a little: your hands on its holds stay in view)
    const pitch = S.look.pitch + over;
    _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    _wt.copy(_eye).add(_dir);
    cam.position.copy(_eye);
    if (rk > 0.001) { // (out from the face behind you, up a little, looking at your middle)
      const a = n - S.look.yaw * 0.8;
      clearCam(_vd.set(P.x + Math.cos(a) * REST_CAM.out, P.y + REST_CAM.up, P.z + Math.sin(a) * REST_CAM.out));
      cam.position.lerp(_vd, rk);
      _wt.lerp(_wp.set(P.x, P.y + REST_CAM.look, P.z), rk);
    }
    cam.lookAt(_wt);
    cam.updateMatrixWorld();
    const body = cam.position.distanceTo(_eye) > REST_CAM.body; // (your head clear of the lens)
    player.character.root.visible = body; if (body) hands.visible = false;
    S.lat = portrait ? 0.12 : 0.2; // (how far to each side your hands go: a phone held upright sees little across)
    if (S.mode !== 'tween') placeHands(dt, now, cam, portrait);
    return true;
  }
  // walking round the top: the yard's own follow camera (its yaw, pitch and distance, the same drag and zoom), pulled in
  // wherever the tank, the roof or the rail would come between it and you (insideTower along the way); right up close (your back to
  // the tank) it is over your shoulder and your body steps out of the view
  function walkCamera(dt, cam, inp, now) {
    const c = player.cam, look = inp.takeLook();
    if (look.x || look.y) { c.yaw -= look.x * 0.0055; c.pitch = clamp(c.pitch + look.y * 0.004, -0.15, 1.25); c.manualAt = now; }
    if (look.zoom) c.targetDist = clamp(c.targetDist + look.zoom * 0.9, 3, 16);
    if (input.dragging) c.manualAt = now;
    // the camera drifts round behind you as you walk forward (as in the yard), so holding W walks you on round the ring along the rail;
    // walking back toward it (S) it keeps ahead of you, so S walks you on round the other way, facing it
    if (now - (c.manualAt || 0) > 1.5 && S.speed > 1.2 && Math.abs(S.mv.y) > 0.3) c.yaw = angleLerp(c.yaw, S.yaw + (S.mv.y > 0 ? Math.PI : 0), Math.min(1, dt * 1.6));
    c.dist += (c.targetDist - c.dist) * Math.min(1, dt * 6);
    _wt.set(P.x, P.y + 1.6, P.z);
    _wd.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    let dist = c.dist;
    const N = 32;
    for (let i = 1; i <= N; i++) {
      const d = c.dist * i / N;
      if (insideTower(_wt.x + _wd.x * d - cx, _wt.y + _wd.y * d - gy, _wt.z + _wd.z * d - cz)) { dist = Math.max(0.05, d - c.dist / N - 0.1); break; }
    }
    _wp.copy(_wt).addScaledVector(_wd, dist);
    if (S.lastCam !== 'walk') { c.pos.copy(cam.position); c.look.copy(_wt); }
    // (pulled in at once, eased out: an eased pull-in could sweep through the tank)
    if (c.pos.distanceTo(_wt) > dist + 0.05) c.pos.copy(_wp); else c.pos.lerp(_wp, Math.min(1, dt * 10));
    if (insideTower(c.pos.x - cx, c.pos.y - gy, c.pos.z - cz)) c.pos.copy(_wp);
    c.look.lerp(_wt, Math.min(1, dt * 14));
    cam.position.copy(c.pos);
    cam.lookAt(c.look);
    player.character.root.visible = c.pos.distanceTo(_wt) > 0.9;
  }
  // the summit's framing: you on the deck against the hills, the camera swung out over the edge behind you (k 0..1 the swing; the
  // look turns it round you). A phone held upright stands it further off: its narrow view had the camera in your hair.
  function summitCamera(cam, k, portrait) {
    const a = TLA + 0.5 + S.look.yaw, D = portrait ? 8.2 : 6, d = 2.4 + (D - 2.4) * k;
    clearCam(_vd.set(P.x + Math.cos(a) * d, P.y + 1.7 + (portrait ? 1.7 : 1.2) * k, P.z + Math.sin(a) * d));
    cam.position.copy(_vd);
    cam.lookAt(P.x, P.y + 1.3, P.z);
  }
  // Take in the view: out past the deck's edge (the rail's, on the catwalk), never inside a part of the tower. From the top it looks
  // over the town (WATER_TOWER.view: the houses, the park and the lake with our house in the middle); from the catwalk
  // the way out from where you stand, over the rail.
  const VIEW = WATER_TOWER.view || { x: 0, z: -10 };
  function viewCamera(cam) {
    let dx, dz, r, y, l = 220, drop = 16;
    if (S.mode === 'catwalk') { dx = Math.cos(S.theta); dz = Math.sin(S.theta); r = CAT_R + 1.4; y = gy + H + 2.4; }
    else { dx = VIEW.x - cx; dz = VIEW.z - cz; l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; r = TANK_R + 2.8; y = gy + DECK_Y + 1.4; drop = y - terrainHeight(VIEW.x, VIEW.z) - 6; } // (down onto the town, the lake's far shore near the top)
    clearCam(_vd.set(cx + dx * r, y, cz + dz * r));
    cam.position.copy(_vd);
    cam.lookAt(cx + dx * l, _vd.y - drop, cz + dz * l);
  }

  // ---- the hands, frame by frame. A grip: what the hand holds (kind, and `ref` the rung number, hold or rail angle), the world point
  // its anchor closes on (`p`: a bar's middle in the wrap's curl, a hold's top front edge, the palm on a ledge), the hand's turn there
  // (`q`) and its shape. The hand eases from where it was to the grip in `dur` seconds (open on the way, the shape at the end).
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _f = new THREE.Vector3(), _pn = new THREE.Vector3(), _a = new THREE.Vector3(), _sh = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
  const _qa = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
  // the hand's turn from the way its fingers point and its palm faces (bodies-hands: the hand hangs down the wrist's -y, the palm
  // faces -side x, the thumb +z)
  function handTurn(out, finger, palm, bs) {
    _y.copy(finger).negate().normalize(); _x.copy(palm).multiplyScalar(-bs); _x.addScaledVector(_y, -_x.dot(_y)).normalize(); _z.crossVectors(_x, _y);
    return out.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
  }
  const rungH = (roof, n) => (roof ? ROOF_RUNG[n].y : RUNG0 + n * RUNG_STEP);
  const rungCount = roof => (roof ? ROOF_RUNG.length : LADDER_RUNGS);
  // the heights a hand reaches for its rung (world y over the tower's foot): from just under your eye to over it; on the roof's slope,
  // leaning in over it, lower (the rungs there are in front of you, not above)
  function gripWin(y0, lean, out) { out[0] = y0 + GRIP_LO - 0.4 * lean; out[1] = y0 + GRIP_HI - 0.55 * lean; return out; }
  const _gw = [0, 0];
  // the highest rung of a hand's parity (the hands take every other rung) at or under hi (going up or holding), or the lowest at or over
  // lo (going down)
  function rungFor(roof, par, lo, hi, down) {
    const nMax = rungCount(roof) - 1;
    let n = 0;
    if (down) { while (n < nMax && rungH(roof, n) < lo) n++; } else { n = nMax; while (n > 0 && rungH(roof, n) > hi) n--; }
    if (((n % 2) + 2) % 2 !== par) n += down ? 1 : -1;
    while (n > nMax) n -= 2;
    while (n < 0) n += 2;
    return n;
  }
  // a point on a rung (world): lat metres along it to your right
  function rungPoint(roof, n, lat, out) {
    const h = rungH(roof, n);
    if (!roof) { const p = onFace(LADDER_FACE, -lat, h, ladderOut(h)); return out.set(cx + p[0], gy + h, cz + p[2]); }
    const r = ROOF_RUNG[n].r; return out.set(cx + Math.cos(TLA) * r + Math.sin(TLA) * lat, gy + h, cz + Math.sin(TLA) * r - Math.cos(TLA) * lat);
  }
  // the rung for a hand (the hands take every other rung): the highest of its own within reach going up (or holding still), the
  // lowest going down
  function pickRung(H2, roof, down) {
    gripWin(S.h, roof ? roofBody(S.h).lean : 0, _gw);
    return rungFor(roof, H2.side < 0 ? 0 : 1, _gw[0], _gw[1], down);
  }
  // the hold for a hand: on its own side of you, within reach, nearest to where the stick is taking you (up, down, along).
  // The grips are on the route's own steel (a leg's battens, along a brace, under the bracket); S.up says which way you're going
  function pickHold(H2, other) {
    const list = HOLDS[S.face], lo = S.h + GRIP_LO + 0.1, hi = S.h + GRIP_HI + 0.05, up = S.up; // (from eye height up: a hand lower than that is under the view)
    const uWant = S.u - H2.side * S.lat, hWant = up > 0.2 ? hi : up < -0.2 ? lo + 0.1 : S.h + REACH;
    let best = null, bs = Infinity;
    for (const o of list) {
      if (o.h < lo || o.h > hi || o === other.g.ref) continue;
      if (H2.side < 0 ? o.u < S.u - 0.3 : o.u > S.u + 0.3) continue; // (the left hand takes the holds on your left: u runs to your left)
      const du = o.u - uWant; if (Math.abs(du) > S.lat * 2.5) continue; // (in front of you: further out to the side it is out of view)
      const sc = du * du * 2 + (o.h - hWant) ** 2;
      if (sc < bs) { bs = sc; best = o; }
    }
    return best;
  }
  function setGrip(G, kind, ref, p, finger, palm, bs, shape, anchor, slick = false) {
    G.kind = kind; G.ref = ref; G.p.copy(p); handTurn(G.q, finger, palm, bs); G.shape = shape; G.anchor = anchor; G.slick = slick;
    return G;
  }
  // what the hand wants to hold now (into its spare grip), or null to keep what it has
  function wantGrip(H2, other, fresh, cam) {
    const G = H2.spare, bs = H2.bs, mv = S.mv, cur = H2.g;
    const n = faceC(S.face), nx = Math.cos(n), nz = Math.sin(n);
    if (S.mode === 'climb' && S.lunge > 0) { // a lunge: both thrown up, open
      if (cur.kind === 'air') return null;
      return setGrip(G, 'air', null, airPoint(H2, cam, _a), _f.set(0, 1, 0).applyQuaternion(cam.quaternion).addScaledVector(_d.set(0, 0, -1).applyQuaternion(cam.quaternion), 0.3), _pn.set(0, 0, -1).applyQuaternion(cam.quaternion), bs, 'open', 'wrap');
    }
    if (S.mode === 'climb' && S.resting) { // a ledge: both hands flat on it in front of you
      const li = restLevel();
      if (cur.kind === 'flat' && cur.ref === li) return null;
      const p = onFace(S.face, S.u - H2.side * S.lat * 1.2, LEVELS[li] - 0.05 + 0.006, (S.outE ?? bodyOut(S.face, S.h)) - 0.55);
      return setGrip(G, 'flat', li, _a.set(cx + p[0], gy + p[1], cz + p[2]), _f.set(-nx, 0, -nz), _pn.set(0, -1, 0), bs, 'open', 'palm');
    }
    if (onLadder() || S.mode === 'roof') { // a rung: wrapped over and round it, the thumb under
      const roof = S.mode === 'roof', down = mv.y < -0.2;
      if (cur.kind === 'rung' && cur.roof === roof && !fresh) {
        const h = rungH(roof, cur.ref);
        gripWin(S.h, roof ? roofBody(S.h).lean : 0, _gw);
        const keep = h >= _gw[0] - (down ? 0.25 : 0) && h <= _gw[1] + (down ? 0 : 0.25);
        if (keep) return null;
      }
      const k = pickRung(H2, roof, down);
      if (cur.kind === 'rung' && cur.roof === roof && cur.ref === k) return null;
      const fx = roof ? -Math.cos(TLA) : -nx, fz = roof ? -Math.sin(TLA) : -nz;
      const g = setGrip(G, 'rung', k, rungPoint(roof, k, H2.side * S.lat * 0.85, _a), _f.set(fx, 0.45, fz), _pn.set(fx * 0.45, -1, fz * 0.45), bs, 'wrap', 'wrap');
      g.roof = roof;
      return g;
    }
    if (S.mode !== 'climb') return null;
    // a route up the steel: a batten of the leg, a place on the brace, the bracket's underside
    if (cur.kind === 'hold' && !fresh && cur.ref.k === S.face) {
      const o = cur.ref, du = o.u - (S.u - H2.side * S.lat);
      const soft = (S.up > 0.2 && o.h < S.h + GRIP_LO + 0.25) || (S.up < -0.2 && o.h > S.h + GRIP_HI) || Math.abs(du) > 0.45;
      const hard = o.h < S.h + GRIP_LO - 0.1 || o.h > S.h + GRIP_HI + 0.3 || Math.abs(du) > 0.8;
      if (!hard && !(soft && other.t >= 0.6)) return null;
    }
    const o = pickHold(H2, other);
    if (!o) return null;
    if (cur.kind === 'hold' && cur.ref === o) return null;
    if (o.bar) return setGrip(G, 'hold', o, o.p, _f.set(-nx, 0.45, -nz), _pn.set(-nx * 0.45, -1, -nz * 0.45), bs, 'wrap', 'wrap'); // (a batten: round it like a rung)
    return setGrip(G, 'hold', o, o.p, o.s, _pn.copy(o.n).negate(), bs, o.slick ? 'strain' : 'wrap', 'wrap', o.slick);
  }
  // where a hand thrown up in a lunge is: up and out in front of the view
  const airPoint = (H2, cam, out) => out.set(H2.side * S.lat, 0.2, -0.5).applyMatrix4(cam.matrixWorld);
  function resetHands(snap) {
    for (const H2 of HANDS) { H2.g.kind = null; H2.g.ref = null; H2.t = 1; H2.snap = snap; }
  }
  function placeHands(dt, now, cam, portrait) {
    const lungeEnd = S.wasLunge && S.lunge <= 0; S.wasLunge = S.lunge > 0;
    for (const H2 of HANDS) {
      const other = H2 === handL ? handR : handL;
      const fresh = !H2.g.kind || lungeEnd || (H2.g.kind === 'flat' && !S.resting) || (H2.g.kind === 'rung' && !(onLadder() || S.mode === 'roof')) || (H2.g.kind === 'hold' && (S.mode !== 'climb' || onLadder() || H2.g.ref.k !== S.face));
      // one hand moves at a time (the other holds on), unless this one has nothing to hold or both are thrown or slapped on
      if (!fresh && H2.t < 1) continue;
      if (!fresh && other.t < (H2.g.kind === 'hold' ? 0.6 : 1) && !(S.lunge > 0)) continue; // (up the steel the next reach starts as the last one closes)
      const G = wantGrip(H2, other, fresh, cam);
      if (!G) {
        if (H2.g.kind === 'air') airPoint(H2, cam, H2.g.p);
        continue;
      }
      // reach for it: from where the hand is now (or, grabbing on, from low in front of you)
      if (!H2.g.kind && !H2.snap) { H2.cur.p.set(H2.side * 0.2, -0.45, -0.35).applyMatrix4(cam.matrixWorld); H2.cur.q.copy(G.q); }
      H2.from.p.copy(H2.cur.p); H2.from.q.copy(H2.cur.q);
      H2.spare = H2.g; H2.g = G;
      H2.t = H2.snap ? 1 : 0; H2.snap = false;
      H2.dur = G.kind === 'rung' ? 0.17 : G.kind === 'air' ? 0.14 : lungeEnd ? 0.08 : G.kind === 'flat' ? 0.3 : G.kind === 'rail' ? 0.16 : 0.16;
      H2.landed = false;
    }
    if (!foreMat.color.equals(sleeveMat.color)) foreMat.color.copy(sleeveMat.color); // (the day and night light the shared sleeve)
    const shake = S.stam < 25 ? (25 - S.stam) / 25 * 0.008 : 0;
    for (const H2 of HANDS) {
      const G = H2.g;
      if (!G.kind) continue;
      if (G.kind === 'air') airPoint(H2, cam, G.p);
      if (H2.t < 1) H2.t = Math.min(1, H2.t + dt / H2.dur);
      if (H2.t >= 1 && !H2.landed) { H2.landed = true; if (G.kind !== 'air') audio.play?.(G.kind === 'rung' ? 'rung' : 'grab', G.p.x, G.p.y, G.p.z); }
      const e = H2.t * H2.t * (3 - 2 * H2.t), arc = Math.sin(H2.t * Math.PI);
      // where the anchor is: on the way, an arc out toward you and up; holding, on the grip (a wet hold slips a little now and then)
      H2.cur.p.lerpVectors(H2.from.p, G.p, e);
      if (H2.t < 1) { _d.set(0, 0, 1).applyQuaternion(cam.quaternion); H2.cur.p.addScaledVector(_d, 0.07 * arc).y += 0.05 * arc; }
      H2.cur.q.slerpQuaternions(H2.from.q, G.q, e);
      if (G.slick && H2.t >= 1) {
        H2.slipT -= dt; if (H2.slipT <= 0) { H2.slip = 1; H2.slipT = 1.2 + Math.random() * 1.8; }
        H2.slip = Math.max(0, H2.slip - dt * 3.5);
      } else H2.slip = 0;
      _a.copy(H2.cur.p); _a.y -= 0.035 * H2.slip * H2.slip;
      if (shake) { _a.x += Math.sin(now * 23 + H2.side) * shake; _a.y += Math.cos(now * 19 + H2.side) * shake; }
      // the shape: open while it reaches, then the grip's own (open on a ledge, wrapped on a bar or a hold, strained on a wet one)
      setHandShape(H2.hb, H2.t < 0.8 ? 'open' : G.shape);
      // the wrist: the anchor's own place in the hand (the wrap's curl, or the palm) put on the anchor
      const A = G.anchor === 'palm' ? H2.palmA : H2.wrapA;
      _w.set(A[0], A[1], A[2]).multiplyScalar(FP_SCALE).applyQuaternion(H2.cur.q);
      H2.wp.copy(_a).sub(_w); H2.wq.copy(H2.cur.q); // (world)
      // the forearm: from the wrist toward a shoulder below the bottom corner of the view, its own length (it fades out on the way)
      _sh.set(H2.side * (portrait ? 0.3 : 0.4), -0.9, 0.12).applyMatrix4(cam.matrixWorld);
      _d.subVectors(_sh, H2.wp).normalize();
      _w.copy(_d).multiplyScalar(0.035).add(H2.wp); // (the sleeve starts just behind the wrist)
      _qa.setFromUnitVectors(_Y, _d);
      // into the camera's frame
      toCam(H2.wrist, H2.wp, H2.wq);
      toCam(H2.arm, _w, _qa);
      toCam(H2.cuff, _w, _qa); H2.cuff.scale.set(0.04, 0.03, 0.04);
    }
  }
  const _qi = new THREE.Quaternion();
  function toCam(o, p, q) { _qi.copy(camera.quaternion).invert(); o.position.copy(p).sub(camera.position).applyQuaternion(_qi); o.quaternion.copy(_qi).multiply(q); }
  // (tests) each hand: what it holds, how far into its reach, its anchor's world point and how far that is from the real steel it
  // holds (a rung's bar, a hold's top front edge, the lip, the rail; a ledge's top for a flat hand)
  function handInfo() {
    return HANDS.map(H2 => {
      const G = H2.g, A = G.anchor === 'palm' ? H2.palmA : H2.wrapA;
      const a = new THREE.Vector3(A[0], A[1], A[2]).multiplyScalar(FP_SCALE).applyQuaternion(H2.wq).add(H2.wp);
      let dist = null;
      if (G.kind === 'rung') { // (to the rung's bar: its middle line, 0.35 m either side)
        const c = rungPoint(G.roof, G.ref, 0, new THREE.Vector3()), t = G.roof ? new THREE.Vector3(Math.sin(TLA), 0, -Math.cos(TLA)) : faceT(LADDER_FACE);
        const along = clamp(a.clone().sub(c).dot(t), -0.35, 0.35); dist = a.distanceTo(c.addScaledVector(t, along));
      } else if (G.kind === 'hold') { const o = G.ref, along = clamp(a.clone().sub(o.p).dot(o.t), o.kind === 'lip' ? -1.6 : -0.15, o.kind === 'lip' ? 1.6 : 0.15); dist = a.distanceTo(o.p.clone().addScaledVector(o.t, along)); }
      else if (G.kind === 'rail' || G.kind === 'flat') dist = a.distanceTo(G.p);
      return { side: H2.side < 0 ? 'left' : 'right', kind: G.kind, hold: G.kind === 'hold' ? G.ref.kind : null, slick: G.slick, t: H2.t, shape: H2.hb.shape, anchor: [a.x, a.y, a.z], dist };
    });
  }

  // ---- what other people see (IK_WORLD.climb, bodies-poses.js climb): for a climber standing at (x, y, z) near the camera, the rung
  // or hold each hand is on, from where they are alone (the same for everyone): the hands take every other rung, the highest of each
  // hand's own within its reach; on a face the highest hold within reach on each hand's side. Their reach is a body's (from the chest
  // to over the head, by their size), lower than the first-person hands'.
  function remoteGrips(x, y, z, s, outL, outR) {
    const dx = x - cx, dz = z - cz, Y = y - gy, r = Math.hypot(dx, dz);
    if (Y < 0.25 || r > R0 + 2.5) return 0;
    const rung = roof => {
      const lean = roof ? roofBody(Y).lean : 0, lo = Y + (0.95 - 0.4 * lean) * s, hi = Y + (1.75 - 0.55 * lean) * s;
      let bits = 0;
      for (const [side, out] of [[-1, outL], [1, outR]]) {
        const n = rungFor(roof, side < 0 ? 0 : 1, lo, hi, false);
        if (rungH(roof, n) < lo - 0.1 || rungH(roof, n) > hi + 0.1) continue;
        rungPoint(roof, n, side * 0.16, _a); out[0] = _a.x; out[1] = _a.y; out[2] = _a.z; bits |= side < 0 ? 1 : 2;
      }
      return bits;
    };
    // on the tank's or the roof's ladder: where its line puts a climber at that height, round at its angle
    if (Y > H + 0.05 && Math.abs(r - roofBody(Y).r) < 0.5 && Math.abs(angDiff(Math.atan2(dz, dx), TLA)) * r < 0.6) return rung(true);
    if (Y > H - 0.3) return 0; // (on the catwalk and the deck they walk)
    // the face whose route has a climber there, by where its line puts them (the yellow leg is on a corner)
    let k = -1, near = 2.5;
    for (let j = 0; j < 4; j++) {
      const c = faceC(j), uu = -dx * Math.sin(c) + dz * Math.cos(c), oo = dx * Math.cos(c) + dz * Math.sin(c) - faceD(Y);
      if (oo < -0.2) continue;
      const d = Math.abs(uu - routeU(j, Y)) + Math.abs(oo - bodyOut(j, Y));
      if (d < near) { near = d; k = j; }
    }
    if (k < 0) return 0;
    if (k === LADDER_FACE) return rung(false);
    // (tower-hands) the hold nearest a comfortable reach, within a body's reach of their chest: under the overhang's bracket the steel
    // slopes out over them, so a hold a little lower is a long way further in (the highest by height alone was a metre and more off)
    const c = faceC(k), u = -dx * Math.sin(c) + dz * Math.cos(c), list = HOLDS[k], lo = Y + 0.8 * s, hi = Y + 2.3 * s, cr = REMOTE_REACH * s;
    const chY = y + 1.3 * s, ax = x - Math.cos(c) * REMOTE_AIM.in * s, ay = y + REMOTE_AIM.up * s, az = z - Math.sin(c) * REMOTE_AIM.in * s;
    let bits = 0, taken = null;
    for (const [side, out] of [[-1, outL], [1, outR]]) {
      let best = null, bd = Infinity;
      for (const o of list) {
        if (o.h < lo || o.h > hi || o === taken) continue;
        if (side < 0 ? (o.u < u - 0.1 || o.u > u + 0.55) : (o.u > u + 0.1 || o.u < u - 0.55)) continue;
        if (Math.hypot(o.p.x - x, o.p.y - chY, o.p.z - z) > cr) continue;
        const d = Math.hypot(o.p.x - ax, o.p.y - ay, o.p.z - az);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) continue;
      taken = best; out[0] = best.p.x; out[1] = best.p.y; out[2] = best.p.z; bits |= side < 0 ? 1 : 2;
    }
    return bits;
  }
  IK_WORLD.climb = remoteGrips;

  let blink = 0;
  bMove.onclick = () => (S.mode === 'climb' ? lunge() : launch());
  bLetGo.onclick = () => letGo();
  const toggleView = () => { S.view = !S.view; hudMode(S.view ? 'view' : 'climb'); };
  function lunge() {
    if (S.mode === 'climb' && S.stam > STAM.lunge + 2 && S.lunge <= 0) { S.lunge = 0.45; S.stam -= STAM.lunge; worldPos(P); audio.play?.('grab', P.x, P.y + 1, P.z); }
    else if (isWalk()) launch();
  }
  const api = {
    get state() {
      return { on: S.on, mode: S.mode, face: S.face, route: ROUTES[S.face].id, u: S.u, h: S.h, stam: S.stam, view: S.view, summitDone: S.summitDone, photo: !!S.photo, resting: S.resting, up: S.up,
        theta: S.theta, speed: S.speed, wr: Math.hypot(S.wx, S.wz),
        fly: S.fly ? { bounces: S.fly.bounces, y: S.fly.y } : null, fall: S.fall ? { bounces: S.fall.bounces, y: S.fall.y, from: S.fall.from, touches: S.fall.touches.slice() } : null };
    },
    start, launch,
    // (tests) straight to the very top: on the deck inside its gate, the summit's moment
    summit: () => { S.tween = null; enterWalk('peak', tw(DECK_IN, TLA + 0.6, DECK_Y), alongRing(TLA + 0.6)); summit(performance.now() / 1000); },
    place(face, h, u = 0, mode = 'climb') {
      S.tween = null; S.face = face; S.h = h; S.u = face === LADDER_FACE ? u : routeU(face, h); S.outE = null; S.lunge = 0; S.restK = 0; S.camYaw = null;
      if (mode === 'catwalk' || mode === 'peak') { const sf = SURF[mode]; enterWalk(mode, tw((sf.rIn + sf.rOut) / 2, mode === 'peak' ? TLA + Math.PI : faceC(face), sf.y), faceAxis(faceC(face)) + Math.PI); }
      else S.mode = mode;
      routeLabel(); resetHands(true);
    },
    setStam(v) { S.stam = v; }, letGo, view(v) { S.view = !!v; hudMode(S.view ? 'view' : 'climb'); },
    hands: handInfo, insideTower, solidAt, bodyHit, holds: k => HOLDS[k].map(o => ({ h: o.h, u: o.u, kind: o.kind, slick: o.slick })), // (tests)
    tower: { x: cx, y: gy, z: cz }, aimLaunch, landOk, // (where a jump comes down)
    ROUTES, LEVELS, H, faceC, onFace, routeLine, ground: groundAt,
    // (tests) the top's places: each route's gate (angle round the tower), the tank ladder's angle, the walking rings, the
    // deck's height; where a jump off leaves from; what E does up there now
    GATE, TLA, SURF, DECK_Y, CAT_R, RD, hopPoint: (mode, th) => hopPoint(mode, th).toArray(), action: () => topAction()?.word || null,
    gateOpen: () => gates.map(g => +g.open.toFixed(2)).concat([+deckGate.open.toFixed(2)]),
    walkTo(th, r, yaw = alongRing(th)) { if (isWalk()) { S.wx = Math.cos(th) * r; S.wz = Math.sin(th) * r; S.wv.x = S.wv.z = 0; S.yaw = yaw; S.theta = th; player.cam.yaw = yaw + Math.PI; } }, // (pictures)
    tankFootR: () => roofBody(H).r,
    // where route k starts (world x, z): the spot whose E climbs it, its lamp and its sign's middle (the sign turned along the face)
    foot(k) { const fp = footProps(k), w = q => [cx + q[0], cz + q[2]]; return { prompt: w(onFace(k, footU(k), 0, 1.4 + fp.out)), lamp: w(onFace(k, fp.lampU, 0, 1.6 + fp.out)), sign: w(onFace(k, fp.signU, 0, 1.8 + fp.out)), signW: 2.4 }; },
  };
  return {
    name: 'tower', api,
    update(dt, now) {
      blink += dt; beacon.visible = (Math.floor(blink * 1.2) % 2) === 0;
      stepFirework(dt);
      if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) banner.hidden = true; }
      if (S.daze > 0) S.daze -= dt; // (a moment after a fall before the tower offers a climb again)
      if (!S.on && !S.fall) S.stam = Math.min(STAM.max, S.stam + STAM.rest * dt);
      for (const c of chalks) if (c.gone > 0) { c.gone -= dt; if (c.gone <= 0) c.m.visible = true; }
      for (const g of gates.concat([deckGate])) if (Math.abs(g.want - g.open) > 1e-3) { g.open += (g.want - g.open) * Math.min(1, dt * 9); g.boom.rotation.z = g.open * 1.35; } // (the gates swing up and drop)
    },
    target(px, pz) {
      if (S.on) {
        if (S.mode === 'fly' || S.mode === 'fall' || S.mode === 'tween' || S.mode === 'roof') return null;
        // (on a pad A lunges and jumps, so the view, the ladders and letting go are on B: the hint says B)
        const key = input.lastDevice === 'pad' ? 'Esc' : 'E';
        if (isWalk()) { const a = topAction(); return a ? { hint: `${key}  ${a.word}`, prio: 8, run: a.run } : null; }
        return { hint: `${key}  Let go`, prio: 8, run: letGo };
      }
      if (S.daze > 0) return null;
      // each route's foot says what it is: its part of the tower, how hard, what makes it so
      for (let k = 0; k < ROUTES.length; k++) {
        const p = onFace(k, footU(k), 0, 1.4 + FOOT_OUT(k)), lx = cx + p[0], lz = cz + p[2];
        if (Math.hypot(px - lx, pz - lz) < 2.6) { const Rk = ROUTES[k]; return { hint: `E  Climb ${Rk.name.replace('The ', 'the ')} (${Rk.tag})`, prio: 5, run: () => start(k) }; }
      }
      return null;
    },
    // Space lunges and jumps off the top; on a pad A does (the yard's E: its interact) and B lets go, or up there does what E would
    onKey(code) {
      if (!S.on) return false;
      if (code === 'Space') { lunge(); return true; }
      if (input.lastDevice === 'pad' && (code === 'KeyE' || code === 'Escape')) {
        if (S.mode === 'fall' || S.mode === 'fly' || S.mode === 'tween') return true;
        if (code === 'KeyE') lunge();
        else if (S.mode === 'climb') letGo(); else topAction()?.run();
        return true;
      }
      return false;
    },
    help: [[['W', 'S'], 'on the water tower: climb (you hang on by yourself until your grip runs out); rest on the ledges; Space lunges a gap; at the top walk round the catwalk, E climbs on up or down, Space jumps off']],
  };
}
