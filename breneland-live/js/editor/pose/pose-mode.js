// The Pose Editor (pose-editor, Andrew 2026-11-10): "an editor that lets me move and pose the models in the game, in a separate
// environment that uses the map ... a tool to pose for storyboarding. I'll take the screenshots and use them with another AI tool."
//
// main.js starts this for /?preview&pose (the frame public/editor/pose.html shows, owner only): the real town as the game builds it,
// with nobody in it (the townsfolk, the dogs, the traffic and you hidden every frame), no HUD and no sound. This module is the editor:
// a scene picker (scenes.js) that locks the camera into a box, up to five people (roster.js, posable.js), their joints, IK handles,
// eyes, faces, hands and held things, the light (lights.js), Shots and the storyboard strip, save and load. The panels: pose-ui.js.
//
// pose-draw (Andrew 2026-11-10): "select parts and then draw with my stylus to move the part into position. Also a sculpting tool.
// Any other ease of use that this might enable." Pointer Events tell the pen, a finger and the mouse apart: the pen draws (or sculpts),
// a finger moves the camera (touches are ignored while the pen is down or near: palm rejection; two fingers tapped undo, three redo),
// the mouse keeps its controls (and draws in the Draw, Sculpt, Sketch, Frame and Light tools). The pen's barrel button: held, it
// orbits; pressed alone, it undoes. Strokes: draw-pose.js; the sculpt: sculpt.js; the library, beats and the contact sheet:
// storyboard.js.
//
// Test hook: window.__pose (state(), api: the same calls the panels make).
import * as THREE from 'three';
import { groundHeight } from '../../terrain.js';
import { setHourOverride, dayPhase } from '../../daytime.js';
import { GAZE } from '../../gaze.js';
import { SUN_DIR } from '../../world.js';
import { LIGHT, NIGHT_SPOTS, LAMPS } from '../../daynight-mats.js';
import { loadCss } from '../../util.js';
import { SCENES, sceneById } from './scenes.js';
import { makeBody, nameOf } from './roster.js';
import { CHAINS, chainJoints, mirrorId, presetById, blankState } from './posable.js';
import { createLights } from './lights.js';
import { createHandles } from './handles.js';
import { mountUI } from './pose-ui.js';
import { createDraw, partOfJoint } from './draw-pose.js';
import { createSculpt, tagSculpt } from './sculpt.js';
import { screenLength } from './strokes.js';
import { libraryList, librarySave, libraryDrop, libraryApply, tweenSnap, bakeShape, ghostMesh, contactSheet } from './storyboard.js';
import { preloadMpfb } from './roster.js';

export const MAX_CAST = 5;
export const SIZES = [{ id: 'hd', label: '1920 x 1080', w: 1920, h: 1080 }, { id: 'tall', label: '1080 x 1920', w: 1080, h: 1920 }, { id: '4k', label: '4K', w: 3840, h: 2160 }, { id: 'square', label: 'Square', w: 2048, h: 2048 }];
const T0 = 1000;              // the body's clock, held still (the idle's breath and glances stay where they are)
const SNAP = Math.PI / 12;    // 15 degrees, with Shift (or the snap button)
const STORE_KEY = 'breneland.poseEditor';
const DEG = 180 / Math.PI;

async function isOwner() {
  let token = '';
  try { const a = JSON.parse(localStorage.getItem('breneland.account') || 'null'); token = a && typeof a.token === 'string' ? a.token : ''; } catch { /* none */ }
  if (!token) return false;
  try {
    const r = await fetch('/api/account/resume', { method: 'POST', headers: { 'content-type': 'application/json', 'x-breneland-token': token }, body: '{}', cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    return !!(j && j.owner === true);
  } catch { return false; }
}

export async function startPose(ctx, extra) {
  const { scene, camera, renderer, player, npcs, features, canvas, audio } = ctx;
  const { ink, daynight, shadows } = extra;
  // nothing makes a sound here (the game's audio is never started)
  audio.start = () => {}; audio.setMuted?.(true);
  document.body.classList.add('pose-mode');
  loadCss('/css/pose-editor.css');
  window.__pose = { ready: false };
  if (!(await isOwner())) { refuse(); return; }
  await preloadMpfb().catch(() => 0); // (the MPFB characters for the roster: the game's own loader and cache)

  // ---------------------------------------------------------------- the empty town
  const mine = new Set();     // my people's Humans (everyone else in the gaze registry is hidden)
  const hideTown = () => {
    for (const d of npcs.npcs) d.body.root.visible = false;
    for (const h of GAZE.people) if (!mine.has(h)) h.root.visible = false;
    for (const f of features) { if (f === feature) continue; if (f.characterRoots) for (const r of f.characterRoots()) r.visible = false; }
    const cars = features.find(f => f.name === 'cars')?.api?.cars;
    if (cars) for (const c of cars) c.model.g.visible = false;
    const P = npcs.street?.props; if (P?.van) P.van.visible = false;
    player.character.root.visible = false;
  };
  player.controls = false;

  // ---------------------------------------------------------------- state
  const S = { scene: null, floor: 0, cam: { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.2, dist: 6, fov: 50 }, cast: [], sel: -1, joint: null, snap: false, size: 'hd', guide: true, myShots: {},
    tool: 'pose', part: 'auto', thirds: false, onion: false, beats: [], beat: 0, sketchWho: 'kevin' }; // (pose-draw: the tool, the part a stroke moves, the beats)
  const lights = createLights({ scene, camera, renderer, world: ctx.world, daynight, shadows, weather: ctx.weather, LIGHT, SUN_DIR, NIGHT_SPOTS, LAMPS, setHour: setHourOverride });
  const handles = createHandles();
  // ---- pose-draw: the ink a stroke leaves, the sculpt, the strokes read as poses, the onion skin
  const inkLayer = createInkLayer();
  const toScreen = v => { const p = v.clone().project(camera), r = canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; };
  const rayAtXY = (x, y) => rayTo({ clientX: x, clientY: y }).clone();
  const view = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  function syncBody(c) { const r = c.body.root; r.position.set(c.x, c.y, c.z); r.rotation.set(0, c.yaw, 0); r.updateWorldMatrix(true, true); c.body.frame(0, { t: T0, eye: eyeOf(c) }); r.updateWorldMatrix(true, true); }
  const sculpt = createSculpt({ camera, rayAt: rayAtXY, view });
  const draw = createDraw({
    camera, S, toScreen, rayAt: rayAtXY, view, sync: syncBody, select: i => select(i), commit: () => commit(),
    pickPersonAt: (x, y) => pickPerson({ clientX: x, clientY: y }), pickWorldAt: (x, y) => pickWorld({ clientX: x, clientY: y }),
    setIK: (c, chain, tW, pW) => { c.body.root.updateWorldMatrix(true, false); const inv = new THREE.Matrix4().copy(c.body.root.matrixWorld).invert(); setIK(c, chain, tW.clone().applyMatrix4(inv).toArray(), pW ? pW.clone().applyMatrix4(inv).toArray() : null); },
    presetIK: (c, chain) => presetIK(c, chain), addPerson: (id, at) => addPerson(id, at), floor: () => S.floor,
    setCam: p => { Object.assign(S.cam, p); clampCam(); }, light: p => lights.set(p),
  });
  let onionDirty = false, onion = null;
  function rebuildOnion() {
    onionDirty = false;
    if (onion) { onion.removeFromParent(); onion.traverse(o => { if (o.isMesh && o.material.colorWrite === false) o.geometry.dispose(); }); onion = null; }
    if (!S.onion || S.beat < 1 || !S.beats[S.beat - 1]) return;
    const prev = S.beats[S.beat - 1].cast || [], g = new THREE.Group(); g.name = 'pose-onions';
    S.cast.forEach((c, i) => {
      const p = prev[i]; if (!p || p.who !== c.id) return;
      const keep = { st: JSON.stringify(c.body.state), x: c.x, y: c.y, z: c.z, yaw: c.yaw };
      Object.assign(c.body.state, blankState(), JSON.parse(JSON.stringify(p.pose || {}))); c.body.state.ik = { ...blankState().ik, ...(p.pose?.ik || {}) };
      c.x = p.x; c.y = p.y; c.z = p.z; c.yaw = p.yaw;
      syncBody(c);
      g.add(ghostMesh(bakeShape(c.body.root)));
      Object.assign(c.body.state, JSON.parse(keep.st)); c.x = keep.x; c.y = keep.y; c.z = keep.z; c.yaw = keep.yaw;
      syncBody(c);
    });
    handles.scene.add(g); onion = g;
  }
  // a little picture of a person for the pose library (the view as it is, the handles off, cut round them)
  function thumbOf(c) {
    try {
      shooting = true; ink.render(scene, camera); shooting = false;
      const el = renderer.domElement, k = el.width / el.clientWidth, cap = c.body.capsule(new Array(7));
      const a = toScreen(new THREE.Vector3(cap[0], cap[1] - 0.15, cap[2])), b = toScreen(new THREE.Vector3(cap[3], cap[4] + 0.1, cap[5])), r = canvas.getBoundingClientRect();
      const h = Math.max(20, Math.abs(a.y - b.y) * 1.08), w = h * 0.75, cx = (a.x + b.x) / 2 - r.left, top = Math.min(a.y, b.y) - r.top - h * 0.03;
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 96;
      const g = cv.getContext('2d'); g.fillStyle = '#e9e2d4'; g.fillRect(0, 0, 72, 96);
      g.drawImage(el, (cx - w / 2) * k, top * k, w * k, h * k, 0, 0, 72, 96);
      return cv.toDataURL('image/jpeg', 0.72);
    } catch { shooting = false; return null; }
  }
  const shots = [];            // the storyboard strip: { url, name, w, h, blob }
  let shooting = false;
  let ui = null;               // the panels (pose-ui.js), mounted once the API is ready

  // the handles over the picture, after the ink pass (never in a Shot)
  const inkRender = ink.render.bind(ink);
  ink.render = (s, c) => {
    inkRender(s, c);
    if (shooting || !handles.visible) return;
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(handles.scene, c); renderer.autoClear = ac;
  };

  // ---------------------------------------------------------------- the camera (orbit, pan, dolly, inside the scene's box)
  const box = () => { const b = S.scene.box, f = S.floor; return { minX: b[0], maxX: b[1], minZ: b[2], maxZ: b[3], minY: f + b[4], maxY: f + b[5] }; };
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  function clampCam() {
    const C = S.cam, B = box();
    C.tx = cl(C.tx, B.minX, B.maxX); C.tz = cl(C.tz, B.minZ, B.maxZ); C.ty = cl(C.ty, B.minY, B.maxY);
    C.pitch = cl(C.pitch, -1.2, 1.45); C.dist = cl(C.dist, 0.3, 80); C.fov = cl(C.fov, 12, 100);
  }
  function placeCamera(cam) {
    const C = S.cam, B = box(), cp = Math.cos(C.pitch);
    cam.position.set(C.tx + Math.sin(C.yaw) * cp * C.dist, C.ty + Math.sin(C.pitch) * C.dist, C.tz + Math.cos(C.yaw) * cp * C.dist);
    cam.position.x = cl(cam.position.x, B.minX, B.maxX); cam.position.y = cl(cam.position.y, B.minY, B.maxY); cam.position.z = cl(cam.position.z, B.minZ, B.maxZ);
    if (cam.fov !== C.fov) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
    cam.lookAt(C.tx, C.ty, C.tz);
  }
  const _tgt = new THREE.Vector3();
  player.takeover = {
    anim: 'idle', clearView: true, pose: true,
    update(dt, now, input, pl) { pl.pos.set(S.cam.tx, S.floor, S.cam.tz); }, // (you, hidden, stand at the camera's middle: the buildings open their insides for it)
    camera(dt, cam) { placeCamera(cam); lights.setTarget(_tgt.set(S.cam.tx, S.cam.ty, S.cam.tz)); return true; },
  };

  // ---------------------------------------------------------------- the feature: every frame, after the town's own
  const feature = {
    name: 'pose-editor',
    update(dt) {
      hideTown();
      if (onionDirty) rebuildOnion();
      for (const c of S.cast) {
        const r = c.body.root;
        r.position.set(c.x, c.y, c.z); r.rotation.set(0, c.yaw, 0);
        c.body.state.held !== c.heldDone && (c.body.setHeld(c.body.state.held), c.heldDone = c.body.state.held);
        c.body.frame(dt, { t: T0, eye: eyeOf(c) });
      }
      sculpt.frame(S.cast);
      const c = S.cast[S.sel];
      handles.setLook(c && c.eye ? eyePoint(c) : null, camera);
      handles.frame(camera, c ? c.body.state.ik : null);
    },
    characterRoots: function* () { for (const c of S.cast) if (c.body.kind !== 'skinned') yield c.body.root; },
  };
  features.push(feature);

  // where a person looks: the camera, another person's head, or a point
  const _ep = new THREE.Vector3();
  function eyeOf(c) {
    const e = c.eye;
    if (!e) return null;
    if (e.mode === 'camera') return camera;
    if (e.mode === 'char') { const o = S.cast[e.who]; if (!o || o === c) return null; return o.body.h ? o.body.h.headC : o.body.root; }
    if (e.mode === 'point') return e.pt || (e.pt = { x: e.p[0], y: e.p[1], z: e.p[2] });
    return null;
  }
  function eyePoint(c) { const t = eyeOf(c); if (!t) return null; return t.isObject3D ? (t === camera ? null : t.getWorldPosition(_ep)) : _ep.set(t.x, t.y, t.z); }

  // ---------------------------------------------------------------- scenes
  // the scene's floor: its own number, the water tower's catwalk (H over the tower's own ground: water-tower.js), or the ground
  function floorOf(sc) { const [x, z] = sc.at; return sc.floor ?? (sc.tower ? groundHeight(x + 7.6, z) + sc.tower : groundHeight(x, z)); }
  function setScene(id, { keepCast = false, view = true, hour = true } = {}) {
    const sc = sceneById(id) || SCENES[0];
    S.scene = sc; S.floor = floorOf(sc);
    // (pose-draw) on a narrow screen the scene opens on its widest shot: the space framed, not a face filling the picture
    if (view) setView((camera.aspect || 1.5) < 1 ? [sc.view, ...sc.shots].reduce((a, b) => (b.dist > a.dist ? b : a)) : sc.view);
    if (hour && sc.hour !== undefined) lights.set({ hour: sc.hour === 'sunset' ? dayPhase(Date.now()).sunset - 0.25 : sc.hour });
    if (!keepCast) clearCast();
    renderer.shadowMap.needsUpdate = true;
    ui?.refresh();
  }
  function setView(v) {
    const C = S.cam, sc = S.scene;
    if (v.at) { C.tx = v.at[0]; C.ty = S.floor + v.at[1]; C.tz = v.at[2]; } else { C.tx = sc.at[0]; C.ty = S.floor + sc.up; C.tz = sc.at[1]; }
    C.yaw = v.yaw; C.pitch = v.pitch; C.dist = v.dist; C.fov = v.fov ?? C.fov;
    // (pose-draw, Andrew's phone upright: the scene's own views were made for a wide frame; on a narrow one the lens widens to see as
    // much across as a 3:2 frame would, up to 80 degrees, and the camera stands back a little)
    const asp = camera.aspect || 1.5;
    if (asp < 1.3 && (v === sc.view || sc.shots.includes(v))) { const t = Math.tan(C.fov * Math.PI / 360) * 1.5 / asp; C.fov = Math.min(80, Math.atan(t) * 360 / Math.PI); C.dist *= 1.25; }
    clampCam();
  }

  // ---------------------------------------------------------------- the cast
  function clearCast() { for (const c of S.cast) dropBody(c); S.cast = []; S.sel = -1; S.joint = null; handles.setChar(null); handles.setJoint(null); }
  function dropBody(c) { if (c.body.h) mine.delete(c.body.h); c.body.dispose(); }
  function addPerson(id, at = null, state = null) {
    if (S.cast.length >= MAX_CAST) return null;
    const body = makeBody(id);
    if (!body) return null;
    tagSculpt(body); // (pose-draw: the meshes a sculpt may touch, keyed as built)
    body.root.userData.poseCast = true;
    scene.add(body.root);
    if (body.h) mine.add(body.h);
    const sp = at || S.scene.spots[S.cast.length % S.scene.spots.length];
    const c = { id, body, x: sp[0], z: sp[1], yaw: sp[2] ?? 0, y: 0, eye: null, heldDone: undefined };
    c.y = at && at[3] !== undefined ? at[3] : snapY(c.x, c.z, S.floor + 0.6);
    if (state) Object.assign(body.state, state);
    S.cast.push(c);
    select(S.cast.length - 1);
    return c;
  }
  function removePerson(i) {
    const c = S.cast[i]; if (!c) return;
    dropBody(c); S.cast.splice(i, 1);
    for (const o of S.cast) if (o.eye?.mode === 'char') { if (o.eye.who === i) o.eye = null; else if (o.eye.who > i) o.eye.who--; }
    select(Math.min(S.sel, S.cast.length - 1));
  }
  function select(i, joint = null) {
    S.sel = i >= 0 && i < S.cast.length ? i : -1;
    S.joint = S.sel >= 0 ? joint : null;
    const c = S.cast[S.sel];
    handles.setChar(c ? c.body : null); handles.setJoint(S.joint);
    ui?.refresh();
  }

  // the floor under a point: the ground (terrain.js knows the shops' and houses' floors), or what a ray straight down meets from
  // just over `fromY` (a step, a seat, the catwalk, the pier)
  const down = new THREE.Raycaster();
  const DOWN = new THREE.Vector3(0, -1, 0), _o = new THREE.Vector3();
  // what a ray may meet: the meshes the camera draws (layers 0 and 2, toon.js) round the scene, never a person in the cast, the sky,
  // a sprite or a skinned mesh (the merged people); listed again every few seconds (the shops show their insides as you come near)
  const MAIN = (1 << 0) | (1 << 2), _sph = new THREE.Sphere();
  let cand = null, candAt = 0, candFor = null;
  const inCast = o => { for (let p = o; p; p = p.parent) if (p.userData.poseCast) return true; return false; };
  function worldMeshes() {
    const now = performance.now();
    if (cand && candFor === S.scene.id && now - candAt < 4000) return cand;
    const B = box(), cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2, R = Math.hypot(B.maxX - B.minX, B.maxZ - B.minZ) / 2 + 25;
    cand = []; candAt = now; candFor = S.scene.id;
    scene.traverseVisible(o => {
      if (!o.isMesh || o.isSkinnedMesh || o.isSprite || !o.geometry || o === ctx.world.sky || (o.layers.mask & MAIN) === 0) return;
      if (o.material && (o.material.transparent || o.material.visible === false)) return;
      let s = null;
      if (o.isInstancedMesh || o.isBatchedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); s = o.boundingSphere; } else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); s = o.geometry.boundingSphere; }
      if (!s) return;
      _sph.copy(s).applyMatrix4(o.matrixWorld);
      if (Math.hypot(_sph.center.x - cx, _sph.center.z - cz) - _sph.radius > R || inCast(o)) return;
      cand.push(o);
    });
    return cand;
  }
  function castRay(rc) {
    rc.camera = camera; rc.layers.mask = MAIN;
    const out = [];
    for (const o of worldMeshes()) { try { o.raycast(rc, out); } catch { /* a mesh three cannot ray: skip it */ } }
    out.sort((a, b) => a.distance - b.distance);
    return out.filter(h => visibleUp(h.object));
  }
  function rayDown(x, z, fromY, reach = 3) {
    down.set(_o.set(x, fromY, z), DOWN); down.far = reach;
    const hits = castRay(down);
    return hits.length ? hits[0].point.y : null;
  }
  function snapY(x, z, fromY) {
    const g = groundHeight(x, z), r = rayDown(x, z, fromY + 0.9, 2.4);
    return r === null ? g : r;
  }
  const visibleUp = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

  // ---------------------------------------------------------------- posing
  const cur = () => S.cast[S.sel] || null;
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _ax = new THREE.Vector3();
  function rotOf(c, id) { return c.body.state.rot[id] || [0, 0, 0]; }
  function setRot(c, id, r) { if (!r || (Math.abs(r[0]) < 1e-6 && Math.abs(r[1]) < 1e-6 && Math.abs(r[2]) < 1e-6)) delete c.body.state.rot[id]; else c.body.state.rot[id] = r.map(v => +v.toFixed(5)); }
  // a joint turned by `delta` about its own axis (after its offset so far)
  function turnJoint(c, id, axis, delta, from = null) {
    const r = from || rotOf(c, id);
    _q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ'));
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(_ax.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), delta));
    _e.setFromQuaternion(_q, 'YXZ');
    setRot(c, id, [_e.x, _e.y, _e.z]);
  }
  const chainOfJoint = id => CHAINS.find(k => chainJoints(k).slice(0, 2).includes(id)) || null;
  function ikHeld(c, id) { const k = chainOfJoint(id); return k && (c.body.state.ik[k] || presetById(c.body.state.preset).ik) ? k : null; }
  function setIK(c, chain, t, p = null) {
    const st = c.body.state, was = st.ik[chain] || presetIK(c, chain) || c.body.restIK(chain);
    st.ik[chain] = { t: t.map(v => +v.toFixed(4)), p: (p || was.p).map(v => +v.toFixed(4)) };
  }
  const presetIK = (c, chain) => { const P = presetById(c.body.state.preset); return P.ik && c.body.shoulders ? P.ik(c.body.dims, c.body.shoulders())[chain] : null; };
  function freeChain(c, chain) { c.body.state.ik[chain] = null; if (chain.startsWith('foot')) c.body.state.pin[chain] = false; }
  // mirror: the person's left and right swapped, as in a mirror (x flipped in the root's frame)
  function mirror(c) {
    const st = c.body.state, rot = {};
    for (const [id, r] of Object.entries(st.rot)) rot[mirrorId(id)] = [r[0], -r[1], -r[2]];
    st.rot = rot;
    const ik = {}, flip = v => v && { t: [-v.t[0], v.t[1], v.t[2]], p: [-v.p[0], v.p[1], v.p[2]] };
    for (const k of CHAINS) ik[k] = flip(st.ik[mirrorId(k)]);
    st.ik = ik;
    st.pin = { footL: st.pin.footR, footR: st.pin.footL };
    st.hands = { L: st.hands.R, R: st.hands.L };
  }
  function resetJoint(c, id) { if (!id) return; delete c.body.state.rot[id]; const k = CHAINS.find(ch => chainJoints(ch).includes(id)); if (k && chainJoints(k)[2] !== id) freeChain(c, k); }
  function resetPose(c) { const keep = { held: c.body.state.held, headW: c.body.state.headW }; Object.assign(c.body.state, blankState(), keep); }

  // ---------------------------------------------------------------- undo / redo (whole setups) and the browser's copy
  const undo = [], redo = [];
  let lastSnap = null;
  function commit() {
    const j = JSON.stringify(toJSON());
    if (j === lastSnap) return;
    if (lastSnap) { undo.push(lastSnap); if (undo.length > 80) undo.shift(); }
    redo.length = 0; lastSnap = j;
    try { localStorage.setItem(STORE_KEY, j); } catch { /* full */ }
    ui?.refresh();
  }
  function undoStep(dir) {
    const from = dir < 0 ? undo : redo, to = dir < 0 ? redo : undo;
    if (!from.length) return false;
    to.push(lastSnap); lastSnap = from.pop();
    fromJSON(JSON.parse(lastSnap), false);
    try { localStorage.setItem(STORE_KEY, lastSnap); } catch { /* full */ }
    return true;
  }

  // ---------------------------------------------------------------- save and load
  function toJSON() {
    return {
      v: 1, kind: 'breneland-pose', scene: S.scene.id,
      camera: { ...S.cam }, size: S.size,
      lights: lights.toJSON(),
      cast: S.cast.map(c => { const o = { who: c.id, x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +c.z.toFixed(3), yaw: +c.yaw.toFixed(4), eye: c.eye ? { mode: c.eye.mode, who: c.eye.who, p: c.eye.p } : null, pose: JSON.parse(JSON.stringify(c.body.state)) }; const sc = sculpt.toJSON(c); if (sc) o.sculpt = sc; return o; }),
      shots: S.myShots,
      ...(S.beats.length ? { beats: S.beats, beat: S.beat } : {}),
    };
  }
  // one beat: the scene without the strip of beats
  function core() { const j = toJSON(); delete j.beats; delete j.beat; return j; }
  function fromJSON(j, push = true, { beats = true } = {}) {
    if (!j || j.kind !== 'breneland-pose') return false;
    const list = (j.cast || []).slice(0, MAX_CAST);
    // the same scene and the same people in the same order (an undo, a beat): posed in place, nobody rebuilt
    const same = S.scene && j.scene === S.scene.id && list.length === S.cast.length && list.every((p, i) => p.who === S.cast[i].id);
    if (!same) setScene(j.scene, { view: false, hour: false });
    if (j.camera) Object.assign(S.cam, j.camera);
    clampCam();
    if (j.lights) lights.load(j.lights);
    if (j.size) S.size = j.size;
    S.myShots = j.shots && typeof j.shots === 'object' ? j.shots : {};
    list.forEach((p, i) => {
      const c = same ? S.cast[i] : addPerson(p.who, [p.x, p.z, p.yaw, p.y], null);
      if (!c) return;
      if (same) { c.x = p.x; c.y = p.y; c.z = p.z; c.yaw = p.yaw; }
      Object.assign(c.body.state, blankState(), JSON.parse(JSON.stringify(p.pose || {})));
      c.body.state.ik = { ...blankState().ik, ...(p.pose?.ik || {}) };
      c.eye = p.eye ? { mode: p.eye.mode, who: p.eye.who, p: p.eye.p } : null;
      sculpt.load(c, p.sculpt || null);
    });
    if (beats) { S.beats = Array.isArray(j.beats) ? j.beats : []; S.beat = Math.max(0, Math.min(S.beats.length - 1, j.beat | 0)); }
    if (same) select(S.sel >= 0 && S.sel < S.cast.length ? S.sel : (S.cast.length ? 0 : -1), S.joint); else select(S.cast.length ? 0 : -1);
    onionDirty = true;
    if (push) commit(); else ui?.refresh();
    return true;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  const hourTag = () => { const h = lights.state.hour, hh = Math.floor(h), mm = Math.round((h - hh) * 60); return String(hh).padStart(2, '0') + String(mm % 60).padStart(2, '0'); };
  function saveFile() { const j = toJSON(); download(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }), `pose-${S.scene.id}-${stamp()}.json`); return j; }

  // ---------------------------------------------------------------- the Shot
  async function shot(sizeId = S.size, { save = true } = {}) {
    const sz = SIZES.find(s => s.id === sizeId) || SIZES[0];
    const r = renderer, pr = r.getPixelRatio(), cw = r.domElement.clientWidth, ch = r.domElement.clientHeight, asp = camera.aspect;
    let out = null;
    shooting = true;
    try {
      r.setPixelRatio(1); r.setSize(sz.w, sz.h, false); ink.setSize(sz.w, sz.h);
      camera.aspect = sz.w / sz.h; camera.updateProjectionMatrix();
      placeCamera(camera);
      shadows.place(camera); renderer.shadowMap.needsUpdate = true;
      ink.render(scene, camera);
      const cv = document.createElement('canvas'); cv.width = sz.w; cv.height = sz.h;
      cv.getContext('2d').drawImage(r.domElement, 0, 0, sz.w, sz.h);
      out = cv;
    } finally {
      r.setPixelRatio(pr); r.setSize(cw, ch, false); ink.setSize(cw, ch);
      camera.aspect = asp; camera.updateProjectionMatrix();
      shooting = false;
    }
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    const name = `breneland-${S.scene.id}-${hourTag()}-${stamp()}.png`;
    const item = { blob, name, w: sz.w, h: sz.h, url: URL.createObjectURL(blob), scene: S.scene.name, note: S.beats.length ? `Beat ${S.beat + 1}` : '' };
    shots.unshift(item); if (shots.length > 48) URL.revokeObjectURL(shots.pop().url);
    if (save) download(blob, name);
    ui?.refresh();
    return item;
  }

  // ---------------------------------------------------------------- pointer: pick, drag, orbit, pan, dolly
  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(), hit = new THREE.Vector3();
  const setNdc = e => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  let drag = null, lookPick = false;
  const pointers = new Map();
  function rayTo(e) { setNdc(e); ray.setFromCamera(ndc, camera); return ray.ray; }
  function onPlane(e, n, p) { plane.setFromNormalAndCoplanarPoint(n, p); return rayTo(e).intersectPlane(plane, hit) ? hit.clone() : null; }
  // the person whose feet-to-head line passes nearest the ray (within their radius)
  const cap = new Array(7), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _pr = new THREE.Vector3(), _ps = new THREE.Vector3();
  function pickPerson(e) {
    rayTo(e);
    let best = -1, bd = Infinity;
    S.cast.forEach((c, i) => {
      c.body.capsule(cap); _a.set(cap[0], cap[1], cap[2]); _b.set(cap[3], cap[4], cap[5]);
      const d2 = ray.ray.distanceSqToSegment(_a, _b, _pr, _ps);
      if (d2 < cap[6] * cap[6]) { const dd = _pr.distanceTo(ray.ray.origin); if (dd < bd) { bd = dd; best = i; } }
    });
    return best;
  }
  function pickWorld(e) {
    rayTo(e);
    ray.far = 400;
    const hits = castRay(ray);
    return hits.length ? hits[0].point.clone() : null;
  }
  // ---------------------------------------------------------------- the pen, a finger, the mouse (pose-draw)
  const pen = { down: false, seen: -1e9 };
  const penNear = () => pen.down || performance.now() - pen.seen < 350;
  const touches = new Map();
  let gesture = null;     // fingers down together: { n, t0, moved }
  let stroke = null;      // the line being drawn: { pts, pen, pid }
  const sketchStrokes = []; let sketchT = 0;
  const drawTools = new Set(['draw', 'sculpt', 'sketch', 'frame', 'light']);
  function onDownPen(e) {
    if (e.pointerType === 'pen') { pen.down = true; pen.seen = performance.now(); }
    if (e.pointerType === 'touch') {
      if (penNear()) { e.preventDefault(); return true; } // (a palm while the pen is down or near: nothing)
      touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY });
      if (!gesture) gesture = { n: 0, t0: performance.now(), moved: false };
      gesture.n = Math.max(gesture.n, touches.size);
      if (S.tool === 'sculpt' && touches.size === 2) { // two fingers: the brush's size
        const [p1, p2] = [...touches.values()].map((t, i) => (i ? { x: e.clientX, y: e.clientY } : t));
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        drag = { kind: 'brushsize', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, px0: sculpt.brush.px, pid: -1 };
        return true;
      }
      return false;
    }
    if (e.pointerType === 'pen' && (e.buttons & 2)) { start({ kind: 'orbit', barrel: true }, e); return true; } // the barrel button: hold to orbit, alone to undo
    const draws = !lookPick && (e.pointerType === 'pen' ? e.button === 0 || e.button === -1 || e.buttons & 1 : e.pointerType === 'mouse' && e.button === 0 && drawTools.has(S.tool));
    if (!draws) return false;
    const c = cur();
    if (S.tool === 'sculpt') {
      if (c && sculpt.begin(c, e.clientX, e.clientY, pressureOf(e))) { start({ kind: 'sculpt' }, e); ui?.drawing(true); return true; }
      start({ kind: e.pointerType === 'pen' ? 'pentap' : 'orbit', click: true }, e); return true;
    }
    // the handles under a pen: in Pose, the cubes, cones, rings and the ground ring are grabbed as with a mouse; in Draw only the rings
    // and the ground ring (a stroke may start on a hand's cube: a flick). A joint's dot starts a stroke; a tap on it picks the joint.
    let tapJoint = null;
    if (c && (S.tool === 'pose' || S.tool === 'draw')) {
      setNdc(e); const h = handles.pick(ndc, camera);
      if (h && h.kind === 'joint') tapJoint = h.id;
      else if (h && (S.tool === 'pose' || h.kind === 'ring' || h.kind === 'move' || h.kind === 'turn')) { grab(h, c, e); return true; }
    }
    stroke = { pts: [ptOf(e)], pen: e.pointerType === 'pen', pid: e.pointerId, tapJoint };
    start({ kind: 'stroke' }, e);
    inkLayer.begin(S.tool === 'sketch'); inkLayer.to(stroke.pts[0]);
    ui?.drawing(true);
    return true;
  }
  const pressureOf = e => (e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 1);
  const ptOf = e => ({ x: e.clientX, y: e.clientY, p: pressureOf(e), t: performance.now() });
  function endStroke(e) {
    const st = stroke; stroke = null; ui?.drawing(false);
    if (!st) return;
    const pts = st.pts, len = screenLength(pts);
    lastStroke = null;
    if (S.tool === 'sketch') {
      if (len < 4) { inkLayer.fade(); return; }
      sketchStrokes.push(pts); clearTimeout(sketchT);
      sketchT = setTimeout(runSketch, 1300);
      return;
    }
    inkLayer.fade();
    if (len < 6) { // a tap: a joint's dot picks the joint, else a person (or nobody), as a click does
      if (st.tapJoint) { S.joint = st.tapJoint; handles.setJoint(st.tapJoint); if (S.tool === 'draw') S.part = partOfJoint(st.tapJoint) || 'auto'; ui?.refresh(); return; }
      const i = pickPerson(e); if (i !== S.sel) select(i); return;
    }
    let res = null;
    if (S.tool === 'frame') res = draw.frame(pts);
    else if (S.tool === 'light') res = draw.aimLight(pts);
    else res = draw.stroke(pts, { pen: st.pen });
    lastStroke = res;
    if (!res) ui?.toast(S.tool === 'frame' ? 'Draw a bigger box round what the shot should hold.' : S.tool === 'light' ? 'Draw from where the light comes to what it lights.' : 'Start the line on someone\'s body (or pick a part in the Draw tab).');
    ui?.refresh();
  }
  let lastStroke = null;
  function runSketch() {
    const list = sketchStrokes.splice(0);
    inkLayer.fade();
    if (!list.length) return;
    const res = draw.sketch(list, S.sketchWho);
    lastStroke = res;
    if (!res.ok) ui?.toast(res.why); else ui?.toast(nameOf(S.sketchWho) + ' takes the pose.');
    ui?.refresh();
  }
  function onDown(e) {
    if (onDownPen(e)) return;
    if (e.button === 2 || e.button === 1) { start({ kind: 'pan' }, e); return; }
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [p1, p2] = [...pointers.values()]; drag = { kind: 'pinch', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), dist0: S.cam.dist }; return; }
    if (lookPick) { pickLook(e); return; }
    const c = cur();
    if (c && !(e.pointerType === 'touch' && drawTools.has(S.tool))) { // (in the drawing tools a finger only moves the camera)
      setNdc(e);
      const h = handles.pick(ndc, camera);
      if (h) { grab(h, c, e); return; }
    }
    start({ kind: e.shiftKey ? 'pan' : 'orbit', click: true }, e);
  }
  function start(d, e) {
    drag = { ...d, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, cam0: { ...S.cam }, moved: false, pid: e.pointerId };
    canvas.setPointerCapture?.(e.pointerId);
  }
  function grab(h, c, e) {
    if (h.kind === 'joint') { S.joint = h.id; handles.setJoint(h.id); if (S.tool === 'draw') S.part = partOfJoint(h.id) || 'auto'; ui?.refresh(); start({ kind: 'none' }, e); return; }
    if (h.kind === 'ring') {
      if (S.joint && ikHeld(c, S.joint) && chainJoints(ikHeld(c, S.joint)).slice(0, 2).includes(S.joint)) { ui?.toast('This one follows its hand or foot handle. Free it to turn it.'); start({ kind: 'none' }, e); return; }
      const o = c.body.jointObject(S.joint), g = handles.gizmo;
      const axisW = new THREE.Vector3(h.axis === 'x' ? 1 : 0, h.axis === 'y' ? 1 : 0, h.axis === 'z' ? 1 : 0).applyQuaternion(g.quaternion).normalize();
      const centre = g.position.clone(), p0 = onPlane(e, axisW, centre);
      handles.hot(h.axis);
      start({ kind: 'ring', c, id: S.joint, axis: h.axis, axisW, centre, from: rotOf(c, S.joint).slice(), a0: p0 ? angleOn(p0, centre, axisW) : null, acc: 0 }, e);
      void o; return;
    }
    if (h.kind === 'ik') {
      const st = c.body.state, k = h.id, now = st.ik[k] || presetIK(c, k) || c.body.restIK(k);
      st.ik[k] = { t: now.t.slice(), p: now.p.slice() };
      const w = new THREE.Vector3(...now.t).applyMatrix4(c.body.root.matrixWorld);
      start({ kind: 'ik', c, chain: k, n: camera.getWorldDirection(new THREE.Vector3()).negate(), p: w }, e); return;
    }
    if (h.kind === 'pole') {
      const st = c.body.state.ik[h.id]; if (!st) return;
      const w = new THREE.Vector3(...st.p).applyMatrix4(c.body.root.matrixWorld);
      start({ kind: 'pole', c, chain: h.id, n: camera.getWorldDirection(new THREE.Vector3()).negate(), p: w }, e); return;
    }
    if (h.kind === 'move') { start({ kind: 'move', c, dy: 0 }, e); return; }
    if (h.kind === 'turn') { start({ kind: 'turn', c, yaw0: c.yaw }, e); return; }
  }
  function angleOn(p, centre, axis) {
    const u = new THREE.Vector3(1, 0, 0); if (Math.abs(axis.x) > 0.9) u.set(0, 1, 0);
    u.addScaledVector(axis, -u.dot(axis)).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u), d = p.clone().sub(centre);
    return Math.atan2(d.dot(v), d.dot(u));
  }
  const wrap = a => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
  function onMove(e) {
    if (e.pointerType === 'pen') pen.seen = performance.now();
    if (e.pointerType === 'touch') {
      if (!touches.has(e.pointerId)) return; // (a palm)
      const t = touches.get(e.pointerId); if (gesture && Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 10) gesture.moved = true;
    }
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (S.tool === 'sculpt' && !drag && e.pointerType !== 'touch') inkLayer.cursor(e.clientX, e.clientY, sculpt.brush.px);
    if (!drag) return;
    if (drag.kind === 'brushsize') {
      if (touches.size < 2 || !touches.has(e.pointerId)) return;
      const [p1, p2] = [...pointers.values()]; if (!p1 || !p2) return;
      sculpt.brush.px = Math.round(Math.min(320, Math.max(10, drag.px0 * Math.hypot(p1.x - p2.x, p1.y - p2.y) / drag.d0)));
      inkLayer.cursor((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, sculpt.brush.px); return;
    }
    if (drag.kind === 'stroke' || drag.kind === 'sculpt') {
      if (e.pointerId !== drag.pid) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of (evs.length ? evs : [e])) {
        if (drag.kind === 'stroke' && stroke) { const p = ptOf(ev); stroke.pts.push(p); inkLayer.to(p); }
        else if (drag.kind === 'sculpt') sculpt.move(ev.clientX, ev.clientY, pressureOf(ev));
      }
      if (drag.kind === 'sculpt') inkLayer.cursor(e.clientX, e.clientY, sculpt.brush.px);
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) drag.moved = true;
      return;
    }
    if (drag.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [p1, p2] = [...pointers.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      S.cam.dist = drag.dist0 * drag.d0 / Math.max(10, d); clampCam(); return;
    }
    if (drag.pid !== undefined && e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) drag.moved = true;
    const snap = e.shiftKey || S.snap;
    const C = S.cam;
    switch (drag.kind) {
      case 'orbit': C.yaw -= dx * 0.006; C.pitch += dy * 0.005; clampCam(); break;
      case 'pan': {
        const k = C.dist * 0.0016 * (C.fov / 50);
        const f = camera.getWorldDirection(new THREE.Vector3()), r = new THREE.Vector3().crossVectors(f, camera.up).normalize(), u = new THREE.Vector3().crossVectors(r, f);
        C.tx -= (r.x * dx - u.x * dy) * k; C.ty -= (r.y * dx - u.y * dy) * k; C.tz -= (r.z * dx - u.z * dy) * k; clampCam(); break;
      }
      case 'ring': { // the turn so far: round the ring where it faces you, else by how far the pointer went (a ring seen edge on)
        const p = onPlane(e, drag.axisW, drag.centre), facing = p && Math.abs(ray.ray.direction.dot(drag.axisW)) > 0.12;
        if (facing) { const a = angleOn(p, drag.centre, drag.axisW); if (drag.a0 !== null) drag.acc += wrap(a - drag.a0); drag.a0 = a; }
        else { drag.acc += (dx - dy) * 0.01; drag.a0 = null; }
        const delta = snap ? Math.round(drag.acc / SNAP) * SNAP : drag.acc;
        turnJoint(drag.c, drag.id, drag.axis, delta, drag.from); break;
      }
      case 'ik': case 'pole': {
        const p = onPlane(e, drag.n, drag.p); if (!p) break;
        const inv = new THREE.Matrix4().copy(drag.c.body.root.matrixWorld).invert(), l = p.clone().applyMatrix4(inv);
        const st = drag.c.body.state;
        if (drag.kind === 'ik') { if (drag.chain.startsWith('foot') && st.pin[drag.chain]) l.y = drag.c.body.dims ? drag.c.body.dims.a0 : 0.08; setIK(drag.c, drag.chain, l.toArray()); }
        else st.ik[drag.chain].p = l.toArray().map(v => +v.toFixed(4));
        break;
      }
      case 'move': {
        const p = onPlane(e, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, drag.c.y, 0)); if (!p) break;
        if (!drag.off) drag.off = [drag.c.x - p.x, drag.c.z - p.z];
        const B = box(), x = cl(p.x + drag.off[0], B.minX - 4, B.maxX + 4), z = cl(p.z + drag.off[1], B.minZ - 4, B.maxZ + 4);
        drag.c.x = x; drag.c.z = z;
        const g = groundHeight(x, z); if (Math.abs(g - drag.c.y) < 0.6) drag.c.y = g;
        break;
      }
      case 'turn': {
        const p = onPlane(e, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, drag.c.y, 0)); if (!p) break;
        let yaw = Math.atan2(p.x - drag.c.x, p.z - drag.c.z);
        if (snap) yaw = Math.round(yaw / SNAP) * SNAP;
        drag.c.yaw = yaw; break;
      }
    }
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    if (e.pointerType === 'pen') { pen.down = false; pen.seen = performance.now(); }
    let fingersTapped = 0;
    if (e.pointerType === 'touch') {
      if (!touches.has(e.pointerId)) return;
      touches.delete(e.pointerId);
      if (!touches.size && gesture) { const g = gesture; gesture = null; if (!g.moved && g.n >= 2 && performance.now() - g.t0 < 400) fingersTapped = g.n; }
      if (fingersTapped) { drag = null; api.undo(fingersTapped === 2 ? -1 : 1); ui?.toast(fingersTapped === 2 ? 'Undone' : 'Redone', 900); return; }
      if (drag && drag.kind === 'brushsize') { if (!touches.size) drag = null; return; }
    }
    if (!drag) return;
    if (drag.pid !== undefined && drag.pid !== -1 && e.pointerId !== drag.pid && drag.kind !== 'pinch') return;
    const d = drag; drag = null;
    canvas.releasePointerCapture?.(e.pointerId);
    handles.hot(null);
    if (d.kind === 'stroke') { endStroke(e); return; }
    if (d.kind === 'sculpt') { sculpt.end(); ui?.drawing(false); inkLayer.clear(); commit(); return; }
    if (d.kind === 'pentap') { if (!d.moved) { const i = pickPerson(e); if (i !== S.sel) select(i); } return; }
    if (d.barrel) { if (!d.moved) { api.undo(-1); ui?.toast('Undone', 900); } return; }
    if (d.kind === 'orbit' && !d.moved && gesture) return; // (fingers down together: not a click)
    if (d.kind === 'orbit' && !d.moved) { // a click: pick a person (or nobody)
      const i = pickPerson(e);
      if (i !== S.sel) select(i);
      return;
    }
    if (d.kind === 'move') { const c = d.c, y = snapY(c.x, c.z, c.y + 0.3); if (y !== null) { const sitting = presetById(c.body.state.preset).anim === 'sit', g = groundHeight(c.x, c.z); if (sitting && y - g > 0.22 && y - g < 0.8) { c.body.state.seat = +(y - g).toFixed(3); c.y = g; } else c.y = y; } }
    if (d.kind !== 'orbit' && d.kind !== 'pan' && d.kind !== 'none') commit();
    ui?.refresh();
  }
  function onWheel(e) {
    e.preventDefault();
    const k = Math.pow(1.0015, e.deltaY);
    if (e.ctrlKey || e.altKey) S.cam.fov *= k; else S.cam.dist *= k;
    clampCam(); ui?.refreshCam();
  }
  function pickLook(e) {
    lookPick = false; canvas.classList.remove('pose-picking');
    const c = cur(); if (!c) return;
    const i = pickPerson(e);
    if (i >= 0 && S.cast[i] !== c) c.eye = { mode: 'char', who: i };
    else { const p = pickWorld(e); if (p) c.eye = { mode: 'point', p: p.toArray().map(v => +v.toFixed(3)) }; }
    commit();
  }
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', e => { if (stroke && e.pointerId === stroke.pid) { stroke = null; inkLayer.fade(); ui?.drawing(false); } onUp(e); });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'pen') pen.seen = performance.now() - 250; if (S.tool === 'sculpt' && !drag) inkLayer.clear(); });
  canvas.style.touchAction = 'none';
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------------------------------------------------------------- keys
  addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const c = cur(), k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); api.undo(e.shiftKey ? 1 : -1); return; }
    if (mod && k === 'y') { e.preventDefault(); api.undo(1); return; }
    if (mod || e.altKey) return;
    if (k === 'escape') { if (lookPick) { lookPick = false; canvas.classList.remove('pose-picking'); } else if (S.tool !== 'pose') api.tool('pose'); else if (S.joint) { S.joint = null; handles.setJoint(null); ui?.refresh(); } else select(-1); return; }
    if (k === 'm' && c) { api.mirror(); return; }
    if (k === 'r' && c && S.joint) { api.resetJoint(); return; }
    if ((k === 'delete' || k === 'backspace') && c) { api.remove(S.sel); return; }
    if (k === 'p') { api.shot(); return; }
    if (k === 'l' && c) { api.lookPick(); return; }
    if (k === 'tab') { e.preventDefault(); if (S.cast.length) select((S.sel + (e.shiftKey ? S.cast.length - 1 : 1)) % S.cast.length); return; }
    if (/^[1-5]$/.test(k)) { select(+k - 1); return; }
    if (k === '?') { ui?.help(true); return; }
    if (k === 'd') { api.tool(S.tool === 'draw' ? 'pose' : 'draw'); return; }
    if (k === 's') { api.tool(S.tool === 'sculpt' ? 'pose' : 'sculpt'); return; }
    if (k === 'k') { api.tool(S.tool === 'sketch' ? 'pose' : 'sketch'); return; }
    if (k === 'f') { api.tool(S.tool === 'frame' ? 'pose' : 'frame'); return; }
    if (k === 'g') { api.thirds(!S.thirds); return; }
    if (k === 'o') { api.onion(!S.onion); return; }
    if (k === 'n') { api.nextBeat(); return; }
    if (k === '[' || k === ']') { sculpt.brush.px = Math.max(10, Math.min(320, Math.round(sculpt.brush.px * (k === ']' ? 1.2 : 1 / 1.2)))); ui?.refresh(); return; }
  });

  // ---------------------------------------------------------------- the API (the panels and the tests)
  const api = {
    S, SCENES, SIZES, MAX_CAST, lights, handles, shots,
    get cur() { return cur(); },
    scene(id) { setScene(id); commit(); },
    view(v) { setView(v); commit(); },
    saveView(name) { const l = S.myShots[S.scene.id] = S.myShots[S.scene.id] || []; l.push({ name: name || 'Shot ' + (l.length + 1), yaw: +S.cam.yaw.toFixed(4), pitch: +S.cam.pitch.toFixed(4), dist: +S.cam.dist.toFixed(3), fov: +S.cam.fov.toFixed(2), at: [+S.cam.tx.toFixed(3), +(S.cam.ty - S.floor).toFixed(3), +S.cam.tz.toFixed(3)] }); commit(); },
    dropView(i) { const l = S.myShots[S.scene.id]; if (l) { l.splice(i, 1); commit(); } },
    cam(patch) { Object.assign(S.cam, patch); clampCam(); },
    camDone() { commit(); },
    add(id) { const c = addPerson(id); if (c) commit(); else if (S.cast.length >= MAX_CAST) ui?.toast(`Five people at most in a scene.`); return c; },
    remove(i) { removePerson(i); commit(); },
    select(i) { select(i); },
    joint(id) { S.joint = id; handles.setJoint(id); ui?.refresh(); },
    setJointDeg(id, axis, deg) { const c = cur(); if (!c) return; const r = rotOf(c, id).slice(); r[{ x: 0, y: 1, z: 2 }[axis]] = deg / DEG; setRot(c, id, r); },
    turnJoint(id, axis, rad) { const c = cur(); if (c) turnJoint(c, id, axis, rad); },
    resetJoint() { const c = cur(); if (c && S.joint) { resetJoint(c, S.joint); commit(); } },
    resetPose() { const c = cur(); if (c) { resetPose(c); commit(); } },
    mirror() { const c = cur(); if (c && c.body.kind !== 'dog') { mirror(c); commit(); } },
    preset(id) { const c = cur(); if (!c) return; const st = c.body.state; st.preset = id; st.moment = null; commit(); },
    state(patch) { const c = cur(); if (!c) return; Object.assign(c.body.state, patch); },
    place(patch) { const c = cur(); if (!c) return; Object.assign(c, patch); },
    ik(chain, tWorld, pWorld = null) { // (tests and the panel) a hand or foot to a world point
      const c = cur(); if (!c) return null;
      c.body.root.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(c.body.root.matrixWorld).invert();
      const t = new THREE.Vector3(...tWorld).applyMatrix4(inv).toArray(), p = pWorld ? new THREE.Vector3(...pWorld).applyMatrix4(inv).toArray() : null;
      setIK(c, chain, t, p); return c.body.state.ik[chain];
    },
    free(chain) { const c = cur(); if (c) { freeChain(c, chain); commit(); } },
    pin(chain, on) {
      const c = cur(); if (!c) return;
      const st = c.body.state; st.pin[chain] = !!on;
      if (on) { const now = st.ik[chain] || c.body.restIK(chain); st.ik[chain] = { t: [now.t[0], c.body.dims ? c.body.dims.a0 : 0.08, now.t[2]], p: now.p }; }
      commit();
    },
    eye(e) { const c = cur(); if (!c) return; c.eye = e; commit(); },
    lookPick() { if (!cur()) return; lookPick = true; canvas.classList.add('pose-picking'); ui?.toast('Click what they should look at: a thing, a place or another person.'); },
    light(patch) { lights.set(patch); },
    lightDone() { commit(); },
    snap(on) { S.snap = !!on; ui?.refresh(); },
    size(id) { S.size = id; ui?.refresh(); },
    shot: (id, o) => shot(id, o),
    saveFile, fromJSON: j => fromJSON(j, true), toJSON,
    commit, undo: dir => { const ok = undoStep(dir); ui?.refresh(); return ok; },
    get canUndo() { return undo.length > 0; }, get canRedo() { return redo.length > 0; },
    nameOf, presetById, groundHeight, floor: () => S.floor, box,
    // ---- pose-draw
    tool(t) { S.tool = t; if (t !== 'sketch') sketchStrokes.length = 0; inkLayer.clear(); canvas.classList.toggle('pose-drawing', t !== 'pose'); ui?.refresh(); },
    part(p) { S.part = p || 'auto'; ui?.refresh(); },
    sketchWho(id) { S.sketchWho = id; },
    stroke: (pts, o) => { const r = draw.stroke(pts, o); ui?.refresh(); return r; },
    sketch: list => { const r = draw.sketch(list, S.sketchWho); ui?.refresh(); return r; },
    get lastStroke() { return lastStroke; },
    pickWorldAt(x, y) { const p = pickWorld({ clientX: x, clientY: y }); return p ? p.toArray() : null; },
    panel(id) { ui?.openPage(id); },
    headCircle(i) { const c = S.cast[i]; if (!c) return null; const h = draw.headCircle(c); return h && { x: h.x, y: h.y, r: h.r }; },
    sculpt, brush(patch) { Object.assign(sculpt.brush, patch); ui?.refresh(); },
    clearSculpt() { const c = cur(); if (c) { sculpt.clear(c); commit(); } },
    thirds(on) { S.thirds = !!on; ui?.refresh(); },
    library: () => libraryList(),
    librarySave(name) { const c = cur(); if (!c || c.body.kind === 'dog') return null; const e = librarySave(name, c.body, thumbOf(c)); ui?.refresh(); return e; },
    libraryApply(id, mirrored = false) { const c = cur(); const e = libraryList().find(x => x.id === id); if (!c || !e || c.body.kind === 'dog') return false; libraryApply(e, c.body); if (mirrored) mirror(c); commit(); return true; },
    libraryDrop(id) { libraryDrop(id); ui?.refresh(); },
    nextBeat() { if (!S.beats.length) S.beats = [core()]; else S.beats[S.beat] = core(); S.beats.splice(S.beat + 1, 0, core()); S.beat++; onionDirty = true; commit(); ui?.toast(`Beat ${S.beat + 1}: the scene copied. The last beat shows ghosted when the onion skin is on.`); },
    goBeat(i) { if (!S.beats.length || i === S.beat || i < 0 || i >= S.beats.length) return; S.beats[S.beat] = core(); const b = S.beats; const at = i; fromJSON(S.beats[i], false, { beats: false }); S.beats = b; S.beat = at; onionDirty = true; commit(); },
    tween() { if (S.beat < 1) return false; S.beats[S.beat] = core(); const mid = tweenSnap(S.beats[S.beat - 1], S.beats[S.beat], 0.5, (i, ch) => S.cast[i]?.body.restIK?.(ch)); const b = S.beats; b.splice(S.beat, 0, mid); fromJSON(mid, false, { beats: false }); S.beats = b; onionDirty = true; commit(); return true; },
    dropBeat() { if (S.beats.length < 2) { S.beats = []; S.beat = 0; commit(); return; } S.beats.splice(S.beat, 1); const b = S.beats; S.beat = Math.min(S.beat, b.length - 1); const at = S.beat; fromJSON(b[at], false, { beats: false }); S.beats = b; S.beat = at; if (b.length < 2) { S.beats = []; S.beat = 0; } onionDirty = true; commit(); },
    onion(on) { S.onion = !!on; onionDirty = true; ui?.refresh(); },
    async shootBeats() {
      if (!S.beats.length) { await shot(S.size, { save: false }); return 1; }
      const was = S.beat; let n = 0;
      for (let i = 0; i < S.beats.length; i++) { api.goBeat(i); for (let k = 0; k < 36; k++) feature.update(1 / 30); /* (a second for the body's own pose to settle from the last beat's) */ const it = await shot(S.size, { save: false }); it.note = `Beat ${i + 1}`; n++; }
      api.goBeat(was); ui?.refresh(); return n;
    },
    note(i, text) { const s = shots[i]; if (s) s.note = String(text).slice(0, 120); },
    async board({ save = true } = {}) {
      const list = shots.slice().reverse();
      const blob = await contactSheet(list, { title: `Breneland storyboard, ${S.scene.name}` });
      if (!blob) { ui?.toast('Take a Shot or two first.'); return null; }
      const name = `breneland-storyboard-${stamp()}.png`;
      if (save) download(blob, name);
      return { blob, name, n: list.length };
    },
  };

  // ---------------------------------------------------------------- go: the panels, the last setup (or the first scene)
  ui = mountUI(api);
  let restored = false;
  try { const j = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (j && sceneById(j.scene)) restored = fromJSON(j, false); } catch { restored = false; }
  if (!restored) setScene(SCENES[0].id);
  lastSnap = JSON.stringify(toJSON());
  ui.refresh();
  window.__pose = { ready: true, api, S, THREE, state: () => toJSON(), body: i => S.cast[i]?.body || null, handles, camera, renderer };
  parent?.postMessage({ type: 'pose-ready' }, location.origin);

  // ---------------------------------------------------------------- the ink: a stroke shown as it is drawn, then faded
  function createInkLayer() {
    const cv = document.createElement('canvas'); cv.className = 'pz-ink'; cv.setAttribute('aria-hidden', 'true');
    document.body.append(cv);
    const g = cv.getContext('2d');
    let last = null, keep = false, fadeT = 0;
    const fit = () => { const d = devicePixelRatio || 1; if (cv.width !== Math.round(innerWidth * d) || cv.height !== Math.round(innerHeight * d)) { cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); } g.setTransform(d, 0, 0, d, 0, 0); };
    const clear = () => { fit(); g.clearRect(0, 0, innerWidth, innerHeight); cv.classList.remove('fade'); };
    return {
      begin(sketch) { clearTimeout(fadeT); if (!keep || !sketch) clear(); keep = sketch; cv.classList.remove('fade'); last = null; },
      to(p) {
        if (last) {
          const w = 2 + (p.p ?? 1) * 5;
          g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = w + 3; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
          g.strokeStyle = '#ff4f8a'; g.lineWidth = w; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
        }
        last = p;
      },
      fade() { keep = false; cv.classList.add('fade'); clearTimeout(fadeT); fadeT = setTimeout(clear, 700); },
      clear() { keep = false; clear(); },
      cursor(x, y, r) { clear(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.strokeStyle = '#2b2340'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 1.5, 0, Math.PI * 2); g.stroke(); },
    };
  }

  function refuse() {
    const d = document.createElement('div');
    d.className = 'pose-refuse';
    const b = document.createElement('b'); b.textContent = 'This tool is for Andrew.';
    const p = document.createElement('p'); p.textContent = 'Sign in to Breneland with his name and PIN first, then open the Pose Editor from his menu.';
    d.append(b, p); document.body.append(d);
    window.__pose = { ready: false, refused: true };
    parent?.postMessage({ type: 'pose-refused' }, location.origin);
  }
}
