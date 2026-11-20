/**
 * `start [--started-by user|login-item] [--repository <path>] [--json]`: the board's Overseer, started detached as `open` starts it, with no
 * browser, after the start gate. With one live it starts nothing. It returns only once the Overseer's API answers, so a program that runs it
 * may use the API at once.
 */
import { Baton }                                                                  from '../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                                                        from '../../src/services/overseer/OverseerFiles.ts';
import { OperationRefusal }                                                       from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                                          from '../../src/shared/constants/ProductNames.ts';
import { boardStoreOf }                                                           from '../BoardStoreOf.ts';
import type { CommandHandler }                                                    from '../CommandHandler.ts';
import { requireCurrentInstall }                                                  from '../InstallVersionCheck.ts';
import { ProgramAnswerUtil }                                                      from '../utils/ProgramAnswerUtil.ts';
import { requireTheOverseerCanStartIn, startContextOf, startTheOverseerDetached } from './DetachedOverseerStart.ts';
import { OverseerRemote }                                                         from './OverseerRemote.ts';
import { startOriginIn }                                                          from './StartGateAdmission.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} start [--started-by user|login-item] [--repository <path>] [--port <n>] [--json]`;

const KNOWN_OPTION_NAMES = ['repository', 'port', 'json', 'started-by'];

const WHOLE_NUMBER_PATTERN = /^\d+$/;

const HIGHEST_PORT = 65535;

/** `--port` as `oversee --detach` passes it on; 0 binds any free port, which a spec uses so it never takes a board's own. */
function portArgumentsOf(written: string | undefined): string[] {
  if (written === undefined) return [];
  if (!WHOLE_NUMBER_PATTERN.test(written) || Number(written) > HIGHEST_PORT) {
    throw new OperationRefusal('refused', `"${written}" is not a port. Write a whole number from 0 to ${HIGHEST_PORT}, 0 for any free one.\n  Usage: ${USAGE}`);
  }
  return ['--port', written];
}

export const startCommand: CommandHandler = async (commandArguments, invokingContext) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const portArguments = portArgumentsOf(commandArguments.option('port'));
  const startOrigin = startOriginIn(commandArguments, USAGE);
  const context = startContextOf(commandArguments, invokingContext);
  requireCurrentInstall(context.currentDirectory);
  const { workspace, store } = boardStoreOf(context);
  const files = overseerFilesIn(workspace.trackerDirectory);
  const { trackerId } = store.reads.requireProgress();
  const started = Baton.newestBatonOf(context.platformPorts, files.overseerDirectory).verdict !== 'live';
  if (started) {
    requireTheOverseerCanStartIn(workspace.rootDirectory, context.platformPorts.gateConfinement);
    await startTheOverseerDetached({
      context, workspace, files, portArguments, startOrigin
    });
  }
  const live = Baton.newestBatonOf(context.platformPorts, files.overseerDirectory);
  if (live.verdict !== 'live') throw new OperationRefusal('refused', { kind: 'overseer-down', overseerDirectory: files.overseerDirectory });
  const identity = await OverseerRemote.identityOnceItAnswers(live.record);
  if (identity === null) throw new OperationRefusal('refused', { kind: 'overseer-not-answering', url: live.record.url });
  const { record, generation } = live;
  ProgramAnswerUtil.printAnswer(
    commandArguments,
    context,
    {
      started,
      url:            record.url,
      generation,
      trackerId,
      codeVersion:    record.codeVersion,
      installVersion: record.installVersion,
      contracts:      identity['contracts'] ?? {},
    },
    started ? `Overseer: started at ${record.url}; it keeps running after this command ends.` : `Overseer: already running at ${record.url}; nothing started.`,
  );
};
