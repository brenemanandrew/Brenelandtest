// The backdrop mountains: the Blue Ridge and the Pisgah range as seen from Arden, NC. Old, rounded, forested ridges in long
// layers one behind another, each farther layer lighter and bluer (the haze), mist in the valleys between them, no snow and no
// rock spires. Placed by compass from Arden in the game's axes
// (north = -z, the town; west = -x, the woods): Mount Pisgah with its TV tower to the west-south-west, Cold Mountain and
// the Shining Rock ridge behind it to the west, the Great Balsams' long high crest and the Parkway's crest along the far
// western skyline, and far and faint to the north-north-east the Great Craggies and the Black Mountains (Mount Mitchell's
// long high ridge). Heights are relative (the valley about 650 m, the tops about 1800 m) and exaggerated about four times
// so they read at game distances.
//
// One mesh, one draw call, on the soft layer (no ink lines on a hazy silhouette), no shadows, no textures. Its own small
// shader: the fog cannot do the haze (the scene's fog is solid by 780 m and these stand 500 to 1500 m out), so each vertex
// carries its layer's haze and a valley mist weight, and the shader mixes toward the haze colour, which follows the
// scene's fog (and so daynight: sunrise and sunset tint it, night turns the layers into dark silhouettes), pulled toward a
// Blue Ridge blue by day. When the weather or the woods close the fog in, the ridges fade into it like everything else.
// The near ridges show an October mosaic of oranges, reds and golds over green, the far ones fade to blue-grey.
import * as THREE from 'three';
import { BLUE_RIDGE, PISGAH } from './layout.js';
import { fbm, hash01, smoothstep } from './util.js';
import { LIGHT } from './daynight-mats.js';
import { soft } from './toon.js';

const D2R = Math.PI / 180;
// a point at a compass bearing (degrees: 0 north, 90 east) and a distance from the ridges' centre
export const atBearing = (deg, r) => [BLUE_RIDGE.cx + Math.sin(deg * D2R) * r, BLUE_RIDGE.cz - Math.cos(deg * D2R) * r];

// A rounded hump: 1 at its top, 0 at +-w degrees, with soft shoulders (old mountains, not cones). `sharp` > 1 narrows the
// top (Pisgah: pointed but rounded).
function hump(d, w, sharp = 1) {
  const u = Math.abs(d) / w;
  if (u >= 1) return 0;
  const c = 0.5 + 0.5 * Math.cos(Math.PI * u);
  return sharp === 1 ? c : Math.pow(c, sharp);
}

// The layers, front to back. from / to: bearings (degrees, may pass 360); base: the crest's general height (m); roll: how
// much it undulates; tops: [bearing, height, half width, sharpness]; haze 0..1 (how far it has faded toward the sky);
// mist: how much more the lower slopes fade (the valleys between layers); mosaic: autumn colours (else blue-green).
const LAYERS = [
  { name: 'near', r: 540, from: 192, to: 384, step: 1.1, base: 64, roll: 9, haze: 0.12, mist: 0.46, mosaic: 0.8,
    tops: [[206, 14, 30], [238, 19, 24], [272, 12, 30], [304, 20, 26], [338, 16, 28], [372, 15, 22]] },
  { name: 'second', r: 720, from: 198, to: 374, step: 1.2, base: 112, roll: 12, haze: 0.27, mist: 0.48, mosaic: 0.45,
    tops: [[220, 22, 24], [262, 16, 30], [298, 26, 26], [334, 22, 28], [360, 18, 20]] },
  { name: 'pisgah', r: 900, from: 214, to: 304, step: 1.0, base: 172, roll: 9, haze: 0.4, mist: 0.48, mosaic: 0.12,
    tops: [[PISGAH.bearing, PISGAH.top - 172, 8, 1.7], [PISGAH.bearing + 10, 22, 12], [PISGAH.bearing - 10, 16, 10], [274, 24, 16], [292, 18, 12]] },
  { name: 'cold-mountain', r: 1150, from: 240, to: 306, step: 1.2, base: 250, roll: 10, haze: 0.52, mist: 0.46, mosaic: 0,
    tops: [[262, 78, 9, 1.3], [273, 36, 10], [284, 42, 11], [296, 28, 9]] },
  { name: 'balsams', r: 1450, from: 222, to: 332, step: 1.4, base: 340, roll: 12, haze: 0.64, mist: 0.44, mosaic: 0,
    tops: [[236, 44, 16], [251, 56, 12], [260, 40, 9], [302, 34, 20], [320, 28, 14]] },
  { name: 'craggies', r: 1150, from: 0, to: 46, step: 1.2, base: 220, roll: 10, haze: 0.58, mist: 0.46, mosaic: 0,
    tops: [[15, 26, 10], [26, 46, 8, 1.2], [37, 24, 9]] },
  { name: 'black-mountains', r: 1550, from: 12, to: 64, step: 1.4, base: 300, roll: 9, haze: 0.78, mist: 0.42, mosaic: 0,
    tops: [[30, 34, 16], [36, 50, 11], [45, 32, 11], [53, 20, 10]] },
];
const BOTTOM = -70;                      // every layer runs well down under the ground in front of it
const ROWS = [1, 0.93, 0.84, 0.73, 0.6, 0.45, 0.28, 0.1];

// October on the near ridges: greens with patches of gold, orange, red and brown (the mosaic), and the far blue-green
const MOSAIC = [
  ['#3f6a37', 0.22], ['#4c7839', 0.16], ['#5d803c', 0.1], ['#c99d3c', 0.13], ['#b7863a', 0.07],
  ['#c56f30', 0.13], ['#a9542c', 0.08], ['#94402b', 0.06], ['#7a6838', 0.05],
].map(([c, w]) => [new THREE.Color(c), w]);
const FAR = new THREE.Color('#355a56');
const TOWER = new THREE.Color('#5d6066');
function mosaicColor(u, v, out) {
  let x = (fbm(u, v) * 0.5 + 0.5) * 1.15 - 0.07; // (fbm sits mostly in the middle; stretch it so the rare colours show)
  x = Math.min(0.999, Math.max(0, x));
  let acc = 0;
  for (const [c, w] of MOSAIC) { acc += w; if (x < acc) return out.copy(c); }
  return out.copy(MOSAIC[0][0]);
}

export function crestHeight(L, deg) {
  let h = L.base + fbm(deg * 0.06 + L.r * 0.01, L.r * 0.003) * L.roll + fbm(deg * 0.21 - L.r, 3.1) * L.roll * 0.35;
  for (const [b, th, w, s] of L.tops) h += th * hump(deg - b, w, s);
  // the ends sink away (behind the far shores and the north range), never a cut-off edge
  const end = Math.min(smoothstep(L.from, L.from + 14, deg), smoothstep(L.to, L.to - 14, deg));
  return 12 + (h - 12) * end;
}

function buildGeometry() {
  const pos = [], col = [], mix = [];
  const c = new THREE.Color();
  const tri = (a, b, d, ca, cb, cd, ma, mb, md) => {
    pos.push(...a, ...b, ...d); col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cd.r, cd.g, cd.b); mix.push(...ma, ...mb, ...md);
  };
  LAYERS.forEach((L, li) => {
    const n = Math.ceil((L.to - L.from) / L.step);
    const grid = []; // grid[i][k] = { p: [x, y, z], m: [haze, mist, emit] }
    for (let i = 0; i <= n; i++) {
      const deg = L.from + ((L.to - L.from) * i) / n, h = crestHeight(L, deg);
      const col2 = [];
      for (let k = 0; k <= ROWS.length; k++) {
        const y = k < ROWS.length ? h * ROWS[k] : BOTTOM;
        // the slopes below the crest bulge toward you and wander a little, so the facets catch the light like spurs and coves
        const out = k === 0 ? 0 : (k < ROWS.length ? (1 - ROWS[k]) * h * 0.9 : h * 1.0) * (0.75 + 0.5 * hash01('rg', li, i, k));
        const wob = k === 0 || k === ROWS.length ? 0 : (hash01('rw', li, i, k) - 0.5) * L.step * 0.5;
        const [x, z] = atBearing(deg + wob, L.r - out);
        const mist = k < ROWS.length ? Math.pow(1 - ROWS[k], 1.4) : 1;
        // the colour: a soft mosaic of autumn patches over green on the near ridges (per vertex, so patches blend into each
        // other instead of a quilt of triangles), a blue-green on the far ones
        const vc = FAR.clone().offsetHSL((hash01('rh', li, i) - 0.5) * 0.02, 0, 0);
        if (L.mosaic > 0) vc.lerp(mosaicColor(deg * 0.16 + li * 7.3, y * 0.035 + li, c), L.mosaic * (k < ROWS.length ? 0.55 + 0.45 * ROWS[k] : 0.4));
        col2.push({ p: [x, y, z], m: [L.haze, mist * L.mist, 0], deg, y, c: vc });
      }
      grid.push(col2);
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < ROWS.length; k++) {
        const a = grid[i][k], b = grid[i + 1][k], d = grid[i][k + 1], e = grid[i + 1][k + 1];
        for (const [p, q, r] of [[a, d, b], [b, d, e]]) tri(p.p, q.p, r.p, p.c, q.c, r.c, p.m, q.m, r.m);
      }
    }
  });
  // Mount Pisgah's TV tower: a thin mast on the summit with a red light on top that blinks at night
  const L = LAYERS.find(l => l.name === 'pisgah');
  const top = crestHeight(L, PISGAH.bearing), [tx, tz] = atBearing(PISGAH.bearing, L.r);
  const mast = (x0, z0, y0, y1, w0, w1, color, m) => {
    for (let s = 0; s < 4; s++) {
      const a0 = (s / 4) * Math.PI * 2 + 0.4, a1 = ((s + 1) / 4) * Math.PI * 2 + 0.4;
      const p0 = [x0 + Math.cos(a0) * w0, y0, z0 + Math.sin(a0) * w0], p1 = [x0 + Math.cos(a1) * w0, y0, z0 + Math.sin(a1) * w0];
      const q0 = [x0 + Math.cos(a0) * w1, y1, z0 + Math.sin(a0) * w1], q1 = [x0 + Math.cos(a1) * w1, y1, z0 + Math.sin(a1) * w1];
      tri(p0, q0, p1, color, color, color, m, m, m); tri(p1, q0, q1, color, color, color, m, m, m);
    }
  };
  mast(tx, tz, top - 4, top + 30, 1.6, 0.45, TOWER, [L.haze * 0.9, 0, 0]);
  mast(tx, tz, top + 29.5, top + 32.5, 1.3, 0.2, TOWER, [L.haze * 0.6, 0, 1]); // (emit: the beacon)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aMix', new THREE.Float32BufferAttribute(mix, 3));
  g.computeBoundingSphere();
  return g;
}

const VERT = `
attribute vec3 aMix;
varying vec3 vColor;
varying vec3 vMix;
varying vec3 vW;
void main() {
  vColor = color;
  vMix = aMix;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = `
uniform vec3 uHaze;
uniform vec3 uLight;
uniform vec3 uSunDir;
uniform float uFogK;
uniform float uBlink;
varying vec3 vColor;
varying vec3 vMix;
varying vec3 vW;
void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  if (dot(n, cameraPosition - vW) < 0.0) n = -n;
  float lit = 0.74 + 0.36 * max(dot(n, uSunDir), 0.0);
  vec3 base = vColor * lit * uLight;
  float h = clamp(vMix.x + vMix.y, 0.0, 1.0);
  h = max(h, uFogK);
  vec3 col = mix(base, uHaze, h);
  col = mix(col, vec3(1.0, 0.16, 0.1), vMix.z * uBlink);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// buildRidges(parent, { scene, sun, sunDir }) -> the mesh. Its uniforms are set just before it draws (onBeforeRender), from
// the scene's fog (daynight sets it every frame), the sun's colour and the night.
export function buildRidges(parent, { scene, sun, sunDir }) {
  const BLUE = new THREE.Color('#6c90c8'), WHITE = new THREE.Color(1, 1, 1);
  const U = {
    uHaze: { value: new THREE.Color() }, uLight: { value: new THREE.Color(1, 1, 1) }, uSunDir: { value: sunDir },
    uFogK: { value: 0 }, uBlink: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side: THREE.DoubleSide, fog: false });
  mat.name = 'mountains-ridges';
  const mesh = new THREE.Mesh(buildGeometry(), mat);
  mesh.name = 'mountains';
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.renderOrder = -2; // (opaque, behind everything else on screen: drawing it first saves nothing, but it never sorts oddly)
  mesh.onBeforeRender = () => {
    const night = LIGHT.night || 0, fog = scene.fog;
    U.uHaze.value.copy(fog.color).lerp(BLUE, 0.66 * (1 - night));
    U.uLight.value.copy(WHITE).lerp(sun.color, 0.3).multiplyScalar(1 - 0.9 * night);
    U.uFogK.value = 1 - smoothstep(170, 760, fog.far);
    U.uBlink.value = night > 0.3 && (performance.now() % 2400) < 900 ? Math.min(1, night * 1.4) : 0;
  };
  soft(mesh);
  parent.add(mesh);
  return mesh;
}
export const RIDGE_LAYERS = LAYERS;
