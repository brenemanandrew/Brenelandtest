// Game areas. A slot with a game gets a themed table, props and NPCs. An empty slot gets decor and a "coming soon" sign,
// unless its placeholder is a place of its own (`place: true`, like the dock).
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { addBalloon, balloonGeometry } from './balloons.js';
import { toon, glow, soft, shadows, redrawWhenFontsLoad } from './toon.js';
import { terrainHeight } from './terrain.js';
import { DOCK } from './layout.js';
import { mulberry32, hash01 } from './util.js';
import { dockPlaceholder } from './dock.js';
import { limb } from './world-trees.js';
import { buildCampfire } from './campfire.js';
import { buildFirepit } from './firepit-build.js';
import { buildGarden } from './garden-build.js';
import { buildPicnic } from './picnic-build.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { addSeat, addLogSeats } from './seats.js';
import { npcSpec } from './npc-looks.js';
import { farLawn } from './perf-flags.js';

const TAU = Math.PI * 2;

export function signTexture(lines, { bg = '#7a5234', fg = '#fff4dc', w = 512, h = 256, font = 'Fredoka' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.18; g.fillStyle = '#000';
    for (let y = 10; y < h; y += 26) g.fillRect(0, y, w, 3);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = lines.length > 1 ? 64 : 80;
    lines.forEach((ln, i) => {
      g.font = `${i === 0 ? 700 : 500} ${i === 0 ? size : size * 0.6}px "${font}", "Trebuchet MS", sans-serif`;
      let s = size;
      while (g.measureText(ln).width > w - 50 && s > 20) { s -= 4; g.font = `700 ${s}px "${font}", sans-serif`; }
      g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 0.95);
    });
    tex.needsUpdate = true;
  };
  draw();
  redrawWhenFontsLoad(draw, [`700 64px "${font}"`, `500 40px "${font}"`]);
  return tex;
}

// A post-and-board sign facing `yaw`. Pass `colliders` and the sign is solid (three small circles along the board).
export function addSign(group, x, z, yaw, lines, style, colliders) {
  const y = terrainHeight(x, z);
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = yaw;
  // two posts under the board's ends, stopping at its bottom edge so no post crosses the words
  const postMat = toon('#6b4428');
  const post = new THREE.Group();
  for (const px of [-0.58, 0.58]) {
    const pm = new THREE.Mesh(GEO.box, postMat);
    pm.scale.set(0.12, 1.17, 0.12); pm.position.set(px, 0.585, 0);
    post.add(pm);
  }
  const face = new THREE.MeshBasicMaterial({ map: signTexture(lines, style), fog: true });
  const edge = toon(style?.bg || '#7a5234');
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.07), [edge, edge, edge, edge, face, face]);
  board.position.y = 1.55;
  s.add(post, board);
  shadows(s);
  group.add(s);
  if (colliders) for (const o of [-0.55, 0, 0.55]) colliders.push({ type: 'circle', x: x + Math.cos(yaw) * o, z: z - Math.sin(yaw) * o, r: 0.2, sign: true });
  return s;
}

function plaza(b, x, z, r, colors) {
  const y = terrainHeight(x, z);
  colors.forEach((c, i) => {
    const rr = r * (1 - i / colors.length * 0.9);
    b.add(GEO.cyl12, toon(c, { polygonOffset: true }), { x, y: y + 0.02 + i * 0.012, z, sx: rr, sy: 0.04, sz: rr });
  });
}

function chair(b, x, z, yaw, col) {
  const y = terrainHeight(x, z);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  b.add(GEO.box, col, { x, y: y + 0.48, z, sx: 0.5, sy: 0.07, sz: 0.5, ry: yaw });
  b.add(GEO.box, col, { x: x - s * 0.23, y: y + 0.8, z: z - c * 0.23, sx: 0.5, sy: 0.6, sz: 0.06, ry: yaw });
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    b.add(GEO.box, col, { x: x + lx * c + lz * s, y: y + 0.24, z: z - lx * s + lz * c, sx: 0.06, sy: 0.48, sz: 0.06, ry: yaw });
  }
}

function roundTable(b, x, z, r, top, leg) {
  const y = terrainHeight(x, z);
  b.add(GEO.cyl12, top, { x, y: y + 0.82, z, sx: r, sy: 0.08, sz: r });
  b.add(GEO.cyl8, leg, { x, y: y + 0.4, z, sx: 0.12, sy: 0.8, sz: 0.12 });
  b.add(GEO.cyl8, leg, { x, y: y + 0.04, z, sx: 0.5, sy: 0.08, sz: 0.5 });
  return y + 0.86;
}

function fogTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ themes (games)

const THEMES = {};

THEMES.arkham = (ctx) => {
  const { b, group, x, z, rnd, colliders, updaters } = ctx;
  plaza(b, x, z, 6.2, ['#57545e', '#6b6873', '#4a4751']);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU, r = 1.5 + rnd() * 4.5;
    b.add(GEO.box, '#7c7985', { x: x + Math.cos(a) * r, y: terrainHeight(x, z) + 0.07, z: z + Math.sin(a) * r, sx: 0.5, sy: 0.04, sz: 0.35, ry: rnd() * 3 });
  }
  const top = roundTable(b, x, z, 1.2, '#4a3326', '#2e2019');
  b.add(GEO.box, '#d8c49a', { x, y: top + 0.01, z, sx: 1.3, sy: 0.02, sz: 0.9, ry: 0.2 });
  for (let i = 0; i < 5; i++) b.add(GEO.box, '#b8433c', { x: x - 0.4 + i * 0.2, y: top + 0.03, z: z - 0.2 + (i % 2) * 0.3, sx: 0.4, sy: 0.005, sz: 0.012, ry: i });
  b.add(GEO.box, '#5a2f3a', { x: x + 0.7, y: top + 0.08, z: z + 0.5, sx: 0.3, sy: 0.15, sz: 0.22 });
  b.add(GEO.box, '#2f3a5a', { x: x + 0.72, y: top + 0.22, z: z + 0.48, sx: 0.28, sy: 0.12, sz: 0.2, ry: 0.3 });
  b.add(GEO.cyl8, '#efe6d0', { x: x - 0.7, y: top + 0.12, z: z - 0.4, sx: 0.05, sy: 0.24, sz: 0.05 });
  b.add(GEO.cone6, lampGlow('#ffcf6a'), { x: x - 0.7, y: top + 0.3, z: z - 0.4, sx: 0.035, sy: 0.1, sz: 0.035 });
  addNightSpot({ x: x - 0.7, y: top + 0.3, z: z - 0.4, color: '#ffc466', pool: 1.5, poolK: 0.55, gy: top, halo: 0.45, flicker: 0.8 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    chair(b, x + Math.cos(a) * 1.75, z + Math.sin(a) * 1.75, -a - Math.PI / 2, '#3a2a20');
  }
  // gas lamps
  for (const a of [0.9, 3.9]) {
    const lx = x + Math.cos(a) * 5.2, lz = z + Math.sin(a) * 5.2, y = terrainHeight(lx, lz);
    b.add(GEO.cyl6, '#1f1f24', { x: lx, y: y + 1.6, z: lz, sx: 0.08, sy: 3.2, sz: 0.08 });
    b.add(GEO.box, '#1f1f24', { x: lx, y: y + 3.25, z: lz, sx: 0.42, sy: 0.08, sz: 0.42 });
    b.add(GEO.box, lampGlow('#ffc766'), { x: lx, y: y + 3.0, z: lz, sx: 0.3, sy: 0.42, sz: 0.3 });
    addNightSpot({ x: lx, y: y + 3.0, z: lz, color: '#ffb654', pool: 3.4, gy: y, halo: 1.25, flicker: 0.35 });
    b.add(GEO.cone6, '#1f1f24', { x: lx, y: y + 3.42, z: lz, sx: 0.28, sy: 0.25, sz: 0.28 });
    colliders.push({ type: 'circle', x: lx, z: lz, r: 0.3 });
  }
  // the bare, twisted tree, crows on the tips of its two big branches. Each limb starts on the one it grows from.
  const tx = x - 5.6, tz = z - 3.8, ty = terrainHeight(tx, tz);
  const bark = '#3b2f2a';
  const lb = (p0, p1, r) => limb(b, bark, [tx + p0[0], ty + p0[1], tz + p0[2]], [tx + p1[0], ty + p1[1], tz + p1[2]], r);
  const T = [[0, -0.5, 0], [0.12, 1.1, 0.05], [-0.1, 2.3, -0.05], [0.06, 3.5, 0.08]];
  lb(T[0], T[1], 0.36); lb(T[1], T[2], 0.3); lb(T[2], T[3], 0.22);
  const B1 = [1.0, 3.25, 0.25], B2 = [-1.0, 3.8, 0.3];
  lb(T[2], B1, 0.14); lb([0.8, 3.1, 0.2], [1.5, 3.9, 0.1], 0.07); lb([0.9, 3.15, 0.22], [1.3, 3.0, 0.75], 0.06);
  lb([-0.03, 2.95, 0], B2, 0.12); lb([-0.8, 3.6, 0.28], [-1.6, 4.4, 0.0], 0.06);
  lb(T[1], [1.0, 1.75, -0.55], 0.1); lb([0.6, 1.5, -0.3], [1.1, 1.1, -0.15], 0.05);
  lb(T[3], [0.3, 4.5, -0.3], 0.09); lb(T[3], [-0.3, 4.35, 0.4], 0.08);
  for (const [cx, cy, cz] of [[B1[0] * 0.9, B1[1] + 0.13, B1[2] * 0.9], [B2[0] * 0.9, B2[1] + 0.13, B2[2] * 0.9]]) {
    b.add(GEO.sphere, '#16161b', { x: tx + cx, y: ty + cy, z: tz + cz, sx: 0.14, sy: 0.12, sz: 0.2 });
    b.add(GEO.sphere, '#16161b', { x: tx + cx, y: ty + cy + 0.12, z: tz + cz + 0.14, sx: 0.08, sy: 0.08, sz: 0.08 });
    b.add(GEO.cone6, '#e0b54a', { x: tx + cx, y: ty + cy + 0.11, z: tz + cz + 0.25, sx: 0.025, sy: 0.08, sz: 0.025, rx: Math.PI / 2 });
  }
  colliders.push({ type: 'circle', x: tx, z: tz, r: 0.5 });
  // crates and an iron fence arc
  for (const [ox, oz, s] of [[4.2, -3.2, 0.7], [4.9, -2.6, 0.5], [4.4, -2.5, 0.45]]) {
    const cx = x + ox, cz = z + oz;
    b.add(GEO.box, '#6b5236', { x: cx, y: terrainHeight(cx, cz) + s / 2 + (s < 0.6 && oz > -2.7 ? 0.7 : 0), z: cz, sx: s, sy: s, sz: s, ry: ox });
  }
  colliders.push({ type: 'circle', x: x + 4.5, z: z - 2.9, r: 0.8 });
  for (let a = 2.2; a < 3.5; a += 0.09) {
    const fx = x + Math.cos(a) * 6.6, fz = z + Math.sin(a) * 6.6;
    b.add(GEO.cyl6, '#1f1f24', { x: fx, y: terrainHeight(fx, fz) + 0.6, z: fz, sx: 0.03, sy: 1.2, sz: 0.03 });
    b.add(GEO.cone6, '#1f1f24', { x: fx, y: terrainHeight(fx, fz) + 1.25, z: fz, sx: 0.05, sy: 0.12, sz: 0.05 });
  }
  // puddles on the plaza: it rains here all the time (weather.js: the corner's own storm)
  const puddle = toon('#2b2f3d', { polygonOffset: true });
  for (const [ox, oz, s, k] of [[2.6, 1.4, 1.1, 0.7], [-2.2, 2.8, 0.9, 1.3], [0.4, -3.4, 1.3, 0.5], [-3.6, -1.6, 0.8, 1.1], [4.4, -1.2, 0.7, 0.9], [-1.0, 4.6, 1.0, 0.6], [3.2, 4.0, 0.75, 1.4]]) {
    const px = x + ox, pz = z + oz;
    b.add(GEO.cyl12, puddle, { x: px, y: terrainHeight(px, pz) + 0.075, z: pz, sx: s, sy: 0.012, sz: s * 0.7, ry: k });
  }
  // low fog drifting through, and plenty of it: the corner sits in its own weather (daynight.js thickens the scene fog too)
  const fogMat = new THREE.SpriteMaterial({ map: fogTexture(), color: '#aaa5c2', transparent: true, opacity: 0.36, depthWrite: false, fog: true });
  const fogs = [];
  for (let i = 0; i < 24; i++) {
    const sp = new THREE.Sprite(fogMat);
    const s = 4 + rnd() * 5;
    sp.scale.set(s, s * 0.45, 1);
    // the lower edge stays above the ground so the mist has no hard cut. The outer dozen drift wider, out between the dead trees.
    sp.userData = { a: rnd() * TAU, r: (i < 12 ? 1.5 : 7) + rnd() * (i < 12 ? 5.5 : 11), sp: (0.02 + rnd() * 0.05) * (i < 12 ? 1 : 0.6), y: s * 0.225 + 0.08 + rnd() * 0.45 };
    fogs.push(sp);
    group.add(soft(sp));
  }
  updaters.push((dt, t) => {
    for (const f of fogs) {
      const u = f.userData;
      const a = u.a + t * u.sp;
      const fx = x + Math.cos(a) * u.r, fz = z + Math.sin(a) * u.r;
      f.position.set(fx, terrainHeight(fx, fz) + u.y, fz);
    }
  });
  return {
    tableR: 1.3,
    npcs: [
      npcSpec('detective'), npcSpec('professor'), npcSpec('reporter'), npcSpec('cultist'),   // looks and voices in npc-looks.js (the NPC Editor dresses them)
    ],
    lines: ['Did you hear that?', 'The stars are wrong tonight.', 'Check the old map...', 'Ph\'nglui... what?', 'A clue! Finally.', 'Stay out of the woods.',
      'Doom is rising.', 'Keep the lantern lit.', '*shivers*', 'Who moved the gate?'],
    pairs: [['talk', 'talk'], ['whisper', 'startle'], ['point', 'look'], ['talk', 'shrug']],
    idle: ['look', 'read', 'idle', 'talk'],
  };
};

THEMES.unicorns = (ctx) => {
  const { b, group, x, z, rnd, colliders, updaters } = ctx;
  plaza(b, x, z, 6.4, ['#ff9fb8', '#ffc98f', '#fff1a0', '#a8e8a0', '#9fd0ff', '#d0b8ff']);
  const top = roundTable(b, x, z, 1.2, '#ffffff', '#f2b8d0');
  b.add(GEO.cyl12, '#ff8fb8', { x, y: top - 0.1, z, sx: 1.28, sy: 0.18, sz: 1.28 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.add(GEO.box, ['#b48cff', '#6fb8ff', '#ff6b6b'][i % 3], { x: x + Math.cos(a) * 0.6, y: top + 0.03 + (i % 2) * 0.02, z: z + Math.sin(a) * 0.6, sx: 0.28, sy: 0.02, sz: 0.4, ry: a });
  }
  b.add(GEO.box, '#ffffff', { x, y: top + 0.1, z, sx: 0.3, sy: 0.2, sz: 0.42 });
  b.add(GEO.box, '#b48cff', { x, y: top + 0.21, z, sx: 0.3, sy: 0.01, sz: 0.42 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.8;
    chair(b, x + Math.cos(a) * 1.75, z + Math.sin(a) * 1.75, -a - Math.PI / 2, ['#ffc6e0', '#c6f5e0', '#d9c6ff', '#fff1a0'][i]);
  }
  // rainbow arch behind the table, facing the house like the name board. fx, fz: the way it faces. tx, tz: along it, cloud to cloud.
  const rainbow = ['#ff6b6b', '#ffb347', '#fff27a', '#7ddc7a', '#6fb8ff', '#b48cff'];
  const face = Math.atan2(0 - x, -8 - z), fx = Math.sin(face), fz = Math.cos(face), tx = fz, tz = -fx;
  const archX = x - fx * 4.6, archZ = z - fz * 4.6, archY = terrainHeight(archX, archZ) - 0.3;
  rainbow.forEach((c, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(4.2 - i * 0.28, 0.15, 8, 40, Math.PI), toon(c, { emissive: c, emissiveIntensity: 0.15 }));
    arc.position.set(archX, archY, archZ);
    arc.rotation.y = face;
    group.add(shadows(arc, true, false));
  });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const u = s * 3.5 + (rnd() - 0.5) * 1.4, v = (rnd() - 0.5) * 1.2;
      b.add(GEO.ico1, '#ffffff', { x: archX + tx * u + fx * v, y: archY + 0.5 + rnd() * 0.5, z: archZ + tz * u + fz * v, sx: 0.8, sy: 0.6, sz: 0.8 });
    }
    colliders.push({ type: 'circle', x: archX + tx * s * 3.5, z: archZ + tz * s * 3.5, r: 1.0 });
  }
  // balloons tied to the table. One pops now and then (balloonPop) and a fresh one is blown up in its place. The sway and the
  // bounce when somebody brushes past are balloons.js.
  const balloons = [];
  ['#ff6fa8', '#6fb8ff', '#fff27a', '#b48cff', '#7ddc7a'].forEach((c, i) => {
    const a = (i / 5) * TAU;
    const ax = x + Math.cos(a) * 1.0, az = z + Math.sin(a) * 1.0;
    const h = 1.6 + rnd() * 0.6;
    const str = new THREE.Mesh(GEO.cyl6, toon('#ffffff'));
    str.scale.set(0.008, h, 0.008);
    const ball = new THREE.Mesh(balloonGeometry(), toon(c, { emissive: c, emissiveIntensity: 0.12 }));
    ball.scale.set(0.24, 0.3, 0.24);
    group.add(shadows(str, true, false), shadows(ball, true, false));
    const rec = addBalloon({ ball, string: str, anchor: { x: ax, y: top, z: az }, len: h, ph: rnd() * TAU });
    balloons.push({ rec, ball, ph: rec.ph, h, x: ax, y: top, z: az });
  });
  const clouds = [-1, 1].map(s => ({ x: archX + tx * s * 3.5, z: archZ + tz * s * 3.5 }));
  // twinkling sparkles
  const sparkGeo = new THREE.OctahedronGeometry(0.08, 0);
  const sparks = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Mesh(sparkGeo, glow(['#fff27a', '#ffffff', '#ffc6e0', '#c6e8ff'][i % 4]));
    s.userData = { a: rnd() * TAU, r: 1 + rnd() * 5, h: 0.5 + rnd() * 2.5, ph: rnd() * TAU, sp: 0.2 + rnd() * 0.4 };
    sparks.push(s);
    group.add(soft(s));
  }
  // far from the camera (perf-flags.js farLawn) the sparkles, specks at that range, aren't drawn or moved
  const lod = { far: false };
  let sparksOn = true;
  updaters.push((dt, t) => {
    const far = farLawn(lod, x, z);
    if (sparksOn === far) { sparksOn = !far; for (const s of sparks) s.visible = sparksOn; }
    balloons.forEach((bl, i) => {
      const p = balloonPop(i, t);
      const k = p.popped ? (p.since < 0.1 ? 1 + p.since * 5 : 0) : p.inflate; // a burst of a stretch, gone, then blown up again
      bl.rec.k = Math.max(0.01, k); // balloons.js scales it and keeps the knot on the string
      bl.ball.visible = k > 0.01;
    });
    if (far) return;
    for (const s of sparks) {
      const u = s.userData, a = u.a + t * u.sp;
      s.position.set(x + Math.cos(a) * u.r, terrainHeight(x, z) + u.h + Math.sin(t * 2 + u.ph) * 0.3, z + Math.sin(a) * u.r);
      s.scale.setScalar(0.4 + Math.max(0, Math.sin(t * 3 + u.ph)) * 1.1);
      s.rotation.y = t * 2;
    }
  });
  return {
    tableR: 1.3,
    far: lod, // its moving folk (npcs.js) are not drawn or animated while this says far (perf-flags.js farLawn)
    lawnR: 13, // the woods keep this far back (main.js, the grass still grows) so the bunting, balloons and game of catch (park.js) stand on open lawn
    npcs: [
      npcSpec('sprinkles'), npcSpec('moonpie'), npcSpec('clover'), npcSpec('partykid'), npcSpec('noodle'), npcSpec('bean'),   // (npc-looks.js)
    ],
    lines: ['Neigh!', 'Neeeigh~', 'Betrayal!', 'Draw a card!', 'I\'m NOT unstable.', 'Sparkles!', 'Baby unicorn incoming!', 'Rainbows are free.', 'Neigh? Neigh.'],
    pairs: [['nuzzle', 'nuzzle'], ['prance', 'prance'], ['talk', 'look'], ['prance', 'nuzzle']],
    idle: ['graze', 'idle', 'prance', 'look'],
    // what park.js needs to put sounds on the visuals: where the balloons, sparkles, clouds, the arch and the table are
    fx: {
      balloons: balloons.map(bl => ({ x: bl.x, y: bl.y + bl.h + 0.34, z: bl.z, ph: bl.ph })),
      sparks: sparks.map(s => s.userData), clouds, arch: { x: archX, y: archY + 2.6, z: archZ }, table: { x, z },
    },
  };
};
// Balloon i's life at time t: every P seconds it may pop (hash), stays gone 9 s, and a new one is blown up over 1.6 s.
export function balloonPop(i, t) {
  const P = 150 + i * 23, tt = t + i * 17, cycle = Math.floor(tt / P), u = tt - cycle * P;
  const popped = hash01('pop', i, cycle) < 0.5 && u >= P - 9;
  const fresh = hash01('pop', i, cycle - 1) < 0.5 && u < 1.6;
  return { popped, since: popped ? u - (P - 9) : 0, inflate: fresh ? 0.15 + (u / 1.6) * 0.85 : 1 };
}

THEMES.generic = (ctx) => {
  const { b, x, z } = ctx;
  plaza(b, x, z, 5.8, ['#d9c7a0', '#cdb98f']);
  const top = roundTable(b, x, z, 1.2, '#b98a5a', '#7a5438');
  b.add(GEO.box, '#2f6b4f', { x, y: top + 0.02, z, sx: 1.1, sy: 0.02, sz: 1.1 });
  for (let i = 0; i < 4; i++) b.add(GEO.box, ['#e0574f', '#6fb8ff', '#fff27a', '#7ddc7a'][i], { x: x - 0.3 + i * 0.2, y: top + 0.08, z: z + 0.2, sx: 0.08, sy: 0.12, sz: 0.08 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    chair(b, x + Math.cos(a) * 1.75, z + Math.sin(a) * 1.75, -a - Math.PI / 2, '#8a6240');
  }
  return {
    tableR: 1.3,
    npcs: [
      npcSpec('sam'), npcSpec('riley'), npcSpec('jo'),   // (npc-looks.js)
    ],
    lines: ['Your turn!', 'Roll again.', 'Nice move.', 'One more game?', 'Who has the dice?'],
    pairs: [['talk', 'laugh'], ['highfive', 'highfive'], ['talk', 'talk']],
    idle: ['idle', 'look', 'talk'],
  };
};

// ------------------------------------------------------------------ placeholders

const PLACEHOLDERS = {};

PLACEHOLDERS.mushrooms = ({ b, x, z, rnd, colliders }) => {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, r = 3.2;
    const mx = x + Math.cos(a) * r, mz = z + Math.sin(a) * r, y = terrainHeight(mx, mz);
    const s = 0.5 + rnd() * 0.5;
    b.add(GEO.cyl8, '#f3ead8', { x: mx, y: y + 0.35 * s, z: mz, sx: 0.14 * s, sy: 0.7 * s, sz: 0.14 * s });
    b.add(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), '#d9443a', { x: mx, y: y + 0.66 * s, z: mz, sx: 0.5 * s, sy: 0.35 * s, sz: 0.5 * s });
    for (let d = 0; d < 3; d++) b.add(GEO.sphere, '#ffffff', { x: mx + Math.cos(d * 2.1) * 0.25 * s, y: y + 0.84 * s, z: mz + Math.sin(d * 2.1) * 0.25 * s, sx: 0.06 * s, sy: 0.03, sz: 0.06 * s });
  }
  b.add(GEO.cyl8, '#8a6240', { x, y: terrainHeight(x, z) + 0.3, z, sx: 0.6, sy: 0.6, sz: 0.6 });
  b.add(GEO.cyl8, '#d9b98a', { x, y: terrainHeight(x, z) + 0.61, z, sx: 0.55, sy: 0.02, sz: 0.55 });
  colliders.push({ type: 'circle', x, z, r: 0.8 });
  const lx = x + 4.5, lz = z + 1.5;
  b.add(GEO.cyl8, '#7a5234', { x: lx, y: terrainHeight(lx, lz) + 0.13, z: lz, sx: 0.17, sy: 2.6, sz: 0.17, rz: Math.PI / 2, ry: 0.5 }); // (seat-height: the top 0.3 up, was 0.6)
  colliders.push({ type: 'circle', x: lx, z: lz, r: 1.1 });
  addLogSeats(lx, lz, terrainHeight(lx, lz) + 0.3, Math.PI / 2 + 0.5, Math.atan2(x - lx, z - lz), 2.6); // facing the mushroom ring
  return { npcs: [] };
};

// The Community Garden, on its own block west of the yard fence. garden-build.js builds it, garden.js adds Joyce's daily jobs.
PLACEHOLDERS.garden = ctx => buildGarden(ctx);

PLACEHOLDERS.campfire = ({ b, group, x, z, rnd, colliders, updaters }) => {
  buildCampfire({ b, group, x, z, colliders, updaters }); // stones, logs, flames, sparks, smoke and the glow (campfire.js)
  // log benches and a tent
  for (const a of [0.3, 2.4, 4.4]) {
    const lx = x + Math.cos(a) * 2.6, lz = z + Math.sin(a) * 2.6, ly = terrainHeight(lx, lz);
    b.add(GEO.cyl8, '#7a5234', { x: lx, y: ly + 0.13, z: lz, sx: 0.17, sy: 1.8, sz: 0.17, rz: Math.PI / 2, ry: -a + Math.PI / 2 }); // (seat-height: the top 0.3 up)
    addLogSeats(lx, lz, ly + 0.3, Math.PI - a, Math.atan2(x - lx, z - lz), 1.8); // sit facing the fire
  }
  const tx = x - 4, tz = z - 2.5, ty = terrainHeight(tx, tz);
  const tent = new THREE.Shape([new THREE.Vector2(-1.2, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(0, 1.6)]);
  b.add(new THREE.ExtrudeGeometry(tent, { depth: 2.2, bevelEnabled: false }), '#e8743a', { x: tx, y: ty, z: tz - 1.1, ry: 0.5 });
  colliders.push({ type: 'circle', x: tx, z: tz, r: 1.4 });
  return {
    npcs: [{ ...npcSpec('remy'), seat: { x: x + Math.cos(0.3) * 2.2, z: z + Math.sin(0.3) * 2.2, anim: 'warm' } }],
    lines: ['S\'mores later?', 'Nice fire, huh?', 'Heard an owl earlier.', 'Marshmallow?'],
    idle: ['warm'],
    pairs: [['talk', 'talk'], ['laugh', 'talk']],
  };
};

// The lakeside firepit, built by firepit-build.js. firepit.js lights the fire (shared through the server) and sits people round it.
// A place, not a table waiting for a game.
PLACEHOLDERS.firepit = (ctx) => {
  const firepit = buildFirepit(ctx);
  return { npcs: [], noSign: true, place: true, letter: 'light the firepit and pull up a chair', firepit, keepOut: firepit.keepOut };
};

// The picnic area, its own block, built by picnic-build.js. A place, not a table waiting for a game.
PLACEHOLDERS.picnic = (ctx) => buildPicnic(ctx);

PLACEHOLDERS.dock = dockPlaceholder; // lives in dock.js (Kevin, the rod, the fishing water)

PLACEHOLDERS.flowers = ({ b, x, z, rnd, colliders }) => {
  const y = terrainHeight(x, z);
  // a trellis arch with climbing roses and a birdbath
  for (const s of [-1, 1]) {
    b.add(GEO.box, '#ffffff', { x: x + s * 1.2, y: y + 1.2, z: z + 2, sx: 0.1, sy: 2.4, sz: 0.4 });
    colliders.push({ type: 'circle', x: x + s * 1.2, z: z + 2, r: 0.3 });
  }
  b.add(new THREE.TorusGeometry(1.2, 0.07, 6, 16, Math.PI), '#ffffff', { x, y: y + 2.4, z: z + 2 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 15) * Math.PI;
    b.add(GEO.ico1, i % 3 ? '#4f9a3e' : '#ff6f91', { x: x + Math.cos(a) * 1.2, y: y + 2.4 + Math.sin(a) * 1.2, z: z + 2, sx: 0.2, sy: 0.2, sz: 0.2 });
  }
  b.add(GEO.cyl8, '#d8d4c8', { x, y: y + 0.45, z: z - 1, sx: 0.15, sy: 0.9, sz: 0.15 });
  b.add(GEO.cyl12, '#d8d4c8', { x, y: y + 0.95, z: z - 1, sx: 0.6, sy: 0.12, sz: 0.6 });
  b.add(GEO.cyl12, '#8fd3e8', { x, y: y + 1.02, z: z - 1, sx: 0.5, sy: 0.02, sz: 0.5 });
  colliders.push({ type: 'circle', x, z: z - 1, r: 0.6 });
  // two lawn chairs facing the birdbath, for whoever wants to sit
  for (const [cx, cz, col] of [[x - 2.6, z - 3.2, '#3f8fd9'], [x + 2.6, z - 3.2, '#e0463c']]) {
    const cy = terrainHeight(cx, cz), yaw = Math.atan2(x - cx, (z - 1) - cz);
    b.add(GEO.box, col, { x: cx, y: cy + 0.27, z: cz, sx: 0.6, sy: 0.06, sz: 0.6, ry: yaw }); // (seat-height: the top 0.3 up, was 0.37)
    b.add(GEO.box, col, { x: cx - Math.sin(yaw) * 0.28, y: cy + 0.55, z: cz - Math.cos(yaw) * 0.28, sx: 0.6, sy: 0.55, sz: 0.06, ry: yaw, rx: -0.2 });
    for (const k of [-0.25, 0.25]) b.add(GEO.box, '#f4f2ea', { x: cx + Math.cos(yaw) * k, y: cy + 0.12, z: cz - Math.sin(yaw) * k, sx: 0.05, sy: 0.24, sz: 0.55, ry: yaw });
    colliders.push({ type: 'circle', x: cx, z: cz, r: 0.4 });
    addSeat(cx, cz, cy + 0.3, yaw, 'lawn chair');
  }
  return { npcs: [] };
};

// ------------------------------------------------------------------ build

export function buildAreas(parent, config) {
  const group = new THREE.Group();
  group.name = 'areas';
  parent.add(group);
  const b = new Batcher({ vertexColors: true });
  const colliders = [];
  const updaters = [];
  const areas = [];
  const gamesBySlot = Object.fromEntries(config.games.filter(g => g.slot).map(g => [g.slot, g])); // (store-only games have no slot: game-store.js)
  for (const slot of config.slots) {
    const game = gamesBySlot[slot.id] || null;
    const rnd = mulberry32(slot.x * 1000 + slot.z);
    const ctx = { b, group, x: slot.x, z: slot.z, rnd, colliders, updaters };
    let spec;
    if (game) {
      spec = (THEMES[game.theme] || THEMES.generic)(ctx);
      colliders.push({ type: 'circle', x: slot.x, z: slot.z, r: spec.tableR });
      // after dark the rainbow plaza glows softly pink, like the sparkles are lighting it (its source is the sparkles all round it:
      // `spread`, how far off they are, for fire-season's check that every light has a source)
      if (game.theme === 'unicorns') addNightSpot({ x: slot.x, y: terrainHeight(slot.x, slot.z) + 1.5, z: slot.z, color: '#ff9ad8', pool: 6.4, poolK: 0.62, halo: 0, spread: 6 });
      // name board at the edge of the plaza, facing the house
      const toHouse = Math.atan2(0 - slot.x, -8 - slot.z);
      addSign(group, slot.x + Math.sin(toHouse) * 6.4, slot.z + Math.cos(toHouse) * 6.4, toHouse, // 6.4: clear of the ring path round the plaza
        [game.name], game.theme === 'arkham' ? { bg: '#2a2530', fg: '#e8d9b0', font: 'Special Elite' } : game.theme === 'unicorns' ? { bg: '#ff8fb8', fg: '#ffffff' } : undefined, colliders);
    } else {
      spec = (PLACEHOLDERS[slot.placeholder] || PLACEHOLDERS.flowers)(ctx);
      const toHouse = Math.atan2(0 - slot.x, -8 - slot.z);
      const sg = spec.sign; // a placeholder may say where its sign goes (the picnic's sits by the blanket)
      if (!spec.noSign) addSign(group, sg ? sg.x : slot.x + Math.sin(toHouse) * 5.5, sg ? sg.z : slot.z + Math.cos(toHouse) * 5.5, sg ? sg.yaw : toHouse, [slot.name, spec.signLine || 'a game is coming soon'], undefined, colliders);
    }
    areas.push({
      id: slot.id, slot, game, x: slot.x, z: slot.z,
      radius: 7, promptR: game ? 4.2 : 3.4, statsR: 9,
      theme: game ? (game.theme || 'generic') : slot.placeholder,
      tableR: spec.tableR || 0,
      place: !!spec.place, letter: spec.letter || null, // a place in its own right (the dock): no coming-soon label, prompt or toast
      keepOut: spec.keepOut || 0, // metres round the centre the people and dogs of npcs.js keep out of (the firepit's ring of seats)
      lawnR: spec.lawnR || 0, // metres round the centre no tree of the woods stands on (the unicorns' lawn in the woods corner; main.js)
      rect: spec.rect || null, // a block instead of the round plaza (the garden: no grass or trees in it, main.js isClear)
      keepOuts: spec.keepOuts || null, // more discs the NPCs keep out of (the picnic's tables: npcs.js nav.keepOuts)
      navWalk: spec.navWalk || null, // points only in the NPC trail graph (the picnic's stroll: npcs.js NavGraph)
      npcSpec: spec,
    });
  }
  b.build(group, 'areas');
  shadows(group);

  // decorative wildlife: ducks on the lagoon and gulls over the sea
  const duckGroup = new THREE.Group();
  const ducks = [];
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Group();
    const duckBody = new THREE.Mesh(GEO.sphere, toon(i === 0 ? '#6b4a2b' : '#fff27a'));
    duckBody.scale.set(0.22, 0.16, 0.3);
    d.add(duckBody);
    const head = new THREE.Mesh(GEO.sphere, toon(i === 0 ? '#2f7a4a' : '#fff27a'));
    head.scale.setScalar(0.12); head.position.set(0, 0.16, 0.2);
    const beak = new THREE.Mesh(GEO.cone6, toon('#ff9f43'));
    beak.scale.set(0.05, 0.1, 0.04); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.15, 0.34);
    d.add(head, beak);
    d.userData = { cx: 20 + i * 1.2, cz: 12 + (i % 2), r: 2 + i * 0.6, sp: 0.25 + i * 0.03, ph: i * 1.3 };
    ducks.push(d); duckGroup.add(d);
  }
  const gulls = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const wingL = new THREE.Mesh(GEO.box, toon('#ffffff')); wingL.scale.set(0.9, 0.04, 0.3); wingL.position.x = 0.45;
    const wingR = wingL.clone(); wingR.position.x = -0.45;
    const body = new THREE.Mesh(GEO.sphere, toon('#f3f3f3')); body.scale.set(0.14, 0.12, 0.35);
    g.add(wingL, wingR, body);
    g.userData = { wingL, wingR, cx: 80 + (i % 3) * 20, cz: -30 + i * 12, r: 12 + i * 3, h: 14 + i * 2, sp: 0.18 + i * 0.02, ph: i };
    gulls.push(g); duckGroup.add(g);
  }
  group.add(duckGroup);
  updaters.push((dt, t) => {
    for (const d of ducks) {
      const u = d.userData, a = t * u.sp + u.ph;
      d.position.set(u.cx + Math.cos(a) * u.r, 0.05 + Math.sin(t * 2 + u.ph) * 0.02, u.cz + Math.sin(a) * u.r);
      d.rotation.y = -a;
    }
    for (const g of gulls) {
      const u = g.userData, a = t * u.sp + u.ph;
      g.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(t * 0.7 + u.ph) * 1.5, u.cz + Math.sin(a) * u.r);
      g.rotation.y = -a;
      g.rotation.z = -0.25;
      const flap = Math.sin(t * 5 + u.ph) * 0.35;
      u.wingL.rotation.z = flap; u.wingR.rotation.z = -flap;
    }
  });

  return { group, areas, colliders, updaters };
}

