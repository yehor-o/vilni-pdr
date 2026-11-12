import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { formatDuration } from '../logic/exam';
import { useProgress } from '../storage';
import { formatDateTime } from './exam/format';

export function HistoryScreen() {
  const { data } = useProgress();
  const exams = [...data.exams].reverse(); // newest first

  return (
    <div className="screen">
      <TopBar backTo="/" backLabel="На головну" title="Історія іспитів" />
      <main className="page history">
        {exams.length === 0 ? (
          <div className="placeholder">
            <p className="placeholder-title">Ще жодної спроби</p>
            <p className="placeholder-text">Пройди перший іспит, і він зʼявиться тут.</p>
            <Link to="/exam" className="cbtn blue">
              До іспиту
            </Link>
          </div>
        ) : (
          <ol className="history-list">
            {exams.map((e) => (
              <li key={e.id}>
                <Link to={`/history/${e.id}`} state={{ from: 'history' }} className="history-item">
                  <span className={`verdict-badge ${e.passed ? 'pass' : 'fail'}`} aria-hidden="true">
                    <Icon name={e.passed ? 'check' : 'x'} />
                  </span>
                  <span className="history-body">
                    <span className="history-verdict">{e.passed ? 'Складено' : 'Не складено'}</span>
                    <span className="history-date">{formatDateTime(e.finishedAt)}</span>
                  </span>
                  <span className="history-nums">
                    <b>
                      {e.correctCount} з {e.questionIds.length}
                    </b>
                    <span>{formatDuration(e.durationSec)}</span>
                  </span>
                  <Icon name="chev" className="entry-chev" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
