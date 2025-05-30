
const CACHE_NAME = 'cargo-agi-cache-v2'; // Incremented version for updates
const ASSETS_TO_CACHE = [
  '/', // Root path
  '/index.html',
  '/manifest.json',
  // Critical CDN resources
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=Orbitron:wght@400;500;700&display=swap',
  // Add paths to any critical local images/icons if you have them, e.g., '/icons/icon-192x192.png'
  // Note: The actual icon files listed in manifest.json should also be added here if they are to be precached.
  // For simplicity, ensure they are cacheable via the runtime fetch handler if not listed here.
];

// Install event: Pprecaches core assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching app shell');
        // Handle potential errors for individual assets, especially external ones
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

  // For navigation requests (HTML pages), try network first, then cache.
  // This ensures users get the latest HTML if online.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If successful, clone and cache it for offline use.
          if (response && response.status === 200 && event.request.method === 'GET') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, serve from cache. Fallback to root index.html.
          return caches.match(event.request)
                 .then(cachedResponse => cachedResponse || caches.match('/index.html'));
        })
    );
    return;
  }
  
  // Cache-First strategy for known static assets (local or CDN)
  const isPrecachedAsset = ASSETS_TO_CACHE.some(asset => url.href.startsWith(asset) || url.pathname === asset);
  const isFontAsset = url.origin === 'https://fonts.gstatic.com'; // Google font files

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
        console.warn(`[ServiceWorker] Error fetching ${event.request.url} from cache/network: ${err}`);
        // Optionally, return a fallback response for specific asset types if needed
      })
    );
    return;
  }

  // Network-First, then Cache for esm.sh modules and other dynamic assets
  // This ensures latest versions if online, but provides offline fallback.
  if (url.origin === 'https://esm.sh' || url.origin === self.location.origin) { // Also include same-origin assets not in precache list
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
                // For JS modules from esm.sh, if not in cache, it's an error if offline
                if (url.origin === 'https://esm.sh') {
                    console.warn(`[ServiceWorker] esm.sh module ${event.request.url} not found in cache and network failed.`);
                    // Return an empty JS response or error to avoid breaking script parsing
                    return new Response('', { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'application/javascript' } });
                }
                return Response.error(); 
            });
        })
    );
    return;
  }
  
  // Default: Network-only for all other requests (e.g., API calls like Gemini).
  // These should not be cached by the service worker by default.
  event.respondWith(fetch(event.request));
});
