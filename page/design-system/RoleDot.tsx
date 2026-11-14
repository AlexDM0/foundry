/**
 * What an agent or an activity entry is, as its dot: a builder, a reviewer, one waiting, a landing, what needs User, the forge itself, and
 * Flint's brain. The one place Gaia maps a role to the design-system package's state tone and dot shape; the brain is Gaia's own diamond,
 * which the package does not draw. Decoration only: the role word beside it carries the meaning.
 */
import { StateDot }                      from 'design-system/StateDot';
import type { StateDotShape, StateTone } from 'design-system/StateTone';

import { BrainDiamond } from './BrainDiamond.tsx';

export type DotRole = 'builder' | 'reviewer' | 'waiting' | 'landed' | 'needs-user' | 'forge' | 'brain';

export interface RoleLook {
  readonly tone:  StateTone;
  readonly shape: StateDotShape;
}

/** COMPONENT_LIBRARY 3.2 in the package's tones: orange builds and asks, teal reviews, green landed, grey waits or is the forge. */
export const ROLE_LOOKS: Readonly<Record<Exclude<DotRole, 'brain'>, RoleLook>> = {
  'builder':    { tone: 'accent', shape: 'solid' },
  'reviewer':   { tone: 'info', shape: 'solid' },
  'needs-user': { tone: 'accent', shape: 'dashed-ring' },
  'waiting':    { tone: 'neutral', shape: 'dashed-ring' },
  'landed':     { tone: 'success', shape: 'solid' },
  'forge':      { tone: 'neutral', shape: 'solid' },
};

export function RoleDot({ role }: { readonly role: DotRole }) {
  if (role === 'brain') return <BrainDiamond />;
  const look = ROLE_LOOKS[role];
  return <StateDot tone={look.tone} shape={look.shape} />;
}
