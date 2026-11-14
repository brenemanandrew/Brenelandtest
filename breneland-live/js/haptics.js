// Haptics: a buzz on a phone (navigator.vibrate) and a rumble on a controller (the gamepad's vibrationActuator, through
// input.rumble) for moments that deserve one: a bite on the line, a bocce clack, a dog crunching your treat, the tire swing's
// launch, a car horn near you, landing from the water tower. A switch in Settings > Sound turns it all off (saved as
// breneland.haptics). Most moments already make a sound, so this listens to audio.play instead of reaching into each feature:
// a sound on the list, close enough to you, buzzes. Rumbles features ask for directly go through the same switch and buzz a phone
// too. ctx.haptics = { buzz(kind), enabled, set(on) }.
import { el } from './util.js';

// pattern: navigator.vibrate milliseconds (on, off, on...); pad: [strong, weak, ms]
export const BUZZ = {
  bite: { vib: [35, 40, 70], pad: [0.35, 0.7, 160] },
  clack: { vib: [22], pad: [0.25, 0.4, 70] },
  crunch: { vib: [12, 25, 12, 25, 12], pad: [0.1, 0.35, 120] },
  bump: { vib: [18], pad: [0.2, 0.15, 60] },
  launch: { vib: [60, 30, 140], pad: [0.8, 0.6, 260] },
  horn: { vib: [45, 60, 45], pad: [0.15, 0.45, 180] },
  land: { vib: [80], pad: [0.9, 0.5, 160] },
  throw: { vib: [25], pad: [0.2, 0.35, 70] },
  buy: { vib: [20, 50, 20, 50, 60], pad: [0.2, 0.5, 200] },   // a wreath bought at Carol's stand (the till)
  test: { vib: [40, 60, 40], pad: [0.4, 0.6, 140] },
  // the dark below Angell Street: two heartbeat thuds, then the match struck (scratch-scratch). `then` is a second pad rumble
  // [after ms, strong, weak, ms]
  heart: { vib: [55, 170, 85], pad: [0.7, 0.2, 90], then: [260, 0.55, 0.15, 120] },
  strike: { vib: [14, 45, 18, 40, 26], pad: [0.05, 0.45, 45], then: [90, 0.1, 0.55, 70] },
};
// which sounds buzz, and how close to you they must be (m)
const BY_SOUND = { 'fish-bloop': ['bite', 14], 'bocce-clack': ['clack', 9], crunch: ['crunch', 6], 'swing-sproing': ['launch', 5], 'car-horn': ['horn', 16], thump: ['land', 4], till: ['buy', 8] };

export function createHaptics(ctx) {
  const { audio, input, player, store, npcs } = ctx;
  let enabled = store.get('haptics', true) !== false;
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const phone = () => canVibrate && (input.lastDevice === 'touch' || coarse);
  const log = [];   // for the tests: what buzzed, newest last
  const last = {};
  const padRumble = input.rumble.bind(input);
  // every rumble a feature asks for goes through the switch, and buzzes a phone as well
  input.rumble = (strong = 0.5, weak = 0.5, ms = 150) => {
    if (!enabled) return;
    padRumble(strong, weak, ms);
    if (phone()) { try { navigator.vibrate(Math.max(10, Math.min(200, ms * Math.max(strong, weak)))); } catch { /* not allowed now */ } }
  };
  function buzz(kind) {
    const b = BUZZ[kind];
    if (!b || !enabled) return false;
    const now = performance.now();
    if (now - (last[kind] || 0) < 220) return false;   // a burst of the same sound buzzes once
    last[kind] = now;
    log.push(kind); if (log.length > 30) log.shift();
    padRumble(...b.pad);
    if (b.then) setTimeout(() => { if (enabled) padRumble(b.then[1], b.then[2], b.then[3]); }, b.then[0]);
    if (phone()) { try { navigator.vibrate(b.vib); } catch { /* not allowed now */ } }
    return true;
  }
  // listen to the sounds
  const play = audio.play.bind(audio);
  audio.play = (name, x, y, z, opts) => {
    const k = BY_SOUND[name];
    if (k && ctx.playing) {
      const near = x === undefined || Math.hypot(x - player.pos.x, z - player.pos.z) < k[1];
      if (near && !(name === 'bocce-clack' && (opts?.v ?? 1) < 0.5)) buzz(k[0]);
    }
    return play(name, x, y, z, opts);
  };

  // Settings > Sound: a Vibration switch under the Sound one
  const body = document.querySelector('#help [data-page="sound"] .set-body');
  let btn = null;
  if (body) {
    const line = el('div', 'set-line set-haptics');
    const txt = el('span', 'set-line-t');
    txt.append(el('b', '', 'Vibration'), el('small', '', 'A buzz on a phone, rumble on a controller'));
    btn = el('button', 'set-switch', '', { type: 'button', role: 'switch', 'aria-label': 'Vibration', id: 'btn-haptics' });
    btn.append(el('span', '', ''));
    line.append(txt, btn);
    const after = body.querySelector('.set-line');
    if (after) after.after(line); else body.prepend(line);
    btn.onclick = () => { set(!enabled); if (enabled) buzz('test'); audio.ui?.('blip'); };
  }
  function paint() { if (btn) { btn.setAttribute('aria-checked', String(enabled)); btn.firstElementChild.textContent = enabled ? 'On' : 'Off'; } }
  function set(on) { enabled = !!on; store.set('haptics', enabled); paint(); }
  paint();

  // bumping into a dog: you walk into one (the body rule stops you), once per bump
  let bumpT = 0;
  const api = { buzz, set, get enabled() { return enabled; }, log, get canVibrate() { return canVibrate; } };
  ctx.haptics = api;
  return {
    name: 'haptics',
    api,
    update(dt) {
      bumpT -= dt;
      if (bumpT > 0 || !player.speed || player.speed < 0.8) return;
      for (const id of ['nala', 'dax']) {
        const d = npcs.dog(id); if (!d || !d.body.root.visible) continue;
        const p = d.body.root.position, r = Math.max(0.4, (d.body.halfLen || 0) * 0.95) + 0.32;
        if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < r) { if (buzz('bump')) bumpT = 1.6; break; }
      }
    },
  };
}
