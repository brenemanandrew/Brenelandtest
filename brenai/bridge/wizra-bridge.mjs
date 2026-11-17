#!/usr/bin/env node
// Wizra's brain bridge: run this on the PC with Bionic (formerly LM Studio). It connects OUT to brenai.fly.dev (the server
// cannot reach your PC), signs in with the shared secret, takes Wizra's reply jobs, asks Bionic's local server and streams
// the words back. Same idea as Breneland's npc-brain-bridge.mjs; both can run at the same time on the same loaded model.
// Plain Node 22 or newer, no npm packages.
//
//   node wizra-bridge.mjs
//
// Settings (environment variables):
//   BRENAI_BRAIN_TOKEN  the shared secret (same value as the Fly secret BRENAI_BRAIN_TOKEN)        required
//   BRENAI_SERVER       default wss://brenai.fly.dev/brain
//   LM_URL              default http://localhost:1234/v1/chat/completions
//   WIZRA_MODEL         the model name Bionic shows (default: LM_MODEL, else the loaded one)
//   WIZRA_MIN_P         default 0.05 (trims odd low-chance words)
//   WIZRA_REPEAT_PENALTY default 1.08
//   WIZRA_TEMP          force a temperature (normally the slider on her wheel decides)
//   WIZRA_VOICE=off     skip her Kokoro voice (WIZRA_VOICE_QUALITY=fp32 for the bigger, slightly better voice model)
//   LM_NO_SYSTEM=1      fold the instructions into the first message, for chat templates without a system role
// Privacy: nothing either of you says is printed or written here. The status line shows counts only.
const SERVER = process.env.BRENAI_SERVER || 'wss://brenai.fly.dev/brain';
const LM_URL = process.env.LM_URL || 'http://localhost:1234/v1/chat/completions';
const MODEL = process.env.WIZRA_MODEL || process.env.LM_MODEL || '';
const TOKEN = process.env.BRENAI_BRAIN_TOKEN || '';
const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' && Number.isFinite(Number(process.env[k]))) ? Number(process.env[k]) : d;
const MIN_P = num('WIZRA_MIN_P', 0.05), REPEAT = num('WIZRA_REPEAT_PENALTY', 1.08), FORCE_TEMP = num('WIZRA_TEMP', undefined);
let NO_SYSTEM = process.env.LM_NO_SYSTEM === '1';

if (typeof WebSocket !== 'function') { console.error('This needs Node 22 or newer (it uses the built-in WebSocket). Get it from nodejs.org.'); process.exit(1); }
if (TOKEN.length < 12) { console.error('Set BRENAI_BRAIN_TOKEN first (12+ characters, the same secret as on Fly). See README.md next to this file.'); process.exit(1); }

const st = { state: 'starting', served: 0, failed: 0, since: 0, note: '' };

// ---- her voice: Kokoro (the kokoro-js package next to this file; start-wizra.ps1 installs it). Runs on the CPU, so it does
// not take graphics memory from the model. First start downloads the voice model (about 90 MB) and keeps it. ----
let tts = null, voices = [], voiceState = process.env.WIZRA_VOICE === 'off' ? 'off' : 'starting', voiceQueue = Promise.resolve();
async function loadVoice() {
  if (voiceState === 'off') return;
  let KokoroTTS;
  try { ({ KokoroTTS } = await import('kokoro-js')); } catch (e) { voiceState = /Cannot find|ERR_MODULE_NOT_FOUND/.test(String(e)) ? 'not installed (kokoro-js is missing next to the bridge; run start-wizra.ps1)' : 'could not start: ' + String(e?.message || e).slice(0, 140); sendCaps(); return status(); }
  try {
    voiceState = 'loading (first time downloads about 90 MB)'; sendCaps(); status();
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: process.env.WIZRA_VOICE_QUALITY || 'q8', device: 'cpu' });
    voices = Object.entries(tts.voices).map(([id, v]) => ({ id, name: v.name || id, lang: v.language || '', gender: v.gender || '' }));
    voiceState = 'on'; sendCaps();
  } catch (e) { voiceState = 'failed: ' + String(e?.message || e).slice(0, 140); sendCaps(); }
  status();
}
function sendCaps() { if (ws && st.state === 'connected') { try { ws.send(JSON.stringify({ t: 'caps', tts: !!tts, voices, voiceState })); } catch {} } }
// plain 16-bit WAV: every phone browser plays it, and it is half the size of the float one
function wav16(f32, rate) {
  const b = Buffer.alloc(44 + f32.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + f32.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, f32[i])) * 32767), 44 + i * 2);
  return b;
}
function speak(m) { // one line of hers -> a WAV, sent back as base64; lines are done one at a time
  voiceQueue = voiceQueue.then(async () => {
    try {
      const audio = await tts.generate(String(m.text || '').slice(0, 800), { voice: tts.voices[m.voice] ? m.voice : 'af_heart', speed: Math.max(0.6, Math.min(1.6, Number(m.speed) || 1)) });
      ws.send(JSON.stringify({ t: 'audio', id: m.id, wav: wav16(audio.audio, audio.sampling_rate).toString('base64') }));
    } catch (e) { try { ws.send(JSON.stringify({ t: 'fail', id: m.id, why: 'voice ' + String(e?.message || 'error').slice(0, 30) })); } catch {} }
  });
}
let lastLine = '';
function status() {
  const up = st.since ? Math.round((Date.now() - st.since) / 60000) + ' min' : '-';
  const line = `Wizra brain: ${st.state} | replies ${st.served} | failed ${st.failed} | voice ${voiceState} | up ${up}${st.note ? ' | ' + st.note : ''}`;
  if (line === lastLine) return;
  lastLine = line;
  if (!process.stdout.isTTY) console.log(line); else process.stdout.write('\r' + line.padEnd(110));
}
setInterval(status, 5000).unref();

const tidy = t => t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\|im_end\|>|<\/s>|\[\/INST\]/g, '');

async function think(job, send) {
  const sys = String(job.system || ''), msgs = Array.isArray(job.messages) ? job.messages : [];
  const shape = noSys => (noSys && sys)
    ? (msgs.length && msgs[0].role === 'user' ? [{ role: 'user', content: sys + '\n\n' + msgs[0].content }, ...msgs.slice(1)] : [{ role: 'user', content: sys }, ...msgs])
    : (sys ? [{ role: 'system', content: sys }, ...msgs] : msgs);
  const stream = !!job.stream;
  const call = noSys => {
    const body = { messages: shape(noSys), max_tokens: Math.min(2000, job.max_tokens || 700), temperature: FORCE_TEMP ?? (typeof job.temperature === 'number' ? job.temperature : 0.75), stream, min_p: MIN_P, repeat_penalty: typeof job.repeat_penalty === 'number' ? job.repeat_penalty : REPEAT };
    for (const k of ['frequency_penalty', 'presence_penalty']) if (typeof job[k] === 'number') body[k] = job[k];
    if (Array.isArray(job.stop)) body.stop = job.stop.slice(0, 4);
    if (MODEL) body.model = MODEL;
    return fetch(LM_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(170000) });
  };
  let r = await call(NO_SYSTEM);
  if (!r.ok && r.status === 400 && !NO_SYSTEM) { const e = await r.text().catch(() => ''); if (/system/i.test(e)) { NO_SYSTEM = true; r = await call(true); } }
  if (!r.ok) throw new Error('lm ' + r.status);
  if (!stream) {
    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('lm empty');
    return tidy(text).trim();
  }
  // OpenAI-style server-sent events: data: {"choices":[{"delta":{"content":"..."}}]} ... data: [DONE]
  const dec = new TextDecoder(); let buf = '', full = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let d; try { d = JSON.parse(data)?.choices?.[0]?.delta?.content; } catch { continue; }
      if (typeof d === 'string' && d) { full += d; send(d); }
    }
  }
  return tidy(full).trim();
}

let ws = null, backoff = 1000, ping = null;
function connect() {
  st.state = 'connecting'; status();
  try { ws = new WebSocket(SERVER); } catch { return retry(); }
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: TOKEN, model: MODEL, v: 4 }));
  ws.onmessage = async ev => {
    let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
    if (m.t === 'welcome') { st.state = 'connected'; st.since = Date.now(); st.note = ''; backoff = 1000; status(); clearInterval(ping); ping = setInterval(() => { try { ws.send('{"t":"ping"}'); } catch {} }, 20000); sendCaps(); return; }
    if (m.t === 'refused') { st.state = 'refused'; st.note = 'the token was refused: BRENAI_BRAIN_TOKEN must match the Fly secret'; status(); backoff = 60000; return; }
    if (m.t === 'replaced') { st.state = 'replaced'; st.note = 'another bridge signed in; this one stops'; status(); process.stdout.write('\n'); process.exit(0); }
    if (m.t === 'tts' && Number.isInteger(m.id)) { if (tts) speak(m); else ws.send(JSON.stringify({ t: 'fail', id: m.id, why: 'voice ' + voiceState })); return; }
    if (m.t === 'job' && Number.isInteger(m.id)) {
      try {
        const text = await think(m, d => { try { ws.send(JSON.stringify({ t: 'delta', id: m.id, d })); } catch {} });
        ws.send(JSON.stringify({ t: 'done', id: m.id, text })); st.served++; st.note = '';
      } catch (e) {
        try { ws.send(JSON.stringify({ t: 'fail', id: m.id, why: String(e?.message || 'error').slice(0, 40) })); } catch {}
        st.failed++; st.note = /lm|fetch|ECONN/i.test(String(e?.message)) ? 'Bionic did not answer: is its server running with the model loaded?' : '';
      }
      status();
    }
  };
  ws.onclose = () => { clearInterval(ping); if (st.state !== 'replaced') { if (st.state !== 'refused') st.state = 'disconnected'; status(); retry(); } };
  ws.onerror = () => {};
}
function retry() { setTimeout(connect, backoff); backoff = Math.min(30000, Math.max(backoff, 1000) * 2); }
process.on('SIGINT', () => { process.stdout.write('\n'); process.exit(0); });
connect();
loadVoice();
