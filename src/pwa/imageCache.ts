import {
  countCached,
  imageCacheName,
  imageNameFromUrl,
  staleImageCaches,
  warmImages,
} from './imageWarmup';
import { getPwa, set } from './register';

/**
 * Background warm-up of the offline image cache (the only place besides the
 * service worker that touches it). State is derived from the cache contents,
 * so a closed tab simply resumes on the next launch.
 */

const RECHECK_AFTER_FAILURE_MS = 60 * 1000;
const LAZY_RECOUNT_MS = 15 * 1000;

let started = false;

function scopePath(): string {
  return new URL('./', document.baseURI).pathname;
}

function saveDataOn(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

async function cachedNames(cache: Cache): Promise<Set<string>> {
  const out = new Set<string>();
  for (const req of await cache.keys()) {
    const n = imageNameFromUrl(req.url);
    if (n) out.add(n);
  }
  return out;
}

function waitOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
}

/** Start once per page, after first render; `referenced` comes from the loaded question bank. */
export function startImageWarmup(referenced: readonly string[]) {
  if (started || !getPwa().supported || !('caches' in window)) return;
  started = true;
  void run(referenced);
}

async function run(referenced: readonly string[]) {
  const name = imageCacheName(scopePath(), __IMAGE_DATA_VERSION__);
  let cache: Cache;
  try {
    cache = await caches.open(name);
  } catch {
    return; // Cache Storage unavailable: the app still works online
  }

  const saveData = saveDataOn();
  try {
    set({ saveData, imagesTotal: referenced.length, imagesCached: countCached(referenced, await cachedNames(cache)) });
  } catch {
    return;
  }
  if (saveData) {
    // Data saver: the service worker stores images as they are viewed; just keep the count fresh.
    const recount = async () => set({ imagesCached: countCached(referenced, await cachedNames(cache)) });
    await recount();
    window.setInterval(() => void recount().catch(() => undefined), LAZY_RECOUNT_MS);
    return;
  }

  for (;;) {
    const have = await cachedNames(cache);
    const result = await warmImages(referenced, have, {
      download: async (img) => {
        const url = new URL(`img/${img}`, document.baseURI).href;
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Always store from the page too: the controlling worker may be an older version
        // without the image route (during an update), and a duplicate put is harmless.
        await cache.put(url, res);
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      waitUntilAllowed: waitOnline,
      cancelled: () => false,
      onProgress: (cached) => set({ imagesCached: cached }),
    });
    if (result.failed.length === 0) break;
    // Some images failed even after retries: try again later (or when back online).
    await Promise.race([
      new Promise((r) => setTimeout(r, RECHECK_AFTER_FAILURE_MS)),
      new Promise((r) => window.addEventListener('online', r, { once: true })),
    ]);
  }

  // Complete: drop image caches of older data versions of this app.
  try {
    for (const old of staleImageCaches(await caches.keys(), scopePath(), name)) await caches.delete(old);
  } catch {
    // cleanup is best effort
  }
}
