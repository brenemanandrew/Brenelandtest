// Draws a VRM model (VRoid and friends) as Wizra's avatar. It is a renderer for avatar.js: the controller there decides
// her mood, reactions and where she looks; this file turns that into bones and expressions on the model.
//   const r = await create(url)   ->  { el, locate(e), draw(state), dispose() }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMHumanoid, VRMExpressionManager } from '@pixiv/three-vrm';
import { buildPlaces, cel } from './places.js';
import { bodyFix } from './bodyfix.js';
import { addTongue } from './tongue.js';
import { boneCloth } from './bonecloth.js';
import { buildBeach, RUN_Z } from './beach.js';
import { fineFace, WHOLE } from './fineface.js';

// controller face name -> VRM expression weights (+ blink for heavy lids)
const EXPR = {
  tipsy: { happy: 0.5, blink: 0.28 }, high: { relaxed: 0.55, happy: 0.3, blink: 0.44 },
  neutral: {}, happy: { happy: 0.6 }, playful: { happy: 0.35 }, chill: { relaxed: 0.6 }, focused: { angry: 0.2, blink: 0.25 }, excited: { happy: 1 },
  tired: { relaxed: 0.4, blink: 0.45 }, grumpy: { angry: 0.6 }, sad: { sad: 0.7 }, anxious: { sad: 0.35, surprised: 0.3 }, joy: { happy: 1 },
  blush: { relaxed: 0.5, sad: 0.2 }, surprised: { surprised: 1 }, flinch: { blink: 1, sad: 0.4 }, dizzy: { blink: 0.8, sad: 0.5 }, angry: { angry: 1 },
  eyeroll: { blink: 0.3 }, thinking: { relaxed: 0.2 }, suspicious: { angry: 0.3, blink: 0.35 },
};
const NAMES = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink', 'aa', 'oh'];

// A plain model (.glb with a skeleton but no VRM data, for example exported from Blender or Mixamo) made usable here: its bones are
// matched to the standard body parts by name, and the parts of a VRM it does not have (expressions, eye aim, hair springs) are left empty.
// It should be standing in a T or A pose. Names understood: Mixamo's (LeftArm, LeftForeArm, LeftUpLeg...), Blender-style (upper_arm.L,
// forearm.L, thigh.L, shin.L), Unreal-style (upperarm_l, lowerarm_l, thigh_l, calf_l) and VRM's own (leftUpperArm...).
function plainModel(gltf) { const bones = []; gltf.scene.traverse(o => { if (o.isBone) bones.push(o); }); if (!bones.length) throw new Error('That model has no skeleton, so it cannot be posed.');
  const info = bones.map(b => { let n = b.name.replace(/^.*[:|]/, '').replace(/mixamorig\d*/i, '').replace(/^(def|org|bip\d*|bn|b|j|jnt|joint)[-_. ]/i, ''); let side = ''; const lr = /(^|[-_. ])(l|left)([-_. ]|$)|left/i.test(n) ? 'left' : /(^|[-_. ])(r|right)([-_. ]|$)|right/i.test(n) ? 'right' : ''; if (lr) { side = lr; n = n.replace(/left|right/i, '').replace(/(^|[-_. ])(l|r)(?=[-_. ]|$)/i, '$1'); } return { b, side, key: n.toLowerCase().replace(/[^a-z0-9]/g, '') }; });
  const pick = (side, ...res) => { for (const re of res) { const hit = info.find(i => i.side === side && re.test(i.key) && !i.used); if (hit) { hit.used = true; return hit.b; } } return null; }, H = {};
  const set = (name, b) => { if (b) H[name] = { node: b }; };
  set('hips', pick('', /^(hips?|pelvis)$/, /^(root|hip|pelvis)/)); set('spine', pick('', /^spine(0|00|000|01)?$/, /^(spine|abdomen|waist)/)); set('chest', pick('', /^(spine(1|001|02)|chest)$/, /^(spine|chest)/)); set('upperChest', pick('', /^(spine(2|002|03)|upperchest)$/)); set('neck', pick('', /^neck(0|01)?$/, /^neck/)); set('head', pick('', /^head$/, /^head/));
  for (const sd of ['left', 'right']) { set(sd + 'Shoulder', pick(sd, /^(shoulder|clavicle|collar)/)); set(sd + 'UpperArm', pick(sd, /^(upperarm|arm|uparm)(01)?$/, /^(upperarm|arm)/)); set(sd + 'LowerArm', pick(sd, /^(lowerarm|forearm|elbow)(01)?$/, /^(lowerarm|forearm)/)); set(sd + 'Hand', pick(sd, /^(hand|wrist)$/, /^hand/));
    set(sd + 'UpperLeg', pick(sd, /^(upperleg|upleg|thigh)(01)?$/, /^(upperleg|upleg|thigh)/)); set(sd + 'LowerLeg', pick(sd, /^(lowerleg|leg|shin|calf|knee)(01)?$/, /^(lowerleg|shin|calf|leg)/)); set(sd + 'Foot', pick(sd, /^(foot|ankle)$/, /^foot/)); set(sd + 'Toes', pick(sd, /^(toes?|toebase|ball)(01)?$/)); }
  const need = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'], miss = need.filter(n => !H[n]);
  if (miss.length) throw new Error('Could not find these body parts in the model by bone name: ' + miss.join(', ') + '.');
  gltf.scene.updateMatrixWorld(true); const humanoid = new VRMHumanoid(H, { autoUpdateHumanBones: true }); gltf.scene.add(humanoid.normalizedHumanBonesRoot);
  /* size: a model made in centimetres (or any odd scale) is brought to about her height */
  const box = new THREE.Box3().setFromObject(gltf.scene), tall = box.max.y - box.min.y; if (tall > 0.01 && (tall > 2.6 || tall < 0.9)) { const hold = new THREE.Group(), k = 1.6 / tall; for (const c of [...gltf.scene.children]) hold.add(c); hold.scale.setScalar(k); hold.position.y = -box.min.y * k; gltf.scene.add(hold); gltf.scene.updateMatrixWorld(true); }
  return { scene: gltf.scene, humanoid, meta: { metaVersion: '1', name: 'plain model' }, plain: true, expressionManager: new VRMExpressionManager(), lookAt: null, springBoneManager: { joints: new Set(), colliderGroups: [], colliders: [], reset() {}, update() {}, setInitState() {} }, update() { humanoid.update(); } }; }
export async function create(url, opts = {}) {
  const el = document.createElement('div');
  el.style.cssText = 'width:100%;height:100%;background:radial-gradient(circle at 50% 35%, #8a5bb8, #4a2d7a 55%, #2a1b4d 100%)';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI), amb = new THREE.AmbientLight(0xffffff, 0.4); sun.position.set(0.6, 1, 1.2).multiplyScalar(9); scene.add(sun, amb);
  // soft shadows from the one key light (things and her on the floor and walls), a cool rim light from behind for depth, and a
  // light that only lightning uses. Phones get a smaller shadow map.
  const coarse = matchMedia('(pointer:coarse)').matches; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 40 }); sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.035; sun.shadow.radius = 5; sun.target.position.set(0, 0.4, 1); scene.add(sun.target);
  const rim = new THREE.DirectionalLight('#c4a8ff', 0.9), bolt = new THREE.AmbientLight('#d4e2ff', 0); rim.position.set(-3, 4, -5); scene.add(rim, bolt);
  // who throws a shadow and who catches one: flat panels (floors, walls, the view outside) only catch; solid things do both; glowing things neither
  const shadeUp = root => root.traverse(o => { if (!o.isMesh || !o.material || o.material.isMeshBasicMaterial || o.material.transparent) return; const flatGeo = o.geometry && (o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'CircleGeometry'); o.receiveShadow = true; o.castShadow = !flatGeo; });
  // the room follows the clock on the device you are watching from: bright by day, warm in the evening, dim and blue at night
  let night = 0, mood = 0, gloom = 0;   // gloom: how much the weather (and a power cut) takes out of the light   // mood: how dark the place itself is (a camp at night), whatever the clock says
  let relight = null; const FRONT = new THREE.Vector3(0.6, 1, 1.2).multiplyScalar(9);   // relight: set once the rooms exist (below). FRONT: a plain light from the viewer's side, for the picture backdrops and the heart game
  let stageK = null;   // the heart game's plain pink stage: null when the room is showing, else 0..1 for how deep the pink has gone
  function daylight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const day = Math.max(0, Math.min(1, (h - 6) / 1.5)) * Math.max(0, Math.min(1, (20.5 - h) / 2)); night = 1 - day;
    const eve = Math.max(0, 1 - Math.abs(h - 19) / 2.5);
    sun.intensity = Math.PI * (0.62 + 0.38 * day); sun.color.setRGB(1 - 0.12 * night + 0.02 * eve, 1 - 0.14 * night - 0.08 * eve, 1 - 0.02 * night - 0.2 * eve);
    amb.intensity = 0.26 + 0.2 * day;
    if (gloom) { sun.intensity *= 1 - 0.85 * gloom; amb.intensity *= 1 - 0.62 * gloom; sun.color.setRGB(sun.color.r * (1 - 0.3 * gloom), sun.color.g * (1 - 0.2 * gloom), sun.color.b); }
    if (mood) { sun.intensity = Math.PI * (0.62 + 0.38 * day) * (1 - 0.72 * mood) * (1 - 0.6 * gloom); sun.color.setRGB(1 - 0.35 * mood, 1 - 0.25 * mood, 1); amb.intensity = (0.26 + 0.2 * day) * (1 - 0.3 * mood); }
    if (relight) try { relight(day); } catch {}
    if (stageK !== null) return;
    el.style.background = `radial-gradient(circle at 50% 35%, hsl(${272 - 20 * night} ${45 - 10 * night}% ${54 - 26 * night}%), hsl(264 46% ${32 - 14 * night}%) 55%, hsl(258 48% ${20 - 9 * night}%) 100%)`;
  }
  daylight(); const dayTimer = setInterval(daylight, 60000);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 70);

  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm || plainModel(gltf);
  // Older (0.x) models are built facing the other way, which also turns every forward bend into a backward one. Everything here is written
  // for the newer kind, so an older model is made to look like one: its picture is turned round inside a holder, the posing skeleton's
  // joints are moved to where a newer model has them, and each time the pose is handed to the picture the bends are mirrored.
  if (vrm.meta && vrm.meta.metaVersion === '0') { const hu = vrm.humanoid, rig = hu.normalizedHumanBonesRoot, inner = new THREE.Group(); inner.rotation.y = Math.PI; for (const c of [...vrm.scene.children]) if (c !== rig) inner.add(c); vrm.scene.add(inner);
    const nodes = Object.keys(hu.humanBones).map(n => hu.getNormalizedBoneNode(n)).filter(Boolean); for (const b of nodes) { b.position.x *= -1; b.position.z *= -1; }
    const flip = () => { for (const b of nodes) { b.quaternion.x *= -1; b.quaternion.z *= -1; } }, base = hu.update.bind(hu); hu.update = () => { flip(); try { base(); } finally { flip(); } }; }
  vrm.scene.traverse(o => { o.frustumCulled = false; });
  scene.add(vrm.scene);
  // Build: a heavier or lighter set for her, on whatever outfit is loaded. Every vertex is moved out from the bone it hangs on (thigh,
  // hip, waist, upper arm, calf) in the rest shape, by how much it belongs to that bone, so body and clothes thicken together and it
  // holds in every pose. Skirt and coat bones count as the hips. Worked out once here (rest pose); setBuild(0..100) blends it in live.
  const build = { v: 0, f: 0, parts: [] };
  try { vrm.scene.updateMatrixWorld(true); const H = vrm.humanoid, raw = n => H.getRawBoneNode(n), human = new Set(Object.keys(H.humanBones || {}).map(raw).filter(Boolean)), wp = o => o.getWorldPosition(new THREE.Vector3()), tgt = new Map(), hipsP = raw('hips') ? wp(raw('hips')) : null;
    const limb = (a, b, f) => { const A = raw(a), B = raw(b); if (A && B) { const pa = wp(A), u = wp(B).sub(pa).normalize(); tgt.set(A, { a: pa, u, f }); } }, torso = (a, f) => { const A = raw(a); if (A && hipsP) tgt.set(A, { a: hipsP, u: new THREE.Vector3(0, 1, 0), f }); };
    torso('hips', 0.17); torso('spine', 0.16); torso('chest', 0.08); torso('upperChest', 0.05); for (const sd of ['left', 'right']) { limb(sd + 'UpperLeg', sd + 'LowerLeg', 0.22); limb(sd + 'LowerLeg', sd + 'Foot', 0.1); limb(sd + 'UpperArm', sd + 'LowerArm', 0.14); limb(sd + 'LowerArm', sd + 'Hand', 0.06); }
    const seen = new Set(), v = new THREE.Vector3(), r = new THREE.Vector3(); vrm.scene.traverse(m => { if (!m.isSkinnedMesh || !m.geometry.attributes.skinIndex) return; const pos = m.geometry.attributes.position; if (seen.has(pos)) return; seen.add(pos);
      const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, inv = m.matrixWorld.clone().invert(), toW = m.matrixWorld, of = m.skeleton.bones.map(b => { let o = b; while (o && !human.has(o)) o = o.parent; return (o && tgt.get(o)) || null; }), skirtB = m.skeleton.bones.map(b => !human.has(b) && /skirt/i.test(b.name)), orig = Float32Array.from(pos.array), D = new Float32Array(pos.count * 3), F = new Float32Array(pos.count * 3); let any = false;
      for (let i = 0; i < pos.count; i++) { let dx = 0, dy = 0, dz = 0; v.fromBufferAttribute(pos, i).applyMatrix4(toW); for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w < 0.004) continue; const t = of[si.getComponent(i, k)]; if (!t) continue; r.copy(v).sub(t.a); r.addScaledVector(t.u, -r.dot(t.u)); dx += r.x * w * t.f; dy += r.y * w * t.f; dz += r.z * w * t.f; }
        if (dx || dy || dz) { any = true; r.set(dx, dy, dz).transformDirection(inv).multiplyScalar(Math.hypot(dx, dy, dz)); D[i * 3] = r.x; D[i * 3 + 1] = r.y; D[i * 3 + 2] = r.z; }
        /* how full a skirt is: its own vertices, pulled in toward her (or let out), more the further down the skirt they are */
        let ws = 0; for (let k = 0; k < 4; k++) if (skirtB[si.getComponent(i, k)]) ws += sw.getComponent(i, k); if (ws > 0.02 && hipsP) { const down = Math.max(0, Math.min(1, (hipsP.y - v.y) / 0.3)), fx2 = -(v.x - hipsP.x) * ws * down, fz2 = -(v.z - hipsP.z) * ws * down, l2 = Math.hypot(fx2, fz2); if (l2 > 1e-5) { any = true; r.set(fx2, 0, fz2).transformDirection(inv).multiplyScalar(l2); F[i * 3] = r.x; F[i * 3 + 1] = r.y; F[i * 3 + 2] = r.z; } } }
      if (any) build.parts.push({ pos, orig, D, F }); }); } catch (e) { console.warn('build', e); }
function setBuild(pct, slim) { if (window.WIZRA_BUILD != null) pct = window.WIZRA_BUILD;   /* test hook: hold one value */ if (window.WIZRA_SLIM != null) slim = window.WIZRA_SLIM; const b = Math.max(-60, Math.min(250, +pct || 0)) / 100, f = slim === undefined ? build.f : Math.max(-50, Math.min(80, +slim || 0)) / 100; if (b === build.v && f === build.f) return; build.v = b; build.f = f; for (const { pos, orig, D, F } of build.parts) { const a = pos.array; for (let i = 0; i < a.length; i++) a[i] = orig[i] + D[i] * b + F[i] * f; pos.needsUpdate = true; } }
  if (window.WIZRA_BUILD != null) setBuild(window.WIZRA_BUILD);
  // Her skirt and coat tails as real cloth (bonecloth.js): one weighted sheet that rests on her legs and the seat, instead of
  // the model's own separate springy strips. Hair stays with the spring bone code. Its reset follows the spring bones' reset.
  // 3D glasses (VITURE and other side-by-side displays): the scene is drawn twice, once for each eye, left and right halves of the
  // picture. 'full' = each half keeps its true shape (the glasses show a 32:9 picture); 'half' = each half is squeezed to half
  // width (the glasses stretch a normal 16:9 picture). The two eyes meet at her distance, so she sits at the depth of the screen
  // and the room goes back behind her. head(yaw, pitch, roll) turns the view on top of whatever camera is in charge: that is
  // where a head tracker plugs in (see VITURE.md).
  const sbs = { mode: '', eye: 0.064, head: new THREE.Euler(0, 0, 0, 'YXZ'), headOn: false, rig: new THREE.StereoCamera(), q: new THREE.Quaternion(), keep: new THREE.Quaternion(), v2: new THREE.Vector2(), hv: new THREE.Vector3() };
  function renderView() { if (!sbs.mode) { renderer.render(scene, camera); return; }
    const sz = renderer.getSize(sbs.v2), W = sz.x, H = sz.y, half = W / 2; sbs.keep.copy(camera.quaternion); if (sbs.headOn) { camera.quaternion.multiply(sbs.q.setFromEuler(sbs.head)); }
    let focus = 1.6; try { head.getWorldPosition(sbs.hv); focus = Math.max(0.45, Math.min(5, sbs.hv.distanceTo(camera.position))); } catch {}
    camera.aspect = W / H; camera.focus = focus; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); sbs.rig.aspect = sbs.mode === 'full' ? 0.5 : 1; sbs.rig.eyeSep = sbs.eye * Math.min(1, focus / 0.9); sbs.rig.update(camera);   /* very close up the eyes are brought together a little, or it is hard to look at */
    renderer.setScissorTest(true); renderer.setViewport(0, 0, half, H); renderer.setScissor(0, 0, half, H); renderer.render(scene, sbs.rig.cameraL); renderer.setViewport(half, 0, half, H); renderer.setScissor(half, 0, half, H); renderer.render(scene, sbs.rig.cameraR);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); camera.quaternion.copy(sbs.keep); }
  // Works of art in a room (the 'artwork' prop): which one you have walked up to and are facing. After a moment in front of one, the page is told
  // (it shows the label and lets her know); walking off tells it null.
  const artW = { cb: null, key: '', list: [], cur: null, since: 0, told: null, next: 0, v: new THREE.Vector3(), f: new THREE.Vector3() };
  function artLook(t) { if (!artW.cb || t < artW.next) return; artW.next = t + 300; if (!fp.on) { if (artW.told) { artW.told = null; artW.cb(null); } return; } const g = places.groups[here]; if (!g) return; const key = here + g.children.length;
    if (key !== artW.key) { artW.key = key; artW.list = []; g.traverse(o => { if (o.userData && o.userData.item && o.userData.item.kind === 'artwork' && o.userData.item.img) artW.list.push(o); }); }
    camera.getWorldDirection(artW.f); let best = null, bd = 9; for (const o of artW.list) { o.getWorldPosition(artW.v); artW.v.y += (o.userData.item.stand ? 1.3 : (+o.userData.item.ah || 0.7) / 2); artW.v.sub(camera.position); const d = artW.v.length(); if (d > 2.8) continue; if (artW.v.normalize().dot(artW.f) < 0.86) continue; if (d < bd) { bd = d; best = o.userData.item; } }
    if (best !== artW.cur) { artW.cur = best; artW.since = t; } if (artW.cur !== artW.told && (t - artW.since > (artW.cur ? 900 : 1500))) { artW.told = artW.cur; artW.cb(artW.cur); } }
  // What the studio remembers. Where she was moved (slid, lifted, turned, or put where a sketch is) is kept as an offset from where the game has her and put
  // back every time she is allowed to move for a moment, and when the studio is opened again. A pose set by hand is kept when the studio is closed and
  // given back when it is opened again; choosing a ready-made pose, standing her up or sitting her down starts afresh.
  const phOffApply = () => { const o = ph.off; if (o.x || o.y || o.z) { vrm.scene.position.x += o.x; vrm.scene.position.y += o.y; vrm.scene.position.z += o.z; } if (o.ry) vrm.scene.rotation.y += o.ry; };
  const phTouched = () => { ph.dirty = true; };
  const phSave = () => { if (!ph.dirty) return; ph.snap = {}; for (const n of Object.keys(vrm.humanoid.humanBones)) { const b = B(n); if (b) ph.snap[n] = b.quaternion.toArray(); } };
  const phGiveBack = () => { if (!ph.snap) return; for (const n in ph.snap) { const b = B(n); if (b) b.quaternion.fromArray(ph.snap[n]); } ph.dirty = true; };
  const photoNudge_ = { q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(), q4: new THREE.Quaternion(), d: new THREE.Vector3(), up: new THREE.Vector3(), to: new THREE.Vector3(), ax: new THREE.Vector3(), j: new THREE.Vector3() };
  const ph = { on: false, liveUntil: 0, fov0: 0, off: { x: 0, y: 0, z: 0, ry: 0 }, snap: null, dirty: false, restore: false, c: { tx: 0, ty: 1.2, tz: 0, yaw: 0, pitch: 0.1, dist: 2.5, roll: 0, fov: 30 } }, PH_BONES = ['head', 'neck', 'chest', 'spine', 'hips', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot'],
    PH_LIMIT = { head: 0.9, neck: 0.6, chest: 0.6, spine: 0.7, hips: 3.2, Shoulder: 0.5, UpperArm: 2.6, LowerArm: 2.6, Hand: 1.3, UpperLeg: 2.2, LowerLeg: 2.5, Foot: 1 };
  const phMats = []; let phFadeNow = 1;
  function photoFade(k) { k = Math.round(k * 50) / 50; if (k === phFadeNow) return; phFadeNow = k; if (!phMats.length) vrm.scene.traverse(o => { if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && !phMats.some(e => e.m === m)) phMats.push({ m, t: m.transparent, o: m.opacity, d: m.depthWrite }); });
    vrm.scene.visible = k > 0.02; for (const e of phMats) { if (k >= 1) { e.m.transparent = e.t; e.m.opacity = e.o; e.m.depthWrite = e.d; } else { e.m.transparent = true; e.m.opacity = e.o * k; e.m.depthWrite = k > 0.5 ? e.d : false; } e.m.needsUpdate = true; } }
  // a two-bone reach: turn the upper and lower bone of a limb so its end lands on a point (the bend stays in the plane it is already in)
  const ikv = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()), ikq = [0, 1, 2].map(() => new THREE.Quaternion());
  function ikTurn(bone, qW) { bone.parent.getWorldQuaternion(ikq[1]); bone.getWorldQuaternion(ikq[2]); bone.quaternion.copy(ikq[1].invert()).multiply(qW).multiply(ikq[2]); bone.updateWorldMatrix(false, true); }
  function ikReach(A, Bn, C, t) { const [a, b, c, u, w, ax] = ikv; A.updateWorldMatrix(true, true); A.getWorldPosition(a); Bn.getWorldPosition(b); C.getWorldPosition(c);
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c), d = Math.max(Math.abs(l1 - l2) + 0.02, Math.min(l1 + l2 - 0.004, a.distanceTo(t))); u.copy(a).sub(b); w.copy(c).sub(b); const phi = u.angleTo(w), theta = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
    ax.crossVectors(u, w); if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0).applyQuaternion(Bn.getWorldQuaternion(ikq[2])); ax.normalize(); ikTurn(Bn, ikq[0].setFromAxisAngle(ax, theta - phi)); C.getWorldPosition(c);
    ikTurn(A, ikq[0].setFromUnitVectors(u.copy(c).sub(a).normalize(), w.copy(t).sub(a).normalize())); }
  // Her arms on the arms of her chair: when that is how she is resting (and she is not gesturing, holding something or out of her chair),
  // each wrist is put on its armrest and the hand is laid flat on it, palm down, fingers forward. Eased in and out.
  const ar = { w: 0, t: new THREE.Vector3(), q: [0, 1, 2, 3, 4, 5].map(() => new THREE.Quaternion()), yq: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) };
  function armRest(s) { if (bh.on) { ar.w = 0; return; }   /* (not on the beach: there is no chair there) */
    const want = rt.arms === 'rest' && rt.act === 'sit' && rt.stand < 0.02 && here === 'dorm' && !s.gesture && !rt.carry && !hpose.on && !mv.on && !dn.on && (rt.lie || 0) < 0.02 ? 1 : 0; ar.w += (want - ar.w) * Math.min(1, (s.dt || 0.016) * 3); if (ar.w < 0.01) return; const k = ar.w * ar.w * (3 - 2 * ar.w);
    let i = 0; for (const [side, sx] of [['left', 1], ['right', -1]]) { const A = B(side + 'UpperArm'), E = B(side + 'LowerArm'), H = B(side + 'Hand'); if (!A || !E || !H) continue; const q0 = ar.q[i++].copy(A.quaternion), q1 = ar.q[i++].copy(E.quaternion), q2 = ar.q[i++].copy(H.quaternion);
      ar.t.set(sx * ARM_X, ARM_TOP + 0.035, hip.z + (sx < 0 ? 0.02 : 0.2)); ikReach(A, E, H, ar.t);   /* (her right hand sits a little further back: her mug stands at the front of that arm) */
      H.parent.getWorldQuaternion(ikq[1]); H.quaternion.copy(ikq[1].invert()).multiply(vrm.scene.getWorldQuaternion(ikq[2])).multiply(ar.yq.setFromAxisAngle(ar.up, -sx * Math.PI / 2));   /* a hand at rest in the T pose is palm down, fingers out to the side: turned a quarter, they point forward */
      if (k < 0.999) { const a1 = A.quaternion.clone(), e1 = E.quaternion.clone(), h1 = H.quaternion.clone(); A.quaternion.copy(q0).slerp(a1, k); E.quaternion.copy(q1).slerp(e1, k); H.quaternion.copy(q2).slerp(h1, k); } } }
  function photoCamApply() { const c = ph.c, cp = Math.cos(c.pitch); const cy = Math.max(floorY + 0.06, c.ty + Math.sin(c.pitch) * c.dist); let hy = floorY + 0.9; try { hy = B('hips').getWorldPosition(tmpB).y; } catch {}
    photoFade(1);   /* the camera goes anywhere and she stays solid (the fade below hip level was taken out at Andrew's request, 2026-11-24) */
    camera.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist, cy, c.tz + Math.cos(c.yaw) * cp * c.dist); camera.up.set(0, 1, 0); camera.lookAt(c.tx, c.ty, c.tz); if (c.roll) camera.rotateZ(c.roll); if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); } }
  let cloth = null; try { cloth = boneCloth(THREE, vrm); if (cloth && vrm.springBoneManager) { const man = vrm.springBoneManager, r0 = man.reset.bind(man); man.reset = () => { r0(); try { cloth.reset(); } catch {} }; } } catch (e) { console.warn('bone cloth', e); }
  const settleCloth = () => { if (!cloth) return; try { for (let i = 0; i < 90; i++) cloth.tick(1 / 60, build.v, surfAt); vrm.scene.updateMatrixWorld(true); } catch {} };   /* a picture is one frozen moment: let the cloth fall into place for it first, so skirts and coats are drawn draped and not in their stiff rest shape */
  // What cloth can come to rest on: the tops of the furniture in the room she is in (seats, armrests, tables, beds, cushions), as a
  // map of heights. It is measured by looking straight down on a 6 cm grid, a few rows a frame, the first time a room is shown.
  const surf = { key: '', x0: 0, z0: 0, nx: 0, nz: 0, cell: 0.06, h: null, row: 0, ray: new THREE.Raycaster(), from: new THREE.Vector3(), down: new THREE.Vector3(0, -1, 0), list: [] };
  const surfAt = (x, z) => { if (!surf.h) return -1e9; const i = Math.floor((x - surf.x0) / surf.cell), j = Math.floor((z - surf.z0) / surf.cell); return i < 0 || j < 0 || i >= surf.nx || j >= surf.nz ? -1e9 : surf.h[j * surf.nx + i]; };
  function surfTick() { let B = null; try { B = places.bounds[here]; } catch {} if (!B) return; const key = here + '|' + (places.groups[here] ? places.groups[here].children.length : 0) + '|' + (room.visible ? room.children.length : 0);
    if (key !== surf.key) { surf.key = key; surf.x0 = B.x0; surf.z0 = B.z0; surf.nx = Math.ceil((B.x1 - B.x0) / surf.cell); surf.nz = Math.ceil((B.z1 - B.z0) / surf.cell); if (surf.nx * surf.nz > 40000) { surf.h = null; return; } surf.h = new Float32Array(surf.nx * surf.nz).fill(-1e9); surf.row = 0; surf.list = [];
      for (const g of [room, places.groups[here]]) if (g && g.visible) g.traverse(o => { if (o.isMesh && o.visible && !o.isSkinnedMesh && !(o.material && o.material.transparent && o.material.depthWrite === false) && !(o.material && o.material.blending === THREE.AdditiveBlending)) surf.list.push(o); }); }
    if (!surf.h || surf.row >= surf.nz) return; surf.ray.far = 1.4;
    for (let n = 0; n < 4 && surf.row < surf.nz; n++, surf.row++) for (let i = 0; i < surf.nx; i++) { surf.from.set(surf.x0 + (i + 0.5) * surf.cell, floorY + 1.3, surf.z0 + (surf.row + 0.5) * surf.cell); surf.ray.set(surf.from, surf.down); const hit = surf.ray.intersectObjects(surf.list, false)[0]; if (hit && hit.point.y > floorY + 0.06) surf.h[surf.row * surf.nx + i] = hit.point.y; } }   /* (the floor itself and rugs are left to the floor rule) */
  const clothTick = dt => { if (cloth) { try { surfTick(); cloth.tick(dt, build.v, surfAt); } catch (e) { console.warn('bone cloth', e); cloth = null; } } };
  // Her mouth: this model's inside-of-the-mouth picture is plain grey (teeth, a grey cavity, a grey tongue), which shows as a grey
  // mouth whenever she smiles wide or talks. Repaint it as it is drawn here: dark red inside, a pink tongue, the teeth left white.
  // (Only the picture used on screen changes; her model file is untouched.)
  try {
    const seen = new Set();
    vrm.scene.traverse(o => { for (const m of [].concat(o.material || [])) {
      if (!m || seen.has(m) || !/FaceMouth/i.test(m.name || '') || !m.map || !m.map.image) continue; seen.add(m);
      const img = m.map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), px = d.data, IN = [112, 30, 48], TONGUE = [236, 120, 142];
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gg = px[i + 1], b = px[i + 2], L = (r + gg + b) / 765; if (Math.max(r, gg, b) - Math.min(r, gg, b) > 24 || L > 0.72) continue;        // only the greys; the teeth stay
        let k = (L - 0.39) / 0.09; k = Math.max(0, Math.min(1, k)); k = k * k * (3 - 2 * k);                                                                   // cavity -> tongue
        px[i] = IN[0] + (TONGUE[0] - IN[0]) * k; px[i + 1] = IN[1] + (TONGUE[1] - IN[1]) * k; px[i + 2] = IN[2] + (TONGUE[2] - IN[2]) * k;
      }
      g.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c); t.colorSpace = m.map.colorSpace; t.flipY = m.map.flipY; t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT; t.offset.copy(m.map.offset); t.repeat.copy(m.map.repeat); t.needsUpdate = true;
      m.map = t; if ('shadeMultiplyTexture' in m) m.shadeMultiplyTexture = t; if (m.shadeColorFactor) m.shadeColorFactor.setRGB(0.75, 0.45, 0.52); m.needsUpdate = true;
    } });
  } catch (e) { console.warn('mouth repaint', e); }

  const B = n => vrm.humanoid.getNormalizedBoneNode(n);
  const head = B('head'), neck = B('neck'), chest = B('upperChest') || B('chest');
  // ---- the pose: leaning back in an armchair, legs out, feet up on a low table ----
  const set = (n, x = 0, y = 0, z = 0) => { const bone = B(n); if (bone) bone.rotation.set(x, y, z); };
  const POSE = window.WIZRA_POSE || {
    hips: [-0.32, 0, 0], spine: [0.14, 0, 0], chest: [0.1, 0, 0], neck: [0.08, 0, 0],
    leftUpperLeg: [-1.4, 0, 0.07], rightUpperLeg: [-1.36, 0, -0.07], leftLowerLeg: [0.62, 0, 0], rightLowerLeg: [0.58, 0, 0], leftFoot: [0.2, 0, 0], rightFoot: [0.2, 0, 0],
    leftUpperArm: [0.18, 0, -1.12], rightUpperArm: [0.18, 0, 1.12], leftLowerArm: [0, -0.45, 0], rightLowerArm: [0, 0.45, 0], leftHand: [0, 0, -0.1], rightHand: [0, 0, 0.1],
  };
  for (const side of ['left', 'right']) for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (const j of ['Proximal', 'Intermediate', 'Distal'])
    if (!POSE[side + f + j]) POSE[side + f + j] = [0, 0, (side === 'left' ? -1 : 1) * (j === 'Proximal' ? 0.3 : 0.38)]; // loosely curled fingers
  // Her routine blends between whole-body poses: SIT (above), STAND, and what she is busy with laid over the top.
  // sitting upright on the edge of the seat, feet on the floor: the halfway pose for getting up and sitting down
  const SITUP = { hips: [0.06, 0, 0], spine: [0.1, 0, 0], chest: [0.04, 0, 0], neck: [0, 0, 0], leftUpperLeg: [-1.5, 0, 0.04], rightUpperLeg: [-1.5, 0, -0.04], leftLowerLeg: [1.5, 0, 0], rightLowerLeg: [1.5, 0, 0], leftFoot: [0, 0, 0], rightFoot: [0, 0, 0] };
  const STAND = { leftUpperArm: [0, 0, -1.3], rightUpperArm: [0, 0, 1.3], leftLowerArm: [0, -0.15, 0], rightLowerArm: [0, 0.15, 0] };
  // fingers closed round something in her right hand: c how far the fingers curl, th how far the thumb comes in
  const grip = (c, th) => { const o = {}; for (const f of ['Index', 'Middle', 'Ring', 'Little']) { o['right' + f + 'Proximal'] = [0, 0, c * 1.4]; o['right' + f + 'Intermediate'] = [0, 0, c * 1.65]; o['right' + f + 'Distal'] = [0, 0, c * 1.1]; } o.rightThumbMetacarpal = [0, -0.9 * th, 0]; o.rightThumbProximal = [0, -0.65 * th, 0]; return o; };
  const GRIP_MUG = grip(0.5, 0.25);
  const OVER = window.WIZRA_OVER || {
    read: { leftUpperArm: [-0.55, 0.25, -1.1], leftLowerArm: [0, -1.6, 0], rightUpperArm: [-0.55, -0.25, 1.1], rightLowerArm: [0, 1.6, 0] },
    phone: { rightUpperArm: [-0.45, 0.35, 1.25], rightLowerArm: [0, 1.8, 0], rightHand: [0, 0, 0.1], ...grip(0.28, 0.15) },   // in front of her chest, screen tipped up to her face
    sip: { rightUpperArm: [-0.7, 0.2, 1.2], rightLowerArm: [0, 2.5, 0], ...GRIP_MUG },
  };
  // where her arms rest while she is seated and her hands are free: she changes between these now and then
  const ARMS = window.WIZRA_ARMS || {
    rest: { leftUpperArm: [-0.1, 0.35, -1.0], leftLowerArm: [0, -1.25, 0], leftHand: [0, 0, 0], rightUpperArm: [-0.1, -0.35, 1.0], rightLowerArm: [0, 1.25, 0], rightHand: [0, 0, 0] },   /* forearms along the arms of her armchair (only used in her own chair: nowhere else has arms to rest on) */
    lap: { leftUpperArm: [-0.12, -0.3, -1.3], leftLowerArm: [0, -1.1, 0], leftHand: [0, 0, -0.15], rightUpperArm: [-0.12, 0.3, 1.3], rightLowerArm: [0, 1.1, 0], rightHand: [0, 0, 0.15] },
    folded: { leftUpperArm: [-0.12, -0.5, -1.3], leftLowerArm: [0, -1.2, 0], leftHand: [0, 0, -0.15], rightUpperArm: [-0.14, 0.5, 1.3], rightLowerArm: [0, 1.25, 0], rightHand: [0, 0, 0.15] },
    side: { leftUpperArm: [-0.12, -0.3, -1.3], leftLowerArm: [0, -1.1, 0], leftHand: [0, 0, -0.15], rightUpperArm: [0.12, 0, 1.22], rightLowerArm: [0, 0.5, 0], rightHand: [0, 0, 0.1] },
  };
  // how her legs rest while she is seated, laid over the pose above: ankles crossed on the table, or feet down on the floor
  const LEGS = window.WIZRA_LEGS || {
    crossed: { leftUpperLeg: [-1.36, 0.1, -0.1], leftLowerLeg: [0.62, 0, 0], rightUpperLeg: [-1.5, -0.12, 0.16], rightLowerLeg: [0.6, 0, 0], leftFoot: [0.2, 0.25, 0], rightFoot: [0.2, -0.25, 0] },
    floor: { _z: 0.17, hips: [-0.1, 0, 0], spine: [0.06, 0, 0], leftUpperLeg: [-1.36, 0, 0.06], rightUpperLeg: [-1.36, 0, -0.06], leftLowerLeg: [1.42, 0, 0], rightLowerLeg: [1.42, 0, 0], leftFoot: [0.02, 0, 0], rightFoot: [0.02, 0, 0] },
  };
  // whole-body ways of sitting taken from recorded poses (feet up on the seat): _clip is the pose, _y/_z nudge her onto the cushion
  const SEATED = window.WIZRA_SEATED || { hair: { _clip: 'female_sitting_pose_1', _y: 0.02, _z: 0.07 } };
  // sideways in the seat, back against one arm and her legs draped over the other (_yaw turns her, _x slides her across)
  if (!window.WIZRA_LEGS) LEGS.drape = window.WIZRA_DRAPE || { _yaw: 1.4, _x: 0.15, _z: 0.02, _y: 0.03, hips: [-0.5, 0, 0], spine: [0.2, 0, 0], chest: [0.14, 0, 0], leftUpperLeg: [-1.66, 0, 0.05], rightUpperLeg: [-1.6, 0, -0.05], leftLowerLeg: [1.95, 0, 0], rightLowerLeg: [2.05, 0, 0], leftFoot: [0.3, 0, 0], rightFoot: [0.3, 0, 0] };
  if (!window.WIZRA_LEGS) Object.assign(LEGS, SEATED);
  const ARM = /Arm|Hand|Shoulder|Thumb|Index|Middle|Ring|Little/;
  const FINGER = /Proximal|Intermediate|Distal/;
  const KEYS = [...new Set([...Object.keys(POSE), ...Object.keys(STAND), ...Object.values(OVER).flatMap(o => Object.keys(o))])];
  const standOf = n => STAND[n] || (FINGER.test(n) && POSE[n]) || [0, 0, 0], situpOf = n => SITUP[n] || POSE[n] || [0, 0, 0];
  const CUR = {}; for (const n of KEYS) CUR[n] = [...(POSE[n] || [0, 0, 0])];
  for (const n in POSE) set(n, ...POSE[n]);
  // ---- gestures: bone targets blended over the resting pose while one plays. t = seconds in, for the moving parts. ----
  // Bone names take absolute rotations. Special keys: _head [pitch, yaw, roll] added to her head, _hipY metres of bounce,
  // _face expression weights. P(n) is the resting rotation of a bone, for "rest plus a bit".
  const P = n => CUR[n] || [0, 0, 0], plus = (n, x = 0, y = 0, z = 0) => [P(n)[0] + x, P(n)[1] + y, P(n)[2] + z];
  const sin = Math.sin, abs = Math.abs;
  // ---- hand signs: her right hand comes up beside her face and makes a shape. hand() builds the fingers:
  // curls [index, middle, ring, little] 0 straight .. 1 fist; spread fans them; thumb 0 out .. 1 folded in; tw turns the wrist (1.5 = palm to you).
  const FN = ['Index', 'Middle', 'Ring', 'Little'];
  function hand(side, curls, o = {}) {
    const sd = side === 'right' ? 1 : -1, out = {};
    FN.forEach((f, i) => { const c = curls[i], sp = (o.spread ? o.spread[i] : 0) * sd; out[side + f + 'Proximal'] = [0, sp, sd * c * 1.4]; out[side + f + 'Intermediate'] = [0, 0, sd * c * 1.65]; out[side + f + 'Distal'] = [0, 0, sd * c * 1.1]; });
    const th = o.thumb || 0; out[side + 'ThumbMetacarpal'] = [0, -sd * 0.9 * th, 0]; out[side + 'ThumbProximal'] = [0, -sd * 0.65 * th, 0]; out[side + 'ThumbDistal'] = [0, -sd * 0.3 * th, 0];
    out._tw = o.tw || 0;                                                           // how far the palm turns to face you: done by the forearm, like a real arm, with only a little left for the wrist
    return out;
  }
  for (const n of ['leftLowerArm', 'rightLowerArm']) { const bn = B(n); if (bn) bn.rotation.order = 'ZYX'; }   // so a forearm can bend at the elbow and then roll about its own length
  const HAND_UP = { rightUpperArm: [0.9, 0, -0.3], rightLowerArm: [0, 0, -1.6] };
  const SIGN = {
    peace: hand('right', [0, 0, 1, 1], { spread: [0.16, -0.16, 0, 0], thumb: 1, tw: -1.5 }), oksign: hand('right', [0.62, 0.05, 0, 0], { spread: [0, 0, -0.1, -0.22], thumb: 0.6, tw: -1.5 }),
    fox: hand('right', [0, 0.58, 0.58, 0], { spread: [0.1, 0, 0, -0.1], thumb: 0.75, tw: -0.9 }), fingerheart: hand('right', [0.38, 1, 1, 1], { spread: [-0.2, 0, 0, 0], thumb: 0.35, tw: -1.5 }),
    crossed: hand('right', [0, 0.08, 1, 1], { spread: [-0.2, 0.24, 0, 0], thumb: 1, tw: -1.5 }), flipoff: hand('right', [1, 0, 1, 1], { thumb: 1, tw: -1.5 }),
  };
  const FIST = hand('right', [1, 1, 1, 1], { thumb: 1 });
  // The way it moves is the point: a small dip first, the arm swings up past its mark and settles, the fingers snap open one
  // after another a beat later, the wrist gives a little shake, and her head tips toward it.
  const pop = (t, speed = 9, ring = 15) => t <= 0 ? 0 : 1 - Math.exp(-speed * t) * Math.cos(ring * t);
  function sign(name, t, face) {
    const tgt = SIGN[name], out = {}, arm = (t < 0.09 ? -0.1 * Math.sin(Math.PI * t / 0.09) : pop(t - 0.09, 8, 13));
    for (const n in HAND_UP) { const r = P(n), q = HAND_UP[n]; out[n] = [r[0] + (q[0] - r[0]) * arm, r[1] + (q[1] - r[1]) * arm, r[2] + (q[2] - r[2]) * arm]; }
    const roll = tgt._tw * Math.min(1.06, pop(t - 0.12, 9, 11)), shake = 0.16 * Math.exp(-3.2 * Math.max(0, t - 0.3)) * Math.sin(22 * Math.max(0, t - 0.3));
    out.rightLowerArm[0] = roll * 0.72 + shake; out.rightHand = [roll * 0.2, 0, 0.08 * Math.sin(t * 2.4)];
    for (const n in tgt) {
      if (n[0] === '_') continue;
      const i = Math.max(0, FN.findIndex(f => n.includes(f))), open = pop(t - 0.2 - 0.045 * i, 13, 19), f = FIST[n] || [0, 0, 0], q = tgt[n];   // from a loose fist, finger by finger
      out[n] = [f[0] + (q[0] - f[0]) * open, f[1] + (q[1] - f[1]) * open, f[2] + (q[2] - f[2]) * open];
    }
    const lean = pop(t - 0.1, 7, 11); out.spine = plus('spine', -0.04 * lean, 0, -0.05 * lean); out._head = [-0.03 * lean, -0.1 * lean, -0.2 * lean + 0.03 * Math.sin(t * 2.4)]; out._hipY = 0.012 * Math.exp(-5 * t) * Math.abs(Math.sin(14 * t));
    out._face = face; return out;
  }
  const GESTURE = {
    /* these four have recorded clips (STAND_G, SEAT_G); until one is loaded they borrow a hand-made gesture */
    thumbsup: t => GESTURE.peace(t), point: t => GESTURE.fingerwave(t), rubarm: t => GESTURE.shift(t), whisper: t => GESTURE.lean(t),
    peace: t => sign('peace', t, { happy: 0.3, relaxed: 0.5 }), oksign: t => sign('oksign', t, { happy: 0.25, relaxed: 0.4 }), fox: t => sign('fox', t, { happy: 0.3, relaxed: 0.4 }), fingerheart: t => sign('fingerheart', t, { happy: 0.35, relaxed: 0.5 }),
    crossed: t => sign('crossed', t, { relaxed: 0.4 }), flipoff: t => sign('flipoff', t, { angry: 0.4 }),
    fingerwave: t => { const o = sign('peace', t, { happy: 0.3, relaxed: 0.4 }); FN.forEach((f, i) => { const c = 0.32 + 0.32 * Math.sin(t * 9 - i * 0.9); o['right' + f + 'Proximal'] = [0, (0.14 - i * 0.1), c * 1.2]; o['right' + f + 'Intermediate'] = [0, 0, c * 0.9]; o['right' + f + 'Distal'] = [0, 0, c * 0.5]; }); o.rightThumbMetacarpal = [0, -0.2, 0]; o.rightThumbProximal = [0, 0, 0]; return o; },
    wave: t => ({ rightUpperArm: [0, 0, -0.7], rightLowerArm: [0, 0, -0.95 + 0.42 * sin(t * 9)], rightHand: [0, 0, -0.1], _head: [0, 0, 0.08] }),
    shrug: () => ({ leftShoulder: [0, 0, 0.38], rightShoulder: [0, 0, -0.38], leftUpperArm: [0.18, 0, -1.2], rightUpperArm: [0.18, 0, 1.2], leftLowerArm: [0, -0.75, 0], rightLowerArm: [0, 0.75, 0], leftHand: [0, 0, 0.5], rightHand: [0, 0, -0.5], _head: [0, 0, 0.12] }),
    lean: () => ({ spine: plus('spine', 0.16), _head: [0.05, 0, 0] }),
    bow: t => ({ spine: plus('spine', 0.3), _head: [0.3, 0, 0], _face: { blink: 1 } }),
    slump: () => ({ spine: plus('spine', 0.16), leftShoulder: [0, 0, -0.1], rightShoulder: [0, 0, 0.1], _head: [0.35, 0, 0.08] }),
    situp: () => ({ hips: plus('hips', 0.2), spine: plus('spine', -0.08), _head: [-0.05, 0, 0] }),
    leanback: () => ({ hips: plus('hips', -0.1), spine: plus('spine', -0.1), _head: [-0.12, 0, 0] }),
    feet: t => ({ leftFoot: [0.25 + 0.38 * sin(t * 7), 0, 0], rightFoot: [0.25 + 0.38 * sin(t * 7 + 2), 0, 0] }),
    shift: t => ({ hips: plus('hips', 0, 0, 0.07 * sin(t * 2.2)), spine: plus('spine', 0, 0, -0.05 * sin(t * 2.2)) }),
    nod: t => ({ _head: [0.22 * sin(t * 10), 0, 0] }),
    shake: t => ({ _head: [0, 0.32 * sin(t * 9), 0] }),
    tilt: () => ({ _head: [0, 0, 0.3] }),
    headbang: t => ({ _head: [0.32 * abs(sin(t * 8)), 0, 0], spine: plus('spine', 0.08 * abs(sin(t * 8))) }),
    flip: t => ({ _head: [-0.1, 0.5 * sin(Math.min(t, 1.2) * 5.2), 0.15 * sin(t * 5.2)] }),
    lookaway: () => ({ _head: [0.05, 0.55, 0.05], _face: { relaxed: 0.2 } }),
    lookdown: () => ({ _head: [0.38, 0, 0] }),
    lookup: () => ({ _head: [-0.3, 0.1, 0] }),
    laugh: t => ({ leftShoulder: [0, 0, 0.14 * abs(sin(t * 13))], rightShoulder: [0, 0, -0.14 * abs(sin(t * 13))], spine: plus('spine', -0.06 + 0.03 * sin(t * 13)), _head: [-0.16 + 0.05 * sin(t * 13), 0, 0.05], _face: { happy: 1 } }),
    sigh: t => ({ leftShoulder: [0, 0, 0.16 * sin(Math.min(t, 1.6) * 2)], rightShoulder: [0, 0, -0.16 * sin(Math.min(t, 1.6) * 2)], spine: plus('spine', 0.07 * sin(Math.min(t, 1.6) * 2)), _head: [0.12, 0, 0] }),
    bounce: t => ({ _hipY: 0.018 * abs(sin(t * 9)), leftShoulder: [0, 0, 0.1], rightShoulder: [0, 0, -0.1], _face: { happy: 0.8 } }),
    dance: t => ({ spine: plus('spine', 0, 0, 0.12 * sin(t * 5)), leftUpperArm: [-0.5, 0, -0.95], rightUpperArm: [-0.5, 0, 0.95], leftLowerArm: [0, -1.3 + 0.25 * sin(t * 10), 0], rightLowerArm: [0, 1.3 + 0.25 * sin(t * 10 + 3.14), 0], _head: [0.06 * sin(t * 10), 0, 0.12 * sin(t * 5)], _hipY: 0.01 * abs(sin(t * 5)), _face: { happy: 0.6 } }),
    cringe: () => ({ leftShoulder: [0, 0, 0.3], rightShoulder: [0, 0, -0.3], spine: plus('spine', -0.08), _head: [0.1, 0.3, 0.12], _face: { blink: 0.7, sad: 0.4 } }),
    kiss: () => ({ spine: plus('spine', 0.14), _head: [0.06, 0, 0.12], _face: { blink: 1, relaxed: 0.3 } }),
    jump: t => ({ _hipY: 0.03 * abs(sin(t * 6)), leftShoulder: [0, 0, 0.12], rightShoulder: [0, 0, -0.12], _face: { happy: 0.9 } }),
    // _eyes: [right, up] pulls her gaze off you (her eyes only turn a little, so the head carries the rest of the look)
    eyeroll: t => { const a = Math.min(1, t / 1.5) * Math.PI; return { _eyes: [-2.6 * Math.cos(a), 3.2 * Math.sin(a) + 0.6], _head: [-0.2 * Math.sin(a), 0.22 * Math.cos(a), 0.1 * Math.sin(a)], _face: { blink: 0.28, relaxed: 0.3 } }; },
    chuckle: t => ({ leftShoulder: [0, 0, 0.07 * abs(sin(t * 11))], rightShoulder: [0, 0, -0.07 * abs(sin(t * 11))], spine: plus('spine', 0.05 + 0.015 * sin(t * 11)), _head: [0.12 + 0.03 * sin(t * 11), 0.1, 0.06], _face: { happy: 0.75, blink: 0.55 } }),
    yawn: t => ({ rightUpperArm: [-0.75, 0.25, 1.15], rightLowerArm: [0, 2.45, 0], rightHand: [0, 0, 0.25], leftUpperArm: [0, 0, 1.2], leftLowerArm: [0, -0.6, 0], spine: plus('spine', -0.14 + 0.02 * sin(t * 1.6)), _head: [-0.24, 0, 0.08], _face: { aa: 0.95, blink: 1 } }),
    stretch: t => ({ leftUpperArm: [0, 0, 1.42], rightUpperArm: [0, 0, -1.42], leftLowerArm: [0, -0.35, 0], rightLowerArm: [0, 0.35, 0], leftHand: [0, 0, 0.3], rightHand: [0, 0, -0.3], spine: plus('spine', -0.2, 0, 0.1 * sin(t * 1.3)), _head: [-0.2, 0, 0.06 * sin(t * 1.3)], _face: { blink: 1, relaxed: 0.5 } }),
    clap: t => { const c = 0.16 * (0.5 + 0.5 * sin(t * 16)); return { leftUpperArm: [-0.32, -0.3, -1.15], rightUpperArm: [-0.32, 0.3, 1.15], leftLowerArm: [0, -1.85 + c, 0], rightLowerArm: [0, 1.85 - c, 0], leftHand: [0, 0, 0.1], rightHand: [0, 0, -0.1], _head: [0.03 * sin(t * 8), 0, 0.05], _face: { happy: 0.9 } }; },
    facepalm: () => ({ rightUpperArm: [-0.95, 0.2, 1.15], rightLowerArm: [0, 2.5, 0], rightHand: [0, 0, 0.2], spine: plus('spine', 0.08), _head: [0.3, -0.12, 0], _face: { blink: 1, sad: 0.2 } }),
    think: t => ({ rightUpperArm: [-0.6, 0.2, 1.2], rightLowerArm: [0, 2.4, 0], rightHand: [0, 0, 0.1], leftUpperArm: [-0.2, 0.5, -1.25], leftLowerArm: [0, -1.5, 0], _eyes: [1.4, 1.8], _head: [-0.06, -0.14, 0.14], _face: { relaxed: 0.2 } }),
    crossarms: () => ({ leftUpperArm: [-0.08, -0.5, -1.25], rightUpperArm: [-0.16, 0.5, 1.25], leftLowerArm: [0, -1.8, 0], rightLowerArm: [0, 1.62, 0], leftHand: [0, 0, 0.2], rightHand: [0, 0, -0.2], leftShoulder: [0, 0, 0.08], rightShoulder: [0, 0, -0.08], _head: [0, 0, 0.08] }),
    hips: () => ({ leftUpperArm: [0.25, 0, -0.85], rightUpperArm: [0.25, 0, 0.85], leftLowerArm: [0, -1.5, 0], rightLowerArm: [0, 1.5, 0], leftHand: [0, 0, -0.5], rightHand: [0, 0, 0.5], _head: [0, 0, 0.08] }),
    cheer: t => ({ leftUpperArm: [0, 0, 1.1 + 0.1 * sin(t * 9)], rightUpperArm: [0, 0, -1.1 - 0.1 * sin(t * 9)], leftLowerArm: [0, -0.5, 0], rightLowerArm: [0, 0.5, 0], _hipY: 0.012 * abs(sin(t * 9)), _head: [-0.1, 0, 0], _face: { happy: 1 } }),
    tongue: t => ({ _tongue: [1, -0.25, 0.4 * Math.sin(t * 9) * Math.exp(-t * 0.8)], _head: [-0.06, 0.12, 0.16], _face: { happy: 0.55, blink: 0.75 } }),   /* bleh: eyes squeezed, tongue out with a wiggle */
    hug: () => ({ rightUpperArm: [0.2, 1.1, 0.3], leftUpperArm: [0.2, -1.1, -0.3], rightLowerArm: [0, 0.5, 0], leftLowerArm: [0, -0.5, 0], _head: [0.12, 0, 0.16], _face: { happy: 0.9 } }),   /* arms out and round you */
    smooch: () => ({ rightUpperArm: [0.2, 1.0, 0.45], leftUpperArm: [0.2, -1.0, -0.45], rightLowerArm: [0, 0.7, 0], leftLowerArm: [0, -0.7, 0], spine: plus('spine', 0.1), _head: [0.02, 0, 0.1], _face: { blink: 1, ou: 0.75 } }),
    pout: () => ({ leftShoulder: [0, 0, 0.12], rightShoulder: [0, 0, -0.12], _eyes: [2.2, -0.6], _head: [0.1, 0.3, -0.1], _face: { sad: 0.45, angry: 0.25, ou: 0.5 } }),
    handsup: t => ({ leftUpperArm: [0, 0, 1.38], rightUpperArm: [0, 0, -1.38], leftLowerArm: [0, -0.2, 0], rightLowerArm: [0, 0.2, 0], leftHand: [0, 0, 0.2], rightHand: [0, 0, -0.2], spine: plus('spine', -0.06), _head: [-0.05, 0, 0], _face: { surprised: 0.8 } }),
    eep: t => { const j = Math.exp(-t * 1.6); return { leftUpperArm: [-0.4, -0.35, -1.2], rightUpperArm: [-0.4, 0.35, 1.2], leftLowerArm: [0, -2.2, 0], rightLowerArm: [0, 2.2, 0], leftShoulder: [0, 0, 0.3], rightShoulder: [0, 0, -0.3], spine: plus('spine', -0.12 - 0.08 * j), _hipY: 0.03 * j * abs(sin(t * 14)), _head: [-0.08, 0.25 * sin(t * 6) * j, 0.06], _eyes: [1.5 * sin(t * 5), 0], _face: { surprised: 1 } }; },
    ahh: t => ({ _head: [-0.2, 0, 0], _face: { aa: 1, happy: 0.3 } }),                                              // mouth open, waiting for the snack
    chew: t => ({ _head: [0.05 + 0.03 * sin(t * 11), 0, 0.04], _face: { aa: 0.18 + 0.18 * abs(sin(t * 11)), happy: 0.9, blink: 0.4 } }),
    blocked: t => ({ leftUpperArm: [-0.08, -0.5, -1.25], rightUpperArm: [-0.16, 0.5, 1.25], leftLowerArm: [0, -1.8, 0], rightLowerArm: [0, 1.62, 0], spine: plus('spine', -0.06), _head: [0.02, 0.22, -0.06], _face: { angry: 0.7 } }),   // arms across herself: not there
    petted: t => ({ leftShoulder: [0, 0, -0.06], rightShoulder: [0, 0, 0.06], _head: [0.1, 0, 0.1 * sin(t * 1.6)], _face: { relaxed: 0.85, happy: 0.15 } }),   /* eyes closed in a soft smile: her relaxed face does that by itself */
    test: () => window.WIZRA_GEST || {},                                           // test hook: try a pose from the console
    jolt: t => ({ spine: plus('spine', -0.14 * Math.exp(-t * 2.5)), leftShoulder: [0, 0, 0.25 * Math.exp(-t * 2.5)], rightShoulder: [0, 0, -0.25 * Math.exp(-t * 2.5)], _head: [-0.12 * Math.exp(-t * 2.5), 0, 0] }),
  };
  const REST = n => CUR[n] || [0, 0, 0];
  const WIDE = { peace: 0.24, oksign: 0.24, fox: 0.24, fingerheart: 0.24, crossed: 0.24, flipoff: 0.24, fingerwave: 0.24, wave: 0.3, hi: 0.25, shrug: 0.25, stretch: 0.34, yawn: 0.3, clap: 0.2, handsup: 0.34, eep: 0.2, facepalm: 0.15, think: 0.15, crossarms: 0.15, hips: 0.2, cheer: 0.34, point: 0.32, lean: 0.3, bow: 0.3, dance: 0.4, feet: 0.95, shift: 0.1, laugh: 0.12, bounce: 0.15, slump: 0.12, situp: 0.2, leanback: 0.2, cringe: 0.15 }; // how far the camera backs off so you can see it
  let touchedBones = [], gestureZoom = 0;
  const gx = { head: [0, 0, 0], hipY: 0, face: null, k: 0, eyes: [0, 0], tongue: [0, 0, 0] };
  const hipsNode = B('hips'), hipY0 = hipsNode ? hipsNode.position.y : 0;
  // Her mood also sits in her body, not just her face: [spine lean, head pitch, head yaw, head roll, shoulders up]
  const BODY = { tipsy: [0.02, 0.03, 0, 0.1, 0], high: [-0.05, -0.05, 0, 0.1, -0.05], sad: [0.1, 0.22, 0, 0.05, -0.06], grumpy: [-0.04, 0.08, 0.3, 0, 0.05], tired: [0.06, 0.2, 0, 0.14, -0.08], excited: [0.1, -0.06, 0, 0, 0.08], joy: [-0.03, -0.1, 0, 0.05, 0.06],
    surprised: [-0.1, -0.08, 0, 0, 0.18], angry: [0.12, 0.12, 0, 0, 0.1], blush: [0, 0.14, 0.36, 0.08, 0.16], thinking: [-0.03, -0.12, 0.2, 0.14, 0], suspicious: [0.04, 0.06, 0.22, -0.1, 0],
    anxious: [0.03, 0.08, 0, 0.04, 0.2], chill: [-0.06, -0.04, 0, 0.06, -0.04], playful: [0.05, 0, 0, 0.12, 0.03], eyeroll: [-0.03, -0.14, 0.15, 0.08, 0], flinch: [-0.1, 0.05, 0, 0, 0.3], dizzy: [0, 0.1, 0, 0.2, 0], focused: [0.1, 0.06, 0, 0, 0], happy: [0.02, -0.04, 0, 0.04, 0.03] };
  const body = [0, 0, 0, 0, 0];
  function applyGesture(g, faceName, dt) {
    for (const n of touchedBones) if (!CUR[n]) set(n, 0, 0, 0); touchedBones = []; gestureZoom = 0; gx.head = [0, 0, 0]; gx.hipY = 0; gx.face = null; gx.k = 0; gx.eyes[0] = gx.eyes[1] = 0; gx.tongue[0] = gx.tongue[1] = gx.tongue[2] = 0;
    const want = BODY[faceName] || [0, 0, 0, 0, 0]; for (let i = 0; i < 5; i++) body[i] += (want[i] - body[i]) * Math.min(1, dt * 5);
    // a recorded gesture, when there is one for how she is right now (on her feet, or sitting): it runs for its own length, not the hand-made one's
    const nowS = performance.now() / 1000, up = rt.k > 0.9, sat = rt.k < 0.05 && !(rt.lie > 0.05) && rt.act !== 'gone';
    if (g && GESTURE[g.name] && (g.name !== clipG.gname || g.t < clipG.gt)) { clipG.gname = g.name; clipG.used = ''; const list = ((up ? STAND_G : sat ? SEAT_G : {})[g.name] || []).filter(haveClip), pick = list.length ? list[Math.floor(Math.random() * list.length)] : '';
      if (pick) Object.assign(clipG, { clip: pick, t0: nowS, seat: !up, dur: Math.max(0.5, Math.min(CLIPS[pick].dur - 0.05, CLIP_CAP[g.name] || 9)), used: g.name }); }
    if (g) clipG.gt = g.t; else { clipG.gname = ''; clipG.gt = -1; }
    if (clipG.clip) { const t = nowS - clipG.t0; if (t >= clipG.dur || !CLIPS[clipG.clip] || (clipG.seat ? !sat : !up)) clipG.clip = ''; else { const w = Math.max(0, Math.min(1, t / 0.35, (clipG.dur - t) / 0.45)), arms = clipG.seat ? Math.min(1, Math.max(rt.ov.read, rt.ov.phone, rt.ov.sip) * 1.5) : 0;
        playClip(clipG.clip, w * w * (3 - 2 * w), t, clipG.seat ? n => SEAT_HOLD.test(n) ? 1 : arms && ARM.test(n) ? arms : 0 : null); return; } }
    if (!g || !GESTURE[g.name] || clipG.used === g.name) return;   /* (the recorded one has played: the hand-made one is not added after it) */
    const tg = GESTURE[g.name](g.t), k0 = g.w * g.w * (3 - 2 * g.w), k = k0 * (1 + 0.13 * Math.exp(-5 * g.t) * Math.sin(17 * g.t)); gx.k = k0; // every gesture arrives a little past its mark and settles
    for (const n in tg) {
      const q = tg[n];
      if (n === '_head') gx.head = [q[0] * k, q[1] * k, q[2] * k]; else if (n === '_hipY') gx.hipY = q * k; else if (n === '_face') gx.face = q; else if (n === '_eyes') { gx.eyes[0] = q[0] * k; gx.eyes[1] = q[1] * k; } else if (n === '_tongue') { gx.tongue[0] = q[0] * k0; gx.tongue[1] = q[1]; gx.tongue[2] = q[2]; }
      else { const r = REST(n); set(n, r[0] + (q[0] - r[0]) * k, r[1] + (q[1] - r[1]) * k, r[2] + (q[2] - r[2]) * k); touchedBones.push(n); }
    }
    gestureZoom = (WIDE[g.name] || 0) * k;
  }
  // ---- motion clips: recorded animation (walk, idle, talking...) laid over the posed skeleton. Loaded from the server if
  // there are any; without them everything falls back to the hand-made motion. A clip is { dur, fps, n, bones: { name: [x,y,z,w per frame] }, hips }.
  const snd = n => window.dispatchEvent(new CustomEvent('wizra-sound', { detail: n }));   // sound.js listens for these
  const CLIPS = {}; fetch('/api/anims').then(r => r.ok ? r.json() : null).then(d => { if (d && d.clips) Object.assign(CLIPS, d.clips); }).catch(() => {});
  // The bigger library (/api/clips): recorded gestures, fetched one at a time. haveClip(name) says whether one is ready and, if it is in the
  // library but not here yet, sends for it, so the first time a gesture is wanted she does it the hand-made way and the recorded one is there next time.
  // The ones gestures use are brought in quietly a little after the page opens.
  const LIB = { names: {}, asked: {} };
  const haveClip = name => { if (CLIPS[name]) return true; if (LIB.names[name] && !LIB.asked[name]) { LIB.asked[name] = 1; fetch('/api/clips/' + name).then(r => r.ok ? r.json() : null).then(c => { if (c && c.bones) CLIPS[name] = c; }).catch(() => {}); } return false; };
  // which recorded clip a gesture uses, on her feet and sitting down (sitting: only from the waist up, her legs and seat stay as they are)
  const STAND_G = { kiss: ['kiss'], jump: ['jump'], laugh: ['laughing'], yawn: ['yawn'], stretch: ['arm_stretching', 'neck_stretching'], clap: ['standing_clap'], cheer: ['standing_cheering'], think: ['thinking'], nod: ['hard_head_nod'], shake: ['shaking_head_no', 'annoyed_head_shake', 'thoughtful_head_shake'], sigh: ['disappointed'], bow: ['thankful'], thumbsup: ['standing_thumbs_up'], whisper: ['telling_a_secret'],
    dance: ['dancing', 'hip_hop_dancing', 'house_dancing', 'macarena_dance', 'northern_soul_dance', 'robot_hip_hop_dance', 'twist_dance', 'chicken_dance', 'thriller_part_2'] },
    SEAT_G = { laugh: ['sitting_laughing'], clap: ['sitting_clap'], cheer: ['cheering_while_sitting', 'sitting_victory'], thumbsup: ['sitting_thumbs_up'], point: ['sitting_and_pointing'], shake: ['sitting_disapproval'], yawn: ['yawn'], stretch: ['arm_stretching'], rubarm: ['sitting_rubbing_arm'] },
    CLIP_CAP = { dance: 12, laugh: 5, yawn: 6, stretch: 7, sigh: 4.2, whisper: 6, rubarm: 5, clap: 4.5 }, clipG = { gname: '', gt: -1, clip: '', t0: 0, dur: 0, seat: false, used: '' };
  fetch('/api/clips').then(r => r.ok ? r.json() : null).then(d => { if (!d || !d.clips) return; LIB.names = d.clips; const all = [...new Set([...Object.values(STAND_G), ...Object.values(SEAT_G)].flat())].filter(n => LIB.names[n]); let i = 0; const next = () => { if (i < all.length) { haveClip(all[i++]); setTimeout(next, 1500); } }; setTimeout(next, 12000); }).catch(() => {});
  const SEAT_HOLD = /Leg|Foot|Toes|^hips$/;
  // Poses made by hand, in the same shape as a recorded clip (one frame), so she can hold them on her feet: the yoga set.
  // leg: [bend at the hip (forward is negative), turn the knee out (her left is positive), lift sideways]; the rest are plain bone turns.
  { const E = new THREE.Euler(), qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const eul = ([x, y, z]) => { const q = new THREE.Quaternion().setFromEuler(E.set(x, y, z)); return [q.x, q.y, q.z, q.w]; }, leg = ([f, t, a]) => { const q = qz.setFromAxisAngle(Z, a).clone().multiply(qy.setFromAxisAngle(Y, t)).multiply(qx.setFromAxisAngle(X, f)); return [q.x, q.y, q.z, q.w]; };
    const pose = (hip, legs, rest) => { const bones = {}; for (const n in legs) bones[n] = leg(legs[n]); for (const n in rest) bones[n] = eul(rest[n]); return { dur: 1 / 30, fps: 30, n: 1, bones, hips: [0, hip, 0], made: true }; };
    const UP = { leftUpperArm: [0, 0, 1.42], rightUpperArm: [0, 0, -1.42], leftLowerArm: [0, -0.3, 0], rightLowerArm: [0, 0.3, 0], leftHand: [0, 0, 0.25], rightHand: [0, 0, -0.25] };
    Object.assign(CLIPS, window.WIZRA_YOGA || {
      yoga_tree: pose(1, { rightUpperLeg: [-1.0, -1.35, 0], leftUpperLeg: [0, 0, 0] }, { ...UP, rightLowerLeg: [2.3, 0, 0], rightFoot: [0.5, 0, 0], leftLowerLeg: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] }),
      yoga_warrior: pose(0.76, { leftUpperLeg: [-1.1, 1.5, 0], rightUpperLeg: [0, -0.3, -0.72] }, { leftLowerLeg: [1.1, 0, 0], leftFoot: [0, 0, 0], rightLowerLeg: [0, 0, 0], rightFoot: [0, 0, 0.72], leftUpperArm: [0, 0, 0], rightUpperArm: [0, 0, 0], leftLowerArm: [0, 0, 0], rightLowerArm: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 1.1, 0] }),
      yoga_moon: pose(1, { leftUpperLeg: [0, 0, 0], rightUpperLeg: [0, 0, 0] }, { ...UP, leftLowerLeg: [0, 0, 0], rightLowerLeg: [0, 0, 0], spine: [0, 0, 0.22], chest: [0, 0, 0.2], head: [0, 0, 0.12] }),
      yoga_sit: pose(0.13, { leftUpperLeg: [-1.45, 0.08, 0], rightUpperLeg: [-1.45, -0.08, 0] }, { leftLowerLeg: [2.6, 0, 0], rightLowerLeg: [2.6, 0, 0], leftFoot: [0.6, 0, 0], rightFoot: [0.6, 0, 0], leftUpperArm: [-0.32, -0.3, -1.15], rightUpperArm: [-0.32, 0.3, 1.15], leftLowerArm: [0, -1.85, 0], rightLowerArm: [0, 1.85, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0.08, 0, 0] }),   // kneeling, sitting back on her heels, palms together
    });
    // A run made by hand for the beach: one stride cycle, built from sines. Big and loose, the kind that is shown in slow motion: knees come up high, the back
    // leg kicks up behind, the arms swing wide from the shoulder with soft elbows, the chest turns against the hips, the head is up, and she rises twice a cycle.
    // The beach plays it slowly. A recorded run in the clip library (slow_run, running, jogging) is used instead when there is one.
    { const N = 36, dur = 0.84, T = Math.PI * 2, bones = {}, hips = [], add = (n, q) => (bones[n] || (bones[n] = [])).push(...q), sm = x => x * x * (3 - 2 * x);
      for (let i = 0; i < N; i++) { const p = i / (N - 1), a = p * T, legOf = ph => { const sw = Math.sin(a + ph), fwd = Math.cos(a + ph);   /* sw > 0: this leg is swinging forward through the air */
          const thigh = -0.34 - 0.86 * Math.sin(a + ph + 0.35), knee = 0.22 + 1.5 * sm(Math.max(0, Math.min(1, 0.5 + 0.62 * Math.sin(a + ph + 1.9)))), foot = 0.35 * Math.max(0, -fwd) - 0.18 * Math.max(0, sw); return [thigh, knee, foot]; };
        const L = legOf(0), R = legOf(Math.PI), armL = 0.78 * Math.sin(a + 0.2), armR = -armL, twist = 0.2 * Math.sin(a), bob = 1 + 0.045 * Math.abs(Math.sin(a + 0.5)) - 0.02;
        add('leftUpperLeg', leg([L[0], 0.05, 0.03])); add('rightUpperLeg', leg([R[0], -0.05, -0.03])); add('leftLowerLeg', eul([L[1], 0, 0])); add('rightLowerLeg', eul([R[1], 0, 0])); add('leftFoot', eul([L[2], 0, 0])); add('rightFoot', eul([R[2], 0, 0]));
        add('hips', eul([0.1, -twist * 0.7, 0.05 * Math.sin(a)])); add('spine', eul([0.07, twist * 0.5, -0.03 * Math.sin(a)])); add('chest', eul([0.02, twist * 0.9, 0])); add('upperChest', eul([-0.04, twist * 0.5, 0])); add('neck', eul([-0.06, -twist * 0.5, 0])); add('head', eul([-0.1, -twist * 0.5, 0.03 * Math.sin(a)]));
        add('leftShoulder', eul([0, 0, -0.06])); add('rightShoulder', eul([0, 0, 0.06])); add('leftUpperArm', eul([armL, -0.12, -1.12])); add('rightUpperArm', eul([armR, 0.12, 1.12]));
        add('leftLowerArm', eul([0, -(0.95 + 0.4 * Math.max(0, -Math.sin(a + 0.2))), 0])); add('rightLowerArm', eul([0, 0.95 + 0.4 * Math.max(0, Math.sin(a + 0.2)), 0])); add('leftHand', eul([0, 0, -0.1])); add('rightHand', eul([0, 0, 0.1]));
        hips.push(0, bob, p * 2.5 / (hipY0 || 0.9)); }   /* (the last number: how far one cycle carries her, 2.5 m) */
      CLIPS.beach_run = { name: 'beach_run', dur, fps: (N - 1) / dur, n: N, bones, hips, made: true }; } }
  const cq = new THREE.Quaternion(), cq2 = new THREE.Quaternion(), fixBody = bodyFix(THREE, vrm), tongue = addTongue(THREE, vrm), fine = fineFace(vrm); let fineOn = false, clipHip = 0, clipFace = null;
  function playClip(name, weight, t, skip) { // blend one clip in at time t (seconds, loops); skip(bone) -> 0..1 of the weight to hold back
    const c = CLIPS[name]; if (!c || weight < 0.003) return false;
    const f = ((t % c.dur + c.dur) % c.dur) * c.fps, i0 = Math.min(c.n - 1, Math.floor(f)), i1 = Math.min(c.n - 1, i0 + 1), a = f - i0;
    for (const n in c.bones) {
      const bone = B(n); if (!bone) continue; const w = weight * (skip ? 1 - skip(n) : 1); if (w < 0.003) continue;
      const v = c.bones[n], p = i0 * 4, q = i1 * 4; cq.set(v[p], v[p + 1], v[p + 2], v[p + 3]); cq2.set(v[q], v[q + 1], v[q + 2], v[q + 3]); cq.slerp(cq2, a); bone.quaternion.slerp(cq, w);
    }
    if (c.face && weight > 0.5) { clipFace = clipFace || {}; for (const k in c.face) clipFace[k] = c.face[k][i0]; }   // a recorded take can carry her expression too
    if (c.hips && !(skip && skip('hips') >= 1)) clipHip += ((c.hips[i0 * 3 + 1] * (1 - a) + c.hips[i1 * 3 + 1] * a) - 1) * hipY0 * weight;   // how far the clip lifts or drops her hips
    return true;
  }
  const base = { head: [0, 0, 0], neck: POSE.neck || [0, 0, 0], chest: (B('upperChest') ? [0, 0, 0] : POSE.chest) || [0, 0, 0] };
  vrm.update(0); if (vrm.springBoneManager) vrm.springBoneManager.reset();

  // furniture, built to fit wherever her hips and heels ended up
  const wp = n => { const v = new THREE.Vector3(); const bone = B(n); if (bone) bone.getWorldPosition(v); return v; };
  const hip = wp('hips'), feet = wp('leftFoot').add(wp('rightFoot')).multiplyScalar(0.5);
  const floorY = hip.y - 0.5, kit = cel(THREE), mat = kit.toon;
  const room = new THREE.Group(); scene.add(room); // the furniture she has always had: it is her dorm room's
  let TAG = 'chair'; const tagged = []; // everything you can tap to send her to
  const tag = (m, t = TAG, where = 'dorm') => { m.traverse(o => { if (o.isMesh) { o.userData.tag = t; o.userData.place = where; tagged.push(o); } }); return m; };
  const box = (w, h, d, x, y, z, c, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.x = rx; if (Math.max(w, h, d) > 0.24) kit.outline(m); room.add(m); return tag(m); };
  const seatTop = hip.y - 0.1, ARM_X = 0.335, ARM_TOP = seatTop + 0.25;
  box(0.74, seatTop - floorY - 0.12, 0.62, 0, (seatTop - 0.12 + floorY) / 2, hip.z - 0.01, '#3a2148');           // chair body
  box(0.6, 0.14, 0.54, 0, seatTop - 0.07, hip.z + 0.03, '#5b3570');                                               // seat cushion
  box(0.74, 0.95, 0.16, 0, seatTop + 0.3, hip.z - 0.36, '#4a2a5c', -0.28);                                       // back, tilted
  box(0.14, 0.32, 0.62, -ARM_X, seatTop + 0.09, hip.z - 0.01, '#4a2a5c'); box(0.14, 0.32, 0.62, ARM_X, seatTop + 0.09, hip.z - 0.01, '#4a2a5c'); // arms: close enough in, and high enough, for her forearms to lie on
  const tableTop = feet.y - (window.WIZRA_TABLE || 0.1), tableZ = feet.z + 0.03; TAG = 'table';
  box(0.8, 0.05, 0.4, 0, tableTop - 0.025, tableZ + 0.02, '#3b2a1c');                                            // table top
  for (const [x, z] of [[-0.35, -0.13], [0.35, -0.13], [-0.35, 0.17], [0.35, 0.17]]) box(0.05, tableTop - floorY - 0.05, 0.05, x, (tableTop - 0.05 + floorY) / 2, tableZ + z, '#2a1d14');
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), mat('#251a30')); rug.rotation.x = -Math.PI / 2; rug.position.set(0, floorY, (hip.z + feet.z) / 2); room.add(rug); tag(rug, 'floor');

  // ---- the rest of her room: a floor, a bookshelf to the left and a little counter with a kettle to the right ----
  const backZ = hip.z - 1.25;                                    // the line the shelf and counter stand on
  const SHELF = { x: -1.3, z: backZ }, COUNTER = { x: 1.45, z: backZ + 0.05 }; TAG = 'shelf';
  box(0.9, 1.7, 0.04, SHELF.x, floorY + 0.85, SHELF.z - 0.13, '#33241a');                                         // shelf back
  box(0.04, 1.7, 0.3, SHELF.x - 0.45, floorY + 0.85, SHELF.z, '#3b2a1c'); box(0.04, 1.7, 0.3, SHELF.x + 0.45, floorY + 0.85, SHELF.z, '#3b2a1c');
  for (let i = 0; i < 5; i++) box(0.9, 0.035, 0.3, SHELF.x, floorY + 0.05 + i * 0.41, SHELF.z, '#3b2a1c');
  const SPINES = ['#7a1f3a', '#2f4a7a', '#3d6b4f', '#8a6a2a', '#5b3570', '#a04a2a', '#2a6b78', '#6b2a4a'];
  for (let row = 0; row < 4; row++) { let x = SHELF.x - 0.4, n = 0; while (x < SHELF.x + 0.36) { const wd = 0.03 + ((row * 7 + n * 5) % 4) * 0.009, ht = 0.25 + ((row * 3 + n * 11) % 5) * 0.022; if (!(row === 2 && n === 4)) box(wd, ht, 0.2, x + wd / 2, floorY + 0.07 + row * 0.41 + ht / 2, SHELF.z, SPINES[(row * 3 + n) % SPINES.length]); x += wd + 0.006; n++; } }
  TAG = 'counter';
  box(0.7, 0.9, 0.45, COUNTER.x, floorY + 0.45, COUNTER.z, '#3a2148'); box(0.76, 0.04, 0.5, COUNTER.x, floorY + 0.92, COUNTER.z, '#d9cfe6'); // counter + top
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.19, 20), mat('#c9ccd6')); kettle.position.set(COUNTER.x + 0.15, floorY + 1.035, COUNTER.z); room.add(kettle); tag(kettle, 'counter');
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16), mat('#6b3a2a')); jar.position.set(COUNTER.x - 0.2, floorY + 1.01, COUNTER.z - 0.05); room.add(jar);

  // the door she leaves and comes back by, out to the right
  const DOOR = [2.75, hip.z + 0.55];
  TAG = 'door'; box(0.08, 2.05, 1.0, 3.05, floorY + 1.02, DOOR[1], '#3b2a1c'); box(0.1, 2.15, 0.08, 3.04, floorY + 1.07, DOOR[1] - 0.54, '#2a1d14'); box(0.1, 2.15, 0.08, 3.04, floorY + 1.07, DOOR[1] + 0.54, '#2a1d14');
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), mat('#d9b25a')); knob.position.set(2.99, floorY + 1.0, DOOR[1] + 0.36); room.add(knob);
  // flushed cheeks: two soft discs on her face, shown when she blushes (or has been drinking)
  const rawHead = vrm.humanoid.getRawBoneNode('head');
  const blushMat = new THREE.MeshBasicMaterial({ color: '#ff5f8f', transparent: true, opacity: 0, depthTest: false });
  const eyeOff = (vrm.lookAt && vrm.lookAt.offsetFromHeadBone) ? vrm.lookAt.offsetFromHeadBone : new THREE.Vector3(0, 0.07, 0.03);
  const cheeks = [-1, 1].map(sx => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.014, 20), blushMat); m.scale.set(1.45, 0.8, 1); m.position.set(sx * 0.047, eyeOff.y - 0.04, eyeOff.z + 0.062); m.renderOrder = 20; rawHead.add(m); return m; });
  // happy tears at the corners of her eyes (the heart game), and how far the camera has closed in on her heart (0..1)
  const tearMat = new THREE.MeshBasicMaterial({ color: '#a8dcff', transparent: true, opacity: 0, depthTest: false });
  [-1, 1].forEach(sx => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 12, 10), tearMat); m.scale.set(0.42, 0.8, 0.3); m.position.set(sx * 0.049, eyeOff.y - 0.024, eyeOff.z + 0.064);   /* a small tear at the outer corner of each eye (they were big enough to read as a second pair of eyes) */ m.renderOrder = 21; rawHead.add(m); });
  let tearsWant = 0, focusWant = 0, focusNow = 0; const heartAt = new THREE.Vector3(), heartCam = new THREE.Vector3();
  const fwd = new THREE.Vector3(), toCam = new THREE.Vector3();
  let blushNow = 0;

  // a floor lamp behind the chair that comes on as it gets dark
  TAG = 'lamp'; box(0.035, 1.5, 0.035, 0.75, floorY + 0.75, backZ + 0.1, '#1c1626'); box(0.3, 0.03, 0.3, 0.75, floorY + 0.015, backZ + 0.1, '#1c1626');
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.26, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd9a0', side: THREE.DoubleSide })); shade.position.set(0.75, floorY + 1.58, backZ + 0.1); room.add(shade); tag(shade, 'lamp');
  const lampLight = new THREE.PointLight('#ffc27a', 0, 5, 1.6); lampLight.position.copy(shade.position); scene.add(lampLight);
  let lampOn = null; // null = follows the hour; true/false once you have tapped it
  // the walls, windows and the rest of her dorm, and your house (see places.js)
  const places = buildPlaces(THREE, { maps: opts.maps, cel: kit, floorY, hip, feet, seatTop, tableTop, tableZ, backZ, SHELF, COUNTER, DOOR, tagged });
  // ---- where the light really comes from. By day: the sun, through the windows (the same slant as the light shafts). After dark or
  // under heavy weather, indoors: the ceiling light, a bulb you can see, which is then also what throws the shadows. With the power
  // out, or outdoors at night: the moon. Lamps, candles and fires are lights of their own, placed at their bulbs and flames.
  const bulb = new THREE.Group(), bulbGlass = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff1cf' })), bulbLight = new THREE.PointLight('#ffdcae', 0, 12, 1.5);
  { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.08, 14), mat('#2b2433')); cap.position.y = 0.09; bulb.add(cap, bulbGlass, bulbLight); scene.add(bulb); }
  const SUN_L = new THREE.Vector3(0.7, -0.8, 0.55).normalize(), MOON_L = new THREE.Vector3(0.35, -0.55, 0.76).normalize();   // the way sunlight and moonlight travel
  let cinema = ''; const screenLight = new THREE.PointLight('#ffffff', 0, 9, 1.4); scene.add(screenLight);   // a film playing: the colour its screen throws on the room
  relight = day => {
    const b = places.bounds[here] || places.bounds.dorm, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, out = !!places.outdoor[here], staged = stageK !== null || inCall;
    bulb.visible = !out && !staged; bulb.position.set(cx, floorY + (b.h || 2.5) - 0.1, cz);
    if (staged) { sun.position.copy(FRONT); sun.target.position.set(0, 0.4, 1); bulbLight.intensity = 0; rim.intensity = 0.5; return; }
    const dark = day < 0.45 || gloom > 0.5, lit = !out && places.power && dark && mood < 0.5 && !cinema;   // dark enough for the room light, and it has power
    bulbGlass.material.color.set(lit ? '#fff1cf' : '#4a4458'); bulbLight.intensity = lit ? 2.6 : 0; sun.target.position.set(cx, floorY, cz);
    if (lit) { sun.position.set(cx + 0.3, floorY + (b.h || 2.5) + 4, cz + 0.5); sun.color.set('#ffdcae'); sun.intensity = 1.5; amb.intensity = 0.2; }
    else { sun.position.set(cx, floorY, cz).addScaledVector(day >= 0.45 ? SUN_L : MOON_L, -12);
      if (day < 0.45) { sun.color.set('#9fb4ff'); sun.intensity = (out ? 0.6 : 0.3) * (1 - 0.8 * gloom) * (1 - 0.4 * mood); amb.intensity = out ? 0.2 : 0.1; }
      else amb.intensity = (0.5 + 0.2 * day) * (1 - 0.55 * gloom) * (1 - 0.3 * mood); }                                  // by day the rest is light bouncing round the room
    if (cinema) { sun.intensity *= 0.12; amb.intensity = 0.07; }                                                         // movie night: lights down, the screen does the lighting
    rim.intensity = (0.2 + 0.5 * day) * (1 - 0.7 * gloom) * (cinema ? 0.3 : 1);                                                              // sky light from the back windows
  };
  scene.add(...Object.values(places.groups)); for (const g of Object.values(places.groups)) shadeUp(g); shadeUp(room); vrm.scene.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- props: they rest on the furniture and go to her hands when she uses them ----
  const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); scene.add(g); return g; };
  const slab = (w, h, d, c, x = 0, y = 0, z = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.y = ry; return m; };
  const book = group(slab(0.12, 0.18, 0.014, '#7a1f3a', -0.058, 0, -0.012, 0.28), slab(0.12, 0.18, 0.014, '#7a1f3a', 0.058, 0, -0.012, -0.28), slab(0.11, 0.165, 0.008, '#f3ecdf', -0.056, 0, 0, 0.28), slab(0.11, 0.165, 0.008, '#f3ecdf', 0.056, 0, 0, -0.28));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.12), new THREE.MeshBasicMaterial({ color: '#9fd8ff' })); screen.position.z = 0.0052;
  const phone = group(slab(0.068, 0.138, 0.009, '#15121c'), screen);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.09, 20), mat('#f0e8f8')), handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 16), mat('#f0e8f8')); handle.position.x = 0.045;
  const mug = group(cup, handle);
  tag(book, 'book', ''); tag(phone, 'phone', ''); tag(mug, 'mug', '');
  const REST_AT = { // where each prop sits when she is not holding it: [position, rotation]
    book: [new THREE.Vector3(0.24, tableTop + 0.012, feet.z - 0.08), new THREE.Euler(-Math.PI / 2, 0, 0.4)],
    bookShelf: [new THREE.Vector3(SHELF.x - 0.19, floorY + 0.07 + 2 * 0.41 + 0.1, SHELF.z + 0.02), new THREE.Euler(0, Math.PI / 2, 0)], // its gap on the shelf
    phone: [new THREE.Vector3(-0.26, tableTop + 0.006, feet.z - 0.1), new THREE.Euler(-Math.PI / 2, 0, -0.3)],
    mug: [new THREE.Vector3(-ARM_X, ARM_TOP + 0.045, hip.z + 0.255), new THREE.Euler(0, 0.6, 0)],   /* at the front end of the chair arm, clear of her hand */
  };
  const PROP = { read: book, phone, sip: mug }, PROP_KEY = { read: 'book', phone: 'phone', sip: 'mug' };
  const raw = n => vrm.humanoid.getRawBoneNode(n);
  const palmR = raw('rightMiddleProximal') || raw('rightHand'), palmL = raw('leftMiddleProximal') || raw('leftHand');
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), headPos = new THREE.Vector3();

  // ---- her routine: what she is busy with when left alone, and the errands she can run ----
  // Seated she reads, checks her phone or sips. On her feet she follows a plan: a list of steps (go somewhere, turn, wait
  // with her hand out, do something), then walks back and sits down, optionally starting something once seated.
  const standZ = Math.max(hip.z + 0.38, (hip.z + 0.3 + tableZ - 0.18) / 2), STAND_AT = [0, standZ]; window.WIZRA_DBG = { feet: feet.z - hip.z, stand: standZ - hip.z, table: tableZ - hip.z, live: { POSE, OVER, ARMS, get ATTACH() { return ATTACH; }, get rt() { return rt; }, get fp() { return fp; }, free: (x, z) => free(x, z) } };   // (live: for tuning poses from the console)                                               // she stands up in front of the chair, between it and the table
  const EXIT = [0.95, standZ];                                                // then steps out to the side past the armrest
  const R_BACK = [0.95, hip.z - 0.72], L_BACK = [-0.78, hip.z - 0.72];             // round the back of the chair
  const AT_SHELF = [SHELF.x + 0.12, SHELF.z + 0.5], AT_COUNTER = [COUNTER.x - 0.05, COUNTER.z + 0.52];
  const WALK_ARM = { rightUpperArm: 1, rightLowerArm: 1, rightHand: 1 };
  const stride = c => (c.hips ? Math.abs(c.hips[c.hips.length - 1] - c.hips[2]) * hipY0 : 0) || 1.3;   // metres one loop of a walking clip covers, at her size
  const DOING = { read: 'reading her book', phone: 'looking at her phone', sip: 'sipping her drink' };
  const rt = { act: 'sit', until: 0, nextAt: performance.now() + 60000 + Math.random() * 60000, lastTalk: 0, self: false, stand: 0, ov: { read: 0, phone: 0, sip: 0 }, x: STAND_AT[0], z: STAND_AT[1], yaw: 0, phase: 0, leg: 0,
    legs: 'up', arms: 'rest', ar: {}, armsAt: performance.now() + 40000, lg: { crossed: 0, floor: 0, hair: 0, drape: 0 }, legsAt: performance.now() + 30000, steps: [], i: 0, stepT: 0, label: '', after: '', hold: 0, carry: null, carryW: { book: 0, mug: 0, phone: 0 }, walkT: 0, talkW: 0, lie: 0, lieWant: 0, bookHome: 'shelf', head: [0, 0], zoom: 0, gazeProp: null };
  const go = p => ({ go: p }), face = yaw => ({ face: yaw }), wait = sec => ({ wait: sec }), stay = sec => ({ wait: sec, idle: true }), run = fn => ({ run: fn });
  // ---- finding her way: a grid of the room with the furniture (and you) blocked out, so she walks round things, not through them ----
  const CELL = 0.1, PAD = 0.17, navs = {};
  function nav(name) {
    if (navs[name]) return navs[name];
    const b = places.bounds[name], nx = Math.ceil((b.x1 - b.x0) / CELL), nz = Math.ceil((b.z1 - b.z0) / CELL), g = new Uint8Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = b.x0 + (ix + 0.5) * CELL, z = b.z0 + (iz + 0.5) * CELL; let hit = x < b.x0 + 0.22 || x > b.x1 - 0.22 || z < b.z0 + 0.22 || z > b.z1 - 0.22;
      if (!hit) for (const [x0, x1, z0, z1] of places.solid[name]) if (x > x0 - PAD && x < x1 + PAD && z > z0 - PAD && z < z1 + PAD) { hit = true; break; }
      g[iz * nx + ix] = hit ? 1 : 0;
    }
    return navs[name] = { b, nx, nz, g };
  }
  const walkable = (x, z) => { const { b, nx, nz, g } = nav(here), ix = Math.floor((x - b.x0) / CELL), iz = Math.floor((z - b.z0) / CELL); return ix >= 0 && iz >= 0 && ix < nx && iz < nz && !g[iz * nx + ix]; };
  function route(from, to, ignoreYou) { // the points to walk through to get from one spot to another
    const { b, nx, nz, g } = nav(here), you = fp.on && !ignoreYou ? [fp.x, fp.z] : null;
    const pos = (ix, iz) => [b.x0 + (ix + 0.5) * CELL, b.z0 + (iz + 0.5) * CELL];
    const open = (ix, iz) => { if (ix < 0 || iz < 0 || ix >= nx || iz >= nz || g[iz * nx + ix]) return false; if (you) { const q = pos(ix, iz); if (Math.hypot(q[0] - you[0], q[1] - you[1]) < 0.55) return false; } return true; };
    const nearest = p => { // the cell a point is in, or the closest free one if that is inside something (her own seat, say)
      const cx = Math.max(0, Math.min(nx - 1, Math.floor((p[0] - b.x0) / CELL))), cz = Math.max(0, Math.min(nz - 1, Math.floor((p[1] - b.z0) / CELL)));
      if (open(cx, cz)) return [cx, cz, true]; let best = null, bd = 1e9;
      for (let r = 1; r < 16; r++) { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !open(cx + dx, cz + dz)) continue; const q = pos(cx + dx, cz + dz), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = [cx + dx, cz + dz, false]; } } if (best && bd < (r + 0.5) * CELL) break; }
      return best;
    };
    const A = nearest(from), Z = nearest(to); if (!A || !Z) return null;
    const N = nx * nz, cost = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N), start = A[1] * nx + A[0], goal = Z[1] * nx + Z[0], openSet = [start]; cost[start] = 0;
    const h = i => Math.hypot(i % nx - Z[0], (i / nx | 0) - Z[1]);
    let found = false;
    while (openSet.length) {
      let bi = 0; for (let i = 1; i < openSet.length; i++) if (cost[openSet[i]] + h(openSet[i]) < cost[openSet[bi]] + h(openSet[bi])) bi = i;
      const cur = openSet.splice(bi, 1)[0]; if (cur === goal) { found = true; break; } if (done[cur]) continue; done[cur] = 1;
      const cx = cur % nx, cz = cur / nx | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const x = cx + dx, z = cz + dz; if (!open(x, z) || (dx && dz && (!open(cx + dx, cz) || !open(cx, cz + dz)))) continue; // no cutting corners
        const n = z * nx + x, c = cost[cur] + (dx && dz ? 1.4142 : 1); if (c < cost[n]) { cost[n] = c; came[n] = cur; openSet.push(n); }
      }
    }
    if (!found) return null;
    let cells = []; for (let c = goal; c !== -1; c = came[c]) cells.push(pos(c % nx, c / nx | 0)); cells.reverse();
    const clear = (p, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(d / 0.04); for (let i = 1; i < n; i++) { const x = p[0] + (q[0] - p[0]) * i / n, z = p[1] + (q[1] - p[1]) * i / n; if (!open(Math.floor((x - b.x0) / CELL), Math.floor((z - b.z0) / CELL))) return false; } return true; };
    const out = []; let at = 0; if (!A[2]) out.push(cells[0]);                       // step out of whatever she started inside
    while (at < cells.length - 1) { let j = cells.length - 1; while (j > at + 1 && !clear(cells[at], cells[j])) j--; out.push(cells[j]); at = j; } // straighten: skip to the furthest point in clear sight
    if (Z[2] && out.length) out[out.length - 1] = [to[0], to[1]]; else out.push([to[0], to[1]]);   // finish on the exact spot (a last short step if it is inside something, like her seat)
    return out;
  }
  // the way back to her seat from wherever she is, and out to a spot on the floor: the path finder does the rest
  const wayHome = () => [go(STAND_AT)], wayTo = (x, z) => [go([x, z])];
  function plan(label, steps, after = '', stayOut = false) { if (mv.on || dn.on) return;   /* at the film or at the D&D table she stays where she is: nothing she says or feels sends her off on a walk */
    if (rt.stand < 0.05) { rt.x = STAND_AT[0]; rt.z = STAND_AT[1]; rt.yaw = 0; }
    Object.assign(rt, { act: 'up', steps: [...steps, ...(stayOut ? [] : [run(() => { rt.steps.push(...wayHome()); })])], i: 0, stepT: 0, label, after });
  }
  const ERRAND = {
    pace: () => plan(CLIPS.texting_and_walking ? 'pacing around the room, texting' : 'up and pacing around the room', [run(() => { if (CLIPS.texting_and_walking) rt.carry = 'phone'; }), go(R_BACK), go(L_BACK), go(R_BACK), run(() => { if (rt.carry === 'phone') rt.carry = null; })]),
    liedown: () => { if (here === 'dorm' && CLIPS.female_laying_pose) { rt.liePose = CLIPS.female_laying_pose_1 && Math.random() < 0.5 ? 'female_laying_pose_1' : 'female_laying_pose'; rt.lieAt = null; plan('lying on her bed', [go(places.bed.side), { lie: 45 + Math.random() * 60 }]); } },
    // her yoga: she finds a clear patch of floor and holds four poses, one after another
    yoga: () => { const spots = [[1.25, hip.z + 1.55], [-1.2, hip.z + 1.5], [0.9, hip.z + 2.1], STAND_AT], at = spots.find(p => walkable(p[0], p[1])) || STAND_AT, order = ['yoga_moon', 'yoga_tree', 'yoga_warrior', 'yoga_sit'];
      const steps = [go(at)]; for (const n of order) steps.push(run(() => { rt.liePose = n; rt.lieAt = { x: at[0], z: at[1], y: floorY, yaw: Math.atan2(camera.position.x - at[0], camera.position.z - at[1]) }; }), { lie: n === 'yoga_sit' ? 22 : 13 }, wait(1.2));
      plan('doing yoga', steps); },
    // one of the things placed in this room (a bean bag, the log by the fire, the picnic blanket): she goes over and settles on it for a while
    perch: () => { if (window.WIZRA_PERCH != null) window.WIZRA_RT = rt; const list = (places.perches[here] || []).filter(p => CLIPS[p.lie ? 'female_laying_pose' : 'female_sitting_pose']); if (!list.length) return; const p = list[window.WIZRA_PERCH != null ? window.WIZRA_PERCH % list.length : Math.floor(Math.random() * list.length)];
      const pose = p.lie ? (CLIPS.female_laying_pose_1 && Math.random() < 0.5 ? 'female_laying_pose_1' : 'female_laying_pose') : ['female_sitting_pose', 'female_sitting_pose_1', 'female_sitting_pose_2'].filter(n => CLIPS[n])[Math.floor(Math.random() * 3)] || 'female_sitting_pose';
      plan((p.lie ? 'lying on ' : 'sitting on ') + p.name, [go(p.from), run(() => { rt.liePose = pose; rt.lieAt = { x: p.at[0], z: p.at[1], y: floorY + p.top - (p.lie ? 0 : 0.4), yaw: p.yaw + (p.lie ? Math.PI : 0) }; }), { lie: 60 + Math.random() * 90 }]); },
    fetchbook: () => plan('getting a book from the shelf', [go(AT_SHELF), face(Math.PI), wait(1.3), run(() => { rt.carry = 'book'; rt.bookHome = 'table'; }), wait(0.5)], Math.random() < 0.75 ? 'read' : ''),
    returnbook: () => plan('putting her book back on the shelf', [run(() => { rt.carry = 'book'; }), wait(0.6), go(AT_SHELF), face(Math.PI), wait(1.2), run(() => { rt.carry = null; rt.bookHome = 'shelf'; }), wait(0.5)]),
    fetchdrink: () => plan('getting herself a drink', [run(() => { rt.carry = 'mug'; }), wait(0.6), go(AT_COUNTER), face(Math.PI), run(() => snd('pour')), wait(2.2)], 'sip'),
  };
  function startActivity(name) {
    const now = performance.now(); if (rt.act === 'gone' || rt.leaving) return;   // not here, or on her way out
    if (name === 'curl' || name === 'knee') name = 'drape';
    if (name === 'drape') { rt.legs = 'drape'; rt.legsAt = now + 60000 + Math.random() * 60000; return; }
    if (SEATED[name]) { if (CLIPS[SEATED[name]._clip]) { rt.legs = name; rt.legsAt = now + 60000 + Math.random() * 60000; } return; }
    if (name === 'feetup' || name === 'crosslegs' || name === 'feetdown') { rt.legs = name === 'feetup' ? 'up' : name === 'crosslegs' ? 'crossed' : 'floor'; rt.legsAt = now + 60000 + Math.random() * 60000; return; }
    if (name === 'sit') { if (rt.act === 'up') { rt.steps = wayHome(); rt.i = 0; rt.after = ''; } else if (rt.act !== 'sitdown') rt.act = 'sit'; rt.nextAt = now + 20000 + Math.random() * 25000; return; }
    if (name === 'read' && rt.bookHome === 'shelf') name = 'fetchbook';             // nothing to read until she gets a book
    if (name === 'returnbook' && rt.bookHome === 'shelf') return;
    if (ERRAND[name]) { if (rt.act !== 'up' && rt.act !== 'sitdown') { if (OVER[rt.act]) rt.act = 'sit'; ERRAND[name](); } return; }
    if (!OVER[name] || rt.act === 'up' || rt.act === 'sitdown') return;
    rt.act = name; rt.until = now + (name === 'sip' ? 4200 : name === 'phone' ? 45000 + Math.random() * 60000 : 80000 + Math.random() * 120000);   // she settles into things
  }
  // ---- the heart game's poses: every heart you pop puts her in another one (standing, sitting, lying), taken from the recorded clips
  const HPOSE = [['idle', 2, 'stand'], ['female_sitting_pose', 0, 'sit'], ['female_laying_pose_1', 0, 'lie'], ['female_sitting_pose_2', 0, 'sit'], ['talking', 1.2, 'stand'], ['female_laying_pose', 0, 'lie'], ['female_sitting_pose_1', 0, 'sit'],
    ['female_sitting_pose', 0, 'sit'], ['idle', 5.5, 'stand'], ['talking', 3.4, 'stand'], ['idle', 2, 'stand']];   // the last three are on her feet: the view is closing in on her heart by then
  const hpose = { on: false, i: 0, wig: 0 };
  function heartPose(i) { if (i === null || i === undefined) { if (hpose.on) { hpose.on = false; vrm.scene.rotation.set(0, 0, 0); for (const n of KEYS) { const q = POSE[n] || [0, 0, 0]; CUR[n][0] = q[0]; CUR[n][1] = q[1]; CUR[n][2] = q[2]; } Object.assign(rt, { act: rt.act === 'gone' ? 'gone' : 'sit', stand: 0, k: 0, leg: 0 }); if (vrm.springBoneManager) vrm.springBoneManager.reset(); } return; }
    hpose.on = true; hpose.i = Math.max(0, i | 0); hpose.wig = 1; hpose.settle = 2; }   // (her hair is put at rest once the new pose is actually on her: see draw)
  function heartStage(k) { // hide the room and put a plain background behind her: white-pink at the start, deep pink by the end
    if (k === null || k === undefined) { if (stageK !== null) { stageK = null; setPlace(here); for (const o of [book, phone, mug]) o.visible = true; lampLight.visible = true; daylight(); } return; }
    stageK = Math.max(0, Math.min(1, k)); for (const key in places.groups) places.groups[key].visible = false; room.visible = false; for (const o of [book, phone, mug]) o.visible = false; lampLight.visible = false;
    if (relight) relight(1 - night);
    el.style.background = `radial-gradient(circle at 50% 42%, hsl(338 100% ${97 - 27 * stageK}%), hsl(${334 - 6 * stageK} ${88 + 6 * stageK}% ${88 - 50 * stageK}%))`;
  }
  // ---- scripted (the Studio's events): walk her to a spot, or hold a recorded clip for a while ----
  function walkTo(x, z, done) { // she gets up if she has to, goes there by her own path finding, and stays until told otherwise
    if (rt.act === 'gone' || rt.leaving || inCall) { if (done) done(false); return; }
    if (OVER[rt.act]) rt.act = 'sit';
    const steps = [go([x, z]), run(() => { if (done) done(true); }), stay(600)];
    if (rt.act === 'up') { rt.steps = [...steps, run(() => { rt.steps.push(...wayHome()); })]; rt.i = 0; rt.stepT = 0; rt.label = 'walking over'; rt.after = ''; } else plan('walking over', steps);
  }
  function holdClip(name, seconds) { if (CLIPS[name]) Object.assign(rt, { scriptClip: name, scriptFrom: performance.now(), scriptUntil: performance.now() + seconds * 1000 }); return !!CLIPS[name]; }
  // leaving the room and coming back (the page tells us when; see setPresence there)
  const vanish = () => { for (const n of KEYS) { const q = POSE[n] || [0, 0, 0]; CUR[n][0] = q[0]; CUR[n][1] = q[1]; CUR[n][2] = q[2]; set(n, q[0], q[1], q[2]); } rt.act = 'gone'; rt.leaving = false; rt.stand = 0; rt.k = 0; rt.leg = 0; rt.carry = null; rt.sneak = false; vrm.scene.visible = false; vrm.scene.position.set(0, 0, 0); vrm.scene.rotation.y = 0; };
  function presence(mode, o = {}) {
    if (inCall) call(false);
    if (mode === 'gone') return vanish();
    if (mode === 'leave') { if (rt.act === 'gone') return; if (OVER[rt.act]) rt.act = 'sit'; rt.leaving = true; rt.after = ''; if (rt.act === 'up') { rt.steps = [go(DOOR), run(() => { snd('door'); vanish(); })]; rt.i = 0; rt.label = 'heading out'; } else plan('heading out', [go(DOOR), run(() => { snd('door'); vanish(); })], '', true); return; }
    if (mode === 'return') { // she appears at the door and walks to her chair; sneaking is slow, low and watchful
      vrm.scene.visible = true; if (vrm.springBoneManager) vrm.springBoneManager.reset(); snd('door');
      Object.assign(rt, { act: 'up', leaving: false, stand: 1, k: 1, x: DOOR[0], z: DOOR[1], yaw: -Math.PI / 2, sneak: !!o.sneak, label: o.sneak ? 'sneaking back in' : 'coming back in', after: '', i: 0, stepT: 0 });
      rt.steps = wayHome();
    }
  }
  const turnTo = (want, dt, rate) => { const d = Math.atan2(Math.sin(want - rt.yaw), Math.cos(want - rt.yaw)); rt.yaw += d * Math.min(1, dt * rate); rt.yaw = Math.atan2(Math.sin(rt.yaw), Math.cos(rt.yaw)); return Math.abs(d); }; // kept within half a turn either way, so "facing front" is always 0
  function routine(s) {
    clipHip = 0;
    if (bh.on && bh.mode === 'chase') return chaseFrame(s);
    if (bh.on) { // the beach (the heart game): she runs along the water's edge; in pose mode she stands there instead
      for (const n of KEYS) set(n, ...standOf(n)); for (const n of ['head', 'neck', 'chest', 'upperChest', 'spine', 'hips']) set(n, 0, 0, 0);
      const run = (window.WIZRA_BEACH_RUN && haveClip(window.WIZRA_BEACH_RUN) && window.WIZRA_BEACH_RUN) || BEACH_RUNS.find(haveClip) || 'beach_run', c = CLIPS[run], rate = 0.4, cut = performance.now() < bh.cutUntil;   /* slow motion; cut: a heart has just been popped and time is holding still for a close look */   /* (WIZRA_BEACH_RUN: try one clip by name, for tests) */   /* slow motion: the whole run is shown at a little over half speed */
      const ot = bh.outro ? bhOutT() : -1, ok = ot < 0 ? 0 : Math.min(1, ot / 0.55), oe = ok * ok * (3 - 2 * ok);   /* the goodbye: she slows to a stop, turns to the sun (or the moon) and shades her eyes */
      if (bh.pose || ot >= 0) { playClip(CLIPS.happy_idle ? 'happy_idle' : 'idle', 1, s.t / 1000); haveClip('happy_idle'); }
      else if (c) { if (window.WIZRA_BEACH_T != null) bh.t = +window.WIZRA_BEACH_T; else if (!bh.paused && !cut) { bh.t += s.dt * rate; bh.x += stride(c) / c.dur * s.dt * rate; } playClip(run, 1, bh.t); } else if (!bh.paused && !cut) bh.x += 2.2 * s.dt;
      bhUp = -0.5 * oe;
      const bob = bh.pose || bh.paused || ot >= 0 ? 0 : 0.012 * Math.abs(Math.sin(bh.t / (c ? c.dur : 1) * Math.PI * 2));
      vrm.scene.position.set(bh.x, floorY + bob * (1 - oe), RUN_Z); vrm.scene.rotation.set(0, Math.PI / 2 + (beach.sunYaw - Math.PI / 2) * oe, 0, 'XYZ'); rt.k = 1; rt.gazeProp = null; rt.zoom = 0;
      if (oe > 0) { const ua = B('rightUpperArm'), la = B('rightLowerArm'), hd = B('rightHand'), hb = B('head'); if (ua && la && hd && hb) { /* her right hand comes up to her brow, on the side the light comes from */ vrm.scene.updateMatrixWorld(true); bhQ1.copy(ua.quaternion); bhQ2.copy(la.quaternion); hb.getWorldPosition(bhV); const sy = vrm.scene.rotation.y; bhV.x += Math.sin(sy) * 0.13 - Math.cos(sy) * 0.05; bhV.z += Math.cos(sy) * 0.13 + Math.sin(sy) * 0.05; bhV.y += 0.085; ikReach(ua, la, hd, bhV); ua.quaternion.slerp(bhQ1, 1 - oe); la.quaternion.slerp(bhQ2, 1 - oe); } }
      if (bh.settle && --bh.settle === 0 && vrm.springBoneManager) { vrm.scene.updateMatrixWorld(true); vrm.springBoneManager.reset(); try { cloth && cloth.reset && cloth.reset(); } catch {} }   /* she arrived here in one jump: her hair and clothes start at rest */
      { const fl = B('leftFoot'), fr = B('rightFoot'); beach.tick(s.t / 1000, bh.x, fl && fr ? [fl.getWorldPosition(bhFeet[0]), fr.getWorldPosition(bhFeet[1])] : null, !bh.pose && !bh.paused && ot < 0 && !cut, cut || bh.paused); } if (beach.night) { sun.intensity = Math.PI * 0.42; sun.color.set('#b9c8ff'); amb.intensity = 0.34; } else { sun.intensity = Math.PI * 1.05; sun.color.set('#fffaf0'); amb.intensity = 0.62; }
      return;
    }
    if (hpose.on) { // the heart game: no room, just her, in whatever pose the last heart left her in
      for (const n of KEYS) set(n, ...standOf(n)); for (const n of ['head', 'neck', 'chest', 'upperChest', 'spine', 'hips']) set(n, 0, 0, 0);
      const pose = HPOSE[hpose.i % HPOSE.length], have = CLIPS[pose[0]]; if (have) playClip(pose[0], 1, pose[1]); else playClip('idle', 1, 2);
      hpose.wig *= Math.exp(-s.dt * 3.2); const w = hpose.wig * Math.sin(s.t / 1000 * 22);                    // a squirm when the pose changes
      vrm.scene.position.set(0.012 * w, floorY, 0); vrm.scene.rotation.set(0, 0.1 * w, 0.03 * w); rt.k = 1; rt.gazeProp = null; rt.zoom = 0;
      return;
    }
    if (window.WIZRA_CLIP) { for (const n of KEYS) set(n, ...standOf(n)); vrm.scene.position.set(0, floorY, hip.z + 0.4); playClip(window.WIZRA_CLIP, 1, window.WIZRA_CLIP_T != null ? window.WIZRA_CLIP_T : s.t / 1000); return; } // test hook: look at one clip
    if (rt.act === 'call') return callFrame(s);
    if (rt.act === 'gone') return;                                               // the chair is empty
    const now = performance.now(), dt = s.dt, attending = (s.talking || s.thinking) && !rt.leaving;   // (really working on a reply: a thoughtful face alone does not stop her) rt.attending = attending; if (attending) rt.lastTalk = now;
    const inTalk = now - rt.lastTalk < 100000;                                    // you two are (or just were) talking: she stays with you
    if (attending && rt.self && rt.act === 'up') { rt.self = false; rt.steps = wayHome(); rt.i = 0; rt.stepT = 0; rt.after = ''; rt.label = 'coming back to sit with you'; if (rt.carry === 'phone') rt.carry = null; }   // you spoke while she was off on a whim: she drops it and comes back
    // on her own schedule
    if (rt.act === 'sit' && !attending && now > rt.nextAt && !window.WIZRA_STILL) {
      const r = Math.random(), onTable = rt.bookHome === 'table';
      if (inTalk) { rt.nextAt = now + 30000 + Math.random() * 30000; if (r < 0.25) startActivity('sip'); }       // mid-conversation: at most a sip, never wandering off
      else { rt.self = true; // on her own: mostly things she does sitting down; getting up is the exception
        startActivity(r < 0.36 ? (onTable ? 'read' : 'phone') : r < 0.66 ? 'phone' : r < 0.8 ? 'sip' : r < 0.86 ? 'pace' : r < 0.91 ? 'fetchdrink' : r < 0.95 && here === 'dorm' && CLIPS.female_laying_pose ? 'liedown' : r < (here === 'dorm' ? 0.97 : 0.99) && (places.perches[here] || []).length ? 'perch' : onTable ? 'returnbook' : 'fetchbook'); }
    }
    if (OVER[rt.act] && now > rt.until) { rt.act = 'sit'; rt.nextAt = now + 50000 + Math.random() * 90000; }
    // standing up / sitting down
    // two stages: first her feet come off the table and down to the floor and she sits up, then she rises onto them
    const up = rt.act === 'up' ? 1 : 0; rt.stand += Math.sign(up - rt.stand) * Math.min(Math.abs(up - rt.stand), dt * 0.62);
    const ease = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    const ka = ease(rt.stand / 0.45), k = ease((rt.stand - 0.45) / 0.55); rt.k = k;
    for (const n of KEYS) { const a = POSE[n] || [0, 0, 0], m = situpOf(n), b = standOf(n), c = CUR[n]; for (let i = 0; i < 3; i++) { const mid = a[i] + (m[i] - a[i]) * ka; c[i] = mid + (b[i] - mid) * k; } }
    if (k > 0 && k < 1) { const push = Math.sin(Math.PI * k); CUR.spine[0] += 0.35 * push; CUR.hips[0] += 0.18 * push; CUR.leftUpperLeg[0] -= 0.25 * push; CUR.rightUpperLeg[0] -= 0.25 * push; } // lean forward over her feet to get up
    // the plan she is following on her feet; she stops and turns to you when you talk to her
    let moving = false, holdWant = rt.carry && rt.carry !== 'phone' ? 0.5 : 0; rt.lieWant = 0;
    if (rt.act === 'up' && rt.stand > 0.985) {
      const st = rt.steps[rt.i];
      if (st && st.lie) { rt.stepT += dt; if (rt.stepT < st.lie) rt.lieWant = 1; else if (rt.lie < 0.02) { rt.stepT = 0; rt.i++; } } // on her bed for a while, then up again
      else if (rt.lie > 0.02) { /* still getting up off the bed */ }
      else if (!st) { rt.act = 'sitdown'; }
      else if (attending) turnTo(Math.atan2(camera.position.x - rt.x, camera.position.z - rt.z), dt, 4);
      else if (st.go) {
        if (!st.path) { st.path = route([rt.x, rt.z], st.go, st.tries > 4) || [st.go]; st.stuck = 0; }
        const tgt = st.path[0];
        if (!tgt) rt.i++;
        else {
          const dx = tgt[0] - rt.x, dz = tgt[1] - rt.z, d = Math.hypot(dx, dz);
          if (d < 0.06) st.path.shift();
          else {
            const off = turnTo(Math.atan2(dx, dz), dt, 5), sp = (rt.sneak ? 0.3 : rt.glow === 'hyper' ? 1.05 : rt.carry === 'phone' ? 0.6 : 0.85) * Math.max(0.12, 1 - off), nx = rt.x + dx / d * sp * dt, nz = rt.z + dz / d * sp * dt;
            const inWay = fp.on && !(st.tries > 4) && Math.hypot(nx - fp.x, nz - fp.z) < 0.5 && Math.hypot(nx - fp.x, nz - fp.z) < Math.hypot(rt.x - fp.x, rt.z - fp.z);
            if (inWay) { st.stuck += dt; if (st.stuck > 1.2) { st.tries = (st.tries || 0) + 1; st.path = null; } }   // you are in her way: she waits, then looks for a way round
            else { moving = true; rt.x = nx; rt.z = nz; const was = Math.floor(rt.phase / Math.PI); rt.phase += sp * dt * 4.6; rt.walkSp = sp; if (fp.on && Math.floor(rt.phase / Math.PI) !== was) snd('step2'); }
          }
        }
      }
      else if (st.face !== undefined) { if (turnTo(st.face, dt, 5) < 0.1) rt.i++; }
      else if (st.wait) { holdWant = st.idle ? holdWant : 1; if (st.idle && !(hg.on && Math.abs(hg.yaw) > 0.02)) turnTo(Math.atan2(camera.position.x - rt.x, camera.position.z - rt.z), dt, 4); rt.stepT += dt; if (rt.stepT >= st.wait) { rt.stepT = 0; rt.i++; } }
      else if (st.run) { st.run(); rt.i++; }
    }
    if (rt.act === 'sitdown') { // turn to face front, lower into the chair, then get on with whatever she came back to do
      turnTo(0, dt, 5);
      if (Math.abs(rt.yaw) < 0.08 && rt.stand <= 0.001) { rt.act = 'sit'; rt.sneak = false; rt.self = false; rt.nextAt = now + 70000 + Math.random() * 110000; const then = rt.after; rt.after = ''; if (rt.carry === 'book' && then !== 'read') rt.bookHome = 'table'; rt.carry = null; if (then) startActivity(then); }
    }
    // how her legs are resting: she changes it now and then, and it only applies while she is properly sat
    if (rt.act !== 'up' && rt.act !== 'sitdown' && now > rt.legsAt && !inTalk && !window.WIZRA_STILL) { const pool = ['up', 'up', 'crossed', 'crossed', 'floor', 'drape'];   /* (the recorded 'hair' pose, hands up in her hair with her elbows out, is no longer picked on its own: it read as her arms being put on wrong. It can still be asked for by name.) */ rt.legs = pool[Math.random() * pool.length | 0]; rt.legsAt = now + 150000 + Math.random() * 200000; }
    let scoot = 0, perch = 0, sideways = 0, slide = 0; const seatClips = [];
    for (const name in LEGS) {
      rt.lg[name] += ((rt.legs === name ? 1 : 0) - rt.lg[name]) * Math.min(1, dt * 2.2); const v = rt.lg[name] * (1 - ka), wgt = v * v * (3 - 2 * v); if (wgt < 0.002) continue;
      if (LEGS[name]._clip) { if (!CLIPS[LEGS[name]._clip]) continue; seatClips.push([LEGS[name]._clip, wgt]); perch += (floorY + LEGS[name]._y) * wgt; scoot += (hip.z + LEGS[name]._z) * wgt; continue; } // a recorded pose, feet up on the seat
      if (LEGS[name]._z) scoot += LEGS[name]._z * wgt;                              // sitting forward on the seat
      if (LEGS[name]._yaw) { sideways += LEGS[name]._yaw * wgt; slide += LEGS[name]._x * wgt; perch += (LEGS[name]._y || 0) * wgt; }
      for (const n in LEGS[name]) { if (n[0] === '_') continue; const q = LEGS[name][n], c = CUR[n]; c[0] += (q[0] - c[0]) * wgt; c[1] += (q[1] - c[1]) * wgt; c[2] += (q[2] - c[2]) * wgt; }
    }
    // where her free arms rest (see ARMS); a held thing or a gesture goes over the top
    if (rt.act !== 'up' && rt.act !== 'sitdown' && now > rt.armsAt && !window.WIZRA_STILL) { const names = ARMS.rest && here === 'dorm' ? ['rest', 'rest', 'rest', ...Object.keys(ARMS).filter(n => n !== 'rest')] : Object.keys(ARMS).filter(n => n !== 'rest'); rt.arms = names[Math.random() * names.length | 0]; rt.armsAt = now + 45000 + Math.random() * 70000; }
    if (rt.arms === 'rest' && (here !== 'dorm' || mv.on || dn.on)) rt.arms = 'lap';   /* on a couch, a stool or a bed there are no chair arms */
    for (const name in ARMS) { rt.ar[name] = (rt.ar[name] || 0) + ((rt.arms === name ? 1 : 0) - (rt.ar[name] || 0)) * Math.min(1, dt * 1.6); const v = rt.ar[name] * (1 - ka), wgt = v * v * (3 - 2 * v); if (wgt < 0.002) continue;
      for (const n in ARMS[name]) { const q = ARMS[name][n], c = CUR[n]; c[0] += (q[0] - c[0]) * wgt; c[1] += (q[1] - c[1]) * wgt; c[2] += (q[2] - c[2]) * wgt; } }
    // what she is holding while seated
    rt.gazeProp = null; let hp = 0, hy = 0;
    for (const name in OVER) {
      const want = rt.act === name ? 1 : 0; /* she keeps hold of it while you talk; only her eyes come up to you */ rt.ov[name] += (want - rt.ov[name]) * Math.min(1, dt * 3.5);
      const wgt = rt.ov[name]; if (wgt < 0.002) continue;
      for (const n in OVER[name]) { const q = OVER[name][n], c = CUR[n]; c[0] += (q[0] - c[0]) * wgt; c[1] += (q[1] - c[1]) * wgt; c[2] += (q[2] - c[2]) * wgt; }
      if (rt.act === name && !attending && name !== 'sip') { rt.gazeProp = PROP[name]; hp = 0.28 * wgt; hy = name === 'phone' ? -0.18 * wgt : 0; }
      if (name === 'sip') hp = -0.12 * wgt;
    }
    // her hand out: reaching for something, or carrying it
    rt.hold += (holdWant - rt.hold) * Math.min(1, dt * 4);
    if (rt.hold > 0.002) for (const n in OVER.phone) { const q = OVER.phone[n], c = CUR[n]; c[0] += (q[0] - c[0]) * rt.hold; c[1] += (q[1] - c[1]) * rt.hold; c[2] += (q[2] - c[2]) * rt.hold; }
    if (rt.carryW.mug > 0.002) for (const n in GRIP_MUG) { const q = GRIP_MUG[n], c = CUR[n]; c[0] += (q[0] - c[0]) * rt.carryW.mug; c[1] += (q[1] - c[1]) * rt.carryW.mug; c[2] += (q[2] - c[2]) * rt.carryW.mug; }
    for (const key in rt.carryW) rt.carryW[key] += ((rt.carry === key ? 1 : 0) - rt.carryW[key]) * Math.min(1, dt * 4);
    rt.head[0] += (hp - rt.head[0]) * Math.min(1, dt * 4); rt.head[1] += (hy - rt.head[1]) * Math.min(1, dt * 4);
    rt.leg += ((moving ? 1 : 0) - rt.leg) * Math.min(1, dt * 6);
    const walkClip = rt.carry === 'phone' && CLIPS.texting_and_walking ? 'texting_and_walking' : CLIPS.walking ? 'walking' : '';
    if (rt.leg > 0.01 && !walkClip) { // the walk, by hand when there is no recorded one: legs, rolling feet, swaying hips, counter-turning shoulders, loose bent arms, a slight lean
      const a = rt.leg, ph = rt.phase, sw = Math.sin(ph), cw = Math.cos(ph);
      CUR.leftUpperLeg[0] += -0.52 * sw * a; CUR.rightUpperLeg[0] += 0.52 * sw * a;
      CUR.leftLowerLeg[0] += 0.85 * Math.max(0, cw) * a; CUR.rightLowerLeg[0] += 0.85 * Math.max(0, -cw) * a;
      CUR.leftFoot[0] += (0.3 * Math.max(0, -sw) - 0.22 * Math.max(0, sw)) * a; CUR.rightFoot[0] += (0.3 * Math.max(0, sw) - 0.22 * Math.max(0, -sw)) * a;
      CUR.hips[1] += -0.07 * sw * a; CUR.hips[2] += 0.045 * cw * a; CUR.spine[1] += 0.11 * sw * a; CUR.spine[2] += -0.04 * cw * a; CUR.spine[0] += 0.05 * a;
      CUR.leftUpperArm[0] += 0.42 * sw * a; CUR.rightUpperArm[0] += -0.42 * sw * a * (1 - rt.hold);
      CUR.leftLowerArm[1] += (-0.22 - 0.18 * Math.max(0, -sw)) * a; CUR.rightLowerArm[1] += (0.22 + 0.18 * Math.max(0, sw)) * a * (1 - rt.hold);
    }
    if (rt.sneak && k > 0.5) { CUR.spine[0] += 0.26; CUR.leftUpperLeg[0] -= 0.22; CUR.rightUpperLeg[0] -= 0.22; CUR.leftLowerLeg[0] += 0.4; CUR.rightLowerLeg[0] += 0.4; rt.head[1] = 0.45 * Math.sin(now / 520); } // tiptoeing: bent low, head on a swivel
    if (rt.glow === 'tipsy' && k > 0.5) { const wob = Math.sin(now / 430); CUR.hips[2] += 0.07 * wob; CUR.spine[2] -= 0.09 * wob; }                // not quite a straight line
    if (k > 0.98 && rt.leg < 0.5 && !CLIPS.idle) { const sway = Math.sin(now / 1400) * (1 - rt.leg * 2); CUR.hips[2] += 0.035 * sway; CUR.spine[2] -= 0.03 * sway; CUR.leftUpperLeg[2] -= 0.03 * sway; CUR.rightUpperLeg[2] -= 0.03 * sway; } // standing still: shifting her weight
    for (const n of KEYS) set(n, CUR[n][0], CUR[n][1], CUR[n][2]);
    // recorded motion over the top, once she is on her feet: standing idle, talking with her hands, walking
    rt.talkW += ((s.talking && k > 0.9 && !moving ? 1 : 0) - rt.talkW) * Math.min(1, dt * 3);
    rt.lie += Math.sign(rt.lieWant - rt.lie) * Math.min(Math.abs(rt.lieWant - rt.lie), dt * 0.55); const lie = ease(rt.lie);
    const busyArms = Math.min(1, Math.max(rt.ov.read, rt.ov.phone, rt.ov.sip) * 1.5); for (const [c, wgt] of seatClips) playClip(c, wgt, 0, n => ARM.test(n) ? busyArms : 0);
    if (k > 0.02) {
      const holdArm = n => WALK_ARM[n] ? Math.min(1, rt.hold * 2) : 0;
      playClip('idle', k * (1 - rt.leg) * (1 - lie), now / 1000, holdArm); playClip('talking', k * rt.talkW * (1 - rt.leg) * (1 - lie), now / 1000, holdArm);
      if (walkClip) { if (moving) rt.walkT += (rt.walkSp || 0.6) * dt / stride(CLIPS[walkClip]) * CLIPS[walkClip].dur; playClip(walkClip, k * rt.leg, rt.walkT, walkClip === 'walking' ? holdArm : null); }
      if (rt.scriptClip) { if (now > rt.scriptUntil) rt.scriptClip = null; else playClip(rt.scriptClip, k * Math.min(1, (now - rt.scriptFrom) / 300, (rt.scriptUntil - now) / 300), (now - rt.scriptFrom) / 1000); }
      if (lie > 0.003) playClip(rt.liePose || 'female_laying_pose', lie, 0);
    }
    const bob = walkClip ? 0 : 0.026 * Math.abs(Math.cos(rt.phase)) * rt.leg * k, bed = rt.lieAt ? { at: [rt.lieAt.x, rt.lieAt.z], top: rt.lieAt.y } : places.bed, lieYaw = rt.lieAt ? rt.lieAt.yaw : -Math.PI / 2, turn = Math.atan2(Math.sin(lieYaw - rt.yaw), Math.cos(lieYaw - rt.yaw));
    vrm.scene.position.set(rt.x * k + slide + (bed.at[0] - rt.x) * lie, floorY * k + bob + perch + (bed.top - floorY) * lie, (ka - k) * 0.05 + rt.z * k + scoot + (bed.at[1] - rt.z) * lie);
    vrm.scene.rotation.y = (rt.yaw + turn * lie) * k + sideways;
    rt.zoom = 0.3 * k;
  }
  // ---- keeping it smooth: if the picture runs slow for a few seconds, give up the costly extras one at a time (the flame's own
  // shadows, then a smaller shadow picture, then shadows altogether, then a lower resolution). It does not climb back by itself.
  const q = { last: 0, slow: 0, n: 0, level: 0, at: 0 };
  function quality(now) { const ms = now - (q.last || now); q.last = now; if (ms <= 0 || ms > 1000 || document.hidden) return; q.n++; if (ms > 45) q.slow++;
    if (now - q.at < 4000) return; const bad = q.n > 20 && q.slow / q.n > 0.6; q.at = now; q.n = q.slow = 0; if (!bad || q.level >= 4) return; q.level++;
    if (q.level === 1) { for (const k in places.groups) places.groups[k].traverse(o => { if (o.isPointLight && o.castShadow) { o.castShadow = false; if (o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } } }); }
    else if (q.level === 2) { sun.shadow.mapSize.set(512, 512); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    else if (q.level === 3) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    else renderer.setPixelRatio(1);
    window.dispatchEvent(new CustomEvent('wizra-quality', { detail: q.level })); }
  // ---- a storm is dark, and now and then it takes the power: every lamp and screen dies and only lightning, candles and fires are left
  const storm = { until: 0, next: 0, was: 0, flashing: false };
  const regloom = () => { gloom = !places.power ? 0.93 : ({ stormy: 0.7, rainy: 0.3, cloudy: 0.14, foggy: 0.12, snowy: 0.05 }[places.sky] || 0); daylight(); };
  function power(on, ms) { on = !!on; if (on === places.power) return; places.setPower(on); if (!on) { storm.until = performance.now() + (ms || 45000 + Math.random() * 70000); lampLight.intensity = 0; } else storm.next = performance.now() + 60000 + Math.random() * 120000;
    (el.closest('#stage') || el).dataset.power = on ? '' : 'out'; regloom(); snd(on ? 'powerup' : 'powerdown'); window.dispatchEvent(new CustomEvent('wizra-power', { detail: on })); }
  function stormTick(now) {
    const fl = places.flash; if (fl >= 1 && storm.was < 1) { snd('thunder'); if (places.power && !inCall && !places.outdoor[here] && now > storm.next && Math.random() < 0.2) power(false); } storm.was = fl;
    if (!places.power && now > storm.until) power(true);
    if (fl > 0 && !inCall) { storm.flashing = true; sun.position.set(-3.5, 6, -7); sun.intensity = 0.4 + fl * 5.5; sun.color.set('#cfdcff'); }   // lightning: for an instant the light comes from the windows and throws long shadows at you
    else if (storm.flashing) { storm.flashing = false; daylight(); }
    bolt.intensity = fl * 1.1;
  }
  function lampTick(dt) { const want = places.power && !cinema && (lampOn === null ? night > 0.45 || gloom > 0.5 : lampOn) ? 1 : 0; lampLight.intensity += (want * 1.4 - lampLight.intensity) * Math.min(1, dt * 4); shade.material.color.setRGB(0.42 + 0.58 * lampLight.intensity / 1.4, 0.36 + 0.49 * lampLight.intensity / 1.4, 0.32 + 0.31 * lampLight.intensity / 1.4); }
  // ---- tap to direct: you tap a thing in her room, she goes and deals with it ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(pickable, false)[0];
    return hit ? { tag: hit.object.userData.tag, x: hit.point.x, z: hit.point.z } : null;
  }
  function direct(hit) { // returns what happened, in the words used for the silent note to her (or '' if nothing did)
    const t = hit.tag; if (inCall || focusWant > 0) return ''; rt.self = false;
    if (fp.on) { // you are in the room: the floor is where you walk, the seat is where you sit, the TV is yours to switch on
      if (fp.locked) return '';
      if (t === 'floor') { standUp(); fp.goal = [hit.x, hit.z]; return ''; }
      const seat = places.seat[here]; if (seat && t === seat.tag && (here === 'house' || rt.act !== 'up')) { fp.goal = null; fp.sit = seat; fp.x = seat.at[0]; fp.z = seat.at[1]; snd('sit'); return here === 'house' ? 'yousit' : 'yousitbed'; }
      if (t === 'tv') { places.tv.on = !places.tv.on; snd('tv'); return places.tv.on ? 'tvon' : 'tvoff'; }
    }
    if (rt.act === 'gone' || rt.leaving) return t === 'lamp' ? (lampOn = !(lampLight.intensity > 0.7), snd('click'), '') : '';
    if (t === 'lamp') { lampOn = !(lampLight.intensity > 0.7); snd('click'); return ''; }
    if (t === 'shelf') { const had = rt.bookHome === 'table'; startActivity(had ? 'returnbook' : 'fetchbook'); return 'pointshelf'; }
    if (t === 'counter') { startActivity('fetchdrink'); return 'pointcounter'; }
    if (t === 'chair') { if (rt.act !== 'up') return ''; startActivity('sit'); return 'pointchair'; }
    if (t === 'book' || (t === 'table' && rt.bookHome === 'table' && rt.act === 'sit')) { startActivity('read'); return 'pointbook'; }
    if (t === 'phone') { startActivity('phone'); return 'pointphone'; }
    if (t === 'mug') { startActivity('sip'); return 'pointmug'; }
    if (t === 'floor') {
      const x = hit.x, z = hit.z, blocked = !walkable(x, z);
      if (blocked || rt.act === 'sitdown') return '';
      if (OVER[rt.act]) rt.act = 'sit';
      if (rt.act === 'up') { rt.steps = [...wayTo(x, z), stay(7), run(() => { rt.steps.push(...wayHome()); })]; rt.i = 0; rt.label = 'standing where you pointed'; rt.after = ''; }
      else plan('walking over to where you pointed', [...wayTo(x, z), stay(7)]);
      return 'pointfloor';
    }
    return '';
  }
  // where a thing sits in her right hand, in the hand's own space (fingers run along -x, the palm faces -y, the thumb points +z): [offset, turn]
  const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
  const ATTACH = window.WIZRA_ATTACH || { sip: [[-0.07, -0.052, 0.005], basis([0, -1, 0], [0, 0, 1], [-1, 0, 0])], phone: [[-0.085, -0.024, 0], basis([0, 0, 1], [-1, 0, 0], [0, -1, 0])] };
  for (const k in ATTACH) if (Array.isArray(ATTACH[k][1])) ATTACH[k][1] = basis(...ATTACH[k][1]);
  const handN = B('rightHand'), handRaw = raw('rightHand');
  const tmpE = new THREE.Euler();
  function placeProps() { // after her bones are final for the frame: each prop is at rest, in her hands, or somewhere between
    head.getWorldPosition(headPos);
    for (const name in PROP) {
      const key = PROP_KEY[name], o = PROP[name], [rp, rr] = REST_AT[key === 'book' && rt.bookHome === 'shelf' ? 'bookShelf' : key];
      const held = Math.max(rt.ov[name] * 1.6, rt.carryW[key] || 0), wgt = Math.min(1, held), e = wgt * wgt * (3 - 2 * wgt), reading = name === 'read' && rt.ov.read > (rt.carryW.book || 0);
      if (ATTACH[name] && handN && handRaw) { // held properly: fixed in the hand, turning with it
        handN.getWorldQuaternion(tmpQ2); handRaw.getWorldPosition(tmpA); tmpA.add(tmpB.set(...ATTACH[name][0]).applyQuaternion(tmpQ2)); tmpQ2.multiply(ATTACH[name][1]);
        if (name === 'sip') { const yw = vrm.scene.rotation.y; tmpQ2.setFromEuler(tmpE.set(0.6 * Math.min(1, rt.ov.sip), yw + Math.PI, 0, 'YXZ')); tmpA.x += 0.05 * Math.cos(yw); tmpA.z -= 0.05 * Math.sin(yw); }   // a cup stays upright whatever her wrist does, and tips toward her when she drinks
        o.position.lerpVectors(rp, tmpA, e); tmpQ.setFromEuler(rr); o.quaternion.copy(tmpQ).slerp(tmpQ2, e); continue;
      }
      palmR.getWorldPosition(tmpA); if (reading) { palmL.getWorldPosition(tmpB); tmpA.add(tmpB).multiplyScalar(0.5); }
      tmpA.y += name === 'sip' ? 0.03 : 0.035;
      o.position.lerpVectors(rp, tmpA, e);
      tmpQ.setFromEuler(rr);
      if (e > 0.001) { o.lookAt(name === 'sip' ? tmpB.set(o.position.x, o.position.y, o.position.z + 1) : headPos); tmpQ2.copy(o.quaternion); o.quaternion.copy(tmpQ).slerp(tmpQ2, e); } else o.quaternion.copy(tmpQ);
    }
  }

  // ---- video call: she is somewhere else. Her room is hidden and a painted backdrop of where she really is goes behind her. ----
  // Each backdrop is drawn on a small canvas (no canvas filters: they crash some Android GPUs). light = [r, g, b, pulse].
  const bdCanvas = document.createElement('canvas'); bdCanvas.width = 384; bdCanvas.height = 704;
  const bdTex = new THREE.CanvasTexture(bdCanvas); bdTex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 2.6), new THREE.MeshBasicMaterial({ map: bdTex })); backdrop.visible = false; scene.add(backdrop);
  const BACKDROP = {
    classroom(c, W, H) { c.fillStyle = '#cfd3c8'; c.fillRect(0, 0, W, H); c.fillStyle = '#f4f4ee'; c.fillRect(30, 60, W - 60, 190); c.strokeStyle = '#8a8f86'; c.lineWidth = 6; c.strokeRect(30, 60, W - 60, 190);
      c.strokeStyle = '#3b6fb5'; c.lineWidth = 3; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(50, 95 + i * 30); c.lineTo(50 + 120 + (i * 53) % 150, 95 + i * 30); c.stroke(); }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(W - 60, 300, 26, 0, 7); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.moveTo(W - 60, 300); c.lineTo(W - 60, 282); c.moveTo(W - 60, 300); c.lineTo(W - 48, 306); c.stroke();
      c.fillStyle = '#7a6a55'; for (let r = 0; r < 4; r++) c.fillRect(0, 420 + r * 70, W, 26); c.fillStyle = '#4b5563'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(40 + i * 100, 400, 22, 0, 7); c.fill(); } return [1, 1, 0.97, 0]; },
    library(c, W, H) { c.fillStyle = '#3a2a1c'; c.fillRect(0, 0, W, H); const cols = ['#7a1f3a', '#2f4a7a', '#3d6b4f', '#8a6a2a', '#5b3570', '#a04a2a', '#2a6b78'];
      for (let r = 0; r < 6; r++) { c.fillStyle = '#2a1d14'; c.fillRect(0, 100 + r * 100, W, 12); let x = 6, n = 0; while (x < W - 10) { const wd = 14 + (r * 7 + n * 5) % 16, ht = 62 + (r * 3 + n * 11) % 24; c.fillStyle = cols[(r * 3 + n) % 7]; c.fillRect(x, 100 + r * 100 - ht, wd, ht); x += wd + 3; n++; } }
      c.fillStyle = 'rgba(255,214,150,.35)'; c.beginPath(); c.arc(W - 70, 40, 120, 0, 7); c.fill(); return [1, 0.9, 0.74, 0]; },
    cafe(c, W, H) { c.fillStyle = '#5a4033'; c.fillRect(0, 0, W, H); c.fillStyle = '#2a2a2a'; c.fillRect(20, 50, W - 40, 150); c.fillStyle = '#f2e6c8'; for (let i = 0; i < 5; i++) c.fillRect(40, 75 + i * 24, 90 + (i * 61) % 180, 6);
      c.fillStyle = '#c9ccd6'; c.fillRect(40, 300, 110, 130); c.fillStyle = '#8a8f9a'; c.fillRect(60, 330, 70, 40); c.fillStyle = '#e8e0d0'; for (let i = 0; i < 4; i++) c.fillRect(200 + i * 42, 380 - (i % 2) * 14, 30, 50); c.fillStyle = '#3b2a1c'; c.fillRect(0, 430, W, 30); return [1, 0.93, 0.82, 0]; },
    gamestore(c, W, H) { c.fillStyle = '#26303f'; c.fillRect(0, 0, W, H); const cols = ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c', '#a78bfa', '#ff8fc0'];
      for (let r = 0; r < 5; r++) { c.fillStyle = '#131922'; c.fillRect(0, 120 + r * 110, W, 10); for (let i = 0; i < 6; i++) { c.fillStyle = cols[(r * 2 + i) % 6]; c.fillRect(8 + i * 63, 120 + r * 110 - 78 - (i % 3) * 8, 54, 78 + (i % 3) * 8); c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(16 + i * 63, 120 + r * 110 - 60, 38, 8); } }
      c.fillStyle = '#ffd166'; c.beginPath(); c.moveTo(60, 0); c.lineTo(W - 60, 0); c.lineTo(W - 90, 34); c.lineTo(90, 34); c.fill(); return [0.95, 0.97, 1, 0]; },
    bar(c, W, H) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0b2e'); g.addColorStop(1, '#3a0f3f'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#12081f'; c.fillRect(0, 210, W, 14); c.fillRect(0, 320, W, 14); const b = ['#5ee7a0', '#ffd166', '#ff6fa5', '#7fd0ff', '#c79bff'];
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) { c.fillStyle = b[(i + r * 2) % 5]; c.globalAlpha = 0.85; c.fillRect(14 + i * 41, 210 + r * 110 - 62 - (i % 3) * 10, 18, 62 + (i % 3) * 10); c.fillRect(19 + i * 41, 210 + r * 110 - 80 - (i % 3) * 10, 8, 20); } c.globalAlpha = 1;
      c.strokeStyle = '#ff4fd8'; c.lineWidth = 9; c.shadowColor = '#ff4fd8'; c.shadowBlur = 0; c.beginPath(); c.moveTo(40, 70); c.lineTo(40, 30); c.lineTo(80, 30); c.lineTo(80, 70); c.lineTo(40, 70); c.moveTo(110, 30); c.lineTo(110, 70); c.moveTo(140, 70); c.lineTo(160, 30); c.lineTo(180, 70); c.moveTo(210, 30); c.lineTo(210, 70); c.moveTo(210, 30); c.lineTo(240, 40); c.lineTo(210, 50); c.lineTo(240, 70); c.stroke();
      for (const [x, y, col] of [[70, 480, '#ff4fd8'], [300, 420, '#4fd8ff'], [200, 600, '#ffd166']]) { c.fillStyle = col; c.globalAlpha = 0.22; c.beginPath(); c.arc(x, y, 90, 0, 7); c.fill(); } c.globalAlpha = 1; return [1, 0.55, 0.9, 1]; },
    rooftop(c, W, H) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#2a2350'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % W, (i * 53) % 260, 2, 2);
      c.fillStyle = '#f5f0d0'; c.beginPath(); c.arc(W - 70, 80, 30, 0, 7); c.fill(); for (let i = 0; i < 8; i++) { const h = 150 + (i * 67) % 190; c.fillStyle = '#141833'; c.fillRect(i * 50 - 6, H - 240 - h, 46, h + 240); c.fillStyle = '#ffd98a'; for (let y = 0; y < h - 20; y += 26) for (let x = 0; x < 2; x++) if ((i + y + x) % 3) c.fillRect(i * 50 + 2 + x * 18, H - 232 - h + y, 9, 12); }
      c.strokeStyle = '#0a0a0a'; c.lineWidth = 8; for (let x = 0; x <= W; x += 48) { c.beginPath(); c.moveTo(x, H - 250); c.lineTo(x, H); c.stroke(); } c.beginPath(); c.moveTo(0, H - 250); c.lineTo(W, H - 250); c.stroke(); return [0.72, 0.78, 1, 0]; },
    bedroom(c, W, H) { c.fillStyle = '#16131f'; c.fillRect(0, 0, W, H); c.fillStyle = '#231d33'; c.fillRect(0, 330, W, H); c.fillStyle = '#2f2745'; c.fillRect(20, 250, W - 40, 150);
      c.fillStyle = '#3d3358'; c.beginPath(); c.ellipse(110, 400, 100, 44, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(290, 410, 90, 40, 0, 0, 7); c.fill(); c.fillStyle = '#1d2a4a'; c.fillRect(W - 130, 40, 100, 150); c.fillStyle = '#c9d6ff'; c.beginPath(); c.arc(W - 70, 90, 16, 0, 7); c.fill();
      c.fillStyle = '#ffd98a'; for (let i = 0; i < 9; i++) { c.globalAlpha = 0.8; c.beginPath(); c.arc(20 + i * 30, 60 + Math.sin(i) * 14, 4, 0, 7); c.fill(); } c.globalAlpha = 1; return [0.5, 0.52, 0.75, 0]; },
    car(c, W, H) { c.fillStyle = '#17181d'; c.fillRect(0, 0, W, H); c.fillStyle = '#2d3a55'; c.beginPath(); c.moveTo(0, 60); c.lineTo(150, 40); c.lineTo(150, 330); c.lineTo(0, 360); c.fill(); c.beginPath(); c.moveTo(W, 60); c.lineTo(W - 150, 40); c.lineTo(W - 150, 330); c.lineTo(W, 360); c.fill();
      c.fillStyle = '#ffb347'; c.globalAlpha = 0.5; c.beginPath(); c.arc(60, 150, 26, 0, 7); c.fill(); c.globalAlpha = 1; c.fillStyle = '#26272e'; c.fillRect(110, 150, W - 220, H); c.fillStyle = '#34353e'; c.beginPath(); c.ellipse(W / 2, 130, 86, 70, 0, 0, 7); c.fill(); c.fillStyle = '#0e0e12'; c.fillRect(0, 0, W, 34); return [0.62, 0.66, 0.8, 0]; },
    street(c, W, H) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fb2e5'); g.addColorStop(1, '#dfe9f3'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#b7a48f'; c.fillRect(0, 150, 150, H); c.fillStyle = '#8f7d6a'; c.fillRect(230, 90, 160, H);
      c.fillStyle = '#5f6b7a'; for (let y = 190; y < 520; y += 70) { c.fillRect(20, y, 40, 46); c.fillRect(86, y, 40, 46); c.fillRect(256, y - 40, 44, 50); c.fillRect(320, y - 40, 44, 50); } c.fillStyle = '#3d7a3f'; c.beginPath(); c.arc(190, 330, 46, 0, 7); c.fill(); c.fillStyle = '#5b4632'; c.fillRect(184, 360, 12, 200); c.fillStyle = '#8b8f96'; c.fillRect(0, 560, W, H); return [1, 1, 1, 0]; },
  };
  const callLight = [1, 1, 1, 0]; let roomObjs = null, inCall = false;
  function callShow() { if (inCall) rt.panAt = performance.now(); }   // she turns the phone to show where she is
  function call(on, sceneName) {
    rt.panAt = 0; bdTex.repeat.set(1, 1); bdTex.offset.set(0, 0);
    if (!roomObjs) roomObjs = scene.children.filter(o => o !== vrm.scene && o !== backdrop && o !== target && !o.isLight);
    inCall = !!on; for (const o of roomObjs) o.visible = !on; if (!on) setPlace(here); backdrop.visible = !!on; lampLight.visible = !on;
    if (on) {
      const c = bdCanvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.clearRect(0, 0, 384, 704);
      const l = (BACKDROP[sceneName] || BACKDROP.street)(c, 384, 704); callLight.splice(0, 4, ...l); bdTex.needsUpdate = true;
      for (const n of KEYS) { const q = standOf(n); CUR[n][0] = q[0]; CUR[n][1] = q[1]; CUR[n][2] = q[2]; }
      Object.assign(rt, { act: 'call', stand: 0, k: 0, leg: 0, leaving: false, sneak: false, carry: null });
      vrm.scene.visible = true; vrm.scene.position.set(0, 0, 0); vrm.scene.rotation.y = 0; if (vrm.springBoneManager) vrm.springBoneManager.reset();
      daylight(); el.style.background = '#000'; camera.fov = 40; camera.updateProjectionMatrix();
    } else { camera.fov = 26; camera.updateProjectionMatrix(); daylight(); vanish(); }
  }
  function callFrame(s) { // on a call: standing, a little handheld sway; the light is the place she is in
    for (const n of KEYS) set(n, CUR[n][0], CUR[n][1], CUR[n][2]);
    rt.talkW += ((s.talking ? 1 : 0) - rt.talkW) * Math.min(1, s.dt * 3); playClip('idle', 1, s.t / 1000); playClip('talking', rt.talkW, s.t / 1000);   // standing naturally, hands moving when she talks
    const t = s.t / 1000, p = callLight[3] ? 0.5 + 0.5 * Math.sin(t * 2.3) : 0;
    sun.intensity = Math.PI * (callLight[3] ? 0.75 : 0.9); sun.color.setRGB(callLight[0] - 0.45 * p * callLight[3], callLight[1] + 0.25 * p * callLight[3], callLight[2]); amb.intensity = 0.35;
    // She holds the phone the way people do: close, a little above her eyes, so her face fills the picture and not much of
    // the place shows. When she shows you around (callShow) she turns the phone away from herself and sweeps it over the place.
    const pan = rt.panAt ? Math.min(1, (performance.now() - rt.panAt) / 9000) : 1, w = pan < 1 ? Math.min(1, pan / 0.16, (1 - pan) / 0.16) : 0, e = w * w * (3 - 2 * w), sweep = pan < 1 ? Math.sin((pan - 0.16) / 0.68 * Math.PI * 2) * 0.5 : 0;
    if (pan >= 1) rt.panAt = 0;
    const sway = 0.012 * Math.sin(t * 0.9) + 0.006 * Math.sin(t * 2.1), fx = eye.x + 0.03, fy = eye.y - 0.045;
    const lx = fx + e * 1.25, bx = lx + 0.1 * (1 - e);                             // where the phone points, and the middle of what is behind
    backdrop.position.set(bx, fy - 0.1, eye.z - 1.05); bdTex.repeat.set(1 - 0.45 * e, 1 - 0.45 * e); bdTex.offset.set((0.225 + 0.2 * sweep) * e, 0.3 * e);
    camera.position.set(fx + 0.05 + sway + e * 0.5, fy + 0.07 + 0.008 * Math.sin(t * 1.3), eye.z + 0.6 - e * 0.15);
    camera.lookAt(lx + e * 0.05 * Math.sin(t * 0.7), fy + 0.004 * Math.sin(t * 1.7) - e * 0.05, eye.z - e * 1.05);
  }

  // camera: zoom 0 frames her face (the eye line is the centre of "puppet space", see avatar.js); zoom 1 swings round to
  // the side and pulls back to show all of her. Zoom only applies in the enlarged view.
  const eye = new THREE.Vector3(); head.getWorldPosition(eye);
  if (vrm.lookAt && vrm.lookAt.offsetFromHeadBone) eye.add(vrm.lookAt.offsetFromHeadBone.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()))); else eye.y += 0.07;
  const eyeUp = eye.y - wp('head').y;
  const near = new THREE.Vector3(0, eye.y - 0.035, eye.z), far = new THREE.Vector3(0, (eye.y + floorY) / 2 + 0.05, (hip.z + feet.z) / 2);
  let zoomWant = Number(localStorage.getItem('brenai.zoom')) || 0, zoom = 0, camYaw = 0;
  const aim = new THREE.Vector3();
  // ---- visiting: you are in the room with her and see it through your own eyes. Drag to look, tap the floor (or WASD) to walk. ----
  const fp = { on: false, x: 0, z: 0, yaw: 0, pitch: 0, cx: 0, cz: 0, ch: places.eyeH, goal: null, sit: null, keys: new Set(), bob: 0 }; if (window.WIZRA_STILL) window.WIZRA_T = { fp, vrm, cloth };   /* test hook: lets a headless check place the first-person camera */
  let here = 'dorm', pickable = [], faceYaw = 0, facePitch = 0; daylight();
  const mugDorm = REST_AT.mug[0].clone();
  function setPlace(name) {
    here = places.groups[name] ? name : 'dorm'; for (const k in places.groups) places.groups[k].visible = k === here; room.visible = here !== 'house' && !places.bare[here]; lampLight.visible = room.visible || here === 'house'; mood = places.dark[here] || 0; daylight();   // (her own furniture is in every room but your house)
    pickable = tagged.filter(o => !o.userData.place || o.userData.place === here);
    REST_AT.mug[0].copy(here === 'house' ? places.mugAt : mugDorm); lampLight.position.copy(here === 'house' ? places.lampAt : shade.position);
  }
  setPlace('dorm');
  const seatHer = () => { if (rt.act === 'gone') return; if (rt.leaving) return vanish(); vanish(); rt.act = 'sit'; rt.nextAt = performance.now() + 15000; vrm.scene.visible = true; if (vrm.springBoneManager) vrm.springBoneManager.reset(); };
  function visit(name) { // 'dorm' or 'house' = you are there in person; '' = back to seeing her from afar, in her own room
    if (inCall) return;
    if (!name) { const was = here; fp.on = false; fp.keys.clear(); places.tv.on = false; setPlace('dorm'); if (was !== 'dorm') seatHer(); camera.fov = 26; camera.updateProjectionMatrix(); return; }
    if (name !== here) { const sameSeat = name !== 'house' && here !== 'house'; setPlace(name); if (!sameSeat) seatHer(); }
    let [x, z] = places.spawn[here];
    // where you walk in: the usual spot if there is room round it, else the most open floor nearby (things placed in a room can box the door in)
    const open = (px, pz) => { if (!free(px, pz)) return -1; let n = 0; for (let i = 0; i < 16; i++) { const rr = i < 8 ? 0.6 : 1.2, a = i * Math.PI / 4 + (i < 8 ? 0 : 0.39); if (free(px + Math.cos(a) * rr, pz + Math.sin(a) * rr)) n++; } return n; };
    if (open(x, z) < 15) { const b = places.bounds[here], sx = x, sz = z; let best = open(x, z) - 0.001;
      for (let gx = b.x0 + 0.4; gx <= b.x1 - 0.4; gx += 0.35) for (let gz = b.z0 + 0.4; gz <= b.z1 - 0.4; gz += 0.35) { const sc = open(gx, gz); if (sc < 0) continue; const v = sc - 0.9 * Math.hypot(gx - sx, gz - sz) - (Math.hypot(gx - rt.x, gz - rt.z) < 1 ? 6 : 0); if (v > best) { best = v; x = gx; z = gz; } } }
    Object.assign(fp, { on: true, x, z, cx: x, cz: z, ch: places.eyeH, goal: null, sit: null, pitch: -0.06, yaw: Math.atan2(-x, hip.z + 0.3 - z) });
    camera.fov = 62; camera.updateProjectionMatrix();
  }
  const standUp = () => { if (fp.sit) { fp.x = fp.sit.out[0]; fp.z = fp.sit.out[1]; fp.sit = null; } };
  const free = (x, z) => {
    const b = places.bounds[here], m = 0.3; if (x < b.x0 + m || x > b.x1 - m || z < b.z0 + m || z > b.z1 - m) return false;
    for (const [x0, x1, z0, z1] of places.blocks[here]) if (x > x0 - 0.14 && x < x1 + 0.14 && z > z0 - 0.14 && z < z1 + 0.14) return false;
    return !(vrm.scene.visible && rt.k > 0.5 && Math.hypot(x - rt.x, z - rt.z) < 0.5);   // not through her either
  };
  const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  const typing = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
  const keyDown = e => { if (!fp.on || typing() || e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key.toLowerCase(); if (MOVE.has(k)) { fp.keys.add(k); e.preventDefault(); } };
  const keyUp = e => fp.keys.delete(String(e.key).toLowerCase()), keysOff = () => fp.keys.clear();
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', keysOff);
  function walkYou(dt) {
    { const nowT = performance.now(); dt = Math.min(0.3, (nowT - (fp.t || nowT)) / 1000) || dt; fp.t = nowT; }   // your own walking goes by the real clock: on a slow frame rate you take bigger steps, not slower ones
    if (window.WIZRA_YOU) { fp.x = hip.x + window.WIZRA_YOU[0]; fp.z = hip.z + window.WIZRA_YOU[1]; } // test hook: stand you somewhere, measured from her seat
    if (fp.locked) { fp.keys.clear(); fp.goal = null; }                            // the heart game holds you still
    const K = fp.keys, f = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0), sd = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
    fp.yaw -= ((K.has('arrowright') ? 1 : 0) - (K.has('arrowleft') ? 1 : 0)) * dt * 1.9;
    let mx = 0, mz = 0; const fx = Math.sin(fp.yaw), fz = Math.cos(fp.yaw);
    if (f || sd) { fp.goal = null; standUp(); mx = fx * f - fz * sd; mz = fz * f + fx * sd; }
    else if (fp.goal) { const dx = fp.goal[0] - fp.x, dz = fp.goal[1] - fp.z, d = Math.hypot(dx, dz); if (d < 0.08) fp.goal = null; else { mx = dx / d; mz = dz / d; } }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      for (let n = Math.ceil(dt / 0.04), i = 0; i < n; i++) { const st = 1.45 * dt / n / len, nx = fp.x + mx * st, nz = fp.z + mz * st;   // in small steps, so a big one cannot jump through a wall
        if (free(nx, nz)) { fp.x = nx; fp.z = nz; } else if (free(nx, fp.z) && Math.abs(mx) > 0.2 * len) fp.x = nx; else if (free(fp.x, nz) && Math.abs(mz) > 0.2 * len) fp.z = nz; else { fp.goal = null; break; } }
      const was = Math.floor(fp.bob / Math.PI); fp.bob += dt * 9; if (Math.floor(fp.bob / Math.PI) !== was) snd('step');
    }
    const k = Math.min(1, dt * (fp.sit ? 4 : 10)); fp.cx += (fp.x - fp.cx) * k; fp.cz += (fp.z - fp.cz) * k;
    fp.ch += ((fp.sit ? fp.sit.h : places.eyeH) - fp.ch) * Math.min(1, dt * 4);
    const cp = Math.cos(fp.pitch); camera.position.set(fp.cx, fp.ch + (len > 0.01 ? 0.012 * Math.sin(fp.bob) : 0), fp.cz);
    aim.set(fp.cx + Math.sin(fp.yaw) * cp, camera.position.y + Math.sin(fp.pitch), fp.cz + Math.cos(fp.yaw) * cp); camera.lookAt(aim);
  }
  function placeCamera(dt) {
    if (inCall) return;                                                          // the call frames her itself
    if (window.WIZRA_CAM) { const c = window.WIZRA_CAM; camera.position.set(hip.x + c[0], hip.y + c[1], hip.z + c[2]); camera.lookAt(hip.x + c[3], hip.y + c[4], hip.z + c[5]); if (fp.on) { const keep = camera.position.clone(), q = camera.quaternion.clone(); walkYou(dt); camera.position.copy(keep); camera.quaternion.copy(q); } return; } // test hook: a fixed camera, measured from her hips
    if (fp.on) return walkYou(dt);
    const want = Math.max(document.body.classList.contains('big') ? zoomWant : 0, gestureZoom, rt.zoom);
    zoom += (want - zoom) * Math.min(1, dt * 6);
    const e = zoom * zoom * (3 - 2 * zoom); camYaw = 0.95 * Math.min(1, e * 2.4); const up = rt.k || 0; // on her feet: pull back, lift and follow her so she stays in view
    const lift = 0.14 * e + 0.3 * Math.sin(Math.PI * e), dist = 0.78 + 2.7 * e + 1.7 * e * up;
    aim.lerpVectors(near, far, e); aim.y += 0.32 * e * up; aim.x += rt.x * 0.55 * e * up; aim.z += (rt.z - far.z) * 0.4 * e * up;
    camera.position.set(aim.x + dist * Math.sin(camYaw) * Math.cos(lift), aim.y + dist * Math.sin(lift), aim.z + dist * Math.cos(camYaw) * Math.cos(lift));
    camera.lookAt(aim);
  }
  // ---- the heart game's camera. While it is on you cannot move or look: the view goes straight in front of her, then drifts
  // slowly and cuts to a new angle with every heart (her face, a shoulder, her hand...), a little closer each time, until the
  // last one puts it right up against her heart. hc.b blends between the ordinary view and this one at the start and the end.
  // ---- the beach round of the heart game. bh.view picks one of BVIEW: close views of her at different heights and from different sides, each
  // following her as she runs. `side` is the angle round her from straight ahead (0 = in front of her, PI/2 = on her sea side... measured toward her left).
  // While paused the view can be dragged round (bh.oy, bh.op, bh.od); taking the pause off puts it back.
  const BEACH_RUNS = ['female_run', 'slow_run', 'running', 'jogging'];   /* recorded runs in the clip library, best first; without any, the hand-made beach_run */
  // ---- the water fight. waterShot(x, y): a jet of water from the bottom corner of the screen to the point under the pointer; if it reaches her, a splash there,
  // and she gets wetter. Wet, she shines (a bright rim on every part of her outfit and skin, MToon's rim light), and dries off slowly after.
  const WF = { shine: new THREE.Color(0.85, 0.92, 1), wet: 0, drops: null, dp: [], n: 0, mats: null, ray: new THREE.Raycaster(), at: new THREE.Vector3(), m4: new THREE.Matrix4(), q: new THREE.Quaternion(), sc: new THREE.Vector3(), from: new THREE.Vector3() };
  function wfInit() { if (WF.drops) return; const N = 360; WF.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.85 }), N); WF.drops.frustumCulled = false; WF.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < N; i++) { WF.dp.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, s: 0, g: 0 }); WF.m4.makeScale(0, 0, 0); WF.drops.setMatrixAt(i, WF.m4); } scene.add(WF.drops);
    WF.mats = []; vrm.scene.traverse(o => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && 'parametricRimColorFactor' in m && !WF.mats.some(e => e.m === m)) WF.mats.push({ m, c: m.parametricRimColorFactor.clone(), p: m.parametricRimFresnelPowerFactor, l: m.parametricRimLiftFactor, x: m.rimLightingMixFactor }); }); }
  const wfDrop = (p, v, life, size, grav) => { const d = WF.dp[WF.n++ % WF.dp.length]; d.p.copy(p); d.v.copy(v); d.life = life; d.s = size; d.g = grav; };
  function waterTick(dt) { if (!WF.drops) return; for (let i = 0; i < WF.dp.length; i++) { const d = WF.dp[i]; if (d.life <= 0) continue; d.life -= dt; d.v.y -= d.g * dt; d.p.addScaledVector(d.v, dt); const k = d.life <= 0 || d.p.y < floorY ? 0 : d.s; if (!k) d.life = 0; WF.sc.set(k, k, k); WF.m4.compose(d.p, WF.q, WF.sc); WF.drops.setMatrixAt(i, WF.m4); } WF.drops.instanceMatrix.needsUpdate = true;
    if (WF.wet > 0) { WF.wet = Math.max(0, WF.wet - dt / 90); const w = WF.wet; for (const e of WF.mats) { e.m.parametricRimColorFactor.copy(e.c).lerp(WF.shine, Math.min(1, w * 0.9)); e.m.parametricRimFresnelPowerFactor = e.p + (2.2 - e.p) * w; e.m.parametricRimLiftFactor = e.l + 0.12 * w; e.m.rimLightingMixFactor = e.x + (1 - e.x) * w; } } }   /* wet she shines; she dries in about a minute and a half */
  const bhOutT = () => window.WIZRA_OUTRO_T != null ? +window.WIZRA_OUTRO_T : (performance.now() - bh.outro) / 1000;   /* seconds into the goodbye (WIZRA_OUTRO_T holds it at a moment, for tests) */
  const bhFeet = [new THREE.Vector3(), new THREE.Vector3()], bhV = new THREE.Vector3(), bhV2 = new THREE.Vector3(), bhQ1 = new THREE.Quaternion(), bhQ2 = new THREE.Quaternion(); let bhUp = 0; let beach = null; const bh = { on: false, pose: false, paused: false, t: 0, x: 0, view: 0, since: 0, oy: 0, op: 0, od: 0, tgt: new THREE.Vector3(), has: false, fov: 0 };
  const BVIEW = [{ at: 'head', side: 0.5, up: 0.06, d: 0.95, dy: 0.02 }, { at: 'upperChest', side: -1.25, up: 0.1, d: 1.3, dy: 0.08 }, { at: 'leftLowerLeg', side: -1.45, up: 0.06, d: 1.0, dy: -0.16 }, { at: 'head', side: -0.4, up: -0.08, d: 0.8, dy: 0 },
    { at: 'spine', side: -1.1, up: 0.14, d: 1.25, dy: 0.12 }, { at: 'leftFoot', side: -0.9, up: 0.16, d: 0.9, dy: 0.06 }, { at: 'upperChest', side: 2.75, up: 0.18, d: 1.3, dy: 0.14 }, { at: 'hips', side: -0.5, up: 0.1, d: 3.1, dy: 0.2 },
    { at: 'rightHand', side: -0.9, up: 0.2, d: 0.85, dy: 0.05 }, { at: 'head', side: -1.5, up: 0.04, d: 0.9, dy: 0 }, { at: 'rightLowerLeg', side: 1.3, up: 0.1, d: 1.0, dy: -0.16 }, { at: 'chest', side: 0.0, up: 0.08, d: 1.5, dy: 0.1 }, { at: 'hips', side: -2.6, up: 0.3, d: 2.6, dy: 0.3 }, { at: 'head', side: -0.9, up: 0.5, d: 1.6, dy: -0.05 }];
  // ---- the two games on the dry sand. Here she holds a pose (lying on her back, on her front propped on her elbows with her feet up, or sitting in a beach
  // chair) and time for her body stands still, so a hand or foot that has been dragged somewhere stays there. BPTS are the spots on her that the games watch:
  // each is a point between two joints. `on` says which games use it: s = may be buried in sand, f = takes sunscreen when she faces up (or sits), b = takes
  // sunscreen when she lies on her front. Her chest, hips and thighs take sand but are left out of the sunscreen game (her swimsuit covers what it covers).
  const BPTS = [['face', 'neck', 'head', 1.7, 'f'], ['neck', 'neck', 'head', 0.2, 'b'], ['lShoulder', 'leftUpperArm', 'leftLowerArm', 0.05, 'sfb'], ['rShoulder', 'rightUpperArm', 'rightLowerArm', 0.05, 'sfb'], ['lArm', 'leftUpperArm', 'leftLowerArm', 0.55, 'sfb'], ['rArm', 'rightUpperArm', 'rightLowerArm', 0.55, 'sfb'],
    ['lForearm', 'leftLowerArm', 'leftHand', 0.5, 'sfb'], ['rForearm', 'rightLowerArm', 'rightHand', 0.5, 'sfb'], ['lHand', 'leftLowerArm', 'leftHand', 1.1, 'sfb'], ['rHand', 'rightLowerArm', 'rightHand', 1.1, 'sfb'], ['upper', 'spine', 'neck', 0.72, 'sb'], ['middle', 'spine', 'neck', 0.3, 'sfb'], ['hips', 'hips', 'spine', 0, 's'],
    ['lThigh', 'leftUpperLeg', 'leftLowerLeg', 0.5, 's'], ['rThigh', 'rightUpperLeg', 'rightLowerLeg', 0.5, 's'], ['lKnee', 'leftUpperLeg', 'leftLowerLeg', 1, 'sf'], ['rKnee', 'rightUpperLeg', 'rightLowerLeg', 1, 'sf'], ['lShin', 'leftLowerLeg', 'leftFoot', 0.5, 'sfb'], ['rShin', 'rightLowerLeg', 'rightFoot', 0.5, 'sfb'], ['lFoot', 'leftLowerLeg', 'leftFoot', 1.05, 'sfb'], ['rFoot', 'rightLowerLeg', 'rightFoot', 1.05, 'sfb']];
  const bg = { pts: BPTS.map(([id, a, b, t, on]) => ({ id, a, b, t, on, p: new THREE.Vector3(), cover: 0, burn: 0, goo: 0, lit: false, cream: null, red: null })), side: 'f', done: {}, cam: { yaw: 0.5, pitch: 0.75, dist: 3.3 }, tex: null, blinkAt: 0, hurt: 0, glad: 0, zone: 0, thick: 0.6, blobs: [], ray: new THREE.Raycaster(), look: new THREE.Vector3(), has: false };
  // the sunscreen game looks at one part of her at a time. Each side of her has its parts in order; a part is a list of the spots in it.
  const SUNZ = { b: [['Shoulders', ['neck', 'lShoulder', 'rShoulder', 'upper']], ['Arms', ['lArm', 'rArm', 'lForearm', 'rForearm', 'lHand', 'rHand']], ['Back', ['middle']], ['Legs', ['lShin', 'rShin', 'lFoot', 'rFoot']]],
    f: [['Face and shoulders', ['face', 'lShoulder', 'rShoulder']], ['Arms', ['lArm', 'rArm', 'lForearm', 'rForearm', 'lHand', 'rHand']], ['Tummy', ['middle']], ['Legs', ['lKnee', 'rKnee', 'lShin', 'rShin', 'lFoot', 'rFoot']]] };
  const bgZone = () => (SUNZ[bg.side] || SUNZ.f)[bg.zone % (SUNZ[bg.side] || SUNZ.f).length], bgIn = pt => bgZone()[1].includes(pt.id);
  // the body as a row of balls along her limbs: [joint a, joint b, radius, how many]. Used to say how high she stands over the sand under her.
  const BALLS = [['hips', 'spine', 0.13, 2], ['spine', 'neck', 0.125, 5], ['neck', 'head', 0.08, 2], ['leftUpperArm', 'leftLowerArm', 0.05, 4], ['rightUpperArm', 'rightLowerArm', 0.05, 4], ['leftLowerArm', 'leftHand', 0.042, 4], ['rightLowerArm', 'rightHand', 0.042, 4], ['leftUpperLeg', 'leftLowerLeg', 0.085, 5], ['rightUpperLeg', 'rightLowerLeg', 0.085, 5], ['leftLowerLeg', 'leftFoot', 0.06, 5], ['rightLowerLeg', 'rightFoot', 0.06, 5], ['leftFoot', 'leftToes', 0.05, 2], ['rightFoot', 'rightToes', 0.05, 2]];
  function bgBody() { const out = []; for (const [a, b, r, n] of BALLS) { const A = B(a), Bn = B(b) || A; if (!A) continue; A.getWorldPosition(tmpA); Bn.getWorldPosition(tmpB); for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0; out.push([tmpA.x + (tmpB.x - tmpA.x) * t, tmpA.y + (tmpB.y - tmpA.y) * t, tmpA.z + (tmpB.z - tmpA.z) * t, r]); } } beach.sandBody(out); }
  const bgPoint = pt => { const a = B(pt.a), b = B(pt.b); if (!a || !b) return null; a.getWorldPosition(tmpA); b.getWorldPosition(tmpB); return pt.p.copy(tmpA).lerp(tmpB, pt.t); };
  const bgUses = pt => bh.mode === 'sand' ? pt.on.includes('s') : pt.on.includes(bg.side) && bgIn(pt), bgSide = pt => pt.on.includes(bg.side);   /* bgUses: the part in view (it is scored and it burns); bgSide: anything on this side of her (cream can go anywhere) */
  // ---- the cream itself. A squirt is a real lump sitting on her skin where the pointer hit her: a soft mound with a bit of a peak, shiny, lit like everything else.
  // bg.thick (0 runny .. 1 stiff) is its consistency: stiff cream stands tall, keeps its shape and takes more rubbing; runny cream lies flat and wide, shines more,
  // slides slowly downhill and spreads at a touch. Rubbing a lump pushes it flat and wide until it is a thin film and then gone, and covers the skin round it.
  const creamGeo = (() => { const g = new THREE.SphereGeometry(1, 20, 14), p = g.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x), lump = 1 + 0.09 * Math.sin(a * 3 + 0.7) + 0.06 * Math.sin(a * 5 + y * 4); x *= lump; z *= lump; if (y < 0) y *= 0.25; else y = y * (1 + 0.55 * Math.pow(Math.max(0, y), 6)); p.setXYZ(i, x, y, z); } g.computeVertexNormals(); return g; })();   /* flat underneath, lumpy round the edge, pulled up to a soft tip */
  function bgClearBlobs() { for (const d of bg.blobs) { scene.remove(d.mesh); d.mesh.material.dispose(); } bg.blobs.length = 0; if (LS.quad) LS.quad.visible = false; }
  /* bg.thick is the slider, 0..1: 1 is about as thick as hand lotion, 0 is close to oil. Each lump lies flatter and wider the runnier it is, stretches out along the way
     it runs, and grows a little in length while it moves. */
  function bgBlobShape(d) { const k = bg.thick, sp = d.spread; if (d.pool) { /* a pool: a rounded slick that stretches out as it slides and hangs into a long drop when it falls */ const r = d.r * 1.3 * (1 + 2.4 * sp), h = d.r * (0.42 + 0.35 * k) * Math.max(0.04, 1 - sp) * (d.falling ? 0.9 : 1), len = r * (1 + Math.min(2.6, d.ran * 9)) * (d.falling ? 1 + Math.min(3, d.fell * 14) : 1);
      d.mesh.scale.set(d.falling ? r * 0.7 : r, h, len); d.mesh.material.roughness = 0.05; d.mesh.material.opacity = (sp < 0.6 ? 0.93 : Math.max(0, 1 - (sp - 0.6) / 0.4)) * (d.falling ? Math.max(0, 1 - d.fell * 2.2) : 1); d.mesh.position.copy(d.p); return; }
    const r = d.r * (d.stream ? 1 + 0.35 * (1 - k) : 1.15 + 0.5 * (1 - k)) * (1 + 2.4 * sp), h = d.r * (d.stream ? 0.5 + 0.55 * k : 0.13 + 0.3 * k) * Math.max(0.04, 1 - sp), len = d.stream ? d.len * (1 + 0.5 * sp) : r * (1 + Math.min(1.1, d.v * 20) + 0.2 * (1 - k));   /* a stream bead is a short round length of the line: thick lotion keeps a round cross-section like toothpaste, runny lotion slumps flat */
    d.mesh.scale.set(r, h, len); d.mesh.material.roughness = 0.07 + 0.16 * k; d.mesh.material.opacity = (sp < 0.6 ? 1 : Math.max(0, 1 - (sp - 0.6) / 0.4)) * (0.82 + 0.18 * k); d.mesh.position.copy(d.p); }
  // Drips. A lump that has not been rubbed waits a moment of its own (a fresh squirt holds briefly; runny cream holds less), then runs downhill along her skin, picking up
  // speed, stretching out, and leaving a trail of small beads behind it as it goes, so it gets smaller; when it is spent, or has run as far as cream of that thickness
  // runs, it stops. Each lump has its own wait and pace, so they go one by one, not all at once. Where a drip passes, a little cream reaches the skin.
  // Pools. Lotion that keeps landing in one place gathers into a pool (see beachStream). A small pool holds where it is; once it is heavy enough for its thickness it
  // starts to slide, slowly, like slime: downhill along her skin, stretching out, leaving a smear of small beads and a little lotion on the skin as it goes. Every so
  // often it feels for her skin under it (a ray back along its normal) and follows the curve; when there is no skin under it any more it has run off the edge of her,
  // and it falls, stretching into a long drop and fading, until it is gone.
  // Her body, frozen. Feeling for her skin with a ray against a skinned mesh works out the skinning of every vertex of her each time,
  // which was nearly all the lotion game's cost. Instead her surface is worked out once into a plain list of triangles, sorted into a
  // grid of 4 cm cells, and only worked out again when she has moved (her hips, head, hands or feet shift by more than 4 mm). A ray
  // then only tests the few triangles in the cells it passes through.
  const BS = { cell: 0.04, map: new Map(), tri: null, n: 0, at: -9, key: [], stamp: null, mark: 1, obj: new THREE.Mesh(), lo: new THREE.Vector3(), hi: new THREE.Vector3() };
  const BS_KEYS = ['hips', 'head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
  function bsFresh() { const now = performance.now() / 1000; let moved = !BS.tri; BS_KEYS.forEach((k, i) => { const b = B(k); if (!b) return; b.getWorldPosition(tmpA); const o = BS.key[i]; if (!o || o.distanceToSquared(tmpA) > 1.6e-5) moved = true; });
    if (!moved || now - BS.at < 0.4) return; BS.at = now; BS_KEYS.forEach((k, i) => { const b = B(k); if (b) (BS.key[i] || (BS.key[i] = new THREE.Vector3())).copy(b.getWorldPosition(tmpA)); });
    vrm.scene.updateMatrixWorld(true); const tris = [], v = new THREE.Vector3(); BS.map.clear(); const C = BS.cell, lo = BS.lo.set(1e9, 1e9, 1e9), hi = BS.hi.set(-1e9, -1e9, -1e9);
    vrm.scene.traverse(m => { if (!m.isMesh || !m.visible || m.userData.cream || !m.geometry || !m.geometry.attributes.position) return; let vis = true; for (let q = m; q; q = q.parent) if (!q.visible) { vis = false; break; } if (!vis) return;
      const g = m.geometry, pos = g.attributes.position, idx = g.index, nv = pos.count, W = new Float32Array(nv * 3); if (m.isSkinnedMesh) m.skeleton.update();
      for (let i = 0; i < nv; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z; }
      const nt = idx ? idx.count / 3 : nv / 3; for (let t = 0; t < nt; t++) { const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2; tris.push(W[a * 3], W[a * 3 + 1], W[a * 3 + 2], W[b * 3], W[b * 3 + 1], W[b * 3 + 2], W[c * 3], W[c * 3 + 1], W[c * 3 + 2]); } });
    BS.tri = new Float32Array(tris); BS.n = tris.length / 9; BS.stamp = new Uint32Array(BS.n); const T = BS.tri;
    for (let t = 0; t < BS.n; t++) { const o = t * 9; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity; for (let j = 0; j < 9; j += 3) { x0 = Math.min(x0, T[o + j]); x1 = Math.max(x1, T[o + j]); y0 = Math.min(y0, T[o + j + 1]); y1 = Math.max(y1, T[o + j + 1]); z0 = Math.min(z0, T[o + j + 2]); z1 = Math.max(z1, T[o + j + 2]); }
      lo.min(tmpA.set(x0, y0, z0)); hi.max(tmpA.set(x1, y1, z1)); for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(y0 / C); j <= Math.floor(y1 / C); j++) for (let k = Math.floor(z0 / C); k <= Math.floor(z1 / C); k++) { const key = (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512); let L = BS.map.get(key); if (!L) BS.map.set(key, L = []); L.push(t); } } }
  /* the hits of a ray against her (nearest first), shaped like three's: { point, distance, face: { normal (world) }, object } */
  function bsHits(ray, far = Infinity) { bsFresh(); if (!BS.n) return []; const o = ray.origin, d = ray.direction, C = BS.cell, T = BS.tri, out = []; BS.mark++; if (BS.mark > 4e9) { BS.stamp.fill(0); BS.mark = 1; }
    let t0 = 0, t1 = far; for (const ax of ['x', 'y', 'z']) { const lo = BS.lo[ax] - 0.01, hi = BS.hi[ax] + 0.01; if (Math.abs(d[ax]) < 1e-9) { if (o[ax] < lo || o[ax] > hi) return []; continue; } let a = (lo - o[ax]) / d[ax], b = (hi - o[ax]) / d[ax]; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); } if (t0 > t1) return [];
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3(); let lastKey = NaN;
    for (let s = t0; s <= t1 + C * 0.5; s += C * 0.5) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s, key = (Math.floor(x / C) + 512) * 1048576 + (Math.floor(y / C) + 512) * 1024 + (Math.floor(z / C) + 512); if (key === lastKey) continue; lastKey = key; const L = BS.map.get(key); if (!L) continue;
      for (const t of L) { if (BS.stamp[t] === BS.mark) continue; BS.stamp[t] = BS.mark; const q = t * 9; e1.set(T[q + 3] - T[q], T[q + 4] - T[q + 1], T[q + 5] - T[q + 2]); e2.set(T[q + 6] - T[q], T[q + 7] - T[q + 1], T[q + 8] - T[q + 2]); pv.crossVectors(d, e2); const det = e1.dot(pv); if (Math.abs(det) < 1e-12) continue; const inv = 1 / det;
        tv.set(o.x - T[q], o.y - T[q + 1], o.z - T[q + 2]); const u = tv.dot(pv) * inv; if (u < 0 || u > 1) continue; qv.crossVectors(tv, e1); const w = d.dot(qv) * inv; if (w < 0 || u + w > 1) continue; const dist = e2.dot(qv) * inv; if (dist < 0 || dist > far) continue;
        out.push({ point: o.clone().addScaledVector(d, dist), distance: dist, face: { normal: new THREE.Vector3().crossVectors(e1, e2).normalize() }, object: BS.obj }); }
      if (out.length && s > out.reduce((m, h) => Math.min(m, h.distance), Infinity) + C) break; }
    return out.sort((a, b) => a.distance - b.distance); }
  function bgStick(d) { bg.ray.set(tmpA.copy(d.p).addScaledVector(d.n, 0.05), tmpB.copy(d.n).negate()); const hit = bsHits(bg.ray.ray, 0.1).find(h => h.object.isMesh && h.object.visible && h.face && h.object !== d.mesh && !h.object.userData.cream); if (!hit) return false;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); if (n.dot(d.n) < 0) n.negate(); d.n.copy(n); d.p.copy(hit.point).addScaledVector(n, 0.003); d.t.set(0, -1, 0).addScaledVector(n, n.y); if (d.t.lengthSq() < 0.01) return true; d.t.normalize(); d.mesh.quaternion.setFromRotationMatrix(tmpM.makeBasis(tmpC.crossVectors(n, d.t), n, d.t)); return true; }
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Vector3();
  function bgPoolTick(d, dt) { const k = bg.thick, heavy = 0.006 + 0.009 * k;   /* thin lotion starts to run from a smaller pool */
    if (d.falling) { d.fv += (1.1 - 0.5 * k) * dt; d.p.y -= d.fv * dt; d.fell += d.fv * dt; bgBlobShape(d); return d.p.y < floorY || d.fell > 0.45; }
    if (d.spread > 0.35 || d.frozen) { d.v *= Math.exp(-dt * 4); bgBlobShape(d); return false; }
    d.mov = (d.mov || 0) + dt; if (d.mov > 8) { d.brake = true; d.tail = Math.max(0.5, (d.tail ?? 1) - dt / 5); if (d.v < 0.0015 && d.tail <= 0.5) { d.frozen = true; d.fadeT = 0; } }   /* it runs for a few seconds, slows, its tail catches up, and it sets */
    const slope = Math.max(0.15, Math.sqrt(Math.max(0, 1 - d.n.y * d.n.y)));   /* on a level part of her it barely creeps; on a slope it slides */
    const thin = (1 - k) * (1 - k); d.v = d.brake ? d.v * Math.exp(-dt * 0.9) : Math.min((0.008 + 1.6 * Math.max(0, d.r - heavy)) * (0.35 + 5.5 * thin) * slope, d.v + (0.011 + 0.15 * thin) * dt);   /* viscosity: at 0 it runs (several cm a second down a slope), at 100 it barely creeps */ const step = d.v * dt; d.p.addScaledVector(d.t, step); d.ran += step; d.trail += step; d.feel -= dt; if (d.brake) d.trail = 0;
    if (d.feel <= 0 && bg.rays > 0) { bg.rays--; d.feel = 0.15; if (!bgStick(d)) { d.falling = true; d.fv = 0.02; d.fell = 0; d.mesh.quaternion.setFromRotationMatrix(tmpM.makeBasis(tmpC.set(1, 0, 0), tmpA.set(0, 0, 1), tmpB.set(0, -1, 0))); } }
    /* the trail: a bead is left every 6 mm, as thick as a good part of the pool. Each bead thins with its distance from the pool (see bgBlobsTick), so the streak is
       full where the pool is and tapers away behind it; how far back it reaches depends on the viscosity (thick lotion leaves a longer, heavier trail). */
    if (d.trail > 0.005 && d.r > 0.006 && bg.blobs.length < 750) { d.trail = 0; d.r *= 0.992; const m = new THREE.Mesh(creamGeo, d.mesh.material.clone()); m.quaternion.copy(d.mesh.quaternion); m.renderOrder = 5; m.userData.cream = 1; m.visible = false; scene.add(m); const bead = { mesh: m, p: d.p.clone().addScaledVector(d.t, -d.r * 0.6), n: d.n.clone(), t: d.t.clone(), r: d.r * 0.55, r0: d.r * 0.55, of: d, spread: d.spread, v: 0, bead: true, stream: true, trailBead: true, len: 0.006 }; bg.blobs.push(bead); bgBlobShape(bead); }
    let near = null; for (const pt of bg.pts) { if (!pt.on.includes(bg.side) || !pt.p) continue; const dd = pt.p.distanceTo(d.p); if (dd < 0.08 && (!near || dd < near.d)) near = { d: dd, pt }; } if (near) near.pt.goo = Math.min(1.2, near.pt.goo + step * 4); bgBlobShape(d); return false; }
  // One smooth mass, cheaply. Each lump of lotion is drawn as a soft round blot of 'thickness' into a small picture of its own (half the screen's size), where
  // blots that overlap simply add up; then one pass over the screen turns that picture into lotion: where it is thick enough it shows, its edge is soft, thin
  // parts are see-through, and the slope of the thickness gives it a shiny, rounded look. So lumps that touch flow into one shape, and the cost is a few hundred
  // tiny points and one screen pass, whatever the number of lumps (the marching-cubes surface before it was too heavy for a phone).
  const LS = { pts: null, quad: null, rt: null, scene: new THREE.Scene(), N: 900, size: new THREE.Vector2() };
  function lsInit() { if (LS.pts) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LS.N * 3), 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('rad', new THREE.BufferAttribute(new Float32Array(LS.N), 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('fade', new THREE.BufferAttribute(new Float32Array(LS.N), 1).setUsage(THREE.DynamicDrawUsage)); g.setDrawRange(0, 0);
    LS.pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uH: { value: 400 } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float rad; attribute float fade; varying float vF; uniform float uH; void main() { vF = fade; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(2.0, 3.1 * rad * projectionMatrix[1][1] * uH / -mv.z); }',
      fragmentShader: 'varying float vF; void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0) discard; float g = max(0.0, exp(-r2 * 3.0) - 0.05) * 0.62; gl_FragColor = vec4(g, g * vF, 0.0, 1.0); }' }));   /* red: how thick (the shape); green: the same weighted by how faded, so green / red is the opacity there */
    LS.pts.frustumCulled = false; LS.scene.add(LS.pts); const hf = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'); LS.rt = new THREE.WebGLRenderTarget(4, 4, { type: hf ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false });   /* (a phone that cannot draw into half floats gets plain bytes: thickness then tops out at 1, which still looks right) */
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    LS.quad = new THREE.Mesh(tri, new THREE.ShaderMaterial({ uniforms: { tD: { value: LS.rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: new THREE.Vector2(1, 1) } }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tD; uniform vec2 uRes; uniform vec2 uPx;
        float D(vec2 u) { return texture2D(tD, u).r; }
        void main() { vec2 uv = gl_FragCoord.xy / uRes; vec2 dg = texture2D(tD, uv).rg; float d = dg.x; if (d < 0.16) discard; float fade = clamp(dg.y / max(d, 1e-4), 0.0, 1.0); if (fade < 0.004) discard;
          float gx = D(uv + vec2(uPx.x, 0.0)) - D(uv - vec2(uPx.x, 0.0)), gy = D(uv + vec2(0.0, uPx.y)) - D(uv - vec2(0.0, uPx.y));
          vec3 n = normalize(vec3(-gx * 1.1, -gy * 1.1, 1.0)), L = normalize(vec3(-0.35, 0.55, 0.75));
          float dif = 0.72 + 0.28 * max(dot(n, L), 0.0), spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0), rim = pow(1.0 - n.z, 2.0);
          vec3 col = vec3(1.0, 0.985, 0.95) * dif + vec3(1.0) * (spec * 0.85 + rim * 0.25);
          float a = smoothstep(0.16, 0.28, d) * (0.32 + 0.26 * smoothstep(0.28, 1.0, d));   /* a filmy, see-through sheen more than a white paste */
          gl_FragColor = vec4(col, a * fade);
          #include <colorspace_fragment>
        }` }));
    LS.quad.frustumCulled = false; LS.quad.renderOrder = 999; LS.quad.userData.cream = 1; scene.add(LS.quad); }
  function bgUnify(dt) { if (!bh.on || bh.mode !== 'sun') { if (LS.quad) LS.quad.visible = false; return; } lsInit(); renderer.getDrawingBufferSize(LS.size); const w = Math.max(4, LS.size.x >> 1), h = Math.max(4, LS.size.y >> 1); if (LS.rt.width !== w || LS.rt.height !== h) LS.rt.setSize(w, h);
    const g = LS.pts.geometry, P = g.attributes.position.array, R = g.attributes.rad.array, F = g.attributes.fade.array; let n = 0; camera.updateMatrixWorld();
    for (const d of bg.blobs) { d.mesh.visible = false; if (n >= LS.N || d.spread >= 1) continue; tmpA.copy(camera.position).sub(d.p); if (!d.falling && tmpA.dot(d.n) < 0) continue;   /* lotion on the far side of her is not drawn */
      const rv = (d.pool ? d.r * 1.25 : d.r) * (1 + 1.1 * (d.flat || 0)) * Math.max(0.6, 1 - d.spread * 0.4) * (d.falling ? Math.max(0.3, 1 - d.fell * 1.5) : 1); if (rv < 0.0012) continue;   /* rubbing and fading thin it by opacity, not by shrinking it apart */
      const fv = (d.fade ?? 1) * Math.max(0, 1 - d.spread) * (d.falling ? Math.max(0, 1 - d.fell * 2.2) : 1); if (fv <= 0.003) continue; P[n * 3] = d.p.x; P[n * 3 + 1] = d.p.y; P[n * 3 + 2] = d.p.z; R[n] = rv; F[n] = fv; n++; }
    g.setDrawRange(0, n); g.attributes.position.needsUpdate = true; g.attributes.rad.needsUpdate = true; g.attributes.fade.needsUpdate = true; LS.pts.material.uniforms.uH.value = h / 2; LS.quad.visible = n > 0; if (!n) return;
    LS.quad.material.uniforms.uRes.value.set(LS.size.x, LS.size.y); LS.quad.material.uniforms.uPx.value.set(1 / w, 1 / h);
    const was = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(); renderer.setRenderTarget(LS.rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); renderer.render(LS.scene, camera); renderer.setRenderTarget(was); renderer.setClearColor(cc, ca); }
  function bgJoinPools() { const P = bg.blobs.filter(d => d.pool && !d.falling); for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j]; if (!a.pool || !b.pool) continue; if (a.p.distanceTo(b.p) > (a.r + b.r) * 1.6) continue;
      const big = a.r >= b.r ? a : b, small = big === a ? b : a, va = big.r ** 3, vb = small.r ** 3; big.p.multiplyScalar(va).addScaledVector(small.p, vb).divideScalar(va + vb); big.r = Math.cbrt(va + vb); big.ran = Math.max(big.ran, small.ran); big.mov = 0; big.brake = false; big.frozen = false; big.tail = 1; big.fadeT = 0; small.pool = false; small.spread = 1; bgBlobShape(big); } }
  const BG_FADE = 210;   /* seconds a lump that has set takes to fade away (it can be rubbed off before that) */
  function bgBlobsTick(dt) { bg.rays = 4; bgJoinPools();   /* feeling for her skin is a ray against her skinned body, which is costly: at most 4 a frame, shared out */
    const k = bg.thick, rf = 1 - 0.75 * k;
    /* lotion keeps its size (a lump that shrank came apart into little beads); once it has set it fades out by opacity instead, over BG_FADE seconds */
    for (const d of bg.blobs) { if (d.falling || d.trailBead) continue; const set = d.pool ? d.frozen : d.bead || d.still || d.spread >= 0.35 || d.ran >= d.reach || ((d.lm || 0) > 7 && d.v < 0.0008);
      if (set) { d.flat = Math.min(1, (d.flat || 0) + dt / 1.5); d.fadeT = (d.fadeT || 0) + dt; const u = Math.min(1, d.fadeT / BG_FADE); d.fade = 1 - u * u * (3 - 2 * u); if (d.fade <= 0.002) d.spread = 1; } else { d.fade = 1; d.flat = Math.max(0, (d.flat || 0) - dt * 2); } }
    for (let i = bg.blobs.length - 1; i >= 0; i--) { const d = bg.blobs[i]; if (d.spread >= 1) { d.gone = true; scene.remove(d.mesh); d.mesh.material.dispose(); bg.blobs.splice(i, 1); continue; }
      if (d.pool) { if (bgPoolTick(d, dt)) { d.gone = true; scene.remove(d.mesh); d.mesh.material.dispose(); bg.blobs.splice(i, 1); } continue; }
      if (d.trailBead) { const o = d.of, alive = o && !o.falling && o.spread < 1 && !o.gone;
        let catchK; if (alive) { if (!o.pool) { const moving = !(o.ran >= o.reach || o.still || o.spread >= 0.35 || (o.lm || 0) > 7); o.tail = moving ? 1 : Math.max(0.5, (o.tail ?? 1) - dt / 5); } catchK = o.tail ?? 1; } else catchK = d.solo = Math.max(0, (d.solo ?? 1) - dt / 5);   /* when the front stops, its tail draws up to half its length and sets with it, one ribbon */
        const reach = (0.10 + 0.16 * k) * catchK, dist = alive ? o.p.distanceTo(d.p) : (d.lastDist || 0); d.lastDist = dist; const f = reach > 1e-4 ? Math.max(0, 1 - dist / reach) : 0; d.r = d.r0 * Math.min(1, Math.pow(f, 0.6) * 1.15); d.fade = alive ? (o.fade ?? 1) : 1;
        if (d.r < 0.0009) { scene.remove(d.mesh); d.mesh.material.dispose(); bg.blobs.splice(i, 1); } else bgBlobShape(d); continue; }   /* a trail bead is fullest next to its lump and narrows to nothing toward the tail; when the lump slows and sets, the tail draws up into it */
      if (!d.bead && !d.still && d.spread < 0.35 && d.ran < d.reach) { d.wait -= dt; if (d.wait <= 0) { const thin = (1 - k) * (1 - k), slope = Math.max(0.2, Math.sqrt(Math.max(0, 1 - d.n.y * d.n.y))); d.lm = (d.lm || 0) + dt; const brake = d.lm > 7; d.v = brake ? d.v * Math.exp(-dt * 0.9) : Math.min((0.014 + 0.065 * thin) * d.pace * slope, d.v + (0.013 + 0.065 * thin) * dt);   /* like dish soap down a sink: a slow, steady ooze */ const step = d.v * dt;   /* it runs for a few seconds, then slows and sets */ d.p.addScaledVector(d.t, step); d.ran += step; d.trail += step; d.feel = (d.feel || 0) - dt; if (d.feel <= 0 && !brake && bg.rays > 0) { bg.rays--; d.feel = 0.3 + Math.random() * 0.1; if (bgStick(d)) bg.stickOk = (bg.stickOk || 0) + 1; else { bg.stickFail = (bg.stickFail || 0) + 1; d.still = true; d.v = 0; } }   /* it hugs her shape as it runs; off her edge it stops */
        if (brake) d.trail = 0;
        if (d.trail > 0.005 && bg.blobs.length < 750 && d.r > 0.002) { d.trail = 0; d.r *= 0.992; const m = new THREE.Mesh(creamGeo, d.mesh.material); m.visible = false; scene.add(m); const bead = { mesh: m, p: d.p.clone().addScaledVector(d.t, -d.r * 0.5), n: d.n.clone(), t: d.t.clone(), r: d.r * 0.75, r0: d.r * 0.75, of: d, spread: d.spread, v: 0, bead: true, stream: true, trailBead: true, len: 0.006 }; bg.blobs.push(bead); bgBlobShape(bead); }
        let near = null; for (const pt of bg.pts) { if (!pt.on.includes(bg.side) || !pt.p) continue; const dd = pt.p.distanceTo(d.p); if (dd < 0.07 && (!near || dd < near.d)) near = { d: dd, pt }; } if (near) near.pt.goo = Math.min(1.2, near.pt.goo + step * 3); } }
      else d.v *= Math.exp(-dt * 6); bgBlobShape(d); } }
  const bgScreen = v => { const r = renderer.domElement.getBoundingClientRect(); tmpA.copy(v).project(camera); return [(tmpA.x + 1) / 2 * r.width + r.left, (1 - tmpA.y) / 2 * r.height + r.top]; };
  function bgSprites() { if (!bg.tex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); bg.tex = new THREE.CanvasTexture(c); }
    for (const pt of bg.pts) { if (!pt.cream) { for (const k of ['red', 'cream']) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bg.tex, color: k === 'red' ? '#ff3b55' : '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false })); sp.renderOrder = k === 'red' ? 40 : 41; sp.scale.setScalar(k === 'red' ? 0.2 : 0.15); scene.add(sp); pt[k] = sp; }
      }
      const show = bh.on && bh.mode === 'sun' && bgSide(pt); pt.cream.visible = !!show; pt.red.visible = !!show && bgUses(pt); if (!show) continue;   /* the sheen shows anywhere cream went; the red only on the part in view, the part the sun is working on */ bgPoint(pt); const out = tmpB.copy(camera.position).sub(pt.p).normalize().multiplyScalar(0.07); pt.red.position.copy(pt.p).add(out); pt.cream.position.copy(pt.red.position);
      pt.red.material.opacity = Math.min(0.42, pt.burn * 0.5);       pt.cream.material.opacity = pt.cover <= 0 ? 0 : pt.cover < 1 ? 0.14 + 0.26 * pt.cover : 0.17; pt.cream.scale.setScalar(0.1 + 0.11 * pt.cover); } }   /* a squirt sits on her as a heap of cream; rubbing wears the heap down and spreads a thin sheen in its place; an uncovered spot reddens */
  // put her into a pose: 'back' (lying face up), 'front' (lying face down, up on her elbows, feet in the air) or 'chair'
  function bgPose(kind) { for (const n of KEYS) set(n, ...standOf(n)); for (const n of ['head', 'neck', 'chest', 'upperChest', 'spine', 'hips']) set(n, 0, 0, 0); const x = bh.x, z = 3.4, yaw = -0.5, top = bh.mode === 'sand' ? 0 : beach.topOf[kind === 'chair' ? 'chair' : 'lounger'];
    if (bh.mode === 'sun') beach.prop(kind === 'chair' ? 'chair' : 'lounger', x, z, yaw + (kind === 'chair' ? 0 : 0)); else beach.prop('', 0, 0, 0);
    /* lying down, from the recorded poses when they are there (Mixamo's Female Laying Pose: on her front, up on her elbows, one foot in the air; and Female Laying
       Pose 1: on her back). The clip lays her down by turning her hips, so she is then swung round to lie along the lounger and slid so her hips are on its middle. */
    const lie = kind === 'front' ? 'female_laying_pose' : kind === 'back' ? 'female_laying_pose_1' : '';
    if (hipsNode) hipsNode.position.y = hipY0;
    if (lie && CLIPS[lie] && window.WIZRA_BEACH_CLIPPOSE) {   /* (off unless asked for: both recorded poses turned out to be lying on her side, propped on an elbow, which is neither on her front nor on her back) */ clipHip = 0; playClip(lie, 1, 0); if (hipsNode) hipsNode.position.y = hipY0 + clipHip; vrm.scene.rotation.set(0, 0, 0, 'XYZ'); vrm.scene.position.set(0, floorY + top, 0); vrm.scene.updateMatrixWorld(true);
      const hd = B('head') || hipsNode; hipsNode.getWorldPosition(tmpA); hd.getWorldPosition(tmpB); const lies = Math.atan2(tmpB.x - tmpA.x, tmpB.z - tmpA.z); vrm.scene.rotation.y = yaw - lies; vrm.scene.updateMatrixWorld(true);
      hipsNode.getWorldPosition(tmpA); const cx = x + Math.sin(yaw) * (bh.mode === 'sand' ? 0 : 0.85), cz = z + Math.cos(yaw) * (bh.mode === 'sand' ? 0 : 0.85); vrm.scene.position.x += cx - tmpA.x; vrm.scene.position.z += cz - tmpA.z; }
    else if (kind === 'chair') { set('leftUpperLeg', -1.3, 0, 0.06); set('rightUpperLeg', -1.3, 0, -0.06); set('leftLowerLeg', 1.25, 0, 0); set('rightLowerLeg', 1.25, 0, 0); set('spine', -0.05, 0, 0); set('leftUpperArm', 0.1, 0, -1.05); set('rightUpperArm', 0.1, 0, 1.05); set('leftLowerArm', 0, -0.5, 0); set('rightLowerArm', 0, 0.5, 0);
      vrm.scene.rotation.set(-0.28, yaw, 0, 'YXZ'); vrm.scene.position.set(x + Math.sin(yaw) * 0.05, floorY + top - hipY0 * Math.cos(0.28) + 0.03, z + Math.cos(yaw) * 0.05); }
    else if (kind === 'back') { set('leftUpperArm', 0, 0, -0.95); set('rightUpperArm', 0, 0, 0.95); set('leftUpperLeg', 0, 0, 0.07); set('rightUpperLeg', 0, 0, -0.07); set('leftFoot', -0.5, 0, 0); set('rightFoot', -0.5, 0, 0); set('head', 0.12, 0, 0);
      vrm.scene.rotation.set(-Math.PI / 2, yaw + Math.PI, 0, 'YXZ'); vrm.scene.position.set(x + Math.sin(yaw) * 0.08, floorY + top + 0.105, z + Math.cos(yaw) * 0.08); }   /* her feet at the foot of the lounger, her head toward its head */
    else { set('spine', -0.28, 0, 0); set('chest', -0.22, 0, 0); set('neck', -0.3, 0, 0); set('head', -0.32, 0, 0); set('leftUpperLeg', 0, 0, 0.05); set('rightUpperLeg', 0, 0, -0.05); set('leftLowerLeg', 1.85, 0, 0); set('rightLowerLeg', 1.45, 0, 0); set('leftFoot', -0.55, 0, 0); set('rightFoot', -0.55, 0, 0);
      vrm.scene.rotation.set(Math.PI / 2, yaw, 0, 'YXZ'); vrm.scene.position.set(x + Math.sin(yaw) * 0.08, floorY + top + 0.125, z + Math.cos(yaw) * 0.08); vrm.scene.updateMatrixWorld(true);
      for (const [sd, sx] of [['left', 1], ['right', -1]]) { const A = B(sd + 'UpperArm'), E = B(sd + 'LowerArm'), H = B(sd + 'Hand'); if (!A || !E || !H) continue; A.getWorldPosition(tmpA); const t = new THREE.Vector3(tmpA.x + Math.sin(yaw) * 0.26 + Math.cos(yaw) * sx * 0.04, floorY + top + 0.04, tmpA.z + Math.cos(yaw) * 0.26 - Math.sin(yaw) * sx * 0.04); ikReach(A, E, H, t); } }   /* her hands flat ahead of her shoulders, so she is up on her elbows */
    vrm.scene.updateMatrixWorld(true); if (vrm.springBoneManager) vrm.springBoneManager.reset(); try { cloth && cloth.reset && cloth.reset(); } catch {} bh.pose = kind; }
  // one frame of a still game: her body is left as it is; she blinks, smiles or winces; the beach, her hair and the picture carry on
  function beachStill(s) { const now = performance.now(); if (!bh.inited) { bh.inited = true; bgPose(bh.want || 'back'); for (const pt of bg.pts) { pt.cover = 0; pt.burn = 0; pt.goo = 0; pt.lit = false; } }
    if (em) { if (now > bg.blinkAt) bg.blinkAt = now + 2200 + Math.random() * 3000; const bl = now > bg.blinkAt - 140 || bg.jump > 0.5 ? 1 : 0; bg.hurt += ((bg.hurtWant || 0) - bg.hurt) * Math.min(1, s.dt * 3); bg.glad *= Math.exp(-s.dt * 0.8); bg.jump = (bg.jump || 0) * Math.exp(-s.dt * 2.6);
      try { for (const n of NAMES) if (has(n)) em.setValue(n, 0); if (has('happy')) em.setValue('happy', Math.max(0, Math.min(1, 0.25 + bg.glad * 0.6 - bg.hurt - bg.jump))); if (has('sad')) em.setValue('sad', Math.min(0.8, bg.hurt)); if (has('surprised')) em.setValue('surprised', Math.min(1, bg.jump)); if (has('blink')) em.setValue('blink', bl); } catch {}
      const hd = B('head'); if (hd && bg.jump > 0.02) hd.rotation.x += (Math.random() - 0.5) * 0.04 * bg.jump; }   /* a startle: eyes wide, a little shiver of the head */
    beach.tick(s.t / 1000, bh.x, null, false, false); if (beach.night) { sun.intensity = Math.PI * 0.42; sun.color.set('#b9c8ff'); amb.intensity = 0.34; } else { sun.intensity = Math.PI * 1.05; sun.color.set('#fffaf0'); amb.intensity = 0.62; }
    try { vrm.update(Math.min(0.05, s.dt || 0.016)); } catch {} try { cloth && cloth.reset && cloth.reset(); } catch {}   /* her coat tails and skirt are held still here: let loose on someone lying down they look wrong */
    if (bh.mode === 'sand') { if (!bg.sandOn) { bg.sandOn = true; const h = B('spine') || hipsNode; h.getWorldPosition(tmpA); beach.sandStart(tmpA.x, tmpA.z); bgBody(); } beach.sandStep(Math.min(0.05, s.dt || 0.016)); } else if (bg.sandOn) { bg.sandOn = false; beach.sandStop(); }
    bgBlobsTick(Math.min(0.05, s.dt || 0.016)); beachCamera(s.dt, s.t); bgUnify(Math.min(0.05, s.dt || 0.016)); bgSprites(); renderView(); }
  // ---- the chase (water fight on the beach). She runs off along the water's edge, laughing, weaving from side to side and looking
  // back over her shoulder; you follow in first person with a toy water pistol in your hand. A hit makes her stumble (she slows, so you
  // gain on her); chaseFall() trips her onto her back on the sand, where she lies laughing and then gets up and sprints off again.
  const CH = { x: 4, me: 0, z: RUN_Z, mz: RUN_Z, wt: 0, t: 0, step: 0, slow: 0, boost: 0, jolt: 0, fall: -1, look: 0, lookT: 2, side: 1, kick: 0, gun: null, look3: new THREE.Vector3(), has: false };
  const CH_DOWN = 0.75, CH_LIE = 2.8, CH_UP = 2.4;   /* seconds: falling back onto the sand, lying there laughing, getting up */
  function chaseGun() { if (CH.gun) return CH.gun; const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }), box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); g.add(m); return m; };
    box(0.05, 0.055, 0.16, '#ff8a2a', 0, 0, 0); box(0.04, 0.09, 0.045, '#ff8a2a', 0, -0.065, 0.05).rotation.x = -0.25; box(0.012, 0.03, 0.03, '#2b6cff', 0, -0.03, 0.005);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 14), new THREE.MeshStandardMaterial({ color: '#4fc3ff', roughness: 0.15, transparent: true, opacity: 0.8 })); tank.rotation.x = Math.PI / 2; tank.position.set(0, 0.05, 0.0); g.add(tank);
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.06, 10), M('#2b6cff')); nz.rotation.x = Math.PI / 2; nz.position.set(0, 0.005, -0.105); g.add(nz);
    g.traverse(o => { o.renderOrder = 60; if (o.material) { o.material.depthTest = false; o.material.depthWrite = false; } }); g.scale.setScalar(0.8); g.visible = false; scene.add(g); return CH.gun = g; }
  function chaseFrame(s) { const dt = Math.min(0.05, s.dt || 0.016);
    for (const n of KEYS) set(n, ...standOf(n)); for (const n of ['head', 'neck', 'chest', 'upperChest', 'spine', 'hips']) set(n, 0, 0, 0);
    const run = ['female_run', 'running', 'standard_run', 'slow_run', 'jogging'].find(haveClip) || 'beach_run', c = CLIPS[run], rate = 0.85, v0 = c ? stride(c) / c.dur * rate : 2.6;
    CH.slow = Math.max(0, CH.slow - dt); CH.boost = Math.max(0, CH.boost - dt); CH.jolt *= Math.exp(-dt * 5); CH.kick *= Math.exp(-dt * 12);
    let herV = 0, yaw = Math.PI / 2;
    if (CH.fall >= 0) { CH.fall += dt; const f = CH.fall, up = haveClip('getting_up');
      if (f < CH_DOWN) { const k = f / CH_DOWN, e = k * k; herV = v0 * (1 - k) * 0.8; if (up) playClip('getting_up', 1, 5.6 - 2.5 * e); }   /* the clip of getting up, played backwards and fast: she goes over onto her back */
      else if (f < CH_DOWN + CH_LIE) { if (up) playClip('getting_up', 1, 1.0 + 0.25 * Math.sin((f - CH_DOWN) * 2.2)); const sp = B('spine'); if (sp) sp.rotateX(0.05 * Math.sin((f - CH_DOWN) * 18) * Math.max(0, 1 - (f - CH_DOWN) / CH_LIE)); }   /* lying there, shaking with laughter */
      else if (f < CH_DOWN + CH_LIE + CH_UP) { const k = (f - CH_DOWN - CH_LIE) / CH_UP; if (up) playClip('getting_up', 1, 3.1 + 3.6 * k); }
      else { CH.fall = -1; CH.boost = 2.2; CH.t = 0; } }
    if (CH.fall < 0) { const pace = (CH.slow > 0 ? 0.5 : 1) * (CH.boost > 0 ? 1.3 : 1); herV = v0 * pace; CH.t += dt * rate * pace; if (c) playClip(run, 1, CH.t);
      CH.wt += dt * 0.8; const zWant = RUN_Z - 0.35 + 0.6 * Math.sin(CH.wt) + 0.25 * Math.sin(CH.wt * 2.3 + 1); const dz = (zWant - CH.z); CH.z += dz * Math.min(1, dt * 2); yaw = Math.atan2(herV, dz * 2);
      CH.lookT -= dt; if (CH.lookT <= 0) { CH.look = CH.look > 0 ? 0 : 1; CH.lookT = CH.look ? 0.9 + Math.random() * 0.6 : 2 + Math.random() * 3; if (CH.look) CH.side = Math.random() < 0.5 ? -1 : 1; } }
    CH.lk = (CH.lk || 0) + ((CH.fall < 0 ? CH.look : 0) - (CH.lk || 0)) * Math.min(1, dt * 6);
    CH.x += herV * dt; bh.x = CH.x;
    const gap = CH.x - CH.me, want = CH.fall >= 0 ? 1.5 : 3.4 + 0.7 * Math.sin(CH.wt * 0.5), meV = CH.fall >= 0 ? Math.max(0, (gap - want) * 1.5) : v0 * 0.98 + (gap - want) * 0.45; CH.me += Math.max(0, meV) * dt; CH.meV = meV; CH.mz += (CH.z - CH.mz) * Math.min(1, dt * 1.2); CH.step += dt * Math.min(9, 3.2 * Math.max(0, meV));
    vrm.scene.position.set(CH.x, floorY, CH.z); vrm.scene.rotation.set(0, yaw, 0, 'XYZ'); rt.k = 1; rt.gazeProp = null; rt.zoom = 0;
    if (CH.lk > 0.01) { const a = CH.lk * CH.side; for (const [n, v] of [['spine', 0.25], ['chest', 0.3], ['upperChest', 0.25], ['neck', 0.35], ['head', 0.6]]) { const b = B(n); if (b) b.rotateY(a * v); } }   /* a laughing look back over her shoulder */
    if (CH.jolt > 0.02) { const b = B('chest') || B('spine'); if (b) b.rotateX(-0.35 * CH.jolt); const h = B('head'); if (h) h.rotateX(-0.25 * CH.jolt); }   /* a hit: she flinches and arches away */
    if (bh.settle && --bh.settle === 0 && vrm.springBoneManager) { vrm.scene.updateMatrixWorld(true); vrm.springBoneManager.reset(); try { cloth && cloth.reset && cloth.reset(); } catch {} }
    { const fl = B('leftFoot'), fr = B('rightFoot'); beach.tick(s.t / 1000, CH.x, fl && fr ? [fl.getWorldPosition(bhFeet[0]), fr.getWorldPosition(bhFeet[1])] : null, CH.fall < 0, false); } if (beach.night) { sun.intensity = Math.PI * 0.42; sun.color.set('#b9c8ff'); amb.intensity = 0.34; } else { sun.intensity = Math.PI * 1.05; sun.color.set('#fffaf0'); amb.intensity = 0.62; } }
  function chaseCamera(dt) { const g = chaseGun(); g.visible = true; const bob = 0.03 * Math.abs(Math.sin(CH.step)), sway = 0.02 * Math.sin(CH.step * 0.5);
    camera.position.set(CH.me, floorY + 1.52 + bob, CH.mz + sway); const at = (CH.fall >= 0 ? B('hips') : B('upperChest') || B('chest')) || hipsNode; at.getWorldPosition(tmpA); if (CH.fall >= 0) tmpA.y += 0.1;
    if (!CH.has) { CH.look3.copy(tmpA); CH.has = true; } else CH.look3.lerp(tmpA, Math.min(1, dt * 5)); camera.lookAt(CH.look3); camera.rotateZ(sway * 0.6); if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(); g.position.set(0.19, -0.17 + bob * 0.3, -0.42 + 0.035 * CH.kick).applyMatrix4(camera.matrixWorld); g.quaternion.copy(camera.quaternion); g.rotateX(0.06 + 0.25 * CH.kick); g.rotateY(0.1); }
  function beachMode(on) { on = !!on; if (on === bh.on) return on; if (on && !beach) { beach = buildBeach(THREE, { ...kit, floorY }); scene.add(beach.group);
      /* the water's reflection draws the whole beach a second time. On a phone it is drawn smaller, and in the still games (sand,
         sunscreen), where the camera barely moves, only every third frame */
      const W = beach.water; if (W) { if (coarse && W.getRenderTarget) W.getRenderTarget().setSize(384, 384); const ob = W.onBeforeRender; let f = 0; W.onBeforeRender = function (...a) { if ((bh.mode === 'sun' || bh.mode === 'sand') && (f++ % 3)) return; return ob.apply(this, a); }; } }
    bh.on = on; bhUp = 0; bh.mode = 'run'; bh.inited = false; if (beach) { beach.clearSand(); beach.sandStop(); bg.sandOn = false; beach.prop('', 0, 0, 0); } for (const pt of bg.pts) { pt.cover = pt.burn = 0; pt.goo = 0; pt.lit = false; if (pt.cream) pt.cream.visible = pt.red.visible = false; } bgClearBlobs(); Object.assign(bh, { pose: false, paused: false, outro: 0, cutUntil: 0, wasClose: false, wide: 0, t: 0, x: 0, view: 0, since: performance.now(), oy: 0, op: 0, od: 0, has: false }); if (on) beach.setNight(night > 0.5);
    if (on) { heartStage(0); el.style.background = beach.skyColor; beach.group.visible = true; bh.fov = camera.fov; bh.far = camera.far; camera.far = 420; camera.updateProjectionMatrix(); fp.locked = true; bh.settle = 3; }   /* (the sky, the sun and the far islands are a long way off: the camera has to see that far here) */
    else { if (beach) beach.group.visible = false; heartStage(null); if (bh.far) camera.far = bh.far; if (bh.fov) camera.fov = bh.fov; camera.updateProjectionMatrix(); fp.locked = false; vrm.scene.rotation.set(0, 0, 0, 'XYZ'); for (const n of KEYS) { const q = POSE[n] || [0, 0, 0]; CUR[n][0] = q[0]; CUR[n][1] = q[1]; CUR[n][2] = q[2]; set(n, q[0], q[1], q[2]); } }
    return on; }
  // between hearts the view stands well back and takes all of her in (BWIDE, a different one each time); a popped heart cuts to one of the close views for a moment
  const BWIDE = [{ at: 'hips', side: -0.6, up: 0.08, d: 4.4, dy: 0.25 }, { at: 'hips', side: -1.2, up: 0.1, d: 4.9, dy: 0.25 }, { at: 'hips', side: 0.25, up: 0.12, d: 4.6, dy: 0.3 }, { at: 'hips', side: -0.95, up: 0.22, d: 5.4, dy: 0.2 }];
  function beachCamera(dt, t) { if (CH.gun && bh.mode !== 'chase') CH.gun.visible = false; if (!bh.on) return; fp.locked = true; if (ph.on) return; if (bh.mode === 'chase') return chaseCamera(dt);
    if (bh.mode === 'sun') { /* sunscreen: a close look at the part being done. The view sits above and to one side of the middle of that part's spots, and cuts when the part changes */ let n = 0; const mid = bg.mid || (bg.mid = new THREE.Vector3()); mid.set(0, 0, 0); for (const pt of bg.pts) if (bgUses(pt) && bgPoint(pt)) { mid.add(pt.p); n++; } if (n) mid.multiplyScalar(1 / n); else (B('spine') || hipsNode).getWorldPosition(mid);
      if (!bg.has) { bg.look.copy(mid); bg.has = true; } else bg.look.lerp(mid, Math.min(1, dt * 6)); const c = bg.cam, sit = bh.pose === 'chair', spread = Math.min(1.2, 0.55 + 0.13 * n), d = (sit ? 1.15 : 1.05) * (0.8 + spread * 0.5) * c.zoom;
      camera.position.set(bg.look.x + Math.sin(c.yaw) * Math.cos(c.pitch) * d, Math.max(floorY + 0.15, bg.look.y + Math.sin(c.pitch) * d), bg.look.z + Math.cos(c.yaw) * Math.cos(c.pitch) * d); camera.lookAt(bg.look); if (camera.fov !== 34) { camera.fov = 34; camera.updateProjectionMatrix(); } return; }
    if (bh.mode !== 'run') { /* the sand game: the view circles the middle of her; the page turns it */ const c = bg.cam, mid = B('spine') || hipsNode; mid.getWorldPosition(tmpA); camera.position.set(tmpA.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, Math.max(floorY + 0.12, tmpA.y + Math.sin(c.pitch) * c.dist), tmpA.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist); camera.lookAt(tmpA); if (camera.fov !== 34) { camera.fov = 34; camera.updateProjectionMatrix(); } return; }
    if (bh.outro) { /* the goodbye: a look at her as she shades her eyes, then the view whips up to the sun (or the moon) */ const ot = bhOutT(), hd = B('head') || hipsNode; hd.getWorldPosition(tmpA); const k = Math.max(0, Math.min(1, (ot - 0.95) / 0.75)), e = k * k * k, sunAt = beach.sunAt(bh.x, tmpB), a = beach.sunYaw - 0.8;   /* in front of her and a little to one side, so her face and her raised hand are seen first */
      camera.position.set(tmpA.x + Math.sin(a) * 1.7, tmpA.y + 0.12 + e * 0.5, tmpA.z + Math.cos(a) * 1.7); bh.tgt.copy(tmpA).lerp(sunAt, e); camera.lookAt(bh.tgt); const f = 34 - 16 * e; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } return; }
    const close = performance.now() < bh.cutUntil; if (bh.wasClose && !close) { bh.wasClose = false; bh.wide++; bh.since = performance.now(); bh.has = false; bh.oy = bh.op = bh.od = 0; } const v0 = close ? BVIEW[bh.view % BVIEW.length] : BWIDE[bh.wide % BWIDE.length], v = close ? { ...v0, d: v0.d * 1.18 } : v0, b = B(v.at) || hipsNode; b.getWorldPosition(tmpA); tmpA.y += v.dy;
    if (!bh.has) { bh.tgt.copy(tmpA); bh.has = true; } bh.tgt.x = tmpA.x; bh.tgt.z += (tmpA.z - bh.tgt.z) * Math.min(1, dt * 6); bh.tgt.y += (tmpA.y - bh.tgt.y) * Math.min(1, dt * 3);   /* keeps up with her along the beach at once; up and down it follows softly, so her bounce shows instead of shaking the picture */
    const age = (t - bh.since) / 1000, a = Math.PI / 2 + v.side + bh.oy + (bh.paused ? 0 : 0.05 * Math.sin(age * 0.6)), elev = Math.max(-0.5, Math.min(1.3, v.up + bh.op)), d = Math.max(0.35, Math.min(7, v.d * Math.exp(bh.od) * (1 - 0.02 * Math.min(age, 4))));
    let cy = bh.tgt.y + Math.sin(elev) * d; if (cy < floorY + 0.09) cy = floorY + 0.09;
    camera.position.set(bh.tgt.x + Math.sin(a) * Math.cos(elev) * d, cy, bh.tgt.z + Math.cos(a) * Math.cos(elev) * d); camera.lookAt(bh.tgt); if (camera.fov !== 34) { camera.fov = 34; camera.updateProjectionMatrix(); } }
  const HSHOT = [{ yaw: 0, up: 0.04, at: 'face' }, { yaw: 0.55, up: 0.1, at: 'face' }, { yaw: -0.5, up: 0.08, at: 'shoulder' }, { yaw: 0.3, up: 0.3, at: 'face' }, { yaw: -0.35, up: 0.14, at: 'face' }, { yaw: 0.6, up: 0.16, at: 'shoulder' },
    { yaw: -0.3, up: 0.1, at: 'face' }, { yaw: 0.4, up: 0.12, at: 'heart' }, { yaw: -0.45, up: 0.2, at: 'face' }, { yaw: 0.2, up: 0.1, at: 'heart' }, { yaw: 0.06, up: 0.06, at: 'heart' }];
  // her heart itself: a soft glowing heart over her chest that brightens and beats faster as the view closes in
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 60, 4, 64, 60, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,120,180,.95)'); gr.addColorStop(1, 'rgba(255,60,150,0)'); g.fillStyle = gr;
    g.beginPath(); g.moveTo(64, 112); g.bezierCurveTo(-8, 62, 20, 2, 64, 36); g.bezierCurveTo(108, 2, 136, 62, 64, 112); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const heartGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending })); heartGlow.renderOrder = 30; heartGlow.visible = false; scene.add(heartGlow);
  const hc = { b: 0, shot: -1, since: 0, fov: 0, q: new THREE.Quaternion(), pos: new THREE.Vector3(), at: new THREE.Vector3(), tgt: new THREE.Vector3(), keepPos: new THREE.Vector3(), keepQ: new THREE.Quaternion() };
  function heartCamera(dt, t) {
    const on = focusWant > 0 && !inCall && chestNode; hc.b += ((on ? 1 : 0) - hc.b) * Math.min(1, dt * (on ? 3 : 4)); fp.locked = on;
    if (hc.b < 0.004) { if (hc.fov) { camera.fov = hc.fov; hc.fov = 0; camera.updateProjectionMatrix(); } hc.shot = -1; heartGlow.visible = false; return; }
    if (!hc.fov) hc.fov = camera.fov;
    const n = Math.max(0, Math.min(10, Math.round(focusWant * 10))), shotN = on ? n : Math.max(0, hc.shot), shot = HSHOT[shotN], p = shotN / 10;
    const kind = hpose.on ? HPOSE[hpose.i % HPOSE.length][2] : 'stand', lying = kind === 'lie', whole = kind !== 'stand';
    if (shotN !== hc.shot) { hc.shot = shotN; hc.since = t; }                                          // a pop: cut to the next angle
    chestNode.getWorldPosition(heartAt); const yw = vrm.scene.rotation.y, lx = Math.cos(yw), lz = -Math.sin(yw); heartAt.x += 0.04 * lx; heartAt.z += 0.04 * lz; heartAt.y += 0.07;
    if (shot.at === 'face') { head.getWorldPosition(hc.tgt); hc.tgt.y += 0.06; } else if (shot.at === 'hand') palmR.getWorldPosition(hc.tgt); else if (shot.at === 'shoulder') { hc.tgt.copy(heartAt); hc.tgt.x += 0.1 * lx; hc.tgt.z += 0.1 * lz; hc.tgt.y += 0.1; } else hc.tgt.copy(heartAt);
    if (whole) { head.getWorldPosition(hc.tgt); hipsNode.getWorldPosition(hc.at); hc.tgt.lerp(hc.at, 0.5); }   // sitting or lying: all of her in the picture
    else hc.tgt.lerp(heartAt, p * p * 0.85);                                                           // on her feet: every shot leans a little more toward her heart
    const age = (t - hc.since) / 1000, dist = (1.45 - 1.03 * Math.pow(p, 1.15)) * (1 - 0.035 * Math.min(age, 4)), wide = 0.35 + 0.65 * dist / 1.45;   // slow push in; angles narrow as it closes
    const a = yw + shot.yaw * wide + 0.07 * age * (shotN % 2 ? 1 : -1) * wide, elev = shot.up * wide + 0.015 * age + (lying ? 0.8 : whole ? 0.14 : 0);   // look down at her when she is lying
    const dd = lying ? Math.max(dist, 3.0) : whole ? Math.max(dist, 2.2) : dist;
    hc.pos.set(hc.tgt.x + Math.sin(a) * Math.cos(elev) * dd, hc.tgt.y + Math.sin(elev) * dd, hc.tgt.z + Math.cos(a) * Math.cos(elev) * dd);
    const e = hc.b * hc.b * (3 - 2 * hc.b); hc.keepPos.copy(camera.position); hc.keepQ.copy(camera.quaternion);
    camera.position.copy(hc.pos); camera.lookAt(hc.tgt);
    if (e < 0.995) { hc.q.copy(camera.quaternion); camera.position.lerpVectors(hc.keepPos, hc.pos, e); camera.quaternion.slerpQuaternions(hc.keepQ, hc.q, e); }   // easing in from (or back out to) the ordinary view
    camera.fov = hc.fov + (32 - hc.fov) * e; camera.updateProjectionMatrix();
    const beat = 1 + 0.12 * Math.abs(Math.sin(t / 1000 * (3 + 5 * p))); heartGlow.visible = true; heartGlow.position.copy(heartAt).addScaledVector(hc.pos.clone().sub(heartAt).normalize(), 0.09); heartGlow.scale.setScalar((0.07 + 0.1 * p) * beat); heartGlow.material.opacity = e * Math.min(1, 0.15 + p * 1.1);
  }
  // ---- the bonus round after a win: time stands still (her pose and hair freeze) and the view cuts to another part of her every 3 s.
  let frozen = false, frozeAt = 0; const bz = { mode: 'cut', shot: 0, yaw: 0, pitch: 0.12, dist: 1.15 }; const BSHOT = [{ at: 'face', yaw: 0.15, up: 0.08, d: 0.8 }, { at: 'heart', yaw: -0.2, up: 0.12, d: 0.62 }, { at: 'hand', yaw: -0.3, up: 0.35, d: 0.6 }, { at: 'shoulder', yaw: 0.5, up: 0.16, d: 0.75 }];
  const spot = (name, out) => { // a place on her, in the world
    chestNode.getWorldPosition(heartAt); const yw = vrm.scene.rotation.y, lx = Math.cos(yw), lz = -Math.sin(yw); heartAt.x += 0.04 * lx; heartAt.z += 0.04 * lz; heartAt.y += 0.07;
    if (name === 'face') { head.getWorldPosition(out); out.y += 0.06; } else if (name === 'hand') palmR.getWorldPosition(out); else if (name === 'handL') palmL.getWorldPosition(out); else if (name === 'shoulder' || name === 'shoulderR') { out.copy(heartAt); const sd = name === 'shoulder' ? 0.1 : -0.18; out.x += sd * lx; out.z += sd * lz; out.y += 0.1; } else out.copy(heartAt);
    return out; };
  function bonusCamera(t) {
    const yw = vrm.scene.rotation.y; let a, elev, d;
    if (bz.mode === 'orbit') { spot('heart', hc.tgt); hc.tgt.y += 0.1; a = yw + bz.yaw; elev = bz.pitch; d = bz.dist; }               // yours to turn: round her upper body, at whatever distance you like
    else { const sh = BSHOT[bz.shot % BSHOT.length], age = Math.min(6, (t - frozeAt) / 1000); a = yw + sh.yaw + 0.04 * age; elev = sh.up + 0.008 * age; d = sh.d * (1 - 0.02 * age); spot(sh.at, hc.tgt); if (sh.at !== 'heart') hc.tgt.lerp(heartAt, 0.25); }   // a held shot, drifting a little; the next tap cuts
    camera.position.set(hc.tgt.x + Math.sin(a) * Math.cos(elev) * d, hc.tgt.y + Math.sin(elev) * d, hc.tgt.z + Math.cos(a) * Math.cos(elev) * d); camera.lookAt(hc.tgt);
    spot('heart', hc.at); heartGlow.visible = true; heartGlow.position.copy(hc.at).addScaledVector(hc.pos.copy(camera.position).sub(hc.at).normalize(), 0.09); heartGlow.scale.setScalar(0.13 * (1 + 0.14 * Math.abs(Math.sin(t / 110)))); heartGlow.material.opacity = 1;
  }
  // ---- one-on-one time: she stands facing you at arm's length. You can look about a little and lean round her, but not walk off.
  // ---- D&D night: a round table set down in front of you, a Dungeon Master across it, her at your left. You sit; you can glance
  // around. It opens with a scene of its own (dndSurprise): she sees the table, rushes you, spins you round, hugs you, kisses you,
  // pulls back and gets down to business. All of it is your own eyes: the camera stays on her face.
  const dn = { on: false, cut: 0, lx: 0, ly: 0, ox: 0, oz: 0, yaw: 0, px: 0, pz: 0 }, dnG = new THREE.Group(); dnG.visible = false; scene.add(dnG);
  { const T = c => (kit.toon ? kit.toon(c) : new THREE.MeshToonMaterial({ color: c })), add = (g, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; dnG.add(o); return o; }, glowM = c => new THREE.MeshBasicMaterial({ color: c });
    add(new THREE.CylinderGeometry(0.78, 0.78, 0.06, 28), T('#6b4326'), 0, 0.74, 0); add(new THREE.CylinderGeometry(0.7, 0.7, 0.012, 28), T('#2f6b4a'), 0, 0.776, 0); add(new THREE.CylinderGeometry(0.1, 0.16, 0.72, 12), T('#4a2d18'), 0, 0.36, 0);   /* the table, with a green felt */
    add(new THREE.BoxGeometry(0.5, 0.008, 0.36), T('#e8d9b0'), 0.02, 0.786, 0.05, 0.2);                                                                                                            /* the map */
    for (const [x, z, c] of [[-0.22, -0.2, '#c0392b'], [-0.12, -0.28, '#8e44ad'], [0.25, -0.22, '#f1c40f'], [0.33, -0.1, '#2980b9']]) add(new THREE.IcosahedronGeometry(0.028, 0), T(c), x, 0.81, z, x * 9);   /* dice */
    add(new THREE.CylinderGeometry(0.022, 0.026, 0.11, 10), T('#f4ecd8'), -0.42, 0.835, 0.22); const flame = add(new THREE.SphereGeometry(0.022, 8, 8), glowM('#ffcf6b'), -0.42, 0.915, 0.22); flame.scale.y = 1.7; const cl = new THREE.PointLight('#ffb968', 1.6, 4.5, 1.6); cl.position.set(-0.42, 0.95, 0.22); dnG.add(cl); dn.flame = flame; dn.light = cl;
    for (const [x, ry] of [[-0.3, 0.45], [0, 0], [0.3, -0.45]]) add(new THREE.BoxGeometry(0.3, 0.26, 0.012), T('#5a1f2e'), x, 0.92, 0.5 - Math.abs(x) * 0.22, ry);                                 /* the DM's screen */
    /* the Dungeon Master: a robed old game master with a long white beard, on the far side */
    const dm = new THREE.Group(); dm.position.set(0, 0, 1.12); dnG.add(dm); const part = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; dm.add(o); return o; };
    part(new THREE.CylinderGeometry(0.2, 0.36, 1.05, 16), T('#3b2a5c'), 0, 0.6, 0); part(new THREE.SphereGeometry(0.2, 16, 12), T('#3b2a5c'), 0, 1.22, 0.02).scale.set(1, 1.08, 1.05); dn.dmHead = part(new THREE.SphereGeometry(0.13, 16, 12), T('#d9b08c'), 0, 1.2, -0.09);
    part(new THREE.ConeGeometry(0.11, 0.42, 12), T('#f2f2f2'), 0, 1.0, -0.17).rotation.x = Math.PI + 0.25; part(new THREE.ConeGeometry(0.2, 0.34, 14), T('#2a1d45'), 0, 1.5, 0.02); for (const sx of [-0.045, 0.045]) part(new THREE.SphereGeometry(0.014, 8, 8), glowM('#1a1226'), sx, 1.225, -0.21);
    for (const sx of [-1, 1]) { const a = part(new THREE.CapsuleGeometry(0.055, 0.42, 4, 10), T('#3b2a5c'), sx * 0.3, 0.86, -0.3); a.rotation.set(1.15, 0, sx * 0.35); part(new THREE.SphereGeometry(0.05, 10, 8), T('#d9b08c'), sx * 0.2, 0.8, -0.5); } dn.dm = dm; dn.stool = add(new THREE.CylinderGeometry(0.19, 0.17, 1, 14), T('#4a2d18'), 0.78, 0.22, 0.5); add(new THREE.CylinderGeometry(0.2, 0.18, 0.5, 14), T('#4a2d18'), 0, 0.25, 1.12); }
  function dndMode(on) { on = !!on; if (on === dn.on) return dn.on; dn.on = on; dnG.visible = on; dn.lx = dn.ly = 0; dn.cut = 0;
    if (on) { /* the table goes down a step and a half in front of where you stand, facing you */ const fx = Math.sin(fp.yaw), fz = Math.cos(fp.yaw); dn.yaw = fp.yaw; dn.px = fp.x; dn.pz = fp.z; dn.ox = fp.x + fx * 1.95; dn.oz = fp.z + fz * 1.95; dnG.position.set(dn.ox, floorY, dn.oz); dnG.rotation.y = fp.yaw; vrm.scene.visible = true; }
    return dn.on; }
  function dndSurprise() { if (dn.on) dn.cut = performance.now(); }
  function dndCamera(dt, t) { if (!dn.on) return; fp.locked = true; const fx = Math.sin(dn.yaw), fz = Math.cos(dn.yaw), rx = Math.cos(dn.yaw), rz = -Math.sin(dn.yaw), eye = floorY + 1.22;
    dn.flame.scale.x = dn.flame.scale.z = 1 + 0.15 * Math.sin(t / 90); dn.light.intensity = 1.5 + 0.35 * Math.sin(t / 130) * Math.sin(t / 47); dn.dmHead.rotation.y = 0.12 * Math.sin(t / 2300); dn.dm.rotation.z = 0.015 * Math.sin(t / 1700);
    const put = (x, z, yaw) => Object.assign(rt, { act: 'up', leaving: false, stand: 1, k: 1, x, z, yaw, i: 0, stepT: 0, until: performance.now() + 60000, nextAt: performance.now() + 600000 });
    const tau = window.WIZRA_DND_T !== undefined ? window.WIZRA_DND_T : dn.cut ? (performance.now() - dn.cut) / 1000 : -1;   /* (WIZRA_DND_T: hold the surprise at one moment, for looking at it) */
    if (tau >= 0 && tau < 9.2) { /* the surprise, second by second: 0 she sees it, 1.2 she runs at you, 2.3 she spins you round, 4.4 a hug, 5.8 a kiss, 7.6 she pulls back */
      const ease = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); }, dist = tau < 1.2 ? 2.1 : tau < 2.3 ? 2.1 - 1.35 * ease((tau - 1.2) / 1.1) : tau < 4.4 ? 0.75 : tau < 5.8 ? 0.75 - 0.33 * ease((tau - 4.4) / 0.5) : tau < 7.6 ? 0.42 - 0.1 * ease((tau - 5.8) / 0.5) : 0.32 + 1.1 * ease((tau - 7.6) / 0.9);
      const spin = tau < 2.3 ? 0 : Math.PI * 2 * ease((tau - 2.3) / 2.1), hx = dn.px + fx * 0.75, hz = dn.pz + fz * 0.75, ang = dn.yaw + Math.PI + spin;   /* she holds the middle; you go round her, and she turns to keep facing you: the room spins */
      put(hx, hz, ang); head.getWorldPosition(tmpA); const hy = Math.max(tmpA.y, floorY + 1.2), side = tau >= 4.4 && tau < 5.8 ? 0.11 : 0;
      camera.position.set(hx + Math.sin(ang) * dist + Math.cos(ang) * side, hy + 0.03 + (tau >= 4.4 && tau < 5.8 ? 0.06 : 0), hz + Math.cos(ang) * dist - Math.sin(ang) * side); camera.lookAt(hx, hy - (tau >= 5.8 && tau < 7.6 ? 0.035 : 0.01), hz); return; }
    if (dn.cut) dn.cut = 0;
    /* everyone sits. She has a stool at the table beside the Dungeon Master, half turned to you, feet on the floor. She is held on it: nothing walks her off, and her reactions happen in her seat */
    const sx = dn.ox + rx * 0.78 + fx * 0.5, sz = dn.oz + rz * 0.78 + fz * 0.5, yaw = Math.atan2(dn.px - sx, dn.pz - sz) * 0.45 + Math.atan2(dn.ox - sx, dn.oz - sz) * 0.55, now = performance.now();
    if (rt.act !== 'sit' && rt.act !== 'gone') rt.act = rt.stand > 0.02 ? 'sitdown' : 'sit'; if (rt.act === 'sitdown') rt.act = 'sit';
    Object.assign(rt, { leaving: false, steps: [], i: 0, stepT: 0, after: '', label: '', self: false, lieWant: 0, legs: 'floor', legsAt: now + 600000, nextAt: now + 600000, x: sx, z: sz, yaw });
    vrm.scene.position.x = sx - Math.sin(yaw) * hip.z; vrm.scene.position.z = sz - Math.cos(yaw) * hip.z; vrm.scene.rotation.y = yaw;
    if (dn.stool) { vrm.humanoid.getRawBoneNode('hips').getWorldPosition(tmpA); const top = Math.max(0.3, Math.min(0.7, tmpA.y - floorY - 0.1)); dn.stool.scale.y = top; dn.stool.position.y = top / 2; }
    /* you sit at the table too: your eyes are level with theirs, and the Dungeon Master is straight ahead in the middle of the view */
    camera.position.set(dn.px + fx * 0.8, floorY + 1.16, dn.pz + fz * 0.8); camera.lookAt(dn.ox + fx * 1.12, floorY + 0.98, dn.oz + fz * 1.12); camera.rotateY(dn.lx); camera.rotateX(dn.ly); }
  // ---- movie night as a film is shot: fixed cameras that cut from one to the next. You cannot walk; you can only glance around.
  //   'couch'  from behind the couch: the backs of two heads, the TV past them, the couch heavy and dark in front
  //   'side'   from your seat, turned to watch her watch the film
  //   'toss'   from your seat, leaning round to face her: the popcorn game
  // Line weight does the depth: every box in the room gets a dark shell whose thickness depends on how near the camera it is.
  const mv = { on: false, view: 'couch', lx: 0, ly: 0, b: 0, cutAt: 0, pose: 0 }, mvPos = new THREE.Vector3(), mvTgt = new THREE.Vector3(), shellMat = new THREE.MeshBasicMaterial({ color: '#1a1226', side: THREE.BackSide }), shells = [];
  // you, seen from behind: a plain stand-in until a real model of the player is added
  const guy = { tried: false, vrm: null, yaw: 0, head: null };
  const man = new THREE.Group(); { const skin = kit.toon ? kit.toon('#e8b991') : new THREE.MeshToonMaterial({ color: '#e8b991' }), hair = new THREE.MeshToonMaterial({ color: '#3a2a20' }), tee = new THREE.MeshToonMaterial({ color: '#5b6b8a' }), add = (g, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); man.add(o); const sh = new THREE.Mesh(g, shellMat); sh.scale.setScalar(1.09); o.add(sh); return o; };
    add(new THREE.SphereGeometry(0.108, 20, 16), skin, 0, 0, 0, 1, 1.12, 1.02); add(new THREE.SphereGeometry(0.116, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hair, 0, 0.012, -0.012, 1.02, 1.12, 1.06); add(new THREE.SphereGeometry(0.03, 10, 8), skin, -0.112, -0.01, 0.0, 0.6, 1, 0.8); add(new THREE.SphereGeometry(0.03, 10, 8), skin, 0.112, -0.01, 0.0, 0.6, 1, 0.8);
    add(new THREE.CylinderGeometry(0.05, 0.058, 0.12, 14), skin, 0, -0.15, -0.005); add(new THREE.CapsuleGeometry(0.105, 0.3, 6, 14), tee, 0, -0.29, -0.01, 1, 1, 0.8).rotation.z = Math.PI / 2; add(new THREE.CylinderGeometry(0.2, 0.18, 0.42, 16), tee, 0, -0.5, -0.01, 1, 1, 0.62);
    man.visible = false; scene.add(man); }
  function movieShells() { for (const o of tagged) { if (o.userData.place !== 'house' || !o.geometry || o.geometry.type !== 'BoxGeometry') continue; let sh = o.userData.shell; if (!mv.on) { if (sh) sh.visible = false; continue; }
      if (!sh) { sh = o.userData.shell = new THREE.Mesh(o.geometry, shellMat); o.add(sh); shells.push(sh); } const p = o.geometry.parameters, d = o.getWorldPosition(tmpA).distanceTo(mvPos), w = d < 1.7 ? 0.03 : d < 3.2 ? 0.014 : 0.006;   /* near: a heavy line; across the room: a hair */
      sh.scale.set(1 + 2 * w / Math.max(0.02, p.width), 1 + 2 * w / Math.max(0.02, p.height), 1 + 2 * w / Math.max(0.02, p.depth)); sh.visible = true; } }
  function movieSpot(view) { const seat = places.seat.house, tall = Math.max(1, 0.75 / camera.aspect); head.getWorldPosition(tmpB);
    if (view === 'side') { mvPos.set(seat.at[0] - 0.05, seat.h, seat.at[1] + 0.32); mvTgt.set(tmpB.x, tmpB.y - 0.06, tmpB.z + 0.12); }
    else if (view === 'toss') { mvPos.set(seat.at[0] - 0.12, seat.h, seat.at[1] + 0.5 * tall); mvTgt.set(tmpB.x, tmpB.y - 0.08, tmpB.z); }
    else { const b = places.bounds && places.bounds.house, back = seat.at[1] - 1.5 * tall; mvPos.set((tmpB.x + seat.at[0]) / 2, seat.h + 0.95, b ? Math.max(b.z0 + 0.12, back) : back); mvTgt.copy(places.tv.at); mvTgt.y -= 0.75;   /* high enough to see both heads over the couch back, tipped down so the TV sits above them */ mvTgt.x = (mvTgt.x + mvPos.x) / 2; } }
  function movieMode(on, view, level) { if (level !== undefined) mv.level = Math.max(0, Math.min(4, level | 0)); on = !!on && here === 'house'; if (view && ['couch', 'side', 'toss'].includes(view) && view !== mv.view) { mv.view = view; mv.lx = mv.ly = 0; mv.cutAt = performance.now(); } if (on === mv.on) { if (on) { movieSpot(mv.view); movieShells(); } return mv.on; }
    mv.on = on; mv.lx = mv.ly = 0; if (on) { mv.cutAt = performance.now(); movieSpot(mv.view); } movieShells(); if (!on) { man.visible = false; if (guy.vrm) guy.vrm.scene.visible = false; if (mv.bucket) mv.bucket.visible = false; mv.homing = false; vrm.scene.rotation.z = 0; } return mv.on; }
  function movieLook(dx, dy) { if (!mv.on) return; mv.lx = Math.max(-0.7, Math.min(0.7, mv.lx - dx * 0.004)); mv.ly = Math.max(-0.4, Math.min(0.4, mv.ly - dy * 0.003)); }
  function movieCamera(dt) { mv.pose += ((mv.on && rt.act === 'sit' ? 1 : 0) - mv.pose) * Math.min(1, dt * 2); if (!mv.on) return; if (here !== 'house') { movieMode(false); return; } fp.locked = true; movieSpot(mv.view);
    /* she stays on the couch for the whole film. How she sits says how close you are: upright and tidy at first, feet up once she is comfortable, legs across the cushions toward you when you are a couple */
    if (rt.act !== 'gone') { const now = performance.now(); if (rt.act === 'sit') { mv.homing = false; rt.nextAt = now + 600000; rt.legsAt = now + 600000; rt.leaving = false; rt.legs = window.WIZRA_LOUNGE || ['floor', 'crossed', 'up', 'up', 'up'][mv.level | 0]; } else if (rt.act === 'up' && !mv.homing) { rt.steps = wayHome(); rt.i = 0; rt.stepT = 0; rt.after = ''; mv.homing = true; } }
    /* the popcorn: a striped bucket in your lap (from your own seat), or in the lap of the figure on the couch (from behind) */
    if (!mv.bucket) { const g = new THREE.Group(), tub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.062, 0.15, 20, 1, true), new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide })), cv = document.createElement('canvas'); cv.width = 128; cv.height = 8; const c2 = cv.getContext('2d'); for (let i = 0; i < 8; i++) { c2.fillStyle = i % 2 ? '#d7263d' : '#fff6e6'; c2.fillRect(i * 16, 0, 16, 8); } tub.material.map = new THREE.CanvasTexture(cv); tub.material.map.colorSpace = THREE.SRGBColorSpace; g.add(tub);
      const base = new THREE.Mesh(new THREE.CircleGeometry(0.062, 20), new THREE.MeshToonMaterial({ color: '#b51e30' })); base.rotation.x = Math.PI / 2; base.position.y = -0.075; g.add(base); const corn = new THREE.MeshToonMaterial({ color: '#fff3c4' }); for (let i = 0; i < 26; i++) { const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.014 + (i % 3) * 0.003, 0), corn), a = i * 2.4, r = 0.072 * Math.sqrt((i + 0.5) / 26); k.position.set(Math.cos(a) * r, 0.07 + (i % 4) * 0.006 - r * 0.25, Math.sin(a) * r); g.add(k); } scene.add(g); mv.bucket = g; }
    mv.bucket.visible = true;
    const seat = places.seat.house; man.visible = mv.view === 'couch'; man.position.set(seat.at[0], seat.h + 0.05, seat.at[1] - 0.16); man.rotation.y = 0.08;
    /* a real figure for you on the couch, if one has been uploaded (/api/extra, name 'man': any VRM, for instance a man made in VRoid Studio). He is posed sitting, with his head where the stand-in's was, and only shown in the view from behind the couch. */
    if (!guy.tried) { guy.tried = true; const L2 = new GLTFLoader(); L2.register(p => new VRMLoaderPlugin(p)); L2.loadAsync('/api/extra/man.vrm').then(g => { const v = g.userData.vrm; if (!v) return; VRMUtils.rotateVRM0(v); v.scene.traverse(o => { o.frustumCulled = false; if (o.isMesh) o.castShadow = true; });
        const old = v.meta && v.meta.metaVersion === '0' ? -1 : 1, N = n => v.humanoid.getNormalizedBoneNode(n), R = (n, x, y, z) => { const b = N(n); if (b) b.rotation.set(x * old, y, z * old); };   /* (an older, 0.x model is built facing the other way: bends and leans turn the opposite way on it) */ for (const sd of ['left', 'right']) { const k = sd === 'left' ? 1 : -1; R(sd + 'UpperLeg', -1.5, 0, k * 0.1); R(sd + 'LowerLeg', 1.5, 0, 0); R(sd + 'UpperArm', -0.15, k * -0.2, k * -1.25); R(sd + 'LowerArm', 0, k * -1.0, 0); } R('spine', -0.12, 0, 0); R('neck', 0.06, 0, 0);
        v.update(0); v.scene.updateMatrixWorld(true); const hv = N('head').getWorldPosition(new THREE.Vector3()), lh = v.humanoid.getRawBoneNode('leftUpperLeg').getWorldPosition(new THREE.Vector3()), rh = v.humanoid.getRawBoneNode('rightUpperLeg').getWorldPosition(new THREE.Vector3()), fwd = new THREE.Vector3().crossVectors(lh.sub(rh).setY(0).normalize(), new THREE.Vector3(0, 1, 0));
        guy.base = v.scene.rotation.y; guy.yaw = -Math.atan2(fwd.x, fwd.z); guy.head = hv; v.scene.visible = false; scene.add(v.scene); guy.vrm = v; }).catch(() => {}); }
    if (guy.vrm) { const v = guy.vrm, c = Math.cos(guy.yaw + 0.08), s2 = Math.sin(guy.yaw + 0.08), hx = guy.head.x * c + guy.head.z * s2, hz = -guy.head.x * s2 + guy.head.z * c; man.visible = false; v.scene.visible = mv.view === 'couch'; v.scene.rotation.y = (guy.base || 0) + guy.yaw + 0.08; v.scene.position.set(man.position.x - hx, man.position.y + 0.1 - guy.head.y, man.position.z - hz); try { v.update(Math.min(0.05, dt || 0.016)); } catch {} }
    camera.position.copy(mvPos); camera.lookAt(mvTgt); camera.rotateY(mv.lx); camera.rotateX(mv.ly);
    if (mv.view === 'couch') mv.bucket.position.set(man.position.x, seat.h - 0.42, man.position.z + 0.24); else { camera.updateMatrixWorld(); tmpA.set(0, 0, -1).applyQuaternion(camera.quaternion); tmpA.y = 0; tmpA.normalize(); mv.bucket.position.set(mvPos.x + tmpA.x * 0.42 - tmpA.z * 0.2, mvPos.y - 0.34, mvPos.z + tmpA.z * 0.42 + tmpA.x * 0.2); } mv.bucket.rotation.set(0, 0, 0);
    /* the closer you are, the closer she sits: she shifts over toward you, and as a couple she leans in */
    if (rt.act === 'sit') { const lv = mv.level | 0, toward = Math.sign(seat.at[0] - vrm.scene.position.x) || -1; vrm.scene.position.x += toward * mv.pose * [0, 0.04, 0.1, 0.16, 0.2][lv]; vrm.scene.rotation.z = -toward * mv.pose * [0, 0, 0.03, 0.09, 0.13][lv]; } }
  const hg = { on: false, yaw: 0, lookX: 0, lookY: 0, dist: 1.9, b: 0 };
  function hang(on) { on = !!on; if (on === hg.on) return; hg.on = on; hg.yaw = hg.lookX = hg.lookY = 0; hg.dist = 1.9;
    for (const ms of [900, 2200, 3600]) setTimeout(() => { if (vrm.springBoneManager) vrm.springBoneManager.reset(); }, ms);   // her hair and skirt are put at rest as the view cuts over, so nothing is caught mid-swing
    if (on) { hg.wasGone = rt.act === 'gone'; if (hg.wasGone) { vrm.scene.visible = true; Object.assign(rt, { act: 'up', leaving: false, stand: 1, k: 1, x: STAND_AT[0], z: STAND_AT[1], yaw: 0, i: 0, stepT: 0 }); }   // (she can be called up for this even when she is out: for trying things)
      plan('spending time with you, face to face', [go(STAND_AT), stay(3600)], '', true); }
    else if (hg.wasGone) vanish();
    else if (rt.act === 'up') { rt.steps = wayHome(); rt.i = 0; rt.stepT = 0; rt.label = 'sitting back down'; } }
  function hangView(o) { if (o.yaw !== undefined) hg.yaw = Math.max(-1.1, Math.min(1.1, o.yaw)); if (o.dyaw) hg.yaw = Math.max(-1.1, Math.min(1.1, hg.yaw + o.dyaw)); if (o.dist) hg.dist = Math.max(1.2, Math.min(2.8, o.dist)); if (o.dx !== undefined) { hg.lookX = Math.max(-0.35, Math.min(0.35, hg.lookX + o.dx)); hg.lookY = Math.max(-0.3, Math.min(0.22, hg.lookY + o.dy)); } return { yaw: hg.yaw, dist: hg.dist }; }
  function hangCamera(dt) { hg.b += ((hg.on ? 1 : 0) - hg.b) * Math.min(1, dt * 3); if (hg.b < 0.004) return; if (hg.on) fp.locked = true;
    head.getWorldPosition(tmpA); const tall = Math.max(1, 0.8 / camera.aspect), yw = vrm.scene.rotation.y + hg.yaw, d = hg.dist * tall; hc.pos.set(tmpA.x + Math.sin(yw) * d, tmpA.y + 0.02, tmpA.z + Math.cos(yw) * d);   // always at her eye level, never from below; further back on a tall narrow screen so her shoulders fit
    hc.tgt.set(tmpA.x + Math.cos(yw) * hg.lookX, tmpA.y - 0.1 - 0.13 * tall + hg.lookY, tmpA.z - Math.sin(yw) * hg.lookX);
    const e = hg.b * hg.b * (3 - 2 * hg.b); hc.keepPos.copy(camera.position); hc.keepQ.copy(camera.quaternion); camera.position.copy(hc.pos); camera.lookAt(hc.tgt);
    if (e < 0.995) { hc.q.copy(camera.quaternion); camera.position.lerpVectors(hc.keepPos, hc.pos, e); camera.quaternion.slerpQuaternions(hc.keepQ, hc.q, e); } }
  // where on her a point of the screen lands: { zone, ok }. ok false = somewhere she does not want poked or touched.
  const ZONES = [['hair', () => head.getWorldPosition(tmpB).setY(tmpB.y + 0.15), 0.1, true], ['face', () => head.getWorldPosition(tmpB).setY(tmpB.y + 0.04), 0.085, true], ['chest', () => spot('heart', tmpB), 0.115, false],
    ['shoulderL', () => B('leftUpperArm').getWorldPosition(tmpB), 0.07, true], ['shoulderR', () => B('rightUpperArm').getWorldPosition(tmpB), 0.07, true], ['armL', () => B('leftLowerArm').getWorldPosition(tmpB), 0.065, true], ['armR', () => B('rightLowerArm').getWorldPosition(tmpB), 0.065, true],
    ['handL', () => palmL.getWorldPosition(tmpB), 0.075, true], ['handR', () => palmR.getWorldPosition(tmpB), 0.075, true], ['hips', () => hipsNode.getWorldPosition(tmpB), 0.15, false], ['belly', () => B('spine').getWorldPosition(tmpB).setY(tmpB.y + 0.05), 0.09, true],
    ['thighL', () => B('leftUpperLeg').getWorldPosition(tmpB).setY(tmpB.y - 0.16), 0.1, false], ['thighR', () => B('rightUpperLeg').getWorldPosition(tmpB).setY(tmpB.y - 0.16), 0.1, false], ['kneeL', () => B('leftLowerLeg').getWorldPosition(tmpB), 0.08, true], ['kneeR', () => B('rightLowerLeg').getWorldPosition(tmpB), 0.08, true]];
  function hangZone(e) { const r = renderer.domElement.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1); let best = null;
    for (const [zone, at, rad, ok] of ZONES) { const P3 = at().clone(), c = P3.clone().project(camera); if (c.z > 1) continue; const edge = P3.clone().addScaledVector(up, rad).project(camera), cx = (c.x + 1) / 2 * r.width, cy = (1 - c.y) / 2 * r.height, rp = Math.abs((1 - edge.y) / 2 * r.height - cy), k = Math.hypot(px - cx, py - cy) / Math.max(1, rp);
      if (k <= 1 && (!best || (!ok && best.ok) || (ok === best.ok && k < best.k))) best = { zone, ok, k }; }   // where zones overlap, the off-limits one wins
    return best ? { zone: best.zone, ok: best.ok } : null; }
  function hangMouth() { const r = renderer.domElement.getBoundingClientRect(), yw = vrm.scene.rotation.y; head.getWorldPosition(tmpB); tmpB.y -= 0.035; tmpB.x += Math.sin(yw) * 0.09; tmpB.z += Math.cos(yw) * 0.09; const c = tmpB.clone().project(camera), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), e2 = tmpB.clone().addScaledVector(up, 0.045).project(camera);
    return { x: r.left + (c.x + 1) / 2 * r.width, y: r.top + (1 - c.y) / 2 * r.height, r: Math.abs((e2.y - c.y) / 2 * r.height) }; }
  const HITS = [['heart', 0.05, 6], ['face', 0.115, 2], ['hand', 0.07, 1], ['handL', 0.07, 1], ['shoulder', 0.075, 1], ['shoulderR', 0.075, 1]];
  function bonusHit(e) { // what a tap during the bonus round is worth: her heart 6, her face 2, hands and shoulders 1, anything else 0
    const r = renderer.domElement.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, P3 = new THREE.Vector3(), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    for (const [name, rad, pts] of HITS) {
      spot(name, P3); const c = P3.clone().project(camera); if (c.z > 1) continue; const edge = P3.clone().addScaledVector(up, rad).project(camera);
      const cx = (c.x + 1) / 2 * r.width, cy = (1 - c.y) / 2 * r.height, rp = Math.abs((1 - edge.y) / 2 * r.height - cy); if (Math.hypot(px - cx, py - cy) <= rp) return pts;
    }
    return 0;
  }
  placeCamera(1);
  const chestNode = B('upperChest') || B('chest') || B('spine');
  const target = new THREE.Object3D(); scene.add(target); if (vrm.lookAt) vrm.lookAt.target = target;

  const em = vrm.expressionManager, has = n => em && em.getExpression(n);
  // ---- a picture she sends: one posed frame of her, somewhere, drawn off to the side of the live view and handed back as an image.
  // It is drawn at the top of a frame and the normal frame is drawn straight over it, so the live view never shows it.
  let snapReq = null;
  const snapshot = spec => new Promise(done => { snapReq = { spec, done }; });
  function takeSnap(spec) {
    if (inCall) return '';
    const keep = { vis: vrm.scene.visible, fov: camera.fov, room: room.visible, dorm: places.dorm.visible, house: places.house.visible, sun: sun.intensity, sunC: sun.color.clone(), amb: amb.intensity, bg: el.style.background };
    const props = [book, phone, mug], propVis = props.map(o => o.visible);
    renderer.setSize(480, 600, false); camera.aspect = 0.8;
    if (spec.kind === 'view') { // a picture of something in her room, taken by her: the room as it is, without her in it
      const bd = places.bed.at, V = { room: [[2.7, 1.9, hip.z + 2.8], [0, 0.7, hip.z]], shelf: [[-0.85, 1.3, hip.z + 0.9], [SHELF.x, 1.0, SHELF.z]], counter: [[1.15, 1.4, hip.z + 0.8], [COUNTER.x, 0.95, COUNTER.z]], bed: [[bd[0] + 1.9, 1.7, bd[1] + 0.9], [bd[0], 0.5, bd[1]]],
        table: [[0.55, 1.2, hip.z + 1.9], [0, 0.3, hip.z + 0.8]], window: [[0.1, 1.5, hip.z + 0.7], [0.1, 1.55, hip.z - 1.6]], chair: [[1.2, 1.2, hip.z + 1.7], [0, 0.5, hip.z]] }[spec.target] || [[2.7, 1.9, hip.z + 2.8], [0, 0.7, hip.z]];
      const inHouse = spec.place === 'house'; if (inHouse) { V[0] = [2.7, 1.75, hip.z + 4.3]; V[1] = [-1.2, 0.8, hip.z + 0.9]; }   // (the player's own living room, for the page's backdrop)
      vrm.scene.visible = false; for (const k in places.groups) places.groups[k].visible = k === (inHouse ? 'house' : 'dorm'); room.visible = !inHouse; for (const o of props) o.visible = !inHouse; backdrop.visible = false;
      camera.fov = 52; camera.updateProjectionMatrix(); camera.position.set(V[0][0], floorY + V[0][1], V[0][2]); camera.lookAt(V[1][0], floorY + V[1][1], V[1][2]); renderer.render(scene, camera);
      let shot = ''; try { shot = renderer.domElement.toDataURL('image/webp', 0.86); } catch {}
      setPlace(here); props.forEach((o, i) => { o.visible = propVis[i]; }); vrm.scene.visible = keep.vis; camera.fov = keep.fov; camera.updateProjectionMatrix(); return shot;
    }
    // pose: standing naturally, then whatever her hand is doing
    for (const n of KEYS) set(n, ...standOf(n)); for (const n of ['head', 'neck', 'chest', 'upperChest', 'leftShoulder', 'rightShoulder', 'spine', 'hips']) set(n, 0, 0, 0);
    const home = spec.scene === 'dorm', LIE = { bed: 'female_laying_pose_1', bed2: 'female_laying_pose' }, SIT = { knees: ['female_sitting_pose', 0], knee: ['female_sitting_pose_2', 0], hair: ['female_sitting_pose_1', 0], kick: ['sitting_kicking_legs', 0.5] };
    clipHip = 0; const lying = home && CLIPS[LIE[spec.pose]] ? LIE[spec.pose] : '', sitting = home && SIT[spec.pose] && CLIPS[SIT[spec.pose][0]] ? SIT[spec.pose] : null;   // the recorded poses: on her bed
    if (lying) playClip(lying, 1, 0); else if (sitting) playClip(sitting[0], 1, sitting[1]); else playClip(CLIPS[spec.clip] ? spec.clip : 'idle', 1, spec.t != null ? spec.t : 2);   // (spec.clip + spec.t: any frame of any recorded clip)
    const SIGN_OF = { peace: 'peace', heart: 'fingerheart', fox: 'fox' };
    if (SIGN_OF[spec.pose]) { const tg = sign(SIGN_OF[spec.pose], 6, {}); for (const n in tg) if (n[0] !== '_' && n !== 'spine') set(n, ...tg[n]); set('head', 0, 0, -0.16); }
    else if (spec.pose === 'wave') { set('rightUpperArm', 0, 0, -0.7); set('rightLowerArm', 0, 0, -1.1); set('head', 0, 0, 0.1); }
    else if (!lying && !sitting) set('head', 0.04, 0, spec.pose === 'full' ? 0 : 0.08);
    let gFace = null, gTongue = null; if (spec.gest && GESTURE[spec.gest]) { // a pose she was asked for: any of her gestures, frozen a moment in
      const tg = GESTURE[spec.gest](1.1); for (const n in tg) { if (n === '_head') set('head', ...tg[n]); else if (n === '_face') gFace = tg[n]; else if (n === '_tongue') gTongue = tg[n]; else if (n[0] !== '_' && n !== 'spine' && n !== 'hips') set(n, ...tg[n]); } }
    /* a picture made for the pack can also say: which arm holds the phone (it reaches toward the camera and out of the frame), any bone directly, and her tongue */
    if (spec.arm) { const R = spec.arm === 'R', s = R ? 1 : -1, side = R ? 'right' : 'left', up = spec.high ? 0.95 : 0.55; set(side + 'UpperArm', 0.25, s * 1.0, -s * up); set(side + 'LowerArm', 0, s * 0.25, 0); set(side + 'Shoulder', 0, s * 0.12, -s * 0.1); }
    if (spec.set) for (const n in spec.set) set(n, ...spec.set[n]);
    if (hipsNode) hipsNode.position.y = hipY0 + clipHip;
    const want = EXPR[spec.face] || EXPR.happy; if (em) for (const n of NAMES) if (has(n)) em.setValue(n, n === 'blink' ? Math.min(0.3, want[n] || 0) : n === 'aa' || n === 'oh' ? 0 : (want[n] || 0)); if (em && spec.faceW) for (const n in spec.faceW) if (has(n)) em.setValue(n, spec.faceW[n]); if (em && gFace) for (const n in gFace) if (has(n)) em.setValue(n, n === 'blink' ? Math.min(0.5, gFace[n]) : gFace[n]); if (em && has('blink') && has('happy')) { const sm = Math.min(1, em.getValue('happy') * 1.15 + (has('relaxed') ? em.getValue('relaxed') * 0.6 : 0)); em.setValue('blink', em.getValue('blink') * (1 - sm)); }   // a closed-mouth smile for the camera
    if (spec.tongue) gTongue = [spec.tongue[0], spec.tongue[1] || 0, spec.tongue[2] === undefined ? 0.25 : spec.tongue[2]];
    if (gTongue) { tongue.set(gTongue[0], gTongue[1], gTongue[2] === undefined || !spec.tongue ? 0.25 : gTongue[2], 0.5); if (em && has('aa')) em.setValue('aa', Math.max(0.5, (spec.faceW && spec.faceW.aa) || 0)); } else tongue.set(0); tongue.snap();
    // where: her own room as it is, or a painted backdrop of wherever she is
    const custom = spec.scene === 'custom' && window.WIZRA_BG, inDorm = !custom && (spec.scene === 'dorm' || !BACKDROP[spec.scene]); vrm.scene.visible = true;
    for (const k in places.groups) places.groups[k].visible = inDorm && k === 'dorm'; room.visible = inDorm; for (const o of props) o.visible = inDorm; backdrop.visible = !inDorm;
    if (inDorm) { if (lying) { vrm.scene.position.set(places.bed.at[0], places.bed.top, places.bed.at[1]); vrm.scene.rotation.y = -Math.PI / 2; } else if (sitting) { vrm.scene.position.set(places.bed.at[0] + 0.32, places.bed.top - 0.4, places.bed.at[1] + 0.35); vrm.scene.rotation.y = Math.PI / 2 - 0.25; } else { vrm.scene.position.set(1.0, floorY, hip.z + 1.25); vrm.scene.rotation.y = 0.5; } }
    else { vrm.scene.position.set(0, 0, 0); vrm.scene.rotation.y = 0; const c = bdCanvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.clearRect(0, 0, 384, 704); const l = custom ? (c.drawImage(window.WIZRA_BG, 0, 0, 384, 704), spec.light || [1, 1, 1]) : BACKDROP[spec.scene](c, 384, 704); bdTex.needsUpdate = true; sun.position.copy(FRONT); bulbLight.intensity = 0; sun.intensity = Math.PI * 0.9; sun.color.setRGB(l[0], l[1], l[2]); amb.intensity = 0.35; el.style.background = '#000'; }
    if (vrm.springBoneManager) vrm.springBoneManager.reset(); vrm.update(0); vrm.scene.updateMatrixWorld(true); settleCloth();
    head.getWorldPosition(tmpA); const yw = vrm.scene.rotation.y + (spec.turn || 0), fx = Math.sin(yw), fz = Math.cos(yw), full = spec.pose === 'full' || spec.cam === 'full', half = spec.cam === 'half';
    camera.fov = 40; camera.updateProjectionMatrix();
    if (lying) { camera.position.set(places.bed.at[0] + 0.75, places.bed.top + 1.75, places.bed.at[1] - 1.35); camera.lookAt(places.bed.at[0], places.bed.top + 0.12, places.bed.at[1] - 0.05); }   // from up by her pillow
    else if (sitting) { camera.position.set(tmpA.x + fx * 1.9 + fz * 1.0, tmpA.y + 0.7, tmpA.z + fz * 1.9 - fx * 1.0); camera.lookAt(tmpA.x, tmpA.y - 0.3, tmpA.z); }                // from a little above and to one side
    else if (half) { camera.position.set(tmpA.x + fx * 1.55 + fz * 0.15, tmpA.y + 0.05, tmpA.z + fz * 1.55 - fx * 0.15); camera.lookAt(tmpA.x, tmpA.y - 0.3, tmpA.z); }                    // waist up
    else if (full) { camera.position.set(tmpA.x + fx * 3.0 + fz * 0.25, Math.max(floorY + 0.75, tmpA.y - 0.45), tmpA.z + fz * 3.0 - fx * 0.25); camera.lookAt(tmpA.x, Math.max(floorY + 0.35, tmpA.y - 0.72), tmpA.z); }
    else { const side = SIGN_OF[spec.pose] || spec.pose === 'wave' ? -0.13 : 0; camera.position.set(tmpA.x + fx * 0.8 + fz * (0.1 + side), tmpA.y + 0.2, tmpA.z + fz * 0.8 - fx * (0.1 + side)); camera.lookAt(tmpA.x + fz * side, tmpA.y + 0.04, tmpA.z - fx * side); }   // her face, from arm's length and a little above
    if (spec.arm && !lying) { /* a selfie: the camera is the phone in her hand. It sits just past her hand, a little above and inside it, so her arm leaves the picture by a bottom corner and the hand is never in it. */
      const R = spec.arm === 'R', hb = B((R ? 'right' : 'left') + 'Hand'), eb = B((R ? 'right' : 'left') + 'LowerArm'), hp = hb.getWorldPosition(new THREE.Vector3()), ep = eb.getWorldPosition(new THREE.Vector3()), along = hp.clone().sub(ep).normalize(), toHead = tmpA.clone().sub(hp).setY(0).normalize(), across = new THREE.Vector3(toHead.z, 0, -toHead.x).multiplyScalar(R ? 1 : -1);
      camera.position.copy(hp).addScaledVector(along, 0.36).addScaledVector(across, 0.15); camera.position.y += 0.15; camera.fov = 50; camera.updateProjectionMatrix(); camera.lookAt(tmpA.x, tmpA.y - 0.07 + ((spec.view && spec.view[3]) || 0), tmpA.z); 
      /* the camera now stands where the phone would be; her arm is then dropped so it runs out of the bottom of the picture toward it, and the hand is never seen */
      { const s2 = R ? 1 : -1, side = R ? 'right' : 'left'; set(side + 'UpperArm', 0.3, s2 * 0.95, s2 * (spec.high ? -0.25 : 0.2)); set(side + 'LowerArm', 0, s2 * 0.2, 0); if (vrm.springBoneManager) vrm.springBoneManager.reset(); vrm.update(0); vrm.scene.updateMatrixWorld(true); settleCloth(); } }   /* (a phone's front camera is a wide one, held a little past a straight arm) */
    else if (spec.view && !lying) { const [vs, vu, vd, vl] = spec.view; camera.position.set(tmpA.x + fx * vd + fz * vs, tmpA.y + vu, tmpA.z + fz * vd - fx * vs); camera.lookAt(tmpA.x + fz * (spec.arm ? (spec.arm === 'R' ? -0.05 : 0.05) : 0), tmpA.y + (vl || 0), tmpA.z); }   /* her own camera spot: [to her side, above her eyes, how far, where on her it points] */
    if (!inDorm) { backdrop.position.set(tmpA.x, tmpA.y - (full ? 0.6 : half ? 0.35 : 0.3), tmpA.z - 1.05); backdrop.scale.set(full ? 2.4 : half ? 1.6 : 1.5, full ? 1.5 : half ? 1.15 : 1.2, 1); }
    if (!inDorm && spec.arm) { backdrop.scale.set(3.4, 2.5, 1); backdrop.position.y = tmpA.y - 0.15; }
    if (!inDorm) { /* the painted backdrop stands straight behind her as the camera sees her, wherever the camera went, and is big enough to fill the frame */ const dx = tmpA.x - camera.position.x, dz = tmpA.z - camera.position.z, dl = Math.hypot(dx, dz) || 1; backdrop.position.x = tmpA.x + dx / dl * 1.05; backdrop.position.z = tmpA.z + dz / dl * 1.05; backdrop.rotation.y = Math.atan2(-dx, -dz); backdrop.scale.multiplyScalar(spec.turn ? 1.5 : 1.15); }   /* the wide selfie camera, off to one side, sees more of what is behind her */
    /* cheats for a still picture only, undone straight after: a tilted camera, a lens of its own, and parts of her taken out of the shot (a hand or arm that would only be in the way of a close-up) */
    if (spec.fov) { camera.fov = spec.fov; camera.updateProjectionMatrix(); } if (spec.roll) camera.rotateZ(spec.roll);
    const hidden = []; for (const n of spec.hide || []) { const rb = vrm.humanoid.getRawBoneNode(n); if (rb) { hidden.push([rb, rb.scale.clone()]); rb.scale.setScalar(0.0001); } } if (hidden.length) vrm.scene.updateMatrixWorld(true);
    /* a picture is taken looking at whoever holds the camera: her eyes go to the lens */
    if (!lying && spec.eyes !== false) { target.position.copy(camera.position); target.updateMatrixWorld(true); if (vrm.lookAt) { try { vrm.lookAt.update(0); } catch {} } vrm.scene.updateMatrixWorld(true); }
    blushMat.opacity = (spec.blush || 0) * 0.5;
    renderer.render(scene, camera); blushMat.opacity = blushNow; for (const [rb, sc] of hidden) rb.scale.copy(sc);
    let url = ''; try { url = renderer.domElement.toDataURL('image/webp', 0.86); } catch {}
    // and put everything back for the live view (the pose and camera are rebuilt every frame anyway)
    backdrop.visible = false; backdrop.scale.set(1, 1, 1); backdrop.rotation.y = 0; setPlace(here); props.forEach((o, i) => { o.visible = propVis[i]; });
    vrm.scene.visible = keep.vis; camera.fov = keep.fov; camera.updateProjectionMatrix(); sun.intensity = keep.sun; sun.color.copy(keep.sunC); amb.intensity = keep.amb; el.style.background = keep.bg; clipHip = 0; if (vrm.springBoneManager) vrm.springBoneManager.reset();
    return url;
  }
  const w = {}; for (const n of NAMES) w[n] = 0;
  let size = '', thumbCb = null;
  const v3 = new THREE.Vector3();
  const project = (x, y, z) => { const r = renderer.domElement.getBoundingClientRect(); v3.set(x, y, z).project(camera); return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height, behind: v3.z > 1 }; };
  const UNIT = 0.0027; // metres per puppet-space unit (her face is about 80 units tall there)

  return {
    el,
    thumb(cb) { thumbCb = cb; },
    // her routine: what she is doing now (for the chat), and a way to tell her to do something
    activity() { return rt.act === 'gone' ? 'out' : rt.act === 'up' || rt.act === 'sitdown' ? rt.label : (DOING[rt.act] || ''); },
    presence, glow(kind) { rt.glow = kind || ''; }, call, callShow, movie(on, tint) { cinema = on ? (tint || '#cfe0ff') : ''; places.tv.film = cinema; if (here === 'house') places.tv.on = !!on && places.power; (el.closest('#stage') || el).dataset.cinema = on ? '1' : ''; daylight(); },
    weather(kind) { places.sky = kind || ''; (el.closest('#stage') || el).dataset.weather = kind || ''; if (kind !== 'stormy' && !places.power) power(true); regloom(); }, power,
    doActivity(name) { rt.self = false; startActivity(name); },   // asked for (by you, or by what she wrote): not a whim to drop when you speak
    // a tap that missed her: what in the room it landed on, and sending her to it
    pick, direct,
    // visiting (see visit above): where you are, whether you are seeing through your own eyes, and turning your head
    visit, place: () => here, fp: () => fp.on,
    walkTo, holdClip, where: () => [rt.k > 0.5 ? rt.x : 0, rt.k > 0.5 ? rt.z : hip.z], clips: () => Object.keys(CLIPS), gestures: () => Object.keys(GESTURE).filter(n => n !== 'test'),
    // what the Studio needs to draw the rooms without her model: floor height, each room's walls and the built-in furniture's footprints
    layout: () => ({ floorY, hipZ: hip.z, bounds: { dorm: places.bounds.dorm, house: places.bounds.house }, solid: places.baseSolid, anchors: { seat: [0, hip.z], stand: STAND_AT, shelf: AT_SHELF, counter: AT_COUNTER, door: DOOR, bed: places.bed.side } }),
    look(dx, dy) { if (dn.on) { if (!dn.cut) { dn.lx = Math.max(-0.8, Math.min(0.8, dn.lx - dx * 0.004)); dn.ly = Math.max(-0.4, Math.min(0.4, dn.ly - dy * 0.003)); } return; } if (mv.on) return movieLook(dx, dy); if (!fp.on || fp.locked) return; fp.yaw -= dx * 0.0052; fp.pitch = Math.max(-1.15, Math.min(1.15, fp.pitch - dy * 0.0042)); },
    // wheel or pinch in the enlarged view: positive pulls back toward the whole-body view
    zoom(d) { if (focusWant > 0) return true; if (inCall || !document.body.classList.contains('big')) return false; zoomWant = Math.max(0, Math.min(1, zoomWant + d)); localStorage.setItem('brenai.zoom', zoomWant.toFixed(2)); return true; },
    locate(e) { // screen -> puppet space, measured from her eye line
      const c = project(eye.x, eye.y, eye.z), up = project(eye.x, eye.y + 0.1, eye.z), k = (c.y - up.y) / 0.1 || 1;
      if (c.behind) return { x: -9999, y: -9999 };                                 // she is behind you
      return { x: 100 + (e.clientX - c.x) / k / UNIT, y: 100 + (e.clientY - c.y) / k / UNIT };
    },
    heartPose, heartStage,
    bonus(on) { // true: time stops and the view holds a shot; 'orbit': the pose stays and you turn the view yourself; false: back to normal
      if (on === 'orbit') { const sh = BSHOT[bz.shot % BSHOT.length]; Object.assign(bz, { mode: 'orbit', yaw: sh.yaw, pitch: 0.14, dist: 1.1 }); return; }
      frozen = !!on; frozeAt = performance.now(); fp.locked = frozen; Object.assign(bz, { mode: 'cut', shot: 0 }); if (!on) heartGlow.visible = false; },
    bonusShot() { bz.shot++; frozeAt = performance.now(); },
    bonusOrbit(dx, dy, dz) { bz.yaw -= dx * 0.008; bz.pitch = Math.max(-0.05, Math.min(1.25, bz.pitch + dy * 0.006)); bz.dist = Math.max(0.5, Math.min(2.8, bz.dist * (1 + dz))); },
    bonusHit, hang, hangView, hangZone, hangMouth, movieMode, movieLook, dndMode, dndSurprise, setBuild,
    snapshot, focus(k) { focusWant = Math.max(0, Math.min(1, k)); }, tears(on) { tearsWant = on ? 1 : 0; },
    // ---- photo studio (owner's tool, public/photo.js): time stops for her, the camera is free, and she can be posed by hand ----
    photo(on) { on = !!on; if (on === ph.on) return ph.on; ph.on = on; if (on) { if (ph.place !== here) { ph.place = here; Object.assign(ph.off, { x: 0, y: 0, z: 0, ry: 0 }); ph.snap = null; ph.dirty = false; }   /* another room: nothing carries over */ ph.fov0 = camera.fov; head.getWorldPosition(tmpA); const c = ph.c, d = tmpB.copy(camera.position).sub(tmpA); c.tx = tmpA.x; c.ty = tmpA.y - 0.25; c.tz = tmpA.z; c.dist = Math.max(0.6, Math.min(6, d.length())); c.yaw = Math.atan2(d.x, d.z); c.pitch = Math.max(-0.2, Math.min(1.2, Math.asin(Math.max(-1, Math.min(1, (camera.position.y - c.ty) / c.dist))))); c.roll = 0; c.fov = camera.fov; ph.liveUntil = performance.now() + 300; ph.restore = !!ph.snap; phOffApply(); }   /* (put back where she was moved straight away: on a slow device the short live moment may not get a frame) */
      else { phSave(); photoFade(1); vrm.scene.visible = rt.act !== 'gone'; camera.fov = ph.fov0 || camera.fov; camera.updateProjectionMatrix(); size = ''; try { for (const n of ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink', 'blinkLeft', 'blinkRight']) vrm.expressionManager.setValue(n, 0); } catch {} } return ph.on; },
    photoCam(o) { const c = ph.c; if (!o) return { ...c }; if (o.orbit) { c.yaw -= o.orbit[0] * 0.006; c.pitch = Math.max(-1.2, Math.min(1.5, c.pitch + o.orbit[1] * 0.006)); }
      if (o.pan) { camera.updateMatrixWorld(); const k = c.dist * 0.0016, r = tmpA.setFromMatrixColumn(camera.matrixWorld, 0), u = tmpB.setFromMatrixColumn(camera.matrixWorld, 1); c.tx -= (r.x * o.pan[0] - u.x * o.pan[1]) * k; c.ty -= (r.y * o.pan[0] - u.y * o.pan[1]) * k; c.tz -= (r.z * o.pan[0] - u.z * o.pan[1]) * k; }
      if (o.look) { /* turn the view where the camera stands: what it aims at moves, the camera does not */ const off = (y, p) => [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)], a = off(c.yaw, c.pitch), P = [c.tx + a[0] * c.dist, c.ty + a[1] * c.dist, c.tz + a[2] * c.dist]; c.yaw += (o.look[0] || 0) * 0.004; c.pitch = Math.max(-1.3, Math.min(1.45, c.pitch + (o.look[1] || 0) * 0.004)); const b2 = off(c.yaw, c.pitch); c.tx = P[0] - b2[0] * c.dist; c.ty = P[1] - b2[1] * c.dist; c.tz = P[2] - b2[2] * c.dist; }
      if (o.dolly) c.dist = Math.max(0.2, Math.min(12, c.dist * Math.exp(o.dolly * 0.0024))); for (const k of ['fov', 'roll', 'dist', 'yaw', 'pitch', 'tx', 'ty', 'tz']) if (Number.isFinite(o[k])) c[k] = o[k]; c.fov = Math.max(8, Math.min(90, c.fov)); c.ty = Math.max(floorY + 0.03, c.ty); return { ...c }; },
    photoAim(part) { const b = B(part === 'feet' ? 'leftFoot' : part === 'hips' ? 'hips' : part === 'chest' ? 'chest' : 'head'); if (!b) return; b.getWorldPosition(tmpA); ph.c.tx = tmpA.x; ph.c.ty = tmpA.y; ph.c.tz = tmpA.z; },
    photoPick(x, y) { const r = renderer.domElement.getBoundingClientRect(); let best = null; for (const n of PH_BONES) { const b = B(n); if (!b) continue; b.getWorldPosition(tmpA).project(camera); if (tmpA.z > 1) continue; const d = Math.hypot((tmpA.x + 1) / 2 * r.width + r.left - x, (1 - tmpA.y) / 2 * r.height + r.top - y); if (!best || d < best.d) best = { n, d }; } return best && best.d < 70 ? best.n : ''; },
    /* Nudge one part by mouse travel: 'v' swings its far end up or down on screen, 'h' swings it left or right, 'twist' turns it about its own length. */
    photoNudge(name, kind, px) { const b = B(name); if (!b || !px) return null; phTouched(); const N = photoNudge_; b.updateWorldMatrix(true, false); const kid = name === 'hips' || name === 'head' ? null : b.children.find(c => c.position.lengthSq() > 1e-4), wq = b.getWorldQuaternion(N.q1), J = b.getWorldPosition(N.j), d = kid ? kid.getWorldPosition(N.d).sub(J).normalize() : N.d.set(0, 1, 0).applyQuaternion(wq), ang = Math.max(-0.5, Math.min(0.5, px * 0.008));
      if (kind === 'depth') { N.ax.crossVectors(d, N.to.copy(camera.position).sub(J).normalize()); if (N.ax.lengthSq() < 1e-4) return [b.rotation.x, b.rotation.y, b.rotation.z]; N.ax.normalize(); }   /* tip toward the camera (or away): its line on screen keeps its direction */
      else if (kind === 'twist') N.ax.copy(d); else { camera.updateMatrixWorld(); const n = N.up.copy(J).project(camera), to = N.to.set(n.x + (kind === 'h' ? 0.2 : 0), n.y + (kind === 'v' ? 0.2 : 0), n.z).unproject(camera).sub(J).normalize();   /* 'to' is where screen-right (or screen-up) lies in the room, taken from the picture itself */
        N.ax.crossVectors(d, to); if (N.ax.lengthSq() < 1e-4) return [b.rotation.x, b.rotation.y, b.rotation.z]; N.ax.normalize(); }
      const pq = b.parent.getWorldQuaternion(N.q2), keep = N.q4.copy(b.quaternion); b.quaternion.copy(N.q3.setFromAxisAngle(N.ax, ang).multiply(wq)).premultiply(pq.invert()); const L = PH_LIMIT[name.replace(/^(left|right)/, '')] || 1.6, r = b.rotation; if (Math.abs(r.x) > L || Math.abs(r.y) > L || Math.abs(r.z) > L) b.quaternion.copy(keep);   /* past what the joint allows: stay put */
      return [b.rotation.x, b.rotation.y, b.rotation.z]; },
    /* Sketch posing. photoAt: where a joint is on the screen. photoPoint: turn one part so its far end lies under a screen point. A drawn
       line is flat, so when the line is shorter than the part, the part is tipped toward the camera by the missing length. */
    /* move all of her so that one joint sits under a point on the screen, at the distance from the camera it already has (she is never put below the floor) */
    photoPlace(name, x, y) { const b = B(name); if (!b) return false; b.updateWorldMatrix(true, false); camera.updateMatrixWorld(); const r = renderer.domElement.getBoundingClientRect(), J = b.getWorldPosition(tmpA), n = tmpB.copy(J).project(camera), P = tmpB.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2, n.z).unproject(camera).sub(J);
      const dy = Math.max(floorY - vrm.scene.position.y, P.y); vrm.scene.position.x += P.x; vrm.scene.position.y += dy; vrm.scene.position.z += P.z; ph.off.x += P.x; ph.off.y += dy; ph.off.z += P.z; vrm.scene.updateMatrixWorld(true); return true; },
    /* the beach round: beach(on) shows it and starts her running; beachView(n) cuts to view n; beachPause(on) stops her (the view can then be dragged with
       beachOrbit(dx, dy, zoom) and goes back when the pause comes off); beachPose(on) has her stop and stand there, for the photo studio */
    beach(on) { return beachMode(on); }, beachView(n, secs) { if (!bh.on) return 0; const ms = Math.max(0, (secs == null ? 2.6 : +secs) * 1000); bh.view = Math.max(0, n | 0); bh.since = performance.now(); bh.has = false; bh.oy = bh.op = bh.od = 0; bh.cutUntil = performance.now() + ms; bh.wasClose = ms > 0; if (ms && beach) { const b = B(BVIEW[bh.view % BVIEW.length].at) || hipsNode; beach.bubbles(b.getWorldPosition(tmpA), 26); } return ms; },   /* a close look at one part of her for a moment, time held still and bubbles rising, then back to the wide view; returns how long, in ms */
    beachPause(on) { if (!bh.on) return false; bh.paused = !!on; if (!on) bh.oy = bh.op = bh.od = 0; return bh.paused; }, beachOrbit(dx, dy, dz) { if (!bh.on || !bh.paused) return; bh.oy -= (dx || 0) * 0.006; bh.op = Math.max(-0.7, Math.min(1.2, bh.op + (dy || 0) * 0.005)); bh.od = Math.max(-1.2, Math.min(1.6, bh.od + (dz || 0))); },
    /* The still games. beachGame('sand') lays her on her back on the sand; beachGame('sun', 'chair' | 'lounger') sits her in the chair or lays her on her front on the lounger.
       beachSand(x, y) heaps sand where the pointer is and answers how much of her is under it (0..1). beachRub(x, y, amount) rubs sunscreen in near the pointer.
       beachSunTick(dt, secondsToBurn) lets the sun work on what is not covered and answers { cover, burn, score }. beachRoll() turns her over (lounger only).
       beachReach(x, y) says which hand or foot is under the pointer, for dragging it. beachTurn(dyaw, dpitch, zoom) moves the view. */
    beachGame(mode, how) { if (!bh.on) return null; if (mode === 'chase') { bh.mode = 'chase'; bh.inited = false; bh.outro = 0; bh.cutUntil = 0; Object.assign(CH, { x: 3.2, me: 0, z: RUN_Z, mz: RUN_Z, wt: 0, t: 0, slow: 0, boost: 1.5, jolt: 0, fall: -1, look: 1, lookT: 1.2, side: 1, lk: 0, has: false }); bh.settle = 3; return { chase: true }; } bh.mode = mode === 'sand' || mode === 'sun' ? mode : 'run'; bh.inited = false; bh.outro = 0; bh.cutUntil = 0; bg.side = mode === 'sun' && how !== 'chair' ? 'b' : 'f'; bg.done = {}; bg.hurtWant = 0; bh.want = mode === 'sand' ? 'back' : how === 'chair' ? 'chair' : 'front'; beach.clearSand(); beach.sandStop(); bg.sandOn = false; bg.zone = 0; bg.has = false; bgClearBlobs();
      Object.assign(bg.cam, mode === 'sand' ? { yaw: 0.45, pitch: 0.95, dist: 3.5 } : how === 'chair' ? { yaw: 0.25, pitch: 0.42, dist: 3.0, zoom: 1 } : { yaw: 0.8, pitch: 0.95, dist: 3.1, zoom: 1 }); return { mode: bh.mode, pose: bh.want, zones: (SUNZ[bg.side] || SUNZ.f).map(z => z[0]) }; },
    /* sand is poured where the pointer points on the ground (or on her): beach.js keeps the heap and lets it slump. beachBuried says how much of her is under it. */
    beachSand(x, y) { if (!bh.on || bh.mode !== 'sand') return 0; const r = renderer.domElement.getBoundingClientRect(); tmpA.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2, 0.5).unproject(camera).sub(camera.position).normalize(); const k = (floorY + 0.1 - camera.position.y) / (tmpA.y || -1e-6); if (k < 0 || k > 30) return this.beachBuried();
      beach.sandPour(camera.position.x + tmpA.x * k, camera.position.z + tmpA.z * k, 0.075); return this.beachBuried(); },
    beachBuried() { let n = 0, got = 0; for (const pt of bg.pts) { if (!pt.on.includes('s') || !bgPoint(pt)) continue; n++; if (beach.sandOver(pt.p.x, pt.p.y + 0.035, pt.p.z) > 0) got++; } return n ? got / n : 0; },   /* a spot is buried when the sand stands over it */
    beachBody() { if (bh.on && bh.mode === 'sand') bgBody(); },   /* she was moved: work out again where she is over the sand */
    /* The cream. beachSquirt(x, y) puts a lump of it on her where the pointer hits her (nothing lands on parts that are not being done, or off her). beachRub(x, y, amount)
       pushes the lumps under the pointer flat and works them in: it answers which spot was reached and the screen places of spots that have just become fully covered.
       beachCream(0..1) sets how stiff the cream is. beachZone(i) moves on to part i of this side and answers its name ('' when there are no more). */
    /* The bottle. beachStream(x, y, start) lays lotion along the path of the pointer as one continuous line, like squeezing a tube: each call adds round beads from
       where the last one was to the point now under the pointer, so a drag draws a line on her that follows her skin. A pause leaves a heap. Now and then a bead in the
       line lets go and drips (more often the runnier the lotion). */
    beachStream(x, y, start) { if (!bh.on || bh.mode !== 'sun') return ''; const r = renderer.domElement.getBoundingClientRect(); bg.ray.setFromCamera(tmpA.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2, 0), camera); const hit = bsHits(bg.ray.ray)[0]; if (!hit) { bg.last = null; return ''; }
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); if (n.dot(bg.ray.ray.direction) > 0) n.negate(); const to = hit.point.clone().addScaledVector(n, 0.003), from = !start && bg.last && bg.last.distanceTo(to) < 0.09 ? bg.last : null, gap = from ? from.distanceTo(to) : 0, step = 0.0075, k = bg.thick;
      let near = null; for (const pt of bg.pts) { if (!bgPoint(pt)) continue; const d = pt.p.distanceTo(hit.point); if (!near || d < near.d) near = { d, pt }; }
      if (start) bg.stroke = (bg.stroke || 0) + 1;
      /* lotion landing on lotion that is already there (from an earlier squeeze, or a pool) joins it: the pool grows. Its weight is its volume. */
      const merge = (p, vol) => { for (const o of bg.blobs) { if (o.falling || o.spread > 0.3 || o.bead) continue; const reach = o.pool ? o.r * 1.25 : o.stroke !== bg.stroke ? 0.01 : -1; if (o.p.distanceTo(p) > reach) continue; if (!o.pool) { o.pool = true; o.stream = false; o.still = true; o.v = 0; o.ran = 0; o.trail = 0; o.feel = 0; o.mesh.material = o.mesh.material.clone(); } o.r = Math.cbrt(o.r * o.r * o.r + vol); o.mov = 0; o.brake = false; o.frozen = false; o.tail = 1; o.fadeT = 0; bgBlobShape(o); return true; } return false; };
      const lay = (p, dir) => { const rb = 0.0043 + 0.0009 * k; if (merge(p, rb * rb * rb)) return; if (bg.blobs.length >= 560) { const old = bg.blobs.shift(); old.gone = true; scene.remove(old.mesh); old.mesh.material.dispose(); } const t = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y); if (t.lengthSq() < 0.02) t.set(1, 0, 0).addScaledVector(n, -n.x); t.normalize();
        const along = dir && dir.lengthSq() > 1e-8 ? dir.clone().addScaledVector(n, -n.dot(dir)).normalize() : t, mesh = new THREE.Mesh(creamGeo, bg.streamMat || (bg.streamMat = new THREE.MeshStandardMaterial({ color: '#fffcf2', roughness: 0.18, metalness: 0, transparent: true })));
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(n, along), n, along)); mesh.renderOrder = 5; scene.add(mesh); const drips = true;   /* nothing settles: every bead starts to slide at once */
        mesh.userData.cream = 1; const d = { mesh, p: p.clone(), n: n.clone(), t, stroke: bg.stroke, r: 0.0062 + 0.0015 * k, len: 0.0068, stream: true, still: !drips, spread: 0, v: 0, ran: 0, trail: 0, reach: 0.25, pace: 0.9 + Math.random() * 0.2, wait: Math.random() * 0.05 };   /* neighbours run at nearly the same pace, so a line stays one mass as it goes */ bg.blobs.push(d); bgBlobShape(d); };
      if (!from) lay(to, null); else { const dir = to.clone().sub(from), m = Math.floor(gap / step); for (let i = 1; i <= m; i++) lay(from.clone().addScaledVector(dir, i * step / gap), dir); if (!m) { bg.pile = (bg.pile || 0) + 1; if (bg.pile % 3 === 0) { const last = bg.blobs[bg.blobs.length - 1], rb = 0.0058 + 0.0012 * k; if (last && !last.falling && last.p.distanceTo(to) < 0.03) { if (!last.pool) { last.pool = true; last.stream = false; last.still = true; last.v = 0; last.ran = 0; last.trail = 0; last.feel = 0; last.mesh.material = last.mesh.material.clone(); } last.r = Math.cbrt(last.r ** 3 + rb ** 3); bgBlobShape(last); } else lay(to, null); } } else bg.pile = 0; }   /* holding still keeps squeezing into the same place: it pools */
      if (from && gap < step) return near ? near.pt.id : ''; bg.last = to; if (near && bgSide(near.pt)) for (const pt of bg.pts) if (bgSide(pt) && pt.p && pt.p.distanceTo(hit.point) < 0.12) pt.goo = Math.min(1.2, pt.goo + (pt === near.pt ? 0.22 : 0.08) * Math.max(1, gap / step)); return near ? near.pt.id : ''; },
    beachSquirt(x, y) { if (!bh.on || bh.mode !== 'sun') return ''; const r = renderer.domElement.getBoundingClientRect(); bg.ray.setFromCamera(tmpA.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2, 0), camera); const hits = bsHits(bg.ray.ray); if (!hits.length) return '';
      const h = hits[0], n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.dot(bg.ray.ray.direction) > 0) n.negate(); let near = null; for (const pt of bg.pts) { if (!bgPoint(pt)) continue; const d = pt.p.distanceTo(h.point); if (!near || d < near.d) near = { d, pt }; } if (!near) return '';   /* cream goes anywhere on her */
      if (bg.blobs.length >= 110) { const old = bg.blobs.shift(); old.gone = true; scene.remove(old.mesh); old.mesh.material.dispose(); } const mesh = new THREE.Mesh(creamGeo, new THREE.MeshStandardMaterial({ color: '#fffcf2', roughness: 0.2, metalness: 0, transparent: true }));
      const t = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y); if (t.lengthSq() < 0.02) t.set(Math.random() - 0.5, 0, Math.random() - 0.5).addScaledVector(n, -n.dot(t)); t.normalize();   /* downhill along her skin */
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(n, t), n, t)); mesh.renderOrder = 5; scene.add(mesh);
      const d = { mesh, p: h.point.clone().addScaledVector(n, 0.002), n, t, r: 0.012 + Math.random() * 0.005, spread: 0, v: 0, ran: 0, trail: 0, reach: 0.04 + 0.2 * (1 - bg.thick) * (0.6 + Math.random() * 0.8), pace: 0.6 + Math.random() * 0.8, wait: 0.25 + Math.random() * (0.6 + 2.2 * bg.thick) }; bg.blobs.push(d); bgBlobShape(d);
      for (const pt of bg.pts) if (bgSide(pt) && pt.p.distanceTo(h.point) < 0.17) pt.goo = Math.min(1.2, pt.goo + (pt === near.pt ? 1 : 0.5)); return near.pt.id; },
    beachRub(x, y, amount) { if (!bh.on || bh.mode !== 'sun') return { hit: '', done: [] }; let hit = ''; const done = [], ease = 0.9 + (1 - bg.thick) * 0.9;   /* runny cream goes in faster */
      /* reach is measured on her, not on the screen: a hand's width (about 8 cm for a lump, 15 cm for a spot), whatever the view's distance */
      const px = p => { const a = bgScreen(p), q = tmpB.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.1).add(p), b2 = bgScreen(q); return Math.hypot(b2[0] - a[0], b2[1] - a[1]) * 10; };
      for (const d of bg.blobs) { const sc = bgScreen(d.p); if (Math.hypot(sc[0] - x, sc[1] - y) < px(d.p) * 0.085) d.spread = Math.min(1, d.spread + amount * ease * 1.6); }
      for (const pt of bg.pts) { if (!bgSide(pt) || !bgPoint(pt)) continue; const sc = bgScreen(pt.p), dd = Math.hypot(sc[0] - x, sc[1] - y), m = px(pt.p); if (dd >= m * 0.16) continue; const take = Math.min(pt.goo, amount * ease * (dd < m * 0.09 ? 1 : 0.5)); pt.goo -= take; pt.cover = Math.min(1, pt.cover + take); if (take > 0 && (!hit || dd < m * 0.09)) hit = pt.id; if (pt.cover >= 0.999 && !pt.lit) { pt.lit = true; done.push(sc); } }
      if (hit) bg.glad = Math.min(1, bg.glad + amount * 0.6); return { hit, done }; },
    beachLotion() { if (window.__lsdbg) return { ok: bg.stickOk || 0, fail: bg.stickFail || 0, still: bg.blobs.filter(d => d.still).length, moving: bg.blobs.filter(d => !d.still && !d.bead && !d.trailBead && d.v > 0.0005).length, n: bg.blobs.length }; const tr = bg.blobs.filter(d => d.trailBead && d.of).map(d => [+(d.of.p.distanceTo(d.p) * 100).toFixed(1), +(d.r * 1000).toFixed(1)]).sort((a, b) => a[0] - b[0]); return { trail: tr.filter((_, i) => i % Math.max(1, Math.floor(tr.length / 8)) === 0), blobs: bg.blobs.length, pools: bg.blobs.filter(d => d.pool).map(d => ({ r: +(d.r * 1000).toFixed(1), ran: +(d.ran * 100).toFixed(1), falling: !!d.falling, fell: +((d.fell || 0) * 100).toFixed(1) })) }; },   /* for tests: how many lumps there are and what the pools are doing (mm, cm) */
    waterShot(x, y) { wfInit(); const r = renderer.domElement.getBoundingClientRect(), ndc = tmpA.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2, 0); WF.ray.setFromCamera(ndc, camera); const hit = WF.ray.intersectObject(vrm.scene, true).find(h => h.object.isMesh && h.object.visible);
      camera.updateMatrixWorld(); const chase = bh.on && bh.mode === 'chase'; if (chase) { CH.kick = 1; WF.from.set(0.17, -0.15, -0.55).applyMatrix4(camera.matrixWorld); } else WF.from.set(0.55, -0.5, -0.4).applyMatrix4(camera.matrixWorld); const to = hit ? hit.point.clone() : WF.ray.ray.at(6, new THREE.Vector3()), dir = to.clone().sub(WF.from), dist = dir.length(); dir.normalize();
      const skip = chase ? 0 : Math.min(0.35, dist * 0.4); for (let i = 0; i < 26; i++) { const sp = 7 + Math.random() * 1.5; wfDrop(WF.from.clone().addScaledVector(dir, skip - i * 0.04), dir.clone().multiplyScalar(sp).add(tmpB.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12 + 0.08, (Math.random() - 0.5) * 0.12)), Math.max(0.02, (dist - skip) / sp) + 0.02, 0.004 + Math.random() * 0.004, 1.2); }   /* (the jet starts a little way out, so it does not fill a close view) */   /* the jet */
      if (!hit) return { hit: '' }; const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
      setTimeout(() => { for (let i = 0; i < 34; i++) wfDrop(to, n.clone().multiplyScalar(0.5 + Math.random() * 1.2).add(tmpB.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(1.2)), 0.3 + Math.random() * 0.4, 0.003 + Math.random() * 0.006, 6); WF.wet = Math.min(1, WF.wet + 0.035); }, Math.min(300, dist / 7 * 1000));   /* the splash, when the water gets there */
      let part = 'body', best = 9; for (const [nm, bn] of [['face', 'head'], ['chest', 'upperChest'], ['tummy', 'spine'], ['arm', 'leftLowerArm'], ['arm', 'rightLowerArm'], ['legs', 'leftLowerLeg'], ['legs', 'rightLowerLeg'], ['hips', 'hips']]) { const b = B(bn); if (!b) continue; const d = b.getWorldPosition(tmpB).distanceTo(to); if (d < best) { best = d; part = nm; } }
      return { hit: part, wet: WF.wet }; },
    chaseHit(part) { if (bh.mode !== 'chase') return null; if (CH.fall < 0) { CH.slow = 0.6; CH.jolt = part === 'face' ? 1 : 0.7; } return { down: CH.fall >= 0, gap: +(CH.x - CH.me).toFixed(2) }; },
    chaseFall() { if (bh.mode !== 'chase' || CH.fall >= 0) return 0; CH.fall = 0; CH.look = 0; return CH_DOWN + CH_LIE + CH_UP; },   /* she trips onto her back; answers how many seconds until she is running again */
    chaseState() { return bh.mode === 'chase' ? { x: CH.x, me: CH.me, gap: CH.x - CH.me, down: CH.fall >= 0, fall: CH.fall } : null; },
    waterWet(v) { wfInit(); if (Number.isFinite(+v)) WF.wet = Math.max(0, Math.min(1, +v)); return WF.wet; },
    beachJump(v) { bg.jump = Math.max(bg.jump || 0, Math.max(0, Math.min(1, +v || 0))); },   /* she flinches: 1 a big jump, 0.1 barely */
    beachCream(v) { if (Number.isFinite(+v)) bg.thick = Math.max(0, Math.min(1, +v)); return bg.thick; },
    beachZone(i) { const Z = SUNZ[bg.side] || SUNZ.f; if (i >= Z.length) return ''; bg.zone = Math.max(0, i | 0); return Z[bg.zone][0]; },   /* (cream already on her stays where it is) */
    beachSunTick(dt, secs) { if (!bh.on || bh.mode !== 'sun') return null; let n = 0, cover = 0, burn = 0, score = 0; for (const pt of bg.pts) { if (!bgUses(pt)) continue; pt.burn = Math.min(1, pt.burn + dt / (secs || 30) * (1 - pt.cover) * (1 - pt.cover)); n++; cover += pt.cover; burn += pt.burn; score += pt.cover * (1 - 0.5 * pt.burn); } bg.hurtWant = n ? Math.min(0.8, burn / n * 1.4) : 0; return n ? { cover: cover / n, burn: burn / n, score: score / n } : { cover: 0, burn: 0, score: 0 }; },
    beachRoll() { if (!bh.on || bh.mode !== 'sun' || bh.pose === 'chair') return ''; let n = 0, sc = 0; for (const pt of bg.pts) if (bgUses(pt)) { n++; sc += pt.cover * (1 - 0.5 * pt.burn); } bg.done[bg.side] = n ? sc / n : 0; bg.side = bg.side === 'b' ? 'f' : 'b'; for (const pt of bg.pts) { pt.cover = 0; pt.burn = 0; pt.goo = 0; pt.lit = false; } bg.zone = 0; bg.has = false; bgClearBlobs(); bgPose(bg.side === 'b' ? 'front' : 'back'); return bg.side; },
    beachReach(x, y) { if (!bh.on || bh.mode === 'run') return ''; let best = ''; let bd = 60; for (const n of ['leftHand', 'rightHand', 'leftFoot', 'rightFoot']) { const b = B(n); if (!b) continue; const sc = bgScreen(b.getWorldPosition(tmpB)), d = Math.hypot(sc[0] - x, sc[1] - y); if (d < bd) { bd = d; best = n; } } return best; },
    beachTurn(dyaw, dpitch, dz) { const c = bg.cam; c.yaw += dyaw || 0; c.pitch = Math.max(0.12, Math.min(1.45, c.pitch + (dpitch || 0))); c.dist = Math.max(1.3, Math.min(7, c.dist * Math.exp(dz || 0))); c.zoom = Math.max(0.6, Math.min(1.8, (c.zoom || 1) * Math.exp(dz || 0))); },
    beachOutro() { if (!bh.on || bh.mode !== 'run') return 0; bh.pose = false; bh.paused = false; bh.oy = bh.op = bh.od = 0; bh.outro = performance.now(); return 1750; },   /* returns how long it runs, in ms: fade to white at the end of it */
    beachPose(on) { if (!bh.on) return false; bh.pose = !!on; bh.paused = false; bh.oy = bh.op = bh.od = 0; return bh.pose; }, beachOn: () => bh.on, beachViews: BVIEW.length,
    /* show or hide the parts of her outfit whose material name matches (VRoid names them Tops, Bottoms, Onepiece, Shoes, Accessory...): answers how many parts were touched and the names there are */
    wearParts(pattern, show) { const re = pattern ? new RegExp(pattern, 'i') : null, names = new Set(); let n = 0; vrm.scene.traverse(o => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) names.add(m.name); if (re && mats[0] && re.test(mats[0].name)) { o.visible = !!show; n++; } }); return { n, names: [...names] }; },
    photoWhere() { return { pos: vrm.scene.position.toArray().map(v => +v.toFixed(3)), ry: +vrm.scene.rotation.y.toFixed(3), off: { ...ph.off }, act: rt.act, k: +rt.k.toFixed(2), live: performance.now() < ph.liveUntil }; },   /* for tests: where she is and what the studio remembers */
    /* turn a part (and all that hangs from it) flat on the picture: about the line from its joint to the camera, anticlockwise as you look at it */
    photoRoll(name, ang) { const b = B(name); if (!b || !ang) return false; phTouched(); const N = photoNudge_; b.updateWorldMatrix(true, false); camera.updateMatrixWorld(); const J = b.getWorldPosition(N.j), ax = N.ax.copy(camera.position).sub(J).normalize(), wq = b.getWorldQuaternion(N.q1), pq = b.parent.getWorldQuaternion(N.q2); b.quaternion.copy(N.q3.setFromAxisAngle(ax, ang).multiply(wq)).premultiply(pq.invert()); b.updateWorldMatrix(false, true); return true; },
    photoAt(name) { const b = B(name); if (!b) return null; const r = renderer.domElement.getBoundingClientRect(); b.getWorldPosition(tmpA).project(camera); return [(tmpA.x + 1) / 2 * r.width + r.left, (1 - tmpA.y) / 2 * r.height + r.top]; },
    /* how long a part would look on screen, in pixels, if it lay flat to the camera */
    photoSpan(name) { const b = B(name); if (!b) return 0; const N = photoNudge_, kid = b.children.find(c => c.position.lengthSq() > 1e-4); if (!kid) return 0; b.updateWorldMatrix(true, true); camera.updateMatrixWorld(); const r = renderer.domElement.getBoundingClientRect(), J = b.getWorldPosition(N.j), len = kid.getWorldPosition(N.d).distanceTo(J), a = N.up.copy(J).project(camera), side = N.to.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(len).add(J).project(camera); return Math.hypot((side.x - a.x) / 2 * r.width, (side.y - a.y) / 2 * r.height); },
    /* For the second look at a limb from another side. photoDir: which way a part points in the room. photoViewDir: the direction from its joint to the camera.
       photoRefine: the part was set from one side (it pointed along d0, seen from c1); a line drawn from this side fixes only how deep it goes. The answer is the one
       direction that still looks the same from the first side and lies under the new line. False when the two sides are too alike to tell. */
    photoDir(name) { const b = B(name), kid = b && b.children.find(c => c.position.lengthSq() > 1e-4); if (!kid) return null; b.updateWorldMatrix(true, true); const J = b.getWorldPosition(photoNudge_.j); return kid.getWorldPosition(photoNudge_.d).sub(J).normalize().toArray(); },
    photoViewDir(name) { const b = B(name); if (!b) return null; b.updateWorldMatrix(true, false); camera.updateMatrixWorld(); return photoNudge_.to.copy(camera.position).sub(b.getWorldPosition(photoNudge_.j)).normalize().toArray(); },
    photoRefine(name, x, y, c1, d0) { const b = B(name); if (!b || !c1 || !d0) return false; phTouched(); const N = photoNudge_, kid = b.children.find(c => c.position.lengthSq() > 1e-4); if (!kid) return false; b.updateWorldMatrix(true, true); camera.updateMatrixWorld(); const r = renderer.domElement.getBoundingClientRect(), J = b.getWorldPosition(N.j), d = kid.getWorldPosition(N.d).sub(J).normalize();
      const n = N.up.copy(J).project(camera), v2 = N.to.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2, n.z).unproject(camera).sub(J); if (v2.lengthSq() < 1e-10) return false; v2.normalize();
      const c2 = new THREE.Vector3().copy(camera.position).sub(J).normalize(), n1 = new THREE.Vector3().fromArray(d0).cross(new THREE.Vector3().fromArray(c1)), n2 = new THREE.Vector3().copy(v2).cross(c2); if (n1.lengthSq() < 1e-4 || n2.lengthSq() < 1e-4) return false; n1.normalize(); n2.normalize();
      const want = new THREE.Vector3().crossVectors(n1, n2); if (want.lengthSq() < 0.03) return false; want.normalize(); if (want.dot(v2) < 0) want.negate();
      const wq = b.getWorldQuaternion(N.q1), pq = b.parent.getWorldQuaternion(N.q2); b.quaternion.copy(N.q3.setFromUnitVectors(d, want).multiply(wq)).premultiply(pq.invert()); b.updateWorldMatrix(false, true); return true; },
    photoPoint(name, x, y, away) { const b = B(name); if (!b) return false; phTouched(); const N = photoNudge_, kid = b.children.find(c => c.position.lengthSq() > 1e-4); if (!kid) return false; b.updateWorldMatrix(true, true); camera.updateMatrixWorld(); const r = renderer.domElement.getBoundingClientRect(), J = b.getWorldPosition(N.j), d = kid.getWorldPosition(N.d).sub(J), len = d.length(); d.normalize();
      const n = N.up.copy(J).project(camera), v = N.to.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2, n.z).unproject(camera).sub(J), flat = v.length(); if (flat < 1e-5) return false;
      if (flat < len) { const toCam = N.ax.copy(camera.position).sub(J).normalize(); let sign = away === true ? -1 : 1;
        if (away === 'auto' || away === 'autoflip') { /* the natural way for the part: thighs, arms and the body come forward, a shin folds back under the knee */ const fwd = N.up.set(0, 0, 1).applyQuaternion(vrm.scene.getWorldQuaternion(N.q4)); sign = (toCam.dot(fwd) >= 0 ? 1 : -1) * (/LowerLeg/.test(name) ? -1 : 1) * (away === 'autoflip' ? -1 : 1); }
        v.add(toCam.multiplyScalar(sign * Math.sqrt(len * len - flat * flat))); } v.normalize();
      const wq = b.getWorldQuaternion(N.q1), pq = b.parent.getWorldQuaternion(N.q2); b.quaternion.copy(N.q3.setFromUnitVectors(d, v).multiply(wq)).premultiply(pq.invert()); b.updateWorldMatrix(false, true); return true; },
    photoBone(name, rot, free) { const b = B(name); if (!b) return null; if (rot) { phTouched(); const L = free ? 99 : PH_LIMIT[name.replace(/^(left|right)/, '')] || 1.6; b.rotation.set(...rot.map(v => Math.max(-L, Math.min(L, +v || 0)))); } return [b.rotation.x, b.rotation.y, b.rotation.z]; },
    // drag a hand or a foot: the limb is solved to reach the point under the pointer, on the plane facing the camera at the limb's own depth
    photoReach(end, x, y, toward = 0) { phTouched();   /* toward: metres to carry the hand or foot toward the camera (or away, below 0) on top of following x, y */
      const ch = { leftHand: ['leftUpperArm', 'leftLowerArm', 'leftHand'], rightHand: ['rightUpperArm', 'rightLowerArm', 'rightHand'], leftFoot: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'], rightFoot: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'] }[end]; if (!ch) return; const [A, Bn, C] = ch.map(B); if (!A || !Bn || !C) return;
      const r = renderer.domElement.getBoundingClientRect(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), t = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion(), bq = new THREE.Quaternion();
      const turn = (bone, qW) => { bone.parent.getWorldQuaternion(pq); bone.getWorldQuaternion(bq); bone.quaternion.copy(pq.invert()).multiply(qW).multiply(bq); bone.updateWorldMatrix(false, true); };
      A.updateWorldMatrix(true, true); A.getWorldPosition(a); Bn.getWorldPosition(b); C.getWorldPosition(c);
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height * 2 - 1)), camera); const n = camera.getWorldDirection(new THREE.Vector3()), plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c); if (!ray.ray.intersectPlane(plane, t)) return; if (toward) t.addScaledVector(n, -toward);
      const l1 = a.distanceTo(b), l2 = b.distanceTo(c), d = Math.max(Math.abs(l1 - l2) + 0.02, Math.min(l1 + l2 - 0.004, a.distanceTo(t))), u = a.clone().sub(b), w = c.clone().sub(b), phi = u.angleTo(w), theta = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
      let ax = new THREE.Vector3().crossVectors(u, w); if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0).applyQuaternion(Bn.getWorldQuaternion(bq)); ax.normalize(); turn(Bn, q.setFromAxisAngle(ax, theta - phi)); C.getWorldPosition(c);
      turn(A, q.setFromUnitVectors(c.clone().sub(a).normalize(), t.clone().sub(a).normalize())); },
    photoFingers(side, o) { phTouched(); const sd = side === 'left' ? -1 : 1, c = o.curls || [0, 0, 0, 0], sp = o.spread || 0, th = o.thumb || 0; ['Index', 'Middle', 'Ring', 'Little'].forEach((f, i) => { set(side + f + 'Proximal', 0, sd * sp * (0.22 - i * 0.14), sd * c[i] * 1.4); set(side + f + 'Intermediate', 0, 0, sd * c[i] * 1.65); set(side + f + 'Distal', 0, 0, sd * c[i] * 1.1); }); set(side + 'ThumbMetacarpal', 0, -sd * 0.9 * th, 0); set(side + 'ThumbProximal', 0, -sd * 0.65 * th, 0); set(side + 'ThumbDistal', 0, -sd * 0.3 * th, 0); },   /* each finger curled 0 (straight) to 1 (closed), the thumb folded across, the fingers fanned apart */
    photoHer(o) { if (o.move) { camera.updateMatrixWorld(); const r = tmpA.setFromMatrixColumn(camera.matrixWorld, 0); r.y = 0; r.normalize(); const f = tmpB.set(-r.z, 0, r.x), k = ph.c.dist * 0.0016, dx = (r.x * o.move[0] + f.x * o.move[1]) * k, dz = (r.z * o.move[0] + f.z * o.move[1]) * k; vrm.scene.position.x += dx; vrm.scene.position.z += dz; ph.off.x += dx; ph.off.z += dz; }
      if (Number.isFinite(o.turn)) { vrm.scene.rotation.y += o.turn; ph.off.ry += o.turn; } if (Number.isFinite(o.lift)) { vrm.scene.position.y += o.lift; ph.off.y += o.lift; }
      if (o.stand || o.sit) { Object.assign(ph.off, { x: 0, y: 0, z: 0, ry: 0 }); ph.snap = null; ph.dirty = false; }
      if (o.stand) { const now = performance.now(), c = ph.c; let x = STAND_AT[0], z = STAND_AT[1]; if (fp.on) { camera.getWorldDirection(tmpA); tmpA.y = 0; tmpA.normalize(); x = camera.position.x + tmpA.x * 1.9; z = camera.position.z + tmpA.z * 1.9; c.yaw = Math.atan2(-tmpA.x, -tmpA.z); }   /* on her feet on open floor, facing the camera, and the camera steps back to take all of her in */
        Object.assign(rt, { act: 'up', leaving: false, stand: 1, k: 1, x, z, yaw: c.yaw, i: 0, stepT: 0, steps: [], until: now + 60000, nextAt: now + 600000 }); vrm.scene.rotation.z = 0; Object.assign(c, { tx: x, ty: floorY + 1.05, tz: z, dist: Math.max(c.dist, 3.4), pitch: 0.12 }); ph.liveUntil = now + 900; }
      if (o.sit) { const now = performance.now(); Object.assign(rt, { act: 'sit', leaving: false, stand: 0, k: 0, steps: [], i: 0, nextAt: now + 600000 }); vrm.scene.rotation.z = 0; ph.liveUntil = now + 700; } },
    photoPose(name, secs) { ph.snap = null; ph.dirty = false; ph.liveUntil = performance.now() + (secs || 1.5) * 1000; },   /* let her move for a moment (a gesture, a pose), then time stops again where she is */
    photoFace(name, v) { try { if (name === 'reset') { for (const n of ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink', 'blinkLeft', 'blinkRight', 'aa', 'ih', 'ou', 'ee', 'oh']) vrm.expressionManager.setValue(n, 0); } else vrm.expressionManager.setValue(name, Math.max(0, Math.min(1, +v))); } catch {} },
    photoShot(scale) { const pr = renderer.getPixelRatio(), W = el.clientWidth, H = el.clientHeight; renderer.setPixelRatio(Math.max(1, Math.min(4, (scale || 2)))); renderer.setSize(W, H, false); photoCamApply(); vrm.scene.updateMatrixWorld(true); renderView(); const url = renderer.domElement.toDataURL('image/png'); renderer.setPixelRatio(pr); renderer.setSize(W, H, false); size = ''; return url; },
    artWatch(cb) { artW.cb = cb; },
    stereo(mode, o) { if (mode !== undefined) { sbs.mode = mode === 'full' || mode === 'half' ? mode : ''; size = ''; } if (o) Object.assign(sbs, o); return sbs.mode; },
    head(yaw, pitch, roll) { sbs.head.set(pitch || 0, yaw || 0, roll || 0, 'YXZ'); sbs.headOn = !!(yaw || pitch || roll); },
    draw(s) {
      if (snapReq) { const q = snapReq; snapReq = null; let url = ''; try { url = takeSnap(q.spec); } catch (e) { console.error('snapshot', e); } size = ''; q.done(url); }
      const W = el.clientWidth, H = el.clientHeight, key = W + 'x' + H;
      if (key !== size && W && H) { size = key; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
      if (ph.on && performance.now() >= ph.liveUntil) { if (ph.restore) { ph.restore = false; phGiveBack(); } photoCamApply(); try { vrm.update(Math.min(0.05, s.dt || 0.016)); } catch {} clothTick(s.dt); renderView(); return; }   /* photo studio: she holds still, only cloth and hair settle */
      if (bh.on && bh.mode !== 'run' && bh.mode !== 'chase' && !ph.on) return void beachStill(s);   /* a still game on the beach: her body holds its pose */
      if (frozen) { bonusCamera(s.t); renderView(); return; }   // time stands still: nothing about her moves, only the view
      routine(s);                               // where she is and what she is holding
      applyGesture(hpose.on ? null : s.gesture, s.faceName, s.dt); // body first: a gesture can also ask for a face (a yawn opens her mouth)
      // expressions ease toward the face the controller picked; blinking and talking are immediate
      const want = EXPR[s.faceName] || {};
      for (const n of NAMES) { const t = want[n] || 0; w[n] += (t - w[n]) * Math.min(1, s.dt * 12); }
      const blink = s.blink ? 1 : w.blink, loud = s.voice, aa = !s.talking ? 0 : loud != null ? Math.min(1, loud * 1.15) : (s.phase === 1 ? 0.75 : s.phase === 2 ? 0.2 : 0.05), oh = !s.talking ? 0 : loud != null ? (loud > 0.25 && s.phase === 2 ? 0.3 : 0) : (s.phase === 2 ? 0.5 : 0);
      const gf = gx.face || {}, mix = (n, v) => Math.max(v, (gf[n] || 0) * gx.k);
      if (em) { for (const n of ['happy', 'angry', 'sad', 'relaxed', 'surprised']) if (has(n)) em.setValue(n, mix(n, w[n]));
        { /* happy and relaxed both close her eyes: together they never add up to more than one whole smile */ const h = mix('happy', w.happy), r = mix('relaxed', w.relaxed), tot = h + r; if (tot > 1) { if (has('happy')) em.setValue('happy', h / tot); if (has('relaxed')) em.setValue('relaxed', r / tot); } }
        /* her happy and relaxed faces already close her eyes into a smile. A blink on top of that pushes the lids past shut and the eyes collapse into odd little lines, so the more she smiles the less of the blink is added. */
        const smiling = Math.min(1, mix('happy', w.happy) * 1.15 + mix('relaxed', w.relaxed) * 1.0); if (has('blink')) em.setValue('blink', mix('blink', blink) * (1 - smiling)); if (has('aa')) em.setValue('aa', mix('aa', aa)); if (has('oh')) em.setValue('oh', oh); if (has('ou')) em.setValue('ou', (gf.ou || 0) * gx.k);   /* (puckered lips, for a pout or a kiss) */
        { const cf = clipFace || {}, to = Math.max(gx.tongue[0], cf.tongueOut || 0), fromClip = (cf.tongueOut || 0) > gx.tongue[0]; tongue.set(to, fromClip ? (cf.tongueCurl === undefined ? 0 : cf.tongueCurl * 2 - 1) : gx.tongue[1], fromClip ? (cf.tongueSide === undefined ? 0 : cf.tongueSide * 2 - 1) : gx.tongue[2], to > 0.03 ? Math.max(mix('aa', aa), 0.3 + 0.3 * to) : 0, fromClip && cf.tongueWide ? cf.tongueWide + 0.5 : 1); tongue.update(s.dt); if (to > 0.03 && has('aa')) em.setValue('aa', Math.max(mix('aa', aa), 0.3 + 0.3 * to)); }
        if (!clipFace && fineOn) { fine.set(null); fineOn = false; }
        if (clipFace) { const useFine = fine.has && clipFace.mFun !== undefined; if (useFine) { fine.set(clipFace); fineOn = true; } for (const k in clipFace) if (em.getExpression(k) && !(useFine && WHOLE.includes(k))) em.setValue(k, clipFace[k]); if (clipFace.blinkLeft !== undefined && has('blink')) em.setValue('blink', 0); clipFace = null; } }
      placeCamera(s.dt);
      focusNow += (focusWant - focusNow) * Math.min(1, s.dt * 3.5); tearMat.opacity += (tearsWant * 0.7 - tearMat.opacity) * Math.min(1, s.dt * 4);
      heartCamera(s.dt, s.t); hangCamera(s.dt); movieCamera(s.dt); dndCamera(s.dt, s.t); artLook(s.t); beachCamera(s.dt, s.t);
      // she looks at the camera (that is you), nudged by the same gaze as the cartoon (-3..3); the head follows a little,
      // turns toward you when you are off to the side, and takes the springs from touches
      const watching = fp.on && places.tv.on && rt.act === 'sit' && !rt.attending && !rt.gazeProp && !(mv.on && mv.view === 'toss');   // the TV is on and nobody is talking
      if (rt.gazeProp) target.position.copy(rt.gazeProp.position); else if (watching) target.position.copy(places.tv.at); else { target.position.copy(camera.position); target.position.x += s.look.x * 0.22; target.position.y -= s.look.y * 0.16; if (gx.eyes[0] || gx.eyes[1]) { const yw = vrm.scene.rotation.y; target.position.x -= Math.cos(yw) * gx.eyes[0]; target.position.z += Math.sin(yw) * gx.eyes[0]; target.position.y += gx.eyes[1]; } }
      let facing = rt.stand > 0.5 ? 0 : camYaw * 0.55, tip = 0; // seated she turns her head to you; on her feet her whole body does
      { // wherever you are watching from (your seat across from her, or anywhere in the room on a visit) and however she is sitting or standing, her head turns to you as far as a neck goes, and tips up if you are standing over her
        const dx = camera.position.x - eye.x, dz = camera.position.z - eye.z, off = Math.atan2(dx, dz) - vrm.scene.rotation.y, a = Math.atan2(Math.sin(off), Math.cos(off));
        const still = rt.stand > 0.5 && rt.leg < 0.3, wantY = watching ? 0 : Math.max(-1.05, Math.min(1.05, a)) * (rt.stand > 0.5 ? (still ? 0.6 : 0.3) : 0.62) * (1 - 0.6 * (rt.lie || 0)), wantP = watching ? 0 : Math.max(-0.3, Math.min(0.3, -Math.atan2(camera.position.y - eye.y, Math.hypot(dx, dz)) * 0.5));
        faceYaw += (wantY - faceYaw) * Math.min(1, s.dt * 4); facePitch += (wantP - facePitch) * Math.min(1, s.dt * 4); facing = faceYaw; tip = facePitch;
      }
      const roll = -s.rot * Math.PI / 180 * 1.6, yaw = s.tx * 0.045 + (rt.gazeProp ? 0 : s.look.x * 0.045 + facing) + rt.head[1], pitch = s.ty * 0.03 + (rt.gazeProp ? 0 : s.look.y * 0.03 + tip) + (1 - s.sq) * 1.5 + rt.head[0];
      const drift = rt.glow === 'tipsy' ? 0.07 * Math.sin(s.t / 900) : rt.glow === 'high' ? 0.05 * Math.sin(s.t / 2100) : 0; // a slow loll of the head
      if (head) head.rotation.set(bhUp + base.head[0] + pitch * 0.6 + gx.head[0] + body[1] + (rt.glow === 'high' ? 0.03 * Math.sin(s.t / 1700) : 0), yaw * 0.6 + gx.head[1] + body[2], roll * 0.6 + gx.head[2] + body[3] + drift);
      if (neck) neck.rotation.set(CUR.neck[0] + pitch * 0.4, yaw * 0.4, roll * 0.4);
      if (chest) chest.rotation.set(base.chest[0] + body[0] + s.breathe * 0.012, yaw * 0.3, roll * 0.3);
      // shoulders ride up with tension (unless a gesture is using them), hips bounce
      if (!touchedBones.includes('leftShoulder')) { set('leftShoulder', 0, 0, body[4] + s.breathe * 0.01); set('rightShoulder', 0, 0, -body[4] - s.breathe * 0.01); }
      if (hipsNode) hipsNode.position.y = hipY0 + gx.hipY + clipHip;
      if (window.WIZRA_FIX) { let soft = Math.max(rt.lie || 0, hpose.on ? 1 : 0); for (const n in SEATED) soft = Math.max(soft, rt.lg[n] || 0); fixBody(1 - Math.min(1, soft)); }   // her arms and legs keep out of her own body (not in the recorded curled-up and lying poses, which fold her on purpose)
      try { armRest(s); } catch {} vrm.update(s.dt); clothTick(s.dt); if (hpose.settle && --hpose.settle === 0 && vrm.springBoneManager) vrm.springBoneManager.reset(); // spring bones: hair and clothes swing with the head
      placeProps(); lampTick(s.dt); places.tick(night, s.t); places.live(here, s.t, night); stormTick(performance.now()); quality(performance.now());
      if (cinema && places.power) { const f = 0.5 + 0.5 * Math.sin(s.t / 140) * Math.sin(s.t / 370); screenLight.color.set(cinema); screenLight.intensity = 1.2 + 1.3 * f; if (here === 'house') screenLight.position.copy(places.tv.at).add(tmpB.set(0, 0, 0.35)); else screenLight.position.set(0.2, floorY + 1.25, hip.z + 2.4); } else screenLight.intensity = 0;
      // flushed cheeks, only from the front
      rawHead.getWorldDirection(fwd); toCam.copy(camera.position).sub(headPos).normalize();
      const blushWant = (s.face.blush || 0) * (fwd.dot(toCam) > 0.25 ? 0.42 : 0); blushNow += (blushWant - blushNow) * Math.min(1, s.dt * 4); blushMat.opacity = blushNow;
      // the close camera stays on her face wherever she goes
      head.getWorldPosition(tmpA); tmpA.y += eyeUp; eye.lerp(tmpA, Math.min(1, s.dt * 8)); near.set(eye.x, eye.y - 0.035, eye.z);
      if (ph.on) { phOffApply(); photoCamApply(); }
      waterTick(Math.min(0.05, s.dt || 0.016));
      renderView();
      if (thumbCb && !fp.on && zoom < 0.03 && rt.act === 'sit' && rt.stand < 0.01 && !rt.glow && !s.gesture && !s.blink) { const cb = thumbCb; thumbCb = null; try { cb(renderer.domElement.toDataURL('image/webp', 0.85)); } catch {} } // straight after a draw, while the picture is still in the canvas
    },
    dispose() { clearInterval(dayTimer); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', keysOff); el.remove(); try { VRMUtils.deepDispose(vrm.scene); renderer.dispose(); renderer.forceContextLoss(); } catch {} },
  };
}
