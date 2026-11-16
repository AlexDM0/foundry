/**
 * `oversee` in the foreground: wins the Baton, serves the board's API and lives until a stop signal, a `overseer-stop` command, a Baton pass to a
 * successor on the code on disk after `overseer-restart`, or a newer generation taking the board over, which ends it `baton-taken`
 * (exit 2) without touching what the new Overseer holds. `oversee --successor-of <generation>` is that successor's side of the Baton pass.
 */
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync
} from 'node:fs';
import { dirname } from 'node:path';

import { createProgressPageStubWriter }                   from '../../src/adapters/progress-page/ProgressPageStubWriter.ts';
import { writeOwnerOnlyFileAtomically }                   from '../../src/lib/atomic-file/AtomicFile.ts';
import { GitProcess }                                     from '../../src/lib/git/GitProcess.ts';
import { LocalTimeUtil }                                  from '../../src/lib/local-time/LocalTimeUtil.ts';
import type { PlatformPorts }                             from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                           from '../../src/lib/process-identity/ProcessIdentity.ts';
import { QuietWatch }                                     from '../../src/lib/quiet-watch/QuietWatch.ts';
import { readingBoardOf }                                 from '../../src/lib/tracker-model/ReadingBoard.ts';
import { WATCHER_PROTOCOL_VERSION }                       from '../../src/lib/watcher/constants/WatcherProtocol.ts';
import { finishHalfAppliedSetup }                         from '../../src/services/control/PipelineSetupControls.ts';
import { mainLineOf }                                     from '../../src/services/lifecycle/MergeTargets.ts';
import { AgentSlots }                                     from '../../src/services/overseer/AgentSlots.ts';
import { Baton, type BatonAcquisition, type BatonRecord } from '../../src/services/overseer/Baton.ts';
import {
  type BatonPassFailure,
  type BatonPassOutcome,
  type BatonPassSchedule,
  type BatonPassStep,
  type BatonPassStepRun,
  type RebindOutcome,
  BatonPass
} from '../../src/services/overseer/BatonPass.ts';
import { CodeVersion }                                              from '../../src/services/overseer/CodeVersion.ts';
import { DataFolderWatch }                                          from '../../src/services/overseer/DataFolderWatch.ts';
import { createDrivePass, type DrivePass }                          from '../../src/services/overseer/DrivePass.ts';
import { EventBroker }                                              from '../../src/services/overseer/EventBroker.ts';
import { createInstallChangeWatch, versionsFromTheBinary }          from '../../src/services/overseer/InstallChangeWatch.ts';
import { LegacyWatcherReader }                                      from '../../src/services/overseer/LegacyWatcherReader.ts';
import { MachineAgentLimit }                                        from '../../src/services/overseer/MachineAgentLimit.ts';
import { MainLineReads }                                            from '../../src/services/overseer/MainLineReads.ts';
import { MonitorSnapshotAssembly, type MonitorOverseerFacts }       from '../../src/services/overseer/MonitorSnapshotAssembly.ts';
import { MonitorStream }                                            from '../../src/services/overseer/MonitorStream.ts';
import { overseerFilesIn, overseerTokenPathOf, type OverseerFiles } from '../../src/services/overseer/OverseerFiles.ts';
import type { OverseerPortChoice }                                  from '../../src/services/overseer/OverseerPort.ts';
import { OverseerServer, type OverseerServer as StartedServer }     from '../../src/services/overseer/OverseerServer.ts';
import { WATCHER_ENTRY_PATH, WatcherBundle }                        from '../../src/services/overseer/WatcherBundle.ts';
import { WatcherFleet }                                             from '../../src/services/overseer/WatcherFleet.ts';
import { registerWithTheMonitor, type MonitorRegistrationRequest }  from '../../src/services/tracker/MonitorRegistration.ts';
import { PictureStore }                                             from '../../src/services/tracker/PictureStore.ts';
import { projectLocationOf }                                        from '../../src/services/tracker/ProjectLocation.ts';
import { requireProgressFile }                                      from '../../src/services/tracker/TrackerReader.ts';
import type { Workspace }                                           from '../../src/services/tracker/Workspace.ts';
import { branchNamesOf }                                            from '../../src/shared/BranchNames.ts';
import {
  apiBillingKeyIsSet,
  environmentCopy,
  outlivingProgramEnvironment,
  overseerPollIntervalOverride,
  versionsAnswerOverride
} from '../../src/shared/Environment.ts';
import { OperationRefusal }         from '../../src/shared/OperationRefusal.ts';
import {
  BATON_PASS_READY_INTERVAL_MILLISECONDS,
  BATON_PASS_READY_TRIES,
  BATON_PASS_REBIND_TRIES,
  BATON_PASS_RELEASE_TRIES,
  OVERSEER_STOP_WAIT_MILLISECONDS
} from '../../src/shared/constants/OverseerLimits.ts';
import type { CommandContext }                               from '../CommandContext.ts';
import { COMMAND_CONTROL_CONTEXT }                           from '../CommandControlContext.ts';
import { requireCurrentInstall }                             from '../InstallVersionCheck.ts';
import { openTrackerForWriting }                             from '../OpenTrackerForWriting.ts';
import type { ArgumentParser }                               from '../arguments/ArgumentParser.ts';
import { CLAUDE_MANAGED_BLOCK_MARKERS }                      from '../constants/ClaudeManagedBlockMarkers.ts';
import { INSTALL_VERSION }                                   from '../constants/InstallVersion.ts';
import { OutputUtil }                                        from '../utils/OutputUtil.ts';
import { type OverseerFlintBrain, createOverseerFlintBrain } from './OverseerFlintBrain.ts';
import { type OverseerPollSchedule, overseerPollScheduleOf } from './OverseerPollSchedule.ts';
import { OverseerWording }                                   from './OverseerWording.ts';
import { createMergeForecastCache, readBoardState }          from './routes/BoardStateReader.ts';
import type { RuntimeOverseerCommand }                       from './routes/CommandRoute.ts';
import { overseerRoutesOf }                                  from './routes/OverseerRoutes.ts';

export interface ForegroundRunRequest {
  commandArguments: ArgumentParser;
  context:          CommandContext;
  workspace:        Workspace;
  portChoice:       OverseerPortChoice;
  /** Set for `oversee --successor-of <generation>`: the generation this process takes the board over from. */
  successorOf?:     number;
}

export type StoppedOverseerRequest = Pick<ForegroundRunRequest, 'commandArguments' | 'context' | 'workspace'>;

type OverseerEnd = { kind: 'stopped'; how: string; now: boolean } | { kind: 'restart' } | { kind: 'taken-over'; refusal: unknown };

/** One serving period under one Baton generation; a Baton pass that failed after the release starts another in the same process. */
interface Serving {
  generation: number;
  server:     StartedServer;
  drivePass:  DrivePass;
  watcher:    { stop: () => void };
  lifetime:   ReturnType<typeof overseerLifetime>;
  /** Lives and ends with the serving period: a Baton pass or a stop ends a running brain. */
  flintBrain: OverseerFlintBrain;
}

const TOKEN_BYTES            = 32;

function batonPassPollOf(tries: number): OverseerPollSchedule {
  return overseerPollScheduleOf({ tries, intervalMilliseconds: BATON_PASS_READY_INTERVAL_MILLISECONDS }, overseerPollIntervalOverride());
}

function batonPassSchedule(): BatonPassSchedule {
  const readyPoll = batonPassPollOf(BATON_PASS_READY_TRIES);
  return {
    readyTries:           readyPoll.tries,
    releaseTries:         batonPassPollOf(BATON_PASS_RELEASE_TRIES).tries,
    intervalMilliseconds: readyPoll.intervalMilliseconds,
  };
}

/** Every line goes to standard error and is appended to `<data>/overseer.log`, which a reader tails, so it is never rewritten whole. */
function overseerLoggerOf(context: CommandContext, files: OverseerFiles): (line: string) => void {
  return (line: string) => {
    const stampedLine = `${LocalTimeUtil.formatLocalIso(context.now())} ${line}`;
    context.standardError(stampedLine);
    try {
      appendFileSync(files.logFilePath, `${stampedLine}\n`);
    } catch {
      // The log is a convenience: a full disk never stops an Overseer that is otherwise serving.
    }
  };
}

function alreadyRunningRefusal(files: OverseerFiles, generation: number, record: BatonRecord): OperationRefusal {
  const batonFilePath = Baton.batonFilePathFor(files.overseerDirectory, generation);
  return new OperationRefusal('refused', { kind: 'overseer-already-running', url: record.url, batonFilePath });
}

export function requireNoLiveOverseer(ports: PlatformPorts, files: OverseerFiles): void {
  const newest = Baton.newestBatonOf(ports, files.overseerDirectory);
  if (newest.verdict === 'live') throw alreadyRunningRefusal(files, newest.generation, newest.record);
}

/** A registry that cannot be written never fails the Overseer; the monitor only loses its pointer. */
async function registerOverseer(request: StoppedOverseerRequest, overseer: MonitorRegistrationRequest['overseer']): Promise<void> {
  const { context, workspace } = request;
  await registerWithTheMonitor({
    workspace,
    monitorFolder:        context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory),
    temporaryDirectories: context.temporaryDirectories,
    command:              context.commandVerb,
    program:              context.programPath,
    now:                  context.now,
    lockHolderIsGone:     context.platformPorts.processSupervision.processIsGone,
    ...(overseer === undefined ? {} : { overseer }),
  });
}

/**
 * What ends a generation, run by its Overseer or, for one that ended before its stop finished, by the CLI once its process is gone. An Overseer
 * that started meanwhile keeps its registry entry and its page; only the record of the stop is written for it.
 */
export async function closeTheStoppedOverseer(request: StoppedOverseerRequest, files: OverseerFiles, generation: number): Promise<void> {
  const { commandArguments, context, workspace } = request;
  await openTrackerForWriting(commandArguments, context, (change) => change.board.recordOverseerStopped('stopped', change.at));
  if (Baton.batonGenerationsIn(files.overseerDirectory).at(-1) !== generation) return;
  await registerOverseer(request, 'removed');
  createProgressPageStubWriter(workspace.htmlFilePath).write(null);
  Baton.release(files.overseerDirectory, generation);
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

function batonRefusalOf(acquisition: Exclude<BatonAcquisition, { verdict: 'acquired' }>, files: OverseerFiles): OperationRefusal {
  if (acquisition.verdict === 'contended') return new OperationRefusal('refused', { kind: 'overseer-contended', overseerDirectory: files.overseerDirectory });
  return alreadyRunningRefusal(files, acquisition.generation, acquisition.record);
}

/** Resolves once the Overseer should end or hand over, and is settled at most once. */
function overseerLifetime(request: ForegroundRunRequest, files: OverseerFiles, generation: number, log: (line: string) => void) {
  let finish: (end: OverseerEnd) => void = () => undefined;
  const ended = new Promise<OverseerEnd>((resolve) => { finish = resolve; });
  // Each drive pass checks before its effects; this watch ends an idle Overseer as soon as a newer generation appears.
  const beforeEffectBatch = () => {
    try {
      Baton.requireNewestGeneration(files.overseerDirectory, generation);
    } catch (refusal) {
      finish({ kind: 'taken-over', refusal });
    }
  };
  const watcher     = QuietWatch.watchQuietly({ folderPath: files.overseerDirectory, recursive: false, onEvent: beforeEffectBatch });
  const unsubscribe = request.context.onStopSignal(() => {
    log('Stop signal received.');
    finish({ kind: 'stopped', how: 'signal', now: false });
  });
  return {
    ended,
    stopFor:       (how: string, now: boolean) => finish({ kind: 'stopped', how, now }),
    restart:       () => finish({ kind: 'restart' }),
    takenOver:     (refusal: unknown) => finish({ kind: 'taken-over', refusal }),
    stopWatching:  () => watcher?.close(),
    // Kept until the stop has finished, so a second SIGTERM during it is taken as the same stop rather than killing it halfway.
    stopListening: unsubscribe,
  };
}

function tipOf(repositoryRoot: string, branch: string): string | null {
  const tip = GitProcess.run(repositoryRoot, ['rev-parse', '--verify', '--quiet', branch]);
  return GitProcess.succeeded(tip) ? tip.standardOutput.trim() : null;
}

/** Read on every look: an `update` while the Overseer serves leaves the manifest ahead of the code in memory. */
function manifestMatchesIn(repositoryRoot: string): boolean {
  try {
    requireCurrentInstall(repositoryRoot);
    return true;
  } catch {
    return false;
  }
}

/** What the successor proves before it reports `ready`, holding no Baton and writing nothing but its bundles. */
function preparationSteps(request: ForegroundRunRequest, pinWatcherBundle: () => Promise<string>): readonly BatonPassStepRun[] {
  const { workspace } = request;
  const jobsOf = () => requireProgressFile(workspace).jobs ?? [];
  const steps: readonly BatonPassStepRun[] = [
    {
      step: 'build-bundles',
      run:  async () => { await pinWatcherBundle(); },
    },
    { step: 'read-board', run: () => { readingBoardOf(requireProgressFile(workspace), [], []); } },
    {
      step: 'read-jobs',
      run:  () => {
        for (const job of jobsOf()) {
          if (!Number.isSafeInteger(job.watcherInstance) || !Number.isSafeInteger(job.eventCursor.sequence)) {
            throw new Error(`job ${job.id} has no readable Watcher instance or cursor`);
          }
        }
      },
    },
    {
      step: 'read-watcher-files',
      run:  () => {
        for (const job of jobsOf()) {
          const jobFolder = WatcherFleet.jobFolderOf(workspace.trackerDirectory, job.id);
          if (WatcherFleet.livenessOf(request.context.platformPorts, jobFolder, job.watcherInstance).verdict === 'unclaimed') continue;
          const record = WatcherFleet.watcherRecordOf(jobFolder, job.watcherInstance);
          if (record === null) throw new Error(`watcher ${job.watcherInstance} of job ${job.id} has no readable Watcher file`);
          if (!LegacyWatcherReader.readableEventLogFormats().includes(record.eventLogFormatVersion)) {
            throw new Error(`watcher ${job.watcherInstance} of job ${job.id} writes event-log format ${record.eventLogFormatVersion}, which this code does not read`);
          }
          if (WatcherFleet.eventsAfter(jobFolder, job.watcherInstance, 0) === 'malformed') {
            throw new Error(`the event log of Watcher ${job.watcherInstance} of job ${job.id} is malformed`);
          }
        }
      },
    },
    { step: 'install-version', run: () => { requireCurrentInstall(workspace.rootDirectory); } },
  ];
  return steps;
}

/** The successor on the code on disk, spawned so it outlives this Overseer; `null` when it did not start. */
export function spawnSuccessor(
  context: Pick<CommandContext, 'programCommand' | 'platformPorts'>,
  workspace: Pick<Workspace, 'rootDirectory'>,
  files: Pick<OverseerFiles, 'logFilePath'>,
  generation: number,
  port: number,
): ProcessIdentity | null {
  if (context.programCommand.length === 0) return null;
  // Its own lines reach the log through its logger; what it prints before it has one, such as a refusal, is appended here.
  const logFileDescriptor = openSync(files.logFilePath, 'a');
  try {
    const child = Bun.spawn([...context.programCommand, 'oversee', '--successor-of', String(generation), '--port', String(port)], {
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

export async function runOverseerInTheForeground(request: ForegroundRunRequest): Promise<void> {
  const { context, workspace } = request;
  const progress = requireProgressFile(workspace);
  const files    = overseerFilesIn(workspace.trackerDirectory);
  const { platformPorts } = context;
  const tokenFilePath = overseerTokenPathOf(platformPorts.dataFolders.monitorFolderOf(context.homeDirectory), progress.trackerId);
  // Read before anything is written, so a malformed test setting refuses the start rather than an Overseer half started.
  const versionsAnswer = versionsAnswerOverride();
  mkdirSync(files.overseerDirectory, { recursive: true });
  // Before any worker starts: a folder absent when a sandbox is wrapped would go undenied.
  platformPorts.ownerOnlyFiles.restrictFolder(dirname(tokenFilePath));
  if (request.successorOf === undefined) requireNoLiveOverseer(platformPorts, files);

  const readIdentity = platformPorts.processSupervision.identityOf(process.pid);
  if (readIdentity === null) {
    const identitySources = platformPorts.processSupervision.identitySourcesOf(process.pid);
    throw new OperationRefusal('unrepaired', { kind: 'overseer-identity-unreadable', processId: process.pid, identitySources });
  }
  const ownIdentity: ProcessIdentity = readIdentity;
  const codeVersion = CodeVersion.onDisk();
  const log         = overseerLoggerOf(context, files);
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

  let watcherBundlePath: string | null = null;
  const pinWatcherBundle = async (): Promise<string> => {
    watcherBundlePath ??= await WatcherBundle.pinWatcherBundle({ overseerDirectory: files.overseerDirectory, codeVersion, entryPath: WATCHER_ENTRY_PATH });
    return watcherBundlePath;
  };

  let token: string | null = null;
  let current: Serving | null = null;
  let handingOver = false;
  let batonPassWarning: BatonPassFailure | null = null;
  let printedTheUrl = false;

  const overseerState = () => {
    const passState = current?.drivePass.state();
    if (passState === undefined) return null;
    return { ...passState, runtimeState: handingOver ? 'passing-baton' as const : passState.runtimeState, batonPassWarning };
  };

  /** Binds, takes a generation through `acquireBaton`, records the start and regroups every Watcher; whatever it took is let go on a failure. */
  async function startServing(
    portChoice: OverseerPortChoice,
    acquireBaton: (record: BatonRecord) => BatonAcquisition,
    enterStep: (step: BatonPassStep) => void,
  ): Promise<Serving> {
    const bundlePath = await pinWatcherBundle();
    // Set once the Baton is taken; a brain change before then has no stream to reach.
    let publishFlintBrainChange: () => void = () => undefined;
    const overseerFlintBrain = createOverseerFlintBrain({
      commandArguments:  request.commandArguments,
      context,
      workspace,
      trackerId:         progress.trackerId,
      repositoryRoot,
      watcherBundlePath: bundlePath,
      codeVersion,
      publish:           () => publishFlintBrainChange(),
      log,
    });
    const flintBrainReading = () => overseerFlintBrain.brain.reading();
    let lifetime: ReturnType<typeof overseerLifetime> | null = null;
    let drivePass: DrivePass | null = null;
    enterStep('bind-port');
    let broker: EventBroker | null = null;
    let monitorStream: MonitorStream | null = null;
    let servedUrl: string | null = null;
    let servedGeneration: number | null = null;
    let startedAt: string | null = null;
    let started = false;
    const overseerFactsNow = () => {
      const state = overseerState();
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
    const monitorFactsNow = (): MonitorOverseerFacts | null => {
      if (servedUrl === null || servedGeneration === null || startedAt === null) return null;
      return {
        trackerId:      progress.trackerId,
        root:           workspace.rootDirectory,
        state:          overseerFactsNow().state,
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
    const server = OverseerServer.start({
      portChoice,
      ...(versionsAnswer === undefined ? {} : { versions: versionsAnswer }),
      now:      context.now,
      identity: {
        trackerId: progress.trackerId, project: progress.project, codeVersion, installVersion: INSTALL_VERSION, processId: process.pid,
      },
      routes: overseerRoutesOf({
        commandArguments: request.commandArguments,
        context,
        workspace,
        token:            () => token,
        started:          () => started,
        broker:           () => broker,
        monitorStream:    () => monitorStream,
        monitorFacts:     monitorFactsNow,
        flintBrain:       overseerFlintBrain.brain,
        flintBrainReading,
        wake:             () => drivePass?.wake(),
        launchesHeld:     () => overseerState()?.runtimeState === 'held-by-install-change',
        notices:          () => overseerState()?.notices ?? [],
        overseer:         overseerFactsNow,
        mainLine,
        mergeForecastCache,
        mainLineReads,
        silentSweepsOf:   (jobId: string) => current?.drivePass.silentSweepsOf(jobId) ?? 0,
        onRuntimeCommand: (command: RuntimeOverseerCommand) => {
          log(`${command.kind} received${command.now ? ' (now)' : ''}.`);
          if (current === null || handingOver) return;
          if (command.kind === 'overseer-restart') {
          // Set at once, so a second command during this Baton pass never overwrites what the successor reported.
            handingOver = true;
            // Written before the command is answered, so whoever sent it never reads an earlier Baton pass's outcome.
            BatonPass.writeBatonPass(BatonPass.batonPassFilePathOf(files.overseerDirectory, current.generation), { state: 'requested' });
            current.lifetime.restart();
            return;
          }
          current.lifetime.stopFor(command.kind, command.now);
        },
      }),
    });

    enterStep('take-baton');
    const record: BatonRecord = {
      processId:              ownIdentity.processId,
      processStartStamp:      ownIdentity.startStamp,
      bootIdentity:           ownIdentity.bootIdentity,
      port:                   server.port,
      url:                    server.url,
      tokenFile:              tokenFilePath,
      codeVersion,
      installVersion:         INSTALL_VERSION,
      watcherProtocolVersion: WATCHER_PROTOCOL_VERSION,
    };
    let acquisition: BatonAcquisition;
    try {
      acquisition = acquireBaton(record);
    } catch (refusal) {
      await server.stop();
      await overseerFlintBrain.close();
      throw refusal;
    }
    if (acquisition.verdict !== 'acquired') {
      await server.stop();
      await overseerFlintBrain.close();
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
          notices:        () => overseerState()?.notices ?? [],
          overseer:       overseerFactsNow,
          silentSweepsOf: (jobId) => current?.drivePass.silentSweepsOf(jobId) ?? 0,
          mainLine,
          mergeForecastCache,
          mainLineReads,
          flintBrainReading,
        });
        ownBroker.publishState(read.state);
        const monitorFacts = monitorFactsNow();
        if (monitorFacts !== null) ownMonitorStream.publish(MonitorSnapshotAssembly.monitorSnapshotOf({ ...read, overseer: monitorFacts, now: context.now() }));
      } catch (thrown) {
        log(`The board state could not be read for the event stream: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      }
    };
    broker           = ownBroker;
    monitorStream    = ownMonitorStream;
    publishFlintBrainChange = publishState;
    servedUrl        = server.url;
    servedGeneration = generation;
    startedAt        = LocalTimeUtil.formatLocalIso(context.now());
    const servingStartedAt = startedAt;
    let watcher: DataFolderWatch | null = null;
    try {
      token    = writeToken(platformPorts, tokenFilePath);
      lifetime = overseerLifetime(request, files, generation, log);
      enterStep('regroup');
      await openTrackerForWriting(request.commandArguments, context, (change) => {
        // Before the record it looks for: only the first start on a board submits the v16 leftovers.
        change.board.submitFirstRunLeftovers(change.at);
        // In the hold, so no command names a picture between the read of the references and the sweep.
        PictureStore.sweepUnreferenced(workspace.trackerDirectory, PictureStore.referencedPictureIdsOf(change.board.logRecordsSoFar(), change.board.jobs()));
        finishHalfAppliedSetup(change, COMMAND_CONTROL_CONTEXT);
        return change.board.recordOverseerStarted({ codeVersion, installVersion: INSTALL_VERSION }, change.at);
      });
      log(`Overseer serving ${server.url} under Baton ${generation} (code ${codeVersion}, install version ${INSTALL_VERSION}, agents ${context.agentAdapter.vendor}).`);

      const startedLifetime = lifetime;
      drivePass = createDrivePass({
        platformPorts,
        workspace,
        now:                   context.now,
        formatStamp:           (moment) => LocalTimeUtil.formatLocalIso(moment),
        overseerDirectory:     files.overseerDirectory,
        generation,
        watcherBundlePath:     bundlePath,
        programCommand:        context.programCommand,
        codeVersion,
        agentAdapter:          context.agentAdapter,
        monitorFolder:         context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory),
        inheritedEnvironment:  environmentCopy(),
        mainLine,
        branchNames,
        managedBlockMarker:    CLAUDE_MANAGED_BLOCK_MARKERS.start,
        installVersionChanged: installWatch.installVersionChanged,
        installVersionsKnown:  installWatch.versionsSettled,
        apiBillingKeyIsSet,
        newCodeOnDisk:         installWatch.newCodeOnDisk,
        decisionWordingOf:     OverseerWording.decisionWordingOf,
        launchTextOf:          OverseerWording.launchTextOf,
        assistantChatTextOf:   OverseerWording.assistantChatTextOf,
        windDownMessage:       OverseerWording.windDownMessage(),
        resumeMessage:         OverseerWording.resumeMessage(),
        redHandoffMessageOf:   OverseerWording.redHandoffMessageOf,
        answerMessageOf:       OverseerWording.answerMessageOf,
        setupMessageWordingOf: OverseerWording.setupMessageWordingOf,
        homeDirectory:         context.homeDirectory,
        log,
        onBatonTakenOver:      (refusal) => (current?.lifetime ?? startedLifetime).takenOver(refusal),
        watchHatchFolder:      (hatchDirectory) => watcher?.watchHatchFolder(hatchDirectory),
        unwatchHatchFolder:    (hatchDirectory) => watcher?.unwatchHatchFolder(hatchDirectory),
        afterPass:             publishState,
      });
      const startedPass = drivePass;
      watcher = DataFolderWatch.startWatching({
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
      const serving: Serving = {
        generation, server, drivePass, watcher, lifetime, flintBrain: overseerFlintBrain
      };
      current = serving;
      publishState();
      // The identity, the registry, the page stub and the print give out the URL only once the synchronous start is done: a recursive
      // watch can block the event loop for many seconds on a loaded macOS, and a client that had the URL earlier waited that long.
      started = true;
      await registerOverseer(request, {
        url: server.url, processId: process.pid, startedAt: servingStartedAt, tokenPath: tokenFilePath
      });
      createProgressPageStubWriter(workspace.htmlFilePath).write(server.url);
      if (!printedTheUrl) OutputUtil.printEntity(request.commandArguments, context, { url: server.url, generation }, server.url);
      printedTheUrl = true;
      await installWatch.learnVersionsOnDisk();
      await drivePass.regroup();
      return serving;
    } catch (thrown) {
      watcher?.stop();
      lifetime?.stopWatching();
      lifetime?.stopListening();
      await overseerFlintBrain.close();
      await drivePass?.stop();
      await server.stop();
      Baton.release(files.overseerDirectory, generation);
      throw thrown;
    }
  }

  /** The release half of a Baton pass: a landing in progress finishes, no effect batch starts, and the listener closes; no Watcher is sent anything. */
  async function release(serving: Serving): Promise<void> {
    handingOver = true;
    serving.lifetime.stopWatching();
    serving.watcher.stop();
    await serving.flintBrain.close();
    await serving.drivePass.stop();
    await openTrackerForWriting(request.commandArguments, context, (change) => change.board.recordOverseerStopped('baton-passed', change.at));
    await serving.server.stop();
    log('Released the board to the successor.');
  }

  async function handOver(serving: Serving, successor: ProcessIdentity | null): Promise<BatonPassOutcome> {
    log(`Handing the board over to the code on disk (Baton ${serving.generation}).`);
    return await BatonPass.handOver({
      ports:                platformPorts,
      batonPassFilePath:    BatonPass.batonPassFilePathOf(files.overseerDirectory, serving.generation),
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
    log(`The Baton pass failed at ${failure.step}: ${failure.error}. This Overseer keeps driving.`);
    await openTrackerForWriting(request.commandArguments, context, (change) => change.board.recordBatonPassFailed(failure, change.at));
  }

  /** A taken-back board whose port never came free: the failure, naming the port, is logged and recorded before the Overseer exits 1. */
  async function lostPortRefusal(port: number, rebound: Exclude<RebindOutcome<Serving>, { verdict: 'bound' }>): Promise<OperationRefusal> {
    const cause = rebound.verdict === 'successor-live' ? 'the killed successor was still live' : rebound.error;
    const failure: BatonPassFailure = {
      successorCodeVersion: CodeVersion.onDisk(),
      step:                 'bind-port',
      error:                `port ${port} could not be bound again within ${batonPassPollOf(BATON_PASS_REBIND_TRIES).tries} tries: ${cause}`,
    };
    batonPassWarning = failure;
    log(`Taking the board back failed: ${failure.error}. This Overseer exits with no Overseer on the board.`);
    await openTrackerForWriting(request.commandArguments, context, (change) => change.board.recordBatonPassFailed(failure, change.at));
    return new OperationRefusal('refused', { kind: 'baton-pass-failed', ...failure, url: null });
  }

  /** Proves the new code, waits for the release, then serves; a failure is left in the Baton pass file and the process exits 1. */
  async function takeOverAsSuccessor(predecessorGeneration: number): Promise<Serving> {
    const batonPassFilePath = BatonPass.batonPassFilePathOf(files.overseerDirectory, predecessorGeneration);
    const admission = await BatonPass.prepareAndAwaitRelease({
      batonPassFilePath,
      codeVersion,
      predecessorIsLive: () => {
        const newest = Baton.newestBatonOf(platformPorts, files.overseerDirectory);
        return newest.verdict === 'live' && newest.generation === predecessorGeneration;
      },
      schedule: batonPassSchedule(),
    }, preparationSteps(request, pinWatcherBundle));
    if (admission === 'failed') {
      const report = BatonPass.readBatonPass(batonPassFilePath);
      const reported = report?.state === 'successor-failed' || report?.state === 'failed';
      const failure  = reported ? report : { successorCodeVersion: codeVersion, step: 'report-ready', error: 'no report was left' };
      throw new OperationRefusal('refused', {
        kind: 'baton-pass-failed', successorCodeVersion: failure.successorCodeVersion, step: failure.step, error: failure.error, url: null
      });
    }
    log(admission === 'released' ? `Baton ${predecessorGeneration} released the board; taking it over.` : `Baton ${predecessorGeneration} is gone; starting as after a crash.`);
    return await startAsSuccessor(predecessorGeneration, admission);
  }

  let serving = request.successorOf === undefined
    ? await startServing(request.portChoice, (record) => Baton.acquire(platformPorts, files.overseerDirectory, record), () => undefined)
    : await takeOverAsSuccessor(request.successorOf);

  async function startAsSuccessor(predecessorGeneration: number, admission: 'released' | 'predecessor-gone'): Promise<Serving> {
    let step: BatonPassStep = 'bind-port';
    const batonPassFilePath = BatonPass.batonPassFilePathOf(files.overseerDirectory, predecessorGeneration);
    try {
      const acquireBaton = admission === 'released'
        ? (record: BatonRecord) => Baton.acquireAbove(files.overseerDirectory, record, predecessorGeneration)
        : (record: BatonRecord) => Baton.acquire(platformPorts, files.overseerDirectory, record);
      const started = await startServing(request.portChoice, acquireBaton, (entered) => { step = entered; });
      BatonPass.reportServing({ batonPassFilePath, codeVersion }, started.generation, started.server.url);
      return started;
    } catch (thrown) {
      BatonPass.reportFailure({ batonPassFilePath, codeVersion }, step, thrown, admission === 'released');
      throw thrown;
    }
  }

  for (;;) {
    const end = await serving.lifetime.ended;
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
        serving.lifetime = overseerLifetime(request, files, serving.generation, log);
        handingOver = false;
        const drivenOn = serving;
        serving.drivePass.wake(true);
        current = drivenOn;
        continue;
      }
      serving.lifetime.stopListening();
      const failedGeneration = serving.generation + 1;
      const takeBack = (record: BatonRecord) => Baton.acquireAbove(files.overseerDirectory, record, failedGeneration);
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
    serving.watcher.stop();
    const stoppingServing = serving;
    const stopWaits: StopWait[] = [
      // First, so the run it ends is logged while the board is still this Overseer's.
      { name: 'the stop of Flint\'s brain', run: () => stoppingServing.flintBrain.close() },
      { name: 'the drive pass', run: () => stoppingServing.drivePass.stop() },
      ...(end.kind === 'stopped' && end.now ? [{
        name: 'the stop of the live process Watchers',
        run:  async () => {
          const stoppedWatchers = await WatcherFleet.stopLiveProcessWatchers(platformPorts, workspace.trackerDirectory);
          log(`Stopped ${stoppedWatchers} live process Watcher${stoppedWatchers === 1 ? '' : 's'}.`);
        },
      }] : []),
      // A Watcher ending after the last pass would otherwise wait for an acknowledgement until the next Overseer.
      { name: 'the reap of ended Watchers', run: () => WatcherFleet.reapEndedWatchers(platformPorts, workspace.trackerDirectory) },
      { name: 'the server stop', run: () => stoppingServing.server.stop() },
    ];
    try {
      await waitOutTheStopWaits(stopWaits, log, OVERSEER_STOP_WAIT_MILLISECONDS);
      if (end.kind === 'taken-over') {
        log('A newer Overseer took the board over; stopping without acting.');
        throw end.refusal;
      }
      await closeTheStoppedOverseer(request, files, serving.generation);
      log('Overseer stopped; its Baton is released.');
    } finally {
      serving.lifetime.stopListening();
    }
    return;
  }
}
