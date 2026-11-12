import { Icon } from './Icon';

/** How an option is marked: chosen-but-unjudged, correct, or wrong. */
export type OptionMark = 'none' | 'selected' | 'right' | 'wrong';

export interface OptionView {
  text: string;
  mark: OptionMark;
  /** Text label accompanying the mark (never colour alone). */
  tag?: string;
}

interface Props {
  options: OptionView[];
  labelledBy: string;
  /** Interactive list: called with the option index. Omit for a read-only list. */
  onChoose?: (index: number) => void;
  locked?: boolean;
}

/** Answer options as big chunky buttons (or read-only cards in review). */
export function Options({ options, labelledBy, onChoose, locked = false }: Props) {
  return (
    <ol className="opts" aria-labelledby={labelledBy}>
      {options.map((o, i) => {
        const cls = `opt${o.mark === 'none' ? '' : ` ${o.mark}`}`;
        const body = (
          <>
            <span className="num" aria-hidden="true">
              {o.mark === 'right' ? <Icon name="check" /> : o.mark === 'wrong' ? <Icon name="x" /> : i + 1}
            </span>
            <span className="otext">
              {o.text}
              {o.tag && <span className="tag">{o.tag}</span>}
            </span>
          </>
        );
        return (
          <li key={i}>
            {onChoose ? (
              <button
                type="button"
                className={cls}
                aria-disabled={locked}
                aria-pressed={o.mark === 'selected' ? true : undefined}
                onClick={() => !locked && onChoose(i)}
              >
                {body}
              </button>
            ) : (
              <div className={`${cls} static`}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Marks for a judged question: the correct option and the chosen one. */
export function judgedOptions(
  texts: string[],
  correct: number,
  choice: number | null,
  labels: { chosenRight: string; chosenWrong: string; correct: string },
): OptionView[] {
  return texts.map((text, i) => {
    if (i === correct) return { text, mark: 'right', tag: choice === i ? labels.chosenRight : labels.correct };
    if (i === choice) return { text, mark: 'wrong', tag: labels.chosenWrong };
    return { text, mark: 'none' };
  });
}
