/** `ticket group`: puts a ticket that has no group into one, a started ticket too, so its next landing goes to the group's branch. */
import { TicketJsonUtil }                                 from '../../src/adapters/utils/TicketJsonUtil.ts';
import { ControlService }                                 from '../../src/services/control/ControlService.ts';
import type { ControlCommandOf }                          from '../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                               from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                  from '../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                            from '../CommandContext.ts';
import { commandControlContextOf }                        from '../CommandControlContext.ts';
import { hatchWhenUnderJob }                              from '../HatchUnderJob.ts';
import { openTrackerForWriting }                          from '../OpenTrackerForWriting.ts';
import type { ArgumentParser }                            from '../arguments/ArgumentParser.ts';
import { SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT } from '../arguments/constants/SubcommandPositionalCounts.ts';
import { OutputUtil }                                     from '../utils/OutputUtil.ts';
import { TICKET_USAGE }                                   from './constants/TicketUsage.ts';

const GROUP_OPTION_NAMES = ['at', 'json'];

export async function setTicketGroup(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(GROUP_OPTION_NAMES, TICKET_USAGE);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT, TICKET_USAGE);

  const [, reference, group] = commandArguments.positionals();
  if (reference === undefined || group === undefined) {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} ticket group needs a ticket id and a group name.\n  Usage: ${TICKET_USAGE}`);
  }

  const command: ControlCommandOf<'ticket-group'> = { kind: 'ticket-group', ticketReference: reference, group };
  await hatchWhenUnderJob(context, command);
  const changed = await openTrackerForWriting(commandArguments, context, (change) => ControlService.apply(command, change, commandControlContextOf(context.platformPorts)).result);

  OutputUtil.printEntity(commandArguments, context, TicketJsonUtil.ticketAsJson(changed.ticket), OutputUtil.loggedSentencesOf(changed.logged));
}
