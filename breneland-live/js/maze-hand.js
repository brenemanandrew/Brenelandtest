// The lantern in your hand below Angell Street, in first person. The arm is your own right arm the way the intro shows it (intro.js
// buildArm): a copy of your body's shoulder group, so the same smooth skinned tube tapering to an oval wrist, your own sleeve (long
// with its cuff, short with the bare forearm, a jacket's over the shirt's cuff, a robe's wide one), your skin and hand size, the
// hand closed round the lantern's bail (fingers curled under it, thumb round the end, back of the hand to you).
//
// Laid out from the hand back, intro.js's way: the hand's frame from where the forearm points and which way the palm faces, the
// wrist up the hand from the grip, the elbow a forearm's length back, the shoulder an upper arm's length on toward your right
// shoulder. intro.js `solveShade` turns that into the shoulder's turn, the elbow's fold and the forearm's twist, and bodies-arm.js
// `poseArmBones` bends the elbow's own bones. The pose is set once (the hand stays still in the camera's frame, maze-fx swings it).
//
// The group's origin is the grip. maze-fx.js moves and tips the whole hand a little with the stride and swings the lantern on its
// pendulum from the fist (`userData.lamp`). The arm's materials are copies (the body's are shared with every person). maze-fx
// shades them in cel bands from the lantern's glass (no scene lights: a lit material this close to the light blew out white).
import * as THREE from 'three';
import { rebindArmCopy, poseArmBones } from './bodies-arm.js';
import { solveShade } from './intro.js';

// hand-local, about the camera's axes (x right, y up, -z ahead); the origin is the grip. Two layouts: a wide screen (the hand right
// of the middle, the forearm in from off the lower right edge) and a tall one (maze-fx.js puts the hand smaller in the lower middle:
// the forearm comes in from the right, over the lantern's shoulder, never across its glass)
export const FP_ARM = {
  k: 1.0,                       // the arm's scale: the cartoon's lengths at the lantern's size
  fore: [-0.35, 0.3, -1],       // the forearm's way, elbow to wrist: ahead, a little in and up
  palm: [-0.35, -1, 0.05],      // the palm faces down and a little in: the fingers close under the bail, the back of the hand to you
  shoulder: [0.12, -0.45, 0.6], // toward your right shoulder, from the grip (only the elbow's end of the upper arm is ever on screen)
};
// on a tall screen the forearm comes in more from behind you and the palm faces down as on a wide screen, so you see the back of
// the fist with the fingers curled under the bail and the thumb over it, not a pinch. The forearm stays clear of the glass
export const FP_ARM_TALL = { k: 1.0, fore: [-0.7, 0.3, -0.7], palm: [-0.05, -1, -0.25], shoulder: [0.9, -0.45, 0.45] }; // the palm turned a little for the lower-right hand, so the knuckles still face away

// The lantern (unlit flat colours: maze-fx.js tells its iron, flame and wick from the hand by these colours): an iron frame, a pale
// glass with the flame inside it, a bail over the top for the hand to hold. Returns { lamp, frame, glass, flame }; the lamp group's
// origin is the top of the bail (the grip).
function buildLantern(bailDir) {
  const mat = c => new THREE.MeshBasicMaterial({ color: c, fog: false });
  const iron = mat('#2a241c');
  const lamp = new THREE.Group(); lamp.name = 'fp-lantern';
  const frame = new THREE.Group(); frame.position.set(0, -0.093, 0); // the bail's top at the origin
  // the bail: a half ring from one side of the lid to the other, square to the knuckles' line (the fist closes round its top)
  frame.rotation.y = bailDir;
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.0065, 6, 14, Math.PI), iron); bail.position.y = -0.015; bail.scale.y = 1.35; // its feet on the lid, tall enough that the fist clears the lid
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.17), iron); top.position.y = -0.03;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.11), iron); cap.position.y = 0.0;
  // the glass glows (a pale warm pane you see the flame through), the flame bright inside it: the light reads as coming from here
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.12), new THREE.MeshBasicMaterial({ color: '#ffd9a0', fog: false, transparent: true, opacity: 0.55, depthWrite: false })); glass.position.y = -0.135;
  glass.renderOrder = 2;
  // the flame itself is maze-flame.js's (one draw with the torches', a toon teardrop that leans against your motion and gutters).
  // Here only where it stands: `flame` is the top of the wick (maze-fx.js reads it each frame, its visible flag is the wick lit)
  const flame = new THREE.Object3D(); flame.name = 'fp-flame'; flame.position.y = -0.183;
  const flameCore = null;
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.035, 8), new THREE.MeshBasicMaterial({ color: '#3a2a1a', fog: false })); wick.position.y = -0.205;
  const wickTip = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.016, 6), wick.material); wickTip.position.y = -0.18; // the wick, standing out of the burner
  const bot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.17), iron); bot.position.y = -0.24;
  // the box turned an eighth of a turn under the bail, so a pane faces you instead of a corner bar and the flame shows through it
  const box = new THREE.Group(); box.rotation.y = Math.PI / 4; frame.add(box);
  for (const k of [-1, 1]) for (const j of [-1, 1]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.22, 0.012), iron); bar.position.set(k * 0.075, -0.135, j * 0.075); box.add(bar); }
  frame.add(bail); box.add(top, cap, glass, flame, wick, wickTip, bot);
  lamp.add(frame);
  return { lamp, frame, glass, flame, flameCore };
}

// Your right arm, copied from `body` (a Human in your look), posed in the hand's frame with the grip at the origin. -> { arm, anchor,
// wrist, mats, bail (the knuckles' line's turn about y, for the lantern's bail), err (metres: how far the grip ended up from the
// origin, for tests) } or null when the body has no right arm.
export function buildFpArm(body, P = FP_ARM) {
  const A = body?.armR, sh = A?.shoulder, elbow = A?.elbow;
  if (!sh || !elbow) return null;
  const ei = sh.children.indexOf(elbow);
  const c = sh.clone(true);
  c.name = 'fp-arm';
  c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
  const mats = [];
  c.traverse(o => {
    if (o !== c && !o.isMesh) o.rotation.set(0, 0, 0); // the elbow and the wrist straight, posed below
    if (!o.isMesh) return;
    if (o.layers.mask === 0) o.layers.mask = 1; // rigid-merge draws a body's parts as one mesh and parks the originals
    o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.userData.noMerge = true;
    o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); // the body's materials are shared with every person
    mats.push(...[].concat(o.material));
  });
  const el = c.children[ei];
  const bones = rebindArmCopy(c);
  let wrist = null;
  c.traverse(o => { if (o.userData.wrist) wrist = o; });
  if (!wrist || !el) return null;
  // nothing held in the copy's anchor (the body's lantern: the maze's own hangs from the grip instead); the hand closed
  const anchors = wrist.children.filter(o => !o.isGroup && !o.isMesh);
  for (const an of anchors) an.clear();
  const anchor = anchors[0];
  c.traverse(o => { if (o.userData.handShape) o.visible = o.userData.handShape === 'grip'; });
  const fp = { arm: c, el, anchor, wrist, mats, bones, Lu0: body.dims?.Lu || Math.abs(el.position.y), bail: 0, err: 0 };
  poseFpArm(fp, P);
  return fp;
}

// Pose the copy (from the hand back): the hand's frame, the wrist up the hand from the grip, the elbow back along the forearm, the
// shoulder on toward yours; sets fp.bail (the knuckles' line's turn about y, for the lantern's bail) and fp.err (metres: how far the
// grip ended up from the origin, for tests). No scene-graph changes; a handful of small allocations (on a layout change only).
export function poseFpArm(fp, P) {
  const { arm: c, el, anchor, wrist } = fp;
  const V = THREE.Vector3, k = P.k, Lu = Math.abs(el.position.y) * k, Lf = Math.abs(wrist.position.y) * k;
  const f = new V(...P.fore).normalize();
  const px = new V(...P.palm); px.addScaledVector(f, -px.dot(f)).normalize(); // the palm (a right hand's +x), square to the forearm
  const py = f.clone().negate(), pz = new V().crossVectors(px, py);          // the hand hangs down its -y; +z the knuckles' line (the thumb's end)
  const R = new THREE.Matrix4().makeBasis(px, py, pz);
  const W = (anchor ? anchor.position.clone() : new V()).multiplyScalar(k).applyMatrix4(R).negate();
  const E = W.clone().addScaledVector(f, -Lf);
  const S = E.clone().addScaledVector(new V(...P.shoulder).sub(E).normalize(), Lu);
  const s = solveShade(S, W, Lu, Lf, E.clone().sub(S).toArray(), px.toArray());
  c.position.copy(S); c.quaternion.copy(s.q); c.scale.setScalar(k);
  el.quaternion.setFromEuler(new THREE.Euler(-s.el, s.tw, 0, 'XYZ'));
  poseArmBones({ bones: { C: null, E: fp.bones.E }, shoulder: c, elbow: el }, fp.Lu0);
  // where the grip ended up, in the arm's parent's frame (the hand's)
  c.updateMatrix(); el.updateMatrix(); wrist.updateMatrix();
  const g = (anchor ? anchor.position.clone() : new V()).applyMatrix4(wrist.matrix).applyMatrix4(el.matrix).applyMatrix4(c.matrix);
  fp.err = g.length();
  // the bail runs along the knuckles' line, level (a bail is the same either way round)
  let bail = Math.atan2(-pz.z, pz.x); if (bail > Math.PI / 2) bail -= Math.PI; else if (bail < -Math.PI / 2) bail += Math.PI;
  fp.bail = bail;
  return fp;
}

// The whole hand: your arm and the lantern hanging from the fist. -> the group (cam.add it); userData { glass, flame, lamp, arm }.
export function buildLanternHand(body) {
  const hand = new THREE.Group(); hand.name = 'fp-hand';
  const fp = buildFpArm(body, FP_ARM);
  const L = buildLantern(fp ? fp.bail : 0);
  hand.add(L.lamp);
  if (fp) hand.add(fp.arm);
  hand.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  hand.userData.glass = L.glass; hand.userData.flame = L.flame; hand.userData.flameCore = L.flameCore; hand.userData.lamp = L.lamp; hand.userData.arm = fp;
  // maze-fx.js, when the screen turns between wide and tall: the arm laid out for it, the bail turned to the new fist
  let tallNow = false;
  hand.userData.layout = tall => {
    if (!fp || tall === tallNow) return;
    tallNow = tall;
    poseFpArm(fp, tall ? FP_ARM_TALL : FP_ARM);
    L.frame.rotation.y = fp.bail;
  };
  hand.userData.dispose = () => {
    L.lamp.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    for (const m of fp?.mats || []) m.dispose(); // the arm's geometry is the body's, body.dispose frees it
  };
  return hand;
}

// A lantern someone carries below (your own body in third person, a friend's). The yard's lantern (human.js) has an opaque glowing
// box for its glass, so no flame could show in it. Below it's swapped for one like the hand's: an iron frame (one mesh), a pale glass
// you see through (its own material, maze-fx.js warms it with that lantern's flicker) and the wick's top for the flame (maze-flame.js
// draws it). -> { glass, flame, dispose } (also on human.root.userData.mzLamp), or null without a lantern.
const LAMP_GEO = (() => {
  const parts = [], add = (g, x, y, z) => { g.translate(x, y, z); parts.push(g); };
  add(new THREE.BoxGeometry(0.16, 0.03, 0.16), 0, 0.03, 0); add(new THREE.BoxGeometry(0.1, 0.025, 0.1), 0, 0.055, 0);   // the lid and its cap
  add(new THREE.BoxGeometry(0.16, 0.03, 0.16), 0, -0.17, 0); add(new THREE.CylinderGeometry(0.028, 0.032, 0.03, 8), 0, -0.14, 0); // the base, the burner
  add(new THREE.CylinderGeometry(0.003, 0.004, 0.014, 6), 0, -0.118, 0);                                                     // the wick
  for (const a of [-1, 1]) for (const b of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.19, 0.012), a * 0.07, -0.07, b * 0.07); // the corner bars
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), 0, 0.1, 0);                                                         // the handle, up into the fist
  const pos = [], nor = [];
  for (const g of parts) { const p = g.index ? g.toNonIndexed() : g; pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.computeBoundingSphere();
  return geo;
})();
const LAMP_IRON = new THREE.MeshLambertMaterial({ color: '#2f2a24' }); LAMP_IRON.name = 'maze-lamp-iron';
const LAMP_GLASS_GEO = new THREE.BoxGeometry(0.12, 0.17, 0.12);
export function dressLantern(human) {
  const l = human?.lantern; if (!l) return null;
  if (human.root.userData.mzLamp) return human.root.userData.mzLamp;
  for (const c of l.children) c.visible = false;
  const iron = new THREE.Mesh(LAMP_GEO, LAMP_IRON); iron.name = 'mz-lamp-iron'; iron.castShadow = false;
  const glassMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.45, depthWrite: false, fog: true });
  const glass = new THREE.Mesh(LAMP_GLASS_GEO, glassMat); glass.position.y = -0.07; glass.renderOrder = 2; glass.name = 'mz-lamp-glass';
  const flame = new THREE.Object3D(); flame.position.y = -0.112; flame.name = 'mz-lamp-flame';
  l.add(iron, glass, flame);
  const lamp = { glass, flame, iron, dispose() { l.remove(iron, glass, flame); glassMat.dispose(); for (const c of l.children) c.visible = true; delete human.root.userData.mzLamp; } };
  human.root.userData.mzLamp = lamp;
  return lamp;
}
