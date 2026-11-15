// The table games' moments, seen and heard (tg-look): listens to the tables' beats itself (net.on('tg'), alongside index.js)
// and turns each into its sound, its eyecatch and its piece in flight, at the moment you see it. The game says what each beat
// means (MOMENTS[game], mt-ui.js for Mexican Train); this file only routes: is it your table (the overlay open on it), are you
// in it (your seat), or are you walking past (near, from the table). Nothing here changes the game.
import { registerSounds } from './tg-sound.js';
import { MOMENTS as MT_MOMENTS } from './mt-ui.js';
import { LOOK } from './tg-state.js';
export { LOOK };

import { UIS } from './tg-games.js';
// Mexican Train's moments, and every other game's from its UI module (game-waves: tg-games.js loads them)
export const MOMENTS = new Proxy({ 'mexican-train': MT_MOMENTS }, { get: (o, k) => o[k] || (UIS[k] && UIS[k].moments ? (b, c) => UIS[k].moments(b, c) : undefined) });

export function createLook(ctx, frame, eye, tb) {
  const { net, audio, player } = ctx;
  registerSounds(audio); queueMicrotask(() => registerSounds(audio)); // (index.js registers the old names right after this)
  const you = { table: null, eseat: null };
  const tableTop = id => ctx.features?.find(f => f.name === 'table-games')?.tables?.find(t => t.id === id)?.top;
  function play(name, T, delay = 0) {
    const go = () => {
      const open = T && LOOK.openId === T.id && !frame.root.hidden;
      if (open || !T) audio.play?.(name);
      else { const y = tableTop(T.id) ?? (player.pos.y + 0.8); audio.play?.(name, T.x, y, T.z); }
      LOOK.played.push({ name, at: Date.now(), table: T ? T.id : null }); if (LOOK.played.length > 60) LOOK.played.shift();
    };
    if (delay > 0) setTimeout(go, delay); else go();
  }
  LOOK.sound = (name, delay) => play(name, null, delay);
  LOOK.eye = eye; LOOK.board = tb;
  net.on('tg', m => {
    registerSounds(audio);
    if (m.op === 'you') { you.table = m.table; you.eseat = m.eseat; LOOK.me = { ...you }; return; }
    if (m.op === 'gone') { if (you.table === m.table) { you.table = null; you.eseat = null; LOOK.me = null; } if (LOOK.openId === m.table) eye.clear(); return; }
    if (m.op !== 'table' || !m.beats || !m.table) return;
    const T = m.table, open = LOOK.openId === T.id && !frame.root.hidden;
    const near = open || Math.hypot(player.pos.x - T.x, player.pos.z - T.z) < 18;
    if (!near) return;
    const me = open && you.table === T.id && T.order ? you.eseat : null;
    const moments = MOMENTS[T.game]; if (!moments) return;
    const c = { T, open, me, play: (name, delay) => play(name, T, delay), eye: open ? eye : null, tb: open ? tb : null, frame, look: LOOK };
    for (const b of m.beats) { try { moments(b, c); } catch (e) { console.error('[tg-look]', b.kind, e); } }
  });
  return LOOK;
}
