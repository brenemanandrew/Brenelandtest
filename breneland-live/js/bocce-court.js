// The bocce court in the meadow west of the swing tree: a raised timber border, a crushed-stone surface with chalk
// lines, a scoreboard, a bench, a ball rack and a sign. Everything is built in COURT coordinates (bocce-rules.js: x
// across, z along, y up from the ground) inside one group that layout.js BOCCE places and turns in the world.
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { toon, soft, GRADIENT_4 } from './toon.js';
import { terrainHeight } from './terrain.js';
import { BOCCE } from './layout.js';
import { COURT } from './bocce-rules.js';

export const GROUND_Y = 0.45;      // the terrain is flattened to this under the court (bocceFlatZones)
export const SURF = 0.035;         // the playing surface sits this far above the ground
const COS = Math.cos(BOCCE.rot), SIN = Math.sin(BOCCE.rot);
const HX = COURT.W / 2 + COURT.BOARD, HZ = COURT.L / 2 + COURT.BOARD;   // outer edge of the boards

// court <-> world, without THREE (used before the scene exists)
export const toWorldXZ = (lx, lz) => [BOCCE.x + lx * COS + lz * SIN, BOCCE.z - lx * SIN + lz * COS];
export const toLocalXZ = (wx, wz) => { const dx = wx - BOCCE.x, dz = wz - BOCCE.z; return [dx * COS - dz * SIN, dx * SIN + dz * COS]; };
export const worldYawOf = localYaw => localYaw + BOCCE.rot;   // a heading in court space (0 = +z) -> world yaw

// Where the furniture stands (court space; +x is the meadow side, where people arrive along the trail).
export const SPOTS = {
  bench: { x: 3.65, z: 2.5, r: 1.0 }, board: { x: 3.4, z: -5.5, r: 0.95 }, rack: { x: 3.4, z: 4.55, r: 0.55 }, sign: { x: 5.3, z: -1.35, r: 0.3 },
  trail: { x: 4.75, z: 0 },
};
export const BENCH_H = 0.3; // (seat-height: the bots' bench 0.3 up, was 0.46: their feet hung 15-25 cm)

// Circles the terrain flattens along the court (main.js adds them to setFlatZones).
export function bocceFlatZones() {
  const out = [];
  for (let z = -10.5; z <= 10.51; z += 1.5) { const [x, wz] = toWorldXZ(0, z); out.push({ x, z: wz, r: 2.7, y: GROUND_Y }); }
  return out;
}
// false where grass and flowers must not grow (the court and the furniture). main.js calls this from isClear.
export function bocceClear(x, z, pad = 0) {
  const [lx, lz] = toLocalXZ(x, z);
  if (Math.abs(lx) < HX + 0.35 + pad && Math.abs(lz) < HZ + 0.35 + pad) return false;
  for (const k of ['bench', 'board', 'rack', 'sign']) { const s = SPOTS[k]; if ((lx - s.x) ** 2 + (lz - s.z) ** 2 < (s.r + 0.3 + pad) ** 2) return false; }
  return true;
}

// ------------------------------------------------------------------ textures
function surfaceTexture() {
  const W = 160, H = 800, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#e4cf9c'; g.fillRect(0, 0, W, H);
  // crushed stone: soft patches, then chips
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(200, 176, 128, 0.35)' : 'rgba(244, 228, 190, 0.35)'; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 8 + rnd() * 18, 8 + rnd() * 26, rnd() * 3, 0, 7); g.fill(); }
  const chips = ['#cdb383', '#f3e4c2', '#b99f73', '#d9c091', '#a88f67'];
  for (let i = 0; i < 2600; i++) { g.fillStyle = chips[i % chips.length]; const s = 1 + rnd() * 2.2; g.fillRect(rnd() * W, rnd() * H, s, s); }
  // worn a little darker along the boards
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(150, 120, 80, 0.28)'); edge.addColorStop(0.08, 'rgba(150, 120, 80, 0)'); edge.addColorStop(0.92, 'rgba(150, 120, 80, 0)'); edge.addColorStop(1, 'rgba(150, 120, 80, 0.28)');
  g.fillStyle = edge; g.fillRect(0, 0, W, H);
  // chalk: foul lines at both ends and a dashed centre line
  const pz = z => (z / COURT.L + 0.5) * H;
  g.fillStyle = 'rgba(255, 255, 255, 0.9)';
  for (const s of [-1, 1]) g.fillRect(4, pz(s * (COURT.L / 2 - COURT.FOUL)) - 2.5, W - 8, 5);
  for (let x = 6; x < W - 6; x += 18) g.fillRect(x, pz(0) - 2, 10, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

const FONT = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';
export const TEAM_COL = ['#e0574f', '#4fae5a'];
export const TEAM_DARK = ['#a8352f', '#2f7d3a'];

// ------------------------------------------------------------------ build
export function buildCourt(scene, colliders) {
  const group = new THREE.Group();
  group.name = 'bocce-court';
  group.position.set(BOCCE.x, GROUND_Y, BOCCE.z);
  group.rotation.y = BOCCE.rot;
  scene.add(group);
  const b = new Batcher({ vertexColors: true });
  const W = COURT.W, L = COURT.L, T = COURT.BOARD, top = SURF + COURT.BOARD_H;
  const gy = (lx, lz) => { const [x, z] = toWorldXZ(lx, lz); return terrainHeight(x, z) - GROUND_Y; };

  // surface
  const side = toon('#c9b184');
  const surf = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, L), [side, side, new THREE.MeshToonMaterial({ map: surfaceTexture(), gradientMap: GRADIENT_4 }), side, side, side]);
  surf.position.y = SURF - 0.06;
  surf.receiveShadow = true;
  group.add(surf);
  // a strip of darker gravel just outside the boards so the court sits in the lawn instead of on it
  b.add(GEO.box, '#b5a07a', { y: 0.005, sx: W + T * 2 + 0.5, sy: 0.03, sz: L + T * 2 + 0.5 });

  // timber boards: a beam on each side with a lighter cap and a dark kick board, posts at the corners and midway
  const wood = '#b57f4c', cap = '#d0a46b', dark = '#7d5230';
  for (const s of [-1, 1]) {
    b.add(GEO.box, wood, { x: s * (W / 2 + T / 2), y: (top - 0.06) / 2, sx: T, sy: top + 0.06, sz: L + T * 2 });
    b.add(GEO.box, cap, { x: s * (W / 2 + T / 2), y: top + 0.012, sx: T + 0.04, sy: 0.03, sz: L + T * 2 + 0.04 });
    b.add(GEO.box, dark, { x: s * (W / 2 + T + 0.004), y: 0.05, sx: 0.012, sy: 0.08, sz: L + T * 2 });
    b.add(GEO.box, wood, { z: s * (L / 2 + T / 2), y: (top - 0.06) / 2, sx: W, sy: top + 0.06, sz: T });
    b.add(GEO.box, cap, { z: s * (L / 2 + T / 2), y: top + 0.012, sx: W + 0.02, sy: 0.03, sz: T + 0.04 });
    for (let z = -L / 2 + 2; z < L / 2; z += 3) b.add(GEO.box, dark, { x: s * (W / 2 + T + 0.004), y: top * 0.5, z, sx: 0.01, sy: top * 0.8, sz: 0.035 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) {
    const x = sx * (W / 2 + T / 2), z = sz * (L / 2 + T / 2);
    b.add(GEO.box, dark, { x, y: (top + 0.1) / 2, z, sx: T + 0.08, sy: top + 0.14, sz: sz ? T + 0.08 : 0.22 });
    b.add(GEO.box, cap, { x, y: top + 0.09, z, sx: T + 0.1, sy: 0.025, sz: sz ? T + 0.1 : 0.24 });
  }

  // the bench (bots sit here between games)
  const { bench, board, rack, sign } = SPOTS;
  {
    const y = gy(bench.x, bench.z);
    b.add(GEO.box, '#c08a52', { x: bench.x, y: y + BENCH_H - 0.03, z: bench.z, sx: 0.46, sy: 0.07, sz: 2.2 });
    b.add(GEO.box, '#c08a52', { x: bench.x + 0.22, y: y + BENCH_H + 0.3, z: bench.z, sx: 0.06, sy: 0.3, sz: 2.2, rz: 0.12 });
    for (const dz of [-0.9, 0.9]) {
      b.add(GEO.box, dark, { x: bench.x, y: y + (BENCH_H - 0.06) / 2, z: bench.z + dz, sx: 0.4, sy: BENCH_H - 0.06, sz: 0.08 });
      b.add(GEO.box, dark, { x: bench.x + 0.2, y: y + BENCH_H + 0.12, z: bench.z + dz, sx: 0.06, sy: 0.42, sz: 0.08, rz: 0.12 });
    }
  }
  // the ball rack: a little trough on legs; pallino at the front, then red and green in two rows
  const rackSlots = [];
  {
    const y = gy(rack.x, rack.z), h = 0.62;
    b.add(GEO.box, '#c08a52', { x: rack.x, y: y + h, z: rack.z, sx: 0.36, sy: 0.06, sz: 1.35 });
    for (const s of [-1, 1]) b.add(GEO.box, cap, { x: rack.x + s * 0.17, y: y + h + 0.05, z: rack.z, sx: 0.035, sy: 0.08, sz: 1.35 });
    for (const dz of [-0.6, 0.6]) for (const dx of [-0.13, 0.13]) b.add(GEO.box, dark, { x: rack.x + dx, y: y + h / 2, z: rack.z + dz, sx: 0.06, sy: h, sz: 0.06 });
    rackSlots.push([rack.x, y + h + 0.075, rack.z - 0.55]);
    for (let i = 0; i < 4; i++) rackSlots.push([rack.x - 0.085, y + h + 0.12, rack.z - 0.34 + i * 0.27]);
    for (let i = 0; i < 4; i++) rackSlots.push([rack.x + 0.085, y + h + 0.12, rack.z - 0.34 + i * 0.27]);
  }
  b.build(group, 'bocce');

  // ---- the scoreboard: two posts, a painted board on both faces, a little roof like the swing sign
  const sbG = new THREE.Group();
  sbG.position.set(board.x, gy(board.x, board.z), board.z);
  sbG.rotation.y = Math.PI / 2;           // faces +x (the meadow); the back face shows the same to the court
  group.add(sbG);
  const mk = (geo, col, sx, sy, sz, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, toon(col)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; sbG.add(m); return m; };
  for (const s of [-1, 1]) mk(GEO.cyl8, '#7d5230', 0.07, 2.3, 0.07, s * 1.025, 1.15, 0); // beside the board, not over its faces' edges
  mk(GEO.box, '#7d5230', 1.9, 1.12, 0.08, 0, 1.55, 0);
  mk(GEO.box, '#8f4a35', 1.1, 0.06, 0.46, -0.52, 2.24, 0, 0.34);
  mk(GEO.box, '#8f4a35', 1.1, 0.06, 0.46, 0.52, 2.24, 0, -0.34);
  const sbCanvas = document.createElement('canvas'); sbCanvas.width = 512; sbCanvas.height = 288;
  const sbTex = new THREE.CanvasTexture(sbCanvas); sbTex.colorSpace = THREE.SRGBColorSpace; sbTex.anisotropy = 4;
  for (const s of [1, -1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 0.99), new THREE.MeshBasicMaterial({ map: sbTex }));
    face.position.set(0, 1.55, s * 0.042); face.rotation.y = s > 0 ? 0 : Math.PI;
    sbG.add(face);
  }
  let sbKey = '', lastBoard = {};
  function drawBoard(d = {}) {
    const key = JSON.stringify(d);
    if (key === sbKey) return;
    sbKey = key;
    const g = sbCanvas.getContext('2d'), Wc = 512, Hc = 288;
    g.fillStyle = '#2f3b33'; g.fillRect(0, 0, Wc, Hc);                 // a painted chalkboard
    g.strokeStyle = '#c89a5e'; g.lineWidth = 14; g.strokeRect(7, 7, Wc - 14, Hc - 14);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f3ead2'; g.font = `700 34px ${FONT}`;
    g.fillText('BOCCE', Wc / 2, 44);
    const sc = d.score || [0, 0];
    for (const t of [0, 1]) {
      const cx = t ? Wc * 0.75 : Wc * 0.25;
      g.fillStyle = TEAM_COL[t]; g.fillRect(cx - 92, 78, 184, 44);
      g.fillStyle = '#ffffff'; g.font = `700 30px ${FONT}`; g.fillText(t ? 'GREEN' : 'RED', cx, 101);
      g.fillStyle = '#fffbea'; g.font = `700 104px ${FONT}`; g.fillText(String(sc[t]), cx, 186);
    }
    g.fillStyle = 'rgba(243, 234, 210, 0.5)'; g.fillRect(Wc / 2 - 2, 84, 4, 150);
    g.fillStyle = '#f3ead2'; g.font = `700 24px ${FONT}`;
    g.fillText(d.playing ? `Frame ${d.frame + 1}  -  first to ${d.target}` : 'Walk up and press E to play', Wc / 2, 258);
    sbTex.needsUpdate = true;
  }
  drawBoard({});
  document.fonts?.load?.('700 34px Fredoka').then(() => { sbKey = ''; drawBoard(lastBoard); }).catch(() => {});

  // ---- the sign at the end of the trail
  {
    const sg = new THREE.Group();
    sg.position.set(sign.x, gy(sign.x, sign.z), sign.z);
    sg.rotation.y = Math.PI / 2 - 0.35;
    group.add(sg);
    const post = new THREE.Mesh(GEO.cyl8, toon('#7d5230')); post.scale.set(0.07, 1.7, 0.07); post.position.y = 0.85; post.castShadow = true; sg.add(post);
    const plank = new THREE.Mesh(GEO.box, toon('#b98a52')); plank.scale.set(1.5, 0.5, 0.07); plank.position.set(0, 1.42, 0.06); plank.castShadow = true; sg.add(plank);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 170;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const draw = () => {
      const g = cv.getContext('2d');
      g.fillStyle = '#c89a5e'; g.fillRect(0, 0, 512, 170);
      g.fillStyle = 'rgba(122, 83, 47, 0.25)'; g.fillRect(0, 84, 512, 3);
      g.strokeStyle = '#7a532f'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 160);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#3d2614'; g.font = `700 64px ${FONT}`; g.fillText('BOCCE COURT', 256, 72);
      g.font = `700 26px ${FONT}`; g.fillStyle = '#6b4424'; g.fillText('2 v 2, bots welcome', 256, 132);
      const ball = (x, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, 132, 17, 0, 7); g.fill(); g.strokeStyle = '#3d2614'; g.lineWidth = 3; g.stroke(); };
      ball(46, TEAM_COL[0]); ball(466, TEAM_COL[1]);
      tex.needsUpdate = true;
    };
    draw();
    document.fonts?.load?.('700 64px Fredoka').then(draw).catch(() => {});
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.478), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 1.42, 0.097); sg.add(face);
  }
  group.updateMatrixWorld(true);

  // ---- colliders: a chain of small circles along the boards (the court is turned, and box colliders are axis aligned)
  const chain = (ax, az, bx, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.42);
    for (let i = 0; i <= n; i++) { const [x, z] = toWorldXZ(ax + (bx - ax) * i / n, az + (bz - az) * i / n); colliders.push({ type: 'circle', x, z, r: 0.26, bocce: true }); }
  };
  const cx = W / 2 + T / 2, cz = L / 2 + T / 2;
  chain(-cx, -cz, cx, -cz); chain(cx, -cz, cx, cz); chain(cx, cz, -cx, cz); chain(-cx, cz, -cx, -cz);
  for (const dz of [-0.75, 0, 0.75]) { const [x, z] = toWorldXZ(bench.x, bench.z + dz); colliders.push({ type: 'circle', x, z, r: 0.42 }); }
  for (const s of [-1, 1]) { const [x, z] = toWorldXZ(board.x, board.z + s * 0.86); colliders.push({ type: 'circle', x, z, r: 0.14 }); }
  { const [x, z] = toWorldXZ(rack.x, rack.z); colliders.push({ type: 'circle', x, z, r: 0.5 }); }
  { const [x, z] = toWorldXZ(sign.x, sign.z); colliders.push({ type: 'circle', x, z, r: 0.14 }); }

  return {
    group, rackSlots,
    setBoard(d) { lastBoard = d; drawBoard(d); },
    // where a bot sits on the bench (world), facing the court
    benchSeat: i => { const lz = bench.z + (i ? 0.5 : -0.5), [x, z] = toWorldXZ(bench.x - 0.05, lz), by = gy(bench.x, bench.z), fy = Math.min(by, gy(bench.x - 0.4, lz)); return { x, z, y: GROUND_Y + fy, seat: BENCH_H + by - fy, yaw: worldYawOf(-Math.PI / 2) }; }, // (seat-height: the sitter stands on the ground under the feet, the seat over it)
  };
}

// The balls: a sphere with a painted band and a dot (so you can see it roll), and the small pallino: solid white
// with a heavy dark outline (an inverted hull) so it is easy to spot on the stone.
const BALL_GEO = new THREE.SphereGeometry(1, 20, 14);
const BAND_GEO = new THREE.TorusGeometry(1.0, 0.13, 6, 28);
export function makeBallMesh(i, r) {
  const m = new THREE.Mesh(BALL_GEO, i === 0 ? new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }) : toon(TEAM_COL[i <= 4 ? 0 : 1]));
  m.scale.setScalar(r);
  m.castShadow = true;
  if (i === 0) {
    const hull = new THREE.Mesh(BALL_GEO, new THREE.MeshBasicMaterial({ color: '#1c1a2e', side: THREE.BackSide, fog: true }));
    hull.scale.setScalar(1.3);
    m.add(soft(hull));
  }
  if (i > 0) {
    const band = new THREE.Mesh(BAND_GEO, toon(i <= 4 ? '#ffd9cf' : '#dcf5d8'));
    band.scale.set(1, 1, 0.55);
    m.add(soft(band));
    const dot = new THREE.Mesh(BALL_GEO, toon(i <= 4 ? TEAM_DARK[0] : TEAM_DARK[1]));
    dot.scale.setScalar(0.28); dot.position.set(0, 0, 0.93);
    m.add(soft(dot));
  }
  return m;
}
