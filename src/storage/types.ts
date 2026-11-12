/** Answer history of one question (aggregated, not a full log). */
export interface AnswerRecord {
  /** How many times the question was answered. */
  attempts: number;
  /** How many of those answers were correct. */
  correctCount: number;
  /** Option index chosen last time (0-based). */
  lastChoice: number;
  /** Whether the last answer was correct. */
  lastCorrect: boolean;
  /** Time of the last answer, ms since epoch. */
  lastAt: number;
}

export type PracticeOrder = 'official' | 'shuffled';

export interface Settings {
  /** Exam mode: show correctness right after each answer (true) or only at the end. */
  examInstantFeedback: boolean;
  /** Question order in topic practice. */
  practiceOrder: PracticeOrder;
}

export type ExamEndReason = 'completed' | 'mistakes' | 'timeout';

/** One finished exam simulation. */
export interface ExamAttempt {
  id: string;
  startedAt: number;
  finishedAt: number;
  durationSec: number;
  questionIds: string[];
  /** Chosen option index per question, null = unanswered. */
  answers: (number | null)[];
  correctCount: number;
  /** Wrong + unanswered. */
  mistakes: number;
  passed: boolean;
  endReason: ExamEndReason;
  instantFeedback: boolean;
  /** How many questions were shown (reached) before the end; absent in old records. */
  seenCount?: number;
}

/**
 * Everything the app persists. New features add new top-level fields that
 * `normalizeProgress` fills with defaults, so older stored data keeps loading
 * without a migration.
 */
export interface ProgressData {
  /** Per-question history, keyed by question id ("8.1-6"). */
  answers: Record<string, AnswerRecord>;
  /** Official order: index (0-based) of the current question per topic id. */
  topicPositions: Record<string, number>;
  /** Shuffled order: start time of the current pass per topic id (absent = first pass). */
  topicPassStarts: Record<string, number>;
  /** Finished exams, oldest first, at most MAX_EXAMS. */
  exams: ExamAttempt[];
  settings: Settings;
}

export interface AnswerInput {
  questionId: string;
  choice: number;
  correct: boolean;
  /** Defaults to Date.now(). */
  at?: number;
}

/**
 * The only persistence API of the app. Every method is async so that a
 * remote (account-sync) implementation can sit behind the same interface.
 * Mutating methods resolve with the full updated data.
 */
export interface ProgressStore {
  load(): Promise<ProgressData>;
  recordAnswer(input: AnswerInput): Promise<ProgressData>;
  setTopicPosition(topicId: string, index: number): Promise<ProgressData>;
  /** Begin a new shuffled pass of a topic at `startedAt`. */
  startTopicPass(topicId: string, startedAt: number): Promise<ProgressData>;
  /** Forget answers to the given questions and the topic's position/pass. */
  resetTopic(topicId: string, questionIds: readonly string[]): Promise<ProgressData>;
  updateSettings(patch: Partial<Settings>): Promise<ProgressData>;
  /**
   * Append a finished exam (history capped at MAX_EXAMS, newest kept) and
   * add its answers to the per-question history. `correct[i]` is the correct
   * option of `attempt.questionIds[i]`.
   */
  saveExam(attempt: ExamAttempt, correct: readonly number[]): Promise<ProgressData>;
}

export const MAX_EXAMS = 200;

export const DEFAULT_SETTINGS: Settings = { examInstantFeedback: true, practiceOrder: 'official' };

export function emptyProgress(): ProgressData {
  return { answers: {}, topicPositions: {}, topicPassStarts: {}, exams: [], settings: { ...DEFAULT_SETTINGS } };
}
