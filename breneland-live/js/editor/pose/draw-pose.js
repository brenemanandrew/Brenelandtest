// Draw to pose (pose-draw, Andrew 2026-11-10: "select parts and then draw with my stylus to move the part into position").
// A stroke on the picture becomes a pose:
//   a limb (arm or leg)    from the shoulder or hip to where the wrist or ankle goes: the chain fitted to the line (the end on its
//                          end, the elbow or knee bending where the line bends), solved in 3D on the body's plane most square to the
//                          camera, through the joint the stroke starts from (two-bone IK: the pink cubes and blue cones follow)
//   the spine / the head   a line of action: the chest, neck and head (or just the neck and head) curve along it
//   the whole body         a line of action from the feet: the body leans to it, then the spine curves along it
//   a short flick          from a hand or foot: it points that way
//   from the eyes out      the look: at the person, the thing or the place the stroke ends on
//   inside the face        a mouth curve (smile or frown, a loop opens it) or a brow line (up, cross, worried)
//   the fingers            a straight line opens the hand, a curling line curls it
// With nothing chosen, the part is the one the stroke starts on. A pen's pressure is how strongly it follows (light: a nudge,
// firm: right onto the line); a mouse or a finger follows fully. Every stroke is one undo step.
//
// Also here: the quick sketch (a stick figure on the ground -> a person placed and posed to match), framing the shot by drawing a
// rectangle, and aiming the key light by drawing from where the light comes to what it lights.
import * as THREE from 'three';
import { chainJoints, FACES } from './posable.js';
import { strengthOf, screenLength, turning, signedTurning, bbox, isLoop, bendPoint, pointAt, arcLength, bodyPlane, readStickFigure, clamp } from './strokes.js';

// the parts a stroke can move, and which joint dots belong to which
export const PARTS = [
  ['auto', 'Whatever I start on'], ['armL', 'Left arm'], ['armR', 'Right arm'], ['legL', 'Left leg'], ['legR', 'Right leg'],
  ['spine', 'Spine'], ['head', 'Neck and head'], ['body', 'Whole body'], ['fingersL', 'Left fingers'], ['fingersR', 'Right fingers'], ['eyes', 'Eyes'], ['face', 'Face'],
];
const CHAIN_OF_PART = { armL: 'handL', armR: 'handR', legL: 'footL', legR: 'footR' };
const PART_OF_JOINT = { body: 'body', hips: 'spine', chest: 'spine', neck: 'head', head: 'head', shoulderL: 'armL', elbowL: 'armL', wristL: 'armL',
  shoulderR: 'armR', elbowR: 'armR', wristR: 'armR', hipL: 'legL', kneeL: 'legL', ankleL: 'legL', hipR: 'legR', kneeR: 'legR', ankleR: 'legR' };
export const partOfJoint = id => PART_OF_JOINT[id] || null;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _id = new THREE.Quaternion();

export function createDraw(env) {
  const { camera } = env;
  const wp = o => o.getWorldPosition(new THREE.Vector3());
  const camDir = () => camera.getWorldDirection(new THREE.Vector3());
  // a stroke's points in the world, on a plane
  function onPlane(pts, plane) {
    const out = [];
    for (const p of pts) { const r = env.rayAt(p.x, p.y), h = new THREE.Vector3(); if (r.intersectPlane(plane, h)) out.push(h); }
    return out;
  }
  // the screen circle of a person's head
  function headCircle(c) {
    const b = c.body, s = c.body.scale || 1;
    let at;
    if (b.h) at = wp(b.h.headC);
    else { const hd = b.jointObject('head'); if (!hd) return null; at = wp(hd).add(_v.set(0, 0.1 * s, 0)); }
    const sc = env.toScreen(at), right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const e = env.toScreen(at.clone().addScaledVector(right, 0.24 * s * (b.h?.opts?.headSize || 1)));
    return { at, x: sc.x, y: sc.y, r: Math.max(8, Math.hypot(e.x - sc.x, e.y - sc.y)) };
  }
  // ---- turning a joint by a world rotation, kept as its offset (posable.js lays offsets over the body's own pose)
  function addWorldTurn(c, id, qW) {
    const o = c.body.jointObject(id); if (!o) return;
    const st = c.body.state, r = st.rot[id] || [0, 0, 0];
    const off = new THREE.Quaternion().setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ'));
    o.updateWorldMatrix(true, false);
    o.parent.getWorldQuaternion(_qp);
    const nl = _qp.clone().invert().multiply(qW).multiply(_qp).multiply(o.quaternion);
    const qb = o.quaternion.clone().multiply(off.clone().invert());
    const offN = qb.invert().multiply(nl);
    _e.setFromQuaternion(offN, 'YXZ');
    const v = [_e.x, _e.y, _e.z].map(x => +x.toFixed(5));
    if (Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) < 1e-5) delete st.rot[id]; else st.rot[id] = v;
    o.quaternion.copy(nl); o.updateWorldMatrix(false, true);
  }
  const turnTo = (from, to, k) => _q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize()).slerp(_id, 1 - k).clone();

  // ---------------------------------------------------------------- a limb fitted to a stroke
  function fitLimb(c, chain, pts, k) {
    const b = c.body, [uId, mId, eId] = chainJoints(chain), U = b.jointObject(uId), M = b.jointObject(mId), E = b.jointObject(eId);
    if (!U || !M || !E) return false;
    const pU = wp(U), pE = wp(E);
    // read from the shoulder (or hip): the end of the stroke nearer it on screen is the start
    const sU = env.toScreen(pU);
    if (Math.hypot(pts[pts.length - 1].x - sU.x, pts[pts.length - 1].y - sU.y) < Math.hypot(pts[0].x - sU.x, pts[0].y - sU.y)) pts = pts.slice().reverse();
    const plane = bodyPlane(c.yaw, camDir(), pU);
    let P = onPlane(pts, plane);
    if (P.length < 2) return false;
    const shift = pU.clone().sub(P[0]); P = P.map(p => p.add(shift)); // (the stroke starts at the joint, wherever it began)
    const end = P[P.length - 1];
    // the bend: where the line leaves its chord most; a near-straight line keeps the joint's bend as it is
    const bp = bendPoint(P), st = b.state;
    let pole;
    if (bp.share > 0.06) { const ch = new THREE.Line3(pU, end), on = ch.closestPointToPoint(bp.at, true, new THREE.Vector3()); pole = bp.at.clone().add(bp.at.clone().sub(on).normalize().multiplyScalar(0.4)); }
    else { const cur = st.ik[chain] || env.presetIK(c, chain) || b.restIK(chain); pole = new THREE.Vector3(...cur.p).applyMatrix4(b.root.matrixWorld); }
    const t = pE.clone().lerp(end, k);
    const curIK = st.ik[chain] || env.presetIK(c, chain) || b.restIK(chain), p0 = new THREE.Vector3(...curIK.p).applyMatrix4(b.root.matrixWorld);
    env.setIK(c, chain, t, p0.lerp(pole, k));
    if (chain.startsWith('foot') && st.pin[chain]) st.pin[chain] = false; // (drawn off the floor: no longer pinned)
    return { chain, end: end.toArray(), bend: bp.at.toArray() };
  }
  // ---- a flick from a hand or foot: point it that way
  function flick(c, chain, pts, k) {
    const b = c.body, eId = chainJoints(chain)[2], E = b.jointObject(eId); if (!E) return false;
    const plane = bodyPlane(c.yaw, camDir(), wp(E)), P = onPlane([pts[0], pts[pts.length - 1]], plane);
    if (P.length < 2) return false;
    const want = P[1].clone().sub(P[0]); if (want.lengthSq() < 1e-8) return false;
    E.updateWorldMatrix(true, false);
    const foot = chain.startsWith('foot'), q = E.getWorldQuaternion(new THREE.Quaternion());
    const now = (foot ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, -1, 0)).applyQuaternion(q);
    if (b.kind === 'skinned') now.set(0, 1, 0).applyQuaternion(q); // (MPFB bones point along their own y)
    addWorldTurn(c, eId, turnTo(now, want, k));
    return { chain, flick: true };
  }
  // ---- a line of action: the points along the body (the anchor, the joints, the head's top), and the joints turned so each bone
  // lies along the curve's chord over its share of the body's length. names: the points; turn: joint id -> its point's index
  const LINES = {
    hips: { names: ['hips', 'chest', 'neck', 'head', 'top'], turn: { chest: 1, neck: 2, head: 3 } },
    neck: { names: ['neck', 'head', 'top'], turn: { neck: 0, head: 1 } },
    root: { names: ['root', 'hips', 'chest', 'neck', 'head', 'top'], turn: { body: 0, chest: 2, neck: 3, head: 4 } },
  };
  function lineOfAction(c, anchorId, pts, k) {
    const b = c.body, L0 = LINES[anchorId], head = b.jointObject('head'), neck = b.jointObject('neck');
    if (!head || !neck || Object.keys(L0.turn).some(id => !b.jointObject(id))) return false;
    const hp = wp(head), up = hp.clone().sub(wp(neck)).normalize();
    const topLocal = head.worldToLocal(hp.clone().addScaledVector(up, 0.26 * (b.scale || 1)));
    const at = n => (n === 'root' ? b.root.position.clone() : n === 'top' ? head.localToWorld(topLocal.clone()) : wp(b.jointObject(n)));
    let B = L0.names.map(at);
    const anchor = B[0];
    const sA = env.toScreen(anchor);
    if (Math.hypot(pts[pts.length - 1].x - sA.x, pts[pts.length - 1].y - sA.y) < Math.hypot(pts[0].x - sA.x, pts[0].y - sA.y)) pts = pts.slice().reverse();
    let P = onPlane(pts, bodyPlane(c.yaw, camDir(), anchor));
    if (P.length < 2) return false;
    const shift = anchor.clone().sub(P[0]); P = P.map(p => p.add(shift));
    const fr = [0]; { let s = 0, L = 0; for (let i = 1; i < B.length; i++) L += B[i].distanceTo(B[i - 1]); for (let i = 1; i < B.length; i++) { s += B[i].distanceTo(B[i - 1]); fr.push(s / L); } }
    const C = fr.map(f => pointAt(P, f));
    for (const [id, bi] of Object.entries(L0.turn)) {
      B = L0.names.map(at);
      const from = B[bi + 1].clone().sub(B[bi]), to = C[bi + 1].clone().sub(C[bi]);
      if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) continue;
      addWorldTurn(c, id, turnTo(from, to, k));
    }
    return { line: anchorId, curve: P.map(p => p.toArray().map(v => +v.toFixed(3))) };
  }  // ---- the fingers: straight = open, curling = curled
  function fingers(c, side, pts, k) {
    const st = c.body.state, H = st.hands[side];
    const base = { open: [0.05, 0.05, 0.05, 0], relaxed: [1.35, 1.45, 1.55, 0.5], grip: [2.5, 2.6, 2.6, 0.5], point: [0, 2.7, 2.7, 0.6] }[H.shape] || [1.35, 1.45, 1.55, 0.5];
    const cur = H.curl || base, amt = clamp(turning(pts) / (Math.PI * 1.4), 0, 1);
    const want = [amt * 2.5, amt * 2.6, amt * 2.6, amt * 0.9];
    st.hands[side] = { shape: H.shape, curl: cur.map((v, i) => +(v + (want[i] - v) * k).toFixed(3)) };
    return { fingers: side, curl: amt };
  }
  // ---- the look: from the eyes to whatever the stroke ends on
  function gaze(c, i, pts) {
    const e = pts[pts.length - 1], who = env.pickPersonAt(e.x, e.y);
    if (who >= 0 && who !== i) c.eye = { mode: 'char', who };
    else {
      let p = env.pickWorldAt(e.x, e.y);
      if (!p) { const r = env.rayAt(e.x, e.y); p = r.at(Math.max(2, camera.position.distanceTo(c.body.root.position)), new THREE.Vector3()); }
      c.eye = { mode: 'point', p: p.toArray().map(v => +v.toFixed(3)) };
    }
    return { eye: c.eye };
  }
  // ---- the face: a mouth or a brow drawn on it
  function face(c, pts, hc, k) {
    const st = c.body.state, F = FACES.find(f => f.id === st.face?.preset)?.v || FACES.find(f => f.id === 'calm').v;
    const f = st.face ? { ...st.face } : { preset: 'calm' };
    const b = bbox(pts), cy = (b.cy - hc.y) / hc.r, set = (key, v) => { const was = f[key] ?? F[key]; f[key] = +(was + (v - was) * k).toFixed(3); };
    if (cy > 0.05) { // the mouth: below the middle of the face
      if (isLoop(pts)) { set('open', clamp(b.h / hc.r * 1.3, 0.2, 1)); set('mw', clamp(b.w / hc.r * 1.6, 0.6, 1.3)); }
      else {
        const ends = (pts[0].y + pts[pts.length - 1].y) / 2, mid = pts.reduce((m, p) => (Math.abs(p.x - b.cx) < Math.abs(m.x - b.cx) ? p : m), pts[0]).y;
        set('smile', clamp((mid - ends) / hc.r * 6, -0.6, 1.5)); set('mw', clamp(b.w / hc.r * 1.4, 0.5, 1.4)); set('open', 0);
      }
      st.face = f; return { face: 'mouth', smile: f.smile, open: f.open };
    }
    // a brow: how high over the eyes, and its slant (its inner end down: cross; up: worried)
    set('brow', clamp((-cy - 0.15) * 3, -0.5, 1));
    const a = pts[0], z = pts[pts.length - 1], left = a.x < z.x ? a : z, right = a.x < z.x ? z : a;
    let slant;
    if (b.cx < hc.x - hc.r * 0.15) slant = (right.y - left.y) / Math.max(1, b.w);      // (the brow on the screen's left: its inner end is its right)
    else if (b.cx > hc.x + hc.r * 0.15) slant = (left.y - right.y) / Math.max(1, b.w);
    else { const mid = pts.reduce((m, p) => (Math.abs(p.x - b.cx) < Math.abs(m.x - b.cx) ? p : m), pts[0]).y; slant = (mid - (a.y + z.y) / 2) / Math.max(1, b.w) * 2; } // (one line over both: a V is cross, a roof is worried)
    set('tilt', clamp(slant * 2.2, -0.6, 1));
    st.face = f; return { face: 'brow', brow: f.brow, tilt: f.tilt };
  }

  // ---------------------------------------------------------------- what a stroke starts on
  function nearestJoint(c, x, y) {
    let best = null, bd = Infinity;
    for (const j of c.body.joints) {
      if (j.id === 'body') continue;
      const o = c.body.jointObject(j.id); if (!o) continue;
      const s = env.toScreen(wp(o)), d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = j.id; }
    }
    return { id: best, d: bd };
  }
  // the person and part under the stroke's start: the chosen person first, then anyone
  function who(pts, part) {
    const p0 = pts[0], S = env.S, order = [S.sel, ...S.cast.map((_, i) => i).filter(i => i !== S.sel)].filter(i => i >= 0);
    for (const i of order) {
      const c = S.cast[i]; if (c.body.kind === 'dog') continue;
      const hc = headCircle(c);
      if (part && part !== 'auto' && i === S.sel) return { i, c, part, hc };
      if (hc && Math.hypot(p0.x - hc.x, p0.y - hc.y) < hc.r * 1.05) return { i, c, part: 'eyes', hc };
      const nj = nearestJoint(c, p0.x, p0.y), reach = Math.max(28, (hc ? hc.r : 30) * 1.1);
      if (nj.id && nj.d < reach) return { i, c, part: PART_OF_JOINT[nj.id], joint: nj.id, hc };
    }
    return null;
  }

  // ---------------------------------------------------------------- one stroke
  function stroke(pts, { pen = false } = {}) {
    if (!pts || pts.length < 2) return null;
    const S = env.S, k = strengthOf(pts, pen);
    const hit = who(pts, S.part);
    if (!hit) return null;
    const { i, c } = hit;
    if (S.sel !== i) env.select(i);
    env.sync(c);
    let part = hit.part, res = null;
    const len = screenLength(pts);
    if (part === 'eyes' || part === 'face') {
      const hc = hit.hc || headCircle(c), inside = pts.every(p => Math.hypot(p.x - hc.x, p.y - hc.y) < hc.r * 1.15);
      if (part === 'face' || (inside && len > hc.r * 0.25)) res = face(c, pts, hc, k);
      else res = gaze(c, i, pts);
    } else if (CHAIN_OF_PART[part]) {
      const chain = CHAIN_OF_PART[part], E = c.body.jointObject(chainJoints(chain)[2]), U = c.body.jointObject(chainJoints(chain)[0]);
      const sE = env.toScreen(wp(E)), sU = env.toScreen(wp(U)), limbPx = Math.hypot(sE.x - sU.x, sE.y - sU.y);
      const fromEnd = Math.hypot(pts[0].x - sE.x, pts[0].y - sE.y) < Math.hypot(pts[0].x - sU.x, pts[0].y - sU.y) && (hit.joint ? /wrist|ankle/.test(hit.joint) : true);
      if (fromEnd && len < limbPx * 0.6) res = flick(c, chain, pts, k);
      else if (fromEnd && !(S.part && S.part !== 'auto')) { // from the hand out, a long way: the hand goes where it ends, the elbow bends as it is
        const st = c.body.state, cur = st.ik[chain] || env.presetIK(c, chain) || c.body.restIK(chain);
        const plane = bodyPlane(c.yaw, camDir(), wp(E)), P = onPlane([pts[pts.length - 1]], plane);
        if (P.length) { env.setIK(c, chain, wp(E).lerp(P[0], k), new THREE.Vector3(...cur.p).applyMatrix4(c.body.root.matrixWorld)); res = { chain, moved: true }; }
      } else res = fitLimb(c, chain, pts, k);
    } else if (part === 'spine') res = lineOfAction(c, 'hips', pts, k);
    else if (part === 'head') res = lineOfAction(c, 'neck', pts, k);
    else if (part === 'body') res = lineOfAction(c, 'root', pts, k);
    else if (part === 'fingersL' || part === 'fingersR') res = fingers(c, part.slice(-1), pts, k);
    if (res) env.commit();
    return res ? { who: i, part, k, ...res } : null;
  }

  // ---------------------------------------------------------------- the quick sketch: a stick figure -> a person posed to match
  function sketch(strokes, id) {
    const fig = readStickFigure(strokes);
    if (!fig) return { ok: false, why: 'Draw a head (a circle), a spine line and the arms and legs.' };
    const sb = fig.spine[0];
    const legEnds = ['footL', 'footR'].filter(k => fig[k]).map(k => fig[k][fig[k].length - 1]);
    const footY = legEnds.length ? Math.max(...legEnds.map(p => p.y)) : sb.y + (sb.y - fig.head.c.y) * 0.9;
    const footX = legEnds.length ? legEnds.reduce((s, p) => s + p.x, 0) / legEnds.length : sb.x;
    let at = env.pickWorldAt(footX, footY);
    if (!at) { const r = env.rayAt(footX, footY), g = new THREE.Vector3(); if (!r.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -env.floor()), g)) return { ok: false, why: 'Draw the figure standing on the ground.' }; at = g; }
    const yaw = Math.atan2(camera.position.x - at.x, camera.position.z - at.z);
    const c = env.addPerson(id, [at.x, at.z, yaw]);
    if (!c) return { ok: false, why: 'Five people at most in a scene.' };
    env.sync(c);
    // the drawing laid over the body on screen: the drawn hips on the body's hips, the drawn head on its head
    const b = c.body, hips = env.toScreen(wp(b.jointObject('hips'))), hc = headCircle(c);
    const dh = Math.hypot(fig.head.c.x - sb.x, fig.head.c.y - sb.y) || 1, bh = Math.hypot(hc.x - hips.x, hc.y - hips.y);
    const s = bh / dh, map = l => l.map(p => ({ x: hips.x + (p.x - sb.x) * s, y: hips.y + (p.y - sb.y) * s, p: 1, t: p.t }));
    const top = { x: fig.head.c.x, y: fig.head.c.y - fig.head.r };
    lineOfAction(c, 'hips', map([...fig.spine, top]), 1);
    env.sync(c, true);
    for (const k of ['handL', 'handR', 'footL', 'footR']) if (fig[k]) { fitLimb(c, k, map(fig[k]), 1); env.sync(c, true); }
    env.commit();
    return { ok: true, at: at.toArray(), parts: Object.keys(fig).filter(k => fig[k]) };
  }

  // ---------------------------------------------------------------- framing by drawing a rectangle
  function frame(pts) {
    const b = bbox(pts), vw = env.view().w, vh = env.view().h;
    if (b.w < 24 || b.h < 24) return null;
    const C = env.S.cam;
    let P = null;
    const who = env.pickPersonAt(b.cx, b.cy);
    if (who >= 0) { const o = env.S.cast[who]; P = o.body.root.position.clone(); P.y += Math.min(1.2, (b.h / vh) * 2) * (o.body.scale || 1); }
    if (!P) P = env.pickWorldAt(b.cx, b.cy);
    const r = env.rayAt(b.cx, b.cy);
    if (!P) P = r.at(C.dist, new THREE.Vector3());
    const d = camera.position.distanceTo(P), fill = Math.max(b.h / vh, b.w / vw);
    env.setCam({ tx: P.x, ty: P.y, tz: P.z, dist: Math.max(0.4, d * fill) });
    env.commit();
    return { at: P.toArray(), dist: env.S.cam.dist };
  }
  // ---------------------------------------------------------------- aiming the key light: from where it comes to what it lights
  function aimLight(pts) {
    const a = pts[0], z = pts[pts.length - 1];
    if (Math.hypot(a.x - z.x, a.y - z.y) < 20) return null;
    let E = env.pickWorldAt(z.x, z.y); const rz = env.rayAt(z.x, z.y);
    if (!E) E = rz.at(8, new THREE.Vector3());
    let A = env.pickWorldAt(a.x, a.y);
    if (!A || A.distanceTo(E) < 0.3) { const ra = env.rayAt(a.x, a.y); A = ra.at(camera.position.distanceTo(E) * 1.4, new THREE.Vector3()); }
    const from = A.clone().sub(E).normalize();
    let el = Math.asin(clamp(from.y, -1, 1)) * 180 / Math.PI;
    el = clamp(el < 6 ? 6 + Math.abs(el) * 0.3 : el, 4, 88);
    const az = ((Math.atan2(from.x, -from.z) * 180 / Math.PI) + 360) % 360;
    env.light({ key: { follow: false, az: +az.toFixed(1), el: +el.toFixed(1) } });
    env.commit();
    return { az, el };
  }
  void signedTurning; void arcLength;
  return { stroke, sketch, frame, aimLight, headCircle, addWorldTurn, fitLimb, lineOfAction };
}
