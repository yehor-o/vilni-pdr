// The only entry point for persistence. Nothing outside src/storage/ may touch
// localStorage / sessionStorage / indexedDB directly.
export type {
  ActiveExam,
  AnswerInput,
  CategoryId,
  AnswerRecord,
  ExamAttempt,
  ExamEndReason,
  PracticeOrder,
  ProgressData,
  ProgressStore,
  Settings,
} from './types';
export {
  CATEGORY_IDS,
  DEFAULT_CATEGORY,
  DEFAULT_SETTINGS,
  MAX_EXAMS,
  emptyProgress,
  examCategory,
  isCategoryId,
} from './types';
export { LocalProgressStore, STORAGE_KEY } from './localProgressStore';
export { topicStats, practiceStartIndex, mistakeIds, type TopicStats } from './stats';
export { ProgressProvider, useProgress } from './ProgressProvider';
