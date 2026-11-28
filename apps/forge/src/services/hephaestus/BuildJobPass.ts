/**
 * A build job end to end, from the worktree and its install line through the builder, Customs and the gate to
 * the Handoff, each step a job state. Observing happens outside the lock, the moves in the hold, and the effects (git, Talos, frames) after
 * it; a step's progress lives on disk in the job folder, so a restart observes it again.
 */
import { existsSync }                                            from 'node:fs';
import { join }                                                  from 'node:path';
import type { ReviewBarRequest }                                 from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { Decision }                                         from '../../domain/tracker-model/@types/Decision.ts';
import type { Job, JobState, LostLineKind }                      from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                        from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                         from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                                            from '../../domain/tracker-model/Board.ts';
import { PipelineUtil }                                          from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { TicketStageUtil }                                       from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET, WIND_DOWN_GRACE_CALLS } from '../../shared/constants/HephaestusLimits.ts';
import type { BoardTransaction }                                 from '../tracker/BoardTransaction.ts';
import type {
  BuildJobObservation,
  GateProgress,
  MainMergeStep,
  TargetCatchUp
} from './@types/BuildJobObservation.ts';
import type { HoldContext }                            from './@types/HoldContext.ts';
import type { JobLaunchContext }                       from './@types/JobLaunchContext.ts';
import { BuildJobCustoms }                             from './BuildJobCustoms.ts';
import { BuildJobHold }                                from './BuildJobHold.ts';
import { type BuildJobFrameRequest, BuildJobSessions } from './BuildJobSessions.ts';
import { GateSettlement }                              from './GateSettlement.ts';
import { JobGateRuns }                                 from './JobGateRuns.ts';
import { JobLines }                                    from './JobLines.ts';
import { JobPipelines }                                from './JobPipelines.ts';
import { INSTALL_CHILD_FOLDER, JobPreparation }        from './JobPreparation.ts';
import { JobSandbox }                                  from './JobSandbox.ts';
import { MainMergeRounds }                             from './MainMergeRounds.ts';
import { RedHandoff }                                  from './RedHandoff.ts';
import { StoredFileUnreadable }                        from './StoredFileUnreadable.ts';
import { TARGET_GATE_RUN, TargetCatchUps }             from './TargetCatchUps.ts';
import { JOB_FILES, REVIEW_JOB_KIND, WorktreeJobs }    from './WorktreeJobs.ts';
import { BUILD_JOB_CAUSES }                            from './constants/BuildJobCauses.ts';

/** The main-merge verdicts only a child's end moves on. */
const MAIN_MERGE_WAITS: readonly MainMergeStep['verdict'][] = ['merging', 'gating'];

/** The catch-up verdicts only a child's end moves on, so a pass that reads one waits for that end instead of asking for the next pass. */
const TARGET_CATCH_UP_WAITS: readonly TargetCatchUp['verdict'][] = ['merging', 'gating'];

/** Where a refused line or worker launch can stand: prepare and install lines while preparing, the worker while running, gates while gating. */
const STATES_A_SANDBOX_REFUSAL_ENDS: ReadonlySet<JobState> = new Set<JobState>(['preparing', 'running', 'gating', 'merging-main']);

/** The states whose install or gate line a start may find lost, which then waits for User's resume. */
const STATES_A_LINE_IS_LOST_IN: readonly JobState[] = ['preparing', 'gating'];

/** The step a preparing job's install, or its own or its review's catch-up gate run, waits on, when that step's line reads `lost`. */
function lostLineOf(
  context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline> | null, reading: Pick<BuildJobObservation, 'setup' | 'gate' | 'targetCatchUp'>
): LostLineKind | null {
  if (pipeline === null) return null;
  if (job.state === 'preparing' && reading.setup === 'installing') {
    const installStepLost = JobPipelines.installStepsOf(pipeline, job)
      .some((_step, stepIndex) => JobLines.lineReadsLost(context, job, JobLines.stepFolderOf(INSTALL_CHILD_FOLDER, stepIndex)));
    return installStepLost ? 'install' : null;
  }
  const { targetCatchUp, gate } = reading;
  if (job.state === 'preparing' && targetCatchUp.verdict === 'gating') {
    return JobGateRuns.gateRunStepReadsLost(context, job, TARGET_GATE_RUN, pipeline, targetCatchUp.stepIndex) ? 'gate' : null;
  }
  if (job.state === 'gating' && gate.verdict === 'running') {
    return JobGateRuns.gateRunStepReadsLost(context, job, JobGateRuns.ownGateRunOf(job), pipeline, gate.stepIndex) ? 'gate' : null;
  }
  return null;
}

/** Read outside the lock, for every live build job. */
function observeBuildJobs(context: JobLaunchContext, jobs: readonly Readonly<Job>[], pipeline: Readonly<Pipeline> | null): BuildJobObservation[] {
  return jobs.filter(WorktreeJobs.isWorktreeJob).map((job) => {
    const liveness = context.boardChildren.livenessOf(WorktreeJobs.jobFolderOf(context.workspace, job), job.childInstance);
    const { setup, installStepRuns } = job.state === 'preparing'
      ? JobPreparation.setupReadingOf(context, job, JobPipelines.installStepsOf(pipeline, job), JobPipelines.installEntityOf(pipeline, job))
      : { setup: 'installed' as const, installStepRuns: [] };
    const gate: GateProgress = job.state === 'gating' && pipeline !== null ? JobGateRuns.gateProgressOf(context, job, pipeline) : { verdict: 'pending' };
    const targetCatchUp: TargetCatchUp = setup === 'installed' ? TargetCatchUps.targetCatchUpOf(context, job, pipeline) : { verdict: 'not-checked' };
    const lostLine = lostLineOf(context, job, pipeline, { setup, gate, targetCatchUp });
    const redHandoff = RedHandoff.redHandoffFactsOf(context.workspace.trackerDirectory, WorktreeJobs.jobFolderOf(context.workspace, job));
    return {
      jobId:            job.id,
      setup,
      installStepRuns,
      ...BuildJobSessions.sessionReadingOf(context, job),
      agentEnd:         liveness.verdict === 'ended' ? liveness.end : liveness.verdict === 'lost' ? 'lost' : null,
      gate,
      sandboxRefusal:   JobSandbox.sandboxRefusalOf(context, job),
      targetCatchUp,
      mainMerge:        MainMergeRounds.mainMergeReadingOf(context, jobs, job, pipeline),
      conflictReReview: MainMergeRounds.conflictReReviewReadingOf(context, jobs, job, pipeline),
      ...(lostLine === null ? {} : { lostLine }),
      ...(StoredFileUnreadable.isUnreadableFile(redHandoff) ? { unreadableRedHandoff: redHandoff } : {}),
      ...(liveness.verdict === 'unlaunched' ? { childIsUnlaunched: true } as const : {}),
    };
  });
}

/**
 * Read outside the lock: the worktree HEAD's tree of each review waiting `awaiting-answer` whose waiver no open decision names any more,
 * which the hold that acts on User's answer queues on; `null` when git cannot read it.
 */
function answeredWaiverTreesOf(context: JobLaunchContext, jobs: readonly Readonly<Job>[], decisions: readonly Readonly<Decision>[]): ReadonlyMap<string, string | null> {
  const answeredReviews = jobs.filter((job) => job.kind === REVIEW_JOB_KIND && job.state === 'awaiting-answer' && !decisions.some((decision) => decision.jobId === job.id));
  return new Map(answeredReviews.map((job) => [job.id, WorktreeJobs.treeOf(WorktreeJobs.worktreeOf(context.workspace, job))]));
}

/** A reviewer's bar: its round, and on a forge with entities its stage, named by the review of the stage's entity, else of the ticket's own. */
function reviewBarRequestOf(board: Board, job: Readonly<Job>): ReviewBarRequest {
  const stage    = TicketStageUtil.stageOfJob(job);
  const pipeline = board.pipeline();
  const review   = stage === null || pipeline === null
    ? board.ticketPipelineOf(WorktreeJobs.ticketIdOf(job))?.review
    : PipelineUtil.pipelineOfEntity(pipeline, stage.entity)?.review;
  return {
    round: job.attempt, owner: job.id, ...(review?.name === undefined ? {} : { label: review.name }), ...(stage === null ? {} : { stage })
  };
}

/**
 * In the hold, for a job in `preparing`: its install verdict moves it on. The hold that moves it out of `preparing` records each install
 * step line that ran, once, as a review's catch-up may hold it there across passes.
 */
function settleInstall(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation): void {
  const { board, at } = hold.change;
  if (observation.setup === 'worktree-failed' || observation.setup === 'install-failed') {
    BuildJobHold.openIncidentFor(hold, job, 'setup-failed', { step: observation.setup === 'worktree-failed' ? 'worktree' : 'install' });
    BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
  } else if (observation.setup === 'worktree-unnormalised') {
    BuildJobHold.openIncidentFor(hold, job, 'setup-failed', { step: 'worktree', cause: 'line-ending-normalisation' });
    BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.setupFailed });
  } else if (observation.setup === 'installed' && job.kind === REVIEW_JOB_KIND) {
    TargetCatchUps.settleTargetCatchUp(hold, job, observation.targetCatchUp);
  } else if (observation.setup === 'installed') {
    hold.logged.push(...board.moveJob(job.id, 'running', at).logged);
  }
  if (board.jobById(job.id)?.state === 'preparing') return;
  hold.logged.push(...board.recordPipelineStepsRan(observation.installStepRuns, null, at).logged);
}

/** Logged once for each line a start found lost; the job keeps its state, and its launch runs the line again only after User's resume. */
function recordLostLineOnce(hold: HoldContext, job: Readonly<Job>, lostLine: LostLineKind | undefined): void {
  const cause = hold.context.lostLineCause?.() ?? null;
  const { board, at } = hold.change;
  if (lostLine === undefined || cause === null || board.lostLineAwaitsResume(job)) return;
  hold.logged.push(...board.recordLineLost(job.id, lostLine, cause, at).logged);
}

/**
 * The first job file the observation could not read where the job's state acts on it; the hold then takes none of the job's steps this
 * pass. A conflict re-reviewer is judged only in `merging-main`, and the red handoff only while a session runs or a stop no one asked for
 * settles it, so a stop never waits on either.
 */
function unreadableFileOfObservation(observation: BuildJobObservation, job: Readonly<Job> | undefined): StoredFileUnreadable | null {
  const state = job?.state;
  const readsTheRedHandoff = state === 'running' || (state === 'stopping' && job?.stopRequest === undefined);
  const readings: readonly unknown[] = [
    readsTheRedHandoff ? observation.unreadableRedHandoff : null,
    observation.gate,
    observation.targetCatchUp,
    observation.mainMerge?.step,
    state === 'merging-main' ? observation.conflictReReview?.verdict : null,
    state !== undefined && STATES_A_SANDBOX_REFUSAL_ENDS.has(state) ? observation.sandboxRefusal : null,
  ];
  return readings.find(StoredFileUnreadable.isUnreadableFile) ?? null;
}

function applyObservation(hold: HoldContext, observation: BuildJobObservation): void {
  const { board, at } = hold.change;
  const job = board.jobById(observation.jobId);
  if (job === undefined) return;
  recordLostLineOnce(hold, job, observation.lostLine);
  const unreadable = unreadableFileOfObservation(observation, job);
  if (unreadable !== null) {
    BuildJobHold.openUnreadableFileIncident(hold, job, unreadable);
    return;
  }
  if (observation.sandboxRefusal !== null && !StoredFileUnreadable.isUnreadableFile(observation.sandboxRefusal) && STATES_A_SANDBOX_REFUSAL_ENDS.has(job.state)) {
    BuildJobHold.openIncidentFor(hold, job, 'sandbox-unavailable', { step: observation.sandboxRefusal.step, reason: observation.sandboxRefusal.reason });
    BuildJobHold.endJob(hold, job, { outcome: 'stopped', cause: BUILD_JOB_CAUSES.sandboxUnavailable });
    return;
  }
  switch (job.state) {
    case 'launching': {
      hold.logged.push(...board.moveJob(job.id, 'preparing', at).logged);
      if (job.kind === REVIEW_JOB_KIND) {
        hold.logged.push(...board.startReviewBar(WorktreeJobs.ticketIdOf(job), reviewBarRequestOf(board, job), at).logged);
        return;
      }
      const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === WorktreeJobs.ticketIdOf(job));
      if (ticket?.frontmatter.status !== 'committed') return;
      hold.logged.push(...board.moveTicket(WorktreeJobs.ticketIdOf(job), 'in-progress', { checksLegality: true, branch: WorktreeJobs.branchOf(hold.context, job) }, at).logged);
      return;
    }
    case 'preparing':
      settleInstall(hold, job, observation);
      return;
    case 'running': {
      const callBudget = BuildJobSessions.attemptCallBudgetOf(hold.context.workspace.trackerDirectory, job);
      if (!StoredFileUnreadable.isUnreadableFile(callBudget) && observation.calls >= callBudget + WIND_DOWN_GRACE_CALLS) {
        // A resumed session past its grace counts as red again; only a first attempt opens `out-of-calls`.
        if (!BuildJobHold.workingOffARedHandoff(hold.context, job)) BuildJobHold.openIncidentFor(hold, job, 'out-of-calls', { calls: String(observation.calls) });
        hold.logged.push(...board.moveJob(job.id, 'stopping', at).logged);
      }
      return;
    }
    case 'stopping': {
      const reReviewer = MainMergeRounds.conflictReReviewerOf(board.jobs(), job);
      if (reReviewer !== undefined) {
        MainMergeRounds.stopTheConflictReReviewer(hold, reReviewer, observation.conflictReReview);
        return;
      }
      // A stopping job never spawns, so a child never launched never ends: the job ends here.
      if (observation.agentEnd === null && observation.childIsUnlaunched !== true) return;
      if (job.stopRequest === undefined && BuildJobHold.workingOffARedHandoff(hold.context, job)) {
        const output = `The resumed session passed its ${RED_HANDOFF_RESUME_CALL_BUDGET} calls and the ${WIND_DOWN_GRACE_CALLS}-call grace without a report.`;
        BuildJobHold.interruptOnRedHandoff(hold, job, { ...BuildJobHold.redHandoffCauseOf(hold.context, job), output });
        return;
      }
      BuildJobHold.endJob(hold, job, BuildJobHold.userStopEndingOf(job) ?? { outcome: 'stopped', cause: BUILD_JOB_CAUSES.outOfCalls });
      return;
    }
    case 'in-customs':
      BuildJobCustoms.verifyAndRoute(hold, job, observation);
      return;
    case 'gating':
      GateSettlement.settleGate(hold, job, observation);
      return;
    case 'merging-main':
      MainMergeRounds.settleMainMerge(hold, job, observation);
      return;
    default:
  }
}

/** In the hold, after the relayed requests and child events, before the policy: so a ticket finished here gets its review job in this hold. */
function applyBuildJobObservations(change: BoardTransaction, context: JobLaunchContext, observations: readonly BuildJobObservation[]): LogRecord[] {
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
    // An unreadable file holds the job until a move on its incident, which brings its own pass.
    if (unreadableFileOfObservation(observation, board.jobById(observation.jobId)) !== null) return false;
    if (state === 'launching') return true;
    if (state !== undefined && STATES_A_SANDBOX_REFUSAL_ENDS.has(state) && observation.sandboxRefusal !== null) return true;
    if (state === 'preparing') {
      return observation.setup !== 'creating-worktree' && observation.setup !== 'installing' && !TARGET_CATCH_UP_WAITS.includes(observation.targetCatchUp.verdict);
    }
    if (state === 'merging-main') {
      const job = board.jobById(observation.jobId);
      // A re-reviewer the hold just ended, or launched, leaves the round where only the next pass moves it on, or its own child does.
      if (job === undefined || MainMergeRounds.conflictReReviewerOf(board.jobs(), job) !== undefined) return false;
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

/** After the hold and the Hephaestus lock check: what each build job's new state asks of git and Talos. */
async function runBuildJobEffects(context: JobLaunchContext, board: Board, observations: readonly BuildJobObservation[]): Promise<void> {
  const pipeline = board.pipeline();
  const frameRequest: BuildJobFrameRequest = {
    boardChildren: context.boardChildren, trackerDirectory: context.workspace.trackerDirectory, agentAdapter: context.agentAdapter, windDownMessage: context.windDownMessage,
  };
  for (const job of board.jobs().filter(WorktreeJobs.isWorktreeJob)) {
    const linesMaySpawn = pipeline !== null && !(STATES_A_LINE_IS_LOST_IN.includes(job.state) && board.lostLineAwaitsResume(job));
    if (job.state === 'preparing') {
      const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
      JobPreparation.startAfreshInTheNewEntity(context, board, job, jobFolder);
      const worktreeIsReady = JobPreparation.prepareWorktree(context, job, jobFolder);
      const unnormalised = existsSync(join(jobFolder, JOB_FILES.worktreeUnnormalised));
      if (worktreeIsReady && !unnormalised && linesMaySpawn) await JobPreparation.spawnNextInstallStep(context, job, pipeline);
      if (worktreeIsReady && !unnormalised && linesMaySpawn) await TargetCatchUps.runTargetCatchUpEffects(context, job, pipeline);
    }
    const observation = observations.find((candidate) => candidate.jobId === job.id);
    await BuildJobSessions.deliverBuildJobFrames(frameRequest, job, observation?.calls ?? 0);
    if (job.state === 'gating' && linesMaySpawn) await JobGateRuns.spawnNextGateStep(context, job, pipeline);
    if (job.state === 'merging-main' && pipeline !== null) await MainMergeRounds.runMainMergeEffects(context, board, job, pipeline);
    const reReviewer = MainMergeRounds.conflictReReviewerOf(board.jobs(), job);
    if (reReviewer !== undefined) await BuildJobSessions.deliverBuildJobFrames(frameRequest, reReviewer, observation?.conflictReReview?.calls ?? 0);
  }
}

export const BuildJobPass = Object.freeze({
  observeBuildJobs,
  answeredWaiverTreesOf,
  applyBuildJobObservations,
  someBuildJobAwaitsAPass,
  attributionTicketIdsOf,
  runBuildJobEffects,
});
