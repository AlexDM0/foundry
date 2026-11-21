/**
 * `stop [--now] [--json]`: stops the live Hephaestus. It skips the install version check, so a Hephaestus whose install changed can still be
 * stopped.
 */
import { hephaestusFilesIn }   from '../../src/services/hephaestus/HephaestusFiles.ts';
import { requireWorkspace }    from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }       from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler } from '../CommandHandler.ts';
import { hatchWhenUnderJob }   from '../HatchUnderJob.ts';
import { ProgramAnswerUtil }   from '../utils/ProgramAnswerUtil.ts';
import { stopHephaestus }      from './HephaestusStop.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} stop [--now] [--json]`;

const KNOWN_OPTION_NAMES = ['now', 'json'];

export const stopCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const now = commandArguments.flag('now');
  await hatchWhenUnderJob(context, { kind: 'hephaestus-stop', now });
  const workspace = requireWorkspace(context.currentDirectory);
  const { entity, humanLine } = await stopHephaestus({ commandArguments, context, workspace }, hephaestusFilesIn(workspace.trackerDirectory), now);
  ProgramAnswerUtil.printAnswer(commandArguments, context, entity, humanLine);
};
