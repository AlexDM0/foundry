/**
 * The meters, each an image named by its label. The segment meter is a roll-up bar: one part per state, in the order given, each as wide as
 * its count and titled with its label and count. The fill meter is one bar filled to the share used of a limit, striped without a limit;
 * the caller decides when it is near the limit. The slot meter is one cell per slot of a limit, with an over cell for each past it.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

import { MeterUtil } from './utils/MeterUtil.ts';

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

export interface FillMeterProps {
  readonly label: string;
  readonly used:  number;
  /** `null` for no limit: the track is striped and holds no bar. */
  readonly limit: number | null;
  readonly near:  boolean;
  readonly state: DisplayState;
}

export function FillMeter({
  label, used, limit, near, state
}: FillMeterProps) {
  return (
    <div
      className="bridge-fill-meter"
      role="img"
      aria-label={label}
      data-state={state}
      data-near={near ? '' : undefined}
      data-unbounded={limit === null ? '' : undefined}
    >
      {limit === null ? null : <span className="bridge-fill-meter-bar" style={{ width: `${MeterUtil.fillPercentOf(used, limit)}%` }} />}
    </div>
  );
}

export interface SlotMeterProps {
  readonly label:  string;
  readonly filled: number;
  readonly limit:  number;
  readonly state:  DisplayState;
}

export function SlotMeter({
  label, filled, limit, state
}: SlotMeterProps) {
  return (
    <div className="bridge-slot-meter" role="img" aria-label={label} data-state={state}>
      {/* A cell has no identity beyond its place in the row. */}
      {MeterUtil.slotCellsOf(filled, limit).map((cell, i) => <span key={i} className="bridge-slot-meter-cell" data-cell={cell} />)}
    </div>
  );
}
