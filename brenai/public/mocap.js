// Motion capture for Wizra's model (the Studio's mocap page, owner only). Your camera is read on this device by MediaPipe's pose
// tracker; the 33 body points it finds are turned into turns of her bones, live. A take is recorded as her bone turns at 30 frames a
// second, in the same shape as the game's other clips ({ dur, fps, n, bones: { name: [x, y, z, w per frame] }, hips: [x, y, z per frame] }),
// so a saved take plays in the game like any recorded clip. Nothing of the picture is sent anywhere.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14', MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const $ = id => document.getElementById(id), FPS = 30;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
// each bone that follows a body segment: [bone, its parent bone, from point, to point, the way it points at rest]
const LIMBS = [
  ['leftUpperArm', 'chest', 11, 13, V(1, 0, 0)], ['leftLowerArm', 'leftUpperArm', 13, 15, V(1, 0, 0)], ['leftHand', 'leftLowerArm', 15, 19, V(1, 0, 0)],
  ['rightUpperArm', 'chest', 12, 14, V(-1, 0, 0)], ['rightLowerArm', 'rightUpperArm', 14, 16, V(-1, 0, 0)], ['rightHand', 'rightLowerArm', 16, 20, V(-1, 0, 0)],
  ['leftUpperLeg', 'hips', 23, 25, V(0, -1, 0)], ['leftLowerLeg', 'leftUpperLeg', 25, 27, V(0, -1, 0)], ['rightUpperLeg', 'hips', 24, 26, V(0, -1, 0)], ['rightLowerLeg', 'rightUpperLeg', 26, 28, V(0, -1, 0)],
];
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', ...LIMBS.map(l => l[0])], FINGERS = ['Index', 'Middle', 'Ring', 'Little'], JOINTS = ['Proximal', 'Intermediate', 'Distal'];
const basis = (x, y) => { const X = x.clone().normalize(), Z = X.clone().cross(y).normalize(), Y = Z.clone().cross(X).normalize(); return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); };

// ---- landmarks -> a pose: { q: { bone: Quaternion }, hip: how high her hips are (1 = standing), legs: whether the legs were seen } ----
// MediaPipe's world points: x to the picture's right, y down, z away from the camera. Hers: x to her left, y up, z toward the viewer.
export function solve(lm, o = {}) {
  const P = lm.map(p => V(o.mirror ? -p.x : p.x, -p.y, -p.z)), vis = i => (lm[i].visibility === undefined ? 1 : lm[i].visibility), mid = (a, b) => P[a].clone().add(P[b]).multiplyScalar(0.5);
  const L = o.mirror ? { 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15, 19: 20, 20: 19, 23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27, 7: 8, 8: 7 } : null, ix = i => (L && L[i] !== undefined ? L[i] : i);
  const pt = i => P[ix(i)], hipC = pt(23).clone().add(pt(24)).multiplyScalar(0.5), shC = pt(11).clone().add(pt(12)).multiplyScalar(0.5), up = shC.clone().sub(hipC);
  const legs = Math.min(vis(25), vis(26), vis(27), vis(28)) > 0.55 && !o.upper, world = {}, q = {};
  world.hips = legs ? basis(pt(23).clone().sub(pt(24)), up) : basis(V(pt(23).x - pt(24).x, 0, pt(23).z - pt(24).z).lengthSq() > 1e-6 && !o.upper ? pt(23).clone().sub(pt(24)) : V(1, 0, 0), legs ? up : V(0, 1, 0));
  if (!legs) world.hips = Q();                                                    // sitting at a desk: her hips stay put and only the top half follows
  q.hips = world.hips.clone();
  world.chest = basis(pt(11).clone().sub(pt(12)), up); const torso = world.hips.clone().invert().multiply(world.chest);
  q.spine = Q().slerp(torso, 0.5); q.chest = q.spine.clone().invert().multiply(torso);   // the turn between hips and shoulders, shared by spine and chest
  // head: ears give its side-to-side line, the nose its front
  const ears = pt(7).clone().sub(pt(8)), nose = pt(0).clone().sub(mid(ix(7), ix(8))), hx = ears.clone().normalize(), hz = nose.clone().sub(hx.clone().multiplyScalar(nose.dot(hx))).normalize(), hy = hz.clone().cross(hx).normalize();
  const headW = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hx, hy, hz)).multiply(Q().setFromAxisAngle(V(1, 0, 0), 0.32)), neck = world.chest.clone().invert().multiply(headW);   // (a level head has the nose a little below the ears)
  q.neck = Q().slerp(neck, 0.4); q.head = q.neck.clone().invert().multiply(neck); world.head = headW;
  for (const [bone, parent, a, b, rest] of LIMBS) {
    const isLeg = /Leg/.test(bone); if (isLeg && !legs) { q[bone] = Q(); world[bone] = (world[parent] || Q()).clone(); continue; }
    const dir = pt(b).clone().sub(pt(a)); if (dir.lengthSq() < 1e-8 || Math.min(vis(ix(a)), vis(ix(b))) < 0.3) { q[bone] = null; world[bone] = (world[parent] || Q()).clone(); continue; }
    const local = dir.normalize().applyQuaternion(world[parent].clone().invert()); q[bone] = Q().setFromUnitVectors(rest, local); world[bone] = world[parent].clone().multiply(q[bone]);
  }
  const ank = (pt(27).y + pt(28).y) / 2, hipH = hipC.y - ank;                      // hip height off the ankles, for crouching and jumping
  return { q, legs, hipH: legs ? hipH : 0 };
}

// ---- a take: frames of { q: { bone: [x,y,z,w] }, hip } -> the game's clip, with the clean-up applied ----
const slerpArr = (a, b, t) => { const qa = Q().fromArray(a), qb = Q().fromArray(b); return qa.slerp(qb, t).toArray(); };
export function toClip(frames, o = {}) {
  let f = frames.slice(Math.round((o.in || 0) * (frames.length - 1)), Math.round((o.out === undefined ? 1 : o.out) * (frames.length - 1)) + 1); if (f.length < 1) f = frames.slice(0, 1);
  const names = Object.keys(f[0].q); let rows = names.map(n => f.map(fr => fr.q[n] || [0, 0, 0, 1])), hip = f.map(fr => fr.hip || 1);
  if (o.speed && o.speed !== 1 && f.length > 1) { const n2 = Math.max(2, Math.round(f.length / o.speed)), pick = (arr, isQ) => Array.from({ length: n2 }, (_, i) => { const x = i / (n2 - 1) * (arr.length - 1), i0 = Math.floor(x), i1 = Math.min(arr.length - 1, i0 + 1); return isQ ? slerpArr(arr[i0], arr[i1], x - i0) : arr[i0] + (arr[i1] - arr[i0]) * (x - i0); }); rows = rows.map(r => pick(r, true)); hip = pick(hip, false); }
  for (let pass = 0; pass < (o.smooth || 0); pass++) { rows = rows.map(r => r.map((q, i) => i === 0 || i === r.length - 1 ? q : slerpArr(slerpArr(r[i - 1], r[i + 1], 0.5), q, 0.5))); hip = hip.map((h, i) => i === 0 || i === hip.length - 1 ? h : (hip[i - 1] + 2 * h + hip[i + 1]) / 4); }
  if (o.mirror) { const flip = q => [q[0], -q[1], -q[2], q[3]], other = n => n.startsWith('left') ? 'right' + n.slice(4) : n.startsWith('right') ? 'left' + n.slice(5) : n, by = {}; names.forEach((n, i) => { by[n] = rows[i]; }); rows = names.map(n => (by[other(n)] || by[n]).map(flip)); }
  const n = rows[0].length; if (o.loop && n > 12) { const k = Math.min(10, Math.floor(n / 3)); for (let i = 0; i < k; i++) { const t = (i + 1) / (k + 1); rows = rows.map(r => { r[n - k + i] = slerpArr(r[n - k + i], r[0], t); return r; }); hip[n - k + i] += (hip[0] - hip[n - k + i]) * t; } }
  const bones = {}; names.forEach((nm, i) => { bones[nm] = rows[i].flat().map(v => +v.toFixed(5)); });
  return { dur: +(Math.max(1, n) / FPS).toFixed(4), fps: FPS, n, bones, hips: hip.flatMap(h => [0, +h.toFixed(4), 0]), made: 'mocap' };
}
// poses held in turn, each for `hold` seconds with `ease` seconds between -> frames
export function keysToFrames(keys) {
  if (!keys.length) return []; const out = [], push = (a, b, t) => { const q = {}; for (const n in a.q) q[n] = b && b.q[n] ? slerpArr(a.q[n], b.q[n], t) : a.q[n]; out.push({ q, hip: b ? a.hip + (b.hip - a.hip) * t : a.hip }); };
  keys.forEach((k, i) => { for (let f = 0; f < Math.max(1, Math.round(k.hold * FPS)); f++) push(k); const nx = keys[i + 1]; if (nx) { const m = Math.max(1, Math.round((k.ease || 0.4) * FPS)); for (let f = 1; f <= m; f++) { const t = f / (m + 1); push(k, nx, t * t * (3 - 2 * t)); } } });
  return out;
}

// ---- the page ----
export async function start() {
  const me = await (await fetch('/api/state')).json().catch(() => ({})); if (me.error) { location.href = '/'; return; }
  if (me.owner === false) { document.body.innerHTML = '<p style="font:18px Fredoka,sans-serif;padding:40px;text-align:center">Motion capture belongs to the owner of this game.<br><a href="/">Back to the game</a></p>'; return; }
  const say = t => { $('status').textContent = t; };
  // her, standing in an empty studio
  const view = $('view'), renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); view.append(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50); scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 4, 4); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshBasicMaterial({ color: '#4a3a7c' })); floor.rotation.x = -Math.PI / 2; scene.add(floor); const grid = new THREE.GridHelper(3.2, 16, '#8a7aa8', '#5a4a8c'); grid.position.y = 0.002; scene.add(grid);
  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p)); say('Loading her model...');
  let vrm; try { vrm = (await loader.loadAsync('/api/avatar?v=' + ((me.settings || {}).avatarV || 1))).userData.vrm; } catch { say('Her 3D model could not be loaded. Upload one in the game first.'); return; }
  VRMUtils.rotateVRM0(vrm); scene.add(vrm.scene); const B = n => vrm.humanoid.getNormalizedBoneNode(n), hipsNode = B('hips'), hipY0 = hipsNode.position.y;
  const orbit = { yaw: 0.35, pitch: 0.08, dist: 4.2 }; let drag = null;
  view.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ...orbit }; view.setPointerCapture(e.pointerId); }); view.addEventListener('pointermove', e => { if (drag) { orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.008; orbit.pitch = Math.max(-0.4, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.006)); } });
  view.addEventListener('pointerup', () => { drag = null; }); view.addEventListener('wheel', e => { orbit.dist = Math.max(1.6, Math.min(8, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9))); e.preventDefault(); }, { passive: false });
  const size = () => { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }; addEventListener('resize', size); size();

  // the pose she is in right now (what the camera, a key, the sliders or the take's playhead last said)
  const pose = { q: {}, hip: 1 }; for (const n of BONES) pose.q[n] = Q(); const curl = { left: 0.15, right: 0.15 };
  const rest = () => { for (const n of BONES) pose.q[n].identity(); pose.q.leftUpperArm.setFromAxisAngle(V(0, 0, 1), -1.25); pose.q.rightUpperArm.setFromAxisAngle(V(0, 0, 1), 1.25); pose.hip = 1; }; rest();
  const snapshot = () => { const q = {}; for (const n of BONES) q[n] = pose.q[n].toArray(); for (const s of ['left', 'right']) for (const f of FINGERS) for (const j of JOINTS) q[s + f + j] = Q().setFromAxisAngle(V(0, 0, 1), (s === 'left' ? -1 : 1) * curl[s] * (j === 'Proximal' ? 1.4 : j === 'Intermediate' ? 1.6 : 1.1)).toArray(); return { q, hip: pose.hip }; };
  const show = fr => { for (const n in fr.q) { const b = B(n); if (b) b.quaternion.fromArray(fr.q[n]); } hipsNode.position.y = hipY0 * (fr.hip || 1); };

  // ---- camera and tracker ----
  const video = $('cam'); let tracker = null, stream = null, live = false, standH = 0; const opt = { mirror: true, upper: false };
  window.mocapFeed = lm => { const s = solve(lm, opt); if (s.legs) { standH = Math.max(standH, s.hipH); } for (const n of BONES) { const t = s.q[n]; if (t) pose.q[n].slerp(t, opt.snap ? 1 : 0.55); } pose.hip = s.legs && standH ? Math.max(0.3, Math.min(1.25, s.hipH / standH)) : 1; return s; };   // (also the test hook: canned landmarks)
  async function camOn() {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); } catch { return say('The camera was not allowed or could not be opened.'); }
    video.srcObject = stream; await video.play().catch(() => {}); $('camBtn').textContent = 'Turn the camera off'; say('Loading the body tracker (first time takes a moment)...');
    try { if (!tracker) { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm'); tracker = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 }); } } catch (e) { return say('The body tracker could not load: ' + (e.message || 'network')); }
    live = true; standH = 0; say('Step back so the camera sees you. Stand straight for a second so it learns your height.');
  }
  function camOff() { live = false; if (stream) for (const t of stream.getTracks()) t.stop(); stream = null; video.srcObject = null; $('camBtn').textContent = 'Turn the camera on'; say('Camera off.'); }
  $('camBtn').onclick = () => (stream ? camOff() : camOn()); $('mirror').onchange = e => { opt.mirror = e.target.checked; video.style.transform = opt.mirror ? 'scaleX(-1)' : ''; }; $('upper').onchange = e => { opt.upper = e.target.checked; };
  for (const s of ['left', 'right']) $(s + 'Curl').oninput = e => { curl[s] = +e.target.value; };

  // ---- recording and the take ----
  let rec = null, take = null, play = { on: false, t: 0 }, saved = {};
  const clean = () => ({ in: +$('trimIn').value, out: +$('trimOut').value, smooth: +$('smooth').value, speed: +$('speed').value, mirror: $('flip').checked, loop: $('loop').checked });
  const built = () => (take ? toClip(take, clean()) : null);
  function takeInfo() { const c = built(); $('takeBox').hidden = !take; if (c) $('takeLen').textContent = `${c.n} frames, ${c.dur.toFixed(2)} s`; }
  $('recBtn').onclick = async () => {
    if (rec) { take = rec.frames; rec = null; $('recBtn').textContent = '● Record'; $('recBtn').classList.remove('on'); play = { on: true, t: 0 }; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); return say(`Take recorded: ${take.length} frames. It is playing on her now; clean it up below, then save.`); }
    for (let i = 3; i > 0; i--) { say('Recording in ' + i + '...'); await new Promise(r => setTimeout(r, 800)); }
    rec = { frames: [], next: performance.now() }; play.on = false; $('recBtn').textContent = '■ Stop'; $('recBtn').classList.add('on'); say('Recording. Press Stop when you are done.');
  };
  $('playBtn').onclick = () => { play.on = !play.on; }; $('scrub').oninput = e => { play.on = false; play.t = +e.target.value; };
  for (const id of ['trimIn', 'trimOut', 'smooth', 'speed', 'flip', 'loop']) $(id).oninput = takeInfo;
  $('dropTake').onclick = () => { take = null; play.on = false; takeInfo(); say('Take dropped.'); };

  // ---- poses by hand: turn one bone with sliders, keep poses as keys, make a take from the keys ----
  const keys = [], boneSel = $('bone'); for (const n of BONES) boneSel.append(new Option(n, n));
  const e3 = new THREE.Euler(), toSliders = () => { e3.setFromQuaternion(pose.q[boneSel.value]); ['rx', 'ry', 'rz'].forEach((id, i) => { $(id).value = [e3.x, e3.y, e3.z][i]; }); };
  boneSel.onchange = toSliders; for (const id of ['rx', 'ry', 'rz']) $(id).oninput = () => { play.on = false; pose.q[boneSel.value].setFromEuler(e3.set(+$('rx').value, +$('ry').value, +$('rz').value)); }; toSliders();
  $('restBtn').onclick = () => { rest(); toSliders(); };
  function drawKeys() { const box = $('keys'); box.textContent = ''; keys.forEach((k, i) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = `${i + 1}: ${k.hold}s`; b.title = 'Tap to put her back in this pose; double tap to remove it'; b.onclick = () => { play.on = false; for (const n of BONES) pose.q[n].fromArray(k.q[n]); pose.hip = k.hip; toSliders(); }; b.ondblclick = () => { keys.splice(i, 1); drawKeys(); }; box.append(b); }); $('keysBtn').disabled = !keys.length; }
  $('keyBtn').onclick = () => { keys.push({ ...snapshot(), hold: Math.max(0.1, +$('hold').value || 0.5), ease: 0.4 }); drawKeys(); say(`Pose ${keys.length} kept. Add more, then "Make a take from the poses".`); };
  $('keysBtn').onclick = () => { take = keysToFrames(keys); play = { on: true, t: 0 }; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); say('A take was made from your poses. It is playing now.'); }; drawKeys();

  // ---- saving: into the game's clips, as a file, from a file ----
  async function listSaved() { try { saved = (await (await fetch('/api/anims')).json()).clips || {}; } catch { saved = {}; } const box = $('saved'); box.textContent = '';
    for (const name of Object.keys(saved).sort()) { const row = document.createElement('div'); row.className = 'row'; const a = document.createElement('button'); a.className = 'chip'; a.textContent = `${name} (${(saved[name].dur || 0).toFixed(1)} s)`; a.title = 'Play this clip on her';
      a.onclick = () => { const c = saved[name]; take = Array.from({ length: c.n }, (_, i) => { const q = {}; for (const b in c.bones) q[b] = c.bones[b].slice(i * 4, i * 4 + 4); return { q, hip: c.hips ? c.hips[i * 3 + 1] : 1 }; }); play = { on: true, t: 0 }; $('name').value = name; $('trimIn').value = 0; $('trimOut').value = 1; takeInfo(); say(`"${name}" is playing. You can clean it up and save it again, under this name or a new one.`); };
      const x = document.createElement('button'); x.className = 'mini'; x.textContent = '✕'; x.title = 'Delete this clip from the game'; x.onclick = async () => { if (!confirm(`Delete the clip "${name}" from the game?`)) return; await fetch('/api/anims/clip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ remove: name }) }); listSaved(); }; row.append(a, x); box.append(row); } }
  $('saveBtn').onclick = async () => { const c = built(), name = $('name').value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40); if (!c) return say('Record a take or make one from poses first.'); if (!name) return say('Give the take a name first.');
    if (saved[name] && !confirm(`There is already a clip called "${name}". Replace it?`)) return; const r = await fetch('/api/anims/clip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, clip: c }) }), d = await r.json().catch(() => ({}));
    say(r.ok ? `Saved as "${name}". In the game: a Studio event can play it, and a Reaction can use it as clip:${name}.` : (d.error || 'It could not be saved.')); listSaved(); };
  $('dlBtn').onclick = () => { const c = built(); if (!c) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(c)], { type: 'application/json' })); a.download = ($('name').value.trim() || 'take') + '.json'; a.click(); };
  $('upFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const c = JSON.parse(await f.text()); if (!c.bones || !c.n) throw 0; take = Array.from({ length: c.n }, (_, i) => { const q = {}; for (const b in c.bones) q[b] = c.bones[b].slice(i * 4, i * 4 + 4); return { q, hip: c.hips ? c.hips[i * 3 + 1] : 1 }; }); play = { on: true, t: 0 }; takeInfo(); say('Clip loaded from the file.'); } catch { say('That file is not a clip saved from here.'); } };
  listSaved(); say('Ready. Turn the camera on, or pose her by hand.');

  // ---- every frame ----
  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (live && tracker && video.readyState >= 2 && !(play.on && !rec)) { let r = null; try { r = tracker.detectForVideo(video, now); } catch {} const lm = r && r.worldLandmarks && r.worldLandmarks[0]; if (lm) { const s = window.mocapFeed(lm); if (!rec) say(s.legs ? 'Tracking your whole body.' : 'Tracking your top half (step back for legs).'); } else if (!rec) say('I cannot see you. Step into view.'); }
    if (rec) while (now >= rec.next) { rec.frames.push(snapshot()); rec.next += 1000 / FPS; if (rec.frames.length >= 30 * 60) { $('recBtn').click(); break; } }
    if (take && (play.on || !live) && !rec) { const c = built(), n = c.n; if (play.on) play.t = (play.t + dt / c.dur) % 1; const i = Math.min(n - 1, Math.floor(play.t * n)), fr = { q: {}, hip: c.hips[i * 3 + 1] }; for (const b in c.bones) fr.q[b] = c.bones[b].slice(i * 4, i * 4 + 4); if (play.on || document.activeElement === $('scrub')) { show(fr); $('scrub').value = play.t; } else show(snapshot()); $('playBtn').textContent = play.on ? '⏸ Pause' : '▶ Play'; }
    else show(snapshot());
    vrm.update(dt); camera.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist, 0.95 + Math.sin(orbit.pitch) * orbit.dist, Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist); camera.lookAt(0, 0.9, 0); renderer.render(scene, camera);
  })(last);
  window.mocapDbg = { pose, keys, get take() { return take; }, built, solve };
}
