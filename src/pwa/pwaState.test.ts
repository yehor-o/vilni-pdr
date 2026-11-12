import { describe, expect, it } from 'vitest';
import { INITIAL_SNAPSHOT, offlineStatus, showUpdateBanner, type PwaSnapshot } from './pwaState';

const snap = (p: Partial<PwaSnapshot>): PwaSnapshot => ({ ...INITIAL_SNAPSHOT, supported: true, imagesTotal: 1056, ...p });

describe('offline status', () => {
  it('says nothing without service-worker support or after a failure', () => {
    expect(offlineStatus(INITIAL_SNAPSHOT)).toEqual({ kind: 'hidden' });
    expect(offlineStatus(snap({ installing: true, failed: true }))).toEqual({ kind: 'hidden' });
    expect(offlineStatus(snap({}))).toEqual({ kind: 'hidden' }); // not registered yet
  });

  it('shows image progress while the image cache fills', () => {
    expect(offlineStatus(snap({ active: true, imagesCached: 264 }))).toEqual({ kind: 'caching', progress: 0.25 });
    expect(offlineStatus(snap({ installing: true, imagesCached: 0 }))).toEqual({ kind: 'caching', progress: 0 });
    expect(offlineStatus(snap({ active: true, imagesTotal: 0 }))).toEqual({ kind: 'hidden' }); // cache not inspected yet
  });

  it('is ready only when the shell is active and every referenced image is cached', () => {
    expect(offlineStatus(snap({ active: true, imagesCached: 1056 }))).toEqual({ kind: 'ready' });
    expect(offlineStatus(snap({ installing: true, imagesCached: 1056 }))).toMatchObject({ kind: 'caching' });
    expect(offlineStatus(snap({ active: true, waiting: true, imagesCached: 1056 }))).toEqual({ kind: 'ready' });
  });

  it('reports lazy caching under data saver', () => {
    expect(offlineStatus(snap({ active: true, saveData: true, imagesCached: 528 }))).toEqual({
      kind: 'lazy',
      progress: 0.5,
    });
    expect(offlineStatus(snap({ active: true, saveData: true, imagesCached: 1056 }))).toEqual({ kind: 'ready' });
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
