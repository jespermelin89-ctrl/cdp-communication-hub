// CDP Communication Hub — Service Worker
// Minimal offline-capable SW. Caches shell + static assets.
// Network-first for API calls, cache-first for static assets.

const CACHE_NAME = 'cdp-hub-v1';
const OFFLINE_URL = '/';

const PRECACHE = [
  '/',
  '/inbox',
  '/drafts',
  '/offline.html',
];

// Install — precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE).catch(() => {})
    )
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API calls — network only (never cache auth/data)
  if (url.pathname.startsWith('/api/')) return;

  // Navigation — network first, fallback to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offlineCache = await caches.match(OFFLINE_URL);
          return offlineCache || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
