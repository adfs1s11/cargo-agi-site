
const CACHE_NAME = 'cargo-agi-cache-v3'; // Incremented version for updates
const ASSETS_TO_CACHE = [
  './', // Alias for index.html for root path
  './index.html',
  './manifest.json',
  // Add paths to your actual icon files. Ensure these exist.
  // Example: if your icons are in root/icons/
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/maskable-icon-192x192.png',
  './icons/maskable-icon-512x512.png',
  // Critical CDN resources (these are absolute URLs and are fine)
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=Orbitron:wght@400;500;700&display=swap',
  // Note: Main JS (index.tsx) and other local JS/TSX components are loaded via esm.sh through the importmap
  // or dynamically imported, so they are typically handled by the runtime fetch handler below,
  // but if you had a direct non-module script like <script src="./app.js">, you'd add './app.js' here.
];

// Install event: Precaches core assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching app shell');
        const cachePromises = ASSETS_TO_CACHE.map(assetUrl => {
            return cache.add(assetUrl).catch(err => {
                console.warn(`[ServiceWorker] Failed to cache ${assetUrl}: ${err}`);
            });
        });
        return Promise.all(cachePromises);
      })
      .catch(error => {
        console.error('[ServiceWorker] Failed to open cache or pre-cache assets during install:', error);
      })
  );
  self.skipWaiting();
});

// Activate event: Cleans up old caches.
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log(`[ServiceWorker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event: Serves assets from cache or network.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategy:
  // 1. For navigation (HTML pages): Network first, then cache.
  // 2. For assets defined in ASSETS_TO_CACHE (local static files, CDN CSS/Fonts): Cache first, then network.
  // 3. For esm.sh modules and other same-origin requests not in ASSETS_TO_CACHE: Network first, then cache.
  // 4. For other cross-origin requests (like Gemini API): Network only.

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && event.request.method === 'GET') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cached index.html or the root path if specific page not cached.
          return caches.match(event.request)
                 .then(cachedResponse => cachedResponse || caches.match('./index.html') || caches.match('./'));
        })
    );
    return;
  }

  const isPrecachedAsset = ASSETS_TO_CACHE.some(asset => url.href === new URL(asset, self.location.origin).href);
  const isFontAsset = url.origin === 'https://fonts.gstatic.com'; // Google font files are fetched by the Google Fonts CSS

  if (isPrecachedAsset || isFontAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      }).catch(err => {
        console.warn(`[ServiceWorker] Error fetching ${event.request.url} (precached/font) from cache/network: ${err}`);
      })
    );
    return;
  }
  
  // Network-First, then Cache for esm.sh modules and other dynamic local assets
  if (url.origin === 'https://esm.sh' || (url.origin === self.location.origin && !isPrecachedAsset)) {
     event.respondWith(
        fetch(event.request)
        .then(response => {
            if (response && response.status === 200 && event.request.method === 'GET') {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
            }
            return response;
        })
        .catch(() => {
            return caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                if (url.origin === 'https://esm.sh') {
                    console.warn(`[ServiceWorker] esm.sh module ${event.request.url} not found in cache and network failed.`);
                    return new Response('', { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'application/javascript' } });
                }
                // For other local assets not precached and not found, this would be a 404.
                // The browser will handle the 404 if fetch fails and nothing is in cache.
            });
        })
    );
    return;
  }
  
  // Default: Network-only for all other requests (e.g., API calls like Gemini).
  event.respondWith(fetch(event.request));
});
