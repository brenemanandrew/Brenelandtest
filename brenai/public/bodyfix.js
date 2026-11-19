// Her body has substance: an arm cannot sink into her chest or her thigh, and her legs cannot pass through each other.
// After a pose is on her bones (by the game, a clip or the motion capture page) and before the model is updated, call
//   fix(strength)   strength 0..1
// It looks where her elbows, forearms and wrists are; if one is inside her torso, head or a thigh it turns the upper arm (for an
// elbow) or the forearm (for a wrist) just far enough to bring it back to the surface. Knees and ankles are kept off the other
// leg the same way. It is a push-out, not full inverse kinematics: nothing is pulled toward a target.
export function bodyFix(THREE, vrm) {
  const B = n => vrm.humanoid.getNormalizedBoneNode(n), root = B('hips') && B('hips').parent, V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const need = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
  if (!root || need.some(n => !B(n))) return () => 0;
  const chest = B('upperChest') || B('chest') || B('spine'), a = V(), b = V(), c = V(), d = V(), pq = Q(), q = Q(), wq = Q();
  const pos = (n, out) => (typeof n === 'string' ? B(n) : n).getWorldPosition(out);
  // the solid parts of her, as balls: [centre, radius]. Rebuilt every call from where her bones are.
  function solids(skipLeg) {
    const out = [], ball = (p, r) => out.push([p.clone(), r]), mix = (n1, n2, t, r) => { pos(n1, a); pos(n2, b); ball(a.lerp(b, t), r); };
    pos('hips', a); ball(a, 0.135); pos('spine', a); ball(a, 0.125); pos(chest, a); ball(a, 0.14); a.y += 0.11; ball(a, 0.115); pos('head', a); a.y += 0.07; ball(a, 0.105);
    for (const s of ['left', 'right']) if (s !== skipLeg) { mix(s + 'UpperLeg', s + 'LowerLeg', 0.3, 0.085); mix(s + 'UpperLeg', s + 'LowerLeg', 0.7, 0.075); }
    return out;
  }
  // bring `probe` (a point that hangs off `bone`, turning about `pivot`) out of the balls by turning the bone
  function push(bone, pivot, probe, r, balls, k) {
    let moved = 0; pos(pivot, c);
    for (const [centre, R] of balls) { pos(probe, a); const dist = a.distanceTo(centre), over = R + r - dist; if (over <= 0.001) continue;
      b.copy(a).sub(centre); if (b.lengthSq() < 1e-8) b.set(0, 0, 1); b.normalize().multiplyScalar(over * k); d.copy(a).sub(c); const from = d.clone().normalize(), to = d.add(b).normalize(); if (from.distanceToSquared(to) < 1e-10) continue;
      q.setFromUnitVectors(from, to); bone.parent.getWorldQuaternion(pq); wq.copy(pq).invert().multiply(q).multiply(pq); bone.quaternion.premultiply(wq); bone.updateWorldMatrix(false, true); moved += over; }
    return moved;
  }
  return function fix(strength = 1) {
    if (strength <= 0.01) return 0; root.updateWorldMatrix(true, true); let moved = 0; const body = solids();
    for (let pass = 0; pass < 2; pass++) for (const s of ['left', 'right']) {
      moved += push(B(s + 'UpperArm'), s + 'UpperArm', s + 'LowerArm', 0.045, body, strength);            // the elbow, by the upper arm
      moved += push(B(s + 'LowerArm'), s + 'LowerArm', s + 'Hand', 0.04, body, strength);                 // the wrist, by the forearm
    }
    for (const s of ['left', 'right']) { const other = s === 'left' ? 'right' : 'left', legs = []; pos(other + 'LowerLeg', a); legs.push([a.clone(), 0.06]); pos(other + 'Foot', a); legs.push([a.clone(), 0.055]); pos(other + 'UpperLeg', a); pos(other + 'LowerLeg', b); legs.push([a.lerp(b, 0.6).clone(), 0.07]);
      moved += push(B(s + 'UpperLeg'), s + 'UpperLeg', s + 'LowerLeg', 0.06, legs, strength * 0.5); moved += push(B(s + 'LowerLeg'), s + 'LowerLeg', s + 'Foot', 0.05, legs, strength * 0.5); }   // each leg gives half the way
    return moved;
  };
}
