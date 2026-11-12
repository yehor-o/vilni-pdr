import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAllQuestions } from '../data/QuestionsProvider';
import { offlineStatus, showUpdateBanner } from './pwaState';
import { startImageWarmup } from './imageCache';
import { referencedImages } from './imageWarmup';
import { applyUpdate, usePwa } from './register';

/** Small non-blocking banner when a new version is waiting. Hidden during an exam run. */
export function UpdateBanner() {
  const pwa = usePwa();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);
  if (!showUpdateBanner(pwa, pathname, dismissed)) return null;
  return (
    <div className="update-banner" role="status">
      <span className="update-text">Доступна нова версія</span>
      <button type="button" className="update-btn" onClick={applyUpdate}>
        Оновити
      </button>
      <button type="button" className="iconbtn update-close" aria-label="Пізніше" onClick={() => setDismissed(true)}>
        <Icon name="x" />
      </button>
    </div>
  );
}

/**
 * Starts the background image download a moment after the first render.
 * Covers the images of every category, so switching works offline too.
 */
export function ImageWarmup() {
  const { topics } = useAllQuestions().data;
  useEffect(() => {
    const t = window.setTimeout(() => startImageWarmup(referencedImages(topics)), 1500);
    return () => window.clearTimeout(t);
  }, [topics]);
  return null;
}

/** Home-screen line about offline readiness. */
export function OfflineStatusLine() {
  const status = offlineStatus(usePwa());

  if (status.kind === 'hidden') return null;
  if (status.kind === 'ready') {
    return (
      <p className="offline-status ready" role="status">
        <Icon name="check" />
        Готово до роботи без інтернету
      </p>
    );
  }
  if (status.kind === 'lazy') {
    return (
      <p className="offline-status" role="status">
        Економія трафіку: картинки зберігаються для роботи без інтернету, коли ти їх переглядаєш (
        {Math.round(status.progress * 100)}%).
      </p>
    );
  }
  const pct = status.progress === null ? null : Math.round(status.progress * 100);
  return (
    <p className="offline-status" role="status">
      <span className="mini-spinner" aria-hidden="true" />
      Завантажуємо картинки для роботи без інтернету…{pct !== null && ` ${pct}%`}
    </p>
  );
}
