/* Adapters: how each backend actually does the work.
     brief        writes a Claude Code prompt, nothing runs                         (cloud, free)
     claude       Claude API for the Planner and Expert                            (cloud, needs ANTHROPIC_API_KEY)
     claude-code  Claude Code on the PC (`claude -p` in the repo folder, on a branch) (PC worker)
     pc-model     the PC model through Bionic, same as the Wizra bridge             (PC worker)
     blender      headless Blender on the PC (worker/blender_ops.py)                (PC worker)
     pc-run       a known script on the PC (render checker, clip converter, deploy) (PC worker)
     meshy        Meshy API. Spends credits, so it always waits for an OK           (cloud, needs MESHY_API_KEY)
     link         opens one of Andrew's pages (mocap, kiosk)                        (browser)
   Jobs for the PC sit in the ledger as "queued" until worker/hub-worker.mjs picks them up. */
import { split } from './split.mjs';

export const PC_BACKENDS = ['claude-code', 'pc-model', 'blender', 'pc-run', 'merge', 'read', 'readdir'];
export const SPENDS = ['meshy'];

/* How each tool + mode is told to behave. The mode is the whole point: same tool, different handling. */
const STYLE = 'Andrew reads on his phone. Answer first, short. Plain words. Never use em dashes, use hyphens or commas. No flattery. Say what you are unsure of.';
export const PROMPTS = {
  planner: {
    plan: 'You are a project planner. Give: the goal in one line, scope (in / out), 3 to 6 milestones with rough dates, the top 3 risks, and the next 3 actions he can do this week.',
    breakdown: 'Break the thing into tasks of a day or less, in order, each starting with a verb. Mark the first one to do today.',
    week: 'Fit his tasks into a week. He works shifts at a distribution center, so assume evenings and weekends are the hobby time unless he says otherwise. Hard things first in the week.',
    retro: 'Run a short retro: what went well, what did not, what to change next time, one experiment to try.',
  },
  expert: {
    kaizen: 'You are a lean / kaizen practitioner in a distribution center. Use the right tool for the problem (A3, 5 whys, fishbone, value stream map, standard work, 5S, spaghetti diagram, kaizen event plan). Fill in the template with what he gave you and mark what you assumed.',
    pm: 'You are a senior project manager. Critical path, risks with owners, RACI, and a status line (green / yellow / red) when it helps.',
    ops: 'You are an operations lead in a distribution center (staffing, overtime, cross training, safety, SOPs). Practical and fair to the people on the floor.',
    game: 'You are a game designer. Talk mechanics, core loop, feel, pacing and scope for a solo developer working in Three.js.',
    art: 'You are an art and animation director for a cel-shaded Three.js game. Style, colour, silhouette, posing, timing. Give concrete steps he can do in Meshy, Blender or code.',
  },
  companion: {
    chat: 'Easy, warm conversation. Match his energy.',
    vent: 'He wants to vent. Let him. Agree that it sucks, match his heat, swear if he does. Do not lecture, do not fix, do not say "have you tried". Ask if he wants ideas only once he cools off. If he says he might hurt himself or someone, drop the act and take it seriously.',
    roleplay: 'Play the character or scene he sets up and stay in it until he says stop. If he is rehearsing a hard conversation, play the other person realistically, then step out and give two tips when he asks.',
    coach: 'Calm and practical. Ask what he wants out of the situation, then help him get there in small steps.',
  },
};

export function systemFor(tool, mode) {
  const p = PROMPTS[tool] && PROMPTS[tool][mode];
  return p ? `${p}\n\n${STYLE}` : STYLE;
}

/* A Claude Code brief. Private parts are held back by split(); the job keeps them to rejoin later. */
export function brief(job, projectNotes = '') {
  const { out, held, secrets } = split(job.text);
  const repo = job.repo || 'brenemanandrew/Brenelandtest';
  const lines = [
    `Repository: ${repo}. Work on a new branch named hub/${job.id}. Never push to main.`,
    `Read AGENTS.md and CLAUDE.md first if they exist, and follow them.`,
    job.mode === 'brief' ? 'Do the task below.' : `Mode: ${job.mode}. ${job.does}`,
    '', 'Task:', out, '',
    'When done: write an update file for Brenebase at .brenebase/updates/<YYYY-MM-DD>-<short-name>.md (front matter: project, by, date, branch, title; then ## Done, ## Tested, ## Not tested, ## Broken, ## Open, ## Settings changed as bullets) and commit it with the work. Then say what you changed, what you tested and what you could not test. Never use em dashes.',
  ];
  if (projectNotes) lines.push('', projectNotes);
  if (held.length) lines.push(`Note: ${held.length} part(s) were held back on purpose and are marked KEPT-LOCAL. Write code that takes them as input; do not invent them.`);
  return { prompt: lines.join('\n'), held, secrets };
}

/* ---- cloud backends ---- */
export async function runClaude(job, claude, projectNotes = '') {
  if (!claude) throw new Error('No ANTHROPIC_API_KEY on the hub, so the Planner and Expert cannot run in the cloud. Set it, or switch this job to the PC model.');
  const { out, held } = split(job.text);
  const r = await claude.beta.messages.create({
    model: process.env.HUB_MODEL || 'claude-opus-5-5', max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: job.tool === 'expert' ? 'high' : 'medium' },
    system: systemFor(job.tool, job.mode) + (projectNotes ? '\n\n' + projectNotes : ''), messages: [{ role: 'user', content: out }],
  });
  if (r.stop_reason === 'refusal') throw new Error('Claude declined this one.');
  const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { text, held };
}

const MESHY = 'https://api.meshy.ai/openapi';
async function meshy(method, p, body) {
  const key = process.env.MESHY_API_KEY || 'dummy-key-replaced-by-proxy';
  const r = await fetch(`${MESHY}/${p}`, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meshy ${r.status}: ${j.message || JSON.stringify(j).slice(0, 200)}`);
  return j;
}
/* Starts a Meshy task. Field names for image, retexture and rigging come from Meshy's docs as last known; check them on the first real run. */
export async function runMeshy(job) {
  const a = job.args || {};
  if (job.mode === 'generate' && a.image_url) return { meshy: 'v1/image-to-3d', task: (await meshy('POST', 'v1/image-to-3d', { image_url: a.image_url })).result };
  if (job.mode === 'generate') return { meshy: 'v2/text-to-3d', task: (await meshy('POST', 'v2/text-to-3d', { mode: 'preview', prompt: split(job.text).out.slice(0, 600) })).result };
  if (job.mode === 'retexture') return { meshy: 'v1/retexture', task: (await meshy('POST', 'v1/retexture', { model_url: a.model_url, text_style_prompt: split(job.text).out.slice(0, 600) })).result };
  if (job.mode === 'rig') return { meshy: 'v1/rigging', task: (await meshy('POST', 'v1/rigging', { model_url: a.model_url })).result };
  throw new Error(`Meshy has no mode ${job.mode}`);
}
export async function meshyStatus(kind, id) { return meshy('GET', `${kind}/${id}`); }

export const LINKS = {
  'motion:capture': t => `https://brenai.fly.dev/mocap.html${t ? `?rig=${t}` : ''}`,
  'make3d:rigstudio': () => 'https://brenerig.fly.dev/',
  'workapp:open': () => 'https://ardenot.fly.dev/',
  'workapp:roster': () => 'https://ardenot.fly.dev/',
};

/* ---- Copilot: only for safe, plain, non-sensitive bulk work ----
   Andrew's personal Microsoft Copilot has no API, so it is copy and paste: Brenebase prepares the prompt, he pastes the
   answer back. (COPILOT_TOKEN, a GitHub Models token, is an optional automatic path he does not use.) The fit check runs
   first, every time, and complex answers are reviewed by Claude Opus before he sees them (reviewCopilot). */
const NOT_FOR_COPILOT = {
  private: /\[\[local\]\]/i,
  personal: /\b(divorce|custody|lawsuit|attorney|lawyer|court|trial|deposition|mortgage|loan number|child support|ssn|social security|diagnos\w*|therapy|therapist|medication|bank account|routing number|password|passphrase|pin code)\b/i,
  adult: /\b(nsfw|sex\w*|nude|naked|porn\w*|explicit|lewd|erotic\w*|fetish)\b/i,
  coding: /```|\bfunction\s*\w*\s*\(|\bdef\s+\w+\(|=>\s*\{|\bclass\s+\w+\s*\{|\b(refactor|stack trace|traceback|compile error|fix (the|this|my) (code|bug)|write (a|the) (function|script|class))\b/i,
};
export function copilotFit(job, project) {
  const t = String(job.text || ''), why = [];
  if (NOT_FOR_COPILOT.private.test(t)) why.push('it has [[local]] private parts');
  if (split(t).secrets) why.push('it contains a password, token or key');
  if (NOT_FOR_COPILOT.personal.test(t)) why.push('it looks personal or sensitive (legal, medical, money or passwords)');
  if (NOT_FOR_COPILOT.adult.test(t)) why.push('it is not SFW');
  if (NOT_FOR_COPILOT.coding.test(t)) why.push('it is real coding (that goes to Claude Code)');
  if (project && project.private) why.push(`${project.name} is private (work material stays on the PC model for now)`);
  return { ok: !why.length, why };
}
export async function runCopilot(job, project) {
  const fit = copilotFit(job, project);
  if (!fit.ok) throw new Error(`Not sent to Copilot: ${fit.why.join('; ')}. Pick Claude or the PC model instead.`);
  const system = `${STYLE}\n\n${{ summarize: 'Summarize into the points that matter, shortest first.', rewrite: 'Rewrite for clarity and correct grammar. Keep the meaning and the voice.', draft: 'Write a first draft he can edit.', research: 'Answer plainly, say what you are unsure of.' }[job.mode] || ''}`;
  if (process.env.COPILOT_TOKEN) {
    const r = await fetch('https://models.github.ai/inference/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${process.env.COPILOT_TOKEN}`, 'content-type': 'application/json', accept: 'application/vnd.github+json' }, body: JSON.stringify({ model: process.env.COPILOT_MODEL || 'openai/gpt-4.1', messages: [{ role: 'system', content: system }, { role: 'user', content: job.text }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GitHub Models ${r.status}: ${(j.error && j.error.message) || JSON.stringify(j).slice(0, 200)}`);
    return { text: j.choices?.[0]?.message?.content || '', via: 'GitHub Models' };
  }
  /* copy and paste: the prompt is ready, Andrew pastes the answer back */
  return { relay: true, prompt: `${system}\n\n---\n\n${job.text}`, link: process.env.COPILOT_URL || 'https://copilot.microsoft.com/', via: 'copy and paste' };
}

/* ---- Claude Opus checks Copilot's work ----
   review setting: 'complex' (default: long answers, long prompts, research and drafts), 'all', or 'off' (Andrew turns it
   off once Copilot has earned it). The track record (how often Opus had to correct it) is kept so he can decide. */
export function needsReview(job, answer, setting) {
  if (setting === 'off') return false;
  if (setting === 'all') return true;
  return ['research', 'draft'].includes(job.mode) || String(answer || '').length > 600 || String(job.text || '').length > 1500;
}
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdict', 'corrected', 'corrections', 'note'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'fixed', 'unreliable'], description: 'ok = no changes needed; fixed = corrected; unreliable = too wrong to fix, say why in note' },
    corrected: { type: 'string', description: 'The answer to give Andrew: Copilot\'s answer with corrections applied, otherwise unchanged. Empty if unreliable.' },
    corrections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['was', 'now', 'why'], properties: { was: { type: 'string' }, now: { type: 'string' }, why: { type: 'string' } } } },
    note: { type: 'string', description: 'One sentence for Andrew' },
  },
};
export async function reviewCopilot(job, answer, claude) {
  if (!claude) return { verdict: 'unchecked', corrected: answer, corrections: [], note: 'Not checked: Brenebase has no ANTHROPIC_API_KEY, so Claude Opus could not review this.' };
  const r = await claude.beta.messages.create({
    model: 'claude-opus-5-5', max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    system: 'You check another assistant\'s answer before Andrew sees it. Fix factual errors, wrong numbers, made-up sources, things that do not answer what he asked, and unclear wording. Do not rewrite for style when it is already fine, and do not add length. List every change you make. Never use em dashes, use hyphens or commas.',
    messages: [{ role: 'user', content: `What Andrew asked (${job.mode}):\n${job.text}\n\nCopilot's answer:\n${answer}` }],
  });
  if (r.stop_reason === 'refusal') return { verdict: 'unchecked', corrected: answer, corrections: [], note: 'Claude declined to review this one.' };
  const t = r.content.find(b => b.type === 'text');
  return JSON.parse(t.text);
}
