// Hand control for the photo studio. Your camera is read on this device by MediaPipe's hand tracker (nothing of the picture is sent
// anywhere). Gestures, with the camera facing you (a webcam, a phone's front camera, or glasses that offer their camera to the browser):
//   pinch (thumb tip to index tip) and move the hand  = grab the view and swing it round her
//   pinch with both hands: pull apart / push together = closer / further; move both together = slide the view
//   let go (open the pinch)                            = release
// The small picture in the corner shows what the tracker sees: a ring on each hand, filled while it is pinching.
//   WizraHands.start(onMove)  onMove({ orbit:[dx,dy] } | { dolly:n, pan:[dx,dy] })     WizraHands.stop()
//   WizraHands.feed(hands)    for tests: hands = [[21 points {x,y,z}], ...] in the picture's 0..1 coordinates
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  let tracker = null, stream = null, video = null, box = null, cv = null, raf = 0, lastT = -1, emit = () => {};
  const st = { hands: [], two: null, error: '' };   /* hands: per tracked hand { x, y, pinch, sx, sy } ; two: last two-hand spread and middle */
  const SPEED = 900;   /* screen pixels of drag for a hand moving the full width of the picture */

  // pinch with hysteresis, measured against the size of the hand so it works near and far from the camera
  function read(pts, old) {
    const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y), size = d(0, 9) || 1e-3, gap = d(4, 8) / size;
    const pinch = old && old.pinch ? gap < 0.42 : gap < 0.28;
    const x = 1 - (pts[4].x + pts[8].x) / 2, y = (pts[4].y + pts[8].y) / 2;   /* mirrored: your right is the screen's right */
    return { x, y, pinch, gap };
  }
  // match this frame's hands to last frame's by nearness, so two hands keep their own state
  function track(list) {
    const now = list.map(p => p), out = [], used = new Set();
    for (const p of now) { const r0 = read(p, null); let best = -1, bd = 0.25; st.hands.forEach((h, i) => { if (used.has(i)) return; const dd = Math.hypot(h.x - r0.x, h.y - r0.y); if (dd < bd) { bd = dd; best = i; } });
      const old = best >= 0 ? st.hands[best] : null; if (best >= 0) used.add(best); const r = read(p, old);
      const k = 0.45; r.sx = old ? old.sx + (r.x - old.sx) * k : r.x; r.sy = old ? old.sy + (r.y - old.sy) * k : r.y;   /* smoothed */
      r.psx = old ? old.sx : r.sx; r.psy = old ? old.sy : r.sy; r.was = !!(old && old.pinch); out.push(r); }
    return out;
  }
  function step(list) {
    const hs = track(list || []); st.hands = hs; const pin = hs.filter(h => h.pinch && h.was);
    if (pin.length >= 2) { const [a, b] = pin, spread = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      if (st.two) emit({ dolly: (st.two.spread - spread) * 2600, pan: [(mx - st.two.mx) * SPEED, (my - st.two.my) * SPEED] });
      st.two = { spread, mx, my }; }
    else { st.two = null; if (pin.length === 1) { const h = pin[0], dx = (h.sx - h.psx) * SPEED, dy = (h.sy - h.psy) * SPEED; if (Math.abs(dx) + Math.abs(dy) > 0.4) emit({ orbit: [dx, dy] }); } }
    drawDots();
  }
  function drawDots() { if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    for (const h of st.hands) { g.beginPath(); g.arc(h.sx * W, h.sy * H, 9, 0, 7); g.lineWidth = 3; g.strokeStyle = h.pinch ? '#7dffb0' : '#fff'; g.stroke(); if (h.pinch) { g.fillStyle = 'rgba(125,255,176,.5)'; g.fill(); } } }
  function loop() { raf = requestAnimationFrame(loop); if (!tracker || !video || video.readyState < 2 || video.currentTime === lastT) return; lastT = video.currentTime;
    let res = null; try { res = tracker.detectForVideo(video, performance.now()); } catch { return; } step((res && res.landmarks) || []); }
  function ui() { if (box) return; box = document.createElement('div'); box.id = 'handBox';
    box.style.cssText = 'position:fixed;left:calc(10px + env(safe-area-inset-left));top:calc(48px + env(safe-area-inset-top));width:128px;height:96px;z-index:77;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 3px 12px rgba(0,0,0,.5);pointer-events:none';
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);opacity:.75';
    cv = document.createElement('canvas'); cv.width = 128; cv.height = 96; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; box.append(video, cv); document.body.append(box); }
  const api = {
    on: false, get error() { return st.error; }, get hands() { return st.hands.map(h => ({ x: h.sx, y: h.sy, pinch: h.pinch })); },
    async start(onMove) { emit = onMove || emit; st.error = ''; if (api.on) return true; ui(); box.style.display = 'block';
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
      catch (e) { st.error = e && e.name === 'NotAllowedError' ? 'The camera was not allowed.' : 'No camera could be opened.'; box.style.display = 'none'; return false; }
      video.srcObject = stream; try { await video.play(); } catch {} api.on = true;
      try { if (!tracker) { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm');
          tracker = await vision.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2 }); } }
      catch (e) { st.error = 'The hand reader could not load (' + (e && e.message ? e.message.slice(0, 60) : 'network') + ').'; api.stop(); return false; }
      if (!api.on) return false; cancelAnimationFrame(raf); loop(); return true; },
    stop() { api.on = false; cancelAnimationFrame(raf); raf = 0; if (stream) for (const t of stream.getTracks()) t.stop(); stream = null; if (video) video.srcObject = null; if (box) box.style.display = 'none'; st.hands = []; st.two = null; },
    feed(list, onMove) { if (onMove) emit = onMove; step(list); },
  };
  window.WizraHands = api;
})();
