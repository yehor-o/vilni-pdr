// The only entry point for persistence. Nothing outside src/storage/ may touch
// localStorage / sessionStorage / indexedDB directly.
export type {
  AnswerInput,
  AnswerRecord,
  ExamAttempt,
  ExamEndReason,
  PracticeOrder,
  ProgressData,
  ProgressStore,
  Settings,
} from './types';
export { DEFAULT_SETTINGS, MAX_EXAMS, emptyProgress } from './types';
export { LocalProgressStore, STORAGE_KEY } from './localProgressStore';
export { topicStats, practiceStartIndex, type TopicStats } from './stats';
export { ProgressProvider, useProgress } from './ProgressProvider';
