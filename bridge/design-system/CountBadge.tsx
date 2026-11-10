/**
 * A count in a small mono pill after a label, such as a tab's: neutral, in a display state's colours, or in the warn or error colours; a
 * marked count leads with a dot, hidden from the accessibility tree, where its colour alone says something is urgent.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

export type CountBadgeTone = 'neutral' | 'state' | 'warn' | 'error';

export interface CountBadgeProps {
  readonly count:   number;
  readonly tone:    CountBadgeTone;
  /** The state whose colours a `state` count takes; ignored for every other tone. */
  readonly state?:  DisplayState;
  readonly marked?: boolean;
}

export function CountBadge({
  count, tone, state, marked = false
}: CountBadgeProps) {
  return (
    <span className="bridge-count-badge" data-tone={tone} data-state={tone === 'state' ? state : undefined}>
      {marked ? <span className="bridge-count-badge-dot" aria-hidden="true" /> : null}
      {count}
    </span>
  );
}
