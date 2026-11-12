import { useEffect } from 'react';

/**
 * After the feedback panel appears, scroll so the option marked correct is
 * fully visible between the top bar and the panel. The panel sits in the page
 * flow (sticky at the bottom), so the page always has room below the last
 * option equal to the panel's real height.
 */
export function useRevealCorrect(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const opt = document.querySelector<HTMLElement>('.opts .opt.right');
      // The slot is not animated, so its box is the panel's final position.
      const slot = document.querySelector<HTMLElement>('.sheet-slot');
      if (!opt || !slot) return;
      const topLimit = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
      const bottomLimit = slot.getBoundingClientRect().top - 12;
      const r = opt.getBoundingClientRect();
      let delta = 0;
      if (r.bottom > bottomLimit) delta = r.bottom - bottomLimit;
      if (r.top - delta < topLimit) delta = r.top - topLimit; // very tall option: show its top
      if (Math.abs(delta) < 1) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
}
