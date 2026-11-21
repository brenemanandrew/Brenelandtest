/* The hub worker: runs on Andrew's PC, connects OUT to the hub (the hub cannot reach the PC), picks up jobs and sends results back.
   Same idea as brenai/bridge/wizra-bridge.mjs, made generic: each capability is turned on only if its tool is found.

   Capabilities
     pc-model     Bionic / LM Studio server on port 1234 (OpenAI-style /v1/chat/completions), the model the Wizra bridge uses
     claude-code  the `claude` command (Claude Code). Runs `claude -p` in the repo folder on a new branch
     blender      Blender, run headless with blender_ops.py
     pc-run       named scripts in PC_SCRIPTS below (render checker, clip converter)

   Env (setx on Windows)
     HUB_URL           https://<your hub>.fly.dev
     HUB_WORKER_TOKEN  same value as the hub's secret
     BIONIC_URL        default http://127.0.0.1:1234
     BLENDER           path to blender.exe (default: "blender" on PATH)
     REPOS             folder that holds your repo checkouts (default: %USERPROFILE%\repos)
   Run: node hub-worker.mjs */
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const HUB = (process.env.HUB_URL || 'http://localhost:8080').replace(/\/$/, '');
const TOKEN = process.env.HUB_WORKER_TOKEN || '';
const BIONIC = process.env.BIONIC_URL || 'http://127.0.0.1:1234';
const BLENDER = process.env.BLENDER || 'blender';
const REPOS = process.env.REPOS || path.join(os.homedir(), 'repos');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (!TOKEN) { console.log('Set HUB_WORKER_TOKEN first.'); process.exit(1); }

/* named scripts the hub may ask for. Nothing outside this list runs. */
const PC_SCRIPTS = {
  'make3d:check': j => ['node', [path.join(REPOS, 'Brenelandtest/pipeline/jstest/piece.mjs'), j.args.piece || '']],
  'motion:library': j => ['node', [path.join(REPOS, 'Brenelandtest/brenai/tools/clipconv.mjs'), j.args.in || path.join(REPOS, 'clips-in'), j.args.out || path.join(REPOS, 'clips-out')]],
  'ship:test': j => ['npx', ['serve', path.join(REPOS, j.args.site || 'Brenelandtest/site')]],
};

const found = cmd => spawnSync(cmd, ['--version'], { shell: true, stdio: 'ignore' }).status === 0;
async function bionicUp() { try { return (await fetch(`${BIONIC}/v1/models`)).ok; } catch { return false; } }
const can = [];
if (await bionicUp()) can.push('pc-model');
if (found('claude')) can.push('claude-code');
if (found(`"${BLENDER}"`)) can.push('blender');
can.push('pc-run');
console.log(`hub worker: ${HUB}\ncan do: ${can.join(', ')}`);

const run = (cmd, args, cwd, input) => new Promise(ok => {
  const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
  let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  if (input) { p.stdin.write(input); p.stdin.end(); }
  p.on('close', code => ok({ code, out: out.slice(-20000), err: err.slice(-4000) }));
});

async function doJob(j) {
  if (j.backend === 'pc-model') {
    const r = await fetch(`${BIONIC}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: j.system || '' }, { role: 'user', content: j.text }], temperature: 0.8, max_tokens: 800 }) });
    const d = await r.json(); return { ok: r.ok, text: d.choices?.[0]?.message?.content || '', error: r.ok ? undefined : JSON.stringify(d).slice(0, 300) };
  }
  if (j.backend === 'claude-code') {
    const repo = path.join(REPOS, (j.repo || 'brenemanandrew/Brenelandtest').split('/').pop());
    if (!fs.existsSync(repo)) return { ok: false, error: `No checkout at ${repo}. Clone it there or set REPOS.` };
    await run('git', ['checkout', '-B', `hub/${j.id}`], repo);
    const r = await run('claude', ['-p', '--output-format', 'text'], repo, j.prompt);
    const diff = await run('git', ['diff', '--stat', 'HEAD'], repo);
    return { ok: r.code === 0, text: r.out, result: { branch: `hub/${j.id}`, diff: diff.out }, error: r.code ? r.err : undefined };
  }
  if (j.backend === 'blender') {
    const r = await run(BLENDER, ['-b', '--python', path.join(HERE, 'blender_ops.py'), '--', JSON.stringify({ mode: j.mode, ...j.args })], REPOS);
    const line = r.out.split('\n').reverse().find(l => l.startsWith('HUB_RESULT '));
    return { ok: r.code === 0 && !!line, text: line ? line.slice(11) : r.err || r.out.slice(-2000), error: r.code ? r.err : undefined };
  }
  if (j.backend === 'pc-run') {
    const f = PC_SCRIPTS[`${j.tool}:${j.mode}`]; if (!f) return { ok: false, error: `No PC script for ${j.tool}:${j.mode}` };
    const [cmd, args] = f(j); const r = await run(cmd, args, REPOS);
    return { ok: r.code === 0, text: r.out || r.err, error: r.code ? r.err : undefined };
  }
  return { ok: false, error: `This PC cannot do ${j.backend}` };
}

const H = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
for (;;) {
  try {
    const r = await fetch(`${HUB}/api/worker/next?can=${can.join(',')}`, { headers: H });
    if (r.status === 401) { console.log('Token refused: the PC and hub secrets do not match.'); await new Promise(s => setTimeout(s, 30000)); continue; }
    const { job } = await r.json();
    if (job) {
      console.log(`job ${job.id}: ${job.label}`);
      const out = await doJob(job).catch(e => ({ ok: false, error: String(e.message || e) }));
      await fetch(`${HUB}/api/worker/done`, { method: 'POST', headers: H, body: JSON.stringify({ id: job.id, ...out }) });
      console.log(`  ${out.ok ? 'done' : 'failed'}`);
    } else await new Promise(s => setTimeout(s, 4000));
  } catch (e) { console.log('hub not reachable, retrying'); await new Promise(s => setTimeout(s, 10000)); }
}
