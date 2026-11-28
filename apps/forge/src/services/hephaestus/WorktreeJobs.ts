/**
 * Where a build or review job works: whether a job works a ticket's worktree, its ticket, worktree, branch, tree and job folder, and the
 * files Hephaestus keeps there.
 */
import type { Job, JobKind }                       from '../../domain/tracker-model/@types/Job.ts';
import { GitProcess }                              from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                            from '../../lib/git/GitWorktrees.ts';
import { WorktreesFolder }                         from '../../shared/WorktreesFolder.ts';
import { type ProjectLocation, projectLocationOf } from '../tracker/ProjectLocation.ts';
import type { Workspace }                          from '../tracker/Workspace.ts';
import type { JobLaunchContext }                   from './@types/JobLaunchContext.ts';
import { jobFolderIn }                             from './HephaestusFiles.ts';

/** What Hephaestus writes in the job folder beside its children; only Hephaestus writes there. */
export const JOB_FILES = {
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
  freshBranchStarted:     'fresh-branch-started',
} as const;

export const REVIEW_JOB_KIND = 'review';
export const CONFLICT_RE_REVIEWER_ROLE = 'conflict-re-reviewer';

/** The jobs whose session works a ticket's worktree: each is prepared, verified and gated the same way, and only its outcome differs. */
const WORKTREE_JOB_KINDS: readonly JobKind[] = ['build', REVIEW_JOB_KIND];

function isWorktreeJob(job: Readonly<Job>): boolean {
  return WORKTREE_JOB_KINDS.includes(job.kind);
}

function ticketIdOf(job: Readonly<Job>): string {
  return job.ticketIds[0] ?? '';
}

function worktreeOf(workspace: Workspace, job: Readonly<Job>): string {
  return WorktreesFolder.ticketWorktreeOf(workspace.rootDirectory, ticketIdOf(job));
}

/** Read from disk at each use, never kept: git runs at its `repositoryRoot`, never in the tracker's own folder below it. */
function projectLocationOfContext(context: Pick<JobLaunchContext, 'workspace'>): ProjectLocation {
  return projectLocationOf(context.workspace.rootDirectory);
}

function branchOf(context: Pick<JobLaunchContext, 'branchNames'>, job: Readonly<Job>): string {
  return context.branchNames.ticketBranchOf(ticketIdOf(job));
}

function jobFolderOf(workspace: Workspace, job: Readonly<Job>): string {
  return jobFolderIn(workspace.trackerDirectory, job.id);
}

function treeOf(worktree: string): string | null {
  const run = GitProcess.run(worktree, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return run !== null && GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

function treeOfCommit(worktree: string, commit: string): string | null {
  const run = GitProcess.run(worktree, ['rev-parse', '--verify', '--quiet', `${commit}^{tree}`], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

export const WorktreeJobs = Object.freeze({
  isWorktreeJob,
  ticketIdOf,
  worktreeOf,
  projectLocationOfContext,
  branchOf,
  jobFolderOf,
  treeOf,
  treeOfCommit,
});
