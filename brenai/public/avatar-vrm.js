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
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI); sun.position.set(0.6, 1, 1.2); scene.add(sun, new THREE.AmbientLight(0xffffff, 0.4));
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
  for (const n in POSE) set(n, ...POSE[n]);
  // ---- gestures: bone targets blended over the resting pose while one plays. t = seconds in, for the moving parts. ----
  // Bone names take absolute rotations. Special keys: _head [pitch, yaw, roll] added to her head, _hipY metres of bounce,
  // _face expression weights. P(n) is the resting rotation of a bone, for "rest plus a bit".
  const P = n => POSE[n] || [0, 0, 0], plus = (n, x = 0, y = 0, z = 0) => [P(n)[0] + x, P(n)[1] + y, P(n)[2] + z];
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
  const REST = n => POSE[n] || [0, 0, 0];
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
    for (const n of touchedBones) set(n, ...REST(n)); touchedBones = []; gestureZoom = 0; gx.head = [0, 0, 0]; gx.hipY = 0; gx.face = null; gx.k = 0;
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
  const box = (w, h, d, x, y, z, c, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.x = rx; scene.add(m); return m; };
  const seatTop = hip.y - 0.1;
  box(0.74, seatTop - floorY - 0.12, 0.72, 0, (seatTop - 0.12 + floorY) / 2, hip.z + 0.06, '#3a2148');           // chair body
  box(0.6, 0.14, 0.62, 0, seatTop - 0.07, hip.z + 0.1, '#5b3570');                                               // seat cushion
  box(0.74, 0.95, 0.16, 0, seatTop + 0.3, hip.z - 0.36, '#4a2a5c', -0.28);                                       // back, tilted
  box(0.13, 0.3, 0.7, -0.38, seatTop + 0.08, hip.z + 0.05, '#4a2a5c'); box(0.13, 0.3, 0.7, 0.38, seatTop + 0.08, hip.z + 0.05, '#4a2a5c'); // arms
  const tableTop = feet.y - 0.1;
  box(0.8, 0.05, 0.5, 0, tableTop - 0.025, feet.z + 0.02, '#3b2a1c');                                            // table top
  for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]]) box(0.05, tableTop - floorY - 0.05, 0.05, x, (tableTop - 0.05 + floorY) / 2, feet.z + 0.02 + z, '#2a1d14');
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), mat('#251a30')); rug.rotation.x = -Math.PI / 2; rug.position.set(0, floorY, (hip.z + feet.z) / 2); scene.add(rug);

  // camera: zoom 0 frames her face (the eye line is the centre of "puppet space", see avatar.js); zoom 1 swings round to
  // the side and pulls back to show all of her. Zoom only applies in the enlarged view.
  const eye = new THREE.Vector3(); head.getWorldPosition(eye);
  if (vrm.lookAt && vrm.lookAt.offsetFromHeadBone) eye.add(vrm.lookAt.offsetFromHeadBone.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()))); else eye.y += 0.07;
  const near = new THREE.Vector3(0, eye.y - 0.035, eye.z), far = new THREE.Vector3(0, (eye.y + floorY) / 2 + 0.05, (hip.z + feet.z) / 2);
  let zoomWant = Number(localStorage.getItem('brenai.zoom')) || 0, zoom = 0, camYaw = 0;
  const aim = new THREE.Vector3();
  function placeCamera(dt) {
    const want = Math.max(document.body.classList.contains('big') ? zoomWant : 0, gestureZoom);
    zoom += (want - zoom) * Math.min(1, dt * 6);
    const e = zoom * zoom * (3 - 2 * zoom); camYaw = 0.95 * Math.min(1, e * 2.4); const lift = 0.14 * e + 0.3 * Math.sin(Math.PI * e), dist = 0.78 + 2.7 * e;
    aim.lerpVectors(near, far, e);
    camera.position.set(aim.x + dist * Math.sin(camYaw) * Math.cos(lift), aim.y + dist * Math.sin(lift), aim.z + dist * Math.cos(camYaw) * Math.cos(lift));
    camera.lookAt(aim);
  }
  placeCamera(1);
  const target = new THREE.Object3D(); scene.add(target); if (vrm.lookAt) vrm.lookAt.target = target;

  const em = vrm.expressionManager, has = n => em && em.getExpression(n);
  const w = {}; for (const n of NAMES) w[n] = 0;
  let size = '';
  const v3 = new THREE.Vector3();
  const project = (x, y, z) => { const r = renderer.domElement.getBoundingClientRect(); v3.set(x, y, z).project(camera); return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height }; };
  const UNIT = 0.0027; // metres per puppet-space unit (her face is about 80 units tall there)

  return {
    el,
    // wheel or pinch in the enlarged view: positive pulls back toward the whole-body view
    zoom(d) { if (!document.body.classList.contains('big')) return false; zoomWant = Math.max(0, Math.min(1, zoomWant + d)); localStorage.setItem('brenai.zoom', zoomWant.toFixed(2)); return true; },
    locate(e) { // screen -> puppet space, measured from her eye line
      const c = project(0, eye.y, eye.z), up = project(0, eye.y + 0.1, eye.z), k = (c.y - up.y) / 0.1 || 1;
      return { x: 100 + (e.clientX - c.x) / k / UNIT, y: 100 + (e.clientY - c.y) / k / UNIT };
    },
    draw(s) {
      const W = el.clientWidth, H = el.clientHeight, key = W + 'x' + H;
      if (key !== size && W && H) { size = key; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
      applyGesture(s.gesture, s.faceName, s.dt); // body first: a gesture can also ask for a face (a yawn opens her mouth)
      // expressions ease toward the face the controller picked; blinking and talking are immediate
      const want = EXPR[s.faceName] || {};
      for (const n of NAMES) { const t = want[n] || 0; w[n] += (t - w[n]) * Math.min(1, s.dt * 12); }
      const blink = s.blink ? 1 : w.blink, aa = s.talking ? (s.phase === 1 ? 0.75 : s.phase === 2 ? 0.2 : 0.05) : 0, oh = s.talking && s.phase === 2 ? 0.5 : 0;
      const gf = gx.face || {}, mix = (n, v) => Math.max(v, (gf[n] || 0) * gx.k);
      if (em) { for (const n of ['happy', 'angry', 'sad', 'relaxed', 'surprised']) if (has(n)) em.setValue(n, mix(n, w[n])); if (has('blink')) em.setValue('blink', mix('blink', blink)); if (has('aa')) em.setValue('aa', mix('aa', aa)); if (has('oh')) em.setValue('oh', oh); }
      placeCamera(s.dt);
      // she looks at the camera (that is you), nudged by the same gaze as the cartoon (-3..3); the head follows a little,
      // turns toward you when you are off to the side, and takes the springs from touches
      target.position.copy(camera.position); target.position.x += s.look.x * 0.22; target.position.y -= s.look.y * 0.16;
      const roll = -s.rot * Math.PI / 180 * 1.6, yaw = s.tx * 0.045 + s.look.x * 0.045 + camYaw * 0.55, pitch = s.ty * 0.03 + s.look.y * 0.03 + (1 - s.sq) * 1.5;
      if (head) head.rotation.set(base.head[0] + pitch * 0.6 + gx.head[0] + body[1], yaw * 0.6 + gx.head[1] + body[2], roll * 0.6 + gx.head[2] + body[3]);
      if (neck) neck.rotation.set(base.neck[0] + pitch * 0.4, yaw * 0.4, roll * 0.4);
      if (chest) chest.rotation.set(base.chest[0] + body[0] + s.breathe * 0.012, yaw * 0.3, roll * 0.3);
      // shoulders ride up with tension (unless a gesture is using them), hips bounce
      if (!touchedBones.includes('leftShoulder')) { set('leftShoulder', 0, 0, body[4] + s.breathe * 0.01); set('rightShoulder', 0, 0, -body[4] - s.breathe * 0.01); }
      if (hipsNode) hipsNode.position.y = hipY0 + gx.hipY;
      vrm.update(s.dt); // spring bones: hair and clothes swing with the head
      renderer.render(scene, camera);
    },
    dispose() { el.remove(); try { VRMUtils.deepDispose(vrm.scene); renderer.dispose(); renderer.forceContextLoss(); } catch {} },
  };
}
