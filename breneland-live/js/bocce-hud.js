// The bocce HUD: the lobby card (pick a team, options, start), the score card, the aiming panel (power meter, distance
// readout, touch buttons), the big banners and the confetti. All DOM, all text through textContent.
import { el, loadCss } from './util.js';
import { TEAM_COL } from './bocce-court.js';

const TEAM = ['Red', 'Green'];

export function createBocceHud(ctx, cb) {
  loadCss('/css/bocce.css');
  const root = el('div', 'bocce-hud');
  ctx.hud.append(root);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- the lobby card
  const card = el('div', 'panel bocce-card', '', { role: 'dialog', 'aria-label': 'Bocce' });
  card.hidden = true;
  const cTitle = el('div', 'bc-title', 'Bocce');
  const cSub = el('div', 'bc-sub', '');
  const teams = el('div', 'bc-teams');
  const cols = [0, 1].map(t => {
    const col = el('div', 'bc-team t' + t);
    col.style.setProperty('--tc', TEAM_COL[t]);
    const head = el('div', 'bc-head', TEAM[t]);
    const seats = el('div', 'bc-seats');
    const join = el('button', 'btn bc-join', 'Join ' + TEAM[t], { type: 'button' });
    join.append(el('kbd', '', t ? 'G' : 'R'));
    join.addEventListener('click', () => cb.sit(t));
    col.append(head, seats, join);
    teams.append(col);
    return { col, seats, join };
  });
  const opts = el('div', 'bc-opts');
  const optTarget = el('button', 'btn bc-opt', '', { type: 'button' });
  const optSize = el('button', 'btn bc-opt', '', { type: 'button' });
  optTarget.addEventListener('click', () => cb.toggleTarget());
  optSize.addEventListener('click', () => cb.toggleSize());
  opts.append(optTarget, optSize);
  const note = el('div', 'bc-note', '');
  const row = el('div', 'bc-row');
  const bStart = el('button', 'btn primary bc-start', 'Start', { type: 'button' });
  bStart.append(el('kbd', '', 'Enter'));
  const bLeave = el('button', 'btn bc-leave', 'Leave seat', { type: 'button' });
  bLeave.append(el('kbd', '', 'L'));
  const bClose = el('button', 'btn bc-close', 'Close', { type: 'button' });
  bClose.append(el('kbd', '', 'Esc'));
  bStart.addEventListener('click', () => cb.start());
  bLeave.addEventListener('click', () => cb.stand());
  bClose.addEventListener('click', () => cb.close());
  row.append(bStart, bLeave, bClose);
  card.append(cTitle, cSub, teams, opts, note, row);
  root.append(card);

  // ---------------------------------------------------------------- the score strip
  // One compact strip (bocce-hud, 2026-11-07, Andrew: "too congested"): each team's colour with its score and the balls it has left,
  // the target and the frame in the middle; whose turn is the team's box lit in its colour with an arrow under it (icons over
  // words). The same strip for the players and anybody watching. Words only for a screen reader (aria-label).
  const score = el('div', 'bocce-score', '', { role: 'status' });
  score.hidden = true;
  const sTeams = [0, 1].map(t => {
    const box = el('div', 'bs-team t' + t);
    box.style.setProperty('--tc', TEAM_COL[t]);
    const num = el('b', 'bs-num', '0');
    const dots = el('span', 'bs-dots');
    const d = [0, 1, 2, 3].map(() => { const i = el('i'); dots.append(i); return i; });
    const up = el('i', 'bs-up');           // the turn arrow under the box
    const clock = el('span', 'bs-clock', ''); // seconds left on my turn (the last 15)
    clock.hidden = true;
    if (t === 0) box.append(dots, num, up, clock); else box.append(num, dots, up, clock);
    return { box, num, d, clock };
  });
  const sMid = el('div', 'bs-mid');
  const sTo = el('span', 'bs-to', '');   // first to N (a flag)
  const sFrame = el('span', 'bs-frame', '');
  sMid.append(sTo, sFrame);
  score.append(sTeams[0].box, sMid, sTeams[1].box);
  root.append(score);

  // ---------------------------------------------------------------- aiming: a slim power bar by BOWL, one hint the first time
  const aim = el('div', 'bocce-aim');
  aim.hidden = true;
  const meter = el('div', 'ba-meter', '', { role: 'meter', 'aria-label': 'Throw power', 'aria-valuemin': '0', 'aria-valuemax': '100' });
  const fill = el('i', 'ba-fill');
  const mark = el('span', 'ba-mark');
  mark.title = 'The pallino';
  meter.append(fill, mark);
  aim.append(meter);
  root.append(aim);
  const tip = el('div', 'bocce-tip', '');
  tip.hidden = true;
  root.append(tip);
  const TIP_KEY = 'bocce.tipSeen';
  let tipSeen = !!ctx.store?.get?.(TIP_KEY, false);
  // touch: aim left / right and a big hold-to-bowl button
  const touch = el('div', 'bocce-touch');
  touch.hidden = true;
  const tL = el('button', 'bt-arrow l', '', { type: 'button', 'aria-label': 'Aim left' });
  const tR = el('button', 'bt-arrow r', '', { type: 'button', 'aria-label': 'Aim right' });
  const tBowl = el('button', 'bt-bowl', 'BOWL', { type: 'button', 'aria-label': 'Hold to charge, let go to bowl' });
  touch.append(tL, tR, tBowl);
  root.append(touch);
  const hold = (btn, on, off) => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); btn.classList.add('press'); on(); });
    const up = () => { if (btn.classList.contains('press')) { btn.classList.remove('press'); off(); } };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
  };
  hold(tL, () => cb.touchAim(1), () => cb.touchAim(0));
  hold(tR, () => cb.touchAim(-1), () => cb.touchAim(0));
  hold(tBowl, () => cb.touchBowl(true), () => cb.touchBowl(false));

  // ---------------------------------------------------------------- banners and confetti
  const banner = el('div', 'bocce-banner');
  banner.hidden = true;
  const bBig = el('div', 'bb-big', ''), bSmall = el('div', 'bb-small', '');
  banner.append(bBig, bSmall);
  root.append(banner);
  let bannerTimer = 0;
  let lastKey = '', aimKey = '';
  const confettiBox = el('div', 'bocce-confetti');
  root.append(confettiBox);

  const api = {
    root, card, score, aim,
    get cardOpen() { return !card.hidden; },
    showCard() { card.hidden = false; },
    hideCard() { card.hidden = true; },
    // v = { phase, seats (lobby 4 or match seats), target, size, host, cd, meSid, mine (my lobby seat index), online, busy }
    renderCard(v) {
      const lobbyish = v.phase === 'lobby' || v.phase === 'countdown';
      cSub.textContent = `First to ${v.target} points  -  ${v.size === 1 ? '1 v 1' : '2 v 2'}`;
      for (const t of [0, 1]) {
        const c = cols[t];
        c.seats.replaceChildren();
        for (let slot = 0; slot < v.size; slot++) {
          const s = lobbyish ? v.seats[t * 2 + slot] : v.seats.find(x => x.team === t && x.slot === slot);
          const line = el('div', 'bc-seat' + (s ? (s.k === 'b' ? ' bot' : ' human') : ' empty') + (s && s.sid === v.meSid ? ' me' : ''));
          line.textContent = s ? (s.n + (s.sid === v.meSid ? ' (you)' : '') + (s.k === 'b' ? ' (bot)' : '')) : 'Empty - a bot will play';
          c.seats.append(line);
        }
        const mineHere = v.mine >= 0 && v.mine >> 1 === t;
        c.join.disabled = !lobbyish || mineHere || !v.online;
      }
      const host = v.host === v.meSid;
      optTarget.replaceChildren(document.createTextNode(`Game to ${v.target}`), el('kbd', '', 'T'));
      optSize.replaceChildren(document.createTextNode(v.size === 1 ? '1 v 1' : '2 v 2'), el('kbd', '', 'F'));
      optTarget.disabled = optSize.disabled = !host || !lobbyish;
      bStart.disabled = !lobbyish || v.mine < 0 || v.phase === 'countdown';
      bLeave.disabled = !lobbyish || v.mine < 0;
      let n = '';
      if (!v.online) n = 'Bocce needs the connection to the yard. Hang on...';
      else if (v.phase === 'countdown') n = `Starting in ${Math.ceil(v.cd / 1000)}...`;
      else if (!lobbyish) n = 'A game is on. Watch from the side, or join the next one.';
      else if (v.mine < 0) n = 'Pick a team. Empty seats get a friendly bot.';
      else if (!host) n = 'The host picks the options. Press Start when you are ready.';
      else n = 'You are the host: pick the options, then Start. Empty seats get bots.';
      note.textContent = n;
    },
    // v = { score, target, frame, left: [n, n], turnTeam (-1 = nobody), turnMine, secs (my seconds left, or null), say (for a screen reader) }
    // Called every frame: the DOM is written only when something changed.
    setScore(v) {
      if (!v) { if (!score.hidden) { score.hidden = true; lastKey = ''; } return; }
      const key = `${v.score}|${v.target}|${v.frame}|${v.left}|${v.turnTeam}|${v.turnMine}|${v.secs}|${v.say}`;
      if (key === lastKey) return;
      lastKey = key;
      score.hidden = false;
      for (const t of [0, 1]) {
        const s = sTeams[t];
        const n = String(v.score[t]);
        if (s.num.textContent !== n) { s.num.textContent = n; s.box.classList.remove('bump'); void s.box.offsetWidth; if (!reduced) s.box.classList.add('bump'); }
        for (let i = 0; i < 4; i++) s.d[i].classList.toggle('used', i >= v.left[t]);
        s.box.classList.toggle('up', v.turnTeam === t);
        s.box.setAttribute('aria-label', `${TEAM[t]} ${v.score[t]}, ${v.left[t]} ${v.left[t] === 1 ? 'ball' : 'balls'} left`);
        const secs = v.turnTeam === t && v.secs !== null && v.secs !== undefined ? v.secs : null;
        s.clock.hidden = secs === null;
        if (secs !== null) s.clock.textContent = secs + 's';
      }
      score.classList.toggle('mine', !!v.turnMine);
      sTo.textContent = String(v.target);
      sTo.title = `First to ${v.target}`;
      sFrame.textContent = String(v.frame + 1);
      sFrame.title = `Frame ${v.frame + 1}`;
      score.setAttribute('aria-label', v.say || '');
    },
    // device: 'touch' | 'pad' | 'keys'. The bar and (on a touch screen) the arrows and BOWL; one hint the first time ever.
    showAim(device) {
      const t = device === 'touch', pad = device === 'pad';
      if (aim.hidden) aim.hidden = false;
      root.classList.toggle('touch', t);
      if (touch.hidden === t) touch.hidden = !t;
      const want = tipSeen ? '' : t ? 'Hold BOWL, let go to throw' : pad ? 'Stick aims, hold A, let go' : 'A D aim, hold Space, let go';
      if (tip.textContent !== want) tip.textContent = want;
      if (tip.hidden === !!want) tip.hidden = !want;
    },
    hideAim() { if (!aim.hidden) aim.hidden = true; if (!touch.hidden) touch.hidden = true; if (!tip.hidden) tip.hidden = true; },
    // the first throw is done: the hint never shows again (on this device)
    tipDone() { if (tipSeen) return; tipSeen = true; ctx.store?.set?.(TIP_KEY, true); tip.hidden = true; },
    get tipSeen() { return tipSeen; },
    // power 0..1, mark = the power that would reach the pallino (or null)
    setAim(power, markP, charging) {
      const k = `${power.toFixed(3)}|${markP === null || markP === undefined ? '' : markP.toFixed(3)}|${!!charging}`;
      if (k === aimKey) return;
      aimKey = k;
      fill.style.transform = `scaleX(${Math.max(0.01, power).toFixed(3)})`;
      meter.setAttribute('aria-valuenow', String(Math.round(power * 100)));
      meter.classList.toggle('charging', !!charging);
      if (markP === null || markP === undefined) mark.hidden = true; else { mark.hidden = false; mark.style.left = (markP * 100).toFixed(1) + '%'; }
    },
    banner(big, small = '', cls = '', ms = 2600) {
      clearTimeout(bannerTimer);
      banner.className = 'bocce-banner ' + cls;
      bBig.textContent = big; bSmall.textContent = small;
      banner.hidden = false;
      banner.style.animation = 'none'; void banner.offsetWidth; banner.style.animation = '';
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    confetti(colors) {
      if (reduced) return;
      for (let i = 0; i < 70; i++) {
        const c = el('i');
        c.style.left = (Math.random() * 100).toFixed(1) + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDelay = (Math.random() * 0.8).toFixed(2) + 's';
        c.style.animationDuration = (2.2 + Math.random() * 1.6).toFixed(2) + 's';
        c.style.setProperty('--dx', ((Math.random() - 0.5) * 180).toFixed(0) + 'px');
        c.style.setProperty('--r', (Math.random() * 900 - 450).toFixed(0) + 'deg');
        confettiBox.append(c);
        setTimeout(() => c.remove(), 4800);
      }
    },
  };
  return api;
}
