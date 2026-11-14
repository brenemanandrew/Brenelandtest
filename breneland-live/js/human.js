// Procedural cel-shaded people (players and NPCs): Mii-like proportions, a jointed rig and cartoon animation.
// No model files: everything is primitives, merged per rigid piece with vertex colours (about 30 meshes a person).
// Public contract (see docs/CONTRACTS.md): Human(opts), .root, .update(dt, t, speed, anim), .lookYaw, .params,
// .setHeld(kind, opts), .handR / .handL / .rodTip anchors, and the pose names in codes.js ANIM_CODES.
//
// Rig (all groups, forward kinematics; legs use two-bone IK inside the pose code so feet plant):
//   root (feet at y=0, faces +z) > body (squash, lean, spin) > hips (pelvis) > { legs: hip > knee > ankle }
//                                                                        > chest > { neck > headC (head, hair, hat, face) }
//                                                                                 > { arms: shoulder > elbow > wrist (hand) }
import * as THREE from 'three';
import { shadows } from './toon.js';
import {
  Part, sphere, capsuleGeo, profileAt, cylGeo, coneGeo, torusGeo, lathe, smoothProfile, shapeOf, fullHeadGeo, faceMatrix, HEAD_SHAPES,
  darker, lighter, mixHex, clamp, lerp, smooth, TAU,
} from './bodies-geo.js';
import { buildFace, addFacialHair, EYES, BROWS, NOSES, MOUTHS, FACIAL_HAIR, GLASSES } from './bodies-face.js';
import { EYE_STYLES, EYE_STYLE_LABELS, poseStyledEyes } from './bodies-eyes.js';
import { buildHair, buildHat, hatCover, hairReach, buildAccessory, buildRod, buildTreat, buildFish, buildGameBox, HAIR_STYLES, HATS as HAT_LIST, ACCESSORIES } from './bodies-gear.js';
import { Pose, POSE_KEYS, computePose, isKnownPose, sitDrop, EMOTES, CARRY_EL, CARRY_AZ, HAND_HOLD, IDLE_ARM, IDLE_CA, IDLE_SWAY, GAIT_STYLES, GAIT_LABELS, gait4, talkAt } from './bodies-poses.js';
export { GAIT_STYLES, GAIT_LABELS };
import { buildHand, poseHand, setHandShape, gripAt } from './bodies-hands.js';
import { buildArmMesh, makeArmBones, poseArmBones, armOuterAt, SHELL } from './bodies-arm.js';
import { ikState, ikNear, solveTarget, handPoint, tableInside, keepCorners, PALM_CLEAR } from './bodies-ik.js';
import { OUTFITS, TIES, SHOE_KINDS, POCKETS, outfitDefaults, outfitSpec, buildTorso, buildSkirt, buildShoe, TORSO_PROFILE, SKIRT_PROFILE, GOWN_PROFILE, COAT_PROFILE, SKIRT_TOP } from './bodies-outfit.js';
import { BODY_TYPES, FIGURES, shapeFor, makeShape, figureBuild, figureBust, PELVIS_PROFILE } from './bodies-shape.js';
export { figureBust };
import { buildDangle, DANGLE } from './fish-gear-art.js';
import { poleFromHeld, cleanBait } from './fish-gear.js';
import { SkirtRig } from './bodies-skirt.js';
import { addSageHead } from './bodies-sage.js';
import { GAZE, touch as gazeTouch, targetOf } from './gaze.js';
import { wearFromLook, anyWorn, wearChest, wearPelvis, wearLeg, wearShoe, wearHead, hatCoverFor } from './clothing-wear.js'; // (clothing-store: Peak Threads' pieces worn from the look)

export const SKIN_TONES = [
  '#f6d3b3', '#e8b98f', '#c98e62', '#a86b45', '#7a4a2e', '#f2c9a0', // the originals, never reorder
  '#fce6d6', '#e2ad7d', '#b57b52', '#8a5a3c', '#6a4029', '#ecbfa3', // appended (the server allows skin indices 0-11)
];
export const HATS = HAT_LIST;
export const NPC_HATS = ['mailcap', 'flatcap', 'hood', 'sagehood']; // (NPC-only hats, off the player's picker; lib/npc-look.js's hat enum is HATS + these)
export const FACE_SHAPES = Object.keys(HEAD_SHAPES);
export { OUTFITS, TIES, SHOE_KINDS, POCKETS };
export { HAIR_STYLES, ACCESSORIES, EYES, BROWS, NOSES, MOUTHS, FACIAL_HAIR, GLASSES, BODY_TYPES, FIGURES, EYE_STYLES, EYE_STYLE_LABELS };

const LEG_A0 = 0.1;        // ankle height above the sole
const PELVIS_DEPTH = 0.2;  // the pelvis' round bottom under the hip joint (its lathe: y -0.2 .. 0.14)
// the sleeve as the arm fit and the tools model it: a short sleeve is a shell SLEEVE_BALL arm radii round the top of the upper arm,
// SLEEVE_LEN of it long, centred SLEEVE_Y down it (bodies-arm.js sleeveOf: its hem half way down). SHOULDER_BALL / JACKET_BALL say
// how far a long sleeve's and a jacket's shell stand round the arm.
export const SHOULDER_BALL = 1 + SHELL, JACKET_BALL = 1 + SHELL + 0.09, SLEEVE_BALL = 1 + SHELL, SLEEVE_LEN = 0.55, SLEEVE_Y = 0.275;
// the pelvis lathe with a ring at the waistline (hips frame y = 0.035, just under the shirt's hem at rest) and another 1 mm over it,
// so each side of it can take its own colour (one lathe, one geometry: what is below and above is coloured per vertex)
export const WAIST_V = (0.035 + 0.2) / 0.34;
const PELVIS_CUT = (() => { const r = profileAt(PELVIS_PROFILE, WAIST_V); return [...PELVIS_PROFILE.filter(q => q[1] < WAIST_V), [r, WAIST_V], [r, WAIST_V + 0.003], ...PELVIS_PROFILE.filter(q => q[1] > WAIST_V + 0.003)]; })();

// the held book (addAccessory): its size (w along the hand's thumb way, h along the fingers, t its thickness) and its centre in
// the left hand's anchor frame (and its tip about x), found by tools/qol-fixes-book-search.mjs against the hand's 'book' shape (qol-fixes)
export const BOOK = { w: 0.16, h: 0.22, t: 0.05, at: [-0.03, -0.04, 0.05], rx: -0.1 };
const pick = (list, v, dflt) => (typeof v === 'string' && list.includes(v) ? v : dflt);
// The NPC Editor's proportions: [key, min, max], each a multiplier where 1 is the default body (lib/npc-look.js has the same ranges).
export const PROPORTIONS = [['headSize', 0.7, 1.5], ['legLen', 0.75, 1.3], ['armLen', 0.75, 1.3], ['torsoLen', 0.8, 1.25], ['shoulders', 0.8, 1.3], ['hips', 0.8, 1.3]];
const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v, dflt) => (typeof v === 'string' && HEX.test(v) ? v : dflt);
const hash01 = n => { let x = (n * 374761393 + 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Fill in and validate every option. Anything the caller leaves out (older saved profiles, NPC specs) gets a
// deterministic pick from its colours, so a crowd of NPCs still looks like a crowd of different people.
export function resolveLook(opts = {}) {
  const seed = hashStr([opts.shirt, opts.pants, opts.skin, opts.hair, opts.hat, opts.hatColor, opts.coat].join('|'));
  const r = rng(seed);
  const has = k => opts[k] !== undefined && opts[k] !== null;
  const skin = hex(opts.skin, SKIN_TONES[0]);
  const hair = hex(opts.hair, '#5a3a22');
  const o = {
    shirt: hex(opts.shirt, '#e0574f'), pants: hex(opts.pants, '#3f5f8f'), shoes: hex(opts.shoes, '#3a2f2a'), skin, hair,
    hat: pick(HATS.concat(NPC_HATS), opts.hat, 'none'), hatColor: hex(opts.hatColor, null),
    coat: hex(opts.coat, null), accessory: opts.accessory || null, acc: pick(ACCESSORIES, opts.acc, 'none'), accColor: hex(opts.accColor, null),
    scale: Number.isFinite(opts.scale) && opts.scale > 0.05 ? opts.scale : 1,
    glasses: opts.glasses === true || opts.glasses === 'yes' ? 'round' : pick(GLASSES, opts.glasses, 'none'),
    hairStyle: has('hairStyle') ? pick(HAIR_STYLES, opts.hairStyle, 'short') : ['short', 'short', 'side', 'spiky', 'buzz', 'curly'][Math.floor(r() * 6)],
    faceShape: has('faceShape') ? pick(FACE_SHAPES, opts.faceShape, 'round') : FACE_SHAPES[Math.floor(r() * 4)],
    eyes: has('eyes') ? pick(EYES, opts.eyes, 'dot') : ['dot', 'dot', 'oval', 'wide'][Math.floor(r() * 4)],
    eyeColor: hex(opts.eyeColor, null), browColor: hex(opts.browColor, null),
    eyeStyle: pick(EYE_STYLES, opts.eyeStyle, 'button'), // absent = the printed eyes (bodies-eyes.js)
    brows: has('brows') ? pick(BROWS, opts.brows, 'plain') : ['plain', 'plain', 'thick', 'arched', 'soft'][Math.floor(r() * 5)],
    nose: has('nose') ? pick(NOSES, opts.nose, 'small') : ['small', 'small', 'round', 'button'][Math.floor(r() * 4)],
    mouth: has('mouth') ? pick(MOUTHS, opts.mouth, 'smile') : ['smile', 'smile', 'grin', 'smile', 'smirk'][Math.floor(r() * 5)],
    blush: has('blush') ? !!opts.blush : r() < 0.55,
    facialHair: pick(FACIAL_HAIR, opts.facialHair, 'none'), facialHairColor: hex(opts.facialHairColor, null),
    outfit: pick(OUTFITS, opts.outfit, opts.coat ? 'coat' : 'tee'),
    bottoms: pick(['pants', 'shorts'], opts.bottoms, 'pants'),
    build: clamp(Number.isFinite(opts.build) ? opts.build : 0.32 + r() * 0.36, 0, 1),
    height: clamp(Number.isFinite(opts.height) ? opts.height : 0.36 + r() * 0.3, 0, 1),
    lines: !!opts.lines,
    thin: !!opts.thin, // thinning on top (NPC looks only: Kevin)
    trench: !!opts.trench, // the coat as a trench coat: belt, buckle, a wide collar and a tie under it (NPC looks only: the Detective)
    robe: !!opts.robe,     // the gown as a robe: long wide sleeves, a cord belt and an amulet (NPC looks only: the Cultist)
    // body type: 'm' | 'f' | 'nb'; shape 0 (masculine) .. 1 (feminine). Missing = nb at 0.5, the default body
    body: pick(BODY_TYPES, opts.body, 'nb'),
    // a figure preset on top of the body type and build, and the bust (0..1; absent = the figure's own). 'average' is the default body
    figure: pick(FIGURES, opts.figure, 'average'),
  };
  if (Number.isFinite(opts.bust)) o.bust = clamp(opts.bust, 0, 1);
  if (Number.isFinite(opts.gait)) o.gait = clamp(opts.gait, 0, 1); // the run style, 0 Scamper .. 1 Heavy; absent = picked from the body (gaitFor)
  // proportions the NPC Editor may set (1 = the default). Only present when given, so a look without them resolves as it always has.
  for (const [k, lo, hi] of PROPORTIONS) if (Number.isFinite(opts[k])) o[k] = clamp(opts[k], lo, hi);
  o.shape = shapeFor(o.body, opts.shape);
  if (o.coat && !has('outfit')) o.outfit = 'coat';
  // formal bits: the shirt under a jacket, the tie, the shoes and a pocket square (each outfit has its own defaults)
  const fd = outfitDefaults(o.outfit);
  o.inner = hex(opts.inner, fd.inner);
  o.tie = pick(TIES, opts.tie, fd.tie);
  o.tieColor = hex(opts.tieColor, fd.tieColor);
  o.shoeKind = pick(SHOE_KINDS, opts.shoeKind, fd.shoes);
  o.pocket = pick(POCKETS, opts.pocket, 'none');
  if (o.outfit === 'gown') o.bottoms = 'pants';
  o.hatColor = o.hatColor || mixHex(o.shirt, '#000000', 0.28);
  o.browColor = o.browColor || (o.hairStyle === 'bald' ? '#3a2a20' : darker(o.hair, 0.8));
  o.eyeColor = o.eyeColor || null;
  // (clothing-store) the pieces bought at Peak Threads, worn from the look's wHat / wTop / wBot / wShoe / wAcc: the code's own hat,
  // accessory and top give way to them (clothing-wear.js builds the pieces onto the body); the base cloth under a piece takes its colour
  const w = o.wear = wearFromLook(opts);
  if (anyWorn(w)) {
    if (w.hat) o.hat = 'none';
    if (w.acc) o.acc = 'none';
    if (w.bot) { o.pants = w.bot.cols[0]; o.bottoms = w.bot.legs === 'shorts' ? 'shorts' : 'pants'; }
    if (w.bot && w.bot.legs === 'dress') { o.outfit = 'dress'; o.shirt = w.bot.cols[0]; o.bottoms = 'pants'; }
    else if (w.top) { o.outfit = 'tee'; o.shirt = w.top.inner || w.top.cols[0]; }
    if (w.shoe) { o.shoes = w.shoe.cols[0]; o.shoeKind = 'sneakers'; }
  }
  return o;
}

// Body proportions from the build and height sliders (0..1). Metres at scale 1.
// The neck: its base pivots at the top of the torso, the head joint sits NECK_Y up it (a short, Mii-ish neck; the torso is a
// little shorter to make room, so the neck only adds a few centimetres).
export function bodyDims(o) {
  const B = clamp(o.build + figureBuild(o.figure), 0, 1), H = o.height, sh = shapeOf(o.faceShape); // a plus figure is a little rounder, slim slimmer
  const legK = o.legLen ?? 1, armK = o.armLen ?? 1, torK = o.torsoLen ?? 1;   // (the NPC Editor's proportions; x * 1 is exactly x)
  const legLen = lerp(0.455, 0.61, H) * legK;
  const Lr = legLen - LEG_A0;
  const wT = lerp(0.185, 0.295, B);
  const D = {
    a0: LEG_A0, legLen, Lr, Lt: Lr * 0.53, Ls: Lr * 0.47,
    hipX: lerp(0.085, 0.135, B), legR: lerp(0.072, 0.105, B),
    waist: 0.1, torsoTop: lerp(0.43, 0.51, H) * torK, wT, dT: lerp(0.15, 0.245, B),
    armR: lerp(0.052, 0.074, B), Lu: 0.19 * lerp(0.94, 1.08, H) * armK, Lf: 0.18 * lerp(0.94, 1.08, H) * armK,
    headY: sh.ry * 0.74, ry: sh.ry, neckY: lerp(0.115, 0.13, H), neckR: lerp(0.08, 0.096, B),
  };
  // how much of a child the body is (as Human's kidK): no chest and little waist on a child whatever the look says
  const kid = clamp(Math.max(smooth((0.28 - H) / 0.28), smooth((0.92 - (o.scale ?? 1)) / 0.2)), 0, 1);
  const S = D.shape = makeShape(o.shape ?? 0.5, D, -0.06, D.torsoTop + 0.06, o.shoulders !== undefined || o.hips !== undefined ? o : null,
    o.figure && o.figure !== 'average' || o.bust !== undefined || kid > 0 || o.robe ? { figure: o.figure, bust: o.bust, kid, loose: o.robe && o.outfit === 'gown' } : null);
  D.hipX *= S.hipXK; D.armR *= S.armK; D.neckR *= S.neckK;
  return D;
}

// Torso: open at the hem (the pants lathe shows below it), rounded shoulders, closed at the top under the head.
// (PELVIS_PROFILE lives in bodies-shape.js: the shirt's hem is fitted over it)

// How far out to the side the arms must hang (abduction, radians) so that, arms down, they clear the torso, a jacket's
// hem, the hips and a skirt: wide builds and skirts need more. human.update never lets a hanging arm come in closer.
function armClearance(D, o) {
  const T = D.torsoTop, yb = -0.06, H = T - yb, f = o.outfit;
  const jacket = f === 'suit' || f === 'blazer' || f === 'tux' || f === 'jacket' || f === 'vest';
  const k = jacket ? Math.max(1.05, (1.08 * (D.hipX + 0.112)) / D.wT) : 0;
  const skirt = f === 'dress' || f === 'skirt' || f === 'gown', gown = f === 'gown';
  const sLen = gown ? D.legLen - 0.14 + SKIRT_TOP : 0.3, sRx = D.hipX + 0.16;
  const S = D.shape;
  const half = y => { // body half-width at chest-frame height y (the body type's warp widens or narrows the torso)
    let w = 0;
    const v = (y - yb) / H;
    if (v >= 0 && v <= 1) w = D.wT * profileAt(TORSO_PROFILE, v) * (jacket ? 1.035 : 1);
    if (jacket && y < yb + 0.02 && y > yb - 0.36 * H) w = Math.max(w, D.wT * k);
    if (f === 'coat' && y > yb - 0.28 && y < yb + 0.22) w = Math.max(w, D.wT * 1.12 * profileAt(COAT_PROFILE, (y - yb + 0.28) / 0.5));
    w *= S.fx(y);
    const hy = y + D.waist, pv = (hy + 0.2) / 0.34;
    if (pv >= 0 && pv <= 1) w = Math.max(w, (D.hipX + 0.112) * S.hipK * profileAt(PELVIS_PROFILE, pv));
    if (skirt && hy <= SKIRT_TOP && hy >= SKIRT_TOP - sLen) w = Math.max(w, sRx * profileAt(gown ? GOWN_PROFILE : SKIRT_PROFILE, (hy - SKIRT_TOP + sLen) / sLen));
    return w;
  };
  const y0 = T - 0.105, x0 = shoulderX(D), L = D.Lu + D.Lf + 0.06;
  for (let a = 0.12; a < 0.9; a += 0.01) {
    let ok = true;
    for (let d = 0.12; d <= L && ok; d += 0.02) {
      const r = d < D.Lu ? D.armR : d < D.Lu + D.Lf ? D.armR * 0.92 : 0.074;
      if (x0 + d * Math.sin(a) - r < half(y0 - d * Math.cos(a)) + 0.006) ok = false;
    }
    if (ok) return a;
  }
  return 0.9;
}

// how much of a child a body is: short, or scaled down like the NPC kids (Human.kidK; bodyDims uses the same)
export const kidOf = o => clamp(Math.max(smooth((0.28 - (o.height ?? 0.5)) / 0.28), smooth((0.92 - (o.scale ?? 1)) / 0.2)), 0, 1);
// the run style a body gets when its look carries no `gait` (0 Scamper .. 1/3 Light .. 2/3 Lope .. 1 Heavy; bodies-poses.js
// GAIT_STYLES): a child scampers, the tall lope and the short scamper a little, a round build runs heavy (and a slim one lighter,
// toward Light and Lope), a feminine shape runs light. From a resolved look (build, height, shape, figure, scale).
export function gaitFor(o, kid = null) {
  const B = clamp((o.build ?? 0.5) + figureBuild(o.figure), 0, 1), H = o.height ?? 0.5, fem = o.shape ?? 0.5, k = kid ?? kidOf(o);
  let g = 0.5 + 0.5 * (H - 0.5) + 0.9 * Math.max(0, B - 0.5) - 0.25 * Math.max(0, 0.5 - B) - 0.22 * fem * (1 - smooth((B - 0.55) / 0.35));
  g = lerp(g, 0, k);
  return clamp(Math.round(g * 1000) / 1000, 0, 1);
}

function isFinitePos(v) { return Number.isFinite(v); }
// where the shoulder joints sit, out from the middle (the body type's warp moves them with the shoulders)
const shoulderX = D => D.wT * 0.8 * D.shape.fx(D.torsoTop - 0.105) + D.armR * 0.5;

// The cloth under each arm is tucked in, like cloth bunching under an arm, so the idle's arms hang straight down instead of in an
// A-pose (the shoulder joint sits at the edge of the torso, and a barrel of a torso is wider below it). In a band round where the
// standing idle's arm hangs (IDLE_ARM: nearly straight down, the elbow softly bent, the forearm a little forward), from just under
// the shoulder ball down to the hand, the torso and everything laid on it (shirt, jacket, vest, coat, lapels, belts, the bag's
// strap) is narrowed side to side by a scale, so every layer keeps its order and its outline, just enough to leave the arm's inner
// edge clear. The pelvis is tucked by the same scale (human.js warps it too, at its own height: the hem stays over the hips) where
// the pelvis shows below the hem only a little, never into the thigh, and a coat's or jacket's skirt with it (the hand may rest on
// its outside). The amount is measured off the garments themselves (their reach at the side, in 1 cm rows) after the body type's
// warp. Returns the warp (x, y, z, out) and `k(y, z)`, its side-to-side factor at chest height y (the fit's measures undo it:
// tools/avatar-fit-lib.mjs).
const TUCK_DY = 0.01, TUCK_MARGIN = 0.008, TUCK_MAX = 0.36, TUCK_SKIRT = 0.18, TUCK_HEM = 0.08;
function armTuck(p, D, o, T, yb, H) {
  const xS = shoulderX(D), yS = T - 0.105, r = D.armR, A = IDLE_ARM, SL = outfitSpec(o).sleeves, _ro = [0, 0];
  const ta = Math.tan(A.ab), yE = yS - D.Lu * Math.cos(A.sw), zE = D.Lu * Math.sin(A.sw), fa = A.sw + A.el;
  const yW = yE - D.Lf * Math.cos(fa), yHand = yW - 0.16 * D.shape.handK[1] * Math.cos(fa);
  // the hanging arm at chest height y: its axis' z, and the inner edge's x (its axis less its radius: a short sleeve's ball, the cuff, the hand)
  const zAt = y => (y >= yS ? 0 : y > yE ? (yS - y) * Math.tan(A.sw) : zE + (yE - y) * Math.tan(fa));
  const innerAt = y => {
    // (the arm's own outside at that height, its sleeve where it covers it: bodies-arm.js armOuterAt)
    const d = y > yE ? (yS - y) / Math.cos(A.sw) : D.Lu + (yE - y) / Math.cos(fa);
    const rr = y > yW ? (armOuterAt(Math.max(0, d), D, SL, _ro), _ro[0]) : 0.062 * D.shape.handK[0];
    return xS + (yS - y) * ta - rr - TUCK_MARGIN;
  };
  // the pelvis' reach at the side at chest height y (at rest the chest sits D.waist over the hips), and the thigh's outside under it
  const pelR = (D.hipX + 0.112) * D.shape.hipK;
  const thighAt = y => { const yh = y + D.waist; return D.hipX + 0.012 + (yh > 0 ? Math.sqrt(Math.max(0, D.legR * D.legR - yh * yh)) : D.legR - yh * 0.15); }; // (the thigh's outside: its round top over the hip joint, turned out a little lower down)
  const pelvisAt = y => { const v = (y + D.waist + 0.2) / 0.34; return v < 0 || v > 1 ? 0 : pelR * profileAt(PELVIS_PROFILE, v); };
  // the garments' reach at the side, in rows: every vertex near the arm's line, read back to the side of its ellipse
  const lo = yHand - 0.03, n = Math.ceil((yS + 0.02 - lo) / TUCK_DY) + 1, X = new Float32Array(n), d = new Float32Array(n);
  for (const list of p.by.values()) for (const g of list) {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = Math.abs(P.getX(i)), y = P.getY(i), z = P.getZ(i), row = Math.round((y - lo) / TUCK_DY);
      if (row < 0 || row >= n || x < D.wT * 0.4) continue;
      const dz = z - zAt(y);
      if (Math.abs(dz) > r) continue;
      const rz = Math.max(0.06, D.dT * profileAt(TORSO_PROFILE, clamp((y - yb) / H, 0, 1)));
      const e = x / Math.sqrt(Math.max(0.3, 1 - (dz / rz) ** 2));
      if (e > X[row]) X[row] = e;
    }
  }
  // (the lathes' rings are a few centimetres apart: a row between two takes the straight line between them)
  for (let i = 0, last = -1; i < n; i++) {
    if (!(X[i] > 0)) continue;
    if (last >= 0) for (let j = last + 1; j < i; j++) X[j] = X[last] + ((X[i] - X[last]) * (j - last)) / (i - last);
    last = i;
  }
  // (below the hem the pelvis shows: a little, and never past the thigh's outside; just above the hem no more than just below it,
  // easing up to TUCK_MAX: a hem tucked further than the hips under it would let them poke out at its sides)
  const showing = y => { const pv = pelvisAt(y); return Math.min(TUCK_SKIRT, pv > 0 ? Math.max(0, 1 - thighAt(y) / pv) : TUCK_SKIRT); };
  const atHem = showing(yb - 0.005);
  for (let i = 0; i < n; i++) {
    const y = lo + i * TUCK_DY, x = Math.max(X[i], pelvisAt(y));
    if (!(x > 0) || y > yS) continue;
    const most = y < yb ? showing(y) : atHem + (TUCK_MAX - atHem) * smooth((y - yb) / TUCK_HEM);
    d[i] = clamp(1 - innerAt(y) / x, 0, most) * smooth((yS - y) / (D.Lu * 0.3));
  }
  // smooth it down the body (each row the most of its neighbours, then softened: no ripples in the cloth)
  const dm = d.map((v, i) => Math.max(v, d[i - 1] || 0, d[i + 1] || 0)), ds = dm.map((v, i) => 0.25 * (dm[i - 1] ?? v) + 0.5 * v + 0.25 * (dm[i + 1] ?? v));
  const dAt = y => { const f = (y - lo) / TUCK_DY, i = Math.floor(f); if (i < 0 || i >= n - 1) return 0; return ds[i] + (ds[i + 1] - ds[i]) * (f - i); };
  const flat = 0.6 * r + Math.sin(IDLE_SWAY) * (yS - lo) * 0.5; // (the arm swings a little forward and back as it breathes: the band's flat middle covers it)
  const k = (y, z) => { const t = dAt(y); return t > 0 ? 1 - t * (1 - smooth((Math.abs(z - zAt(y)) - flat) / (1.6 * r))) : 1; };
  return { k, warp: (x, y, z, out) => { out[0] = x * k(y, z); out[1] = y; out[2] = z; return out; }, rows: { lo, dy: TUCK_DY, d: ds, X, inner: Array.from({ length: n }, (_, i) => innerAt(lo + i * TUCK_DY)), pelvis: Array.from({ length: n }, (_, i) => pelvisAt(lo + i * TUCK_DY)) } }; // (rows: the lab's numbers, tools/ik-idle-probe.mjs)
}

export class Human {
  // build (optional): { lite: true } for a still picture (the avatar creator's tiles): no arm fit, no idle arm search (the
  // arms hang at armClearance's angle), so a person builds in a few milliseconds
  constructor(opts = {}, build = null) {
    const o = this.opts = resolveLook(opts);
    const D = this.dims = bodyDims(o);
    this.kind = 'human';
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(o.scale);
    this.root.userData.inkSolid = true; // (fix/arm-ink: rigid-merge inks a person as one solid: only its silhouette)
    this.phase = Math.random() * TAU;
    this.anim = 'idle'; this.animT = 0; this.key = 'idle';
    this.lookYaw = 0;
    this.params = {}; // per-frame pose knobs set by whoever drives the character: lean (-1..1), spin, tension (0..1), danger (0..1, worried face on the swing), seatY (metres, where you sit)
    this.held = null; this.heldObj = null; this._heldKey = '';
    // the fishing gear (fish-gear.js): which pole a held 'rod' is, which lure dangles from its tip, and whether a cast
    // line is out (fishing.js sets lineOut while its line rig is drawn, so the dangling lure hides)
    this.pole = 'stick'; this.lure = 'none'; this.lineOut = false;
    this.dangle = { px: 0, pz: 0, vx: 0, vz: 0, tx: 0, ty: 0, tz: 0, ux: 0, uz: 0, live: false, spin: Math.random() * TAU };
    this.springs = [];
    this.talkT = 0;
    this.voiceLevel = 0; // 0..1, what this person's voice chat sounds like right now (voice.js): the mouth and brows follow it
    this.ik = ikState(); // bodies-ik.js: the arms' targets this frame, each foot's ground, whether we're near enough for any of it

    const eul = g => { g.rotation.order = 'YXZ'; return g; };
    eul(this.body);
    const hips = this.hips = eul(new THREE.Group());
    hips.position.y = D.legLen;
    this.body.add(hips);
    const chest = this.chest = eul(new THREE.Group());
    chest.position.y = D.waist;
    hips.add(chest);
    this.torso = chest;
    const skin = o.skin;

    // ---- pelvis, and a skirt or gown on its own group that follows the legs
    const spec = outfitSpec(o);
    const bareLegs = spec.bareLegs;
    const legCol = bareLegs ? skin : o.pants;
    {
      const p = new Part(), pt = { sx: (D.hipX + 0.112) * D.shape.hipK, sy: 0.34, sz: D.dT * 0.95 * (1 + (D.shape.hipK - 1) * 0.6) * D.shape.seatK, y: -0.2 };
      // above the waistline (just under the shirt's hem) the pelvis wears the top's colour: when the body bends or twists
      // at the waist and the hem rides up, what shows under it is shirt, never the trousers poking through it
      const topCol = o.outfit === 'overalls' ? o.pants : spec.base;
      if (topCol === spec.pelvisCol) p.add(lathe('pelvis', PELVIS_PROFILE, 18), spec.pelvisCol, pt);
      else {
        p.add(lathe('pelvis-cut', PELVIS_CUT, 18), spec.pelvisCol, pt);
        const g = p.by.values().next().value[0], P = g.attributes.position, C = g.attributes.color, top = new THREE.Color(topCol), yW = -0.2 + 0.34 * (WAIST_V + 0.0015);
        for (let i = 0; i < P.count; i++) if (P.getY(i) > yW) C.setXYZ(i, top.r, top.g, top.b);
      }
      this._pelvisPart = p; // built once the torso's tuck is known, which narrows it under the arms too
      this.skirt = buildSkirt(o, D);
      if (this.skirt) { hips.add(this.skirt.group); this.skirtRig = new SkirtRig(this.skirt, D); }
    }

    // ---- legs: hip > knee > ankle
    const makeLeg = side => {
      const hip = eul(new THREE.Group());
      hip.position.set(side * D.hipX, 0, 0);
      hips.add(hip);
      const r = D.legR;
      const tp = new Part();
      tp.add(capsuleGeo(r, D.Lt, 3, 10), o.bottoms === 'shorts' ? o.pants : legCol, { y: -D.Lt / 2 });
      wearLeg(tp, o, D, 'thigh', side); // (clothing-store: a bought bottom's thigh)
      hip.add(tp.build());
      const knee = eul(new THREE.Group());
      knee.position.y = -D.Lt;
      hip.add(knee);
      const sp = new Part();
      const shinCol = o.bottoms === 'shorts' ? skin : legCol;
      sp.add(capsuleGeo(r * 0.9, D.Ls, 3, 10), shinCol, { y: -D.Ls / 2 });
      if ((o.bottoms === 'shorts' || bareLegs) && o.shoeKind !== 'boots') sp.add(cylGeo(r * 0.94, r * 0.94, 0.1, 12), o.shoeKind === 'dress' ? skin : '#ffffff', { y: -D.Ls + 0.02 }); // socks
      wearLeg(sp, o, D, 'shin', side); // (clothing-store: a bought bottom's shin)
      knee.add(sp.build());
      const ankle = eul(new THREE.Group());
      ankle.position.y = -D.Ls;
      knee.add(ankle);
      const fp = new Part();
      buildShoe(fp, o, r);
      wearShoe(fp, o, D, side, r); // (clothing-store: bought shoes)
      ankle.add(fp.build());
      return { hip, knee, ankle };
    };
    this.legL = makeLeg(1); this.legR = makeLeg(-1);

    // ---- torso and outfit (bodies-outfit.js)
    const T = D.torsoTop;
    {
      const p = new Part();
      const yb = -0.06, H = T - yb;
      buildTorso(p, o, D, T, yb, H);
      wearChest(p, o, D, yb, H); // (clothing-store: a bought top, a dress's bodice, a scarf or a backpack, before the warps: they bend with the shirt)
      p.warp(D.shape.warp); // the body type bends the torso and everything laid on it together
      // ...and the cloth under each arm is tucked in so the arm hangs straight beside it; what is put on the torso later
      // (a bag's strap, a backpack, a scarf: bodies-gear uses D.shape.warp) is bent the same way
      const tuck = D.tuck = armTuck(p, D, o, T, yb, H), sw = D.shape.warp, tw = tuck.warp;
      p.warp(tw);
      D.shape.warp = sw ? (x, y, z, out) => { sw(x, y, z, out); return tw(out[0], out[1], out[2], out); } : tw;
      chest.add(this._torsoG = p.build());
      const pp = this._pelvisPart, wy = D.waist; this._pelvisPart = null;
      wearPelvis(pp, o, D); // (clothing-store: a bought bottom's hips, tucked with the pelvis)
      pp.warp((x, y, z, out) => { out[0] = x * tuck.k(y - wy, z); out[1] = y; out[2] = z; return out; }); // (the pelvis' frame: the chest sits D.waist over it)
      hips.add(this.pelvis = pp.build());
    }

    // ---- neck and head: the neck pivots at the top of the torso and takes a share of every nod and tilt, the head
    // joint at its top takes the rest (contents around the head centre, headY above the joint)
    const neck = this.neck = eul(new THREE.Group());
    neck.position.y = T;
    chest.add(neck);
    // the hood (the Cultist's cowl, an NPC-only hat) IS the head: no skin, face, hair or beard is drawn under it (they poked through),
    // the face is built hidden (the blink and talk code still drives it) and the neck takes the hood's shadow colour
    const hooded = o.hat === 'hood', sage = o.hat === 'sagehood'; // (sagehood: the Dungeon Master's hood, hair and beard, bodies-sage.js)
    {
      const p = new Part(), r = D.neckR;
      p.add(cylGeo(r, r * 1.1, D.neckY + 0.1, 12), hooded ? darker(o.hatColor, 0.5) : skin, { y: (D.neckY + 0.1) / 2 - 0.075 });
      neck.add(p.build());
    }
    const headJ = this.headJ = eul(new THREE.Group());
    headJ.position.y = D.neckY;
    neck.add(headJ);
    const headC = this.head = new THREE.Group();
    headC.position.y = D.headY;
    if (o.headSize !== undefined && o.headSize !== 1) { headC.scale.setScalar(o.headSize); headC.position.y = D.headY * o.headSize; } // (the NPC Editor: the head and all on it, still sitting on the neck)
    headJ.add(headC);
    this.headC = headC;
    const sh = shapeOf(o.faceShape);
    {
      const p = new Part();
      if (hooded) {
        const hidden = this.hiddenFace = new THREE.Group(); hidden.visible = false; headC.add(hidden);
        this.face = buildFace(hidden, o);
      } else {
        p.add(fullHeadGeo(o.faceShape), skin);
        if (!sage) for (const s of [-1, 1]) p.add(sphere(10, 8), skin, { sx: 0.05, sy: 0.075, sz: 0.045, x: s * sh.rx * 0.97, y: -0.02 * (sh.ry / 0.335), z: 0.01 }); // (under the sage's hair: none)
        this.face = buildFace(headC, o);
        if (sage) { const [front, key] = chestFront(this, chest, D, o); addSageHead(p, o, front, key); }
        else addFacialHair(p, o, this.face);
        // the hair is built to fit under the hat (a bow or a headband sits on top of the hair instead)
        const cover = o.wear?.hat ? hatCoverFor(o.wear.hat, o.hairStyle) : o.hat !== 'none' ? hatCover(o.hat, o.faceShape, o.hairStyle) : null; // (a bought hat: the hair is squashed and trimmed under its own dome's rim: clothing-wear.js)
        const hairSprings = sage ? [] : buildHair(headC, p, o, cover);
        headC.add(p.build());
        this.springs.push(...hairSprings);
      }
      if (o.hat !== 'none' && !sage) {
        const hat = buildHat(o.hat, o.hatColor, o.faceShape, o.hairStyle);
        if (hat) { this.hat = hat.group; headC.add(hat.group); this.springs.push({ node: hat.group, kind: 'hat', ax: 0, vx: 0, az: 0, vz: 0, gain: 0.3 }); this.springs.push(...hat.springs); }
      }
      // (clothing-store) a bought hat or glasses on the head: hidden while swimming (wornHead); a hat bobs like the code's
      const wh = wearHead(headC, o, sh);
      if (wh) { this.wornHead = wh; if (o.wear.hat) { this.hat = this.hat || wh; this.springs.push({ node: wh, kind: 'hat', ax: 0, vx: 0, az: 0, vz: 0, gain: 0.3 }); } }
    }
    if (o.acc && o.acc !== 'none') { const acc = buildAccessory(o.acc, o, D, chest, headC); this.springs.push(...acc); this.bag = acc.bag || null; } // (bag: the satchel's pivot, stepBag)
    // where the name tag sits: just above the top of the hair or hat (tall hats and tall people push it up), measured once
    {
      this.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(headC), c = new THREE.Vector3();
      headC.getWorldPosition(c);
      const s = this.root.scale.y || 1;
      const top = Number.isFinite(box.max.y) ? (box.max.y - c.y) / s : 0.45;
      const tagAnchor = this.tagAnchor = new THREE.Object3D();
      tagAnchor.position.y = top + 0.16;
      headC.add(tagAnchor);
      this.root.userData.tagAnchor = tagAnchor;
    }

    // ---- arms: shoulder > elbow > wrist
    const SL = spec.sleeves, longSleeves = SL.long, sleeveCol = SL.col;
    this.abMin = armClearance(D, o); this.idleAb = [IDLE_ARM.ab, IDLE_ARM.ab]; this.idleCa = [0, 0]; // (each side's, found by the fit below)
    // the torso's top under a point (chest frame), read off its own vertices near the shoulders: the sleeve's top is pressed onto it
    const torsoTop = (() => {
      const cell = 0.012, map = new Map(), map3 = new Map();
      this._torsoG.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(chest.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), nv = new THREE.Vector3();
      this._torsoG.traverse(mesh => {
        if (!mesh.isMesh) return;
        m.multiplyMatrices(inv, mesh.matrixWorld);
        const P = mesh.geometry.attributes.position;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m);
          if (Math.abs(v.x) < D.wT * 0.3 || v.y < T - 0.25) continue;
          const k = Math.round(v.x / cell) + ',' + Math.round(v.z / cell), h = map.get(k);
          nv.fromBufferAttribute(mesh.geometry.attributes.normal, i).transformDirection(m);
          if (h === undefined || v.y > h[0]) map.set(k, [v.y, nv.x, nv.y, nv.z]);
          const k3 = Math.round(v.x / cell) + ',' + Math.round(v.y / cell) + ',' + Math.round(v.z / cell); // (and in 3D: the nearest cloth to a point, its normal)
          let l = map3.get(k3); if (!l) map3.set(k3, l = []); l.push(v.x, v.y, v.z, nv.x, nv.y, nv.z);
        }
      });
      const nearest = (x, y, z, out) => { // the nearest torso vertex within 2.4 cm: [distance, nx, ny, nz]
        let best = 0.024 * 0.024, hit = false; const ix = Math.round(x / cell), iy = Math.round(y / cell), iz = Math.round(z / cell);
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) { const l = map3.get((ix + a) + ',' + (iy + b) + ',' + (iz + c)); if (l) for (let q = 0; q < l.length; q += 6) { const d = (l[q] - x) ** 2 + (l[q + 1] - y) ** 2 + (l[q + 2] - z) ** 2; if (d < best) { best = d; hit = true; out[0] = Math.sqrt(d); out[1] = l[q + 3]; out[2] = l[q + 4]; out[3] = l[q + 5]; } } }
        return hit;
      };
      const near = (x, z) => { let best = null; const ix = Math.round(x / cell), iz = Math.round(z / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const h = map.get((ix + a) + ',' + (iz + b)); if (h !== undefined && (!best || h[0] > best[0])) best = h; } return best; };
      return { top: (x, z) => near(x, z)?.[0] ?? -Infinity, nearest };
    })();
    const makeArm = side => {
      const sPos = [side * shoulderX(D), T - 0.105, 0];
      const shoulder = eul(new THREE.Group());
      shoulder.position.set(...sPos);
      chest.add(shoulder);
      const elbow = eul(new THREE.Group());
      elbow.position.y = -D.Lu;
      shoulder.add(elbow);
      // one smooth skinned tube from the shoulder to the wrist, its sleeve a shell over it (bodies-arm.js)
      const bones = makeArmBones(chest, shoulder, elbow, D.Lu);
      const built = buildArmMesh(side, D, SL, { skin, sleeve: SL.cap ? o.shirt : sleeveCol, cuff: SL.jacket ? darker(sleeveCol, 0.9) : SL.cuff, shirtCuff: SL.cuff },
        (x, z) => torsoTop.top(x + sPos[0], z + sPos[2]) - sPos[1], bones.list, (x, y, z, out) => torsoTop.nearest(x + sPos[0], y + sPos[1], z + sPos[2], out));
      shoulder.add(built.mesh);
      const wrist = new THREE.Group();
      wrist.position.y = -D.Lf;
      elbow.add(wrist);
      // a cartoon hand: a palm block, a thumb and four short thick fingers that curl (bodies-hands.js)
      const [hw, hl] = D.shape.handK, hand = buildHand(wrist, side, skin, hw, hl, o.accessory === 'book' ? ['book'] : null); // (a book holder's hands also have the flat 'book' shape)
      for (const g of Object.values(hand.shapes)) keepCorners(g, false, true); // a hand over a table top keeps its lowest point above it: its hull
      wrist.userData.wrist = true;
      const anchor = new THREE.Object3D();
      anchor.position.set(...gripAt(side)); // (in the hollow the closed hand makes on its palm side: held things sit in the grip)
      wrist.add(anchor);
      return { shoulder, elbow, wrist, anchor, hand, bones, mesh: built.mesh, sleeve: built.sleeve };
    };
    this.armL = makeArm(1); this.armR = makeArm(-1);
    { const ro = armOuterAt(D.Lu + D.Lf * 0.7, D, SL); this.sleeveOut = Math.max(0, Math.max(ro[0], ro[1]) - D.armR * 0.9); } // how far a wide sleeve stands off the forearm: a hand on the belly is held that much further off
    { let m = 0; const ro = [0, 0]; for (let d = D.Lu - 0.02; d <= D.Lu + D.Lf; d += 0.02) { armOuterAt(d, D, SL, ro); m = Math.max(m, ro[0], ro[1]); } this.foreOut = m; } // (follow-up C: the forearm's outside from the elbow to the wrist, its sleeve included: a forearm laid on an armrest rides this far over it)
    this._shY = T - 0.105; // (the shoulders' height; a pose drops them a touch: shd)
    // anchors other systems attach things to (a fishing line starts at rodTip; the right hand holds treats and fish)
    this.handR = this.armR.anchor; this.handL = this.armL.anchor;
    this.rodTip = new THREE.Object3D();

    if (o.accessory) this.addAccessory(o.accessory);
    this.fit = build?.lite ? null : fitEnvelopes(this);
    if (this.fit) { // arms at rest hang clear of the cloth itself, not only of armClearance's outline (no fitting every frame)
      // (through the idle's sway: the arm a little forward and back, the chest rolled a little on the hips)
      const clear = (ab, el, sws, m) => [-0.035, 0.035].every(rz => { this.chest.rotation.z = rz; fitFrame(this);
        return sws.every(sw => fitPen(this, this.armL, 1, sw, ab, 0, el, 0) <= -m && fitPen(this, this.armR, -1, sw, ab, 0, el, 0) <= -m); });
      // searched up from close by the body, not from armClearance's outline: that knows nothing of the cloth tucked under the arms,
      // and its spread for a straight arm is an A-pose
      let ab = 0.03;
      while (ab < 0.9 && !clear(ab, 0.19, [-0.06, 0.06], 0.006)) ab += 0.01;
      this.fit.abMin0 = this.abMin;
      // The standing idle's own arm, each side (bodies-poses idle: IDLE_ARM's swing and bend): the least abduction and carrying angle
      // that keep it clear of the cloth, the hips and a skirt through the idle's breathing and sway (the arm a little forward and back,
      // the elbow a little more and less bent, the chest rolled over the standing leg as the idle rolls it: the two sides differ), so
      // there is nothing to fit while it stands and nothing fights the pose frame to frame. The upper arm stays as near straight down as
      // the cloth allows (IDLE_ARM.ab, what armTuck cut it for), the forearm angles out past the hips by its carrying angle (up to
      // IDLE_CA), and only past that does the whole arm open out (a wide coat, a gown).
      const A = IDLE_ARM, sws = [A.sw - IDLE_SWAY, A.sw + IDLE_SWAY], els = [A.el - 0.035, A.el + 0.035];
      const ok = (i, ab, ca) => { // (the shoulders dropped a touch as the idle drops them; the chest pitched and rolled through the idle's range)
        const arm = i ? this.armR : this.armL, side = i ? -1 : 1, y0 = arm.shoulder.position.y;
        arm.shoulder.position.y = y0 - 0.014;
        let clear = true;
        // (the chest rolls the other way too when the weight goes over to the right leg: rz -0.027 .. 0.027)
        for (const rx of [0, 0.015, 0.03]) for (const rz of [-0.027, -0.012, 0.003, 0.015, 0.027]) { this.chest.rotation.x = rx; this.chest.rotation.z = rz; fitFrame(this); for (const sw of sws) for (const el of els) if (clear && fitPen(this, arm, side, sw, ab - 0.01, 0, el, 0, ca) > -IDLE_GAP) clear = false; }
        arm.shoulder.position.y = y0; this.chest.rotation.x = 0;
        return clear && this.skirtClear(i, ab - 0.01, els[0], A.sw, ca);
      };
      this.idleAb = [0, 0]; this.idleCa = [0, 0];
      for (let i = 0; i < 2; i++) {
        let ai = 0.02, ca = 0;
        while (ai < A.ab && !ok(i, ai, IDLE_CA)) ai += 0.01;
        if (ok(i, ai, 0)) ca = 0;
        else if (ok(i, ai, IDLE_CA)) { let lo = 0, hi = IDLE_CA; for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (ok(i, ai, m)) hi = m; else lo = m; } ca = hi; }
        else { ca = IDLE_CA; while (ai < 0.9 && !ok(i, ai, ca)) ai += 0.005; }
        this.idleAb[i] = ai; this.idleCa[i] = ca;
      }
      // walking takes the close floor too, or the walk's arms are nearly a T-pose (the one-piece arm's fit keeps the room), easing
      // back to abMinPose as a walk speeds into a run. abMinPose is left to the poses that hang an arm without a fit-friendly swing.
      // (A hanging arm keeps at least abMinPose in every pose but standing at ease: armClearance's outline or the cloth's, whichever
      // is further out, since a swinging, running arm wants that room. Standing at ease the arm hangs as close as its own idle fit
      // found (abMin). The floor eases between the two as the pose changes: update's abFloor)
      this.abMinPose = Math.max(this.abMin, ab);
      this.abMin = Math.min(this.abMin, ab, Math.min(...this.idleAb) - 0.01); // (the fit opens either further when it must)
      this.chest.rotation.z = 0; this.fit.calls = 0;
    }
    shadows(this.root, true, false);
    this.root.traverse(m => { if (m.isMesh && m.layers.mask !== 1) { m.castShadow = false; } });

    // ---- animation state
    this.pose = new Pose(); this.snap = new Pose(); this.cur = new Pose(); this.out = new Pose();
    this.fade = 1; this.fadeDur = 0.16;
    this.cyc = Math.random();       // walk cycle, driven by distance travelled
    this.cycN = 0;                  // which cycle (an occasional stride is a longer bound: see gait())
    this.runMem = 0;                // how much of a run this was a moment ago (the skid when it stops)
    this.gaitSeed = Math.floor(this.phase * 1000);
    // a little personality per person in the dances: four numbers 0..1 from the look itself, so every client agrees
    { const ls = hashStr([o.shirt, o.pants, o.skin, o.hair, o.hat, o.hairStyle, o.outfit, o.body].join('|')); this.style = [0, 1, 2, 3].map(k => ((Math.imul(ls ^ (k * 0x9e3779b9), 0x85ebca6b) >>> 0) % 10007) / 10007); }
    this._snapIK = [0, 0]; // which arms the IK had placed when the current blend began (2: on a thing near the body, as solveArm says)
    this._pron = [0, 0];   // each wrist's turn about its forearm (rad, eased): a handle through the fist kept the right way up (stepGrips)
    this.emoteEnd = undefined;      // when the emote playing now ends (the t passed to update; player.js / net.js set it): the pose settles back by then
    this.rootSpd = 0; this.lastX = null; this.lastZ = null; // how fast the root itself moves over the ground (m/s, smoothed): the swim reads it (a takeover passes speed 0)
    // the run style (bodies-poses loco, GAIT_STYLES): the look's own `gait` 0..1, else picked from the body (gaitFor:
    // kids scamper, the tall lope, the round run heavy, the feminine light). `fem` still shapes the walk's hip sway.
    this.fem = o.shape;
    this.kidK = kidOf(o);
    this.gait = Number.isFinite(o.gait) ? o.gait : gaitFor(o, this.kidK);
    this.moving = false;
    this.lastYaw = null; this.lastY = null; this.lastSpeed = 0;
    this.turn = 0; this.vy = 0; this.accF = 0; this.ay = 0; this.lastBob = 0; this.lastVBob = 0;
    this.sq = { x: 0, v: 0 };           // squash and stretch spring
    this.lean = { x: 0, v: 0 };         // pitch spring (accelerating and braking)
    this.bank = { x: 0, v: 0 };         // roll spring (into turns)
    this.twist = { x: 0, v: 0 };        // yaw spring (anim-redo: turning, the chest lags the feet a beat and the head leads)
    this._sat = false;                  // (anim-redo: this person was on a seat last frame: standing up blends out longer)
    this.blinkT = 1 + Math.random() * 3; this.blinkP = 0;
    this.expr = { eye: 1, smile: 0.4, open: 0, brow: 0, tilt: 0, mw: 1 };
    // real eyes: where they look (x: the person's left, y: up; -1..1), the target and when it next moves; the lid state
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, t: 0.5 + Math.random() * 2 };
    // attention (gaze.js): whom this person looks at and how far the look has turned. tgt: a Human, an Object3D or a point;
    // why: 'talk' | 'hear' | 'watch' | 'force'; hy/hx the head's turn and pitch (rad, from the body's facing, + left / + down),
    // ey/ex the eyes' share (in the head, + left / + up), sy the shoulders', w how much of it is in; lag: the head waits a beat
    this.attn = { on: false, w: 0, tgt: null, why: '', fresh: false, to: null, watch: null, watchUntil: 0, force: null, forceUntil: 0, talkUntil: 0,
      hy: 0, hx: 0, vhy: 0, vhx: 0, ey: 0, ex: 0, vey: 0, vex: 0, sy: 0, lag: 0, ny: 0, nx: 0, err: 0 };
    this._eyeSt = { lidU: 0, lidL: 0, gx: 0, gy: 0 };
    this.rod = this.rod || null; this.rodSpring = { x: 0, v: 0 }; // (an NPC built with a rod accessory already has one: keep it, so it bends and its lure hangs)
    this.wasAir = false; this.landT = 0;
    this._ctx = {};
    this._eyes = [this.face.eyeL, this.face.eyeR]; this._brows = [this.face.browL, this.face.browR];
  }

  // Say something with the mouth for a few seconds (the chat bubble is drawn elsewhere). `to`: whom it is said to (a Human, an
  // Object3D or a point: gaze.js turns the eyes and head to them while the talking lasts; without it, the nearest person in front)
  say(secs = 1.5, to = undefined) { this.talkT = Math.max(this.talkT, secs); if (to !== undefined) this.attn.to = to; }
  // Look at a thing for `secs` whatever else is going on (the DM's notes, the faces round a table). Counted in frames at 30 a
  // second (gaze.js: a clock that jumps, as a test's does between its steps, must not end a look early)
  lookAt(target, secs = 1) { const A = this.attn; A.force = target; A.forceUntil = GAZE.frame + secs * 30; }
  // Watch a thing while nobody is talking to you and you are not talking (a rolling die)
  watch(target, secs = 1) { const A = this.attn; A.watch = target; A.watchUntil = GAZE.frame + secs * 30; }

  addAccessory(kind) {
    const D = this.dims, hand = this.handR;
    if (kind === 'lantern') {
      const l = new THREE.Group();
      l.position.set(0, -0.13, 0.02); // hung below the fist, by a longer handle: the fingers close over it, not through the lid
      const p = new Part();
      p.add(new THREE.BoxGeometry(1, 1, 1), '#3a3226', { sx: 0.16, sy: 0.03, sz: 0.16, y: 0.03 });
      p.add(new THREE.BoxGeometry(1, 1, 1), '#ffd27a', { sx: 0.12, sy: 0.16, sz: 0.12, y: -0.07, opts: { emissive: '#ffd27a' } });
      p.add(new THREE.BoxGeometry(1, 1, 1), '#3a3226', { sx: 0.16, sy: 0.03, sz: 0.16, y: -0.17 });
      p.rod([0, 0.03, 0], [0, 0.15, 0], 0.008, '#3a3226'); // (up into the middle of the fist, no further)
      l.add(p.build({ cast: false }));
      hand.add(l);
      this.lantern = l; l.userData.grip = 0.95;
    } else if (kind === 'satchel') {
      this.bag = buildAccessory('satchel', this.opts, D, this.chest, this.headC).bag || null; // the same messenger bag as the look's "satchel"
    } else if (kind === 'book') {
      // a closed book stood on its edge against the flat hand (bodies-hands.js 'book'): the back cover flat on the palm and the fingers, the front cover
      // (and its gold title plate) facing the way the palm does, the thumb along the fore-edge. It used to sit half through the
      // hand, the curled fingers out through its pages (qol-fixes); the place is the one where no part of the hand is inside it
      // (tools/qol-fixes-book-search.mjs). Covers, spine and pages meet without sharing a face (no flicker).
      const p = new Part(), box = new THREE.BoxGeometry(1, 1, 1), W = BOOK.w, H = BOOK.h, T = BOOK.t, c = 0.008, red = '#7a2f3a';
      for (const sd of [-1, 1]) p.add(box, red, { sx: c, sy: H, sz: W - c, x: sd * (T - c) / 2, z: c / 2 }); // (the covers, from the spine)
      p.add(box, red, { sx: T, sy: H, sz: c, z: (c - W) / 2 });                                               // (the spine, at the little finger's side)
      p.add(box, '#f3efe6', { sx: T - 2 * c - 0.002, sy: H - 0.012, sz: W - c - 0.006, z: (c - 0.006) / 2 });  // (the pages, set in)
      p.add(box, '#e3b04a', { sx: 0.002, sy: 0.034, sz: 0.09, x: -T / 2 - 0.001, y: 0.04, z: 0.008 });        // (the title plate)
      const g = p.build();
      { const [hw, hl] = D.shape.handK, A0 = gripAt(1), at = BOOK.at; g.position.set((A0[0] + at[0]) * hw - A0[0], (A0[1] + at[1]) * hl - A0[1], (A0[2] + at[2]) * hw - A0[2]); } // (found for a standard hand: moved with this hand's size, which scales from the wrist)
      g.rotation.x = BOOK.rx;
      this.handL.add(g);
      this.book = g; g.userData.grip = 0.42; g.userData.hand = 'book';
    } else if (kind === 'notepad') {
      // a reporter's notebook in the left hand (its cover flipped up over the top) and a pencil in the right
      const p = new Part();
      p.add(new THREE.BoxGeometry(1, 1, 1), '#f3efe6', { sx: 0.04, sy: 0.21, sz: 0.15, y: -0.03, z: 0.06 });
      p.add(new THREE.BoxGeometry(1, 1, 1), '#5a4632', { sx: 0.046, sy: 0.014, sz: 0.155, y: 0.08, z: 0.06 });
      p.add(new THREE.BoxGeometry(1, 1, 1), '#5a4632', { sx: 0.014, sy: 0.1, sz: 0.155, x: -0.03, y: 0.125, z: 0.06, rz: 0.5 });
      for (let i = 0; i < 5; i++) p.add(new THREE.BoxGeometry(1, 1, 1), '#9aa6b8', { sx: 0.042, sy: 0.005, sz: 0.11, y: 0.04 - i * 0.032, z: 0.065 });
      const pad = p.build();
      this.handL.add(pad);
      const q = new Part();
      q.add(cylGeo(0.009, 0.009, 0.15, 6), '#f2c14e', { y: -0.02, z: 0.04, rx: 0.5 });
      q.add(coneGeo(6), '#e8cfa0', { sx: 0.009, sy: 0.025, sz: 0.009, y: -0.1, z: 0.08, rx: 0.5 + Math.PI });
      q.add(cylGeo(0.01, 0.01, 0.02, 6), '#e07a8a', { y: 0.06, z: 0.0, rx: 0.5 });
      hand.add(q.build());
      this.notepad = pad; pad.userData.grip = 0.42;
    } else if (kind === 'candle') {
      // a candle in a little brass holder with a ring handle, lit (the flame glows: its own small material, as the lantern's)
      const g = new THREE.Group();
      g.position.set(0, -0.075, 0.04); // below the bigger fist
      const p = new Part();
      p.add(cylGeo(0.07, 0.06, 0.02, 12), '#b8892e', { y: 0.0 });
      p.add(torusGeo(0.025, 0.007, TAU, 4, 10), '#b8892e', { x: 0.07, y: 0.0, rx: Math.PI / 2 });
      p.add(cylGeo(0.026, 0.028, 0.14, 10), '#efe6cf', { y: 0.08 });
      p.add(cylGeo(0.022, 0.022, 0.012, 10), '#e3d6b6', { y: 0.155 });
      p.add(cylGeo(0.003, 0.003, 0.02, 4), '#2a2228', { y: 0.165 });
      g.add(p.build({ cast: false }));
      // the flame, its own mesh: where fires.js draws a real flame it hides this one (the wick's top is userData.wick, in g's frame)
      const fl = new Part(); fl.add(sphere(8, 6), '#ffcf5a', { sx: 0.016, sy: 0.034, sz: 0.016, y: 0.195, opts: { emissive: '#ffcf5a' } });
      const flame = fl.build({ cast: false }); flame.name = 'candle-flame'; g.add(flame);
      g.userData.flame = flame; g.userData.wick = [0, 0.172, 0];
      hand.add(g);
      this.candle = g; g.userData.grip = 0.78;
    } else if (kind === 'rod') {
      this.setHeld('rod');
    } else if (kind === 'balloon') {
      const b = new THREE.Group();
      const p = new Part();
      p.add(cylGeo(0.006, 0.006, 1.23, 4), '#ffffff', { y: 0.615 }); // up to the knot (it ran on up inside the balloon)
      p.add(sphere(14, 10), '#ff6fa8', { sx: 0.2, sy: 0.24, sz: 0.2, y: 1.5 });
      p.add(sphere(6, 4), darker('#ff6fa8', 0.8), { sx: 0.03, sy: 0.02, sz: 0.03, y: 1.25 });
      b.add(p.build({ cast: false }));
      hand.add(b);
      this.balloon = b; b.userData.grip = 0.86;
    } else if (kind === 'trowel') {
      const p = new Part();
      p.add(new THREE.BoxGeometry(1, 1, 1), '#9aa0a8', { sx: 0.05, sy: 0.02, sz: 0.18, y: -0.02, z: 0.12 });
      p.add(cylGeo(0.02, 0.02, 0.09, 6), '#8a5a3a', { y: -0.0 });
      hand.add(p.build());
    }
    // each held thing keeps the corners of its box, so a hand over a table top can keep it above the top whatever way
    // the hand is turned (bodies-ik.js keepCorners; the lantern, candle and balloon hang level: their box is read upright)
    for (const g of [this.lantern, this.candle, this.balloon, this.book, this.notepad, this.handR.children[this.handR.children.length - 1]]) {
      if (g && !g.userData.corners && g.parent) keepCorners(g, g === this.lantern || g === this.candle || g === this.balloon);
    }
  }

  // What is in the right hand: null, 'rod' (or 'rod-<pole>', codes.js HELD_CODES: which pole), 'treat' or 'fish'
  // (opts: { color, size } for the fish). A rod of any pole reads back as held === 'rod'; `pole` says which.
  setHeld(kind, opts = {}) {
    const isRod = kind === 'rod' || (typeof kind === 'string' && kind.startsWith('rod-'));
    const key = kind ? kind + '|' + (opts.color || '') + (opts.size || '') : '';
    if (key === this._heldKey) return;
    this._heldKey = key;
    if (this.heldObj) {
      this.handR.remove(this.heldObj);
      if (this.rod) { this.rodTip.removeFromParent(); this.rod.dangle?.removeFromParent(); } // fishing reads rodTip.parent: only set while the rod is held; the tip is reused, its lure is not
      this.heldObj.traverse(m => { if (m.isMesh && m.geometry && !m.userData.shared) m.geometry.dispose(); }); // each held thing owns its geometry (shared lure geometry stays)
      this.heldObj = null;
    }
    this.held = isRod ? 'rod' : kind || null;
    this.rod = null;
    if (!kind) return;
    let g;
    if (isRod) {
      this.pole = poleFromHeld(kind);
      const r = buildRod(this.rodTip, this.pole); g = r.group; this.rod = r;
      r.dangle = buildDangle(this.lure, this.pole); this.rodTip.add(r.dangle); this.dangle.live = false;
    }
    else if (kind === 'treat') g = buildTreat();
    else if (kind === 'fish') g = buildFish(opts.color, opts.size);
    else if (kind === 'gamebox') g = buildGameBox(); // (table-games: a box off the store's shelf)
    else return;
    this.heldObj = g;
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    g.userData.grip = isRod ? 0.78 : kind === 'fish' ? 0.4 : 0.6; // (round the pole; under a fish's belly; round a treat)
    if (kind === 'gamebox') g.userData.upright = true; // (carried level whatever the arm does: bodies-fix)
    if (!isRod) keepCorners(g, kind === 'gamebox'); // a treat or a fish in a hand over a table stays above the top; the pole is let through
    this.handR.add(g);
  }

  // Which lure dangles from the rod tip (fish-gear.js BAITS id). Only the dangling bit is rebuilt.
  setLure(id) {
    id = cleanBait(id);
    if (id === this.lure) return;
    this.lure = id;
    const R = this.rod;
    if (!R) return;
    if (R.dangle) R.dangle.removeFromParent();
    R.dangle = buildDangle(id, this.pole); this.rodTip.add(R.dangle); this.dangle.live = false;
  }

  // Free the geometry this person owns (each Human's merged parts are unique). Call after taking one out of the scene.
  dispose() {
    this.root.traverse(m => { if (m.isMesh && m.geometry && !m.userData.shared) m.geometry.dispose(); });
  }

  // speed in m/s; anim is an emote/pose name or 'idle'/'walk' (or null to pick from the speed).
  update(dt, t, speed = 0, anim = null) {
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    if (!isFinitePos(speed)) speed = 0;
    const root = this.root, o = this.opts, D = this.dims, P = this.params;
    speed /= o.scale; // the rig is in the root's units: a scaled-down kid covers more of its own strides per metre
    // a stray NaN from a caller would poison the springs for good: knobs must be numbers
    for (let i = 0; i < PARAM_KEYS.length; i++) { const k = PARAM_KEYS[i]; if (P[k] !== undefined && !Number.isFinite(P[k])) P[k] = 0; }

    // ---- what the body is doing, read from how the root moved
    const yaw = root.rotation.y, y = root.position.y;
    if (this.lastYaw === null) { this.lastYaw = yaw; this.lastY = y; }
    let dyaw = yaw - this.lastYaw; dyaw -= TAU * Math.round(dyaw / TAU);
    this.turn += (clamp(dyaw / dt, -9, 9) - this.turn) * Math.min(1, dt * 10);
    const rawVy = clamp((y - this.lastY) / dt, -14, 14);
    this.vy += (rawVy - this.vy) * Math.min(1, dt * 14);
    this.lastYaw = yaw; this.lastY = y; this._dyaw = dyaw;
    let placed = this.lastX === null; // (anim-seat: the first update ever, or the root set down far from where it was: a person placed, not one who walked here)
    { const x = root.position.x, z = root.position.z; if (this.lastX === null) { this.lastX = x; this.lastZ = z; }
      const d = Math.hypot(x - this.lastX, z - this.lastZ), v = Math.min(12, d / dt); this.lastX = x; this.lastZ = z;
      if (d > 1.2) placed = true;
      this.rootSpd += (v - this.rootSpd) * Math.min(1, dt * 6); }
    const accRaw = clamp((speed - this.lastSpeed) / dt, -40, 40);
    this.accF += (accRaw - this.accF) * Math.min(1, dt * 8);
    this.lastSpeed = speed;

    // ---- which pose
    const moving = this.moving ? speed > 0.12 : speed > 0.3;
    if (moving !== this.moving) { this.moving = moving; }
    let name = anim || 'idle';
    if (name === 'walk' || name === 'run' || name === 'idle') name = moving ? 'loco' : 'idle';
    else if (!isKnownPose(name)) name = moving ? 'loco' : 'idle';
    else if (name === 'jump') name = 'jump';
    if (name !== this.key) {
      // cross-fade: freeze what is on screen and ease into the new pose
      const prev = this.key;
      // anim-seat: the sit-down (bodies-poses sitDown) plays only for someone who was standing here and sits now: not for one first
      // drawn already seated (a late joiner's view, a town folk coming into view, a clock that jumped) or set down onto the seat from afar
      this._sitFresh = name === 'sit' && !placed && prev !== 'lie' && prev !== 'sit';
      this.snap.copyFrom(this.out);
      const sn = this.snap; // a tumble is periodic: fade from its nearest whole turn, or the body would unwind backwards in 0.17 s
      sn.brx -= TAU * Math.round(sn.brx / TAU); sn.bry -= TAU * Math.round(sn.bry / TAU); sn.brz -= TAU * Math.round(sn.brz / TAU);
      sn.lik = sn.rik = 0; // the arms' angles in the snap are where the IK left them: the new pose's targets fade in from there
      for (let i = 0; i < 2; i++) { const A = this.ik.arm[i]; this._snapIK[i] = A.w > 0.01 ? (A.follow || A.frame === 'head' || A.frame === 'chest' ? 2 : 1) : 0; A.w = 0; A.on = false; } // and the old targets end here (their eased weight laid over the snap's angles, already IK'd, pulled a whispering hand 19 cm in a frame as you walked off)
      this.key = name; this.animT = 0; this.fade = 0;
      if (this.wornHead) this.wornHead.visible = name !== 'swim'; // (clothing-store: a bought hat comes off in the water)
      this.fadeDur = name === 'jump' || name === 'hook' || name === 'throw' || name === 'cast' ? 0.09 : name === 'startle' ? 0.14 : 0.17;
      // the emotes carry their own anticipation in and settle out (bodies-poses EMOTES): the blend into one is a little
      // longer, out of one longer still (walking off mid-cheer brings the arms down over a quarter second, not in a snap), and up off
      // the ground slower again (getting up)
      if (EMOTES.has(prev) && !(prev === 'sit' && (P.seatY || 0) > 0.15)) this.fadeDur = prev === 'sit' ? 0.45 : prev === 'swim' ? 0.4 : 0.28;
      else if (EMOTES.has(name) && name !== 'startle') this.fadeDur = name === 'swim' ? 0.4 : 0.22;
      if (prev === 'sit' && this._sat && name !== 'lie') { this.fadeDur = 0.4; this.sq.v -= 1.1; } // (anim-redo: up off a seat is a rise over 0.4 s with a little settle, not a 0.17 s cut)
      // anticipation and follow-through: squash down and spring up as a jump starts, splat when it ends (the emotes' own settle is
      // in their poses: a kick on the squash spring at every emote's start and end moved the head 3 cm in one frame)
      if (name === 'jump') { this.sq.x = -0.14; this.sq.v = 8; }
      else if (prev === 'jump') { this.sq.x = -0.15; this.sq.v = -1; this.landT = 0.3; }
      else if (prev === 'loco' && this.runMem > 0.3) this.sq.v -= 2.2 * this.runMem; // a run ends in a settle
    }
    this.anim = name;
    this.animT += dt;
    this.fade = Math.min(1, this.fade + dt / this.fadeDur);
    this._sat = name === 'sit' && (P.seatY || 0) > 0.15;

    // walk cycle from the distance travelled, so the feet keep up with the ground (and the same on every framerate and
    // for interpolated remote players). As speed grows the strides get longer: a stroll is about 2 cycles a second,
    // a run drops to about 2 (the long heavy style) or 2.4 (the light quick one) with real airtime, instead of the
    // legs whirring at 3. A planted foot travels back 2S per stance whatever the stride, so the stance takes the same
    // fraction of the cycle the ground takes to pass under it (no sliding by construction); longer strides mean flight.
    const runK = smooth((speed - 3) / 4.2);
    const fem = this.fem, kid = this.kidK, ctx = this._ctx; // (ctx reused every frame: no per-frame allocations)
    // the run style's neighbours on the four-style table (bodies-poses gait4): which pair and how far between them
    { const gu = clamp(this.gait, 0, 1) * 3, gi = Math.min(2, Math.floor(gu)); ctx.gi = gi; ctx.gf = gu - gi; }
    const walkStride = (0.42 + 0.19 * clamp(speed, 0, 5.5)) * (1 - 0.12 * kid);
    const runStride = gait4(ctx, 2.5, 3.0, 3.9, 3.3) * (1 - 0.12 * kid); // (Scamper's short quick strides .. Lope's long ones; Heavy shorter than Lope)
    // not a metronome: every cycle is a little different (2-4% at a walk, more the faster the walk: two walkers never march in
    // step), one in five at a run is a longer bound, and a hard turn gets a half-skip (more air on the inside foot). The cycle
    // number is deterministic so remote copies agree with themselves.
    const g1 = hash01(this.cycN * 3 + this.gaitSeed), g2 = hash01(this.cycN * 3 + 1 + this.gaitSeed);
    const bound = runK * (g1 < 0.2 ? smooth((0.2 - g1) / 0.1) : 0);
    const skip = runK * smooth((Math.abs(this.turn) - 1.2) / 2.2);
    const stride = lerp(walkStride, runStride, runK) * (1 + 0.06 * (g2 - 0.5) * (1 - runK) * clamp(speed / 2.5, 0, 1) + 0.06 * (g2 - 0.5) * runK + 0.22 * bound);
    const Lre = D.Lr * (1 - lerp(0.02, gait4(ctx, 0.07, 0.06, 0.08, 0.1), runK));
    const S = Math.min(stride * 0.25, lerp(0.32, 0.21, runK), Lre * 0.85); // half the distance a planted foot travels back (a run lands under the body)
    const duty = (2 * S) / stride;                        // the fraction of the cycle it is planted (0.5 at a walk)
    if (speed > 0.05) { const n = this.cyc + (speed * dt) / stride; if (n >= 1) this.cycN++; this.cyc = n % 1; }
    this.runMem = Math.max(runK, this.runMem - dt * 2.5);
    const brake = smooth(-this.accF / 18) * smooth(this.runMem / 0.5); // skidding to a stop out of a run

    // ---- springs: squash, lean into acceleration, bank into turns (before the pose: the IK undoes the lean so the
    // feet stay where they were planted while the body tips)
    const sq = this.sq;
    sq.v += (-260 * sq.x - 16 * sq.v) * dt; sq.x += sq.v * dt;
    const ln = this.lean;
    const leanT = clamp(this.accF * lerp(0.014, 0.009, runK), -0.28, 0.28); // a run already leans in its pose
    ln.v += (110 * (leanT - ln.x) - 11 * ln.v) * dt; ln.x += ln.v * dt;
    const bk = this.bank;
    const bankT = clamp(-this.turn * 0.028 * Math.min(1, speed / 3), -0.28, 0.28);
    bk.v += (90 * (bankT - bk.x) - 10 * bk.v) * dt; bk.x += bk.v * dt;
    // anim-redo: turning, the upper body overlaps the turn: the chest lags the feet a beat (it turns the other way, relative) and the
    // head leads into it (the eyes go first); in place or walking. Written into the pose's channels before the attention's look, so
    // a look at someone is never pulled off by it
    const tw = this.twist, twistT = clamp(-this.turn * 0.07, -0.22, 0.22);
    tw.v += (80 * (twistT - tw.x) - 12 * tw.v) * dt; tw.x += tw.v * dt;
    if (this.landT > 0) this.landT -= dt;
    this.stepTurnFeet(dt, name, moving);
    this.leanX = ln.x * (moving ? 0.9 : 0.6);

    this.ik.near = ikNear(root); this._dt = dt; // only near the camera: the pose code puts the feet on the ground and asks for hand targets, solveArm answers them
    ctx.t = t; ctx.dt = dt; ctx.speed = speed; ctx.runK = runK; ctx.stride = stride; ctx.duty = duty; ctx.S = S; ctx.Lre = Lre; ctx.cyc = this.cyc; ctx.a = this.animT; ctx.moving = moving; ctx.turn = this.turn; ctx.vy = this.vy; ctx.ph = this.phase;
    ctx.left = this.emoteEnd === undefined ? Infinity : this.emoteEnd - t; ctx.sty = this.style; ctx.rootSpd = this.rootSpd; ctx.sitFresh = !!this._sitFresh;
    ctx.fem = fem; ctx.kid = kid; ctx.bound = bound + skip * 0.6; ctx.brake = brake; ctx.acc = this.accF;

    // ---- pose -> channels, blended from the frozen pose
    const cur = this.cur;
    cur.reset();
    computePose(this, name, ctx, cur);
    const e = smooth(this.fade), out = this.out, snap = this.snap;
    if (e >= 1) out.copyFrom(cur);
    else for (const k of POSE_KEYS) out[k] = snap[k] + (cur[k] - snap[k]) * e;
    if (Math.abs(tw.x) > 1e-4 && name !== 'swim' && name !== 'climb' && name !== 'lie') { const q = tw.x * (moving ? 0.6 : 1); out.cry += q; out.hry -= q * 1.6; out.pry += q * 0.3; out.crz -= q * 0.15; }

    // ---- apply to the rig
    const squash = clamp(out.sqz + sq.x, -0.32, 0.32);
    const sy = 1 + squash, sxz = 1 / Math.sqrt(sy);
    const B = this.body;
    B.rotation.set(out.brx + this.leanX, out.bry, out.brz + bk.x);
    B.scale.set(sxz, sy, sxz);
    if (out.bpy > 0.001) { // pivot about the body's middle for flips and tumbling
      _pv.set(0, out.bpy, 0).applyEuler(B.rotation);
      B.position.set(-_pv.x, out.bdy + out.bpy - _pv.y, -_pv.z);
    } else B.position.set(0, out.bdy, 0);
    gazeTouch(this); // (in the registry of people who may look at each other, while this one is being updated)
    this.stepAttention(dt, out); // (the look at whoever is talking: the head's and the shoulders' channels, before the rig takes them)

    const H = this.hips;
    const hipY = D.legLen + out.pdy;
    H.position.set(out.ppx, hipY, out.ppz);
    // sitting, the pelvis is squashed onto the seat: its round bottom (0.2 under the hip joint) comes up level with
    // the thighs' undersides (sitDrop), a little wider as it squashes, about the hip joint (so its top stays under the shirt's hem)
    { const q = clamp(out.psq, 0, 1), P = this.pelvis.scale; if (q > 0.001 || P.y !== 1) { const k = 1 - q * (1 - sitDrop(D) / PELVIS_DEPTH); P.set(1 + 0.03 * q, k, 1 + 0.04 * q); } }
    // a deep bend at the waist is shared with the pelvis (the legs are turned back by as much, so the feet stay put):
    // the shirt's hem then never folds in through the hips at the front or lifts clear of them at the back
    const bend = (P.seatY || 0) > 0.15 ? 0 : Math.sign(out.crx) * Math.max(0, Math.abs(out.crx) - 0.12) * 0.6; // not on a seat, where the hips stay put and a lean to a table top is all chest
    H.rotation.set(out.prx + bend, out.pry, out.prz);
    this.chest.rotation.set(out.crx - bend, out.cry, out.crz);
    const hy = out.hry + this.lookYaw;
    // the head tips back or nods only as far as its collar, the hood on its back or the shoulders let it (fitEnvelopes)
    const nod = name === 'swim' ? null : this.fit?.nod, hrx = nod ? softClamp(out.hrx, nod[0], nod[1]) : out.hrx; // a swimmer lying forward lifts the head right up out of the water: the collar is under it
    this.neck.rotation.set(hrx * 0.4, hy * 0.3, out.hrz * 0.4);
    this.headJ.rotation.set(hrx * 0.6, hy * 0.7, out.hrz * 0.6);

    // an emote starts from the idle's arms, and an arm it leaves hanging keeps the idle's floor (the fit keeps any arm out of the
    // body). Sitting at ease too: the arms hang close in the lap, not out over the seat's sides
    const onSeat = (this.params.seatY || 0) > 0.15, atEase = onSeat ? (name === 'idle' || name === 'look' || name === 'sit') && !this.params.chair : (name === 'idle' || name === 'look' || (EMOTES.has(name) && name !== 'swim')), floorT = atEase || this.abMinPose === undefined ? this.abMin : name === 'loco' ? lerp(this.abMin, this.abMinPose, 0.35 + 0.65 * runK) : this.abMinPose; // a walk hangs its arms close; a run swings them out to the wider room
    this._abFloor = this._abFloor === undefined ? floorT : this._abFloor + clamp(floorT - this._abFloor, -1.5 * dt, 1.5 * dt);
    const abMin = this._abFloor;
    this.armL.shoulder.position.y = this.armR.shoulder.position.y = this._shY - out.shd; // at ease the shoulders sit a touch lower
    if (this.fit) fitFrame(this);
    const K = this.ik;
    const applyArm = (a, side, sw, ab, az, el, tw, ik, ca = 0) => {
      // a hanging arm never comes in closer than the body allows (no limit once it swings well up in front or behind; none on an
      // arm the IK placed: its angles are one reading of a rotation that may read as a negative abduction, and armClearance's
      // least abduction (a straight arm clearing the hips) is the very spread the IK's bent elbow does away with: the fit below
      // keeps the arm out of the cloth)
      const lim = abMin * (1 - smooth((Math.abs(sw) - 0.7) / 0.9));
      // an arm the IK placed when this blend began holds the IK's reading of its angles, a negative abduction perhaps: the floor comes
      // back in with the blend, not in one frame
      if (ab < lim && !out.cross && !ik) ab = this._snapIK[side > 0 ? 0 : 1] && e < 1 ? ab + (lim - ab) * e : lim; // a pose may reach across the body (fishing: both hands on the pole)
      // the forearm's carrying angle (out from the upper arm's line about the elbow's forward axis, as a
      // relaxed arm's forearm angles out past the hips): the idle's, kept only while the arm hangs (a pose that lifts the arm from the
      // idle leaves it behind)
      if (ca) ca *= (1 - smooth((Math.abs(sw) - 0.35) / 0.4)) * (1 - smooth((el - 0.7) / 0.5));
      if (this.fit) { // ...and never goes through the body, its clothes or the head (a hand put on a thing near the body (the pole, a book, the mouth) is where it was put: only the arm is tested then)
        const F = this.fit, ab0 = ab;
        F.ik = ik === 2 || (this._snapIK[side > 0 ? 0 : 1] === 2 && e < 1); F.firm = F.ik && (this.ik.arm[side > 0 ? 0 : 1].frame === 'chest' || this.ik.arm[side > 0 ? 0 : 1].follow === 'book' || this.ik.arm[side > 0 ? 0 : 1].follow === 'notepad'); ab = fitArm(this, a, side, sw, ab, az, el, tw, ca); F.ik = false; F.firm = false; // a hand put on the body itself (the laugh's belly) leaves only the hand out, the forearm keeps its full room. A hand the IK had put to the mouth or the pole stays out of the test while the blend takes it away
        if (!ik) { // an arm the pose barely moves takes the fit's answer over a few frames, not in one: the cloth's
          // envelopes come in bins, and a hand at rest crossing into the next one would otherwise pop a few millimetres out and back)
          const k = side > 0 ? 0 : 1, L = F.last[k], E = F.eased;
          const calm = Math.abs(sw - L[0]) + Math.abs(ab0 - L[1]) + Math.abs(az - L[2]) + Math.abs(el - L[3]) + Math.abs(tw - L[4]) < FIT_CALM;
          L[0] = sw; L[1] = ab0; L[2] = az; L[3] = el; L[4] = tw;
          const off = ab - ab0, step = FIT_EASE * this._dt;
          // (an arm at rest that the fit has had to open stays open while it rests: the envelopes come in bins, and a hand near a bin's
          // edge reads clear one frame and in the cloth the next, so easing back in would bring it back into the cloth and pop it out
          // again, over and over. It opens at once, and eases back only by the millimetres of a calm fit)
          // (opening is away from the body whichever way that is: out, or down for an arm up beside the head: off's sign)
          // (but no faster than FIT_SNAP: an emote's hand crossing into the next bin of the hat's or hair's envelope jumped the whole
          // arm 6 cm in one frame, and a centimetre or two of it for a frame or two is the better trade)
          const to = !calm || off * E[k] < 0 || Math.abs(off) > Math.abs(E[k]) ? off : E[k] + clamp(off - E[k], -step * 0.25, step * 0.25), snap = FIT_SNAP * this._dt;
          E[k] = clamp(to, E[k] - snap, E[k] + snap);
          ab = ab0 + E[k];
        } else if (ik === 2 && this._mainArm) { // a hand the IK put on a thing near the body (the laugh's belly, the mouth, the pole):
          // its arm's fit no faster than FIT_SNAP either (it flicked 0.15 rad out and back from frame to frame); not inside the table's
          // ceiling passes, which apply the arm several times a frame)
          const k = side > 0 ? 0 : 1, E = F.eased, snap = FIT_SNAP * this._dt;
          E[k] = clamp(ab - ab0, E[k] - snap, E[k] + snap); ab = ab0 + E[k];
        }
      }
      a.shoulder.rotation.set(-sw, side * az, side * ab);
      a.elbow.rotation.set(-el, side * tw, side * ca);
    };
    // the hands: the pose's shape, closed round anything that hangs from the anchor (a rod, a lantern, a can, a letter...; an item
    // may say how far with userData.grip), never pointing while it holds something (before the arms: the table's ceiling below
    // measures the shape that shows this frame)
    for (let i = 0; i < 2; i++) {
      const A = i ? this.armR : this.armL, kids = A.anchor.children;
      let grip = i ? out.rgrip : out.lgrip, point = i ? out.rpoint : out.lpoint;
      let shape = null; // (a thing may name the hand's shape outright: the book lies on the open hand, whatever the pose's grip)
      if (kids.length) { let g = 0; for (let k = 0; k < kids.length; k++) { g = Math.max(g, kids[k].userData.grip ?? HAND_HOLD); shape = kids[k].userData.hand || shape; } grip = Math.max(grip, g); point = 0; }
      if (shape) setHandShape(A.hand, shape); else poseHand(A.hand, grip, point);
    }
    // each arm's target is solved into `out`'s angles first (bodies-ik.js); a hand that follows what the other holds
    // (the pole, a book) goes second, from where that arm really ended up
    const second = K.near && K.arm[0].on && K.arm[0].follow && out.lik > 0.001 ? 0 : 1;
    for (let k = 0; k < 2; k++) {
      const i = k === 0 ? 1 - second : second;
      const ik = K.near ? this.solveArm(i, out) : false;
      this._mainArm = true;
      if (i) applyArm(this.armR, -1, out.rsw, out.rab, out.raz, out.rel, out.rtw, ik, out.rca);
      else applyArm(this.armL, 1, out.lsw, out.lab, out.laz, out.lel, out.ltw, ik, out.lca);
      this._mainArm = false;
      if (K.near && this.params.table) this.ceilArm(i, out, ik, applyArm); // (nothing of the hand or what it holds below a table top it is over)
    }
    poseArmBones(this.armL, D.Lu); poseArmBones(this.armR, D.Lu); // the elbow's middle bone and the shoulder's top
    // legs: hips swing forward (negative x), knee bends the shin back, ankle keeps the foot at the pose's pitch. The
    // abduction angle is solved so a planted foot keeps its own spot on the ground while the pelvis sways and rolls,
    // and the legs are counter-rotated against the pelvis twist so they keep pointing where the body goes.
    const FS = this._fs;
    const applyLeg = (l, side, hp, hab, kn, an, ld) => {
      const L = ld > 0.05 ? ld : hipY;
      { const i = side > 0 ? 0 : 1, up = FS.lift[i]; if (up > 0) { hp += 0.32 * up; kn += 0.62 * up; } } // (seats-bodies: a step round while turning in place)
      const hipLat = out.ppx + side * D.hipX * Math.cos(out.prz);
      const a = Math.asin(clamp((side * D.hipX + side * Math.sin(hab) * L - hipLat) / L, -0.9, 0.9));
      l.hip.rotation.set(-hp - bend, -out.pry + FS.lag[side > 0 ? 0 : 1], a - out.prz); // (FS.lag: the foot held where it stood while the body turns over it)
      l.knee.rotation.set(kn, 0, 0);
      l.ankle.rotation.set(hp - kn - an, 0, 0);
    };
    applyLeg(this.legL, 1, out.lhp, out.lhab, out.lkn, out.lan, out.lld);
    applyLeg(this.legR, -1, out.rhp, out.rhab, out.rkn, out.ran, out.rld);
    if (this.skirt) this.stepSkirt(out, dt);

    // ---- held things
    if (this.bag) this.stepBag(dt, name);
    this.stepGrips(dt, out, name); // a handle through the fist kept the right way up: the wrist turns (bodies-fix)
    if (this.heldObj && !this.heldObj.userData.upright) this.heldQuat(out, _qa.copy(this.armR.shoulder.quaternion).multiply(this.armR.elbow.quaternion).multiply(this.armR.wrist.quaternion), this.heldObj.quaternion);
    if (this.rod) this.stepRod(dt, out);
    // things that hang or stand stay upright whatever the arm does (orientation undone through the whole chain to the root): the
    // lantern, the candle, the balloon (its string leans out to the side so it never runs up through the head), and anything in
    // either hand flagged userData.upright (bodies-fix: a can, an oil can, a box, a toolbox, a broom, a cane; 'hang' sways a little
    // as the lantern does). An upright thing keeps its own lean in the hand as built (userData.tilt), and out.hold tips it toward
    // the face (the drink).
    for (let i = 0; i < 2; i++) {
      const a = i ? this.armR : this.armL, kids = a.anchor.children;
      let any = false;
      for (let k = 0; k < kids.length; k++) { const g = kids[k]; if (g.visible && (g.userData.upright || g === this.lantern || g === this.balloon || g === this.candle)) { any = true; break; } }
      if (!any) continue;
      _qa.copy(B.quaternion).multiply(H.quaternion).multiply(this.chest.quaternion).multiply(a.shoulder.quaternion).multiply(a.elbow.quaternion).multiply(a.wrist.quaternion).invert();
      for (let k = 0; k < kids.length; k++) {
        const g = kids[k], U = g.userData;
        if (!g.visible) continue;
        if (g === this.lantern) { _e.set(Math.sin(t * 3 + this.phase) * 0.08, 0, Math.sin(t * 2.3 + this.phase) * 0.05); g.quaternion.copy(_qa).multiply(_qt.setFromEuler(_e)); }
        else if (g === this.balloon) { _e.set(Math.sin(t * 1.3 + this.phase) * 0.12, 0, 0.42 + Math.cos(t + this.phase) * 0.08); g.quaternion.copy(_qa).multiply(_qt.setFromEuler(_e)); }
        else if (g === this.candle) g.quaternion.copy(_qa); // (held level, the flame straight up)
        else if (U.upright) {
          if (!U.tilt) U.tilt = g.quaternion.clone();
          g.quaternion.copy(_qa);
          if (U.upright === 'hang') { _e.set(Math.sin(t * 3 + this.phase) * 0.06, 0, Math.sin(t * 2.3 + this.phase) * 0.04); g.quaternion.multiply(_qt.setFromEuler(_e)); }
          if (out.hold) g.quaternion.multiply(_qt.setFromAxisAngle(_ax, out.hold));
          g.quaternion.multiply(U.tilt);
        }
      }
    }
    if (this.book) this.book.rotation.x = out.lsw + out.lel - 0.9;
    if (this.notepad) this.notepad.rotation.x = out.lsw + out.lel - 0.9;

    // ---- secondary motion: hair, hat, pom-poms, scarf tails
    let bob = out.pdy + out.bdy + squash * 0.5;
    if (!Number.isFinite(bob)) bob = 0;
    const vb = (bob - this.lastBob) / dt; this.lastBob = bob;
    this.ay += (clamp((vb - this.lastVBob) / dt, -60, 60) - this.ay) * Math.min(1, dt * 12); this.lastVBob = vb;
    const turnDrive = this.turn + (out.bry - (this._lastBry ?? out.bry)) / dt * 0.6; this._lastBry = out.bry;
    const stream = Math.min(speed, 7) * (1 + 0.25 * runK); // hair and tails trail harder at a run
    const sway = Math.sin(this.cyc * TAU) * runK * gait4(ctx, 0.22, 0.22, 0.14, 0.1) * (moving ? 1 : 0); // and swing side to side with the stride (the light styles swing it most)
    for (const s of this.springs) {
      const g = s.gain ?? 1;
      const tx = (s.kind === 'hat' ? 0 : 0.06 + stream * 0.05 * g) + clamp(this.accF * 0.012 * g, -0.4, 0.4) - clamp(this.ay * 0.0035 * g, -0.4, 0.4) - out.crx * 0.35 * g;
      const tz = (clamp(-turnDrive * 0.05 * g, -0.5, 0.5) + (s.kind === 'hat' ? 0 : sway * g)) * (s.side || 1) * (s.kind === 'hat' ? 0.5 : 1);
      const k = s.kind === 'hat' ? 130 : s.kind === 'pom' ? 150 : 75, c = s.kind === 'hat' ? 11 : s.kind === 'pom' ? 8 : 6.5;
      s.vx += (k * (tx - s.ax) - c * s.vx) * dt; s.ax += s.vx * dt;
      s.vz += (k * (tz - s.az) - c * s.vz) * dt; s.az += s.vz * dt;
      s.ax = clamp(s.ax, -1.2, 1.4); s.az = clamp(s.az, -1.0, 1.0);
      if (s.kind === 'hat') s.node.rotation.set(-s.ax * 0.5 + (out.hrx * -0.0), 0, s.az);
      else s.node.rotation.set(s.ax, 0, s.az);
    }

    this.stepFace(dt, t, out);
  }

  // how far out the torso's cloth reaches at a height in the chest's frame (the arm fit's envelope): towards (x, z) when a
  // direction is given (that bin and its two neighbours), else its widest bin anywhere round; 0 where there is none. The standing
  // idle hangs the hands outside the cloth at the sides, the reader holds the book clear of the coat's front
  clothReachAt(y, x = 0, z = 0) {
    const E = this.fit && this.fit.torso;
    if (!E) return 0;
    const row = Math.floor((y - E.lo) / FIT_DY);
    if (row < 0 || row >= E.n) return 0;
    let m = 0;
    if (x || z) { const ia = azBin(x, z); for (let k = -1; k <= 1; k++) { const r = E.R[row * FIT_AZ + (ia + k + FIT_AZ) % FIT_AZ]; if (r > m) m = r; } return m; }
    for (let a = 0; a < FIT_AZ; a++) { const r = E.R[row * FIT_AZ + a]; if (r > m) m = r; }
    return m;
  }

  // is arm i's hanging hand (abduction ab, bend el, swing sw, carrying angle ca) clear of the skirt, dress or gown as it hangs at
  // rest? (the skirt hangs from the hips and is none of the fit's envelopes; the hand may rest on its outside.) Build time only.
  skirtClear(i, ab, el, sw, ca = 0) {
    const K = this.skirt;
    if (!K) return true;
    const D = this.dims, e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), E = new THREE.Vector3();
    this.chest.rotation.z = 0; this.chest.updateMatrix();
    for (const [a, side] of [[this.armL, 1], [this.armR, -1]]) {
      if (side !== (i ? -1 : 1)) continue;
      const qs = new THREE.Quaternion().setFromEuler(e.set(-sw, 0, side * ab)), qf = qs.clone().multiply(new THREE.Quaternion().setFromEuler(e.set(-el, 0, side * ca)));
      E.set(0, -D.Lu, 0).applyQuaternion(qs).add(a.shoulder.position);
      for (const t of [0, 0.06, 0.12]) { // the wrist and down the hand (its middle a little in from the wrist's line, toward the palm)
        p.set(-side * 0.012, -(D.Lf + t * D.shape.handK[1]), 0).applyQuaternion(qf).add(E).applyMatrix4(this.chest.matrix); // (the hips' frame)
        const v = (p.y - SKIRT_TOP + K.len) / K.len;
        if (v < 0 || v > 1) continue;
        const R = profileAt(K.prof, v), m = 0.042;
        if (Math.hypot(p.x / (K.rx * R + m), p.z / (K.rz * R + m)) < 1) return false;
      }
    }
    return true;
  }

  // (seats-bodies) Turning in place the feet step round instead of pivoting with the body (anim-redo's "not done"): each foot holds its
  // own heading on the ground while the root turns over it (FS.lag, the leg turned back about the hip by as much), and once it is
  // TURN_STEP.lag behind, it lifts and steps round past the body's heading by TURN_STEP.lead (one foot at a time, the next may start
  // as the first comes down); when the turn stops, a foot left behind steps square. Only standing still in the poses that stand on both
  // feet; anything else lets the feet come back to the body in a few frames.
  stepTurnFeet(dt, name, moving) {
    const FS = this._fs || (this._fs = { lag: [0, 0], lift: [0, 0], t: [-1, -1], from: [0, 0], to: [0, 0], still: 0 });
    const T = TURN_STEP, dyaw = this._dyaw || 0;
    const on = !moving && TURN_STANDS.has(name) && !((this.params.seatY || 0) > 0.15) && Math.abs(dyaw) < 0.6; // (a jump of the yaw is a person placed, not a turn)
    FS.still = Math.abs(this.turn) < 0.25 ? FS.still + dt : 0;
    for (let i = 0; i < 2; i++) {
      if (!on) { FS.t[i] = -1; FS.lift[i] = 0; FS.lag[i] -= FS.lag[i] * Math.min(1, dt * 12); if (Math.abs(FS.lag[i]) < 1e-4) FS.lag[i] = 0; continue; }
      if (FS.t[i] >= 0) { // in the air: round to its new heading (relative to the body)
        FS.t[i] = Math.min(1, FS.t[i] + dt / T.dur);
        const k = smooth(FS.t[i]);
        FS.lag[i] = FS.from[i] + (FS.to[i] - FS.from[i]) * k;
        FS.lift[i] = Math.sin(Math.PI * FS.t[i]) * clamp(Math.abs(FS.to[i] - FS.from[i]) / 0.3, 0.35, 1);
        if (FS.t[i] >= 1) { FS.t[i] = -1; FS.lift[i] = 0; }
      } else FS.lag[i] = clamp(FS.lag[i] - dyaw, -T.max, T.max); // planted: the body turns over it
    }
    if (!on) return;
    const o = [Math.abs(FS.lag[0]), Math.abs(FS.lag[1])], need = FS.still > 0.25 ? T.square : T.lag;
    const i = o[0] >= o[1] ? 0 : 1, j = 1 - i; // the one furthest behind goes first
    for (const k of [i, j]) {
      const other = FS.t[1 - k];
      if (FS.t[k] < 0 && o[k] > need && (other < 0 || other > 0.6)) {
        FS.t[k] = 0; FS.from[k] = FS.lag[k];
        FS.to[k] = FS.still > 0.25 ? 0 : -Math.sign(FS.lag[k]) * T.lead; // (into the turn: lag < 0 is a body turned ahead of the foot)
        break;
      }
    }
  }

  // (bodies-fix) The messenger bag hangs at the back of the left hip; lying on the back (house-rest's `lie`) it swings round the hip
  // to lie beside it on the quilt, instead of inside the mattress under the body. Eased with the lying down.
  stepBag(dt, name) {
    const want = name === 'lie' ? smooth(clamp(this.params.lieK ?? 1, 0, 1)) : 0, k = this._bagK ?? 0;
    if (want === k) return;
    const nk = Math.abs(want - k) < 0.002 ? want : k + (want - k) * Math.min(1, dt * 6);
    this._bagK = nk;
    if (this.bag.userData.pose) this.bag.userData.pose(nk); else this.bag.rotation.y = -Math.PI / 2 * nk; // (the backpack has its own way round, bodies-gear)
  }

  // (bodies-fix) A thing whose handle runs through the fist (userData.handle: Kevin's hammer, wrench, brush and scoop) has its
  // business end at the thumb's end of the fist, the wrist frame's +z. The rig has no wrist joint, so a pose that turns the forearm
  // over hung the hammer head-down beside a waving Kevin. Here the wrist turns about the forearm (pronation) just enough that the
  // thumb's end points no lower than the arm allows: a hanging forearm may carry the head forward or a little down (GRIP_FLOOR[0]),
  // a raised one carries it up (GRIP_FLOOR[1]). The least turn that gets there, eased so nothing snaps; none in the poses that work
  // the tool themselves (TOOL_POSES: the strike swings the head down on purpose) and none on an arm the IK has placed (its hand
  // points assume an unturned wrist). The hand and whatever hangs from its anchor turn with the wrist; the forearm is a round tube.
  stepGrips(dt, out, name) {
    const P = this._pron, k = Math.min(1, dt * 8);
    for (let i = 0; i < 2; i++) {
      const a = i ? this.armR : this.armL, kids = a.anchor.children;
      let handle = false;
      for (let j = 0; j < kids.length; j++) if (kids[j].visible && kids[j].userData.handle) { handle = true; break; }
      let want = 0;
      if (handle && !TOOL_POSES.has(name) && !(this.ik.arm[i].w > 0.01)) {
        _qa.copy(this.body.quaternion).multiply(this.hips.quaternion).multiply(this.chest.quaternion).multiply(a.shoulder.quaternion).multiply(a.elbow.quaternion);
        _d.set(0, -1, 0).applyQuaternion(_qa); // down the forearm
        _z.set(0, 0, 1).applyQuaternion(_qa);  // the thumb's end of the fist at the pose's own twist
        const A = Math.sqrt(Math.max(0, 1 - _d.y * _d.y)); // how far up anything square to the forearm can point
        if (A > 0.05) {
          _x.set(0, 1, 0).addScaledVector(_d, -_d.y).normalize(); // the most upward direction square to the forearm
          const phi = Math.atan2(_x2.crossVectors(_z, _x).dot(_d), _z.dot(_x)); // the thumb's turn about the forearm to reach it
          const floor = lerp(GRIP_FLOOR[0], GRIP_FLOOR[1], smooth(_d.y / 0.6)), phiMax = Math.acos(clamp(floor / A, -1, 1));
          // the least turn to the allowed cone, either way round (a thumb pointing straight down is a half turn from the top both
          // ways: the way nearer the wrist's turn so far, so it never flickers between them)
          const w1 = -Math.sign(phi) * Math.max(0, Math.abs(phi) - phiMax), phi2 = phi - Math.sign(phi) * TAU, w2 = -Math.sign(phi2) * Math.max(0, Math.abs(phi2) - phiMax);
          want = Math.abs(w1 - P[i]) <= Math.abs(w2 - P[i]) ? w1 : w2; // (the wrist's y is up the forearm, _d is down it)
        }
      }
      if (P[i] === want && want === 0) continue;
      P[i] += (want - P[i]) * k;
      if (Math.abs(P[i]) < 1e-4 && want === 0) P[i] = 0;
      a.wrist.rotation.y = P[i];
    }
  }

  // The held thing's rotation in the right hand's anchor frame (qArm: the right arm's shoulder x elbow rotation, chest frame).
  // A carried rod: its angle lives in the chest's frame (up, forward and out to the right), so the arm can do what it likes
  // without the pole swinging through the head, blended with the in-hand angle the fishing poses use. The pole runs along its
  // local -y; its local +z is the way the angle rises, so a positive bend droops the tip. Anything else: tipped by `hold`.
  heldQuat(out, qArm, q) {
    if (this.rod && out.carry > 0.001) {
      const el = CARRY_EL + out.cpit, az = CARRY_AZ + out.cyaw, ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az), sa = Math.sin(az);
      _d.set(sa, -ca * se, -ca * ce);           // local y = minus the pole's direction (az out to the right, el within the body's mid plane)
      _z.set(0, ce, -se);                       // local z = the way the elevation rises
      _x.crossVectors(_d, _z);
      _qt.setFromRotationMatrix(_mb.makeBasis(_x, _d, _z));
      _qa2.copy(qArm).invert().multiply(_qt);
      _qh.setFromAxisAngle(_ax, out.hold);
      q.slerpQuaternions(_qh, _qa2, Math.min(1, out.carry));
    } else q.setFromAxisAngle(_ax, out.hold);
    return q;
  }

  // ------------------------------------------------------------------ the arms' targets (bodies-ik.js)
  // After the pose blend, as each arm is applied: the arm's target (what the pose asked: a table top, the mouth; or a follow: the
  // pole, the book or the notepad in the other hand) is solved in the chest's frame and blended into the pose's arm angles by its
  // weight; then the table's ceiling (params.table): a hand over a table top, and whatever hangs from it, never goes below the
  // top. The answer is written back into `out`, so a cross-fade away from here starts from where the arm really is.
  solveArm(i, out) {
    const K = this.ik, D = this.dims, A = K.arm[i], a = i ? this.armR : this.armL, side = i ? -1 : 1, S = a.shoulder.position, s = this.opts.scale, T = this.params.table;
    let sw = i ? out.rsw : out.lsw, ab = i ? out.rab : out.lab, az = i ? out.raz : out.laz, el = i ? out.rel : out.lel, tw = i ? out.rtw : out.ltw;
    let did = false;
    A.w += ((A.on ? clamp(i ? out.rik : out.lik, 0, 1) : 0) - A.w) * Math.min(1, this._dt * 12); // a target that appears mid-pose fades in too, never past 1 (an overshooting ease would extrapolate the angles)
    if (A.w < 0.002) { A.w = 0; A.on = false; }
    const w = A.w, [hw, hl] = D.shape.handK;
    const B = this.body, H = this.hips, C = this.chest;
    B.updateMatrix(); H.updateMatrix(); // (fitFrame refreshed the chest's, the neck's and the head's)
    _mc.multiplyMatrices(B.matrix, H.matrix).multiply(C.matrix); // chest -> root
    _mci.copy(_mc).invert();
    // 1. what the pose asked
    if (w > 0) {
      let ok = true;
      if (A.follow) ok = this.followPoint(A, i, out, _tgt, _dir);
      else if (A.frame === 'head') {
        _mh.multiplyMatrices(this.neck.matrix, this.headJ.matrix).multiply(this.headC.matrix); // head -> chest
        _tgt.copy(A.pos).applyMatrix4(_mh);
        _dir.copy(A.dir).transformDirection(_mh);
      } else if (A.frame === 'chest') { _tgt.copy(A.pos); _dir.copy(A.dir); }
      else if (A.lay) { // (follow-up C) the forearm laid along a bar (a camp chair's armrest): from the shoulder as it really is this frame (the
        // breath, the slouch), the elbow on the bar's line (as far out toward it as the upper arm reaches at that height, ahead of the
        // shoulder), the wrist on the line ahead of it, so the forearm lies on the rest whatever the build; the elbow goes where that puts it
        _ls.copy(S).applyMatrix4(_mc);
        const bx = A.pos.x, by = A.pos.y, Lu = D.Lu * 0.995, dy = by - _ls.y;
        const yE = dy > -Lu ? by : _ls.y - Lu, rx = Math.sqrt(Math.max(0, Lu * Lu - (yE - _ls.y) ** 2));
        const xE = side > 0 ? Math.min(bx, _ls.x + rx) : Math.max(bx, _ls.x - rx), zE = _ls.z + Math.sqrt(Math.max(0, Lu * Lu - (xE - _ls.x) ** 2 - (yE - _ls.y) ** 2));
        const yW = by + A.pos.z, zW = zE + Math.sqrt(Math.max(0, D.Lf * D.Lf * 0.99 - (bx - xE) ** 2 - (yW - yE) ** 2)); // (pos.z: the wrist a touch higher than the elbow, the relaxed hand's fingertips over the pad)
        _tgt.set(bx, yW, zW).applyMatrix4(_mci);
        A.pole.set(xE, yE, zE).applyMatrix4(_mci).sub(S).normalize(); A.pick = 'pole'; A.facing = null;
      } else {
        _tgt.copy(A.pos).applyMatrix4(_mci);
        _dir.copy(A.dir).transformDirection(_mci);
      }
      if (ok) {
        solveTarget(S, _tgt, D.Lu, D.Lf, side, A, _dir, A.pole, hw, hl, _sol);
        if (K.dbg) K.dbg[i] = [_tgt.x, _tgt.y, _tgt.z, _sol.short, S.x, S.y, S.z]; // for the tests: the target in the chest's frame and how far it was out of reach
        // (a follow that is out of reach is left to the pose: a hand stopped short in mid-air reads worse than the pose's own)
        const wk = A.follow || A.frame === 'head' ? w * (1 - smooth((_sol.short - 0.02) / 0.04)) : w;
        if (wk > 0.001) { blendArm(side, sw, ab, az, el, tw, _sol, wk, _ba); sw = _ba.sw; ab = _ba.ab; az = _ba.az; el = _ba.el; tw = _ba.tw; did = true; if (i) out.rca *= 1 - wk; else out.lca *= 1 - wk; } // (the solve has no carrying angle: it fades out as the target fades in)
      }
    }
    if (!did) return false;
    if (i) { out.rsw = sw; out.rab = ab; out.raz = az; out.rel = el; out.rtw = tw; } else { out.lsw = sw; out.lab = ab; out.laz = az; out.lel = el; out.ltw = tw; }
    return A.on && w > 0 && (A.follow || A.frame === 'chest' || A.frame === 'head') ? 2 : 1; // (2: the hand is on a thing near the body, the fit leaves it out)
  }

  // The table's ceiling (params.table), after the arm is applied: the lowest point of the hand (its hull, as the hand is turned
  // now) and of whatever it holds (its corners) over the top stays PALM_CLEAR above it. Read from the arm as it really is (the fit
  // included), so the measure is exact; a lift is solved, applied (fit and all), measured again and the rest taken out, a few times
  // at most. The lift fades in as the hand comes within TABLE_PAD of the edge (full by the edge), the elbow goes out, down and
  // forward. A thing hanging level from the hand (the lantern) is lifted only CEIL_MAX: further would fold the arm up over it.
  ceilArm(i, out, ik, apply) {
    const K = this.ik, D = this.dims, a = i ? this.armR : this.armL, side = i ? -1 : 1, S = a.shoulder.position, s = this.opts.scale, T = this.params.table;
    const [hw, hl] = D.shape.handK, C2 = _ceil, R = this.root.position, yaw = this.root.rotation.y, A2 = K.ceil;
    C2.T = T; C2.R = R; C2.cy = Math.cos(yaw); C2.sy = Math.sin(yaw); C2.s = s; C2.top = (T.y - R.y) / s + PALM_CLEAR;
    C2.a = a; C2.side = side; C2.hw = hw; C2.hl = hl; C2.D = D; C2.S = S;
    const rot = a.shoulder.rotation, erot = a.elbow.rotation;
    let sw = -rot.x, az = side * rot.y, ab = side * rot.z, el = -erot.x, tw = side * erot.y;
    const ca0 = side * erot.z; // (the idle's carrying angle, as applied)
    ceilMeasure(sw, ab, az, el, tw, ca0);
    K.below[i] = _pr.y - C2.low; // (how far below its anchor this hand and what it holds reach, for the pose's rests next frame)
    let lift = Math.max(C2.over < 0 ? -C2.over : 0, C2.overHang < 0 ? Math.min(-C2.overHang, CEIL_MAX) : 0);
    if (lift <= 0) return;
    const sw0 = sw, ab0 = ab, az0 = az, el0 = el, tw0 = tw, wk = smooth(C2.inside / (TABLE_PAD * 0.5));
    _pa.copy(_pr); _pb.set(side * 0.6, -0.4, 0.7);
    const cap = Math.max(C2.over < 0 ? -C2.over : 0, CEIL_MAX); // (a hanging thing's lift stops at CEIL_MAX; the hand's own never does)
    let best = -1, left = -1; // (the smallest lift that left nothing under the top, if one was found)
    const lifted = l => { // the arm lifted by l, applied (the fit and all), and measured: what is still under the top (negative) or over it
      _tgt.copy(_pa); _tgt.y += l; _tgt.applyMatrix4(_mci);
      A2.set('chest', 'anchor'); A2.pole.copy(_pb);
      solveTarget(S, _tgt, D.Lu, D.Lf, side, A2, _dir, A2.pole, hw, hl, _sol);
      blendArm(side, sw0, ab0, az0, el0, tw0, _sol, wk, _ba);
      apply(a, side, _ba.sw, _ba.ab, _ba.az, _ba.el, _ba.tw, ik || 1, ca0 * (1 - wk));
      sw = -rot.x; az = side * rot.y; ab = side * rot.z; el = -erot.x; tw = side * erot.y;
      ceilMeasure(sw, ab, az, el, tw, side * erot.z);
      return Math.min(C2.over, C2.overHang);
    };
    for (let pass = 0; pass < 4; pass++) { // (the hand and what it holds turn as the arm comes up: a few damped steps, never ending under the top)
      left = lifted(lift);
      if (K.dbgCeil) K.dbgCeil[i] = [pass, +lift.toFixed(3), +C2.over.toFixed(3), +C2.overHang.toFixed(3), +wk.toFixed(2), +_sol.short.toFixed(3)];
      if (left >= -0.003 && (best < 0 || lift < best)) best = lift;
      if (left === Infinity || (left >= -0.003 && left <= 0.012) || _sol.short > 0.01) break; // (settled, or out of reach: as high as it goes)
      lift = left < 0 ? Math.min(lift - left, cap) : lift - left * 0.6;
      if (lift >= cap && left < 0) { if (best < 0) best = cap; break; }
    }
    if (left < -0.003 && best >= 0 && best !== lift) lifted(best); // (the last step came out under the top: back to the one that was over it)
    if (i) { out.rsw = sw; out.rab = ab; out.raz = az; out.rel = el; out.rtw = tw; } else { out.lsw = sw; out.lab = ab; out.laz = az; out.lel = el; out.ltw = tw; } // (where the arm really is: the next cross-fade starts from here)
  }

  // Where a following hand goes (chest frame, into tgt; the facing into dir): a point on what the other hand holds, from that
  // arm as it was just applied (its fit included). false when there is nothing to follow.
  followPoint(A, i, out, tgt, dir) {
    const o = i ? this.armL : this.armR, D = this.dims;
    _fqf.copy(o.shoulder.quaternion).multiply(o.elbow.quaternion);
    _pe.set(0, -D.Lu, 0).applyQuaternion(o.shoulder.quaternion).add(o.shoulder.position);
    _pw.set(0, -D.Lf, 0).applyQuaternion(_fqf).add(_pe);
    _pp.copy(o.anchor.position).applyQuaternion(_fqf).add(_pw); // the other hand's anchor
    if (A.follow === 'rod') {
      if (!this.rod || i !== 0) return false;
      this.heldQuat(out, _fqf, _qr); _qr.premultiply(_fqf);    // the pole's rotation in the chest's frame (its own scratch: heldQuat works in _qa2)
      dir.set(0, -1, 0).applyQuaternion(_qr);                   // up the pole, toward the tip
      tgt.copy(_pp).addScaledVector(dir, ROD_UP);
      A.facing = null; A.pole.set(0.6, -0.4, 0.4);                             // (the elbow out, down and a little forward; the fist's facing as the arm comes: the pole passes through it either way)
      return true;
    }
    const g = A.follow === 'book' ? this.book : this.notepad;
    if (!g || i !== 1) return false;
    // the thing's frame in the chest's: the left anchor, then its own offset and tilt (set below this frame, as the pose has it)
    _qb.setFromAxisAngle(_ax, out.lsw + out.lel - 0.9).premultiply(_fqf);
    _pp.add(_pt.copy(g.position).applyQuaternion(_fqf));
    if (A.follow === 'book') { tgt.set(-BOOK.t / 2 - 0.002, 0.0, 0.0); dir.set(1, 0, 0); } else { tgt.set(-0.06, -0.02, 0.07); dir.set(1, 0, 0); } // (the book: the other palm on its front cover)
    tgt.applyQuaternion(_qb).add(_pp); dir.applyQuaternion(_qb);
    A.facing = 'palm'; A.pick = 'pole'; A.pole.set(-0.5, -0.4, 0.7);
    return true;
  }

  // Skirts and gowns: sitting tips the skirt forward over the lap (a gown also shortens so it pools at the shins); the
  // cloth itself (swing, lag, flare, keeping the legs inside) is bodies-skirt.js's SkirtRig.
  stepSkirt(out, dt) {
    const K = this.skirt, g = K.group;
    const sit = Math.max(0, (out.lhp + out.rhp) * 0.5 - 0.3);
    const sitK = smooth(sit / 1.1);
    g.rotation.x = -sitK * (K.gown ? 0.5 : 0.62);
    g.scale.set(1 + sitK * 0.05, 1 - sitK * (K.gown ? 0.3 : 0.12), 1 + sitK * 0.08);
    if (this.key === 'lie') { const k = clamp(this.params.lieK ?? 1, 0, 1); g.scale.x *= 1 + 0.12 * k; g.scale.z *= 1 - 0.45 * k; } // (lying down (house-rest): the skirt lies flat over the legs, not stood out like a bell)
    this.skirtRig.step(this, out, dt, sitK);
  }

  // The rod is a chain of joints; tension bends it (on top of the pole's own crook), a spring makes it whip when the
  // arm moves. The lure on its bit of line hangs straight down from the tip and swings like a pendulum when the tip
  // moves (last frame's world matrix: a frame late, never noticed). No allocation.
  stepRod(dt, out) {
    const R = this.rod, rs = this.rodSpring;
    const target = clamp((this.params.tension || 0) * 0.5, 0, 0.6) + out.flick;
    rs.v += (120 * (target - rs.x) - 7 * rs.v) * dt; rs.x += rs.v * dt;
    const bend = 0.05 + rs.x;
    for (let i = 1; i < R.joints.length; i++) R.joints[i].rotation.x = R.rest[i][0] + clamp(bend, -0.7, 0.75) * 0.3 * (0.7 + i * 0.3);
    const D = R.dangle;
    if (!D) return;
    D.visible = !this.lineOut;
    if (!D.visible || !(dt > 0)) { this.dangle.live = false; return; }
    const S = this.dangle, e = this.rodTip.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
    if (!S.live) { S.live = true; S.tx = x; S.ty = y; S.tz = z; S.ux = S.uz = 0; S.px = S.pz = S.vx = S.vz = 0; }
    const ux = (x - S.tx) / dt, uz = (z - S.tz) / dt;                       // the tip's speed...
    const ax = clamp((ux - S.ux) / dt, -40, 40), az = clamp((uz - S.uz) / dt, -40, 40);   // ...and how it changes
    S.tx = x; S.ty = y; S.tz = z; S.ux = ux; S.uz = uz;
    const w2 = 9.8 / DANGLE;
    S.vx += (-w2 * S.px - 3.2 * S.vx - ax) * dt; S.vz += (-w2 * S.pz - 3.2 * S.vz - az) * dt;
    S.px = clamp(S.px + S.vx * dt, -0.3, 0.3); S.pz = clamp(S.pz + S.vz * dt, -0.3, 0.3);
    // world orientation: swung by (px, pz) from straight down, turned the way the person faces; then undo the tip's own
    this.rodTip.matrixWorld.decompose(_pv, _qa, _sv);
    _e.set(-Math.asin(S.pz / DANGLE), 0, Math.asin(S.px / DANGLE), 'XYZ');
    _qt.setFromEuler(_e);
    _qh.setFromAxisAngle(_yax, this.root.rotation.y);
    D.quaternion.copy(_qa.invert()).multiply(_qt).multiply(_qh);
    const U = D.userData;
    S.spin += dt * (U.spin || 1.1);
    U.lure.rotation.y = U.spin ? S.spin : 0.45 * Math.sin(S.spin);
  }

  // real eyes (bodies-eyes.js): the lids from the expression and the blink (down fast, up a touch slower), a happy squint
  // with a big smile and narrowed eyes, the gaze leading a head turn and wandering now and then (looks only: nothing here moves anyone)
  stepEyes(dt, blink) {
    const ex = this.expr, G = this.gaze, st = this._eyeSt;
    const u = this.blinkP > 0 ? clamp(1 - this.blinkP / 0.17, 0, 1) : 0;
    const shut = this.blinkP > 0 ? (u < 0.4 ? Math.pow(u / 0.4, 1.5) : 1 - smooth((u - 0.4) / 0.6)) : 0;
    void blink;
    const open = clamp(ex.eye, 0.04, 1.5);
    const happy = clamp((ex.smile - 0.8) / 0.5, 0, 1) * clamp((1.02 - open) / 0.25, 0, 1);
    let lidU = (1 - open) * (1 - 0.6 * happy);
    lidU += (1 - Math.max(0, lidU)) * shut;
    st.lidU = lidU; st.lidL = happy * 0.9;
    G.t -= dt;
    if (G.t <= 0) { const c = Math.random() < 0.45; G.tx = c ? 0 : (Math.random() * 2 - 1) * 0.55; G.ty = c ? 0 : (Math.random() * 2 - 1) * 0.3; G.t = 0.9 + Math.random() * 2.6; }
    const k = Math.min(1, dt * 22), A = this.attn, aw = A.w;
    // the attention's eyes (gaze.js): their share of the look, in the head; the wander blended out by as much
    const tx = clamp(lerp(G.tx + this.lookYaw * 0.9, A.ey / EYE_YAW, aw), -1, 1), ty = clamp(lerp(G.ty, A.ex / EYE_PITCH, aw), -1, 1);
    G.x += (tx - G.x) * k; G.y += (ty - G.y) * k;
    st.gx = G.x; st.gy = G.y;
    poseStyledEyes(this.face.styled, st);
  }

  // The look at whoever is talking (gaze.js picked the target a moment ago): the eyes turn first and furthest, the head follows
  // a beat later (a spring, its speed capped), the shoulders a touch on a wide turn; off, it all eases back and the pose's own
  // head (the idle's glances) comes through again. Changes only the head's and the chest's yaw and pitch channels of `out`.
  stepAttention(dt, out) {
    const A = this.attn, on = A.on, e = on ? targetOf(A.tgt) : null; // (null: gone, or "talking to nobody": the head held straight)
    // the base the head turns from: the body's facing with the pose's hips turn (the pose's own chest turn and tip are taken back
    // out of the head at the end, so a gesture's shoulders never pull the look off its target)
    const base = this.root.rotation.y + out.bry + out.pry, tip = out.brx + out.prx + out.crx;
    let ny = 0, nx = 0;
    if (e) {
      const H = this.headC.matrixWorld.elements, pt = e.length === 16;
      const dx = (pt ? e[12] : e.x) - H[12], dy = (pt ? e[13] : e.y) - H[13], dz = (pt ? e[14] : e.z) - H[14], hd = Math.hypot(dx, dz);
      if (hd > 0.05) { ny = Math.atan2(dx, dz) - base; ny -= TAU * Math.round(ny / TAU); nx = -Math.atan2(dy, hd); }
    }
    if (A.fresh || (on && Math.abs(ny - A.ny) > 0.5)) A.lag = ATTN.lag; // a new target, or one that jumped: the eyes go first again
    A.fresh = false; A.ny = ny; A.nx = nx;
    A.w = on ? Math.min(1, A.w + dt / 0.35) : Math.max(0, A.w - dt / 0.6);
    const syT = on ? clamp(Math.sign(ny) * Math.max(0, Math.abs(ny) - 0.75) * 0.35, -0.3, 0.3) : 0; // the shoulders on a wide turn
    A.sy += (syT - A.sy) * Math.min(1, dt * 3);
    const ry = ny - A.sy; // what is left for the head and the eyes
    const hyT = on ? clamp(ry - clamp(ry * 0.12, -0.1, 0.1), -ATTN.headYaw, ATTN.headYaw) : 0; // the head most of the way, the eyes keep a share
    const hxT = on ? clamp(nx, -ATTN.headUp, ATTN.headDown) : 0;
    if (A.lag > 0) A.lag -= dt;
    else { spring(A, 'hy', 'vhy', hyT, ATTN.headK, ATTN.headV, dt); spring(A, 'hx', 'vhx', hxT, ATTN.headK, ATTN.headV, dt); }
    const eyT = on ? clamp(ry - A.hy, -ATTN.eyeYaw, ATTN.eyeYaw) : 0, exT = on ? clamp(A.hx - nx, -ATTN.eyePitch, ATTN.eyePitch) : 0;
    spring(A, 'ey', 'vey', eyT, ATTN.eyeK, ATTN.eyeV, dt); spring(A, 'ex', 'vex', exT, ATTN.eyeK, ATTN.eyeV, dt);
    A.err = on ? Math.abs(ry - A.hy - A.ey) : 0; // (test hook: how far the look is from the target, rad)
    const w = A.w; if (w <= 0) return;
    out.hry = lerp(out.hry, A.hy - out.cry, w);
    out.hrx = lerp(out.hrx, A.hx - tip, w) + out.hrx * w * 0.35; // (a pose's nods stay, a third of them)
    out.hrz = out.hrz * (1 - 0.5 * w) - A.hy * 0.1 * w; // (bodies-fix: the head tips a touch toward whoever it turns to, as a head does; a stiff level turn read as a doll's)
    out.cry += A.sy * w;
  }

  stepFace(dt, t, out) {
    const F = this.face, ex = this.expr, k = Math.min(1, dt * 14);
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkP = 0.17; this.blinkT = Math.random() < 0.18 ? 0.25 : 1.8 + Math.random() * 4.2; }
    let blink = 0;
    if (this.blinkP > 0) { this.blinkP -= dt; blink = Math.sin(clamp(1 - this.blinkP / 0.17, 0, 1) * Math.PI); }
    // talking: word-like (bodies-poses talkAt: syllables in bursts with pauses, the width with the open, a relaxed smile between
    // phrases, the brows in on a stress)
    let open = out.mopen, smileT = out.smile, mwT = out.mw;
    if (this.talkT > 0) {
      this.talkT -= dt;
      const T = talkAt(t, this.phase);
      open = Math.max(open, 0.1 + 0.62 * T.open); mwT *= T.w; out.brow -= 0.15 * T.stress; out.btilt += 0.12 * T.stress;
      smileT = lerp(smileT, 0.58, 0.5 * T.rest);
    }
    // a real voice (voice chat): the jaw follows the level, the brows lift on the loud bits and the head nods a little
    const vl = this.voiceLevel;
    if (vl > 0.02) {
      open = Math.max(open, Math.min(0.95, 0.1 + vl * 1.15));
      out.brow += vl * 0.55;
      this.headJ.rotation.x -= vl * 0.07 * (0.6 + 0.4 * Math.sin(t * 5.3 + this.phase));
    }
    ex.eye += (out.eyeO - ex.eye) * k; ex.smile += (smileT - ex.smile) * k; ex.open += (open - ex.open) * Math.min(1, dt * 22);
    ex.brow += (out.brow - ex.brow) * k; ex.tilt += (out.btilt - ex.tilt) * k; ex.mw += (mwT - ex.mw) * k;
    const eyeS = clamp(ex.eye, 0.04, 1.5) * (F.blinks ? 1 - 0.93 * blink : 1);
    if (F.styled) this.stepEyes(dt, blink);
    else for (const g of this._eyes) g.scale.set(1 + Math.max(0, ex.eye - 1) * 0.12, eyeS, 1);
    // brows live in surface-aligned groups: lift along the group's local up, tilt about local z (+ tilt = angry)
    for (const g of this._brows) {
      if (!g) continue;
      const inner = g.children[0];
      inner.position.y = ex.brow * 0.032 - (eyeS < 0.5 ? (0.5 - eyeS) * 0.02 : 0);
      inner.rotation.z = g.userData.side * ((g.userData.base || 0) + ex.tilt);
    }
    // mouth
    const sm = ex.smile, minOpen = F.mouthMinOpen || 0, op = Math.max(ex.open, minOpen);
    if (F.arc) {
      const curve = F.mouthCurve ? clamp(0.16 + 0.62 * sm, 0.03, 1.5) : 1;
      F.arc.scale.set((F.mouthW || 1) * ex.mw * (0.86 + 0.24 * clamp(sm, 0, 1.4)), curve, 1);
      F.arc.position.y = (F.mouthCurve ? (F.mouthOff || 0) * curve : 0) - op * 0.02;
      F.arc.visible = op < 0.62 || F.mouthMinOpen > 0;
    }
    const inner = F.inner;
    if (op > 0.04) {
      inner.visible = true;
      const wide = (F.mouthStyle === 'o' ? 0.62 : 0.9 + 0.2 * clamp(sm, 0, 1)) * ex.mw * (F.teeth ? F.mouthW : 1);
      inner.scale.set(wide, 0.012 + op * (F.teeth ? 0.042 : 0.055), 1);
      inner.position.y = -op * 0.03 + (F.mouthStyle === 'o' ? 0 : 0.0);
    } else inner.visible = false;
  }
}

// the attention's comfort and pace (stepAttention): the eyes' and head's limits (rad), the head's beat behind the eyes (s), the
// springs' stiffness and top speed (rad/s). The eyes' limit is the real eyes' full travel (bodies-eyes.js: gaze x of 1).
export const ATTN = { eyeYaw: 0.45, eyePitch: 0.3, headYaw: 1.2, headUp: 0.45, headDown: 0.6, lag: 0.14, headK: 55, headV: 3.2, eyeK: 260, eyeV: 8 };
const EYE_YAW = ATTN.eyeYaw, EYE_PITCH = ATTN.eyePitch;
// a critically damped spring on A[k] with its speed A[v], toward `to`, no faster than vmax (stable to dt 0.05 for K up to 400)
function spring(A, k, v, to, K, vmax, dt) {
  let s = A[v] + (K * (to - A[k]) - 2 * Math.sqrt(K) * A[v]) * dt;
  s = clamp(s, -vmax, vmax);
  A[k] += s * dt; A[v] = s;
}

const _pv = new THREE.Vector3(), _sv = new THREE.Vector3(), _yax = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _x2 = new THREE.Vector3(), _mb = new THREE.Matrix4(), _ax = new THREE.Vector3(1, 0, 0);
// (bodies-fix, stepGrips) the poses that work a hand-held tool themselves (the hammer's strike swings its head down): no wrist turn
const TOOL_POSES = new Set(['hammer', 'paint', 'reach', 'tinker', 'sweep', 'garden', 'drive', 'tiller', 'fish', 'cast', 'reel', 'hook', 'catch', 'throw', 'drink', 'read', 'swing', 'swingfly', 'climb', 'vault', 'push', 'swim']);
export const GRIP_FLOOR = [-0.2, 0.7]; // the least world-up a handle's business end may show: from a hanging forearm (a little down is fine) to a raised one (up)
const _qt = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _e = new THREE.Euler();
export const TURN_STEP = { lag: 0.3, lead: 0.2, square: 0.08, max: 0.75, dur: 0.18 }; // (seats-bodies) rad / s: a foot steps round once the body has turned `lag` past it
const TURN_STANDS = new Set(['idle', 'look', 'talk', 'think', 'wave', 'point', 'shrug', 'laugh', 'whisper']);
const PARAM_KEYS = ['lean', 'tension', 'spin', 'seatY', 'danger'];

// ------------------------------------------------------------------ scratch for solveArm / followPoint
const TABLE_PAD = 0.08;   // m past a table top's edge the ceiling still counts (the lift fades in over it)
const CEIL_MAX = 0.48;    // m: the most the ceiling lifts a hand for a thing hanging level from it (more would fold the arm up over a lantern hanging half over the edge)
const ROD_UP = 0.16;      // m up the pole from the holding hand the other hand grips it
const _mc = new THREE.Matrix4(), _mci = new THREE.Matrix4(), _mh = new THREE.Matrix4(), _mcf = new THREE.Matrix4(), _mk = new THREE.Matrix4(), _pq = new THREE.Vector3();
const _ls = new THREE.Vector3(), _tgt = new THREE.Vector3(), _dir = new THREE.Vector3(), _pe = new THREE.Vector3(), _pw = new THREE.Vector3(), _pwr = new THREE.Vector3(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pp = new THREE.Vector3(), _pt = new THREE.Vector3(), _pr = new THREE.Vector3();
const _qa2 = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qfk = new THREE.Quaternion(), _qbl = new THREE.Quaternion(), _ebl = new THREE.Euler();
const _sol = { q: new THREE.Quaternion(), el: 0, E: new THREE.Vector3(), short: 0 }, _ba = { sw: 0, ab: 0, az: 0, el: 0, tw: 0 };
// the pose's arm angles blended toward a solve by w: the shoulder as a rotation (slerp, then back to the rig's YXZ angles: the same
// rotation whatever its decomposition), the elbow's bend and twist straight
function blendArm(side, sw, ab, az, el, tw, sol, w, out) {
  _qfk.setFromEuler(_ebl.set(-sw, side * az, side * ab, 'YXZ'));
  _qbl.slerpQuaternions(_qfk, sol.q, w);
  _ebl.setFromQuaternion(_qbl, 'YXZ');
  out.sw = -_ebl.x; out.az = side * _ebl.y; out.ab = side * _ebl.z;
  // the same rotation reads two ways in YXZ; the one with the abduction within a right angle is the one the poses write and the
  // arm fit reasons about (Ry(a) Rx(b) Rz(c) = Ry(a + pi) Rx(pi - b) Rz(c + pi))
  if (out.ab > Math.PI / 2 || out.ab < -Math.PI / 2) {
    out.ab -= Math.sign(out.ab) * Math.PI; out.sw = -out.sw - Math.PI; out.az += Math.PI;
    out.sw -= TAU * Math.round(out.sw / TAU); out.az -= TAU * Math.round(out.az / TAU);
  }
  out.el = el + (sol.el - el) * w; out.tw = tw * (1 - w);
  return out;
}
// the table's ceiling (solveArm): the arm as the angles have it, the anchor (chest _pp, root _pr) and every point that matters (the hand's hull, the held things' corners)
// against the top: how far the lowest point over the top is above it (over; negative: under), how far in from the edge the points
// under it reach (inside), the lowest point of all (low). No allocation: the frame's facts sit in _ceil.
const _ceil = { T: null, R: null, cy: 1, sy: 0, s: 1, top: 0, a: null, side: 1, hw: 1, hl: 1, D: null, S: null, over: Infinity, overHang: Infinity, inside: -1, low: Infinity, hang: false };
function ceilAt(x, y, z) { // a point in the root's frame: over the top? how far above it (or under); how far in from the edge
  const C = _ceil;
  if (y < C.low) C.low = y;
  const ins = tableInside(C.T, C.R.x + (x * C.cy + z * C.sy) * C.s, C.R.z + (z * C.cy - x * C.sy) * C.s) + TABLE_PAD;
  if (ins <= 0) return;
  if (C.hang) { if (y - C.top < C.overHang) C.overHang = y - C.top; } // (a thing hanging level from the hand: lifted only so far, see CEIL_MAX)
  else if (y - C.top < C.over) C.over = y - C.top;
  if (y < C.top && ins > C.inside) C.inside = ins;
}
function ceilMeasure(sw, ab, az, el, tw, ca = 0) {
  const C = _ceil, a = C.a, side = C.side, D = C.D, S = C.S, kids = a.anchor.children, hc = a.hand.shapes[a.hand.shape].userData.corners;
  C.over = Infinity; C.overHang = Infinity; C.inside = -1; C.low = Infinity; C.hang = false;
  _fqs.setFromEuler(_feu.set(-sw, side * az, side * ab, 'YXZ')); _fqe.setFromEuler(_feu.set(-el, side * tw, side * ca, 'YXZ')); _fqf.multiplyQuaternions(_fqs, _fqe);
  _pe.set(0, -D.Lu, 0).applyQuaternion(_fqs).add(S);                                   // the elbow
  _pw.set(0, -D.Lf, 0).applyQuaternion(_fqf).add(_pe);                                 // the wrist (chest)
  _pwr.copy(_pw).applyMatrix4(_mc);                                                    // (root)
  _pp.copy(a.anchor.position).applyQuaternion(_fqf).add(_pw); _pr.copy(_pp).applyMatrix4(_mc); // the anchor (chest, root)
  _mcf.extractRotation(_mc).multiply(_mk.makeRotationFromQuaternion(_fqf)); // the wrist's frame -> root (rotation only)
  // the hand: a hand the pose rests on the top lies as the rest tilts it, its lowest point known (handPoint); any other, its box's corners
  if (hc) for (let q = 0; q < hc.length; q += 3) { _pq.set(hc[q], hc[q + 1], hc[q + 2]).applyMatrix4(_mcf).add(_pwr); ceilAt(_pq.x, _pq.y, _pq.z); } // (the hand's hull, as it is turned)
  for (let k = 0; k < kids.length; k++) {
    const g = kids[k], c = g.userData.corners;
    if (!c) continue;
    _pt.copy(a.anchor.position).add(g.position).applyQuaternion(_fqf).add(_pw).applyMatrix4(_mc); // the thing's origin (root)
    if (g.userData.upright) { C.hang = true; for (let q = 0; q < c.length; q += 3) ceilAt(_pt.x + c[q], _pt.y + c[q + 1], _pt.z + c[q + 2]); C.hang = false; }
    else { _mk.makeRotationFromQuaternion(g.quaternion).premultiply(_mcf); for (let q = 0; q < c.length; q += 3) { _pq.set(c[q], c[q + 1], c[q + 2]).applyMatrix4(_mk).add(_pt); ceilAt(_pq.x, _pq.y, _pq.z); } }
  }
}

// ------------------------------------------------------------------ arms that keep out of the body
// Whatever a pose asks for, an arm never goes through the torso and what is worn on it (shirt, jacket, coat, lapels, a backpack),
// the pelvis, or the head with its hair and hat. Built once: the cloth's own vertices binned into envelopes (the torso and the
// pelvis by height and azimuth, the head by direction: the furthest any vertex reaches in each bin). Each frame a few points down
// each arm are tested against them, and a pose that would bury an arm is opened out (or, an arm overhead, in) by the least
// abduction that clears it. The shoulder itself is the arm's ball (no test there). No allocation per frame.
const IDLE_GAP = 0.007; // the gap the standing idle's arm keeps from the cloth by the fit's envelopes (which read a belly a little slim), so the arm is visibly clear of the cloth, a belly and the hips
const FIT_SNAP = 3; // rad/s at most the arm fit's opening changes
const FIT_AZ = 24, FIT_DY = 0.015, FIT_PO = 12, FIT_MARGIN = 0.006, FIT_MAX = 1.6, FIT_REACH = 0.8, FIT_CALM = 0.05, FIT_EASE = 0.08; // (FIT_CALM: rad an arm may move a frame and still count as at rest; FIT_EASE: rad/s its fit is eased at then)
export const ARM_REST = 0.45; // how far (arm radii) the upper arm may press into the body's side half way down it, less to the elbow
const azBin = (x, z) => { let a = Math.atan2(x, z) / TAU; a -= Math.floor(a); return Math.floor(a * FIT_AZ + 0.5) % FIT_AZ; }; // (bins centred on the axes: a lathe's column straight out at each side falls in the middle of a bin on both sides alike)
function fitBins(nRows, rowOf, radiusOf, verts) {
  const R = new Float32Array(nRows * FIT_AZ).fill(-1);
  for (let i = 0; i < verts.length; i += 3) {
    const row = rowOf(verts[i], verts[i + 1], verts[i + 2]);
    if (row < 0 || row >= nRows) continue;
    const k = row * FIT_AZ + azBin(verts[i], verts[i + 2]), r = radiusOf(verts[i], verts[i + 1], verts[i + 2]);
    if (r > R[k]) R[k] = r;
  }
  // a bin no vertex fell in takes its neighbours' reach: the next bin round the row (lathes have fewer columns than there are
  // bins), then a straight line between the reaches up and down the column (not the bigger of the two: one rolled hood must not
  // fill a whole row)
  for (let row = 0; row < nRows; row++) for (let a = 0; a < FIT_AZ; a++) {
    const k = row * FIT_AZ + a;
    if (R[k] < 0) R[k] = -2 - Math.max(R[row * FIT_AZ + (a + 1) % FIT_AZ], R[row * FIT_AZ + (a - 1 + FIT_AZ) % FIT_AZ], -1);
  }
  for (let k = 0; k < R.length; k++) if (R[k] <= -2) R[k] = -2 - R[k] >= 0 ? -2 - R[k] : -1;
  for (let a = 0; a < FIT_AZ; a++) for (let row = 0; row < nRows; row++) {
    const k = row * FIT_AZ + a;
    if (R[k] >= 0) continue;
    let up = -1, dn = -1, ju = row, jd = row;
    for (let j = row + 1; j < nRows && up < 0; j++) { up = R[j * FIT_AZ + a]; ju = j; }
    for (let j = row - 1; j >= 0 && dn < 0; j--) { dn = R[j * FIT_AZ + a]; jd = j; }
    R[k] = up >= 0 && dn >= 0 ? dn + ((up - dn) * (row - jd)) / (ju - jd) : Math.max(up, dn, 0);
  }
  return R;
}
// every vertex of these meshes in `frame`'s coordinates (build time only)
function vertsIn(frame, meshes) {
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), out = [];
  for (const mesh of meshes) {
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); out.push(v.x, v.y, v.z); }
  }
  return out;
}
function heightEnvelope(frame, meshes) {
  const verts = vertsIn(frame, meshes);
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < verts.length; i += 3) { lo = Math.min(lo, verts[i]); hi = Math.max(hi, verts[i]); }
  if (!(hi > lo)) return null;
  const n = Math.ceil((hi - lo) / FIT_DY) + 1, R0 = fitBins(n, (x, y) => Math.floor((y - lo) / FIT_DY), (x, y, z) => Math.hypot(x, z), verts);
  // (one more row under the lowest, its copy: a hem flares out widest at its very edge, and a forearm passing just under it
  // read clear of it, the edge between two rows)
  const R = new Float32Array((n + 1) * FIT_AZ); R.set(R0.subarray(0, FIT_AZ), 0); R.set(R0, FIT_AZ);
  return { lo: lo - FIT_DY, n: n + 1, R, max: R.reduce((m, v) => Math.max(m, v), 0) };
}
// How far forward the torso's cloth reaches by height, in the head's frame at rest (the sage's beard hangs clear of it): [front(y), key].
function chestFront(h, chest, D, o) {
  const hs = o.headSize || 1, yc = D.torsoTop + D.neckY + D.headY * hs, bins = new Float32Array(120).fill(0), at = y => Math.floor((y + 1.4) / 0.01);
  h.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(chest.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  h._torsoG.traverse(mesh => {
    if (!mesh.isMesh) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const P = mesh.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      if (Math.abs(v.x) > 0.17) continue;
      const k = at((v.y - yc) / hs);
      if (k >= 0 && k < bins.length) bins[k] = Math.max(bins[k], v.z / hs);
    }
  });
  for (let k = 1; k < bins.length - 1; k++) bins[k] = Math.max(bins[k], bins[k - 1] * 0.5, bins[k + 1] * 0.5); // (no gaps)
  const front = y => { const f = (y + 1.4) / 0.01 - 0.5, k = Math.floor(f); if (k < 0 || k >= bins.length - 1) return 0; return Math.max(bins[k], bins[k + 1], bins[Math.max(0, k - 1)], bins[Math.min(bins.length - 1, k + 2)]); };
  return [front, Array.from(bins, x => Math.round(x * 500)).join(',')];
}
function fitEnvelopes(h) {
  h.root.updateMatrixWorld(true);
  const swinging = new Set(h.springs.filter(s => s.kind !== 'hat').map(s => s.node)), skip = new Set([h.neck, h.armL.shoulder, h.armR.shoulder, ...swinging]);
  const meshesUnder = (g, out = []) => { if (skip.has(g)) return out; if (g.isMesh) out.push(g); for (const c of g.children) meshesUnder(c, out); return out; };
  const torso = heightEnvelope(h.chest, h.chest.children.flatMap(c => meshesUnder(c)));
  const pelvis = heightEnvelope(h.hips, meshesUnder(h.pelvis));
  // the head: its skin, hair and beard, and the hat only as far as it hugs them (a brim or a tall crown is no wall for an arm)
  const poleRow = (x, y, z) => Math.min(FIT_PO - 1, Math.floor((Math.acos(Math.max(-1, Math.min(1, y / (Math.hypot(x, y, z) || 1)))) / Math.PI) * FIT_PO)), len = (x, y, z) => Math.hypot(x, y, z);
  const clip = h.hat && !h.hiddenFace; // (the hood is the head: all of it counts)
  if (clip) skip.add(h.hat);
  const head = { R: fitBins(FIT_PO, poleRow, len, vertsIn(h.headC, meshesUnder(h.headC))) };
  if (clip) {
    skip.delete(h.hat);
    const hv = vertsIn(h.headC, meshesUnder(h.hat));
    for (let i = 0; i < hv.length; i += 3) {
      const x = hv[i], y = hv[i + 1], z = hv[i + 2], k = poleRow(x, y, z) * FIT_AZ + azBin(x, z), l = len(x, y, z);
      if (l > head.R[k] && l < head.R[k] * 1.2) head.R[k] = l;
    }
  }
  if (!torso || !pelvis) return null;
  // the points tested down an arm: [joint (0 shoulder, 1 elbow, 2 hand), distance down it, radius]
  const D = h.dims, r = D.armR;
  // (from half way down the upper arm: nearer the shoulder the arm is joined to the body, its ball covers that seam whatever it does.
  // The upper arm may rest against the body's side, pressed in a little near the armpit (ARM_REST), nothing by the elbow)
  const rest = d => r * ARM_REST * Math.max(0, 1 - (d / D.Lu - 0.5) / 0.5);
  // the arm's own outside down its length, its sleeve where the sleeve covers it (bodies-arm.js armOuterAt: the larger half of an
  // oval). The core is the bare arm, for an arm the fit leaves its hand out of
  const SL = outfitSpec(h.opts).sleeves, ro = [0, 0], outer = d => { armOuterAt(d, D, SL, ro); return Math.max(ro[0], ro[1]); };
  const pts = [0.5, 0.62, 0.74, 0.88, 0.97].map(f => [0, D.Lu * f, outer(D.Lu * f) - rest(D.Lu * f), r - rest(D.Lu * f)]).concat([0, 0.25, 0.5, 0.75, 1].map(f => [1, D.Lf * f, outer(D.Lu + D.Lf * f)]), [[2, 0.055, 0.068]]); // (the hand: its fingertips may touch, as a hand at the thigh does)
  const hs = h.headC.scale.x || 1;
  const F = { torso, pelvis, head, pts, hs, off: [0, 0], eased: [0, 0], last: [new Float32Array(5).fill(9), new Float32Array(5).fill(9)], memo: [new Float32Array(15).fill(9), new Float32Array(15).fill(9)], calls: 0, toHead: new THREE.Matrix4(), toHips: new THREE.Matrix4(), hc: new THREE.Vector3(),
    headReach: head.R.reduce((m, v) => Math.max(m, v), 0) * hs, pelvisTop: pelvis.lo + pelvis.n * FIT_DY - D.waist + 0.2 };
  // how far the head may tip back and nod forward before the underside of the skull, jaw or beard meets the collar, the hood on
  // the back or the shoulders (the pose's tilt is held there: update)
  if (!h.hiddenFace) {
    const under = [], m = new THREE.Matrix4(), v = new THREE.Vector3(), neckOut = D.neckR * 1.1;
    for (let row = Math.floor(FIT_PO * 0.55); row < FIT_PO; row++) for (let a = 0; a < FIT_AZ; a++) {
      const t = ((row + 0.5) / FIT_PO) * Math.PI, ph = ((a + 0.5) / FIT_AZ) * TAU, R = head.R[row * FIT_AZ + a];
      under.push(Math.sin(t) * Math.sin(ph) * R, Math.cos(t) * R, Math.sin(t) * Math.cos(ph) * R);
    }
    const pen = x => {
      h.neck.rotation.set(x * 0.4, 0, 0); h.headJ.rotation.set(x * 0.6, 0, 0); h.neck.updateMatrix(); h.headJ.updateMatrix(); h.headC.updateMatrix();
      m.multiplyMatrices(h.neck.matrix, h.headJ.matrix).multiply(h.headC.matrix);
      let worst = -1;
      for (let i = 0; i < under.length; i += 3) { // (not over the neck: the collars ring it, the envelope counts the hole as cloth)
        v.set(under[i], under[i + 1], under[i + 2]).applyMatrix4(m);
        if (Math.hypot(v.x, v.z) > neckOut) worst = Math.max(worst, envDepth(torso, v.x, v.y, v.z, 0));
      }
      return worst;
    };
    const p0 = Math.max(0, pen(0)) + 0.002;
    let back = 0, fwd = 0;
    while (back > -0.8 && pen(back - 0.025) <= p0) back -= 0.025;
    while (fwd < 0.8 && pen(fwd + 0.025) <= p0) fwd += 0.025;
    h.neck.rotation.set(0, 0, 0); h.headJ.rotation.set(0, 0, 0); h.neck.updateMatrix(); h.headJ.updateMatrix();
    F.nod = [Math.min(0, back + NOD_SOFT), Math.max(0, fwd - NOD_SOFT)]; // (the soft end may go NOD_SOFT further)
  }
  return F;
}
const _fv = new THREE.Vector3(), _fe = new THREE.Vector3(), _fqs = new THREE.Quaternion(), _fqe = new THREE.Quaternion(), _fqf = new THREE.Quaternion(), _feu = new THREE.Euler();
// once a frame, after the chest, neck and head have their rotations: the chest-to-head and chest-to-hips transforms
function fitFrame(h) {
  const F = h.fit;
  h.chest.updateMatrix(); h.neck.updateMatrix(); h.headJ.updateMatrix(); h.headC.updateMatrix();
  F.toHead.multiplyMatrices(h.neck.matrix, h.headJ.matrix).multiply(h.headC.matrix);
  F.hc.setFromMatrixPosition(F.toHead); // (the head's centre in the chest's frame)
  F.toHead.invert();
  F.toHips.copy(h.chest.matrix);
  F.psq = h.pelvis.scale.y < 0.999 ? h.pelvis.scale : null;
}
// how deep a ball of radius rr at (x, y, z) goes into an envelope: tested at its middle and 0.7 rr above and below it (an arm lying
// across the body meets the wider cloth below it first)
let _fitBody = 0, _fitHead = 0; // (the last fitPen's clearances from the body and from the head)
const envRow = (E, y, ia) => { const row = Math.floor((y - E.lo) / FIT_DY); return row < 0 || row >= E.n ? -9 : E.R[row * FIT_AZ + ia]; };
// x as it is inside [lo, hi]; past an end the excess is squeezed into at most NOD_SOFT more (a pose that tips past it slows to a stop)
const NOD_SOFT = 0.06;
const softClamp = (x, lo, hi) => (x < lo ? lo - NOD_SOFT * (1 - Math.exp((x - lo) / NOD_SOFT)) : x > hi ? hi + NOD_SOFT * (1 - Math.exp((hi - x) / NOD_SOFT)) : x);
const envDepth = (E, x, y, z, rr) => {
  const ia = azBin(x, z), rho = Math.sqrt(x * x + z * z), dy = rr * 0.7, side = rr * 0.714, dy2 = rr * 0.35, side2 = rr * 0.937;
  // (two more rows between, 0.35 rr off the middle: a ball the size of an arm spans three rows, and a belly's widest row
  // could fall between the three samples)
  return Math.max(envRow(E, y, ia) + rr, envRow(E, y - dy, ia) + side, envRow(E, y + dy, ia) + side, envRow(E, y - dy2, ia) + side2, envRow(E, y + dy2, ia) + side2) - rho;
};
// how deep the arm's deepest test point goes into anything (m; <= 0 clear)
function fitPen(h, a, side, sw, ab, az, el, tw, ca = 0) {
  const F = h.fit, S = a.shoulder.position, D = h.dims;
  F.calls++; // (tests: how often an arm is tested)
  _fqs.setFromEuler(_feu.set(-sw, side * az, side * ab, 'YXZ'));
  _fqe.setFromEuler(_feu.set(-el, side * tw, side * ca, 'YXZ'));
  _fqf.multiplyQuaternions(_fqs, _fqe);
  _fe.set(0, -D.Lu, 0).applyQuaternion(_fqs).add(S);
  let worst = -1, head = -1;
  const pts = F.pts, T = F.torso, Pv = F.pelvis, hr = F.headReach;
  const ik = F.ik; // the hand itself is left out, the forearm and the elbow's end tested slimmer, the upper arm as its core: a hand put on something near the body is meant to be there, the arm across the body to reach it
  const hang = Math.abs(sw) < 0.6; // (the sleeve's ball counts on an arm hanging by the body; one swung well forward or back holds it clear of the cloth's side, and the pose owns it)
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i], j = q[0], d = q[1], rr = ik ? (j === 1 || d > D.Lu * 0.9 ? q[2] * (F.firm ? 1 : 0.6) : q[3]) : j === 0 && !hang ? q[3] : q[2];
    if (ik && j === 2) continue;
    if (j === 0) _fv.set(0, -d, 0).applyQuaternion(_fqs).add(S);
    else _fv.set(0, -(j === 2 ? D.Lf + d : d), 0).applyQuaternion(_fqf).add(_fe);
    const x = _fv.x, y = _fv.y, z = _fv.z;
    // (each volume tested only when the point is near it, else its distance to the volume's bound is the clearance: most frames
    // most points are clear of everything)
    const rho = Math.sqrt(x * x + z * z);
    const dT = rho < T.max + rr ? envDepth(T, x, y, z, rr) : T.max + rr - rho;
    worst = Math.max(worst, dT);
    let dP = F.pelvisTop + rr - y;
    if (y < F.pelvisTop + rr) {
      _fv.applyMatrix4(F.toHips);
      if (F.psq) { _fv.x /= F.psq.x; _fv.y /= F.psq.y; _fv.z /= F.psq.z; } // a sitter's pelvis is squashed onto the seat, and its envelope is of the pelvis as built
      const rp = Math.sqrt(_fv.x * _fv.x + _fv.z * _fv.z);
      dP = rp < Pv.max + rr ? envDepth(Pv, _fv.x, _fv.y, _fv.z, rr) : Pv.max + rr - rp;
    }
    worst = Math.max(worst, dP);
    if (F.why) F.why.push([i, +dT.toFixed(4), +dP.toFixed(4)]); // (lab: tools/ik-idle-probe.mjs, which point meets what)
    const hx = x - F.hc.x, hy = y - F.hc.y, hz = z - F.hc.z, hd = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (hd < hr + rr) {
      _fv.set(x, y, z).applyMatrix4(F.toHead);
      const l = _fv.length() || 1e-6, row = Math.min(FIT_PO - 1, Math.floor((Math.acos(Math.max(-1, Math.min(1, _fv.y / l))) / Math.PI) * FIT_PO));
      head = Math.max(head, (F.head.R[row * FIT_AZ + azBin(_fv.x, _fv.z)] - l) * F.hs + rr);
    } else head = Math.max(head, hr + rr - hd);
  }
  _fitBody = worst - FIT_MARGIN; _fitHead = head - FIT_MARGIN;
  return Math.max(worst, head) - FIT_MARGIN;
}
export const armFit = { pen: fitPen, arm: (h, a, side, sw, ab, az, el, tw, ca = 0) => fitArm(h, a, side, sw, ab, az, el, tw, ca) }; // (tests: tools/avatar-fit-test.mjs)
// the abduction the arm gets: as asked when that is clear, else opened (or closed) by the least amount that clears it
function fitArm(h, a, side, sw, ab, az, el, tw, ca = 0) {
  const F = h.fit, k = side > 0 ? 0 : 1, M = F.memo[k], o = h.out;
  // still clear? Nothing of the arm can have moved further than the angles changed times its reach since it was last found clear
  // by a margin: then it needs no test (an arm at rest is tested every dozen frames or so, not every frame)
  // (the body's and the head's clearances apart: a head looking round does not move a hanging arm any nearer the hips)
  const body = Math.abs(sw - M[0]) + Math.abs(ab - M[1]) + Math.abs(az - M[2]) + Math.abs(el - M[3]) + Math.abs(tw - M[4])
    + Math.abs(o.crx - M[5]) + Math.abs(o.cry - M[6]) + Math.abs(o.crz - M[7]) + Math.abs(o.shd - M[13]) * 4 + Math.abs(ca - M[14]); // (the shoulders dropped a touch at ease: 4 rad a metre is more than any arm point moves)
  const head = body + Math.abs(o.hrx - M[8]) + Math.abs(o.hry + h.lookYaw - M[9]) + Math.abs(o.hrz - M[10]);
  if (h.animT > 1 && body * FIT_REACH < -M[11] && head * FIT_REACH < -M[12]) return ab + F.off[k]; // the offset is 0 after a full search that found it clear. Tested every frame for a pose's first second, as it settles
  const d0 = fitPen(h, a, side, sw, ab, az, el, tw, ca);
  M[0] = sw; M[1] = ab; M[2] = az; M[3] = el; M[4] = tw; M[5] = o.crx; M[6] = o.cry; M[7] = o.crz; M[8] = o.hrx; M[9] = o.hry + h.lookYaw; M[10] = o.hrz; M[13] = o.shd; M[14] = ca;
  M[11] = d0 <= 0 ? _fitBody : 1; M[12] = d0 <= 0 ? _fitHead : 1;
  if (d0 <= 0) { F.off[k] = 0; return ab; }
  let s = Math.sign(F.off[k]), lo = 0, loP = d0, hi = 0, hiP = d0;
  if (s) { // warm: a pose moves a little a frame, so last frame's answer (and a little less) brackets this one's
    const t = Math.abs(F.off[k]), p = fitPen(h, a, side, sw, ab + s * t, az, el, tw, ca);
    if (p <= 0) {
      hi = t; hiP = p;
      const t2 = t * 0.85, p2 = fitPen(h, a, side, sw, ab + s * t2, az, el, tw, ca);
      if (p2 > 0) { // bracketed close: the straight line between the two is near enough (one test to make sure)
        const tt = t2 + (t - t2) * (p2 / Math.max(1e-6, p2 - p)), ok = fitPen(h, a, side, sw, ab + s * tt, az, el, tw, ca) <= 0;
        F.off[k] = s * (ok ? tt : t); return ab + F.off[k];
      }
      hi = t2; hiP = p2;
    } else { lo = t; loP = p; }
  }
  if (hiP > 0) { // cold, or the warm guess no longer clears: out in steps to the first abduction that clears
    // (always outward, away from the body, never across it; an arm up beside the head, abducted past the horizontal: outward is down)
    const out = ab > 1.6 ? -1 : 1;
    if (out !== s) { s = out; lo = 0; loP = d0; }
    let best = 0, bestP = d0;
    for (let t = lo + 0.1; t <= FIT_MAX + 1e-6; t += 0.1) {
      const p = fitPen(h, a, side, sw, ab + s * t, az, el, tw, ca);
      if (p < bestP && t <= 0.6 + 1e-6) { bestP = p; best = s * t; } // (the least bad within reason: never flung out)
      if (p <= 0) { hi = t; hiP = p; break; }
      lo = t; loP = p;
    }
    if (hiP > 0) { F.off[k] = 0; return ab + best; } // (nothing in reach clears it: the least bad)
  }
  // close in on the edge, then go between the last two (so the answer moves smoothly with the pose)
  for (let i = 0; i < 4; i++) {
    const m = (lo + hi) / 2, pm = fitPen(h, a, side, sw, ab + s * m, az, el, tw, ca);
    if (pm > 0) { lo = m; loP = pm; } else { hi = m; hiP = pm; }
  }
  let t = lo + (hi - lo) * (loP / Math.max(1e-6, loP - hiP));
  if (fitPen(h, a, side, sw, ab + s * t, az, el, tw, ca) > 0) t = hi;
  F.off[k] = s * t;
  return ab + s * t;
}

// ------------------------------------------------------------------ profile -> look

// A saved profile (or a remote player's) becomes Human options. `skin` is an index into SKIN_TONES or a hex colour.
// `profile.look` is the open-ended bag of avatar choices the avatar editor writes (keys listed in docs/CONTRACTS.md).
export function avatarLook(profile = {}) {
  const look = profile.look || {};
  const skin = look.skinCol && HEX.test(look.skinCol) ? look.skinCol
    : typeof profile.skin === 'number' ? (SKIN_TONES[profile.skin] || SKIN_TONES[0]) : (HEX.test(profile.skin || '') ? profile.skin : SKIN_TONES[0]);
  const shirt = profile.color || '#e0574f';
  const num = v => (typeof v === 'number' ? v : undefined);
  return {
    shirt, pants: look.pants || '#34405e', shoes: look.shoes || '#3a2f2a', hat: profile.hat || 'none',
    hatColor: look.hatColor || profile.hatColor || undefined,
    skin, hair: look.hair || profile.hair || '#4a3020', hairStyle: look.hairStyle || profile.hairStyle || undefined,
    glasses: look.glasses === true || look.glasses === 'yes' ? 'round' : look.glasses || undefined,
    faceShape: look.face, eyes: look.eyes, eyeColor: look.eyeCol, eyeStyle: look.eyeStyle, brows: look.brows, nose: look.nose, mouth: look.mouth,
    blush: typeof look.blush === 'boolean' ? look.blush : undefined,
    facialHair: look.facial, outfit: look.outfit, bottoms: look.bottoms, acc: look.acc, accColor: look.accCol,
    build: num(look.build), height: num(look.height),
    inner: look.innerCol, tie: look.tie, tieColor: look.tieCol, shoeKind: look.shoeKind, pocket: look.pocket,
    lines: typeof look.lines === 'boolean' ? look.lines : undefined,
    body: look.body, shape: num(look.shape), figure: look.figure, bust: num(look.bust),
    gait: num(look.gait), // the run style; unset = picked from the body
    wHat: look.wHat, wTop: look.wTop, wBot: look.wBot, wShoe: look.wShoe, wAcc: look.wAcc, // (clothing-store) the pieces worn from Peak Threads
  };
}
