// Shows a notification from Wizra when the page is closed (she is calling, sent something, or is back), and opens the game when it is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => { let d = {}; try { d = e.data.json(); } catch {} e.waitUntil(self.registration.showNotification(d.title || 'Wizra', { body: d.body || '', icon: '/me.svg', badge: '/me.svg', tag: 'wizra' })); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => { for (const c of list) if ('focus' in c) return c.focus(); return self.clients.openWindow('/'); })); });
