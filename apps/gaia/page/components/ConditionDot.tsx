/**
 * A forge's condition as its 8 px dot, the one place Gaia maps a condition to the design-system package's state tone and dot shape: fill
 * holds, a ring changes, a dashed ring waits. The package draws it hidden from the accessibility tree: a dot is never the only sign, the
 * row beside it says the word.
 */
import { StateDot, type StateDotShape, type StateTone } from '../lib/design-system/DesignSystemInterface.ts';

export type DotCondition = 'live' | 'paused' | 'held' | 'starting' | 'dormant' | 'unreachable' | 'unreadable' | 'missing' | 'outdated';

export interface ConditionLook {
  readonly tone:  StateTone;
  readonly shape: StateDotShape;
}

/**
 * COMPONENT_LIBRARY 3.2 in the package's tones: orange is work, neutral grey a pause, crimson a forge that does not answer, faded ink what
 * is asleep or cannot be read. A forge that needs an update waits on User, dashed in orange as a held one.
 */
export const CONDITION_LOOKS: Readonly<Record<DotCondition, ConditionLook>> = {
  live:        { tone: 'accent', shape: 'solid' },
  starting:    { tone: 'accent', shape: 'ring' },
  held:        { tone: 'accent', shape: 'dashed-ring' },
  paused:      { tone: 'neutral', shape: 'solid' },
  unreachable: { tone: 'error', shape: 'solid' },
  dormant:     { tone: 'muted', shape: 'ring' },
  unreadable:  { tone: 'muted', shape: 'dashed-ring' },
  missing:     { tone: 'muted', shape: 'dashed-ring' },
  outdated:    { tone: 'accent', shape: 'dashed-ring' },
};

export function ConditionDot({ condition }: { readonly condition: DotCondition }) {
  const look = CONDITION_LOOKS[condition];
  return <StateDot tone={look.tone} shape={look.shape} />;
}
