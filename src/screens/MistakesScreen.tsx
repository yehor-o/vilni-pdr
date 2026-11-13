import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { Icon } from '../components/Icon';
import { Options, judgedOptions } from '../components/Options';
import { QuestionImages } from '../components/QuestionImages';
import { TopBar } from '../components/TopBar';
import { useAnswerKeys } from '../components/useAnswerKeys';
import { useRevealCorrect } from '../components/useRevealCorrect';
import { useQuestionIndex } from '../data/QuestionsProvider';
import { pluralUk } from '../logic/exam';
import { mistakeIds, useProgress } from '../storage';
import { OPTION_LABELS } from './PracticeScreen';

const questionsWord = (n: number) => pluralUk(n, 'питання', 'питання', 'питань');

/**
 * «Робота над помилками»: one round over the questions whose last answer was
 * wrong (from topics and exams alike). A correct answer removes the question
 * from the list; a wrong one keeps it for the next round.
 */
export function MistakesScreen() {
  const { allIds, byId } = useQuestionIndex();
  const { data, recordAnswer } = useProgress();

  // The round is a snapshot: answers given during it do not reshuffle the queue.
  const [queue, setQueue] = useState(() => mistakeIds(allIds, data));
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [fixed, setFixed] = useState(0);
  const [finished, setFinished] = useState(false);

  const nextRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLParagraphElement>(null);
  const firstRender = useRef(true);

  const ref = byId.get(queue[step] ?? '');
  const answered = choice !== null;
  const active = !!ref && !finished;

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
    const correct = i === ref.question.correct;
    setChoice(i);
    if (correct) setFixed((n) => n + 1);
    void recordAnswer({ questionId: ref.question.id, choice: i, correct });
  };

  const next = () => {
    if (choice === null) return;
    setChoice(null);
    if (step + 1 >= queue.length) setFinished(true);
    else setStep(step + 1);
  };

  const again = () => {
    setQueue(mistakeIds(allIds, data));
    setStep(0);
    setChoice(null);
    setFixed(0);
    setFinished(false);
  };

  useAnswerKeys(active, { onDigit: choose, onEnter: next });
  useRevealCorrect(answered && active);

  if (!ref && !finished) {
    return (
      <div className="screen">
        <TopBar backTo="/" backLabel="На головну" title="Робота над помилками" />
        <main className="page placeholder">
          <p className="placeholder-text">
            Помилок немає. Сюди потраплять питання з тем та іспитів, на які ти востаннє відповів неправильно.
          </p>
          <Link to="/" className="cbtn blue">
            На головну
          </Link>
        </main>
      </div>
    );
  }

  if (finished) {
    const left = mistakeIds(allIds, data).length;
    return (
      <div className="screen">
        <TopBar backTo="/" backLabel="На головну" backIcon="x" />
        <main className="page summary">
          <h1 className="summary-big">{left === 0 ? 'Усі помилки виправлено!' : 'Коло пройдено'}</h1>
          <p className="lead">
            {left === 0
              ? 'Питань із неправильною останньою відповіддю не лишилося.'
              : 'Питання з правильною відповіддю зникли зі списку, решта чекає на наступне коло.'}
          </p>
          <div className="tiles">
            <div className="tile g">
              <small>Виправлено</small>
              <b>
                {fixed} з {queue.length}
              </b>
            </div>
            <div className="tile r">
              <small>Лишилося</small>
              <b>{left}</b>
            </div>
          </div>
          <div className="stack">
            {left > 0 && (
              <button type="button" className="cbtn blue" onClick={again}>
                <Icon name="redo" />
                Ще коло: {left} {questionsWord(left)}
              </button>
            )}
            <Link to="/" className={`cbtn ${left > 0 ? 'white' : 'blue'}`}>
              На головну
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { question, topic } = ref!;
  const isCorrect = choice === question.correct;
  const done = step + (answered ? 1 : 0);

  return (
    <div className="screen practice">
      <TopBar backTo="/" backLabel="Вийти на головну" backIcon="x">
        <div
          className="segbar-long"
          role="progressbar"
          aria-label="Прогрес у колі"
          aria-valuemin={0}
          aria-valuemax={queue.length}
          aria-valuenow={done}
        >
          <i style={{ width: `${(done / queue.length) * 100}%` }} />
        </div>
        <span className="pos" aria-label={`Питання ${step + 1} з ${queue.length}`}>
          {step + 1} з {queue.length}
        </span>
      </TopBar>

      <main className="page qbody">
        <div className="qmeta">
          <span className="chip">
            Тема {topic.id} · Питання {question.n}
          </span>
          <span className="order-note">
            <Icon name="redo" />
            Помилки
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
            buttonLabel={step + 1 >= queue.length ? 'Завершити' : 'Далі'}
            explanation={question.explanation}
            onNext={next}
          />
        )}
      </div>
    </div>
  );
}
