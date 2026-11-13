import { forwardRef } from 'react';
import type { QuestionExplanation } from '../data/types';
import { Explanation } from './Explanation';
import { Icon } from './Icon';

interface Props {
  /** ok / bad show the verdict; neutral only offers the next button. */
  kind: 'ok' | 'bad' | 'neutral';
  title?: string;
  text?: string;
  /** Optional «Чому так?» shown above the button. */
  explanation?: QuestionExplanation;
  buttonLabel: string;
  onNext: () => void;
}

/** Bottom panel with the verdict and the «Далі» button. */
export const FeedbackSheet = forwardRef<HTMLButtonElement, Props>(function FeedbackSheet(
  { kind, title, text, explanation, buttonLabel, onNext },
  ref,
) {
  const btn = kind === 'ok' ? 'green' : kind === 'bad' ? 'red' : 'blue';
  return (
    <section className={`sheet ${kind}`}>
      <div className="sheet-inner">
        {title && (
          <h2 className="sheet-title">
            <span className="sheet-badge" aria-hidden="true">
              <Icon name={kind === 'ok' ? 'check' : 'x'} />
            </span>
            {title}
          </h2>
        )}
        {text && <p className="sheet-text">{text}</p>}
        <Explanation explanation={explanation} />
        <button ref={ref} type="button" className={`cbtn ${btn}`} onClick={onNext}>
          {buttonLabel}
          <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
});
