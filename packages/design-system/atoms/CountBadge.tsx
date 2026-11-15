/**
 * A count in a small mono pill after a label, such as a tab's: neutral, in a state tone's colours, or in the warn or error colours; a
 * marked count leads with a dot, hidden from the accessibility tree, where its colour alone says something is urgent. A changed count
 * rises in when it grew and drops in when it shrank.
 */
import type { StateTone } from '../@types/StateTone.ts';

import { useValueChange } from '../utils/ValueChange.ts';

export type CountBadgeTone = 'neutral' | 'state' | 'warn' | 'error';

/** A `state` count takes the colours of its state tone; every other tone has colours of its own, so it takes none. */
export type CountBadgeColours =
  | { readonly tone: 'state'; readonly stateTone: StateTone }
  | { readonly tone: Exclude<CountBadgeTone, 'state'>; readonly stateTone?: never };

export type CountBadgeProps = CountBadgeColours & {
  readonly count:   number;
  readonly marked?: boolean;
};

export function CountBadge({
  count, tone, stateTone, marked = false
}: CountBadgeProps) {
  const { changeCount, direction } = useValueChange(count);
  return (
    <span className="design-system-count-badge" data-tone={tone} data-state-tone={stateTone}>
      {marked ? <span className="design-system-count-badge-dot" aria-hidden="true" /> : null}
      <span key={changeCount} className="design-system-count-badge-number" data-change={direction}>{count}</span>
    </span>
  );
}
