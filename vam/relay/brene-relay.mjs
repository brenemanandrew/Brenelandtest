// Brene relay: the one thing the VaM plugin talks to. Runs on the PC next to VaM. Node 22, no packages.
//
//   node brene-relay.mjs                 (or double-click start-brene.bat)
//
// What it gathers
//   head pose   from viture-bridge.py (brenai/tools) on ws://127.0.0.1:8766: yaw, pitch, roll in degrees, pos [x,y,z] metres with --6dof
//   hands       from its own page http://127.0.0.1:8767/hands (your webcam, MediaPipe in the browser; nothing of the picture leaves the PC)
//   Wizra       "brenai": the real Wizra at brenai.fly.dev (her memory, mood and story), signed in with BRENAI_PASSWORD and BRENAI_PIN
//               set in this PC's environment (never in a file). "local": LM Studio on this PC with her persona, no memory.
//               Picked by --wizra brenai|local; default brenai when BRENAI_PIN is set, else local.
// What it serves (127.0.0.1 only)
//   GET  /state   {"pose":{...,"age"},"glasses":bool,"hands":[...],"handsOn":bool}
//   POST /chat    {"text"} -> {"text"} | {"error"}
//   GET  /hands   the hand tracking page;  POST /hands {"hands":[...]} from that page
//   GET  /library the library page (your scenes, looks and poses, and the VaM Hub) and its /lib/* routes
//   POST /vam     the plugin's report (people in the scene, a finished command); /state carries the next command as "cmd"
//   GET  /        a status page
// --lan also listens on the home network (for a phone), with a key printed at start that the page needs; this PC needs no key.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { Library } from './library.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PORT = +arg('--port', process.env.BRENE_PORT || 8767);
const BRIDGE = arg('--bridge', process.env.BRENE_BRIDGE || 'ws://127.0.0.1:8766');
const BRENAI = String(arg('--brenai', process.env.BRENAI_URL || 'https://brenai.fly.dev')).replace(/\/$/, '');
const LMSTUDIO = String(arg('--lmstudio', process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234')).replace(/\/$/, '');
const WIZRA = arg('--wizra', process.env.BRENE_WIZRA || (process.env.BRENAI_PIN ? 'brenai' : 'local'));
const NAME = process.env.BRENE_NAME || 'Andrew';
const LAN = process.argv.includes('--lan');
const KEY = crypto.randomBytes(6).toString('hex');
const lib = new Library({ dataFile: arg('--data', path.join(HERE, 'brene-relay.json')), vamDir: arg('--vam', process.env.VAM_DIR || ''), hubApi: arg('--hub-api', undefined) });
if (lib.vamDir) lib.scan();

// ---- head pose from the glasses helper ----
const pose = { at: 0 };
let bridgeUp = false;
// Node's WebSocket does not always report a refused connection as "close", so retrying hangs on one guarded "again"
// and a watchdog that also catches a helper that went quiet without closing.
function bridge() {
  let ws, done = false, last = Date.now();
  const again = () => { if (done) return; done = true; clearInterval(dog); if (bridgeUp) console.log('Glasses helper gone (start viture-bridge.py)'); bridgeUp = false; try { ws.close(); } catch {} setTimeout(bridge, 2000); };
  const dog = setInterval(() => { if (Date.now() - last > 3000) again(); }, 1000);
  try { ws = new WebSocket(BRIDGE); } catch { return again(); }
  ws.onopen = () => { bridgeUp = true; last = Date.now(); console.log('Glasses helper connected'); };
  ws.onmessage = e => { last = Date.now(); try { const m = JSON.parse(String(e.data)); if (typeof m.yaw === 'number') Object.assign(pose, { yaw: m.yaw, pitch: m.pitch || 0, roll: m.roll || 0, pos: Array.isArray(m.pos) && m.pos.length === 3 ? m.pos : undefined, at: Date.now() }); } catch {} };
  ws.onclose = again; ws.onerror = again;
}
bridge();

// ---- hands from the page ----
let hands = [], handsAt = 0;
const cleanHands = list => (Array.isArray(list) ? list : []).slice(0, 4).map(h => ({
  id: h.id | 0, x: clamp(+h.x), y: clamp(+h.y), size: Math.max(0, +h.size || 0), pinch: !!h.pinch, closed: !!h.closed,
}));
const clamp = v => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);

// ---- Wizra ----
let cookies = {};
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
function keepCookies(res) {
  for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) cookies[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
}
async function signIn() {
  cookies = {};
  const pw = process.env.BRENAI_PASSWORD || '', pin = process.env.BRENAI_PIN || '';
  let r = await fetch(BRENAI + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  if (!r.ok) throw new Error(r.status === 401 ? 'Brenai turned down the password (set BRENAI_PASSWORD on this PC)' : `Brenai sign-in failed (${r.status})`);
  keepCookies(r);
  if (!pin) throw new Error('Set BRENAI_PIN on this PC so the relay opens your save');
  r = await fetch(BRENAI + '/api/pin', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieHeader() }, body: JSON.stringify({ pin }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error('Brenai PIN: ' + (j.error || r.status)); }
  keepCookies(r);
}
async function askBrenai(text, again = true) {
  if (!cookies.brenai_u) await signIn();
  const r = await fetch(BRENAI + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieHeader() }, body: JSON.stringify({ text }) });
  if (r.status === 401 && again) { cookies = {}; return askBrenai(text, false); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Brenai answered ${r.status}`); }
  // her reply streams as server-sent events; the last one (t: "done") holds the whole text
  const body = await r.text(); let done = null, away = false, err = '';
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try { const m = JSON.parse(line.slice(6)); if (m.t === 'done') done = m.text; if (m.t === 'away') away = true; if (m.t === 'error') err = m.error || m.text || 'error'; } catch {}
  }
  if (done != null) return done;
  if (away) return '(She is out right now. Your message is waiting for her.)';
  throw new Error(err || 'No reply from Brenai');
}

let persona = null; const history = [];
async function askLocal(text) {
  if (!persona) {
    try { persona = (await import(pathToFileURL(path.join(HERE, '..', '..', 'brenai', 'persona.mjs')).href)).PERSONA(NAME); }
    catch { persona = `You are Wizra, 22, a college student who leans goth and plays D&D. You talk with ${NAME} as yourself, a person, never an assistant. Short, natural replies.`; }
  }
  history.push({ role: 'user', content: text }); while (history.length > 24) history.shift();
  const r = await fetch(LMSTUDIO + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: persona }, ...history], temperature: 0.8, max_tokens: 400 }) })
    .catch(() => { throw new Error('LM Studio is not running on this PC (' + LMSTUDIO + ')'); });
  if (!r.ok) { history.pop(); throw new Error(`LM Studio answered ${r.status} (is a model loaded?)`); }
  const j = await r.json(); const out = String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  history.push({ role: 'assistant', content: out }); return out;
}
let chatting = false;

// ---- the server ----
const send = (res, code, obj, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
const readBody = req => new Promise((ok, bad) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } }); req.on('error', bad); });

const isLocal = req => /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (!isLocal(req)) {   // only reachable with --lan: the key is needed, from the link (once) or the cookie it sets
      const ck = /(?:^|; )brene=([0-9a-f]+)/.exec(req.headers.cookie || ''), k = url.searchParams.get('k');
      if (k === KEY) res.setHeader('set-cookie', `brene=${KEY}; Path=/; HttpOnly; SameSite=Strict`);
      else if (!ck || ck[1] !== KEY) return send(res, 403, 'Open the link with the key that brene-relay printed when it started.', 'text/plain');
    }
    if (url.pathname.startsWith('/lib') || url.pathname === '/library' || url.pathname === '/vam') return await libRoute(req, res, url);
    if (url.pathname === '/state') {
      const age = pose.at ? Date.now() - pose.at : null, fresh = age != null && age < 1000;
      const handsFresh = Date.now() - handsAt < 500;
      const cmd = lib.nextFor();
      return send(res, 200, { ...(cmd ? { cmd } : {}), glasses: fresh, pose: fresh ? { yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll, ...(pose.pos ? { pos: pose.pos } : {}), age } : null, hands: handsFresh ? hands : [], handsOn: handsFresh });
    }
    if (url.pathname === '/hands' && req.method === 'POST') { hands = cleanHands((await readBody(req)).hands); handsAt = Date.now(); return send(res, 200, { ok: true }); }
    if (url.pathname === '/hands') return send(res, 200, fs.readFileSync(path.join(HERE, 'hands.html'), 'utf8'), 'text/html; charset=utf-8');
    if (url.pathname === '/chat' && req.method === 'POST') {
      const text = String((await readBody(req)).text || '').trim().slice(0, 4000);
      if (!text) return send(res, 400, { error: 'Say something first' });
      if (chatting) return send(res, 409, { error: 'She is still answering' });
      chatting = true;
      try { return send(res, 200, { text: WIZRA === 'brenai' ? await askBrenai(text) : await askLocal(text) }); }
      catch (e) { return send(res, 200, { error: String(e.message || e) }); }
      finally { chatting = false; }
    }
    if (url.pathname === '/') {
      const s = `<!doctype html><meta name=viewport content="width=device-width"><title>Brene relay</title><body style="font:18px system-ui;background:#111;color:#eee;padding:20px">
<h2>Brene relay</h2><p>Glasses helper: <b>${bridgeUp ? 'connected' : 'not running'}</b>${pose.at && Date.now() - pose.at < 1000 ? (pose.pos ? ' (6DOF)' : ' (3DOF)') : ''}</p>
<p>Hands: <b>${Date.now() - handsAt < 500 ? hands.length + ' tracked' : 'off'}</b> <a style="color:#9cf" href="/hands">open hand tracking</a></p>
<p><a style="color:#9cf;font-size:22px" href="/library">Open the library</a></p><p>Wizra: <b>${WIZRA === 'brenai' ? 'brenai.fly.dev (your save)' : 'LM Studio on this PC'}</b></p></body>`;
      return send(res, 200, s, 'text/html; charset=utf-8');
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: String(e.message || e) }); }
});
async function libRoute(req, res, url) {
  const q = Object.fromEntries(url.searchParams);
  if (url.pathname === '/library') return send(res, 200, fs.readFileSync(path.join(HERE, 'library.html'), 'utf8'), 'text/html; charset=utf-8');
  if (url.pathname === '/vam' && req.method === 'POST') { lib.report(await readBody(req)); return send(res, 200, { ok: true }); }
  if (url.pathname === '/lib/state') return send(res, 200, { vam: lib.vamState(), folder: lib.vamDir, scanned: lib.scanned, scanning: !!lib.scanning, error: lib.scanError, counts: Object.fromEntries(['scene', 'look', 'pose', 'skin', 'hair', 'clothing'].map(k => [k, lib.items.filter(i => i.kind === k).length])) });
  if (url.pathname === '/lib/folder' && req.method === 'POST') { await lib.setVam((await readBody(req)).folder); return send(res, 200, { ok: true, folder: lib.vamDir }); }
  if (url.pathname === '/lib/rescan' && req.method === 'POST') { await lib.scan(); return send(res, 200, { ok: true }); }
  if (url.pathname === '/lib/items') return send(res, 200, lib.list({ kind: q.kind, q: q.q, filter: q.filter, limit: Math.max(1, Math.min(600, +q.limit || 600)) }));
  if (url.pathname === '/lib/thumb') { const b = await lib.thumb(q.p); if (!b) return send(res, 404, 'none', 'text/plain'); res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' }); return res.end(b); }
  if (url.pathname === '/lib/fav' && req.method === 'POST') { const b = await readBody(req); return send(res, 200, { fav: lib.fav(String(b.path || ''), !!b.on) }); }
  if (url.pathname === '/lib/open' && req.method === 'POST') {
    const b = await readBody(req); if (!['scene', 'look', 'pose', 'skin', 'hair', 'clothing'].includes(b.kind) || typeof b.path !== 'string') return send(res, 400, { error: 'what?' });
    const c = lib.queue({ kind: b.kind, path: b.path, person: String(b.person || ''), merge: !!b.merge });
    return send(res, 200, { id: c.id, vam: lib.vamState().connected });
  }
  if (url.pathname === '/lib/result') return send(res, 200, lib.results.get(+q.id) || { pending: true });
  if (url.pathname === '/lib/hub') return send(res, 200, await lib.hubList({ q: q.q || '', sort: q.sort || 'Hot Picks', type: q.type || '', page: +q.page || 1 }));
  if (url.pathname === '/lib/hub/item') return send(res, 200, await lib.hubItem(q.id));
  if (url.pathname === '/lib/hub/install' && req.method === 'POST') { const j = lib.install((await readBody(req)).id); return send(res, 200, { job: j.id }); }
  if (url.pathname === '/lib/hub/job') { const j = lib.jobs.get(+q.id); return send(res, j ? 200 : 404, j || { error: 'no such job' }); }
  return send(res, 404, { error: 'not found' });
}

server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Library: http://127.0.0.1:${PORT}/library` + (LAN ? `   On your phone: http://<this PC's address>:${PORT}/library?k=${KEY}` : ''));
  console.log(`Brene relay on http://127.0.0.1:${PORT}  (Wizra: ${WIZRA === 'brenai' ? 'brenai.fly.dev' : 'LM Studio ' + LMSTUDIO})`);
  console.log(`Hand tracking page: http://127.0.0.1:${PORT}/hands   Glasses helper expected on ${BRIDGE}`);
});
