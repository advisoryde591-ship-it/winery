// Service worker: שומר את קבצי האפליקציה כדי שתיפתח גם בלי רשת.
const CACHE = 'cellar-v21';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js', 'ai.js', 'manifest.webmanifest', 'cellar.js', 'sync.js', 'firebase-config.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// קבצים מקומיים: קודם רשת (תמיד בודקים מול השרת, כדי שלא יתערבבו קבצים ישנים וחדשים),
// ובלי רשת - מהמטמון. קריאות API לא נשמרות.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
