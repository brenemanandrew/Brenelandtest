// Glowing hands for the headset view (WebXR), drawn instead of rays and dots.
// Tracked hands (the Quest's hand tracking): every joint the headset reports, joined into a glowing outline of your real hand.
// Controllers: a glowing hand sits on each controller, open, with the fingers curling as the trigger (index) and the grip (the rest)
// are squeezed. Each frame update() also says where each hand can grab from (between thumb and index tip, or the palm of a held
// controller), how it is turned, and how hard it is squeezing.
//   const hands = xrHands(THREE, scene)
//   hands.update(frame, refSpace, rigMatrix, inputSources)  ->  [{ src, side, kind: 'hand' | 'controller', at, q, pinch, squeeze, buttons, axes, tip, wrist }]
//   hands.hide()
export function xrHands(THREE, scene) {
  const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
  const PARTS = { thumb: ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'], other: ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'] };
  const CORE = new THREE.MeshBasicMaterial({ color: '#c9f7ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const HALO = new THREE.MeshBasicMaterial({ color: '#4fd8ff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
  const HOT = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const seg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), ball = new THREE.SphereGeometry(1, 10, 8), up = new THREE.Vector3(0, 1, 0);
  // one drawn hand: a set of segments (core and halo) and joint balls, laid out from a list of points each frame
  function makeHand() { const g = new THREE.Group(); g.renderOrder = 996; g.segs = []; g.balls = []; scene.add(g); g.visible = false; return g; }
  function lay(g, chains, r, hot) {
    let si = 0, bi = 0;
    for (const pts of chains) for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; let b = g.balls[bi]; if (!b) { b = new THREE.Mesh(ball, CORE); b.renderOrder = 997; g.add(b); g.balls.push(b); } b.visible = true; b.position.copy(p); b.scale.setScalar(r * (i === pts.length - 1 ? 1.15 : 0.95)); b.material = hot && i === pts.length - 1 ? HOT : CORE; bi++;
      if (i === 0) continue; const a = pts[i - 1], len = a.distanceTo(p); if (len < 1e-4) continue;
      for (const [mat, k] of [[CORE, 0.55], [HALO, 1.9]]) { let s = g.segs[si]; if (!s) { s = new THREE.Mesh(seg, mat); s.renderOrder = 996; g.add(s); g.segs.push(s); } s.material = mat; s.visible = true; s.position.copy(a).add(p).multiplyScalar(0.5); s.quaternion.setFromUnitVectors(up, tmp.copy(p).sub(a).normalize()); s.scale.set(r * k, len, r * k); si++; } }
    for (let k = si; k < g.segs.length; k++) g.segs[k].visible = false; for (let k = bi; k < g.balls.length; k++) g.balls[k].visible = false; g.visible = true; }
  const tmp = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = () => new THREE.Vector3();
  // the open hand held on a controller, in the controller's grip space: fingers forward along -Z, palm facing inward (toward the other
  // hand), thumb up. Each finger bends about its own knuckles as the trigger or grip is squeezed.
  const BASE = { thumb: [[0.025, 0.0, 0.035], [0.035, 0.022, 0.005], [0.03, 0.035, -0.02], [0.022, 0.042, -0.04]],
    'index-finger': [[0.02, 0.0, 0.045], [0.022, 0.01, -0.03], [0.022, 0.012, -0.07], [0.022, 0.012, -0.095], [0.022, 0.011, -0.115]],
    'middle-finger': [[0.0, 0.0, 0.045], [0.003, 0.012, -0.035], [0.003, 0.012, -0.078], [0.003, 0.012, -0.105], [0.003, 0.011, -0.125]],
    'ring-finger': [[-0.018, 0.0, 0.045], [-0.016, 0.01, -0.03], [-0.016, 0.01, -0.07], [-0.016, 0.01, -0.095], [-0.016, 0.009, -0.113]],
    'pinky-finger': [[-0.034, -0.004, 0.045], [-0.032, 0.004, -0.022], [-0.032, 0.004, -0.052], [-0.032, 0.004, -0.072], [-0.032, 0.003, -0.088]] };
  function controllerHand(side, trig, grip) { const mx = side === 'left' ? -1 : 1, out = [];
    for (const f of FINGERS) { const pts = BASE[f].map(([x, y, z]) => new THREE.Vector3(x * mx, y, z)), curl = f === 'index-finger' ? trig : f === 'thumb' ? Math.max(trig, grip) * 0.6 : grip;
      for (let i = 1; i < pts.length - 1; i++) { const pivot = pts[i].clone(), ang = curl * (f === 'thumb' ? 0.7 : 1.25); const axis = f === 'thumb' ? new THREE.Vector3(0, 0, 1).multiplyScalar(-mx) : new THREE.Vector3(1, 0, 0); const q = new THREE.Quaternion().setFromAxisAngle(axis, -ang * (f === 'thumb' ? 1 : 1));   /* each knuckle bends the rest of the finger down, toward the palm */
        for (let j = i + 1; j < pts.length; j++) pts[j].sub(pivot).applyQuaternion(q).add(pivot); }
      out.push(pts); } return out; }
  const drawn = new Map();
  function update(xf, ref, rigM, sources) { const live = new Set(), out = [];
    for (const src of sources || []) { let g = drawn.get(src); if (!g) { g = makeHand(); drawn.set(src, g); } live.add(src);
      const side = src.handedness || 'none', gp = src.gamepad, buttons = gp ? [...gp.buttons].map(b => b.value || (b.pressed ? 1 : 0)) : [], axes = gp ? [...gp.axes] : [];
      if (src.hand) {   /* tracked hand: the real joints */
        const chains = [], wrist = xf.getJointPose && xf.getJointPose(src.hand.get('wrist'), ref); if (!wrist) { g.visible = false; continue; }
        const W = V().setFromMatrixPosition(M.fromArray(wrist.transform.matrix).premultiply(rigM)), wq = new THREE.Quaternion().setFromRotationMatrix(M);
        const tips = {};
        for (const f of FINGERS) { const pts = [W.clone()]; for (const part of f === 'thumb' ? PARTS.thumb : PARTS.other) { const j = src.hand.get(f + '-' + part), jp = j && xf.getJointPose(j, ref); if (jp) pts.push(V().setFromMatrixPosition(M.fromArray(jp.transform.matrix).premultiply(rigM))); } chains.push(pts); tips[f] = pts[pts.length - 1]; }
        const pinchD = tips.thumb && tips['index-finger'] ? tips.thumb.distanceTo(tips['index-finger']) : 1, pinch = Math.max(0, Math.min(1, (0.045 - pinchD) / 0.03));
        const at = tips.thumb && tips['index-finger'] ? tips.thumb.clone().add(tips['index-finger']).multiplyScalar(0.5) : W.clone();
        lay(g, chains, 0.0055, pinch > 0.5); out.push({ src, side, kind: 'hand', at, q: wq, pinch, squeeze: pinch, buttons, axes, tip: tips['index-finger'] || at, wrist: W.clone() });
      } else if (src.gripSpace) {   /* a controller: the hand drawn on it */
        const pose = xf.getPose(src.gripSpace, ref); if (!pose) { g.visible = false; continue; } M.fromArray(pose.transform.matrix).premultiply(rigM);
        const trig = buttons[0] || 0, grip = buttons[1] || 0, chains = controllerHand(side, trig, grip).map(pts => pts.map(p => p.applyMatrix4(M)));
        const at = V().set(0, 0.005, -0.02).applyMatrix4(M), q = new THREE.Quaternion().setFromRotationMatrix(M);
        lay(g, chains, 0.0065, Math.max(trig, grip) > 0.5); out.push({ src, side, kind: 'controller', at, q, pinch: trig, squeeze: grip, buttons, axes, tip: chains[1][chains[1].length - 1], wrist: V().set(0, -0.005, 0.085).applyMatrix4(M) });
      } else g.visible = false; }
    for (const [src, g] of drawn) if (!live.has(src)) { g.visible = false; scene.remove(g); drawn.delete(src); }
    return out; }
  function hide() { for (const g of drawn.values()) g.visible = false; }
  return { update, hide };
}
