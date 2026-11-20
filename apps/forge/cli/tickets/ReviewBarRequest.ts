/** The review bar `ticket rereview --start-review` asks to open for the ticket's next reviewer, as its options name it. */
import type { AgentAssignment } from '../../src/lib/tracker-model/@types/BoardChanges.ts';
import { OperationRefusal }     from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }        from '../../src/shared/constants/ProductNames.ts';
import type { ArgumentParser }  from '../arguments/ArgumentParser.ts';
import { TICKET_USAGE }         from './constants/TicketUsage.ts';

export const REVIEW_BAR_OPTION_NAMES = ['start-review', 'owner', 'note'];

export function reviewBarRequestFrom(commandArguments: ArgumentParser, subcommand: string): AgentAssignment | null {
  const owner = commandArguments.option('owner');
  const note  = commandArguments.option('note');
  if (!commandArguments.flag('start-review')) {
    if (owner !== undefined || note !== undefined) {
      throw new OperationRefusal(
        'refused',
        `--owner and --note name the review bar, so \`${PRODUCT_NAMES.PROGRAM} ticket ${subcommand}\` takes them only with --start-review.\n  Usage: ${TICKET_USAGE}`,
      );
    }
    return null;
  }
  return {
    ...(owner === undefined ? {} : { owner }),
    ...(note === undefined ? {} : { note }),
  };
}
