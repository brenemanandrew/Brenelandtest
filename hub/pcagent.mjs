/* Talking to the PC agent (pc/brenebase-agent.mjs): directly over Tailscale when Brenebase is on the tailnet,
   otherwise by leaving the command for the agent's next poll. Either way the caller gets one answer. */
import http from 'http';
import crypto from 'crypto';

const KEY = process.env.HUB_WORKER_TOKEN || '';
const PC = process.env.PC_TAILNET_HOST || '';
const PORT = +process.env.PC_AGENT_PORT || 8765;
export const ACTIONS = ['status', 'model-start', 'model-stop', 'start-all', 'stop-all', 'start:wizra', 'stop:wizra', 'start:town', 'stop:town', 'start:worker', 'stop:worker', 'logs:wizra', 'logs:town', 'logs:worker'];

const poll = { seen: 0, status: null, statusAt: 0, queue: [], waiting: new Map() };
export const pollOnline = () => Date.now() - poll.seen < 30000;
export const tailnetReady = () => !!(process.env.TS_PROXY && PC && KEY);

/* through Tailscale's userspace HTTP proxy: a plain HTTP request to the proxy with the full address */
function direct(action, ms) {
  return new Promise((ok, bad) => {
    const [host, port] = process.env.TS_PROXY.split(':');
    const req = http.request({ host, port: +port, method: 'GET', path: `http://${PC}:${PORT}/${encodeURIComponent(action)}`, headers: { authorization: `Bearer ${KEY}`, host: `${PC}:${PORT}` }, timeout: ms }, res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => { try { ok(JSON.parse(b)); } catch { bad(new Error(`agent answered ${res.statusCode}`)); } });
    });
    req.on('timeout', () => req.destroy(new Error('no answer over Tailscale')));
    req.on('error', bad); req.end();
  });
}

function queued(action, ms) {
  const cmd = { id: crypto.randomBytes(4).toString('hex'), action, at: Date.now() };
  poll.queue.push(cmd);
  return new Promise(ok => {
    const t = setTimeout(() => { poll.waiting.delete(cmd.id); ok({ ok: false, queued: true, note: pollOnline() ? 'sent to the PC, still working on it' : 'the PC agent is not checking in (PC off, asleep or agent not installed); it will run when it does' }); }, ms);
    poll.waiting.set(cmd.id, r => { clearTimeout(t); ok(r); });
  });
}

export async function call(action, ms = action === 'model-start' || action === 'start-all' ? 180000 : 10000) {
  if (!ACTIONS.includes(action)) return { ok: false, note: 'not an allowed action' };
  if (tailnetReady()) {
    try { const r = await direct(action, ms); if (r.status) { poll.status = r.status; poll.statusAt = Date.now(); } return { ...r, via: 'tailscale' }; }
    catch (e) { if (!pollOnline()) return { ok: false, via: 'tailscale', note: `Tailscale: ${e.message}. The agent is not polling either.` }; }
  }
  const r = await queued(action, pollOnline() ? ms : 4000);
  return { ...r, via: 'polling' };
}

export async function state() {
  const how = tailnetReady() ? 'tailscale' : 'polling';
  if (tailnetReady()) { const r = await call('status', 6000); if (r.ok) return { reach: 'tailscale', polling: pollOnline(), status: r.status }; }
  return { reach: pollOnline() ? 'polling' : 'offline', tailscaleSetUp: how === 'tailscale', status: poll.status, statusAge: poll.statusAt ? Math.round((Date.now() - poll.statusAt) / 1000) : null };
}

/* the agent's side of polling */
export function agentNext(body) {
  poll.seen = Date.now();
  if (body && body.status) { poll.status = body.status; poll.statusAt = Date.now(); }
  return poll.queue.shift() || null;
}
export function agentDone(body) {
  if (body.status) { poll.status = body.status; poll.statusAt = Date.now(); }
  const w = poll.waiting.get(body.id); if (w) { poll.waiting.delete(body.id); w(body); }
}

/* "as needed": a job needs the PC and nothing there is picking it up. Start the worker, and the model if the job needs it.
   At most once every 3 minutes per need, so a stuck PC is not hammered. */
const last = {};
export async function jumpstart(needs) {
  const done = [];
  for (const n of needs) {
    if (Date.now() - (last[n] || 0) < 180000) continue;
    last[n] = Date.now();
    const action = n === 'model' ? 'model-start' : `start:${n}`;
    if (n === 'model' && poll.status && poll.status.model && poll.status.model.loaded.length) continue;
    const r = await call(action);
    done.push(`${action}: ${r.ok ? 'ok' : r.note || 'no answer'}`);
  }
  return done;
}
