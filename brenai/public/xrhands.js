// Glowing hands for the headset view (WebXR), drawn instead of rays and dots.
// Tracked hands (the Quest's hand tracking): the joints the headset reports, drawn as one smooth hand with a glowing edge.
// Controllers: a glowing hand sits on each controller, open, with the fingers curling as the trigger (index) and the grip (the rest)
// are squeezed. Each frame update() also says where each hand can grab from (between thumb and index tip, or the palm of a held
// controller), how it is turned, and how hard it is squeezing.
//   const hands = xrHands(THREE, scene)
//   hands.update(frame, refSpace, rigMatrix, inputSources)  ->  [{ src, side, kind: 'hand' | 'controller', at, q, pinch, squeeze, buttons, axes, tip, wrist }]
//   hands.hide()
export function xrHands(THREE, scene) {
  const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
  const PARTS = { thumb: ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'], other: ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'] };
  // The look: a smooth, see-through hand whose edges glow. Every finger bone is a fat rounded piece and the pieces overlap into one
  // hand shape. Each piece is drawn twice: first only into the depth buffer, so pieces behind others are hidden, then with a rim
  // shader that is bright where the surface turns away from you (the outline) and faint where it faces you. No bones, no joint dots.
  const rim = (c, fill) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, blending: THREE.AdditiveBlending, uniforms: { rimC: { value: new THREE.Color(c) }, fillC: { value: new THREE.Color(fill) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 rimC; uniform vec3 fillC; varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6); gl_FragColor = vec4(mix(fillC, rimC, f) * (0.16 + 1.25 * f), 1.0); }' });
  const RIM = rim('#b8f4ff', '#2f9fd0'), HOT = rim('#ffe2a0', '#d08a2a'), DEPTH = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
  const seg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), ball = new THREE.SphereGeometry(1, 14, 10), up = new THREE.Vector3(0, 1, 0);
  function makeHand() { const g = new THREE.Group(); g.parts = []; scene.add(g); g.visible = false; return g; }
  function piece(g, k, geo) { let p = g.parts[k]; if (!p) { const d = new THREE.Mesh(geo, DEPTH), m = new THREE.Mesh(geo, RIM); d.renderOrder = 995; m.renderOrder = 996; g.add(d, m); p = g.parts[k] = { d, m }; } if (p.d.geometry !== geo) { p.d.geometry = geo; p.m.geometry = geo; } p.d.visible = p.m.visible = true; return p; }
  // chains: one list of points per finger (thumb first), from the wrist end. kn = which point of a finger is its knuckle. The palm is one
  // flattened rounded shape from the wrist end to the four knuckles; the fingers start at the knuckles; the thumb is drawn whole.
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pF = new THREE.Vector3(), pS = new THREE.Vector3(), pN = new THREE.Vector3(), pM = new THREE.Matrix4();
  function lay(g, chains, r, hot, kn) { let k = 0; const mat = hot ? HOT : RIM, put = (geo, fn) => { const pc = piece(g, k++, geo); for (const o of [pc.d, pc.m]) fn(o); pc.m.material = mat; };
    pA.set(0, 0, 0); pB.set(0, 0, 0); for (let c = 1; c < 5; c++) { pA.add(chains[c][0]); pB.add(chains[c][kn]); } pA.multiplyScalar(0.25); pB.multiplyScalar(0.25);
    pF.copy(pB).sub(pA); const fl = pF.length() || 0.08; pF.multiplyScalar(1 / fl); pS.copy(chains[1][kn]).sub(chains[4][kn]); const sw = pS.length() || 0.06; pS.addScaledVector(pF, -pS.dot(pF)).normalize(); pN.crossVectors(pF, pS).normalize();
    put(ball, o => { pM.makeBasis(pS, pN, pF); o.quaternion.setFromRotationMatrix(pM); o.position.copy(pA).add(pB).multiplyScalar(0.5); o.scale.set(sw * 0.5 + r * 2.1, r * 2.3, fl * 0.5 + r * 1.9); });
    for (let c = 0; c < chains.length; c++) { const pts = chains[c], thumb = c === 0, from = thumb ? 0 : kn;
      for (let i = from; i < pts.length; i++) { const p = pts[i], rr = r * (thumb ? 1.5 : 1.35) * (1 - 0.05 * (i - from));
        put(ball, o => { o.position.copy(p); o.quaternion.identity(); o.scale.setScalar(rr); });
        if (i === from) continue; const a = pts[i - 1], len = a.distanceTo(p); if (len < 1e-4) continue;
        put(seg, o => { o.position.copy(a).add(p).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(up, tmp.copy(p).sub(a).normalize()); o.scale.set(rr, len, rr); }); } }
    for (; k < g.parts.length; k++) g.parts[k].d.visible = g.parts[k].m.visible = false; g.visible = true; }
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
        lay(g, chains, 0.0055, pinch > 0.5, 2); out.push({ src, side, kind: 'hand', at, q: wq, pinch, squeeze: pinch, buttons, axes, tip: tips['index-finger'] || at, wrist: W.clone() });
      } else if (src.gripSpace) {   /* a controller: the hand drawn on it */
        const pose = xf.getPose(src.gripSpace, ref); if (!pose) { g.visible = false; continue; } M.fromArray(pose.transform.matrix).premultiply(rigM);
        const trig = buttons[0] || 0, grip = buttons[1] || 0, chains = controllerHand(side, trig, grip).map(pts => pts.map(p => p.applyMatrix4(M)));
        const at = V().set(0, 0.005, -0.02).applyMatrix4(M), q = new THREE.Quaternion().setFromRotationMatrix(M);
        lay(g, chains, 0.0062, Math.max(trig, grip) > 0.5, 1); out.push({ src, side, kind: 'controller', at, q, pinch: trig, squeeze: grip, buttons, axes, tip: chains[1][chains[1].length - 1], wrist: V().set(0, -0.005, 0.085).applyMatrix4(M) });
      } else g.visible = false; }
    for (const [src, g] of drawn) if (!live.has(src)) { g.visible = false; scene.remove(g); drawn.delete(src); }
    return out; }
  function hide() { for (const g of drawn.values()) g.visible = false; }
  return { update, hide };
}
