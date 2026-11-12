import type { QuestionData } from './types';

export const QUESTIONS_URL = 'data/questions.json';

/** Relative URL of a question image (works under any sub-path). */
export function imageUrl(name: string): string {
  return `img/${name}`;
}

function isQuestionData(value: unknown): value is QuestionData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<QuestionData>;
  return (
    typeof v.order === 'string' &&
    Array.isArray(v.examBlocks) &&
    v.examBlocks.every((b) => typeof b?.id === 'string' && typeof b.title === 'string' && Number.isInteger(b.count)) &&
    Array.isArray(v.categories) &&
    v.categories.length > 0 &&
    v.categories.every((c) => typeof c?.id === 'string' && typeof c.title === 'string' && Array.isArray(c.topicIds)) &&
    Array.isArray(v.topics) &&
    v.topics.every(
      (t) =>
        typeof t?.id === 'string' &&
        typeof t.title === 'string' &&
        typeof t.block === 'string' &&
        Array.isArray(t.questions),
    )
  );
}

let cached: Promise<QuestionData> | null = null;

/** Fetches the question data (all categories) once and keeps it in memory. A failed load is not cached. */
export function loadQuestions(): Promise<QuestionData> {
  if (!cached) {
    cached = fetch(QUESTIONS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((json) => {
        if (!isQuestionData(json)) throw new Error('Unexpected data format');
        return json;
      })
      .catch((err: unknown) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}
