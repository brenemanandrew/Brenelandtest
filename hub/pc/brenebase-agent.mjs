/* Brenebase PC agent: the always-on piece on Andrew's PC that can jumpstart the LLMs and bridges from anywhere.

   Starts at login (install-agent.ps1 registers it), uses almost nothing while idle, and can do ONLY these things:
     status          what is running: the model server, the loaded model, each bridge, the hub worker
     model-start     lms unload --all, lms load <model> with the big context, lms server start (same as start-wizra.ps1)
     model-stop      lms unload --all, lms server stop
     start:<name>    start one helper: wizra (Wizra bridge), town (Breneland townsfolk bridge), worker (Brenebase worker)
     stop:<name>     stop one helper this agent started
     start-all       model, then every helper that is set up
     stop-all        every helper, then the model
     logs:<name>     the last lines a helper printed
   No other command can be run through it.

   Two ways in, both need the PC key (HUB_WORKER_TOKEN, the same secret as the worker):
     1. Tailscale: Brenebase calls http://<this PC's tailnet name>:8765 directly. Only addresses on the tailnet
        (100.64.0.0/10, fd7a:115c:a1e0::/48) and this PC itself are answered.
     2. Polling: every few seconds it asks brenebase.fly.dev for a waiting command. Works even if Tailscale is down.

   Settings (setx on Windows; the installer sets the first two)
     HUB_URL           https://brenebase.fly.dev
     HUB_WORKER_TOKEN  the PC key
     AGENT_PORT        8765
     LMS               path to lms.exe (default %USERPROFILE%\.lmstudio\bin\lms.exe)
     MODEL             mn-violet-lotus-12b         MODEL_CONTEXT  32768 (or WIZRA_CONTEXT)
     WIZRA_BRIDGE      %USERPROFILE%\Brenai\wizra-bridge.mjs
     TOWN_BRIDGE       path to Breneland-Next tools\npc-brain-bridge.mjs (leave empty if not on this PC)
     BRENEBASE_DIR     folder holding worker\hub-worker.mjs (default: the folder above this file)
   Run by hand: node brenebase-agent.mjs */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const HOME = os.homedir();
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const HUB = (process.env.HUB_URL || 'https://brenebase.fly.dev').replace(/\/$/, '');
const KEY = process.env.HUB_WORKER_TOKEN || '';
const PORT = +process.env.AGENT_PORT || 8765;
const LMS = process.env.LMS || path.join(HOME, '.lmstudio', 'bin', process.platform === 'win32' ? 'lms.exe' : 'lms');
const MODEL = process.env.MODEL || 'mn-violet-lotus-12b';
const CTX = process.env.MODEL_CONTEXT || process.env.WIZRA_CONTEXT || '32768';
/* installed layout: Brenebase\pc\brenebase-agent.mjs and Brenebase\worker\hub-worker.mjs */
const BASE = process.env.BRENEBASE_DIR || path.dirname(HERE);
if (!KEY) { console.log('Set HUB_WORKER_TOKEN first (the PC key).'); process.exit(1); }

const HELPERS = {
  wizra: { label: 'Wizra bridge', file: process.env.WIZRA_BRIDGE || path.join(HOME, 'Brenai', 'wizra-bridge.mjs') },
  town: { label: 'Town bridge (Breneland townsfolk)', file: process.env.TOWN_BRIDGE || '' },
  worker: { label: 'Brenebase worker', file: path.join(BASE, 'worker', 'hub-worker.mjs'), env: { HUB_URL: HUB } },
};
const running = {};

const run = (cmd, args) => new Promise(ok => {
  const p = spawn(cmd, args, { windowsHide: true });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('error', e => ok({ code: -1, out: String(e.message) })); p.on('close', code => ok({ code, out: out.slice(-3000) }));
});

async function modelState() {
  try {
    const r = await fetch('http://127.0.0.1:1234/api/v0/models', { signal: AbortSignal.timeout(3000) });
    if (r.ok) { const j = await r.json(); const loaded = (j.data || []).filter(m => m.state === 'loaded').map(m => m.id); return { server: true, loaded }; }
    const r2 = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(3000) });
    return { server: r2.ok, loaded: r2.ok ? ['(server up; loaded model not reported)'] : [] };
  } catch { return { server: false, loaded: [] }; }
}

function startHelper(name) {
  const h = HELPERS[name]; if (!h) return `no helper called ${name}`;
  if (!h.file) return `${h.label} is not set up on this PC`;
  if (!fs.existsSync(h.file)) return `${h.label}: file not found (${h.file})`;
  if (running[name] && running[name].exitCode === null) return `${h.label} already running`;
  const p = spawn(process.execPath, [h.file], { cwd: path.dirname(h.file), env: { ...process.env, ...(h.env || {}) }, windowsHide: true });
  p.log = []; const keep = d => { p.log.push(...String(d).split('\n').filter(Boolean)); p.log = p.log.slice(-60); };
  p.stdout.on('data', keep); p.stderr.on('data', keep); p.on('exit', c => keep(`(stopped, code ${c})`));
  running[name] = p; return `${h.label} started`;
}
function stopHelper(name) {
  const p = running[name]; if (!p || p.exitCode !== null) return `${(HELPERS[name] || {}).label || name} was not running`;
  p.kill(); return `${HELPERS[name].label} stopped`;
}

async function status() {
  const m = await modelState();
  return {
    pc: os.hostname(), at: new Date().toISOString(), uptimeMin: Math.round(os.uptime() / 60),
    model: { name: MODEL, context: +CTX, server: m.server, loaded: m.loaded, lmsFound: fs.existsSync(LMS) },
    helpers: Object.fromEntries(Object.entries(HELPERS).map(([k, h]) => [k, { label: h.label, setUp: !!h.file && fs.existsSync(h.file), running: !!running[k] && running[k].exitCode === null }])),
  };
}

async function act(action) {
  const [verb, name] = String(action || '').split(':');
  if (verb === 'status') return { ok: true, status: await status() };
  if (verb === 'model-start') {
    if (!fs.existsSync(LMS)) return { ok: false, note: `lms not found at ${LMS}` };
    const a = await run(LMS, ['unload', '--all']);
    const b = await run(LMS, ['load', MODEL, '--context-length', String(CTX), '--gpu', 'max', '-y']);
    const c = await run(LMS, ['server', 'start', '--port', '1234']);
    return { ok: b.code === 0 && c.code === 0, note: [a.out, b.out, c.out].join('\n').trim().slice(-1500), status: await status() };
  }
  if (verb === 'model-stop') { await run(LMS, ['unload', '--all']); const r = await run(LMS, ['server', 'stop']); return { ok: true, note: r.out.trim(), status: await status() }; }
  if (verb === 'start') { const note = startHelper(name); return { ok: /started|already running/.test(note), note, status: await status() }; }
  if (verb === 'stop') return { ok: true, note: stopHelper(name), status: await status() };
  if (verb === 'logs') return { ok: true, note: (running[name] && running[name].log || []).join('\n') || 'nothing yet' };
  if (verb === 'start-all') {
    const notes = []; const m = await modelState();
    if (!m.loaded.length) notes.push((await act('model-start')).ok ? 'model loaded' : 'model did NOT load');
    else notes.push('model already loaded');
    for (const k of Object.keys(HELPERS)) notes.push(startHelper(k));
    return { ok: true, note: notes.join('\n'), status: await status() };
  }
  if (verb === 'stop-all') { const notes = Object.keys(HELPERS).map(stopHelper); await act('model-stop'); notes.push('model unloaded'); return { ok: true, note: notes.join('\n'), status: await status() }; }
  return { ok: false, note: `unknown action ${action}` };
}

/* ---- way 1: Tailscale (and this PC itself) ---- */
const onTailnet = a => { a = String(a || '').replace(/^::ffff:/, ''); if (a === '127.0.0.1' || a === '::1') return true; if (a.toLowerCase().startsWith('fd7a:115c:a1e0:')) return true; const m = a.match(/^100\.(\d+)\./); return !!m && +m[1] >= 64 && +m[1] <= 127; };
http.createServer(async (req, res) => {
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (!onTailnet(req.socket.remoteAddress)) return send(403, { error: 'only answered on the tailnet' });
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: 'PC key refused' });
  const action = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1)) || 'status';
  send(200, await act(action).catch(e => ({ ok: false, note: String(e.message || e) })));
}).listen(PORT, () => console.log(`Brenebase agent on :${PORT} (tailnet only), polling ${HUB}`));

/* ---- way 2: polling Brenebase ---- */
const H = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
let beat = 0;
for (;;) {
  try {
    /* every poll carries a fresh status now and then, so the PC tab is right even without Tailscale */
    const st = beat++ % 6 === 0 ? await status() : null;
    const r = await fetch(`${HUB}/api/agent/next`, { method: 'POST', headers: H, body: JSON.stringify({ status: st }) });
    if (r.status === 401) { console.log('PC key refused by Brenebase'); await new Promise(s => setTimeout(s, 60000)); continue; }
    const { cmd } = await r.json();
    if (cmd) { console.log(`doing ${cmd.action}`); const out = await act(cmd.action).catch(e => ({ ok: false, note: String(e.message || e) })); await fetch(`${HUB}/api/agent/done`, { method: 'POST', headers: H, body: JSON.stringify({ id: cmd.id, ...out }) }); }
    else await new Promise(s => setTimeout(s, 5000));
  } catch { await new Promise(s => setTimeout(s, 15000)); }
}
