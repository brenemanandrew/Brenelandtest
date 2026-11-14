// Beneath Angell Street: real flames on every torch and candle below, in one draw.
//
// Each flame is a quad that turns to face you about the upright (so it stands up and reads from every side) with a shader that
// draws a toon flame in it: a hot yellow-white core, an orange body and a red-orange edge in three hard bands, a teardrop that
// licks upward (noise rising through it breaks the tip into tongues), leaning and swaying on its own seed, the height breathing.
// It glows: premultiplied, so it adds light over the dark and keeps its colours over a lit wall. Every torch and candle in the
// maze (and the candle at the top of the stair) is one instance of ONE mesh, one draw call for all of them, with nothing done per
// frame on the CPU but a uniform (and a flag when a chunk shows or hides, or the stair's candle gutters out). The halos, the light
// flicker and the smoke are maze-fx.js's.
//   createMazeFlames({ kit, group, maze }) -> { mesh, count, update(t), flicker(i, t), dispose() }
// kit.flames: { x, y, z, size, kind, by, fw, fh } (by: the flame's foot, fw / fh its half width and height; maze-kit.js), plus
// kit.stair.candle (the same, the last instance: maze-fx.js's halos keep that order too).
// After them come LANTERNS more instances: the lanterns' own flames (yours, in your hand or in third person, and up to three
// friends'), placed each frame by maze-fx.js with setLantern(i, ...). A small teardrop on the wick that leans and streams against
// the lantern's motion (aMove.xy: the lean in the world, radians), flutters when it gutters (aMove.z) and is calm when you stand
// still (aMove.w, the unrest: always 1 for the torches).
import * as THREE from 'three';
import { LAYER_SOFT } from './toon.js';
import { CHUNK } from './maze-kit.js';
import { CELL } from './maze-gen.js';

export const FLAME_COLORS = { core: '#fff3c4', body: '#ffa22e', edge: '#e2481c' };

// the height's breathing, the same sum as the shader's (the tests read it here): about 0.75 .. 1.15, never periodic over a minute
export function flameBreath(t, s) {
  return 0.95 + 0.09 * Math.sin(t * (7.1 + s * 3.0) + s * 40.0) + 0.06 * Math.sin(t * (12.7 + s * 5.0) + s * 9.0) + 0.04 * Math.sin(t * (2.3 + s * 1.7) + s * 3.0);
}

const VERT = /* glsl */`
  attribute vec3 aBase; attribute vec2 aSize; attribute float aSeed, aK; attribute vec4 aMove;
  uniform float uTime;
  varying vec2 vUv; varying float vSeed, vK, vFade, vLean, vFlut, vCalm;
  void main() {
    float s = aSeed, t = uTime;
    float breath = 0.95 + 0.09 * sin(t * (7.1 + s * 3.0) + s * 40.0) + 0.06 * sin(t * (12.7 + s * 5.0) + s * 9.0) + 0.04 * sin(t * (2.3 + s * 1.7) + s * 3.0);
    breath = mix(1.0, breath, aMove.w); // a lantern's flame breathes with its own light (set from maze-fx.js), a torch's as always
    vec3 base = (modelMatrix * vec4(aBase, 1.0)).xyz;
    // the camera's right, kept level: the quad turns about the upright to face you
    vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    r = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5, 0.0, 0.0));
    // the lean: across the view it shears the flame sideways, along the view it streams toward or away (shorter)
    vec3 fw = vec3(-viewMatrix[0][2], 0.0, -viewMatrix[2][2]);
    float side = dot(aMove.xy, r.xz), deep = dot(aMove.xy, normalize(fw.xz + vec2(1e-5, 0.0)));
    float q = 1.5 + 1.6 * abs(side);
    float h = aSize.y * breath * aK * (1.0 - 0.32 * min(abs(deep), 0.8)), w = aSize.x * q;   // the quad is wider than the flame, room to lean and lick
    vec3 wp = base + r * (position.x * w) + vec3(0.0, position.y * h, 0.0);
    vUv = vec2(position.x * q, position.y); vSeed = s; vK = aK;
    vLean = side * aSize.y / max(aSize.x, 1e-4) * 0.9; vFlut = aMove.z; vCalm = aMove.w;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    float d = -mv.z;
    vFade = (1.0 - smoothstep(11.0, 19.0, d)) * smoothstep(0.08, 0.3, d);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform float uTime; uniform vec3 uCore, uBody, uEdge;
  varying vec2 vUv; varying float vSeed, vK, vFade, vLean, vFlut, vCalm;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    if (vK < 0.01 || vFade < 0.003) discard;
    float t = uTime, s = vSeed, y = clamp(vUv.y, 0.0, 1.0);
    // the lean and the sway: more of it toward the tip
    float sway = (vnoise(vec2(y * 1.7 - t * 2.4, s * 17.0)) - 0.5) * 0.7 * y * y + sin(t * (2.7 + s) + s * 21.0) * 0.12 * y * y;
    sway = sway * vCalm + (vnoise(vec2(y * 3.0 - t * 15.0, s * 5.0)) - 0.5) * 1.1 * vFlut * y; // calm when still, a flutter when it gutters
    float x = vUv.x - sway - vLean * pow(y, 1.35);
    // the teardrop: round at the foot, a point at the tip
    float prof = pow(sin(3.14159 * pow(y, 0.58)), 0.85) * (1.0 - 0.3 * y);
    float r = abs(x) / max(prof, 0.001);
    // tongues: noise rising up through it eats into the upper half
    float n = vnoise(vec2(x * 2.6 + s * 13.0, y * 3.4 - t * 4.6)) * 0.62 + vnoise(vec2(x * 6.0 - s * 7.0, y * 7.5 - t * 8.3)) * 0.38;
    float heat = (1.0 - r) * (1.05 - 0.6 * y) + (n - 0.5) * (0.75 * (0.45 + 0.55 * vCalm) + 0.5 * vFlut) * smoothstep(0.08, 0.85, y);
    float e = 0.035;
    float a0 = smoothstep(0.03, 0.03 + e, heat), a1 = smoothstep(0.3, 0.3 + e, heat), a2 = smoothstep(0.6, 0.6 + e, heat);
    if (a0 < 0.004) discard;
    vec3 col = mix(uEdge, uBody, a1); col = mix(col, uCore, a2);
    float a = a0 * vFade * min(1.0, vK * 1.5);
    // premultiplied: the colour added, the background behind kept by a little less than the flame's cover (a glow that keeps its hue)
    gl_FragColor = vec4(col * a, a * (0.72 + 0.25 * a2));
  }`;

export const LANTERNS = 4; // yours and three friends'
export function createMazeFlames({ kit, group, maze }) {
  const list = [...(kit.flames || []), kit.stair?.candle ? { ...kit.stair.candle, kind: 'stair' } : null].filter(Boolean);
  const n0 = list.length, n = n0 + LANTERNS;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const base = new Float32Array(n * 3), size = new Float32Array(n * 2), seed = new Float32Array(n), k = new Float32Array(n);
  const W = maze?.W || 0, cw = Math.ceil(W / CHUNK), chunkOf = new Int32Array(n);
  const move = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) move[i * 4 + 3] = 1;
  for (let i = n0; i < n; i++) { k[i] = 0; seed[i] = ((Math.sin(i * 91.7 + 13.1) * 43758.5453) % 1 + 1) % 1; chunkOf[i] = -2; size[i * 2] = 0.016; size[i * 2 + 1] = 0.07; }
  list.forEach((f, i) => {
    const small = f.kind !== 'torch';
    base[i * 3] = f.x; base[i * 3 + 1] = f.by ?? (f.y - (small ? 0.05 : 0.2)); base[i * 3 + 2] = f.z;
    size[i * 2] = f.fw ?? (small ? 0.024 : 0.12); size[i * 2 + 1] = f.fh ?? (small ? 0.085 : 0.42);
    seed[i] = ((Math.sin(i * 91.7 + 13.1) * 43758.5453) % 1 + 1) % 1; k[i] = 1;
    chunkOf[i] = f.kind === 'stair' || !W ? -1 : Math.floor(Math.floor(f.x / CELL) / CHUNK) + Math.floor(Math.floor(f.z / CELL) / CHUNK) * cw;
  });
  const aBase = new THREE.InstancedBufferAttribute(base, 3), aSize = new THREE.InstancedBufferAttribute(size, 2), aMove = new THREE.InstancedBufferAttribute(move, 4);
  for (const a of [aBase, aSize, aMove]) a.setUsage(THREE.DynamicDrawUsage); // the lanterns' instances move every frame
  geo.setAttribute('aBase', aBase); geo.setAttribute('aSize', aSize); geo.setAttribute('aMove', aMove);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  const aK = new THREE.InstancedBufferAttribute(k, 1); aK.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aK', aK);
  geo.instanceCount = n;
  const c = new THREE.Color();
  const uniforms = { uTime: { value: 0 }, uCore: { value: c.set(FLAME_COLORS.core).clone() }, uBody: { value: c.set(FLAME_COLORS.body).clone() }, uEdge: { value: c.set(FLAME_COLORS.edge).clone() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false,
  });
  mat.name = 'maze-flames';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'maze-flames'; mesh.frustumCulled = false; mesh.renderOrder = 7; // after the halos, which washed the lantern's flame out
  mesh.layers.set(LAYER_SOFT);
  group.add(mesh);
  let haloK = null;
  return {
    mesh, count: n, list,
    get seeds() { return seed; },
    // each frame: the time; a flame in a hidden chunk is put out (no flame through a wall that is not drawn); the stair's candle
    // follows its halo (maze-fx.js gutters it out as you go down)
    update(t) {
      uniforms.uTime.value = t;
      if (!haloK) haloK = group.getObjectByName('maze-halos')?.geometry.attributes.aK || null;
      let dirty = false;
      for (let i = 0; i < n0; i++) {
        const ch = chunkOf[i];
        const want = ch < 0 ? (haloK && list[i].kind === 'stair' ? haloK.array[haloK.count - 1] : 1) : (kit.chunks[ch]?.meshes[0]?.visible === false ? 0 : 1);
        if (Math.abs(k[i] - want) > 0.02 || (want === 0 && k[i] !== 0)) { k[i] = want; dirty = true; }
      }
      if (dirty) aK.needsUpdate = true;
    },
    flicker: (i, t) => flameBreath(t, seed[i]),
    // a lantern's flame (i: 0 yours, 1..3 friends'), in the maze group's frame: the wick's top, the flame's half width and height, k its
    // size now (0 puts it out), the lean (world x, z, radians), the flutter (0..1) and the unrest (0 calm .. 1)
    lanterns: LANTERNS, first: n0,
    setLantern(i, x, y, z, fw, fh, kk, lx, lz, flut, unrest) {
      const j = n0 + i;
      base[j * 3] = x; base[j * 3 + 1] = y; base[j * 3 + 2] = z; size[j * 2] = fw; size[j * 2 + 1] = fh; k[j] = kk;
      move[j * 4] = lx; move[j * 4 + 1] = lz; move[j * 4 + 2] = flut; move[j * 4 + 3] = unrest;
      aBase.needsUpdate = aSize.needsUpdate = aMove.needsUpdate = aK.needsUpdate = true;
    },
    lanternOff(i) { const j = n0 + i; if (k[j] !== 0) { k[j] = 0; aK.needsUpdate = true; } },
    lantern(i) { const j = n0 + i; return { x: base[j * 3], y: base[j * 3 + 1], z: base[j * 3 + 2], fw: size[j * 2], fh: size[j * 2 + 1], k: k[j], lean: [move[j * 4], move[j * 4 + 1]], flutter: move[j * 4 + 2], unrest: move[j * 4 + 3] }; },
    dispose() { group.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
