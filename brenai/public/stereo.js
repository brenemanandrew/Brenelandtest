// 3D glasses mode (VITURE and other side-by-side displays). The scene is drawn once per eye (avatar-vrm.js, stereo()); this file
// is the screen around it: the picture goes full screen, the usual interface is put away, and the few things you need are shown
// twice, once in each eye's half, at the same place, so they read as one: her last line as a subtitle, a box to type in, and
// buttons to change mode and leave. Voice works as usual.
// Head tracking (so turning your head looks around her room) comes in through WizraStereo.head(yaw, pitch, roll) in degrees.
// While the mode is on the page also listens for a small helper app on the same device at ws://127.0.0.1:8766 that sends
// {"yaw":..,"pitch":..,"roll":..} lines. The helper is described in VITURE.md; nothing breaks if it is not there.
// On a phone (touch screen) it also locks the screen sideways while the mode is on: the glasses show a copy of the phone's
// screen, and an upright phone sends them a narrow picture that the glasses' side-by-side mode then splits in the wrong place.
// Works in Chrome on Android; iPhones ignore it.
//   WizraStereo.set('half' | 'full' | '')   WizraStereo.cycle()   WizraStereo.head(yaw, pitch, roll)   WizraStereo.mode
(function () {
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.filter(k => k != null)); return e; };
  document.head.append(el('style', { textContent: `
  body.sbs #stageWrap { position:fixed !important; left:0 !important; top:0 !important; transform:none !important; width:100vw !important; height:100dvh !important; z-index:70; }
  body.sbs #stage { border-radius:0 !important; box-shadow:none !important; }
  #sbsUI { position:fixed; inset:0; z-index:71; display:none; pointer-events:none; font-family:"Fredoka",system-ui,sans-serif; } body.sbs #sbsUI { display:flex; }
  #sbsUI .eye { position:relative; flex:1; height:100%; overflow:hidden; }
  #sbsUI .fit { position:absolute; inset:0; transform-origin:50% 50%; } #sbsUI.half .fit { left:-50%; right:-50%; transform:scaleX(.5); }   /* 'half': each eye's picture is stretched to double width by the glasses, so what is drawn here is squeezed first */
  #sbsUI .sub { position:absolute; left:14%; right:14%; bottom:19%; text-align:center; color:#fff; font-size:clamp(15px,3.4vh,30px); line-height:1.3; text-shadow:0 2px 6px #000, 0 0 3px #000; }
  #sbsUI .sub span { background:rgba(0,0,0,.45); border-radius:10px; padding:2px 10px; box-decoration-break:clone; -webkit-box-decoration-break:clone; } #sbsUI .sub:empty { display:none; }
  #sbsUI .row { position:absolute; left:22%; right:22%; bottom:7%; display:flex; gap:8px; pointer-events:auto; }
  #sbsUI input { flex:1; min-width:0; border:1px solid rgba(255,255,255,.45); border-radius:14px; background:rgba(10,6,24,.6); color:#fff; font:16px inherit; padding:8px 12px; }
  #sbsUI button { border:1px solid rgba(255,255,255,.45); border-radius:14px; background:rgba(10,6,24,.6); color:#fff; font:600 14px inherit; padding:8px 12px; cursor:pointer; }
  #sbsUI .top { position:absolute; right:20%; top:8%; display:flex; gap:8px; pointer-events:auto; opacity:.75; }
  ` }));
  const ui = el('div', { id: 'sbsUI' }), eyes = [0, 1].map(() => { const sub = el('div', { className: 'sub' }), inp = el('input', { type: 'text', placeholder: 'Say something…', enterKeyHint: 'send' }), go = el('button', { textContent: '➤' }), mode = el('button', { textContent: '' }), tilt = el('button', { textContent: '⌖', title: 'Look straight ahead from here' }), out = el('button', { textContent: '✕ 3D' });
    const eye = el('div', { className: 'eye' }, el('div', { className: 'fit' }, sub, el('div', { className: 'top' }, tilt, mode, out), el('div', { className: 'row' }, inp, go))); ui.append(eye); return { sub, inp, go, mode, tilt, out }; });
  document.body.append(ui);
  const S = { mode: '', ws: null, wsT: 0, subT: 0, zero: null, last: null };
  const say = text => { clearTimeout(S.subT); const t = String(text || '').replace(/\*[^*]*\*/g, ' ').replace(/[⟦⟧]/g, '').replace(/\s+/g, ' ').trim(); for (const e of eyes) { e.sub.textContent = ''; if (t) e.sub.append(el('span', { textContent: t.slice(0, 260) })); } if (t) S.subT = setTimeout(() => say(''), Math.max(5000, t.length * 85)); };
  const submit = () => { const t = eyes[0].inp.value.trim(); if (!t) return; for (const e of eyes) e.inp.value = ''; say(''); try { send(t); } catch {} };
  for (const [i, e] of eyes.entries()) { const other = eyes[1 - i]; e.inp.oninput = () => { other.inp.value = e.inp.value; }; e.inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') submit(); }; e.inp.onkeyup = ev => ev.stopPropagation(); e.go.onclick = submit; e.mode.onclick = () => set(S.mode === 'half' ? 'full' : 'half'); e.out.onclick = () => set(''); e.tilt.onclick = () => { S.zero = S.last ? { ...S.last } : null; }; }
  for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart']) ui.addEventListener(ev, e => { if (e.target.closest('.row, .top')) e.stopPropagation(); });
  // her lines become subtitles: typeOut is what the page uses to write out anything she says
  const hook = () => { if (typeof window.typeOut !== 'function' || window.typeOut.__sbs) return; const base = window.typeOut, wrapped = function (body, text) { try { if (S.mode && body && body.dataset && body.dataset.who === 'her') say(text); } catch {} return base.apply(this, arguments); }; wrapped.__sbs = true; window.typeOut = wrapped; };
  // head tracking: degrees in, relative to where you were looking when it started (or when you pressed the centre button)
  function head(yaw, pitch, roll) { S.last = { yaw: +yaw || 0, pitch: +pitch || 0, roll: +roll || 0 }; if (!S.zero) S.zero = { ...S.last }; if (!S.mode) return; const r = Math.PI / 180; let dy = S.last.yaw - S.zero.yaw; dy = ((dy + 540) % 360) - 180; try { avatar.head(dy * r, Math.max(-70, Math.min(70, S.last.pitch - S.zero.pitch)) * r, (S.last.roll - S.zero.roll) * r); } catch {} }
  function listen() { clearTimeout(S.wsT); if (!S.mode || S.ws) return; let ws; try { ws = new WebSocket('ws://127.0.0.1:8766'); } catch { return; } S.ws = ws;
    ws.onmessage = m => { try { const d = JSON.parse(m.data); if (d && typeof d.yaw === 'number') head(d.yaw, d.pitch, d.roll); } catch {} }; ws.onclose = ws.onerror = () => { if (S.ws === ws) S.ws = null; if (S.mode) S.wsT = setTimeout(listen, 6000); }; }
  const touch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
  const lockSideways = () => { try { if (touch() && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch {} };
  const unlockSideways = () => { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch {} };
  const goFull = () => { const d = document.documentElement; if (document.fullscreenElement || !d.requestFullscreen) return lockSideways(); try { d.requestFullscreen().then(lockSideways, lockSideways); } catch { lockSideways(); } };
  function set(mode) { mode = mode === 'full' || mode === 'half' ? mode : ''; hook(); let got = ''; try { got = avatar.stereo(mode) || ''; } catch {} if (mode && !got) { try { addSys('3D glasses mode needs her 3D model.'); } catch {} mode = ''; }
    S.mode = api.mode = mode; document.body.classList.toggle('sbs', !!mode); ui.classList.toggle('half', mode === 'half'); for (const e of eyes) e.mode.textContent = mode === 'half' ? 'Half ⇄' : 'Full ⇄'; try { localStorage.setItem('brenai.sbs', mode); } catch {}
    if (mode) { listen(); goFull(); } else { say(''); S.zero = null; try { avatar.head(0, 0, 0); } catch {} if (S.ws) { try { S.ws.close(); } catch {} S.ws = null; } unlockSideways(); try { document.fullscreenElement && document.exitFullscreen(); } catch {} }
    window.dispatchEvent(new Event('resize')); return mode; }
  // Head tracking with nothing installed (experimental, PC Chrome or Edge only: phones do not have WebHID). The glasses are a USB device the
  // browser can be allowed to read. probe() asks for them (USB vendor 0x35ca, VITURE), listens to everything they send and keeps the last
  // reports in WizraStereo.hidLog as hex, so the data format can be worked out with real glasses on the desk. It does not turn the view yet:
  // the format of their motion data is not published and nobody building this had a pair to read.
  async function probe() { if (!navigator.hid) return 'This browser cannot read USB devices (needs Chrome or Edge on a PC).'; let devs = []; try { devs = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x35ca }] }); } catch (e) { return 'Not allowed: ' + e.message; } if (!devs.length) return 'No VITURE glasses were picked.';
    api.hidLog = []; let n = 0; for (const dv of devs) { try { if (!dv.opened) await dv.open(); n++; dv.addEventListener('inputreport', ev => { const b = new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength); api.hidLog.push({ t: Math.round(performance.now()), dev: dv.productName, id: ev.reportId, hex: [...b].map(x => x.toString(16).padStart(2, '0')).join(' ') }); if (api.hidLog.length > 400) api.hidLog.shift(); }); } catch {} }
    return `Listening to ${n} of ${devs.length} interface(s): ${devs.map(d => d.productName).join(', ')}. Move your head, then read WizraStereo.hidLog in the console.`; }
  const api = window.WizraStereo = { probe, hidLog: [], set, cycle: () => set(S.mode === '' ? 'half' : S.mode === 'half' ? 'full' : ''), head, mode: '' };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.mode) set(''); });
})();
