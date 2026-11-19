/**
 * What a starting Overseer does before its first pass, design sections 3.6 and 7.3: a lost child of a job, its Talos gone, is settled (its
 * surviving tree stopped, identity-checked, so no orphan outlives it), a job whose current instance was never launched is named for its
 * launch under the same instance, and a worktree folder no job or branch owns is named for User.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync
}                                 from 'node:fs';
import {
  basename,
  join,
  relative,
  sep
} from 'node:path';

import { GitProcess }                                       from '../../lib/git/GitProcess.ts';
import type { PlatformPorts }                               from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { InterruptionCause, Job }                      from '../../lib/tracker-model/@types/Job.ts';
import { HATCH_FOLDER, WorktreesFolder }                    from '../../shared/WorktreesFolder.ts';
import { requireProgressFile }                              from '../tracker/TrackerReader.ts';
import type { Workspace }                                   from '../tracker/Workspace.ts';
import type { BoardChildren }                               from './BoardChildren.ts';
import { CONSTITUTION_COMMITS_FOLDER, ConstitutionCommits } from './ConstitutionCommits.ts';
import { GATE_PROFILE_WORKTREES_FOLDER }                    from './GateProfiling.ts';
import { GroupWorktrees }                                   from './GroupWorktrees.ts';
import { JobLaunch }                                        from './JobLaunch.ts';
import { PIPELINE_AGENT_SNAPSHOT_FOLDER }                   from './PipelineAgentSessions.ts';
import { PIPELINE_CHECK_WORKTREES_FOLDER }                  from './PipelineChecking.ts';
import { settleLostChild }                                  from './TalosStart.ts';

export interface RegroupingReport {
  /** `cause` is `null` while the forced stop of the child's tree is refused. */
  lost:              { jobId: string; instance: number; cause: InterruptionCause | null }[];
  /** Jobs whose current instance was never launched: the first pass launches that same instance, and Talos launches it once. */
  respawnJobIds:     string[];
  leftoverWorktrees: string[];
}

/**
 * The Overseer's own folders under the worktrees root: the sessions' working folders, the jobs' Hatch folders, one per job, the pipeline
 * agent's snapshots, and the gate profiles' and pipeline checks' worktrees, which their start sweeps remove.
 */
const OVERSEER_OWNED_FOLDERS: ReadonlySet<string> = new Set([
  'sessions', HATCH_FOLDER, PIPELINE_AGENT_SNAPSHOT_FOLDER, GATE_PROFILE_WORKTREES_FOLDER, PIPELINE_CHECK_WORKTREES_FOLDER,
]);

const WORKTREE_LINE_PREFIX = 'worktree ';
const BRANCH_LINE_PREFIX   = 'branch ';
const CHILD_FOLDER_SEPARATOR = '/';

/** The forced stops of a lost child's tree that were refused, and the tree's process ids at the last one, its root first. */
export interface ForcedStopRefusals {
  refusals:       number;
  treeProcessIds: number[];
}

/** Beside the child's record, where the settling of a lost child keeps it. */
function refusedForcedStopsFileOf(childFolder: string, instance: number): string {
  return join(childFolder, `child-${instance}.refused-forced-stops`);
}

function refusedForcedStopsOf(childFolder: string, instance: number): ForcedStopRefusals {
  try {
    const stored = JSON.parse(readFileSync(refusedForcedStopsFileOf(childFolder, instance), 'utf8')) as Partial<ForcedStopRefusals>;
    return { refusals: typeof stored.refusals === 'number' ? stored.refusals : 0, treeProcessIds: Array.isArray(stored.treeProcessIds) ? stored.treeProcessIds : [] };
  } catch {
    return { refusals: 0, treeProcessIds: [] };
  }
}

/**
 * A lost child's cause, settled once and stored beside its record as the sweep after a lost Talos stores it: a foreign boot is a reboot, a
 * surviving tree is stopped and the cause is the lost commander (`watcher-lost` until the rename), otherwise the agent crashed with it. A
 * refused forced stop stores no cause and answers `null`, counted and tried again only when `retryRefusedStop` says so.
 */
function settleLostChildIn(
  boardFolder: string, ports: PlatformPorts, childFolder: string, instance: number, retryRefusedStop = true
): InterruptionCause | null {
  return settleLostChild(ports, {
    boardFolder,
    childFolder:       relative(boardFolder, childFolder).split(sep).join(CHILD_FOLDER_SEPARATOR),
    instance,
    talosBootIdentity: null,
    retryRefusedStop,
  });
}

function canonicalPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** The folders `git worktree list` shows checked out on a branch. */
function branchOwnedWorktreesOf(repositoryRoot: string): Set<string> {
  const listing = GitProcess.run(repositoryRoot, ['worktree', 'list', '--porcelain']);
  const owned = new Set<string>();
  if (!GitProcess.succeeded(listing)) return owned;
  let worktree: string | null = null;
  for (const line of listing.standardOutput.split('\n')) {
    if (line.startsWith(WORKTREE_LINE_PREFIX)) worktree = canonicalPathOf(line.slice(WORKTREE_LINE_PREFIX.length));
    if (line.startsWith(BRANCH_LINE_PREFIX) && worktree !== null) owned.add(worktree);
  }
  return owned;
}

/** The folders directly under `folder`, as paths. */
function foldersIn(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(folder, entry.name));
}

/**
 * The worktree folders no live job and no branch owns. A refresh's worktree belongs to its live refresh job, and a constitution commit's
 * worktree, one level down under its own folder, to its live constitution commit job.
 */
function leftoverWorktreesOf(workspace: Workspace, jobs: readonly Readonly<Job>[]): string[] {
  const worktreesRoot = WorktreesFolder.worktreesRootOf(workspace.rootDirectory);
  if (!existsSync(worktreesRoot)) return [];
  const refreshOwned = jobs.filter((job) => job.kind === 'refresh' && job.target !== null).map((job) => GroupWorktrees.refreshWorktreeOf(worktreesRoot, job.target ?? ''));
  const commitOwned  = jobs.filter((job) => job.kind === 'constitution-commit').map((job) => ConstitutionCommits.commitWorktreeOf(worktreesRoot, job.id));
  const jobOwned     = new Set([...jobs.filter(JobLaunch.isWorktreeJob).map((job) => JobLaunch.worktreeOf(workspace, job)), ...refreshOwned, ...commitOwned].map(canonicalPathOf));
  const branchOwned = branchOwnedWorktreesOf(workspace.rootDirectory);
  const commitFolder = join(worktreesRoot, CONSTITUTION_COMMITS_FOLDER);
  return [...foldersIn(worktreesRoot).filter((folder) => !OVERSEER_OWNED_FOLDERS.has(basename(folder)) && folder !== commitFolder), ...foldersIn(commitFolder)]
    .map(canonicalPathOf)
    .filter((folder) => !jobOwned.has(folder) && !branchOwned.has(folder))
    .sort();
}

function awaitsItsSpawn(job: Readonly<Job>): boolean {
  return (job.state === 'launching' && !JobLaunch.isWorktreeJob(job)) || job.state === 'running';
}

/** Reads and acts outside the lock; the first pass's one hold then applies everything it found. A live child is read by the passes alone. */
function regroup(children: BoardChildren, ports: PlatformPorts, workspace: Workspace): RegroupingReport {
  const jobs   = requireProgressFile(workspace).jobs ?? [];
  const report: RegroupingReport = { lost: [], respawnJobIds: [], leftoverWorktrees: leftoverWorktreesOf(workspace, jobs) };
  children.beginPass();
  for (const job of jobs.filter((candidate) => candidate.role !== null)) {
    const jobFolder = children.jobFolderOf(job.id);
    const liveness  = children.livenessOf(jobFolder, job.childInstance);
    if (liveness.verdict === 'lost') {
      report.lost.push({ jobId: job.id, instance: job.childInstance, cause: settleLostChildIn(workspace.trackerDirectory, ports, jobFolder, job.childInstance) });
    } else if (liveness.verdict === 'unlaunched' && awaitsItsSpawn(job)) {
      report.respawnJobIds.push(job.id);
    }
  }
  return report;
}

export const Regrouping = Object.freeze({
  regroup, settleLostChildIn, refusedForcedStopsOf, leftoverWorktreesOf
});
