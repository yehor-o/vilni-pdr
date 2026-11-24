import type { ActiveExam, CategoryId, ExamAttempt, ExamEndReason } from '../storage/types';
import { defaultRng, sample, shuffle, type Rng } from './random';

export type { ExamAttempt, ExamEndReason };

export const EXAM_QUESTIONS = 20;
export const EXAM_DURATION_SEC = 20 * 60;
export const EXAM_MAX_MISTAKES = 2;

/** Exam block with the question ids it can draw from. */
export interface ExamBlockPool {
  id: string;
  /** Questions drawn from this block. */
  count: number;
  ids: readonly string[];
}

/** Block that makes up for blocks with too few questions. */
export const FALLBACK_BLOCK = 'rules';

/** Groups the questions of a category bank by exam block, in `examBlocks` order. */
export function examPools(
  examBlocks: readonly { id: string; count: number }[],
  topics: readonly { block: string; questions: readonly { id: string }[] }[],
): ExamBlockPool[] {
  return examBlocks.map((b) => ({
    id: b.id,
    count: b.count,
    ids: topics.filter((t) => t.block === b.id).flatMap((t) => t.questions.map((q) => q.id)),
  }));
}

/**
 * Exam question sampler: `count` distinct random ids from each block (10 rules,
 * 4 safety, 4 construction, 2 first aid), then shuffled together. A block with
 * fewer questions than its count gives all it has and the rest comes from the
 * FALLBACK_BLOCK (and, only if that runs out too, from any block left).
 */
export function sampleExamQuestions(pools: readonly ExamBlockPool[], rng: Rng = defaultRng): string[] {
  const total = pools.reduce((n, p) => n + p.count, 0);
  const picked = new Set<string>();
  for (const p of pools) for (const id of sample(p.ids, p.count, rng)) picked.add(id);

  const fallback = pools.find((p) => p.id === FALLBACK_BLOCK);
  const others = pools.filter((p) => p !== fallback);
  for (const p of fallback ? [fallback, ...others] : others) {
    if (picked.size >= total) break;
    const left = p.ids.filter((id) => !picked.has(id));
    for (const id of sample(left, total - picked.size, rng)) picked.add(id);
  }
  return shuffle([...picked], rng);
}

export interface Grade {
  correctCount: number;
  wrong: number;
  unanswered: number;
  /** wrong + unanswered */
  mistakes: number;
  passed: boolean;
}

/** `correct[i]` is the correct option of question i; `answers[i]` the choice or null. */
export function gradeExam(correct: readonly number[], answers: readonly (number | null)[]): Grade {
  let correctCount = 0;
  let wrong = 0;
  let unanswered = 0;
  correct.forEach((c, i) => {
    const a = answers[i];
    if (a === null || a === undefined) unanswered += 1;
    else if (a === c) correctCount += 1;
    else wrong += 1;
  });
  const mistakes = wrong + unanswered;
  return { correctCount, wrong, unanswered, mistakes, passed: mistakes <= EXAM_MAX_MISTAKES };
}

/** In instant-feedback mode the exam ends right after the third mistake. */
export function endsOnMistakes(instantFeedback: boolean, wrongSoFar: number): boolean {
  return instantFeedback && wrongSoFar > EXAM_MAX_MISTAKES;
}

/** Remaining time derived from timestamps (immune to timer throttling). */
export function remainingMs(startedAt: number, durationSec: number, now: number): number {
  return Math.max(0, startedAt + durationSec * 1000 - now);
}

/** mm:ss, rounding seconds up so 0:00 means time is really over. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** mm:ss for a duration in whole seconds. */
export function formatDuration(sec: number): string {
  return formatClock(sec * 1000);
}

export interface FinishInput {
  id: string;
  questionIds: string[];
  correct: readonly number[];
  answers: (number | null)[];
  startedAt: number;
  finishedAt: number;
  endReason: ExamEndReason;
  instantFeedback: boolean;
  durationLimitSec?: number;
  /** Questions shown before the end (current index + 1). */
  seenCount?: number;
  /** Category the exam was taken in. */
  category?: ExamAttempt['category'];
}

export function buildAttempt(input: FinishInput): ExamAttempt {
  const g = gradeExam(input.correct, input.answers);
  const limit = input.durationLimitSec ?? EXAM_DURATION_SEC;
  return {
    id: input.id,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationSec: Math.min(limit, Math.max(0, Math.round((input.finishedAt - input.startedAt) / 1000))),
    questionIds: input.questionIds.slice(),
    answers: input.answers.slice(),
    correctCount: g.correctCount,
    mistakes: g.mistakes,
    passed: g.passed,
    endReason: input.endReason,
    instantFeedback: input.instantFeedback,
    ...(input.seenCount !== undefined ? { seenCount: input.seenCount } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
  };
}

export function newAttemptId(now: number, rng: Rng = defaultRng): string {
  return `${now.toString(36)}-${Math.floor(rng() * 36 ** 4).toString(36)}`;
}

/**
 * What #/exam/run does on entry: start a requested new exam; restore the active
 * one if it belongs to the selected category and all its questions still
 * exist; drop it ('stale') if its questions no longer resolve; otherwise
 * ('none') go back to the start screen.
 */
export type ExamRunEntry = 'new' | 'restore' | 'stale' | 'none';

export function examRunEntry(
  startRequested: boolean,
  active: Pick<ActiveExam, 'category' | 'questionIds'> | null,
  category: CategoryId,
  hasQuestion: (id: string) => boolean,
): ExamRunEntry {
  if (startRequested) return 'new';
  if (!active || active.category !== category) return 'none';
  return active.questionIds.every(hasQuestion) ? 'restore' : 'stale';
}

export interface ReviewItem {
  index: number;
  /** null = the question was on screen but unanswered when the exam ended. */
  choice: number | null;
}

export interface ReviewSelection {
  /** Answered wrongly, or on screen unanswered at the end, in exam order. */
  items: ReviewItem[];
  /** Questions the user never reached. */
  unseen: number;
}

/**
 * Which questions to list in the result/review. The exam is sequential, so
 * everything after the last shown question was never seen. Old records without
 * `seenCount` derive it from the first unanswered question.
 */
export function reviewSelection(
  attempt: Pick<ExamAttempt, 'answers' | 'endReason' | 'seenCount'>,
  correctOf: (index: number) => number | undefined,
): ReviewSelection {
  const total = attempt.answers.length;
  let seen = attempt.seenCount;
  if (seen === undefined) {
    const firstUnanswered = attempt.answers.findIndex((a) => a === null);
    if (firstUnanswered === -1) seen = total;
    else seen = attempt.endReason === 'timeout' ? firstUnanswered + 1 : firstUnanswered;
  }
  seen = Math.min(Math.max(seen, 0), total);
  const items: ReviewItem[] = [];
  for (let i = 0; i < seen; i++) {
    const choice = attempt.answers[i] ?? null;
    if (choice === null || choice !== correctOf(i)) items.push({ index: i, choice });
  }
  return { items, unseen: total - seen };
}

/** Ukrainian plural: 1 / 2–4 / 5+ (with 11–14 as "many"). */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

const BLOCK_PHRASES: Readonly<Record<string, string>> = {
  rules: 'з ПДР',
  safety: 'з безпеки руху',
  construction: 'з будови та експлуатації',
  firstaid: 'з домедичної допомоги',
};

/** «10 питань з ПДР, 4 з безпеки руху, 4 з будови та експлуатації, 2 з домедичної допомоги». */
export function examCompositionLine(blocks: readonly { id: string; title: string; count: number }[]): string {
  return blocks
    .map((b, i) => {
      const what = BLOCK_PHRASES[b.id] ?? `з розділу «${b.title}»`;
      return i === 0 ? `${b.count} ${pluralUk(b.count, 'питання', 'питання', 'питань')} ${what}` : `${b.count} ${what}`;
    })
    .join(', ');
}

export function unseenLine(n: number): string {
  return `Ще ${n} ${pluralUk(n, 'питання', 'питання', 'питань')} ти не встиг побачити.`;
}
