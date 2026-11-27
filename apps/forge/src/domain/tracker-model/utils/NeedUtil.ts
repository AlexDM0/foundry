/** What makes a declared need complete, and which stored need a declaration repeats; the Board and the Bouncer read a need the same way. */
import type { DeclaredNeed, NeedDeclaration, NeedGap } from '../@types/Need.ts';
import type { ReadinessGap }                           from '../@types/Ticket.ts';

/** The body is read as `ticket ready` reads a draft's, by the reading the caller passes, since the tracker model holds no markdown reader. */
function gapsOf(declaration: Readonly<NeedDeclaration>, readinessGapsOf: (body: string) => readonly ReadinessGap[]): NeedGap[] {
  return [
    ...(declaration.entity.trim() === '' ? ['entity-missing' as const] : []),
    ...(declaration.title.trim() === '' ? ['title-missing' as const] : []),
    ...readinessGapsOf(declaration.body),
  ];
}

/** A job declares one need per entity and title: a later declaration with both replaces the earlier one's body. */
function needDeclaredBefore(needs: readonly DeclaredNeed[], jobId: string, declaration: Readonly<NeedDeclaration>): DeclaredNeed | undefined {
  return needs.find((need) => need.jobId === jobId && need.entity === declaration.entity && need.title === declaration.title);
}

export const NeedUtil = Object.freeze({ gapsOf, needDeclaredBefore });
