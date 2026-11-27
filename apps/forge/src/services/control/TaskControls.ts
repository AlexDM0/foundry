/** The by-hand `task` kinds: a row added, moved, corrected or removed by User outside a job, as the `task` verbs did in place. */
import { TicketBodyUtil }                     from '../../adapters/utils/TicketBodyUtil.ts';
import type { ReviewBarLink }                 from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { Ticket }                        from '../../domain/tracker-model/@types/Ticket.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                   from '../../shared/OperationRefusal.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';

function requireTicketOfOption(change: BoardTransaction, option: 'ticket' | 'review-of', reference: string): Readonly<Ticket> {
  const ticket = change.board.ticketByReference(reference);
  if (ticket === undefined) throw new OperationRefusal('refused', { kind: 'task-ticket-missing', option, reference });
  return ticket;
}

/** A review bar reviews the ticket's next round: one past the `## Review` sections its reviewers wrote. */
function reviewBarLinkOf(reviewedTicket: Readonly<Ticket>): ReviewBarLink {
  return { ticketId: reviewedTicket.frontmatter.id, round: TicketBodyUtil.nextReviewRoundOf(reviewedTicket.body) };
}

function addTask(command: CommandOf<'task-add'>, change: BoardTransaction) {
  const {
    ticketReference, reviewOfReference, owner, note, tokens
  } = command;
  const ticket         = ticketReference === undefined ? undefined : requireTicketOfOption(change, 'ticket', ticketReference);
  const reviewedTicket = reviewOfReference === undefined ? undefined : requireTicketOfOption(change, 'review-of', reviewOfReference);
  return change.board.addTask({
    name:         command.name,
    startsNow:    command.startsNow,
    movesTheLink: command.movesTheLink,
    ...(owner === undefined ? {} : { owner }),
    ...(note === undefined ? {} : { note }),
    ...(tokens === undefined ? {} : { tokens }),
    ...(ticket === undefined ? {} : { ticketId: ticket.frontmatter.id }),
    ...(reviewedTicket === undefined ? {} : { reviewOf: reviewBarLinkOf(reviewedTicket) }),
  }, change.at);
}

function moveTask(command: CommandOf<'task-move'>, change: BoardTransaction) {
  change.board.moveTask(command.taskId, command.status, { movesAnyway: command.movesAnyway }, change.at);
  return change.board.annotateTask(command.taskId, command.annotation);
}

/** A correction moves no timestamp, which is what separates it from a move. */
function correctTask(command: CommandOf<'task-correct'>, change: BoardTransaction) {
  change.board.correctTask(command.taskId, command.correction, { movesAnyway: command.movesAnyway });
  return change.board.annotateTask(command.taskId, command.annotation);
}

export const TASK_CONTROLS = {
  'task-add':     addTask,
  'task-move':    moveTask,
  'task-correct': correctTask,
  'task-remove':  (command: CommandOf<'task-remove'>, change: BoardTransaction) => change.board.removeTask(command.taskId),
} as const;
