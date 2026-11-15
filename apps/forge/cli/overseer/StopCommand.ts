/** `stop [--now] [--json]`: `oversee stop` under the short name, beside `start`, for a program that runs both. */
import { overseerFilesIn }     from '../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }    from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }       from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler } from '../CommandHandler.ts';
import { ProgramAnswerUtil }   from '../utils/ProgramAnswerUtil.ts';
import { stopTheOverseer }     from './OverseerStop.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} stop [--now] [--json]`;

const KNOWN_OPTION_NAMES = ['now', 'json'];

export const stopCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const now = commandArguments.flag('now');
  const workspace = requireWorkspace(context.currentDirectory);
  const { entity, humanLine } = await stopTheOverseer({ commandArguments, context, workspace }, overseerFilesIn(workspace.trackerDirectory), now);
  ProgramAnswerUtil.printAnswer(commandArguments, context, entity, humanLine);
};
