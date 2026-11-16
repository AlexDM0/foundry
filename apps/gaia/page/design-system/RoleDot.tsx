/**
 * What an agent or an activity entry is, as its dot: a builder, a reviewer, one waiting, a landing, what needs User, the forge itself, and
 * Flint's brain, the diamond. The one place Gaia maps a role to the design-system package's state tone and dot shape. Decoration only: the
 * role word beside it carries the meaning.
 */
import { StateDot }                      from 'design-system/StateDot';
import type { StateDotShape, StateTone } from 'design-system/StateTone';

export type DotRole = 'builder' | 'reviewer' | 'waiting' | 'landed' | 'needs-user' | 'forge' | 'brain';

export interface RoleLook {
  readonly tone:  StateTone;
  readonly shape: StateDotShape;
}

/**
 * COMPONENT_LIBRARY 3.2 in the package's tones: orange builds and asks, teal reviews, green landed, grey waits or is the forge; the brain is
 * an orange diamond.
 */
export const ROLE_LOOKS: Readonly<Record<DotRole, RoleLook>> = {
  'builder':    { tone: 'accent', shape: 'solid' },
  'reviewer':   { tone: 'info', shape: 'solid' },
  'needs-user': { tone: 'accent', shape: 'dashed-ring' },
  'waiting':    { tone: 'neutral', shape: 'dashed-ring' },
  'landed':     { tone: 'success', shape: 'solid' },
  'forge':      { tone: 'neutral', shape: 'solid' },
  'brain':      { tone: 'accent', shape: 'diamond' },
};

/** An ended role keeps its shape in the neutral grey: the brain's diamond once it ended. */
const ENDED_TONE: StateTone = 'neutral';

export interface RoleDotProps {
  readonly role:     DotRole;
  readonly ended?:   boolean;
  /** The dot pulses while the work it stands for is under way. */
  readonly pulsing?: boolean;
}

export function RoleDot({ role, ended = false, pulsing = false }: RoleDotProps) {
  const look = ROLE_LOOKS[role];
  // The brain's diamond is 7 px (COMPONENT_LIBRARY 3.2), the package's small dot; every other role is the 8 px dot.
  return <StateDot tone={ended ? ENDED_TONE : look.tone} shape={look.shape} small={role === 'brain'} pulsing={pulsing} />;
}
