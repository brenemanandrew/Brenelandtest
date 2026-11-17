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
  const head = B('head'), neck = B('neck'), chest = B('upperChest') || B('chest') || B('spine');
  // out of the T-pose: arms down by her sides
  const armL = B('leftUpperArm'), armR = B('rightUpperArm'); if (armL) armL.rotation.z = -1.25; if (armR) armR.rotation.z = 1.25;
  const foreL = B('leftLowerArm'), foreR = B('rightLowerArm'); if (foreL) foreL.rotation.z = -0.12; if (foreR) foreR.rotation.z = 0.12;
  vrm.update(0);

  // frame the head and shoulders; the eye line is the centre of "puppet space" (see avatar.js)
  const eye = new THREE.Vector3(); head.getWorldPosition(eye);
  if (vrm.lookAt && vrm.lookAt.offsetFromHeadBone) eye.add(vrm.lookAt.offsetFromHeadBone); else eye.y += 0.07;
  camera.position.set(0, eye.y - 0.035, eye.z + 0.78); camera.lookAt(0, eye.y - 0.035, eye.z);
  const target = new THREE.Object3D(); scene.add(target); if (vrm.lookAt) vrm.lookAt.target = target;

  const em = vrm.expressionManager, has = n => em && em.getExpression(n);
  const w = {}; for (const n of NAMES) w[n] = 0;
  let size = '';
  const v3 = new THREE.Vector3();
  const project = (x, y, z) => { const r = renderer.domElement.getBoundingClientRect(); v3.set(x, y, z).project(camera); return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height }; };
  const UNIT = 0.0027; // metres per puppet-space unit (her face is about 80 units tall there)

  return {
    el,
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
      target.position.set(s.look.x * 0.22, eye.y - s.look.y * 0.16, eye.z + 0.8);
      const roll = -s.rot * Math.PI / 180 * 1.6, yaw = s.tx * 0.045 + s.look.x * 0.045, pitch = s.ty * 0.03 + s.look.y * 0.03 + (1 - s.sq) * 1.5;
      if (head) head.rotation.set(pitch * 0.6, yaw * 0.6, roll * 0.6);
      if (neck) neck.rotation.set(pitch * 0.4, yaw * 0.4, roll * 0.4);
      if (chest) chest.rotation.set(s.breathe * 0.012, yaw * 0.15, roll * 0.15);
      vrm.update(s.dt); // spring bones: hair and clothes swing with the head
      renderer.render(scene, camera);
    },
    dispose() { el.remove(); try { VRMUtils.deepDispose(vrm.scene); renderer.dispose(); renderer.forceContextLoss(); } catch {} },
  };
}
