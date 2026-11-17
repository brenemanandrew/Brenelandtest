// Draws a VRM model (VRoid and friends) as Wizra's avatar. It is a renderer for avatar.js: the controller there decides
// her mood, reactions and where she looks; this file turns that into bones and expressions on the model.
//   const r = await create(url)   ->  { el, locate(e), draw(state), dispose() }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// controller face name -> VRM expression weights (+ blink for heavy lids)
const EXPR = {
  neutral: {}, happy: { happy: 0.6 }, playful: { happy: 0.35 }, chill: { relaxed: 0.6 }, focused: { angry: 0.2, blink: 0.25 }, excited: { happy: 1 },
  tired: { relaxed: 0.4, blink: 0.45 }, grumpy: { angry: 0.6 }, sad: { sad: 0.7 }, anxious: { sad: 0.35, surprised: 0.3 }, joy: { happy: 1 },
  blush: { relaxed: 0.5, sad: 0.2 }, surprised: { surprised: 1 }, flinch: { blink: 1, sad: 0.4 }, dizzy: { blink: 0.8, sad: 0.5 }, angry: { angry: 1 },
  eyeroll: { blink: 0.3 }, thinking: { relaxed: 0.2 }, suspicious: { angry: 0.3, blink: 0.35 },
};
const NAMES = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink', 'aa', 'oh'];

export async function create(url) {
  const el = document.createElement('div');
  el.style.cssText = 'width:100%;height:100%;background:radial-gradient(circle at 50% 35%, #8a5bb8, #4a2d7a 55%, #2a1b4d 100%)';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI), amb = new THREE.AmbientLight(0xffffff, 0.4); sun.position.set(0.6, 1, 1.2); scene.add(sun, amb);
  // the room follows the clock on the device you are watching from: bright by day, warm in the evening, dim and blue at night
  let night = 0;
  function daylight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const day = Math.max(0, Math.min(1, (h - 6) / 1.5)) * Math.max(0, Math.min(1, (20.5 - h) / 2)); night = 1 - day;
    const eve = Math.max(0, 1 - Math.abs(h - 19) / 2.5);
    sun.intensity = Math.PI * (0.62 + 0.38 * day); sun.color.setRGB(1 - 0.12 * night + 0.02 * eve, 1 - 0.14 * night - 0.08 * eve, 1 - 0.02 * night - 0.2 * eve);
    amb.intensity = 0.26 + 0.2 * day;
    el.style.background = `radial-gradient(circle at 50% 35%, hsl(${272 - 20 * night} ${45 - 10 * night}% ${54 - 26 * night}%), hsl(264 46% ${32 - 14 * night}%) 55%, hsl(258 48% ${20 - 9 * night}%) 100%)`;
  }
  daylight(); const dayTimer = setInterval(daylight, 60000);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);

  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm; if (!vrm) throw new Error('That file is not a VRM model.');
  VRMUtils.rotateVRM0(vrm); // older (0.x) models face the other way
  vrm.scene.traverse(o => { o.frustumCulled = false; });
  scene.add(vrm.scene);

  const B = n => vrm.humanoid.getNormalizedBoneNode(n);
  const head = B('head'), neck = B('neck'), chest = B('upperChest') || B('chest');
  // ---- the pose: leaning back in an armchair, legs out, feet up on a low table ----
  const set = (n, x = 0, y = 0, z = 0) => { const bone = B(n); if (bone) bone.rotation.set(x, y, z); };
  const POSE = window.WIZRA_POSE || {
    hips: [-0.32, 0, 0], spine: [0.14, 0, 0], chest: [0.1, 0, 0], neck: [0.08, 0, 0],
    leftUpperLeg: [-1.3, 0, 0.05], rightUpperLeg: [-1.2, 0, -0.05], leftLowerLeg: [0.1, 0, 0], rightLowerLeg: [0.16, 0, 0], leftFoot: [0.25, 0, 0], rightFoot: [0.25, 0, 0],
    leftUpperArm: [0.18, 0, -1.12], rightUpperArm: [0.18, 0, 1.12], leftLowerArm: [0, -0.45, 0], rightLowerArm: [0, 0.45, 0], leftHand: [0, 0, -0.1], rightHand: [0, 0, 0.1],
  };
  for (const side of ['left', 'right']) for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (const j of ['Proximal', 'Intermediate', 'Distal'])
    if (!POSE[side + f + j]) POSE[side + f + j] = [0, 0, (side === 'left' ? -1 : 1) * (j === 'Proximal' ? 0.3 : 0.38)]; // loosely curled fingers
  // Her routine blends between whole-body poses: SIT (above), STAND, and what she is busy with laid over the top.
  // sitting upright on the edge of the seat, feet on the floor: the halfway pose for getting up and sitting down
  const SITUP = { hips: [0.06, 0, 0], spine: [0.1, 0, 0], chest: [0.04, 0, 0], neck: [0, 0, 0], leftUpperLeg: [-1.5, 0, 0.04], rightUpperLeg: [-1.5, 0, -0.04], leftLowerLeg: [1.5, 0, 0], rightLowerLeg: [1.5, 0, 0], leftFoot: [0, 0, 0], rightFoot: [0, 0, 0] };
  const STAND = { leftUpperArm: [0, 0, -1.3], rightUpperArm: [0, 0, 1.3], leftLowerArm: [0, -0.15, 0], rightLowerArm: [0, 0.15, 0] };
  const OVER = window.WIZRA_OVER || {
    read: { leftUpperArm: [-0.55, 0.25, -1.1], leftLowerArm: [0, -1.6, 0], rightUpperArm: [-0.55, -0.25, 1.1], rightLowerArm: [0, 1.6, 0] },
    phone: { rightUpperArm: [-0.6, -0.2, 1.1], rightLowerArm: [0, 1.9, 0] },
    sip: { rightUpperArm: [-0.9, -0.3, 1.0], rightLowerArm: [0, 2.2, 0] },
  };
  const FINGER = /Proximal|Intermediate|Distal/;
  const KEYS = [...new Set([...Object.keys(POSE), ...Object.keys(STAND), ...Object.values(OVER).flatMap(o => Object.keys(o))])];
  const standOf = n => STAND[n] || (FINGER.test(n) ? POSE[n] : [0, 0, 0]), situpOf = n => SITUP[n] || POSE[n] || [0, 0, 0];
  const CUR = {}; for (const n of KEYS) CUR[n] = [...(POSE[n] || [0, 0, 0])];
  for (const n in POSE) set(n, ...POSE[n]);
  // ---- gestures: bone targets blended over the resting pose while one plays. t = seconds in, for the moving parts. ----
  // Bone names take absolute rotations. Special keys: _head [pitch, yaw, roll] added to her head, _hipY metres of bounce,
  // _face expression weights. P(n) is the resting rotation of a bone, for "rest plus a bit".
  const P = n => CUR[n] || [0, 0, 0], plus = (n, x = 0, y = 0, z = 0) => [P(n)[0] + x, P(n)[1] + y, P(n)[2] + z];
  const sin = Math.sin, abs = Math.abs;
  const GESTURE = {
    wave: t => ({ rightUpperArm: [0, 0, -0.7], rightLowerArm: [0, 0, -0.95 + 0.42 * sin(t * 9)], rightHand: [0, 0, -0.1], _head: [0, 0, 0.08] }),
    shrug: () => ({ leftShoulder: [0, 0, 0.38], rightShoulder: [0, 0, -0.38], leftUpperArm: [0.18, 0, -1.2], rightUpperArm: [0.18, 0, 1.2], leftLowerArm: [0, -0.75, 0], rightLowerArm: [0, 0.75, 0], leftHand: [0, 0, 0.5], rightHand: [0, 0, -0.5], _head: [0, 0, 0.12] }),
    stretch: t => ({ leftUpperArm: [0, 0, 1.25], rightUpperArm: [0, 0, -1.25], leftLowerArm: [0, -0.25, 0], rightLowerArm: [0, 0.25, 0], spine: plus('spine', -0.2 + 0.02 * sin(t * 2)), _head: [-0.15, 0, 0], _face: { blink: 1 } }),
    yawn: t => ({ leftUpperArm: [0, 0, 1.1], leftLowerArm: [0, -0.5, 0], spine: plus('spine', -0.12), _head: [-0.2, 0, 0.1], _face: { aa: 0.9, blink: 1 } }),
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
    jolt: t => ({ spine: plus('spine', -0.14 * Math.exp(-t * 2.5)), leftShoulder: [0, 0, 0.25 * Math.exp(-t * 2.5)], rightShoulder: [0, 0, -0.25 * Math.exp(-t * 2.5)], _head: [-0.12 * Math.exp(-t * 2.5), 0, 0] }),
  };
  const REST = n => CUR[n] || [0, 0, 0];
  const WIDE = { wave: 0.3, hi: 0.25, shrug: 0.25, stretch: 0.34, yawn: 0.3, handsup: 0.3, point: 0.32, lean: 0.3, bow: 0.3, dance: 0.4, feet: 0.95, shift: 0.1, laugh: 0.12, bounce: 0.15, slump: 0.12, situp: 0.2, leanback: 0.2, cringe: 0.15 }; // how far the camera backs off so you can see it
  let touchedBones = [], gestureZoom = 0;
  const gx = { head: [0, 0, 0], hipY: 0, face: null, k: 0 };
  const hipsNode = B('hips'), hipY0 = hipsNode ? hipsNode.position.y : 0;
  // Her mood also sits in her body, not just her face: [spine lean, head pitch, head yaw, head roll, shoulders up]
  const BODY = { sad: [0.1, 0.22, 0, 0.05, -0.06], grumpy: [-0.04, 0.08, 0.3, 0, 0.05], tired: [0.06, 0.2, 0, 0.14, -0.08], excited: [0.1, -0.06, 0, 0, 0.08], joy: [-0.03, -0.1, 0, 0.05, 0.06],
    surprised: [-0.1, -0.08, 0, 0, 0.18], angry: [0.12, 0.12, 0, 0, 0.1], blush: [0, 0.14, 0.36, 0.08, 0.16], thinking: [-0.03, -0.12, 0.2, 0.14, 0], suspicious: [0.04, 0.06, 0.22, -0.1, 0],
    anxious: [0.03, 0.08, 0, 0.04, 0.2], chill: [-0.06, -0.04, 0, 0.06, -0.04], playful: [0.05, 0, 0, 0.12, 0.03], eyeroll: [-0.03, -0.14, 0.15, 0.08, 0], flinch: [-0.1, 0.05, 0, 0, 0.3], dizzy: [0, 0.1, 0, 0.2, 0], focused: [0.1, 0.06, 0, 0, 0], happy: [0.02, -0.04, 0, 0.04, 0.03] };
  const body = [0, 0, 0, 0, 0];
  function applyGesture(g, faceName, dt) {
    for (const n of touchedBones) if (!CUR[n]) set(n, 0, 0, 0); touchedBones = []; gestureZoom = 0; gx.head = [0, 0, 0]; gx.hipY = 0; gx.face = null; gx.k = 0;
    const want = BODY[faceName] || [0, 0, 0, 0, 0]; for (let i = 0; i < 5; i++) body[i] += (want[i] - body[i]) * Math.min(1, dt * 5);
    if (!g || !GESTURE[g.name]) return;
    const tg = GESTURE[g.name](g.t), k = g.w * g.w * (3 - 2 * g.w); gx.k = k;
    for (const n in tg) {
      const q = tg[n];
      if (n === '_head') gx.head = [q[0] * k, q[1] * k, q[2] * k]; else if (n === '_hipY') gx.hipY = q * k; else if (n === '_face') gx.face = q;
      else { const r = REST(n); set(n, r[0] + (q[0] - r[0]) * k, r[1] + (q[1] - r[1]) * k, r[2] + (q[2] - r[2]) * k); touchedBones.push(n); }
    }
    gestureZoom = (WIDE[g.name] || 0) * k;
  }
  const base = { head: [0, 0, 0], neck: POSE.neck || [0, 0, 0], chest: (B('upperChest') ? [0, 0, 0] : POSE.chest) || [0, 0, 0] };
  vrm.update(0); if (vrm.springBoneManager) vrm.springBoneManager.reset();

  // furniture, built to fit wherever her hips and heels ended up
  const wp = n => { const v = new THREE.Vector3(); const bone = B(n); if (bone) bone.getWorldPosition(v); return v; };
  const hip = wp('hips'), feet = wp('leftFoot').add(wp('rightFoot')).multiplyScalar(0.5);
  const floorY = hip.y - 0.5, mat = c => new THREE.MeshLambertMaterial({ color: c });
  let TAG = 'chair'; const tagged = []; // everything you can tap to send her to
  const tag = (m, t = TAG) => { m.traverse(o => { if (o.isMesh) { o.userData.tag = t; tagged.push(o); } }); return m; };
  const box = (w, h, d, x, y, z, c, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.x = rx; scene.add(m); return tag(m); };
  const seatTop = hip.y - 0.1;
  box(0.74, seatTop - floorY - 0.12, 0.72, 0, (seatTop - 0.12 + floorY) / 2, hip.z + 0.06, '#3a2148');           // chair body
  box(0.6, 0.14, 0.62, 0, seatTop - 0.07, hip.z + 0.1, '#5b3570');                                               // seat cushion
  box(0.74, 0.95, 0.16, 0, seatTop + 0.3, hip.z - 0.36, '#4a2a5c', -0.28);                                       // back, tilted
  box(0.13, 0.3, 0.7, -0.38, seatTop + 0.08, hip.z + 0.05, '#4a2a5c'); box(0.13, 0.3, 0.7, 0.38, seatTop + 0.08, hip.z + 0.05, '#4a2a5c'); // arms
  const tableTop = feet.y - 0.1, tableZ = feet.z + 0.1; TAG = 'table';
  box(0.8, 0.05, 0.5, 0, tableTop - 0.025, tableZ, '#3b2a1c');                                            // table top
  for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]]) box(0.05, tableTop - floorY - 0.05, 0.05, x, (tableTop - 0.05 + floorY) / 2, tableZ + z, '#2a1d14');
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), mat('#251a30')); rug.rotation.x = -Math.PI / 2; rug.position.set(0, floorY, (hip.z + feet.z) / 2); scene.add(rug); tag(rug, 'floor');

  // ---- the rest of her room: a floor, a bookshelf to the left and a little counter with a kettle to the right ----
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), mat('#2b2038')); floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY - 0.004, hip.z); scene.add(floor); tag(floor, 'floor');
  const backZ = hip.z - 1.25;                                    // the line the shelf and counter stand on
  const SHELF = { x: -1.3, z: backZ }, COUNTER = { x: 1.45, z: backZ + 0.05 }; TAG = 'shelf';
  box(0.9, 1.7, 0.04, SHELF.x, floorY + 0.85, SHELF.z - 0.13, '#33241a');                                         // shelf back
  box(0.04, 1.7, 0.3, SHELF.x - 0.45, floorY + 0.85, SHELF.z, '#3b2a1c'); box(0.04, 1.7, 0.3, SHELF.x + 0.45, floorY + 0.85, SHELF.z, '#3b2a1c');
  for (let i = 0; i < 5; i++) box(0.9, 0.035, 0.3, SHELF.x, floorY + 0.05 + i * 0.41, SHELF.z, '#3b2a1c');
  const SPINES = ['#7a1f3a', '#2f4a7a', '#3d6b4f', '#8a6a2a', '#5b3570', '#a04a2a', '#2a6b78', '#6b2a4a'];
  for (let row = 0; row < 4; row++) { let x = SHELF.x - 0.4, n = 0; while (x < SHELF.x + 0.36) { const wd = 0.03 + ((row * 7 + n * 5) % 4) * 0.009, ht = 0.25 + ((row * 3 + n * 11) % 5) * 0.022; if (!(row === 2 && n === 4)) box(wd, ht, 0.2, x + wd / 2, floorY + 0.07 + row * 0.41 + ht / 2, SHELF.z, SPINES[(row * 3 + n) % SPINES.length]); x += wd + 0.006; n++; } }
  TAG = 'counter';
  box(0.7, 0.9, 0.45, COUNTER.x, floorY + 0.45, COUNTER.z, '#3a2148'); box(0.76, 0.04, 0.5, COUNTER.x, floorY + 0.92, COUNTER.z, '#d9cfe6'); // counter + top
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.19, 20), mat('#c9ccd6')); kettle.position.set(COUNTER.x + 0.15, floorY + 1.035, COUNTER.z); scene.add(kettle); tag(kettle, 'counter');
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16), mat('#6b3a2a')); jar.position.set(COUNTER.x - 0.2, floorY + 1.01, COUNTER.z - 0.05); scene.add(jar);

  // a floor lamp behind the chair that comes on as it gets dark
  TAG = 'lamp'; box(0.035, 1.5, 0.035, 0.75, floorY + 0.75, backZ + 0.1, '#1c1626'); box(0.3, 0.03, 0.3, 0.75, floorY + 0.015, backZ + 0.1, '#1c1626');
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.26, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd9a0', side: THREE.DoubleSide })); shade.position.set(0.75, floorY + 1.58, backZ + 0.1); scene.add(shade); tag(shade, 'lamp');
  const lampLight = new THREE.PointLight('#ffc27a', 0, 5, 1.6); lampLight.position.copy(shade.position); scene.add(lampLight);
  let lampOn = null; // null = follows the hour; true/false once you have tapped it

  // ---- props: they rest on the furniture and go to her hands when she uses them ----
  const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); scene.add(g); return g; };
  const slab = (w, h, d, c, x = 0, y = 0, z = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.y = ry; return m; };
  const book = group(slab(0.12, 0.18, 0.014, '#7a1f3a', -0.058, 0, -0.012, 0.28), slab(0.12, 0.18, 0.014, '#7a1f3a', 0.058, 0, -0.012, -0.28), slab(0.11, 0.165, 0.008, '#f3ecdf', -0.056, 0, 0, 0.28), slab(0.11, 0.165, 0.008, '#f3ecdf', 0.056, 0, 0, -0.28));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.12), new THREE.MeshBasicMaterial({ color: '#9fd8ff' })); screen.position.z = 0.0052;
  const phone = group(slab(0.068, 0.138, 0.009, '#15121c'), screen);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.09, 20), mat('#f0e8f8')), handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 16), mat('#f0e8f8')); handle.position.x = 0.045;
  const mug = group(cup, handle);
  tag(book, 'book'); tag(phone, 'phone'); tag(mug, 'mug');
  const REST_AT = { // where each prop sits when she is not holding it: [position, rotation]
    book: [new THREE.Vector3(0.24, tableTop + 0.012, feet.z - 0.08), new THREE.Euler(-Math.PI / 2, 0, 0.4)],
    bookShelf: [new THREE.Vector3(SHELF.x - 0.19, floorY + 0.07 + 2 * 0.41 + 0.1, SHELF.z + 0.02), new THREE.Euler(0, Math.PI / 2, 0)], // its gap on the shelf
    phone: [new THREE.Vector3(-0.26, tableTop + 0.006, feet.z - 0.1), new THREE.Euler(-Math.PI / 2, 0, -0.3)],
    mug: [new THREE.Vector3(-0.38, seatTop + 0.275, hip.z + 0.22), new THREE.Euler(0, 0.6, 0)],
  };
  const PROP = { read: book, phone, sip: mug }, PROP_KEY = { read: 'book', phone: 'phone', sip: 'mug' };
  const raw = n => vrm.humanoid.getRawBoneNode(n);
  const palmR = raw('rightMiddleProximal') || raw('rightHand'), palmL = raw('leftMiddleProximal') || raw('leftHand');
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), headPos = new THREE.Vector3();

  // ---- her routine: what she is busy with when left alone, and the errands she can run ----
  // Seated she reads, checks her phone or sips. On her feet she follows a plan: a list of steps (go somewhere, turn, wait
  // with her hand out, do something), then walks back and sits down, optionally starting something once seated.
  const STAND_AT = [0, hip.z + 0.4];                                               // she stands up in front of the chair, between it and the table
  const EXIT = [0.95, hip.z + 0.5];                                                // then steps out to the side past the armrest
  const R_BACK = [0.95, hip.z - 0.72], L_BACK = [-0.78, hip.z - 0.72];             // round the back of the chair
  const AT_SHELF = [SHELF.x + 0.12, SHELF.z + 0.5], AT_COUNTER = [COUNTER.x - 0.05, COUNTER.z + 0.52];
  const DOING = { read: 'reading her book', phone: 'looking at her phone', sip: 'sipping her drink' };
  const rt = { act: 'sit', until: 0, nextAt: performance.now() + 15000 + Math.random() * 15000, stand: 0, ov: { read: 0, phone: 0, sip: 0 }, x: STAND_AT[0], z: STAND_AT[1], yaw: 0, phase: 0, leg: 0,
    steps: [], i: 0, stepT: 0, label: '', after: '', hold: 0, carry: null, carryW: { book: 0, mug: 0 }, bookHome: 'shelf', head: [0, 0], zoom: 0, gazeProp: null };
  const go = p => ({ go: p }), face = yaw => ({ face: yaw }), wait = sec => ({ wait: sec }), stay = sec => ({ wait: sec, idle: true }), run = fn => ({ run: fn });
  // the way back to the chair from wherever she is: round the back if she is behind it, down the side if she is out front
  function wayHome() {
    const w = [];
    if (rt.z < hip.z - 0.2) { if (rt.x < 0.3) w.push(go(L_BACK)); w.push(go(R_BACK)); }
    else if (rt.z > hip.z + 0.62 && rt.x < 0.8) w.push(go([0.98, rt.z]));
    return [...w, go(EXIT), go(STAND_AT)];
  }
  function wayTo(x, z) { // and out to a spot on the floor, the same rules in reverse
    const w = [];
    if (z < hip.z - 0.2) { w.push(go(R_BACK)); if (x < 0.3) w.push(go(L_BACK)); }
    else if (z > hip.z + 0.62 && x < 0.8) w.push(go([0.98, z]));
    return [...w, go([x, z])];
  }
  function plan(label, steps, after = '') {
    if (rt.stand < 0.05) { rt.x = STAND_AT[0]; rt.z = STAND_AT[1]; rt.yaw = 0; }
    Object.assign(rt, { act: 'up', steps: [go(EXIT), ...steps, run(() => { rt.steps.push(...wayHome()); })], i: (rt.stand > 0.5 ? 1 : 0), stepT: 0, label, after });
  }
  const ERRAND = {
    pace: () => plan('up and pacing around the room', [go(R_BACK), go(L_BACK), go(R_BACK)]),
    fetchbook: () => plan('getting a book from the shelf', [go(R_BACK), go(L_BACK), go(AT_SHELF), face(Math.PI), wait(1.3), run(() => { rt.carry = 'book'; rt.bookHome = 'table'; }), wait(0.5)], Math.random() < 0.75 ? 'read' : ''),
    returnbook: () => plan('putting her book back on the shelf', [run(() => { rt.carry = 'book'; }), wait(0.6), go(R_BACK), go(L_BACK), go(AT_SHELF), face(Math.PI), wait(1.2), run(() => { rt.carry = null; rt.bookHome = 'shelf'; }), wait(0.5)]),
    fetchdrink: () => plan('getting herself a drink', [run(() => { rt.carry = 'mug'; }), wait(0.6), go(AT_COUNTER), face(Math.PI), wait(2.2)], 'sip'),
  };
  function startActivity(name) {
    const now = performance.now();
    if (name === 'sit') { if (rt.act === 'up') { rt.steps = wayHome(); rt.i = 0; rt.after = ''; } else if (rt.act !== 'sitdown') rt.act = 'sit'; rt.nextAt = now + 20000 + Math.random() * 25000; return; }
    if (name === 'read' && rt.bookHome === 'shelf') name = 'fetchbook';             // nothing to read until she gets a book
    if (name === 'returnbook' && rt.bookHome === 'shelf') return;
    if (ERRAND[name]) { if (rt.act !== 'up' && rt.act !== 'sitdown') { if (OVER[rt.act]) rt.act = 'sit'; ERRAND[name](); } return; }
    if (!OVER[name] || rt.act === 'up' || rt.act === 'sitdown') return;
    rt.act = name; rt.until = now + (name === 'sip' ? 4200 : name === 'phone' ? 14000 + Math.random() * 12000 : 22000 + Math.random() * 22000);
  }
  const turnTo = (want, dt, rate) => { const d = Math.atan2(Math.sin(want - rt.yaw), Math.cos(want - rt.yaw)); rt.yaw += d * Math.min(1, dt * rate); rt.yaw = Math.atan2(Math.sin(rt.yaw), Math.cos(rt.yaw)); return Math.abs(d); }; // kept within half a turn either way, so "facing front" is always 0
  function routine(s) {
    const now = performance.now(), dt = s.dt, attending = s.talking || s.faceName === 'thinking';
    // on her own schedule
    if (rt.act === 'sit' && !attending && now > rt.nextAt && !window.WIZRA_STILL) {
      const r = Math.random(), onTable = rt.bookHome === 'table';
      startActivity(r < 0.28 ? 'read' : r < 0.5 ? 'phone' : r < 0.66 ? 'sip' : r < 0.8 ? 'pace' : r < 0.92 ? 'fetchdrink' : onTable ? 'returnbook' : 'fetchbook');
    }
    if (OVER[rt.act] && now > rt.until) { rt.act = 'sit'; rt.nextAt = now + 14000 + Math.random() * 24000; }
    // standing up / sitting down
    // two stages: first her feet come off the table and down to the floor and she sits up, then she rises onto them
    const up = rt.act === 'up' ? 1 : 0; rt.stand += Math.sign(up - rt.stand) * Math.min(Math.abs(up - rt.stand), dt * 0.62);
    const ease = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    const ka = ease(rt.stand / 0.45), k = ease((rt.stand - 0.45) / 0.55); rt.k = k;
    for (const n of KEYS) { const a = POSE[n] || [0, 0, 0], m = situpOf(n), b = standOf(n), c = CUR[n]; for (let i = 0; i < 3; i++) { const mid = a[i] + (m[i] - a[i]) * ka; c[i] = mid + (b[i] - mid) * k; } }
    if (k > 0 && k < 1) { const push = Math.sin(Math.PI * k); CUR.spine[0] += 0.35 * push; CUR.hips[0] += 0.18 * push; CUR.leftUpperLeg[0] -= 0.25 * push; CUR.rightUpperLeg[0] -= 0.25 * push; } // lean forward over her feet to get up
    // the plan she is following on her feet; she stops and turns to you when you talk to her
    let moving = false, holdWant = rt.carry ? 0.5 : 0;
    if (rt.act === 'up' && rt.stand > 0.985) {
      const st = rt.steps[rt.i];
      if (!st) { rt.act = 'sitdown'; }
      else if (attending) turnTo(Math.atan2(camera.position.x - rt.x, camera.position.z - rt.z), dt, 4);
      else if (st.go) {
        const dx = st.go[0] - rt.x, dz = st.go[1] - rt.z, d = Math.hypot(dx, dz);
        if (d < 0.06) rt.i++;
        else { moving = true; const off = turnTo(Math.atan2(dx, dz), dt, 5), sp = 0.62 * Math.max(0.12, 1 - off); rt.x += dx / d * sp * dt; rt.z += dz / d * sp * dt; rt.phase += sp * dt * 4.6; }
      }
      else if (st.face !== undefined) { if (turnTo(st.face, dt, 5) < 0.1) rt.i++; }
      else if (st.wait) { holdWant = st.idle ? holdWant : 1; if (st.idle) turnTo(Math.atan2(camera.position.x - rt.x, camera.position.z - rt.z), dt, 4); rt.stepT += dt; if (rt.stepT >= st.wait) { rt.stepT = 0; rt.i++; } }
      else if (st.run) { st.run(); rt.i++; }
    }
    if (rt.act === 'sitdown') { // turn to face front, lower into the chair, then get on with whatever she came back to do
      turnTo(0, dt, 5);
      if (Math.abs(rt.yaw) < 0.08 && rt.stand <= 0.001) { rt.act = 'sit'; rt.nextAt = now + 18000 + Math.random() * 25000; const then = rt.after; rt.after = ''; if (rt.carry === 'book' && then !== 'read') rt.bookHome = 'table'; rt.carry = null; if (then) startActivity(then); }
    }
    // what she is holding while seated
    rt.gazeProp = null; let hp = 0, hy = 0;
    for (const name in OVER) {
      const want = rt.act === name ? (attending ? 0.55 : 1) : 0; rt.ov[name] += (want - rt.ov[name]) * Math.min(1, dt * 3.5);
      const wgt = rt.ov[name]; if (wgt < 0.002) continue;
      for (const n in OVER[name]) { const q = OVER[name][n], c = CUR[n]; c[0] += (q[0] - c[0]) * wgt; c[1] += (q[1] - c[1]) * wgt; c[2] += (q[2] - c[2]) * wgt; }
      if (rt.act === name && !attending && name !== 'sip') { rt.gazeProp = PROP[name]; hp = 0.28 * wgt; hy = name === 'phone' ? -0.18 * wgt : 0; }
      if (name === 'sip') hp = -0.12 * wgt;
    }
    // her hand out: reaching for something, or carrying it
    rt.hold += (holdWant - rt.hold) * Math.min(1, dt * 4);
    if (rt.hold > 0.002) for (const n in OVER.phone) { const q = OVER.phone[n], c = CUR[n]; c[0] += (q[0] - c[0]) * rt.hold; c[1] += (q[1] - c[1]) * rt.hold; c[2] += (q[2] - c[2]) * rt.hold; }
    for (const key in rt.carryW) rt.carryW[key] += ((rt.carry === key ? 1 : 0) - rt.carryW[key]) * Math.min(1, dt * 4);
    rt.head[0] += (hp - rt.head[0]) * Math.min(1, dt * 4); rt.head[1] += (hy - rt.head[1]) * Math.min(1, dt * 4);
    rt.leg += ((moving ? 1 : 0) - rt.leg) * Math.min(1, dt * 6);
    if (rt.leg > 0.01) { // the walk: legs, rolling feet, swaying hips, counter-turning shoulders, loose bent arms, a slight lean
      const a = rt.leg, ph = rt.phase, sw = Math.sin(ph), cw = Math.cos(ph);
      CUR.leftUpperLeg[0] += -0.52 * sw * a; CUR.rightUpperLeg[0] += 0.52 * sw * a;
      CUR.leftLowerLeg[0] += 0.85 * Math.max(0, cw) * a; CUR.rightLowerLeg[0] += 0.85 * Math.max(0, -cw) * a;
      CUR.leftFoot[0] += (0.3 * Math.max(0, -sw) - 0.22 * Math.max(0, sw)) * a; CUR.rightFoot[0] += (0.3 * Math.max(0, sw) - 0.22 * Math.max(0, -sw)) * a;
      CUR.hips[1] += -0.07 * sw * a; CUR.hips[2] += 0.045 * cw * a; CUR.spine[1] += 0.11 * sw * a; CUR.spine[2] += -0.04 * cw * a; CUR.spine[0] += 0.05 * a;
      CUR.leftUpperArm[0] += 0.42 * sw * a; CUR.rightUpperArm[0] += -0.42 * sw * a * (1 - rt.hold);
      CUR.leftLowerArm[1] += (-0.22 - 0.18 * Math.max(0, -sw)) * a; CUR.rightLowerArm[1] += (0.22 + 0.18 * Math.max(0, sw)) * a * (1 - rt.hold);
    }
    if (k > 0.98 && rt.leg < 0.5) { const sway = Math.sin(now / 1400) * (1 - rt.leg * 2); CUR.hips[2] += 0.035 * sway; CUR.spine[2] -= 0.03 * sway; CUR.leftUpperLeg[2] -= 0.03 * sway; CUR.rightUpperLeg[2] -= 0.03 * sway; } // standing still: shifting her weight
    for (const n of KEYS) set(n, CUR[n][0], CUR[n][1], CUR[n][2]);
    vrm.scene.position.set(rt.x * k, floorY * k + 0.026 * Math.abs(Math.cos(rt.phase)) * rt.leg * k, (ka - k) * 0.05 + rt.z * k);
    vrm.scene.rotation.y = rt.yaw * k;
    rt.zoom = 0.3 * k;
  }
  function lampTick(dt) { const want = (lampOn === null ? night > 0.45 : lampOn) ? 1 : 0; lampLight.intensity += (want * 2.4 - lampLight.intensity) * Math.min(1, dt * 4); shade.material.color.setRGB(0.42 + 0.58 * lampLight.intensity / 2.4, 0.36 + 0.49 * lampLight.intensity / 2.4, 0.32 + 0.31 * lampLight.intensity / 2.4); }
  // ---- tap to direct: you tap a thing in her room, she goes and deals with it ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(tagged, false)[0];
    return hit ? { tag: hit.object.userData.tag, x: hit.point.x, z: hit.point.z } : null;
  }
  function direct(hit) { // returns what happened, in the words used for the silent note to her (or '' if nothing did)
    const t = hit.tag;
    if (t === 'lamp') { lampOn = !(lampLight.intensity > 1); return ''; }
    if (t === 'shelf') { const had = rt.bookHome === 'table'; startActivity(had ? 'returnbook' : 'fetchbook'); return 'pointshelf'; }
    if (t === 'counter') { startActivity('fetchdrink'); return 'pointcounter'; }
    if (t === 'chair') { if (rt.act !== 'up') return ''; startActivity('sit'); return 'pointchair'; }
    if (t === 'book' || (t === 'table' && rt.bookHome === 'table' && rt.act === 'sit')) { startActivity('read'); return 'pointbook'; }
    if (t === 'phone') { startActivity('phone'); return 'pointphone'; }
    if (t === 'mug') { startActivity('sip'); return 'pointmug'; }
    if (t === 'floor') {
      const x = hit.x, z = hit.z, d = Math.hypot(x, z - hip.z);
      const blocked = d > 2.5 || (Math.abs(x) < 0.62 && z > hip.z - 0.62 && z < hip.z + 0.58) || (Math.abs(x) < 0.58 && Math.abs(z - tableZ) < 0.42) || (Math.abs(x - SHELF.x) < 0.6 && z < SHELF.z + 0.3) || (Math.abs(x - COUNTER.x) < 0.5 && z < COUNTER.z + 0.38);
      if (blocked || rt.act === 'sitdown') return '';
      if (OVER[rt.act]) rt.act = 'sit';
      if (rt.act === 'up') { rt.steps = [...wayTo(x, z), stay(7), run(() => { rt.steps.push(...wayHome()); })]; rt.i = 0; rt.label = 'standing where you pointed'; rt.after = ''; }
      else plan('walking over to where you pointed', [...wayTo(x, z), stay(7)]);
      return 'pointfloor';
    }
    return '';
  }
  function placeProps() { // after her bones are final for the frame: each prop is at rest, in her hands, or somewhere between
    head.getWorldPosition(headPos);
    for (const name in PROP) {
      const key = PROP_KEY[name], o = PROP[name], [rp, rr] = REST_AT[key === 'book' && rt.bookHome === 'shelf' ? 'bookShelf' : key];
      const held = Math.max(rt.ov[name] * 1.6, rt.carryW[key] || 0), wgt = Math.min(1, held), e = wgt * wgt * (3 - 2 * wgt), reading = name === 'read' && rt.ov.read > (rt.carryW.book || 0);
      palmR.getWorldPosition(tmpA); if (reading) { palmL.getWorldPosition(tmpB); tmpA.add(tmpB).multiplyScalar(0.5); }
      tmpA.y += name === 'sip' ? 0.03 : 0.035;
      o.position.lerpVectors(rp, tmpA, e);
      tmpQ.setFromEuler(rr);
      if (e > 0.001) { o.lookAt(name === 'sip' ? tmpB.set(o.position.x, o.position.y, o.position.z + 1) : headPos); tmpQ2.copy(o.quaternion); o.quaternion.copy(tmpQ).slerp(tmpQ2, e); } else o.quaternion.copy(tmpQ);
    }
  }

  // camera: zoom 0 frames her face (the eye line is the centre of "puppet space", see avatar.js); zoom 1 swings round to
  // the side and pulls back to show all of her. Zoom only applies in the enlarged view.
  const eye = new THREE.Vector3(); head.getWorldPosition(eye);
  if (vrm.lookAt && vrm.lookAt.offsetFromHeadBone) eye.add(vrm.lookAt.offsetFromHeadBone.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()))); else eye.y += 0.07;
  const eyeUp = eye.y - wp('head').y;
  const near = new THREE.Vector3(0, eye.y - 0.035, eye.z), far = new THREE.Vector3(0, (eye.y + floorY) / 2 + 0.05, (hip.z + feet.z) / 2);
  let zoomWant = Number(localStorage.getItem('brenai.zoom')) || 0, zoom = 0, camYaw = 0;
  const aim = new THREE.Vector3();
  function placeCamera(dt) {
    const want = Math.max(document.body.classList.contains('big') ? zoomWant : 0, gestureZoom, rt.zoom);
    zoom += (want - zoom) * Math.min(1, dt * 6);
    const e = zoom * zoom * (3 - 2 * zoom); camYaw = 0.95 * Math.min(1, e * 2.4); const up = rt.k || 0; // on her feet: pull back, lift and follow her so she stays in view
    const lift = 0.14 * e + 0.3 * Math.sin(Math.PI * e), dist = 0.78 + 2.7 * e + 1.7 * e * up;
    aim.lerpVectors(near, far, e); aim.y += 0.32 * e * up; aim.x += rt.x * 0.55 * e * up; aim.z += (rt.z - far.z) * 0.4 * e * up;
    camera.position.set(aim.x + dist * Math.sin(camYaw) * Math.cos(lift), aim.y + dist * Math.sin(lift), aim.z + dist * Math.cos(camYaw) * Math.cos(lift));
    camera.lookAt(aim);
  }
  placeCamera(1);
  const target = new THREE.Object3D(); scene.add(target); if (vrm.lookAt) vrm.lookAt.target = target;

  const em = vrm.expressionManager, has = n => em && em.getExpression(n);
  const w = {}; for (const n of NAMES) w[n] = 0;
  let size = '', thumbCb = null;
  const v3 = new THREE.Vector3();
  const project = (x, y, z) => { const r = renderer.domElement.getBoundingClientRect(); v3.set(x, y, z).project(camera); return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height }; };
  const UNIT = 0.0027; // metres per puppet-space unit (her face is about 80 units tall there)

  return {
    el,
    thumb(cb) { thumbCb = cb; },
    // her routine: what she is doing now (for the chat), and a way to tell her to do something
    activity() { return rt.act === 'up' || rt.act === 'sitdown' ? rt.label : (DOING[rt.act] || ''); },
    doActivity(name) { startActivity(name); },
    // a tap that missed her: what in the room it landed on, and sending her to it
    pick, direct,
    // wheel or pinch in the enlarged view: positive pulls back toward the whole-body view
    zoom(d) { if (!document.body.classList.contains('big')) return false; zoomWant = Math.max(0, Math.min(1, zoomWant + d)); localStorage.setItem('brenai.zoom', zoomWant.toFixed(2)); return true; },
    locate(e) { // screen -> puppet space, measured from her eye line
      const c = project(eye.x, eye.y, eye.z), up = project(eye.x, eye.y + 0.1, eye.z), k = (c.y - up.y) / 0.1 || 1;
      return { x: 100 + (e.clientX - c.x) / k / UNIT, y: 100 + (e.clientY - c.y) / k / UNIT };
    },
    draw(s) {
      const W = el.clientWidth, H = el.clientHeight, key = W + 'x' + H;
      if (key !== size && W && H) { size = key; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
      routine(s);                               // where she is and what she is holding
      applyGesture(s.gesture, s.faceName, s.dt); // body first: a gesture can also ask for a face (a yawn opens her mouth)
      // expressions ease toward the face the controller picked; blinking and talking are immediate
      const want = EXPR[s.faceName] || {};
      for (const n of NAMES) { const t = want[n] || 0; w[n] += (t - w[n]) * Math.min(1, s.dt * 12); }
      const blink = s.blink ? 1 : w.blink, loud = s.voice, aa = !s.talking ? 0 : loud != null ? Math.min(1, loud * 1.15) : (s.phase === 1 ? 0.75 : s.phase === 2 ? 0.2 : 0.05), oh = !s.talking ? 0 : loud != null ? (loud > 0.25 && s.phase === 2 ? 0.3 : 0) : (s.phase === 2 ? 0.5 : 0);
      const gf = gx.face || {}, mix = (n, v) => Math.max(v, (gf[n] || 0) * gx.k);
      if (em) { for (const n of ['happy', 'angry', 'sad', 'relaxed', 'surprised']) if (has(n)) em.setValue(n, mix(n, w[n])); if (has('blink')) em.setValue('blink', mix('blink', blink)); if (has('aa')) em.setValue('aa', mix('aa', aa)); if (has('oh')) em.setValue('oh', oh); }
      placeCamera(s.dt);
      // she looks at the camera (that is you), nudged by the same gaze as the cartoon (-3..3); the head follows a little,
      // turns toward you when you are off to the side, and takes the springs from touches
      if (rt.gazeProp) target.position.copy(rt.gazeProp.position); else { target.position.copy(camera.position); target.position.x += s.look.x * 0.22; target.position.y -= s.look.y * 0.16; }
      const facing = rt.stand > 0.5 ? 0 : camYaw * 0.55; // seated she turns her head to you; on her feet her whole body does
      const roll = -s.rot * Math.PI / 180 * 1.6, yaw = s.tx * 0.045 + (rt.gazeProp ? 0 : s.look.x * 0.045 + facing) + rt.head[1], pitch = s.ty * 0.03 + (rt.gazeProp ? 0 : s.look.y * 0.03) + (1 - s.sq) * 1.5 + rt.head[0];
      if (head) head.rotation.set(base.head[0] + pitch * 0.6 + gx.head[0] + body[1], yaw * 0.6 + gx.head[1] + body[2], roll * 0.6 + gx.head[2] + body[3]);
      if (neck) neck.rotation.set(CUR.neck[0] + pitch * 0.4, yaw * 0.4, roll * 0.4);
      if (chest) chest.rotation.set(base.chest[0] + body[0] + s.breathe * 0.012, yaw * 0.3, roll * 0.3);
      // shoulders ride up with tension (unless a gesture is using them), hips bounce
      if (!touchedBones.includes('leftShoulder')) { set('leftShoulder', 0, 0, body[4] + s.breathe * 0.01); set('rightShoulder', 0, 0, -body[4] - s.breathe * 0.01); }
      if (hipsNode) hipsNode.position.y = hipY0 + gx.hipY;
      vrm.update(s.dt); // spring bones: hair and clothes swing with the head
      placeProps(); lampTick(s.dt);
      // the close camera stays on her face wherever she goes
      head.getWorldPosition(tmpA); tmpA.y += eyeUp; eye.lerp(tmpA, Math.min(1, s.dt * 8)); near.set(eye.x, eye.y - 0.035, eye.z);
      renderer.render(scene, camera);
      if (thumbCb && zoom < 0.03 && rt.act === 'sit' && rt.stand < 0.01 && !s.gesture && !s.blink) { const cb = thumbCb; thumbCb = null; try { cb(renderer.domElement.toDataURL('image/webp', 0.85)); } catch {} } // straight after a draw, while the picture is still in the canvas
    },
    dispose() { clearInterval(dayTimer); el.remove(); try { VRMUtils.deepDispose(vrm.scene); renderer.dispose(); renderer.forceContextLoss(); } catch {} },
  };
}
