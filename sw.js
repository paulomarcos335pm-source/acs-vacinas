const CACHE_NAME = 'acs-vacinas-offline-v1';
const APP_SHELL = [
  './acs-vacinas-offline.html',
  './manifest.webmanifest',
  './icon.svg',
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdn.jsdelivr.net/npm/lucide@0.263.0/dist/umd/lucide.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of APP_SHELL) {
      try {
        await cache.add(asset);
      } catch (error) {
        console.warn('Falha ao salvar no cache:', asset, error);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('./acs-vacinas-offline.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
