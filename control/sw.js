/* M&M 통합 운송 관제 — 오프라인 앱 셸 */
const CACHE_PREFIX = 'mmtc-control-';
const CACHE = CACHE_PREFIX + 'v9-engine-history-upload';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/logo.png',
  './assets/logo-mark.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './vendor/xlsx.full.min.js',
  './assets/js/app.js',
  './assets/js/core/auth.js',
  './assets/js/core/transport-history.js',
  './assets/js/core/sheet-import.js',
  './assets/js/ui/sheet-import-modal.js',
  './apps-script/MainBoardReadOnly.gs',
  './assets/js/core/schedule.js',
  './assets/js/ui/pages/schedule.js',
  './assets/js/core/settlement.js',
  './assets/js/core/settlement-import.js',
  './assets/js/core/dispatch-profile.js',
  './assets/js/ui/pages/settlement.js',
  './assets/js/ui/pages/engine.js',
  './assets/js/core/demo.js',
  './assets/js/ui/login.js',
  './assets/js/ui/pages/admin.js',
  './assets/js/core/utils.js',
  './assets/js/core/db.js',
  './assets/js/core/data.js',
  './assets/js/core/importer.js',
  './assets/js/core/evaluation.js',
  './assets/js/core/assign.js',
  './assets/js/core/google.js',
  './assets/js/core/photos.js',
  './assets/js/core/safety.js',
  './assets/js/core/safety-seed.js',
  './assets/js/ui/shell.js',
  './assets/js/ui/components.js',
  './assets/js/ui/mobile.js',
  './assets/js/ui/pages/dashboard.js',
  './assets/js/ui/pages/board.js',
  './assets/js/ui/pages/assign.js',
  './assets/js/ui/pages/drivers.js',
  './assets/js/ui/pages/equipment.js',
  './assets/js/ui/pages/products.js',
  './assets/js/ui/pages/incidents.js',
  './assets/js/ui/pages/evaluation.js',
  './assets/js/ui/pages/settings.js',
  './assets/js/ui/pages/safety.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
