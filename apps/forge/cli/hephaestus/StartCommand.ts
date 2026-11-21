/**
 * `start` in its three forms. Bare, it starts the board's Hephaestus detached after the start gate, starts nothing with one live, and returns
 * only once Hephaestus's API answers, so a program that runs it may use the API at once. `--foreground` is the serving process itself, which
 * the detached child runs; `--successor-of <generation>` is the successor's side of a Baton pass.
 */
import { Baton }                                                                from '../../src/services/hephaestus/Baton.ts';
import { hephaestusFilesIn }                                                    from '../../src/services/hephaestus/HephaestusFiles.ts';
import type { HephaestusPortChoice }                                            from '../../src/services/hephaestus/HephaestusPort.ts';
import { OperationRefusal }                                                     from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                                        from '../../src/shared/constants/ProductNames.ts';
import { boardStoreOf }                                                         from '../BoardStoreOf.ts';
import type { CommandContext }                                                  from '../CommandContext.ts';
import type { CommandHandler }                                                  from '../CommandHandler.ts';
import { requireCurrentInstall }                                                from '../InstallVersionCheck.ts';
import type { ArgumentParser }                                                  from '../arguments/ArgumentParser.ts';
import { ProgramAnswerUtil }                                                    from '../utils/ProgramAnswerUtil.ts';
import { requireHephaestusCanStartIn, startContextOf, startHephaestusDetached } from './DetachedHephaestusStart.ts';
import { runHephaestusInTheForeground }                                         from './HephaestusForeground.ts';
import { HephaestusRemote }                                                     from './HephaestusRemote.ts';
import { startOriginIn }                                                        from './StartGateAdmission.ts';

const { PROGRAM } = PRODUCT_NAMES;

const DETACHED_USAGE   = `${PROGRAM} start [--repository <path>] [--port <n>] [--started-by user] [--json]`;
const FOREGROUND_USAGE = `${PROGRAM} start --foreground [--repository <path>] [--port <n>] [--started-by user]`;
const SUCCESSOR_USAGE  = `${PROGRAM} start --successor-of <generation> [--port <n>]`;

const FOREGROUND_OPTION   = 'foreground';
const SUCCESSOR_OF_OPTION = 'successor-of';

const DETACHED_OPTION_NAMES   = ['repository', 'port', 'started-by', 'json'];
const FOREGROUND_OPTION_NAMES = [FOREGROUND_OPTION, 'repository', 'port', 'started-by'];
/** `--started-by` is known here so its refusal can say why a successor takes none. */
const SUCCESSOR_OPTION_NAMES  = [SUCCESSOR_OF_OPTION, 'port', 'started-by'];
/** Every option some form takes: an option of no form is refused before the form is told, and each form then refuses another form's. */
const EVERY_FORM_OPTION_NAMES = [...new Set([...DETACHED_OPTION_NAMES, ...FOREGROUND_OPTION_NAMES, ...SUCCESSOR_OPTION_NAMES])];

const WHOLE_NUMBER_PATTERN = /^\d+$/;

const HIGHEST_PORT = 65535;

/** `--port` as written, `undefined` when absent; 0 binds any free port, which a spec uses so it never takes a board's own. */
function writtenPortOf(commandArguments: ArgumentParser, usage: string): number | undefined {
  const written = commandArguments.option('port');
  if (written === undefined) return undefined;
  const port = WHOLE_NUMBER_PATTERN.test(written) ? Number(written) : Number.NaN;
  if (!Number.isSafeInteger(port) || port > HIGHEST_PORT) {
    throw new OperationRefusal('refused', `"${written}" is not a port. Write a whole number from 0 to ${HIGHEST_PORT}, 0 for any free one.\n  Usage: ${usage}`);
  }
  return port;
}

/** The generation a successor takes the board over from; only the old Hephaestus passes it, when it spawns its successor. */
function successorOfIn(commandArguments: ArgumentParser): number {
  const written = commandArguments.option(SUCCESSOR_OF_OPTION) ?? '';
  if (!WHOLE_NUMBER_PATTERN.test(written) || !Number.isSafeInteger(Number(written))) {
    throw new OperationRefusal('refused', `"${written}" is not a Baton generation. Write a whole number.\n  Usage: ${SUCCESSOR_USAGE}`);
  }
  return Number(written);
}

async function serveInTheForeground(commandArguments: ArgumentParser, context: CommandContext, usage: string, successorOf?: number): Promise<void> {
  const startOrigin = startOriginIn(commandArguments, usage);
  const writtenPort = writtenPortOf(commandArguments, usage);
  // A successor checks the manifest against its own install version as a Baton pass step, so a mismatch is reported as the Baton pass's failure.
  if (successorOf === undefined) requireCurrentInstall(context.currentDirectory);
  requireHephaestusCanStartIn(context.currentDirectory, context.platformPorts.gateConfinement);
  const { workspace, store } = boardStoreOf(context);
  const portChoice: HephaestusPortChoice = writtenPort === undefined
    ? { kind: 'preferred', trackerId: store.reads.requireProgress().trackerId }
    : { kind: 'given', port: writtenPort };
  await runHephaestusInTheForeground({
    commandArguments, context, workspace, portChoice, startOrigin, ...(successorOf === undefined ? {} : { successorOf })
  });
}

async function startAsASuccessor(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(SUCCESSOR_OPTION_NAMES, SUCCESSOR_USAGE);
  commandArguments.rejectExtraPositionals(0, SUCCESSOR_USAGE);
  const successorOf = successorOfIn(commandArguments);
  if (commandArguments.option('started-by') !== undefined) {
    const sentence = 'A successor is started by the Hephaestus it takes over from, so --started-by cannot go with --successor-of.';
    throw new OperationRefusal('refused', `${sentence}\n  Usage: ${SUCCESSOR_USAGE}`);
  }
  await serveInTheForeground(commandArguments, context, SUCCESSOR_USAGE, successorOf);
}

async function startInTheForeground(commandArguments: ArgumentParser, invokingContext: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(FOREGROUND_OPTION_NAMES, FOREGROUND_USAGE);
  commandArguments.rejectExtraPositionals(0, FOREGROUND_USAGE);
  await serveInTheForeground(commandArguments, startContextOf(commandArguments, invokingContext), FOREGROUND_USAGE);
}

async function startDetached(commandArguments: ArgumentParser, invokingContext: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(DETACHED_OPTION_NAMES, DETACHED_USAGE);
  commandArguments.rejectExtraPositionals(0, DETACHED_USAGE);
  const writtenPort = writtenPortOf(commandArguments, DETACHED_USAGE);
  const portArguments = writtenPort === undefined ? [] : ['--port', String(writtenPort)];
  const startOrigin = startOriginIn(commandArguments, DETACHED_USAGE);
  const context = startContextOf(commandArguments, invokingContext);
  requireCurrentInstall(context.currentDirectory);
  const { workspace, store } = boardStoreOf(context);
  const files = hephaestusFilesIn(workspace.trackerDirectory);
  const { trackerId } = store.reads.requireProgress();
  const started = Baton.newestBatonOf(context.platformPorts, files.hephaestusDirectory).verdict !== 'live';
  if (started) {
    requireHephaestusCanStartIn(workspace.rootDirectory, context.platformPorts.gateConfinement);
    await startHephaestusDetached({
      context, workspace, files, portArguments, startOrigin
    });
  }
  const live = Baton.newestBatonOf(context.platformPorts, files.hephaestusDirectory);
  if (live.verdict !== 'live') throw new OperationRefusal('refused', { kind: 'hephaestus-down', hephaestusDirectory: files.hephaestusDirectory });
  const identity = await HephaestusRemote.identityOnceItAnswers(live.record);
  if (identity === null) throw new OperationRefusal('refused', { kind: 'hephaestus-not-answering', url: live.record.url });
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
    started ? `Hephaestus: started at ${record.url}; it keeps running after this command ends.` : `Hephaestus: already running at ${record.url}; nothing started.`,
  );
}

export const startCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(EVERY_FORM_OPTION_NAMES, DETACHED_USAGE);
  if (commandArguments.flag(SUCCESSOR_OF_OPTION) || commandArguments.option(SUCCESSOR_OF_OPTION) !== undefined) {
    await startAsASuccessor(commandArguments, context);
    return;
  }
  if (commandArguments.flag(FOREGROUND_OPTION)) {
    await startInTheForeground(commandArguments, context);
    return;
  }
  await startDetached(commandArguments, context);
};
