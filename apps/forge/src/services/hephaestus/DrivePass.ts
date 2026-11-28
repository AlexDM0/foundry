/**
 * Hephaestus's one serial pass: wake-ups coalesce into one queue; each pass observes outside the lock, then applies relayed commands, the
 * children's events and the Playbook in one transaction of the board's store, and runs its effects after the Hephaestus lock check.
 */
import { mkdirSync }               from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { unreadablePipelineGateOf }         from '../../adapters/gate-outcome/UnreadablePipelineGate.ts';
import type { Job }                         from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline }                    from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                       from '../../domain/tracker-model/Board.ts';
import { FORCED_STOP_REFUSED_INTERRUPTION } from '../../domain/tracker-model/constants/JobStates.ts';
import { LaunchSlotUtil }                   from '../../domain/tracker-model/utils/LaunchSlotUtil.ts';
import { confinedLineOf }                   from '../../lib/gate-confinement/ConfinedLine.ts';
import type { EffectReadingSource }         from '../../shared/@types/EffectReading.ts';
import { WorktreesFolder }                  from '../../shared/WorktreesFolder.ts';
import { AIRLOCK_LIMITS }                   from '../../shared/constants/AirlockLimits.ts';
import {
  GATE_RUNS_AT_ONCE,
  GATE_SLOT_RETRY_MILLISECONDS,
  QUIET_JOB_SWEEPS,
  SESSION_STOP_GRACE_MILLISECONDS
} from '../../shared/constants/HephaestusLimits.ts';
import { LIFECYCLE_LIMITS }                                              from '../../shared/constants/LifecycleLimits.ts';
import type { ConfinedGateLine, GateConfinement }                        from '../lifecycle/GateRun.ts';
import { Landing }                                                       from '../lifecycle/Landing.ts';
import { MergeRun }                                                      from '../lifecycle/MergeRun.ts';
import { ReviewOutcome }                                                 from '../lifecycle/ReviewOutcome.ts';
import { lockTakerOf }                                                   from '../tracker/LockHolders.ts';
import { projectLocationOf }                                             from '../tracker/ProjectLocation.ts';
import type { AgentProgramRefused, LaunchRefusal }                       from './@types/AgentLaunchRefusal.ts';
import { type AirlockHoldRunner, type DeclinedCleanup }                  from './@types/Airlocks.ts';
import type { DrivePassRequest }                                         from './@types/DrivePassRequest.ts';
import type { AbandonedPass, HephaestusNotice, HephaestusStateDocument } from './@types/HephaestusStateDocument.ts';
import { type JobLaunchContext }                                         from './@types/JobLaunchContext.ts';
import type { PresenceUpdate }                                           from './@types/PresenceRecord.ts';
import { AbandonedPassReason }                                           from './AbandonedPassReason.ts';
import { AgentChildLaunch }                                              from './AgentChildLaunch.ts';
import { AgentConfigHits }                                               from './AgentConfigHits.ts';
import { AgentSlots }                                                    from './AgentSlots.ts';
import { AirlockFactsFile }                                              from './AirlockFactsFile.ts';
import { AirlockSandboxIncident, type UnmadeAirlockAgentRoot }           from './AirlockSandboxIncident.ts';
import { createAirlocks }                                                from './Airlocks.ts';
import { AnswerDelivery }                                                from './AnswerDelivery.ts';
import { ApiBillingStops }                                               from './ApiBillingStops.ts';
import { AssistantBoot }                                                 from './AssistantBoot.ts';
import { AssistantSession }                                              from './AssistantSession.ts';
import type { ChildLiveness }                                            from './BoardChildren.ts';
import { BuildJobPass }                                                  from './BuildJobPass.ts';
import { BuildJobSessions }                                              from './BuildJobSessions.ts';
import { ChildEvents }                                                   from './ChildEvents.ts';
import { DocumentAgentSessions }                                         from './DocumentAgentSessions.ts';
import { EffectReadings }                                                from './EffectReadings.ts';
import { EndedJobTokens }                                                from './EndedJobTokens.ts';
import { EntityDecisionAnswers }                                         from './EntityDecisionAnswers.ts';
import { GateProfiling }                                                 from './GateProfiling.ts';
import { GateRunSlots }                                                  from './GateRunSlots.ts';
import { GroupWorktrees }                                                from './GroupWorktrees.ts';
import { HatchInbox }                                                    from './HatchInbox.ts';
import { hephaestusFilesIn }                                             from './HephaestusFiles.ts';
import { HephaestusLock }                                                from './HephaestusLock.ts';
import { IncidentRouter }                                                from './IncidentRouter.ts';
import { InstructionFiles }                                              from './InstructionFiles.ts';
import { IntakeSessions }                                                from './IntakeSessions.ts';
import { type EndedJobSession, JobControlDelivery }                      from './JobControlDelivery.ts';
import { JobResumption }                                                 from './JobResumption.ts';
import { JobSandbox }                                                    from './JobSandbox.ts';
import { LaunchAgentPrograms }                                           from './LaunchAgentPrograms.ts';
import { LineSandbox }                                                   from './LineSandbox.ts';
import { MachineAgentLimit }                                             from './MachineAgentLimit.ts';
import { mergedTreeGateStampOf, runMergedTreeGates }                     from './MergedTreeGateRun.ts';
import { createMergedTreeGateRuns }                                      from './MergedTreeGateRuns.ts';
import { PassDecisions }                                                 from './PassDecisions.ts';
import { PassNotices }                                                   from './PassNotices.ts';
import { PassObservation, type ChildObservation, type Observation }      from './PassObservation.ts';
import { PipelineAgentSessions }                                         from './PipelineAgentSessions.ts';
import { PipelineChecking }                                              from './PipelineChecking.ts';
import { Presence }                                                      from './Presence.ts';
import { REAL_PROCESS_STARTS }                                           from './ProcessStarts.ts';
import { ReconcileCauses }                                               from './ReconcileCauses.ts';
import { RefusedForcedStops }                                            from './RefusedForcedStops.ts';
import { Regrouping, type RegroupingReport }                             from './Regrouping.ts';
import { stopLiveLinesUnder as stopLiveLinesUnderAt }                    from './TalosLines.ts';
import { thrownNamedOf }                                                 from './ThrownNaming.ts';
import { UnreadableJobFileIncident, type UnreadableJobFile }             from './UnreadableJobFileIncident.ts';
import { type UsageLimitHit, UsageLimits }                               from './UsageLimits.ts';
import { WaiverAnswers }                                                 from './WaiverAnswers.ts';
import { WorkerProfiles }                                                from './WorkerProfiles.ts';
import { ABANDONED_PASSES_BEFORE_NOTICE }                                from './constants/PresenceLimits.ts';

export interface DrivePass {
  /** Run once at start, before the first pass, which it then runs forced: its one hold applies everything regrouping found. */
  regroup:        () => Promise<RegroupingReport>;
  /** Coalesced: wakes during a pass add exactly one more pass. `forced` runs it even when nothing observed changed. */
  wake:           (forced?: boolean) => void;
  /**
   * The backstop sweep: counts each running job's quiet sweeps and wakes a forced pass to open `quiet-job` for one that reached the count,
   * and to recheck a target the last pass held.
   */
  sweep:          () => void;
  /** The sweeps a running build or review has been quiet for, which a client tints; 0 for any other job. */
  silentSweepsOf: (jobId: string) => number;
  /** Resolves once no pass is running or queued. */
  idle:           () => Promise<void>;
  /** The number of the pass running now, counted from 1 over this DrivePass's life; `null` between passes. */
  passInFlight:   () => number | null;
  state:          () => HephaestusStateDocument;
  /** The effect readings this Hephaestus runs and keeps in memory, which User's effect read asks for and a client reads. */
  effectReadings: EffectReadingSource;
  /** No pass starts after it; resolves once the one running, a landing in it included, has finished, and each gate profile run has ended. */
  stop:           () => Promise<void>;
}

/** Under the monitor folder, so every Hephaestus of the machine shares the gate run slots. */
const GATE_SLOTS_FOLDER = 'gate-slots';

const MERGE_GATE_PROFILES_FOLDER = 'merge-gate-profiles';

/** The sandbox profiles of the gate profiles' lines, in the hephaestus folder: these confine a profile's run, never record one. */
const GATE_PROFILE_SANDBOXES_FOLDER = 'gate-profile-sandboxes';

/** The sandbox profiles of the pipeline checks' lines, in the hephaestus folder, one per setup record. */
const PIPELINE_CHECK_SANDBOXES_FOLDER = 'pipeline-check-sandboxes';

/** A first Apply's constitution commit runs before any pipeline is stored: its request waits, or its job holds the main line's slot. */
function constitutionCommitIsDue(board: Board): boolean {
  const state = board.pipelineSetup()?.applyRequest?.state;
  return state === 'committing' || state === 'held' || board.jobs().some((job) => job.kind === 'constitution-commit');
}

export function createDrivePass(request: DrivePassRequest): DrivePass {
  const spawnedInstances = new Set<string>();
  let lastFingerprint: string | null = null;
  let running: Promise<void> | null = null;
  let wokenAgain = false;
  let forcedNext = false;
  let passesStarted = 0;
  // A number, never a time: the lease renewal withholds itself while the same pass stays in flight.
  let passInFlight: number | null = null;
  const quietJobWatch = IncidentRouter.createQuietJobWatch(QUIET_JOB_SWEEPS);
  const quietJobIdsDue: string[] = [];
  const forcedStopRetryJobIdsDue: string[] = [];
  let jobsAtTheLastPass: readonly Readonly<Job>[] = [];
  let targetsHeldAtTheLastPass = 0;
  const assistantQuietWatch = AssistantSession.createAssistantQuietWatch(QUIET_JOB_SWEEPS);
  const quietAssistantIdsDue: string[] = [];
  let assistantsMidTurnAtTheLastPass: readonly string[] = [];
  let assistantWasOnAtTheLastPass = false;
  let assistantBootRetryRequested = false;
  let state: HephaestusStateDocument = {
    generation: request.generation, passes: 0, runtimeState: 'serving', notices: [], ticketsWaitingForMachineSlot: 0
  };
  let stopped = false;
  let abandonedPassesInARow = 0;
  let lastAbandonedPass: AbandonedPass | null = null;
  const presenceFiles = hephaestusFilesIn(request.workspace.trackerDirectory);
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const leftoverWorktrees: string[] = [];
  let declinedCleanups: DeclinedCleanup[] = [];
  const startKind = request.startClassification?.kind ?? null;
  const causeOfAChildGoneAtTheStart = startKind === null ? null : ReconcileCauses.causeOfAGoneChild(startKind);
  // True until the start's forced first pass has run: every child a pass finds lost until then is one the start found gone.
  let startIsBeingReconciled = causeOfAChildGoneAtTheStart !== null;
  const childrenGoneAtTheStart = new Set<string>();
  const worktreesRoot = WorktreesFolder.worktreesRootOf(request.workspace.rootDirectory);
  // Read once for Hephaestus's life: a project moved in its repository moves only while no Hephaestus runs.
  const projectLocation = projectLocationOf(request.workspace.rootDirectory);
  const { platformPorts } = request;
  const landingLockTaker = lockTakerOf(platformPorts.processSupervision, request.onStaleLockTakenOver);
  const sharedRepository = projectLocation.projectPrefix === ''
    ? null
    : Landing.sharedRepositoryLandingOf(projectLocation, request.boardStore.reads.requireProgress().trackerId, request.now, landingLockTaker);
  const sessionStopGraceMilliseconds = request.sessionStopGraceMilliseconds ?? SESSION_STOP_GRACE_MILLISECONDS;
  const gateSlots = GateRunSlots.createGateRunSlots({
    ports:             platformPorts,
    folder:            join(request.monitorFolder, GATE_SLOTS_FOLDER),
    limit:             GATE_RUNS_AT_ONCE,
    holderIsLive:      (holding) => GateRunSlots.gateRunHolderIsLive(request.boardChildren, platformPorts, holding),
    retryMilliseconds: request.gateSlotRetryMilliseconds ?? GATE_SLOT_RETRY_MILLISECONDS,
    log:               request.log,
  });

  const unreadableAgentSlotPathsLogged = new Set<string>();

  /** Read afresh each pass, so a machine limit another Hephaestus or the `machine limit` verb set holds from the next launch. */
  function agentSlotsOfThisPass(): ReturnType<typeof AgentSlots.createAgentSlots> {
    const ceiling = request.machineAgentCeiling ?? MachineAgentLimit.cpuCeiling();
    return AgentSlots.createAgentSlots({
      monitorFolder:             request.monitorFolder,
      limit:                     MachineAgentLimit.readingIn(request.monitorFolder, ceiling).limit,
      ownProcess:                platformPorts.processSupervision.identityOf(process.pid),
      hephaestusIsLive:          AgentSlots.hephaestusIsLiveWith(platformPorts),
      log:                       request.log,
      unreadableSlotPathsLogged: unreadableAgentSlotPathsLogged,
    });
  }
  const jobLaunchContext: JobLaunchContext = {
    platformPorts,
    workspace:            request.workspace,
    agentAdapter:         request.agentAdapter,
    monitorFolder:        request.monitorFolder,
    homeDirectory:        request.homeDirectory,
    inheritedEnvironment: request.inheritedEnvironment,
    mainLine:             request.mainLine,
    branchNames:          request.branchNames,
    boardChildren:        request.boardChildren,
    programCommand:       request.programCommand,
    codeVersion:          request.codeVersion,
    gateSlots,
    windDownMessage:      request.windDownMessage,
    decisionWordingOf:    request.decisionWordingOf,
    log:                  request.log,
    resolutionLinesOf:    MergeRun.resolutionLinesOf,
    ...(sharedRepository === null ? {} : { sharedRepository }),
    lostLineCause:        () => (startIsBeingReconciled ? causeOfAChildGoneAtTheStart : null),
  };
  const endedJobTokensContext = { boardChildren: request.boardChildren, agentAdapter: request.agentAdapter };
  const endedJobIdsExamined = new Set<string>();
  let endedSessionsAwaitingQuit: EndedJobSession[] = [];
  const triedPipelineAgentSnapshots = new Set<string>();
  const triedDocumentAgentSnapshots = new Set<string>();

  /**
   * A gate step Hephaestus runs itself, under the profile a gate line child gets, its own network and `writes`, in `worktreePath`; `pipeline`
   * names the entity homes whose configuration folder it denies.
   */
  function hephaestusGateLineOf(
    worktreePath: string, profilePath: string, pipeline: Readonly<Pipeline> | null, commandArguments: readonly string[], confinement: GateConfinement
  ): ConfinedGateLine {
    const sandboxFacts = WorkerProfiles.sandboxFactsOf({
      repositoryRoot:                projectLocation.repositoryRoot,
      projectPrefix:                 projectLocation.projectPrefix,
      dataFolder:                    request.workspace.trackerDirectory,
      monitorFolder:                 request.monitorFolder,
      homeDirectory:                 request.homeDirectory,
      worktree:                      worktreePath,
      ownBranch:                     '',
      mainLine:                      request.mainLine,
      branchNames:                   request.branchNames,
      hatchDirectory:                '',
      sandboxDenyShape:              request.agentAdapter.sandboxDenyShape,
      credentialPaths:               request.agentAdapter.credentialPathsOf(request.homeDirectory),
      agentConfigurationFolderNames: request.agentAdapter.configurationNames.folderNames,
      // A gate step runs no agent session, so no network guard hook.
      guardCommand:                  null,
      ...JobSandbox.cacheFolderFactsOf(jobLaunchContext),
    });
    const facts = { ...sandboxFacts, ...WorkerProfiles.entityFactsOf(pipeline) };
    const planOf = () => LineSandbox.planOf(JobSandbox.processSandboxRequestOf(jobLaunchContext, facts, confinement), profilePath);
    const deniedRoot = WorkerProfiles.unmadeDeniedRootOf(facts);
    if (deniedRoot !== null) return { verdict: 'refused', refusal: { code: 'denied-root-unmade', deniedRoot } };
    const line = confinedLineOf(platformPorts.gateConfinement, planOf, commandArguments);
    if (line.verdict === 'runs') return line;
    return { verdict: 'refused', refusal: { code: 'confinement-refused', confinementRefusal: { cause: 'confinement-unavailable', unavailability: line.unavailability } } };
  }

  /** A merge gate step in the slot's worktree; one profile file per worktree. */
  function mergeGateLineOf(worktreePath: string, pipeline: Readonly<Pipeline> | null, commandArguments: readonly string[], confinement: GateConfinement): ConfinedGateLine {
    const profileFolder = join(hephaestusFilesIn(request.workspace.trackerDirectory).hephaestusDirectory, MERGE_GATE_PROFILES_FOLDER);
    return hephaestusGateLineOf(worktreePath, join(profileFolder, `${basename(worktreePath)}.sb`), pipeline, commandArguments, confinement);
  }

  /** The stored pipeline as the store judges it, read at each confined line of a gate profile or a pipeline check; `null` when unreadable. */
  function storedPipeline(): Readonly<Pipeline> | null {
    const reading = request.boardStore.reads.readPipeline();
    return reading.verdict === 'readable' ? reading.pipeline : null;
  }

  const processStarts = request.processStarts ?? REAL_PROCESS_STARTS;
  const stopLiveLinesUnder = (folder: string): Promise<void> => stopLiveLinesUnderAt(request.boardChildren, folder);

  const mergedTreeGateRuns = createMergedTreeGateRuns({
    boardFolder: request.workspace.trackerDirectory,
    wake,
    log:         request.log,
    stopLiveLinesUnder,
  });

  /** A gate's slot is held by its child folder, whose parent must exist for it to read live; this Hephaestus answers for it until its line is recorded. */
  async function acquireGateSlotFor(holder: string, stopSignal: AbortSignal): Promise<() => void> {
    mkdirSync(dirname(holder), { recursive: true });
    return await gateSlots.acquire(holder, stopSignal);
  }

  const holdTracker: AirlockHoldRunner = async (mutate) => (await request.boardStore.transactions.transact({
    at:     request.formatStamp(request.now()),
    mutate: (change) => {
      HephaestusLock.requireNewestGeneration(request.hephaestusDirectory, request.generation);
      // A copy: ending a job splices it out of the Board's live list.
      const jobsAtTheHoldStart = [...change.board.jobs()];
      const result = mutate({ board: change.board, at: change.at });
      EndedJobTokens.creditJobsEndedInTheHold(change.board, endedJobTokensContext, jobsAtTheHoldStart, change.at);
      return result;
    },
  })).result;

  const gateProfiling = GateProfiling.createGateProfiling({
    workspace:       request.workspace,
    worktreesRoot,
    mainLine:        request.mainLine,
    platformPorts,
    gateSlots,
    gateEnvironment: (profiledSteps) => JobSandbox.gateEnvironmentOf(jobLaunchContext, profiledSteps),
    confinedLineIn:  (worktreePath, profileRunId) => (commandArguments, confinement) => {
      const profileFolder = join(hephaestusFilesIn(request.workspace.trackerDirectory).hephaestusDirectory, GATE_PROFILE_SANDBOXES_FOLDER);
      return hephaestusGateLineOf(worktreePath, join(profileFolder, `${profileRunId}.sb`), storedPipeline(), commandArguments, confinement);
    },
    hold:              holdTracker,
    wake:              () => wake(true),
    log:               request.log,
    runGateLines:      processStarts.runGateLines,
    runLine:           request.lineRunner,
    stopLiveLinesUnder,
    findingSentenceOf: request.findingSentenceOf,
  });

  const pipelineChecking = PipelineChecking.createPipelineChecking({
    workspace:       request.workspace,
    worktreesRoot,
    mainLine:        request.mainLine,
    platformPorts,
    gateSlots,
    gateEnvironment: (checkedSteps) => JobSandbox.gateEnvironmentOf(jobLaunchContext, checkedSteps),
    confinedLineIn:  (worktreePath, setupId) => (commandArguments, confinement) => {
      const profileFolder = join(hephaestusFilesIn(request.workspace.trackerDirectory).hephaestusDirectory, PIPELINE_CHECK_SANDBOXES_FOLDER);
      return hephaestusGateLineOf(worktreePath, join(profileFolder, `${setupId}.sb`), storedPipeline(), commandArguments, confinement);
    },
    hold:                  holdTracker,
    wake:                  () => wake(true),
    log:                   request.log,
    runProposalTwice:      processStarts.runProposalTwice,
    runLine:               request.lineRunner,
    stopLiveLinesUnder,
    setupMessageWordingOf: request.setupMessageWordingOf,
    checkReasonSentenceOf: request.checkReasonSentenceOf,
  });

  const hatchFolderOfLaunchedJob = new Map<string, string>();

  const effectReadings = EffectReadings.createEffectReadings({ wake: () => wake(true), nowMilliseconds: () => request.now().getTime() });
  const relayedControlContext = HatchInbox.relayedContextWith(effectReadings);

  /** Talos is asked to stop the session, after the grace the session has to end by itself. */
  async function stopSession(jobId: string, childInstance: number): Promise<void> {
    await request.boardChildren.stop(request.boardChildren.jobFolderOf(jobId), childInstance, sessionStopGraceMilliseconds);
  }

  function unwatchHatchFoldersOfEndedJobs(board: Board): void {
    for (const [jobId, hatchDirectory] of hatchFolderOfLaunchedJob) {
      if (board.jobById(jobId) !== undefined) continue;
      request.unwatchHatchFolder?.(hatchDirectory);
      hatchFolderOfLaunchedJob.delete(jobId);
    }
  }

  const airlocks = createAirlocks({
    ...(sharedRepository === null ? {} : { sharedRepository }),
    ...(projectLocation.projectPrefix === '' ? {} : { projectPrefix: projectLocation.projectPrefix }),
    repositoryRoot: projectLocation.repositoryRoot,
    mainLine:       request.mainLine,
    branchNames:    request.branchNames,
    worktreesRoot,
    worktreeOf:     (ticketId) => WorktreesFolder.ticketWorktreeOf(request.workspace.rootDirectory, ticketId),
    limits:         AIRLOCK_LIMITS,
    agentNaming:    request.agentAdapter,
    get refDeniesHold() {
      return LineSandbox.refDeniesHoldUnder(platformPorts.gateConfinement);
    },
    hold:             holdTracker,
    mergedTreeGateOf: (worktreePath, treeId, phase, gatedEntities, ownerJobId) => {
      // Read afresh at every ask, so a pipeline changed by hand or by a `gate` verb gates the next tree without a restart, and the stamp
      // keys the run: a changed pipeline is another run, and its outcome names the gates it ran.
      const reading  = request.boardStore.reads.readPipeline();
      const unreadable = unreadablePipelineGateOf(reading);
      if (unreadable !== null) return unreadable;
      const pipeline = reading.verdict === 'readable' ? reading.pipeline : null;
      return mergedTreeGateRuns.gateOf({
        worktreePath,
        treeId,
        phase,
        gatedEntities,
        stamp: mergedTreeGateStampOf(pipeline, phase, gatedEntities),
        ownerJobId,
        run:   async (runFolder, stopSignal) => await runMergedTreeGates({
          pipeline,
          phase,
          gatedEntities,
          runRequest: {
            shellLine:       platformPorts.shellLine,
            directory:       worktreePath,
            environment:     JobSandbox.gateEnvironmentOf(jobLaunchContext, pipeline),
            confinedLineOf:  (commandArguments, confinement) => mergeGateLineOf(worktreePath, pipeline, commandArguments, confinement),
            runLine:         (lineRequest) => request.lineRunner({ ...lineRequest, stopSignal }),
            childFolder:     runFolder,
            acquireGateSlot: (holder) => acquireGateSlotFor(holder, stopSignal),
          },
          projectPrefix:  projectLocation.projectPrefix,
          runOnePipeline: processStarts.runGatePipeline,
        }),
      });
    },
    mergedTreeGateSettled: (worktreePath, treeId, phase, gatedEntities, gate) => {
      mergedTreeGateRuns.settled({
        worktreePath, treeId, phase, gatedEntities, stamp: gate.stamp
      });
    },
    stopMergedTreeGatesIn: mergedTreeGateRuns.stopRunsIn,
    mergeAgentReadingOf:   (job) => BuildJobSessions.sessionReadingOf(jobLaunchContext, job),
    resolutionLinesOf:     MergeRun.resolutionLinesOf,
    childIsLive:           (job) => {
      const jobFolder = request.boardChildren.jobFolderOf(job.id);
      return request.boardChildren.livenessOf(jobFolder, job.childInstance).verdict === 'live';
    },
    stopMergeAgent:          async (job) => { await stopSession(job.id, job.childInstance); },
    startHoldsOrphans:       startKind !== null && ReconcileCauses.startLeavesWorkWaiting(startKind),
    decisionWordingOf:       request.decisionWordingOf,
    mergeDecisionSentenceOf: request.mergeDecisionSentenceOf,
    applyRefusalSentenceOf:  request.applyRefusalSentenceOf,
    keepAirlockFacts:        (mergeJob, facts) => AirlockFactsFile.keep(request.boardChildren.jobFolderOf(mergeJob.id), facts),
    keptAirlockFactsOf:      (mergeJob) => AirlockFactsFile.keptFactsOf(request.boardChildren.jobFolderOf(mergeJob.id), mergeJob.id),
    jobFolderOf:             (job) => request.boardChildren.jobFolderOf(job.id),
    jobFolderOfId:           (jobId) => request.boardChildren.jobFolderOf(jobId),
    redHandoffResumes:       LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    dispatchIsStopped:       () => request.boardStore.reads.requireProgress().hephaestusState === 'paused',
    reportDeclinedCleanup:   (declined) => {
      request.log({
        kind: 'cleanup-declined', cleanup: declined.cleanup, groupBranch: declined.groupBranch, problem: declined.problem
      });
      declinedCleanups = [...declinedCleanups.filter((earlier) => earlier.cleanup !== declined.cleanup || earlier.groupBranch !== declined.groupBranch), declined];
    },
    mainConstitutionOf:     (constitutionPath) => InstructionFiles.mainConstitutionOf(request.workspace.rootDirectory, request.mainLine, constitutionPath),
    repositorySignsCommits: () => AgentChildLaunch.repositorySignsCommits(projectLocation.repositoryRoot),
  });

  /** Rechecked every pass: a notice goes once what git declined to remove is gone. */
  function stillDeclinedCleanups(): DeclinedCleanup[] {
    declinedCleanups = declinedCleanups.filter((declined) => (
      GroupWorktrees.cleanupIsStillDeclined(projectLocation.repositoryRoot, worktreesRoot, declined.groupBranch, declined.cleanup)
    ));
    return declinedCleanups;
  }

  /** The marker first, so another board's Hephaestus holds its launches before this one's limited sessions are even stopped. */
  async function stopLimitedJobs(board: Board, trackerId: string, hits: readonly UsageLimitHit[]): Promise<void> {
    UsageLimits.markHits(request.monitorFolder, request.agentAdapter.vendor, trackerId, hits);
    for (const hit of hits) {
      const job = board.jobById(hit.jobId);
      if (job !== undefined) await stopSession(job.id, job.childInstance);
    }
  }

  /** A clock exception: the vendor names its reset as a time, so the pass that resumes the limited jobs waits for it. */
  function scheduleThePassAtTheReset(usageResetsAt: string | null): void {
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = null;
    const delay = UsageLimits.millisecondsUntilReset(usageResetsAt, request.now());
    if (delay === null) return;
    resetTimer = setTimeout(() => {
      resetTimer = null;
      wake(true);
    }, delay);
    resetTimer.unref();
  }

  /**
   * A child the start found gone with no end of its own takes the cause the start's kind names in place of the one its sweep settled, also
   * once a refused forced stop of it settles; a child that ended with an end Talos recorded keeps the cause its end maps to.
   */
  function reconciledWithTheStart(observation: Observation): Observation {
    if (causeOfAChildGoneAtTheStart === null) return observation;
    const childKeyOf = (childObservation: ChildObservation): string => `${childObservation.jobId}#${childObservation.instance}`;
    if (startIsBeingReconciled) {
      for (const childObservation of observation.childObservations) {
        if (childObservation.liveness.verdict === 'lost') childrenGoneAtTheStart.add(childKeyOf(childObservation));
      }
    }
    return {
      ...observation,
      childObservations: observation.childObservations.map((childObservation) => (
        childObservation.lostCause !== null && childrenGoneAtTheStart.has(childKeyOf(childObservation))
          ? { ...childObservation, lostCause: causeOfAChildGoneAtTheStart }
          : childObservation
      )),
    };
  }

  async function runOnePass(forced: boolean): Promise<void> {
    // Before anything is read: a new Talos sweeps the lost one's orphans, so this pass reads their causes as settled.
    await request.ensureTalosIfLost?.();
    const observation = reconciledWithTheStart(PassObservation.observe(request, jobLaunchContext, new Set(forcedStopRetryJobIdsDue.splice(0))));
    if (!forced && observation.fingerprint === lastFingerprint) return;
    await request.installVersionsKnown?.();
    const at = request.formatStamp(request.now());
    const installVersionChanged = request.installVersionChanged();
    const written = await request.boardStore.transactions.transact({
      at,
      mutate: (change) => {
        PassDecisions.openLeftoverWorktreeDecisions(change, request.decisionWordingOf, leftoverWorktrees.splice(0));
        const replies = HatchInbox.applyPendingRequests(change, request.workspace.rootDirectory, observation.pendingRequests);
        request.afterHoldPhase?.('relayed-commands', change.board);
        const billing = change.board.pipeline()?.billing;
        const childEventFacts = { apiBilling: billing?.mode === 'api' ? billing : null, decisionWordingOf: request.decisionWordingOf };
        const {
          usageLimitHits, usageWindowObservations, stoppedSessions, pipelineAgentTurnEnds, documentAgentTurnEnds, documentAgentSessionEnds, effectReadingResults, effectReadingEnds
        } = ChildEvents.applyChildEvents(
          change,
          request.agentAdapter,
          observation.childObservations,
          request.boardChildren,
          request.workspace.trackerDirectory,
          childEventFacts,
        );
        RefusedForcedStops.settle(change.board, observation.childObservations, request.decisionWordingOf, change.at);
        const livenessOf = (job: Readonly<Job>): ChildLiveness => observation.childObservations
          .find((childObservation) => childObservation.jobId === job.id && childObservation.instance === job.childInstance)?.liveness
          ?? request.boardChildren.livenessOf(request.boardChildren.jobFolderOf(job.id), job.childInstance);
        IntakeSessions.endClosedIntakes(change.board, livenessOf, change.at);
        const turnEndContext = {
          workspace:     request.workspace,
          worktreesRoot: WorktreesFolder.worktreesRootOf(request.workspace.rootDirectory),
          branchNames:   request.branchNames,
          mainLine:      request.mainLine,
          pathStyle:     platformPorts.dataFolders,
          agentNaming:   request.agentAdapter,
          ...(sharedRepository === null ? {} : { sharedRepository }),
        };
        PipelineAgentSessions.verifyTurnEnds(change, turnEndContext, pipelineAgentTurnEnds);
        PipelineAgentSessions.pinSnapshotCommit(change, request.mainLine);
        replies.push(...DocumentAgentSessions.verifyTurnEnds(change, turnEndContext, documentAgentTurnEnds, observation.pendingRequests, relayedControlContext));
        DocumentAgentSessions.settleEndedSessions(change.board, request.workspace.trackerDirectory, documentAgentSessionEnds, change.at);
        for (const { jobId, report } of effectReadingResults) effectReadings.settle(change.board, jobId, report, change.at);
        const failedEffectReaders = effectReadings.failOverdue(change.board, effectReadingEnds, change.at);
        request.afterHoldPhase?.('child-events', change.board);
        IncidentRouter.openQuietJobIncidents(change.board, quietJobIdsDue.splice(0), QUIET_JOB_SWEEPS, change.at);
        const { assistantReadings } = observation;
        AssistantSession.windDownWhileOff(change.board, change.at);
        const downAssistants = AssistantSession.endDownAssistants(change.board, assistantReadings, quietAssistantIdsDue.splice(0), change.at);
        const assistantBootRetryDue = assistantBootRetryRequested && !downAssistants.bootFailed;
        assistantBootRetryRequested = false;
        const buildJobRecords = BuildJobPass.applyBuildJobObservations(change, jobLaunchContext, observation.buildJobs);
        const usageResetsAt = UsageLimits.usageResetsAtOf(observation.usageMarker, usageLimitHits);
        const agentConfigHold = AgentConfigHits.holdAgentConfigHits(change, jobLaunchContext, observation.ticketIdsTouchingAgentConfig);
        EntityDecisionAnswers.actOnAnswers(change, {
          decisionWordingOf:     request.decisionWordingOf,
          packageNeedWordingOf:  request.packageNeedWordingOf,
          dependentFixWordingOf: request.dependentFixWordingOf,
          branchNames:           request.branchNames,
          mainLine:              request.mainLine,
          repositoryRoot:        projectLocation.repositoryRoot,
        });
        EntityDecisionAnswers.openWhitelistRemovedDecisions(change.board, request.decisionWordingOf, change.at);
        const observations = {
          mainLine:                     request.mainLine,
          groupTargetPrefix:            request.branchNames.groupTargetPrefix,
          installVersionChanged,
          ticketIdsTouchingAgentConfig: agentConfigHold.held,
          ...AssistantSession.turnObservationsOf(change.board, assistantReadings),
          assistantBootRetryDue,
        };
        const jobIdsBeforeTheLifecycle = new Set(change.board.jobs().map((job) => job.id));
        const agentSlots = agentSlotsOfThisPass();
        const slotJobIdsBefore = LaunchSlotUtil.slotJobIdsOf(change.board.jobs());
        agentSlots.keepOnly(observation.trackerId, slotJobIdsBefore);
        for (const jobId of slotJobIdsBefore) agentSlots.tryAcquire(observation.trackerId, jobId);
        const machineAgentSlotsFree = agentSlots.reserve(observation.trackerId, change.board.concurrency().freeSlots);
        const waitingDocumentAgentIds = change.board.jobs()
          .filter((job) => DocumentAgentSessions.isDocumentAgentJob(job) && job.state === 'awaiting-answer')
          .map((job) => job.id);
        let steps: ReturnType<Board['followPlaybook']>['steps'];
        try {
          ({ steps } = change.board.followPlaybook({ ...LIFECYCLE_LIMITS, now: at, usageResetsAt }, { ...observations, machineAgentSlotsFree }, request.decisionWordingOf));
        } catch (thrown) {
          // A refused hold writes no job, so its reservations would only keep other boards' tickets waiting until this board's next pass.
          agentSlots.keepOnly(observation.trackerId, slotJobIdsBefore);
          throw thrown;
        }
        const waiverAnswersAwaitAPass = WaiverAnswers.actOnWaiverAnswers(change, steps, observation.answeredWaiverTrees, request.workspace.trackerDirectory);
        const slotJobIdsAfter = LaunchSlotUtil.slotJobIdsOf(change.board.jobs());
        agentSlots.assignReservations(observation.trackerId, slotJobIdsAfter.filter((jobId) => !slotJobIdsBefore.includes(jobId)));
        agentSlots.keepOnly(observation.trackerId, slotJobIdsAfter);
        AssistantBoot.deliverOpenIncidentsAtBoot(change.board, jobIdsBeforeTheLifecycle);
        AssistantSession.closeInputWhenIdle(change.board, assistantReadings, request.workspace.trackerDirectory, change.at);
        const resumedFromWaitingJobIds = waitingDocumentAgentIds.filter((jobId) => change.board.jobById(jobId)?.state === 'running');
        DocumentAgentSessions.deliverWhenIdle(change.board, observation.documentAgentReadings, request.workspace.trackerDirectory, resumedFromWaitingJobIds, change.at);
        effectReadings.launchDue(change.board, change.at);
        if (usageResetsAt === null) AssistantSession.deliverIncidentsWhenIdle(change.board, assistantReadings, request.workspace.trackerDirectory);
        request.afterHoldPhase?.('lifecycle', change.board);
        const recordedReviewPipelineOf = (record: Parameters<typeof ReviewOutcome.recordedReviewPipelineOf>[1]): ReturnType<typeof ReviewOutcome.recordedReviewPipelineOf> => {
          return ReviewOutcome.recordedReviewPipelineOf(change.board, record);
        };
        // Also credits every job this hold ended, since its `job-ended` record is already in the log the scan reads.
        const endedJobIdsExaminedThisPass = EndedJobTokens.creditJobsTheLogEndedUncredited(change.board, endedJobTokensContext, endedJobIdsExamined, change.at);
        return {
          replies,
          endedJobIdsExaminedThisPass,
          endedAssistantJobs:           downAssistants.endedJobs,
          usageLimitHits,
          usageWindowObservations,
          stoppedSessions,
          usageResetsAt,
          attributionTicketIds:         BuildJobPass.attributionTicketIdsOf([...change.storedLogRecords, ...buildJobRecords]),
          agentConfigHeldTicketIds:     agentConfigHold.held,
          nonConvergingTicketIds:       ReviewOutcome.nonConvergingTicketIdsOf(change.board.logRecordsSoFar(), recordedReviewPipelineOf, LIFECYCLE_LIMITS),
          ticketsWaitingForMachineSlot: steps.filter((step) => step.kind === 'await-machine-slot').length,
          waiverAnswersAwaitAPass,
          failedEffectReaders,
        };
      },
    });
    try {
      HephaestusLock.requireNewestGeneration(request.hephaestusDirectory, request.generation);
    } catch (refusal) {
      stopped = true;
      request.onHephaestusLockTakenOver(refusal);
      return;
    }
    for (const jobId of written.result.endedJobIdsExaminedThisPass) endedJobIdsExamined.add(jobId);
    HatchInbox.writeReplies(written.result.replies);
    await stopLimitedJobs(written.board, observation.trackerId, written.result.usageLimitHits);
    UsageLimits.recordWindowObservations(request.monitorFolder, written.result.usageWindowObservations);
    for (const stoppedSession of written.result.stoppedSessions) await stopSession(stoppedSession.jobId, stoppedSession.childInstance);
    for (const jobId of written.result.failedEffectReaders) await stopSession(jobId, observation.childObservations.find((child) => child.jobId === jobId)?.instance ?? 1);
    scheduleThePassAtTheReset(written.result.usageResetsAt);
    gateSlots.startRound();
    await BuildJobPass.runBuildJobEffects(jobLaunchContext, written.board, observation.buildJobs);
    const snapshotsContext = { workspace: request.workspace, worktreesRoot: WorktreesFolder.worktreesRootOf(request.workspace.rootDirectory) };
    PipelineAgentSessions.removeUnheldSnapshots(written.board, snapshotsContext, triedPipelineAgentSnapshots, request.log);
    DocumentAgentSessions.removeUnheldSnapshots(written.board, snapshotsContext, triedDocumentAgentSnapshots, request.log);
    for (const endedAssistant of written.result.endedAssistantJobs) await stopSession(endedAssistant.id, endedAssistant.childInstance);
    await JobResumption.deliverFirstMessages(request.boardChildren, request.workspace.trackerDirectory, written.board, request.agentAdapter);
    await AssistantSession.deliverChats({
      boardChildren:    request.boardChildren,
      trackerDirectory: request.workspace.trackerDirectory,
      board:            written.board,
      adapter:          request.agentAdapter,
      readings:         observation.assistantReadings,
      chatTextOf:       request.assistantChatTextOf,
    });
    await JobControlDelivery.deliverJobControls({
      boardChildren:    request.boardChildren,
      trackerDirectory: request.workspace.trackerDirectory,
      board:            written.board,
      adapter:          request.agentAdapter,
      windDownMessage:  request.windDownMessage,
    });
    const sessionsEndedThisPass = observation.childObservations
      .filter((childObservation) => childObservation.liveness.verdict === 'live' && written.board.jobById(childObservation.jobId) === undefined)
      .map((childObservation) => ({ jobId: childObservation.jobId, childInstance: childObservation.instance }));
    endedSessionsAwaitingQuit = await JobControlDelivery.quitSessionsOfEndedJobs(
      request.boardChildren, [...endedSessionsAwaitingQuit, ...sessionsEndedThisPass],
    );
    unwatchHatchFoldersOfEndedJobs(written.board);
    // A merge job a `job stop` ended in the Board never freed its slot through the Airlock, so its gate's lines are stopped here.
    mergedTreeGateRuns.stopRunsOfEndedJobs((jobId) => written.board.jobById(jobId) !== undefined);
    const launchRefusals: LaunchRefusal[] = [];
    const agentProgramRefusals: AgentProgramRefused[] = [];
    const unmadeAirlockAgentRoots: UnmadeAirlockAgentRoot[] = [];
    const unreadableJobFiles: UnreadableJobFile[] = [];
    const launchedAirlockAgentJobIds: string[] = [];
    let apiBillingKeyIsMissing = false;
    const jobsToLaunch = ApiBillingStops.launchesAreHeld(written.board)
      ? []
      : AgentChildLaunch.jobsNeedingAChild(request.boardChildren, written.board, spawnedInstances, written.result.agentConfigHeldTicketIds);
    for (const job of jobsToLaunch) {
      hatchFolderOfLaunchedJob.set(job.id, HatchInbox.hatchDirectoryOf(request.workspace.rootDirectory, job.id));
      const refusal = await AgentChildLaunch.launchAgentChild(request, jobLaunchContext, written.board, observation.trackerId, job, effectReadings);
      if (refusal === null) spawnedInstances.add(`${job.id}:${job.childInstance}`);
      else if ('apiBillingKeyMissingFor' in refusal) apiBillingKeyIsMissing = true;
      else if ('airlockConflictsUnknownFor' in refusal || 'talosDidNotLaunch' in refusal || 'sessionConfinementRefusedFor' in refusal) continue;
      else if ('setupBillingNotChosenFor' in refusal) continue;
      else if ('notLaunchedJobId' in refusal) agentProgramRefusals.push(refusal);
      else if ('unreadableJobFile' in refusal) unreadableJobFiles.push(refusal.unreadableJobFile);
      else if ('kind' in refusal) launchRefusals.push(refusal);
      else unmadeAirlockAgentRoots.push(refusal);
      if (refusal === null && AirlockSandboxIncident.standsOpenFor(written.board, job.id)) launchedAirlockAgentJobIds.push(job.id);
    }
    const apiKeyDecisionIsDue = apiBillingKeyIsMissing && PassDecisions.openApiKeyDecisionIdsOf(written.board).length === 0;
    const apiKeyDecisionIsStale = !apiBillingKeyIsMissing && !PassDecisions.aBillingMissesItsKey(request, written.board)
      && PassDecisions.openApiKeyDecisionIdsOf(written.board).length > 0;
    const notLaunchedJobIdsToRetry = LaunchAgentPrograms.notLaunchedJobIdsWhoseProgramChanged(request, written.board);
    const holdIsDue = unmadeAirlockAgentRoots.length > 0 || launchedAirlockAgentJobIds.length > 0 || apiKeyDecisionIsDue || apiKeyDecisionIsStale
      || agentProgramRefusals.length > 0 || notLaunchedJobIdsToRetry.length > 0 || unreadableJobFiles.length > 0;
    let refusalResolvedSinceItsLaunch = false;
    if (holdIsDue) await holdTracker((hold) => {
      for (const refused of agentProgramRefusals) {
        const job = hold.board.jobById(refused.notLaunchedJobId);
        if (job === undefined) continue;
        // The agent setting may have changed between the launch and this hold; only a refusal that still stands is recorded.
        const resolutionNow = LaunchAgentPrograms.agentProgramResolutionOf(request, hold.board, job);
        if (resolutionNow.verdict === 'not-launched') hold.board.recordNotLaunched(job.id, resolutionNow.notLaunched, hold.at);
        else refusalResolvedSinceItsLaunch = true;
      }
      hold.board.retryNotLaunched(hold.at, (job) => notLaunchedJobIdsToRetry.includes(job.id));
      for (const unmadeRoot of unmadeAirlockAgentRoots) AirlockSandboxIncident.openOnce(hold.board, unmadeRoot, hold.at);
      for (const unreadableJobFile of unreadableJobFiles) UnreadableJobFileIncident.openOnce(hold.board, unreadableJobFile, hold.at);
      for (const jobId of launchedAirlockAgentJobIds) AirlockSandboxIncident.closeOnLaunch(hold.board, jobId, hold.at);
      if (apiKeyDecisionIsDue) PassDecisions.openApiKeyDecisionOnce(hold.board, request.decisionWordingOf, hold.at);
      if (apiKeyDecisionIsStale) PassDecisions.withdrawApiKeyDecisions(hold.board, hold.at);
    });
    const { trackerDirectory } = request.workspace;
    const answerAwaitsDelivery = (job: Readonly<Job>): boolean => AnswerDelivery.answerAwaitsDelivery(request.boardChildren, job)
      || DocumentAgentSessions.opensWithAMessage(trackerDirectory, written.board, job);
    await JobResumption.deliverResumeMessages(request.boardChildren, trackerDirectory, written.board, request.agentAdapter, request, answerAwaitsDelivery);
    await DocumentAgentSessions.sendDeliveries(request.boardChildren, trackerDirectory, written.board, request.agentAdapter, request.log);
    await AnswerDelivery.deliverAnswers({
      boardChildren:   request.boardChildren,
      board:           written.board,
      adapter:         request.agentAdapter,
      deliversLive:    request.agentAdapter.capabilities.takesLiveAnswers,
      answerMessageOf: request.answerMessageOf,
    });
    const heldTargets = written.board.pipeline() === null && !constitutionCommitIsDue(written.board) ? [] : await airlocks.sweep();
    targetsHeldAtTheLastPass = heldTargets.length;
    gateProfiling.followRuns(written.board);
    pipelineChecking.followChecks(written.board);
    jobsAtTheLastPass = written.board.jobs();
    assistantWasOnAtTheLastPass = written.board.assistantIsOn();
    assistantsMidTurnAtTheLastPass = AssistantSession.midTurnJobIdsOf(request.workspace.trackerDirectory, written.board, observation.assistantReadings);
    state = {
      generation:   request.generation,
      passes:       state.passes + 1,
      runtimeState: installVersionChanged ? 'held-by-install-change' : 'serving',
      notices:      PassNotices.noticesOf(
        request,
        installVersionChanged,
        written.result.attributionTicketIds,
        written.result.nonConvergingTicketIds,
        heldTargets,
        stillDeclinedCleanups(),
        IncidentRouter.defaultedIncidentsOf(written.board.logRecordsSoFar()),
        [...launchRefusals, ...PassNotices.agentProgramNoticesOf(request, written.board, agentProgramRefusals)],
      ),
      ticketsWaitingForMachineSlot: written.result.ticketsWaitingForMachineSlot,
    };
    const settled = PassObservation.observe(request, jobLaunchContext);
    // An event Talos logged after this pass read its events is unapplied work, never a settled state an unforced wake may skip.
    lastFingerprint = settled.childObservations.some((childObservation) => childObservation.events.length > 0) ? null : settled.fingerprint;
    // A job the merge sweep launched after this pass launched children needs one more pass, which its settled fingerprint would skip.
    const jobIdsThisPassSaw = new Set(written.board.jobs().map((job) => job.id));
    const passIsDue = BuildJobPass.someBuildJobAwaitsAPass(written.board, settled.buildJobs) || written.result.waiverAnswersAwaitAPass
      || notLaunchedJobIdsToRetry.length > 0 || refusalResolvedSinceItsLaunch;
    if (passIsDue || settled.childObservations.some((childObservation) => !jobIdsThisPassSaw.has(childObservation.jobId))) {
      forcedNext = true;
      wokenAgain = true;
    }
  }

  /** A presence write that fails is logged and passed over: the pass's own outcome stands, and presence is shown only. */
  function recordInPresence(write: () => PresenceUpdate): void {
    try {
      const update = write();
      if (update.verdict === 'no-record') Presence.reportUnreadablePresence(update.reading, request.unreadableBoardFiles);
    } catch (thrown) {
      request.log({ kind: 'presence-unrecorded', ...thrownNamedOf(thrown) });
    }
  }

  function recordTheCompletedPass(): void {
    if (abandonedPassesInARow === 0) return;
    abandonedPassesInARow = 0;
    recordInPresence(() => Presence.recordCompletedPass(presenceFiles, request.generation));
  }

  /** Nothing reaches the board log: the board's lock may be what abandoned the pass. */
  function recordTheAbandonedPass(abandoned: AbandonedPass, forced: boolean): void {
    abandonedPassesInARow += 1;
    lastAbandonedPass = abandoned;
    // A forced pass stays forced, so the next wake-up tries it again even when nothing observed changed.
    forcedNext ||= forced;
    request.log({ kind: 'pass-abandoned', reason: abandoned.reason, refusalMessage: abandoned.detail });
    const at = request.formatStamp(request.now());
    recordInPresence(() => Presence.recordAbandonedPass(presenceFiles, request.generation, abandoned.reason, abandoned.detail, at));
  }

  async function crashOnPassThrow(thrown: unknown): Promise<void> {
    stopped = true;
    request.log({ kind: 'pass-crashed', ...thrownNamedOf(thrown) });
    try {
      await request.onPassCrashed(thrown);
    } catch (crashPathThrow) {
      request.log({ kind: 'pass-crash-path-threw', ...thrownNamedOf(crashPathThrow) });
    }
  }

  async function drain(): Promise<void> {
    do {
      wokenAgain = false;
      const forced = forcedNext;
      forcedNext = false;
      passesStarted += 1;
      passInFlight = passesStarted;
      let thrownByThePass: { thrown: unknown } | null = null;
      try {
        await runOnePass(forced);
        recordTheCompletedPass();
        request.afterPass?.();
      } catch (thrown) {
        thrownByThePass = { thrown };
      } finally {
        passInFlight = null;
      }
      if (thrownByThePass !== null) {
        const reading = AbandonedPassReason.of(thrownByThePass.thrown);
        if (reading.verdict === 'crash') {
          await crashOnPassThrow(thrownByThePass.thrown);
        } else {
          recordTheAbandonedPass(reading, forced);
          request.afterPass?.();
        }
      }
    } while (wokenAgain && !stopped);
    running = null;
  }

  function passesAbandonedNotices(): HephaestusNotice[] {
    if (abandonedPassesInARow < ABANDONED_PASSES_BEFORE_NOTICE || lastAbandonedPass === null) return [];
    return [{ kind: 'passes-abandoned', inARow: abandonedPassesInARow, reason: lastAbandonedPass.reason }];
  }

  function wake(forced = false): void {
    if (stopped) return;
    forcedNext ||= forced;
    if (running !== null) {
      wokenAgain = true;
      return;
    }
    running = drain();
  }

  async function regroup(): Promise<RegroupingReport> {
    const report = Regrouping.regroup(request.boardChildren, platformPorts, request.workspace, request.boardStore.reads, request.unreadableBoardFiles, request.log);
    await mergedTreeGateRuns.settleAtStart();
    await gateProfiling.settleAtStart();
    await pipelineChecking.settleAtStart();
    leftoverWorktrees.push(...report.leftoverWorktrees);
    for (const lost of report.lost) request.log({
      kind: 'child-instance-lost', jobId: lost.jobId, childInstance: lost.instance, cause: lost.cause ?? FORCED_STOP_REFUSED_INTERRUPTION,
    });
    wake(true);
    await (running ?? Promise.resolve());
    startIsBeingReconciled = false;
    return report;
  }

  async function stop(): Promise<void> {
    stopped = true;
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = null;
    await (running ?? Promise.resolve());
    await mergedTreeGateRuns.stopAll();
    await gateProfiling.stopAll();
    await pipelineChecking.stopAll();
  }

  /**
   * Also the once-per-sweep boot of an Assistant past the failed-boot bound: a pass with no Assistant live may boot one while the board has
   * it on. A held target is rechecked each sweep, since the checkout that holds it is not in the fingerprint: User cleaning it wakes
   * nothing else.
   */
  function sweep(): void {
    const due = quietJobWatch.sweep(jobsAtTheLastPass);
    const quietAssistants = assistantQuietWatch.sweep(jobsAtTheLastPass, assistantsMidTurnAtTheLastPass);
    const noAssistantIsLive = assistantWasOnAtTheLastPass && !jobsAtTheLastPass.some((job) => AssistantBoot.isAssistantJob(job));
    const forcedStopRetries = RefusedForcedStops.jobIdsToRetryOf(jobsAtTheLastPass);
    // Another board's job that ended frees a machine slot without a change on this board, so only a sweep tries a waiting ticket again.
    const ticketsAwaitMachineSlot = state.ticketsWaitingForMachineSlot > 0;
    const heldTargetIsDue = targetsHeldAtTheLastPass > 0;
    // The machine's config and the program files are not in the fingerprint, so only a sweep sees a refused program fixed outside the board.
    const jobsStandNotLaunched = jobsAtTheLastPass.some((job) => job.notLaunched !== undefined);
    if (
      due.length === 0 && quietAssistants.length === 0 && !noAssistantIsLive && forcedStopRetries.length === 0 && !ticketsAwaitMachineSlot
      && !heldTargetIsDue && !jobsStandNotLaunched
    ) return;
    quietJobIdsDue.push(...due);
    forcedStopRetryJobIdsDue.push(...forcedStopRetries);
    quietAssistantIdsDue.push(...quietAssistants);
    assistantBootRetryRequested ||= noAssistantIsLive;
    wake(true);
  }

  return {
    regroup,
    wake,
    sweep,
    silentSweepsOf: (jobId) => quietJobWatch.silentSweepsOf(jobId),
    idle:           () => running ?? Promise.resolve(),
    passInFlight:   () => passInFlight,
    // An abandoned pass ends before the pass's own notices are derived, so its notice joins them here.
    state:          () => ({ ...state, notices: [...state.notices, ...passesAbandonedNotices()] }),
    effectReadings,
    stop,
  };
}
