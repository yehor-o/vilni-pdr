import { DEFAULT_CATEGORY } from '../storage/types';
import type { QuestionBank, QuestionData } from './types';

/**
 * The bank of one category: its topics in official order plus the exam blocks.
 * An unknown id falls back to DEFAULT_CATEGORY (or the first category).
 */
export function categoryBank(data: QuestionData, categoryId: string): QuestionBank {
  const cat =
    data.categories.find((c) => c.id === categoryId) ??
    data.categories.find((c) => c.id === DEFAULT_CATEGORY) ??
    data.categories[0]!;
  const byId = new Map(data.topics.map((t) => [t.id, t]));
  return {
    order: data.order,
    category: cat.id,
    categoryTitle: cat.title,
    examBlocks: data.examBlocks,
    topics: cat.topicIds.flatMap((id) => byId.get(id) ?? []),
  };
}
