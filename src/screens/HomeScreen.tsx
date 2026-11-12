import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useQuestionIndex, useQuestions } from '../data/QuestionsProvider';
import { mistakeIds, useProgress } from '../storage';
import { formatDuration, pluralUk } from '../logic/exam';
import { OfflineStatusLine } from '../pwa/PwaUi';

const SUPPORT_URL = 'https://send.monobank.ua/jar/76ArKfTjMj';

export function HomeScreen() {
  const bank = useQuestions();
  const { data } = useProgress();

  const { total, answered } = useMemo(() => {
    let total = 0;
    let answered = 0;
    for (const t of bank.topics) {
      for (const q of t.questions) {
        total += 1;
        if (data.answers[q.id]) answered += 1;
      }
    }
    return { total, answered };
  }, [bank, data]);

  const { allIds } = useQuestionIndex();
  const mistakes = useMemo(() => mistakeIds(allIds, data).length, [allIds, data]);

  const pct = total ? Math.round((answered / total) * 100) : 0;
  const exams = data.exams;
  const passedCount = exams.filter((e) => e.passed).length;
  const last = exams.at(-1);

  return (
    <main className="page home">
      <header className="home-head">
        <h1 className="home-title">Тренажер ПДР</h1>
        <p className="home-sub">
          <span className="chip">Категорія {bank.category}</span>
          <span>Офіційні питання: {bank.order}</span>
        </p>
      </header>

      <section className="summary-card" aria-labelledby="overall">
        <h2 id="overall" className="summary-title">
          Твій прогрес
        </h2>
        <p className="summary-line">
          Відповіді на <b>{answered}</b> з <b>{total}</b> питань
        </p>
        <div
          className="bar"
          role="progressbar"
          aria-label="Питання з відповіддю"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          aria-valuetext={`${pct}%`}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
      </section>

      <nav className="entry-list" aria-label="Режими">
        <Link to="/exam" className="entry entry-exam">
          <span className="entry-icon" aria-hidden="true">
            <Icon name="clock" />
          </span>
          <span className="entry-body">
            <span className="entry-title">Іспит</span>
            <span className="entry-meta">20 питань · 20 хвилин · до 2 помилок</span>
            {last && (
              <span className="entry-stats">
                Спроб: {exams.length} · складено: {passedCount} · остання:{' '}
                {last.passed ? 'складено' : 'не складено'}, {last.correctCount} з {last.questionIds.length},{' '}
                {formatDuration(last.durationSec)}
              </span>
            )}
          </span>
          <Icon name="chev" className="entry-chev" />
        </Link>
        <Link to="/topics" className="entry entry-topics">
          <span className="entry-icon" aria-hidden="true">
            <Icon name="list" />
          </span>
          <span className="entry-body">
            <span className="entry-title">Теми</span>
            <span className="entry-meta">{bank.topics.length} тем · тренування з миттєвою перевіркою</span>
          </span>
          <Icon name="chev" className="entry-chev" />
        </Link>
        <Link to="/mistakes" className="entry entry-mistakes">
          <span className="entry-icon" aria-hidden="true">
            <Icon name="redo" />
          </span>
          <span className="entry-body">
            <span className="entry-title">Робота над помилками</span>
            <span className="entry-meta">
              {mistakes > 0
                ? `${mistakes} ${pluralUk(mistakes, 'питання', 'питання', 'питань')}, де остання відповідь неправильна`
                : 'Тут зʼявляться питання, на які ти відповів неправильно'}
            </span>
          </span>
          <Icon name="chev" className="entry-chev" />
        </Link>
      </nav>
      <Link to="/history" className="history-link">
        <Icon name="history" />
        Історія іспитів
      </Link>
      <OfflineStatusLine />
      <footer className="support">
        <p>
          Відкритий проєкт без реклами, підписок і платних функцій. Якщо тренажер допоміг, можеш подякувати авторові.
          Це добровільно: усе працює й без цього.
        </p>
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          Підтримати автора
        </a>
      </footer>
    </main>
  );
}
