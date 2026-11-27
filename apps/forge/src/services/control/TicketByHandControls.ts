/** The by-hand ticket kinds: the settings, moves and marks User sets on a ticket outside a job, as the `ticket` verbs did in place. */
import { TicketBodyUtil }                         from '../../adapters/utils/TicketBodyUtil.ts';
import type { AgentAssignment, ReviewBarStarted } from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { Ticket, TicketStatus }              from '../../domain/tracker-model/@types/Ticket.ts';
import type { ControlCommandOf as CommandOf }     from '../../shared/@types/ControlCommand.ts';
import type { BoardTransaction }                  from '../tracker/BoardTransaction.ts';
import { ticketIdOfReference }                    from './ControlTicketLookup.ts';

/**
 * A reviewer's `rereview` hands the ticket's slot to the next reviewer. The round is the one a reviewer states for itself: the `## Review`
 * sections already in the ticket, plus one.
 */
export function reviewBarStartedFor(change: BoardTransaction, ticket: Readonly<Ticket>, request: AgentAssignment | null): ReviewBarStarted | null {
  if (request === null) return null;
  const round = TicketBodyUtil.nextReviewRoundOf(ticket.body);
  return change.board.startReviewBar(ticket.frontmatter.id, { round, ...request }, change.at);
}

function linkTicket(command: CommandOf<'ticket-link'>, change: BoardTransaction) {
  return change.board.linkTicketToTask(ticketIdOfReference(change, command.ticketReference), command.taskId, { movesTheLink: command.movesTheLink });
}

function setAgents(command: CommandOf<'ticket-agent'>, change: BoardTransaction) {
  const { model, effort } = command;
  return change.board.setTicketAgents(ticketIdOfReference(change, command.ticketReference), {
    ...(model === undefined ? {} : { model }),
    ...(effort === undefined ? {} : { effort }),
  }, change.at);
}

function markOrClearRelease(command: CommandOf<'ticket-release-of'>, change: BoardTransaction) {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  return command.clears ? change.board.clearReleaseTicket(ticketId, change.at) : change.board.markReleaseTicket(ticketId, change.at);
}

function rereview(command: CommandOf<'ticket-rereview'>, change: BoardTransaction) {
  const rereviewed = change.board.rereviewTicket(ticketIdOfReference(change, command.ticketReference), change.at);
  return { rereview: rereviewed, startedReviewBar: reviewBarStartedFor(change, rereviewed.ticket, command.reviewBar) };
}

type TicketMoveCommand = CommandOf<'ticket-reopen'> | CommandOf<'ticket-status-set'>;

function moveTicket(command: TicketMoveCommand, targetStatus: TicketStatus, checksLegality: boolean, change: BoardTransaction) {
  const {
    branch, commit, reason, tokens
  } = command;
  return change.board.moveTicket(ticketIdOfReference(change, command.ticketReference), targetStatus, {
    checksLegality,
    ...(branch === undefined ? {} : { branch }),
    ...(commit === undefined ? {} : { commit }),
    ...(reason === undefined ? {} : { reason }),
    ...(tokens === undefined ? {} : { tokens }),
  }, change.at);
}

export const TICKET_BY_HAND_CONTROLS = {
  'ticket-link': linkTicket,
  'ticket-size': (command: CommandOf<'ticket-size'>, change: BoardTransaction) => change.board.setTicketSize(
    ticketIdOfReference(change, command.ticketReference),
    command.size,
    change.at,
  ),
  'ticket-agent':         setAgents,
  'ticket-introduced-by': (command: CommandOf<'ticket-introduced-by'>, change: BoardTransaction) => change.board.setTicketIntroducedBy(
    ticketIdOfReference(change, command.ticketReference),
    command.causeTicketId,
    change.at,
  ),
  'ticket-release-of': markOrClearRelease,
  'ticket-rereview':   rereview,
  'ticket-reopen':     (command: CommandOf<'ticket-reopen'>, change: BoardTransaction) => moveTicket(command, 'committed', true, change),
  'ticket-status-set': (command: CommandOf<'ticket-status-set'>, change: BoardTransaction) => moveTicket(command, command.status, false, change),
  'ticket-unready':    (command: CommandOf<'ticket-unready'>, change: BoardTransaction) => change.board.unreadyTicket(
    ticketIdOfReference(change, command.ticketReference),
    change.at,
  ),
} as const;
