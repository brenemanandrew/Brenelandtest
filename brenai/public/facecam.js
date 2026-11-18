// Your camera, for her to see you by. Everything here runs on your device: the picture is shown in your own tile and read by a
// face tracker in the page (MediaPipe Face Landmarker, loaded the first time you turn the camera on). No picture is sent
// anywhere. What comes out is a word now and then ("smile", "yawn", "nod"), which the game uses to make her react.
//   WizraCam.start(video, onSignal, onRead)   -> true once the camera is running (asks permission); onSignal(name) on each event,
//                                               onRead({ face, smile, jaw, brow, frown, yaw, pitch }) a few times a second
//   WizraCam.stop()     WizraCam.on     WizraCam.recent()  -> a few words about the last minute, for her ('' if nothing stood out)
// Signals: smile, laugh, surprised, frown, yawn, wink, nod, shake, lookaway, away, back
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14', MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  let tracker = null, stream = null, timer = 0, video = null, emit = () => {}, read = () => {};
  const S = { since: {}, last: {}, seen: [], hist: [], gone: 0, wasGone: false, noFace: 0 };
  const now = () => performance.now();
  // a condition has to hold for `ms` before it counts, and then not again for `gap`
  function held(name, on, ms, gap) { const t = now(); if (!on) { S.since[name] = 0; return false; } if (!S.since[name]) S.since[name] = t; if (t - S.since[name] < ms || t - (S.last[name] || -1e9) < gap) return false; S.last[name] = t; S.since[name] = 0; return true; }
  function fire(name) { S.seen.push({ name, at: Date.now() }); if (S.seen.length > 40) S.seen.shift(); try { emit(name); } catch {} }
  // nodding and shaking: the head swings back and forth a couple of times in a short while
  function swings(key, amp) { const t = now(), win = S.hist.filter(x => t - x.t < 1600).map(x => x[key]); if (win.length < 4) return false; let turns = 0, dir = 0, ref = win[0];
    for (const x of win) { if (dir >= 0 && x < ref - amp) { dir = -1; turns++; ref = x; } else if (dir <= 0 && x > ref + amp) { dir = 1; turns++; ref = x; } else if ((dir > 0 && x > ref) || (dir < 0 && x < ref)) ref = x; } return turns >= 3; }
  function tick() {
    if (!tracker || !video || video.readyState < 2) return; let r; try { r = tracker.detectForVideo(video, now()); } catch { return; }
    const shapes = r.faceBlendshapes && r.faceBlendshapes[0], t = now(); while (S.hist.length && t - S.hist[0].t > 2500) S.hist.shift();
    if (!shapes) { S.noFace++; if (!S.wasGone && held('away', true, 7000, 0)) { S.wasGone = true; S.gone = Date.now(); fire('away'); } read({ face: false }); return; }
    S.noFace = 0; S.since.away = 0; if (S.wasGone) { S.wasGone = false; fire('back'); }
    const b = {}; for (const c of shapes.categories) b[c.categoryName] = c.score;
    const smile = (b.mouthSmileLeft + b.mouthSmileRight) / 2, jaw = b.jawOpen, brow = Math.max(b.browInnerUp, (b.browOuterUpLeft + b.browOuterUpRight) / 2), frown = Math.max((b.browDownLeft + b.browDownRight) / 2, (b.mouthFrownLeft + b.mouthFrownRight) / 2 * 1.6), blinkL = b.eyeBlinkLeft, blinkR = b.eyeBlinkRight, wide = (b.eyeWideLeft + b.eyeWideRight) / 2;
    let yaw = 0, pitch = 0; const m = r.facialTransformationMatrixes && r.facialTransformationMatrixes[0] && r.facialTransformationMatrixes[0].data; if (m) { yaw = Math.atan2(m[8], m[10]) * 57.3; pitch = Math.asin(Math.max(-1, Math.min(1, -m[9]))) * 57.3; }
    read({ face: true, smile, jaw, brow, frown, yaw, pitch });
    if (held('laugh', smile > 0.5 && jaw > 0.3, 350, 9000)) { S.last.smile = t; return fire('laugh'); }
    if (held('yawn', jaw > 0.6 && smile < 0.3, 1300, 20000)) return fire('yawn');
    if (held('surprised', (brow > 0.6 && jaw > 0.2 && smile < 0.4) || (wide > 0.5 && brow > 0.45), 300, 10000)) return fire('surprised');
    if (held('smile', smile > 0.55 && jaw < 0.3, 900, 14000)) return fire('smile');
    if (held('frown', frown > 0.55 && smile < 0.2, 1800, 20000)) return fire('frown');
    if (held('wink', (blinkL > 0.6 && blinkR < 0.25) || (blinkR > 0.6 && blinkL < 0.25), 250, 8000)) return fire('wink');
    S.hist.push({ t, yaw, pitch }); const nod = swings('pitch', 5), shake = swings('yaw', 7);
    if (nod && !shake && held('nod', true, 0, 5000)) { S.hist.length = 0; return fire('nod'); }
    if (shake && held('shake', true, 0, 5000)) { S.hist.length = 0; return fire('shake'); }
    if (held('lookaway', Math.abs(yaw) > 32, 5000, 30000)) return fire('lookaway');
  }
  const WORDS = { smile: 'smiling', laugh: 'laughing', surprised: 'looking surprised', frown: 'frowning', yawn: 'yawning', wink: 'winking at her', nod: 'nodding', shake: 'shaking his head', lookaway: 'looking away from the screen', back: 'back at the screen after being away' };
  const api = {
    on: false, error: '',
    async start(v, onSignal, onRead) {
      video = v; emit = onSignal || emit; read = onRead || read; api.error = '';
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 320 } }, audio: false }); } catch (e) { api.error = e && e.name === 'NotAllowedError' ? 'The camera was not allowed.' : 'No camera could be opened.'; return false; }
      video.srcObject = stream; video.muted = true; video.playsInline = true; try { await video.play(); } catch {}
      api.on = true;
      try { if (!tracker) { const vision = await import(LIB + '/vision_bundle.mjs'), files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm');
          tracker = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true }); }
      } catch (e) { api.error = 'Your picture is on, but the face reader could not load (' + (e && e.message ? e.message.slice(0, 60) : 'network') + ').'; return true; }
      if (!api.on) return false; clearInterval(timer); timer = setInterval(tick, 180); return true;
    },
    stop() { api.on = false; clearInterval(timer); timer = 0; if (stream) for (const t of stream.getTracks()) t.stop(); stream = null; if (video) video.srcObject = null; S.seen.length = 0; S.hist.length = 0; S.wasGone = false; },
    reading: () => !!timer && !!tracker,
    // what she could have noticed in the last minute, most telling first
    recent() { const t = Date.now(), names = [...new Set(S.seen.filter(e => t - e.at < 60000 && WORDS[e.name]).reverse().map(e => e.name))].slice(0, 2); return names.map(n => WORDS[n]).join(' and '); },
  };
  window.WizraCam = api;
})();
