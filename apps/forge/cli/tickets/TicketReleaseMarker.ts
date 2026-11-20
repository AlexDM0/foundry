/** `ticket release-of`: marks a ticket as its group's release ticket, or with `--clear` removes the mark. */
import { TicketJsonUtil }        from '../../src/adapters/utils/TicketJsonUtil.ts';
import type { ControlCommandOf } from '../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }      from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }         from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }    from '../ApplyCommandOfVerb.ts';
import type { CommandContext }   from '../CommandContext.ts';
import type { ArgumentParser }   from '../arguments/ArgumentParser.ts';
import { OutputUtil }            from '../utils/OutputUtil.ts';
import { TICKET_USAGE }          from './constants/TicketUsage.ts';

const RELEASE_OF_OPTION_NAMES = ['clear', 'at', 'json'];

export async function markOrClearReleaseTicket(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(RELEASE_OF_OPTION_NAMES, TICKET_USAGE);
  commandArguments.rejectExtraPositionals(2, TICKET_USAGE);

  const reference = commandArguments.positionals()[1];
  if (reference === undefined) {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} ticket release-of needs a ticket id.\n  Usage: ${TICKET_USAGE}`);
  }
  const clears = commandArguments.flag('clear');

  const command: ControlCommandOf<'ticket-release-of'> = { kind: 'ticket-release-of', ticketReference: reference, clears };
  const changed = (await applyCommandOfVerb(commandArguments, context, command)).result;

  OutputUtil.printEntity(commandArguments, context, TicketJsonUtil.ticketAsJson(changed.ticket), OutputUtil.loggedSentencesOf(changed.logged));
}
