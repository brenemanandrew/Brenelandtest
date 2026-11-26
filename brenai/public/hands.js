// Hand control for the photo studio. Your camera is read on this device by MediaPipe's hand tracker (nothing of the picture is sent
// anywhere). Gestures, with the camera facing you (a webcam, a phone's front camera, or glasses that offer their camera to the browser):
//   pinch (thumb tip to index tip) and move the hand  = grab the view and swing it round her
//   pinch with both hands: pull apart / push together = closer / further; move both together = slide the view
//   let go (open the pinch)                            = release
// Grab mode (WizraHands.mode = 'grab'): no gestures to learn. Each hand puts a ring on the screen; close your hand around a part of
// her (make a fist, as if holding it) and that part follows your hand until you open it. Moving the hand toward the camera or away
// carries the part toward you or away. Each hand grabs on its own, so you can hold both of her hands at once.
// The small picture in the corner shows what the tracker sees: a ring on each hand, filled while it is pinching or closed.
//   WizraHands.start(onMove, grab)  onMove({ orbit:[dx,dy] } | { dolly:n, pan:[dx,dy] })     WizraHands.stop()
//   grab = { down(id, x, y) -> label or '', move(id, x, y, dx, dy, dz), up(id), over(x, y) -> label }  (screen pixels; dz > 0 = toward you)
//   WizraHands.feed(hands)    for tests: hands = [[21 points {x,y,z}], ...] in the picture's 0..1 coordinates
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  // Which camera: the one picked last time (🔄 in the corner picture cycles through them), else the one facing you. A camera facing you is
  // mirrored, like a mirror; one facing away (glasses, the neckband's world camera, a phone's back camera) is not, so your right stays right.
  let MIR = true; const camKey = 'brenai.handCam';
  let tracker = null, stream = null, video = null, box = null, cv = null, raf = 0, lastT = -1, emit = () => {}, G = null, nextId = 1;
  const rings = [];   /* on-screen rings, one a hand, in grab mode */
  const st = { hands: [], two: null, error: '' };   /* hands: per tracked hand { x, y, pinch, sx, sy } ; two: last two-hand spread and middle */
  const SPEED = 900;   /* screen pixels of drag for a hand moving the full width of the picture */

  // pinch with hysteresis, measured against the size of the hand so it works near and far from the camera
  function read(pts, old) {
    const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y), size = d(0, 9) || 1e-3, gap = d(4, 8) / size;
    const pinch = old && old.pinch ? gap < 0.42 : gap < 0.28;
    const x = MIR ? 1 - (pts[4].x + pts[8].x) / 2 : (pts[4].x + pts[8].x) / 2, y = (pts[4].y + pts[8].y) / 2;   /* mirrored: your right is the screen's right */
    // grab mode: where the palm is, and whether the hand is closed (fingertips curled back toward the wrist)
    const curl = [[8, 5], [12, 9], [16, 13], [20, 17]].reduce((a, [t, m]) => a + d(t, 0) / (d(m, 0) || 1e-3), 0) / 4;
    const closed = old && old.closed ? curl < 1.55 : curl < 1.3;
    const pxr = [0, 5, 9, 13, 17].reduce((a, i) => a + pts[i].x, 0) / 5, pyr = [0, 5, 9, 13, 17].reduce((a, i) => a + pts[i].y, 0) / 5;
    const fit = v => Math.max(0, Math.min(1, (v - 0.15) / 0.7));   /* the middle 70% of the picture covers the whole screen */
    return { x, y, pinch, gap, curl, closed, size, px: fit(MIR ? 1 - pxr : pxr), py: fit(pyr) };
  }
  // match this frame's hands to last frame's by nearness, so two hands keep their own state
  function track(list) {
    const now = list.map(p => p), out = [], used = new Set();
    for (const p of now) { const r0 = read(p, null); let best = -1, bd = 0.25; st.hands.forEach((h, i) => { if (used.has(i)) return; const dd = Math.hypot(h.x - r0.x, h.y - r0.y); if (dd < bd) { bd = dd; best = i; } });
      const old = best >= 0 ? st.hands[best] : null; if (best >= 0) used.add(best); const r = read(p, old);
      const k = 0.45; r.sx = old ? old.sx + (r.x - old.sx) * k : r.x; r.sy = old ? old.sy + (r.y - old.sy) * k : r.y;   /* smoothed */
      r.psx = old ? old.sx : r.sx; r.psy = old ? old.sy : r.sy; r.was = !!(old && old.pinch);
      const kp = 0.5; r.qx = old ? old.qx + (r.px - old.qx) * kp : r.px; r.qy = old ? old.qy + (r.py - old.qy) * kp : r.py; r.qs = old ? old.qs + (r.size - old.qs) * 0.35 : r.size;
      r.id = old ? old.id : nextId++; r.held = old ? old.held : ''; r.wasClosed = !!(old && old.closed); r.oqx = old ? old.qx : r.qx; r.oqy = old ? old.qy : r.qy; r.oqs = old ? old.qs : r.qs; out.push(r); }
    // a hand the tracker missed is kept, still, for a few frames (a blink of the tracker must not drop what you hold); then it lets go
    st.hands.forEach((h, i) => { if (used.has(i)) return; if ((h.lost || 0) < 8) out.push({ ...h, lost: (h.lost || 0) + 1, was: h.pinch, wasClosed: h.closed, psx: h.sx, psy: h.sy, oqx: h.qx, oqy: h.qy, oqs: h.qs });
      else if (G && h.held) G.up(h.id); });
    return out;
  }
  function step(list) {
    if (api.mode === 'grab') return grabStep(list);
    const hs = track(list || []); st.hands = hs; const pin = hs.filter(h => h.pinch && h.was);
    if (pin.length >= 2) { const [a, b] = pin, spread = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      if (st.two) emit({ dolly: (st.two.spread - spread) * 2600, pan: [(mx - st.two.mx) * SPEED, (my - st.two.my) * SPEED] });
      st.two = { spread, mx, my }; }
    else { st.two = null; if (pin.length === 1) { const h = pin[0], dx = (h.sx - h.psx) * SPEED, dy = (h.sy - h.psy) * SPEED; if (Math.abs(dx) + Math.abs(dy) > 0.4) emit({ orbit: [dx, dy] }); } }
    drawDots();
  }
  function grabStep(list) {
    const hs = track(list || []); st.hands = hs; const W = innerWidth, H = innerHeight;
    for (const h of hs) { const x = h.qx * W, y = h.qy * H;
      if (h.closed && !h.wasClosed) h.held = (G && G.down(h.id, x, y)) || '';
      else if (h.closed && h.held && G) G.move(h.id, x, y, (h.qx - h.oqx) * W, (h.qy - h.oqy) * H, (h.qs / (h.oqs || h.qs) - 1) * 900);
      else if (!h.closed && h.held) { G && G.up(h.id); h.held = ''; }
      if (!h.closed) h.over = G && G.over ? G.over(x, y) : ''; }
    drawRings(); drawDots();
  }
  function drawRings() { const hs = api.mode === 'grab' && api.on ? st.hands : [];
    while (rings.length < hs.length) { const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.6);z-index:78;pointer-events:none;transition:background .1s,transform .1s;font:600 12px Fredoka,sans-serif;color:#fff;text-shadow:0 1px 3px #000'; const t = document.createElement('span'); t.style.cssText = 'position:absolute;left:50px;top:12px;white-space:nowrap'; r.append(t); document.body.append(r); rings.push(r); }
    rings.forEach((r, i) => { const h = hs[i]; if (!h) { r.style.display = 'none'; return; } r.style.display = 'block'; r.style.left = h.qx * innerWidth + 'px'; r.style.top = h.qy * innerHeight + 'px';
      r.style.background = h.closed ? 'rgba(125,255,176,.55)' : h.over ? 'rgba(255,255,255,.25)' : 'transparent'; r.style.transform = h.closed ? 'scale(.75)' : 'scale(1)'; r.firstChild.textContent = h.held || h.over || ''; }); }
  function drawDots() { if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 16, W, 16); g.fillStyle = '#fff'; g.font = '600 10px Fredoka,sans-serif'; g.fillText(api.mode === 'grab' ? 'Grab: close hand on her' : 'Pinch: swing / 2 hands zoom', 4, H - 5);
    for (const h of st.hands) { g.beginPath(); g.arc(h.sx * W, h.sy * H, 9, 0, 7); g.lineWidth = 3; g.strokeStyle = (api.mode === 'grab' ? h.closed : h.pinch) ? '#7dffb0' : '#fff'; g.stroke(); if (api.mode === 'grab' ? h.closed : h.pinch) { g.fillStyle = 'rgba(125,255,176,.5)'; g.fill(); } } }
  function loop() { raf = requestAnimationFrame(loop); if (!tracker || !video || video.readyState < 2 || video.currentTime === lastT) return; lastT = video.currentTime;
    let res = null; try { res = tracker.detectForVideo(video, performance.now()); } catch { return; } step((res && res.landmarks) || []); }
  function ui() { if (box) return; box = document.createElement('div'); box.id = 'handBox';
    box.style.cssText = 'position:fixed;left:calc(10px + env(safe-area-inset-left));top:calc(48px + env(safe-area-inset-top));width:128px;height:96px;z-index:77;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 3px 12px rgba(0,0,0,.5);pointer-events:none';
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);opacity:.75';
    cv = document.createElement('canvas'); cv.width = 128; cv.height = 96; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; box.append(video, cv);
    const sw = document.createElement('button'); sw.textContent = '🔄'; sw.title = 'Use another camera'; sw.style.cssText = 'position:absolute;right:3px;top:3px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:15px;pointer-events:auto;z-index:2';
    sw.onclick = async e => { e.stopPropagation(); let cams = []; try { cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch {} if (cams.length < 2) { note(cams.length ? 'Only one camera here' : 'No cameras'); return; }
      const cur = stream && stream.getVideoTracks()[0] && stream.getVideoTracks()[0].getSettings().deviceId, i = cams.findIndex(c => c.deviceId === cur), next = cams[(i + 1) % cams.length]; try { localStorage.setItem(camKey, next.deviceId); } catch {} await open(next.deviceId); };
    const lab = document.createElement('div'); lab.style.cssText = 'position:absolute;left:4px;right:36px;top:4px;font:600 9px Fredoka,sans-serif;color:#fff;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; box.append(sw, lab); box.lab = lab;
    for (const ev of ['pointerdown', 'pointerup', 'touchstart']) sw.addEventListener(ev, e => e.stopPropagation());
    document.body.append(box); }
  function note(t) { if (box && box.lab) { box.lab.textContent = t; clearTimeout(note.t); note.t = setTimeout(() => { if (box.lab) box.lab.textContent = ''; }, 3000); } }
  async function open(id) {   /* (re)open the camera: the one asked for, or the one facing you */
    if (stream) for (const t of stream.getTracks()) t.stop(); stream = null;
    const size = { width: { ideal: 640 }, height: { ideal: 480 } };
    stream = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id }, ...size } : { facingMode: 'user', ...size }, audio: false });
    const tr = stream.getVideoTracks()[0], set = tr && tr.getSettings ? tr.getSettings() : {}, label = (tr && tr.label) || '';
    MIR = set.facingMode ? set.facingMode !== 'environment' : !/back|rear|world|environment|outward/i.test(label); video.style.transform = MIR ? 'scaleX(-1)' : 'none';
    video.srcObject = stream; try { await video.play(); } catch {} note(label || 'camera'); }
  const api = {
    on: false, mode: 'pinch', get error() { return st.error; }, get hands() { return st.hands.map(h => ({ x: h.sx, y: h.sy, pinch: h.pinch })); },
    async start(onMove, grab) { emit = onMove || emit; G = grab || G; st.error = ''; if (api.on) return true; ui(); box.style.display = 'block';
      let want = ''; try { want = localStorage.getItem(camKey) || ''; } catch {}
      try { await open(want); } catch (e) { if (want) { try { localStorage.removeItem(camKey); } catch {} try { await open(''); e = null; } catch (e2) { e = e2; } } if (e) { st.error = e && e.name === 'NotAllowedError' ? 'The camera was not allowed.' : 'No camera could be opened.'; box.style.display = 'none'; return false; } }
      api.on = true;
      try { if (!tracker) { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm');
          tracker = await vision.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2 }); } }
      catch (e) { st.error = 'The hand reader could not load (' + (e && e.message ? e.message.slice(0, 60) : 'network') + ').'; api.stop(); return false; }
      if (!api.on) return false; cancelAnimationFrame(raf); loop(); return true; },
    stop() { api.on = false; cancelAnimationFrame(raf); raf = 0; if (stream) for (const t of stream.getTracks()) t.stop(); stream = null; if (video) video.srcObject = null; if (box) box.style.display = 'none'; if (G) for (const h of st.hands) if (h.held) G.up(h.id); st.hands = []; st.two = null; drawRings(); },
    feed(list, onMove, grab) { if (onMove) emit = onMove; if (grab) G = grab; step(list); },
  };
  window.WizraHands = api;
})();
