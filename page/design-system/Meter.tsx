/**
 * A share of a whole as a thin bar, an image named by its label. It is absent when its whole is unknown, never drawn empty, and it is
 * full, in the warn tone, once the share reaches the whole. It never animates.
 */
export type MeterTone = 'neutral' | 'builder' | 'reviewer' | 'paused' | 'landed';

export interface MeterProps {
  readonly label:      string;
  readonly used:       number;
  /** `null` when the whole is unknown: then there is no meter. */
  readonly whole:      number | null;
  readonly tone?:      MeterTone;
  readonly thickness?: 'thin' | 'thick';
}

function filledPercentOf(used: number, whole: number): number {
  if (whole <= 0) return 100;
  return Math.min(100, Math.max(0, (used / whole) * 100));
}

export function Meter({
  label, used, whole, tone = 'neutral', thickness = 'thin'
}: MeterProps) {
  if (whole === null) return null;
  return (
    <span className="gaia-meter" role="img" aria-label={label} data-tone={tone} data-thickness={thickness} data-full={used >= whole ? '' : undefined}>
      <span className="gaia-meter-fill" style={{ width: `${filledPercentOf(used, whole)}%` }} />
    </span>
  );
}
