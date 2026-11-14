// Walk with me: hold E by a dog for four seconds and it walks with you round town. Hold again to let it go.
// The walk itself lives in the shared simulation (dogs-walk.js, run by dogs-brain.js, relayed by lib/dogs.js). This is the
// local side: the hold and its card, the E prompt's words, a first-time tip, the sniff sound, and the walk ticks for the
// affection levels ({ t: 'walk', dog, ms } about every 10 s of active walking, never more than 15 s at once).
import * as THREE from 'three';
import { loadCss, el } from './util.js';
import { Dog, DAX, NALA, MOLLY } from './dogs.js';
import { WALK_HOLD } from './dogs-walk.js';
import { bankOf } from './dog-voice.js';

const DOGS = ['dax', 'nala', 'molly'];   // (molly: Joyce's dog, she goes back to Joyce after a walk)
const TICK_EVERY = 10;      // s between walk ticks
const TICK_MAX = 15000;     // ms one tick may claim (lib/dogs.js clamps the same)
const ACTIVE_NEAR = 4.5;    // m: the dog counts as beside you within this
const MOVED_FOR = 3;        // s after your last step that still count as walking
const SHOW_AFTER = 0.3;     // s of holding before the card appears (a tap says hi, nothing flashes)
const PORTRAIT = 160;       // px

// ------------------------------------------------------------------ the portrait (rendered once per dog, cached)
let rt = null, pscene = null, pcam = null;
const _c = new THREE.Vector3();
function renderDogPortrait(renderer, id) {
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(PORTRAIT, PORTRAIT, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    pscene = new THREE.Scene();
    pscene.add(new THREE.HemisphereLight('#fff6e6', '#8fa3b8', 1.9));
    const sun = new THREE.DirectionalLight('#ffffff', 2.6); sun.position.set(1.4, 2.2, 2.4); pscene.add(sun);
    pcam = new THREE.PerspectiveCamera(22, 1, 0.05, 20);
    pcam.layers.enableAll();
  }
  const d = new Dog({ ...(id === 'dax' ? DAX : id === 'molly' ? MOLLY : NALA) });
  pscene.add(d.root);
  for (let i = 0; i < 6; i++) d.update(1 / 30, i / 30, 0, 'sitlook');   // settle the pose
  d.root.updateMatrixWorld(true);
  d.head.getWorldPosition(_c);
  const s = d.sc || 1;
  pcam.position.set(_c.x + 0.5 * s, _c.y + 0.14 * s, _c.z + 1.25 * s);
  pcam.lookAt(_c.x, _c.y - 0.03 * s, _c.z + 0.04 * s);
  const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
  const px = new Uint8Array(PORTRAIT * PORTRAIT * 4);
  try {
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
    renderer.clear();
    renderer.render(pscene, pcam);
    renderer.readRenderTargetPixels(rt, 0, 0, PORTRAIT, PORTRAIT, px);
  } finally {
    renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA); renderer.autoClear = prevAuto;
    pscene.remove(d.root); d.dispose?.();
  }
  const c = document.createElement('canvas'); c.width = c.height = PORTRAIT;
  const g = c.getContext('2d'), img = g.createImageData(PORTRAIT, PORTRAIT);
  for (let y = 0; y < PORTRAIT; y++) img.data.set(px.subarray((PORTRAIT - 1 - y) * PORTRAIT * 4, (PORTRAIT - y) * PORTRAIT * 4), y * PORTRAIT * 4);   // GL rows are bottom-up
  g.putImageData(img, 0, 0);
  return c;
}

export function createDogWalk(ctx) {
  const { npcs, player, input, ui, audio, net, hud, renderer } = ctx;
  const sync = npcs.dogSync;
  loadCss('/css/dog-walk.css');

  // ---- the card: portrait, ring, words
  const card = el('div', 'walk-card', '', { hidden: '', role: 'status', 'aria-live': 'polite' });
  const pic = el('span', 'walk-pic'), ring = el('i', 'walk-ring'), face = el('span', 'walk-face');
  const cap = el('b', 'walk-cap'), sub = el('span', 'walk-sub');
  face.append(pic, ring); card.append(face, cap, sub);
  hud.append(card);
  const pics = {};
  function showPic(id) {
    if (pics[id] === undefined) { try { pics[id] = renderDogPortrait(renderer, id); } catch (e) { console.error('[dog-walk] portrait', e); pics[id] = null; } }
    pic.replaceChildren(); if (pics[id]) pic.append(pics[id]);
    pic.classList.toggle('blank', !pics[id]);
  }
  const eKey = () => (input.lastDevice === 'pad' ? input.glyph?.('E') || 'X' : input.lastDevice === 'touch' ? 'the E button' : 'E');

  // ---- the sniff (a real clip from the dogs' bank; dogs-walk.js asks for it through the simulation's sounds)
  audio.registerSfx?.('dogsniff', (a, x, y, z) => {
    const c = a.ctx && bankOf(a.ctx)?.clips.get('dog-sniff-01');
    if (!c || Math.hypot(x - a.listener.x, z - a.listener.z) > 30) return;
    const src = a.ctx.createBufferSource(); src.buffer = c.buf;
    const g = a.gain(0.8); src.connect(g); g.connect(a.atVoice(x, y, z));
    src.start(a.ctx.currentTime + 0.02, c.lead);
    src.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
  });

  // ---- the hold
  let hold = null;          // { id, t, done, doneT }
  let tipped = false;
  const dogNear = () => {   // the dog the E prompt is about right now, within reach
    const words = ui.actWords;
    if (!words) return null;
    for (const id of DOGS) {
      const d = npcs.dog(id);
      if (!d || !d.body.root.visible || !words.includes(d.name)) continue;
      const p = d.body.root.position;
      if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 4.2) return d;
    }
    return null;
  };
  const dist = id => { const p = npcs.dog(id)?.body.root.position; return p ? Math.hypot(p.x - player.pos.x, p.z - player.pos.z) : Infinity; };
  function cancel() { hold = null; card.hidden = true; card.classList.remove('done'); }
  function fire(id) {
    const name = npcs.dog(id).name, w = sync.walkerOf(id);
    if (w && !sync.mine(id)) { ui.toast(`${name} is out walking with ${w.name} right now.`, 3000); return false; }
    sync.walk(id, !w, player.pos.x, player.pos.z, ctx.profile?.name || 'you');
    audio.ui?.('pop'); input.rumble?.(0.4, 0.4, 120);
    const words = w ? `You let ${name} go. Off home!` : `${name} is walking with you! Hold ${eKey()} by ${name} again to let go.`;
    if (w) flush(id);
    setTimeout(() => ui.toast(words, 4000), 800);   // (once the card has gone)
    return true;
  }

  // ---- the walk ticks (the affection levels count them)
  const active = { dax: 0, nala: 0, molly: 0 }, was = { dax: false, nala: false, molly: false };
  let tickT = 0, sinceMove = 99;
  function flush(id) {
    const ms = Math.min(TICK_MAX, Math.round(active[id]));
    active[id] = 0;
    if (ms >= 400 && net.status === 'online') net.send({ t: 'walk', dog: id, ms });
  }

  return {
    name: 'dog-walk',
    api: { get hold() { return hold; }, card, active, portrait: id => renderDogPortrait(renderer, id), WALK_HOLD },
    // the E prompt's words by a dog (main.js asks; null = the usual "Say hi" / "Wake up")
    hint(npc) {
      if (!npc.personality) return null;
      const w = sync.walkerOf(npc.id);
      if (!w) return null;
      return sync.mine(npc.id) ? `E  Let go of ${npc.name} (hold)` : `E  Say hi to ${npc.name} (walking with ${w.name})`;
    },
    update(dt) {
      if (ctx.mode !== 'play') { if (hold) cancel(); return; }
      // the hold: E down by a dog starts it, the card fills over WALK_HOLD seconds, let go early and nothing happens
      const down = input.down.has('KeyE');
      if (!down) { if (hold && (!hold.done || hold.t - hold.doneT > 0.7)) cancel(); else if (hold) hold.t += dt; }
      else if (!hold) {
        const d = dogNear();
        if (d && !player.takeover && !input.typing && !input.overlayOpen) hold = { id: d.id, t: 0, done: false, doneT: 0 };
      } else if (!hold.done) {
        hold.t += dt;
        if (dist(hold.id) > 4.6 || player.takeover || input.typing) cancel();
        else {
          const name = npcs.dog(hold.id).name, w = sync.walkerOf(hold.id), mine = sync.mine(hold.id);
          if (hold.t >= SHOW_AFTER && card.hidden) {
            showPic(hold.id);
            cap.textContent = mine ? `Let go of ${name}` : w ? `${name} is walking with ${w.name}` : `Walk with ${name}`;
            sub.textContent = w && !mine ? 'Maybe later' : 'Keep holding';
            card.dataset.dog = hold.id;
            card.hidden = false;
          }
          ring.style.setProperty('--p', Math.min(1, hold.t / WALK_HOLD).toFixed(3));
          if (hold.t >= WALK_HOLD) {
            hold.done = true; hold.doneT = hold.t;
            if (fire(hold.id)) { card.classList.add('done'); sub.textContent = mine ? 'Good dog!' : 'Walkies!'; }
            else cancel();
          }
        }
      } else { hold.t += dt; if (hold.t - hold.doneT > 0.7) { card.hidden = true; card.classList.remove('done'); } }
      // a tip, once: the hold is not written on the prompt
      if (!tipped && !hold && dogNear() && !sync.walking()) {
        tipped = true;
        if (!ctx.store?.get('walkTip', false)) { ctx.store?.set('walkTip', true); ui.toast(`Hold ${eKey()} for 4 seconds to take ${dogNear().name} for a walk.`, 4500); }
      }
      // the walk ticks: active walking = you moved in the last few seconds and the dog is beside you
      sinceMove = player.speed > 0.3 ? 0 : sinceMove + dt;
      tickT += dt;
      for (const id of DOGS) {
        const mine = sync.mine(id);
        if (mine && sinceMove < MOVED_FOR && dist(id) < ACTIVE_NEAR) active[id] += dt * 1000;
        if (was[id] && !mine) flush(id);   // the walk ended, however it ended: send what's owed now
        was[id] = mine;
        if (active[id] >= TICK_MAX) flush(id);
      }
      if (tickT >= TICK_EVERY) { tickT = 0; for (const id of DOGS) if (active[id] > 0) flush(id); }
    },
    help: [[['E'], 'hold 4 seconds by Dax, Nala or Molly to take them for a walk round town; hold again to let go']],
  };
}
