// Nala and the people who work the street. When the mail carrier (or at night the pizza driver) walks along our fence,
// Nala races over, barks, bounces along keeping pace and trots back pleased with herself. He jumps, laughs, and sometimes
// tosses her a biscuit. A pure function of the shared clock, like dogs-play.js, and it puts his reaction stops into his
// route so they stay in step on every screen. Sometimes the front gate's on the latch and she gets out onto the sidewalk
// (ep.escape: gates.js swings the gate, crowd.js lets her out of the yard).
import { hash01, pointInPoly, alongPolyline, polylineLength } from './util.js';
import { YARD as WALK, HOUSE, PORCH, STEPS, FENCE_Z, MAILBOX, GATES, inHouseBox } from './layout.js'; // the dogs' world is the fenced yard
import { EAT_DUR, SNAP_CATCH } from './dogs.js';
import { routeAt, insertHold, cloneRoute } from './mailman-route.js';
import { groundHeight } from './terrain.js';

const RUN = 7.0;                         // Nala flat out (m/s)
const X0 = -57.5, X1 = 54.5;             // the stretch of fence she can reach
const FZ = FENCE_Z + 0.8;                // her line along the inside of the fence
const GATE = GATES.find(g => g.id === 'north-gate');
const GI = [GATE.x, FENCE_Z + 1.1], GO = [GATE.x, FENCE_Z - 1.1];   // just inside and just outside the front gate
const OUT_Z = FENCE_Z - 1.15;            // her line along the sidewalk, outside the fence
const P_ESCAPE = 0.3;                    // how often the gate has been left on the latch when he passes close by
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const easeOut = u => { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); };
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const pick = (list, h) => list[Math.floor(h * list.length) % list.length];

export const onPorch = (x, z) => x > PORCH.minX - 0.9 && x < PORCH.maxX + 0.9 && z > STEPS.minZ - 0.6 && z < HOUSE.minZ + 0.5;
// her line along the fence, stepping round the mailbox post
export const fenceZ = x => FZ + 1.1 * Math.max(0, 1 - Math.abs(x - MAILBOX.x) / 1.6) ** 0.7;

function okPt(sys, x, z) {
  if (sys.nav?.clearOf && !sys.nav.clearOf(x, z, 0.3)) return false;   // (out of the firepit's ring of seats)
  if (!pointInPoly(x, z, WALK)) return false;
  if ((x > HOUSE.minX - 1.0 && x < HOUSE.maxX + 1.0 && z > HOUSE.minZ - 1.0 && z < HOUSE.maxZ + 1) || inHouseBox(x, z, 1.0)) return false; // (and the garage)
  for (const a of sys.areas) if (a.tableR && Math.hypot(x - a.x, z - a.z) < a.tableR + 1.0) return false;
  return true;
}
function okPath(sys, path, skipFirst) {
  const len = polylineLength(path);
  for (let d = skipFirst; d <= len; d += 1) { const [x, z] = alongPolyline(path, d); if (!onPorch(x, z) && !okPt(sys, x, z)) return false; }
  return true;
}
// from where she is to the fence (down the porch steps first if she was asleep by the door)
function runPath(N0, M) {
  if (onPorch(N0[0], N0[1])) return [N0, [N0[0] * 0.5, -6.3], [0.1, -7.3], [0.2, -8.6], M];
  return [N0, M];
}

const LINES = {
  pat: {
    startle: ['Whoa! Easy, Nala!', 'Ha! Hello to you too, Nala.', 'Same time every day, Nala!', 'Yikes! Good morning, Nala.'],
    finale: ['Ha! Good morning to you too.', 'Yes, yes, very scary.', 'Who is a good guard dog?', 'You got me again, Nala.'],
    toss: ['Here you go, you big softie.', 'One biscuit. Do not tell anyone.', 'Catch!'],
    bye: ['See you tomorrow, Nala!', 'Bye, Nala!', 'Keep up the good work.'],
  },
  pizza: {
    startle: ['Whoa! Easy there, pup!', 'Yikes! Hi, doggo!', 'Hey hey, I come in peace!'],
    far: ['Ha! Hi, pup!', 'Not for you, doggo!', 'Smells good, huh?'],
  },
};

// v = { kind: 'pat' | 'pizza', key, route, T0, T1, far, walkDir, holdAt(route) }
// Returns { ep, route } where route has his reaction stops in it, or null.
export function buildMailEpisode(sys, v) {
  const nala = sys.dog('nala'), dax = sys.dog('dax');
  if (!nala || !dax) return null;
  const H = salt => hash01('mailep', v.key, salt);
  if (H('on') > (v.far ? 0.6 : 0.97)) return null; // when he comes along our fence they (almost) always go

  // the stretch of his route that runs past our fence (or, far: along the houses across the street)
  let wa = null, wb = null;
  for (let t = v.T0; t < v.T1; t += 0.5) {
    const s = routeAt(v.route, t);
    const near = !s.hidden && !s.riding && s.x > X0 + 1 && s.x < X1 - 1 && (v.far ? s.z < -53 : s.z < FENCE_Z && s.z > -44.3);
    if (near) { if (wa === null) wa = t; wb = t; } else if (wa !== null) break;
  }
  if (wa === null || wb - wa < 7) return null;
  // a few tries at the moment she spots him (she may be busy, too far, or Dax in the way at the first)
  for (let i = 0; i < 3; i++) { const r = attempt(sys, v, wa, wb, i); if (r) return r; }
  return null;
}

function attempt(sys, v, wa, wb, i) {
  const nala = sys.dog('nala'), dax = sys.dog('dax');
  const H = salt => hash01('mailep', v.key, salt);
  // when she meets him: not while he is already standing somewhere doing something
  let tm = wa + 2 + H('when' + i) * Math.max(0, wb - wa - (v.far ? 8 : 14));
  for (let k = 0; k < 4; k++) { const s = routeAt(v.route, tm); if (s.seg.kind !== 'hold') break; tm = s.seg.t0 + s.seg.dur + 0.2; }
  if (tm > wb - 5) return null;
  const V = routeAt(v.route, tm);
  const Mx = clamp(V.x + (v.far ? 0 : v.walkDir * 1.0), X0, X1), M = [Mx, fenceZ(Mx)];

  // where she is when she spots him (she has to be settled somewhere, and free)
  let ts = tm - 4, N0 = null, path = null, wake = 0.45, sN = null;
  for (let it = 0; it < 4; it++) {
    sN = sys.baseState(nala, ts);
    N0 = [sN.x, sN.z];
    wake = sN.anim === 'rest' || sN.anim === 'lie' || sN.nap ? 1.1 : 0.45;   // (napping: she wakes with a sniff first)
    path = runPath(N0, M);
    ts = tm - wake - polylineLength(path) / RUN;
  }
  sN = sys.baseState(nala, ts);
  if (!sN.stay || (sN.entry && sN.entry.partner) || Math.hypot(sN.x - N0[0], sN.z - N0[1]) > 0.3) return null;
  const tR = polylineLength(path) / RUN;
  if (tR > 7.5 || !okPath(sys, path, 1.2)) return null;
  const asleep = wake > 1;

  // ---- his reactions (stops inserted into his route) and her timeline
  const route = cloneRoute(v.route);
  const Lp = LINES[v.kind];
  const ev = [];                                   // { t, dog?, text?, sfx? } (dog lines and sounds; his lines ride on the holds)
  ev.push({ t: ts + (asleep ? 0.3 : 0.05), dog: 'nala', text: asleep ? '*sniff sniff*' : 'BORK!' });
  if (asleep) ev.push({ t: ts + wake, dog: 'nala', text: 'BORK!' });
  ev.push({ t: tm + 0.05, dog: 'nala', text: 'BORK! BORK!' });
  const ep = { key: v.key, kind: v.kind, far: v.far, dir: v.walkDir || -1, ts, tm, M, N0, path, tR, wake, route, ev, toss: false };
  // the gate left on the latch: she gets out (only when he is close to it, and not every time)
  if (!v.far && Math.abs(M[0] - GATE.x) < 16 && H('escape') < P_ESCAPE) {
    ep.escape = true;
    ep.outPath = [M, [GATE.x, FZ], GI, GO];
    ep.tOut = polylineLength(ep.outPath) / RUN + 0.25;
  }

  if (v.far) {
    // she barks across the street, sniffs the air (pizza!), bounces, barks; he laughs from over there
    const tl = tm + 1.0, s = routeAt(route, tl);
    if (s.seg.kind === 'walk') insertHold(route, tl, 1.9, faceTo(s.x, s.z, M[0], M[1]), [[0, 'laugh']], { say: [[0.25, pick(Lp.far, H('fl'))]], hand: 'bag' });
    ep.tB = tm + 1.8; ep.tS = ep.tB + 2.3; ep.tBo = ep.tS + 1.4; ep.tEnd1 = ep.tBo + 1.1;
    ep.PE = M;
    ev.push({ t: ep.tB + 0.2, dog: 'nala', text: '*sniff sniff* ...pizza?' });
    ev.push({ t: ep.tBo + 0.05, dog: 'nala', text: 'BORK!' });
  } else {
    // 1. he jumps (and laughs)
    const p1 = tm + 0.2;
    if (!insertHold(route, p1, 2.3, faceTo(routeAt(route, p1).x, routeAt(route, p1).z, M[0], M[1]), [[0, 'startle'], [0.85, 'laugh']],
      { say: [[0.3, pick(Lp.startle, H('st'))]], hand: v.kind === 'pizza' ? 'bag' : null })) return null;
    ep.tB = tm + 1.6;
    // 2. she bounces along the fence keeping pace while he walks on
    let tP = tm + 2.5 + 4.5 + H('pace') * 3.5;
    if (v.kind === 'pizza') { const hs = v.holdAt(route); if (hs !== null) tP = Math.max(tm + 3.5, hs + 1.2); }
    else for (let k = 0; k < 4; k++) { const s = routeAt(route, tP); if (s.seg.kind !== 'hold') break; tP = s.seg.t0 + s.seg.dur + 0.1; }
    ep.tP = tP;
    ep.PE = [paceX(ep, tP), 0]; ep.PE[1] = lineZ(ep, ep.PE[0]);
    ev.push({ t: ep.tB + 1.3, dog: 'nala', text: 'Bork bork!' });
    if (tP - ep.tB > 4.2) ev.push({ t: ep.tB + 3.6, dog: 'nala', text: 'BORK BORK BORK!' });
    if (v.kind === 'pat') {
      // 3. the finale: a play bow; he laughs, and half the time tosses her a biscuit over the fence
      const at = routeAt(route, tP);
      if (at.seg.kind !== 'walk') return null;
      const yaw = faceTo(at.x, at.z, ep.PE[0], ep.PE[1]);
      ep.toss = H('toss') < 0.5;
      if (ep.toss) {
        const rel = 1.8 + 0.28, fl = 0.75;
        const rx = -Math.cos(yaw) * 0.22, rz = Math.sin(yaw) * 0.22;        // his right hand
        const dx = Math.sin(yaw), dz = Math.cos(yaw);
        const from = [at.x + rx + dx * 0.3, 0.44 + 1.55, at.z + rz + dz * 0.3];
        const to = [ep.PE[0] - dx * 0.42, 0, ep.PE[1] - dz * 0.42];          // her mouth, facing him, as she jumps
        to[1] = groundHeight(to[0], to[2]) + 0.95;
        if (!insertHold(route, tP, 4.3, yaw, [[0, 'laugh'], [1.8, 'throw'], [2.9, 'wave']], {
          say: [[0.2, pick(Lp.finale, H('fi'))], [1.85, pick(Lp.toss, H('to'))], [3.0, 'Nice catch!']],
          fly: [{ u: rel, dur: fl, kind: 'biscuit', from, to, h: 0.9 }],
        })) return null;
        ep.tC = tP + rel + fl;                         // she catches it
        ep.tEnd1 = ep.tC + 0.35 + EAT_DUR + 1.2;
        ev.push({ t: ep.tC + 0.45, dog: 'nala', sfx: 'crunch' });
      } else {
        if (!insertHold(route, tP, 3.0, yaw, [[0, 'laugh'], [1.6, 'wave']], { say: [[0.2, pick(Lp.finale, H('fi'))], [1.7, pick(Lp.bye, H('by'))]] })) return null;
        ep.tEnd1 = tP + 3.4;
      }
    } else {
      // pizza: she sniffs the air (pizza!) and bounces; he has his own lines at the mailbox
      ep.tS = tP + 2.2; ep.tBo = ep.tS + 1.3; ep.tEnd1 = ep.tBo + 1.0;
      ev.push({ t: tP + 0.2, dog: 'nala', text: '*sniff sniff* ...pizza?' });
      ev.push({ t: ep.tBo + 0.05, dog: 'nala', text: 'BORK!' });
    }
  }
  if (ep.escape) ev.push({ t: ep.tB + 0.15, dog: 'nala', text: 'The gate is open!!' });
  ev.push({ t: ep.tEnd1 + 0.2, dog: 'nala', text: ep.escape ? '*trots home, very pleased*' : '*proud wiggle*' });
  ep.tPr = ep.tEnd1 + 2.0;

  // ---- the walk back to wherever her day has got to
  const bE = sys.baseState(nala, ep.tPr + 4);
  let back = onPorch(bE.x, bE.z) ? [ep.PE, [0.2, -8.6], [0.1, -7.3], [bE.x * 0.5, -6.3], [bE.x, bE.z]] : null;
  if (ep.escape) back = [ep.PE, GO, GI, [GATE.x, FZ - 0.2], ...(back ? back.slice(1) : [[bE.x, bE.z]])];
  const dist = back ? polylineLength(back) : Math.hypot(bE.x - ep.PE[0], bE.z - ep.PE[1]);
  if (dist > (ep.escape ? 60 : 48)) return null;
  ep.back = back;
  ep.ret = clamp(dist / 4.2, 2, ep.escape ? 15 : 11);
  ep.te = ep.tPr + ep.ret;

  // ---- Dax: never in the way; if he is settled nearby he watches, ears up
  let still = true;
  const d0 = sys.baseState(dax, ts);
  for (let t = ts; t <= ep.te; t += 1) {
    const sD = sys.baseState(dax, t), n = nalaMailAt(sys, ep, t);
    // (next to each other by the door at night is fine: she is only leaving him)
    if (Math.hypot(sD.x - n.x, sD.z - n.z) < 4 && Math.hypot(n.x - N0[0], n.z - N0[1]) > 4) return null;
    if (!sD.stay || Math.hypot(sD.x - d0.x, sD.z - d0.z) > 0.2) still = false;
  }
  if (still && Math.hypot(d0.x - M[0], d0.z - M[1]) < 40) {
    ep.daxWatch = { x: d0.x, z: d0.z, yaw: faceTo(d0.x, d0.z, M[0], M[1]), t0: tm + 0.6, t1: ep.tEnd1 + 1.5 };
    ev.push({ t: tm + 1.1, dog: 'dax', text: '*soft wuff*' });
  }
  ev.sort((a, b) => a.t - b.t);
  return { ep, route };
}

// Where she bounces along the fence at time t: a metre ahead of him in the direction he walks, wobbling.
function paceX(ep, t) {
  const t0 = ep.escape ? ep.tB + ep.tOut : ep.tB, x0 = ep.escape ? GO[0] : ep.M[0];
  const s = routeAt(ep.route, t), k = ease((t - t0) / 0.6);
  const target = clamp(s.x + ep.dir * 0.9 + Math.sin((t - ep.tB) * 2.1) * 0.35, X0, X1);
  return x0 + (target - x0) * k;
}
const lineZ = (ep, x) => (ep.escape ? OUT_Z : fenceZ(x));

function motion(fn, t) {
  const a = fn(t), b = fn(t + 0.05);
  const dx = b.x - a.x, dz = b.z - a.z, sp = Math.hypot(dx, dz) / 0.05;
  if (a.speed === undefined) a.speed = sp > 0.25 ? sp : 0;
  if (a.yaw === undefined) a.yaw = sp > 0.3 ? Math.atan2(dx, dz) : a.yaw0;
  return a;
}

// Nala during the episode: { x, z, yaw, speed, anim, at, lookAt }
export function nalaMailAt(sys, ep, t) {
  const u = t - ep.ts;
  const V = routeAt(ep.route, t);
  const lookAt = V.hidden ? null : { x: V.x, z: V.z };
  const faceV = P => (lookAt ? faceTo(P[0], P[1], lookAt.x, lookAt.z) : Math.PI);
  const still = (P, anim, t0) => ({ x: P[0], z: P[1], yaw: faceV(P), speed: 0, anim, at: t - t0, lookAt });
  if (u < ep.wake) return still(ep.N0, ep.wake > 1 ? 'startle' : 'look', ep.ts);
  const tr = t - ep.ts - ep.wake;
  if (tr < ep.tR) {
    const len = polylineLength(ep.path);
    return motion(tt => {
      const q = clamp((tt - ep.ts - ep.wake) / ep.tR, 0, 1), d = len * (q < 0.2 ? 2.5 * q * q : q - 0.1) / 0.9;   // a quick start, then flat out
      const [x, z] = alongPolyline(ep.path, Math.min(len, d));
      return { x, z, anim: null, at: null, lookAt, yaw0: faceV(ep.M) };
    }, t);
  }
  if (t < ep.tB) return still(ep.M, 'bark', ep.tm);
  if (ep.far) {
    if (t < ep.tS) return still(ep.M, 'bark', ep.tB - 1.8);
    if (t < ep.tBo) return still(ep.M, 'sniffup', ep.tS);
    if (t < ep.tEnd1) return still(ep.M, 'bounce', ep.tBo);
  } else if (ep.escape && t < ep.tB + ep.tOut) {   // out through the open gate
    const len = polylineLength(ep.outPath);
    const r = motion(tt => { const [x, z] = alongPolyline(ep.outPath, Math.min(len, Math.max(0, (tt - ep.tB) / ep.tOut) * len)); return { x, z, anim: null, at: null, lookAt, yaw0: faceV([x, z]) }; }, t);
    r.escape = true;
    return r;
  } else if (t < ep.tP) {
    const cyc = Math.floor((t - ep.tB) / 1.15) % 2;
    const r = motion(tt => { const x = paceX(ep, tt); return { x, z: lineZ(ep, x), anim: cyc ? 'bark' : 'bounce', at: null, lookAt, yaw0: faceV([x, lineZ(ep, x)]) }; }, t);
    if (r.speed < 0.6) r.yaw = faceV([r.x, r.z]);
    if (ep.escape) r.escape = true;
    return r;
  } else if (ep.kind === 'pat') {
    if (t < ep.tP + 1.6) return still(ep.PE, 'playbow', ep.tP);
    if (ep.toss) {
      if (t < ep.tC - SNAP_CATCH) return still(ep.PE, 'wag', ep.tP + 1.6);
      if (t < ep.tC + 0.35) return still(ep.PE, 'snap', ep.tC - SNAP_CATCH);
      if (t < ep.tC + 0.35 + EAT_DUR) return still(ep.PE, 'eat', ep.tC + 0.35);
      if (t < ep.tEnd1) return still(ep.PE, 'happy', ep.tC + 0.35 + EAT_DUR);
    } else if (t < ep.tEnd1) return still(ep.PE, 'happy', ep.tP + 1.6);
  } else {
    if (t < ep.tS) return still(ep.PE, 'sniffup', ep.tP);
    if (t < ep.tBo) return still(ep.PE, 'bounce', ep.tS);
    if (t < ep.tEnd1) return still(ep.PE, 'bark', ep.tBo);
  }
  const E = ep.far ? ep.M : ep.PE;
  if (t < ep.tPr) return still(E, 'wag', ep.tEnd1);
  // trot home, proud, to wherever her day has got to
  const ret = t - ep.tPr, base = sys.baseState(sys.dog('nala'), t), k = ease(ret / ep.ret);
  if (ep.back) {
    const len = polylineLength(ep.back), [x, z, dx, dz] = alongPolyline(ep.back, k * len);
    return { x, z, yaw: ret < ep.ret ? Math.atan2(dx, dz) : base.yaw, speed: ret < ep.ret ? len / ep.ret * 1.3 : 0, anim: ret < ep.ret ? null : base.anim, at: null, lookAt: null };
  }
  const dx = base.x - E[0], dz = base.z - E[1], moving = ret < ep.ret;
  return { x: E[0] + dx * k, z: E[1] + dz * k, yaw: moving ? Math.atan2(dx, dz) : base.yaw, speed: moving ? Math.hypot(dx, dz) / ep.ret * 1.4 : 0, anim: moving ? null : base.anim, at: null, lookAt: null };
}

// Dax during the episode. Without sys he just watches (ep.daxWatch). With it he runs to the fence a step behind Nala,
// barks and bounces along with her, then trots back to his own spot.
export function daxMailAt(ep, t, base, sys) {
  if (!sys) { const w = ep.daxWatch; if (!w || t < w.t0 || t > w.t1) return null; return { ...base, anim: 'sitlook', yaw: w.yaw, watch: true }; }
  const u = t - ep.ts;
  if (u < 0) return null;
  const LAG = 0.9;
  const at = tt => {
    const n = nalaMailAt(sys, ep, Math.max(ep.ts, tt - LAG));
    let ox = 1.4, oz = 1.3;
    if (!pointInPoly(n.x + ox, n.z + oz, WALK)) ox = -1.4;
    if (ep.escape) return [n.x + ox, Math.max(n.z + oz, FZ + 0.4), n];   // Nala gets out; Dax stays in and watches from the fence
    return [n.x + ox, n.z + oz, n];
  };
  const endT = ep.tPr + LAG;
  if (t < endT) {
    const [x, z, n] = at(t), [x2, z2] = at(t + 0.05);
    const sp = Math.hypot(x2 - x, z2 - z) / 0.05;
    let anim = n.anim;
    if (anim === 'playbow' || anim === 'snap' || anim === 'eat' || anim === 'happy') anim = 'wag'; // the biscuits are Nala's
    if (anim === 'bark' && Math.floor(u / 1.3) % 3 === 2) anim = 'bounce';
    const yaw = sp > 0.3 ? Math.atan2(x2 - x, z2 - z) : (n.lookAt ? faceTo(x, z, n.lookAt.x, n.lookAt.z) : n.yaw);
    return { x, z, yaw, speed: sp > 0.25 ? sp : 0, anim: sp > 0.5 ? null : anim, at: n.at, lookAt: n.lookAt, ep };
  }
  // back home, a bit slower than Nala
  const [ex, ez] = at(endT), dur = 4.5, k = ease((t - endT) / dur);
  if (t - endT > dur + 0.5) return null;
  const dx = base.x - ex, dz = base.z - ez, moving = t - endT < dur;
  return { x: ex + dx * k, z: ez + dz * k, yaw: moving ? Math.atan2(dx, dz) : base.yaw, speed: moving ? Math.hypot(dx, dz) / dur * 1.4 : 0, anim: moving ? null : base.anim, at: null, ep };
}
