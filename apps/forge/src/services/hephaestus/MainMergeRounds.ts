/**
 * A job's rounds in `merging-main`: the target merged in and the tree gated before the ticket waits for User's Merge, a conflict sent back
 * to the session and its resolution re-reviewed.
 */
import { existsSync, mkdirSync }                                  from 'node:fs';
import { dirname, join }                                          from 'node:path';
import { type MainMergeConflict, MainMergeConflictIngestion }     from '../../adapters/main-conflict/MainMergeConflictIngestion.ts';
import { createMainMergeConflictWriter }                          from '../../adapters/main-conflict/MainMergeConflictWriter.ts';
import { type MainMergeResolution, MainMergeResolutionIngestion } from '../../adapters/main-resolution/MainMergeResolutionIngestion.ts';
import { createMainMergeResolutionWriter }                        from '../../adapters/main-resolution/MainMergeResolutionWriter.ts';
import { createMergeSidesWriter }                                 from '../../adapters/merge-sides/MergeSidesWriter.ts';
import type { Job }                                               from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                         from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                          from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                                             from '../../domain/tracker-model/Board.ts';
import { STOPPED_BY_USER_CAUSE }                                  from '../../domain/tracker-model/JobControls.ts';
import { FIRST_CHILD_INSTANCE }                                   from '../../domain/tracker-model/constants/JobStates.ts';
import { writeFileAtomically }                                    from '../../lib/atomic-file/AtomicFile.ts';
import { WIND_DOWN_GRACE_CALLS }                                  from '../../shared/constants/HephaestusLimits.ts';
import { StepProblemFactsUtil }                                   from '../../shared/utils/StepProblemFactsUtil.ts';
import { MergeRun }                                               from '../lifecycle/MergeRun.ts';
import type {
  BuildJobObservation,
  ConflictReReviewReading,
  MainMergeReading,
  MainMergeStep
} from './@types/BuildJobObservation.ts';
import type { HoldContext }                                               from './@types/HoldContext.ts';
import type { GateRunPlace }                                              from './@types/JobGateRun.ts';
import type { JobLaunchContext }                                          from './@types/JobLaunchContext.ts';
import { BuildJobHold }                                                   from './BuildJobHold.ts';
import { BuildJobSessions }                                               from './BuildJobSessions.ts';
import { GateSettlement }                                                 from './GateSettlement.ts';
import { jobFolderIn }                                                    from './HephaestusFiles.ts';
import { JobGateRuns }                                                    from './JobGateRuns.ts';
import { JobLines }                                                       from './JobLines.ts';
import { MergeIntoTree, type MergeIntoTreeFiles, type TargetMergeRecord } from './MergeIntoTree.ts';
import { StoredFileUnreadable }                                           from './StoredFileUnreadable.ts';
import { CONFLICT_RE_REVIEWER_ROLE, REVIEW_JOB_KIND, WorktreeJobs }       from './WorktreeJobs.ts';
import { BUILD_JOB_CAUSES }                                               from './constants/BuildJobCauses.ts';

/**
 * What a job in `merging-main` keeps per round, each name suffixed with the round's child instance like a gate folder: the tips its merge
 * was checked against, the merge's settlement, a conflict sent to the session, the resolution kept for it, and the tree the hold asked to gate.
 */
const MAIN_MERGE_FILES = {
  record:       'main-merge',
  settlement:   'main-merge-settlement',
  conflict:     'main-conflict',
  resolution:   'main-resolution',
  gateRequired: 'main-gate-required',
} as const;
const MAIN_MERGE_CHILD_FOLDER = 'main-merge';
const MAIN_MERGE_FOLDER_PREFIX = 'main-';
const JSON_EXTENSION = '.json';

/**
 * The newest round before the current one whose merge conflicted; `null` when none did. A round's conflict that cannot be read stops the
 * look, so no older round's conflict stands in for it.
 */
function newestMainMergeConflictOf(trackerDirectory: string, job: Readonly<Job>): { round: number; conflict: MainMergeConflict } | null | StoredFileUnreadable {
  for (let round = job.childInstance - 1; round >= FIRST_CHILD_INSTANCE; round -= 1) {
    const conflictFilePath = mainMergeFileOf(trackerDirectory, job, MAIN_MERGE_FILES.conflict, round);
    const reading = new MainMergeConflictIngestion(conflictFilePath).read();
    if (reading.verdict === 'unreadable') return StoredFileUnreadable.unreadableFileOf(trackerDirectory, conflictFilePath, reading.problem);
    if (reading.verdict === 'readable') return { round, conflict: reading.conflict };
  }
  return null;
}

/**
 * The resolution of the newest conflict, kept at the first look after the session that resolved it reached `merging-main` again: its HEAD
 * then, and the lines that commit changed against git's automatic merge, so a later commit on top never changes what was measured. One kept
 * that cannot be read is never measured again.
 */
function mainMergeResolutionOf(context: JobLaunchContext, job: Readonly<Job>): MainMergeResolution | null | StoredFileUnreadable {
  const { trackerDirectory } = context.workspace;
  const newest = newestMainMergeConflictOf(trackerDirectory, job);
  if (newest === null || StoredFileUnreadable.isUnreadableFile(newest)) return newest;
  const resolutionPath = mainMergeFileOf(trackerDirectory, job, MAIN_MERGE_FILES.resolution, newest.round);
  const kept = new MainMergeResolutionIngestion(resolutionPath).read();
  if (kept.verdict === 'readable') return kept.resolution;
  if (kept.verdict === 'unreadable') return StoredFileUnreadable.unreadableFileOf(trackerDirectory, resolutionPath, kept.problem);
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const resolutionCommit = MergeRun.headOf(worktree);
  // Fail closed: a HEAD git cannot read is re-reviewed against no commit, which refuses, and nothing is kept for it.
  if (resolutionCommit === null) return {
    conflictRound: newest.round, ...newest.conflict, resolutionCommit: '', lines: null
  };
  const resolution: MainMergeResolution = {
    conflictRound: newest.round, ...newest.conflict, resolutionCommit, lines: context.resolutionLinesOf(worktree)
  };
  createMainMergeResolutionWriter(resolutionPath).write(resolution);
  return resolution;
}

/** Read from the job folder and the worktree alone, so a restart reads the same step of the same round again. */
function mainMergeStepOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): MainMergeStep {
  const round    = job.childInstance;
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const unreadableTree: MainMergeStep = { verdict: 'merge-failed', problem: { code: 'head-tree-unreadable', branch: WorktreeJobs.branchOf(context, job) } };
  if (existsSync(mainMergeFileOf(context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.gateRequired, round))) {
    const treeId = WorktreeJobs.treeOf(worktree);
    if (treeId === null) return unreadableTree;
    const progress = JobGateRuns.gateRunProgressOf(context, job, treeId, mainMergeGateRunOf(job, round), pipeline);
    if (progress.verdict === 'unreadable-file') return progress;
    return progress.verdict === 'running' ? { verdict: 'gating', stepIndex: progress.stepIndex } : { verdict: 'gated', gate: progress };
  }
  const record = MergeIntoTree.mergeSidesOf(context.workspace.trackerDirectory, mainMergeFileOf(context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.record, round));
  if (StoredFileUnreadable.isUnreadableFile(record)) return record;
  if (record === null) {
    const check = MergeIntoTree.firstTargetCheckOf(context, job);
    if (check.verdict === 'behind' || check.verdict === 'merge-failed') return check;
    const treeId = WorktreeJobs.treeOf(worktree);
    return treeId === null ? unreadableTree : { verdict: 'up-to-date', treeId };
  }
  const files = mainMergeIntoTreeFilesOf(round);
  const settlement = MergeIntoTree.mergeSettlementOf(context.workspace.trackerDirectory, join(WorktreeJobs.jobFolderOf(context.workspace, job), files.settlementFile));
  if (StoredFileUnreadable.isUnreadableFile(settlement)) return settlement;
  if (settlement === null) {
    const mergeEnd = JobLines.lineEndOf(context.boardChildren, join(WorktreeJobs.jobFolderOf(context.workspace, job), files.childFolder));
    return JobLines.lineIsUnjudged(mergeEnd) ? { verdict: 'merging' } : { verdict: 'merge-ended' };
  }
  if (settlement.verdict === 'failed') return { verdict: 'merge-failed', problem: { code: 'merge-settled-failed', storedReason: settlement.storedReason } };
  if (settlement.verdict === 'conflicted') return {
    verdict: 'conflicted', targetTip: record.mergedTip, branchTip: record.startTip, conflictedFiles: settlement.conflictedFiles
  };
  const treeId = WorktreeJobs.treeOf(worktree);
  return treeId === null ? unreadableTree : { verdict: 'merged', treeId };
}

function mainMergeReadingOf(context: JobLaunchContext, jobs: readonly Readonly<Job>[], job: Readonly<Job>, pipeline: Readonly<Pipeline> | null): MainMergeReading | null {
  if (job.state !== 'merging-main' || pipeline === null) return null;
  if (conflictReReviewerOf(jobs, job) !== undefined) return { step: { verdict: 're-reviewing' }, resolution: null };
  const resolution = pipeline.airlock?.reReview === undefined ? null : mainMergeResolutionOf(context, job);
  // The round settles on its resolution, so one that cannot be read is the round's step: nothing of the round goes on.
  if (StoredFileUnreadable.isUnreadableFile(resolution)) return { step: resolution, resolution: null };
  return { step: mainMergeStepOf(context, job, pipeline), resolution };
}

/** The conflict re-reviewer is judged by the reviewer column's checks once its report reached Customs, against the resolution it re-reviewed. */
function conflictReReviewReadingOf(
  context: JobLaunchContext, jobs: readonly Readonly<Job>[], job: Readonly<Job>, pipeline: Readonly<Pipeline> | null
): ConflictReReviewReading | null {
  const reReviewer = conflictReReviewerOf(jobs, job);
  if (reReviewer === undefined) return null;
  const liveness = context.boardChildren.livenessOf(WorktreeJobs.jobFolderOf(context.workspace, reReviewer), reReviewer.childInstance);
  const { calls, report } = BuildJobSessions.sessionReadingOf(context, reReviewer);
  const resolution = reReviewer.state === 'in-customs' && pipeline?.airlock?.reReview !== undefined ? mainMergeResolutionOf(context, job) : null;
  const judgedOn = resolution === null || StoredFileUnreadable.isUnreadableFile(resolution) ? resolution : resolution.resolutionCommit;
  return {
    jobId:        reReviewer.id,
    calls,
    sessionEnded: liveness.verdict !== 'live',
    verdict:      judgedOn === null || StoredFileUnreadable.isUnreadableFile(judgedOn)
      ? judgedOn
      : MergeRun.reReviewVerdictOf(WorktreeJobs.worktreeOf(context.workspace, job), judgedOn, report, context.agentAdapter),
  };
}

function mainMergeFileOf(trackerDirectory: string, job: Readonly<Job>, name: string, round: number): string {
  return join(jobFolderIn(trackerDirectory, job.id), `${name}${JobGateRuns.instanceSuffixOf(round)}${JSON_EXTENSION}`);
}

/** A round's merge, in a line child folder of its own beside its settlement. */
function mainMergeIntoTreeFilesOf(round: number): MergeIntoTreeFiles {
  return {
    childFolder:    `${MAIN_MERGE_CHILD_FOLDER}${JobGateRuns.instanceSuffixOf(round)}`,
    settlementFile: `${MAIN_MERGE_FILES.settlement}${JobGateRuns.instanceSuffixOf(round)}${JSON_EXTENSION}`,
  };
}

/** A round's gate run: the job's own phase, in folders prefixed apart from the gate runs of its session. */
function mainMergeGateRunOf(job: Readonly<Job>, round: number): GateRunPlace {
  return { phase: JobGateRuns.gatePhaseOfJob(job), childInstance: round, folderPrefix: MAIN_MERGE_FOLDER_PREFIX };
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
  const ticketId   = WorktreeJobs.ticketIdOf(job);
  const headCommit = MergeRun.headOf(WorktreeJobs.worktreeOf(hold.context.workspace, job)) ?? '';
  if (job.kind === REVIEW_JOB_KIND) BuildJobHold.endJob(hold, job, { outcome: 'reviewed', commit: headCommit });
  else GateSettlement.settleBuilt(hold, job, observation.report, headCommit);
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
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.reReviewFailed });
    return;
  }
  if (board.greenIsCurrent(WorktreeJobs.ticketIdOf(job), treeId, JobGateRuns.gatePhaseOfJob(job))) {
    finishMainMerge(hold, job, observation, treeId);
    return;
  }
  const markerPath = mainMergeFileOf(hold.context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.gateRequired, job.childInstance);
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
  if (reReviewer.state === 'running' && reading.calls >= BuildJobSessions.callBudgetOf(reReviewer) + WIND_DOWN_GRACE_CALLS) {
    hold.logged.push(...board.moveJob(reReviewer.id, 'stopping', at).logged);
    return;
  }
  if (!reading.sessionEnded) return;
  if (reReviewer.state === 'stopping') {
    BuildJobHold.endJob(hold, reReviewer, BuildJobHold.userStopEndingOf(reReviewer) ?? { outcome: 'stopped', cause: BUILD_JOB_CAUSES.outOfCalls });
    return;
  }
  // Its parent's hold opened the incident for a resolution that cannot be read, and judges nothing on it.
  if (reReviewer.state !== 'in-customs' || reading.verdict === null || reading.verdict.verdict === 'unreadable-file') return;
  if (reading.verdict.verdict === 'holds') BuildJobHold.endJob(hold, reReviewer, { outcome: 'reviewed' });
  else BuildJobHold.endJob(hold, reReviewer, { outcome: 'does-not-hold', cause: BUILD_JOB_CAUSES.reReviewFailed });
}

/** A job stopped while its conflict re-reviewer works stops the re-reviewer first, and ends once that one ended. */
function stopTheConflictReReviewer(hold: HoldContext, reReviewer: Readonly<Job>, reading: ConflictReReviewReading | null): void {
  const { board, at } = hold.change;
  if (reReviewer.state !== 'stopping') {
    hold.logged.push(...board.moveJob(reReviewer.id, 'stopping', at).logged);
    return;
  }
  if (reading?.sessionEnded === true) BuildJobHold.endJob(hold, reReviewer, { outcome: 'stopped', cause: STOPPED_BY_USER_CAUSE });
}

/** A conflict goes back to the job's own session, the ticket's last worker, as a red handoff naming the target tip and the conflicted files. */
function sendConflictToTheSession(hold: HoldContext, job: Readonly<Job>, conflict: Extract<MainMergeStep, { verdict: 'conflicted' }>): void {
  const conflictPath = mainMergeFileOf(hold.context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.conflict, job.childInstance);
  mkdirSync(dirname(conflictPath), { recursive: true });
  createMainMergeConflictWriter(conflictPath).write({ targetTip: conflict.targetTip, branchTip: conflict.branchTip, conflictedFiles: conflict.conflictedFiles });
  BuildJobHold.interruptOnRedHandoff(hold, job, {
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
      BuildJobHold.openIncidentFor(hold, job, 'setup-failed', { step: MAIN_MERGE_CHILD_FOLDER, ...StepProblemFactsUtil.factsOf(step.problem) });
      BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
      return;
    case 'conflicted':
      sendConflictToTheSession(hold, job, step);
      return;
    case 'up-to-date':
    case 'merged':
      settleMergedTree(hold, job, observation, reading, step.treeId);
      return;
    case 'gated':
      if (GateSettlement.settleJudgedGate(hold, job, step.gate, step.gate.manifest)) finishMainMerge(hold, job, observation, step.gate.treeId);
      return;
    default:
  }
}

/**
 * After the hold: what a round of `merging-main` asks of git and Talos, read afresh. Nothing merges while a conflict re-reviewer
 * works in the worktree: a target that moved meanwhile is merged once it ended.
 */
async function runMainMergeEffects(context: JobLaunchContext, board: Board, job: Readonly<Job>, pipeline: Readonly<Pipeline>): Promise<void> {
  if (conflictReReviewerOf(board.jobs(), job) !== undefined) return;
  const round = job.childInstance;
  const step = mainMergeReadingOf(context, board.jobs(), job, pipeline)?.step;
  if (step === undefined) return;
  const files = mainMergeIntoTreeFilesOf(round);
  const recordPath = mainMergeFileOf(context.workspace.trackerDirectory, job, MAIN_MERGE_FILES.record, round);
  if (step.verdict === 'behind') {
    const record: TargetMergeRecord = { startTip: step.branchTip, mergedTip: step.targetTip };
    mkdirSync(dirname(recordPath), { recursive: true });
    createMergeSidesWriter(recordPath).write(record);
    await MergeIntoTree.launchMergeIntoTree(context, job, files, record);
    return;
  }
  if (step.verdict === 'gating') await JobGateRuns.spawnGateRunStep(context, job, { place: mainMergeGateRunOf(job, round), pipeline, stepIndex: step.stepIndex });
  // An unreadable record already read as the round's verdict, so nothing merges or settles on it.
  const record = MergeIntoTree.mergeSidesOf(context.workspace.trackerDirectory, recordPath);
  if (record === null || StoredFileUnreadable.isUnreadableFile(record)) return;
  if (step.verdict === 'merging') await MergeIntoTree.launchMergeIntoTree(context, job, files, record);
  if (step.verdict === 'merge-ended') MergeIntoTree.writeMergeSettlement(context, job, files, MergeRun.settleTargetMerge(WorktreeJobs.worktreeOf(context.workspace, job), record));
}

/** What the conflict re-reviewer under a job in `merging-main` is told: the newest conflict its job's session resolved; `null` with none. */
function mainMergeConflictOf(trackerDirectory: string, job: Readonly<Job>): MainMergeConflict | null | StoredFileUnreadable {
  const newest = newestMainMergeConflictOf(trackerDirectory, job);
  return newest === null || StoredFileUnreadable.isUnreadableFile(newest) ? newest : newest.conflict;
}

export const MainMergeRounds = Object.freeze({
  mainMergeReadingOf,
  conflictReReviewReadingOf,
  conflictReReviewerOf,
  stopTheConflictReReviewer,
  settleMainMerge,
  runMainMergeEffects,
  mainMergeConflictOf,
});
