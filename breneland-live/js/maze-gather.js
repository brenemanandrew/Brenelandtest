// Beneath Angell Street: the gathering place at the top of the entry stair. After the story card you stand on the landing (looking
// about, not walking) with a panel: who's at the top, who's on the way, who's gone down, a wait line while friends can still Join from
// the door card, and three choices: Go down together (a 3-2-1 for everyone at the top that anyone but its starter can step back
// from, and the starter can call off), Go alone, Back up to the house. The run rules are the server's (lib/maze-party.js), this
// panel only shows them and asks. Your stage going 'down' lets you walk down the stair (scene.hold back to null). Keys come through
// maze.js onKey (arrows or D-pad choose, E / Enter / Space or A press). Taps and clicks press directly.
import { el, loadCss } from './util.js';

const MAX = 4;

export function createMazeGather(ctx, { getRun, comeUp }) {
  const { net, ui, input, audio } = ctx;
  loadCss('/css/maze-descent.css');
  const root = el('div', 'mz-gather', '', { hidden: '', role: 'group', 'aria-label': 'Gather your party' });
  const head = el('div', 'mz-g-head', 'Gather your party before you go down.');
  const sub = el('div', 'mz-g-sub', 'Once you go down, you go alone.');
  const who = el('div', 'mz-g-who', ''), more = el('div', 'mz-g-more', ''), wait = el('div', 'mz-g-wait', 'Waiting for your party...');
  const count = el('div', 'mz-g-count', '', { 'aria-live': 'assertive' });
  const btns = el('div', 'mz-g-btns');
  const bTogether = el('button', 'btn primary mz-g-together', 'Go down together', { type: 'button', tabindex: '-1' });
  const bAlone = el('button', 'btn mz-g-alone', 'Go alone', { type: 'button', tabindex: '-1' });
  const bStay = el('button', 'btn mz-g-stay', 'Stay up here', { type: 'button', tabindex: '-1' });
  const bUp = el('button', 'btn mz-g-up', 'Back up to the house', { type: 'button', tabindex: '-1' });
  btns.append(bTogether, bAlone, bStay, bUp);
  const keys = el('div', 'mz-g-keys', '');
  root.append(head, sub, who, more, wait, count, btns, keys);
  ctx.hud.append(root);

  let scene = null, state = null, sel = 0, countEnds = 0, timer = 0, openedAt = 0, how = null;
  const send = act => net.send({ t: 'maze', op: 'party', act });
  const mine = () => state?.people?.find(p => p.sid === net.sid) || null;
  const visible = () => [bTogether, bAlone, bStay, bUp].filter(b => !b.hidden && !b.disabled);

  function paint() {
    if (root.hidden) return;
    const people = state?.people || [], me = mine(), c = state?.count || null;
    const at = people.filter(p => p.stage === 'top'), on = people.filter(p => p.stage === 'story'), gone = people.filter(p => p.stage === 'down');
    const name = p => p.sid === net.sid ? `${p.name} (you)` : p.name;
    who.textContent = `At the top: ${(at.length ? at : me ? [me] : []).map(name).join(', ') || 'you'}`;
    const extra = [];
    if (on.length) extra.push(`On the way: ${on.map(name).join(', ')}`);
    if (gone.length) extra.push(`Gone down: ${gone.map(name).join(', ')}`);
    more.textContent = extra.join('  ·  '); more.hidden = !extra.length;
    const room = people.length < MAX;
    const stayed = !!(c && c.stay.includes(net.sid)), leader = !!(c && c.by === net.sid);
    wait.hidden = !!c || !room; wait.textContent = 'Waiting for your party...';
    if (c) {
      const n = Math.max(1, Math.ceil((countEnds - performance.now()) / 1000));
      count.hidden = false;
      count.textContent = stayed ? `The others go down in ${n}...` : `Going down together in ${n}...`;
      count.dataset.n = String(n);
    } else { count.hidden = true; count.textContent = ''; }
    // the choices
    bTogether.hidden = !!(c && !stayed); bTogether.textContent = c ? 'Come too' : 'Go down together';
    bTogether.disabled = !c && at.length < 2;
    bTogether.title = bTogether.disabled ? 'Nobody else is at the top yet' : '';
    bAlone.hidden = !!(c && !stayed);
    bStay.hidden = !(c && !stayed); bStay.textContent = leader ? 'Wait, not yet' : 'Stay up here';
    bUp.hidden = !!(c && !stayed);
    const list = visible();
    if (sel >= list.length) sel = 0;
    const touchy = input.lastDevice === 'touch' || (input.lastDevice !== 'pad' && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    for (const b of [bTogether, bAlone, bStay, bUp]) b.classList.toggle('sel', b === list[sel] && !touchy);
    keys.textContent = touchy ? '' : input.lastDevice === 'pad' ? `D-pad to choose, ${input.glyph('E')} to press` : 'Arrows to choose, Enter or E to press';
    keys.hidden = !keys.textContent;
  }
  function select(b) { const list = visible(), i = list.indexOf(b); if (i >= 0) sel = i; }
  function press(b) {
    if (!b || b.hidden || b.disabled || root.hidden) return;
    audio.ui?.('blip');
    if (b === bTogether) { how = 'together'; send('together'); }
    else if (b === bAlone) { how = 'alone'; send('alone'); }
    else if (b === bStay) send('stay');
    else if (b === bUp) { hide(); comeUp('stair'); }
  }
  for (const b of [bTogether, bAlone, bStay, bUp]) b.addEventListener('click', e => { e.stopPropagation(); select(b); press(b); });
  root.addEventListener('pointerdown', e => e.stopPropagation());

  function release(together) {
    const was = scene?.hold;
    hide();
    if (scene && was === 'top') {
      scene.hold = null;
      ui.toast(together ? 'Down you go, together. Keep close, and mind the stair.' : 'Down you go. Mind the stair, it is very narrow.', 3200);
    }
  }
  function hide() { root.hidden = true; clearInterval(timer); timer = 0; }
  net.on('maze', m => {
    if (m.op !== 'party') return;
    const run = getRun();
    if (!run || m.id !== run.id) return;
    const had = state?.count, counted = !!(had && !had.stay.includes(net.sid));
    state = m;
    if (m.count) { countEnds = performance.now() + m.count.left; if (!had) { audio.ui?.('pop'); select(bStay); } if (!timer && !root.hidden) timer = setInterval(paint, 120); }
    else { clearInterval(timer); timer = 0; }
    if (mine()?.stage === 'down') { if (scene?.hold === 'top') release(counted && how !== 'alone'); return; }
    paint();
  });

  return {
    root,
    get open() { return !root.hidden; },
    get state() { return state; },
    get buttons() { return visible().map(b => b.textContent); },
    get countText() { return count.hidden ? '' : count.textContent; },
    get lines() { return { head: head.textContent, sub: sub.textContent, who: who.textContent, more: more.hidden ? '' : more.textContent, wait: wait.hidden ? '' : wait.textContent }; },
    // the story read: at the top of the stair now
    arrive(sc) {
      scene = sc; how = null; sel = 0;
      if (mine()?.stage === 'down') return;
      scene.hold = 'top';
      root.hidden = false; openedAt = performance.now();
      send('here');
      paint();
      if (state?.count && !timer) timer = setInterval(paint, 120);
    },
    // tests' skipStair: straight down, alone
    skip(sc) { scene = sc || scene; how = 'alone'; hide(); if (scene) scene.hold = null; send('alone'); },
    hide() { hide(); scene = null; state = null; how = null; },
    press: label => press([bTogether, bAlone, bStay, bUp].find(b => b.textContent === label)),
    onKey(code) {
      if (root.hidden) return false;
      if (performance.now() - openedAt < 200) return true;
      const list = visible();
      if (/^(Arrow|Pad)(Up|Left)$/.test(code)) { sel = (sel + list.length - 1) % Math.max(1, list.length); paint(); return true; }
      if (/^(Arrow|Pad)(Down|Right)$/.test(code)) { sel = (sel + 1) % Math.max(1, list.length); paint(); return true; }
      if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { press(list[sel]); return true; }
      return false; // Esc opens Settings as it does anywhere, F still changes the view
    },
  };
}
