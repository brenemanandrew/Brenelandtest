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
  el.style.cssText = 'width:100%;height:100%;background:radial-gradient(circle at 50% 40%, #3a2a4a, #140f1c 75%)';
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
  for (const n in POSE) set(n, ...POSE[n]);
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
    const want = document.body.classList.contains('big') ? zoomWant : 0;
    zoom += (want - zoom) * Math.min(1, dt * 6);
    const e = zoom * zoom * (3 - 2 * zoom); camYaw = 0.95 * e; const lift = 0.14 * e, dist = 0.78 + 2.7 * e;
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
      // expressions ease toward the face the controller picked; blinking and talking are immediate
      const want = EXPR[s.faceName] || {};
      for (const n of NAMES) { const t = want[n] || 0; w[n] += (t - w[n]) * Math.min(1, s.dt * 12); }
      const blink = s.blink ? 1 : w.blink, aa = s.talking ? (s.phase === 1 ? 0.75 : s.phase === 2 ? 0.2 : 0.05) : 0, oh = s.talking && s.phase === 2 ? 0.5 : 0;
      if (em) { for (const n of ['happy', 'angry', 'sad', 'relaxed', 'surprised']) if (has(n)) em.setValue(n, w[n]); if (has('blink')) em.setValue('blink', blink); if (has('aa')) em.setValue('aa', aa); if (has('oh')) em.setValue('oh', oh); }
      // eyes follow the same gaze as the cartoon (-3..3); the head follows a little, plus the springs from touches
      placeCamera(s.dt);
      // she looks at the camera (that is you), nudged by the same gaze as the cartoon (-3..3); the head follows a little,
      // turns toward you when you are off to the side, and takes the springs from touches
      target.position.copy(camera.position); target.position.x += s.look.x * 0.22; target.position.y -= s.look.y * 0.16;
      const roll = -s.rot * Math.PI / 180 * 1.6, yaw = s.tx * 0.045 + s.look.x * 0.045 + camYaw * 0.55, pitch = s.ty * 0.03 + s.look.y * 0.03 + (1 - s.sq) * 1.5;
      if (head) head.rotation.set(base.head[0] + pitch * 0.6, yaw * 0.6, roll * 0.6);
      if (neck) neck.rotation.set(base.neck[0] + pitch * 0.4, yaw * 0.4, roll * 0.4);
      if (chest) chest.rotation.set(base.chest[0] + s.breathe * 0.012, yaw * 0.15, roll * 0.15);
      vrm.update(s.dt); // spring bones: hair and clothes swing with the head
      renderer.render(scene, camera);
    },
    dispose() { el.remove(); try { VRMUtils.deepDispose(vrm.scene); renderer.dispose(); renderer.forceContextLoss(); } catch {} },
  };
}
