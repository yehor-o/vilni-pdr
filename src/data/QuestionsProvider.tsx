import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadQuestions } from './loadQuestions';
import type { Question, QuestionBank, Topic } from './types';
import { StatusScreen } from '../components/StatusScreen';

export interface QuestionRef {
  question: Question;
  topic: Topic;
}

interface Ctx {
  bank: QuestionBank;
  /** All question ids in official order. */
  allIds: string[];
  byId: ReadonlyMap<string, QuestionRef>;
}

const QuestionsContext = createContext<Ctx | null>(null);

function indexBank(bank: QuestionBank): Ctx {
  const byId = new Map<string, QuestionRef>();
  for (const topic of bank.topics) for (const question of topic.questions) byId.set(question.id, { question, topic });
  return { bank, allIds: [...byId.keys()], byId };
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; bank: QuestionBank };

/** Loads the question bank and renders children only once it is available. */
export function QuestionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadQuestions().then(
      (bank) => alive && setState({ status: 'ready', bank }),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const ctx = useMemo(() => (state.status === 'ready' ? indexBank(state.bank) : null), [state]);

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

export function useQuestions(): QuestionBank {
  return useCtx().bank;
}

/** Lookup by question id plus the list of all ids. */
export function useQuestionIndex(): Pick<Ctx, 'allIds' | 'byId'> {
  return useCtx();
}
