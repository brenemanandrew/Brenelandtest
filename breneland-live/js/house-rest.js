// Sit on our couches and lie in our beds (Andrew, 2026-11-07). The living room's sofa (three cushions) and loveseat (two), and the
// three bedrooms' beds (the queen and the full have two sides, the twin one): walk up, E "Sit on the sofa" / "Lie down", and E
// or a nudge on the stick (or Space) gets you up. Who is where is the server's (lib/house-rest.js), so two players never take
// one spot and a late joiner sees everyone in their places. The spots are house-rest-spots.js.
//
// The main bedroom's bed keeps its log-off (main-house.js): from its west side, where you wake up, E is still "Go to bed (log
// off)"; from its foot or its east side E is "Lie down".
//
// The snuggle: when Andrew (the owner, as the server knows him) and a player named Whitney sit on the same couch, the server
// seats them on two neighbouring cushions and stamps the pair; both slide in close, she leans her head on his shoulder and his
// arm goes round her, and a small heart rises over them once. On a bed they lie side by side, turned a little toward each other.
// Everyone sees it: the pose is bodies-poses.js snuggle / lie, driven here by params.snug for your own body and every remote.
//
// Seated or lying, a camera of its own: across the room looking at you on the couch (drag to look round a little), or from
// beside the bed. camera-view (Andrew 2026-11-07: "VERY hard to see when you are sitting or laying down"): that camera is FITTED
// to the pose: it pulls back and up as far as it takes to hold your whole body (and a snuggle partner's) with a margin, on this
// screen's shape (an upright phone looks along the bed, a wide screen from its side), aimed at the middle of the bodies; it stays
// under the ceiling, in your room (on a narrow screen the view widens a little rather than leave it), and only past that may it
// stand just behind a wall in the next room (camera-fade.js fades the wall between). Drag to turn it round you a little. A remote sitter is drawn by their own position (they move themselves to the spot) with the seat's height and
// facing from the spot the server says is theirs; a remote lier's lying-down blend (lieK) is read from how far they are along
// the way from the bedside to the bed.
import * as THREE from 'three';
import { REST_SPOTS, REST_FLOOR, SNUG_IN, SNUG_IN_BED, SEAT_FRONT, KNEE_PAST, SIT_V, restSpot, spotsOf } from './house-rest-spots.js';
import { HOUSE_PLAN } from './layout.js';
import { ANIM_CODES } from './codes.js';
import { fitDist, heightShare, centreOff } from './camera-fit.js';

const LIE_T = 0.75, RISE_T = 0.55;   // s to lie down, to get up
// the fitted camera: candidates round the bodies (yaw steps x pitches), the share of the half picture the bodies may fill, the
// pad round each body point, the nearest it comes, the margins from walls and the ceiling. The view widens (fovs, vertical
// degrees) when nothing in your room frames you at the game's own (an upright phone sees a narrow slice across: a bed is wider
// than that from any corner of our small bedrooms); only past the widest does it look in from the next room, with the wall
// between within `through` m of the camera (camera-fade.js fades what is that near the lens)
const FIT = { yaws: 24, pitches: [0.25, 0.4, 0.55, 0.7, 0.9, 1.1], fill: 0.8, pad: 0.15, dMin: { couch: 2.9, bed: 2.4, bedTall: 2.0 }, big: 1.5, bigCap: 0.4, bigCapTall: 0.6, wall: 0.24, ceil: 0.25, through: 0.95, pitch0: 0.65, stick: 0.3, fovs: [0, 64, 74, 84], fovEase: 3 };
const PRIO = 5;                      // over an NPC's hello (a dog by the sofa)
const COUCH_R = 1.0, BED_R = 0.75;   // m from a cushion's front, from a bed's edge
const camRooms = HOUSE_PLAN.rooms.filter(r => r.id !== 'garage');
const roomOf = (x, z) => camRooms.find(r => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) || null;

// house-scale: how far forward of the spot (SIT_V) this body's hips sit, so its knees bend at the cushions' front edge (the back of
// the knee on it, KNEE_PAST) whatever the length of its thighs; never further back than the back cushions allow
export function sitFit(ch) {
  const D = ch.dims, s = ch.root.scale.y || 1;
  return Math.max(-0.08, Math.min(0.08, SEAT_FRONT + KNEE_PAST * s - D.Lt * s - SIT_V));
}

// how far a lying person's head (its middle) is from their feet, metres (the body's own numbers: tools/house-rest-test.mjs measures it)
export function lieReach(ch) {
  const D = ch.dims, s = ch.root.scale.y || 1;
  return (D.legLen + D.waist + D.torsoTop + D.neckY + D.headY * 0.2) * s;
}

export function createHouseRest(ctx) {
  const { player, net, remotes, ui, audio, camera, scene } = ctx;
  if (!ctx.house?.inside) return null;
  // ---- the server's word: spot id -> sid, sid -> spot id, the pairs
  let at = new Map(), bySid = new Map(), snug = [];
  const snugK = new Map();               // sid -> 0..1, eased toward 1 while in a pair
  const touched = new Set();             // remote sids whose params we set
  let mine = null, phase = null, phaseT = 0, satAt = 0, pending = null, from = null, resent = -10, strayAt = 0;
  const pairOf = sid => snug.find(p => p.a === sid || p.w === sid) || null;
  const partnerOf = sid => { const p = pairOf(sid); return p ? (p.a === sid ? p.w : p.a) : null; };
  const me = () => net.sid;

  // where a spot's person goes: the cushion or pillow, slid toward a snuggling partner
  const _p = { x: 0, z: 0 };
  function spotPos(spot, sid, out = _p) {
    out.x = spot.x; out.z = spot.z;
    const o = partnerOf(sid), os = o !== null ? restSpot(bySid.get(o)) : null, k = snugK.get(sid) || 0;
    if (os && os.furn === spot.furn && k > 0) {
      const dx = os.x - spot.x, dz = os.z - spot.z, d = Math.hypot(dx, dz) || 1, IN = spot.kind === 'bed' ? SNUG_IN_BED : SNUG_IN;
      out.x += dx / d * IN * k; out.z += dz / d * IN * k;
    }
    return out;
  }
  // a lier's root: at the feet, the head on the pillow
  function lieRoot(spot, sid, ch, out) {
    spotPos(spot, sid, out);
    const r = lieReach(ch);
    out.x += Math.sin(spot.yaw) * r; out.z += Math.cos(spot.yaw) * r;
    return out;
  }
  // params.snug for a person on a spot (null when not in a pair). For the one whose arm goes round (role 'arm'), `at` is the
  // partner's far shoulder in this person's root frame, read off the partner's body as drawn (a frame behind is fine): bodies-poses
  // snuggle drapes the hand over it by IK, whatever the two sizes (bodies-fix).
  const bodies = new Map(); // sid -> the Human drawn for it (the local player and the remotes), as seen this frame
  const _sh = new THREE.Vector3();
  function snugFor(spot, sid, ch) {
    const p = pairOf(sid), k = snugK.get(sid) || 0;
    const prev = ch.params.snug;
    bodies.set(sid, ch);
    if (!p || k <= 0.001) return null;
    const psid = p.a === sid ? p.w : p.a, os = restSpot(bySid.get(psid));
    if (!os) return null;
    const lx = Math.cos(spot.yaw), lz = -Math.sin(spot.yaw); // the root's +x (its left) in the world
    const side = (os.x - spot.x) * lx + (os.z - spot.z) * lz >= 0 ? 1 : -1, role = p.a === sid ? 'arm' : 'head';
    const out = prev && prev.side === side && prev.role === role ? prev : { side, role, k, at: null };
    out.k = k;
    const pch = role === 'arm' && spot.kind === 'couch' ? bodies.get(psid) : null;
    if (pch && pch.root.visible && pch.armL) {
      (side > 0 ? pch.armL : pch.armR).shoulder.getWorldPosition(_sh); // her far shoulder (we face the same way: her left when she is on my left)
      _sh.y += pch.dims.armR * 1.2 * (pch.root.scale.y || 1);          // ...the top of its cap
      ch.root.worldToLocal(_sh);
      if (!out.at) out.at = [0, 0, 0];
      out.at[0] = _sh.x; out.at[1] = _sh.y; out.at[2] = _sh.z;
    } else out.at = null;
    return out;
  }
  const scaleOf = ch => ch.root.scale.y || 1;
  function setParams(ch, spot, sid, lieK) {
    const P = ch.params;
    if (spot.kind === 'couch') { P.seatY = spot.top / scaleOf(ch); P.lieY = 0; P.lieK = 0; }
    else { P.seatY = 0; P.lieY = spot.top / scaleOf(ch); P.lieK = lieK; }
    P.snug = snugFor(spot, sid, ch);
  }
  const clearParams = ch => { const P = ch.params; P.seatY = 0; P.lieY = 0; P.lieK = 0; P.snug = null; };

  // ---- the heart over a new pair, once
  const heart = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.42); s.bezierCurveTo(-0.15, -0.28, -0.5, -0.05, -0.5, 0.18); s.bezierCurveTo(-0.5, 0.42, -0.2, 0.5, 0, 0.3);
    s.bezierCurveTo(0.2, 0.5, 0.5, 0.42, 0.5, 0.18); s.bezierCurveTo(0.5, -0.05, 0.15, -0.28, 0, -0.42);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -0.06);
    const mat = new THREE.MeshBasicMaterial({ color: '#ff5d8f', transparent: true, depthWrite: false });
    const m = new THREE.Mesh(geo, mat); m.name = 'house-rest-heart'; m.visible = false; m.renderOrder = 5; m.frustumCulled = false;
    scene.add(m);
    return { m, t: -1, x: 0, y: 0, z: 0, n: 0 };
  })();
  const seenPairs = new Set();
  function heartFor(p) {
    const a = restSpot(bySid.get(p.a)), w = restSpot(bySid.get(p.w));
    if (!a || !w) return;
    heart.x = (a.x + w.x) / 2; heart.z = (a.z + w.z) / 2;
    heart.y = REST_FLOOR + (a.kind === 'bed' ? a.top + 0.9 : a.top + 1.4);
    if (a.kind === 'bed') { const r = 0.25; heart.x += Math.sin(a.yaw) * r; heart.z += Math.cos(a.yaw) * r; }
    heart.t = 0; heart.m.visible = true; heart.n++;
  }
  function stepHeart(dt) {
    if (heart.t < 0) return;
    heart.t += dt;
    const t = heart.t, D = 2.6;
    if (t > D) { heart.t = -1; heart.m.visible = false; return; }
    const pop = Math.min(1, t / 0.3), s = 0.24 * (pop < 1 ? pop * (1.25 - 0.25 * pop) : 1 + 0.05 * Math.sin(t * 9) * Math.max(0, 1 - t));
    heart.m.scale.setScalar(s);
    heart.m.position.set(heart.x, heart.y + t * 0.16, heart.z);
    heart.m.quaternion.copy(camera.quaternion);
    heart.m.material.opacity = t > D - 0.8 ? (D - t) / 0.8 : 1;
  }

  // ---- the server's messages
  net.on('rest', m => {
    at = new Map(); bySid = new Map();
    for (const [sid, id] of m.at || []) { if (!restSpot(id)) continue; at.set(id, sid); bySid.set(sid, id); }
    const was = snug; snug = (m.snug || []).filter(p => bySid.has(p.a) && bySid.has(p.w));
    for (const p of snug) { const key = p.a + ':' + p.w + ':' + p.f; if (!seenPairs.has(key)) { seenPairs.add(key); heartFor(p); } }
    for (const p of was) if (!snug.some(q => q.a === p.a && q.w === p.w && q.f === p.f)) seenPairs.delete(p.a + ':' + p.w + ':' + p.f);
    const mineNow = bySid.get(me());
    if (pending) {
      if (m.refused === pending.id) { pending = null; ui.toast('Someone is already there.', 1800); audio.ui?.('blip'); }
      else if (mineNow) { const s = restSpot(mineNow); pending = null; if (s) begin(s); }
      return;
    }
    // (on joining the state comes before the welcome, with no sid of ours yet: the welcome asks again for a spot we were on)
    if (mine && phase !== 'up' && net.status === 'online') {
      if (mineNow && mineNow !== mine.id) { const s = restSpot(mineNow); if (s && s.kind === mine.kind) mine = s; } // (moved over to snuggle)
      else if (!mineNow && performance.now() / 1000 - resent > 2) stand();
    }
  });
  net.on('welcome', () => { if (mine && phase !== 'up') { resent = performance.now() / 1000; net.send({ t: 'rest', op: 'take', spot: mine.id }); } }); // (a reconnect: the server forgot us)

  // ---- sitting and lying, your own
  const camP = new THREE.Vector3(), camL = new THREE.Vector3(), wantP = new THREE.Vector3(), wantL = new THREE.Vector3();
  let orbit = 0;
  const _r = { x: 0, z: 0 };
  // ---- the fitted camera: the bodies' points (head, hands, hips, knees, ankles: yours and a snuggle partner's), the solve
  const PTS = new Float64Array(2 * 16 * 3), _w = new THREE.Vector3();
  // a head's size (its hair and hat too), measured once per body: a big-headed look's face went off the edge of the picture
  const headR = new WeakMap(), _hb = new THREE.Box3(), _hs = new THREE.Sphere();
  const headSize = ch => { let r = headR.get(ch); if (r === undefined) { _hb.setFromObject(ch.head); r = _hb.isEmpty() ? 0.3 : Math.min(0.6, _hb.getBoundingSphere(_hs).radius); headR.set(ch, r); } return r; };
  let nPts = 0, fitI = -1;
  const fit = { tx: 0, ty: 0, tz: 0, x: 0, y: 0, z: 0, d: 0, yaw: 0, pitch: 0, share: 0, through: false, ok: false, fov: 0, n: 0, out: { house: 0, room: 0, ceil: 0, wall: 0 } };
  function bodyPts(ch) {
    if (!ch?.headC) return;
    const add = o => { if (!o || nPts >= 32) return; o.getWorldPosition(_w); PTS[nPts * 3] = _w.x; PTS[nPts * 3 + 1] = _w.y; PTS[nPts * 3 + 2] = _w.z; nPts++; };
    ch.root.updateMatrixWorld(true);
    add(ch.headC); PTS[(nPts - 1) * 3 + 1] += 0.18 * (ch.root.scale.y || 1); // (the top of the head, a hat's worth)
    { // the head's sphere round its middle, four ways (the pad covers the rest)
      const r = Math.max(0, headSize(ch) - FIT.pad), i = nPts - 1, hx = PTS[i * 3], hy = PTS[i * 3 + 1] - 0.18 * (ch.root.scale.y || 1), hz = PTS[i * 3 + 2];
      for (const [dx, dy, dz] of [[r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r]]) { if (nPts >= 32) break; PTS[nPts * 3] = hx + dx; PTS[nPts * 3 + 1] = hy + dy; PTS[nPts * 3 + 2] = hz + dz; nPts++; }
    }
    add(ch.handL); add(ch.handR); add(ch.hips); add(ch.armL?.shoulder); add(ch.armR?.shoulder);
    for (const L of [ch.legL, ch.legR]) { add(L?.knee); add(L?.ankle); }
  }
  // the spot (candidate) that frames every point from the nearest distance, scored: near the couch's front / the bed's side
  // (turned by your drag), the pitch about 43 degrees down, nearer is bigger, your own room before the next, the last choice kept
  // unless another is clearly better. Spots outside the house, inside a wall or over the ceiling are out.
  const angD = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let baseFov = 0, fovNow = 0; // the game's own field of view (put back when you get up), the one this camera wants
  function solveFit(s, pref) {
    const iv = ctx.indoorView, b = iv?.buildingAt?.(s.x, s.z) || iv?.active;
    const base = baseFov || camera.fov;
    for (let k = 0; k < FIT.fovs.length; k++) { // the narrowest view that frames you from your own room; past the widest, the next room may do
      const fov = Math.max(base, FIT.fovs[k] || base), last = k === FIT.fovs.length - 1;
      if (k && fov <= base) continue;
      if (solveAt(s, pref, iv, b, fov, false) || (last && solveAt(s, pref, iv, b, fov, true)) || last) { fit.fov = fov; return nPts > 0; }
    }
    return nPts > 0;
  }
  function solveAt(s, pref, iv, b, fov, allowThrough) {
    nPts = 0; bodyPts(player.character);
    const ps = partnerOf(me()), pch = ps !== null ? bodies.get(ps) : null;
    if (pch && pch !== player.character && pch.root.visible && restSpot(bySid.get(ps))?.furn === s.furn) bodyPts(pch);
    if (!nPts) return false;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < nPts; i++) { const x = PTS[i * 3], y = PTS[i * 3 + 1], z = PTS[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const tx = (x0 + x1) / 2, ty = (y0 + y1) / 2, tz = (z0 + z1) / 2;
    const tanV = Math.tan(fov * Math.PI / 360) * FIT.fill, tanH = tanV * (camera.aspect || 1);
    const dMin = s.kind === 'couch' ? FIT.dMin.couch : (camera.aspect || 1) < 1 ? FIT.dMin.bedTall : FIT.dMin.bed; // (an upright phone may come nearer a bed)
    const tRoom = b ? iv.roomOf(b, tx, REST_FLOOR, tz) : roomOf(tx, tz);
    let best = -1, bs = Infinity, bx = 0, by = 0, bz = 0, bd = 0, bthrough = false;
    const O = fit.out; O.house = O.room = O.ceil = O.wall = 0; fit.n = nPts;
    const NY = FIT.yaws, NP = FIT.pitches.length;
    for (let i = 0; i < NY * NP; i++) {
      const yaw = pref + (Math.floor(i / NP) / NY) * Math.PI * 2, pitch = FIT.pitches[i % NP];
      const d = Math.max(dMin, fitDist(PTS, nPts, tx, ty, tz, yaw, pitch, tanV, tanH, FIT.pad));
      const cp = Math.cos(pitch), x = tx + Math.sin(yaw) * cp * d, y = ty + Math.sin(pitch) * d, z = tz + Math.cos(yaw) * cp * d;
      let through = false;
      if (b) {
        if (!b.inside(x, z)) { O.house++; continue; }
        const r = iv.roomOf(b, x, REST_FLOOR, z); if (!r) { O.room++; continue; }
        through = r !== tRoom;
        if (through && !allowThrough) { O.room++; continue; }
        if (y > iv.ceilOf(r, x, z) - FIT.ceil || y < r.y + 0.4) { O.ceil++; continue; }
        let inWall = false;
        for (const w of b.walls) if (x > w.minX - FIT.wall && x < w.maxX + FIT.wall && z > w.minZ - FIT.wall && z < w.maxZ + FIT.wall && y > w.y0 && y < w.y1) { inWall = true; break; }
        if (inWall) { O.wall++; continue; }
        if (through && iv.clampRay(b, x, y, z, (tx - x) / d, (ty - y) / d, (tz - z) / d, d) > FIT.through - 0.2) { O.wall++; continue; } // (clampRay stops 0.2 short)
      } else if (tRoom && (x < tRoom.minX + 0.2 || x > tRoom.maxX - 0.2 || z < tRoom.minZ + 0.2 || z > tRoom.maxZ - 0.2)) continue;
      const share = heightShare(PTS, nPts, tx, ty, tz, yaw, pitch, d, tanV / FIT.fill); // (a bigger picture of you scores: an upright phone looks along the bed)
      const score = 0.6 * angD(yaw, pref) + 0.8 * Math.abs(pitch - FIT.pitch0) + 0.12 * d - FIT.big * Math.min(share, (camera.aspect || 1) < 1 ? FIT.bigCapTall : FIT.bigCap) + (through ? 1.0 : 0) - (i === fitI ? FIT.stick : 0);
      if (score < bs) { bs = score; best = i; bx = x; by = y; bz = z; bd = d; bthrough = through; }
    }
    fit.tx = tx; fit.ty = ty; fit.tz = tz;
    if (best < 0) { // nowhere frames it all: from the front, as far back as the walls let it (some of you may be cut off)
      const pitch = 0.9, cp = Math.cos(pitch), dx = Math.sin(pref) * cp, dy = Math.sin(pitch), dz = Math.cos(pref) * cp;
      const want = fitDist(PTS, nPts, tx, ty, tz, pref, pitch, tanV, tanH, FIT.pad), d = b ? Math.max(0.6, iv.clampRay(b, tx, ty, tz, dx, dy, dz, want)) : want;
      fitI = -1; Object.assign(fit, { x: tx + dx * d, y: ty + dy * d, z: tz + dz * d, d, yaw: pref, pitch, through: false, ok: false });
    } else {
      fitI = best;
      const yaw = pref + (Math.floor(best / NP) / NY) * Math.PI * 2, pitch = FIT.pitches[best % NP];
      Object.assign(fit, { x: bx, y: by, z: bz, d: bd, yaw, pitch, through: bthrough, ok: true });
      // centred: aim where the bodies' picture is in the middle (twice, each time the nearest distance again); kept when the
      // camera stays where it may be
      const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      let ax = tx, ay = ty, az = tz;
      for (let k = 0; k < 2; k++) {
        const o = centreOff(PTS, nPts, ax, ay, az, yaw, pitch, fit.d), ox = o[0] * fit.d, oy = o[1] * fit.d;
        const nx = ax + cy * ox - sp * sy * oy, ny = ay + cp * oy, nz = az - sy * ox - sp * cy * oy;
        const d = Math.max(dMin, fitDist(PTS, nPts, nx, ny, nz, yaw, pitch, tanV, tanH, FIT.pad));
        const x = nx + sy * cp * d, y = ny + sp * d, z = nz + cy * cp * d;
        const r = b ? iv.roomOf(b, x, REST_FLOOR, z) : tRoom;
        if (b && (!b.inside(x, z) || !r || (!bthrough && r !== tRoom) || y > iv.ceilOf(r, x, z) - FIT.ceil || b.walls.some(w => x > w.minX - FIT.wall && x < w.maxX + FIT.wall && z > w.minZ - FIT.wall && z < w.maxZ + FIT.wall && y > w.y0 && y < w.y1))) break;
        ax = nx; ay = ny; az = nz; Object.assign(fit, { x, y, z, d, tx: nx, ty: ny, tz: nz });
      }
    }
    fit.share = heightShare(PTS, nPts, fit.tx, fit.ty, fit.tz, fit.yaw, fit.pitch, fit.d, Math.tan(fov * Math.PI / 360));
    return best >= 0;
  }
  // the view eased to what the fitted camera wants, and put back to the game's own
  function easeFov(want, dt) {
    if (!baseFov) baseFov = camera.fov;
    fovNow = want;
    const f = camera.fov + (want - camera.fov) * (dt > 0 ? 1 - Math.exp(-dt * FIT.fovEase) : 1);
    if (Math.abs(f - camera.fov) > 0.01) { camera.fov = Math.abs(f - want) < 0.02 ? want : f; camera.updateProjectionMatrix(); }
  }
  function restoreFov() {
    if (baseFov && camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    baseFov = 0; fovNow = 0;
  }
  function take(spot) {
    if (net.status === 'online' && net.sid !== null && net.sid !== undefined) { pending = { id: spot.id, t: performance.now() / 1000 }; net.send({ t: 'rest', op: 'take', spot: spot.id }); }
    else begin(spot); // (offline: nobody to share the sofa with)
  }
  function begin(spot) {
    if (player.takeover && !player.takeover.houseRest) return;
    mine = spot; satAt = performance.now() / 1000; orbit = 0; fitI = -1;
    phase = spot.kind === 'bed' ? 'down' : 'sit'; phaseT = 0;
    from = { x: player.pos.x, z: player.pos.z };
    camP.copy(camera.position); camL.set(spot.x, REST_FLOOR + 0.9, spot.z);
    setParams(player.character, spot, me(), 0);
    player.takeover = {
      anim: spot.kind === 'bed' ? 'lie' : 'sit', houseRest: true, clearView: true, // (camera-fade: nobody beside you turns to a ghost)
      update(dt, now, inp, pl) {
        const s = mine; if (!s) return;
        phaseT += dt;
        const ch = pl.character;
        if (s.kind === 'couch') {
          spotPos(s, me(), _r);
          { const f = sitFit(ch); _r.x += Math.sin(s.yaw) * f; _r.z += Math.cos(s.yaw) * f; }
          const k = phaseT < 0.05 ? 1 : 1 - Math.exp(-dt * 8); // (straight onto the cushion, then a slide when the server moves you over)
          pl.pos.x += (_r.x - pl.pos.x) * k; pl.pos.z += (_r.z - pl.pos.z) * k; pl.pos.y = REST_FLOOR; pl.yaw = s.yaw;
          setParams(ch, s, me(), 0);
        } else {
          lieRoot(s, me(), ch, _r);
          let k = 1;
          if (phase === 'down') { k = Math.min(1, phaseT / LIE_T); if (k >= 1) phase = 'lie'; }
          else if (phase === 'up') { k = 1 - Math.min(1, phaseT / RISE_T); }
          const e = k * k * (3 - 2 * k);
          // (down and up: from the bedside along the bed; while lying, eased onto a moved pillow spot)
          const fx = phase === 'up' ? s.out.x : from.x, fz = phase === 'up' ? s.out.z : from.z;
          if (phase === 'lie') { const q = 1 - Math.exp(-dt * 8); pl.pos.x += (_r.x - pl.pos.x) * q; pl.pos.z += (_r.z - pl.pos.z) * q; }
          else { pl.pos.x = fx + (_r.x - fx) * e; pl.pos.z = fz + (_r.z - fz) * e; }
          pl.pos.y = REST_FLOOR; pl.yaw = s.yaw;
          setParams(ch, s, me(), e);
          if (phase === 'up' && k <= 0) { finish(); return; }
        }
        const mv = inp.move();
        if (phase !== 'up' && Math.hypot(mv.x, mv.y) > 0.5 && now - satAt > 0.6) stand();
      },
      camera(dt, cam, inp) {
        const s = mine; if (!s) return false;
        if (!player.character.root.visible) player.character.root.visible = true; // (the house's first person hides your body: here you see yourself)
        const p = spotPos(s, me(), _r), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        const look = inp.takeLook();
        if (look.x) orbit = Math.max(-0.9, Math.min(0.9, orbit - look.x * 0.004));
        // the side it prefers: the couch's front (you face the camera), or beside the bed toward its foot; your drag turns it
        let pref;
        if (s.kind === 'couch') pref = Math.atan2(fx, fz);
        else { const sx = s.n === 2 ? (s.i === 0 ? -1 : 1) : -1, ax = s.along.x * sx, az = s.along.z * sx; pref = Math.atan2(ax + fx * 0.7, az + fz * 0.7); }
        pref += orbit;
        if (solveFit(s, pref)) { wantP.set(fit.x, fit.y, fit.z); wantL.set(fit.tx, fit.ty, fit.tz); easeFov(fit.fov, dt); }
        else { wantL.set(p.x, REST_FLOOR + s.top + 0.4, p.z); wantP.set(p.x + Math.sin(pref) * 2.4, REST_FLOOR + 2.1, p.z + Math.cos(pref) * 2.4); }
        const k = 1 - Math.exp(-dt * 4);
        camP.lerp(wantP, k); camL.lerp(wantL, k);
        cam.position.copy(camP); cam.lookAt(camL);
        return true;
      },
    };
    audio.ui?.('pop');
    const pc = ctx.hudLayout?.layout === 'pc';
    ui.toast(spot.kind === 'bed' ? (pc ? 'Cozy! E or move to get up.' : 'Cozy! Move or tap E to get up.') : (pc ? 'Comfy. E or move to get up.' : 'Comfy. Move or tap E to get up.'), 2200);
  }
  function stand() {
    if (!mine) return;
    if (mine.kind === 'bed' && phase !== 'up') { phase = 'up'; phaseT = 0; return; } // (the getting up plays, then finish())
    finish();
  }
  function finish() {
    const s = mine; if (!s) return;
    mine = null; phase = null;
    if (player.takeover?.houseRest) player.takeover = null;
    clearParams(player.character); restoreFov();
    net.send({ t: 'rest', op: 'leave' });
    const yaw = s.kind === 'couch' ? s.yaw : Math.atan2(s.out.x - (s.rect.x0 + s.rect.x1) / 2, s.out.z - (s.rect.z0 + s.rect.z1) / 2);
    player.place?.(s.out.x, s.out.z, yaw);
    player.pos.y = REST_FLOOR;
    player.collide?.();
    ctx.indoorView?.resume?.(yaw); // (back to the house's own camera, looking the way you face)
  }

  // ---- E: the nearest free cushion or bed side
  function nearest(px, pz) {
    let best = null, bd = Infinity, full = null;
    for (const s of REST_SPOTS) {
      let d;
      if (s.kind === 'couch') d = Math.hypot(px - (s.x + Math.sin(s.yaw) * 0.6), pz - (s.z + Math.cos(s.yaw) * 0.6));
      else { const R = s.rect, e = Math.hypot(Math.max(R.x0 - px, 0, px - R.x1), Math.max(R.z0 - pz, 0, pz - R.z1)); if (e > BED_R) continue; d = Math.hypot(px - s.out.x, pz - s.out.z) * 0.5 + e; }
      if (s.kind === 'couch' && d > COUCH_R) continue;
      const who = at.get(s.id);
      if (who !== undefined && who !== me()) { full = full || s; continue; }
      if (d < bd) { bd = d; best = s; }
    }
    return best || (full ? { full } : null);
  }

  const api = {
    name: 'house-rest',
    spots: REST_SPOTS,
    get mine() { return mine ? mine.id : null; },
    get phase() { return phase; },
    state: () => ({ at: [...at].map(([id, sid]) => [sid, id]), snug: snug.map(p => ({ ...p })) }),
    snugK: sid => snugK.get(sid) || 0,
    get hearts() { return heart.n; },
    get heart() { return heart.t >= 0 ? { t: heart.t, x: heart.m.position.x, y: heart.m.position.y, z: heart.m.position.z } : null; },
    take: id => { const s = restSpot(id); if (s) take(s); return !!s; },
    stand,
    lieReach,
    sitFit,
    get fit() { return mine ? { ...fit, out: { ...fit.out } } : null; }, // (the fitted camera's last solve: tests)
    update(dt) {
      // the pairs' closeness, eased (everyone's, so each screen draws the slide the same)
      for (const sid of new Set([...snugK.keys(), ...snug.flatMap(p => [p.a, p.w])])) {
        const want = pairOf(sid) ? 1 : 0, k = snugK.get(sid) || 0, n = k + Math.max(-dt * 1.6, Math.min(dt * 1.2, want - k));
        if (n <= 0 && !want) snugK.delete(sid); else snugK.set(sid, n);
      }
      const nowS = performance.now() / 1000;
      if (pending && nowS - pending.t > 3) pending = null;
      // the server has us on a spot we are not on (an answer that came after something else took us over): let it go
      if (!mine && !pending && net.status === 'online' && bySid.has(me()) && nowS - strayAt > 1) { strayAt = nowS; net.send({ t: 'rest', op: 'leave' }); }
      if (mine && !player.takeover?.houseRest) { mine = null; phase = null; clearParams(player.character); restoreFov(); net.send({ t: 'rest', op: 'leave' }); } // (something else took you over)
      stepHeart(dt);
    },
    afterRemotes() {
      for (const r of remotes.map.values()) {
        const id = bySid.get(r.sid), s = id ? restSpot(id) : null, last = r.buf[r.buf.length - 1], a = last ? ANIM_CODES[last.a] : null;
        if (!s || (a !== 'sit' && a !== 'lie')) { if (touched.has(r.sid)) { clearParams(r.ch); touched.delete(r.sid); } continue; }
        touched.add(r.sid);
        const root = r.ch.root;
        root.rotation.y = s.yaw;
        root.position.y = REST_FLOOR;
        let k = 0;
        if (s.kind === 'bed') { // (how far along from the bedside to the pillow they are: their own lying down, as they play it)
          lieRoot(s, r.sid, r.ch, _r);
          const d = Math.hypot(root.position.x - _r.x, root.position.z - _r.z), D = Math.max(0.4, Math.hypot(s.out.x - _r.x, s.out.z - _r.z));
          k = a === 'lie' ? Math.max(0, Math.min(1, 1 - d / D)) : 0; k = k * k * (3 - 2 * k);
        }
        setParams(r.ch, s, r.sid, k);
      }
      for (const sid of touched) if (!remotes.map.has(sid)) touched.delete(sid);
      for (const sid of bodies.keys()) if (sid !== me() && !remotes.map.has(sid)) bodies.delete(sid);
    },
    target(px, pz) {
      if (mine) return phase === 'up' ? null : { hint: 'E  Get up', prio: 7, run: stand };
      if (!ctx.playing || pending || player.takeover || !roomOf(px, pz)) return null;
      const n = nearest(px, pz);
      if (!n) return null;
      if (n.full) return { hint: n.full.kind === 'bed' ? 'Someone is lying there' : `The ${n.full.name} is full`, prio: 2, run: () => ui.toast('Someone is already there.', 1800) };
      if (n.kind === 'bed') {
        // the main bed's west side (the wake spot) keeps "Go to bed (log off)" (main-house.js, prio 6); everywhere else round it, lie down
        const logOffSide = n.main && px < n.rect.x0 + 0.05;
        return { hint: 'E  Lie down', prio: logOffSide ? 5.5 : 6.5, run: () => take(n) };
      }
      return { hint: `E  Sit on the ${n.name}`, prio: PRIO, run: () => take(n) };
    },
    onKey(code) { if (mine && phase !== 'up' && code === 'Space') { stand(); return true; } return false; },
    help: [[['E'], 'in our house: sit on the sofa or the loveseat, lie down on a bed (E or move to get up)']],
  };
  void spotsOf;
  return api;
}
