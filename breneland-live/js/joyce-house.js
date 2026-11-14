// Joyce's house (docs/briefs/joyce-house.md): the house from Andrew's photo (joyce-house-build.js), her garage you can walk into by its
// side door (the cart parks in it; the big door rolls up and over when she drives in or out), the house seen through its front
// window and the sun room's glass (real glass, real-glass.js), its lamps, the gas firepit on the patio (a real flame on its burner
// ring, a soft hiss, lit while Joyce sits out in the evening), the evening's chatter, and the bocce balls on a Thursday.
// Everything Joyce, Molly and the girlfriends do is pure from the shared clock (joyce-day.js, joyce-evening.js); this only draws it.
//
// feature.api (tests and pictures): built, plan, glassView, insideShown, door() (the garage door 0..1), doorsOpen, fire(), lampsOn,
//   inGarage(x, z), spots (the night spots), flames, balls, iv
import * as THREE from 'three';
import { buildJoyceHouse, LAMP_IN, LAMP_GARAGE } from './joyce-house-build.js';
import { JH, FIRE_LINES, SUN_LINES, WALK_LINES, BOCCE_LINES } from './joyce-house-plan.js';
import { joyceAt, cartAt } from './joyce-day.js';
import { firepitAt, bocceAt, eveningAt } from './joyce-evening.js';
import { addSurface } from './terrain.js';
import { addRoom } from './indoor-rooms.js';
import { indoorView } from './indoor-view.js';
import { createGlassView, insideInk } from './real-glass.js';
import { LIGHT, LAMPS, NIGHT_SPOTS, GLASS_DAY } from './daynight-mats.js';
import { LAYER_SOFT } from './toon.js';
import { FLAME_COLORS } from './maze-flame.js';
import { GFX } from './gfx.js';
import { hash01 } from './util.js';
import { R_BALL, R_PAL } from './bocce-rules.js';

// ---------------------------------------------------------------- the gas flame: a ring of small toon flames (maze-flame.js's look)
const FVERT = /* glsl */`
  attribute vec3 aBase; attribute vec2 aSize; attribute float aSeed;
  uniform float uTime, uK;
  varying vec2 vUv; varying float vSeed, vFade;
  void main() {
    float s = aSeed, t = uTime;
    float breath = 0.95 + 0.09 * sin(t * (7.1 + s * 3.0) + s * 40.0) + 0.06 * sin(t * (12.7 + s * 5.0) + s * 9.0);
    vec3 base = (modelMatrix * vec4(aBase, 1.0)).xyz;
    vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    r = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5, 0.0, 0.0));
    float h = aSize.y * breath * uK, w = aSize.x * 1.6;
    vec3 wp = base + r * (position.x * w) + vec3(0.0, position.y * h, 0.0);
    vUv = vec2(position.x * 1.6, position.y); vSeed = s;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vFade = 1.0 - smoothstep(30.0, 45.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FFRAG = /* glsl */`
  uniform float uTime, uK; uniform vec3 uCore, uBody, uEdge;
  varying vec2 vUv; varying float vSeed, vFade;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    if (uK < 0.01 || vFade < 0.003) discard;
    float t = uTime, s = vSeed, y = clamp(vUv.y, 0.0, 1.0);
    float sway = (vnoise(vec2(y * 1.7 - t * 2.4, s * 17.0)) - 0.5) * 0.7 * y * y + sin(t * (2.7 + s) + s * 21.0) * 0.12 * y * y;
    float x = vUv.x - sway;
    float prof = pow(sin(3.14159 * pow(y, 0.58)), 0.85) * (1.0 - 0.3 * y);
    float r = abs(x) / max(prof, 0.001);
    float n = vnoise(vec2(x * 2.6 + s * 13.0, y * 3.4 - t * 4.6)) * 0.62 + vnoise(vec2(x * 6.0 - s * 7.0, y * 7.5 - t * 8.3)) * 0.38;
    float heat = (1.0 - r) * (1.05 - 0.6 * y) + (n - 0.5) * 0.75 * smoothstep(0.08, 0.85, y);
    float e = 0.035;
    float a0 = smoothstep(0.03, 0.03 + e, heat), a1 = smoothstep(0.3, 0.3 + e, heat), a2 = smoothstep(0.6, 0.6 + e, heat);
    if (a0 < 0.004) discard;
    vec3 col = mix(uEdge, uBody, a1); col = mix(col, uCore, a2);
    float a = a0 * vFade * min(1.0, uK * 1.5);
    gl_FragColor = vec4(col * a, a * (0.72 + 0.25 * a2));
  }`;
function gasFlames(pit, y) {
  const pts = [];
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; pts.push([pit.x + Math.cos(a) * 0.3, y, pit.z + Math.sin(a) * 0.3, 0.075, 0.4]); }
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + 0.4; pts.push([pit.x + Math.cos(a) * 0.13, y, pit.z + Math.sin(a) * 0.13, 0.1, 0.55]); }
  const n = pts.length, geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const base = new Float32Array(n * 3), size = new Float32Array(n * 2), seed = new Float32Array(n);
  pts.forEach(([x, yy, z, w, h], i) => { base.set([x, yy, z], i * 3); size.set([w, h], i * 2); seed[i] = ((Math.sin(i * 91.7 + 5.3) * 43758.5453) % 1 + 1) % 1; });
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  geo.instanceCount = n;
  const c = new THREE.Color();
  const uniforms = { uTime: { value: 0 }, uK: { value: 0 }, uCore: { value: c.set(FLAME_COLORS.core).clone() }, uBody: { value: c.set('#ffb347').clone() }, uEdge: { value: c.set('#3f7fe0').clone() } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: FVERT, fragmentShader: FFRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false });
  mat.name = 'joyce-firepit-flames';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'joyce-firepit-flames'; mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.visible = false;
  mesh.layers.set(LAYER_SOFT); mesh.userData.noMerge = true;
  // (the instances' corners for the lights audit: a fixture is a flame's triangles; its base points stand in)
  mesh.userData.flamePts = pts.map(([x, yy, z]) => [x, yy + 0.1, z]);
  return { mesh, uniforms, pts };
}

export function createJoyceHouse(ctx) {
  const { scene, player, colliders, camera, net, audio, ui, npcs } = ctx;
  const joyce = npcs?.npcs?.find(d => d.joyce);
  if (!joyce) return null;   // no garden in this lobby, so Joyce has no day of her own
  for (const c of colliders) if (c.joyceLot) c.off = true;   // (world.js kept the grass off her lot with these)
  const P = JH, G = P.garage, S = P.sun;
  const spots0 = NIGHT_SPOTS.length;
  const built = buildJoyceHouse(scene, colliders);
  const mySpots = NIGHT_SPOTS.slice(spots0);
  const inSpots = mySpots.filter(s => s.joyceIn), coachSpots = mySpots.filter(s => s.halo > 0);
  const garageSpot = mySpots.find(s => Math.abs(s.x - built.garageLight.x) < 0.01 && Math.abs(s.z - built.garageLight.z) < 0.01);
  // ---- the floors people stand on (NPCs inside; players in the garage, on the porch, the patio, the driveway)
  addSurface({ minX: G.in.minX, maxX: G.in.maxX, minZ: G.in.minZ, maxZ: G.in.maxZ, y: P.GY });
  addSurface({ minX: P.GX + P.T / 2, maxX: P.maxX - P.T, minZ: P.BZ, maxZ: P.porch.minZ - P.T, y: P.FY });
  addSurface({ minX: P.porch.maxX + P.T, maxX: P.maxX - P.T, minZ: P.porch.minZ - P.T, maxZ: P.FZ - P.T, y: P.FY });
  addSurface({ minX: S.minX + 0.12, maxX: S.maxX - 0.12, minZ: S.minZ + 0.12, maxZ: P.BZ + P.T, y: P.FY });
  addSurface({ minX: P.porch.minX, maxX: P.porch.maxX + 0.25, minZ: P.porch.minZ, maxZ: P.FZ + 0.55, y: 0.47 });
  addSurface({ minX: P.patio.minX, maxX: P.patio.maxX, minZ: P.patio.minZ, maxZ: P.patio.maxZ, y: P.patio.y });
  addSurface({ minX: P.drive.minX, maxX: P.drive.maxX, minZ: P.FZ, maxZ: P.drive.maxZ - 0.6, y: P.drive.y });
  addSurface({ minX: P.walk.minX, maxX: P.walk.maxX, minZ: P.walk.minZ, maxZ: P.walk.maxZ - 0.6, y: P.walk.y });
  addRoom({ id: 'joyce-garage', minX: G.minX, maxX: G.maxX, minZ: G.minZ, maxZ: G.maxZ, y0: P.GY, y1: P.GY + 2.74 });   // dry inside
  // ---- the garage: walk in by the side door (indoor-view.js: first person or the room view, F)
  const inG = (x, z) => x > G.in.minX && x < G.in.maxX && z > G.in.minZ && z < G.in.maxZ;
  const iv = indoorView(ctx);
  const kT = new THREE.Vector3();
  const pad = 0.3;
  const keepOut = cam => {   // the follow camera outside stays out of the garage's walls and roof
    const c = cam.position;
    if (inG(player.pos.x, player.pos.z) || !(c.x > G.minX - pad && c.x < G.maxX + pad && c.z > G.minZ - pad && c.z < G.maxZ + pad) || c.y > P.EY + 2.2) return;
    kT.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    let t = 1;
    for (let i = 1; i <= 24; i++) { const u = i / 24, x = kT.x + (c.x - kT.x) * u, z = kT.z + (c.z - kT.z) * u; if (x > G.minX - pad && x < G.maxX + pad && z > G.minZ - pad && z < G.maxZ + pad) { t = (i - 1) / 24; break; } }
    c.lerpVectors(kT, c, Math.max(0.12, t)); cam.lookAt(kT);
  };
  const W = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ, y0: P.gy, y1: P.GY + 2.8 });
  const bld = iv.register({
    id: 'joyce-garage', inside: inG, keepOut,
    rooms: [{ id: 'garage', minX: G.in.minX, maxX: G.in.maxX, minZ: G.in.minZ, maxZ: G.in.maxZ, y: P.GY, top: P.GY + 2.74,
      cams: [[G.in.minX + 0.45, G.in.minZ + 0.45, P.GY + 2.3], [G.in.maxX - 0.45, G.in.minZ + 0.45, P.GY + 2.3], [G.in.minX + 0.45, G.in.maxZ - 0.45, P.GY + 2.3], [G.in.maxX - 0.45, G.in.maxZ - 0.45, P.GY + 2.3]] }],
    walls: [W(G.minX, G.minX + P.T, G.minZ, G.maxZ), W(G.maxX - P.T, G.maxX, G.minZ, G.maxZ), W(G.minX, G.maxX, G.minZ - 0.08, G.minZ + 0.08), W(G.minX, G.maxX, G.maxZ - P.T, G.maxZ)],
  });
  // ---- the real glass: the front window and the sun room
  const box = { minX: P.minX, maxX: P.maxX, minZ: S.minZ, maxZ: P.FZ };
  const gv = createGlassView({ boxes: [box], meshes: () => built.glassMeshes, mats: [built.glassReal], U: built.glassU });
  let showIn = null, inkFull = null;
  const show = on => { if (on === showIn) return; showIn = on; built.inside.visible = on; };
  show(false);
  // ---- the firepit: its flames, the glow on the patio (a night spot whose k is the fire), the hiss
  const pit = P.pit, flameY = P.patio.y + pit.h + 0.005;
  const fl = gasFlames(pit, flameY);
  built.group.add(fl.mesh);
  // the burner ring glows while the gas burns (the flame's own fixture for the glow's night spot)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#4a4a50', fog: true }); ringMat.name = 'joyce-firepit-ring';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 4, 24), ringMat);
  ring.name = 'joyce-firepit-ring'; ring.rotation.x = Math.PI / 2; ring.position.set(pit.x, P.patio.y + pit.h + 0.008, pit.z); ring.userData.noMerge = true;
  built.group.add(ring);
  const ringOff = new THREE.Color('#4a4a50'), ringOn = new THREE.Color('#ff9a3a');
  let ringK = -1;
  const fireSpot = (() => { NIGHT_SPOTS.push({ x: pit.x, y: flameY + 0.18, z: pit.z, color: '#ffb066', pool: 2.8, gy: P.patio.y + 0.01, halo: 0, flicker: 0.6, k: 0, day: 0 }); return NIGHT_SPOTS[NIGHT_SPOTS.length - 1]; })();
  const tb = { theme: 'gasfire', x: pit.x, y: flameY + 0.2, z: pit.z, node: null, next: {}, k: 0 };
  audio?.tables?.push(tb);
  const fire = { lit: false, k: 0, kind: null };
  // ---- the bocce balls (Thursday evenings at the court): nine instanced spheres
  const ballMat = new THREE.MeshToonMaterial({ color: '#ffffff' }); ballMat.name = 'joyce-bocce';
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), ballMat, 9);
  balls.name = 'joyce-bocce-balls'; balls.visible = false; balls.castShadow = true; balls.userData.noMerge = true;
  const bcol = new THREE.Color();
  for (let i = 0; i < 9; i++) balls.setColorAt(i, bcol.set(i === 0 ? '#f6f3ea' : i <= 4 ? '#d8343c' : '#3f9a4a'));
  scene.add(balls);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  // ---- the doors: the garage door from the cart's schedule, the leaves swing for whoever is at them
  const D = built.doorSpecs, doorK = D.map(() => 0);
  const hinge = D.map(d => new THREE.Vector3(d.x, d.y, d.z));
  const doorAt = [[P.pts.front, P.pts.frontIn], [[G.minX - 0.5, (G.side.z0 + G.side.z1) / 2], [G.minX + 0.6, (G.side.z0 + G.side.z1) / 2]], [P.pts.innerIn, P.pts.innerOut], [P.pts.sunDoorIn, P.pts.sunDoorOut]];
  const nearDoor = (i, x, z, r) => doorAt[i].some(([a, b]) => Math.hypot(x - a, z - b) < r) || Math.hypot(x - (doorAt[i][0][0] + doorAt[i][1][0]) / 2, z - (doorAt[i][0][1] + doorAt[i][1][1]) / 2) < r * 0.8;
  const qy = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
  const placeDoors = () => {
    D.forEach((d, i) => {
      qy.setFromAxisAngle(yAxis, d.yaw + d.open * doorK[i]);
      m4.compose(hinge[i], qy, s3.set(d.w / 0.9, 1, 1));
      built.doors.setMatrixAt(i, m4);
    });
    built.doors.instanceMatrix.needsUpdate = true;
    built.doors.computeBoundingSphere();
  };
  placeDoors();
  let garageK = 0, sideWas = false;
  // the garage door: up while the cart goes through it (from 6 s before it moves near the door to 3 s after), from the cart's own
  // schedule (pure: the same on every screen)
  const GD = P.garage.door, doorZ = P.FZ - P.T, cq = {};
  function garageTarget(ms) {
    for (let k = -3; k <= 6; k += 1.5) {
      const c = cartAt(ms + k * 1000, cq);
      if (c.moving && Math.abs(c.x - P.park.x) < 2.5 && c.z > doorZ - 4.2 && c.z < doorZ + 6) return 1;
    }
    return 0;
  }
  // the door's travel (2.6 s up, 2.6 s down) as a pure function of the clock: the run of the same target back from now on a 0.2 s
  // grid (cached), so every screen shows it at the same height whatever its frame rate
  const GRID = 0.2, TRAVEL = 2.6, NG = Math.ceil(TRAVEL / GRID), tg = new Map();
  const targetAt = q => { let v = tg.get(q); if (v === undefined) { v = garageTarget(q * GRID * 1000); tg.set(q, v); if (tg.size > 64) tg.delete(tg.keys().next().value); } return v; };
  function garageAt(ms) {
    const q = Math.floor(ms / 1000 / GRID), now = targetAt(q);
    let n = 1; while (n <= NG && targetAt(q - n) === now) n++;
    const run = Math.min(TRAVEL, (n - 1) * GRID + (ms / 1000 - q * GRID));
    if (n > NG) return now;
    // the door was going the other way before this run: where it was then (at most a full travel back) and on from there
    const before = now ? Math.max(0, 1 - (() => { let m = 0; while (m < NG && targetAt(q - n - m) === 1 - now) m++; return Math.min(TRAVEL, m * GRID) / TRAVEL; })()) : 0;
    return now ? Math.min(1, before + run / TRAVEL) : Math.max(0, 1 - run / TRAVEL);
  }
  // ---- the evening's chatter (who speaks and what: the shared clock; heard and seen only near)
  let chatSlot = -1;
  const said = new Set();
  const guests = () => (ctx.features?.find(f => f.name === 'town')?.people || []);
  function chatter(t, px, pz) {
    const slot = Math.floor(t / 9);
    if (slot === chatSlot) return;
    chatSlot = slot;
    const E = eveningAt(t * 1000);
    const jr = joyce.body.root;
    if (!jr.visible || Math.hypot(px - jr.position.x, pz - jr.position.z) > 16) return;
    const s = joyce._s?.joyce;
    if (!s || s.phase === 'evening') return;
    const lines = s.phase === 'fire' ? FIRE_LINES : s.phase === 'tea' ? SUN_LINES : s.phase === 'group-walk' || s.phase === 'meet' ? WALK_LINES : s.phase === 'bocce' ? BOCCE_LINES : null;
    if (!lines) return;
    if (hash01('jh-talk', slot) > 0.55) return;
    const people = [{ obj: jr, name: 'joyce', voice: joyce.voice }];
    for (const p of guests()) if (E.friends.includes(p.npc) && p.h && p.h.root.visible && Math.hypot(p.h.root.position.x - jr.position.x, p.h.root.position.z - jr.position.z) < 12) people.push({ obj: p.h.root, name: p.npc, voice: p.voice });
    const who = people[Math.floor(hash01('jh-who', slot) * people.length)], line = lines[Math.floor(hash01('jh-line', slot) * lines.length)];
    const key = slot + ':' + who.name;
    if (said.has(key)) return;
    said.add(key); if (said.size > 200) said.clear();
    ui.say(who.obj, line, 3.4, 2.2);
    const q = who.obj.position; audio.speak?.(q.x, q.y + 1.5, q.z, line, who.voice || { pitch: 200 });
  }
  // ---- the lamps: the house's on while Joyce is up at home (dusk to her bedtime), the coach lamps every night, the garage's batten
  // while someone is in the garage or its door is up
  let lampsOn = null, glassNight = -1, gLight = null;
  const setLamps = on => {
    if (on === lampsOn) return;
    lampsOn = on;
    LAMPS.get(LAMP_IN).base.set(on ? LAMP_IN : '#3a342c');
    for (const s of inSpots) s.k = on ? 1 : 0;
  };
  const glassLamp = new THREE.Color('#ffd98e'), glassDark = new THREE.Color('#2a3446'), cDay = new THREE.Color(GLASS_DAY);
  const api = {
    built, plan: P, glassView: gv, iv: bld, balls, flames: fl.mesh, spots: { inSpots, coachSpots, fireSpot, garageSpot },
    get insideShown() { return showIn; }, get door() { return garageK; }, get doorsOpen() { return doorK.slice(); },
    fire: () => ({ ...fire }), get lampsOn() { return lampsOn; },
    inGarage: inG, look: (yaw, pitch) => iv.look(yaw, pitch), tb,
  };
  function update(dt) {
    const ms = net.serverNow(), t = ms / 1000, now = performance.now() / 1000;
    const px = player.pos.x, pz = player.pos.z, c = camera.position;
    dt = Math.min(dt || 0.033, 0.1);
    const J = joyce._s?.joyce || joyceAt(ms);
    // the garage door
    const gk = garageAt(ms);
    if (gk !== garageK) {
      garageK = gk;
      const th = garageK * Math.PI / 2, Hd = GD.h - 0.01;
      built.garageDoor.position.set((GD.x0 + GD.x1) / 2, P.GY + GD.h, doorZ + 0.07 - Hd * Math.sin(th));
      built.garageDoor.rotation.x = -th;
      built.doorCollider.off = garageK > 0.75;
    }
    // the door leaves: open while someone is at them (Joyce, the girlfriends; you at the garage's side door)
    const jp = joyce.body.root.visible ? joyce.body.root.position : null;
    for (let i = 0; i < D.length; i++) {
      let near = jp ? nearDoor(i, jp.x, jp.z, 1.1) : false;
      if (!near && i === 1) near = nearDoor(i, px, pz, 1.6) && Math.abs(player.pos.y - P.GY) < 1;
      if (!near && i === 3) for (const p of guests()) { const r = p.h?.root; if (r && r.visible && nearDoor(i, r.position.x, r.position.z, 1.1)) { near = true; break; } }
      const want = near ? 1 : 0;
      if (want !== doorK[i]) { doorK[i] += Math.sign(want - doorK[i]) * Math.min(Math.abs(want - doorK[i]), dt * 3); doorK[i] = Math.round(doorK[i] * 1000) / 1000; api._dirty = true; }
    }
    if (api._dirty) { api._dirty = false; placeDoors(); }
    const pin = inG(px, pz);
    if (pin !== sideWas) { sideWas = pin; if (!pin) iv.reset(); }
    if (pin && inG(c.x, c.z)) ui.indoors = true;
    iv.update();
    // the lamps
    const h = LIGHT.hour;
    setLamps(!J.hidden && h >= 6 && h < 22.5);
    const gOn = (pin || garageK > 0.05) ? 1 : 0;
    if (gOn !== gLight) { gLight = gOn; if (garageSpot) { garageSpot.k = gOn; garageSpot.day = pin ? 0.6 : 0; } LAMPS.get(LAMP_GARAGE).base.set(gOn ? LAMP_GARAGE : '#3a3730'); }
    // the glass: by day the sky's blue, at night a warm lamp-lit glow while her lamps are on (else dark)
    const night = Math.round((LIGHT.night || 0) * 20) / 20 + (lampsOn ? 0 : 2);
    if (night !== glassNight) { glassNight = night; built.glassBase.color.copy(cDay).lerp(lampsOn ? glassLamp : glassDark, LIGHT.night || 0); built.glassReal.color.copy(built.glassBase.color); }
    // the inside: drawn while the glass lets you see in (or you are right by it)
    const looks = gv.update(dt, camera, false);
    show(looks);
    if (showIn) { const full = GFX.cls === 'desktop'; if (full !== inkFull) { inkFull = full; insideInk([built.inside], full); } }
    // the firepit
    firepitAt(ms, fire);
    const near = Math.abs(c.x - pit.x) + Math.abs(c.z - pit.z) < 60;
    fl.mesh.visible = fire.k > 0.001 && near;
    ring.visible = near;
    fl.uniforms.uK.value = fire.k; fl.uniforms.uTime.value = now % 1000;
    fireSpot.k = fire.k;
    if (fire.k !== ringK) { ringK = fire.k; ringMat.color.copy(ringOff).lerp(ringOn, fire.k); }
    tb.k = fire.k * (Math.hypot(px - pit.x, pz - pit.z) < 26 ? 1 : 0);
    // the bocce balls
    const bl = Math.abs(c.x - (-104)) + Math.abs(c.z - 10) < 90 ? bocceAt(ms) : null;
    balls.visible = !!(bl && bl.length);
    if (balls.visible) {
      for (let i = 0; i < 9; i++) { m4.compose(v3.set(0, -50, 0), q0, s3.set(0.001, 0.001, 0.001)); balls.setMatrixAt(i, m4); }
      for (const b of bl) { const r = b.i === 0 ? R_PAL : R_BALL; m4.compose(v3.set(b.x, b.y, b.z), q0, s3.set(r, r, r)); balls.setMatrixAt(b.i, m4); }
      balls.instanceMatrix.needsUpdate = true; balls.computeBoundingSphere();
    }
    chatter(t, px, pz);
  }
  return {
    name: 'joyce-house',
    update,
    api,
    help: [],
  };
}
