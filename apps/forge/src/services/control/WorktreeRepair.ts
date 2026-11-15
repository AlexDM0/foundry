/**
 * The code-implemented worktree repairs of design section 8.3, run inside the hold that records them so no launch races them. `reinstall`
 * changes nothing on disk: the next launch on the worktree reruns the install line. `recreate` saves the worktree's changes, tracked and
 * untracked, as `recreate-<n>.patch` in the job folder before it removes the worktree, which the next launch creates again from the branch.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { join }                    from 'node:path';
import { GitProcess }              from '../../lib/git/GitProcess.ts';
import { GitWorktrees }            from '../../lib/git/GitWorktrees.ts';
import { removeStaleIndexLock }    from '../../lib/git/Worktrees.ts';
import type { WorktreeRepairStep } from '../../shared/@types/ControlCommand.ts';

export interface WorktreeRepairRequest {
  repositoryRoot: string;
  worktreePath:   string;
  step:           WorktreeRepairStep;
  /** Where `recreate` saves its patch; `null` when no job ever ran on the worktree. */
  jobFolder:      string | null;
}

export type WorktreeRepairVerdict =
  | { verdict: 'repaired'; patchPath: string | null }
  | { verdict: 'uncommitted-work-not-saved' }
  | { verdict: 'git-failed'; reason: string };

const RECREATE_PATCH = /^recreate-(\d+)\.patch$/;

const NO_INDEX_DIFF_DIFFERS_EXIT_CODE = 1;

function failed(directory: string, gitArguments: readonly string[]): WorktreeRepairVerdict | null {
  const run = GitProcess.run(directory, gitArguments);
  return GitProcess.succeeded(run) ? null : { verdict: 'git-failed', reason: GitProcess.failureReasonOf(run, gitArguments) };
}

/** `git diff HEAD` and every untracked file as an addition, or `null` when git cannot read the worktree. */
function changesOf(worktreePath: string): string | null {
  const ceiling   = GitWorktrees.ceilingOf(worktreePath);
  const tracked   = GitProcess.run(worktreePath, ['diff', '--binary', 'HEAD'], 'hooks-off', undefined, ceiling);
  const untracked = GitProcess.run(worktreePath, ['ls-files', '--others', '--exclude-standard', '-z'], 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(tracked) || !GitProcess.succeeded(untracked)) return null;
  const additions = untracked.standardOutput.split('\0').filter((path) => path !== '').map((path) => {
    const addition = GitProcess.run(worktreePath, ['diff', '--binary', '--no-index', '--', '/dev/null', path], 'hooks-off', undefined, ceiling);
    // `--no-index` exits 1 when the sides differ, which they always do here; anything else means the file was not read.
    return addition?.exitCode === NO_INDEX_DIFF_DIFFERS_EXIT_CODE ? addition.standardOutput : null;
  });
  if (additions.includes(null)) return null;
  return [tracked.standardOutput, ...additions].join('');
}

function nextPatchPathIn(jobFolder: string): string {
  const names   = existsSync(jobFolder) ? readdirSync(jobFolder) : [];
  const numbers = names.flatMap((name) => {
    const match = RECREATE_PATCH.exec(name);
    return match === null ? [] : [Number(match[1])];
  });
  return join(jobFolder, `recreate-${Math.max(0, ...numbers) + 1}.patch`);
}

/** Saved, or nothing to save; `null` when there are changes and they could not be written. */
function savedChangesOf(worktreePath: string, jobFolder: string | null): { patchPath: string | null } | null {
  const changes = changesOf(worktreePath);
  if (changes === '') return { patchPath: null };
  if (changes === null || jobFolder === null) return null;
  try {
    mkdirSync(jobFolder, { recursive: true });
    const patchPath = nextPatchPathIn(jobFolder);
    writeFileSync(patchPath, changes, { flag: 'wx' });
    return { patchPath };
  } catch {
    return null;
  }
}

function recreate(request: WorktreeRepairRequest): WorktreeRepairVerdict {
  if (!existsSync(request.worktreePath)) return failed(request.repositoryRoot, ['worktree', 'prune']) ?? { verdict: 'repaired', patchPath: null };
  const saved = savedChangesOf(request.worktreePath, request.jobFolder);
  if (saved === null) return { verdict: 'uncommitted-work-not-saved' };
  const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: request.repositoryRoot, worktreePath: request.worktreePath, force: 'force' });
  return removal.verdict === 'removed' ? { verdict: 'repaired', patchPath: saved.patchPath } : { verdict: 'git-failed', reason: removal.reason };
}

function unlock(worktreePath: string): WorktreeRepairVerdict {
  const removal = removeStaleIndexLock(worktreePath);
  return removal.verdict === 'refused' ? { verdict: 'git-failed', reason: removal.reason } : { verdict: 'repaired', patchPath: null };
}

function repair(request: WorktreeRepairRequest): WorktreeRepairVerdict {
  switch (request.step) {
    case 'prune':
      return failed(request.repositoryRoot, ['worktree', 'prune']) ?? { verdict: 'repaired', patchPath: null };
    case 'reinstall':
      return { verdict: 'repaired', patchPath: null };
    case 'recreate':
      return recreate(request);
    case 'unlock':
      return unlock(request.worktreePath);
  }
}

export const WorktreeRepair = Object.freeze({ repair });
