/* Service worker: la app abre y funciona sin conexión.
 * Estrategia: cache-first para los archivos propios, red para todo lo demás.
 */

const VERSION = 'v4';
const CACHE = `pochohouse-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/router.js',
  'js/store.js',
  'js/calc.js',
  'js/ui.js',
  'js/util.js',
  'js/sync.js',
  'js/theme.js',
  'js/scan.js',
  'js/views/dashboard.js',
  'js/views/expenses.js',
  'js/views/expense-form.js',
  'js/views/fixed.js',
  'js/views/shopping.js',
  'js/views/goals.js',
  'js/views/settings.js',
  'js/views/onboarding.js',
  'js/views/scan-form.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un archivo no está; los pedimos de a uno.
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // La sincronización siempre va a la red: nunca se cachea.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match('index.html'));

      // Servimos lo cacheado al toque y refrescamos por detrás.
      return cached || network;
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
