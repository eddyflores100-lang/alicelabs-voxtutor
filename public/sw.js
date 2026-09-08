/* VoxTutor service worker — mínimo y seguro.
 * Solo cachea estáticos inmutables (/_next/static, iconos). Todo lo demás pasa a red.
 * Así la app es instalable (PWA) sin arriesgar contenido desactualizado. */
const CACHE = 'voxtutor-static-v2';
const PRECACHE = ['/logo.svg', '/og.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/logo.svg' ||
    url.pathname === '/og.png' ||
    url.pathname.startsWith('/icons/');

  if (!isStatic) return; // navegación y demás: red directa, sin caché

  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return cached ?? Response.error();
      }
    })
  );
});
