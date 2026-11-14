// Things a posed person can hold (pose-editor). The game's own (human.js setHeld: the fishing rod, a fish, a dog treat, a game box)
// and a few small ones built here in the same chunky style for storyboards: a book, a phone, a mug, the pizza tray, a slice, a
// lantern. Built on the hand's anchor (the hollow of the grip, human.js gripAt): the fingers close round it (userData.grip), or the
// hand takes a named shape (userData.hand); `upright` keeps it level whatever the arm does (human.js turns it back).
import * as THREE from 'three';
import { Part, cylGeo, boxGeo, torusGeo } from '../../bodies-geo.js';

export const HELD = [
  ['', 'Nothing'], ['book', 'A book'], ['phone', 'A phone'], ['mug', 'A mug'], ['tray', 'The pizza tray'], ['slice', 'A slice'],
  ['rod', 'A fishing rod'], ['fish', 'A fish'], ['gamebox', 'A game box'], ['treat', 'A dog treat'], ['lantern', 'A lantern'],
];

export function buildHeld(kind) {
  const p = new Part(), box = boxGeo();
  let g = null;
  if (kind === 'book') {
    p.add(box, '#7a2f3a', { sx: 0.05, sy: 0.22, sz: 0.16, y: -0.02, z: 0.05 });
    p.add(box, '#f3efe6', { sx: 0.04, sy: 0.205, sz: 0.15, x: 0.004, y: -0.02, z: 0.056 });
    p.add(box, '#e3b04a', { sx: 0.052, sy: 0.03, sz: 0.09, y: 0.02, z: 0.05 });
    g = p.build(); g.userData.grip = 0.45;
  } else if (kind === 'phone') {
    p.add(box, '#26262d', { sx: 0.014, sy: 0.15, sz: 0.075, y: -0.01, z: 0.03 });
    p.add(box, '#7fb6e8', { sx: 0.004, sy: 0.13, sz: 0.064, x: -0.008, y: -0.01, z: 0.03, opts: { emissive: '#5a8fc8' } });
    g = p.build(); g.userData.grip = 0.5;
  } else if (kind === 'mug') {
    p.add(cylGeo(0.045, 0.042, 0.1, 14), '#f2ede2', { y: 0.02, z: 0.07 });
    p.add(cylGeo(0.038, 0.038, 0.004, 14), '#5a3626', { y: 0.068, z: 0.07 });
    p.add(torusGeo(0.028, 0.008, Math.PI * 2, 6, 12), '#f2ede2', { y: 0.02, z: 0.018, ry: Math.PI / 2 });
    g = p.build(); g.userData.grip = 0.7; g.userData.upright = true;
  } else if (kind === 'tray' || kind === 'slice') {
    const big = kind === 'tray', r = big ? 0.2 : 0.11;
    if (big) p.add(cylGeo(0.22, 0.22, 0.012, 20), '#b9bcc2', { y: 0.0 });
    // the pizza: a disc (the tray's) or a wedge (the slice), cheese, a few pepperoni
    if (big) { p.add(cylGeo(r, r, 0.022, 20), '#e8b45a', { y: 0.016 }); p.add(cylGeo(r - 0.02, r - 0.02, 0.026, 20), '#f2d06a', { y: 0.018 }); }
    else { p.add(cylGeo(r, r, 0.016, 3, false), '#f2d06a', { y: 0.0, sx: 1, sz: 0.55, x: 0.04 }); p.add(box, '#d99a4a', { sx: 0.025, sy: 0.022, sz: 0.12, x: -0.06 }); }
    const pep = big ? [[0.08, 0.05], [-0.06, 0.09], [-0.1, -0.05], [0.04, -0.1], [0.11, -0.04], [-0.02, 0.0]] : [[0.05, 0.0], [0.09, 0.01]];
    for (const [x, z] of pep) p.add(cylGeo(0.022, 0.022, 0.006, 10), '#b8322a', { x, y: big ? 0.033 : 0.011, z });
    g = new THREE.Group(); const m = p.build(); m.position.set(big ? -0.02 : 0, big ? 0.05 : 0.0, big ? 0.06 : 0.07); g.add(m);
    g.userData.grip = big ? 0.15 : 0.45; if (big) { g.userData.hand = 'open'; g.userData.upright = true; }
  } else if (kind === 'lantern') {
    p.add(box, '#3a3226', { sx: 0.16, sy: 0.03, sz: 0.16, y: -0.1 });
    p.add(box, '#ffd27a', { sx: 0.12, sy: 0.16, sz: 0.12, y: -0.2, opts: { emissive: '#ffd27a' } });
    p.add(box, '#3a3226', { sx: 0.16, sy: 0.03, sz: 0.16, y: -0.3 });
    p.rod([0, -0.09, 0], [0, 0.02, 0], 0.008, '#3a3226');
    g = p.build({ cast: false }); g.userData.grip = 0.95; g.userData.upright = 'hang';
  }
  if (g) { g.name = 'pose-held-' + kind; g.traverse(m => { if (m.isMesh) m.castShadow = true; }); }
  return g;
}
