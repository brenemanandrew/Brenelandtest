// Layout editing: the Studio's first tab loads the game with ?uiedit=1 and this takes over.
// Every piece of the page gets a frame: drag the frame to move the piece, drag its corner to grow or shrink it, tap the eye
// to hide it. Saved per screen kind (phone / PC) and applied by applyUi() in index.html.
(function () {
  const NAMES = { stageWrap: 'Her picture', herSide: 'Her speech balloon', logHead: 'Chat title', logWrap: 'Chat area', meWrap: 'Your speech balloon', meBox: 'Your portrait', bar: 'Chat bar', visitBtn: 'Visit button', bigBtn: 'Expand button', brainBtn: 'Settings button', actBtn: 'Actions button', mic: 'Mic button', send: 'Send button' };
  const SMALL = ['visitBtn', 'bigBtn', 'brainBtn', 'actBtn', 'mic', 'send'];
  const css = document.createElement('style'); css.textContent = `
    #uiLayer { position:fixed; inset:0; z-index:9000; pointer-events:none; font-family:Fredoka, system-ui, sans-serif; }
    .uiF { position:fixed; box-sizing:border-box; border:2px dashed #ffd166; border-radius:10px; pointer-events:auto; cursor:grab; touch-action:none; background:rgba(255,209,102,.08); }
    .uiF.small { border-color:#7fd0ff; background:rgba(127,208,255,.12); } .uiF.sel { border-style:solid; background:rgba(255,209,102,.2); z-index:2; } .uiF:active { cursor:grabbing; }
    .uiF b { position:absolute; left:4px; top:-22px; white-space:nowrap; font-size:12px; font-weight:600; color:#1a1026; background:#ffd166; border-radius:8px; padding:1px 8px; } .uiF.small b { display:none; background:#7fd0ff; } .uiF.small.sel b { display:block; }
    .uiF i { position:absolute; right:-9px; bottom:-9px; width:20px; height:20px; border-radius:50%; background:#fff; border:3px solid #ff6fa5; cursor:nwse-resize; }
    .uiF u { position:absolute; right:-9px; top:-11px; width:22px; height:22px; border-radius:50%; background:#fff; text-decoration:none; font-size:12px; line-height:22px; text-align:center; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,.4); }
    #uiBar { position:fixed; left:50%; bottom:10px; transform:translateX(-50%); z-index:9001; display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:center; max-width:96vw; padding:8px 12px; border-radius:18px; background:#fff; color:#3a2a5c; box-shadow:0 8px 26px rgba(0,0,0,.5); font-family:Fredoka, system-ui, sans-serif; font-size:13px; }
    #uiBar button { font:inherit; font-weight:600; border:0; border-radius:999px; padding:7px 13px; cursor:pointer; background:#ece6f7; color:#4a3a7c; } #uiBar button.go { background:linear-gradient(135deg,#a855f7,#ec4899); color:#fff; }
    #uiBar span { opacity:.75; }`;
  document.head.append(css);
  const layer = document.createElement('div'); layer.id = 'uiLayer'; const bar = document.createElement('div'); bar.id = 'uiBar'; document.body.append(layer, bar);
  // something to see in the balloons while arranging them
  for (const [w, b, t] of [['herWrap', 'herBubble', 'Her words show up here.'], ['meWrap', 'meBubble', 'Yours show up here.']]) { const e = document.getElementById(b); if (e) { e.textContent = t; document.getElementById(w).classList.add('show'); } }
  const frames = {}; let sel = '', dirty = false;
  const cur = () => { const m = uiMode(); dev.ui = dev.ui || {}; return dev.ui[m] || (dev.ui[m] = {}); };
  const get = id => { const c = cur(); return c[id] || (c[id] = { x: 0, y: 0, s: 1, hide: false }); };
  function drawBar() {
    bar.textContent = ''; const add = (t, fn, cls) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; bar.append(b); return b; };
    const lab = document.createElement('span'); lab.textContent = `Arranging the ${uiMode() === 'phone' ? 'phone' : 'PC'} layout. Drag to move, corner to resize, eye to hide.`; bar.append(lab);
    for (const id of UI_PARTS) if ((cur()[id] || {}).hide) add('Show ' + NAMES[id], () => { get(id).hide = false; touch(); });
    if (sel) add('Reset ' + NAMES[sel], () => { delete cur()[sel]; touch(); });
    add('Reset all', () => { if (confirm('Put every piece back where it started on this screen size?')) { dev.ui[uiMode()] = {}; touch(); } });
    add(dirty ? 'Save layout' : 'Saved', save, dirty ? 'go' : '');
  }
  function touch() { dirty = true; applyUi(dev.ui); place(); drawBar(); }
  async function save() { await fetch('/api/dev', { method: 'POST', body: JSON.stringify({ ui: dev.ui }) }); dirty = false; drawBar(); try { parent.postMessage({ studio: 'saved' }, '*'); } catch {} }
  function place() {
    for (const id of UI_PARTS) {
      const elx = document.getElementById(id), f = frames[id]; if (!elx || !f) continue; const r = elx.getBoundingClientRect(), hidden = (cur()[id] || {}).hide || r.width < 2;
      f.style.display = hidden ? 'none' : 'block'; f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; f.style.width = r.width + 'px'; f.style.height = r.height + 'px'; f.classList.toggle('sel', sel === id);
    }
  }
  for (const id of UI_PARTS) {
    if (!document.getElementById(id)) continue;
    const f = document.createElement('div'); f.className = 'uiF' + (SMALL.includes(id) ? ' small' : ''); f.innerHTML = `<b>${NAMES[id]}</b><u title="Hide">👁</u><i title="Drag to resize"></i>`; layer.append(f); frames[id] = f;
    let drag = null;
    f.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sel = id; const u = get(id), t = e.target.tagName; if (t === 'U') { u.hide = true; sel = ''; touch(); return; }
      drag = { x: e.clientX, y: e.clientY, ux: u.x || 0, uy: u.y || 0, us: u.s || 1, size: t === 'I', w: f.offsetWidth }; f.setPointerCapture(e.pointerId); place(); drawBar(); });
    f.addEventListener('pointermove', e => { if (!drag) return; const u = get(id), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.size) u.s = Math.max(0.4, Math.min(2.6, +(drag.us * (drag.w + (dx + dy) / 2) / drag.w).toFixed(3))); else { u.x = Math.round(drag.ux + dx); u.y = Math.round(drag.uy + dy); }
      dirty = true; applyUi(dev.ui); place(); });
    const up = () => { if (drag) { drag = null; drawBar(); } }; f.addEventListener('pointerup', up); f.addEventListener('pointercancel', up);
  }
  layer.addEventListener('pointerdown', () => { sel = ''; place(); drawBar(); });
  setInterval(place, 400); addEventListener('resize', () => { place(); drawBar(); }); place(); drawBar();
})();
