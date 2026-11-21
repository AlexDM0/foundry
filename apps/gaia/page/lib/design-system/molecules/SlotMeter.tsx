/**
 * One cell per slot of a limit, with an over cell for each past it, an image named by its label. `wrap` lets the cells run onto more lines
 * and the meter shrink to its holder, for a limit of more slots than a narrow column holds.
 */
import type { StateTone } from '../@types/StateTone.ts';

import { MeterUtil } from '../utils/MeterUtil.ts';

export interface SlotMeterProps {
  readonly label:  string;
  readonly filled: number;
  readonly limit:  number;
  readonly tone:   StateTone;
  readonly wrap?:  boolean;
}

export function SlotMeter({
  label, filled, limit, tone, wrap = false
}: SlotMeterProps) {
  return (
    <div className="design-system-slot-meter" role="img" aria-label={label} data-state-tone={tone} data-wrap={wrap ? '' : undefined}>
      {/* A cell has no identity beyond its place in the row. */}
      {MeterUtil.slotCellsOf(filled, limit).map((cell, i) => <span key={i} className="design-system-slot-meter-cell" data-cell={cell} />)}
    </div>
  );
}
