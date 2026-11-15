/**
 * A build job end to end (design sections 4.4 and 5): the Overseer prepares the ticket's worktree from the target tip, runs the install line
 * in a sandboxed process Watcher, launches the builder, takes its closing report, closes its input, verifies, gates in a sandboxed process
 * Watcher, and writes the Handoff and finishes the ticket, each step a job state. Observing happens outside the lock, the moves in the hold,
 * and the effects (git, Watchers, frames) after it; a step's progress lives on disk in the job folder, so a restart observes it again.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join }                       from 'node:path';

import type { AgentAdapter }            from '../../lib/agent-launch/AgentAdapter.ts';
import { writeFileAtomically }          from '../../lib/atomic-file/AtomicFile.ts';
import { confinedLineOf }               from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                   from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                 from '../../lib/git/GitWorktrees.ts';
import { changedTrackedPathsOf }        from '../../lib/git/Worktrees.ts';
import { PORTABLE_GIT_SETTINGS }        from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }             from '../../lib/git/utils/GitArgumentsUtil.ts';
import type { PlatformPorts }           from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ShellExitReport }         from '../../lib/shell-line/ShellLine.ts';
import type { Decision }                from '../../lib/tracker-model/@types/Decision.ts';
import type { GatePhase, GateRunStamp } from '../../lib/tracker-model/@types/GatePhase.ts';
import type {
  GateOutcome,
  Job,
  JobKind,
  JobState
} from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                                                         from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline, PipelineGate, PipelineStep }                                              from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording }                                                    from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                                                             from '../../lib/tracker-model/Board.ts';
import { FRESH_AGENT_CAUSE, STOPPED_BY_USER_CAUSE }                                               from '../../lib/tracker-model/JobControls.ts';
import { FIRST_WATCHER_INSTANCE, HANDOFF_RED_INTERRUPTION }                                       from '../../lib/tracker-model/constants/JobStates.ts';
import { GroupNameUtil }                                                                          from '../../lib/tracker-model/utils/GroupNameUtil.ts';
import { PipelineUtil }                                                                           from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { TicketBodyHashUtil }                                                                     from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { VocabularyUtil }                                                                         from '../../lib/tracker-model/utils/VocabularyUtil.ts';
import type { WatcherEnd }                                                                        from '../../lib/watcher/WatcherRecord.ts';
import { WorktreesFolder }                                                                        from '../../shared/WorktreesFolder.ts';
import { DISPATCH_PROTOCOL }                                                                      from '../../shared/constants/DispatchProtocol.ts';
import { LIFECYCLE_LIMITS }                                                                       from '../../shared/constants/LifecycleLimits.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET, SESSION_STOP_GRACE_MILLISECONDS, WIND_DOWN_GRACE_CALLS } from '../../shared/constants/OverseerLimits.ts';
import {
  agentConfigTouchedBeforeLaunch,
  type CustomsSubject,
  launchSnapshotOf,
  type LaunchSnapshot,
  type RefMovesAllowed,
  refMovesAllowedOf,
  retriedFailedBuildJobIdOf,
  CUSTOMS_CHECKS,
  clearCustoms
} from '../lifecycle/Customs.ts';
import { type GateConfinement, GateRun } from '../lifecycle/GateRun.ts';
import {
  MergeRun,
  type MergeSides,
  type ReReviewVerdict,
  type TargetMergeSettlement
} from '../lifecycle/MergeRun.ts';
import { ReviewOutcome }                                               from '../lifecycle/ReviewOutcome.ts';
import type { TrackerChange }                                          from '../tracker/TrackerPipeline.ts';
import type { Workspace }                                              from '../tracker/Workspace.ts';
import { ConstitutionCommits }                                         from './ConstitutionCommits.ts';
import type { GateRunSlots }                                           from './GateRunSlots.ts';
import { GroupWorktrees }                                              from './GroupWorktrees.ts';
import { GuardCommand }                                                from './GuardCommand.ts';
import { HatchInbox }                                                  from './HatchInbox.ts';
import { InstructionFiles, type InstructionFileRead }                  from './InstructionFiles.ts';
import type { SessionLaunchSettings }                                  from './LaunchSettings.ts';
import { type ProcessStarts, REAL_PROCESS_STARTS }                     from './ProcessStarts.ts';
import { ProcessWatcherSandbox, type ProcessSandboxRequest }           from './ProcessWatcherSandbox.ts';
import { RedHandoff, type RedHandoffFacts }                            from './RedHandoff.ts';
import { WatcherFleet }                                                from './WatcherFleet.ts';
import { WorkerProfiles, type SandboxFacts, type SandboxFactsRequest } from './WorkerProfiles.ts';

export interface JobLaunchContext {
  platformPorts:        PlatformPorts;
  workspace:            Workspace;
  agentAdapter:         AgentAdapter;
  monitorFolder:        string;
  homeDirectory:        string;
  inheritedEnvironment: Readonly<Record<string, string | undefined>>;
  mainLine:             string;
  groupTargetPrefix:    string;
  watcherBundlePath:    string;
  /** The Overseer's own runtime, isolating arguments and entry script, which a job's network guard hook runs. */
  programCommand:       readonly string[];
  codeVersion:          string;
  gateSlots:            GateRunSlots;
  windDownMessage:      string;
  decisionWordingOf:    (draft: DecisionDraft) => DecisionWording;
  log:                  (line: string) => void;
  /** The lines the merge commit at the worktree's HEAD changed against git's automatic merge; `null` when git cannot tell. */
  resolutionLinesOf:    (worktreePath: string) => number | null;
  processStarts?:       ProcessStarts;
}

/** `worktree-unnormalised`: the fresh checkout already differs from its commit, as line-ending normalisation leaves it, so every gate would fail. */
export type SetupProgress = 'creating-worktree' | 'worktree-failed' | 'worktree-unnormalised' | 'installing' | 'install-failed' | 'installed';

export type GateStepOutcome = GateOutcome | 'setup-failed';

/**
 * A gate run's phase, its phase hash and the steps it runs, fixed as the run starts: a pipeline edited or reordered mid-run changes neither
 * the gate a step folder runs nor the hash the settlement stamps.
 */
export interface GateRunManifest extends GateRunStamp {
  prepare: PipelineStep[];
  gates:   PipelineGate[];
}

export type GateProgress =
  | { verdict: 'pending' }
  /** The step at `stepIndex` of the run's manifest has yet to end, or to start while every gate slot of the machine is held. */
  | { verdict: 'running'; treeId: string; stepIndex: number }
  /**
   * `step` names the red step, `null` on a pass; `ran` is false when a review left the tree the build's gates passed. `manifest` is what
   * the run judged by: `null` when no gate ran, or when the run's manifest cannot be read, which no gate passes.
   */
  | {
    verdict: 'judged'; treeId: string; outcome: GateStepOutcome; step: string | null; output: string; ran: boolean; exitCode?: number | null; manifest: GateRunManifest | null
  };

/** One Watcher of a job's gate run: one prepare step, or one gate. */
interface GateStep {
  kind:        'prepare' | 'gate';
  name:        string;
  line:        string;
  folder:      string;
  in:          string | null;
  confinement: GateConfinement;
}

/** Kept beside the step's folder with the stamp of the manifest it ran under, and reused only on the same tree under an equal manifest. */
interface StepVerdict extends GateRunStamp {
  treeId:    string;
  outcome:   GateStepOutcome;
  output:    string;
  exitCode?: number | null;
}

export interface BuildJobObservation {
  jobId:            string;
  setup:            SetupProgress;
  /** Top-level assistant turns across every Watcher instance of the job. */
  calls:            number;
  /** The structured report of the newest `result`, `undefined` before one. */
  report:           unknown;
  agentEnd:         WatcherEnd | 'lost' | null;
  gate:             GateProgress;
  /** The gate, prepare or install line or the worker launch that confinement refused, `null` while none was. */
  sandboxRefusal:   SandboxRefusal | null;
  /** Where a prepared review job stands in bringing its branch up to the target's tip; `not-checked` for every other job. */
  targetCatchUp:    TargetCatchUp;
  /** Where a job in `merging-main` stands; `null` for a job in any other state. */
  mainMerge:        MainMergeReading | null;
  /** The conflict re-reviewer working under the job; `null` while none is. */
  conflictReReview: ConflictReReviewReading | null;
}

/**
 * A review job's step between its install and its reviewer: the branch is checked against the target's tip, and one that lacks it gets the
 * target merged in and gated before the reviewer starts. `gating` waits on the step at `stepIndex`; `gated` carries the judged gate run.
 */
export type TargetCatchUp =
  | { verdict: 'not-checked' }
  | { verdict: 'up-to-date' }
  | { verdict: 'behind'; targetTip: string; branchTip: string }
  | { verdict: 'merging' }
  | { verdict: 'merge-ended' }
  | { verdict: 'merge-failed'; reason: string }
  | { verdict: 'conflicted'; targetTip: string; conflictedFiles: string[] }
  | { verdict: 'gating'; stepIndex: number }
  | { verdict: 'gated'; targetTip: string; gate: Extract<GateProgress, { verdict: 'judged' }> };

/** What a builder sent back by its review's target catch-up is told: the conflicted merge, or the red gate on the merged tree. */
export type TargetCatchUpHandover =
  | { kind: 'conflict'; targetTip: string; conflictedFiles: string[] }
  | { kind: 'gate-red'; redHandoff: RedHandoffFacts };

/** The tips the catch-up merge was checked against, kept before its process starts, so every later step reads the same two. */
type TargetMergeRecord = MergeSides;

/**
 * One round of a job in `merging-main`, the job's Watcher instance: the target's tip checked against the worktree, merged in by a process
 * Watcher when the branch lacks it, then the merged tree gated in the job's own phase once the hold asks for it. `up-to-date` and `merged`
 * carry the tree the hold settles: a green current on it finishes the job, any other is gated first.
 */
export type MainMergeStep =
  /** A conflict re-reviewer works in the worktree: nothing else of the round is read until it ended. */
  | { verdict: 're-reviewing' }
  | { verdict: 'up-to-date'; treeId: string }
  | { verdict: 'behind'; targetTip: string; branchTip: string }
  | { verdict: 'merging' }
  | { verdict: 'merge-ended' }
  | { verdict: 'merge-failed'; reason: string }
  | { verdict: 'conflicted'; targetTip: string; branchTip: string; conflictedFiles: string[] }
  | { verdict: 'merged'; treeId: string }
  | { verdict: 'gating'; stepIndex: number }
  | { verdict: 'gated'; gate: Extract<GateProgress, { verdict: 'judged' }> };

/** The newest conflict a job in `merging-main` sent its session, and the resolution its session committed for it, kept at the first look. */
export interface MainMergeResolution {
  conflictRound:    number;
  targetTip:        string;
  branchTip:        string;
  conflictedFiles:  string[];
  resolutionCommit: string;
  /** `null` when git cannot tell, which is re-reviewed. */
  lines:            number | null;
}

/** The conflict re-reviewer working under a job in `merging-main`, read like a session; its report is judged once it reached Customs. */
export interface ConflictReReviewReading {
  jobId:        string;
  calls:        number;
  sessionEnded: boolean;
  verdict:      ReReviewVerdict | null;
}

export interface MainMergeReading {
  step:       MainMergeStep;
  /** Read only while the pipeline has `airlock.reReview`, which alone asks for a conflict re-review. */
  resolution: MainMergeResolution | null;
}

/** What a round whose merge conflicted keeps, for the resolution read after it and the conflict re-reviewer's launch. */
export interface MainMergeConflict {
  targetTip:       string;
  branchTip:       string;
  conflictedFiles: string[];
}

/** Where one merge of the target into a ticket's worktree runs and settles: the catch-up before a review, or a round of `merging-main`. */
interface MergeIntoTreeFiles {
  watcherFolder:  string;
  settlementFile: string;
}

/** The main-merge verdicts only a Watcher's end moves on. */
const MAIN_MERGE_WAITS: readonly MainMergeStep['verdict'][] = ['merging', 'gating'];

/** The catch-up verdicts only a Watcher's end moves on, so a pass that reads one waits for that end instead of asking for the next pass. */
const TARGET_CATCH_UP_WAITS: readonly TargetCatchUp['verdict'][] = ['merging', 'gating'];

interface SandboxRefusal {
  step:   string;
  reason: string;
}

/** Where a refused line or worker launch can stand: prepare and install lines while preparing, the worker while running, gates while gating. */
const STATES_A_SANDBOX_REFUSAL_ENDS: ReadonlySet<JobState> = new Set<JobState>(['preparing', 'running', 'gating', 'merging-main']);

/** What the Overseer writes in the job folder beside its Watchers; only the Overseer writes there. */
const JOB_FILES = {
  worktreeFailure:        'worktree-failure.txt',
  worktreeUnnormalised:   'worktree-unnormalised.txt',
  sandboxRefusal:         'sandbox-refusal.json',
  start:                  'start.json',
  windDownSent:           'wind-down-sent',
  inputClosed:            'input-closed',
  stopSent:               'stop-sent',
  profile:                'process-sandbox.sb',
  instructionsReadPrefix: 'instructions-',
  launchSettings:         'launch-settings.json',
  targetMerge:            'target-merge.json',
  targetMergeSettlement:  'target-merge-settlement.json',
  targetConflict:         'target-conflict.json',
} as const;

/**
 * What a job in `merging-main` keeps per round, each name suffixed with the round's Watcher instance like a gate folder: the tips its merge
 * was checked against, the merge's settlement, a conflict sent to the session, the resolution kept for it, and the tree the hold asked to gate.
 */
const MAIN_MERGE_FILES = {
  record:       'main-merge',
  settlement:   'main-merge-settlement',
  conflict:     'main-conflict',
  resolution:   'main-resolution',
  gateRequired: 'main-gate-required',
} as const;
const MAIN_MERGE_WATCHER_FOLDER = 'main-merge';
const MAIN_MERGE_FOLDER_PREFIX = 'main-';
const JSON_EXTENSION = '.json';

const INSTALL_WATCHER_FOLDER = 'install';
const TARGET_MERGE_WATCHER_FOLDER = 'target-merge';
/** Before each catch-up gate folder, so the review's own gate run after its session never reads a catch-up verdict. */
const TARGET_GATE_FOLDER_PREFIX = 'target-';
const GATE_PREPARE_WATCHER_FOLDER = 'gate-prepare';
const GATE_WATCHER_FOLDER_PREFIX = 'gate-';
/** Beside the run's step folders, with their prefix and Watcher instance suffix: `gate-run.json`, `gate-run-2.json`, `target-gate-run.json`. */
const GATE_RUN_MANIFEST_NAME = 'gate-run';
const GATE_RUN_MANIFEST_EXTENSION = '.json';
const PREPARE_STEP_NAME = 'prepare';
const FIRST_STEP_INDEX = 0;

/** The first step keeps the bare folder name; a later one is numbered without a dash, so it never reads as a Watcher instance suffix. */
function stepFolderOf(baseFolder: string, stepIndex: number): string {
  return stepIndex === FIRST_STEP_INDEX ? baseFolder : `${baseFolder}${stepIndex + 1}`;
}
const STEP_VERDICT_SUFFIX = '-verdict.json';
/** Beside the step's Watcher folder, where a Windows line records its whole status; a Watcher folder runs once, so no status is stale. */
const LINE_STATUS_SUFFIX = '-line-status';
const GATE_LOG_FILE = 'gate.log';
/** A review job's record that its row's green was not current on the tree it left, so its gates run though it changed nothing. */
const REGATE_MARKER_FILE = 'regate-required';
const PROCESS_WATCHER_INSTANCE = 1;
const REVIEW_JOB_KIND = 'review';
const CONFLICT_RE_REVIEWER_ROLE = 'conflict-re-reviewer';

/** The jobs whose session works a ticket's worktree: each is prepared, verified and gated the same way, and only its outcome differs. */
const WORKTREE_JOB_KINDS: readonly JobKind[] = ['build', REVIEW_JOB_KIND];

function isWorktreeJob(job: Readonly<Job>): boolean {
  return WORKTREE_JOB_KINDS.includes(job.kind);
}

/** A build or review winds down, so a group its session left would hold a port and the worktree; any other job keeps its groups. */
function treeStopAtEndOf(job: Readonly<Job>): { treeStopAtEndGraceMilliseconds?: number } {
  return isWorktreeJob(job) ? { treeStopAtEndGraceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS } : {};
}

const AGENT_CONFIG_DECISION = 'branch-touches-agent-config';

function callBudgetOf(job: Readonly<Job>): number {
  return job.kind === REVIEW_JOB_KIND || job.role === CONFLICT_RE_REVIEWER_ROLE ? DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET : DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET;
}
const HANDOFF_HEADING = /^## Handoff[ \t]*\r?$/;
const SECTION_HEADING = /^## /;

/** The causes a build job ends with, which the log stores and the notices read back. */
export const BUILD_JOB_CAUSES = {
  noReport:           'no-report',
  attribution:        'attribution',
  setupFailed:        'setup-failed',
  outOfCalls:         'out-of-calls',
  gateFailed:         'gate-failed',
  gateCannotRun:      'gate-cannot-run',
  cannotBuild:        'cannot-build',
  sandboxUnavailable: 'sandbox-unavailable',
  targetConflict:     'target-conflict',
  targetGateRed:      'target-gate-red',
  reReviewFailed:     're-review-failed',
} as const;

/** The causes a review job ends `does-not-hold` with when its branch could not be brought up to the target before the reviewer. */
const TARGET_CATCH_UP_CAUSES: readonly string[] = [BUILD_JOB_CAUSES.targetConflict, BUILD_JOB_CAUSES.targetGateRed];

interface JobStart {
  startCommit:      string;
  bodyHashAtLaunch: string;
  launchSnapshot:   LaunchSnapshot;
}

function ticketIdOf(job: Readonly<Job>): string {
  return job.ticketIds[0] ?? '';
}

function worktreeOf(workspace: Workspace, job: Readonly<Job>): string {
  return WorktreesFolder.ticketWorktreeOf(workspace.rootDirectory, ticketIdOf(job));
}

function branchOf(job: Readonly<Job>): string {
  return WorktreesFolder.ticketBranchOf(ticketIdOf(job));
}

function jobFolderOf(workspace: Workspace, job: Readonly<Job>): string {
  return WatcherFleet.jobFolderOf(workspace.trackerDirectory, job.id);
}

function processWatcherEnd(ports: PlatformPorts, watcherFolder: string): WatcherEnd | 'lost' | 'pending' {
  const liveness = WatcherFleet.livenessOf(ports, watcherFolder, PROCESS_WATCHER_INSTANCE);
  if (liveness.verdict === 'ended') return liveness.end;
  return liveness.verdict === 'lost' ? 'lost' : 'pending';
}

function lineStatusFileOf(jobFolder: string, folderName: string): string {
  return join(jobFolder, `${folderName}${LINE_STATUS_SUFFIX}`);
}

/** A Watcher lost, or one whose child never exited by itself, reports no exit code, so its line reads as never run. */
function stepExitReportOf(end: WatcherEnd | 'lost', jobFolder: string, folderName: string): ShellExitReport {
  return {
    exitCode:       end !== 'lost' && end.reason === 'exited' ? end.exitCode : null,
    signalCode:     end === 'lost' ? null : end.signal,
    recordedStatus: GateRun.recordedStatusOf(lineStatusFileOf(jobFolder, folderName)),
  };
}

function stepPassed(context: JobLaunchContext, end: WatcherEnd | 'lost', jobFolder: string, folderName: string): boolean {
  return context.platformPorts.shellLine.exitMeaningOf(stepExitReportOf(end, jobFolder, folderName)) === 'passed';
}

/** Each prepare step runs in an install Watcher of its own, in list order, the first that does not pass stopping the rest. */
function setupProgressOf(context: JobLaunchContext, job: Readonly<Job>, prepare: readonly PipelineStep[]): SetupProgress {
  const jobFolder = jobFolderOf(context.workspace, job);
  if (existsSync(join(jobFolder, JOB_FILES.worktreeFailure))) return 'worktree-failed';
  if (existsSync(join(jobFolder, JOB_FILES.worktreeUnnormalised))) return 'worktree-unnormalised';
  if (!existsSync(worktreeOf(context.workspace, job))) return 'creating-worktree';
  for (const stepIndex of prepare.keys()) {
    const folderName = stepFolderOf(INSTALL_WATCHER_FOLDER, stepIndex);
    const end = processWatcherEnd(context.platformPorts, join(jobFolder, folderName));
    if (end === 'pending') return 'installing';
    if (!stepPassed(context, end, jobFolder, folderName)) return 'install-failed';
  }
  return 'installed';
}

/** `calls` counts the current attempt's turns: since the last red handoff's resume, or every instance's when none went red. */
function sessionReadingOf(context: JobLaunchContext, job: Readonly<Job>): { calls: number; report: unknown } {
  const jobFolder = jobFolderOf(context.workspace, job);
  const attemptStartInstance = attemptStartInstanceOf(jobFolder);
  const topLevelMessageIds = new Set<string>();
  let report: unknown = undefined;
  for (let instance = 1; instance <= job.watcherInstance; instance += 1) {
    const entries = WatcherFleet.eventsAfter(jobFolder, instance, 0);
    if (entries === 'malformed') continue;
    for (const entry of entries.filter((logged) => logged.origin === 'agent')) {
      for (const event of context.agentAdapter.eventsOf(entry.line)) {
        if (event.kind === 'assistant-turn' && event.parentToolUseId === null && instance >= attemptStartInstance) topLevelMessageIds.add(event.messageId);
        if (event.kind === 'result') report = event.structuredReport;
      }
    }
  }
  return { calls: topLevelMessageIds.size, report };
}

function treeOf(worktree: string): string | null {
  const run = GitProcess.run(worktree, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return run !== null && GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

function treeOfCommit(worktree: string, commit: string): string | null {
  const run = GitProcess.run(worktree, ['rev-parse', '--verify', '--quiet', `${commit}^{tree}`], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

/** Which gate run of a job: its own run in one Watcher instance, or a review's catch-up run before its reviewer. */
interface GateRunPlace {
  phase:           GatePhase;
  watcherInstance: number;
  folderPrefix:    string;
}

/** A job's own gate run: its phase's gates, in folders of the session's current Watcher instance. */
function ownGateRunOf(job: Readonly<Job>): GateRunPlace {
  return { phase: gatePhaseOfJob(job), watcherInstance: job.watcherInstance, folderPrefix: '' };
}

/** The merge before review gates the merged tree in the build phase, since what it finds goes back to the builder. */
const TARGET_GATE_RUN: GateRunPlace = { phase: 'build', watcherInstance: FIRST_WATCHER_INSTANCE, folderPrefix: TARGET_GATE_FOLDER_PREFIX };

function instanceSuffixOf(watcherInstance: number): string {
  return watcherInstance === FIRST_WATCHER_INSTANCE ? '' : `-${watcherInstance}`;
}

function gateRunManifestFileOf(place: GateRunPlace): string {
  return `${place.folderPrefix}${GATE_RUN_MANIFEST_NAME}${instanceSuffixOf(place.watcherInstance)}${GATE_RUN_MANIFEST_EXTENSION}`;
}

function manifestOf(pipeline: Readonly<Pipeline>, phase: GatePhase): GateRunManifest {
  return { ...PipelineUtil.gateRunStampOf(pipeline, phase), prepare: [...pipeline.prepare], gates: PipelineUtil.gatesOfPhase(pipeline, phase) };
}

function isNamedLine(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof reportFieldOf(value, 'name') === 'string' && typeof reportFieldOf(value, 'run') === 'string';
}

function isAbsentOrTextList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
}

/** A gate as `pipeline.json` stores it, so its confinement and red handoff read only what they expect. */
function isStoredGate(value: unknown): boolean {
  const optionalTexts = [reportFieldOf(value, 'fix'), reportFieldOf(value, 'in')];
  const overseerOnly  = reportFieldOf(value, 'overseerOnly');
  return isNamedLine(value) && optionalTexts.every((text) => text === undefined || typeof text === 'string')
    && ['definedBy', 'network', 'writes'].every((field) => isAbsentOrTextList(reportFieldOf(value, field)))
    && (overseerOnly === undefined || overseerOnly === true);
}

function isGateRunManifestOf(value: unknown, phase: GatePhase): value is GateRunManifest {
  const prepare = reportFieldOf(value, 'prepare');
  const gates   = reportFieldOf(value, 'gates');
  return reportFieldOf(value, 'phase') === phase && typeof reportFieldOf(value, 'phaseHash') === 'string'
    && Array.isArray(prepare) && prepare.every(isNamedLine) && Array.isArray(gates) && gates.every(isStoredGate);
}

/**
 * The run's manifest. A run with none has not started: the manifest is written atomically from `pipeline` before its first step runs, and
 * never rewritten, so every later read of the run reads the same steps. One that cannot be read is never replaced.
 */
function gateRunManifestOf(context: JobLaunchContext, job: Readonly<Job>, place: GateRunPlace, pipeline: Readonly<Pipeline>): GateRunManifest | 'unreadable' {
  const manifestPath = join(jobFolderOf(context.workspace, job), gateRunManifestFileOf(place));
  if (existsSync(manifestPath)) {
    const stored = readJsonFile<unknown>(manifestPath);
    return isGateRunManifestOf(stored, place.phase) ? stored : 'unreadable';
  }
  const manifest = manifestOf(pipeline, place.phase);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/**
 * Each prepare step, then each gate of the manifest in its run order, each in a Watcher folder of its own named by its position in the
 * manifest; a manifest with no gates has no step, so it passes at once. A session resumed after a red handoff gates again in fresh folders,
 * suffixed with its Watcher instance, since a Watcher folder runs once.
 */
function gateStepsOf(manifest: Readonly<GateRunManifest>, place: GateRunPlace): GateStep[] {
  if (manifest.gates.length === 0) return [];
  const suffix = instanceSuffixOf(place.watcherInstance);
  const prepare = manifest.prepare.map((step, stepIndex): GateStep => ({
    kind:        'prepare',
    name:        PREPARE_STEP_NAME,
    line:        step.run,
    folder:      `${place.folderPrefix}${stepFolderOf(GATE_PREPARE_WATCHER_FOLDER, stepIndex)}${suffix}`,
    in:          null,
    confinement: GateRun.prepareConfinementOf(manifest.gates),
  }));
  return [...prepare, ...manifest.gates.map((gate, index): GateStep => ({
    kind:        'gate',
    name:        gate.name,
    line:        gate.run,
    folder:      `${place.folderPrefix}${GATE_WATCHER_FOLDER_PREFIX}${index + 1}${suffix}`,
    in:          gate.in ?? null,
    confinement: GateRun.gateConfinementOf(gate),
  }))];
}

/** A per-instance marker, so a session resumed after a red handoff gets its own wind-down, closed input and stop. */
function instanceMarkerOf(marker: string, watcherInstance: number): string {
  return watcherInstance === FIRST_WATCHER_INSTANCE ? marker : `${marker}-${watcherInstance}`;
}

/** The Watcher instance the job's current attempt began in: the one after its last red handoff, the first otherwise. */
function attemptStartInstanceOf(jobFolder: string): number {
  const facts = RedHandoff.redHandoffFactsOf(jobFolder);
  return facts === null ? FIRST_WATCHER_INSTANCE : facts.interruptedInstance + 1;
}

/** A session working off a red handoff has the short resume budget; the first attempt its role's. */
function attemptCallBudgetOf(trackerDirectory: string, job: Readonly<Job>): number {
  return RedHandoff.redHandoffFactsOf(WatcherFleet.jobFolderOf(trackerDirectory, job.id)) === null ? callBudgetOf(job) : RED_HANDOFF_RESUME_CALL_BUDGET;
}

function watcherOutputOf(watcherFolder: string): string {
  const entries = WatcherFleet.eventsAfter(watcherFolder, PROCESS_WATCHER_INSTANCE, 0);
  return entries === 'malformed' ? '' : entries.filter((entry) => entry.origin === 'agent').map((entry) => `${entry.line}\n`).join('');
}

function readStepVerdict(verdictPath: string): StepVerdict | null {
  try {
    return JSON.parse(readFileSync(verdictPath, 'utf8')) as StepVerdict;
  } catch {
    return null;
  }
}

/**
 * The step's verdict once its Watcher ended, `null` before. Kept in the job folder as it is first read, so a later gate that changes the tree
 * never turns an earlier pass red; it is this job's record of its own run, never a result another job reads.
 */
function stepVerdictOf(context: JobLaunchContext, job: Readonly<Job>, treeId: string, step: GateStep, stamp: GateRunStamp): StepVerdict | null {
  const jobFolder   = jobFolderOf(context.workspace, job);
  const verdictPath = join(jobFolder, `${step.folder}${STEP_VERDICT_SUFFIX}`);
  const kept        = readStepVerdict(verdictPath);
  if (kept !== null && kept.treeId === treeId && kept.phase === stamp.phase && kept.phaseHash === stamp.phaseHash) return kept;
  const watcherFolder = join(jobFolder, step.folder);
  const end = processWatcherEnd(context.platformPorts, watcherFolder);
  if (end === 'pending') return null;
  const { shellLine } = context.platformPorts;
  const run = { ...stepExitReportOf(end, jobFolder, step.folder), output: watcherOutputOf(watcherFolder) };
  let verdict: StepVerdict;
  if (step.kind === 'prepare') {
    const failureOutput = GateRun.prepareFailureOutputOf(shellLine, run, worktreeOf(context.workspace, job));
    verdict = {
      treeId, ...stamp, outcome: failureOutput === null ? 'passed' : 'setup-failed', output: failureOutput ?? run.output, exitCode: run.exitCode
    };
  } else {
    const trackedChanges = GateRun.trackedChangesOf(worktreeOf(context.workspace, job));
    verdict = {
      treeId,
      ...stamp,
      outcome:  GateRun.gateOutcomeOf(shellLine, run, trackedChanges),
      output:   GateRun.gateErrorOutputOf(shellLine, run, trackedChanges),
      exitCode: run.exitCode,
    };
  }
  writeFileAtomically(verdictPath, `${JSON.stringify(verdict)}\n`);
  if (verdict.outcome !== 'passed') writeFileAtomically(join(jobFolder, GATE_LOG_FILE), `${step.name}\n${verdict.output}`);
  return verdict;
}

/**
 * A reviewer that committed nothing, or only commits back to the tree it was given, leaves the tree the build's gates passed. The hold
 * writes the regate marker when the row's green is not current on that tree, since the pipeline changed, so the gates run after all.
 */
function reviewLeftTheTreeAsItWas(context: JobLaunchContext, job: Readonly<Job>, treeId: string): boolean {
  if (job.kind !== REVIEW_JOB_KIND || existsSync(join(jobFolderOf(context.workspace, job), REGATE_MARKER_FILE))) return false;
  const start = readJobStart(jobFolderOf(context.workspace, job));
  return start !== null && treeOfCommit(worktreeOf(context.workspace, job), start.startCommit) === treeId;
}

function gateProgressOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): GateProgress {
  const treeId = treeOf(worktreeOf(context.workspace, job));
  if (treeId === null) return { verdict: 'pending' };
  if (reviewLeftTheTreeAsItWas(context, job, treeId)) return {
    verdict: 'judged', treeId, outcome: 'passed', step: null, output: '', ran: false, manifest: null
  };
  return gateRunProgressOf(context, job, treeId, ownGateRunOf(job), pipeline);
}

/** Judged by the run's manifest alone, written at its first read; a manifest that cannot be read is a run that cannot go on. */
function gateRunProgressOf(
  context: JobLaunchContext, job: Readonly<Job>, treeId: string, place: GateRunPlace, pipeline: Readonly<Pipeline>
): Exclude<GateProgress, { verdict: 'pending' }> {
  const manifest = gateRunManifestOf(context, job, place, pipeline);
  if (manifest === 'unreadable') return {
    verdict: 'judged', treeId, outcome: 'cannot-run', step: gateRunManifestFileOf(place), output: '', ran: true, manifest: null
  };
  for (const [stepIndex, step] of gateStepsOf(manifest, place).entries()) {
    const verdict = stepVerdictOf(context, job, treeId, step, manifest);
    if (verdict === null) return { verdict: 'running', treeId, stepIndex };
    if (verdict.outcome !== 'passed') return {
      verdict: 'judged', treeId, outcome: verdict.outcome, step: step.name, output: verdict.output, ran: true, exitCode: verdict.exitCode ?? null, manifest
    };
  }
  return {
    verdict: 'judged', treeId, outcome: 'passed', step: null, output: '', ran: true, manifest
  };
}

/** Read outside the lock, for every live build job. */
function observeBuildJobs(context: JobLaunchContext, jobs: readonly Readonly<Job>[], pipeline: Readonly<Pipeline> | null): BuildJobObservation[] {
  return jobs.filter(isWorktreeJob).map((job) => {
    const liveness = WatcherFleet.livenessOf(context.platformPorts, jobFolderOf(context.workspace, job), job.watcherInstance);
    const setup = job.state === 'preparing' ? setupProgressOf(context, job, pipeline?.prepare ?? []) : 'installed';
    return {
      jobId:            job.id,
      setup,
      ...sessionReadingOf(context, job),
      agentEnd:         liveness.verdict === 'ended' ? liveness.end : liveness.verdict === 'lost' ? 'lost' : null,
      gate:             job.state === 'gating' && pipeline !== null ? gateProgressOf(context, job, pipeline) : { verdict: 'pending' },
      sandboxRefusal:   sandboxRefusalOf(context, job),
      targetCatchUp:    setup === 'installed' ? targetCatchUpOf(context, job, pipeline) : { verdict: 'not-checked' },
      mainMerge:        mainMergeReadingOf(context, jobs, job, pipeline),
      conflictReReview: conflictReReviewReadingOf(context, jobs, job, pipeline),
    };
  });
}

/**
 * Read outside the lock: the worktree HEAD's tree of each review waiting `awaiting-answer` whose waiver no open decision names any more,
 * which the hold that acts on User's answer queues on; `null` when git cannot read it.
 */
function answeredWaiverTreesOf(context: JobLaunchContext, jobs: readonly Readonly<Job>[], decisions: readonly Readonly<Decision>[]): ReadonlyMap<string, string | null> {
  const answeredReviews = jobs.filter((job) => job.kind === REVIEW_JOB_KIND && job.state === 'awaiting-answer' && !decisions.some((decision) => decision.jobId === job.id));
  return new Map(answeredReviews.map((job) => [job.id, treeOf(worktreeOf(context.workspace, job))]));
}

function readJsonFile<Content>(path: string): Content | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Content;
  } catch {
    return null;
  }
}

/** The first look: the target's tip as it stands now, and whether the branch already holds it. */
function firstTargetCheckOf(context: JobLaunchContext, job: Readonly<Job>): TargetCatchUp {
  const worktree  = worktreeOf(context.workspace, job);
  const target    = job.target ?? context.mainLine;
  const targetTip = GitProcess.resolvedCommitOf(context.workspace.rootDirectory, `refs/heads/${target}`);
  const branchTip = MergeRun.headOf(worktree);
  if (targetTip === null || branchTip === null) return { verdict: 'merge-failed', reason: `The tip of ${targetTip === null ? target : branchOf(job)} cannot be read.` };
  const holds = MergeRun.headHoldsCommit(worktree, targetTip);
  if (holds === 'holds') return { verdict: 'up-to-date' };
  if (holds === 'lacks') return { verdict: 'behind', targetTip, branchTip };
  return { verdict: 'merge-failed', reason: `git cannot tell whether ${branchOf(job)} holds ${target}'s tip ${targetTip}.` };
}

/** Read from the job folder and the worktree alone, so a restart reads the same step again. */
function targetCatchUpOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline> | null): TargetCatchUp {
  if (job.kind !== REVIEW_JOB_KIND || job.state !== 'preparing' || pipeline === null) return { verdict: 'not-checked' };
  const jobFolder = jobFolderOf(context.workspace, job);
  const record = readJsonFile<TargetMergeRecord>(join(jobFolder, JOB_FILES.targetMerge));
  if (record === null) return firstTargetCheckOf(context, job);
  const settlement = readJsonFile<TargetMergeSettlement>(join(jobFolder, JOB_FILES.targetMergeSettlement));
  if (settlement === null) {
    return processWatcherEnd(context.platformPorts, join(jobFolder, TARGET_MERGE_WATCHER_FOLDER)) === 'pending' ? { verdict: 'merging' } : { verdict: 'merge-ended' };
  }
  if (settlement.verdict === 'failed') return { verdict: 'merge-failed', reason: settlement.reason };
  if (settlement.verdict === 'conflicted') return { verdict: 'conflicted', targetTip: record.mergedTip, conflictedFiles: settlement.conflictedFiles };
  const treeId = treeOf(worktreeOf(context.workspace, job));
  if (treeId === null) return { verdict: 'merge-failed', reason: `The tree of the merge commit ${settlement.mergeCommit} cannot be read.` };
  const progress = gateRunProgressOf(context, job, treeId, TARGET_GATE_RUN, pipeline);
  if (progress.verdict === 'running') return { verdict: 'gating', stepIndex: progress.stepIndex };
  return { verdict: 'gated', targetTip: record.mergedTip, gate: progress };
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isMainMergeConflict(value: unknown): value is MainMergeConflict {
  return typeof reportFieldOf(value, 'targetTip') === 'string' && typeof reportFieldOf(value, 'branchTip') === 'string'
    && isTextList(reportFieldOf(value, 'conflictedFiles'));
}

function isMainMergeResolution(value: unknown): value is MainMergeResolution {
  const lines = reportFieldOf(value, 'lines');
  return isMainMergeConflict(value) && typeof reportFieldOf(value, 'conflictRound') === 'number' && typeof reportFieldOf(value, 'resolutionCommit') === 'string'
    && (lines === null || typeof lines === 'number');
}

/** The newest round before the current one whose merge conflicted; `null` when none did. */
function newestMainMergeConflictOf(trackerDirectory: string, job: Readonly<Job>): { round: number; conflict: MainMergeConflict } | null {
  for (let round = job.watcherInstance - 1; round >= FIRST_WATCHER_INSTANCE; round -= 1) {
    const conflict = readJsonFile<unknown>(mainMergeFileOf(trackerDirectory, job, MAIN_MERGE_FILES.conflict, round));
    if (isMainMergeConflict(conflict)) return { round, conflict };
  }
  return null;
}

/**
 * The resolution of the newest conflict, kept at the first look after the session that resolved it reached `merging-main` again: its HEAD
 * then, and the lines that commit changed against git's automatic merge, so a later commit on top never changes what was measured.
 */
function mainMergeResolutionOf(context: JobLaunchContext, job: Readonly<Job>): MainMergeResolution | null {
  const newest = newestMainMergeConflictOf(context.workspace.trackerDirectory, job);
  if (newest === null) return null;
  const resolutionPath = mainMergeFileOf(context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.resolution, newest.round);
  const kept = readJsonFile<unknown>(resolutionPath);
  if (isMainMergeResolution(kept)) return kept;
  const worktree = worktreeOf(context.workspace, job);
  const resolutionCommit = MergeRun.headOf(worktree);
  // Fail closed: a HEAD git cannot read is re-reviewed against no commit, which refuses, and nothing is kept for it.
  if (resolutionCommit === null) return {
    conflictRound: newest.round, ...newest.conflict, resolutionCommit: '', lines: null
  };
  const resolution: MainMergeResolution = {
    conflictRound: newest.round, ...newest.conflict, resolutionCommit, lines: context.resolutionLinesOf(worktree)
  };
  writeFileAtomically(resolutionPath, `${JSON.stringify(resolution)}\n`);
  return resolution;
}

/** Read from the job folder and the worktree alone, so a restart reads the same step of the same round again. */
function mainMergeStepOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): MainMergeStep {
  const round    = job.watcherInstance;
  const worktree = worktreeOf(context.workspace, job);
  const unreadableTree: MainMergeStep = { verdict: 'merge-failed', reason: `The tree of ${branchOf(job)}'s HEAD cannot be read.` };
  if (existsSync(mainMergeFileOf(context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.gateRequired, round))) {
    const treeId = treeOf(worktree);
    if (treeId === null) return unreadableTree;
    const progress = gateRunProgressOf(context, job, treeId, mainMergeGateRunOf(job, round), pipeline);
    return progress.verdict === 'running' ? { verdict: 'gating', stepIndex: progress.stepIndex } : { verdict: 'gated', gate: progress };
  }
  const record = readJsonFile<TargetMergeRecord>(mainMergeFileOf(context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.record, round));
  if (record === null) {
    const check = firstTargetCheckOf(context, job);
    if (check.verdict === 'behind' || check.verdict === 'merge-failed') return check;
    const treeId = treeOf(worktree);
    return treeId === null ? unreadableTree : { verdict: 'up-to-date', treeId };
  }
  const files = mainMergeIntoTreeFilesOf(round);
  const settlement = readJsonFile<TargetMergeSettlement>(join(jobFolderOf(context.workspace, job), files.settlementFile));
  if (settlement === null) {
    const mergeEnd = processWatcherEnd(context.platformPorts, join(jobFolderOf(context.workspace, job), files.watcherFolder));
    return mergeEnd === 'pending' ? { verdict: 'merging' } : { verdict: 'merge-ended' };
  }
  if (settlement.verdict === 'failed') return { verdict: 'merge-failed', reason: settlement.reason };
  if (settlement.verdict === 'conflicted') return {
    verdict: 'conflicted', targetTip: record.mergedTip, branchTip: record.startTip, conflictedFiles: settlement.conflictedFiles
  };
  const treeId = treeOf(worktree);
  return treeId === null ? unreadableTree : { verdict: 'merged', treeId };
}

function mainMergeReadingOf(context: JobLaunchContext, jobs: readonly Readonly<Job>[], job: Readonly<Job>, pipeline: Readonly<Pipeline> | null): MainMergeReading | null {
  if (job.state !== 'merging-main' || pipeline === null) return null;
  if (conflictReReviewerOf(jobs, job) !== undefined) return { step: { verdict: 're-reviewing' }, resolution: null };
  return {
    step:       mainMergeStepOf(context, job, pipeline),
    resolution: pipeline.airlock?.reReview === undefined ? null : mainMergeResolutionOf(context, job),
  };
}

/** The conflict re-reviewer is judged by the reviewer column's checks once its report reached Customs, against the resolution it re-reviewed. */
function conflictReReviewReadingOf(
  context: JobLaunchContext, jobs: readonly Readonly<Job>[], job: Readonly<Job>, pipeline: Readonly<Pipeline> | null
): ConflictReReviewReading | null {
  const reReviewer = conflictReReviewerOf(jobs, job);
  if (reReviewer === undefined) return null;
  const liveness = WatcherFleet.livenessOf(context.platformPorts, jobFolderOf(context.workspace, reReviewer), reReviewer.watcherInstance);
  const { calls, report } = sessionReadingOf(context, reReviewer);
  const resolution = reReviewer.state === 'in-customs' && pipeline?.airlock?.reReview !== undefined ? mainMergeResolutionOf(context, job) : null;
  return {
    jobId:        reReviewer.id,
    calls,
    sessionEnded: liveness.verdict !== 'live',
    verdict:      resolution === null ? null : MergeRun.reReviewVerdictOf(worktreeOf(context.workspace, job), resolution.resolutionCommit, report),
  };
}

function readJobStart(jobFolder: string): JobStart | null {
  try {
    return JSON.parse(readFileSync(join(jobFolder, JOB_FILES.start), 'utf8')) as JobStart;
  } catch {
    return null;
  }
}

function reportFieldOf(report: unknown, field: string): unknown {
  return typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
}

/** The Handoff code writes from a verified report: the builder's own handoff, then each Acceptance item's evidence. */
function handoffSectionOf(report: unknown): string {
  const acceptance = reportFieldOf(report, 'acceptance');
  const evidenceLines = (Array.isArray(acceptance) ? acceptance : []).map((entry) => {
    const state = reportFieldOf(entry, 'state') === 'waiver-proposed' ? ' waiver proposed' : '';
    return `- ${String(reportFieldOf(entry, 'item'))}${state} — ${String(reportFieldOf(entry, 'evidence'))}`;
  });
  return `## Handoff\n\n${String(reportFieldOf(report, 'handoff') ?? '').trim()}\n${evidenceLines.length === 0 ? '' : `\n${evidenceLines.join('\n')}\n`}`;
}

/** The body with its `## Handoff` section, the filing template's guidance included, replaced by code's; appended when it has none. */
function bodyWithHandoffOf(body: string, handoffSection: string): string {
  const lineEnding = body.includes('\r\n') ? '\r\n' : '\n';
  const handoffInBodyLineEnding = handoffSection.replace(/\r?\n/g, lineEnding);
  const lines = body.split(lineEnding);
  const headingIndex = lines.findIndex((line) => HANDOFF_HEADING.test(line));
  if (headingIndex < 0) return `${body.replace(/(?:\r?\n)*$/, '')}${lineEnding}${lineEnding}${handoffInBodyLineEnding}`;
  const nextHeadingOffset = lines.slice(headingIndex + 1).findIndex((line) => SECTION_HEADING.test(line));
  const following = nextHeadingOffset < 0 ? [] : lines.slice(headingIndex + 1 + nextHeadingOffset);
  return [...lines.slice(0, headingIndex), ...handoffInBodyLineEnding.split(lineEnding), ...following].join(lineEnding);
}

interface HoldContext {
  change:         TrackerChange;
  context:        JobLaunchContext;
  pipelineStored: boolean;
  logged:         LogRecord[];
}

type BuildJobIncidentKind = 'setup-failed' | 'out-of-calls' | 'blocked' | 'gate-cannot-run' | 'sandbox-unavailable';

function openIncidentFor(hold: HoldContext, job: Readonly<Job>, kind: BuildJobIncidentKind, facts: Record<string, string>): void {
  const defaultMoves = {
    'setup-failed': 'worktree-repair', 'out-of-calls': 'job-fresh', 'blocked': 'ticket-park', 'gate-cannot-run': 'gate-retry', 'sandbox-unavailable': 'gate-retry'
  } as const;
  hold.logged.push(...hold.change.board.openIncident({
    kind, ticketIds: job.ticketIds, jobId: job.id, facts, defaultMove: defaultMoves[kind]
  }, hold.change.at).logged);
}

function endJob(hold: HoldContext, job: Readonly<Job>, ending: Parameters<Board['endJob']>[1]): void {
  hold.logged.push(...hold.change.board.endJob(job.id, ending, hold.change.at).logged);
}

function verifyAndRoute(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation): void {
  const { board, at } = hold.change;
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === ticketIdOf(job));
  const start = readJobStart(jobFolderOf(hold.context.workspace, job));
  if (ticket === undefined || start === null) {
    endJob(hold, job, { outcome: 'failed', cause: 'git-failed' });
    return;
  }
  const retriedJobId = retriedFailedBuildJobIdOf(board.logRecordsSoFar(), job.id);
  const retriedStart = retriedJobId === null ? null : readJobStart(WatcherFleet.jobFolderOf(hold.context.workspace.trackerDirectory, retriedJobId));
  const subject: CustomsSubject = {
    role:             job.kind === REVIEW_JOB_KIND ? 'reviewer' : 'builder',
    worktreePath:     worktreeOf(hold.context.workspace, job),
    startCommit:      start.startCommit,
    ...(retriedStart === null ? {} : { workStartCommit: retriedStart.startCommit }),
    bodyHashAtLaunch: start.bodyHashAtLaunch,
    report:           observation.report,
    ticketBody:       ticket.body,
    jobId:            job.id,
    logRecords:       board.logRecordsSoFar(),
    launchSnapshot:   start.launchSnapshot,
    refMovesAllowed:  refMovesAllowedFor(hold.context, board, job),
    gates:            board.pipeline()?.gates ?? [],
    instructionFiles: InstructionFiles.trackedInstructionPathsOf(board.pipeline()),
    pathStyle:        hold.context.platformPorts.dataFolders,
  };
  const reportVerdict = CUSTOMS_CHECKS.V1(subject);
  if (reportVerdict.verdict === 'refused') {
    endJob(hold, job, { outcome: 'failed', cause: reportVerdict.reason === 'report-invalid' ? BUILD_JOB_CAUSES.noReport : reportVerdict.reason });
    return;
  }
  const outcome = reportFieldOf(observation.report, 'outcome');
  if (outcome === 'blocked') {
    openIncidentFor(hold, job, 'blocked', { reason: String(reportFieldOf(observation.report, 'blockedReason') ?? '') });
    endJob(hold, job, { outcome: 'blocked' });
    return;
  }
  if (outcome === 'wound-down') {
    openIncidentFor(hold, job, 'out-of-calls', { calls: String(observation.calls) });
    endJob(hold, job, { outcome: 'wound-down' });
    return;
  }
  if (outcome === 'cannot-build') {
    endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.cannotBuild });
    return;
  }
  const verdict = clearCustoms(subject);
  if (verdict.verdict === 'refused') {
    if (RESUMABLE_CUSTOMS_CHECKS.includes(verdict.check)) {
      interruptOnRedHandoff(hold, job, {
        kind: 'customs', name: verdict.check, command: null, fixCommand: null, exitCode: null, fullLogPath: null, output: verdict.reason
      });
      return;
    }
    if (verdict.check === 'V13') openAgentConfigDecision(hold, job);
    endJob(hold, job, { outcome: 'failed', cause: verdict.check === 'V7' ? BUILD_JOB_CAUSES.attribution : verdict.reason });
    return;
  }
  hold.logged.push(...board.moveJob(job.id, 'gating', at).logged);
}

/** The other jobs' branches, which their own sessions move, and the refs the Overseer's own landings and refreshes move or remove. */
function refMovesAllowedFor(context: JobLaunchContext, board: Board, job: Readonly<Job>): RefMovesAllowed {
  const worktreesRoot = WorktreesFolder.worktreesRootOf(context.workspace.rootDirectory);
  const tickets       = board.tickets();
  return refMovesAllowedOf(board.logRecordsSoFar(), {
    ownJobId:              job.id,
    ownBranch:             branchOf(job),
    otherJobBranches:      board.jobs().filter((other) => other.id !== job.id && isWorktreeJob(other)).map(branchOf),
    ticketBranchOf:        WorktreesFolder.ticketBranchOf,
    releasedGroupBranchOf: (ticketId) => {
      const frontmatter = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter;
      return frontmatter?.releasesGroup === true && frontmatter.group !== undefined ? `${context.groupTargetPrefix}${frontmatter.group}` : null;
    },
    refreshWorktreeOf:            (groupBranch) => GroupWorktrees.refreshWorktreeOf(worktreesRoot, groupBranch),
    constitutionCommitWorktreeOf: (jobId) => ConstitutionCommits.commitWorktreeOf(worktreesRoot, jobId),
  });
}

/** Once per hit: none while one is open, and none again for a hit User already answered, until another job on the ticket ends. */
function openAgentConfigDecision(hold: HoldContext, job: Readonly<Job>): void {
  const { board, at } = hold.change;
  const ticketId = ticketIdOf(job);
  if (agentConfigHitIsSettled(board, ticketId)) return;
  const draft: DecisionDraft = { kind: AGENT_CONFIG_DECISION, ticketIds: [ticketId], jobId: job.id };
  hold.logged.push(...board.openDecision({
    ...draft, askedBy: 'overseer', requestId: null, ...hold.context.decisionWordingOf(draft)
  }, at).logged);
}

function agentConfigHitIsSettled(board: Board, ticketId: string): boolean {
  if (board.decisions().some((decision) => decision.kind === AGENT_CONFIG_DECISION && decision.ticketIds.includes(ticketId))) return true;
  const ticketIdsByJobId = new Map<string, readonly string[]>();
  const kindByDecisionId = new Map<string, { kind: string; ticketIds: readonly string[] }>();
  let answeredSinceTheLastJobEnded = false;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched') ticketIdsByJobId.set(record.jobId, record.fields.ticketIds);
    if (record.kind === 'decision-opened') kindByDecisionId.set(record.decisionId, record.fields);
    if (record.kind === 'job-ended' && (ticketIdsByJobId.get(record.jobId) ?? []).includes(ticketId)) answeredSinceTheLastJobEnded = false;
    const opened = record.kind === 'decision-answered' ? kindByDecisionId.get(record.decisionId) : undefined;
    if (opened?.kind === AGENT_CONFIG_DECISION && opened.ticketIds.includes(ticketId)) answeredSinceTheLastJobEnded = true;
  }
  return answeredSinceTheLastJobEnded;
}

/**
 * V13 before every launch on a branch, resumes included: the tickets of live worktree jobs whose branch past its target, or whose worktree,
 * changes agent configuration, and those with the decision still open. Read outside the lock.
 */
function ticketIdsTouchingAgentConfigOf(context: JobLaunchContext, jobs: readonly Readonly<Job>[]): string[] {
  return jobs.filter(isWorktreeJob).filter((job) => {
    const worktree = worktreeOf(context.workspace, job);
    if (!existsSync(worktree)) return false;
    return agentConfigTouchedBeforeLaunch(worktree, job.target ?? context.mainLine, context.platformPorts.dataFolders).verdict === 'refused';
  }).map(ticketIdOf);
}

/** In the hold: each observed hit opens its decision once, and holds the ticket until User answered it. */
function holdAgentConfigHits(change: TrackerChange, context: JobLaunchContext, touchingTicketIds: readonly string[]): { held: string[]; logged: LogRecord[] } {
  const hold: HoldContext = {
    change, context, pipelineStored: false, logged: []
  };
  const held = new Set<string>();
  for (const ticketId of touchingTicketIds) {
    const job = change.board.jobs().find((candidate) => candidate.ticketIds.includes(ticketId));
    if (agentConfigHitIsSettled(change.board, ticketId)) continue;
    if (job !== undefined) openAgentConfigDecision(hold, job);
  }
  for (const decision of change.board.decisions()) {
    if (decision.kind === AGENT_CONFIG_DECISION) decision.ticketIds.forEach((ticketId) => held.add(ticketId));
  }
  return { held: [...held].sort(), logged: hold.logged };
}

interface RedHandoffCause extends Pick<RedHandoffFacts, 'kind' | 'name' | 'command' | 'fixCommand' | 'exitCode' | 'fullLogPath' | 'mergedTip'> {
  output: string;
}

/**
 * A red gate or Customs check never ends the job: the Baton pass is written in its folder and the job interrupted `handoff-red`, which the
 * lifecycle resumes in the same session while its cycle has resumes left and parks after.
 */
function interruptOnRedHandoff(hold: HoldContext, job: Readonly<Job>, cause: RedHandoffCause): void {
  const jobFolder = jobFolderOf(hold.context.workspace, job);
  const earlier = RedHandoff.redHandoffFactsOf(jobFolder);
  const { output, ...named } = cause;
  mkdirSync(jobFolder, { recursive: true });
  RedHandoff.writeRedHandoff(jobFolder, {
    ...named,
    commit:              GitProcess.resolvedCommitOf(worktreeOf(hold.context.workspace, job), 'HEAD', GitWorktrees.ceilingOf(worktreeOf(hold.context.workspace, job))) ?? '',
    batonPassPath:       RedHandoff.batonPassPathOf(jobFolder),
    resume:              (earlier?.resume ?? 0) + 1,
    resumesAllowed:      LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
    interruptedInstance: job.watcherInstance,
  }, output);
  hold.logged.push(...hold.change.board.interruptJob(job.id, HANDOFF_RED_INTERRUPTION, hold.change.at).logged);
}

function workingOffARedHandoff(context: Pick<JobLaunchContext, 'workspace'>, job: Readonly<Job>): boolean {
  return RedHandoff.redHandoffFactsOf(jobFolderOf(context.workspace, job)) !== null;
}

/** What the last red handoff named, carried into the next one when a resumed session runs past its grace. */
function redHandoffCauseOf(context: Pick<JobLaunchContext, 'workspace'>, job: Readonly<Job>): Omit<RedHandoffCause, 'output'> {
  const facts = RedHandoff.redHandoffFactsOf(jobFolderOf(context.workspace, job));
  return {
    kind:        facts?.kind ?? 'gate',
    name:        facts?.name ?? '',
    command:     facts?.command ?? null,
    fixCommand:  facts?.fixCommand ?? null,
    exitCode:    facts?.exitCode ?? null,
    fullLogPath: facts?.fullLogPath ?? null,
  };
}

/** The Customs checks a resumed session can put right in its own worktree: a dirty worktree, no commit, missing or stale gate claims. */
const RESUMABLE_CUSTOMS_CHECKS: readonly string[] = ['V3', 'V4', 'V15'];

/** The phase whose gates judge a job's worktree: a review job's are the review phase's, a build job's the build phase's. */
function gatePhaseOfJob(job: Readonly<Job>): GatePhase {
  return job.kind === REVIEW_JOB_KIND ? 'review' : 'build';
}

/**
 * Records a judged gate run on the row, and routes a run that did not pass: a failed prepare step or a gate that cannot run opens its
 * incident and stops the job, a red gate is the session's red handoff. Returns whether the run passed.
 */
function settleJudgedGate(hold: HoldContext, job: Readonly<Job>, gate: Extract<GateProgress, { verdict: 'judged' }>, stamp: GateRunStamp | null): boolean {
  const { board, at } = hold.change;
  board.recordPipelineJudgedBy(ticketIdOf(job), gate.outcome === 'passed' ? gate.treeId : null, stamp, at);
  if (gate.outcome === 'setup-failed') {
    openIncidentFor(hold, job, 'setup-failed', { step: PREPARE_STEP_NAME });
    endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
    return false;
  }
  if (gate.ran) hold.logged.push(...board.recordGateRan({ tree: gate.treeId, outcome: gate.outcome, cached: false }, at).logged);
  if (gate.outcome === 'cannot-run') {
    openIncidentFor(hold, job, 'gate-cannot-run', { tree: gate.treeId, gate: gate.step ?? '' });
    endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.gateCannotRun });
    return false;
  }
  if (gate.outcome === 'failed') {
    hold.context.log(`The ${gate.step ?? ''} gate of job ${job.id} (#${ticketIdOf(job)}) is red on ${gate.treeId}; its output is in ${GATE_LOG_FILE}.`);
    const pipelineGate = gate.manifest?.gates.find((candidate) => candidate.name === gate.step);
    interruptOnRedHandoff(hold, job, {
      kind:        'gate',
      name:        gate.step ?? '',
      command:     pipelineGate?.run ?? null,
      fixCommand:  pipelineGate?.fix ?? null,
      exitCode:    gate.exitCode ?? null,
      fullLogPath: join(jobFolderOf(hold.context.workspace, job), GATE_LOG_FILE),
      output:      gate.output,
    });
    return false;
  }
  return true;
}

/** The review job recorded its review already: its session is back from a resume that `merging-main` sent it on. */
function reviewPassIsSettled(board: Board, job: Readonly<Job>): boolean {
  let launched = false;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched' && record.jobId === job.id) launched = true;
    if (launched && record.kind === 'review-recorded' && record.ticketId === ticketIdOf(job)) return true;
  }
  return false;
}

/** With merge approval on, a gated build with no review phase merges the target into its worktree before its ticket waits for User's Merge. */
function buildMergesMainFirst(board: Board): boolean {
  return board.pipeline()?.review === undefined && board.mergeApprovalIsOn();
}

/** The builder's verified work: its Handoff written from the report, the job ended `built` and the ticket moved `in-review`. */
function settleBuilt(hold: HoldContext, job: Readonly<Job>, report: unknown, headCommit: string): void {
  const { board, at } = hold.change;
  const ticketBody = board.tickets().find((candidate) => candidate.frontmatter.id === ticketIdOf(job))?.body ?? '';
  const body = { text: bodyWithHandoffOf(ticketBody, handoffSectionOf(report)), appends: false };
  hold.logged.push(...board.editTicket(ticketIdOf(job), { body, allowsPastPending: true }, at).logged);
  endJob(hold, job, { outcome: 'built', commit: headCommit });
  hold.logged.push(...board.moveTicket(ticketIdOf(job), 'in-review', { checksLegality: true, branch: branchOf(job), commit: headCommit }, at).logged);
}

function settleGate(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation): void {
  const { gate } = observation;
  if (gate.verdict !== 'judged' || !hold.pipelineStored) return;
  const { board, at } = hold.change;
  const phase = gatePhaseOfJob(job);
  if (!gate.ran && !board.greenIsCurrent(ticketIdOf(job), gate.treeId, phase)) {
    const jobFolder = jobFolderOf(hold.context.workspace, job);
    mkdirSync(jobFolder, { recursive: true });
    writeFileAtomically(join(jobFolder, REGATE_MARKER_FILE), `${gate.treeId}\n`);
    return;
  }
  // A run stamps the manifest it ran under; a review that ran nothing keeps the green the hold just found current.
  if (!settleJudgedGate(hold, job, gate, gate.ran ? gate.manifest : board.gateRunStampOf(phase))) return;
  const headCommit = String(reportFieldOf(observation.report, 'headCommit'));
  if (job.kind === REVIEW_JOB_KIND) {
    if (reviewPassIsSettled(board, job)) {
      hold.logged.push(...board.moveJob(job.id, 'merging-main', at).logged);
      return;
    }
    const start = readJobStart(jobFolderOf(hold.context.workspace, job));
    hold.logged.push(...ReviewOutcome.settleReviewPass({
      board,
      at,
      job,
      report:            observation.report,
      worktreePath:      worktreeOf(hold.context.workspace, job),
      reviewStartCommit: start?.startCommit ?? headCommit,
      headTree:          gate.treeId,
      jobFolder:         jobFolderOf(hold.context.workspace, job),
      limits:            LIFECYCLE_LIMITS,
      decisionWordingOf: hold.context.decisionWordingOf,
    }).logged);
    return;
  }
  if (buildMergesMainFirst(board)) {
    hold.logged.push(...board.moveJob(job.id, 'merging-main', at).logged);
    return;
  }
  settleBuilt(hold, job, observation.report, headCommit);
  // A pipeline without a review phase lands a gated build directly: it waits in review only for its Airlock. A green the pipeline changed
  // under while it ran is not current: the ticket waits unqueued, and the Airlock sweep gates it again.
  const queuesAtOnce = board.pipeline()?.review === undefined && board.greenIsCurrent(ticketIdOf(job), gate.treeId, board.greenPhaseOf(ticketIdOf(job)));
  if (queuesAtOnce) hold.logged.push(...board.queueTicketForMerge(ticketIdOf(job), job.target ?? hold.context.mainLine, gate.treeId, at).logged);
}

function mainMergeFileOf(trackerDirectory: string, job: Readonly<Job>, name: string, round: number): string {
  return join(WatcherFleet.jobFolderOf(trackerDirectory, job.id), `${name}${instanceSuffixOf(round)}${JSON_EXTENSION}`);
}

/** A round's merge, in a process Watcher folder of its own beside its settlement. */
function mainMergeIntoTreeFilesOf(round: number): MergeIntoTreeFiles {
  return { watcherFolder: `${MAIN_MERGE_WATCHER_FOLDER}${instanceSuffixOf(round)}`, settlementFile: `${MAIN_MERGE_FILES.settlement}${instanceSuffixOf(round)}${JSON_EXTENSION}` };
}

/** A round's gate run: the job's own phase, in folders prefixed apart from the gate runs of its session. */
function mainMergeGateRunOf(job: Readonly<Job>, round: number): GateRunPlace {
  return { phase: gatePhaseOfJob(job), watcherInstance: round, folderPrefix: MAIN_MERGE_FOLDER_PREFIX };
}

function conflictReReviewerOf(jobs: readonly Readonly<Job>[], job: Readonly<Job>): Readonly<Job> | undefined {
  return jobs.find((candidate) => candidate.kind === 'merge-agent' && candidate.parentJobId === job.id);
}

/** The conflict re-reviewer of the newest conflict is launched once, as the conflict's round, and again in place of one that was replaced. */
type ConflictReReviewNeed = { verdict: 'none' } | { verdict: 'launch'; attempt: number } | { verdict: 'failed' };

/** The outcome the newest conflict re-reviewer launched under the job with this attempt ended with; `null` when none was launched. */
function conflictReReviewEndingOf(records: readonly LogRecord[], parentJobId: string, attempt: number): string | null {
  const reReviewerJobIds = new Set<string>();
  let outcome: string | null = null;
  for (const record of records) {
    if (record.kind === 'job-launched' && record.fields.parentJobId === parentJobId && record.fields.role === CONFLICT_RE_REVIEWER_ROLE
      && record.fields.attempt === attempt) reReviewerJobIds.add(record.jobId);
    if (record.kind === 'job-ended' && reReviewerJobIds.has(record.jobId)) ({ outcome } = record.fields);
  }
  return outcome;
}

/**
 * A resolution of the newest conflict that changed more lines than `airlock.reReview.thresholdLines`, or that git cannot measure, is
 * re-reviewed once; with no `airlock.reReview` it never is. A re-review that ended other than `reviewed` or `replaced` failed.
 */
function conflictReReviewNeedOf(board: Board, job: Readonly<Job>, resolution: MainMergeResolution | null): ConflictReReviewNeed {
  const thresholdLines = board.pipeline()?.airlock?.reReview?.thresholdLines;
  if (resolution === null || thresholdLines === undefined) return { verdict: 'none' };
  if (resolution.lines !== null && resolution.lines <= thresholdLines) return { verdict: 'none' };
  const ending = conflictReReviewEndingOf(board.logRecordsSoFar(), job.id, resolution.conflictRound);
  if (ending === null || ending === 'replaced') return { verdict: 'launch', attempt: resolution.conflictRound };
  return ending === 'reviewed' ? { verdict: 'none' } : { verdict: 'failed' };
}

/** The ticket's worktree is up to date with the target and gated green: the job ends, and its ticket waits in the queue for User's Merge. */
function finishMainMerge(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation, treeId: string): void {
  const { board, at } = hold.change;
  const ticketId   = ticketIdOf(job);
  const headCommit = MergeRun.headOf(worktreeOf(hold.context.workspace, job)) ?? '';
  if (job.kind === REVIEW_JOB_KIND) endJob(hold, job, { outcome: 'reviewed', commit: headCommit });
  else settleBuilt(hold, job, observation.report, headCommit);
  if (board.greenIsCurrent(ticketId, treeId, board.greenPhaseOf(ticketId))) {
    hold.logged.push(...board.queueTicketForMerge(ticketId, job.target ?? hold.context.mainLine, treeId, at).logged);
  }
}

/**
 * The tree a round leaves, holding the target's tip: the newest conflict's resolution goes to a conflict re-reviewer first when it needs
 * one; then a green current on the tree in the job's phase finishes the job, and any other tree is gated before.
 */
function settleMergedTree(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation, reading: MainMergeReading, treeId: string): void {
  const { board, at } = hold.change;
  const need = conflictReReviewNeedOf(board, job, reading.resolution);
  if (need.verdict === 'launch') {
    hold.logged.push(...board.launchJob({
      kind: 'merge-agent', role: CONFLICT_RE_REVIEWER_ROLE, ticketIds: job.ticketIds, parentJobId: job.id, attempt: need.attempt, target: job.target,
    }, at).logged);
    return;
  }
  if (need.verdict === 'failed') {
    endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.reReviewFailed });
    return;
  }
  if (board.greenIsCurrent(ticketIdOf(job), treeId, gatePhaseOfJob(job))) {
    finishMainMerge(hold, job, observation, treeId);
    return;
  }
  const markerPath = mainMergeFileOf(hold.context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.gateRequired, job.watcherInstance);
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileAtomically(markerPath, `${JSON.stringify({ treeId })}\n`);
}

/**
 * The conflict re-reviewer under the job: past its budget and grace it is stopped; once its report reached Customs and its session ended,
 * a report that holds ends it `reviewed`, and any other ends it `does-not-hold`. A stopped one ends `stopped` once its session is gone.
 */
function settleConflictReReviewer(hold: HoldContext, reReviewer: Readonly<Job>, reading: ConflictReReviewReading | null): void {
  const { board, at } = hold.change;
  if (reading === null) return;
  if (reReviewer.state === 'running' && reading.calls >= callBudgetOf(reReviewer) + WIND_DOWN_GRACE_CALLS) {
    hold.logged.push(...board.moveJob(reReviewer.id, 'stopping', at).logged);
    return;
  }
  if (!reading.sessionEnded) return;
  if (reReviewer.state === 'stopping') {
    endJob(hold, reReviewer, userStopEndingOf(reReviewer) ?? { outcome: 'stopped', cause: BUILD_JOB_CAUSES.outOfCalls });
    return;
  }
  if (reReviewer.state !== 'in-customs' || reading.verdict === null) return;
  if (reading.verdict.verdict === 'holds') endJob(hold, reReviewer, { outcome: 'reviewed' });
  else endJob(hold, reReviewer, { outcome: 'does-not-hold', cause: BUILD_JOB_CAUSES.reReviewFailed });
}

/** A job stopped while its conflict re-reviewer works stops the re-reviewer first, and ends once that one ended. */
function stopTheConflictReReviewer(hold: HoldContext, reReviewer: Readonly<Job>, reading: ConflictReReviewReading | null): void {
  const { board, at } = hold.change;
  if (reReviewer.state !== 'stopping') {
    hold.logged.push(...board.moveJob(reReviewer.id, 'stopping', at).logged);
    return;
  }
  if (reading?.sessionEnded === true) endJob(hold, reReviewer, { outcome: 'stopped', cause: STOPPED_BY_USER_CAUSE });
}

/** A conflict goes back to the job's own session, the ticket's last worker, as a red handoff naming the target tip and the conflicted files. */
function sendConflictToTheSession(hold: HoldContext, job: Readonly<Job>, conflict: Extract<MainMergeStep, { verdict: 'conflicted' }>): void {
  const conflictPath = mainMergeFileOf(hold.context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.conflict, job.watcherInstance);
  mkdirSync(dirname(conflictPath), { recursive: true });
  const kept: MainMergeConflict = { targetTip: conflict.targetTip, branchTip: conflict.branchTip, conflictedFiles: conflict.conflictedFiles };
  writeFileAtomically(conflictPath, `${JSON.stringify(kept)}\n`);
  interruptOnRedHandoff(hold, job, {
    kind:        'merge-conflict',
    name:        job.target ?? hold.context.mainLine,
    command:     null,
    fixCommand:  null,
    exitCode:    null,
    fullLogPath: null,
    mergedTip:   conflict.targetTip,
    output:      conflict.conflictedFiles.join('\n'),
  });
}

/** In the hold, for a job in `merging-main`: its conflict re-reviewer first, then the round's step. */
function settleMainMerge(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation): void {
  const reading = observation.mainMerge;
  if (reading === null || !hold.pipelineStored) return;
  const reReviewer = conflictReReviewerOf(hold.change.board.jobs(), job);
  if (reReviewer !== undefined) {
    settleConflictReReviewer(hold, reReviewer, observation.conflictReReview);
    return;
  }
  const { step } = reading;
  switch (step.verdict) {
    case 'merge-failed':
      openIncidentFor(hold, job, 'setup-failed', { step: MAIN_MERGE_WATCHER_FOLDER, reason: step.reason });
      endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
      return;
    case 'conflicted':
      sendConflictToTheSession(hold, job, step);
      return;
    case 'up-to-date':
    case 'merged':
      settleMergedTree(hold, job, observation, reading, step.treeId);
      return;
    case 'gated':
      if (settleJudgedGate(hold, job, step.gate, step.gate.manifest)) finishMainMerge(hold, job, observation, step.gate.treeId);
      return;
    default:
  }
}

/**
 * The review ends `does-not-hold` and its ticket goes back `in-progress`, as a review whose claim did not hold: the builder's session is
 * resumed with the handover kept in the review's job folder, and the return counts in its handoff cycle, which parks the ticket past its resumes.
 */
function returnToBuilder(hold: HoldContext, job: Readonly<Job>, cause: string): void {
  const { board, at } = hold.change;
  endJob(hold, job, { outcome: 'does-not-hold', cause });
  hold.logged.push(...board.moveTicket(ticketIdOf(job), 'in-progress', { checksLegality: true }, at).logged);
}

/** The red gate on the merged tree, written as the Baton pass of a red handoff in the review's job folder, which the resumed builder reads. */
function returnRedTargetGate(hold: HoldContext, job: Readonly<Job>, gate: Extract<GateProgress, { verdict: 'judged' }>): void {
  const jobFolder = jobFolderOf(hold.context.workspace, job);
  const pipelineGate = gate.manifest?.gates.find((candidate) => candidate.name === gate.step);
  mkdirSync(jobFolder, { recursive: true });
  RedHandoff.writeRedHandoff(jobFolder, {
    kind:                'gate',
    name:                gate.step ?? '',
    command:             pipelineGate?.run ?? null,
    fixCommand:          pipelineGate?.fix ?? null,
    commit:              MergeRun.headOf(worktreeOf(hold.context.workspace, job)) ?? '',
    exitCode:            gate.exitCode ?? null,
    batonPassPath:       RedHandoff.batonPassPathOf(jobFolder),
    fullLogPath:         join(jobFolder, GATE_LOG_FILE),
    resume:              0,
    resumesAllowed:      LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    callBudget:          DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET,
    interruptedInstance: job.watcherInstance,
  }, gate.output);
  returnToBuilder(hold, job, BUILD_JOB_CAUSES.targetGateRed);
}

/** In the hold, once a review job is installed: its reviewer starts only on a branch that holds the target tip it was checked against. */
function settleTargetCatchUp(hold: HoldContext, job: Readonly<Job>, catchUp: TargetCatchUp): void {
  const { board, at } = hold.change;
  switch (catchUp.verdict) {
    case 'up-to-date':
      hold.logged.push(...board.moveJob(job.id, 'running', at).logged);
      return;
    case 'merge-failed':
      openIncidentFor(hold, job, 'setup-failed', { step: TARGET_MERGE_WATCHER_FOLDER, reason: catchUp.reason });
      endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
      return;
    case 'conflicted': {
      const jobFolder = jobFolderOf(hold.context.workspace, job);
      mkdirSync(jobFolder, { recursive: true });
      writeFileAtomically(join(jobFolder, JOB_FILES.targetConflict), `${JSON.stringify({ targetTip: catchUp.targetTip, conflictedFiles: catchUp.conflictedFiles })}\n`);
      returnToBuilder(hold, job, BUILD_JOB_CAUSES.targetConflict);
      return;
    }
    case 'gated': {
      const { gate } = catchUp;
      if (gate.outcome === 'setup-failed') {
        openIncidentFor(hold, job, 'setup-failed', { step: PREPARE_STEP_NAME });
        endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
        return;
      }
      if (gate.ran) hold.logged.push(...board.recordGateRan({ tree: gate.treeId, outcome: gate.outcome, cached: false }, at).logged);
      if (gate.outcome === 'passed') hold.logged.push(...board.moveJob(job.id, 'running', at).logged);
      else if (gate.outcome === 'failed') returnRedTargetGate(hold, job, gate);
      else {
        openIncidentFor(hold, job, 'gate-cannot-run', { tree: gate.treeId, gate: gate.step ?? '' });
        endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.gateCannotRun });
      }
      return;
    }
    default:
  }
}

/** The handover of the ticket's newest ended review when it ended on its target catch-up; `null` for any other ending. */
function targetCatchUpHandoverOf(trackerDirectory: string, logRecords: readonly LogRecord[], ticketId: string): TargetCatchUpHandover | null {
  const reviewJobIds = new Set<string>();
  let newestEnded: { jobId: string; cause: string } | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.fields.kind === REVIEW_JOB_KIND && record.fields.ticketIds.includes(ticketId)) reviewJobIds.add(record.jobId);
    if (record.kind === 'job-ended' && reviewJobIds.has(record.jobId)) newestEnded = { jobId: record.jobId, cause: record.fields.cause ?? '' };
  }
  if (newestEnded === null || !TARGET_CATCH_UP_CAUSES.includes(newestEnded.cause)) return null;
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, newestEnded.jobId);
  if (newestEnded.cause === BUILD_JOB_CAUSES.targetGateRed) {
    const redHandoff = RedHandoff.redHandoffFactsOf(jobFolder);
    return redHandoff === null ? null : { kind: 'gate-red', redHandoff };
  }
  const conflict = readJsonFile<{ targetTip: string; conflictedFiles: string[] }>(join(jobFolder, JOB_FILES.targetConflict));
  return conflict === null ? null : { kind: 'conflict', ...conflict };
}

/** A job User stopped ends `stopped`; one User freshened ends `replaced`, so the next attempt starts on the same worktree. */
function userStopEndingOf(job: Readonly<Job>): Parameters<Board['endJob']>[1] | null {
  if (job.stopRequest === 'fresh') return { outcome: 'replaced', cause: FRESH_AGENT_CAUSE };
  return job.stopRequest === 'stop' ? { outcome: 'stopped', cause: STOPPED_BY_USER_CAUSE } : null;
}

function applyObservation(hold: HoldContext, observation: BuildJobObservation): void {
  const { board, at } = hold.change;
  const job = board.jobById(observation.jobId);
  if (job === undefined) return;
  if (observation.sandboxRefusal !== null && STATES_A_SANDBOX_REFUSAL_ENDS.has(job.state)) {
    openIncidentFor(hold, job, 'sandbox-unavailable', { step: observation.sandboxRefusal.step, reason: observation.sandboxRefusal.reason });
    endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.sandboxUnavailable });
    return;
  }
  switch (job.state) {
    case 'launching': {
      hold.logged.push(...board.moveJob(job.id, 'preparing', at).logged);
      if (job.kind === REVIEW_JOB_KIND) {
        const label = board.pipeline()?.review?.name;
        hold.logged.push(...board.startReviewBar(ticketIdOf(job), { round: job.attempt, owner: job.id, ...(label === undefined ? {} : { label }) }, at).logged);
        return;
      }
      const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === ticketIdOf(job));
      if (ticket?.frontmatter.status !== 'pending') return;
      hold.logged.push(...board.moveTicket(ticketIdOf(job), 'in-progress', { checksLegality: true, branch: branchOf(job) }, at).logged);
      return;
    }
    case 'preparing':
      if (observation.setup === 'worktree-failed' || observation.setup === 'install-failed') {
        openIncidentFor(hold, job, 'setup-failed', { step: observation.setup === 'worktree-failed' ? 'worktree' : 'install' });
        endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
      } else if (observation.setup === 'worktree-unnormalised') {
        openIncidentFor(hold, job, 'setup-failed', { step: 'worktree', cause: 'line-ending-normalisation' });
        endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
      } else if (observation.setup === 'installed' && job.kind === REVIEW_JOB_KIND) {
        settleTargetCatchUp(hold, job, observation.targetCatchUp);
      } else if (observation.setup === 'installed') {
        hold.logged.push(...board.moveJob(job.id, 'running', at).logged);
      }
      return;
    case 'running':
      if (observation.calls >= attemptCallBudgetOf(hold.context.workspace.trackerDirectory, job) + WIND_DOWN_GRACE_CALLS) {
        // A resumed session past its grace counts as red again; only a first attempt opens `out-of-calls`.
        if (!workingOffARedHandoff(hold.context, job)) openIncidentFor(hold, job, 'out-of-calls', { calls: String(observation.calls) });
        hold.logged.push(...board.moveJob(job.id, 'stopping', at).logged);
      }
      return;
    case 'stopping': {
      const reReviewer = conflictReReviewerOf(board.jobs(), job);
      if (reReviewer !== undefined) {
        stopTheConflictReReviewer(hold, reReviewer, observation.conflictReReview);
        return;
      }
      if (observation.agentEnd === null) return;
      if (job.stopRequest === undefined && workingOffARedHandoff(hold.context, job)) {
        const output = `The resumed session passed its ${RED_HANDOFF_RESUME_CALL_BUDGET} calls and the ${WIND_DOWN_GRACE_CALLS}-call grace without a report.`;
        interruptOnRedHandoff(hold, job, { ...redHandoffCauseOf(hold.context, job), output });
        return;
      }
      endJob(hold, job, userStopEndingOf(job) ?? { outcome: 'stopped', cause: BUILD_JOB_CAUSES.outOfCalls });
      return;
    }
    case 'in-customs':
      verifyAndRoute(hold, job, observation);
      return;
    case 'gating':
      settleGate(hold, job, observation);
      return;
    case 'merging-main':
      settleMainMerge(hold, job, observation);
      return;
    default:
  }
}

/** In the hold, after the relayed requests and Watcher events, before the policy: so a ticket finished here gets its review job in this hold. */
function applyBuildJobObservations(change: TrackerChange, context: JobLaunchContext, observations: readonly BuildJobObservation[]): LogRecord[] {
  const hold: HoldContext = {
    change, context, pipelineStored: change.board.pipeline() !== null, logged: []
  };
  for (const observation of observations) applyObservation(hold, observation);
  return hold.logged;
}

/**
 * Whether a build job stands where only another pass moves it: launching, prepared, a line refused, or its gate judged from the cache. Nothing a later
 * observation reads changes there, so the fingerprint alone would leave it waiting.
 */
function someBuildJobAwaitsAPass(board: Board, observations: readonly BuildJobObservation[]): boolean {
  return observations.some((observation) => {
    const state = board.jobById(observation.jobId)?.state;
    if (state === 'launching') return true;
    if (state !== undefined && STATES_A_SANDBOX_REFUSAL_ENDS.has(state) && observation.sandboxRefusal !== null) return true;
    if (state === 'preparing') {
      return observation.setup !== 'creating-worktree' && observation.setup !== 'installing' && !TARGET_CATCH_UP_WAITS.includes(observation.targetCatchUp.verdict);
    }
    if (state === 'merging-main') {
      const job = board.jobById(observation.jobId);
      // A re-reviewer the hold just ended, or launched, leaves the round where only the next pass moves it on, or its own Watcher does.
      if (job === undefined || conflictReReviewerOf(board.jobs(), job) !== undefined) return false;
      return observation.mainMerge !== null && !MAIN_MERGE_WAITS.includes(observation.mainMerge.step.verdict);
    }
    // A conflict re-reviewer that ended in this pass leaves its stopped job for the next one.
    if (state === 'stopping' && observation.conflictReReview?.sessionEnded === true) return true;
    return state === 'gating' && observation.gate.verdict === 'judged';
  });
}

/** The tickets whose newest ended job failed `attribution`: each shows the notice until its next job ends. */
function attributionTicketIdsOf(records: readonly LogRecord[]): string[] {
  const ticketIdsByJobId = new Map<string, readonly string[]>();
  const attributed = new Set<string>();
  for (const record of records) {
    if (record.kind === 'job-launched') ticketIdsByJobId.set(record.jobId, record.fields.ticketIds);
    if (record.kind !== 'job-ended') continue;
    for (const ticketId of ticketIdsByJobId.get(record.jobId) ?? []) {
      if (record.fields.cause === BUILD_JOB_CAUSES.attribution) attributed.add(ticketId);
      else attributed.delete(ticketId);
    }
  }
  return [...attributed].sort();
}

/** `worktree` is the ticket's own unless named, as an Airlock agent names the Airlock worktree it works in. */
function sandboxFactsFor(context: JobLaunchContext, job: Readonly<Job>, worktree: string = worktreeOf(context.workspace, job)): SandboxFacts {
  const { workspace } = context;
  return WorkerProfiles.sandboxFactsOf({
    repositoryRoot:   workspace.rootDirectory,
    dataFolder:       workspace.trackerDirectory,
    monitorFolder:    context.monitorFolder,
    homeDirectory:    context.homeDirectory,
    worktree,
    ownBranch:        branchOf(job),
    mainLine:         context.mainLine,
    groupPrefix:      context.groupTargetPrefix,
    hatchDirectory:   HatchInbox.hatchDirectoryOf(workspace.rootDirectory, job.id),
    sandboxDenyShape: context.agentAdapter.sandboxDenyShape,
    credentialPaths:  context.agentAdapter.credentialPathsOf(context.homeDirectory),
    guardCommand:     guardCommandOf(context),
    ...cacheFolderFactsOf(context),
  });
}

function guardCommandOf(context: Pick<JobLaunchContext, 'programCommand' | 'workspace'>): readonly string[] | null {
  const verdict = GuardCommand.guardCommandOf(context.programCommand, context.workspace.rootDirectory);
  return verdict.verdict === 'found' ? verdict.command : null;
}

/** Called for a launch whose guard renders no hook, so the owner reads why the job's Bash, PowerShell and WebFetch calls are denied. */
function logUnstartableGuard(context: Pick<JobLaunchContext, 'programCommand' | 'workspace' | 'log'>, job: Readonly<Job>): void {
  const verdict = GuardCommand.guardCommandOf(context.programCommand, context.workspace.rootDirectory);
  const reason = verdict.verdict === 'refused'
    ? GuardCommand.refusalReasonOf(verdict, context.workspace.rootDirectory)
    : 'its command is not an absolute runtime path';
  context.log(`The network guard of job ${job.id} (#${ticketIdOf(job)}) cannot start, so its Bash, PowerShell and WebFetch calls are denied: ${reason}.`);
}

/** What a worker's stored `writes` are judged by at launch: the Overseer's `PATH` and the host's path rules. */
function cacheFolderFactsOf(context: SandboxContext): Pick<SandboxFactsRequest, 'executableSearchPath' | 'cacheFolderStyle'> {
  const { dataFolders, launchEnvironment } = context.platformPorts;
  return { executableSearchPath: launchEnvironment.searchFoldersOf(context.inheritedEnvironment), cacheFolderStyle: dataFolders };
}

/** The profile a gate or prepare step runs under in `worktree`: the step's own network and `writes`, and the job's denies. */
type SandboxContext = Pick<JobLaunchContext, 'homeDirectory' | 'inheritedEnvironment' | 'platformPorts'>;

/** The portable git settings ride along, so a gate's own git reaches a long path as the Overseer's does. */
function gateEnvironmentOf(context: SandboxContext): Record<string, string> {
  const gitSettings = GitArgumentsUtil.environmentOf(PORTABLE_GIT_SETTINGS);
  return GateRun.gateEnvironmentOf(context.platformPorts.launchEnvironment.launchEnvironmentOf(context.inheritedEnvironment, gitSettings));
}

function processSandboxRequestOf(context: SandboxContext, facts: SandboxFacts, confinement: GateConfinement): ProcessSandboxRequest {
  const adminFolder = GitProcess.run(facts.worktree, ['rev-parse', '--absolute-git-dir'], 'hooks-off', undefined, GitWorktrees.ceilingOf(facts.worktree));
  return {
    worktree:             facts.worktree,
    worktreeAdminFolder:  GitProcess.succeeded(adminFolder) ? adminFolder.standardOutput.trim() : null,
    homeDirectory:        context.homeDirectory,
    temporaryDirectory:   context.platformPorts.dataFolders.temporaryFolderOf(gateEnvironmentOf(context)),
    cachePaths:           confinement.writes,
    executableSearchPath: facts.executableSearchPath,
    cacheFolderStyle:     facts.cacheFolderStyle,
    deniedWritableRoots:  WorkerProfiles.deniedWritableRootsOf(facts),
    deniedReadableRoots:  WorkerProfiles.deniedReadableRootsOf(facts),
    network:              confinement.network,
  };
}

/** What a process Watcher runs: its stored line, its confinement, and a gate's `in` folder, relative to the worktree. */
interface ProcessWatcherStep {
  line:        string;
  confinement: GateConfinement;
  subfolder:   string | null;
}

/** A Watcher already claimed is left alone; a spawn the system refused has no process id. */
type ProcessWatcherSpawn = { verdict: 'already-claimed' } | { verdict: 'refused' } | { verdict: 'spawned'; processId: number | undefined };

/** Kept in the job folder for the next pass's hold, which opens the incident; the refused line never started. */
function recordSandboxRefusal(context: JobLaunchContext, job: Readonly<Job>, refusal: SandboxRefusal): void {
  const jobFolder = jobFolderOf(context.workspace, job);
  mkdirSync(jobFolder, { recursive: true });
  writeFileAtomically(join(jobFolder, JOB_FILES.sandboxRefusal), `${JSON.stringify(refusal)}\n`);
  context.log(`The ${refusal.step} line of job ${job.id} (#${ticketIdOf(job)}) did not run: ${refusal.reason}.`);
}

/** Makes the denied roots a launch in the job's worktree needs; when one cannot be made, records the refusal and answers true, so `step` never starts. */
function deniedRootRefusalRecorded(context: JobLaunchContext, job: Readonly<Job>, step: string): boolean {
  const reason = WorkerProfiles.unmadeDeniedRootRefusalOf({ worktree: worktreeOf(context.workspace, job), sandboxDenyShape: context.agentAdapter.sandboxDenyShape });
  if (reason === null) return false;
  recordSandboxRefusal(context, job, { step, reason });
  return true;
}

function sandboxRefusalOf(context: JobLaunchContext, job: Readonly<Job>): SandboxRefusal | null {
  try {
    return JSON.parse(readFileSync(join(jobFolderOf(context.workspace, job), JOB_FILES.sandboxRefusal), 'utf8')) as SandboxRefusal;
  } catch {
    return null;
  }
}

function spawnProcessWatcher(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, folderName: string, step: ProcessWatcherStep): ProcessWatcherSpawn {
  const { confinement, subfolder } = step;
  const jobFolder = jobFolderOf(context.workspace, job);
  const watcherFolder = join(jobFolder, folderName);
  if (WatcherFleet.livenessOf(context.platformPorts, watcherFolder, PROCESS_WATCHER_INSTANCE).verdict !== 'unclaimed') return { verdict: 'already-claimed' };
  const worktree = worktreeOf(context.workspace, job);
  const workingDirectory = subfolder === null ? worktree : join(worktree, subfolder);
  const { gateConfinement, shellLine } = context.platformPorts;
  const runRefusal = shellLine.runRefusalOf(workingDirectory);
  if (runRefusal !== null) {
    recordSandboxRefusal(context, job, { step: folderName, reason: GateRun.runRefusalReasonOf(runRefusal, workingDirectory) });
    return { verdict: 'refused' };
  }
  if (deniedRootRefusalRecorded(context, job, folderName)) return { verdict: 'refused' };
  const spawnRequest = shellLine.spawnRequestOf(step.line, lineStatusFileOf(jobFolder, folderName));
  const planOf = () => ProcessWatcherSandbox.planOf(processSandboxRequestOf(context, sandboxFactsFor(context, job), confinement), join(watcherFolder, JOB_FILES.profile));
  const line = confinedLineOf(gateConfinement, planOf, spawnRequest.argv);
  if (line.verdict === 'refused') {
    recordSandboxRefusal(context, job, { step: folderName, reason: line.reason });
    return { verdict: 'refused' };
  }
  const launched = launchProcessWatcher(context, trackerId, job, folderName, {
    workingDirectory, argv: line.argv, verbatimArguments: spawnRequest.verbatimArguments, environment: gateEnvironmentOf(context),
  });
  if (launched.verdict === 'unfit-endpoint') {
    recordSandboxRefusal(context, job, { step: folderName, reason: launched.reason });
    return { verdict: 'refused' };
  }
  const availability = gateConfinement.availability();
  const confinementWords = availability.verdict === 'confined' ? ` under ${availability.mechanism}` : ', unconfined by design';
  context.log(`Spawned the ${folderName} Watcher of job ${job.id} (#${ticketIdOf(job)})${confinementWords}.`);
  return { verdict: 'spawned', processId: launched.processId };
}

interface ProcessWatcherLaunch {
  workingDirectory:   string;
  argv:               readonly string[];
  verbatimArguments?: boolean;
  environment:        Record<string, string>;
}

type ProcessWatcherLaunchOutcome = { verdict: 'unfit-endpoint'; reason: string } | { verdict: 'spawned'; processId: number | undefined };

/** Writes the launch file of the step's process Watcher and starts it; the caller has already judged what the line may reach. */
function launchProcessWatcher(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, folderName: string, launch: ProcessWatcherLaunch): ProcessWatcherLaunchOutcome {
  const watcherFolder = join(jobFolderOf(context.workspace, job), folderName);
  const socketName = `${job.id}/${folderName}`;
  const unfitEndpoint = WatcherFleet.unfitEndpointOf(context.platformPorts, {
    monitorFolder: context.monitorFolder, trackerId, jobId: socketName, instance: PROCESS_WATCHER_INSTANCE
  });
  if (unfitEndpoint !== null) return { verdict: 'unfit-endpoint', reason: `this platform cannot bind the Watcher endpoint ${unfitEndpoint}` };
  WatcherFleet.writeProcessLaunchFile(context.platformPorts, {
    watcherFolder,
    instance:           PROCESS_WATCHER_INSTANCE,
    jobId:              job.id,
    socketName,
    trackerId,
    monitorFolder:      context.monitorFolder,
    watcherCodeVersion: context.codeVersion,
    workingDirectory:   launch.workingDirectory,
    argv:               launch.argv,
    ...(launch.verbatimArguments === undefined ? {} : { verbatimArguments: launch.verbatimArguments }),
    environment:        launch.environment,
  });
  const processId = (context.processStarts ?? REAL_PROCESS_STARTS).spawnWatcher(context.platformPorts, {
    bundlePath: context.watcherBundlePath, jobFolder: watcherFolder, instance: PROCESS_WATCHER_INSTANCE, rootDirectory: context.workspace.rootDirectory
  });
  return { verdict: 'spawned', processId };
}

/** The review's catch-up merge before its reviewer, in the `target-merge` Watcher folder. */
const TARGET_CATCH_UP_MERGE: MergeIntoTreeFiles = { watcherFolder: TARGET_MERGE_WATCHER_FOLDER, settlementFile: JOB_FILES.targetMergeSettlement };

function writeMergeSettlement(context: JobLaunchContext, job: Readonly<Job>, files: MergeIntoTreeFiles, settlement: TargetMergeSettlement): void {
  writeFileAtomically(join(jobFolderOf(context.workspace, job), files.settlementFile), `${JSON.stringify(settlement)}\n`);
}

/**
 * The merge is the Overseer's own git, so it runs outside the gate sandbox, which would refuse git's writes to the repository's shared
 * object store; every hook is off, so no worker-written code runs. A merge that cannot start is settled `failed` at once.
 */
function launchMergeIntoTree(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, files: MergeIntoTreeFiles, record: Readonly<TargetMergeRecord>): void {
  const watcherFolder = join(jobFolderOf(context.workspace, job), files.watcherFolder);
  if (WatcherFleet.livenessOf(context.platformPorts, watcherFolder, PROCESS_WATCHER_INSTANCE).verdict !== 'unclaimed') return;
  const worktree = worktreeOf(context.workspace, job);
  const git = context.platformPorts.executableResolver.absolutePathOf('git', [context.workspace.rootDirectory]);
  if (git.verdict === 'refused') {
    writeMergeSettlement(context, job, files, { verdict: 'failed', reason: 'git cannot be found on the Overseer\'s PATH.' });
    return;
  }
  const gitVariables = { ...GitArgumentsUtil.environmentOf(PORTABLE_GIT_SETTINGS), GIT_CEILING_DIRECTORIES: GitWorktrees.ceilingOf(worktree) };
  const launched = launchProcessWatcher(context, trackerId, job, files.watcherFolder, {
    workingDirectory: worktree,
    argv:             MergeRun.targetMergeCommandOf(git.path, record.mergedTip),
    environment:      context.platformPorts.launchEnvironment.launchEnvironmentOf(context.inheritedEnvironment, gitVariables),
  });
  if (launched.verdict === 'unfit-endpoint') {
    writeMergeSettlement(context, job, files, { verdict: 'failed', reason: launched.reason });
    return;
  }
  context.log(`Spawned the ${files.watcherFolder} Watcher of job ${job.id} (#${ticketIdOf(job)}), merging ${record.mergedTip} into ${branchOf(job)}.`);
}

/** After the hold: what a prepared review job's catch-up asks of git and the Watchers, read afresh like a gate step. */
function runTargetCatchUpEffects(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, pipeline: Readonly<Pipeline>): void {
  if (job.kind !== REVIEW_JOB_KIND || setupProgressOf(context, job, pipeline.prepare) !== 'installed') return;
  const catchUp = targetCatchUpOf(context, job, pipeline);
  const jobFolder = jobFolderOf(context.workspace, job);
  const recordPath = join(jobFolder, JOB_FILES.targetMerge);
  if (catchUp.verdict === 'behind') {
    const record: TargetMergeRecord = { startTip: catchUp.branchTip, mergedTip: catchUp.targetTip };
    mkdirSync(jobFolder, { recursive: true });
    writeFileAtomically(recordPath, `${JSON.stringify(record)}\n`);
    launchMergeIntoTree(context, trackerId, job, TARGET_CATCH_UP_MERGE, record);
    return;
  }
  const record = readJsonFile<TargetMergeRecord>(recordPath);
  if (record === null) return;
  if (catchUp.verdict === 'merging') launchMergeIntoTree(context, trackerId, job, TARGET_CATCH_UP_MERGE, record);
  if (catchUp.verdict === 'merge-ended') writeMergeSettlement(context, job, TARGET_CATCH_UP_MERGE, MergeRun.settleTargetMerge(worktreeOf(context.workspace, job), record));
  if (catchUp.verdict === 'gating') spawnGateRunStep(context, trackerId, job, { place: TARGET_GATE_RUN, pipeline, stepIndex: catchUp.stepIndex });
}

/**
 * After the hold: what a round of `merging-main` asks of git and the Watchers, read afresh. Nothing merges while a conflict re-reviewer
 * works in the worktree: a target that moved meanwhile is merged once it ended.
 */
function runMainMergeEffects(context: JobLaunchContext, board: Board, trackerId: string, job: Readonly<Job>, pipeline: Readonly<Pipeline>): void {
  if (conflictReReviewerOf(board.jobs(), job) !== undefined) return;
  const round = job.watcherInstance;
  const step = mainMergeStepOf(context, job, pipeline);
  const files = mainMergeIntoTreeFilesOf(round);
  const recordPath = mainMergeFileOf(context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.record, round);
  if (step.verdict === 'behind') {
    const record: TargetMergeRecord = { startTip: step.branchTip, mergedTip: step.targetTip };
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileAtomically(recordPath, `${JSON.stringify(record)}\n`);
    launchMergeIntoTree(context, trackerId, job, files, record);
    return;
  }
  const record = readJsonFile<TargetMergeRecord>(recordPath);
  if (step.verdict === 'merging' && record !== null) launchMergeIntoTree(context, trackerId, job, files, record);
  if (step.verdict === 'merge-ended' && record !== null) writeMergeSettlement(context, job, files, MergeRun.settleTargetMerge(worktreeOf(context.workspace, job), record));
  if (step.verdict === 'gating') spawnGateRunStep(context, trackerId, job, { place: mainMergeGateRunOf(job, round), pipeline, stepIndex: step.stepIndex });
}

/** A checkout dirty before anyone touched it is a repository whose stored files `.gitattributes` would convert; its paths stop the install. */
function recordAnUnnormalisedCheckout(context: JobLaunchContext, job: Readonly<Job>, worktree: string): void {
  const changedPaths = changedTrackedPathsOf(worktree);
  if (changedPaths === null || changedPaths.length === 0) return;
  mkdirSync(jobFolderOf(context.workspace, job), { recursive: true });
  writeFileAtomically(join(jobFolderOf(context.workspace, job), JOB_FILES.worktreeUnnormalised), `${changedPaths.join('\n')}\n`);
  context.log(`The fresh worktree of job ${job.id} already differs from its commit in ${changedPaths.length} file(s), as line-ending normalisation leaves it.`);
}

/** A group ticket's branch forks off the group's tip, so the group's worktree is created from the main line's tip at its first launch. */
function createWorktree(context: JobLaunchContext, job: Readonly<Job>): void {
  const { rootDirectory } = context.workspace;
  const worktree = worktreeOf(context.workspace, job);
  const target = job.target ?? context.mainLine;
  const groupName = target.startsWith(context.groupTargetPrefix) ? target.slice(context.groupTargetPrefix.length) : null;
  if (groupName !== null && !GroupNameUtil.groupNameIsWellFormed(groupName)) {
    recordWorktreeFailure(context, job, `The stored group "${groupName}" is not a portable group name (lower-case letters and digits in words joined by single `
      + 'hyphens); file its tickets again under a group that is, since nothing migrates.');
    return;
  }
  const group = groupName !== null
    ? GroupWorktrees.prepareGroupWorktree(rootDirectory, WorktreesFolder.worktreesRootOf(rootDirectory), target, context.mainLine)
    : null;
  const branchExists = GitProcess.resolvedCommitOf(rootDirectory, `refs/heads/${branchOf(job)}`) !== null;
  const run = group?.verdict === 'git-failed' ? null : GitProcess.run(rootDirectory, branchExists
    ? ['worktree', 'add', worktree, branchOf(job)]
    : ['worktree', 'add', '-b', branchOf(job), worktree, target]);
  if (GitProcess.succeeded(run)) {
    recordAnUnnormalisedCheckout(context, job, worktree);
    return;
  }
  recordWorktreeFailure(context, job, group?.verdict === 'git-failed' ? group.reason : run?.standardError.trim() ?? 'git did not run');
}

function recordWorktreeFailure(context: JobLaunchContext, job: Readonly<Job>, errorText: string): void {
  mkdirSync(jobFolderOf(context.workspace, job), { recursive: true });
  writeFileAtomically(join(jobFolderOf(context.workspace, job), JOB_FILES.worktreeFailure), `${errorText}\n`);
  context.log(`Creating the worktree of job ${job.id} failed: ${errorText}`);
}

/** Created when absent; a leftover folder that git does not read as a checkout of the repository is a failure, never reused. */
function prepareWorktree(context: JobLaunchContext, job: Readonly<Job>, jobFolder: string): boolean {
  const worktree = worktreeOf(context.workspace, job);
  if (existsSync(join(jobFolder, JOB_FILES.worktreeFailure))) return false;
  const state = GitWorktrees.worktreeStateOf(context.workspace.rootDirectory, worktree);
  if (state === 'leftover') recordWorktreeFailure(context, job, `The leftover folder ${worktree} is not a checkout of the repository.`);
  if (state === 'absent') createWorktree(context, job);
  return GitWorktrees.worktreeIsCheckoutOf(context.workspace.rootDirectory, worktree);
}

/** What a build job's frames are worded and filed with. */
export interface BuildJobFrameRequest {
  platformPorts:    PlatformPorts;
  trackerDirectory: string;
  agentAdapter:     Pick<AgentAdapter, 'chatLineOf'>;
  windDownMessage:  string;
}

async function sendOnce(request: BuildJobFrameRequest, job: Readonly<Job>, marker: string, frames: Parameters<typeof WatcherFleet.sendFrames>[3]): Promise<void> {
  const jobFolder = WatcherFleet.jobFolderOf(request.trackerDirectory, job.id);
  await WatcherFleet.sendFramesOnce(request.platformPorts, join(jobFolder, marker), jobFolder, job.watcherInstance, frames);
}

/** What a build job's state asks of its live Watcher, each frame once: the wind-down turn over its call budget, closed input, a stop. */
async function deliverBuildJobFrames(request: BuildJobFrameRequest, job: Readonly<Job>, calls: number): Promise<void> {
  const markerOf = (marker: string): string => instanceMarkerOf(marker, job.watcherInstance);
  if (job.state === 'running' && calls >= attemptCallBudgetOf(request.trackerDirectory, job)) {
    await sendOnce(request, job, markerOf(JOB_FILES.windDownSent), [{ kind: 'write', line: request.agentAdapter.chatLineOf(request.windDownMessage) }]);
  }
  if (job.state === 'in-customs' || job.state === 'gating') await sendOnce(request, job, markerOf(JOB_FILES.inputClosed), [{ kind: 'close-input' }]);
  if (job.state === 'stopping') await sendOnce(request, job, markerOf(JOB_FILES.stopSent), [{ kind: 'stop', graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS }]);
}

/** After the hold and the Baton check: what each build job's new state asks of git and the Watchers. */
async function runBuildJobEffects(context: JobLaunchContext, board: Board, trackerId: string, observations: readonly BuildJobObservation[]): Promise<void> {
  const pipeline = board.pipeline();
  const frameRequest: BuildJobFrameRequest = {
    platformPorts: context.platformPorts, trackerDirectory: context.workspace.trackerDirectory, agentAdapter: context.agentAdapter, windDownMessage: context.windDownMessage,
  };
  for (const job of board.jobs().filter(isWorktreeJob)) {
    if (job.state === 'preparing') {
      const jobFolder = jobFolderOf(context.workspace, job);
      const worktreeIsReady = prepareWorktree(context, job, jobFolder);
      const unnormalised = existsSync(join(jobFolder, JOB_FILES.worktreeUnnormalised));
      if (worktreeIsReady && !unnormalised && pipeline !== null) spawnNextInstallStep(context, trackerId, job, pipeline);
      if (worktreeIsReady && !unnormalised && pipeline !== null) runTargetCatchUpEffects(context, trackerId, job, pipeline);
    }
    const observation = observations.find((candidate) => candidate.jobId === job.id);
    await deliverBuildJobFrames(frameRequest, job, observation?.calls ?? 0);
    if (job.state === 'gating' && pipeline !== null) spawnNextGateStep(context, trackerId, job, pipeline);
    if (job.state === 'merging-main' && pipeline !== null) runMainMergeEffects(context, board, trackerId, job, pipeline);
    const reReviewer = conflictReReviewerOf(board.jobs(), job);
    if (reReviewer !== undefined) await deliverBuildJobFrames(frameRequest, reReviewer, observation?.conflictReReview?.calls ?? 0);
  }
}

/** Spawns the first prepare step whose Watcher was never claimed, once every step before it exited 0; a running or failed step spawns none. */
function spawnNextInstallStep(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, pipeline: Readonly<Pipeline>): void {
  const jobFolder = jobFolderOf(context.workspace, job);
  const confinement = GateRun.prepareConfinementOf(pipeline.gates);
  for (const [stepIndex, step] of pipeline.prepare.entries()) {
    const folderName = stepFolderOf(INSTALL_WATCHER_FOLDER, stepIndex);
    const liveness = WatcherFleet.livenessOf(context.platformPorts, join(jobFolder, folderName), PROCESS_WATCHER_INSTANCE);
    if (liveness.verdict === 'unclaimed') {
      spawnProcessWatcher(context, trackerId, job, folderName, { line: step.run, confinement, subfolder: null });
      return;
    }
    if (liveness.verdict !== 'ended' || !stepPassed(context, liveness.end, jobFolder, folderName)) return;
  }
}

/** Read afresh, since the hold may have moved the job into gating this pass; a gate waits for a free slot of the machine, a prepare step never. */
function spawnNextGateStep(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, pipeline: Readonly<Pipeline>): void {
  const progress = gateProgressOf(context, job, pipeline);
  if (progress.verdict === 'running') spawnGateRunStep(context, trackerId, job, { place: ownGateRunOf(job), pipeline, stepIndex: progress.stepIndex });
}

/** The step at `stepIndex` of the run's manifest, never of the pipeline now, so a reorder since the run started spawns no other gate. */
function spawnGateRunStep(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, run: { place: GateRunPlace; pipeline: Readonly<Pipeline>; stepIndex: number }): void {
  const manifest = gateRunManifestOf(context, job, run.place, run.pipeline);
  const step = manifest === 'unreadable' ? undefined : gateStepsOf(manifest, run.place)[run.stepIndex];
  if (step !== undefined) spawnGateStep(context, trackerId, job, step);
}

function spawnGateStep(context: JobLaunchContext, trackerId: string, job: Readonly<Job>, step: GateStep): void {
  const watcherFolder = join(jobFolderOf(context.workspace, job), step.folder);
  const processWatcherStep: ProcessWatcherStep = { line: step.line, confinement: step.confinement, subfolder: step.in };
  if (step.kind !== 'gate') {
    spawnProcessWatcher(context, trackerId, job, step.folder, processWatcherStep);
    return;
  }
  if (!context.gateSlots.tryAcquire(watcherFolder)) return;
  let spawn: ProcessWatcherSpawn;
  try {
    spawn = spawnProcessWatcher(context, trackerId, job, step.folder, processWatcherStep);
  } catch (error) {
    context.gateSlots.release(watcherFolder);
    throw error;
  }
  if (spawn.verdict === 'refused') context.gateSlots.release(watcherFolder);
  if (spawn.verdict === 'spawned') {
    context.gateSlots.recordSpawnedProcess(watcherFolder, spawn.processId === undefined ? null : context.platformPorts.processSupervision.identityOf(spawn.processId));
  }
}

/**
 * Written as the session's Watcher is first spawned: the commit verification measures from, the body hash V6 compares with, and the refs,
 * worktree HEADs and hooks folder V13 and V14 compare with.
 */
function recordJobStart(context: JobLaunchContext, board: Board, job: Readonly<Job>): void {
  const startPath = join(jobFolderOf(context.workspace, job), JOB_FILES.start);
  if (existsSync(startPath)) return;
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === ticketIdOf(job));
  const worktree = worktreeOf(context.workspace, job);
  const startCommit = GitProcess.resolvedCommitOf(worktree, 'HEAD', GitWorktrees.ceilingOf(worktree));
  const launchSnapshot = launchSnapshotOf(worktree);
  if (ticket === undefined || startCommit === null || launchSnapshot === null) return;
  const start: JobStart = { startCommit, bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(ticket.body), launchSnapshot };
  mkdirSync(dirname(startPath), { recursive: true });
  writeFileAtomically(startPath, `${JSON.stringify(start, null, 2)}\n`);
}

/** Each Watcher instance's launch keeps the path and content hash of every instruction file its session was given. */
function recordInstructionsRead(jobFolder: string, watcherInstance: number, files: readonly InstructionFileRead[]): void {
  mkdirSync(jobFolder, { recursive: true });
  writeFileAtomically(join(jobFolder, `${JOB_FILES.instructionsReadPrefix}${watcherInstance}.json`), `${JSON.stringify({ files }, null, 2)}\n`);
}

/** Written once, at the job's first launch: every later instance resumes on it. */
function recordLaunchSettings(jobFolder: string, settings: SessionLaunchSettings): void {
  if (existsSync(join(jobFolder, JOB_FILES.launchSettings))) return;
  mkdirSync(jobFolder, { recursive: true });
  writeFileAtomically(join(jobFolder, JOB_FILES.launchSettings), `${JSON.stringify({ model: settings.model, effort: settings.effort }, null, 2)}\n`);
}

/** The pair the job's first launch recorded; `null` with none, or one that is unreadable or names a value outside the vocabularies. */
function recordedLaunchSettingsOf(jobFolder: string): SessionLaunchSettings | null {
  let recorded: unknown;
  try {
    recorded = JSON.parse(readFileSync(join(jobFolder, JOB_FILES.launchSettings), 'utf8'));
  } catch {
    return null;
  }
  const model  = reportFieldOf(recorded, 'model');
  const effort = reportFieldOf(recorded, 'effort');
  if (typeof model !== 'string' || !VocabularyUtil.agentModelIsKnown(model)) return null;
  if (typeof effort !== 'string' || !VocabularyUtil.agentEffortIsKnown(effort)) return null;
  return { model, effort };
}

/** What the conflict re-reviewer under a job in `merging-main` is told: the newest conflict its job's session resolved; `null` with none. */
function mainMergeConflictOf(trackerDirectory: string, job: Readonly<Job>): MainMergeConflict | null {
  return newestMainMergeConflictOf(trackerDirectory, job)?.conflict ?? null;
}

export const JobLaunch = Object.freeze({
  recordInstructionsRead,
  recordLaunchSettings,
  recordedLaunchSettingsOf,
  observeBuildJobs,
  answeredWaiverTreesOf,
  applyBuildJobObservations,
  runBuildJobEffects,
  deliverBuildJobFrames,
  recordJobStart,
  attributionTicketIdsOf,
  someBuildJobAwaitsAPass,
  sandboxFactsFor,
  logUnstartableGuard,
  cacheFolderFactsOf,
  processSandboxRequestOf,
  deniedRootRefusalRecorded,
  gateEnvironmentOf,
  worktreeOf,
  isWorktreeJob,
  treeStopAtEndOf,
  ticketIdsTouchingAgentConfigOf,
  holdAgentConfigHits,
  sessionReadingOf,
  callBudgetOf,
  bodyWithHandoffOf,
  targetCatchUpHandoverOf,
  mainMergeConflictOf,
});
