/**
 * A forge's condition as its 8 px dot, the one place Gaia maps a condition to the design-system package's state tone and dot shape: fill
 * holds, a ring changes, a dashed ring waits. The package has no failure tone, so the unreachable dot is Gaia's own crimson fill. It is
 * hidden from the accessibility tree: a dot is never the only sign, the row beside it says the word.
 */
import { StateDot }                      from 'design-system/StateDot';
import type { StateDotShape, StateTone } from 'design-system/StateTone';

export type DotCondition = 'live' | 'paused' | 'held' | 'starting' | 'dormant' | 'unreachable' | 'unreadable' | 'missing';

export interface ConditionLook {
  readonly tone:  StateTone;
  readonly shape: StateDotShape;
}

/** COMPONENT_LIBRARY 3.2 in the package's tones: orange is work, neutral grey a pause, faded ink what is asleep or cannot be read. */
export const CONDITION_LOOKS: Readonly<Record<Exclude<DotCondition, 'unreachable'>, ConditionLook>> = {
  live:       { tone: 'accent', shape: 'solid' },
  starting:   { tone: 'accent', shape: 'ring' },
  held:       { tone: 'accent', shape: 'dashed-ring' },
  paused:     { tone: 'neutral', shape: 'solid' },
  dormant:    { tone: 'muted', shape: 'ring' },
  unreadable: { tone: 'muted', shape: 'dashed-ring' },
  missing:    { tone: 'muted', shape: 'dashed-ring' },
};

export function ConditionDot({ condition }: { readonly condition: DotCondition }) {
  if (condition === 'unreachable') return <span className="gaia-condition-dot" data-condition={condition} aria-hidden="true" />;
  const look = CONDITION_LOOKS[condition];
  return <StateDot tone={look.tone} shape={look.shape} />;
}
