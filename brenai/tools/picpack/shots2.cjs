// trial shots, to tune the poses
const T = (file, wear, shot) => ({ file, lvl: 2, wear, theme: 'selfie', desc: 'x', where: 'home', shot });
module.exports = [
  T('t1_armR', 'Daily', { pose: 'plain', arm: 'R', view: [0.2, 0.26, 0.62, 0.02], scene: 'dorm', face: 'playful' }),
  T('t2_wink_tongue', 'Daily', { pose: 'plain', arm: 'L', view: [-0.2, 0.28, 0.6, 0.02], scene: 'dorm', face: 'playful', faceW: { blinkLeft: 1, happy: 0.3 }, tongue: [0.8, -0.3, 0.3] }),
  T('t3_peace_arm', 'Daily', { pose: 'peace', arm: 'L', view: [-0.12, 0.2, 0.72, -0.02], scene: 'dorm', face: 'happy' }),
  T('t4_kiss', 'Daily', { clip: 'kiss', t: 3.0, cam: 'half', scene: 'dorm', face: 'blush', blush: 0.6 }),
  T('t5_bed', 'Nightly', { pose: 'bed', scene: 'dorm', face: 'playful' }),
  T('t6_hips', 'Daily', { gest: 'hips', cam: 'full', scene: 'dorm', face: 'playful' }),
  T('t7_cheer_nat20', 'DnD Night', { gest: 'cheer', cam: 'half', scene: 'custom', bg: 'nat20', face: 'joy' }),
  T('t8_high', 'Daily', { pose: 'plain', arm: 'R', view: [0.25, 0.5, 0.7, -0.1], scene: 'custom', bg: 'campfire', face: 'happy', light: [1, 0.85, 0.7] }),
];
