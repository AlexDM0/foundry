/**
 * The product owner's progress after the first Apply over entities (MonoAssignTickets), pure and read-only: each ticket it gives an entity,
 * with its title, the entity once assigned and the reason from its `entity-assigned` record, or that it waits; the job's state word; the
 * count; and whether the forge level still shows the line that opens it. User assigns nothing here.
 */
import type { EntityAssignmentFacts, EntityAssignmentTicket } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { DetailRoute }                                        from '../../../shell/DetailRoute.ts';
import { HashRouter }                                         from '../../../shell/HashRouter.ts';

/** Assigned; waiting while the product owner still runs; not assigned once it ended without one. */
export type EntityAssignmentRowState = 'assigned' | 'waiting' | 'not-assigned';

export interface EntityAssignmentRowView {
  readonly ticketId:   string;
  readonly ticketHref: string;
  readonly title:      string;
  readonly reason:     string;
  readonly state:      EntityAssignmentRowState;
  /** The entity key once assigned, else the state's word. */
  readonly entityText: string;
}

export interface EntityAssignmentView {
  readonly isRunning: boolean;
  readonly stateText: string;
  readonly title:     string;
  readonly lead:      string;
  readonly summary:   string;
  readonly note:      string;
  readonly rows:      readonly EntityAssignmentRowView[];
}

const KANBAN_TAB = 'kanban';

const LEAD = 'These tickets were filed before the pipeline had entities, and a ticket needs one before it can build. The product owner '
  + 'reads each ticket and the files it names, and assigns the entity itself. A ticket builds as soon as it has one.';

const RUNNING_NOTE = 'A ticket that crosses keeps its own entity and runs the crossing in stages. When the product owner cannot tell, it '
  + 'asks on the Questions tab instead of guessing.';

const ENDED_NOTE = 'The product owner stopped. A ticket without an entity does not build; when the product owner could not tell, its '
  + 'question is on the Questions tab.';

const MISSING_TITLE = 'No longer on the board';

function rowStateOf(ticket: EntityAssignmentTicket, isRunning: boolean): EntityAssignmentRowState {
  if (ticket.entity !== null) return 'assigned';
  return isRunning ? 'waiting' : 'not-assigned';
}

function entityTextOf(ticket: EntityAssignmentTicket, state: EntityAssignmentRowState): string {
  if (state === 'assigned') return ticket.entity ?? '';
  return state === 'waiting' ? 'Waiting' : 'No entity';
}

function reasonOf(ticket: EntityAssignmentTicket, state: EntityAssignmentRowState): string {
  if (state === 'waiting') return 'The product owner has not assigned it yet.';
  if (state === 'not-assigned') return 'The product owner ended without an entity for it.';
  const reason = ticket.reason ?? '';
  return ticket.assignedBy === 'user' ? `Assigned by you: ${reason}` : reason;
}

function rowOf(ticket: EntityAssignmentTicket, isRunning: boolean): EntityAssignmentRowView {
  const state = rowStateOf(ticket, isRunning);
  return {
    ticketId:   ticket.ticketId,
    ticketHref: HashRouter.fragmentOf({ tab: KANBAN_TAB, item: DetailRoute.itemTextOf({ form: 'ticket', ticketId: ticket.ticketId }) }),
    title:      ticket.title ?? MISSING_TITLE,
    reason:     reasonOf(ticket, state),
    state,
    entityText: entityTextOf(ticket, state),
  };
}

function assignedCountOf(assignment: EntityAssignmentFacts): number {
  return assignment.tickets.filter((ticket) => ticket.entity !== null).length;
}

/** "The product owner gives 6 tickets an entity". */
function titleOf(ticketCount: number): string {
  return `The product owner gives ${ticketCount === 1 ? '1 ticket' : `${ticketCount} tickets`} an entity`;
}

/** "4 of 6 assigned." */
function summaryOf(assignment: EntityAssignmentFacts): string {
  return `${assignedCountOf(assignment)} of ${assignment.tickets.length} assigned.`;
}

function viewOf(assignment: EntityAssignmentFacts): EntityAssignmentView {
  const isRunning = assignment.jobState !== null;
  return {
    isRunning,
    stateText: isRunning ? 'Product owner · assigning entities' : 'Product owner · done',
    title:     titleOf(assignment.tickets.length),
    lead:      LEAD,
    summary:   summaryOf(assignment),
    note:      isRunning ? RUNNING_NOTE : ENDED_NOTE,
    rows:      assignment.tickets.map((ticket) => rowOf(ticket, isRunning)),
  };
}

/** The forge level shows the line while the product owner runs, or while a ticket it was given still has no entity. */
function lineIsShownFor(assignment: EntityAssignmentFacts | undefined): assignment is EntityAssignmentFacts {
  if (assignment === undefined) return false;
  return assignment.jobState !== null || assignedCountOf(assignment) < assignment.tickets.length;
}

/** "The product owner gives 6 tickets an entity: 4 of 6 assigned." */
function lineTextOf(assignment: EntityAssignmentFacts): string {
  return `${titleOf(assignment.tickets.length)}: ${summaryOf(assignment)}`;
}

export const EntityAssignmentProgressModel = Object.freeze({
  viewOf,
  lineIsShownFor,
  lineTextOf,
});
