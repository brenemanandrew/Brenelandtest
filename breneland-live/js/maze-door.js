// Beneath Angell Street: the door in the Lovecraft house's hall on a day it's open, so you can tell the game is on. Atmospheric
// but kid-safe. Made by maze.js (createMazeDoor). Everything here shows only on an open day (maze.js isOpen), and a closed day is
// the ordinary locked door:
//
//   the door      a cold pale-green light from under the door and round its latch edge, flickering slowly, now and then a shadow
//                 passing along the gap (something on the other side); the keyhole glowing; fresh scratches gouged in the paint
//                 (a canvas decal); the door shifting in its frame against the latch now and then, more often when you're close.
//                 The leaf is our own copy, a little proud of the house's merged door (which cannot move), shown on open days only.
//                 A real light: one NIGHT_SPOT at the door's foot (main.js parks one of its four lamp lights on it, by day too)
//   the mist      a cold low mist seeping from under the door a couple of metres across the hall floor, curling round your feet,
//                 green near the gap (one instanced mesh, moved by its shader; nothing on the CPU a frame)
//   the hall      the hall's lamps dimmed and guttering, the fill light lower while you're downstairs (a frameHooks hook after
//                 daynight.js has set it), the grandfather clock stopped (its pendulum still, its hands at a minute to twelve, the
//                 house's slow tick silent: audio.js `tb.stopped`), your breath showing near the door, a candle guttering on the
//                 newel post at the top of the stair. On a closed day the pendulum swings and the hands keep the hour.
//   the sound     at the door, on the Ambience bus: a low draft moaning through the gap, scratching from the other side, a wordless
//                 whisper (breath and hush) as you come near, a drip far below, the latch rattling. Outside, the draft at a grate.
//   outside       a green glow at two cellar grates in the foundation (the front, left of the porch, and the east side under the
//                 door) with a little mist creeping from them; the first time you step into the hall that day a one-line notice;
//                 a Quests line while the door is open.
//   the reach     (lovecraft-setpiece, Andrew: "If a player is within range of it a tentacle or a ghoulish arm will reach out from
//                 the door and slowly slide back in") every 16 s slot of the shared clock, if anyone stands near the door, the leaf
//                 is pushed ajar and a creature (the slot's hash picks the tentacle or the arm: every client sees the same one at the
//                 same moment) reaches out of the gap slowly, feels about, slides back in; the leaf knocks shut with a rattle. The
//                 creatures are Blender rigs (maze-reach.js, public/models/reach.json), one SkinnedMesh each, loaded the first open
//                 day the door is built. A wet slither and the hinge's creak on the Ambience bus.
//   settings      Fast keeps the light strip, the keyhole and the grates and drops the mist; reduced motion: no rattle, no flicker.
//
// Pools only, no per-frame allocation: 12 breath puffs, the mist's fixed instances, a handful of glow points.
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { LAYER_SOFT, GRADIENT_3 } from './toon.js';
import { GFX } from './gfx.js';
import { LIGHT, LAMPS, NIGHT_SPOTS } from './daynight-mats.js';
import { frameHooks } from './perf-flags.js';
import { easternDay } from './wreath-data.js';
import { mulberry32, hash01 } from './util.js';
import { loadReach, buildCreature } from './maze-reach.js'; // (lovecraft-setpiece) the tentacle and the ghoulish arm that reach out of the gap
import { LEAF_W, LEAF_H, LEAF_Z, REACH_AT, REACH_LEAF, REACH_SLOT } from './maze-door-plan.js'; // (lovecraft-review) the leaf's and the reach's numbers, shared with tools/lovecraft-review-reach-sweep.mjs
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';

const GREEN = '#9cffe6', GREEN_DEEP = '#38f0c0', LIGHT_COL = '#74ffd8'; // (a cold green leaning to cyan: added over the hall's red and gold a warmer green turned yellow)
export const NOTICE = 'The door under the stairs is open today... Something stirs down there.';
const QUEST = { title: 'The door is open', text: 'Under the stairs in the Lovecraft house. Something stirs below...', prio: 0, color: '#6fe0a8' };
// (LEAF_W, LEAF_H, LEAF_Z, REACH_AT and REACH_LEAF: maze-door-plan.js, shared with the reach's sweep)
const STOP_AT = 11 + 59 / 60;                         // the stopped clock: a minute to twelve
const DOOR_REACH = 4.5, LAMP_REACH = 26;             // the door's light's reach; main.js's lamp lights' own (THREE.PointLight(..., 26, 2))

// ---- noise: smooth and never periodic (a value noise on a hashed lattice, as maze-fx.js)
function hash1(i) { let x = Math.imul((i | 0) ^ 0x5bd1e995, 0x27d4eb2d); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
function vnoise(t, seed) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), s = Math.imul(seed | 0, 7919); const a = hash1(i + s), b = hash1(i + 1 + s); return a + (b - a) * u; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const REACH_NEAR = 3.4; // how near someone must stand for a reach (the spot in front of the door); REACH_SLOT (ms between chances) is maze-door-plan.js's
const soft = o => { o.layers.set(LAYER_SOFT); return o; };

// ---- the scratches: fresh gouges in the paint, the raw wood pale in a dark groove (plain strokes, no canvas filters)
function scratchTexture() {
  const W = 256, H = 612, PX = 258; // the leaf is 0.99 x 2.37 m
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.lineCap = 'round';
  const rnd = mulberry32(4541890);
  const gouge = (x0, y0, x1, y1, bend, w) => {
    const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend, N = 14;
    const at = t => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1];
    for (const [col, k] of [['rgba(168,124,88,0.95)', 1], ['rgba(98,62,40,0.95)', 0.6], ['rgba(26,12,8,0.9)', 0.25]]) {
      g.strokeStyle = col;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, [ax, ay] = at(t0), [bx, by] = at(t1);
        g.lineWidth = Math.max(0.6, w * k * Math.sin(Math.PI * (t0 + t1) / 2) ** 0.7);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
  };
  // a set of claw marks: n parallel gouges, a little ragged
  const claws = (cx, cy, ang, len, n, gap, w, bend) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * gap, l = len * (0.8 + rnd() * 0.3), s = (rnd() - 0.5) * 8;
      const x0 = cx + px * o - dx * l / 2 + dx * s, y0 = cy + py * o - dy * l / 2 + dy * s;
      gouge(x0, y0, x0 + dx * l, y0 + dy * l, bend + (rnd() - 0.5) * 0.06, w * (0.8 + rnd() * 0.4));
    }
  };
  const y = m => H - m * PX; // metres above the floor -> canvas y
  claws(118, y(0.85), 1.05, 150, 4, 15, 6, 0.08);   // across the lower panel, top-left to bottom-right
  claws(196, y(1.28), 1.35, 120, 3, 13, 5, -0.05);  // by the latch
  claws(84, y(0.32), 0.25, 95, 4, 12, 5, 0.04);     // low, near the floor
  claws(150, y(1.95), 1.2, 80, 3, 11, 4, 0.06);     // up by the top panel
  for (let i = 0; i < 26; i++) { const x = 8 + rnd() * (W - 16), yy = y(0.05 + rnd() * 0.5), a = rnd() * Math.PI, l = 6 + rnd() * 14; gouge(x, yy, x + Math.cos(a) * l, yy + Math.sin(a) * l, 0, 2.5); } // nicks along the bottom
  for (let i = 0; i < 9; i++) { const x = W - 4 - rnd() * 22, yy = y(0.7 + rnd() * 0.9), l = 8 + rnd() * 18; gouge(x, yy, x - l, yy + (rnd() - 0.5) * 6, 0, 3); } // the latch edge chewed
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// the keyhole: a round top and a flared slot, white on clear (tinted green by its material)
function keyholeTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff';
  g.beginPath(); g.arc(16, 20, 9, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(12, 24); g.lineTo(20, 24); g.lineTo(24, 54); g.lineTo(8, 54); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- the mist: camera-facing puffs moved by the shader (each creeps out from its origin along its way, spreads, rises a touch,
// fades in and out over its life, and curls away round your feet); faded out where it meets the floor
const MIST_VS = /* glsl */`
  attribute vec3 aOrg; attribute vec4 aDir; attribute vec4 aSeed;
  uniform float uTime, uK, uFeetR; uniform vec3 uFeet;
  varying vec2 vUv; varying float vA, vNear, vY, vS;
  void main() {
    float t = fract(uTime * aSeed.y + aSeed.x);
    float d = t * aDir.z;
    vec2 dir = aDir.xy, side = vec2(-dir.y, dir.x);
    vec2 p = aOrg.xz + dir * d + side * (aSeed.z * (0.12 + d * 0.5) + 0.14 * sin(uTime * 0.45 + aSeed.x * 17.0) * t);
    vec2 r = p - uFeet.xz; float rl = length(r) + 0.001, f = (1.0 - smoothstep(0.0, uFeetR, rl)) * step(abs(uFeet.y - aOrg.y), 1.2);
    p += (r / rl) * f * 0.42 + vec2(-r.y, r.x) / rl * f * 0.32;
    float s = aSeed.w * (0.5 + 0.85 * t);
    vec3 c = vec3(p.x, aOrg.y + s * 0.16 + aDir.w * t, p.y);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 w = c + right * position.x * s + up * position.y * s * 0.5;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    vUv = uv; vY = w.y; vS = aSeed.x;
    vA = sin(3.14159 * t) * uK * (1.0 - f * 0.35) * smoothstep(0.35, 1.6, -mv.z); // (thin right in front of the camera)
    vNear = exp(-d * 1.3);
  }`;
const MIST_FS = /* glsl */`
  uniform vec3 uCol, uColFar; uniform float uY0;
  varying vec2 vUv; varying float vA, vNear, vY, vS;
  void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    float a = 1.0 - smoothstep(0.1, 1.0, r); a *= a;
    a *= 0.72 + 0.28 * sin(q.x * 3.3 + q.y * 2.1 + vS * 40.0);
    a *= vA * smoothstep(uY0, uY0 + 0.14, vY);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uColFar, uCol, vNear), a);
  }`;
function makeMist(n, emit, { y0, col, far }) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const org = new Float32Array(n * 3), dir = new Float32Array(n * 4), seed = new Float32Array(n * 4);
  const rnd = mulberry32(1890 + n);
  for (let i = 0; i < n; i++) { const e = emit(i, rnd); org.set(e.org, i * 3); dir.set(e.dir, i * 4); seed.set([i / n + rnd() * 0.05, e.speed, (rnd() - 0.5) * 2, e.size], i * 4); }
  g.setAttribute('aOrg', new THREE.InstancedBufferAttribute(org, 3)); g.setAttribute('aDir', new THREE.InstancedBufferAttribute(dir, 4)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(org[0], org[1], org[2]), 6);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uFeet: { value: new THREE.Vector3(0, -99, 0) }, uFeetR: { value: 0.85 }, uY0: { value: y0 }, uCol: { value: new THREE.Color(col) }, uColFar: { value: new THREE.Color(far) } },
    vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, fog: false,
    // (the lagoon mist's blending: the colour over what is behind, its alpha thinned so the ink behind softens too: toon.js)
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const m = soft(new THREE.Mesh(g, mat)); m.renderOrder = 3; m.frustumCulled = false; m.name = 'maze-door-mist';
  return m;
}

// ---- glow points: soft round halos (the keyhole, the gap's bloom, the candle, the grates), alpha and size per point each frame
function makeGlows(n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), a = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aA', new THREE.BufferAttribute(a, 1));
  g.attributes.aA.setUsage(THREE.DynamicDrawUsage); g.attributes.aSize.setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aSize, aA; uniform float uScale; varying vec3 vC; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vC = aCol; vA = aA; gl_PointSize = clamp(aSize * uScale / max(0.3, -mv.z), 0.0, 280.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q); if (r > 1.0 || vA < 0.002) discard; float k = pow(1.0 - r, 2.2) * 0.8 + (1.0 - smoothstep(0.08, 0.2, r)) * 0.4; gl_FragColor = vec4(vC * k * vA, 1.0); }`,
  });
  const p = soft(new THREE.Points(g, mat)); p.frustumCulled = false; p.renderOrder = 4;
  const c = new THREE.Color();
  return { p, set(i, x, y, z, color, s) { pos.set([x, y, z], i * 3); c.set(color); col.set([c.r, c.g, c.b], i * 3); size[i] = s; g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; }, a, size, dirty() { g.attributes.aA.needsUpdate = true; g.attributes.aSize.needsUpdate = true; } };
}

export function createMazeDoor(ctx, { isOpen, house, u: DOOR_U = 2.9 }) {
  const { player, ui, audio, camera } = ctx;
  const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!mql?.matches;
  let B = null;            // the pieces, built the first frame the house exists
  let open = null, t = 0, last = null;
  const S = { hall: 0, k: 1, pass: 9, passT: 12, rattleT: 6, rattle: 0, leafPeak: 0, rattleAmp: 0, rattles: 0, flare: 0, near: 99, inside: false, inHall: false, downstairs: false, breathT: 1.5, noticed: false, lampK: 1 };
  const sky = { hemi: null, hemiK: 1 };
  const RE = { on: false, t: 0, creature: null, which: null, slot: -1, built: null, loading: false, count: 0, leaf: 0 }; // the reach
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector2();

  function build(lc) {
    const P = lc.plan, built = lc.built, X = u => P.HX + u, Z = v => P.HZ + v;
    const wallZ = Z(P.BV + 0.1), dx = X(DOOR_U), y0 = P.FY;
    const inner = new THREE.Group(); inner.name = 'maze-door'; built.inside.add(inner);
    const outer = new THREE.Group(); outer.name = 'maze-door-out'; built.root.add(outer);
    const clockG = new THREE.Group(); clockG.name = 'maze-door-clock'; built.inside.add(clockG);

    // ---- the leaf: a copy of the house's door, a little proud of it, hinged on the west post (the latch is east)
    const pivot = new THREE.Group(); pivot.position.set(dx - LEAF_W / 2, y0, wallZ + LEAF_Z); inner.add(pivot);
    const lb = new Batcher({ vertexColors: true, castShadow: false });
    lb.add(GEO.box, '#5a3424', { x: LEAF_W / 2, y: 0.025 + LEAF_H / 2, z: 0.01, sx: LEAF_W, sy: LEAF_H, sz: 0.02 });
    for (const yy of [0.6, 1.7]) lb.add(GEO.box, '#7a5236', { x: LEAF_W / 2, y: yy, z: 0.0275, sx: 0.7, sy: 0.8, sz: 0.015 });
    lb.add(GEO.cyl8, '#c9a24a', { x: LEAF_W / 2 + 0.38, y: 1.1, z: 0.035, sx: 0.012, sy: 0.03, sz: 0.012, rx: Math.PI / 2 });
    lb.add(GEO.sphere, '#c9a24a', { x: LEAF_W / 2 + 0.38, y: 1.1, z: 0.06, sx: 0.034, sy: 0.034, sz: 0.03 });
    lb.add(GEO.box, '#5e4a24', { x: LEAF_W / 2 + 0.38, y: 0.965, z: 0.023, sx: 0.055, sy: 0.12, sz: 0.008 }); // the escutcheon (tarnished)
    lb.build(pivot, 'maze-door-leaf');
    // the house's own door is hidden while this leaf hangs (setOpen). Behind the leaf, the dark of the stair beyond: what shows at
    // the latch edge as the leaf rattles out
    const behind = new THREE.Mesh(new THREE.PlaneGeometry(LEAF_W + 0.02, LEAF_H + 0.02), new THREE.MeshBasicMaterial({ color: '#030405', fog: false }));
    behind.position.set(dx, y0 + 0.025 + LEAF_H / 2, wallZ + 0.012); behind.name = 'maze-door-dark'; inner.add(behind);
    const decalMat = new THREE.MeshToonMaterial({ map: scratchTexture(), transparent: true, depthWrite: false, gradientMap: GRADIENT_3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const decal = soft(new THREE.Mesh(new THREE.PlaneGeometry(LEAF_W, LEAF_H), decalMat)); decal.position.set(LEAF_W / 2, 0.025 + LEAF_H / 2, 0.0365); decal.name = 'maze-door-scratches'; pivot.add(decal);
    const keyMat = new THREE.MeshBasicMaterial({ map: keyholeTexture(), color: GREEN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const keyhole = soft(new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.06), keyMat)); keyhole.position.set(LEAF_W / 2 + 0.38, 0.962, 0.0275); keyhole.name = 'maze-door-keyhole'; pivot.add(keyhole);

    // ---- the light from the gap: the floor's spill, the strip under the door, the latch edge and the top (one mesh, one draw)
    const gp = [], ga = [], gi = [];
    const quad = (a, b, c, d, ka, kb, kc, kd) => { const o = gp.length / 3; gp.push(...a, ...b, ...c, ...d); ga.push(...ka, ...kb, ...kc, ...kd); gi.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    const fy = y0 + 0.007, z0 = wallZ + 0.1, z1 = wallZ + 2.0;
    quad([dx - 1.05, fy, z1], [dx + 1.05, fy, z1], [dx + 1.05, fy, z0], [dx - 1.05, fy, z0], [0, -1.05, 1.9], [0, 1.05, 1.9], [0, 1.05, 0], [0, -1.05, 0]);
    const sz = wallZ + LEAF_Z - 0.004;
    quad([dx - 0.5, y0 + 0.001, sz], [dx + 0.5, y0 + 0.001, sz], [dx + 0.5, y0 + 0.03, sz], [dx - 0.5, y0 + 0.03, sz], [1, -0.5, 0], [1, 0.5, 0], [1, 0.5, 1], [1, -0.5, 1]);
    const ez = wallZ + 0.136, ex = dx + LEAF_W / 2;
    quad([ex - 0.016, y0 + 0.03, ez], [ex + 0.016, y0 + 0.03, ez], [ex + 0.016, y0 + 2.39, ez], [ex - 0.016, y0 + 2.39, ez], [2, -1, 0], [2, 1, 0], [2, 1, 1], [2, -1, 1]);
    quad([dx - 0.5, y0 + 2.378, ez], [dx + 0.5, y0 + 2.378, ez], [dx + 0.5, y0 + 2.41, ez], [dx - 0.5, y0 + 2.41, ez], [2, -1, 0.5], [2, -1, 0.5], [2, 1, 0.5], [2, 1, 0.5]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); geo.setAttribute('aG', new THREE.Float32BufferAttribute(ga, 3)); geo.setIndex(gi); geo.computeBoundingSphere();
    const gapU = { uK: { value: 0 }, uPass: { value: 9 }, uFlare: { value: 0 }, uCol: { value: new THREE.Color(GREEN) } };
    const gap = soft(new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: gapU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, forceSinglePass: true,
      vertexShader: /* glsl */`attribute vec3 aG; varying vec3 vG; void main() { vG = aG; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uK, uPass, uFlare; uniform vec3 uCol; varying vec3 vG;
        void main() {
          float x = vG.y, a;
          float shade = 1.0 - 0.85 * exp(-pow((x - uPass) / 0.2, 2.0)); // something passing along the other side
          if (vG.x < 0.5) { float d = vG.z, w = 0.4 + d * 0.5; a = exp(-d * 2.3) * (1.0 - smoothstep(w, w + 0.3 + d * 0.45, abs(x))) * 0.42 * mix(1.0, shade, exp(-d * 1.4)); }
          else if (vG.x < 1.5) { a = (1.3 + 0.6 * vG.z) * shade * (1.0 - smoothstep(0.44, 0.5, abs(x))); }
          else { float c = 1.0 - abs(x); a = c * c * (0.45 + uFlare * 1.2); }
          gl_FragColor = vec4(uCol * a * uK, 1.0);
        }`,
    })));
    gap.name = 'maze-door-gap'; gap.renderOrder = 3; inner.add(gap);

    // ---- glows: the keyhole's halo, the gap's bloom, the candle on the newel post (flame and halo), and the two grates outside
    const gl = makeGlows(4); gl.p.name = 'maze-door-glows'; inner.add(gl.p);
    const kx = dx + 0.38, ky = y0 + 0.962, kz = wallZ + LEAF_Z + 0.03;
    gl.set(0, kx, ky, kz, GREEN_DEEP, 0.14);
    gl.set(1, dx, y0 + 0.07, wallZ + 0.22, GREEN_DEEP, 0.7);
    const nx = X(P.ST.u0) + 0.06, nz = Z(P.ST.vTop), ny = P.UY + 1.0;
    gl.set(2, nx, ny + 0.165, nz, '#ffe2a0', 0.05);
    gl.set(3, nx, ny + 0.17, nz, '#ffb85a', 0.42);
    const candle = new Batcher({ vertexColors: true, castShadow: false });
    candle.add(GEO.cyl12, '#c9a24a', { x: nx, y: ny + 0.012, z: nz, sx: 0.055, sy: 0.022, sz: 0.055 });
    candle.add(GEO.cyl8, '#efe6cf', { x: nx, y: ny + 0.08, z: nz, sx: 0.022, sy: 0.12, sz: 0.022 });
    candle.add(GEO.cone6, '#ffe7a8', { x: nx, y: ny + 0.165, z: nz, sx: 0.012, sy: 0.04, sz: 0.012 });
    candle.build(inner, 'maze-door-candle');

    // ---- the mist from under the door, into the hall (not on Fast)
    const mist = makeMist(GFX.cls === 'phone' ? 14 : 22, (i, rnd) => {
      const a = (rnd() - 0.5) * 1.1, riser = i % 3 === 0; // (a third curl up the face of the door before they fall away: seen from a standing view)
      if (riser) return { org: [dx + (rnd() - 0.5) * 0.7, y0 + 0.02, wallZ + 0.16], dir: [Math.sin(a) * 0.5, 1, 0.35 + rnd() * 0.5, 0.45 + rnd() * 0.45], speed: 1 / (7 + rnd() * 5), size: 0.45 + rnd() * 0.3 };
      return { org: [dx + (rnd() - 0.5) * 0.85, y0 + 0.02, wallZ + 0.14], dir: [Math.sin(a), Math.cos(a), 1.5 + rnd() * 1.4, 0.04 + rnd() * 0.08], speed: 1 / (10 + rnd() * 7), size: 0.65 + rnd() * 0.5 };
    }, { y0: y0 + 0.004, col: '#bff7da', far: '#c9d6dc' });
    inner.add(mist);

    // ---- breath: a puff or two when you are near the door (pooled points, normal blending, on the CPU: twelve at most)
    const NB = 12, bPos = new Float32Array(NB * 3), bA = new Float32Array(NB), bS = new Float32Array(NB);
    const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute('aA', new THREE.BufferAttribute(bA, 1)); bGeo.setAttribute('aSize', new THREE.BufferAttribute(bS, 1));
    for (const k of ['position', 'aA', 'aSize']) bGeo.attributes[k].setUsage(THREE.DynamicDrawUsage);
    const breathU = { uScale: { value: 600 } };
    const breath = soft(new THREE.Points(bGeo, new THREE.ShaderMaterial({
      uniforms: breathU, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`attribute float aA, aSize; uniform float uScale; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vA = aA * smoothstep(0.1, 0.3, d); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(d, 0.1), 1.0, 300.0); }`,
      fragmentShader: /* glsl */`varying float vA; void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r >= 1.0 || vA < 0.002) discard; gl_FragColor = vec4(0.86, 0.9, 0.94, vA * pow(1.0 - r, 1.6)); }`,
    })));
    breath.frustumCulled = false; breath.renderOrder = 3; breath.name = 'maze-door-breath'; inner.add(breath);
    const puffs = Array.from({ length: NB }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1.6, a: 0.1 }));

    // ---- the clock: a pendulum and two hands of our own on the house's grandfather clock (it faces east, into the hall)
    const cx = X(P.PU + 0.08 + 0.3), cz = Z(0.75);
    const pend = new THREE.Group(); pend.position.set(cx + 0.29, y0 + 1.36, cz); clockG.add(pend);
    const pb = new Batcher({ vertexColors: true, castShadow: false });
    pb.add(GEO.box, '#b08a3a', { y: -0.19, sx: 0.008, sy: 0.38, sz: 0.012 });
    pb.add(GEO.cyl12, '#d9b25a', { y: -0.4, sx: 0.06, sy: 0.014, sz: 0.06, rz: Math.PI / 2 });
    pb.build(pend, 'maze-door-pendulum');
    const hands = [0.075, 0.115].map((len, i) => { const h = new THREE.Group(); h.position.set(cx + 0.283 + i * 0.004, y0 + 1.85, cz); clockG.add(h); const hb = new Batcher({ vertexColors: true, castShadow: false }); hb.add(GEO.box, '#1c140f', { y: len / 2 - 0.012, sx: 0.004, sy: len, sz: i ? 0.008 : 0.012 }); hb.build(h, 'maze-door-hand'); return h; });

    // ---- outside: two cellar grates glowing green in the foundation (the front, left of the porch; the east side, under the door),
    // their light on the lawn in front, a halo at each, a mist creeping along the foundation (not on Fast) and crows circling the roof
    const glowMat = new THREE.MeshBasicMaterial({ color: GREEN, fog: true }); glowMat.name = 'maze-door-grate-glow';
    const ob = new Batcher({ vertexColors: true, castShadow: false });
    const grates = [{ x: X(0.75), z: Z(P.HD) + 0.08, nx: 0, nz: 1 }, { x: X(P.HW) + 0.08, z: Z(-0.6), nx: 1, nz: 0 }];
    const gy = P.TY + 0.36, GW = 0.78, GH = 0.36;
    const sp = [], sa = [], si = [];
    for (const g of grates) {
      const tx = g.nz, tz = -g.nx, ry = Math.atan2(g.nx, g.nz); // along the wall, and the yaw that faces out
      const at = (a, o) => [g.x + tx * a + g.nx * o, g.z + tz * a + g.nz * o];
      ob.add(GEO.box, glowMat, { x: g.x + g.nx * 0.004, y: gy, z: g.z + g.nz * 0.004, sx: GW - 0.06, sy: GH - 0.06, sz: 0.004, ry });
      for (const yy of [GH / 2, -GH / 2]) ob.add(GEO.box, '#2a2a30', { x: g.x + g.nx * 0.02, y: gy + yy, z: g.z + g.nz * 0.02, sx: GW + 0.06, sy: 0.05, sz: 0.04, ry });
      for (let k = -3; k <= 3; k++) { const [x, z] = at(k * GW / 7, 0.026); ob.add(GEO.box, '#2a2a30', { x, y: gy, z, sx: 0.026, sy: GH, sz: 0.026, ry }); }
      for (const s2 of [-1, 1]) { const [x, z] = at(s2 * (GW / 2 + 0.01), 0.02); ob.add(GEO.box, '#2a2a30', { x, y: gy, z, sx: 0.05, sy: GH + 0.08, sz: 0.04, ry }); }
      // the light on the ground in front of it (the gap's shader: kind 0, across and out in metres)
      const o = sp.length / 3, yl = P.TY + 0.012;
      for (const [a, d] of [[-1.3, 1.6], [1.3, 1.6], [1.3, 0.02], [-1.3, 0.02]]) { const [x, z] = at(a, d + 0.08); sp.push(x, yl, z); sa.push(0, a, d); }
      si.push(o, o + 1, o + 2, o, o + 2, o + 3);
      g.tx = tx; g.tz = tz;
    }
    ob.build(outer, 'maze-door-grates');
    const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sGeo.setAttribute('aG', new THREE.Float32BufferAttribute(sa, 3)); sGeo.setIndex(si); sGeo.computeBoundingSphere();
    const spill = soft(new THREE.Mesh(sGeo, gap.material)); spill.name = 'maze-door-grate-spill'; spill.renderOrder = 3; outer.add(spill);
    const og = makeGlows(2); og.p.name = 'maze-door-grate-glows'; outer.add(og.p);
    grates.forEach((g, i) => og.set(i, g.x + g.nx * 0.14, gy, g.z + g.nz * 0.14, GREEN_DEEP, 1.3));
    // the mist: along the whole front and the east side, heaviest at the grates, rolling out over the lawn
    const omist = makeMist(GFX.cls === 'phone' ? 18 : 30, (i, rnd) => {
      const east = i % 3 === 2, g = grates[east ? 1 : 0], a = (rnd() - 0.5) * 1.4;
      const along = east ? (rnd() - 0.5) * 5 : (rnd() < 0.5 ? (rnd() - 0.5) * 1.2 : -4.6 + rnd() * 9.6);
      return { org: [g.x + g.tx * along + g.nx * 0.15, P.TY + 0.02, g.z + g.tz * along + g.nz * 0.15], dir: [g.nx * Math.cos(a) + g.tx * Math.sin(a), g.nz * Math.cos(a) + g.tz * Math.sin(a), 2.4 + rnd() * 3.0, 0.25 + rnd() * 0.4], speed: 1 / (14 + rnd() * 9), size: 1.6 + rnd() * 1.2 };
    }, { y0: P.TY - 0.02, col: '#dcfff0', far: '#f4f8fa' });
    outer.add(omist);
    // the front door's sidelights and fanlight: a faint green from the hall behind them (seen from the street)
    const tint = new THREE.MeshBasicMaterial({ color: GREEN_DEEP, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }); tint.name = 'maze-door-glass-tint';
    const tb2 = new Batcher({ castShadow: false, receiveShadow: false }), fz = Z(P.HD);
    for (const sx of [-1, 1]) tb2.add(GEO.box, tint, { x: X(P.DOOR.u + sx * (P.DOOR.w / 2 + 0.16)), y: P.FY + 1.25, z: fz + 0.072, sx: 0.22, sy: 2.28, sz: 0.004 });
    tb2.add(GEO.box, tint, { x: X(P.DOOR.u), y: P.FY + P.DOOR.h + 0.25, z: fz + 0.082, sx: P.DOOR.w + 0.18, sy: 0.38, sz: 0.004 });
    for (const m of tb2.build(outer, 'maze-door-glass-tint')) { soft(m); m.renderOrder = 3; }
    // crows, three, circling over the roof (a body and two wings each, instanced: two draws)
    const crowMat = new THREE.MeshToonMaterial({ color: '#23232d', gradientMap: GRADIENT_3 });
    const bodyGeo = mergeGeometries([
      new THREE.SphereGeometry(1, 8, 6).scale(0.11, 0.1, 0.24), new THREE.SphereGeometry(0.075, 8, 6).translate(0, 0.05, 0.2),
      new THREE.ConeGeometry(0.03, 0.1, 5).rotateX(Math.PI / 2).translate(0, 0.04, 0.3), new THREE.BoxGeometry(0.14, 0.02, 0.16).translate(0, 0, -0.28)]);
    const crowBodies = new THREE.InstancedMesh(bodyGeo, crowMat, 3), crowWings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.02, 0.2).translate(0.23, 0, 0), crowMat, 6);
    for (const m of [crowBodies, crowWings]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; outer.add(m); }
    crowBodies.name = 'maze-door-crows'; crowWings.name = 'maze-door-crow-wings';
    const crows = [0, 1, 2].map(i => ({ r: 6 + i * 1.6, w: (0.32 - i * 0.05) * (i === 1 ? -1 : 1), ph: i * 2.1, h: P.EAVE + 3.2 + i * 1.3 }));

    // ---- the real light at the door's foot (main.js parks one of its lamp lights on it: by day too, `day`; `k` its strength)
    const light = { x: dx, y: y0 + 0.12, z: wallZ + 0.45, color: LIGHT_COL, pool: 0.001, gy: y0, halo: 0, flicker: 0, day: 1, k: 0.5 };
    // the hall's pendant (lovecraft-build.js: a spot at u 2.4, v 4.4) dims and gutters
    const pendant = built.lamps.find(s => Math.abs(s.x - X(2.4)) < 0.05 && Math.abs(s.z - Z(4.4)) < 0.05) || null;
    const lampLights = ctx.scene.children.filter(o => o.isPointLight && o.userData.lampLight);
    ctx.scene.traverse(o => { if (o.isHemisphereLight && !sky.hemi) sky.hemi = o; });
    const spot = { x: dx, z: wallZ + 0.95 };
    B = { P, X, Z, wallZ, dx, y0, inner, outer, clockG, pivot, decal, keyhole, keyMat, gap, gapU, gl, mist, breath, bPos, bA, bS, bGeo, breathU, puffs, pend, hands, glowMat, tint, og, omist, spill, crowBodies, crowWings, crows, grates, light, pendant, lampLights, spot,
      hall: { minX: X(P.PU), maxX: X(P.IU), minZ: Z(P.BV), maxZ: Z(P.HD) }, gratesAt: grates.map(g => ({ x: g.x + g.nx * 0.3, y: gy, z: g.z + g.nz * 0.3 })) };
  }

  function setOpen(on) {
    open = on;
    B.inner.visible = on; B.outer.visible = on;
    for (const m of house()?.built?.mazeDoor || []) m.visible = !on; // the house's own door, 1 cm behind the leaf
    const i = NIGHT_SPOTS.indexOf(B.light);
    if (on && i < 0) NIGHT_SPOTS.push(B.light); else if (!on && i >= 0) NIGHT_SPOTS.splice(i, 1);
    if (!on && B.pendant) B.pendant.k = 1;
    if (!on) for (const l of B.lampLights) if (l.userData.mzDoor) { l.distance = LAMP_REACH; l.userData.mzDoor = false; }
    const tb = audio?.tables?.find(q => q.theme === 'arkham'); if (tb) tb.stopped = on; // (the house's slow tick: silent while the door is open)
    if (on) ctx.quests?.set('maze-door', QUEST); else ctx.quests?.clear?.('maze-door');
    if (!on) sndStop();
    if (!on && RE.on) { RE.on = false; RE.leaf = 0; if (RE.creature) RE.creature.mesh.visible = false; }
  }

  // ---- the reach: the creatures (built once the model arrives), who is near, the start on a slot, the play
  function anyoneNear() {
    if (S.downstairs && S.near < REACH_NEAR) return true;
    const rem = ctx.remotes?.map;
    if (rem) for (const r of rem.values()) { const p = r.pos || r.root?.position || r.group?.position; if (p && Math.abs(p.y - B.y0) < 1.2 && Math.hypot(p.x - B.spot.x, p.z - B.spot.z) < REACH_NEAR) return true; }
    return false;
  }
  function reachBuild() {
    RE.loading = true;
    loadReach().then(d => {
      if (!d || !B) return;
      RE.built = { tentacle: buildCreature('tentacle'), arm: buildCreature('arm') };
      // the base behind the wall plane at the gap's side (by the latch), chest high, aimed out and east round the leaf's latch edge (the
      // leaf swings ajar on the west post): maze-door-plan.js REACH_AT, swept against the leaf by tools/lovecraft-review-reach-sweep.mjs
      for (const c of Object.values(RE.built)) if (c) { c.mesh.visible = false; c.mesh.position.set(B.dx + REACH_AT.x, B.y0 + REACH_AT.y, B.wallZ + REACH_AT.z); c.mesh.rotation.y = REACH_AT.yaw; B.inner.add(c.mesh); }
    });
  }
  function reachStart(slot, force) {
    const which = force || (hash01('lcreach', slot) < 0.5 ? 'tentacle' : 'arm'), c = RE.built?.[which];
    if (!c) return false;
    RE.on = true; RE.t = 0; RE.creature = c; RE.which = which; RE.count++;
    c.mesh.visible = true; c.play(0);
    if (snd.loops) reachSound(which);
    return true;
  }
  function reachUpdate(dt, reduced) {
    if (!RE.built) { if (!RE.loading) reachBuild(); return; }
    const slot = Math.floor(net().serverNow() / REACH_SLOT);
    if (!RE.on && slot !== RE.slot) { RE.slot = slot; if (!reduced && anyoneNear()) reachStart(slot); } // (reduced motion: the leaf holds still, so no reach)
    if (RE.on && reduced) { RE.on = false; RE.leaf = 0; RE.creature.mesh.visible = false; } // (reduced motion turned on mid-reach: the leaf holds still at once)
    if (!RE.on) return;
    RE.t += dt;
    const c = RE.creature, u = RE.t / c.length;
    c.play(RE.t);
    // the leaf: pushed ajar ahead of the creature, held, shut behind it
    RE.leaf = REACH_LEAF.max * REACH_LEAF.shape(u);
    if (RE.t >= c.length) { RE.on = false; RE.leaf = 0; c.mesh.visible = false; if (!reduced) { S.rattle = 0.42; S.rattleAmp = 0.012; S.rattles++; } if (snd.loops) rattleSound(1); } // the knock as it shuts
  }
  function reachSound(which) { // a wet slither out, then back (brown noise through a bandpass swept up and down), the hinge's creak
    const a = audio, t = a.ctx.currentTime;
    const src = a.noise('brown', false), bp = a.filter('bandpass', 180, 2.5), g = a.gain(0.0001);
    src.connect(bp).connect(g).connect(snd.pan);
    g.gain.setTargetAtTime(which === 'tentacle' ? 0.06 : 0.045, t, 0.4); bp.frequency.setTargetAtTime(which === 'tentacle' ? 700 : 420, t, 1.2);
    g.gain.setTargetAtTime(0.0001, t + 1.6, 0.5);
    g.gain.setTargetAtTime(0.05, t + 3.6, 0.4); bp.frequency.setTargetAtTime(160, t + 3.6, 1.0); g.gain.setTargetAtTime(0.0001, t + 4.6, 0.4);
    src.start(t); src.stop(t + 5.4); track(src);
    for (let i = 0; i < 4; i++) a.burst(snd.pan, { t: t + 0.1 + i * 0.09, dur: 0.06, type: 'bandpass', f: 900 + i * 300, Q: 6, peak: 0.02 });
    snd.stat.reaches = (snd.stat.reaches || 0) + 1;
  }

  // ---- the sound at the door (and at the grates from outside), on the Ambience bus: the sliders and the mute reach it
  const snd = { bus: null, pan: null, loops: null, live: new Set(), stat: { draft: 0, scratches: 0, whispers: 0, drips: 0, rattles: 0, reaches: 0 }, next: { scratch: 4, whisper: 0, drip: 5, mod: 0 }, wasNear: false, at: 'door' };
  const R = Math.random;
  function sndReady() {
    if (!audio?.ready || !audio.amb) return false;
    if (snd.bus) return true;
    const a = audio;
    snd.bus = a.gain(0.85); snd.bus.connect(a.amb);
    snd.pan = a.panner(B.dx, B.y0 + 0.3, B.wallZ + 0.15, 1.6, 1.25); snd.pan.connect(snd.bus); snd.pan.verbDest = a.ambVerbIn;
    return true;
  }
  const track = src => { snd.live.add(src); src.onended = () => snd.live.delete(src); };
  function sndStart() {
    if (snd.loops || !sndReady()) return;
    const a = audio, t = a.ctx.currentTime;
    const draft = a.noise('brown'), df = a.filter('bandpass', 260, 0.9), dg = a.gain(0);
    draft.connect(df).connect(dg).connect(snd.pan); draft.start(); track(draft);
    const moan = a.noise('white'), mf = a.filter('bandpass', 760, 11), mg = a.gain(0);
    moan.connect(mf).connect(mg).connect(snd.pan); moan.start(); track(moan);
    dg.gain.setTargetAtTime(0.05, t, 0.8);
    snd.loops = { draft, df, dg, moan, mf, mg };
    snd.stat.draft++;
  }
  function sndStop() {
    const L = snd.loops; if (!L || !audio?.ctx) return;
    snd.loops = null;
    const t = audio.ctx.currentTime;
    L.dg.gain.setTargetAtTime(0, t, 0.3); L.mg.gain.setTargetAtTime(0, t, 0.3);
    try { L.draft.stop(t + 1.5); L.moan.stop(t + 1.5); } catch { /* stopped */ }
  }
  function scratch(k) {
    const a = audio, t = a.ctx.currentTime, n = 3 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) a.burst(snd.pan, { t: t + i * (0.12 + R() * 0.08), dur: 0.05 + R() * 0.09, type: 'bandpass', f: 2400 + R() * 1800, Q: 2.2, peak: 0.03 * k, sweep: 1300 + R() * 700 });
    snd.stat.scratches++;
  }
  function whisper() { // breath and hush: four to six swells of filtered breath, no words
    const a = audio, t = a.ctx.currentTime;
    const src = a.noise('white', false), hp = a.filter('highpass', 800, 0.7), bp = a.filter('bandpass', 1600, 3), g = a.gain(0.0001);
    src.connect(hp).connect(bp).connect(g).connect(snd.pan);
    let tt = t + 0.05; const n = 4 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const d = 0.16 + R() * 0.22;
      g.gain.setTargetAtTime(0.045 * (0.55 + 0.45 * R()), tt, 0.05); bp.frequency.setTargetAtTime(1100 + R() * 1500, tt, 0.07);
      g.gain.setTargetAtTime(0.0001, tt + d * 0.65, 0.06);
      tt += d + R() * 0.14;
    }
    src.start(t, R() * 1.5); src.stop(tt + 0.4); track(src);
    snd.stat.whispers++;
  }
  function drip() { audio.tone(snd.pan, { f: 1700 + R() * 500, glide: 800, t: audio.ctx.currentTime, a: 0.002, d: 0.14, peak: 0.016, verb: 0.9 }); snd.stat.drips++; }
  function rattleSound(k) {
    const a = audio, t = a.ctx.currentTime;
    for (let i = 0; i < 3; i++) a.burst(snd.pan, { t: t + i * 0.07, dur: 0.05, type: 'lowpass', f: 420, Q: 0.8, peak: 0.07 * k * (1 - i * 0.25), brown: true });
    a.burst(snd.pan, { t: t + 0.02, dur: 0.018, type: 'bandpass', f: 3300, Q: 12, peak: 0.03 * k });
    snd.stat.rattles++;
  }
  function sndUpdate(dt, near, inside, outsideNear) {
    const want = open && !ctx.below && (inside ? near < 16 : outsideNear < 14);
    if (!want) { if (snd.loops) sndStop(); return; }
    sndStart();
    if (!snd.loops) return;
    const a = audio, t = a.ctx.currentTime, N = snd.next;
    // inside: the door; outside: the nearest grate
    const at = inside ? 'door' : 'grate';
    if (at !== snd.at) { snd.at = at; const g = inside ? null : nearestGrate(); if (g) a.movePanner(snd.pan, g.x, g.y, g.z); else a.movePanner(snd.pan, B.dx, B.y0 + 0.3, B.wallZ + 0.15); }
    N.mod -= dt;
    if (N.mod <= 0) { // the draft swells and sinks; the moan's pitch wanders
      N.mod = 0.6 + R() * 0.9;
      const k = inside ? 1 : 0.55;
      snd.loops.dg.gain.setTargetAtTime((0.025 + 0.05 * R()) * k, t, 0.7);
      snd.loops.mg.gain.setTargetAtTime((R() < 0.35 ? 0.016 + 0.014 * R() : 0.003) * k, t, 0.9);
      snd.loops.mf.frequency.setTargetAtTime(560 + R() * 520, t, 1.1);
    }
    if (!inside) return;
    const close = near < 3.5;
    N.scratch -= dt; if (N.scratch <= 0) { N.scratch = close ? 3 + R() * 5 : 6 + R() * 9; scratch(close ? 1 : 0.7); }
    N.drip -= dt; if (N.drip <= 0) { N.drip = 6 + R() * 9; drip(); }
    const nearNow = near < 2.8;
    if (nearNow && !snd.wasNear && N.whisper <= 0) { whisper(); N.whisper = 14 + R() * 10; }
    else if (nearNow) { N.whisper -= dt; if (N.whisper <= 0) { whisper(); N.whisper = 14 + R() * 10; } }
    else N.whisper = Math.max(0, N.whisper - dt);
    snd.wasNear = nearNow;
  }
  function nearestGrate() { let best = null, bd = 1e9; for (const g of B.gratesAt) { const d = Math.hypot(g.x - player.pos.x, g.z - player.pos.z); if (d < bd) { bd = d; best = g; } } return best; }

  // ---- the hall's fill light lower and its lamps dimmed while you are downstairs in the house on an open day (after daynight.js
  // has set them this frame, before the draw; it sets them again next frame)
  frameHooks.push(() => {
    if (!B || !open || ctx.below || S.hall < 0.002) { sky.hemiK = 1; return; }
    const k = S.hall;
    if (sky.hemi) { sky.hemiK = 1 - 0.42 * k; sky.hemi.intensity *= sky.hemiK; }
    for (const col of ['#ffc766', '#ffcf6a']) { const l = LAMPS.get(col); if (l) l.mat.color.multiplyScalar(1 - (1 - S.lampK) * k); }
  });

  let notedDay = null;
  function update(dt) {
    const lc = house();
    if (!lc) return;
    if (!B) build(lc);
    const on = !!isOpen();
    if (on !== open) setOpen(on);
    t += dt;
    const p = player.pos, P = B.P;
    const inside = !!lc.inside?.(), downstairs = inside && p.y < P.UY - 1;
    const inHall = downstairs && p.x > B.hall.minX && p.x < B.hall.maxX && p.z > B.hall.minZ && p.z < B.hall.maxZ;
    const near = Math.hypot(p.x - B.spot.x, p.z - B.spot.z);
    S.inside = inside; S.downstairs = downstairs; S.inHall = inHall; S.near = near;
    // the clock: ticking (the pendulum swings, the hands keep the hour) on a closed day, stopped on an open one
    const hr = open ? STOP_AT : (LIGHT.hour ?? 12);
    const swing = open ? 0 : 0.11 * Math.sin(Math.PI * t);
    B.pend.rotation.x = swing;
    B.hands[0].rotation.x = -((hr % 12) / 12) * Math.PI * 2; B.hands[1].rotation.x = -(hr % 1) * Math.PI * 2;
    S.swing = swing;
    const outsideNear = Math.hypot(p.x - (P.HX + 1), p.z - (P.HZ + P.HD));
    sndUpdate(dt, near, inside, outsideNear);
    if (!open) { S.hall = 0; return; }
    const reduced = calm(), fast = GFX.level === 'low';
    // ---- the notice: the first time you step into the hall on an open day (remembered per day on this device)
    if (inHall && !ctx.below) {
      const day = easternDay(net().serverNow());
      if (notedDay !== day) { notedDay = day; if (ctx.store?.get('mazeDoor.notice', null) !== day) { ctx.store?.set('mazeDoor.notice', day); ui.toast(NOTICE, 5200); S.noticed = true; } }
    }
    // ---- the light: a slow uneasy flicker, now and then a shadow passing along the gap; brighter while the door rattles
    let k = 1;
    if (!reduced) {
      k = 0.72 + 0.3 * vnoise(t * 0.7, 3) + 0.06 * vnoise(t * 4.1, 5);
      S.passT -= dt;
      if (S.passT <= 0 && S.pass > 8) { S.pass = -1.3; S.passDir = R() < 0.5 ? 1 : -1; }
      if (S.pass <= 1.3) { S.pass += dt * 1.25; if (S.pass > 1.3) { S.pass = 9; S.passT = 9 + R() * 14; } }
    } else { S.pass = 9; k = 0.95; }
    // ---- the rattle: the leaf pushed out against the latch and knocking back; more often when you are close
    S.rattleT -= dt;
    if (S.rattleT <= 0) {
      S.rattleT = near < 3 ? 3 + R() * 5 : 8 + R() * 12;
      if (!reduced && downstairs) { S.rattle = 0.42; S.rattleAmp = near < 3 ? 0.014 : 0.009; S.rattles++; if (snd.loops) rattleSound(near < 3 ? 1 : 0.6); }
    }
    let leaf = 0;
    if (S.rattle > 0) { S.rattle = Math.max(0, S.rattle - dt); const e = S.rattle / 0.42; leaf = -S.rattleAmp * Math.abs(Math.sin((0.42 - S.rattle) * 48)) * e; S.flare = e; } else S.flare = 0;
    reachUpdate(dt, reduced); leaf -= RE.leaf; // (the leaf pushed ajar while something reaches out of the gap)
    B.pivot.rotation.y = leaf; if (leaf < S.leafPeak) S.leafPeak = leaf;
    S.k = k * (1 + 0.3 * S.flare);
    B.gapU.uK.value = S.k; B.gapU.uPass.value = S.pass > 8 ? 9 : S.pass * (S.passDir || 1); B.gapU.uFlare.value = S.flare;
    // the keyhole and the glows
    const kh = 0.7 + 0.3 * (reduced ? 0.8 : vnoise(t * 1.3, 9));
    B.keyMat.color.set(GREEN).multiplyScalar(0.8 + 0.5 * kh * S.k);
    const ga = B.gl.a, gs = B.gl.size;
    ga[0] = 0.85 * kh * S.k; ga[1] = 0.22 * S.k;
    const gut = reduced ? 0.9 : vnoise(t * 3.2, 13) * 0.6 + vnoise(t * 9.7, 17) * 0.4, out = !reduced && vnoise(t * 0.35, 21) > 0.8 ? 0.35 : 1; // (the candle gutters; now and then it nearly goes out)
    ga[2] = (0.6 + 0.4 * gut) * out; ga[3] = (0.35 + 0.35 * gut) * out; gs[3] = 0.32 + 0.14 * gut;
    B.gl.dirty();
    const og = B.og.a, pulse = reduced ? 0.85 : 0.75 + 0.25 * vnoise(t * 0.5, 25);
    og[0] = og[1] = (LIGHT.night > 0.3 ? 0.75 : 0.55) * pulse; B.og.dirty();
    B.glowMat.color.set(GREEN).multiplyScalar(0.75 + 0.35 * pulse);
    B.tint.color.set(GREEN_DEEP).multiplyScalar((LIGHT.night > 0.3 ? 0.55 : 0.32) * pulse);
    const vh = ctx.renderer?.getDrawingBufferSize ? ctx.renderer.getDrawingBufferSize(_v2).y : innerHeight; const sc = vh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    B.gl.p.material.uniforms.uScale.value = sc; B.og.p.material.uniforms.uScale.value = sc; B.breathU.uScale.value = sc;
    // the real light at the door's foot (main.js re-picks its lamp lights every 0.4 s from `k`: mirrored here every frame)
    B.light.k = 0.34 * S.k;
    // the hall's pendant dimmed and guttering a little; the fill lower while you are downstairs
    S.lampK = reduced ? 0.6 : 0.55 + 0.12 * vnoise(t * 2.6, 31) - (vnoise(t * 0.9, 33) > 0.82 ? 0.2 : 0);
    if (B.pendant) B.pendant.k = S.lampK;
    for (const l of B.lampLights) {
      const atDoor = Math.abs(l.position.x - B.light.x) < 0.01 && Math.abs(l.position.z - B.light.z) < 0.01;
      // (a short reach for the door's glow: its light, and on Max its shadow map's far, stop at 4.5 m: a cube map out to the
      // lamps' 26 m from the floor by the door drew most of the house six times over, +35 draw calls a frame on a phone)
      if (atDoor && l.distance !== DOOR_REACH) { l.distance = DOOR_REACH; l.userData.mzDoor = true; } else if (!atDoor && l.userData.mzDoor) { l.distance = LAMP_REACH; l.userData.mzDoor = false; }
      if (l.intensity <= 0) continue;
      if (atDoor) l.intensity = 16 * B.light.k;
      else if (B.pendant && Math.abs(l.position.x - B.pendant.x) < 0.01 && Math.abs(l.position.z - B.pendant.z) < 0.01) l.intensity = 16 * Math.max(LIGHT.night, B.pendant.day || 0) * S.lampK;
    }
    S.hall += ((downstairs ? (inHall ? 1 : 0.6) : 0) - S.hall) * Math.min(1, dt * 1.5);
    // ---- the mist (not on Fast): its clock, your feet, its strength
    const mistOn = !fast;
    B.mist.visible = mistOn && (inside || near < 9); B.omist.visible = mistOn && !inside;
    if (mistOn) {
      const mu = B.mist.material.uniforms; mu.uTime.value = t; mu.uK.value = 0.8 * (0.85 + 0.15 * S.k); mu.uFeet.value.set(p.x, P.FY, p.z);
      const ou = B.omist.material.uniforms; ou.uTime.value = t; ou.uK.value = LIGHT.night > 0.4 ? 0.7 : 1.15; ou.uFeet.value.set(p.x, P.TY, p.z);
    }
    // ---- outside: drawn only while you are out and within sight of the house; the crows wheel over the roof
    const farOut = Math.hypot(p.x - P.HX, p.z - P.HZ);
    B.outer.visible = !inside && farOut < 160;
    if (B.outer.visible) crowsFly(t);
    // ---- your breath near the door (the maze's vapour): an exhale every few seconds, drifting and fading
    breathe(dt, near, downstairs && !ctx.below && lc.view !== 'room'); // (first person: in the room view a puff in front of your face drew over your back)
  }

  const _o = new THREE.Object3D(); _o.rotation.order = 'YXZ';
  function crowsFly(t) {
    const P = B.P;
    B.crows.forEach((c, i) => {
      const a = t * c.w + c.ph, x = P.HX + Math.cos(a) * c.r, z = P.HZ + Math.sin(a) * c.r, y = c.h + Math.sin(t * 0.6 + i) * 0.4;
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(c.w), Math.cos(a) * Math.sign(c.w)), bank = 0.35 * Math.sign(c.w);
      const flapping = vnoise(t * 0.35, 41 + i) > 0.55, f = flapping ? 0.15 + 0.65 * Math.sin(t * 10 + i) : 0.12 + 0.05 * Math.sin(t * 1.7 + i);
      _o.position.set(x, y, z); _o.rotation.set(0, yaw, bank); _o.scale.setScalar(1.4); _o.updateMatrix(); B.crowBodies.setMatrixAt(i, _o.matrix);
      _o.rotation.set(0, yaw, bank + f); _o.updateMatrix(); B.crowWings.setMatrixAt(i * 2, _o.matrix);
      _o.rotation.set(0, yaw, bank + Math.PI - f); _o.updateMatrix(); B.crowWings.setMatrixAt(i * 2 + 1, _o.matrix);
    });
    B.crowBodies.instanceMatrix.needsUpdate = true; B.crowWings.instanceMatrix.needsUpdate = true;
  }

  function breathe(dt, near, on) {
    const Q = B.puffs;
    if (on && near < 3.4) {
      S.breathT -= dt;
      if (S.breathT <= 0) {
        S.breathT = 3.2 + R() * 1.4;
        const head = player.character?.head;
        if (head) { head.updateWorldMatrix(true, false); head.getWorldPosition(_v); } else _v.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
        for (let q = 0; q < 3; q++) {
          const p = Q.find(o => !o.on); if (!p) break;
          p.on = true; p.t = 0; p.life = 1.6 + R() * 0.4; p.a = 0.16 * (1 - q * 0.22);
          p.x = _v.x + fx * 0.2 + (R() - 0.5) * 0.04; p.y = _v.y - 0.1 - q * 0.01; p.z = _v.z + fz * 0.2 + (R() - 0.5) * 0.04;
          p.vx = fx * (0.3 + q * 0.07) + (R() - 0.5) * 0.06; p.vy = 0.05 + R() * 0.04; p.vz = fz * (0.3 + q * 0.07) + (R() - 0.5) * 0.06;
        }
      }
    }
    let any = false;
    for (let i = 0; i < Q.length; i++) {
      const p = Q[i];
      if (p.on) { p.t += dt; if (p.t >= p.life) p.on = false; else { const d = Math.exp(-dt * 1.6); p.vx *= d; p.vz *= d; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } }
      const u = p.on ? p.t / p.life : 1;
      B.bPos[i * 3] = p.x; B.bPos[i * 3 + 1] = p.y; B.bPos[i * 3 + 2] = p.z;
      B.bA[i] = p.on ? p.a * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u) : 0; B.bS[i] = 0.06 + 0.3 * u;
      any = any || p.on;
    }
    B.breath.visible = any;
    if (any) { B.bGeo.attributes.position.needsUpdate = true; B.bGeo.attributes.aA.needsUpdate = true; B.bGeo.attributes.aSize.needsUpdate = true; }
  }
  const net = () => ctx.net;

  return {
    update,
    get built() { return !!B; },
    get open() { return open; },
    // test hooks: what is on and how strong
    get state() {
      if (!B) return null;
      const tb = audio?.tables?.find(q => q.theme === 'arkham');
      const lit = B.lampLights.find(l => Math.abs(l.position.x - B.light.x) < 0.01 && Math.abs(l.position.z - B.light.z) < 0.01);
      return {
        open, shown: B.inner.visible, outside: B.outer.visible, leaf: B.pivot.rotation.y, houseDoor: (house()?.built?.mazeDoor || []).some(m => m.visible), leafPeak: S.leafPeak, rattles: S.rattles, strip: B.gapU.uK.value, pass: B.gapU.uPass.value,
        keyhole: B.gl.a[0], scratches: B.decal.visible && B.inner.visible, mist: B.mist.visible && B.inner.visible, mistOut: B.omist.visible && B.outer.visible,
        hall: S.hall, hemiK: sky.hemiK, lampK: B.pendant ? B.pendant.k : null, light: lit ? lit.intensity : 0, spotIn: NIGHT_SPOTS.includes(B.light),
        clock: { swing: S.swing, stopped: !!tb?.stopped, minute: B.hands[1].rotation.x }, candle: B.gl.a[2],
        breath: B.puffs.filter(p => p.on).length, near: S.near, inHall: S.inHall, noticed: S.noticed,
        sound: { ready: !!snd.bus, loops: !!snd.loops, live: snd.live.size, ...snd.stat },
        reach: { ready: !!RE.built, on: RE.on, which: RE.which, t: RE.t, count: RE.count, leaf: RE.leaf, shown: !!RE.creature?.mesh.visible, tris: RE.built ? Object.values(RE.built).map(c => c?.tris || 0) : null },
      };
    },
    // (tests) the pieces and a nudge: a rattle now, a whisper now
    get parts() { return B; },
    rattleNow() { S.rattleT = 0; },
    reachNow(which) { return !!RE.built && !RE.on && reachStart(RE.slot, which); }, // (tests and pictures: a reach now, the slot's creature, or `which` = 'arm' | 'tentacle')
    get reachReady() { return !!RE.built; },
    get reach() { return RE; }, // (lovecraft-review: the creatures' meshes, for the sweep against the leaf)
    whisperNow() { if (snd.loops) whisper(); },
  };
}
