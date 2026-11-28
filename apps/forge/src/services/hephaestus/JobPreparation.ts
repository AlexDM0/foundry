/**
 * Preparing a worktree job before its session: the ticket's worktree made from its target, dropped first for a ticket moved to another
 * entity, and its install steps run in order.
 */
import { existsSync, mkdirSync }                   from 'node:fs';
import { join }                                    from 'node:path';
import type { WorktreeCreationFailure }            from '../../adapters/worktree-failure/@types/WorktreeCreationFailure.ts';
import { createWorktreeFailureWriter }             from '../../adapters/worktree-failure/WorktreeFailureWriter.ts';
import type { Job, PipelineStepRun }               from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                          from '../../domain/tracker-model/@types/LogRecord.ts';
import type { EntityKey, Pipeline, PipelineStep }  from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                              from '../../domain/tracker-model/Board.ts';
import { GroupNameUtil }                           from '../../domain/tracker-model/utils/GroupNameUtil.ts';
import { writeFileAtomically }                     from '../../lib/atomic-file/AtomicFile.ts';
import type { GitRunFailure }                      from '../../lib/git/@types/GitProblem.ts';
import { GitProcess }                              from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                            from '../../lib/git/GitWorktrees.ts';
import { changedTrackedPathsOf }                   from '../../lib/git/Worktrees.ts';
import { WorktreesFolder }                         from '../../shared/WorktreesFolder.ts';
import { GateRun }                                 from '../lifecycle/GateRun.ts';
import type { BuildJobObservation, SetupProgress } from './@types/BuildJobObservation.ts';
import type { JobLaunchContext }                   from './@types/JobLaunchContext.ts';
import { GroupWorktrees }                          from './GroupWorktrees.ts';
import { JobLines }                                from './JobLines.ts';
import { JobPipelines }                            from './JobPipelines.ts';
import { JOB_FILES, WorktreeJobs }                 from './WorktreeJobs.ts';

export const INSTALL_CHILD_FOLDER = 'install';

/**
 * Each prepare step runs as a line of its own, in list order, the first that does not pass stopping the rest; each step line that ended is
 * kept with its run time, which the hold that acts on the install verdict records.
 */
function setupReadingOf(
  context: JobLaunchContext, job: Readonly<Job>, prepare: readonly PipelineStep[], entity: EntityKey | undefined
): Pick<BuildJobObservation, 'setup' | 'installStepRuns'> {
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  if (existsSync(join(jobFolder, JOB_FILES.worktreeFailure))) return { setup: 'worktree-failed', installStepRuns: [] };
  if (existsSync(join(jobFolder, JOB_FILES.worktreeUnnormalised))) return { setup: 'worktree-unnormalised', installStepRuns: [] };
  if (!existsSync(WorktreeJobs.worktreeOf(context.workspace, job))) return { setup: 'creating-worktree', installStepRuns: [] };
  const installStepRuns: PipelineStepRun[] = [];
  for (const [stepIndex, step] of prepare.entries()) {
    const folderName = JobLines.stepFolderOf(INSTALL_CHILD_FOLDER, stepIndex);
    const end = JobLines.lineEndOf(context.boardChildren, join(jobFolder, folderName));
    if (JobLines.lineIsUnjudged(end)) return { setup: 'installing', installStepRuns };
    const passed = JobLines.stepPassed(context, end, jobFolder, folderName);
    installStepRuns.push(...JobLines.stepRunsOfLine({ kind: 'prepare', stepName: step.name, entity }, end, passed));
    if (!passed) return { setup: 'install-failed', installStepRuns };
  }
  return { setup: 'installed', installStepRuns };
}

function setupProgressOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline> | null): SetupProgress {
  return setupReadingOf(context, job, JobPipelines.installStepsOf(pipeline, job), JobPipelines.installEntityOf(pipeline, job)).setup;
}

/** A checkout dirty before anyone touched it is a repository whose stored files `.gitattributes` would convert; its paths stop the install. */
function recordAnUnnormalisedCheckout(context: JobLaunchContext, job: Readonly<Job>, worktree: string): void {
  const changedPaths = changedTrackedPathsOf(worktree);
  if (changedPaths === null || changedPaths.length === 0) return;
  mkdirSync(WorktreeJobs.jobFolderOf(context.workspace, job), { recursive: true });
  writeFileAtomically(join(WorktreeJobs.jobFolderOf(context.workspace, job), JOB_FILES.worktreeUnnormalised), `${changedPaths.join('\n')}\n`);
  context.log({ kind: 'fresh-worktree-differs', jobId: job.id, changedFileCount: changedPaths.length });
}

/** A group ticket's branch forks off the group's tip, so the group's worktree is created from the main line's tip at its first launch. */
function createWorktree(context: JobLaunchContext, job: Readonly<Job>): void {
  const { rootDirectory } = context.workspace;
  const { repositoryRoot } = WorktreeJobs.projectLocationOfContext(context);
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const target = job.target ?? context.mainLine;
  const { groupTargetPrefix } = context.branchNames;
  const groupName = target.startsWith(groupTargetPrefix) ? target.slice(groupTargetPrefix.length) : null;
  if (groupName !== null && !GroupNameUtil.groupNameIsWellFormed(groupName)) {
    recordWorktreeFailure(context, job, { code: 'group-name-not-portable', groupName });
    return;
  }
  const group = groupName !== null
    ? GroupWorktrees.prepareGroupWorktree(repositoryRoot, WorktreesFolder.worktreesRootOf(rootDirectory), target, context.mainLine)
    : null;
  const branchExists = GitProcess.resolvedCommitOf(repositoryRoot, `refs/heads/${WorktreeJobs.branchOf(context, job)}`) !== null;
  const run = group?.verdict === 'git-failed' ? null : GitProcess.run(repositoryRoot, branchExists
    ? ['worktree', 'add', worktree, WorktreeJobs.branchOf(context, job)]
    : ['worktree', 'add', '-b', WorktreeJobs.branchOf(context, job), worktree, target]);
  if (GitProcess.succeeded(run)) {
    recordAnUnnormalisedCheckout(context, job, worktree);
    return;
  }
  if (group?.verdict === 'git-failed') recordWorktreeFailure(context, job, group.problem);
  else recordWorktreeFailure(context, job, run === null ? { code: 'git-did-not-run' } : { code: 'worktree-add-refused', gitMessage: run.standardError.trim() });
}

function recordWorktreeFailure(context: JobLaunchContext, job: Readonly<Job>, failure: WorktreeCreationFailure): void {
  mkdirSync(WorktreeJobs.jobFolderOf(context.workspace, job), { recursive: true });
  createWorktreeFailureWriter(join(WorktreeJobs.jobFolderOf(context.workspace, job), JOB_FILES.worktreeFailure)).write(failure);
  context.log({ kind: 'worktree-creation-failed', jobId: job.id, failure });
}

/**
 * Whether the ticket's entity was set after its previous job launched: the branch and worktree hold the work of its old entity, so
 * the build starts afresh. A ticket no job worked on before has no branch to drop.
 */
function ticketEntityChangedSinceItsBranch(logRecords: readonly LogRecord[], job: Readonly<Job>): boolean {
  const ticketId = WorktreeJobs.ticketIdOf(job);
  let previousLaunchSeen = false;
  let entityChangedSinceIt = false;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.jobId === job.id) break;
    if (record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId)) {
      previousLaunchSeen = true;
      entityChangedSinceIt = false;
    }
    if (record.kind === 'entity-assigned' && record.ticketId === ticketId && previousLaunchSeen) entityChangedSinceIt = true;
  }
  return entityChangedSinceIt;
}

/** The step that failed, as git's own failure; `null` when the step ran. */
function gitStepFailureOf(directory: string, gitArguments: readonly string[]): GitRunFailure | null {
  const run = GitProcess.run(directory, gitArguments);
  return GitProcess.succeeded(run) ? null : GitProcess.failureOf(run, gitArguments);
}

/**
 * A build of a ticket moved to another entity drops the ticket's worktree and branch before its worktree is made, once per job, so
 * it builds afresh from its target. Only on a pipeline with entities; a failure is the worktree's failure, which the setup incident takes.
 */
function startAfreshInTheNewEntity(context: JobLaunchContext, board: Board, job: Readonly<Job>, jobFolder: string): void {
  if (job.kind !== 'build' || job.entity === undefined || board.pipeline()?.entities === undefined) return;
  if (existsSync(join(jobFolder, JOB_FILES.freshBranchStarted)) || existsSync(join(jobFolder, JOB_FILES.worktreeFailure))) return;
  if (!ticketEntityChangedSinceItsBranch(board.logRecordsSoFar(), job)) return;
  const { repositoryRoot } = WorktreeJobs.projectLocationOfContext(context);
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const branch = WorktreeJobs.branchOf(context, job);
  const worktreeFailure = existsSync(worktree)
    ? gitStepFailureOf(repositoryRoot, ['worktree', 'remove', '--force', worktree])
    : gitStepFailureOf(repositoryRoot, ['worktree', 'prune']);
  const branchExists = worktreeFailure === null && GitProcess.resolvedCommitOf(repositoryRoot, `refs/heads/${branch}`) !== null;
  const failure = worktreeFailure ?? (branchExists ? gitStepFailureOf(repositoryRoot, ['branch', '-D', branch]) : null);
  if (failure !== null) {
    recordWorktreeFailure(context, job, failure);
    return;
  }
  mkdirSync(jobFolder, { recursive: true });
  writeFileAtomically(join(jobFolder, JOB_FILES.freshBranchStarted), `${branch}\n`);
}

/** Created when absent; a leftover folder that git does not read as a checkout of the repository is a failure, never reused. */
function prepareWorktree(context: JobLaunchContext, job: Readonly<Job>, jobFolder: string): boolean {
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  if (existsSync(join(jobFolder, JOB_FILES.worktreeFailure))) return false;
  const { repositoryRoot } = WorktreeJobs.projectLocationOfContext(context);
  const state = GitWorktrees.worktreeStateOf(repositoryRoot, worktree);
  if (state === 'leftover') recordWorktreeFailure(context, job, { code: 'leftover-not-a-checkout', path: worktree });
  if (state === 'absent') createWorktree(context, job);
  return GitWorktrees.worktreeIsCheckoutOf(repositoryRoot, worktree);
}

/**
 * Launches the first prepare step with an instance due, once every step before it exited 0; a running or failed step launches none, and
 * a paused one runs again. A job of an entity installs with its entity's prepare steps.
 */
async function spawnNextInstallStep(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): Promise<void> {
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  const stepsPipeline = JobPipelines.stepsPipelineOf(pipeline, job);
  if (stepsPipeline === null) return;
  const confinement = GateRun.prepareConfinementOf(stepsPipeline.gates);
  for (const [stepIndex, step] of stepsPipeline.prepare.entries()) {
    const folderName = JobLines.stepFolderOf(INSTALL_CHILD_FOLDER, stepIndex);
    const end = JobLines.lineEndOf(context.boardChildren, join(jobFolder, folderName));
    if (JobLines.lineIsUnjudged(end)) {
      await JobLines.spawnLineChild(context, job, pipeline, folderName, { line: step.run, confinement, subfolder: step.in ?? null });
      return;
    }
    if (!JobLines.stepPassed(context, end, jobFolder, folderName)) return;
  }
}

export const JobPreparation = Object.freeze({
  setupReadingOf,
  setupProgressOf,
  startAfreshInTheNewEntity,
  prepareWorktree,
  spawnNextInstallStep,
});
