import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { useQuestions } from '../data/QuestionsProvider';
import { topicTitle } from '../data/topicTitles';
import type { Topic } from '../data/types';
import { topicStats, useProgress } from '../storage';

export function TopicsScreen() {
  const bank = useQuestions();
  const { data, resetTopic, updateSettings } = useProgress();
  const order = data.settings.practiceOrder;
  const [toReset, setToReset] = useState<Topic | null>(null);

  return (
    <div className="screen">
      <TopBar backTo="/" backLabel="На головну" title="Теми" />
      <main className="page topics">
        <div className="order-row">
          <span className="order-label" id="order-label">
            Порядок питань
          </span>
          <div className="segctl" role="group" aria-labelledby="order-label">
            <button
              type="button"
              aria-pressed={order === 'official'}
              onClick={() => void updateSettings({ practiceOrder: 'official' })}
            >
              <Icon name="list" />
              По порядку
            </button>
            <button
              type="button"
              aria-pressed={order === 'shuffled'}
              onClick={() => void updateSettings({ practiceOrder: 'shuffled' })}
            >
              <Icon name="shuffle" />
              Перемішати
            </button>
          </div>
        </div>
        <p className="topics-hint">
          {order === 'shuffled'
            ? 'Питання кожної теми йдуть у випадковому порядку, без повторів до кінця проходу.'
            : 'Питання йдуть в офіційному порядку.'}{' '}
          Прогрес — частка питань теми, на які ти востаннє відповів правильно.
        </p>
        <ol className="topic-list">
          {bank.topics.map((t) => {
            const s = topicStats(
              t.questions.map((q) => q.id),
              data,
            );
            const pct = Math.round(s.lastCorrectShare * 100);
            const title = topicTitle(t.id, t.title);
            return (
              <li key={t.id} className="topic-card">
                <Link to={`/topics/${t.id}`} className="topic-link">
                  <span className="topic-num" aria-hidden="true">
                    {t.id}
                  </span>
                  <span className="topic-body">
                    <span className="topic-title">
                      <span className="sr-only">Тема {t.id}. </span>
                      {title}
                    </span>
                    <span className="topic-meta">
                      Пройдено {s.answered} з {s.total} {s.total % 10 === 1 && s.total % 100 !== 11 ? 'питання' : 'питань'}
                    </span>
                    <span className="topic-progress">
                      <span className="bar bar-sm" aria-hidden="true">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="topic-pct">
                        <span className="sr-only">Правильно востаннє: </span>
                        {pct}%
                      </span>
                    </span>
                  </span>
                </Link>
                {s.answered > 0 && (
                  <button
                    type="button"
                    className="iconbtn topic-reset"
                    onClick={() => setToReset(t)}
                    aria-label={`Скинути прогрес теми ${t.id}`}
                    title="Скинути прогрес"
                  >
                    <Icon name="redo" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </main>

      <ConfirmDialog
        open={toReset !== null}
        title="Скинути прогрес теми?"
        text={
          toReset
            ? `Усі відповіді в темі «${topicTitle(toReset.id, toReset.title)}» буде видалено. Це не можна скасувати.`
            : ''
        }
        confirmLabel="Скинути"
        onCancel={() => setToReset(null)}
        onConfirm={() => {
          if (toReset) void resetTopic(toReset.id, toReset.questions.map((q) => q.id));
          setToReset(null);
        }}
      />
    </div>
  );
}
