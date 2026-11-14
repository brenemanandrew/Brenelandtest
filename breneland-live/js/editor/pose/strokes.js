// Strokes (pose-draw, Andrew 2026-11-10: "select parts and then draw with my stylus to move the part into position"): the plain
// geometry of a drawn line, on screen (pixels) or in the world (THREE.Vector3s). No scene, no DOM: draw-pose.js and the tests use it.
//   a stroke on screen: [{ x, y, p (pressure 0..1), t (ms) }]
import * as THREE from 'three';

const hyp = Math.hypot;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// screen length of a stroke (px)
export function screenLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; }
// the strength a stroke asks for: a pen's pressure (light = a nudge, firm = snap to the line); a mouse or finger: full
export function strengthOf(pts, pen) {
  if (!pen) return 1;
  const ps = pts.map(p => p.p).filter(p => p > 0).sort((a, b) => a - b);
  if (!ps.length) return 1;
  const med = ps[Math.floor(ps.length / 2)];
  return +clamp((med - 0.05) / 0.55, 0.12, 1).toFixed(3);
}
// the total turn along a stroke (radians, absolute): 0 for a straight line, about 2 pi for a circle
export function turning(pts) {
  let T = 0, prev = null;
  const step = Math.max(4, screenLength(pts) / 40);
  let last = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]; if (hyp(p.x - last.x, p.y - last.y) < step) continue;
    const a = Math.atan2(p.y - last.y, p.x - last.x);
    if (prev !== null) { let d = a - prev; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2)); T += Math.abs(d); }
    prev = a; last = p;
  }
  return T;
}
// signed turn (+ clockwise on screen, y down)
export function signedTurning(pts) {
  let T = 0, prev = null, last = pts[0];
  const step = Math.max(4, screenLength(pts) / 40);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]; if (hyp(p.x - last.x, p.y - last.y) < step) continue;
    const a = Math.atan2(p.y - last.y, p.x - last.x);
    if (prev !== null) { let d = a - prev; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2)); T += d; }
    prev = a; last = p;
  }
  return T;
}
export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
// a closed, roundish loop (a head in a stick figure, an open mouth)
export function isLoop(pts) {
  const b = bbox(pts), d = hyp(b.w, b.h);
  if (d < 12) return false;
  const gap = hyp(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return gap < d * 0.35 && b.w / Math.max(1, b.h) > 0.4 && b.w / Math.max(1, b.h) < 2.5 && turning(pts) > 4.2;
}

// ---------------------------------------------------------------- world polylines
export function arcLength(P) { let L = 0; for (let i = 1; i < P.length; i++) L += P[i].distanceTo(P[i - 1]); return L; }
// the point at a share f (0..1) of the way along by arc length
export function pointAt(P, f, out = new THREE.Vector3()) {
  const L = arcLength(P), want = clamp(f, 0, 1) * L;
  let s = 0;
  for (let i = 1; i < P.length; i++) {
    const d = P[i].distanceTo(P[i - 1]);
    if (s + d >= want && d > 0) return out.copy(P[i - 1]).lerp(P[i], (want - s) / d);
    s += d;
  }
  return out.copy(P[P.length - 1]);
}
// where a curve bends most away from its chord: { at (Vector3), off (m), share (of the chord's length) }
export function bendPoint(P) {
  const a = P[0], b = P[P.length - 1], ab = new THREE.Vector3().subVectors(b, a), L = ab.length();
  let best = null, bd = -1;
  const t = new THREE.Vector3(), q = new THREE.Vector3();
  for (const p of P) {
    const s = L > 1e-6 ? clamp(t.subVectors(p, a).dot(ab) / (L * L), 0, 1) : 0;
    q.copy(a).addScaledVector(ab, s);
    const d = p.distanceTo(q);
    if (d > bd) { bd = d; best = p; }
  }
  return { at: best.clone(), off: bd, share: L > 1e-6 ? bd / L : 0 };
}
// the plane a body's stroke is read on: of the body's own planes (facing, side, ground) through `anchor`, the one most square to
// the camera, so a stroke drawn from the front bends in the facing plane, from the side in the side plane
const _f = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
export function bodyPlane(yaw, camDir, anchor, out = new THREE.Plane()) {
  _f.set(Math.sin(yaw), 0, Math.cos(yaw)); _s.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const c = [[_f, Math.abs(camDir.dot(_f))], [_s, Math.abs(camDir.dot(_s))], [_u, Math.abs(camDir.dot(_u)) * 0.8]];
  c.sort((x, y) => y[1] - x[1]);
  return out.setFromNormalAndCoplanarPoint(c[0][0], anchor);
}

// ---------------------------------------------------------------- the stick figure (quick sketch): strokes -> parts, on screen
// head: the loop; spine: the stroke with an end nearest the head; limbs: the rest, each read from its end nearest the spine, arms
// from the spine's upper half, legs from its lower half. Sides: the figure faces the camera, so the person's left is screen right.
export function readStickFigure(strokes) {
  const S = strokes.filter(s => s.length >= 2);
  const loops = S.filter(isLoop);
  if (!loops.length) return null;
  const head = loops.sort((a, b) => bbox(b).w * bbox(b).h - bbox(a).w * bbox(a).h)[0];
  const hb = bbox(head), hc = { x: hb.cx, y: hb.cy }, hr = Math.max(hb.w, hb.h) / 2;
  const rest = S.filter(s => s !== head);
  let spine = null, sd = Infinity;
  for (const s of rest) {
    const a = s[0], b = s[s.length - 1], d = Math.min(hyp(a.x - hc.x, a.y - hc.y), hyp(b.x - hc.x, b.y - hc.y)) - screenLength(s) * 0.15;
    if (d < sd) { sd = d; spine = s; }
  }
  if (!spine || sd > hr * 3) return null;
  { const a = spine[0], b = spine[spine.length - 1]; if (hyp(a.x - hc.x, a.y - hc.y) < hyp(b.x - hc.x, b.y - hc.y)) spine = spine.slice().reverse(); } // (bottom first)
  const sTop = spine[spine.length - 1], sBot = spine[0], sLen = hyp(sTop.x - sBot.x, sTop.y - sBot.y) || 1;
  const along = p => clamp(((p.x - sBot.x) * (sTop.x - sBot.x) + (p.y - sBot.y) * (sTop.y - sBot.y)) / (sLen * sLen), 0, 1);
  const distSpine = p => { const f = along(p), x = sBot.x + (sTop.x - sBot.x) * f, y = sBot.y + (sTop.y - sBot.y) * f; return hyp(p.x - x, p.y - y); };
  const arms = [], legs = [];
  for (const s of rest) {
    if (s === spine) continue;
    let l = s; if (distSpine(l[l.length - 1]) < distSpine(l[0])) l = l.slice().reverse(); // (from the body out)
    (along(l[0]) > 0.45 ? arms : legs).push(l);
  }
  const sides = (list, L, R) => {
    const out = {};
    const tip = l => l[l.length - 1].x - (sBot.x + (sTop.x - sBot.x) * along(l[0]));
    list.sort((a, b) => tip(b) - tip(a)); // screen right first = the person's left
    if (list.length >= 2) { out[L] = list[0]; out[R] = list[list.length - 1]; }
    else if (list.length === 1) out[tip(list[0]) > 0 ? L : R] = list[0];
    return out;
  };
  return { head: { c: hc, r: hr }, spine, ...sides(arms, 'handL', 'handR'), ...sides(legs, 'footL', 'footR') };
}
