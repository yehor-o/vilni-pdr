import { describe, expect, it } from 'vitest';
import {
  EXAM_DURATION_SEC,
  buildAttempt,
  endsOnMistakes,
  formatClock,
  gradeExam,
  pluralUk,
  reviewSelection,
  unseenLine,
  remainingMs,
  sampleExamQuestions,
  examPools,
  examCompositionLine,
  examRunEntry,
  type ExamBlockPool,
} from './exam';
import { newPassStart, planShuffledPass, remainingInPass } from './practiceOrder';
import { seededRng, shuffle } from './random';

const ids = Array.from({ length: 50 }, (_, i) => `t-${i + 1}`);
const at = (lastAt: number) => ({ lastAt });

describe('shuffle', () => {
  it('is a permutation and deterministic with a seed', () => {
    const a = shuffle(ids, seededRng(42));
    expect([...a].sort()).toEqual([...ids].sort());
    expect(shuffle(ids, seededRng(42))).toEqual(a);
    expect(shuffle(ids, seededRng(43))).not.toEqual(a);
  });
});

describe('shuffled practice passes', () => {
  it('first pass skips answered questions and has no repeats', () => {
    const answers = { 't-1': at(5), 't-7': at(9) };
    const plan = planShuffledPass(ids, answers, 0, 100, seededRng(1));
    expect(plan.isNewPass).toBe(false);
    expect(plan.doneBefore).toBe(2);
    expect(plan.queue).toHaveLength(48);
    expect(new Set(plan.queue).size).toBe(48);
    expect(plan.queue).not.toContain('t-1');
    expect(plan.queue).not.toContain('t-7');
  });

  it('is deterministic with a seeded RNG', () => {
    const a = planShuffledPass(ids, {}, 0, 1, seededRng(7)).queue;
    const b = planShuffledPass(ids, {}, 0, 1, seededRng(7)).queue;
    expect(a).toEqual(b);
  });

  it('starts a fresh pass of all questions when everything is answered', () => {
    const answers = Object.fromEntries(ids.map((id, i) => [id, at(1000 + i)]));
    const plan = planShuffledPass(ids, answers, 0, 500, seededRng(3));
    expect(plan.isNewPass).toBe(true);
    expect(plan.doneBefore).toBe(0);
    expect(new Set(plan.queue).size).toBe(ids.length);
    // later than every answer even though the clock says 500
    expect(plan.passStart).toBe(1000 + ids.length);
  });

  it('a reload mid-pass does not repeat questions answered in this pass', () => {
    const passStart = 2000;
    const answers = Object.fromEntries(ids.map((id) => [id, at(1000)])); // all from the previous pass
    answers['t-3'] = at(2001);
    answers['t-4'] = at(2000); // answered in the same millisecond the pass began
    const plan = planShuffledPass(ids, answers, passStart, 3000, seededRng(9));
    expect(plan.isNewPass).toBe(false);
    expect(plan.doneBefore).toBe(2);
    expect(plan.queue).not.toContain('t-3');
    expect(plan.queue).not.toContain('t-4');
    expect(remainingInPass(ids, answers, passStart)).toHaveLength(48);
  });

  it('newPassStart uses the clock when it is ahead', () => {
    expect(newPassStart(['a'], { a: at(10) }, 99)).toBe(99);
  });
});

describe('exam sampling by blocks', () => {
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const pools = (sizes: Record<string, number>): ExamBlockPool[] => [
    { id: 'rules', count: 10, ids: ids('r', sizes.rules ?? 1500) },
    { id: 'safety', count: 4, ids: ids('s', sizes.safety ?? 180) },
    { id: 'construction', count: 4, ids: ids('c', sizes.construction ?? 33) },
    { id: 'firstaid', count: 2, ids: ids('f', sizes.firstaid ?? 60) },
  ];
  const byBlock = (s: string[]) => ({
    rules: s.filter((x) => x.startsWith('r')).length,
    safety: s.filter((x) => x.startsWith('s')).length,
    construction: s.filter((x) => x.startsWith('c')).length,
    firstaid: s.filter((x) => x.startsWith('f')).length,
  });

  it('takes 10/4/4/2 distinct questions from the blocks', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = sampleExamQuestions(pools({}), seededRng(seed));
      expect(s).toHaveLength(20);
      expect(new Set(s).size).toBe(20);
      expect(byBlock(s)).toEqual({ rules: 10, safety: 4, construction: 4, firstaid: 2 });
    }
  });

  it('shuffles the blocks together', () => {
    const s = sampleExamQuestions(pools({}), seededRng(3));
    expect(s.slice(0, 10).every((x) => x.startsWith('r'))).toBe(false);
  });

  it('fills a short block from the rules block', () => {
    const s = sampleExamQuestions(pools({ construction: 2, firstaid: 0 }), seededRng(9));
    expect(s).toHaveLength(20);
    expect(new Set(s).size).toBe(20);
    expect(byBlock(s)).toEqual({ rules: 14, safety: 4, construction: 2, firstaid: 0 });
  });

  it('still gives distinct questions when the rules block is short too', () => {
    const s = sampleExamQuestions(pools({ rules: 11, construction: 1 }), seededRng(4));
    expect(s).toHaveLength(20);
    expect(new Set(s).size).toBe(20);
    expect(byBlock(s)).toMatchObject({ rules: 11, construction: 1 });
  });

  it('is deterministic with a seeded RNG', () => {
    expect(sampleExamQuestions(pools({}), seededRng(5))).toEqual(sampleExamQuestions(pools({}), seededRng(5)));
    expect(sampleExamQuestions(pools({}), seededRng(5))).not.toEqual(sampleExamQuestions(pools({}), seededRng(6)));
  });

  it('groups topics into pools by block', () => {
    const p = examPools(
      [
        { id: 'rules', count: 10 },
        { id: 'firstaid', count: 2 },
      ],
      [
        { block: 'rules', questions: [{ id: '1-1' }, { id: '1-2' }] },
        { block: 'firstaid', questions: [{ id: '37-1' }] },
        { block: 'rules', questions: [{ id: '2-1' }] },
      ],
    );
    expect(p).toEqual([
      { id: 'rules', count: 10, ids: ['1-1', '1-2', '2-1'] },
      { id: 'firstaid', count: 2, ids: ['37-1'] },
    ]);
  });

  it('describes the composition in one line', () => {
    expect(
      examCompositionLine([
        { id: 'rules', title: '', count: 10 },
        { id: 'safety', title: '', count: 4 },
        { id: 'construction', title: '', count: 4 },
        { id: 'firstaid', title: '', count: 2 },
      ]),
    ).toBe('10 питань з ПДР, 4 з безпеки руху, 4 з будови та експлуатації, 2 з домедичної допомоги');
  });
});

describe('exam grading', () => {
  const correct = Array<number>(20).fill(0);
  const withWrong = (n: number) => correct.map((_, i) => (i < n ? 1 : 0));

  it('passes with 2 mistakes and fails with 3', () => {
    expect(gradeExam(correct, withWrong(2))).toMatchObject({ correctCount: 18, mistakes: 2, passed: true });
    expect(gradeExam(correct, withWrong(3))).toMatchObject({ correctCount: 17, mistakes: 3, passed: false });
  });

  it('ends on the third mistake only in instant-feedback mode', () => {
    expect(endsOnMistakes(true, 2)).toBe(false);
    expect(endsOnMistakes(true, 3)).toBe(true);
    expect(endsOnMistakes(false, 3)).toBe(false);
    expect(endsOnMistakes(false, 20)).toBe(false);
  });

  it('counts unanswered questions as mistakes on timeout', () => {
    const answers: (number | null)[] = correct.map((_, i) => (i < 17 ? 0 : null));
    const a = buildAttempt({
      id: 'x',
      questionIds: correct.map((_, i) => `q${i}`),
      correct,
      answers,
      startedAt: 0,
      finishedAt: (EXAM_DURATION_SEC + 3) * 1000,
      endReason: 'timeout',
      instantFeedback: true,
    });
    expect(a).toMatchObject({ correctCount: 17, mistakes: 3, passed: false, endReason: 'timeout' });
    expect(a.durationSec).toBe(EXAM_DURATION_SEC);
  });

  it('timeout with at most 2 unanswered still passes', () => {
    const answers: (number | null)[] = correct.map((_, i) => (i < 18 ? 0 : null));
    expect(gradeExam(correct, answers)).toMatchObject({ unanswered: 2, mistakes: 2, passed: true });
  });
});

describe('exam timer', () => {
  it('derives remaining time from timestamps', () => {
    expect(remainingMs(1000, 1200, 1000)).toBe(1_200_000);
    expect(remainingMs(1000, 1200, 1000 + 1_199_500)).toBe(500);
    expect(remainingMs(1000, 1200, 1000 + 5_000_000)).toBe(0);
  });
  it('formats as m:ss rounding up', () => {
    expect(formatClock(1_200_000)).toBe('20:00');
    expect(formatClock(61_001)).toBe('1:02');
    expect(formatClock(500)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });
});

describe('review selection', () => {
  const correctOf = () => 0;
  const pad = (head: (number | null)[]) => [...head, ...Array<null>(20 - head.length).fill(null)];

  it('third-mistake end lists only the wrong answers and counts the rest as unseen', () => {
    const answers = pad([0, 1, 0, 1, 1]); // wrong at 2, 4, 5
    const sel = reviewSelection({ answers, endReason: 'mistakes', seenCount: 5 }, correctOf);
    expect(sel.items).toEqual([
      { index: 1, choice: 1 },
      { index: 3, choice: 1 },
      { index: 4, choice: 1 },
    ]);
    expect(sel.unseen).toBe(15);
  });

  it('timeout lists the on-screen unanswered question but not the unseen ones', () => {
    const answers = pad([0, 2, 0]);
    const sel = reviewSelection({ answers, endReason: 'timeout', seenCount: 4 }, correctOf);
    expect(sel.items).toEqual([
      { index: 1, choice: 2 },
      { index: 3, choice: null },
    ]);
    expect(sel.unseen).toBe(16);
  });

  it('timeout right after answering (panel shown) has no unanswered item', () => {
    const answers = pad([0, 0, 1]);
    const sel = reviewSelection({ answers, endReason: 'timeout', seenCount: 3 }, correctOf);
    expect(sel.items).toEqual([{ index: 2, choice: 1 }]);
    expect(sel.unseen).toBe(17);
  });

  it('derives seen questions for old records without seenCount', () => {
    const answers = pad([0, 1]);
    expect(reviewSelection({ answers, endReason: 'timeout' }, correctOf)).toMatchObject({ unseen: 17 });
    expect(reviewSelection({ answers, endReason: 'timeout' }, correctOf).items.at(-1)).toEqual({ index: 2, choice: null });
    expect(reviewSelection({ answers, endReason: 'mistakes' }, correctOf)).toMatchObject({ unseen: 18 });
  });

  it('a completed exam has nothing unseen', () => {
    const answers = Array<number>(20).fill(0).map((v, i) => (i < 4 ? 1 : v));
    const sel = reviewSelection({ answers, endReason: 'completed', seenCount: 20 }, correctOf);
    expect(sel.items).toHaveLength(4);
    expect(sel.unseen).toBe(0);
  });
});

describe('Ukrainian plural', () => {
  it('picks 1 / 2–4 / 5+ forms', () => {
    const f = (n: number) => pluralUk(n, 'one', 'few', 'many');
    expect([1, 2, 4, 5, 11, 12, 14, 15, 21, 22, 25].map(f)).toEqual([
      'one', 'few', 'few', 'many', 'many', 'many', 'many', 'many', 'one', 'few', 'many',
    ]);
    expect(unseenLine(1)).toBe('Ще 1 питання ти не встиг побачити.');
    expect(unseenLine(3)).toBe('Ще 3 питання ти не встиг побачити.');
    expect(unseenLine(15)).toBe('Ще 15 питань ти не встиг побачити.');
  });
});

describe('explanation refs', () => {
  it('formats rule points and sign sections', async () => {
    const { formatRefs } = await import('../components/Explanation');
    expect(formatRefs(['12.6 б', '12.4'])).toBe('ПДР: п. 12.6 б, п. 12.4');
    expect(formatRefs(['33 (знак 3.29)'])).toBe('ПДР: розділ 33 (знак 3.29)');
    expect(formatRefs(['2.11', 'Закон № 3720-IX, ст. 31 ч. 2'])).toBe(
      'ПДР: п. 2.11; Закон № 3720-IX, ст. 31 ч. 2',
    );
    expect(formatRefs(['КУпАП, ст. 263'])).toBe('КУпАП, ст. 263');
  });
});

describe('examRunEntry', () => {
  const exam = { category: 'B' as const, questionIds: ['1-1', '1-2'] };
  const known = new Set(['1-1', '1-2', '1-3']);
  const has = (id: string) => known.has(id);

  it('starts a new exam when requested, even over an active one', () => {
    expect(examRunEntry(true, exam, 'B', has)).toBe('new');
    expect(examRunEntry(true, null, 'C', has)).toBe('new');
  });

  it('restores an active exam of the selected category', () => {
    expect(examRunEntry(false, exam, 'B', has)).toBe('restore');
  });

  it('goes back to the start screen with no active exam or another category', () => {
    expect(examRunEntry(false, null, 'B', has)).toBe('none');
    expect(examRunEntry(false, exam, 'C', has)).toBe('none');
  });

  it('marks the exam stale when a question no longer exists', () => {
    expect(examRunEntry(false, { ...exam, questionIds: ['1-1', '9-9'] }, 'B', has)).toBe('stale');
  });
});
