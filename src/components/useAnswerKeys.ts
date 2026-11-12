import { useEffect, useRef } from 'react';

interface Handlers {
  /** 0-based option index from keys 1–5. */
  onDigit: (index: number) => void;
  /** Enter outside a focused control. */
  onEnter: () => void;
}

/** Keys 1–5 choose an option, Enter goes next. Ignored while a dialog is open. */
export function useAnswerKeys(enabled: boolean, handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (document.querySelector('dialog[open]')) return;
      const target = e.target as HTMLElement | null;
      if (e.key === 'Enter') {
        // Focused buttons/links handle Enter natively.
        if (target?.closest('button, a, input, textarea, select')) return;
        e.preventDefault();
        ref.current.onEnter();
        return;
      }
      if (target?.closest('input, textarea, select')) return;
      if (/^[1-5]$/.test(e.key)) ref.current.onDigit(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
