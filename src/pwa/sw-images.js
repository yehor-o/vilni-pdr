/* Image route of the service worker (imported by the Workbox-generated sw.js).
 * Built by vite.config.ts: the VERSION placeholder is replaced and the file is
 * emitted as sw-images-<version>.js, so a data change also changes sw.js.
 *
 * Question images (<scope>/img/*.webp) are served cache-first from one image
 * cache per app scope and data version; the app fills that cache in the
 * background (src/pwa/imageCache.ts). Cache name must match
 * imageCacheName() in src/pwa/imageWarmup.ts.
 */
(() => {
  const VERSION = '__IMAGE_DATA_VERSION__';
  const scopePath = new URL(self.registration.scope).pathname;
  const IMAGE_CACHE = `vilni-pdr-images:${scopePath}:${VERSION}`;
  const imgPrefix = `${scopePath}img/`;

  async function serveImage(event) {
    const request = event.request;
    const cache = await caches.open(IMAGE_CACHE);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const response = await fetch(request);
      // Only successful same-origin responses are stored.
      if (response.ok && response.type === 'basic') {
        event.waitUntil(cache.put(request.url.split('?')[0], response.clone()));
      }
      return response;
    } catch (err) {
      // Offline: an older image cache may still hold it while a data update fills the new one.
      const older = await caches.match(request, { ignoreSearch: true });
      if (older) return older;
      throw err;
    }
  }

  self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (!url.pathname.startsWith(imgPrefix) || !url.pathname.endsWith('.webp')) return;
    event.respondWith(serveImage(event));
  });
})();
