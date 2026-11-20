const T = (file, wear, shot) => ({ file, lvl: 3, wear, theme: 'selfie', desc: 'x', where: 'home', shot });
const WINK = { blinkLeft: 1, happy: 0.35 }, KISSY = { ou: 0.85, blink: 0.25 }, SMIRK = { happy: 0.3, blinkRight: 0.3 }, SOFT = { relaxed: 0.5, happy: 0.25 };
module.exports = [
  T('v1_peek', 'Daily', { pose: 'peace', view: [0.05, 0.12, 0.5, 0.12], fov: 45, scene: 'dorm', face: 'playful' }),
  T('v2_lean', 'Daily', { pose: 'plain', set: { spine: [0.35, 0, 0], chest: [0.2, 0, 0], head: [-0.45, 0, 0.12] }, view: [0, 0.05, 0.42, 0], roll: 0.2, scene: 'dorm', face: 'playful', faceW: SMIRK }),
  T('v3_dutchwink', 'Daily', { pose: 'plain', view: [0.08, 0.1, 0.48, 0], roll: -0.25, scene: 'dorm', face: 'playful', faceW: WINK, tongue: [0.8, -0.3, 0.3] }),
  T('v4_pillow', 'Nightly', { pose: 'plain', set: { rightUpperArm: [0, 0.3, -1.2], rightLowerArm: [0, 1.9, 0], head: [0, 0.2, 0.25] }, view: [0, 0.05, 0.62, -0.05], roll: 0.5, scene: 'custom', bg: 'pillow', face: 'chill', faceW: SOFT, blush: 0.4 }),
  T('v5_lookback', 'Daily', { pose: 'plain', turn: 2.6, cam: 'half', set: { spine: [0, 0.4, 0], chest: [0, 0.4, 0], neck: [0, 0.5, 0], head: [0, 0.7, 0.1] }, scene: 'dorm', face: 'playful', faceW: WINK }),
  T('v6_comehere', 'Daily', { pose: 'plain', set: { rightUpperArm: [0.2, 1.15, 0.25], leftUpperArm: [0.2, -1.15, -0.25], rightLowerArm: [0, 0.2, 0], leftLowerArm: [0, -0.2, 0] }, hide: ['leftHand', 'rightHand'], view: [0, 0.1, 0.6, -0.02], fov: 48, scene: 'dorm', face: 'blush', faceW: KISSY, blush: 0.6 }),
  T('v7_hairhand', 'Daily', { pose: 'plain', set: { rightUpperArm: [0, 0.2, -1.0], rightLowerArm: [0, 2.2, 0], head: [0.05, -0.15, -0.12] }, view: [-0.1, 0.1, 0.8, -0.05], scene: 'dorm', face: 'playful', faceW: WINK }),
  T('v8_closeeyes', 'Daily', { pose: 'plain', hide: ['leftUpperArm', 'rightUpperArm'], view: [0.03, 0.02, 0.36, 0.03], fov: 38, roll: 0.12, scene: 'dorm', face: 'blush', blush: 0.7, faceW: { happy: 0.25 } }),
];
