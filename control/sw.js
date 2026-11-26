/* M&M 통합 운송 관제 — 오프라인 앱 셸 */
const CACHE_PREFIX = 'mmtc-control-';
const CACHE = CACHE_PREFIX + 'v161-workspace-freshness';
const ASSETS = [
  './assets/js/core/workspace-freshness.js',
  './assets/js/ui/server-sheet-status.js',
  './assets/js/core/workspace-read-recovery.js',
  './assets/js/core/query-progress.js',
 './assets/js/ui/pages/historical-upload.js','./assets/js/ui/pages/historical-workbook-worker.js',
 './assets/js/ui/dispatch-workflow.js',
 './assets/js/core/route-packing.js','./assets/js/ui/route-packing.js','./assets/js/ui/fleet-a-teams.js',
 './assets/js/core/closing-contacts.js','./assets/js/ui/closing-contacts.js',
 './assets/js/core/essential-submission.js','./assets/js/ui/pages/essential-batch.js',
 './assets/js/core/training-default.js','./assets/js/core/signature-workbook.js','./assets/js/ui/training-common-ui.js',
 './assets/js/core/training-model.js','./assets/js/core/training-store.js','./assets/js/core/training-assets.js','./assets/js/core/essential-checks.js','./assets/js/core/education-workbook.js','./assets/js/ui/plan-training-ui.js','./assets/js/ui/pages/safety-training.js',
 './assets/js/core/safety-load.js','./assets/js/core/evaluation-period.js',
 './assets/js/core/driver-qualification.js','./assets/js/ui/driver-qualification-fields.js',
 './assets/js/ui/history-analysis-gate.js','./assets/js/core/history-date.js','./assets/js/core/monthly-history-model.js','./assets/js/core/monthly-history-store.js','./assets/js/core/monthly-history-worker.js','./assets/js/core/workspace-period.js','./assets/js/ui/pages/monthly-history.js',
 './assets/js/core/product-family.js','./assets/js/core/official-product-specs.js','./assets/js/core/product-spec-model.js','./assets/js/core/product-spec-store.js','./assets/js/core/fleet-integrity.js','./assets/js/ui/product-spec-ui.js','./assets/js/ui/fleet-integrity-view.js',
 './assets/js/core/crew-history.js','./assets/js/ui/crew-history-view.js',
 './assets/js/core/fleet-roster-registration.js',
 './assets/js/core/schedule-regions.js',
 './assets/js/core/kgm-auto-match.js',
 './assets/js/ui/pages/driver-order-links.js','./assets/js/core/operation-profile.js','./assets/js/core/shared-fleet.js','./assets/js/core/driver-account-preview.js','./assets/js/ui/operation-profile-fields.js','./assets/js/ui/pages/shared-fleet.js','./assets/js/ui/pages/driver-account-batch.js','./driver-app/safety-plans.js','./driver-app/vin-barcode.js',
 './assets/js/core/driver-contact-import.js','./assets/js/core/driver-contact-store.js','./assets/js/ui/pages/driver-contact-import-ui.js',
 './assets/js/core/safety-plan-common.js',
 './assets/js/core/workspace-lazy.js',
 './assets/js/core/dispatch-reference-model.js','./assets/js/core/dispatch-reference-worker.js','./assets/js/core/dispatch-reference-store.js','./assets/js/ui/pages/dispatch-reference.js',
 './assets/js/core/metro-fixed.js','./assets/js/ui/metro-fixed-reference.js',
 './assets/js/core/safety-plan-catalog.js','./assets/js/ui/safety-plan-products.js',
 './assets/js/core/equipment-safety.js','./assets/js/ui/equipment-safety-fields.js',
 './assets/js/core/kgm-model.js','./assets/js/core/kgm-worker.js','./assets/js/core/kgm-store.js','./assets/js/ui/pages/kgm.js','./assets/css/kgm.css',
  './assets/js/core/safety-fleet.js',
 './assets/js/core/forwarding-store.js','./assets/js/core/forwarding-model.js','./assets/js/ui/pages/forwarding.js','./assets/css/forwarding.css',
  './assets/js/core/operating-status.js',
  './assets/js/core/closing-status.js',
  './assets/js/ui/operating-status-view.js',
  './assets/js/ui/pages/driver-task-management.js',
  './driver-app/task-model.js',
  './assets/js/core/safety-plan-variants.js',
  './assets/js/ui/pages/safety-plan-variants-ui.js',
  './assets/js/core/safety-plan-fill.js',
  './assets/js/ui/pages/safety-plan-enhance.js',
  './vendor/fflate.js',
  './assets/js/core/safety-plan-workbook.js',
  './assets/js/core/safety-plan-store.js',
  './assets/js/ui/pages/safety-plan-center.js',
  './assets/css/notice-center.css',
  './assets/js/ui/pages/driver-notices.js',
  './driver-app/notice-model.js',
  './assets/js/ui/pages/driver-account-management.js',
  './assets/js/ui/pages/equipment-report-inbox.js',
  './assets/js/core/equipment-management.js',
  './assets/js/core/equipment-service-store.js',
  './assets/js/ui/pages/equipment-card.js',
  './assets/js/core/workspace-startup.js',
  './assets/js/ui/pages/finance-review.js',
  './assets/js/core/destination-regions.js',
  './assets/js/core/destination-regions-store.js',
  './assets/js/ui/pages/destination-regions.js',
  './assets/js/core/workspace-poll.js',
  './assets/js/core/dispatch-changes.js',
  './assets/js/ui/dispatch-change-view.js',
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/css/fonts.css',
  './assets/NotoSansKR.ttf',
  './assets/logo.png',
  './assets/logo-mark.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './vendor/xlsx.full.min.js',
  './assets/js/app.js',
  './assets/js/ui/pages/commercial-trucks.js',
  './assets/js/ui/pages/server-dashboard.js',
  './assets/js/core/auth.js',
  './assets/js/core/shared-auth.js',
  './assets/js/core/supabase-session.js',
  './assets/js/core/test-account-identity.js',
  './assets/js/core/dashboard-ledger.js',
  './assets/js/core/password-recovery.js',
  './assets/js/core/supabase-cloud.js',
  './assets/js/core/workspace-access.js',
  './assets/js/core/workspace-transfer.js',
  './assets/js/core/workspace-cache.js',
  './assets/js/core/customer-endpoint.js',
  './assets/js/core/cloud.js',
  './assets/js/core/driver-review.js',
  './assets/js/ui/driver-reviews.js',
  './assets/js/core/cloud-model.js',
  './assets/js/core/fleet.js','./assets/js/core/driver-master.js',
  './assets/js/core/unassign.js',
  './assets/js/core/dispatch-identity.js',
  './assets/js/core/dispatch-duplicates.js',
  './assets/js/core/transport-history.js',
  './assets/js/core/sheet-import.js',
  './assets/js/core/sheet-match-policy.js',
  './assets/js/ui/sheet-import-modal.js',
  './apps-script/MainBoardReadOnly.gs',
  './assets/js/core/schedule.js',
  './assets/js/ui/pages/schedule.js',
  './assets/js/core/settlement.js',
  './assets/js/core/settlement-import.js',
  './assets/js/core/dispatch-profile.js',
  './assets/js/ui/pages/settlement.js',
  './assets/js/ui/rate-table.js','./assets/js/ui/truck-stages.js',
  './assets/js/ui/pages/engine.js',
  './assets/js/core/demo.js',
  './assets/js/ui/login.js',
  './assets/js/ui/pages/admin.js',
  './assets/js/core/utils.js',
  './assets/js/core/db.js', './assets/js/core/equipment-policy.js',
  './assets/js/core/data.js',
  './assets/js/core/dispatch-metrics.js',
  './assets/js/core/brand-policy.js',
  './assets/js/core/product-history.js',
  './assets/js/core/product-history-store.js',
  './assets/js/core/importer.js',
  './assets/js/core/evaluation.js','./assets/js/core/system-use.js','./assets/js/ui/system-use.js',
  './assets/js/core/transport-performance.js',
  './assets/js/ui/performance-summary.js',
  './assets/js/core/assign.js',
  './assets/js/core/formation-policy.js',
  './assets/js/core/formation.js',
  './assets/js/ui/pages/formation.js',
  './assets/js/core/google.js',
  './assets/js/core/photos.js',
  './assets/js/core/safety.js',
  './assets/js/core/vehicle-safety-policy.js',
  './assets/js/core/vehicle-safety.js',
  './assets/js/ui/pages/vehicle-safety.js',
  './assets/js/core/safety-seed.js',
  './assets/js/ui/shell.js',
  './assets/js/ui/components.js',
  './assets/js/ui/mobile.js',
  './assets/js/ui/pages/dashboard.js',
  './assets/js/ui/pages/customer-share.js',
  './assets/js/ui/pages/truck-share.js',
  './truck-customer/view.js',
  './truck-customer/view.css',
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
  if (new URL(req.url).pathname.includes('/control/driver-app/') || new URL(req.url).pathname.endsWith('/shared-access.json') || new URL(req.url).pathname.includes('/control/supabase-pilot/') || new URL(req.url).pathname.includes('/control/customer/') || new URL(req.url).pathname.includes('/control/truck-customer/')) return;
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
