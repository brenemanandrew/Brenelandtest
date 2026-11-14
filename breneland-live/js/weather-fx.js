// Weather visuals, cel style and cheap: every effect is one draw call on the soft layer (never inked) with the
// motion in a vertex shader, so a frame costs a few uniforms and, for the splashes and the mist, a handful of
// ground-height lookups.
//   precipitation: an instanced sheet of streaks (rain, angled by the wind) or flakes (snow) wrapped round the camera;
//                  drops fall everywhere at the global intensity, or only inside the Arkham storm's disc (fading at
//                  its rim); lamplight brightens the drops near a lamp, so rain reads at night; lightning lights it all.
//                  Never inside a room (indoor-rooms.js): from in there you see it rain through the windows and the door
//   splashes:      rings that bloom on the ground (and on the water) where the rain falls (not on a room's floor)
//   mist:          low puffs drifting round you in fog and in the Arkham corner (gone while the camera is in a room)
//   cloud deck:    big dark lumps over the map that fill in as the cover rises (the world's little clouds stay)
//   storm cap:     the Arkham corner's permanent brooding cloud cap, with a dark underside you see from the table
//   leaves:        petals and leaves blown past on a windy day
import * as THREE from 'three';
import { LAYER_SOFT, GRADIENT_3 } from './toon.js';
import { groundHeight, coastSigned, WATER_Y } from './terrain.js';
import { mulberry32 } from './util.js';
import { roomUniforms, roomAt, roomsGlsl } from './indoor-rooms.js';

const soft = (o, order = 6) => { o.layers.set(LAYER_SOFT); o.frustumCulled = false; o.renderOrder = order; return o; };
const quadGeo = () => {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  return g;
};
function radialAlpha(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 63);
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// How many of each thing per graphics level
export const BUDGET = {
  low: { drops: 1200, splashes: 80, mist: 10, leaves: 70, deck: 40, cap: 40 },
  high: { drops: 2600, splashes: 160, mist: 18, leaves: 140, deck: 56, cap: 52 },
  max: { drops: 5200, splashes: 420, mist: 40, leaves: 220, deck: 72, cap: 64 },
};

// ------------------------------------------------------------------ precipitation

function buildPrecip(N) {
  const g = quadGeo();
  const seed = new Float32Array(N * 4), rnd = mulberry32(2024);
  for (let i = 0; i < N * 4; i++) seed[i] = rnd();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uMode: { value: 0 }, uShow: { value: 0 }, uGlobal: { value: 0 }, uAlpha: { value: 0.4 },
      uFlash: { value: 0 }, uLen: { value: 0.42 }, uWidth: { value: 0.02 }, uHide: { value: 0 },
      uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(26, 16, 26) }, uVel: { value: new THREE.Vector3(0, -9, 0) },
      uCol: { value: new THREE.Color('#dfe9f2') }, uLampCol: { value: new THREE.Color('#ffd98e') },
      uStorm: { value: new THREE.Vector4(0, 0, 1, 0) }, uStormIn: { value: 0 }, uLamps: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      ...roomUniforms('uRoomA', 'uRoomB'),
    },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      ${roomsGlsl('inRoom', 'uRoomA', 'uRoomB', 0.45)}
      uniform float uTime, uMode, uShow, uGlobal, uAlpha, uFlash, uLen, uWidth, uHide;
      uniform vec3 uCam, uBox, uVel, uCol, uLampCol;
      uniform vec4 uStorm; uniform float uStormIn; uniform vec4 uLamps[3];
      varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main() {
        float spd = 0.75 + aSeed.w * 0.5;
        vec3 travel = uVel * spd * uTime;
        if (uMode > 0.5) travel.xz += vec2(sin(uTime * 1.6 + aSeed.x * 40.0), cos(uTime * 1.3 + aSeed.y * 30.0)) * 0.7; // flakes wander
        // the sheet wraps round the camera: a drop that falls out of the box comes back in at the top
        vec3 rel = mod(aSeed.xyz * uBox + travel - uCam, uBox) - uBox * 0.5;
        vec3 p = uCam + rel;
        float dStorm = distance(p.xz, uStorm.xy);
        float k = max(uGlobal, uStorm.w * (1.0 - smoothstep(uStormIn, uStorm.z, dStorm)));
        float pick = fract(aSeed.x * 7.31 + aSeed.z * 3.17);
        float horiz = length(rel.xz);
        float nearFade = uMode > 0.5 ? smoothstep(1.2, 3.0, length(rel)) : smoothstep(0.45, 1.6, length(rel)); // no dinner-plate flakes at the lens
        float fade = nearFade * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.49, horiz)) * (1.0 - uHide) * (1.0 - inRoom(p)); // (none under a roof)
        if (pick > uShow * k || fade < 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vUv = uv; vCol = uCol; return; }
        vec3 toCam = normalize(uCam - p);
        vec3 axis = normalize(uVel);
        vec3 right = normalize(cross(axis, toCam));
        vec3 q;
        if (uMode < 0.5) q = p + right * position.x * uWidth + axis * position.y * uLen * spd;   // a streak along the fall
        else { vec3 up = cross(toCam, right); q = p + (right * position.x + up * position.y) * uWidth * (0.7 + aSeed.y * 0.6); } // a flake, facing you
        float lit = 0.0;
        for (int i = 0; i < 3; i++) lit += uLamps[i].w > 0.0 ? 1.0 - smoothstep(0.0, uLamps[i].w, distance(p, uLamps[i].xyz)) : 0.0;
        lit = min(1.0, lit);
        vCol = mix(uCol, uLampCol, lit * 0.85) + uFlash * 0.6;
        vA = uAlpha * fade * k * (1.0 + lit * 1.6 + uFlash * 1.5);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uMode;
      varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main() {
        float a;
        if (uMode < 0.5) { float x = abs(vUv.x - 0.5) * 2.0, y = vUv.y; a = (1.0 - x * x) * smoothstep(0.0, 0.2, y) * smoothstep(1.0, 0.65, y); }
        else { float r = length(vUv - 0.5) * 2.0; a = 1.0 - smoothstep(0.7, 1.0, r); }
        a *= vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'precipitation';
  return soft(m, 7);
}

// ------------------------------------------------------------------ splashes

function buildSplashes(N) {
  const base = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const pos = new Float32Array(N * 3), birth = new Float32Array(N).fill(-1e9);
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
  g.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birth, 1));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color('#e4eef6') }, uK: { value: 0.5 } },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aBirth;
      uniform float uTime;
      varying vec2 vUv; varying float vAge;
      void main() {
        float age = (uTime - aBirth) / 0.42;
        if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAge = 2.0; vUv = uv; return; }
        float r = 0.08 + age * 0.5;
        vec3 q = aPos + vec3(position.x * r, 0.0, position.z * r);
        vAge = age; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uK;
      varying vec2 vUv; varying float vAge;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.62, 0.78, d) * (1.0 - smoothstep(0.86, 1.0, d));     // the ring spreading out
        float dot = (1.0 - smoothstep(0.0, 0.3, d)) * (1.0 - smoothstep(0.0, 0.35, vAge)); // the drop's own splash, briefly
        float a = max(ring, dot) * (1.0 - vAge) * uK;
        if (a < 0.015) discard;
        gl_FragColor = vec4(uCol, a);
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'splashes';
  return soft(m, 5);
}

// ------------------------------------------------------------------ mist (camera-facing puffs near the ground)

function buildMist(N) {
  const g = quadGeo();
  const off = new Float32Array(N * 3), size = new Float32Array(N), sd = new Float32Array(N), rnd = mulberry32(99);
  for (let i = 0; i < N; i++) { size[i] = 5 + rnd() * 7; sd[i] = rnd(); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uCol: { value: new THREE.Color('#dfe3ea') } },
    vertexShader: /* glsl */`
      attribute vec3 aOff; attribute float aSize; attribute float aSeed;
      uniform float uTime;
      varying vec2 vUv; varying float vFade;
      void main() {
        vec3 c = aOff + vec3(0.0, sin(uTime * 0.25 + aSeed * 9.0) * 0.1, 0.0);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * vec2(aSize, aSize * 0.36);
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        vFade = smoothstep(1.5, 7.0, -mv.z) * (1.0 - smoothstep(16.0, 24.0, -mv.z));
      }`,
    fragmentShader: /* glsl */`
      uniform float uK; uniform vec3 uCol;
      varying vec2 vUv; varying float vFade;
      void main() {
        vec2 q = (vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.1, 1.0, length(q))) * uK * vFade * 0.2;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uCol, a);
      }`,
    transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, // thins the ink under the mist (toon.js)
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'weather-mist';
  return soft(m, 4);
}

// ------------------------------------------------------------------ the cloud deck

function buildDeck(N) {
  const mat = new THREE.MeshToonMaterial({ color: new THREE.Color('#ffffff'), gradientMap: GRADIENT_3, emissive: new THREE.Color('#9fb5d6'), emissiveIntensity: 0.35, fog: true });
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, N);
  const rnd = mulberry32(31);
  const base = [];
  for (let i = 0; i < N; i++) {
    // a field over the whole map and well past it, lower than the little fair-weather clouds (90-180 m)
    base.push({ x: -60 + (rnd() - 0.5) * 880, y: 58 + rnd() * 30, z: -56 + (rnd() - 0.5) * 880, sx: 26 + rnd() * 26, sy: 7 + rnd() * 6, sz: 20 + rnd() * 20, ry: rnd() * 6 });
  }
  m.count = 0;
  m.castShadow = m.receiveShadow = false;
  m.frustumCulled = false;
  m.name = 'cloud-deck';
  return { mesh: m, base, mat };
}

// ------------------------------------------------------------------ the Arkham storm cap

const CAP_SPREAD = 0.5, CAP_LUMP = 0.6, CAP_Y = 19; // the cap's width (of the storm's rain radius), its lumps' size, its belly's height (m)
// (lovecraft-setpiece) a fuller storm cloud: the lumps in two tiers that roll against each other (a wide low belly and a heaped crown,
// each an instanced mesh with its own slow turn), lit from inside by the lightning on the side the strike is (per-instance colour
// by bearing: weather.js WEATHER.localBearing), a ragged dark underside that turns, and a bolt from the belly to the roof on a hard
// strike. Phone-friendly: the same lump count as before, split; the colours touched only while a flash is on
function blotchAlpha(n = 128) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), rnd = mulberry32(31);
  g.clearRect(0, 0, n, n);
  for (let i = 0; i < 46; i++) { const r = n * (0.08 + rnd() * 0.12), a = rnd() * Math.PI * 2, d = rnd() * 0.36 * n; const x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildCap(N, cx, cz, R) {
  R *= CAP_SPREAD;
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  // the lumps are lit like any toon cloud (pale tops, shaded bellies), only in a cold grey; the emissive keeps them
  // from going black at night and lights up with the corner's lightning
  // opaque, but written with alpha 0: the ink pass reads that as "no outlines here", so the trees behind the cap are
  // not inked across it (toon.js; the dawn mist uses the same trick)
  const mat = new THREE.MeshToonMaterial({ color: new THREE.Color('#858894'), gradientMap: GRADIENT_3, emissive: new THREE.Color('#2e2c38'), emissiveIntensity: 0.4, fog: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor });
  const rnd = mulberry32(13), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), e = new THREE.Euler();
  const geo = new THREE.IcosahedronGeometry(1, 1), white = new THREE.Color('#ffffff');
  const nLow = Math.round(N * 0.56), nHigh = N - nLow;
  const tiers = [{ n: nLow, ring: [1.0, 0.68], y: [0, 3], s: [4.6, 8.2], spin: 0.012 }, { n: nHigh, ring: [0.58, 0.18], y: [4.5, 11], s: [4.2, 7.6], spin: -0.009 }].map(T => {
    const lumps = new THREE.InstancedMesh(geo, mat, T.n), bearings = new Float32Array(T.n);
    for (let i = 0; i < T.n; i++) {
      const t = i / T.n, ring = T.ring[0] + (T.ring[1] - T.ring[0]) * t;
      const a = rnd() * Math.PI * 2, r = R * ring * (0.8 + rnd() * 0.35), s = (T.s[0] + rnd() * (T.s[1] - T.s[0])) * CAP_LUMP;
      pv.set(Math.cos(a) * r, CAP_Y + (T.y[0] + rnd() * (T.y[1] - T.y[0])) * CAP_LUMP, Math.sin(a) * r);
      e.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5); q.setFromEuler(e);
      lumps.setMatrixAt(i, mx.compose(pv, q, sv.set(s * (1.05 + rnd() * 0.4), s * (0.7 + rnd() * 0.35), s)));
      lumps.setColorAt(i, white); bearings[i] = Math.atan2(Math.cos(a), -Math.sin(a)); // (the world's bearing: x = sin, z = -cos, as weather.js's strikes)
    }
    lumps.instanceMatrix.needsUpdate = true; lumps.instanceColor.needsUpdate = true;
    lumps.castShadow = lumps.receiveShadow = false; lumps.frustumCulled = true;
    lumps.name = 'storm-cap'; soft(lumps, 1); group.add(lumps);
    return { lumps, bearings, spin: T.spin, n: T.n };
  });
  // the underside: a dark soft-edged disc, so from the table the sky is a lid, not a view between lumps; over it a ragged darker
  // layer that turns, so the lid rolls
  const tex = radialAlpha([[0, 1], [0.6, 0.95], [0.85, 0.4], [1, 0]]);
  const underMat = { color: '#23263a', transparent: true, depthWrite: false, fog: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const under = new THREE.Mesh(new THREE.CircleGeometry(R - 1, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ ...underMat, map: tex }));
  under.position.y = CAP_Y + 0.1; under.name = 'storm-cap-under';
  const under2 = new THREE.Mesh(new THREE.CircleGeometry(R - 1.5, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ ...underMat, map: blotchAlpha(), opacity: 0.85 }));
  under2.position.y = CAP_Y - 0.4; under2.name = 'storm-cap-under-roll';
  soft(under, 1); soft(under2, 1);
  under.frustumCulled = under2.frustumCulled = true;
  group.add(under, under2);
  // the bolt: a jagged line from the belly down toward the roofs, shown for a hard strike's flash
  const BOLT_N = 9, bpos = new Float32Array(BOLT_N * 3);
  const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3)); bgeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const bolt = new THREE.Line(bgeo, new THREE.LineBasicMaterial({ color: '#eef2ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  bolt.name = 'storm-bolt'; bolt.frustumCulled = false; bolt.visible = false; soft(bolt, 1); group.add(bolt);
  const boltRnd = mulberry32(17);
  let boltFor = -1;
  const strikeBolt = (bearing, k) => { // a new shape per strike, at the bearing, two thirds of the way out
    const r = R * 0.55, x0 = Math.sin(bearing) * r, z0 = -Math.cos(bearing) * r, y0 = CAP_Y - 0.5, y1 = 9 + k * 2;
    for (let i = 0; i < BOLT_N; i++) { const t = i / (BOLT_N - 1), j = i === 0 || i === BOLT_N - 1 ? 0 : 1; bpos[i * 3] = x0 + (boltRnd() - 0.5) * 2.4 * j; bpos[i * 3 + 1] = y0 + (y1 - y0) * t; bpos[i * 3 + 2] = z0 + (boltRnd() - 0.5) * 2.4 * j; }
    bgeo.attributes.position.needsUpdate = true;
  };
  return { group, lumps: tiers[0].lumps, tiers, under, under2, mat, bolt, strikeBolt, get boltFor() { return boltFor; }, set boltFor(v) { boltFor = v; } };
}

// ------------------------------------------------------------------ blown leaves and petals

function buildLeaves(N) {
  const g = quadGeo();
  const seed = new Float32Array(N * 4), rnd = mulberry32(77);
  for (let i = 0; i < N * 4; i++) seed[i] = rnd();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3(3, 0, 0) }, uHide: { value: 0 }, ...roomUniforms('uRoomA', 'uRoomB') },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      ${roomsGlsl('inRoom', 'uRoomA', 'uRoomB', 0.3)}
      uniform float uTime, uK, uHide;
      uniform vec3 uCam, uWind;
      varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main() {
        vec3 box = vec3(22.0, 8.0, 22.0);
        float spd = 0.6 + aSeed.w * 0.8;
        vec3 travel = uWind * spd * uTime;
        travel.y += sin(uTime * 2.1 * spd + aSeed.x * 50.0) * 1.4;   // lifting and dropping on the gusts
        travel.xz += vec2(sin(uTime * 1.3 + aSeed.y * 20.0), cos(uTime * 1.1 + aSeed.z * 20.0)) * 0.8;
        vec3 rel = mod(aSeed.xyz * box + travel - uCam, box) - box * 0.5;
        rel.y += 1.0; // mostly above the lawn, below the camera
        vec3 p = uCam + rel;
        float pick = fract(aSeed.y * 9.7 + aSeed.w * 2.3);
        float fade = smoothstep(0.6, 1.5, length(rel)) * (1.0 - smoothstep(11.0, 14.5, length(rel.xz))) * (1.0 - uHide) * (1.0 - inRoom(p));
        if (pick > uK || fade < 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vUv = uv; vCol = vec3(1.0); return; }
        // a tumbling card
        float t = uTime * (4.0 + aSeed.x * 5.0) + aSeed.y * 6.0;
        vec3 right = vec3(cos(t), sin(t) * 0.6, sin(t) * 0.8), up = vec3(-sin(t * 0.7), cos(t * 0.7), 0.3);
        float s = 0.16 + aSeed.z * 0.1;
        vec3 q = p + (right * position.x + up * position.y) * s;
        vCol = aSeed.x < 0.35 ? vec3(0.93, 0.56, 0.22) : aSeed.x < 0.6 ? vec3(0.86, 0.33, 0.17) : aSeed.x < 0.8 ? vec3(1.0, 0.72, 0.8) : vec3(0.98, 0.9, 0.45);
        vA = fade;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main() {
        vec2 q = (vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.75, 1.0, length(q * vec2(1.0, 1.6)))) * vA; // a little leaf
        if (a < 0.02) discard;
        gl_FragColor = vec4(vCol, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'blown-leaves';
  return soft(m, 6);
}

// ------------------------------------------------------------------ the controller

export function createWeatherFx(scene, { storm, quality = 'high' }) {
  const group = new THREE.Group();
  group.name = 'weather-fx';
  scene.add(group);
  let budget = BUDGET[quality] || BUDGET.high;
  let precip = null, splashes = null, mist = null, deck = null, leaves = null;
  const cap = buildCap(budget.cap, storm.x, storm.z, storm.r);
  group.add(cap.group);
  const splashList = []; // { x, z, birth }
  const mistList = [];   // { x, y, z, seed }
  const rnd = mulberry32(5);

  function build() {
    for (const o of [precip, splashes, mist, deck?.mesh, leaves]) if (o) { group.remove(o); o.geometry.dispose(); o.material.dispose(); }
    precip = buildPrecip(budget.drops);
    splashes = buildSplashes(budget.splashes);
    mist = buildMist(budget.mist);
    deck = buildDeck(budget.deck);
    leaves = buildLeaves(budget.leaves);
    group.add(precip, splashes, mist, deck.mesh, leaves);
    splashList.length = 0;
    for (let i = 0; i < budget.splashes; i++) splashList.push({ x: 0, z: 0, birth: -1e9 });
    mistList.length = 0;
    for (let i = 0; i < budget.mist; i++) mistList.push({ x: 0, y: 0, z: 0, seed: rnd(), placed: false });
  }
  build();

  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), e = new THREE.Euler();
  const capBase = new THREE.Color('#858894'), capFlash = new THREE.Color('#c8ccff'), capEm = new THREE.Color('#2e2c38');
  const underBase = new THREE.Color('#23263a'), underFlash = new THREE.Color('#9aa0d8');
  const capTmp = new THREE.Color(); let capLit = false; // (lovecraft-setpiece: the cap's per-lump flash colour, touched only while a flash is on)
  const deckDay = new THREE.Color('#f4f6fa'), deckGrey = new THREE.Color('#7d8694'), deckStorm = new THREE.Color('#4e5563');
  const rainDay = new THREE.Color('#dfe9f2'), rainNight = new THREE.Color('#7c8699'), snowCol = new THREE.Color('#ffffff');
  const mistDay = new THREE.Color('#e2e6ec'), mistNight = new THREE.Color('#3e4252'), mistStorm = new THREE.Color('#5c5a74');
  const tmp = new THREE.Color();
  let deckDrift = 0;

  // the camera in a room (indoor-rooms.js: the house and the hallway during the intro, the porch, the game store, the Lovecraft
  // house): the mist and the leaves go (the drops and splashes never fall in a room anyway, wherever the camera is)
  const indoors = c => (roomAt(c.x, c.y, c.z, true) ? 1 : 0);

  return {
    group, cap,
    setQuality(qual) { budget = BUDGET[qual] || BUDGET.high; build(); },
    // W: the WEATHER state; S: { night, fogColor (THREE.Color), lamps: [{x,y,z,color}], windVec: Vector3 (m/s), cam, player, t (seconds), rainAt(x,z) }
    update(dt, W, S) {
      const cam = S.cam, t = S.t, night = S.night;
      const hide = Math.max(indoors(cam), S.indoor || 0);
      // ---- precipitation
      const mode = W.snow > W.rain ? 1 : 0;
      const rainK = Math.max(W.rain, W.local * storm.rain), snowK = W.snow;
      const amount = mode ? snowK : Math.max(W.rain, W.local > 0.01 ? storm.rain : 0);
      const pu = precip.material.uniforms;
      pu.uTime.value = t % 3600; pu.uMode.value = mode; pu.uHide.value = 0;
      pu.uCam.value.copy(cam);
      pu.uGlobal.value = mode ? snowK : W.rain;
      pu.uStorm.value.set(storm.x, storm.z, storm.r, mode ? 0 : storm.rain * (storm.k ?? 1)); pu.uStormIn.value = storm.r - storm.edge;
      pu.uShow.value = Math.min(1, 0.25 + amount * 0.95);
      if (mode) { pu.uVel.value.set(S.windVec.x * 0.6, -1.3 - snowK * 0.6, S.windVec.z * 0.6); pu.uWidth.value = 0.065; pu.uCol.value.copy(snowCol); pu.uAlpha.value = 0.8 - night * 0.3; }
      else { pu.uVel.value.set(S.windVec.x * 0.9, -9 - rainK * 4, S.windVec.z * 0.9); pu.uWidth.value = 0.024; pu.uLen.value = 0.3 + rainK * 0.3; pu.uCol.value.copy(rainDay).lerp(rainNight, night); pu.uAlpha.value = 0.52 - night * 0.26; }
      pu.uFlash.value = W.flash;
      for (let i = 0; i < 3; i++) { const l = S.lamps[i]; if (l) pu.uLamps.value[i].set(l.x, l.y, l.z, l.range); else pu.uLamps.value[i].set(0, 0, 0, 0); }
      if (S.lamps[0]) pu.uLampCol.value.set(S.lamps[0].color || '#ffd98e');
      precip.visible = amount > 0.01;
      // ---- splashes: respawn the dead ones where rain falls (bounded ground lookups per frame)
      const su = splashes.material.uniforms;
      su.uTime.value = t % 3600;
      su.uK.value = (0.45 + 0.35 * (1 - night)) * (1 + W.flash);
      su.uCol.value.copy(rainDay).lerp(rainNight, night * 0.6);
      splashes.visible = !mode && (rainK > 0.02 || W.local > 0.02);
      if (splashes.visible) {
        const a = splashes.geometry.attributes.aPos, b = splashes.geometry.attributes.aBirth;
        const px = S.player.x, pz = S.player.z;
        let spawned = 0, changed = false;
        const want = Math.min(1, 0.15 + amount * 1.0);
        for (let i = 0; i < splashList.length && spawned < 28; i++) {
          const s = splashList[i];
          if (t - s.birth < 0.42) continue;
          if (rnd() > want * 0.5) continue;
          const ang = rnd() * Math.PI * 2, r = 0.8 + Math.sqrt(rnd()) * 9.5;
          const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
          const k = S.rainAt(x, z);
          if (rnd() > k) { continue; }
          const y = coastSigned(x, z) > 0 ? WATER_Y + 0.02 : groundHeight(x, z) + 0.03;
          // (not on a room's floor, nor so near its walls that the ring reaches in: it grows to (0.08 + 0.5) / 2 = 0.29 m and its
          // polygon offset pulls it forward, so one spawned just outside our living room's back wall drew its edge along the inside of
          // the wall's foot, store-dry-test's "rain in our living room", 3-43 px now and then)
          if (roomAt(x, y, z, 0.3)) continue;
          s.x = x; s.z = z; s.birth = t % 3600 + rnd() * 0.12;
          a.setXYZ(i, x, y, z); b.setX(i, s.birth);
          spawned++; changed = true;
        }
        if (changed) { a.needsUpdate = true; b.needsUpdate = true; }
      }
      // ---- mist
      const fogK = Math.min(1, W.fog + W.local * 0.9 + W.rain * 0.12 + W.snow * 0.15);
      const mu = mist.material.uniforms;
      mu.uTime.value = t % 3600;
      mu.uK.value = fogK * (1 - hide);
      mu.uCol.value.copy(mistDay).lerp(mistNight, night).lerp(mistStorm, W.local * 0.6);
      mist.visible = fogK > 0.02 && !hide;
      if (mist.visible) {
        const off = mist.geometry.attributes.aOff;
        const px = S.player.x, pz = S.player.z, R = 20;
        for (let i = 0; i < mistList.length; i++) {
          const m = mistList[i];
          let far = Math.hypot(m.x - px, m.z - pz) > R;
          if (!m.placed || far) { // drop it in again on the far side of where you are heading, at ground level
            const ang = rnd() * Math.PI * 2, r = 4 + rnd() * (R - 6);
            m.x = px + Math.cos(ang) * r; m.z = pz + Math.sin(ang) * r;
            m.y = groundHeight(m.x, m.z) + 0.5 + m.seed * 1.0;
            m.placed = true;
          } else {
            m.x += (S.windVec.x * 0.35 + Math.sin(t * 0.2 + m.seed * 9) * 0.3) * dt;
            m.z += (S.windVec.z * 0.35 + Math.cos(t * 0.17 + m.seed * 7) * 0.3) * dt;
            if ((i + Math.floor(t * 4)) % mistList.length === 0) m.y = groundHeight(m.x, m.z) + 0.5 + m.seed * 1.0; // re-ground one puff a frame
          }
          if (roomAt(m.x, m.y, m.z, 1)) { m.placed = false; off.setXYZ(i, m.x, -50, m.z); continue; } // (never in a room: dropped in again next frame)
          off.setXYZ(i, m.x, m.y, m.z);
        }
        off.needsUpdate = true;
      }
      // ---- the cloud deck: fills in with the cover, darkens with the rain and the storm, drifts on the wind
      const cover = W.cloud;
      const n = Math.round(deck.base.length * Math.min(1, Math.max(0, (cover - 0.12) / 0.78)));
      deck.mesh.count = n;
      deckDrift += (0.6 + W.wind * 7) * dt;
      if (n) {
        const sc = 0.65 + cover * 0.6 + W.storm * 0.15;
        for (let i = 0; i < n; i++) {
          const c = deck.base[i];
          let x = c.x + deckDrift * (0.8 + (i % 5) * 0.1);
          x = -60 - 440 + ((x + 60 + 440) % 880 + 880) % 880;
          e.set(0, c.ry, 0); q.setFromEuler(e);
          deck.mesh.setMatrixAt(i, mx.compose(pv.set(x, c.y, c.z), q, sv.set(c.sx * sc, c.sy * sc, c.sz * sc)));
        }
        deck.mesh.instanceMatrix.needsUpdate = true;
        deck.mat.color.copy(deckDay).lerp(deckGrey, Math.pow(cover, 1.4)).lerp(deckStorm, Math.max(W.storm, W.rain * 0.7));
        deck.mat.color.multiplyScalar(1 - night * 0.75);
        deck.mat.emissive.copy(W.skyCloud).lerp(tmp.set('#dfe4ff'), W.skyFlash);
        deck.mat.emissiveIntensity = W.skyCloudI * (1 - 0.5 * cover) + W.skyFlash * 1.5;
      }
      deck.mesh.visible = n > 0;
      // ---- the Arkham cap: slow turn, a dark lid, lit from inside by its own lightning
      const ck = storm.k ?? 1; // (the cap is only there on the Arkham game's open days; it swells in and out)
      cap.group.visible = ck > 0.01;
      cap.group.scale.setScalar(0.35 + 0.65 * ck);
      for (const T of cap.tiers) T.lumps.rotation.y = t * T.spin; // (the tiers roll against each other)
      cap.under2.rotation.y = -t * 0.02;
      cap.group.position.y = Math.sin(t * 0.3) * 0.25 + (1 - ck) * CAP_Y * 0.65; // (its belly stays at its height while it shrinks)
      const lf = W.localFlash || 0, lb = W.localBearing || 0;
      cap.mat.color.copy(capBase).multiplyScalar(1 - night * 0.6).lerp(capFlash, lf * 0.5);
      cap.mat.emissive.copy(capEm).lerp(capFlash, lf * 0.5);
      cap.mat.emissiveIntensity = 0.4 + lf * 0.9;
      cap.under.material.color.copy(underBase).multiplyScalar(1 - night * 0.5).lerp(underFlash, lf);
      cap.under2.material.color.copy(underBase).multiplyScalar(0.7 - night * 0.3).lerp(underFlash, lf * 0.8);
      // lit from inside on the strike's side: the lumps facing the bearing go pale, the far side stays dark
      if (lf > 0.002 || capLit) {
        capLit = lf > 0.002;
        for (const T of cap.tiers) {
          for (let i = 0; i < T.n; i++) { const w = capLit ? lf * (0.25 + 0.75 * Math.max(0, Math.cos(T.bearings[i] + T.lumps.rotation.y - lb)) ** 2) : 0; capTmp.setRGB(1 + w * 0.6, 1 + w * 0.6, 1 + w * 0.9); T.lumps.setColorAt(i, capTmp); }
          T.lumps.instanceColor.needsUpdate = true;
        }
      }
      // the bolt: a hard strike shows it for its flash (a new jagged shape each strike)
      const boltOn = lf > 0.45 && ck > 0.5;
      if (boltOn && cap.boltFor !== Math.floor(t)) { cap.boltFor = Math.floor(t); cap.strikeBolt(lb, lf); }
      cap.bolt.visible = lf > 0.2 && cap.boltFor >= 0 && t - cap.boltFor < 1.2;
      if (cap.bolt.visible) cap.bolt.material.opacity = Math.min(1, lf * 1.6);
      // ---- leaves
      const lu = leaves.material.uniforms;
      lu.uTime.value = t % 3600; lu.uCam.value.copy(cam); lu.uHide.value = hide;
      lu.uWind.value.copy(S.windVec).multiplyScalar(0.9); if (lu.uWind.value.lengthSq() < 1) lu.uWind.value.set(1, 0, 0);
      const lk = Math.max(0, (W.wind - 0.3) / 0.7) * (1 - W.snow);
      lu.uK.value = Math.min(1, lk * 1.2);
      leaves.visible = lk > 0.01 && !hide;
    },
  };
}
