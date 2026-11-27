/**
 * A review job's catch-up before its reviewer: the target merged into the branch and the merged tree gated, and a conflict or red gate
 * handed back to the stage that owns it.
 */
import { mkdirSync }                                                      from 'node:fs';
import { join }                                                           from 'node:path';
import { createMergeSidesWriter }                                         from '../../adapters/merge-sides/MergeSidesWriter.ts';
import { TargetConflictIngestion }                                        from '../../adapters/target-conflict/TargetConflictIngestion.ts';
import { createTargetConflictWriter }                                     from '../../adapters/target-conflict/TargetConflictWriter.ts';
import type { Job }                                                       from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                                 from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                                  from '../../domain/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft }                                             from '../../domain/tracker-model/@types/PlaybookStep.ts';
import { PARKED_HOLD_PREFIX }                                             from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { FIRST_CHILD_INSTANCE }                                           from '../../domain/tracker-model/constants/JobStates.ts';
import { TicketStageUtil }                                                from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { DISPATCH_PROTOCOL }                                              from '../../shared/constants/DispatchProtocol.ts';
import { LIFECYCLE_LIMITS }                                               from '../../shared/constants/LifecycleLimits.ts';
import { StepProblemFactsUtil }                                           from '../../shared/utils/StepProblemFactsUtil.ts';
import { CONFLICT_WITHOUT_ONE_OWNER_PARK_CAUSE, MergeRun }                from '../lifecycle/MergeRun.ts';
import type { GateProgress, TargetCatchUp, TargetCatchUpHandover }        from './@types/BuildJobObservation.ts';
import type { HoldContext }                                               from './@types/HoldContext.ts';
import type { GateRunPlace }                                              from './@types/JobGateRun.ts';
import type { JobLaunchContext }                                          from './@types/JobLaunchContext.ts';
import { BuildJobHold }                                                   from './BuildJobHold.ts';
import { GateSettlement }                                                 from './GateSettlement.ts';
import { jobFolderIn }                                                    from './HephaestusFiles.ts';
import { GATE_LOG_FILE, JobGateRuns, PREPARE_STEP_NAME }                  from './JobGateRuns.ts';
import { JobLines }                                                       from './JobLines.ts';
import { JobPreparation }                                                 from './JobPreparation.ts';
import { MergeIntoTree, type MergeIntoTreeFiles, type TargetMergeRecord } from './MergeIntoTree.ts';
import { RedHandoff }                                                     from './RedHandoff.ts';
import { StoredFileUnreadable }                                           from './StoredFileUnreadable.ts';
import { JOB_FILES, REVIEW_JOB_KIND, WorktreeJobs }                       from './WorktreeJobs.ts';
import { BUILD_JOB_CAUSES }                                               from './constants/BuildJobCauses.ts';

const TARGET_MERGE_CHILD_FOLDER = 'target-merge';
/** Before each catch-up gate folder, so the review's own gate run after its session never reads a catch-up verdict. */
const TARGET_GATE_FOLDER_PREFIX = 'target-';

/** The causes a review job ends `does-not-hold` with when its branch could not be brought up to the target before the reviewer. */
const TARGET_CATCH_UP_CAUSES: readonly string[] = [BUILD_JOB_CAUSES.targetConflict, BUILD_JOB_CAUSES.targetGateRed];

/** The merge before review gates the merged tree in the build phase, since what it finds goes back to the builder. */
export const TARGET_GATE_RUN: GateRunPlace = { phase: 'build', childInstance: FIRST_CHILD_INSTANCE, folderPrefix: TARGET_GATE_FOLDER_PREFIX };

/** Read from the job folder and the worktree alone, so a restart reads the same step again. */
function targetCatchUpOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline> | null): TargetCatchUp {
  if (job.kind !== REVIEW_JOB_KIND || job.state !== 'preparing' || pipeline === null) return { verdict: 'not-checked' };
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  const record = MergeIntoTree.mergeSidesOf(context.workspace.trackerDirectory, join(jobFolder, JOB_FILES.targetMerge));
  if (StoredFileUnreadable.isUnreadableFile(record)) return record;
  if (record === null) return MergeIntoTree.firstTargetCheckOf(context, job);
  const settlement = MergeIntoTree.mergeSettlementOf(context.workspace.trackerDirectory, join(jobFolder, JOB_FILES.targetMergeSettlement));
  if (StoredFileUnreadable.isUnreadableFile(settlement)) return settlement;
  if (settlement === null) {
    const mergeEnd = JobLines.lineEndOf(context.boardChildren, join(jobFolder, TARGET_MERGE_CHILD_FOLDER));
    return JobLines.lineIsUnjudged(mergeEnd) ? { verdict: 'merging' } : { verdict: 'merge-ended' };
  }
  if (settlement.verdict === 'failed') return { verdict: 'merge-failed', problem: { code: 'merge-settled-failed', storedReason: settlement.storedReason } };
  if (settlement.verdict === 'conflicted') return { verdict: 'conflicted', targetTip: record.mergedTip, conflictedFiles: settlement.conflictedFiles };
  const treeId = WorktreeJobs.treeOf(WorktreeJobs.worktreeOf(context.workspace, job));
  if (treeId === null) return { verdict: 'merge-failed', problem: { code: 'merge-tree-unreadable', mergeCommit: settlement.mergeCommit } };
  const progress = JobGateRuns.gateRunProgressOf(context, job, treeId, TARGET_GATE_RUN, pipeline);
  if (progress.verdict === 'running') return { verdict: 'gating', stepIndex: progress.stepIndex };
  if (progress.verdict === 'unreadable-file') return progress;
  return { verdict: 'gated', targetTip: record.mergedTip, gate: progress };
}

/**
 * The review ends `does-not-hold` and its ticket goes back `in-progress`, as a review whose claim did not hold: the builder's session is
 * resumed with the handover kept in the review's job folder, and the return counts in its handoff cycle, which parks the ticket past its resumes.
 * A package review runs while its ticket stays in progress, so only its bar closes.
 */
function returnToBuilder(hold: HoldContext, job: Readonly<Job>, cause: string): void {
  const { board, at } = hold.change;
  BuildJobHold.endJob(hold, job, { outcome: 'does-not-hold', cause });
  if (TicketStageUtil.stageOfJob(job)?.name === 'package-review') {
    hold.logged.push(...board.closeStageReviewBars(WorktreeJobs.ticketIdOf(job), at).logged);
    return;
  }
  hold.logged.push(...board.moveTicket(WorktreeJobs.ticketIdOf(job), 'in-progress', { checksLegality: true }, at).logged);
}

/** The red gate on the merged tree, written as the restart of a red handoff in the review's job folder, which the resumed builder reads. */
function returnRedTargetGate(hold: HoldContext, job: Readonly<Job>, gate: Extract<GateProgress, { verdict: 'judged' }>): void {
  const jobFolder = WorktreeJobs.jobFolderOf(hold.context.workspace, job);
  const pipelineGate = gate.manifest?.gates.find((candidate) => candidate.name === gate.step);
  mkdirSync(jobFolder, { recursive: true });
  RedHandoff.writeRedHandoff(jobFolder, {
    kind:                'gate',
    name:                gate.step ?? '',
    command:             pipelineGate?.run ?? null,
    fixCommand:          pipelineGate?.fix ?? null,
    commit:              MergeRun.headOf(WorktreeJobs.worktreeOf(hold.context.workspace, job)) ?? '',
    exitCode:            gate.exitCode ?? null,
    gateFailureNotePath: RedHandoff.gateFailureNotePathOf(jobFolder),
    fullLogPath:         join(jobFolder, GATE_LOG_FILE),
    resume:              0,
    resumesAllowed:      LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    callBudget:          DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET,
    interruptedInstance: job.childInstance,
  }, gate.output);
  returnToBuilder(hold, job, BUILD_JOB_CAUSES.targetGateRed);
}

/**
 * A crossing ticket's review sent back by its catch-up goes to the entity that owns the cause (E66), not to whichever builder ran last; a
 * review's catch-up runs only the gates of the review's own entity, so a red gate has no files and is that entity's to fix. A package review
 * goes back to its package's build when only the package's files conflict. The home review goes back to `adapt` when no sealed package's
 * file conflicts, and to the package's build when only that package's files conflict, its seal lifted and the return counted; a second
 * return opens `second-return`, naming the package, and keeps the stage (E45). A conflict that no one stage may resolve, such as one in a
 * package's and in the home's files, or one in home files for a package review, parks the ticket for User. Nothing for any other review.
 */
function routeCatchUpToItsOwner(hold: HoldContext, job: Readonly<Job>, conflictedFiles: readonly string[]): void {
  const { board, at } = hold.change;
  const ticketId = WorktreeJobs.ticketIdOf(job);
  const rowStage = board.ticketStageOf(ticketId);
  const entities = board.pipeline()?.entities;
  const homeEntity = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.entity;
  if (rowStage === null || entities === undefined || homeEntity === undefined) return;
  if (rowStage.name === 'package-review') {
    const part = MergeRun.firstConflictPartOf({ entities, homeEntity, sealedPackages: [rowStage.entity] }, conflictedFiles);
    if (part === null || (part.packageEntity === rowStage.entity && !part.leavesTheMergeOpen)) {
      board.moveTicketStage(ticketId, { name: 'package-build', entity: rowStage.entity }, at);
      return;
    }
    parkTheCatchUp(hold, ticketId, CONFLICT_WITHOUT_ONE_OWNER_PARK_CAUSE, conflictedFiles);
    return;
  }
  if (rowStage.name !== 'review') return;
  const part = MergeRun.firstConflictPartOf({ entities, homeEntity, sealedPackages: Object.keys(board.ticketSealsOf(ticketId)) }, conflictedFiles);
  if (part === null || part.packageEntity === null) {
    board.moveTicketStage(ticketId, { name: 'adapt', entity: homeEntity }, at);
    return;
  }
  if (part.leavesTheMergeOpen) {
    parkTheCatchUp(hold, ticketId, CONFLICT_WITHOUT_ONE_OWNER_PARK_CAUSE, conflictedFiles);
    return;
  }
  hold.logged.push(...board.returnTicketToThePackage(ticketId, part.packageEntity, hold.context.decisionWordingOf, at).logged);
}

/** The ticket of a review sent back by its catch-up, parked for User with the conflicted files as the decision's context. */
function parkTheCatchUp(hold: HoldContext, ticketId: string, parkCause: string, conflictedFiles: readonly string[]): void {
  const { board, at } = hold.change;
  const draft: DecisionDraft = { kind: 'parked', ticketIds: [ticketId], jobId: null };
  hold.logged.push(...board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${parkCause}`, at).logged);
  hold.logged.push(...board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, questions: hold.context.decisionWordingOf(draft).questions, context: conflictedFiles.join(' ')
  }, at).logged);
}

/** In the hold, once a review job is installed: its reviewer starts only on a branch that holds the target tip it was checked against. */
function settleTargetCatchUp(hold: HoldContext, job: Readonly<Job>, catchUp: TargetCatchUp): void {
  const { board, at } = hold.change;
  switch (catchUp.verdict) {
    case 'up-to-date':
      hold.logged.push(...board.moveJob(job.id, 'running', at).logged);
      return;
    case 'merge-failed':
      BuildJobHold.openIncidentFor(hold, job, 'setup-failed', { step: TARGET_MERGE_CHILD_FOLDER, ...StepProblemFactsUtil.factsOf(catchUp.problem) });
      BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
      return;
    case 'conflicted': {
      const jobFolder = WorktreeJobs.jobFolderOf(hold.context.workspace, job);
      mkdirSync(jobFolder, { recursive: true });
      createTargetConflictWriter(join(jobFolder, JOB_FILES.targetConflict)).write({ targetTip: catchUp.targetTip, conflictedFiles: catchUp.conflictedFiles });
      returnToBuilder(hold, job, BUILD_JOB_CAUSES.targetConflict);
      routeCatchUpToItsOwner(hold, job, catchUp.conflictedFiles);
      return;
    }
    case 'gated': {
      const { gate } = catchUp;
      GateSettlement.recordGateStepRuns(hold, gate);
      if (gate.outcome === 'setup-failed') {
        BuildJobHold.openIncidentFor(hold, job, 'setup-failed', { step: PREPARE_STEP_NAME });
        BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
        return;
      }
      if (gate.ran) hold.logged.push(...board.recordGateRan(GateSettlement.gateRanFieldsOf(gate, gate.outcome), at).logged);
      if (gate.outcome === 'passed') hold.logged.push(...board.moveJob(job.id, 'running', at).logged);
      else if (gate.outcome === 'failed') {
        returnRedTargetGate(hold, job, gate);
        routeCatchUpToItsOwner(hold, job, []);
      } else {
        BuildJobHold.openIncidentFor(hold, job, 'gate-cannot-run', { tree: gate.treeId, gate: gate.step ?? '' });
        BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.gateCannotRun });
      }
      return;
    }
    default:
  }
}

/**
 * The handover of the ticket's newest ended review when it ended on its target catch-up; `null` for any other ending. The review's file it
 * is read from that cannot be read stops the launch of the builder it would be told to.
 */
function targetCatchUpHandoverOf(trackerDirectory: string, logRecords: readonly LogRecord[], ticketId: string): TargetCatchUpHandover | null | StoredFileUnreadable {
  const reviewJobIds = new Set<string>();
  let newestEnded: { jobId: string; cause: string } | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.fields.kind === REVIEW_JOB_KIND && record.fields.ticketIds.includes(ticketId)) reviewJobIds.add(record.jobId);
    if (record.kind === 'job-ended' && reviewJobIds.has(record.jobId)) newestEnded = { jobId: record.jobId, cause: record.fields.cause ?? '' };
  }
  if (newestEnded === null || !TARGET_CATCH_UP_CAUSES.includes(newestEnded.cause)) return null;
  const jobFolder = jobFolderIn(trackerDirectory, newestEnded.jobId);
  if (newestEnded.cause === BUILD_JOB_CAUSES.targetGateRed) {
    const redHandoff = RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolder);
    return redHandoff === null || StoredFileUnreadable.isUnreadableFile(redHandoff) ? redHandoff : { kind: 'gate-red', redHandoff };
  }
  const conflictFilePath = join(jobFolder, JOB_FILES.targetConflict);
  const conflict = new TargetConflictIngestion(conflictFilePath).read();
  if (conflict.verdict === 'unreadable') return StoredFileUnreadable.unreadableFileOf(trackerDirectory, conflictFilePath, conflict.problem);
  return conflict.verdict === 'absent' ? null : { kind: 'conflict', ...conflict.conflict };
}

/** The review's catch-up merge before its reviewer, in the `target-merge` line folder. */
const TARGET_CATCH_UP_MERGE: MergeIntoTreeFiles = { childFolder: TARGET_MERGE_CHILD_FOLDER, settlementFile: JOB_FILES.targetMergeSettlement };

/** After the hold: what a prepared review job's catch-up asks of git and Talos, read afresh like a gate step. */
async function runTargetCatchUpEffects(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): Promise<void> {
  if (job.kind !== REVIEW_JOB_KIND || JobPreparation.setupProgressOf(context, job, pipeline) !== 'installed') return;
  const catchUp = targetCatchUpOf(context, job, pipeline);
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  const recordPath = join(jobFolder, JOB_FILES.targetMerge);
  if (catchUp.verdict === 'behind') {
    const record: TargetMergeRecord = { startTip: catchUp.branchTip, mergedTip: catchUp.targetTip };
    mkdirSync(jobFolder, { recursive: true });
    createMergeSidesWriter(recordPath).write(record);
    await MergeIntoTree.launchMergeIntoTree(context, job, TARGET_CATCH_UP_MERGE, record);
    return;
  }
  // An unreadable record already read as the catch-up's verdict, so nothing merges or settles on it.
  const record = MergeIntoTree.mergeSidesOf(context.workspace.trackerDirectory, recordPath);
  if (record === null || StoredFileUnreadable.isUnreadableFile(record)) return;
  if (catchUp.verdict === 'merging') await MergeIntoTree.launchMergeIntoTree(context, job, TARGET_CATCH_UP_MERGE, record);
  if (catchUp.verdict === 'merge-ended') {
    MergeIntoTree.writeMergeSettlement(context, job, TARGET_CATCH_UP_MERGE, MergeRun.settleTargetMerge(WorktreeJobs.worktreeOf(context.workspace, job), record));
  }
  if (catchUp.verdict === 'gating') await JobGateRuns.spawnGateRunStep(context, job, { place: TARGET_GATE_RUN, pipeline, stepIndex: catchUp.stepIndex });
}

export const TargetCatchUps = Object.freeze({
  targetCatchUpOf,
  settleTargetCatchUp,
  targetCatchUpHandoverOf,
  runTargetCatchUpEffects,
});
