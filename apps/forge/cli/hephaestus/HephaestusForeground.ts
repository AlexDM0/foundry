/**
 * `start --foreground`: wins the Baton, serves the board's API and lives until a stop signal, a `hephaestus-stop` command, a Baton pass to a
 * successor on the code on disk after `hephaestus-restart`, or a newer generation taking the board over, which ends it `baton-taken`
 * (exit 2) without touching what the new Hephaestus holds. `start --successor-of <generation>` is that successor's side of the Baton pass.
 */
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync
} from 'node:fs';
import { dirname } from 'node:path';

import { OperationRefusalWordingUtil }                    from '../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { writeOwnerOnlyFileAtomically }                   from '../../src/lib/atomic-file/AtomicFile.ts';
import { GitProcess }                                     from '../../src/lib/git/GitProcess.ts';
import { LocalTimeUtil }                                  from '../../src/lib/local-time/LocalTimeUtil.ts';
import type { PlatformPorts }                             from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, sameBoot }                 from '../../src/lib/process-identity/ProcessIdentity.ts';
import { QuietWatch }                                     from '../../src/lib/quiet-watch/QuietWatch.ts';
import { TALOS_PROTOCOL_VERSION }                         from '../../src/lib/talos/constants/TalosProtocol.ts';
import type { StartOrigin }                               from '../../src/lib/tracker-model/@types/Job.ts';
import type { LogRecordFieldsOf }                         from '../../src/lib/tracker-model/@types/LogRecord.ts';
import { readingBoardOf }                                 from '../../src/lib/tracker-model/ReadingBoard.ts';
import { finishHalfAppliedSetup }                         from '../../src/services/control/PipelineSetupControls.ts';
import type { CrashedComponent }                          from '../../src/services/hephaestus/@types/CrashLogRecord.ts';
import { AgentSlots }                                     from '../../src/services/hephaestus/AgentSlots.ts';
import { Baton, type BatonAcquisition, type BatonRecord } from '../../src/services/hephaestus/Baton.ts';
import {
  type BatonPassFailure,
  type BatonPassOutcome,
  type BatonPassSchedule,
  type BatonPassStep,
  type BatonPassStepRun,
  type RebindOutcome,
  BatonPass
} from '../../src/services/hephaestus/BatonPass.ts';
import type { BoardChildren }                                             from '../../src/services/hephaestus/BoardChildren.ts';
import { CodeVersion }                                                    from '../../src/services/hephaestus/CodeVersion.ts';
import { CrashLog }                                                       from '../../src/services/hephaestus/CrashLog.ts';
import { CrashPath, type CrashPathContext }                               from '../../src/services/hephaestus/CrashPath.ts';
import { DataFolderWatch }                                                from '../../src/services/hephaestus/DataFolderWatch.ts';
import { createDrivePass, type DrivePass }                                from '../../src/services/hephaestus/DrivePass.ts';
import { EventBroker }                                                    from '../../src/services/hephaestus/EventBroker.ts';
import { hephaestusFilesIn, hephaestusTokenPathOf, type HephaestusFiles } from '../../src/services/hephaestus/HephaestusFiles.ts';
import type { HephaestusPortChoice }                                      from '../../src/services/hephaestus/HephaestusPort.ts';
import { HephaestusServer, type HephaestusServer as StartedServer }       from '../../src/services/hephaestus/HephaestusServer.ts';
import { createInstallChangeWatch, versionsFromTheBinary }                from '../../src/services/hephaestus/InstallChangeWatch.ts';
import { type LeaseRenewal, startLeaseRenewal }                           from '../../src/services/hephaestus/LeaseRenewal.ts';
import { MachineAgentLimit }                                              from '../../src/services/hephaestus/MachineAgentLimit.ts';
import { MainLineReads }                                                  from '../../src/services/hephaestus/MainLineReads.ts';
import { MonitorSnapshotAssembly, type MonitorHephaestusFacts }           from '../../src/services/hephaestus/MonitorSnapshotAssembly.ts';
import { MonitorStream }                                                  from '../../src/services/hephaestus/MonitorStream.ts';
import { Presence }                                                       from '../../src/services/hephaestus/Presence.ts';
import { createTalosChildren }                                            from '../../src/services/hephaestus/TalosChildren.ts';
import { type TalosConnection, connectToTalos }                           from '../../src/services/hephaestus/TalosConnection.ts';
import { createLineRunner }                                               from '../../src/services/hephaestus/TalosLines.ts';
import { quitTalosForRestart }                                            from '../../src/services/hephaestus/TalosRestart.ts';
import {
  type TalosAvailability,
  type TalosStartContext,
  createTalosStartHold,
  ensureTalos,
  persistedChildRecordsOf,
  spawnTalos,
  talosRecordAt,
  TALOS_START_BOUNDS,
  TALOS_START_WAITS
} from '../../src/services/hephaestus/TalosStart.ts';
import { mainLineOf }                 from '../../src/services/lifecycle/MergeTargets.ts';
import type { BoardStore }            from '../../src/services/store/BoardStore.ts';
import { createLocalFilesBoardStore } from '../../src/services/store/LocalFilesBoardStore.ts';
import { lockTakerOf }                from '../../src/services/tracker/LockHolders.ts';
import { PictureStore }               from '../../src/services/tracker/PictureStore.ts';
import { projectLocationOf }          from '../../src/services/tracker/ProjectLocation.ts';
import type { Workspace }             from '../../src/services/tracker/Workspace.ts';
import { branchNamesOf }              from '../../src/shared/BranchNames.ts';
import {
  agentVariableIsSet,
  environmentCopy,
  outlivingProgramEnvironment,
  hephaestusPollIntervalOverride,
  versionsAnswerOverride
} from '../../src/shared/Environment.ts';
import { OperationRefusal }           from '../../src/shared/OperationRefusal.ts';
import {
  BATON_PASS_READY_INTERVAL_MILLISECONDS,
  BATON_PASS_READY_TRIES,
  BATON_PASS_REBIND_TRIES,
  BATON_PASS_RELEASE_TRIES,
  HEPHAESTUS_STOP_WAIT_MILLISECONDS
} from '../../src/shared/constants/HephaestusLimits.ts';
import type { CommandContext }                                          from '../CommandContext.ts';
import { INSIDE_HEPHAESTUS_CONTROL_CONTEXT }                            from '../CommandControlContext.ts';
import { requireCurrentInstall }                                        from '../InstallVersionCheck.ts';
import type { ArgumentParser }                                          from '../arguments/ArgumentParser.ts';
import { INSTALL_VERSION }                                              from '../constants/InstallVersion.ts';
import { OutputUtil }                                                   from '../utils/OutputUtil.ts';
import { type BoardRegistration, registerTheBoard }                     from './BoardRegistration.ts';
import { writeAsHephaestus }                                            from './HephaestusBoardWrites.ts';
import { type HephaestusPollSchedule, hephaestusPollScheduleOf }        from './HephaestusPollSchedule.ts';
import { HephaestusWording }                                            from './HephaestusWording.ts';
import { type ServingAdmission, type StartOriginByHand, admitTheStart } from './StartGateAdmission.ts';
import { createMergeForecastCache, readBoardState }                     from './routes/BoardStateReader.ts';
import type { RuntimeCommandOutcome, RuntimeHephaestusCommand }         from './routes/CommandRoute.ts';
import { hephaestusRoutesOf }                                           from './routes/HephaestusRoutes.ts';

export interface ForegroundRunRequest {
  commandArguments: ArgumentParser;
  context:          CommandContext;
  workspace:        Workspace;
  portChoice:       HephaestusPortChoice;
  /** Who started this process: a successor's origin is `successor` whatever this says. */
  startOrigin:      StartOriginByHand;
  /** Set for `start --successor-of <generation>`: the generation this process takes the board over from. */
  successorOf?:     number;
}

export type StoppedHephaestusRequest = Pick<ForegroundRunRequest, 'commandArguments' | 'context' | 'workspace'>;

interface RecordedCrash {
  component:    CrashedComponent;
  crashLogPath: string | null;
}

type HephaestusEnd =
  | { kind: 'stopped'; how: string; now: boolean }
  | { kind: 'restart' }
  | { kind: 'taken-over'; refusal: unknown }
  | ({ kind: 'crashed' } & RecordedCrash);

/** Where the process's crash listeners find what to record; it answers `null` while no generation serves. */
interface CrashPathReach {
  contextNow: () => CrashPathContext | null;
}

/** One serving period under one Baton generation; a Baton pass that failed after the release starts another in the same process. */
interface Serving {
  generation:      number;
  server:          StartedServer;
  drivePass:       DrivePass;
  dataFolderWatch: { stop: () => void };
  lifetime:        ReturnType<typeof hephaestusLifetime>;
  boardChildren:   BoardChildren;
}

const TOKEN_BYTES            = 32;

function batonPassPollOf(tries: number): HephaestusPollSchedule {
  return hephaestusPollScheduleOf({ tries, intervalMilliseconds: BATON_PASS_READY_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
}

function batonPassSchedule(): BatonPassSchedule {
  const readyPoll = batonPassPollOf(BATON_PASS_READY_TRIES);
  return {
    readyTries:           readyPoll.tries,
    releaseTries:         batonPassPollOf(BATON_PASS_RELEASE_TRIES).tries,
    intervalMilliseconds: readyPoll.intervalMilliseconds,
  };
}

/** Every line goes to standard error and is appended to `<data>/hephaestus.log`, which a reader tails, so it is never rewritten whole. */
export function hephaestusLoggerOf(context: CommandContext, files: HephaestusFiles): (line: string) => void {
  return (line: string) => {
    const stampedLine = `${LocalTimeUtil.formatLocalIso(context.now())} ${line}`;
    context.standardError(stampedLine);
    try {
      appendFileSync(files.logFilePath, `${stampedLine}\n`);
    } catch {
      // The log is a convenience: a full disk never stops a Hephaestus that is otherwise serving.
    }
  };
}

function alreadyRunningRefusal(files: HephaestusFiles, generation: number, record: BatonRecord): OperationRefusal {
  const batonFilePath = Baton.batonFilePathFor(files.hephaestusDirectory, generation);
  return new OperationRefusal('refused', { kind: 'hephaestus-already-running', url: record.url, batonFilePath });
}

export function requireNoLiveHephaestus(ports: PlatformPorts, files: HephaestusFiles): void {
  const newest = Baton.newestBatonOf(ports, files.hephaestusDirectory);
  if (newest.verdict === 'live') throw alreadyRunningRefusal(files, newest.generation, newest.record);
}

/** Hephaestus's own store of its board, built from its workspace: the context of a start names no current directory. */
function hephaestusBoardStoreOf(request: StoppedHephaestusRequest): BoardStore {
  const { context, workspace } = request;
  return createLocalFilesBoardStore({ workspace, now: context.now, lockTaker: lockTakerOf(context.platformPorts.processSupervision) });
}

async function registerHephaestus(request: StoppedHephaestusRequest, registration: BoardRegistration): Promise<void> {
  await registerTheBoard(request.context, request.workspace, registration);
}

/**
 * What ends a generation, run by its Hephaestus or, for one that ended before its stop finished, by the CLI once its process is gone. A Hephaestus
 * that started meanwhile keeps its registry entry and its page; only the record of the stop is written for it.
 */
export async function closeTheStoppedHephaestus(
  request: StoppedHephaestusRequest,
  files: HephaestusFiles,
  generation: number,
  boardStore: BoardStore = hephaestusBoardStoreOf(request),
): Promise<void> {
  const { context, workspace } = request;
  await writeAsHephaestus(boardStore, context, workspace, (transaction) => transaction.board.recordHephaestusStopped('stopped', transaction.at));
  if (Baton.batonGenerationsIn(files.hephaestusDirectory).at(-1) !== generation) return;
  const stoppedAt = LocalTimeUtil.formatLocalIso(context.now());
  await registerHephaestus(request, { hephaestus: 'removed', presence: { state: 'stopped', generation, at: stoppedAt } });
  Presence.writeEnding(files, generation, { kind: 'stopped' }, stoppedAt);
  Baton.release(files.hephaestusDirectory, generation);
}

/**
 * The ending of a generation that released the board to its successor: presence, then the registry, say `handed-over`, and the board log
 * `baton-passed`. `endingWritten` runs once presence holds the ending, so no crash is recorded over it.
 */
export async function recordTheHandover(
  request: StoppedHephaestusRequest,
  files: HephaestusFiles,
  generation: number,
  endingWritten: () => void,
  boardStore: BoardStore = hephaestusBoardStoreOf(request),
): Promise<void> {
  const { context, workspace } = request;
  const handedOverAt = LocalTimeUtil.formatLocalIso(context.now());
  Presence.writeEnding(files, generation, { kind: 'handed-over' }, handedOverAt);
  endingWritten();
  await registerHephaestus(request, { presence: { state: 'handed-over', generation, at: handedOverAt } });
  await writeAsHephaestus(boardStore, context, workspace, (transaction) => transaction.board.recordHephaestusStopped('baton-passed', transaction.at));
}

/** The lease renewal's hook: each renewal Talos confirmed is one beat of this generation. */
export function heartbeatOnRenewalOf(files: HephaestusFiles, generation: number): (renewedAtWallMilliseconds: number) => void {
  return (renewedAtWallMilliseconds) => {
    Presence.writeHeartbeat(files, generation, LocalTimeUtil.formatLocalIso(new Date(renewedAtWallMilliseconds)));
  };
}

export interface StopWait {
  name: string;
  run:  () => Promise<unknown>;
}

/**
 * Runs the waits in turn, all of them under one bound, so a stop records itself and releases its Baton before Windows ends a closed console's
 * process. The wait the bound cuts short is logged by name; the waits after it are started and not awaited.
 */
export async function waitOutTheStopWaits(waits: readonly StopWait[], log: (line: string) => void, boundMilliseconds: number): Promise<void> {
  let boundTimer: ReturnType<typeof setTimeout> | undefined;
  // The one clock decision of the stop, on purpose: the platform ends the process at a time, not at a count.
  const boundReached = new Promise<'bound-reached'>((resolve) => {
    boundTimer = setTimeout(() => resolve('bound-reached'), boundMilliseconds);
  });
  const reportLateFailure = (wait: StopWait) => (thrown: unknown) => {
    log(`After the stop went on, ${wait.name} failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
  };
  try {
    for (const [index, wait] of waits.entries()) {
      const running = wait.run();
      const outcome = await Promise.race([running.then(() => 'ended' as const), boundReached]);
      if (outcome === 'ended') continue;
      running.catch(reportLateFailure(wait));
      log(`The stop went on without ${wait.name}, which did not end within ${boundMilliseconds} ms.`);
      for (const laterWait of waits.slice(index + 1)) laterWait.run().catch(reportLateFailure(laterWait));
      return;
    }
  } finally {
    clearTimeout(boundTimer);
  }
}

function writeToken({ ownerOnlyFiles }: PlatformPorts, tokenFilePath: string): string {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  writeOwnerOnlyFileAtomically(tokenFilePath, token);
  ownerOnlyFiles.restrictFile(tokenFilePath);
  return token;
}

function batonRefusalOf(acquisition: Exclude<BatonAcquisition, { verdict: 'acquired' }>, files: HephaestusFiles): OperationRefusal {
  if (acquisition.verdict === 'contended') return new OperationRefusal('refused', { kind: 'hephaestus-contended', hephaestusDirectory: files.hephaestusDirectory });
  return alreadyRunningRefusal(files, acquisition.generation, acquisition.record);
}

/** Resolves once Hephaestus should end or hand over, and is settled at most once. */
function hephaestusLifetime(request: ForegroundRunRequest, files: HephaestusFiles, generation: number, log: (line: string) => void) {
  let finish: (end: HephaestusEnd) => void = () => undefined;
  const ended = new Promise<HephaestusEnd>((resolve) => { finish = resolve; });
  // Each drive pass checks before its effects; this watch ends an idle Hephaestus as soon as a newer generation appears.
  const beforeEffectBatch = () => {
    try {
      Baton.requireNewestGeneration(files.hephaestusDirectory, generation);
    } catch (refusal) {
      finish({ kind: 'taken-over', refusal });
    }
  };
  const hephaestusFolderWatch = QuietWatch.watchQuietly({ folderPath: files.hephaestusDirectory, recursive: false, onEvent: beforeEffectBatch });
  const unsubscribe = request.context.onStopSignal(() => {
    log('Stop signal received.');
    finish({ kind: 'stopped', how: 'signal', now: false });
  });
  return {
    ended,
    stopFor:       (how: string, now: boolean) => finish({ kind: 'stopped', how, now }),
    restart:       () => finish({ kind: 'restart' }),
    takenOver:     (refusal: unknown) => finish({ kind: 'taken-over', refusal }),
    crashed:       (crash: RecordedCrash) => finish({ kind: 'crashed', ...crash }),
    stopWatching:  () => hephaestusFolderWatch?.close(),
    // Kept until the stop has finished, so a second SIGTERM during it is taken as the same stop rather than killing it halfway.
    stopListening: unsubscribe,
  };
}

function tipOf(repositoryRoot: string, branch: string): string | null {
  const tip = GitProcess.run(repositoryRoot, ['rev-parse', '--verify', '--quiet', branch]);
  return GitProcess.succeeded(tip) ? tip.standardOutput.trim() : null;
}

/** Read on every look: an `update` while Hephaestus serves leaves the manifest ahead of the code in memory. */
function manifestMatchesIn(repositoryRoot: string): boolean {
  try {
    requireCurrentInstall(repositoryRoot);
    return true;
  } catch {
    return false;
  }
}

/** What the successor proves before it reports `ready`, holding no Baton and writing nothing. */
function preparationSteps(request: ForegroundRunRequest, boardStore: BoardStore, boardChildren: BoardChildren): readonly BatonPassStepRun[] {
  const { workspace } = request;
  const jobsOf = () => boardStore.reads.requireProgress().jobs ?? [];
  const steps: readonly BatonPassStepRun[] = [
    { step: 'read-board', run: () => { readingBoardOf(boardStore.reads.requireProgress(), [], []); } },
    {
      step: 'read-jobs',
      run:  () => {
        for (const job of jobsOf()) {
          if (!Number.isSafeInteger(job.childInstance) || !Number.isSafeInteger(job.eventCursor.sequence)) {
            throw new Error(`job ${job.id} has no readable child instance or cursor`);
          }
        }
      },
    },
    {
      step: 'read-child-records',
      run:  () => {
        for (const job of jobsOf()) {
          const jobFolder = boardChildren.jobFolderOf(job.id);
          if (boardChildren.livenessOf(jobFolder, job.childInstance).verdict === 'unlaunched') continue;
          if (boardChildren.recordOf(jobFolder, job.childInstance) === null) {
            throw new Error(`child ${job.childInstance} of job ${job.id} has no readable child record`);
          }
          if (boardChildren.eventsAfter(jobFolder, job.childInstance, 0) === 'malformed') {
            throw new Error(`the event log of child ${job.childInstance} of job ${job.id} is malformed`);
          }
        }
      },
    },
    { step: 'install-version', run: () => { requireCurrentInstall(workspace.rootDirectory); } },
  ];
  return steps;
}

/** Why a start whose Talos cannot serve is refused: one of another protocol is never started again, and one that never served stops the start. */
export function talosStartRefusalOf(availability: Extract<TalosAvailability, { verdict: 'held' | 'unavailable' }>): OperationRefusal {
  if (availability.verdict === 'held') {
    const { answeredProtocolVersion } = availability;
    return new OperationRefusal('unrepaired', { kind: 'talos-protocol-differs', requiredProtocolVersion: TALOS_PROTOCOL_VERSION, answeredProtocolVersion });
  }
  return new OperationRefusal('unrepaired', { kind: 'talos-unavailable', reason: availability.reason, startNumber: availability.startNumber });
}

/** The successor on the code on disk, spawned so it outlives this Hephaestus; `null` when it did not start. */
export function spawnSuccessor(
  context: Pick<CommandContext, 'programCommand' | 'platformPorts'>,
  workspace: Pick<Workspace, 'rootDirectory'>,
  files: Pick<HephaestusFiles, 'logFilePath'>,
  generation: number,
  port: number,
): ProcessIdentity | null {
  if (context.programCommand.length === 0) return null;
  // Its own lines reach the log through its logger; what it prints before it has one, such as a refusal, is appended here.
  const logFileDescriptor = openSync(files.logFilePath, 'a');
  try {
    const child = Bun.spawn([...context.programCommand, 'start', '--successor-of', String(generation), '--port', String(port)], {
      cwd:    workspace.rootDirectory,
      env:    outlivingProgramEnvironment(),
      stdin:  'ignore',
      stdout: 'ignore',
      stderr: logFileDescriptor,
      ...context.platformPorts.processSupervision.spawnOptionsFor('successor'),
    });
    child.unref();
    return context.platformPorts.processSupervision.identityOf(child.pid);
  } catch {
    return null;
  } finally {
    closeSync(logFileDescriptor);
  }
}

/** The `start-classified` record of an admitted start: a field it has no value for is left out. */
function startClassifiedFieldsOf({ classification, crashLogNumber }: ServingAdmission, startOrigin: StartOrigin): LogRecordFieldsOf<'start-classified'> {
  return {
    kind: classification.kind,
    startOrigin,
    ...(classification.previousGeneration === null ? {} : { previousGeneration: classification.previousGeneration }),
    ...(classification.crashSuspected ? { crashSuspected: true } : {}),
    ...(crashLogNumber === null ? {} : { crashLogNumber }),
  };
}

export async function runHephaestusInTheForeground(request: ForegroundRunRequest): Promise<void> {
  const crashPathReach: CrashPathReach = { contextNow: () => null };
  const removeCrashListeners = CrashPath.listenForProcessCrashes(() => crashPathReach.contextNow());
  try {
    await serveInTheForeground(request, crashPathReach);
  } finally {
    removeCrashListeners();
  }
}

async function serveInTheForeground(request: ForegroundRunRequest, crashPathReach: CrashPathReach): Promise<void> {
  const { context, workspace } = request;
  const boardStore = hephaestusBoardStoreOf(request);
  const progress   = boardStore.reads.requireProgress();
  const files      = hephaestusFilesIn(workspace.trackerDirectory);
  const { platformPorts } = context;
  const tokenFilePath = hephaestusTokenPathOf(platformPorts.dataFolders.monitorFolderOf(context.homeDirectory), progress.trackerId);
  // Read before anything is written, so a malformed test setting refuses the start rather than a Hephaestus half started.
  const versionsAnswer = versionsAnswerOverride();
  mkdirSync(files.hephaestusDirectory, { recursive: true });
  // Before any worker starts: a folder absent when a sandbox is wrapped would go undenied.
  platformPorts.ownerOnlyFiles.restrictFolder(dirname(tokenFilePath));
  if (request.successorOf === undefined) requireNoLiveHephaestus(platformPorts, files);

  const readIdentity = platformPorts.processSupervision.identityOf(process.pid);
  if (readIdentity === null) {
    const identitySources = platformPorts.processSupervision.identitySourcesOf(process.pid);
    throw new OperationRefusal('unrepaired', { kind: 'hephaestus-identity-unreadable', processId: process.pid, identitySources });
  }
  const ownIdentity: ProcessIdentity = readIdentity;
  const codeVersion = CodeVersion.onDisk();
  const log         = hephaestusLoggerOf(context, files);
  const startOrigin: StartOrigin = request.successorOf === undefined ? request.startOrigin : 'successor';
  // Before any Baton, port or Talos, so a start that stays off leaves nothing a later start would read as its own; a successor runs it once
  // its predecessor released the board or is gone.
  let startAdmission: ServingAdmission | null = request.successorOf === undefined
    ? await admitTheStart({
      context, workspace, boardStore, files, origin: { startOrigin: request.startOrigin }, log
    })
    : null;
  // A rebind after a failed Baton pass serves again under the same admission; only the process's first serving period logs it.
  let startClassificationLogged = false;
  // Git runs at the repository's root, never in a tracker's folder below it.
  const { repositoryRoot } = projectLocationOf(workspace.rootDirectory);
  const mainLine    = mainLineOf(repositoryRoot);
  const branchNames = branchNamesOf(progress.branchNamespace ?? null);
  const mergeForecastCache = createMergeForecastCache();
  const mainLineReads = new MainLineReads(workspace.rootDirectory);
  // Shown in the monitor snapshot only; until the program on disk answered, the code in memory stands in for it.
  let codeVersionOnDisk = codeVersion;
  const installWatch = createInstallChangeWatch({
    inMemory:       { codeVersion, installVersion: INSTALL_VERSION },
    versionsOnDisk: async () => {
      const versions = await versionsFromTheBinary(context.programCommand, workspace.rootDirectory);
      codeVersionOnDisk = versions?.codeVersion ?? codeVersionOnDisk;
      return versions;
    },
    manifestMatches: () => manifestMatchesIn(workspace.rootDirectory),
    landingMark:     () => tipOf(repositoryRoot, mainLine),
    // Forced: an answer moves no fingerprint the pass compares.
    onLearned:       () => current?.drivePass.wake(true),
  });

  const monitorFolder = platformPorts.dataFolders.monitorFolderOf(context.homeDirectory);
  // One per process: a Talos this Hephaestus started that answered another protocol version is never started again.
  const talosStartHold = createTalosStartHold();
  let talosConnection: TalosConnection | null = null;
  let talosIsLost = false;
  let followedTalosStartNumber: number | null = null;
  let leaseRenewal: LeaseRenewal | null = null;
  // Set from the presence write of a generation until its ending, so a crash is recorded only for a generation still serving.
  let crashableGeneration: number | null = null;
  let recordedCrash: RecordedCrash | null = null;
  const recordedCrashNow = (): RecordedCrash | null => recordedCrash;
  const boardChildren = createTalosChildren({ boardFolder: workspace.trackerDirectory, platformPorts, connection: () => talosConnection });
  const lineRunner = createLineRunner(boardChildren, () => talosConnection);
  const talosStartContext = (): TalosStartContext => ({
    boardFolder:    workspace.trackerDirectory,
    monitorFolder,
    trackerId:      progress.trackerId,
    codeVersion,
    repositoryRoot: workspace.rootDirectory,
    ports:          platformPorts,
    bounds:         TALOS_START_BOUNDS,
    waits:          TALOS_START_WAITS,
    connect:        connectToTalos,
    startTalos:     spawnTalos,
    hold:           talosStartHold,
    log,
  });

  /** A connection that closes, by Talos's quit or its loss, has the next pass ensure a Talos before it launches anything. */
  const followTalos = (availability: Extract<TalosAvailability, { connection: TalosConnection }>): void => {
    const { connection } = availability;
    const previousConnection = talosConnection;
    talosConnection = connection;
    talosIsLost = false;
    followedTalosStartNumber = availability.startNumber;
    previousConnection?.close();
    connection.onClose(() => {
      if (talosConnection !== connection) return;
      talosConnection = null;
      talosIsLost = true;
      log(`The connection to Talos ${availability.startNumber} closed; the next pass ensures a Talos.`);
      current?.drivePass.wake(true);
    });
    if (availability.verdict === 'started') {
      log(`Started Talos ${availability.startNumber} (the one before ${availability.previousTalos}, ${availability.sweptOrphans} orphans swept).`);
    } else log(`Attached to Talos ${availability.startNumber}.`);
  };

  const crashPathContextOf = (generation: number): CrashPathContext => ({
    files,
    generation,
    activeJobs:         () => (boardStore.reads.requireProgress().jobs ?? []).map(CrashLog.activeJobOf),
    talosChildren:      () => (followedTalosStartNumber === null ? null : persistedChildRecordsOf(workspace.trackerDirectory, followedTalosStartNumber)),
    stopLeaseRenewal:   () => leaseRenewal?.stop(),
    writeRegistryCrash: (report) => registerHephaestus(request, { presence: report }),
    stampNow:           () => LocalTimeUtil.formatLocalIso(context.now()),
    log,
  });
  crashPathReach.contextNow = () => (crashableGeneration === null ? null : crashPathContextOf(crashableGeneration));

  /** Runs the crash path once for the serving generation and ends the foreground loop `crashed`. */
  async function recordTheCrash(generation: number, component: CrashedComponent, error: Parameters<typeof CrashPath.record>[1]['error']): Promise<void> {
    const outcome = await CrashPath.record(crashPathContextOf(generation), { component, error });
    recordedCrash = { component, crashLogPath: outcome.crashLogPath };
    log(`Crashed (${component}) under Baton ${generation}; the crash log is ${outcome.crashLogPath ?? 'not written'} (${outcome.crashLog}).`);
    (lifetimeBeingStarted ?? current?.lifetime)?.crashed(recordedCrash);
  }

  /** A pass that threw after a crash was recorded, a crash of Talos included, is passed over, so the first crash keeps its component. */
  async function recordThePassCrash(generation: number, thrown: unknown): Promise<void> {
    if (recordedCrashNow() !== null) return;
    await recordTheCrash(generation, 'hephaestus', CrashLog.errorOf('pass', thrown));
  }

  /** The refusal a stop or a release ends with once a crash is recorded, so no `stopped` or `handed-over` ending overwrites `crashed`. */
  const crashRefusalOrNull = (): OperationRefusal | null => {
    const crash = recordedCrashNow();
    return crash === null ? null : new OperationRefusal('unrepaired', { kind: 'forge-crashed', component: crash.component, crashLogPath: crash.crashLogPath });
  };

  /** A Talos lost while this Hephaestus lives is a crash of Talos, unless its record names another boot: that is the machine going down. */
  const talosWasLostThisBoot = (lostStartNumber: number | null): boolean => {
    const lostTalos = lostStartNumber === null ? null : talosRecordAt(workspace.trackerDirectory, lostStartNumber)?.talos ?? null;
    return lostTalos === null || sameBoot(lostTalos.bootIdentity, ownIdentity.bootIdentity);
  };

  /** The one place a pass finds its Talos lost while serving; a crash of Talos ends the pass before it reads anything. */
  const ensureTalosIfLost = async (): Promise<void> => {
    if (recordedCrashNow() !== null) throw new Error('Hephaestus crashed and is stopping, so no pass runs.');
    if (!talosIsLost) return;
    const lostStartNumber = followedTalosStartNumber;
    const availability = await ensureTalos(talosStartContext());
    const servingGeneration = crashableGeneration;
    if (availability.verdict === 'started' && availability.previousTalos === 'lost' && servingGeneration !== null && talosWasLostThisBoot(lostStartNumber)) {
      availability.connection.close();
      const message = `Talos ${lostStartNumber ?? 'unknown'} was lost while serving; ${availability.sweptOrphans} of its children were swept.`;
      await recordTheCrash(servingGeneration, 'talos', {
        origin: 'talos-lost', name: 'TalosLost', message, stack: null
      });
      throw new Error(`${message} This is a crash of Talos: Hephaestus stops.`);
    }
    if (availability.verdict === 'attached' || availability.verdict === 'started') {
      followTalos(availability);
      return;
    }
    log(`No Talos serves the board (${availability.reason}); the next pass tries again.`);
  };

  let token: string | null = null;
  let current: Serving | null = null;
  // The lifetime of a generation between its creation and `current`, so a crash recorded in that gap still ends the loop.
  let lifetimeBeingStarted: ReturnType<typeof hephaestusLifetime> | null = null;
  let handingOver = false;
  let batonPassWarning: BatonPassFailure | null = null;
  let printedTheUrl = false;

  const hephaestusState = () => {
    const passState = current?.drivePass.state();
    if (passState === undefined) return null;
    return { ...passState, runtimeState: handingOver ? 'passing-baton' as const : passState.runtimeState, batonPassWarning };
  };

  /** Binds, takes a generation through `acquireBaton`, records the start, ensures Talos and regroups every child; what it took is let go on a failure. */
  async function startServing(
    portChoice: HephaestusPortChoice,
    acquireBaton: (record: BatonRecord) => BatonAcquisition,
    enterStep: (step: BatonPassStep) => void,
  ): Promise<Serving> {
    const admission = startAdmission;
    if (admission === null) throw new Error('A start serves only once the start gate admitted it.');
    let lifetime: ReturnType<typeof hephaestusLifetime> | null = null;
    let drivePass: DrivePass | null = null;
    enterStep('bind-port');
    let broker: EventBroker | null = null;
    let monitorStream: MonitorStream | null = null;
    let servedUrl: string | null = null;
    let servedGeneration: number | null = null;
    let startedAt: string | null = null;
    let started = false;
    const hephaestusFactsNow = () => {
      const state = hephaestusState();
      return {
        state:            state?.runtimeState ?? 'serving',
        url:              servedUrl,
        generation:       state?.generation ?? null,
        codeVersion,
        installVersion:   INSTALL_VERSION,
        batonPassWarning: state?.batonPassWarning ?? null,
      } as const;
    };
    const monitorFolderOfTheMachine = context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory);
    const monitorFactsNow = (): MonitorHephaestusFacts | null => {
      if (servedUrl === null || servedGeneration === null || startedAt === null) return null;
      return {
        trackerId:      progress.trackerId,
        root:           workspace.rootDirectory,
        state:          hephaestusFactsNow().state,
        url:            servedUrl,
        processId:      process.pid,
        startedAt,
        generation:     servedGeneration,
        codeVersion,
        codeVersionOnDisk,
        installVersion: INSTALL_VERSION,
        machine:        {
          limit:                        MachineAgentLimit.readingIn(monitorFolderOfTheMachine, MachineAgentLimit.cpuCeiling()).limit,
          agentsInFlight:               AgentSlots.liveHoldingCountIn(context.platformPorts, monitorFolderOfTheMachine),
          ticketsWaitingForMachineSlot: current?.drivePass.state().ticketsWaitingForMachineSlot ?? 0,
        },
      };
    };
    const server = HephaestusServer.start({
      portChoice,
      ...(versionsAnswer === undefined ? {} : { versions: versionsAnswer }),
      identity: {
        trackerId: progress.trackerId, project: progress.project, codeVersion, installVersion: INSTALL_VERSION, processId: process.pid,
      },
      routes: hephaestusRoutesOf({
        commandArguments: request.commandArguments,
        context,
        workspace,
        boardStore,
        boardChildren,
        token:            () => token,
        started:          () => started,
        broker:           () => broker,
        monitorStream:    () => monitorStream,
        monitorFacts:     monitorFactsNow,
        wake:             () => drivePass?.wake(),
        launchesHeld:     () => hephaestusState()?.runtimeState === 'held-by-install-change',
        notices:          () => hephaestusState()?.notices ?? [],
        hephaestus:       hephaestusFactsNow,
        mainLine,
        mergeForecastCache,
        mainLineReads,
        silentSweepsOf:   (jobId: string) => current?.drivePass.silentSweepsOf(jobId) ?? 0,
        onRuntimeCommand: async (command: RuntimeHephaestusCommand): Promise<RuntimeCommandOutcome> => {
          log(`${command.kind} received${'now' in command && command.now ? ' (now)' : ''}.`);
          if (current === null || handingOver) return command.kind === 'talos-restart' ? 'nothing-to-do' : 'done';
          if (command.kind === 'talos-restart') {
            const outcome = await quitTalosForRestart(talosConnection);
            log(`Talos ${followedTalosStartNumber ?? 'none'} was asked to quit for a clean restart: ${outcome}.`);
            return outcome;
          }
          if (command.kind === 'hephaestus-restart') {
          // Set at once, so a second command during this Baton pass never overwrites what the successor reported.
            handingOver = true;
            // Written before the command is answered, so whoever sent it never reads an earlier Baton pass's outcome.
            BatonPass.writeBatonPass(BatonPass.batonPassFilePathOf(files.hephaestusDirectory, current.generation), { state: 'requested' });
            current.lifetime.restart();
            return 'done';
          }
          current.lifetime.stopFor(command.kind, command.now);
          return 'done';
        },
      }),
    });

    enterStep('take-baton');
    const record: BatonRecord = {
      processId:            ownIdentity.processId,
      processStartStamp:    ownIdentity.startStamp,
      bootIdentity:         ownIdentity.bootIdentity,
      port:                 server.port,
      url:                  server.url,
      tokenFile:            tokenFilePath,
      codeVersion,
      installVersion:       INSTALL_VERSION,
      talosProtocolVersion: TALOS_PROTOCOL_VERSION,
    };
    let acquisition: BatonAcquisition;
    try {
      acquisition = acquireBaton(record);
    } catch (refusal) {
      await server.stop();
      throw refusal;
    }
    if (acquisition.verdict !== 'acquired') {
      await server.stop();
      throw batonRefusalOf(acquisition, files);
    }
    const { generation } = acquisition;
    const ownBroker = EventBroker.createEventBroker(generation);
    const ownMonitorStream = MonitorStream.createMonitorStream();
    const publishState = () => {
      try {
        const read = readBoardState({
          context,
          workspace,
          boardReads:     boardStore.reads,
          boardChildren,
          notices:        () => hephaestusState()?.notices ?? [],
          hephaestus:     hephaestusFactsNow,
          silentSweepsOf: (jobId) => current?.drivePass.silentSweepsOf(jobId) ?? 0,
          mainLine,
          mergeForecastCache,
          mainLineReads,
        });
        ownBroker.publishState(read.state);
        const monitorFacts = monitorFactsNow();
        if (monitorFacts !== null) ownMonitorStream.publish(MonitorSnapshotAssembly.monitorSnapshotOf({ ...read, hephaestus: monitorFacts, now: context.now() }));
      } catch (thrown) {
        log(`The board state could not be read for the event stream: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      }
    };
    broker           = ownBroker;
    monitorStream    = ownMonitorStream;
    servedUrl        = server.url;
    servedGeneration = generation;
    startedAt        = LocalTimeUtil.formatLocalIso(context.now());
    const servingStartedAt = startedAt;
    let dataFolderWatch: DataFolderWatch | null = null;
    try {
      Presence.writeStartedPresence(files, {
        generation,
        process:             ownIdentity,
        codeVersion,
        startOrigin,
        startedAt:           servingStartedAt,
        startClassification: admission.classification,
      });
      crashableGeneration = generation;
      token    = writeToken(platformPorts, tokenFilePath);
      lifetime = hephaestusLifetime(request, files, generation, log);
      lifetimeBeingStarted = lifetime;
      enterStep('regroup');
      await writeAsHephaestus(boardStore, context, workspace, (transaction) => {
        // Before the record it looks for: only the first start on a board submits the v16 leftovers.
        transaction.board.submitFirstRunLeftovers(transaction.at);
        // In the hold, so no command names a picture between the read of the references and the sweep.
        PictureStore.sweepUnreferenced(workspace.trackerDirectory, PictureStore.referencedPictureIdsOf(transaction.board.logRecordsSoFar(), transaction.board.jobs()));
        finishHalfAppliedSetup(transaction, INSIDE_HEPHAESTUS_CONTROL_CONTEXT);
        const hephaestusStarted = transaction.board.recordHephaestusStarted({ codeVersion, installVersion: INSTALL_VERSION }, transaction.at);
        if (!startClassificationLogged) transaction.board.recordStartClassified(startClassifiedFieldsOf(admission, startOrigin), transaction.at);
        return hephaestusStarted;
      });
      startClassificationLogged = true;
      log(`Hephaestus serving ${server.url} under Baton ${generation} (code ${codeVersion}, install version ${INSTALL_VERSION}, agents ${context.agentAdapter.vendor}).`);

      const startedLifetime = lifetime;
      drivePass = createDrivePass({
        platformPorts,
        workspace,
        boardStore,
        now:                   context.now,
        formatStamp:           (moment) => LocalTimeUtil.formatLocalIso(moment),
        hephaestusDirectory:   files.hephaestusDirectory,
        generation,
        boardChildren,
        lineRunner,
        ensureTalosIfLost,
        programCommand:        context.programCommand,
        codeVersion,
        agentAdapter:          context.agentAdapter,
        monitorFolder,
        inheritedEnvironment:  environmentCopy(),
        mainLine,
        branchNames,
        installVersionChanged: installWatch.installVersionChanged,
        installVersionsKnown:  installWatch.versionsSettled,
        apiBillingKeyIsSet:    () => agentVariableIsSet(context.agentAdapter.credentials.billingKeyVariableName),
        newCodeOnDisk:         installWatch.newCodeOnDisk,
        decisionWordingOf:     (draft) => HephaestusWording.decisionWordingOf(draft, context.agentAdapter.credentials),
        packageNeedWordingOf:  HephaestusWording.packageNeedWordingOf,
        dependentFixWordingOf: HephaestusWording.dependentFixWordingOf,
        launchTextOf:          (job, facts) => HephaestusWording.launchTextOf(job, facts, context.agentAdapter.promptFills),
        assistantChatTextOf:   HephaestusWording.assistantChatTextOf,
        windDownMessage:       HephaestusWording.windDownMessage(),
        resumeMessage:         HephaestusWording.resumeMessage(),
        redHandoffMessageOf:   HephaestusWording.redHandoffMessageOf,
        answerMessageOf:       HephaestusWording.answerMessageOf,
        setupMessageWordingOf: (message) => HephaestusWording.setupMessageWordingOf(message, context.agentAdapter.promptFills),
        homeDirectory:         context.homeDirectory,
        log,
        onBatonTakenOver:      (refusal) => (current?.lifetime ?? startedLifetime).takenOver(refusal),
        onPassCrashed:         (thrown) => recordThePassCrash(generation, thrown),
        watchHatchFolder:      (hatchDirectory) => dataFolderWatch?.watchHatchFolder(hatchDirectory),
        unwatchHatchFolder:    (hatchDirectory) => dataFolderWatch?.unwatchHatchFolder(hatchDirectory),
        afterPass:             publishState,
        startClassification:   admission.classification,
      });
      const startedPass = drivePass;
      dataFolderWatch = DataFolderWatch.startWatching({
        trackerDirectory: workspace.trackerDirectory,
        repositoryRoot:   workspace.rootDirectory,
        wake:             () => startedPass.wake(),
        onSweep:          () => {
          installWatch.noteSweep();
          startedPass.sweep();
          // A sweep changes the silent-sweep counts without a pass; the broker sends only the jobs whose count moved.
          publishState();
        },
      });
      // The first of the two places Hephaestus finds its Talos; stage 3 turns a lost one here into a crash of Talos. Before the URL is given
      // out, so a Talos that cannot serve refuses the start; after the start's own writes, so a start that fails earlier starts no Talos.
      const talos = await ensureTalos(talosStartContext());
      if (talos.verdict === 'held' || talos.verdict === 'unavailable') throw talosStartRefusalOf(talos);
      followTalos(talos);
      // Renews at once; a renewal of the previous serving period ends here, and none ends at a stop, so a quick restart keeps every agent.
      leaseRenewal?.stop();
      leaseRenewal = startLeaseRenewal({
        connection: () => talosConnection,
        renewer:    {
          processId: ownIdentity.processId, startStamp: ownIdentity.startStamp, bootIdentity: ownIdentity.bootIdentity, generation
        },
        intervalMilliseconds: TALOS_START_BOUNDS.renewalIntervalMilliseconds,
        tickGapMilliseconds:  TALOS_START_BOUNDS.tickGapMilliseconds,
        passProgress:         { passInFlight: () => drivePass?.passInFlight() ?? null },
        wallNowMilliseconds:  () => context.now().getTime(),
        log,
        onRenewed:            heartbeatOnRenewalOf(files, generation),
      });
      const serving: Serving = {
        generation, server, drivePass, dataFolderWatch, lifetime, boardChildren
      };
      current = serving;
      lifetimeBeingStarted = null;
      publishState();
      // The identity, the registry and the print give out the URL only once the synchronous start is done: a recursive
      // watch can block the event loop for many seconds on a loaded macOS, and a client that had the URL earlier waited that long.
      started = true;
      await registerHephaestus(request, {
        hephaestus: {
          url: server.url, processId: process.pid, startedAt: servingStartedAt, tokenPath: tokenFilePath
        },
        presence: {
          state: 'serving', generation, at: servingStartedAt, process: ownIdentity
        },
      });
      if (!printedTheUrl) OutputUtil.printEntity(request.commandArguments, context, { url: server.url, generation }, server.url);
      printedTheUrl = true;
      await installWatch.learnVersionsOnDisk();
      await drivePass.regroup();
      return serving;
    } catch (thrown) {
      lifetimeBeingStarted = null;
      crashableGeneration = null;
      dataFolderWatch?.stop();
      lifetime?.stopWatching();
      lifetime?.stopListening();
      await drivePass?.stop();
      await server.stop();
      Baton.release(files.hephaestusDirectory, generation);
      throw thrown;
    }
  }

  /**
   * The release half of a Baton pass: a landing in progress finishes, no effect batch starts, and the listener closes; Talos is sent nothing,
   * and the lease renewal goes on until this process exits, so the successor's own renewal overlaps it.
   */
  async function release(serving: Serving): Promise<void> {
    handingOver = true;
    serving.lifetime.stopWatching();
    serving.dataFolderWatch.stop();
    await serving.drivePass.stop();
    const crashRefusal = crashRefusalOrNull();
    if (crashRefusal !== null) {
      await serving.server.stop();
      serving.lifetime.stopListening();
      throw crashRefusal;
    }
    await recordTheHandover(request, files, serving.generation, () => {
      crashableGeneration = null;
    }, boardStore);
    await serving.server.stop();
    log('Released the board to the successor.');
  }

  async function handOver(serving: Serving, successor: ProcessIdentity | null): Promise<BatonPassOutcome> {
    log(`Handing the board over to the code on disk (Baton ${serving.generation}).`);
    return await BatonPass.handOver({
      ports:                platformPorts,
      batonPassFilePath:    BatonPass.batonPassFilePathOf(files.hephaestusDirectory, serving.generation),
      successor,
      successorCodeVersion: CodeVersion.onDisk(),
      release:              () => release(serving),
      recordFailure:        recordBatonPassFailure,
      logSuccessorKill:     (outcome) => log(`The kill of the silent successor answered ${outcome.verdict}.`),
      schedule:             batonPassSchedule(),
    });
  }

  async function recordBatonPassFailure(failure: BatonPassFailure): Promise<void> {
    batonPassWarning = failure;
    log(`The Baton pass failed at ${failure.step}: ${failure.error}. This Hephaestus keeps driving.`);
    await writeAsHephaestus(boardStore, context, workspace, (transaction) => transaction.board.recordBatonPassFailed(failure, transaction.at));
  }

  /** A taken-back board whose port never came free: the failure, naming the port, is logged and recorded before Hephaestus exits 1. */
  async function lostPortRefusal(port: number, rebound: Exclude<RebindOutcome<Serving>, { verdict: 'bound' }>): Promise<OperationRefusal> {
    const cause = rebound.verdict === 'successor-live' ? 'the killed successor was still live' : rebound.error;
    const failure: BatonPassFailure = {
      successorCodeVersion: CodeVersion.onDisk(),
      step:                 'bind-port',
      error:                `port ${port} could not be bound again within ${batonPassPollOf(BATON_PASS_REBIND_TRIES).tries} tries: ${cause}`,
    };
    batonPassWarning = failure;
    log(`Taking the board back failed: ${failure.error}. This Hephaestus exits with no Hephaestus on the board.`);
    await writeAsHephaestus(boardStore, context, workspace, (transaction) => transaction.board.recordBatonPassFailed(failure, transaction.at));
    return new OperationRefusal('refused', { kind: 'baton-pass-failed', ...failure, url: null });
  }

  /** Proves the new code, waits for the release, then serves; a failure is left in the Baton pass file and the process exits 1. */
  async function takeOverAsSuccessor(predecessorGeneration: number): Promise<Serving> {
    const batonPassFilePath = BatonPass.batonPassFilePathOf(files.hephaestusDirectory, predecessorGeneration);
    const admission = await BatonPass.prepareAndAwaitRelease({
      batonPassFilePath,
      codeVersion,
      predecessorIsLive: () => {
        const newest = Baton.newestBatonOf(platformPorts, files.hephaestusDirectory);
        return newest.verdict === 'live' && newest.generation === predecessorGeneration;
      },
      schedule: batonPassSchedule(),
    }, preparationSteps(request, boardStore, boardChildren));
    if (admission === 'failed') {
      const report = BatonPass.readBatonPass(batonPassFilePath);
      const reported = report?.state === 'successor-failed' || report?.state === 'failed';
      const failure  = reported ? report : { successorCodeVersion: codeVersion, step: 'report-ready', error: 'no report was left' };
      throw new OperationRefusal('refused', {
        kind: 'baton-pass-failed', successorCodeVersion: failure.successorCodeVersion, step: failure.step, error: failure.error, url: null
      });
    }
    log(admission === 'released' ? `Baton ${predecessorGeneration} released the board; taking it over.` : `Baton ${predecessorGeneration} is gone; classifying the start.`);
    try {
      startAdmission = await admitTheStart({
        context, workspace, boardStore, files, origin: { startOrigin: 'successor', predecessorGeneration }, log
      });
    } catch (refusal) {
      const worded = refusal instanceof OperationRefusal ? new Error(OperationRefusalWordingUtil.messageOf(refusal)) : refusal;
      BatonPass.reportFailure({ batonPassFilePath, codeVersion }, 'take-baton', worded, admission === 'released');
      throw refusal;
    }
    return await startAsSuccessor(predecessorGeneration, admission);
  }

  let serving = request.successorOf === undefined
    ? await startServing(request.portChoice, (record) => Baton.acquire(platformPorts, files.hephaestusDirectory, record), () => undefined)
    : await takeOverAsSuccessor(request.successorOf);

  async function startAsSuccessor(predecessorGeneration: number, admission: 'released' | 'predecessor-gone'): Promise<Serving> {
    let step: BatonPassStep = 'bind-port';
    const batonPassFilePath = BatonPass.batonPassFilePathOf(files.hephaestusDirectory, predecessorGeneration);
    try {
      const acquireBaton = admission === 'released'
        ? (record: BatonRecord) => Baton.acquireAbove(files.hephaestusDirectory, record, predecessorGeneration)
        : (record: BatonRecord) => Baton.acquire(platformPorts, files.hephaestusDirectory, record);
      const started = await startServing(request.portChoice, acquireBaton, (entered) => { step = entered; });
      BatonPass.reportServing({ batonPassFilePath, codeVersion }, started.generation, started.server.url);
      return started;
    } catch (thrown) {
      BatonPass.reportFailure({ batonPassFilePath, codeVersion }, step, thrown, admission === 'released');
      throw thrown;
    }
  }

  for (;;) {
    const settledEnd = await serving.lifetime.ended;
    // A crash recorded while another end settled first still ends the loop crashed; the stop waits are checked again below.
    const crashSeen = recordedCrashNow();
    const end: HephaestusEnd = crashSeen === null ? settledEnd : { kind: 'crashed', ...crashSeen };
    if (end.kind === 'restart') {
      const successor = spawnSuccessor(context, workspace, files, serving.generation, serving.server.port);
      const outcome = await handOver(serving, successor);
      if (outcome.verdict === 'baton-passed') {
        log(`Handed the board over to code ${outcome.successorCodeVersion} at ${outcome.url} under Baton ${outcome.generation}; exiting.`);
        serving.lifetime.stopListening();
        return;
      }
      if (outcome.verdict === 'kept-driving') {
        serving.lifetime.stopWatching();
        serving.lifetime.stopListening();
        serving.lifetime = hephaestusLifetime(request, files, serving.generation, log);
        handingOver = false;
        const drivenOn = serving;
        serving.drivePass.wake(true);
        current = drivenOn;
        continue;
      }
      serving.lifetime.stopListening();
      const failedGeneration = serving.generation + 1;
      const takeBack = (record: BatonRecord) => Baton.acquireAbove(files.hephaestusDirectory, record, failedGeneration);
      const { port } = serving.server;
      const rebound = await BatonPass.rebindAfterTakeBack({
        ports: platformPorts,
        successor,
        ...batonPassPollOf(BATON_PASS_REBIND_TRIES),
        bind:  () => startServing({ kind: 'given', port }, takeBack, () => undefined),
      });
      if (rebound.verdict !== 'bound') throw await lostPortRefusal(port, rebound);
      serving = rebound.bound;
      handingOver = false;
      continue;
    }
    serving.lifetime.stopWatching();
    serving.dataFolderWatch.stop();
    const stoppingServing = serving;
    const stopWaits: StopWait[] = [
      { name: 'the drive pass', run: () => stoppingServing.drivePass.stop() },
      ...(end.kind === 'stopped' && end.now ? [{
        name: 'the stop of the live lines',
        run:  async () => { await stoppingServing.boardChildren.stopLiveLines(); },
      }] : []),
      { name: 'the server stop', run: () => stoppingServing.server.stop() },
    ];
    try {
      await waitOutTheStopWaits(stopWaits, log, HEPHAESTUS_STOP_WAIT_MILLISECONDS);
      // A pass awaited by the stop waits can record a crash of Talos after the end settled.
      const crashRefusal = crashRefusalOrNull();
      if (crashRefusal !== null) {
        log('Crashed; staying off, keeping the Baton and the registry entry, until a start by hand.');
        throw crashRefusal;
      }
      if (end.kind === 'taken-over') {
        log('A newer Hephaestus took the board over; stopping without acting.');
        throw end.refusal;
      }
      await closeTheStoppedHephaestus(request, files, serving.generation, boardStore);
      crashableGeneration = null;
      log('Hephaestus stopped; its Baton is released.');
    } finally {
      serving.lifetime.stopListening();
    }
    return;
  }
}
