/**
 * A 7 px dot for what an agent or an activity entry is: a builder, a reviewer, one waiting, a landing, what needs User, the forge itself.
 * Decoration only.
 */
export type DotRole = 'builder' | 'reviewer' | 'waiting' | 'landed' | 'needs-user' | 'forge';

export function RoleDot({ role }: { readonly role: DotRole }) {
  return <span className="gaia-role-dot" data-role={role} aria-hidden="true" />;
}
