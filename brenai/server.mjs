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
import { detectLeave, detectPlan, outcome, glowNote, clock, sceneFor, picksUp, callNote, HANGUP, COMING, detectInvite } from './away.mjs';
import { wantsPic, selfie, thing, chatChance, awayChance, picNote, candidates } from './pics.mjs';
import { PERSONA, SHEET_DEFAULT, SETTINGS_DEFAULT, STATE_BLOCK, LEARN_PROMPT } from './persona.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(here, 'data');
const STORE = path.join(DATA_DIR, 'brenai.json');
const AVATAR = path.join(DATA_DIR, 'avatar.vrm');
const ANIMS = path.join(DATA_DIR, 'anims.json');
const PACK = path.join(DATA_DIR, 'pack');             // the ready-made picture pack (tools/picpack): manifest.json + images
let pack = []; const loadPack = () => { try { pack = JSON.parse(fs.readFileSync(path.join(PACK, 'manifest.json'), 'utf8')); } catch { pack = []; } }; loadPack();
const sent = () => (db.sentPics || []), noteSent = spec => { if (spec && spec.file) db.sentPics = [...sent(), spec.file].slice(-45); return spec; };
// Which picture: the server finds a few that fit (where she is, how close they are, what they are to each other) and SHE picks,
// in a short side question to her model with the last few lines of the conversation. No answer, or nonsense: the first one.
async function choosePic(ctx) {
  const opts = candidates(pack, { ...ctx, recent: sent() }); if (!opts.length) return null; if (opts.length === 1) return noteSent(opts[0]);
  let pickN = 0;
  try {
    const recent = db.log.filter(e => e.who !== 'sys' && e.text).slice(-6).map(e => `${e.who === 'me' ? USER_NAME : 'Wizra'}: ${e.text}`).join('\n');
    const ask = `You are Wizra (22, goth, dry, plays D&D). You are about to send ${USER_NAME} a picture${ctx.ask ? ' because he asked for one' : ctx.home ? ' on a whim' : ' from where you are'}. Rapport with him: ${db.sheet.rapport}/100${db.sheet.path ? ', and what you two are: ' + db.sheet.path : ''}.\n\nThe last things said:\n${recent || '(nothing yet)'}\n\nPictures you could send:\n${opts.map((o, i) => `${i + 1}. ${o.desc}`).join('\n')}\n\nWhich one do you send? Answer with the number only.`;
    let text = '';
    if (brain.ws) text = await brainJob({ system: 'Answer with a single number.', messages: [{ role: 'user', content: ask }], max_tokens: 8, temperature: 0.7 });
    else if (client) { const res = await client.messages.create({ model: MODEL, max_tokens: 2000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: ask }] }); text = res.content.filter(b => b.type === 'text').map(b => b.text).join(''); }
    const m = /[1-9]/.exec(String(text)); if (m && opts[+m[0] - 1]) pickN = +m[0] - 1;
    console.log(`[pic] she chose ${pickN + 1} of ${opts.length}${m ? '' : ' (no clear answer, took the first)'}`);
  } catch (e) { console.error('[pic] choosing:', e.message); }
  return noteSent(opts[pickN]);
}
const PICS = path.join(DATA_DIR, 'pics');             // the pictures she has sent, once a page has drawn them   // her motion clips (made from licensed animation files, so kept on the volume, not in the repo)
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const EFFORT = process.env.EFFORT || 'low'; // chat: low is fast and cheap; raise for deeper research
const PASSWORD = process.env.APP_PASSWORD || ''; // empty = no login (local only)
const USER_NAME = process.env.USER_NAME || 'Andrew';
const COMPACT_AT = Number(process.env.COMPACT_AT || 600000); // tokens of history before old turns get summarized
const LEARN_EVERY = Number(process.env.LEARN_EVERY || 6); // user messages between profile updates

const BRAIN_TOKEN = process.env.BRENAI_BRAIN_TOKEN || ''; // shared secret with the bridge on the PC
const CONTEXT_TOKENS = Number(process.env.CONTEXT_TOKENS || 32768); // the context length the model is loaded with in Bionic
const REPLY_TOKENS = Number(process.env.REPLY_TOKENS || 700);
const AWAY_SPEED = Number(process.env.AWAY_SPEED || 1);  // tests: how many times faster her outings and the after-effects run
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
// Her voice, sooner: lines are voiced ahead of the page asking for them. The first sentence is sent to the PC as soon as
// it is complete in the model's stream, the rest the moment the reply is final; the page's requests then find them ready
// (or already on the way). Keys ignore punctuation and case, so small differences in how the page cuts the text do not matter.
const ttsCache = new Map(); const ttsKey = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function voiced(line) {
  const voice = db.settings.ttsVoice || 'af_heart', words = ttsKey(line); if (!words) return Promise.reject(new Error('empty'));
  const key = voice + '|' + words;                       // the same words in another voice are a different recording
  const hit = ttsCache.get(key); if (hit && Date.now() - hit.at < 90000) return hit.p;
  const t0 = Date.now();
  const p = ttsJob(line, voice, 1).then(w => { const ms = Date.now() - t0; brain.ttsMs = brain.ttsMs ? Math.round(brain.ttsMs * 0.7 + ms * 0.3) : ms; return w; });
  p.catch(() => ttsCache.delete(key));
  ttsCache.set(key, { p, at: Date.now() }); if (ttsCache.size > 24) ttsCache.delete(ttsCache.keys().next().value);
  return p;
}
// what she says out loud, cut the way the page cuts it: no actions, no quote marks, no "She does this." narration
function speechChunks(text) {
  // dots used as a pause ("well.. what do you think?") become a comma: one flowing line with a short breath, not two clips
  const t = String(text).replace(/\s*(?:\.{2,}|\u2026)+\s*/g, ', ').replace(/\s*[\u2014\u2013]\s*|\s+-\s+/g, ', ').replace(/,(\s*,)+/g, ',').replace(/,\s*([.!?])/g, '$1').replace(/^[,\s]+|[,\s]+$/g, '');
  const parts = (t.match(/[^.!?\n]+[.!?]*["')]*\s*/g) || []).map(x => x.trim()).filter(Boolean);
  const out = []; for (const p of parts) { if (out.length && out[out.length - 1].length < 55) out[out.length - 1] += ' ' + p; else out.push(p); } // short sentences ride together, so there is no gap between them
  return out;
}
const spokenLines = text => speechChunks((String(text).replace(/\*[^*]*\*/g, ' ').replace(/["\u201c\u201d]/g, '').match(/[^.!?\u2026\n]+[.!?\u2026]*["')]*\s*/g) || []).map(x => x.trim()).filter(x => x && !/^(she|wizra)\s+[a-z']+(s|ed)\b/i.test(x)).join(' '));
function prewarm(text) { if (brain.ws && brain.tts) for (const line of spokenLines(text).slice(0, 4)) voiced(line).catch(() => {}); }
const tempOf = v => +(0.3 + (Math.max(0, Math.min(100, v)) / 100) * 0.9).toFixed(2);
// rough token count (about 4 characters a token) to keep the chat inside the loaded context
const toks = s => Math.ceil(String(s).length / 3.6);

// ---------- store ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { history: [], log: [], profile: '', sinceLearn: 0 };
try { db = { ...db, ...JSON.parse(fs.readFileSync(STORE, 'utf8')) }; } catch {}
db.settings = { ...SETTINGS_DEFAULT, ...(db.settings || {}) };
db.sheet = { ...structuredClone(SHEET_DEFAULT), ...(db.sheet || {}) };
db.call = null; // a call does not survive a restart
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
  fixBond();
  const blocks = [{ type: 'text', text: PERSONA(USER_NAME) }, { type: 'text', text: STATE_BLOCK(USER_NAME, db.settings, db.sheet) + (currentGlow() ? '\n' + glowNote(db.glow, USER_NAME) : '') + (db.call && db.away ? '\n' + callNote(db.away, USER_NAME) : '') + (placeNote() ? '\n' + placeNote() : '') }];
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
const TOUCH = { pointshelf: ['points her to the bookshelf', 'points her to the bookshelf'], pointcounter: ['points her to the kettle', 'points her to the kettle'], pointchair: ['pats her chair for her to sit back down', 'pats her chair for her to sit back down'],
  pointfloor: ['beckons her over', 'beckons her over'], pointbook: ['taps her book', 'taps her book'], pointphone: ['taps her phone', 'taps her phone'], pointmug: ['taps her mug', 'taps her mug'],
  poke: ['pokes her cheek', 'pokes her cheek %n times'], boop: ['boops her nose', 'boops her nose %n times'], pat: ['pats her on the head', 'pats her on the head %n times'],
  yousit: ['sits down on the couch next to her', 'sits down on the couch next to her'], yousitbed: ['sits down on the edge of her bed', 'sits down on the edge of her bed'], tvon: ['turns the TV on', 'turns the TV on'], tvoff: ['turns the TV off', 'turns the TV off'],
  cameDorm: ['took her up on the invite and has just walked into her dorm room', ''], cameHouse: ['said yes, and she has just arrived at his house and walked in', ''], homeDorm: ['has left her dorm and gone home; you two are apart again, chatting like usual', ''], homeHouse: ['has seen her out; she is back in her own dorm and you two are chatting like usual', ''],
  petEnd: ['strokes her hair', 'strokes her hair for a while'], swat: ['swats at her', 'swats at her %n times'], body: ['tugs at her hoodie', 'tugs at her hoodie %n times'], spam: ['keeps poking her over and over', 'will not stop poking her'] };
let touches = [];
function takeTouches() {
  const fresh = touches.filter(t => Date.now() - t.at < 15 * 60000); touches = [];
  const n = {}; for (const t of fresh) n[t.kind] = (n[t.kind] || 0) + 1;
  return Object.keys(n).map(k => (TOUCH[k][n[k] > 1 ? 1 : 0] || TOUCH[k][0]).replace('%n', n[k])).join(', ');
}
// a log entry as the model sees it: the silent touches ride in front of his words as an action
const withPre = e => (e.pre ? `*${e.pre}* ` : '') + picNote(e.pic) + e.text;

async function replyLocal(userText, onDelta) {
  const setup = setupText();
  let budget = CONTEXT_TOKENS - toks(setup) - REPLY_TOKENS - 200;
  const L = LENGTHS[db.settings.length] || LENGTHS.short;
  const turns = [{ role: 'user', content: withPre(db.log[db.log.length - 1]) }];
  budget -= toks(turns[0].content);
  for (let i = db.log.length - 2; i >= 0 && budget > 0; i--) { // the last log entry is this message
    const e = db.log[i]; if (e.who === 'sys') continue;        // "Wizra left" lines are for the screen, not for her
    const t = { role: e.who === 'me' ? 'user' : 'assistant', content: withPre(e) };
    budget -= toks(t.content); if (budget < 0) break;
    if (turns[0].role === t.role) turns[0].content = t.content + '\n' + turns[0].content; // messages he left while she was out arrive as one turn
    else turns.unshift(t);
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  turns.unshift({ role: 'user', content: setup }, { role: 'assistant', content: '(ready)' });
  const system = '';
  const text = await brainJob({ system, messages: turns, max_tokens: L.tokens, temperature: tempOf(db.settings.temperature), stream: true,
    repeat_penalty: 1.12, frequency_penalty: 0.35, presence_penalty: 0.25, stop: [`\n${USER_NAME}:`, '\nUser:', '\n['] }, onDelta);
  return trimLength(dropRepeats(dropTags(cleanLocal(text))), L);
}
const LENGTHS = { // tokens: hard cap on the model; say/act: how many spoken sentences and actions survive the trim
  short: { tokens: 90, say: 2, act: 1 },
  medium: { tokens: 220, say: 5, act: 2 },
  long: { tokens: 600, say: 99, act: 9 },
};
// "*waves* hey. how are you?" -> ['*waves*', ' hey.', ' how are you?']
const units = t => String(t).match(/\*[^*]+\*|[^*.!?\n]+[.!?]*["')\]]*\s*|\n+/g) || [];
const norm = u => u.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Stage directions that are only a speech tag ("*she says softly,*", "She sets her book down before asking,") read as
// broken sentences in a chat: drop them, and drop a last fragment that trails off on a comma.
const SPEECH_TAG = /^\*?\s*(she |wizra )?(just |simply |then |quietly |softly )?(says?|said|asks?|adds?|repl(y|ies)|murmurs?|mutters?|whispers?|continues?|answers?|responds?|speaks?|states?|remarks?)\b/i;
const TAG_TAIL = /\b(says?|asks?|asking|adds?|adding|repl(y|ies|ying)|murmurs?|whispers?|continues?|continuing|answers?|answering|responds?|responding)\b[^.!?]*[,:]\s*\*?\s*$/i;
// An action is a glimpse, not a paragraph: keep its first clause ("she narrows her eyes slightly"), not the commentary after it.
function shortAction(u) {
  const m = u.match(/^(\s*)\*([^*]+)\*(\s*)$/); if (!m) return u;
  let a = m[2].trim(); const words = a.split(/\s+/);
  if (words.length <= 9) return u;
  const cut = a.search(/,| but | as | while | before | after | and then | because | though | waiting | hoping | trying /i);
  a = (cut > 12 ? a.slice(0, cut) : words.slice(0, 9).join(' ')).replace(/[\s,;:]+$/, '');
  return `${m[1]}*${a}*${m[3] || ' '}`;
}
function dropTags(text) {
  const us = units(text).filter(u => !SPEECH_TAG.test(u.trim()) && !TAG_TAIL.test(u.trim())).map(shortAction);
  while (us.length > 1 && /[,:]\s*\*?\s*$/.test(us[us.length - 1].trim())) us.pop();
  return us.join('').trim() || text;
}
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
  const recent = db.log.filter(e => e.who !== 'sys' && e.text).slice(-40).map(e => `${e.who === 'me' ? USER_NAME : 'Wizra'}: ${e.text}`).join('\n');
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
  if (BOND.includes(out.bond_lean)) addBond(out.bond_lean, db.place ? 2 : 1);
  const c = Math.round(Number(out.cuss_level));
  if (db.settings.cussDevelop && Number.isFinite(c) && c === sh.cussLevel + 1 && sh.rapport >= 60) sh.cussLevel = c;
  save();
  console.log(`[learn] rapport ${sh.rapport} (${d >= 0 ? '+' : ''}${d}) cuss ${sh.cussLevel}${nl ? ' new secret like' : ''}`);
}

// ---- what they are to each other: romance, friends or mentor. Nobody picks it from a menu; it follows how he treats her.
// Each lean adds points (more when they are together in person). The clear leader becomes sheet.path, which her prompt uses.
// sheet.pathLock (set from her Character menu) pins it by hand; '' lets it follow the points again.
const BOND = ['romance', 'friend', 'mentor'];
function fixBond() {
  const sh = db.sheet; if (!sh.bond || typeof sh.bond !== 'object') sh.bond = {}; for (const k of BOND) sh.bond[k] = Math.max(0, Math.min(100, Math.round(+sh.bond[k] || 0)));
  const order = [...BOND].sort((a, b) => sh.bond[b] - sh.bond[a]), top = order[0];
  sh.path = BOND.includes(sh.pathLock) ? sh.pathLock : (sh.bond[top] >= 5 && sh.bond[top] - sh.bond[order[1]] >= 2 ? top : '');
}
function addBond(kind, n) { fixBond(); db.sheet.bond[kind] = Math.min(100, db.sheet.bond[kind] + n); fixBond(); }
const bondView = () => { fixBond(); return { bond: db.sheet.bond, path: db.sheet.path, pathLock: db.sheet.pathLock || '' }; };

// Only known fields, sane types; the sheet is fully editable from the wheel.
function applySettings(body) {
  const s = body.settings || {}, S = db.settings;
  const MOODS = ['auto', 'happy', 'playful', 'chill', 'tired', 'grumpy', 'sad', 'excited', 'anxious', 'focused'];
  if (MOODS.includes(s.mood)) S.mood = s.mood;
  for (const k of ['expressiveness', 'temperature']) if (Number.isFinite(+s[k])) S[k] = Math.max(0, Math.min(100, Math.round(+s[k])));
  if (['short', 'medium', 'long'].includes(s.length)) S.length = s.length;
  if (typeof s.ttsVoice === 'string' && /^[a-z]{2}_[a-z0-9_]{1,24}$/.test(s.ttsVoice)) S.ttsVoice = s.ttsVoice;
  if (s.avatarKind === 'puppet' || (s.avatarKind === 'vrm' && fs.existsSync(AVATAR))) S.avatarKind = s.avatarKind;
  if (Array.isArray(s.acts)) S.acts = s.acts.filter(x => Array.isArray(x)).map(x => [String(x[0] || '').trim().slice(0, 20), String(x[1] || '').replace(/\*/g, '').trim().slice(0, 140), String(x[2] || '').trim().slice(0, 8)]).filter(x => x[0] && x[1]).slice(0, 18);
  for (const k of ['sfw', 'bleep', 'cussDevelop']) if (typeof s[k] === 'boolean') S[k] = s[k];
  if (typeof body.notes === 'string') db.profile = body.notes.slice(0, 6000);
  const h = body.sheet || {}, H = db.sheet;
  for (const k of ['birthday', 'backstory']) if (typeof h[k] === 'string') H[k] = h[k].slice(0, 4000);
  for (const k of ['likes', 'dislikes']) if (Array.isArray(h[k])) H[k] = h[k].map(String).map(x => x.trim()).filter(Boolean).slice(0, 60);
  if (Array.isArray(h.hiddenLikes)) H.hiddenLikes = h.hiddenLikes.filter(x => x && String(x.text || '').trim()).slice(0, 60).map(x => ({ text: String(x.text).trim().slice(0, 200), revealed: !!x.revealed, ...(x.grown ? { grown: true } : {}) }));
  if (Number.isFinite(+h.rapport)) H.rapport = Math.max(0, Math.min(100, Math.round(+h.rapport)));
  if (h.pathLock === '' || BOND.includes(h.pathLock)) H.pathLock = h.pathLock;
  if (h.bond && typeof h.bond === 'object') { fixBond(); for (const k of BOND) if (Number.isFinite(+h.bond[k])) H.bond[k] = +h.bond[k]; }
  fixBond();
  if (Number.isFinite(+h.cussLevel)) H.cussLevel = Math.max(0, Math.min(3, Math.round(+h.cussLevel)));
  save();
}

// ---------- her comings and goings (away.mjs has the rules) ----------
// db.away = { since, until, where, cover } while she is out; db.glow = { kind, lying, truth, tells, talk, where, until } for the
// hour after she is back, while it still shows.
function currentGlow() { if (db.glow && Date.now() > db.glow.until) { db.glow = null; save(); } return db.glow; }
// db.plan = { leaveAt, backAt, where }: something she said she has later ("class starts at seven", "back around nine").
const planView = () => { const p = db.plan; return p && (p.leaveAt || p.backAt) && !db.away ? { where: p.where || '', leave: p.leaveAt ? clock(p.leaveAt) : '', back: p.backAt ? clock(p.backAt) : '' } : null; };
function notePlan(text) {
  const p = detectPlan(text); if (!p) return;
  db.plan = db.plan || {};
  if (p.leaveAt) { db.plan.leaveAt = p.leaveAt; db.plan.where = p.where || db.plan.where || ''; if (db.plan.backAt && db.plan.backAt <= p.leaveAt) db.plan.backAt = 0; }
  if (p.backAt) db.plan.backAt = p.backAt;
  console.log('[plan]', JSON.stringify(planView()));
}
// Is it time? 'say' = she should say goodbye now (the page is open and it is within a few minutes of the time);
// if the moment passed with nobody watching, she simply went.
function planDue() {
  const p = db.plan, now = Date.now(); if (!p || !p.leaveAt || db.away || now < p.leaveAt) return '';
  if (now - p.leaveAt < 4 * 60000) return 'say';
  leaveNow({ where: p.where || 'somewhere', minutes: 75, cover: /class|study|work/.test(p.where || '') }, p.leaveAt); save();
  return '';
}
const awayView = () => { if (db.call && Date.now() - db.call.since > 25 * 60000) db.call = null; return awayView0(); }; // (a call left open is dropped)
// A picture she sends on her own while she is out: due ones go out when the page next checks in (she writes the line herself).
async function awayPic() {
  const a = db.away, now = Date.now(); if (!a || !a.pics || !a.pics.length || busy || db.call || now < a.pics[0].at) return;
  const due = a.pics.shift(); if (now > due.at + 20 * 60000 || now >= a.until || (!brain.ws && !client)) { save(); return; }
  busy = true;
  try {
    const close = (db.sheet.rapport | 0) / 100, spec = await choosePic({ home: false, scene: sceneFor(a), close, path: db.sheet.path, slip: due.slip }) || selfie(sceneFor(a), (a.out || {}).kind || '', close);
    const pre = `is not with her; she is out and sends him a picture from where she is: ${spec.desc}. She writes one short line to go with it${due.slip ? `. She has not thought about the fact that what is behind her shows she is not at ${a.where}` : ''}`;
    db.log.push({ who: 'me', text: '', at: now, pre, hidden: true });
    const text = await reply(`*${pre}*`, () => {});
    db.log.push({ who: 'her', text, at: Date.now(), pic: spec, auto: true }); console.log(`[pic] sent while out (${spec.pose}, ${spec.scene}${due.slip ? ', slip' : ''})`);
  } catch (e) { db.log.pop(); console.error('[pic]', e.message); } finally { busy = false; save(); }
}
const tailView = () => { for (let i = db.log.length - 1; i >= 0 && i > db.log.length - 12; i--) if (db.log[i].auto) { const { at, text, pic } = db.log[i]; return { at, text, pic }; } return null; };
const RING_FOR = 50000;
function ringNow() { // is she calling him right now? Once the ringing runs out unanswered it is a missed call.
  const a = db.away, now = Date.now(); if (!a || !a.callAt || a.rang || db.call || now < a.callAt) return false;
  if (now > a.callAt + RING_FOR || now >= a.until) { a.rang = 'missed'; db.log.push({ who: 'sys', text: 'Missed call from Wizra.', at: now }); save(); return false; }
  return true;
}
const awayView0 = () => db.away ? { where: db.away.where, back: db.away.said || clock(db.away.until), due: Date.now() >= db.away.until && !db.call, ringing: ringNow() } : null; // (back = when she said; the real time is hers to keep)
const glowView = () => { const g = currentGlow(); return g ? { kind: g.kind, until: g.until, sneak: !!g.lying } : null; };
// ---- visiting: once the relationship score reaches VISIT_AT they can be in the same room. db.place is '' (apart, the usual),
// 'dorm' (he is at her dorm) or 'house' (she is at his house). The page shows it in first person.
const VISIT_AT = 90;
const canVisit = () => !!process.env.VISIT_TEST || (db.sheet.rapport | 0) >= VISIT_AT;
const inviteNow = () => db.invite && !db.place && !db.away && Date.now() - db.invite.at < 15 * 60000 ? db.invite.place : '';
const placeView = () => ({ place: db.place || '', canVisit: canVisit(), rapport: db.sheet.rapport | 0, visitAt: VISIT_AT, invite: inviteNow(), ...bondView() });
function placeNote() {
  if (db.place === 'house') return `Right now you are at ${USER_NAME}'s house, in his living room, with him in person: his couch (you are on it), a coffee table, his TV, a bookshelf and a kitchen counter. You are physically together, not messaging. You can touch things, look around, comment on his place.`;
  if (db.place === 'dorm') return `Right now ${USER_NAME} is in your dorm room with you, in person: your armchair, your bed, your desk, your posters and fairy lights. You are physically together, not messaging. It is your space and he is the guest.`;
  return canVisit() ? `You and ${USER_NAME} are close enough now to hang out in person. Now and then, when it fits, you can invite him over to your dorm room or ask to come over to his place, in plain words.` : '';
}
function setPlace(place) { db.place = place || ''; db.invite = null; }
function leaveNow(leave, since = Date.now()) {
  if (db.place) setPlace('');                                                       // wherever she is going, the visit is over
  const now = since, p = db.plan || {};
  // back when she said she would be, if she said; otherwise however long that kind of outing takes
  const said = p.backAt && p.backAt > now + 5 * 60000 && p.backAt < now + 16 * 3600000 ? p.backAt : 0;
  const where = leave.where === 'somewhere' && p.where ? p.where : leave.where;
  const a = { since: now, where, cover: leave.cover || /class|study|work/.test(where), minutes: said ? Math.round((said - now) / 60000) : leave.minutes };
  // what she is really doing is settled the moment she walks out (it decides what a video call shows, and how she comes back)
  a.out = process.env.AWAY_TEST_LIE ? outcome(a, 0, 0.1) : outcome(a);
  // she is not a train: a few minutes early to half an hour late, later still when she is somewhere she should not be
  const drift = a.minutes < 12 ? 0 : (Math.random() * (a.out.lying ? 50 : 32) - (a.out.lying ? 0 : 6)) * 60000;
  a.until = (said || now + leave.minutes * 60000 / AWAY_SPEED) + drift / AWAY_SPEED; a.said = said ? clock(said) : clock(now + leave.minutes * 60000 / AWAY_SPEED);
  // now and then she is the one who calls, part way through being out: rare, and likelier the closer they are
  const close = (db.sheet.rapport | 0) / 100, chance = (0.02 + 0.16 * close * close) * (db.sheet.path === 'romance' ? 1.4 : 1);
  // and now and then a picture from wherever she is. If she is somewhere she should not be, most of the time she sends
  // nothing; when she does, she has not thought about what is behind her (slip), and the picture gives her away.
  a.pics = [];
  for (let i = 0; i < 2; i++) if (process.env.PIC_TEST ? i === 0 : a.minutes >= 15 && Math.random() < awayChance(close, db.sheet.path === 'romance') / (i + 1)) {
    if (a.out.lying && !process.env.PIC_TEST && Math.random() > 0.4) continue;
    a.pics.push({ at: process.env.PIC_TEST ? now + 4000 : now + (a.until - now) * (0.15 + 0.7 * Math.random()), slip: !!a.out.lying });
  }
  a.pics.sort((x, y) => x.at - y.at);
  if (process.env.CALL_TEST_RING) a.callAt = now + 4000;
  else if (!a.out.lying && a.minutes >= 20 && Math.random() < chance) a.callAt = now + (a.until - now) * (0.25 + 0.5 * Math.random());
  db.away = a;
  db.plan = null;
  db.log.push({ who: 'sys', text: `Wizra left for ${where}. Back around ${a.said}.`, at: now });
  console.log(`[away] left for ${leave.where}, ${leave.minutes} min`);
}
// She walks back in: decide what really happened, then let her say something as she arrives (seeing anything he sent meanwhile).
async function comeBack(onDelta) {
  const a = db.away, out = a.out || outcome(a), now = Date.now(); db.call = null;
  const missed = db.log.filter(e => e.who === 'me' && e.at > a.since && e.text).length;
  db.away = null;
  db.glow = out.kind ? { ...out, where: a.where, until: now + 60 * 60000 / AWAY_SPEED } : null;
  db.log.push({ who: 'sys', text: 'Wizra is back.', at: now });
  const how = out.lying ? 'tries to slip back in quietly from' : 'comes back in from';
  const pre = `looks up as she ${how} ${a.where}${missed ? '; the messages above were sent while she was out and she is only seeing them now' : ''}${a.rang === 'missed' ? '; she tried to video call him while she was out and he did not pick up' : ''}`;
  db.log.push({ who: 'me', text: '', at: now, pre, hidden: true });
  console.log(`[away] back from ${a.where}${out.kind ? ', ' + out.kind + (out.lying ? ' (cover story)' : '') : ''}`);
  try {
    const full = await reply(`*${pre}*`, onDelta);
    db.log.push({ who: 'her', text: full, at: Date.now() });
    return full;
  } finally { save(); }
}

// ---------- http ----------
// changes whenever a new version is deployed: pages left open use it to reload themselves
const BUILD = String(Math.round(Math.max(...['server.mjs', 'away.mjs', 'persona.mjs', 'public/index.html', 'public/avatar.js', 'public/avatar-vrm.js', 'public/places.js', 'public/sound.js', 'pics.mjs'].map(f => { try { return fs.statSync(path.join(here, f)).mtimeMs; } catch { return 0; } }))));
const TYPES = { '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
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
    if (url.pathname === '/api/brain') return json(res, 200, { online: !!brain.ws, model: brain.model, served: brain.served, failed: brain.failed, upMin: brain.since && brain.ws ? Math.round((Date.now() - brain.since) / 60000) : 0, fallback: !brain.ws && !!client, bridge: brain.ws ? brain.v : 0, bridgeLatest: 4, build: BUILD, ttsMs: brain.ttsMs || 0, tts: brain.tts, voices: brain.voices, voiceState: brain.ws ? (brain.voiceState || (brain.v < 3 ? 'the bridge on the PC is an old version' : 'not reported yet')) : 'the PC bridge is offline' });

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

      if (url.pathname === '/api/state') return json(res, 200, { log: db.log.filter(e => !e.hidden).map(({ pre, ...e }) => e), name: USER_NAME, me: db.meAvatar || '', settings: db.settings, depart: planDue(), away: awayView(), glow: glowView(), plan: planView(), ...placeView() });

      if (url.pathname === '/api/away') { awayPic(); return json(res, 200, { depart: planDue(), away: awayView(), glow: glowView(), plan: planView(), tail: tailView(), ...placeView() }); }

      // the picture pack: GET one image; POST the whole pack at once { manifest: [...], files: { name: base64 } }
      if (url.pathname.startsWith('/api/pack')) {
        if (req.method === 'GET') { const f = url.pathname.slice(10); if (!/^[a-z0-9_]+\.webp$/.test(f) || !fs.existsSync(path.join(PACK, f))) return json(res, 404, { error: 'no such picture' }); res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'private, max-age=86400' }); return fs.createReadStream(path.join(PACK, f)).pipe(res); }
        if (req.method === 'POST') {
          const parts = []; let size = 0; await new Promise((resolve, reject) => { req.on('data', c => { size += c.length; if (size > 40e6) req.destroy(); else parts.push(c); }); req.on('end', resolve); req.on('error', reject); });
          let d; try { d = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return json(res, 400, { error: 'not JSON' }); }
          if (!Array.isArray(d.manifest) || !d.files) return json(res, 400, { error: 'manifest and files needed' });
          fs.rmSync(PACK, { recursive: true, force: true }); fs.mkdirSync(PACK, { recursive: true }); let n = 0;
          for (const f in d.files) if (/^[a-z0-9_]+\.webp$/.test(f)) { fs.writeFileSync(path.join(PACK, f), Buffer.from(d.files[f], 'base64')); n++; }
          fs.writeFileSync(path.join(PACK, 'manifest.json'), JSON.stringify(d.manifest.filter(m => d.files[m.file]))); loadPack();
          return json(res, 200, { ok: true, pictures: n, listed: pack.length });
        }
      }
      // a picture she sent: the first page to show it draws it and hands it back here, so it stays the same picture from then on
      if (url.pathname.startsWith('/api/pic/')) {
        const pid = url.pathname.slice(9), file = path.join(PICS, pid + '.webp'); if (!/^[a-z0-9]{6,20}$/.test(pid)) return json(res, 400, { error: 'bad id' });
        if (req.method === 'GET') { if (!fs.existsSync(file)) return json(res, 404, { error: 'not drawn yet' }); res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'private, max-age=31536000, immutable' }); return fs.createReadStream(file).pipe(res); }
        if (req.method === 'POST') {
          if (!db.log.some(e => e.pic && e.pic.id === pid)) return json(res, 404, { error: 'no such picture' });
          const parts = []; let size = 0; await new Promise((resolve, reject) => { req.on('data', c => { size += c.length; if (size > 900000) req.destroy(); else parts.push(c); }); req.on('end', resolve); req.on('error', reject); });
          const m = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(Buffer.concat(parts).toString('utf8')); if (!m) return json(res, 400, { error: 'not an image' });
          fs.mkdirSync(PICS, { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
          return json(res, 200, { ok: true });
        }
      }

      // taking up her invitation (place = what she offered), turning it down, or going home (place = '')
      if (url.pathname === '/api/visit' && req.method === 'POST') {
        const { place, decline } = await readBody(req), now = Date.now();
        if (decline) { db.invite = null; save(); return json(res, 200, placeView()); }
        if (!place) {
          if (db.place) { db.log.push({ who: 'sys', text: db.place === 'dorm' ? 'You headed home.' : 'Wizra headed home.', at: now }); touches.push({ kind: db.place === 'dorm' ? 'homeDorm' : 'homeHouse', at: now }); setPlace(''); save(); }
          return json(res, 200, placeView());
        }
        if (place !== inviteNow()) return json(res, 409, { error: 'There is no invitation open right now.', ...placeView() });
        setPlace(place); db.log.push({ who: 'sys', text: place === 'dorm' ? "You went over to Wizra's dorm." : 'Wizra came over to your place.', at: now }); touches.push({ kind: place === 'dorm' ? 'cameDorm' : 'cameHouse', at: now }); save();
        return json(res, 200, placeView());
      }

      if (url.pathname === '/api/settings') {
        if (req.method === 'POST') applySettings(await readBody(req));
        return json(res, 200, { settings: db.settings, sheet: db.sheet, notes: db.profile });
      }

      // Her 3D model (.vrm): kept on the volume, served only to someone logged in, replaceable from the wheel.
      if (url.pathname === '/api/anims') {
        if (req.method === 'GET') {
          if (!fs.existsSync(ANIMS)) return json(res, 200, { clips: {} });
          res.writeHead(200, { 'content-type': 'application/json', 'content-length': fs.statSync(ANIMS).size, 'cache-control': 'private, no-cache' });
          return fs.createReadStream(ANIMS).pipe(res);
        }
        if (req.method === 'POST') { // the whole set at once: { clips: { name: clip } }
          const parts = []; let size = 0; await new Promise((resolve, reject) => { req.on('data', c => { size += c.length; if (size > 30e6) req.destroy(); else parts.push(c); }); req.on('end', resolve); req.on('error', reject); });
          let d; try { d = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return json(res, 400, { error: 'not JSON' }); }
          if (!d || typeof d.clips !== 'object') return json(res, 400, { error: 'no clips' });
          fs.writeFileSync(ANIMS + '.tmp', JSON.stringify({ v: Date.now(), clips: d.clips })); fs.renameSync(ANIMS + '.tmp', ANIMS);
          return json(res, 200, { ok: true, clips: Object.keys(d.clips) });
        }
      }
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
          const wav = Buffer.from(await voiced(line), 'base64');
          res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length, 'cache-control': 'no-store' });
          return res.end(wav);
        } catch (e) { return json(res, 503, { error: e.message }); }
      }

      // His own picture (a small image the page has already shrunk), shown on his portrait and beside his messages.
      if (url.pathname === '/api/me-avatar' && req.method === 'POST') {
        const { image } = await readBody(req);
        if (image === '') { db.meAvatar = ''; save(); return json(res, 200, { me: '' }); }
        if (typeof image !== 'string' || !/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 190000) return json(res, 400, { error: 'That picture could not be used.' });
        db.meAvatar = image; save();
        return json(res, 200, { me: image });
      }

      if (url.pathname === '/api/touch' && req.method === 'POST') {
        const { kind } = await readBody(req);
        if (TOUCH[kind] && touches.length < 40) touches.push({ kind, at: Date.now() });
        return json(res, 200, { ok: true });
      }

      // Rewind: undo everything said from a moment onward and put the world back to "she is home, nothing pending".
      // Works by timestamp only and answers with counts, never with the messages. The file as it was is kept beside it first.
      if (url.pathname === '/api/rewind' && req.method === 'POST') {
        const { to, rapport } = await readBody(req), t = Number(to);
        if (!Number.isFinite(t) || t < Date.now() - 7 * 86400000 || t > Date.now()) return json(res, 400, { error: 'to must be a time in the last week (ms)' });
        if (busy) return json(res, 409, { error: 'busy' });
        save(); const backup = STORE.replace(/\.json$/, `.before-rewind-${Date.now()}.json`); try { fs.copyFileSync(STORE, backup); } catch (e) { return json(res, 500, { error: 'could not back up: ' + e.message }); }
        const before = db.log.length, gone = db.log.filter(e => e.at >= t), turns = gone.filter(e => e.who === 'her').length;
        db.log = db.log.filter(e => e.at < t); db.history = db.history.slice(0, Math.max(0, db.history.length - turns * 2));
        db.away = null; db.glow = null; db.plan = null; db.call = null; db.place = ''; db.invite = null; db.sinceLearn = 0; touches = [];
        if (Number.isFinite(+rapport)) db.sheet.rapport = Math.max(0, Math.min(100, Math.round(+rapport)));
        save();
        return json(res, 200, { ok: true, removed: before - db.log.length, kept: db.log.length, backup: path.basename(backup), ...placeView() });
      }
      if (url.pathname === '/api/reset' && req.method === 'POST') {
        db.history = []; db.log = []; db.sinceLearn = 0; db.away = null; db.glow = null; db.plan = null; db.call = null; db.place = ''; db.invite = null; save();
        return json(res, 200, { ok: true });
      }

      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const { text, doing, voice: wantVoice, visit, lean } = await readBody(req);
        const msg = String(text || '').trim().slice(0, 20000);
        if (!msg) return json(res, 400, { error: 'empty' });
        if (busy) return json(res, 409, { error: 'She is still answering.' });
        busy = true;
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
        // what he did to her since her last reply, and what he can see her doing right now: both ride silently in front of his words
        if (db.away) { // she is out: the message waits for her
          db.log.push({ who: 'me', text: msg, at: Date.now() }); save(); busy = false;
          send({ t: 'away', away: awayView() }); return res.end();
        }
        const seen = String(doing || '').replace(/[^a-z ]/gi, '').trim().slice(0, 60);
        // he asks to get together (the page's visit button): she has made up her mind before she answers, like a call
        let ask = (visit === 'house' || visit === 'dorm') && !db.place && canVisit() ? visit : '', askPre = '';
        if (ask) {
          const g = currentGlow(), yes = process.env.VISIT_TEST_ANSWER ? process.env.VISIT_TEST_ANSWER === 'yes' : !(g && ['upset', 'groggy'].includes(g.kind)) && Math.random() < 0.9;
          askPre = ask === 'house' ? (yes ? 'invites her over to his house; she says yes, comes over, and has just walked in his front door' : 'invites her over to his house; she is not up for it right now and says so')
            : (yes ? 'asks to come over to her dorm; she says yes, and he has just arrived and walked into her room' : 'asks to come over to her dorm; she is not up for company right now and says so');
          if (yes) setPlace(ask); else { ask = ''; db.invite = null; }
        }
        // a picture with this reply: because he asked, or now and then on her own (more often the closer they are)
        let pic = null, picPre = '';
        if (!db.place && !askPre) {
          const close = (db.sheet.rapport | 0) / 100, g = currentGlow(), kind = g ? g.kind : '';
          if (wantsPic(msg)) { if (close >= 0.25 && Math.random() < 0.55 + 0.45 * close) { pic = (!kind && await choosePic({ home: true, close, path: db.sheet.path, ask: true })) || selfie('dorm', kind, close); picPre = `asks for a picture; she takes one and sends it: ${pic.desc}`; } else picPre = 'asks for a picture; she is not comfortable sending one yet and says so in her own way'; }
          else if (process.env.PIC_TEST_CHAT || Math.random() < chatChance(close, db.sheet.path === 'romance')) { pic = (!kind && Math.random() < 0.85 && await choosePic({ home: true, close, path: db.sheet.path })) || (Math.random() < 0.4 ? thing(db.sheet.likes) : selfie('dorm', kind, close)); picPre = `she also sends him ${pic.desc} with this message, on a whim`; }
        }
        const pre = [takeTouches(), askPre, picPre, seen && !askPre ? 'sees that she is ' + seen : ''].filter(Boolean).join(', ');
        db.log.push({ who: 'me', text: msg, at: Date.now(), ...(pre ? { pre } : {}) });
        try {
          let heard = '', early = false; // the first finished sentence goes to be voiced while she is still writing the rest
          const full = await reply(pre ? `*${pre}* ${msg}` : msg, d => {
            send({ t: 'delta', d });
            if (!wantVoice || early || !brain.tts) return; heard += d;
            if ((heard.match(/\*/g) || []).length % 2) return;   // in the middle of an action
            const done = spokenLines(heard.replace(/[^.!?]*$/, '')); if (done[0] && (done.length > 1 || done[0].length >= 55)) { early = true; voiced(done[0]).catch(() => {}); } // (a short first sentence waits: it will be joined to the next)
          });
          if (wantVoice) prewarm(full);
          db.log.push({ who: 'her', text: full, at: Date.now(), ...(pic ? { pic } : {}) });
          db.sinceLearn++;
          if (db.place && BOND.includes(lean)) addBond(lean, 2);                       // one of the moments he chose while they are together
          if (ask) db.log.push({ who: 'sys', text: ask === 'dorm' ? "You went over to Wizra's dorm." : 'Wizra came over to your place.', at: Date.now() });
          notePlan(full); const leave = detectLeave(full); if (leave) leaveNow(leave);
          else if (!db.place && !askPre && canVisit()) { const inv = detectInvite(full); if (inv) db.invite = { place: inv, at: Date.now() }; }
          save();
          send({ t: 'done', text: full, pic, away: awayView(), glow: glowView(), plan: planView(), ...placeView() });
          if (db.sinceLearn >= LEARN_EVERY) { db.sinceLearn = 0; learn().catch(e => console.error('[learn]', e.message)); }
        } catch (e) {
          console.error('[chat]', e.status || '', e.message);
          db.log.pop(); if (ask) setPlace(''); save();
          send({ t: 'error', error: e instanceof Anthropic.APIError ? `API error ${e.status ?? ''}: ${e.message}` : e.message });
        } finally {
          busy = false;
          res.end();
        }
        return;
      }
      // ---- video call while she is out. Spoken only: nothing from a call is shown in the chat, just a line that it happened. ----
      if (url.pathname === '/api/call/start' && req.method === 'POST') {
        if (!db.away) return json(res, 409, { error: 'She is right here.' });
        if (busy) return json(res, 409, { error: 'busy' });
        const hers = !!(await readBody(req)).incoming && ringNow();                 // he is picking up a call she made
        busy = true;
        try {
          if (hers) db.away.rang = 'answered';
          else if (!(process.env.CALL_TEST_ANSWER ? process.env.CALL_TEST_ANSWER === 'yes' : picksUp(db.away))) { // no answer; she texts back instead
            const pre = 'tries to video call her; she lets it ring out and sends a short text back instead';
            db.log.push({ who: 'sys', text: 'You called Wizra. No answer.', at: Date.now() }, { who: 'me', text: '', at: Date.now(), pre, hidden: true });
            let text = ''; try { text = await reply(`*${pre}*`, () => {}); db.log.push({ who: 'her', text, at: Date.now() }); } catch { db.log.pop(); }
            save(); return json(res, 200, { answered: false, text });
          }
          db.call = { since: Date.now() };
          const pre = hers ? 'picks up: she is the one video calling him, out of the blue, from wherever she is. She says why she called' : 'video calls her; she picks up';
          db.log.push({ who: 'me', text: '', at: Date.now(), pre, hidden: true });
          let text; try { text = await reply(`*${pre}*`, () => {}); } catch (e) { db.log.pop(); db.call = null; throw e; }
          db.log.push({ who: 'her', text, at: Date.now(), hidden: true });
          save();
          const o = db.away.out || {};
          prewarm(text);
          return json(res, 200, { answered: true, text, scene: sceneFor(db.away), state: o.kind || (o.lying ? 'cagey' : '') });
        } catch (e) { return json(res, 503, { error: e.message }); } finally { busy = false; }
      }
      if (url.pathname === '/api/call/say' && req.method === 'POST') {
        const { text } = await readBody(req); const msg = String(text || '').trim().slice(0, 2000);
        if (!db.call || !db.away) return json(res, 409, { error: 'No call.' });
        if (!msg) return json(res, 400, { error: 'empty' });
        if (busy) return json(res, 409, { error: 'busy' });
        busy = true;
        db.log.push({ who: 'me', text: msg, at: Date.now(), hidden: true });
        try {
          const full = await reply(msg, () => {});
          db.log.push({ who: 'her', text: full, at: Date.now(), hidden: true });
          const coming = COMING.test(full); if (coming) db.away.until = Math.min(db.away.until, Date.now() + (3 + Math.random() * 4) * 60000);
          save();
          prewarm(full);
          return json(res, 200, { text: full, hangup: HANGUP.test(full), coming });
        } catch (e) { db.log.pop(); return json(res, 503, { error: e.message }); } finally { busy = false; }
      }
      if (url.pathname === '/api/call/end' && req.method === 'POST') {
        if (db.call) { const min = Math.max(1, Math.round((Date.now() - db.call.since) / 60000)); db.log.push({ who: 'sys', text: `Video call with Wizra, ${min} min.`, at: Date.now() }); db.call = null; save(); }
        return json(res, 200, { ok: true, away: awayView() });
      }

      // The time she named has come: she says goodbye and goes.
      if (url.pathname === '/api/depart' && req.method === 'POST') {
        if (planDue() !== 'say') return json(res, 409, { error: 'Not time yet.' });
        if (busy) return json(res, 409, { error: 'busy' });
        busy = true;
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
        const p = db.plan, where = p.where || 'what she has on';
        const pre = `sees her check the time: it is time for her to leave for ${where}`;
        db.log.push({ who: 'me', text: '', at: Date.now(), pre, hidden: true });
        let full = '';
        try { full = await reply(`*${pre}*`, () => {}); db.log.push({ who: 'her', text: full, at: Date.now() }); }
        catch (e) { console.error('[depart]', e.message); db.log.pop(); }                  // could not reach her brain: she slips out without a word
        leaveNow({ where: p.where || 'somewhere', minutes: 75, cover: /class|study|work/.test(p.where || '') });
        save(); busy = false;
        send({ t: 'done', text: full, away: awayView(), glow: null, plan: null });
        return res.end();
      }
      // She comes back: when her time is up (the page asks), or early if he calls her back.
      if (url.pathname === '/api/return' && req.method === 'POST') {
        const { force } = await readBody(req);
        if (!db.away) return json(res, 409, { error: 'She is not out.' });
        if (!force && Date.now() < db.away.until) return json(res, 409, { error: 'Not back yet.' });
        if (busy) return json(res, 409, { error: 'busy' });
        busy = true;
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
        const was = db.away;
        try {
          const full = await comeBack(() => {});
          send({ t: 'done', text: full, away: null, glow: glowView(), plan: planView(), returned: true });
        } catch (e) {
          console.error('[return]', e.message);
          while (db.log.length && db.log[db.log.length - 1].hidden) db.log.pop();
          if (db.log.length && db.log[db.log.length - 1].who === 'sys') db.log.pop();
          db.away = was; db.glow = null; save();   // could not reach her brain: she is still out, try again later
          send({ t: 'error', error: e.message });
        } finally { busy = false; res.end(); }
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
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...(p.startsWith('vendor') || p.startsWith('fonts') ? { 'cache-control': 'public, max-age=604800' } : {}) });
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
