import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useQuestions } from '../data/QuestionsProvider';
import { offlineStatus, showUpdateBanner } from './pwaState';
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

/** Home-screen line about offline readiness. */
export function OfflineStatusLine() {
  const pwa = usePwa();
  const bank = useQuestions();
  const totalImages = useMemo(() => {
    const names = new Set<string>();
    for (const t of bank.topics) for (const q of t.questions) for (const i of q.images) names.add(i);
    return names.size;
  }, [bank]);
  const status = offlineStatus(pwa, totalImages);

  if (status.kind === 'hidden') return null;
  if (status.kind === 'ready') {
    return (
      <p className="offline-status ready" role="status">
        <Icon name="check" />
        Готово до роботи без інтернету
      </p>
    );
  }
  const pct = status.progress === null ? null : Math.round(status.progress * 100);
  return (
    <p className="offline-status" role="status">
      <span className="mini-spinner" aria-hidden="true" />
      Завантажуємо питання для роботи без інтернету…{pct !== null && ` ${pct}%`}
    </p>
  );
}
