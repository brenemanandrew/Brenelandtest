// The quest tracker: what's going on for you. Folded to a small orange pill by default (the upright phone's pill says Quests, the
// others name the top quest). Click, tap or J opens the list (the layout's "questopen" popout). On a pad there's no pill: Select (J)
// opens the quest log, and a change while it's folded shows a small flare instead of popping it open (hud-pad.js listens through
// onBump). Features feed it:
//   ctx.quests.set(id, { title, text?, progress?: 0..1, done?: bool, prio?: number, color?: css })
//   ctx.quests.clear(id)
// A repeated set() with the same words costs nothing (it's diffed), so features may call it every frame. The folded tracker pops
// open for a moment when a line changes. At most MAX_LINES lines show, highest prio first, the rest are counted. A done line
// clears itself after a bit. It also keeps the "fish to earn today" line itself from the server's daily caps (lib/rewards.js).
import { el } from './util.js';

const MAX_LINES = 5;
const POP_SECS = 7;        // how long a folded banner stays open after a line changes
const DONE_SECS = 6;       // how long a finished line lingers
const CAPS = [['scouts', 'Scouts'], ['garden', 'Garden'], ['oyster', 'Oysters'], ['tower', 'Tower']];

export function createQuests(ctx) {
  const root = document.getElementById('quests');
  const head = el('button', 'qt-head', '', { type: 'button', 'aria-expanded': 'true', title: 'Fold the quests away (J)' });
  const hTitle = el('span', 'qt-htitle', 'Quests'); const hCount = el('span', 'qt-hcount', ''); const hTop = el('span', 'qt-top', ''); const hChev = el('span', 'qt-chev', '');
  const hKey = el('kbd', 'kc', 'J', { 'aria-hidden': 'true' });
  head.append(hCount, hTitle, hTop, hChev, hKey);
  const body = el('div', 'qt-body');
  const logHead = el('div', 'qt-loghead', 'Quests');
  const bumpFns = [];
  const padNow = () => document.getElementById('hud')?.dataset.hud === 'pad';
  const more = el('div', 'qt-more', '');
  root.append(head, body);
  const lines = new Map(); // id -> line
  let collapsed = !!ctx.store.get('quests.folded', true); // folded until you open it
  let held = false; // a game that owns the screen keeps the list folded to its pill for now (bocce: hold()); your own fold is untouched
  let popUntil = 0, seq = 0, nowS = 0, dirty = true, fresh = null; // fresh: the line that changed last (a pop shows only that one)
  const clock = () => performance.now() / 1000;
  let reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no matchMedia */ }

  const applyFold = () => {
    const fold = collapsed || held;
    const open = !fold || (!held && nowS < popUntil);
    root.classList.toggle('collapsed', !open);
    root.classList.toggle('popping', open && fold); // opened by itself for a moment: just the line that changed
    head.setAttribute('aria-expanded', String(open));
    head.title = open ? 'Fold the quests away (J)' : 'Open the quests (J)';
  };
  head.onclick = () => { api.toggle(); head.blur(); };

  function bump(line) {
    line.at = ++seq;
    dirty = true;
    if (fresh !== line) { fresh?.node.classList.remove('fresh'); fresh = line; line.node.classList.add('fresh'); }
    nowS = clock();
    if (nowS - (line.popAt || -9) < 2) return; // a line that changes every frame (a height) bounces at most every 2 s
    line.popAt = nowS;
    if (!reduced) { line.node.classList.remove('pop'); void line.node.offsetWidth; line.node.classList.add('pop'); }
    for (const fn of bumpFns) { try { fn(line.id); } catch (e) { console.error(e); } }
    if (collapsed && !held && !padNow()) { popUntil = nowS + POP_SECS; root.classList.remove('pop'); void root.offsetWidth; root.classList.add('pop'); } // on a pad: the flare
  }

  function paint() {
    dirty = false;
    const all = [...lines.values()].sort((a, b) => (b.prio - a.prio) || (b.at - a.at));
    const show = all.slice(0, MAX_LINES);
    const want = show.map(l => l.node);
    if (all.length > MAX_LINES) { more.textContent = `and ${all.length - MAX_LINES} more`; want.push(more); }
    body.replaceChildren(logHead, ...want);
    hCount.textContent = all.length ? String(all.length) : '';
    hCount.hidden = !all.length;
    hTop.textContent = all.length ? all[0].title : ''; // the folded phone bar names the top quest
    root.hidden = !all.length;
    applyFold();
  }

  const api = {
    set(id, q) {
      if (typeof id !== 'string' || !q) return;
      let line = lines.get(id);
      if (!line) {
        const node = el('div', 'qt-line');
        const t = el('div', 'qt-title'); const x = el('div', 'qt-text'); const bar = el('div', 'qt-bar'); const fill = el('span', 'qt-fill');
        bar.append(fill); bar.hidden = true; node.append(t, x, bar);
        line = { id, node, t, x, bar, fill, title: '', text: '', progress: null, done: false, prio: 0, at: 0, doneAt: 0 };
        lines.set(id, line);
        dirty = true;
      }
      const title = String(q.title || id), text = String(q.text || '');
      const progress = q.progress == null ? null : Math.max(0, Math.min(1, +q.progress || 0));
      const done = !!q.done, prio = +q.prio || 0;
      let changed = false;
      if (title !== line.title) { line.title = title; line.t.textContent = title; changed = true; }
      if (text !== line.text) { line.text = text; line.x.textContent = text; changed = true; }
      if (q.color !== line.color) { line.color = q.color; line.node.style.setProperty('--qc', q.color || ''); }
      if ((progress == null) !== (line.progress == null) || (progress != null && Math.abs(progress - line.progress) >= 0.01)) {
        const wasNull = line.progress == null;
        line.progress = progress;
        line.bar.hidden = progress == null;
        if (progress != null) line.fill.style.width = Math.round(progress * 100) + '%';
        if (wasNull || progress == null || progress >= 1) changed = true; // a crawling bar is not a reason to pop open
      }
      if (done !== line.done) { line.done = done; line.node.classList.toggle('done', done); line.doneAt = done ? clock() : 0; changed = true; }
      if (prio !== line.prio) { line.prio = prio; dirty = true; }
      // quiet: a line that keeps a game's running numbers (a climb's height) updates in place and never pops the folded tracker open
      // (on a phone the popped list would sit over the top-left of the screen the whole game)
      if (changed) { if (q.quiet) { line.at = line.at || ++seq; dirty = true; } else bump(line); }
    },
    clear(id) {
      const line = lines.get(id);
      if (!lines.delete(id)) return;
      dirty = true;
      // the line that popped the folded tracker open is gone, so fold it again (or it shows an empty card until the pop runs out)
      if (line === fresh) { fresh = null; if (popUntil) { popUntil = 0; applyFold(); } }
    },
    has: id => lines.has(id),
    onBump(fn) { bumpFns.push(fn); },
    get collapsed() { return collapsed; },
    // hold(true): fold the list to its pill and keep it there (no pops) until hold(false); a tap on the pill still opens it
    hold(on) { if (held === !!on) return; held = !!on; popUntil = 0; applyFold(); },
    get held() { return held; },
    toggle(force) {
      const shown = !(collapsed || held); // (what you see: a tap on the held pill opens the list)
      held = false;
      collapsed = force === undefined ? shown : !force;
      popUntil = 0;
      ctx.store.set('quests.folded', collapsed);
      applyFold();
      ctx.audio.ui?.('blip');
    },
    name: 'quests',
    update(dt, now) {
      nowS = clock();
      // doneAt and popUntil are on clock(), so compare with nowS, not the frame's now: they differ when frames are stepped
      for (const l of lines.values()) if (l.done && nowS - l.doneAt > DONE_SECS) { lines.delete(l.id); dirty = true; }
      if (dirty) paint();
      else if (collapsed && popUntil && nowS >= popUntil) { popUntil = 0; applyFold(); }
    },
    onKey(code) {
      if (code === 'KeyJ' && !ctx.input.typing) { api.toggle(); return true; }
      return false;
    },
    // no help lines: these keys are drawn in Settings > Controls, from controls-map.js
  };

  // ---- today's fish to earn (the server's daily caps)
  const { net } = ctx;
  let caps = null;
  const askCaps = () => net.send({ t: 'rewards?' });
  net.on('welcome', askCaps);
  net.on('reward', m => { if (m.ok) askCaps(); });
  net.on('rewards', m => {
    if (!m || typeof m.left !== 'object') return;
    caps = m.left;
    let total = 0, left = 0;
    const parts = [];
    for (const [k, label] of CAPS) {
      const n = Math.max(0, m.left[k] | 0);
      const cap = { scouts: 2, garden: 6, oyster: 40, tower: 1 }[k];
      total += cap; left += n;
      if (n > 0) parts.push(`${label} ${n}`);
    }
    if (left <= 0) api.set('caps', { title: 'Fish earned today', text: 'You have earned every fish there is today. Come back tomorrow!', progress: 1, prio: -5, color: '#7dd36a' });
    else api.set('caps', { title: 'Fish to earn today', text: parts.join(', ') + ' (scouts, the garden, oysters, the tower)', progress: (total - left) / total, prio: -5, color: '#7dd36a' });
  });
  api.capsLeft = () => caps;

  applyFold();
  return api;
}
