/** `ticket hold` and `ticket unhold`, and the hint an unhold prints about a build it left paused. */
import { TicketJsonUtil }                     from '../../src/adapters/utils/TicketJsonUtil.ts';
import type { Task }                          from '../../src/domain/tracker-model/@types/Task.ts';
import { OperationRefusal }                   from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                      from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerbThenReadNextLine } from '../ApplyCommandOfVerb.ts';
import type { CommandContext }                from '../CommandContext.ts';
import { hatchWhenUnderJob }                  from '../HatchUnderJob.ts';
import type { ArgumentParser }                from '../arguments/ArgumentParser.ts';
import { OutputUtil }                         from '../utils/OutputUtil.ts';
import { TICKET_USAGE }                       from './constants/TicketUsage.ts';

const HOLD_OPTION_NAMES   = ['reason', 'at', 'json'];
const UNHOLD_OPTION_NAMES = ['at', 'json'];

// Hephaestus launches jobs and never takes over a paused row, so a paused build row is a person's, resumed by hand.
function resumeBuildHintFor(pausedRow: Readonly<Task>): string {
  return `Its build row #${pausedRow.id} was left paused, which Hephaestus never takes over: `
    + `resume it with \`${PRODUCT_NAMES.PROGRAM} task start ${pausedRow.id}\`, or settle the row by hand.`;
}

/** A hold stops Hephaestus starting the ticket's next builder or reviewer; an agent already running is never interrupted by it. */
export async function holdOrUnholdTicket(holds: boolean, commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const verb = holds ? 'hold' : 'unhold';
  commandArguments.rejectUnknownOptions(holds ? HOLD_OPTION_NAMES : UNHOLD_OPTION_NAMES, TICKET_USAGE);
  commandArguments.rejectExtraPositionals(2, TICKET_USAGE);

  const reference = commandArguments.positionals()[1];
  if (reference === undefined) {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} ticket ${verb} needs a ticket id.\n  Usage: ${TICKET_USAGE}`);
  }
  const reason = commandArguments.option('reason') ?? '';
  const holdCommand = holds ? { kind: 'ticket-hold' as const, ticketReference: reference, reason } : { kind: 'ticket-unhold' as const, ticketReference: reference };
  await hatchWhenUnderJob(context, holdCommand);

  const { written, nextLine } = await applyCommandOfVerbThenReadNextLine(commandArguments, context, holdCommand);
  const holdChange      = written.result;
  // Read from the board this write left, only to print.
  const pausedRow       = holds ? null : written.board.pausedBuildRowOf(holdChange.ticket.frontmatter.id);
  const resumeBuildHint = pausedRow === null ? null : resumeBuildHintFor(pausedRow);
  const closingLines    = resumeBuildHint === null ? nextLine : `${nextLine}\n${resumeBuildHint}`;
  OutputUtil.printEntityThenNextLine(
    commandArguments,
    context,
    TicketJsonUtil.ticketAsJson(holdChange.ticket),
    OutputUtil.loggedSentencesOf(holdChange.logged),
    closingLines,
  );
}
