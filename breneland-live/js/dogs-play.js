// Nala and Dax play: a short scripted scene that's a pure function of the shared clock (no Math.random, only hash01),
// so everyone sees the same thing. Time is cut into 40 s slots and a slot may hold one episode, only when Dax is resting
// and Nala is in sight. Nala play-bows and pounces, Dax tumbles, chases her round a circle, she slams him again, both pant
// and go back to their day. About one time in five Dax ducks and Nala tumbles instead.
import { hash01, pointInPoly, alongPolyline, polylineLength, closestOnSeg } from './util.js';
import { YARD as WALK, HOUSE, PORCH, STEPS, inHouseBox } from './layout.js'; // the dogs' world is the fenced yard
import { TUMBLE_DUR, FLOP_DUR } from './dogs.js';

export const WHY = {};   // counts of why a layout was rejected (debug)
const no = why => { WHY[why] = (WHY[why] || 0) + 1; return null; };
export const EP_SLOT = 40;       // seconds per slot
const P_EPISODE = 0.6;           // chance a slot stages one when the dogs are in the right state
const SIGHT = 32;                // how far apart (m) they may be and still notice each other
const NALA_RUN = 7.2, DAX_WALK = 2.8, RETURN_RUN = 6.5, CHASE_DAX = 4.9, R_TRY = [3.8, 3.0, 2.4];
const YARD_SPOTS = [[0.4, -11.6], [-2.5, -12.4], [3.2, -12.2], [-4, -10.5]];   // where Dax plays if he was on the porch

const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const ease = u => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
const easeOut = u => { u = u < 0 ? 0 : u > 1 ? 1 : u; return 1 - (1 - u) * (1 - u); };
const lerp2 = (A, B, k) => [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
const unit = (x, z) => { const d = Math.hypot(x, z) || 1; return [x / d, z / d]; };
const add = (P, v, k) => [P[0] + v[0] * k, P[1] + v[1] * k];

const onPorch = (x, z) => x > PORCH.minX - 0.9 && x < PORCH.maxX + 0.9 && z > STEPS.minZ - 0.6 && z < HOUSE.minZ + 0.5;

// Is this a fine place for a dog to romp? Inside the yard, off the porch and house, clear of tables and the mailbox.
function okPt(sys, x, z) {
  if (sys.nav?.clearOf && !sys.nav.clearOf(x, z, 0.3)) return false;   // (out of the firepit's ring of seats)
  if (!pointInPoly(x, z, WALK)) return false;
  if ((x > HOUSE.minX - 1.2 && x < HOUSE.maxX + 1.2 && z > HOUSE.minZ - 1.2 && z < HOUSE.maxZ + 1) || inHouseBox(x, z, 1.2)) return false; // (and the garage)
  if (onPorch(x, z)) return false;
  for (const a of sys.areas) if (a.tableR && Math.hypot(x - a.x, z - a.z) < a.tableR + 1.1) return false;
  if (sys.avoidUnicorns && sys.avoidUnicorns(x, z, 8)) return false;
  return true;
}

// Build (and cache) the episode of slot j, or null.
export function episodeOf(sys, j) {
  const cache = sys.epCache || (sys.epCache = new Map());
  if (cache.has(j)) return cache.get(j);
  const ep = build(sys, j);
  cache.set(j, ep);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return ep;
}

function build(sys, j) {
  if (hash01('play', j) > P_EPISODE) return null;
  const nala = sys.dog('nala'), dax = sys.dog('dax');
  if (!nala || !dax) return null;
  const ts = j * EP_SLOT + 1 + hash01('epts', j) * (EP_SLOT - 27);
  // not while they sleep by the door, and never over Nala barking at the mail carrier (dogs-mail.js wins)
  if (sys.dogsAsleep?.(ts) || sys.dogsAsleep?.(ts + 30) || sys.mailBusy?.(ts - 2, ts + 34)) return null;
  if (sys.dogNap?.(ts) || sys.dogNap?.(ts + 30)) return null;   // (nor while either naps)
  const sN = sys.baseState(nala, ts), sD = sys.baseState(dax, ts);
  if (!sD.stay || sD.speed > 0.2 || (sD.entry && sD.entry.partner)) return null;
  if (sN.entry && sN.entry.partner) return null;
  const D0 = [sD.x, sD.z], N0 = [sN.x, sN.z];
  if (Math.hypot(N0[0] - D0[0], N0[1] - D0[1]) > SIGHT) return null;

  const daxWin = hash01('daxwin', j) < 0.2;
  const exit = dax.exit || [];
  let spots;
  if (onPorch(D0[0], D0[1])) spots = YARD_SPOTS;
  else if (okPt(sys, D0[0], D0[1])) spots = [D0];
  else { spots = []; for (let i = 0; i < 8; i++) { const q = [D0[0] + Math.cos(i * 0.785) * 3, D0[1] + Math.sin(i * 0.785) * 3]; if (okPt(sys, q[0], q[1])) spots.push(q); } }

  for (const S of spots) {
    const a0 = unit(N0[0] - S[0], N0[1] - S[1]);
    for (const rot of [0, 0.7, -0.7, 1.4, -1.4]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const a = [a0[0] * c - a0[1] * s, a0[0] * s + a0[1] * c];
      for (const R of R_TRY) for (const sg of [1, -1]) for (const win of daxWin ? [true, false] : [false]) {   // Dax's win needs more room: fall back to the usual ending
        const ep = layout(sys, j, { ts, S, D0, N0, a, R, sg, daxWin: win, exit, sN });
        if (ep) return ep;
      }
    }
  }
  return null;
}

// Lay the whole scene out for one candidate geometry; null when any part of it would leave the safe lawn.
function layout(sys, j, g) {
  const { ts, S, D0, N0, a, R, sg, daxWin, exit } = g;
  const nala = sys.dog('nala'), dax = sys.dog('dax');
  const P1 = add(S, a, 3.2), Cn = add(S, a, 0.55);
  const Sd = add(S, a, -1.9);                         // where round one leaves Dax (he was knocked back)
  const Nf1 = daxWin ? add(S, a, -2.7) : add(S, a, 0.2);
  const Q0 = daxWin ? S : Sd;                         // where Dax starts his chase
  const perp = [-a[1] * sg, a[0] * sg];
  const C = add(Q0, perp, R);
  const th0 = Math.atan2(Q0[1] - C[1], Q0[0] - C[0]);
  const tang = [-Math.sin(th0), Math.cos(th0)];
  const dir = tang[0] * -a[0] + tang[1] * -a[1] >= 0 ? 1 : -1;   // run off away from where Nala came from
  const circ = th => [C[0] + Math.cos(th) * R, C[1] + Math.sin(th) * R];
  for (let i = 0; i < 24; i++) if (!okPt(sys, ...circ(th0 + (i / 24) * Math.PI * 2))) return no('circle');
  for (const P of [P1, Sd, Nf1]) if (!okPt(sys, P[0], P[1])) return no('pts1');
  if (!okPt(sys, S[0], S[1]) && S !== D0) return no('spot');

  // ---- timeline (seconds since ts)
  const porch = onPorch(D0[0], D0[1]);
  const dPath = S === D0 ? [D0] : porch ? [D0, ...exit, S] : [D0, S];
  const dLen = dPath.length > 1 ? polylineLength(dPath) : 0;
  const tN = Math.max(0.4, Math.hypot(P1[0] - N0[0], P1[1] - N0[1]) / NALA_RUN);
  const tD = dLen / DAX_WALK;
  const T0 = Math.max(tN, tD, 1.5);
  const T1 = T0 + 1.3;                 // pounce starts
  const Ti = T1 + 0.5;                 // impact
  const nalaTumbleAt = T1 + 0.62;      // (Dax wins the round) she lands and tumbles
  const Tc = daxWin ? nalaTumbleAt + TUMBLE_DUR + 0.6 : Ti + TUMBLE_DUR;
  const CH = 4.6;
  const Te = Tc + CH;
  const lead = q => {                  // radians Nala is ahead of Dax: he closes in, then she dodges away
    if (q < 0.7) return 0.22 + 0.68 * (1 - ease(q / 0.7));
    return 0.22 + 0.3 * ease((q - 0.7) / 0.3);
  };
  const thD = u => th0 + dir * (CHASE_DAX / R) * u;
  const thN = u => thD(u) + dir * lead(u / CH);
  const Qd = circ(thD(CH)), Qn = circ(thN(CH));
  const dn = unit(Qn[0] - Qd[0], Qn[1] - Qd[1]);        // from Dax to where Nala is
  const Wp = add(Qd, dn, 3.0);
  if (!okPt(sys, Wp[0], Wp[1])) return no('wp');
  const Ts = Te + 0.65;                // second pounce starts
  const C2 = add(Qd, dn, 0.55), Nf2 = add(Qd, dn, 0.15), Qf = add(Qd, dn, -1.85);
  for (const P of [Qf, Nf2]) if (!okPt(sys, P[0], P[1])) return no('pts2');
  const Tr = Ts + 0.5 + FLOP_DUR + 1.0 + 1.5;

  // ---- how long the walk back takes (each dog rejoins wherever the schedule then has it)
  const trEst = Tr + 2.5;
  const bN = sys.baseState(nala, ts + trEst), bD = sys.baseState(dax, ts + trEst);
  const dDist = Math.hypot(Qf[0] - bD.x, Qf[1] - bD.z), nDist = Math.hypot(Nf2[0] - bN.x, Nf2[1] - bN.z);
  if (dDist > 22 || nDist > 30) return no('farBack');
  // the straight runs (Nala's run in, both dogs' way back) never cut through the firepit's ring of seats
  const clearLeg = (p, q) => !(sys.nav?.keepOuts || []).some(k => closestOnSeg(k.x, k.z, p[0], p[1], q[0], q[1])[2] < (k.r + 0.3) ** 2);
  if (!clearLeg(N0, S) || !clearLeg(Qf, [bD.x, bD.z]) || !clearLeg(Nf2, [bN.x, bN.z])) return no('pit');
  const homeAgain = porch && Math.hypot(bD.x - D0[0], bD.z - D0[1]) < 0.4;   // back up the porch steps
  const dHome = homeAgain ? [Qf, ...exit.slice().reverse(), D0] : null;
  const retD = Math.max(1.4, Math.min(6.5, (dHome ? polylineLength(dHome) : dDist) / 3.2)), retN = Math.max(1.4, Math.min(5.5, nDist / RETURN_RUN));
  const te = Tr + Math.max(retD, retN);

  const faceS = faceTo(S[0], S[1], P1[0], P1[1]);
  const events = [
    { u: T0 + 0.15, dog: 'nala', text: 'Play? PLAY?' },
    { u: Ti, sfx: 'dogthump', at: daxWin ? 'nala' : 'dax', size: 1.2 },
    daxWin ? { u: Ti + 0.5, dog: 'dax', text: '*happy wuff!*' } : { u: Ti + 0.35, dog: 'dax', text: '*oof!*', silent: true },
    daxWin ? { u: nalaTumbleAt + 0.1, dog: 'nala', text: '*whoops!*', silent: true } : { u: Ti + 0.9, dog: 'nala', text: 'Gotcha!' },
    { u: Tc + 0.5, dog: 'nala', text: 'Zoomies!!' },
    { u: Tc + 1.8, dog: 'dax', text: '*happy wuff!*' },
    { u: Ts + 0.5, sfx: 'dogthump', at: 'dax', size: 1.2 },
    { u: Ts + 0.9, dog: 'nala', text: 'BORK! Won!' },
    { u: Ts + 2.6, dog: 'dax', text: '*pant pant*', silent: true },
  ];
  return {
    j, ts, dur: te, te, events,
    g: { S, D0, N0, a, P1, Cn, Sd, Nf1, C, R, th0, dir, Qd, Qn, Wp, C2, Nf2, Qf, daxWin, dPath, dHome, exit },
    t: { T0, tN, tD, T1, Ti, Tc, Te, Ts, Tr, retN, retD, nalaTumbleAt, CH },
    circ, thD, thN, faceS,
  };
}

// The two dogs at shared time t, or null when no episode is running.
export function episodeState(sys, t) {
  const j = Math.floor(t / EP_SLOT);
  const ep = episodeOf(sys, j);
  if (!ep) return null;
  const u = t - ep.ts;
  if (u < 0 || u > ep.te) return null;
  return { ep, u, nala: nalaAt(sys, ep, u, t), dax: daxAt(sys, ep, u, t) };
}

function finish(pos, yawGuess, anim, t0, u, extra = null) {
  return { x: pos[0], z: pos[1], yaw: yawGuess, anim, at: u - t0, ...extra };
}

// speed and heading from the motion itself
function withMotion(fn, u) {
  const a = fn(u), b = fn(u + 0.05);
  const dx = b.x - a.x, dz = b.z - a.z, sp = Math.hypot(dx, dz) / 0.05;
  if (a.speed === undefined) a.speed = sp;
  if (a.yaw === undefined || a.yaw === null) a.yaw = sp > 0.3 ? Math.atan2(dx, dz) : (a.yaw0 ?? 0);
  return a;
}

function nalaAt(sys, ep, u, t) {
  const { g, t: T } = ep;
  const nala = sys.dog('nala');
  const pos = (P, yaw, anim, t0, extra) => finish(P, yaw, anim, t0, u, extra);
  const S = g.S;
  const still = P => ({ speed: 0 });
  if (u < T.T0) {
    const k = easeOut(u / T.tN);
    const P = lerp2(g.N0, g.P1, k);
    return withMotion(uu => finish(lerp2(g.N0, g.P1, easeOut(uu / T.tN)), uu < T.tN ? undefined : ep.faceS + Math.PI, uu < T.tN ? null : 'wag', 0, uu, uu < T.tN ? null : { speed: 0 }), u);
  }
  if (u < T.T1) return pos(g.P1, ep.faceS + Math.PI, 'playbow', T.T0, still());
  const facingDax = P => faceTo(P[0], P[1], S[0], S[1]);
  if (u < T.T1 + 0.62) { // the pounce
    const u1 = u - T.T1;
    let P;
    if (!g.daxWin) P = u1 < 0.5 ? lerp2(g.P1, g.Cn, Math.pow(u1 / 0.5, 1.6)) : lerp2(g.Cn, g.Nf1, easeOut((u1 - 0.5) / 0.12));
    else P = lerp2(g.P1, g.Nf1, Math.pow(u1 / 0.62, 1.15));
    return pos(P, ep.faceS + Math.PI, 'slam', T.T1, still());
  }
  if (u < T.Tc - 0.6) {
    if (g.daxWin) {
      const uu = u - T.nalaTumbleAt;
      const P = lerp2(g.Nf1, add(g.Nf1, g.a, -0.7), easeOut(uu / 0.6));
      return pos(P, ep.faceS + Math.PI, 'tumble', T.nalaTumbleAt, still());
    }
    return pos(g.Nf1, faceTo(g.Nf1[0], g.Nf1[1], g.Sd[0], g.Sd[1]), 'bounce', T.T1 + 0.62, still());
  }
  const startP = g.daxWin ? add(g.Nf1, g.a, -0.7) : g.Nf1;
  const nq0 = ep.circ(ep.thN(0));
  if (u < T.Tc) { // wheel round and get away
    const k = ease((u - (T.Tc - 0.6)) / 0.6);
    return withMotion(uu => finish(lerp2(startP, nq0, ease((uu - (T.Tc - 0.6)) / 0.6)), undefined, null, 0, uu), u);
  }
  if (u < T.Te) {
    return withMotion(uu => finish(ep.circ(ep.thN(uu - T.Tc)), undefined, null, T.Tc, uu), u);
  }
  if (u < T.Ts) { // she spins round for another run at him
    return withMotion(uu => finish(lerp2(g.Qn, g.Wp, easeOut((uu - T.Te) / 0.65)), undefined, null, T.Te, uu), u);
  }
  if (u < T.Ts + 0.72) {
    const u1 = u - T.Ts;
    const yaw = faceTo(g.Wp[0], g.Wp[1], g.Qd[0], g.Qd[1]);
    const P = u1 < 0.5 ? lerp2(g.Wp, g.C2, Math.pow(u1 / 0.5, 1.6)) : lerp2(g.C2, g.Nf2, easeOut((u1 - 0.5) / 0.22));
    return pos(P, yaw, 'slam', T.Ts, still());
  }
  const yawD = faceTo(g.Nf2[0], g.Nf2[1], g.Qf[0], g.Qf[1]);
  if (u < T.Ts + 2.2) return pos(g.Nf2, yawD, 'bounce', T.Ts + 0.72, still());
  if (u < T.Tr) return pos(g.Nf2, yawD, 'pant', T.Ts + 2.2, still());
  // trot back to wherever the day says she should be
  const ret = u - T.Tr, base = sys.baseState(nala, t);
  const k = ease(ret / T.retN);
  const P = lerp2(g.Nf2, [base.x, base.z], k);
  const dx = base.x - g.Nf2[0], dz = base.z - g.Nf2[1];
  const moving = ret < T.retN;
  return { x: P[0], z: P[1], yaw: moving ? Math.atan2(dx, dz) : base.yaw, speed: moving ? Math.hypot(dx, dz) / T.retN * 1.4 : 0, anim: moving ? null : base.anim, at: null };
}

function daxAt(sys, ep, u, t) {
  const { g, t: T } = ep;
  const dax = sys.dog('dax');
  const pos = (P, yaw, anim, t0, extra) => finish(P, yaw, anim, t0, u, extra);
  const still = { speed: 0 };
  const faceN = faceTo(g.S[0], g.S[1], g.P1[0], g.P1[1]);
  if (u < T.T0) {
    if (g.dPath.length > 1 && u < T.tD) {
      const [x, z, dx, dz] = alongPolyline(g.dPath, u * DAX_WALK);
      return { x, z, yaw: Math.atan2(dx, dz), speed: DAX_WALK, anim: null, at: null };
    }
    return pos(g.S, faceN, 'wag', 0, still);
  }
  if (g.daxWin) {
    if (u < T.Ti - 0.2) return pos(g.S, faceN, 'wag', T.T0, still);
    if (u < T.Ti + 0.6) return pos(g.S, faceN, 'playbow', T.Ti - 0.2, still);
    if (u < T.Tc) return pos(g.S, faceTo(g.S[0], g.S[1], g.Nf1[0], g.Nf1[1]), 'happy', T.Ti + 0.6, still);
  } else {
    if (u < T.Ti) return pos(g.S, faceN, 'wag', T.T0, still);
    if (u < T.Ti + TUMBLE_DUR) {
      const P = lerp2(g.S, g.Sd, easeOut((u - T.Ti) / 0.55));
      return pos(P, faceN, 'tumble', T.Ti, still);
    }
  }
  if (u < T.Te) {
    return withMotion(uu => finish(ep.circ(ep.thD(uu - T.Tc)), undefined, 'lope', T.Tc, uu), u);
  }
  const faceW = faceTo(g.Qd[0], g.Qd[1], g.Wp[0], g.Wp[1]);
  const tangent = [-Math.sin(ep.thD(T.CH)) * g.dir, Math.cos(ep.thD(T.CH)) * g.dir];
  if (u < T.Ts + 0.5) { // skids to a stop, wagging, watching her line up
    const P = add(g.Qd, tangent, 0.6 * easeOut((u - T.Te) / 0.5));
    const moving = u - T.Te < 0.5;
    return { x: P[0], z: P[1], yaw: moving ? Math.atan2(tangent[0], tangent[1]) : faceW, speed: moving ? 3 * (1 - (u - T.Te) / 0.5) : 0, anim: moving ? null : 'wag', at: null };
  }
  const Qs = add(g.Qd, tangent, 0.6);
  const Qf = g.Qf;
  const facingN = faceW;
  if (u < T.Ts + 0.5 + FLOP_DUR) {
    const P = lerp2(Qs, Qf, easeOut((u - T.Ts - 0.5) / 0.45));
    return pos(P, facingN, 'flop', T.Ts + 0.5, still);
  }
  if (u < T.Ts + 0.5 + FLOP_DUR + 1.0) return pos(Qf, facingN, 'shake', T.Ts + 0.5 + FLOP_DUR, still);
  if (u < T.Tr) return pos(Qf, facingN, 'pant', T.Ts + 0.5 + FLOP_DUR + 1.0, still);
  const ret = u - T.Tr, base = sys.baseState(dax, t);
  if (ret < T.retD) {
    if (g.dHome) {
      const len = polylineLength(g.dHome);
      const [x, z, dx, dz] = alongPolyline(g.dHome, ease(ret / T.retD) * len);
      return { x, z, yaw: Math.atan2(dx, dz), speed: len / T.retD * 1.3, anim: null, at: null };
    }
    const k = ease(ret / T.retD), dx = base.x - Qf[0], dz = base.z - Qf[1];
    return { x: Qf[0] + dx * k, z: Qf[1] + dz * k, yaw: Math.atan2(dx, dz), speed: Math.hypot(dx, dz) / T.retD * 1.3, anim: null, at: null };
  }
  return { x: base.x, z: base.z, yaw: base.yaw, speed: base.speed, anim: base.anim, at: null };
}
