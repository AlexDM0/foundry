/**
 * A roll-up bar, an image named by its label: one part per segment, in the order given, each as wide as its count and titled with its label
 * and count.
 */
import type { StateTone } from '../@types/StateTone.ts';

export interface MeterSegment {
  readonly tone:  StateTone;
  readonly count: number;
  readonly label: string;
}

export interface SegmentMeterProps {
  readonly label:    string;
  readonly segments: readonly MeterSegment[];
}

export function SegmentMeter({ label, segments }: SegmentMeterProps) {
  return (
    <div className="design-system-segment-meter" role="img" aria-label={label}>
      {segments.map((segment) => (
        <span
          key={segment.label}
          className="design-system-segment-meter-part"
          data-state-tone={segment.tone}
          style={{ flexGrow: segment.count }}
          title={`${segment.label}: ${segment.count}`}
        />
      ))}
    </div>
  );
}
