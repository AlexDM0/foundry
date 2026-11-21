/**
 * What an agent or an activity entry is, as its dot: a builder, a reviewer, one waiting, a landing, what needs User and the forge itself.
 * The one place Gaia maps a role to the design-system package's state tone and dot shape. Decoration only: the role word beside it carries
 * the meaning.
 */
import { StateDot }                      from 'design-system/StateDot';
import type { StateDotShape, StateTone } from 'design-system/StateTone';

export type DotRole = 'builder' | 'reviewer' | 'waiting' | 'landed' | 'needs-user' | 'forge';

export interface RoleLook {
  readonly tone:  StateTone;
  readonly shape: StateDotShape;
}

/** COMPONENT_LIBRARY 3.2 in the package's tones: orange builds and asks, teal reviews, green landed, grey waits or is the forge. */
export const ROLE_LOOKS: Readonly<Record<DotRole, RoleLook>> = {
  'builder':    { tone: 'accent', shape: 'solid' },
  'reviewer':   { tone: 'info', shape: 'solid' },
  'needs-user': { tone: 'accent', shape: 'dashed-ring' },
  'waiting':    { tone: 'neutral', shape: 'dashed-ring' },
  'landed':     { tone: 'success', shape: 'solid' },
  'forge':      { tone: 'neutral', shape: 'solid' },
};

export interface RoleDotProps {
  readonly role:     DotRole;
  /** The dot pulses while the work it stands for is under way. */
  readonly pulsing?: boolean;
}

export function RoleDot({ role, pulsing = false }: RoleDotProps) {
  const look = ROLE_LOOKS[role];
  return <StateDot tone={look.tone} shape={look.shape} pulsing={pulsing} />;
}
