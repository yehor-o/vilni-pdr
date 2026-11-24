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

/** Colour theme: follow the system, or a fixed choice. */
export type ThemePref = 'system' | 'light' | 'dark';

export function isThemePref(v: unknown): v is ThemePref {
  return v === 'system' || v === 'light' || v === 'dark';
}

/** Licence category groups the app knows (ids from public/data/questions.json). */
export const CATEGORY_IDS = ['A', 'B', 'C', 'D', 'T'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];
/** Category of old data that predates the category switch. */
export const DEFAULT_CATEGORY: CategoryId = 'B';

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === 'string' && (CATEGORY_IDS as readonly string[]).includes(v);
}

export interface Settings {
  /** Selected licence category; every screen works within it. */
  category: CategoryId;
  /** Exam mode: show correctness right after each answer (true) or only at the end. */
  examInstantFeedback: boolean;
  /** Question order in topic practice. */
  practiceOrder: PracticeOrder;
  /** Colour theme. */
  theme: ThemePref;
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
  /** Category the exam was taken in; absent in old records, which are category B (see examCategory). */
  category?: CategoryId;
}

/** Category of an attempt; records from before the category switch are 'B'. */
export function examCategory(attempt: Pick<ExamAttempt, 'category'>): CategoryId {
  return attempt.category ?? DEFAULT_CATEGORY;
}

/** An exam in progress, persisted so it survives a reload or an unloaded tab. */
export interface ActiveExam {
  id: string;
  category: CategoryId;
  questionIds: string[];
  /** Chosen option index per question, null = unanswered. */
  answers: (number | null)[];
  /** 0-based index of the question on screen. */
  step: number;
  /** ms since epoch; the clock keeps running while the page is closed. */
  startedAt: number;
  durationSec: number;
  instantFeedback: boolean;
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
  /** Marathon: start time of the current lap over the category's base, per category id (absent = first lap). */
  marathonPassStarts: Record<string, number>;
  /** Finished exams, oldest first, at most MAX_EXAMS. */
  exams: ExamAttempt[];
  /** The one exam in progress (single slot), null if none. */
  activeExam: ActiveExam | null;
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
  /** Begin a new marathon lap of `category` at `startedAt`. */
  startMarathonPass(category: string, startedAt: number): Promise<ProgressData>;
  /** Forget answers to the given questions and the topic's position/pass. */
  resetTopic(topicId: string, questionIds: readonly string[]): Promise<ProgressData>;
  updateSettings(patch: Partial<Settings>): Promise<ProgressData>;
  /**
   * Append a finished exam (history capped at MAX_EXAMS, newest kept) and
   * add its answers to the per-question history. `correct[i]` is the correct
   * option of `attempt.questionIds[i]`. Also clears `activeExam` if it is this
   * attempt, in the same write.
   */
  saveExam(attempt: ExamAttempt, correct: readonly number[]): Promise<ProgressData>;
  /** Replace the exam in progress (there is only one slot). */
  saveActiveExam(exam: ActiveExam): Promise<ProgressData>;
  clearActiveExam(): Promise<ProgressData>;
  /** Replace all progress (restore from a backup). Any exam in progress is dropped. */
  replaceAll(data: ProgressData): Promise<ProgressData>;
}

export const MAX_EXAMS = 200;

export const DEFAULT_SETTINGS: Settings = {
  category: DEFAULT_CATEGORY,
  examInstantFeedback: true,
  practiceOrder: 'official',
  theme: 'system',
};

export function emptyProgress(): ProgressData {
  return {
    answers: {},
    topicPositions: {},
    topicPassStarts: {},
    marathonPassStarts: {},
    exams: [],
    activeExam: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}
