/**
 * One bar filled to the share used of a limit, striped without a limit, an image named by its label; the caller decides when it is near the
 * limit. `borderless` draws the track with no edge, as a quiet meter in a line of figures.
 */
import type { StateTone } from '../@types/StateTone.ts';

import { MeterUtil } from '../utils/MeterUtil.ts';

export interface FillMeterProps {
  readonly label:       string;
  readonly used:        number;
  /** `null` for no limit: the track is striped and holds no bar. */
  readonly limit:       number | null;
  readonly near:        boolean;
  readonly tone:        StateTone;
  readonly borderless?: boolean;
}

export function FillMeter({
  label, used, limit, near, tone, borderless = false
}: FillMeterProps) {
  return (
    <div
      className="design-system-fill-meter"
      role="img"
      aria-label={label}
      data-state-tone={tone}
      data-near={near ? '' : undefined}
      data-unbounded={limit === null ? '' : undefined}
      data-borderless={borderless ? '' : undefined}
    >
      {limit === null ? null : <span className="design-system-fill-meter-bar" style={{ width: `${MeterUtil.fillPercentOf(used, limit)}%` }} />}
    </div>
  );
}
