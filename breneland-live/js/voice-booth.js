// Andrew's voice booth (the page public/voice-booth.html, the server lib/voice-booth.js).
// He reads the script a line at a time; each take is captured as raw PCM by an AudioWorklet (voice-booth-worklet.js) with the
// browser's echo cancellation, noise suppression and auto gain off, resampled to 24 kHz 16-bit mono (voice-booth-dsp.js),
// checked (too quiet, clipped, noisy, cut short; the quiet at the ends trimmed), played back, and on Keep sent to the server.
// Owner only: the server checks the session token (localStorage breneland.account) on every request.
// Test hook: window.__booth (state, take, uploads, errors).
import { RATE, resample, analyse, trimTake, wavBytes, countClipped, parseWav } from './voice-booth-dsp.js';

const $ = s => document.querySelector(s);
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem('breneland.' + k) || 'null'); return v === null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem('breneland.' + k, JSON.stringify(v)); } catch { /* private mode */ } };
const token = () => { const a = read('account', null); return a && typeof a.token === 'string' ? a.token : ''; };
const COLORS = { plain: '#8fd0ee', narration: '#c8b3e6', table: '#ffcf6b', dwarf: '#e0ad7a', goblin: '#a6dc8a', innkeeper: '#ffb6a8',
  villain: '#b9a7d6', question: '#9fe0d0', exclaim: '#ffb26b', whisper: '#d4dbe8', numbers: '#f5dc72', names: '#f58ab0' };
const TEST_LINE = { id: 'test', style: 'plain', text: $('#test-line').textContent };
const TIPS = [
  ['A quiet room.', 'Soft things around you (curtains, a couch, a closet of clothes) soak up the echo.'],
  ['The same mic every session,', 'at the same level. The booth tells you which one it is using.'],
  ['A pop filter, or a sock over the mic,', 'stops the puffs on P and B.'],
  ['Mouth about a hand-width from the mic,', 'a little off to one side.'],
  ['A natural pace.', 'Pauses are fine: the booth trims the quiet at the ends.'],
  ['Drink water,', 'and stop when your voice gets tired. 10 minutes is a good session.'],
];

// ---------------------------------------------------------------- state
const S = {
  data: null,             // the server's /state answer
  view: 'gate',           // gate | setup | booth | progress
  batch: 1, idx: 0,       // where in the script
  rec: 'idle',            // idle | starting | recording | processing | review | saving
  take: null,             // { prompt, x (24 kHz samples), wav, a (analyse), rate }
  uploads: 0, errors: [],
  session: { t0: 0, kept: 0, secs: 0 },
};
const prefs = Object.assign({ setup: false, deviceId: '', pause: 0.8, play: true }, read('voiceBooth', {}));
const savePrefs = () => write('voiceBooth', prefs);
window.__booth = {
  S, prefs,
  get state() { return { view: S.view, rec: S.rec, batch: S.batch, idx: S.idx, prompt: current()?.id, mic: mic.label, lvl: mic.live ? mic.shown : -120, rate: ctx ? ctx.sampleRate : 0 }; },
  settings: () => { const t = stream && stream.getAudioTracks()[0]; return t && t.getSettings ? t.getSettings() : null; },   // (the test: no processing)
};

function api(path, opts = {}) {
  return fetch('/api/voice-booth/' + path, { cache: 'no-store', ...opts, headers: { 'x-breneland-token': token(), ...(opts.headers || {}) } });
}
let toastT = 0;
function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------- the script
const script = () => S.data.script;
const batchIds = b => script().filter(p => p.batch === b);
const current = () => (S.data ? batchIds(S.batch)[S.idx] : null);
const kept = id => !!S.data.takes[id];
const batchCount = () => S.data.batches.length;
// (voice-set2) the sets: set 1's batches read as before ("Batch 5 of 30"), set 2's within their own set ("Set 2, batch 3 of 10")
const setOf = b => (S.data.sets || []).find(x => x.batches.includes(b)) || { n: 1, batches: S.data.batches.map(x => x.n) };
const batchIn = b => { const x = setOf(b); return { set: x.n, k: x.batches.indexOf(b) + 1, of: x.batches.length }; };
const batchName = b => { const w = batchIn(b); return w.set === 1 ? `Batch ${w.k} of ${w.of}` : `Set ${w.set}, batch ${w.k} of ${w.of}`; };
const batchLabel = b => { const x = S.data.batches[b - 1]; return x.label || S.data.styles[x.style].label; };
const wordsOf = p => (p.say || p.text).split(/\s+/).filter(Boolean).length;
function firstOpen(b) { const i = batchIds(b).findIndex(p => !kept(p.id)); return i; }
function resumeSpot() {
  const c = S.data.cursor && S.data.cursor.batch;
  if (c && firstOpen(c) >= 0) return [c, firstOpen(c)];
  for (let b = 1; b <= batchCount(); b++) if (firstOpen(b) >= 0) return [b, firstOpen(b)];
  return [batchCount(), 0];
}

// ---------------------------------------------------------------- the gate
async function boot() {
  for (const el of document.querySelectorAll('[data-tips]')) {
    const h = document.createElement('h3'); h.textContent = 'Tips for good takes';
    const ul = document.createElement('ul');
    for (const [b, t] of TIPS) { const li = document.createElement('li'); const s = document.createElement('b'); s.textContent = b; li.append(s, ' ' + t); ul.append(li); }
    el.append(h, ul);
  }
  if (!token()) return refuse("This is Andrew's booth.", 'Sign in to Breneland first (with the name and PIN), then come back.');
  let r;
  try { r = await api('state'); } catch { return refuse("Can't reach Breneland.", 'Check the connection and reload the page.'); }
  if (r.status === 401) return refuse("This is Andrew's booth.", 'Sign in to Breneland first (with the name and PIN), then come back.');
  if (r.status === 403) return refuse("This is Andrew's booth.", 'It records the voice for the D&D table. Back to Breneland for the fun stuff!');
  if (!r.ok) return refuse('The booth is closed for a moment.', 'Reload the page in a little while.');
  S.data = await r.json();
  [S.batch, S.idx] = resumeSpot();
  $('#gate').hidden = true;
  $('#tabs').hidden = false;
  $('#deck').hidden = false;
  $('#opt-pause').value = String(prefs.pause);
  $('#opt-play').checked = !!prefs.play;
  show(prefs.setup ? 'booth' : 'setup');
  renderAll();
}
function refuse(msg, sub) {
  $('#gate-msg').textContent = msg; $('#gate-sub').textContent = sub;
  S.view = 'refused';
}

// ---------------------------------------------------------------- views
function show(view) {
  if (S.rec === 'recording') stopRec('view');
  S.view = view;
  $('#setup').hidden = view !== 'setup';
  $('#booth').hidden = view !== 'booth';
  $('#progress').hidden = view !== 'progress';
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-pressed', String(b.dataset.tab === (view === 'setup' ? 'booth' : view)));
  const slot = view === 'setup' ? $('#setup-slot') : view === 'booth' ? $('#booth-slot') : null;
  if (slot) slot.append($('#deck'));
  $('#deck').hidden = !slot;
  if (S.rec === 'review') discard();
  renderAll();
  if (view === 'progress') renderProgress();
}
function renderAll() {
  if (!S.data) return;
  const inSetup = S.view === 'setup';
  const t = S.data.totals;
  $('#warn').hidden = !S.data.warn;
  if (S.data.warn) $('#warn').textContent = `The booth holds ${(t.bytes / 1048576).toFixed(0)} MB of ${(S.data.caps.totalBytes / 1048576).toFixed(0)} MB. Time to pull the takes to the PC.`;
  $('#prev').hidden = $('#next').hidden = inSetup;
  $('#keys').textContent = inSetup ? 'Space: record or stop. P: play.' : 'Space: record or stop. Enter: keep. R: redo. P: play. Arrows: move.';
  $('#keep').textContent = inSetup ? 'Sounds good' : 'Keep';
  $('#redo').textContent = inSetup ? 'Try again' : 'Redo';
  if (!inSetup) renderPrompt();
  renderDeck();
  renderMicLine();
}
function renderPrompt() {
  const ids = batchIds(S.batch), p = current();
  const style = S.data.styles[p.style];
  const allKept = ids.every(q => kept(q.id));
  $('#w-batch').textContent = batchName(S.batch);
  $('#w-style').textContent = style.label; $('#w-style').style.setProperty('--c', COLORS[p.style]);
  $('#w-line').textContent = `Line ${S.idx + 1} of ${ids.length}`;
  const dots = $('#dots');
  if (dots.children.length !== ids.length) {
    dots.textContent = '';
    ids.forEach((q, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = String(i + 1); b.addEventListener('click', () => go(S.batch, i)); dots.append(b); });
  }
  ids.forEach((q, i) => {
    const b = dots.children[i];
    b.classList.toggle('kept', kept(q.id)); b.classList.toggle('here', i === S.idx);
    b.setAttribute('aria-label', `Line ${i + 1}${kept(q.id) ? ', kept' : ''}`);
  });
  $('#prompt').style.setProperty('--c', COLORS[p.style]);
  $('#p-tag').textContent = p.label || style.label; $('#p-tag').style.setProperty('--c', COLORS[p.style]);   // (set 2: the style and the kind, "Gruff dwarf, speaking to someone by name")
  $('#p-text').textContent = p.text;
  $('#p-say').hidden = !p.say;
  if (p.say) { $('#p-say').textContent = 'Say: '; const b = document.createElement('b'); b.textContent = p.say; $('#p-say').append(b); }
  $('#p-hint').textContent = p.hint || style.hint;
  $('#p-kept').hidden = !kept(p.id);
  $('#opt-delete').hidden = !kept(p.id);
  // a finished batch: a little celebration over the deck until he picks a line again
  const showDone = allKept && S.doneShown === S.batch;
  $('#done').hidden = !showDone;
  $('#prompt').hidden = showDone;
  if (showDone) {
    const next = nextOpenBatch();
    const w = batchIn(S.batch), sk = S.data.totals.sets && S.data.totals.sets[w.set];
    $('#done-msg').textContent = `${w.set === 1 ? 'Batch ' + w.k : 'Set ' + w.set + ', batch ' + w.k} done! Nice work.`;
    $('#done-sub').textContent = next ? `${sk ? sk.kept : S.data.totals.kept} of ${sk ? sk.of : S.data.totals.of} lines kept${sk ? ' in set ' + w.set : ''}. Next: ${batchName(next).replace(/ of \d+$/, '')}, ${batchLabel(next).toLowerCase()}.` : 'That is the whole script. Amazing!';
    $('#done-next').hidden = !next;
  }
}
function nextOpenBatch() {
  for (let k = 1; k <= batchCount(); k++) { const b = (S.batch - 1 + k) % batchCount() + 1; if (firstOpen(b) >= 0) return b; }
  return 0;
}
function renderDeck() {
  const r = S.rec, rec = $('#rec');
  rec.classList.toggle('on', r === 'recording');
  $('#deck').classList.toggle('reviewing', r === 'review' || r === 'saving');
  $('#rec-word').textContent = r === 'recording' ? 'Stop' : r === 'review' ? 'Again' : r === 'starting' ? 'Wait' : 'Record';
  rec.setAttribute('aria-label', r === 'recording' ? 'Stop recording' : r === 'review' ? 'Record again' : 'Record');
  rec.disabled = r === 'processing' || r === 'saving' || r === 'starting' || (S.view === 'booth' && !$('#done').hidden);
  $('#review').hidden = !(r === 'review' || r === 'saving');
  $('#keep').disabled = r === 'saving';
  $('#prev').disabled = $('#next').disabled = r === 'recording' || r === 'processing' || r === 'saving';
}
function renderMicLine() {
  const el = $('#mic-line'), last = S.data && S.data.mic;
  el.classList.remove('diff');
  if (!mic.label) { el.textContent = last ? `The mic turns on when you press Record. Last time: ${last}.` : 'The mic turns on when you press Record.'; return; }
  if (last && last !== mic.label) { el.classList.add('diff'); el.textContent = `Using ${mic.label}. Last time it was ${last}: the same mic every session sounds best.`; }
  else el.textContent = last ? `Using ${mic.label}, the same mic as last time. Good.` : `Using ${mic.label}. Use this one every session.`;
}
function setStatus(text) { $('#status').textContent = text; }

// ---------------------------------------------------------------- moving around
function go(batch, idx, quiet) {
  if (S.rec === 'recording') return;
  if (S.rec === 'review') discard();
  const changed = batch !== S.batch;
  S.batch = batch; S.idx = Math.max(0, Math.min(idx, batchIds(batch).length - 1));
  S.doneShown = 0;
  if (changed && !quiet) api('cursor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ batch, mic: mic.label || '' }) }).catch(() => {});
  setStatus(kept(current().id) ? 'Kept already. Record again to replace it, or tap the arrows.' : 'Press Record (or Space) and read the line.');
  renderAll();
}
function step(d) {
  const n = batchIds(S.batch).length;
  let b = S.batch, i = S.idx + d;
  if (i < 0) { b = b > 1 ? b - 1 : batchCount(); i = batchIds(b).length - 1; }
  else if (i >= n) { b = b < batchCount() ? b + 1 : 1; i = 0; }
  go(b, i);
}

// ---------------------------------------------------------------- the mic
let ctx = null, node = null, src = null, stream = null, sink = null;
const mic = { label: '', live: false, peak: -100, rms: -100, hold: -100, holdT: 0, shown: -100 };
async function micOn() {
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  // (headset mode: Android only hands a headset's mic to a page in its call mode, and Chrome asks for that when echo cancelling is on)
  const audio = { echoCancellation: !!prefs.headset, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } };
  if (prefs.deviceId) audio.deviceId = { exact: prefs.deviceId };
  try { stream = await navigator.mediaDevices.getUserMedia({ audio }); }
  catch (e) {
    if (prefs.deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) { prefs.deviceId = ''; savePrefs(); return micOn(); }
    mic.live = false;
    const why = e.name === 'NotAllowedError' ? 'The browser said no to the mic. Allow the microphone for this site (the icon by the address), then try again.'
      : e.name === 'NotFoundError' ? 'No mic found. Plug one in and try again.' : 'The mic would not start: ' + (e.message || e.name);
    setStatus(why); toast(why, 5000);
    throw e;
  }
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule('/js/voice-booth-worklet.js');
    node = new AudioWorkletNode(ctx, 'booth-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.onmessage = onWorklet;
    sink = ctx.createGain(); sink.gain.value = 0;        // keeps the worklet pulled; nothing is heard
    node.connect(sink).connect(ctx.destination);
  }
  if (ctx.state !== 'running') await ctx.resume();
  if (src) src.disconnect();
  src = ctx.createMediaStreamSource(stream);
  src.connect(node);
  const track = stream.getAudioTracks()[0];
  mic.label = (track && track.label) || 'your mic';
  mic.live = true;
  track.addEventListener('ended', () => { mic.live = false; mic.label = ''; setStatus('The mic went away. Press Record to turn it on again.'); renderMicLine(); });
  renderMicLine();
  $('#mic-on').textContent = 'Mic is on';
  $('#mic-on').disabled = true;
  if (!meterOn) { meterOn = true; requestAnimationFrame(drawMeter); }
  listDevices(track).catch(() => {});   // (can take a second: the meter does not wait for it)
  watchSilence(stream);
}
// A mic sending pure silence (every sample zero) for 3 s is a headset the phone hasn't opened: try headset mode once, then say what to check
function watchSilence(s) {
  mic.loudest = -120;
  setTimeout(() => {
    if (stream !== s || !mic.live || mic.loudest > -100) return;
    if (!prefs.headset) {
      prefs.headset = true; savePrefs(); $('#mic-headset').checked = true;
      toast('Your mic is sending silence. Trying headset mode (the phone opens a headset mic only in call mode).', 5000);
      micOn().catch(() => {});
    } else {
      const why = 'Still silence from the mic. For a Bluetooth headset, turn on "Calls" (or "Phone audio") for it in your phone\'s Bluetooth settings; or unplug it and use the phone\'s mic.';
      setStatus(why); toast(why, 7000);
    }
  }, 3000);
}
async function listDevices(track) {
  const sel = $('#mic-pick');
  let devs = [];
  try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch { /* none */ }
  const id = track && track.getSettings ? track.getSettings().deviceId : '';
  sel.textContent = '';
  for (const d of devs) {
    const o = document.createElement('option');
    o.value = d.deviceId; o.textContent = d.label || 'Microphone';
    if (d.deviceId === id || (!id && d.deviceId === prefs.deviceId)) o.selected = true;
    sel.append(o);
  }
  if (!devs.length) { const o = document.createElement('option'); o.value = ''; o.textContent = mic.label || 'The default mic'; sel.append(o); }
}
const ensureMic = async () => { if (!mic.live || !ctx) await micOn(); else if (ctx.state !== 'running') await ctx.resume(); };

// ---------------------------------------------------------------- the meter
const dB = v => (v > 1e-6 ? 20 * Math.log10(v) : -120);
const LOW = -60;
let meterOn = false;
function drawMeter() {
  if (!mic.live) { meterOn = false; $('#lvl').textContent = 'Mic off'; return; }
  const c = $('#meter'), dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  if (w && h) {
    const x = d => Math.max(0, Math.min(1, (d - LOW) / -LOW)) * w;
    g.clearRect(0, 0, w, h);
    // the zones: too quiet, good, loud, too loud
    g.globalAlpha = 0.22;
    g.fillStyle = '#7bd389'; g.fillRect(x(-30), 0, x(-9) - x(-30), h);
    g.fillStyle = '#ffcf6b'; g.fillRect(x(-9), 0, x(-3) - x(-9), h);
    g.fillStyle = '#ff6f61'; g.fillRect(x(-3), 0, w - x(-3), h);
    g.globalAlpha = 1;
    const lv = mic.shown;
    g.fillStyle = lv > -3 ? '#ff6f61' : lv > -9 ? '#ffb347' : lv > -30 ? '#5cbf6c' : '#9aa0b0';
    g.fillRect(0, h * 0.18, x(lv), h * 0.64);
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#2b2433';
    g.fillRect(Math.max(0, x(mic.hold) - 2 * dpr), 0, 3 * dpr, h);
  }
  const lv = mic.shown;
  $('#lvl').textContent = lv < -50 ? 'Quiet' : lv < -30 ? 'Too low' : lv < -9 ? 'Good' : lv < -3 ? 'Loud' : 'Too loud!';
  requestAnimationFrame(drawMeter);
}

// ---------------------------------------------------------------- recording
let chunks = [], recFrames = 0, heard = 0, quietFor = 0, floorDb = -60, smooth = -100, prompt = null, stopWhy = '';
function onWorklet(e) {
  const m = e.data;
  if (m.lvl) {
    const pk = dB(m.lvl[0]), rms = dB(m.lvl[1]), dt = m.frames / ctx.sampleRate;
    if (pk > mic.loudest) mic.loudest = pk;
    mic.shown = Math.max(pk, mic.shown - 40 * dt);           // fast up, about 40 dB a second down
    if (pk >= mic.hold || performance.now() - mic.holdT > 1200) { mic.hold = pk; mic.holdT = performance.now(); }
    if (S.rec === 'recording') listen(rms, dt);
  } else if (m.pcm) { chunks.push(m.pcm); }
  else if (m.done) finish();
}
// auto-stop: after some speech, a pause of prefs.pause seconds ends the take; nothing heard for 10 s ends it too; never past 28 s
function listen(rms, dt) {
  recFrames += dt;
  smooth = smooth < -99 ? rms : smooth + (rms - smooth) * Math.min(1, dt / 0.15);
  floorDb = Math.min(floorDb, smooth);
  const thr = Math.max(-50, floorDb + 12);
  if (rms > thr) { heard += dt; quietFor = 0; } else quietFor += dt;
  const secs = recFrames;
  $('#status').textContent = heard > 0.25 ? `Recording ${secs.toFixed(1)} s. ${prefs.pause ? 'It stops when you pause.' : 'Tap Stop when you are done.'}` : `Listening... read the line. ${secs.toFixed(0)} s`;
  if (prefs.pause && heard >= 0.25 && quietFor >= prefs.pause) stopRec('pause');
  else if (heard < 0.25 && secs >= 10) stopRec('nothing');
  else if (secs >= 28) stopRec('long');
}
async function startRec() {
  if (S.rec === 'recording' || S.rec === 'processing' || S.rec === 'starting') return;
  if (S.rec === 'review' || S.rec === 'saving') discard();
  S.rec = 'starting'; renderDeck();
  try { await ensureMic(); } catch { S.rec = 'idle'; renderDeck(); return; }
  prompt = S.view === 'setup' ? TEST_LINE : current();
  chunks = []; recFrames = 0; heard = 0; quietFor = 0; smooth = -100;
  floorDb = S.lastNoise != null ? S.lastNoise + 3 : 0;   // the room's floor: the quietest moment so far (the last take's noise to start)
  if (!S.session.t0) S.session.t0 = Date.now();
  node.port.postMessage('start');
  S.rec = 'recording';
  setStatus('Listening... read the line.');
  renderDeck();
}
function stopRec(why) {
  if (S.rec !== 'recording') return;
  stopWhy = why;
  S.rec = 'processing'; renderDeck();
  setStatus('Checking the take...');
  node.port.postMessage('stop');
}
function finish() {
  let n = 0; for (const c of chunks) n += c.length;
  const raw = new Float32Array(n); let o = 0; for (const c of chunks) { raw.set(c, o); o += c.length; }
  chunks = [];
  if (S.view === 'gate' || !prompt || stopWhy === 'view') { S.rec = 'idle'; renderDeck(); return; }   // (left the page mid-take: dropped)
  const clipped = countClipped(raw);
  const x = resample(raw, ctx.sampleRate, RATE);
  const a = analyse(x, RATE, { words: wordsOf(prompt), clipped });
  const y = a.silent ? x : trimTake(x, a);
  if (!a.silent) S.lastNoise = a.noise;
  S.take = { prompt, x: y, wav: wavBytes(y), a, rate: ctx.sampleRate, why: stopWhy, rawSecs: raw.length / ctx.sampleRate };
  S.rec = 'review';
  renderDeck();
  drawWave(0);
  const ul = $('#checks'); ul.textContent = '';
  for (const c of a.checks) { const li = document.createElement('li'); li.className = c.level; li.dataset.check = c.id; li.textContent = c.text; ul.append(li); }
  const bad = a.checks.some(c => c.level === 'bad');
  setStatus(stopWhy === 'long' ? 'Stopped at 28 seconds (takes stay under 30).' : bad ? 'Have a listen. A redo might be better.' : S.view === 'setup' ? 'Have a listen.' : 'Have a listen, then Keep or Redo.');
  if (prefs.play && !a.silent) play();
}
function discard() {
  stopPlay();
  S.take = null;
  if (S.rec === 'review' || S.rec === 'saving') S.rec = 'idle';
  renderDeck();
}

// ---------------------------------------------------------------- playback
let playing = null, pctx = null;
function stopPlay() { if (playing) { try { playing.src.stop(); } catch { /* done */ } playing = null; } $('#play').textContent = 'Play'; }
// In headset mode the phone stays in call mode while the mic is open, and plays everything quietly out of its earpiece. So the
// mic rests while a take plays (Record turns it back on) and the take plays from its own player, made after the call mode ends.
function restMic() {
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  if (src) { src.disconnect(); src = null; }
  mic.live = false;
  $('#mic-on').textContent = 'Turn on the mic'; $('#mic-on').disabled = false;
}
async function play(samples = S.take && S.take.x) {
  if (!samples || !samples.length) return;
  if (playing) { stopPlay(); return; }
  let out;
  if (prefs.headset) {
    const rested = mic.live && S.rec !== 'recording';
    if (rested) restMic();
    if (!pctx || pctx.state === 'closed') pctx = new AudioContext();
    out = pctx;
    if (rested) await new Promise(r => setTimeout(r, 600)); // (the headset takes a moment to come back from a call to music)
  } else {
    if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive' }); }
    out = ctx;
  }
  if (out.state !== 'running') await out.resume();
  const buf = out.createBuffer(1, samples.length, RATE);
  buf.copyToChannel(samples, 0);
  const s = out.createBufferSource();
  s.buffer = buf; s.connect(out.destination);
  const me = playing = { src: s, ctx: out, t0: out.currentTime, dur: buf.duration, own: samples === (S.take && S.take.x) };
  s.onended = () => { if (playing === me) { playing = null; $('#play').textContent = 'Play'; if (me.own) drawWave(0); } };
  s.start();
  $('#play').textContent = 'Stop playing';
  const tick = () => { if (playing !== me) return; if (me.own) drawWave(Math.min(1, (me.ctx.currentTime - me.t0) / me.dur)); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function drawWave(at) {
  const c = $('#wave'), x = S.take && S.take.x;
  if (!x) return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  if (!w || !h) return;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'), per = Math.max(1, Math.floor(x.length / w)), mid = h / 2;
  g.clearRect(0, 0, w, h);
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#2b2433';
  for (let i = 0; i < w; i++) {
    let lo = 0, hi = 0;
    for (let k = i * per, e = Math.min(x.length, k + per); k < e; k++) { const v = x[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    g.fillStyle = i / w <= at && at > 0 ? '#ff5d8f' : (hi > 0.99 || lo < -0.99 ? '#ff6f61' : ink);
    g.fillRect(i, mid - hi * mid * 0.95, 1, Math.max(1, (hi - lo) * mid * 0.95));
  }
  if (at > 0) { g.fillStyle = '#ff5d8f'; g.fillRect(Math.round(at * w) - dpr, 0, 2 * dpr, h); }
}

// ---------------------------------------------------------------- keep
async function keep() {
  if (S.rec !== 'review' || !S.take) return;
  if (S.view === 'setup') { finishSetup(); return; }
  const t = S.take, p = t.prompt;
  if (t.a.silent) { toast("There's nothing in that take to keep. Try again!"); return; }
  if (t.x.length / RATE >= S.data.caps.takeSecs) { toast(`Takes must be under ${S.data.caps.takeSecs} seconds. Try a redo.`); return; }
  stopPlay();
  S.rec = 'saving'; renderDeck(); setStatus('Saving...');
  const meta = { mic: mic.label, stats: { noise: t.a.noise, speech: t.a.speech, peak: t.a.peak, clipped: t.a.clipped, trimmed: t.a.trimmed, rate: t.rate, checks: t.a.checks.map(c => c.id) } };
  let r, j = {};
  try {
    r = await api('take?id=' + encodeURIComponent(p.id), { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-take-meta': encodeURIComponent(JSON.stringify(meta)) }, body: t.wav });
    j = await r.json().catch(() => ({}));
  } catch { r = null; }
  if (!r || !r.ok) {
    S.rec = 'review'; renderDeck();
    const msg = (j && j.message) || 'Could not save that take. Check the connection and press Keep again.';
    setStatus(msg); toast(msg, 4000); S.errors.push(msg);
    return;
  }
  S.uploads++;
  S.data.takes[p.id] = j.take; S.data.totals = j.totals; S.data.warn = !!j.warn;
  S.data.cursor = { batch: p.batch };
  if (mic.label) S.data.mic = mic.label;
  S.session.kept++; S.session.secs += j.take.secs;
  S.take = null; S.rec = 'idle';
  sessionNudge();
  // on to the next line nobody has kept yet in this batch; a finished batch gets its moment
  const open = firstOpen(S.batch);
  if (open < 0) { S.doneShown = S.batch; setStatus('Saved. That was the last line of this batch!'); }
  else { S.idx = open; setStatus('Saved! Next line.'); }
  renderAll();
}
let nudged = false;
function sessionNudge() {
  if (nudged || !S.session.t0 || Date.now() - S.session.t0 < 10 * 60e3) return;
  nudged = true;
  toast("10 minutes: that's a good session! Rest your voice, or keep going if it feels fresh.", 6000);
}
function finishSetup() {
  prefs.setup = true; savePrefs();
  discard();
  setStatus('Press Record (or Space) and read the line.');
  show('booth');
}

// ---------------------------------------------------------------- progress
function renderProgress() {
  const d = S.data, t = d.totals;
  const done = d.batches.filter(b => firstOpen(b.n) < 0).length;
  $('#s-kept').textContent = String(t.kept); $('#s-kept-of').textContent = `takes kept of ${t.of}`;
  $('#s-min').textContent = (t.secs / 60).toFixed(t.secs < 600 ? 1 : 0);
  $('#s-batch').textContent = String(done); $('#s-batch-of').textContent = `batches done of ${d.batches.length}`;
  // (voice-set2) a grid per set: #grid set 1, #grid2 set 2, each with its own count
  for (const st of d.sets || [{ n: 1, batches: d.batches.map(b => b.n) }]) {
    const grid = $(st.n === 1 ? '#grid' : '#grid2');
    if (!grid) continue;
    grid.textContent = '';
    const sk = t.sets && t.sets[st.n], line = $(`#set${st.n}-line`);
    if (line && sk) line.textContent = `${sk.kept} of ${sk.of} kept. ${st.about || ''}`;
    for (const bn of st.batches) {
      const b = d.batches[bn - 1], label = b.label || d.styles[b.style].label, w = batchIn(bn);
      const ids = batchIds(b.n), k = ids.filter(p => kept(p.id)).length;
      const el = document.createElement('button');
      el.type = 'button'; el.dataset.batch = String(b.n);
      el.style.setProperty('--f', String(k / ids.length)); el.style.setProperty('--c', COLORS[b.style]);
      el.classList.toggle('full', k === ids.length); el.classList.toggle('cur', b.n === S.batch);
      const n = document.createElement('span'); n.className = 'bn'; n.textContent = `Batch ${w.k}`;
      const s = document.createElement('span'); s.className = 'bs'; s.textContent = label;
      const c = document.createElement('span'); c.className = 'bc'; c.textContent = k === ids.length ? 'Done' : `${k} / ${ids.length}`;
      el.append(n, s, c);
      el.setAttribute('aria-label', `${w.set === 1 ? '' : 'Set ' + w.set + ', '}Batch ${w.k}, ${label}, ${k} of ${ids.length} kept`);
      el.addEventListener('click', () => { const i = firstOpen(b.n); go(b.n, i < 0 ? 0 : i); show('booth'); });
      grid.append(el);
    }
  }
  const mb = t.bytes / 1048576, cap = d.caps.totalBytes / 1048576;
  $('#store-fill').style.width = Math.min(100, (t.bytes / d.caps.totalBytes) * 100).toFixed(1) + '%';
  $('#store-bar').classList.toggle('warn', !!d.warn);
  $('#store-line').textContent = `${mb.toFixed(1)} MB of ${cap.toFixed(0)} MB used. About ${(cap / 170).toFixed(1)} hours fit; the whole script is under an hour.`;
  const mins = S.session.t0 ? (Date.now() - S.session.t0) / 60e3 : 0;
  $('#ring').setAttribute('stroke-dashoffset', String(188.5 * (1 - Math.min(1, mins / 10))));
  $('#ring').style.opacity = mins > 0.1 ? '1' : '0';
  $('#sess-line').textContent = !S.session.t0 ? '10 minutes is a good session.' : mins >= 10 ? "That's a good session! Rest your voice when you like." : mins < 1 ? 'Just getting going. 10 minutes is a good session.' : `${Math.floor(mins)} of 10 minutes. 10 minutes is a good session.`;
  $('#sess-sub').textContent = S.session.kept ? `${S.session.kept} take${S.session.kept === 1 ? '' : 's'} kept, ${(S.session.secs / 60).toFixed(1)} minutes of voice.` : 'Short sessions keep your voice fresh.';
}
async function makeCode() {
  const b = $('#pull-make'); b.disabled = true;
  try {
    const r = await api('code', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || 'no code');
    $('#pull-code').hidden = false; $('#pull-code').textContent = j.code;
    $('#pull-cmd').hidden = false;
    $('#pull-cmd').textContent = `node tools/voice-pull.mjs --code ${j.code}\n\nThe code works once, for 15 minutes. The takes land in F:\\Projects\\Breneland-Voice\\takes (wavs/ and metadata.csv).`;
  } catch (e) { toast('Could not make a code: ' + e.message); }
  b.disabled = false;
}

// ---------------------------------------------------------------- wiring
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; show(b.dataset.tab === 'booth' ? (prefs.setup ? 'booth' : 'setup') : b.dataset.tab); });
$('#rec').addEventListener('click', () => { if (S.rec === 'recording') stopRec('tap'); else startRec(); });
$('#prev').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));
$('#play').addEventListener('click', () => play());
$('#redo').addEventListener('click', () => { discard(); setStatus('No problem. Press Record (or Space) when you are ready.'); });
$('#keep').addEventListener('click', keep);
$('#wave').addEventListener('click', () => play());
$('#mic-on').addEventListener('click', () => ensureMic().catch(() => {}));
$('#mic-pick').addEventListener('change', e => { prefs.deviceId = e.target.value; savePrefs(); if (S.rec !== 'recording') micOn().catch(() => {}); });
$('#mic-headset').checked = !!prefs.headset;
$('#mic-headset').addEventListener('change', e => { prefs.headset = e.target.checked; savePrefs(); if (S.rec !== 'recording') micOn().catch(() => {}); });
$('#setup-done').addEventListener('click', finishSetup);
$('#opt-pause').addEventListener('change', e => { prefs.pause = Number(e.target.value); savePrefs(); });
$('#opt-play').addEventListener('change', e => { prefs.play = e.target.checked; savePrefs(); });
$('#opt-micpick').addEventListener('click', () => { $('#mic-on').disabled = mic.live; show('setup'); });
$('#opt-delete').addEventListener('click', async () => {
  const p = current();
  if (!kept(p.id) || !confirm('Delete the kept take for this line?')) return;
  const r = await api(`take/${p.id}/delete`, { method: 'POST' }).catch(() => null);
  if (!r || !r.ok) { toast('Could not delete it. Try again.'); return; }
  const j = await r.json(); delete S.data.takes[p.id]; S.data.totals = j.totals; renderAll(); toast('Deleted.');
});
$('#done-next').addEventListener('click', () => { const b = nextOpenBatch(); if (b) go(b, firstOpen(b)); });
$('#done-progress').addEventListener('click', () => show('progress'));
$('#pull-make').addEventListener('click', makeCode);
$('#p-kept').addEventListener('click', playKept);
async function playKept() {
  const p = current();
  if (!kept(p.id)) return;
  const r = await api(`wav/${p.id}.wav`).catch(() => null);
  if (!r || !r.ok) return;
  const w = parseWav(new Uint8Array(await r.arrayBuffer()));
  if (w && w.samples) play(w.samples);
}
const typing = t => t && t.closest && t.closest('select, input, textarea, summary');
document.addEventListener('keydown', e => {
  if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || !(S.view === 'booth' || S.view === 'setup')) return;
  if (e.code === 'Space') { e.preventDefault(); if (e.repeat) return; if (S.rec === 'recording') stopRec('tap'); else if (!$('#rec').disabled) startRec(); }
  else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && S.rec === 'review') { e.preventDefault(); keep(); }
  else if (e.code === 'KeyR' && S.rec === 'review') { e.preventDefault(); $('#redo').click(); }
  else if (e.code === 'KeyP' && S.take) { e.preventDefault(); play(); }
  else if (e.code === 'ArrowLeft' && S.view === 'booth') { e.preventDefault(); step(-1); }
  else if (e.code === 'ArrowRight' && S.view === 'booth') { e.preventDefault(); step(1); }
});
document.addEventListener('keyup', e => { if (e.code === 'Space' && !typing(e.target)) e.preventDefault(); });
addEventListener('resize', () => { if (S.take) drawWave(0); });
setInterval(() => { if (S.view === 'progress') renderProgress(); }, 15000);

boot();
