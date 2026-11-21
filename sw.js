// Service worker : l'application fonctionne entièrement hors ligne.
// À CHAQUE MODIFICATION DE FICHIER : incrémenter VERSION (et APP_VERSION dans js/version.js).
// La liste ASSETS est vérifiée par les tests (tests/check-sw.mjs).
const VERSION = '0.4.0';
const CACHE = `carnet-maison-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/version.js',
  'js/core/backup.js',
  'js/core/dates.js',
  'js/core/db.js',
  'js/core/model.js',
  'js/core/photos.js',
  'js/core/reminders.js',
  'js/core/repo.js',
  'js/ui/components.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/nav.js',
  'js/views/artisans.js',
  'js/views/bienvenue.js',
  'js/views/entretien.js',
  'js/views/equipements.js',
  'js/views/home.js',
  'js/views/pieces.js',
  'js/views/rapport.js',
  'js/views/recherche.js',
  'js/views/reglages.js',
  'fonts/bricolage-grotesque-latin-ext-wght-normal.woff2',
  'fonts/bricolage-grotesque-latin-wght-normal.woff2',
  'fonts/figtree-latin-ext-wght-normal.woff2',
  'fonts/figtree-latin-wght-normal.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-maskable.svg',
  'icons/icon.svg',
];

self.addEventListener('install', event => {
  // Téléchargement sans cache HTTP pour garantir des fichiers à jour.
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    // Passage depuis la V0.1 (ancien cache « v1 ») : activation immédiate.
    if ((await caches.keys()).includes('carnet-maison-v1')) self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('carnet-maison-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// L'application propose « Mettre à jour » ; la nouvelle version s'active sur demande.
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });

// Cache d'abord : instantané et hors ligne. Les mises à jour passent par une nouvelle VERSION.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match('index.html')) || new Response('Hors ligne', { status: 503 });
    }
  })());
});
