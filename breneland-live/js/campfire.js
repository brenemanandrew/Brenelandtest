// The campfire: stones, logs on embers, cartoon flame cards, sparks, smoke and one warm light. Brighter after dark.
// Cost: 3 draw calls for flames, sparks and smoke, the logs go into the area batch, one PointLight.
// A fire that's lit and goes out (firepit.js) passes `fuel` = { flame, ember, smoke }, 0..1 each, written every frame by its
// owner, and everything follows it. Without `fuel` (the scouts' camp) it always burns.
import * as THREE from 'three';
import { GEO, Batcher } from './batch.js';
import { toon, LAYER_SOFT } from './toon.js';
import { limb } from './world-trees.js';
import { terrainHeight } from './terrain.js';
import { LIGHT, addNightSpot } from './daynight-mats.js';

const TAU = Math.PI * 2;
const _vp = new THREE.Vector2();

// Flame cards: [x offset, z offset, width, height, seed]. Drawn in this order with depth writes off, so each one paints over
// the last: the big dark-orange back tongues first, the pale core last.
const CARDS = [
  [0, 0, 1.05, 1.45, 0.11], [-0.24, 0.08, 0.7, 1.0, 0.57], [0.26, -0.06, 0.68, 1.08, 0.83],
  [0.04, 0.1, 0.78, 0.9, 0.31], [-0.1, -0.08, 0.48, 0.72, 0.69], [0.12, 0.04, 0.42, 0.6, 0.47],
];

const NOISE = /* glsl */`
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

function flameMesh() {
  // one quad per card, all in one geometry: corner in `position` (x -0.5..0.5, y 0..1), the card in aCard
  const pos = [], card = [], seed = [], idx = [];
  CARDS.forEach(([x, z, w, h, sd], i) => {
    for (const [cx, cy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) { pos.push(cx, cy, 0); card.push(x, z, w, h); seed.push(sd, i / (CARDS.length - 1)); }
    const k = i * 4;
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(card, 4));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.5);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBright: { value: 1 }, uSize: { value: 1 },
      uC0: { value: new THREE.Color('#e8401c') }, uC1: { value: new THREE.Color('#ff7a1e') },
      uC2: { value: new THREE.Color('#ffbe2e') }, uC3: { value: new THREE.Color('#fff4a8') },
    },
    vertexShader: /* glsl */`
      attribute vec4 aCard; attribute vec2 aSeed;
      uniform float uTime, uSize;
      varying vec2 vUv; varying float vSeed; varying float vLayer;
      void main() {
        // each card turns to face the camera about the vertical (a cylindrical billboard) and breathes a little;
        // uSize (a fire that grows and dies: 1 = full) shrinks the tongues, a little less across than up
        vec3 base = (modelMatrix * vec4(aCard.x * (0.55 + 0.45 * uSize), 0.0, aCard.y * (0.55 + 0.45 * uSize), 1.0)).xyz;
        vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        float breathe = 1.0 + 0.09 * sin(uTime * 2.3 + aSeed.x * 20.0) + 0.05 * sin(uTime * 5.1 + aSeed.x * 7.0);
        vec3 p = base + right * position.x * aCard.z * (0.45 + 0.55 * uSize) * (2.0 - breathe) * 0.9 + vec3(0.0, position.y * aCard.w * uSize * breathe, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vUv = position.xy + vec2(0.5, 0.0);
        vSeed = aSeed.x; vLayer = aSeed.y;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uBright;
      uniform vec3 uC0, uC1, uC2, uC3;
      varying vec2 vUv; varying float vSeed; varying float vLayer;
      ${NOISE}
      void main() {
        float y = vUv.y, x = vUv.x * 2.0 - 1.0;
        float t = uTime * (1.0 + vSeed * 0.35);
        // the tongue sways more the higher it goes
        x -= (vn(vec2(y * 2.2 - t * 1.9, vSeed * 17.0)) - 0.5) * 0.95 * y * y + sin(t * 3.3 + vSeed * 9.0 + y * 3.0) * 0.07 * y;
        // a teardrop: a round bottom, then tapering to a point
        float round = sqrt(max(0.0, 1.0 - pow(max(0.0, 0.3 - y) / 0.3, 2.0)));
        float w = round * pow(max(0.0, 1.0 - y), 0.8);
        float heat = 1.0 - abs(x) / max(w, 0.001);
        // licks: noise rising through the flame eats into the top so it splits into tongues and breaks off
        float lick = vn(vec2(x * 2.6 + vSeed * 5.0, y * 3.2 - t * 3.4));
        heat -= lick * 0.75 * smoothstep(0.1, 0.9, y);
        heat -= smoothstep(0.55, 1.0, y) * 0.35;
        if (heat < 0.02) discard;
        // cel bands, hotter toward the middle and the bottom; the front cards run hotter
        float hb = heat + (1.0 - y) * 0.18 + vLayer * 0.22;
        vec3 col = hb < 0.34 ? uC0 : hb < 0.6 ? uC1 : hb < 0.86 ? uC2 : uC3;
        gl_FragColor = vec4(col * uBright, 1.0);
      }`,
    transparent: true, depthWrite: false,
    // colour replaces, alpha becomes 0: the ink pass reads that as "no outlines here" (toon.js)
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 3;
  m.layers.set(LAYER_SOFT);
  m.name = 'campfire-flames';
  return m;
}

// Rising points (sparks or smoke puffs): every particle loops its own life from the clock in the vertex shader.
function risers({ n, seedBase, life, rise, spread, size, frag, blending, name }) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = ((i * 0.6180339 + seedBase) % 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uK: { value: 1 }, uCol: { value: new THREE.Color('#ffffff') }, uCol2: { value: new THREE.Color('#ffffff') } },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uScale;
      varying float vLife; varying float vSeed;
      void main() {
        float rate = 1.0 / (${life.toFixed(2)} * (0.7 + aSeed * 0.6));
        float l = fract(uTime * rate + aSeed * 7.31);
        vec3 p = vec3(0.0);
        float a = aSeed * 41.0;
        p.x = sin(a + l * 3.0) * ${spread.toFixed(2)} * (0.25 + l) + l * l * 0.35;   // a breeze pushes them east a little
        p.z = cos(a * 1.3 + l * 2.4) * ${spread.toFixed(2)} * (0.25 + l);
        p.y = 0.25 + l * ${rise.toFixed(2)} * (0.75 + aSeed * 0.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(${size} * uScale / max(0.5, -mv.z), 1.5, 180.0);
        vLife = l; vSeed = aSeed;
      }`,
    fragmentShader: /* glsl */`
      uniform float uK, uTime; uniform vec3 uCol, uCol2;
      varying float vLife; varying float vSeed;
      void main() { ${frag} }`,
    transparent: true, depthWrite: false, blending,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.renderOrder = 4;
  p.layers.set(LAYER_SOFT);
  p.name = name;
  p.onBeforeRender = (renderer, scene, cam) => {
    renderer.getDrawingBufferSize(_vp);
    mat.uniforms.uScale.value = _vp.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 50) / 2));
  };
  return p;
}

export function buildCampfire({ b, group, x, z, colliders, updaters, fuel = null }) {
  const y = terrainHeight(x, z);
  // stone ring and a dark ash bed inside it
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    b.add(GEO.dodec, i % 3 ? '#8e8e86' : '#a3a39a', { x: x + Math.cos(a) * 0.92, y: y + 0.13, z: z + Math.sin(a) * 0.92, sx: 0.27, sy: 0.21, sz: 0.25, ry: i * 1.7 });
  }
  b.add(GEO.cyl12, '#3b3430', { x, y: y + 0.03, z, sx: 0.82, sy: 0.04, sz: 0.82 });
  // embers: a glowing mound (its own material so it can pulse) and a few coals. A fire with fuel keeps them out of the bake,
  // since weather-cover copies baked materials and the copy wouldn't cool when the fire goes out.
  const emberMat = toon('#e8561a', { emissive: '#ff5e16', emissiveIntensity: 0.6 }).clone();
  const coalMat = toon('#2e2622', { emissive: '#c8401a', emissiveIntensity: 0.35 }).clone();
  const eb = fuel ? new Batcher() : b;
  eb.add(GEO.ico1, emberMat, { x, y: y + 0.06, z, sx: 0.5, sy: 0.11, sz: 0.5 });
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = 0.2 + (i % 3) * 0.13;
    eb.add(GEO.dodec, coalMat, { x: x + Math.cos(a) * r, y: y + 0.09, z: z + Math.sin(a) * r, sx: 0.09, sy: 0.06, sz: 0.08, ry: i });
  }
  // two logs lying across the ring, then charred ones leaning in like a little tent, each with a glowing tip
  const logMat = toon('#3a2a22'), barkMat = toon('#5a3e2a');
  for (const [a, off] of [[0.4, 0.1], [2.1, -0.08]]) {
    const cx = x - Math.sin(a) * off, cz = z + Math.cos(a) * off;
    limb(b, barkMat, [cx - Math.cos(a) * 0.72, y + 0.12, cz - Math.sin(a) * 0.72], [cx + Math.cos(a) * 0.72, y + 0.14, cz + Math.sin(a) * 0.72], 0.1);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3, c = Math.cos(a), sn = Math.sin(a);
    limb(b, i % 2 ? logMat : barkMat, [x + c * 0.66, y + 0.05, z + sn * 0.66], [x + c * 0.07, y + 0.62, z + sn * 0.07], 0.085);
    eb.add(GEO.sphere, emberMat, { x: x + c * 0.11, y: y + 0.58, z: z + sn * 0.11, sx: 0.065, sy: 0.065, sz: 0.065 });
  }
  colliders.push({ type: 'circle', x, z, r: 1.1 });
  if (fuel) for (const m of eb.build(group, 'campfire-embers')) { m.matrixAutoUpdate = true; m.userData.noMerge = true; }

  const fire = new THREE.Group();
  fire.position.set(x, y + 0.12, z);
  const flames = flameMesh();
  const sparks = risers({ n: 34, seedBase: 0.13, life: 1.6, rise: 3.0, spread: 0.32, size: '0.075', blending: THREE.AdditiveBlending, name: 'campfire-sparks',
    frag: `
      vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c); if (r > 1.0) discard;
      float fade = (1.0 - vLife) * smoothstep(0.0, 0.06, vLife);
      float wink = step(0.35, fract(vSeed * 13.0 + vLife * 3.0)); // sparks blink on their way up
      float a = (1.0 - smoothstep(0.3, 1.0, r)) * fade * mix(0.5, 1.0, wink) * uK;
      gl_FragColor = vec4(mix(uCol, uCol2, vLife) * a * 1.6, 1.0);` });
  sparks.material.uniforms.uCol.value.set('#fff2a0'); sparks.material.uniforms.uCol2.value.set('#ff5a1a');
  const smoke = risers({ n: 9, seedBase: 0.41, life: 4.2, rise: 4.2, spread: 0.45, size: '(0.35 + l * 1.1)', blending: THREE.NormalBlending, name: 'campfire-smoke',
    frag: `
      vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c); if (r > 1.0) discard;
      float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife));
      float body = 1.0 - smoothstep(0.78, 0.95, r);
      float lit = step(0.0, -c.x - c.y + 0.25); // a lighter cel side, lit from the fire below
      float a = body * fade * 0.42 * uK;
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uCol, uCol2, lit * 0.6), a);` });
  smoke.position.y = 0.9;
  fire.add(flames, sparks, smoke);
  group.add(fire);

  // one warm light that flickers (no shadows), much stronger after dark
  const light = new THREE.PointLight('#ff9a4a', 0, 13, 1.35);
  light.userData.fireLight = true; // Max: it casts shadows (daynight.js)
  light.position.set(x, y + 1.0, z);
  group.add(light);
  const smokeDay = new THREE.Color('#9a948e'), smokeDayLit = new THREE.Color('#c8c0b6');
  const smokeNight = new THREE.Color('#3c3a4c'), smokeNightLit = new THREE.Color('#8a5a4a');
  if (fuel) return fuelled({ group, x, y, z, light, flames, sparks, smoke, emberMat, coalMat, fuel, updaters, smokeDay, smokeDayLit, smokeNight, smokeNightLit });
  addNightSpot({ x, y: y + 0.9, z, color: '#ff9a48', pool: 4.4, poolK: 0.42, gy: y, halo: 2.8, flicker: 1 });

  updaters.push((dt, t) => {
    if (flames.castShadow) flames.castShadow = flames.receiveShadow = false; // buildAreas turns shadows on for the whole group
    const n = LIGHT.night;
    const f = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 5.1);
    light.intensity = (1.2 + n * 6.0) * f;
    emberMat.emissiveIntensity = (0.5 + n * 0.1) * (0.85 + 0.15 * Math.sin(t * 3.7) * Math.sin(t * 1.3));
    coalMat.emissiveIntensity = 0.3 + n * 0.35 + 0.12 * Math.sin(t * 2.1 + 1);
    const fu = flames.material.uniforms;
    fu.uTime.value = t % 1000; fu.uBright.value = 1.0 + n * 0.45;
    for (const p of [sparks, smoke]) p.material.uniforms.uTime.value = t % 1000;
    sparks.material.uniforms.uK.value = 0.7 + n * 0.5;
    smoke.material.uniforms.uCol.value.copy(smokeDay).lerp(smokeNight, n);
    smoke.material.uniforms.uCol2.value.copy(smokeDayLit).lerp(smokeNightLit, n);
    smoke.material.uniforms.uK.value = 1 - n * 0.35;
  });
  return { light };
}

// A soft round glow for the ground under a fire (a canvas gradient: no 2D filters, see CONTRACTS.md).
let poolTex = null;
function firePoolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 63);
  for (const [at, a] of [[0, 0.95], [0.3, 0.8], [0.42, 0.55], [0.7, 0.35], [0.85, 0.1], [1, 0]]) grad.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.colorSpace = THREE.NoColorSpace;
  return poolTex;
}

// The fire that is lit and goes out: everything scales with fuel.flame / ember / smoke (and fuel.steam whitens the smoke
// after a douse). Hidden pieces cost nothing: the flames, sparks, smoke and glow are not drawn while they are at zero.
function fuelled({ group, x, y, z, light, flames, sparks, smoke, emberMat, coalMat, fuel, updaters, smokeDay, smokeDayLit, smokeNight, smokeNightLit }) {
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: firePoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: new THREE.Color(0, 0, 0),
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  pool.scale.set(4.6, 1, 4.6); pool.position.set(x, y + 0.06, z);
  pool.layers.set(LAYER_SOFT); pool.renderOrder = 2; pool.name = 'campfire-glow';
  group.add(pool);
  for (const o of [flames, sparks, smoke, pool]) { o.userData.noMerge = true; o.castShadow = o.receiveShadow = false; }
  const poolCol = new THREE.Color('#ff9a48'), ash = new THREE.Color('#77706a'), emberCol = new THREE.Color('#e8561a'), coalCold = new THREE.Color('#3a3634'), coalHot = new THREE.Color('#2e2622');
  const steamCol = new THREE.Color('#eceae6');
  const show = (o, on) => { if (o.visible !== on) o.visible = on; };
  updaters.push((dt, t) => {
    if (flames.castShadow) flames.castShadow = flames.receiveShadow = false;
    const n = LIGHT.night, F = fuel.flame || 0, E = fuel.ember || 0, S = fuel.smoke || 0, W = fuel.steam || 0;
    const f = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 5.1);
    // the light: the flames give most of it, the coals a little red glow on their own; by day it barely shows
    const L = F * 0.92 + E * 0.12;
    light.intensity = L > 0.005 ? (0.8 + n * 6.4) * L * (F > 0.02 ? f : 0.9 + 0.1 * Math.sin(t * 2.3)) : 0;
    emberMat.color.copy(ash).lerp(emberCol, Math.min(1, E * 1.4));
    emberMat.emissiveIntensity = E * (0.5 + n * 0.25) * (0.85 + 0.15 * Math.sin(t * 3.7) * Math.sin(t * 1.3));
    coalMat.color.copy(coalCold).lerp(coalHot, E);
    coalMat.emissiveIntensity = E * (0.3 + n * 0.45 + 0.12 * Math.sin(t * 2.1 + 1));
    show(flames, F > 0.01);
    show(sparks, F > 0.12);
    show(smoke, S > 0.02);
    show(pool, n > 0.02 && L > 0.01);
    const fu = flames.material.uniforms;
    fu.uTime.value = t % 1000; fu.uBright.value = 1.0 + n * 0.45; fu.uSize.value = 0.18 + 0.82 * F;
    for (const p of [sparks, smoke]) p.material.uniforms.uTime.value = t % 1000;
    sparks.material.uniforms.uK.value = (0.7 + n * 0.5) * Math.min(1, F * 1.3);
    const su = smoke.material.uniforms;
    su.uCol.value.copy(smokeDay).lerp(smokeNight, n).lerp(steamCol, W);
    su.uCol2.value.copy(smokeDayLit).lerp(smokeNightLit, n).lerp(steamCol, W);
    su.uK.value = (1 - n * 0.35) * S * 1.5;
    if (pool.visible) pool.material.color.copy(poolCol).multiplyScalar(n * 0.46 * Math.min(1, L * 1.25) * (0.92 + 0.08 * f));
  });
  return { light, pool, flames, sparks, smoke };
}
