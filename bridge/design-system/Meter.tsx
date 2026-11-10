/**
 * A roll-up bar: one part per state, in the order given, each as wide as its count and titled with its label and count, the whole an image
 * named by its label.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

export interface MeterSegment {
  readonly state: DisplayState;
  readonly count: number;
  readonly label: string;
}

export interface SegmentMeterProps {
  readonly label:    string;
  readonly segments: readonly MeterSegment[];
}

export function SegmentMeter({ label, segments }: SegmentMeterProps) {
  return (
    <div className="bridge-segment-meter" role="img" aria-label={label}>
      {segments.map((segment) => (
        <span
          key={segment.state}
          className="bridge-segment-meter-part"
          data-state={segment.state}
          style={{ flexGrow: segment.count }}
          title={`${segment.label}: ${segment.count}`}
        />
      ))}
    </div>
  );
}
