import { useLocation } from 'react-router-dom';
import { Explanation } from '../../components/Explanation';
import { Options, judgedOptions } from '../../components/Options';
import { QuestionImages } from '../../components/QuestionImages';
import { TopBar } from '../../components/TopBar';
import { useAllQuestions } from '../../data/QuestionsProvider';
import { unseenLine } from '../../logic/exam';
import { AttemptNotFound, attemptMisses, useAttempt } from './ExamResultScreen';

const LABELS = {
  chosenRight: 'Твоя відповідь: правильно',
  chosenWrong: 'Твоя відповідь',
  correct: 'Правильна відповідь',
};

/** Every wrongly answered (or on-screen unanswered) question of an attempt, in full. */
export function ExamReviewScreen() {
  const attempt = useAttempt();
  const { byId } = useAllQuestions(); // the attempt may be from another category
  const fromHistory = (useLocation().state as { from?: string } | null)?.from === 'history';
  if (!attempt) return <AttemptNotFound />;

  const total = attempt.questionIds.length;
  const { misses: items, unseen } = attemptMisses(attempt, byId);

  return (
    <div className="screen">
      <TopBar
        backTo={`/history/${attempt.id}`}
        backLabel="До результату"
        backState={fromHistory ? { from: 'history' } : undefined}
        title="Розбір помилок"
      />
      <main className="page review">
        {items.length === 0 && <p className="placeholder-text">У цій спробі немає помилок.</p>}
        <ol className="review-list">
          {items.map(({ id, i, choice, ref }) => {
            const qid = `rq-${i}`;
            if (!ref) {
              return (
                <li key={id} className="review-card">
                  <span className="chip">Питання {i + 1} з {total}</span>
                  <p className="placeholder-text">Цього питання вже немає в базі.</p>
                </li>
              );
            }
            const q = ref.question;
            return (
              <li key={id} className="review-card">
                <div className="qmeta">
                  <span className="chip">
                    Питання {i + 1} з {total} · Тема {ref.topic.id}
                  </span>
                  {choice === null && <span className="mtag">Без відповіді</span>}
                </div>
                <p className="qtext" id={qid}>
                  {q.text}
                </p>
                <QuestionImages images={q.images} captions={q.imageCaptions} />
                <Options labelledBy={qid} options={judgedOptions(q.options, q.correct, choice, LABELS)} />
                <Explanation explanation={q.explanation} />
              </li>
            );
          })}
        </ol>
        {unseen > 0 && <p className="unseen-note">{unseenLine(unseen)}</p>}
      </main>
    </div>
  );
}
