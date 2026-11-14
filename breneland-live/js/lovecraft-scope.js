// The study's telescope: what you see through it besides the world. A small sky of its own, drawn only while you look, round the
// eyepiece: a few hundred stars, five constellations of the western sky in faint lines, the moon in its real phase, a bright planet,
// a bird crossing by day, and now and then, on a stormy night when Arkham Horror is on, something faint and odd among the stars.
// Local to you, nothing shared. Cheap: points, lines and three sprites in the normal render, no extra pass. Plain canvas fills only.
import * as THREE from 'three';
import { mulberry32, hash01 } from './util.js';
import { easternDay } from './wreath-data.js';

const R = 600;                       // the dome's radius round the eyepiece (inside the camera's far plane)
// a direction from a yaw (Three.js: forward = (sin, cos)) and an elevation, onto the dome
const dir = (yaw, el, r = R) => [Math.sin(yaw) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(yaw) * Math.cos(el) * r];

// The moon's phase at UTC ms: 0 new, 0.5 full (a mean synodic month from a known new moon, 2000-01-06 18:14 UTC; good to a day).
export function moonPhase(ms) {
  const SYN = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const p = ((ms - ref) / 864e5 / SYN) % 1;
  return p < 0 ? p + 1 : p;
}
// The strange thing's night: a stormy open night, one 20-minute stretch in many (a hash of the Eastern day and the stretch)
export const oddOne = (ms, open) => open && hash01('lc-scope-odd', easternDay(ms), Math.floor(ms / 1.2e6)) < 0.08;

function moonTexture(phase) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = 54, cx = 64, cy = 64;
  g.fillStyle = 'rgba(40, 46, 70, 0.55)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); // the dark side, faintly
  // the lit part: a half disc on the waxing (right) or waning (left) side, plus or minus an ellipse to the terminator
  const waxing = phase < 0.5, k = Math.cos(phase * Math.PI * 2); // 1 new .. -1 full
  g.fillStyle = '#f4efd8';
  g.beginPath();
  g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
  g.ellipse(cx, cy, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing);
  g.fill();
  g.fillStyle = 'rgba(160, 150, 120, 0.35)'; // a few seas
  for (const [x, y, s] of [[52, 50, 9], [74, 60, 7], [60, 80, 10], [80, 42, 5]]) { g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function oddTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(150, 230, 170, 0.9)'; g.lineWidth = 7; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) { // tentacles curling down
    const x0 = 128 + (i - 3) * 16; g.beginPath(); g.moveTo(x0, 120);
    g.bezierCurveTo(x0 + (i - 3) * 14, 170, x0 - (i % 2 ? 24 : -24), 205, x0 + (i - 3) * 10, 246); g.stroke();
  }
  g.fillStyle = 'rgba(120, 210, 150, 0.85)'; g.beginPath(); g.ellipse(128, 92, 62, 46, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255, 245, 160, 1)'; g.beginPath(); g.ellipse(128, 90, 22, 13, 0, 0, Math.PI * 2); g.fill(); // one eye
  g.fillStyle = 'rgba(20, 30, 20, 1)'; g.beginPath(); g.ellipse(128, 90, 5, 12, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// base: the yaw the telescope points (west, out of the study's window), arc: how far it pans either side
export function createScopeSky(scene, { base, arc }) {
  const group = new THREE.Group(); group.name = 'lovecraft-scope-sky'; group.visible = false; scene.add(group);
  const rnd = mulberry32(454);
  // stars: mostly in the arc you can see, a few beyond it
  const N = 520, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const y = base + (rnd() * 2 - 1) * (arc + 0.35), el = 0.05 + Math.pow(rnd(), 0.8) * 1.1, [x, yy, z] = dir(y, el);
    pos.set([x, yy, z], i * 3);
    const b = 0.55 + rnd() * 0.45, warm = rnd();
    col.set([b * (warm < 0.2 ? 1 : 0.85), b * 0.9, b * (warm > 0.8 ? 1 : 0.8)], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const stars = new THREE.Points(sg, starMat); stars.name = 'scope-stars'; stars.frustumCulled = false;
  // five constellations (their shapes, set in the western sky round the arc): the Big Dipper, Cassiopeia, Orion, the Swan, the Lyre
  const SHAPES = [
    { at: [base - 0.5, 0.55], s: 0.11, pts: [[0, 0], [1, 0.1], [2, 0.05], [3, -0.1], [3.4, 0.6], [4.4, 0.7], [4.6, 0.05]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
    { at: [base + 0.35, 0.75], s: 0.1, pts: [[0, 0], [1, -0.7], [2, 0], [3, -0.8], [4, 0.1]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { at: [base + 0.1, 0.22], s: 0.09, pts: [[0, 2], [2, 2.2], [0.8, 1], [1, 0.95], [1.2, 0.9], [0.2, 0], [1.9, -0.1]], lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
    { at: [base - 0.15, 0.95], s: 0.1, pts: [[0, 0], [0, 1], [0, 2], [-1, 1.1], [1, 0.9]], lines: [[0, 1], [1, 2], [3, 1], [1, 4]] },
    { at: [base + 0.6, 0.4], s: 0.07, pts: [[0, 0], [0.5, -0.8], [1.2, -0.7], [0.8, -1.6], [1.5, -1.5]], lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]] },
  ];
  const lp = [], spts = [];
  for (const C of SHAPES) {
    const P = C.pts.map(([u, v]) => dir(C.at[0] - u * C.s, C.at[1] + v * C.s, R * 0.99));
    for (const [a, b] of C.lines) lp.push(...P[a], ...P[b]);
    for (const p of P) spts.push(...p);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: '#8fa8ff', transparent: true, opacity: 0.35, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(lg, lineMat); lines.name = 'scope-constellations'; lines.frustumCulled = false;
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(spts, 3));
  const cMat = new THREE.PointsMaterial({ size: 4.2, sizeAttenuation: false, color: '#fff6d8', transparent: true, depthWrite: false, fog: false });
  const cstars = new THREE.Points(cg, cMat); cstars.name = 'scope-constellation-stars'; cstars.frustumCulled = false;
  // a bright planet low in the west (Venus, more or less), steady and yellow-white
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(dir(base - 0.2, 0.12, R * 0.98), 3));
  const pMat = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, color: '#fff2b0', transparent: true, depthWrite: false, fog: false });
  const planet = new THREE.Points(pg, pMat); planet.name = 'scope-planet'; planet.frustumCulled = false;
  // the moon, in today's phase (the texture is redrawn when the phase moves on a few per cent)
  const moonMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false });
  const moon = new THREE.Sprite(moonMat); moon.name = 'scope-moon'; moon.scale.setScalar(R * 0.06); moon.position.set(...dir(base + 0.3, 0.86, R * 0.97));
  let moonP = -1;
  // the odd thing (rare): faint, among the stars over the Lyre's corner
  const oddMat = new THREE.SpriteMaterial({ map: oddTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false, color: '#c8ffd8' });
  const odd = new THREE.Sprite(oddMat); odd.name = 'scope-odd'; odd.scale.setScalar(R * 0.09); odd.position.set(...dir(base + 0.12, 0.9, R * 0.96)); odd.visible = false;
  // a bird crossing by day (two dark wings on a line through the arc, a few seconds every half minute)
  const birdMat = new THREE.MeshBasicMaterial({ color: '#2b2b33', fog: false, side: THREE.DoubleSide });
  const bird = new THREE.Group(); bird.name = 'scope-bird';
  const wings = [-1, 1].map(k => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), birdMat); w.position.x = k * 0.55; bird.add(w); return w; });
  for (const o of [stars, lines, cstars, planet, moon, odd]) o.renderOrder = -1;
  group.add(stars, lines, cstars, planet, moon, odd, bird);
  const state = { night: 0, odd: false, moonPhase: 0 };
  return {
    group, state,
    // every frame while you look: the dome rides with the eyepiece; how much of it shows follows the night
    update(eye, night, ms, open, t) {
      group.position.copy(eye);
      const n = Math.max(0, Math.min(1, (night - 0.15) / 0.6));
      starMat.opacity = n; cMat.opacity = n; pMat.opacity = Math.max(n, 0); lineMat.opacity = 0.35 * n; moonMat.opacity = Math.max(0.25, n);
      stars.visible = cstars.visible = lines.visible = planet.visible = n > 0.01;
      const ph = moonPhase(ms);
      if (Math.abs(ph - moonP) > 0.02) { moonP = ph; moonMat.map?.dispose(); moonMat.map = moonTexture(ph); moonMat.needsUpdate = true; }
      moon.visible = ph > 0.03 && ph < 0.97; // no moon to see at the new moon
      const strange = n > 0.5 && oddOne(ms, open);
      odd.visible = strange; oddMat.opacity = strange ? 0.18 + 0.08 * Math.sin(t * 0.7) : 0;
      odd.material.rotation = Math.sin(t * 0.13) * 0.15;
      // the bird: by day, crossing the arc at 60 m in the first 8 s of every 30
      const u = (t % 30) / 8, day = night < 0.4;
      bird.visible = day && u < 1;
      if (bird.visible) {
        const y = base + arc + 0.1 - u * arc * 1.2, [x, yy, z] = dir(y, 0.42 + Math.sin(u * 3) * 0.03, 60); // across the day view's sky, right to left
        bird.position.set(x, yy, z); bird.lookAt(eye); bird.rotateY(Math.PI / 2);
        const f = Math.sin(t * 9) * 0.6; wings[0].rotation.z = f; wings[1].rotation.z = -f;
      }
      state.night = n; state.odd = strange; state.moonPhase = ph;
    },
  };
}
