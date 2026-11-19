/**
 * The Airlocks, one per target, run by the Overseer after each pass (design section 6): allocation, the one merge-in against the recorded
 * tip, the ticket's last worker resumed for a conflict or a red merged tree, the conditional conflict re-review of a large resolution, the
 * gate on the merged tree and the compare-and-swap landing. The main line lands in the main checkout; a group's tickets and its refreshes
 * land in the group's own worktree, and its release ticket lands the bundle on the main line. Every phase is written on the merge job's
 * slot in its own hold, and every outcome ends the job or opens what User or the Assistant answers, so nothing loops. A ticket that crossed
 * into packages has its conflict and its red merged tree routed to the entity that owns them (strategy 5.7).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join }                                 from 'node:path';

import { readCurrentBranch }            from '../../lib/git/BranchIntegration.ts';
import { GitProcess }                   from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                 from '../../lib/git/GitWorktrees.ts';
import { predictMerge, predictMerges }  from '../../lib/git/MergeTree.ts';
import type { DecisionKind }            from '../../lib/tracker-model/@types/Decision.ts';
import type { GatePhase, GateRunStamp } from '../../lib/tracker-model/@types/GatePhase.ts';
import type {
  GateOutcome,
  GateRunCacheReports,
  GateRunStepRuns,
  Job,
  JobEnding,
  JobRole,
  Airlock,
  AirlockPhase
}                                          from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecordFieldsOf }                 from '../../lib/tracker-model/@types/LogRecord.ts';
import type { EntityKey, Pipeline, PipelineGate } from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  ApplyMainReading,
  ApplyRequestReason,
  MainConstitution,
  MainConstitutionReading
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { DecisionDraft, DecisionWording }                               from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { BranchTreeOf, MergeCandidate, MergeTargetOf }                  from '../../lib/tracker-model/AirlockClaims.ts';
import { MERGE_PRIORITY_RANK }                                               from '../../lib/tracker-model/AirlockClaims.ts';
import type { Board }                                                        from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                                      from '../../lib/tracker-model/BoardRefusal.ts';
import { PARKED_HOLD_PREFIX }                                                from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { HANDOFF_RED_INTERRUPTION }                                          from '../../lib/tracker-model/constants/JobStates.ts';
import { PENDING_APPLY_REQUEST_STATES }                                      from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { EntityOwnershipUtil, type PipelineEntities }                        from '../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { MergeQueueUtil, type MergeForecast }                                from '../../lib/tracker-model/utils/MergeQueueUtil.ts';
import { PipelineUtil }                                                      from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { TicketStageUtil }                                                   from '../../lib/tracker-model/utils/TicketStageUtil.ts';
import type { BranchNames }                                                  from '../../shared/BranchNames.ts';
import type { AirlockLimits }                                                from '../../shared/constants/AirlockLimits.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }                                    from '../../shared/constants/OverseerLimits.ts';
import { EntityFoldersUtil }                                                 from '../../shared/utils/EntityFoldersUtil.ts';
import { entityAssignmentRequestOf }                                         from '../control/EntityAssignmentRequest.ts';
import type { AgentNaming }                                                  from '../lifecycle/Customs.ts';
import { LANDING_OUTCOME_OF_REFUSAL, Landing, type SharedRepositoryLanding } from '../lifecycle/Landing.ts';
import {
  MergeRun,
  type ConflictPart,
  type CrossingLanding,
  type RedGateOwner
} from '../lifecycle/MergeRun.ts';
import { AIRLOCK_FACT_NAMES, KEPT_FACT_TRUE }               from './AirlockFactsFile.ts';
import { ConstitutionCommits, type ConstitutionFileCommit } from './ConstitutionCommits.ts';
import { GroupWorktrees }                                   from './GroupWorktrees.ts';
import { CONSTITUTION_FILE_PATH, InstructionFiles }         from './InstructionFiles.ts';
import { JobResumption }                                    from './JobResumption.ts';
import { RED_HANDOFF_FILES, RedHandoff }                    from './RedHandoff.ts';

export interface AirlockHold {
  board: Board;
  at:    string;
}

/** One fenced `writeTracker` hold: the caller checks its Baton after it. */
export type AirlockHoldRunner = <Result>(mutate: (hold: AirlockHold) => Result) => Promise<Result>;

/** What the merge agent's session reported and how many top-level calls it made, read from its event log. */
export interface MergeAgentReading {
  calls:  number;
  report: unknown;
}

export type MergedTreeGateAsk = (
  worktreePath: string, treeId: string, phase: GatePhase, gatedEntities: readonly EntityKey[] | undefined, ownerJobId: string | null
) => MergedTreeGate | 'running';

export interface AirlocksContext {
  /** The main checkout's root, where the main line is fast-forwarded and git runs: never a project folder, as git runs at a toplevel only. */
  repositoryRoot:         string;
  /**
   * Present for a tracker in a project folder of its repository: its landings take the repository's landing lock and are journaled, a
   * sibling's journaled landing requeues a slot silently, and a held main line waits only for the paths its fast-forward changes.
   */
  sharedRepository?:      SharedRepositoryLanding;
  /**
   * `ProjectLocation.projectPrefix`, present for a tracker in a project folder of its repository only: a conflict resolution is also held
   * to the data folders, the project's folder and its reach, and the agent configuration.
   */
  projectPrefix?:         string;
  mainLine:               string;
  branchNames:            BranchNames;
  /** Where the group worktrees and the refresh worktrees live, beside the ticket worktrees. */
  worktreesRoot:          string;
  worktreeOf:             (ticketId: string) => string;
  limits:                 AirlockLimits;
  /** With the per-job ref denies holding, a target moved by someone else requeues silently; an unconfined job may have moved it itself. */
  refDeniesHold:          boolean;
  hold:                   AirlockHoldRunner;
  /**
   * The gate of the tree with the gates of `phase`, read afresh as the run starts: `merge` for an Airlock's merged tree, the row's own phase
   * for a stale green. On a pipeline with entities `gatedEntities` names whose gates run: the landing's gate set, or the ticket's entity for
   * a stale green; absent, every entity's. The run goes on beside the pass, `running` until a later ask finds its outcome, which carries the
   * stamp of what it read. `ownerJobId` is the merge job whose slot waits on the run, `null` for a stale green's: a run whose owner left the
   * board stops.
   */
  mergedTreeGateOf:       MergedTreeGateAsk;
  /** The agent's configuration names, which a resolution may not change, and its attribution. */
  agentNaming:            AgentNaming;
  /** After the hold its outcome settled, the run's kept outcome goes, so the next gate of the same tree runs again. */
  mergedTreeGateSettled:  (worktreePath: string, treeId: string, phase: GatePhase, gatedEntities: readonly EntityKey[] | undefined, gate: MergedTreeGate) => void;
  /** Stops every merged-tree gate still running in the worktree and awaits its end: the slot that freed it no longer waits on its outcome. */
  stopMergedTreeGatesIn:  (worktreePath: string) => Promise<void>;
  mergeAgentReadingOf:    (job: Readonly<Job>) => MergeAgentReading;
  /** The lines the resolution at the worktree's HEAD changed against git's automatic merge; `null` when git cannot tell. */
  resolutionLinesOf:      (worktreePath: string) => number | null;
  /** The job's own child, an agent or a line, is alive. */
  childIsLive:            (job: Readonly<Job>) => boolean;
  stopMergeAgent:         (job: Readonly<Job>) => Promise<void>;
  decisionWordingOf:      (draft: DecisionDraft) => DecisionWording;
  /** Keeps an Airlock incident's facts beside the merge job, for the agent its move or default launches once the incident is closed. */
  keepAirlockFacts:       (mergeJob: Readonly<Job>, facts: Readonly<Record<string, string>>) => void;
  /** One fact kept beside the merge job; `null` when none was kept under that name. */
  keptAirlockFactOf:      (mergeJob: Readonly<Job>, name: string) => string | null;
  /** The job's own folder, where a merge-gate fixer's red handoff is written for its resumed session. */
  jobFolderOf:            (job: Readonly<Job>) => string;
  /** An ended job's folder, where a stale green turned red is written for the next session of its kind. */
  jobFolderOfId:          (jobId: string) => string;
  /** How often a fixer whose fix left the merged tree red is resumed before the merge parks. */
  redHandoffResumes:      number;
  /** `oversee pause` opens no new slot; a slot already open finishes. */
  dispatchIsStopped:      () => boolean;
  /** A removal git declined after a refresh or a release: the Overseer logs it and shows it as a notice while the leftover stands. */
  reportDeclinedCleanup:  (declined: DeclinedCleanup) => void;
  /** A constitution on the main line's tip as git answers for its project path, read afresh at each call. */
  mainConstitutionOf:     (constitutionPath: string) => MainConstitutionReading;
  /** The repository sets `commit.gpgsign`, so a constitution commit git cannot make is an unsigned one. */
  repositorySignsCommits: () => boolean;
}

/** The merged tree's gate: its outcome and what the checks line printed, whose tail a merge-gate fixer is given. */
export interface MergedTreeGate {
  /** `setup-failed` when a prepare step did not exit 0, `sandbox-unavailable` when a line was refused: no gate judged the tree. */
  outcome:       GateOutcome | 'setup-failed' | 'sandbox-unavailable';
  /** The red gate or the failed or refused step; `null` on a pass. */
  step:          string | null;
  /** On a pipeline with entities, the entity whose gate or step that is; absent on a pass. */
  entity?:       EntityKey;
  output:        string;
  /** The phase and phase hash of the pipeline the run read as it started, which a row's green records; `null` when it read none. */
  stamp:         GateRunStamp | null;
  /** What each gate that ended reported of its cache; absent when no gate ran. */
  cacheReports?: GateRunCacheReports;
  /** Each step line that ran, with its run time; absent when none ran. */
  stepRuns?:     GateRunStepRuns;
}

function gateRanFieldsOf(tree: string, outcome: GateOutcome, cacheReports: GateRunCacheReports | undefined): LogRecordFieldsOf<'gate-ran'> {
  return {
    tree, outcome, cached: false, ...(cacheReports === undefined ? {} : { cacheReports })
  };
}

/** Each step line of a merged-tree gate that ran, with its run time, in the hold that consumes the gate; a run that ran no line records none. */
function recordStepRuns(hold: AirlockHold, gate: MergedTreeGate): void {
  if (gate.stepRuns !== undefined) hold.board.recordPipelineStepsRan(gate.stepRuns.steps, gate.stepRuns.phase, hold.at);
}

/** A red gate goes back to the ticket's agent; a gate that could not run and a failed prepare step are the incidents a build job opens too. */
const MERGE_GATE_INCIDENT_KINDS = { 'cannot-run': 'gate-cannot-run', 'setup-failed': 'setup-failed', 'sandbox-unavailable': 'sandbox-unavailable' } as const;

function treeOfCommit(worktree: string, commit: string): string | null {
  const run = GitProcess.run(worktree, ['rev-parse', '--verify', '--quiet', `${commit}^{tree}`], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

/** A ticket's merged tree that is its branch tip's own tree: the merge-in changed nothing. A refresh has no branch of its own. */
function mergedTreeIsTheBranchTree(worktree: string, job: Readonly<Job>, treeId: string): boolean {
  const branchTip = job.airlock?.branchTip;
  return job.ticketIds.length > 0 && branchTip !== undefined && treeOfCommit(worktree, branchTip) === treeId;
}

/**
 * The merged tree is the branch's own tree, the newest gate run on it passed, and the ticket's row holds it as a green current in the merge
 * phase: the merge changed nothing the gates judged, and the gates that passed it are the merge phase's. On a pipeline with entities that
 * green also names every entity of the landing's gate set. A refresh has no row, so its merged tree is always gated.
 */
function mergedTreeWasLastPassed(
  board: Board, job: Readonly<Job>, treeId: string, isTheBranchTree: boolean, landingGatedEntities: readonly EntityKey[] = []
): boolean {
  const [ticketId] = job.ticketIds;
  if (!isTheBranchTree || ticketId === undefined) return false;
  const newestRunOnTheTree = board.logRecordsSoFar().findLast((record) => record.kind === 'gate-ran' && record.fields.tree === treeId);
  return newestRunOnTheTree?.kind === 'gate-ran' && newestRunOnTheTree.fields.outcome === 'passed'
    && board.greenIsCurrent(ticketId, treeId, 'merge', landingGatedEntities);
}

/** The parked hold a merged tree leaves when it is still red after the agent's resumes. */
const MERGE_GATE_RED_PARK_CAUSE = 'merge-gate-red';

/** How a crossing ticket's merge job ends when its red merged tree sends the ticket back to the package's or the home's stage (E65). */
const RED_GATE_RETURN_CAUSES = { package: 'package-gate-red', home: 'home-gate-red' } as const satisfies Readonly<Record<RedGateOwner['owner'], string>>;

/** What a merged tree's gate leaves the Airlock to do outside its hold. */
type RedMergedTreeSettlement =
  | { verdict: 'settled' }
  | { verdict: 'park' }
  | { verdict: 'return-to-owner'; owner: RedGateOwner; homeEntity: EntityKey };

const PACKAGE_BUILD_STAGE_NUMBER  = TicketStageUtil.stageNumberOf('package-build');
const PACKAGE_REVIEW_STAGE_NUMBER = TicketStageUtil.stageNumberOf('package-review');

/** Who an Airlock agent is: its role, and on a pipeline with entities the entity and stage it runs, which its session and sandbox follow. */
interface AirlockAgentScope {
  role:    JobRole;
  entity?: EntityKey;
  stage?:  number;
}

type EntityAndStage = Readonly<{ entity?: EntityKey; stage?: number }>;

/** The Airlock agents launched under one merge job, in launch order, and the newest one's ending. */
interface AirlockAgentHistory {
  /**
   * The conflict or red handoff launches and the red resumes; a fresh agent in place of one that could not resume adds none, and neither
   * does a conflict re-reviewer, a fresh session of its own, or a package's builder with no session of that package's build to resume.
   */
  resumes:       number;
  freshAgentIds: ReadonlySet<string>;
  newestEnding:  ({ jobId: string; outcome: string; attempt: number; role: JobRole | null } & EntityAndStage) | null;
}

export interface DeclinedCleanup {
  cleanup:     'refresh' | 'release';
  groupBranch: string;
  /** Git's own reason, as `GroupWorktrees` hands it back. */
  reason:      string;
}

/**
 * The `dirty-main-checkout` notice: the target checkout's branch, or the files blocking the fast-forward. With `heldFiles`, the
 * `target-file-held` notice instead: files another process holds open, which are never the owner's changes.
 */
export interface HeldTarget {
  target:        string;
  branch:        string | null;
  blockingFiles: readonly string[];
  heldFiles:     readonly string[];
}

export interface Airlocks {
  /** Advances every slot as far as it goes without waiting, then allocates; resolves with the targets whose landings wait. */
  sweep: () => Promise<readonly HeldTarget[]>;
}

/** A sweep stops after this many rounds of advancing and allocating, so a slot that keeps moving waits for the next pass. */
const ROUNDS_PER_SWEEP = 8;

const MERGE_REFUSED_CAUSES = {
  outOfCalls:         'out-of-calls',
  cannotResolve:      'cannot-resolve',
  unresolved:         'merge-unresolved',
  noReport:           'no-report',
  reReviewFailed:     're-review-failed',
  gitFailed:          'git-failed',
  refreshConflicted:  'refresh-conflicted',
  releaseBehindGroup: 'release-behind-group',
} as const;

/** The causes a merge job ends with when it frees its slot and its ticket waits in the queue again. */
const REQUEUE_CAUSES = { orphaned: 'orphaned', targetMoved: 'target-moved', targetHeld: 'target-held' } as const;

const MERGE_ABORTED_CAUSE = 'merge-aborted';

/** The landing refusals that hold the main line: the constitution commit waits for them, and is never refused for them. */
const HELD_APPLY_REASONS = ['not-on-target-branch', 'dirty-checkout', 'target-file-held', 'git-failed'] as const satisfies readonly ApplyRequestReason[];

/** A constitution commit job whose Apply request no longer names it: User cancelled the Apply. */
const APPLY_CANCELLED_CAUSE = 'apply-cancelled';

const RED_RESUMES_SPENT_CAUSE = 'red-resumes-spent';

const STALE_GREEN_LOG_FILE = 'gate.log';

interface StaleGreenRed {
  treeId:  string;
  step:    string;
  /** The entity whose gate went red, on a pipeline with entities. */
  entity?: EntityKey;
  output:  string;
  commit:  string;
}

const LANDING_REFUSED_DECISION: DecisionKind = 'landing-refused';

/** A refused refresh names no ticket: its `merge-refused` context starts with the group's target, which keeps the next refresh waiting. */
const REFRESH_REFUSAL_SEPARATOR = ': ';

/**
 * The phase a stale green is gated again in: the one it was taken in, or, on a row that names none, the phase whose green queues the
 * ticket (review with a review phase, build without one).
 */
function regatePhaseOf(board: Board, ticketId: string): GatePhase {
  return board.greenPhaseOf(ticketId) ?? (board.reviewIsSetFor(ticketId) ? 'review' : 'build');
}

/** The red gate a handoff names: from the pipeline of the entity whose gate it is, or from the forge's own gates without one. */
function redGateOf(pipeline: Readonly<Pipeline> | null, entityKey: EntityKey | undefined, gateName: string): PipelineGate | undefined {
  const gatesPipeline = pipeline === null || entityKey === undefined ? pipeline : PipelineUtil.pipelineOfEntity(pipeline, entityKey);
  return gatesPipeline?.gates.find((gate) => gate.name === gateName);
}

/** A stale green is gated again by its ticket's own entity, or by every entity when the ticket names none the pipeline holds. */
function staleGreenGatedEntitiesOf(board: Board, ticketId: string): readonly EntityKey[] | undefined {
  const entities = board.pipeline()?.entities;
  if (entities === undefined) return undefined;
  const entityKey = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.entity;
  return entityKey !== undefined && Object.hasOwn(entities, entityKey) ? [entityKey] : Object.keys(entities);
}

/**
 * The landing's gate set: the entities the fast-forward to the merged tree changes and their consumers. On a group's branch only the
 * entities it changes: their consumers run at the group's release, which lands all of it on the main line (E68). When git cannot name the
 * paths, or a group's landing changes no entity's paths, every entity's gates run.
 */
function landingGatedEntitiesOf(entities: PipelineEntities, worktree: string, targetTip: string, landsOnTheMainLine: boolean): readonly EntityKey[] {
  const changedPaths = pathsTheFastForwardChangesOf(worktree, targetTip);
  if (changedPaths === null) return Object.keys(entities);
  const repositoryPaths = changedPaths.map((gitPath) => `/${gitPath}`);
  if (landsOnTheMainLine) return EntityOwnershipUtil.gatedEntitiesOf(entities, repositoryPaths);
  const changedEntities = EntityOwnershipUtil.pathsByOwnerOf(entities, repositoryPaths);
  const ownEntities = Object.keys(entities).filter((entityKey) => changedEntities.has(entityKey));
  return ownEntities.length === 0 ? Object.keys(entities) : ownEntities;
}

function reportFieldOf(report: unknown, field: string): unknown {
  return typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
}

function slotOf(job: Readonly<Job>): Readonly<Airlock> {
  if (job.airlock === undefined) throw new Error(`Merge job ${job.id} holds no slot.`);
  return job.airlock;
}

function ticketIdOf(job: Readonly<Job>): string {
  return job.ticketIds[0] ?? '';
}

function isRefresh(job: Readonly<Job>): boolean {
  return job.kind === 'refresh';
}

function isConstitutionCommit(job: Readonly<Job>): boolean {
  return job.kind === 'constitution-commit';
}

/**
 * What a constitution commit job commits and lands: the open record's Apply request that names it, with each constitution's draft. A
 * forge without entities lists the record's own `CONSTITUTION.md` alone; a draft over entities lists each entity's drafted constitution,
 * in the draft's order, and names every entity's constitution path, whose file main may hold to be adopted as it is.
 */
interface ConstitutionCommitRequest {
  setupId:                  string;
  draftRevision:            number;
  resumesBoard:             boolean;
  constitutions:            readonly ConstitutionFileCommit[];
  /** Absent without entities: each entity's constitution path, by key. */
  entityConstitutionPaths?: Readonly<Record<EntityKey, string>>;
}

/** The open record's Apply request while it waits for its commit; with `commitJobId`, only while it names that job. */
function pendingApplyOf(board: Board, commitJobId?: string): ConstitutionCommitRequest | null {
  const setup   = board.pipelineSetup();
  const request = setup?.applyRequest ?? null;
  const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
  if (setup === null || request === null || !pendingStates.includes(request.state)) return null;
  if (commitJobId !== undefined && request.commitJobId !== commitJobId) return null;
  const pending = { setupId: setup.setupId, draftRevision: request.draftRevision, resumesBoard: request.resumesBoard };
  const entities = setup.draft?.entities;
  if (entities === undefined) {
    return {
      ...pending,
      constitutions: [{ path: CONSTITUTION_FILE_PATH, markdown: setup.constitution?.markdown ?? '', baseBlob: setup.constitution?.baseBlob ?? null }],
    };
  }
  const entityConstitutionPaths = Object.fromEntries(Object.entries(entities).map(([entityKey, entity]) => [entityKey, EntityFoldersUtil.constitutionPathOf(entity)]));
  const parts = setup.entities ?? {};
  const constitutions = Object.entries(entityConstitutionPaths).flatMap(([entityKey, path]): ConstitutionFileCommit[] => {
    const draft = Object.hasOwn(parts, entityKey) ? parts[entityKey]?.constitution ?? null : null;
    return draft === null || draft.markdown === '' ? [] : [{ path, markdown: draft.markdown, baseBlob: draft.baseBlob }];
  });
  return { ...pending, constitutions, entityConstitutionPaths };
}

/**
 * What main holds for the request as the Board reads it: the forge's `CONSTITUTION.md`, or on a draft over entities each entity's file,
 * by its path in `readingOfPath`.
 */
function applyMainReadingOf(request: Readonly<ConstitutionCommitRequest>, readingOfPath: (path: string) => MainConstitution | null): ApplyMainReading {
  const paths = request.entityConstitutionPaths;
  if (paths === undefined) return { mainConstitution: readingOfPath(CONSTITUTION_FILE_PATH), entityAssignmentRequestOf };
  const entityConstitutions = Object.fromEntries(Object.entries(paths).map(([entityKey, path]) => [entityKey, readingOfPath(path)]));
  return { mainConstitution: null, entityConstitutions, entityAssignmentRequestOf };
}

/** The paths whose text on main the request reads: the listed constitutions, and on a draft over entities every entity's path. */
function pathsReadOf(request: Readonly<ConstitutionCommitRequest>): string[] {
  const paths = request.entityConstitutionPaths === undefined ? request.constitutions.map((constitution) => constitution.path) : Object.values(request.entityConstitutionPaths);
  return [...new Set(paths)];
}

/** Main holds the draft's text when it holds the constitution with exactly that text; an empty draft only matches no file at all. */
function mainHoldsTheText(mainConstitution: MainConstitution | null, markdown: string): boolean {
  return (mainConstitution?.markdown ?? null) === (markdown === '' ? null : markdown);
}

/**
 * The blob of each listed constitution in the commit, in the request's order; `null` when the commit holds one of them not, or git cannot
 * tell, so the commit is not the one the job made.
 */
function committedBlobsOf(commit: string, request: Readonly<ConstitutionCommitRequest>, projectDirectory: string): string[] | null {
  const blobs: string[] = [];
  for (const constitution of request.constitutions) {
    const reading = ConstitutionCommits.constitutionBlobOf(projectDirectory, commit, constitution.path);
    if (reading.verdict !== 'read' || reading.blob === null) return null;
    blobs.push(reading.blob);
  }
  return blobs;
}

function mergeAgentOf(board: Board, job: Readonly<Job>): Readonly<Job> | undefined {
  return board.jobs().find((candidate) => candidate.kind === 'merge-agent' && candidate.parentJobId === job.id);
}

/** The ticket's trailing run of merge jobs ended by an unrecorded target move: what parks it after TARGET_MOVED_MERGES_BEFORE_PARKING. */
function targetMovesInARowOf(board: Board, ticketId: string): number {
  const mergeJobIds = new Set<string>();
  let movesInARow = 0;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched' && record.fields.kind === 'merge' && record.fields.ticketIds.includes(ticketId)) mergeJobIds.add(record.jobId);
    if (record.kind !== 'job-ended' || !mergeJobIds.has(record.jobId)) continue;
    movesInARow = record.fields.cause === REQUEUE_CAUSES.targetMoved ? movesInARow + 1 : 0;
  }
  return movesInARow;
}

function uncommittedPathsOf(directory: string): string[] | null {
  const status = GitProcess.run(directory, ['status', '--porcelain=v1', '--untracked-files=no'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  if (!GitProcess.succeeded(status)) return null;
  return status.standardOutput.split('\n').filter((line) => line !== '').map((line) => line.slice('XY '.length));
}

function pathsTheFastForwardChangesOf(directory: string, commit: string): string[] | null {
  const changed = GitProcess.run(directory, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', commit, '--'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  if (!GitProcess.succeeded(changed)) return null;
  return changed.standardOutput.split('\0').filter((path) => path !== '');
}

function entityAndStageOf(launch: EntityAndStage): EntityAndStage {
  return { ...(launch.entity === undefined ? {} : { entity: launch.entity }), ...(launch.stage === undefined ? {} : { stage: launch.stage }) };
}

/**
 * The ticket's last worker from history, whatever the pipeline says now; with none ended, its reviewer, or its builder with no review
 * step. On a pipeline with entities it runs the entity and stage its launch logged, so its own session is resumed: the home's worker (E63).
 */
function homeWorkerScopeOf(board: Board, ticketId: string): AirlockAgentScope {
  const logRecords = board.logRecordsSoFar();
  const lastWorker = JobResumption.lastWorkerOf(logRecords, ticketId);
  const role: JobRole = lastWorker?.role ?? (board.reviewIsSetFor(ticketId) ? 'reviewer' : 'builder');
  if (board.pipeline()?.entities === undefined || lastWorker === null) return { role };
  const launch = logRecords.find((record) => record.kind === 'job-launched' && record.jobId === lastWorker.jobId);
  return launch?.kind === 'job-launched' ? { role, ...entityAndStageOf(launch.fields) } : { role };
}

/** A sealed package's part goes to that package's builder (E62); the home's part to the home's worker. */
function conflictPartScopeOf(part: Readonly<ConflictPart>, homeScope: AirlockAgentScope): AirlockAgentScope {
  return part.packageEntity === null ? homeScope : { role: 'builder', entity: part.packageEntity, stage: PACKAGE_BUILD_STAGE_NUMBER };
}

/** What the agent of one part of a conflict is told through the kept facts; a ticket that crossed into no package keeps only its files. */
function conflictPartFactsOf(part: Readonly<ConflictPart>, filesResolvedBefore: readonly string[]): Record<string, string> {
  return {
    [AIRLOCK_FACT_NAMES.conflictedFiles]: part.files.join('\n'),
    ...(part.leavesTheMergeOpen ? { [AIRLOCK_FACT_NAMES.leavesTheMergeOpen]: KEPT_FACT_TRUE } : {}),
    ...(filesResolvedBefore.length === 0 ? {} : { [AIRLOCK_FACT_NAMES.filesResolvedBefore]: filesResolvedBefore.join('\n') }),
  };
}

/** A ticket that crossed into packages, as its landing reads it; `null` for every other ticket, whose Airlock runs as it always did. */
function crossingLandingOf(board: Board, ticketId: string): CrossingLanding | null {
  const entities = board.pipeline()?.entities;
  if (entities === undefined || board.ticketStageOf(ticketId) === null) return null;
  const homeEntity = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.entity;
  return homeEntity === undefined ? null : { entities, homeEntity, sealedPackages: Object.keys(board.ticketSealsOf(ticketId)) };
}

/** The agents launched under the merge job, in launch order, as their launches logged them. */
function airlockAgentLaunchesOf(board: Board, job: Readonly<Job>): ({ role: JobRole | null } & EntityAndStage)[] {
  return board.logRecordsSoFar().flatMap((record) => (
    record.kind === 'job-launched' && record.fields.parentJobId === job.id ? [{ role: record.fields.role, ...entityAndStageOf(record.fields) }] : []
  ));
}

/**
 * The conflict re-reviewer a resolution still needs, in order: the home's, when its resolution is too large to merge unread; then
 * one of each package whose builder resolved a part, whatever its size (E62). `null` once each one needed was launched.
 */
function nextConflictReReviewerOf(board: Board, job: Readonly<Job>, homeNeedsAReReview: boolean): AirlockAgentScope | null {
  const launches = airlockAgentLaunchesOf(board, job);
  const reReviewedEntities = launches.filter((launch) => launch.role === 'conflict-re-reviewer').map((launch) => launch.entity);
  const homeScope = homeWorkerScopeOf(board, ticketIdOf(job));
  const homeReReviewer: AirlockAgentScope = { ...entityAndStageOf(homeScope), role: 'conflict-re-reviewer' };
  const resolvedPackages = [...new Set(launches.flatMap((launch) => (launch.stage === PACKAGE_BUILD_STAGE_NUMBER && launch.entity !== undefined ? [launch.entity] : [])))];
  const queue: AirlockAgentScope[] = [
    ...(homeNeedsAReReview ? [homeReReviewer] : []),
    ...resolvedPackages.map((packageEntity): AirlockAgentScope => ({ role: 'conflict-re-reviewer', entity: packageEntity, stage: PACKAGE_REVIEW_STAGE_NUMBER })),
  ];
  return queue.find((reReviewer) => !reReviewedEntities.includes(reReviewer.entity)) ?? null;
}

/**
 * A package's builder in the Airlock resumes the newest session of that package's build (E62), as its launch states it; with none to
 * resume it starts a fresh session of its own, the same test the launch's budget statement makes.
 */
function startsAFreshSession(
  board: Board, jobId: string, launch: Readonly<{ kind: Job['kind']; role: Job['role']; ticketIds: readonly string[]; parentJobId: Job['parentJobId'] }> & EntityAndStage
): boolean {
  const subject = {
    id: jobId, kind: launch.kind, role: launch.role, ticketIds: [...launch.ticketIds], parentJobId: launch.parentJobId, ...entityAndStageOf(launch)
  };
  return JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), subject) === jobId;
}

function airlockAgentHistoryOf(board: Board, job: Readonly<Job>): AirlockAgentHistory {
  const launchByJobId = new Map<string, { attempt: number; role: JobRole | null } & EntityAndStage>();
  const freshAgentIds = new Set<string>();
  let resumes = 0;
  let newestEnding: AirlockAgentHistory['newestEnding'] = null;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched' && record.fields.parentJobId === job.id) {
      launchByJobId.set(record.jobId, { attempt: record.fields.attempt, role: record.fields.role, ...entityAndStageOf(record.fields) });
      const isFresh = newestEnding?.outcome === 'replaced' || record.fields.role === 'conflict-re-reviewer'
        || (record.fields.stage === PACKAGE_BUILD_STAGE_NUMBER && startsAFreshSession(board, record.jobId, record.fields));
      if (isFresh) freshAgentIds.add(record.jobId);
      else resumes += 1;
    }
    if (record.kind === 'job-resumed' && launchByJobId.has(record.jobId) && record.fields.cause === HANDOFF_RED_INTERRUPTION) resumes += 1;
    const launch = record.kind === 'job-ended' ? launchByJobId.get(record.jobId) : undefined;
    if (record.kind === 'job-ended' && launch !== undefined) newestEnding = { jobId: record.jobId, outcome: record.fields.outcome, ...launch };
  }
  return { resumes, freshAgentIds, newestEnding };
}

/** How often the agent's session was resumed after a red handoff. */
function redResumesOf(board: Board, agent: Readonly<Job>): number {
  return board.logRecordsSoFar().filter((record) => record.kind === 'job-resumed' && record.jobId === agent.id && record.fields.cause === HANDOFF_RED_INTERRUPTION).length;
}

function tailOf(output: string, lineCount: number): string {
  return output.trimEnd().split('\n').slice(-lineCount).join('\n');
}

function forecastOf(prediction: ReturnType<typeof predictMerge>): MergeForecast {
  return prediction.verdict;
}

export function createAirlocks(context: AirlocksContext): Airlocks {
  const { mainLine, branchNames: { groupTargetPrefix } } = context;
  const targetOf: MergeTargetOf = (ticket) => (
    ticket.group === undefined || ticket.releasesGroup === true ? mainLine : `${groupTargetPrefix}${ticket.group}`
  );
  const groupOf = (target: string): string => target.slice(groupTargetPrefix.length);
  const branchTreeOf: BranchTreeOf = (ticketId) => treeOfCommit(context.repositoryRoot, `refs/heads/${context.branchNames.ticketBranchOf(ticketId)}`);
  const heldTargets = new Map<string, HeldTarget>();
  /** The commit a held main line of a project tracker could not land: only the paths its fast-forward changes keep the line held. */
  const commitsAHeldMainLineWaitsToLand = new Map<string, string>();
  const sharedLanding = context.sharedRepository === undefined ? {} : { sharedRepository: context.sharedRepository };

  function holdTarget(heldTarget: HeldTarget, commitItWaitsToLand: string): void {
    heldTargets.set(heldTarget.target, heldTarget);
    if (context.sharedRepository !== undefined && heldTarget.target === mainLine) commitsAHeldMainLineWaitsToLand.set(heldTarget.target, commitItWaitsToLand);
  }

  /**
   * The newest ended job of the kind the policy launches next for a stale green outside the Airlock: its reviewer, or its builder with no
   * review step. Unlike the Airlock's last worker, this follows the pipeline, since that next session is the one taking the handoff over. A
   * crossing ticket sent back from its landing names the build kind: its package's or its home's builder takes the handoff over.
   */
  function newestAgentJobIdOf(board: Board, ticketId: string, kind: 'build' | 'review' = board.reviewIsSetFor(ticketId) ? 'review' : 'build'): string | null {
    const agentJobIds = new Set<string>();
    let newest: string | null = null;
    for (const record of board.logRecordsSoFar()) {
      if (record.kind === 'job-launched' && record.fields.kind === kind && record.fields.ticketIds.includes(ticketId)) agentJobIds.add(record.jobId);
      if (record.kind === 'job-ended' && agentJobIds.has(record.jobId)) newest = record.jobId;
    }
    return newest;
  }

  /**
   * The red handoff the next session of that agent's kind takes over, kept in the ended job's folder. It is one more resume of that job's own
   * ladder; past the resumes allowed nothing is written, and the answer is false.
   */
  function writeStaleGreenHandoff(board: Board, ticketId: string, red: StaleGreenRed, takenOverByABuild = false): boolean {
    const jobId = takenOverByABuild ? newestAgentJobIdOf(board, ticketId, 'build') : newestAgentJobIdOf(board, ticketId);
    if (jobId === null) return true;
    const resume = (RedHandoff.redHandoffFactsOf(context.jobFolderOfId(jobId))?.resume ?? 0) + 1;
    if (resume > context.redHandoffResumes) return false;
    const folder = join(context.jobFolderOfId(jobId), RED_HANDOFF_FILES.staleGreenFolder);
    const pipelineGate = redGateOf(board.pipeline(), red.entity, red.step);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, STALE_GREEN_LOG_FILE), `${red.step}\n${red.output}`);
    RedHandoff.writeRedHandoff(folder, {
      kind:                'gate',
      name:                red.step,
      command:             pipelineGate?.run ?? null,
      fixCommand:          pipelineGate?.fix ?? null,
      commit:              red.commit,
      exitCode:            null,
      batonPassPath:       RedHandoff.batonPassPathOf(folder),
      fullLogPath:         join(folder, STALE_GREEN_LOG_FILE),
      resume,
      resumesAllowed:      context.redHandoffResumes,
      callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
      interruptedInstance: 0,
    }, red.output);
    return true;
  }

  /** A stale green that turned red goes back to the agent that made it while its ladder has resumes left; past them the ticket parks. */
  function returnStaleGreenRed(hold: AirlockHold, ticketId: string, red: StaleGreenRed): void {
    if (!writeStaleGreenHandoff(hold.board, ticketId, red)) {
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${RED_RESUMES_SPENT_CAUSE}`, hold.at);
      openDecision(hold, 'parked', [ticketId], tailOf(red.output, context.limits.CHECK_OUTPUT_TAIL_LINES));
      return;
    }
    // Without a review phase the branch's own green would queue it again at once, with no agent to fix it: its builder takes it back.
    if (!hold.board.reviewIsSetFor(ticketId)) hold.board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, hold.at);
  }

  /** In the hold after a gate run outside the Airlock: green queues the ticket again, red returns it to its agent, else an incident holds it. */
  function settleRegate(hold: AirlockHold, ticketId: string, target: string, treeId: string, gate: MergedTreeGate): void {
    const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
    const stillWaits = ticket?.frontmatter.status === 'in-review' && ticket.frontmatter.hold === undefined
      && !hold.board.jobs().some((job) => job.ticketIds.includes(ticketId)) && branchTreeOf(ticketId) === treeId;
    if (!stillWaits) return;
    recordStepRuns(hold, gate);
    if (gate.outcome !== 'setup-failed' && gate.outcome !== 'sandbox-unavailable') hold.board.recordGateRan(gateRanFieldsOf(treeId, gate.outcome, gate.cacheReports), hold.at);
    hold.board.recordPipelineJudgedBy(ticketId, gate.outcome === 'passed' ? treeId : null, gate.stamp, hold.at);
    if (gate.outcome === 'passed') {
      // A pipeline changed while the gates ran leaves this green not current: the ticket waits unqueued, and the next sweep gates it again.
      if (hold.board.greenIsCurrent(ticketId, treeId, hold.board.greenPhaseOf(ticketId))) hold.board.queueTicketForMerge(ticketId, target, treeId, hold.at);
      return;
    }
    if (gate.outcome === 'failed') {
      // With a review phase the ticket waits in review, unqueued, for its next reviewer; without one its builder takes the red handoff. A
      // crossing ticket goes back to the stage of the entity that owns the red gate (E65).
      const branchRef = `refs/heads/${context.branchNames.ticketBranchOf(ticketId)}`;
      const red: StaleGreenRed = {
        treeId,
        step:   gate.step ?? '',
        ...(gate.entity === undefined ? {} : { entity: gate.entity }),
        output: gate.output,
        commit: GitProcess.resolvedCommitOf(context.repositoryRoot, branchRef) ?? '',
      };
      const landing = crossingLandingOf(hold.board, ticketId);
      if (landing === null) returnStaleGreenRed(hold, ticketId, red);
      else returnRedGateToItsOwner(hold, ticketId, { owner: MergeRun.redGateOwnerOf(landing, gate.entity), homeEntity: landing.homeEntity }, red);
      return;
    }
    hold.board.openIncident({
      kind:        MERGE_GATE_INCIDENT_KINDS[gate.outcome],
      ticketIds:   [ticketId],
      jobId:       null,
      facts:       { tree: treeId, gate: gate.step ?? '' },
      defaultMove: gate.outcome === 'setup-failed' ? 'worktree-repair' : 'gate-retry',
    }, hold.at);
  }

  /**
   * Outside any slot: a queued ticket whose green went stale loses its mark and its worktree is gated again; a ticket whose green is current
   * but which is not queued (no review phase) is queued. While the re-gate runs beside the pass the ticket keeps its mark: a stale green
   * is no merge candidate, and the mark keeps the policy from launching a reviewer and the next sweep listing the ticket for its outcome.
   */
  async function settleTicketsAwaitingGreen(target: string): Promise<boolean> {
    if (context.dispatchIsStopped()) return false;
    // With no stored pipeline only a constitution commit uses the Airlock: no ticket is gated or queued.
    const awaiting = await context.hold((hold) => (hold.board.pipeline() === null ? [] : hold.board.ticketsAwaitingGreenOf(target, targetOf, branchTreeOf)));
    let moved = false;
    for (const { ticketId } of awaiting) {
      const settled = await context.hold((hold) => {
        const branchTree    = branchTreeOf(ticketId);
        const phase         = regatePhaseOf(hold.board, ticketId);
        const gatedEntities = staleGreenGatedEntitiesOf(hold.board, ticketId);
        if (!hold.board.greenIsCurrent(ticketId, branchTree, hold.board.greenPhaseOf(ticketId))) return {
          greenIsCurrent: false, changed: false, phase, gatedEntities
        };
        if (hold.board.ticketIsMergeQueued(ticketId)) return {
          greenIsCurrent: true, changed: false, phase, gatedEntities
        };
        hold.board.queueTicketForMerge(ticketId, target, branchTree, hold.at);
        return {
          greenIsCurrent: true, changed: true, phase, gatedEntities
        };
      });
      moved = moved || settled.changed;
      if (settled.greenIsCurrent) continue;
      // Only a worktree whose HEAD is the branch's tree is gated. An ungated ticket waits unqueued: with a review phase the policy launches
      // its next reviewer, without one the next sweep lists it again.
      const worktree = context.worktreeOf(ticketId);
      const treeId   = MergeRun.treeOf(worktree);
      const gate     = treeId === null || treeId !== branchTreeOf(ticketId) ? null : context.mergedTreeGateOf(worktree, treeId, settled.phase, settled.gatedEntities, null);
      if (gate === 'running') continue;
      const unqueued = await context.hold((hold) => {
        const wasQueued = hold.board.ticketIsMergeQueued(ticketId);
        if (wasQueued) hold.board.setTicketMergeQueued(ticketId, false, hold.at);
        if (gate !== null && treeId !== null) settleRegate(hold, ticketId, target, treeId, gate);
        return wasQueued;
      });
      moved = moved || unqueued || gate !== null;
      if (gate !== null && treeId !== null) context.mergedTreeGateSettled(worktree, treeId, settled.phase, settled.gatedEntities, gate);
    }
    return moved;
  }

  /** Main lands in the main checkout; a group branch in its own worktree, created from the main line's tip when the group has none yet. */
  function targetDirectoryOf(target: string): string | null {
    if (target === mainLine) return context.repositoryRoot;
    const prepared = GroupWorktrees.prepareGroupWorktree(context.repositoryRoot, context.worktreesRoot, target, mainLine);
    return prepared.verdict === 'ready' ? prepared.path : null;
  }

  function slotWorktreeOf(job: Readonly<Job>): string {
    return isRefresh(job) ? GroupWorktrees.refreshWorktreeOf(context.worktreesRoot, job.target ?? '') : context.worktreeOf(ticketIdOf(job));
  }

  function openDecision(hold: AirlockHold, kind: DecisionKind, ticketIds: readonly string[], decisionContext: string): void {
    const draft: DecisionDraft = { kind, ticketIds, jobId: null };
    hold.board.openDecision({
      ...draft, askedBy: 'overseer', requestId: null, questions: context.decisionWordingOf(draft).questions, context: decisionContext
    }, hold.at);
  }

  function setPhase(hold: AirlockHold, job: Readonly<Job>, phase: AirlockPhase): void {
    hold.board.setJobSlot(job.id, { ...slotOf(job), phase });
  }

  function removeRefreshWorktree(job: Readonly<Job>): void {
    const reason = GroupWorktrees.removeWorktree(context.repositoryRoot, slotWorktreeOf(job));
    if (reason !== null) context.reportDeclinedCleanup({ cleanup: 'refresh', groupBranch: job.target ?? '', reason });
  }

  /** Frees the slot with the worktree back at its recorded start, a refresh's removed; the ticket stays queued unless the caller took it out. */
  async function freeSlot(job: Readonly<Job>, ending: JobEnding, inHold: (hold: AirlockHold) => void = () => undefined): Promise<void> {
    const worktree = slotWorktreeOf(job);
    await context.stopMergedTreeGatesIn(worktree);
    MergeRun.restoreBranchTip(worktree, MergeRun.sidesOf(job, slotOf(job)).startTip);
    if (isRefresh(job)) removeRefreshWorktree(job);
    await context.hold((hold) => {
      const agent = mergeAgentOf(hold.board, job);
      if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'stopped', cause: ending.cause ?? 'merge-ended' }, hold.at);
      hold.board.endJob(job.id, ending, hold.at);
      inHold(hold);
    });
  }

  /** The merge aborts, the slot frees and User is asked; a `reportKind` also opens the Assistant's incident, with no job waiting. */
  async function refuseMerge(job: Readonly<Job>, cause: string, notes: string, reportKind: unknown = null): Promise<void> {
    const ticketIds = isRefresh(job) ? [] : [ticketIdOf(job)];
    await freeSlot(job, { outcome: 'failed', cause }, (hold) => {
      ticketIds.forEach((ticketId) => hold.board.setTicketMergeQueued(ticketId, false, hold.at));
      openDecision(hold, 'merge-refused', ticketIds, isRefresh(job) ? `${job.target ?? ''}${REFRESH_REFUSAL_SEPARATOR}${notes}` : notes);
      if (reportKind !== 'malformed-ticket' && reportKind !== 'system-blocker') return;
      hold.board.openIncident({
        kind:        reportKind === 'malformed-ticket' ? 'malformed-ticket' : 'system-question',
        ticketIds,
        jobId:       null,
        facts:       { notes, mergeJobId: job.id },
        defaultMove: 'incident-escalate',
      }, hold.at);
    });
  }

  /** A release carries the group's whole tip to the main line; one forked before a later landing or refresh would deliver work main lacks. */
  async function releaseGapOf(job: Readonly<Job>): Promise<string | null> {
    if (isRefresh(job) || slotOf(job).target !== mainLine) return null;
    const ticketId = ticketIdOf(job);
    const group = await context.hold((hold) => {
      const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
      return ticket?.frontmatter.releasesGroup === true ? ticket.frontmatter.group : undefined;
    });
    if (group === undefined) return null;
    const groupBranch = `${groupTargetPrefix}${group}`;
    const groupTip    = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${groupBranch}`);
    if (groupTip === null) return null;
    const descends = GitProcess.run(context.repositoryRoot, ['merge-base', '--is-ancestor', groupTip, slotOf(job).branchTip]);
    return GitProcess.succeeded(descends) ? null : `The release branch of #${ticketId} does not hold ${groupBranch}'s tip ${groupTip}.`;
  }

  async function runMergeIn(job: Readonly<Job>): Promise<boolean> {
    const worktree = slotWorktreeOf(job);
    const slot     = slotOf(job);
    if (isRefresh(job)) {
      const prepared = GroupWorktrees.prepareRefreshWorktree(context.repositoryRoot, context.worktreesRoot, slot.target, slot.targetTip);
      if (prepared.verdict === 'git-failed') {
        await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, prepared.reason);
        return true;
      }
    }
    if (MergeRun.mergeIsInProgress(worktree)) {
      // A live holder keeps its slot; only a merge-in left behind by nobody is aborted and requeued.
      if (context.childIsLive(job)) return false;
      await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
      return true;
    }
    const releaseGap = await releaseGapOf(job);
    if (releaseGap !== null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.releaseBehindGroup, releaseGap);
      return true;
    }
    const merge = MergeRun.mergeInOnce(worktree, MergeRun.sidesOf(job, slot));
    if (merge.verdict === 'merged' || merge.verdict === 'already-descends') {
      await context.hold((hold) => setPhase(hold, job, 'gating'));
      return true;
    }
    if (merge.verdict === 'conflicted' && isRefresh(job)) {
      // A refresh has no ticket agent to resolve it: User decides.
      await refuseMerge(job, MERGE_REFUSED_CAUSES.refreshConflicted, `The merge of ${mainLine} conflicts in ${merge.conflictedFiles.join(', ')}.`);
      return true;
    }
    if (merge.verdict === 'conflicted') {
      await context.hold((hold) => {
        const landing = crossingLandingOf(hold.board, ticketIdOf(job));
        const part = (landing === null ? null : MergeRun.firstConflictPartOf(landing, merge.conflictedFiles))
          ?? { packageEntity: null, files: merge.conflictedFiles, leavesTheMergeOpen: false };
        context.keepAirlockFacts(job, conflictPartFactsOf(part, []));
        launchAirlockAgent(hold, job, 1, conflictPartScopeOf(part, homeWorkerScopeOf(hold.board, ticketIdOf(job))));
        setPhase(hold, job, 'resolving');
      });
      return true;
    }
    await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, merge.verdict === 'git-failed' ? merge.reason : 'unknown commit');
    return true;
  }

  /**
   * The ticket's last worker goes into the Airlock worktree, its own session resumed, or a conflict re-reviewer as a fresh session; a fresh
   * agent of the same role in place of one that could not resume carries the same attempt.
   */
  function launchAirlockAgent(hold: AirlockHold, job: Readonly<Job>, attempt: number, scope: AirlockAgentScope): void {
    hold.board.launchJob({
      kind: 'merge-agent', role: scope.role, ticketIds: job.ticketIds, parentJobId: job.id, attempt, target: slotOf(job).target, ...entityAndStageOf(scope),
    }, hold.at);
  }

  async function runGate(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    if (hasOpenIncident) return false;
    const worktree = slotWorktreeOf(job);
    const treeId   = MergeRun.treeOf(worktree);
    if (treeId === null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, 'The merged tree cannot be read.');
      return true;
    }
    const isTheBranchTree = mergedTreeIsTheBranchTree(worktree, job, treeId);
    const admission = await context.hold((hold) => {
      const entities = hold.board.pipeline()?.entities ?? null;
      // With entities, whether the green covers the landing waits for the gate set, which git names outside the hold.
      if (entities !== null || !mergedTreeWasLastPassed(hold.board, job, treeId, isTheBranchTree)) return { landsUngated: false, entities };
      setPhase(hold, job, 'landing');
      return { landsUngated: true, entities };
    });
    if (admission.landsUngated) return true;
    // Only a pipeline with entities asks git which paths the landing changes.
    const gatedEntities = admission.entities === null
      ? undefined
      : landingGatedEntitiesOf(admission.entities, worktree, slotOf(job).targetTip, slotOf(job).target === mainLine);
    if (gatedEntities !== undefined && isTheBranchTree && await context.hold((hold) => {
      if (!mergedTreeWasLastPassed(hold.board, job, treeId, isTheBranchTree, gatedEntities)) return false;
      setPhase(hold, job, 'landing');
      return true;
    })) return true;
    const gate = context.mergedTreeGateOf(worktree, treeId, 'merge', gatedEntities, job.id);
    // The job stays in `gating` and the sweep goes on with the next target; the run's end wakes the pass that settles it.
    if (gate === 'running') return false;
    const {
      outcome, step, entity, output, stamp, cacheReports
    } = gate;
    const settled = await context.hold((hold): RedMergedTreeSettlement => {
      recordStepRuns(hold, gate);
      if (outcome !== 'setup-failed' && outcome !== 'sandbox-unavailable') hold.board.recordGateRan(gateRanFieldsOf(treeId, outcome, cacheReports), hold.at);
      const agent = mergeAgentOf(hold.board, job);
      if (outcome === 'passed') {
        // Only the branch's own tree is the row's: a merged tree with a merge commit goes back to the branch tip when the slot frees.
        if (isTheBranchTree) hold.board.recordPipelineJudgedBy(ticketIdOf(job), treeId, stamp, hold.at);
        if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'resolved', commit: MergeRun.headOf(worktree) ?? treeId }, hold.at);
        setPhase(hold, job, 'landing');
        return { verdict: 'settled' };
      }
      if (outcome === 'failed') {
        if (isRefresh(job)) return { verdict: 'park' };
        const landing = crossingLandingOf(hold.board, ticketIdOf(job));
        if (landing !== null) return { verdict: 'return-to-owner', owner: MergeRun.redGateOwnerOf(landing, entity), homeEntity: landing.homeEntity };
        const resumesSpent = resumeOrSpendTheAgent(hold, job, agent, {
          step: step ?? '', ...(entity === undefined ? {} : { entity }), output, worktree
        });
        return { verdict: resumesSpent ? 'park' : 'settled' };
      }
      hold.board.openIncident({
        kind:        MERGE_GATE_INCIDENT_KINDS[outcome],
        ticketIds:   job.ticketIds,
        jobId:       job.id,
        facts:       { tree: treeId, gate: step ?? '' },
        defaultMove: 'gate-retry',
      }, hold.at);
      return { verdict: 'settled' };
    });
    context.mergedTreeGateSettled(worktree, treeId, 'merge', gatedEntities, gate);
    if (settled.verdict === 'park') await abortAndPark(job, tailOf(output, context.limits.CHECK_OUTPUT_TAIL_LINES));
    if (settled.verdict === 'return-to-owner') {
      await returnRedMergedTreeToItsOwner(job, settled, {
        treeId, step: step ?? '', ...(entity === undefined ? {} : { entity }), output, commit: MergeRun.headOf(worktree) ?? ''
      });
    }
    return true;
  }

  /** A crossing ticket's red merged tree goes to the entity that owns the red gate (E65): the merge aborts, and its ticket is returned. */
  async function returnRedMergedTreeToItsOwner(
    job: Readonly<Job>, route: Readonly<{ owner: RedGateOwner; homeEntity: EntityKey }>, red: StaleGreenRed
  ): Promise<void> {
    const ticketId = ticketIdOf(job);
    await freeSlot(job, { outcome: 'failed', cause: RED_GATE_RETURN_CAUSES[route.owner.owner] }, (hold) => {
      hold.board.setTicketMergeQueued(ticketId, false, hold.at);
      returnRedGateToItsOwner(hold, ticketId, route, red);
    });
  }

  /**
   * In the hold: a crossing ticket's red gate, on its merged tree or on its stale green, goes to the entity that owns the gate (E65). The
   * ticket returns to the package's build, its seal lifted and the return counted, or to the home's `adapt`, and that stage's builder takes
   * the red handoff over. A second package return opens `second-return`, naming the package, and the ticket keeps its stage and status
   * (E45); a red gate past the builder's resumes parks the ticket for User.
   */
  function returnRedGateToItsOwner(hold: AirlockHold, ticketId: string, route: Readonly<{ owner: RedGateOwner; homeEntity: EntityKey }>, red: StaleGreenRed): void {
    const { owner } = route;
    if (owner.owner === 'package' && hold.board.returnToThePackageIsASecondReturn(ticketId, owner.packageEntity)) {
      hold.board.returnTicketToThePackage(ticketId, owner.packageEntity, context.decisionWordingOf, hold.at);
      return;
    }
    if (!writeStaleGreenHandoff(hold.board, ticketId, red, true)) {
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${RED_RESUMES_SPENT_CAUSE}`, hold.at);
      openDecision(hold, 'parked', [ticketId], tailOf(red.output, context.limits.CHECK_OUTPUT_TAIL_LINES));
      return;
    }
    if (owner.owner === 'package') hold.board.returnTicketToThePackage(ticketId, owner.packageEntity, context.decisionWordingOf, hold.at);
    else hold.board.moveTicketStage(ticketId, { name: 'adapt', entity: route.homeEntity }, hold.at);
    hold.board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, hold.at);
  }

  /**
   * A red merged tree goes back to the ticket's last worker with the red handoff message: its session in the Airlock is resumed (the
   * conflict re-reviewer's after a re-review), or, with none there yet, the last worker's own session is resumed into the Airlock. Past the
   * resumes the agent ends `failed` and the merge parks. Returns whether the resumes are spent.
   */
  function resumeOrSpendTheAgent(
    hold: AirlockHold, job: Readonly<Job>, agent: Readonly<Job> | undefined, red: { step: string; entity?: EntityKey; output: string; worktree: string }
  ): boolean {
    const { resumes } = airlockAgentHistoryOf(hold.board, job);
    if (resumes >= context.redHandoffResumes) {
      if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'failed', cause: RED_RESUMES_SPENT_CAUSE }, hold.at);
      return true;
    }
    // The merge job's folder keeps the newest red handoff for an agent launched into the Airlock, a fresh one included.
    const folders = [context.jobFolderOf(job), ...agent === undefined ? [] : [context.jobFolderOf(agent)]];
    for (const folder of folders) {
      RedHandoff.writeRedHandoff(folder, {
        kind:                'gate',
        name:                red.step,
        command:             redGateOf(hold.board.pipeline(), red.entity, red.step)?.run ?? null,
        fixCommand:          null,
        commit:              MergeRun.headOf(red.worktree) ?? '',
        exitCode:            null,
        batonPassPath:       RedHandoff.batonPassPathOf(folder),
        fullLogPath:         null,
        resume:              resumes + 1,
        resumesAllowed:      context.redHandoffResumes,
        callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
        interruptedInstance: agent?.childInstance ?? 0,
      }, red.output);
    }
    if (agent === undefined) launchAirlockAgent(hold, job, 1, homeWorkerScopeOf(hold.board, ticketIdOf(job)));
    else hold.board.interruptJob(agent.id, HANDOFF_RED_INTERRUPTION, hold.at);
    setPhase(hold, job, 'fixing');
    return false;
  }

  /** The merge aborts, the slot frees and the ticket is held `parked:merge-gate-red` with a `parked` decision; a refresh asks User. */
  async function abortAndPark(job: Readonly<Job>, notes: string): Promise<boolean> {
    const cause = MERGE_GATE_RED_PARK_CAUSE;
    if (isRefresh(job)) {
      await refuseMerge(job, cause, notes);
      return true;
    }
    const ticketId = ticketIdOf(job);
    await freeSlot(job, { outcome: 'failed', cause }, (hold) => {
      hold.board.setTicketMergeQueued(ticketId, false, hold.at);
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${cause}`, hold.at);
      openDecision(hold, 'parked', [ticketId], notes);
    });
    return true;
  }

  /**
   * The agent resolving the conflict or fixing the red merged tree, settled by its report. One that could not resume was ended `replaced`,
   * and a fresh agent of its role and attempt takes its place; any other agent that ended leaves the slot orphaned.
   */
  async function runAirlockAgent(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    if (hasOpenIncident) return false;
    const { agent, history } = await context.hold((hold) => ({ agent: mergeAgentOf(hold.board, job), history: airlockAgentHistoryOf(hold.board, job) }));
    if (agent !== undefined) return settleAirlockAgent(job, agent, history);
    const ending = history.newestEnding;
    if (ending?.outcome === 'replaced') {
      await context.hold((hold) => launchAirlockAgent(
        hold, job, ending.attempt, ending.role === null ? homeWorkerScopeOf(hold.board, ticketIdOf(job)) : { role: ending.role, ...entityAndStageOf(ending) }
      ));
      return true;
    }
    await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    return true;
  }

  /**
   * At its budget or on `cannot-resolve` the merge is refused; on `resolved` the agent waits through the gate of the merged tree, so a red
   * one resumes the same session and a pass ends it `resolved`. A resolution V10 refuses, or, for a tracker in a project folder, V5, V17 or
   * V13 on the report of a resolution or of a red gate's fix, refuses the merge. A sound resolution that changed more lines than the merge
   * train's re-review threshold goes to a conflict re-reviewer first, and one a package's builder took part in goes to that package's
   * conflict re-reviewer too (E62). A crossing ticket's worker that left the merge open hands it on to the next part's worker (E64).
   */
  async function settleAirlockAgent(job: Readonly<Job>, agent: Readonly<Job>, history: AirlockAgentHistory): Promise<boolean> {
    const reading = context.mergeAgentReadingOf(agent);
    const budget  = await context.hold((hold) => airlockAgentBudgetOf(hold.board, agent, history));
    if (agent.state === 'running' && reading.calls >= budget) {
      await context.stopMergeAgent(agent);
      await refuseMerge(job, MERGE_REFUSED_CAUSES.outOfCalls, `The ${agent.role ?? 'agent'} of job ${agent.id} reached its ${budget} calls in the Airlock.`);
      return true;
    }
    if (agent.state !== 'in-customs') return false;
    // Its report is in: nothing else closes an Airlock agent's session, so the Overseer stops it before settling the slot.
    await context.stopMergeAgent(agent);
    if (slotOf(job).phase === 're-reviewing') return settleConflictReReview(job, agent, reading.report);
    const notes   = String(reportFieldOf(reading.report, 'notes') ?? '');
    const outcome = reportFieldOf(reading.report, 'outcome');
    if (outcome !== 'resolved') {
      const cause = outcome === 'cannot-resolve' ? MERGE_REFUSED_CAUSES.cannotResolve : MERGE_REFUSED_CAUSES.noReport;
      await refuseMerge(job, cause, notes, reportFieldOf(reading.report, 'reportKind') ?? null);
      return true;
    }
    const worktree      = slotWorktreeOf(job);
    const resolvedFiles = reportFieldOf(reading.report, 'resolvedFiles');
    const resolvedFileList = Array.isArray(resolvedFiles) ? resolvedFiles.map(String) : [];
    const isResolving = slotOf(job).phase === 'resolving';
    const landing = isResolving ? await context.hold((hold) => crossingLandingOf(hold.board, ticketIdOf(job))) : null;
    // Only a crossing ticket's conflict is split by owner, so only its resolution asks git whether the merge was left open.
    if (landing !== null && MergeRun.mergeIsInProgress(worktree)) return handOnTheOpenMerge(job, agent, landing, resolvedFileList, notes);
    const filesResolvedBefore = filesResolvedBeforeOf(job);
    if (isResolving && !MergeRun.resolutionIsSound(worktree, MergeRun.sidesOf(job, slotOf(job)), [...filesResolvedBefore, ...resolvedFileList], context.agentNaming)) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.unresolved, notes);
      return true;
    }
    if (await refusedOutsideProjectScope(job, worktree, resolvedFileList, `The resolution of job ${agent.id}`)) return true;
    const reReview = isResolving ? await context.hold((hold) => hold.board.pipeline()?.airlock?.reReview ?? null) : null;
    // Fail closed: a resolution whose size git cannot tell is re-reviewed.
    const resolutionLines = reReview === null ? null : context.resolutionLinesOf(worktree);
    const homeNeedsAReReview = reReview !== null && (resolutionLines === null || resolutionLines > reReview.thresholdLines);
    await context.hold((hold) => {
      const reReviewer = isResolving ? nextConflictReReviewerOf(hold.board, job, homeNeedsAReReview) : null;
      if (reReviewer !== null) {
        hold.board.endJob(agent.id, { outcome: 'resolved', commit: MergeRun.headOf(worktree) ?? '' }, hold.at);
        launchAirlockAgent(hold, job, 1, reReviewer);
        setPhase(hold, job, 're-reviewing');
        return;
      }
      hold.board.moveJob(agent.id, 'gating', hold.at);
      setPhase(hold, job, 'gating');
    });
    return true;
  }

  /** A list of files kept as one fact, newline-separated; none when the fact was not kept. */
  function keptFileListOf(job: Readonly<Job>, factName: string): string[] {
    return (context.keptAirlockFactOf(job, factName) ?? '').split('\n').filter((path) => path !== '');
  }

  /** The files the workers before the current one resolved, on a crossing ticket's conflict split by owner; none for every other merge. */
  function filesResolvedBeforeOf(job: Readonly<Job>): string[] {
    return keptFileListOf(job, AIRLOCK_FACT_NAMES.filesResolvedBefore);
  }

  /**
   * A worker that left the merge open hands it on (E64): the files of its own part and of the parts before it resolved, whatever its report
   * lists, and the rest still unmerged, the next part's worker is launched in the same worktree, the home's last, which commits the one
   * merge. Anything else refuses the merge, so a worker that hands on its own part unresolved is never launched again on it.
   */
  async function handOnTheOpenMerge(
    job: Readonly<Job>, agent: Readonly<Job>, landing: Readonly<CrossingLanding>, resolvedFiles: readonly string[], notes: string
  ): Promise<boolean> {
    const sides = MergeRun.sidesOf(job, slotOf(job));
    const ownPartFiles = keptFileListOf(job, AIRLOCK_FACT_NAMES.conflictedFiles);
    const filesResolvedBefore = [...new Set([...filesResolvedBeforeOf(job), ...ownPartFiles, ...resolvedFiles])];
    const verdict = ownPartFiles.length === 0 ? { verdict: 'unresolved' } as const : MergeRun.openMergeVerdictOf(slotWorktreeOf(job), sides, filesResolvedBefore);
    if (verdict.verdict === 'unresolved') {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.unresolved, notes);
      return true;
    }
    await context.hold((hold) => {
      const part = MergeRun.firstConflictPartOf(landing, verdict.remainingFiles) ?? { packageEntity: null, files: verdict.remainingFiles, leavesTheMergeOpen: false };
      hold.board.endJob(agent.id, { outcome: 'resolved', commit: sides.startTip }, hold.at);
      context.keepAirlockFacts(job, conflictPartFactsOf(part, filesResolvedBefore));
      launchAirlockAgent(hold, job, 1, conflictPartScopeOf(part, homeWorkerScopeOf(hold.board, ticketIdOf(job))));
    });
    return true;
  }

  /**
   * For a tracker in a project folder, V5, V17 and V13 on every commit since the branch tip, so a red gate's fix and a re-reviewer's fix are
   * judged with the resolution; a refusal refuses the merge. A tracker at its repository's root asks nothing here, as it always did.
   */
  async function refusedOutsideProjectScope(job: Readonly<Job>, worktree: string, resolvedFiles: readonly string[], refusedWork: string): Promise<boolean> {
    const { projectPrefix } = context;
    if (projectPrefix === undefined || projectPrefix === '') return false;
    const reach = await context.hold((hold) => hold.board.pipeline()?.reach ?? []);
    const verdict = MergeRun.resolutionScopeVerdictOf(worktree, MergeRun.sidesOf(job, slotOf(job)), resolvedFiles, { projectPrefix, reach }, context.agentNaming);
    if (verdict.verdict === 'in-scope') return false;
    await refuseMerge(job, verdict.reason, `${refusedWork} was refused: ${verdict.reason} ${verdict.facts.join(', ')}`.trim());
    return true;
  }

  /** The commit the conflict re-reviewer started from: the resolution its merge job's resolver ended on. */
  function resolutionCommitOf(board: Board, job: Readonly<Job>): string {
    const resolverJobIds = new Set<string>();
    let resolutionCommit = '';
    for (const record of board.logRecordsSoFar()) {
      if (record.kind === 'job-launched' && record.fields.parentJobId === job.id && record.fields.role !== 'conflict-re-reviewer') resolverJobIds.add(record.jobId);
      if (record.kind === 'job-ended' && resolverJobIds.has(record.jobId) && record.fields.outcome === 'resolved') resolutionCommit = record.fields.commit ?? '';
    }
    return resolutionCommit;
  }

  /**
   * A re-review whose report holds goes on to the next re-review the resolution needs, or to the gate of the merged tree, its agent waiting
   * through it as a resolver does, so a red gate resumes it; an invalid report, a moved history, a claim that still does not hold or, for a
   * tracker in a project folder, a fix V5, V17 or V13 refuses, refuses the merge.
   */
  async function settleConflictReReview(job: Readonly<Job>, agent: Readonly<Job>, report: unknown): Promise<boolean> {
    const worktree = slotWorktreeOf(job);
    const resolutionCommit = await context.hold((hold) => resolutionCommitOf(hold.board, job));
    const verdict = MergeRun.reReviewVerdictOf(worktree, resolutionCommit, report, context.agentNaming);
    if (verdict.verdict === 'customs-refused') {
      const cause = verdict.reason === 'report-invalid' ? MERGE_REFUSED_CAUSES.noReport : MERGE_REFUSED_CAUSES.reReviewFailed;
      await refuseMerge(job, cause, `The conflict re-review of job ${agent.id} was refused: ${verdict.reason} ${verdict.facts.join(', ')}`.trim());
      return true;
    }
    if (verdict.verdict === 'claims-refused') {
      const reviewText = String(reportFieldOf(report, 'reviewText') ?? '');
      await refuseMerge(job, MERGE_REFUSED_CAUSES.reReviewFailed, `${reviewText}\n\nDoes not hold: ${verdict.acceptanceItems.join(', ')}`.trim());
      return true;
    }
    if (await refusedOutsideProjectScope(job, worktree, [], `The conflict re-review of job ${agent.id}`)) return true;
    await context.hold((hold) => {
      // A home re-review, when needed, came first: only the packages' re-reviews can follow (E62).
      const nextReReviewer = nextConflictReReviewerOf(hold.board, job, false);
      if (nextReReviewer !== null) {
        hold.board.endJob(agent.id, { outcome: 'reviewed', commit: MergeRun.headOf(worktree) ?? '' }, hold.at);
        launchAirlockAgent(hold, job, 1, nextReReviewer);
        return;
      }
      hold.board.moveJob(agent.id, 'gating', hold.at);
      setPhase(hold, job, 'gating');
    });
    return true;
  }

  /** A resumed session has the red handoff's short budget; a fresh agent has its role's full budget until its own first resume. */
  function airlockAgentBudgetOf(board: Board, agent: Readonly<Job>, history: AirlockAgentHistory): number {
    const isFreshAndUnresumed = history.freshAgentIds.has(agent.id) && redResumesOf(board, agent) === 0;
    if (!isFreshAndUnresumed) return RED_HANDOFF_RESUME_CALL_BUDGET;
    return agent.role === 'builder' ? context.limits.FRESH_BUILDER_API_CALL_BUDGET : context.limits.FRESH_REVIEWER_API_CALL_BUDGET;
  }

  function currentBranchIn(directory: string): string | null {
    const branch = readCurrentBranch(directory);
    return branch.verdict === 'on-branch' ? branch.branch : null;
  }

  /**
   * A project tracker's main line is shared with its siblings and the people working beside them, so a file its fast-forward does not
   * change never holds it; any other target waits for nothing uncommitted at all. A question git cannot answer keeps the target held.
   */
  function heldTargetIsClear(target: string, directory: string): boolean {
    if (currentBranchIn(directory) !== target) return false;
    const uncommittedPaths = uncommittedPathsOf(directory);
    if (uncommittedPaths === null) return false;
    const commitItWaitsToLand = commitsAHeldMainLineWaitsToLand.get(target);
    if (commitItWaitsToLand === undefined) return uncommittedPaths.length === 0;
    const changedPaths = pathsTheFastForwardChangesOf(directory, commitItWaitsToLand);
    return changedPaths !== null && !uncommittedPaths.some((path) => changedPaths.includes(path));
  }

  /** Rechecked every sweep: each held target's checkout back on its branch and clean where it must be clears its notice. */
  function recheckHeldTargets(): void {
    for (const target of [...heldTargets.keys()]) {
      const directory = target === mainLine ? context.repositoryRoot : GroupWorktrees.groupWorktreeOf(context.worktreesRoot, target);
      if (!heldTargetIsClear(target, directory)) continue;
      heldTargets.delete(target);
      commitsAHeldMainLineWaitsToLand.delete(target);
    }
  }

  /** What the landing does on the board once git moved the target: deliver, approve a group's ticket, or record a refresh. */
  function landOnTheBoard(hold: AirlockHold, job: Readonly<Job>, commit: string): void {
    const slot     = slotOf(job);
    const ticketId = ticketIdOf(job);
    if (isRefresh(job)) {
      hold.board.recordMergeLanded(job.id, { target: slot.target, commit, kind: 'integrated' }, hold.at);
      hold.board.endJob(job.id, { outcome: 'refreshed', commit }, hold.at);
      return;
    }
    if (slot.target !== mainLine) {
      hold.board.moveTicket(ticketId, 'reviewed', { checksLegality: true }, hold.at);
      hold.board.recordMergeLanded(job.id, { target: slot.target, commit, kind: 'integrated' }, hold.at);
      hold.board.endJob(job.id, { outcome: 'integrated', commit }, hold.at);
      return;
    }
    const tickets  = hold.board.tickets();
    const group    = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter.group;
    // The bundle's integrated tickets go with the release; one delivered already stays as it is.
    const released = group === undefined ? [] : hold.board.releaseBundleTicketIdsOf(group).filter((bundleTicketId) => (
      bundleTicketId !== ticketId && tickets.some((candidate) => candidate.frontmatter.id === bundleTicketId && candidate.frontmatter.status === 'reviewed')
    ));
    hold.board.releaseTickets([ticketId, ...released], { branch: context.branchNames.ticketBranchOf(ticketId), commit }, hold.at);
    hold.board.recordMergeLanded(job.id, { target: mainLine, commit, kind: 'landed' }, hold.at);
    hold.board.endJob(job.id, { outcome: 'landed', commit }, hold.at);
  }

  /** After the landing hold: a refresh's temporary worktree goes, and a release removes the group's worktree and deletes its branch. */
  function cleanUpAfterLanding(job: Readonly<Job>, releasedGroup: string | undefined): void {
    if (isRefresh(job)) removeRefreshWorktree(job);
    if (releasedGroup === undefined) return;
    const groupBranch = `${groupTargetPrefix}${releasedGroup}`;
    const reason      = GroupWorktrees.removeGroup(context.repositoryRoot, context.worktreesRoot, groupBranch);
    if (reason !== null) context.reportDeclinedCleanup({ cleanup: 'release', groupBranch, reason });
  }

  async function runLanding(job: Readonly<Job>): Promise<boolean> {
    const ticketId     = ticketIdOf(job);
    const slot         = slotOf(job);
    const mergedCommit = MergeRun.headOf(slotWorktreeOf(job));
    const directory    = targetDirectoryOf(slot.target);
    if (mergedCommit === null || directory === null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, mergedCommit === null ? 'The merged commit cannot be read.' : `The ${slot.target} worktree cannot be prepared.`);
      return true;
    }
    let releasedGroup: string | undefined = undefined;
    const landed = await context.hold((hold) => {
      const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
      // Only a review accounts for the Acceptance: a pipeline without a review phase lands on its gates alone.
      const pipeline = hold.board.pipeline();
      const acceptanceIsReviewed = pipeline === null || PipelineUtil.ticketReviewIsSet(pipeline, ticket?.frontmatter.entity);
      const ticketRefusal = ticket === undefined || !acceptanceIsReviewed ? null : Landing.ticketRefusalOf([ticket]);
      if (ticketRefusal !== null) return ticketRefusal;
      const verdict = Landing.landOnTarget({
        target:            { branch: slot.target, directory },
        mergedCommit,
        expectedTargetTip: slot.targetTip,
        recordedLandings:  hold.board.recordedLandingsOn(slot.target),
        hookPolicy:        'hooks-off',
        ...sharedLanding,
      });
      if (verdict.verdict === 'refused') return verdict;
      if (slot.target === mainLine && ticket?.frontmatter.releasesGroup === true) releasedGroup = ticket.frontmatter.group;
      landOnTheBoard(hold, job, verdict.commit);
      return verdict;
    });
    if (landed.verdict !== 'refused') {
      cleanUpAfterLanding(job, releasedGroup);
      return true;
    }
    switch (LANDING_OUTCOME_OF_REFUSAL[landed.reason]) {
      case 'wait-for-the-landing-lock':
        return false;
      case 'requeue-from-branch-tip':
        await freeSlot(job, { outcome: 'stopped', cause: 'target-moved-by-a-recorded-landing' });
        return true;
      case 'open-target-moved':
        return settleMovedTarget(job, landed.facts.targetTip ?? '');
      case 'hold-target':
        holdTarget({
          target: slot.target, branch: currentBranchIn(directory), blockingFiles: landed.facts.blockingFiles ?? [], heldFiles: landed.facts.heldFiles ?? []
        }, mergedCommit);
        await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetHeld });
        return true;
      case 'hold-ticket':
        await freeSlot(job, { outcome: 'failed', cause: landed.reason }, (hold) => {
          hold.board.setTicketMergeQueued(ticketId, false, hold.at);
          hold.board.holdTicket(ticketId, `${LANDING_REFUSED_DECISION}:${landed.reason}`, hold.at);
          openDecision(hold, LANDING_REFUSED_DECISION, [ticketId], landed.reason);
        });
        return true;
      case 'finish-board-side':
        return true;
    }
  }

  /** Requeued silently while the ref denies hold, parked after TARGET_MOVED_MERGES_BEFORE_PARKING moves in a row; else one decision per tip. */
  async function settleMovedTarget(job: Readonly<Job>, newTip: string): Promise<boolean> {
    const ticketId = ticketIdOf(job);
    if (!context.refDeniesHold) {
      return context.hold((hold) => {
        if (hold.board.decisions().some((decision) => decision.kind === 'target-moved' && decision.context === newTip)) return false;
        openDecision(hold, 'target-moved', [], newTip);
        return true;
      });
    }
    await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetMoved }, (hold) => {
      if (isRefresh(job) || targetMovesInARowOf(hold.board, ticketId) < context.limits.TARGET_MOVED_MERGES_BEFORE_PARKING) return;
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}target-moved`, hold.at);
      openDecision(hold, 'parked', [ticketId], REQUEUE_CAUSES.targetMoved);
    });
    return true;
  }

  async function advance(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    switch (slotOf(job).phase) {
      case 'merge-in':
        return runMergeIn(job);
      case 'resolving':
      case 're-reviewing':
      case 'fixing':
        return runAirlockAgent(job, hasOpenIncident);
      case 'gating':
        return runGate(job, hasOpenIncident);
      case 'committing':
        return runConstitutionCommit(job);
      case 'landing':
        return isConstitutionCommit(job) ? runConstitutionLanding(job) : runLanding(job);
    }
  }

  /** A parked candidate, by its incident's `merge abort` default or a `ticket park`, gives up the slot: the merge aborts and it leaves the queue. */
  async function abortParkedMerge(job: Readonly<Job>): Promise<boolean> {
    await freeSlot(job, { outcome: 'stopped', cause: MERGE_ABORTED_CAUSE }, (hold) => {
      job.ticketIds.forEach((ticketId) => hold.board.setTicketMergeQueued(ticketId, false, hold.at));
    });
    return true;
  }

  async function advanceTheSlot(target: string): Promise<boolean> {
    const holding = await context.hold((hold) => {
      const job = hold.board.airlockHolderOf(target);
      if (job === undefined) return null;
      const parked = job.ticketIds.some((ticketId) => hold.board.ticketByReference(ticketId)?.frontmatter.hold?.startsWith(PARKED_HOLD_PREFIX) === true);
      return { job, parked, hasOpenIncident: hold.board.incidents().some((incident) => incident.jobId === job.id) };
    });
    if (holding === null || holding.job.airlock === undefined) return false;
    if (holding.parked && !holding.hasOpenIncident) return abortParkedMerge(holding.job);
    return advance(holding.job, holding.hasOpenIncident);
  }

  function predictionOf(target: string, candidate: MergeCandidate): { candidate: MergeCandidate; branchTip: string | null; conflictedFiles: string[] | null } {
    const branch    = context.branchNames.ticketBranchOf(candidate.ticketId);
    const branchTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${branch}`);
    const predicted = predictMerge(context.repositoryRoot, { target, branch });
    return { candidate, branchTip, conflictedFiles: predicted.verdict === 'clean' ? [] : predicted.verdict === 'conflicting' ? predicted.conflictedFiles : null };
  }

  /**
   * Design section 6.2's order: priority, clean first, fewest conflicts caused among the clean, readiness, ticket id. With merge approval
   * on, User's press order alone: readiness is the accept's place in the log, then ticket id.
   */
  function orderedPredictions(target: string, candidates: readonly MergeCandidate[], followsPressOrder: boolean): ReturnType<typeof predictionOf>[] {
    if (followsPressOrder) {
      const [first] = MergeQueueUtil.pressOrderOf(candidates.map((candidate) => ({ ...candidate, queuedLogPosition: candidate.readiness })));
      const prediction = first === undefined ? null : predictionOf(target, first);
      return prediction === null || prediction.branchTip === null ? [] : [prediction];
    }
    const predictions = candidates.map((candidate) => predictionOf(target, candidate)).filter((prediction) => prediction.branchTip !== null);
    const clean       = predictions.filter((prediction) => prediction.conflictedFiles?.length === 0);
    const conflictsCaused = new Map(predictions.map((prediction) => {
      const others = clean.filter((other) => other.candidate.ticketId !== prediction.candidate.ticketId);
      const branch = context.branchNames.ticketBranchOf(prediction.candidate.ticketId);
      const pairs  = others.map((other) => ({ target: context.branchNames.ticketBranchOf(other.candidate.ticketId), branch }));
      return [prediction.candidate.ticketId, predictMerges(context.repositoryRoot, pairs).filter((pair) => pair.verdict !== 'clean').length];
    }));
    const isClean = (prediction: ReturnType<typeof predictionOf>): number => (prediction.conflictedFiles?.length === 0 ? 0 : 1);
    return predictions.sort((a, b) => (
      MERGE_PRIORITY_RANK[a.candidate.priority] - MERGE_PRIORITY_RANK[b.candidate.priority]
      || isClean(a) - isClean(b)
      || (conflictsCaused.get(a.candidate.ticketId) ?? 0) - (conflictsCaused.get(b.candidate.ticketId) ?? 0)
      || a.candidate.readiness - b.candidate.readiness
      || Number(a.candidate.ticketId) - Number(b.candidate.ticketId)
    ));
  }

  /** A refused claim (a higher priority queued meanwhile, the slot taken, a release queued) is derived again in the next round. */
  function claimed(claim: () => void): boolean {
    try {
      claim();
      return true;
    } catch (refusal) {
      if (refusal instanceof BoardRefusal) return true;
      throw refusal;
    }
  }

  /** Due as MergeQueueUtil says, never while a refused refresh of the group waits for User or main holds nothing the group lacks. */
  function refreshIsDue(target: string, releaseIsQueuedOrSlotted: boolean, refreshWasRefused: boolean): boolean {
    if (refreshWasRefused) return false;
    const count = GitProcess.run(context.repositoryRoot, ['rev-list', '--count', `${target}..${mainLine}`]);
    const mainCommitsAheadOfGroup = GitProcess.succeeded(count) ? Number(count.standardOutput.trim()) : null;
    if (mainCommitsAheadOfGroup === 0) return false;
    return MergeQueueUtil.groupRefreshIsDue({
      mainCommitsAheadOfGroup,
      groupTipAgainstMain:            forecastOf(predictMerge(context.repositoryRoot, { target, branch: mainLine })),
      releaseTicketIsQueuedOrSlotted: releaseIsQueuedOrSlotted,
    }, context.limits);
  }

  async function allocateRefresh(target: string, releaseIsQueuedOrSlotted: boolean, refreshWasRefused: boolean): Promise<boolean> {
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`);
    const mainTip   = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`);
    if (targetTip === null || mainTip === null || !refreshIsDue(target, releaseIsQueuedOrSlotted, refreshWasRefused)) return false;
    return context.hold((hold) => {
      const tipsMoved = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`) !== targetTip
        || GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`) !== mainTip;
      return tipsMoved || claimed(() => hold.board.claimRefreshSlot({
        group: groupOf(target), target, targetTip, mainTip
      }, hold.at));
    });
  }

  /** A worktree git declines to remove stays as a leftover, which the Overseer's next start names to User. */
  function removeConstitutionCommitWorktree(job: Readonly<Job>): void {
    if (existsSync(ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, job.id))) {
      ConstitutionCommits.removeCommitWorktree(context.repositoryRoot, context.worktreesRoot, job.id);
    }
  }

  /**
   * Ends a constitution commit job with its worktree removed. `requestMove` runs in the same hold, after the end, and only when the request
   * still named the job: a request that User cancelled and asked again is not this job's to hold or refuse.
   */
  async function endConstitutionCommit(
    job: Readonly<Job>,
    ending: JobEnding,
    requestMove: (hold: AirlockHold, setupId: string) => void = () => undefined
  ): Promise<boolean> {
    removeConstitutionCommitWorktree(job);
    await context.hold((hold) => {
      const namingRequest = pendingApplyOf(hold.board, job.id);
      hold.board.endConstitutionCommitJob(job.id, ending, hold.at);
      if (namingRequest !== null) requestMove(hold, namingRequest.setupId);
    });
    return true;
  }

  /**
   * The `committing` phase: a worktree already there is one a run cut short left, so the job is an orphan and the next allocation replaces
   * it; a request that no longer names the job was cancelled. Otherwise the commit is made, and a refused one refuses the request.
   */
  async function runConstitutionCommit(job: Readonly<Job>): Promise<boolean> {
    if (existsSync(ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, job.id))) {
      return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    }
    const request = await context.hold((hold) => pendingApplyOf(hold.board, job.id));
    if (request === null) return endConstitutionCommit(job, { outcome: 'stopped', cause: APPLY_CANCELLED_CAUSE });
    const verdict = ConstitutionCommits.commitConstitution({
      repositoryRoot: context.repositoryRoot,
      worktreesRoot:  context.worktreesRoot,
      jobId:          job.id,
      targetTip:      slotOf(job).targetTip,
      constitutions:  request.constitutions,
      signsCommits:   context.repositorySignsCommits(),
    });
    if (verdict.verdict === 'refused') {
      return endConstitutionCommit(job, { outcome: 'failed', cause: verdict.reason }, (hold, setupId) => {
        hold.board.refuseApply(setupId, { reason: verdict.reason, gitFailure: verdict.gitFailure }, hold.at);
      });
    }
    const stillNamed = await context.hold((hold) => {
      if (pendingApplyOf(hold.board, job.id) === null) return false;
      setPhase(hold, job, 'landing');
      return true;
    });
    return stillNamed || endConstitutionCommit(job, { outcome: 'stopped', cause: APPLY_CANCELLED_CAUSE });
  }

  /**
   * The `landing` phase, with no gate: the commit lands by the same compare-and-swap fast-forward a ticket's landing uses, and the hold that
   * records the landing runs Apply's stage 2. A moved main line ends the job for a fresh one on the new tip; a main checkout that stops the
   * fast-forward holds the target and the request, which is never refused for it.
   */
  async function runConstitutionLanding(job: Readonly<Job>): Promise<boolean> {
    const slot     = slotOf(job);
    const worktree = ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, job.id);
    const commit   = existsSync(worktree) ? MergeRun.headOf(worktree) : null;
    if (commit === null || commit === slot.targetTip) {
      return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    }
    const landed = await context.hold((hold) => {
      const request = pendingApplyOf(hold.board, job.id);
      if (request === null) return { verdict: 'cancelled' } as const;
      const committedBlobs = committedBlobsOf(commit, request, context.repositoryRoot);
      if (committedBlobs === null) return { verdict: 'orphaned' } as const;
      const mainReading = committedReadingOf(commit, request, committedBlobs);
      if (mainReading === null) return { verdict: 'orphaned' } as const;
      const stageTwoRefusal = stageTwoRefusalOf(hold, request.setupId, mainReading);
      if (stageTwoRefusal !== null) {
        hold.board.endConstitutionCommitJob(job.id, { outcome: 'failed', cause: stageTwoRefusal }, hold.at);
        hold.board.refuseApply(request.setupId, { reason: stageTwoRefusal, gitFailure: null }, hold.at);
        return { verdict: 'stage-two-refused' } as const;
      }
      const verdict = Landing.landOnTarget({
        target:            { branch: mainLine, directory: context.repositoryRoot },
        mergedCommit:      commit,
        expectedTargetTip: slot.targetTip,
        recordedLandings:  hold.board.recordedLandingsOn(mainLine),
        hookPolicy:        'hooks-off',
        ...sharedLanding,
      });
      if (verdict.verdict === 'refused') return { verdict: 'refused', refusal: verdict } as const;
      hold.board.recordMergeLanded(job.id, { target: mainLine, commit: verdict.commit, kind: 'landed' }, hold.at);
      hold.board.endConstitutionCommitJob(job.id, { outcome: 'committed', commit: verdict.commit }, hold.at);
      hold.board.finishApply(request.setupId, {
        ...mainReading, draftRevision: request.draftRevision, resumesBoard: request.resumesBoard, constitutionCommit: verdict.commit
      }, hold.at);
      return { verdict: 'landed' } as const;
    });
    if (landed.verdict === 'cancelled') return endConstitutionCommit(job, { outcome: 'stopped', cause: APPLY_CANCELLED_CAUSE });
    if (landed.verdict === 'orphaned') return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    if (landed.verdict !== 'refused') {
      removeConstitutionCommitWorktree(job);
      return true;
    }
    const { refusal } = landed;
    // The commit and its worktree stay for a later sweep, which finds the lock its sibling held free again.
    if (LANDING_OUTCOME_OF_REFUSAL[refusal.reason] === 'wait-for-the-landing-lock') return false;
    const heldReason = HELD_APPLY_REASONS.find((reason) => reason === refusal.reason);
    // A main line moved by anyone: only the listed constitutions change, so a fresh job commits again on the new tip.
    if (heldReason === undefined) return endConstitutionCommit(job, { outcome: 'stopped', cause: refusal.reason });
    const blockingFiles = refusal.facts.blockingFiles ?? [];
    const heldFiles     = refusal.facts.heldFiles ?? [];
    holdTarget({
      target: mainLine, branch: currentBranchIn(context.repositoryRoot), blockingFiles, heldFiles
    }, commit);
    return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetHeld }, (hold, setupId) => {
      hold.board.holdApply(setupId, { reason: heldReason, blockingFiles: [...blockingFiles, ...heldFiles] }, hold.at);
    });
  }

  /**
   * What the constitution commit holds once it lands: each listed constitution with its recorded text and the blob the commit holds, and
   * on a draft over entities every other entity's file as the commit holds it; `null` when git cannot tell.
   */
  function committedReadingOf(commit: string, request: Readonly<ConstitutionCommitRequest>, committedBlobs: readonly string[]): ApplyMainReading | null {
    const committedOf = ({ path, markdown }: Readonly<ConstitutionFileCommit>, index: number): MainConstitution => ({ path, markdown, blob: committedBlobs[index] ?? '' });
    const committed = new Map(request.constitutions.map((constitution, index) => [constitution.path, committedOf(constitution, index)]));
    const readings = new Map<string, MainConstitution | null>();
    for (const path of pathsReadOf(request)) {
      const listed = committed.get(path);
      if (listed !== undefined) {
        readings.set(path, listed);
        continue;
      }
      const reading = InstructionFiles.mainConstitutionAt(context.repositoryRoot, commit, path);
      if (reading.verdict === 'unreadable') return null;
      readings.set(path, reading.verdict === 'read' ? reading.constitution : null);
    }
    return applyMainReadingOf(request, (path) => readings.get(path) ?? null);
  }

  /**
   * What stage 2 would refuse, checked before the commit lands so that a refused Apply leaves main as it was: the stored pipeline moved,
   * or a ticket started or took an entity the draft removes while the request waited (E94, E91).
   */
  function stageTwoRefusalOf(hold: AirlockHold, setupId: string, mainReading: ApplyMainReading): ApplyRequestReason | null {
    if (hold.board.storedPipelineMovedSince(setupId, mainReading)) return 'pipeline-moved';
    return hold.board.entityChangeRefusalOf(setupId);
  }

  /** Stage 2 at once, with no commit, when main already holds every draft's text: the commit landed, or User committed it by hand. */
  function finishWithoutACommit(hold: AirlockHold, request: ConstitutionCommitRequest, mainReading: ApplyMainReading): void {
    const stageTwoRefusal = stageTwoRefusalOf(hold, request.setupId, mainReading);
    if (stageTwoRefusal !== null) {
      hold.board.refuseApply(request.setupId, { reason: stageTwoRefusal, gitFailure: null }, hold.at);
      return;
    }
    hold.board.finishApply(request.setupId, {
      ...mainReading, draftRevision: request.draftRevision, resumesBoard: request.resumesBoard, constitutionCommit: null
    }, hold.at);
  }

  /**
   * An Apply waiting for its commit goes before any ticket candidate of the main line, also while the board is paused, since a first Apply
   * resumes the board only in stage 2. `none`: no request waits, so the tickets go; `waits`: the request waits, and so does every ticket.
   */
  async function allocateConstitutionCommit(): Promise<'none' | 'waits' | 'allocated'> {
    const waiting = await context.hold((hold) => {
      const request = pendingApplyOf(hold.board);
      if (request === null) return null;
      return { request, slotIsHeld: hold.board.airlockHolderOf(mainLine) !== undefined };
    });
    if (waiting === null) return 'none';
    if (waiting.slotIsHeld) return 'waits';
    const { request } = waiting;
    const readings = new Map<string, MainConstitution | null>();
    for (const path of pathsReadOf(request)) {
      const reading = context.mainConstitutionOf(path);
      if (reading.verdict === 'unreadable') return 'waits';
      readings.set(path, reading.verdict === 'read' ? reading.constitution : null);
    }
    const mainHoldsEveryText = request.constitutions.every((constitution) => mainHoldsTheText(readings.get(constitution.path) ?? null, constitution.markdown));
    if (mainHoldsEveryText) {
      const mainReading = applyMainReadingOf(request, (path) => readings.get(path) ?? null);
      await context.hold((hold) => {
        if (pendingApplyOf(hold.board)?.setupId === request.setupId) finishWithoutACommit(hold, request, mainReading);
      });
      return 'allocated';
    }
    if (heldTargets.has(mainLine)) return 'waits';
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`);
    if (targetTip === null) return 'waits';
    const claimedNow = await context.hold((hold) => {
      if (GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`) !== targetTip) return true;
      return claimed(() => hold.board.claimConstitutionCommitSlot({ setupId: request.setupId, target: mainLine, targetTip }, hold.at));
    });
    return claimedNow ? 'allocated' : 'waits';
  }

  async function allocate(target: string): Promise<boolean> {
    if (target === mainLine) {
      const constitutionCommit = await allocateConstitutionCommit();
      if (constitutionCommit !== 'none') return constitutionCommit === 'allocated';
    }
    if (heldTargets.has(target) || context.dispatchIsStopped()) return false;
    const queue = await context.hold((hold) => {
      if (hold.board.airlockHolderOf(target) !== undefined || hold.board.pipeline() === null) return null;
      const isGroup = target !== mainLine;
      return {
        candidates:               hold.board.mergeCandidatesOf(target, targetOf, branchTreeOf),
        followsPressOrder:        hold.board.mergeApprovalIsOn(),
        releaseIsQueuedOrSlotted: isGroup && hold.board.groupReleaseQueuedOrSlotted(groupOf(target)) !== null,
        refreshWasRefused:        isGroup && hold.board.decisions().some((decision) => (
          decision.kind === 'merge-refused' && decision.ticketIds.length === 0 && decision.context.startsWith(`${target}${REFRESH_REFUSAL_SEPARATOR}`)
        )),
      };
    });
    if (queue === null) return false;
    if (target !== mainLine && await allocateRefresh(target, queue.releaseIsQueuedOrSlotted, queue.refreshWasRefused)) return true;
    const [first] = orderedPredictions(target, queue.candidates, queue.followsPressOrder);
    if (first?.branchTip === undefined || first.branchTip === null) return false;
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`);
    if (targetTip === null) return false;
    const { branchTip } = first;
    return context.hold((hold) => {
      const tipsMoved = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`) !== targetTip
        || GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${context.branchNames.ticketBranchOf(first.candidate.ticketId)}`) !== branchTip;
      return tipsMoved || claimed(() => hold.board.claimAirlock({
        ticketId: first.candidate.ticketId, target, targetTip, branchTip, predictedConflictFiles: first.conflictedFiles ?? [],
      }, targetOf, branchTreeOf, hold.at));
    });
  }

  /** The main line, every group with an open ticket, and every target a slot still holds. */
  async function liveTargets(): Promise<string[]> {
    return context.hold((hold) => {
      const targets = new Set([mainLine]);
      for (const { frontmatter } of hold.board.tickets()) {
        if (frontmatter.group !== undefined && frontmatter.status !== 'delivered' && frontmatter.status !== 'abandoned') targets.add(`${groupTargetPrefix}${frontmatter.group}`);
      }
      for (const job of hold.board.jobs()) if ((job.kind === 'merge' || isRefresh(job) || isConstitutionCommit(job)) && job.target !== null) targets.add(job.target);
      return [...targets];
    });
  }

  async function sweep(): Promise<readonly HeldTarget[]> {
    recheckHeldTargets();
    for (let round = 0; round < ROUNDS_PER_SWEEP; round += 1) {
      let moved = false;
      for (const target of await liveTargets()) {
        const advanced  = await advanceTheSlot(target);
        const regated   = await settleTicketsAwaitingGreen(target);
        const allocated = await allocate(target);
        moved = moved || advanced || regated || allocated;
      }
      if (!moved) break;
    }
    return [...heldTargets.values()];
  }

  return { sweep };
}
