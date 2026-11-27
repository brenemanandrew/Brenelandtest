// Tests the Brene relay end to end off the PC: the real viture-bridge.py in --fake --6dof mode for the head pose, a stand-in
// Brenai server (login, PIN, streamed chat) and a stand-in LM Studio. Run: node vam/test/relay.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RELAY = path.join(HERE, '..', 'relay', 'brene-relay.mjs');
const BRIDGE = path.join(HERE, '..', '..', 'brenai', 'tools', 'viture-bridge.py');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
const run = (cmd, args, env = {}) => { const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.out = () => out; procs.push(p); return p; };
const listen = (handler) => new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const body = req => new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s ? JSON.parse(s) : {})); });

// stand-in Brenai: password "pw", PIN 1234, streams two deltas then done
let chats = 0, sawCookie = '', ttsText = '';
const brenai = await listen(async (req, res) => {
  const b = await body(req);
  if (req.url === '/api/login') { if (b.password !== 'pw') { res.writeHead(401); return res.end('{"error":"wrong password"}'); } res.writeHead(200, { 'set-cookie': 'brenai=tok123; Path=/; HttpOnly' }); return res.end('{"ok":true}'); }
  if (req.url === '/api/pin') { if (!String(req.headers.cookie).includes('brenai=tok123')) { res.writeHead(401); return res.end('{"error":"login"}'); } if (b.pin !== '1234') { res.writeHead(404); return res.end('{"error":"No save with that PIN."}'); } res.writeHead(200, { 'set-cookie': 'brenai_u=p1.sig; Path=/' }); return res.end('{"ok":true}'); }
  if (req.url === '/api/tts') { ttsText = b.text; if (!String(req.headers.cookie).includes('brenai_u=')) { res.writeHead(401); return res.end('{"error":"login"}'); } res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)])); }
  if (req.url === '/api/chat') { sawCookie = String(req.headers.cookie); chats++; res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"t":"delta","text":"Hi "}\n\n'); res.write('data: {"t":"delta","text":"there"}\n\n'); return res.end(`data: {"t":"done","text":"*smiles* Hi there, you said ${b.text}"}\n\n`); }
  res.writeHead(404); res.end();
});
// stand-in LM Studio
let lmSystem = '';
const lm = await listen(async (req, res) => { const b = await body(req); lmSystem = b.messages[0].content; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: '<think>hmm</think>Local reply to ' + b.messages.at(-1).content } }] })); });

const B = `http://127.0.0.1:${brenai.address().port}`, L = `http://127.0.0.1:${lm.address().port}`;
const get = async (port, p) => (await fetch(`http://127.0.0.1:${port}${p}`)).json();
const post = async (port, p, o) => (await fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) })).json();

try {
  // relay 1: Brenai mode, no glasses helper yet
  const r1 = run('node', [RELAY, '--port', '18767', '--bridge', 'ws://127.0.0.1:18766', '--brenai', B], { BRENAI_PASSWORD: 'pw', BRENAI_PIN: '1234' });
  await sleep(700);
  let s = await get(18767, '/state');
  ok(s.glasses === false && s.pose === null && Array.isArray(s.hands) && s.hands.length === 0, 'state with nothing connected: no glasses, no hands');

  // the real glasses helper, fake 6DOF, on 18766 (its port is fixed at 8766, so run a copy with the port swapped)
  const fs = await import('node:fs'); const tmp = path.join(process.env.TMPDIR || '/tmp', 'viture-bridge-test.py');
  fs.writeFileSync(tmp, fs.readFileSync(BRIDGE, 'utf8').replace(/^PORT = 8766$/m, 'PORT = 18766'));
  run('python3', [tmp, '--fake', '--6dof']);
  let got = null; for (let i = 0; i < 30 && !got; i++) { await sleep(250); s = await get(18767, '/state'); if (s.glasses) got = s; }
  ok(!!got, 'head pose arrives from viture-bridge.py --fake --6dof'); if (!got) console.log(procs.map(p => p.out()).join('\n---\n'));
  ok(got && Array.isArray(got.pose.pos) && got.pose.pos.length === 3 && typeof got.pose.yaw === 'number', 'pose has yaw/pitch/roll and a 6DOF position');
  if (got) { const a = got.pose.pos[0]; await sleep(400); const b2 = (await get(18767, '/state')).pose.pos[0]; ok(a !== b2, `position moves (x ${a} then ${b2})`); }

  // hands
  let h = await post(18767, '/hands', { hands: [{ id: 3, x: 0.4, y: 1.7, size: 0.2, pinch: 0, closed: true, extra: 'x' }] });
  s = await get(18767, '/state');
  ok(s.handsOn && s.hands.length === 1 && s.hands[0].y === 1 && s.hands[0].closed === true && s.hands[0].pinch === false && !('extra' in s.hands[0]), 'hands are cleaned (clamped, booleans, no extra fields)');
  await sleep(600); s = await get(18767, '/state');
  ok(!s.handsOn && s.hands.length === 0, 'hands drop out half a second after the page stops sending');
  const page = await (await fetch('http://127.0.0.1:18767/hands')).text();
  ok(page.includes('HandLandmarker') && page.includes("fetch('/hands'"), 'hand tracking page is served');

  // Wizra via Brenai
  let c = await post(18767, '/chat', { text: 'hello' });
  ok(c.text === '*smiles* Hi there, you said hello' && c.voice === null, 'chat: reply from Brenai (signed in with password and PIN, read the streamed "done"); no voice unless asked');
  ok(sawCookie.includes('brenai=tok123') && sawCookie.includes('brenai_u=p1.sig'), 'chat: both Brenai cookies sent');
  c = await post(18767, '/chat', { text: 'again', voice: true }); ok(c.text && chats === 2 && c.voice, 'chat: second message reuses the sign-in and starts her voice');
  let vr; for (let i = 0; i < 20; i++) { vr = await fetch('http://127.0.0.1:18767/voice?id=' + c.voice); if (vr.status !== 202) break; await sleep(100); }
  const wav = Buffer.from(await vr.arrayBuffer());
  ok(vr.status === 200 && vr.headers.get('content-type') === 'audio/wav' && wav.toString('latin1', 0, 4) === 'RIFF', 'voice: her WAV from Brenai /api/tts');
  ok(ttsText === 'Hi there, you said again', 'voice: only her spoken words are voiced (the *action* is left out): ' + ttsText);
  ok((await fetch('http://127.0.0.1:18767/voice?id=999')).status === 404, 'voice: unknown id is a 404');
  c = await post(18767, '/chat', { text: '' }); ok(!!c.error, 'chat: empty message refused');
  const home = await (await fetch('http://127.0.0.1:18767/')).text(); ok(home.includes('connected') && home.includes('6DOF'), 'status page shows the glasses helper in 6DOF');
  ok(!r1.out().includes('pw') || !/\bpw\b/.test(r1.out()), 'the password is never printed');

  // relay 2: wrong PIN gives a plain error
  run('node', [RELAY, '--port', '18768', '--bridge', 'ws://127.0.0.1:18799', '--brenai', B], { BRENAI_PASSWORD: 'pw', BRENAI_PIN: '9999' });
  await sleep(600); c = await post(18768, '/chat', { text: 'hi' });
  ok(c.error && c.error.includes('No save with that PIN'), 'chat: wrong PIN gives a plain error: ' + c.error);

  // relay 3: local mode with LM Studio and her persona from brenai/persona.mjs
  run('node', [RELAY, '--port', '18769', '--bridge', 'ws://127.0.0.1:18799', '--wizra', 'local', '--lmstudio', L]);
  await sleep(600); c = await post(18769, '/chat', { text: 'yo' });
  ok(c.text === 'Local reply to yo', 'chat local: LM Studio reply, thinking stripped');
  c = await post(18769, '/chat', { text: 'again', voice: true }); ok(c.voice === null, 'chat local: no voice (only Brenai has her voice)');
  ok(lmSystem.startsWith('You are Wizra.') && lmSystem.length > 1000, 'chat local: uses her full persona from brenai/persona.mjs');

  // relay 4: local mode with LM Studio off
  run('node', [RELAY, '--port', '18770', '--bridge', 'ws://127.0.0.1:18799', '--wizra', 'local', '--lmstudio', 'http://127.0.0.1:1']);
  await sleep(600); c = await post(18770, '/chat', { text: 'yo' });
  ok(c.error && c.error.includes('LM Studio is not running'), 'chat local: LM Studio off gives a plain error');
} finally {
  for (const p of procs) p.kill(); brenai.close(); lm.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
