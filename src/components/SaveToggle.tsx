import { useProgress } from '../storage';
import { Icon } from './Icon';

/**
 * Star button that saves / unsaves a question for «Збережені». Toggling keeps
 * focus where it is and never changes the question on screen.
 */
export function SaveToggle({ questionId }: { questionId: string }) {
  const { data, setSaved } = useProgress();
  const saved = Object.hasOwn(data.saved, questionId);
  return (
    <button
      type="button"
      className={`save-toggle${saved ? ' on' : ''}`}
      aria-pressed={saved}
      aria-label={saved ? 'Прибрати зі збережених' : 'Зберегти питання'}
      title={saved ? 'Прибрати зі збережених' : 'Зберегти питання'}
      onClick={() => void setSaved(questionId, !saved)}
    >
      <Icon name={saved ? 'starFilled' : 'star'} />
    </button>
  );
}
