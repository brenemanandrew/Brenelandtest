// One-on-one time (the hand on your picture). She stands in front of you on a plain colour stage, like the heart game's, and you
// spend a little time with her: look at her from another side or ask for a pose (Stare), toss her snacks to catch (Snack), poke
// her (Poke), or use both hands to pat her hair, rub her shoulders, hold her hands (Rub). It is affectionate: her chest, hips and
// thighs are off limits. Reach there and she blocks you, nothing is scored, and the third time she calls it a day.
// What you did is added up when you leave (POST /api/hang): romance, rapport, and a skill of its own that levels up.
(function () {
  const $ = id => document.getElementById(id), el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.filter(k => k != null)); return e; };
  const css = `
  body.hang #stageWrap { position:fixed !important; left:0 !important; top:0 !important; transform:none !important; width:100vw !important; height:100dvh !important; z-index:25; }
  body.hang #stage { border-radius:0; box-shadow:none; } body.hang #dock, body.hang #outSign, body.hang #movieBar, body.hang #awayNote { display:none !important; }
  #hangLayer { position:fixed; inset:0; z-index:26; touch-action:none; display:none; } body.hang #hangLayer { display:block; }
  #hangBar { position:fixed; left:50%; bottom:calc(14px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:28; display:none; gap:8px; padding:8px 10px; border-radius:26px; background:rgba(255,255,255,.82); box-shadow:0 8px 26px rgba(120,20,80,.35); font-family:"Fredoka",system-ui,sans-serif; } body.hang #hangBar { display:flex; }
  #hangBar button { width:62px; border:0; background:none; border-radius:18px; padding:6px 0 4px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:1px; font:600 11.5px "Fredoka",sans-serif; color:#7a2a5c; } #hangBar button i { font-style:normal; font-size:28px; line-height:1.1; } #hangBar button.on { background:linear-gradient(135deg,#ff8fc0,#c084fc); color:#fff; box-shadow:0 4px 12px rgba(200,60,140,.45); }
  #hangHud { position:fixed; left:50%; top:calc(10px + env(safe-area-inset-top)); transform:translateX(-50%); z-index:28; display:none; align-items:center; gap:10px; padding:6px 14px; border-radius:999px; background:rgba(255,255,255,.8); font:700 14px "Fredoka",sans-serif; color:#7a2a5c; white-space:nowrap; } body.hang #hangHud { display:flex; }
  #hangHud .xp { width:90px; height:8px; border-radius:6px; background:rgba(120,40,90,.2); overflow:hidden; } #hangHud .xp i { display:block; height:100%; background:linear-gradient(90deg,#ff8fc0,#a855f7); }
  #hangTip { position:fixed; left:50%; bottom:calc(104px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:27; max-width:92vw; padding:6px 14px; border-radius:999px; background:rgba(60,10,40,.6); color:#fff; font:500 13.5px "Fredoka",sans-serif; text-align:center; pointer-events:none; display:none; } body.hang #hangTip { display:block; }
  #hangPoses { position:fixed; left:50%; bottom:calc(142px + env(safe-area-inset-bottom)); opacity:.92; transform:translateX(-50%); z-index:28; display:none; flex-wrap:wrap; justify-content:center; gap:6px; max-width:94vw; } #hangPoses button { border:0; border-radius:999px; padding:7px 13px; font:600 13px "Fredoka",sans-serif; background:rgba(255,255,255,.85); color:#7a2a5c; cursor:pointer; }
  .hangPop { position:fixed; z-index:29; pointer-events:none; font:700 18px "Fredoka",sans-serif; color:#fff; text-shadow:0 2px 6px rgba(120,0,60,.7); animation:hangPop .9s ease-out forwards; } @keyframes hangPop { from { opacity:1; transform:translate(-50%,-50%) scale(.8); } to { opacity:0; transform:translate(-50%,-190%) scale(1.25); } }
  .hangCandy { position:fixed; z-index:27; pointer-events:none; font-size:44px; line-height:1; transform:translate(-50%,-50%); } .hangHand { position:fixed; z-index:27; pointer-events:none; font-size:54px; line-height:1; transform:translate(-50%,-50%); filter:drop-shadow(0 4px 8px rgba(80,0,50,.45)); transition:opacity .15s; }
  #hangAim { position:fixed; z-index:27; pointer-events:none; height:4px; border-radius:3px; background:linear-gradient(90deg,rgba(255,255,255,.9),rgba(255,255,255,0)); transform-origin:0 50%; display:none; }`;
  document.head.append(el('style', { textContent: css }));
  const layer = el('div', { id: 'hangLayer' }), bar = el('div', { id: 'hangBar' }), hud = el('div', { id: 'hangHud' }), tip = el('div', { id: 'hangTip' }), poses = el('div', { id: 'hangPoses' }), aim = el('div', { id: 'hangAim' });
  document.body.append(layer, bar, hud, tip, poses, aim);
  const MODES = [['stare', '👁️', 'Stare', 'Drag to lean round her. Pick a pose for her to strike.'], ['snack', '🍬', 'Snack', 'Flick a snack up at her mouth.'], ['poke', '👉', 'Poke', 'Tap her: cheek, hair, shoulder, hands, belly.'], ['rub', '🤲', 'Rub', 'Left side of the screen is your left hand, right side your right. On a PC hold Ctrl or Alt.'], ['exit', '🚪', 'Exit', '']];
  const POSES = [['Hands on hips', 'hips', 0], ['Arms crossed', 'crossarms', 0], ['Peace', 'peace', 0], ['Thinking', 'think', 0], ['Little heart', 'fingerheart', 1], ['Cheer', 'cheer', 1], ['Stretch', 'stretch', 2], ['Bow', 'bow', 2], ['Dance', 'dance', 3], ['Fox', 'fox', 4], ['Hands up', 'handsup', 5]];
  const POKE = { face: ['pout', '😤'], hair: ['tilt', '✨'], belly: ['eep', '😆'], shoulderL: ['jolt', '❓'], shoulderR: ['jolt', '❓'], armL: ['jolt', ''], armR: ['jolt', ''], handL: ['wave', '✋'], handR: ['wave', '✋'], kneeL: ['jump', '😲'], kneeR: ['jump', '😲'] };
  const RUB = { hair: 'patting her head', face: 'cupping her cheek', shoulderL: 'rubbing her shoulder', shoulderR: 'rubbing her shoulder', armL: 'stroking her arm', armR: 'stroking her arm', handL: 'holding her hand', handR: 'holding her hand' };
  const G = { on: false, mode: 'stare', n: {}, strikes: 0, rubbed: {}, comfort: {}, lvl: 0, xp: 0, need: 40, t0: 0, drag: null, hands: {}, keys: {} };
  const pop = (x, y, text) => { const p = el('div', { className: 'hangPop', textContent: text }); p.style.left = x + 'px'; p.style.top = y + 'px'; document.body.append(p); setTimeout(() => p.remove(), 900); };
  const fx = n => { try { WizraSound.fx(n); } catch {} }, warmth = () => Math.min(1, 0.04 + (G.n.poke || 0) * 0.04 + (G.n.snack || 0) * 0.035 + Object.keys(G.rubbed).length * 0.13);
  function drawHud() { hud.textContent = ''; hud.append('💞 Lv ' + G.lvl, el('div', { className: 'xp' }, Object.assign(el('i'), { style: `width:${Math.min(100, Math.round(100 * G.xp / Math.max(1, G.need)))}%` })), `🍬 ${G.n.snack || 0}  👉 ${Math.min(10, G.n.poke || 0)}/10  🤲 ${Object.keys(G.rubbed).length}`); avatar.heartStage(warmth()); }
  function setMode(m) { if (m === 'exit') return end(); G.mode = m; for (const b of bar.children) b.classList.toggle('on', b.dataset.m === m); tip.textContent = (MODES.find(x => x[0] === m) || [])[3] || ''; poses.style.display = m === 'stare' ? 'flex' : 'none'; for (const h of Object.values(G.hands)) h.el.remove(); G.hands = {}; aim.style.display = 'none'; if (m !== 'stare') avatar.hangView({ yaw: 0, dist: m === 'snack' ? 2.3 : 1.9 }); }
  for (const [m, icon, name] of MODES) { const b = el('button', { title: name }, el('i', { textContent: icon }), name); b.dataset.m = m; b.onclick = e => { e.stopPropagation(); fx('click'); setMode(m); }; bar.append(b); }
  function drawPoses() { poses.textContent = ''; for (const [name, g, lv] of POSES) { const b = el('button', { textContent: lv > G.lvl ? '🔒 Lv ' + lv : name }); b.disabled = lv > G.lvl; if (b.disabled) b.style.opacity = '.5'; b.onclick = e => { e.stopPropagation(); avatar.gesture(g, 7); G.n.pose = (G.n.pose || 0) + 1; fx('pop'); }; poses.append(b); } }
  function strike(x, y) { G.strikes++; avatar.gesture('blocked', 2.6); avatar.emote('💢', 1600); fx('anger'); pop(x, y, 'Hey. Not there.'); if (G.strikes >= 3) { tip.textContent = 'She has had enough for now.'; setTimeout(() => end(true), 1400); } }

  // ---- what the pointer does in each mode ----
  layer.addEventListener('pointerdown', e => { if (!G.on) return; layer.setPointerCapture(e.pointerId);
    if (G.mode === 'stare') G.drag = { x: e.clientX, y: e.clientY };
    else if (G.mode === 'snack') { G.drag = { x: e.clientX, y: e.clientY, aim: true }; }
    else if (G.mode === 'poke') { const z = avatar.hangZone(e); if (!z) return; if (!z.ok) return strike(e.clientX, e.clientY); const [g, em] = POKE[z.zone] || ['jolt', '']; avatar.gesture(g, 2.2); if (em) avatar.emote(em, 1400); fx('pop'); G.n.poke = (G.n.poke || 0) + 1; pop(e.clientX, e.clientY, G.n.poke <= 10 ? '+0.5 💗' : '✨'); drawHud(); }
    else if (G.mode === 'rub') handDown(e.pointerId, e.clientX < innerWidth / 2 ? 'L' : 'R', e.clientX, e.clientY); });
  layer.addEventListener('pointermove', e => { if (!G.on) return;
    if (G.mode === 'stare' && G.drag) { avatar.hangView({ dyaw: -(e.clientX - G.drag.x) * 0.006, dx: 0, dy: -(e.clientY - G.drag.y) * 0.002 }); G.drag = { x: e.clientX, y: e.clientY }; }
    else if (G.mode === 'snack' && G.drag) { const dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y, len = Math.hypot(dx, dy); aim.style.display = len > 12 ? 'block' : 'none'; aim.style.left = G.drag.x + 'px'; aim.style.top = G.drag.y + 'px'; aim.style.width = Math.min(260, len * 2.4) + 'px'; aim.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`; }
    else if (G.mode === 'rub') { if (G.hands[e.pointerId]) handMove(e.pointerId, e.clientX, e.clientY, e); else if (e.pointerType === 'mouse') { for (const [key, side] of [['Control', 'L'], ['Alt', 'R']]) { const id = 'key' + side; if (G.keys[key]) { if (!G.hands[id]) handDown(id, side, e.clientX, e.clientY); handMove(id, e.clientX, e.clientY, e); } else if (G.hands[id]) handUp(id); } } } });
  const up = e => { if (!G.on) return; if (G.mode === 'snack' && G.drag) { const dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y; aim.style.display = 'none'; if (Math.hypot(dx, dy) > 14) toss(G.drag.x, G.drag.y, dx, dy); } G.drag = null; if (G.hands[e.pointerId]) handUp(e.pointerId); };
  layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
  layer.addEventListener('wheel', e => { if (G.on && G.mode === 'stare') { const v = avatar.hangView({}); avatar.hangView({ dist: (v.dist || 1.9) * (e.deltaY > 0 ? 1.08 : 0.93) }); e.preventDefault(); } }, { passive: false });
  addEventListener('keydown', e => { if (!G.on) return; if (e.key === 'Control' || e.key === 'Alt') { G.keys[e.key] = true; if (G.mode === 'rub') e.preventDefault(); } if (e.key === 'Escape') end(); });
  addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Alt') { G.keys[e.key] = false; const id = 'key' + (e.key === 'Control' ? 'L' : 'R'); if (G.hands[id]) handUp(id); if (G.on) e.preventDefault(); } });

  // ---- snack: a flick sends it in an arc; where the flick points is where it lands ----
  let tossing = 0;
  function toss(x0, y0, dx, dy) { if (tossing > 2) return; tossing++; const candy = el('div', { className: 'hangCandy', textContent: Math.random() < 0.5 ? '🍬' : '🍿' }); document.body.append(candy); const k = 2.4, x1 = x0 + dx * k, y1 = y0 + dy * k, t0 = performance.now(), T = 720; avatar.gesture('ahh', 1.1); fx('send');
    (function fly(now) { const t = Math.min(1, (now - t0) / T), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * 90; candy.style.left = x + 'px'; candy.style.top = y + 'px'; candy.style.fontSize = (44 - 30 * t) + 'px'; candy.style.transform = `translate(-50%,-50%) rotate(${t * 540}deg)`;
      if (t < 1) return requestAnimationFrame(fly); tossing--; candy.remove(); const m = avatar.hangMouth(); if (!m) return; const d = Math.hypot(x1 - m.x, y1 - m.y), near = Math.max(30, m.r * 2.6);
      if (d <= near) { G.n.snack = (G.n.snack || 0) + 1; avatar.gesture('chew', 2.2); avatar.emote('😋', 1300); fx('sparkle'); pop(m.x, m.y - 30, 'Caught! +💗'); }
      else if (d <= near * 3.2) { avatar.gesture('cringe', 1.3); fx('pop'); pop(x1, y1, 'Bonk'); } else pop(x1, y1, 'Miss');
      drawHud(); })(t0); }

  // ---- rub: each hand is a cursor of its own; moving it over her fills that spot's comfort ----
  function handDown(id, side, x, y) { const h = { side, x, y, el: el('div', { className: 'hangHand', textContent: '🤚' }) }; if (side === 'L') h.el.style.transform = 'translate(-50%,-50%) scaleX(-1)'; h.el.style.left = x + 'px'; h.el.style.top = y + 'px'; document.body.append(h.el); G.hands[id] = h; }
  function handUp(id) { const h = G.hands[id]; if (h) { h.el.remove(); delete G.hands[id]; } }
  let petAt = 0;
  function handMove(id, x, y, e) { const h = G.hands[id]; if (!h || h.away) return; const moved = Math.hypot(x - h.x, y - h.y); h.x = x; h.y = y; h.el.style.left = x + 'px'; h.el.style.top = y + 'px'; const z = avatar.hangZone({ clientX: x, clientY: y }); if (!z || moved < 1) return;
    if (!z.ok) { h.away = true; h.el.style.opacity = '.25'; setTimeout(() => { h.away = false; h.el.style.opacity = '1'; }, 1200); return strike(x, y); }
    if (!RUB[z.zone]) return; const key = z.zone.replace(/[LR]$/, ''); G.comfort[key] = (G.comfort[key] || 0) + moved / 520; const now = performance.now(); if (now - petAt > 1500) { petAt = now; avatar.gesture('petted', 2.2); }
    if (G.comfort[key] >= 1 && !G.rubbed[key]) { G.rubbed[key] = RUB[z.zone]; avatar.emote('💖', 1600); fx('heart'); pop(x, y - 30, '+2 💗'); drawHud(); } }

  // ---- in and out ----
  async function start() {
    if (G.on) return; if (typeof phoneCall !== 'undefined' && phoneCall.on) return; if (document.body.classList.contains('fp')) return addSys('Head home first: one-on-one time happens in the chat room.');
    const until = +localStorage.getItem('brenai.hangRest') || 0; if (Date.now() < until) return addSys('She wants a little space after last time. Try again in a few minutes.');
    Object.assign(G, { on: true, n: {}, strikes: 0, rubbed: {}, comfort: {}, t0: Date.now() }); try { const s = await (await api('/api/state')).json(); if (s.hang) Object.assign(G, s.hang); } catch {}
    document.body.classList.remove('big'); document.body.classList.add('hang'); $('meBox').classList.remove('fan'); avatar.hang(true); drawPoses(); setMode('stare'); drawHud(); fx('sparkle');
  }
  async function end(kicked) {
    if (!G.on) return; G.on = false; for (const h of Object.values(G.hands)) h.el.remove(); G.hands = {}; aim.style.display = 'none'; document.body.classList.remove('hang'); avatar.hang(false); avatar.heartStage(null); if (kicked) localStorage.setItem('brenai.hangRest', Date.now() + 5 * 60000);
    try { const d = await (await api('/api/hang', { poke: G.n.poke || 0, snack: G.n.snack || 0, pose: G.n.pose || 0, rub: Object.values(G.rubbed), strikes: G.strikes, secs: Math.round((Date.now() - G.t0) / 1000) })).json();
      if (d.said) addSys(d.said); if (d.place !== undefined && typeof setPlace === 'function') setPlace(d); } catch {}
  }
  window.WizraHang = { start, end, get on() { return G.on; } };
})();
