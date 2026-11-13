import { useState } from 'react';
import type { QuestionExplanation } from '../data/types';
import { Icon } from './Icon';

/** "12.6 б" → «п. 12.6 б»; "33 (знак 3.29)" → «розділ 33 (знак 3.29)». */
export function formatRefs(refs: readonly string[]): string {
  return refs.map((r) => (/^\d+ \(/.test(r) ? `розділ ${r}` : `п. ${r}`)).join(', ');
}

/** Collapsed «Чому так?» button that reveals the explanation of the correct answer. */
export function Explanation({ explanation }: { explanation?: QuestionExplanation }) {
  const [open, setOpen] = useState(false);
  if (!explanation) return null;
  return (
    <div className={`why${open ? ' open' : ''}`}>
      <button type="button" className="why-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="chev" />
        Чому так?
      </button>
      {open && (
        <div className="why-body">
          <p className="why-text">{explanation.text}</p>
          <p className="why-ref">
            ПДР: {formatRefs(explanation.refs)}. Пояснення проєкту, а не офіційний текст ГСЦ.
          </p>
        </div>
      )}
    </div>
  );
}
