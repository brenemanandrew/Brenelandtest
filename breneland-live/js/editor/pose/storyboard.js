// The storyboard side of the Pose Editor (pose-draw, Andrew 2026-11-10: "Any other ease of use that this might enable"):
//   - the pose library: a person's pose and face kept under a name with a little picture, put on anyone (mirrored if wanted);
//     kept in this browser (localStorage 'breneland.poseLibrary'), never on the server
//   - beats: the scene copied for the next frame of a strip, an in-between of two beats, and the onion skin (the beat before,
//     ghosted over the picture, never in a Shot)
//   - the contact sheet: this visit's Shots on one PNG, numbered, a note line under each
import * as THREE from 'three';

// ---------------------------------------------------------------- the pose library
export const LIB_KEY = 'breneland.poseLibrary';
const POSE_KEYS = ['preset', 'moment', 'seat', 'rot', 'hipsDy', 'ik', 'pin', 'hands', 'face', 'headW'];
export function libraryList() { try { const l = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } }
function libraryWrite(l) { try { localStorage.setItem(LIB_KEY, JSON.stringify(l)); return true; } catch { return false; } }
// a body's height for scaling hand and foot targets between people (unscaled, the root's frame)
export const bodySize = b => (b.dims ? b.dims.legLen + b.dims.waist + b.dims.torsoTop : (b.height || 1.7));
export function poseOf(body) { const o = {}; for (const k of POSE_KEYS) o[k] = JSON.parse(JSON.stringify(body.state[k] ?? null)); return o; }
export function librarySave(name, body, thumb) {
  const l = libraryList();
  const e = { id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: String(name || 'Pose ' + (l.length + 1)).slice(0, 40), size: bodySize(body), kind: body.kind, pose: poseOf(body), thumb: thumb || null };
  l.unshift(e);
  while (l.length > 48) l.pop();
  if (!libraryWrite(l)) { e.thumb = null; l[0] = e; libraryWrite(l); }
  return e;
}
export function libraryDrop(id) { libraryWrite(libraryList().filter(e => e.id !== id)); }
// lay a kept pose on a body (the hands' and feet's targets scaled to their size)
export function libraryApply(e, body) {
  const st = body.state, k = bodySize(body) / (e.size || bodySize(body));
  for (const key of POSE_KEYS) if (e.pose[key] !== undefined && e.pose[key] !== null) st[key] = JSON.parse(JSON.stringify(e.pose[key]));
  if (e.pose.face === null) st.face = null;
  const ik = {};
  for (const [c, v] of Object.entries(st.ik || {})) ik[c] = v ? { t: v.t.map(x => +(x * k).toFixed(4)), p: v.p.map(x => +(x * k).toFixed(4)) } : null;
  st.ik = { handL: null, handR: null, footL: null, footR: null, ...ik };
  if (body.kind === 'skinned') { body.sampled = null; }
}

// ---------------------------------------------------------------- beats: an in-between of two snapshots
const lerp = (a, b, t) => a + (b - a) * t;
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function lerpRot(a, b, t) {
  _qa.setFromEuler(_e.set(...(a || [0, 0, 0]), 'YXZ')); _qb.setFromEuler(_e.set(...(b || [0, 0, 0]), 'YXZ'));
  _qa.slerp(_qb, t); _e.setFromQuaternion(_qa, 'YXZ'); return [_e.x, _e.y, _e.z].map(v => +v.toFixed(5));
}
const lerpArr = (a, b, t) => a.map((v, i) => +lerp(v, b[i], t).toFixed(4));
const angLerp = (a, b, t) => { let d = b - a; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2)); return a + d * t; };
// rest IK for a chain where one side has none: the side that has one is used for both (a snap rather than a jump of the arm)
export function tweenSnap(A, B, t, restIK) {
  const out = JSON.parse(JSON.stringify(t < 0.5 ? A : B));
  out.camera = { ...A.camera }; for (const k of Object.keys(A.camera)) if (typeof A.camera[k] === 'number' && typeof B.camera?.[k] === 'number') out.camera[k] = k === 'yaw' ? angLerp(A.camera[k], B.camera[k], t) : lerp(A.camera[k], B.camera[k], t);
  out.cast = (B.cast || []).map((pb, i) => {
    const pa = A.cast?.[i];
    if (!pa || pa.who !== pb.who) return JSON.parse(JSON.stringify(pb));
    const p = JSON.parse(JSON.stringify(t < 0.5 ? pa : pb));
    p.x = +lerp(pa.x, pb.x, t).toFixed(3); p.y = +lerp(pa.y, pb.y, t).toFixed(3); p.z = +lerp(pa.z, pb.z, t).toFixed(3); p.yaw = +angLerp(pa.yaw, pb.yaw, t).toFixed(4);
    const sa = pa.pose, sb = pb.pose, s = p.pose;
    s.rot = {}; for (const id of new Set([...Object.keys(sa.rot || {}), ...Object.keys(sb.rot || {})])) s.rot[id] = lerpRot(sa.rot?.[id], sb.rot?.[id], t);
    s.hipsDy = +lerp(sa.hipsDy || 0, sb.hipsDy || 0, t).toFixed(4); s.headW = +lerp(sa.headW ?? 0.7, sb.headW ?? 0.7, t).toFixed(3);
    s.ik = {};
    for (const c of ['handL', 'handR', 'footL', 'footR']) {
      const a = sa.ik?.[c] || (sb.ik?.[c] && restIK?.(i, c)), b = sb.ik?.[c] || (sa.ik?.[c] && restIK?.(i, c));
      s.ik[c] = a && b ? { t: lerpArr(a.t, b.t, t), p: lerpArr(a.p, b.p, t) } : null;
    }
    if (sa.face || sb.face) { const fa = sa.face || {}, fb = sb.face || {}; s.face = { ...(t < 0.5 ? fa : fb) }; for (const k of ['eye', 'smile', 'open', 'brow', 'tilt', 'mw']) if (typeof fa[k] === 'number' && typeof fb[k] === 'number') s.face[k] = +lerp(fa[k], fb[k], t).toFixed(3); }
    for (const k of ['L', 'R']) { const ha = sa.hands?.[k], hb = sb.hands?.[k]; if (ha?.curl && hb?.curl) s.hands[k] = { shape: hb.shape, curl: lerpArr(ha.curl, hb.curl, t) }; }
    if (pa.sculpt || pb.sculpt) p.sculpt = t < 0.5 ? pa.sculpt : pb.sculpt;
    return p;
  });
  return out;
}

// ---------------------------------------------------------------- the onion skin: a person's drawn shape now, as one still mesh
// (the parts in the world, the one-piece arms skinned on the CPU), drawn ghosted over the picture
export function bakeShape(root) {
  const chunks = []; let n = 0;
  const v = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse(o => {
    if (!o.isMesh || o.userData.rigid || !o.geometry?.attributes.position) return;
    for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible) return;
    const g = o.geometry, P = g.attributes.position, I = g.index ? g.index.array : null, nt = I ? I.length : P.count;
    const out = new Float32Array(nt * 3), world = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(P, i);
      v.applyMatrix4(o.matrixWorld); world[i * 3] = v.x; world[i * 3 + 1] = v.y; world[i * 3 + 2] = v.z;
    }
    for (let k = 0; k < nt; k++) { const i = I ? I[k] : k; out[k * 3] = world[i * 3]; out[k * 3 + 1] = world[i * 3 + 1]; out[k * 3 + 2] = world[i * 3 + 2]; }
    chunks.push(out); n += out.length;
  });
  const all = new Float32Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
  geo.computeBoundingSphere();
  return geo;
}
const GHOST_DEPTH = new THREE.MeshBasicMaterial({ colorWrite: false });
const GHOST = new THREE.MeshBasicMaterial({ color: '#8d7bff', transparent: true, opacity: 0.32, depthWrite: false, depthFunc: THREE.LessEqualDepth, toneMapped: false });
export function ghostMesh(geo) {
  const g = new THREE.Group(); g.name = 'pose-onion';
  const a = new THREE.Mesh(geo, GHOST_DEPTH), b = new THREE.Mesh(geo, GHOST);
  a.renderOrder = -3; b.renderOrder = -2; a.frustumCulled = b.frustumCulled = false;
  g.add(a, b);
  return g;
}

// ---------------------------------------------------------------- the contact sheet
// shots: [{ blob, w, h, note, scene, name }] in strip order; -> a PNG blob
export async function contactSheet(shots, { title = 'Breneland storyboard', cols = 3 } = {}) {
  const n = shots.length; if (!n) return null;
  cols = Math.min(n <= 4 ? 4 : cols, n);
  const CW = 560, IH = 316, LH = 64, PAD = 24, TOP = 70;
  const rows = Math.ceil(n / cols), W = PAD + cols * (CW + PAD), H = TOP + rows * (IH + LH + PAD) + PAD;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff8ec'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2b2340'; g.font = '700 30px Fredoka, system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText(title, PAD, TOP / 2);
  for (let i = 0; i < n; i++) {
    const s = shots[i], col = i % cols, row = Math.floor(i / cols), x = PAD + col * (CW + PAD), y = TOP + row * (IH + LH + PAD);
    const bm = await createImageBitmap(s.blob);
    g.fillStyle = '#1c1a2e'; g.fillRect(x, y, CW, IH);
    const k = Math.min(CW / bm.width, IH / bm.height), w = bm.width * k, h = bm.height * k;
    g.drawImage(bm, x + (CW - w) / 2, y + (IH - h) / 2, w, h);
    g.lineWidth = 3; g.strokeStyle = '#2b2340'; g.strokeRect(x, y, CW, IH);
    // the frame number in a round tab, the note beside it (one line, cut with an ellipsis)
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(x + 24, y + IH + 32, 20, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#2b2340'; g.font = '700 20px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), x + 24, y + IH + 33); g.textAlign = 'left';
    g.font = '600 17px Nunito, system-ui, sans-serif';
    let note = (s.note || '').trim() || (s.scene ? s.scene : '');
    const max = CW - 60;
    if (g.measureText(note).width > max) { while (note.length > 1 && g.measureText(note + '...').width > max) note = note.slice(0, -1); note += '...'; }
    g.fillText(note, x + 54, y + IH + 33);
    g.strokeStyle = 'rgba(43,35,64,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 54, y + IH + 50); g.lineTo(x + CW, y + IH + 50); g.stroke();
  }
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
