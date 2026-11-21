/**
 * `restart [--now] [--json]`: the checked Baton pass to the code on disk; a failed one exits 1 `baton-pass-failed` with the old Hephaestus still
 * driving. A Hephaestus whose API does not take the command is stopped and started again, and with none live one is started.
 */
import { hephaestusFilesIn }             from '../../src/services/hephaestus/HephaestusFiles.ts';
import { requireWorkspace }              from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                 from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }           from '../CommandHandler.ts';
import { hatchWhenUnderJob }             from '../HatchUnderJob.ts';
import { OutputUtil }                    from '../utils/OutputUtil.ts';
import { HephaestusRemote }              from './HephaestusRemote.ts';
import { stopAndCloseTheLiveHephaestus } from './HephaestusStop.ts';
import { startOriginArgumentsOf }        from './StartGateAdmission.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} restart [--now] [--json]`;

const KNOWN_OPTION_NAMES = ['now', 'json'];

export const restartCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const now = commandArguments.flag('now');
  await hatchWhenUnderJob(context, { kind: 'hephaestus-restart', now });
  const workspace = requireWorkspace(context.currentDirectory);
  const files     = hephaestusFilesIn(workspace.trackerDirectory);
  const batonPass = await HephaestusRemote.handOverTheLiveHephaestus(context.platformPorts, files, now);
  if (batonPass.verdict === 'baton-passed') {
    OutputUtil.printEntity(commandArguments, context, { outcome: 'done', url: batonPass.url, codeVersion: batonPass.successorCodeVersion },
      `Hephaestus handed over to code ${batonPass.successorCodeVersion} at ${batonPass.url}`);
    return;
  }
  // A Baton already dead at the hand-over is read again here, so its port is kept and it is closed.
  const stopped = await stopAndCloseTheLiveHephaestus({ commandArguments, context, workspace }, files, now);
  // The successor keeps the port the Hephaestus it replaces had, also one found dead, so its URL stays the one people opened.
  const record        = stopped.verdict === 'was-down' ? null : stopped.record;
  const portArguments = record === null ? [] : ['--port', String(record.port)];
  // The user's restart serves whatever the stop left; the detached child runs the start gate and records its kind.
  const url = await HephaestusRemote.startDetached(context, workspace.rootDirectory, files, [...portArguments, ...startOriginArgumentsOf('user')]);
  OutputUtil.printEntity(commandArguments, context, { outcome: 'done', url }, `Hephaestus restarted at ${url}`);
};
