/** `ticket entity`: names the entity whose pipeline builds a ticket, in a forge with entities, and says why; the reason goes to the log. */
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

const ENTITY_OPTION_NAMES = ['reason', 'at', 'json'];

export async function setTicketEntity(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(ENTITY_OPTION_NAMES, TICKET_USAGE);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT, TICKET_USAGE);

  const [, reference, entity] = commandArguments.positionals();
  const reason                = commandArguments.option('reason');
  if (reference === undefined || entity === undefined || reason === undefined) {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} ticket entity needs a ticket id, an entity key and --reason.\n  Usage: ${TICKET_USAGE}`);
  }

  const command: ControlCommandOf<'ticket-entity'> = {
    kind: 'ticket-entity', ticketReference: reference, entity, reason
  };
  await hatchWhenUnderJob(context, command);
  const changed = await openTrackerForWriting(commandArguments, context, (change) => ControlService.apply(command, change, commandControlContextOf(context.platformPorts)).result);

  OutputUtil.printEntity(commandArguments, context, TicketJsonUtil.ticketAsJson(changed.ticket), OutputUtil.loggedSentencesOf(changed.logged));
}
