// Rigger: draw a skeleton over a model and get a rigged model back. Runs in a browser with no internet (see ../build.sh: everything is packed into one file).
//
// 1. Load a .glb (rigged or not: an existing skeleton is ignored). It is stood on the floor and centred.
// 2. Pick a starting skeleton (real human, anime, super deformed). It is fitted to the model: top of the head, hands and feet are found from the model's outline.
// 3. Move joints by dragging them. From the FRONT a joint only moves across the picture and its depth stays put, as if there were a hard sheet behind the
//    character; from the SIDE only its depth and height change. "Centre in body" puts a joint in the middle of the flesh it sits in. Left and right mirror.
//    Or choose a limb and draw it as one line: the joints are spread along the line.
// 4. "Attach the mesh" works out which bones each part of the surface follows (see skin() below), "Try a pose" bends her to show the result, and
//    "Save rigged model" writes a .glb whose bones carry the usual names (Hips, Spine, LeftArm, LeftForeArm, LeftUpLeg...), which the Brenai photo studio reads.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const $ = id => document.getElementById(id), say = t => { $('note').textContent = t; };

// ---------------------------------------------------------------- the skeleton
// name, parent, and whether the mesh follows the piece from this joint to its child ('end' joints only mark where a piece stops)
const JOINTS = [['Hips', null], ['Spine', 'Hips'], ['Spine1', 'Spine'], ['Spine2', 'Spine1'], ['Neck', 'Spine2'], ['Head', 'Neck'], ['HeadTop_End', 'Head'],
  ['LeftShoulder', 'Spine2'], ['LeftArm', 'LeftShoulder'], ['LeftForeArm', 'LeftArm'], ['LeftHand', 'LeftForeArm'], ['LeftHand_End', 'LeftHand'],
  ['RightShoulder', 'Spine2'], ['RightArm', 'RightShoulder'], ['RightForeArm', 'RightArm'], ['RightHand', 'RightForeArm'], ['RightHand_End', 'RightHand'],
  ['LeftUpLeg', 'Hips'], ['LeftLeg', 'LeftUpLeg'], ['LeftFoot', 'LeftLeg'], ['LeftToeBase', 'LeftFoot'], ['LeftToe_End', 'LeftToeBase'],
  ['RightUpLeg', 'Hips'], ['RightLeg', 'RightUpLeg'], ['RightFoot', 'RightLeg'], ['RightToeBase', 'RightFoot'], ['RightToe_End', 'RightToeBase']];
const PARENT = Object.fromEntries(JOINTS), KIDS = {}; for (const [n, p] of JOINTS) if (p) (KIDS[p] || (KIDS[p] = [])).push(n);
const mirrorOf = n => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : null;
// Starting skeletons, as fractions of the character's height: [across from the middle (her left is +), up from the floor, forward].
// Only the middle and the left side are written; the right side is the mirror. Arms hang out at an angle (an A pose).
const PRESET = {
  real: { label: 'Real human', j: { Hips: [0, 0.53, 0], Spine: [0, 0.59, 0], Spine1: [0, 0.67, 0], Spine2: [0, 0.75, 0], Neck: [0, 0.855, 0], Head: [0, 0.885, 0.005], HeadTop_End: [0, 1, 0.005],
    LeftShoulder: [0.035, 0.815, 0], LeftArm: [0.105, 0.815, 0], LeftForeArm: [0.21, 0.67, 0], LeftHand: [0.3, 0.535, 0.01], LeftHand_End: [0.345, 0.47, 0.015],
    LeftUpLeg: [0.055, 0.51, 0], LeftLeg: [0.06, 0.285, 0.005], LeftFoot: [0.062, 0.05, -0.01], LeftToeBase: [0.065, 0.012, 0.06], LeftToe_End: [0.066, 0.008, 0.1] } },
  anime: { label: 'Anime', j: { Hips: [0, 0.545, 0], Spine: [0, 0.6, 0], Spine1: [0, 0.665, 0], Spine2: [0, 0.73, 0], Neck: [0, 0.815, 0], Head: [0, 0.845, 0.005], HeadTop_End: [0, 1, 0.005],
    LeftShoulder: [0.03, 0.785, 0], LeftArm: [0.09, 0.785, 0], LeftForeArm: [0.185, 0.65, 0], LeftHand: [0.27, 0.525, 0.01], LeftHand_End: [0.31, 0.465, 0.015],
    LeftUpLeg: [0.048, 0.525, 0], LeftLeg: [0.052, 0.29, 0.005], LeftFoot: [0.054, 0.045, -0.01], LeftToeBase: [0.057, 0.012, 0.055], LeftToe_End: [0.058, 0.008, 0.09] } },
  sd: { label: 'Super deformed', j: { Hips: [0, 0.3, 0], Spine: [0, 0.345, 0], Spine1: [0, 0.395, 0], Spine2: [0, 0.445, 0], Neck: [0, 0.5, 0], Head: [0, 0.53, 0.005], HeadTop_End: [0, 1, 0.005],
    LeftShoulder: [0.04, 0.48, 0], LeftArm: [0.1, 0.48, 0], LeftForeArm: [0.175, 0.4, 0], LeftHand: [0.24, 0.325, 0.01], LeftHand_End: [0.275, 0.285, 0.015],
    LeftUpLeg: [0.07, 0.285, 0], LeftLeg: [0.075, 0.165, 0.005], LeftFoot: [0.078, 0.045, -0.01], LeftToeBase: [0.082, 0.015, 0.07], LeftToe_End: [0.084, 0.01, 0.12] } } };
// limbs that can be drawn as one line, top to bottom
const CHAINS = { 'Body (hips to head)': ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End'], 'Left arm': ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHand_End'], 'Right arm': ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHand_End'],
  'Left leg': ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], 'Right leg': ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'] };

// ---------------------------------------------------------------- the scene
const canvas = $('view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a2440');
scene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 1.5)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 5); scene.add(sun);
const grid = new THREE.GridHelper(4, 16, 0x8877aa, 0x4a4466); scene.add(grid);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
const S = { model: null, meshes: [], H: 1.6, box: new THREE.Box3(), J: {}, view: 'front', yaw: 0, pitch: 0, zoom: 1, cx: 0, cy: 0.8, sel: '', mirror: true, carry: true, tool: 'move', chain: 'Left arm', ink: null, skinned: null, pose: 0, grab: null, ray: new THREE.Raycaster(), tris: null };
const overlay = $('overlay'), g2 = overlay.getContext('2d');

function fitView() { const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false); overlay.width = w; overlay.height = h;
  const half = S.H * 0.62 / S.zoom, asp = w / h; camera.left = -half * asp; camera.right = half * asp; camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
  const yaw = S.view === 'front' ? 0 : S.view === 'side' ? Math.PI / 2 : S.yaw, pitch = S.view === 'free' ? S.pitch : 0;
  camera.position.set(S.cx * (S.view === 'side' ? 0 : 1) + Math.sin(yaw) * Math.cos(pitch) * 10, S.cy + Math.sin(pitch) * 10, (S.view === 'side' ? -S.cx : 0) + Math.cos(yaw) * Math.cos(pitch) * 10); camera.lookAt(S.view === 'side' ? 0 : S.cx, S.cy, S.view === 'side' ? -S.cx : 0); camera.updateMatrixWorld(); }
const toScreen = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * overlay.width, (1 - p.y) / 2 * overlay.height]; };
const fromScreen = (x, y) => new THREE.Vector3(x / overlay.width * 2 - 1, 1 - y / overlay.height * 2, 0).unproject(camera);   // a point on the camera's own plane under the pointer

// ---------------------------------------------------------------- loading
async function load(file) { say('Loading ' + file.name + '...'); const buf = await file.arrayBuffer(); const gltf = await new GLTFLoader().parseAsync(buf, '');
  if (S.model) scene.remove(S.model); if (S.skinned) { scene.remove(S.skinned.root); S.skinned = null; }
  // every mesh becomes a plain mesh in the room's own coordinates (a skeleton it came with is dropped: its stored shape is the shape it is bound in)
  const root = new THREE.Group(), meshes = []; gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if (!o.isMesh) return; const geo = o.geometry.clone(); for (const k of ['skinIndex', 'skinWeight']) geo.deleteAttribute(k); geo.morphAttributes = {}; geo.applyMatrix4(o.matrixWorld); if (!geo.attributes.normal) geo.computeVertexNormals(); const m = new THREE.Mesh(geo, o.material); m.name = o.name || 'mesh'; root.add(m); meshes.push(m); });
  if (!meshes.length) return say('That file has no mesh in it.');
  S.model = root; S.meshes = meshes; S.name = file.name.replace(/\.(glb|gltf|vrm)$/i, ''); scene.add(root); settle(); preset($('preset').value); say(`Loaded: ${meshes.length} mesh(es), ${meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0)} points. Drag the joints into place, then Attach.`); }
// stand it on the floor, centre it, and remember its size
function settle() { const box = new THREE.Box3().setFromObject(S.model), c = box.getCenter(new THREE.Vector3()), off = new THREE.Vector3(-c.x, -box.min.y, -c.z); for (const m of S.meshes) m.geometry.translate(off.x, off.y, off.z);
  S.box.setFromObject(S.model); S.H = S.box.max.y - S.box.min.y; S.cx = 0; S.cy = S.H / 2; S.zoom = 1; grid.scale.setScalar(S.H / 1.6); S.tris = null; }
function turn(deg) { if (!S.model) return; const m4 = new THREE.Matrix4().makeRotationY(deg * Math.PI / 180); for (const m of S.meshes) m.geometry.applyMatrix4(m4); settle(); preset($('preset').value); unskin(); }

// ---------------------------------------------------------------- fitting a starting skeleton to the model
function preset(key) { const P = PRESET[key] || PRESET.real, H = S.H, J = {}; for (const [n] of JOINTS) { const src = P.j[n] || P.j[mirrorOf(n)], sx = P.j[n] ? 1 : -1; J[n] = new THREE.Vector3(src[0] * sx * H, src[1] * H, src[2] * H); } S.J = J; if (S.model) fitToModel(); unskin(); }
// The outline of the model says where the ends are: the top of the head, the two hands (the points furthest out to each side, if the arms stand away from the body)
// and the two feet (the lowest points on each side). Each limb of the starting skeleton is then stretched to end there, and joints are centred in the body.
function fitToModel() { const J = S.J, pts = []; for (const m of S.meshes) { const a = m.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 60000)); for (let i = 0; i < a.count; i += step) pts.push([a.getX(i), a.getY(i), a.getZ(i)]); }
  const H = S.H, far = { L: null, R: null }, feet = { L: [0, 0, 0, 0], R: [0, 0, 0, 0] }; for (const p of pts) { if (p[1] > H * 0.25) { if (!far.L || p[0] > far.L[0]) far.L = p; if (!far.R || p[0] < far.R[0]) far.R = p; } if (p[1] < H * 0.04) { const f = feet[p[0] >= 0 ? 'L' : 'R']; f[0] += p[0]; f[1] += p[1]; f[2] += p[2]; f[3]++; } }
  const stretch = (chain, endTo) => { const a = J[chain[0]], oldEnd = J[chain[chain.length - 1]].clone(), from = oldEnd.clone().sub(a), to = endTo.clone().sub(a); if (from.lengthSq() < 1e-8) return; const q = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize()), k = to.length() / from.length(); for (const n of chain.slice(1)) J[n].sub(a).applyQuaternion(q).multiplyScalar(k).add(a); };
  for (const [sd, key] of [['Left', 'L'], ['Right', 'R']]) { const tip = far[key]; if (tip && Math.abs(tip[0]) > H * 0.16) stretch([sd + 'Arm', sd + 'ForeArm', sd + 'Hand', sd + 'Hand_End'], new THREE.Vector3(tip[0] * 0.985, tip[1], tip[2]));   /* only when the arms really do stand out from the body */
    const f = feet[key]; if (f[3] > 3) { const ankleX = f[0] / f[3]; for (const n of [sd + 'UpLeg', sd + 'Leg', sd + 'Foot', sd + 'ToeBase', sd + 'Toe_End']) J[n].x = J[n].x / (J[sd + 'Foot'].x || 1) * ankleX; } }
  for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']) centre(n, 'z'); }
// the middle of the flesh a joint sits in, along one axis: a line is shot through the model there and the joint is put halfway between where it goes in and where it comes out
function triangles() { if (S.tris) return S.tris; const out = []; for (const m of S.meshes) { const p = m.geometry.attributes.position, ix = m.geometry.index; const n = ix ? ix.count : p.count; for (let i = 0; i < n; i += 3) { const a = ix ? ix.getX(i) : i, b = ix ? ix.getX(i + 1) : i + 1, c = ix ? ix.getX(i + 2) : i + 2; out.push(p.getX(a), p.getY(a), p.getZ(a), p.getX(b), p.getY(b), p.getZ(b), p.getX(c), p.getY(c), p.getZ(c)); } } return (S.tris = new Float32Array(out)); }
function span(pt, axis) { // where a line through pt along the axis ('x' or 'z') enters and leaves the model nearest pt: [low, high] or null
  const T = triangles(), u = axis === 'z' ? 0 : 2, w = 1, d = axis === 'z' ? 2 : 0, pu = pt.getComponent(u), pw = pt.getComponent(w), hits = [];
  for (let i = 0; i < T.length; i += 9) { const ax = T[i + u], ay = T[i + w], bx = T[i + 3 + u], by = T[i + 3 + w], cx = T[i + 6 + u], cy = T[i + 6 + w]; if ((ax < pu && bx < pu && cx < pu) || (ax > pu && bx > pu && cx > pu) || (ay < pw && by < pw && cy < pw) || (ay > pw && by > pw && cy > pw)) continue;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-14) continue; const l1 = ((by - cy) * (pu - cx) + (cx - bx) * (pw - cy)) / den, l2 = ((cy - ay) * (pu - cx) + (ax - cx) * (pw - cy)) / den, l3 = 1 - l1 - l2; if (l1 < 0 || l2 < 0 || l3 < 0) continue; hits.push(l1 * T[i + d] + l2 * T[i + 3 + d] + l3 * T[i + 6 + d]); }
  if (hits.length < 2) return null; hits.sort((a, b) => a - b); const at = pt.getComponent(d); let best = null; for (let i = 0; i + 1 < hits.length; i += 2) { const lo = hits[i], hi = hits[i + 1], gap = at < lo ? lo - at : at > hi ? at - hi : 0; if (!best || gap < best[2]) best = [lo, hi, gap]; } return best; }
function centre(name, axis) { const j = S.J[name]; if (!j || !S.model) return false; const s = span(j, axis); if (!s) return false; j.setComponent(axis === 'z' ? 2 : 0, (s[0] + s[1]) / 2); return true; }

// ---------------------------------------------------------------- moving joints
function moveJoint(name, to, done) { const j = S.J[name], d = to.clone().sub(j); if (S.view === 'front') d.z = 0; else if (S.view === 'side') d.x = 0;   /* the hard sheet: from the front nothing moves in depth, from the side nothing moves across */
  const shift = (n, dv) => { S.J[n].add(dv); if (S.carry) for (const k of KIDS[n] || []) shift(k, dv); }; shift(name, d);
  const m = S.mirror && mirrorOf(name); if (m) { const dm = d.clone(); dm.x = -dm.x; const want = j.clone(); want.x = -want.x; shift(m, S.carry ? dm : want.sub(S.J[m])); }
  else if (S.mirror && !mirrorOf(name) && S.view !== 'side') { /* a joint on the middle line stays on it */ const back = -S.J[name].x; if (S.carry) { const mid = n => { if (!mirrorOf(n)) { S.J[n].x += back; } for (const k of KIDS[n] || []) if (!mirrorOf(k)) mid(k); }; mid(name); } else S.J[name].x = 0; }
  unskin(); if (done && $('snap').checked && S.view === 'front') { centre(name, 'z'); if (m) centre(m, 'z'); } }
function drawChain(name, line) { const chain = CHAINS[name]; if (!chain || line.length < 2) return; let total = 0; const seg = []; for (let i = 1; i < chain.length; i++) { const l = S.J[chain[i]].distanceTo(S.J[chain[i - 1]]); seg.push(l); total += l; }
  let len = 0; const cum = [0]; for (let i = 1; i < line.length; i++) { len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); cum.push(len); } if (len < 12) return;
  const at = f => { const want = f * len; let i = 1; while (i < cum.length - 1 && cum[i] < want) i++; const k = (want - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * k, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * k]; };
  const was = S.carry; S.carry = false; let run = 0; chain.forEach((n, i) => { if (i) run += seg[i - 1]; const p = at(total ? run / total : i / (chain.length - 1)), w = fromScreen(p[0], p[1]), to = S.J[n].clone(); if (S.view === 'side') { to.z = w.z; to.y = w.y; } else { to.x = w.x; to.y = w.y; if (S.view === 'free') to.z = w.z; } moveJoint(n, to, true); }); S.carry = was; }

// ---------------------------------------------------------------- attaching the mesh to the bones
// The body is filled with small cubes. For each bone, how far every cube is from it is measured THROUGH the body, cube to cube, never across open air: so a
// hand hanging next to a thigh is a long way from the leg bones, and does not follow them. Each point of the surface then follows the (up to four) bones nearest
// to it in that sense, most strongly the nearest. Slower than measuring straight-line distance, and much better where limbs pass close to the body.
function skin() { if (!S.model) return null; const t0 = performance.now(), bones = JOINTS.filter(([n]) => KIDS[n]).map(([n]) => n), ends = n => { const kids = KIDS[n]; const k = kids.find(c => !/Shoulder|UpLeg/.test(c) || !/^(Spine2|Hips)$/.test(n)) || kids[0]; return n === 'Hips' ? S.J.Spine : n === 'Spine2' ? S.J.Neck : S.J[k]; };
  const box = S.box.clone().expandByScalar(S.H * 0.03), size = box.getSize(new THREE.Vector3()), cell = Math.max(size.x, size.y, size.z) / 88, nx = Math.ceil(size.x / cell) + 2, ny = Math.ceil(size.y / cell) + 2, nz = Math.ceil(size.z / cell) + 2, N = nx * ny * nz, id = (x, y, z) => x + nx * (y + ny * z);
  const cellOf = (px, py, pz) => [Math.max(0, Math.min(nx - 1, Math.floor((px - box.min.x) / cell) + 1)), Math.max(0, Math.min(ny - 1, Math.floor((py - box.min.y) / cell) + 1)), Math.max(0, Math.min(nz - 1, Math.floor((pz - box.min.z) / cell) + 1))];
  // 1. cubes the surface passes through
  const solid = new Uint8Array(N), T = triangles(); for (let i = 0; i < T.length; i += 9) { const e1 = Math.hypot(T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]), e2 = Math.hypot(T[i + 6] - T[i], T[i + 7] - T[i + 1], T[i + 8] - T[i + 2]), n = Math.max(1, Math.ceil(Math.max(e1, e2) / (cell * 0.5)));
    for (let a = 0; a <= n; a++) for (let b = 0; b <= n - a; b++) { const u = a / n, v = b / n, w = 1 - u - v, c = cellOf(T[i] * w + T[i + 3] * u + T[i + 6] * v, T[i + 1] * w + T[i + 4] * u + T[i + 7] * v, T[i + 2] * w + T[i + 5] * u + T[i + 8] * v); solid[id(c[0], c[1], c[2])] = 1; } }
  // 2. the open air: everything reachable from the edge of the box without crossing the surface. What is left is the body.
  const air = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0; const pushAir = i => { if (!air[i] && !solid[i]) { air[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) { pushAir(id(x, y, 0)); pushAir(id(x, y, nz - 1)); } for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) { pushAir(id(x, 0, z)); pushAir(id(x, ny - 1, z)); } for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) { pushAir(id(0, y, z)); pushAir(id(nx - 1, y, z)); }
  const step = [1, -1, nx, -nx, nx * ny, -nx * ny]; while (qh < qt) { const i = q[qh++], x = i % nx, y = Math.floor(i / nx) % ny, z = Math.floor(i / (nx * ny)); if (x > 0) pushAir(i - 1); if (x < nx - 1) pushAir(i + 1); if (y > 0) pushAir(i - nx); if (y < ny - 1) pushAir(i + nx); if (z > 0) pushAir(i - nx * ny); if (z < nz - 1) pushAir(i + nx * ny); }
  const body = new Uint8Array(N); let filled = 0; for (let i = 0; i < N; i++) if (!air[i]) { body[i] = 1; filled++; }
  // 3. for each bone, the distance to every cube of the body, going only through the body
  const FAR = 65535, dist = bones.map(() => new Uint16Array(N).fill(FAR)); bones.forEach((n, bi) => { const a = S.J[n], b = ends(n), d = dist[bi], len = a.distanceTo(b), k = Math.max(1, Math.ceil(len / (cell * 0.5))); qh = qt = 0;
    for (let s = 0; s <= k; s++) { const c = cellOf(a.x + (b.x - a.x) * s / k, a.y + (b.y - a.y) * s / k, a.z + (b.z - a.z) * s / k), i = id(c[0], c[1], c[2]); if (d[i]) { d[i] = 0; q[qt++] = i; } }
    while (qh < qt) { const i = q[qh++], nd = d[i] + 1, x = i % nx, y = Math.floor(i / nx) % ny, z = Math.floor(i / (nx * ny)); for (let s = 0; s < 6; s++) { if ((s === 0 && x === nx - 1) || (s === 1 && x === 0) || (s === 2 && y === ny - 1) || (s === 3 && y === 0) || (s === 4 && z === nz - 1) || (s === 5 && z === 0)) continue; const j = i + step[s]; if (body[j] && d[j] > nd) { d[j] = nd; q[qt++] = j; } } } });
  // 4. each point of the surface: the four nearest bones, weighted by how near
  const result = S.meshes.map(m => { const p = m.geometry.attributes.position, n = p.count, idx = new Uint16Array(n * 4), wgt = new Float32Array(n * 4), best = [0, 0, 0, 0], bw = [0, 0, 0, 0];
    for (let v = 0; v < n; v++) { const px = p.getX(v), py = p.getY(v), pz = p.getZ(v), c = cellOf(px, py, pz), ci = id(c[0], c[1], c[2]); best.fill(0); bw.fill(0);
      for (let bi = 0; bi < bones.length; bi++) { let dv = dist[bi][ci]; if (dv === FAR) { /* a point the filling did not reach (a loose shell, hair, a prop): go by straight-line distance */ const a = S.J[bones[bi]], b = ends(bones[bi]), abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / ((abx * abx + aby * aby + abz * abz) || 1))); dv = Math.hypot(px - a.x - abx * t, py - a.y - aby * t, pz - a.z - abz * t) / cell * 1.6 + 2; }
        const w = 1 / Math.pow(dv + 0.75, 4); let s = 3; if (w <= bw[3]) continue; while (s > 0 && w > bw[s - 1]) { bw[s] = bw[s - 1]; best[s] = best[s - 1]; s--; } bw[s] = w; best[s] = bi; }
      const sum = bw[0] + bw[1] + bw[2] + bw[3] || 1; for (let s = 0; s < 4; s++) { idx[v * 4 + s] = best[s]; wgt[v * 4 + s] = bw[s] / sum; } }
    return { idx, wgt }; });
  return { bones, result, ms: Math.round(performance.now() - t0), cells: N, filled }; }
// build the skinned copy: real bones at the joints, each mesh bound to them
function attach() { if (!S.model) return say('Load a model first.'); say('Attaching the mesh... (a few seconds)'); const sk = skin(), boneOf = {}; const root = new THREE.Group(); root.name = S.name || 'rigged';
  for (const [n, p] of JOINTS) { const b = new THREE.Bone(); b.name = n; boneOf[n] = b; if (p) { boneOf[p].add(b); b.position.copy(S.J[n]).sub(S.J[p]); } else { root.add(b); b.position.copy(S.J[n]); } } root.updateMatrixWorld(true);
  const list = sk.bones.map(n => boneOf[n]), skeleton = new THREE.Skeleton(list), meshes = S.meshes.map((m, i) => { const geo = m.geometry.clone(); geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sk.result[i].idx, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sk.result[i].wgt, 4)); const sm = new THREE.SkinnedMesh(geo, m.material); sm.name = m.name; sm.frustumCulled = false; root.add(sm); sm.bind(skeleton, new THREE.Matrix4()); return sm; });
  if (S.skinned) scene.remove(S.skinned.root); S.skinned = { root, boneOf, meshes, rest: Object.fromEntries(JOINTS.map(([n]) => [n, boneOf[n].quaternion.clone()])), info: sk }; scene.add(root); S.model.visible = false; S.pose = 0;
  say(`Attached in ${sk.ms} ms (${sk.filled} of ${sk.cells} cubes are body). Press "Try a pose" to see how it bends, then save.`); return sk; }
function unskin() { if (!S.skinned) return; scene.remove(S.skinned.root); S.skinned = null; if (S.model) S.model.visible = true; }
// a few poses to show how the mesh follows: arms up, arms down, a knee up, a twist and a bow
const TRY = [null, { LeftArm: [0, 0, 0.9], RightArm: [0, 0, -0.9] }, { LeftArm: [0, 0, -0.6], RightArm: [0, 0, 0.6], LeftForeArm: [0, -1.2, 0], RightForeArm: [0, 1.2, 0] }, { LeftUpLeg: [-1.3, 0, 0], LeftLeg: [1.4, 0, 0], RightArm: [-0.8, 0, 0] }, { Spine: [0.35, 0.5, 0], Spine1: [0.2, 0.3, 0], Head: [0.2, -0.5, 0] }];
function tryPose() { if (!S.skinned) attach(); if (!S.skinned) return; S.pose = (S.pose + 1) % TRY.length; const P = TRY[S.pose] || {}; for (const [n] of JOINTS) { const b = S.skinned.boneOf[n]; b.quaternion.copy(S.skinned.rest[n]); if (P[n]) b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...P[n]))); } say(S.pose ? `Pose ${S.pose} of ${TRY.length - 1}. Press again for the next (the last press puts her back).` : 'Back at rest.'); }
function save() { if (!S.skinned) attach(); if (!S.skinned) return; for (const [n] of JOINTS) S.skinned.boneOf[n].quaternion.copy(S.skinned.rest[n]); S.pose = 0; S.skinned.root.updateMatrixWorld(true);
  new GLTFExporter().parse(S.skinned.root, out => { const blob = new Blob([out], { type: 'model/gltf-binary' }); S.lastSaved = blob; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (S.name || 'model') + '-rigged.glb'; a.click(); say(`Saved ${a.download} (${(blob.size / 1e6).toFixed(1)} MB). In Brenai: photo studio, Place, My model.`); }, e => say('Could not save: ' + e.message), { binary: true }); }
function saveSkeleton() { const o = { joints: Object.fromEntries(Object.entries(S.J).map(([n, v]) => [n, [+v.x.toFixed(5), +v.y.toFixed(5), +v.z.toFixed(5)]])), parents: PARENT, height: S.H }; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' })); a.download = (S.name || 'model') + '-skeleton.json'; a.click(); }
async function loadSkeleton(file) { try { const o = JSON.parse(await file.text()); for (const n in o.joints) if (S.J[n]) S.J[n].fromArray(o.joints[n]); unskin(); say('Skeleton loaded.'); } catch (e) { say('That is not a skeleton file.'); } }

// ---------------------------------------------------------------- drawing and the pointer
function frame() { requestAnimationFrame(frame); fitView(); renderer.render(scene, camera); const w = overlay.width, h = overlay.height; g2.clearRect(0, 0, w, h); if (!S.J.Hips) return; g2.lineCap = 'round';
  const at = n => { if (S.skinned && S.pose) { return toScreen(S.skinned.boneOf[n].getWorldPosition(new THREE.Vector3())); } return toScreen(S.J[n]); };
  for (const [n, p] of JOINTS) { if (!p) continue; const a = at(p), b = at(n); g2.lineWidth = 4; g2.strokeStyle = 'rgba(0,0,0,.55)'; g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(b[0], b[1]); g2.stroke(); g2.lineWidth = 2; g2.strokeStyle = n.startsWith('Left') ? '#60a5fa' : n.startsWith('Right') ? '#34d399' : '#fde047'; g2.stroke(); }
  for (const [n] of JOINTS) { const a = at(n), end = /_End$/.test(n); g2.beginPath(); g2.arc(a[0], a[1], n === S.sel ? 8 : end ? 4 : 6, 0, 7); g2.fillStyle = n === S.sel ? '#fb7185' : end ? '#c4b5fd' : '#fff'; g2.fill(); g2.lineWidth = 1.5; g2.strokeStyle = '#1b1233'; g2.stroke(); }
  if (S.sel) { const a = at(S.sel); g2.font = '600 13px system-ui, sans-serif'; g2.fillStyle = '#fff'; g2.strokeStyle = '#000'; g2.lineWidth = 3; g2.strokeText(S.sel, a[0] + 11, a[1] - 9); g2.fillText(S.sel, a[0] + 11, a[1] - 9); }
  if (S.ink && S.ink.length > 1) { g2.lineWidth = 4; g2.strokeStyle = '#f472b6'; g2.beginPath(); g2.moveTo(S.ink[0][0], S.ink[0][1]); for (const p of S.ink) g2.lineTo(p[0], p[1]); g2.stroke(); } }
const pick = (x, y) => { let best = '', bd = 18; for (const [n] of JOINTS) { const a = toScreen(S.J[n]), d = Math.hypot(a[0] - x, a[1] - y); if (d < bd) { bd = d; best = n; } } return best; };
const xy = e => { const r = overlay.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
overlay.addEventListener('pointerdown', e => { if (!S.J.Hips) return; const [x, y] = xy(e); try { overlay.setPointerCapture(e.pointerId); } catch {} if (S.skinned && S.pose) { tryPose.reset(); }
  if (S.tool === 'draw' && e.button === 0) { S.ink = [[x, y]]; return; } const n = e.button === 0 ? pick(x, y) : ''; if (n) { S.sel = n; S.grab = { n, off: S.J[n].clone().sub(fromScreen(x, y)) }; } else S.grab = { pan: [x, y] }; });
overlay.addEventListener('pointermove', e => { const [x, y] = xy(e); if (S.ink) return void S.ink.push([x, y]); const g = S.grab; if (!g) return;
  if (g.n) { const w = fromScreen(x, y).add(g.off), to = S.J[g.n].clone(); if (S.view === 'side') { to.z = w.z; to.y = w.y; } else if (S.view === 'front') { to.x = w.x; to.y = w.y; } else to.copy(w).add(S.J[g.n].clone().sub(w).projectOnVector(camera.getWorldDirection(new THREE.Vector3()))); moveJoint(g.n, to, false); }
  else { const dx = x - g.pan[0], dy = y - g.pan[1]; g.pan = [x, y]; if (S.view === 'free' && !e.shiftKey && e.buttons !== 4) { S.yaw -= dx * 0.008; S.pitch = Math.max(-1.4, Math.min(1.4, S.pitch + dy * 0.008)); } else { const k = (camera.top - camera.bottom) / overlay.height; S.cx -= dx * k; S.cy += dy * k; } } });
const lift = () => { if (S.ink) { const L = S.ink; S.ink = null; drawChain(S.chain, L); } else if (S.grab && S.grab.n) moveJoint(S.grab.n, S.J[S.grab.n].clone(), true); S.grab = null; };
overlay.addEventListener('pointerup', lift); overlay.addEventListener('pointercancel', lift); overlay.addEventListener('contextmenu', e => e.preventDefault());
overlay.addEventListener('wheel', e => { e.preventDefault(); S.zoom = Math.max(0.4, Math.min(12, S.zoom * Math.exp(-e.deltaY * 0.0015))); }, { passive: false });
tryPose.reset = () => { if (!S.skinned) return; for (const [n] of JOINTS) S.skinned.boneOf[n].quaternion.copy(S.skinned.rest[n]); S.pose = 0; };

// ---------------------------------------------------------------- the buttons
$('file').onchange = e => { const f = e.target.files[0]; if (f) load(f).catch(err => say('Could not load: ' + err.message)); };
addEventListener('dragover', e => e.preventDefault()); addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) (/\.json$/i.test(f.name) ? loadSkeleton(f) : load(f).catch(err => say('Could not load: ' + err.message))); });
for (const k in PRESET) $('preset').append(new Option(PRESET[k].label, k)); $('preset').onchange = () => preset($('preset').value);
for (const k in CHAINS) $('chain').append(new Option(k, k)); $('chain').value = S.chain; $('chain').onchange = () => { S.chain = $('chain').value; setTool('draw'); };
const setView = v => { S.view = v; for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === v); say(v === 'front' ? 'Front: joints move across the picture only. Their depth stays where it is.' : v === 'side' ? 'Side: joints move forward, back, up and down only.' : 'Free look: drag to turn the view. Joints move flat to the screen.'); };
const setTool = t => { S.tool = t; $('toolMove').classList.toggle('on', t === 'move'); $('toolDraw').classList.toggle('on', t === 'draw'); };
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => setView(b.dataset.view); $('toolMove').onclick = () => setTool('move'); $('toolDraw').onclick = () => setTool('draw');
$('mirror').onchange = () => { S.mirror = $('mirror').checked; }; $('carry').onchange = () => { S.carry = $('carry').checked; };
$('turnL').onclick = () => turn(90); $('flip').onclick = () => turn(180); $('refit').onclick = () => preset($('preset').value);
$('centreBtn').onclick = () => { if (!S.sel) return say('Tap a joint first.'); const ok = centre(S.sel, S.view === 'side' ? 'x' : 'z'); const m = S.mirror && mirrorOf(S.sel); if (m) centre(m, S.view === 'side' ? 'x' : 'z'); unskin(); say(ok ? 'Centred in the body.' : 'That joint is not inside the model there.'); };
$('attach').onclick = () => setTimeout(attach, 30); $('try').onclick = () => setTimeout(tryPose, 30); $('save').onclick = () => setTimeout(save, 30); $('saveSk').onclick = saveSkeleton; $('loadSk').onchange = e => { const f = e.target.files[0]; if (f) loadSkeleton(f); };
window.RIG = { S, load, preset, attach, tryPose, save, skin, centre, moveJoint, drawChain, toScreen, setView, JOINTS };   // for tests and the curious
setView('front'); setTool('move'); preset('real'); frame(); say('Load a model (.glb) to begin, or drop one on the page.');
