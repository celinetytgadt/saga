// Saga – service worker: app werkt snel en ook zonder netwerk.
// Strategie: toon wat in de cache zit, haal ondertussen de nieuwste versie op.
const CACHE = 'saga-v13';
const SCHIL = [
  './',
  'index.html',
  'css/saga.css',
  'js/app.js',
  'js/model.js',
  'js/store.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SCHIL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((sleutels) => Promise.all(sleutels.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const eigen = url.origin === self.location.origin;
  const fonts = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (e.request.method !== 'GET' || !(eigen || fonts)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const bewaard = await cache.match(e.request, { ignoreSearch: eigen });
      const vers = fetch(e.request)
        .then((antwoord) => {
          if (antwoord.ok || antwoord.type === 'opaque') cache.put(e.request, antwoord.clone());
          return antwoord;
        })
        .catch(() => bewaard);
      return bewaard || vers;
    })
  );
});
