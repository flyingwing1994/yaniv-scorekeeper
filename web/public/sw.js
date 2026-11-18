// Service worker: app-shell offline beschikbaar maken. API-verkeer gaat altijd naar het netwerk.
const CACHE = 'yaniv-shell-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// Haal ook de gehashte JS/CSS-bundels uit index.html op, zodat de app direct na de eerste keer offline werkt.
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const html = await (await cache.match('/')).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  await cache.addAll(assets);
  // Lettertypes (alleen Latijnse subsets) uit de CSS-bundel, zodat de typografie ook offline klopt.
  for (const css of assets.filter(a => a.endsWith('.css'))) {
    const text = await (await cache.match(css)).text();
    const fonts = [...text.matchAll(/url\((\/assets\/[^)]*latin[^)]*\.woff2)\)/g)].map(m => m[1]);
    await cache.addAll([...new Set(fonts)]);
  }
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Gehashte bundels: cache-first (ze veranderen nooit).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Pagina's en overige bestanden: netwerk eerst, cache als terugval.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? '/' : req, copy)); }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then(hit => hit || caches.match('/')))
  );
});
