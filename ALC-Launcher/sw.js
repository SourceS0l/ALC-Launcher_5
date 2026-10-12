// Keeps the app working offline. Files come from the network first so every launch gets the newest
// version, and the cached copy is used when the PC is offline or the network is too slow.
// Requests ending in ?fresh skip the cache entirely (used by the update check).
const VERSION = 'alc-v2';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'web-api.js', 'manifest.webmanifest', 'version.json',
  'logo.png', 'logo-body.png', 'logo-bar.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.searchParams.has('fresh')) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(url.href, { cache: 'no-cache' })
      .then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (!hit) return net;
    e.waitUntil(net.catch(() => {}));   // let a slow download finish and refresh the cache
    const slow = new Promise(res => setTimeout(() => res(hit), 3000));   // give up on the network after 3s
    return Promise.race([net.catch(() => hit), slow]);
  }));
});
