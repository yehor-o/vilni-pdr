import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { formatClock, remainingMs } from '../../logic/exam';
import type { ActiveExam } from '../../storage';

/** Card that leads back to the unfinished exam (#/exam/run restores it). */
export function ResumeExamCard({ exam }: { exam: ActiveExam }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const left = remainingMs(exam.startedAt, exam.durationSec, now);
  const timeUp = left === 0;

  return (
    <section className="summary-card resume-card" aria-labelledby="resume-title">
      <h2 id="resume-title" className={`summary-title${timeUp ? ' alone' : ''}`}>
        {timeUp ? 'Час незавершеного іспиту вийшов' : 'Незавершений іспит'}
      </h2>
      {!timeUp && (
        <p className="summary-line">
          Питання {exam.step + 1} з {exam.questionIds.length} · залишилось {formatClock(left)}
        </p>
      )}
      <Link to="/exam/run" className="cbtn blue">
        {timeUp ? 'Подивитися результат' : 'Продовжити'}
        <Icon name="arrow" />
      </Link>
    </section>
  );
}
