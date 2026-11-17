// Brenai: a one-person chat with Wizra. Her brain is the model on Andrew's PC (Bionic, formerly LM Studio), reached the way
// Breneland's townsfolk are: a bridge on the PC (bridge/wizra-bridge.mjs) connects OUT to this server's /brain socket and
// answers jobs. If the bridge is offline and ANTHROPIC_API_KEY is set, Claude answers instead; otherwise she is offline.
// No framework: node:http serves public/ and the API routes below.
//   GET  /api/brain   -> { online, model, served, failed } (no login needed)
//   GET  /api/state   -> { log, name }            (the chat log to redraw the page)
//   POST /api/chat    -> SSE stream of Wizra's reply ({t:"delta"}, {t:"done"}, {t:"error"})
//   POST /api/reset   -> clears the conversation (keeps what she learned about you)
//   GET/POST /api/settings -> { settings, sheet } (the wheel on her portrait)
// Everything persists in DATA_DIR/brenai.json (a Fly volume in production).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { WebSocketServer } from 'ws';
import { PERSONA, SHEET_DEFAULT, SETTINGS_DEFAULT, STATE_BLOCK, LEARN_PROMPT } from './persona.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(here, 'data');
const STORE = path.join(DATA_DIR, 'brenai.json');
const AVATAR = path.join(DATA_DIR, 'avatar.vrm');
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const EFFORT = process.env.EFFORT || 'low'; // chat: low is fast and cheap; raise for deeper research
const PASSWORD = process.env.APP_PASSWORD || ''; // empty = no login (local only)
const USER_NAME = process.env.USER_NAME || 'Andrew';
const COMPACT_AT = Number(process.env.COMPACT_AT || 600000); // tokens of history before old turns get summarized
const LEARN_EVERY = Number(process.env.LEARN_EVERY || 6); // user messages between profile updates

const BRAIN_TOKEN = process.env.BRENAI_BRAIN_TOKEN || ''; // shared secret with the bridge on the PC
const CONTEXT_TOKENS = Number(process.env.CONTEXT_TOKENS || 32768); // the context length the model is loaded with in Bionic
const REPLY_TOKENS = Number(process.env.REPLY_TOKENS || 700);
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// ---------- the PC brain (bridge over a WebSocket) ----------
const brain = { ws: null, model: '', served: 0, failed: 0, since: 0, tts: false, voices: [] };
const jobs = new Map(); let jobId = 1;
function brainJob({ stream, ...job }, onDelta) {
  return new Promise((resolve, reject) => {
    if (!brain.ws) return reject(new Error('offline'));
    const id = jobId++;
    const timer = setTimeout(() => { jobs.delete(id); reject(new Error('Your PC took too long to answer.')); }, 180000);
    jobs.set(id, { resolve, reject, onDelta, timer });
    brain.ws.send(JSON.stringify({ t: 'job', id, ...job, stream: !!stream }));
  });
}
function endJob(id, err, text) {
  const j = jobs.get(id); if (!j) return;
  clearTimeout(j.timer); jobs.delete(id);
  if (err) { brain.failed++; j.reject(new Error(err)); } else { brain.served++; j.resolve(text); }
}
function onBrainSocket(ws) {
  let authed = false;
  const kill = setTimeout(() => { if (!authed) ws.close(); }, 10000);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(String(raw)); } catch { return; }
    if (!authed) {
      if (m.t !== 'auth') return;
      if (!BRAIN_TOKEN || m.token !== BRAIN_TOKEN) { ws.send(JSON.stringify({ t: 'refused', why: 'token' })); return ws.close(); }
      authed = true; clearTimeout(kill);
      if (brain.ws) { try { brain.ws.send('{"t":"replaced"}'); brain.ws.close(); } catch {} }
      Object.assign(brain, { ws, model: String(m.model || '').slice(0, 80), since: Date.now(), v: Number(m.v) || 1 });
      ws.send('{"t":"welcome"}');
      console.log('[brain] bridge connected', brain.model);
      return;
    }
    if (m.t === 'delta') { const j = jobs.get(m.id); if (j && j.onDelta && typeof m.d === 'string') j.onDelta(m.d); }
    else if (m.t === 'done') endJob(m.id, null, String(m.text || ''));
    else if (m.t === 'caps') { brain.voiceState = String(m.voiceState || (m.tts ? 'on' : '')).slice(0, 200); brain.tts = !!m.tts; brain.voices = Array.isArray(m.voices) ? m.voices.slice(0, 80).map(v => ({ id: String(v.id).slice(0, 30), name: String(v.name).slice(0, 30), lang: String(v.lang).slice(0, 8), gender: String(v.gender).slice(0, 10) })) : []; console.log('[brain] voice:', brain.voiceState, brain.voices.length, 'voices'); }
    else if (m.t === 'audio') { const j = jobs.get(m.id); if (j) { clearTimeout(j.timer); jobs.delete(m.id); j.resolve(String(m.wav || '')); } }
    else if (m.t === 'fail') endJob(m.id, 'Your PC could not answer (' + String(m.why || 'error').slice(0, 60) + '). Is Bionic running with the model loaded?');
  });
  ws.on('close', () => {
    if (brain.ws !== ws) return;
    brain.ws = null; brain.tts = false; brain.voices = []; brain.voiceState = ''; console.log('[brain] bridge disconnected');
    for (const id of [...jobs.keys()]) endJob(id, 'Your PC went offline mid-answer.');
  });
  ws.on('error', () => {});
}

// Slider 0..100 -> a real sampling temperature for the local model.
// One spoken line: the PC's Kokoro voice turns it into a WAV (base64 over the socket).
function ttsJob(text, voice, speed) {
  return new Promise((resolve, reject) => {
    if (!brain.ws || !brain.tts) return reject(new Error('no voice'));
    const id = jobId++;
    const timer = setTimeout(() => { jobs.delete(id); reject(new Error('voice timeout')); }, 45000);
    jobs.set(id, { resolve, reject, timer });
    brain.ws.send(JSON.stringify({ t: 'tts', id, text, voice, speed }));
  });
}
const tempOf = v => +(0.3 + (Math.max(0, Math.min(100, v)) / 100) * 0.9).toFixed(2);
// rough token count (about 4 characters a token) to keep the chat inside the loaded context
const toks = s => Math.ceil(String(s).length / 3.6);

// ---------- store ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { history: [], log: [], profile: '', sinceLearn: 0 };
try { db = { ...db, ...JSON.parse(fs.readFileSync(STORE, 'utf8')) }; } catch {}
db.settings = { ...SETTINGS_DEFAULT, ...(db.settings || {}) };
db.sheet = { ...structuredClone(SHEET_DEFAULT), ...(db.sheet || {}) };
function save() {
  const tmp = STORE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, STORE);
}

// ---------- auth (one shared password, signed cookie) ----------
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('brenai:' + PASSWORD).digest('hex');
const token = () => crypto.createHmac('sha256', SECRET).update('ok').digest('hex');
function authed(req) {
  if (!PASSWORD) return true;
  const m = /(?:^|;\s*)brenai=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return !!m && m[1] === token();
}

// ---------- the model call ----------
function systemBlocks() {
  // Stable first so the cache holds; this only changes when settings, the sheet or the notes change.
  const blocks = [{ type: 'text', text: PERSONA(USER_NAME) }, { type: 'text', text: STATE_BLOCK(USER_NAME, db.settings, db.sheet) }];
  if (db.profile) {
    blocks.push({ type: 'text', text: `What you have picked up about ${USER_NAME} so far (your own private notes; use them, never recite them):\n${db.profile}` });
  }
  return blocks;
}

// After a mid-output fallback, thinking blocks before the last fallback block must not be echoed back.
function echoable(content) {
  const lastFb = content.map(b => b.type).lastIndexOf('fallback');
  if (lastFb < 0) return content;
  return content.filter((b, i) => i > lastFb || !['thinking', 'redacted_thinking', 'tool_use'].includes(b.type));
}

const STAMP = () => new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const systemText = () => systemBlocks().map(b => b.text).join('\n\n');

// The local model gets the log as plain turns, newest kept, oldest dropped to fit the loaded context.
// Mistral-family chat templates paste the system prompt onto the NEWEST user message, so the model answered her character
// sheet instead of what he said. So no system prompt here: the sheet goes in as the very first turn, marked as setup, and
// his newest message is sent bare (no timestamp, no reminder; she was replying to those too).
function setupText() {
  const d = new Date(), tz = { timeZone: 'America/New_York' };
  const hour = Number(d.toLocaleString('en-US', { ...tz, hour: 'numeric', hour12: false })) % 24;
  const part = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'late night';
  const day = d.toLocaleString('en-US', { ...tz, weekday: 'long', month: 'long', day: 'numeric' });
  return `[SETUP. Background for a chat roleplay. This is not a message from ${USER_NAME}; never reply to it or mention it.]\n\n${systemText()}\n\nIt is ${day}, ${part}.\n\n[END OF SETUP. From here on every message is ${USER_NAME} talking to you. Answer what he just said or did, as Wizra, and nothing else.]`;
}
// ---- silent touches: what he did to the avatar since her last reply. Never shown in the chat; she just knows. ----
const TOUCH = { poke: ['pokes her cheek', 'pokes her cheek %n times'], boop: ['boops her nose', 'boops her nose %n times'], pat: ['pats her on the head', 'pats her on the head %n times'],
  petEnd: ['strokes her hair', 'strokes her hair for a while'], swat: ['swats at her', 'swats at her %n times'], body: ['tugs at her hoodie', 'tugs at her hoodie %n times'], spam: ['keeps poking her over and over', 'will not stop poking her'] };
let touches = [];
function takeTouches() {
  const fresh = touches.filter(t => Date.now() - t.at < 15 * 60000); touches = [];
  const n = {}; for (const t of fresh) n[t.kind] = (n[t.kind] || 0) + 1;
  return Object.keys(n).map(k => TOUCH[k][n[k] > 1 ? 1 : 0].replace('%n', n[k])).join(', ');
}
// a log entry as the model sees it: the silent touches ride in front of his words as an action
const withPre = e => (e.pre ? `*${e.pre}* ` : '') + e.text;

async function replyLocal(userText, onDelta) {
  const setup = setupText();
  let budget = CONTEXT_TOKENS - toks(setup) - REPLY_TOKENS - 200;
  const L = LENGTHS[db.settings.length] || LENGTHS.short;
  const turns = [{ role: 'user', content: withPre(db.log[db.log.length - 1]) }];
  budget -= toks(turns[0].content);
  for (let i = db.log.length - 2; i >= 0 && budget > 0; i--) { // the last log entry is this message
    const e = db.log[i], t = { role: e.who === 'me' ? 'user' : 'assistant', content: withPre(e) };
    budget -= toks(t.content); if (budget < 0) break;
    turns.unshift(t);
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  turns.unshift({ role: 'user', content: setup }, { role: 'assistant', content: '(ready)' });
  const system = '';
  const text = await brainJob({ system, messages: turns, max_tokens: L.tokens, temperature: tempOf(db.settings.temperature), stream: true,
    repeat_penalty: 1.12, frequency_penalty: 0.35, presence_penalty: 0.25, stop: [`\n${USER_NAME}:`, '\nUser:', '\n['] }, onDelta);
  return trimLength(dropRepeats(cleanLocal(text)), L);
}
const LENGTHS = { // tokens: hard cap on the model; say/act: how many spoken sentences and actions survive the trim
  short: { tokens: 90, say: 2, act: 1 },
  medium: { tokens: 220, say: 5, act: 2 },
  long: { tokens: 600, say: 99, act: 9 },
};
// "*waves* hey. how are you?" -> ['*waves*', ' hey.', ' how are you?']
const units = t => String(t).match(/\*[^*]+\*|[^*.!?\n]+[.!?]*["')\]]*\s*|\n+/g) || [];
const norm = u => u.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Whatever the model wrote, only the first few sentences and actions are kept (roleplay models pad).
function trimLength(text, L) {
  let say = 0, act = 0; const out = [];
  for (const u of units(text)) {
    if (!u.trim()) { out.push(u); continue; }
    if (u.trim().startsWith('*')) { if (act++ < L.act) out.push(u); } else if (say++ < L.say) out.push(u); else break;
  }
  return out.join('').trim() || text;
}
// Cut any sentence or action she already used, word for word, in her last few replies.
function dropRepeats(text) {
  const seen = new Set();
  for (const e of db.log.filter(e => e.who === 'her').slice(-8)) for (const u of units(e.text)) { const n = norm(u); if (n.length > 5 && n.includes(' ')) seen.add(n); }
  const kept = units(text).filter(u => !seen.has(norm(u))).join('').trim();
  return kept.length >= 2 ? kept : text;
}
// roleplay models sometimes prefix the speaker or run on into his line: trim both
function cleanLocal(t) {
  t = String(t).replace(/^\s*\(ready\)\s*/i, '').replace(/^\s*wizra\s*:\s*/i, '');
  const cut = t.search(new RegExp('\\n\\s*' + USER_NAME + '\\s*:', 'i'));
  t = (cut > 0 ? t.slice(0, cut) : t).replace(/\n\s*\[[^\]]*$/, '').trim();
  // cut off by the length cap: drop the unfinished action, then the unfinished sentence
  if ((t.match(/\*/g) || []).length % 2) { const c = t.slice(0, t.lastIndexOf('*')).trim(); t = c.length > 20 ? c : t + '*'; }
  if (t && !/[.!?*"')\u2026~]$/.test(t)) { const m = t.match(/^[\s\S]*[.!?*"')\u2026]/); if (m && m[0].length > 20) t = m[0]; }
  return t.trim();
}

async function reply(userText, onDelta) {
  if (brain.ws) return replyLocal(userText, onDelta);
  if (client) return replyClaude(userText, onDelta);
  throw new Error('Wizra is offline: the bridge on your PC is not connected. Start Bionic and the bridge (brenai/bridge/README.md).');
}

async function replyClaude(userText, onDelta) {
  // The time rides on the user turn (not the system prompt) so the cached prefix stays the same between messages.
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  db.history.push({ role: 'user', content: [{ type: 'text', text: `[${now} Eastern]` }, { type: 'text', text: userText }] });
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['compact-2026-01-12', 'server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT },
    cache_control: { type: 'ephemeral' },
    context_management: { edits: [{ type: 'compact_20260112', trigger: { type: 'input_tokens', value: COMPACT_AT } }] },
    system: systemBlocks(),
    messages: db.history,
  });
  stream.on('text', d => onDelta(d));
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') {
    db.history.pop(); // keep the history valid; the refused turn is not kept
    throw new Error('She would not answer that one (the model refused).');
  }
  db.history.push({ role: 'assistant', content: echoable(msg.content) });
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

// Every few messages, a short side call updates her notes on how the user talks and what they like.
async function learn() {
  const recent = db.log.slice(-40).map(e => `${e.who === 'me' ? USER_NAME : 'Wizra'}: ${e.text}`).join('\n');
  const prompt = LEARN_PROMPT(USER_NAME, db.profile, db.sheet, db.settings, recent);
  let text;
  if (brain.ws) {
    text = await brainJob({ system: 'You are a careful note keeper. Output only valid JSON.', messages: [{ role: 'user', content: prompt }], max_tokens: 900, temperature: 0.3 });
  } else if (client) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 8000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt }] });
    if (res.stop_reason === 'refusal') return;
    text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } else return;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return;
  let out; try { out = JSON.parse(m[0]); } catch { return; }
  const sh = db.sheet;
  if (typeof out.notes === 'string' && out.notes.trim()) db.profile = out.notes.trim().slice(0, 6000);
  const d = Math.max(-8, Math.min(8, Math.round(Number(out.rapport_delta) || 0)));
  sh.rapport = Math.max(0, Math.min(100, sh.rapport + d));
  for (const i of Array.isArray(out.revealed) ? out.revealed : []) if (sh.hiddenLikes[i]) sh.hiddenLikes[i].revealed = true;
  const nl = typeof out.new_hidden_like === 'string' ? out.new_hidden_like.trim() : '';
  if (nl && d > 0 && sh.hiddenLikes.length < 30 && !sh.hiddenLikes.some(h => h.text.toLowerCase() === nl.toLowerCase())) sh.hiddenLikes.push({ text: nl.slice(0, 200), revealed: false, grown: true });
  const c = Math.round(Number(out.cuss_level));
  if (db.settings.cussDevelop && Number.isFinite(c) && c === sh.cussLevel + 1 && sh.rapport >= 60) sh.cussLevel = c;
  save();
  console.log(`[learn] rapport ${sh.rapport} (${d >= 0 ? '+' : ''}${d}) cuss ${sh.cussLevel}${nl ? ' new secret like' : ''}`);
}

// Only known fields, sane types; the sheet is fully editable from the wheel.
function applySettings(body) {
  const s = body.settings || {}, S = db.settings;
  const MOODS = ['auto', 'happy', 'playful', 'chill', 'tired', 'grumpy', 'sad', 'excited', 'anxious', 'focused'];
  if (MOODS.includes(s.mood)) S.mood = s.mood;
  for (const k of ['expressiveness', 'temperature']) if (Number.isFinite(+s[k])) S[k] = Math.max(0, Math.min(100, Math.round(+s[k])));
  if (['short', 'medium', 'long'].includes(s.length)) S.length = s.length;
  if (typeof s.ttsVoice === 'string' && /^[a-z]{2}_[a-z0-9_]{1,24}$/.test(s.ttsVoice)) S.ttsVoice = s.ttsVoice;
  if (s.avatarKind === 'puppet' || (s.avatarKind === 'vrm' && fs.existsSync(AVATAR))) S.avatarKind = s.avatarKind;
  if (Array.isArray(s.acts)) S.acts = s.acts.filter(x => Array.isArray(x)).map(x => [String(x[0] || '').trim().slice(0, 20), String(x[1] || '').replace(/\*/g, '').trim().slice(0, 140)]).filter(x => x[0] && x[1]).slice(0, 16);
  for (const k of ['sfw', 'bleep', 'cussDevelop']) if (typeof s[k] === 'boolean') S[k] = s[k];
  if (typeof body.notes === 'string') db.profile = body.notes.slice(0, 6000);
  const h = body.sheet || {}, H = db.sheet;
  for (const k of ['birthday', 'backstory']) if (typeof h[k] === 'string') H[k] = h[k].slice(0, 4000);
  for (const k of ['likes', 'dislikes']) if (Array.isArray(h[k])) H[k] = h[k].map(String).map(x => x.trim()).filter(Boolean).slice(0, 60);
  if (Array.isArray(h.hiddenLikes)) H.hiddenLikes = h.hiddenLikes.filter(x => x && String(x.text || '').trim()).slice(0, 60).map(x => ({ text: String(x.text).trim().slice(0, 200), revealed: !!x.revealed, ...(x.grown ? { grown: true } : {}) }));
  if (Number.isFinite(+h.rapport)) H.rapport = Math.max(0, Math.min(100, Math.round(+h.rapport)));
  if (Number.isFinite(+h.cussLevel)) H.cussLevel = Math.max(0, Math.min(3, Math.round(+h.cussLevel)));
  save();
}

// ---------- http ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

let busy = false;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (url.pathname === '/api/brain') return json(res, 200, { online: !!brain.ws, model: brain.model, served: brain.served, failed: brain.failed, upMin: brain.since && brain.ws ? Math.round((Date.now() - brain.since) / 60000) : 0, fallback: !brain.ws && !!client, bridge: brain.ws ? brain.v : 0, bridgeLatest: 4, tts: brain.tts, voices: brain.voices, voiceState: brain.ws ? (brain.voiceState || (brain.v < 3 ? 'the bridge on the PC is an old version' : 'not reported yet')) : 'the PC bridge is offline' });

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { password } = await readBody(req);
      if (!PASSWORD || password === PASSWORD) {
        res.writeHead(200, { 'set-cookie': `brenai=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`, 'content-type': 'application/json' });
        return res.end('{"ok":true}');
      }
      return json(res, 401, { error: 'wrong password' });
    }

    if (url.pathname.startsWith('/api/')) {
      if (!authed(req)) return json(res, 401, { error: 'login' });

      if (url.pathname === '/api/state') return json(res, 200, { log: db.log.map(({ pre, ...e }) => e), name: USER_NAME, settings: db.settings });

      if (url.pathname === '/api/settings') {
        if (req.method === 'POST') applySettings(await readBody(req));
        return json(res, 200, { settings: db.settings, sheet: db.sheet, notes: db.profile });
      }

      // Her 3D model (.vrm): kept on the volume, served only to someone logged in, replaceable from the wheel.
      if (url.pathname === '/api/avatar') {
        if (req.method === 'GET') {
          if (!fs.existsSync(AVATAR)) return json(res, 404, { error: 'no model' });
          res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': fs.statSync(AVATAR).size, 'cache-control': 'private, max-age=31536000, immutable' });
          return fs.createReadStream(AVATAR).pipe(res);
        }
        if (req.method === 'POST') {
          const tmp = AVATAR + '.upload'; let size = 0, magic = null, tooBig = false;
          const out = fs.createWriteStream(tmp);
          await new Promise((resolve, reject) => {
            req.on('data', c => { if (!magic) magic = c.subarray(0, 4).toString('latin1'); size += c.length; if (size > 120e6) { tooBig = true; req.destroy(); out.destroy(); resolve(); } });
            req.pipe(out); out.on('finish', resolve); out.on('error', reject); req.on('error', reject);
          });
          if (tooBig || magic !== 'glTF' || size < 1000) { fs.rmSync(tmp, { force: true }); return json(res, 400, { error: tooBig ? 'That file is over 120 MB.' : 'That is not a .vrm model file.' }); }
          fs.renameSync(tmp, AVATAR);
          Object.assign(db.settings, { avatarKind: 'vrm', avatarV: Date.now(), avatarName: decodeURIComponent(String(req.headers['x-name'] || 'model.vrm')).slice(0, 80) });
          save();
          return json(res, 200, { settings: db.settings });
        }
      }

      if (url.pathname === '/api/tts' && req.method === 'POST') {
        const { text } = await readBody(req);
        const line = String(text || '').trim().slice(0, 800);
        if (!line) return json(res, 400, { error: 'empty' });
        try {
          const wav = Buffer.from(await ttsJob(line, db.settings.ttsVoice || 'af_heart', 1), 'base64');
          res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length, 'cache-control': 'no-store' });
          return res.end(wav);
        } catch (e) { return json(res, 503, { error: e.message }); }
      }

      if (url.pathname === '/api/touch' && req.method === 'POST') {
        const { kind } = await readBody(req);
        if (TOUCH[kind] && touches.length < 40) touches.push({ kind, at: Date.now() });
        return json(res, 200, { ok: true });
      }

      if (url.pathname === '/api/reset' && req.method === 'POST') {
        db.history = []; db.log = []; db.sinceLearn = 0; save();
        return json(res, 200, { ok: true });
      }

      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const { text } = await readBody(req);
        const msg = String(text || '').trim().slice(0, 20000);
        if (!msg) return json(res, 400, { error: 'empty' });
        if (busy) return json(res, 409, { error: 'She is still answering.' });
        busy = true;
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
        const pre = takeTouches();
        db.log.push({ who: 'me', text: msg, at: Date.now(), ...(pre ? { pre } : {}) });
        try {
          const full = await reply(pre ? `*${pre}* ${msg}` : msg, d => send({ t: 'delta', d }));
          db.log.push({ who: 'her', text: full, at: Date.now() });
          db.sinceLearn++;
          save();
          send({ t: 'done', text: full });
          if (db.sinceLearn >= LEARN_EVERY) { db.sinceLearn = 0; learn().catch(e => console.error('[learn]', e.message)); }
        } catch (e) {
          console.error('[chat]', e.status || '', e.message);
          db.log.pop(); save();
          send({ t: 'error', error: e instanceof Anthropic.APIError ? `API error ${e.status ?? ''}: ${e.message}` : e.message });
        } finally {
          busy = false;
          res.end();
        }
        return;
      }
      return json(res, 404, { error: 'not found' });
    }

    // static files
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p) p = 'index.html';
    const file = path.join(here, 'public', p);
    if (!file.startsWith(path.join(here, 'public'))) return json(res, 403, { error: 'no' });
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...(p.startsWith('vendor') ? { 'cache-control': 'public, max-age=604800' } : {}) });
      res.end(data);
    });
  } catch (e) {
    console.error('[http]', e.message);
    if (!res.headersSent) json(res, 500, { error: e.message }); else res.end();
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 24 << 20 });
server.on('upgrade', (req, sock, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/brain') return sock.destroy();
  wss.handleUpgrade(req, sock, head, ws => onBrainSocket(ws));
});
server.listen(PORT, () => console.log(`brenai on :${PORT} brain=${BRAIN_TOKEN ? 'bridge' : 'NO TOKEN'} claude-fallback=${client ? 'on' : 'off'} login=${PASSWORD ? 'on' : 'off'}`));
