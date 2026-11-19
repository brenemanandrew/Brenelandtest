// Motion capture for Wizra's model (the Studio's mocap page, owner only). Your camera is read on this device by MediaPipe's pose
// tracker; the 33 body points it finds are turned into turns of her bones, live. A take is recorded as her bone turns at 30 frames a
// second, in the same shape as the game's other clips ({ dur, fps, n, bones: { name: [x, y, z, w per frame] }, hips: [x, y, z per frame] }),
// so a saved take plays in the game like any recorded clip. Nothing of the picture is sent anywhere.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { bodyFix } from './bodyfix.js'; import { addTongue } from './tongue.js'; import { fineFace, FINE, WHOLE } from './fineface.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14', MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const $ = id => document.getElementById(id); let FPS = 30;   /* frames a second a take is recorded at: 30, or 60 with the 60 button */
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
// each bone that follows a body segment: [bone, its parent bone, from point, to point, the way it points at rest]
const LIMBS = [
  ['leftUpperArm', 'chest', 11, 13, V(1, 0, 0)], ['leftLowerArm', 'leftUpperArm', 13, 15, V(1, 0, 0)], ['leftHand', 'leftLowerArm', 15, 19, V(1, 0, 0)],
  ['rightUpperArm', 'chest', 12, 14, V(-1, 0, 0)], ['rightLowerArm', 'rightUpperArm', 14, 16, V(-1, 0, 0)], ['rightHand', 'rightLowerArm', 16, 20, V(-1, 0, 0)],
  ['leftUpperLeg', 'hips', 23, 25, V(0, -1, 0)], ['leftLowerLeg', 'leftUpperLeg', 25, 27, V(0, -1, 0)], ['rightUpperLeg', 'hips', 24, 26, V(0, -1, 0)], ['rightLowerLeg', 'rightUpperLeg', 26, 28, V(0, -1, 0)],
];
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', ...LIMBS.map(l => l[0])], FINGERS = ['Index', 'Middle', 'Ring', 'Little'], JOINTS = ['Proximal', 'Intermediate', 'Distal'];
const basis = (x, y) => { const X = x.clone().normalize(), Z = X.clone().cross(y).normalize(), Y = Z.clone().cross(X).normalize(); return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); };

// ---- landmarks -> a pose: { q: { bone: Quaternion }, hip: how high her hips are (1 = standing), legs: whether the legs were seen } ----
// MediaPipe's world points: x to the picture's right, y down, z away from the camera. Hers: x to her left, y up, z toward the viewer.
// ---- what a body can do. A limb's direction (in its parent's frame: x to her left, y up, z forward) is pulled back inside the
// range a real joint allows, so one bad reading cannot fold an elbow backwards or put a leg through her hips. ----
const coneClamp = (d, axis, max) => { if (d.angleTo(axis) <= max) return d; const perp = d.clone().addScaledVector(axis, -d.dot(axis)); if (perp.lengthSq() < 1e-8) perp.set(axis.y, axis.z, axis.x).addScaledVector(axis, -perp.dot(axis)); perp.normalize(); return d.copy(axis).multiplyScalar(Math.cos(max)).addScaledVector(perp, Math.sin(max)); };
const clampAngle = (q, max) => { const a = 2 * Math.acos(Math.min(1, Math.abs(q.w))); return a > max ? Q().slerp(q, max / a) : q; };
/* keep one component of a unit direction on the right side of a bound, sharing the rest out over the other two */
const capAxis = (d, ax, bound, below, fb) => { if (below ? d[ax] >= bound : d[ax] <= bound) return d; const o = ['x', 'y', 'z'].filter(k => k !== ax), len = Math.hypot(d[o[0]], d[o[1]]), want = Math.sqrt(Math.max(0, 1 - bound * bound)); if (len < 1e-4) { d[o[0]] = fb[o[0]]; d[o[1]] = fb[o[1]]; const l2 = Math.hypot(d[o[0]], d[o[1]]) || 1; d[o[0]] *= want / l2; d[o[1]] *= want / l2; } else { d[o[0]] *= want / len; d[o[1]] *= want / len; } d[ax] = bound; return d; };
export function limit(bone, d, rest) {
  const left = bone.startsWith('left');
  if (/UpperArm/.test(bone)) { capAxis(d, 'z', -0.7, true, { x: rest.x, y: -1 }); if (d.dot(rest) < -0.6) capAxis(d, 'x', -0.6 * rest.x, rest.x > 0, { y: -1, z: 1 }); }                 /* not far behind her back, not far across her own chest */
  else if (/LowerArm/.test(bone)) coneClamp(d, rest, 2.6);                                                                                                                 /* an elbow folds about 150 degrees at most */
  else if (/Hand/.test(bone)) coneClamp(d, rest, 1.3);
  else if (/UpperLeg/.test(bone)) { const outw = d.x * (left ? 1 : -1), fwd = d.z, h = Math.hypot(outw, fwd); if (h > 1e-4) { const o = outw / h, f = fwd / h; coneClamp(d, rest, (f > 0 ? 2.1 : 0.6) * f * f + (o > 0 ? 1.1 : 0.45) * o * o); } }   /* high in front, a little behind, some out to the side, barely across */
  else if (/LowerLeg/.test(bone)) { if (d.z > 0.2) d.set(d.x * 0.3, -1, 0.2).normalize(); coneClamp(d, rest, 2.5); }   /* (a shin read as folding forwards is straightened) */                                                                 /* a knee only folds backwards */
  return d.normalize();
}
// A point the tracker places outside the picture is a guess, however sure it says it is: mark it unseen.
export function framed(lm, norm) { if (!norm) return lm; return lm.map((p, i) => { const n = norm[i], inside = n && n.x > -0.02 && n.x < 1.02 && n.y > -0.02 && n.y < 1.02; return inside ? p : { ...p, visibility: 0 }; }); }
export function solve(lm, o = {}) {
  const P = lm.map(p => V(o.mirror ? -p.x : p.x, -p.y, -p.z)), vis = i => (lm[i].visibility === undefined ? 1 : lm[i].visibility), mid = (a, b) => P[a].clone().add(P[b]).multiplyScalar(0.5);
  const L = o.mirror ? { 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15, 19: 20, 20: 19, 23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27, 7: 8, 8: 7 } : null, ix = i => (L && L[i] !== undefined ? L[i] : i);
  const pt = i => P[ix(i)], hipC = pt(23).clone().add(pt(24)).multiplyScalar(0.5), shC = pt(11).clone().add(pt(12)).multiplyScalar(0.5), up = shC.clone().sub(hipC);
  /* o.seen: how sure the tracker must be of a point (a file is read with a lower bar than the live camera, where a twitching guess shows). Her lower body follows once the hips and at least one knee are seen; each leg bone is then judged on its own. */
  const SEEN = o.seen || 0.62, LOW = o.seen || 0.5, hipsSeen = Math.min(vis(23), vis(24)) > Math.max(LOW, 0.5), shSeen = Math.min(vis(11), vis(12)) > SEEN, legs = hipsSeen && Math.max(vis(25), vis(26)) > LOW && !o.upper, feet = legs && Math.min(vis(27), vis(28)) > LOW, world = {}, q = {};
  if (!hipsSeen || !legs) { up.set(0, 1, 0);
    /* hips out of the shot: her lean is read from what is in it. The head sits over the middle of the shoulders on a straight back, so how far it is off to one side says how far she leans (side to side only: depth is not trusted here). */
    if (shSeen && Math.min(vis(7), vis(8)) > SEEN) { const hd = mid(ix(7), ix(8)).sub(shC), wide = pt(11).distanceTo(pt(12)) || 0.3; if (hd.y > 0.05) up.set(Math.max(-0.35, Math.min(0.35, hd.x / wide * 0.5)), 1, 0).normalize(); } }   /* (without legs under them the hips are a guess in depth, and trusting it bends her over) */   // hips out of the picture (sitting at a desk): the tracker only guesses where they are, so her body stays upright and just turns with your shoulders
  world.hips = legs ? basis(pt(23).clone().sub(pt(24)), up) : basis(V(pt(23).x - pt(24).x, 0, pt(23).z - pt(24).z).lengthSq() > 1e-6 && !o.upper ? pt(23).clone().sub(pt(24)) : V(1, 0, 0), legs ? up : V(0, 1, 0));
  if (!legs) world.hips = Q();                                                    // sitting at a desk: her hips stay put and only the top half follows
  q.hips = legs ? world.hips.clone() : null;
  world.chest = shSeen ? basis(pt(11).clone().sub(pt(12)), up) : world.hips.clone(); const torso = world.hips.clone().invert().multiply(world.chest);
  if (shSeen) { const tor = o.loose ? torso : clampAngle(torso, 1.3); q.spine = Q().slerp(tor, 0.5); torso.copy(tor); q.chest = q.spine.clone().invert().multiply(torso); } else { q.spine = null; q.chest = null; }   // the turn between hips and shoulders, shared by spine and chest
  // head: ears give its side-to-side line, the nose its front
  const ears = pt(7).clone().sub(pt(8)), nose = pt(0).clone().sub(mid(ix(7), ix(8))), hx = ears.clone().normalize(), hz = nose.clone().sub(hx.clone().multiplyScalar(nose.dot(hx))).normalize(), hy = hz.clone().cross(hx).normalize();
  const headW = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hx, hy, hz)).multiply(Q().setFromAxisAngle(V(1, 0, 0), 0.32)), neck = world.chest.clone().invert().multiply(headW);   // (a level head has the nose a little below the ears)
  if (!o.loose) neck.copy(clampAngle(neck, 1.25)); if (Math.min(vis(0), vis(7), vis(8)) > SEEN) { q.neck = Q().slerp(neck, 0.4); q.head = q.neck.clone().invert().multiply(neck); } else { q.neck = null; q.head = null; } world.head = headW;
  for (const [bone, parent, a, b, rest] of LIMBS) {
    const isLeg = /Leg/.test(bone); if (isLeg && !legs) { q[bone] = Q(); world[bone] = (world[parent] || Q()).clone(); continue; }
    const dir = pt(b).clone().sub(pt(a)); if (dir.lengthSq() < 1e-8 || Math.min(vis(ix(a)), vis(ix(b))) < (isLeg ? LOW : SEEN) || (!isLeg && !shSeen)) { q[bone] = null; world[bone] = (world[parent] || Q()).clone(); continue; }   // a limb the camera cannot see is left alone
    const local = dir.normalize().applyQuaternion(world[parent].clone().invert()); if (!o.loose) limit(bone, local, rest); q[bone] = Q().setFromUnitVectors(rest, local); world[bone] = world[parent].clone().multiply(q[bone]);
  }
  const ank = (pt(27).y + pt(28).y) / 2, hipH = hipC.y - ank;                      // hip height off the ankles, for crouching and jumping
  return { q, legs, hipH: feet ? hipH : 0, chest: shSeen ? world.chest : null, neckFull: neck };
}

// ---- a hand's 21 points -> how far each finger joint is bent (radians): { Thumb: [a, b, c], Index: [...], ... } ----
export function fingersOf(lm) {
  const P = lm.map(p => V(p.x, p.y, p.z)), ang = (i, j, k) => { const u = P[j].clone().sub(P[i]), w = P[k].clone().sub(P[j]); return u.lengthSq() < 1e-10 || w.lengthSq() < 1e-10 ? 0 : u.angleTo(w); }, out = {};
  [['Thumb', 1], ['Index', 5], ['Middle', 9], ['Ring', 13], ['Little', 17]].forEach(([name, i]) => { out[name] = name === 'Thumb' ? [ang(0, 1, 2) * 0.5, ang(1, 2, 3), ang(2, 3, 4)] : [ang(0, i, i + 1), ang(i, i + 1, i + 2), ang(i + 1, i + 2, i + 3)]; });
  return out;
}
// finger bends -> her finger bones (the thumb folds across the palm, the others curl)
const fingerBones = (side, bends) => { const k = side === 'left' ? -1 : 1, q = {}; for (const f in bends) { const [a, b, c] = bends[f];
    if (f === 'Thumb') { q[side + 'ThumbMetacarpal'] = Q().setFromAxisAngle(V(0, 1, 0), -k * a).toArray(); q[side + 'ThumbProximal'] = Q().setFromAxisAngle(V(0, 1, 0), -k * b).toArray(); q[side + 'ThumbDistal'] = Q().setFromAxisAngle(V(0, 1, 0), -k * c).toArray(); }
    else { q[side + f + 'Proximal'] = Q().setFromAxisAngle(V(0, 0, 1), k * a).toArray(); q[side + f + 'Intermediate'] = Q().setFromAxisAngle(V(0, 0, 1), k * b).toArray(); q[side + f + 'Distal'] = Q().setFromAxisAngle(V(0, 0, 1), k * c).toArray(); } } return q; };
const curled = v => ({ Thumb: [v * 0.5, v * 0.7, v * 0.6], Index: [v * 1.4, v * 1.6, v * 1.1], Middle: [v * 1.4, v * 1.6, v * 1.1], Ring: [v * 1.4, v * 1.6, v * 1.1], Little: [v * 1.4, v * 1.6, v * 1.1] });
// ---- your face -> her expressions (VRM's own set) and the turn of her head ----
export function faceOf(b, mirror) {
  const avg = (a, c) => ((b[a] || 0) + (b[c] || 0)) / 2, cl = v => +Math.max(0, Math.min(1, v)).toFixed(3), L = mirror ? 'Right' : 'Left', R = mirror ? 'Left' : 'Right';
  const smile = avg('mouthSmileLeft', 'mouthSmileRight'), jaw = b.jawOpen || 0, frown = avg('mouthFrownLeft', 'mouthFrownRight'), browDown = avg('browDownLeft', 'browDownRight'), browUp = Math.max(b.browInnerUp || 0, avg('browOuterUpLeft', 'browOuterUpRight')), wide = avg('eyeWideLeft', 'eyeWideRight');
  return { happy: cl(smile * 0.5),   /* (her full happy face shuts her eyes: a grin should not) */ angry: cl(browDown * 1.3 - smile), sad: cl(frown * 1.6 + (b.browInnerUp || 0) * 0.4 - smile), surprised: cl(wide * 1.2 + browUp * 0.5 - 0.15), aa: cl((jaw * 1.3 - (b.mouthFunnel || 0) * 0.5) * (1 - 0.5 * cl(smile * 1.3) * cl(jaw * 2.5))), ee: cl(avg('mouthUpperUpLeft', 'mouthUpperUpRight') * 0.9 + avg('mouthLowerDownLeft', 'mouthLowerDownRight') * 0.6 - jaw * 0.5),
    /* the finer shapes: mouth alone, brows alone, eyes alone */
    mFun: cl(smile * 1.3 * (1 - cl(jaw * 2.5))), mJoy: cl(smile * 1.3 * cl(jaw * 2.5)), mSor: cl(frown * 1.8 - smile), mAng: cl(avg('mouthPressLeft', 'mouthPressRight') * 1.2 + avg('mouthRollLower', 'mouthRollUpper') * 0.7 - smile), mUp: cl(avg('mouthShrugUpper', 'mouthShrugLower') * 1.2), mSmall: cl((b.mouthPucker || 0) * 0.5), mLarge: cl(avg('mouthStretchLeft', 'mouthStretchRight') * 0.8 + avg('mouthDimpleLeft', 'mouthDimpleRight') * 0.6),
    bAng: cl(browDown * 1.4 - smile * 1.1),   /* (a grin pulls the brows down too: that is not a scowl) */ bSor: cl((b.browInnerUp || 0) * 1.2 - avg('browOuterUpLeft', 'browOuterUpRight') * 0.6), bSur: cl(avg('browOuterUpLeft', 'browOuterUpRight') * 1.3), eJoyL: cl(avg('eyeSquint' + L, 'cheekSquint' + L) * 0.8 * (0.4 + smile)), eJoyR: cl(avg('eyeSquint' + R, 'cheekSquint' + R) * 0.8 * (0.4 + smile)), eWide: cl(wide * 1.4), oh: cl((b.mouthFunnel || 0) * 1.4), ou: cl((b.mouthPucker || 0) * 1.3), ih: cl(avg('mouthStretchLeft', 'mouthStretchRight') * 1.2), blinkLeft: cl((b['eyeBlink' + L] || 0) * 1.25), blinkRight: cl((b['eyeBlink' + R] || 0) * 1.25), tongueOut: cl(((b.tongueOut || 0) - 0.04) * 4), tongueCurl: 0.5, tongueSide: 0.5 };
}
const FACE_KEYS = ['happy', 'angry', 'sad', 'surprised', 'aa', 'oh', 'ou', 'ih', 'ee', ...Object.keys(FINE), 'blinkLeft', 'blinkRight', 'tongueOut', 'tongueCurl', 'tongueSide'];   // (the tongue rides along with her face: out 0..1, curl and side 0..1 with 0.5 as the middle)
// ---- a take: frames of { q: { bone: [x,y,z,w] }, hip } -> the game's clip, with the clean-up applied ----
const slerpArr = (a, b, t) => { const qa = Q().fromArray(a), qb = Q().fromArray(b); return qa.slerp(qb, t).toArray(); };
export function toClip(frames, o = {}) {
  let f = frames.slice(Math.round((o.in || 0) * (frames.length - 1)), Math.round((o.out === undefined ? 1 : o.out) * (frames.length - 1)) + 1); if (f.length < 1) f = frames.slice(0, 1);
  const names = Object.keys(f[0].q); let rows = names.map(n => f.map(fr => fr.q[n] || [0, 0, 0, 1])), hip = f.map(fr => fr.hip || 1), hasFace = f.some(fr => fr.f), face = hasFace ? FACE_KEYS.map(k => f.map(fr => (fr.f && fr.f[k]) || 0)) : [];
  if (o.speed && o.speed !== 1 && f.length > 1) { const n2 = Math.max(2, Math.round(f.length / o.speed)), pick = (arr, isQ) => Array.from({ length: n2 }, (_, i) => { const x = i / (n2 - 1) * (arr.length - 1), i0 = Math.floor(x), i1 = Math.min(arr.length - 1, i0 + 1); return isQ ? slerpArr(arr[i0], arr[i1], x - i0) : arr[i0] + (arr[i1] - arr[i0]) * (x - i0); }); rows = rows.map(r => pick(r, true)); hip = pick(hip, false); face = face.map(r => pick(r, false)); }
  for (let pass = 0; pass < (o.smooth || 0); pass++) { rows = rows.map(r => r.map((q, i) => i === 0 || i === r.length - 1 ? q : slerpArr(slerpArr(r[i - 1], r[i + 1], 0.5), q, 0.5))); hip = hip.map((h, i) => i === 0 || i === hip.length - 1 ? h : (hip[i - 1] + 2 * h + hip[i + 1]) / 4); if (pass < 2) face = face.map(r => r.map((v, i) => i === 0 || i === r.length - 1 ? v : (r[i - 1] + 2 * v + r[i + 1]) / 4)); }
  if (o.mirror) { const flip = q => [q[0], -q[1], -q[2], q[3]], other = n => n.startsWith('left') ? 'right' + n.slice(4) : n.startsWith('right') ? 'left' + n.slice(5) : n, by = {}; names.forEach((n, i) => { by[n] = rows[i]; }); rows = names.map(n => (by[other(n)] || by[n]).map(flip)); }
  const n = rows[0].length; if (o.loop && n > 12) { const k = Math.min(10, Math.floor(n / 3)); for (let i = 0; i < k; i++) { const t = (i + 1) / (k + 1); rows = rows.map(r => { r[n - k + i] = slerpArr(r[n - k + i], r[0], t); return r; }); hip[n - k + i] += (hip[0] - hip[n - k + i]) * t; } }
  const bones = {}; names.forEach((nm, i) => { bones[nm] = rows[i].flat().map(v => +v.toFixed(5)); });
  const fps = frames.fps || FPS, out = { dur: +(Math.max(1, n) / fps).toFixed(4), fps, n, bones, hips: hip.flatMap(h => [0, +h.toFixed(4), 0]), made: 'mocap' };
  if (hasFace) { out.face = {}; FACE_KEYS.forEach((k, i) => { out.face[k] = face[i].map(v => +(+v).toFixed(3)); }); }   // her expression, frame by frame
  return out;
}
// poses held in turn, each for `hold` seconds with `ease` seconds between -> frames
export function keysToFrames(keys) {
  if (!keys.length) return []; const out = [], push = (a, b, t) => { const q = {}; for (const n in a.q) q[n] = b && b.q[n] ? slerpArr(a.q[n], b.q[n], t) : a.q[n]; const fr = { q, hip: b ? a.hip + (b.hip - a.hip) * t : a.hip }; if (a.f) { fr.f = {}; for (const n in a.f) fr.f[n] = b && b.f ? a.f[n] + (b.f[n] - a.f[n]) * t : a.f[n]; } out.push(fr); };
  keys.forEach((k, i) => { for (let f = 0; f < Math.max(1, Math.round(k.hold * FPS)); f++) push(k); const nx = keys[i + 1]; if (nx) { const m = Math.max(1, Math.round((k.ease || 0.4) * FPS)); for (let f = 1; f <= m; f++) { const t = f / (m + 1); push(k, nx, t * t * (3 - 2 * t)); } } });
  return out;
}

// ---- the page ----
export async function start() {
  const me = await (await fetch('/api/state')).json().catch(() => ({})); if (me.error) { location.href = '/'; return; }
  if (me.owner === false) { document.body.innerHTML = '<p style="font:18px Fredoka,sans-serif;padding:40px;text-align:center">Motion capture belongs to the owner of this game.<br><a href="/">Back to the game</a></p>'; return; }
  const say = t => { $('status').textContent = t; };
  // her, standing in an empty studio
  const view = $('view'), renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); view.append(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50); scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 4, 4); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshBasicMaterial({ color: '#4a3a7c' })); floor.rotation.x = -Math.PI / 2; scene.add(floor); const grid = new THREE.GridHelper(3.2, 16, '#8a7aa8', '#5a4a8c'); grid.position.y = 0.002; scene.add(grid);
  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p)); say('Loading her model...');
  let vrm; try { vrm = (await loader.loadAsync('/api/avatar?v=' + ((me.settings || {}).avatarV || 1))).userData.vrm; } catch { say('Her 3D model could not be loaded. Upload one in the game first.'); return; }
  VRMUtils.rotateVRM0(vrm); scene.add(vrm.scene); const B = n => vrm.humanoid.getNormalizedBoneNode(n), hipsNode = B('hips'), hipY0 = hipsNode.position.y;
  const orbit = { yaw: 0, pitch: 0.04, dist: 4.2, y: 0.9 }; let drag = null, pinch = null; const touches = new Map();
  view.addEventListener('pointerdown', e => { if (e.target !== renderer.domElement) return; touches.set(e.pointerId, e); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), dist: orbit.dist, my: (a.clientY + b.clientY) / 2, y0: orbit.y }; drag = null; return; } drag = { x: e.clientX, y: e.clientY, ...orbit, y0: orbit.y, pan: e.button === 2 || e.shiftKey }; view.setPointerCapture(e.pointerId); });   // (only a drag on her picture turns the view: the buttons laid over it must get their own clicks) view.addEventListener('pointermove', e => { if (drag) { frameMine = Infinity; if (drag.pan) { orbit.y = Math.max(0.1, Math.min(1.8, drag.y0 + (e.clientY - drag.y) * 0.0012 * orbit.dist)); return; } orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.008; orbit.pitch = Math.max(-0.4, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.006)); } });
  const lift = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; drag = null; }; view.addEventListener('pointerup', lift); view.addEventListener('pointercancel', lift); view.addEventListener('contextmenu', e => e.preventDefault());
  /* two fingers: pinch to zoom, slide up and down to raise or lower the view */
  view.addEventListener('pointermove', e => { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, e); if (pinch && touches.size === 2) { const [a, b] = [...touches.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); orbit.dist = Math.max(0.5, Math.min(8, pinch.dist * pinch.d / Math.max(20, d))); orbit.y = Math.max(0.1, Math.min(1.8, pinch.y0 + ((a.clientY + b.clientY) / 2 - pinch.my) * 0.0012 * orbit.dist)); frameMine = Infinity; } }); view.addEventListener('wheel', e => { orbit.dist = Math.max(0.5, Math.min(8, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9))); frameMine = Infinity; e.preventDefault(); }, { passive: false });
  const size = () => { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }; addEventListener('resize', size); size();

  // the pose she is in right now (what the camera, a key, the sliders or the take's playhead last said)
  const pose = { q: {}, hip: 1, f: null }; for (const n of BONES) pose.q[n] = Q(); const F5 = () => ({ Thumb: 0.15, Index: 0.15, Middle: 0.15, Ring: 0.15, Little: 0.15 }), curl = { left: F5(), right: F5() }, hands = { left: null, right: null }, fix = bodyFix(THREE, vrm), tongue = addTongue(THREE, vrm), fine = fineFace(vrm), tng = { out: 0, curl: 0, side: 0 }, em = vrm.expressionManager, hasX = n => em && em.getExpression(n);
  const rest = () => { for (const n of BONES) pose.q[n].identity(); pose.q.leftUpperArm.setFromAxisAngle(V(0, 0, 1), -1.25); pose.q.rightUpperArm.setFromAxisAngle(V(0, 0, 1), 1.25); pose.hip = 1; }; rest();
  const snapshot = () => { const q = {}; for (const n of BONES) q[n] = pose.q[n].toArray(); for (const side of ['left', 'right']) { const seen = hands[side] && performance.now() - hands[side].at < 700, bends = seen ? hands[side].bends : Object.fromEntries(Object.entries(curl[side]).map(([f, v]) => [f, curled(v)[f]])); Object.assign(q, fingerBones(side, bends)); } const f = pose.f || tng.out > 0.03 ? { ...(pose.f || {}) } : null; if (f && tng.out >= (f.tongueOut || 0)) { f.tongueOut = tng.out; f.tongueCurl = 0.5 + tng.curl / 2; f.tongueSide = 0.5 + tng.side / 2; } return { q, hip: pose.hip, ...(f ? { f } : {}) }; };
  const show = fr => { for (const n in fr.q) { const b = B(n); if (b) b.quaternion.fromArray(fr.q[n]); } hipsNode.position.y = hipY0 * (fr.hip || 1); if (em) for (const k of FACE_KEYS) if (hasX(k)) em.setValue(k, fr.f && !(fine.has && WHOLE.includes(k) && fr.f.mFun !== undefined) ? fr.f[k] || 0 : 0); fine.set(fr.f); const to = fr.f ? fr.f.tongueOut || 0 : 0; const open = to > 0.03 ? Math.max(fr.f.aa || 0, 0.3 + 0.3 * to) : 0; tongue.set(to, fr.f && fr.f.tongueCurl !== undefined ? fr.f.tongueCurl * 2 - 1 : 0, fr.f && fr.f.tongueSide !== undefined ? fr.f.tongueSide * 2 - 1 : 0, open); if (to > 0.03 && hasX('aa')) em.setValue('aa', open); };

  // ---- camera and tracker ----
  const video = $('cam'); let tracker = null, faceTracker = null, handTracker = null, stream = null, live = false, standH = 0, tick = 0; const opt = { mirror: true, upper: false, face: true, hands: true, solid: true, focus: true };
  // your face: her expression, and a truer turn of the head than the body tracker's ears and nose give
  window.mocapFace = (shapes, m) => { pose.f = faceOf(shapes, opt.mirror); if (m) { /* which way the face points, as the camera sees it; then measured against which way her chest points, so a turned body does not turn the head twice */ const hw = Q().setFromRotationMatrix(new THREE.Matrix4().fromArray(m)).normalize(); if (opt.mirror) { hw.y = -hw.y; hw.z = -hw.z; } hw.multiply(Q().setFromAxisAngle(V(1, 0, 0), -0.1));   /* the tracker reads a level face as tipped a little forward */
    const rel = pose.chestW && performance.now() - pose.chestAt < 1500 ? pose.chestW.clone().invert().multiply(hw) : hw; rel.copy(clampAngle(rel, 1.25)); pose.faceNeck = rel; pose.hwDbg = hw.clone(); const tn = Q().slerp(rel, 0.4), th = tn.clone().invert().multiply(rel); pose.q.neck.slerp(tn, Math.max(0.08, Math.min(0.5, pose.q.neck.angleTo(tn) / 0.3))); pose.q.head.slerp(th, Math.max(0.08, Math.min(0.5, pose.q.head.angleTo(th) / 0.3))); pose.faceHead = performance.now(); } return pose.f; };
  let lmPrev = null; const calm = lm => { if (!lmPrev || lmPrev.length !== lm.length) { lmPrev = lm.map(p => ({ ...p })); return lmPrev; } for (let i = 0; i < lm.length; i++) { const a = lmPrev[i], b = lm[i], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), k = Math.max(0.15, Math.min(0.8, d / 0.06)); a.x += (b.x - a.x) * k; a.y += (b.y - a.y) * k; a.z += (b.z - a.z) * k * 0.45;   /* towards and away from the camera is the tracker's weak direction: believed more slowly */ a.visibility = b.visibility; } return lmPrev; };
  const FRAMES = { all: [0.9, 4.2], waist: [1.12, 2.9], chest: [1.32, 1.9], face: [1.45, 1.15] }; let frameAs = 'all', frameHold = 0, frameMine = 0;   /* frameMine: until when your own drag or zoom is left alone */
  /* the view closes in on the part of her your camera can see: whole body, waist up, chest up or just the face */
  const seenPart = lm => { const v = i => (lm[i] && lm[i].visibility !== undefined ? lm[i].visibility : 1), low = opt.seen || 0.5, sh = Math.min(v(11), v(12)) > (opt.seen || 0.62), hp = Math.min(v(23), v(24)) > low, lg = hp && Math.max(v(25), v(26)) > low; return lg && !opt.upper ? 'all' : hp ? 'waist' : sh ? 'chest' : 'face'; };
  // left and right trading places in a single frame is the tracker losing track, not you: the frame is put back the right way round
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), swapOf = i => (i >= 7 ? (i % 2 ? i + 1 : i - 1) : i >= 1 && i <= 3 ? i + 3 : i >= 4 && i <= 6 ? i - 3 : i); let swapRun = 0, armRun = 0;
  function swapGuard(lm) { if (!lmPrev || opt.snap) return lm; const cost = (pairs, sw) => pairs.reduce((t, [l, r]) => t + dist(lm[l], lmPrev[sw ? r : l]) + dist(lm[r], lmPrev[sw ? l : r]), 0);
    const body = [[11, 12], [23, 24]], keep = cost(body, false), swp = cost(body, true);
    if (keep > 0.3 && swp < keep * 0.45) { if (++swapRun < 12) return lm.map((p, i) => lm[swapOf(i)] || p); lmPrev = null; swapRun = 0; return lm; } swapRun = 0;   /* (if it stays that way you really did turn round) */
    const arms = [[15, 16]], k2 = cost(arms, false), s2 = cost(arms, true);
    if (k2 > 0.35 && s2 < k2 * 0.4) { if (++armRun < 8) return lm.map((p, i) => (i >= 13 && i <= 22 ? lm[swapOf(i)] : p)); } armRun = 0; return lm; }
  const REST = {}; for (const n of BONES) REST[n] = pose.q[n].clone(); const lost = {}, rej = {}, back = {}; let fedAt = 0;
  window.mocapFeed = lm00 => { const lm0 = swapGuard(lm00), tNow = performance.now(), dtFeed = importing ? 1 / FPS : Math.min(0.5, (tNow - fedAt) / 1000 || 0.033); fedAt = tNow; const part = seenPart(lm0); if (part !== frameAs) { if (++frameHold > 12) { frameAs = part; frameHold = 0; } } else frameHold = 0;
    const lm = opt.snap ? lm0 : calm(lm0), s = solve(lm, opt); if (s.chest) { pose.chestW = s.chest.clone(); pose.chestAt = performance.now(); } pose.bodyNeck = s.neckFull; const faceHead = performance.now() - (pose.faceHead || 0) < 600; if (s.hipH) { standH = Math.max(standH, s.hipH); } for (const n of BONES) { if (faceHead && (n === 'head' || n === 'neck')) continue; const t = s.q[n];
      if (!t) { lost[n] = (lost[n] || 0) + 1; if (!opt.snap && lost[n] > 45) pose.q[n].slerp(REST[n], 0.03); continue; }   /* out of sight for a while: it settles back to rest instead of hanging frozen */
      const ang = pose.q[n].angleTo(t);
      if (!opt.snap && ang > Math.max(1.4, 16 * dtFeed) && !(lost[n] > 5)) { /* further than a limb can swing in one frame: held until it has said so five frames running */
        const r = rej[n]; if (r && r.q.angleTo(t) < 0.6) r.n++; else rej[n] = { q: t.clone(), n: 1 }; rej[n].q.copy(t); if (rej[n].n < 5) continue; }
      rej[n] = null; let k = opt.snap ? 1 : Math.max(0.08, Math.min(0.55, ang / 0.5));
      if (!opt.snap && lost[n] > 5) back[n] = 8; if (back[n] > 0) { k = Math.min(k, 0.18); back[n]--; } lost[n] = 0;   /* a part coming back into view eases in rather than snapping */
      pose.q[n].slerp(t, k); } /* a small wobble is damped hard, a real move follows fast */ pose.hip = s.hipH && standH ? Math.max(0.3, Math.min(1.25, s.hipH / standH)) : 1; return s; };   // (also the test hook: canned landmarks)
  const camRate = () => { const t = stream && stream.getVideoTracks()[0], r = t && t.getSettings && t.getSettings().frameRate; return r ? `Your camera is giving ${Math.round(r)} pictures a second; takes record at ${FPS}.` : `Takes record at ${FPS} frames a second.`; };
  $('fps60').onchange = async e => { FPS = e.target.checked ? 60 : 30; const t = stream && stream.getVideoTracks()[0]; if (t && t.applyConstraints) { try { await t.applyConstraints({ frameRate: { ideal: FPS } }); } catch {} } say(camRate()); };
  async function camOn() {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: FPS } }, audio: false }); } catch { return say('The camera was not allowed or could not be opened.'); }
    video.srcObject = stream; await video.play().catch(() => {}); $('camBtn').classList.add('on'); say('Loading the body tracker (first time takes a moment)...');
    try { if (!tracker) { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm'); tracker = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 }); } } catch (e) { return say('The body tracker could not load: ' + (e.message || 'network')); }
    live = true; standH = 0; say('Step back so the camera sees you. Stand straight for a second so it learns your height. ' + camRate()); loadFace(); loadHands();
  }
  async function loadHands() { if (handTracker || !opt.hands) return; try { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm'); handTracker = await vision.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2 }); } catch {} }
  async function loadFace() { if (faceTracker || !opt.face) return; try { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm'); faceTracker = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true }); } catch {} }
  function camOff() { live = false; if (stream) for (const t of stream.getTracks()) t.stop(); stream = null; video.srcObject = null; $('camBtn').classList.remove('on'); say('Camera off.'); }
  $('camBtn').onclick = () => (stream ? camOff() : camOn()); $('mirror').onchange = e => { opt.mirror = e.target.checked; video.style.transform = opt.mirror ? 'scaleX(-1)' : ''; }; $('upper').onchange = e => { opt.upper = e.target.checked; }; $('face').onchange = e => { opt.face = e.target.checked; if (!opt.face) pose.f = null; else if (live) loadFace(); }; $('handsOn').onchange = e => { opt.hands = e.target.checked; if (!opt.hands) hands.left = hands.right = null; else if (live) loadHands(); }; $('solid').onchange = e => { opt.solid = e.target.checked; }; $('focus').onchange = e => { opt.focus = e.target.checked; frameMine = 0; };
  /* the view pad: turn, raise, zoom, and back to automatic. Hold a button to keep going. Once you move the view yourself it stays yours until you press the target. */
  const camDo = act => { if (act === 'home') { frameMine = 0; if (!((live || importing) && opt.focus)) Object.assign(orbit, { yaw: 0, pitch: 0.04, dist: 4.2, y: 0.9 }); return; } frameMine = Infinity; if (act === 'left') orbit.yaw -= 0.12; if (act === 'right') orbit.yaw += 0.12; if (act === 'up') orbit.y = Math.min(1.8, orbit.y + 0.05); if (act === 'down') orbit.y = Math.max(0.1, orbit.y - 0.05); if (act === 'in') orbit.dist = Math.max(0.5, orbit.dist * 0.9); if (act === 'out') orbit.dist = Math.min(8, orbit.dist * 1.1); if (act === 'over') orbit.pitch = Math.min(1.2, orbit.pitch + 0.08); if (act === 'under') orbit.pitch = Math.max(-0.1, orbit.pitch - 0.08); };
  let camRep = 0; for (const b of document.querySelectorAll('#camPad button')) { b.addEventListener('pointerdown', e => { e.preventDefault(); camDo(b.dataset.act); clearInterval(camRep); if (b.dataset.act !== 'home') camRep = setInterval(() => camDo(b.dataset.act), 90); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearInterval(camRep)); }
  // ---- your tongue, by colour. The face tracker's own tongue reading hardly moves, so the picture is looked at directly: the
  // patch just under your lower lip and the gap between your lips are compared with your cheeks. A tongue is much redder than skin.
  const tcv = document.createElement('canvas'); tcv.width = tcv.height = 6; const tcx = tcv.getContext('2d', { willReadFrequently: true }); let tSm = 0, tCurlSm = 0, tSideSm = 0, picSrc = null;   /* picSrc: a still picture being read instead of the video */
  const red = (x, y, r) => { const from = picSrc || video, w = from.videoWidth || from.width, h = from.videoHeight || from.height; if (!w) return 0; try { tcx.drawImage(from, Math.max(0, (x - r) * w), Math.max(0, (y - r) * h), Math.max(2, 2 * r * w), Math.max(2, 2 * r * h), 0, 0, 6, 6); const d = tcx.getImageData(0, 0, 6, 6).data; let R = 0, G = 0, Bl = 0; for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; Bl += d[i + 2]; } return (R - G) / Math.max(1, R + G + Bl); } catch { return 0; } };
  function tongueSeen(pts, jaw) { if (!pts || pts.length < 400) return null; const P = i => pts[i], mid = (a, b, t) => ({ x: P(a).x + (P(b).x - P(a).x) * t, y: P(a).y + (P(b).y - P(a).y) * t }), size = Math.hypot(P(234).x - P(454).x, P(234).y - P(454).y) || 0.2, r = size * 0.035;
    const skin = (red(mid(234, 61, 0.55).x, mid(234, 61, 0.55).y, r) + red(mid(454, 291, 0.55).x, mid(454, 291, 0.55).y, r)) / 2, under = mid(17, 152, 0.3), gap = mid(13, 14, 0.5), gapOpen = Math.hypot(P(13).x - P(14).x, P(13).y - P(14).y) / size;
    const below = red(under.x, under.y, r) - skin, inside = gapOpen > 0.035 ? red(gap.x, gap.y, r) - skin : 0, lft = red(mid(14, 61, 0.55).x, mid(14, 61, 0.55).y + size * 0.03, r) - skin, rgt = red(mid(14, 291, 0.55).x, mid(14, 291, 0.55).y + size * 0.03, r) - skin;
    const cl = v => Math.max(0, Math.min(1, v)), out = Math.max(cl((below - 0.035) / 0.07), cl((inside - 0.06) / 0.08) * cl(jaw * 4) * 0.7);
    return { out, curl: below > 0.05 ? -0.5 : 0.15, side: cl((lft - 0.04) / 0.08) - cl((rgt - 0.04) / 0.08), below, inside, skin }; }
  window.mocapTongue = (pts, jaw) => { const t = tongueSeen(pts, jaw || 0); if (!t || !pose.f) return t; tSm += (t.out - tSm) * 0.45; tCurlSm += (t.curl - tCurlSm) * 0.3; tSideSm += (t.side * (opt.mirror ? 1 : -1) - tSideSm) * 0.3; const o = Math.max(pose.f.tongueOut || 0, tSm > 0.12 ? tSm : 0); pose.f.tongueOut = +o.toFixed(3); pose.f.tongueCurl = +(0.5 + tCurlSm / 2).toFixed(3); pose.f.tongueSide = +(0.5 + tSideSm / 2).toFixed(3); pose.tongueDbg = t; return t; };
  // ---- a video file instead of the camera: every frame of it is read in turn (not in real time, so a slow device loses nothing) ----
  let importing = null;
  const seek = t => new Promise(res => { const done = () => { video.removeEventListener('seeked', done); res(); }; video.addEventListener('seeked', done); video.currentTime = t; setTimeout(done, 2500); });
  // a still picture: the pose in it is put on her and kept as a one-frame take (a pose clip), ready to save or to keep as a key
  async function importImage(file) {
    if (rec || importing) return; if (stream) camOff(); live = false; play.on = false; take = null; takeInfo(); say('Opening the picture...');
    let bmp; try { bmp = await createImageBitmap(file); } catch { return say('That picture could not be opened. Try a JPG or PNG.'); }
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    if ($('mirror').checked) { $('mirror').checked = false; $('mirror').onchange({ target: $('mirror') }); }
    say('Loading the body tracker (first time takes a moment)...');
    try { if (!tracker) { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm'); tracker = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 }); } } catch (e) { return say('The body tracker could not load: ' + (e.message || 'network')); }
    await loadFace(); await loadHands(); importing = { stop: false }; lmPrev = null; standH = 0; pose.f = null; rest(); picSrc = cv; opt.seen = 0.3; let seen = 0, s = null; const was = opt.snap; opt.snap = true;
    /* the trackers settle over a few looks at the same picture */
    for (let i = 0; i < 6; i++) { const ts = performance.now(); let r = null; try { r = tracker.detectForVideo(cv, ts); } catch {} const lm = r && r.worldLandmarks && r.worldLandmarks[0] && framed(r.worldLandmarks[0], r.landmarks && r.landmarks[0]); if (lm) { rest(); s = window.mocapFeed(lm); seen++; }   /* every look starts from a clean pose, so nothing is left over from an earlier guess */
      if (opt.hands && handTracker) { let hr = null; try { hr = handTracker.detectForVideo(cv, ts + 1); } catch {} if (hr && hr.worldLandmarks && hr.worldLandmarks.length) window.mocapHands(hr.worldLandmarks.map((points, n) => ({ points, label: ((hr.handedness || hr.handednesses || [])[n] || [{}])[0].categoryName || 'Right' }))); }
      if (opt.face && faceTracker) { let fr = null; try { fr = faceTracker.detectForVideo(cv, ts + 2); } catch {} const sh = fr && fr.faceBlendshapes && fr.faceBlendshapes[0]; if (sh) { const b = {}; for (const c of sh.categories) b[c.categoryName] = c.score; for (let j = 0; j < 8; j++) { window.mocapFace(b, fr.facialTransformationMatrixes && fr.facialTransformationMatrixes[0] && fr.facialTransformationMatrixes[0].data); window.mocapTongue(fr.faceLandmarks && fr.faceLandmarks[0], b.jawOpen || 0); } } }
      await new Promise(res => setTimeout(res, 40)); }
    opt.snap = was; delete opt.seen; picSrc = null; importing = null; pose.hip = 1; if (!seen) { rest(); return say('I could not find a person in that picture. It works best with one person, clearly lit, most of the body in view.'); }
    const one = snapshot(); one.hip = 1; take = [one]; play = { on: false, t: 0 }; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); toSliders();
    say('Pose read from the picture' + (s && s.legs ? '' : ' (top half only: her legs were not in view)') + '. Adjust it by hand if you like, then save it or keep it as a pose.');
  }
  async function importVideo(file) {
    if (rec || importing) return; if (stream) camOff(); live = false; play.on = false; take = null; takeInfo();
    if ($('mirror').checked) { $('mirror').checked = false; $('mirror').onchange({ target: $('mirror') }); }   /* she copies the person in the film side for side, not as a reflection */
    video.srcObject = null; video.src = URL.createObjectURL(file); video.muted = true; say('Opening the video...');
    try { await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('bad')); setTimeout(() => rej(new Error('slow')), 20000); }); } catch { video.removeAttribute('src'); return say('That video could not be opened. Try an MP4 or WebM file.'); }
    say('Loading the body tracker (first time takes a moment)...');
    try { if (!tracker) { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm'); tracker = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 }); } } catch (e) { return say('The body tracker could not load: ' + (e.message || 'network')); }
    await loadFace(); await loadHands();
    const dur = Math.min(60, video.duration || 0), n = Math.max(1, Math.floor(dur * FPS)), frames = [], heights = []; frames.fps = FPS; importing = { stop: false }; $('vidBtn').classList.add('on'); lmPrev = null; standH = 0; pose.f = null; rest(); opt.seen = 0.3; let seen = 0;
    for (let i = 0; i < n && !importing.stop; i++) {
      await seek(Math.min(dur - 0.001, i / FPS)); const ts = performance.now(); let r = null; try { r = tracker.detectForVideo(video, ts); } catch {}
      const lm = r && r.worldLandmarks && r.worldLandmarks[0] && framed(r.worldLandmarks[0], r.landmarks && r.landmarks[0]); let s = null; if (lm) { s = window.mocapFeed(lm); seen++; }
      if (opt.hands && handTracker) { let hr = null; try { hr = handTracker.detectForVideo(video, ts + 1); } catch {} if (hr && hr.worldLandmarks && hr.worldLandmarks.length) window.mocapHands(hr.worldLandmarks.map((points, k) => ({ points, label: ((hr.handedness || hr.handednesses || [])[k] || [{}])[0].categoryName || 'Right' }))); }
      if (opt.face && faceTracker) { let fr = null; try { fr = faceTracker.detectForVideo(video, ts + 2); } catch {} const sh = fr && fr.faceBlendshapes && fr.faceBlendshapes[0]; if (sh) { const b = {}; for (const c of sh.categories) b[c.categoryName] = c.score; window.mocapFace(b, fr.facialTransformationMatrixes && fr.facialTransformationMatrixes[0] && fr.facialTransformationMatrixes[0].data); window.mocapTongue(fr.faceLandmarks && fr.faceLandmarks[0], b.jawOpen || 0); } else pose.f = null; }
      frames.push(snapshot()); heights.push(s ? s.hipH : 0); if (i % 5 === 0) say(`Reading the video: ${Math.round(i / n * 100)}%  (tap File to stop)`);
    }
    /* how low her hips sit is judged against the tallest the person stood anywhere in the film, not only so far */
    const tall = Math.max(...heights, 0); frames.forEach((f, i) => { f.hip = tall && heights[i] ? Math.max(0.3, Math.min(1.25, heights[i] / tall)) : 1; });
    importing = null; delete opt.seen; $('vidBtn').classList.remove('on'); URL.revokeObjectURL(video.src); video.removeAttribute('src'); video.load(); rest(); pose.f = null; hands.left = hands.right = null;
    if (!seen || frames.length < 2) return say('I could not find a person in that video. It works best with one person, whole body in view, steady camera.');
    take = frames; play = { on: true, t: 0 }; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); say(`Video read: ${frames.length} frames, a person found in ${Math.round(seen / frames.length * 100)}% of them. It is playing on her now; clean it up, then save.`);
  }
  $('vidBtn').onclick = () => { if (importing) importing.stop = true; else $('vidFile').click(); }; $('vidFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name) ? importImage : importVideo)(f); }; window.mocapImage = importImage;
  /* a picture or video can also be pasted (Ctrl+V) or dropped onto her */
  const takeFile = f => { if (!f) return false; const pic = /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name || ''), vid = /^video\//.test(f.type); if (!pic && !vid) return false; (pic ? importImage : importVideo)(f); return true; };
  addEventListener('paste', e => { if (/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '') && e.target.type !== 'range') return; const items = [...((e.clipboardData && e.clipboardData.items) || [])], it = items.find(i => i.kind === 'file' && /^(image|video)\//.test(i.type)); if (it && takeFile(it.getAsFile())) e.preventDefault(); else if (!it) say('There is no picture on the clipboard. Copy an image first (right click, Copy image), then press Ctrl+V here.'); });
  view.addEventListener('dragover', e => e.preventDefault()); view.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!takeFile(f)) say('Drop a picture or a video file.'); }); window.mocapVideo = importVideo;
  // each finger by hand: pick which hand, then a slider a finger
  const fingerSliders = () => { const side = $('handSel').value === 'right' ? 'right' : 'left'; for (const f of ['Thumb', ...FINGERS]) $('f' + f).value = curl[side][f]; };
  $('handSel').onchange = fingerSliders; for (const f of ['Thumb', ...FINGERS]) $('f' + f).oninput = e => { const sel = $('handSel').value; for (const side of sel === 'both' ? ['left', 'right'] : [sel]) curl[side][f] = +e.target.value; }; fingerSliders();
  for (const [id, k] of [['tOut', 'out'], ['tCurl', 'curl'], ['tSide', 'side']]) $(id).oninput = e => { tng[k] = +e.target.value; };
  // your hands seen by the camera: which of hers each one drives depends on the mirror
  window.mocapHands = list => { for (const h of list) { const mine = h.label === 'Left' ? 'right' : 'left', side = opt.mirror ? (mine === 'left' ? 'right' : 'left') : mine; hands[side] = { bends: fingersOf(h.points), at: performance.now() }; } };

  // ---- recording and the take ----
  let rec = null, take = null, play = { on: false, t: 0 }, saved = {};
  const clean = () => ({ in: +$('trimIn').value, out: +$('trimOut').value, smooth: +$('smooth').value, speed: +$('speed').value, mirror: $('flip').checked, loop: $('loop').checked });
  const built = () => (take ? toClip(take, clean()) : null);
  function takeInfo() { const c = built(); $('takeBox').hidden = !take; if (c) $('takeLen').textContent = `${c.n} frames, ${c.dur.toFixed(2)} s`; }
  $('recBtn').onclick = async () => {
    if (rec) { take = rec.frames; rec = null; $('recBtn').classList.remove('on'); play = { on: true, t: 0 }; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); return say(`Take recorded: ${take.length} frames. It is playing on her now; clean it up below, then save.`); }
    for (let i = 3; i > 0; i--) { say('Recording in ' + i + '...'); await new Promise(r => setTimeout(r, 800)); }
    rec = { frames: [], next: performance.now() }; rec.frames.fps = FPS; play.on = false; $('recBtn').classList.add('on'); say('Recording. Press Stop when you are done.');
  };
  $('playBtn').onclick = () => { play.on = !play.on; }; $('scrub').oninput = e => { play.on = false; play.t = +e.target.value; };
  for (const id of ['trimIn', 'trimOut', 'smooth', 'speed', 'flip', 'loop']) $(id).oninput = takeInfo;
  $('dropTake').onclick = () => { take = null; play.on = false; takeInfo(); say('Take dropped.'); };

  // ---- poses by hand: turn one bone with sliders, keep poses as keys, make a take from the keys ----
  const keys = [], boneSel = $('bone'); for (const n of BONES) boneSel.append(new Option(n, n));
  const e3 = new THREE.Euler(), toSliders = () => { e3.setFromQuaternion(pose.q[boneSel.value]); ['rx', 'ry', 'rz'].forEach((id, i) => { $(id).value = [e3.x, e3.y, e3.z][i]; }); };
  boneSel.onchange = toSliders; for (const id of ['rx', 'ry', 'rz']) $(id).oninput = () => { play.on = false; pose.q[boneSel.value].setFromEuler(e3.set(+$('rx').value, +$('ry').value, +$('rz').value)); }; toSliders();
  $('restBtn').onclick = () => { rest(); toSliders(); };
  function drawKeys() { const box = $('keys'); box.textContent = ''; keys.forEach((k, i) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = `${i + 1}: ${k.hold}s`; b.title = 'Tap to put her back in this pose; double tap to remove it'; b.onclick = () => { play.on = false; for (const n of BONES) pose.q[n].fromArray(k.q[n]); pose.hip = k.hip; toSliders(); }; b.ondblclick = () => { keys.splice(i, 1); drawKeys(); }; box.append(b); }); $('keysBtn').disabled = !keys.length; }
  $('keyBtn').onclick = () => { keys.push({ ...snapshot(), hold: Math.max(0.1, +$('hold').value || 0.5), ease: 0.4 }); drawKeys(); say(`Pose ${keys.length} kept. Add more, then "Make a take from the poses".`); };
  $('keysBtn').onclick = () => { take = keysToFrames(keys); play = { on: true, t: 0 }; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); say('A take was made from your poses. It is playing now.'); }; drawKeys();

  // ---- saving: into the game's clips, as a file, from a file ----
  async function listSaved() { try { saved = (await (await fetch('/api/anims')).json()).clips || {}; } catch { saved = {}; } const box = $('saved'); box.textContent = '';
    for (const name of Object.keys(saved).sort()) { const row = document.createElement('div'); row.className = 'row'; const a = document.createElement('button'); a.className = 'chip'; a.textContent = `${name} (${(saved[name].dur || 0).toFixed(1)} s)`; a.title = 'Play this clip on her';
      a.onclick = () => { const c = saved[name]; take = Array.from({ length: c.n }, (_, i) => { const q = {}; for (const b in c.bones) q[b] = c.bones[b].slice(i * 4, i * 4 + 4); return { q, hip: c.hips ? c.hips[i * 3 + 1] : 1, ...(c.face ? { f: Object.fromEntries(Object.keys(c.face).map(k => [k, c.face[k][i]])) } : {}) }; }); play = { on: true, t: 0 }; $('name').value = name; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); say(`"${name}" is playing. You can clean it up and save it again, under this name or a new one.`); };
      const x = document.createElement('button'); x.className = 'mini'; x.textContent = '✕'; x.title = 'Delete this clip from the game'; x.onclick = async () => { if (!confirm(`Delete the clip "${name}" from the game?`)) return; await fetch('/api/anims/clip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ remove: name }) }); listSaved(); }; row.append(a, x); box.append(row); } }
  $('saveBtn').onclick = async () => { const c = built(), name = $('name').value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40); if (!c) return say('Record a take or make one from poses first.'); if (!name) return say('Give the take a name first.');
    if (saved[name] && !confirm(`There is already a clip called "${name}". Replace it?`)) return; const r = await fetch('/api/anims/clip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, clip: c }) }), d = await r.json().catch(() => ({}));
    say(r.ok ? `Saved as "${name}". In the game: a Studio event can play it, and a Reaction can use it as clip:${name}.` : (d.error || 'It could not be saved.')); listSaved(); };
  $('dlBtn').onclick = () => { const c = built(); if (!c) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(c)], { type: 'application/json' })); a.download = ($('name').value.trim() || 'take') + '.json'; a.click(); };
  $('upFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const c = JSON.parse(await f.text()); if (!c.bones || !c.n) throw 0; take = Array.from({ length: c.n }, (_, i) => { const q = {}; for (const b in c.bones) q[b] = c.bones[b].slice(i * 4, i * 4 + 4); return { q, hip: c.hips ? c.hips[i * 3 + 1] : 1, ...(c.face ? { f: Object.fromEntries(Object.keys(c.face).map(k => [k, c.face[k][i]])) } : {}) }; }); play = { on: true, t: 0 }; takeInfo(); say('Clip loaded from the file.'); } catch { say('That file is not a clip saved from here.'); } };
  listSaved(); say('Ready. Turn the camera on, open or paste a picture or video, or pose her by hand.');

  // ---- every frame ----
  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (live && tracker && video.readyState >= 2 && !(play.on && !rec)) { let r = null; try { r = tracker.detectForVideo(video, now); } catch {} const lm = r && r.worldLandmarks && r.worldLandmarks[0] && framed(r.worldLandmarks[0], r.landmarks && r.landmarks[0]); if (lm) { const s = window.mocapFeed(lm); if (!rec) say((s.legs ? 'Tracking your whole body' : 'Tracking your top half (step back for legs)') + (pose.f ? ' and your face.' : '.')); } else if (!rec) say('I cannot see you. Step into view.');
      if (opt.hands && handTracker && tick % 2 === 1) { let hr = null; try { hr = handTracker.detectForVideo(video, now + 2); } catch {} if (hr && hr.worldLandmarks && hr.worldLandmarks.length) window.mocapHands(hr.worldLandmarks.map((points, i) => ({ points, label: ((hr.handedness || hr.handednesses || [])[i] || [{}])[0].categoryName || 'Right' }))); }
      if (opt.face && faceTracker && tick++ % 2 === 0) { let fr = null; try { fr = faceTracker.detectForVideo(video, now + 1); } catch {} const sh = fr && fr.faceBlendshapes && fr.faceBlendshapes[0]; if (sh) { const b = {}; for (const c of sh.categories) b[c.categoryName] = c.score; window.mocapFace(b, fr.facialTransformationMatrixes && fr.facialTransformationMatrixes[0] && fr.facialTransformationMatrixes[0].data); window.mocapTongue(fr.faceLandmarks && fr.faceLandmarks[0], b.jawOpen || 0); } else if (performance.now() - (pose.faceHead || 0) > 1500) pose.f = null; } }
    if (rec) while (now >= rec.next) { rec.frames.push(snapshot()); rec.next += 1000 / FPS; if (rec.frames.length >= FPS * 60) { $('recBtn').click(); break; } }
    if (importing) { show(snapshot()); } else if (take && (play.on || !live) && !rec) { const c = built(), n = c.n; if (play.on) play.t = (play.t + dt / c.dur) % 1; const i = Math.min(n - 1, Math.floor(play.t * n)), fr = { q: {}, hip: c.hips[i * 3 + 1] }; for (const b in c.bones) fr.q[b] = c.bones[b].slice(i * 4, i * 4 + 4); if (c.face) { fr.f = {}; for (const k in c.face) fr.f[k] = c.face[k][i]; } if (play.on || document.activeElement === $('scrub')) { show(fr); $('scrub').value = play.t; } else show(snapshot()); $('playBtn').classList.toggle('on', play.on); }
    else show(snapshot());
    if ((live || importing) && opt.focus && now > frameMine && !drag) { const f = FRAMES[frameAs], k = Math.min(1, dt * 2.5), wide = Math.max(1, 0.9 / camera.aspect); orbit.yaw += (0 - orbit.yaw) * k; orbit.pitch += (0.04 - orbit.pitch) * k;   /* always from the front, on the part of you in the picture */ orbit.y += (f[0] - orbit.y) * k; orbit.dist += (f[1] * wide - orbit.dist) * k; }
    if (opt.solid) fix(1);   // her arms and legs keep out of her own body
    vrm.update(dt); camera.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist, orbit.y + 0.05 + Math.sin(orbit.pitch) * orbit.dist, Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist); camera.lookAt(0, orbit.y, 0); renderer.render(scene, camera);
  })(last);
  window.mocapDbg = { euler: q => { const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); return { yaw: Math.round(e.y * 57.3), pitch: Math.round(e.x * 57.3), roll: Math.round(e.z * 57.3) }; }, get trackers() { return { tracker, faceTracker }; }, orbit, tng, tongue, pose, keys, get take() { return take; }, built, solve };
}
