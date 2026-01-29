// ═══════════════════════════════════════════════════════════════════════════
// Service Worker - PV Sales Calculator PWA
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'pv-calculator-v7';
const DATASHEETS_CACHE = 'pv-datasheets-v1';

// Files to cache for offline use
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './catalog.json',
  './manifest.json',
  './logotech.png',
  './Primapaginapreventivo.png',
  './Paginabasevuota.png',
  './Paginabasecompletamentevuota.png',
  // External dependencies (will be cached on first load)
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate event - cleanup old caches (keep datasheets cache)
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  const keepCaches = [CACHE_NAME, DATASHEETS_CACHE];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => !keepCaches.includes(name))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle datasheet PDFs - cache for offline use (network-first, fallback to cache)
  if (url.pathname.includes('/datasheets/files/') && url.pathname.endsWith('.pdf')) {
    event.respondWith(
      caches.open(DATASHEETS_CACHE)
        .then((cache) => {
          return fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                // Cache the PDF for offline use
                cache.put(event.request, networkResponse.clone());
                console.log('[SW] Cached datasheet PDF:', url.pathname);
              }
              return networkResponse;
            })
            .catch(() => {
              // Network failed, try cache
              console.log('[SW] Serving datasheet from cache:', url.pathname);
              return cache.match(event.request);
            });
        })
    );
    return;
  }

  // Handle datasheets list API - cache for offline use
  if (url.pathname === '/datasheets' || url.pathname === '/datasheets/') {
    event.respondWith(
      caches.open(DATASHEETS_CACHE)
        .then((cache) => {
          return fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                // Cache the datasheets list
                cache.put(event.request, networkResponse.clone());
                console.log('[SW] Cached datasheets list');
              }
              return networkResponse;
            })
            .catch(() => {
              // Network failed, try cache
              console.log('[SW] Serving datasheets list from cache');
              return cache.match(event.request);
            });
        })
    );
    return;
  }

  // Skip other API calls (upload, delete, catalog import) - these need network
  if (url.pathname.includes('/datasheets') || url.pathname.includes('/calc') || url.pathname.includes('/catalog/import')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline - funzionalità non disponibile' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // For everything else: cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version, but also update cache in background
          event.waitUntil(
            fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME)
                    .then((cache) => cache.put(event.request, networkResponse));
                }
              })
              .catch(() => {}) // Ignore network errors for background update
          );
          return cachedResponse;
        }

        // Not in cache - fetch from network and cache it
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // Clone the response before caching
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));

            return networkResponse;
          })
          .catch(() => {
            // Network failed and not in cache
            // Return a fallback for HTML requests
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
    });
  }
});
