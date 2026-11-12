import type { ProgressData } from './types';

export interface TopicStats {
  total: number;
  /** Questions answered at least once. */
  answered: number;
  /** Questions whose last answer was correct. */
  lastCorrect: number;
  /** lastCorrect / total, 0..1 (0 for an empty topic). */
  lastCorrectShare: number;
}

/** Per-topic statistics derived from the answer history. */
export function topicStats(questionIds: readonly string[], data: Pick<ProgressData, 'answers'>): TopicStats {
  let answered = 0;
  let lastCorrect = 0;
  for (const id of questionIds) {
    const a = data.answers[id];
    if (!a) continue;
    answered += 1;
    if (a.lastCorrect) lastCorrect += 1;
  }
  const total = questionIds.length;
  return { total, answered, lastCorrect, lastCorrectShare: total ? lastCorrect / total : 0 };
}

/** Questions whose last answer was wrong, in the order of `questionIds`. */
export function mistakeIds(questionIds: readonly string[], data: Pick<ProgressData, 'answers'>): string[] {
  return questionIds.filter((id) => {
    const a = data.answers[id];
    return a !== undefined && !a.lastCorrect;
  });
}

/**
 * Where a practice pass starts: the first never-answered question; if all are
 * answered, the stored position of an unfinished repeat pass (default 0).
 */
export function practiceStartIndex(
  topicId: string,
  questionIds: readonly string[],
  data: Pick<ProgressData, 'answers' | 'topicPositions'>,
): number {
  const firstNew = questionIds.findIndex((id) => !data.answers[id]);
  if (firstNew !== -1) return firstNew;
  const pos = data.topicPositions[topicId] ?? 0;
  return pos < questionIds.length ? pos : 0;
}
