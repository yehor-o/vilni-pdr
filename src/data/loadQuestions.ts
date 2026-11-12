import type { QuestionBank } from './types';

export const QUESTIONS_URL = 'data/questions.b.json';

/** Relative URL of a question image (works under any sub-path). */
export function imageUrl(name: string): string {
  return `img/${name}`;
}

function isQuestionBank(value: unknown): value is QuestionBank {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<QuestionBank>;
  return (
    typeof v.order === 'string' &&
    Array.isArray(v.topics) &&
    v.topics.every(
      (t) => typeof t?.id === 'string' && typeof t.title === 'string' && Array.isArray(t.questions),
    )
  );
}

let cached: Promise<QuestionBank> | null = null;

/** Fetches the question bank once and keeps it in memory. A failed load is not cached. */
export function loadQuestions(): Promise<QuestionBank> {
  if (!cached) {
    cached = fetch(QUESTIONS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((json) => {
        if (!isQuestionBank(json)) throw new Error('Unexpected data format');
        return json;
      })
      .catch((err: unknown) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}
