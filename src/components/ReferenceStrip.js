import { FLAGS } from '@/lib/referenceRanges';
import { cn } from '@/lib/utils';

const SEGMENT_CLASS = {
  [FLAGS.GOOD]: 'bg-tint-good',
  [FLAGS.WATCH]: 'bg-tint-watch',
  [FLAGS.POOR]: 'bg-tint-poor',
};

const FLAG_CLASS = {
  [FLAGS.GOOD]: 'text-good',
  [FLAGS.WATCH]: 'text-watch',
  [FLAGS.POOR]: 'text-poor',
};

/** Shows a value against its reference range. Colour never works alone: the value and flag are real text. */
export function ReferenceStrip({ label, strip, note, animate = false }) {
  const spoken = `${label}: ${strip.value}, ${strip.flag.toLowerCase()}.${note ? ` ${note}.` : ''}`;
  return (
    <div className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 text-data">
        <span>{label}</span>
        <span className="whitespace-nowrap font-bold">
          {strip.value} <span className={FLAG_CLASS[strip.flag]}>{strip.flag}</span>
        </span>
      </div>
      <div role="img" aria-label={spoken} className="relative mt-2 flex h-2">
        {strip.segments.map((segment) => (
          <div key={segment.flag} className={SEGMENT_CLASS[segment.flag]} style={{ width: `${segment.percent}%` }} />
        ))}
        <div
          className={cn('absolute -bottom-0.5 -top-1 w-0.5 -translate-x-1/2 bg-ink', animate && 'strip-marker-enter')}
          style={{ left: `${strip.markerPercent}%` }}
        />
      </div>
      {note ? <p className="mt-1 text-label font-normal text-muted-foreground">{note}</p> : null}
    </div>
  );
}
