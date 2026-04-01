/**
 * Pa_mSikA — Service Worker v3.0
 * JS files: network-first (always fresh)
 * CSS/images: cache-first (performance)
 * API: never cached
 */

const CACHE_NAME = 'pamsika-static-v3';
const CACHE_VERSION = 3;

const JS_FILES = ['/js/api.js', '/js/app.js'];

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/api.js',
  '/js/app.js',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // NEVER intercept API requests — let them go straight to network
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for HTML pages
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Network-first for JS files — CRITICAL: ensures fresh JS is always served
  if (JS_FILES.some(f => url.pathname === f)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (CSS, images, fonts)
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
