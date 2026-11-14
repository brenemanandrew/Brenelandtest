// Long text that scrolls itself, for D&D night's narration box and the DM's bubble. A passage longer than its box starts at
// the top, waits, then scrolls at reading speed (or follows the speech while it's read aloud). The player's own scroll pauses
// it for a while. No per-frame allocation.
//
//   const sc = autoScroll(el, { speed, pause, hold })
//   sc.show(fromTop)      a new passage: from scrollTop `fromTop` (its top) down to the end (or straight to the end if it fits)
//   sc.follow(f)          0..1: how far through the passage the speech is (null: not being read)
//   sc.step(dt)           each frame
//   sc.user               true while the player's own scroll holds it
const now = () => performance.now();

export function autoScroll(el, { speed = 22, pause = 1.4, hold = 6 } = {}) {
  // speed: px a second (~3 lines of 15-16 px type in about two seconds: slow); pause: seconds at the top
  const S = { from: 0, wait: 0, active: false, f: null, userAt: -1e9, pos: 0, lastSet: -1 };
  const mine = () => { S.userAt = now(); };
  for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown']) el.addEventListener(ev, mine, { passive: true });
  const set = y => { S.lastSet = Math.round(y); el.scrollTop = y; };
  return {
    get user() { return now() - S.userAt < hold * 1000; },
    get active() { return S.active; },
    show(fromTop = null) {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 1) { S.active = false; return; }
      if (fromTop === null || fromTop >= max - 1) { S.active = false; if (!this.user) set(max); return; } // (it fits: the end, at once)
      S.from = Math.max(0, Math.min(max, fromTop)); S.pos = S.from; S.wait = pause; S.active = true; S.f = null;
      if (!this.user) set(S.pos);
    },
    end() { S.active = false; set(el.scrollHeight); }, // (to the newest line, at once)
    follow(f) { S.f = f === null || f === undefined ? null : Math.max(0, Math.min(1, f)); },
    step(dt) {
      if (!S.active || this.user) return;
      const max = el.scrollHeight - el.clientHeight;
      if (S.wait > 0) { S.wait -= dt; return; }
      if (S.f !== null) {
        // the speech: keep the words being read a third of the way down the box (never back up, never past the end)
        const want = S.from + S.f * (max - S.from + el.clientHeight) - el.clientHeight * 0.33;
        S.pos = Math.min(max, S.pos + Math.max(0, Math.min(max, want) - S.pos) * Math.min(1, dt * 3));
      } else S.pos = Math.min(max, S.pos + speed * dt);
      set(S.pos);
      if (S.pos >= max - 0.5) S.active = false;
    },
  };
}
