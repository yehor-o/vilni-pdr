import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { Icon } from '../components/Icon';
import { Options, judgedOptions } from '../components/Options';
import { QuestionImages } from '../components/QuestionImages';
import { TopBar } from '../components/TopBar';
import { useAnswerKeys } from '../components/useAnswerKeys';
import { useRevealCorrect } from '../components/useRevealCorrect';
import { useQuestionIndex, useQuestions } from '../data/QuestionsProvider';
import { pluralUk } from '../logic/exam';
import { planShuffledPass, remainingInPass } from '../logic/practiceOrder';
import { useProgress } from '../storage';
import { OPTION_LABELS } from './PracticeScreen';

const questionsWord = (n: number) => pluralUk(n, 'питання', 'питання', 'питань');

/**
 * «Марафон»: the whole question base of the selected category in random order,
 * no timer, instant check.
 *
 * A lap is identified by its start time (`marathonPassStarts[category]`, absent
 * = 0 = first lap); each category has its own lap.
 * A question is done in the lap when it was answered anywhere (topics, exams,
 * marathon) since the lap started, so the first lap shows only questions that
 * were never answered. Only the lap start is stored: a reload reshuffles what
 * is left but never repeats a question already done in the lap.
 */
export function MarathonScreen() {
  const { allIds, byId } = useQuestionIndex();
  const { category, categoryTitle } = useQuestions();
  const { data, recordAnswer, startMarathonPass } = useProgress();
  const passStart = data.marathonPassStarts[category] ?? 0;

  // The queue is a snapshot: answers given during the session do not reshuffle it.
  // An empty queue means the lap is complete (a new one starts by button).
  const [queue, setQueue] = useState(() => {
    const left = remainingInPass(allIds, data.answers, passStart);
    return left.length > 0 ? planShuffledPass(allIds, data.answers, passStart, Date.now()).queue : [];
  });
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);

  const nextRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLParagraphElement>(null);
  const firstRender = useRef(true);

  const total = allIds.length;
  const done = useMemo(
    () => total - remainingInPass(allIds, data.answers, passStart).length,
    [allIds, total, data, passStart],
  );

  const ref = byId.get(queue[step] ?? '');
  const answered = choice !== null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    qRef.current?.focus({ preventScroll: true });
  }, [step, queue]);

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered]);

  const choose = (i: number) => {
    if (!ref || choice !== null || i < 0 || i >= ref.question.options.length) return;
    setChoice(i);
    void recordAnswer({ questionId: ref.question.id, choice: i, correct: i === ref.question.correct });
  };

  const next = () => {
    if (choice === null) return;
    setChoice(null);
    setStep(step + 1);
  };

  const startLap = () => {
    const plan = planShuffledPass(allIds, data.answers, passStart, Date.now());
    if (plan.isNewPass) void startMarathonPass(category, plan.passStart);
    setQueue(plan.queue);
    setStep(0);
    setChoice(null);
  };

  useAnswerKeys(!!ref, { onDigit: choose, onEnter: next });
  useRevealCorrect(answered && !!ref);

  if (!ref) {
    const left = total - done;
    return (
      <div className="screen">
        <TopBar backTo="/" backLabel="На головну" backIcon="x" />
        <main className="page summary">
          <h1 className="summary-big">{left === 0 ? 'Коло пройдено!' : 'Марафон'}</h1>
          <p className="lead">
            {left === 0
              ? `Ти відповів на всі ${total} ${questionsWord(total)} бази категорії ${categoryTitle}. У новому колі всі питання знову йдуть впереміш.`
              : `Пройдено ${done} з ${total}, у цьому колі лишилося ${left} ${questionsWord(left)}.`}
          </p>
          <div className="stack">
            <button type="button" className="cbtn blue" onClick={startLap}>
              <Icon name="shuffle" />
              {left === 0 ? 'Нове коло' : 'Продовжити'}
            </button>
            <Link to="/" className="cbtn white">
              На головну
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { question, topic } = ref;
  const isCorrect = choice === question.correct;

  return (
    <div className="screen practice">
      <TopBar backTo="/" backLabel="Вийти на головну" backIcon="x">
        <div
          className="segbar-long"
          role="progressbar"
          aria-label="Пройдено в колі"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <i style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="pos" aria-label={`Пройдено ${done} з ${total}`}>
          {done} з {total}
        </span>
      </TopBar>

      <main className="page qbody">
        <div className="qmeta">
          <span className="chip">
            Тема {topic.id} · Питання {question.n}
          </span>
          <span className="order-note">
            <Icon name="shuffle" />
            Марафон
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
            buttonLabel="Далі"
            onNext={next}
          />
        )}
      </div>
    </div>
  );
}
