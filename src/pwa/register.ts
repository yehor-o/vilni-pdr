import { useSyncExternalStore } from 'react';
import { INITIAL_SNAPSHOT, type PwaSnapshot } from './pwaState';

/**
 * Service-worker registration (production only) and a tiny store the UI reads
 * through `usePwa()`. Updates use the prompt pattern: a new worker waits until
 * the user taps «Оновити»; we only reload after that, never on our own.
 */

let snapshot: PwaSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | null = null;
let reloadRequested = false;

export function set(patch: Partial<PwaSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

export function getPwa(): PwaSnapshot {
  return snapshot;
}

export function usePwa(): PwaSnapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

/** Activate the waiting version; the page reloads once it takes control. */
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) return;
  reloadRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  set({ supported: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only the tab whose user pressed «Оновити» reloads (never mid-exam on its own).
    if (reloadRequested) window.location.reload();
  });

  const start = () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then(onRegistered)
      .catch(() => set({ failed: true }));
  };
  // Do not compete with the first render and the first questions.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

function onRegistered(reg: ServiceWorkerRegistration) {
  registration = reg;
  const refresh = () =>
    set({
      active: !!reg.active,
      installing: !reg.active && !!reg.installing,
      waiting: !!reg.waiting && !!reg.active,
    });

  const track = (worker: ServiceWorker | null) => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant' && !reg.active) set({ failed: true, installing: false });
      refresh();
    });
  };

  track(reg.installing);
  track(reg.waiting);
  reg.addEventListener('updatefound', () => {
    track(reg.installing);
    refresh();
  });
  refresh();

  // Pick up new versions (e.g. new official question data) in long-lived sessions too.
  const check = () => void reg.update().catch(() => undefined);
  // register() does not re-check an existing registration, so ask explicitly on every start.
  if (reg.active) check();
  window.setInterval(check, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
