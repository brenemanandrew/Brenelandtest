// Real fires in the fireplaces and real flames on the candles (outside the maze, whose own are maze-flame.js's).
//
// Every flame is one instance of ONE mesh, one draw call for all of them: the fireplaces' tongues and the candles' flames, plus the
// fireplaces' glow (on the hearth in front, round the opening, on the firebox's back) as flat cards in the same mesh. The flame is
// maze-flame.js's toon flame (a quad that turns to face you about the upright, a hot core, an orange body, a red edge in three hard
// bands, tongues licking up through it, leaning and fluttering when it gutters): one shader for every flame in the game and one
// draw, where campfire.js's flame cards are a mesh per fire. Nothing per frame on the CPU but a uniform, unless a fire is catching
// or dying, a candle gutters in a gust or someone carries one.
//   our house (house-rooms.js LIVING_HEARTH): E at the fireplace lights it or puts it out for everyone (the server keeps lit / out:
//     lib/hearth.js, the curve hearth-curve.js); in fire season it burns on its own from 6 pm to 2 am (fire-season.js), lit by hand
//     in the hours it burns till 2, outside them three hours; it catches and dies down over a few seconds; a quiet crackle in the
//     room (audio.js 'hearth' tables)
//   the Lovecraft house (lovecraft-build.js hearths): the parlour's and the study's fires always burn
//   the candles: the Arkham table's (open days), the two candlesticks on the parlour's mantel, the one on the maze board's ledge, a
//     candle someone holds (the Cultist): they sway, and gutter in the Arkham storm's gusts like the gas lamps; in a room
//     (indoor-rooms.js, or WEATHER.indoor for one carried) only softly
// The grate, the logs and the coals are hearth-build.js's, built into the houses. One warm spot light, parked on the nearest fire you
// can see, lights the hearth and the room in front of it and flickers with the flames (a spot, not a point: it never lights the
// deck behind the chimney). Nothing is drawn unless you are inside or can see in (the houses' insideShown).
import * as THREE from 'three';
import { LAYER_SOFT } from './toon.js';
import { LIGHT, WEATHER } from './daynight-mats.js';
import { FLAME_COLORS, flameBreath } from './maze-flame.js';
import { hearthAt } from './hearth-curve.js';
import { fireSpan, burning as burnsAt } from './fire-season.js';
import { hearthFrame, TONGUES, GLOWS } from './hearth-build.js';
import { registerFirepitSfx } from './firepit-sfx.js';
import { roomAt } from './indoor-rooms.js';
import { LIVING } from './living-light.js';

const REACH = 1.5;              // m from the front of our hearth to be offered the fire
const HELD = 3;                 // candles in someone's hand, at most
const FADE = [18, 26];          // m: the flames fade out this far off (seen in through a window from the street)
const GLOW = '#ff8a3a';
const INDOOR_GUST = 0.35;       // a candle in a room gutters at this much of the storm's gust (a draught, not the wind)

const VERT = /* glsl */`
  attribute vec3 aBase, aAxis; attribute vec2 aSize; attribute float aSeed, aK, aKind; attribute vec4 aMove;
  uniform float uTime; uniform vec2 uFade;
  varying vec2 vUv; varying float vSeed, vK, vFade, vLean, vFlut, vCalm, vKind; varying vec4 vBox;
  void main() {
    vKind = aKind; vK = aK; vSeed = aSeed; vBox = aMove; vLean = 0.0; vFlut = 0.0; vCalm = 1.0;
    if (aK < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // out: nothing to draw
    vec3 base = (modelMatrix * vec4(aBase, 1.0)).xyz, wp;
    if (aKind > 0.5) {
      // a glow card lying in a plane (aAxis: its normal)
      vec3 n = normalize(aAxis);
      vec3 u = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), n));
      vec3 v = abs(n.y) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
      vec2 q = vec2(position.x, position.y * 2.0 - 1.0);
      wp = base + u * (q.x * aSize.x) + v * (q.y * aSize.y);
      vUv = q;
    } else {
      // maze-flame.js's flame: it breathes, turns about the upright to face you, leans and streams
      float s = aSeed, t = uTime;
      float breath = 0.95 + 0.09 * sin(t * (7.1 + s * 3.0) + s * 40.0) + 0.06 * sin(t * (12.7 + s * 5.0) + s * 9.0) + 0.04 * sin(t * (2.3 + s * 1.7) + s * 3.0);
      breath = mix(1.0, breath, aMove.w);
      vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      r = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5, 0.0, 0.0));
      vec3 fw = vec3(-viewMatrix[0][2], 0.0, -viewMatrix[2][2]);
      float side = dot(aMove.xy, r.xz), deep = dot(aMove.xy, normalize(fw.xz + vec2(1e-5, 0.0)));
      float q = 1.5 + 1.6 * abs(side);
      float h = aSize.y * breath * aK * (1.0 - 0.32 * min(abs(deep), 0.8)), w = aSize.x * q;
      wp = base + r * (position.x * w) + vec3(0.0, position.y * h, 0.0);
      vUv = vec2(position.x * q, position.y);
      vLean = side * aSize.y / max(aSize.x, 1e-4) * 0.9; vFlut = aMove.z; vCalm = aMove.w;
    }
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    float d = -mv.z;
    vFade = (1.0 - smoothstep(uFade.x, uFade.y, d)) * smoothstep(0.06, 0.25, d);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform float uTime, uGlowK; uniform vec3 uCore, uBody, uEdge, uGlow;
  varying vec2 vUv; varying float vSeed, vK, vFade, vLean, vFlut, vCalm, vKind; varying vec4 vBox;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    if (vFade < 0.003) discard;
    float t = uTime, s = vSeed;
    if (vKind > 0.5) {
      // the glow: soft, warm, flickering with the flames; on the face round the opening it is the frame that glows, not the hole
      float r = length(vUv), f = 0.84 + 0.1 * sin(t * 11.3 + s * 20.0) + 0.06 * sin(t * 23.7 + s * 7.0);
      float a = pow(max(0.0, 1.0 - r), 1.6);
      if (vKind > 1.5) { vec2 o = vec2(abs(vUv.x) - vBox.x, max(vBox.y - vUv.y, vUv.y - vBox.z)); a = pow(a, 1.5) * (0.3 + 0.7 * smoothstep(-0.02, 0.1, max(o.x, o.y))) * 0.8; }
      a *= vK * f * vFade * uGlowK;
      if (a < 0.003) discard;
      gl_FragColor = vec4(uGlow * a, 0.0); // premultiplied with no cover: it adds light
      return;
    }
    float y = clamp(vUv.y, 0.0, 1.0);
    float sway = (vnoise(vec2(y * 1.7 - t * 2.4, s * 17.0)) - 0.5) * 0.7 * y * y + sin(t * (2.7 + s) + s * 21.0) * 0.12 * y * y;
    sway = sway * vCalm + (vnoise(vec2(y * 3.0 - t * 15.0, s * 5.0)) - 0.5) * 1.1 * vFlut * y;
    float x = vUv.x - sway - vLean * pow(y, 1.35);
    float prof = pow(sin(3.14159 * pow(y, 0.58)), 0.85) * (1.0 - 0.3 * y);
    float r = abs(x) / max(prof, 0.001);
    float n = vnoise(vec2(x * 2.6 + s * 13.0, y * 3.4 - t * 4.6)) * 0.62 + vnoise(vec2(x * 6.0 - s * 7.0, y * 7.5 - t * 8.3)) * 0.38;
    float heat = (1.0 - r) * (1.05 - 0.6 * y) + (n - 0.5) * (0.75 * (0.45 + 0.55 * vCalm) + 0.5 * vFlut) * smoothstep(0.08, 0.85, y);
    float e = 0.035;
    float a0 = smoothstep(0.03, 0.03 + e, heat), a1 = smoothstep(0.3, 0.3 + e, heat), a2 = smoothstep(0.6, 0.6 + e, heat);
    if (a0 < 0.004) discard;
    vec3 col = mix(uEdge, uBody, a1); col = mix(col, uCore, a2);
    float a = a0 * vFade * min(1.0, vK * 1.5);
    gl_FragColor = vec4(col * a, a * (0.72 + 0.25 * a2));
  }`;

const seedOf = i => ((Math.sin(i * 91.7 + 13.1) * 43758.5453) % 1 + 1) % 1;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createFires(ctx) {
  const { scene, player, camera, net, audio, ui } = ctx;
  const find = name => ctx.features?.find(f => f.name === name) || null;
  const mh = find('main-house'), lc = find('lovecraft');
  const fires = [], candles = [];
  // ---- the fireplaces
  const addFire = (spec, house, rooms, embers, always) => {
    const room = rooms?.find(r => spec.x > r.minX && spec.x < r.maxX && spec.z > r.minZ - 0.6 && spec.z < r.maxZ + 0.6 && Math.abs((r.y ?? spec.y) - spec.y) < 0.5) || null;
    fires.push({ spec, house, room, embers, always, F: hearthFrame(spec), flame: always ? 1 : 0, ember: always ? 1 : 0, shown: false, tongues: [], glows: [], tb: null });
  };
  if (mh?.house?.inside?.hearth) { const h = mh.house.inside.hearth; addFire(h.spec, mh, mh.house.rooms, h, false); }
  if (lc?.built?.hearths) for (const s of lc.built.hearths) addFire(s, lc, lc.built.rooms, lc.built.hearthEmbers, true);
  if (lc?.built?.candles) for (const c of lc.built.candles) candles.push({ ...c, house: lc, gust: true });
  if (lc && ctx.features?.some(f => f.name === 'mazeboard')) candles.push({ id: 'board', pending: true, x: 0, y: 0, z: 0, fw: 0.012, fh: 0.048, house: lc, gust: true }); // (built on the board's first frame)
  if (!fires.length && !candles.length) return null;
  const ours = fires.find(f => !f.always) || null;

  // ---- the instances: per fire its glow cards, then its tongues; then the candles; then the held candles' slots
  const list = [];
  const inst = o => { list.push({ kind: 0, axis: [0, 1, 0], move: [0, 0, 0, 1], size: [0, 0], k: 0, ...o }); return list.length - 1; };
  for (const f of fires) {
    const s = f.spec, F = f.F, hy = (s.hy ?? s.y) - s.y;
    for (const g of GLOWS) {
      if (g.on === 'hearth') f.glows.push(inst({ kind: 1, base: F.at(0, hy + 0.004, g.w), axis: [0, 1, 0], size: [s.w * g.half[0], g.half[1]] }));
      else if (g.on === 'face') {
        const cy = s.h * 0.45, hx = s.w * g.half[0], hh = s.h * g.half[1];
        f.glows.push(inst({ kind: 2, base: F.at(0, cy, g.w), axis: [s.nx, 0, s.nz], size: [hx, hh], move: [s.w / hx, (0 - cy) / hh, (s.h - cy) / hh, 0] }));
      } else f.glows.push(inst({ kind: 1, base: F.at(0, s.h * 0.35, s.d * g.w), axis: [s.nx, 0, s.nz], size: [s.w * g.half[0], s.h * g.half[1]] }));
    }
    const ku = s.w / 0.42, kh = s.h / 0.7;
    for (const [u, w, fw, fh, late] of TONGUES) f.tongues.push({ i: inst({ base: F.at(u * ku, 0.12, s.d * w), size: [fw * ku, fh * kh] }), late });
  }
  for (const c of candles) { c.i = inst({ base: [c.x, c.y, c.z], size: [c.fw, c.fh], move: [0, 0, 0, 0.55] }); c.inRoom = !!roomAt(c.x, c.y, c.z); }
  const held = [];
  for (let h = 0; h < HELD; h++) held.push({ i: inst({ base: [0, 0, 0], size: [0.012, 0.046], move: [0, 0, 0, 0.55] }), who: null });
  const n = list.length, board = candles.find(c => c.id === 'board') || null, firstAlways = fires.find(f => f.always) || null;

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const A = (k, w) => new Float32Array(n * w);
  const base = A(0, 3), axis = A(0, 3), size = A(0, 2), seed = A(0, 1), kk = A(0, 1), kind = A(0, 1), move = A(0, 4);
  list.forEach((o, i) => {
    base.set(o.base, i * 3); axis.set(o.axis, i * 3); size.set(o.size, i * 2); move.set(o.move, i * 4);
    seed[i] = seedOf(i); kk[i] = 0; kind[i] = o.kind;
  });
  const attr = (name, arr, w, dyn) => { const a = new THREE.InstancedBufferAttribute(arr, w); if (dyn) a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const aBase = attr('aBase', base, 3, true), aK = attr('aK', kk, 1, true), aMove = attr('aMove', move, 4, true);
  attr('aAxis', axis, 3); attr('aSize', size, 2); attr('aSeed', seed, 1); attr('aKind', kind, 1);
  geo.instanceCount = n;
  const uniforms = {
    uTime: { value: 0 }, uFade: { value: new THREE.Vector2(FADE[0], FADE[1]) }, uGlowK: { value: 0.5 },
    uCore: { value: new THREE.Color(FLAME_COLORS.core) }, uBody: { value: new THREE.Color(FLAME_COLORS.body) }, uEdge: { value: new THREE.Color(FLAME_COLORS.edge) }, uGlow: { value: new THREE.Color(GLOW) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false,
  });
  mat.name = 'fires-flames';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fires-flames'; mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.visible = false;
  mesh.layers.set(LAYER_SOFT); mesh.userData.noMerge = true;
  scene.add(mesh);

  // ---- the light: one warm spot, parked on the nearest fire you can see
  const light = new THREE.SpotLight('#ff9a4a', 0, 7.5, 1.3, 0.85, 2);
  light.name = 'fires-light'; light.castShadow = false;
  scene.add(light, light.target);
  let lightOn = null;

  // ---- our fire: shared, lit and put out by anyone in the house
  let litAt = null, outAt = null, by = null, heard = false;
  registerFirepitSfx(audio);
  if (audio?.registerSfx && !audio._hearthSfx) {
    audio._hearthSfx = true;
    // putting it out: the poker spreading the logs, a soft smothered whuff and a little hiss
    audio.registerSfx('hearth-out', (a, x, y, z) => {
      const o = x === undefined ? a.sfx : a.at(x, y, z, 3), t = a.ctx.currentTime;
      a.burst(o, { t, dur: 0.18, type: 'bandpass', f: 900, Q: 1.2, peak: 0.06 });
      a.burst(o, { t: t + 0.12, dur: 0.5, type: 'lowpass', f: 380, peak: 0.1, attack: 0.08, brown: true });
      a.burst(o, { t: t + 0.25, dur: 1.2, type: 'bandpass', f: 3200, Q: 0.6, peak: 0.025, attack: 0.15 });
    });
  }
  const front = f => f.F.at(0, 0, -0.6);
  net.on('hearth', m => {
    const nl = Number.isFinite(m.litAt) ? m.litAt : null, no = Number.isFinite(m.outAt) ? m.outAt : null, first = !heard;
    heard = true;
    const lit = nl !== litAt && nl !== null, doused = no !== outAt && no !== null;
    litAt = nl; outAt = no; by = typeof m.by === 'string' ? m.by : null;
    if (first || !ours) return; // what was already so when you arrived: no sound, no word
    const here = mh?.inside?.() || false, mine = m.bySid != null && m.bySid === net.sid, [x, y, z] = ours.F.at(0, 0.3, 0.1);
    if (lit) { if (here) { audio.play?.('fire-light', x, y, z); ui.toast(mine ? `The fire is catching. ${fireSpan(litAt, outAt, net.serverNow(), sp).night ? 'It burns till 2.' : 'It burns for three hours.'}` : `${by || 'Someone'} lit the fire.`, 2600); } }
    else if (doused && here) { audio.play?.('hearth-out', x, y, z); ui.toast(mine ? 'Fire out.' : `${by || 'Someone'} put the fire out.`, 2200); }
  });
  const sp = {}; // (our fire's span: fire-season.js, the schedule and the last E)
  const burning = () => burnsAt(litAt, outAt, net.serverNow());
  const send = op => net.send({ t: 'hearth', op });

  // ---- the crackle: a small table per fire (audio.js 'hearth'), heard only in its room
  for (const f of fires) {
    const [x, y, z] = f.F.at(0, 0.3, 0.1);
    f.tb = { theme: 'hearth', x, y, z, node: null, next: {}, k: 0 };
    audio?.tables?.push(f.tb);
  }

  const st = {};
  let dirtyK = false, dirtyB = false, dirtyM = false, glowNight = -1;
  const setK = (i, v) => { if (Math.abs(kk[i] - v) > 0.002 || (v === 0 && kk[i] !== 0)) { kk[i] = v; dirtyK = true; } };
  const v3 = new THREE.Vector3(), ash = new THREE.Color('#77706a'), emberCol = new THREE.Color('#e8561a');
  const inRoom = r => { const p = player.pos; return !!r && p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ && Math.abs(p.y - (r.y ?? p.y)) < 1.6; };
  let holders = [], scanAt = 0, pinned;

  function update(dt) {
    const t = performance.now() / 1000, now = net.serverNow(), night = LIGHT.night || 0;
    uniforms.uTime.value = t % 1000;
    let any = false, best = null, bd = Infinity;
    // the fires
    for (const f of fires) {
      if (!f.always) {
        if (pinned !== undefined) { f.flame = pinned; f.ember = pinned; } else { fireSpan(litAt, outAt, now, sp); hearthAt(sp.from, sp.to, now, st); f.flame = st.flame; f.ember = st.ember; }
      }
      const shown = !!f.house?.insideShown;
      f.shown = shown;
      const F = shown ? f.flame : 0, E = shown ? f.ember : 0;
      for (const g of f.glows) setK(g, Math.min(1, F * 0.9 + E * 0.25));
      for (const tg of f.tongues) setK(tg.i, F <= 0 ? 0 : clamp01((F - tg.late * 0.55) / (1 - tg.late * 0.55)));
      if (shown && (F > 0.005 || E > 0.01)) {
        any = true;
        const [x, y, z] = f.F.at(0, f.spec.h * 0.4, 0), d = camera.position.distanceToSquared(v3.set(x, y, z));
        if (d < bd) { bd = d; best = f; }
      }
      // the coals: glowing while it burns, cooling to ash when it is out (the Lovecraft fires share theirs: both always burn)
      if (shown && f.embers?.emberMat && (!f.always || f === firstAlways)) {
        const em = f.embers.emberMat, p = 0.85 + 0.15 * Math.sin(t * 3.7 + f.spec.x) * Math.sin(t * 1.3);
        em.color.copy(ash).lerp(emberCol, Math.min(1, f.ember * 1.4));
        em.emissiveIntensity = f.ember * (0.55 + night * 0.3) * p;
      }
      if (f.tb) f.tb.k = shown && inRoom(f.room) ? Math.max(f.flame, f.ember * 0.25) : 0;
    }
    // the candles that stand somewhere (on a table that is only out on open days, on the board's ledge)
    if (board?.pending) {
      const c = find('mazeboard')?.candle;
      if (c) { Object.assign(board, c, { pending: false }); board.inRoom = !!roomAt(c.x, c.y, c.z); base.set([c.x, c.y, c.z], board.i * 3); size[board.i * 2] = c.fw; size[board.i * 2 + 1] = c.fh; geo.attributes.aSize.needsUpdate = true; dirtyB = true; }
    }
    const gust = (WEATHER.gust || 0) * (WEATHER.local || 0), soft = 1 - (1 - INDOOR_GUST) * (WEATHER.indoor || 0);
    for (const c of candles) {
      const on = !c.pending && !!c.house?.insideShown && c.group?.visible !== false;
      const gk = c.gust ? gust * (c.inRoom ? INDOOR_GUST : soft) : 0;
      setK(c.i, on ? 1 - 0.3 * gk * (0.5 + 0.5 * Math.sin(t * 21 + c.x) * Math.sin(t * 7.7 + 1)) : 0);
      if (on) { any = true; gutter(c.i, gk, t, c.x); }
    }
    // candles in someone's hand: the Lovecraft folk (the Cultist), anyone else who carries one
    if (t > scanAt) {
      scanAt = t + 1;
      holders = [];
      for (const fk of lc?.folk || []) if (fk.h?.candle) holders.push({ h: fk.h, house: lc });
      for (const d of ctx.npcs?.npcs || []) if (d.body?.h?.candle || d.body?.candle) holders.push({ h: d.body.h || d.body, house: null });
    }
    let hi = 0;
    for (const hd of holders) {
      const h = hd.h, g = h.candle, fl = g?.userData.flame;
      if (!g || hi >= held.length) continue;
      if (fl && fl.visible) fl.visible = false; // the blob it had: the real flame is ours
      const vis = h.root.visible && (!hd.house || hd.house.insideShown);
      if (!vis) continue;
      const slot = held[hi++];
      g.updateWorldMatrix(true, false);
      const w = g.userData.wick || [0, 0.172, 0];
      g.localToWorld(v3.set(w[0], w[1], w[2]));
      base[slot.i * 3] = v3.x; base[slot.i * 3 + 1] = v3.y; base[slot.i * 3 + 2] = v3.z; dirtyB = true;
      setK(slot.i, 1); gutter(slot.i, hd.house ? gust * soft : 0, t, slot.i);
      any = true;
    }
    for (; hi < held.length; hi++) setK(held[hi].i, 0);
    if (dirtyK) { aK.needsUpdate = true; dirtyK = false; }
    if (dirtyB) { aBase.needsUpdate = true; dirtyB = false; }
    if (dirtyM) { aMove.needsUpdate = true; dirtyM = false; }
    if (mesh.visible !== any) mesh.visible = any;
    // the glow is soft by day and warmer at night
    const gn = Math.round(night * 20) / 20;
    if (gn !== glowNight) { glowNight = gn; uniforms.uGlowK.value = 0.32 + 0.38 * gn; }

    // the light, on the nearest fire you can see, flickering with its middle flame
    if (best) {
      const s = best.spec, F = best.F;
      if (lightOn !== best) {
        lightOn = best;
        light.position.set(...F.at(0, s.h * 0.42, s.d * 0.25));
        light.target.position.set(...F.at(0, -0.5, -2.6));
        light.target.updateMatrixWorld();
      }
      const fl = flameBreath(t, seed[best.tongues[0].i]) * (0.9 + 0.06 * Math.sin(t * 17.3 + 1.1) + 0.04 * Math.sin(t * 29.1));
      const L = best.flame * 0.92 + best.ember * 0.1;
      // our living room with its main light off (10 pm-7 am, living-light.js): the fire is the room's only light, so it reaches further
      const dark = best.always ? 0 : 1 - LIVING.k;
      light.distance = 7.5 + 3.5 * dark;
      light.intensity = (2.6 + night * 3.4) * (1 + 1.8 * dark) * L * (best.flame > 0.02 ? fl : 0.92);
    } else if (light.intensity !== 0) { light.intensity = 0; lightOn = null; }
  }
  // a candle's flame in the storm: it leans with the gust and flutters (maze-flame.js's aMove: lean x, z, flutter, unrest)
  function gutter(i, g, t, s) {
    const j = i * 4, lx = g > 0.01 ? 0.28 * g * (0.6 + 0.4 * Math.sin(t * 1.7 + s)) : 0, fl = g > 0.01 ? Math.min(1, g * (0.6 + 0.4 * Math.sin(t * 4.3 + s))) : 0;
    if (Math.abs(move[j] - lx) > 0.003 || Math.abs(move[j + 2] - fl) > 0.003) { move[j] = lx; move[j + 1] = lx * 0.4; move[j + 2] = fl; dirtyM = true; }
  }

  const api = {
    name: 'fires',
    mesh, spot: light, fires, candles,
    get count() { return n; },
    // our fire right now: { flame, ember, lit, litAt, outAt, by }
    fire() { const now = net.serverNow(), s = fireSpan(litAt, outAt, now, {}), r = hearthAt(s.from, s.to, now, {}); return { ...r, litAt, outAt, by, span: s, flame: ours ? ours.flame : 0, ember: ours ? ours.ember : 0, lit: burning() }; },
    light: () => send('light'), out: () => send('out'),
    preview(v) { pinned = v; },   // pictures: pin our fire's look (0..1), undefined = live
    // the flames as drawn this frame (tests): every instance's kind, size now and where
    instances() { return list.map((o, i) => ({ kind: kind[i], k: kk[i], x: base[i * 3], y: base[i * 3 + 1], z: base[i * 3 + 2], move: [...move.subarray(i * 4, i * 4 + 4)] })); },
    target(px, pz) {
      if (!ours || !mh?.inside?.() || mh.room !== 'living') return null;
      const [fx, , fz] = front(ours);
      if (Math.hypot(px - fx, pz - fz) > REACH) return null;
      return burning() ? { hint: 'E  Put out the fire', prio: 6, run: () => send('out') } : { hint: 'E  Light the fire', prio: 6, run: () => send('light') };
    },
    update,
    introUpdate: dt => update(dt), // (the morning walks you past the fireplace)
    help: [[['E'], 'at the fireplace in the house: light the fire or put it out']],
  };
  return api;
}
