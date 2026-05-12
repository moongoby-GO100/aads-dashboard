// AADS Dashboard Service Worker — PWA 설치용
// Chat/API/build assets must stay network-only. Serving an old /chat shell after
// refresh can run stale message merge logic and hide responses that are in DB.
const CACHE_NAME = 'aads-v2-static-only';
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
