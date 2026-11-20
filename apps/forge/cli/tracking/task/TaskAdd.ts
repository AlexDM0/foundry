/** `task add`: files a row, linked to a ticket it works or reviews, and starts it at once with `--start`. */
import { ControlService }                        from '../../../src/services/control/ControlService.ts';
import type { ControlCommandOf }                 from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                      from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                         from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                   from '../../CommandContext.ts';
import { commandControlContextOf }               from '../../CommandControlContext.ts';
import { openTrackerForWritingThenReadNextLine } from '../../OpenTrackerForWriting.ts';
import type { ArgumentParser }                   from '../../arguments/ArgumentParser.ts';
import { OptionValueUtil }                       from '../../utils/OptionValueUtil.ts';
import { OutputUtil }                            from '../../utils/OutputUtil.ts';
import { TASK_USAGE }                            from './TaskArguments.ts';

const ADD_OPTION_NAMES = ['owner', 'note', 'ticket', 'review-of', 'start', 'at', 'tokens', 'force', 'json'];

export async function addOneTask(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(ADD_OPTION_NAMES, TASK_USAGE);
  commandArguments.rejectExtraPositionals(2, TASK_USAGE);

  const name = commandArguments.positionals()[1];
  if (name === undefined || name.trim() === '') {
    throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} task add needs a name.\n  Usage: ${TASK_USAGE}`);
  }
  const ticketReference   = commandArguments.option('ticket');
  const reviewedReference = commandArguments.option('review-of');
  const owner             = commandArguments.option('owner');
  const note              = commandArguments.option('note');
  const tokens            = OptionValueUtil.tokenCountFrom(commandArguments);
  const startsNow         = commandArguments.flag('start');
  const movesTheLink      = commandArguments.flag('force');

  const command: ControlCommandOf<'task-add'> = {
    kind: 'task-add',
    name,
    startsNow,
    movesTheLink,
    ...(ticketReference === undefined ? {} : { ticketReference }),
    ...(reviewedReference === undefined ? {} : { reviewOfReference: reviewedReference }),
    ...(owner === undefined ? {} : { owner }),
    ...(note === undefined ? {} : { note }),
    ...(tokens === undefined ? {} : { tokens }),
  };
  const { result: task, nextLine } = await openTrackerForWritingThenReadNextLine(
    commandArguments,
    context,
    (change) => ControlService.apply(command, change, commandControlContextOf(context.platformPorts)).result,
  );

  const humanLine = `Task #${task.id} added: ${task.name}`;
  // Only a row started as it is added takes a slot; a pending one moves nothing the Next line reads.
  if (startsNow) {
    OutputUtil.printEntityThenNextLine(commandArguments, context, task, humanLine, nextLine);
  } else {
    OutputUtil.printEntity(commandArguments, context, task, humanLine);
  }
}
