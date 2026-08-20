const CACHE_NAME = 'student-tracker-shell-v5';
const SHELL = [
  '/',
  '/index.html',
  '/pages/parent-dashboard.html',
  '/css/style.css',
  '/js/app.js',
  '/js/translations.js',
  '/assets/js/parent.js',
  '/manifest.json',
  '/Favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL).catch(() => undefined))
      .finally(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  // Never cache API responses.
  if (new URL(request.url).pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
  );
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'إشعار جديد',
    body: 'لديك إشعار جديد من المدرسة',
    icon: '/Favicon.ico',
    badge: '/Favicon.ico',
    url: '/',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/Favicon.ico',
      badge: data.badge || '/Favicon.ico',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'فتح التطبيق' },
        { action: 'close', title: 'إغلاق' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url === target && 'focus' in client) return client.focus();
        }
        return clients.openWindow ? clients.openWindow(target) : undefined;
      })
  );
});
