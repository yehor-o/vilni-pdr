import { useRef, useState, type ChangeEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { pluralUk } from '../logic/exam';
import { backupFileName, backupSummary, parseBackup, serializeBackup, useProgress, type BackupSummary, type ProgressData } from '../storage';
import { formatDate } from './exam/format';

const ERRORS = {
  'not-json': 'Не вдалося прочитати файл: це не файл резервної копії.',
  'not-ours': 'Це не файл резервної копії тренажера.',
  newer: 'Файл збережено новішою версією тренажера. Онови сторінку й спробуй ще раз.',
} as const;

function summaryText({ answered, exams }: BackupSummary): string {
  return `відповіді на ${answered} ${pluralUk(answered, 'питання', 'питання', 'питань')}, іспитів: ${exams}`;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the browser start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Resolves true if the file was handed over, false if the user closed the share sheet. */
async function deliver(file: File): Promise<boolean> {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Прогрес тренажера ПДР' });
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      // Any other share failure: fall back to a plain download.
    }
  }
  download(file);
  return true;
}

interface Pending {
  data: ProgressData;
  exportedAt: number | null;
  summary: BackupSummary;
}

export function BackupScreen() {
  const { data, replaceAll } = useProgress();
  const fileInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const onSave = async () => {
    setSaved(false);
    const now = Date.now();
    const file = new File([serializeBackup(data, now)], backupFileName(now), { type: 'application/json' });
    if (await deliver(file)) setSaved(true);
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be picked again
    if (!file) return;
    setRestoreMsg(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRestoreMsg({ error: true, text: ERRORS['not-json'] });
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setRestoreMsg({ error: true, text: ERRORS[parsed.reason] });
      return;
    }
    setPending({ data: parsed.data, exportedAt: parsed.exportedAt, summary: parsed.summary });
  };

  const confirmText = pending
    ? `У файлі: ${summaryText(pending.summary)}` +
      (pending.exportedAt !== null ? `, збережено ${formatDate(pending.exportedAt)}` : '') +
      '. Поточний прогрес у цьому браузері буде замінено.' +
      (data.activeExam ? ' Незавершений іспит буде скасовано.' : '')
    : '';

  const current = summaryText(backupSummary(data));

  return (
    <div className="screen">
      <TopBar backTo="/" backLabel="На головну" title="Резервна копія" />
      <main className="page backup">
        <p className="backup-intro">
          Прогрес зберігається лише в цьому браузері. Збережи його у файл, щоб перенести на інший пристрій або не
          втратити після очищення браузера.
        </p>

        <section className="summary-card" aria-labelledby="backup-save">
          <h2 id="backup-save" className="summary-title">
            Зберегти у файл
          </h2>
          <p className="summary-line">{current.charAt(0).toUpperCase() + current.slice(1)}.</p>
          <button type="button" className="cbtn blue" onClick={() => void onSave()}>
            <Icon name="save" />
            Зберегти у файл
          </button>
          <p className="backup-msg" role="status">
            {saved ? 'Файл збережено.' : ''}
          </p>
        </section>

        <section className="summary-card" aria-labelledby="backup-restore">
          <h2 id="backup-restore" className="summary-title">
            Відновити з файлу
          </h2>
          <p className="summary-line">Поточний прогрес у цьому браузері буде замінено даними з файлу.</p>
          <button type="button" className="cbtn white" onClick={() => fileInput.current?.click()}>
            Вибрати файл
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => void onPick(e)}
          />
          <p className="backup-msg error" role="alert">
            {restoreMsg?.error ? restoreMsg.text : ''}
          </p>
          <p className="backup-msg" role="status">
            {restoreMsg && !restoreMsg.error ? restoreMsg.text : ''}
          </p>
        </section>
      </main>

      <ConfirmDialog
        open={pending !== null}
        title="Замінити прогрес?"
        text={confirmText}
        confirmLabel="Замінити"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const next = pending;
          setPending(null);
          if (!next) return;
          void replaceAll(next.data).then(() => setRestoreMsg({ error: false, text: 'Прогрес відновлено.' }));
        }}
      />
    </div>
  );
}
