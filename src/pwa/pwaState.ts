/** Snapshot of the service-worker lifecycle as seen from the page. */
export interface PwaSnapshot {
  /** Browser supports service workers and this is a production build. */
  supported: boolean;
  /** An active worker exists: the precache is complete, the app works offline. */
  active: boolean;
  /** The first install is in progress (precache filling). */
  installing: boolean;
  /** A new version is installed and waits for the user's «Оновити». */
  waiting: boolean;
  /** Registration or the first install failed. */
  failed: boolean;
  /** Images already in the precache (only counted during the first install). */
  cachedImages: number;
}

export const INITIAL_SNAPSHOT: PwaSnapshot = {
  supported: false,
  active: false,
  installing: false,
  waiting: false,
  failed: false,
  cachedImages: 0,
};

export type OfflineStatus =
  | { kind: 'hidden' }
  | { kind: 'caching'; progress: number | null }
  | { kind: 'ready' };

/**
 * What the Home screen says about offline readiness. Unsupported or failed
 * setups say nothing: the app simply works online.
 */
export function offlineStatus(s: PwaSnapshot, totalImages: number): OfflineStatus {
  if (!s.supported || s.failed) return { kind: 'hidden' };
  if (s.active) return { kind: 'ready' };
  if (s.installing) {
    const progress = totalImages > 0 ? Math.min(1, s.cachedImages / totalImages) : null;
    return { kind: 'caching', progress };
  }
  return { kind: 'hidden' };
}

/** Never offer a reload while an exam is running; the banner returns afterwards. */
export function showUpdateBanner(s: Pick<PwaSnapshot, 'waiting'>, pathname: string, dismissed: boolean): boolean {
  if (!s.waiting || dismissed) return false;
  return !pathname.startsWith('/exam/run');
}

/** Counts precached question images among cache request URLs. */
export function countCachedImages(urls: readonly string[]): number {
  let n = 0;
  for (const u of urls) if (/\/img\/[^/?#]+\.webp(?:[?#]|$)/.test(u)) n += 1;
  return n;
}
