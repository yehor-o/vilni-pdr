/**
 * Pure logic of the offline image cache: naming/versioning, which caches to
 * delete, and a resumable downloader with limited concurrency and retries.
 * No browser APIs here; src/pwa/imageCache.ts wires it to Cache Storage.
 */

/** Parallel downloads while warming the image cache. */
export const IMAGE_CONCURRENCY = 6;
/** Extra attempts per image after the first failure, with these delays. */
export const RETRY_DELAYS_MS = [1000, 4000];

/**
 * Image caches are named per app scope (several apps can share a GitHub Pages
 * origin) and per data version (a hash of the referenced image files).
 * Must match public-side logic in src/pwa/sw-images.js.
 */
export const IMAGE_CACHE_PREFIX = 'vilni-pdr-images';

export function imageCachePrefix(scopePath: string): string {
  return `${IMAGE_CACHE_PREFIX}:${scopePath}:`;
}

export function imageCacheName(scopePath: string, version: string): string {
  return imageCachePrefix(scopePath) + version;
}

/** Older image caches of this app scope, safe to delete once `current` is complete. */
export function staleImageCaches(cacheNames: readonly string[], scopePath: string, current: string): string[] {
  const prefix = imageCachePrefix(scopePath);
  return cacheNames.filter((n) => n.startsWith(prefix) && n !== current);
}

/** Distinct image names referenced by the question bank, in bank order. */
export function referencedImages(topics: readonly { questions: readonly { images: readonly string[] }[] }[]): string[] {
  const seen = new Set<string>();
  for (const t of topics) for (const q of t.questions) for (const i of q.images) seen.add(i);
  return [...seen];
}

/** File name of a cached request URL (`…/img/name.webp?x` → `name.webp`). */
export function imageNameFromUrl(url: string): string | null {
  const m = /\/img\/([^/?#]+\.webp)(?:[?#]|$)/.exec(url);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Referenced images present in the cache. */
export function countCached(referenced: readonly string[], cached: ReadonlySet<string>): number {
  let n = 0;
  for (const name of referenced) if (cached.has(name)) n += 1;
  return n;
}

export interface WarmDeps {
  /** Download one image and store it; throws on failure. */
  download(name: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** Resolves when downloading may continue (e.g. once back online). */
  waitUntilAllowed(): Promise<void>;
  /** True when the run should stop (page leaving, superseded). */
  cancelled(): boolean;
  onProgress(cached: number, total: number): void;
}

export interface WarmOptions {
  concurrency?: number;
  retryDelaysMs?: readonly number[];
}

export interface WarmResult {
  cached: number;
  total: number;
  failed: string[];
  cancelled: boolean;
}

/**
 * Downloads every referenced image not yet cached. Already cached images are
 * skipped, so a run interrupted at any point resumes where it stopped.
 */
export async function warmImages(
  referenced: readonly string[],
  alreadyCached: ReadonlySet<string>,
  deps: WarmDeps,
  { concurrency = IMAGE_CONCURRENCY, retryDelaysMs = RETRY_DELAYS_MS }: WarmOptions = {},
): Promise<WarmResult> {
  const total = referenced.length;
  const queue = referenced.filter((n) => !alreadyCached.has(n));
  let cached = total - queue.length;
  const failed: string[] = [];
  deps.onProgress(cached, total);

  const worker = async () => {
    for (;;) {
      if (deps.cancelled()) return;
      await deps.waitUntilAllowed();
      if (deps.cancelled()) return;
      const name = queue.shift();
      if (name === undefined) return;
      for (let attempt = 0; ; attempt++) {
        try {
          await deps.download(name);
          cached += 1;
          deps.onProgress(cached, total);
          break;
        } catch {
          const delay = retryDelaysMs[attempt];
          if (delay === undefined || deps.cancelled()) {
            failed.push(name);
            break;
          }
          await deps.sleep(delay);
          await deps.waitUntilAllowed();
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  return { cached, total, failed, cancelled: deps.cancelled() };
}
