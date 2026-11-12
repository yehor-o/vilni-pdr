import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { categoryBank } from './categories';
import { loadQuestions } from './loadQuestions';
import type { CategoryInfo, Question, QuestionBank, QuestionData, Topic } from './types';
import { StatusScreen } from '../components/StatusScreen';
import { DEFAULT_CATEGORY, useProgress } from '../storage';

export interface QuestionRef {
  question: Question;
  topic: Topic;
}

export interface QuestionIndex {
  bank: QuestionBank;
  /** Question ids in official order. */
  allIds: string[];
  byId: ReadonlyMap<string, QuestionRef>;
}

interface Ctx {
  data: QuestionData;
  /** Index over every question of every category. */
  full: Pick<QuestionIndex, 'allIds' | 'byId'>;
  /** Index per category id. */
  categories: ReadonlyMap<string, QuestionIndex>;
}

const QuestionsContext = createContext<Ctx | null>(null);

function indexBank(bank: QuestionBank): QuestionIndex {
  const byId = new Map<string, QuestionRef>();
  for (const topic of bank.topics) for (const question of topic.questions) byId.set(question.id, { question, topic });
  return { bank, allIds: [...byId.keys()], byId };
}

function indexData(data: QuestionData): Ctx {
  const categories = new Map<string, QuestionIndex>();
  for (const c of data.categories) categories.set(c.id, indexBank(categoryBank(data, c.id)));
  const full = indexBank({ ...categoryBank(data, DEFAULT_CATEGORY), topics: data.topics });
  return { data, full, categories };
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: QuestionData };

/** Loads the question data and renders children only once it is available. */
export function QuestionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadQuestions().then(
      (data) => alive && setState({ status: 'ready', data }),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const ctx = useMemo(() => (state.status === 'ready' ? indexData(state.data) : null), [state]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((a) => a + 1);
  }, []);

  if (state.status === 'loading') return <StatusScreen kind="loading" title="Завантажуємо питання…" />;
  if (state.status === 'error') {
    return (
      <StatusScreen
        kind="error"
        title="Не вдалося завантажити питання"
        text="Перевір підключення до інтернету й спробуй ще раз."
        action={{ label: 'Спробувати ще раз', onClick: retry }}
      />
    );
  }
  return <QuestionsContext.Provider value={ctx}>{children}</QuestionsContext.Provider>;
}

function useCtx(): Ctx {
  const ctx = useContext(QuestionsContext);
  if (!ctx) throw new Error('Questions are used outside QuestionsProvider');
  return ctx;
}

/** Index of the category selected in settings (unknown id falls back to B). Needs ProgressProvider. */
function useCategoryIndex(): QuestionIndex {
  const { categories } = useCtx();
  const { data } = useProgress();
  return categories.get(data.settings.category) ?? categories.get(DEFAULT_CATEGORY) ?? [...categories.values()][0]!;
}

/** The bank of the selected category. */
export function useQuestions(): QuestionBank {
  return useCategoryIndex().bank;
}

/** Lookup by question id plus the list of all ids, within the selected category. */
export function useQuestionIndex(): Pick<QuestionIndex, 'allIds' | 'byId'> {
  return useCategoryIndex();
}

/**
 * Every question of every category. For records that may come from another
 * category (exam history) and for offline caching of all images.
 */
export function useAllQuestions(): { data: QuestionData; categories: readonly CategoryInfo[] } & Pick<
  QuestionIndex,
  'allIds' | 'byId'
> {
  const { data, full } = useCtx();
  return { data, categories: data.categories, ...full };
}
