/** `talos-restart [--json]`: the clean restart of the board's Talos, asked of the live Hephaestus; a session under a job is refused it before it runs. */
import { hephaestusFilesIn }                                 from '../../src/services/hephaestus/HephaestusFiles.ts';
import { requireWorkspace }                                  from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                     from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }                               from '../CommandHandler.ts';
import { HephaestusRemote, type TalosRestartRequestOutcome } from '../HephaestusRemote.ts';
import { OutputUtil }                                        from '../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} talos-restart [--json]`;

/** Human lines of the outcome; `--json` prints the outcome itself. */
const TALOS_RESTART_LINES: Readonly<Record<TalosRestartRequestOutcome, string>> = {
  'done':          'Talos was asked to quit cleanly; Hephaestus starts the next Talos, and the paused agents resume by themselves.',
  'nothing-to-do': 'No Talos took the restart: none runs, or it is quitting already.',
  'not-taken':     'No live Hephaestus took the restart, so Talos was not restarted.',
};

export const talosRestartCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const workspace = requireWorkspace(context.currentDirectory);
  const outcome = await HephaestusRemote.restartTheTalosOf(context.platformPorts, hephaestusFilesIn(workspace.trackerDirectory));
  OutputUtil.printEntity(commandArguments, context, { outcome }, TALOS_RESTART_LINES[outcome]);
};
