import { describe, expect, it } from 'vitest';
import { LocalProgressStore, STORAGE_KEY, type KeyValueStorage } from './localProgressStore';
import { practiceStartIndex, savedIds, topicStats } from './stats';
import { MAX_EXAMS, emptyProgress, examCategory, type ActiveExam, type ExamAttempt } from './types';

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const ids = ['1-1', '1-2', '1-3', '1-4'];

describe('LocalProgressStore', () => {
  it('starts empty with default settings', async () => {
    const data = await new LocalProgressStore(new MemoryStorage()).load();
    expect(data).toEqual(emptyProgress());
    expect(data.settings.examInstantFeedback).toBe(true);
  });

  it('records answers and keeps the last one', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    await store.recordAnswer({ questionId: '1-1', choice: 0, correct: false, at: 1 });
    const data = await store.recordAnswer({ questionId: '1-1', choice: 2, correct: true, at: 2 });
    expect(data.answers['1-1']).toEqual({ attempts: 2, correctCount: 1, lastChoice: 2, lastCorrect: true, lastAt: 2 });
  });

  it('persists across instances under a versioned key', async () => {
    const mem = new MemoryStorage();
    const a = new LocalProgressStore(mem);
    await a.recordAnswer({ questionId: '1-2', choice: 1, correct: true });
    await a.setTopicPosition('1', 3);
    await a.updateSettings({ examInstantFeedback: false });

    expect(JSON.parse(mem.getItem(STORAGE_KEY)!)).toMatchObject({ version: 1 });
    const data = await new LocalProgressStore(mem).load();
    expect(data.answers['1-2']?.lastCorrect).toBe(true);
    expect(data.topicPositions['1']).toBe(3);
    expect(data.settings.examInstantFeedback).toBe(false);
  });

  it('resets one topic only', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    await store.recordAnswer({ questionId: '1-1', choice: 0, correct: true });
    await store.recordAnswer({ questionId: '2-1', choice: 0, correct: true });
    await store.setTopicPosition('1', 2);
    await store.setTopicPosition('2', 1);
    const data = await store.resetTopic('1', ['1-1', '1-2']);
    expect(data.answers['1-1']).toBeUndefined();
    expect(data.answers['2-1']).toBeDefined();
    expect(data.topicPositions).toEqual({ '2': 1 });
  });

  it('falls back to empty state on corrupt JSON', async () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, '{not json');
    expect(await new LocalProgressStore(mem).load()).toEqual(emptyProgress());
  });

  it('falls back to empty state on a wrong-typed value', async () => {
    for (const bad of ['null', '42', '"text"', '[]', '{"answers":[1,2]}']) {
      const mem = new MemoryStorage();
      mem.setItem(STORAGE_KEY, bad);
      expect(await new LocalProgressStore(mem).load(), bad).toEqual(emptyProgress());
    }
  });

  it('drops invalid records but keeps valid ones', async () => {
    const mem = new MemoryStorage();
    mem.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        answers: {
          ok: { attempts: 1, correctCount: 1, lastChoice: 0, lastCorrect: true, lastAt: 5 },
          badCount: { attempts: 1, correctCount: 3, lastChoice: 0, lastCorrect: true, lastAt: 5 },
          badType: { attempts: '1', correctCount: 0, lastChoice: 0, lastCorrect: false },
          notObject: 'x',
        },
        topicPositions: { a: 2, b: -1, c: 'x' },
        settings: { examInstantFeedback: 'yes' },
      }),
    );
    const data = await new LocalProgressStore(mem).load();
    expect(Object.keys(data.answers)).toEqual(['ok']);
    expect(data.topicPositions).toEqual({ a: 2 });
    expect(data.settings.examInstantFeedback).toBe(true);
  });

  it('keeps working when storage throws', async () => {
    const throwing: KeyValueStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
    };
    const store = new LocalProgressStore(throwing);
    expect(await store.load()).toEqual(emptyProgress());
    const data = await store.recordAnswer({ questionId: '1-1', choice: 0, correct: true });
    expect(data.answers['1-1']?.attempts).toBe(1);
  });

  it('works without any storage', async () => {
    const store = new LocalProgressStore(null);
    const data = await store.recordAnswer({ questionId: '1-1', choice: 0, correct: false });
    expect(data.answers['1-1']?.lastCorrect).toBe(false);
  });
});

describe('topicStats', () => {
  it('counts answered and last-answer-correct questions', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    await store.recordAnswer({ questionId: '1-1', choice: 0, correct: true });
    await store.recordAnswer({ questionId: '1-2', choice: 0, correct: true });
    await store.recordAnswer({ questionId: '1-2', choice: 1, correct: false }); // last is wrong
    await store.recordAnswer({ questionId: '1-3', choice: 1, correct: false });
    await store.recordAnswer({ questionId: '1-3', choice: 0, correct: true }); // last is right
    const data = await store.recordAnswer({ questionId: '9-9', choice: 0, correct: true }); // other topic

    expect(topicStats(ids, data)).toEqual({ total: 4, answered: 3, lastCorrect: 2, lastCorrectShare: 0.5 });
  });

  it('handles an empty topic and empty progress', () => {
    expect(topicStats([], emptyProgress())).toEqual({ total: 0, answered: 0, lastCorrect: 0, lastCorrectShare: 0 });
    expect(topicStats(ids, emptyProgress()).answered).toBe(0);
  });

  it('derives stats from corrupt data as empty', async () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, '\u0000garbage');
    const data = await new LocalProgressStore(mem).load();
    expect(topicStats(ids, data)).toEqual({ total: 4, answered: 0, lastCorrect: 0, lastCorrectShare: 0 });
  });
});

describe('practiceStartIndex', () => {
  it('starts at the first never-answered question', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    await store.recordAnswer({ questionId: '1-1', choice: 0, correct: true });
    const data = await store.recordAnswer({ questionId: '1-3', choice: 0, correct: true });
    expect(practiceStartIndex('1', ids, data)).toBe(1);
  });

  it('starts at question 1 when all are answered and no pass is in progress', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    let data = emptyProgress();
    for (const id of ids) data = await store.recordAnswer({ questionId: id, choice: 0, correct: true });
    expect(practiceStartIndex('1', ids, data)).toBe(0);
  });

  it('resumes a repeat pass, ignoring an out-of-range position', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    for (const id of ids) await store.recordAnswer({ questionId: id, choice: 0, correct: true });
    expect(practiceStartIndex('1', ids, await store.setTopicPosition('1', 2))).toBe(2);
    expect(practiceStartIndex('1', ids, await store.setTopicPosition('1', 10))).toBe(0);
  });
});

function attempt(id: string, over: Partial<ExamAttempt> = {}): ExamAttempt {
  return {
    id,
    startedAt: 1000,
    finishedAt: 61_000,
    durationSec: 60,
    questionIds: ['1-1', '1-2', '1-3'],
    answers: [0, 1, null],
    correctCount: 1,
    mistakes: 2,
    passed: true,
    endReason: 'timeout',
    instantFeedback: true,
    ...over,
  };
}

describe('exams in the store', () => {
  it('round-trips an attempt and updates per-question history', async () => {
    const mem = new MemoryStorage();
    const store = new LocalProgressStore(mem);
    await store.recordAnswer({ questionId: '1-1', choice: 2, correct: false, at: 5 });
    await store.saveExam(attempt('a', { category: 'C' }), [0, 0, 0]);

    const data = await new LocalProgressStore(mem).load();
    expect(data.exams).toEqual([attempt('a', { category: 'C' })]);
    expect(data.answers['1-1']).toEqual({ attempts: 2, correctCount: 1, lastChoice: 0, lastCorrect: true, lastAt: 61_000 });
    expect(data.answers['1-2']).toMatchObject({ attempts: 1, lastCorrect: false });
    expect(data.answers['1-3']).toBeUndefined(); // unanswered is not an answer
  });

  it('keeps only the newest MAX_EXAMS attempts', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    let data = emptyProgress();
    for (let i = 0; i < MAX_EXAMS + 5; i++) data = await store.saveExam(attempt(`e${i}`), [0, 0, 0]);
    expect(data.exams).toHaveLength(MAX_EXAMS);
    expect(data.exams[0]?.id).toBe('e5');
    expect(data.exams.at(-1)?.id).toBe(`e${MAX_EXAMS + 4}`);
  });

  it('drops corrupt exam entries and survives a non-array', async () => {
    const mem = new MemoryStorage();
    mem.setItem(
      STORAGE_KEY,
      JSON.stringify({
        exams: [
          attempt('ok'),
          attempt('badAnswers', { answers: [0, 'x', null] as unknown as (number | null)[] }),
          attempt('badLength', { answers: [0] }),
          attempt('badReason', { endReason: 'quit' as ExamAttempt['endReason'] }),
          attempt('badSum', { correctCount: 3 }),
          { id: 'partial' },
          42,
          attempt('ok'), // duplicate id
          attempt('seen', { seenCount: 2 }),
          attempt('badSeen', { seenCount: 99 }),
        ],
      }),
    );
    const loaded = (await new LocalProgressStore(mem).load()).exams;
    expect(loaded.map((e) => e.id)).toEqual(['ok', 'seen', 'badSeen']);
    expect(loaded[1]?.seenCount).toBe(2);
    expect(loaded[2]).not.toHaveProperty('seenCount'); // invalid optional field dropped, record kept

    mem.setItem(STORAGE_KEY, JSON.stringify({ exams: { not: 'an array' } }));
    expect((await new LocalProgressStore(mem).load()).exams).toEqual([]);
  });

  it('normalizes practiceOrder and keeps pass starts', async () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, JSON.stringify({ settings: { practiceOrder: 'random' }, topicPassStarts: { a: 5, b: 'x' } }));
    const data = await new LocalProgressStore(mem).load();
    expect(data.settings.practiceOrder).toBe('official');
    expect(data.topicPassStarts).toEqual({ a: 5 });

    const store = new LocalProgressStore(mem);
    await store.updateSettings({ practiceOrder: 'shuffled' });
    await store.startTopicPass('1', 777);
    const after = await store.resetTopic('a', []);
    expect(after.settings.practiceOrder).toBe('shuffled');
    expect(after.topicPassStarts).toEqual({ '1': 777 });
  });

  it('defaults the theme to system, drops invalid values and keeps a choice across reloads', async () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, JSON.stringify({ settings: { theme: 'neon' } }));
    expect((await new LocalProgressStore(mem).load()).settings.theme).toBe('system');

    await new LocalProgressStore(mem).updateSettings({ theme: 'dark' });
    expect((await new LocalProgressStore(mem).load()).settings.theme).toBe('dark');
  });
});

describe('marathon lap start', () => {
  it('is per category, survives a reload and drops invalid values', async () => {
    const mem = new MemoryStorage();
    const store = new LocalProgressStore(mem);
    expect((await store.load()).marathonPassStarts).toEqual({});
    await store.startMarathonPass('B', 4242);
    await store.startMarathonPass('C', 99);
    await store.recordAnswer({ questionId: 'a', choice: 0, correct: true, at: 5000 });
    const reloaded = await new LocalProgressStore(mem).load();
    expect(reloaded.marathonPassStarts).toEqual({ B: 4242, C: 99 });
    expect(reloaded.answers.a?.lastAt).toBe(5000);

    await new LocalProgressStore(mem).startMarathonPass('C', 100);
    expect((await new LocalProgressStore(mem).load()).marathonPassStarts).toEqual({ B: 4242, C: 100 });

    mem.setItem(STORAGE_KEY, JSON.stringify({ marathonPassStarts: { B: 'soon', X: 5, C: 7 } }));
    expect((await new LocalProgressStore(mem).load()).marathonPassStarts).toEqual({ C: 7 });
    mem.setItem(STORAGE_KEY, JSON.stringify({ marathonPassStart: 'soon' }));
    expect((await new LocalProgressStore(mem).load()).marathonPassStarts).toEqual({});
  });

  it('migrates the old single lap start to category B', async () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 1, marathonPassStart: 4242 }));
    const store = new LocalProgressStore(mem);
    const data = await store.load();
    expect(data.marathonPassStarts).toEqual({ B: 4242 });
    expect(data).not.toHaveProperty('marathonPassStart');

    // A first lap (0) needs no entry; after any write the old field is gone for good.
    await store.startMarathonPass('A', 7);
    const saved = JSON.parse(mem.getItem(STORAGE_KEY)!) as Record<string, unknown>;
    expect(saved).not.toHaveProperty('marathonPassStart');
    expect(saved.marathonPassStarts).toEqual({ B: 4242, A: 7 });

    mem.setItem(STORAGE_KEY, JSON.stringify({ marathonPassStart: 0 }));
    expect((await new LocalProgressStore(mem).load()).marathonPassStarts).toEqual({});
  });
});

describe('selected category', () => {
  it('defaults to B, keeps a known category and replaces an unknown one with B', async () => {
    const mem = new MemoryStorage();
    expect((await new LocalProgressStore(mem).load()).settings.category).toBe('B');

    mem.setItem(STORAGE_KEY, JSON.stringify({ settings: { examInstantFeedback: false } })); // stored before categories
    let data = await new LocalProgressStore(mem).load();
    expect(data.settings).toEqual({ category: 'B', examInstantFeedback: false, practiceOrder: 'official', theme: 'system' });

    for (const bad of ['E', 'b', 'BE', 1, null]) {
      mem.setItem(STORAGE_KEY, JSON.stringify({ settings: { category: bad } }));
      expect((await new LocalProgressStore(mem).load()).settings.category, String(bad)).toBe('B');
    }

    mem.setItem(STORAGE_KEY, JSON.stringify({ settings: { category: 'T' } }));
    expect((await new LocalProgressStore(mem).load()).settings.category).toBe('T');

    const store = new LocalProgressStore(mem);
    await store.updateSettings({ category: 'A' });
    data = await new LocalProgressStore(mem).load();
    expect(data.settings.category).toBe('A');
    expect(data.settings.examInstantFeedback).toBe(true);
  });
});

describe('exam attempt category', () => {
  it('treats old records without a category as B and keeps valid ones', async () => {
    const mem = new MemoryStorage();
    mem.setItem(
      STORAGE_KEY,
      JSON.stringify({
        exams: [attempt('old'), attempt('d', { category: 'D' }), attempt('bad', { category: 'Z' as ExamAttempt['category'] })],
      }),
    );
    const exams = (await new LocalProgressStore(mem).load()).exams;
    expect(exams.map((e) => [e.id, e.category])).toEqual([
      ['old', 'B'],
      ['d', 'D'],
      ['bad', 'B'],
    ]);
    expect(examCategory({})).toBe('B');
    expect(examCategory({ category: 'T' })).toBe('T');
  });
});

describe('mistakeIds', () => {
  it('lists questions whose last answer was wrong, in the given order', async () => {
    const { mistakeIds } = await import('./stats');
    const rec = (lastCorrect: boolean) => ({ attempts: 1, correctCount: lastCorrect ? 1 : 0, lastChoice: 0, lastCorrect, lastAt: 1 });
    const answers = { a: rec(false), b: rec(true), d: rec(false) };
    expect(mistakeIds(['d', 'c', 'b', 'a'], { answers })).toEqual(['d', 'a']);
    expect(mistakeIds(['a', 'b'], { answers: {} })).toEqual([]);
  });

  it('drops a question once it is answered correctly', async () => {
    const { mistakeIds } = await import('./stats');
    const store = new LocalProgressStore();
    await store.recordAnswer({ questionId: 'q1', choice: 1, correct: false });
    expect(mistakeIds(['q1'], await store.load())).toEqual(['q1']);
    await store.recordAnswer({ questionId: 'q1', choice: 0, correct: true });
    expect(mistakeIds(['q1'], await store.load())).toEqual([]);
  });
});

function active(id: string, over: Partial<ActiveExam> = {}): ActiveExam {
  return {
    id,
    category: 'B',
    questionIds: ['1-1', '1-2', '1-3'],
    answers: [0, null, null],
    step: 1,
    startedAt: 1_000,
    durationSec: 1200,
    instantFeedback: false,
    ...over,
  };
}

describe('active exam', () => {
  it('saves, replaces and clears the single slot across instances', async () => {
    const mem = new MemoryStorage();
    const store = new LocalProgressStore(mem);
    await store.saveActiveExam(active('a'));
    expect((await new LocalProgressStore(mem).load()).activeExam).toEqual(active('a'));

    await store.saveActiveExam(active('b', { answers: [0, 2, null], step: 2, category: 'C', instantFeedback: true }));
    expect((await new LocalProgressStore(mem).load()).activeExam).toEqual(
      active('b', { answers: [0, 2, null], step: 2, category: 'C', instantFeedback: true }),
    );

    const data = await store.clearActiveExam();
    expect(data.activeExam).toBeNull();
    expect((await new LocalProgressStore(mem).load()).activeExam).toBeNull();
  });

  it('does not alias the caller arrays', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    const exam = active('a');
    await store.saveActiveExam(exam);
    exam.answers[1] = 3;
    expect((await store.load()).activeExam?.answers).toEqual([0, null, null]);
  });

  it('saveExam clears the matching active exam in the same write', async () => {
    const mem = new MemoryStorage();
    const store = new LocalProgressStore(mem);
    await store.saveActiveExam(active('a'));
    await store.saveExam(attempt('a'), [0, 0, 0]);
    const stored = JSON.parse(mem.getItem(STORAGE_KEY)!);
    expect(stored.activeExam).toBeNull();
    expect(stored.exams.map((e: ExamAttempt) => e.id)).toEqual(['a']);
  });

  it('saveExam keeps a different active exam', async () => {
    const mem = new MemoryStorage();
    const store = new LocalProgressStore(mem);
    await store.saveActiveExam(active('b'));
    await store.saveExam(attempt('a'), [0, 0, 0]);
    expect((await new LocalProgressStore(mem).load()).activeExam).toEqual(active('b'));
  });

  it('loads old data without the field as null', async () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 1, exams: [attempt('a')], settings: { category: 'C' } }));
    const data = await new LocalProgressStore(mem).load();
    expect(data.activeExam).toBeNull();
    expect(data.exams).toHaveLength(1);
  });

  it('drops a malformed active exam', async () => {
    const bad: unknown[] = [
      42,
      'x',
      [],
      active(''),
      active(7 as unknown as string),
      active('a', { questionIds: [] }),
      active('a', { questionIds: ['1-1', '', '1-3'] }),
      active('a', { questionIds: ['1-1', 2, '1-3'] as unknown as string[] }),
      active('a', { answers: [0, null] }),
      active('a', { answers: [0, null, null, null] }),
      active('a', { answers: [0, -1, null] }),
      active('a', { answers: [0, 1.5, null] }),
      active('a', { answers: [0, '1', null] as unknown as (number | null)[] }),
      active('a', { step: 3 }),
      active('a', { step: -1 }),
      active('a', { step: 0.5 }),
      active('a', { startedAt: -5 }),
      active('a', { startedAt: Number.NaN }),
      active('a', { startedAt: '1000' as unknown as number }),
      active('a', { category: 'Z' as ActiveExam['category'] }),
      active('a', { instantFeedback: 'yes' as unknown as boolean }),
      active('a', { durationSec: 0 }),
      active('a', { durationSec: -60 }),
      active('a', { durationSec: 12.5 }),
      { ...active('a'), questionIds: undefined },
      { ...active('a'), instantFeedback: undefined },
    ];
    const mem = new MemoryStorage();
    for (const b of bad) {
      mem.setItem(STORAGE_KEY, JSON.stringify({ activeExam: b, exams: [attempt('keep')] }));
      const data = await new LocalProgressStore(mem).load();
      expect(data.activeExam, JSON.stringify(b)).toBeNull();
      expect(data.exams.map((e) => e.id)).toEqual(['keep']);
    }
    mem.setItem(STORAGE_KEY, JSON.stringify({ activeExam: active('ok', { step: 0, answers: [null, null, null] }) }));
    expect((await new LocalProgressStore(mem).load()).activeExam?.id).toBe('ok');
  });
});

describe('saved questions', () => {
  it('saves and unsaves, surviving a reload', async () => {
    const mem = new MemoryStorage();
    const store = new LocalProgressStore(mem);
    expect((await store.load()).saved).toEqual({});
    await store.setSaved('1-1', true, 100);
    await store.setSaved('2-5', true, 200);
    expect((await new LocalProgressStore(mem).load()).saved).toEqual({ '1-1': 100, '2-5': 200 });

    await store.setSaved('1-1', false);
    expect((await new LocalProgressStore(mem).load()).saved).toEqual({ '2-5': 200 });
    // Unsaving a question that is not saved changes nothing.
    expect((await store.setSaved('9-9', false)).saved).toEqual({ '2-5': 200 });
  });

  it('keeps the original time when saved again', async () => {
    const store = new LocalProgressStore(new MemoryStorage());
    await store.setSaved('1-1', true, 100);
    const data = await store.setSaved('1-1', true, 999);
    expect(data.saved).toEqual({ '1-1': 100 });
  });

  it('defaults the time to now', async () => {
    const before = Date.now();
    const data = await new LocalProgressStore(new MemoryStorage()).setSaved('1-1', true);
    expect(data.saved['1-1']).toBeGreaterThanOrEqual(before);
  });

  it('drops invalid saved entries and loads old data without the field as {}', async () => {
    const mem = new MemoryStorage();
    mem.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, saved: { ok: 5, zero: 0, str: '5', nul: null, obj: {}, arr: [1] } }),
    );
    expect((await new LocalProgressStore(mem).load()).saved).toEqual({ ok: 5, zero: 0 });

    for (const bad of [[1, 2], 'x', 42, null]) {
      const m = new MemoryStorage();
      m.setItem(STORAGE_KEY, JSON.stringify({ version: 1, saved: bad }));
      expect((await new LocalProgressStore(m).load()).saved, String(bad)).toEqual({});
    }

    const old = new MemoryStorage();
    old.setItem(STORAGE_KEY, JSON.stringify({ version: 1, answers: {}, exams: [] }));
    expect((await new LocalProgressStore(old).load()).saved).toEqual({});
  });

  it('savedIds: newest first, ties by id, only the given questions', () => {
    const saved = { b: 10, a: 10, c: 30, other: 50, d: 20 };
    expect(savedIds(['a', 'b', 'c', 'd', 'e'], { saved })).toEqual(['c', 'd', 'a', 'b']);
    expect(savedIds(['e'], { saved })).toEqual([]);
    expect(savedIds(['a'], { saved: {} })).toEqual([]);
  });

  it('savedIds ignores inherited object keys', () => {
    expect(savedIds(['toString', 'constructor'], { saved: {} })).toEqual([]);
  });
});
