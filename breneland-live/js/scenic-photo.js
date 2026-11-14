// Photos in a scenic view: the camera button (or P, or the pad's R2) opens the photo bar. The rest of the HUD, the name tags and
// the balloons step out of the way. You strike a pose (the sitting versions of the emotes: they travel to everyone as your
// animation, so friends see you wave) and pick a couple of camera options: a slight zoom, a tilt and a warm or cool filter (done
// in the render, the ink pass's grade, never a 2D canvas filter). The shutter renders a frame right there and keeps it as a JPEG
// at most 1280 px on its long side and 300 KB (quality steps down until it fits), with a small caption in the corner. Then Save
// (a download, or the phone's share sheet) or Share to Breneland (lib/photos.js stores it and the community board in Strickler
// Park shows it; guests can't share).
//
// Keys while the bar is up (a capture listener keeps them from the world): Enter or Space the shutter, Left / Right the pose,
// Up / Down the filter, Z the zoom, S the selfie (the camera turns round to face you, so the pose shows), Esc closes. The pad:
// R2 opens the camera in a view (scenic.js), then A the shutter (and Save), B back, the D-pad the pose and the filter, R2 the
// selfie. Taps and clicks on the bar's buttons. Test hooks on the returned object: open, preview, last ({ blob, w, h, bytes, q,
// name }), snap(), save(), share(), setPose(id), set({ zoom, tilt, filter }).
import { frameHooks } from './perf-flags.js';

export const PHOTO = { maxSide: 1280, maxBytes: 300 * 1024, quality: [0.86, 0.8, 0.72, 0.64, 0.56] };
export const POSES = [
  { id: 'sit', name: 'Relaxed' }, { id: 'wave', name: 'Wave' }, { id: 'cheer', name: 'Cheer' }, { id: 'laugh', name: 'Laugh' }, { id: 'point', name: 'Point' },
];
// the filters: an offset on the ink pass's warmth (lights warmer or cooler) and its vignette, laid over daynight's grade
export const FILTERS = [
  { id: 'none', name: 'Natural', warm: 0, vig: 0 },
  { id: 'warm', name: 'Warm', warm: 0.13, vig: 0.16 },
  { id: 'cool', name: 'Cool', warm: -0.11, vig: 0.06 },
];
const ZOOM = { off: 55, on: 40 }, TILT = 8 * Math.PI / 180;
const VIEW_NAMES = { firepit: 'the lakeside firepit', bench: 'Lake Rufallia' };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (tag, cls, text, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

export function createPhoto(ctx, scenic) {
  const { player, hud, audio, ui, net } = ctx;
  const { extras } = scenic;
  let open = false, pose = 0, filter = 0, zoom = false, tilt = 0, selfie = false, last = null, preview = false, busy = false;
  registerShutter(audio);

  // ---- the filter, applied inside the ink pass's frame (daynight writes the grade every frame first; a second render in
  // the same frame, the shutter's, must not add it twice)
  const fx = { base: null, vbase: null, w: 0, v: 0 };
  frameHooks.push(() => {
    const u = ctx.ink?.uniforms; if (!u) return;
    const F = FILTERS[filter], on = open && F.id !== 'none';
    if (!on && fx.base === null) return;
    if (fx.base === null || u.uWarmth.value !== fx.w) fx.base = u.uWarmth.value; // (daynight wrote a new one)
    if (fx.vbase === null || u.uVignette.value !== fx.v) fx.vbase = u.uVignette.value;
    u.uWarmth.value = fx.w = fx.base + (on ? F.warm : 0);
    u.uVignette.value = fx.v = fx.vbase + (on ? F.vig : 0);
    if (!on) fx.base = fx.vbase = null;
  });

  // ---- the bar
  const bar = el('div', 'photo-bar', '', { role: 'toolbar', 'aria-label': 'Photo' }); bar.hidden = true;
  const btn = (cls, label, onclick, html) => { const b = el('button', 'photo-btn ' + cls, html ? '' : label, { type: 'button', 'aria-label': label }); if (html) b.innerHTML = html; b.onclick = e => { e.stopPropagation(); onclick(); }; return b; };
  const poseL = btn('ph-arrow', 'Previous pose', () => setPose(pose - 1), '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  const poseR = btn('ph-arrow', 'Next pose', () => setPose(pose + 1), '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 L16 12 L9 19" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  const poseName = el('span', 'ph-pose', POSES[0].name);
  const poseBox = el('div', 'ph-group ph-poses'); poseBox.append(poseL, poseName, poseR);
  const zoomB = btn('ph-opt', 'Zoom', () => set({ zoom: !zoom }));
  const tiltB = btn('ph-opt', 'Tilt', () => set({ tilt: tilt === 0 ? 1 : tilt === 1 ? -1 : 0 }));
  const filtB = btn('ph-opt', 'Filter', () => set({ filter: (filter + 1) % FILTERS.length }));
  const selfB = btn('ph-opt', 'Selfie', () => set({ selfie: !selfie }));
  const shutter = btn('ph-shutter', 'Take the photo', () => snap(), '<span class="ph-dot"></span>');
  const closeB = btn('ph-close', 'Close the camera', () => close(), '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>');
  const opts = el('div', 'ph-group ph-opts'); opts.append(selfB, zoomB, tiltB, filtB);
  bar.append(poseBox, opts, shutter, closeB);
  const flash = el('div', 'photo-flash'); flash.hidden = true;

  // ---- the preview card
  const card = el('div', 'panel photo-card', '', { role: 'dialog', 'aria-label': 'Your photo' }); card.hidden = true;
  const img = el('img', 'pc-img', '', { alt: 'The photo you just took' });
  const note = el('div', 'pc-note', '');
  const saveB = el('button', 'btn primary pc-save', 'Save to my device', { type: 'button' });
  const shareB = el('button', 'btn pc-share', 'Share to Breneland', { type: 'button' });
  const againB = el('button', 'btn pc-again', 'Take another', { type: 'button' });
  const doneB = el('button', 'btn pc-done', 'Done', { type: 'button' });
  const btns = el('div', 'pc-btns'); btns.append(saveB, shareB, againB, doneB);
  card.append(img, note, btns);
  saveB.onclick = () => save(); shareB.onclick = () => share(); againB.onclick = () => showPreview(false); doneB.onclick = () => close();
  hud.append(bar, card, flash);

  function paint() {
    poseName.textContent = POSES[pose].name;
    zoomB.textContent = zoom ? 'Zoom 1.4x' : 'Zoom 1x'; zoomB.setAttribute('aria-pressed', zoom ? 'true' : 'false');
    tiltB.textContent = tilt === 0 ? 'Tilt off' : tilt > 0 ? 'Tilt left' : 'Tilt right'; tiltB.setAttribute('aria-pressed', tilt ? 'true' : 'false');
    filtB.textContent = FILTERS[filter].name; filtB.setAttribute('aria-pressed', filter ? 'true' : 'false');
    selfB.textContent = selfie ? 'Selfie' : 'The view'; selfB.setAttribute('aria-pressed', selfie ? 'true' : 'false');
    extras.selfie = open && selfie;
    extras.fov = open && zoom ? ZOOM.on : null;
    extras.roll = open ? tilt * TILT : 0;
  }
  function setPose(i) {
    pose = (i + POSES.length) % POSES.length;
    const to = player.takeover;
    if (to && (to.firepit || to.scenicBench)) to.anim = POSES[pose].id;
    paint();
  }
  function set(o) {
    if (o.zoom !== undefined) zoom = !!o.zoom;
    if (o.tilt !== undefined) tilt = Math.max(-1, Math.min(1, Math.round(o.tilt)));
    if (o.selfie !== undefined) selfie = !!o.selfie;
    if (o.filter !== undefined) filter = ((o.filter | 0) % FILTERS.length + FILTERS.length) % FILTERS.length;
    paint();
  }

  function toggle() { if (open) close(); else openBar(); }
  function openBar() {
    if (open || !scenic.view) return;
    open = true; preview = false;
    bar.hidden = false; card.hidden = true;
    hud.classList.add('photo-mode'); document.body.classList.add('photo-on');
    setPose(pose); paint();
    audio.ui?.('blip');
    setTimeout(() => { if (open && input0()) shutter.focus({ preventScroll: true }); }, 30);
  }
  const input0 = () => ctx.input?.lastDevice !== 'touch';
  function close() {
    if (!open) return;
    open = false; preview = false;
    bar.hidden = true; card.hidden = true; flash.hidden = true;
    hud.classList.remove('photo-mode'); document.body.classList.remove('photo-on');
    const to = player.takeover;
    if (to && (to.firepit || to.scenicBench)) to.anim = 'sit';
    extras.fov = null; extras.roll = 0; extras.selfie = false;
    if (img.src) { URL.revokeObjectURL(img.src); img.removeAttribute('src'); }
    ctx.canvas?.focus?.();
  }
  function showPreview(on) {
    preview = on;
    card.hidden = !on; bar.hidden = on;
    if (on) setTimeout(() => saveB.focus({ preventScroll: true }), 30);
    else shutter.focus({ preventScroll: true });
  }

  // ---- the shutter: a fresh frame now, scaled into a 2D canvas, a caption painted on, a JPEG under the caps
  async function snap() {
    if (!open || busy) return null;
    busy = true;
    try {
      const r = ctx.renderer, src = r.domElement;
      ctx.ink.render(ctx.scene, ctx.camera); // (the filter's hook runs inside; the drawing buffer is ours until this task ends)
      const k = Math.min(1, PHOTO.maxSide / Math.max(src.width, src.height));
      const w = Math.max(2, Math.round(src.width * k)), h = Math.max(2, Math.round(src.height * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.drawImage(src, 0, 0, w, h);
      caption(g, w, h, scenic.view?.kind);
      let blob = null, q = 0;
      for (q of PHOTO.quality) { blob = await toBlob(cv, q); if (blob && blob.size <= PHOTO.maxBytes) break; }
      if (!blob || blob.size > PHOTO.maxBytes) { // still too big (a huge busy picture): a smaller one
        const c2 = document.createElement('canvas'); c2.width = Math.round(w * 0.75); c2.height = Math.round(h * 0.75);
        c2.getContext('2d').drawImage(cv, 0, 0, c2.width, c2.height); blob = await toBlob(c2, 0.7);
      }
      if (!blob) { ui.toast('The camera jammed. Try again?', 2400); return null; }
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
      last = { blob, w, h, bytes: blob.size, q, view: scenic.view?.kind || 'view', name: `breneland-${scenic.view?.kind || 'view'}-${stamp}.jpg`, shared: null };
      audio.play?.('photo-shutter');
      if (!reduced()) { flash.hidden = false; flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); setTimeout(() => { flash.hidden = true; }, 420); }
      if (img.src) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
      const guest = ctx.accounts?.auth?.mode !== 'account';
      shareB.disabled = guest; shareB.title = guest ? 'Sign in with a name and PIN to share' : '';
      note.textContent = guest ? 'Saved photos stay on your device. Sign in with a name to share them in Breneland.' : 'Save it, or share it to the photo board in Strickler Park.';
      showPreview(true);
      return last;
    } finally { busy = false; }
  }
  // the picture goes to the device: the share sheet on a phone that has one, else a download
  async function save() {
    if (!last) return null;
    const file = typeof File === 'function' ? new File([last.blob], last.name, { type: 'image/jpeg' }) : null;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (coarse && file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Breneland' }); note.textContent = 'Saved!'; return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    const url = URL.createObjectURL(last.blob), a = document.createElement('a');
    a.href = url; a.download = last.name; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    note.textContent = 'Saved to your downloads.';
    return 'downloaded';
  }
  // a copy to Breneland (lib/photos.js): signed-in players only
  async function share() {
    if (!last) return null;
    if (ctx.accounts?.auth?.mode !== 'account') { note.textContent = 'Sign in with a name and PIN to share photos.'; return { ok: false, error: 'guest' }; }
    if (last.shared) { note.textContent = 'Already on the board!'; return last.shared; }
    shareB.disabled = true; note.textContent = 'Sharing...';
    let res;
    try {
      const r = await fetch('/api/photos', { method: 'POST', headers: { ...ctx.accounts.headers(), 'content-type': 'image/jpeg', 'x-photo-view': last.view }, body: last.blob, cache: 'no-store' });
      res = await r.json().catch(() => ({})); res.status = r.status;
    } catch { res = { ok: false, error: 'offline' }; }
    if (res.ok) { last.shared = res; note.textContent = res.dropped ? 'Shared! Your oldest shared photo made room for it.' : 'Shared! Look for it on the photo board in Strickler Park.'; }
    else { shareB.disabled = false; note.textContent = res.message || 'That did not work. Try again in a bit.'; }
    return res;
  }

  // keys while the bar or the card is up: the world does not hear them (Tab still moves the focus, the chat still types)
  const keyGuard = e => {
    if (!open) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopImmediatePropagation();
    if (e.code === 'Tab') return;
    const onBtn = tag === 'BUTTON' && (bar.contains(t) || card.contains(t));
    if ((e.code === 'Enter' || e.code === 'Space') && onBtn) return; // (the focused button presses itself)
    if (handle(e.code)) e.preventDefault();
  };
  addEventListener('keydown', keyGuard, true);
  function handle(code) {
    if (code === 'Escape') { if (preview) showPreview(false); else close(); return true; }
    if (preview) return code === 'Enter' || code === 'Space' ? (save(), true) : false;
    if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') { snap(); return true; }
    if (code === 'ArrowLeft' || code === 'PadLeft') { setPose(pose - 1); return true; }
    if (code === 'ArrowRight' || code === 'PadRight') { setPose(pose + 1); return true; }
    if (code === 'ArrowUp' || code === 'PadUp') { set({ filter: filter + 1 }); return true; }
    if (code === 'ArrowDown' || code === 'PadDown') { set({ filter: filter - 1 }); return true; }
    if (code === 'KeyZ') { set({ zoom: !zoom }); return true; }
    if (code === 'KeyS') { set({ selfie: !selfie }); return true; }
    if (code === 'KeyP') { close(); return true; }
    return false; // (the keyboard's other keys are still kept from the world by keyGuard: no walking off mid-pose)
  }

  scenic.button.onclick = e => { e.stopPropagation(); toggle(); };

  return {
    get open() { return open; }, get preview() { return preview; }, get last() { return last; }, get canLook() { return !preview; },
    get state() { return { pose: POSES[pose].id, filter: FILTERS[filter].id, zoom, tilt, selfie }; },
    toggle, close, openBar, snap, save, share, setPose: id => setPose(Math.max(0, POSES.findIndex(p => p.id === id))), set,
    update() { if (open && !scenic.view) close(); },
    // the pad (through the world's keys): A the shutter / save, B back, the D-pad the pose and the filter
    onKey(code) {
      if (!open) return false;
      if (code === 'KeyE') { if (preview) save(); else snap(); return true; }
      if (code === 'KeyN' && !preview) { set({ selfie: !selfie }); return true; } // (R2)
      return handle(code);
    },
  };
}

function toBlob(cv, q) { return new Promise(res => { try { cv.toBlob(b => res(b), 'image/jpeg', q); } catch { res(null); } }); }

// "Breneland · the lakeside firepit" in the bottom right corner, small, white with an ink edge (stroke, never a filter)
function caption(g, w, h, kind) {
  const text = 'Breneland  ' + String.fromCharCode(183) + '  ' + (VIEW_NAMES[kind] || 'a scenic view');
  const px = Math.max(12, Math.round(h * 0.03));
  g.font = `700 ${px}px Fredoka, Nunito, sans-serif`;
  g.textAlign = 'right'; g.textBaseline = 'bottom';
  const x = w - Math.round(px * 0.8), y = h - Math.round(px * 0.6);
  g.lineJoin = 'round'; g.lineWidth = Math.max(2, px * 0.22); g.strokeStyle = 'rgba(43, 35, 64, 0.85)'; g.strokeText(text, x, y);
  g.fillStyle = '#fff4dc'; g.fillText(text, x, y);
}

// a camera's click-clack (non-positional, quiet)
function registerShutter(audio) {
  if (!audio?.registerSfx || audio._photoSfx) return;
  audio._photoSfx = true;
  audio.registerSfx('photo-shutter', a => {
    const o = a.sfx, t = a.ctx.currentTime;
    a.burst(o, { t, dur: 0.018, type: 'bandpass', f: 4200, Q: 1.2, peak: 0.1 });
    a.burst(o, { t: t + 0.07, dur: 0.03, type: 'bandpass', f: 2600, Q: 1.0, peak: 0.08 });
    a.burst(o, { t: t + 0.07, dur: 0.06, type: 'lowpass', f: 700, peak: 0.05, brown: true });
  });
}
