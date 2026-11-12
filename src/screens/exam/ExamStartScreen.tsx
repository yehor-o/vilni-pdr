import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { TopBar } from '../../components/TopBar';
import { useQuestions } from '../../data/QuestionsProvider';
import { EXAM_DURATION_SEC, EXAM_MAX_MISTAKES, EXAM_QUESTIONS, examCompositionLine } from '../../logic/exam';
import { useProgress } from '../../storage';
import { devExamSeconds, requestExamStart } from './examLaunch';

export function ExamStartScreen() {
  const { data, updateSettings } = useProgress();
  const bank = useQuestions();
  const navigate = useNavigate();
  const { search } = useLocation();
  const instant = data.settings.examInstantFeedback;
  const devSeconds = devExamSeconds(search);

  const start = () => {
    requestExamStart(devSeconds ?? EXAM_DURATION_SEC);
    navigate('/exam/run');
  };

  return (
    <div className="screen">
      <TopBar backTo="/" backLabel="На головну" title="Іспит" />
      <main className="page exam-start">
        <ul className="rules">
          <li>
            <span className="rule-icon blue" aria-hidden="true">
              <Icon name="list" />
            </span>
            <span className="rule-text">
              {EXAM_QUESTIONS} питань, категорія {bank.categoryTitle}
              <span className="rule-hint">{examCompositionLine(bank.examBlocks)}</span>
            </span>
          </li>
          <li>
            <span className="rule-icon yellow" aria-hidden="true">
              <Icon name="clock" />
            </span>
            {EXAM_DURATION_SEC / 60} хвилин на все
          </li>
          <li>
            <span className="rule-icon red" aria-hidden="true">
              <Icon name="x" />
            </span>
            До {EXAM_MAX_MISTAKES} помилок, третя означає «не склав»
          </li>
        </ul>

        <div className="setting">
          <div className="setting-text">
            <span className="setting-label" id="instant-label">
              Показувати правильність одразу
            </span>
            <span className="setting-hint" id="instant-hint">
              {instant
                ? 'Так працює справжній іспит.'
                : 'Результат і помилки побачиш лише в кінці, після всіх 20 питань.'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={instant}
            aria-labelledby="instant-label"
            aria-describedby="instant-hint"
            onClick={() => void updateSettings({ examInstantFeedback: !instant })}
          >
            <span className="switch-knob" aria-hidden="true" />
            <span className="switch-state" aria-hidden="true">
              {instant ? 'Так' : 'Ні'}
            </span>
          </button>
        </div>

        {devSeconds && <p className="dev-note">DEV: таймер {devSeconds} с</p>}

        <button type="button" className="cbtn blue big" onClick={start}>
          Почати іспит
          <Icon name="arrow" />
        </button>
        <Link to="/history" className="history-link">
          <Icon name="history" />
          Історія іспитів
        </Link>
      </main>
    </div>
  );
}
