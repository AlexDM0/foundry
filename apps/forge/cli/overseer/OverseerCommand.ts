/**
 * `oversee` and its subcommands. Starting, restarting, pausing and resuming check the install version; `oversee status` and `oversee stop` do not,
 * so an Overseer whose install changed can still be inspected and stopped.
 */
import { readingBoardOf }                                                         from '../../src/lib/tracker-model/ReadingBoard.ts';
import { Baton }                                                                  from '../../src/services/overseer/Baton.ts';
import { CodeVersion }                                                            from '../../src/services/overseer/CodeVersion.ts';
import { overseerFilesIn, type OverseerFiles }                                    from '../../src/services/overseer/OverseerFiles.ts';
import type { OverseerPortChoice }                                                from '../../src/services/overseer/OverseerPort.ts';
import { PresenceStatus }                                                         from '../../src/services/overseer/PresenceStatus.ts';
import { requireWorkspace }                                                       from '../../src/services/tracker/Workspace.ts';
import type { ControlCommandOf }                                                  from '../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                                                       from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                                          from '../../src/shared/constants/ProductNames.ts';
import { applyCommandOfVerb }                                                     from '../ApplyCommandOfVerb.ts';
import { boardStoreOf }                                                           from '../BoardStoreOf.ts';
import type { CommandContext }                                                    from '../CommandContext.ts';
import type { CommandHandler }                                                    from '../CommandHandler.ts';
import { hatchWhenUnderJob }                                                      from '../HatchUnderJob.ts';
import { requireCurrentInstall }                                                  from '../InstallVersionCheck.ts';
import type { ArgumentParser }                                                    from '../arguments/ArgumentParser.ts';
import { OutputUtil }                                                             from '../utils/OutputUtil.ts';
import { requireTheOverseerCanStartIn, startContextOf, startTheOverseerDetached } from './DetachedOverseerStart.ts';
import { type StoppedOverseerRequest, runOverseerInTheForeground }                from './OverseerForeground.ts';
import {
  OverseerRemote,
  type RuntimeStopKind,
  type StopOutcome,
  type TalosRestartRequestOutcome
} from './OverseerRemote.ts';
import { stopAndCloseTheLiveOverseer, stopTheOverseer } from './OverseerStop.ts';
import { OverseerWording }                              from './OverseerWording.ts';
import { PresenceWording }                              from './PresenceWording.ts';
import { startOriginArgumentsOf, startOriginIn }        from './StartGateAdmission.ts';

const { PROGRAM } = PRODUCT_NAMES;

const START_USAGE     = `${PROGRAM} oversee [--started-by user|login-item] [--port <n>] [--detach] [--repository <path>] [--json]`;
const SUCCESSOR_USAGE = `${PROGRAM} oversee --successor-of <generation> [--port <n>]`;
const STOP_USAGE    = `${PROGRAM} oversee stop|restart [--now] [--json]`;
const PAUSE_USAGE   = `${PROGRAM} oversee pause|resume [--json]`;
const STATUS_USAGE  = `${PROGRAM} oversee status [--json]`;
const TALOS_RESTART_USAGE = `${PROGRAM} oversee talos-restart [--json]`;

const HIGHEST_PORT          = 65535;
const WHOLE_NUMBER_PATTERN  = /^\d+$/;

type RunSubcommand = (commandArguments: ArgumentParser, context: CommandContext) => Promise<void>;

function portChoiceOf(commandArguments: ArgumentParser, trackerId: string): OverseerPortChoice {
  const written = commandArguments.option('port');
  if (written === undefined) return { kind: 'preferred', trackerId };
  const port = WHOLE_NUMBER_PATTERN.test(written) ? Number(written) : Number.NaN;
  if (!Number.isSafeInteger(port) || port > HIGHEST_PORT) {
    throw new OperationRefusal('refused', `"${written}" is not a port. Write a whole number from 0 to ${HIGHEST_PORT}, 0 for any free one.\n  Usage: ${START_USAGE}`);
  }
  return { kind: 'given', port };
}

/** The generation a successor takes the board over from; only the old Overseer passes it, when it spawns its successor. */
function successorOfIn(commandArguments: ArgumentParser): number | undefined {
  const written = commandArguments.option('successor-of');
  if (written === undefined) return undefined;
  if (!WHOLE_NUMBER_PATTERN.test(written) || !Number.isSafeInteger(Number(written))) {
    throw new OperationRefusal('refused', `"${written}" is not a Baton generation. Write a whole number.\n  Usage: ${SUCCESSOR_USAGE}`);
  }
  return Number(written);
}

async function startOverseer(commandArguments: ArgumentParser, invokingContext: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(['port', 'detach', 'json', 'successor-of', 'repository', 'started-by'], START_USAGE);
  commandArguments.rejectExtraPositionals(0, START_USAGE);
  const context = startContextOf(commandArguments, invokingContext);
  const successorOf = successorOfIn(commandArguments);
  if (successorOf !== undefined && commandArguments.option('started-by') !== undefined) {
    throw new OperationRefusal('refused', `A successor is started by the Overseer it takes over from, so --started-by cannot go with --successor-of.\n  Usage: ${SUCCESSOR_USAGE}`);
  }
  const startOrigin = startOriginIn(commandArguments, START_USAGE);
  // A successor checks the manifest against its own install version as a Baton pass step, so a mismatch is reported as the Baton pass's failure.
  if (successorOf === undefined) requireCurrentInstall(context.currentDirectory);
  requireTheOverseerCanStartIn(context.currentDirectory, context.platformPorts.gateConfinement);
  const { workspace, store } = boardStoreOf(context);
  const portChoice = portChoiceOf(commandArguments, store.reads.requireProgress().trackerId);
  if (!commandArguments.flag('detach')) {
    await runOverseerInTheForeground({
      commandArguments, context, workspace, portChoice, startOrigin, ...(successorOf === undefined ? {} : { successorOf })
    });
    return;
  }
  const portArguments = portChoice.kind === 'given' ? ['--port', String(portChoice.port)] : [];
  const url = await startTheOverseerDetached({
    context, workspace, files: overseerFilesIn(workspace.trackerDirectory), portArguments, startOrigin
  });
  OutputUtil.printEntity(commandArguments, context, { url }, url);
}

function stopSubcommand(kind: RuntimeStopKind): RunSubcommand {
  return async (commandArguments, context) => {
    commandArguments.rejectUnknownOptions(['now', 'json'], STOP_USAGE);
    commandArguments.rejectExtraPositionals(1, STOP_USAGE);
    const now = commandArguments.flag('now');
    await hatchWhenUnderJob(context, { kind, now });
    if (kind === 'overseer-restart') requireCurrentInstall(context.currentDirectory);
    const workspace = requireWorkspace(context.currentDirectory);
    const files     = overseerFilesIn(workspace.trackerDirectory);
    if (kind === 'overseer-restart') {
      await restartTheOverseer({ commandArguments, context, workspace }, files, now);
      return;
    }
    const { entity, humanLine } = await stopTheOverseer({ commandArguments, context, workspace }, files, now);
    OutputUtil.printEntity(commandArguments, context, entity, humanLine);
  };
}

/**
 * The checked Baton pass to the code on disk; a failed one exits 1 `baton-pass-failed` with the old Overseer still driving. An Overseer whose
 * API does not take the command is stopped and started again, and with none live one is started.
 */
async function restartTheOverseer(request: StoppedOverseerRequest, files: OverseerFiles, now: boolean): Promise<void> {
  const { commandArguments, context, workspace } = request;
  const batonPass = await OverseerRemote.handOverTheLiveOverseer(context.platformPorts, files, now);
  if (batonPass.verdict === 'baton-passed') {
    OutputUtil.printEntity(commandArguments, context, { outcome: 'done', url: batonPass.url, codeVersion: batonPass.successorCodeVersion },
      `Overseer handed over to code ${batonPass.successorCodeVersion} at ${batonPass.url}`);
    return;
  }
  // A Baton already dead at the hand-over is read again here, so its port is kept and it is closed.
  const stopped = await stopAndCloseTheLiveOverseer(request, files, now);
  // The user's restart serves whatever the stop left; the detached child runs the start gate and records its kind.
  const url    = await OverseerRemote.startDetached(context, workspace.rootDirectory, files, [...successorPortArgumentsOf(stopped), ...startOriginArgumentsOf('user')]);
  OutputUtil.printEntity(commandArguments, context, { outcome: 'done', url }, `Overseer restarted at ${url}`);
}

/** The successor keeps the port the Overseer it replaces had, also one found dead, so its URL stays the one people opened. */
function successorPortArgumentsOf(stopped: StopOutcome): string[] {
  const record = stopped.verdict === 'was-down' ? null : stopped.record;
  return record === null ? [] : ['--port', String(record.port)];
}

function pauseSubcommand(kind: 'overseer-pause' | 'overseer-resume'): RunSubcommand {
  return async (commandArguments, context) => {
    commandArguments.rejectUnknownOptions(['json'], PAUSE_USAGE);
    commandArguments.rejectExtraPositionals(1, PAUSE_USAGE);
    const command: ControlCommandOf<typeof kind> = { kind };
    await hatchWhenUnderJob(context, command);
    requireCurrentInstall(context.currentDirectory);
    const { logged, previousState } = (await applyCommandOfVerb(commandArguments, context, command)).result;
    const overseerState = kind === 'overseer-pause' ? 'paused' : 'running';
    OutputUtil.printEntity(commandArguments, context, { overseerState, previousState }, `${OutputUtil.loggedSentencesOf(logged)} (was ${previousState}).`);
  };
}

/** Human lines of a Talos restart's outcome; `--json` prints the outcome itself. */
const TALOS_RESTART_LINES: Readonly<Record<TalosRestartRequestOutcome, string>> = {
  'done':          'Talos was asked to quit cleanly; the Overseer starts the next Talos, and the paused agents resume by themselves.',
  'nothing-to-do': 'No Talos took the restart: none runs, or it is quitting already.',
  'not-taken':     'No live Overseer took the restart, so Talos was not restarted.',
};

/** The clean restart of the board's Talos, asked of the live Overseer; a session under a job is refused this verb before it runs. */
async function restartTalos(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(['json'], TALOS_RESTART_USAGE);
  commandArguments.rejectExtraPositionals(1, TALOS_RESTART_USAGE);
  const workspace = requireWorkspace(context.currentDirectory);
  const outcome = await OverseerRemote.restartTheTalosOf(context.platformPorts, overseerFilesIn(workspace.trackerDirectory));
  OutputUtil.printEntity(commandArguments, context, { outcome }, TALOS_RESTART_LINES[outcome]);
}

/** Read-only and lockless: the Baton, the stored drain flag and the code on disk, which the live Overseer's Baton says it runs. */
async function printOverseerStatus(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(['json'], STATUS_USAGE);
  commandArguments.rejectExtraPositionals(1, STATUS_USAGE);
  const { workspace, store } = boardStoreOf(context);
  const storedOverseerState = readingBoardOf(store.reads.requireProgress(), [], []).overseerState();
  const newest          = Baton.newestBatonOf(context.platformPorts, overseerFilesIn(workspace.trackerDirectory).overseerDirectory);
  const codeVersionOnDisk = CodeVersion.onDisk();
  const live            = newest.verdict === 'live' ? newest : null;
  const overseerState     = live === null ? null : OverseerWording.overseerStateOf(await OverseerRemote.stateOf(live.record));
  const state           = live === null ? 'down' : overseerState?.runtimeState ?? (await OverseerRemote.identityAnswers(live.record) ? 'serving' : 'starting');
  const presenceReading = PresenceStatus.readingOf(
    { ports: context.platformPorts, files: overseerFilesIn(workspace.trackerDirectory), workspace },
    live === null ? null : { generation: live.generation, answersAlready: state !== 'starting' },
  );
  const entity = {
    state,
    paused:              storedOverseerState === 'paused',
    url:                 live?.record.url ?? null,
    baton:               live === null ? null : { generation: live.generation, ...live.record },
    codeVersionOnDisk,
    codeVersionInMemory: live?.record.codeVersion ?? null,
    notices:             overseerState?.notices ?? [],
    batonPassWarning:    overseerState?.batonPassWarning ?? null,
    presence:            presenceReading.presence,
  };
  const pausedText = entity.paused ? 'paused' : 'not paused';
  const lines = live === null
    ? [
      ...(presenceReading.crash === null ? [] : [PresenceWording.offAfterACrashLineOf(presenceReading.crash, presenceReading.presence.crashLog)]),
      `overseer: down; ${pausedText}`,
      `code on disk: ${codeVersionOnDisk}`,
    ]
    : [
      `overseer: ${state} at ${live.record.url}, process ${live.record.processId}, Baton ${live.generation}; ${pausedText}`,
      `code on disk: ${codeVersionOnDisk}; in memory: ${live.record.codeVersion}${live.record.codeVersion === codeVersionOnDisk ? '' : ` (new code: run \`${PROGRAM} update\`)`}`,
      ...PresenceWording.livePresenceLinesOf(presenceReading.presence),
      ...entity.notices.map((notice) => `notice: ${OverseerWording.noticeTextOf(notice)}`),
      ...(entity.batonPassWarning === null ? [] : [`warning: ${OverseerWording.batonPassWarningTextOf(entity.batonPassWarning)}`]),
    ];
  OutputUtil.printEntity(commandArguments, context, entity, lines.join('\n'));
}

const OVERSEE_SUBCOMMANDS: Readonly<Record<string, RunSubcommand>> = Object.freeze({
  stop:            stopSubcommand('overseer-stop'),
  restart:         stopSubcommand('overseer-restart'),
  pause:           pauseSubcommand('overseer-pause'),
  resume:          pauseSubcommand('overseer-resume'),
  status:          printOverseerStatus,
  'talos-restart': restartTalos,
});

export const OVERSEE_SUBCOMMAND_NAMES: readonly string[] = Object.freeze(Object.keys(OVERSEE_SUBCOMMANDS));

export const overseeCommand: CommandHandler = async (commandArguments, context) => {
  const subcommand = commandArguments.positionals()[0];
  if (subcommand === undefined) {
    await startOverseer(commandArguments, context);
    return;
  }
  const handler = Object.hasOwn(OVERSEE_SUBCOMMANDS, subcommand) ? OVERSEE_SUBCOMMANDS[subcommand] : undefined;
  if (handler === undefined) {
    throw new OperationRefusal(
      'refused',
      `Unknown oversee subcommand "${subcommand}". Write one of ${OVERSEE_SUBCOMMAND_NAMES.join(', ')}, or none to start.\n  Usage: ${START_USAGE}`,
    );
  }
  await handler(commandArguments, context);
};
