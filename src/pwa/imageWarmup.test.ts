import { describe, expect, it } from 'vitest';
import {
  countCached,
  imageCacheName,
  imageNameFromUrl,
  referencedImages,
  staleImageCaches,
  warmImages,
  type WarmDeps,
} from './imageWarmup';

const names = Array.from({ length: 40 }, (_, i) => `s01-q${String(i).padStart(3, '0')}-1.webp`);

/** Fake network + cache: records concurrency, fails selected names a number of times. */
function fakeDeps(opts: { failTimes?: Record<string, number>; cancelAfter?: number } = {}) {
  const cache = new Set<string>();
  const calls: string[] = [];
  const sleeps: number[] = [];
  const progress: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const failLeft = { ...(opts.failTimes ?? {}) };
  const deps: WarmDeps = {
    async download(name) {
      calls.push(name);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      if ((failLeft[name] ?? 0) > 0) {
        failLeft[name]! -= 1;
        throw new Error('network');
      }
      cache.add(name);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    waitUntilAllowed: async () => undefined,
    cancelled: () => opts.cancelAfter !== undefined && cache.size >= opts.cancelAfter,
    onProgress: (c) => progress.push(c),
  };
  return { deps, cache, calls, sleeps, progress, max: () => maxInFlight };
}

describe('warmImages', () => {
  it('downloads every missing image with at most N in flight', async () => {
    const f = fakeDeps();
    const r = await warmImages(names, new Set(), f.deps, { concurrency: 6 });
    expect(r).toEqual({ cached: 40, total: 40, failed: [], cancelled: false });
    expect(f.cache.size).toBe(40);
    expect(f.max()).toBeLessThanOrEqual(6);
    expect(f.max()).toBeGreaterThan(1);
    expect(f.progress.at(-1)).toBe(40);
  });

  it('skips images that are already cached (resume)', async () => {
    const f = fakeDeps();
    const have = new Set(names.slice(0, 12));
    const r = await warmImages(names, have, f.deps);
    expect(f.calls).toHaveLength(28);
    expect(f.calls.some((n) => have.has(n))).toBe(false);
    expect(f.progress[0]).toBe(12);
    expect(r.cached).toBe(40);
  });

  it('retries with backoff and reports images that keep failing', async () => {
    const f = fakeDeps({ failTimes: { [names[3]!]: 1, [names[5]!]: 99 } });
    const r = await warmImages(names, new Set(), f.deps, { retryDelaysMs: [10, 20] });
    expect(r.failed).toEqual([names[5]]);
    expect(r.cached).toBe(39);
    expect(f.calls.filter((n) => n === names[3])).toHaveLength(2);
    expect(f.calls.filter((n) => n === names[5])).toHaveLength(3); // first try + 2 retries
    expect(f.sleeps.sort()).toEqual([10, 10, 20]);
  });

  it('stops when cancelled and can be resumed later', async () => {
    const f = fakeDeps({ cancelAfter: 10 });
    const r1 = await warmImages(names, new Set(), f.deps, { concurrency: 3 });
    expect(r1.cancelled).toBe(true);
    expect(f.cache.size).toBeLessThan(40);
    const g = fakeDeps();
    const r2 = await warmImages(names, new Set(f.cache), g.deps);
    expect(r2.cached).toBe(40);
    expect(g.calls.length).toBe(40 - f.cache.size);
  });

  it('waits while not allowed (offline) before taking more work', async () => {
    const f = fakeDeps();
    let release!: () => void;
    let allowed = false;
    const gate = new Promise<void>((r) => (release = r));
    f.deps.waitUntilAllowed = () => (allowed ? Promise.resolve() : gate);
    const run = warmImages(names, new Set(), f.deps);
    await Promise.resolve();
    expect(f.calls).toHaveLength(0);
    allowed = true;
    release();
    expect((await run).cached).toBe(40);
  });

  it('handles an empty or fully cached list', async () => {
    const f = fakeDeps();
    expect(await warmImages([], new Set(), f.deps)).toMatchObject({ cached: 0, total: 0 });
    expect(await warmImages(names, new Set(names), f.deps)).toMatchObject({ cached: 40, total: 40 });
    expect(f.calls).toHaveLength(0);
  });
});

describe('image cache versioning', () => {
  it('names caches per scope and version and finds stale ones', () => {
    const cur = imageCacheName('/vilni-pdr/', 'abc');
    const all = [
      'workbox-precache-v2-https://x/vilni-pdr/',
      imageCacheName('/vilni-pdr/', 'old1'),
      cur,
      imageCacheName('/other-app/', 'old2'),
    ];
    expect(staleImageCaches(all, '/vilni-pdr/', cur)).toEqual([imageCacheName('/vilni-pdr/', 'old1')]);
  });

  it('extracts image names from cache URLs and counts referenced ones', () => {
    expect(imageNameFromUrl('https://x/vilni-pdr/img/s01-q001-1.webp')).toBe('s01-q001-1.webp');
    expect(imageNameFromUrl('https://x/a/img/s01-q007-1.webp?__WB_REVISION__=1')).toBe('s01-q007-1.webp');
    expect(imageNameFromUrl('https://x/a/icons/icon-192.png')).toBeNull();
    expect(countCached(['a.webp', 'b.webp', 'c.webp'], new Set(['a.webp', 'c.webp', 'zzz.webp']))).toBe(2);
  });

  it('lists distinct referenced images in bank order', () => {
    const topics = [{ questions: [{ images: ['a.webp', 'b.webp'] }, { images: [] }] }, { questions: [{ images: ['a.webp', 'c.webp'] }] }];
    expect(referencedImages(topics)).toEqual(['a.webp', 'b.webp', 'c.webp']);
  });
});
