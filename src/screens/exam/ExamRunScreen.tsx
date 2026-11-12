import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useBlocker, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FeedbackSheet } from '../../components/FeedbackSheet';
import { Icon } from '../../components/Icon';
import { Options, judgedOptions, type OptionView } from '../../components/Options';
import { QuestionImages } from '../../components/QuestionImages';
import { SegmentBar, type SegmentState } from '../../components/SegmentBar';
import { useAnswerKeys } from '../../components/useAnswerKeys';
import { useRevealCorrect } from '../../components/useRevealCorrect';
import { useQuestionIndex, type QuestionRef } from '../../data/QuestionsProvider';
import {
  EXAM_MAX_MISTAKES,
  buildAttempt,
  endsOnMistakes,
  formatClock,
  newAttemptId,
  remainingMs,
  sampleExamQuestions,
  type ExamEndReason,
} from '../../logic/exam';
import { useProgress } from '../../storage';
import { clearExamStart, peekExamStart } from './examLaunch';

const WARN_MS = 2 * 60 * 1000;

const LABELS = {
  chosenRight: 'Твій вибір: правильно',
  chosenWrong: 'Твій вибір: неправильно',
  correct: 'Правильна відповідь',
};

interface Run {
  id: string;
  refs: QuestionRef[];
  startedAt: number;
  durationSec: number;
  instant: boolean;
}

export function ExamRunScreen() {
  const { allIds, byId } = useQuestionIndex();
  const { data } = useProgress();
  const [run] = useState<Run | null>(() => {
    const req = peekExamStart();
    if (!req) return null;
    const now = Date.now();
    return {
      id: newAttemptId(now),
      refs: sampleExamQuestions(allIds).map((id) => byId.get(id)!),
      startedAt: now,
      durationSec: req.durationSec,
      instant: data.settings.examInstantFeedback,
    };
  });

  useEffect(() => clearExamStart(), []);

  if (!run) return <Navigate to="/exam" replace />;
  return <ExamRun run={run} />;
}

function ExamRun({ run }: { run: Run }) {
  const { saveExam } = useProgress();
  const navigate = useNavigate();
  const total = run.refs.length;
  const correct = run.refs.map((r) => r.question.correct);

  const [answers, setAnswers] = useState<(number | null)[]>(() => Array<number | null>(total).fill(null));
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  stepRef.current = step;
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(false);

  const { question } = run.refs[step]!;
  const choice = answers[step] ?? null;
  const answered = choice !== null;
  const isCorrect = choice === question.correct;
  const wrong = answers.filter((a, i) => a !== null && a !== correct[i]).length;
  const endedByMistakes = endsOnMistakes(run.instant, wrong);
  const isLast = step + 1 >= total;
  const left = remainingMs(run.startedAt, run.durationSec, now);

  const nextRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLParagraphElement>(null);
  const firstRender = useRef(true);

  // Leaving mid-exam asks first (close button, browser back, any link).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !done.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const finish = useCallback(
    (reason: ExamEndReason, finalAnswers: (number | null)[]) => {
      if (done.current) return;
      done.current = true;
      const finishedAt = Math.min(Date.now(), run.startedAt + run.durationSec * 1000);
      const attempt = buildAttempt({
        id: run.id,
        questionIds: run.refs.map((r) => r.question.id),
        correct,
        answers: finalAnswers,
        startedAt: run.startedAt,
        finishedAt,
        endReason: reason,
        instantFeedback: run.instant,
        durationLimitSec: run.durationSec,
        seenCount: stepRef.current + 1,
      });
      void saveExam(attempt, correct).then(() => navigate(`/history/${attempt.id}`, { replace: true }));
    },
    [run, correct, saveExam, navigate],
  );

  // Clock: recomputed from the start timestamp, so throttled timers cannot stretch it.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  useEffect(() => {
    if (left === 0) finish('timeout', answers);
  }, [left, answers, finish]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    qRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (run.instant && answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered, run.instant]);

  const choose = (i: number) => {
    if (done.current || i < 0 || i >= question.options.length) return;
    if (run.instant && answered) return; // locked after the first tap
    setAnswers((a) => a.map((v, k) => (k === step ? i : v)));
  };

  const next = () => {
    if (!answered || done.current) return;
    if (endedByMistakes) return finish('mistakes', answers);
    if (isLast) return finish('completed', answers);
    setStep(step + 1);
  };

  useAnswerKeys(true, { onDigit: choose, onEnter: next });
  useRevealCorrect(run.instant && answered);

  let options: OptionView[];
  if (run.instant && answered) options = judgedOptions(question.options, question.correct, choice, LABELS);
  else
    options = question.options.map((text, i) =>
      i === choice ? { text, mark: 'selected', tag: 'Твій вибір' } : { text, mark: 'none' },
    );

  const segments: SegmentState[] = answers.map((a, i) => {
    if (i === step && !(run.instant && answered)) return 'cur';
    if (a === null || i > step) return '';
    if (!run.instant) return 'done';
    return a === correct[i] ? 'ok' : 'no';
  });

  const nextLabel = endedByMistakes ? 'До результату' : isLast ? 'Завершити' : 'Далі';
  const warn = left < WARN_MS;

  return (
    <div className="screen exam-run">
      <header className="topbar">
        <div className="topbar-row">
          <button type="button" className="iconbtn" aria-label="Вийти з іспиту" onClick={() => navigate('/exam')}>
            <Icon name="x" />
          </button>
          <SegmentBar segments={segments} label="Питання іспиту" value={step + (answered ? 1 : 0)} />
          <span className="pos" aria-label={`Питання ${step + 1} з ${total}`}>
            {step + 1} / {total}
          </span>
        </div>
        <div className="pills">
          <span className={`pill time${warn ? ' warn' : ''}`} role="timer" aria-label={`Залишилось ${formatClock(left)}`}>
            <Icon name={warn ? 'alert' : 'clock'} />
            {formatClock(left)}
            {warn && <span className="pill-note">мало часу</span>}
          </span>
          {run.instant && (
            <span className="pill">
              Помилки
              <span className="dots" aria-hidden="true">
                {Array.from({ length: EXAM_MAX_MISTAKES }, (_, i) => (
                  <i key={i} className={i < wrong ? 'used' : ''} />
                ))}
              </span>
              {wrong > EXAM_MAX_MISTAKES ? `${wrong} — іспит завершено` : `${wrong} з ${EXAM_MAX_MISTAKES}`}
            </span>
          )}
        </div>
      </header>

      <main className="page qbody">
        <span className="chip">Питання {step + 1}</span>
        <p className="qtext" id="qtext" ref={qRef} tabIndex={-1}>
          {question.text}
        </p>
        <QuestionImages key={question.id} images={question.images} captions={question.imageCaptions} />
        <Options labelledBy="qtext" locked={run.instant && answered} onChoose={choose} options={options} />
        {!answered && <p className="kbd-hint">Клавіші 1–{question.options.length} — вибір, Enter — далі</p>}
      </main>

      <div className="sheet-slot" aria-live="polite">
        {answered &&
          (run.instant ? (
            <FeedbackSheet
              ref={nextRef}
              kind={isCorrect ? 'ok' : 'bad'}
              title={isCorrect ? 'Правильно!' : 'Не зовсім так'}
              text={
                isCorrect
                  ? undefined
                  : `Правильна відповідь: «${question.options[question.correct]}»` +
                    (endedByMistakes ? ' Це третя помилка, тож іспит завершено.' : '')
              }
              buttonLabel={nextLabel}
              onNext={next}
            />
          ) : (
            <FeedbackSheet ref={nextRef} kind="neutral" buttonLabel={nextLabel} onNext={next} />
          ))}
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Вийти з іспиту?"
        text="Цю спробу не буде збережено."
        confirmLabel="Вийти"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
