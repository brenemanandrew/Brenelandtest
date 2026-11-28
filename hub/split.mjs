/* Keep-local split: what goes to an outside model and what stays on the PC.

   What it is for: private material (chat logs, a persona's text, personal notes, work data, passwords) never needs to
   reach Claude for Claude to write the code around it. It is swapped for a placeholder on the way out and put back
   when the work comes home.

   What it is NOT for: getting Claude to write parts of something it declined, to be glued together afterwards.
   The placeholder carries no content, so Claude only ever writes the generic part, and it sees that a part was held back.

   Three kinds of private text:
     1. Anything Andrew wraps in [[local]] ... [[/local]]
     2. Files or paths on the keep-local list (KEEP_PATHS)
     3. Secrets (tokens, keys, passwords). These are removed and NEVER put back into anything sent out. */

export const KEEP_PATHS = [
  /(^|\/)brenai\/persona\.mjs$/, /(^|\/)data\//, /\.env$/, /(^|\/)users\/.*\.json$/, /brenai\.json$/, /shared\.json$/,
  /(^|\/)roster/i, /OT_Kiosk\.html$/, /\.vrm$/, /anims\.json$/,
];

const SECRET = [
  /sk-ant-[A-Za-z0-9_\-]{10,}/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /FlyV1 [A-Za-z0-9_\-+/=,]{20,}/g, /fo1_[A-Za-z0-9_\-]{20,}/g,
  /\b(?:password|passphrase|pin|token|secret|api[_-]?key)\s*[:=]\s*['"]?[^\s'"]{4,}/gi,
];

export function keepLocal(path) { return KEEP_PATHS.some(r => r.test(path)); }

/* text -> { out, held, secrets } ; held is what rejoin puts back */
export function split(text) {
  const held = []; let secrets = 0;
  let out = String(text || '').replace(/\[\[local\]\]([\s\S]*?)\[\[\/local\]\]/gi, (_, body) => {
    held.push(body); return `[[KEPT-LOCAL-${held.length}: private part held back on purpose; write code that takes it as input]]`;
  });
  for (const r of SECRET) out = out.replace(r, () => { secrets++; return '[[SECRET-REMOVED]]'; });
  return { out, held, secrets };
}

/* a list of files -> which go out and which stay */
export function splitFiles(files) {
  const send = [], stay = [];
  for (const f of files) (keepLocal(f.path) ? stay : send).push(f);
  return { send: send.map(f => ({ ...f, text: split(f.text).out })), stay: stay.map(f => f.path) };
}

/* put held parts back into what came home */
export function rejoin(text, held) {
  return String(text || '').replace(/\[\[KEPT-LOCAL-(\d+)[^\]]*\]\]/g, (m, n) => held[n - 1] ?? m);
}
