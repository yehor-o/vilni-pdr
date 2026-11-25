// Temporary sign-in probe (#/auth-test, not linked from the app): checks which
// Google sign-in flow works on iPhone in Safari and as a home-screen app before
// the account feature is built. Loaded lazily, so guests never download Firebase.
import { useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { TopBar } from '../components/TopBar';
import { firebaseConfig } from '../account/firebaseConfig';

function auth() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

/** Only the Firebase error code is shown: messages may carry request details. */
function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

type Log = { ok: boolean; text: string };

export function AuthTestScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [log, setLog] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const add = (entry: Log) => setLog((l) => [...l, entry]);

  useEffect(() => {
    const a = auth();
    const off = onAuthStateChanged(a, setUser);
    getRedirectResult(a).then(
      (r) => add(r ? { ok: true, text: 'Повернення після переходу: вхід виконано.' } : { ok: true, text: 'Повернення після переходу: результату немає.' }),
      (e) => add({ ok: false, text: `Повернення після переходу: помилка ${errorCode(e)}.` }),
    );
    return off;
  }, []);

  async function run(kind: 'popup' | 'redirect') {
    setBusy(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      if (kind === 'popup') {
        await signInWithPopup(auth(), provider);
        add({ ok: true, text: 'Вікно: вхід виконано.' });
      } else {
        await signInWithRedirect(auth(), provider); // leaves the page
      }
    } catch (e) {
      add({ ok: false, text: `${kind === 'popup' ? 'Вікно' : 'Перехід'}: помилка ${errorCode(e)}.` });
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    try {
      await signOut(auth());
      add({ ok: true, text: 'Вихід виконано.' });
    } catch (e) {
      add({ ok: false, text: `Вихід: помилка ${errorCode(e)}.` });
    }
  }

  return (
    <div className="screen">
      <TopBar backTo="/" backLabel="На головну" title="Перевірка входу" />
      <main className="page backup">
        <p className="backup-intro">
          Тимчасова сторінка: перевіряємо вхід через Google на цьому пристрої. Прогрес не змінюється і нікуди не
          надсилається.
        </p>
        <section className="summary-card" aria-labelledby="auth-state">
          <h2 id="auth-state" className="summary-title">
            Стан
          </h2>
          <p className="summary-line">Запущено {isStandalone() ? 'з домашнього екрана' : 'у браузері'}.</p>
          <p className="summary-line">
            {user === undefined ? 'Перевіряємо…' : user ? `Увійшли як ${user.displayName ?? 'користувач Google'}.` : 'Не увійшли.'}
          </p>
          {user ? (
            <button type="button" className="cbtn white" onClick={() => void onSignOut()}>
              Вийти
            </button>
          ) : (
            <>
              <button type="button" className="cbtn blue" disabled={busy} onClick={() => void run('popup')}>
                Увійти через вікно
              </button>
              <button type="button" className="cbtn white" disabled={busy} onClick={() => void run('redirect')}>
                Увійти через перехід
              </button>
            </>
          )}
        </section>
        {log.length > 0 && (
          <section className="summary-card" aria-labelledby="auth-log">
            <h2 id="auth-log" className="summary-title">
              Журнал
            </h2>
            {log.map((l, i) => (
              <p key={i} className={l.ok ? 'backup-msg' : 'backup-msg error'}>
                {l.text}
              </p>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
