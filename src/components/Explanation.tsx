import { useState } from 'react';
import type { QuestionExplanation } from '../data/types';
import { Icon } from './Icon';

/**
 * Refs that start with a digit point to the traffic rules (ПДР): "12.6 б" → «п. 12.6 б»,
 * "33 (знак 3.29)" → «розділ 33 (знак 3.29)». Any other ref names its own document
 * ("КУпАП, ст. 263") and is shown as is. No refs: the topic has no official source
 * (owner's decision 2026-11-24), and the reader is told so.
 */
export function formatRefs(refs: readonly string[]): string {
  if (!refs.length) return 'Без посилання на нормативний документ';
  const pdr = refs
    .filter((r) => /^\d/.test(r))
    .map((r) => (/^\d+ \(/.test(r) ? `розділ ${r}` : `п. ${r}`));
  const other = refs.filter((r) => !/^\d/.test(r));
  return [...(pdr.length ? [`ПДР: ${pdr.join(', ')}`] : []), ...other].join('; ');
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
          {explanation.outdated && <p className="why-note">Розбіжність із чинними правилами</p>}
          <p className="why-text">{explanation.text}</p>
          <p className="why-ref">
            {formatRefs(explanation.refs)}. Пояснення проєкту, а не офіційний текст ГСЦ.
          </p>
        </div>
      )}
    </div>
  );
}
