/**
 * One bar filled to the share used of a limit, striped without a limit, an image named by its label; the caller decides when it is near the
 * limit.
 */
import type { StateTone } from '../@types/StateTone.ts';

import { MeterUtil } from '../utils/MeterUtil.ts';

export interface FillMeterProps {
  readonly label: string;
  readonly used:  number;
  /** `null` for no limit: the track is striped and holds no bar. */
  readonly limit: number | null;
  readonly near:  boolean;
  readonly tone:  StateTone;
}

export function FillMeter({
  label, used, limit, near, tone
}: FillMeterProps) {
  return (
    <div
      className="design-system-fill-meter"
      role="img"
      aria-label={label}
      data-state-tone={tone}
      data-near={near ? '' : undefined}
      data-unbounded={limit === null ? '' : undefined}
    >
      {limit === null ? null : <span className="design-system-fill-meter-bar" style={{ width: `${MeterUtil.fillPercentOf(used, limit)}%` }} />}
    </div>
  );
}
