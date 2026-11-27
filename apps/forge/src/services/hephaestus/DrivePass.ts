/**
 * Hephaestus's one serial pass, design section 2.5: wake-ups coalesce into one queue, and each pass observes outside the lock (child
 * liveness under Talos, events past each job's stored cursor, then Hatch folders, target tips and ended children), applies relayed commands,
 * then the children's events with their cursors, then the Playbook in one transaction of the board's store, and runs its effects after the
 * Hephaestus lock check.
 */
import { createHash }              from 'node:crypto';
import { mkdirSync }               from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { MachineConfigFile }               from '../../adapters/machine-config/MachineConfigFile.ts';
import type { StartClassificationVerdict } from '../../adapters/presence/@types/StartClassificationVerdict.ts';
import type { RedHandoffFacts }            from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { ForcedStopRefusals }         from '../../adapters/refused-forced-stops/@types/ForcedStopRefusals.ts';
import {
  ADAPT_BUILDER_REPORT_SCHEMA,
  AIRLOCK_AGENT_REPORT_SCHEMA,
  BUILDER_REPORT_SCHEMA,
  EFFECT_READING_REPORT_SCHEMA,
  PACKAGE_BUILDER_REPORT_SCHEMA,
  PACKAGE_REVIEWER_REPORT_SCHEMA,
  REVIEWER_REPORT_SCHEMA
} from '../../adapters/reports/ReportSchemas.ts';
import type { JsonSchema }                          from '../../adapters/reports/ReportValidation.ts';
import { type UsageMarkerReading, UsageMarkerFile } from '../../adapters/usage-marker/UsageMarkerFile.ts';
import type { UsageWindowObservation }              from '../../adapters/usage-marker/UsageWindowsFile.ts';
import type { ChildEnd }                            from '../../domain/talos/ChildRecord.ts';
import type { EventLogEntry }                       from '../../domain/talos/EventLog.ts';
import type { DecisionAnswer }                      from '../../domain/tracker-model/@types/Decision.ts';
import type { IncidentDefaultCause, IncidentMove }  from '../../domain/tracker-model/@types/Incident.ts';
import type {
  InterruptionCause,
  Job,
  JobKind,
  JobNotLaunched,
  JobNotLaunchedCause
} from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey, Pipeline, PipelineGate }            from '../../domain/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording, PlaybookStep } from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                        from '../../domain/tracker-model/Board.ts';
import { Playbook }                                          from '../../domain/tracker-model/Playbook.ts';
import { FORCED_STOP_REFUSED_INTERRUPTION }                  from '../../domain/tracker-model/constants/JobStates.ts';
import { EntityOwnershipUtil, ROOT_ENTITY_KEY }              from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { LaunchSlotUtil }                                    from '../../domain/tracker-model/utils/LaunchSlotUtil.ts';
import type { DocumentReading }                              from '../../domain/tracker-model/utils/TicketDocumentReadingUtil.ts';
import { TicketStageUtil }                                   from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import type { AgentAdapter, AgentEndingName }                from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentConfinement, AgentLaunchRequest }         from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }                                from '../../lib/agent-launch/WorkerProfile.ts';
import { AgentBillingUtil }                                  from '../../lib/agent-launch/utils/AgentBillingUtil.ts';
import { type ConfinedLine, confinedLineOf }                 from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                                        from '../../lib/git/GitProcess.ts';
import type { RecognisedEnding }                             from '../../lib/line-patterns/EndingPatterns.ts';
import type { PlatformPorts }                                from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ShellLine }                                    from '../../lib/shell-line/ShellLine.ts';
import type { SetupMessage }                                 from '../../shared/@types/ControlContext.ts';
import type { EffectReadingSource }                          from '../../shared/@types/EffectReading.ts';
import type { BranchNames }                                  from '../../shared/BranchNames.ts';
import { JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE }         from '../../shared/Environment.ts';
import { WorktreesFolder }                                   from '../../shared/WorktreesFolder.ts';
import { AIRLOCK_LIMITS }                                    from '../../shared/constants/AirlockLimits.ts';
import {
  GATE_RUNS_AT_ONCE,
  GATE_SLOT_RETRY_MILLISECONDS,
  QUIET_JOB_SWEEPS,
  SESSION_STOP_GRACE_MILLISECONDS
} from '../../shared/constants/HephaestusLimits.ts';
import { LIFECYCLE_LIMITS }                                    from '../../shared/constants/LifecycleLimits.ts';
import { AgentProgramWordingUtil }                             from '../../shared/utils/AgentProgramWordingUtil.ts';
import { type AgentProgramResolution, AgentPrograms }          from '../control/AgentPrograms.ts';
import { AgentTools }                                          from '../control/AgentTools.ts';
import type { GateConfinement, LineRunner }                    from '../lifecycle/GateRun.ts';
import { Landing }                                             from '../lifecycle/Landing.ts';
import { MergeRun }                                            from '../lifecycle/MergeRun.ts';
import { ReviewOutcome }                                       from '../lifecycle/ReviewOutcome.ts';
import type { BoardStore }                                     from '../store/BoardStore.ts';
import type { BoardTransaction }                               from '../tracker/BoardTransaction.ts';
import type { LockTaker }                                      from '../tracker/GenerationLock.ts';
import { lockTakerOf }                                         from '../tracker/LockHolders.ts';
import { projectLocationOf }                                   from '../tracker/ProjectLocation.ts';
import { registeredRepositoryRootsIn }                         from '../tracker/RegisteredRepositoryRoots.ts';
import type { Workspace }                                      from '../tracker/Workspace.ts';
import type { PresenceUpdate }                                 from './@types/PresenceRecord.ts';
import { AbandonedPassReason, type PassThrowReading }          from './AbandonedPassReason.ts';
import { AgentSlots }                                          from './AgentSlots.ts';
import { AirlockFactsFile, type AirlockAgentPhase }            from './AirlockFactsFile.ts';
import { AirlockSandboxIncident, type UnmadeAirlockAgentRoot } from './AirlockSandboxIncident.ts';
import {
  type AirlockHoldRunner,
  createAirlocks,
  type DeclinedCleanup,
  type HeldTarget
} from './Airlocks.ts';
import { AnswerDelivery }                                                            from './AnswerDelivery.ts';
import { type ApiBilling, ApiBillingStops, type StoppedSession }                     from './ApiBillingStops.ts';
import { AssistantBoot, type AssistantFacts }                                        from './AssistantBoot.ts';
import { type AssistantChatFacts, type AssistantReading, AssistantSession }          from './AssistantSession.ts';
import type { BoardChildren, ChildLiveness }                                         from './BoardChildren.ts';
import { CrossingStages, type CrossingStageFacts }                                   from './CrossingStages.ts';
import type { DependentFixFacts, DependentFixWording }                               from './DependentFixTickets.ts';
import { type DocumentAgentFacts, type DocumentAgentReading, DocumentAgentSessions } from './DocumentAgentSessions.ts';
import { EffectReadings, type EffectReadingFacts }                                   from './EffectReadings.ts';
import { EndedJobTokens }                                                            from './EndedJobTokens.ts';
import { EntityDecisionAnswers, type PackageNeedFacts, type PackageNeedWording }     from './EntityDecisionAnswers.ts';
import { GateProfiling }                                                             from './GateProfiling.ts';
import { GateRunSlots }                                                              from './GateRunSlots.ts';
import { GpgDirectories }                                                            from './GpgDirectories.ts';
import { GroupWorktrees }                                                            from './GroupWorktrees.ts';
import { HatchInbox, type PendingHatchRequest }                                      from './HatchInbox.ts';
import { jobFolderIn, hephaestusFilesIn }                                            from './HephaestusFiles.ts';
import { HephaestusLock }                                                            from './HephaestusLock.ts';
import { type DefaultedIncident, IncidentRouter }                                    from './IncidentRouter.ts';
import { InstructionFiles }                                                          from './InstructionFiles.ts';
import { IntakeSessions, type IntakeFacts }                                          from './IntakeSessions.ts';
import { type EndedJobSession, JobControlDelivery }                                  from './JobControlDelivery.ts';
import {
  BUILD_JOB_CAUSES,
  type BuildJobObservation,
  JobLaunch,
  type JobLaunchContext,
  type TargetCatchUpHandover
} from './JobLaunch.ts';
import { JobResumption }                                     from './JobResumption.ts';
import { LaunchSettings, type SessionLaunchSettings }        from './LaunchSettings.ts';
import { LineSandbox }                                       from './LineSandbox.ts';
import { MachineAgentLimit }                                 from './MachineAgentLimit.ts';
import { mergedTreeGateStampOf, runMergedTreeGates }         from './MergedTreeGateRun.ts';
import { createMergedTreeGateRuns }                          from './MergedTreeGateRuns.ts';
import { NeedTickets, type NeedsSettledFacts }               from './NeedTickets.ts';
import { PipelineAgentSessions, type PipelineAgentFacts }    from './PipelineAgentSessions.ts';
import { PipelineChecking }                                  from './PipelineChecking.ts';
import { Presence }                                          from './Presence.ts';
import { type ProcessStarts, REAL_PROCESS_STARTS }           from './ProcessStarts.ts';
import { QuestionRouting }                                   from './QuestionRouting.ts';
import { ReconcileCauses }                                   from './ReconcileCauses.ts';
import { RedHandoff }                                        from './RedHandoff.ts';
import { RefusedForcedStops }                                from './RefusedForcedStops.ts';
import { Regrouping, type RegroupingReport }                 from './Regrouping.ts';
import { SessionConfinement }                                from './SessionConfinement.ts';
import { SessionPlaces, type SessionPlace }                  from './SessionPlace.ts';
import { StoredFileUnreadable }                              from './StoredFileUnreadable.ts';
import { stopLiveLinesUnder as stopLiveLinesUnderAt }        from './TalosLines.ts';
import type { UnreadableBoardFiles }                         from './UnreadableBoardFiles.ts';
import { UnreadableJobFileIncident, type UnreadableJobFile } from './UnreadableJobFileIncident.ts';
import { unreadablePipelineGateOf }                          from './UnreadablePipelineGate.ts';
import { type UsageLimitHit, UsageLimits }                   from './UsageLimits.ts';
import { type FolderMaker, WorkerProfiles }                  from './WorkerProfiles.ts';
import { ABANDONED_PASSES_BEFORE_NOTICE }                    from './constants/PresenceLimits.ts';

/** What a session is told at launch; worded by the command line, since services hold no words. */
export interface JobLaunchText {
  firstMessage: string;
  roleBrief:    string;
}

/** What the launch text is filled from: the job's tickets as stored, and the checks line its work is gated by. */
export interface JobLaunchFacts {
  /** `documents`: the ticket's spec and plan as the job's role reads them, absent for a ticket without documents. */
  tickets:                readonly { id: string; title: string; body: string; branch: string; documents?: readonly DocumentReading[] }[];
  /** The gates as the shell line's display render, which an agent reads and nothing spawns; `null` with no pipeline stored. */
  checksLine:             string | null;
  /** The stored gates in run order, which a builder is briefed on, each folder from where the session starts; `null` with no pipeline stored. */
  gates:                  readonly Readonly<PipelineGate>[] | null;
  /** The tracker's project folder from the worktree's root where the session starts; absent when the session starts in the project's folder. */
  projectFolder?:         string;
  /** The board's merge approval: on, a reviewer merges its target into the branch as its review's last step. Absent reads as off. */
  mergeApprovalIsOn?:     boolean;
  /** The job's work was last held by a session ended `replaced`, whose uncommitted changes are in the worktree it inherits. */
  earlierSessionReplaced: boolean;
  /** The red handoff a fresh session takes over from the session it replaces, which could not be resumed; `null` otherwise. */
  redHandoff?:            RedHandoffFacts | null;
  /** What a builder its review sent back is resumed with, in place of its build prompt; `null` for every other job. */
  reviewFindings?:        ReviewFindingsFacts | null;
  /** What a build that runs its stage again after the needs it declared are settled is told; `null` for every other job. */
  needsSettled?:          NeedsSettledFacts | null;
  /** What a job of an entity is told of the stage of a ticket that crosses into whitelisted packages; absent or `null` for every other job. */
  crossingStage?:         CrossingStageFacts | null;
  /** The key of the pipeline's root entity, on a pipeline with entities; absent where it is the default key. */
  rootEntityKey?:         EntityKey;
  /** A product owner's request, and what a fresh one takes over from the session it replaces; `null` for every other job. */
  intake:                 IntakeFacts | null;
  /** What a merge-gate fixer or a resolution reviewer is told of its Airlock; `null` for every other job. */
  airlock:                AirlockFacts | null;
  /** What a fresh Assistant boots with: the incidents of its first message, the newest incident records and the board; `null` otherwise. */
  assistant:              AssistantFacts | null;
  /** A pipeline agent's record, the stored pipeline and the gate history `advise` reads; `null` for every other job. */
  pipelineAgent?:         PipelineAgentFacts | null;
  /** A spec or plan agent's ticket, request and documents; absent or `null` for every other job. */
  documentAgent?:         DocumentAgentFacts | null;
  /** An effect reader's version and the main line's paths; absent or `null` for every other job. */
  effectReading?:         EffectReadingFacts | null;
  /** The role's instruction files as the pipeline names them, joined in order and unfilled; empty for a job no array speaks for. */
  instructions:           string;
  /** What the session runs under on this platform, the one fact its settings and its prompt's confinement claims both come from. */
  confinement:            AgentConfinement;
}

type LaunchRefusal = Extract<HephaestusNotice, { kind: 'instructions-missing' }>;

/** The agent's program did not resolve: the job stands not launched, which the pass records in a hold of its own. */
interface AgentProgramRefused {
  readonly notLaunchedJobId: string;
  readonly notLaunched:      JobNotLaunched;
}

/** No Talos took the launch: nothing marks the instance launched, so the next pass tries it again. */
interface TalosDidNotLaunch {
  readonly talosDidNotLaunch: string;
}

/** API billing is set and Hephaestus's environment holds no API key: nothing starts until User sets it. */
interface ApiBillingKeyMissing {
  readonly apiBillingKeyMissingFor: string;
}

/** A first setup's pipeline agent before its record holds a billing: it launches under none, and the next pass tries it again. */
interface SetupBillingNotChosen {
  readonly setupBillingNotChosenFor: string;
}

/** An Airlock agent whose conflicted files nothing tells: it is not told a wrong list, and the next pass reads them again. */
interface AirlockConflictsUnknown {
  readonly airlockConflictsUnknownFor: string;
}

/** A file the launch needs that its ingestion could not read: nothing launches, and the pass's hold opens its incident on the job named. */
interface UnreadableJobFileRefusal {
  readonly unreadableJobFile: UnreadableJobFile;
}

/** A session forge's confinement cannot hold, of a job with no incident of its own for it: the next pass tries it again. */
interface SessionConfinementRefused {
  readonly sessionConfinementRefusedFor: string;
}

const API_KEY_DECISION_DRAFT = { kind: 'api-key-not-set', ticketIds: [], jobId: null } as const;

const API_KEY_DECISION_WITHDRAWN_REASON = 'Hephaestus no longer misses the API key';

/** The review that did not hold, and which resume of the builder's handoff cycle this is. */
export interface ReviewFindingsFacts {
  reviewSection:  string;
  resume:         number;
  resumesAllowed: number;
  /** Set when the review ended before its reviewer, on bringing the branch up to the target: the conflict or the red gate. */
  targetCatchUp?: TargetCatchUpHandover | null;
}

/** What an Airlock agent is sent in for: the conflict of the merge-in, the re-review of its resolution, or the red gate on the merged tree. */
export interface AirlockFacts {
  /** `before-human-code-review` for a conflict re-reviewer under a build or review job in `merging-main`, outside any Airlock. */
  mergePlacement:      'airlock' | 'before-human-code-review';
  worktree:            string;
  branchTip:           string;
  targetTip:           string;
  phase:               AirlockAgentPhase;
  conflictedFiles:     readonly string[];
  /** The newest red gate on the merged tree; `null` before one. */
  redHandoff:          RedHandoffFacts | null;
  /** `false` for a fresh agent in place of a ticket agent whose session could not be resumed. */
  resumesSession:      boolean;
  /** A package's builder resolving its part of a crossing ticket's conflict: it leaves the merge open for the worker after it (E64). */
  leavesTheMergeOpen?: true;
}

export interface DrivePassRequest {
  platformPorts:                 PlatformPorts;
  workspace:                     Workspace;
  /** The pass changes the board only through its transactions and reads it only through its read side. */
  boardStore:                    BoardStore;
  now:                           () => Date;
  formatStamp:                   (moment: Date) => string;
  hephaestusDirectory:           string;
  generation:                    number;
  boardChildren:                 BoardChildren;
  /** Runs Hephaestus's own gate lines (merged-tree gates, gate profiles, pipeline checks) as line children of the board's Talos. */
  lineRunner:                    LineRunner;
  /** Called as each pass begins: Hephaestus starts or attaches to a Talos there once its connection to the last one closed. */
  ensureTalosIfLost?:            () => Promise<void>;
  /** The board-wide files Hephaestus could not read, which the board header warns of until it restarts. */
  unreadableBoardFiles:          UnreadableBoardFiles;
  /** The runtime, isolating arguments and entry script this Hephaestus was started with, which a job's network guard hook runs. */
  programCommand:                readonly string[];
  codeVersion:                   string;
  agentAdapter:                  AgentAdapter;
  /** The machine's monitor folder: `<home>/<monitor folder>`. */
  monitorFolder:                 string;
  /** Narrowed to the launch allowlist before any session sees it. */
  inheritedEnvironment:          Readonly<Record<string, string | undefined>>;
  mainLine:                      string;
  /** Read from the board when Hephaestus starts; the namespace changes only while no Hephaestus runs. */
  branchNames:                   BranchNames;
  installVersionChanged:         () => boolean;
  /** Resolves once the install versions a pass reads are known, such as after a landing; the event loop runs while it waits. */
  installVersionsKnown?:         () => Promise<void>;
  /** Whether Hephaestus's environment holds the variable, such as the key a billing's way needs before any session starts. */
  agentVariableIsSet:            (variableName: string) => boolean;
  /** Code on disk differs from the code in memory while the install version does not: a notice only. */
  newCodeOnDisk?:                () => boolean;
  decisionWordingOf:             (draft: DecisionDraft) => DecisionWording;
  /** The ticket a crossing ticket's package change becomes once User turns it into a need (E19, E22). */
  packageNeedWordingOf:          (facts: PackageNeedFacts) => PackageNeedWording;
  /** The ticket of a dependent that a crossing ticket's package change breaks, once User has it fixed in the group (E26). */
  dependentFixWordingOf:         (facts: DependentFixFacts) => DependentFixWording;
  launchTextOf:                  (job: Readonly<Job>, facts: JobLaunchFacts) => JobLaunchText;
  /** One numbered chat to the Assistant listing the incidents it delivers, their facts and allowed moves. */
  assistantChatTextOf:           (facts: AssistantChatFacts) => string;
  /** Sent to a session that reached its role's call budget. */
  windDownMessage:               string;
  /** The first line of every resumed session. */
  resumeMessage:                 string;
  /** The first line of a session resumed to fix its red handoff, and the opening of a fresh one taking the handoff over. */
  redHandoffMessageOf:           (facts: Readonly<RedHandoffFacts>) => string;
  /** An answer worded as a plain user message, for a resumed session that no longer holds the question's request. */
  answerMessageOf:               (answer: DecisionAnswer) => string;
  /** What the pipeline agent reads when User's check of its setup record ends. */
  setupMessageWordingOf:         (message: SetupMessage) => string;
  homeDirectory:                 string;
  log:                           (line: string) => void;
  /** Where a stale landing lock record the pass took over goes, so the caller words it into its log. */
  onStaleLockTakenOver:          LockTaker['onStaleTakenOver'];
  /** The pass stops acting at once; the caller ends Hephaestus `hephaestus-lock-taken`. */
  onHephaestusLockTakenOver:     (refusal: unknown) => void;
  /** A pass threw what no abandoned pass names: the caller runs the crash path and ends Hephaestus `crashed`; no pass runs after it. */
  onPassCrashed:                 (thrown: unknown) => Promise<void>;
  /** Called for each job's Hatch folder as the launch makes it, so a relayed request wakes a pass where no recursive watch sees the folder. */
  watchHatchFolder?:             (hatchDirectory: string) => void;
  /** Called for the Hatch folder of each job the pass saw launched, once the job is gone from the board. */
  unwatchHatchFolder?:           (hatchDirectory: string) => void;
  /** Overridden by specs, which refuse to make an Airlock agent worktree's denied root. */
  folderMaker?:                  FolderMaker;
  /** Called inside the hold after each of its three phases, on the Board being changed; the step a spec reads the order at. */
  afterHoldPhase?:               (phase: 'relayed-commands' | 'child-events' | 'lifecycle', board: Board) => void;
  /** After each pass that ran to its end or was abandoned, outside the hold: Hephaestus publishes its state to the event stream there. */
  afterPass?:                    () => void;
  processStarts?:                ProcessStarts;
  /** Overridden by specs, which cannot wait out the production retry of a merge gate looking for a free gate slot. */
  gateSlotRetryMilliseconds?:    number;
  /** The CPU count the machine agent limit is capped at; the runtime's when not given. */
  machineAgentCeiling?:          number;
  /** Overridden by specs, which cannot wait out the production grace a stopped session gets to end by itself. */
  sessionStopGraceMilliseconds?: number;
  /** The program a job's session starts, or why it is not launched; absent reads the forge's agent through the machine's config. */
  agentProgramOf?:               (board: Board, job: Readonly<Job>) => AgentProgramResolution;
  /** The program a launch starts when the forge names no agent: the fake agent's runtime in a scratch forge; absent in production. */
  agentProgramWhenNoneIsChosen?: string;
  /** What kind of start the start gate judged this serving period's; the reconcile at start reads it. */
  startClassification?:          StartClassificationVerdict;
}

/** Derived each pass from the board, git and Hephaestus's state, never stored. */
export type HephaestusNotice =
  | { kind: 'install-version-changed' }
  | { kind: 'new-code' }
  | { kind: 'attribution-found'; ticketId: string }
  // The ticket's newest review reworked past the threshold and was refused another round: User decides whether an invariant ticket is wanted.
  | { kind: 'rounds-not-converging'; ticketId: string }
  // A landing found the main checkout off the main line or dirty: that target's landings wait, builds and reviews launch on.
  | { kind: 'dirty-main-checkout'; target: string; branch: string | null; blockingFiles: readonly string[] }
  // A landing's fast-forward found a file of the target's checkout held open by another process, on every try: that target's landings wait.
  | { kind: 'target-file-held'; target: string; heldFiles: readonly string[] }
  // An incident took its default since Hephaestus started: shown as a warning.
  | { kind: 'incident-defaulted'; incidentId: string; move: IncidentMove; cause: IncidentDefaultCause }
  // Git declined a removal after a refresh or a release; shown while what it would have removed stands.
  | { kind: 'cleanup-declined'; cleanup: DeclinedCleanup['cleanup']; groupBranch: string; reason: string }
  // A job's launch was refused, nothing spawned, because an instruction file its pipeline names is missing; retried each pass.
  | { kind: 'instructions-missing'; jobId: string; path: string }
  // A job stands not launched, nothing spawned, because its agent's program does not run; read each pass from the job's stored fact.
  | { kind: 'agent-program-refused'; jobId: string; cause: JobNotLaunchedCause; reason: string; repair: string | null }
  // Passes in a row abandoned on one of the tracker lock's expected conditions; the forge keeps running and tries at each wake-up.
  | { kind: 'passes-abandoned'; inARow: number; reason: AbandonedPass['reason'] };

type AbandonedPass = Extract<PassThrowReading, { verdict: 'abandoned' }>;

/** What a pass knows of the runtime state; Hephaestus adds `restarting` around a restart. */
export type PassRuntimeState = 'serving' | 'held-by-install-change';

export interface HephaestusStateDocument {
  generation:                   number;
  passes:                       number;
  runtimeState:                 PassRuntimeState;
  notices:                      HephaestusNotice[];
  /** The tickets the last pass would have launched but for the machine-wide agent limit. */
  ticketsWaitingForMachineSlot: number;
}

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

interface ChildObservation {
  jobId:              string;
  instance:           number;
  liveness:           ChildLiveness;
  events:             readonly EventLogEntry[];
  /** Read after the events, so an ending Talos recognised in a line just read is never missed. */
  recognisedEndings:  readonly RecognisedEnding[];
  /** Settled for a lost child only, after its surviving process group was killed; `null` while the forced stop is refused. */
  lostCause:          InterruptionCause | null;
  forcedStopRefusals: ForcedStopRefusals;
  /** Read for a resumed instance whose child record holds its end; `true` otherwise. */
  sessionStarted:     boolean;
}

interface Observation {
  childObservations:            readonly ChildObservation[];
  pendingRequests:              readonly PendingHatchRequest[];
  targetTips:                   Readonly<Record<string, string | null>>;
  buildJobs:                    readonly BuildJobObservation[];
  ticketIdsTouchingAgentConfig: readonly string[];
  answeredWaiverTrees:          ReadonlyMap<string, string | null>;
  usageMarker:                  UsageMarkerReading;
  assistantReadings:            readonly AssistantReading[];
  documentAgentReadings:        readonly DocumentAgentReading[];
  fingerprint:                  string;
  trackerId:                    string;
}

/** Under the monitor folder, so every Hephaestus of the machine shares the gate run slots. */
const GATE_SLOTS_FOLDER = 'gate-slots';

const MERGE_GATE_PROFILES_FOLDER = 'merge-gate-profiles';

/** The sandbox profiles of the gate profiles' lines, in the hephaestus folder: these confine a profile's run, never record one. */
const GATE_PROFILE_SANDBOXES_FOLDER = 'gate-profile-sandboxes';

/** The sandbox profiles of the pipeline checks' lines, in the hephaestus folder, one per setup record. */
const PIPELINE_CHECK_SANDBOXES_FOLDER = 'pipeline-check-sandboxes';

/** The `step` a refused worker launch names in its `sandbox-unavailable` incident. */
const WORKER_LAUNCH_STEP = 'worker';

/** The cause a job is interrupted with when Talos recognised its agent's ending, by the ending's name. */
const INTERRUPTION_CAUSE_OF_AGENT_ENDING: Readonly<Record<AgentEndingName, InterruptionCause>> = { 'network-outage': 'network-outage', };

/** How Talos ended a child that did not end by itself, and the cause its job is interrupted with. */
const INTERRUPTION_CAUSE_OF_TALOS_END: Readonly<Partial<Record<ChildEnd['reason'], InterruptionCause>>> = {
  'paused':      'talos-paused',
  'lease-ended': 'lease-ended',
};

const ROLES_THAT_MAY_ASK: ReadonlySet<string> = new Set(['builder', 'reviewer', 're-reviewer', 'conflict-re-reviewer', 'product-owner']);

/** Multi-turn sessions: finished only when Hephaestus closed their input, never by a turn's `result`. */
const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner', 'pipeline-agent', 'document-agent'];

/** The jobs whose session owes a closing report: one that exits cleanly without it ends `failed`, cause `no-report`. */
const REPORTING_JOB_KINDS: readonly JobKind[] = ['build', 'review'];

const REPORT_SCHEMA_OF_JOB_KIND: Partial<Record<JobKind, JsonSchema>> = {
  'effect-reading': EFFECT_READING_REPORT_SCHEMA,
  'build':          BUILDER_REPORT_SCHEMA,
  'review':         REVIEWER_REPORT_SCHEMA,
  'merge-agent':    AIRLOCK_AGENT_REPORT_SCHEMA,
};

/**
 * The Airlock phase an agent is launched or resumed in, read from its merge job's slot. Under a build or review job in `merging-main`, the
 * agent is the conflict re-reviewer of the merge before User's code review.
 */
function airlockAgentPhaseOf(board: Board, job: Readonly<Job>): AirlockAgentPhase {
  const parent = board.jobs().find((candidate) => candidate.id === job.parentJobId);
  if (parent?.state === 'merging-main') return 're-reviewing';
  const phase = parent?.airlock?.phase;
  return phase === 'fixing' || phase === 're-reviewing' ? phase : 'resolving';
}

/**
 * A conflict re-reviewer reports as a reviewer while it re-reviews; resumed for a red merged tree, it reports as any Airlock agent. A package
 * stage's report also states what the package exposes (E40): the package builder states it, the package reviewer confirms it. An
 * adapt build's report may send the ticket back to a sealed package (E41).
 */
function reportSchemaOf(board: Board, job: Readonly<Job>): JsonSchema | null {
  if (job.kind === 'merge-agent' && airlockAgentPhaseOf(board, job) === 're-reviewing') return REVIEWER_REPORT_SCHEMA;
  const stageName = TicketStageUtil.stageOfJob(job)?.name;
  if (job.kind === 'build' && stageName === 'package-build') return PACKAGE_BUILDER_REPORT_SCHEMA;
  if (job.kind === 'review' && stageName === 'package-review') return PACKAGE_REVIEWER_REPORT_SCHEMA;
  if (job.kind === 'build' && stageName === 'adapt') return ADAPT_BUILDER_REPORT_SCHEMA;
  return REPORT_SCHEMA_OF_JOB_KIND[job.kind] ?? null;
}

function targetTipOf(repositoryRoot: string, target: string): string | null {
  return GitProcess.resolvedCommitOf(repositoryRoot, target);
}

/** Identity, never time: the store's revision, the pending requests, the unread events, the target tips and each child's verdict. */
function fingerprintOf(
  boardRevision: string,
  childObservations: readonly ChildObservation[],
  pending: readonly PendingHatchRequest[],
  tips: Readonly<Record<string, string | null>>,
  buildJobs: readonly BuildJobObservation[],
  usageMarker: UsageMarkerReading,
  ticketIdsTouchingAgentConfig: readonly string[],
): string {
  const digest = createHash('sha256');
  digest.update(`agent-config ${ticketIdsTouchingAgentConfig.join(',')}\n`);
  digest.update(`revision ${boardRevision}\n`);
  digest.update(`usage ${JSON.stringify(usageMarker)}\n`);
  for (const request of pending) digest.update(`request ${request.jobId} ${request.requestId}\n`);
  for (const buildJob of buildJobs) {
    const gateStep = buildJob.gate.verdict === 'running' ? buildJob.gate.stepIndex : '';
    digest.update(`build ${buildJob.jobId} ${buildJob.setup} ${buildJob.calls} ${buildJob.gate.verdict} ${gateStep}\n`);
  }
  for (const childObservation of childObservations) {
    const lastSequence = childObservation.events.at(-1)?.sequence ?? 0;
    digest.update(`child ${childObservation.jobId} ${childObservation.instance} ${childObservation.liveness.verdict} ${lastSequence}\n`);
  }
  for (const [target, tip] of Object.entries(tips)) digest.update(`tip ${target} ${tip ?? '-'}\n`);
  return digest.digest('hex');
}

/** A refused forced stop is tried again only for the jobs in `forcedStopRetryJobIds`, so a pass's own writes never retry it. */
function observe(request: DrivePassRequest, jobLaunchContext: JobLaunchContext, forcedStopRetryJobIds: ReadonlySet<string> = new Set()): Observation {
  const { workspace, boardStore } = request;
  const progress      = boardStore.reads.requireProgress();
  const jobs          = progress.jobs ?? [];
  // Events before Hatch folders: a request a session wrote before its turn's `result` is seen in the same pass as that result.
  const children      = request.boardChildren;
  children.beginPass();
  const childObservations = jobs.map((job): ChildObservation => {
    const jobFolder     = children.jobFolderOf(job.id);
    const afterSequence = job.eventCursor.instance === job.childInstance ? job.eventCursor.sequence : 0;
    // Liveness first, so an ended child's log is read whole; the endings last, so they cover every line just read.
    const liveness          = children.livenessOf(jobFolder, job.childInstance);
    const events            = children.eventsAfter(jobFolder, job.childInstance, afterSequence);
    const recognisedEndings = children.recognisedEndingsOf(jobFolder, job.childInstance);
    if (events === 'malformed') request.log(`The event log of job ${job.id}, child instance ${job.childInstance}, is malformed; its events wait.`);
    const lostCause = liveness.verdict === 'lost' && job.role !== null
      ? Regrouping.settleLostChildIn(
        workspace.trackerDirectory, request.platformPorts, request.unreadableBoardFiles, request.log, jobFolder, job.childInstance, forcedStopRetryJobIds.has(job.id),
      )
      : null;
    return {
      jobId:              job.id,
      instance:           job.childInstance,
      liveness,
      events:             events === 'malformed' ? [] : events,
      recognisedEndings,
      lostCause,
      forcedStopRefusals: RefusedForcedStops.storedOf(workspace.trackerDirectory, jobFolder, job.childInstance, request.unreadableBoardFiles),
      sessionStarted:     liveness.verdict !== 'ended' || JobResumption.instanceSessionStarted(children, jobFolder, job.childInstance, request.agentAdapter),
    };
  });
  // Also before Hatch folders: a `result` closing an Assistant's turn must not be seen before the move it queued ahead of it.
  const assistantReadings = AssistantSession.readingsOf(children, request.agentAdapter, { jobs: () => jobs });
  const documentAgentReadings = DocumentAgentSessions.readingsOf(children, request.agentAdapter, jobs);
  const pendingRequests = HatchInbox.pendingRequestsOf(workspace.rootDirectory, jobs);
  const location        = projectLocationOf(workspace.rootDirectory);
  const targets         = [...new Set([request.mainLine, ...jobs.flatMap((job) => (job.target === null ? [] : [job.target]))])].sort();
  const targetTips      = Object.fromEntries(targets.map((target) => [target, targetTipOf(location.repositoryRoot, target)]));
  const pipelineReading = boardStore.reads.readPipeline();
  const pipeline        = pipelineReading.verdict === 'readable' ? pipelineReading.pipeline : null;
  const buildJobs = JobLaunch.observeBuildJobs(jobLaunchContext, jobs, pipeline);
  const answeredWaiverTrees = JobLaunch.answeredWaiverTreesOf(jobLaunchContext, jobs, progress.decisions ?? []);
  const ticketIdsTouchingAgentConfig = JobLaunch.ticketIdsTouchingAgentConfigOf(jobLaunchContext, jobs, pipeline);
  const usageMarker = UsageMarkerFile.read(request.monitorFolder);
  if (usageMarker.verdict === 'malformed') {
    request.log(`The usage marker ${UsageMarkerFile.pathIn(request.monitorFolder)} is malformed (${usageMarker.reason}); no limit is held by it.`);
  }
  return {
    childObservations,
    pendingRequests,
    targetTips,
    buildJobs,
    ticketIdsTouchingAgentConfig,
    answeredWaiverTrees,
    usageMarker,
    assistantReadings,
    documentAgentReadings,
    fingerprint: fingerprintOf(boardStore.reads.revision(), childObservations, pendingRequests, targetTips, buildJobs, usageMarker, ticketIdsTouchingAgentConfig),
    trackerId:   progress.trackerId,
  };
}

function lostChildCauseOf(childObservation: ChildObservation): InterruptionCause {
  if (childObservation.lostCause !== null) return childObservation.lostCause;
  return childObservation.forcedStopRefusals.refusals > 0 ? FORCED_STOP_REFUSED_INTERRUPTION : 'talos-lost';
}

interface AppliedChildEvents {
  usageLimitHits:           UsageLimitHit[];
  /** Every usage window the streams reported, in stream order, which the pass records after the hold. */
  usageWindowObservations:  UsageWindowObservation[];
  /** Sessions a refused key or a budget stop ended the work of, which the pass stops after the hold. */
  stoppedSessions:          StoppedSession[];
  /** The pipeline agents whose turn ended in a `result`, whose snapshot Customs checks in the same hold. */
  pipelineAgentTurnEnds:    string[];
  /**
   * The document agents whose turn ended, in a `result`, with their session, or cut short by an interruption, whose snapshot Customs checks
   * before their requests apply, so no request outlives the turn that wrote it.
   */
  documentAgentTurnEnds:    string[];
  /** The stopping document agents whose session ended: each waits or closes only once its turn end's requests were settled. */
  documentAgentSessionEnds: string[];
  /** Each effect reader's `result`, with the report it carried. */
  effectReadingResults:     { jobId: string; report: unknown }[];
  /** The effect readers whose session ended with no `result`. */
  effectReadingEnds:        string[];
}

/** What the child events are read under: the pipeline's API billing, `null` for a subscription, and the decision wording. */
interface ChildEventFacts {
  apiBilling:        ApiBilling | null;
  decisionWordingOf: DrivePassRequest['decisionWordingOf'];
}

/** The cause of the ending Talos recognised in the line at `sequence`; `null` for any other line or an ending this code does not name. */
function recognisedEndingCauseAt(childObservation: ChildObservation, sequence: number): InterruptionCause | null {
  const ending = childObservation.recognisedEndings.find((recognised) => recognised.closingLineSequence === sequence);
  if (ending === undefined || !Object.hasOwn(INTERRUPTION_CAUSE_OF_AGENT_ENDING, ending.name)) return null;
  return INTERRUPTION_CAUSE_OF_AGENT_ENDING[ending.name as AgentEndingName];
}

/**
 * A question opens its decision and a closing result moves the job to verification in the hold that reads them; the cursor moves with them.
 * A top-level usage refusal interrupts the job instead, and the error result after it is no closing result; under API billing so do a 429
 * result, a refused key and a budget stop. A result Talos recognised as an ending interrupts the job with its cause and stops its session.
 */
function applyChildEvents(
  change: BoardTransaction,
  adapter: AgentAdapter,
  childObservations: readonly ChildObservation[],
  children: BoardChildren,
  trackerDirectory: string,
  facts: ChildEventFacts,
): AppliedChildEvents {
  const { board, at } = change;
  const { apiBilling } = facts;
  const usageLimitHits: UsageLimitHit[] = [];
  const usageWindowObservations: UsageWindowObservation[] = [];
  const stoppedSessions: StoppedSession[] = [];
  const pipelineAgentTurnEnds: string[] = [];
  const documentAgentTurnEnds: string[] = [];
  const documentAgentSessionEnds: string[] = [];
  const effectReadingResults: { jobId: string; report: unknown }[] = [];
  const effectReadingEnds: string[] = [];
  for (const childObservation of childObservations) {
    if (board.jobById(childObservation.jobId)?.childInstance !== childObservation.instance) continue;
    const stateBefore = board.jobById(childObservation.jobId)?.state;
    let closedWithResult = false;
    for (const entry of childObservation.events) {
      if (entry.origin !== 'agent') continue;
      for (const event of adapter.eventsOf(entry.line)) {
        const state = board.jobById(childObservation.jobId)?.state;
        const windowObservation = UsageLimits.windowObservationOf(event, apiBilling !== null);
        if (windowObservation !== null) usageWindowObservations.push(windowObservation);
        const refusal = UsageLimits.refusalOf(event, at, apiBilling !== null);
        if (refusal !== null && state === 'running') {
          const hit = { jobId: childObservation.jobId, ...refusal };
          UsageLimits.interruptLimitedJob(board, hit, at);
          usageLimitHits.push(hit);
          continue;
        }
        const endingCause = event.kind === 'result' && state === 'running' ? recognisedEndingCauseAt(childObservation, entry.sequence) : null;
        if (endingCause !== null) {
          board.interruptJob(childObservation.jobId, endingCause, at);
          stoppedSessions.push({ jobId: childObservation.jobId, childInstance: childObservation.instance });
          continue;
        }
        const failure = event.kind === 'result' ? event.failure : null;
        const stopped = apiBilling === null || failure === null
          ? null
          : ApiBillingStops.applyResultFailure(board, childObservation.jobId, apiBilling, failure, facts.decisionWordingOf, at);
        if (stopped !== null) {
          stoppedSessions.push(stopped);
          closedWithResult = true;
          continue;
        }
        if (event.kind === 'started' && (state === 'launching' || state === 'preparing')) board.moveJob(childObservation.jobId, 'running', at);
        if (event.kind === 'question' && state === 'running') QuestionRouting.openQuestion(board, childObservation.jobId, event.requestId, event.questions, at);
        // A session's turn ends in a `result` too; it finishes only once Hephaestus closed its input.
        const kind = board.jobById(childObservation.jobId)?.kind ?? 'build';
        if (event.kind === 'result' && state === 'running' && kind === 'pipeline-agent') pipelineAgentTurnEnds.push(childObservation.jobId);
        if (event.kind === 'result' && state !== undefined && kind === 'document-agent') documentAgentTurnEnds.push(childObservation.jobId);
        if (event.kind === 'result' && state === 'running' && kind === 'effect-reading') {
          effectReadingResults.push({ jobId: childObservation.jobId, report: event.structuredReport });
          closedWithResult = true;
          continue;
        }
        if (event.kind === 'result' && state === 'running' && !SESSION_JOB_KINDS.includes(kind)) {
          board.moveJob(childObservation.jobId, 'in-customs', at);
          closedWithResult = true;
        }
      }
    }
    const lastEvent = childObservation.events.at(-1);
    // A budget stop ends its job in this loop, which then holds no cursor.
    if (lastEvent !== undefined && board.jobById(childObservation.jobId) !== undefined) {
      board.setJobEventCursor(childObservation.jobId, { instance: childObservation.instance, sequence: lastEvent.sequence });
    }
    const job = board.jobById(childObservation.jobId);
    const state = job?.state;
    const childIsGone = childObservation.liveness.verdict === 'ended' || childObservation.liveness.verdict === 'lost';
    const sessionExitedByItself = childObservation.liveness.verdict === 'ended' && childObservation.liveness.end.reason === 'exited';
    const sessionEndedCleanly   = sessionExitedByItself && childObservation.liveness.verdict === 'ended' && childObservation.liveness.end.exitCode === 0;
    const sessionOwner = job !== undefined && state === 'running'
      ? JobResumption.launchSessionOwnerJobIdOf(children, trackerDirectory, board.logRecordsSoFar(), job, adapter)
      : null;
    if (sessionOwner?.verdict === 'unreadable') UnreadableJobFileIncident.openOnce(board, sessionOwner.unreadableFile, at);
    if (job !== undefined && sessionOwner?.verdict === 'answered' && JobResumption.resumeFailed(
      job,
      sessionOwner.sessionOwnerJobId,
      sessionExitedByItself,
      childObservation.sessionStarted,
    )) {
      JobResumption.applyResumeFailure(board, job, at);
    } else if (childIsGone && !closedWithResult && job?.kind === 'effect-reading') {
      effectReadingEnds.push(job.id);
    } else if (childIsGone && state === 'stopping' && job !== undefined && DocumentAgentSessions.isDocumentAgentJob(job)) {
      // Its turn ended with its session, stopped by User or closed while idle: it waits for its next message with no session.
      documentAgentTurnEnds.push(job.id);
      documentAgentSessionEnds.push(job.id);
    } else if (childIsGone && state === 'stopping' && job !== undefined && SESSION_JOB_KINDS.includes(job.kind) && !IntakeSessions.isIntakeJob(job)) {
      // An Assistant or pipeline agent ends `closed`, so User's next message opens a pipeline agent again with its conversation.
      board.endJob(childObservation.jobId, { outcome: 'closed' }, at);
    } else if (childIsGone && !closedWithResult && state === 'running' && job !== undefined && AnswerDelivery.stoppedForAnswerDelivery(children, job)) {
      board.interruptJob(childObservation.jobId, 'answer-delivery', at);
    } else if (sessionEndedCleanly && !closedWithResult && state === 'running' && job !== undefined && REPORTING_JOB_KINDS.includes(job.kind)) {
      board.endJob(childObservation.jobId, { outcome: 'failed', cause: BUILD_JOB_CAUSES.noReport }, at);
    } else if (childIsGone && !closedWithResult && (state === 'running' || state === 'waiting-for-answer')) {
      // A clean quit or a lease end is Talos's own stop, never a crash the Playbook counts.
      const talosEndCause = childObservation.liveness.verdict === 'ended' ? INTERRUPTION_CAUSE_OF_TALOS_END[childObservation.liveness.end.reason] ?? null : null;
      board.interruptJob(childObservation.jobId, childObservation.liveness.verdict === 'lost' ? lostChildCauseOf(childObservation) : talosEndCause ?? 'agent-crashed', at);
    }
    const interrupted = board.jobById(childObservation.jobId);
    if (interrupted !== undefined && stateBefore !== 'interrupted' && interrupted.state === 'interrupted' && DocumentAgentSessions.isDocumentAgentJob(interrupted)) {
      documentAgentTurnEnds.push(interrupted.id);
    }
  }
  return {
    usageLimitHits, usageWindowObservations, stoppedSessions, pipelineAgentTurnEnds, documentAgentTurnEnds, documentAgentSessionEnds, effectReadingResults, effectReadingEnds
  };
}

/** One decision per folder, its context the folder itself, so a restart finding the same folder opens no second one. */
function openLeftoverWorktreeDecisions(change: BoardTransaction, decisionWordingOf: DrivePassRequest['decisionWordingOf'], folders: readonly string[]): void {
  const draft = { kind: 'leftover-worktree', ticketIds: [], jobId: null } as const;
  for (const folder of folders) {
    if (change.board.decisions().some((decision) => decision.kind === draft.kind && decision.context === folder)) continue;
    change.board.openDecision({
      ...draft, askedBy: 'hephaestus', requestId: null, questions: decisionWordingOf(draft).questions, context: folder
    }, change.at);
  }
}

/** One decision while any is open, however many jobs wait on the key. */
function openApiKeyDecisionOnce(board: Board, decisionWordingOf: DrivePassRequest['decisionWordingOf'], at: string): void {
  if (board.decisions().some((decision) => decision.kind === API_KEY_DECISION_DRAFT.kind)) return;
  board.openDecision({
    ...API_KEY_DECISION_DRAFT, askedBy: 'hephaestus', requestId: null, ...decisionWordingOf(API_KEY_DECISION_DRAFT)
  }, at);
}

function openApiKeyDecisionIdsOf(board: Board): string[] {
  return board.decisions().filter((decision) => decision.kind === API_KEY_DECISION_DRAFT.kind).map((decision) => decision.id);
}

/** The stored pipeline's billing, or the open setup record's, which bills its pipeline agent before any pipeline is stored, needs a key not set. */
function aBillingMissesItsKey(request: DrivePassRequest, board: Board): boolean {
  const billings = [board.pipeline()?.billing, board.pipelineSetup()?.billing ?? undefined];
  return billings.some((billing) => AgentBillingUtil.launchReadinessOf(request.agentAdapter.billingOptions, billing, request.agentVariableIsSet).verdict === 'key-missing');
}

/** The key is set, or the billing no longer needs one: the open decision asks User for nothing. */
function withdrawApiKeyDecisions(board: Board, at: string): void {
  for (const decisionId of openApiKeyDecisionIdsOf(board)) board.withdrawDecision(decisionId, API_KEY_DECISION_WITHDRAWN_REASON, at);
}

/**
 * Acts on each answered waiver the Playbook named, with the tree read outside the lock. An answer that came after the observation has no
 * tree yet, so it waits for the next pass. Proposals that cannot be read open their incident on the review job, which takes no step while
 * it stands. Answers whether another pass is due: the one that launches what the answer freed, or acts on it.
 */
export function actOnWaiverAnswers(
  change: BoardTransaction, steps: readonly PlaybookStep[], answeredWaiverTrees: ReadonlyMap<string, string | null>, trackerDirectory: string
): boolean {
  const { board, at } = change;
  const waiverAnswerSteps = steps.flatMap((step) => (step.kind === 'act-on-waiver-answer' && !UnreadableJobFileIncident.standsOpenFor(board, step.jobId) ? [step] : []));
  for (const step of waiverAnswerSteps) {
    if (!answeredWaiverTrees.has(step.jobId)) continue;
    const headTree = answeredWaiverTrees.get(step.jobId) ?? null;
    const outcome = ReviewOutcome.actOnWaiverAnswer(board, step.jobId, step.answers, jobFolderIn(trackerDirectory, step.jobId), headTree, at);
    if (outcome.verdict === 'proposals-unreadable') {
      StoredFileUnreadable.openIncidentOn(board, step.jobId, StoredFileUnreadable.unreadableFileOf(trackerDirectory, outcome.proposalsPath, outcome.reason), at);
    }
  }
  return waiverAnswerSteps.some((step) => !UnreadableJobFileIncident.standsOpenFor(board, step.jobId));
}

function profileOf(context: JobLaunchContext, job: Readonly<Job>, place: SessionPlace, hatchDirectory: string): WorkerProfile {
  const {
    workspace, monitorFolder, agentAdapter, homeDirectory
  } = context;
  const location = projectLocationOf(workspace.rootDirectory);
  const nestedCheckoutFacts = { repositoryRoot: location.repositoryRoot, worktree: place.checkout, projectPrefix: location.projectPrefix };
  const sessionDenyFacts = {
    dataFolder:       workspace.trackerDirectory,
    monitorFolder,
    credentialPaths:  agentAdapter.credentialPathsOf(homeDirectory),
    gpgHomeDirectory: GpgDirectories.homeDirectoryOf(GpgDirectories.read(homeDirectory), homeDirectory),
    sandboxDenyShape: agentAdapter.sandboxDenyShape,
  };
  return {
    writableRoots:          [place.checkout],
    deniedWritableRoots:    [workspace.trackerDirectory],
    deniedReadableRoots:    WorkerProfiles.sessionDeniedReadableRootsOf(sessionDenyFacts),
    shellNetworkDomains:    [],
    webNetworkDomains:      'none',
    extraWritableDirectory: hatchDirectory,
    allowedCommandPrefixes: [],
    deniedCommandPrefixes:  [],
    askUser:                job.role !== null && ROLES_THAT_MAY_ASK.has(job.role),
    skills:                 false,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       location.repositoryRoot,
    ...place.holdsRepository ? WorkerProfiles.nestedCheckoutProfileOf(nestedCheckoutFacts) : {},
    gitHooksDirectory:      join(location.repositoryRoot, '.githooks'),
    commitSigning:          { kind: 'unsigned' },
    networkDomainGuard:     null,
  };
}

/** A first Apply's constitution commit runs before any pipeline is stored: its request waits, or its job holds the main line's slot. */
function constitutionCommitIsDue(board: Board): boolean {
  const state = board.pipelineSetup()?.applyRequest?.state;
  return state === 'committing' || state === 'held' || board.jobs().some((job) => job.kind === 'constitution-commit');
}

function repositorySignsCommits(repositoryRoot: string): boolean {
  const run = GitProcess.run(repositoryRoot, ['config', '--bool', 'commit.gpgsign']);
  return run !== null && GitProcess.succeeded(run) && run.standardOutput.trim() === 'true';
}

/**
 * A builder or reviewer runs confined by the per-job profile of design section 4.4, in the Airlock's worktree too when it is resumed there;
 * a product owner and a pipeline agent get their own profile, and every other role the session profile.
 */
function launchProfileOf(jobLaunchContext: JobLaunchContext, board: Board, job: Readonly<Job>, place: SessionPlace, hatchDirectory: string): WorkerProfile {
  if (IntakeSessions.isIntakeJob(job)) return IntakeSessions.productOwnerProfileOf(profileOf(jobLaunchContext, job, place, hatchDirectory));
  if (PipelineAgentSessions.isPipelineAgentJob(job)) {
    return PipelineAgentSessions.pipelineAgentProfileOf(profileOf(jobLaunchContext, job, place, hatchDirectory), hatchDirectory);
  }
  if (DocumentAgentSessions.isDocumentAgentJob(job)) {
    return DocumentAgentSessions.documentAgentProfileOf(profileOf(jobLaunchContext, job, place, hatchDirectory), hatchDirectory);
  }
  if (job.kind === 'effect-reading') {
    const { repositoryRoot } = projectLocationOf(jobLaunchContext.workspace.rootDirectory);
    const sessionProfile = profileOf(jobLaunchContext, job, place, hatchDirectory);
    return EffectReadings.effectReaderProfileOf(sessionProfile, repositoryRoot, jobLaunchContext.workspace.trackerDirectory, place.workingDirectory);
  }
  const isAirlockAgent = job.kind === 'merge-agent';
  if (!isAirlockAgent && !JobLaunch.isWorktreeJob(job)) return profileOf(jobLaunchContext, job, place, hatchDirectory);
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === job.ticketIds[0]);
  const pipeline = board.pipeline();
  const toolchain = WorkerProfiles.workerToolchainOf(pipeline, ticket?.frontmatter.network ?? [], jobLaunchContext.platformPorts.shellLine, job.entity);
  const refusedPackages = pipeline?.entities === undefined ? [] : CrossingStages.refusedPackagesOf(board.logRecordsSoFar(), job.ticketIds[0] ?? '');
  const sandboxFacts = JobLaunch.sandboxFactsFor(jobLaunchContext, job, pipeline, isAirlockAgent ? place.checkout : undefined, refusedPackages);
  const profile = WorkerProfiles.profileOf(WorkerProfiles.workerRoleOf(job.role), sandboxFacts, toolchain);
  // In the Airlock the agent cannot ask User: the slot stays held while it works.
  return isAirlockAgent ? { ...profile, askUser: false } : profile;
}

/**
/**
 * `null` for a job that is no Airlock agent; `conflicts-unknown` when neither the kept facts nor git tell which files conflict; a file of
 * the merge job the agent is told of that cannot be read stops the launch, and its incident opens on the merge job that owns it.
 */
export function airlockFactsOf(
  board: Board, trackerDirectory: string, job: Readonly<Job>, checkout: string
): AirlockFacts | null | 'conflicts-unknown' | UnreadableJobFileRefusal {
  if (job.kind !== 'merge-agent' || job.parentJobId === null) return null;
  const mergeJob       = board.jobs().find((candidate) => candidate.id === job.parentJobId);
  const resumesSession = JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) !== job.id;
  if (mergeJob?.state === 'merging-main') {
    const conflict = JobLaunch.mainMergeConflictOf(trackerDirectory, mergeJob);
    if (StoredFileUnreadable.isUnreadableFile(conflict)) return { unreadableJobFile: StoredFileUnreadable.unreadableJobFileOn(mergeJob.id, conflict) };
    return {
      mergePlacement:  'before-human-code-review',
      worktree:        checkout,
      branchTip:       conflict?.branchTip ?? '',
      targetTip:       conflict?.targetTip ?? '',
      phase:           're-reviewing',
      conflictedFiles: conflict?.conflictedFiles ?? [],
      redHandoff:      null,
      resumesSession,
    };
  }
  const mergeJobFolder = jobFolderIn(trackerDirectory, job.parentJobId);
  const phase          = airlockAgentPhaseOf(board, job);
  const kept           = AirlockFactsFile.keptFactsOf(mergeJobFolder, job.parentJobId);
  if (kept.verdict === 'unreadable') return { unreadableJobFile: kept.unreadableFile };
  const keptFacts      = kept.verdict === 'kept' ? kept.facts : null;
  const conflicts      = AirlockFactsFile.conflictedFilesOf(keptFacts, phase, checkout);
  if (conflicts.verdict === 'unknown') return 'conflicts-unknown';
  const leavesTheMergeOpen = phase === 'resolving' && keptFacts?.leavesTheMergeOpen === true;
  const redHandoff = RedHandoff.redHandoffFactsOf(trackerDirectory, mergeJobFolder);
  if (StoredFileUnreadable.isUnreadableFile(redHandoff)) return { unreadableJobFile: StoredFileUnreadable.unreadableJobFileOn(job.parentJobId, redHandoff) };
  return {
    mergePlacement:  'airlock',
    worktree:        checkout,
    branchTip:       mergeJob?.airlock?.branchTip ?? '',
    targetTip:       mergeJob?.airlock?.targetTip ?? '',
    phase,
    conflictedFiles: conflicts.conflictedFiles,
    redHandoff,
    resumesSession,
    ...(leavesTheMergeOpen ? { leavesTheMergeOpen } : {}),
  };
}

/**
 * What a builder whose session is carried on is told of the review that sent it back: the ticket's newest Review, or for a package build the
 * Review its package review kept in its job folder (E34). `null` for a fresh session, and for `adapt` taking up the home builder's session
 * after the package stages, which gets the adapt message (E43); after a home review that did not hold, `adapt` gets its findings (E51).
 */
function reviewFindingsOf(
  board: Board, trackerDirectory: string, job: Readonly<Job>, crossingStage: CrossingStageFacts | null
): ReviewFindingsFacts | null | StoredFileUnreadable {
  if (job.kind !== 'build' || JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) === job.id) return null;
  const [ticketId] = job.ticketIds;
  if (crossingStage?.stage === 'adapt' && ticketId !== undefined && CrossingStages.followsThePackageStages(board.logRecordsSoFar(), ticketId)) return null;
  const ticketBody = board.tickets().find((ticket) => job.ticketIds.includes(ticket.frontmatter.id))?.body ?? '';
  const reviewSection = crossingStage?.stage === 'package-build' ? crossingStage.packageReviewFindings ?? '' : JobResumption.newestReviewSectionOf(ticketBody);
  const targetCatchUp = JobLaunch.targetCatchUpHandoverOf(trackerDirectory, board.logRecordsSoFar(), job.ticketIds[0] ?? '');
  if (StoredFileUnreadable.isUnreadableFile(targetCatchUp)) return targetCatchUp;
  return {
    reviewSection,
    resume:         Playbook.handoffCycleResumesOf(job, board.logRecordsSoFar()),
    resumesAllowed: LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    targetCatchUp,
  };
}

/** The gates as the display line of this machine's shell grammar; `null` with no pipeline stored. */
function checksLineOf(gates: readonly Readonly<PipelineGate>[] | null, shellLine: Pick<ShellLine, 'displayLineOf'>): string | null {
  return gates === null ? null : shellLine.displayLineOf(gates.map((gate) => ({ line: gate.run, workingDirectory: gate.in ?? null })));
}

type LaunchFactsSource = Pick<DrivePassRequest, 'workspace' | 'platformPorts' | 'branchNames' | 'mainLine' | 'agentAdapter'>;

/** What a job's launch text is filled from, read off the board and the tracker's job folders; a job file it reads that cannot be read stops the launch. */
export function launchFactsOf(
  board: Board, request: LaunchFactsSource, job: Readonly<Job>, launch: { instructions: string; airlock: AirlockFacts | null; place: SessionPlace }
): JobLaunchFacts | StoredFileUnreadable {
  const { trackerDirectory } = request.workspace;
  const { instructions, airlock, place } = launch;
  const pipeline = board.pipeline();
  const jobGates = pipeline === null ? null : JobLaunch.sessionGatesOf(pipeline, job);
  const gates = jobGates === null ? null : SessionPlaces.gatesFromStartOf(place, jobGates);
  const resumesSession = JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) !== job.id;
  const needsSettled = NeedTickets.needsSettledOf(board, job, { mainLine: request.mainLine, resumesSession });
  const crossingStage = CrossingStages.crossingStageFactsOf(board, trackerDirectory, job, resumesSession);
  if (StoredFileUnreadable.isUnreadableFile(crossingStage)) return crossingStage;
  const rootEntityKey = pipeline?.entities === undefined ? ROOT_ENTITY_KEY : EntityOwnershipUtil.rootEntityKeyOf(pipeline.entities);
  const pipelineAgentLaunch = { lineGrammar: request.platformPorts.shellLine.lineGrammar, rootDirectory: request.workspace.rootDirectory, agentAdapter: request.agentAdapter };
  const reviewFindings = needsSettled === null ? reviewFindingsOf(board, trackerDirectory, job, crossingStage) : null;
  if (StoredFileUnreadable.isUnreadableFile(reviewFindings)) return reviewFindings;
  const redHandoff = JobResumption.redHandoffTakenOverOf(trackerDirectory, board.logRecordsSoFar(), job);
  if (StoredFileUnreadable.isUnreadableFile(redHandoff)) return redHandoff;
  return {
    instructions: IntakeSessions.productOwnerInstructionsOf(board, job, instructions),
    confinement:  SessionConfinement.launchConfinementOf(request.agentAdapter.capabilities, request.platformPorts.gateConfinement),
    airlock,
    tickets:      board.tickets()
      .filter((ticket) => job.ticketIds.includes(ticket.frontmatter.id))
      .map((ticket) => {
        const documents = JobLaunch.ticketDocumentReadingsOf(board, job, ticket.frontmatter.id);
        return {
          id:     ticket.frontmatter.id,
          title:  ticket.frontmatter.title,
          body:   ticket.body,
          branch: request.branchNames.ticketBranchOf(ticket.frontmatter.id),
          ...(documents.length === 0 ? {} : { documents }),
        };
      }),
    checksLine:             checksLineOf(gates, request.platformPorts.shellLine),
    gates,
    ...place.projectFolderFromStart === '' ? {} : { projectFolder: place.projectFolderFromStart },
    mergeApprovalIsOn:      board.mergeApprovalIsOn(),
    earlierSessionReplaced: JobResumption.earlierSessionWasReplaced(board.logRecordsSoFar(), job),
    redHandoff,
    reviewFindings,
    needsSettled,
    ...(crossingStage === null ? {} : { crossingStage }),
    ...(rootEntityKey === ROOT_ENTITY_KEY ? {} : { rootEntityKey }),
    intake:                 IntakeSessions.intakeFactsOf(board, job, request.agentAdapter),
    assistant:              AssistantBoot.assistantFactsOf(board, job),
    pipelineAgent:          PipelineAgentSessions.pipelineAgentFactsOf(board, job, pipelineAgentLaunch),
    documentAgent:          DocumentAgentSessions.documentAgentFactsOf(board, job),
  };
}

/**
 * A session forge's confinement refuses opens today's `sandbox-unavailable` incident: a worktree job's through its sandbox refusal, which
 * ends the job, an Airlock agent's through the Airlock's own, tried again each pass; any other job is logged and tried again each pass.
 */
function sessionConfinementRefusalOf(
  request: DrivePassRequest, jobLaunchContext: JobLaunchContext, job: Readonly<Job>, reason: string,
): UnmadeAirlockAgentRoot | SessionConfinementRefused | null {
  if (JobLaunch.isWorktreeJob(job)) {
    JobLaunch.recordSandboxRefusal(jobLaunchContext, job, { step: WORKER_LAUNCH_STEP, reason });
    return null;
  }
  if (job.kind === 'merge-agent') return { jobId: job.id, reason };
  request.log(`The session of job ${job.id} did not launch: ${reason}; the next pass tries again.`);
  return { sessionConfinementRefusedFor: job.id };
}

/** A pipeline or document agent works in its snapshot of the main line, any other session in its ticket's worktree or a folder of its own. */
function sessionPlaceOf(snapshotContext: Parameters<typeof PipelineAgentSessions.prepareSnapshot>[0], board: Board, job: Readonly<Job>): SessionPlace {
  const location = projectLocationOf(snapshotContext.workspace.rootDirectory);
  if (PipelineAgentSessions.isPipelineAgentJob(job)) return SessionPlaces.snapshotSessionPlaceOf(location, PipelineAgentSessions.prepareSnapshot(snapshotContext, board, job));
  if (DocumentAgentSessions.isDocumentAgentJob(job)) return SessionPlaces.snapshotSessionPlaceOf(location, DocumentAgentSessions.prepareSnapshot(snapshotContext, board, job));
  if (job.kind === 'effect-reading') return SessionPlaces.sessionFolderPlaceOf(snapshotContext.workspace, job.id);
  return SessionPlaces.ticketSessionPlaceOf(snapshotContext.workspace, location, job);
}

/** The forge's agent read through this machine's config, kept as the choice names it and checked where it lies. */
function agentProgramResolutionOf(request: DrivePassRequest, board: Board, job: Readonly<Job>): AgentProgramResolution {
  const resolution = chosenProgramResolutionOf(request, board, job);
  return resolution.verdict === 'found' ? billedResolutionOf(request, board, job, resolution.programPath) : resolution;
}

function chosenProgramResolutionOf(request: DrivePassRequest, board: Board, job: Readonly<Job>): AgentProgramResolution {
  if (request.agentProgramOf !== undefined) return request.agentProgramOf(board, job);
  const agent = PipelineAgentSessions.launchAgentOf(board, job);
  if (agent === null && request.agentProgramWhenNoneIsChosen !== undefined) return { verdict: 'found', programPath: request.agentProgramWhenNoneIsChosen };
  // An agent program anywhere in the repository is code a job could have written, whichever project the tracker is.
  const ownRepositoryRoot = projectLocationOf(request.workspace.rootDirectory).repositoryRoot;
  return AgentPrograms.resolutionOf({
    agent,
    adapterVendor:      request.agentAdapter.vendor,
    machineProgramPath: agent === null ? null : MachineConfigFile.programPathOf(MachineConfigFile.read(request.monitorFolder), agent.vendor),
    resolver:           request.platformPorts.executableResolver,
    forbiddenRoots:     AgentPrograms.forbiddenRootsOf(agent, ownRepositoryRoot, registeredRepositoryRootsIn(request.monitorFolder)),
  });
}

/** A program found launches nothing under a billing its vendor does not bill by: that stands as the job's not-launched fact, tried each sweep. */
function billedResolutionOf(request: DrivePassRequest, board: Board, job: Readonly<Job>, programPath: string): AgentProgramResolution {
  const billing = PipelineAgentSessions.launchBillingOf(board, job);
  if (billing.verdict === 'not-chosen') return { verdict: 'found', programPath };
  const readiness = AgentBillingUtil.launchReadinessOf(request.agentAdapter.billingOptions, billing.billing, () => true);
  if (readiness.verdict === 'not-offered') return { verdict: 'not-launched', notLaunched: { cause: 'billing-not-offered', programPath } };
  return { verdict: 'found', programPath };
}

/** Exactly the approved tools' folders, then the program's own, then the system's: nothing else of the inherited search path. */
function agentSearchFoldersOf(request: DrivePassRequest, board: Board, job: Readonly<Job>, programPath: string): string[] {
  const launch = AgentTools.forgeLaunchToolsOf(board.pipeline(), {
    platformPorts: request.platformPorts, homeDirectory: request.homeDirectory, monitorFolder: request.monitorFolder, rootDirectory: request.workspace.rootDirectory
  });
  for (const refused of launch.refusedTools) request.log(`The tool ${refused.name} is left off the search path of job ${job.id}: ${refused.reason}.`);
  return [...AgentTools.toolFoldersOf(launch.tools), dirname(programPath)];
}

/** Logs the refused launch; a file read for the launch is the reading job's, unless its reading names the job it belongs to. */
function unreadableJobFileRefusalOf(
  request: Pick<DrivePassRequest, 'log'>, job: Readonly<Job>, unreadable: UnreadableJobFile | StoredFileUnreadable
): UnreadableJobFileRefusal {
  const unreadableJobFile = StoredFileUnreadable.isUnreadableFile(unreadable) ? StoredFileUnreadable.unreadableJobFileOn(job.id, unreadable) : unreadable;
  request.log(`Job ${job.id} did not launch: its launch reads ${unreadableJobFile.file}, which cannot be read (${unreadableJobFile.reason}).`);
  return { unreadableJobFile };
}

/**
 * Refused, spawning nothing, when an instruction file the pipeline names is missing or the agent program does not resolve: the refusal is the notice.
 * An Airlock agent whose denied root cannot be made answers that root, and one whose conflicted files nothing tells answers so; nothing
 * marks its instance spawned, so the next pass tries it again. A job file the launch needs that cannot be read answers that file.
 */
async function launchAgentChild(
  request: DrivePassRequest,
  jobLaunchContext: JobLaunchContext,
  board: Board,
  trackerId: string,
  job: Readonly<Job>,
  effectReadings: EffectReadings,
): Promise<
  LaunchRefusal | AgentProgramRefused | UnmadeAirlockAgentRoot | ApiBillingKeyMissing | SetupBillingNotChosen | AirlockConflictsUnknown | TalosDidNotLaunch
  | SessionConfinementRefused | UnreadableJobFileRefusal | null
  > {
  const { workspace, agentAdapter } = request;
  const billing = PipelineAgentSessions.launchBillingOf(board, job);
  if (billing.verdict === 'not-chosen') {
    request.log(`The pipeline agent of job ${job.id} did not launch: its setup has no billing yet, and it launches once one is chosen.`);
    return { setupBillingNotChosenFor: job.id };
  }
  const billingReadiness = AgentBillingUtil.launchReadinessOf(agentAdapter.billingOptions, billing.billing, request.agentVariableIsSet);
  if (billingReadiness.verdict === 'key-missing') return { apiBillingKeyMissingFor: job.id };
  const instructions = InstructionFiles.readingFor(workspace.rootDirectory, request.mainLine, board.pipeline(), job, board.pipelineSetup());
  if (instructions.verdict === 'instructions-missing') return { kind: 'instructions-missing', jobId: job.id, path: instructions.path };
  const location = projectLocationOf(workspace.rootDirectory);
  const program = agentProgramResolutionOf(request, board, job);
  if (program.verdict === 'not-launched') return { notLaunchedJobId: job.id, notLaunched: program.notLaunched };
  const children         = request.boardChildren;
  const jobFolder        = children.jobFolderOf(job.id);
  const hatchDirectory   = HatchInbox.hatchDirectoryOf(workspace.rootDirectory, job.id);
  mkdirSync(join(hatchDirectory, 'requests'), { recursive: true });
  request.watchHatchFolder?.(hatchDirectory);
  const snapshotContext = { workspace, worktreesRoot: WorktreesFolder.worktreesRootOf(workspace.rootDirectory), mainLine: request.mainLine };
  const place = sessionPlaceOf(snapshotContext, board, job);
  const entityHomeFacts = WorkerProfiles.entityFactsOf(board.pipeline());
  if (JobLaunch.isWorktreeJob(job) && JobLaunch.deniedRootRefusalRecorded(jobLaunchContext, job, WORKER_LAUNCH_STEP, entityHomeFacts)) return null;
  if (job.kind === 'merge-agent') {
    const unmadeRoot = AirlockSandboxIncident.unmadeRootOf(
      job.id,
      {
        worktree:                      place.checkout,
        sandboxDenyShape:              agentAdapter.sandboxDenyShape,
        agentConfigurationFolderNames: agentAdapter.configurationNames.folderNames,
        projectPrefix:                 location.projectPrefix,
        ...entityHomeFacts,
      },
      request.folderMaker,
    );
    if (unmadeRoot !== null) {
      request.log(`The Airlock agent of job ${job.id} did not launch: ${unmadeRoot.reason}.`);
      return unmadeRoot;
    }
  }
  const airlock = airlockFactsOf(board, workspace.trackerDirectory, job, place.checkout);
  if (airlock !== null && airlock !== 'conflicts-unknown' && 'unreadableJobFile' in airlock) return unreadableJobFileRefusalOf(request, job, airlock.unreadableJobFile);
  if (airlock === 'conflicts-unknown') {
    request.log(`The Airlock agent of job ${job.id} did not launch: neither its kept facts nor git tell which files conflict.`);
    return { airlockConflictsUnknownFor: job.id };
  }
  const effectReading    = effectReadings.factsOf(board, job, location.repositoryRoot, request.mainLine);
  const factsRead = launchFactsOf(board, request, job, { instructions: instructions.text, airlock, place });
  if (StoredFileUnreadable.isUnreadableFile(factsRead)) return unreadableJobFileRefusalOf(request, job, factsRead);
  const launchFacts      = { ...factsRead, effectReading };
  const text             = request.launchTextOf(job, launchFacts);
  const resumeLine       = JobResumption.resumeLineOf(workspace.trackerDirectory, board, job, request);
  if (StoredFileUnreadable.isUnreadableFile(resumeLine)) return unreadableJobFileRefusalOf(request, job, resumeLine);
  const redHandoffTakenOver = launchFacts.redHandoff ?? null;
  // A resumed instance reads the owner its first instance recorded, though the handoff it took over may read otherwise by now.
  const staleGreenSessionOwnerAnswer = redHandoffTakenOver === null && !JobResumption.isResumedInstance(job)
    ? null
    : JobResumption.staleGreenSessionOwnerOf(children, workspace.trackerDirectory, board.logRecordsSoFar(), job, agentAdapter);
  if (staleGreenSessionOwnerAnswer?.verdict === 'unreadable') return unreadableJobFileRefusalOf(request, job, staleGreenSessionOwnerAnswer.unreadableFile);
  const staleGreenSessionOwner = staleGreenSessionOwnerAnswer?.sessionOwnerJobId ?? null;
  const sessionOwnerJobId = staleGreenSessionOwner ?? JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job);
  // Read before the launch writes anything, so a pair that cannot be read leaves the job as it was.
  const launchSettings    = sessionLaunchSettingsOf(workspace.trackerDirectory, board, job, sessionOwnerJobId);
  if (StoredFileUnreadable.isUnreadableFile(launchSettings)) return unreadableJobFileRefusalOf(request, job, launchSettings);
  JobResumption.recordStaleGreenSessionOwner(workspace.trackerDirectory, job, staleGreenSessionOwner);
  // A resumed stale-green session is told its red handoff as a resume of its own ladder, never its task again.
  const firstMessage     = staleGreenSessionOwner === null || redHandoffTakenOver === null ? text.firstMessage : request.redHandoffMessageOf(redHandoffTakenOver);
  const launchParts      = JobResumption.launchPartsOf(job, firstMessage, resumeLine);
  if (!launchParts.resume && redHandoffTakenOver !== null) RedHandoff.adoptRedHandoff(jobFolder, redHandoffTakenOver);
  if (JobLaunch.isWorktreeJob(job)) JobLaunch.recordJobStart(jobLaunchContext, board, job);
  if (!launchParts.resume) JobResumption.storeFirstMessage(jobFolder, job.childInstance, launchParts.firstMessage);
  const resumesASession   = launchParts.resume || sessionOwnerJobId !== job.id;
  const { workingDirectory } = resumesASession
    ? SessionPlaces.resumedSessionPlaceOf(place, children.jobFolderOf(sessionOwnerJobId), request.agentAdapter.capabilities)
    : place;
  const { launchEnvironment } = request.platformPorts;
  const launchRequest: AgentLaunchRequest = {
    programPath:   program.programPath,
    sessionId:     agentAdapter.sessionIdOf(trackerId, sessionOwnerJobId),
    resume:        resumesASession,
    workingDirectory,
    homeDirectory: request.homeDirectory,
    firstMessage:  launchParts.firstMessage,
    roleBrief:     text.roleBrief,
    ...launchSettings,
    environment:   launchEnvironment.withSearchFolders(
      launchEnvironment.launchEnvironmentOf(
        request.inheritedEnvironment,
        { [JOB_ID_VARIABLE]: job.id, [HATCH_DIRECTORY_VARIABLE]: hatchDirectory },
        agentAdapter.inheritedVariableNames
      ),
      agentSearchFoldersOf(request, board, job, program.programPath),
    ),
    profile:           launchProfileOf(jobLaunchContext, board, job, place, hatchDirectory),
    confinement:       launchFacts.confinement,
    jobFilesDirectory: jobFolder,
    reportSchema:      reportSchemaOf(board, job),
    ...(billing.billing === undefined ? {} : { billing: billing.billing }),
  };
  if (JobLaunch.isWorktreeJob(job) || job.kind === 'merge-agent') {
    const notice = WorkerProfiles.unsignedCommitNoticeOf(launchRequest.profile, repositorySignsCommits(location.repositoryRoot), job.id);
    if (notice !== null) request.log(notice);
  }
  if (launchRequest.profile.networkDomainGuard?.programPath === null) JobLaunch.logUnstartableGuard(jobLaunchContext, job);
  if (launchRequest.profile.stageEditGuard?.programPath === null) JobLaunch.logUnstartableGuard(jobLaunchContext, job, 'stage-edits');
  JobLaunch.recordInstructionsRead(jobFolder, job.childInstance, instructions.files);
  JobLaunch.recordLaunchSettings(jobFolder, launchSettings);
  const sessionLaunch = SessionConfinement.sessionLaunchOf(agentAdapter, request.platformPorts.gateConfinement, launchRequest);
  if (sessionLaunch.verdict === 'refused') return sessionConfinementRefusalOf(request, jobLaunchContext, job, sessionLaunch.reason);
  const launched = await children.launchAgent({
    childFolder:                    jobFolder,
    instance:                       job.childInstance,
    label:                          job.id,
    workingDirectory,
    plan:                           sessionLaunch.plan,
    treeStopAtEndGraceMilliseconds: JobLaunch.treeStopAtEndOf(job).treeStopAtEndGraceMilliseconds ?? null,
  });
  const jobWords = `${job.kind}${job.ticketIds.length === 0 ? '' : ` #${job.ticketIds.join(', #')}`}`;
  if (launched.verdict === 'talos-unavailable' || launched.verdict === 'refused') {
    const why = launched.verdict === 'refused' ? `Talos refused it (${launched.reason})` : 'no Talos took it';
    request.log(`Child instance ${job.childInstance} of job ${job.id} (${jobWords}) did not launch: ${why}; the next pass tries again.`);
    return { talosDidNotLaunch: job.id };
  }
  request.log(`Launched child instance ${job.childInstance} of job ${job.id} (${jobWords}) under Talos.`);
  return null;
}

/**
 * The pair a launch runs its session on, so a later pipeline edit never changes a running session: the pair the job recorded at its first
 * launch, else the one recorded by the job whose session it resumes, else resolved now.
 */
function sessionLaunchSettingsOf(
  trackerDirectory: string, board: Board, job: Readonly<Job>, sessionOwnerJobId: string
): SessionLaunchSettings | StoredFileUnreadable {
  const recordedOf = (jobId: string): SessionLaunchSettings | null | StoredFileUnreadable => JobLaunch.recordedLaunchSettingsOf(trackerDirectory, jobId);
  const recorded = recordedOf(job.id) ?? (sessionOwnerJobId === job.id ? null : recordedOf(sessionOwnerJobId));
  if (recorded !== null) return recorded;
  const lastWorkerJobId = JobResumption.lastWorkerJobIdOf(board.logRecordsSoFar(), job);
  const lastWorkers = lastWorkerJobId === null ? null : recordedOf(lastWorkerJobId);
  if (StoredFileUnreadable.isUnreadableFile(lastWorkers)) return lastWorkers;
  return LaunchSettings.launchSettingsOf(board.pipeline(), job, lastWorkers);
}

/** The jobs standing not launched whose program now reads otherwise than at the refusal: it resolves, or names another path or cause. */
function notLaunchedJobIdsWhoseProgramChanged(request: DrivePassRequest, board: Board): string[] {
  return board.jobs().flatMap((job) => {
    const { notLaunched } = job;
    if (notLaunched === undefined) return [];
    const now = agentProgramResolutionOf(request, board, job);
    const unchanged = now.verdict === 'not-launched' && now.notLaunched.cause === notLaunched.cause && now.notLaunched.programPath === notLaunched.programPath;
    return unchanged ? [] : [job.id];
  });
}

/** One notice for each job that stands not launched, read from its stored fact so it outlasts a restart, this pass's refusals included. */
function agentProgramNoticesOf(request: DrivePassRequest, board: Board, refusedThisPass: readonly AgentProgramRefused[]): HephaestusNotice[] {
  const standing = board.jobs().flatMap((job) => (job.notLaunched === undefined ? [] : [{ notLaunchedJobId: job.id, notLaunched: job.notLaunched }]));
  const refusals = [...standing, ...refusedThisPass.filter((refused) => !standing.some((stood) => stood.notLaunchedJobId === refused.notLaunchedJobId))];
  return refusals.map(({ notLaunchedJobId, notLaunched }) => ({
    kind:   'agent-program-refused',
    jobId:  notLaunchedJobId,
    cause:  notLaunched.cause,
    reason: AgentProgramWordingUtil.notLaunchedClauseOf(notLaunched.cause, request.agentAdapter.displayName, notLaunched.programPath),
    repair: notLaunched.cause === 'batch-target' ? request.agentAdapter.programRepairOf('batch-target') : null,
  }));
}

/**
 * The job's own unreadable file, or one of the merge job an Airlock agent works for, stands as an incident. Never the Assistant's: it is
 * the session that takes the move on an incident.
 */
function waitsOnAnUnreadableFileIncident(board: Board, job: Readonly<Job>): boolean {
  if (job.kind === 'assistant') return false;
  return [job.id, job.parentJobId].some((jobId) => jobId !== null && UnreadableJobFileIncident.standsOpenFor(board, jobId));
}

/**
 * A job launching, or resumed into `running`, whose current instance nobody claimed yet; spawning twice is harmless, since the claim is
 * exclusive. A build job launches its session only once its worktree is prepared, as it moves into `running`. A job that waits on an
 * unreadable file's incident is not tried again until a move on it.
 */
function jobsNeedingAChild(
  children: BoardChildren,
  board: Board,
  spawnedInstances: ReadonlySet<string>,
  heldTicketIds: readonly string[],
): readonly Readonly<Job>[] {
  return board.jobs().filter((job) => ((job.state === 'launching' && !JobLaunch.isWorktreeJob(job)) || job.state === 'running')
    && job.role !== null
    && job.notLaunched === undefined
    && !job.ticketIds.some((ticketId) => heldTicketIds.includes(ticketId))
    && !waitsOnAnUnreadableFileIncident(board, job)
    && !spawnedInstances.has(`${job.id}:${job.childInstance}`)
    && children.livenessOf(children.jobFolderOf(job.id), job.childInstance).verdict === 'unlaunched');
}

function describedThrowOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function noticesOf(
  request: DrivePassRequest,
  installVersionChanged: boolean,
  attributionTicketIds: readonly string[],
  nonConvergingTicketIds: readonly string[],
  heldTargets: readonly HeldTarget[],
  declinedCleanups: readonly DeclinedCleanup[],
  defaultedIncidents: readonly DefaultedIncident[],
  launchRefusals: readonly HephaestusNotice[],
): HephaestusNotice[] {
  return [
    ...heldTargets.map((held): HephaestusNotice => (held.heldFiles.length > 0
      ? { kind: 'target-file-held', target: held.target, heldFiles: held.heldFiles }
      : {
        kind: 'dirty-main-checkout', target: held.target, branch: held.branch, blockingFiles: held.blockingFiles
      })),
    ...declinedCleanups.map((declined) => ({ kind: 'cleanup-declined', ...declined }) as const),
    ...(installVersionChanged ? [{ kind: 'install-version-changed' } as const] : []),
    ...(request.newCodeOnDisk?.() === true ? [{ kind: 'new-code' } as const] : []),
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
  ): ConfinedLine {
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
      ...JobLaunch.cacheFolderFactsOf(jobLaunchContext),
    });
    const facts = { ...sandboxFacts, ...WorkerProfiles.entityFactsOf(pipeline) };
    const planOf = () => LineSandbox.planOf(JobLaunch.processSandboxRequestOf(jobLaunchContext, facts, confinement), profilePath);
    const unmadeRootReason = WorkerProfiles.unmadeDeniedRootRefusalOf(facts);
    if (unmadeRootReason !== null) return { verdict: 'refused', reason: unmadeRootReason };
    return confinedLineOf(platformPorts.gateConfinement, planOf, commandArguments);
  }

  /** A merge gate step in the slot's worktree; one profile file per worktree. */
  function mergeGateLineOf(worktreePath: string, pipeline: Readonly<Pipeline> | null, commandArguments: readonly string[], confinement: GateConfinement): ConfinedLine {
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
    gateEnvironment: (profiledSteps) => JobLaunch.gateEnvironmentOf(jobLaunchContext, profiledSteps),
    confinedLineIn:  (worktreePath, profileRunId) => (commandArguments, confinement) => {
      const profileFolder = join(hephaestusFilesIn(request.workspace.trackerDirectory).hephaestusDirectory, GATE_PROFILE_SANDBOXES_FOLDER);
      return hephaestusGateLineOf(worktreePath, join(profileFolder, `${profileRunId}.sb`), storedPipeline(), commandArguments, confinement);
    },
    hold:         holdTracker,
    wake:         () => wake(true),
    log:          request.log,
    runGateLines: processStarts.runGateLines,
    runLine:      request.lineRunner,
    stopLiveLinesUnder,
  });

  const pipelineChecking = PipelineChecking.createPipelineChecking({
    workspace:       request.workspace,
    worktreesRoot,
    mainLine:        request.mainLine,
    platformPorts,
    gateSlots,
    gateEnvironment: (checkedSteps) => JobLaunch.gateEnvironmentOf(jobLaunchContext, checkedSteps),
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
            environment:     JobLaunch.gateEnvironmentOf(jobLaunchContext, pipeline),
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
    mergeAgentReadingOf:   (job) => JobLaunch.sessionReadingOf(jobLaunchContext, job),
    resolutionLinesOf:     MergeRun.resolutionLinesOf,
    childIsLive:           (job) => {
      const jobFolder = request.boardChildren.jobFolderOf(job.id);
      return request.boardChildren.livenessOf(jobFolder, job.childInstance).verdict === 'live';
    },
    stopMergeAgent:        async (job) => { await stopSession(job.id, job.childInstance); },
    startHoldsOrphans:     startKind !== null && ReconcileCauses.startLeavesWorkWaiting(startKind),
    decisionWordingOf:     request.decisionWordingOf,
    keepAirlockFacts:      (mergeJob, facts) => AirlockFactsFile.keep(request.boardChildren.jobFolderOf(mergeJob.id), facts),
    keptAirlockFactsOf:    (mergeJob) => AirlockFactsFile.keptFactsOf(request.boardChildren.jobFolderOf(mergeJob.id), mergeJob.id),
    jobFolderOf:           (job) => request.boardChildren.jobFolderOf(job.id),
    jobFolderOfId:         (jobId) => request.boardChildren.jobFolderOf(jobId),
    redHandoffResumes:     LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    dispatchIsStopped:     () => request.boardStore.reads.requireProgress().hephaestusState === 'paused',
    reportDeclinedCleanup: (declined) => {
      request.log(`Git declined the ${declined.cleanup} cleanup of ${declined.groupBranch}: ${declined.reason}`);
      declinedCleanups = [...declinedCleanups.filter((earlier) => earlier.cleanup !== declined.cleanup || earlier.groupBranch !== declined.groupBranch), declined];
    },
    mainConstitutionOf:     (constitutionPath) => InstructionFiles.mainConstitutionOf(request.workspace.rootDirectory, request.mainLine, constitutionPath),
    repositorySignsCommits: () => repositorySignsCommits(projectLocation.repositoryRoot),
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
    const observation = reconciledWithTheStart(observe(request, jobLaunchContext, new Set(forcedStopRetryJobIdsDue.splice(0))));
    if (!forced && observation.fingerprint === lastFingerprint) return;
    await request.installVersionsKnown?.();
    const at = request.formatStamp(request.now());
    const installVersionChanged = request.installVersionChanged();
    const written = await request.boardStore.transactions.transact({
      at,
      mutate: (change) => {
        openLeftoverWorktreeDecisions(change, request.decisionWordingOf, leftoverWorktrees.splice(0));
        const replies = HatchInbox.applyPendingRequests(change, request.workspace.rootDirectory, observation.pendingRequests);
        request.afterHoldPhase?.('relayed-commands', change.board);
        const billing = change.board.pipeline()?.billing;
        const childEventFacts = { apiBilling: billing?.mode === 'api' ? billing : null, decisionWordingOf: request.decisionWordingOf };
        const {
          usageLimitHits, usageWindowObservations, stoppedSessions, pipelineAgentTurnEnds, documentAgentTurnEnds, documentAgentSessionEnds, effectReadingResults, effectReadingEnds
        } = applyChildEvents(
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
        const buildJobRecords = JobLaunch.applyBuildJobObservations(change, jobLaunchContext, observation.buildJobs);
        const usageResetsAt = UsageLimits.usageResetsAtOf(observation.usageMarker, usageLimitHits);
        const agentConfigHold = JobLaunch.holdAgentConfigHits(change, jobLaunchContext, observation.ticketIdsTouchingAgentConfig);
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
        const waiverAnswersAwaitAPass = actOnWaiverAnswers(change, steps, observation.answeredWaiverTrees, request.workspace.trackerDirectory);
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
          attributionTicketIds:         JobLaunch.attributionTicketIdsOf([...change.storedLogRecords, ...buildJobRecords]),
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
    await JobLaunch.runBuildJobEffects(jobLaunchContext, written.board, observation.buildJobs);
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
      : jobsNeedingAChild(request.boardChildren, written.board, spawnedInstances, written.result.agentConfigHeldTicketIds);
    for (const job of jobsToLaunch) {
      hatchFolderOfLaunchedJob.set(job.id, HatchInbox.hatchDirectoryOf(request.workspace.rootDirectory, job.id));
      const refusal = await launchAgentChild(request, jobLaunchContext, written.board, observation.trackerId, job, effectReadings);
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
    const apiKeyDecisionIsDue = apiBillingKeyIsMissing && openApiKeyDecisionIdsOf(written.board).length === 0;
    const apiKeyDecisionIsStale = !apiBillingKeyIsMissing && !aBillingMissesItsKey(request, written.board)
      && openApiKeyDecisionIdsOf(written.board).length > 0;
    const notLaunchedJobIdsToRetry = notLaunchedJobIdsWhoseProgramChanged(request, written.board);
    const holdIsDue = unmadeAirlockAgentRoots.length > 0 || launchedAirlockAgentJobIds.length > 0 || apiKeyDecisionIsDue || apiKeyDecisionIsStale
      || agentProgramRefusals.length > 0 || notLaunchedJobIdsToRetry.length > 0 || unreadableJobFiles.length > 0;
    let refusalResolvedSinceItsLaunch = false;
    if (holdIsDue) await holdTracker((hold) => {
      for (const refused of agentProgramRefusals) {
        const job = hold.board.jobById(refused.notLaunchedJobId);
        if (job === undefined) continue;
        // The agent setting may have changed between the launch and this hold; only a refusal that still stands is recorded.
        const resolutionNow = agentProgramResolutionOf(request, hold.board, job);
        if (resolutionNow.verdict === 'not-launched') hold.board.recordNotLaunched(job.id, resolutionNow.notLaunched, hold.at);
        else refusalResolvedSinceItsLaunch = true;
      }
      hold.board.retryNotLaunched(hold.at, (job) => notLaunchedJobIdsToRetry.includes(job.id));
      for (const unmadeRoot of unmadeAirlockAgentRoots) AirlockSandboxIncident.openOnce(hold.board, unmadeRoot, hold.at);
      for (const unreadableJobFile of unreadableJobFiles) UnreadableJobFileIncident.openOnce(hold.board, unreadableJobFile, hold.at);
      for (const jobId of launchedAirlockAgentJobIds) AirlockSandboxIncident.closeOnLaunch(hold.board, jobId, hold.at);
      if (apiKeyDecisionIsDue) openApiKeyDecisionOnce(hold.board, request.decisionWordingOf, hold.at);
      if (apiKeyDecisionIsStale) withdrawApiKeyDecisions(hold.board, hold.at);
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
      notices:      noticesOf(
        request,
        installVersionChanged,
        written.result.attributionTicketIds,
        written.result.nonConvergingTicketIds,
        heldTargets,
        stillDeclinedCleanups(),
        IncidentRouter.defaultedIncidentsOf(written.board.logRecordsSoFar()),
        [...launchRefusals, ...agentProgramNoticesOf(request, written.board, agentProgramRefusals)],
      ),
      ticketsWaitingForMachineSlot: written.result.ticketsWaitingForMachineSlot,
    };
    const settled = observe(request, jobLaunchContext);
    // An event Talos logged after this pass read its events is unapplied work, never a settled state an unforced wake may skip.
    lastFingerprint = settled.childObservations.some((childObservation) => childObservation.events.length > 0) ? null : settled.fingerprint;
    // A job the merge sweep launched after this pass launched children needs one more pass, which its settled fingerprint would skip.
    const jobIdsThisPassSaw = new Set(written.board.jobs().map((job) => job.id));
    const passIsDue = JobLaunch.someBuildJobAwaitsAPass(written.board, settled.buildJobs) || written.result.waiverAnswersAwaitAPass
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
      request.log(`Presence could not record the pass: ${describedThrowOf(thrown)}`);
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
    request.log(`Drive pass abandoned (${abandoned.reason}); it waits for the next wake-up: ${abandoned.detail}`);
    const at = request.formatStamp(request.now());
    recordInPresence(() => Presence.recordAbandonedPass(presenceFiles, request.generation, abandoned.reason, abandoned.detail, at));
  }

  async function crashOnPassThrow(thrown: unknown): Promise<void> {
    stopped = true;
    request.log(`Drive pass crashed: ${describedThrowOf(thrown)}; the crash path runs and no further pass runs.`);
    try {
      await request.onPassCrashed(thrown);
    } catch (crashPathThrow) {
      request.log(`The crash path of the drive pass threw: ${describedThrowOf(crashPathThrow)}`);
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
    for (const lost of report.lost) request.log(`Child instance ${lost.instance} of job ${lost.jobId} is lost (${lost.cause ?? FORCED_STOP_REFUSED_INTERRUPTION}).`);
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
