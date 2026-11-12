import { describe, expect, it } from 'vitest';
import { INITIAL_SNAPSHOT, countCachedImages, offlineStatus, showUpdateBanner, type PwaSnapshot } from './pwaState';

const snap = (p: Partial<PwaSnapshot>): PwaSnapshot => ({ ...INITIAL_SNAPSHOT, supported: true, ...p });

describe('offline status', () => {
  it('says nothing without service-worker support or after a failure', () => {
    expect(offlineStatus(INITIAL_SNAPSHOT, 1056)).toEqual({ kind: 'hidden' });
    expect(offlineStatus(snap({ installing: true, failed: true }), 1056)).toEqual({ kind: 'hidden' });
  });

  it('shows progress while the first install fills the cache', () => {
    expect(offlineStatus(snap({ installing: true, cachedImages: 264 }), 1056)).toEqual({
      kind: 'caching',
      progress: 0.25,
    });
    expect(offlineStatus(snap({ installing: true, cachedImages: 2000 }), 1056)).toMatchObject({ progress: 1 });
    expect(offlineStatus(snap({ installing: true }), 0)).toEqual({ kind: 'caching', progress: null });
  });

  it('is ready once a worker is active, even while an update installs', () => {
    expect(offlineStatus(snap({ active: true }), 1056)).toEqual({ kind: 'ready' });
    expect(offlineStatus(snap({ active: true, waiting: true }), 1056)).toEqual({ kind: 'ready' });
  });
});

describe('update banner', () => {
  it('appears only when a new version waits and was not dismissed', () => {
    expect(showUpdateBanner({ waiting: false }, '/', false)).toBe(false);
    expect(showUpdateBanner({ waiting: true }, '/', false)).toBe(true);
    expect(showUpdateBanner({ waiting: true }, '/topics/1', true)).toBe(false);
  });

  it('is never shown during an exam run, but is on the result screen', () => {
    expect(showUpdateBanner({ waiting: true }, '/exam/run', false)).toBe(false);
    expect(showUpdateBanner({ waiting: true }, '/exam', false)).toBe(true);
    expect(showUpdateBanner({ waiting: true }, '/history/abc', false)).toBe(true);
  });
});

describe('countCachedImages', () => {
  it('counts only question images, with or without a revision query', () => {
    expect(
      countCachedImages([
        'https://x.test/pdrtest/img/s01-q001-1.webp',
        'https://x.test/pdrtest/img/s01-q007-1.webp?__WB_REVISION__=abc',
        'https://x.test/pdrtest/icons/icon-192.png',
        'https://x.test/pdrtest/data/questions.b.json',
      ]),
    ).toBe(2);
  });
});
