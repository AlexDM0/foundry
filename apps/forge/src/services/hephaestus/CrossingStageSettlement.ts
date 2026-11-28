/**
 * How a gated job of a crossing ticket moves the ticket between stages: stage 1 into a package build, a package review's seal, and on to
 * `adapt` or the home review.
 */
import type { JobStart }                from '../../adapters/job-start/JobStartIngestion.ts';
import type { Job }                     from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }               from '../../domain/tracker-model/@types/LogRecord.ts';
import type { EntityKey }               from '../../domain/tracker-model/@types/Pipeline.ts';
import { TicketStageUtil }              from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { CustomsReadings }              from '../lifecycle/CustomsReadings.ts';
import { CustomsScopeCheck }            from '../lifecycle/CustomsScopeCheck.ts';
import type { PackageReviewSettlement } from '../lifecycle/ReviewOutcome.ts';
import type { HoldContext }             from './@types/HoldContext.ts';
import { BuildJobHold }                 from './BuildJobHold.ts';
import { BuildReport }                  from './BuildReport.ts';
import { CrossingStages }               from './CrossingStages.ts';
import { JobLaunch }                    from './JobLaunch.ts';
import { StoredFileUnreadable }         from './StoredFileUnreadable.ts';
import { WorktreeJobs }                 from './WorktreeJobs.ts';

/**
 * What a gated job's settlement reads of the job files, all read before its run is recorded: its own start, and for a package review the
 * start of its package stages' first job and the `reach` paths its package's earlier review sealed.
 */
interface SettlementReadings {
  own:                    JobStart | null;
  packageRunStart:        JobStart | null;
  sealedReachPathsBefore: readonly string[];
}

function settlementReadingsOf(hold: HoldContext, job: Readonly<Job>): SettlementReadings | StoredFileUnreadable {
  const { trackerDirectory } = hold.context.workspace;
  const { board } = hold.change;
  const own = JobLaunch.jobStartOf(trackerDirectory, job.id);
  if (StoredFileUnreadable.isUnreadableFile(own)) return own;
  if (TicketStageUtil.stageOfJob(job)?.name !== 'package-review') return { own, packageRunStart: null, sealedReachPathsBefore: [] };
  const packageRunStart = JobLaunch.jobStartOf(trackerDirectory, CrossingStages.packageRunStartJobIdOf(board.logRecordsSoFar(), job));
  if (StoredFileUnreadable.isUnreadableFile(packageRunStart)) return packageRunStart;
  const reviewed = CrossingStages.packageStageStatementsOf(trackerDirectory, board.logRecordsSoFar(), WorktreeJobs.ticketIdOf(job), job.entity ?? '');
  if (StoredFileUnreadable.isUnreadableFile(reviewed)) return reviewed;
  // The stage after the last package review reads every sealed package's statements.
  const sealedStatements = CrossingStages.sealedPackageStatementsOf(board, trackerDirectory, WorktreeJobs.ticketIdOf(job));
  if (StoredFileUnreadable.isUnreadableFile(sealedStatements)) return sealedStatements;
  return { own, packageRunStart, sealedReachPathsBefore: reviewed.sealedReachPaths };
}

/** The paths the job's branch changed past its target, as git spells them; `null` when git cannot tell, or the job kept no start. */
function branchChangedPathsOf(hold: HoldContext, job: Readonly<Job>, start: Readonly<JobStart> | null): string[] | null {
  if (start === null) return null;
  return CustomsReadings.pathsTheBranchChangedPastTargetOf(WorktreeJobs.worktreeOf(hold.context.workspace, job), start.startCommit, job.target ?? hold.context.mainLine);
}

/**
 * The branch changed by stage 1, sorted by owner, among the packages the ticket may cross into (E19, E22); `null` when git cannot tell.
 */
function crossedPackagesAfterStageOneOf(hold: HoldContext, job: Readonly<Job>, homeEntity: EntityKey, start: Readonly<JobStart> | null): EntityKey[] | null {
  const changedPaths = branchChangedPathsOf(hold, job, start);
  const { board } = hold.change;
  if (changedPaths === null) return null;
  return CrossingStages.crossedPackagesOf(board.pipeline(), homeEntity, changedPaths, CrossingStages.ticketWhitelistOf(board, WorktreeJobs.ticketIdOf(job), homeEntity));
}

/**
 * A verified, gated build of an entity settles by its stage (strategy 4.2). After stage 1, the paths the branch changed past its target are
 * sorted by owner: a whitelisted package among them starts its package build, the ticket staying in progress. A package build hands over
 * to its package review with the statement of what the package exposes; `adapt` hands over to the home review as any build hands over to
 * review. Returns whether the build was settled here; a build that stayed in its entity settles as it always has.
 */
function settledAsAStage(hold: HoldContext, job: Readonly<Job>, report: unknown, headCommit: string, start: Readonly<JobStart> | null): boolean {
  const { board, at } = hold.change;
  const jobStage = TicketStageUtil.stageOfJob(job);
  const ticketId = WorktreeJobs.ticketIdOf(job);
  if (jobStage === null) return false;
  if (jobStage.name === 'package-build') {
    const exposedSurfaceChanged = BuildReport.reportFieldOf(report, 'exposedSurfaceChanged') !== false;
    const packageBuildBody = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId)?.body ?? '';
    const body = { text: BuildReport.bodyWithBuildHandoffOf(packageBuildBody, job, report, true), appends: false };
    hold.logged.push(...board.editTicket(ticketId, { body, writtenBy: 'board' }, at).logged);
    CrossingStages.writeStageStatement(hold.context.workspace.trackerDirectory, job.id, { stage: 'package-build', exposedSurfaceChanged });
    BuildJobHold.endJob(hold, job, { outcome: 'built', commit: headCommit });
    board.moveTicketStage(ticketId, { name: 'package-review', entity: jobStage.entity }, at);
    return true;
  }
  if (jobStage.name === 'adapt') {
    board.moveTicketStage(ticketId, { name: 'review', entity: jobStage.entity }, at);
    return false;
  }
  if (jobStage.name !== 'build') return false;
  const refusedPackages = CrossingStages.refusedPackagesOf(board.logRecordsSoFar(), ticketId);
  if (CrossingStages.proposalHomesOf(board.pipeline(), job, refusedPackages).length === 0) return settledOutsideAnyCrossing(hold, ticketId);
  const crossedPackages = crossedPackagesAfterStageOneOf(hold, job, jobStage.entity, start);
  if (crossedPackages === null) {
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: 'git-failed' });
    return true;
  }
  const [firstPackage] = crossedPackages;
  if (firstPackage === undefined) return settledOutsideAnyCrossing(hold, ticketId);
  const ticketBody = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId)?.body ?? '';
  hold.logged.push(...board.editTicket(ticketId, {
    body:      { text: BuildReport.bodyWithBuildHandoffOf(ticketBody, job, report, true), appends: false },
    writtenBy: 'board',
  }, at).logged);
  BuildJobHold.endJob(hold, job, { outcome: 'built', commit: headCommit });
  board.moveTicketStage(ticketId, { name: 'package-build', entity: firstPackage }, at);
  return true;
}

/**
 * A stage 1 that a dropped package change sent back to `build` (E22), whose branch now stays in its entity, settles as any build: its row
 * no longer stores a stage, so its review is the home's own. Returns false, so the build settles as it always has.
 */
function settledOutsideAnyCrossing(hold: HoldContext, ticketId: string): false {
  if (hold.change.board.ticketStageOf(ticketId) !== null) hold.change.board.clearTicketStage(ticketId);
  return false;
}

/**
 * The stage after the last package review: the home review when `adapt` is skipped (E40), with the ticket moved to review as a build moves
 * it; `adapt` otherwise.
 */
function moveOnFromThePackageStages(hold: HoldContext, job: Readonly<Job>, homeEntity: EntityKey, headCommit: string): readonly LogRecord[] {
  const { board, at } = hold.change;
  const ticketId = WorktreeJobs.ticketIdOf(job);
  const statements = CrossingStages.sealedPackageStatementsOf(board, hold.context.workspace.trackerDirectory, ticketId);
  // The settlement read each of them before the review was recorded; one unreadable since then counts as a change, so `adapt` runs.
  if (StoredFileUnreadable.isUnreadableFile(statements) || !CrossingStages.adaptIsSkipped(statements)) {
    board.moveTicketStage(ticketId, { name: 'adapt', entity: homeEntity }, at);
    return [];
  }
  board.moveTicketStage(ticketId, { name: 'review', entity: homeEntity }, at);
  return board.moveTicket(ticketId, 'in-review', { checksLegality: true, branch: WorktreeJobs.branchOf(hold.context, job), commit: headCommit }, at).logged;
}

/**
 * The `reach` paths the package stages of the reviewed package changed since the first job of their run, with those an earlier review of
 * the package sealed, so a lockfile change joins the seal (E3). `null` when git cannot tell.
 */
function sealedReachPathsOf(hold: HoldContext, job: Readonly<Job>, packageKey: EntityKey, target: string, readings: Readonly<SettlementReadings>): string[] | null {
  const { packageRunStart } = readings;
  if (packageRunStart === null) return null;
  const reach = CrossingStages.reachOf(hold.change.board.pipeline(), packageKey);
  const changed = CustomsScopeCheck.reachPathsChangedSinceOf(WorktreeJobs.worktreeOf(hold.context.workspace, job), packageRunStart.startCommit, target, reach);
  if (changed === null) return null;
  return [...new Set([...readings.sealedReachPathsBefore, ...changed])];
}

/**
 * A gated package review (stage 3) settles its rounds and record as any review (E30, E31) but moves neither the ticket's status nor its
 * merge queue: one that does not hold sends the package build back with its Review, kept in its job folder (E34). One that holds seals the
 * ticket's own change to the package and keeps the reviewer's confirmation of what the package exposes and its text; then the next crossed
 * package's build runs, or the stage after the package stages. Its bar is closed here, since no status move closes it.
 */
function packageReviewSettlementOf(hold: HoldContext, job: Readonly<Job>, report: unknown, readings: Readonly<SettlementReadings>): PackageReviewSettlement {
  const { board, at } = hold.change;
  const ticketId = WorktreeJobs.ticketIdOf(job);
  const packageKey = job.entity ?? '';
  const homeEntity = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter.entity ?? '';
  return {
    sendBackToThePackageBuild: (reviewSection) => {
      CrossingStages.writeStageStatement(hold.context.workspace.trackerDirectory, job.id, { stage: 'package-review-findings', reviewSection });
      const { logged } = board.closeStageReviewBars(ticketId, at);
      board.moveTicketStage(ticketId, { name: 'package-build', entity: packageKey }, at);
      return logged;
    },
    sealAndMoveOn: (headCommit) => {
      const logged: LogRecord[] = [...board.closeStageReviewBars(ticketId, at).logged];
      const target = job.target ?? hold.context.mainLine;
      const sealedReachPaths = sealedReachPathsOf(hold, job, packageKey, target, readings);
      const pathspecs = sealedReachPaths === null ? null : CrossingStages.sealPathspecsOf(board.pipeline(), packageKey, sealedReachPaths);
      const seal = pathspecs === null ? null : CustomsScopeCheck.sealOf(WorktreeJobs.worktreeOf(hold.context.workspace, job), target, pathspecs);
      const changedPaths = seal === null ? null : branchChangedPathsOf(hold, job, readings.own);
      const crossedPackages = changedPaths === null ? null : CrossingStages.packagesCrossedAfterAPackageReviewOf(board, ticketId, homeEntity, changedPaths);
      if (sealedReachPaths === null || seal === null || crossedPackages === null) {
        logged.push(...board.endJob(job.id, { outcome: 'failed', cause: 'git-failed' }, at).logged);
        return logged;
      }
      board.sealTicketPackage(ticketId, packageKey, seal, at);
      CrossingStages.writeStageStatement(hold.context.workspace.trackerDirectory, job.id, {
        stage:                   'package-review',
        exposedSurfaceConfirmed: BuildReport.reportFieldOf(report, 'exposedSurfaceConfirmed') === true,
        reviewText:              String(BuildReport.reportFieldOf(report, 'reviewText') ?? ''),
        sealedReachPaths,
      });
      logged.push(...board.endJob(job.id, { outcome: 'reviewed', commit: headCommit }, at).logged);
      const sealedPackages = CrossingStages.sealedPackagesOf(board, ticketId);
      const nextPackage = crossedPackages.find((crossedPackage) => !sealedPackages.includes(crossedPackage));
      if (nextPackage === undefined) logged.push(...moveOnFromThePackageStages(hold, job, homeEntity, headCommit));
      else board.moveTicketStage(ticketId, { name: 'package-build', entity: nextPackage }, at);
      return logged;
    },
  };
}

export const CrossingStageSettlement = Object.freeze({
  settlementReadingsOf,
  settledAsAStage,
  packageReviewSettlementOf,
});
