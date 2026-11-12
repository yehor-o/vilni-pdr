import { defaultRng, shuffle, type Rng } from './random';

type Answers = Readonly<Record<string, { lastAt: number } | undefined>>;

/**
 * Shuffled practice passes.
 *
 * A pass is identified by its start time `passStart` (0 = the first pass).
 * A question is "done in this pass" when it has an answer with
 * `lastAt >= passStart`; for the first pass that simply means "ever answered".
 * Only `passStart` is persisted per topic, so a reload reshuffles what is left
 * but never repeats a question already answered in the pass.
 */
export function remainingInPass(ids: readonly string[], answers: Answers, passStart: number): string[] {
  return ids.filter((id) => {
    const a = answers[id];
    return !a || a.lastAt < passStart;
  });
}

/** Start time for a new pass: later than every recorded answer, even with a skewed clock. */
export function newPassStart(ids: readonly string[], answers: Answers, now: number): number {
  let max = 0;
  for (const id of ids) max = Math.max(max, answers[id]?.lastAt ?? 0);
  return Math.max(now, max + 1);
}

export interface ShuffledPlan {
  /** Questions still to show in this pass, in random order. */
  queue: string[];
  /** Questions already done in this pass. */
  doneBefore: number;
  passStart: number;
  /** True if a new pass had to be started (caller should persist `passStart`). */
  isNewPass: boolean;
}

export function planShuffledPass(
  ids: readonly string[],
  answers: Answers,
  storedPassStart: number,
  now: number,
  rng: Rng = defaultRng,
): ShuffledPlan {
  const remaining = remainingInPass(ids, answers, storedPassStart);
  if (remaining.length > 0) {
    return {
      queue: shuffle(remaining, rng),
      doneBefore: ids.length - remaining.length,
      passStart: storedPassStart,
      isNewPass: false,
    };
  }
  return {
    queue: shuffle(ids, rng),
    doneBefore: 0,
    passStart: newPassStart(ids, answers, now),
    isNewPass: true,
  };
}
