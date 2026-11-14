// The backyard world: sky, sun, ocean, mountains, woods, the neighborhood across the
// street, the fence, trails, lawn and trees. The house and the game areas live in
// house.js and areas.js.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import {
  COAST, WALK, FENCE_Z, FENCES, GATES, STREET, MAILBOX, TRAILS, YARD_TREES, SWING_TREE, SHORE_ROCKS, DOCK, SWIM_ZONE, MAP, PLAZA_EDGE, resolveTrail, HOUSE, SIDEWALK_W,
  VAN_STOP, JOYCE_HOME,
} from './layout.js';
import { JH } from './joyce-house-plan.js';
import { buildTerrain, terrainHeight, groundHeight, coastSigned, onSurface, WATER_Y, roadEdgeDist, surfaceCount, lawnEdge } from './terrain.js';
import { trailShape, polyDist, nameSeed } from './trail-shape.js';
import { toon, glow, soft } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { addCarModel, CAR_KINDS } from './car-models.js';
import { mulberry32, pointInPoly, closestOnPoly, smoothPath, fbm, hash01, smoothstep } from './util.js';
import { buildSwingTree } from './swing.js';
import { addTree, buildForest, auditYardTrees, auditAttachment } from './world-trees.js';
import { windowGlass, lampGlow, addNightSpot, WEATHER } from './daynight-mats.js';
import { buildTown } from './world-town.js';
import { buildRidges } from './world-ridges.js';
import { fishShackModel } from './fish-shack-model.js';   // (fish-shack-setpiece) the pier is the Blender set piece's when it loaded
import { view as lodView } from './perf-flags.js';

// Morning sun: low in the east-north-east, over the ocean.
const SUN_AZ = THREE.MathUtils.degToRad(68), SUN_EL = THREE.MathUtils.degToRad(26);
export const SUN_DIR = new THREE.Vector3(Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)).normalize();

export const PALETTE = {
  skyTop: '#5aa5ea', skyMid: '#b9dff0', skyHorizon: '#ffe3b8', skyLow: '#f6d2a8', fog: '#f3dcc0',
  sun: '#fff1cf', waterDeep: '#1f6f9a', waterMid: '#2f9bb4', waterShallow: '#6fd3c8', foam: '#f4fbff',
};

// ------------------------------------------------------------------ sky

function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uMid: { value: new THREE.Color(PALETTE.skyMid) },
      uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      uLow: { value: new THREE.Color(PALETTE.skyLow) },
      uSun: { value: new THREE.Color(PALETTE.sun) },
      uSunDir: { value: SUN_DIR.clone() },
      // night (daynight.js drives these): the moon, the stars, a faint warm glow over the town to the north
      uMoonDir: { value: new THREE.Vector3(0.3, 0.6, 0.5).normalize() },
      uMoon: { value: 0 },
      uStars: { value: 0 },
      uGlow: { value: new THREE.Color(0) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // pin to the far plane
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uHorizon, uLow, uSun, uSunDir, uMoonDir, uGlow;
      uniform float uMoon, uStars, uTime;
      varying vec3 vDir;
      float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float sd = max(dot(d, uSunDir), 0.0);
        vec3 horizon = mix(uHorizon, uSun, pow(sd, 6.0) * 0.5);
        // horizon peach -> clear pale aqua -> blue (a straight peach-to-blue mix goes grey-lilac in the middle)
        float t = clamp(h, 0.0, 1.0);
        vec3 up = mix(mix(horizon, uMid, smoothstep(0.0, 0.3, t)), uTop, smoothstep(0.26, 0.95, t));
        vec3 col = h > 0.0 ? up : mix(horizon, uLow, clamp(-h * 4.0, 0.0, 1.0));
        col += uGlow * (1.0 - smoothstep(0.0, 0.2, abs(h))) * smoothstep(0.1, -0.7, d.z);
        // cel sun: hard disc, one soft-edged halo ring, and a wide warm glow toward the horizon
        float up2 = smoothstep(-0.05, 0.01, uSunDir.y);
        col += uSun * pow(sd, 14.0) * 0.16;
        col = mix(col, uSun, smoothstep(0.9915, 0.9935, sd) * 0.3 * up2);
        col = mix(col, uSun * 1.6, smoothstep(0.99915, 0.99935, sd) * up2);
        // stars: one per cell of a grid on a big sphere, a few bright ones with a twinkle and a little cross
        if (uStars > 0.003 && h > 0.0) {
          vec3 p = d * 70.0;
          vec3 c = floor(p);
          float r = hash3(c);
          if (r > 0.9) {
            vec3 j = vec3(hash3(c + 11.1), hash3(c + 23.7), hash3(c + 37.3)) * 0.5 + 0.25;
            vec3 sp = normalize(c + j) * 70.0;
            vec3 dv = p - sp;
            float dist = length(dv);
            float big = step(0.985, r);
            float size = mix(0.1, 0.2, big) * (0.8 + hash3(c + 5.3) * 0.5);
            float tw = 0.6 + 0.4 * sin(uTime * (1.3 + r * 4.0) + r * 91.0);
            float s = 1.0 - smoothstep(size * 0.55, size, dist);
            // the bright ones get a four-point sparkle
            vec3 ax = normalize(cross(d, vec3(0.0, 1.0, 0.0)));
            vec3 ay = cross(ax, d);
            float cx = abs(dot(dv, ax)), cy = abs(dot(dv, ay));
            float cross4 = big * (1.0 - smoothstep(0.0, 0.035, min(cx, cy))) * (1.0 - smoothstep(0.0, 0.55, max(cx, cy)));
            vec3 starCol = mix(vec3(1.0, 0.95, 0.82), vec3(0.8, 0.88, 1.0), hash3(c + 2.7));
            col += starCol * (s * mix(0.7, 1.4, big) + cross4 * 0.8) * tw * uStars * smoothstep(0.03, 0.22, h);
          }
        }
        // the moon: a pale cel disc with three soft craters and a cool halo
        if (uMoon > 0.003) {
          float md = dot(d, uMoonDir);
          col += vec3(0.5, 0.62, 1.0) * (pow(max(md, 0.0), 900.0) * 0.28 + pow(max(md, 0.0), 40.0) * 0.05) * uMoon;
          float disc = smoothstep(0.99933, 0.99946, md);
          if (disc > 0.0) {
            vec3 T = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
            vec3 B = cross(T, uMoonDir);
            vec2 q = vec2(dot(d, T), dot(d, B)) / 0.0345;
            float cr = step(length(q - vec2(0.28, 0.24)), 0.24) + step(length(q - vec2(-0.34, -0.08)), 0.17) + step(length(q - vec2(0.08, -0.46)), 0.13);
            vec3 mc = mix(vec3(1.0, 0.97, 0.86), vec3(0.8, 0.82, 0.86), min(cr, 1.0) * 0.75) * 1.35;
            col = mix(col, mc, disc * uMoon);
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.name = 'sky';
  return sky;
}

// ------------------------------------------------------------------ water

function coastTexture() {
  const W = 512, H = 512;
  const rect = [-165, -218, 390, 410]; // x0, z0, width, depth: both lakes
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = rect[0] + ((i + 0.5) / W) * rect[2];
      const z = rect[1] + ((j + 0.5) / H) * rect[3];
      const s = Math.max(-8, Math.min(32, coastSigned(x, z)));
      data[j * W + i] = Math.round(((s + 8) / 40) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, rect: new THREE.Vector4(...rect) };
}

function buildWater() {
  const coast = coastTexture();
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uMid: { value: new THREE.Color(PALETTE.waterMid) },
      uShallow: { value: new THREE.Color(PALETTE.waterShallow) },
      uFoam: { value: new THREE.Color(PALETTE.foam) },
      uSky: { value: new THREE.Color('#bfe0f5') },
      uSunCol: { value: new THREE.Color('#fff4d6') },
      uSunDir: { value: SUN_DIR.clone() },
      uGlint: { value: 1 },
      uCoast: { value: coast.tex },
      uCoastRect: { value: coast.rect },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime, uGlint;
      uniform vec3 uDeep, uMid, uShallow, uFoam, uSky, uSunCol, uSunDir;
      uniform sampler2D uCoast;
      uniform vec4 uCoastRect;
      varying vec3 vWorld;
      float coastS(vec2 p) {
        vec2 uv = (p - uCoastRect.xy) / uCoastRect.zw;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 32.0;
        return texture2D(uCoast, uv).r * 40.0 - 8.0;
      }
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      vec2 wave(vec2 p, vec2 dir, float k, float w, float a) {
        return dir * k * a * cos(dot(dir, p) * k - uTime * w);
      }
      void main() {
        vec2 p = vWorld.xz;
        float dist = length(cameraPosition - vWorld);
        float far = smoothstep(50.0, 260.0, dist);           // the small ripples fade with distance: no shimmer at the horizon
        vec2 g = wave(p, normalize(vec2(-0.9, 0.35)), 0.35, 1.2, 0.35)
               + wave(p, normalize(vec2(-0.5, -0.8)), 0.62, 1.7, 0.18)
               + wave(p, normalize(vec2(0.3, 1.0)), 1.1, 2.3, 0.08) * (1.0 - 0.4 * far) + wave(p, normalize(vec2(-1.0, 0.1)), 2.3, 3.1, 0.035) * (1.0 - 0.85 * far);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float s = coastS(p);
        vec3 base = mix(uShallow, uMid, smoothstep(0.5, 8.0, s));
        base = mix(base, uDeep, smoothstep(14.0, 31.0, s));
        // a pale sandy glow right at the edge, as if you could see the beach under the water
        base = mix(base, vec3(0.86, 0.93, 0.78), (1.0 - smoothstep(0.0, 2.6, s)) * 0.42);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 col = mix(base, uSky, fres * 0.5);
        col *= dot(n, uSunDir) > 0.36 ? 1.0 : 0.9;
        // two cel bands of sun glitter: a big soft path and small hard sparkles
        float spec = pow(max(dot(reflect(-uSunDir, n), V), 0.0), 90.0);
        col = mix(col, uSunCol * 1.3, step(0.3, spec) * 0.9 * uGlint);  // uGlint: the sun (or the moon) is up
        float wide = pow(max(dot(reflect(-uSunDir, n), V), 0.0), 14.0);
        col += uSunCol * step(0.5, wide) * 0.07 * uGlint;
        // wave crests: tiny broken white flecks that drift with the swell
        float fleck = vn(p * 1.7 + vec2(uTime * 0.35, -uTime * 0.2)) * vn(p * 0.6 - vec2(uTime * 0.1, 0.0));
        col = mix(col, uFoam, step(0.66, fleck) * (1.0 - far) * step(0.0, s) * 0.55);
        // shore foam: a wobbly white lip, then thin broken lines that roll in and fade
        float sw = s + (vn(p * 0.55 + uTime * 0.04) - 0.5) * 0.9;
        float lip = 1.0 - smoothstep(0.25, 0.85, sw + 0.16 * sin(p.x * 0.6 + p.y * 0.4 + uTime * 1.4));
        float ph = fract(sw * 0.24 + uTime * 0.11);
        float line = smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.045, 0.1, ph));
        line *= step(0.0, s) * (1.0 - smoothstep(2.0, 9.0, s)) * step(0.34, vn(p * vec2(0.9, 0.9) + vec2(uTime * 0.06, 0.0)));
        col = mix(col, uFoam, max(lip, line * 0.8));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1).rotateX(-Math.PI / 2), mat);
  water.position.set(0, WATER_Y, 0);
  water.name = 'water';
  water.receiveShadow = false;
  return water;
}

// ------------------------------------------------------------------ mountains & clouds

// The mountains are the Blue Ridge (world-ridges.js): layered hazy ridges, Mount Pisgah and its tower.

function buildClouds(parent) {
  const rnd = mulberry32(11);
  const group = new THREE.Group();
  const mat = toon('#ffffff', { emissive: '#9fb5d6', emissiveIntensity: 0.35 }).clone(); // its own: daynight.js tints it
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rnd() * 4);
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(GEO.ico1, mat);
      const s = 8 + rnd() * 10;
      m.scale.set(s * 1.3, s * 0.75, s);
      m.position.set((j - n / 2) * 11 + rnd() * 6, rnd() * 5, rnd() * 8);
      c.add(m);
    }
    const ang = rnd() * Math.PI * 2, dist = 260 + rnd() * 380;
    c.position.set(Math.cos(ang) * dist, 90 + rnd() * 90, Math.sin(ang) * dist);
    c.userData.speed = 0.6 + rnd() * 0.8;
    group.add(c);
  }
  parent.add(group);
  const update = dt => {
    for (const c of group.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 700) c.position.x = -700;
    }
  };
  return { update, mat };
}

// Trees live in world-trees.js (one plan per tree: trunks always run up into the canopy).
export { addTree };

// ------------------------------------------------------------------ neighborhood

// `f` collects the fine details (trim, glass, door, knobs): they go on the soft layer so 10 cm boards do not turn
// into dotted ink lines at street distance.
export function addGableHouse(b, f, x, z, w, d, h, wallCol, roofCol, rnd, facing = 1) {
  const y = 0.3;
  const trim = '#fbf7ee', roofDark = new THREE.Color(roofCol).multiplyScalar(0.72).getStyle();
  b.boxMinMax(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, wallCol);
  // stone foundation, white corner boards and a belt line make the box read as a house
  b.boxMinMax(x - w / 2 - 0.06, y, z - d / 2 - 0.06, x + w / 2 + 0.06, y + 0.5, z + d / 2 + 0.06, '#a8a297');
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) f.boxMinMax(x + cx * w / 2 - 0.09, y + 0.5, z + cz * d / 2 - 0.09, x + cx * w / 2 + 0.09, y + h - 0.003, z + cz * d / 2 + 0.09, trim); // (3 mm under the wall's top, not level with it, so they don't flicker)
  const rise = w * 0.28, slope = Math.atan2(rise, d / 2 + 0.5), len = Math.hypot(rise, d / 2 + 0.5);
  for (const side of [-1, 1]) {
    b.add(GEO.box, roofCol, { x, y: y + h + rise / 2, z: z + side * (d / 4 + 0.25), sx: w + 1, sy: 0.3, sz: len + 0.2, rx: side * slope });
    // fascia board along the eave
    f.add(GEO.box, trim, { x, y: y + h - 0.04, z: z + side * (d / 2 + 0.5), sx: w + 0.98, sy: 0.16, sz: 0.1 }); // (1 cm short of the roof's ends: level with them, the corners would flicker)
  }
  f.add(GEO.box, roofDark, { x, y: y + h + rise + 0.14, z, sx: w + 1.05, sy: 0.18, sz: 0.5 }); // ridge cap
  // gable triangles
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const tg = new THREE.ExtrudeGeometry(tri, { depth: w - 0.02, bevelEnabled: false });
  b.add(tg, wallCol, { x: x - w / 2 + 0.01, y: y + h, z, ry: Math.PI / 2 });
  for (const sx of [-1, 1]) f.add(GEO.cyl12, windowGlass(hash01('attic', x, sx)), { x: x + sx * (w / 2 + 0.03), y: y + h + rise * 0.38, z, sx: 0.36, sy: 0.05, sz: 0.36, rz: Math.PI / 2 }); // attic windows
  const fz = z + facing * (d / 2 + 0.06);
  // fb: a box on the front, its depth a..b measured outward from fz (the front details sit on whichever side the house faces;
  // a north-facing house had them all at +z, inside its wall)
  const fb = (x0, y0, a, x1, y1, b, col) => f.boxMinMax(x0, y0, facing > 0 ? fz + a : fz - b, x1, y1, facing > 0 ? fz + b : fz - a, col);
  const doorCol = ['#3f6fa8', '#b8433c', '#2f6b4f', '#6b4a8f'][Math.floor(rnd() * 4)];
  // front door with frame, knob, step and a porch light
  fb(x - 0.72, y + 0.5, -0.06, x + 0.72, y + 2.42, 0.1, trim);
  fb(x - 0.6, y + 0.51, -0.1, x + 0.6, y + 2.3, 0.14, doorCol); // (the door's bottom a hair up inside the frame: level with it, the two flickered from below)
  fb(x + 0.4, y + 1.35, -0.14, x + 0.48, y + 1.43, 0.18, '#e0b54a');
  fb(x - 1.0, y, -0.05, x + 1.0, y + 0.52, 0.9, '#cbc4b8');
  fb(x + 0.85, y + 2.0, -0.05, x + 1.0, y + 2.3, 0.12, lampGlow('#ffe7a8'));
  addNightSpot({ x: x + 0.92, y: y + 2.15, z: fz + facing * 0.12, color: '#ffc978', pool: 2.1, gy: y + 0.52, halo: 0.7 });
  // windows: white frame, glass (lit or dark at night: see daynight-mats.js), cross bars, sill
  const win = (wx, wy, ww, wh) => {
    const glass = windowGlass(hash01('win', Math.round(wx * 10), Math.round(wy * 10)));
    fb(wx - ww / 2 - 0.1, wy - wh / 2 - 0.1, -0.06, wx + ww / 2 + 0.1, wy + wh / 2 + 0.1, 0.1, trim);
    fb(wx - ww / 2, wy - wh / 2, -0.08, wx + ww / 2, wy + wh / 2, 0.14, glass);
    fb(wx - 0.035, wy - wh / 2 + 0.005, 0.1, wx + 0.035, wy + wh / 2 - 0.005, 0.17, trim); // (the bars 5 mm short of the glass's
    fb(wx - ww / 2 + 0.005, wy - 0.035, 0.1, wx + ww / 2 - 0.005, wy + 0.035, 0.17, trim); // edges, so they don't flicker)
    fb(wx - ww / 2 - 0.2, wy - wh / 2 - 0.2, -0.02, wx + ww / 2 + 0.2, wy - wh / 2 - 0.1, 0.3, trim);
    if (rnd() < 0.5) for (const sgn of [-1, 1]) fb(wx + sgn * (ww / 2 + 0.12) - (sgn > 0 ? 0 : 0.42), wy - wh / 2, -0.04, wx + sgn * (ww / 2 + 0.12) + (sgn > 0 ? 0.42 : 0), wy + wh / 2, 0.08, doorCol);
  };
  for (const wx of [-w / 3, w / 3]) win(x + wx, y + 1.75, 1.5, 1.2);
  if (h > 5) for (const wx of [-w / 3, 0, w / 3]) win(x + wx, y + h - 1.6, 1.0, 1.1);
  if (rnd() < 0.55) { // chimney
    const cx = x + (rnd() < 0.5 ? -1 : 1) * w * 0.28;
    b.boxMinMax(cx - 0.5, y + h - 0.5, z - 0.5, cx + 0.5, y + h + rise + 0.9, z + 0.5, '#a0574a');
    b.boxMinMax(cx - 0.62, y + h + rise + 0.9, z - 0.62, cx + 0.62, y + h + rise + 1.08, z + 0.62, '#7a3f35');
  }
}

// addGableHouse's own draws (its door colour, each window's shutters, the chimney) without building it: Joyce's house is joyce-house.js's
function skipGableDraws(rnd, h) {
  rnd();
  for (let i = 0; i < (h > 5 ? 5 : 2); i++) rnd();
  if (rnd() < 0.55) rnd();
}

// The row across the street from our fence (buildNeighborhood fills it): { x, z, w, d, facing, door, tree, drive (a driveway with a car) }
export const STREET_HOUSES = [];
function buildNeighborhood(parent, colliders = []) {
  STREET_HOUSES.length = 0;
  const rnd = mulberry32(21);
  const b = new Batcher({ vertexColors: true }), f = new Batcher({ castShadow: false, vertexColors: true });
  const x0 = -94, x1 = 57.5; // the straight stretch in front of our fence, ending where the curve begins (world-town.js draws the rest)
  // (the street itself, its kerbs, sidewalks and lines are world-town.js's: one paved network, road-net.js)
  // dead-end guardrail at the water
  for (let z = STREET.sidewalkN + 0.4; z <= -41.2; z += 1.6) b.add(GEO.cyl8, '#fbfaf5', { x: x1 - 0.4, y: 0.85, z, sx: 0.12, sy: 0.9, sz: 0.12 });
  for (const y of [0.95, 1.2]) b.boxMinMax(x1 - 0.5, y, STREET.sidewalkN + 0.3, x1 - 0.3, y + 0.14, -41.1, y > 1 ? '#e0463c' : '#fbfaf5');
  // houses across the street, facing south toward us
  const colors = ['#9cc8e8', '#a9dcc1', '#f2de8c', '#f0a58a', '#c8b3e6', '#f3efe6', '#e8b4c8'];
  const roofs = ['#5b6b86', '#8a4b3c', '#4f5d52', '#6d4f7a', '#7a5a3a'];
  const houseXs = [-72, -46, 6, 32]; // the row across the street (mailman.js HOUSES); world-town.js builds out Maple Row
  for (const hx of houseXs) {
    const w = 10 + rnd() * 3, d = 8 + rnd() * 2, h = rnd() < 0.5 ? 4.2 : 6.2;
    const z = -70 - rnd() * 3;
    // Joyce's house is joyce-house.js's own (from Andrew's photo): the same draws are taken so the street after it stays put
    const joyce = Math.abs(hx - JOYCE_HOME.x) < 1;
    const wallC = colors[Math.floor(rnd() * colors.length)], roofC = roofs[Math.floor(rnd() * roofs.length)];
    if (joyce) skipGableDraws(rnd, h);
    else addGableHouse(b, f, hx, z, w, d, h, wallC, roofC, rnd, 1);
    if (!joyce) colliders.push({ type: 'box', minX: hx - w / 2 - 0.1, maxX: hx + w / 2 + 0.1, minZ: z - d / 2 - 0.1, maxZ: z + d / 2 + 0.95 }); // the house and its step
    // (Joyce's lot: no grass where her house, sun room, patio, driveway and front walk will stand; joyce-house.js switches these
    // off and puts its own walls in)
    else for (const r of [{ ...JH.box, minZ: JH.sun.minZ }, JH.patio, JH.drive, JH.walk]) colliders.push({ type: 'box', minX: r.minX - 0.05, maxX: r.maxX + 0.05, minZ: r.minZ - 0.05, maxZ: r.maxZ + 0.05, joyceLot: true });
    colliders.push({ type: 'circle', x: hx + 3, z: STREET.sidewalkN - 0.8, r: 0.3 }); // its mailbox
    // walk, mailbox, hedge, tree
    if (!joyce) b.boxMinMax(hx - 0.8, 0.3, z + d / 2, hx + 0.8, 0.4, STREET.sidewalkN, '#cbbfa9');
    b.add(GEO.box, '#3c4f7a', { x: hx + 3, y: 1.3, z: STREET.sidewalkN - 0.8, sx: 0.4, sy: 0.35, sz: 0.6 });
    b.add(GEO.box, '#6f5a44', { x: hx + 3, y: 0.8, z: STREET.sidewalkN - 0.8, sx: 0.1, sy: 1, sz: 0.1 });
    for (let i = 0; i < 4; i++) { const hxx = hx - w / 2 + 0.5 + i * 0.85 + rnd() * 0.2, ry = rnd() * 3; if (!joyce) b.add(GEO.ico1, i % 2 ? '#3f8a3f' : '#4a9a45', { x: hxx, y: 0.85 + (i % 2) * 0.08, z: STREET.sidewalkN - 1.8, sx: 0.62, sy: 0.6, sz: 0.55, ry }); }
    let tree = null;
    // (qol-fixes: Joyce's house is wider than the plain house the tree's spot was drawn for: her east tree stands clear of her roof)
    if (rnd() < 0.7) { const tx = joyce ? Math.max(hx + w / 2 + 3.5, JH.maxX + 5.2) : hx + w / 2 + 3.5, tz = z + 3 + rnd() * 3; tree = { x: tx, z: tz, r: addTree(b, tx, tz, rnd() < 0.4 ? 'maple' : 'oak', rnd, 0.6 + rnd() * 1.0) + 0.2 }; colliders.push({ type: 'circle', ...tree, tree: true }); }
    const drive = rnd() < 0.5; // (keep the draws in this order: the town's layout depends on them)
    if (joyce) STREET_HOUSES.push({ x: hx, z: (JH.FZ + JH.BZ) / 2, w: JH.maxX - JH.minX, d: JH.FZ - JH.BZ, facing: 1, door: { x: JH.pts.front[0], z: JH.pts.front[1] }, tree, drive: false, joyce: true }); // (joyce-house-plan.js)
    else STREET_HOUSES.push({ x: hx, z, w, d, facing: 1, door: { x: hx, z: z + d / 2 + 1.35 }, tree, drive }); // (Joyce lives in one of these)
    if (drive && !joyce) {
      // driveway and a car
      b.boxMinMax(hx + w / 2 + 0.5, 0.3, z - d / 2, hx + w / 2 + 4, 0.38, STREET.sidewalkN, '#a9a39a');
      addCar(b, hx + w / 2 + 2.25, z + d / 2 + 3, Math.PI / 2, rnd);
      colliders.push({ type: 'box', minX: hx + w / 2 + 1.25, maxX: hx + w / 2 + 3.25, minZ: z + d / 2 + 0.85, maxZ: z + d / 2 + 5.15 });
    }
  }
  // street lamps
  for (let x = x0 + 10; x < x1 - 4; x += 32) {
    for (let lz of [-41.6, -55.8]) {
      if (lz < -48 && Math.abs(x + 20) < 6) continue; // Maple Ave meets the street here
      if (lz > -48 && x > VAN_STOP.bay[1][0] && x < VAN_STOP.bay[2][0]) lz = VAN_STOP.bay[1][1] + SIDEWALK_W - 0.6; // back on the sidewalk behind the van's lay-by
      colliders.push({ type: 'circle', x, z: lz, r: 0.15 });
      const bz = lz + (lz > -48 ? -0.95 : 0.95);
      if (propsReady('street_lamp')) addProp(b, 'street_lamp', { x, y: 0.44, z: lz, yaw: lz > -48 ? Math.PI : 0 }); // (props-static: the Blender lamp, its bulb at the spot below)
      else {
        b.add(GEO.cyl6, '#3a3f47', { x, y: 2.4, z: lz, sx: 0.09, sy: 4.4, sz: 0.09 });
        b.add(GEO.box, '#3a3f47', { x, y: 4.6, z: lz + (lz > -48 ? -0.5 : 0.5), sx: 0.12, sy: 0.12, sz: 1.1 });
        b.add(GEO.box, lampGlow('#fff3c4'), { x, y: 4.45, z: bz, sx: 0.4, sy: 0.18, sz: 0.3 });
      }
      addNightSpot({ x, y: 4.3, z: bz, color: '#ffd98e', pool: 3.4, gy: 0.44, halo: 1.3 });
    }
  }
  // (no cars parked in the lanes: the traffic is cars.js's)
  b.build(parent, 'neighborhood');
  f.build(parent, 'neighborhood-details').forEach(m => soft(m));
}

export function addCar(b, x, z, ry, rnd) {
  // a parked cartoon car (car-models.js); one rnd() draw picks both its colour and its kind, so the layout after it stays put
  const r = rnd(), col = ['#d9534f', '#4f7fd9', '#f0c24f', '#5cb85c', '#e8e8e8'][Math.floor(r * 5)];
  addCarModel(b, x, 0.375, z, ry + Math.PI / 2, CAR_KINDS[Math.floor(r * 25) % CAR_KINDS.length], col); // ry turned the old model's +x nose
}

// ------------------------------------------------------------------ yard

// The picket fences round the yard (layout.js FENCES), with an opening at each gate (the gates themselves are gates.js).
// Every fence is axis-aligned. Returns box colliders for the runs between the gates.
function buildFence(b) {
  const colliders = [];
  for (const fe of FENCES) {
    const alongX = fe.a[1] === fe.b[1];
    const c0 = alongX ? Math.min(fe.a[0], fe.b[0]) : Math.min(fe.a[1], fe.b[1]);
    const c1 = alongX ? Math.max(fe.a[0], fe.b[0]) : Math.max(fe.a[1], fe.b[1]);
    const k = alongX ? fe.a[1] : fe.a[0]; // the fixed coordinate
    const gates = GATES.filter(g => g.fence === fe.id).map(g => { const c = alongX ? g.x : g.z; return [c - g.w / 2, c + g.w / 2]; });
    const inGate = (c, pad = 0) => gates.some(([g0, g1]) => c > g0 - pad && c < g1 + pad);
    const at = c => (alongX ? [c, k] : [k, c]);
    const H = (c) => { const [x, z] = at(c); return terrainHeight(x, z); };
    const rot = alongX ? 0 : Math.PI / 2;
    // broad boards with hairline gaps: the ink pass draws an outline wherever it can see through to the lawn behind, so
    // wide gaps turn the whole fence into a dark lattice; hairline gaps read as white boards with thin dark seams.
    for (let c = c0; c <= c1; c += 0.35) {
      if (inGate(c, 0.12)) continue;
      const [x, z] = at(c), y = H(c);
      b.add(GEO.box, '#fbfaf5', { x, y: y + 0.55, z, sx: 0.31, sy: 1.1, sz: 0.05, ry: rot });
      b.add(GEO.cone6, '#fbfaf5', { x, y: y + 1.17, z, sx: 0.155, sy: 0.17, sz: 0.04, ry: rot + Math.PI / 6 });
    }
    const posts = [];
    for (let c = c0; c <= c1; c += 2.4) if (!inGate(c, 0.3)) posts.push(c);
    for (const [g0, g1] of gates) posts.push(g0 - 0.12, g1 + 0.12); // a post each side of every gate (the hinge and the latch)
    posts.sort((p, q) => p - q);
    const oa = alongX ? [0, 0.04] : [0.04, 0];
    for (const c of posts) {
      const [x, z] = at(c), y = H(c);
      b.add(GEO.box, '#f1efe6', { x: x + oa[0], y: y + 0.62, z: z + oa[1], sx: 0.17, sy: 1.3, sz: 0.17 });
      b.add(GEO.box, '#f1efe6', { x: x + oa[0], y: y + 1.31, z: z + oa[1], sx: 0.23, sy: 0.07, sz: 0.23 });
    }
    // two rails per span, tilted to follow the lawn between one post and the next (none across a gate)
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i], bb = posts[i + 1];
      if (inGate((a + bb) / 2)) continue;
      const ya = H(a), yb = H(bb), len = Math.hypot(bb - a, yb - ya), tilt = Math.atan2(yb - ya, bb - a);
      const [x, z] = at((a + bb) / 2), o = alongX ? [0, 0.07] : [0.07, 0];
      for (const off of [0.36, 0.86]) {
        if (alongX) b.add(GEO.box, '#f1efe6', { x: x + o[0], y: (ya + yb) / 2 + off, z: z + o[1], sx: len + 0.05, sy: 0.09, sz: 0.05, rz: tilt });
        else b.add(GEO.box, '#f1efe6', { x: x + o[0], y: (ya + yb) / 2 + off, z: z + o[1], sx: 0.05, sy: 0.09, sz: len + 0.05, rx: -tilt });
      }
    }
    // colliders: the runs between the gates
    const cuts = [c0, ...gates.flat(), c1];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i], bb = cuts[i + 1];
      if (bb - a < 0.05) continue;
      colliders.push(alongX
        ? { type: 'box', minX: a, maxX: bb, minZ: k - 0.09, maxZ: k + 0.09, fence: fe.id }
        : { type: 'box', minX: k - 0.09, maxX: k + 0.09, minZ: a, maxZ: bb, fence: fe.id });
    }
  }
  return colliders;
}

function buildMailbox(b) {
  const { x, z } = MAILBOX;
  const y = terrainHeight(x, z);
  b.add(GEO.box, '#7a5234', { x, y: y + 0.6, z, sx: 0.14, sy: 1.2, sz: 0.14 });
  b.add(GEO.box, '#2f5da8', { x, y: y + 1.32, z, sx: 0.45, sy: 0.38, sz: 0.7 });
  b.add(GEO.cyl12, '#2f5da8', { x, y: y + 1.5, z, sx: 0.225, sy: 0.7, sz: 0.19, rx: Math.PI / 2 });
  b.add(GEO.box, '#e0463c', { x: x + 0.26, y: y + 1.55, z: z - 0.1, sx: 0.04, sy: 0.35, sz: 0.08 });
  b.add(GEO.box, '#e0463c', { x: x + 0.26, y: y + 1.72, z: z - 0.18, sx: 0.04, sy: 0.1, sz: 0.2 });
}

// The trails, all of them one mesh (one draw call): each run of trail-shape.js is a strip five verts across (outer fringe,
// inner edge, middle, inner edge, outer fringe). The middle and the inner edges are solid worn dirt, a touch lighter down
// the middle where feet go; the fringe fades to nothing (vertex alpha), so the edge is soft and ragged and blends into
// whatever lawn colour is under it. The mesh writes no depth and draws first of the see-through things (the grass tufts
// stand over its edges), never inked (soft layer), so where two trails meet their dirt simply runs together.
const TRAIL_RGBA = { mid: [1.04, 1.0, 0.96], edge: [0.95, 0.92, 0.84], fringe: [0.82, 0.86, 0.66] };
function trailGeometry(shapes) {
  const verts = [], cols = [], idx = [];
  for (const runs of shapes) for (const run of runs) {
    const base = verts.length / 3;
    for (let i = 0; i < run.length; i++) {
      const p = run[i], nx = -p.tz, nz = p.tx;
      const patch = 1 + 0.05 * Math.sin(p.s * 1.9 + p.x * 0.7) * Math.sin(p.s * 0.73 + p.z); // damp and dry patches down the middle
      const across = [[-p.outer, TRAIL_RGBA.fringe, 0], [-p.inner, TRAIL_RGBA.edge, 0.96], [0, TRAIL_RGBA.mid, 1], [p.inner, TRAIL_RGBA.edge, 0.96], [p.outer, TRAIL_RGBA.fringe, 0]];
      for (const [w, c, a] of across) {
        const x = p.x + nx * w, z = p.z + nz * w;
        verts.push(x, terrainHeight(x, z) + trailLift(x, z), z);
        const k = w === 0 ? patch : 1, cs = coastSigned(x, z), e = cs > -6 ? lawnEdge(x, z) : 0;
        const sand = cs > -6 ? smoothstep(e - 0.3, e + 0.9, cs) : 0; // (a trail wears away into the sand)
        cols.push(c[0] * k, c[1] * k, c[2] * k, a * p.a * (1 - sand));
      }
      if (i > 0) {
        const q = base + (i - 1) * 5, k = q + 5;
        for (let j = 0; j < 4; j++) idx.push(q + j, q + j + 1, k + j, q + j + 1, k + j + 1, k + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
// A trail lies a few cm over the ground: the fine 1.25 m terrain patch round the yard is at the true height, the 2 m field
// beyond it 5 cm under (terrain.js buildTerrain), with more give between its vertices on the lumpy woods floor.
const trailLift = (x, z) => (x > -74.5 && x < 72 && z > -59.5 && z < 47 ? 0.04 : 0.03);

// The closed ring of points round a plaza, cut into the open arcs that lie on dry ground: a point within 1.6 m of
// the water (or over it) or on a raised surface (the pier) is dropped; the first run is rotated so no arc is split
// at the seam. A ring with nothing to drop comes back whole (closed again with its first point).
function ringArcs(pts) {
  const bad = pts.map(([x, z]) => coastSigned(x, z) > -1.6 || onSurface(x, z));
  const first = bad.indexOf(true);
  if (first < 0) return [[...pts, pts[0]]];
  const arcs = [];
  let run = [];
  for (let k = 1; k <= pts.length; k++) {
    const i = (first + k) % pts.length;
    if (bad[i]) { if (run.length >= 3) arcs.push(run); run = []; } else run.push(pts[i]);
  }
  if (run.length >= 3) arcs.push(run);
  return arcs;
}

// One tuft: four little tapered blades (base, mid, tip) with vertex colours running from a dark root to a bright tip,
// so the lawn has depth instead of flat green shards. The tip sways in the wind (vertex shader, no per-frame JS).
function makeTuft(rnd) {
  const pos = [], nrm = [], col = [], idx = [];
  const blades = 4;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI + rnd() * 0.5, w = 0.05 + rnd() * 0.035, h = 0.3 + rnd() * 0.24;
    const d = rnd() * 6.28, lean = 0.04 + rnd() * 0.13;
    const ox = (rnd() - 0.5) * 0.14, oz = (rnd() - 0.5) * 0.14;
    const ax = Math.cos(a), az = Math.sin(a), lx = Math.cos(d) * lean, lz = Math.sin(d) * lean;
    const k = pos.length / 3;
    const v = (x, y, z, c) => { pos.push(x, y, z); nrm.push(0, 1, 0); col.push(c, c * 1.02, c * 0.9); };
    v(ox - ax * w, 0, oz - az * w, 0.5); v(ox + ax * w, 0, oz + az * w, 0.5);
    v(ox - ax * w * 0.62 + lx * 0.4, h * 0.55, oz - az * w * 0.62 + lz * 0.4, 0.86); v(ox + ax * w * 0.62 + lx * 0.4, h * 0.55, oz + az * w * 0.62 + lz * 0.4, 0.86);
    v(ox + lx, h, oz + lz, 1.08);
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2, k + 2, k + 3, k + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function buildGrassAndFlowers(parent, isClear, updaters, grassRef) {
  const rnd = mulberry32(5);
  const tuft = makeTuft(mulberry32(9));
  const uTime = { value: 0 }, uWind = { value: 1 }; // uWind: the sway grows with the weather's wind (daynight-mats.js WEATHER)
  const grassMat = toon('#ffffff', { side: 'double', transparent: true, opacity: 1, depthWrite: false, vertexColors: true }).clone();
  grassMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime; sh.uniforms.uWind = uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        uniform float uTime, uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
        #else
          vec2 ip = vec2(0.0);
        #endif
        float gust = (sin(uTime * 1.5 + ip.x * 0.32 + ip.y * 0.21) + 0.45 * sin(uTime * 2.7 + ip.y * 0.9 + ip.x * 0.4) + (uWind - 1.0) * 0.5) * uWind;
        transformed.x += gust * position.y * position.y * 0.32;
        transformed.z += cos(uTime * 1.1 + ip.x * 0.25) * position.y * position.y * 0.16 * uWind;`);
  };
  grassMat.customProgramCacheKey = () => 'grass-sway';
  updaters?.push((dt, t) => { uTime.value = t; uWind.value = 1 + WEATHER.wind * 1.8 + WEATHER.gust * 0.6; });
  const N = 9000, SHORE_N = 900; // (the shore's tufts go after the lawn's, from their own random stream, so the lawn's stay put)
  const grass = new THREE.InstancedMesh(tuft, grassMat, N + SHORE_N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < N * 3 && n < N; i++) {
    const x = -66 + rnd() * 126, z = -40 + rnd() * 72;
    const inYard = pointInPoly(x, z, WALK);
    if (!inYard && rnd() < 0.7) continue;
    if (coastSigned(x, z) > -3.8 || !isClear(x, z, 0.5)) continue;
    const h = terrainHeight(x, z);
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    const sc = 0.75 + rnd() * 0.65;
    grass.setMatrixAt(n, m.compose(pv.set(x, h - 0.02, z), q, sv.set(sc, sc * (0.8 + rnd() * 0.7), sc)));
    const t = fbm(x * 0.09 + 40, z * 0.09 - 12), t2 = fbm(x * 0.21 - 7, z * 0.21 + 3);
    grass.setColorAt(n, col.set(t > 0 ? '#a3dc6a' : '#7cc452').offsetHSL(t2 * 0.03, t2 * 0.06, rnd() * 0.06 - 0.02));
    n++;
  }
  // the lawn's edge along the shore (terrain.js lawnEdge): tufts right up to it where the lawn reaches further than the
  // lawn's own scatter goes (behind the house), and a few straggling out into the sand
  const rs = mulberry32(808);
  for (let i = 0, k = 0; i < 26000 && k < SHORE_N; i++) {
    const x = -66 + rs() * 126, z = -40 + rs() * 72, pick = rs();
    const s = coastSigned(x, z);
    if (s < -4.4 || s > -0.9 || !pointInPoly(x, z, WALK)) continue;
    const e = lawnEdge(x, z), past = s - e; // < 0 on the lawn
    if (past < -0.25 ? s <= -3.8 : pick > 0.3 * (1 - past / 0.9)) continue; // (the lawn's own tufts cover s <= -3.8)
    if (!isClear(x, z, 0.5)) continue;
    q.setFromAxisAngle(up, rs() * Math.PI * 2);
    const sc = (0.7 + rs() * 0.6) * (past > 0 ? 0.8 : 1);
    grass.setMatrixAt(n, m.compose(pv.set(x, terrainHeight(x, z) - 0.02, z), q, sv.set(sc, sc * (0.8 + rs() * 0.6), sc)));
    const t2 = fbm(x * 0.21 - 7, z * 0.21 + 3);
    grass.setColorAt(n, col.set(past > 0 ? '#a9c95c' : '#8ccc58').offsetHSL(t2 * 0.03, t2 * 0.05, rs() * 0.05 - 0.02));
    n++; k++;
  }
  grass.count = n;
  grassRef.mesh = grass; grassRef.full = n;
  grass.instanceMatrix.needsUpdate = true;
  grass.instanceColor.needsUpdate = true;
  grass.frustumCulled = false;
  grass.receiveShadow = true;
  grass.name = 'grass';
  parent.add(soft(grass));

  // flower patches
  const flowerGeo = new THREE.IcosahedronGeometry(0.09, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo, toon('#ffffff', { emissive: '#222222', emissiveIntensity: 0.4 }), 1400);
  const palettes = [['#ffffff', '#fff27a'], ['#ff8fb1', '#ffd1e0'], ['#b89cff', '#ffffff'], ['#ffd34d', '#ff9f43'], ['#ff6b6b', '#ffffff']];
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.02, 1, 3, 1, true), toon('#4f9a3e'), 1400); // a stem under every flower head
  const patches = [];
  let f = 0;
  for (let c = 0; c < 90 && f < 1400; c++) {
    const cx = -60 + rnd() * 116, cz = -38 + rnd() * 66;
    if (!pointInPoly(cx, cz, WALK) || coastSigned(cx, cz) > -4 || !isClear(cx, cz, 1.5)) continue;
    patches.push([cx, cz]);
    const pal = palettes[Math.floor(rnd() * palettes.length)];
    const count = 8 + Math.floor(rnd() * 14);
    for (let k = 0; k < count && f < 1400; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 1.8;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!isClear(x, z, 0.3)) continue;
      const h = terrainHeight(x, z);
      const hh = 0.2 + rnd() * 0.14;
      flowers.setMatrixAt(f, m.compose(pv.set(x, h + hh, z), q.identity(), sv.set(0.8 + rnd() * 0.6, 0.65 + rnd() * 0.4, 0.8 + rnd() * 0.6)));
      flowers.setColorAt(f, col.set(pal[k % pal.length]));
      stems.setMatrixAt(f, m.compose(pv.set(x, h + hh / 2 - 0.02, z), q.identity(), sv.set(1, hh + 0.04, 1)));
      f++;
    }
  }
  flowers.count = f;
  flowers.instanceMatrix.needsUpdate = true;
  flowers.instanceColor.needsUpdate = true;
  flowers.frustumCulled = false;
  flowers.name = 'flowers';
  parent.add(soft(flowers));
  stems.count = f;
  stems.instanceMatrix.needsUpdate = true;
  stems.frustumCulled = false;
  parent.add(soft(stems));
  if (updaters) updaters.push(buildButterflies(parent, patches, rnd));
}

// A few butterflies drifting in loose loops over the flower patches: one instanced mesh of wing triangles, flapped
// from JS (a couple of dozen matrices a frame). Soft layer, so no ink lines on something the size of a thumb.
function buildButterflies(parent, patches, rnd) {
  const N = Math.min(11, patches.length);
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.02, 0.17, 0, -0.14, 0.2, 0, 0.02, 0, 0, 0.02, 0.13, 0, 0.13, 0.03, 0, 0.14], 3));
  wing.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5]);
  wing.computeVertexNormals();
  const mat = toon('#ffffff', { side: 'double', transparent: true, opacity: 1, depthWrite: false, emissive: '#555555', emissiveIntensity: 0.5 });
  const mesh = new THREE.InstancedMesh(wing, mat, N * 2);
  const cols = ['#fff27a', '#ffffff', '#ff9f43', '#7fc8ff', '#ffb1d0', '#c9a6ff'], tint = new THREE.Color();
  const fly = [];
  for (let i = 0; i < N; i++) {
    const [cx, cz] = patches[Math.floor(rnd() * patches.length)];
    fly.push({ cx, cz, r: 1.6 + rnd() * 2.6, sp: 0.22 + rnd() * 0.25, ph: rnd() * 6.28, hgt: 0.55 + rnd() * 0.6, fl: 9 + rnd() * 5 });
    tint.set(cols[i % cols.length]);
    mesh.setColorAt(i * 2, tint); mesh.setColorAt(i * 2 + 1, tint);
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  parent.add(soft(mesh));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
  return (dt, t) => {
    for (let i = 0; i < N; i++) {
      const b = fly[i], a = t * b.sp + b.ph;
      const x = b.cx + Math.cos(a) * b.r + Math.sin(a * 2.3) * 0.5, z = b.cz + Math.sin(a * 0.8) * b.r;
      const dx = -Math.sin(a) * b.r + Math.cos(a * 2.3) * 1.15, dz = Math.cos(a * 0.8) * 0.8 * b.r;
      const y = terrainHeight(x, z) + b.hgt + Math.sin(t * 1.7 + b.ph) * 0.25;
      const flap = Math.sin(t * b.fl + b.ph) * 0.9 + 0.25, yaw = Math.atan2(dx, dz);
      pv.set(x, y, z);
      e.set(0, yaw, flap, 'YXZ'); q.setFromEuler(e); sv.set(1, 1, 1);
      mesh.setMatrixAt(i * 2, m.compose(pv, q, sv));
      e.set(0, yaw, -flap, 'YXZ'); q.setFromEuler(e); sv.set(-1, 1, 1);
      mesh.setMatrixAt(i * 2 + 1, m.compose(pv, q, sv));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

function buildReeds(b) {
  const rnd = mulberry32(17);
  // cattails along the lagoon edges
  for (let i = 0; i < 130; i++) {
    const seg = Math.floor(rnd() * 14) + 9; // the lagoon and the park shore of the COAST polyline
    const [ax, az] = COAST[seg], [bx, bz] = COAST[seg + 1];
    const t = rnd();
    const x = ax + (bx - ax) * t + (rnd() - 0.5) * 1.5, z = az + (bz - az) * t + (rnd() - 0.5) * 1.5;
    if (pointInPoly(x, z, SWIM_ZONE) || (x > -12 && x < 30 && z < 12)) continue; // keep the swimming beach behind the house open
    const y = terrainHeight(x, z);
    const h = 1 + rnd() * 0.8;
    b.add(GEO.cyl6, '#6f9a3a', { x, y: y + h / 2, z, sx: 0.05, sy: h, sz: 0.05, rz: (rnd() - 0.5) * 0.2 });
    b.add(GEO.cyl6, '#7a5234', { x, y: y + h - 0.1, z, sx: 0.09, sy: 0.32, sz: 0.09 });
  }
}

function buildDock(b) {
  if (fishShackModel()) return;   // (fish-shack-setpiece) the model's pier stands here, to DOCK's numbers (dock.js adds it)
  const y = DOCK.y;
  b.boxMinMax(DOCK.minX, y - 0.14, DOCK.minZ, DOCK.maxX, y, DOCK.maxZ, '#b98a5a');
  for (let x = DOCK.minX; x < DOCK.maxX; x += 0.45) {
    b.boxMinMax(x, y - 0.01, DOCK.minZ, x + 0.04, y + 0.005, DOCK.maxZ, '#8a6240');
  }
  for (let x = DOCK.minX + 1; x <= DOCK.maxX; x += 3) {
    for (const z of [DOCK.minZ + 0.15, DOCK.maxZ - 0.15]) {
      b.add(GEO.cyl8, '#7a5438', { x, y: y - 1.2, z, sx: 0.16, sy: 3.2, sz: 0.16 });
    }
  }
}

// ------------------------------------------------------------------ build

export function buildWorld(scene, slots) {
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const updaters = [];
  const colliders = [];
  const grassRef = { mesh: null, full: 0 };

  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 110, 780);
  const sky = buildSky();
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#cfe8ff', '#8ba3a6', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d6', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  root.add(buildTerrain());
  const water = buildWater();
  root.add(water);
  updaters.push((dt, t) => { water.material.uniforms.uTime.value = t; });
  buildRidges(root, { scene, sun, sunDir: SUN_DIR });
  const clouds = buildClouds(root);
  updaters.push(clouds.update);
  buildNeighborhood(root, colliders);
  const town = buildTown(root, colliders, updaters); // Maple Row, Summit Hill, the shops, the roads, the carnival (world-town.js)

  // trails, resolved against the slot positions from games.json
  const slotsById = Object.fromEntries(slots.map(s => [s.id, s]));
  const trailPaths = [];
  // a ring path round every lawn where two or more trails meet, so the trails join up round the plaza instead of
  // stopping dead at its edge (trails end at the plaza rim: layout.js resolveTrail)
  const refs = {};
  for (const tr of TRAILS) for (const p of tr.pts) if (typeof p === 'string') { const id = p.slice(5).split('@')[0]; if (!p.includes('@')) refs[id] = (refs[id] || 0) + 1; }
  // A ring is only worn where there's lawn to wear (the dock lawn's slot sits 6 m from the shore). Points over the water, on the
  // wet sand by it or on a raised surface are dropped and what's left becomes one or more open arcs (ringArcs).
  const rings = Object.keys(refs).filter(id => refs[id] >= 2 && slotsById[id]).flatMap(id => { const s = slotsById[id]; const pts = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push([s.x + Math.cos(a) * PLAZA_EDGE, s.z + Math.sin(a) * PLAZA_EDGE]); } return ringArcs(pts).map((arc, k) => ({ name: 'ring:' + id + (k ? ':' + k : ''), width: 1.4, pts: arc, ring: true })); });
  const laid = [];
  for (const tr of [...TRAILS, ...rings]) {
    const pts = tr.ring ? tr.pts : resolveTrail(tr, slotsById);
    if (pts.length >= 2) laid.push({ tr, pts });
  }
  // where trails meet: an end that lands on another trail is joined (no fade-out); the trail it lands on flares there
  const near = (x, z, o) => polyDist(x, z, o.pts) < o.tr.width / 2 + 0.3;
  for (const t of laid) {
    const ends = [t.pts[0], t.pts[t.pts.length - 1]];
    const closed = t.tr.ring && Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]) < 0.01;
    t.joined = ends.map(e => closed || laid.some(o => o !== t && near(e[0], e[1], o)));
    t.joins = ends.filter((e, k) => t.joined[k] && !closed).map(e => e.slice());
    for (const o of laid) if (o !== t && !o.tr.ring) for (const e of [o.pts[0], o.pts[o.pts.length - 1]]) if (near(e[0], e[1], t)) t.joins.push(e.slice());
    t.opts = { seed: nameSeed(t.tr.name), ring: !!t.tr.ring, bow: t.tr.bow, joins: t.joins };
    t.shape = trailShape(t.pts, t.tr.width, t.opts);
    const c = t.shape.centre;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of c) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    trailPaths.push({ name: t.tr.name, pts: t.pts, path: c, width: t.tr.width, box: [minX, maxX, minZ, maxZ], late: !!t.tr.late }); // (late: npcs.js NavGraph)
  }

  const onTrail = (x, z, pad = 0) => {
    for (const tp of trailPaths) {
      const r = tp.width / 2 + pad, bx = tp.box;
      if (x < bx[0] - r || x > bx[1] + r || z < bx[2] - r || z > bx[3] + r) continue;
      if (polyDist(x, z, tp.path) < r) return true;
    }
    return false;
  };

  // The mesh is laid once everything that stands on the ground has said where it is (features add their floors, decks
  // and steps with addSurface, and their dirt circles and blocks with addTrailStop, after the world is built): the first
  // frame lays it, and again whenever one more surface or stop turns up.
  const trailStops = []; // { x, z, r } circles or { minX, maxX, minZ, maxZ } boxes no trail draws over
  const HX = 0.3; // the house's walls, foundation and eaves
  const blocked = (x, z) => {
    if (onSurface(x, z, 0.06)) return true;
    if (x > HOUSE.minX - HX && x < HOUSE.maxX + HX && z > HOUSE.minZ - HX && z < HOUSE.maxZ + HX) return true;
    if (coastSigned(x, z) > -0.6) return true; // (no trail into the wet sand or the water)
    if (roadEdgeDist(x, z) < SIDEWALK_W) return true; // a trail ends at the back of a sidewalk
    for (const s of trailStops) {
      if (s.r !== undefined ? (x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r : x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) return true;
    }
    return false;
  };
  const trailMat = toon('#d2aa70', { polygonOffset: true, steps: 4, vertexColors: true }); // (weather-cover.js patches this one in place)
  trailMat.transparent = true; trailMat.depthWrite = false;
  const trailMesh = new THREE.Mesh(new THREE.BufferGeometry(), trailMat);
  trailMesh.name = 'trails'; trailMesh.receiveShadow = true; trailMesh.renderOrder = -1;
  trailMesh.userData.noMerge = true; trailMesh.matrixAutoUpdate = false; trailMesh.frustumCulled = false;
  soft(trailMesh);
  root.add(trailMesh);
  const trailRuns = [];
  let laidS = -1, laidT = -1;
  const layTrails = () => {
    trailRuns.length = 0;
    const shapes = laid.map(t => {
      // an end that stops at something (the foot of the steps, a deck, the sidewalk, a block) does not fade out either
      const anchored = [0, 1].map(k => {
        const p = k ? t.pts[t.pts.length - 1] : t.pts[0], q = k ? t.pts[t.pts.length - 2] : t.pts[1];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, dx = (p[0] - q[0]) / d, dz = (p[1] - q[1]) / d;
        for (let s = 0; s <= 1.0; s += 0.1) if (blocked(p[0] + dx * s, p[1] + dz * s)) return true;
        return false;
      });
      const sh = trailShape(t.pts, t.tr.width, { ...t.opts, joinedStart: t.joined[0] || anchored[0], joinedEnd: t.joined[1] || anchored[1], blocked });
      trailRuns.push({ name: t.tr.name, width: t.tr.width, runs: sh.runs });
      return sh.runs;
    });
    trailMesh.geometry.dispose();
    trailMesh.geometry = trailGeometry(shapes);
  };
  updaters.push(() => {
    if (surfaceCount() !== laidS || trailStops.length !== laidT) { laidS = surfaceCount(); laidT = trailStops.length; layTrails(); }
  });

  // yard trees from the sketch
  const b = new Batcher({ vertexColors: true });
  const rnd = mulberry32(42);
  for (const t of YARD_TREES) {
    if (t.gone) { addTree(new Batcher({ vertexColors: true }), t.x, t.z, t.kind, rnd, 0.62 + rnd() * 0.95); continue; } // (a removed tree: its random draws still taken, so every other tree stays put)
    const s0 = 0.62 + rnd() * 0.95, r = addTree(b, t.x, t.z, t.kind, rnd, t.s || s0); // saplings to big old trees, not a row of clones (t.s: a size set in layout.js, like the picnic's shade oak; the draw is still taken)
    colliders.push({ type: 'circle', x: t.x, z: t.z, r: r + 0.25, tree: true }); // (tree: tall, with a crown the camera can sit in: camera-fade.js)
  }
  // (each rock sits at the lowest ground under it, the little one beside it at its own spot, so on the shelving shore it never
  // hangs over the downhill side)
  const lowest = (x, z, r) => { let y = terrainHeight(x, z); for (let k = 0; k < 6; k++) y = Math.min(y, terrainHeight(x + Math.cos(k * 1.047) * r, z + Math.sin(k * 1.047) * r)); return y; };
  for (const r of SHORE_ROCKS) {
    const y = lowest(r.x, r.z, r.s * 0.5), x2 = r.x + r.s * 0.8, z2 = r.z + 0.3, y2 = lowest(x2, z2, r.s * 0.25);
    b.add(GEO.dodec, '#9a9b93', { x: r.x, y: y + 0.2 * r.s, z: r.z, sx: r.s, sy: r.s * 0.7, sz: r.s * 0.9, ry: r.x });
    b.add(GEO.dodec, '#8a8b84', { x: x2, y: y2 + 0.06, z: z2, sx: r.s * 0.5, sy: r.s * 0.4, sz: r.s * 0.5, ry: r.z });
    if (pointInPoly(r.x, r.z, WALK)) colliders.push({ type: 'circle', x: r.x, z: r.z, r: r.s * 0.9 });
  }
  const fenceB = new Batcher({ vertexColors: true });
  colliders.push(...buildFence(fenceB));
  fenceB.build(root, 'fence').forEach(m => soft(m)); // thin pickets: coloured and shaded but not inked (ink turns the fence into a dark lattice)
  buildMailbox(b);
  colliders.push({ type: 'circle', x: MAILBOX.x, z: MAILBOX.z, r: 0.45 });
  const reeds = new Batcher({ castShadow: false });
  buildReeds(reeds);
  reeds.build(root, 'reeds').forEach(m => soft(m));
  buildDock(b);
  const swayswing = buildSwingTree(b, root); // trunk, limb and crown are one tree (swing-tree.js)
  updaters.push((dt, t) => swayswing(t));
  colliders.push({ type: 'circle', x: SWING_TREE.x, z: SWING_TREE.z, r: 0.9, tree: true }); // (tree: the camera fades the crown it's inside, camera-fade.js)
  b.build(root, 'yard');

  return {
    root, sky, sun, hemi, water, updaters, cloudMat: clouds.mat, colliders, trailPaths, onTrail, trailRuns, trailBlocked: blocked, addTrailStop: s => { trailStops.push(s); }, town, forest: null, treeAudit: auditYardTrees, treeAttachment: auditAttachment,
    // Everything that fills the lawn must avoid trails, the house and plazas.
    // Called by main.js once every area is built: the walkable woods (their trunks are solid: colliders get them) and the
    // lawn. isClear(x, z, pad) says where nothing may grow; treeClear (default isClear) where no tree of the woods may stand
    // (a game's lawn keeps the woods back but has grass, like the unicorns' in the woods corner).
    scatter(isClear, solid = colliders, treeClear = isClear) {
      const forest = buildForest(root, treeClear);
      this.forest = forest.spots;
      this.forestKinds = forest.kinds; this.undergrowth = forest.under; // (tests and the sheets)
      solid.push(...forest.colliders);
      const near = () => forest.update(lodView.camera); near.perfName = 'undergrowth'; // the woods' floor is drawn near the camera only
      updaters.push(near);
      buildGrassAndFlowers(root, isClear, updaters, grassRef);
    },
    // Fast mode keeps 45% of the grass tufts (they are placed in random order, so the lawn thins evenly).
    setQuality(q) { if (grassRef.mesh) grassRef.mesh.count = q === 'low' ? Math.floor(grassRef.full * 0.45) : grassRef.full; },
  };
}
