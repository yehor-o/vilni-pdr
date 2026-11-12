import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { Icon } from '../components/Icon';
import { Options, judgedOptions } from '../components/Options';
import { QuestionImages } from '../components/QuestionImages';
import { SegmentBar, type SegmentState } from '../components/SegmentBar';
import { TopBar } from '../components/TopBar';
import { useAnswerKeys } from '../components/useAnswerKeys';
import { useRevealCorrect } from '../components/useRevealCorrect';
import { useQuestions } from '../data/QuestionsProvider';
import { topicTitle } from '../data/topicTitles';
import type { Question, Topic } from '../data/types';
import { newPassStart, planShuffledPass } from '../logic/practiceOrder';
import { shuffle } from '../logic/random';
import { practiceStartIndex, topicStats, useProgress, type PracticeOrder, type ProgressData } from '../storage';

/** Topics up to this size get one progress segment per question; longer ones a continuous bar. */
const MAX_SEGMENTS = 30;

export const OPTION_LABELS = {
  chosenRight: 'Твій вибір: правильно',
  chosenWrong: 'Твій вибір: неправильно',
  correct: 'Правильна відповідь',
};

export function PracticeScreen() {
  const { id = '' } = useParams();
  const bank = useQuestions();
  const topic = bank.topics.find((t) => t.id === id);

  if (!topic || topic.questions.length === 0) {
    return (
      <div className="screen">
        <TopBar backTo="/topics" backLabel="До тем" title="Тему не знайдено" />
        <main className="page placeholder">
          <p className="placeholder-text">Такої теми немає.</p>
          <Link to="/topics" className="cbtn blue">
            До тем
          </Link>
        </main>
      </div>
    );
  }
  // Remount on topic change so the pass state starts fresh.
  return <Practice key={topic.id} topic={topic} />;
}

interface Plan {
  order: PracticeOrder;
  /** Question ids still to show in this pass, in display order. */
  queue: string[];
  /** Questions of the pass already done before `queue` starts. */
  doneBefore: number;
  /** Shuffled order: a new pass began and its start must be persisted. */
  newPassStart?: number;
}

type PlanData = Pick<ProgressData, 'answers' | 'topicPositions' | 'topicPassStarts'>;

/** fresh = start a new pass from scratch («Ще раз»). */
function buildPlan(topicId: string, ids: string[], order: PracticeOrder, data: PlanData, fresh: boolean): Plan {
  if (order === 'official') {
    const start = fresh ? 0 : practiceStartIndex(topicId, ids, data);
    return { order, queue: ids.slice(start), doneBefore: start };
  }
  const now = Date.now();
  if (fresh) {
    return { order, queue: shuffle(ids), doneBefore: 0, newPassStart: newPassStart(ids, data.answers, now) };
  }
  const p = planShuffledPass(ids, data.answers, data.topicPassStarts[topicId] ?? 0, now);
  return { order, queue: p.queue, doneBefore: p.doneBefore, newPassStart: p.isNewPass ? p.passStart : undefined };
}

function Practice({ topic }: { topic: Topic }) {
  const { data, recordAnswer, setTopicPosition, startTopicPass, resetTopic } = useProgress();
  const [ids] = useState(() => topic.questions.map((q) => q.id));
  const [byId] = useState(() => new Map<string, Question>(topic.questions.map((q) => [q.id, q])));
  const total = ids.length;

  const [plan, setPlan] = useState<Plan>(() =>
    buildPlan(topic.id, ids, data.settings.practiceOrder, data, false),
  );
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [pass, setPass] = useState({ answered: 0, correct: 0 });
  const [finished, setFinished] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const question = byId.get(plan.queue[step]!)!;
  const absIndex = plan.doneBefore + step; // position within the pass
  const answered = choice !== null;
  const isCorrect = choice === question.correct;
  const title = topicTitle(topic.id, topic.title);
  const shuffled = plan.order === 'shuffled';

  const nextRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLParagraphElement>(null);
  const firstRender = useRef(true);

  // Persist the start of a new shuffled pass.
  useEffect(() => {
    if (plan.newPassStart !== undefined) void startTopicPass(topic.id, plan.newPassStart);
  }, [plan, topic.id, startTopicPass]);

  // New question: back to top, focus the question text (not on first load).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    qRef.current?.focus({ preventScroll: true });
  }, [step, plan]);

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered]);

  const choose = (i: number) => {
    if (choice !== null || i < 0 || i >= question.options.length) return;
    const correct = i === question.correct;
    setChoice(i);
    setPass((p) => ({ answered: p.answered + 1, correct: p.correct + (correct ? 1 : 0) }));
    void recordAnswer({ questionId: question.id, choice: i, correct });
  };

  const next = () => {
    if (choice === null) return;
    setChoice(null);
    if (step + 1 >= plan.queue.length) {
      setFinished(true);
      if (!shuffled) void setTopicPosition(topic.id, 0);
    } else {
      setStep(step + 1);
      if (!shuffled) void setTopicPosition(topic.id, absIndex + 1);
    }
  };

  const startOver = (p: Plan) => {
    setPlan(p);
    setStep(0);
    setChoice(null);
    setPass({ answered: 0, correct: 0 });
    setFinished(false);
    if (p.order === 'official') void setTopicPosition(topic.id, 0);
  };

  useAnswerKeys(!finished, { onDigit: choose, onEnter: next });
  useRevealCorrect(answered && !finished);

  if (finished) {
    const stats = topicStats(ids, data);
    const wrong = pass.answered - pass.correct;
    return (
      <div className="screen">
        <TopBar backTo="/topics" backLabel="До тем" backIcon="x" />
        <main className="page summary">
          <h1 className="summary-big">Тему пройдено!</h1>
          <p className="lead">
            Тема {topic.id}. {title}
          </p>
          <div className="tiles">
            <div className="tile g">
              <small>Вірно</small>
              <b>
                {pass.correct} з {pass.answered}
              </b>
            </div>
            <div className="tile r">
              <small>Помилки</small>
              <b>{wrong}</b>
            </div>
            <div className="tile b">
              <small>Тема</small>
              <b>{Math.round(stats.lastCorrectShare * 100)}%</b>
            </div>
          </div>
          <p className="summary-note">«Тема» — частка питань теми, на які ти востаннє відповів правильно.</p>
          <div className="stack">
            <button
              type="button"
              className="cbtn blue"
              onClick={() => startOver(buildPlan(topic.id, ids, data.settings.practiceOrder, data, true))}
            >
              <Icon name="redo" />
              Ще раз
            </button>
            <Link to="/topics" className="cbtn white">
              До тем
            </Link>
            <button type="button" className="linkbtn" onClick={() => setConfirmReset(true)}>
              Скинути прогрес теми
            </button>
          </div>
        </main>
        <ConfirmDialog
          open={confirmReset}
          title="Скинути прогрес теми?"
          text={`Усі відповіді в темі «${title}» буде видалено. Це не можна скасувати.`}
          confirmLabel="Скинути"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            void resetTopic(topic.id, ids);
            const empty: PlanData = { answers: {}, topicPositions: {}, topicPassStarts: {} };
            startOver(buildPlan(topic.id, ids, data.settings.practiceOrder, empty, false));
          }}
        />
      </div>
    );
  }

  const position = absIndex + 1;
  const done = absIndex + (answered ? 1 : 0);

  let progress;
  if (!shuffled && total <= MAX_SEGMENTS) {
    const segments: SegmentState[] = ids.map((id, i) => {
      const shown = i < absIndex || (i === absIndex && answered);
      const rec = shown ? data.answers[id] : undefined;
      return rec ? (rec.lastCorrect ? 'ok' : 'no') : i === absIndex ? 'cur' : '';
    });
    progress = <SegmentBar segments={segments} label="Прогрес у темі" value={done} />;
  } else {
    progress = (
      <div
        className="segbar-long"
        role="progressbar"
        aria-label="Прогрес у темі"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <i style={{ width: `${(done / total) * 100}%` }} />
      </div>
    );
  }

  return (
    <div className="screen practice">
      <TopBar backTo="/topics" backLabel="Вийти до тем" backIcon="x">
        {progress}
        <span className="pos" aria-label={`Питання ${position} з ${total}`}>
          {position} з {total}
        </span>
      </TopBar>

      <main className="page qbody">
        <div className="qmeta">
          <span className="chip">
            Тема {topic.id} · Питання {question.n}
          </span>
          <span className="order-note">
            <Icon name={shuffled ? 'shuffle' : 'list'} />
            {shuffled ? 'Перемішано' : 'По порядку'}
          </span>
        </div>
        <p className="qtext" id="qtext" ref={qRef} tabIndex={-1}>
          {question.text}
        </p>
        <QuestionImages key={question.id} images={question.images} captions={question.imageCaptions} />
        <Options
          labelledBy="qtext"
          locked={answered}
          onChoose={choose}
          options={
            answered
              ? judgedOptions(question.options, question.correct, choice, OPTION_LABELS)
              : question.options.map((text) => ({ text, mark: 'none' }))
          }
        />
        {!answered && <p className="kbd-hint">Клавіші 1–{question.options.length} — вибір, Enter — далі</p>}
      </main>

      <div className="sheet-slot" aria-live="polite">
        {answered && (
          <FeedbackSheet
            ref={nextRef}
            kind={isCorrect ? 'ok' : 'bad'}
            title={isCorrect ? 'Правильно!' : 'Не зовсім так'}
            text={isCorrect ? undefined : `Правильна відповідь: «${question.options[question.correct]}»`}
            buttonLabel={step + 1 >= plan.queue.length ? 'Завершити' : 'Далі'}
            onNext={next}
          />
        )}
      </div>
    </div>
  );
}
