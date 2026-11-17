// Brenai: a one-person chat with Wizra, a persona running on Claude.
// No framework: node:http serves public/ and three API routes.
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
import { PERSONA, SHEET_DEFAULT, SETTINGS_DEFAULT, STATE_BLOCK, LEARN_PROMPT } from './persona.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(here, 'data');
const STORE = path.join(DATA_DIR, 'brenai.json');
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const EFFORT = process.env.EFFORT || 'low'; // chat: low is fast and cheap; raise for deeper research
const PASSWORD = process.env.APP_PASSWORD || ''; // empty = no login (local only)
const USER_NAME = process.env.USER_NAME || 'Andrew';
const COMPACT_AT = Number(process.env.COMPACT_AT || 600000); // tokens of history before old turns get summarized
const LEARN_EVERY = Number(process.env.LEARN_EVERY || 6); // user messages between profile updates

const client = new Anthropic();

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

async function reply(userText, onDelta) {
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
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: LEARN_PROMPT(USER_NAME, db.profile, db.sheet, db.settings, recent) }],
  });
  if (res.stop_reason === 'refusal') return;
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
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
  for (const k of ['sfw', 'bleep', 'cussDevelop']) if (typeof s[k] === 'boolean') S[k] = s[k];
  const h = body.sheet || {}, H = db.sheet;
  for (const k of ['birthday', 'backstory']) if (typeof h[k] === 'string') H[k] = h[k].slice(0, 4000);
  for (const k of ['likes', 'dislikes']) if (Array.isArray(h[k])) H[k] = h[k].map(String).map(x => x.trim()).filter(Boolean).slice(0, 60);
  if (Array.isArray(h.hiddenLikes)) H.hiddenLikes = h.hiddenLikes.filter(x => x && String(x.text || '').trim()).slice(0, 60).map(x => ({ text: String(x.text).trim().slice(0, 200), revealed: !!x.revealed, ...(x.grown ? { grown: true } : {}) }));
  if (Number.isFinite(+h.rapport)) H.rapport = Math.max(0, Math.min(100, Math.round(+h.rapport)));
  if (Number.isFinite(+h.cussLevel)) H.cussLevel = Math.max(0, Math.min(3, Math.round(+h.cussLevel)));
  save();
}

// ---------- http ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
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

      if (url.pathname === '/api/state') return json(res, 200, { log: db.log, name: USER_NAME, settings: db.settings });

      if (url.pathname === '/api/settings') {
        if (req.method === 'POST') applySettings(await readBody(req));
        return json(res, 200, { settings: db.settings, sheet: db.sheet });
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
        db.log.push({ who: 'me', text: msg, at: Date.now() });
        try {
          const full = await reply(msg, d => send({ t: 'delta', d }));
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
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    console.error('[http]', e.message);
    if (!res.headersSent) json(res, 500, { error: e.message }); else res.end();
  }
});
server.listen(PORT, () => console.log(`brenai on :${PORT} model=${MODEL} effort=${EFFORT} login=${PASSWORD ? 'on' : 'off'}`));
