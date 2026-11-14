// Night (and dawn) effects, each one draw call and all on the soft layer (never inked): warm pools of lamplight on the
// ground, halos round the bulbs, fireflies over the meadow and the lagoon shore, and the morning mist on the lagoon.
// Positions are built once; the motion lives in the vertex shaders, so a frame costs a few uniforms.
import * as THREE from 'three';
import { LAYER_SOFT } from './toon.js';
import { terrainHeight, coastSigned } from './terrain.js';
import { mulberry32 } from './util.js';
import { GFX } from './gfx.js';

function radialTexture(stops) {
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

const soft = o => { o.layers.set(LAYER_SOFT); o.frustumCulled = false; o.renderOrder = 2; return o; };

export function createNightFx(scene, renderer, { spots, npcs }) {
  const group = new THREE.Group();
  group.name = 'night-fx';
  scene.add(group);
  const uScale = { value: 400 }, uTime = { value: 0 }, uGust = { value: 0 };
  let built = false, pools = null, halos = null, flies = null, mist = null, flyMult = 1;
  const followers = [];

  // ---------------------------------------------------------------- pools of lamplight on the ground
  function buildPools() {
    const list = spots.filter(s => s.pool > 0);
    if (!list.length) return null;
    // a cel pool: a bright middle, one softer ring, and a short fade at the rim
    const tex = radialTexture([[0, 0.9], [0.42, 0.8], [0.5, 0.5], [0.78, 0.4], [0.86, 0.12], [1, 0]]);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const geo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    list.forEach((s, i) => {
      const gy = s.gy ?? terrainHeight(s.x, s.z);
      mx.makeScale(s.pool, 1, s.pool).setPosition(s.x, gy + 0.05, s.z);
      m.setMatrixAt(i, mx);
      s.poolAt = s.k ?? 1;
      m.setColorAt(i, col.set(s.color).multiplyScalar((s.poolK ?? 1) * s.poolAt));
    });
    m.name = 'lamp-pools';
    poolList = list;
    return soft(m);
  }
  // a lamp switched off or on after the build (its `k`, e.g. the game store's after 9): its pool follows (additive: black is none)
  let poolList = null;
  const poolCol = new THREE.Color();
  function followPools() {
    if (!pools || !poolList) return;
    let changed = false;
    for (let i = 0; i < poolList.length; i++) {
      const s = poolList[i], k = s.k ?? 1;
      if (k === s.poolAt) continue;
      s.poolAt = k; pools.setColorAt(i, poolCol.set(s.color).multiplyScalar((s.poolK ?? 1) * k)); changed = true;
    }
    if (changed && pools.instanceColor) pools.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- halos round the bulbs (and the lantern)
  function buildHalos() {
    const list = spots.filter(s => s.halo > 0);
    for (const d of npcs?.npcs || []) if (d.body?.lantern) followers.push({ obj: d.body.lantern, spot: { x: 0, y: 0, z: 0, color: '#ffd27a', halo: 0.75, flicker: 0.6 } });
    const all = [...list, ...followers.map(f => f.spot)];
    if (!all.length) return null;
    const n = all.length, pos = new Float32Array(n * 3), colr = new Float32Array(n * 3), size = new Float32Array(n), flick = new Float32Array(n);
    const c = new THREE.Color();
    all.forEach((s, i) => {
      pos.set([s.x, s.y, s.z], i * 3); c.set(s.color); colr.set([c.r, c.g, c.b], i * 3);
      size[i] = s.halo; flick[i] = s.flicker || 0;
    });
    followers.forEach((f, j) => { f.index = list.length + j; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aFlick', new THREE.BufferAttribute(flick, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale, uTime, uK: { value: 0 }, uGust },
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aFlick; attribute vec3 color;
        uniform float uScale, uTime, uK, uGust;
        varying vec3 vCol; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // the flames (lanterns, the candle, the gas lamps) gutter harder when the weather gusts (uGust: weather.js)
          float f = 1.0 + aFlick * (0.13 * sin(uTime * 9.0 + position.x * 3.1) + 0.08 * sin(uTime * 23.0 + position.z * 1.7)
            + uGust * (0.3 * sin(uTime * 31.0 + position.x * 5.0) * sin(uTime * 7.0 + position.z * 2.0) - 0.15));
          gl_PointSize = clamp(aSize * f * uScale / max(0.5, -mv.z), 0.0, 320.0);
          vCol = color; vA = uK * f;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r = length(c);
          if (r > 1.0) discard;
          // a soft glow with one crisp inner ring: a cartoon halo, not a lens flare
          float a = pow(1.0 - r, 2.4) * 0.5 + (1.0 - smoothstep(0.2, 0.26, r)) * 0.3;
          gl_FragColor = vec4(vCol * a * vA, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, mat);
    p.name = 'lamp-halos';
    return soft(p);
  }

  // ---------------------------------------------------------------- fireflies
  function buildFlies() {
    const rnd = mulberry32(404);
    const zones = [ // [x0, x1, z0, z1, count, height]: the meadow (clear of the bocce corner by the treeline), the lagoon shore, the woods edge
      [-40, -22, -4, 14, 30, 1.2], [-10, 46, 4.5, 11, 26, 0.9], [-60, -52, -32, 4, 16, 1.4], [-30, -16, -16, -2, 10, 1.1],
    ];
    const pos = [], seed = [];
    for (const [x0, x1, z0, z1, n0, hgt] of zones) {
      const n = Math.round(n0 * flyMult); // Max graphics: more than twice the fireflies
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        const ground = coastSigned(x, z) > 0 ? 0 : terrainHeight(x, z);
        pos.push(x, ground + 0.4 + rnd() * hgt, z);
        seed.push(rnd(), 0.12 + rnd() * 0.25, 0.6 + rnd() * 1.6, 0.9 + rnd() * 1.8);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale, uTime, uK: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uScale, uTime, uK;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * aSeed.y + aSeed.x * 6.283;
          p.x += sin(t) * aSeed.z + sin(t * 2.3 + aSeed.x * 4.0) * 0.4;
          p.z += cos(t * 0.8) * aSeed.z;
          p.y += sin(t * 1.7) * 0.35;
          float blink = pow(max(0.0, sin(uTime * aSeed.w + aSeed.x * 40.0)), 3.0);
          vA = uK * (0.12 + 0.88 * blink);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(0.42 * uScale / max(0.5, -mv.z), 3.5, 44.0) * (0.55 + 0.45 * blink);
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() {
          float r = length(gl_PointCoord * 2.0 - 1.0);
          if (r > 1.0) discard;
          float a = pow(1.0 - r, 2.0) * 0.7 + (1.0 - smoothstep(0.22, 0.3, r)) * 0.6;
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.42) * a * vA * 1.6, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, mat);
    p.name = 'fireflies';
    return soft(p);
  }

  // ---------------------------------------------------------------- dawn mist over the lagoon (camera-facing puffs)
  function buildMist() {
    const rnd = mulberry32(77);
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const n = 16, off = new Float32Array(n * 3), size = new Float32Array(n), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // over the lagoon behind the house, a few drifting up its west arm and onto the low shore
      const west = i >= 12;
      const x = west ? -16 + rnd() * 6 : -8 + rnd() * 56, z = west ? 12 + rnd() * 24 : 9.5 + rnd() * 16;
      off.set([x, 0.55 + rnd() * 0.7, z], i * 3);
      size[i] = 7 + rnd() * 7; sd[i] = rnd();
    }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uK: { value: 0 }, uCol: { value: new THREE.Color('#f6eef2') } },
      vertexShader: /* glsl */`
        attribute vec3 aOff; attribute float aSize; attribute float aSeed;
        uniform float uTime;
        varying vec2 vUv; varying float vFade;
        void main() {
          vec3 c = aOff + vec3(sin(uTime * 0.035 + aSeed * 6.0) * 3.0, sin(uTime * 0.2 + aSeed * 9.0) * 0.08, cos(uTime * 0.028 + aSeed * 4.0) * 2.0);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * vec2(aSize, aSize * 0.32);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vFade = smoothstep(2.0, 9.0, -mv.z); // thin out right in front of the camera
        }`,
      fragmentShader: /* glsl */`
        uniform float uK; uniform vec3 uCol;
        varying vec2 vUv; varying float vFade;
        void main() {
          vec2 q = (vUv - 0.5) * 2.0;
          float r = length(q);
          float a = (1.0 - smoothstep(0.1, 1.0, r)) * uK * vFade * 0.15;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uCol, a);
        }`,
      transparent: true, depthWrite: false, fog: false,
      // normal blending for the colour; the alpha channel is thinned under the mist, so the ink outlines behind it soften too (toon.js)
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const m = new THREE.Mesh(g, mat);
    m.name = 'lagoon-mist';
    return soft(m);
  }

  const vp = new THREE.Vector2(), wp = new THREE.Vector3(), MIST = new THREE.Color('#f6eef2'), MIST_DAWN = new THREE.Color('#ffd6c8');
  function build() {
    built = true;
    pools = buildPools(); halos = buildHalos(); flies = buildFlies(); mist = buildMist();
    for (const o of [pools, halos, flies, mist]) if (o) group.add(o);
  }

  return {
    group,
    setQuality(q) {
      const mult = GFX.s.flies; // (Max: more than twice the fireflies on a computer, half again on a phone: gfx.js)
      if (mult === flyMult) return;
      flyMult = mult;
      if (flies) { group.remove(flies); flies.geometry.dispose(); flies.material.dispose(); flies = buildFlies(); group.add(flies); }
    },
    update(dt, t, camera, { night, lampK, mist: mistK, dawn, gust = 0 }) {
      if (!built) build(); // the areas and the NPCs are built after the world: gather their lamps on the first frame
      uTime.value = t % 3600;
      uGust.value = gust;
      renderer.getDrawingBufferSize(vp);
      if (camera) uScale.value = vp.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      if (pools) { pools.visible = lampK > 0.01; pools.material.opacity = lampK * 0.55; followPools(); }
      if (halos) {
        halos.visible = lampK > 0.01;
        halos.material.uniforms.uK.value = lampK;
        if (halos.visible && followers.length) {
          const a = halos.geometry.attributes.position;
          for (const f of followers) { f.obj.getWorldPosition(wp); a.setXYZ(f.index, wp.x, wp.y - 0.07, wp.z); }
          a.needsUpdate = true;
        }
      }
      const fk = Math.max(0, (night - 0.55) / 0.45);
      if (flies) { flies.visible = fk > 0.01; flies.material.uniforms.uK.value = fk; }
      if (mist) {
        mist.visible = mistK > 0.01;
        mist.material.uniforms.uK.value = mistK;
        mist.material.uniforms.uCol.value.copy(MIST).lerp(MIST_DAWN, dawn * 0.5);
      }
    },
  };
}
