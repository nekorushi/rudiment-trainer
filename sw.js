// Offline support: precache the app shell, then serve from cache and refresh
// in the background (stale-while-revalidate). New versions show up on the
// second launch after you deploy; bump CACHE to force a clean slate.
const CACHE = 'rudiments-shell-v4';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/audio.js',
  'js/backup.js',
  'js/log.js',
  'js/notation.js',
  'js/player.js',
  'js/routines.js',
  'js/rudiments.js',
  'js/sequencer.js',
  'js/settings.js',
  'js/store.js',
  'js/ui/controls.js',
  'js/ui/dom.js',
  'js/ui/drawer.js',
  'js/ui/library.js',
  'js/ui/logview.js',
  'js/ui/notation.js',
  'js/ui/routines.js',
  'js/ui/sticking.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // `reload` bypasses the HTTP cache: GitHub Pages sends max-age=600, so a plain
    // fetch right after a deploy could precache the previous version's files.
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
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
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const refresh = fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    const res = await refresh;
    if (res) return res;
    return req.mode === 'navigate' ? (await cache.match('index.html')) ?? Response.error() : Response.error();
  })());
});
