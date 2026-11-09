/**
 * The Overseer's one serial pass, design section 2.5: wake-ups coalesce into one queue, and each pass observes outside the lock (Watcher
 * liveness, events past each job's stored cursor, then Hatch folders, target tips and ended Watchers), applies relayed commands, then Watcher
 * events with their cursors, then the Playbook in one `writeTracker` hold, and runs its effects after the Baton check.
 */
import { createHash }                          from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join }                      from 'node:path';

import { PipelineFile }    from '../../adapters/pipeline/PipelineFile.ts';
import {
  BUILDER_REPORT_SCHEMA,
  ONBOARDER_REPORT_SCHEMA,
  AIRLOCK_AGENT_REPORT_SCHEMA,
  REVIEWER_REPORT_SCHEMA
} from '../../adapters/reports/ReportSchemas.ts';
import type { JsonSchema }                           from '../../adapters/reports/ReportValidation.ts';
import { type UsageMarkerReading, UsageMarkerFile }  from '../../adapters/usage-marker/UsageMarkerFile.ts';
import type { AgentAdapter }                         from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentConfinement, AgentLaunchRequest } from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }                        from '../../lib/agent-launch/WorkerProfile.ts';
import type { ExecutableRefusalCause }               from '../../lib/executable-resolver/ExecutableResolver.ts';
import { type ConfinedLine, confinedLineOf }         from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                                from '../../lib/git/GitProcess.ts';
import type { PlatformPorts }                        from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ShellLine }                            from '../../lib/shell-line/ShellLine.ts';
import type { DecisionAnswer }                       from '../../lib/tracker-model/@types/Decision.ts';
import type { IncidentDefaultCause, IncidentMove }   from '../../lib/tracker-model/@types/Incident.ts';
import type { InterruptionCause, Job, JobKind }      from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineGate }                         from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording }       from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                from '../../lib/tracker-model/Board.ts';
import { Playbook }                                  from '../../lib/tracker-model/Playbook.ts';
import { FORCED_STOP_REFUSED_INTERRUPTION }          from '../../lib/tracker-model/constants/JobStates.ts';
import type { EventLogEntry }                        from '../../lib/watcher/EventLog.ts';
import { JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE } from '../../shared/Environment.ts';
import { AIRLOCK_LIMITS }                            from '../../shared/constants/AirlockLimits.ts';
import { LIFECYCLE_LIMITS }                          from '../../shared/constants/LifecycleLimits.ts';
import {
  GATE_RUNS_AT_ONCE,
  GATE_SLOT_RETRY_MILLISECONDS,
  QUIET_JOB_SWEEPS,
  SESSION_STOP_GRACE_MILLISECONDS
} from '../../shared/constants/OverseerLimits.ts';
import { type GateConfinement }                                from '../lifecycle/GateRun.ts';
import { GROUP_TARGET_PREFIX }                                 from '../lifecycle/MergeTargets.ts';
import { ReviewOutcome }                                       from '../lifecycle/ReviewOutcome.ts';
import { writeTracker, type TrackerChange }                    from '../tracker/TrackerPipeline.ts';
import { requireProgressFile }                                 from '../tracker/TrackerReader.ts';
import type { Workspace }                                      from '../tracker/Workspace.ts';
import { AirlockFactsFile }                                    from './AirlockFactsFile.ts';
import { AirlockSandboxIncident, type UnmadeAirlockAgentRoot } from './AirlockSandboxIncident.ts';
import {
  type AirlockHoldRunner,
  createAirlocks,
  type DeclinedCleanup,
  type HeldTarget
} from './Airlocks.ts';
import { AnswerDelivery }                                                   from './AnswerDelivery.ts';
import { type ApiBilling, ApiBillingStops, type StoppedSession }            from './ApiBillingStops.ts';
import { AssistantBoot, type AssistantFacts }                               from './AssistantBoot.ts';
import { type AssistantChatFacts, type AssistantReading, AssistantSession } from './AssistantSession.ts';
import { Baton }                                                            from './Baton.ts';
import { EndedJobTokens }                                                   from './EndedJobTokens.ts';
import { createGateRunSlots, gateRunHolderIsLive, inProcessHolderOf }       from './GateRunSlots.ts';
import { GpgDirectories }                                                   from './GpgDirectories.ts';
import { GroupWorktrees }                                                   from './GroupWorktrees.ts';
import { HatchInbox, type PendingHatchRequest }                             from './HatchInbox.ts';
import { type DefaultedIncident, IncidentRouter }                           from './IncidentRouter.ts';
import { InstructionFiles }                                                 from './InstructionFiles.ts';
import { IntakeSessions, type IntakeFacts }                                 from './IntakeSessions.ts';
import { JobControlDelivery }                                               from './JobControlDelivery.ts';
import {
  BUILD_JOB_CAUSES,
  type BuildJobObservation,
  JobLaunch,
  type JobLaunchContext,
  type TargetCatchUpHandover
} from './JobLaunch.ts';
import { JobResumption }                                              from './JobResumption.ts';
import { LegacyWatcherReader }                                        from './LegacyWatcherReader.ts';
import { Onboarding, type OnboardingFacts }                           from './Onboarding.ts';
import { overseerFilesIn }                                            from './OverseerFiles.ts';
import { type ProcessStarts, REAL_PROCESS_STARTS }                    from './ProcessStarts.ts';
import { ProcessWatcherSandbox }                                      from './ProcessWatcherSandbox.ts';
import { QuestionRouting }                                            from './QuestionRouting.ts';
import { RedHandoff, type RedHandoffFacts }                           from './RedHandoff.ts';
import { RefusedForcedStops }                                         from './RefusedForcedStops.ts';
import { type ForcedStopRefusals, Regrouping, type RegroupingReport } from './Regrouping.ts';
import { type UsageLimitHit, UsageLimits }                            from './UsageLimits.ts';
import { WatcherFleet, type WatcherLiveness }                         from './WatcherFleet.ts';
import { type FolderMaker, WorkerProfiles }                           from './WorkerProfiles.ts';
import { WorktreesFolder }                                            from './WorktreesFolder.ts';

/** What a session is told at launch; worded by the command line, since services hold no words. */
export interface JobLaunchText {
  firstMessage: string;
  roleBrief:    string;
}

/** What the launch text is filled from: the job's tickets as stored, and the checks line its work is gated by. */
export interface JobLaunchFacts {
  tickets:                readonly { id: string; title: string; body: string }[];
  /** The stored gates as the shell line's display render, which an agent reads and nothing spawns; `null` with no pipeline stored. */
  checksLine:             string | null;
  /** The stored gates in run order, which a builder is briefed on; `null` with no pipeline stored. */
  gates:                  readonly Readonly<PipelineGate>[] | null;
  /** The board's merge approval: on, a reviewer merges its target into the branch as its review's last step. Absent reads as off. */
  mergeApprovalIsOn?:     boolean;
  /** The job's work was last held by a session ended `replaced`, whose uncommitted changes are in the worktree it inherits. */
  earlierSessionReplaced: boolean;
  /** The red handoff a fresh session takes over from the session it replaces, which could not be resumed; `null` otherwise. */
  redHandoff?:            RedHandoffFacts | null;
  /** What a builder its review sent back is resumed with, in place of its build prompt; `null` for every other job. */
  reviewFindings?:        ReviewFindingsFacts | null;
  /** A product owner's request, and what a fresh one takes over from the session it replaces; `null` for every other job. */
  intake:                 IntakeFacts | null;
  /** What a merge-gate fixer or a resolution reviewer is told of its Airlock; `null` for every other job. */
  airlock:                AirlockFacts | null;
  /** What a fresh Assistant boots with: the incidents of its first message, the newest incident records and the board; `null` otherwise. */
  assistant:              AssistantFacts | null;
  /** An onboarder's mode and the gate history `advise` reads; `null` for every other job. */
  onboarding?:            OnboardingFacts | null;
  /** The role's instruction files as the pipeline names them, joined in order and unfilled; empty for a job no array speaks for. */
  instructions:           string;
  /** What the session runs under on this platform, the one fact its settings and its prompt's confinement claims both come from. */
  confinement:            AgentConfinement;
}

type LaunchRefusal = Extract<OverseerNotice, { kind: 'instructions-missing' | 'agent-program-refused' | 'watcher-endpoint-does-not-fit' }>;

/** API billing is set and the Overseer's environment holds no API key: nothing starts until User sets it. */
interface ApiBillingKeyMissing {
  readonly apiBillingKeyMissingFor: string;
}

/** An Airlock agent whose conflicted files nothing tells: it is not told a wrong list, and the next pass reads them again. */
interface AirlockConflictsUnknown {
  readonly airlockConflictsUnknownFor: string;
}

const API_KEY_DECISION_DRAFT = { kind: 'api-key-not-set', ticketIds: [], jobId: null } as const;

const API_KEY_DECISION_WITHDRAWN_REASON = 'the Overseer no longer misses the API key';

/** The review that did not hold, and which resume of the builder's handoff cycle this is. */
export interface ReviewFindingsFacts {
  reviewSection:  string;
  resume:         number;
  resumesAllowed: number;
  /** Set when the review ended before its reviewer, on bringing the branch up to the target: the conflict or the red gate. */
  targetCatchUp?: TargetCatchUpHandover | null;
}

/** What an Airlock agent is sent in for: the conflict of the merge-in, or the red gate on the merged tree. */
export interface AirlockFacts {
  worktree:        string;
  branchTip:       string;
  targetTip:       string;
  phase:           'resolving' | 'fixing';
  conflictedFiles: readonly string[];
  /** The newest red gate on the merged tree; `null` before one. */
  redHandoff:      RedHandoffFacts | null;
  /** `false` for a fresh agent in place of a ticket agent whose session could not be resumed. */
  resumesSession:  boolean;
}

export interface DrivePassRequest {
  platformPorts:                     PlatformPorts;
  workspace:                         Workspace;
  now:                               () => Date;
  formatStamp:                       (moment: Date) => string;
  overseerDirectory:                 string;
  generation:                        number;
  watcherBundlePath:                 string;
  /** The runtime, isolating arguments and entry script this Overseer was started with, which a job's network guard hook runs. */
  programCommand:                    readonly string[];
  codeVersion:                       string;
  agentAdapter:                      AgentAdapter;
  /** The folder the Watcher sockets go under: `<home>/<monitor folder>`. */
  monitorFolder:                     string;
  /** Narrowed to the launch allowlist before any session sees it. */
  inheritedEnvironment:              Readonly<Record<string, string | undefined>>;
  mainLine:                          string;
  /** The start marker of the managed block a committed CLAUDE.md must no longer hold before launches onto its target. */
  managedBlockMarker:                string;
  installVersionChanged:             () => boolean;
  /** Resolves once the install versions a pass reads are known, such as after a landing; the event loop runs while it waits. */
  installVersionsKnown?:             () => Promise<void>;
  /** Whether the Overseer's environment holds the API key that the pipeline's `api` billing needs before any session starts. */
  apiBillingKeyIsSet:                () => boolean;
  /** Code on disk differs from the code in memory while the install version does not: a notice only. */
  newCodeOnDisk?:                    () => boolean;
  decisionWordingOf:                 (draft: DecisionDraft) => DecisionWording;
  launchTextOf:                      (job: Readonly<Job>, facts: JobLaunchFacts) => JobLaunchText;
  /** One numbered chat to the Assistant listing the incidents it delivers, their facts and allowed moves. */
  assistantChatTextOf:               (facts: AssistantChatFacts) => string;
  /** Sent to a session that reached its role's call budget. */
  windDownMessage:                   string;
  /** The first line of every resumed session. */
  resumeMessage:                     string;
  /** The first line of a session resumed to fix its red handoff, and the opening of a fresh one taking the handoff over. */
  redHandoffMessageOf:               (facts: Readonly<RedHandoffFacts>) => string;
  /** An answer worded as a plain user message, for a resumed session that no longer holds the question's request. */
  answerMessageOf:                   (answer: DecisionAnswer) => string;
  /** Overridden by specs of the fallback T1-P1 would need: the Overseer stops the Watcher and resumes with the answer. */
  deliversAnswersByControlResponse?: boolean;
  homeDirectory:                     string;
  log:                               (line: string) => void;
  /** The pass stops acting at once; the caller ends the Overseer `baton-taken`. */
  onBatonTakenOver:                  (refusal: unknown) => void;
  /** Called for each job's Hatch folder as the launch makes it, so a relayed request wakes a pass where no recursive watch sees the folder. */
  watchHatchFolder?:                 (hatchDirectory: string) => void;
  /** Called for the Hatch folder of each job the pass saw launched, once the job is gone from the board. */
  unwatchHatchFolder?:               (hatchDirectory: string) => void;
  /** Overridden by specs, which refuse to make an Airlock agent worktree's denied root. */
  folderMaker?:                      FolderMaker;
  /** Called inside the hold after each of its three phases, on the Board being changed; the step a spec reads the order at. */
  afterHoldPhase?:                   (phase: 'relayed-commands' | 'watcher-events' | 'lifecycle', board: Board) => void;
  /** After each pass that ran to its end, outside the hold: the Overseer publishes its state to the event stream there. */
  afterPass?:                        () => void;
  processStarts?:                    ProcessStarts;
  /** Overridden by specs, which cannot wait out the production retry of a merge gate looking for a free gate slot. */
  gateSlotRetryMilliseconds?:        number;
  /** Overridden by specs, which cannot wait out the production grace a stopped session gets to end by itself. */
  sessionStopGraceMilliseconds?:     number;
}

/** Derived each pass from the board, git and the Overseer's state, never stored; later tickets add the other kinds of design section 8.2. */
export type OverseerNotice =
  | { kind: 'install-version-changed' }
  | { kind: 'new-code' }
  | { kind: 'claude-md-block-committed'; target: string }
  | { kind: 'attribution-found'; ticketId: string }
  // The ticket's newest review reworked past the threshold and was refused another round: User decides whether an invariant ticket is wanted.
  | { kind: 'rounds-not-converging'; ticketId: string }
  // A landing found the main checkout off the main line or dirty: that target's landings wait, builds and reviews launch on.
  | { kind: 'dirty-main-checkout'; target: string; branch: string | null; blockingFiles: readonly string[] }
  // A landing's fast-forward found a file of the target's checkout held open by another process, on every try: that target's landings wait.
  | { kind: 'target-file-held'; target: string; heldFiles: readonly string[] }
  // An incident took its default since the Overseer started: the warning state of owner answer Q34.
  | { kind: 'incident-defaulted'; incidentId: string; move: IncidentMove; cause: IncidentDefaultCause }
  // Git declined a removal after a refresh or a release; shown while what it would have removed stands.
  | { kind: 'cleanup-declined'; cleanup: DeclinedCleanup['cleanup']; groupBranch: string; reason: string }
  // A job's launch was refused, nothing spawned, because an instruction file its pipeline names is missing; retried each pass.
  | { kind: 'instructions-missing'; jobId: string; path: string }
  // A job's launch was refused, nothing spawned, because its agent program did not resolve to an absolute path; retried each pass.
  | { kind: 'agent-program-refused'; jobId: string; cause: ExecutableRefusalCause; reason: string }
  // A job's launch was refused, nothing spawned, because this platform cannot bind its Watcher's endpoint; retried each pass.
  | { kind: 'watcher-endpoint-does-not-fit'; jobId: string; endpoint: string };

/** What a pass knows of the runtime state; the Overseer adds `passing-baton` around a Baton pass. */
export type PassRuntimeState = 'serving' | 'held-by-install-change';

export interface OverseerStateDocument {
  generation:          number;
  passes:              number;
  runtimeState:        PassRuntimeState;
  notices:             OverseerNotice[];
  /** Jobs whose Watcher speaks a protocol below the supported window: watched through their files alone. */
  legacyWatcherJobIds: string[];
}

export interface DrivePass {
  /** Run once at start, before the first pass, which it then runs forced: its one hold applies everything regrouping found. */
  regroup:        () => Promise<RegroupingReport>;
  /** Coalesced: wakes during a pass add exactly one more pass. `forced` runs it even when nothing observed changed. */
  wake:           (forced?: boolean) => void;
  /** The backstop sweep: counts each running job's quiet sweeps and wakes a forced pass to open `quiet-job` for one that reached the count. */
  sweep:          () => void;
  /** The sweeps a running build or review has been quiet for, which the Bridge tints; 0 for any other job. */
  silentSweepsOf: (jobId: string) => number;
  /** Resolves once no pass is running or queued. */
  idle:           () => Promise<void>;
  state:          () => OverseerStateDocument;
  /** No pass starts after it; resolves once the one running, a landing in it included, has finished. */
  stop:           () => Promise<void>;
}

interface WatcherObservation {
  jobId:              string;
  instance:           number;
  liveness:           WatcherLiveness;
  events:             readonly EventLogEntry[];
  /** Settled for a lost Watcher only, after its surviving child group was killed; `null` while the forced stop is refused. */
  lostCause:          InterruptionCause | null;
  forcedStopRefusals: ForcedStopRefusals;
  /** Read for a resumed instance whose Watcher recorded its end; `true` otherwise. */
  sessionStarted:     boolean;
}

interface Observation {
  watchers:                     readonly WatcherObservation[];
  pendingRequests:              readonly PendingHatchRequest[];
  targetTips:                   Readonly<Record<string, string | null>>;
  targetsHoldingManagedBlock:   readonly string[];
  buildJobs:                    readonly BuildJobObservation[];
  ticketIdsTouchingAgentConfig: readonly string[];
  usageMarker:                  UsageMarkerReading;
  assistantReadings:            readonly AssistantReading[];
  fingerprint:                  string;
  trackerId:                    string;
}

/** Under the monitor folder, so every Overseer of the machine shares the gate run slots. */
const GATE_SLOTS_FOLDER = 'gate-slots';

const MERGE_GATE_PROFILES_FOLDER = 'merge-gate-profiles';

/** The `step` a refused worker launch names in its `sandbox-unavailable` incident. */
const WORKER_LAUNCH_STEP = 'worker';

// T1-P1's finding: a live session takes the answer as the `control_response` allow with `updatedInput.answers`.
const CONTROL_RESPONSE_DELIVERS_ANSWERS = true;
const ROLES_THAT_MAY_ASK: ReadonlySet<string> = new Set(['builder', 'reviewer', 'product-owner']);

/** Multi-turn sessions: finished only when the Overseer closed their input, never by a turn's `result`. */
const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner'];

/** The jobs whose session owes a closing report: one that exits cleanly without it ends `failed`, cause `no-report`. */
const REPORTING_JOB_KINDS: readonly JobKind[] = ['build', 'review'];

const REPORT_SCHEMA_OF_JOB_KIND: Partial<Record<JobKind, JsonSchema>> = {
  'build':       BUILDER_REPORT_SCHEMA,
  'review':      REVIEWER_REPORT_SCHEMA,
  'merge-agent': AIRLOCK_AGENT_REPORT_SCHEMA,
  'onboarder':   ONBOARDER_REPORT_SCHEMA,
};

function fileTextOrEmpty(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function targetTipOf(repositoryRoot: string, target: string): string | null {
  return GitProcess.resolvedCommitOf(repositoryRoot, target);
}

function targetHoldsManagedBlock(repositoryRoot: string, target: string, marker: string): boolean {
  const shown = GitProcess.run(repositoryRoot, ['show', `${target}:CLAUDE.md`]);
  return GitProcess.succeeded(shown) && shown.standardOutput.includes(marker);
}

/** Identity, never time: the stored board and log, the pending requests, the unread events, the target tips and each Watcher's verdict. */
function fingerprintOf(
  workspace: Workspace,
  watchers: readonly WatcherObservation[],
  pending: readonly PendingHatchRequest[],
  tips: Readonly<Record<string, string | null>>,
  buildJobs: readonly BuildJobObservation[],
  usageMarker: UsageMarkerReading,
  ticketIdsTouchingAgentConfig: readonly string[],
): string {
  const digest = createHash('sha256');
  digest.update(`agent-config ${ticketIdsTouchingAgentConfig.join(',')}\n`);
  digest.update(fileTextOrEmpty(workspace.progressFilePath)).update('\0').update(fileTextOrEmpty(workspace.logFilePath)).update('\0');
  digest.update(`usage ${JSON.stringify(usageMarker)}\n`);
  for (const request of pending) digest.update(`request ${request.jobId} ${request.requestId}\n`);
  for (const buildJob of buildJobs) {
    const gateStep = buildJob.gate.verdict === 'running' ? buildJob.gate.stepIndex : '';
    digest.update(`build ${buildJob.jobId} ${buildJob.setup} ${buildJob.calls} ${buildJob.gate.verdict} ${gateStep}\n`);
  }
  for (const watcher of watchers) digest.update(`watcher ${watcher.jobId} ${watcher.instance} ${watcher.liveness.verdict} ${watcher.events.at(-1)?.sequence ?? 0}\n`);
  for (const [target, tip] of Object.entries(tips)) digest.update(`tip ${target} ${tip ?? '-'}\n`);
  return digest.digest('hex');
}

/** A refused forced stop is tried again only for the jobs in `forcedStopRetryJobIds`, so a pass's own writes never retry it. */
function observe(request: DrivePassRequest, jobLaunchContext: JobLaunchContext, forcedStopRetryJobIds: ReadonlySet<string> = new Set()): Observation {
  const { workspace } = request;
  const progress      = requireProgressFile(workspace);
  const jobs          = progress.jobs ?? [];
  // Events before Hatch folders: a request a session wrote before its turn's `result` is seen in the same pass as that result.
  const watchers = jobs.map((job): WatcherObservation => {
    const jobFolder     = WatcherFleet.jobFolderOf(workspace.trackerDirectory, job.id);
    const afterSequence = job.eventCursor.instance === job.watcherInstance ? job.eventCursor.sequence : 0;
    const liveness      = WatcherFleet.livenessOf(request.platformPorts, jobFolder, job.watcherInstance);
    const events        = WatcherFleet.eventsAfter(jobFolder, job.watcherInstance, afterSequence);
    if (events === 'malformed') request.log(`The event log of job ${job.id}, Watcher instance ${job.watcherInstance}, is malformed; its events wait.`);
    const lostCause = liveness.verdict === 'lost' && job.role !== null
      ? Regrouping.settleLostWatcher(request.platformPorts, jobFolder, job.watcherInstance, forcedStopRetryJobIds.has(job.id))
      : null;
    return {
      jobId:              job.id,
      instance:           job.watcherInstance,
      liveness,
      events:             events === 'malformed' ? [] : events,
      lostCause,
      forcedStopRefusals: Regrouping.refusedForcedStopsOf(jobFolder, job.watcherInstance),
      sessionStarted:     liveness.verdict !== 'ended' || JobResumption.instanceSessionStarted(jobFolder, job.watcherInstance, request.agentAdapter),
    };
  });
  // Also before Hatch folders: a `result` closing an Assistant's turn must not be seen before the move it queued ahead of it.
  const assistantReadings = AssistantSession.readingsOf(workspace.trackerDirectory, request.agentAdapter, { jobs: () => jobs });
  const pendingRequests = HatchInbox.pendingRequestsOf(workspace.rootDirectory, jobs);
  const targets         = [...new Set([request.mainLine, ...jobs.flatMap((job) => (job.target === null ? [] : [job.target]))])].sort();
  const targetTips      = Object.fromEntries(targets.map((target) => [target, targetTipOf(workspace.rootDirectory, target)]));
  const targetsHoldingManagedBlock = targets.filter((target) => targetHoldsManagedBlock(workspace.rootDirectory, target, request.managedBlockMarker));
  const pipelineReading = PipelineFile.read(workspace.pipelineFilePath);
  const pipeline        = pipelineReading.verdict === 'readable' ? pipelineReading.pipeline : null;
  const buildJobs = JobLaunch.observeBuildJobs(jobLaunchContext, jobs, pipeline);
  const ticketIdsTouchingAgentConfig = JobLaunch.ticketIdsTouchingAgentConfigOf(jobLaunchContext, jobs);
  const usageMarker = UsageMarkerFile.read(request.monitorFolder);
  if (usageMarker.verdict === 'malformed') {
    request.log(`The usage marker ${UsageMarkerFile.pathIn(request.monitorFolder)} is malformed (${usageMarker.reason}); no limit is held by it.`);
  }
  return {
    watchers,
    pendingRequests,
    targetTips,
    targetsHoldingManagedBlock,
    buildJobs,
    ticketIdsTouchingAgentConfig,
    usageMarker,
    assistantReadings,
    fingerprint: fingerprintOf(workspace, watchers, pendingRequests, targetTips, buildJobs, usageMarker, ticketIdsTouchingAgentConfig),
    trackerId:   progress.trackerId,
  };
}

function lostWatcherCauseOf(watcher: WatcherObservation): InterruptionCause {
  if (watcher.lostCause !== null) return watcher.lostCause;
  return watcher.forcedStopRefusals.refusals > 0 ? FORCED_STOP_REFUSED_INTERRUPTION : 'watcher-lost';
}

interface AppliedWatcherEvents {
  usageLimitHits:  UsageLimitHit[];
  /** Sessions a refused key or a budget stop ended the work of, which the pass stops after the hold. */
  stoppedSessions: StoppedSession[];
}

/** What the watcher events are read under: the pipeline's API billing, `null` for a subscription, and the decision wording. */
interface WatcherEventFacts {
  apiBilling:        ApiBilling | null;
  decisionWordingOf: DrivePassRequest['decisionWordingOf'];
}

/**
 * A question opens its decision and a closing result moves the job to verification in the hold that reads them; the cursor moves with them.
 * A top-level usage refusal interrupts the job instead, and the error result after it is no closing result; under API billing so do a 429
 * result, a refused key and a budget stop.
 */
function applyWatcherEvents(
  change: TrackerChange,
  adapter: AgentAdapter,
  watchers: readonly WatcherObservation[],
  trackerDirectory: string,
  facts: WatcherEventFacts,
): AppliedWatcherEvents {
  const { board, at } = change;
  const { apiBilling } = facts;
  const usageLimitHits: UsageLimitHit[] = [];
  const stoppedSessions: StoppedSession[] = [];
  const apiRateLimitResetsAt = apiBilling === null ? null : UsageLimits.apiRateLimitResetsAtOf(at);
  for (const watcher of watchers) {
    if (board.jobById(watcher.jobId)?.watcherInstance !== watcher.instance) continue;
    let closedWithResult = false;
    for (const entry of watcher.events) {
      if (entry.origin !== 'agent') continue;
      for (const event of adapter.eventsOf(entry.line)) {
        const state = board.jobById(watcher.jobId)?.state;
        const refusal = UsageLimits.refusalOf(event, apiRateLimitResetsAt);
        if (refusal !== null && state === 'running') {
          const hit = { jobId: watcher.jobId, ...refusal };
          UsageLimits.interruptLimitedJob(board, hit, at);
          usageLimitHits.push(hit);
          continue;
        }
        const failure = event.kind === 'result' ? event.failure : null;
        const stopped = apiBilling === null || failure === null
          ? null
          : ApiBillingStops.applyResultFailure(board, watcher.jobId, apiBilling, failure, facts.decisionWordingOf, at);
        if (stopped !== null) {
          stoppedSessions.push(stopped);
          closedWithResult = true;
          continue;
        }
        if (event.kind === 'started' && (state === 'launching' || state === 'preparing')) board.moveJob(watcher.jobId, 'running', at);
        if (event.kind === 'question' && state === 'running') QuestionRouting.openQuestion(board, watcher.jobId, event.requestId, event.questions, at);
        // A session's turn ends in a `result` too; it finishes only once the Overseer closed its input.
        if (event.kind === 'result' && state === 'running' && !SESSION_JOB_KINDS.includes(board.jobById(watcher.jobId)?.kind ?? 'build')) {
          board.moveJob(watcher.jobId, 'in-customs', at);
          closedWithResult = true;
        }
      }
    }
    const lastEvent = watcher.events.at(-1);
    // A budget stop ends its job in this loop, which then holds no cursor.
    if (lastEvent !== undefined && board.jobById(watcher.jobId) !== undefined) board.setJobEventCursor(watcher.jobId, { instance: watcher.instance, sequence: lastEvent.sequence });
    const job = board.jobById(watcher.jobId);
    const state = job?.state;
    const watcherIsGone = watcher.liveness.verdict === 'ended' || watcher.liveness.verdict === 'lost';
    const sessionExitedByItself = watcher.liveness.verdict === 'ended' && watcher.liveness.end.reason === 'exited';
    const sessionEndedCleanly   = watcher.liveness.verdict === 'ended' && watcher.liveness.end.reason === 'exited' && watcher.liveness.end.exitCode === 0;
    if (job !== undefined && state === 'running' && JobResumption.resumeFailed(
      job,
      JobResumption.launchSessionOwnerJobIdOf(trackerDirectory, board.logRecordsSoFar(), job, adapter),
      sessionExitedByItself,
      watcher.sessionStarted,
    )) {
      JobResumption.applyResumeFailure(board, job, at);
    } else if (watcherIsGone && state === 'stopping' && job !== undefined && SESSION_JOB_KINDS.includes(job.kind) && !IntakeSessions.isIntakeJob(job)) {
      board.endJob(watcher.jobId, { outcome: 'closed' }, at);
    } else if (watcherIsGone && !closedWithResult && state === 'running' && job !== undefined && AnswerDelivery.stoppedForAnswerDelivery(trackerDirectory, job)) {
      board.interruptJob(watcher.jobId, 'answer-delivery', at);
    } else if (sessionEndedCleanly && !closedWithResult && state === 'running' && job !== undefined && REPORTING_JOB_KINDS.includes(job.kind)) {
      board.endJob(watcher.jobId, { outcome: 'failed', cause: BUILD_JOB_CAUSES.noReport }, at);
    } else if (watcherIsGone && !closedWithResult && (state === 'running' || state === 'waiting-for-answer')) {
      board.interruptJob(watcher.jobId, watcher.liveness.verdict === 'lost' ? lostWatcherCauseOf(watcher) : 'agent-crashed', at);
    }
  }
  return { usageLimitHits, stoppedSessions };
}

/** One decision per folder, its context the folder itself, so a restart finding the same folder opens no second one. */
function openLeftoverWorktreeDecisions(change: TrackerChange, decisionWordingOf: DrivePassRequest['decisionWordingOf'], folders: readonly string[]): void {
  const draft = { kind: 'leftover-worktree', ticketIds: [], jobId: null } as const;
  for (const folder of folders) {
    if (change.board.decisions().some((decision) => decision.kind === draft.kind && decision.context === folder)) continue;
    change.board.openDecision({
      ...draft, askedBy: 'overseer', requestId: null, questions: decisionWordingOf(draft).questions, context: folder
    }, change.at);
  }
}

/** One decision while any is open, however many jobs wait on the key. */
function openApiKeyDecisionOnce(board: Board, decisionWordingOf: DrivePassRequest['decisionWordingOf'], at: string): void {
  if (board.decisions().some((decision) => decision.kind === API_KEY_DECISION_DRAFT.kind)) return;
  board.openDecision({
    ...API_KEY_DECISION_DRAFT, askedBy: 'overseer', requestId: null, ...decisionWordingOf(API_KEY_DECISION_DRAFT)
  }, at);
}

function openApiKeyDecisionIdsOf(board: Board): string[] {
  return board.decisions().filter((decision) => decision.kind === API_KEY_DECISION_DRAFT.kind).map((decision) => decision.id);
}

/** The key is set, or the billing no longer needs one: the open decision asks User for nothing. */
function withdrawApiKeyDecisions(board: Board, at: string): void {
  for (const decisionId of openApiKeyDecisionIdsOf(board)) board.withdrawDecision(decisionId, API_KEY_DECISION_WITHDRAWN_REASON, at);
}

function workingDirectoryOf(workspace: Workspace, job: Readonly<Job>): string {
  const [ticketId] = job.ticketIds;
  const ticketWorktree = ticketId === undefined ? null : WorktreesFolder.ticketWorktreeOf(workspace.rootDirectory, ticketId);
  if (ticketWorktree !== null && existsSync(ticketWorktree)) return ticketWorktree;
  // Preparing a ticket's worktree is a later step of the chain; until it exists the session works in a folder of its own.
  const sessionFolder = join(WorktreesFolder.worktreesRootOf(workspace.rootDirectory), 'sessions', job.id);
  mkdirSync(sessionFolder, { recursive: true });
  return sessionFolder;
}

function profileOf(context: JobLaunchContext, job: Readonly<Job>, workingDirectory: string, hatchDirectory: string): WorkerProfile {
  const {
    workspace, monitorFolder, agentAdapter, homeDirectory
  } = context;
  const sessionDenyFacts = {
    dataFolder:       workspace.trackerDirectory,
    monitorFolder,
    credentialPaths:  agentAdapter.credentialPathsOf(homeDirectory),
    gpgHomeDirectory: GpgDirectories.homeDirectoryOf(GpgDirectories.read(homeDirectory), homeDirectory),
    sandboxDenyShape: agentAdapter.sandboxDenyShape,
  };
  return {
    writableRoots:          [workingDirectory],
    deniedWritableRoots:    [workspace.trackerDirectory],
    deniedReadableRoots:    WorkerProfiles.sessionDeniedReadableRootsOf(sessionDenyFacts),
    bashNetworkDomains:     [],
    webNetworkDomains:      'none',
    extraWritableDirectory: hatchDirectory,
    allowedCommandPrefixes: [],
    deniedCommandPrefixes:  [],
    askUser:                job.role !== null && ROLES_THAT_MAY_ASK.has(job.role),
    skills:                 false,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       workspace.rootDirectory,
    gitHooksDirectory:      join(workspace.rootDirectory, '.githooks'),
    commitSigning:          { kind: 'unsigned' },
    networkDomainGuard:     null,
  };
}

function repositorySignsCommits(repositoryRoot: string): boolean {
  const run = GitProcess.run(repositoryRoot, ['config', '--bool', 'commit.gpgsign']);
  return run !== null && GitProcess.succeeded(run) && run.standardOutput.trim() === 'true';
}

/**
 * A builder or reviewer runs confined by the per-job profile of design section 4.4, in the Airlock's worktree too when it is resumed there;
 * the other roles get theirs with the later tickets that run them.
 */
function launchProfileOf(jobLaunchContext: JobLaunchContext, board: Board, job: Readonly<Job>, workingDirectory: string, hatchDirectory: string): WorkerProfile {
  if (IntakeSessions.isIntakeJob(job)) return IntakeSessions.productOwnerProfileOf(profileOf(jobLaunchContext, job, workingDirectory, hatchDirectory));
  if (Onboarding.isOnboarderJob(job)) return Onboarding.onboarderProfileOf(profileOf(jobLaunchContext, job, workingDirectory, hatchDirectory), hatchDirectory);
  const isAirlockAgent = job.kind === 'merge-agent';
  if (!isAirlockAgent && !JobLaunch.isWorktreeJob(job)) return profileOf(jobLaunchContext, job, workingDirectory, hatchDirectory);
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === job.ticketIds[0]);
  const role = job.kind === 'review' || job.role === 'reviewer' ? 'reviewer' : 'builder';
  const toolchain = WorkerProfiles.workerToolchainOf(board.pipeline(), ticket?.frontmatter.network ?? [], jobLaunchContext.platformPorts.shellLine);
  const profile = WorkerProfiles.profileOf(role, JobLaunch.sandboxFactsFor(jobLaunchContext, job, isAirlockAgent ? workingDirectory : undefined), toolchain);
  // In the Airlock the agent cannot ask User: the slot stays held while it works.
  return isAirlockAgent ? { ...profile, askUser: false } : profile;
}

/** `null` for a job that is no Airlock agent; `conflicts-unknown` when neither the kept facts nor git tell which files conflict. */
function airlockFactsOf(board: Board, trackerDirectory: string, job: Readonly<Job>, workingDirectory: string): AirlockFacts | null | 'conflicts-unknown' {
  if (job.kind !== 'merge-agent' || job.parentJobId === null) return null;
  const mergeJob       = board.jobs().find((candidate) => candidate.id === job.parentJobId);
  const mergeJobFolder = WatcherFleet.jobFolderOf(trackerDirectory, job.parentJobId);
  const phase          = mergeJob?.airlock?.phase === 'fixing' ? 'fixing' : 'resolving';
  const conflicts      = AirlockFactsFile.conflictedFilesOf(mergeJobFolder, phase, workingDirectory);
  if (conflicts.verdict === 'unknown') return 'conflicts-unknown';
  return {
    worktree:        workingDirectory,
    branchTip:       mergeJob?.airlock?.branchTip ?? '',
    targetTip:       mergeJob?.airlock?.targetTip ?? '',
    phase,
    conflictedFiles: conflicts.conflictedFiles,
    redHandoff:      RedHandoff.redHandoffFactsOf(mergeJobFolder),
    resumesSession:  JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) !== job.id,
  };
}

function reviewFindingsOf(board: Board, trackerDirectory: string, job: Readonly<Job>): ReviewFindingsFacts | null {
  if (job.kind !== 'build' || JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) === job.id) return null;
  const ticketBody = board.tickets().find((ticket) => job.ticketIds.includes(ticket.frontmatter.id))?.body ?? '';
  return {
    reviewSection:  JobResumption.newestReviewSectionOf(ticketBody),
    resume:         Playbook.handoffCycleResumesOf(job, board.logRecordsSoFar()),
    resumesAllowed: LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    targetCatchUp:  JobLaunch.targetCatchUpHandoverOf(trackerDirectory, board.logRecordsSoFar(), job.ticketIds[0] ?? ''),
  };
}

/** The stored gates as the display line of this machine's shell grammar; `null` with no pipeline stored. */
function checksLineOf(board: Board, shellLine: Pick<ShellLine, 'displayLineOf'>): string | null {
  const pipeline = board.pipeline();
  return pipeline === null ? null : shellLine.displayLineOf(pipeline.gates.map((gate) => ({ line: gate.run, workingDirectory: gate.in ?? null })));
}

type LaunchFactsSource = Pick<DrivePassRequest, 'workspace' | 'platformPorts'>;

/** An `unavailable` answer still asks for the sandbox, so the session refuses to start rather than run unconfined. */
function sessionConfinementOf(platformPorts: LaunchFactsSource['platformPorts']): AgentConfinement {
  return platformPorts.gateConfinement.workerConfinement() === 'unconfined-by-design' ? 'unconfined-by-design' : 'confined';
}

function launchFactsOf(board: Board, request: LaunchFactsSource, job: Readonly<Job>, instructions: string, airlock: AirlockFacts | null): JobLaunchFacts {
  const { trackerDirectory } = request.workspace;
  return {
    instructions,
    confinement: sessionConfinementOf(request.platformPorts),
    airlock,
    tickets:     board.tickets()
      .filter((ticket) => job.ticketIds.includes(ticket.frontmatter.id))
      .map((ticket) => ({ id: ticket.frontmatter.id, title: ticket.frontmatter.title, body: ticket.body })),
    checksLine:             checksLineOf(board, request.platformPorts.shellLine),
    gates:                  board.pipeline()?.gates ?? null,
    mergeApprovalIsOn:      board.mergeApprovalIsOn(),
    earlierSessionReplaced: JobResumption.earlierSessionWasReplaced(board.logRecordsSoFar(), job),
    redHandoff:             JobResumption.redHandoffTakenOverOf(trackerDirectory, board.logRecordsSoFar(), job),
    reviewFindings:         reviewFindingsOf(board, trackerDirectory, job),
    intake:                 IntakeSessions.intakeFactsOf(board, job),
    assistant:              AssistantBoot.assistantFactsOf(board, job),
    onboarding:             Onboarding.onboardingFactsOf(board, job, request.platformPorts.shellLine.lineGrammar),
  };
}

/**
 * Refused, spawning nothing, when an instruction file the pipeline names is missing or the agent program does not resolve: the refusal is the notice.
 * An Airlock agent whose denied root cannot be made answers that root, and one whose conflicted files nothing tells answers so; nothing
 * marks its instance spawned, so the next pass tries it again.
 */
function launchWatcher(
  request: DrivePassRequest,
  jobLaunchContext: JobLaunchContext,
  board: Board,
  trackerId: string,
  job: Readonly<Job>,
): LaunchRefusal | UnmadeAirlockAgentRoot | ApiBillingKeyMissing | AirlockConflictsUnknown | null {
  const { workspace, agentAdapter } = request;
  const billing = board.pipeline()?.billing;
  if (billing?.mode === 'api' && !request.apiBillingKeyIsSet()) return { apiBillingKeyMissingFor: job.id };
  const instructions = InstructionFiles.readingFor(workspace.rootDirectory, request.mainLine, board.pipeline(), job);
  if (instructions.verdict === 'instructions-missing') return { kind: 'instructions-missing', jobId: job.id, path: instructions.path };
  const program = agentAdapter.programPathOf(request.platformPorts.executableResolver, [workspace.rootDirectory]);
  if (program.verdict === 'refused') return {
    kind: 'agent-program-refused', jobId: job.id, cause: program.cause, reason: program.reason
  };
  const unfitEndpoint = WatcherFleet.unfitEndpointOf(request.platformPorts, {
    monitorFolder: request.monitorFolder, trackerId, jobId: job.id, instance: job.watcherInstance
  });
  if (unfitEndpoint !== null) return { kind: 'watcher-endpoint-does-not-fit', jobId: job.id, endpoint: unfitEndpoint };
  const jobFolder        = WatcherFleet.jobFolderOf(workspace.trackerDirectory, job.id);
  const hatchDirectory   = HatchInbox.hatchDirectoryOf(workspace.rootDirectory, job.id);
  mkdirSync(join(hatchDirectory, 'requests'), { recursive: true });
  request.watchHatchFolder?.(hatchDirectory);
  const workingDirectory = Onboarding.isOnboarderJob(job)
    ? Onboarding.prepareSnapshot({ workspace, worktreesRoot: WorktreesFolder.worktreesRootOf(workspace.rootDirectory), mainLine: request.mainLine }, job)
    : workingDirectoryOf(workspace, job);
  if (JobLaunch.isWorktreeJob(job) && JobLaunch.deniedRootRefusalRecorded(jobLaunchContext, job, WORKER_LAUNCH_STEP)) return null;
  if (job.kind === 'merge-agent') {
    const unmadeRoot = AirlockSandboxIncident.unmadeRootOf(
      job.id,
      { worktree: workingDirectory, sandboxDenyShape: agentAdapter.sandboxDenyShape },
      request.folderMaker,
    );
    if (unmadeRoot !== null) {
      request.log(`The Airlock agent of job ${job.id} did not launch: ${unmadeRoot.reason}.`);
      return unmadeRoot;
    }
  }
  const airlock = airlockFactsOf(board, workspace.trackerDirectory, job, workingDirectory);
  if (airlock === 'conflicts-unknown') {
    request.log(`The Airlock agent of job ${job.id} did not launch: neither its kept facts nor git tell which files conflict.`);
    return { airlockConflictsUnknownFor: job.id };
  }
  const launchFacts      = launchFactsOf(board, request, job, instructions.text, airlock);
  const text             = request.launchTextOf(job, launchFacts);
  const resumeLine       = JobResumption.resumeLineOf(workspace.trackerDirectory, board, job, request);
  const redHandoffTakenOver = launchFacts.redHandoff ?? null;
  // A resumed instance reads the owner its first instance recorded, though the handoff it took over may read otherwise by now.
  const staleGreenSessionOwner = redHandoffTakenOver === null && !JobResumption.isResumedInstance(job)
    ? null
    : JobResumption.staleGreenSessionOwnerOf(workspace.trackerDirectory, board.logRecordsSoFar(), job, agentAdapter);
  JobResumption.recordStaleGreenSessionOwner(workspace.trackerDirectory, job, staleGreenSessionOwner);
  // A resumed stale-green session is told its red handoff as a resume of its own ladder, never its task again.
  const firstMessage     = staleGreenSessionOwner === null || redHandoffTakenOver === null ? text.firstMessage : request.redHandoffMessageOf(redHandoffTakenOver);
  const launchParts      = JobResumption.launchPartsOf(job, firstMessage, resumeLine);
  if (!launchParts.resume && redHandoffTakenOver !== null) RedHandoff.adoptRedHandoff(jobFolder, redHandoffTakenOver);
  if (JobLaunch.isWorktreeJob(job)) JobLaunch.recordJobStart(jobLaunchContext, board, job);
  if (!launchParts.resume) JobResumption.storeFirstMessage(jobFolder, job.watcherInstance, launchParts.firstMessage);
  const sessionOwnerJobId = staleGreenSessionOwner ?? JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job);
  const { launchEnvironment } = request.platformPorts;
  const launchRequest: AgentLaunchRequest = {
    programPath:   program.path,
    sessionId:     agentAdapter.sessionIdOf(trackerId, sessionOwnerJobId),
    resume:        launchParts.resume || sessionOwnerJobId !== job.id,
    workingDirectory,
    homeDirectory: request.homeDirectory,
    firstMessage:  launchParts.firstMessage,
    roleBrief:     text.roleBrief,
    ...AssistantBoot.launchSettingsOf(job),
    ...JobLaunch.reviewerLaunchSettingsOf(board.pipeline()?.review, job),
    environment:   launchEnvironment.launchEnvironmentOf(
      request.inheritedEnvironment,
      { [JOB_ID_VARIABLE]: job.id, [HATCH_DIRECTORY_VARIABLE]: hatchDirectory },
      agentAdapter.inheritedVariableNames
    ),
    profile:           launchProfileOf(jobLaunchContext, board, job, workingDirectory, hatchDirectory),
    confinement:       launchFacts.confinement,
    jobFilesDirectory: jobFolder,
    reportSchema:      REPORT_SCHEMA_OF_JOB_KIND[job.kind] ?? null,
    ...(billing === undefined ? {} : { billing }),
  };
  if (JobLaunch.isWorktreeJob(job) || job.kind === 'merge-agent') {
    const notice = WorkerProfiles.unsignedCommitNoticeOf(launchRequest.profile, repositorySignsCommits(workspace.rootDirectory), job.id);
    if (notice !== null) request.log(notice);
  }
  if (launchRequest.profile.networkDomainGuard?.programPath === null) JobLaunch.logUnstartableGuard(jobLaunchContext, job);
  WatcherFleet.writeLaunchFiles(request.platformPorts, {
    jobFolder,
    instance:           job.watcherInstance,
    jobId:              job.id,
    trackerId,
    monitorFolder:      request.monitorFolder,
    watcherCodeVersion: request.codeVersion,
    workingDirectory,
    plan:               agentAdapter.planOf(launchRequest),
    ...JobLaunch.treeStopAtEndOf(job),
  });
  JobLaunch.recordInstructionsRead(jobFolder, job.watcherInstance, instructions.files);
  (request.processStarts ?? REAL_PROCESS_STARTS).spawnWatcher(request.platformPorts, {
    bundlePath: request.watcherBundlePath, jobFolder, instance: job.watcherInstance, rootDirectory: workspace.rootDirectory
  });
  request.log(`Spawned Watcher instance ${job.watcherInstance} of job ${job.id} (${job.kind}${job.ticketIds.length === 0 ? '' : ` #${job.ticketIds.join(', #')}`}).`);
  return null;
}

/**
 * A job launching, or resumed into `running`, whose current instance nobody claimed yet; spawning twice is harmless, since the claim is
 * exclusive. A build job launches its session only once its worktree is prepared, as it moves into `running`.
 */
function jobsNeedingAWatcher(
  ports: PlatformPorts,
  board: Board,
  trackerDirectory: string,
  spawnedInstances: ReadonlySet<string>,
  heldTicketIds: readonly string[],
): readonly Readonly<Job>[] {
  return board.jobs().filter((job) => ((job.state === 'launching' && !JobLaunch.isWorktreeJob(job)) || job.state === 'running')
    && job.role !== null
    && !job.ticketIds.some((ticketId) => heldTicketIds.includes(ticketId))
    && !spawnedInstances.has(`${job.id}:${job.watcherInstance}`)
    && WatcherFleet.livenessOf(ports, WatcherFleet.jobFolderOf(trackerDirectory, job.id), job.watcherInstance).verdict === 'unclaimed');
}

function legacyWatcherJobIdsOf(board: Board, trackerDirectory: string): string[] {
  return board.jobs()
    .filter((job) => LegacyWatcherReader.attachmentOf(WatcherFleet.watcherRecordOf(WatcherFleet.jobFolderOf(trackerDirectory, job.id), job.watcherInstance)) === 'legacy-watcher')
    .map((job) => job.id);
}

function noticesOf(
  request: DrivePassRequest,
  installVersionChanged: boolean,
  observation: Observation,
  attributionTicketIds: readonly string[],
  nonConvergingTicketIds: readonly string[],
  heldTargets: readonly HeldTarget[],
  declinedCleanups: readonly DeclinedCleanup[],
  defaultedIncidents: readonly DefaultedIncident[],
  launchRefusals: readonly LaunchRefusal[],
): OverseerNotice[] {
  return [
    ...heldTargets.map((held): OverseerNotice => (held.heldFiles.length > 0
      ? { kind: 'target-file-held', target: held.target, heldFiles: held.heldFiles }
      : {
        kind: 'dirty-main-checkout', target: held.target, branch: held.branch, blockingFiles: held.blockingFiles
      })),
    ...declinedCleanups.map((declined) => ({ kind: 'cleanup-declined', ...declined }) as const),
    ...(installVersionChanged ? [{ kind: 'install-version-changed' } as const] : []),
    ...(request.newCodeOnDisk?.() === true ? [{ kind: 'new-code' } as const] : []),
    ...observation.targetsHoldingManagedBlock.map((target) => ({ kind: 'claude-md-block-committed', target }) as const),
    ...attributionTicketIds.map((ticketId) => ({ kind: 'attribution-found', ticketId }) as const),
    ...nonConvergingTicketIds.map((ticketId) => ({ kind: 'rounds-not-converging', ticketId }) as const),
    ...defaultedIncidents.map(({ incidentId, move, cause }) => ({
      kind: 'incident-defaulted', incidentId, move, cause
    }) as const),
    ...launchRefusals,
  ];
}

export function createDrivePass(request: DrivePassRequest): DrivePass {
  const spawnedInstances = new Set<string>();
  let lastFingerprint: string | null = null;
  let running: Promise<void> | null = null;
  let wokenAgain = false;
  let forcedNext = false;
  const quietJobWatch = IncidentRouter.createQuietJobWatch(QUIET_JOB_SWEEPS);
  const quietJobIdsDue: string[] = [];
  const forcedStopRetryJobIdsDue: string[] = [];
  let jobsAtTheLastPass: readonly Readonly<Job>[] = [];
  const assistantQuietWatch = AssistantSession.createAssistantQuietWatch(QUIET_JOB_SWEEPS);
  const quietAssistantIdsDue: string[] = [];
  let assistantsMidTurnAtTheLastPass: readonly string[] = [];
  let assistantBootRetryRequested = false;
  let state: OverseerStateDocument = {
    generation: request.generation, passes: 0, runtimeState: 'serving', notices: [], legacyWatcherJobIds: []
  };
  let stopped = false;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const leftoverWorktrees: string[] = [];
  let declinedCleanups: DeclinedCleanup[] = [];
  const worktreesRoot = WorktreesFolder.worktreesRootOf(request.workspace.rootDirectory);
  const { platformPorts } = request;
  const sessionStopGraceMilliseconds = request.sessionStopGraceMilliseconds ?? SESSION_STOP_GRACE_MILLISECONDS;
  const gateSlots = createGateRunSlots({
    ports:             platformPorts,
    folder:            join(request.monitorFolder, GATE_SLOTS_FOLDER),
    limit:             GATE_RUNS_AT_ONCE,
    holderIsLive:      (holding) => gateRunHolderIsLive(platformPorts, holding),
    retryMilliseconds: request.gateSlotRetryMilliseconds ?? GATE_SLOT_RETRY_MILLISECONDS,
  });
  const jobLaunchContext: JobLaunchContext = {
    platformPorts,
    workspace:            request.workspace,
    agentAdapter:         request.agentAdapter,
    monitorFolder:        request.monitorFolder,
    homeDirectory:        request.homeDirectory,
    inheritedEnvironment: request.inheritedEnvironment,
    mainLine:             request.mainLine,
    groupTargetPrefix:    GROUP_TARGET_PREFIX,
    watcherBundlePath:    request.watcherBundlePath,
    programCommand:       request.programCommand,
    codeVersion:          request.codeVersion,
    gateSlots,
    windDownMessage:      request.windDownMessage,
    decisionWordingOf:    request.decisionWordingOf,
    log:                  request.log,
    ...(request.processStarts === undefined ? {} : { processStarts: request.processStarts }),
  };
  const endedJobTokensContext = { trackerDirectory: request.workspace.trackerDirectory, agentAdapter: request.agentAdapter };
  const endedJobIdsExamined = new Set<string>();

  /** A merge gate step under the profile a gate Watcher gets, its own network and `writes`, in the slot's worktree; one profile file per worktree. */
  function mergeGateLineOf(worktreePath: string, argv: readonly string[], confinement: GateConfinement): ConfinedLine {
    const facts = WorkerProfiles.sandboxFactsOf({
      repositoryRoot:   request.workspace.rootDirectory,
      dataFolder:       request.workspace.trackerDirectory,
      monitorFolder:    request.monitorFolder,
      homeDirectory:    request.homeDirectory,
      worktree:         worktreePath,
      ownBranch:        '',
      mainLine:         request.mainLine,
      groupPrefix:      GROUP_TARGET_PREFIX,
      hatchDirectory:   '',
      sandboxDenyShape: request.agentAdapter.sandboxDenyShape,
      credentialPaths:  request.agentAdapter.credentialPathsOf(request.homeDirectory),
      // A gate step runs no agent session, so no network guard hook.
      guardCommand:     null,
      ...JobLaunch.cacheFolderFactsOf(jobLaunchContext),
    });
    const profileFolder = join(overseerFilesIn(request.workspace.trackerDirectory).overseerDirectory, MERGE_GATE_PROFILES_FOLDER);
    const profilePath   = join(profileFolder, `${basename(worktreePath)}.sb`);
    const planOf = () => ProcessWatcherSandbox.planOf(JobLaunch.processSandboxRequestOf(jobLaunchContext, facts, confinement), profilePath);
    const unmadeRootReason = WorkerProfiles.unmadeDeniedRootRefusalOf(facts);
    if (unmadeRootReason !== null) return { verdict: 'refused', reason: unmadeRootReason };
    return confinedLineOf(platformPorts.gateConfinement, planOf, argv);
  }

  const holdTracker: AirlockHoldRunner = async (mutate) => (await writeTracker({
    workspace:        request.workspace,
    at:               request.formatStamp(request.now()),
    now:              request.now,
    lockHolderIsGone: platformPorts.processSupervision.processIsGone,
    mutate:           (change) => {
      Baton.requireNewestGeneration(request.overseerDirectory, request.generation);
      // A copy: ending a job splices it out of the Board's live list.
      const jobsAtTheHoldStart = [...change.board.jobs()];
      const result = mutate({ board: change.board, at: change.at });
      EndedJobTokens.creditJobsEndedInTheHold(change.board, endedJobTokensContext, jobsAtTheHoldStart, change.at);
      return result;
    },
  })).result;

  const hatchFolderOfLaunchedJob = new Map<string, string>();

  /** The session's Watcher is asked to stop it, after the grace the session has to end by itself. */
  async function stopSession(jobId: string, watcherInstance: number): Promise<void> {
    await WatcherFleet.sendFrames(platformPorts, WatcherFleet.jobFolderOf(request.workspace.trackerDirectory, jobId), watcherInstance, [
      { kind: 'stop', graceMilliseconds: sessionStopGraceMilliseconds },
    ]);
  }

  function unwatchHatchFoldersOfEndedJobs(board: Board): void {
    for (const [jobId, hatchDirectory] of hatchFolderOfLaunchedJob) {
      if (board.jobById(jobId) !== undefined) continue;
      request.unwatchHatchFolder?.(hatchDirectory);
      hatchFolderOfLaunchedJob.delete(jobId);
    }
  }

  const airlocks = createAirlocks({
    repositoryRoot:    request.workspace.rootDirectory,
    mainLine:          request.mainLine,
    groupTargetPrefix: GROUP_TARGET_PREFIX,
    worktreesRoot,
    worktreeOf:        (ticketId) => WorktreesFolder.ticketWorktreeOf(request.workspace.rootDirectory, ticketId),
    limits:            AIRLOCK_LIMITS,
    get refDeniesHold() {
      return ProcessWatcherSandbox.refDeniesHoldUnder(platformPorts.gateConfinement);
    },
    hold:           holdTracker,
    gateMergedTree: async (worktreePath, treeId) => {
      // Read afresh at every gate run, so a pipeline changed by hand or by a `gate` verb gates the next tree without a restart.
      const reading  = PipelineFile.read(request.workspace.pipelineFilePath);
      const pipeline = reading.verdict === 'readable' ? reading.pipeline : null;
      const holder   = inProcessHolderOf(`${worktreePath}@${treeId}`);
      const verdict  = await (request.processStarts ?? REAL_PROCESS_STARTS).runGatePipeline({
        shellLine:       platformPorts.shellLine,
        prepare:         pipeline?.prepare ?? [],
        gates:           pipeline?.gates ?? [],
        directory:       worktreePath,
        environment:     JobLaunch.gateEnvironmentOf(jobLaunchContext),
        spawnOptions:    platformPorts.processSupervision.spawnOptionsFor('gate'),
        confinedLineOf:  (argv, confinement) => mergeGateLineOf(worktreePath, argv, confinement),
        acquireGateSlot: () => gateSlots.acquire(holder),
      });
      if (verdict.outcome === 'passed') return { outcome: 'passed', step: null, output: '' };
      return { outcome: verdict.outcome, step: 'step' in verdict ? verdict.step : verdict.gate, output: verdict.output };
    },
    mergeAgentReadingOf: (job) => JobLaunch.sessionReadingOf(jobLaunchContext, job),
    watcherIsLive:       (job) => {
      const jobFolder = WatcherFleet.jobFolderOf(request.workspace.trackerDirectory, job.id);
      return WatcherFleet.livenessOf(platformPorts, jobFolder, job.watcherInstance).verdict === 'live';
    },
    stopMergeAgent:        async (job) => { await stopSession(job.id, job.watcherInstance); },
    decisionWordingOf:     request.decisionWordingOf,
    keepAirlockFacts:      (mergeJob, facts) => AirlockFactsFile.keep(WatcherFleet.jobFolderOf(request.workspace.trackerDirectory, mergeJob.id), facts),
    jobFolderOf:           (job) => WatcherFleet.jobFolderOf(request.workspace.trackerDirectory, job.id),
    jobFolderOfId:         (jobId) => WatcherFleet.jobFolderOf(request.workspace.trackerDirectory, jobId),
    redHandoffResumes:     LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    dispatchIsStopped:     () => requireProgressFile(request.workspace).overseerState === 'paused',
    reportDeclinedCleanup: (declined) => {
      request.log(`Git declined the ${declined.cleanup} cleanup of ${declined.groupBranch}: ${declined.reason}`);
      declinedCleanups = [...declinedCleanups.filter((earlier) => earlier.cleanup !== declined.cleanup || earlier.groupBranch !== declined.groupBranch), declined];
    },
  });

  /** Rechecked every pass: a notice goes once what git declined to remove is gone. */
  function stillDeclinedCleanups(): DeclinedCleanup[] {
    declinedCleanups = declinedCleanups.filter((declined) => (
      GroupWorktrees.cleanupIsStillDeclined(request.workspace.rootDirectory, worktreesRoot, declined.groupBranch, declined.cleanup)
    ));
    return declinedCleanups;
  }

  /** The marker first, so another board's Overseer holds its launches before this one's limited sessions are even stopped. */
  async function stopLimitedJobs(board: Board, trackerId: string, hits: readonly UsageLimitHit[]): Promise<void> {
    UsageLimits.markHits(request.monitorFolder, request.agentAdapter.vendor, trackerId, hits);
    for (const hit of hits) {
      const job = board.jobById(hit.jobId);
      if (job !== undefined) await stopSession(job.id, job.watcherInstance);
    }
  }

  /** A clock exception (design section 7.6): the vendor names its reset as a time, so the pass that resumes the limited jobs waits for it. */
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

  async function runOnePass(forced: boolean): Promise<void> {
    const observation = observe(request, jobLaunchContext, new Set(forcedStopRetryJobIdsDue.splice(0)));
    if (!forced && observation.fingerprint === lastFingerprint) return;
    await request.installVersionsKnown?.();
    const at = request.formatStamp(request.now());
    const installVersionChanged = request.installVersionChanged();
    const written = await writeTracker({
      workspace:        request.workspace,
      at,
      now:              request.now,
      lockHolderIsGone: platformPorts.processSupervision.processIsGone,
      mutate:           (change) => {
        openLeftoverWorktreeDecisions(change, request.decisionWordingOf, leftoverWorktrees.splice(0));
        const replies = HatchInbox.applyPendingRequests(change, request.workspace.rootDirectory, observation.pendingRequests);
        request.afterHoldPhase?.('relayed-commands', change.board);
        const billing = change.board.pipeline()?.billing;
        const watcherEventFacts = { apiBilling: billing?.mode === 'api' ? billing : null, decisionWordingOf: request.decisionWordingOf };
        const { usageLimitHits, stoppedSessions } = applyWatcherEvents(
          change,
          request.agentAdapter,
          observation.watchers,
          request.workspace.trackerDirectory,
          watcherEventFacts,
        );
        RefusedForcedStops.settle(change.board, observation.watchers, request.decisionWordingOf, change.at);
        const livenessOf = (job: Readonly<Job>): WatcherLiveness => observation.watchers
          .find((watcher) => watcher.jobId === job.id && watcher.instance === job.watcherInstance)?.liveness
          ?? WatcherFleet.livenessOf(platformPorts, WatcherFleet.jobFolderOf(request.workspace.trackerDirectory, job.id), job.watcherInstance);
        IntakeSessions.endClosedIntakes(change.board, livenessOf, change.at);
        Onboarding.applySettledOnboarders(change, WorktreesFolder.worktreesRootOf(request.workspace.rootDirectory), request.decisionWordingOf);
        request.afterHoldPhase?.('watcher-events', change.board);
        IncidentRouter.openQuietJobIncidents(change.board, quietJobIdsDue.splice(0), QUIET_JOB_SWEEPS, change.at);
        const { assistantReadings } = observation;
        const downAssistants = AssistantSession.endDownAssistants(change.board, assistantReadings, quietAssistantIdsDue.splice(0), change.at);
        const assistantBootRetryDue = assistantBootRetryRequested && !downAssistants.bootFailed;
        assistantBootRetryRequested = false;
        const buildJobRecords = JobLaunch.applyBuildJobObservations(change, jobLaunchContext, observation.buildJobs);
        const usageResetsAt = UsageLimits.usageResetsAtOf(observation.usageMarker, usageLimitHits);
        const agentConfigHold = JobLaunch.holdAgentConfigHits(change, jobLaunchContext, observation.ticketIdsTouchingAgentConfig);
        const observations = {
          mainLine:                     request.mainLine,
          groupTargetPrefix:            GROUP_TARGET_PREFIX,
          installVersionChanged,
          targetsHoldingManagedBlock:   observation.targetsHoldingManagedBlock,
          ticketIdsTouchingAgentConfig: agentConfigHold.held,
          ...AssistantSession.turnObservationsOf(change.board, assistantReadings),
          assistantBootRetryDue,
        };
        const jobIdsBeforeTheLifecycle = new Set(change.board.jobs().map((job) => job.id));
        change.board.followPlaybook({ ...LIFECYCLE_LIMITS, now: at, usageResetsAt }, observations, request.decisionWordingOf);
        AssistantBoot.deliverOpenIncidentsAtBoot(change.board, jobIdsBeforeTheLifecycle);
        if (usageResetsAt === null) {
          AssistantSession.deliverIncidentsWhenIdle(change.board, assistantReadings, request.workspace.trackerDirectory, change.at);
        }
        request.afterHoldPhase?.('lifecycle', change.board);
        // Also credits every job this hold ended, since its `job-ended` record is already in the log the scan reads.
        const endedJobIdsExaminedThisPass = EndedJobTokens.creditJobsTheLogEndedUncredited(change.board, endedJobTokensContext, endedJobIdsExamined, change.at);
        return {
          replies,
          endedJobIdsExaminedThisPass,
          endedAssistantJobs:       downAssistants.endedJobs,
          usageLimitHits,
          stoppedSessions,
          usageResetsAt,
          attributionTicketIds:     JobLaunch.attributionTicketIdsOf([...change.storedLogRecords, ...buildJobRecords]),
          agentConfigHeldTicketIds: agentConfigHold.held,
          nonConvergingTicketIds:   ReviewOutcome.nonConvergingTicketIdsOf(change.board.logRecordsSoFar(), LIFECYCLE_LIMITS),
        };
      },
    });
    try {
      Baton.requireNewestGeneration(request.overseerDirectory, request.generation);
    } catch (refusal) {
      stopped = true;
      request.onBatonTakenOver(refusal);
      return;
    }
    for (const jobId of written.result.endedJobIdsExaminedThisPass) endedJobIdsExamined.add(jobId);
    HatchInbox.writeReplies(written.result.replies);
    await stopLimitedJobs(written.board, observation.trackerId, written.result.usageLimitHits);
    for (const stoppedSession of written.result.stoppedSessions) await stopSession(stoppedSession.jobId, stoppedSession.watcherInstance);
    scheduleThePassAtTheReset(written.result.usageResetsAt);
    await JobLaunch.runBuildJobEffects(jobLaunchContext, written.board, observation.trackerId, observation.buildJobs);
    const settledOnboarders = await Onboarding.settleEndedOnboarders({
      platformPorts,
      workspace:             request.workspace,
      worktreesRoot:         WorktreesFolder.worktreesRootOf(request.workspace.rootDirectory),
      mainLine:              request.mainLine,
      agentAdapter:          request.agentAdapter,
      gateEnvironment:       JobLaunch.gateEnvironmentOf(jobLaunchContext),
      confinedLineOf:        mergeGateLineOf,
      millisecondsNow:       () => request.now().getTime(),
      stopGraceMilliseconds: sessionStopGraceMilliseconds,
    }, written.board);
    if (settledOnboarders > 0) wake(true);
    for (const endedAssistant of written.result.endedAssistantJobs) await stopSession(endedAssistant.id, endedAssistant.watcherInstance);
    await JobResumption.deliverFirstMessages(platformPorts, request.workspace.trackerDirectory, written.board, request.agentAdapter);
    await AssistantSession.deliverChats({
      platformPorts,
      trackerDirectory: request.workspace.trackerDirectory,
      board:            written.board,
      adapter:          request.agentAdapter,
      readings:         observation.assistantReadings,
      chatTextOf:       request.assistantChatTextOf,
    });
    await JobControlDelivery.deliverJobControls({
      platformPorts, trackerDirectory: request.workspace.trackerDirectory, board: written.board, adapter: request.agentAdapter, windDownMessage: request.windDownMessage,
    });
    unwatchHatchFoldersOfEndedJobs(written.board);
    const launchRefusals: LaunchRefusal[] = [];
    const unmadeAirlockAgentRoots: UnmadeAirlockAgentRoot[] = [];
    const launchedAirlockAgentJobIds: string[] = [];
    let apiBillingKeyIsMissing = false;
    const jobsToLaunch = ApiBillingStops.launchesAreHeld(written.board)
      ? []
      : jobsNeedingAWatcher(platformPorts, written.board, request.workspace.trackerDirectory, spawnedInstances, written.result.agentConfigHeldTicketIds);
    for (const job of jobsToLaunch) {
      hatchFolderOfLaunchedJob.set(job.id, HatchInbox.hatchDirectoryOf(request.workspace.rootDirectory, job.id));
      const refusal = launchWatcher(request, jobLaunchContext, written.board, observation.trackerId, job);
      if (refusal === null) spawnedInstances.add(`${job.id}:${job.watcherInstance}`);
      else if ('apiBillingKeyMissingFor' in refusal) apiBillingKeyIsMissing = true;
      else if ('airlockConflictsUnknownFor' in refusal) continue;
      else if ('kind' in refusal) launchRefusals.push(refusal);
      else unmadeAirlockAgentRoots.push(refusal);
      if (refusal === null && AirlockSandboxIncident.standsOpenFor(written.board, job.id)) launchedAirlockAgentJobIds.push(job.id);
    }
    const apiKeyDecisionIsDue = apiBillingKeyIsMissing && openApiKeyDecisionIdsOf(written.board).length === 0;
    const apiKeyIsNotMissing = written.board.pipeline()?.billing?.mode !== 'api' || request.apiBillingKeyIsSet();
    const apiKeyDecisionIsStale = apiKeyIsNotMissing && openApiKeyDecisionIdsOf(written.board).length > 0;
    const holdIsDue = unmadeAirlockAgentRoots.length > 0 || launchedAirlockAgentJobIds.length > 0 || apiKeyDecisionIsDue || apiKeyDecisionIsStale;
    if (holdIsDue) await holdTracker((hold) => {
      for (const unmadeRoot of unmadeAirlockAgentRoots) AirlockSandboxIncident.openOnce(hold.board, unmadeRoot, hold.at);
      for (const jobId of launchedAirlockAgentJobIds) AirlockSandboxIncident.closeOnLaunch(hold.board, jobId, hold.at);
      if (apiKeyDecisionIsDue) openApiKeyDecisionOnce(hold.board, request.decisionWordingOf, hold.at);
      if (apiKeyDecisionIsStale) withdrawApiKeyDecisions(hold.board, hold.at);
    });
    const { trackerDirectory } = request.workspace;
    const answerAwaitsDelivery = (job: Readonly<Job>): boolean => AnswerDelivery.answerAwaitsDelivery(trackerDirectory, job);
    await JobResumption.deliverResumeMessages(platformPorts, trackerDirectory, written.board, request.agentAdapter, request, answerAwaitsDelivery);
    await AnswerDelivery.deliverAnswers({
      platformPorts,
      trackerDirectory,
      board:                     written.board,
      adapter:                   request.agentAdapter,
      deliversByControlResponse: request.deliversAnswersByControlResponse ?? CONTROL_RESPONSE_DELIVERS_ANSWERS,
      answerMessageOf:           request.answerMessageOf,
    });
    const heldTargets = written.board.pipeline() === null ? [] : await airlocks.sweep();
    await WatcherFleet.reapEndedWatchers(platformPorts, trackerDirectory);
    jobsAtTheLastPass = written.board.jobs();
    assistantsMidTurnAtTheLastPass = AssistantSession.midTurnJobIdsOf(request.workspace.trackerDirectory, written.board, observation.assistantReadings);
    state = {
      generation:   request.generation,
      passes:       state.passes + 1,
      runtimeState: installVersionChanged ? 'held-by-install-change' : 'serving',
      notices:      noticesOf(
        request,
        installVersionChanged,
        observation,
        written.result.attributionTicketIds,
        written.result.nonConvergingTicketIds,
        heldTargets,
        stillDeclinedCleanups(),
        IncidentRouter.defaultedIncidentsOf(written.board.logRecordsSoFar()),
        launchRefusals,
      ),
      legacyWatcherJobIds: legacyWatcherJobIdsOf(written.board, request.workspace.trackerDirectory),
    };
    const settled = observe(request, jobLaunchContext);
    // An event a Watcher logged after this pass read its events is unapplied work, never a settled state an unforced wake may skip.
    lastFingerprint = settled.watchers.some((watcher) => watcher.events.length > 0) ? null : settled.fingerprint;
    // A job the merge sweep launched after this pass spawned Watchers needs one more pass, which its settled fingerprint would skip.
    const jobIdsThisPassSaw = new Set(written.board.jobs().map((job) => job.id));
    if (JobLaunch.someBuildJobAwaitsAPass(written.board, settled.buildJobs) || settled.watchers.some((watcher) => !jobIdsThisPassSaw.has(watcher.jobId))) {
      forcedNext = true;
      wokenAgain = true;
    }
  }

  async function drain(): Promise<void> {
    do {
      wokenAgain = false;
      const forced = forcedNext;
      forcedNext = false;
      try {
        await runOnePass(forced);
        request.afterPass?.();
      } catch (thrown) {
        request.log(`A drive pass failed and waits for the next wake-up: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      }
    } while (wokenAgain && !stopped);
    running = null;
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
    const report = await Regrouping.regroup(platformPorts, request.workspace);
    leftoverWorktrees.push(...report.leftoverWorktrees);
    for (const lost of report.lost) request.log(`Watcher instance ${lost.instance} of job ${lost.jobId} is gone (${lost.cause ?? FORCED_STOP_REFUSED_INTERRUPTION}).`);
    wake(true);
    await (running ?? Promise.resolve());
    return report;
  }

  async function stop(): Promise<void> {
    stopped = true;
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = null;
    await (running ?? Promise.resolve());
  }

  /** Also the once-per-sweep boot of an Assistant past the failed-boot bound: a pass with no Assistant live may boot one. */
  function sweep(): void {
    const due = quietJobWatch.sweep(jobsAtTheLastPass);
    const quietAssistants = assistantQuietWatch.sweep(jobsAtTheLastPass, assistantsMidTurnAtTheLastPass);
    const noAssistantIsLive = !jobsAtTheLastPass.some((job) => AssistantBoot.isAssistantJob(job));
    const forcedStopRetries = RefusedForcedStops.jobIdsToRetryOf(jobsAtTheLastPass);
    if (due.length === 0 && quietAssistants.length === 0 && !noAssistantIsLive && forcedStopRetries.length === 0) return;
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
    state:          () => state,
    stop,
  };
}
