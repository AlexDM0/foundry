/** Moves one ticket to a status, prints the move and any review bar it opened, and warns when a start ignores the dispatch order. */
import { TicketPhraseUtil }                   from '../../src/adapters/utils/TicketPhraseUtil.ts';
import type { TicketStatus }                  from '../../src/lib/tracker-model/@types/Ticket.ts';
import type { ControlCommandOf }              from '../../src/shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }                      from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerbThenReadNextLine } from '../ApplyCommandOfVerb.ts';
import type { CommandContext }                from '../CommandContext.ts';
import { hatchWhenUnderJob }                  from '../HatchUnderJob.ts';
import type { ArgumentParser }                from '../arguments/ArgumentParser.ts';
import { OptionValueUtil }                    from '../utils/OptionValueUtil.ts';
import { OutputUtil }                         from '../utils/OutputUtil.ts';
import { ReviewBarOutputUtil }                from './utils/ReviewBarOutputUtil.ts';

export const TRANSITION_OPTION_NAMES = ['branch', 'commit', 'reason', 'at', 'tokens', 'json'];

type TicketMoveCommand = ControlCommandOf<'ticket-abandon'> | ControlCommandOf<'ticket-reopen'> | ControlCommandOf<'ticket-status-set'>;

/** `ticket abandon` and `ticket reopen` go through the legality matrix; `ticket status` is the by-hand override that skips it. */
function moveCommandOf(
  targetStatus: TicketStatus,
  ticketReference: string,
  checksLegality: boolean,
  moveDetails: { branch?: string; commit?: string; reason?: string; tokens?: number },
): TicketMoveCommand {
  if (!checksLegality) return {
    kind: 'ticket-status-set', ticketReference, status: targetStatus, ...moveDetails
  };
  if (targetStatus === 'abandoned') return { kind: 'ticket-abandon', ticketReference, ...moveDetails };
  if (targetStatus === 'committed') return { kind: 'ticket-reopen', ticketReference, ...moveDetails };
  throw new Error(`No ticket verb moves a ticket to ${targetStatus} through the legality matrix.`);
}

export async function transitionOneTicket(
  targetStatus: TicketStatus,
  reference: string,
  commandArguments: ArgumentParser,
  context: CommandContext,
  checksLegality: boolean,
): Promise<void> {
  const branch = commandArguments.option('branch');
  const commit = commandArguments.option('commit');
  const reason = commandArguments.option('reason');
  const tokens = OptionValueUtil.tokenCountFrom(commandArguments);
  const moveDetails = {
    ...(branch === undefined ? {} : { branch }),
    ...(commit === undefined ? {} : { commit }),
    ...(reason === undefined ? {} : { reason }),
    ...(tokens === undefined ? {} : { tokens }),
  };
  if (targetStatus === 'abandoned' && checksLegality) await hatchWhenUnderJob(context, { kind: 'ticket-abandon', ticketReference: reference, ...moveDetails });

  const command = moveCommandOf(targetStatus, reference, checksLegality, moveDetails);
  const { written, nextLine } = await applyCommandOfVerbThenReadNextLine(commandArguments, context, command);
  const move      = written.result;
  // Read from the board this write left, only to print.
  const unsettled = written.board.unsettledDependenciesOf(move.ticket.frontmatter.id);
  const { id }      = move.ticket.frontmatter;
  const humanText   = `${OutputUtil.loggedSentencesOf(move.logged.filter(ReviewBarOutputUtil.recordClosesNoBar))}`
    + `${ReviewBarOutputUtil.closedReviewBarsText(move.closedReviewBars)}`;
  const document     = ReviewBarOutputUtil.ticketWithReviewBarAsJson(move.ticket, null, move.closedReviewBars);
  OutputUtil.printEntityThenNextLine(commandArguments, context, document, humanText, nextLine);

  // A warning, not a refusal: the order is advice to whoever picks work up, and the user may know better.
  if (targetStatus !== 'in-progress') return;
  if (unsettled.length > 0) {
    const notSettledYetText = `${unsettled.length === 1 ? 'which is' : 'which are'} not reviewed yet`;
    context.standardError(`Ticket #${id} is ${TicketPhraseUtil.waitingOnText(unsettled)}, ${notSettledYetText}.`);
  }
  if (move.ticket.frontmatter.hold !== undefined) {
    context.standardError(`Ticket #${id} is held; it was started anyway, and \`${PRODUCT_NAMES.PROGRAM} ticket unhold ${id}\` lifts the hold.`);
  }
}
