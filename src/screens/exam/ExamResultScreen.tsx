import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { TopBar } from '../../components/TopBar';
import { useQuestionIndex, type QuestionRef } from '../../data/QuestionsProvider';
import { EXAM_MAX_MISTAKES, formatDuration, reviewSelection, unseenLine } from '../../logic/exam';
import { useProgress, type ExamAttempt } from '../../storage';
import { requestExamStart } from './examLaunch';
import { formatDateTime } from './format';

export function useAttempt(): ExamAttempt | undefined {
  const { id } = useParams();
  const { data } = useProgress();
  return data.exams.find((e) => e.id === id);
}

/** Questions to list for an attempt: answered wrongly or on screen unanswered; never the unseen ones. */
export function attemptMisses(attempt: ExamAttempt, byId: ReadonlyMap<string, QuestionRef>) {
  const refs = attempt.questionIds.map((id) => byId.get(id));
  const sel = reviewSelection(attempt, (i) => refs[i]?.question.correct);
  return {
    misses: sel.items.map(({ index, choice }) => ({ id: attempt.questionIds[index]!, i: index, choice, ref: refs[index] })),
    unseen: sel.unseen,
  };
}

export function AttemptNotFound() {
  return (
    <div className="screen">
      <TopBar backTo="/history" backLabel="До історії" title="Спробу не знайдено" />
      <main className="page placeholder">
        <p className="placeholder-text">Такої спроби немає в історії.</p>
        <Link to="/history" className="cbtn blue">
          Історія іспитів
        </Link>
      </main>
    </div>
  );
}

function leadText(a: ExamAttempt, wrong: number): string {
  if (a.passed) {
    return a.mistakes === 0
      ? 'Жодної помилки. Так тримати!'
      : `Чудова робота! Помилок: ${a.mistakes}, допустимо до ${EXAM_MAX_MISTAKES}.`;
  }
  if (a.endReason === 'mistakes') return 'Третя помилка завершила іспит. Переглянь розбір і спробуй ще раз.';
  if (a.endReason === 'timeout') return 'Час вийшов. Наступного разу вийде краще.';
  return `Помилок: ${wrong}, а можна не більше ${EXAM_MAX_MISTAKES}. Розбір покаже, що підтягнути.`;
}

export function ExamResultScreen() {
  const attempt = useAttempt();
  const { byId } = useQuestionIndex();
  const navigate = useNavigate();
  const fromHistory = (useLocation().state as { from?: string } | null)?.from === 'history';
  if (!attempt) return <AttemptNotFound />;

  const total = attempt.questionIds.length;
  const { misses, unseen } = attemptMisses(attempt, byId);
  const wrong = misses.filter((m) => m.choice !== null).length;

  const again = () => {
    requestExamStart();
    navigate('/exam/run');
  };

  return (
    <div className="screen">
      <TopBar
        backTo={fromHistory ? '/history' : '/'}
        backLabel={fromHistory ? 'До історії' : 'На головну'}
        backIcon="x"
      />
      <main className="page result">
        <div className={`hero ${attempt.passed ? 'pass' : 'fail'}`}>
          {attempt.passed ? <Medal /> : <FailBadge />}
          <h1 className="summary-big">{attempt.passed ? 'Іспит складено' : 'Іспит не складено'}</h1>
          <p className="lead">{leadText(attempt, wrong)}</p>
        </div>

        <div className="tiles">
          <div className="tile g">
            <small>Вірно</small>
            <b>
              {attempt.correctCount} з {total}
            </b>
          </div>
          <div className="tile b">
            <small>Час</small>
            <b>{formatDuration(attempt.durationSec)}</b>
          </div>
          <div className="tile r">
            <small>Помилки</small>
            <b>{wrong}</b>
          </div>
        </div>
        <p className="summary-note">
          {formatDateTime(attempt.finishedAt)} · {attempt.instantFeedback ? 'правильність одразу' : 'правильність у кінці'}
        </p>

        {misses.length > 0 && (
          <section className="misses" aria-labelledby="misses-title">
            <h2 className="sec" id="misses-title">
              Над чим попрацювати
            </h2>
            <ul className="mlist">
              {misses.map((m) => (
                <li key={m.id}>
                  <span className="n" aria-label={`Питання ${m.i + 1}`}>
                    {m.i + 1}
                  </span>
                  <span>
                    <span className="clamp2">{m.ref?.question.text ?? 'Питання немає в базі'}</span>
                    {m.choice === null && <span className="mtag">Без відповіді</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {unseen > 0 && <p className="unseen-note">{unseenLine(unseen)}</p>}

        <div className="stack wide">
          {misses.length > 0 && (
            <Link to={`/history/${attempt.id}/review`} state={{ from: fromHistory ? 'history' : undefined }} className="cbtn blue">
              Розбір помилок
            </Link>
          )}
          <button type="button" className={`cbtn ${misses.length > 0 ? 'white' : 'blue'}`} onClick={again}>
            <Icon name="redo" />
            Ще раз
          </button>
          <Link to="/" className="cbtn white">
            На головну
          </Link>
        </div>
      </main>
    </div>
  );
}

function Medal() {
  return (
    <div className="celebrate" aria-hidden="true">
      <svg className="confetti" viewBox="0 0 350 150" preserveAspectRatio="none">
        <rect x="30" y="20" width="12" height="6" rx="2" fill="#1E66D6" transform="rotate(-25 36 23)" />
        <rect x="70" y="70" width="10" height="5" rx="2" fill="#FFC53D" transform="rotate(30 75 72)" />
        <circle cx="48" cy="110" r="4" fill="#22A355" />
        <rect x="95" y="16" width="9" height="9" rx="2" fill="#FF7A59" transform="rotate(20 99 20)" />
        <circle cx="262" cy="22" r="4.5" fill="#1E66D6" />
        <rect x="280" y="70" width="12" height="6" rx="2" fill="#22A355" transform="rotate(-35 286 73)" />
        <rect x="245" y="105" width="10" height="5" rx="2" fill="#FF7A59" transform="rotate(15 250 107)" />
        <rect x="310" y="30" width="9" height="9" rx="2" fill="#FFC53D" transform="rotate(-15 314 34)" />
        <circle cx="20" cy="62" r="3.5" fill="#C92A24" />
        <circle cx="330" cy="118" r="3.5" fill="#C92A24" />
      </svg>
      <svg className="medal" viewBox="0 0 120 124">
        <path d="M38 78l-12 40 18-7 10 13 10-34z" fill="#1E66D6" />
        <path d="M82 78l12 40-18-7-10 13-10-34z" fill="#C92A24" />
        <circle cx="60" cy="54" r="46" fill="#E0A21C" />
        <circle cx="60" cy="50" r="46" fill="#FFC53D" />
        <circle cx="60" cy="50" r="34" fill="#FFE08A" />
        <path
          d="M60 28l6.6 13.4 14.8 2.2-10.7 10.4 2.5 14.7L60 61.8l-13.2 6.9 2.5-14.7-10.7-10.4 14.8-2.2z"
          fill="#E0A21C"
        />
      </svg>
    </div>
  );
}

function FailBadge() {
  return (
    <span className="fail-badge" aria-hidden="true">
      <Icon name="x" />
    </span>
  );
}
