/**
 * An agent's model and effort as one image: the model word, a row of rising bars filled up to the effort's level, and the effort word. A
 * derived meter, whose values come from another step, is drawn dashed behind a ↳ glyph, takes the focus and wraps a tooltip that says where
 * the values come from. Not a `Meter.tsx` meter: those are roll-up and fill bars sized by their counts, this one is a labelled level.
 */
import { Tooltip } from '../atoms/Tooltip.tsx';

const DEFAULT_LEVEL_COUNT = 5;

export interface DerivedNote {
  readonly title: string;
  readonly text:  string;
}

export interface ModelEffortMeterProps {
  readonly model:          string;
  readonly effort:         string;
  /** How many bars are filled, from 1 to `levelCount`. */
  readonly level:          number;
  readonly levelCount?:    number;
  readonly accessibleName: string;
  readonly size:           'node' | 'dialog' | 'hero';
  readonly derivedNote?:   DerivedNote;
}

export function ModelEffortMeter({
  model, effort, level, levelCount = DEFAULT_LEVEL_COUNT, accessibleName, size, derivedNote
}: ModelEffortMeterProps) {
  const meter = (
    <span
      className="design-system-effort-meter"
      role="img"
      aria-label={accessibleName}
      data-size={size}
      data-derived={derivedNote === undefined ? undefined : ''}
      tabIndex={derivedNote === undefined ? undefined : 0}
    >
      {derivedNote === undefined
        ? null
        : (
          <svg className="design-system-effort-meter-glyph" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 1.5V6H8M6 4L8 6L6 8" />
          </svg>
        )}
      <span className="design-system-effort-meter-model">{model}</span>
      <span className="design-system-effort-meter-bars">
        {/* A bar has no identity beyond its place in the row. */}
        {Array.from({ length: levelCount }, (_bar, i) => (
          <span key={i} className="design-system-effort-meter-bar" data-filled={i < level ? '' : undefined} />
        ))}
      </span>
      <span className="design-system-effort-meter-effort">{effort}</span>
    </span>
  );
  if (derivedNote === undefined) return meter;
  return <Tooltip title={derivedNote.title} text={derivedNote.text} placement="above">{meter}</Tooltip>;
}
