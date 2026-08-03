// OHVIS Service Worker - PWA install and app push notifications.
// Chat/API/build assets must stay network-only. Serving an old /chat shell after
// refresh can run stale message merge logic and hide responses that are in DB.
const CACHE_NAME = 'ohvis-v3-static-only';
const PRECACHE_URLS = ['/login', '/kakaobot'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/chat') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/_next')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || '오비스';
  const options = {
    body: payload.body || '응답이 완료되었습니다.',
    tag: payload.tag || 'ohvis-notification',
    icon: payload.icon || '/icon-192x192.png',
    badge: payload.badge || '/icon-192x192.png',
    data: {
      url: payload.url || '/chat',
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/chat';

  event.waitUntil((async () => {
    const url = new URL(targetUrl, self.location.origin).href;
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
