/**
 * The tickets of the dependents that a crossing ticket's package change breaks. Each is filed in the crossing ticket's group and waits
 * on it; the group's release lands them on the main line together and gates the dependents there. A package build of a grouped
 * crossing ticket leaves out the gates of the dependents whose fix tickets are in its group.
 */
import { TicketAcceptanceUtil }    from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import type { LogRecord }          from '../../domain/tracker-model/@types/LogRecord.ts';
import type { EntityKey }          from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }              from '../../domain/tracker-model/Board.ts';
import { SETTLED_TICKET_STATUSES } from '../../domain/tracker-model/constants/Statuses.ts';
import { TicketDependencyUtil }    from '../../domain/tracker-model/utils/TicketDependencyUtil.ts';
import type { BoardTransaction }   from '../tracker/BoardTransaction.ts';

/** What the fix ticket of a dependent is worded from. */
export interface DependentFixFacts {
  ticketId:        string;
  ticketBranch:    string;
  homeEntity:      EntityKey;
  packageEntity:   EntityKey;
  dependentEntity: EntityKey;
  group:           string;
}

export interface DependentFixWording {
  title: string;
  body:  string;
}

export interface DependentFixContext {
  dependentFixWordingOf: (facts: DependentFixFacts) => DependentFixWording;
  ticketBranchOf:        (ticketId: string) => string;
}

/** A crossing ticket with no group is put into one named after it, which the branch `group-ticket-<id>` names. */
const GROUP_NAME_PREFIX_OF_A_CROSSING_TICKET = 'ticket-';

function ticketOf(board: Board, ticketId: string) {
  return board.tickets().find((ticket) => ticket.frontmatter.id === ticketId);
}

/** Of `dependents`, those with a ticket in the crossing ticket's group that is not abandoned; none for a ticket in no group. */
function dependentsFixedInGroupOf(board: Board, ticketId: string, dependents: readonly EntityKey[]): EntityKey[] {
  const group = ticketOf(board, ticketId)?.frontmatter.group;
  if (group === undefined) return [];
  const fixedEntities = new Set(board.tickets()
    .filter(({ frontmatter }) => frontmatter.id !== ticketId && frontmatter.group === group && frontmatter.status !== 'abandoned')
    .flatMap(({ frontmatter }) => frontmatter.entity ?? []));
  return dependents.filter((entityKey) => fixedEntities.has(entityKey));
}

function dependencyClosesACircle(board: Board, waitingTicketId: string, dependencyId: string): boolean {
  const dependsOnById = new Map(board.tickets().map((ticket) => [ticket.frontmatter.id, ticket.frontmatter.dependsOn ?? []]));
  const dependsOn = [...dependsOnById.get(waitingTicketId) ?? [], dependencyId];
  return TicketDependencyUtil.dependencyLoopFrom(waitingTicketId, dependsOn, dependsOnById) !== null;
}

/**
 * The group's release holds the fix ticket: with no open release ticket the fix ticket becomes it, so its bundle holds the crossing ticket
 * it waits on. A crossing ticket that releases the group itself hands its mark to the fix ticket, since its own landing on the main line
 * would gate the dependent it breaks. Any other release ticket waits on the fix ticket.
 */
function releaseTheGroupWithTheFix(board: Board, group: string, crossingTicketId: string, fixTicketId: string, at: string): readonly LogRecord[] {
  const releaseTicket = board.tickets().find(({ frontmatter }) => frontmatter.group === group && frontmatter.releasesGroup === true
    && !SETTLED_TICKET_STATUSES.includes(frontmatter.status));
  if (releaseTicket === undefined) return board.markReleaseTicket(fixTicketId, at).logged;
  const releaseTicketId = releaseTicket.frontmatter.id;
  if (releaseTicketId === crossingTicketId) return [...board.clearReleaseTicket(crossingTicketId, at).logged, ...board.markReleaseTicket(fixTicketId, at).logged];
  if (dependencyClosesACircle(board, releaseTicketId, fixTicketId)) return [];
  return board.addTicketDependencies(releaseTicketId, [fixTicketId], at).logged;
}

/**
 * User chose to fix the dependent in the crossing ticket's group: the ticket goes into a group of its own when it has none, and the
 * dependent's fix ticket is filed in it, waiting on the crossing ticket, submitted at once. A dependent that already has a ticket in the
 * group gets no second one, so acting on the answer again files nothing.
 */
function fileFixTicket(change: BoardTransaction, context: DependentFixContext, crossing: { ticketId: string; dependentEntity: EntityKey }): readonly LogRecord[] {
  const { board, at } = change;
  const { ticketId, dependentEntity } = crossing;
  const ticket = ticketOf(board, ticketId);
  const homeEntity = ticket?.frontmatter.entity;
  const packageEntity = board.ticketStageOf(ticketId)?.entity;
  if (ticket === undefined || homeEntity === undefined || packageEntity === undefined) return [];
  const grouped = ticket.frontmatter.group === undefined ? board.setTicketGroup(ticketId, `${GROUP_NAME_PREFIX_OF_A_CROSSING_TICKET}${ticketId}`, at).logged : [];
  const group = ticket.frontmatter.group ?? '';
  if (dependentsFixedInGroupOf(board, ticketId, [dependentEntity]).length > 0) return grouped;
  const wording = context.dependentFixWordingOf({
    ticketId, ticketBranch: context.ticketBranchOf(ticketId), homeEntity, packageEntity, dependentEntity, group
  });
  const fix = change.records.newTicket({
    title: wording.title, type: 'ticket', group, bodyFor: () => wording.body, at
  });
  fix.frontmatter.entity    = dependentEntity;
  fix.frontmatter.dependsOn = [ticketId];
  const fixTicketId = fix.frontmatter.id;
  return [
    ...grouped,
    ...board.fileTicket(fix, at).logged,
    ...board.submitDraftTickets([fixTicketId], TicketAcceptanceUtil.readinessGapsOf, at).logged,
    ...releaseTheGroupWithTheFix(board, group, ticketId, fixTicketId, at),
    ...board.recordDependentFixFiled(ticketId, { entity: dependentEntity, fixTicketIds: [fixTicketId] }, at).logged,
  ];
}

export const DependentFixTickets = Object.freeze({ dependentsFixedInGroupOf, fileFixTicket });
