const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z';

const PATHS = {
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  chev: 'M9 6l6 6-6 6',
  redo: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  zoom: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  shuffle: 'M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.8-3.4M13.2 10.4C14.2 8.6 15.4 7 17 7h3M17 4l3 3-3 3M17 14l3 3-3 3',
  history: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  save: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14',
  star: STAR,
  starFilled: STAR,
} as const;

/** Icons drawn filled with the current colour (on top of the usual stroke). */
const FILLED: ReadonlySet<string> = new Set(['starFilled']);

export type IconName = keyof typeof PATHS;

/** Stroke icon; decorative by default (the accompanying text carries meaning). */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill={FILLED.has(name) ? 'currentColor' : undefined} />
    </svg>
  );
}
