// Draws a VRM model (VRoid and friends) as Wizra's avatar. It is a renderer for avatar.js: the controller there decides
// her mood, reactions and where she looks; this file turns that into bones and expressions on the model.
//   const r = await create(url)   ->  { el, locate(e), draw(state), dispose() }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMSpringBoneCollider, VRMSpringBoneColliderShapeCapsule, VRMSpringBoneColliderShapePlane } from '@pixiv/three-vrm';
import { buildPlaces, cel } from './places.js';
import { bodyFix } from './bodyfix.js';
import { addTongue } from './tongue.js';
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
  const vrm = gltf.userData.vrm; if (!vrm) throw new Error('That file is not a VRM model.');
  VRMUtils.rotateVRM0(vrm); // older (0.x) models face the other way
  vrm.scene.traverse(o => { o.frustumCulled = false; });
  scene.add(vrm.scene);
  // Cloth weight: VRoid skirts and coat tails come with no gravity and nothing to collide with, so they hold their standing bell
  // shape in the air when she sits. Here they are given weight (softer, pulled down, damped), her legs become things the cloth
  // rests on, and while she is seated a flat surface sits just under her hips so the cloth lies on the seat, not through it.
  const cloth = { plane: null, stand: 0, hips: null };
  try { const man = vrm.springBoneManager, T = window.WIZRA_CLOTH || {}, raw = n => vrm.humanoid.getRawBoneNode(n), skirt = man ? [...man.joints].filter(j => /skirt/i.test(j.bone.name)) : [];
    if (skirt.length && !T.off) { const cols = [], cap = (bone, child, r) => { const a = raw(bone), b = raw(child); if (!a || !b) return; const c = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeCapsule({ offset: new THREE.Vector3(), tail: b.position.clone(), radius: r })); a.add(c); cols.push(c); };
      for (const sd of ['left', 'right']) { cap(sd + 'UpperLeg', sd + 'LowerLeg', T.thigh ?? 0.078); cap(sd + 'LowerLeg', sd + 'Foot', T.shin ?? 0.052); }
      cloth.plane = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapePlane({ offset: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) })); cloth.plane.position.y = -50; vrm.scene.add(cloth.plane); cols.push(cloth.plane);
      cloth.hips = raw('hips'); vrm.scene.updateMatrixWorld(true); cloth.stand = cloth.hips ? cloth.hips.getWorldPosition(new THREE.Vector3()).y - vrm.scene.getWorldPosition(new THREE.Vector3()).y : 0;
      const group = { colliders: cols, name: 'cloth' }; for (const j of skirt) { const st = j.settings; st.stiffness *= T.k ?? 0.28; st.gravityPower = T.g ?? 0.55; st.dragForce = Math.max(st.dragForce || 0, T.d ?? 0.45); j.colliderGroups = [...(j.colliderGroups || []), group]; }
      man.setInitState(); man.reset(); } } catch (e) { console.warn('cloth weight', e); }
  // every frame: the seat surface follows her hips while they are low (any seated pose), and is far below otherwise
  const clothTick = () => { if (!cloth.plane || !cloth.hips || !cloth.stand) return; const hy = cloth.hips.getWorldPosition(_clothV).y - vrm.scene.getWorldPosition(_clothV2).y, sc = vrm.scene.scale.y || 1; cloth.plane.position.y = hy < cloth.stand * 0.8 ? (hy - (window.WIZRA_CLOTH?.seat ?? 0.085) * sc) / sc : -50; cloth.plane.quaternion.copy(vrm.scene.quaternion).invert(); cloth.plane.updateMatrixWorld(true); };
  const _clothV = new THREE.Vector3(), _clothV2 = new THREE.Vector3();
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
    if (!g || !GESTURE[g.name]) return;
    if (CLIP_GEST[g.name] && CLIPS[CLIP_GEST[g.name]] && rt.k > 0.9) { const c = CLIPS[CLIP_GEST[g.name]]; playClip(CLIP_GEST[g.name], g.w * g.w * (3 - 2 * g.w), Math.min(g.t, c.dur - 0.04)); return; } // a recorded one, when she is on her feet
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
    }); }
  const cq = new THREE.Quaternion(), cq2 = new THREE.Quaternion(), fixBody = bodyFix(THREE, vrm), tongue = addTongue(THREE, vrm), fine = fineFace(vrm); let fineOn = false, clipHip = 0, clipFace = null;
  function playClip(name, weight, t, skip) { // blend one clip in at time t (seconds, loops); skip(bone) -> 0..1 of the weight to hold back
    const c = CLIPS[name]; if (!c || weight < 0.003) return false;
    const f = ((t % c.dur + c.dur) % c.dur) * c.fps, i0 = Math.min(c.n - 1, Math.floor(f)), i1 = Math.min(c.n - 1, i0 + 1), a = f - i0;
    for (const n in c.bones) {
      const bone = B(n); if (!bone) continue; const w = weight * (skip ? 1 - skip(n) : 1); if (w < 0.003) continue;
      const v = c.bones[n], p = i0 * 4, q = i1 * 4; cq.set(v[p], v[p + 1], v[p + 2], v[p + 3]); cq2.set(v[q], v[q + 1], v[q + 2], v[q + 3]); cq.slerp(cq2, a); bone.quaternion.slerp(cq, w);
    }
    if (c.face && weight > 0.5) { clipFace = clipFace || {}; for (const k in c.face) clipFace[k] = c.face[k][i0]; }   // a recorded take can carry her expression too
    if (c.hips) clipHip += ((c.hips[i0 * 3 + 1] * (1 - a) + c.hips[i1 * 3 + 1] * a) - 1) * hipY0 * weight;   // how far the clip lifts or drops her hips
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
  const seatTop = hip.y - 0.1;
  box(0.74, seatTop - floorY - 0.12, 0.62, 0, (seatTop - 0.12 + floorY) / 2, hip.z - 0.01, '#3a2148');           // chair body
  box(0.6, 0.14, 0.54, 0, seatTop - 0.07, hip.z + 0.03, '#5b3570');                                               // seat cushion
  box(0.74, 0.95, 0.16, 0, seatTop + 0.3, hip.z - 0.36, '#4a2a5c', -0.28);                                       // back, tilted
  box(0.13, 0.3, 0.62, -0.38, seatTop + 0.08, hip.z - 0.01, '#4a2a5c'); box(0.13, 0.3, 0.62, 0.38, seatTop + 0.08, hip.z - 0.01, '#4a2a5c'); // arms
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
    mug: [new THREE.Vector3(-0.38, seatTop + 0.275, hip.z + 0.16), new THREE.Euler(0, 0.6, 0)],
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
  const WALK_ARM = { rightUpperArm: 1, rightLowerArm: 1, rightHand: 1 }, CLIP_GEST = { kiss: 'kiss', jump: 'jump' };
  const stride = c => (c.hips ? Math.abs(c.hips[c.hips.length - 1] - c.hips[2]) * hipY0 : 0) || 1.3;   // metres one loop of a walking clip covers, at her size
  const DOING = { read: 'reading her book', phone: 'looking at her phone', sip: 'sipping her drink' };
  const rt = { act: 'sit', until: 0, nextAt: performance.now() + 60000 + Math.random() * 60000, lastTalk: 0, self: false, stand: 0, ov: { read: 0, phone: 0, sip: 0 }, x: STAND_AT[0], z: STAND_AT[1], yaw: 0, phase: 0, leg: 0,
    legs: 'up', arms: 'lap', ar: {}, armsAt: performance.now() + 40000, lg: { crossed: 0, floor: 0, hair: 0, drape: 0 }, legsAt: performance.now() + 30000, steps: [], i: 0, stepT: 0, label: '', after: '', hold: 0, carry: null, carryW: { book: 0, mug: 0, phone: 0 }, walkT: 0, talkW: 0, lie: 0, lieWant: 0, bookHome: 'shelf', head: [0, 0], zoom: 0, gazeProp: null };
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
  function plan(label, steps, after = '', stayOut = false) {
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
    if (rt.act !== 'up' && rt.act !== 'sitdown' && now > rt.legsAt && !inTalk && !window.WIZRA_STILL) { const pool = ['up', 'up', 'crossed', 'crossed', 'floor', 'drape', ...Object.keys(SEATED).filter(n => CLIPS[SEATED[n]._clip])]; rt.legs = pool[Math.random() * pool.length | 0]; rt.legsAt = now + 150000 + Math.random() * 200000; }
    let scoot = 0, perch = 0, sideways = 0, slide = 0; const seatClips = [];
    for (const name in LEGS) {
      rt.lg[name] += ((rt.legs === name ? 1 : 0) - rt.lg[name]) * Math.min(1, dt * 2.2); const v = rt.lg[name] * (1 - ka), wgt = v * v * (3 - 2 * v); if (wgt < 0.002) continue;
      if (LEGS[name]._clip) { if (!CLIPS[LEGS[name]._clip]) continue; seatClips.push([LEGS[name]._clip, wgt]); perch += (floorY + LEGS[name]._y) * wgt; scoot += (hip.z + LEGS[name]._z) * wgt; continue; } // a recorded pose, feet up on the seat
      if (LEGS[name]._z) scoot += LEGS[name]._z * wgt;                              // sitting forward on the seat
      if (LEGS[name]._yaw) { sideways += LEGS[name]._yaw * wgt; slide += LEGS[name]._x * wgt; perch += (LEGS[name]._y || 0) * wgt; }
      for (const n in LEGS[name]) { if (n[0] === '_') continue; const q = LEGS[name][n], c = CUR[n]; c[0] += (q[0] - c[0]) * wgt; c[1] += (q[1] - c[1]) * wgt; c[2] += (q[2] - c[2]) * wgt; }
    }
    // where her free arms rest (see ARMS); a held thing or a gesture goes over the top
    if (rt.act !== 'up' && rt.act !== 'sitdown' && now > rt.armsAt && !window.WIZRA_STILL) { const names = Object.keys(ARMS); rt.arms = names[Math.random() * names.length | 0]; rt.armsAt = now + 45000 + Math.random() * 70000; }
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
  const fp = { on: false, x: 0, z: 0, yaw: 0, pitch: 0, cx: 0, cz: 0, ch: places.eyeH, goal: null, sit: null, keys: new Set(), bob: 0 }; if (window.WIZRA_STILL) window.WIZRA_T = { fp, vrm };   /* test hook: lets a headless check place the first-person camera */
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
    for (const sx of [-1, 1]) { const a = part(new THREE.CapsuleGeometry(0.055, 0.42, 4, 10), T('#3b2a5c'), sx * 0.3, 0.86, -0.3); a.rotation.set(1.15, 0, sx * 0.35); part(new THREE.SphereGeometry(0.05, 10, 8), T('#d9b08c'), sx * 0.2, 0.8, -0.5); } dn.dm = dm; }
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
    const sx = dn.ox + rx * 0.66 + fx * 0.62, sz = dn.oz + rz * 0.66 + fz * 0.62; put(sx, sz, Math.atan2(dn.px - sx, dn.pz - sz) * 0.5 + Math.atan2(dn.ox - sx, dn.oz - sz) * 0.5);   /* she stands at the far left of the table, beside the Dungeon Master, half turned to you */
    camera.position.set(dn.px + fx * 0.55, eye + 0.08, dn.pz + fz * 0.55); camera.lookAt(dn.ox + rx * 0.36, floorY + 1.1, dn.oz + rz * 0.36 + fz * 0.4); camera.rotateY(dn.lx); camera.rotateX(dn.ly); }
  // ---- movie night as a film is shot: fixed cameras that cut from one to the next. You cannot walk; you can only glance around.
  //   'couch'  from behind the couch: the backs of two heads, the TV past them, the couch heavy and dark in front
  //   'side'   from your seat, turned to watch her watch the film
  //   'toss'   from your seat, leaning round to face her: the popcorn game
  // Line weight does the depth: every box in the room gets a dark shell whose thickness depends on how near the camera it is.
  const mv = { on: false, view: 'couch', lx: 0, ly: 0, b: 0, cutAt: 0, pose: 0 }, mvPos = new THREE.Vector3(), mvTgt = new THREE.Vector3(), shellMat = new THREE.MeshBasicMaterial({ color: '#1a1226', side: THREE.BackSide }), shells = [];
  // you, seen from behind: a plain stand-in until a real model of the player is added
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
  function movieMode(on, view) { on = !!on && here === 'house'; if (view && ['couch', 'side', 'toss'].includes(view) && view !== mv.view) { mv.view = view; mv.lx = mv.ly = 0; mv.cutAt = performance.now(); } if (on === mv.on) { if (on) { movieSpot(mv.view); movieShells(); } return mv.on; }
    mv.on = on; mv.lx = mv.ly = 0; if (on) { mv.cutAt = performance.now(); movieSpot(mv.view); } movieShells(); if (!on) man.visible = false; return mv.on; }
  function movieLook(dx, dy) { if (!mv.on) return; mv.lx = Math.max(-0.7, Math.min(0.7, mv.lx - dx * 0.004)); mv.ly = Math.max(-0.4, Math.min(0.4, mv.ly - dy * 0.003)); }
  function movieCamera(dt) { mv.pose += ((mv.on && rt.act === 'sit' ? 1 : 0) - mv.pose) * Math.min(1, dt * 2); if (!mv.on) return; if (here !== 'house') { movieMode(false); return; } fp.locked = true; movieSpot(mv.view);
    const seat = places.seat.house; man.visible = mv.view === 'couch'; man.position.set(seat.at[0], seat.h + 0.05, seat.at[1] - 0.16); man.rotation.y = 0.08;
    camera.position.copy(mvPos); camera.lookAt(mvTgt); camera.rotateY(mv.lx); camera.rotateX(mv.ly); }
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
    if (vrm.springBoneManager) vrm.springBoneManager.reset(); vrm.update(0); vrm.scene.updateMatrixWorld(true);
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
      { const s2 = R ? 1 : -1, side = R ? 'right' : 'left'; set(side + 'UpperArm', 0.3, s2 * 0.95, s2 * (spec.high ? -0.25 : 0.2)); set(side + 'LowerArm', 0, s2 * 0.2, 0); if (vrm.springBoneManager) vrm.springBoneManager.reset(); vrm.update(0); vrm.scene.updateMatrixWorld(true); } }   /* (a phone's front camera is a wide one, held a little past a straight arm) */
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
    bonusHit, hang, hangView, hangZone, hangMouth, movieMode, movieLook, dndMode, dndSurprise,
    snapshot, focus(k) { focusWant = Math.max(0, Math.min(1, k)); }, tears(on) { tearsWant = on ? 1 : 0; },
    draw(s) {
      if (snapReq) { const q = snapReq; snapReq = null; let url = ''; try { url = takeSnap(q.spec); } catch (e) { console.error('snapshot', e); } size = ''; q.done(url); }
      const W = el.clientWidth, H = el.clientHeight, key = W + 'x' + H;
      if (key !== size && W && H) { size = key; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
      if (frozen) { bonusCamera(s.t); renderer.render(scene, camera); return; }   // time stands still: nothing about her moves, only the view
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
      heartCamera(s.dt, s.t); hangCamera(s.dt); movieCamera(s.dt); dndCamera(s.dt, s.t);
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
      if (head) head.rotation.set(base.head[0] + pitch * 0.6 + gx.head[0] + body[1] + (rt.glow === 'high' ? 0.03 * Math.sin(s.t / 1700) : 0), yaw * 0.6 + gx.head[1] + body[2], roll * 0.6 + gx.head[2] + body[3] + drift);
      if (neck) neck.rotation.set(CUR.neck[0] + pitch * 0.4, yaw * 0.4, roll * 0.4);
      if (chest) chest.rotation.set(base.chest[0] + body[0] + s.breathe * 0.012, yaw * 0.3, roll * 0.3);
      // shoulders ride up with tension (unless a gesture is using them), hips bounce
      if (!touchedBones.includes('leftShoulder')) { set('leftShoulder', 0, 0, body[4] + s.breathe * 0.01); set('rightShoulder', 0, 0, -body[4] - s.breathe * 0.01); }
      if (hipsNode) hipsNode.position.y = hipY0 + gx.hipY + clipHip;
      if (window.WIZRA_FIX) { let soft = Math.max(rt.lie || 0, hpose.on ? 1 : 0); for (const n in SEATED) soft = Math.max(soft, rt.lg[n] || 0); fixBody(1 - Math.min(1, soft)); }   // her arms and legs keep out of her own body (not in the recorded curled-up and lying poses, which fold her on purpose)
      clothTick(); vrm.update(s.dt); if (hpose.settle && --hpose.settle === 0 && vrm.springBoneManager) vrm.springBoneManager.reset(); // spring bones: hair and clothes swing with the head
      placeProps(); lampTick(s.dt); places.tick(night, s.t); places.live(here, s.t, night); stormTick(performance.now()); quality(performance.now());
      if (cinema && places.power) { const f = 0.5 + 0.5 * Math.sin(s.t / 140) * Math.sin(s.t / 370); screenLight.color.set(cinema); screenLight.intensity = 1.2 + 1.3 * f; if (here === 'house') screenLight.position.copy(places.tv.at).add(tmpB.set(0, 0, 0.35)); else screenLight.position.set(0.2, floorY + 1.25, hip.z + 2.4); } else screenLight.intensity = 0;
      // flushed cheeks, only from the front
      rawHead.getWorldDirection(fwd); toCam.copy(camera.position).sub(headPos).normalize();
      const blushWant = (s.face.blush || 0) * (fwd.dot(toCam) > 0.25 ? 0.42 : 0); blushNow += (blushWant - blushNow) * Math.min(1, s.dt * 4); blushMat.opacity = blushNow;
      // the close camera stays on her face wherever she goes
      head.getWorldPosition(tmpA); tmpA.y += eyeUp; eye.lerp(tmpA, Math.min(1, s.dt * 8)); near.set(eye.x, eye.y - 0.035, eye.z);
      renderer.render(scene, camera);
      if (thumbCb && !fp.on && zoom < 0.03 && rt.act === 'sit' && rt.stand < 0.01 && !rt.glow && !s.gesture && !s.blink) { const cb = thumbCb; thumbCb = null; try { cb(renderer.domElement.toDataURL('image/webp', 0.85)); } catch {} } // straight after a draw, while the picture is still in the canvas
    },
    dispose() { clearInterval(dayTimer); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', keysOff); el.remove(); try { VRMUtils.deepDispose(vrm.scene); renderer.dispose(); renderer.forceContextLoss(); } catch {} },
  };
}
