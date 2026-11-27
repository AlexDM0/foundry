/**
 * `start --foreground`: wins the Hephaestus lock, serves the board's API and lives until a stop signal, a `hephaestus-stop` command, a
 * `hephaestus-restart`, or a newer generation taking the board over, which ends it `hephaestus-lock-taken` (exit 2) without touching what the
 * new Hephaestus holds. A restart proves the code on disk in a preflight, ends this generation `handed-over` and starts the successor, which
 * `start --successor-of <generation>` runs as a start like any other.
 */
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync
} from 'node:fs';
import { dirname } from 'node:path';

import type { CrashedComponent }                                                     from '../../src/adapters/crash-log/@types/CrashLogRecord.ts';
import { writeOwnerOnlyFileAtomically }                                              from '../../src/lib/atomic-file/AtomicFile.ts';
import { GitProcess }                                                                from '../../src/lib/git/GitProcess.ts';
import { LocalTimeUtil }                                                             from '../../src/lib/local-time/LocalTimeUtil.ts';
import type { PlatformPorts }                                                        from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, sameBoot }                                            from '../../src/lib/process-identity/ProcessIdentity.ts';
import { QuietWatch }                                                                from '../../src/lib/quiet-watch/QuietWatch.ts';
import { TALOS_PROTOCOL_VERSION }                                                    from '../../src/lib/talos/constants/TalosProtocol.ts';
import type { StartOrigin }                                                          from '../../src/lib/tracker-model/@types/Job.ts';
import type { LogRecordFieldsOf }                                                    from '../../src/lib/tracker-model/@types/LogRecord.ts';
import { readingBoardOf }                                                            from '../../src/lib/tracker-model/ReadingBoard.ts';
import { finishHalfAppliedSetup }                                                    from '../../src/services/control/PipelineSetupControls.ts';
import { AgentProgramChecks }                                                        from '../../src/services/hephaestus/AgentProgramChecks.ts';
import { AgentSlots }                                                                from '../../src/services/hephaestus/AgentSlots.ts';
import type { BoardChildren }                                                        from '../../src/services/hephaestus/BoardChildren.ts';
import { CodeVersion }                                                               from '../../src/services/hephaestus/CodeVersion.ts';
import { CrashLog }                                                                  from '../../src/services/hephaestus/CrashLog.ts';
import { CrashPath, type CrashPathContext }                                          from '../../src/services/hephaestus/CrashPath.ts';
import { DataFolderWatch }                                                           from '../../src/services/hephaestus/DataFolderWatch.ts';
import { createDrivePass, type DrivePass }                                           from '../../src/services/hephaestus/DrivePass.ts';
import { EventBroker }                                                               from '../../src/services/hephaestus/EventBroker.ts';
import { hephaestusFilesIn, hephaestusTokenPathOf, type HephaestusFiles }            from '../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock, type HephaestusLockAcquisition, type HephaestusLockRecord } from '../../src/services/hephaestus/HephaestusLock.ts';
import type { HephaestusPortChoice }                                                 from '../../src/services/hephaestus/HephaestusPort.ts';
import { HephaestusServer, type HephaestusServer as StartedServer }                  from '../../src/services/hephaestus/HephaestusServer.ts';
import { createInstallChangeWatch, versionsFromTheBinary }                           from '../../src/services/hephaestus/InstallChangeWatch.ts';
import { type LeaseRenewal, startLeaseRenewal }                                      from '../../src/services/hephaestus/LeaseRenewal.ts';
import { MachineAgentLimit }                                                         from '../../src/services/hephaestus/MachineAgentLimit.ts';
import { MainLineReads }                                                             from '../../src/services/hephaestus/MainLineReads.ts';
import { MonitorSnapshotAssembly, type MonitorHephaestusFacts }                      from '../../src/services/hephaestus/MonitorSnapshotAssembly.ts';
import { MonitorStream }                                                             from '../../src/services/hephaestus/MonitorStream.ts';
import { Presence }                                                                  from '../../src/services/hephaestus/Presence.ts';
import { type RestartFailure, type RestartStepRun, Restart }                         from '../../src/services/hephaestus/Restart.ts';
import type { StartOriginReading }                                                   from '../../src/services/hephaestus/StartClassification.ts';
import { createTalosChildren }                                                       from '../../src/services/hephaestus/TalosChildren.ts';
import { type TalosConnection, connectToTalos }                                      from '../../src/services/hephaestus/TalosConnection.ts';
import { createLineRunner }                                                          from '../../src/services/hephaestus/TalosLines.ts';
import { quitTalosForRestart }                                                       from '../../src/services/hephaestus/TalosRestart.ts';
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
import { TicketDocumentsAssembly }    from '../../src/services/hephaestus/TicketDocumentsAssembly.ts';
import { createUnreadableBoardFiles } from '../../src/services/hephaestus/UnreadableBoardFiles.ts';
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
  fakeAgentIsOn,
  hephaestusPollIntervalOverride,
  outlivingProgramEnvironment
} from '../../src/shared/Environment.ts';
import { OperationRefusal }                from '../../src/shared/OperationRefusal.ts';
import { versionsAnswerOverride }          from '../../src/shared/VersionsAnswerOverride.ts';
import {
  HEPHAESTUS_STOP_INTERVAL_MILLISECONDS,
  HEPHAESTUS_STOP_TRIES,
  HEPHAESTUS_STOP_WAIT_MILLISECONDS,
  RESTART_PREFLIGHT_TIMEOUT_MILLISECONDS
} from '../../src/shared/constants/HephaestusLimits.ts';
import { agentCommandPreparationContextOf, preparedForgeAt }            from '../AgentCommandContext.ts';
import type { CommandContext }                                          from '../CommandContext.ts';
import { insideHephaestusControlContextOf }                             from '../CommandControlContext.ts';
import { hephaestusPollScheduleOf }                                     from '../HephaestusPollSchedule.ts';
import { requireCurrentInstall }                                        from '../InstallVersionCheck.ts';
import { PipelineAgentWording }                                         from '../PipelineAgentWording.ts';
import type { ArgumentParser }                                          from '../arguments/ArgumentParser.ts';
import { INSTALL_VERSION }                                              from '../constants/InstallVersion.ts';
import { OutputUtil }                                                   from '../utils/OutputUtil.ts';
import { type BoardRegistration, registerTheBoard }                     from './BoardRegistration.ts';
import { writeAsHephaestus }                                            from './HephaestusBoardWrites.ts';
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

/** The serving period of this process, under one Hephaestus lock generation. */
interface Serving {
  generation:      number;
  server:          StartedServer;
  drivePass:       DrivePass;
  dataFolderWatch: { stop: () => void };
  lifetime:        ReturnType<typeof hephaestusLifetime>;
  boardChildren:   BoardChildren;
}

const TOKEN_BYTES = 32;

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

function alreadyRunningRefusal(files: HephaestusFiles, generation: number, record: HephaestusLockRecord): OperationRefusal {
  const hephaestusLockFilePath = HephaestusLock.filePathFor(files.hephaestusDirectory, generation);
  return new OperationRefusal('refused', { kind: 'hephaestus-already-running', url: record.url, hephaestusLockFilePath });
}

export function requireNoLiveHephaestus(ports: PlatformPorts, files: HephaestusFiles): void {
  const newest = HephaestusLock.newestOf(ports, files.hephaestusDirectory);
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
  if (HephaestusLock.generationsIn(files.hephaestusDirectory).at(-1) !== generation) return;
  const stoppedAt = LocalTimeUtil.formatLocalIso(context.now());
  await registerHephaestus(request, { hephaestus: 'removed', presence: { state: 'stopped', generation, at: stoppedAt } });
  Presence.writeEnding(files, generation, { kind: 'stopped' }, stoppedAt);
  HephaestusLock.release(files.hephaestusDirectory, generation);
}

/**
 * The ending of a generation that released the board to its successor: presence, then the registry, say `handed-over`, and the board log
 * `handed-over`. `endingWritten` runs once presence holds the ending, so no crash is recorded over it.
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
  await writeAsHephaestus(boardStore, context, workspace, (transaction) => transaction.board.recordHephaestusStopped('handed-over', transaction.at));
}

/** The lease renewal's hook: each renewal Talos confirmed is one beat of this generation. */
export function heartbeatOnRenewalOf(files: HephaestusFiles, generation: number, log: (line: string) => void): (renewedAtWallMilliseconds: number) => void {
  return (renewedAtWallMilliseconds) => {
    Presence.writeHeartbeat(files, generation, LocalTimeUtil.formatLocalIso(new Date(renewedAtWallMilliseconds)), log);
  };
}

export interface StopWait {
  name: string;
  run:  () => Promise<unknown>;
}

/**
 * Runs the waits in turn, all of them under one bound, so a stop records itself and releases its Hephaestus lock before Windows ends a closed console's
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

function hephaestusLockRefusalOf(acquisition: Exclude<HephaestusLockAcquisition, { verdict: 'acquired' }>, files: HephaestusFiles): OperationRefusal {
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
      HephaestusLock.requireNewestGeneration(files.hephaestusDirectory, generation);
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

/** What the code on disk proves before a restart lets go of the board, holding no Hephaestus lock and writing nothing. */
function preflightSteps(workspace: Workspace, boardStore: BoardStore, boardChildren: BoardChildren): readonly RestartStepRun[] {
  const jobsOf = () => boardStore.reads.requireProgress().jobs ?? [];
  const steps: readonly RestartStepRun[] = [
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

/** `start --preflight`: this code reads what a start reads and prints its report as one line; it serves nothing. */
export async function runTheRestartPreflight(request: StoppedHephaestusRequest): Promise<void> {
  const { context, workspace } = request;
  const boardChildren = createTalosChildren({ boardFolder: workspace.trackerDirectory, platformPorts: context.platformPorts, connection: () => null });
  const report = await Restart.preflightReportOf(CodeVersion.onDisk(), preflightSteps(workspace, hephaestusBoardStoreOf(request), boardChildren));
  context.standardOutput(Restart.reportLineOf(report));
}

/** Runs the code on disk as a preflight and reads its report: `null` when it may take the board over. */
export async function preflightFailureOf(
  context: Pick<CommandContext, 'programCommand'>,
  workspace: Pick<Workspace, 'rootDirectory'>,
  files: Pick<HephaestusFiles, 'logFilePath'>,
  boundMilliseconds: number = RESTART_PREFLIGHT_TIMEOUT_MILLISECONDS,
): Promise<RestartFailure | null> {
  const successorCodeVersion = CodeVersion.onDisk();
  if (context.programCommand.length === 0) return { successorCodeVersion, step: 'spawn', error: 'this process has no program command to run the code on disk from' };
  const logFileDescriptor = openSync(files.logFilePath, 'a');
  let boundTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const child = Bun.spawn([...context.programCommand, 'start', '--preflight'], {
      cwd:         workspace.rootDirectory,
      env:         outlivingProgramEnvironment(),
      stdin:       'ignore',
      stdout:      'pipe',
      stderr:      logFileDescriptor,
      windowsHide: true,
    });
    // A clock on purpose: a preflight that hangs must end in an actual time, or the restart is never answered.
    const boundReached = new Promise<'bound-reached'>((resolve) => {
      boundTimer = setTimeout(() => resolve('bound-reached'), boundMilliseconds);
    });
    const ended = await Promise.race([child.exited.then(() => 'ended' as const), boundReached]);
    if (ended === 'bound-reached') {
      child.kill();
      return { successorCodeVersion, step: 'preflight', error: `the preflight left no report within ${boundMilliseconds} ms` };
    }
    const output = await new Response(child.stdout).text();
    return Restart.failureOf(Restart.reportIn(output), successorCodeVersion, `the preflight exited ${child.exitCode} with no report`);
  } catch (thrown) {
    return { successorCodeVersion, step: 'spawn', error: thrown instanceof Error ? thrown.message : String(thrown) };
  } finally {
    clearTimeout(boundTimer);
    closeSync(logFileDescriptor);
  }
}

/** Why a start whose Talos cannot serve is refused: one of another protocol is never started again, and one that never served stops the start. */
export function talosStartRefusalOf(availability: Extract<TalosAvailability, { verdict: 'held' | 'unavailable' }>): OperationRefusal {
  if (availability.verdict === 'held') {
    const { answeredProtocolVersion } = availability;
    return new OperationRefusal('unrepaired', { kind: 'talos-protocol-differs', requiredProtocolVersion: TALOS_PROTOCOL_VERSION, answeredProtocolVersion });
  }
  return new OperationRefusal('unrepaired', { kind: 'talos-unavailable', reason: availability.reason, startNumber: availability.startNumber });
}

/** The successor on the code on disk, spawned once this Hephaestus let go, so it outlives it; `null` when it did not start. */
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

/** The Hephaestus that handed over starts its successor as its last act, so the successor waits for that process to end; one still live refuses it. */
async function waitForThePredecessorToEnd(ports: PlatformPorts, files: HephaestusFiles, predecessorGeneration: number): Promise<void> {
  const schedule = hephaestusPollScheduleOf({ tries: HEPHAESTUS_STOP_TRIES, intervalMilliseconds: HEPHAESTUS_STOP_INTERVAL_MILLISECONDS }, hephaestusPollIntervalOverride());
  for (let attempt = 0; attempt < schedule.tries; attempt++) {
    const newest = HephaestusLock.newestOf(ports, files.hephaestusDirectory);
    if (newest.verdict !== 'live' || newest.generation !== predecessorGeneration) return;
    await Bun.sleep(schedule.intervalMilliseconds);
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
  if (request.successorOf !== undefined) await waitForThePredecessorToEnd(platformPorts, files, request.successorOf);
  requireNoLiveHephaestus(platformPorts, files);

  const readIdentity = platformPorts.processSupervision.identityOf(process.pid);
  if (readIdentity === null) {
    const identitySources = platformPorts.processSupervision.identitySourcesOf(process.pid);
    throw new OperationRefusal('unrepaired', { kind: 'hephaestus-identity-unreadable', processId: process.pid, identitySources });
  }
  const ownIdentity: ProcessIdentity = readIdentity;
  const codeVersion = CodeVersion.onDisk();
  const log         = hephaestusLoggerOf(context, files);
  const unreadableBoardFiles = createUnreadableBoardFiles(log);
  const origin: StartOriginReading = request.successorOf === undefined
    ? { startOrigin: request.startOrigin }
    : { startOrigin: 'successor', predecessorGeneration: request.successorOf };
  const { startOrigin } = origin;
  // Before any Hephaestus lock, port or Talos, so a start that stays off leaves nothing a later start would read as its own.
  const startAdmission = await admitTheStart({
    context, workspace, boardStore, files, origin, log, unreadableBoardFiles
  });
  // Git runs at the repository's root, never in a tracker's folder below it.
  const { repositoryRoot } = projectLocationOf(workspace.rootDirectory);
  const mainLine    = mainLineOf(repositoryRoot);
  const branchNames = branchNamesOf(progress.branchNamespace ?? null);
  const mergeForecastCache = createMergeForecastCache();
  const mainLineReads = new MainLineReads(workspace.rootDirectory);
  // A run of an agent program that ended is published by a pass, so the views read whether the program runs.
  const agentProgramCheckContext = agentCommandPreparationContextOf(context, preparedForgeAt(context, workspace.rootDirectory, boardStore.reads)).check;
  const agentProgramChecks = new AgentProgramChecks(agentProgramCheckContext, () => current?.drivePass.wake(true));
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
    unreadableBoardFiles,
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
    talosChildren:      () => (followedTalosStartNumber === null ? null : persistedChildRecordsOf(workspace.trackerDirectory, followedTalosStartNumber, unreadableBoardFiles)),
    stopLeaseRenewal:   () => leaseRenewal?.stop(),
    writeRegistryCrash: (report) => registerHephaestus(request, { presence: report }),
    stampNow:           () => LocalTimeUtil.formatLocalIso(context.now()),
    log,
    unreadableBoardFiles,
  });
  crashPathReach.contextNow = () => (crashableGeneration === null ? null : crashPathContextOf(crashableGeneration));

  /** Runs the crash path once for the serving generation and ends the foreground loop `crashed`. */
  async function recordTheCrash(generation: number, component: CrashedComponent, error: Parameters<typeof CrashPath.record>[1]['error']): Promise<void> {
    const outcome = await CrashPath.record(crashPathContextOf(generation), { component, error });
    recordedCrash = { component, crashLogPath: outcome.crashLogPath };
    log(`Crashed (${component}) under Hephaestus lock ${generation}; the crash log is ${outcome.crashLogPath ?? 'not written'} (${outcome.crashLog}).`);
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
  // While the code on disk proves itself this Hephaestus still drives, so a stop is taken; once it releases, every command is too late.
  let preflightRunning = false;
  let restartWarning: RestartFailure | null = null;
  let printedTheUrl = false;

  const hephaestusState = () => {
    const passState = current?.drivePass.state();
    if (passState === undefined) return null;
    return { ...passState, runtimeState: handingOver ? 'restarting' as const : passState.runtimeState, restartWarning };
  };

  /** Binds, takes a generation, records the start, ensures Talos and regroups every child; what it took is let go on a failure. */
  async function startServing(portChoice: HephaestusPortChoice): Promise<Serving> {
    const admission = startAdmission;
    let lifetime: ReturnType<typeof hephaestusLifetime> | null = null;
    let drivePass: DrivePass | null = null;
    let broker: EventBroker | null = null;
    let monitorStream: MonitorStream | null = null;
    let servedUrl: string | null = null;
    let servedGeneration: number | null = null;
    let startedAt: string | null = null;
    let started = false;
    const hephaestusFactsNow = () => {
      const state = hephaestusState();
      return {
        state:           state?.runtimeState ?? 'serving',
        url:             servedUrl,
        generation:      state?.generation ?? null,
        codeVersion,
        installVersion:  INSTALL_VERSION,
        restartWarning:  state?.restartWarning ?? null,
        unreadableFiles: unreadableBoardFiles.files(),
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
        log,
        wake:             (forced) => drivePass?.wake(forced),
        launchesHeld:     () => hephaestusState()?.runtimeState === 'held-by-install-change',
        notices:          () => hephaestusState()?.notices ?? [],
        hephaestus:       hephaestusFactsNow,
        mainLine,
        mergeForecastCache,
        mainLineReads,
        silentSweepsOf:   (jobId: string) => current?.drivePass.silentSweepsOf(jobId) ?? 0,
        effectReadings:   () => drivePass?.effectReadings ?? null,
        agentProgramChecks,
        onRuntimeCommand: async (command: RuntimeHephaestusCommand): Promise<RuntimeCommandOutcome> => {
          log(`${command.kind} received${'now' in command && command.now ? ' (now)' : ''}.`);
          if (current === null || (handingOver && !preflightRunning)) return command.kind === 'talos-restart' ? 'nothing-to-do' : 'done';
          if (command.kind === 'talos-restart') {
            const outcome = await quitTalosForRestart(talosConnection);
            log(`Talos ${followedTalosStartNumber ?? 'none'} was asked to quit for a clean restart: ${outcome}.`);
            return outcome;
          }
          if (command.kind === 'hephaestus-restart') {
            // Set at once, so a second command during this restart starts no second preflight.
            if (preflightRunning) return 'done';
            handingOver = true;
            preflightRunning = true;
            const failure = await preflightFailureOf(context, workspace, files).finally(() => { preflightRunning = false; });
            if (failure !== null) {
              await recordRestartFailure(failure);
              handingOver = false;
              throw new OperationRefusal('refused', { kind: 'restart-failed', ...failure, url: server.url });
            }
            restartWarning = null;
            current?.lifetime.restart();
            return 'done';
          }
          current.lifetime.stopFor(command.kind, command.now);
          return 'done';
        },
      }),
    });

    const record: HephaestusLockRecord = {
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
    let acquisition: HephaestusLockAcquisition;
    try {
      acquisition = HephaestusLock.acquire(platformPorts, files.hephaestusDirectory, record);
    } catch (refusal) {
      await server.stop();
      throw refusal;
    }
    if (acquisition.verdict !== 'acquired') {
      await server.stop();
      throw hephaestusLockRefusalOf(acquisition, files);
    }
    const { generation, unreadableTakenOver } = acquisition;
    if (unreadableTakenOver !== undefined) {
      log(`The Hephaestus lock ${unreadableTakenOver.hephaestusLockFilePath} could not be read (${unreadableTakenOver.reason}); generation ${generation} took it over.`);
    }
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
          agentProgramChecks,
        });
        ownBroker.publishState(read.state, TicketDocumentsAssembly.fingerprintsOf({
          loadedRecords: read.board.ticketDocumentRecords(), tickets: read.board.tickets(), pipeline: read.board.pipeline(), jobs: read.board.jobs()
        }));
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
      await writeAsHephaestus(boardStore, context, workspace, (transaction) => {
        // Before the record it looks for: only the first start on a board submits the v16 leftovers.
        transaction.board.submitFirstRunLeftovers(transaction.at);
        // In the hold, so no command names a picture between the read of the references and the sweep.
        PictureStore.sweepUnreferenced(workspace.trackerDirectory, PictureStore.referencedPictureIdsOf(transaction.board.logRecordsSoFar(), transaction.board.jobs()));
        finishHalfAppliedSetup(transaction, insideHephaestusControlContextOf(context.agentAdapter));
        const hephaestusStarted = transaction.board.recordHephaestusStarted({ codeVersion, installVersion: INSTALL_VERSION }, transaction.at);
        transaction.board.recordStartClassified(startClassifiedFieldsOf(admission, startOrigin), transaction.at);
        return hephaestusStarted;
      });
      log(`Hephaestus serving ${server.url} under Hephaestus lock ${generation} (code ${codeVersion}, install version ${INSTALL_VERSION}, agents ${context.agentAdapter.vendor}).`);

      const startedLifetime = lifetime;
      drivePass = createDrivePass({
        platformPorts,
        workspace,
        boardStore,
        now:                       context.now,
        formatStamp:               (moment) => LocalTimeUtil.formatLocalIso(moment),
        hephaestusDirectory:       files.hephaestusDirectory,
        generation,
        boardChildren,
        lineRunner,
        ensureTalosIfLost,
        unreadableBoardFiles,
        programCommand:            context.programCommand,
        codeVersion,
        agentAdapter:              context.agentAdapter,
        monitorFolder,
        inheritedEnvironment:      environmentCopy(),
        mainLine,
        branchNames,
        installVersionChanged:     installWatch.installVersionChanged,
        installVersionsKnown:      installWatch.versionsSettled,
        agentVariableIsSet,
        newCodeOnDisk:             installWatch.newCodeOnDisk,
        decisionWordingOf:         (draft) => HephaestusWording.decisionWordingOf(draft, context.agentAdapter),
        packageNeedWordingOf:      HephaestusWording.packageNeedWordingOf,
        dependentFixWordingOf:     HephaestusWording.dependentFixWordingOf,
        launchTextOf:              (job, facts) => HephaestusWording.launchTextOf(job, facts, context.agentAdapter.promptFills),
        assistantChatTextOf:       HephaestusWording.assistantChatTextOf,
        windDownMessage:           HephaestusWording.windDownMessage(),
        resumeMessage:             HephaestusWording.resumeMessage(),
        redHandoffMessageOf:       HephaestusWording.redHandoffMessageOf,
        answerMessageOf:           HephaestusWording.answerMessageOf,
        setupMessageWordingOf:     (message) => PipelineAgentWording.setupMessageWordingOf(message, context.agentAdapter.promptFills),
        homeDirectory:             context.homeDirectory,
        log,
        onHephaestusLockTakenOver: (refusal) => (current?.lifetime ?? startedLifetime).takenOver(refusal),
        onPassCrashed:             (thrown) => recordThePassCrash(generation, thrown),
        watchHatchFolder:          (hatchDirectory) => dataFolderWatch?.watchHatchFolder(hatchDirectory),
        unwatchHatchFolder:        (hatchDirectory) => dataFolderWatch?.unwatchHatchFolder(hatchDirectory),
        afterPass:                 publishState,
        startClassification:       admission.classification,
        // The fake agent's runtime is its program, so a scratch forge that names no agent still launches its scripted sessions.
        ...(fakeAgentIsOn() ? { agentProgramWhenNoneIsChosen: process.execPath } : {}),
      });
      const startedPass = drivePass;
      startedPass.effectReadings.onChanged(ownBroker.announceTicketDocuments);
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
        onRenewed:            heartbeatOnRenewalOf(files, generation, log),
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
      HephaestusLock.release(files.hephaestusDirectory, generation);
      throw thrown;
    }
  }

  /**
   * A restart's release: a landing in progress finishes, no effect batch starts, the ending `handed-over` is written and the listener closes.
   * Talos is sent nothing, and the lease renewal goes on until this process exits, so the successor's own renewal overlaps it.
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

  async function recordRestartFailure(failure: RestartFailure): Promise<void> {
    restartWarning = failure;
    log(`The restart was refused at ${failure.step}: ${failure.error}. This Hephaestus keeps driving.`);
    await writeAsHephaestus(boardStore, context, workspace, (transaction) => transaction.board.recordRestartFailed(failure, transaction.at));
  }

  /** A successor that cannot serve leaves the board with no Hephaestus after a restart, which the registry then says, so a monitor alerts. */
  async function registerTheFailedSuccessor(predecessorGeneration: number, thrown: unknown): Promise<void> {
    const error = CrashLog.errorOf('pass', thrown);
    await registerHephaestus(request, {
      presence: {
        state:      'crashed',
        generation: predecessorGeneration,
        at:         LocalTimeUtil.formatLocalIso(context.now()),
        crash:      {
          component: 'hephaestus', suspected: false, errorName: error.name, errorMessage: error.message, crashLogPath: null
        },
      },
    });
    log(`The successor of Hephaestus lock ${predecessorGeneration} could not serve, so no Hephaestus is on the board: ${error.message}`);
  }

  const serving = await startServing(request.portChoice).catch(async (thrown: unknown) => {
    // A start that lost to a live Hephaestus leaves the board served.
    const boardIsServed = HephaestusLock.newestOf(platformPorts, files.hephaestusDirectory).verdict === 'live';
    if (request.successorOf !== undefined && !boardIsServed) await registerTheFailedSuccessor(request.successorOf, thrown);
    throw thrown;
  });

  const settledEnd = await serving.lifetime.ended;
  // A crash recorded while another end settled first still ends the loop crashed; the stop waits are checked again below.
  const crashSeen = recordedCrashNow();
  const end: HephaestusEnd = crashSeen === null ? settledEnd : { kind: 'crashed', ...crashSeen };
  if (end.kind === 'restart') {
    log(`Handing the board over to the code on disk (Hephaestus lock ${serving.generation}).`);
    try {
      await release(serving);
    } finally {
      serving.lifetime.stopListening();
    }
    // The lock is kept and dies with this process, so the successor takes the next generation and no client reads a generation twice.
    const successor = spawnSuccessor(context, workspace, files, serving.generation, serving.server.port);
    if (successor === null) {
      await registerTheFailedSuccessor(serving.generation, new Error('the successor could not be started'));
      return;
    }
    log(`Started the successor as process ${successor.processId}; exiting.`);
    return;
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
      log('Crashed; staying off, keeping the Hephaestus lock and the registry entry, until a start by hand.');
      throw crashRefusal;
    }
    if (end.kind === 'taken-over') {
      log('A newer Hephaestus took the board over; stopping without acting.');
      throw end.refusal;
    }
    await closeTheStoppedHephaestus(request, files, serving.generation, boardStore);
    crashableGeneration = null;
    log('Hephaestus stopped; its Hephaestus lock is released.');
  } finally {
    serving.lifetime.stopListening();
  }
}
