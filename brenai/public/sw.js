// Brenai's service worker. Push notifications (below), and files kept on this device so the game starts fast (filled by install.js, and as you play).
//   Her outfits, moves, the 3D engine, fonts, pictures, set pieces and the hand tracker: taken from the device when kept there,
//   else downloaded once and kept (an outfit's address changes when the outfit does, so a kept one is never stale).
//   The game's own code: downloaded fresh when the network answers within 3 seconds (so a new version shows at once), else the kept copy.
//   Everything else (chat, her state, saves): always the network, never kept.
const ASSETS = 'brenai-assets-v1', CODE = 'brenai-code-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Notifications from Wizra when the page is closed (she is calling, sent something, or is back); tapping one opens the game.
self.addEventListener('push', e => { let d = {}; try { d = e.data.json(); } catch {} e.waitUntil(self.registration.showNotification(d.title || 'Wizra', { body: d.body || '', icon: '/me.svg', badge: '/me.svg', tag: 'wizra' })); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => { for (const c of list) if ('focus' in c) return c.focus(); return self.clients.openWindow('/'); })); });
const isAsset = u => (u.origin === self.location.origin && (/^\/api\/(outfit|clips|extra|thumb)\//.test(u.pathname) || u.pathname === '/api/anims' || /^\/(vendor|fonts|art)\//.test(u.pathname)))
  || /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\//.test(u.href) || /^https:\/\/storage\.googleapis\.com\/mediapipe-models\//.test(u.href);
const isCode = u => u.origin === self.location.origin && (u.pathname === '/' || /\.(js|mjs|css|html)$/.test(u.pathname)) && u.pathname !== '/sw.js';
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; let u; try { u = new URL(req.url); } catch { return; }
  if (isAsset(u)) {
    const fresh = u.pathname === '/api/anims' || /^\/api\/clips\//.test(u.pathname);   /* moves can be replaced: use the kept copy now, refresh it behind */
    e.respondWith(caches.open(ASSETS).then(async c => { const hit = await c.match(req, { ignoreVary: true });
      const get = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(() => {}); return r; });
      if (hit) { if (fresh) e.waitUntil(get.catch(() => {})); return hit; } return get; }));
    return;
  }
  if (isCode(u)) {
    e.respondWith(caches.open(CODE).then(async c => {
      const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()).catch(() => {}); return r; });
      const slow = new Promise(res => setTimeout(res, 3000, null));
      try { const r = await Promise.race([net, slow]); if (r) return r; } catch {}
      return (await c.match(req, { ignoreVary: true })) || net; }));
  }
});
