export type SegmentState = '' | 'ok' | 'no' | 'cur' | 'done';

interface Props {
  segments: SegmentState[];
  label: string;
  value: number;
}

/** Segmented progress as in the «Ігровий» mockup. */
export function SegmentBar({ segments, label, value }: Props) {
  return (
    <div
      className="segbar"
      style={{ gridTemplateColumns: `repeat(${segments.length}, 1fr)` }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={segments.length}
      aria-valuenow={value}
    >
      {segments.map((s, i) => (
        <i key={i} className={s} />
      ))}
    </div>
  );
}
