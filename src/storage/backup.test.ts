import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackup, serializeBackup } from './backup';
import { LocalProgressStore, type KeyValueStorage } from './localProgressStore';
import { emptyProgress, type ActiveExam, type ExamAttempt, type ProgressData } from './types';

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const exam: ExamAttempt = {
  id: 'e1',
  startedAt: 1000,
  finishedAt: 2000,
  durationSec: 1,
  questionIds: ['1-1', '1-2'],
  answers: [0, null],
  correctCount: 1,
  mistakes: 1,
  passed: true,
  endReason: 'completed',
  instantFeedback: true,
  seenCount: 2,
  category: 'C',
};

const active: ActiveExam = {
  id: 'a1',
  category: 'B',
  questionIds: ['1-1', '1-2'],
  answers: [null, null],
  step: 0,
  startedAt: 5000,
  durationSec: 1200,
  instantFeedback: false,
};

function sample(): ProgressData {
  return {
    answers: {
      '1-1': { attempts: 2, correctCount: 1, lastChoice: 0, lastCorrect: true, lastAt: 10 },
      '2-3': { attempts: 1, correctCount: 0, lastChoice: 2, lastCorrect: false, lastAt: 11 },
      '7-1': { attempts: 1, correctCount: 1, lastChoice: 1, lastCorrect: true, lastAt: 12 },
    },
    topicPositions: { '1': 4 },
    topicPassStarts: { '2': 99 },
    marathonPassStarts: { B: 50, C: 60 },
    exams: [exam],
    activeExam: active,
    settings: { category: 'C', examInstantFeedback: false, practiceOrder: 'shuffled', theme: 'dark' },
  };
}

const wrap = (rest: Record<string, unknown>) => JSON.stringify({ app: 'vilni-pdr', kind: 'progress', version: 1, exportedAt: 7, data: {}, ...rest });

describe('backup', () => {
  it('round-trips everything except the exam in progress', () => {
    const data = sample();
    const parsed = parseBackup(serializeBackup(data, 123));
    expect(parsed).toEqual({
      ok: true,
      data: { ...data, activeExam: null },
      exportedAt: 123,
      summary: { answered: 3, exams: 1 },
    });
  });

  it('does not export activeExam', () => {
    const raw = JSON.parse(serializeBackup(sample(), 1));
    expect(raw).toMatchObject({ app: 'vilni-pdr', kind: 'progress', version: 1, exportedAt: 1 });
    expect('activeExam' in raw.data).toBe(false);
  });

  it('ignores an activeExam smuggled into the file', () => {
    const parsed = parseBackup(wrap({ data: { activeExam: active } }));
    expect(parsed.ok && parsed.data.activeExam).toBe(null);
  });

  it('rejects non-JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseBackup('')).toEqual({ ok: false, reason: 'not-json' });
  });

  it.each([
    ['array', '[]'],
    ['null', 'null'],
    ['string', '"x"'],
    ['other app', wrap({ app: 'other' })],
    ['other kind', wrap({ kind: 'settings' })],
    ['no data', wrap({ data: undefined })],
    ['data is array', wrap({ data: [] })],
    ['no version', wrap({ version: undefined })],
    ['version 0', wrap({ version: 0 })],
    ['version 1.5', wrap({ version: 1.5 })],
    ['version string', wrap({ version: '1' })],
  ])('rejects foreign files: %s', (_, text) => {
    expect(parseBackup(text)).toEqual({ ok: false, reason: 'not-ours' });
  });

  it('rejects files from a newer version', () => {
    expect(parseBackup(wrap({ version: 2 }))).toEqual({ ok: false, reason: 'newer' });
  });

  it('drops malformed parts instead of failing the import', () => {
    const parsed = parseBackup(
      wrap({
        exportedAt: 'yesterday',
        data: {
          answers: { '1-1': sample().answers['1-1'], bad: { attempts: -1 } },
          exams: [exam, { id: 'broken' }],
          settings: { category: 'Z', examInstantFeedback: false },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.data.answers)).toEqual(['1-1']);
    expect(parsed.data.exams.map((e) => e.id)).toEqual(['e1']);
    expect(parsed.data.settings).toEqual({ category: 'B', examInstantFeedback: false, practiceOrder: 'official', theme: 'system' });
    expect(parsed.exportedAt).toBe(null);
    expect(parsed.summary).toEqual({ answered: 1, exams: 1 });
  });

  it('accepts an empty data object as empty progress', () => {
    const parsed = parseBackup(wrap({}));
    expect(parsed).toEqual({ ok: true, data: emptyProgress(), exportedAt: 7, summary: { answered: 0, exams: 0 } });
  });

  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59).getTime())).toBe('vilni-pdr-progres-2026-01-05.json');
    expect(backupFileName(new Date(2026, 10, 24, 0, 1).getTime())).toBe('vilni-pdr-progres-2026-11-24.json');
  });
});

describe('LocalProgressStore.replaceAll', () => {
  it('replaces everything, clears the active exam and persists', async () => {
    const mem = new MemoryStorage();
    const store = new LocalProgressStore(mem);
    await store.recordAnswer({ questionId: '9-9', choice: 0, correct: true });
    await store.saveActiveExam(active);

    const data = sample();
    const result = await store.replaceAll(data);
    expect(result).toEqual({ ...data, activeExam: null });

    const reloaded = await new LocalProgressStore(mem).load();
    expect(reloaded).toEqual({ ...data, activeExam: null });
    expect(reloaded.answers['9-9']).toBeUndefined();
  });
});
