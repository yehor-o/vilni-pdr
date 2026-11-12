import { describe, expect, it } from 'vitest';
import { LocalProgressStore, STORAGE_KEY, type KeyValueStorage } from './localProgressStore';
import { practiceStartIndex, topicStats } from './stats';
import { MAX_EXAMS, emptyProgress, type ExamAttempt } from './types';

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
    await store.saveExam(attempt('a'), [0, 0, 0]);

    const data = await new LocalProgressStore(mem).load();
    expect(data.exams).toEqual([attempt('a')]);
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
});
