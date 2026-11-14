// The swing HUD: a dial (needle = how high the seat is right now; lit band = how high you are heading, coloured by how
// close it is to the limit; white flag = best this ride), a grip bar, a pump button that doubles as the timing cue,
// a coach card and the words that pop up ("Perfect!"). All DOM, all text through textContent.
import { el, loadCss } from './util.js';
import { SW } from './swing-physics.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

const CX = 120, CY = 118, R1 = 104, R0 = 74;
// the beat arc (svg units): its middle, radius and half span (radians from straight down); the sweet spot is pump-timing's
// 'perfect' band (phase under 0.24 rad: |th| under sin(0.24) of the swing's amplitude)
const BR = 70, BCX = 70, BCY = -14, BSPAN = 0.95, ZONE = Math.sin(0.24);
const bpt = f => [BCX + BR * Math.sin(f), BCY + BR * Math.cos(f)];
const PUSH_ZONE = 0.5; // a push lands well (pushEff 0.75 or more) from the back apex to half way back down: u under -0.5
const hAt = d => Math.pow(d * SW.V_SAFE, 2) / (2 * SW.G);
const H_WARN = hAt(SW.WARN), H_RED = hAt(1);
const ang = h => Math.PI - Math.PI * Math.min(1, Math.max(0, h / SW.MAX_H)); // svg angle for a height
const pt = (r, a) => [CX + r * Math.cos(a), CY - r * Math.sin(a)];
function ring(h0, h1) { // a slice of the dial between two heights
  if (h1 <= h0 + 0.001) return '';
  const a0 = ang(h0), a1 = ang(h1), big = Math.abs(a0 - a1) > Math.PI ? 1 : 0;
  const [x0, y0] = pt(R1, a0), [x1, y1] = pt(R1, a1), [x2, y2] = pt(R0, a1), [x3, y3] = pt(R0, a0);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${R1} ${R1} 0 ${big} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}A${R0} ${R0} 0 ${big} 0 ${x3.toFixed(1)} ${y3.toFixed(1)}Z`;
}

export function createHud(ctx, cb) {
  loadCss('/css/swing.css');
  const root = el('div', 'swing-hud');
  root.hidden = true;

  // ---- gauge
  const gauge = el('div', 'swing-gauge');
  gauge.setAttribute('role', 'img'); gauge.setAttribute('aria-label', 'Swing height gauge');
  const svg = svgEl('svg', { viewBox: '-14 -22 268 154' });
  const zones = [[0, H_WARN, 'green'], [H_WARN, H_RED, 'yellow'], [H_RED, SW.MAX_H, 'red']];
  for (const [a, b, c] of zones) svg.append(svgEl('path', { class: 'g-bg-' + c, d: ring(a, b) }));
  const fills = zones.map(([a, b, c]) => { const p = svgEl('path', { class: 'g-' + c, d: '' }); svg.append(p); return p; });
  svg.append(svgEl('path', { class: 'g-rim', d: ring(0, SW.MAX_H) }));
  for (let m = 0; m <= 3; m++) {
    const a = ang(m), [x0, y0] = pt(R1 + 2, a), [x1, y1] = pt(R1 + 8, a), [tx, ty] = pt(R1 + 17, a);
    svg.append(svgEl('line', { class: 'g-tick', x1: x0, y1: y0, x2: x1, y2: y1 }));
    const t = svgEl('text', { class: 'g-num', x: tx, y: ty + 4 }); t.textContent = m === 0 ? '0' : m + ' m'; svg.append(t);
  }
  const bestFlag = svgEl('path', { class: 'g-best', d: `M${CX} ${CY - R1 - 2}l-6 -11l12 0z` });
  svg.append(bestFlag);
  const needle = svgEl('g');
  needle.append(svgEl('line', { class: 'g-needle', x1: CX, y1: CY, x2: CX, y2: CY - R1 + 6 }));
  svg.append(needle);
  svg.append(svgEl('circle', { class: 'g-hub', cx: CX, cy: CY, r: 9 }));
  const read = svgEl('text', { class: 'g-read', x: CX, y: CY - 24 }); read.textContent = '0.0 m'; svg.append(read);
  const cap = svgEl('text', { class: 'g-cap', x: CX, y: CY - 50 }); cap.textContent = 'HEIGHT'; svg.append(cap);
    gauge.append(svg);

  const stats = el('div', 'swing-stats');
  const bestB = el('b', '', '0.0 m'), rideB = el('b', '', '0.0 m');
  const l1 = el('span', '', 'Best '), l2 = el('span', '');
  l2.append(el('i', 'sw-long', 'Your record '), el('i', 'sw-short', 'Record '));  // (a phone says the short one: the card is smaller there)
  l1.append(rideB); l2.append(bestB);
  stats.append(l1, l2);
  gauge.append(stats);

  const grip = el('div', 'swing-grip calm');
  grip.append(el('span', '', 'GRIP'));
  const bar = el('div', 'bar'); const barFill = el('i'); bar.append(barFill); grip.append(bar);
  gauge.append(grip);

  // ---- the beat: the swing's own arc over the PUMP button, a little tire riding it exactly as the real one
  // swings, and the sweet spot at the bottom, right over the button. When the tire is in it the spot lights up and the button
  // bounces: what to press and when, without a word.
  const beat = el('div', 'swing-beat');
  beat.setAttribute('aria-hidden', 'true');
  const bsvg = svgEl('svg', { viewBox: `${BCX - BR * Math.sin(BSPAN) - 12} -4 ${2 * BR * Math.sin(BSPAN) + 24} ${BCY + BR + 16}` });
  const arcD = (f0, f1) => { const [x0, y0] = bpt(f0), [x1, y1] = bpt(f1); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${BR} ${BR} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  bsvg.append(svgEl('path', { class: 'b-rail-ink', d: arcD(-BSPAN, BSPAN) }), svgEl('path', { class: 'b-rail', d: arcD(-BSPAN, BSPAN) }));
  const zone = svgEl('path', { class: 'b-zone', d: arcD(-ZONE * BSPAN, ZONE * BSPAN) });
  bsvg.append(zone);
  const [zx, zy] = bpt(0);
  const arrow = svgEl('path', { class: 'b-arrow', d: `M${zx - 7} ${zy + 7}l7 7l7 -7z` }); bsvg.append(arrow); // points down at the button
  const tireB = svgEl('g', { class: 'b-tire' });
  tireB.append(svgEl('circle', { r: 11 }), svgEl('circle', { class: 'b-hole', r: 4.2 }));
  bsvg.append(tireB);
  beat.append(bsvg);

  // ---- buttons
  const side = el('div', 'swing-side');
  side.append(beat);
  const pump = el('button', 'swing-pump', 'PUMP', { type: 'button', 'aria-label': 'Pump the swing (Space)' });
  const pumpSub = el('small', '', 'Space'); pump.append(pumpSub);
  const hop = el('button', 'swing-hop', 'Hop off', { type: 'button', 'aria-label': 'Hop off the swing (E)' });
  const hopKey = el('kbd', '', 'E'); hop.append(hopKey);
  side.append(pump, hop);
  pump.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pump.classList.add('press'); cb.pump?.(); });
  const rel = () => pump.classList.remove('press');
  pump.addEventListener('pointerup', rel); pump.addEventListener('pointercancel', rel); pump.addEventListener('pointerleave', rel);
  pump.addEventListener('keydown', e => { if (e.code === 'Enter') { e.preventDefault(); cb.pump?.(); } }); // Space is the game's pump key already
  hop.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cb.hop?.(); });
  hop.addEventListener('keydown', e => { if (e.code === 'Enter') { e.preventDefault(); cb.hop?.(); } });

  const coach = el('div', 'swing-coach');
  const c1 = el('div'), c2 = el('div');
  const k1 = el('kbd', '', 'Space'), k2 = el('kbd', '', 'E');
  const t1 = document.createTextNode('pump when the spot over PUMP lights up'), t2 = document.createTextNode('hop off (fast? that is a jump!)');
  c1.append(k1, t1);
  c2.append(k2, t2);
  coach.append(c1, c2);

  // ---- in the air: how far you've flown so far, counting up
  const dist = el('div', 'swing-dist');
  const distN = el('b', '', '0'), distU = el('span', '', ' m');
  dist.append(distN, distU);

  root.append(gauge, side, coach, dist);
  ctx.hud.append(root);

  // ---- the landing's score pop: the distance, up to three stars, "New record!". Outside the HUD card so it outlives the ride
  // (control comes back while it is still up)
  const score = el('div', 'swing-score');
  score.hidden = true;
  score.setAttribute('role', 'status');
  const scoreN = el('b'), scoreS = el('div', 'stars'), scoreR = el('div', 'rec');
  score.append(scoreS, scoreN, scoreR);
  ctx.hud.append(score);
  let scoreT = 0;

  // ---- the pusher's card: standing behind somebody on the swing, the same little arc over your E, the sweet
  // spot at its back end (where you stand): push when their tire comes back to you and starts forward. A good push bursts it,
  // and the height it added pops up when the rider's screen says so.
  const pushCard = el('div', 'swing-push');
  pushCard.hidden = true;
  pushCard.setAttribute('aria-hidden', 'true');
  const psvg = svgEl('svg', { viewBox: bsvg.getAttribute('viewBox') });
  psvg.append(svgEl('path', { class: 'b-rail-ink', d: arcD(-BSPAN, BSPAN) }), svgEl('path', { class: 'b-rail', d: arcD(-BSPAN, BSPAN) }));
  const pZone = svgEl('path', { class: 'b-zone', d: arcD(-1.08 * BSPAN, -PUSH_ZONE * BSPAN) });
  psvg.append(pZone);
  const [hx, hy] = bpt(-1.04 * BSPAN);
  const hand = svgEl('g', { class: 'p-hand', transform: `translate(${(hx - 14).toFixed(1)} ${(hy + 12).toFixed(1)})` }); // two little hands ready to push
  hand.append(svgEl('circle', { r: 6.5, cx: 0, cy: 0 }), svgEl('circle', { r: 6.5, cx: 9, cy: 4 }));
  psvg.append(hand);
  const pTire = svgEl('g', { class: 'b-tire' });
  pTire.append(svgEl('circle', { r: 11 }), svgEl('circle', { class: 'b-hole', r: 4.2 }));
  psvg.append(pTire);
  const pGain = el('div', 'p-gain');
  pushCard.append(psvg, pGain);
  ctx.hud.append(pushCard);
  let gainT = 0;

  let lastFill = -1, coachOff = 0, lastHot = false, lastDoomed = false, lastFlash = null;
  const api = {
    root,
    // device: 'kbm' | 'pad' | 'touch' (what the player used last)
    show(device) {
      root.hidden = false;
      const p = device === 'pad', touch = device === 'touch';
      k1.textContent = p ? 'A' : 'Space'; k2.textContent = p ? 'X' : 'E';
      k1.hidden = touch; k2.hidden = touch;
      t1.textContent = touch ? 'Tap PUMP when the spot over it lights up' : 'pump when the spot over PUMP lights up'; // (the beat arc)
      t2.textContent = touch ? 'Hop off any time (fast? that is a jump!)' : 'hop off (fast? that is a jump!)';
      pumpSub.textContent = touch ? 'tap' : p ? 'A' : 'Space'; hopKey.textContent = p ? 'X' : 'E'; hopKey.hidden = touch;
      coach.classList.remove('off');
      coachOff = 7; // the coach card says it once and fades: it must never sit on the swinger for long
      lastFill = -1;
      // restart the pop-in animation each time
      gauge.style.animation = 'none'; void gauge.offsetWidth; gauge.style.animation = '';
    },
    hide() { root.hidden = true; },
    // The band of screen the camera frames the swing in (fractions of the window, 0 = top / left): under the top of the HUD
    // (minimap, place pill, quest bar, where they reach across the middle half of the screen) and over the meter and the
    // buttons (where they do). swing.js reads it twice a second; one layout read each time.
    band() {
      const W = innerWidth || 1, H = innerHeight || 1, m0 = W * 0.25, m1 = W * 0.75;
      let t = H * 0.1, b = H * 0.7;
      const mid = r => r.height > 0 && r.right > m0 && r.left < m1;
      let l = W * 0.04, rr = W * 0.96;
      for (const s of ['#minimap', '#hud-time', '#hud-wx', '#btn-help', '#online', '#place', '#quests .qt-head', '#pad-name']) { // (each piece is placed on its own)
        const e = ctx.hud.querySelector(s); if (!e) continue;
        const r = e.getBoundingClientRect();
        if (!r.height || r.top > H * 0.4) continue;
        if (mid(r)) t = Math.max(t, r.bottom + 8);
        else if (r.bottom > t) { if (r.left > W / 2) rr = Math.min(rr, r.left - 8); else l = Math.max(l, r.right + 8); } // a column down one side (the PC's minimap and quests)
      }
      if (!root.hidden) for (const e of [gauge, side]) { const r = e.getBoundingClientRect(); if (mid(r) && r.top > H * 0.35) b = Math.min(b, r.top - 8); }
      if (b - t < H * 0.22) { t = H * 0.12; b = H * 0.62; } // (a squashed window: a sane middle)
      if (rr - l < W * 0.4) { l = W * 0.04; rr = W * 0.96; }
      return { t: t / H, b: b / H, l: l / W, r: rr / W };
    },
    mode(m) { root.classList.toggle('fly', m === 'fly'); root.classList.remove('landed'); if (m === 'fly') distN.textContent = '0.0'; }, // in the air only the pop-up words and the distance stay
    get visible() { return !root.hidden; },
    // hNow: seat height now; hEq: height it is heading for; best: best apex this ride; d: danger; grip 0..1
    set({ hNow, hEq, best, d, gripV, doomed }) {
      const q = Math.round(hEq * 40);
      if (q !== lastFill) {
        lastFill = q;
        zones.forEach(([a, b], i) => fills[i].setAttribute('d', ring(a, Math.min(b, hEq))));
        read.textContent = hEq.toFixed(1) + ' m';
      }
      needle.setAttribute('transform', `rotate(${(-90 + 180 * Math.min(1, hNow / SW.MAX_H)).toFixed(1)} ${CX} ${CY})`);
      if (best > 0.05) { bestFlag.setAttribute('transform', `rotate(${(-90 + 180 * Math.min(1, best / SW.MAX_H)).toFixed(1)} ${CX} ${CY})`); bestFlag.style.display = ''; }
      else bestFlag.style.display = 'none';
      rideB.textContent = best.toFixed(1) + ' m';
      const hot = !doomed && d >= SW.WARN + 0.06;
      if (hot !== lastHot || doomed !== lastDoomed) { lastHot = hot; lastDoomed = doomed; cap.textContent = doomed ? 'LETTING GO!' : hot ? 'TOO FAST!' : 'HEIGHT'; }
      gauge.classList.toggle('hot', hot);
      gauge.classList.toggle('doomed', !!doomed);
      grip.classList.toggle('calm', gripV >= 0.999 && d < SW.WARN);
      grip.classList.toggle('low', gripV < 0.6);
      grip.classList.toggle('crit', gripV < 0.3);
      barFill.style.transform = `scaleX(${Math.max(0.02, gripV).toFixed(3)})`;
    },
    setRecord(best) { bestB.textContent = (best || 0).toFixed(1) + ' m'; },
    // the ring on the pump button: 0 = nothing, 1 = now! x: where the swing is in its arc (-1 back .. 1 forward, rope angle over
    // the amplitude), for the beat arc's little tire; perfect: a pump now would be "Perfect!" (the spot lights, the button bounces)
    cue(q, x = 0, perfect = q > 0.85) {
      pump.style.setProperty('--q', q.toFixed(2));
      const now = perfect;
      pump.classList.toggle('now', now); beat.classList.toggle('now', now);
      const f = Math.max(-1.08, Math.min(1.08, x)) * BSPAN, [tx, ty] = bpt(f);
      tireB.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`);
    },
    // a pump landed: the sweet spot bursts (perfect / good) or shakes (a miss)
    hit(label) {
      beat.classList.remove('hit-perfect', 'hit-good', 'hit-bad'); void beat.offsetWidth;
      beat.classList.add(label === 'perfect' ? 'hit-perfect' : label === 'good' ? 'hit-good' : 'hit-bad');
    },
    // the height you are heading for, as a tier (0 calm .. 3 sky high): the card warms up with it
    tier(n) { for (let i = 1; i <= 3; i++) gauge.classList.toggle('tier' + i, n >= i); },
    // in the air: metres flown so far
    dist(d) { const t = d.toFixed(1); if (distN.textContent !== t) distN.textContent = t; },
    // the landing: d metres, stars 0..3, record: a new personal longest flight
    score(d, stars, record) {
      scoreN.textContent = d.toFixed(1) + ' m';
      scoreS.textContent = '';
      for (let i = 0; i < 3; i++) scoreS.append(el('i', i < stars ? 'on' : '', i < stars ? String.fromCharCode(0x2605) : String.fromCharCode(0x2606)));
      scoreR.textContent = record ? 'New record!' : stars >= 3 ? 'Huge!' : stars === 2 ? 'Great flight!' : stars === 1 ? 'Nice!' : 'Boing!';
      score.classList.toggle('record', !!record);
      root.classList.add('landed'); // (the counter makes way for the pop)
      score.hidden = false;
      score.style.animation = 'none'; void score.offsetWidth; score.style.animation = '';
      scoreT = 2.8;
    },
    get scoreShown() { return !score.hidden; },
    // the pusher's card: shown while you stand ready behind a rider; x = where their tire is (-1 back .. 1 front), q = how well a
    // push would land now (swing.js pushQuality, 0.75 and up is a good one)
    push: {
      el: pushCard,
      show(on) { if (pushCard.hidden === !on) return; pushCard.hidden = !on; if (!on) pushCard.classList.remove('now'); },
      cue(x, q) {
        pushCard.classList.toggle('now', q > 0.75);
        const f = Math.max(-1.08, Math.min(1.08, x)) * BSPAN, [tx, ty] = bpt(f);
        pTire.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`);
      },
      hit(label) { pushCard.classList.remove('hit-perfect', 'hit-good', 'hit-bad'); void pushCard.offsetWidth; pushCard.classList.add(label === 'good' ? 'hit-perfect' : label === 'ok' ? 'hit-good' : 'hit-bad'); },
      gain(text) { pGain.textContent = text; pGain.classList.remove('pop'); void pGain.offsetWidth; pGain.classList.add('pop'); gainT = 1.6; },
      get shown() { return !pushCard.hidden; },
    },
    flash(text, cls = '') {
      lastFlash?.remove(); // one pop-up at a time, so words never pile on top of each other
      const f = el('div', 'swing-flash ' + cls, text);
      root.append(f);
      lastFlash = f;
      setTimeout(() => { f.remove(); if (lastFlash === f) lastFlash = null; }, 1000);
    },
    tick(dt) { // fade the coach card after a while; the score pop goes after its moment
      if (coachOff > 0) { coachOff -= dt; if (coachOff <= 0) coach.classList.add('off'); }
      if (scoreT > 0) { scoreT -= dt; if (scoreT <= 0) score.hidden = true; }
      if (gainT > 0) { gainT -= dt; if (gainT <= 0) pGain.classList.remove('pop'); }
    },
    hint(on) { coach.classList.toggle('off', !on); if (on) coachOff = 8; },
  };
  return api;
}
