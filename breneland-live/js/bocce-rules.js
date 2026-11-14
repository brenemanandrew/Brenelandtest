// Bocce: the court, the ball physics, the rules and the bots. Shared word for word by the server (lib/bocce.js imports
// this very file) and the browser, so there are no imports here, no DOM and no Math.random (callers pass an rng).
//
// Everything is in COURT coordinates: metres, x across the court (-W/2..W/2), z along it (-L/2 north end .. +L/2 south
// end), y up from the playing surface. The client places the court in the world (layout.js BOCCE).
//
// Determinism: the integrator uses a fixed step, a fixed order and only + - * / and Math.sqrt, which are exact
// (IEEE-754) in every engine, so the same inputs give bit-identical results on the server and on every screen. The
// server still sends the final resting spots and everybody adopts them. Trig only happens where a throw's aim and power
// become a launch velocity, on the server, and that velocity is rounded before anyone simulates it.

export const COURT = { L: 18, W: 3.6, FOUL: 1.3, BOARD: 0.16, BOARD_H: 0.24 };
export const R_BALL = 0.09, R_PAL = 0.055;      // chunky cartoon balls (a real bocce ball is 0.107 m across)
export const M_BALL = 1, M_PAL = 0.22;
export const NB = 9;                            // 0 = pallino, 1-4 = team 0 (red), 5-8 = team 1 (green)
export const PH = {
  DT: 1 / 240, G: 9.81,
  MU: 0.95, DRAG: 0.1,                          // rolling on crushed stone: a constant drag plus a little more when fast (m/s^2)
  E_BALL: 0.8, E_BOARD: 0.5, BOUNCE: 0.26,      // restitution: ball on ball, ball on the boards, landing on the stone
  REST: 0.015, MAX_T: 24,
  LOFT: 0.3, HAND_Y: 0.42,                      // underhand release: a short hop through the air, then it rolls
  AIM_MAX: 0.3, V_LO: 1.55, V_HI: 7.6,
};
export const TIE = 0.002;                       // two balls closer than 2 mm to the same distance are a tie
export const TEAMS = ['Red', 'Green'];

export const teamOf = i => (i === 0 ? -1 : i <= 4 ? 0 : 1);
export const radius = i => (i === 0 ? R_PAL : R_BALL);
const mass = i => (i === 0 ? M_PAL : M_BALL);
export const round4 = v => Math.round(v * 1e4) / 1e4;
export const releaseZ = end => end * (COURT.L / 2 - COURT.FOUL + 0.1);  // the ball leaves the hand just behind the foul line
export const standZ = end => end * (COURT.L / 2 - COURT.FOUL + 0.62);   // where the thrower stands
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ throwing

// aim: radians off the straight line, + = to the thrower's left; power 0..1 (distance grows about linearly with it).
export function speedOf(power) { const p = clamp(power, 0, 1); return Math.sqrt(PH.V_LO * PH.V_LO + p * (PH.V_HI * PH.V_HI - PH.V_LO * PH.V_LO)); }
export function launchOf(end, aim, power, x0 = 0) {
  const a = clamp(Number(aim) || 0, -PH.AIM_MAX, PH.AIM_MAX), v = speedOf(Number(power) || 0), dir = -end;
  const hv = v * Math.cos(PH.LOFT);
  return {
    x: round4(clamp(x0, -1, 1)), y: PH.HAND_Y, z: round4(releaseZ(end)),
    vx: round4(dir * hv * Math.sin(a)), vy: round4(v * Math.sin(PH.LOFT)), vz: round4(dir * hv * Math.cos(a)),
  };
}

// ------------------------------------------------------------------ the simulation
// pos: NB entries, [x, z] for a ball at rest on the court or null. Ball `idx` starts from launch {x,y,z,vx,vy,vz}.
// Events land in sim.ev as [kind, t, i, j, strength]: 1 clack (ball on ball), 2 board, 3 landing thump, 4 out.
export const EV = { CLACK: 1, BOARD: 2, THUMP: 3, OUT: 4 };
export function makeSim(pos, idx, launch) {
  const s = {
    t: 0, done: false, idx,
    x: new Float64Array(NB), y: new Float64Array(NB), z: new Float64Array(NB),
    vx: new Float64Array(NB), vy: new Float64Array(NB), vz: new Float64Array(NB),
    live: new Uint8Array(NB), rest: new Uint8Array(NB), ev: [],
  };
  for (let i = 0; i < NB; i++) {
    const p = pos && pos[i];
    if (p && i !== idx) { s.x[i] = p[0]; s.z[i] = p[1]; s.y[i] = radius(i); s.live[i] = 1; s.rest[i] = 1; }
  }
  if (idx >= 0 && launch) {
    s.x[idx] = launch.x; s.y[idx] = launch.y; s.z[idx] = launch.z;
    s.vx[idx] = launch.vx; s.vy[idx] = launch.vy; s.vz[idx] = launch.vz;
    s.live[idx] = 1; s.rest[idx] = 0;
  }
  return s;
}

export function stepSim(s) {
  if (s.done) return;
  const dt = PH.DT, hw0 = COURT.W / 2, hl0 = COURT.L / 2;
  const { x, y, z, vx, vy, vz, live, rest } = s;
  for (let i = 0; i < NB; i++) {
    if (!live[i] || rest[i]) continue;
    const r = radius(i);
    if (y[i] > r || vy[i] > 0) {
      // in the air: a short underhand hop
      vy[i] -= PH.G * dt;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
      if (y[i] <= r) {
        y[i] = r;
        if (vy[i] < -0.9) { s.ev.push([EV.THUMP, s.t, i, -1, -vy[i]]); vy[i] = -vy[i] * PH.BOUNCE; vx[i] *= 0.84; vz[i] *= 0.84; }
        else { if (vy[i] < -0.25) s.ev.push([EV.THUMP, s.t, i, -1, -vy[i]]); vy[i] = 0; }
      }
    } else {
      // rolling: slows down by a constant amount plus a little more when it is fast
      vy[i] = 0; y[i] = r;
      const sp = Math.sqrt(vx[i] * vx[i] + vz[i] * vz[i]);
      if (sp > 0) {
        const dec = (PH.MU + PH.DRAG * sp) * dt;
        if (dec >= sp) { vx[i] = 0; vz[i] = 0; } else { const k = (sp - dec) / sp; vx[i] *= k; vz[i] *= k; }
      }
      x[i] += vx[i] * dt; z[i] += vz[i] * dt;
    }
    // the boards: bounce off them, unless the ball is flying over the top (then it is out)
    const hw = hw0 - r, hl = hl0 - r, low = y[i] - r < COURT.BOARD_H;
    if (x[i] > hw || x[i] < -hw) {
      const sd = x[i] > 0 ? 1 : -1;
      if (low) { x[i] = sd * hw; if (vx[i] * sd > 0) { s.ev.push([EV.BOARD, s.t, i, -1, vx[i] * sd]); vx[i] = -vx[i] * PH.E_BOARD; vz[i] *= 0.9; } }
      else if (x[i] * sd > hw0 + r) { live[i] = 0; s.ev.push([EV.OUT, s.t, i, -1, 0]); continue; }
    }
    if (z[i] > hl || z[i] < -hl) {
      const sd = z[i] > 0 ? 1 : -1;
      if (low) { z[i] = sd * hl; if (vz[i] * sd > 0) { s.ev.push([EV.BOARD, s.t, i, -1, vz[i] * sd]); vz[i] = -vz[i] * PH.E_BOARD; vx[i] *= 0.9; } }
      else if (z[i] * sd > hl0 + r) { live[i] = 0; s.ev.push([EV.OUT, s.t, i, -1, 0]); continue; }
    }
  }
  // ball on ball, in 3D (a flying ball can land on another), fixed pair order
  for (let i = 0; i < NB; i++) {
    if (!live[i]) continue;
    for (let j = i + 1; j < NB; j++) {
      if (!live[j] || (rest[i] && rest[j])) continue;
      const dx = x[i] - x[j], dy = y[i] - y[j], dz = z[i] - z[j];
      const R = radius(i) + radius(j), d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R * R || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
      const vn = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny + (vz[i] - vz[j]) * nz;
      const wi = 1 / mass(i), wj = 1 / mass(j), ws = wi + wj;
      if (vn < 0) {
        const J = -(1 + PH.E_BALL) * vn / ws;
        vx[i] += J * wi * nx; vy[i] += J * wi * ny; vz[i] += J * wi * nz;
        vx[j] -= J * wj * nx; vy[j] -= J * wj * ny; vz[j] -= J * wj * nz;
        s.ev.push([EV.CLACK, s.t, i, j, -vn]);
        rest[i] = 0; rest[j] = 0;
      }
      const push = (R - d) / ws;
      x[i] += nx * push * wi; y[i] += ny * push * wi; z[i] += nz * push * wi;
      x[j] -= nx * push * wj; y[j] -= ny * push * wj; z[j] -= nz * push * wj;
      if (y[i] < radius(i)) y[i] = radius(i);
      if (y[j] < radius(j)) y[j] = radius(j);
    }
  }
  // come to rest
  let moving = 0;
  for (let i = 0; i < NB; i++) {
    if (!live[i] || rest[i]) continue;
    const r = radius(i);
    if (y[i] <= r && vy[i] <= 0 && vx[i] * vx[i] + vz[i] * vz[i] < PH.REST * PH.REST) { vx[i] = 0; vy[i] = 0; vz[i] = 0; y[i] = r; rest[i] = 1; }
    else moving++;
  }
  s.t += dt;
  if (!moving || s.t >= PH.MAX_T) {
    s.done = true;
    for (let i = 0; i < NB; i++) { rest[i] = 1; vx[i] = vy[i] = vz[i] = 0; if (live[i]) y[i] = radius(i); }
  }
}

// Where everything came to rest, rounded (that rounding is what everybody stores).
export function restOf(s) {
  const out = new Array(NB).fill(null);
  for (let i = 0; i < NB; i++) if (s.live[i]) out[i] = [round4(s.x[i]), round4(s.z[i])];
  return out;
}
export function runSim(pos, idx, launch) {
  const s = makeSim(pos, idx, launch);
  while (!s.done) stepSim(s);
  return { after: restOf(s), dur: Math.round(s.t * 1000) / 1000, sim: s };
}

// How far a lone ball rolls along the court for a power (for the aiming guide and the bots). Cached table, aim 0.
let table = null;
export function rollTable() {
  if (table) return table;
  table = [];
  for (let k = 0; k <= 64; k++) {
    const p = k / 64, r = runSim(null, 1, launchOf(-1, 0, p));
    table.push(r.after[1] ? r.after[1][1] - releaseZ(-1) : 0);
  }
  return table;
}
export function distForPower(p) {
  const t = rollTable(), f = clamp(p, 0, 1) * 64, k = Math.min(63, Math.floor(f));
  return t[k] + (t[k + 1] - t[k]) * (f - k);
}
export function powerForDist(d) {
  const t = rollTable();
  if (d <= t[0]) return 0;
  for (let k = 0; k < 64; k++) {
    if (t[k + 1] <= t[k]) return k / 64;        // the far board stops it: no further
    if (d <= t[k + 1]) return (k + (d - t[k]) / (t[k + 1] - t[k])) / 64;
  }
  return 1;
}

// ------------------------------------------------------------------ measuring and scoring

export function dists(pos) {
  const out = new Array(NB).fill(Infinity);
  const p = pos[0];
  if (!p) return out;
  for (let i = 1; i < NB; i++) {
    const b = pos[i];
    if (b) { const dx = b[0] - p[0], dz = b[1] - p[1]; out[i] = Math.sqrt(dx * dx + dz * dz); }
  }
  out[0] = 0;
  return out;
}
export function bestOf(d) {
  let b0 = Infinity, b1 = Infinity, i0 = -1, i1 = -1;
  for (let i = 1; i <= 4; i++) if (d[i] < b0) { b0 = d[i]; i0 = i; }
  for (let i = 5; i <= 8; i++) if (d[i] < b1) { b1 = d[i]; i1 = i; }
  return { b: [b0, b1], i: [i0, i1] };
}
// Who holds the point right now: { team: 0 | 1 | -1 (tie or nobody), by: margin, count: balls ahead }
export function standing(pos) {
  const d = dists(pos), { b } = bestOf(d);
  if (!pos[0] || (b[0] === Infinity && b[1] === Infinity)) return { team: -1, by: 0, count: 0, tie: false };
  if (Math.abs(b[0] - b[1]) < TIE) return { team: -1, by: 0, count: 0, tie: true };
  const w = b[0] < b[1] ? 0 : 1, lose = b[1 - w];
  let count = 0;
  for (let i = w * 4 + 1; i <= w * 4 + 4; i++) if (d[i] < lose - TIE) count++;
  return { team: w, by: lose - b[w], count, tie: false };
}
// The end of a frame: only the closest team scores, a point for each of its balls closer than the other team's closest.
// A tie for closest, or a pallino knocked off the court, is a dead frame: nobody scores.
export function frameScore(pos) {
  if (!pos[0]) return { team: -1, points: 0, dead: true, why: 'pallino' };
  const s = standing(pos);
  if (s.tie) return { team: -1, points: 0, dead: true, why: 'tie' };
  if (s.team < 0) return { team: -1, points: 0, dead: true, why: 'none' };
  return { team: s.team, points: s.count, dead: false, why: '', by: s.by };
}
export function pallinoLegal(p, end) {
  if (!p) return false;
  return -end * p[1] > 0.05 && Math.abs(p[0]) < COURT.W / 2 - R_PAL + 1e-9 && Math.abs(p[1]) < COURT.L / 2 - R_PAL + 1e-9;
}

// ------------------------------------------------------------------ a match
// seats: [{ team, slot, kind: 'human' | 'bot', ... }] in the order team 0 slot 0, (team 0 slot 1,) team 1 slot 0, (team 1 slot 1).
// Everything the server keeps about the game lives in this plain object, so it can be sent, tested and inspected.
export function newMatch({ seats, target = 7, size = 2, firstTeam = 0 }) {
  const m = {
    seats, target: target === 12 ? 12 : 7, size: size === 1 ? 1 : 2,
    score: [0, 0], frameNo: 0, end: -1, palTeam: firstTeam ? 1 : 0,
    phase: 'pallino', turn: -1, pos: new Array(NB).fill(null), thrown: [0, 0], seatThrows: seats.map(() => 0),
    lastSeat: [-1, -1], lastTeam: -1, palTries: 0, palThrowTeam: 0, rolling: null, last: null, winner: -1, history: [],
  };
  startFrame(m);
  return m;
}
export const seatsOf = (m, team) => m.seats.map((s, i) => (s.team === team ? i : -1)).filter(i => i >= 0);
export const ballsLeft = (m, team) => 4 - m.thrown[team];

export function startFrame(m) {
  m.pos = new Array(NB).fill(null);
  m.thrown = [0, 0]; m.seatThrows = m.seats.map(() => 0); m.lastSeat = [-1, -1]; m.lastTeam = -1;
  m.palTries = 0; m.palThrowTeam = m.palTeam; m.rolling = null;
  m.phase = 'pallino'; m.turn = palThrower(m, m.palTeam);
}
// the pallino goes round the team's players frame by frame
export function palThrower(m, team) {
  const list = seatsOf(m, team);
  return list[(m.frameNo + (team === m.palTeam ? 0 : 1)) % list.length];
}
// Players on a team take turns: whoever has thrown fewer balls this frame, not the same person twice in a row.
export function nextThrower(m, team) {
  const quota = 4 / m.size, list = seatsOf(m, team).filter(i => m.seatThrows[i] < quota);
  if (!list.length) return -1;
  list.sort((a, b) => (m.seatThrows[a] - m.seatThrows[b]) || ((a === m.lastSeat[team]) - (b === m.lastSeat[team]))
    || (((m.seats[a].slot + m.frameNo) % m.size) - ((m.seats[b].slot + m.frameNo) % m.size)));
  return list[0];
}
// After the first ball the team that is NOT closest bowls, until it is closest or out of balls.
export function nextTeam(m) {
  const l0 = ballsLeft(m, 0), l1 = ballsLeft(m, 1);
  if (!l0 && !l1) return -1;
  if (!l0) return 1;
  if (!l1) return 0;
  if (m.thrown[0] + m.thrown[1] === 0) return m.palTeam;
  const { b } = bestOf(dists(m.pos));
  if (b[0] === Infinity && b[1] === Infinity) return m.lastTeam === 0 ? 1 : 0;
  if (Math.abs(b[0] - b[1]) < TIE) return m.lastTeam >= 0 ? m.lastTeam : m.palTeam; // a tie: the last to bowl goes again
  return b[0] < b[1] ? 1 : 0;
}
export function nextBallIdx(m, team) { return team * 4 + 1 + m.thrown[team]; }

// The player whose turn it is throws. Returns the roll (what everybody animates) or null when it is not allowed.
export function bowl(m, seat, aim, power) {
  if ((m.phase !== 'pallino' && m.phase !== 'ball') || seat !== m.turn) return null;
  const team = m.seats[seat].team;
  const idx = m.phase === 'pallino' ? 0 : nextBallIdx(m, team);
  if (idx > 0 && (team !== nextTeam(m) || ballsLeft(m, team) <= 0)) return null;
  const launch = launchOf(m.end, aim, power);
  const before = m.pos.map(p => (p ? p.slice() : null));
  const r = runSim(before, idx, launch);
  if (idx > 0) { m.thrown[team]++; m.seatThrows[seat]++; m.lastTeam = team; m.lastSeat[team] = seat; }
  else m.palTries++;
  m.rolling = { idx, seat, team, launch, before, after: r.after, dur: r.dur, end: m.end };
  m.phase = 'rolling';
  return m.rolling;
}

// The balls have stopped: adopt where they are and decide what happens next. Returns an event for the announcer.
export function settle(m) {
  if (m.phase !== 'rolling' || !m.rolling) return null;
  const r = m.rolling;
  m.pos = r.after.map(p => (p ? p.slice() : null));
  m.rolling = null;
  if (r.idx === 0) {
    if (pallinoLegal(m.pos[0], m.end)) { m.phase = 'ball'; m.turn = nextThrower(m, nextTeam(m)); return { ev: 'pallino', team: r.team, seat: r.seat }; }
    m.pos[0] = null;
    if (m.palTries >= 2) { // both teams missed: the referee sets it in the middle of the far half
      m.pos[0] = [0, round4(-m.end * COURT.L / 4)];
      m.phase = 'ball'; m.turn = nextThrower(m, nextTeam(m));
      return { ev: 'placed', team: r.team, seat: r.seat };
    }
    m.palThrowTeam = 1 - m.palThrowTeam;
    m.phase = 'pallino'; m.turn = palThrower(m, m.palThrowTeam);
    return { ev: 'redo', team: r.team, seat: r.seat, next: m.palThrowTeam };
  }
  if (!m.pos[0]) return endFrame(m, r);
  const t = nextTeam(m);
  if (t < 0) return endFrame(m, r);
  m.phase = 'ball'; m.turn = nextThrower(m, t);
  const st = standing(m.pos);
  return { ev: 'ball', team: r.team, seat: r.seat, idx: r.idx, next: t, lead: st.team, by: st.by };
}
function endFrame(m, r) {
  const res = frameScore(m.pos);
  if (res.team >= 0) m.score[res.team] += res.points;
  m.last = { frame: m.frameNo, team: res.team, points: res.points, dead: res.dead, why: res.why, by: res.by || 0, score: m.score.slice() };
  m.history.push([res.team, res.points]);
  m.phase = 'result'; m.turn = -1;
  if (m.score[0] >= m.target || m.score[1] >= m.target) m.winner = m.score[0] > m.score[1] ? 0 : 1;
  return { ev: 'frame', ...m.last, seat: r ? r.seat : -1, idx: r ? r.idx : -1 };
}
// After the result has been shown: the next frame, thrown from the other end, or the end of the game.
export function nextFrame(m) {
  if (m.phase !== 'result') return;
  if (m.winner >= 0) { m.phase = 'over'; return; }
  m.frameNo++;
  m.end = -m.end;
  m.palTeam = m.last && m.last.team >= 0 ? m.last.team : 1 - m.palTeam; // the winner of the frame has the pallino; a dead frame passes it
  startFrame(m);
}

// ------------------------------------------------------------------ the bots
export const BOTS = [
  { name: 'Nonna Rosa', aim: 0.009, pow: 0.02, smash: 0.2,
    good: ['Bellissimo!', 'Like my mother taught me.', 'Ha! Still got it.', 'Now that is bocce.'],
    bad: ['Mamma mia...', 'The stones are bumpy today.', 'My glasses, where are my glasses?'],
    hit: ['Out of the way, dear!', 'Pow!', 'Sorry, not sorry.'], win: ['Who wants cannoli?', 'Good game, good game.'] },
  { name: 'Uncle Sal', aim: 0.02, pow: 0.045, smash: 0.8,
    good: ['Oh ho! Did you see that?', 'Smooth like butter.', 'That is the Sal special!'],
    bad: ['That one was a warm-up.', 'The wind got it!', 'I meant to do that.'],
    hit: ['BOOM!', 'Clear the lane!', 'Bocce is a contact sport!'], win: ['Undefeated! Mostly.', 'Uncle Sal wins again!'] },
  { name: 'Cousin Gina', aim: 0.013, pow: 0.03, smash: 0.45,
    good: ['Nailed it.', 'Right where I wanted it.', 'Easy peasy.'],
    bad: ['Ugh, too much juice.', 'Rats.', 'That ball has a mind of its own.'],
    hit: ['Knock knock!', 'Bye bye!', 'Sorry! Kind of.'], win: ['GG everybody!', 'That was fun, again?'] },
  { name: 'Little Vinnie', aim: 0.026, pow: 0.06, smash: 0.6,
    good: ['Whoa, I did it!', 'Did everyone see?!', 'Yesss!'],
    bad: ['Oops!', 'Can I go again?', 'It slipped!'],
    hit: ['Crash!', 'Kaboom!', 'Hee hee!'], win: ['We won! We won!', 'Best day ever!'] },
];

function gauss(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }

// What a bot would like to throw ({ aim, power, plan }), before its hand shakes. Tries a handful of throws in the
// simulator and keeps the one that leaves its team best off.
export function botChoice(m, seat, rng) {
  const team = m.seats[seat].team, end = m.end, rz = releaseZ(end), dir = -end;
  const pers = BOTS[m.seats[seat].bot | 0] || BOTS[0];
  if (m.phase === 'pallino') {
    return { aim: 0, power: powerForDist(Math.abs(-end * COURT.L * 0.3 - rz)), plan: 'pallino' };
  }
  const aimAt = (px, pz, stopShort) => {
    const dz = (pz - rz) * dir, dx = px;
    const aim = Math.atan2(dx * dir, dz);
    return { aim, dist: Math.sqrt(dx * dx + dz * dz) - stopShort };
  };
  const cands = [];
  const p = m.pos[0];
  const pt = aimAt(p[0], p[1], 0.14);
  const basePow = powerForDist(pt.dist);
  for (const da of [-0.05, -0.025, 0, 0.025, 0.05]) for (const dp of [-0.03, 0, 0.025]) cands.push({ aim: pt.aim + da, power: basePow + dp, plan: 'point' });
  // knock the other team's best ball away (hard, straight at it)
  const { i } = bestOf(dists(m.pos));
  const foe = i[1 - team];
  if (foe > 0) {
    const f = m.pos[foe], h = aimAt(f[0], f[1], 0);
    const hp = Math.min(1, powerForDist(h.dist + 5));
    for (const da of [-0.012, 0, 0.012]) cands.push({ aim: h.aim + da, power: hp, plan: 'hit' });
  }
  const idx = nextBallIdx(m, team);
  let best = null, bestV = -Infinity, hit = null, hitV = -Infinity;
  for (const c of cands) {
    const r = runSim(m.pos, idx, launchOf(end, c.aim, c.power));
    const s = standing(r.after);
    let v;
    if (!r.after[0]) v = -1.5;                                  // a dead frame is rarely what you want
    else if (s.team === team) v = s.count + Math.min(0.9, s.by * 2);
    else if (s.team === 1 - team) v = -s.count - Math.min(0.9, s.by * 2);
    else v = 0;
    if (c.plan === 'hit') { v += (pers.smash - 0.5) * 0.4; if (v > hitV) { hitV = v; hit = c; } } // Sal just likes smashing things
    if (v > bestV) { bestV = v; best = c; }
  }
  // a hitter sometimes goes for the smash anyway when the other team sits right on the pallino
  const st = standing(m.pos);
  if (hit && rng && st.team === 1 - team && dists(m.pos)[foe] < 0.45 && rng() < pers.smash * 0.5) return hit;
  return best;
}
// The bot's hand: aim and power wobble by its skill.
export function botThrow(m, seat, rng) {
  const c = botChoice(m, seat, rng);
  const pers = BOTS[m.seats[seat].bot | 0] || BOTS[0];
  const d = distForPower(c.power) * (1 + gauss(rng) * pers.pow);
  return { aim: c.aim + gauss(rng) * pers.aim, power: clamp(powerForDist(d), 0, 1), plan: c.plan };
}
