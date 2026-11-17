import type { EntityKey }    from './Pipeline.ts';
import type { ReadinessGap } from './Ticket.ts';

/** What a build job asks of another entity: that entity, a title, and the body its ticket will carry. */
export interface NeedDeclaration {
  entity: EntityKey;
  title:  string;
  /** A numbered `## Acceptance` that holds the intended use, and a `## Brief`. */
  body:   string;
}

/** A need a build job of one entity declared for another, kept until the Overseer files it as that entity's ticket. */
export interface DeclaredNeed extends NeedDeclaration {
  jobId:     string;
  /** The declaring job's tickets, which wait for the need's ticket. */
  ticketIds: string[];
}

/** Why a declaration is not a complete need: the readiness gaps of its body, as `ticket ready` reads them, and a blank entity or title. */
export type NeedGap = 'entity-missing' | 'title-missing' | ReadinessGap;
