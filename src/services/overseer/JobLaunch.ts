/**
 * A build job end to end (design sections 4.4 and 5): the Overseer prepares the ticket's worktree from the target tip, runs the install line
 * in a sandboxed process Watcher, launches the builder, takes its closing report, closes its input, verifies, gates in a sandboxed process
 * Watcher, and writes the Handoff and finishes the ticket, each step a job state. Observing happens outside the lock, the moves in the hold,
 * and the effects (git, Watchers, frames) after it; a step's progress lives on disk in the job folder, so a restart observes it again.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { AgentAdapter }                                                                      from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentEffort }                                                                       from '../../lib/agent-launch/AgentLaunchRequest.ts';
import { writeFileAtomically }                                                                    from '../../lib/atomic-file/AtomicFile.ts';
import { confinedLineOf }                                                                         from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                                                                             from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                                                           from '../../lib/git/GitWorktrees.ts';
import { changedTrackedPathsOf }                                                                  from '../../lib/git/Worktrees.ts';
import { PORTABLE_GIT_SETTINGS }                                                                  from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }                                                                       from '../../lib/git/utils/GitArgumentsUtil.ts';
import type { PlatformPorts }                                                                     from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ShellExitReport }                                                                   from '../../lib/shell-line/ShellLine.ts';
import type { GateOutcome, Job, JobKind }                                                         from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                                                         from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline, PipelineReview, PipelineStep }                                            from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording }                                                    from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                                                             from '../../lib/tracker-model/Board.ts';
import { FRESH_AGENT_CAUSE, STOPPED_BY_USER_CAUSE }                                               from '../../lib/tracker-model/JobControls.ts';
import { FIRST_WATCHER_INSTANCE, HANDOFF_RED_INTERRUPTION }                                       from '../../lib/tracker-model/constants/JobStates.ts';
import { GroupNameUtil }                                                                          from '../../lib/tracker-model/utils/GroupNameUtil.ts';
import { TicketBodyHashUtil }                                                                     from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { VocabularyUtil }                                                                         from '../../lib/tracker-model/utils/VocabularyUtil.ts';
import type { WatcherEnd }                                                                        from '../../lib/watcher/WatcherRecord.ts';
import { DISPATCH_PROTOCOL }                                                                      from '../../shared/constants/DispatchProtocol.ts';
import { LIFECYCLE_LIMITS }                                                                       from '../../shared/constants/LifecycleLimits.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET, SESSION_STOP_GRACE_MILLISECONDS, WIND_DOWN_GRACE_CALLS } from '../../shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                                                          from '../../shared/constants/ProductNames.ts';
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
import { type GateConfinement, GateRun }                               from '../lifecycle/GateRun.ts';
import { ReviewOutcome }                                               from '../lifecycle/ReviewOutcome.ts';
import type { TrackerChange }                                          from '../tracker/TrackerPipeline.ts';
import type { Workspace }                                              from '../tracker/Workspace.ts';
import type { GateRunSlots }                                           from './GateRunSlots.ts';
import { GroupWorktrees }                                              from './GroupWorktrees.ts';
import { GuardCommand }                                                from './GuardCommand.ts';
import { HatchInbox }                                                  from './HatchInbox.ts';
import { InstructionFiles, type InstructionFileRead }                  from './InstructionFiles.ts';
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
  processStarts?:       ProcessStarts;
}

/** `worktree-unnormalised`: the fresh checkout already differs from its commit, as line-ending normalisation leaves it, so every gate would fail. */
export type SetupProgress = 'creating-worktree' | 'worktree-failed' | 'worktree-unnormalised' | 'installing' | 'install-failed' | 'installed';

export type GateStepOutcome = GateOutcome | 'setup-failed';

export type GateProgress =
  | { verdict: 'pending' }
  /** The step at `stepIndex` of the job's steps has yet to end, or to start while every gate slot of the machine is held. */
  | { verdict: 'running'; treeId: string; stepIndex: number }
  /** `step` names the red step, `null` on a pass; `ran` is false when a review left the tree the build's gates passed. */
  | { verdict: 'judged'; treeId: string; outcome: GateStepOutcome; step: string | null; output: string; ran: boolean; exitCode?: number | null };

/** One Watcher of a job's gate run: one prepare step, or one gate. */
interface GateStep {
  kind:        'prepare' | 'gate';
  name:        string;
  line:        string;
  folder:      string;
  in:          string | null;
  confinement: GateConfinement;
}

interface StepVerdict {
  treeId:    string;
  outcome:   GateStepOutcome;
  output:    string;
  exitCode?: number | null;
}

export interface BuildJobObservation {
  jobId:          string;
  setup:          SetupProgress;
  /** Top-level assistant turns across every Watcher instance of the job. */
  calls:          number;
  /** The structured report of the newest `result`, `undefined` before one. */
  report:         unknown;
  agentEnd:       WatcherEnd | 'lost' | null;
  gate:           GateProgress;
  /** The gate or install line the confinement port refused, `null` while none was. */
  sandboxRefusal: SandboxRefusal | null;
}

interface SandboxRefusal {
  step:   string;
  reason: string;
}

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
} as const;

const INSTALL_WATCHER_FOLDER = 'install';
const GATE_PREPARE_WATCHER_FOLDER = 'gate-prepare';
const GATE_WATCHER_FOLDER_PREFIX = 'gate-';
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
const PROCESS_WATCHER_INSTANCE = 1;
const REVIEW_JOB_KIND = 'review';

/** The jobs whose session works a ticket's worktree: each is prepared, verified and gated the same way, and only its outcome differs. */
const WORKTREE_JOB_KINDS: readonly JobKind[] = ['build', REVIEW_JOB_KIND];

function isWorktreeJob(job: Readonly<Job>): boolean {
  return WORKTREE_JOB_KINDS.includes(job.kind);
}

const AGENT_CONFIG_DECISION = 'branch-touches-agent-config';

function callBudgetOf(job: Readonly<Job>): number {
  return job.kind === REVIEW_JOB_KIND ? DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET : DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET;
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
} as const;

interface JobStart {
  startCommit:      string;
  bodyHashAtLaunch: string;
  launchSnapshot:   LaunchSnapshot;
}

function ticketIdOf(job: Readonly<Job>): string {
  return job.ticketIds[0] ?? '';
}

function worktreeOf(workspace: Workspace, job: Readonly<Job>): string {
  return join(workspace.rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER, `ticket-${ticketIdOf(job)}`);
}

function branchOf(job: Readonly<Job>): string {
  return `ticket-${ticketIdOf(job)}`;
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

/**
 * Each prepare step, then each gate in list order, each in a Watcher folder of its own. A session resumed after a red handoff gates again in
 * fresh folders, suffixed with its Watcher instance, since a Watcher folder runs once.
 */
function gateStepsOf(pipeline: Readonly<Pipeline>, watcherInstance: number = FIRST_WATCHER_INSTANCE): GateStep[] {
  const suffix = watcherInstance === FIRST_WATCHER_INSTANCE ? '' : `-${watcherInstance}`;
  const prepare = pipeline.prepare.map((step, stepIndex): GateStep => ({
    kind:        'prepare',
    name:        PREPARE_STEP_NAME,
    line:        step.run,
    folder:      `${stepFolderOf(GATE_PREPARE_WATCHER_FOLDER, stepIndex)}${suffix}`,
    in:          null,
    confinement: GateRun.prepareConfinementOf(pipeline.gates),
  }));
  return [...prepare, ...pipeline.gates.map((gate, index): GateStep => ({
    kind: 'gate', name: gate.name, line: gate.run, folder: `${GATE_WATCHER_FOLDER_PREFIX}${index + 1}${suffix}`, in: gate.in ?? null, confinement: GateRun.gateConfinementOf(gate),
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
function stepVerdictOf(context: JobLaunchContext, job: Readonly<Job>, treeId: string, step: GateStep): StepVerdict | null {
  const jobFolder   = jobFolderOf(context.workspace, job);
  const verdictPath = join(jobFolder, `${step.folder}${STEP_VERDICT_SUFFIX}`);
  const kept        = readStepVerdict(verdictPath);
  if (kept !== null && kept.treeId === treeId) return kept;
  const watcherFolder = join(jobFolder, step.folder);
  const end = processWatcherEnd(context.platformPorts, watcherFolder);
  if (end === 'pending') return null;
  const { shellLine } = context.platformPorts;
  const run = { ...stepExitReportOf(end, jobFolder, step.folder), output: watcherOutputOf(watcherFolder) };
  let verdict: StepVerdict;
  if (step.kind === 'prepare') {
    verdict = {
      treeId, outcome: shellLine.exitMeaningOf(run) === 'passed' ? 'passed' : 'setup-failed', output: run.output, exitCode: run.exitCode
    };
  } else {
    const trackedChanges = GateRun.trackedChangesOf(worktreeOf(context.workspace, job));
    verdict = {
      treeId, outcome: GateRun.gateOutcomeOf(shellLine, run, trackedChanges), output: GateRun.gateErrorOutputOf(shellLine, run, trackedChanges), exitCode: run.exitCode
    };
  }
  writeFileSync(verdictPath, `${JSON.stringify(verdict)}\n`);
  if (verdict.outcome !== 'passed') writeFileSync(join(jobFolder, GATE_LOG_FILE), `${step.name}\n${verdict.output}`);
  return verdict;
}

/** A reviewer that committed nothing, or only commits back to the tree it was given, leaves the tree the build's gates passed. */
function reviewLeftTheTreeAsItWas(context: JobLaunchContext, job: Readonly<Job>, treeId: string): boolean {
  if (job.kind !== REVIEW_JOB_KIND) return false;
  const start = readJobStart(jobFolderOf(context.workspace, job));
  return start !== null && treeOfCommit(worktreeOf(context.workspace, job), start.startCommit) === treeId;
}

function gateProgressOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): GateProgress {
  const treeId = treeOf(worktreeOf(context.workspace, job));
  if (treeId === null) return { verdict: 'pending' };
  if (reviewLeftTheTreeAsItWas(context, job, treeId)) return {
    verdict: 'judged', treeId, outcome: 'passed', step: null, output: '', ran: false
  };
  for (const [stepIndex, step] of gateStepsOf(pipeline, job.watcherInstance).entries()) {
    const verdict = stepVerdictOf(context, job, treeId, step);
    if (verdict === null) return { verdict: 'running', treeId, stepIndex };
    if (verdict.outcome !== 'passed') return {
      verdict: 'judged', treeId, outcome: verdict.outcome, step: step.name, output: verdict.output, ran: true, exitCode: verdict.exitCode ?? null
    };
  }
  return {
    verdict: 'judged', treeId, outcome: 'passed', step: null, output: '', ran: true
  };
}

/** Read outside the lock, for every live build job. */
function observeBuildJobs(context: JobLaunchContext, jobs: readonly Readonly<Job>[], pipeline: Readonly<Pipeline> | null): BuildJobObservation[] {
  return jobs.filter(isWorktreeJob).map((job) => {
    const liveness = WatcherFleet.livenessOf(context.platformPorts, jobFolderOf(context.workspace, job), job.watcherInstance);
    return {
      jobId:          job.id,
      setup:          job.state === 'preparing' ? setupProgressOf(context, job, pipeline?.prepare ?? []) : 'installed',
      ...sessionReadingOf(context, job),
      agentEnd:       liveness.verdict === 'ended' ? liveness.end : liveness.verdict === 'lost' ? 'lost' : null,
      gate:           job.state === 'gating' && pipeline !== null ? gateProgressOf(context, job, pipeline) : { verdict: 'pending' },
      sandboxRefusal: sandboxRefusalOf(context, job),
    };
  });
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
  const worktreesRoot = join(context.workspace.rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
  const tickets       = board.tickets();
  return refMovesAllowedOf(board.logRecordsSoFar(), {
    ownJobId:              job.id,
    ownBranch:             branchOf(job),
    otherJobBranches:      board.jobs().filter((other) => other.id !== job.id && isWorktreeJob(other)).map(branchOf),
    ticketBranchOf:        (ticketId) => `ticket-${ticketId}`,
    releasedGroupBranchOf: (ticketId) => {
      const frontmatter = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter;
      return frontmatter?.releasesGroup === true && frontmatter.group !== undefined ? `${context.groupTargetPrefix}${frontmatter.group}` : null;
    },
    refreshWorktreeOf: (groupBranch) => GroupWorktrees.refreshWorktreeOf(worktreesRoot, groupBranch),
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

interface RedHandoffCause extends Pick<RedHandoffFacts, 'kind' | 'name' | 'command' | 'fixCommand' | 'exitCode' | 'fullLogPath'> {
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

function settleGate(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation): void {
  const { gate } = observation;
  if (gate.verdict !== 'judged' || !hold.pipelineStored) return;
  const { board, at } = hold.change;
  board.recordPipelineJudgedBy(ticketIdOf(job));
  if (gate.outcome === 'setup-failed') {
    openIncidentFor(hold, job, 'setup-failed', { step: PREPARE_STEP_NAME });
    endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
    return;
  }
  if (gate.ran) hold.logged.push(...board.recordGateRan({ tree: gate.treeId, outcome: gate.outcome, cached: false }, at).logged);
  if (gate.outcome === 'cannot-run') {
    openIncidentFor(hold, job, 'gate-cannot-run', { tree: gate.treeId, gate: gate.step ?? '' });
    endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.gateCannotRun });
    return;
  }
  if (gate.outcome === 'failed') {
    hold.context.log(`The ${gate.step ?? ''} gate of job ${job.id} (#${ticketIdOf(job)}) is red on ${gate.treeId}; its output is in ${GATE_LOG_FILE}.`);
    const pipelineGate = board.pipeline()?.gates.find((candidate) => candidate.name === gate.step);
    interruptOnRedHandoff(hold, job, {
      kind:        'gate',
      name:        gate.step ?? '',
      command:     pipelineGate?.run ?? null,
      fixCommand:  pipelineGate?.fix ?? null,
      exitCode:    gate.exitCode ?? null,
      fullLogPath: join(jobFolderOf(hold.context.workspace, job), GATE_LOG_FILE),
      output:      gate.output,
    });
    return;
  }
  const headCommit = String(reportFieldOf(observation.report, 'headCommit'));
  if (job.kind === REVIEW_JOB_KIND) {
    const start = readJobStart(jobFolderOf(hold.context.workspace, job));
    hold.logged.push(...ReviewOutcome.settleReviewPass({
      board,
      at,
      job,
      report:            observation.report,
      worktreePath:      worktreeOf(hold.context.workspace, job),
      reviewStartCommit: start?.startCommit ?? headCommit,
      jobFolder:         jobFolderOf(hold.context.workspace, job),
      limits:            LIFECYCLE_LIMITS,
      decisionWordingOf: hold.context.decisionWordingOf,
    }).logged);
    return;
  }
  const ticketBody = board.tickets().find((candidate) => candidate.frontmatter.id === ticketIdOf(job))?.body ?? '';
  const body = { text: bodyWithHandoffOf(ticketBody, handoffSectionOf(observation.report)), appends: false };
  hold.logged.push(...board.editTicket(ticketIdOf(job), { body, allowsPastPending: true }, at).logged);
  endJob(hold, job, { outcome: 'built', commit: headCommit });
  hold.logged.push(...board.moveTicket(ticketIdOf(job), 'in-review', { checksLegality: true, branch: branchOf(job), commit: headCommit }, at).logged);
  // A pipeline without a review phase lands a gated build directly: it waits in review only for its Airlock.
  if (board.pipeline()?.review === undefined) hold.logged.push(...board.queueTicketForMerge(ticketIdOf(job), job.target ?? hold.context.mainLine, at).logged);
}

/** A reviewer runs on the pipeline review's `model` and `effort` where set; an effort outside the vocabulary keeps the default. */
function reviewerLaunchSettingsOf(review: Readonly<PipelineReview> | undefined, job: Readonly<Job>): { model?: string; effort?: AgentEffort } {
  if (job.kind !== REVIEW_JOB_KIND || review === undefined) return {};
  return {
    ...(review.model === undefined || review.model === '' ? {} : { model: review.model }),
    ...(review.effort !== undefined && VocabularyUtil.agentEffortIsKnown(review.effort) ? { effort: review.effort } : {}),
  };
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
  if (observation.sandboxRefusal !== null && (job.state === 'preparing' || job.state === 'gating')) {
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
    case 'stopping':
      if (observation.agentEnd === null) return;
      if (job.stopRequest === undefined && workingOffARedHandoff(hold.context, job)) {
        const output = `The resumed session passed its ${RED_HANDOFF_RESUME_CALL_BUDGET} calls and the ${WIND_DOWN_GRACE_CALLS}-call grace without a report.`;
        interruptOnRedHandoff(hold, job, { ...redHandoffCauseOf(hold.context, job), output });
        return;
      }
      endJob(hold, job, userStopEndingOf(job) ?? { outcome: 'stopped', cause: BUILD_JOB_CAUSES.outOfCalls });
      return;
    case 'in-customs':
      verifyAndRoute(hold, job, observation);
      return;
    case 'gating':
      settleGate(hold, job, observation);
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
    if ((state === 'preparing' || state === 'gating') && observation.sandboxRefusal !== null) return true;
    if (state === 'preparing') return observation.setup !== 'creating-worktree' && observation.setup !== 'installing';
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

/** `worktree` is the ticket's own unless named, as a refresh's resolver names the refresh worktree it resolves in. */
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
  writeFileSync(join(jobFolder, JOB_FILES.sandboxRefusal), `${JSON.stringify(refusal)}\n`);
  context.log(`The ${refusal.step} line of job ${job.id} (#${ticketIdOf(job)}) did not run: ${refusal.reason}.`);
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
  const spawnRequest = shellLine.spawnRequestOf(step.line, lineStatusFileOf(jobFolder, folderName));
  const planOf = () => ProcessWatcherSandbox.planOf(processSandboxRequestOf(context, sandboxFactsFor(context, job), confinement), join(watcherFolder, JOB_FILES.profile));
  const line = confinedLineOf(gateConfinement, planOf, spawnRequest.argv);
  if (line.verdict === 'refused') {
    recordSandboxRefusal(context, job, { step: folderName, reason: line.reason });
    return { verdict: 'refused' };
  }
  const socketName = `${job.id}/${folderName}`;
  const unfitEndpoint = WatcherFleet.unfitEndpointOf(context.platformPorts, {
    monitorFolder: context.monitorFolder, trackerId, jobId: socketName, instance: PROCESS_WATCHER_INSTANCE
  });
  if (unfitEndpoint !== null) {
    recordSandboxRefusal(context, job, { step: folderName, reason: `this platform cannot bind the Watcher endpoint ${unfitEndpoint}` });
    return { verdict: 'refused' };
  }
  WatcherFleet.writeProcessLaunchFile(context.platformPorts, {
    watcherFolder,
    instance:           PROCESS_WATCHER_INSTANCE,
    jobId:              job.id,
    socketName,
    trackerId,
    monitorFolder:      context.monitorFolder,
    watcherCodeVersion: context.codeVersion,
    workingDirectory,
    argv:               line.argv,
    verbatimArguments:  spawnRequest.verbatimArguments,
    environment:        gateEnvironmentOf(context),
  });
  const processId = (context.processStarts ?? REAL_PROCESS_STARTS).spawnWatcher(context.platformPorts, {
    bundlePath: context.watcherBundlePath, jobFolder: watcherFolder, instance: PROCESS_WATCHER_INSTANCE, rootDirectory: context.workspace.rootDirectory
  });
  const availability = gateConfinement.availability();
  const confinementWords = availability.verdict === 'confined' ? ` under ${availability.mechanism}` : ', unconfined by design';
  context.log(`Spawned the ${folderName} Watcher of job ${job.id} (#${ticketIdOf(job)})${confinementWords}.`);
  return { verdict: 'spawned', processId };
}

/** A checkout dirty before anyone touched it is a repository whose stored files `.gitattributes` would convert; its paths stop the install. */
function recordAnUnnormalisedCheckout(context: JobLaunchContext, job: Readonly<Job>, worktree: string): void {
  const changedPaths = changedTrackedPathsOf(worktree);
  if (changedPaths === null || changedPaths.length === 0) return;
  mkdirSync(jobFolderOf(context.workspace, job), { recursive: true });
  writeFileSync(join(jobFolderOf(context.workspace, job), JOB_FILES.worktreeUnnormalised), `${changedPaths.join('\n')}\n`);
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
    ? GroupWorktrees.prepareGroupWorktree(rootDirectory, join(rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER), target, context.mainLine)
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
  writeFileSync(join(jobFolderOf(context.workspace, job), JOB_FILES.worktreeFailure), `${errorText}\n`);
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
  for (const job of board.jobs().filter(isWorktreeJob)) {
    if (job.state === 'preparing') {
      const jobFolder = jobFolderOf(context.workspace, job);
      const worktreeIsReady = prepareWorktree(context, job, jobFolder);
      const unnormalised = existsSync(join(jobFolder, JOB_FILES.worktreeUnnormalised));
      if (worktreeIsReady && !unnormalised && pipeline !== null) spawnNextInstallStep(context, trackerId, job, pipeline);
    }
    const calls = observations.find((observation) => observation.jobId === job.id)?.calls ?? 0;
    await deliverBuildJobFrames({
      platformPorts: context.platformPorts, trackerDirectory: context.workspace.trackerDirectory, agentAdapter: context.agentAdapter, windDownMessage: context.windDownMessage,
    }, job, calls);
    if (job.state === 'gating' && pipeline !== null) spawnNextGateStep(context, trackerId, job, pipeline);
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
  if (progress.verdict !== 'running') return;
  const step = gateStepsOf(pipeline, job.watcherInstance)[progress.stepIndex];
  if (step === undefined) return;
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
  writeFileSync(startPath, `${JSON.stringify(start, null, 2)}\n`);
}

/** Each Watcher instance's launch keeps the path and content hash of every instruction file its session was given. */
function recordInstructionsRead(jobFolder: string, watcherInstance: number, files: readonly InstructionFileRead[]): void {
  mkdirSync(jobFolder, { recursive: true });
  writeFileAtomically(join(jobFolder, `${JOB_FILES.instructionsReadPrefix}${watcherInstance}.json`), `${JSON.stringify({ files }, null, 2)}\n`);
}

export const JobLaunch = Object.freeze({
  recordInstructionsRead,
  observeBuildJobs,
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
  gateEnvironmentOf,
  worktreeOf,
  isWorktreeJob,
  ticketIdsTouchingAgentConfigOf,
  holdAgentConfigHits,
  sessionReadingOf,
  callBudgetOf,
  reviewerLaunchSettingsOf,
  bodyWithHandoffOf,
});
