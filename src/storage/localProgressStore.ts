import { normalizeProgress } from './normalize';
import { MAX_EXAMS, type AnswerInput, type AnswerRecord, type ExamAttempt, type ProgressData, type ProgressStore, type Settings } from './types';

export const STORAGE_VERSION = 1;
export const STORAGE_KEY = `pdrtest.progress.v${STORAGE_VERSION}`;

/** The subset of the Web Storage API this store needs (lets tests pass a fake). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Access itself can throw (blocked cookies / site data).
    return null;
  }
}

/**
 * ProgressStore on localStorage. Keeps an in-memory copy; if storage is
 * unavailable or a write fails, the app keeps working for the current session.
 */
export class LocalProgressStore implements ProgressStore {
  private readonly storage: KeyValueStorage | null;
  private data: ProgressData | null = null;

  constructor(storage: KeyValueStorage | null = defaultStorage()) {
    this.storage = storage;
  }

  private read(): ProgressData {
    if (this.data) return this.data;
    let raw: unknown = null;
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      if (text) raw = JSON.parse(text);
    } catch {
      raw = null; // corrupt JSON or unreadable storage: start empty
    }
    this.data = normalizeProgress(raw);
    return this.data;
  }

  private write(next: ProgressData): ProgressData {
    this.data = next;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...next }));
    } catch {
      // Quota exceeded or storage blocked: keep the in-memory state.
    }
    return next;
  }

  async load(): Promise<ProgressData> {
    return this.read();
  }

  async recordAnswer({ questionId, choice, correct, at = Date.now() }: AnswerInput): Promise<ProgressData> {
    const cur = this.read();
    return this.write({
      ...cur,
      answers: { ...cur.answers, [questionId]: nextRecord(cur.answers[questionId], choice, correct, at) },
    });
  }

  async startTopicPass(topicId: string, startedAt: number): Promise<ProgressData> {
    const cur = this.read();
    return this.write({ ...cur, topicPassStarts: { ...cur.topicPassStarts, [topicId]: startedAt } });
  }

  async startMarathonPass(startedAt: number): Promise<ProgressData> {
    const cur = this.read();
    return this.write({ ...cur, marathonPassStart: startedAt });
  }

  async saveExam(attempt: ExamAttempt, correct: readonly number[]): Promise<ProgressData> {
    const cur = this.read();
    const answers = { ...cur.answers };
    attempt.questionIds.forEach((id, i) => {
      const choice = attempt.answers[i];
      if (choice === null || choice === undefined) return;
      answers[id] = nextRecord(answers[id], choice, choice === correct[i], attempt.finishedAt);
    });
    const exams = [...cur.exams.filter((e) => e.id !== attempt.id), attempt].slice(-MAX_EXAMS);
    return this.write({ ...cur, answers, exams });
  }

  async setTopicPosition(topicId: string, index: number): Promise<ProgressData> {
    const cur = this.read();
    const safe = Number.isInteger(index) && index >= 0 ? index : 0;
    if (cur.topicPositions[topicId] === safe) return cur;
    return this.write({ ...cur, topicPositions: { ...cur.topicPositions, [topicId]: safe } });
  }

  async resetTopic(topicId: string, questionIds: readonly string[]): Promise<ProgressData> {
    const cur = this.read();
    const answers = { ...cur.answers };
    for (const id of questionIds) delete answers[id];
    const topicPositions = { ...cur.topicPositions };
    delete topicPositions[topicId];
    const topicPassStarts = { ...cur.topicPassStarts };
    delete topicPassStarts[topicId];
    return this.write({ ...cur, answers, topicPositions, topicPassStarts });
  }

  async updateSettings(patch: Partial<Settings>): Promise<ProgressData> {
    const cur = this.read();
    return this.write({ ...cur, settings: { ...cur.settings, ...patch } });
  }
}

function nextRecord(prev: AnswerRecord | undefined, choice: number, correct: boolean, at: number): AnswerRecord {
  return {
    attempts: (prev?.attempts ?? 0) + 1,
    correctCount: (prev?.correctCount ?? 0) + (correct ? 1 : 0),
    lastChoice: choice,
    lastCorrect: correct,
    lastAt: at,
  };
}
