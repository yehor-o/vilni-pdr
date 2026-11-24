import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAllQuestions, useQuestionIndex, useQuestions } from '../data/QuestionsProvider';
import { examCategory, isCategoryId, mistakeIds, savedIds, useProgress, type ThemePref } from '../storage';
import { examPools, formatDuration, pluralUk } from '../logic/exam';
import { formatChance, readiness } from '../logic/readiness';
import { remainingInPass } from '../logic/practiceOrder';
import { OfflineStatusLine } from '../pwa/PwaUi';
import { ResumeExamCard } from './exam/ResumeExamCard';

const SUPPORT_URL = 'https://send.monobank.ua/jar/76ArKfTjMj';

const THEMES: { id: ThemePref; title: string }[] = [
  { id: 'system', title: 'Як у системі' },
  { id: 'light', title: 'Світла' },
  { id: 'dark', title: 'Темна' },
];

export function HomeScreen() {
  const bank = useQuestions();
  const { categories } = useAllQuestions();
  const { data, updateSettings } = useProgress();

  const ready = useMemo(() => {
    const titles = new Map(bank.examBlocks.map((b) => [b.id, b.title]));
    const pools = examPools(bank.examBlocks, bank.topics).map((p) => ({ ...p, title: titles.get(p.id) ?? p.id }));
    return readiness(pools, data.answers);
  }, [bank, data.answers]);
  const level = ready.chance >= 0.9 ? 'high' : ready.chance >= 0.5 ? 'mid' : 'low';

  const { allIds } = useQuestionIndex();
  const mistakes = useMemo(() => mistakeIds(allIds, data).length, [allIds, data]);
  const saved = useMemo(() => savedIds(allIds, data).length, [allIds, data]);

  const marathonDone = useMemo(
    () => allIds.length - remainingInPass(allIds, data.answers, data.marathonPassStarts[bank.category] ?? 0).length,
    [allIds, data, bank.category],
  );

  const exams = useMemo(() => data.exams.filter((e) => examCategory(e) === bank.category), [data, bank.category]);
  const passedCount = exams.filter((e) => e.passed).length;
  const last = exams.at(-1);

  return (
    <main className="page home">
      <header className="home-head">
        <h1 className="home-title">Тренажер ПДР</h1>
        <p className="home-sub">Офіційні питання: {bank.order}</p>
      </header>

      <section className="category-pick" aria-labelledby="category-label">
        <h2 id="category-label" className="category-label">
          Категорія
        </h2>
        <div className="segctl category-segctl" role="group" aria-labelledby="category-label">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === bank.category}
              onClick={() => isCategoryId(c.id) && void updateSettings({ category: c.id })}
            >
              {c.title}
            </button>
          ))}
        </div>
      </section>

      <section className="summary-card readiness" aria-labelledby="overall">
        <h2 id="overall" className="summary-title">
          Готовність до іспиту
        </h2>
        <p className={`readiness-chance ${level}`}>
          <b>{formatChance(ready.chance)}</b> шанс скласти іспит зараз
        </p>
        <p className="summary-line">
          Знаєш <b>{ready.known}</b> з <b>{ready.total}</b> питань · відповіді на {ready.answered}
        </p>
        <ul className="readiness-blocks">
          {ready.blocks.map((b) => {
            const share = Math.round(b.share * 100);
            return (
              <li key={b.id}>
                <span className="readiness-block-head">
                  <span>{b.title}</span>
                  <b>{share}%</b>
                </span>
                <div
                  className="bar"
                  role="progressbar"
                  aria-label={`${b.title}: знаєш`}
                  aria-valuemin={0}
                  aria-valuemax={b.total}
                  aria-valuenow={b.known}
                  aria-valuetext={`${share}%, ${b.known} з ${b.total}`}
                >
                  <i style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="readiness-tip">
          {ready.answered === 0 ? (
            'Відповідай на питання в темах або марафоні: шанс росте з кожною правильною відповіддю.'
          ) : ready.weakest ? (
            <>
              Найбільше помилок зараз дає блок «{ready.weakest.title}». <Link to="/topics">До тем</Link>
            </>
          ) : (
            'Ти знаєш усі питання категорії. Перевір себе на іспиті.'
          )}
        </p>
        <p className="readiness-note">
          Оцінка за твоїми останніми відповідями: не бачені питання рахуються як незнані. Це не гарантія.
        </p>
      </section>

      {data.activeExam?.category === bank.category && <ResumeExamCard exam={data.activeExam} />}

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
        <Link to="/marathon" className="entry entry-marathon">
          <span className="entry-icon" aria-hidden="true">
            <Icon name="shuffle" />
          </span>
          <span className="entry-body">
            <span className="entry-title">Марафон</span>
            <span className="entry-meta">
              Уся база категорії впереміш · пройдено {marathonDone} з {allIds.length}
            </span>
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
        <Link to="/saved" className="entry entry-saved">
          <span className="entry-icon" aria-hidden="true">
            <Icon name="star" />
          </span>
          <span className="entry-body">
            <span className="entry-title">Збережені</span>
            <span className="entry-meta">
              {saved > 0
                ? `${saved} ${pluralUk(saved, 'збережене питання', 'збережені питання', 'збережених питань')}`
                : 'Позначай питання зірочкою, щоб повторити їх тут'}
            </span>
          </span>
          <Icon name="chev" className="entry-chev" />
        </Link>
      </nav>
      <Link to="/history" className="history-link">
        <Icon name="history" />
        Історія іспитів
      </Link>
      <Link to="/backup" className="history-link">
        <Icon name="save" />
        Резервна копія прогресу
      </Link>
      <section className="theme-pick" aria-labelledby="theme-label">
        <h2 id="theme-label" className="category-label">
          Тема
        </h2>
        <div className="segctl theme-segctl" role="group" aria-labelledby="theme-label">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={t.id === data.settings.theme}
              onClick={() => void updateSettings({ theme: t.id })}
            >
              {t.title}
            </button>
          ))}
        </div>
      </section>
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
