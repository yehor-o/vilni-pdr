/** Snapshot of the offline machinery as seen from the page. */
export interface PwaSnapshot {
  /** Browser supports service workers and this is a production build. */
  supported: boolean;
  /** An active worker exists: shell + questions work offline. */
  active: boolean;
  /** The first install is in progress (shell precache). */
  installing: boolean;
  /** A new version is installed and waits for the user's «Оновити». */
  waiting: boolean;
  /** Registration or the first install failed. */
  failed: boolean;
  /** Referenced question images and how many of them are in the image cache. */
  imagesTotal: number;
  imagesCached: number;
  /** Data saver: images are cached only as they are viewed. */
  saveData: boolean;
}

export const INITIAL_SNAPSHOT: PwaSnapshot = {
  supported: false,
  active: false,
  installing: false,
  waiting: false,
  failed: false,
  imagesTotal: 0,
  imagesCached: 0,
  saveData: false,
};

export type OfflineStatus =
  | { kind: 'hidden' }
  | { kind: 'caching'; progress: number | null }
  | { kind: 'lazy'; progress: number }
  | { kind: 'ready' };

/**
 * What the Home screen says about offline readiness. Unsupported or failed
 * setups say nothing: the app simply works online.
 */
export function offlineStatus(s: PwaSnapshot): OfflineStatus {
  if (!s.supported || s.failed) return { kind: 'hidden' };
  if (!s.active && !s.installing) return { kind: 'hidden' };
  // Until the image cache has been inspected there is nothing reliable to say.
  if (s.imagesTotal === 0) return { kind: 'hidden' };
  const complete = s.imagesCached >= s.imagesTotal;
  if (s.active && complete) return { kind: 'ready' };
  const progress = Math.min(1, s.imagesCached / s.imagesTotal);
  if (s.saveData) return { kind: 'lazy', progress };
  return { kind: 'caching', progress };
}

/** Never offer a reload while an exam is running; the banner returns afterwards. */
export function showUpdateBanner(s: Pick<PwaSnapshot, 'waiting'>, pathname: string, dismissed: boolean): boolean {
  if (!s.waiting || dismissed) return false;
  return !pathname.startsWith('/exam/run');
}
