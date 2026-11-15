// A static server for the harness: the live mirror (breneland-live/) with game-waves' client files laid over it, the engines at
// /engines/, the harness at /harness/. node server.mjs [port]
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '../../..');
const LIVE = path.join(REPO, 'breneland-live'), CLIENT = path.join(REPO, 'game-waves/client'), ENG = path.join(REPO, 'game-waves/server/lib/table-games');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
export function resolve(url) {
  const p = decodeURIComponent(url.split('?')[0]);
  if (p.includes('..')) return null;
  if (p.startsWith('/engines/')) return path.join(ENG, p.slice(9));
  if (p.startsWith('/harness/')) return path.join(HERE, p.slice(9));
  if (p === '/' ) return path.join(HERE, 'index.html');
  const c = path.join(CLIENT, p); if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return path.join(LIVE, p);
}
export function start(port = 0) {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const f = resolve(q.url);
      if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end('no'); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
    });
    s.listen(port, '127.0.0.1', () => res(s));
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const s = await start(Number(process.argv[2] || 8765)); console.log('harness on http://127.0.0.1:' + s.address().port + '/?game=word-weave'); }
