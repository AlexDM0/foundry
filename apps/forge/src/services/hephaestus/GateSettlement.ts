/**
 * A worktree job's judged gate run in the hold: recorded on the row, a red gate handed back to the session, and a green build or review
 * moved on.
 */
import { mkdirSync }                              from 'node:fs';
import { join }                                   from 'node:path';
import type { GateRunStamp }                      from '../../domain/tracker-model/@types/GatePhase.ts';
import type { GateOutcome, Job }                  from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecordFieldsOf }                 from '../../domain/tracker-model/@types/LogRecord.ts';
import type { DecisionDraft }                     from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Board }                             from '../../domain/tracker-model/Board.ts';
import { EntityOwnershipUtil }                    from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { TicketStageUtil }                        from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { writeFileAtomically }                    from '../../lib/atomic-file/AtomicFile.ts';
import { LIFECYCLE_LIMITS }                       from '../../shared/constants/LifecycleLimits.ts';
import { ReviewOutcome }                          from '../lifecycle/ReviewOutcome.ts';
import type { BuildJobObservation, GateProgress } from './@types/BuildJobObservation.ts';
import type { HoldContext }                       from './@types/HoldContext.ts';
import { BuildJobHold }                           from './BuildJobHold.ts';
import { BuildReport }                            from './BuildReport.ts';
import { CrossingStageSettlement }                from './CrossingStageSettlement.ts';
import {
  GATE_LOG_FILE,
  JobGateRuns,
  PREPARE_STEP_NAME,
  REGATE_MARKER_FILE
} from './JobGateRuns.ts';
import { JobPipelines }                  from './JobPipelines.ts';
import { StoredFileUnreadable }          from './StoredFileUnreadable.ts';
import { REVIEW_JOB_KIND, WorktreeJobs } from './WorktreeJobs.ts';
import { BUILD_JOB_CAUSES }              from './constants/BuildJobCauses.ts';

const DEPENDENT_BROKEN_DECISION = 'dependent-broken';

/**
 * A package build's gate of a dependent entity, named `<entity>: <gate>`, still red once the red handoff's resumes are spent: the package
 * builder cannot hold the package change without breaking that dependent.
 */
function dependentGateIsRedPastItsResumes(hold: HoldContext, job: Readonly<Job>, gateName: string): boolean {
  const entities = hold.change.board.pipeline()?.entities;
  if (entities === undefined || job.entity === undefined || TicketStageUtil.stageOfJob(job)?.name !== 'package-build') return false;
  const gateIsADependents = EntityOwnershipUtil.dependentsOf(entities, [job.entity]).some((entityKey) => gateName.startsWith(`${entityKey}: `));
  const resumes = BuildJobHold.ownRedHandoffInTheHoldOf(hold.context, job)?.resume ?? 0;
  return gateIsADependents && resumes >= LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING;
}

/**
 * User has the dependent fixed by a ticket in this ticket's group, or abandons the ticket; the decision names the red gate, its subject the
 * package and the dependent, and it holds the ticket.
 */
function openDependentBrokenDecision(hold: HoldContext, job: Readonly<Job>, gateName: string): void {
  const { board, at } = hold.change;
  const dependentEntity = JobPipelines.dependentsOfThePackageOf(board.pipeline(), job).find((entityKey) => gateName.startsWith(`${entityKey}: `));
  const draft: DecisionDraft = {
    kind:      DEPENDENT_BROKEN_DECISION,
    ticketIds: job.ticketIds,
    jobId:     null,
    subject:   { ...(job.entity === undefined ? {} : { packageEntity: job.entity }), ...(dependentEntity === undefined ? {} : { dependentEntity }) },
  };
  hold.logged.push(...board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, questions: hold.context.decisionWordingOf(draft).questions, context: gateName
  }, at).logged);
}

/** A judged run's log record: its gates' cache reports go with the phase of the manifest it ran. */
function gateRanFieldsOf(gate: Extract<GateProgress, { verdict: 'judged' }>, outcome: GateOutcome): LogRecordFieldsOf<'gate-ran'> {
  const { manifest, cacheReports } = gate;
  const reports = manifest === null || cacheReports.length === 0 ? {} : { cacheReports: { phase: manifest.phase, gates: cacheReports } };
  return {
    tree: gate.treeId, outcome, cached: false, ...reports
  };
}

/** Each step line of a judged run with its run time, in the phase of the manifest it ran; a run that ran no line records none. */
function recordGateStepRuns(hold: HoldContext, gate: Extract<GateProgress, { verdict: 'judged' }>): void {
  if (gate.manifest === null) return;
  hold.logged.push(...hold.change.board.recordPipelineStepsRan(gate.stepRuns, gate.manifest.phase, hold.change.at).logged);
}

/**
 * Records a judged gate run and its step lines on the row, and routes a run that did not pass: a failed prepare step or a gate that cannot
 * run opens its incident and stops the job, a red gate is the session's red handoff. Returns whether the run passed.
 */
function settleJudgedGate(hold: HoldContext, job: Readonly<Job>, gate: Extract<GateProgress, { verdict: 'judged' }>, stamp: GateRunStamp | null): boolean {
  const { board, at } = hold.change;
  board.recordPipelineJudgedBy(WorktreeJobs.ticketIdOf(job), gate.outcome === 'passed' ? gate.treeId : null, stamp, at);
  recordGateStepRuns(hold, gate);
  if (gate.outcome === 'setup-failed') {
    BuildJobHold.openIncidentFor(hold, job, 'setup-failed', { step: PREPARE_STEP_NAME });
    BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
    return false;
  }
  if (gate.ran) hold.logged.push(...board.recordGateRan(gateRanFieldsOf(gate, gate.outcome), at).logged);
  if (gate.outcome === 'cannot-run') {
    BuildJobHold.openIncidentFor(hold, job, 'gate-cannot-run', { tree: gate.treeId, gate: gate.step ?? '' });
    BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.gateCannotRun });
    return false;
  }
  if (gate.outcome === 'failed') {
    hold.context.log({
      kind: 'gate-red', jobId: job.id, ticketId: WorktreeJobs.ticketIdOf(job), gate: gate.step ?? '', treeId: gate.treeId, outputFile: GATE_LOG_FILE
    });
    if (dependentGateIsRedPastItsResumes(hold, job, gate.step ?? '')) {
      openDependentBrokenDecision(hold, job, gate.step ?? '');
      BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.gateFailed });
      return false;
    }
    const pipelineGate = gate.manifest?.gates.find((candidate) => candidate.name === gate.step);
    BuildJobHold.interruptOnRedHandoff(hold, job, {
      kind:        'gate',
      name:        gate.step ?? '',
      command:     pipelineGate?.run ?? null,
      fixCommand:  pipelineGate?.fix ?? null,
      exitCode:    gate.exitCode ?? null,
      fullLogPath: join(WorktreeJobs.jobFolderOf(hold.context.workspace, job), GATE_LOG_FILE),
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
    if (launched && record.kind === 'review-recorded' && record.ticketId === WorktreeJobs.ticketIdOf(job)) return true;
  }
  return false;
}

/** With merge approval on, a gated build with no review phase merges the target into its worktree before its ticket waits for User's Merge. */
function buildMergesMainFirst(board: Board, ticketId: string): boolean {
  return !board.reviewIsSetFor(ticketId) && board.mergeApprovalIsOn();
}

/** The builder's verified work: its Handoff written from the report, the job ended `built` and the ticket moved `in-review`. */
function settleBuilt(hold: HoldContext, job: Readonly<Job>, report: unknown, headCommit: string): void {
  const { board, at } = hold.change;
  const ticketBody = board.tickets().find((candidate) => candidate.frontmatter.id === WorktreeJobs.ticketIdOf(job))?.body ?? '';
  const body = { text: BuildReport.bodyWithBuildHandoffOf(ticketBody, job, report, board.ticketStageOf(WorktreeJobs.ticketIdOf(job)) !== null), appends: false };
  hold.logged.push(...board.editTicket(WorktreeJobs.ticketIdOf(job), { body, writtenBy: 'board' }, at).logged);
  BuildJobHold.endJob(hold, job, { outcome: 'built', commit: headCommit });
  hold.logged.push(...board.moveTicket(WorktreeJobs.ticketIdOf(job), 'in-review', {
    checksLegality: true,
    branch:         WorktreeJobs.branchOf(hold.context, job),
    commit:         headCommit,
  }, at).logged);
}

function settleGate(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation): void {
  const { gate } = observation;
  if (gate.verdict !== 'judged' || !hold.pipelineStored) return;
  const { board, at } = hold.change;
  const phase = JobGateRuns.gatePhaseOfJob(job);
  if (!gate.ran && !board.greenIsCurrent(WorktreeJobs.ticketIdOf(job), gate.treeId, phase)) {
    const jobFolder = WorktreeJobs.jobFolderOf(hold.context.workspace, job);
    mkdirSync(jobFolder, { recursive: true });
    writeFileAtomically(join(jobFolder, REGATE_MARKER_FILE), `${gate.treeId}\n`);
    return;
  }
  // Read before the run is recorded, so a file that cannot be read leaves the whole settlement for the move on its incident.
  const readings = CrossingStageSettlement.settlementReadingsOf(hold, job);
  if (StoredFileUnreadable.isUnreadableFile(readings)) {
    BuildJobHold.openUnreadableFileIncident(hold, job, readings);
    return;
  }
  // A run stamps the manifest it ran under; a review that ran nothing keeps the green the hold just found current.
  const pipeline = board.pipeline();
  const keptStamp = pipeline === null ? null : JobPipelines.jobGateRunStampOf(pipeline, job, phase);
  if (!settleJudgedGate(hold, job, gate, gate.ran ? gate.manifest : keptStamp)) return;
  const headCommit = String(BuildReport.reportFieldOf(observation.report, 'headCommit'));
  if (job.kind === REVIEW_JOB_KIND) {
    if (reviewPassIsSettled(board, job)) {
      hold.logged.push(...board.moveJob(job.id, 'merging-main', at).logged);
      return;
    }
    const crossingStage = board.ticketStageOf(WorktreeJobs.ticketIdOf(job));
    const packageReview = crossingStage !== null && TicketStageUtil.stageOfJob(job)?.name === 'package-review'
      ? CrossingStageSettlement.packageReviewSettlementOf(hold, job, observation.report, readings)
      : undefined;
    const settled = ReviewOutcome.settleReviewPass({
      board,
      at,
      job,
      report:            observation.report,
      worktreePath:      WorktreeJobs.worktreeOf(hold.context.workspace, job),
      reviewStartCommit: readings.own?.startCommit ?? headCommit,
      headTree:          gate.treeId,
      jobFolder:         WorktreeJobs.jobFolderOf(hold.context.workspace, job),
      limits:            LIFECYCLE_LIMITS,
      decisionWordingOf: hold.context.decisionWordingOf,
      ...(packageReview === undefined ? {} : { packageReview }),
    });
    hold.logged.push(...settled.logged);
    if (packageReview !== undefined) return;
    // A home review that does not hold sends the ticket back to `adapt`, also when `adapt` was skipped.
    if (crossingStage !== null && settled.move === 'fixer' && job.entity !== undefined) {
      board.moveTicketStage(WorktreeJobs.ticketIdOf(job), { name: 'adapt', entity: job.entity }, at);
    }
    return;
  }
  if (CrossingStageSettlement.settledAsAStage(hold, job, observation.report, headCommit, readings.own)) return;
  if (buildMergesMainFirst(board, WorktreeJobs.ticketIdOf(job))) {
    hold.logged.push(...board.moveJob(job.id, 'merging-main', at).logged);
    return;
  }
  settleBuilt(hold, job, observation.report, headCommit);
  // A pipeline without a review phase lands a gated build directly: it waits in review only for its Airlock. A green the pipeline changed
  // under while it ran is not current: the ticket waits unqueued, and the Airlock sweep gates it again.
  const queuesAtOnce = !board.reviewIsSetFor(WorktreeJobs.ticketIdOf(job))
    && board.greenIsCurrent(WorktreeJobs.ticketIdOf(job), gate.treeId, board.greenPhaseOf(WorktreeJobs.ticketIdOf(job)));
  if (queuesAtOnce) hold.logged.push(...board.queueTicketForMerge(WorktreeJobs.ticketIdOf(job), job.target ?? hold.context.mainLine, gate.treeId, at).logged);
}

export const GateSettlement = Object.freeze({
  gateRanFieldsOf,
  recordGateStepRuns,
  settleJudgedGate,
  settleBuilt,
  settleGate,
});
