import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LocalProgressStore } from './localProgressStore';
import type { AnswerInput, ExamAttempt, ProgressData, ProgressStore, Settings } from './types';
import { StatusScreen } from '../components/StatusScreen';

export interface ProgressContextValue {
  data: ProgressData;
  recordAnswer(input: AnswerInput): Promise<void>;
  setTopicPosition(topicId: string, index: number): Promise<void>;
  startTopicPass(topicId: string, startedAt: number): Promise<void>;
  startMarathonPass(category: string, startedAt: number): Promise<void>;
  saveExam(attempt: ExamAttempt, correct: readonly number[]): Promise<void>;
  resetTopic(topicId: string, questionIds: readonly string[]): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

/** Exposes the ProgressStore to React. Pass `store` to swap the backend. */
export function ProgressProvider({ store: given, children }: { store?: ProgressStore; children: ReactNode }) {
  const [store] = useState<ProgressStore>(() => given ?? new LocalProgressStore());
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    let alive = true;
    store.load().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [store]);

  const value = useMemo<ProgressContextValue | null>(() => {
    if (!data) return null;
    return {
      data,
      recordAnswer: async (input) => setData(await store.recordAnswer(input)),
      setTopicPosition: async (topicId, index) => setData(await store.setTopicPosition(topicId, index)),
      startTopicPass: async (topicId, startedAt) => setData(await store.startTopicPass(topicId, startedAt)),
      startMarathonPass: async (category, startedAt) => setData(await store.startMarathonPass(category, startedAt)),
      saveExam: async (attempt, correct) => setData(await store.saveExam(attempt, correct)),
      resetTopic: async (topicId, ids) => setData(await store.resetTopic(topicId, ids)),
      updateSettings: async (patch) => setData(await store.updateSettings(patch)),
    };
  }, [data, store]);

  if (!value) return <StatusScreen kind="loading" title="Завантажуємо прогрес…" />;
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside ProgressProvider');
  return ctx;
}
