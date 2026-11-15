/** `clear` asks on a terminal, then applies a `tracker-clear` command in a hold of its own, as the Bridge's control does. */
import { ControlService }          from '../../../src/services/control/ControlService.ts';
import type { ControlCommandOf }   from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }        from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }           from '../../../src/shared/constants/ProductNames.ts';
import { COMMAND_CONTROL_CONTEXT } from '../../CommandControlContext.ts';
import type { CommandHandler }     from '../../CommandHandler.ts';
import { openTrackerForWriting }   from '../../OpenTrackerForWriting.ts';
import { OutputUtil }              from '../../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} clear [--all] [--yes]`;

const KNOWN_OPTION_NAMES = ['all', 'yes', 'json'];

export const clearCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const deletesTickets = commandArguments.flag('all');
  const skipsQuestion  = commandArguments.flag('yes');

  if (!skipsQuestion) {
    // Fail closed off a terminal: prompting where nobody can answer is a hang, so the command refuses instead.
    if (!context.standardInputIsTerminal) {
      throw new OperationRefusal(
        'refused',
        `${PRODUCT_NAMES.PROGRAM} clear needs --yes when standard input is not a terminal, because there is nobody to answer the confirmation.`,
      );
    }
    const question = deletesTickets
      ? 'Delete every task row, the log, every ticket, every epic and every picture in this tracker? [y/N]'
      : 'Delete every task row and the log, keeping the tickets? [y/N]';
    if (!await context.confirm(question)) {
      context.standardOutput('Nothing was cleared.');
      return;
    }
  }

  const command: ControlCommandOf<'tracker-clear'> = { kind: 'tracker-clear', scope: deletesTickets ? 'everything' : 'tasks-and-log' };
  const summary = await openTrackerForWriting(commandArguments, context, (change) => ControlService.apply(command, change, COMMAND_CONTROL_CONTEXT).result);

  const ticketLine = deletesTickets
    ? `${summary.deletedTicketCount} ticket(s) and ${summary.deletedEpicCount} epic(s) deleted`
    : `${summary.reseededTicketCount} ticket(s) re-seeded`;
  OutputUtil.printEntity(
    commandArguments,
    context,
    {
      removedTaskCount:    summary.removedTaskCount,
      removedLogCount:     summary.removedLogCount,
      deletedTicketCount:  summary.deletedTicketCount,
      deletedEpicCount:    summary.deletedEpicCount,
      reseededTicketCount: summary.reseededTicketCount,
    },
    `Tracker cleared: ${summary.removedTaskCount} task row(s) and ${summary.removedLogCount} log entr(ies) removed, ${ticketLine}.`,
  );
};
