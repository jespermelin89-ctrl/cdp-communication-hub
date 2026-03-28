// CDP Communication Hub — Service Worker
// Shell + static assets: cache-first
// Brain-core read-only API endpoints: network-first, cache fallback
// All other API calls: network-only

const CACHE_NAME = 'cdp-hub-v2';
const API_CACHE_NAME = 'cdp-hub-api-v2';
const OFFLINE_URL = '/';

const PRECACHE = [
  '/',
  '/inbox',
  '/drafts',
  '/offline.html',
];

// Read-only brain-core endpoints safe to serve from cache when offline
const CACHEABLE_API = [
  '/api/v1/brain-core/writing-profile',
  '/api/v1/brain-core/classification',
  '/api/v1/brain-core/contacts',
  '/api/v1/brain-core/daily-summary',
  '/api/v1/health',
];

// ── Install — precache shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE).catch(() => {})
    )
  );
  self.skipWaiting();
});

// ── Activate — clean up old caches ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // ── Brain-core read-only API: network-first, cache fallback ────────────
  if (CACHEABLE_API.some((p) => url.pathname === p)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches
              .open(API_CACHE_NAME)
              .then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { cacheName: API_CACHE_NAME });
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline', cached: false }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  // ── Other API calls — network only (auth, mutations, etc.) ────────────
  if (url.pathname.startsWith('/api/')) return;

  // ── Navigation — network-first, cache fallback, offline page ──────────
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
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // ── Static assets — cache-first ───────────────────────────────────────
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
