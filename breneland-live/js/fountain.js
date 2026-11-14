// Strickler Park's fountain (fountain-v3, 2026-11-08): the PM's Blender fountain brought into the game. Andrew: "it looks like
// octagons, and the water doesn't look like water" / "Your fountain is great. Make sure the water rushing off the sides goes
// over the sides, not under it." Every profile, radius and height is assets/blender/scripts/fountain_v3.py's (metres, y up here).
//   stone   turned (THREE.LatheGeometry, 64 round) into the park's vertex-colour batch: the basin with
//           its rolled rim and mosaic-blue floor, the pedestal and middle bowl, the stem and top bowl, the bronze finial
//   water   ONE mesh, ONE ShaderMaterial: the pool and the two brimming bowl surfaces, the two falling curtains (each crests
//           OVER its bowl's rolled rim in an arc and falls outside it in a parabola, the script's curtain()), the centre jet.
//           A per-vertex `aInfo` (kind, radius, ring-or-fall) tells the shader which it is drawing: see-through tinted
//           teal, a fresnel rim with the sky in it, a toon glint, ripple normals on the surfaces (rings where the curtains
//           land), white foam streaks scrolling down the curtains (thin at the crest, thick at the foot), all moved by time
//   foam    one instanced mesh of flat white lumps: rings where the curtains land, a few round the jet's foot and its crown
//   apron   (fountain-apron) the flagstone ring round the basin out to 3.5 m: one mesh draped over the ground a few cm up
//           (it follows the slope), its stones and dark joints painted once into a small canvas (no per-stone geometry, so
//           no inked twigs), its outer edge fading into the grass; soft layer (no ink, no shadow casting): one draw call
//   drops   one instanced mesh of droplets thrown up by the jet, falling back into the top bowl (a pure function of time)
// Night: the park's light spot stays; the water goes darker and keeps its glints. Nothing allocates per frame.
import * as THREE from 'three';
import { toon, soft, GRADIENT_4 } from './toon.js';
import { groundTop } from './terrain.js';
import { addNightSpot, LIGHT } from './daynight-mats.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';
import { SUN_DIR } from './world.js';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const arc = (cx, cy, R, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => { const a = (a0 + (a1 - a0) * k / n) * RAD; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });

export const SEG = 64; // round, not octagons
const SCRIPT_R = 2.4;  // the script was drawn round layout.js's FOUNTAIN.r of the day; a World Editor r scales the radii by r / 2.4

// the script's profiles, [r, y] from the fountain's centre on the ground (the basin gets a skirt into the ground for slopes;
// the apron is draped over the ground instead, apronMesh)
const APRON = { r0: 2.5, r1: 3.5, lift: 0.03 }; // (lift: over the drawn ground's top, terrain.js groundTop, so it never z-fights the ground)
const PROFILES = {
  basinOut: [[2.62, -0.3], [2.62, 0.10], [2.64, 0.16], [2.56, 0.22], [2.53, 0.40], ...arc(2.43, 0.52, 0.13, -60, 250, 22), [2.25, 0.36]],
  basinIn: [[2.25, 0.36], [2.23, 0.18], [2.15, 0.14], [0.62, 0.14]],
  pedestal: [[0.62, 0.14], [0.52, 0.18], [0.44, 0.30], [0.36, 0.55], [0.31, 0.85], [0.30, 1.05], [0.33, 1.16], [0.40, 1.22], [0.42, 1.27], [0.36, 1.31], [0.40, 1.36],
    [0.62, 1.44], [0.88, 1.52], [1.05, 1.57], ...arc(1.12, 1.63, 0.075, -110, 250, 16), [1.05, 1.55], [0.95, 1.49], [0.5, 1.46], [0.17, 1.46]],
  stem: [[0.17, 1.46], [0.15, 1.62], [0.12, 1.80], [0.11, 1.96], [0.14, 2.03], [0.12, 2.07], [0.2, 2.12], [0.38, 2.20], [0.50, 2.25], ...arc(0.55, 2.29, 0.05, -110, 250, 12), [0.49, 2.24], [0.3, 2.21], [0.09, 2.21]],
  finial: [[0.09, 2.21], [0.07, 2.30], [0.05, 2.40], [0.06, 2.44], [0.035, 2.47], [0.018, 2.48]],
  jet: [[0.001, 2.47], [0.03, 2.47], [0.026, 2.7], [0.03, 2.86], [0.05, 2.93], [0.035, 2.98], [0.001, 3.0]],
};
// the three bowls: the rolled rim's centre and radius, and the water's level (the two upper ones brim just over their rims)
export const BOWLS = [
  { name: 'basin', cx: 2.43, cy: 0.52, R: 0.13, water: 0.50, inner: 0.33, outer: 2.27 },
  { name: 'middle', cx: 1.12, cy: 1.63, R: 0.075, water: 1.718, inner: 0.13, outer: 1.115 },
  { name: 'top', cx: 0.55, cy: 2.29, R: 0.05, water: 2.352, inner: 0.07, outer: 0.545 },
];
// the script's colours (sRGB-ish picks from its ramps)
const COL = { rim: '#b4a995', stone: '#9b8e7b', tile: '#1a6f85', bronze: '#8a5a2a' };

// the water brims over a bowl's rolled rim (an arc just above it, centre (cx, cy), radius R + a bit) then falls outside it:
// r = r0 + vh t, y = y0 - g t^2 / 2, down to the water below (and a touch under it, so the foot never shows a gap)
function curtainPath(cx, cy, R, y1, vh, thick) {
  const Rw = R + thick * 0.75;
  const path = [100, 85, 70, 55, 40, 25].map(a => [cx + Rw * Math.cos(a * RAD), cy + Rw * Math.sin(a * RAD)]);
  const [r0, y0] = path[path.length - 1], g = 9.8, T = Math.sqrt(2 * (y0 - (y1 - 0.04)) / g), n = 18;
  for (let k = 1; k <= n; k++) { const t = T * Math.pow(k / n, 0.8); path.push([r0 + vh * t, y0 - 0.5 * g * t * t]); }
  return path;
}

// a turned surface. info: { kind, ring } writes the water's per-vertex info: kind (0 a pool, 1 a fall, 2 the jet), the
// vertex's radius, and ring (a pool: where the curtain lands) or, for a fall or the jet, 0 at the start .. 1 at the end by length
function lathe(prof, k, seg, info) {
  const pts = prof.map(([r, y]) => new THREE.Vector2(r * k, y));
  const geo = new THREE.LatheGeometry(pts, seg);
  if (info) {
    const n = pts.length, cnt = geo.attributes.position.count, a = new Float32Array(cnt * 3), len = [0];
    for (let j = 1; j < n; j++) len.push(len[j - 1] + pts[j].distanceTo(pts[j - 1]));
    for (let i = 0; i < cnt; i++) { const j = i % n; a[i * 3] = info.kind; a[i * 3 + 1] = pts[j].x; a[i * 3 + 2] = info.ring !== undefined ? info.ring : len[j] / len[n - 1]; } // (three's lathe lays its vertices segment by segment, point by point)
    geo.setAttribute('aInfo', new THREE.BufferAttribute(a, 3));
  }
  return geo;
}

// ---------------------------------------------------------------- the apron
// Irregular flagstones (a jittered Voronoi, about 0.5 m stones) in warm greys with darker joints, painted once into a canvas
// mapped flat over the apron's disc; past r 3.32 the stones fade into the grass. Shared by every fountain built.
let apronTex = null;
function apronTexture() {
  if (apronTex) return apronTex;
  const N = 512, R = APRON.r1, cell = 0.52, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const h2 = (i, j, s) => { let h = Math.imul(i * 374761393 + j * 668265263 + s * 2246822519, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const site = (i, j) => [(i + 0.05 + 0.9 * h2(i, j, 1)) * cell, (j + 0.05 + 0.9 * h2(i, j, 2)) * cell];
  const joint = [92, 84, 74], fade0 = 3.3, fade1 = R;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const x = ((px + 0.5) / N * 2 - 1) * R, z = ((py + 0.5) / N * 2 - 1) * R, r = Math.hypot(x, z), o = (py * N + px) * 4;
    if (r > R + 0.05 || r < APRON.r0 - 0.15) { d[o + 3] = 0; continue; }
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    let d1 = 1e9, d2 = 1e9, bi = 0, bj = 0;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const [sx, sz] = site(i, j), dd = Math.hypot(x - sx, z - sz);
      if (dd < d1) { d2 = d1; d1 = dd; bi = i; bj = j; } else if (dd < d2) d2 = dd;
    }
    const edge = (d2 - d1) / 2; // the distance to the nearest joint
    const t = h2(bi, bj, 3), warm = h2(bi, bj, 4) * 10;
    let rr = 168 + t * 34 + warm, gg = 160 + t * 32, bb = 146 + t * 28 - warm * 0.5; // warm grey, each stone its own shade
    const bevel = 1 - 0.14 * (1 - Math.min(1, edge / 0.06)); // a little darker toward its joint, as if rounded
    rr *= bevel; gg *= bevel; bb *= bevel;
    const j = 1 - Math.min(1, Math.max(0, (edge - 0.012) / 0.012)); // the joint, about 3 cm wide, anti-aliased
    d[o] = rr + (joint[0] - rr) * j; d[o + 1] = gg + (joint[1] - gg) * j; d[o + 2] = bb + (joint[2] - bb) * j;
    const a = r < fade0 ? 1 : r > fade1 ? 0 : 1 - (r - fade0) / (fade1 - fade0);
    d[o + 3] = 255 * a * a * (3 - 2 * a);
  }
  g.putImageData(img, 0, 0);
  apronTex = new THREE.CanvasTexture(c); apronTex.colorSpace = THREE.SRGBColorSpace; apronTex.anisotropy = 4;
  return apronTex;
}
// the apron draped over the ground (each vertex its own terrain height, a few cm up) round (fx, fz), in the fountain's space
function apronMesh(fx, fy, fz, k) {
  const rings = [APRON.r0, 2.75, 3.0, 3.2, 3.36, APRON.r1].map(r => r * k), n = SEG, pos = [], uv = [], idx = [];
  for (const r of rings) for (let s = 0; s <= n; s++) {
    const a = s / n * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.push(x, groundTop(fx + x, fz + z) - fy + APRON.lift, z);
    uv.push((x / k / APRON.r1 + 1) / 2, 1 - (z / k / APRON.r1 + 1) / 2);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < n; s++) {
    const p = i * (n + 1) + s, q = p + n + 1;
    idx.push(p, p + 1, q, p + 1, q + 1, q); // (wound to face up)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ map: apronTexture(), gradientMap: GRADIENT_4, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'fountain-apron'; m.position.set(fx, fy, fz); m.renderOrder = -1; m.receiveShadow = true; m.castShadow = false;
  return soft(m);
}

// ---------------------------------------------------------------- the water
export function waterMaterial(center) {
  return new THREE.ShaderMaterial({
    name: 'fountain-water',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uNight: { value: 0 },
      uCenter: { value: center.clone() },
      uDeep: { value: new THREE.Color('#2f9ec4') },    // the render's teal-blue, seen through to the mosaic floor
      uShallow: { value: new THREE.Color('#6fd6e6') },
      uSky: { value: new THREE.Color('#cfeaff') },
      uFoam: { value: new THREE.Color('#ffffff') },
      uSun: { value: SUN_DIR.clone() },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      attribute vec3 aInfo;
      uniform float uTime;
      varying vec3 vInfo, vN, vV, vW;
      varying vec2 vUv;
      void main() {
        vInfo = aInfo; vUv = uv;
        vec3 p = position;
        // a fall: a swell travelling down the sheet, bigger toward the foot; the jet sways a little
        if (aInfo.x > 0.5 && aInfo.x < 1.5) p += normal * 0.014 * aInfo.z * sin(aInfo.z * 22.0 - uTime * 7.0 + uv.x * 31.4);
        if (aInfo.x > 1.5) p.xz += vec2(sin(uTime * 5.0 + p.y * 9.0), cos(uTime * 4.3 + p.y * 9.0)) * 0.006 * aInfo.z;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime, uNight;
      uniform vec3 uCenter, uDeep, uShallow, uSky, uFoam, uSun;
      varying vec3 vInfo, vN, vV, vW;
      varying vec2 vUv;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float kind = vInfo.x;
        vec3 V = normalize(vV);
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        vec3 col = uDeep;
        float foam = 0.0, a = 0.55;
        if (kind < 0.5) {
          // a surface: ripple normals from rings spreading out from where the curtain lands (vInfo.z) and two travelling waves
          vec2 p = vW.xz - uCenter.xz;
          float r = max(length(p), 0.001);
          vec2 rd = p / r;
          float ring = r - vInfo.z, env = exp(-abs(ring) * 2.4);
          vec2 g = rd * cos(ring * 26.0 - uTime * 7.0) * 0.3 * env
                 + vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 7.0 + uTime * 1.7) * 0.028
                 + vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 11.0 - uTime * 1.3) * 0.03;
          N = normalize(N + vec3(-g.x, 0.0, -g.y));
          float shallow = smoothstep(0.35, 0.0, abs(ring) + 0.15 * vn(p * 3.0 + uTime * 0.4));
          col = mix(uDeep, uShallow, shallow * 0.5);
          // (town-fixes) the churn where a curtain lands, as in the render: a white band of froth just round the foot, broken up
          // by moving lumps of noise, and scraps of foam drifting out from it
          float ang = atan(p.y, p.x), churn = vn(vec2(ang * 22.0, r * 18.0 - uTime * 3.0)) * 0.6 + vn(vec2(ang * 47.0 + 3.0, r * 31.0 + uTime * 2.2)) * 0.4;
          float band = exp(-abs(ring) * 7.0) * step(0.001, vInfo.z);
          foam = band * smoothstep(0.3, 0.55, churn + band * 0.25);
          foam = max(foam, 0.6 * step(0.0, ring) * exp(-ring * 3.2) * step(0.001, vInfo.z) * step(0.7, vn(vec2(ang * 15.0, ring * 9.0 - uTime * 0.9))));
        } else if (kind < 1.5) {
          // a falling curtain: white streaks stretched down the fall, scrolling down, thin at the crest and thick at the foot
          float v = vInfo.z;
          float s = vn(vec2(vUv.x * 80.0, v * 2.6 - uTime * 2.4)) * 0.72 + vn(vec2(vUv.x * 131.0 + 7.0, v * 5.0 - uTime * 3.1)) * 0.28;
          float th = 0.78 - 0.34 * v;
          foam = smoothstep(th, th + 0.07, s);
          foam = max(foam, (1.0 - smoothstep(0.0, 0.07, v)) * 0.55); // the bright lip where it rolls over the rim
          a = 0.6;
        } else {
          // the jet: a slim column bubbling white at its crown, streaks racing up
          float v = vInfo.z;
          foam = smoothstep(0.62, 0.72, vn(vec2(vUv.x * 8.0, v * 3.0 + uTime * 5.0))) * 0.7 + smoothstep(0.72, 1.0, v);
          a = 0.75;
        }
        // see-through tinted water with a little sky in its rim, lit in two cel steps (a surface's step follows its ripples), a
        // hard toon glint and a softer band of glitter
        float lit = dot(N, uSun);
        col *= lit > (kind < 0.5 ? uSun.y - 0.05 : 0.25) ? 1.0 : 0.84;
        float fr = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
        col = mix(col, uSky, fr * (kind < 0.5 ? 0.3 : 0.5));
        a = mix(a, 0.9, fr);
        vec3 R = reflect(-uSun, N);
        float glint = step(0.35, pow(max(dot(R, V), 0.0), 60.0)), wide = step(0.5, pow(max(dot(R, V), 0.0), 14.0));
        col += uFoam * wide * 0.08;
        col = mix(col, uFoam, glint * 0.9); a = max(a, glint * 0.95);
        col = mix(col, uFoam, foam); a = mix(a, 0.96, foam);
        col = mix(col, col * 0.36 + vec3(0.03, 0.08, 0.16) + uFoam * glint * 0.3, uNight * 0.85); // night: darker, the glints stay
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- the build
// b: the park's Batcher (the stone goes in it), g: the park's group, (fx, fy, fz): the fountain's spot on the ground, FR: layout's
// r (2.4 = the script's size). Returns { lands, meshes, api }: where the curtain lands (the plips), the meshes that cast no shadow,
// and the numbers the tests read.
export function buildFountain({ b, g, fx, fy, fz, FR, colliders, updaters }) {
  const k = FR / SCRIPT_R;
  const at = { x: fx, y: fy, z: fz };
  const stone = (prof, col, seg = SEG) => b.add(lathe(prof, k, seg), col, at);
  const apron = apronMesh(fx, fy, fz, k); g.add(apron);
  stone(PROFILES.basinOut, COL.rim); stone(PROFILES.basinIn, COL.tile);
  stone(PROFILES.pedestal, COL.stone, 48); stone(PROFILES.stem, COL.stone, 48); stone(PROFILES.finial, COL.bronze, 24);
  colliders.push({ type: 'circle', x: fx, z: fz, r: 2.64 * k + 0.1 });
  addNightSpot({ x: fx, y: fy + 1.7, z: fz, color: '#9fd4ff', pool: 2.3 * k, poolK: 0.55, gy: fy + 0.52, halo: 1.0, flicker: 0.15 });

  // the water: the three surfaces, the jet, the two curtains (the outer ones last: they blend over the rest)
  const [basin, mid, top] = BOWLS;
  const fallTop = curtainPath(top.cx, top.cy, top.R, mid.water, 0.42, 0.022), fallMid = curtainPath(mid.cx, mid.cy, mid.R, basin.water, 0.62, 0.03);
  const landTop = fallTop[fallTop.length - 1][0], landMid = fallMid[fallMid.length - 1][0];
  const surface = (bw, ring) => lathe([[bw.inner, bw.water], [(bw.inner + bw.outer) / 2, bw.water], [bw.outer, bw.water]], k, SEG, { kind: 0, ring: ring * k });
  const water = new THREE.Mesh(mergeGeometries([
    surface(basin, landMid), surface(mid, landTop), surface(top, 0),
    lathe(PROFILES.jet, k, 16, { kind: 2 }),
    lathe(fallTop, k, SEG, { kind: 1 }), lathe(fallMid, k, SEG, { kind: 1 }),
  ], false), waterMaterial(new THREE.Vector3(fx, fy, fz)));
  water.position.set(fx, fy, fz); water.name = 'fountain-water'; water.renderOrder = 1; water.castShadow = false; water.receiveShadow = false;
  g.add(water);

  // foam: flat white lumps where the curtains land, a few round the jet's foot and on its crown; they bob a little
  // (town-fixes: richer, as in the render: where each curtain lands a packed ring of big overlapping lumps, a looser ring of
  // smaller ones just outside it, and a few sitting higher on top; [radius, water y, lump size, count, lift])
  const rings = [[landMid, basin.water, 0.1, 120, 0], [landMid + 0.11, basin.water, 0.065, 90, 0], [landMid - 0.02, basin.water, 0.07, 48, 0.035],
    [landTop, mid.water, 0.062, 72, 0], [landTop + 0.07, mid.water, 0.04, 48, 0], [0.06, top.water, 0.035, 10, 0], [0.025, 2.93, 0.03, 9, 0]];
  const lumps = [], rnd = mulberry32(5);
  for (const [r, y0, minor, n, lift] of rings) for (let i = 0; i < n; i++) {
    const y = y0 + lift;
    const a = TAU * i / n + (rnd() - 0.5) * 0.08, rr = (r + (rnd() - 0.5) * 1.2 * minor) * k, s = minor * (0.6 + rnd() * 0.55);
    lumps.push({ x: fx + Math.cos(a) * rr, y: fy + y, z: fz + Math.sin(a) * rr, s, ph: rnd() * TAU });
  }
  const LUMP = new THREE.SphereGeometry(1, 6, 3); // (24 triangles a lump, flattened: a phone draws the rings twice a frame; town-fixes: more lumps, cheaper ones)
  const foam = new THREE.InstancedMesh(LUMP, toon('#f4fbff', { emissive: '#dcf2ff', emissiveIntensity: 0.3 }), lumps.length);
  foam.name = 'fountain-foam'; foam.castShadow = false; foam.frustumCulled = false; g.add(foam); // (not culled: an instanced mesh's bounds are its one lump at the origin)
  // droplets: thrown up by the jet, falling back into the top bowl, each on its own seeded arc (a pure function of time)
  const DROPS = 28, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), toon('#e4f6ff', { emissive: '#8fd0ea', emissiveIntensity: 0.3 }), DROPS);
  drops.name = 'fountain-drops'; drops.castShadow = false; drops.frustumCulled = false; g.add(soft(drops));
  const dr = mulberry32(7), arcs = [];
  for (let i = 0; i < DROPS; i++) {
    const vr = 0.3 + dr() * 0.45, vz = dr() * 0.6, life = (vz + Math.sqrt(vz * vz + 4 * 4.9 * (2.95 - top.water))) / 9.8; // until it meets the top bowl's water
    arcs.push({ a: dr() * TAU, vr, vz, life, ph: dr(), s: 0.01 + dr() * 0.012 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  updaters.push((dt, t) => {
    for (let i = 0; i < lumps.length; i++) {
      const L = lumps[i], s = L.s * (1 + 0.1 * Math.sin(t * 3.1 + L.ph));
      foam.setMatrixAt(i, m4.compose(p.set(L.x, L.y + 0.01 * Math.sin(t * 2.3 + L.ph), L.z), q, sc.set(s, s * 0.42, s)));
    }
    foam.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < DROPS; i++) {
      const A = arcs[i], tt = ((t * 0.9 + A.ph) % 1) * A.life, rr = A.vr * tt * k;
      drops.setMatrixAt(i, m4.compose(p.set(fx + Math.cos(A.a) * rr, fy + 2.95 + A.vz * tt - 4.9 * tt * tt, fz + Math.sin(A.a) * rr), q, sc.set(A.s, A.s * 1.6, A.s)));
    }
    drops.instanceMatrix.needsUpdate = true;
    water.material.uniforms.uTime.value = t % 600;
    water.material.uniforms.uNight.value = LIGHT.night;
  });

  // where the middle curtain lands, for the plips (town-sfx.js), at the pool's level
  const lands = []; for (let j = 0; j < 6; j++) { const a = j / 6 * TAU + 0.3; lands.push([fx + Math.cos(a) * landMid * k, fz + Math.sin(a) * landMid * k, a]); }
  const api = {
    seg: SEG, k, water, foam, drops, apron, apronR: APRON.r1 * k, apronInR: APRON.r0 * k, landY: fy + basin.water,
    bowls: BOWLS.map(bw => ({ name: bw.name, rimR: (bw.cx + bw.R) * k, rimTopY: fy + bw.cy + bw.R, rimY: fy + bw.cy, waterY: fy + bw.water, outerR: bw.outer * k })),
    curtains: [{ bowl: 2, crestY: fy + Math.max(...fallTop.map(p => p[1])), footR: landTop * k, footY: fy + mid.water }, { bowl: 1, crestY: fy + Math.max(...fallMid.map(p => p[1])), footR: landMid * k, footY: fy + basin.water }],
  };
  return { lands, meshes: [water, foam, drops, apron], api };
}
