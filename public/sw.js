const PREFIX = `katelyn-tetris:${self.registration.scope}:`;
const CACHE = `${PREFIX}development-classic-violet-v1`;
const SHELL = [
  './', './index.html', './guide.html', './styles.css', './app.js', './engine.js',
  './pwa.js', './guide.js', './landing.js', './manifest.webmanifest',
  './assets/Katelyn.jpg', './assets/I.jpg', './assets/O.jpg', './assets/T.jpg',
  './assets/S.jpg', './assets/Z.jpg', './assets/J.jpg', './assets/L.jpg',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-180.png',
];
const allowed = new Set(SHELL.map(url => new URL(url, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!allowed.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    return fetch(event.request);
  })());
});
