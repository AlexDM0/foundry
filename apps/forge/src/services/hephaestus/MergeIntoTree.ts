/**
 * One merge of the target into a ticket's worktree, shared by a review's catch-up and a round of `merging-main`: the tips it is checked
 * against, its line and its settlement.
 */
import { join }                                                                          from 'node:path';
import { MergeSettlementIngestion, type SettledTargetMerge, type TargetMergeSettlement } from '../../adapters/merge-settlement/MergeSettlementIngestion.ts';
import { createMergeSettlementWriter }                                                   from '../../adapters/merge-settlement/MergeSettlementWriter.ts';
import { type MergeSides, MergeSidesIngestion }                                          from '../../adapters/merge-sides/MergeSidesIngestion.ts';
import type { Job }                                                                      from '../../domain/tracker-model/@types/Job.ts';
import { GitProcess }                                                                    from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                                                  from '../../lib/git/GitWorktrees.ts';
import { PORTABLE_GIT_SETTINGS }                                                         from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }                                                              from '../../lib/git/utils/GitArgumentsUtil.ts';
import { MergeRun }                                                                      from '../lifecycle/MergeRun.ts';
import type { TargetCatchUp }                                                            from './@types/BuildJobObservation.ts';
import type { JobLaunchContext }                                                         from './@types/JobLaunchContext.ts';
import { JobLines }                                                                      from './JobLines.ts';
import { StoredFileUnreadable }                                                          from './StoredFileUnreadable.ts';
import { WorktreeJobs }                                                                  from './WorktreeJobs.ts';

/** The tips the catch-up merge was checked against, kept before its process starts, so every later step reads the same two. */
export type TargetMergeRecord = MergeSides;

/** Where one merge of the target into a ticket's worktree runs and settles: the catch-up before a review, or a round of `merging-main`. */
export interface MergeIntoTreeFiles {
  childFolder:    string;
  settlementFile: string;
}

/** The tips a merge into the worktree was checked against; `null` before its first look found the branch behind. */
function mergeSidesOf(trackerDirectory: string, sidesFilePath: string): TargetMergeRecord | null | StoredFileUnreadable {
  const reading = new MergeSidesIngestion(sidesFilePath).read();
  if (reading.verdict === 'readable') return reading.sides;
  return reading.verdict === 'absent' ? null : StoredFileUnreadable.unreadableFileOf(trackerDirectory, sidesFilePath, reading.problem);
}

/** How the merge settled once its process ended; `null` before. */
function mergeSettlementOf(trackerDirectory: string, settlementFilePath: string): TargetMergeSettlement | null | StoredFileUnreadable {
  const reading = new MergeSettlementIngestion(settlementFilePath).read();
  if (reading.verdict === 'readable') return reading.settlement;
  return reading.verdict === 'absent' ? null : StoredFileUnreadable.unreadableFileOf(trackerDirectory, settlementFilePath, reading.problem);
}

/** The first look: the target's tip as it stands now, and whether the branch already holds it. */
function firstTargetCheckOf(context: JobLaunchContext, job: Readonly<Job>): TargetCatchUp {
  const worktree  = WorktreeJobs.worktreeOf(context.workspace, job);
  const target    = job.target ?? context.mainLine;
  const targetTip = GitProcess.resolvedCommitOf(WorktreeJobs.projectLocationOfContext(context).repositoryRoot, `refs/heads/${target}`);
  const branchTip = MergeRun.headOf(worktree);
  if (targetTip === null || branchTip === null) {
    return { verdict: 'merge-failed', problem: { code: 'tip-unreadable', branch: targetTip === null ? target : WorktreeJobs.branchOf(context, job) } };
  }
  const holds = MergeRun.headHoldsCommit(worktree, targetTip);
  if (holds === 'holds') return { verdict: 'up-to-date' };
  if (holds === 'lacks') return { verdict: 'behind', targetTip, branchTip };
  return {
    verdict: 'merge-failed',
    problem: {
      code: 'holding-unknown', branch: WorktreeJobs.branchOf(context, job), target, targetTip
    }
  };
}

function writeMergeSettlement(context: JobLaunchContext, job: Readonly<Job>, files: MergeIntoTreeFiles, settlement: SettledTargetMerge): void {
  createMergeSettlementWriter(join(WorktreeJobs.jobFolderOf(context.workspace, job), files.settlementFile)).write(settlement);
}

/**
 * The merge is Hephaestus's own git, so it runs outside the gate sandbox, which would refuse git's writes to the repository's shared
 * object store; every hook is off, so no worker-written code runs. A merge that cannot start is settled `failed` at once.
 */
async function launchMergeIntoTree(
  context: JobLaunchContext, job: Readonly<Job>, files: MergeIntoTreeFiles, record: Readonly<TargetMergeRecord>
): Promise<void> {
  const instance = JobLines.lineInstanceDueOf(context.boardChildren, join(WorktreeJobs.jobFolderOf(context.workspace, job), files.childFolder));
  if (instance === null) return;
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const git = context.platformPorts.executableResolver.absolutePathOf('git', [WorktreeJobs.projectLocationOfContext(context).repositoryRoot]);
  if (git.verdict === 'refused') {
    writeMergeSettlement(context, job, files, { verdict: 'failed', failure: { code: 'git-not-found' } });
    return;
  }
  const gitVariables = { ...GitArgumentsUtil.environmentOf(PORTABLE_GIT_SETTINGS), GIT_CEILING_DIRECTORIES: GitWorktrees.ceilingOf(worktree) };
  const launched = await JobLines.launchLineChild(context, job, files.childFolder, instance, {
    workingDirectory:      worktree,
    argv:                  MergeRun.targetMergeCommandOf(git.path, record.mergedTip),
    environment:           context.platformPorts.launchEnvironment.launchEnvironmentOf(context.inheritedEnvironment, gitVariables),
    timeBoundMilliseconds: null,
  });
  if (launched.verdict === 'talos-unavailable') return;
  context.log({
    kind:      'merge-line-launched',
    jobId:     job.id,
    ticketId:  WorktreeJobs.ticketIdOf(job),
    step:      files.childFolder,
    mergedTip: record.mergedTip,
    branch:    WorktreeJobs.branchOf(context, job),
  });
}

export const MergeIntoTree = Object.freeze({
  mergeSidesOf,
  mergeSettlementOf,
  firstTargetCheckOf,
  writeMergeSettlement,
  launchMergeIntoTree,
});
