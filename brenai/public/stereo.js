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
  const ui = el('div', { id: 'sbsUI' }), eyes = [0, 1].map(() => { const sub = el('div', { className: 'sub' }), inp = el('input', { type: 'text', placeholder: 'Say something…', enterKeyHint: 'send' }), go = el('button', { textContent: '➤' }), mode = el('button', { textContent: '' }), tilt = el('button', { textContent: '⌖', title: 'Look straight ahead from here' }), trk = el('button', { textContent: '🧭', title: 'Head tracking: connect the glasses' }), fy = el('button', { textContent: '↔', title: 'Left and right are the wrong way round' }), fp = el('button', { textContent: '↕', title: 'Up and down are the wrong way round' }), fr = el('button', { textContent: '⟳', title: 'Tilt is the wrong way round' }), out = el('button', { textContent: '✕ 3D' });
    const eye = el('div', { className: 'eye' }, el('div', { className: 'fit' }, sub, el('div', { className: 'top' }, fy, fp, fr, trk, tilt, mode, out), el('div', { className: 'row' }, inp, go))); ui.append(eye); trk.style.display = navigator.hid ? '' : 'none'; for (const b of [fy, fp, fr]) b.style.display = 'none'; return { sub, inp, go, mode, tilt, out, trk, fy, fp, fr }; });
  document.body.append(ui);
  const S = { mode: '', ws: null, wsT: 0, subT: 0, zero: null, last: null, hid: [], hidN: 0 };
  const F = (() => { const d = { yaw: 1, pitch: 1, roll: 1 }; try { Object.assign(d, JSON.parse(localStorage.getItem('brenai.sbsFlip') || '{}')); } catch {} return d; })();   /* which way each turn goes; the three arrow buttons flip them */
  const flip = k => { F[k] = F[k] < 0 ? 1 : -1; try { localStorage.setItem('brenai.sbsFlip', JSON.stringify(F)); } catch {} };
  const say = text => { clearTimeout(S.subT); const t = String(text || '').replace(/\*[^*]*\*/g, ' ').replace(/[⟦⟧]/g, '').replace(/\s+/g, ' ').trim(); for (const e of eyes) { e.sub.textContent = ''; if (t) e.sub.append(el('span', { textContent: t.slice(0, 260) })); } if (t) S.subT = setTimeout(() => say(''), Math.max(5000, t.length * 85)); };
  const submit = () => { const t = eyes[0].inp.value.trim(); if (!t) return; for (const e of eyes) e.inp.value = ''; say(''); try { send(t); } catch {} };
  for (const [i, e] of eyes.entries()) { const other = eyes[1 - i]; e.inp.oninput = () => { other.inp.value = e.inp.value; }; e.inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') submit(); }; e.inp.onkeyup = ev => ev.stopPropagation(); e.go.onclick = submit; e.mode.onclick = () => set(S.mode === 'half' ? 'full' : 'half'); e.out.onclick = () => set(''); e.tilt.onclick = () => { S.zero = S.last ? { ...S.last } : null; }; e.trk.onclick = () => { track(true).then(m => say(m)); }; e.fy.onclick = () => flip('yaw'); e.fp.onclick = () => flip('pitch'); e.fr.onclick = () => flip('roll'); }
  for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart']) ui.addEventListener(ev, e => { if (e.target.closest('.row, .top')) e.stopPropagation(); });
  // her lines become subtitles: typeOut is what the page uses to write out anything she says
  const hook = () => { if (typeof window.typeOut !== 'function' || window.typeOut.__sbs) return; const base = window.typeOut, wrapped = function (body, text) { try { if (S.mode && body && body.dataset && body.dataset.who === 'her') say(text); } catch {} return base.apply(this, arguments); }; wrapped.__sbs = true; window.typeOut = wrapped; };
  // head tracking: degrees in, relative to where you were looking when it started (or when you pressed the centre button)
  function head(yaw, pitch, roll) { S.last = { yaw: +yaw || 0, pitch: +pitch || 0, roll: +roll || 0 }; if (!S.zero) S.zero = { ...S.last }; if (!S.mode) return; const r = Math.PI / 180; let dy = S.last.yaw - S.zero.yaw; dy = ((dy + 540) % 360) - 180; try { avatar.head(F.yaw * dy * r, F.pitch * Math.max(-70, Math.min(70, S.last.pitch - S.zero.pitch)) * r, F.roll * (S.last.roll - S.zero.roll) * r); } catch {} }
  function listen() { clearTimeout(S.wsT); if (!S.mode || S.ws) return; let ws; try { ws = new WebSocket('ws://127.0.0.1:8766'); } catch { return; } S.ws = ws;
    ws.onmessage = m => { try { const d = JSON.parse(m.data); if (d && typeof d.yaw === 'number') head(d.yaw, d.pitch, d.roll); } catch {} }; ws.onclose = ws.onerror = () => { if (S.ws === ws) S.ws = null; if (S.mode) S.wsT = setTimeout(listen, 6000); }; }
  const touch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
  const lockSideways = () => { try { if (touch() && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch {} };
  const unlockSideways = () => { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch {} };
  const goFull = () => { const d = document.documentElement; if (document.fullscreenElement || !d.requestFullscreen) return lockSideways(); try { d.requestFullscreen().then(lockSideways, lockSideways); } catch { lockSideways(); } };
  function set(mode) { mode = mode === 'full' || mode === 'half' ? mode : ''; hook(); let got = ''; try { got = avatar.stereo(mode) || ''; } catch {} if (mode && !got) { try { addSys('3D glasses mode needs her 3D model.'); } catch {} mode = ''; }
    S.mode = api.mode = mode; document.body.classList.toggle('sbs', !!mode); ui.classList.toggle('half', mode === 'half'); for (const e of eyes) e.mode.textContent = mode === 'half' ? 'Half ⇄' : 'Full ⇄'; try { localStorage.setItem('brenai.sbs', mode); } catch {}
    if (mode) { listen(); goFull(); track(false); } else { say(''); S.zero = null; try { avatar.head(0, 0, 0); } catch {} if (S.ws) { try { S.ws.close(); } catch {} S.ws = null; } unlockSideways(); try { document.fullscreenElement && document.exitFullscreen(); } catch {} }
    window.dispatchEvent(new Event('resize')); return mode; }
  // Head tracking with nothing installed (PC Chrome or Edge only: phone browsers do not have WebHID). The glasses are a USB device the
  // browser can be allowed to read. track() asks for them once (USB vendor 0x35ca, VITURE; the browser remembers the answer), switches
  // their motion sensor on and feeds the angles to head(). The data format is the one the open source project
  // mgschwan/viture_virtual_display worked out for the VITURE Pro: 64-byte packets, commands start ff fe, motion data starts ff fc,
  // a CRC-16 (polynomial 0x1021, start 0) over byte 4 onward sits in bytes 2-3, the command number in bytes 14-15, the payload from
  // byte 18. Command 0x15 with one byte 1 turns the sensor on. A motion payload is three big-endian floats in degrees: roll, pitch, yaw.
  // Written from that source without a pair of glasses to try it on. probe() below still records raw packets if it needs working out.
  const crcT = Array.from({ length: 256 }, (_, i) => { let c = i << 8; for (let j = 0; j < 8; j++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xffff; return c; });
  const imuCmd = on => { const b = new Uint8Array(64), len = 0x0d; b[0] = 0xff; b[1] = 0xfe; b[4] = len; b[0x0e] = 0x15; b[0x12] = on ? 1 : 0; let c = 0; for (let i = 4; i < 4 + len + 2; i++) c = (crcT[(b[i] ^ (c >> 8)) & 255] ^ (c << 8)) & 0xffff; b[2] = c & 255; b[3] = c >> 8; return b; };
  function hidIn(ev) { const d = ev.data, n = d.byteLength, b = new Uint8Array(n + 1); b[0] = ev.reportId; b.set(new Uint8Array(d.buffer, d.byteOffset, n), 1); const o = ev.reportId ? 0 : 1;   /* browsers strip a report number off the front; put it back when there was one */
    if (b[o] !== 0xff || b[o + 1] !== 0xfc || b.length < o + 0x12 + 12) return; const v = new DataView(b.buffer, o + 0x12, 12), roll = v.getFloat32(0), pitch = v.getFloat32(4), yaw = -v.getFloat32(8);
    if (![roll, pitch, yaw].every(x => Number.isFinite(x) && Math.abs(x) <= 720)) return; if (!S.hidN++) for (const e of eyes) for (const k of [e.fy, e.fp, e.fr]) k.style.display = ''; S.hidAt = Date.now(); head(yaw, pitch, roll); }
  async function track(ask) { if (!navigator.hid) return 'Head tracking in the browser needs Chrome or Edge on a PC.'; let devs = []; try { devs = (await navigator.hid.getDevices()).filter(d => d.vendorId === 0x35ca); if (!devs.length && ask) devs = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x35ca }] }); } catch (e) { return 'Not allowed: ' + e.message; }
    if (!devs.length) return ask ? 'No VITURE glasses were picked.' : ''; const cmd = imuCmd(true); let sent = 0;
    for (const dv of devs) { try { if (!dv.opened) await dv.open(); if (!S.hid.includes(dv)) { S.hid.push(dv); dv.addEventListener('inputreport', hidIn); } } catch { continue; }
      try { await dv.sendReport(0, cmd); sent++; } catch { try { await dv.sendReport(cmd[0], cmd.subarray(1)); sent++; } catch {} } }
    await new Promise(r => setTimeout(r, 1500)); api.hidState = { devices: devs.length, sent, reports: S.hidN };
    return Date.now() - (S.hidAt || 0) < 2500 ? 'Head tracking is on. ⌖ sets straight ahead; the arrows flip a direction that goes the wrong way.' : `The glasses were found (${devs.length} part(s), switch-on sent to ${sent}) but no head movement is arriving.`; }
  async function probe() { if (!navigator.hid) return 'This browser cannot read USB devices (needs Chrome or Edge on a PC).'; let devs = []; try { devs = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x35ca }] }); } catch (e) { return 'Not allowed: ' + e.message; } if (!devs.length) return 'No VITURE glasses were picked.';
    api.hidLog = []; let n = 0; for (const dv of devs) { try { if (!dv.opened) await dv.open(); n++; dv.addEventListener('inputreport', ev => { const b = new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength); api.hidLog.push({ t: Math.round(performance.now()), dev: dv.productName, id: ev.reportId, hex: [...b].map(x => x.toString(16).padStart(2, '0')).join(' ') }); if (api.hidLog.length > 400) api.hidLog.shift(); }); } catch {} }
    return `Listening to ${n} of ${devs.length} interface(s): ${devs.map(d => d.productName).join(', ')}. Move your head, then read WizraStereo.hidLog in the console.`; }
  const api = window.WizraStereo = { probe, track, hidState: null, hidLog: [], set, cycle: () => set(S.mode === '' ? 'half' : S.mode === 'half' ? 'full' : ''), head, mode: '' };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.mode) set(''); });
})();
